/**
 * TRACK B, B2.5-S0 - THE PURE, DETERMINISTIC SUBJECT SNAPSHOT-SCOPE MANIFEST.
 *
 * `buildSnapshotScopeManifest` takes ONE caller-supplied set of records about
 * ONE focal Discovery Subject - the exact B2.1 record shapes, attestation
 * REFERENCES, validator findings, validation inputs and a scope declaration -
 * and returns either a canonical manifest or a refusal.
 *
 * WHAT IT BINDS. Every supplied record's canonical content digest, in one
 * deterministic order; every finding; the validation inputs and source
 * globals; every review chain and attestation reference; the declared scope;
 * the protection status - all under one manifest digest. Reordering the input
 * changes nothing; changing any committed field changes its record digest
 * and the manifest digest.
 *
 * WHAT IT REFUSES. Malformed input and any declaration the supplied input
 * itself contradicts: a duplicate or conflicting record identity, a missing
 * focal subject, a category declared REPRESENTED over a direction never
 * examined or a truncated enumeration, a bounded enumeration that reached its
 * bound and still calls itself exhaustive, a protection status other than
 * NOT_CONSULTED, a canonical-identifier-shaped value, a bound exceeded.
 *
 * WHAT IT REPRESENTS, NEVER RESOLVES. A reference inside the set to a record
 * or state it does not hold is an explicit OMISSION; a category the caller
 * did not declare REPRESENTED is an explicit GAP; transitive parentage is
 * always UNKNOWN; an absent relationship never becomes "no parent" or
 * "independent"; a review chain's source tail is always UNKNOWN.
 *
 * WHAT IT CANNOT KNOW. A record nobody supplied, and a falsified value nobody
 * contradicts. `compareSnapshotScopeWithReference` finds both - but only
 * against a reference set the caller supplies, whose independence it cannot
 * prove. Source completeness, the source snapshot, freshness and export
 * authentication are single-valued unproven states (contract.ts `STATES`).
 *
 * Self-contained by design: it imports nothing from the identity validator,
 * the registry, the review protocol, the evidence projection or the protected
 * cohort guard, and nothing in production imports it.
 *
 * PURE: no socket, no database, no filesystem, no environment, no clock.
 */
import { manifestCanonicalJson, manifestDigestOf, type ManifestValue } from './canonical.js';
import {
  CANONICAL_ISSUER,
  CATEGORY_DECLARATIONS,
  ENUMERATIONS,
  FINDING_CODE,
  HEX64,
  INPUT_ORIGINS,
  INSTANT,
  LIMITATIONS,
  MAX_ECHE_ROW_KEYS,
  MAX_FINDINGS,
  MAX_RECORDS,
  MAX_SHARED_IDENTIFIER_HOLDERS,
  PERMISSIONS,
  PROTECTION_CHECK,
  PROTECTION_VERDICT,
  RECORD_PROVENANCE,
  RELATIONSHIP_DIRECTIONS,
  RULE_VERSION,
  SCOPE_CATEGORIES,
  SCOPE_KIND,
  SNAPSHOT_SCOPE_CONTRACT,
  SNAPSHOT_SCOPE_CONTRACT_STATUS,
  SnapshotScopeRefusal,
  UUID,
  VALIDATOR_EXECUTIONS,
  type CategoryDeclaration,
  type Enumeration,
  type InputOrigin,
  type RecordType,
  type RelationshipDirection,
  type ScopeCategory,
  type SnapshotScopeRefusalCode,
  type SourceGlobalKey,
  type ValidatorExecution,
} from './contract.js';

// ------------------------------------------------------------------ closed input shapes

/** The exact B2.1 record keys (identity/vocabulary.ts), restated: this module imports no B2.1 code. */
const PROVENANCE_KEYS = [
  'sourceType',
  'sourcePageEvidenceId',
  'sourceWebsiteClaimId',
  'sourceUrl',
  'sourceVersionRef',
  'observedAt',
  'claimBasis',
  'recordedByActorKey',
];
const RECORD_KEYS: { readonly [K in Exclude<RecordType, 'SOURCE_GLOBAL'>]: readonly string[] } = {
  SUBJECT: ['id', 'registeredKind', 'registeredByActorKey', 'registrationNote'],
  IDENTITY_CLAIM: [
    'id',
    'subjectId',
    'claimKind',
    'nameText',
    'nameLanguage',
    'claimedKind',
    'websiteUrl',
    'identifierScheme',
    'identifierValue',
    ...PROVENANCE_KEYS,
  ],
  RELATIONSHIP_CLAIM: [
    'id',
    'subjectId',
    'predicate',
    'targetSubjectId',
    'targetEcheRowKey',
    ...PROVENANCE_KEYS,
  ],
  REVIEW: [
    'id',
    'reviewedSubjectId',
    'reviewedIdentityClaimId',
    'reviewedRelationshipClaimId',
    'reviewOutcome',
    'supersedesReviewId',
    'actorKey',
    'reviewedAt',
    'reason',
  ],
  /** A REFERENCE to a stored B2.3 attestation: never its payload or signature. */
  REVIEW_ATTESTATION_REFERENCE: ['id', 'reviewId', 'keyId', 'payloadSha256'],
};
/** Fields that must be a UUID (`nullable`: or null). */
const UUID_FIELDS: { readonly [K in keyof typeof RECORD_KEYS]: readonly [string, boolean][] } = {
  SUBJECT: [['id', false]],
  IDENTITY_CLAIM: [
    ['id', false],
    ['subjectId', false],
  ],
  RELATIONSHIP_CLAIM: [
    ['id', false],
    ['subjectId', false],
    ['targetSubjectId', true],
  ],
  REVIEW: [
    ['id', false],
    ['reviewedSubjectId', true],
    ['reviewedIdentityClaimId', true],
    ['reviewedRelationshipClaimId', true],
    ['supersedesReviewId', true],
  ],
  REVIEW_ATTESTATION_REFERENCE: [
    ['id', false],
    ['reviewId', false],
  ],
};
const RECORD_COLLECTIONS: readonly [keyof SnapshotScopeRecords, keyof typeof RECORD_KEYS][] = [
  ['subjects', 'SUBJECT'],
  ['identityClaims', 'IDENTITY_CLAIM'],
  ['relationshipClaims', 'RELATIONSHIP_CLAIM'],
  ['reviews', 'REVIEW'],
  ['attestationReferences', 'REVIEW_ATTESTATION_REFERENCE'],
];
/** The exact B2.1 `IdentityFinding` keys. */
const FINDING_KEYS = ['code', 'field', 'recordId', 'severity', 'subjectId'];
const FINDING_SEVERITIES = ['INVALID', 'CONFLICT', 'UNRESOLVED', 'REVIEW_SIGNAL'] as const;
const INPUT_RECORD_ID = 'input';
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
/** B-local records never carry a canonical identifier; one that looks like one is refused. */
const CANONICAL_IDENTIFIER_SHAPE = /^(?:cand|chn|opp):/i;
const MAX_STRING = 8192;
const PART_OF = 'PART_OF';
const EXTERNAL_IDENTIFIER = 'EXTERNAL_IDENTIFIER';

type FlatRecord = Readonly<Record<string, string | null>>;

export interface SnapshotScopeRecords {
  readonly subjects: readonly unknown[];
  readonly identityClaims: readonly unknown[];
  readonly relationshipClaims: readonly unknown[];
  readonly reviews: readonly unknown[];
  readonly attestationReferences: readonly unknown[];
}

/** One B2.1 validator finding, exactly as `IdentityFinding`. */
export interface SnapshotScopeFinding {
  readonly severity: (typeof FINDING_SEVERITIES)[number];
  readonly code: string;
  readonly recordId: string;
  readonly subjectId: string | null;
  readonly field: string | null;
}

export interface EcheRowKeyState {
  /** Every ECHE source-row key the caller asked the source about. */
  readonly queriedKeys: readonly string[];
  /** The subset the caller says exists. Content-bound here, never proven. */
  readonly presentKeys: readonly string[];
}

