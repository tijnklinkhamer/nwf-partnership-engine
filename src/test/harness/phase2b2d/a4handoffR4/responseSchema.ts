/**
 * PHASE 2B-2D — A3 R50: THE FUTURE COMPLETED-RESPONSE SHAPE CONTRACT.
 *
 * A PURE SHAPE validator for a later completed human single-review response.
 * It checks only the R49 label-validity matrix, the exact rubric binding and
 * the opaque actor-key form. It never reads page content, never infers a
 * semantic label, never changes an answer and never supplies a default: it
 * returns problems, not a corrected response.
 *
 * R50 ingests no completed response. A blank template row is NOT a valid
 * completed response: every null human field is reported as unanswered.
 */
import {
  RUBRIC_UNIT_TYPES,
  RUBRIC_VALIDITY_MATRIX,
  RUBRIC_VERDICTS,
  type RubricUnitType,
  type RubricVerdict,
} from './rubric.js';
import { RESPONSE_TEMPLATE_KEYS, R50_ACTOR_KEY_PATTERN, R50_GOLD_ID_PATTERN } from './types.js';

export interface CompletedResponseShape {
  readonly goldId: string;
  readonly rubricVersion: string;
  readonly rubricSha256: string;
  readonly reviewerActorKey: string;
  readonly verdict: RubricVerdict;
  readonly unit_type: RubricUnitType | null;
  readonly hard_negative: boolean;
  readonly reviewNote: string | null;
}

/**
 * The shape problems of one completed response, against an exact rubric
 * binding. An empty array means the SHAPE is legal - never that the label is
 * right.
 */
export function completedResponseShapeProblems(
  response: unknown,
  rubric: { readonly rubricVersion: string; readonly rubricSha256: string },
): readonly string[] {
  if (typeof response !== 'object' || response === null || Array.isArray(response)) {
    return Object.freeze(['the response is not an object']);
  }
  const r = response as Record<string, unknown>;
  const problems: string[] = [];
  const keys = Object.keys(r).sort();
  if (keys.join() !== [...RESPONSE_TEMPLATE_KEYS].sort().join()) {
    problems.push('the keys are not exactly the response schema');
  }
  if (typeof r['goldId'] !== 'string' || !R50_GOLD_ID_PATTERN.test(r['goldId'])) {
    problems.push('goldId is malformed');
  }
  if (r['rubricVersion'] !== rubric.rubricVersion || r['rubricSha256'] !== rubric.rubricSha256) {
    problems.push('the response is not bound to the exact rubric');
  }
  const actor = r['reviewerActorKey'];
  if (actor === null) problems.push('reviewerActorKey is unanswered');
  else if (typeof actor !== 'string' || !R50_ACTOR_KEY_PATTERN.test(actor)) {
    problems.push('reviewerActorKey is not an opaque actor key');
  }
  const note = r['reviewNote'];
  if (note !== null && typeof note !== 'string') problems.push('reviewNote is not text or null');

  const verdict = r['verdict'];
  const unitType = r['unit_type'];
  const hardNegative = r['hard_negative'];
  if (verdict === null) problems.push('verdict is unanswered');
  if (hardNegative === null) problems.push('hard_negative is unanswered');
  if (verdict !== null && !(RUBRIC_VERDICTS as readonly unknown[]).includes(verdict)) {
    problems.push('verdict is not a rubric value');
  }
  if (unitType !== null && !(RUBRIC_UNIT_TYPES as readonly unknown[]).includes(unitType)) {
    problems.push('unit_type is not a rubric value');
  }
  if (hardNegative !== null && typeof hardNegative !== 'boolean') {
    problems.push('hard_negative is not a boolean');
  }
  const row = RUBRIC_VALIDITY_MATRIX.find((candidate) => candidate.verdict === verdict);
  if (row !== undefined) {
    if (row.unitType === 'ONE_OF_FOUR_VALUES' && unitType === null) {
      problems.push(`${row.verdict} requires a unit_type`);
    }
    if (row.unitType === 'NULL_ONLY' && unitType !== null) {
      problems.push(`${row.verdict} requires unit_type null`);
    }
    if (row.hardNegative === 'FALSE_ONLY' && hardNegative === true) {
      problems.push(`${row.verdict} requires hard_negative false`);
    }
  }
  return Object.freeze(problems);
}

export function isCompletedResponseShape(
  response: unknown,
  rubric: { readonly rubricVersion: string; readonly rubricSha256: string },
): response is CompletedResponseShape {
  return completedResponseShapeProblems(response, rubric).length === 0;
}
