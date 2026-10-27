/**
 * GLOBAL R9 - THE ENGINE-LOCAL, PROVISIONAL SUBJECT RESEARCH-EVIDENCE
 * DOCUMENT (`nwf-pe.subject-research-evidence.v1-provisional`).
 *
 * WHAT THIS IS. One small, versioned document per subject-rooted research
 * RUN (one OWNER admission, ADR 0025): the admission the run was rooted in,
 * that admission's standing when the document was produced, the run's
 * terminal state, and the run's persisted fetch, page and candidate evidence
 * reduced to what an OWNER reviewer needs - every attempted URL with its
 * outcome, every page's title, headings and a bounded excerpt of its already
 * redacted main text, and every deterministic rank with its rule ids. It
 * binds by digest to the subject's B2.4 evidence document, which it neither
 * imports, names nor re-emits (the label `B2_4_SUBJECT_EVIDENCE`, as R5).
 *
 * WHAT THIS IS NOT.
 *   - Not identity, not jurisdiction: the subject id is B's evidence
 *     container id, and no page, host or language becomes a country, a legal
 *     form or a canonical identifier.
 *   - Not a verdict: a candidate score is a deterministic rank (ADR 0007),
 *     never a classification; the classifier cannot take this evidence
 *     (ADR 0025 s8).
 *   - Not a permission: every capability is the literal `NONE`. Research
 *     evidence grants no Qualification, publication, outreach or contact.
 *   - Not signed, not complete, not fresh beyond the standing evaluated at
 *     `producedAt` by the database clock: see LIMITATIONS.
 *
 * PURE apart from SHA-256: no socket, no database, no filesystem, no
 * environment, no clock. `verifySubjectResearchEvidence` re-derives every
 * digest, count and the standing from the document's own content, so a
 * consumer never has to trust the producer's arithmetic.
 */
import { createHash } from 'node:crypto';

import { redactorsForStoredExtraction } from '../web/redact.js';

export const RESEARCH_EVIDENCE_CONTRACT = 'nwf-pe.subject-research-evidence.v1-provisional';
export const RESEARCH_EVIDENCE_CONTRACT_STATUS = 'ENGINE_LOCAL_PROVISIONAL_ADR_0025_PROPOSED';
export const RESEARCH_EVIDENCE_RULE_VERSION = 'subject-research-evidence-rules-v1';
/** The only admission policy this build exports (migration 0017's CHECK). */
export const ADMISSION_POLICY_VERSION = 'subject-research-admission-policy-v1';
/** The B2.4 document this one binds to by digest. A LABEL, never its contract string. */
export const BOUND_DOCUMENT_KIND = 'B2_4_SUBJECT_EVIDENCE';
export const ENGINE_SOURCE_REPOSITORY = 'nwf-partnership-engine';
/** The excerpt is the first EXCERPT_CODE_POINTS code points of the stored (redacted) text. */
export const EXCERPT_CODE_POINTS = 2000;
export const EXCERPT_RULE = `first-${EXCERPT_CODE_POINTS}-code-points`;

export const READ_CONSISTENCY_CLASSES = [
  'SINGLE_SNAPSHOT_TRANSACTION',
  'SYNTHETIC_IN_MEMORY',
] as const;
export type ReadConsistencyClass = (typeof READ_CONSISTENCY_CLASSES)[number];

/**
 * The admission's standing when the document was produced. Precedence:
 * REVOKED > EXPIRED > STALE_REGISTRY_CHANGED > ACTIVE. Only ACTIVE describes
 * evidence a consumer may present; the others are exported so that a
 * consumer refuses them explicitly rather than never seeing them.
 */
export const ADMISSION_STANDINGS = [
  'ACTIVE',
  'REVOKED',
  'EXPIRED',
  'STALE_REGISTRY_CHANGED',
] as const;
export type AdmissionStanding = (typeof ADMISSION_STANDINGS)[number];

export const TERMINAL_STATES = ['COMPLETED', 'FAILED', 'ABORTED'] as const;
export const IDENTITY_AUTHORITY_SCOPES = ['OPERATIONAL', 'TEST_ONLY'] as const;

/** Every capability is `NONE`, by type and by value. */
export const PERMISSIONS = Object.freeze({
  research: 'NONE',
  classification: 'NONE',
  canonicalIssuance: 'NONE',
  canonicalLinking: 'NONE',
  qualification: 'NONE',
  memberRelease: 'NONE',
  publication: 'NONE',
  outreach: 'NONE',
  contactPermission: 'NONE',
  suppressionClearance: 'NONE',
} as const);

