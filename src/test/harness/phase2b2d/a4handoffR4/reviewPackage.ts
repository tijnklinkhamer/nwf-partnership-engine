/**
 * PHASE 2B-2D — A3 R50: THE BLINDED REVIEW PACKAGE, THE BLANK RESPONSE
 * TEMPLATE AND THE PRE-LABEL PACKAGE HASH.
 *
 * THE PACKAGE IS BLIND TO SAMPLING AND TO MODELS
 *
 *   A record carries exactly: goldId, the exact rubric binding, the one
 *   equality-justified main text and every captured source presentation.
 *   The blinding firewall inspects STRUCTURED METADATA - every key at every
 *   level, and the string values R50 itself creates - never arbitrary page
 *   text: a real page may legitimately say "score" or "generation".
 *
 * THE TEMPLATE IS UNANSWERED
 *
 *   One row per package goldId, same order, same rubric binding, and all five
 *   human-response values null. A null is UNANSWERED - it is not a label, and
 *   a template row is not a valid completed response.
 *
 * THE HASH
 *
 *   R50_PRE_LABEL_REVIEW_PACKAGE_HASH = sha256OfCanonical({ packageSchema,
 *   rubricVersion, rubricSha256, recordCount, records }), the repository's
 *   existing canonical hashing primitive over the ordered records - never the
 *   pretty-printed file bytes. It is NOT an A5 splitContentHash, a gold
 *   manifest hash or a corpus-freeze hash.
 *
 * PURE.
 */
import { sha256OfCanonical } from '../../../../orgunits/classify/evaluation/hashes.js';
import { refuseR50 } from './refusal.js';
import type { R49RubricBinding } from './rubric.js';
import {
  REVIEW_HEADING_KEYS,
  REVIEW_PRESENTATION_KEYS,
  REVIEW_RECORD_KEYS,
  RESPONSE_HUMAN_FIELDS,
  RESPONSE_TEMPLATE_KEYS,
  R50_GOLD_ID_PATTERN,
  R50_PACKAGE_SCHEMA,
  type HandoffIndexItem,
  type ResponseTemplateRecord,
  type ReviewPackageRecord,
  type ReviewSourcePresentation,
} from './types.js';

/**
 * Key fragments no reviewer-visible structured key may carry (case-insensitive).
 * `goldId` is the one permitted key containing "gold".
 */
export const FORBIDDEN_REVIEW_KEY_FRAGMENTS = Object.freeze([
  'setp',
  'setr',
  'inset',
  'sample',
  'rank',
  'score',
  'candidate',
  'signal',
  'track',
  'gate',
  'threshold',
  'survivor',
  'exclusion',
  'nearduplicate',
  'selectionindex',
  'stratum',
  'reserve',
  'generation',
  'a2',
  'disposition',
  'documentsha256',
  'echerowkey',
  'organisationid',
  'pageevidenceid',
  'historical',
  'gold',
  'prediction',
  'model',
  'classifier',
  'verdict',
  'unit_type',
  'hard_negative',
  'label',
] as const);

/** Fragments too short to match inside another word: whole camelCase / snake words only. */
const WORD_ONLY_FRAGMENTS: ReadonlySet<string> = new Set(['a2']);

/** Fragments no string value CREATED BY R50 may carry. Page content is exempt. */
export const FORBIDDEN_R50_METADATA_VALUE_FRAGMENTS = Object.freeze([
  'set_p',
  'set_r',
  'sample',
  'rank',
  'score',
  'candidate',
  'signal',
  'survivor',
  'exclusion',
  'reserve',
  'generation',
  'disposition',
  'prediction',
  'model',
  'classifier',
] as const);

export function reviewRecordFor(
  goldId: string,
  rubric: R49RubricBinding,
  mainText: string,
  sourcePresentations: readonly ReviewSourcePresentation[],
): ReviewPackageRecord {
  return Object.freeze({
    goldId,
    rubricVersion: rubric.rubricVersion,
    rubricSha256: rubric.rubricSha256,
    mainText,
    sourcePresentations,
  });
}

export function templateRecordFor(
  goldId: string,
  rubric: R49RubricBinding,
): ResponseTemplateRecord {
  return Object.freeze({
    goldId,
    rubricVersion: rubric.rubricVersion,
    rubricSha256: rubric.rubricSha256,
    reviewerActorKey: null,
    verdict: null,
    unit_type: null,
    hard_negative: null,
    reviewNote: null,
  });
}

/** Every key of a value, recursively, with its path. */
export function structuredKeysOf(value: unknown, path = '$'): { path: string; key: string }[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => structuredKeysOf(entry, `${path}[${String(index)}]`));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => [
      { path, key },
      ...structuredKeysOf(child, `${path}.${key}`),
    ]);
  }
  return [];
}

/** The forbidden key fragments a structured key carries, if any. */
export function forbiddenFragmentsOfKey(key: string): readonly string[] {
  const lower = key.toLowerCase();
  const words = key
    .split(/(?=[A-Z])|[^A-Za-z0-9]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.toLowerCase());
  return FORBIDDEN_REVIEW_KEY_FRAGMENTS.filter((fragment) => {
    if (fragment === 'gold' && key === 'goldId') return false;
    // A short token is matched as a whole word ("a2", "A2Status", "a2_x"),
    // never inside another word ("sha256").
    if (WORD_ONLY_FRAGMENTS.has(fragment)) return words.includes(fragment);
    return lower.includes(fragment);
  });
}

