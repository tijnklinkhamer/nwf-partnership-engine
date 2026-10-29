/**
 * TRACK B, B2.4-R1a - THE CANONICAL FINDINGS OF ONE SUBJECT-EVIDENCE
 * DOCUMENT, AND WHAT OF THEM I0 v1 CAN CARRY.
 *
 * B-LOCAL FINDINGS ARE NEVER WEAKENED. Every finding the accepted read model
 * reports for the subject is kept with its ORIGIN, SEVERITY and SCOPE:
 *
 *   IDENTITY_VALIDATOR  the B2.1 validator's findings, through B2.3-R2's
 *                       recorded / effective readings (readModel.ts);
 *   REVIEW_ATTESTATION  every B2.3 hold reason of every review, the subject's
 *                       integrity hold, and every withheld review chain;
 *   PROTECTION          the conservative protection projection: structural
 *                       uncertainty under ANY reading, relationship targets
 *                       unresolved under ANY reading, every re-evaluation
 *                       trigger, and every record that arrived after the
 *                       subject's current attested decisions.
 *
 * A finding about the input as a whole keeps `recordId: "input"` and the
 * scope INPUT. It is never given a fabricated UUID or an arbitrary null.
 *
 * I0 v1 COMPATIBILITY IS A RENDERING, NEVER A FILTER. I0-R2's
 * `checkDiscoveryHandoff` (Operator 35488be) accepts a finding as exactly
 * `{code, field, recordId}` with `recordId` a UUID or null, `field` a plain
 * identifier or null, at most 200 of them, sorted and distinct, digested by
 * `findingsDigestOf`. When EVERY B-local finding fits, the rendering is given
 * with that exact digest. When ANY does not, there is no rendering at all -
 * only a diagnostic per obstacle - because a digest over the representable
 * subset would silently drop the rest. I0-R2 is a compatibility reference,
 * not a ratified authority: nothing here claims Track C accepts either form.
 *
 * PURE: no socket, no database, no filesystem, no environment, no clock.
 */
import { createHash } from 'node:crypto';

import type { FindingView, ProtectionProjection } from '../subjectRegistry/readModel.js';
import type {
  ReviewAttestationSummary,
  ReviewAttestationVerdict,
} from '../subjectRegistry/reviewAttestation.js';
import { canonicalJson } from '../subjectReview/canonical.js';
import { RC2_SHARED_HANDOFF_CONTRACT, SUBJECT_EVIDENCE_CONTRACT, UUID } from './contract.js';

export const FINDING_ORIGINS = ['IDENTITY_VALIDATOR', 'REVIEW_ATTESTATION', 'PROTECTION'] as const;
export type FindingOrigin = (typeof FINDING_ORIGINS)[number];

/** B2.1 severities, plus the two B2.3 classes the validator does not emit. */
export type EvidenceFindingSeverity = FindingView['severity'] | 'INTEGRITY_HOLD' | 'PROTECTION';

/** RECORD: about one record, by its id. INPUT: about the input as a whole (`recordId: "input"`). */
export type FindingScope = 'RECORD' | 'INPUT';

export interface EvidenceFinding {
  readonly origin: FindingOrigin;
  readonly severity: EvidenceFindingSeverity;
  readonly code: string;
  readonly scope: FindingScope;
  readonly recordId: string;
  readonly field: string | null;
}

/** The B2.1 validator's whole-input record id. */
export const INPUT_RECORD_ID = 'input';

/** Codes this module adds; each is distinct from every B2.1 code and B2.3 hold reason. */
export const DERIVED_FINDING_CODES = [
  'REVIEW_INTEGRITY_HOLD',
  'REVIEW_AUTHORITY_WITHHELD',
  'TARGET_IDENTITY_UNRESOLVED_ANY_READING',
  'EVIDENCE_AFTER_ATTESTATION',
  'REQUIRES_PROTECTION_REEVALUATION',
] as const;

const TARGET_KEY = /^(subject|identity_claim|relationship_claim):(.+)$/;
const TARGET_FIELD: Readonly<Record<string, string>> = {
  subject: 'subject',
  identity_claim: 'identityClaim',
  relationship_claim: 'relationshipClaim',
};