/** Everything the manifest is built from. All of it is caller-supplied. */
export interface SnapshotScopeInput {
  readonly contract: string;
  readonly focalSubjectId: string;
  readonly inputOrigin: InputOrigin;
  readonly records: SnapshotScopeRecords;
  readonly findings: readonly unknown[];
  readonly validation: {
    readonly ruleVersion: string | null;
    readonly execution: ValidatorExecution;
    readonly asOf: string | null;
    readonly echeRowKeyState: EcheRowKeyState | null;
  };
  readonly scope: {
    readonly relationshipDirectionsExamined: readonly RelationshipDirection[];
    readonly categories: { readonly [K in ScopeCategory]: CategoryDeclaration };
    readonly sharedIdentifierHolders: {
      readonly enumeration: Enumeration;
      /** The query bound the enumeration ran under, or null when unbounded. */
      readonly bound: number | null;
      readonly holderSubjectIds: readonly string[];
    };
  };
  readonly protectionCheck: string;
}

// ------------------------------------------------------------------ output shapes

export interface MembershipEntry {
  readonly recordType: RecordType;
  readonly recordId: string;
  readonly provenance: string;
  /** What the record is to the focal subject; derived from the record, never declared. */
  readonly roles: readonly string[];
  readonly contentDigest: string;
}

export type FindingPartition = 'INPUT' | 'FOCAL_RECORD' | 'NEIGHBOUR_RECORD' | 'UNSUPPLIED_RECORD';

export interface ManifestFinding extends SnapshotScopeFinding {
  readonly scope: 'INPUT' | 'RECORD';
  /** Derived from the membership, so a neighbour finding cannot be relabelled as focal. */
  readonly partition: FindingPartition;
}

export interface ReviewChain {
  readonly targetKey: string;
  readonly targetSupplied: boolean;
  readonly reviewIds: readonly string[];
  readonly headReviewId: string | null;
  readonly internal: 'INTERNALLY_CONSISTENT' | 'INTERNALLY_INCONSISTENT';
  readonly issues: readonly string[];
  /** Always UNKNOWN: a supplied chain cannot say whether a later review exists. */
  readonly sourceTail: 'UNKNOWN';
}

export interface Omission {
  readonly code: string;
  readonly ref: string;
}

export interface SnapshotScopeManifestBody {
  readonly contract: typeof SNAPSHOT_SCOPE_CONTRACT;
  readonly contractStatus: typeof SNAPSHOT_SCOPE_CONTRACT_STATUS;
  readonly focalSubjectId: string;
  readonly focalSubjectIdRole: 'B_LOCAL_EVIDENCE_CONTAINER_ID_NOT_CANONICAL';
  readonly inputOrigin: InputOrigin;
  readonly scope: {
    readonly kind: typeof SCOPE_KIND;
    readonly relationshipDirectionsExamined: readonly RelationshipDirection[];
    readonly relationshipDirectionCoverage:
      'NONE_EXAMINED' | 'OUTGOING_ONLY' | 'INCOMING_ONLY' | 'BOTH_DIRECTIONS_EXAMINED_AS_DECLARED';
    readonly categories: { readonly [K in ScopeCategory]: CategoryDeclaration };
    readonly declaredGaps: readonly ScopeCategory[];
    readonly sharedIdentifierHolders: {
      readonly enumeration: Enumeration;
      readonly bound: number | null;
      readonly holderSubjectIds: readonly string[];
    };
    readonly parentage: {
      readonly transitive: 'UNKNOWN';
      readonly direct: 'PART_OF_CLAIM_SUPPLIED_UNVERIFIED' | 'NO_PART_OF_CLAIM_SUPPLIED_UNKNOWN';
      readonly independentOf: 'NEVER_INFERRED_FROM_ABSENCE';
      readonly legalIndependence: 'UNKNOWN';
    };
  };
  readonly membership: {
    readonly entries: readonly MembershipEntry[];
    readonly membershipDigest: string;
  };
  readonly validation: {
    readonly ruleVersion: string | null;
    readonly execution: ValidatorExecution;
    readonly executionVerification: 'NOT_VERIFIED';
    readonly sourceGlobals: readonly {
      readonly key: SourceGlobalKey;
      readonly status: 'SUPPLIED' | 'NOT_SUPPLIED';
      readonly contentDigest: string | null;
      readonly retrieval: 'SUPPLIED_NOT_PROVEN_COMPLETELY_RETRIEVED' | 'NOT_SUPPLIED';
    }[];
    readonly unavailableInputs: readonly string[];
    readonly findingCoverage: {
      readonly recordScoped: CategoryDeclaration;
      readonly inputScoped: CategoryDeclaration;
      readonly neighbourRecords: CategoryDeclaration;
    };
    readonly findings: readonly ManifestFinding[];
    readonly findingsDigest: string;
  };
  readonly reviews: {
    readonly chains: readonly ReviewChain[];
    readonly attestationReferences: readonly {
      readonly attestationId: string;
      readonly reviewId: string;
      readonly reviewSupplied: boolean;
      readonly signatureVerification: 'NOT_PERFORMED';
      readonly reviewerTrust: 'NONE_ESTABLISHED';
    }[];
    readonly latestReview: 'NOT_PROVEN';
  };
  readonly protection: {
    readonly check: typeof PROTECTION_CHECK;
    readonly verdict: typeof PROTECTION_VERDICT;
  };
  readonly omissions: readonly Omission[];
  readonly states: {
    readonly shapeValidity: 'SHAPE_VALID';
    readonly contentDigestConsistency: 'CONSISTENT';
    readonly declaredScopeCoverage: 'GAPS_DECLARED' | 'NO_GAP_DECLARED_OVER_SUPPLIED_INPUT';
    readonly unresolvedSourceOmissions: 'PRESENT' | 'NONE_DETECTED_IN_SUPPLIED_INPUT';
    readonly sourceSnapshotVerification: 'NOT_VERIFIED';
    readonly sourceCompleteness: 'NOT_PROVEN';
    readonly sourceFreshness: 'NOT_PROVEN';
    readonly exportAuthentication: 'UNAUTHENTICATED';
  };
  readonly limitations: typeof LIMITATIONS;
  readonly permissions: typeof PERMISSIONS;
  readonly canonicalIssuer: typeof CANONICAL_ISSUER;
}

export interface SnapshotScopeManifest extends SnapshotScopeManifestBody {
  /** Over every other field. Recomputable by anyone: a consistency check, never an authenticator. */
  readonly manifestDigest: string;
}

export type SnapshotScopeResult =
  | {
      readonly outcome: 'BUILT';
      readonly manifest: SnapshotScopeManifest;
      readonly canonical: string;
    }
  | {
      readonly outcome: 'REFUSED';
      readonly code: SnapshotScopeRefusalCode;
      readonly detail: string;
    };

// ------------------------------------------------------------------ checks

