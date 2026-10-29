/**
 * TRACK B, B2.1 - THE DETERMINISTIC DISCOVERY-SUBJECT IDENTITY VALIDATOR.
 *
 * Takes a caller-supplied set of subjects, claims and reviews (the rows of
 * migration 0013, camel-cased) and returns findings plus DERIVED assessments.
 * PURE: no socket, no database, no filesystem, no environment, no clock (the
 * instant is `input.asOf`), no randomness, and the input is never mutated.
 *
 * STRUCTURAL VALIDITY IS NOT FACTUAL VERIFICATION. `structurallyValid` means
 * the records are well-formed, attributable and internally consistent. It says
 * nothing about whether an organisation exists, is independent, or is what a
 * source says it is - `factualVerification` is fixed to say so. Nothing here
 * merges subjects, elects a winning claim, or grants research authority.
 *
 * Severity:
 *   INVALID       - the records are malformed or contradict a hard rule; a
 *                   writer must refuse them.
 *   CONFLICT      - well-formed, but the claims disagree; both sides stay.
 *   UNRESOLVED    - well-formed, but something material is not established.
 *   REVIEW_SIGNAL - worth a human look; never acted on automatically.
 */
import { isAdmissibleName, isAdmissibleNote, isAdmissiblePublicUrl } from './admissibility.js';
import {
  CLAIM_BASES,
  DISCOVERY_IDENTITY_RULE_VERSION,
  IDENTIFIER_SHAPES,
  IDENTITY_CLAIM_KINDS,
  NAME_CLAIM_KINDS,
  RELATIONSHIP_PREDICATES,
  REVIEW_OUTCOMES,
  SELF_STANDING_KINDS,
  SOURCE_TYPES,
  STRUCTURAL_PREDICATE,
  SUBJECT_KINDS,
  type ClaimBasis,
  type IdentityClaimRecord,
  type IdentityGraphInput,
  type RelationshipClaimRecord,
  type RelationshipPredicate,
  type SubjectKind,
  type SubjectReviewRecord,
} from './vocabulary.js';

export type FindingSeverity = 'INVALID' | 'CONFLICT' | 'UNRESOLVED' | 'REVIEW_SIGNAL';

export type IdentityFindingCode =
  // INVALID
  | 'INPUT_SHAPE_INVALID'
  | 'AS_OF_INVALID'
  | 'ECHE_ROW_KEY_INVALID'
  | 'PROHIBITED_FIELD'
  | 'RECORD_ID_INVALID'
  | 'DUPLICATE_RECORD_ID'
  | 'ENTITY_KIND_UNKNOWN'
  | 'ACTOR_KEY_INVALID'
  | 'NOTE_INADMISSIBLE'
  | 'SUBJECT_REFERENCE_UNKNOWN'
  | 'CLAIM_KIND_UNKNOWN'
  | 'CLAIM_PAYLOAD_MISMATCH'
  | 'NAME_INADMISSIBLE'
  | 'NAME_LANGUAGE_INVALID'
  | 'WEBSITE_URL_INADMISSIBLE'
  | 'IDENTIFIER_SCHEME_UNKNOWN'
  | 'IDENTIFIER_SHAPE_INVALID'
  | 'PROVENANCE_MISSING'
  | 'SOURCE_URL_INADMISSIBLE'
  | 'SOURCE_VERSION_REF_INVALID'
  | 'CLAIM_BASIS_UNKNOWN'
  | 'TIMESTAMP_INVALID'
  | 'TIMESTAMP_AFTER_AS_OF'
  | 'DUPLICATE_ASSERTION'
  | 'PREDICATE_UNKNOWN'
  | 'RELATIONSHIP_TARGET_INVALID'
  | 'RELATIONSHIP_TARGET_UNKNOWN'
  | 'RELATIONSHIP_SELF_LINK'
  | 'LOCAL_CHAPTER_TARGET_NOT_SUBJECT'
  | 'REVIEW_TARGET_INVALID'
  | 'REVIEW_TARGET_UNKNOWN'
  | 'REVIEW_OUTCOME_UNKNOWN'
  | 'REVIEW_CHAIN_INVALID'
  | 'SUBJECT_CONFIRMED_WITHOUT_NAME_CLAIM'
  | 'CONFIRMED_STRUCTURAL_CYCLE'
  // CONFLICT
  | 'ENTITY_KIND_CONFLICT'
  | 'REVIEWED_ENTITY_KIND_CONFLICT'
  | 'STRUCTURAL_CYCLE_CLAIMED'
  | 'STRUCTURAL_PARENT_CONFLICT'
  // UNRESOLVED
  | 'SUBJECT_WITHOUT_NAME_CLAIM'
  | 'RELATIONSHIP_TARGET_IDENTITY_UNRESOLVED'
  // REVIEW_SIGNAL
  | 'SHARED_EXTERNAL_IDENTIFIER'
  | 'SELF_STANDING_KIND_WITH_STRUCTURAL_PARENT';

export interface IdentityFinding {
  readonly severity: FindingSeverity;
  readonly code: IdentityFindingCode;
  /** The record the finding is about, or `input` for the input as a whole. */
  readonly recordId: string;
  readonly subjectId: string | null;
  readonly field: string | null;
}

