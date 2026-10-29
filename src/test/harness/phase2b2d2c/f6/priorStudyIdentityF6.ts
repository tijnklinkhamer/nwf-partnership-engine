/**
 * PHASE 2B-2D2C-F6 — NO F5 IDENTITY MAY AUTHORISE, NAME OR FEED F6.
 *
 * F6 is a fresh study. Whatever authority F6's later execution build accepts
 * — a per-slot candidate, a study-level approval, an outer slot identity, a
 * child study binding — must be refused if it names ANY identity that belongs
 * to F5: F5's study id, an F5 slot id, F5's study or control root (or a path
 * under either), F5's study-level approval, or one of the five candidate
 * authorisations F5 consumed. It must also positively name F6's own study id.
 *
 * WHY A DEEP SCAN RATHER THAN A SCHEMA. F6's authority schemas do not exist
 * yet (they follow the owner freeze approval), and F5's documents come in
 * several shapes (F3 slot candidate, F4 study approval, F4 outer slot
 * identity, child binding). A scan over every string value refuses all of
 * them by what they NAME, without this module having to know their shapes —
 * and a future F6 schema gets this check for free.
 *
 * PURE. A parsed JSON value in, a list of problems out.
 */
import { F2_SLOTS } from '../f2/studyPlanCoreF2.js';
import {
  F5_CONSUMED_CANDIDATE_SHA256S,
  F5_CONTROL_ROOT,
  F5_STUDY_EXECUTION_APPROVAL_SHA256,
  F5_STUDY_ID,
  F5_STUDY_ROOT,
} from './f5ClosureF6.js';
import { F6_STUDY_ID } from './studyPlanCoreF6.js';

const F5_SLOT_IDS = new Set(F2_SLOTS.map((slot) => slot.slotId));
const F5_SPENT_HASHES = new Set([
  ...F5_CONSUMED_CANDIDATE_SHA256S,
  F5_STUDY_EXECUTION_APPROVAL_SHA256,
]);

function isF5RootPath(value: string): boolean {
  return [F5_STUDY_ROOT, F5_CONTROL_ROOT].some(
    (root) => value === root || value.startsWith(`${root}/`),
  );
}

function collectStrings(value: unknown, path: string, out: Array<[string, string]>): void {
  if (typeof value === 'string') {
    out.push([path, value]);
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${path}[${index}]`, out));
  } else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      collectStrings(item, path === '' ? key : `${path}.${key}`, out);
    }
  }
}

/**
 * Every reason `document` cannot be an F6 authority. Empty means only that
 * it names no F5 identity and does name F6 — it is NOT a grant of anything.
 */
export function priorStudyIdentityProblems(document: unknown): readonly string[] {
  const problems: string[] = [];
  const strings: Array<[string, string]> = [];
  collectStrings(document, '', strings);

  for (const [path, value] of strings) {
    if (value === F5_STUDY_ID) problems.push(`${path} names the F5 study id ${F5_STUDY_ID}`);
    if (F5_SLOT_IDS.has(value)) problems.push(`${path} names the F5 slot ${value}`);
    if (isF5RootPath(value)) problems.push(`${path} names a path under an F5 root: ${value}`);
    if (F5_SPENT_HASHES.has(value)) {
      problems.push(`${path} names a spent F5 authority hash ${value}`);
    }
  }

  const studyId =
    document !== null && typeof document === 'object' && !Array.isArray(document)
      ? (document as { studyId?: unknown }).studyId
      : undefined;
  if (studyId !== F6_STUDY_ID) {
    problems.push(`studyId is ${JSON.stringify(studyId)}; an F6 authority names ${F6_STUDY_ID}`);
  }
  return problems;
}
