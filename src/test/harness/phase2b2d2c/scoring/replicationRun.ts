/**
 * PHASE 2B-2D2C-F0X — THE N=5 REPLICATION SCORING PASS AND ITS GOLD-FREE
 * READINESS CHECK.
 *
 * Two entry points, deliberately separate:
 *
 *   - `replicationReadinessOf` loads and verifies the ten closed Recovery-1
 *     slots against the frozen plans, the committed inventory, the structural
 *     closure and the clarification. It opens NO gold, supplement or
 *     adjudication record, and it reports only structural facts: replicate
 *     status, terminal condition, evaluation states and item-coverage
 *     counts. It reports no verdict.
 *   - `runReplicationStudyScoring` additionally loads the pinned
 *     DEVELOPMENT-only gold and scores. It requires both the scoring
 *     supplement and the owner adjudication record, each pinned by path and
 *     hash to the F0I/F0O `scoringInputs`. Invoking it needs a separate owner
 *     authorisation; nothing in this slice invokes it on real evidence.
 *
 * Both are pinned to the Recovery-1 study root and the committed closure: a
 * slot whose tree differs from the closed inventory is refused before any
 * artifact is parsed. Any holdout-split or mixed label file is refused by
 * path before anything is read.
 *
 * Filesystem reads only. No network, no database, no clock, no writes.
 */
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, normalize, relative, resolve, sep } from 'node:path';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import { F0V_FREEZE_PATH, PROPOSED_F0V_FREEZE_RAW_SHA256 } from '../f0v/freezeF0V.js';
import { F0V_SLOTS, futureOutputRootPathOf } from '../f0v/studyPlanCore.js';
import { treeFingerprint } from '../f0x/failedStudyInventory.js';
import { F0X_RECOVERY_1_STUDY_ROOT } from '../f0x/recovery1Overlay.js';
import {
  RECOVERY_1_EXECUTION_INVENTORY_PATH,
  RECOVERY_1_EXECUTION_INVENTORY_RAW_SHA256,
} from '../f0x/recovery1ExecutionInventory.js';
import {
  RECOVERY_1_STRUCTURAL_CLOSURE_PATH,
  RECOVERY_1_STRUCTURAL_CLOSURE_RAW_SHA256,
} from '../f0x/recovery1StructuralClosure.js';
import { sha256Hex } from '../freeze.js';
import { F4_HOLDOUT_ITEM_COUNT, F4_OPEN_OWNER_GOLD_ID } from './constants.js';
import { loadOwnerAdjudication, type LoadedOwnerAdjudication } from './adjudication.js';
import { resolveGoldAvailability, type GoldAvailability } from './gold.js';
import {
  buildPartialReplicateClarification,
  INCLUDED_N_PER_PROMPT,
  ITEMS_PER_REPLICATE,
  REPLICATION_CLARIFICATION_PATH,
  REPLICATION_CLARIFICATION_RAW_SHA256,
  SIX_FROZEN_DEV_GATES,
} from './replicationContract.js';
import { scoreReplicate, type ScoredReplicate } from './replicationScore.js';
import {
  assertIncludedReplicates,
  loadReplicate,
  loadReplicationContext,
  type LoadedReplicate,
  type ReplicationContext,
} from './replicationSources.js';
import { buildReplicationSummary, type ReplicationSummary } from './replicationSummarise.js';
import { ScoringSourceError } from './sources.js';
import { loadGoldSupplement, type LoadedGoldSupplement } from './supplement.js';

function fail(message: string): never {
  throw new ScoringSourceError(message);
}

/** Every file under `root`, hashed as opaque bytes. Refuses a symlink or special file. */
function slotTreeOf(root: string): { readonly fileCount: number; readonly treeSha256: string } {
  const entries: { path: string; fileSha256: string }[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const stat = lstatSync(full);
      if (stat.isDirectory()) walk(full);
      else if (stat.isFile()) {
        entries.push({
          path: relative(root, full).split(sep).join('/'),
          fileSha256: sha256Hex(readFileSync(full)),
        });
      } else fail(`${full} is neither a regular file nor a directory.`);
    }
  };
  walk(root);
  return { fileCount: entries.length, treeSha256: treeFingerprint(entries) };
}

