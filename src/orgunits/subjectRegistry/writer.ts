/**
 * TRACK B, B2.2 - THE APPEND-ONLY DISCOVERY-SUBJECT REGISTRY WRITER.
 *
 * Every operation has two forms over ONE shared judgement:
 *
 *   plan*    - a DRY RUN. Opens a READ ONLY, REPEATABLE READ transaction (the
 *              CLI uses the readonly role, which cannot write at all), loads
 *              the subject's bounded neighbourhood, appends the would-be
 *              records IN MEMORY, and runs the B2.1 validator. Issues no
 *              INSERT, returns no reusable token. A successful plan promises
 *              nothing about a later execution.
 *   execute* - one READ COMMITTED transaction on the WRITER capability: check
 *              the session (never a superuser, never the table owner, must
 *              hold nwf_discovery_subject_writer), SET LOCAL ROLE to exactly
 *              that capability, take the subject's transaction-scoped advisory
 *              lock, RELOAD and RE-JUDGE from scratch, then INSERT. Any
 *              refusal rolls back everything, so a proposal never leaves an
 *              orphan subject.
 *
 * Reviews follow the same shape (`planReview` / `recordReview`) but the write
 * form requires a TrustedReviewerContext, which has no production
 * constructor (see reviewAuthority.ts). There is no merge, no update, no
 * delete, no bulk path and no generic SQL anywhere in this file.
 *
 * B2.3 (ADR 0023) adds the ATTESTED review path over the SAME judgement:
 *
 *   prepareReview        - a DRY RUN that also emits the unsigned review
 *                          request, bound to this database's environment id,
 *                          the subject state digest and the evidence snapshot;
 *   appendAttestedReview - ONE transaction on the REVIEWER capability: verify
 *                          the envelope against the pinned trust set, check
 *                          the environment and the DATABASE clock, lock the
 *                          subject, reload, refuse an integrity hold, re-run
 *                          the B2.2 judgement, recompute and compare every
 *                          bound digest, then insert the review and its
 *                          attestation together. Any refusal rolls back both.
 *
 * Neither creates, implies or records research permission, canonical
 * identity, an equivalence or any outreach state.
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';

import {
  REVIEW_ACTION_AUDIENCE,
  REVIEW_CONTRACT_VERSION,
  REVIEW_MAX_CLOCK_SKEW_SECONDS,
  REVIEW_PROTOCOL,
  REVIEW_REQUEST_DOCUMENT,
  ReviewProtocolError,
  type ReviewProtocolCode,
  type ReviewRequestDocument,
} from '../subjectReview/protocol.js';
import { ReviewTrustSet } from '../subjectReview/trust.js';
import { verifySignedReviewPayload } from '../subjectReview/verify.js';

import {
  reviewTargetKeyOf,
  validateIdentityGraph,
  type IdentityFinding,
} from '../identity/validate.js';
import type {
  IdentityClaimRecord,
  RelationshipClaimRecord,
  ReviewOutcome,
  SubjectReviewRecord,
} from '../identity/vocabulary.js';
import {
  certifiedChainHead,
  deriveSubjectReadModel,
  subjectStateDigest,
  type SubjectGraph,
  type SubjectReadModel,
} from './readModel.js';
import { verifyReviewAttestations } from './reviewAttestation.js';
import { ReviewEvidenceTooLarge, reviewEvidenceOf } from './reviewEvidence.js';
import {
  REGISTRY_REVIEWER_ROLE,
  REGISTRY_WRITER_ROLE,
  STATE_DIGEST_SHAPE,
  UUID_SHAPE,
  identityClaimRecord,
  provenanceUuids,
  relationshipClaimRecord,
  subjectRecord,
  type ClaimRequest,
  type ProposeRequest,
  type RelateRequest,
} from './requests.js';
import { TrustedReviewerContext } from './reviewAuthority.js';
import {
  SubjectGraphBoundExceeded,
  databaseNow,
  loadSubjectGraph,
  reviewEnvironmentId,
  subjectExists,
  subjectOfClaim,
  type Queryable,
} from './store.js';

/** The class of the transaction-scoped advisory lock every writer takes per subject. */
export const SUBJECT_LOCK_CLASS = 140014;

export type RegistryRefusalCode =
  | 'INPUT_INVALID'
  | 'VALIDATION_FAILED'
  | 'SUBJECT_ALREADY_EXISTS'
  | 'SUBJECT_NOT_FOUND'
  | 'TARGET_NOT_FOUND'
  | 'DUPLICATE_ASSERTION'
  | 'SOURCE_REFERENCE_UNKNOWN'
  | 'REVIEW_CHAIN_INVALID'
  | 'STALE_REVIEW_HEAD'
  | 'STALE_SUBJECT_STATE'
  | 'REVIEW_REASON_REQUIRED'
  | 'REVIEW_CONFLICT_INTRODUCED'
  | 'GRAPH_BOUND_EXCEEDED'
  | 'WRITER_SESSION_REFUSED'
  | 'DATABASE_REFUSED'
  // B2.3 - the attested review path.
  | 'REVIEW_ATTESTATION_REQUIRED'
  | 'REVIEWER_SESSION_REFUSED'
  | 'REVIEW_INTEGRITY_HOLD'
  | 'ENVIRONMENT_UNKNOWN'
  | 'ENVIRONMENT_MISMATCH'
  | 'ENVELOPE_NOT_YET_VALID'
  | 'ENVELOPE_EXPIRED'
  | 'ENVELOPE_REPLAYED'
  | 'EVIDENCE_CHANGED'
  | ReviewProtocolCode;

