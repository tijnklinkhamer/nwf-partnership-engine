/**
 * PHASE 2B-2D — A3 R47: R4 SD7 RELATION REFUSALS.
 *
 * Every refusal is a STOP, never a degraded result. A message names a
 * POSITION or a count, never a document digest, a token or any text.
 */
export type Sd7R4RefusalCode =
  | 'SD7_R4_INPUT_SHAPE_INVALID'
  | 'SD7_R4_DUPLICATE_DOCUMENT'
  | 'SD7_R4_EXTRACTED_TEXT_DIVERGED'
  | 'SD7_R4_GRAPH_STRUCTURE_INVALID'
  | 'SD7_R4_SHORT_BRANCH_NOT_AN_EQUIVALENCE'
  | 'STOP_SD7_R4_LONG_COMPONENT_NOT_EXACTLY_AUDITABLE'
  | 'STOP_SD7_R4_LONG_BRANCH_DIFFERS_FROM_CANONICAL_R3';

export class Sd7R4Refusal extends Error {
  readonly code: Sd7R4RefusalCode;
  constructor(code: Sd7R4RefusalCode, message: string, options?: { cause?: unknown }) {
    super(`STOP: ${code}: ${message}`, options);
    this.name = 'Sd7R4Refusal';
    this.code = code;
  }
}

export function refuseSd7R4(
  code: Sd7R4RefusalCode,
  message: string,
  options?: { cause?: unknown },
): never {
  throw new Sd7R4Refusal(code, message, options);
}