function refuse(code: SnapshotScopeRefusalCode, detail: string): never {
  throw new SnapshotScopeRefusal(code, detail);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

function exactKeys(
  value: unknown,
  keys: readonly string[],
  code: SnapshotScopeRefusalCode,
  what: string,
): Record<string, unknown> {
  if (!isPlainObject(value)) refuse(code, `${what}_not_an_object`);
  const have = Object.keys(value).sort();
  const want = [...keys].sort();
  if (have.length !== want.length || have.some((k, i) => k !== want[i])) {
    refuse(code, `${what}_keys`);
  }
  return value;
}

function list(value: unknown, max: number, what: string): readonly unknown[] {
  if (!Array.isArray(value)) refuse('INPUT_SHAPE_UNSUPPORTED', `${what}_not_a_list`);
  if (value.length > max) refuse('BOUND_EXCEEDED', what);
  return value;
}

function admissibleString(value: string, what: string): string {
  if (value.length > MAX_STRING) refuse('BOUND_EXCEEDED', `${what}_too_long`);
  if (CANONICAL_IDENTIFIER_SHAPE.test(value)) refuse('CANONICAL_IDENTIFIER_INADMISSIBLE', what);
  return value;
}

function oneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function checkRecord(recordType: keyof typeof RECORD_KEYS, raw: unknown): FlatRecord {
  const r = exactKeys(raw, RECORD_KEYS[recordType], 'RECORD_SHAPE_UNSUPPORTED', recordType);
  const out: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(r)) {
    if (value !== null && typeof value !== 'string') {
      refuse('RECORD_SHAPE_UNSUPPORTED', `${recordType}.${key}`);
    }
    out[key] = value === null ? null : admissibleString(value, `${recordType}.${key}`);
  }
  for (const [field, nullable] of UUID_FIELDS[recordType]) {
    const v = out[field];
    if (v === null ? !nullable : !UUID.test(v!)) {
      refuse('RECORD_SHAPE_UNSUPPORTED', `${recordType}.${field}`);
    }
  }
  if (recordType === 'REVIEW') {
    const targets = [
      out['reviewedSubjectId'],
      out['reviewedIdentityClaimId'],
      out['reviewedRelationshipClaimId'],
    ];
    if (targets.filter((t) => t !== null).length !== 1) {
      refuse('RECORD_SHAPE_UNSUPPORTED', 'REVIEW.target');
    }
  }
  if (recordType === 'REVIEW_ATTESTATION_REFERENCE') {
    if (!HEX64.test(out['payloadSha256'] ?? '')) {
      refuse('RECORD_SHAPE_UNSUPPORTED', 'REVIEW_ATTESTATION_REFERENCE.payloadSha256');
    }
    if ((out['keyId'] ?? '').length === 0) {
      refuse('RECORD_SHAPE_UNSUPPORTED', 'REVIEW_ATTESTATION_REFERENCE.keyId');
    }
  }
  return out;
}

function checkFinding(raw: unknown): SnapshotScopeFinding {
  const f = exactKeys(raw, FINDING_KEYS, 'FINDING_SHAPE_UNSUPPORTED', 'finding');
  if (!oneOf(FINDING_SEVERITIES, f['severity'])) {
    refuse('FINDING_SHAPE_UNSUPPORTED', 'finding.severity');
  }
  if (typeof f['code'] !== 'string' || !FINDING_CODE.test(f['code'])) {
    refuse('FINDING_SHAPE_UNSUPPORTED', 'finding.code');
  }
  const recordId = f['recordId'];
  if (typeof recordId !== 'string' || (recordId !== INPUT_RECORD_ID && !UUID.test(recordId))) {
    refuse('FINDING_SHAPE_UNSUPPORTED', 'finding.recordId');
  }
  const subjectId = f['subjectId'];
  if (subjectId !== null && (typeof subjectId !== 'string' || !UUID.test(subjectId))) {
    refuse('FINDING_SHAPE_UNSUPPORTED', 'finding.subjectId');
  }
  if (recordId === INPUT_RECORD_ID && subjectId !== null) {
    refuse('FINDING_SHAPE_UNSUPPORTED', 'finding.input_scoped_subject');
  }
  const field = f['field'];
  if (field !== null && (typeof field !== 'string' || !FIELD_NAME.test(field))) {
    refuse('FINDING_SHAPE_UNSUPPORTED', 'finding.field');
  }
  return {
    severity: f['severity'],
    code: f['code'],
    recordId,
    subjectId,
    field,
  };
}

function distinctStrings(
  value: unknown,
  max: number,
  code: SnapshotScopeRefusalCode,
  what: string,
  shape?: RegExp,
): string[] {
  const items = list(value, max, what);
  const out: string[] = [];
  for (const item of items) {
    if (typeof item !== 'string' || item.length === 0) refuse(code, `${what}_entry`);
    if (shape !== undefined && !shape.test(item)) refuse(code, `${what}_entry`);
    out.push(admissibleString(item, what));
  }
  const sorted = [...new Set(out)].sort();
  if (sorted.length !== out.length) refuse(code, `${what}_duplicate`);
  return sorted;
}

const INPUT_KEYS = [
  'contract',
  'findings',
  'focalSubjectId',
  'inputOrigin',
  'protectionCheck',
  'records',
  'scope',
  'validation',
];
const RECORDS_KEYS = RECORD_COLLECTIONS.map(([k]) => k);
const VALIDATION_KEYS = ['asOf', 'echeRowKeyState', 'execution', 'ruleVersion'];
const SCOPE_KEYS = ['categories', 'relationshipDirectionsExamined', 'sharedIdentifierHolders'];
const HOLDER_KEYS = ['bound', 'enumeration', 'holderSubjectIds'];

interface Checked {
  readonly focal: string;
  readonly origin: InputOrigin;
  readonly records: { readonly [K in keyof typeof RECORD_KEYS]: FlatRecord[] };
  readonly findings: SnapshotScopeFinding[];
  readonly ruleVersion: string | null;
  readonly execution: ValidatorExecution;
  readonly asOf: string | null;
  readonly eche: { readonly queriedKeys: string[]; readonly presentKeys: string[] } | null;
  readonly directions: RelationshipDirection[];
  readonly categories: { readonly [K in ScopeCategory]: CategoryDeclaration };
  readonly holders: {
    readonly enumeration: Enumeration;
    readonly bound: number | null;
    readonly ids: string[];
  };
}

