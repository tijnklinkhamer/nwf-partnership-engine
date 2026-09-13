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
import { pairByIdentity, type PairedItem } from './paired.js';
import { scoreVariant, type ScoredItem } from './score.js';
import { loadScoringSources, type LoadedSources } from './sources.js';
import { buildSummary, type F4Summary } from './summarise.js';

export interface ScoringRun {
  readonly sources: LoadedSources;
  readonly availability: GoldAvailability;
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
export function runScoring(repoRoot: string, outputRoot: string): ScoringRun {
  const sources = loadScoringSources(repoRoot, outputRoot);

  const unresolved = sources.freeze.unresolvedGold;
  if (unresolved.goldId !== F4_OPEN_OWNER_GOLD_ID) {
    throw new Error(
      `the freeze's open gold question is ${unresolved.goldId}; this scorer is pinned to ` +
        `${F4_OPEN_OWNER_GOLD_ID}.`,
    );
  }
  const availability = resolveGoldAvailability({
    freezePreservedVerdictGoldIds: [unresolved.goldId],
    labelFileRecordCount: sources.corpusRows.length + F4_HOLDOUT_ITEM_COUNT,
    devItemCount: sources.corpusRows.length,
  });
  const preserved = {
    verdictByGoldId: new Map<string, string>([[unresolved.goldId, unresolved.committedLabel]]),
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
  );
  return { sources, availability, rowsByVariant, allRows, paired, summary };
}