/** A refusal: nothing was written. `detail` never carries credentials or row contents beyond ids. */
export class RegistryRefusal extends Error {
  constructor(
    readonly code: RegistryRefusalCode,
    readonly detail: string,
    readonly findings: readonly IdentityFinding[] = [],
  ) {
    super(`${code}: ${detail}`);
    this.name = 'RegistryRefusal';
  }
}

export type RegistryOperation = 'propose' | 'claim' | 'relate' | 'review';

export interface RegistryResult {
  readonly operation: RegistryOperation;
  readonly mode: 'DRY_RUN' | 'EXECUTED';
  readonly subjectId: string;
  /** The ids the operation wrote (EXECUTED) or would write with (DRY_RUN; regenerated on execution). */
  readonly recordIds: Readonly<Record<string, string>>;
  /** Findings of the post-operation graph that involve the subject. Never a verdict. */
  readonly findings: readonly IdentityFinding[];
  /** The subject as it reads after the operation (or would, for a dry run). */
  readonly readModel: SubjectReadModel;
}

function requireUuid(value: string, what: string): void {
  if (!UUID_SHAPE.test(value)) {
    throw new RegistryRefusal('INPUT_INVALID', `${what} must be a lower-case UUID.`);
  }
}

/** Refuses on any INVALID finding, naming the most specific refusal it can. */
function judge(graph: SubjectGraph, newIds: readonly string[]): IdentityFinding[] {
  const validation = validateIdentityGraph(graph.input);
  const invalid = validation.findings.filter((f) => f.severity === 'INVALID');
  if (invalid.length > 0) {
    const onNew = invalid.filter((f) => newIds.includes(f.recordId));
    // The validator flags the LATER id of a colliding pair, which may be the
    // existing row. The unique index guarantees the stored rows hold no
    // duplicate, so any duplicate here was introduced by the new record.
    if (invalid.some((f) => f.code === 'DUPLICATE_ASSERTION')) {
      throw new RegistryRefusal(
        'DUPLICATE_ASSERTION',
        'the same source already supports exactly this claim for this subject; nothing was written.',
        invalid,
      );
    }
    if (onNew.some((f) => f.code === 'RELATIONSHIP_TARGET_UNKNOWN')) {
      throw new RegistryRefusal(
        'TARGET_NOT_FOUND',
        'the relationship target is not a known subject or ECHE source row.',
        invalid,
      );
    }
    throw new RegistryRefusal(
      'VALIDATION_FAILED',
      `the B2.1 validator reports ${invalid.length} INVALID finding(s); nothing was written.`,
      invalid,
    );
  }
  const focal = graph.focalSubjectId;
  return validation.findings.filter((f) => f.subjectId === focal || newIds.includes(f.recordId));
}

function withRecords(
  graph: SubjectGraph,
  add: {
    identityClaims?: IdentityClaimRecord[];
    relationshipClaims?: RelationshipClaimRecord[];
    reviews?: SubjectReviewRecord[];
  },
): SubjectGraph {
  return {
    ...graph,
    input: {
      ...graph.input,
      identityClaims: [...graph.input.identityClaims, ...(add.identityClaims ?? [])],
      relationshipClaims: [...graph.input.relationshipClaims, ...(add.relationshipClaims ?? [])],
      reviews: [...graph.input.reviews, ...(add.reviews ?? [])],
    },
  };
}

