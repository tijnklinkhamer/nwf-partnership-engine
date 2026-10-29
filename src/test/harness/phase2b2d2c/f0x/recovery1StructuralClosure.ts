/**
 * PHASE 2B-2D2C-F0X RECOVERY-1 — IMMUTABLE STRUCTURAL CLOSURE RECORD.
 *
 * Generated, never hand-typed, from the committed execution inventory
 * (`recovery1ExecutionInventory.ts`, pinned by raw SHA-256). It records:
 *
 *   - the owner's methodological decision (2026-09-16) that ALL TEN
 *     Recovery-1 slots count toward the frozen N=5 per prompt, and that the
 *     three stopped slots are never replaced or rerun (F0V
 *     `inclusionRule.classC`, F0U §7);
 *   - what `COMPLETED_ALL_SLOTS` means and does not mean;
 *   - the independently re-derived execution totals and each slot's
 *     structural terminal condition;
 *   - the structural observations a later scorer must not silently absorb.
 *
 * It assigns no replicate status and computes no metric: the partial-
 * replicate analysis contract is a separate, additive clarification
 * (`scoring/replicationContract.ts`). Pure: the caller supplies the
 * inventory bytes. No network, no database, no filesystem of its own, no
 * gold or scoring module.
 *
 *   node --import tsx src/test/harness/phase2b2d2c/f0x/recovery1StructuralClosure.ts
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPECTED_CORPUS_ITEM_COUNT, EXPECTED_LOGICAL_BATCHES_PER_VARIANT } from '../constants.js';
import {
  F0U_METHODOLOGY_RAW_SHA256,
  F0V_APPROVAL_RECORD_RAW_SHA256,
  PROPOSED_F0V_FREEZE_RAW_SHA256,
} from '../f0v/freezeF0V.js';
import { F0V_N_PER_PROMPT, sha256Hex } from '../f0v/studyPlanCore.js';
import {
  F0X_RECOVERY_1_CONTROL_DIR,
  F0X_RECOVERY_1_OVERLAY_RAW_SHA256,
  F0X_RECOVERY_1_STUDY_ROOT,
} from './recovery1Overlay.js';
import {
  RECOVERY_1_EXECUTION_INVENTORY_PATH,
  RECOVERY_1_EXECUTION_INVENTORY_RAW_SHA256,
  type EvaluationInventory,
  type Recovery1ExecutionInventory,
  type SlotExecutionInventory,
} from './recovery1ExecutionInventory.js';

export const RECOVERY_1_STRUCTURAL_CLOSURE_VERSION =
  'phase2b-2d2c-f0x-recovery-1-structural-closure-v1';
export const RECOVERY_1_STRUCTURAL_CLOSURE_PATH =
  'docs/evaluation/PHASE_2B_2D2C_F0X_RECOVERY_1_STRUCTURAL_CLOSURE_V1.json';
export const RECOVERY_1_STRUCTURAL_CLOSURE_RAW_SHA256 =
  'aeb411cf5aaff615564e74356559511840eaa177b075715f72e8da283b7dccc6';

/** F0V `inclusionRule.classC.action`, restated verbatim; the test compares it to the freeze bytes. */
export const F0V_CLASS_C_ACTION =
  'That slot is IRREVOCABLY part of the study, whether it completes successfully or ends in a genuine terminal failure/halt. Never replaced or discarded. This is the predeclared inclusion rule.';

/** F0I/F0O `scoring.providerFailureTreatment`, restated verbatim; the test compares it to both freezes. */
export const FROZEN_PROVIDER_FAILURE_TREATMENT =
  'Provider failures and usage-limit outcomes keep the existing protocol treatment (INVALID is never a missing observation; usage-limit interruptions never count against quality).';

export class StructuralClosureError extends Error {
  override readonly name = 'StructuralClosureError';
}

function fail(message: string): never {
  throw new StructuralClosureError(message);
}

export type StructuralTerminalCondition =
  | 'ALL_12_PLANNED_EVALUATIONS_ENDED_WITHOUT_STOP'
  | 'EXPERIMENT_STOPPED_BEFORE_ALL_PLANNED_EVALUATIONS';

function documentsOf(evaluations: readonly EvaluationInventory[]): number {
  return evaluations.reduce(
    (total, e) => total + (e.documents ?? fail('an evaluation has no document count.')),
    0,
  );
}