/**
 * The DERIVED reviewed state of one subject or claim: the head of its review
 * chain. WITHDRAWN at the head reads as UNREVIEWED. Never stored.
 */
export type ReviewState = 'UNREVIEWED' | 'CONFIRMED' | 'DISPUTED' | 'REJECTED' | 'CHAIN_INVALID';

export interface SubjectAssessment {
  readonly subjectId: string;
  readonly registeredKind: SubjectKind;
  readonly identityReview: ReviewState;
  /** This layer never establishes facts. Structural validity is not verification. */
  readonly factualVerification: 'NOT_ESTABLISHED_BY_THIS_LAYER';
  readonly nameClaimCount: number;
  /** Distinct kinds claimed by claims not REJECTED, sorted. */
  readonly claimedKinds: readonly SubjectKind[];
  /** The one kind a CONFIRMED review heads; null when none or when they conflict. */
  readonly reviewedKind: SubjectKind | null;
}

export interface RelationshipAssessment {
  readonly relationshipClaimId: string;
  readonly subjectId: string;
  readonly predicate: RelationshipPredicate;
  /** `subject:<uuid>` or `eche:<eche_row_key>`, as migration 0013 generates it. */
  readonly targetKey: string;
  /** Source assertion versus inference - never confused with a review. */
  readonly assertionBasis: ClaimBasis;
  readonly review: ReviewState;
}

