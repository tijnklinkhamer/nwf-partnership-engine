/**
 * TRACK B, B2.5-M1 - THE PURE, DETERMINISTIC RECORD-SET DIGEST AND
 * ACQUISITION COMPANION OF ONE SNAPSHOT-SCOPE MANIFEST.
 *
 * `recordSetDigestOf` turns ONE S0 manifest's membership into a RECORDS-ONLY
 * digest: the record type, record id and full S0 content digest of every
 * STORED EVIDENCE RECORD entry (subject, identity claim, relationship claim,
 * review, review attestation reference), in record-type-then-id order. No
 * SOURCE_GLOBAL entry is included - neither the VALIDATION_AS_OF clock
 * reading nor the ECHE_ROW_KEY_EXISTENCE status; the manifest digest binds
 * both. It is independent of the as-of, the ECHE key state, the clock, the
 * transaction, the findings and every acquisition observation; it changes
 * when any supplied record is added, removed or modified. It refuses a
 * manifest whose S0 digests do not recompute, whose membership carries a
 * duplicate, conflicting or unknown entry (source globals included), or -
 * when the S0 input is supplied - which that input does not reproduce byte
 * for byte. Equal record-set digests prove that two SUPPLIED record sets are
 * equal; never that the database was unchanged between two reads.
 *
 * `buildAcquisitionCompanion` takes that manifest, the exact S0 input it was
 * built from and the assembler's loader observations, re-derives what each
 * observation can and cannot say, refuses any observation that contradicts
 * itself, the fixed read protocol or the manifest, and binds the result -
 * with the manifest digest and the record-set digest - under one acquisition
 * digest over every other field. Nothing here is signed or authenticated:
 * `verifyAcquisitionCompanion` recomputes the digests, and
 * `reproduceAcquisitionCompanion` rebuilds the companion from its own
 * assembler-reported observations; neither proves that a query ran, that the
 * source is complete or current, or that any reviewer, identity or
 * protection status is established.
 *
 * Neither digest commits to itself: the record-set digest commits to the
 * manifest's membership only, and the acquisition digest is over every field
 * of the companion except the acquisition digest.
 *
 * PURE: no socket, no database, no filesystem, no environment, no clock.
 */
import { createHash } from 'node:crypto';

import {
  reproduceSnapshotScopeManifest,
  verifySnapshotScopeManifest,
  type SnapshotScopeInput,
  type SnapshotScopeManifest,
} from '../subjectSnapshot/manifest.js';
import {
  ACCEPTED_VALIDATOR_RULE_VERSION,
  ACQUISITION_COMPANION_CONTRACT,
  ACQUISITION_COMPANION_CONTRACT_STATUS,
  AcquisitionCompanionRefusal,
  ASSEMBLER_IDENTITY,
  AUTHENTICITY,
  BEYOND_INCLUDED,
  CANONICAL_ISSUER,
  CLOCK_TREATMENT,
  EVIDENCE_DEPTHS,
  HEX64,
  HOLDER_BASES,
  HOLDER_INCLUDED_CAP,
  HOLDER_QUERY_LIMIT,
  INCOMING_BASES,
  INCOMING_INCLUDED_CAP,
  INCOMING_QUERY_LIMIT,
  LOADER_ENUMERATION_OUTCOMES,
  LOADER_REVIEW_READ_OUTCOMES,
  LOADER_SOURCE_ROW_OUTCOMES,
  MEMBERSHIP_RECORD_TYPES,
  PERMISSIONS,
  READ_PREDICATES,
  READ_PROTOCOL,
  RECORD_SET_RULE,
  REVIEW_STATEMENT_ROW_BOUND,
  SOURCE_GLOBAL_RECORD_IDS,
  UUID,
  VALIDATION_POLICY,
  type CompanionRefusalCode,
  type EnumerationStatus,
  type EvidenceDepth,
  type LoaderEnumerationOutcome,
  type MembershipRecordType,
  type ReviewReadStatus,
  type SourceSubjectAcquisition,
  type StoredRecordType,
} from './contract.js';

// ------------------------------------------------------------------ canonical encoding

/**
 * The S0 canonical rule, restated for this contract's own digests: plain
 * objects with keys sorted by UTF-16 code unit, no undefined value, strings
 * as JSON.stringify writes them, null/true/false, non-negative safe integers
 * only, bounded nesting, no whitespace.
 */
type CanonicalValue =
  | null
  | boolean
  | string
  | number
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

const MAX_DEPTH = 16;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

function encode(value: unknown, depth: number): string {
  if (depth > MAX_DEPTH) throw new Error('companion canonical encoding: nesting too deep');
  if (value === null) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) {
      throw new Error('companion canonical encoding: number not a non-negative safe integer');
    }
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map((v) => encode(v, depth + 1)).join(',')}]`;
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((k) => {
        const v = value[k];
        if (v === undefined) throw new Error('companion canonical encoding: undefined value');
        return `${JSON.stringify(k)}:${encode(v, depth + 1)}`;
      })
      .join(',')}}`;
  }
  throw new Error('companion canonical encoding: unsupported value');
}

/** The canonical encoding of `value`. Throws on anything outside the closed shape. */
export function companionCanonicalJson(value: CanonicalValue): string {
  return encode(value, 0);
}

type DigestRole = 'record-set' | 'withheld-diagnostics' | 'acquisition';

/** SHA-256 hex of `<contract>/<role>\n<canonical JSON>`: never replayable as an S0 digest. */
function digestOf(role: DigestRole, value: CanonicalValue): string {
  return createHash('sha256')
    .update(`${ACQUISITION_COMPANION_CONTRACT}/${role}\n${companionCanonicalJson(value)}`, 'utf8')
    .digest('hex');
}

// ------------------------------------------------------------------ refusals and checks

function refuse(code: CompanionRefusalCode, detail: string): never {
  throw new AcquisitionCompanionRefusal(code, detail);
}

function oneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function exactKeys(value: unknown, keys: readonly string[], what: string): Record<string, unknown> {
  if (!isPlainObject(value)) refuse('OBSERVATION_SHAPE_UNSUPPORTED', `${what}_not_an_object`);
  const have = Object.keys(value).sort();
  const want = [...keys].sort();
  if (have.length !== want.length || have.some((k, i) => k !== want[i])) {
    refuse('OBSERVATION_SHAPE_UNSUPPORTED', `${what}_keys`);
  }
  return value;
}

/** A list of distinct lower-case UUIDs, returned ascending. Duplicates are refused, never merged. */
function uuidSet(value: unknown, max: number, what: string): string[] {
  if (!Array.isArray(value) || value.length > max) {
    refuse('OBSERVATION_SHAPE_UNSUPPORTED', `${what}_not_a_bounded_list`);
  }
  for (const id of value as unknown[]) {
    if (typeof id !== 'string' || !UUID.test(id)) {
      refuse('OBSERVATION_SHAPE_UNSUPPORTED', `${what}_entry`);
    }
  }
  const sorted = [...new Set(value as string[])].sort();
  if (sorted.length !== value.length) refuse('OBSERVATION_SHAPE_UNSUPPORTED', `${what}_duplicate`);
  return sorted;
}

function uuidOrNull(value: unknown, what: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !UUID.test(value)) {
    refuse('OBSERVATION_SHAPE_UNSUPPORTED', what);
  }
  return value;
}

