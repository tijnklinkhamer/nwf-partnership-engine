/**
 * PHASE 2B-2D2C-F4 — WHICH GOLD FIELDS ARE REACHABLE FROM A
 * DEVELOPMENT-ONLY SOURCE.
 *
 * THE HOLDOUT BOUNDARY BINDS HERE, exactly as it does in `corpus.ts`. The
 * gold LABELS for the Sonnet acceptance corpus live in ONE file,
 * `orgunit-classifier-sonnet-acceptance-adjudication-v1.jsonl`. That file
 * holds 72 records — the whole acceptance corpus, 49 DEVELOPMENT plus 23
 * HOLDOUT — and `AdjudicationItemSchema` carries NO `split` field, so it
 * cannot be filtered to one split without first reading rows that may be
 * HOLDOUT. The F0B freeze consequently lists it under
 * `corpus.holdoutFilesNeverRead`, and the F4 task forbids opening an
 * adjudication corpus or a mixed DEVELOPMENT/HOLDOUT file at all.
 *
 * So availability is DERIVED here, from the schemas themselves, rather than
 * asserted in prose: the set of gold-backed fields is read off
 * `ProposedLabelSchema.shape`, and each is looked for in the only
 * DEVELOPMENT-only sources this task may read — the canonical corpus row
 * (including its document and strata), and the freeze's own
 * `unresolvedGold` block. A field found in neither is UNAVAILABLE, and
 * `requireAvailable` throws rather than let a caller score it.
 *
 * PURE. No network, no database, no filesystem, no clock, no randomness.
 */
import {
  GoldCorpusItemSchema,
  GoldDocumentSchema,
  GoldStrataSchema,
  ProposedLabelSchema,
} from '../../../../orgunits/classify/evaluation/goldSchema.js';

/** Every gold-backed label field the real gold schema exposes. */
export const GOLD_BACKED_FIELDS: readonly string[] = Object.freeze(
  Object.keys(ProposedLabelSchema.shape).sort(),
);

/** Every field name a DEVELOPMENT-only canonical corpus row can supply. */
export const DEV_CORPUS_FIELD_NAMES: readonly string[] = Object.freeze(
  [
    ...Object.keys(GoldCorpusItemSchema.shape),
    ...Object.keys(GoldDocumentSchema.shape),
    ...Object.keys(GoldStrataSchema.shape),
  ].sort(),
);

export type GoldSourceKind =
  /** The committed DEVELOPMENT-only canonical corpus and its manifest. */
  | 'DEV_CANONICAL_CORPUS'
  /** The F0B freeze's `unresolvedGold` block: one gold id, one verdict. */
  | 'F0B_FREEZE_UNRESOLVED_GOLD'
  /** No permitted source carries it. */
  | 'NONE';

export interface GoldFieldAvailability {
  readonly field: string;
  readonly available: boolean;
  readonly source: GoldSourceKind;
  /** The gold ids this field is available for; empty when unavailable. */
  readonly availableForGoldIds: readonly string[];
  readonly reason: string;
}

export interface GoldAvailability {
  readonly fields: readonly GoldFieldAvailability[];
  /** True iff at least one field is scorable across the whole 49-item corpus. */
  readonly anyCorpusWideFieldAvailable: boolean;
  /** The single mixed file that holds the labels, named but never opened. */
  readonly labelFileNotOpened: string;
  readonly labelFileRecordCount: number;
  readonly devItemCount: number;
  readonly holdoutItemCount: number;
}

const LABEL_FILE =
  'src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-adjudication-v1.jsonl';

/**
 * Resolves availability for every gold-backed field.
 *
 * `freezePreservedGoldIds` are the gold ids for which the freeze itself
 * records a committed verdict (today: exactly the one open owner question).
 * They make `verdict` available for those ids ALONE — never corpus-wide,
 * because one preserved label is not a gold set.
 */
export function resolveGoldAvailability(input: {
  readonly freezePreservedVerdictGoldIds: readonly string[];
  readonly labelFileRecordCount: number;
  readonly devItemCount: number;
}): GoldAvailability {
  const corpusFields = new Set(DEV_CORPUS_FIELD_NAMES);
  const preserved = [...input.freezePreservedVerdictGoldIds].sort();
  const fields = GOLD_BACKED_FIELDS.map((field): GoldFieldAvailability => {
    if (corpusFields.has(field)) {
      return {
        field,
        available: true,
        source: 'DEV_CANONICAL_CORPUS',
        availableForGoldIds: [],
        reason: 'the DEVELOPMENT-only canonical corpus row carries this field directly.',
      };
    }
    if (field === 'verdict' && preserved.length > 0) {
      return {
        field,
        available: true,
        source: 'F0B_FREEZE_UNRESOLVED_GOLD',
        availableForGoldIds: preserved,
        reason:
          `the F0B freeze preserves a committed verdict for ${preserved.length} gold id(s) ` +
          'only; every other item has no verdict in any DEVELOPMENT-only source.',
      };
    }
    return {
      field,
      available: false,
      source: 'NONE',
      availableForGoldIds: [],
      reason:
        `no DEVELOPMENT-only source carries ${field}: the canonical corpus is document ` +
        `evidence with no label fields, and the only label file (${LABEL_FILE}) holds ` +
        `${input.labelFileRecordCount} mixed DEVELOPMENT+HOLDOUT records with no split ` +
        'field, so it is listed never-read by the freeze and is not opened.',
    };
  });
  return {
    fields,
    anyCorpusWideFieldAvailable: fields.some(
      (f) => f.available && f.source === 'DEV_CANONICAL_CORPUS',
    ),
    labelFileNotOpened: LABEL_FILE,
    labelFileRecordCount: input.labelFileRecordCount,
    devItemCount: input.devItemCount,
    holdoutItemCount: input.labelFileRecordCount - input.devItemCount,
  };
}

export class GoldUnavailableError extends Error {
  override readonly name = 'GoldUnavailableError';
  constructor(
    readonly field: string,
    reason: string,
  ) {
    super(`refusing to score ${field}: ${reason}`);
  }
}

/**
 * Fails closed. A caller that asks to score a field for an item the gold
 * does not cover gets an exception, never a silently-skipped denominator.
 */
export function requireAvailable(
  availability: GoldAvailability,
  field: string,
  goldId: string,
): GoldFieldAvailability {
  const entry = availability.fields.find((f) => f.field === field);
  if (entry === undefined) {
    throw new GoldUnavailableError(field, 'it is not a gold-backed field of the real gold schema.');
  }
  if (!entry.available) throw new GoldUnavailableError(field, entry.reason);
  if (
    entry.source === 'F0B_FREEZE_UNRESOLVED_GOLD' &&
    !entry.availableForGoldIds.includes(goldId)
  ) {
    throw new GoldUnavailableError(
      field,
      `it is available only for ${entry.availableForGoldIds.join(', ')}, not ${goldId}.`,
    );
  }
  return entry;
}