function scopeOf(recordId: string): FindingScope {
  if (recordId === INPUT_RECORD_ID) return 'INPUT';
  if (UUID.test(recordId)) return 'RECORD';
  // The projection refuses non-UUID record ids before any finding exists.
  throw new Error(`a finding names an unexpected record id: ${recordId}`);
}

function hold(code: string, recordId: string, field: string | null = null): EvidenceFinding {
  return {
    origin: 'REVIEW_ATTESTATION',
    severity: 'INTEGRITY_HOLD',
    code,
    scope: 'RECORD',
    recordId,
    field,
  };
}

function protection(code: string, recordId: string): EvidenceFinding {
  return {
    origin: 'PROTECTION',
    severity: 'PROTECTION',
    code,
    scope: 'RECORD',
    recordId,
    field: null,
  };
}

/** One canonical line per finding: the sort and dedupe key. */
const line = (f: object) => canonicalJson(f as never);

function sortDistinct<T extends object>(list: readonly T[]): T[] {
  const seen = new Map<string, T>();
  for (const f of list) seen.set(line(f), f);
  return [...seen.keys()].sort().map((k) => seen.get(k)!);
}

export interface FindingSources {
  readonly subjectId: string;
  /** The read model's four finding lists, as it reported them for this subject. */
  readonly validator: readonly FindingView[];
  /**
   * The B2.1 validator's whole-input findings (`recordId: "input"`). The read
   * model scopes findings to the focal subject's records and so never reports
   * these; they are material, so the companion keeps them.
   */
  readonly inputScoped: readonly FindingView[];
  readonly attestation: ReviewAttestationSummary;
  readonly withheldTargets: readonly string[];
  readonly protection: ProtectionProjection;
}

/** Every material finding of the subject, canonical: sorted by canonical line, distinct. */
export function evidenceFindingsOf(sources: FindingSources): EvidenceFinding[] {
  const out: EvidenceFinding[] = [...sources.validator, ...sources.inputScoped].map((f) => ({
    origin: 'IDENTITY_VALIDATOR',
    severity: f.severity,
    code: f.code,
    scope: scopeOf(f.recordId),
    recordId: f.recordId,
    field: f.field,
  }));
  for (const verdict of sources.attestation.reviews as readonly ReviewAttestationVerdict[]) {
    for (const reason of verdict.holdReasons) out.push(hold(reason, verdict.reviewId));
  }
  if (sources.attestation.state === 'INTEGRITY_HOLD') {
    out.push(hold('REVIEW_INTEGRITY_HOLD', sources.subjectId));
  }
  for (const key of sources.withheldTargets) {
    const m = TARGET_KEY.exec(key);
    if (m === null) throw new Error(`a withheld review target is malformed: ${key}`);
    out.push(hold('REVIEW_AUTHORITY_WITHHELD', m[2]!, TARGET_FIELD[m[1]!]!));
  }
  const p = sources.protection;
  for (const reason of p.structuralUncertainty) out.push(protection(reason, sources.subjectId));
  for (const id of p.relationshipTargetIdentityUnresolved) {
    out.push(protection('TARGET_IDENTITY_UNRESOLVED_ANY_READING', id));
  }
  for (const trigger of p.reevaluationTriggers) out.push(protection(trigger, sources.subjectId));
  if (p.reevaluationRequired) {
    out.push(protection('REQUIRES_PROTECTION_REEVALUATION', sources.subjectId));
  }
  for (const id of p.evidenceAfterAttestation) {
    out.push(protection('EVIDENCE_AFTER_ATTESTATION', id));
  }
  for (const f of out) scopeOf(f.recordId);
  return sortDistinct(out);
}

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

/** The B-local findings digest. Producer-computed: a consistency check, never a trust anchor. */
export function evidenceFindingsDigestOf(findings: readonly EvidenceFinding[]): string {
  return sha256(`${SUBJECT_EVIDENCE_CONTRACT}/findings\n${canonicalJson(findings as never)}`);
}

// ------------------------------------------------------------------ I0 v1 rendering

/** I0-R2's finding shape (`FINDING_KEYS`): exactly code, field, recordId. */
export interface I0V1Finding {
  readonly code: string;
  readonly field: string | null;
  readonly recordId: string | null;
}