function readPinned(repoRoot: string, path: string, rawSha256: string): Buffer {
  const bytes = readFileSync(join(repoRoot, path));
  const actual = sha256Hex(bytes);
  if (actual !== rawSha256) fail(`${path} hashes to ${actual}; ${rawSha256} is pinned.`);
  return bytes;
}

/**
 * Refuses, by path and before any read, every file the F0V freeze forbids
 * and any other path naming the holdout split.
 */
export function refuseForbiddenScoringSource(repoRoot: string, relativePath: string): void {
  const freezeBytes = readPinned(repoRoot, F0V_FREEZE_PATH, PROPOSED_F0V_FREEZE_RAW_SHA256);
  const forbidden = (
    JSON.parse(freezeBytes.toString('utf8')) as { holdout: { forbiddenFiles: string[] } }
  ).holdout.forbiddenFiles;
  const normalised = normalize(relativePath).split(sep).join('/');
  if (forbidden.map((path) => normalize(path).split(sep).join('/')).includes(normalised)) {
    fail(
      `${relativePath} is a holdout or mixed DEVELOPMENT/HOLDOUT file the F0V freeze forbids; it is never opened.`,
    );
  }
  if (/holdout/i.test(normalised))
    fail(`${relativePath} names the holdout split; it is never opened.`);
}

interface ClosureSlotPin {
  readonly slotId: string;
  readonly candidateAuthorisationSha256: string;
  readonly fileCount: number;
  readonly treeSha256: string;
}

export interface LoadedReplicationStudy {
  readonly context: ReplicationContext;
  readonly replicates: readonly LoadedReplicate[];
  readonly pins: {
    readonly inventoryRawSha256: string;
    readonly closureRawSha256: string;
    readonly clarificationRawSha256: string;
    readonly wholeStudyTreeSha256: string;
  };
}

/** Loads the ten closed Recovery-1 slots, each pinned to the committed structural closure. */
export function loadReplicationStudySources(
  repoRoot: string,
  studyRoot: string,
): LoadedReplicationStudy {
  if (resolve(studyRoot) !== F0X_RECOVERY_1_STUDY_ROOT) {
    fail(`the replication scorer reads only the Recovery-1 study root; ${studyRoot} was given.`);
  }
  readPinned(
    repoRoot,
    RECOVERY_1_EXECUTION_INVENTORY_PATH,
    RECOVERY_1_EXECUTION_INVENTORY_RAW_SHA256,
  );
  const closure = JSON.parse(
    readPinned(
      repoRoot,
      RECOVERY_1_STRUCTURAL_CLOSURE_PATH,
      RECOVERY_1_STRUCTURAL_CLOSURE_RAW_SHA256,
    ).toString('utf8'),
  ) as {
    study: { wholeStudyTree: { fileCount: number; treeSha256: string } };
    slots: ClosureSlotPin[];
  };
  const clarification: unknown = JSON.parse(
    readPinned(
      repoRoot,
      REPLICATION_CLARIFICATION_PATH,
      REPLICATION_CLARIFICATION_RAW_SHA256,
    ).toString('utf8'),
  );
  if (
    canonicalStringify(clarification) !==
    canonicalStringify(JSON.parse(JSON.stringify(buildPartialReplicateClarification())))
  ) {
    fail('the committed clarification differs from the rules this scorer enforces.');
  }

  const whole = slotTreeOf(F0X_RECOVERY_1_STUDY_ROOT);
  if (
    whole.treeSha256 !== closure.study.wholeStudyTree.treeSha256 ||
    whole.fileCount !== closure.study.wholeStudyTree.fileCount
  ) {
    fail(
      `the Recovery-1 study tree is ${whole.treeSha256} (${whole.fileCount} files); the closure pins ${closure.study.wholeStudyTree.treeSha256}.`,
    );
  }

  const context = loadReplicationContext(repoRoot);
  const replicates = F0V_SLOTS.map((slot) => {
    const pin =
      closure.slots.find((entry) => entry.slotId === slot.slotId) ??
      fail(`the closure has no ${slot.slotId}.`);
    const outputRoot = futureOutputRootPathOf(F0X_RECOVERY_1_STUDY_ROOT, slot);
    const tree = slotTreeOf(outputRoot);
    if (tree.treeSha256 !== pin.treeSha256 || tree.fileCount !== pin.fileCount) {
      fail(
        `${slot.slotId}: the slot tree is ${tree.treeSha256}; the closure pins ${pin.treeSha256}.`,
      );
    }
    return loadReplicate(context, slot, outputRoot, {
      candidateAuthorisationSha256: pin.candidateAuthorisationSha256,
      recordedOutputRoot: outputRoot,
    });
  });
  assertIncludedReplicates(replicates);
  return {
    context,
    replicates,
    pins: {
      inventoryRawSha256: RECOVERY_1_EXECUTION_INVENTORY_RAW_SHA256,
      closureRawSha256: RECOVERY_1_STRUCTURAL_CLOSURE_RAW_SHA256,
      clarificationRawSha256: REPLICATION_CLARIFICATION_RAW_SHA256,
      wholeStudyTreeSha256: whole.treeSha256,
    },
  };
}

