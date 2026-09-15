/**
 * PHASE 2B-2D2C-F0J — THE WHOLE READ-ONLY ATTEMPT-3 SCORING PASS, IN ONE
 * FUNCTION.
 *
 * Loads and verifies the attempt-3 root against the APPROVED+RATIFIED F0I
 * freeze, loads the preserved attempt-1 root READ-ONLY through the F4
 * loader and pins it to the attempt-1 comparator identity the F0I freeze
 * names, loads the preserved attempt-2 root READ-ONLY through the attempt-2
 * loader and pins it to the attempt-2 comparator identity the F0I freeze
 * names, loads the scoring-only gold supplement and the owner adjudication
 * record and pins BOTH to the F0I freeze's `scoringInputs` hashes, scores
 * the twelve V4 evaluations post-repair, re-scores V1 and V2 from the
 * preserved attempt-1 artifacts and V3 from the preserved attempt-2
 * artifacts (never rerun), pairs V4 against each of the three by gold id,
 * and summarises. It performs no inference, no authentication, no database
 * access and no network access of any kind, and it writes nothing —
 * emission is a separate, explicit call.
 *
 * It is callable ONLY when an attempt-3 root exists. At F0J none does, and
 * this module fabricates none: every test of it builds a clearly synthetic
 * scratch root in a temporary directory and deletes it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { F4_HOLDOUT_ITEM_COUNT, F4_OPEN_OWNER_GOLD_ID } from './constants.js';
import { loadOwnerAdjudication, type LoadedOwnerAdjudication } from './adjudication.js';
import { loadAttempt2ScoringSources, type LoadedAttempt2Sources } from './attempt2Sources.js';
import { loadAttempt3ScoringSources, type LoadedAttempt3Sources } from './attempt3Sources.js';
import { buildAttempt3Summary, type Attempt3Summary } from './attempt3Summarise.js';
import { resolveGoldAvailability, type GoldAvailability } from './gold.js';
import { pairByIdentity, type PairedItem } from './paired.js';
import { scoreVariant, type ScoredItem } from './score.js';
import { loadScoringSources, ScoringSourceError, type LoadedSources } from './sources.js';
import { loadGoldSupplement, type LoadedGoldSupplement } from './supplement.js';
import { sha256Hex } from '../freeze.js';

export interface Attempt3ScoringRun {
  readonly attempt3: LoadedAttempt3Sources;
  readonly attempt1Comparator: LoadedSources;
  readonly attempt2Comparator: LoadedAttempt2Sources;
  readonly availability: GoldAvailability;
  readonly supplement: LoadedGoldSupplement | null;
  readonly ownerAdjudication: LoadedOwnerAdjudication | null;
  readonly v4Rows: readonly ScoredItem[];
  readonly v1Rows: readonly ScoredItem[];
  readonly v2Rows: readonly ScoredItem[];
  readonly v3Rows: readonly ScoredItem[];
  readonly pairedV1ToV4: readonly PairedItem[];
  readonly pairedV2ToV4: readonly PairedItem[];
  readonly pairedV3ToV4: readonly PairedItem[];
  /** V4 rows plus the three comparator row sets, for the scored-items file. */
  readonly allRows: readonly ScoredItem[];
  readonly summary: Attempt3Summary;
}

function fail(message: string): never {
  throw new ScoringSourceError(message);
}

/**
 * The attempt-1 comparator root is loaded READ-ONLY through the attempt-1
 * loader and must be exactly the evidence the F0I freeze names as the
 * attempt-1 comparator.
 */