export const LIMITATIONS = Object.freeze({
  documentSignature: 'NONE_NOT_A_SIGNED_EXPORT',
  completeness: 'NOT_PROVEN_AN_UNSIGNED_EXPORT_IS_NOT_PROOF_OF_COMPLETENESS',
  freshness: 'STANDING_EVALUATED_AT_PRODUCED_AT_BY_THE_DATABASE_CLOCK_ONLY',
  producerDigests: 'NOT_AN_EXTERNAL_TRUST_ANCHOR',
  mainText: 'REDACTED_AT_EXTRACTION_EXCERPT_ONLY_NOT_THE_PAGE',
  candidateScore: 'DETERMINISTIC_RANK_NOT_A_CLASSIFICATION_OR_VERDICT',
  identity: 'NOT_IDENTITY_NOT_JURISDICTION_NOT_AN_ORGANISATION_RECORD',
  classifier: 'NOT_CLASSIFIABLE_ADR_0025_S8',
  vantage: 'A_FETCH_OUTCOME_DESCRIBES_THE_VANTAGE_AS_MUCH_AS_THE_SITE',
  ratification: 'ADR_0025_PROPOSED_MIGRATION_0017_NOT_ACTIVATED',
} as const);

export const MAX_FETCHES = 120;
export const MAX_PAGES = 70;
export const MAX_CANDIDATES = 210;
export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

export const REFUSAL_CODES = [
  'CONTRACT_UNKNOWN',
  'CONTEXT_SHAPE_INVALID',
  'RECORD_SHAPE_INVALID',
  'RUN_NOT_SUBJECT_ROOTED',
  'RUN_IS_DRY_RUN',
  'RUN_NOT_TERMINAL',
  'POLICY_VERSION_UNKNOWN',
  'EVIDENCE_INCONSISTENT',
  'CONTACT_SHAPED_TEXT',
  'BOUND_EXCEEDED',
] as const;
export type RefusalCode = (typeof REFUSAL_CODES)[number];

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const HEX64 = /^[0-9a-f]{64}$/;
const GIT_REVISION = /^[0-9a-f]{40}$/;
export const INSTANT_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const FINGERPRINT = /^s=[0-9]+;i=[0-9]+;r=[0-9]+;v=[0-9]+;a=[0-9]+$/;
const ROOT_KEY =
  /^subject_admission:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const DECIMAL = /^-?[0-9]+(?:\.[0-9]+)?$/;
const COUNT = /^(?:0|[1-9][0-9]{0,9})$/;

class Refusal extends Error {
  constructor(
    readonly code: RefusalCode,
    readonly detail: string,
  ) {
    super(`subject research evidence refused: ${code} (${detail})`);
  }
}

function refuse(code: RefusalCode, detail: string): never {
  throw new Refusal(code, detail);
}

// ------------------------------------------------------------ canonical JSON

/**
 * The B2.3 canonical encoding, restated (not imported: the B2.3 review and
 * R4 jurisdiction namespaces' importer sets are frozen): sorted keys, no
 * whitespace, strings, null, booleans, arrays and plain objects only - NO
 * NUMBERS.
 */
export type CanonicalValue =
  null | boolean | string | readonly CanonicalValue[] | { readonly [key: string]: CanonicalValue };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

