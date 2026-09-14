/**
 * PHASE 2B-2D2C-F4 — THE WHOLE READ-ONLY SCORING PASS, IN ONE FUNCTION.
 *
 * Loads and verifies the sources, resolves which gold fields a
 * DEVELOPMENT-only source can actually supply, scores both variants, joins
 * them by frozen item identity and summarises. It performs no inference, no
 * authentication, no database access and no network access of any kind, and
 * it writes nothing — emission is a separate, explicit call.
 */
import type { FrozenVariantName } from '../constants.js';
import { FROZEN_VARIANTS } from '../constants.js';
import { F4_HOLDOUT_ITEM_COUNT, F4_OPEN_OWNER_GOLD_ID } from './constants.js';
import { resolveGoldAvailability, type GoldAvailability } from './gold.js';
import { loadGoldSupplement, type LoadedGoldSupplement } from './supplement.js';
import { pairByIdentity, type PairedItem } from './paired.js';
import { scoreVariant, type ScoredItem } from './score.js';
import { loadScoringSources, type LoadedSources } from './sources.js';
import { buildSummary, type F4Summary } from './summarise.js';

export interface ScoringRun {
  readonly sources: LoadedSources;
  readonly availability: GoldAvailability;
  /** F4A: the scoring-only gold supplement, when one was supplied. */
  readonly supplement: LoadedGoldSupplement | null;
  readonly rowsByVariant: ReadonlyMap<FrozenVariantName, readonly ScoredItem[]>;
  readonly allRows: readonly ScoredItem[];
  readonly paired: readonly PairedItem[];
  readonly summary: F4Summary;
}

/**
 * The mixed label file is never opened — not even to count its lines. Its
 * record count is the verified DEVELOPMENT corpus size plus the HOLDOUT size
 * the 2D2B remote-truth audit recorded, so the scorer can state the file's
 * shape while touching nothing the freeze lists as never-read.
 */
/**
 * `goldSupplementPath` is OPT-IN and repository-relative. Omitted, this
 * scores exactly as F4 did: no gold, no semantic denominator, and
 * `INSUFFICIENT_VALID_DEV_EVIDENCE`. Supplied, every check in
 * `loadGoldSupplement` must pass before a single label is used.
 */
export function runScoring(
  repoRoot: string,
  outputRoot: string,
  goldSupplementPath?: string,
): ScoringRun {
  const sources = loadScoringSources(repoRoot, outputRoot);

  const unresolved = sources.freeze.unresolvedGold;
  if (unresolved.goldId !== F4_OPEN_OWNER_GOLD_ID) {
    throw new Error(
      `the freeze's open gold question is ${unresolved.goldId}; this scorer is pinned to ` +
        `${F4_OPEN_OWNER_GOLD_ID}.`,
    );
  }
  const corpusGoldIds = sources.corpusRows.map((row) => row.goldId);
  const supplement =
    goldSupplementPath === undefined
      ? null
      : loadGoldSupplement(repoRoot, goldSupplementPath, {
          freezeRawSha256: sources.freezeRawSha256,
          artifactInventorySha256: sources.artifactInventorySha256,
          goldIds: corpusGoldIds,
        });

  // F0B's preserved label and the supplement must AGREE about the open owner
  // question. They are independent records of the same item, so a
  // disagreement means one of them is describing a different corpus — and
  // silently preferring either would be an adjudication this task may not make.
  if (supplement !== null) {
    const projected = supplement.labelByGoldId.get(unresolved.goldId)?.verdict;
    if (projected !== unresolved.committedLabel) {
      throw new Error(
        `the scoring supplement labels ${unresolved.goldId} ${String(projected)}, but F0B ` +
          `preserves ${unresolved.committedLabel}. This task does not adjudicate that.`,
      );
    }
  }

  const availability = resolveGoldAvailability({
    freezePreservedVerdictGoldIds: [unresolved.goldId],
    labelFileRecordCount: sources.corpusRows.length + F4_HOLDOUT_ITEM_COUNT,
    devItemCount: sources.corpusRows.length,
    ...(supplement === null
      ? {}
      : {
          supplement: {
            path: supplement.supplementPath,
            fixturePath: supplement.fixturePath,
            itemCount: supplement.labelCount,
          },
        }),
  });
  const preserved = {
    verdictByGoldId: new Map<string, string>([[unresolved.goldId, unresolved.committedLabel]]),
    ...(supplement === null ? {} : { labelByGoldId: supplement.labelByGoldId }),
  };

  const rowsByVariant = new Map<FrozenVariantName, readonly ScoredItem[]>();
  for (const variant of FROZEN_VARIANTS) {
    rowsByVariant.set(variant.name, scoreVariant(sources, variant.name, availability, preserved));
  }
  const v1 = rowsByVariant.get('PROMPT_V1_CANONICAL') ?? [];
  const v2 = rowsByVariant.get('PROMPT_V2_CANONICAL') ?? [];
  const paired = pairByIdentity(v1, v2);
  const allRows = [...v1, ...v2];
  const summary = buildSummary(
    sources,
    rowsByVariant,
    paired,
    availability,
    unresolved.committedLabel,
    supplement,
  );
  return { sources, availability, supplement, rowsByVariant, allRows, paired, summary };
}