function checkInput(raw: unknown): Checked {
  if (isPlainObject(raw) && raw['contract'] !== SNAPSHOT_SCOPE_CONTRACT) {
    refuse('CONTRACT_UNKNOWN', 'contract');
  }
  const input = exactKeys(raw, INPUT_KEYS, 'INPUT_SHAPE_UNSUPPORTED', 'input');
  const focal = input['focalSubjectId'];
  if (typeof focal !== 'string' || !UUID.test(focal)) {
    refuse('INPUT_SHAPE_UNSUPPORTED', 'focalSubjectId');
  }
  if (!oneOf(INPUT_ORIGINS, input['inputOrigin'])) {
    refuse('INPUT_SHAPE_UNSUPPORTED', 'inputOrigin');
  }
  if (input['protectionCheck'] !== PROTECTION_CHECK) {
    refuse('PROTECTION_STATUS_UNSUPPORTED', 'protectionCheck');
  }

  const recs = exactKeys(input['records'], RECORDS_KEYS, 'INPUT_SHAPE_UNSUPPORTED', 'records');
  const records = {} as Record<keyof typeof RECORD_KEYS, FlatRecord[]>;
  let total = 0;
  for (const [collection, recordType] of RECORD_COLLECTIONS) {
    const items = list(recs[collection], MAX_RECORDS, collection);
    total += items.length;
    records[recordType] = items.map((item) => checkRecord(recordType, item));
  }
  if (total > MAX_RECORDS) refuse('BOUND_EXCEEDED', 'records');

  const findings = list(input['findings'], MAX_FINDINGS, 'findings').map(checkFinding);

  const v = exactKeys(
    input['validation'],
    VALIDATION_KEYS,
    'INPUT_SHAPE_UNSUPPORTED',
    'validation',
  );
  const ruleVersion = v['ruleVersion'];
  if (
    ruleVersion !== null &&
    (typeof ruleVersion !== 'string' || !RULE_VERSION.test(ruleVersion))
  ) {
    refuse('INPUT_SHAPE_UNSUPPORTED', 'validation.ruleVersion');
  }
  if (!oneOf(VALIDATOR_EXECUTIONS, v['execution'])) {
    refuse('INPUT_SHAPE_UNSUPPORTED', 'validation.execution');
  }
  const asOf = v['asOf'];
  if (asOf !== null && (typeof asOf !== 'string' || !INSTANT.test(asOf))) {
    refuse('SOURCE_GLOBAL_SHAPE_UNSUPPORTED', 'validation.asOf');
  }
  let eche: Checked['eche'] = null;
  if (v['echeRowKeyState'] !== null) {
    const e = exactKeys(
      v['echeRowKeyState'],
      ['presentKeys', 'queriedKeys'],
      'SOURCE_GLOBAL_SHAPE_UNSUPPORTED',
      'echeRowKeyState',
    );
    const queriedKeys = distinctStrings(
      e['queriedKeys'],
      MAX_ECHE_ROW_KEYS,
      'SOURCE_GLOBAL_SHAPE_UNSUPPORTED',
      'echeRowKeyState.queriedKeys',
    );
    const presentKeys = distinctStrings(
      e['presentKeys'],
      MAX_ECHE_ROW_KEYS,
      'SOURCE_GLOBAL_SHAPE_UNSUPPORTED',
      'echeRowKeyState.presentKeys',
    );
    if (presentKeys.some((k) => !queriedKeys.includes(k))) {
      refuse('SOURCE_GLOBAL_SHAPE_UNSUPPORTED', 'echeRowKeyState.present_not_queried');
    }
    eche = { queriedKeys, presentKeys };
  }

  const s = exactKeys(input['scope'], SCOPE_KEYS, 'INPUT_SHAPE_UNSUPPORTED', 'scope');
  const directions = distinctStrings(
    s['relationshipDirectionsExamined'],
    RELATIONSHIP_DIRECTIONS.length,
    'SCOPE_DECLARATION_INCONSISTENT',
    'relationshipDirectionsExamined',
  );
  if (!directions.every((d) => oneOf(RELATIONSHIP_DIRECTIONS, d))) {
    refuse('INPUT_SHAPE_UNSUPPORTED', 'relationshipDirectionsExamined');
  }
  const c = exactKeys(s['categories'], SCOPE_CATEGORIES, 'INPUT_SHAPE_UNSUPPORTED', 'categories');
  for (const category of SCOPE_CATEGORIES) {
    if (!oneOf(CATEGORY_DECLARATIONS, c[category])) {
      refuse('INPUT_SHAPE_UNSUPPORTED', `categories.${category}`);
    }
  }
  const h = exactKeys(
    s['sharedIdentifierHolders'],
    HOLDER_KEYS,
    'INPUT_SHAPE_UNSUPPORTED',
    'sharedIdentifierHolders',
  );
  if (!oneOf(ENUMERATIONS, h['enumeration'])) {
    refuse('INPUT_SHAPE_UNSUPPORTED', 'sharedIdentifierHolders.enumeration');
  }
  const bound = h['bound'];
  if (bound !== null && (typeof bound !== 'number' || !Number.isSafeInteger(bound) || bound < 1)) {
    refuse('INPUT_SHAPE_UNSUPPORTED', 'sharedIdentifierHolders.bound');
  }
  const ids = distinctStrings(
    h['holderSubjectIds'],
    MAX_SHARED_IDENTIFIER_HOLDERS,
    'SCOPE_DECLARATION_INCONSISTENT',
    'sharedIdentifierHolders.holderSubjectIds',
    UUID,
  );

  return {
    focal,
    origin: input['inputOrigin'],
    records,
    findings,
    ruleVersion,
    execution: v['execution'],
    asOf,
    eche,
    directions: directions as RelationshipDirection[],
    categories: c as unknown as Checked['categories'],
    holders: { enumeration: h['enumeration'], bound, ids },
  };
}

// ------------------------------------------------------------------ digests

const RECORD_TYPE_ORDER: readonly RecordType[] = [
  'SUBJECT',
  'IDENTITY_CLAIM',
  'RELATIONSHIP_CLAIM',
  'REVIEW',
  'REVIEW_ATTESTATION_REFERENCE',
  'SOURCE_GLOBAL',
];

/**
 * The canonical content digest of one record: its type, and EVERY committed
 * field. Exported so a reference set can be built from records independently.
 */
export function recordContentDigestOf(recordType: RecordType, content: ManifestValue): string {
  return manifestDigestOf('record-content', { recordType, content });
}

/** The digest of the canonically ordered findings. */
export function findingsDigestOf(findings: readonly SnapshotScopeFinding[]): string {
  return manifestDigestOf('findings', sortedFindings(findings) as unknown as ManifestValue);
}

const findingLine = (f: SnapshotScopeFinding) =>
  manifestCanonicalJson({
    severity: f.severity,
    code: f.code,
    recordId: f.recordId,
    subjectId: f.subjectId,
    field: f.field,
  });

function sortedFindings<T extends SnapshotScopeFinding>(findings: readonly T[]): T[] {
  const byLine = new Map<string, T>();
  for (const f of findings) byLine.set(findingLine(f), f);
  return [...byLine.keys()].sort().map((k) => byLine.get(k)!);
}

/** The digest of the ordered membership: type, identity, provenance, roles, content digest. */
export function membershipDigestOf(entries: readonly MembershipEntry[]): string {
  return manifestDigestOf('membership', entries as unknown as ManifestValue);
}

/** The manifest digest over every field except itself. */
export function manifestDigestOfBody(body: SnapshotScopeManifestBody): string {
  return manifestDigestOf('manifest', body as unknown as ManifestValue);
}

/** The ECHE-row-key-existence and as-of source globals, as records. */
function sourceGlobalContents(c: Checked): [SourceGlobalKey, ManifestValue | null][] {
  return [
    [
      'ECHE_ROW_KEY_EXISTENCE',
      c.eche === null
        ? null
        : {
            key: 'ECHE_ROW_KEY_EXISTENCE',
            queriedKeys: c.eche.queriedKeys,
            presentKeys: c.eche.presentKeys,
          },
    ],
    ['VALIDATION_AS_OF', c.asOf === null ? null : { key: 'VALIDATION_AS_OF', asOf: c.asOf }],
  ];
}

// ------------------------------------------------------------------ derivation

const targetKeyOf = (r: FlatRecord): string =>
  r['reviewedSubjectId'] !== null
    ? `subject:${r['reviewedSubjectId']}`
    : r['reviewedIdentityClaimId'] !== null
      ? `identity_claim:${r['reviewedIdentityClaimId']}`
      : `relationship_claim:${r['reviewedRelationshipClaimId']}`;

const targetIdOf = (key: string): string => key.slice(key.indexOf(':') + 1);

function reviewChainOf(targetKey: string, reviews: FlatRecord[], supplied: boolean): ReviewChain {
  const ids = new Set(reviews.map((r) => r['id']!));
  const issues = new Set<string>();
  const supersededCount = new Map<string, number>();
  let roots = 0;
  for (const r of reviews) {
    const s = r['supersedesReviewId'] ?? null;
    if (s === null) {
      roots += 1;
      continue;
    }
    if (!ids.has(s)) issues.add('SUPERSEDED_REVIEW_NOT_IN_CHAIN');
    supersededCount.set(s, (supersededCount.get(s) ?? 0) + 1);
  }
  if ([...supersededCount.values()].some((n) => n > 1)) issues.add('CHAIN_FORKED');
  const heads = reviews.filter((r) => !supersededCount.has(r['id']!)).map((r) => r['id']!);
  if (heads.length !== 1) issues.add('NO_SINGLE_HEAD');
  if (roots !== 1) issues.add('NO_SINGLE_ROOT');
  if (heads.length === 1) {
    const byId = new Map(reviews.map((r) => [r['id']!, r]));
    const seen = new Set<string>();
    let at: string | null = heads[0]!;
    while (at !== null && byId.has(at) && !seen.has(at)) {
      seen.add(at);
      at = byId.get(at)!['supersedesReviewId'] ?? null;
    }
    if (seen.size !== reviews.length) issues.add('NOT_ONE_LINEAR_CHAIN');
  }
  return {
    targetKey,
    targetSupplied: supplied,
    reviewIds: [...ids].sort(),
    headReviewId: heads.length === 1 ? heads[0]! : null,
    internal: issues.size === 0 ? 'INTERNALLY_CONSISTENT' : 'INTERNALLY_INCONSISTENT',
    issues: [...issues].sort(),
    sourceTail: 'UNKNOWN',
  };
}