export function canonicalJson(value: unknown, depth = 0): string {
  if (depth > 16) throw new TypeError('canonical: nesting_too_deep');
  if (value === null) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v, depth + 1)).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((k) => {
        const v = value[k];
        if (v === undefined) throw new TypeError('canonical: undefined_value');
        return `${JSON.stringify(k)}:${canonicalJson(v, depth + 1)}`;
      })
      .join(',')}}`;
  }
  throw new TypeError(`canonical: unsupported_${typeof value}`);
}

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
export const sectionDigestOf = (section: string, value: unknown) =>
  sha256(`${RESEARCH_EVIDENCE_CONTRACT}/${section}\n${canonicalJson(value)}`);
export const documentDigestOf = (document: unknown) =>
  sha256(`${RESEARCH_EVIDENCE_CONTRACT}\n${canonicalJson(document)}`);

function exactlyKeyed(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return (
    isPlainObject(value) &&
    canonicalJson([...Object.keys(value)].sort()) === canonicalJson([...keys].sort())
  );
}

// ------------------------------------------------------------ input records

export interface ResearchEvidenceContext {
  readonly contract: typeof RESEARCH_EVIDENCE_CONTRACT;
  /** SHA-256 of the B2.4 document for the admission's subject, computed by the caller. */
  readonly subjectEvidenceDocumentDigest: string;
  readonly sourceRepository: typeof ENGINE_SOURCE_REPOSITORY;
  /** A 40-hex git commit, or null. INFORMATIONAL. */
  readonly sourceRevision: string | null;
  readonly readConsistency: ReadConsistencyClass;
}

export interface AdmissionRecord {
  readonly id: string;
  readonly subjectId: string;
  readonly websiteUrl: string;
  readonly policyVersion: string;
  readonly identityAuthorityScope: string;
  readonly subjectStateDigest: string;
  readonly protectedRegistryDigest: string;
  readonly registryFingerprint: string;
  readonly admittedAt: string;
  readonly expiresAt: string;
}

export interface RevocationRecord {
  readonly id: string;
  readonly revokedAt: string;
}

export interface RunRecord {
  readonly id: string;
  readonly rootScope: string;
  readonly startedAt: string;
  readonly networkVantage: string;
  readonly fetchPolicyVersion: string;
  readonly signalRuleVersion: string;
  readonly dryRun: boolean;
}

export interface CompletionRecord {
  readonly terminalState: string;
  readonly finishedAt: string;
  readonly errorKind: string | null;
}

export interface FetchRecord {
  readonly id: string;
  readonly rootKey: string;
  readonly requestedUrl: string;
  readonly requestedHost: string;
  readonly requestedRegistrableDomain: string;
  readonly attemptNo: string;
  readonly discoveryMethod: string;
  readonly discoveryParentUrl: string | null;
  readonly httpStatus: string | null;
  readonly contentType: string | null;
  readonly responseSha256: string | null;
  readonly byteCount: string | null;
  readonly truncated: boolean;
  readonly robotsDecision: string;
  readonly errorKind: string | null;
  readonly errorSubtype: string | null;
  readonly fetchPolicyVersion: string;
  readonly observedAt: string;
}

export interface PageRecord {
  readonly id: string;
  readonly fetchObservationId: string;
  readonly rootKey: string;
  readonly title: string | null;
  readonly declaredLang: string | null;
  readonly headings: readonly { readonly level: string; readonly text: string }[];
  /** The FULL stored main text: excerpted and hashed here, never exported whole. */
  readonly mainText: string;
  readonly mainTextChars: string;
  readonly mainTextTruncated: boolean;
  readonly extractionMethod: string;
  readonly ruleVersion: string;
  readonly observedAt: string;
}

export interface SignalRecord {
  readonly ruleId: string;
  readonly pack: string;
  readonly kind: string;
  readonly field: string;
  readonly weight: string;
}

export interface CandidateRecord {
  readonly id: string;
  readonly pageEvidenceId: string;
  readonly runId: string;
  readonly rootKey: string;
  readonly track: string;
  readonly typeHint: string | null;
  readonly candidateScore: string;
  readonly rankWithinRoot: string;
  readonly ruleVersion: string;
  readonly signals: readonly SignalRecord[];
}

export interface ResearchEvidenceRecords {
  readonly admission: AdmissionRecord;
  readonly revocations: readonly RevocationRecord[];
  /** The registry fingerprint read in the same transaction as everything else. */
  readonly registryFingerprintAtEvaluation: string;
  /** The database clock in that transaction: the standing's instant and `producedAt`. */
  readonly evaluatedAt: string;
  readonly run: RunRecord;
  readonly completion: CompletionRecord | null;
  readonly fetches: readonly FetchRecord[];
  readonly pages: readonly PageRecord[];
  readonly candidates: readonly CandidateRecord[];
}

// ------------------------------------------------------------ checks

const isStr = (v: unknown): v is string => typeof v === 'string';
const strOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string';

function want(ok: boolean, code: RefusalCode, detail: string): void {
  if (!ok) refuse(code, detail);
}

function checkContext(context: unknown): ResearchEvidenceContext {
  if (!isPlainObject(context) || context['contract'] !== RESEARCH_EVIDENCE_CONTRACT) {
    refuse('CONTRACT_UNKNOWN', 'contract');
  }
  const keys = [
    'contract',
    'readConsistency',
    'sourceRepository',
    'sourceRevision',
    'subjectEvidenceDocumentDigest',
  ];
  want(exactlyKeyed(context, keys), 'CONTEXT_SHAPE_INVALID', 'keys');
  const c = context as unknown as ResearchEvidenceContext;
  want(
    isStr(c.subjectEvidenceDocumentDigest) && HEX64.test(c.subjectEvidenceDocumentDigest),
    'CONTEXT_SHAPE_INVALID',
    'subjectEvidenceDocumentDigest',
  );
  want(c.sourceRepository === ENGINE_SOURCE_REPOSITORY, 'CONTEXT_SHAPE_INVALID', 'repository');
  want(
    c.sourceRevision === null || (isStr(c.sourceRevision) && GIT_REVISION.test(c.sourceRevision)),
    'CONTEXT_SHAPE_INVALID',
    'sourceRevision',
  );
  want(
    (READ_CONSISTENCY_CLASSES as readonly unknown[]).includes(c.readConsistency),
    'CONTEXT_SHAPE_INVALID',
    'readConsistency',
  );
  return c;
}

const instant = (v: unknown, detail: string) =>
  want(isStr(v) && INSTANT_MS.test(v), 'RECORD_SHAPE_INVALID', detail);
const uuid = (v: unknown, detail: string) =>
  want(isStr(v) && UUID.test(v), 'RECORD_SHAPE_INVALID', detail);

/**
 * Every exported text must already be a fixed point of the redaction its
 * stored extraction rule version names (WW H-EX, P2-9: version-aware).
 * A row stored under `orgunit-extraction-v3` is judged by the FROZEN v3
 * redactor - the rules it was written under - so a later widening of the
 * current redactor (the bare-digit-run rule of `orgunit-extraction-v4`)
 * never re-judges it; every other label (v1, v2, v4, anything unknown) is
 * judged by the CURRENT redactor, the strictest the Engine has
 * (`redactorsForStoredExtraction`). Text stored before a redaction widening
 * (the REL Engine integration widened JP/MX/NL telephone and email
 * redaction and introduced `orgunit-extraction-v3`; REL harvest H3, ported
 * from REL-F1-R2 item d) can fail this although it was redacted when it
 * was extracted: that is a SAFE refusal - the export never re-redacts and
 * never emits the text - and the detail names exactly why, without echoing
 * any of it: the field, which shape(s) the rules it is judged by would
 * still redact, which rules those are, and the extraction rule version the
 * text was stored under. The remedy is new research under the current
 * extraction version, never an edit of append-only evidence.
 */
function redactionFixedPoint(
  text: string | null,
  field: string,
  extractionRuleVersion: string,
): void {
  const judge = redactorsForStoredExtraction(extractionRuleVersion);
  if (text === null || judge.contactData(text) === text) return;
  const emailRedacted = judge.emails(text);
  const shapes = [
    ...(emailRedacted !== text ? ['EMAIL'] : []),
    ...(judge.phones(emailRedacted) !== emailRedacted ? ['PHONE'] : []),
  ];
  refuse(
    'CONTACT_SHAPED_TEXT',
    `${field}: ${shapes.join('+')}-shaped text under the ${judge.rules} redaction rules ` +
      `(stored under ${extractionRuleVersion}; not re-redacted, not exported)`,
  );
}

function checkRecords(records: unknown): ResearchEvidenceRecords {
  const R: RefusalCode = 'RECORD_SHAPE_INVALID';
  want(
    exactlyKeyed(records, [
      'admission',
      'candidates',
      'completion',
      'evaluatedAt',
      'fetches',
      'pages',
      'registryFingerprintAtEvaluation',
      'revocations',
      'run',
    ]),
    R,
    'keys',
  );
  const r = records as unknown as ResearchEvidenceRecords;
  const a = r.admission;
  want(isPlainObject(a), R, 'admission');
  uuid(a.id, 'admission.id');
  uuid(a.subjectId, 'admission.subjectId');
  want(isStr(a.websiteUrl) && /^https?:\/\//.test(a.websiteUrl), R, 'admission.websiteUrl');
  want(a.policyVersion === ADMISSION_POLICY_VERSION, 'POLICY_VERSION_UNKNOWN', a.policyVersion);
  want(
    (IDENTITY_AUTHORITY_SCOPES as readonly unknown[]).includes(a.identityAuthorityScope),
    R,
    'admission.identityAuthorityScope',
  );
  want(isStr(a.subjectStateDigest) && HEX64.test(a.subjectStateDigest), R, 'subjectStateDigest');
  want(
    isStr(a.protectedRegistryDigest) && HEX64.test(a.protectedRegistryDigest),
    R,
    'protectedRegistryDigest',
  );
  want(isStr(a.registryFingerprint) && FINGERPRINT.test(a.registryFingerprint), R, 'fingerprint');
  instant(a.admittedAt, 'admittedAt');
  instant(a.expiresAt, 'expiresAt');
  want(
    isStr(r.registryFingerprintAtEvaluation) && FINGERPRINT.test(r.registryFingerprintAtEvaluation),
    R,
    'registryFingerprintAtEvaluation',
  );
  instant(r.evaluatedAt, 'evaluatedAt');
  want(Array.isArray(r.revocations), R, 'revocations');
  for (const v of r.revocations) {
    uuid(v.id, 'revocation.id');
    instant(v.revokedAt, 'revocation.revokedAt');
  }

  const run = r.run;
  want(isPlainObject(run), R, 'run');
  uuid(run.id, 'run.id');
  const scope = isStr(run.rootScope) ? ROOT_KEY.exec(run.rootScope) : null;
  if (scope === null || scope[1] !== a.id) refuse('RUN_NOT_SUBJECT_ROOTED', 'run.rootScope');
  want(run.dryRun === false, 'RUN_IS_DRY_RUN', 'run.dryRun');
  instant(run.startedAt, 'run.startedAt');
  for (const k of ['networkVantage', 'fetchPolicyVersion', 'signalRuleVersion'] as const) {
    want(isStr(run[k]) && run[k].length > 0 && run[k].length <= 64, R, `run.${k}`);
  }
  if (r.completion === null) refuse('RUN_NOT_TERMINAL', 'completion');
  want(
    (TERMINAL_STATES as readonly unknown[]).includes(r.completion.terminalState),
    R,
    'terminalState',
  );
  instant(r.completion.finishedAt, 'finishedAt');
  want(strOrNull(r.completion.errorKind), R, 'completion.errorKind');

  want(Array.isArray(r.fetches) && r.fetches.length <= MAX_FETCHES, 'BOUND_EXCEEDED', 'fetches');
  want(Array.isArray(r.pages) && r.pages.length <= MAX_PAGES, 'BOUND_EXCEEDED', 'pages');
  want(
    Array.isArray(r.candidates) && r.candidates.length <= MAX_CANDIDATES,
    'BOUND_EXCEEDED',
    'candidates',
  );
  const fetchIds = new Set<string>();
  for (const f of r.fetches) {
    uuid(f.id, 'fetch.id');
    want(!fetchIds.has(f.id), 'EVIDENCE_INCONSISTENT', 'fetch_duplicate');
    fetchIds.add(f.id);
    want(f.rootKey === run.rootScope, 'EVIDENCE_INCONSISTENT', 'fetch.rootKey');
    for (const k of [
      'requestedUrl',
      'requestedHost',
      'requestedRegistrableDomain',
      'discoveryMethod',
      'robotsDecision',
      'fetchPolicyVersion',
    ] as const) {
      want(isStr(f[k]), R, `fetch.${k}`);
    }
    for (const k of [
      'discoveryParentUrl',
      'httpStatus',
      'contentType',
      'responseSha256',
      'byteCount',
      'errorKind',
      'errorSubtype',
    ] as const) {
      want(strOrNull(f[k]), R, `fetch.${k}`);
    }
    want(isStr(f.attemptNo) && COUNT.test(f.attemptNo), R, 'fetch.attemptNo');
    want(f.httpStatus === null || /^[1-5][0-9]{2}$/.test(f.httpStatus), R, 'fetch.httpStatus');
    want(f.byteCount === null || COUNT.test(f.byteCount), R, 'fetch.byteCount');
    want(f.responseSha256 === null || HEX64.test(f.responseSha256), R, 'fetch.responseSha256');
    want(typeof f.truncated === 'boolean', R, 'fetch.truncated');
    instant(f.observedAt, 'fetch.observedAt');
  }
  const pageIds = new Set<string>();
  for (const p of r.pages) {
    uuid(p.id, 'page.id');
    want(!pageIds.has(p.id), 'EVIDENCE_INCONSISTENT', 'page_duplicate');
    pageIds.add(p.id);
    want(fetchIds.has(p.fetchObservationId), 'EVIDENCE_INCONSISTENT', 'page.fetchObservationId');
    want(p.rootKey === run.rootScope, 'EVIDENCE_INCONSISTENT', 'page.rootKey');
    want(strOrNull(p.title) && strOrNull(p.declaredLang), R, 'page.title');
    want(isStr(p.mainText), R, 'page.mainText');
    want(isStr(p.mainTextChars) && COUNT.test(p.mainTextChars), R, 'page.mainTextChars');
    want(typeof p.mainTextTruncated === 'boolean', R, 'page.mainTextTruncated');
    want(isStr(p.extractionMethod) && isStr(p.ruleVersion), R, 'page.method');
    want(Array.isArray(p.headings), R, 'page.headings');
    for (const h of p.headings) {
      want(exactlyKeyed(h, ['level', 'text']) && /^[1-3]$/.test(h.level), R, 'page.heading');
      want(isStr(h.text), R, 'page.heading.text');
      redactionFixedPoint(h.text, 'page.heading', p.ruleVersion);
    }
    instant(p.observedAt, 'page.observedAt');
    redactionFixedPoint(p.title, 'page.title', p.ruleVersion);
    redactionFixedPoint(p.mainText, 'page.mainText', p.ruleVersion);
  }
  const candidateIds = new Set<string>();
  for (const c of r.candidates) {
    uuid(c.id, 'candidate.id');
    want(!candidateIds.has(c.id), 'EVIDENCE_INCONSISTENT', 'candidate_duplicate');
    candidateIds.add(c.id);
    want(pageIds.has(c.pageEvidenceId), 'EVIDENCE_INCONSISTENT', 'candidate.pageEvidenceId');
    want(c.runId === run.id, 'EVIDENCE_INCONSISTENT', 'candidate.runId');
    want(c.rootKey === run.rootScope, 'EVIDENCE_INCONSISTENT', 'candidate.rootKey');
    want(isStr(c.track) && strOrNull(c.typeHint), R, 'candidate.track');
    want(isStr(c.candidateScore) && DECIMAL.test(c.candidateScore), R, 'candidate.score');
    want(isStr(c.rankWithinRoot) && COUNT.test(c.rankWithinRoot), R, 'candidate.rank');
    want(isStr(c.ruleVersion), R, 'candidate.ruleVersion');
    want(Array.isArray(c.signals), R, 'candidate.signals');
    for (const s of c.signals) {
      want(exactlyKeyed(s, ['field', 'kind', 'pack', 'ruleId', 'weight']), R, 'signal');
      want(isStr(s.ruleId) && isStr(s.pack) && isStr(s.kind) && isStr(s.field), R, 'signal.fields');
      want(isStr(s.weight) && DECIMAL.test(s.weight), R, 'signal.weight');
    }
  }
  return r;
}

// ------------------------------------------------------------ derivations

/** The standing, from the document's own facts. Precedence REVOKED > EXPIRED > STALE > ACTIVE. */
export function standingOf(input: {
  readonly revocationCount: number;
  readonly evaluatedAt: string;
  readonly expiresAt: string;
  readonly admittedFingerprint: string;
  readonly evaluatedFingerprint: string;
}): AdmissionStanding {
  if (input.revocationCount > 0) return 'REVOKED';
  // Both instants share one fixed-width UTC form, so string order is time order.
  if (input.evaluatedAt >= input.expiresAt) return 'EXPIRED';
  if (input.evaluatedFingerprint !== input.admittedFingerprint) return 'STALE_REGISTRY_CHANGED';
  return 'ACTIVE';
}

const byId = <T extends { readonly id: string }>(rows: readonly T[]) =>
  [...rows].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
const byObservedThenId = <T extends { readonly id: string; readonly observedAt: string }>(
  rows: readonly T[],
) =>
  [...rows].sort((x, y) =>
    x.observedAt !== y.observedAt ? (x.observedAt < y.observedAt ? -1 : 1) : x.id < y.id ? -1 : 1,
  );

export const excerptOf = (text: string) => Array.from(text).slice(0, EXCERPT_CODE_POINTS).join('');

/** Counts a consumer recomputes from the sections; strings, never numbers. */
export function summaryOf(sections: {
  readonly fetches: readonly {
    readonly httpStatus: string | null;
    readonly requestedHost: string;
  }[];
  readonly pages: readonly unknown[];
  readonly candidates: readonly unknown[];
}): CanonicalValue {
  return {
    fetchAttempts: String(sections.fetches.length),
    successfulResponses: String(
      sections.fetches.filter((f) => f.httpStatus !== null && /^2/.test(f.httpStatus)).length,
    ),
    distinctHosts: String(new Set(sections.fetches.map((f) => f.requestedHost)).size),
    pagesWithEvidence: String(sections.pages.length),
    candidateRanks: String(sections.candidates.length),
  };
}

export interface ResearchEvidenceDocument {
  readonly contract: typeof RESEARCH_EVIDENCE_CONTRACT;
  readonly contractStatus: typeof RESEARCH_EVIDENCE_CONTRACT_STATUS;
  readonly ruleVersions: CanonicalValue;
  readonly subject: CanonicalValue;
  readonly source: CanonicalValue;
  readonly admission: CanonicalValue;
  readonly standing: CanonicalValue;
  readonly run: CanonicalValue;
  readonly fetches: CanonicalValue;
  readonly pages: CanonicalValue;
  readonly candidates: CanonicalValue;
  readonly summary: CanonicalValue;
  readonly digests: CanonicalValue;
  readonly permissions: typeof PERMISSIONS;
  readonly limitations: typeof LIMITATIONS;
}

export type ResearchEvidenceResult =
  | {
      readonly outcome: 'PROJECTED';
      readonly document: ResearchEvidenceDocument;
      readonly canonical: string;
      /** SHA-256 of `${contract}\n${canonical}`. Producer-computed: never a trust anchor. */
      readonly documentDigest: string;
      readonly standing: AdmissionStanding;
    }
  | { readonly outcome: 'REFUSED'; readonly code: RefusalCode; readonly detail: string };

function build(c: ResearchEvidenceContext, r: ResearchEvidenceRecords): ResearchEvidenceResult {
  const a = r.admission;
  const revocations = byId(r.revocations).map((v) => ({
    revocationId: v.id,
    revokedAt: v.revokedAt,
  }));
  const standing = standingOf({
    revocationCount: revocations.length,
    evaluatedAt: r.evaluatedAt,
    expiresAt: a.expiresAt,
    admittedFingerprint: a.registryFingerprint,
    evaluatedFingerprint: r.registryFingerprintAtEvaluation,
  });
  const fetches = byObservedThenId(r.fetches).map((f) => ({
    fetchObservationId: f.id,
    requestedUrl: f.requestedUrl,
    requestedHost: f.requestedHost,
    requestedRegistrableDomain: f.requestedRegistrableDomain,
    attemptNo: f.attemptNo,
    discoveryMethod: f.discoveryMethod,
    discoveryParentUrl: f.discoveryParentUrl,
    httpStatus: f.httpStatus,
    contentType: f.contentType,
    responseSha256: f.responseSha256,
    byteCount: f.byteCount,
    truncated: f.truncated,
    robotsDecision: f.robotsDecision,
    errorKind: f.errorKind,
    errorSubtype: f.errorSubtype,
    fetchPolicyVersion: f.fetchPolicyVersion,
    observedAt: f.observedAt,
  }));
  const pages = byObservedThenId(r.pages).map((p) => ({
    pageEvidenceId: p.id,
    fetchObservationId: p.fetchObservationId,
    title: p.title,
    declaredLang: p.declaredLang,
    headings: p.headings.map((h) => ({ level: h.level, text: h.text })),
    mainTextExcerpt: excerptOf(p.mainText),
    mainTextSha256: sha256(p.mainText),
    mainTextChars: p.mainTextChars,
    mainTextTruncatedAtExtraction: p.mainTextTruncated,
    extractionMethod: p.extractionMethod,
    extractionRuleVersion: p.ruleVersion,
    observedAt: p.observedAt,
  }));
  const candidates = [...r.candidates]
    .sort((x, y) =>
      x.track !== y.track
        ? x.track < y.track
          ? -1
          : 1
        : Number(x.rankWithinRoot) - Number(y.rankWithinRoot) || (x.id < y.id ? -1 : 1),
    )
    .map((k) => ({
      candidateId: k.id,
      pageEvidenceId: k.pageEvidenceId,
      track: k.track,
      typeHint: k.typeHint,
      candidateScore: k.candidateScore,
      rankWithinRoot: k.rankWithinRoot,
      signalRuleVersion: k.ruleVersion,
      signals: [...k.signals]
        .map((s) => ({
          ruleId: s.ruleId,
          pack: s.pack,
          kind: s.kind,
          field: s.field,
          weight: s.weight,
        }))
        .sort((x, y) => (canonicalJson(x) < canonicalJson(y) ? -1 : 1)),
    }));
  const completion = r.completion!;
  const document: ResearchEvidenceDocument = {
    contract: RESEARCH_EVIDENCE_CONTRACT,
    contractStatus: RESEARCH_EVIDENCE_CONTRACT_STATUS,
    ruleVersions: {
      evidence: RESEARCH_EVIDENCE_RULE_VERSION,
      admissionPolicy: ADMISSION_POLICY_VERSION,
      excerpt: EXCERPT_RULE,
    },
    subject: {
      discoverySubjectId: a.subjectId,
      boundDocumentKind: BOUND_DOCUMENT_KIND,
      subjectEvidenceDocumentDigest: c.subjectEvidenceDocumentDigest,
    },
    source: {
      sourceRepository: c.sourceRepository,
      sourceRevision: c.sourceRevision,
      readConsistency: c.readConsistency,
      producedAt: r.evaluatedAt,
    },
    admission: {
      admissionId: a.id,
      rootKey: `subject_admission:${a.id}`,
      websiteUrl: a.websiteUrl,
      policyVersion: a.policyVersion,
      identityAuthorityScope: a.identityAuthorityScope,
      subjectStateDigest: a.subjectStateDigest,
      protectedRegistryDigest: a.protectedRegistryDigest,
      registryFingerprint: a.registryFingerprint,
      admittedAt: a.admittedAt,
      expiresAt: a.expiresAt,
    },
    standing: {
      state: standing,
      evaluatedAt: r.evaluatedAt,
      evaluatedBy: 'DATABASE_CLOCK_IN_THE_EXPORT_TRANSACTION',
      registryFingerprintAtEvaluation: r.registryFingerprintAtEvaluation,
      revocations,
    },
    run: {
      runId: r.run.id,
      rootScope: r.run.rootScope,
      startedAt: r.run.startedAt,
      networkVantage: r.run.networkVantage,
      fetchPolicyVersion: r.run.fetchPolicyVersion,
      signalRuleVersion: r.run.signalRuleVersion,
      terminalState: completion.terminalState,
      finishedAt: completion.finishedAt,
      errorKind: completion.errorKind,
    },
    fetches,
    pages,
    candidates,
    summary: summaryOf({ fetches, pages, candidates }),
    digests: {
      fetches: sectionDigestOf('fetches', fetches),
      pages: sectionDigestOf('pages', pages),
      candidates: sectionDigestOf('candidates', candidates),
    },
    permissions: PERMISSIONS,
    limitations: LIMITATIONS,
  };
  const canonical = canonicalJson(document);
  if (Buffer.byteLength(canonical, 'utf8') > MAX_DOCUMENT_BYTES)
    refuse('BOUND_EXCEEDED', 'document');
  return {
    outcome: 'PROJECTED',
    document,
    canonical,
    documentDigest: documentDigestOf(document),
    standing,
  };
}

/**
 * Projects ONE subject-rooted run. Deterministic: the same records in any
 * order under the same context yield the same bytes. An ECHE-rooted run, a
 * dry run, an unfinished run, an unknown policy, evidence that names another
 * root or run, and contact-shaped text are refused, never repaired.
 */
export function projectSubjectResearchEvidence(
  records: unknown,
  context: unknown,
): ResearchEvidenceResult {
  try {
    const c = checkContext(context);
    return build(c, checkRecords(records));
  } catch (error) {
    if (error instanceof Refusal) {
      return { outcome: 'REFUSED', code: error.code, detail: error.detail };
    }
    throw error;
  }
}

export type VerificationResult =
  | {
      readonly state: 'CONSISTENT';
      readonly documentDigest: string;
      readonly standing: AdmissionStanding;
    }
  | { readonly state: 'INCONSISTENT'; readonly reason: string };

/**
 * Re-derives, from a document's OWN content, every section digest, the
 * summary, the root key and the standing, and checks the fixed blocks.
 * Consistency is not authenticity: the document is unsigned. Total.
 */
export function verifySubjectResearchEvidence(document: unknown): VerificationResult {
  const no = (reason: string): VerificationResult => ({ state: 'INCONSISTENT', reason });
  try {
    if (!isPlainObject(document) || document['contract'] !== RESEARCH_EVIDENCE_CONTRACT) {
      return no('contract_unknown');
    }
    const d = document as Record<string, Record<string, unknown> & CanonicalValue>;
    if (canonicalJson(d['permissions']) !== canonicalJson(PERMISSIONS)) return no('permissions');
    if (canonicalJson(d['limitations']) !== canonicalJson(LIMITATIONS)) return no('limitations');
    if (document['contractStatus'] !== RESEARCH_EVIDENCE_CONTRACT_STATUS) return no('status');
    const fetches = d['fetches'] as unknown as {
      httpStatus: string | null;
      requestedHost: string;
    }[];
    const pages = d['pages'] as unknown as unknown[];
    const candidates = d['candidates'] as unknown as unknown[];
    for (const [name, value] of [
      ['fetches', fetches],
      ['pages', pages],
      ['candidates', candidates],
    ] as const) {
      if (d['digests']![name] !== sectionDigestOf(name, value)) return no(`digest_${name}`);
    }
    if (canonicalJson(d['summary']) !== canonicalJson(summaryOf({ fetches, pages, candidates }))) {
      return no('summary');
    }
    const admission = d['admission']!;
    const standing = d['standing']!;
    if (admission['rootKey'] !== `subject_admission:${String(admission['admissionId'])}`) {
      return no('root_key');
    }
    if (d['run']!['rootScope'] !== admission['rootKey']) return no('run_root_scope');
    if (standing['evaluatedAt'] !== d['source']!['producedAt']) return no('evaluated_at');
    const derived = standingOf({
      revocationCount: (standing['revocations'] as unknown[]).length,
      evaluatedAt: standing['evaluatedAt'] as string,
      expiresAt: admission['expiresAt'] as string,
      admittedFingerprint: admission['registryFingerprint'] as string,
      evaluatedFingerprint: standing['registryFingerprintAtEvaluation'] as string,
    });
    if (standing['state'] !== derived) return no('standing');
    return { state: 'CONSISTENT', documentDigest: documentDigestOf(document), standing: derived };
  } catch {
    return no('document_shape');
  }
}
