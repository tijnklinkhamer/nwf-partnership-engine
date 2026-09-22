/**
 * PHASE 2B-2D — A3 R20: THE DURABLE-EVIDENCE TYPES.
 *
 * ONE QUESTION R20 ANSWERS
 *
 *   For every R17-minted READY authority in DEV_TRAIN, can the adapter prove
 *   that exactly one durable research run has
 *   `sha256(canonical run UUID) === authority.runRefSha256`, and load that
 *   run's append-only evidence with every provenance field later A3 selection
 *   needs?
 *
 * THE TWO LEVELS, AND WHY THEY ARE DIFFERENT TYPES
 *
 *   `UnboundDurableRunEvidence` is what the SQL layer returns. It is rows,
 *   relationally proved against each other and against a plain request - and
 *   it is NOT authority. A test may build one freely, because doing so proves
 *   nothing about which acquisition A2 adjudicated.
 *
 *   `A3DurableAcquisitionEvidence` is minted ONLY by the binder that has
 *   already verified an actual R17-minted READY authority and the actual R19
 *   snapshot that minted it. It is branded by a private `WeakSet`, so a
 *   clone, a spread, a literal or a deserialised copy is not one.
 *
 *   The gap between them is the whole point: a lower-level reader that could
 *   mint authority would let a caller name any organisation and receive
 *   something a later slice would treat as approved corpus input.
 *
 * WHAT THESE TYPES DELIBERATELY DO NOT CARRY
 *
 *   No relevance, verdict, label, gold, classifier or threshold field. No
 *   SET_P membership, no SET_R score, no SD7 graph, no near-duplicate edge,
 *   no rank that means anything beyond provenance. R20 preserves what the
 *   authorised run recorded; it decides nothing about what a document means.
 */
import type { A3SlotAcquisitionAuthorityReady } from '../a3prep/slotAuthority.js';
import type { A3CommittedGovernanceSnapshot } from '../a3governance/snapshot.js';

/**
 * R20 V1 supports EXACTLY ONE split. There is no generic split argument:
 * a parameter would make reading DEV_CONFIRM or FINAL_HOLDOUT a one-character
 * change, and those splits are sealed against exactly that.
 */
export const R20_EVIDENCE_SPLIT_V1 = 'DEV_TRAIN' as const;
export type R20EvidenceSplitV1 = typeof R20_EVIDENCE_SPLIT_V1;

/**
 * The real working database this adapter is allowed to bind against. It is a
 * NAME, not a connection string and not an environment lookup: the caller
 * supplies the pool, and this constant only says which database the preflight
 * must find itself inside.
 */
export const R20_REAL_WORKING_DATABASE_NAME = 'nwf_pe' as const;

/** The one PostgreSQL role permitted to perform an R20 read. */
export const R20_REQUIRED_DATABASE_ROLE = 'nwf_readonly' as const;

/**
 * The current production Track -> persisted `track` mapping (Phase 2B-1e).
 * A MECHANISM label, never a semantic claim about the unit: the deterministic
 * layer still cannot separate a unit from a degree programme, which is why
 * `type_hint` stays NULL in every persisted row.
 */
export const R20_EXPECTED_CANDIDATE_TRACKS = Object.freeze([
  'INTERNATIONAL_OFFICE',
  'LANGUAGE_CENTRE',
] as const);
export type R20ExpectedCandidateTrack = (typeof R20_EXPECTED_CANDIDATE_TRACKS)[number];

// ---------------------------------------------------------------------------
// A. THE PLAIN REQUEST THE SQL LAYER TAKES.
// ---------------------------------------------------------------------------

/**
 * What the lower reader needs to locate and prove one run. It carries no
 * authority: it is four strings a test can type. That is deliberate - see the
 * file header.
 */
export interface UnboundDurableEvidenceRequest {
  readonly organisationId: string;
  readonly echeRowKey: string;
  readonly expectedRunRefSha256: string;
  readonly expectedAcquisitionPolicyVersion: string;
}

// ---------------------------------------------------------------------------
// B. THE DURABLE ROWS, AS STORED.
// ---------------------------------------------------------------------------

export interface DurableRunRow {
  readonly id: string;
  readonly startedAt: string;
  readonly networkVantage: string;
  readonly fetchPolicyVersion: string;
  /** The SIGNAL / ranking rule version. Never the extraction rule version. */
  readonly ruleVersion: string;
  readonly dryRun: boolean;
}

export interface DurableCompletionRow {
  readonly id: string;
  readonly runId: string;
  readonly terminalState: string;
  readonly finishedAt: string;
  readonly errorKind: string | null;
  readonly errorSummary: string | null;
}

export interface DurableFetchObservationRow {
  readonly id: string;
  readonly runId: string;
  readonly rootWebsiteClaimId: string | null;
  readonly rootPromotionId: string | null;
  readonly rootKey: string;
  readonly echeRowKey: string;
  readonly organisationId: string | null;
  readonly requestedUrl: string;
  readonly requestedHost: string;
  readonly requestedRegistrableDomain: string;
  readonly attemptNo: number;
  readonly discoveryMethod: string;
  readonly discoveryParentUrl: string | null;
  readonly httpStatus: number | null;
  readonly contentType: string | null;
  readonly charset: string | null;
  readonly charsetSource: string | null;
  readonly charsetConfidence: string | null;
  /** THE A3 DOCUMENT IDENTITY, reached through the page's exact fetch. */
  readonly responseSha256: string | null;
  readonly byteCount: number | null;
  readonly truncated: boolean;
  readonly robotsDecision: string;
  readonly robotsRule: string | null;
  readonly errorKind: string | null;
  readonly fetchPolicyVersion: string;
  readonly observedAt: string;
}