export function loadPinnedAttempt1ComparatorF0I(
  repoRoot: string,
  attempt3: LoadedAttempt3Sources,
  attempt1Root: string,
): LoadedSources {
  const comparator = loadScoringSources(repoRoot, attempt1Root);
  const pinned = attempt3.freeze.scoring.comparatorPolicy.attempt1;
  if (comparator.artifactInventorySha256 !== pinned.artifactInventorySha256) {
    fail(
      `the attempt-1 root's inventory ${comparator.artifactInventorySha256} is not the comparator the F0I freeze pins (${pinned.artifactInventorySha256}).`,
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

/**
 * The attempt-2 comparator root is loaded READ-ONLY through the attempt-2
 * loader (which itself verifies it against the CURRENT F0E freeze) and must
 * additionally be exactly the evidence the F0I freeze names as the
 * attempt-2 comparator.
 */
export function loadPinnedAttempt2ComparatorF0I(
  repoRoot: string,
  attempt3: LoadedAttempt3Sources,
  attempt2Root: string,
): LoadedAttempt2Sources {
  const comparator = loadAttempt2ScoringSources(repoRoot, attempt2Root);
  const pinned = attempt3.freeze.scoring.comparatorPolicy.attempt2;
  if (comparator.artifactInventorySha256 !== pinned.primaryArtifactInventorySha256) {
    fail('the attempt-2 root primary inventory is not the comparator the F0I freeze pins.');
  }
  if (comparator.artifactsVerified !== pinned.primaryArtifactCount) {
    fail(
      `the attempt-2 root verified ${comparator.artifactsVerified} primary artifacts; ${pinned.primaryArtifactCount} are pinned.`,
    );
  }
  if (comparator.repairArtifactInventory.sha256 !== pinned.repairArtifactInventorySha256) {
    fail('the attempt-2 root repair inventory is not the comparator the F0I freeze pins.');
  }
  if (comparator.repairArtifactInventory.count !== pinned.repairArtifactCount) {
    fail(
      `the attempt-2 root holds ${comparator.repairArtifactInventory.count} repair artifacts; ${pinned.repairArtifactCount} are pinned.`,
    );
  }
  if (comparator.freezeRawSha256 !== pinned.freezeRawSha256) {
    fail(
      'the attempt-2 root was scored under a freeze other than the pinned F0E comparator freeze.',
    );
  }
  if (comparator.authorisationSha256 !== pinned.authorisationSha256) {
    fail('the attempt-2 root was driven by an authorisation other than the pinned comparator one.');
  }
  if (comparator.planSha256 !== pinned.planSha256) {
    fail('the attempt-2 root was planned under a plan other than the pinned comparator plan.');
  }
  return comparator;
}

/** The F0I freeze pins the exact scoring inputs by hash; a repository whose files drifted is refused. */
function verifyPinnedScoringInput(
  repoRoot: string,
  relativePath: string,
  pinned: { readonly path: string; readonly rawSha256: string },
  what: string,
): void {
  if (relativePath !== pinned.path) {
    fail(`the ${what} path ${relativePath} is not the one the F0I freeze pins (${pinned.path}).`);
  }
  const actual = sha256Hex(readFileSync(join(repoRoot, relativePath)));
  if (actual !== pinned.rawSha256) {
    fail(
      `the ${what} ${relativePath} hashes to ${actual}; the F0I freeze pins ${pinned.rawSha256}.`,
    );
  }
}

/**
 * `goldSupplementPath` and `ownerAdjudicationPath` are OPT-IN and
 * repository-relative, exactly as for attempt 1/2 — and here each is ALSO
 * pinned by hash to the F0I freeze's `scoringInputs`. Omitted, the pass
 * scores with no gold and reports INSUFFICIENT_VALID_DEV_EVIDENCE.
 */
export function runAttempt3Scoring(
  repoRoot: string,
  attempt3Root: string,
  attempt1Root: string,
  attempt2Root: string,
  goldSupplementPath?: string,
  ownerAdjudicationPath?: string,
): Attempt3ScoringRun {
  const attempt3 = loadAttempt3ScoringSources(repoRoot, attempt3Root);
  const attempt1Comparator = loadPinnedAttempt1ComparatorF0I(repoRoot, attempt3, attempt1Root);
  const attempt2Comparator = loadPinnedAttempt2ComparatorF0I(repoRoot, attempt3, attempt2Root);

  const unresolved = attempt3.freeze.unresolvedGold;
  if (unresolved.goldId !== F4_OPEN_OWNER_GOLD_ID) {
    fail(
      `the F0I freeze's open gold question is ${unresolved.goldId}; this scorer is pinned to ${F4_OPEN_OWNER_GOLD_ID}.`,
    );
  }
  const corpusGoldIds = attempt3.corpusRows.map((row) => row.goldId);
  const scoringInputs = attempt3.freeze.scoring.scoringInputs;

  let supplement: LoadedGoldSupplement | null = null;
  if (goldSupplementPath !== undefined) {
    verifyPinnedScoringInput(
      repoRoot,
      goldSupplementPath,
      scoringInputs.scoringSupplement,
      'scoring supplement',
    );
    supplement = loadGoldSupplement(repoRoot, goldSupplementPath, {
      freezeRawSha256: attempt1Comparator.freezeRawSha256,
      artifactInventorySha256: attempt1Comparator.artifactInventorySha256,
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
      freezeRawSha256: attempt1Comparator.freezeRawSha256,
      supplementRawSha256: supplement.supplementRawSha256,
      artifactInventorySha256: attempt1Comparator.artifactInventorySha256,
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
    labelFileRecordCount: attempt3.corpusRows.length + F4_HOLDOUT_ITEM_COUNT,
    devItemCount: attempt3.corpusRows.length,
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

  const v4Rows = scoreVariant(attempt3, 'PROMPT_V4_CANONICAL', availability, preserved);
  const v1Rows = scoreVariant(attempt1Comparator, 'PROMPT_V1_CANONICAL', availability, preserved);
  const v2Rows = scoreVariant(attempt1Comparator, 'PROMPT_V2_CANONICAL', availability, preserved);
  const v3Rows = scoreVariant(attempt2Comparator, 'PROMPT_V3_CANONICAL', availability, preserved);
  const pairedV1ToV4 = pairByIdentity(v1Rows, v4Rows);
  const pairedV2ToV4 = pairByIdentity(v2Rows, v4Rows);
  const pairedV3ToV4 = pairByIdentity(v3Rows, v4Rows);
  const summary = buildAttempt3Summary({
    attempt3,
    attempt1Comparator,
    attempt2Comparator,
    v4Rows,
    pairedV1ToV4,
    pairedV2ToV4,
    pairedV3ToV4,
    availability,
    supplement,
    ownerAdjudication,
  });
  return {
    attempt3,
    attempt1Comparator,
    attempt2Comparator,
    availability,
    supplement,
    ownerAdjudication,
    v4Rows,
    v1Rows,
    v2Rows,
    v3Rows,
    pairedV1ToV4,
    pairedV2ToV4,
    pairedV3ToV4,
    allRows: [...v1Rows, ...v2Rows, ...v3Rows, ...v4Rows],
    summary,
  };
}
