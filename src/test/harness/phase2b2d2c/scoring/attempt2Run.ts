/**
 * PHASE 2B-2D2C-F0D — THE WHOLE READ-ONLY ATTEMPT-2 SCORING PASS, IN ONE
 * FUNCTION.
 *
 * Loads and verifies the attempt-2 root against the APPROVED F0C freeze,
 * loads the preserved attempt-1 root READ-ONLY through the F4 loader and
 * pins it to the comparator identity the F0C freeze names, loads the
 * scoring-only gold supplement and the owner adjudication record and pins
 * BOTH to the F0C freeze's `scoringInputs` hashes, scores the twelve V3
 * evaluations post-repair, re-scores V1 and V2 from the preserved
 * artifacts (never rerun), pairs V3 against each by gold id, and
 * summarises. It performs no inference, no authentication, no database
 * access and no network access of any kind, and it writes nothing —
 * emission is a separate, explicit call.
 *
 * It is callable ONLY when an attempt-2 root exists. At F0D none does, and
 * this module fabricates none: every test of it builds a clearly synthetic
 * scratch root in a temporary directory and deletes it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { F4_HOLDOUT_ITEM_COUNT, F4_OPEN_OWNER_GOLD_ID } from './constants.js';
import { loadOwnerAdjudication, type LoadedOwnerAdjudication } from './adjudication.js';
import { loadAttempt2ScoringSources, type LoadedAttempt2Sources } from './attempt2Sources.js';
import { buildAttempt2Summary, type Attempt2Summary } from './attempt2Summarise.js';
import { resolveGoldAvailability, type GoldAvailability } from './gold.js';
import { pairByIdentity, type PairedItem } from './paired.js';
import { scoreVariant, type ScoredItem } from './score.js';
import { loadScoringSources, ScoringSourceError, type LoadedSources } from './sources.js';
import { loadGoldSupplement, type LoadedGoldSupplement } from './supplement.js';
import { sha256Hex } from '../freeze.js';

export interface Attempt2ScoringRun {
  readonly attempt2: LoadedAttempt2Sources;
  readonly comparator: LoadedSources;
  readonly availability: GoldAvailability;
  readonly supplement: LoadedGoldSupplement | null;
  readonly ownerAdjudication: LoadedOwnerAdjudication | null;
  readonly v3Rows: readonly ScoredItem[];
  readonly v1Rows: readonly ScoredItem[];
  readonly v2Rows: readonly ScoredItem[];
  readonly pairedV1ToV3: readonly PairedItem[];
  readonly pairedV2ToV3: readonly PairedItem[];
  /** V3 rows plus the two comparator row sets, for the scored-items file. */
  readonly allRows: readonly ScoredItem[];
  readonly summary: Attempt2Summary;
}

function fail(message: string): never {
  throw new ScoringSourceError(message);
}

/**
 * The comparator root is loaded READ-ONLY through the attempt-1 loader and
 * must be exactly the evidence the F0C freeze names as the comparator.
 */
export function loadPinnedAttempt1Comparator(
  repoRoot: string,
  attempt2: LoadedAttempt2Sources,
  attempt1Root: string,
): LoadedSources {
  const comparator = loadScoringSources(repoRoot, attempt1Root);
  const pinned = attempt2.freeze.scoring.comparatorPolicy.attempt1;
  if (comparator.artifactInventorySha256 !== pinned.artifactInventorySha256) {
    fail(
      `the attempt-1 root's inventory ${comparator.artifactInventorySha256} is not the comparator the F0C freeze pins (${pinned.artifactInventorySha256}).`,
    );
  }
  if (comparator.freezeRawSha256 !== pinned.freezeRawSha256) {
    fail(
      'the attempt-1 root was scored under a freeze other than the pinned F0B comparator freeze.',
    );
  }
  if (comparator.artifactsVerified !== pinned.artifactCount) {
    fail(
      `the attempt-1 root verified ${comparator.artifactsVerified} artifacts; ${pinned.artifactCount} are pinned.`,
    );
  }
  if (comparator.planSha256 !== pinned.planSha256) {
    fail('the attempt-1 root was planned under a plan other than the pinned comparator plan.');
  }
  return comparator;
}

/** The F0C freeze pins the exact scoring inputs by hash; a repository whose files drifted is refused. */
function verifyPinnedScoringInput(
  repoRoot: string,
  relativePath: string,
  pinned: { readonly path: string; readonly rawSha256: string },
  what: string,
): void {
  if (relativePath !== pinned.path) {
    fail(`the ${what} path ${relativePath} is not the one the F0C freeze pins (${pinned.path}).`);
  }
  const actual = sha256Hex(readFileSync(join(repoRoot, relativePath)));
  if (actual !== pinned.rawSha256) {
    fail(
      `the ${what} ${relativePath} hashes to ${actual}; the F0C freeze pins ${pinned.rawSha256}.`,
    );
  }
}