function slotClosureOf(slot: SlotExecutionInventory) {
  const terminal = slot.experiment.completion ?? slot.experiment.stop;
  if (slot.experiment.terminalKind !== 'COMPLETION' && slot.experiment.terminalKind !== 'STOP') {
    fail(`${slot.slotId}: experiment terminal kind ${slot.experiment.terminalKind}.`);
  }
  if (terminal === null || terminal.record === null) fail(`${slot.slotId}: no terminal record.`);
  if (slot.inclusion.inclusionClass !== 'CLASS_C_PROVIDER_REQUEST_OR_SEMANTIC_EXECUTION_OBSERVED') {
    fail(`${slot.slotId}: inclusion class ${slot.inclusion.inclusionClass}, not Class C.`);
  }
  if (!slot.inclusion.durablyClosed) fail(`${slot.slotId}: not durably closed.`);
  if (!slot.candidateMatchesStudyManifest)
    fail(`${slot.slotId}: candidate differs from the study manifest.`);
  const stopped = slot.evaluations.filter((e) => e.stop === true);
  const endedClean = slot.evaluations.filter((e) => e.endedWithoutStop);
  if (stopped.length + endedClean.length !== slot.evaluations.length) {
    fail(`${slot.slotId}: an evaluation has no stop decision.`);
  }
  const condition: StructuralTerminalCondition =
    slot.experiment.terminalKind === 'COMPLETION'
      ? 'ALL_12_PLANNED_EVALUATIONS_ENDED_WITHOUT_STOP'
      : 'EXPERIMENT_STOPPED_BEFORE_ALL_PLANNED_EVALUATIONS';
  if (condition === 'ALL_12_PLANNED_EVALUATIONS_ENDED_WITHOUT_STOP') {
    if (
      terminal.record['status'] !== 'COMPLETED_ALL_PLANNED' ||
      endedClean.length !== EXPECTED_LOGICAL_BATCHES_PER_VARIANT ||
      stopped.length !== 0
    ) {
      fail(`${slot.slotId}: a completion record without twelve clean evaluations.`);
    }
  } else if (stopped.length !== 1 || stopped[0] !== slot.evaluations[slot.evaluations.length - 1]) {
    fail(`${slot.slotId}: a stopped experiment must end on exactly one stopped evaluation.`);
  }
  const terminalEvaluation = stopped[0];
  const documentsStarted = documentsOf(slot.evaluations);
  return {
    slotId: slot.slotId,
    sequence: slot.sequence,
    pairNumber: slot.pairNumber,
    variantName: slot.variantName,
    outputRoot: slot.outputRoot,
    candidateAuthorisationSha256: slot.candidateAuthorisationSha256,
    fileCount: slot.fileCount,
    treeSha256: slot.treeSha256,
    inclusionClass: slot.inclusion.inclusionClass,
    durablyClosed: slot.inclusion.durablyClosed,
    countsTowardN: true,
    replacementOrRerunEligible: false,
    structuralTerminalCondition: condition,
    experimentTerminal: {
      kind: slot.experiment.terminalKind,
      path: terminal.path,
      fileSha256: terminal.fileSha256,
      recordSha256: terminal.recordSha256,
      status: terminal.record['status'] ?? null,
      stopKind: terminal.record['kind'] ?? null,
      stopCondition: terminal.record['stopCondition'] ?? null,
      atSequence: terminal.record['atSequence'] ?? null,
      atUtc: terminal.record['completedAtUtc'] ?? terminal.record['stoppedAtUtc'] ?? null,
    },
    experimentStartedAtUtc: slot.experiment.manifest?.record?.['startedAtUtc'] ?? null,
    evaluations: {
      planned: slot.counts.evaluationsPlanned,
      started: slot.counts.evaluationsStarted,
      endedWithoutStop: slot.counts.evaluationsEndedWithoutStop,
      endedWithStop: slot.counts.evaluationsEndedWithStop,
      notStarted: EXPECTED_LOGICAL_BATCHES_PER_VARIANT - slot.counts.evaluationsStarted,
    },
    documents: {
      inEvaluationsEndedWithoutStop: documentsOf(endedClean),
      inTerminalStoppedEvaluation: terminalEvaluation?.documents ?? 0,
      inEvaluationsNeverStarted: EXPECTED_CORPUS_ITEM_COUNT - documentsStarted,
    },
    providerRequests: {
      original: slot.counts.originalProviderRequests,
      repair: slot.counts.repairProviderRequests,
      total: slot.counts.providerRequests,
    },
    adapterAttempts: slot.counts.adapterAttempts,
    authStatusInvocations: slot.counts.authStatusInvocations,
    originalProviderOutcomes: slot.counts.originalOutcomes,
    tier2Outcomes: slot.counts.tier2Outcomes,
    repairCallsByDisposition: slot.counts.repairCallsByDisposition,
    terminalStoppedEvaluation:
      terminalEvaluation === undefined
        ? null
        : {
            logicalBatchOrdinal: terminalEvaluation.logicalBatchOrdinal,
            documents: terminalEvaluation.documents,
            providerOutcome: terminalEvaluation.providerOutcome,
            providerOutcomeDetail: terminalEvaluation.providerOutcomeDetail,
            monotonicWallTimeMs: terminalEvaluation.monotonicWallTimeMs,
            tier1DiagnosticsCaptured: terminalEvaluation.tier1DiagnosticsCaptured,
            tier2Outcome: terminalEvaluation.tier2Outcome,
            tier2HardKillDisposition: terminalEvaluation.tier2HardKillDisposition,
            tier2GracePhaseVerdict: terminalEvaluation.tier2GracePhaseVerdict,
            haltKind: terminalEvaluation.haltKind,
            stopCondition: terminalEvaluation.stopCondition,
            validationResultPresent: terminalEvaluation.validationResultPresent,
          },
    nonTerminalProviderFailures: endedClean
      .filter((e) => e.providerOutcome !== 'OK')
      .map((e) => ({
        logicalBatchOrdinal: e.logicalBatchOrdinal,
        documents: e.documents,
        providerOutcome: e.providerOutcome,
        providerOutcomeDetail: e.providerOutcomeDetail,
        validationResultPresent: e.validationResultPresent,
        rawOutputCheckpointPresent: e.rawOutputCheckpointPresent,
      })),
  };
}