function build(c: Checked): SnapshotScopeManifest {
  const { focal, records } = c;

  // ---- identity: one record per id, across every registry record type.
  const byId = new Map<string, { recordType: RecordType; record: FlatRecord; line: string }>();
  for (const recordType of RECORD_TYPE_ORDER) {
    if (recordType === 'SOURCE_GLOBAL') continue;
    for (const record of records[recordType]) {
      const id = record['id']!;
      const line = manifestCanonicalJson({ recordType, record } as unknown as ManifestValue);
      const seen = byId.get(id);
      if (seen !== undefined) {
        refuse(
          seen.line === line ? 'DUPLICATE_RECORD_IDENTITY' : 'CONFLICTING_RECORD_ENTRY',
          `${seen.recordType}/${recordType}:${id}`,
        );
      }
      byId.set(id, { recordType, record, line });
    }
  }
  const subjectIds = new Set(records.SUBJECT.map((s) => s['id']!));
  if (!subjectIds.has(focal)) refuse('FOCAL_SUBJECT_MISSING', focal);
  const supplied = (type: RecordType, id: string) => byId.get(id)?.recordType === type;

  const omissions: Omission[] = [];
  const omit = (code: string, ref: string) => omissions.push({ code, ref });

  // ---- relationships: direction is derived from the record, never declared.
  const outgoing = records.RELATIONSHIP_CLAIM.filter((r) => r['subjectId'] === focal);
  const incoming = records.RELATIONSHIP_CLAIM.filter(
    (r) => r['subjectId'] !== focal && r['targetSubjectId'] === focal,
  );
  for (const r of [...records.IDENTITY_CLAIM, ...records.RELATIONSHIP_CLAIM]) {
    if (!subjectIds.has(r['subjectId']!)) omit('CLAIM_SUBJECT_NOT_SUPPLIED', r['id']!);
  }
  const echeQueried = new Set(c.eche?.queriedKeys ?? []);
  for (const r of records.RELATIONSHIP_CLAIM) {
    const target = r['targetSubjectId'] ?? null;
    if (target !== null && !subjectIds.has(target)) {
      omit('RELATIONSHIP_TARGET_SUBJECT_NOT_SUPPLIED', r['id']!);
    }
    const eche = r['targetEcheRowKey'] ?? null;
    if (eche !== null && !echeQueried.has(eche)) omit('ECHE_ROW_KEY_STATE_NOT_SUPPLIED', r['id']!);
  }

  // ---- shared-identifier holders: cross-checked against the supplied claims.
  const identifierKey = (r: FlatRecord) => `${r['identifierScheme']}\u0000${r['identifierValue']}`;
  const focalIdentifiers = new Set(
    records.IDENTITY_CLAIM.filter(
      (r) => r['subjectId'] === focal && r['claimKind'] === EXTERNAL_IDENTIFIER,
    ).map(identifierKey),
  );
  const observedHolders = new Set(
    records.IDENTITY_CLAIM.filter(
      (r) =>
        r['subjectId'] !== focal &&
        r['claimKind'] === EXTERNAL_IDENTIFIER &&
        focalIdentifiers.has(identifierKey(r)),
    ).map((r) => r['subjectId']!),
  );
  const holders = c.holders;
  if (holders.ids.includes(focal)) {
    refuse('SCOPE_DECLARATION_INCONSISTENT', 'focal_listed_as_holder');
  }
  if (focalIdentifiers.size === 0 && holders.ids.length > 0) {
    refuse('SCOPE_DECLARATION_INCONSISTENT', 'holders_without_focal_identifier');
  }
  if (holders.bound !== null && holders.ids.length > holders.bound) {
    refuse('SCOPE_DECLARATION_INCONSISTENT', 'holders_exceed_bound');
  }
  if (
    holders.enumeration === 'EXHAUSTIVE_AS_DECLARED' &&
    holders.bound !== null &&
    holders.ids.length >= holders.bound
  ) {
    // A LIMIT query that returned exactly its bound cannot tell "all" from "more".
    refuse('ENUMERATION_NOT_EXHAUSTIVE', 'holders_reached_bound');
  }
  for (const observed of observedHolders) {
    if (!holders.ids.includes(observed) && holders.enumeration === 'EXHAUSTIVE_AS_DECLARED') {
      refuse('SCOPE_DECLARATION_INCONSISTENT', 'supplied_holder_not_enumerated');
    }
  }
  for (const id of holders.ids) {
    if (!subjectIds.has(id)) omit('SHARED_IDENTIFIER_HOLDER_NOT_SUPPLIED', id);
    else if (!observedHolders.has(id)) omit('SHARED_IDENTIFIER_HOLDER_CLAIM_NOT_SUPPLIED', id);
  }
  if (focalIdentifiers.size > 0 && holders.enumeration !== 'EXHAUSTIVE_AS_DECLARED') {
    omit(`SHARED_IDENTIFIER_HOLDER_ENUMERATION_${holders.enumeration}`, focal);
  }

  // ---- reviews and attestation references.
  const reviewsByTarget = new Map<string, FlatRecord[]>();
  for (const r of records.REVIEW) {
    const key = targetKeyOf(r);
    reviewsByTarget.set(key, [...(reviewsByTarget.get(key) ?? []), r]);
    const targetType: RecordType = key.startsWith('subject:')
      ? 'SUBJECT'
      : key.startsWith('identity_claim:')
        ? 'IDENTITY_CLAIM'
        : 'RELATIONSHIP_CLAIM';
    if (!supplied(targetType, targetIdOf(key))) omit('REVIEW_TARGET_NOT_SUPPLIED', r['id']!);
    const s = r['supersedesReviewId'] ?? null;
    if (s !== null && !supplied('REVIEW', s)) omit('SUPERSEDED_REVIEW_NOT_SUPPLIED', r['id']!);
  }
  const chains = [...reviewsByTarget.keys()].sort().map((key) => {
    const targetType: RecordType = key.startsWith('subject:')
      ? 'SUBJECT'
      : key.startsWith('identity_claim:')
        ? 'IDENTITY_CLAIM'
        : 'RELATIONSHIP_CLAIM';
    return reviewChainOf(key, reviewsByTarget.get(key)!, supplied(targetType, targetIdOf(key)));
  });
  const attestationReferences = records.REVIEW_ATTESTATION_REFERENCE.map((a) => {
    const reviewSupplied = supplied('REVIEW', a['reviewId']!);
    if (!reviewSupplied) omit('ATTESTATION_REVIEW_NOT_SUPPLIED', a['id']!);
    return {
      attestationId: a['id']!,
      reviewId: a['reviewId']!,
      reviewSupplied,
      signatureVerification: 'NOT_PERFORMED' as const,
      reviewerTrust: 'NONE_ESTABLISHED' as const,
    };
  }).sort((x, y) => (x.attestationId < y.attestationId ? -1 : 1));

  // ---- ownership: which subject a record is about, for roles and finding partitions.
  const ownerOf = (id: string, depth = 0): string | null => {
    const hit = byId.get(id);
    if (hit === undefined || depth > 2) return null;
    const r = hit.record;
    switch (hit.recordType) {
      case 'SUBJECT':
        return id;
      case 'IDENTITY_CLAIM':
      case 'RELATIONSHIP_CLAIM':
        return r['subjectId']!;
      case 'REVIEW':
        return ownerOf(targetIdOf(targetKeyOf(r)), depth + 1);
      case 'REVIEW_ATTESTATION_REFERENCE':
        return ownerOf(r['reviewId']!, depth + 1);
      default:
        return null;
    }
  };

  // ---- findings: kept whole, partitioned by the membership.
  const findings: ManifestFinding[] = sortedFindings(c.findings).map((f) => {
    let partition: FindingPartition;
    if (f.recordId === INPUT_RECORD_ID) partition = 'INPUT';
    else if (!byId.has(f.recordId)) partition = 'UNSUPPLIED_RECORD';
    else partition = ownerOf(f.recordId) === focal ? 'FOCAL_RECORD' : 'NEIGHBOUR_RECORD';
    if (partition === 'UNSUPPLIED_RECORD') omit('FINDING_RECORD_NOT_SUPPLIED', f.recordId);
    if (f.subjectId !== null && !subjectIds.has(f.subjectId)) {
      omit('FINDING_SUBJECT_NOT_SUPPLIED', f.subjectId);
    }
    return { ...f, scope: f.recordId === INPUT_RECORD_ID ? 'INPUT' : 'RECORD', partition };
  });

  // ---- scope declarations the supplied input itself contradicts are refused.
  const cat = c.categories;
  const inconsistent = (category: ScopeCategory, why: string): never =>
    refuse('SCOPE_DECLARATION_INCONSISTENT', `${category}:${why}`);
  const represented = (category: ScopeCategory) => cat[category] === 'REPRESENTED';
  if (cat.PROTECTION_STATUS !== 'UNKNOWN') {
    refuse('PROTECTION_STATUS_UNSUPPORTED', 'categories.PROTECTION_STATUS');
  }
  if (represented('OUTGOING_RELATIONSHIP_CLAIMS') && !c.directions.includes('OUTGOING')) {
    inconsistent('OUTGOING_RELATIONSHIP_CLAIMS', 'direction_not_examined');
  }
  if (represented('INCOMING_RELATIONSHIP_CLAIMS') && !c.directions.includes('INCOMING')) {
    inconsistent('INCOMING_RELATIONSHIP_CLAIMS', 'direction_not_examined');
  }
  if (
    represented('SHARED_IDENTIFIER_HOLDERS') &&
    focalIdentifiers.size > 0 &&
    holders.enumeration !== 'EXHAUSTIVE_AS_DECLARED'
  ) {
    inconsistent('SHARED_IDENTIFIER_HOLDERS', 'enumeration_not_exhaustive');
  }
  const referenceOmissions = new Set([
    'CLAIM_SUBJECT_NOT_SUPPLIED',
    'RELATIONSHIP_TARGET_SUBJECT_NOT_SUPPLIED',
    'SHARED_IDENTIFIER_HOLDER_NOT_SUPPLIED',
    'SHARED_IDENTIFIER_HOLDER_CLAIM_NOT_SUPPLIED',
    'REVIEW_TARGET_NOT_SUPPLIED',
    'SUPERSEDED_REVIEW_NOT_SUPPLIED',
    'ATTESTATION_REVIEW_NOT_SUPPLIED',
    'FINDING_RECORD_NOT_SUPPLIED',
    'FINDING_SUBJECT_NOT_SUPPLIED',
  ]);
  if (represented('REFERENCED_RECORDS') && omissions.some((o) => referenceOmissions.has(o.code))) {
    inconsistent('REFERENCED_RECORDS', 'referenced_record_not_supplied');
  }
  if (
    represented('REVIEW_RECORDS') &&
    omissions.some((o) => o.code === 'SUPERSEDED_REVIEW_NOT_SUPPLIED')
  ) {
    inconsistent('REVIEW_RECORDS', 'superseded_review_not_supplied');
  }
  if (
    represented('REVIEW_ATTESTATION_REFERENCES') &&
    omissions.some((o) => o.code === 'ATTESTATION_REVIEW_NOT_SUPPLIED')
  ) {
    inconsistent('REVIEW_ATTESTATION_REFERENCES', 'attested_review_not_supplied');
  }
  const validatorRan = c.execution === 'CALLER_ASSERTED_RAN' && c.ruleVersion !== null;
  if (c.execution === 'NOT_RUN' && findings.length > 0) {
    refuse('SCOPE_DECLARATION_INCONSISTENT', 'findings_without_validator_run');
  }
  for (const category of [
    'RECORD_SCOPED_FINDINGS',
    'INPUT_SCOPED_FINDINGS',
    'NEIGHBOUR_RECORD_FINDINGS',
  ] as const) {
    if (represented(category) && !validatorRan) inconsistent(category, 'validator_run_not_stated');
  }
  // Input-scoped findings (an invalid as-of, an invalid ECHE key) depend on these inputs.
  if (represented('INPUT_SCOPED_FINDINGS') && (c.asOf === null || c.eche === null)) {
    inconsistent('INPUT_SCOPED_FINDINGS', 'validation_inputs_not_supplied');
  }
  if (
    represented('VALIDATION_INPUTS') &&
    (c.ruleVersion === null || c.asOf === null || c.eche === null)
  ) {
    inconsistent('VALIDATION_INPUTS', 'validation_inputs_not_supplied');
  }
  if (
    represented('SOURCE_GLOBALS') &&
    (c.asOf === null ||
      c.eche === null ||
      omissions.some((o) => o.code === 'ECHE_ROW_KEY_STATE_NOT_SUPPLIED'))
  ) {
    inconsistent('SOURCE_GLOBALS', 'source_global_not_supplied');
  }

  // ---- membership: every supplied record, content-bound, in one deterministic order.
  const outgoingTargets = new Set(outgoing.map((r) => r['targetSubjectId']));
  const incomingSources = new Set(incoming.map((r) => r['subjectId']));
  const rolesOf = (recordType: RecordType, r: FlatRecord): string[] => {
    const id = r['id']!;
    const roles: string[] = [];
    switch (recordType) {
      case 'SUBJECT':
        if (id === focal) roles.push('FOCAL_SUBJECT');
        if (outgoingTargets.has(id)) roles.push('OUTGOING_RELATIONSHIP_TARGET');
        if (incomingSources.has(id)) roles.push('INCOMING_RELATIONSHIP_SOURCE');
        if (holders.ids.includes(id)) roles.push('SHARED_IDENTIFIER_HOLDER');
        break;
      case 'IDENTITY_CLAIM':
        roles.push(r['subjectId'] === focal ? 'FOCAL_IDENTITY_CLAIM' : 'NEIGHBOUR_IDENTITY_CLAIM');
        break;
      case 'RELATIONSHIP_CLAIM':
        if (r['subjectId'] === focal) roles.push('OUTGOING_RELATIONSHIP');
        else if (r['targetSubjectId'] === focal) roles.push('INCOMING_RELATIONSHIP');
        break;
      case 'REVIEW': {
        const owner = ownerOf(id);
        roles.push(
          owner === null
            ? 'REVIEW_OF_UNSUPPLIED_TARGET'
            : owner === focal
              ? 'REVIEW_OF_FOCAL_RECORD'
              : 'REVIEW_OF_NEIGHBOUR_RECORD',
        );
        break;
      }
      case 'REVIEW_ATTESTATION_REFERENCE':
        roles.push('ATTESTATION_REFERENCE');
        break;
      default:
        break;
    }
    // Anything that is none of the above sits in the neighbourhood as context only.
    if (roles.length === 0) roles.push('NEIGHBOUR_CONTEXT_OUTSIDE_DECLARED_SCOPE');
    return roles.sort();
  };
  const entries: MembershipEntry[] = [];
  for (const recordType of RECORD_TYPE_ORDER) {
    if (recordType === 'SOURCE_GLOBAL') continue;
    for (const r of [...records[recordType]].sort((x, y) => (x['id']! < y['id']! ? -1 : 1))) {
      entries.push({
        recordType,
        recordId: r['id']!,
        provenance: RECORD_PROVENANCE[recordType],
        roles: rolesOf(recordType, r),
        contentDigest: recordContentDigestOf(recordType, r as ManifestValue),
      });
    }
  }
  const sourceGlobals = sourceGlobalContents(c).map(([key, content]) => {
    const contentDigest = content === null ? null : recordContentDigestOf('SOURCE_GLOBAL', content);
    if (contentDigest !== null) {
      entries.push({
        recordType: 'SOURCE_GLOBAL',
        recordId: key,
        provenance: RECORD_PROVENANCE.SOURCE_GLOBAL,
        roles: ['VALIDATION_SOURCE_GLOBAL'],
        contentDigest,
      });
    }
    return {
      key,
      status: content === null ? ('NOT_SUPPLIED' as const) : ('SUPPLIED' as const),
      contentDigest,
      retrieval:
        content === null
          ? ('NOT_SUPPLIED' as const)
          : ('SUPPLIED_NOT_PROVEN_COMPLETELY_RETRIEVED' as const),
    };
  });

  const unavailableInputs = [
    ...(c.ruleVersion === null ? ['VALIDATOR_RULE_VERSION'] : []),
    ...(c.asOf === null ? ['VALIDATION_AS_OF'] : []),
    ...(c.eche === null ? ['ECHE_ROW_KEY_EXISTENCE'] : []),
    ...(c.directions.includes('INCOMING') ? [] : ['INCOMING_RELATIONSHIP_CLAIMS']),
    ...(c.directions.includes('OUTGOING') ? [] : ['OUTGOING_RELATIONSHIP_CLAIMS']),
    'PROTECTED_COHORT_REGISTRY',
    'REVIEW_ATTESTATION_SIGNATURES',
    'TRANSITIVE_PARENTAGE',
  ].sort();

  const declaredGaps = SCOPE_CATEGORIES.filter((k) => cat[k] !== 'REPRESENTED');
  const sortedOmissions = [
    ...new Map(omissions.map((o) => [`${o.code}\u0000${o.ref}`, o])).entries(),
  ]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([, o]) => o);
  const directions = [...c.directions].sort();
  const coverage =
    directions.length === 0
      ? ('NONE_EXAMINED' as const)
      : directions.length === 2
        ? ('BOTH_DIRECTIONS_EXAMINED_AS_DECLARED' as const)
        : directions[0] === 'OUTGOING'
          ? ('OUTGOING_ONLY' as const)
          : ('INCOMING_ONLY' as const);

  const body: SnapshotScopeManifestBody = {
    contract: SNAPSHOT_SCOPE_CONTRACT,
    contractStatus: SNAPSHOT_SCOPE_CONTRACT_STATUS,
    focalSubjectId: focal,
    focalSubjectIdRole: 'B_LOCAL_EVIDENCE_CONTAINER_ID_NOT_CANONICAL',
    inputOrigin: c.origin,
    scope: {
      kind: SCOPE_KIND,
      relationshipDirectionsExamined: directions,
      relationshipDirectionCoverage: coverage,
      categories: { ...cat },
      declaredGaps,
      sharedIdentifierHolders: {
        enumeration: holders.enumeration,
        bound: holders.bound,
        holderSubjectIds: holders.ids,
      },
      parentage: {
        transitive: 'UNKNOWN',
        direct: outgoing.some((r) => r['predicate'] === PART_OF)
          ? 'PART_OF_CLAIM_SUPPLIED_UNVERIFIED'
          : 'NO_PART_OF_CLAIM_SUPPLIED_UNKNOWN',
        independentOf: 'NEVER_INFERRED_FROM_ABSENCE',
        legalIndependence: 'UNKNOWN',
      },
    },
    membership: { entries, membershipDigest: membershipDigestOf(entries) },
    validation: {
      ruleVersion: c.ruleVersion,
      execution: c.execution,
      executionVerification: 'NOT_VERIFIED',
      sourceGlobals,
      unavailableInputs,
      findingCoverage: {
        recordScoped: cat.RECORD_SCOPED_FINDINGS,
        inputScoped: cat.INPUT_SCOPED_FINDINGS,
        neighbourRecords: cat.NEIGHBOUR_RECORD_FINDINGS,
      },
      findings,
      findingsDigest: findingsDigestOf(findings),
    },
    reviews: { chains, attestationReferences, latestReview: 'NOT_PROVEN' },
    protection: { check: PROTECTION_CHECK, verdict: PROTECTION_VERDICT },
    omissions: sortedOmissions,
    states: {
      shapeValidity: 'SHAPE_VALID',
      contentDigestConsistency: 'CONSISTENT',
      declaredScopeCoverage:
        declaredGaps.length === 0 ? 'NO_GAP_DECLARED_OVER_SUPPLIED_INPUT' : 'GAPS_DECLARED',
      unresolvedSourceOmissions:
        sortedOmissions.length === 0 ? 'NONE_DETECTED_IN_SUPPLIED_INPUT' : 'PRESENT',
      sourceSnapshotVerification: 'NOT_VERIFIED',
      sourceCompleteness: 'NOT_PROVEN',
      sourceFreshness: 'NOT_PROVEN',
      exportAuthentication: 'UNAUTHENTICATED',
    },
    limitations: LIMITATIONS,
    permissions: PERMISSIONS,
    canonicalIssuer: CANONICAL_ISSUER,
  };
  return { ...body, manifestDigest: manifestDigestOfBody(body) };
}

