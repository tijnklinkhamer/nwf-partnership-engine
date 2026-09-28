/**
 * THE FIRST-WINDOW OPERATIONAL READINESS RECORD, built PURELY from committed
 * bytes. It derives - never asserts - the starting state, Q1, the prospective
 * in-memory append, the prospective five-item window, the P2/P5 thresholds,
 * P6 before and after, and every Generation-2 P7 invariant on both the
 * committed genesis ledger and the prospective post-append ledger; only then
 * does it compare the derivation against the task's expected window and STOP
 * on any difference.
 *
 * The record carries aggregates, positions and digests only - no echeRowKey,
 * organisation id, root-authority id, hostname or URL. It authorises nothing,
 * and the prospective append it describes exists in memory only.
 */

import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import {
  P6_MAX_REPLACEMENTS_BEFORE_SUCCESS_FLOOR,
  P6_SUCCESS_FLOOR,
} from '../continuationWindow/windowContract.js';
import { p6Fires } from '../generation2Freeze/freezeArtifacts.js';
import { buildReserveExecutionBinding } from './executionBinding.js';
import { evaluateGeneration2WindowGate } from './gateAdapter.js';
import { prepareGeneration2ReplacementAppend } from './ledgerAppend.js';
import {
  EXPECTED_FIRST_WINDOW,
  FIRST_WINDOW_PLANNED_SIZE,
  FREEZE_TIP_COMMIT,
  GENERATION2_ID,
  LIVE_CRITICAL_SECTION_POLICY,
  OPERATIONAL_BRANCH,
  OPERATIONAL_TASK_ID,
  OPERATIONAL_TERMINAL_STATE,
  PINNED,
  PROSPECTIVE_APPEND_RECORDED_AT_UTC,
  READINESS_RECORDED_AT_UTC,
  refuse,
} from './operationalContract.js';
import {
  GENERATION2_P7_INVARIANT_NAMES,
  computeGeneration2PreflightWithAssessment,
  type Generation2Preflight,
} from './preflight.js';
import {
  assessCommittedInputs,
  deriveGeneration2CurrentState,
  planCompleteQ1,
  type CommittedTexts,
} from './state.js';
import { buildGeneration2WindowSpec, type Generation2WindowSpec } from './windowSpec.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

export const READINESS_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_FIRST_WINDOW_OPERATIONAL_READINESS_V1.json';
export const READINESS_AUDIT_PATH =
  'docs/audits/PHASE_2B_2D_A2_GENERATION2_FIRST_WINDOW_OPERATIONAL_READINESS_V1.md';

export const NEGATIVE_PROBES = [
  'successful slot 72 re-served',
  'successful slot 74 re-served',
  'missing slot 76 obligation',
  'reversed Q1',
  'forged success count',
  'stale Generation-2 ledger',
  'Generation-1 ledger substituted for the Generation-2 ledger',
  'Generation-1 reserve 39 used as Generation-2 reserve 0',
  'reserve 1 before reserve 0',
  'P80 before P77',
  'P77 marked failed',
  'schedule entry 0 replaced by entry 1 identity',
  'altered frameEntrySha256',
  'dropped root authority',
  'reordered root authority',
  'fabricated root authority',
] as const;

export interface FirstWindowReadiness {
  readonly spec: Generation2WindowSpec;
  readonly prospectiveLedgerText: string;
  readonly preflightOnGenesis: Generation2Preflight;
  readonly preflightOnProspective: Generation2Preflight;
  readonly record: Record<string, unknown>;
}

const falseInvariants = (preflight: Generation2Preflight): string[] =>
  GENERATION2_P7_INVARIANT_NAMES.filter((name) => !preflight.invariants[name]);

