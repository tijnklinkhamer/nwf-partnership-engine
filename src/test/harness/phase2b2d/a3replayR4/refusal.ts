/**
 * PHASE 2B-2D — A3 R47: GLOBAL R4 DEV_TRAIN REPLAY REFUSALS.
 *
 * Every refusal is a STOP, never a degraded result. A message names a
 * position, a stratum or a count, never a selection index, a digest, an
 * organisation, a run, a URL or any text.
 */
export type A3ReplayR4RefusalCode =
  // R46 approval binding.
  | 'R47_R46_APPROVAL_BYTES_MISMATCH'
  | 'R47_R46_APPROVAL_CONTENT_MISMATCH'
  | 'R47_R4_PROPOSAL_BYTES_MISMATCH'
  | 'R47_R46_APPROVAL_NOT_BOUND'
  // Historical input reproduction.
  | 'STOP_R47_HISTORICAL_CENSUS_REPRODUCTION_DRIFT'
  | 'R47_COMMITTED_CENSUS_BYTES_MISMATCH'
  | 'R47_HISTORICAL_REPRODUCTION_INPUT_INVALID'
  | 'R47_HISTORICAL_REPRODUCTION_NOT_PROVED'
  // Document replay view.
  | 'R47_DOCUMENT_SOURCE_NOT_GENUINE'
  | 'R47_DOCUMENT_STRATUM_COUNT_MISMATCH'
  | 'R47_DOCUMENT_SLOT_NOT_DEV_TRAIN'
  | 'R47_DUPLICATE_SELECTION_SLOT'
  | 'R47_TEXT_CAPABILITY_UNAVAILABLE'
  | 'STOP_R47_DOCUMENT_POPULATION_MISMATCH'
  | 'STOP_R47_GOVERNANCE_V5_COVERAGE_MISMATCH'
  | 'R47_DOCUMENT_VIEW_ALREADY_BOUND'
  | 'R47_NOT_A_MINTED_DOCUMENT_REPLAY_VIEW'
  // R4 graphs.
  | 'R47_R4_GRAPH_MEASUREMENT_STOPPED'
  | 'STOP_R47_R3_LONG_BRANCH_INVARIANT_MISMATCH'
  | 'STOP_R47_A2_SD9_INVARIANCE_MISMATCH'
  | 'R47_R4_GRAPH_BATCH_ALREADY_MEASURED'
  | 'R47_NOT_A_MINTED_R4_GRAPH_BATCH'
  // R4 samples.
  | 'R47_R4_SAMPLE_INPUT_INVALID'
  | 'R47_R4_SAMPLE_POSTCONDITION_FAILED'
  | 'R47_R4_SAMPLE_BATCH_ALREADY_PREPARED'
  | 'R47_NOT_A_MINTED_R4_SAMPLE_BATCH'
  // R4 readiness.
  | 'R47_R4_READINESS_POSTCONDITION_FAILED'
  | 'STOP_R47_SAMPLE_SD9_CONTRADICTS_GRAPH_ENVELOPE'
  | 'R47_R4_READINESS_BATCH_ALREADY_DERIVED'
  | 'R47_NOT_A_MINTED_R4_READINESS_BATCH';

export class A3ReplayR4Refusal extends Error {
  readonly code: A3ReplayR4RefusalCode;
  constructor(code: A3ReplayR4RefusalCode, message: string, options?: { cause?: unknown }) {
    super(`STOP: ${code}: ${message}`, options);
    this.name = 'A3ReplayR4Refusal';
    this.code = code;
  }
}

export function refuseR47(
  code: A3ReplayR4RefusalCode,
  message: string,
  options?: { cause?: unknown },
): never {
  throw new A3ReplayR4Refusal(code, message, options);
}