// ------------------------------------------------------------------ public API

/** Builds the manifest, or refuses. Never partial: a refusal produces no manifest. */
export function buildSnapshotScopeManifest(input: unknown): SnapshotScopeResult {
  try {
    const manifest = build(checkInput(input));
    return {
      outcome: 'BUILT',
      manifest,
      canonical: manifestCanonicalJson(manifest as unknown as ManifestValue),
    };
  } catch (error) {
    if (error instanceof SnapshotScopeRefusal) {
      return { outcome: 'REFUSED', code: error.code, detail: error.detail };
    }
    throw error;
  }
}

/** The four states no S0 verification can move. */
const UNPROVEN = Object.freeze({
  sourceSnapshotVerification: 'NOT_VERIFIED',
  sourceCompleteness: 'NOT_PROVEN',
  sourceFreshness: 'NOT_PROVEN',
  exportAuthentication: 'UNAUTHENTICATED',
} as const);

export interface ManifestVerification {
  readonly contentDigestConsistency: 'CONSISTENT' | 'INCONSISTENT';
  readonly inconsistencies: readonly string[];
  readonly sourceSnapshotVerification: 'NOT_VERIFIED';
  readonly sourceCompleteness: 'NOT_PROVEN';
  readonly sourceFreshness: 'NOT_PROVEN';
  readonly exportAuthentication: 'UNAUTHENTICATED';
}