/**
 * `goldSupplementPath` and `ownerAdjudicationPath` are OPT-IN and
 * repository-relative, exactly as for attempt 1 — and here each is ALSO
 * pinned by hash to the F0C freeze's `scoringInputs`. Omitted, the pass
 * scores with no gold and reports INSUFFICIENT_VALID_DEV_EVIDENCE.
 */
export function runAttempt2Scoring(
  repoRoot: string,
  attempt2Root: string,
  attempt1Root: string,
  goldSupplementPath?: string,
  ownerAdjudicationPath?: string,
): Attempt2ScoringRun {
  const attempt2 = loadAttempt2ScoringSources(repoRoot, attempt2Root);
  const comparator = loadPinnedAttempt1Comparator(repoRoot, attempt2, attempt1Root);

  const unresolved = attempt2.freeze.unresolvedGold;
  if (unresolved.goldId !== F4_OPEN_OWNER_GOLD_ID) {
    fail(
      `the F0C freeze's open gold question is ${unresolved.goldId}; this scorer is pinned to ${F4_OPEN_OWNER_GOLD_ID}.`,
    );
  }
  const corpusGoldIds = attempt2.corpusRows.map((row) => row.goldId);
  const scoringInputs = attempt2.freeze.scoring.scoringInputs;

  let supplement: LoadedGoldSupplement | null = null;
  if (goldSupplementPath !== undefined) {
    verifyPinnedScoringInput(
      repoRoot,
      goldSupplementPath,
      scoringInputs.scoringSupplement,
      'scoring supplement',
    );
    // The supplement was built against the attempt-1 freeze and the
    // attempt-1 inventory: those are the parents it names, and they are the
    // comparator's, verified above.
    supplement = loadGoldSupplement(repoRoot, goldSupplementPath, {
      freezeRawSha256: comparator.freezeRawSha256,
      artifactInventorySha256: comparator.artifactInventorySha256,
      goldIds: corpusGoldIds,
    });
    verifyPinnedScoringInput(
      repoRoot,
      supplement.fixturePath,
      scoringInputs.devLabelsFixture,
      'DEV label fixture',
    );
    const projected = supplement.labelByGoldId.get(unresolved.goldId)?.verdict;
    if (projected !== unresolved.committedLabel) {
      fail(
        `the scoring supplement labels ${unresolved.goldId} ${String(projected)}, but the freeze preserves ${unresolved.committedLabel}.`,
      );
    }
  }

  let ownerAdjudication: LoadedOwnerAdjudication | null = null;
  if (ownerAdjudicationPath !== undefined) {
    if (supplement === null) {
      fail(
        'an owner-adjudication record was supplied without a gold supplement; there is no committed label for it to confirm.',
      );
    }
    verifyPinnedScoringInput(
      repoRoot,
      ownerAdjudicationPath,
      scoringInputs.ownerAdjudicationRecord,
      'owner adjudication record',
    );
    ownerAdjudication = loadOwnerAdjudication(repoRoot, ownerAdjudicationPath, {
      freezeRawSha256: comparator.freezeRawSha256,
      supplementRawSha256: supplement.supplementRawSha256,
      artifactInventorySha256: comparator.artifactInventorySha256,
      developmentGoldIds: corpusGoldIds,
      labelByGoldId: supplement.labelByGoldId,
    });
    if (ownerAdjudication.goldId !== unresolved.goldId) {
      fail(
        `the owner-adjudication record adjudicates ${ownerAdjudication.goldId}, not ${unresolved.goldId}.`,
      );
    }
    if (ownerAdjudication.confirmedVerdict !== unresolved.committedLabel) {
      fail(
        `the owner-adjudication record confirms ${ownerAdjudication.confirmedVerdict}; the freeze preserves ${unresolved.committedLabel}.`,
      );
    }
  }

  const availability = resolveGoldAvailability({
    freezePreservedVerdictGoldIds: [unresolved.goldId],
    labelFileRecordCount: attempt2.corpusRows.length + F4_HOLDOUT_ITEM_COUNT,
    devItemCount: attempt2.corpusRows.length,
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

  const v3Rows = scoreVariant(attempt2, 'PROMPT_V3_CANONICAL', availability, preserved);
  const v1Rows = scoreVariant(comparator, 'PROMPT_V1_CANONICAL', availability, preserved);
  const v2Rows = scoreVariant(comparator, 'PROMPT_V2_CANONICAL', availability, preserved);
  const pairedV1ToV3 = pairByIdentity(v1Rows, v3Rows);
  const pairedV2ToV3 = pairByIdentity(v2Rows, v3Rows);
  const summary = buildAttempt2Summary({
    attempt2,
    comparator,
    v3Rows,
    pairedV1ToV3,
    pairedV2ToV3,
    availability,
    supplement,
    ownerAdjudication,
  });
  return {
    attempt2,
    comparator,
    availability,
    supplement,
    ownerAdjudication,
    v3Rows,
    v1Rows,
    v2Rows,
    pairedV1ToV3,
    pairedV2ToV3,
    allRows: [...v1Rows, ...v2Rows, ...v3Rows],
    summary,
  };
}