export interface DurablePageEvidenceRow {
  readonly id: string;
  readonly fetchObservationId: string;
  readonly rootKey: string;
  readonly title: string | null;
  readonly declaredLang: string | null;
  readonly headings: readonly unknown[];
  readonly mainText: string;
  readonly mainTextChars: number;
  readonly mainTextTruncated: boolean;
  readonly extractionMethod: string;
  /** The EXTRACTION rule version. Distinct from the run's signal rule version. */
  readonly ruleVersion: string;
  readonly observedAt: string;
}

/**
 * One page-evidence row joined to the document identity and provenance of the
 * exact fetch observation it was extracted from. The join is explicit
 * (`page.fetch_observation_id -> fetch.id`) because a page id alone proves
 * nothing about which bytes produced it.
 */
export interface DurablePageEvidenceSourceRow {
  readonly page: DurablePageEvidenceRow;
  readonly fetch: DurableFetchObservationRow;
  /** Non-null once the page relation has been proved; see `integrity.ts`. */
  readonly responseSha256: string;
  readonly requestedUrl: string;
  readonly httpStatus: number;
}

export interface DurableCandidateRow {
  readonly id: string;
  readonly pageEvidenceId: string;
  readonly runId: string;
  readonly rootKey: string;
  readonly track: string;
  readonly typeHint: string | null;
  /**
   * THE EXACT PostgreSQL `numeric(8,4)` REPRESENTATION, as a string. It is
   * never parsed into a float, never clamped and never recomputed: migration
   * 0008 made this column SIGNED precisely because ordinary pages score below
   * zero, and a negative score is durable evidence.
   */
  readonly candidateScore: string;
  readonly signals: readonly unknown[];
  readonly urlTreeParent: string | null;
  /** PROVENANCE ONLY. Frozen K1 says this is not an input to the SET_R reducer. */
  readonly rankWithinRoot: number;
  readonly ruleVersion: string;
}

/** One candidate joined to its page and that page's fetch. */
export interface DurableCandidateSourceRow {
  readonly candidate: DurableCandidateRow;
  readonly pageEvidenceId: string;
  readonly responseSha256: string;
}

// ---------------------------------------------------------------------------
// C. THE UNBOUND RESULT.
// ---------------------------------------------------------------------------

/**
 * Everything the SQL layer loaded and relationally proved for one run. NOT
 * branded, NOT authority, freely constructible in a test.
 */
export interface UnboundDurableRunEvidence {
  readonly kind: 'UNBOUND_DURABLE_DATABASE_EVIDENCE';
  readonly request: UnboundDurableEvidenceRequest;
  readonly run: DurableRunRow;
  readonly completion: DurableCompletionRow;
  readonly fetchObservations: readonly DurableFetchObservationRow[];
  readonly pageEvidence: readonly DurablePageEvidenceSourceRow[];
  readonly candidates: readonly DurableCandidateSourceRow[];
  readonly integrity: DurableEvidenceIntegrity;
}

/**
 * The aggregate integrity measures R20 discovered. Every one of them is a
 * COUNT: none identifies a page, a document or a host.
 */
export interface DurableEvidenceIntegrity {
  readonly fetchObservationCount: number;
  readonly pageEvidenceSourceRowCount: number;
  readonly candidateRowCount: number;
  /** An aggregate integrity measure. It is NOT SET_P and ranks nothing. */
  readonly distinctResponseSha256Count: number;
  /** Source rows whose response digest is shared with at least one other row. */
  readonly duplicateDocumentSourceRowCount: number;
  /** Documents carrying rows under more than one extraction rule version. */
  readonly multipleExtractionVersionDocumentCount: number;
  readonly sameDocumentSameExtractionConflictCount: number;
  readonly identityContaminationCount: number;
  readonly fetchPolicyMismatchCount: number;
  readonly relationalOrphanCount: number;
  readonly candidateTrackPairViolationCount: number;
  readonly extractionRuleVersionCounts: Readonly<Record<string, number>>;
  readonly signalRuleVersionCounts: Readonly<Record<string, number>>;
  readonly candidateTrackCounts: Readonly<Record<string, number>>;
}

// ---------------------------------------------------------------------------
// D. THE MINTED AUTHORITY.
// ---------------------------------------------------------------------------

/**
 * Durable acquisition evidence BOUND to the exact governance authority that
 * permits reading it. Minted only by `devTrain.ts`, only after every R20
 * check passed, and branded so that a clone is not one.
 */
export interface A3DurableAcquisitionEvidence {
  readonly kind: 'A3_DURABLE_ACQUISITION_EVIDENCE';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly split: R20EvidenceSplitV1;
  /** The ACTUAL R17-minted READY authority, by reference. */
  readonly authority: A3SlotAcquisitionAuthorityReady;
  /** The ACTUAL R19 snapshot that minted that authority, by reference. */
  readonly governanceSnapshot: A3CommittedGovernanceSnapshot;
  readonly evidence: UnboundDurableRunEvidence;
}

/** The DEV_TRAIN batch. Also branded; also never serialised. */
export interface A3DevTrainDurableEvidenceBatchV1 {
  readonly kind: 'A3_DEV_TRAIN_DURABLE_EVIDENCE_BATCH_V1';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly split: R20EvidenceSplitV1;
  readonly governanceSnapshot: A3CommittedGovernanceSnapshot;
  readonly items: readonly A3DurableAcquisitionEvidence[];
}