export interface ReplicateReadiness {
  readonly slotId: string;
  readonly variantName: string;
  readonly replicateStatus: LoadedReplicate['replicateStatus'];
  readonly terminalCondition: LoadedReplicate['terminalCondition'];
  readonly evaluationStates: Readonly<Record<string, number>>;
  readonly itemsInValidatedEvaluations: number;
  readonly itemsInvalidNonTerminal: number;
  readonly itemsNotObservedDueToTerminalFailure: number;
  readonly fullRunGateVector:
    'TO_BE_COMPUTED_WHEN_SCORING_IS_AUTHORISED' | 'NOT_AVAILABLE_INCOMPLETE_REPLICATE';
}

/** Structural readiness of one loaded replicate: counts only, never a verdict. */
export function readinessOfReplicate(replicate: LoadedReplicate): ReplicateReadiness {
  const states: Record<string, number> = {};
  let validated = 0;
  let invalid = 0;
  let notObserved = 0;
  for (const entry of replicate.evaluations) {
    states[entry.state] = (states[entry.state] ?? 0) + 1;
    const items = entry.planned.orderedGoldIds.length;
    if (entry.state === 'VALIDATED') {
      if (entry.evaluation.validation.kind !== 'VALIDATED')
        fail(`${replicate.slot.slotId}: an unvalidated envelope.`);
      const recorded = [
        ...entry.evaluation.validation.accepted.map((a) => a.docIndex),
        ...entry.evaluation.validation.rejected.map((r) => r.docIndex),
      ].sort((a, b) => (a ?? -1) - (b ?? -1));
      const planned = [...entry.planned.orderedDocIndices].sort((a, b) => a - b);
      if (canonicalStringify(recorded) !== canonicalStringify(planned)) {
        fail(
          `${replicate.slot.slotId} batch ${entry.planned.logicalBatchOrdinal}: validator records do not cover each planned document exactly once.`,
        );
      }
      validated += items;
    } else if (entry.state === 'INVALID_NON_TERMINAL_PROVIDER_FAILURE') invalid += items;
    else notObserved += items;
  }
  if (validated + invalid + notObserved !== ITEMS_PER_REPLICATE) {
    fail(`${replicate.slot.slotId}: covers ${validated + invalid + notObserved} items.`);
  }
  if (replicate.replicateStatus === 'COMPLETE' && notObserved !== 0) {
    fail(`${replicate.slot.slotId}: a COMPLETE replicate with ${notObserved} unobserved items.`);
  }
  return {
    slotId: replicate.slot.slotId,
    variantName: replicate.slot.variantName,
    replicateStatus: replicate.replicateStatus,
    terminalCondition: replicate.terminalCondition,
    evaluationStates: Object.fromEntries(
      Object.entries(states).sort(([a], [b]) => a.localeCompare(b)),
    ),
    itemsInValidatedEvaluations: validated,
    itemsInvalidNonTerminal: invalid,
    itemsNotObservedDueToTerminalFailure: notObserved,
    fullRunGateVector:
      replicate.replicateStatus === 'COMPLETE'
        ? 'TO_BE_COMPUTED_WHEN_SCORING_IS_AUTHORISED'
        : 'NOT_AVAILABLE_INCOMPLETE_REPLICATE',
  };
}

