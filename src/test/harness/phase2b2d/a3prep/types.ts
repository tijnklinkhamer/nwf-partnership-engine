import type { Split } from '../sd7/sd7Contract.js';

export type A3Split = Split;
export type A3Track = 'A' | 'B';

export interface A3CandidateInput {
  readonly pageEvidenceId: string;
  readonly track: A3Track;
  readonly candidateScore: number;
  readonly rankWithinRoot: number;
  readonly ruleVersion: string;
  readonly rootKey: string;
}

export interface A3PageEvidenceInput {
  readonly organisationKey: string;
  readonly split: A3Split;
  readonly pageEvidenceId: string;
  readonly rootKey: string;
  /**
   * Joined from orgunit_fetch_observations.response_sha256 through
   * orgunit_page_evidence.fetch_observation_id. Never re-derived by A3.
   */
  readonly documentSha256: string;
  readonly mainText: string;
  readonly candidates: readonly A3CandidateInput[];
}

export type A3AcquisitionRecordState = 'ADJUDICATED' | 'PENDING';
export type A3ReserveTransitionState = 'NOT_REQUIRED' | 'ADJUDICATED' | 'PENDING';

export interface A3OrganisationInput {
  readonly selectionIndex: number;
  readonly organisationKey: string;
  readonly split: A3Split;
  readonly acquisitionOfRecordState: A3AcquisitionRecordState;
  readonly reserveTransitionState: A3ReserveTransitionState;
  readonly pages: readonly A3PageEvidenceInput[];
}

export interface A3DistinctDocument {
  readonly organisationKey: string;
  readonly split: A3Split;
  readonly documentSha256: string;
  readonly pageEvidenceIds: readonly string[];
}

/**
 * Deliberately downstream of the unresolved Track A/B -> one-document-score
 * reduction. SET_R may rank this shape; A3 prep does not invent it.
 */
export interface A3ResolvedSetRDocument extends A3DistinctDocument {
  readonly candidateIndependentScore: number;
}

export type A3Sd9Status =
  | 'ACQUISITION_SUCCESSFUL'
  | 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET'
  | 'ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL';