export function buildFirstWindowReadiness(committed: CommittedTexts): FirstWindowReadiness {
  const assessment = assessCommittedInputs(committed);
  const basis = assessment.basis;
  if (basis === null) refuse('BASIS_NOT_EXACT', assessment.failures.join(' | '));
  const genesisText = committed.get(PINNED.genesisLedger.path)!;
  const genesis = basis.genesis;
  const before = deriveGeneration2CurrentState(basis, genesis);

  const spec = buildGeneration2WindowSpec({
    basis,
    startingLedger: genesis,
    startingLedgerFile: {
      sha256: sha256(genesisText),
      bytes: Buffer.byteLength(genesisText, 'utf8'),
    },
    plannedWindowSize: FIRST_WINDOW_PLANNED_SIZE,
  });
  const q1 = planCompleteQ1(basis, genesis);
  const append = prepareGeneration2ReplacementAppend({
    basis,
    ledger: genesis,
    assignments: q1,
    recordedAtUtc: PROSPECTIVE_APPEND_RECORDED_AT_UTC,
  });
  const prospectiveLedgerText = `${JSON.stringify(append.nextLedger, null, 2)}\n`;
  const preflight = (currentLedgerText: string): Generation2Preflight =>
    computeGeneration2PreflightWithAssessment(assessment, {
      currentLedgerText,
      startingLedgerText: genesisText,
      expectedWindowSpec: spec,
    });
  const preflightOnGenesis = preflight(genesisText);
  const preflightOnProspective = preflight(prospectiveLedgerText);
  const gateAtStart = evaluateGeneration2WindowGate({
    spec,
    preflight: preflightOnProspective,
    generation: {
      successfulOrganisationCount: before.successfulOrganisationCount,
      reserveConsumedCount: append.reserveConsumedAfter,
    },
    completed: [],
  });
  const gateOnGenesis = evaluateGeneration2WindowGate({
    spec,
    preflight: preflightOnGenesis,
    generation: {
      successfulOrganisationCount: before.successfulOrganisationCount,
      reserveConsumedCount: append.reserveConsumedBefore,
    },
    completed: [],
  });

  // Derived first; only now compared with the task's expectation.
  const derivedWindow = spec.workItems.map((item) => ({
    workItemId: item.workItemId,
    split: item.split,
  }));
  if (
    before.successfulOrganisationCount !== EXPECTED_FIRST_WINDOW.startingSuccessful ||
    canonicalStringify(before.q1) !== canonicalStringify(EXPECTED_FIRST_WINDOW.q1) ||
    canonicalStringify(derivedWindow) !== canonicalStringify(EXPECTED_FIRST_WINDOW.workItems) ||
    append.appendedEntries.length !== EXPECTED_FIRST_WINDOW.prospectiveAppendEntries ||
    append.stateAfter.nextGeneration2ReservePosition !==
      EXPECTED_FIRST_WINDOW.nextGeneration2ReserveAfterAppend
  ) {
    refuse('FIRST_WINDOW_DIFFERS', 'the derived first window is not the expected one');
  }
  if (falseInvariants(preflightOnProspective).length !== 0) {
    refuse('P7_NOT_READY', falseInvariants(preflightOnProspective).join(', '));
  }
  if (gateAtStart.decision !== 'CONTINUE_TO_NEXT_WORK_ITEM') {
    refuse('GATE_NOT_READY', gateAtStart.decision);
  }

  const reserveBindings = q1.map((assignment) => {
    const binding = buildReserveExecutionBinding(
      basis.frameIndex,
      basis.schedule,
      assignment.generation2ReserveRankPosition,
    );
    return {
      generation2ReserveRankPosition: binding.generation2ReserveRankPosition,
      sourceFrameRankPosition: binding.sourceFrameRankPosition,
      frameEntrySha256RecomputedAndEqual: true,
      echeRowKeyOrganisationIdRankHashEqual: true,
      scheduleEntrySha256: binding.scheduleEntrySha256,
      rootAuthorityCount: binding.rootAuthorityCount,
      rootAuthorityTypes: binding.rootAuthorities.map((authority) => authority.type),
      executionEntrySha256: spec.workItems.find(
        (item) => item.generation2ReserveRankPosition === assignment.generation2ReserveRankPosition,
      )!.identityDigest,
    };
  });

  const record: Record<string, unknown> = {
    recordId: 'phase2b-2d-a2-generation2-first-window-operational-readiness-v1',
    recordKind: 'GENERATION2_FIRST_WINDOW_OPERATIONAL_READINESS',
    records: 'PHASE_2B_2D_A2_GENERATION2_FIRST_WINDOW_OPERATIONAL_READINESS_V1',
    status: 'OFFLINE_READINESS',
    task: OPERATIONAL_TASK_ID,
    terminalState: OPERATIONAL_TERMINAL_STATE,
    recordedAtUtc: READINESS_RECORDED_AT_UTC,
    recordedAtUtcSource: 'date -u, read from the shell when this readiness was materialised',
    branch: OPERATIONAL_BRANCH,
    startingHead: FREEZE_TIP_COMMIT,
    generationId: GENERATION2_ID,
    publicSafe: true,
    thisFileAuthorises: [],
    isLiveAuthority: false,
    networkAuthorised: false,
    databaseAuthorised: false,
    ledgerMutationAuthorised: false,
    reserveAssigned: false,
    networkUsed: false,
    databaseRead: false,
    acquisitionRunCreated: false,
    bound: basis.bound,
    frozenHashes: spec.frozenHashes,
    whyTheFreezeAloneWasNotExecutable: [
      'the frozen reserve schedule carries identity and provenance only, never the root authorities acquisition executes against',
      'the frozen genesis ledger is a FROZEN record while the landed Generation-2 primitives are typed for the PROPOSAL shape; the freeze verified it through an intentional cast',
      'no Generation-2 append builder, window spec, P7 preflight or gate adapter existed; the Generation-1 ones are bound to METHODOLOGY_V2_GEN1, its 40 reserves and R:<slot>:<reserve> identifiers',
    ],
    committedInputChecks: assessment.checks,
    recomputedStartingState: {
      method:
        'the approved carry-forward machinery (deriveCarryForward + requireExpectedCarryForward over the committed feasibility slot records and governance bytes), then compared field by field with the frozen carry-forward baseline',
      ACQUISITION_SUCCESSFUL: before.successfulOrganisationCount,
      CURRENT_ACQUISITION_FAILURE: before.currentAcquisitionFailure,
      PENDING_CAPABILITY_REVIEW: before.pendingCapabilityReview,
      NEVER_STARTED: {
        from: before.neverStarted[0],
        to: before.neverStarted.at(-1),
        count: before.neverStarted.length,
      },
      CARRY_FORWARD_REFUSED: before.carryForwardRefused,
      accounting: before.accounting,
      generation2ReserveConsumed: before.generation2ReserveConsumed,
      nextGeneration2ReservePosition: before.nextGeneration2ReservePosition,
      q1: before.q1,
      q1Reasons: before.q1Reasons,
    },
    executionBinding: {
      rule: 'schedule entry verified at its position -> exact sourceFrameRankPosition in the frame re-ranked by the landed rankFrameAndReconcileDraw -> frameEntrySha256 recomputed and equal -> echeRowKey, organisationId and rankHash equal -> ordered root authorities parsed ONLY from that frame entry (TYPE:id, landed vocabulary, nothing dropped, reordered or re-typed)',
      digest:
        'executionEntrySha256 = sha256(canonicalStringify(binding)); the binding covers bindingKind, generationId, Generation-2 position, source frame rank, echeRowKey, organisationId, rankHash, frameHash, frameEntrySha256, scheduleEntrySha256 and the ordered root authorities',
      primaries:
        'a primary binds drawEntrySha256 of its exact original draw selection entry, cross-checked against the frame (rank, identity and ordered authorities)',
      noDatabaseNoHostnameNoUrl: true,
      reserves: reserveBindings,
    },
    operationalLedger: {
      parser:
        'parseOperationalGeneration2Ledger: exact header key set, status FROZEN, every binding pinned, header canonically equal to the frozen genesis header, entries built field by field, ledgerHash recomputed. No unchecked cast is the boundary; the landed validator and planner are consulted only after the parse, as a second opinion that must agree',
      committedLedger: {
        path: PINNED.genesisLedger.path,
        fileSha256: sha256(genesisText),
        ledgerHash: genesis.ledgerHash,
        entryCount: genesis.entries.length,
      },
      headerFlagsDescribeTheGenesisRecord:
        'the frozen header carries reserveAssigned:false and similar flags; like the Generation-1 ledger header they are immutable and describe the genesis record. Assignment is derived from entries, never from a header flag',
    },
    prospectiveAppend: {
      inMemoryOnly: true,
      persisted: false,
      recordedAtUtc: PROSPECTIVE_APPEND_RECORDED_AT_UTC,
      recordedAtUtcIsIllustrative:
        'a live authority supplies its own recordedAtUtc, so the live entry hashes and ledgerHash will differ from these by construction',
      q1RecomputedOverCompleteObligationSet: true,
      assignments: q1.map((a) => ({
        selectionIndex: a.selectionIndex,
        generation2ReserveRankPosition: a.generation2ReserveRankPosition,
        reason: a.reason,
      })),
      entries: append.appendedEntries.map((entry) => ({
        sequence: entry.sequence,
        selectionIndex: entry.selectionIndex,
        generation2ReserveRankPosition: entry.generation2ReserveRankPosition,
        split: entry.split,
        reason: entry.reason,
        replacedOccupantKind: entry.replacedOccupantKind,
        previousSequenceForSlot: entry.previousSequenceForSlot,
        previousEntryHash: entry.previousEntryHash,
        entryHash: entry.entryHash,
      })),
      previousLedgerHash: append.previousLedgerHash,
      nextLedgerHash: append.nextLedgerHash,
      entryCountBefore: append.reserveConsumedBefore,
      entryCountAfter: append.reserveConsumedAfter,
      nextGeneration2ReserveAfterAppend: append.stateAfter.nextGeneration2ReservePosition,
      stateAfter: {
        q1: append.stateAfter.q1,
        replacementAssignedAwaitingExecution:
          append.stateAfter.replacementAssignedAwaitingExecution,
        accounting: append.stateAfter.accounting,
      },
    },
    firstWindow: {
      windowSpecHash: spec.windowSpecHash,
      plannedWindowSize: spec.plannedWindowSize,
      replacementCount: spec.workItems.filter((item) => item.kind === 'REPLACEMENT').length,
      primaryCount: spec.workItems.filter((item) => item.kind === 'PRIMARY').length,
      order: spec.workItems.map((item) => item.workItemId),
      workItems: spec.workItems,
      namespace:
        'G2R:<selectionIndex>:<generation2ReserveRankPosition> and G2P:<selectionIndex>; operational identifiers only, they alter no selection or methodology',
    },
    gates: {
      P1_P6_P8:
        'the landed evaluateContinuationWindowGate, unchanged; P7 is Generation-2 specific (the Generation-1 P7 slots are delegated by name to the Generation-2 preflight)',
      p2ThresholdForPlannedSize: spec.gateThresholds.p2RobotsRefusalWindowCount,
      p5ThresholdForPlannedSize: spec.gateThresholds.p5LowRawYieldWindowCount,
      p6: {
        rule: `reserveConsumed > ${String(P6_MAX_REPLACEMENTS_BEFORE_SUCCESS_FLOOR)} AND successfulOrganisationCount < ${String(P6_SUCCESS_FLOOR)}`,
        successfulOrganisationCount: before.successfulOrganisationCount,
        generation2ReserveConsumedBefore: append.reserveConsumedBefore,
        generation2ReserveConsumedAfter: append.reserveConsumedAfter,
        firesBefore: p6Fires({
          reserveConsumedCount: append.reserveConsumedBefore,
          successfulOrganisationCount: before.successfulOrganisationCount,
        }),
        firesAfter: p6Fires({
          reserveConsumedCount: append.reserveConsumedAfter,
          successfulOrganisationCount: before.successfulOrganisationCount,
        }),
        successCountIsNeverReset: true,
      },
      p7: {
        invariantCount: GENERATION2_P7_INVARIANT_NAMES.length,
        invariants: [...GENERATION2_P7_INVARIANT_NAMES],
        onProspectivePostAppendLedger: {
          allTrue: falseInvariants(preflightOnProspective).length === 0,
          falseInvariants: falseInvariants(preflightOnProspective),
          gateDecisionWithZeroCompleted: gateAtStart.decision,
          nextWorkItemId: gateAtStart.nextWorkItemId,
        },
        onCommittedGenesisLedger: {
          allTrue: falseInvariants(preflightOnGenesis).length === 0,
          falseInvariants: falseInvariants(preflightOnGenesis),
          gateDecisionWithZeroCompleted: gateOnGenesis.decision,
          meaning:
            'the window cannot start until its Q1 append is persisted, committed and pushed before any institution network',
        },
      },
      p8: LIVE_CRITICAL_SECTION_POLICY,
    },
    negativeProbes: {
      provedBy: 'src/test/unit/orgunitCorpus2DA2Generation2FirstWindowReadiness.test.ts',
      allRefuse: true,
      probes: [...NEGATIVE_PROBES],
    },
    canonicalGeneration2Ledger: {
      path: PINNED.genesisLedger.path,
      entryCountStill: genesis.entries.length,
      mutatedByThisTask: false,
    },
    sideEffects: {
      institutionNetworkRequests: 0,
      databaseConnections: 0,
      ledgerWrites: 0,
      reserveAssignments: 0,
      strategiesCreated: 0,
      livePlansCreated: 0,
      liveAuthoritiesCreated: 0,
      acquisitionRuns: 0,
    },
    identityDisclosure:
      'aggregates, positions and digests only; no echeRowKey, organisation id, root-authority id, hostname or URL',
    nextOwnerDecision: `whether to grant EXACTLY ONE bounded five-item Generation-2 live acquisition window: ${spec.workItems.map((item) => item.workItemId).join(' -> ')}. Not granted here`,
    immutability: 'append-only. This record is never edited; a correction is a new record',
  };

  return { spec, prospectiveLedgerText, preflightOnGenesis, preflightOnProspective, record };
}