export interface ReplicationReadiness {
  readonly readiness: 'READY_FOR_OWNER_SCORING_AUTHORISATION';
  readonly goldOpened: false;
  readonly pins: LoadedReplicationStudy['pins'];
  readonly includedNPerPrompt: number;
  readonly frozenGates: readonly string[];
  readonly replicates: readonly ReplicateReadiness[];
  readonly perPrompt: Readonly<
    Record<
      string,
      {
        readonly includedN: number;
        readonly completeN: number;
        readonly terminalFailurePartialN: number;
      }
    >
  >;
}

/** Gold-free: verifies every closed slot loads under the clarification. Opens no label source. */
export function replicationReadinessOf(repoRoot: string, studyRoot: string): ReplicationReadiness {
  const study = loadReplicationStudySources(repoRoot, studyRoot);
  const replicates = study.replicates.map(readinessOfReplicate);
  const perPrompt = Object.fromEntries(
    ['PROMPT_V4_CANONICAL', 'PROMPT_V5_CANONICAL'].map((variantName) => {
      const of = replicates.filter((r) => r.variantName === variantName);
      return [
        variantName,
        {
          includedN: of.length,
          completeN: of.filter((r) => r.replicateStatus === 'COMPLETE').length,
          terminalFailurePartialN: of.filter(
            (r) => r.replicateStatus === 'TERMINAL_FAILURE_PARTIAL',
          ).length,
        },
      ];
    }),
  );
  return {
    readiness: 'READY_FOR_OWNER_SCORING_AUTHORISATION',
    goldOpened: false,
    pins: study.pins,
    includedNPerPrompt: INCLUDED_N_PER_PROMPT,
    frozenGates: SIX_FROZEN_DEV_GATES,
    replicates,
    perPrompt,
  };
}

function verifyPinnedScoringInput(
  repoRoot: string,
  relativePath: string,
  pinned: { readonly path: string; readonly rawSha256: string },
  what: string,
): void {
  refuseForbiddenScoringSource(repoRoot, relativePath);
  if (relativePath !== pinned.path)
    fail(`the ${what} path ${relativePath} is not the pinned ${pinned.path}.`);
  readPinned(repoRoot, relativePath, pinned.rawSha256);
}

export interface ReplicationScoringRun {
  readonly study: LoadedReplicationStudy;
  readonly availability: GoldAvailability;
  readonly supplement: LoadedGoldSupplement;
  readonly ownerAdjudication: LoadedOwnerAdjudication;
  readonly scoredReplicates: readonly ScoredReplicate[];
  readonly summary: ReplicationSummary;
}

/**
 * The gold-backed N=5 scoring pass. NOT to be invoked on real evidence
 * without a separate owner scoring authorisation.
 */
