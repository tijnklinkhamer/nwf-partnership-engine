/**
 * PHASE 2B-2D — A4 R51: THE FUTURE COMPLETED-RESPONSE FILE VALIDATOR.
 *
 * Validates a FUTURE human-produced
 * `PHASE_2B_2D_A4_DEV_TRAIN_SINGLE_REVIEW_RESPONSES_V1.jsonl` against the
 * exact bound package and rubric: exactly one row per package goldId, in
 * package order, exactly the response keys, each row legal under the
 * unchanged R50 / R49 shape contract, and an opaque actor key on every row.
 *
 * It judges SHAPE ONLY. It never decides whether a human's semantic choice is
 * right, never reads page content, and never repairs: an illegal file is
 * refused with every problem listed, never rewritten.
 *
 * R51 itself produces no such file.
 *
 * PURE. No socket, no database, no filesystem.
 */
import { completedResponseShapeProblems } from '../a4handoffR4/responseSchema.js';
import { requireR51PackageBinding, type R51PackageBinding } from './authority.js';
import { refuseR51 } from './refusal.js';
import { REVIEW_NOTE_MAX_CHARS } from './session.js';
import { COMPLETED_RESPONSE_KEYS, R51_ACTOR_KEY_PATTERN } from './types.js';

export interface CompletedResponseRow {
  readonly goldId: string;
  readonly rubricVersion: string;
  readonly rubricSha256: string;
  readonly reviewerActorKey: string;
  readonly verdict: 'UNIT_PAGE' | 'NOT_A_UNIT' | 'NEEDS_REVIEW';
  readonly unit_type: string | null;
  readonly hard_negative: boolean;
  readonly reviewNote: string | null;
}

/** What a completed-response file must cover: goldIds in order, one rubric. */
export interface CompletedResponseExpectation {
  readonly goldIds: readonly string[];
  readonly rubricVersion: string;
  readonly rubricSha256: string;
}

/**
 * Every shape problem of a completed-response file against an expectation.
 * Empty means legal SHAPE. Pure over its inputs, so synthetic tests can use
 * invented goldIds; the genuine path is `requireCompletedResponseFile`, which
 * accepts only a minted R51 binding.
 */
export function completedResponseFileProblems(
  text: string,
  binding: CompletedResponseExpectation,
): readonly string[] {
  const rubric = { rubricVersion: binding.rubricVersion, rubricSha256: binding.rubricSha256 };
  const problems: string[] = [];
  if (typeof text !== 'string' || text.length === 0) return Object.freeze(['the file is empty']);
  if (!text.endsWith('\n')) problems.push('the file does not end with a newline');
  if (text.includes('\r')) problems.push('the file is not LF-only');
  const lines = (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n');
  const expected = binding.goldIds;
  const known = new Set(expected);
  const seen = new Set<string>();
  const ids: string[] = [];
  lines.forEach((line, i) => {
    const where = `row ${i + 1}`;
    let row: unknown;
    try {
      row = JSON.parse(line) as unknown;
    } catch {
      problems.push(`${where} is not JSON`);
      return;
    }
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      problems.push(`${where} is not an object`);
      return;
    }
    const r = row as Record<string, unknown>;
    if (JSON.stringify(Object.keys(r)) !== JSON.stringify(COMPLETED_RESPONSE_KEYS)) {
      problems.push(`${where} does not carry exactly the response keys in order`);
    }
    for (const problem of completedResponseShapeProblems(row, rubric)) {
      problems.push(`${where}: ${problem}`);
    }
    if (
      typeof r['reviewerActorKey'] === 'string' &&
      !R51_ACTOR_KEY_PATTERN.test(r['reviewerActorKey'])
    ) {
      problems.push(`${where}: reviewerActorKey is not an opaque actor key`);
    }
    const note = r['reviewNote'];
    if (
      typeof note === 'string' &&
      (note.trim().length === 0 || note.length > REVIEW_NOTE_MAX_CHARS)
    ) {
      problems.push(
        `${where}: reviewNote is empty or longer than ${REVIEW_NOTE_MAX_CHARS} characters`,
      );
    }
    const goldId = r['goldId'];
    if (typeof goldId === 'string') {
      if (!known.has(goldId)) problems.push(`${where}: goldId is not in the bound package`);
      if (seen.has(goldId)) problems.push(`${where}: goldId is a duplicate row`);
      seen.add(goldId);
      ids.push(goldId);
    }
  });
  if (lines.length !== expected.length) {
    problems.push(`the file holds ${lines.length} rows, not ${expected.length}`);
  }
  const missing = expected.filter((goldId) => !seen.has(goldId)).length;
  if (missing > 0) problems.push(`${missing} package goldIds have no row`);
  if (
    JSON.stringify(ids) !== JSON.stringify(expected) &&
    missing === 0 &&
    ids.length === expected.length
  ) {
    problems.push('rows are not in package goldId ASC order');
  }
  return Object.freeze(problems);
}

/** Refuses - never repairs - an illegal completed-response file. */
export function requireCompletedResponseFile(
  text: string,
  bindingInput: R51PackageBinding,
): readonly CompletedResponseRow[] {
  const binding = requireR51PackageBinding(bindingInput);
  const problems = completedResponseFileProblems(text, binding);
  if (problems.length > 0) {
    refuseR51(
      'R51_RESPONSE_FILE_INVALID',
      `${problems.length} problem(s): ${problems.slice(0, 20).join('; ')}`,
    );
  }
  return Object.freeze(
    text
      .slice(0, -1)
      .split('\n')
      .map((line) => Object.freeze(JSON.parse(line) as CompletedResponseRow)),
  );
}
