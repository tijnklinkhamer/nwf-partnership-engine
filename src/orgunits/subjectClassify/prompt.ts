/**
 * R3P3-A (ADR 0031) - THE SUBJECT-ROOTED CLASSIFIER PROMPT: the frozen
 * production prompt (`classify/prompt.ts`, unchanged) with EXACTLY TWO
 * substitutions, both about the batch context and nothing else.
 *
 * WHY A DERIVED PROMPT. The production prompt tells the model that every
 * call supplies "the organisation's provisional legal name and ECHE row key,
 * its ECHE-published country code". A subject-rooted batch
 * (the REL harvest H2 subject handoff assembly) has none of those - a discovery
 * subject has no ECHE row and no country is ever inferred for it - so sending
 * the production text would describe a payload the model is not given. The
 * taxonomy, the two questions, every UNIT_PAGE/NOT_A_UNIT/NEEDS_REVIEW rule,
 * the evidence-citation contract and the injunctions stay byte-identical,
 * which `subjectPromptDerivation` proves on every call: substituting back
 * yields the production prompt exactly, and the production prompt must hash
 * to the pinned digest.
 *
 * VERSIONED SEPARATELY. The persisted call identity names
 * `ORGUNIT_SUBJECT_CLASSIFIER_PROMPT_VERSION`, never the production version:
 * a subject classification is never presented as having run under the
 * production prompt's exact bytes. A change to the production prompt makes
 * this derivation refuse (base digest mismatch) until it is reviewed again.
 *
 * PURE. No network, no database, no filesystem, no clock, no environment.
 */
import { createHash } from 'node:crypto';

import { ORGUNIT_CLASSIFIER_SYSTEM_PROMPT } from '../classify/prompt.js';

/** Versions THIS DERIVATION. Bump on any change to the substitutions or the base pin. */
export const ORGUNIT_SUBJECT_CLASSIFIER_PROMPT_VERSION = 'orgunit-subject-classifier-prompt-v1';

/** SHA-256 of the production prompt bytes this derivation was reviewed against. */
export const SUBJECT_PROMPT_BASE_SHA256 =
  '567b93ba1c122c9599aaef8b652bdccd5a249db3fb582b782a3dc86b12cec59e';

/** The two substitutions, in order: [production text, subject text]. */
export const SUBJECT_PROMPT_SUBSTITUTIONS: readonly (readonly [string, string])[] = Object.freeze([
  [
    "batch-level context (the organisation's provisional legal name and ECHE row key, its ECHE-published country code, the run's root URLs and their authority kind, and provenance identifiers)",
    "batch-level context (the handoff contract; the run's single root URL — the organisation's own stated website, researched under an owner admission — with its authority kind `subject_admission`; and provenance identifiers for the discovery subject, the admission and the run. No legal name, no ECHE row key and no country code is supplied)",
  ],
  [
    'The country code is background metadata only. Do not use it to select a language, apply a country-specific rule, or assume an institutional hierarchy the evidence does not state.',
    'No country is supplied. Do not infer one, select a language from one, apply a country-specific rule, or assume an institutional hierarchy or affiliation the evidence does not state.',
  ],
] as const);

export class SubjectPromptDerivationError extends Error {
  constructor(detail: string) {
    super(`subject classifier prompt derivation refused: ${detail}`);
    this.name = 'SubjectPromptDerivationError';
  }
}

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

const occurrences = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

/**
 * Derives the subject prompt from the given base, or throws. Each production
 * text must occur exactly once in the base and each subject text nowhere in
 * it; the reverse substitution must reproduce the base byte for byte.
 */
export function deriveSubjectPrompt(base: string, expectedBaseSha256: string): string {
  if (sha256(base) !== expectedBaseSha256) {
    throw new SubjectPromptDerivationError('the production prompt no longer matches the pin');
  }
  let derived = base;
  for (const [from, to] of SUBJECT_PROMPT_SUBSTITUTIONS) {
    if (occurrences(base, from) !== 1 || occurrences(base, to) !== 0) {
      throw new SubjectPromptDerivationError('a substitution does not apply exactly once');
    }
    derived = derived.replace(from, () => to);
  }
  let reversed = derived;
  for (const [from, to] of SUBJECT_PROMPT_SUBSTITUTIONS)
    reversed = reversed.replace(to, () => from);
  if (reversed !== base) {
    throw new SubjectPromptDerivationError('the derivation is not reversible');
  }
  return derived;
}

/** The subject prompt TEXT, derived from the frozen production prompt (throws on drift). */
export function subjectClassifierSystemPrompt(): string {
  return deriveSubjectPrompt(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT, SUBJECT_PROMPT_BASE_SHA256);
}