const sameKeys = (value: object, keys: readonly string[]): boolean =>
  Object.keys(value).join('\u0000') === keys.join('\u0000');

/**
 * The blinding firewall over ONE reviewer-visible record, plus the internal
 * facts it must not reveal. Throws on the first violation, naming a position
 * only.
 */
export function requireBlindReviewRecord(
  record: ReviewPackageRecord,
  rubric: R49RubricBinding,
  internal: HandoffIndexItem,
  position: number,
): void {
  const fail = (message: string): never =>
    refuseR50('R50_REVIEW_PACKAGE_NOT_BLIND', `record ${String(position)}: ${message}`);
  if (typeof record !== 'object' || record === null || !sameKeys(record, REVIEW_RECORD_KEYS)) {
    fail('the record keys are not exactly the reviewer-visible schema');
  }
  if (!R50_GOLD_ID_PATTERN.test(record.goldId) || record.goldId !== internal.goldId) {
    fail('the goldId is malformed or not the internal item');
  }
  if (
    record.rubricVersion !== rubric.rubricVersion ||
    record.rubricSha256 !== rubric.rubricSha256
  ) {
    fail('the record is not bound to the exact R49 rubric');
  }
  if (typeof record.mainText !== 'string') fail('the main text is not text');
  if (
    !Array.isArray(record.sourcePresentations) ||
    record.sourcePresentations.length !== internal.sourcePageEvidenceIds.length
  ) {
    fail('the record does not carry one presentation per source row');
  }
  record.sourcePresentations.forEach((presentation, index) => {
    if (!sameKeys(presentation, REVIEW_PRESENTATION_KEYS)) {
      fail(`presentation ${String(index)} keys are not exactly the presentation schema`);
    }
    presentation.headings.forEach((heading, h) => {
      if (!sameKeys(heading, REVIEW_HEADING_KEYS)) {
        fail(`presentation ${String(index)} heading ${String(h)} is not { level, text }`);
      }
    });
  });
  for (const { path, key } of structuredKeysOf(record)) {
    if (forbiddenFragmentsOfKey(key).length !== 0) fail(`a key at ${path} reveals metadata`);
  }
  for (const value of [record.rubricVersion]) {
    const lower = value.toLowerCase();
    if (FORBIDDEN_R50_METADATA_VALUE_FRAGMENTS.some((fragment) => lower.includes(fragment))) {
      fail('an R50-created metadata value reveals sampling or model mechanics');
    }
  }
  const serialised = JSON.stringify(record);
  for (const secret of [
    internal.documentSha256,
    internal.echeRowKey,
    ...internal.sourcePageEvidenceIds,
  ]) {
    if (serialised.includes(secret)) fail('the record carries an internal identity value');
  }
}

export function requireBlankTemplateRecord(
  template: ResponseTemplateRecord,
  record: ReviewPackageRecord,
  position: number,
): void {
  const fail = (message: string): never =>
    refuseR50('R50_RESPONSE_TEMPLATE_INVALID', `template ${String(position)}: ${message}`);
  if (
    typeof template !== 'object' ||
    template === null ||
    !sameKeys(template, RESPONSE_TEMPLATE_KEYS)
  ) {
    fail('the keys are not exactly the response template schema');
  }
  if (
    template.goldId !== record.goldId ||
    template.rubricVersion !== record.rubricVersion ||
    template.rubricSha256 !== record.rubricSha256
  ) {
    fail('the row is not bound to its package record and rubric');
  }
  for (const field of RESPONSE_HUMAN_FIELDS) {
    if (template[field] !== null) fail(`${field} is pre-filled`);
  }
}

/** The canonical input of the pre-label package hash. */
export function packageHashInputOf(
  rubric: { readonly rubricVersion: string; readonly rubricSha256: string },
  records: readonly ReviewPackageRecord[],
): unknown {
  return {
    packageSchema: R50_PACKAGE_SCHEMA,
    rubricVersion: rubric.rubricVersion,
    rubricSha256: rubric.rubricSha256,
    recordCount: records.length,
    records,
  };
}

/** R50_PRE_LABEL_REVIEW_PACKAGE_HASH. */
export function preLabelPackageHash(
  rubric: { readonly rubricVersion: string; readonly rubricSha256: string },
  records: readonly ReviewPackageRecord[],
): string {
  return sha256OfCanonical(packageHashInputOf(rubric, records));
}

/** One JSON object per line, in the given order, newline-terminated. */
export function toJsonl(records: readonly object[]): string {
  return records.map((record) => JSON.stringify(record)).join('\n') + '\n';
}

/** Parses JSONL written by `toJsonl`. */
export function fromJsonl(text: string): unknown[] {
  if (!text.endsWith('\n')) {
    refuseR50('R50_HANDOFF_INPUT_INVALID', 'a JSONL artifact is not newline-terminated');
  }
  return text
    .slice(0, -1)
    .split('\n')
    .map((line) => JSON.parse(line) as unknown);
}