export interface IdentityValidationResult {
  readonly ruleVersion: typeof DISCOVERY_IDENTITY_RULE_VERSION;
  /** No INVALID finding. NOT a statement that anything is true. */
  readonly structurallyValid: boolean;
  readonly findings: readonly IdentityFinding[];
  readonly subjects: readonly SubjectAssessment[];
  readonly relationships: readonly RelationshipAssessment[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ACTOR_KEY = /^[a-z0-9][a-z0-9_-]{2,63}$/;
/** Normalised Erasmus code ([ -0-9A-Z]) + "|" + PIC (digits), per CLAUDE.md. */
const ECHE_ROW_KEY = /^[ 0-9A-Z-]+\|[0-9]+$/;
const LANGUAGE_TAG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;

const PROVENANCE_FIELDS = [
  'sourceType',
  'sourcePageEvidenceId',
  'sourceWebsiteClaimId',
  'sourceUrl',
  'sourceVersionRef',
  'observedAt',
  'claimBasis',
  'recordedByActorKey',
] as const;

/** The only keys each record may carry. Anything else - a contact field, a parent pointer, a status - is refused. */
const ALLOWED_FIELDS = {
  subject: new Set(['id', 'registeredKind', 'registeredByActorKey', 'registrationNote']),
  identityClaim: new Set([
    'id',
    'subjectId',
    'claimKind',
    'nameText',
    'nameLanguage',
    'claimedKind',
    'websiteUrl',
    'identifierScheme',
    'identifierValue',
    ...PROVENANCE_FIELDS,
  ]),
  relationshipClaim: new Set([
    'id',
    'subjectId',
    'predicate',
    'targetSubjectId',
    'targetEcheRowKey',
    ...PROVENANCE_FIELDS,
  ]),
  review: new Set([
    'id',
    'reviewedSubjectId',
    'reviewedIdentityClaimId',
    'reviewedRelationshipClaimId',
    'reviewOutcome',
    'supersedesReviewId',
    'actorKey',
    'reviewedAt',
    'reason',
  ]),
} as const;

const PAYLOAD_FIELDS = [
  'nameText',
  'nameLanguage',
  'claimedKind',
  'websiteUrl',
  'identifierScheme',
  'identifierValue',
] as const;
type PayloadField = (typeof PAYLOAD_FIELDS)[number];

/** The payload each claim kind requires; every other payload field must be null. */
const REQUIRED_PAYLOAD: Readonly<Record<string, readonly PayloadField[]>> = {
  NAME: ['nameText'],
  ALTERNATE_NAME: ['nameText'],
  NATIVE_NAME: ['nameText', 'nameLanguage'],
  ENTITY_KIND: ['claimedKind'],
  PUBLIC_WEBSITE: ['websiteUrl'],
  EXTERNAL_IDENTIFIER: ['identifierScheme', 'identifierValue'],
};
/** Name claims may optionally carry a language; nothing else is optional. */
const OPTIONAL_PAYLOAD: Readonly<Record<string, readonly PayloadField[]>> = {
  NAME: ['nameLanguage'],
  ALTERNATE_NAME: ['nameLanguage'],
};

const SEVERITY_ORDER: Readonly<Record<FindingSeverity, number>> = {
  INVALID: 0,
  CONFLICT: 1,
  UNRESOLVED: 2,
  REVIEW_SIGNAL: 3,
};

function includes<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

function isNullish(value: unknown): boolean {
  return value === null || value === undefined;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function field(record: object, name: string): unknown {
  return (record as Record<string, unknown>)[name];
}

function parseInstant(value: unknown): number | null {
  if (!isString(value) || !ISO_UTC.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/** `page_evidence:<uuid>` / `website_claim:<uuid>` / `url:<url>|v=<ref>`, as migration 0013 generates it. */
export function provenanceKeyOf(p: {
  sourceType: string;
  sourcePageEvidenceId: string | null;
  sourceWebsiteClaimId: string | null;
  sourceUrl: string | null;
  sourceVersionRef: string | null;
}): string {
  if (p.sourceType === 'PAGE_EVIDENCE') return `page_evidence:${p.sourcePageEvidenceId}`;
  if (p.sourceType === 'WEBSITE_CLAIM') return `website_claim:${p.sourceWebsiteClaimId}`;
  return `url:${p.sourceUrl}|v=${p.sourceVersionRef ?? ''}`;
}

/** The claim's value, as migration 0013's `value_key` generates it. Exact bytes - no case folding. */
export function valueKeyOf(c: IdentityClaimRecord): string {
  switch (c.claimKind) {
    case 'ENTITY_KIND':
      return `kind:${c.claimedKind}`;
    case 'PUBLIC_WEBSITE':
      return `url:${c.websiteUrl}`;
    case 'EXTERNAL_IDENTIFIER':
      return `id:${c.identifierScheme}:${c.identifierValue}`;
    default:
      return `name:${c.nameLanguage ?? ''}:${c.nameText}`;
  }
}

export function relationshipTargetKeyOf(r: RelationshipClaimRecord): string {
  return r.targetSubjectId !== null && r.targetSubjectId !== undefined
    ? `subject:${r.targetSubjectId}`
    : `eche:${r.targetEcheRowKey}`;
}

export function reviewTargetKeyOf(r: SubjectReviewRecord): string {
  if (!isNullish(r.reviewedSubjectId)) return `subject:${r.reviewedSubjectId}`;
  if (!isNullish(r.reviewedIdentityClaimId)) return `identity_claim:${r.reviewedIdentityClaimId}`;
  return `relationship_claim:${r.reviewedRelationshipClaimId}`;
}

class Findings {
  private readonly list: IdentityFinding[] = [];

  add(
    severity: FindingSeverity,
    code: IdentityFindingCode,
    recordId: string,
    subjectId: string | null = null,
    fieldName: string | null = null,
  ): void {
    this.list.push({ severity, code, recordId, subjectId, field: fieldName });
  }

  invalid(code: IdentityFindingCode, recordId: string, subjectId: string | null, f?: string) {
    this.add('INVALID', code, recordId, subjectId, f ?? null);
  }

  sorted(): IdentityFinding[] {
    const key = (f: IdentityFinding) =>
      `${SEVERITY_ORDER[f.severity]}\u0000${f.code}\u0000${f.recordId}\u0000${f.subjectId ?? ''}\u0000${f.field ?? ''}`;
    const seen = new Set<string>();
    return [...this.list]
      .sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))
      .filter((f) => {
        const k = key(f);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  }
}

/**
 * The records with their ORIGINAL index, ordered by id (malformed ids last, by
 * index). Every loop runs in this order, so which of two colliding records is
 * reported never depends on the order the caller supplied them in.
 */
function inIdOrder<T>(records: readonly T[]): { record: T; index: number }[] {
  const key = (record: T, index: number): string => {
    const id = typeof record === 'object' && record !== null ? field(record, 'id') : undefined;
    // Equal ids (already INVALID) still order by content, never by input position.
    return isString(id) && UUID.test(id)
      ? `0${id}\u0000${JSON.stringify(record)}`
      : `1${String(index).padStart(10, '0')}`;
  };
  return records
    .map((record, index) => ({ record, index, sortKey: key(record, index) }))
    .sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0))
    .map(({ record, index }) => ({ record, index }));
}

function recordIdOf(record: unknown, index: number, collection: string): string {
  const id = typeof record === 'object' && record !== null ? field(record, 'id') : undefined;
  return isString(id) && UUID.test(id) ? id : `${collection}[${index}]`;
}

function checkFields(
  findings: Findings,
  record: object,
  allowed: ReadonlySet<string>,
  recordId: string,
  subjectId: string | null,
): void {
  for (const key of Object.keys(record).sort()) {
    if (!allowed.has(key)) findings.invalid('PROHIBITED_FIELD', recordId, subjectId, key);
  }
}

function checkProvenance(
  findings: Findings,
  record: object,
  recordId: string,
  subjectId: string | null,
  asOfMs: number | null,
): void {
  const sourceType = field(record, 'sourceType');
  const pageId = field(record, 'sourcePageEvidenceId');
  const websiteClaimId = field(record, 'sourceWebsiteClaimId');
  const sourceUrl = field(record, 'sourceUrl');
  const version = field(record, 'sourceVersionRef');

  const consistent =
    (sourceType === 'PAGE_EVIDENCE' &&
      isString(pageId) &&
      isNullish(websiteClaimId) &&
      isNullish(sourceUrl)) ||
    (sourceType === 'WEBSITE_CLAIM' &&
      isString(websiteClaimId) &&
      isNullish(pageId) &&
      isNullish(sourceUrl)) ||
    (sourceType === 'PUBLIC_URL' &&
      isString(sourceUrl) &&
      isNullish(pageId) &&
      isNullish(websiteClaimId));
  if (!includes(SOURCE_TYPES, sourceType) || !consistent) {
    findings.invalid('PROVENANCE_MISSING', recordId, subjectId, 'sourceType');
  }
  if (isString(pageId) && !UUID.test(pageId)) {
    findings.invalid('RECORD_ID_INVALID', recordId, subjectId, 'sourcePageEvidenceId');
  }
  if (isString(websiteClaimId) && !UUID.test(websiteClaimId)) {
    findings.invalid('RECORD_ID_INVALID', recordId, subjectId, 'sourceWebsiteClaimId');
  }
  if (!isNullish(sourceUrl) && !(isString(sourceUrl) && isAdmissiblePublicUrl(sourceUrl))) {
    findings.invalid('SOURCE_URL_INADMISSIBLE', recordId, subjectId, 'sourceUrl');
  }
  if (!isNullish(version) && !(isString(version) && SHA256_HEX.test(version))) {
    findings.invalid('SOURCE_VERSION_REF_INVALID', recordId, subjectId, 'sourceVersionRef');
  }
  if (!includes(CLAIM_BASES, field(record, 'claimBasis'))) {
    findings.invalid('CLAIM_BASIS_UNKNOWN', recordId, subjectId, 'claimBasis');
  }
  const actor = field(record, 'recordedByActorKey');
  if (!(isString(actor) && ACTOR_KEY.test(actor))) {
    findings.invalid('ACTOR_KEY_INVALID', recordId, subjectId, 'recordedByActorKey');
  }
  checkInstant(findings, field(record, 'observedAt'), asOfMs, recordId, subjectId, 'observedAt');
}

function checkInstant(
  findings: Findings,
  value: unknown,
  asOfMs: number | null,
  recordId: string,
  subjectId: string | null,
  fieldName: string,
): void {
  const ms = parseInstant(value);
  if (ms === null) findings.invalid('TIMESTAMP_INVALID', recordId, subjectId, fieldName);
  else if (asOfMs !== null && ms > asOfMs) {
    findings.invalid('TIMESTAMP_AFTER_AS_OF', recordId, subjectId, fieldName);
  }
}

function checkUniqueIds(findings: Findings, records: readonly unknown[], collection: string): void {
  const seen = new Set<string>();
  records.forEach((record, index) => {
    const id = typeof record === 'object' && record !== null ? field(record, 'id') : undefined;
    if (!(isString(id) && UUID.test(id))) {
      findings.invalid('RECORD_ID_INVALID', recordIdOf(record, index, collection), null, 'id');
      return;
    }
    if (seen.has(id)) findings.invalid('DUPLICATE_RECORD_ID', id, null, 'id');
    seen.add(id);
  });
}

interface ReviewIndex {
  readonly stateByTarget: ReadonlyMap<string, ReviewState>;
}

/** Derives the head of every review chain, recording INVALID findings for malformed chains. */
function deriveReviewStates(
  findings: Findings,
  reviews: readonly SubjectReviewRecord[],
): ReviewIndex {
  const byTarget = new Map<string, SubjectReviewRecord[]>();
  const byId = new Map<string, SubjectReviewRecord>();
  for (const { record: review } of inIdOrder(reviews)) {
    byId.set(review.id, review);
    const key = reviewTargetKeyOf(review);
    byTarget.set(key, [...(byTarget.get(key) ?? []), review]);
  }

  const stateByTarget = new Map<string, ReviewState>();
  for (const [target, chain] of [...byTarget.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const roots = chain.filter((r) => isNullish(r.supersedesReviewId));
    const successor = new Map<string, SubjectReviewRecord>();
    let valid = roots.length === 1;
    for (const review of chain) {
      const prior = review.supersedesReviewId;
      if (isNullish(prior)) continue;
      const predecessor = byId.get(prior as string);
      if (
        prior === review.id ||
        predecessor === undefined ||
        reviewTargetKeyOf(predecessor) !== target ||
        successor.has(prior as string)
      ) {
        valid = false;
        findings.invalid('REVIEW_CHAIN_INVALID', review.id, null, 'supersedesReviewId');
        continue;
      }
      successor.set(prior as string, review);
      const before = parseInstant(predecessor.reviewedAt);
      const after = parseInstant(review.reviewedAt);
      if (before !== null && after !== null && after < before) {
        valid = false;
        findings.invalid('REVIEW_CHAIN_INVALID', review.id, null, 'reviewedAt');
      }
    }
    if (roots.length !== 1) {
      for (const root of roots)
        findings.invalid('REVIEW_CHAIN_INVALID', root.id, null, 'supersedesReviewId');
    }

    let head: SubjectReviewRecord | undefined = roots.length === 1 ? roots[0] : undefined;
    let walked = head === undefined ? 0 : 1;
    while (head !== undefined && successor.has(head.id) && walked <= chain.length) {
      head = successor.get(head.id);
      walked += 1;
    }
    if (walked !== chain.length) {
      valid = false;
      for (const review of chain) {
        findings.invalid('REVIEW_CHAIN_INVALID', review.id, null, 'supersedesReviewId');
      }
    }
    if (!valid || head === undefined) {
      stateByTarget.set(target, 'CHAIN_INVALID');
      continue;
    }
    stateByTarget.set(
      target,
      head.reviewOutcome === 'WITHDRAWN' ? 'UNREVIEWED' : head.reviewOutcome,
    );
  }
  return { stateByTarget };
}

function stateOf(index: ReviewIndex, targetKey: string): ReviewState {
  return index.stateByTarget.get(targetKey) ?? 'UNREVIEWED';
}

/** Validates one identity graph. Deterministic: the same input always yields the same result. */
export function validateIdentityGraph(input: IdentityGraphInput): IdentityValidationResult {
  const findings = new Findings();
  const collections = [
    input?.subjects,
    input?.identityClaims,
    input?.relationshipClaims,
    input?.reviews,
    input?.knownEcheRowKeys,
  ];
  if (collections.some((c) => !Array.isArray(c))) {
    findings.invalid('INPUT_SHAPE_INVALID', 'input', null);
    return {
      ruleVersion: DISCOVERY_IDENTITY_RULE_VERSION,
      structurallyValid: false,
      findings: findings.sorted(),
      subjects: [],
      relationships: [],
    };
  }
  const nonObject = (list: readonly unknown[]) =>
    list.some((r) => typeof r !== 'object' || r === null || Array.isArray(r));
  if (
    nonObject(input.subjects) ||
    nonObject(input.identityClaims) ||
    nonObject(input.relationshipClaims) ||
    nonObject(input.reviews)
  ) {
    findings.invalid('INPUT_SHAPE_INVALID', 'input', null);
    return {
      ruleVersion: DISCOVERY_IDENTITY_RULE_VERSION,
      structurallyValid: false,
      findings: findings.sorted(),
      subjects: [],
      relationships: [],
    };
  }

  const asOfMs = parseInstant(input.asOf);
  if (asOfMs === null) findings.invalid('AS_OF_INVALID', 'input', null, 'asOf');

  const knownEche = new Set<string>();
  for (const key of input.knownEcheRowKeys) {
    if (isString(key) && ECHE_ROW_KEY.test(key)) knownEche.add(key);
    else findings.invalid('ECHE_ROW_KEY_INVALID', 'input', null, 'knownEcheRowKeys');
  }

  checkUniqueIds(findings, input.subjects, 'subjects');
  checkUniqueIds(findings, input.identityClaims, 'identityClaims');
  checkUniqueIds(findings, input.relationshipClaims, 'relationshipClaims');
  checkUniqueIds(findings, input.reviews, 'reviews');

  // ---- Subjects ------------------------------------------------------------
  const subjectById = new Map<string, (typeof input.subjects)[number]>();
  inIdOrder(input.subjects).forEach(({ record: subject, index }) => {
    const id = recordIdOf(subject, index, 'subjects');
    checkFields(findings, subject, ALLOWED_FIELDS.subject, id, id);
    if (!includes(SUBJECT_KINDS, subject.registeredKind)) {
      findings.invalid('ENTITY_KIND_UNKNOWN', id, id, 'registeredKind');
    }
    if (!(isString(subject.registeredByActorKey) && ACTOR_KEY.test(subject.registeredByActorKey))) {
      findings.invalid('ACTOR_KEY_INVALID', id, id, 'registeredByActorKey');
    }
    const note = subject.registrationNote;
    if (!isNullish(note) && !(isString(note) && isAdmissibleNote(note, 500))) {
      findings.invalid('NOTE_INADMISSIBLE', id, id, 'registrationNote');
    }
    if (UUID.test(id) && !subjectById.has(id)) subjectById.set(id, subject);
  });

  // ---- Identity claims -----------------------------------------------------
  const identityClaimById = new Map<string, IdentityClaimRecord>();
  const identityDedupe = new Map<string, string>();
  inIdOrder(input.identityClaims).forEach(({ record: claim, index }) => {
    const id = recordIdOf(claim, index, 'identityClaims');
    const subjectId = isString(claim.subjectId) ? claim.subjectId : null;
    checkFields(findings, claim, ALLOWED_FIELDS.identityClaim, id, subjectId);
    if (subjectId === null || !subjectById.has(subjectId)) {
      findings.invalid('SUBJECT_REFERENCE_UNKNOWN', id, subjectId, 'subjectId');
    }
    checkProvenance(findings, claim, id, subjectId, asOfMs);

    if (!includes(IDENTITY_CLAIM_KINDS, claim.claimKind)) {
      findings.invalid('CLAIM_KIND_UNKNOWN', id, subjectId, 'claimKind');
      return;
    }
    const required = REQUIRED_PAYLOAD[claim.claimKind] ?? [];
    const optional = OPTIONAL_PAYLOAD[claim.claimKind] ?? [];
    for (const name of PAYLOAD_FIELDS) {
      const present = !isNullish(field(claim, name));
      if (required.includes(name) ? !present : present && !optional.includes(name)) {
        findings.invalid('CLAIM_PAYLOAD_MISMATCH', id, subjectId, name);
      }
    }
    if ((NAME_CLAIM_KINDS as readonly string[]).includes(claim.claimKind)) {
      if (isString(claim.nameText) && !isAdmissibleName(claim.nameText)) {
        findings.invalid('NAME_INADMISSIBLE', id, subjectId, 'nameText');
      }
      if (isString(claim.nameLanguage) && !LANGUAGE_TAG.test(claim.nameLanguage)) {
        findings.invalid('NAME_LANGUAGE_INVALID', id, subjectId, 'nameLanguage');
      }
    }
    if (!isNullish(claim.nameText) && !isString(claim.nameText)) {
      findings.invalid('NAME_INADMISSIBLE', id, subjectId, 'nameText');
    }
    if (!isNullish(claim.claimedKind) && !includes(SUBJECT_KINDS, claim.claimedKind)) {
      findings.invalid('ENTITY_KIND_UNKNOWN', id, subjectId, 'claimedKind');
    }
    if (
      !isNullish(claim.websiteUrl) &&
      !(isString(claim.websiteUrl) && isAdmissiblePublicUrl(claim.websiteUrl))
    ) {
      findings.invalid('WEBSITE_URL_INADMISSIBLE', id, subjectId, 'websiteUrl');
    }
    if (!isNullish(claim.identifierScheme)) {
      const scheme = claim.identifierScheme as string;
      if (!Object.hasOwn(IDENTIFIER_SHAPES, scheme)) {
        findings.invalid('IDENTIFIER_SCHEME_UNKNOWN', id, subjectId, 'identifierScheme');
      } else if (!(
        isString(claim.identifierValue) &&
        IDENTIFIER_SHAPES[scheme as keyof typeof IDENTIFIER_SHAPES].test(claim.identifierValue)
      )) {
        findings.invalid('IDENTIFIER_SHAPE_INVALID', id, subjectId, 'identifierValue');
      }
    }

    if (UUID.test(id) && !identityClaimById.has(id)) identityClaimById.set(id, claim);
    const dedupe = `${claim.subjectId}\u0000${claim.claimKind}\u0000${valueKeyOf(claim)}\u0000${provenanceKeyOf(claim)}`;
    if (identityDedupe.has(dedupe)) findings.invalid('DUPLICATE_ASSERTION', id, subjectId);
    else identityDedupe.set(dedupe, id);
  });

  // ---- Relationship claims -------------------------------------------------
  const relationshipById = new Map<string, RelationshipClaimRecord>();
  const relationshipDedupe = new Map<string, string>();
  inIdOrder(input.relationshipClaims).forEach(({ record: rel, index }) => {
    const id = recordIdOf(rel, index, 'relationshipClaims');
    const subjectId = isString(rel.subjectId) ? rel.subjectId : null;
    checkFields(findings, rel, ALLOWED_FIELDS.relationshipClaim, id, subjectId);
    if (subjectId === null || !subjectById.has(subjectId)) {
      findings.invalid('SUBJECT_REFERENCE_UNKNOWN', id, subjectId, 'subjectId');
    }
    checkProvenance(findings, rel, id, subjectId, asOfMs);
    if (!includes(RELATIONSHIP_PREDICATES, rel.predicate)) {
      findings.invalid('PREDICATE_UNKNOWN', id, subjectId, 'predicate');
    }

    const hasSubjectTarget = !isNullish(rel.targetSubjectId);
    const hasEcheTarget = !isNullish(rel.targetEcheRowKey);
    if (hasSubjectTarget === hasEcheTarget) {
      findings.invalid('RELATIONSHIP_TARGET_INVALID', id, subjectId, 'target');
    } else if (hasSubjectTarget) {
      const target = rel.targetSubjectId as string;
      if (target === rel.subjectId) {
        findings.invalid('RELATIONSHIP_SELF_LINK', id, subjectId, 'targetSubjectId');
      } else if (!(isString(target) && subjectById.has(target))) {
        findings.invalid('RELATIONSHIP_TARGET_UNKNOWN', id, subjectId, 'targetSubjectId');
      }
    } else {
      const key = rel.targetEcheRowKey as string;
      if (!(isString(key) && ECHE_ROW_KEY.test(key) && knownEche.has(key))) {
        findings.invalid('RELATIONSHIP_TARGET_UNKNOWN', id, subjectId, 'targetEcheRowKey');
      }
      if (rel.predicate === 'LOCAL_CHAPTER_OF') {
        findings.invalid('LOCAL_CHAPTER_TARGET_NOT_SUBJECT', id, subjectId, 'targetEcheRowKey');
      }
    }

    if (UUID.test(id) && !relationshipById.has(id)) relationshipById.set(id, rel);
    const dedupe = `${rel.subjectId}\u0000${rel.predicate}\u0000${relationshipTargetKeyOf(rel)}\u0000${provenanceKeyOf(rel)}`;
    if (relationshipDedupe.has(dedupe)) findings.invalid('DUPLICATE_ASSERTION', id, subjectId);
    else relationshipDedupe.set(dedupe, id);
  });

  // ---- Reviews -------------------------------------------------------------
  const wellFormedReviews: SubjectReviewRecord[] = [];
  inIdOrder(input.reviews).forEach(({ record: review, index }) => {
    const id = recordIdOf(review, index, 'reviews');
    checkFields(findings, review, ALLOWED_FIELDS.review, id, null);
    const targets = [
      review.reviewedSubjectId,
      review.reviewedIdentityClaimId,
      review.reviewedRelationshipClaimId,
    ].filter((t) => !isNullish(t));
    let wellFormed = UUID.test(id);
    if (targets.length !== 1) {
      findings.invalid('REVIEW_TARGET_INVALID', id, null, 'reviewTarget');
      wellFormed = false;
    } else {
      const known =
        (!isNullish(review.reviewedSubjectId) &&
          subjectById.has(review.reviewedSubjectId as string)) ||
        (!isNullish(review.reviewedIdentityClaimId) &&
          identityClaimById.has(review.reviewedIdentityClaimId as string)) ||
        (!isNullish(review.reviewedRelationshipClaimId) &&
          relationshipById.has(review.reviewedRelationshipClaimId as string));
      if (!known) {
        findings.invalid('REVIEW_TARGET_UNKNOWN', id, null, 'reviewTarget');
        wellFormed = false;
      }
    }
    if (!includes(REVIEW_OUTCOMES, review.reviewOutcome)) {
      findings.invalid('REVIEW_OUTCOME_UNKNOWN', id, null, 'reviewOutcome');
      wellFormed = false;
    }
    if (review.reviewOutcome === 'WITHDRAWN' && isNullish(review.supersedesReviewId)) {
      findings.invalid('REVIEW_CHAIN_INVALID', id, null, 'supersedesReviewId');
    }
    if (!isNullish(review.supersedesReviewId) && !UUID.test(review.supersedesReviewId as string)) {
      findings.invalid('RECORD_ID_INVALID', id, null, 'supersedesReviewId');
      wellFormed = false;
    }
    if (!(isString(review.actorKey) && ACTOR_KEY.test(review.actorKey))) {
      findings.invalid('ACTOR_KEY_INVALID', id, null, 'actorKey');
    }
    if (
      !isNullish(review.reason) &&
      !(isString(review.reason) && isAdmissibleNote(review.reason, 1000))
    ) {
      findings.invalid('NOTE_INADMISSIBLE', id, null, 'reason');
    }
    checkInstant(findings, review.reviewedAt, asOfMs, id, null, 'reviewedAt');
    if (wellFormed) wellFormedReviews.push(review);
  });
  const reviewIndex = deriveReviewStates(findings, wellFormedReviews);

  // ---- Derived assessments and graph-level rules ---------------------------
  const subjectIds = [...subjectById.keys()].sort();
  const claimsBySubject = new Map<string, IdentityClaimRecord[]>();
  for (const claim of [...identityClaimById.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    claimsBySubject.set(claim.subjectId, [...(claimsBySubject.get(claim.subjectId) ?? []), claim]);
  }
  const claimState = (c: IdentityClaimRecord) => stateOf(reviewIndex, `identity_claim:${c.id}`);
  const relationshipState = (r: RelationshipClaimRecord) =>
    stateOf(reviewIndex, `relationship_claim:${r.id}`);

  const subjects: SubjectAssessment[] = subjectIds.map((subjectId) => {
    const subject = subjectById.get(subjectId)!;
    const claims = claimsBySubject.get(subjectId) ?? [];
    const live = claims.filter((c) => claimState(c) !== 'REJECTED');
    const nameClaims = live.filter((c) =>
      (NAME_CLAIM_KINDS as readonly string[]).includes(c.claimKind),
    );
    const kindClaims = live.filter(
      (c) => c.claimKind === 'ENTITY_KIND' && includes(SUBJECT_KINDS, c.claimedKind),
    );
    const claimedKinds = [...new Set(kindClaims.map((c) => c.claimedKind as SubjectKind))].sort();
    const confirmedKinds = [
      ...new Set(
        kindClaims
          .filter((c) => claimState(c) === 'CONFIRMED')
          .map((c) => c.claimedKind as SubjectKind),
      ),
    ].sort();
    const identityReview = stateOf(reviewIndex, `subject:${subjectId}`);

    if (nameClaims.length === 0) {
      findings.add('UNRESOLVED', 'SUBJECT_WITHOUT_NAME_CLAIM', subjectId, subjectId);
      if (identityReview === 'CONFIRMED') {
        findings.invalid('SUBJECT_CONFIRMED_WITHOUT_NAME_CLAIM', subjectId, subjectId);
      }
    }
    if (claimedKinds.filter((k) => k !== 'UNCERTAIN').length > 1) {
      findings.add('CONFLICT', 'ENTITY_KIND_CONFLICT', subjectId, subjectId);
    }
    if (confirmedKinds.length > 1) {
      findings.add('CONFLICT', 'REVIEWED_ENTITY_KIND_CONFLICT', subjectId, subjectId);
    }
    return {
      subjectId,
      registeredKind: subject.registeredKind,
      identityReview,
      factualVerification: 'NOT_ESTABLISHED_BY_THIS_LAYER',
      nameClaimCount: nameClaims.length,
      claimedKinds,
      reviewedKind: confirmedKinds.length === 1 ? confirmedKinds[0]! : null,
    };
  });
  const assessmentById = new Map(subjects.map((s) => [s.subjectId, s]));

  const relationships: RelationshipAssessment[] = [...relationshipById.values()]
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .filter(
      (r) => includes(RELATIONSHIP_PREDICATES, r.predicate) && includes(CLAIM_BASES, r.claimBasis),
    )
    .map((r) => ({
      relationshipClaimId: r.id,
      subjectId: r.subjectId,
      predicate: r.predicate,
      targetKey: relationshipTargetKeyOf(r),
      assertionBasis: r.claimBasis,
      review: relationshipState(r),
    }));

  // A relationship whose target subject is not a CONFIRMED identity rests on an unresolved identity.
  for (const rel of relationships) {
    if (rel.review === 'REJECTED' || !rel.targetKey.startsWith('subject:')) continue;
    const target = assessmentById.get(rel.targetKey.slice('subject:'.length));
    if (target !== undefined && target.identityReview !== 'CONFIRMED') {
      findings.add(
        'UNRESOLVED',
        'RELATIONSHIP_TARGET_IDENTITY_UNRESOLVED',
        rel.relationshipClaimId,
        rel.subjectId,
      );
    }
  }

  // Structural (PART_OF) rules over the live (not REJECTED) and CONFIRMED edges.
  const structural = relationships.filter(
    (r) => r.predicate === STRUCTURAL_PREDICATE && r.review !== 'REJECTED',
  );
  const liveParents = adjacency(structural);
  const confirmedParents = adjacency(structural.filter((r) => r.review === 'CONFIRMED'));

  for (const cycle of cyclesThrough(liveParents)) {
    for (const node of cycle) {
      findings.add('CONFLICT', 'STRUCTURAL_CYCLE_CLAIMED', node, node);
    }
  }
  for (const cycle of cyclesThrough(confirmedParents)) {
    for (const node of cycle) findings.invalid('CONFIRMED_STRUCTURAL_CYCLE', node, node);
  }

  for (const subjectId of subjectIds) {
    const parents = liveParents.get(`subject:${subjectId}`) ?? [];
    for (let i = 0; i < parents.length; i += 1) {
      for (let j = i + 1; j < parents.length; j += 1) {
        const a = parents[i]!;
        const b = parents[j]!;
        if (!reaches(liveParents, a, b) && !reaches(liveParents, b, a)) {
          findings.add('CONFLICT', 'STRUCTURAL_PARENT_CONFLICT', subjectId, subjectId);
        }
      }
    }
    const assessment = assessmentById.get(subjectId)!;
    const kindEvidence = kindEvidenceOf(assessment);
    if (parents.length > 0 && kindEvidence.some((k) => SELF_STANDING_KINDS.includes(k))) {
      findings.add(
        'REVIEW_SIGNAL',
        'SELF_STANDING_KIND_WITH_STRUCTURAL_PARENT',
        subjectId,
        subjectId,
      );
    }
  }

  // A typed identifier claimed for two different subjects: a duplicate candidate, never a merge.
  const holders = new Map<string, Set<string>>();
  const claimsByIdentifier = new Map<string, string[]>();
  for (const claim of identityClaimById.values()) {
    if (claim.claimKind !== 'EXTERNAL_IDENTIFIER' || claimState(claim) === 'REJECTED') continue;
    const key = `${claim.identifierScheme}:${claim.identifierValue}`;
    holders.set(key, (holders.get(key) ?? new Set()).add(claim.subjectId));
    claimsByIdentifier.set(key, [...(claimsByIdentifier.get(key) ?? []), claim.id]);
  }
  for (const [key, subjectsHolding] of holders) {
    if (subjectsHolding.size < 2) continue;
    for (const claimId of claimsByIdentifier.get(key) ?? []) {
      findings.add(
        'REVIEW_SIGNAL',
        'SHARED_EXTERNAL_IDENTIFIER',
        claimId,
        identityClaimById.get(claimId)?.subjectId ?? null,
      );
    }
  }

  const sortedFindings = findings.sorted();
  return {
    ruleVersion: DISCOVERY_IDENTITY_RULE_VERSION,
    structurallyValid: !sortedFindings.some((f) => f.severity === 'INVALID'),
    findings: sortedFindings,
    subjects,
    relationships,
  };
}

/**
 * The kinds a subject's evidence admits. A single reviewed kind decides; with
 * none, the registered label and every live claimed kind all count, so an
 * unresolved kind is read in the most cautious way available.
 */
export function kindEvidenceOf(assessment: SubjectAssessment): SubjectKind[] {
  if (assessment.reviewedKind !== null) return [assessment.reviewedKind];
  return [...new Set([assessment.registeredKind, ...assessment.claimedKinds])].sort();
}

/** `subject:<id>` -> sorted, distinct parent target keys. */
export function adjacency(edges: readonly RelationshipAssessment[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const edge of edges) {
    const from = `subject:${edge.subjectId}`;
    const next = new Set(map.get(from) ?? []).add(edge.targetKey);
    map.set(from, [...next].sort());
  }
  return map;
}

/** True when `to` is reachable from `from` (or equal to it) over `parents`. */
export function reaches(
  parents: ReadonlyMap<string, readonly string[]>,
  from: string,
  to: string,
): boolean {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === to) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const next of parents.get(node) ?? []) stack.push(next);
  }
  return false;
}

/** Every subject id that lies on a directed cycle, grouped per strongly connected component. */
function cyclesThrough(parents: ReadonlyMap<string, readonly string[]>): string[][] {
  const nodes = [...parents.keys()].sort();
  const onCycle: string[][] = [];
  const assigned = new Set<string>();
  for (const node of nodes) {
    if (assigned.has(node)) continue;
    const component = nodes.filter(
      (other) =>
        !assigned.has(other) && reaches(parents, node, other) && reaches(parents, other, node),
    );
    const selfLoop = (parents.get(node) ?? []).includes(node);
    if (component.length > 1 || selfLoop) {
      for (const member of component) assigned.add(member);
      onCycle.push(component.map((key) => key.slice('subject:'.length)));
    }
  }
  return onCycle;
}
