/**
 * PHASE 2B-2D — A4 R51: REFUSALS.
 *
 * Every refusal names a POSITION or a reason, never page text, a URL or a
 * human decision. Nothing here repairs: a refusal is the whole answer.
 */
export type A4ReviewDevTrainRefusalCode =
  // Binding the frozen R50 package and R49 rubric.
  | 'R51_PACKAGE_BYTES_MISMATCH'
  | 'R51_PACKAGE_HASH_MISMATCH'
  | 'R51_PACKAGE_RECORD_COUNT_MISMATCH'
  | 'R51_PACKAGE_ORDER_INVALID'
  | 'R51_PACKAGE_RECORD_INVALID'
  | 'R51_TEMPLATE_MISMATCH'
  | 'R51_INDEX_MISMATCH'
  | 'R51_CENSUS_MISMATCH'
  | 'R51_RUBRIC_NOT_BOUND'
  | 'R51_BINDING_NOT_MINTED'
  // Authority records.
  | 'R51_OWNER_APPROVAL_INVALID'
  | 'R51_AUTHORITY_INVALID'
  // Completed-response file.
  | 'R51_RESPONSE_FILE_INVALID'
  // Tooling.
  | 'R51_TOOL_INPUT_INVALID'
  | 'R51_ARTIFACT_ALREADY_EXISTS';

export class A4ReviewDevTrainRefusal extends Error {
  readonly code: A4ReviewDevTrainRefusalCode;
  constructor(code: A4ReviewDevTrainRefusalCode, message: string, options?: { cause?: unknown }) {
    super(`STOP: ${code}: ${message}`, options);
    this.name = 'A4ReviewDevTrainRefusal';
    this.code = code;
  }
}

export function refuseR51(
  code: A4ReviewDevTrainRefusalCode,
  message: string,
  options?: { cause?: unknown },
): never {
  throw new A4ReviewDevTrainRefusal(code, message, options);
}
