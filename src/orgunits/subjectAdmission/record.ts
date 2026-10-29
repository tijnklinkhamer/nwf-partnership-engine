/**
 * GLOBAL R8 - RECORDING AND REVOKING A SUBJECT RESEARCH ADMISSION, on the
 * OWNER path (ADR 0025 D4).
 *
 * Only the database owner can write either table: migration 0017 grants
 * INSERT on neither to any runtime role, so `nwf_research` - the role that
 * would USE an admission - can never create or withdraw one. This mirrors
 * root promotions (rule 16).
 *
 * ONE TRANSACTION, EVALUATION AND RECORD TOGETHER. `recordSubjectResearchAdmission`
 *   1. begins REPEATABLE READ and, BEFORE ANY READ, takes SHARE locks on the
 *      five discovery-subject tables, so every earlier writer has committed
 *      and no new row can commit until this transaction ends;
 *   2. loads the subject's bounded neighbourhood with its OWNER attestations
 *      (`loadSubjectGraph`, unchanged), the isolation domains, the registry
 *      fingerprint and the verified B3.0 cohort registry;
 *   3. evaluates `subject-research-admission-policy-v1` (`policy.ts`) and,
 *      only if ADMISSIBLE, appends the admission binding the subject state
 *      digest, the protected-registry digest and the fingerprint read under
 *      those locks. A refusal writes nothing.
 * Because the subject tables are append-only (0013 / 0015) and the
 * fingerprint is their row counts read under the locks, ANY later row makes
 * the admission STALE at the root resolver (D7).
 *
 * The trust set defaults to the operational one, which holds no OWNER key
 * today, so no production call can admit anything yet (D5). A TEST_ONLY set
 * exists only inside vitest (`ReviewTrustSet.ephemeralForVitest`).
 */
import type pg from 'pg';

import {
  loadEvaluationCohortRegistry,
  type RegistryLoadResult,
} from '../classify/evaluationCohortGuard.js';
import { databaseNow, loadSubjectGraph } from '../subjectRegistry/store.js';
import { ReviewTrustSet } from '../subjectReview/trust.js';
import { loadIsolationDomains, readRegistryFingerprint } from './isolation.js';
import {
  MAX_ADMISSION_VALIDITY_SECONDS,
  evaluateSubjectResearchAdmission,
  type SubjectAdmissionDecision,
} from './policy.js';

const SUBJECT_TABLES =
  'discovery_subjects, discovery_subject_identity_claims, ' +
  'discovery_subject_relationship_claims, discovery_subject_reviews, subject_review_attestations';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ACTOR_KEY = /^[a-z0-9][a-z0-9_-]{2,63}$/;

export interface RecordSubjectAdmissionRequest {
  readonly subjectId: string;
  /** The root, BY CLAIM ID. Never a URL. */
  readonly rootClaimId: string;
  /** An opaque slug naming the trusted path (`owner-cli`), never a person. */
  readonly actorKey: string;
  readonly reason: string;
  /** At most 30 days (D4). */
  readonly validitySeconds: number;
}

export interface SubjectAdmissionDeps {
  /** Omitted: the operational trust set. Tests pass a TEST_ONLY set (vitest only). */
  readonly trust?: ReviewTrustSet;
  /** Omitted: the committed, SHA-256-pinned cohort artifacts. Tests pass a synthetic loader. */
  readonly loadCohortRegistry?: () => RegistryLoadResult;
}

export type RecordSubjectAdmissionResult =
  | {
      readonly outcome: 'ADMITTED';
      readonly admissionId: string;
      readonly decision: SubjectAdmissionDecision;
    }
  | { readonly outcome: 'REFUSED'; readonly decision: SubjectAdmissionDecision };

export type SubjectAdmissionRequestRefusalCode =
  'REQUEST_INVALID' | 'SUBJECT_NOT_FOUND' | 'COHORT_METADATA_UNVERIFIED';

/** A request refused before any policy evaluation. Nothing was written. */
export class SubjectAdmissionRequestRefusal extends Error {
  readonly code: SubjectAdmissionRequestRefusalCode;

  constructor(code: SubjectAdmissionRequestRefusalCode, message: string) {
    super(`${code}: ${message}`);
    this.name = 'SubjectAdmissionRequestRefusal';
    this.code = code;
  }
}