export function buildRecovery1StructuralClosure(inventoryBytes: Buffer) {
  const rawSha256 = sha256Hex(inventoryBytes);
  if (rawSha256 !== RECOVERY_1_EXECUTION_INVENTORY_RAW_SHA256) {
    fail(
      `the execution inventory hashes to ${rawSha256}; ${RECOVERY_1_EXECUTION_INVENTORY_RAW_SHA256} is pinned.`,
    );
  }
  const inventory = JSON.parse(inventoryBytes.toString('utf8')) as Recovery1ExecutionInventory;
  if (
    inventory.studyRoot !== F0X_RECOVERY_1_STUDY_ROOT ||
    inventory.control?.controlRoot !== F0X_RECOVERY_1_CONTROL_DIR
  ) {
    fail('the execution inventory is not of the Recovery-1 namespace.');
  }
  if (!inventory.totals.everyParsedRecordVerified)
    fail('the inventory holds an unverified record.');
  const manifest = inventory.studyManifest?.record ?? fail('no study manifest.');
  const terminal = inventory.studyTerminal?.record ?? fail('no study terminal.');
  if (terminal['outcome'] !== 'COMPLETED_ALL_SLOTS' || terminal['slotsCompleted'] !== 10) {
    fail(`study terminal is ${String(terminal['outcome'])}.`);
  }
  const recovery = manifest['recovery'] as Record<string, unknown> | undefined;
  if (recovery?.['overlayRawSha256'] !== F0X_RECOVERY_1_OVERLAY_RAW_SHA256)
    fail('the manifest names another overlay.');
  if (manifest['f0vFreezeRawSha256'] !== PROPOSED_F0V_FREEZE_RAW_SHA256)
    fail('the manifest names another F0V freeze.');
  if (manifest['f0vApprovalRecordRawSha256'] !== F0V_APPROVAL_RECORD_RAW_SHA256)
    fail('the manifest names another F0V approval.');
  if (manifest['f0uMethodologyRawSha256'] !== F0U_METHODOLOGY_RAW_SHA256)
    fail('the manifest names another F0U.');
  if (inventory.slots.length !== 10) fail(`the inventory holds ${inventory.slots.length} slots.`);

  const slots = inventory.slots.map(slotClosureOf);
  const perPrompt = (variantName: string) => {
    const of = slots.filter((slot) => slot.variantName === variantName);
    if (of.length !== F0V_N_PER_PROMPT) fail(`${variantName} has ${of.length} included slots.`);
    return {
      includedSlots: of.length,
      slotIds: of.map((slot) => slot.slotId),
      allTwelveEvaluationsEndedWithoutStop: of.filter(
        (slot) =>
          slot.structuralTerminalCondition === 'ALL_12_PLANNED_EVALUATIONS_ENDED_WITHOUT_STOP',
      ).length,
      experimentStoppedBeforeAllPlanned: of.filter(
        (slot) =>
          slot.structuralTerminalCondition === 'EXPERIMENT_STOPPED_BEFORE_ALL_PLANNED_EVALUATIONS',
      ).length,
      slotsWithANonTerminalProviderFailure: of
        .filter((slot) => slot.nonTerminalProviderFailures.length > 0)
        .map((slot) => slot.slotId),
    };
  };
  const stoppedSlots = slots.filter((slot) => slot.terminalStoppedEvaluation !== null);
  const events = [...inventory.studyEvents].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );

  return {
    closureId: 'PHASE_2B_2D2C_F0X_RECOVERY_1_STRUCTURAL_CLOSURE_V1',
    closureVersion: RECOVERY_1_STRUCTURAL_CLOSURE_VERSION,
    status: 'STRUCTURALLY_CLOSED_REQUEST_FREE',
    scope: 'DEVELOPMENT_ONLY',
    studyId: manifest['studyId'],
    ownerMethodologicalDecision: {
      decisionDate: '2026-09-16',
      decision: 'ALL_TEN_RECOVERY_1_SLOTS_COUNT_TOWARD_THE_FROZEN_N5_STUDY',
      includedReplicatesPerPrompt: { PROMPT_V4_CANONICAL: 5, PROMPT_V5_CANONICAL: 5 },
      stoppedSlotsNeverReplacedOrRerun: stoppedSlots.map((slot) => slot.slotId),
      basis: {
        f0vInclusionRuleClassCAction: F0V_CLASS_C_ACTION,
        f0uSection:
          'F0U §7 predeclared inclusion rule: a run that reaches a genuine terminal failure/halt is included exactly as recorded; no replacement run is substituted.',
      },
      historicalAttempt3V4AndAttempt4V5: 'PILOT_ONLY_NOT_COUNTED_TOWARD_N5',
    },
    frozenIdentities: {
      f0uMethodologyRawSha256: F0U_METHODOLOGY_RAW_SHA256,
      f0vFreezeRawSha256: PROPOSED_F0V_FREEZE_RAW_SHA256,
      f0vApprovalRecordRawSha256: F0V_APPROVAL_RECORD_RAW_SHA256,
      f0vPlanSha256: manifest['f0vPlanSha256'],
      recoveryOverlayRawSha256: F0X_RECOVERY_1_OVERLAY_RAW_SHA256,
      executionIntegrationCommit: manifest['executionIntegrationCommit'],
      studyExecutionApprovalSha256: manifest['studyExecutionApprovalSha256'],
      historicalBytesEdited: false,
    },
    study: {
      studyRoot: inventory.studyRoot,
      controlRoot: inventory.control.controlRoot,
      startedAtUtc: manifest['startedAtUtc'],
      completedAtUtc: terminal['completedAtUtc'],
      wholeStudyTree: inventory.wholeStudyTree,
      controlTree: {
        fileCount: inventory.control.fileCount,
        treeSha256: inventory.control.treeSha256,
      },
      studyManifest: {
        fileSha256: inventory.studyManifest?.fileSha256,
        recordSha256: inventory.studyManifest?.recordSha256,
      },
      studyTerminal: {
        fileSha256: inventory.studyTerminal?.fileSha256,
        recordSha256: inventory.studyTerminal?.recordSha256,
        outcome: terminal['outcome'],
        slotsCompleted: terminal['slotsCompleted'],
      },
      studyEvents: {
        count: events.length,
        fingerprintSha256: sha256Hex(events.map((e) => `${e.fileSha256}  ${e.path}\n`).join('')),
        everyRecordSha256Verified: events.every((e) => e.recordSha256Verified),
      },
    },
    inventory: {
      path: RECOVERY_1_EXECUTION_INVENTORY_PATH,
      rawSha256: RECOVERY_1_EXECUTION_INVENTORY_RAW_SHA256,
      version: inventory.inventoryVersion,
    },
    completedAllSlotsInterpretation: {
      recordedOutcome: terminal['outcome'],
      means:
        'All ten frozen slots reached a durably closed Class C terminal state, in the frozen order.',
      doesNotMean:
        'It does not mean that all 120 logical evaluations completed, nor that ten full 49-item replicates exist.',
      recordRewritten: false,
    },
    reconciledTotals: {
      method:
        'Re-derived from the preserved artifacts by the execution inventory; never copied from an operator report.',
      slots: inventory.totals.slotsPresent,
      logicalEvaluationsPlanned: inventory.totals.evaluationsPlanned,
      logicalEvaluationsStarted: inventory.totals.evaluationsStarted,
      logicalEvaluationsEndedWithoutStop: inventory.totals.evaluationsEndedWithoutStop,
      logicalEvaluationsEndedWithStop: inventory.totals.evaluationsEndedWithStop,
      logicalEvaluationsNeverStarted:
        inventory.totals.evaluationsPlanned - inventory.totals.evaluationsStarted,
      originalProviderRequests: inventory.totals.originalProviderRequests,
      repairProviderRequests: inventory.totals.repairProviderRequests,
      providerRequests: inventory.totals.providerRequests,
      adapterAttempts: inventory.totals.adapterAttempts,
      authStatusInvocations: inventory.totals.authStatusInvocations,
      originalProviderOutcomes: inventory.totals.originalOutcomes,
      tier2Outcomes: inventory.totals.tier2Outcomes,
      repairCallsByDisposition: inventory.totals.repairCallsByDisposition,
      classA: inventory.totals.classA,
      classB: inventory.totals.classB,
      classC: inventory.totals.classC,
      ambiguous: inventory.totals.ambiguous,
      durablyClosed: inventory.totals.durablyClosed,
    },
    slots,
    perPrompt: {
      PROMPT_V4_CANONICAL: perPrompt('PROMPT_V4_CANONICAL'),
      PROMPT_V5_CANONICAL: perPrompt('PROMPT_V5_CANONICAL'),
    },
    terminalFailures: {
      reportedAs: 'RELIABILITY_AND_LIVENESS_OBSERVATIONS_THAT_ARE_PART_OF_THE_STUDY_OUTCOME',
      slots: stoppedSlots.map((slot) => ({
        slotId: slot.slotId,
        variantName: slot.variantName,
        evaluationsEndedWithoutStop: slot.evaluations.endedWithoutStop,
        evaluationsStarted: slot.evaluations.started,
        terminal: slot.terminalStoppedEvaluation,
        experimentStop: slot.experimentTerminal,
      })),
    },
    structuralObservations: [
      {
        id: 'NON_TERMINAL_STRUCTURED_OUTPUT_FAILURE_INSIDE_A_COMPLETED_SLOT',
        slots: slots
          .filter((slot) => slot.nonTerminalProviderFailures.length > 0)
          .map((slot) => ({
            slotId: slot.slotId,
            structuralTerminalCondition: slot.structuralTerminalCondition,
            failures: slot.nonTerminalProviderFailures,
          })),
        statement:
          'A slot whose experiment completed all twelve planned evaluations can still hold an evaluation with no structured output. Its documents have no validator verdict, yet the evaluation ended without a stop. The frozen F0I/F0O scoring contract restates the acceptance protocol treatment below. The earlier attempt scorers never met this shape and refuse it; the replication-analysis clarification states how it is scored.',
        frozenProviderFailureTreatment: FROZEN_PROVIDER_FAILURE_TREATMENT,
        acceptanceProtocolSection5:
          'docs/evaluation/PHASE_2B_2D_SONNET_ACCEPTANCE_PROTOCOL.md §5: any structured-output failure is counted INVALID, never a missing observation.',
      },
      {
        id: 'TIER1_WALL_TIME_BEYOND_THE_FROZEN_DEADLINES',
        slots: stoppedSlots
          .filter(
            (slot) =>
              typeof slot.terminalStoppedEvaluation?.monotonicWallTimeMs === 'number' &&
              slot.terminalStoppedEvaluation.monotonicWallTimeMs > 700_000,
          )
          .map((slot) => ({ slotId: slot.slotId, terminal: slot.terminalStoppedEvaluation })),
        statement:
          'The recorded provider wall time exceeds both the frozen 300000 ms Tier-1 soft deadline and the frozen 700000 ms Tier-2 watchdog. The artifacts do not record why. The cause is UNKNOWN and is not inferred here.',
      },
    ],
    zeroScoringConfirmation: {
      goldLabelsLoaded: false,
      scoringSupplementOpened: false,
      ownerAdjudicationRecordOpened: false,
      scorerRun: false,
      classifierVerdictsParsedByThisClosure: false,
      holdoutSplitAccess: 'NONE',
      mixedLabelFileAccess: 'NONE',
    },
    evidenceModified: false,
  };
}

export type Recovery1StructuralClosure = ReturnType<typeof buildRecovery1StructuralClosure>;

const isMainModule =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const repoRoot = resolve(fileURLToPath(import.meta.url), '../../../../../..');
  const closure = buildRecovery1StructuralClosure(
    readFileSync(join(repoRoot, RECOVERY_1_EXECUTION_INVENTORY_PATH)),
  );
  process.stdout.write(`${JSON.stringify(closure, null, 2)}\n`);
}