/**
 * Recomputes the membership, findings and manifest digests a manifest
 * carries. CONSISTENT means only that the digests match the manifest's own
 * fields: anyone who edits a manifest can recompute them, so a consistent
 * manifest is still UNAUTHENTICATED, and nothing here reads the source.
 */
export function verifySnapshotScopeManifest(manifest: unknown): ManifestVerification {
  const inconsistencies: string[] = [];
  try {
    if (!isPlainObject(manifest)) throw new Error('not_an_object');
    const m = manifest as unknown as SnapshotScopeManifest;
    const { manifestDigest, ...body } = m;
    if (m.contract !== SNAPSHOT_SCOPE_CONTRACT) inconsistencies.push('contract');
    if (membershipDigestOf(m.membership.entries) !== m.membership.membershipDigest) {
      inconsistencies.push('membershipDigest');
    }
    if (findingsDigestOf(m.validation.findings) !== m.validation.findingsDigest) {
      inconsistencies.push('findingsDigest');
    }
    if (manifestDigestOfBody(body) !== manifestDigest) inconsistencies.push('manifestDigest');
    const states = m.states as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(UNPROVEN)) {
      if (states[key] !== value) inconsistencies.push(`states.${key}`);
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
 * Rebuilds the manifest from `input` and compares canonical bytes. REPRODUCED
 * proves only that this manifest binds exactly this supplied input - not
 * that the input is the source's whole, current state.
 */
export function reproduceSnapshotScopeManifest(
  input: unknown,
  manifest: SnapshotScopeManifest,
): 'REPRODUCED' | 'NOT_REPRODUCED' {
  const rebuilt = buildSnapshotScopeManifest(input);
  if (rebuilt.outcome !== 'BUILT') return 'NOT_REPRODUCED';
  try {
    return rebuilt.canonical === manifestCanonicalJson(manifest as unknown as ManifestValue)
      ? 'REPRODUCED'
      : 'NOT_REPRODUCED';
  } catch {
    return 'NOT_REPRODUCED';
  }
}

/** A caller-supplied reference set. Its independence from the manifest is never proven here. */
export interface SnapshotScopeReference {
  readonly records: readonly {
    readonly recordType: RecordType;
    readonly recordId: string;
    readonly contentDigest: string;
  }[];
  readonly findings: readonly SnapshotScopeFinding[];
  readonly reviewHeads: readonly { readonly targetKey: string; readonly headReviewId: string }[];
}

export type DiscrepancyCode =
  | 'RECORD_MISSING_FROM_MANIFEST'
  | 'RECORD_NOT_IN_REFERENCE'
  | 'RECORD_CONTENT_DIFFERS'
  | 'SOURCE_GLOBAL_DIFFERS'
  | 'FINDING_MISSING_FROM_MANIFEST'
  | 'FINDING_NOT_IN_REFERENCE'
  | 'REVIEW_HEAD_DIFFERS'
  | 'REVIEW_CHAIN_MISSING_FROM_MANIFEST';

export interface ReferenceComparison {
  readonly coverage: 'CONSISTENT_WITH_SUPPLIED_REFERENCE' | 'DISCREPANCIES_FOUND';
  readonly discrepancies: readonly { readonly code: DiscrepancyCode; readonly ref: string }[];
  readonly reviewTails: readonly {
    readonly targetKey: string;
    readonly sourceTail:
      | 'MATCHES_SUPPLIED_REFERENCE'
      | 'DIFFERS_FROM_SUPPLIED_REFERENCE'
      | 'NOT_IN_SUPPLIED_REFERENCE';
  }[];
  readonly referenceIndependence: 'CALLER_ASSERTED_NOT_PROVEN';
  readonly contentDigestConsistency: ManifestVerification['contentDigestConsistency'];
  readonly sourceSnapshotVerification: 'NOT_VERIFIED';
  readonly sourceCompleteness: 'NOT_PROVEN';
  readonly sourceFreshness: 'NOT_PROVEN';
  readonly exportAuthentication: 'UNAUTHENTICATED';
}

const REFERENCE_HEAD_KEYS = ['headReviewId', 'targetKey'];
/** A review target key exactly as B2.1 `reviewTargetKeyOf` and migration 0013 spell it. */
const REVIEW_TARGET_KEY = new RegExp(
  `^(?:subject|identity_claim|relationship_claim):${UUID.source.slice(1)}`,
);

/**
 * The reference's review heads, refused unless every entry is exactly
 * `{ targetKey, headReviewId }` - a review target key and a review id - with at
 * most one entry per target. A repeated target is refused even when both heads
 * agree: a last-wins map would let an entry asserting a different head vanish
 * by order, and a null head would "match" a forked chain that has none.
 */
function checkReferenceHeads(value: unknown): Map<string, string> {
  if (!Array.isArray(value)) refuse('INPUT_SHAPE_UNSUPPORTED', 'reference.reviewHeads_not_a_list');
  const heads = new Map<string, string>();
  for (const raw of value as readonly unknown[]) {
    const h = exactKeys(
      raw,
      REFERENCE_HEAD_KEYS,
      'INPUT_SHAPE_UNSUPPORTED',
      'reference.reviewHead',
    );
    const targetKey = h['targetKey'];
    if (typeof targetKey !== 'string' || !REVIEW_TARGET_KEY.test(targetKey)) {
      refuse('INPUT_SHAPE_UNSUPPORTED', 'reference.reviewHead.targetKey');
    }
    const headReviewId = h['headReviewId'];
    if (typeof headReviewId !== 'string' || !UUID.test(headReviewId)) {
      refuse('INPUT_SHAPE_UNSUPPORTED', 'reference.reviewHead.headReviewId');
    }
    if (heads.has(targetKey)) refuse('DUPLICATE_RECORD_IDENTITY', `reference:${targetKey}`);
    heads.set(targetKey, headReviewId);
  }
  return heads;
}

/**
 * Compares a manifest's membership, findings and review heads with a
 * caller-supplied reference set: the only way S0 can detect an omitted record,
 * a dropped finding, a falsified source global or a review behind its tail.
 * Agreement proves agreement with THAT reference, nothing about the source.
 * A malformed reference throws `SnapshotScopeRefusal` rather than comparing;
 * its review heads are checked before anything is compared.
 */
export function compareSnapshotScopeWithReference(
  manifest: SnapshotScopeManifest,
  reference: SnapshotScopeReference,
): ReferenceComparison {
  const referenceHeads = checkReferenceHeads(reference.reviewHeads);
  const discrepancies: { code: DiscrepancyCode; ref: string }[] = [];
  const key = (t: string, id: string) => `${t}:${id}`;
  const mine = new Map(
    manifest.membership.entries.map((e) => [key(e.recordType, e.recordId), e.contentDigest]),
  );
  const theirs = new Map<string, string>();
  for (const r of reference.records) {
    if (
      !(RECORD_TYPE_ORDER as readonly string[]).includes(r.recordType) ||
      !HEX64.test(r.contentDigest)
    ) {
      refuse('INPUT_SHAPE_UNSUPPORTED', 'reference.record');
    }
    const k = key(r.recordType, r.recordId);
    if (theirs.has(k)) refuse('DUPLICATE_RECORD_IDENTITY', `reference:${k}`);
    theirs.set(k, r.contentDigest);
  }
  for (const [k, digest] of theirs) {
    const have = mine.get(k);
    if (have === undefined) discrepancies.push({ code: 'RECORD_MISSING_FROM_MANIFEST', ref: k });
    else if (have !== digest) {
      discrepancies.push({
        code: k.startsWith('SOURCE_GLOBAL:') ? 'SOURCE_GLOBAL_DIFFERS' : 'RECORD_CONTENT_DIFFERS',
        ref: k,
      });
    }
  }
  for (const k of mine.keys()) {
    if (!theirs.has(k)) discrepancies.push({ code: 'RECORD_NOT_IN_REFERENCE', ref: k });
  }

  const myFindings = new Set(manifest.validation.findings.map(findingLine));
  const theirFindings = new Set(reference.findings.map((f) => findingLine(checkFinding(f))));
  for (const line of theirFindings) {
    if (!myFindings.has(line))
      discrepancies.push({ code: 'FINDING_MISSING_FROM_MANIFEST', ref: line });
  }
  for (const line of myFindings) {
    if (!theirFindings.has(line))
      discrepancies.push({ code: 'FINDING_NOT_IN_REFERENCE', ref: line });
  }

  const heads = new Map(manifest.reviews.chains.map((ch) => [ch.targetKey, ch.headReviewId]));
  for (const [targetKey, head] of referenceHeads) {
    if (!heads.has(targetKey)) {
      discrepancies.push({ code: 'REVIEW_CHAIN_MISSING_FROM_MANIFEST', ref: targetKey });
    } else if (heads.get(targetKey) !== head) {
      discrepancies.push({ code: 'REVIEW_HEAD_DIFFERS', ref: targetKey });
    }
  }
  const reviewTails = [...heads.keys()].sort().map((targetKey) => ({
    targetKey,
    sourceTail: !referenceHeads.has(targetKey)
      ? ('NOT_IN_SUPPLIED_REFERENCE' as const)
      : referenceHeads.get(targetKey) === heads.get(targetKey)
        ? ('MATCHES_SUPPLIED_REFERENCE' as const)
        : ('DIFFERS_FROM_SUPPLIED_REFERENCE' as const),
  }));

  const sorted = discrepancies.sort((a, b) =>
    a.code === b.code ? (a.ref < b.ref ? -1 : 1) : a.code < b.code ? -1 : 1,
  );
  return {
    coverage: sorted.length === 0 ? 'CONSISTENT_WITH_SUPPLIED_REFERENCE' : 'DISCREPANCIES_FOUND',
    discrepancies: sorted,
    reviewTails,
    referenceIndependence: 'CALLER_ASSERTED_NOT_PROVEN',
    contentDigestConsistency: verifySnapshotScopeManifest(manifest).contentDigestConsistency,
    ...UNPROVEN,
  };
}