export function runReplicationStudyScoring(
  repoRoot: string,
  studyRoot: string,
  goldSupplementPath: string,
  ownerAdjudicationPath: string,
): ReplicationScoringRun {
  refuseForbiddenScoringSource(repoRoot, goldSupplementPath);
  refuseForbiddenScoringSource(repoRoot, ownerAdjudicationPath);
  const study = loadReplicationStudySources(repoRoot, studyRoot);
  const { context } = study;
  const v4Freeze = context.variants.PROMPT_V4_CANONICAL.freeze;
  const v5Freeze = context.variants.PROMPT_V5_CANONICAL.freeze;
  if (
    canonicalStringify(v4Freeze.scoring.scoringInputs.scoringSupplement) !==
      canonicalStringify(v5Freeze.scoring.scoringInputs.scoringSupplement) ||
    canonicalStringify(v4Freeze.scoring.scoringInputs.devLabelsFixture) !==
      canonicalStringify(v5Freeze.scoring.scoringInputs.devLabelsFixture) ||
    canonicalStringify(v4Freeze.scoring.scoringInputs.ownerAdjudicationRecord) !==
      canonicalStringify(v5Freeze.scoring.scoringInputs.ownerAdjudicationRecord) ||
    canonicalStringify(v4Freeze.scoring.comparatorPolicy.attempt1) !==
      canonicalStringify(v5Freeze.scoring.comparatorPolicy.attempt1) ||
    canonicalStringify(v4Freeze.unresolvedGold) !== canonicalStringify(v5Freeze.unresolvedGold)
  ) {
    fail('the F0I and F0O freezes pin different scoring inputs.');
  }
  const scoringInputs = v5Freeze.scoring.scoringInputs;
  verifyPinnedScoringInput(
    repoRoot,
    goldSupplementPath,
    scoringInputs.scoringSupplement,
    'scoring supplement',
  );
  verifyPinnedScoringInput(
    repoRoot,
    ownerAdjudicationPath,
    scoringInputs.ownerAdjudicationRecord,
    'owner adjudication record',
  );

  const corpusGoldIds = context.corpusRows.map((row) => row.goldId);
  const attempt1 = v5Freeze.scoring.comparatorPolicy.attempt1;
  const unresolved = v5Freeze.unresolvedGold;
  if (unresolved.goldId !== F4_OPEN_OWNER_GOLD_ID)
    fail(`the freezes' open gold question is ${unresolved.goldId}.`);

  // The hash-pinned supplement names exactly this fixture; it is refused or verified BEFORE the supplement loader reads it.
  verifyPinnedScoringInput(
    repoRoot,
    scoringInputs.devLabelsFixture.path,
    scoringInputs.devLabelsFixture,
    'DEV label fixture',
  );
  const supplement = loadGoldSupplement(repoRoot, goldSupplementPath, {
    freezeRawSha256: attempt1.freezeRawSha256,
    artifactInventorySha256: attempt1.artifactInventorySha256,
    goldIds: corpusGoldIds,
  });
  if (supplement.fixturePath !== scoringInputs.devLabelsFixture.path) {
    fail(
      `the supplement names ${supplement.fixturePath}; the freezes pin ${scoringInputs.devLabelsFixture.path}.`,
    );
  }
  if (supplement.labelByGoldId.get(unresolved.goldId)?.verdict !== unresolved.committedLabel) {
    fail(
      `the scoring supplement does not preserve ${unresolved.goldId} as ${unresolved.committedLabel}.`,
    );
  }
  const ownerAdjudication = loadOwnerAdjudication(repoRoot, ownerAdjudicationPath, {
    freezeRawSha256: attempt1.freezeRawSha256,
    supplementRawSha256: supplement.supplementRawSha256,
    artifactInventorySha256: attempt1.artifactInventorySha256,
    developmentGoldIds: corpusGoldIds,
    labelByGoldId: supplement.labelByGoldId,
  });
  if (
    ownerAdjudication.goldId !== unresolved.goldId ||
    ownerAdjudication.confirmedVerdict !== unresolved.committedLabel
  ) {
    fail('the owner adjudication record does not confirm the preserved label.');
  }

  const availability = resolveGoldAvailability({
    freezePreservedVerdictGoldIds: [unresolved.goldId],
    labelFileRecordCount: context.corpusRows.length + F4_HOLDOUT_ITEM_COUNT,
    devItemCount: context.corpusRows.length,
    supplement: {
      path: supplement.supplementPath,
      fixturePath: supplement.fixturePath,
      itemCount: supplement.labelCount,
    },
  });
  const preserved = {
    verdictByGoldId: new Map<string, string>([[unresolved.goldId, unresolved.committedLabel]]),
    labelByGoldId: supplement.labelByGoldId,
  };
  const scoredReplicates = study.replicates.map((replicate) =>
    scoreReplicate(replicate, context.corpusRows, availability, preserved, context.gates),
  );
  return {
    study,
    availability,
    supplement,
    ownerAdjudication,
    scoredReplicates,
    summary: buildReplicationSummary(scoredReplicates, corpusGoldIds),
  };
}
