import type { Split } from '../sd7/sd7Contract.js';

export type A3Split = Split;
export type A3Track = 'A' | 'B';

/**
 * The persisted candidate facts A3 may READ later. A3 never recomputes these
 * scores: they are acquisition-time, candidate-independent evidence.
 */
export interface A3CandidateInput {
  readonly pageEvidenceId: string;
  readonly track: A3Track;
  readonly candidateScore: number;
  readonly rankWithinRoot: number;
  readonly ruleVersion: string;
  readonly rootKey: string;
}

/**
 * The minimum page-evidence facts deterministic A3 tooling needs.
 * `documentSha256` is the joined
 * `orgunit_fetch_observations.response_sha256`, never a newly-derived hash.
 */
export interface A3PageEvidenceInput {
  readonly organisationKey: string;
  readonly split: A3Split;
  readonly pageEvidenceId: string;
  readonly rootKey: string;
  readonly documentSha256: string;
  readonly mainText: string;
  readonly candidates: readonly A3CandidateInput[];
}

export type A3AcquisitionRecordState = 'ADJUDICATED' | 'PENDING';
export type A3ReserveTransitionState = 'NOT_REQUIRED' | 'ADJUDICATED' | 'PENDING';

/**
 * No URL, hostname, label or model output is necessary to express the A2→A3
 * handoff. The later DB adapter can populate this from completed A2 evidence.
 */
export interface A3OrganisationInput {
  readonly selectionIndex: number;
  readonly organisationKey: string;
  readonly split: A3Split;
  readonly acquisitionOfRecordState: A3AcquisitionRecordState;
  readonly reserveTransitionState: A3ReserveTransitionState;
  readonly pages: readonly A3PageEvidenceInput[];
}

/** One exact-document identity after byte-hash deduplication. */
export interface A3DistinctDocument {
  readonly documentSha256: string;
  readonly mainText: string;
  readonly pageEvidenceIds: readonly string[];
}

/**
 * SET_R's ranking algorithm is reusable once a separately-approved adapter has
 * reduced the persisted Track A/B rows to ONE page/document score. This type is
 * intentionally downstream of that unresolved decision.
 */
export interface A3ResolvedSetRDocument extends A3DistinctDocument {
  readonly candidateIndependentScore: number;
}

export type A3Sd9Status =
  | 'ACQUISITION_SUCCESSFUL'
  | 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET'
  | 'ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL';