function uuid(value: unknown, what: string): string {
  const v = uuidOrNull(value, what);
  if (v === null) refuse('OBSERVATION_SHAPE_UNSUPPORTED', what);
  return v;
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

const byId = <T extends { readonly id: string }>(a: T, b: T) => (a.id < b.id ? -1 : 1);

/** Bounds on observation lists: generous mechanical limits, never a completeness policy. */
const MAX_OBSERVED_IDS = 5000;
const MAX_OBSERVED_DIAGNOSTICS = 2000;

// ------------------------------------------------------------------ the record-set digest

export interface RecordSetEntry {
  readonly recordType: StoredRecordType;
  readonly recordId: string;
  readonly contentDigest: string;
}

export type RecordSetResult =
  | {
      readonly outcome: 'COMPUTED';
      readonly recordSetDigest: string;
      readonly recordCount: number;
      readonly entries: readonly RecordSetEntry[];
    }
  | { readonly outcome: 'REFUSED'; readonly code: CompanionRefusalCode; readonly detail: string };

const MEMBERSHIP_ENTRY_KEYS = ['contentDigest', 'provenance', 'recordId', 'recordType', 'roles'];
const typeRank = (t: MembershipRecordType) => MEMBERSHIP_RECORD_TYPES.indexOf(t);

/**
 * The membership's record-set entries, after the manifest's S0 digests are
 * recomputed and - when `input` is given - the manifest is reproduced from it.
 * Identity follows S0: one entry per registry id across every registry record
 * type (the same entry twice is a duplicate; the same id with another type or
 * digest a conflict), and one per source-global key. Only stored evidence
 * records become entries: a source global is checked and refused like any
 * other entry, then left out; a type in neither rule list is refused.
 */
function recordSetEntriesOf(manifest: unknown, input: unknown): RecordSetEntry[] {
  if (!isPlainObject(manifest)) refuse('MANIFEST_SHAPE_UNSUPPORTED', 'manifest_not_an_object');
  if (verifySnapshotScopeManifest(manifest).contentDigestConsistency !== 'CONSISTENT') {
    refuse('MANIFEST_DIGEST_INCONSISTENT', 'manifest');
  }
  if (input !== undefined) {
    const reproduced = reproduceSnapshotScopeManifest(
      input,
      manifest as unknown as SnapshotScopeManifest,
    );
    if (reproduced !== 'REPRODUCED') refuse('MANIFEST_NOT_REPRODUCED', 'input');
  }
  const membership = (manifest as { membership?: unknown }).membership;
  const raw = isPlainObject(membership) ? membership['entries'] : undefined;
  if (!Array.isArray(raw)) refuse('MANIFEST_SHAPE_UNSUPPORTED', 'membership.entries');
  const entries: RecordSetEntry[] = [];
  const byRegistryId = new Map<string, string>();
  const byGlobalKey = new Set<string>();
  for (const item of raw as unknown[]) {
    if (!isPlainObject(item)) refuse('MANIFEST_SHAPE_UNSUPPORTED', 'membership.entry');
    const keys = Object.keys(item).sort();
    if (!sameList(keys, MEMBERSHIP_ENTRY_KEYS)) {
      refuse('MANIFEST_SHAPE_UNSUPPORTED', 'membership.entry_keys');
    }
    const { recordType, recordId, contentDigest } = item;
    if (!oneOf(MEMBERSHIP_RECORD_TYPES, recordType)) {
      refuse('MANIFEST_SHAPE_UNSUPPORTED', 'membership.entry.recordType');
    }
    if (typeof contentDigest !== 'string' || !HEX64.test(contentDigest)) {
      refuse('MANIFEST_SHAPE_UNSUPPORTED', 'membership.entry.contentDigest');
    }
    if (recordType === 'SOURCE_GLOBAL') {
      if (!oneOf(SOURCE_GLOBAL_RECORD_IDS, recordId)) {
        refuse('MANIFEST_SHAPE_UNSUPPORTED', 'membership.entry.sourceGlobal');
      }
      if (byGlobalKey.has(recordId))
        refuse('DUPLICATE_RECORD_IDENTITY', `SOURCE_GLOBAL:${recordId}`);
      byGlobalKey.add(recordId);
      // A source-global status, not a stored record: the manifest digest binds it.
      continue;
    }
    if (!oneOf(RECORD_SET_RULE.includedRecordTypes, recordType)) {
      refuse('MANIFEST_SHAPE_UNSUPPORTED', 'membership.entry.recordType');
    }
    if (typeof recordId !== 'string' || !UUID.test(recordId)) {
      refuse('MANIFEST_SHAPE_UNSUPPORTED', 'membership.entry.recordId');
    }
    const line = `${recordType}\u0000${contentDigest}`;
    const seen = byRegistryId.get(recordId);
    if (seen !== undefined) {
      refuse(
        seen === line ? 'DUPLICATE_RECORD_IDENTITY' : 'CONFLICTING_RECORD_ENTRY',
        `${recordType}:${recordId}`,
      );
    }
    byRegistryId.set(recordId, line);
    entries.push({ recordType, recordId, contentDigest });
  }
  return entries.sort((a, b) =>
    a.recordType === b.recordType
      ? a.recordId < b.recordId
        ? -1
        : 1
      : typeRank(a.recordType) - typeRank(b.recordType),
  );
}

/**
 * The records-only digest of one S0 manifest (see the file header). `input`,
 * when given, must reproduce the manifest exactly. Never throws on bad input:
 * it refuses.
 */
export function recordSetDigestOf(manifest: unknown, input?: unknown): RecordSetResult {
  try {
    const entries = recordSetEntriesOf(manifest, input);
    return {
      outcome: 'COMPUTED',
      recordSetDigest: digestOf('record-set', entries as unknown as CanonicalValue),
      recordCount: entries.length,
      entries,
    };
  } catch (error) {
    if (error instanceof AcquisitionCompanionRefusal) {
      return { outcome: 'REFUSED', code: error.code, detail: error.detail };
    }
    // A manifest S0's own verifier could not even walk is malformed, never "consistent".
    return { outcome: 'REFUSED', code: 'MANIFEST_SHAPE_UNSUPPORTED', detail: 'manifest' };
  }
}

// ------------------------------------------------------------------ observations

/** How the shared-identifier holder statement ended, as the loader reported it. */
export interface HolderQueryObservation {
  readonly outcome: LoaderEnumerationOutcome;
  readonly basis: (typeof HOLDER_BASES)[number];
  readonly queryLimit: number;
  readonly includedCap: number;
  readonly includedSubjectIds: readonly string[];
}

/** How the direct incoming relationship-claim statement ended, as the loader reported it. */
export interface IncomingQueryObservation {
  readonly outcome: LoaderEnumerationOutcome;
  readonly basis: (typeof INCOMING_BASES)[number];
  readonly queryLimit: number;
  readonly includedCap: number;
  readonly includedClaims: readonly { readonly id: string; readonly subjectId: string }[];
}

/** How the source-subject row read ended, as the loader reported it. */
export interface SourceRowReadObservation {
  readonly outcome: (typeof LOADER_SOURCE_ROW_OUTCOMES)[number];
  readonly requestedSubjectIds: readonly string[];
  readonly readSubjectIds: readonly string[];
  readonly unreadSubjectIds: readonly string[];
}

/** How the incoming-claim review read ended, as the loader reported it. */
export interface ClaimReviewReadObservation {
  readonly outcome: (typeof LOADER_REVIEW_READ_OUTCOMES)[number];
  readonly requestedClaimIds: readonly string[];
  readonly reviews: readonly {
    readonly id: string;
    readonly claimId: string;
    readonly supersedesReviewId: string | null;
  }[];
  readonly attestationReferences: readonly { readonly id: string; readonly reviewId: string }[];
}

/** The subjects and relationship claims of the loader's own graph, before any incoming addition. */
export interface BaseGraphObservation {
  readonly subjectIds: readonly string[];
  readonly relationshipClaims: readonly {
    readonly id: string;
    readonly subjectId: string;
    readonly targetSubjectId: string | null;
  }[];
}

export interface ObservedFinding {
  readonly severity: string;
  readonly code: string;
  readonly recordId: string;
  readonly subjectId: string | null;
  readonly field: string | null;
}

/** What the validated read reported beside the manifest: coverage, and what it withheld. */
export interface ValidationObservation {
  readonly ruleVersion: string;
  readonly focalCoverage: 'REPRESENTED' | 'INCOMPLETE' | 'UNKNOWN';
  readonly focalCoverageGaps: readonly string[];
  readonly withheld: readonly {
    readonly partition: 'NEIGHBOUR_RECORD' | 'UNSUPPLIED_RECORD';
    readonly finding: ObservedFinding;
  }[];
}

/** Everything the companion is built from beside the manifest. All of it is assembler-reported. */
export interface AcquisitionObservations {
  readonly holderQuery: HolderQueryObservation;
  readonly incomingQuery: IncomingQueryObservation;
  readonly sourceRowRead: SourceRowReadObservation;
  readonly claimReviewRead: ClaimReviewReadObservation;
  readonly baseGraph: BaseGraphObservation;
  /** Null when the validator did not run. */
  readonly validation: ValidationObservation | null;
}

const OBSERVATION_KEYS = [
  'baseGraph',
  'claimReviewRead',
  'holderQuery',
  'incomingQuery',
  'sourceRowRead',
  'validation',
];
const FINDING_KEYS = ['code', 'field', 'recordId', 'severity', 'subjectId'];
const FINDING_SEVERITIES = ['INVALID', 'CONFLICT', 'UNRESOLVED', 'REVIEW_SIGNAL'];
const FINDING_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const GAP = /^[A-Z][A-Z0-9_]{0,127}$/;

function checkLimits(o: Record<string, unknown>, limit: number, cap: number, what: string) {
  if (o['queryLimit'] !== limit || o['includedCap'] !== cap) {
    refuse('READ_PROTOCOL_MISMATCH', `${what}.limits`);
  }
}

function checkFinding(raw: unknown, what: string): ObservedFinding {
  const f = exactKeys(raw, FINDING_KEYS, what);
  if (!oneOf(FINDING_SEVERITIES, f['severity'])) {
    refuse('OBSERVATION_SHAPE_UNSUPPORTED', `${what}.severity`);
  }
  if (typeof f['code'] !== 'string' || !FINDING_CODE.test(f['code'])) {
    refuse('OBSERVATION_SHAPE_UNSUPPORTED', `${what}.code`);
  }
  const recordId = f['recordId'];
  if (typeof recordId !== 'string' || (recordId !== 'input' && !UUID.test(recordId))) {
    refuse('OBSERVATION_SHAPE_UNSUPPORTED', `${what}.recordId`);
  }
  const field = f['field'];
  if (field !== null && (typeof field !== 'string' || !FIELD_NAME.test(field))) {
    refuse('OBSERVATION_SHAPE_UNSUPPORTED', `${what}.field`);
  }
  return {
    severity: f['severity'],
    code: f['code'],
    recordId,
    subjectId: uuidOrNull(f['subjectId'], `${what}.subjectId`),
    field,
  };
}

/**
 * The closed observation shape, normalised: every id list ascending and
 * duplicate-free, every limit the fixed read protocol's, every loader outcome
 * consistent with its own basis and included rows. Input order never matters.
 */
function checkObservations(raw: unknown, focal: string): AcquisitionObservations {
  if (raw === undefined || raw === null) refuse('OBSERVATION_MISSING', 'observations');
  const o = exactKeys(raw, OBSERVATION_KEYS, 'observations');
  for (const key of OBSERVATION_KEYS) {
    if (key !== 'validation' && (o[key] === null || o[key] === undefined)) {
      refuse('OBSERVATION_MISSING', key);
    }
  }

  // ---- holders.
  const h = exactKeys(
    o['holderQuery'],
    ['basis', 'includedCap', 'includedSubjectIds', 'outcome', 'queryLimit'],
    'holderQuery',
  );
  checkLimits(h, HOLDER_QUERY_LIMIT, HOLDER_INCLUDED_CAP, 'holderQuery');
  if (!oneOf(LOADER_ENUMERATION_OUTCOMES, h['outcome']) || !oneOf(HOLDER_BASES, h['basis'])) {
    refuse('OBSERVATION_SHAPE_UNSUPPORTED', 'holderQuery.outcome');
  }
  const holderIds = uuidSet(h['includedSubjectIds'], HOLDER_INCLUDED_CAP, 'holderQuery.ids');
  if (holderIds.includes(focal)) refuse('OBSERVATION_INCONSISTENT', 'holderQuery.focal_included');
  const holderPair = `${h['outcome']}/${h['basis']}`;
  if (!(
    holderPair === 'EXHAUSTIVE/NO_FOCAL_EXTERNAL_IDENTIFIER' ||
    holderPair === 'EXHAUSTIVE/QUERY_RETURNED_FEWER_ROWS_THAN_ITS_LIMIT' ||
    holderPair === 'TRUNCATED/QUERY_RETURNED_A_ROW_BEYOND_THE_INCLUDED_CAP' ||
    holderPair === 'UNKNOWN/QUERY_RESULT_NOT_DISTINCT_ORDERED_AND_BOUNDED'
  )) {
    refuse('OBSERVATION_INCONSISTENT', 'holderQuery.outcome_basis');
  }
  if (
    (h['basis'] === 'NO_FOCAL_EXTERNAL_IDENTIFIER' || h['outcome'] === 'UNKNOWN') &&
    holderIds.length > 0
  ) {
    refuse('OBSERVATION_INCONSISTENT', 'holderQuery.ids_without_enumeration');
  }
  if (h['outcome'] === 'TRUNCATED' && holderIds.length !== HOLDER_INCLUDED_CAP) {
    refuse('OBSERVATION_INCONSISTENT', 'holderQuery.truncated_below_cap');
  }

  // ---- incoming.
  const i = exactKeys(
    o['incomingQuery'],
    ['basis', 'includedCap', 'includedClaims', 'outcome', 'queryLimit'],
    'incomingQuery',
  );
  checkLimits(i, INCOMING_QUERY_LIMIT, INCOMING_INCLUDED_CAP, 'incomingQuery');
  if (!oneOf(LOADER_ENUMERATION_OUTCOMES, i['outcome']) || !oneOf(INCOMING_BASES, i['basis'])) {
    refuse('OBSERVATION_SHAPE_UNSUPPORTED', 'incomingQuery.outcome');
  }
  if (!Array.isArray(i['includedClaims']) || i['includedClaims'].length > INCOMING_INCLUDED_CAP) {
    refuse('OBSERVATION_SHAPE_UNSUPPORTED', 'incomingQuery.includedClaims');
  }
  const includedClaims = (i['includedClaims'] as unknown[])
    .map((c) => {
      const claim = exactKeys(c, ['id', 'subjectId'], 'incomingQuery.claim');
      return {
        id: uuid(claim['id'], 'incomingQuery.claim.id'),
        subjectId: uuid(claim['subjectId'], 'incomingQuery.claim.subjectId'),
      };
    })
    .sort(byId);
  if (new Set(includedClaims.map((c) => c.id)).size !== includedClaims.length) {
    refuse('OBSERVATION_SHAPE_UNSUPPORTED', 'incomingQuery.claim_duplicate');
  }
  if (includedClaims.some((c) => c.subjectId === focal)) {
    refuse('OBSERVATION_INCONSISTENT', 'incomingQuery.focal_source');
  }
  const incomingPair = `${i['outcome']}/${i['basis']}`;
  if (!(
    incomingPair === 'EXHAUSTIVE/QUERY_RETURNED_FEWER_ROWS_THAN_ITS_LIMIT' ||
    incomingPair === 'TRUNCATED/QUERY_RETURNED_A_ROW_BEYOND_THE_INCLUDED_CAP' ||
    incomingPair === 'UNKNOWN/QUERY_RESULT_NOT_DISTINCT_ORDERED_BOUNDED_AND_DIRECT'
  )) {
    refuse('OBSERVATION_INCONSISTENT', 'incomingQuery.outcome_basis');
  }
  if (i['outcome'] === 'UNKNOWN' && includedClaims.length > 0) {
    refuse('OBSERVATION_INCONSISTENT', 'incomingQuery.claims_without_enumeration');
  }
  if (i['outcome'] === 'TRUNCATED' && includedClaims.length !== INCOMING_INCLUDED_CAP) {
    refuse('OBSERVATION_INCONSISTENT', 'incomingQuery.truncated_below_cap');
  }

  // ---- source-subject rows.
  const s = exactKeys(
    o['sourceRowRead'],
    ['outcome', 'readSubjectIds', 'requestedSubjectIds', 'unreadSubjectIds'],
    'sourceRowRead',
  );
  if (!oneOf(LOADER_SOURCE_ROW_OUTCOMES, s['outcome'])) {
    refuse('OBSERVATION_SHAPE_UNSUPPORTED', 'sourceRowRead.outcome');
  }
  const requested = uuidSet(s['requestedSubjectIds'], INCOMING_INCLUDED_CAP, 'sourceRowRead.req');
  const read = uuidSet(s['readSubjectIds'], INCOMING_INCLUDED_CAP, 'sourceRowRead.read');
  const unread = uuidSet(s['unreadSubjectIds'], INCOMING_INCLUDED_CAP, 'sourceRowRead.unread');
  if (!sameList([...read, ...unread].sort(), requested) || read.some((x) => unread.includes(x))) {
    refuse('OBSERVATION_INCONSISTENT', 'sourceRowRead.partition');
  }
  const sourceOutcome = s['outcome'];
  if (
    (sourceOutcome === 'NONE_REQUESTED' && requested.length > 0) ||
    (sourceOutcome === 'EVERY_REQUESTED_ROW_READ' &&
      (requested.length === 0 || unread.length > 0)) ||
    (sourceOutcome === 'REQUESTED_ROWS_ABSENT' && unread.length === 0) ||
    (sourceOutcome === 'UNKNOWN' && read.length > 0)
  ) {
    refuse('OBSERVATION_INCONSISTENT', 'sourceRowRead.outcome_rows');
  }

  // ---- incoming-claim reviews.
  const r = exactKeys(
    o['claimReviewRead'],
    ['attestationReferences', 'outcome', 'requestedClaimIds', 'reviews'],
    'claimReviewRead',
  );
  if (!oneOf(LOADER_REVIEW_READ_OUTCOMES, r['outcome'])) {
    refuse('OBSERVATION_SHAPE_UNSUPPORTED', 'claimReviewRead.outcome');
  }
  const requestedClaims = uuidSet(r['requestedClaimIds'], INCOMING_INCLUDED_CAP, 'reviews.req');
  if (!Array.isArray(r['reviews']) || r['reviews'].length > REVIEW_STATEMENT_ROW_BOUND) {
    refuse('OBSERVATION_SHAPE_UNSUPPORTED', 'claimReviewRead.reviews');
  }
  const reviews = (r['reviews'] as unknown[])
    .map((v) => {
      const review = exactKeys(
        v,
        ['claimId', 'id', 'supersedesReviewId'],
        'claimReviewRead.review',
      );
      return {
        id: uuid(review['id'], 'review.id'),
        claimId: uuid(review['claimId'], 'review.claimId'),
        supersedesReviewId: uuidOrNull(review['supersedesReviewId'], 'review.supersedes'),
      };
    })
    .sort(byId);
  if (
    !Array.isArray(r['attestationReferences']) ||
    r['attestationReferences'].length > REVIEW_STATEMENT_ROW_BOUND
  ) {
    refuse('OBSERVATION_SHAPE_UNSUPPORTED', 'claimReviewRead.attestationReferences');
  }
  const references = (r['attestationReferences'] as unknown[])
    .map((a) => {
      const ref = exactKeys(a, ['id', 'reviewId'], 'claimReviewRead.reference');
      return { id: uuid(ref['id'], 'reference.id'), reviewId: uuid(ref['reviewId'], 'reference') };
    })
    .sort(byId);
  const reviewClaim = new Map(reviews.map((v) => [v.id, v.claimId]));
  if (
    reviewClaim.size !== reviews.length ||
    new Set(references.map((a) => a.id)).size !== references.length ||
    new Set(references.map((a) => a.reviewId)).size !== references.length
  ) {
    refuse('OBSERVATION_SHAPE_UNSUPPORTED', 'claimReviewRead.duplicate');
  }
  const reviewOutcome = r['outcome'];
  if (
    reviewOutcome !== 'EVERY_MATCHING_ROW_READ' &&
    (reviews.length > 0 || references.length > 0)
  ) {
    refuse('OBSERVATION_INCONSISTENT', 'claimReviewRead.rows_without_read');
  }
  if (reviewOutcome === 'NONE_REQUESTED' && requestedClaims.length > 0) {
    refuse('OBSERVATION_INCONSISTENT', 'claimReviewRead.requested_none');
  }
  if (reviewOutcome === 'EVERY_MATCHING_ROW_READ' && requestedClaims.length === 0) {
    refuse('OBSERVATION_INCONSISTENT', 'claimReviewRead.read_nothing_requested');
  }
  for (const v of reviews) {
    if (!requestedClaims.includes(v.claimId)) {
      refuse('OBSERVATION_INCONSISTENT', 'claimReviewRead.review_outside_request');
    }
    if (v.supersedesReviewId !== null && reviewClaim.get(v.supersedesReviewId) !== v.claimId) {
      refuse('OBSERVATION_INCONSISTENT', 'claimReviewRead.predecessor_not_read');
    }
  }
  if (references.some((a) => !reviewClaim.has(a.reviewId))) {
    refuse('OBSERVATION_INCONSISTENT', 'claimReviewRead.reference_without_review');
  }

  // ---- base graph.
  const b = exactKeys(o['baseGraph'], ['relationshipClaims', 'subjectIds'], 'baseGraph');
  const baseSubjects = uuidSet(b['subjectIds'], MAX_OBSERVED_IDS, 'baseGraph.subjectIds');
  if (!baseSubjects.includes(focal)) refuse('OBSERVATION_INCONSISTENT', 'baseGraph.focal');
  if (
    !Array.isArray(b['relationshipClaims']) ||
    b['relationshipClaims'].length > MAX_OBSERVED_IDS
  ) {
    refuse('OBSERVATION_SHAPE_UNSUPPORTED', 'baseGraph.relationshipClaims');
  }
  const baseClaims = (b['relationshipClaims'] as unknown[])
    .map((c) => {
      const claim = exactKeys(c, ['id', 'subjectId', 'targetSubjectId'], 'baseGraph.claim');
      return {
        id: uuid(claim['id'], 'baseGraph.claim.id'),
        subjectId: uuid(claim['subjectId'], 'baseGraph.claim.subjectId'),
        targetSubjectId: uuidOrNull(claim['targetSubjectId'], 'baseGraph.claim.target'),
      };
    })
    .sort(byId);
  if (new Set(baseClaims.map((c) => c.id)).size !== baseClaims.length) {
    refuse('OBSERVATION_SHAPE_UNSUPPORTED', 'baseGraph.claim_duplicate');
  }

  // ---- validation.
  let validation: ValidationObservation | null = null;
  if (o['validation'] !== null) {
    const v = exactKeys(
      o['validation'],
      ['focalCoverage', 'focalCoverageGaps', 'ruleVersion', 'withheld'],
      'validation',
    );
    if (v['ruleVersion'] !== ACCEPTED_VALIDATOR_RULE_VERSION) {
      refuse('READ_PROTOCOL_MISMATCH', 'validation.ruleVersion');
    }
    if (!oneOf(['REPRESENTED', 'INCOMPLETE', 'UNKNOWN'] as const, v['focalCoverage'])) {
      refuse('OBSERVATION_SHAPE_UNSUPPORTED', 'validation.focalCoverage');
    }
    const gaps = v['focalCoverageGaps'];
    if (
      !Array.isArray(gaps) ||
      gaps.length > 16 ||
      gaps.some((g) => typeof g !== 'string' || !GAP.test(g))
    ) {
      refuse('OBSERVATION_SHAPE_UNSUPPORTED', 'validation.focalCoverageGaps');
    }
    const sortedGaps = [...new Set(gaps as string[])].sort();
    if (sortedGaps.length !== gaps.length) {
      refuse('OBSERVATION_SHAPE_UNSUPPORTED', 'validation.focalCoverageGaps_duplicate');
    }
    if ((v['focalCoverage'] === 'REPRESENTED') !== (sortedGaps.length === 0)) {
      refuse('OBSERVATION_INCONSISTENT', 'validation.coverage_gaps');
    }
    const withheldRaw = v['withheld'];
    if (!Array.isArray(withheldRaw) || withheldRaw.length > MAX_OBSERVED_DIAGNOSTICS) {
      refuse('OBSERVATION_SHAPE_UNSUPPORTED', 'validation.withheld');
    }
    const withheld = (withheldRaw as unknown[]).map((w) => {
      const entry = exactKeys(w, ['finding', 'partition'], 'validation.withheld.entry');
      if (!oneOf(['NEIGHBOUR_RECORD', 'UNSUPPLIED_RECORD'] as const, entry['partition'])) {
        refuse('OBSERVATION_SHAPE_UNSUPPORTED', 'validation.withheld.partition');
      }
      const finding = checkFinding(entry['finding'], 'validation.withheld.finding');
      if (finding.recordId === 'input') {
        refuse('OBSERVATION_INCONSISTENT', 'validation.withheld.input_finding');
      }
      return { partition: entry['partition'], finding };
    });
    const line = (w: (typeof withheld)[number]) =>
      companionCanonicalJson(w as unknown as CanonicalValue);
    const lines = withheld.map(line);
    if (new Set(lines).size !== lines.length) {
      refuse('OBSERVATION_SHAPE_UNSUPPORTED', 'validation.withheld_duplicate');
    }
    validation = {
      ruleVersion: ACCEPTED_VALIDATOR_RULE_VERSION,
      focalCoverage: v['focalCoverage'],
      focalCoverageGaps: sortedGaps,
      withheld: withheld
        .map((w, k) => ({ w, l: lines[k]! }))
        .sort((x, y) => (x.l < y.l ? -1 : 1))
        .map(({ w }) => w),
    };
  }

  return {
    holderQuery: {
      outcome: h['outcome'],
      basis: h['basis'],
      queryLimit: HOLDER_QUERY_LIMIT,
      includedCap: HOLDER_INCLUDED_CAP,
      includedSubjectIds: holderIds,
    },
    incomingQuery: {
      outcome: i['outcome'],
      basis: i['basis'],
      queryLimit: INCOMING_QUERY_LIMIT,
      includedCap: INCOMING_INCLUDED_CAP,
      includedClaims,
    },
    sourceRowRead: {
      outcome: sourceOutcome,
      requestedSubjectIds: requested,
      readSubjectIds: read,
      unreadSubjectIds: unread,
    },
    claimReviewRead: {
      outcome: reviewOutcome,
      requestedClaimIds: requestedClaims,
      reviews,
      attestationReferences: references,
    },
    baseGraph: { subjectIds: baseSubjects, relationshipClaims: baseClaims },
    validation,
  };
}

// ------------------------------------------------------------------ the companion

export interface AcquisitionCompanionBody {
  readonly contract: typeof ACQUISITION_COMPANION_CONTRACT;
  readonly contractStatus: typeof ACQUISITION_COMPANION_CONTRACT_STATUS;
  readonly assembler: typeof ASSEMBLER_IDENTITY;
  readonly focalSubjectId: string;
  readonly focalSubjectIdRole: 'B_LOCAL_EVIDENCE_CONTAINER_ID_NOT_CANONICAL';
  readonly binding: {
    readonly snapshotContract: string;
    readonly snapshotManifestDigest: string;
    readonly snapshotReproduction: 'REPRODUCED_FROM_THE_SUPPLIED_S0_INPUT_WHEN_BUILT';
    readonly recordSetDigest: string;
    readonly recordCount: number;
    readonly recordSetRule: typeof RECORD_SET_RULE;
  };
  /** The normalised observations, as the assembler reported them. Never authenticated. */
  readonly observations: AcquisitionObservations;
  readonly holders: {
    readonly predicate: string;
    readonly queryLimit: number;
    readonly includedCap: number;
    readonly status: EnumerationStatus;
    readonly beyondIncluded: string;
    readonly includedSubjectIds: readonly string[];
    readonly sentinelRow: 'NEVER_EXPORTED';
  };
  readonly incoming: {
    readonly predicate: string;
    readonly queryLimit: number;
    readonly includedCap: number;
    readonly status: EnumerationStatus;
    readonly beyondIncluded: string;
    readonly includedClaimIds: readonly string[];
    readonly sentinelRow: 'NEVER_EXPORTED';
  };
  readonly sourceSubjects: {
    readonly predicate: string;
    readonly status: string;
    readonly requestedSubjectIds: readonly string[];
    readonly readSubjectIds: readonly string[];
    readonly unreadSubjectIds: readonly string[];
    readonly rowOnlySubjectIds: readonly string[];
    readonly subjects: readonly {
      readonly subjectId: string;
      readonly claimIds: readonly string[];
      readonly acquisition: SourceSubjectAcquisition;
      readonly evidenceDepth: EvidenceDepth | 'NOT_READ';
      readonly suppliedToManifest: boolean;
    }[];
  };
  readonly subjectEvidence: {
    readonly depths: typeof EVIDENCE_DEPTHS;
    readonly subjects: readonly { readonly subjectId: string; readonly depth: EvidenceDepth }[];
    readonly examination: 'NO_SUBJECT_IS_STATED_COMPLETELY_EXAMINED';
  };
  readonly claimReviewReads: {
    readonly predicate: string;
    readonly status: string;
    readonly statementRowBound: number;
    readonly beyondBound: 'WHOLE_READ_REFUSED_BY_THROWING_NO_RESULT_NO_COMPANION';
    readonly requestedClaimIds: readonly string[];
    readonly targets: readonly {
      readonly claimId: string;
      readonly sourceSubjectId: string;
      readonly status: ReviewReadStatus;
      readonly basis: string;
      readonly reviewIds: readonly string[];
      readonly supersededReviewIds: readonly string[];
      readonly attestationReferenceIds: readonly string[];
      readonly reviewIdsWithoutAttestationReference: readonly string[];
    }[];
    readonly headReview: 'NOT_PROVEN_LATEST_SOURCE_TAIL_UNKNOWN';
  };
  readonly validation: {
    readonly execution: 'NOT_RUN' | 'RAN_IN_THE_ASSEMBLY_ASSEMBLER_REPORTED';
    readonly ruleVersion: string | null;
    readonly coverage: {
      readonly INPUT: 'REPRESENTED' | 'NOT_RUN';
      readonly FOCAL_RECORD: 'REPRESENTED' | 'INCOMPLETE' | 'UNKNOWN' | 'NOT_RUN';
      readonly NEIGHBOUR_RECORD: 'WITHHELD_BY_POLICY' | 'NOT_RUN';
      readonly UNSUPPLIED_RECORD: 'WITHHELD_BY_POLICY' | 'NOT_RUN';
    };
    readonly focalCoverageGaps: readonly string[];
    readonly publishedFindingCount: { readonly input: number; readonly focalRecord: number };
    readonly withheld: {
      readonly status: 'UNTRUSTED_DIAGNOSTICS_NOT_FINDINGS_NOT_IN_THE_MANIFEST';
      readonly neighbourRecord: number;
      readonly unsuppliedRecord: number;
      readonly diagnosticsDigest: string;
    };
    readonly policy: typeof VALIDATION_POLICY;
  };
  readonly readProtocol: typeof READ_PROTOCOL;
  readonly clock: typeof CLOCK_TREATMENT;
  readonly authenticity: typeof AUTHENTICITY;
  readonly permissions: typeof PERMISSIONS;
  readonly canonicalIssuer: typeof CANONICAL_ISSUER;
}

export interface AcquisitionCompanion extends AcquisitionCompanionBody {
  /** Over every other field. Recomputable by anyone: a consistency check, never an authenticator. */
  readonly acquisitionDigest: string;
}

export type AcquisitionCompanionResult =
  | {
      readonly outcome: 'BUILT';
      readonly companion: AcquisitionCompanion;
      readonly canonical: string;
    }
  | { readonly outcome: 'REFUSED'; readonly code: CompanionRefusalCode; readonly detail: string };

export interface AcquisitionCompanionArgs {
  readonly manifest: SnapshotScopeManifest;
  readonly input: SnapshotScopeInput;
  readonly observations: AcquisitionObservations;
}

const HOLDER_ENUMERATION_OF: { readonly [K in LoaderEnumerationOutcome]: string } = {
  EXHAUSTIVE: 'EXHAUSTIVE_AS_DECLARED',
  TRUNCATED: 'TRUNCATED',
  UNKNOWN: 'UNKNOWN',
};
const DECLARATION_OF: { readonly [K in LoaderEnumerationOutcome]: string } = {
  EXHAUSTIVE: 'REPRESENTED',
  TRUNCATED: 'INCOMPLETE',
  UNKNOWN: 'UNKNOWN',
};

type InputRecord = Readonly<Record<string, string | null>>;

function build(
  manifest: SnapshotScopeManifest,
  input: unknown,
  raw: unknown,
): AcquisitionCompanion {
  if (input === undefined || input === null) refuse('MANIFEST_NOT_REPRODUCED', 'input_missing');
  const recordSet = recordSetEntriesOf(manifest, input);
  const recordSetDigest = digestOf('record-set', recordSet as unknown as CanonicalValue);
  const focal = manifest.focalSubjectId;
  const obs = checkObservations(raw, focal);
  const inconsistent = (why: string): never =>
    refuse('OBSERVATION_INCONSISTENT_WITH_MANIFEST', why);

  // The manifest was reproduced from `input`, so its records ARE these.
  const records = (input as SnapshotScopeInput).records as unknown as {
    readonly [
      K in 'subjects' | 'identityClaims' | 'relationshipClaims' | 'reviews'
    ]: readonly InputRecord[];
  };
  const member = new Set(manifest.membership.entries.map((e) => `${e.recordType}:${e.recordId}`));
  const has = (type: MembershipRecordType, id: string) => member.has(`${type}:${id}`);
  const memberIds = (type: MembershipRecordType) =>
    manifest.membership.entries.filter((e) => e.recordType === type).map((e) => e.recordId);
  const categories = manifest.scope.categories;

  // ---- holders: the manifest states exactly this enumeration, and no other.
  const holder = obs.holderQuery;
  const holderScope = manifest.scope.sharedIdentifierHolders;
  if (
    !sameList(holderScope.holderSubjectIds, holder.includedSubjectIds) ||
    holderScope.bound !== holder.queryLimit ||
    holderScope.enumeration !== HOLDER_ENUMERATION_OF[holder.outcome] ||
    categories.SHARED_IDENTIFIER_HOLDERS !== DECLARATION_OF[holder.outcome]
  ) {
    inconsistent('holders');
  }
  const focalHasExternalIdentifier = records.identityClaims.some(
    (c) => c['subjectId'] === focal && c['claimKind'] === 'EXTERNAL_IDENTIFIER',
  );
  if (focalHasExternalIdentifier !== (holder.basis !== 'NO_FOCAL_EXTERNAL_IDENTIFIER')) {
    inconsistent('holders.predicate_membership');
  }
  const holderStatus: EnumerationStatus =
    holder.outcome === 'UNKNOWN'
      ? 'UNKNOWN'
      : holder.outcome === 'TRUNCATED'
        ? 'TRUNCATED_AT_INCLUDED_CAP'
        : holder.basis === 'NO_FOCAL_EXTERNAL_IDENTIFIER'
          ? 'NOT_REQUESTED'
          : holder.includedSubjectIds.length === 0
            ? 'EMPTY_AS_OF_SNAPSHOT'
            : 'EXHAUSTIVE_AS_OF_SNAPSHOT';

  // ---- incoming: the manifest's category and directions, and exactly these claims.
  const incoming = obs.incomingQuery;
  const incomingKnown = incoming.outcome !== 'UNKNOWN';
  const directions = [...manifest.scope.relationshipDirectionsExamined].sort();
  if (
    categories.INCOMING_RELATIONSHIP_CLAIMS !== DECLARATION_OF[incoming.outcome] ||
    !sameList(directions, incomingKnown ? ['INCOMING', 'OUTGOING'] : ['OUTGOING'])
  ) {
    inconsistent('incoming.declaration');
  }
  const inputClaim = new Map(records.relationshipClaims.map((r) => [r['id']!, r]));
  for (const c of incoming.includedClaims) {
    const r = inputClaim.get(c.id);
    if (r === undefined || r['subjectId'] !== c.subjectId || r['targetSubjectId'] !== focal) {
      inconsistent('incoming.claim_not_supplied');
    }
  }
  const includedIds = new Set(incoming.includedClaims.map((c) => c.id));
  const suppliedIncoming = records.relationshipClaims.filter(
    (r) => r['subjectId'] !== focal && r['targetSubjectId'] === focal,
  );
  if (
    incoming.outcome === 'EXHAUSTIVE' &&
    suppliedIncoming.some((r) => !includedIds.has(r['id']!))
  ) {
    // Every claim matching the predicate is in an exhaustive enumeration.
    inconsistent('incoming.supplied_claim_not_enumerated');
  }
  const incomingStatus: EnumerationStatus =
    incoming.outcome === 'UNKNOWN'
      ? 'UNKNOWN'
      : incoming.outcome === 'TRUNCATED'
        ? 'TRUNCATED_AT_INCLUDED_CAP'
        : incoming.includedClaims.length === 0
          ? 'EMPTY_AS_OF_SNAPSHOT'
          : 'EXHAUSTIVE_AS_OF_SNAPSHOT';

  // ---- base graph and evidence depth: derived from what the loader's statements read.
  const base = obs.baseGraph;
  const baseSubjects = new Set(base.subjectIds);
  if (base.subjectIds.some((id) => !has('SUBJECT', id))) inconsistent('baseGraph.subject');
  if (base.relationshipClaims.some((c) => !has('RELATIONSHIP_CLAIM', c.id))) {
    inconsistent('baseGraph.claim');
  }
  for (const c of base.relationshipClaims) {
    const r = inputClaim.get(c.id)!;
    if (r['subjectId'] !== c.subjectId || (r['targetSubjectId'] ?? null) !== c.targetSubjectId) {
      inconsistent('baseGraph.claim_content');
    }
    if (
      !baseSubjects.has(c.subjectId) ||
      (c.targetSubjectId !== null && !baseSubjects.has(c.targetSubjectId))
    ) {
      inconsistent('baseGraph.claim_reference');
    }
  }
  if (holder.includedSubjectIds.some((id) => !baseSubjects.has(id))) {
    inconsistent('baseGraph.holder_not_held');
  }
  // The PART_OF closure: the focal subject and every target of a loaded claim,
  // each of which the loader's relationship statement was asked about.
  const closure = new Set<string>([focal]);
  for (const c of base.relationshipClaims) {
    if (c.targetSubjectId !== null) closure.add(c.targetSubjectId);
  }
  const depthOf = (id: string): EvidenceDepth =>
    id === focal
      ? 'FOCAL_SUBJECT'
      : closure.has(id)
        ? 'PART_OF_CLOSURE_MEMBER'
        : 'OUTSIDE_PART_OF_CLOSURE';
  for (const id of base.subjectIds) {
    // Outside the closure, a subject is held only as an enumerated holder - or, when the
    // holder result was UNKNOWN, as one of the rows the loader kept from it unreported.
    if (
      depthOf(id) === 'OUTSIDE_PART_OF_CLOSURE' &&
      !holder.includedSubjectIds.includes(id) &&
      holder.outcome !== 'UNKNOWN'
    ) {
      inconsistent('baseGraph.unattributed_subject');
    }
  }

  // ---- source subjects (P1d): the request is fixed by the included claims the base graph lacks.
  const rows = obs.sourceRowRead;
  const namedSources = [...new Set(incoming.includedClaims.map((c) => c.subjectId))].sort();
  const expectedRequest = incomingKnown ? namedSources.filter((id) => !baseSubjects.has(id)) : [];
  if (!sameList(rows.requestedSubjectIds, expectedRequest)) inconsistent('sourceRows.requested');
  if (!incomingKnown && rows.outcome !== 'NONE_REQUESTED') inconsistent('sourceRows.outcome');
  if (expectedRequest.length === 0 && rows.outcome !== 'NONE_REQUESTED') {
    inconsistent('sourceRows.outcome');
  }
  const suppliedSubjects = memberIds('SUBJECT');
  const expectedSupplied = [...new Set([...base.subjectIds, ...rows.readSubjectIds])].sort();
  if (!sameList([...suppliedSubjects].sort(), expectedSupplied)) {
    // Every supplied subject is a base-graph subject or a row read for an included claim.
    inconsistent('sourceRows.supplied_subjects');
  }
  const sourceSubjects = namedSources.map((subjectId) => {
    const acquisition: SourceSubjectAcquisition = baseSubjects.has(subjectId)
      ? 'HELD_BY_BASE_GRAPH'
      : rows.readSubjectIds.includes(subjectId)
        ? 'ROW_ONLY_READ_BY_EXACT_ID'
        : rows.outcome === 'UNKNOWN'
          ? 'NOT_READ_RESULT_UNKNOWN'
          : 'NOT_READ_ABSENT_FROM_SNAPSHOT';
    return {
      subjectId,
      claimIds: incoming.includedClaims.filter((c) => c.subjectId === subjectId).map((c) => c.id),
      acquisition,
      evidenceDepth:
        acquisition === 'HELD_BY_BASE_GRAPH'
          ? depthOf(subjectId)
          : acquisition === 'ROW_ONLY_READ_BY_EXACT_ID'
            ? ('ROW_ONLY' as const)
            : ('NOT_READ' as const),
      suppliedToManifest: has('SUBJECT', subjectId),
    };
  });
  const subjectEvidence = expectedSupplied.map((subjectId) => ({
    subjectId,
    depth: baseSubjects.has(subjectId) ? depthOf(subjectId) : ('ROW_ONLY' as const),
  }));

  // ---- incoming-claim reviews (P1e): requested = included claims the base graph lacks.
  const reviewRead = obs.claimReviewRead;
  const baseClaimIds = new Set(base.relationshipClaims.map((c) => c.id));
  const expectedClaims = incomingKnown
    ? incoming.includedClaims.map((c) => c.id).filter((id) => !baseClaimIds.has(id))
    : [];
  if (!sameList(reviewRead.requestedClaimIds, expectedClaims)) {
    inconsistent('claimReviews.requested');
  }
  if (!incomingKnown && reviewRead.outcome !== 'NONE_REQUESTED') {
    inconsistent('claimReviews.outcome');
  }
  if (expectedClaims.length === 0 && reviewRead.outcome !== 'NONE_REQUESTED') {
    inconsistent('claimReviews.outcome');
  }
  const targetOfReview = new Map(
    records.reviews.map((v) => [v['id']!, v['reviewedRelationshipClaimId'] ?? null]),
  );
  const referencedReview = new Map(
    manifest.reviews.attestationReferences.map((a) => [a.attestationId, a.reviewId]),
  );
  const targets = incoming.includedClaims.map((c) => {
    const requested = reviewRead.requestedClaimIds.includes(c.id);
    const read = requested && reviewRead.outcome === 'EVERY_MATCHING_ROW_READ';
    const reviews = read ? reviewRead.reviews.filter((v) => v.claimId === c.id) : [];
    const reviewIds = reviews.map((v) => v.id);
    const references = reviewRead.attestationReferences.filter((a) =>
      reviewIds.includes(a.reviewId),
    );
    const status: ReviewReadStatus = !requested
      ? 'NOT_REQUESTED'
      : !read
        ? 'UNKNOWN'
        : reviews.length === 0
          ? 'ZERO_MATCHING_ROWS'
          : 'COMPLETE_AS_OF_SNAPSHOT';
    // The manifest holds exactly the reviews read for a requested claim - none when UNKNOWN.
    if (requested) {
      const supplied = [...targetOfReview.entries()]
        .filter(([, target]) => target === c.id)
        .map(([id]) => id)
        .sort();
      if (!sameList(supplied, reviewIds)) inconsistent('claimReviews.supplied_reviews');
      for (const a of references) {
        if (referencedReview.get(a.id) !== a.reviewId) inconsistent('claimReviews.references');
      }
      const suppliedReferences = [...referencedReview.entries()]
        .filter(([, reviewId]) => reviewIds.includes(reviewId))
        .map(([id]) => id)
        .sort();
      if (
        !sameList(
          suppliedReferences,
          references.map((a) => a.id),
        )
      ) {
        inconsistent('claimReviews.supplied_references');
      }
    } else if (!baseClaimIds.has(c.id)) {
      inconsistent('claimReviews.unrequested_claim_not_held');
    }
    const superseded = new Set(reviews.map((v) => v.supersedesReviewId).filter((s) => s !== null));
    const attested = new Set(references.map((a) => a.reviewId));
    return {
      claimId: c.id,
      sourceSubjectId: c.subjectId,
      status,
      basis:
        status === 'NOT_REQUESTED'
          ? 'CLAIM_HELD_BY_BASE_GRAPH_ITS_REVIEWS_READ_BY_THE_BASE_REVIEW_STATEMENT'
          : status === 'UNKNOWN'
            ? 'LOADER_GUARD_REFUSED_THE_RESULT_NO_ROW_USED'
            : 'EVERY_STORED_ROW_RETURNED_WITHIN_THIS_SNAPSHOT_STORED_RECORDS_ONLY',
      reviewIds,
      supersededReviewIds: reviewIds.filter((id) => superseded.has(id)),
      attestationReferenceIds: references.map((a) => a.id),
      reviewIdsWithoutAttestationReference: reviewIds.filter((id) => !attested.has(id)),
    };
  });

  // ---- validation: the manifest states exactly the run (or not) these observations describe.
  const ran = obs.validation;
  const findings = manifest.validation.findings;
  const withheld = ran?.withheld ?? [];
  if (ran === null) {
    if (
      manifest.validation.execution !== 'NOT_RUN' ||
      manifest.validation.ruleVersion !== null ||
      findings.length > 0
    ) {
      inconsistent('validation.not_run');
    }
  } else {
    if (
      manifest.validation.execution !== 'CALLER_ASSERTED_RAN' ||
      manifest.validation.ruleVersion !== ran.ruleVersion ||
      findings.some((f) => f.partition !== 'INPUT' && f.partition !== 'FOCAL_RECORD') ||
      categories.INPUT_SCOPED_FINDINGS !== 'REPRESENTED' ||
      categories.RECORD_SCOPED_FINDINGS !== ran.focalCoverage ||
      categories.NEIGHBOUR_RECORD_FINDINGS !== 'INCOMPLETE'
    ) {
      inconsistent('validation.ran');
    }
    const registry = new Set(
      manifest.membership.entries
        .filter((e) => e.recordType !== 'SOURCE_GLOBAL')
        .map((e) => e.recordId),
    );
    for (const w of withheld) {
      if ((w.partition === 'NEIGHBOUR_RECORD') !== registry.has(w.finding.recordId)) {
        inconsistent('validation.withheld_partition');
      }
    }
  }

  const body: AcquisitionCompanionBody = {
    contract: ACQUISITION_COMPANION_CONTRACT,
    contractStatus: ACQUISITION_COMPANION_CONTRACT_STATUS,
    assembler: ASSEMBLER_IDENTITY,
    focalSubjectId: focal,
    focalSubjectIdRole: 'B_LOCAL_EVIDENCE_CONTAINER_ID_NOT_CANONICAL',
    binding: {
      snapshotContract: manifest.contract,
      snapshotManifestDigest: manifest.manifestDigest,
      snapshotReproduction: 'REPRODUCED_FROM_THE_SUPPLIED_S0_INPUT_WHEN_BUILT',
      recordSetDigest,
      recordCount: recordSet.length,
      recordSetRule: RECORD_SET_RULE,
    },
    observations: obs,
    holders: {
      predicate: READ_PREDICATES.holders,
      queryLimit: holder.queryLimit,
      includedCap: holder.includedCap,
      status: holderStatus,
      beyondIncluded: BEYOND_INCLUDED[holderStatus],
      includedSubjectIds: holder.includedSubjectIds,
      sentinelRow: 'NEVER_EXPORTED',
    },
    incoming: {
      predicate: READ_PREDICATES.incoming,
      queryLimit: incoming.queryLimit,
      includedCap: incoming.includedCap,
      status: incomingStatus,
      beyondIncluded: BEYOND_INCLUDED[incomingStatus],
      includedClaimIds: incoming.includedClaims.map((c) => c.id),
      sentinelRow: 'NEVER_EXPORTED',
    },
    sourceSubjects: {
      predicate: READ_PREDICATES.sourceRows,
      status: incomingKnown ? rows.outcome : 'NOT_REQUESTED_INCOMING_ENUMERATION_UNKNOWN',
      requestedSubjectIds: rows.requestedSubjectIds,
      readSubjectIds: rows.readSubjectIds,
      unreadSubjectIds: rows.unreadSubjectIds,
      rowOnlySubjectIds: sourceSubjects
        .filter((s) => s.acquisition === 'ROW_ONLY_READ_BY_EXACT_ID')
        .map((s) => s.subjectId),
      subjects: sourceSubjects,
    },
    subjectEvidence: {
      depths: EVIDENCE_DEPTHS,
      subjects: subjectEvidence,
      examination: 'NO_SUBJECT_IS_STATED_COMPLETELY_EXAMINED',
    },
    claimReviewReads: {
      predicate: READ_PREDICATES.claimReviewRead,
      status: incomingKnown ? reviewRead.outcome : 'NOT_REQUESTED_INCOMING_ENUMERATION_UNKNOWN',
      statementRowBound: REVIEW_STATEMENT_ROW_BOUND,
      beyondBound: 'WHOLE_READ_REFUSED_BY_THROWING_NO_RESULT_NO_COMPANION',
      requestedClaimIds: reviewRead.requestedClaimIds,
      targets,
      headReview: 'NOT_PROVEN_LATEST_SOURCE_TAIL_UNKNOWN',
    },
    validation: {
      execution: ran === null ? 'NOT_RUN' : 'RAN_IN_THE_ASSEMBLY_ASSEMBLER_REPORTED',
      ruleVersion: ran?.ruleVersion ?? null,
      coverage:
        ran === null
          ? {
              INPUT: 'NOT_RUN',
              FOCAL_RECORD: 'NOT_RUN',
              NEIGHBOUR_RECORD: 'NOT_RUN',
              UNSUPPLIED_RECORD: 'NOT_RUN',
            }
          : {
              INPUT: 'REPRESENTED',
              FOCAL_RECORD: ran.focalCoverage,
              NEIGHBOUR_RECORD: 'WITHHELD_BY_POLICY',
              UNSUPPLIED_RECORD: 'WITHHELD_BY_POLICY',
            },
      focalCoverageGaps: ran?.focalCoverageGaps ?? [],
      publishedFindingCount: {
        input: findings.filter((f) => f.partition === 'INPUT').length,
        focalRecord: findings.filter((f) => f.partition === 'FOCAL_RECORD').length,
      },
      withheld: {
        status: 'UNTRUSTED_DIAGNOSTICS_NOT_FINDINGS_NOT_IN_THE_MANIFEST',
        neighbourRecord: withheld.filter((w) => w.partition === 'NEIGHBOUR_RECORD').length,
        unsuppliedRecord: withheld.filter((w) => w.partition === 'UNSUPPLIED_RECORD').length,
        diagnosticsDigest: digestOf('withheld-diagnostics', withheld as unknown as CanonicalValue),
      },
      policy: VALIDATION_POLICY,
    },
    readProtocol: READ_PROTOCOL,
    clock: CLOCK_TREATMENT,
    authenticity: AUTHENTICITY,
    permissions: PERMISSIONS,
    canonicalIssuer: CANONICAL_ISSUER,
  };
  return { ...body, acquisitionDigest: acquisitionDigestOfBody(body) };
}

/** The acquisition digest over every field except itself. */
export function acquisitionDigestOfBody(body: AcquisitionCompanionBody): string {
  return digestOf('acquisition', body as unknown as CanonicalValue);
}

// ------------------------------------------------------------------ public API

/**
 * Builds the companion of `manifest`, or refuses. Never partial: a refusal
 * produces no companion. `input` must reproduce `manifest` exactly.
 */
export function buildAcquisitionCompanion(
  args: AcquisitionCompanionArgs,
): AcquisitionCompanionResult {
  try {
    if (!isPlainObject(args)) refuse('OBSERVATION_SHAPE_UNSUPPORTED', 'args');
    const companion = build(args.manifest, args.input, args.observations);
    return {
      outcome: 'BUILT',
      companion,
      canonical: companionCanonicalJson(companion as unknown as CanonicalValue),
    };
  } catch (error) {
    if (error instanceof AcquisitionCompanionRefusal) {
      return { outcome: 'REFUSED', code: error.code, detail: error.detail };
    }
    throw error;
  }
}

/** The fixed states no verification here can move. */
const UNPROVEN = Object.freeze({
  sourceCompleteness: 'NOT_PROVEN',
  sourceFreshness: 'NOT_PROVEN',
  exportAuthentication: 'UNAUTHENTICATED',
  queryExecution: 'NOT_PROVEN_BY_ANY_DIGEST',
} as const);

export interface AcquisitionCompanionVerification {
  readonly contentDigestConsistency: 'CONSISTENT' | 'INCONSISTENT';
  readonly inconsistencies: readonly string[];
  readonly sourceCompleteness: 'NOT_PROVEN';
  readonly sourceFreshness: 'NOT_PROVEN';
  readonly exportAuthentication: 'UNAUTHENTICATED';
  readonly queryExecution: 'NOT_PROVEN_BY_ANY_DIGEST';
}

/**
 * Recomputes the companion's acquisition digest, its record-set digest from
 * `manifest` and its reference to the manifest digest, and checks that every
 * fixed statement is still the fixed one. CONSISTENT means only that: anyone
 * who edits a companion can recompute its digests, so a consistent companion
 * is still UNAUTHENTICATED; only `reproduceAcquisitionCompanion` re-derives
 * its sections, and only from its own assembler-reported observations.
 */
export function verifyAcquisitionCompanion(
  companion: unknown,
  manifest: unknown,
): AcquisitionCompanionVerification {
  const inconsistencies: string[] = [];
  try {
    if (!isPlainObject(companion)) throw new Error('not_an_object');
    const c = companion as unknown as AcquisitionCompanion;
    const { acquisitionDigest, ...body } = c;
    if (c.contract !== ACQUISITION_COMPANION_CONTRACT) inconsistencies.push('contract');
    if (acquisitionDigestOfBody(body) !== acquisitionDigest)
      inconsistencies.push('acquisitionDigest');
    const recordSet = recordSetDigestOf(manifest);
    if (recordSet.outcome !== 'COMPUTED') inconsistencies.push(`manifest:${recordSet.code}`);
    else if (recordSet.recordSetDigest !== c.binding.recordSetDigest) {
      inconsistencies.push('recordSetDigest');
    } else if (recordSet.recordCount !== c.binding.recordCount) {
      inconsistencies.push('recordCount');
    }
    if (
      companionCanonicalJson(c.binding.recordSetRule as unknown as CanonicalValue) !==
      companionCanonicalJson(RECORD_SET_RULE as unknown as CanonicalValue)
    ) {
      inconsistencies.push('recordSetRule');
    }
    if (
      (manifest as { manifestDigest?: unknown }).manifestDigest !== c.binding.snapshotManifestDigest
    ) {
      inconsistencies.push('snapshotManifestDigest');
    }
    for (const [key, fixed] of [
      ['authenticity', AUTHENTICITY],
      ['permissions', PERMISSIONS],
      ['canonicalIssuer', CANONICAL_ISSUER],
      ['readProtocol', READ_PROTOCOL],
      ['clock', CLOCK_TREATMENT],
    ] as const) {
      if (
        companionCanonicalJson(c[key] as unknown as CanonicalValue) !==
        companionCanonicalJson(fixed as unknown as CanonicalValue)
      ) {
        inconsistencies.push(key);
      }
    }
  } catch {
    inconsistencies.push('shape');
  }
  return {
    contentDigestConsistency: inconsistencies.length === 0 ? 'CONSISTENT' : 'INCONSISTENT',
    inconsistencies,
    ...UNPROVEN,
  };
}

/**
 * Rebuilds the companion from `manifest`, `input` and the companion's OWN
 * observations and compares canonical bytes. REPRODUCED proves only that its
 * sections follow from those observations and agree with that manifest and
 * input - not that the observations are what a database returned.
 */
export function reproduceAcquisitionCompanion(
  companion: AcquisitionCompanion,
  manifest: SnapshotScopeManifest,
  input: SnapshotScopeInput,
): 'REPRODUCED' | 'NOT_REPRODUCED' {
  try {
    const rebuilt = buildAcquisitionCompanion({
      manifest,
      input,
      observations: companion.observations,
    });
    return rebuilt.outcome === 'BUILT' &&
      rebuilt.canonical === companionCanonicalJson(companion as unknown as CanonicalValue)
      ? 'REPRODUCED'
      : 'NOT_REPRODUCED';
  } catch {
    return 'NOT_REPRODUCED';
  }
}