/** I0-R2's own shapes and bound (provenance.ts), restated so B can say what will not fit. */
export const I0_V1_FINDING_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
export const I0_V1_FIELD_NAME = /^[a-zA-Z][a-zA-Z0-9]{0,63}$/;
export const I0_V1_MAX_FINDINGS = 200;

/**
 * Exactly I0-R2's `findingsDigestOf`: SHA-256 of
 * `nwf-pe.discovery-identity-handoff.v1/findings\n` + canonical JSON. For
 * string/null-valued objects B's canonical JSON and I0's are byte-identical.
 */
export function i0V1FindingsDigestOf(findings: readonly I0V1Finding[]): string {
  return sha256(`${RC2_SHARED_HANDOFF_CONTRACT}/findings\n${canonicalJson(findings as never)}`);
}

export type I0V1FindingDiagnosticCode =
  | 'I0_V1_INPUT_SCOPED_FINDING_UNREPRESENTABLE'
  | 'I0_V1_FINDING_CODE_UNREPRESENTABLE'
  | 'I0_V1_FINDING_FIELD_UNREPRESENTABLE'
  | 'I0_V1_DISTINCT_FINDINGS_WOULD_COLLAPSE'
  | 'I0_V1_FINDINGS_BOUND_EXCEEDED';

export interface I0V1FindingDiagnostic {
  readonly code: I0V1FindingDiagnosticCode;
  /** The ORIGINAL B-local finding, unchanged; null for a whole-list diagnostic. */
  readonly finding: EvidenceFinding | null;
}

/** What an I0 v1 finding cannot say, even when every finding fits its shape. */
export const I0_V1_FINDING_LOSSES = ['ORIGIN_NOT_CARRIED', 'SEVERITY_NOT_CARRIED'] as const;

export type I0V1FindingsRendering =
  | {
      readonly status: 'REPRESENTABLE';
      readonly findings: readonly I0V1Finding[];
      readonly findingsDigest: string;
      readonly losses: typeof I0_V1_FINDING_LOSSES;
    }
  | {
      readonly status: 'NOT_REPRESENTABLE';
      readonly diagnostics: readonly I0V1FindingDiagnostic[];
      readonly losses: typeof I0_V1_FINDING_LOSSES;
    };

/** Renders EVERY finding for I0 v1, or none of them with a diagnostic per obstacle. */
export function i0V1FindingsRenderingOf(
  findings: readonly EvidenceFinding[],
): I0V1FindingsRendering {
  const diagnostics: I0V1FindingDiagnostic[] = [];
  const rendered: I0V1Finding[] = [];
  for (const f of findings) {
    if (f.scope === 'INPUT') {
      diagnostics.push({ code: 'I0_V1_INPUT_SCOPED_FINDING_UNREPRESENTABLE', finding: f });
      continue;
    }
    if (!I0_V1_FINDING_CODE.test(f.code)) {
      diagnostics.push({ code: 'I0_V1_FINDING_CODE_UNREPRESENTABLE', finding: f });
      continue;
    }
    if (f.field !== null && !I0_V1_FIELD_NAME.test(f.field)) {
      diagnostics.push({ code: 'I0_V1_FINDING_FIELD_UNREPRESENTABLE', finding: f });
      continue;
    }
    rendered.push({ code: f.code, field: f.field, recordId: f.recordId });
  }
  const distinct = sortDistinct(rendered);
  if (distinct.length !== rendered.length) {
    diagnostics.push({ code: 'I0_V1_DISTINCT_FINDINGS_WOULD_COLLAPSE', finding: null });
  }
  if (distinct.length > I0_V1_MAX_FINDINGS) {
    diagnostics.push({ code: 'I0_V1_FINDINGS_BOUND_EXCEEDED', finding: null });
  }
  if (diagnostics.length > 0) {
    return { status: 'NOT_REPRESENTABLE', diagnostics, losses: I0_V1_FINDING_LOSSES };
  }
  return {
    status: 'REPRESENTABLE',
    findings: distinct,
    findingsDigest: i0V1FindingsDigestOf(distinct),
    losses: I0_V1_FINDING_LOSSES,
  };
}