function validateRequest(request: RecordSubjectAdmissionRequest): void {
  const problems: string[] = [];
  if (!UUID.test(request.subjectId)) problems.push('subjectId');
  if (!UUID.test(request.rootClaimId)) problems.push('rootClaimId');
  if (!ACTOR_KEY.test(request.actorKey)) problems.push('actorKey');
  if (
    typeof request.reason !== 'string' ||
    request.reason.length < 1 ||
    request.reason.length > 1000
  ) {
    problems.push('reason');
  }
  if (
    !Number.isInteger(request.validitySeconds) ||
    request.validitySeconds < 1 ||
    request.validitySeconds > MAX_ADMISSION_VALIDITY_SECONDS
  ) {
    problems.push('validitySeconds');
  }
  if (problems.length > 0) {
    throw new SubjectAdmissionRequestRefusal('REQUEST_INVALID', `invalid ${problems.join(', ')}`);
  }
}

export async function recordSubjectResearchAdmission(
  ownerPool: pg.Pool,
  request: RecordSubjectAdmissionRequest,
  deps: SubjectAdmissionDeps = {},
): Promise<RecordSubjectAdmissionResult> {
  validateRequest(request);
  const trust = deps.trust ?? ReviewTrustSet.operational();
  const loaded = (deps.loadCohortRegistry ?? loadEvaluationCohortRegistry)();
  if (!loaded.ok) {
    throw new SubjectAdmissionRequestRefusal('COHORT_METADATA_UNVERIFIED', loaded.detail);
  }

  const client = await ownerPool.connect();
  let finished = false;
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    await client.query(`LOCK TABLE ${SUBJECT_TABLES} IN SHARE MODE`);
    const graph = await loadSubjectGraph(client, request.subjectId, {
      asOf: await databaseNow(client),
      attestations: 'LOAD',
    });
    if (graph === null) {
      throw new SubjectAdmissionRequestRefusal(
        'SUBJECT_NOT_FOUND',
        `no discovery subject ${request.subjectId}`,
      );
    }
    const isolationDomains = await loadIsolationDomains(client);
    const fingerprint = await readRegistryFingerprint(client);
    const decision = evaluateSubjectResearchAdmission({
      graph,
      trust,
      rootClaimId: request.rootClaimId,
      registry: loaded.registry,
      isolationDomains,
    });
    if (decision.outcome !== 'ADMISSIBLE') {
      await client.query('ROLLBACK');
      finished = true;
      return { outcome: 'REFUSED', decision };
    }
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO subject_research_admissions
         (subject_id, identity_claim_id, claim_kind, claim_basis, website_url, policy_version,
          identity_authority_scope, subject_state_digest, protected_registry_digest,
          registry_fingerprint, actor_key, reason, validity_seconds)
       SELECT c.subject_id, c.id, c.claim_kind, c.claim_basis, c.website_url, $3, $4, $5, $6,
              $7, $8, $9, $10
         FROM discovery_subject_identity_claims c
        WHERE c.id = $2 AND c.subject_id = $1
       RETURNING id`,
      [
        request.subjectId,
        request.rootClaimId,
        decision.policyVersion,
        decision.identityAuthorityScope,
        decision.subjectStateDigest,
        decision.protectedRegistryDigest,
        fingerprint,
        request.actorKey,
        request.reason,
        request.validitySeconds,
      ],
    );
    if (rows.length !== 1) throw new Error('the admitted root claim was not found at insert');
    await client.query('COMMIT');
    finished = true;
    return { outcome: 'ADMITTED', admissionId: rows[0]!.id, decision };
  } finally {
    if (!finished) await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

export interface RevokeSubjectAdmissionRequest {
  readonly admissionId: string;
  readonly actorKey: string;
  readonly reason: string;
}

/** Appends one revocation. The admission row stays, as the record that it once authorised. */
export async function revokeSubjectResearchAdmission(
  ownerPool: pg.Pool,
  request: RevokeSubjectAdmissionRequest,
): Promise<string> {
  if (!UUID.test(request.admissionId) || !ACTOR_KEY.test(request.actorKey)) {
    throw new SubjectAdmissionRequestRefusal('REQUEST_INVALID', 'invalid admissionId or actorKey');
  }
  const { rows } = await ownerPool.query<{ id: string }>(
    `INSERT INTO subject_research_admission_revocations (admission_id, actor_key, reason)
     VALUES ($1, $2, $3) RETURNING id`,
    [request.admissionId, request.actorKey, request.reason],
  );
  return rows[0]!.id;
}
