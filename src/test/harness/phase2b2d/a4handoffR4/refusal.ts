/**
 * PHASE 2B-2D — A3 R50: REFUSALS.
 *
 * Every refusal names a POSITION or a reason, never a document digest, an ECHE
 * row key, a URL or page text.
 */
export type A4HandoffR4RefusalCode =
  // Rubric and approval.
  | 'R50_RUBRIC_BYTES_MISMATCH'
  | 'R50_RUBRIC_CONTENT_MISMATCH'
  | 'R50_RUBRIC_APPROVAL_BYTES_MISMATCH'
  | 'R50_RUBRIC_APPROVAL_CONTENT_MISMATCH'
  | 'R50_RUBRIC_NOT_BOUND'
  // R47 authority.
  | 'R50_R47_APPROVAL_NOT_BOUND'
  | 'R50_R47_AUTHORITY_NOT_GENUINE'
  | 'R50_R47_CENSUS_BYTES_MISMATCH'
  | 'STOP_R50_R47_CENSUS_DRIFT'
  | 'STOP_R50_R47_SELECTION_COUNT_MISMATCH'
  | 'R50_R47_AUTHORITY_ALREADY_CONSUMED'
  | 'R50_REPRODUCTION_NOT_PROVED'
  | 'R50_SAMPLE_NOT_DEV_TRAIN'
  | 'R50_CAP_NOT_EXACT'
  | 'R50_CURRENT_OCCUPANT_NOT_PROVED'
  | 'R50_EVIDENCE_PROVENANCE_NOT_PROVED'
  // Pure handoff construction.
  | 'R50_HANDOFF_INPUT_INVALID'
  | 'R50_SELECTED_DOCUMENT_NOT_IN_REPLAY_SLOT'
  | 'R50_SELECTED_DOCUMENT_FOREIGN'
  | 'R50_SELECTED_COUNT_MISMATCH'
  | 'R50_ORGANISATION_MISMATCH'
  | 'R50_SOURCE_ROW_MISSING'
  | 'R50_SOURCE_ROW_EXTRA'
  | 'R50_SOURCE_ROW_DUPLICATE'
  | 'R50_SOURCE_ROW_DIGEST_MISMATCH'
  | 'R50_SOURCE_MAIN_TEXT_DISAGREES'
  | 'R50_SOURCE_PRESENTATION_INVALID'
  | 'R50_HEADING_SHAPE_UNSUPPORTED'
  | 'STOP_R50_GOLDID_COLLISION'
  | 'R50_GOLDID_FORMAT_INVALID'
  | 'R50_REVIEW_PACKAGE_NOT_BLIND'
  | 'R50_RESPONSE_TEMPLATE_INVALID'
  // Writing.
  | 'R50_ARTIFACT_ALREADY_EXISTS'
  | 'R50_ARTIFACT_WRITE_FAILED';

export class A4HandoffR4Refusal extends Error {
  readonly code: A4HandoffR4RefusalCode;
  constructor(code: A4HandoffR4RefusalCode, message: string, options?: { cause?: unknown }) {
    super(`STOP: ${code}: ${message}`, options);
    this.name = 'A4HandoffR4Refusal';
    this.code = code;
  }
}

export function refuseR50(
  code: A4HandoffR4RefusalCode,
  message: string,
  options?: { cause?: unknown },
): never {
  throw new A4HandoffR4Refusal(code, message, options);
}