async function loadOrRefuse(
  q: Queryable,
  subjectId: string,
  options: Parameters<typeof loadSubjectGraph>[2],
): Promise<SubjectGraph> {
  try {
    const graph = await loadSubjectGraph(q, subjectId, options);
    if (graph === null) {
      throw new RegistryRefusal('SUBJECT_NOT_FOUND', `no discovery subject ${subjectId}.`);
    }
    return graph;
  } catch (error) {
    if (error instanceof SubjectGraphBoundExceeded) {
      throw new RegistryRefusal('GRAPH_BOUND_EXCEEDED', error.message);
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// The judgements, shared by dry run and execution.
// ---------------------------------------------------------------------------

interface Judged {
  readonly graph: SubjectGraph;
  readonly recordIds: Record<string, string>;
  readonly findings: IdentityFinding[];
  /** The graph as it was loaded, before the would-be record was appended. */
  readonly before?: SubjectGraph;
}

/** B2.3: what a judgement loads, and whether an integrity hold refuses it. */
interface JudgeLoad {
  readonly attestations: 'LOAD' | 'SKIP';
  /** When set, an INTEGRITY_HOLD (or unevaluated attestations) on the subject refuses the review. */
  readonly refuseOnHold?: ReviewTrustSet;
}

const LOAD: JudgeLoad = { attestations: 'LOAD' };
const SKIP: JudgeLoad = { attestations: 'SKIP' };

async function judgePropose(
  q: Queryable,
  r: ProposeRequest,
  asOf: string,
  claimId: string,
): Promise<Judged> {
  requireUuid(r.subjectId, '--subject-id');
  for (const id of provenanceUuids(r.provenance)) requireUuid(id, 'the source id');
  if (await subjectExists(q, r.subjectId)) {
    throw new RegistryRefusal(
      'SUBJECT_ALREADY_EXISTS',
      `subject ${r.subjectId} already exists; a retry never registers it twice.`,
    );
  }
  const claim = identityClaimRecord(
    claimId,
    r.subjectId,
    { claimKind: 'NAME', nameText: r.name, nameLanguage: r.nameLanguage },
    r.provenance,
  );
  const graph: SubjectGraph = {
    focalSubjectId: r.subjectId,
    input: {
      subjects: [subjectRecord(r)],
      identityClaims: [claim],
      relationshipClaims: [],
      reviews: [],
      knownEcheRowKeys: [],
      asOf,
    },
    recordedAt: {},
  };
  const findings = judge(graph, [r.subjectId, claimId]);
  return { graph, recordIds: { subject: r.subjectId, nameClaim: claimId }, findings };
}

async function judgeClaim(
  q: Queryable,
  r: ClaimRequest,
  asOf: string,
  claimId: string,
  load: JudgeLoad,
): Promise<Judged> {
  requireUuid(r.subjectId, '--subject-id');
  for (const id of provenanceUuids(r.provenance)) requireUuid(id, 'the source id');
  const before = await loadOrRefuse(q, r.subjectId, { asOf, attestations: load.attestations });
  const claim = identityClaimRecord(claimId, r.subjectId, r.payload, r.provenance);
  const graph = withRecords(before, { identityClaims: [claim] });
  return { graph, recordIds: { identityClaim: claimId }, findings: judge(graph, [claimId]) };
}

async function judgeRelate(
  q: Queryable,
  r: RelateRequest,
  asOf: string,
  claimId: string,
  load: JudgeLoad,
): Promise<Judged> {
  requireUuid(r.subjectId, '--subject-id');
  for (const id of provenanceUuids(r.provenance)) requireUuid(id, 'the source id');
  if ('targetSubjectId' in r.target) requireUuid(r.target.targetSubjectId, '--target-subject-id');
  const before = await loadOrRefuse(q, r.subjectId, {
    asOf,
    attestations: load.attestations,
    extraSubjectIds: 'targetSubjectId' in r.target ? [r.target.targetSubjectId] : [],
    extraEcheRowKeys: 'targetEcheRowKey' in r.target ? [r.target.targetEcheRowKey] : [],
  });
  const claim = relationshipClaimRecord(claimId, r);
  const graph = withRecords(before, { relationshipClaims: [claim] });
  return { graph, recordIds: { relationshipClaim: claimId }, findings: judge(graph, [claimId]) };
}

export type ReviewTarget =
  | { readonly kind: 'SUBJECT'; readonly id: string }
  | { readonly kind: 'IDENTITY_CLAIM'; readonly id: string }
  | { readonly kind: 'RELATIONSHIP_CLAIM'; readonly id: string };

export interface ReviewRequest {
  readonly target: ReviewTarget;
  readonly outcome: ReviewOutcome;
  /** The review the decision supersedes, as the reviewer saw it; null for "no review yet". */
  readonly expectedHeadReviewId: string | null;
  /** `stateDigest` of the subject as the reviewer saw it. */
  readonly expectedStateDigest: string;
  readonly reason: string | null;
}

/** Never inserted: the actor key a dry-run review is validated under. */
const REVIEW_PREVIEW_ACTOR_KEY = 'review-preview';

function targetKeyOf(target: ReviewTarget): string {
  if (target.kind === 'SUBJECT') return `subject:${target.id}`;
  if (target.kind === 'IDENTITY_CLAIM') return `identity_claim:${target.id}`;
  return `relationship_claim:${target.id}`;
}

async function judgeReview(
  q: Queryable,
  r: ReviewRequest,
  asOf: string,
  reviewId: string,
  actorKey: string,
  load: JudgeLoad = LOAD,
): Promise<Judged> {
  requireUuid(r.target.id, 'the review target');
  if (r.expectedHeadReviewId !== null) requireUuid(r.expectedHeadReviewId, '--expect-head');
  if (!STATE_DIGEST_SHAPE.test(r.expectedStateDigest)) {
    throw new RegistryRefusal('INPUT_INVALID', '--expect-state must be a 64-hex state digest.');
  }
  if (r.outcome !== 'CONFIRMED' && (r.reason === null || r.reason.length === 0)) {
    throw new RegistryRefusal(
      'REVIEW_REASON_REQUIRED',
      `a ${r.outcome} review must state its --reason.`,
    );
  }

  const subjectId =
    r.target.kind === 'SUBJECT'
      ? r.target.id
      : await subjectOfClaim(
          q,
          r.target.kind === 'IDENTITY_CLAIM' ? 'identity' : 'relationship',
          r.target.id,
        );
  if (subjectId === null || !(await subjectExists(q, subjectId))) {
    throw new RegistryRefusal('TARGET_NOT_FOUND', `no review target ${r.target.id}.`);
  }
  const before = await loadOrRefuse(q, subjectId, { asOf, attestations: load.attestations });
  if (load.refuseOnHold !== undefined) {
    // Where an integrity failure exists, no further decision may build on it
    // until a separately authorised re-evaluation exists (G3).
    const state = verifyReviewAttestations(before, load.refuseOnHold).state;
    if (state === 'INTEGRITY_HOLD' || state === 'NOT_EVALUATED') {
      throw new RegistryRefusal(
        'REVIEW_INTEGRITY_HOLD',
        `the review history of subject ${subjectId} does not verify (${state}); ` +
          'no decision can extend it until it is re-evaluated.',
      );
    }
  }
  const beforeValidation = validateIdentityGraph(before.input);
  const targetKey = targetKeyOf(r.target);
  const head = certifiedChainHead(before.input.reviews, beforeValidation.findings, targetKey);
  if (head.state === 'CHAIN_INVALID') {
    throw new RegistryRefusal(
      'REVIEW_CHAIN_INVALID',
      `the review chain of ${targetKey} is invalid; no decision can extend it.`,
    );
  }
  if (head.headReviewId !== r.expectedHeadReviewId) {
    throw new RegistryRefusal(
      'STALE_REVIEW_HEAD',
      `the current review head of ${targetKey} is ${head.headReviewId ?? 'none'}, not ` +
        `${r.expectedHeadReviewId ?? 'none'}; re-inspect the subject before deciding.`,
    );
  }
  if (subjectStateDigest(before) !== r.expectedStateDigest) {
    throw new RegistryRefusal(
      'STALE_SUBJECT_STATE',
      'the subject gained or lost records since the reviewer inspected it; re-inspect it.',
    );
  }

  const review: SubjectReviewRecord = {
    id: reviewId,
    reviewedSubjectId: r.target.kind === 'SUBJECT' ? r.target.id : null,
    reviewedIdentityClaimId: r.target.kind === 'IDENTITY_CLAIM' ? r.target.id : null,
    reviewedRelationshipClaimId: r.target.kind === 'RELATIONSHIP_CLAIM' ? r.target.id : null,
    reviewOutcome: r.outcome,
    supersedesReviewId: r.expectedHeadReviewId,
    actorKey,
    reviewedAt: asOf,
    reason: r.reason,
  };
  if (reviewTargetKeyOf(review) !== targetKey) {
    throw new RegistryRefusal('INPUT_INVALID', 'the review names more than one target.');
  }
  const graph = withRecords(before, { reviews: [review] });
  const findings = judge(graph, [reviewId]);

  // A confirmation that makes two different kinds CONFIRMED at once is not
  // silently accepted, even though B2.1 grades that state CONFLICT rather
  // than INVALID: the reviewer must first withdraw or reject the other one.
  const kindConflicts = (v: ReturnType<typeof validateIdentityGraph>) =>
    v.findings.filter((f) => f.code === 'REVIEWED_ENTITY_KIND_CONFLICT').length;
  if (kindConflicts(validateIdentityGraph(graph.input)) > kindConflicts(beforeValidation)) {
    throw new RegistryRefusal(
      'REVIEW_CONFLICT_INTRODUCED',
      'this confirmation would leave two different entity kinds CONFIRMED for one subject.',
    );
  }
  return { graph, recordIds: { review: reviewId }, findings, before };
}

function result(
  operation: RegistryOperation,
  mode: RegistryResult['mode'],
  j: Judged,
  trust?: ReviewTrustSet,
) {
  return {
    operation,
    mode,
    subjectId: j.graph.focalSubjectId,
    recordIds: j.recordIds,
    findings: j.findings,
    readModel: deriveSubjectReadModel(j.graph, trust),
  } satisfies RegistryResult;
}

// ---------------------------------------------------------------------------
// Dry run: a READ ONLY snapshot, no lock, no write.
// ---------------------------------------------------------------------------

async function inReadOnlySnapshot<T>(pool: pg.Pool, fn: (c: pg.PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

export function planPropose(pool: pg.Pool, r: ProposeRequest): Promise<RegistryResult> {
  return inReadOnlySnapshot(pool, async (c) =>
    result('propose', 'DRY_RUN', await judgePropose(c, r, await databaseNow(c), randomUUID())),
  );
}

export function planClaim(pool: pg.Pool, r: ClaimRequest): Promise<RegistryResult> {
  return inReadOnlySnapshot(pool, async (c) =>
    result('claim', 'DRY_RUN', await judgeClaim(c, r, await databaseNow(c), randomUUID(), LOAD)),
  );
}

export function planRelate(pool: pg.Pool, r: RelateRequest): Promise<RegistryResult> {
  return inReadOnlySnapshot(pool, async (c) =>
    result('relate', 'DRY_RUN', await judgeRelate(c, r, await databaseNow(c), randomUUID(), LOAD)),
  );
}

export function planReview(pool: pg.Pool, r: ReviewRequest): Promise<RegistryResult> {
  return inReadOnlySnapshot(pool, async (c) =>
    result(
      'review',
      'DRY_RUN',
      await judgeReview(c, r, await databaseNow(c), randomUUID(), REVIEW_PREVIEW_ACTOR_KEY),
    ),
  );
}

// ---------------------------------------------------------------------------
// Execution.
// ---------------------------------------------------------------------------

/**
 * The writer session check. Refuses a superuser or table-owner connection -
 * the writer must not be the owner path wearing a different name - and a
 * session that does not hold the capability. Then narrows the transaction to
 * exactly that capability.
 */
async function enterWriterCapability(client: pg.PoolClient): Promise<void> {
  const { rows } = await client.query<{ super: boolean; writer: boolean; owner: boolean }>(
    `SELECT r.rolsuper AS super,
            pg_has_role(session_user, $1, 'MEMBER') AS writer,
            pg_has_role(session_user, c.relowner, 'MEMBER') AS owner
       FROM pg_roles r, pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE r.rolname = session_user AND n.nspname = 'public' AND c.relname = 'discovery_subjects'`,
    [REGISTRY_WRITER_ROLE],
  );
  const session = rows[0];
  if (session === undefined || session.super) {
    throw new RegistryRefusal('WRITER_SESSION_REFUSED', 'a superuser connection is refused.');
  }
  if (session.owner) {
    throw new RegistryRefusal('WRITER_SESSION_REFUSED', 'a table-owner connection is refused.');
  }
  if (!session.writer) {
    throw new RegistryRefusal(
      'WRITER_SESSION_REFUSED',
      `the connection does not hold ${REGISTRY_WRITER_ROLE}.`,
    );
  }
  await client.query(`SET LOCAL ROLE ${REGISTRY_WRITER_ROLE}`);
}

async function lockSubject(client: Queryable, subjectId: string): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [
    SUBJECT_LOCK_CLASS,
    subjectId,
  ]);
}

/** Maps a database refusal of an INSERT onto a registry refusal, by SQLSTATE only. */
function mapDatabaseError(error: unknown, operation: RegistryOperation): never {
  const code = (error as { code?: unknown }).code;
  const constraint = (error as { constraint?: unknown }).constraint;
  if (code === '23505') {
    if (constraint === 'subject_review_attestations_nonce_uidx') {
      throw new RegistryRefusal('ENVELOPE_REPLAYED', 'this envelope nonce was already used.');
    }
    if (operation === 'review') {
      throw new RegistryRefusal('STALE_REVIEW_HEAD', 'another review extended this chain first.');
    }
    if (operation === 'propose' && constraint === 'discovery_subjects_pkey') {
      throw new RegistryRefusal('SUBJECT_ALREADY_EXISTS', 'the subject id is already registered.');
    }
    throw new RegistryRefusal('DUPLICATE_ASSERTION', 'the database refused a duplicate assertion.');
  }
  if (code === '23503') {
    throw new RegistryRefusal(
      'SOURCE_REFERENCE_UNKNOWN',
      `a referenced row does not exist (${typeof constraint === 'string' ? constraint : 'foreign key'}).`,
    );
  }
  if (code === '42501') {
    throw new RegistryRefusal('DATABASE_REFUSED', 'the database refused the privilege (42501).');
  }
  if (typeof code === 'string' && /^(22|23|55)/.test(code)) {
    throw new RegistryRefusal('DATABASE_REFUSED', `the database refused the row (${code}).`);
  }
  throw error;
}

async function inWriterTransaction<T>(
  pool: pg.Pool,
  operation: RegistryOperation,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await enterWriterCapability(client);
    const value = await fn(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof RegistryRefusal) throw error;
    mapDatabaseError(error, operation);
  } finally {
    client.release();
  }
}

const SUBJECT_INSERT = `INSERT INTO discovery_subjects
    (id, registered_kind, registered_by_actor_key, registration_note)
  VALUES ($1, $2, $3, $4)`;

const IDENTITY_CLAIM_INSERT = `INSERT INTO discovery_subject_identity_claims
    (id, subject_id, claim_kind, name_text, name_language, claimed_kind, website_url,
     identifier_scheme, identifier_value, source_type, source_page_evidence_id,
     source_website_claim_id, source_url, source_version_ref, observed_at, claim_basis,
     recorded_by_actor_key)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`;

const RELATIONSHIP_CLAIM_INSERT = `INSERT INTO discovery_subject_relationship_claims
    (id, subject_id, predicate, target_subject_id, target_eche_row_key, source_type,
     source_page_evidence_id, source_website_claim_id, source_url, source_version_ref,
     observed_at, claim_basis, recorded_by_actor_key)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`;

const REVIEW_INSERT = `INSERT INTO discovery_subject_reviews
    (id, reviewed_subject_id, reviewed_identity_claim_id, reviewed_relationship_claim_id,
     review_outcome, supersedes_review_id, actor_key, reviewed_at, reason)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`;

function identityClaimParams(c: IdentityClaimRecord): unknown[] {
  return [
    c.id,
    c.subjectId,
    c.claimKind,
    c.nameText,
    c.nameLanguage,
    c.claimedKind,
    c.websiteUrl,
    c.identifierScheme,
    c.identifierValue,
    c.sourceType,
    c.sourcePageEvidenceId,
    c.sourceWebsiteClaimId,
    c.sourceUrl,
    c.sourceVersionRef,
    c.observedAt,
    c.claimBasis,
    c.recordedByActorKey,
  ];
}

function newRecord<T extends { id: string }>(records: readonly T[], id: string): T {
  const record = records.find((r) => r.id === id);
  if (record === undefined) throw new Error(`internal: record ${id} vanished before insert`);
  return record;
}

/** Registers one subject and its first NAME claim, atomically. */
export function executePropose(pool: pg.Pool, r: ProposeRequest): Promise<RegistryResult> {
  return inWriterTransaction(pool, 'propose', async (c) => {
    await lockSubject(c, r.subjectId);
    const judged = await judgePropose(c, r, await databaseNow(c), randomUUID());
    const subject = judged.graph.input.subjects[0]!;
    await c.query(SUBJECT_INSERT, [
      subject.id,
      subject.registeredKind,
      subject.registeredByActorKey,
      subject.registrationNote,
    ]);
    await c.query(
      IDENTITY_CLAIM_INSERT,
      identityClaimParams(
        newRecord(judged.graph.input.identityClaims, judged.recordIds['nameClaim']!),
      ),
    );
    return result('propose', 'EXECUTED', judged);
  });
}

/** Appends one identity claim to an existing subject. */
export function executeClaim(pool: pg.Pool, r: ClaimRequest): Promise<RegistryResult> {
  return inWriterTransaction(pool, 'claim', async (c) => {
    requireUuid(r.subjectId, '--subject-id');
    await lockSubject(c, r.subjectId);
    const judged = await judgeClaim(c, r, await databaseNow(c), randomUUID(), SKIP);
    await c.query(
      IDENTITY_CLAIM_INSERT,
      identityClaimParams(
        newRecord(judged.graph.input.identityClaims, judged.recordIds['identityClaim']!),
      ),
    );
    return result('claim', 'EXECUTED', judged);
  });
}

/** Appends one relationship claim to an existing subject. */
export function executeRelate(pool: pg.Pool, r: RelateRequest): Promise<RegistryResult> {
  return inWriterTransaction(pool, 'relate', async (c) => {
    requireUuid(r.subjectId, '--subject-id');
    await lockSubject(c, r.subjectId);
    const judged = await judgeRelate(c, r, await databaseNow(c), randomUUID(), SKIP);
    const rel = newRecord(
      judged.graph.input.relationshipClaims,
      judged.recordIds['relationshipClaim']!,
    );
    await c.query(RELATIONSHIP_CLAIM_INSERT, [
      rel.id,
      rel.subjectId,
      rel.predicate,
      rel.targetSubjectId,
      rel.targetEcheRowKey,
      rel.sourceType,
      rel.sourcePageEvidenceId,
      rel.sourceWebsiteClaimId,
      rel.sourceUrl,
      rel.sourceVersionRef,
      rel.observedAt,
      rel.claimBasis,
      rel.recordedByActorKey,
    ]);
    return result('relate', 'EXECUTED', judged);
  });
}

/**
 * Records one review decision. Requires a branded TrustedReviewerContext,
 * which no production code can mint; the actor key comes from it, never from
 * the request. No database capability for reviews exists either (migration
 * 0014 grants the writer SELECT only on reviews), so the pool must be the
 * owner path - which is why this is reachable from tests only.
 */
export async function recordReview(
  pool: pg.Pool,
  reviewer: TrustedReviewerContext,
  r: ReviewRequest,
): Promise<RegistryResult> {
  if (!TrustedReviewerContext.isContext(reviewer)) {
    throw new RegistryRefusal('INPUT_INVALID', 'a review requires a trusted reviewer context.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    requireUuid(r.target.id, 'the review target');
    const subjectId =
      r.target.kind === 'SUBJECT'
        ? r.target.id
        : await subjectOfClaim(
            client,
            r.target.kind === 'IDENTITY_CLAIM' ? 'identity' : 'relationship',
            r.target.id,
          );
    if (subjectId === null) {
      throw new RegistryRefusal('TARGET_NOT_FOUND', `no review target ${r.target.id}.`);
    }
    await lockSubject(client, subjectId);
    const judged = await judgeReview(
      client,
      r,
      await databaseNow(client),
      randomUUID(),
      reviewer.actorKey,
    );
    const review = newRecord(judged.graph.input.reviews, judged.recordIds['review']!);
    await client.query(REVIEW_INSERT, [
      review.id,
      review.reviewedSubjectId,
      review.reviewedIdentityClaimId,
      review.reviewedRelationshipClaimId,
      review.reviewOutcome,
      review.supersedesReviewId,
      review.actorKey,
      review.reviewedAt,
      review.reason,
    ]);
    await client.query('COMMIT');
    return result('review', 'EXECUTED', judged);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof RegistryRefusal) throw error;
    mapDatabaseError(error, 'review');
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// B2.3 - the attested review path (ADR 0023).
// ---------------------------------------------------------------------------

export interface PreparedReview {
  readonly result: RegistryResult;
  /** The unsigned request the OWNER signs offline. Bound to this database. */
  readonly request: ReviewRequestDocument;
}

/**
 * A DRY RUN of one review decision that also produces its unsigned review
 * request: the same judgement as `planReview`, in one READ ONLY snapshot,
 * plus this database's environment id and the evidence binding. Refuses a
 * subject on integrity hold - an envelope over it could never execute.
 */
export function prepareReview(
  pool: pg.Pool,
  r: ReviewRequest,
  trust: ReviewTrustSet,
): Promise<PreparedReview> {
  if (!ReviewTrustSet.isTrustSet(trust)) {
    return Promise.reject(new RegistryRefusal('INPUT_INVALID', 'a sealed trust set is required.'));
  }
  return inReadOnlySnapshot(pool, async (c) => {
    const judged = await judgeReview(
      c,
      r,
      await databaseNow(c),
      randomUUID(),
      REVIEW_PREVIEW_ACTOR_KEY,
      { attestations: 'LOAD', refuseOnHold: trust },
    );
    const before = judged.before!;
    const environmentId = before.attestations?.environmentId ?? null;
    if (environmentId === null) {
      throw new RegistryRefusal(
        'ENVIRONMENT_UNKNOWN',
        'this database has no single review environment record (migration 0015).',
      );
    }
    let evidence;
    try {
      evidence = reviewEvidenceOf(before, r.target);
    } catch (error) {
      if (error instanceof ReviewEvidenceTooLarge) {
        throw new RegistryRefusal('GRAPH_BOUND_EXCEEDED', error.message);
      }
      throw error;
    }
    if (evidence === null) {
      throw new RegistryRefusal('TARGET_NOT_FOUND', `no review target ${r.target.id}.`);
    }
    const request: ReviewRequestDocument = {
      document: REVIEW_REQUEST_DOCUMENT,
      intent: {
        protocol: REVIEW_PROTOCOL,
        contractVersion: REVIEW_CONTRACT_VERSION,
        action: REVIEW_ACTION_AUDIENCE,
        environmentId,
        subjectId: before.focalSubjectId,
        target: { kind: r.target.kind, id: r.target.id },
        expectedHeadReviewId: r.expectedHeadReviewId,
        subjectStateDigest: r.expectedStateDigest,
        ruleVersion: validateIdentityGraph(before.input).ruleVersion,
        evidence,
        outcome: r.outcome,
        reason: r.reason,
      },
    };
    return { result: result('review', 'DRY_RUN', judged, trust), request };
  });
}

/**
 * The reviewer session check. Refuses a superuser, a table owner, a session
 * without the reviewer capability and a session that ALSO holds the writer
 * capability - registering evidence and deciding about it stay separate
 * duties. Then narrows the transaction to exactly the reviewer capability.
 */
async function enterReviewerCapability(client: pg.PoolClient): Promise<void> {
  const { rows } = await client.query<{
    super: boolean;
    reviewer: boolean;
    writer: boolean;
    owner: boolean;
  }>(
    `SELECT r.rolsuper AS super,
            pg_has_role(session_user, $1, 'MEMBER') AS reviewer,
            pg_has_role(session_user, $2, 'MEMBER') AS writer,
            pg_has_role(session_user, c.relowner, 'MEMBER') AS owner
       FROM pg_roles r, pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE r.rolname = session_user AND n.nspname = 'public'
        AND c.relname = 'subject_review_attestations'`,
    [REGISTRY_REVIEWER_ROLE, REGISTRY_WRITER_ROLE],
  );
  const session = rows[0];
  if (session === undefined || session.super) {
    throw new RegistryRefusal('REVIEWER_SESSION_REFUSED', 'a superuser connection is refused.');
  }
  if (session.owner) {
    throw new RegistryRefusal('REVIEWER_SESSION_REFUSED', 'a table-owner connection is refused.');
  }
  if (!session.reviewer) {
    throw new RegistryRefusal(
      'REVIEWER_SESSION_REFUSED',
      `the connection does not hold ${REGISTRY_REVIEWER_ROLE}.`,
    );
  }
  if (session.writer) {
    throw new RegistryRefusal(
      'REVIEWER_SESSION_REFUSED',
      `the connection also holds ${REGISTRY_WRITER_ROLE}; review and registration stay separate.`,
    );
  }
  await client.query(`SET LOCAL ROLE ${REGISTRY_REVIEWER_ROLE}`);
}

const ATTESTATION_INSERT = `INSERT INTO subject_review_attestations
    (review_id, environment_id, protocol, action, key_id, key_fingerprint, nonce, subject_id,
     review_target_key, review_outcome, expected_head_review_id, subject_state_digest,
     evidence_snapshot_digest, target_record_digest, rule_version, issued_at, expires_at,
     signed_payload, signature, payload_sha256)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
          $19, $20)`;

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Records ONE OWNER-attested review decision, atomically (ADR 0023 s8). The
 * reviewer context must have been derived from a verified envelope; the
 * envelope is verified AGAIN here, against `trust`, so a context derived under
 * one trust set can never execute under another. The pool must connect as a
 * deployment-provisioned login holding exactly the reviewer capability.
 *
 * Every value written comes from the SIGNED payload or the database - the
 * actor key from the verified key id, the instant from the database clock -
 * and none from the caller.
 */
export async function appendAttestedReview(
  pool: pg.Pool,
  reviewer: TrustedReviewerContext,
  trust: ReviewTrustSet,
): Promise<RegistryResult> {
  if (!TrustedReviewerContext.isContext(reviewer)) {
    throw new RegistryRefusal('INPUT_INVALID', 'a review requires a trusted reviewer context.');
  }
  const envelope = TrustedReviewerContext.attestationOf(reviewer);
  if (envelope === null) {
    throw new RegistryRefusal(
      'REVIEW_ATTESTATION_REQUIRED',
      'this path records only reviews derived from a verified OWNER envelope.',
    );
  }
  if (!ReviewTrustSet.isTrustSet(trust)) {
    throw new RegistryRefusal('INPUT_INVALID', 'a sealed trust set is required.');
  }
  let check;
  try {
    check = verifySignedReviewPayload(
      envelope.keyId,
      envelope.signedPayload,
      envelope.signature,
      trust,
    );
  } catch (error) {
    if (error instanceof ReviewProtocolError) throw new RegistryRefusal(error.code, error.detail);
    throw error;
  }
  const p = check.payload;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await enterReviewerCapability(client);

    // Audience: this database, by its own immutable environment record.
    const environmentId = await reviewEnvironmentId(client);
    if (environmentId === null) {
      throw new RegistryRefusal('ENVIRONMENT_UNKNOWN', 'this database has no review environment.');
    }
    if (environmentId !== p.environmentId) {
      throw new RegistryRefusal(
        'ENVIRONMENT_MISMATCH',
        'the envelope was prepared for a different database.',
      );
    }

    // Freshness and key standing, by the DATABASE clock.
    const now = await databaseNow(client);
    const nowMs = Date.parse(now);
    const standing = check.trusted.mayDecideAt(nowMs);
    if (standing !== 'OK') throw new RegistryRefusal(standing, 'the key may not decide now.');
    if (nowMs < Date.parse(p.issuedAt) - REVIEW_MAX_CLOCK_SKEW_SECONDS * 1000) {
      throw new RegistryRefusal('ENVELOPE_NOT_YET_VALID', 'the envelope is dated in the future.');
    }
    if (nowMs >= Date.parse(p.expiresAt)) {
      throw new RegistryRefusal('ENVELOPE_EXPIRED', 'the envelope has expired.');
    }

    await lockSubject(client, p.subjectId);
    const owner =
      p.target.kind === 'SUBJECT'
        ? (await subjectExists(client, p.target.id))
          ? p.target.id
          : null
        : await subjectOfClaim(
            client,
            p.target.kind === 'IDENTITY_CLAIM' ? 'identity' : 'relationship',
            p.target.id,
          );
    if (owner === null || owner !== p.subjectId) {
      throw new RegistryRefusal(
        'TARGET_NOT_FOUND',
        `no review target ${p.target.id} on that subject.`,
      );
    }
    const { rows: used } = await client.query(
      `SELECT 1 FROM subject_review_attestations WHERE nonce = $1`,
      [p.nonce],
    );
    if (used.length > 0) {
      throw new RegistryRefusal('ENVELOPE_REPLAYED', 'this envelope nonce was already used.');
    }

    const request: ReviewRequest = {
      target: { kind: p.target.kind, id: p.target.id },
      outcome: p.outcome,
      expectedHeadReviewId: p.expectedHeadReviewId,
      expectedStateDigest: p.subjectStateDigest,
      reason: p.reason,
    };
    const judged = await judgeReview(client, request, now, randomUUID(), reviewer.actorKey, {
      attestations: 'LOAD',
      refuseOnHold: trust,
    });
    const evidence = reviewEvidenceOf(judged.before!, request.target);
    if (
      evidence === null ||
      evidence.snapshotDigest !== p.evidence.snapshotDigest ||
      evidence.targetRecordDigest !== p.evidence.targetRecordDigest ||
      !sameStrings(evidence.coveredRecordIds, p.evidence.coveredRecordIds) ||
      !sameStrings(evidence.evidenceRefs, p.evidence.evidenceRefs)
    ) {
      throw new RegistryRefusal(
        'EVIDENCE_CHANGED',
        'the evidence the OWNER signed over no longer matches the stored records.',
      );
    }

    const review = newRecord(judged.graph.input.reviews, judged.recordIds['review']!);
    await client.query(REVIEW_INSERT, [
      review.id,
      review.reviewedSubjectId,
      review.reviewedIdentityClaimId,
      review.reviewedRelationshipClaimId,
      review.reviewOutcome,
      review.supersedesReviewId,
      review.actorKey,
      review.reviewedAt,
      review.reason,
    ]);
    await client.query(ATTESTATION_INSERT, [
      review.id,
      p.environmentId,
      p.protocol,
      p.action,
      p.keyId,
      p.keyFingerprint,
      p.nonce,
      p.subjectId,
      reviewTargetKeyOf(review),
      p.outcome,
      p.expectedHeadReviewId,
      p.subjectStateDigest,
      p.evidence.snapshotDigest,
      p.evidence.targetRecordDigest,
      p.ruleVersion,
      p.issuedAt,
      p.expiresAt,
      envelope.signedPayload,
      envelope.signature,
      check.payloadSha256,
    ]);
    await client.query('COMMIT');
    return result('review', 'EXECUTED', judged, trust);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof RegistryRefusal) throw error;
    mapDatabaseError(error, 'review');
  } finally {
    client.release();
  }
}
