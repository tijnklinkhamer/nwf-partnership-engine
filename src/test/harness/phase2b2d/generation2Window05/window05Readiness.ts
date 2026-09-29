/**
 * THE GENERATION-2 WINDOW-05 OFFLINE READINESS RECORD, built PURELY from
 * committed bytes through the generic adjudication-aware machinery.
 *
 * It derives - never asserts - in this order:
 *
 *   1. the explicit four-window history Window 01 -> 02 -> 03 -> 04, every
 *      record re-hashed against its pin, with Window 04 carrying its pinned
 *      owner authority-shape correction EXPLICITLY (the generic bridge
 *      validates it; nothing here reads `boundLedger` itself); no directory
 *      scan, no glob, no "latest";
 *   2. the Window-02 ruling + re-proof chain (Window-02-specific), Window 03's
 *      own clean validation and Window 04's carried-over governed validation,
 *      and the Window-04 G2P:88 operator ruling as a Window-04-only fact;
 *   3. ADJUDICATION_HISTORY_INTEGRITY over all four windows, including the
 *      generic global run-reference rule, and the proof that Window 04
 *      WITHOUT its correction still refuses;
 *   4. the replayed current state and complete Q1 - EMPTY, so no replacement
 *      append exists or is manufactured;
 *   5. the Window-05 spec by the unchanged builder (built twice, compared),
 *      its primary execution bindings, P2/P5 thresholds, P6, and frozen P7 on
 *      the current committed ledger;
 *   6. that a prospective canonical Window-05 authority carries
 *      `boundStartingLedger`, and that neither `boundLedger` nor the Window-04
 *      correction is accepted for it;
 *   7. a synthetic, in-memory Window 05 with one failed primary (-> Q1 ->
 *      reserve 5) and one with several given out of order (-> ascending Q1 ->
 *      reserves 5, 6, 7);
 *
 * and only THEN compares the derivation with the task's expectation, stopping
 * on any difference.
 *
 * Aggregates, positions and digests only: no echeRowKey, organisation id,
 * root-authority id, hostname or URL. It authorises nothing.
 */

import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import {
  P6_MAX_REPLACEMENTS_BEFORE_SUCCESS_FLOOR,
  P6_SUCCESS_FLOOR,
  type ReplacementReason,
} from '../continuationWindow/windowContract.js';
import type { Split } from '../draw/drawContract.js';
import { frameEntrySha256 } from '../generation2/reserveSchedule.js';
import { buildPrimaryExecutionBinding } from '../generation2Acquisition/executionBinding.js';
import { evaluateGeneration2WindowGate } from '../generation2Acquisition/gateAdapter.js';
import { prepareGeneration2ReplacementAppend } from '../generation2Acquisition/ledgerAppend.js';
import {
  FROZEN_P8_DEFINITION,
  GENERATION2_ID,
  Generation2OperationalRefusal,
  LIVE_CRITICAL_SECTION_POLICY,
  OPERATIONAL_BRANCH,
  refuse,
} from '../generation2Acquisition/operationalContract.js';
import {
  parseOperationalGeneration2Ledger,
  resolveCrossGenerationOccupant,
} from '../generation2Acquisition/operationalLedger.js';
import {
  GENERATION2_P7_INVARIANT_NAMES,
  computeGeneration2PreflightWithAssessment,
  type Generation2Preflight,
} from '../generation2Acquisition/preflight.js';
import {
  assessCommittedInputs,
  deriveGeneration2CurrentState,
  planCompleteQ1,
  type CommittedTexts,
  type Generation2CurrentState,
} from '../generation2Acquisition/state.js';
import {
  buildGeneration2WindowSpec,
  recomputeWindowSpecHash,
  type Generation2WindowSpec,
} from '../generation2Acquisition/windowSpec.js';
import { p6Fires } from '../generation2Freeze/freezeArtifacts.js';
import {
  APPROVED_AUTHORITY_SHAPE_CORRECTIONS,
  HISTORY_BRIDGE_VERSION,
  bySplitOf,
  historyBindingOf,
  replayGeneration2History,
  type CommittedRecordBinding,
  type Generation2AdjudicationHistory,
  type Generation2WindowHistoryBinding,
} from '../generation2History/adjudicationHistory.js';
import {
  ADJUDICATION_HISTORY_INTEGRITY,
  GLOBAL_RUN_REFERENCE_UNIQUENESS_RULE,
  assessAdjudicationHistoryIntegrity,
} from '../generation2History/historyIntegrity.js';
import {
  sealRecord,
  synthesiseAdjudicatedWindow,
} from '../generation2Window03/synthesiseWindow.js';
import { WINDOW02_P5_OWNER_RULING } from '../generation2Window03/window03Contract.js';
import { verifyWindow02ValidationChain } from '../generation2Window03/window03Readiness.js';
import {
  fourWindowHistory,
  type Window04ClosureInputs,
} from '../generation2Window04/window04Closure.js';
import {
  syntheticWindow04Failure as syntheticWindowFailure,
  verifyWindow03Validation,
} from '../generation2Window04/window04Readiness.js';
import {
  EXPECTED_WINDOW_05,
  WINDOW05_CURRENT_LEDGER_REVISION,
  WINDOW05_PLANNED_SIZE,
  WINDOW05_READINESS_OWNER_DECISION,
  WINDOW05_READINESS_RECORDED_AT_UTC,
  WINDOW05_READINESS_STARTING_HEAD,
  WINDOW05_READINESS_TASK_ID,
  WINDOW05_READINESS_TERMINAL_STATE,
  WINDOW05_W01_PINS,
  WINDOW05_W02_PINS,
  WINDOW05_W02_VALIDATION_CHAIN,
  WINDOW05_W03_PINS,
  WINDOW05_W04_PINS,
} from './window05Contract.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const bytesOf = (text: string): number => Buffer.byteLength(text, 'utf8');
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const WINDOW05_CORRECTION_ATTACKS = [
  'Window 04 supplied without its approved correction',
  'wrong correction hash',
  'wrong authority commit',
  'wrong authority SHA',
  'wrong spec hash',
  'correction attached to Window 01',
  'correction attached to Window 02',
  'correction attached to Window 03',
  'correction attached to prospective Window 05',
  'future authority with only boundLedger',
  'correction mapping another field',
  'correction containing extra override keys',
  'correction widening invocation limits',
  'correction changing work items',
  'correction changing starting ledger',
  'correction changing spec hash',
] as const;

export const WINDOW05_HISTORY_ATTACKS = [
  'missing Window 01',
  'missing intermediate window',
  'reordered windows',
  'duplicated window ordinal',
  'edited historical authority',
  'edited LIVE_RESULT',
  'edited adjudication',
  'mismatched starting ledger',
  'mismatched rebuilt spec',
  'duplicate run ref within a window',
  'duplicate run ref across windows',
  'Window-02 validation-chain tampering',
  'reuse of the Window-02 P5 ruling outside Window 02',
  'Window-04 G2P:88 ruling generalised to Window 05',
] as const;

export const WINDOW05_STATE_ATTACKS = [
  'fake Q1 when Q1 is empty',
  'reserve 5 assigned despite empty Q1',
  'G2P:91 repeated / G2P:97 substituted',
  'G2P:92-G2P:96 reordered',
  'wrong split',
  'wrong execution identity',
  'wrong starting ledger revision for Window 05',
  'altered P2 threshold',
  'altered P5 threshold',
  'altered P6 semantics',
  'frozen P7 changed',
] as const;

// ---------------------------------------------------------------------------
// The explicit four-window history.
// ---------------------------------------------------------------------------

export interface Window05Inputs {
  /** Committed JSON by path; the genesis path carries the GENESIS revision's bytes. */
  readonly committed: CommittedTexts;
  /** The canonical ledger's current committed bytes. */
  readonly currentLedgerText: string;
  /** Windows 01, 02, 03 and 04's starting revisions, in that order. */
  readonly startingLedgerTexts: readonly [string, string, string, string];
  /** `git show <Window-04 authority commit>:<its path>`. */
  readonly window04AuthorityTextAtCommit: string;
  /** Committed audit bytes by path (the Window-02 stop and closure audits). */
  readonly auditTexts: ReadonlyMap<string, string>;
}

const closureInputs = (inputs: Window05Inputs): Window04ClosureInputs => ({
  committed: inputs.committed,
  currentLedgerText: inputs.currentLedgerText,
  startingLedgerTexts: inputs.startingLedgerTexts,
  authorityTextAtCommit: inputs.window04AuthorityTextAtCommit,
});

/** The committed Window-04 adjudication, re-hashed against its pin. */
export function window04AdjudicationBinding(committed: CommittedTexts): CommittedRecordBinding {
  const pin = WINDOW05_W04_PINS.adjudication;
  const text = committed.get(pin.path);
  if (text === undefined || sha256(text) !== pin.sha256 || bytesOf(text) !== pin.bytes) {
    refuse('HISTORY_BINDING_NOT_PINNED', `${pin.path} is not the pinned committed record`);
  }
  return { path: pin.path, sha256: pin.sha256, text };
}

/**
 * Window 01 -> 02 -> 03 -> 04 from committed bytes, each re-hashed against its
 * pin, Window 04 carrying its correction explicitly. `withCorrection: false`
 * is the ORIGINAL, uncorrected shape, kept so its refusal stays provable.
 */
export function fourWindowHistoryForWindow05(
  inputs: Window05Inputs,
  options: { readonly withCorrection: boolean } = { withCorrection: true },
): Generation2AdjudicationHistory {
  return fourWindowHistory(
    closureInputs(inputs),
    window04AdjudicationBinding(inputs.committed),
    options,
  );
}

const obj = (value: unknown): Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {};

/**
 * Window 04 was adjudicated on its one governed validation, carried over
 * under the owner ruling; it did not reuse the Window-02 P5 ruling, and its
 * G2P:88 operator ruling is scoped to Window 04 and is not a precedent.
 */
export function verifyWindow04Adjudication(adjudicationText: string): Json {
  const adjudication = obj(JSON.parse(adjudicationText) as unknown);
  const validation = obj(adjudication.validation);
  const p5 = obj(adjudication.p5);
  const anomaly = obj(adjudication.operatorExecutionChannelAnomaly);
  const correction = obj(obj(adjudication.bound).authorityShapeCorrection);
  const pins = WINDOW05_W04_PINS;
  if (
    adjudication.terminalState !== pins.adjudication.terminalState ||
    validation.exitCode !== pins.validation.exitCode ||
    validation.runs !== pins.validation.runs ||
    validation.exclusivityVerdict !== pins.validation.exclusivityVerdict ||
    validation.result !== pins.validation.result ||
    validation.ownerRuling !== pins.ownerRulings.validationCarryOver ||
    p5.window02RulingNotReused !== true ||
    correction.sha256 !== pins.correction.sha256 ||
    correction.commit !== pins.correction.commit
  ) {
    refuse('WINDOW_04_VALIDATION_NOT_ACCEPTED', 'the Window-04 adjudication is not the pinned one');
  }
  if (
    anomaly.item !== 'G2P:88' ||
    anomaly.ownerRuling !== pins.ownerRulings.g2p88 ||
    !/^Window-04-specific; not a precedent$/.test(String(anomaly.ownerRulingScope)) ||
    anomaly.evidenceInvalidated !== false ||
    anomaly.isP8 !== false
  ) {
    refuse('WINDOW_04_OPERATOR_RULING_NOT_SCOPED', 'the G2P:88 ruling is not Window-04-scoped');
  }
  return {
    exitCode: validation.exitCode,
    runs: validation.runs,
    exclusivityVerdict: validation.exclusivityVerdict,
    result: validation.result,
    carriedOverUnder: validation.ownerRuling,
    p5Fired: p5.fired,
    window02P5RulingReused: false,
    g2p88OperatorRuling: {
      ownerRuling: anomaly.ownerRuling,
      scope: anomaly.ownerRulingScope,
      window04Only: true,
      inheritedByWindow05: false,
    },
  };
}

function refusalCode(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof Generation2OperationalRefusal) return error.code;
    throw error;
  }
  return 'NO_REFUSAL';
}

// ---------------------------------------------------------------------------
// The readiness.
// ---------------------------------------------------------------------------

export interface Window05Readiness {
  readonly history: Generation2AdjudicationHistory;
  readonly state: Generation2CurrentState;
  readonly spec: Generation2WindowSpec;
  readonly preflight: Generation2Preflight;
  readonly record: Record<string, unknown>;
}

const falseInvariants = (preflight: Generation2Preflight): string[] =>
  GENERATION2_P7_INVARIANT_NAMES.filter((name) => !preflight.invariants[name]);

const range = (indices: readonly number[]) => ({
  from: indices[0] ?? null,
  to: indices.at(-1) ?? null,
  count: indices.length,
});

export function buildWindow05Readiness(inputs: Window05Inputs): Window05Readiness {
  const { committed, currentLedgerText } = inputs;
  const assessment = assessCommittedInputs(committed);
  const basis = assessment.basis;
  if (basis === null) refuse('BASIS_NOT_EXACT', assessment.failures.join(' | '));
  if (
    sha256(currentLedgerText) !== WINDOW05_CURRENT_LEDGER_REVISION.fileSha256 ||
    bytesOf(currentLedgerText) !== WINDOW05_CURRENT_LEDGER_REVISION.bytes
  ) {
    refuse(
      'CURRENT_LEDGER_NOT_CANONICAL',
      'the current ledger is not the pinned five-entry revision',
    );
  }
  const current = parseOperationalGeneration2Ledger(
    JSON.parse(currentLedgerText) as unknown,
    basis.genesis,
  );

  // 1. Explicit history, Window 04 with its explicit correction.
  const history = fourWindowHistoryForWindow05(inputs);
  const uncorrected = fourWindowHistoryForWindow05(inputs, { withCorrection: false });
  const [, w02Binding, w03Binding, w04Binding] = history.windows as [
    Generation2WindowHistoryBinding,
    Generation2WindowHistoryBinding,
    Generation2WindowHistoryBinding,
    Generation2WindowHistoryBinding,
  ];
  const w02Authority = JSON.parse(w02Binding.authority.text) as { exactOrder: string[] };
  const w04Authority = JSON.parse(w04Binding.authority.text) as Json;
  const correctionRecord = JSON.parse(w04Binding.authorityShapeCorrection!.record.text) as Json;

  // 2. Validation chains and the Window-04-only operator ruling.
  const chain = verifyWindow02ValidationChain(
    new Map<string, string>([...committed, ...inputs.auditTexts]),
    w02Authority.exactOrder.at(-1)!,
  );
  const window03Validation = verifyWindow03Validation(w03Binding.adjudication.text);
  const window04Validation = verifyWindow04Adjudication(w04Binding.adjudication.text);

  // 3. History integrity (operational prerequisite, not P7); the uncorrected history must refuse.
  const integrity = assessAdjudicationHistoryIntegrity(basis, current, history);
  if (!integrity.holds || integrity.replay === null) {
    refuse('ADJUDICATION_HISTORY_INTEGRITY', integrity.failures.join(' | '));
  }
  const replay = integrity.replay;
  const runRefs = integrity.historicalRunReferences;
  const uncorrectedIntegrity = assessAdjudicationHistoryIntegrity(basis, current, uncorrected);
  const uncorrectedRefusal = refusalCode(() =>
    replayGeneration2History(basis, current, uncorrected),
  );

  // 4. The replayed state and complete Q1; an empty Q1 has nothing to append.
  const state = deriveGeneration2CurrentState(basis, current, history);
  const q1 = planCompleteQ1(basis, current, history);
  const appendRefusal = refusalCode(() =>
    prepareGeneration2ReplacementAppend({
      basis,
      ledger: current,
      assignments: q1,
      recordedAtUtc: WINDOW05_READINESS_RECORDED_AT_UTC,
      history,
    }),
  );

  // 5. The spec, built twice by the unchanged builder, and P7 on the current ledger.
  const buildSpec = () =>
    buildGeneration2WindowSpec({
      basis,
      startingLedger: current,
      startingLedgerFile: { sha256: sha256(currentLedgerText), bytes: bytesOf(currentLedgerText) },
      plannedWindowSize: WINDOW05_PLANNED_SIZE,
      history,
    });
  const spec = buildSpec();
  const rebuiltSpec = buildSpec();
  const specRebuildIdentical =
    canonicalStringify(spec) === canonicalStringify(rebuiltSpec) &&
    rebuiltSpec.windowSpecHash === spec.windowSpecHash &&
    recomputeWindowSpecHash(spec) === spec.windowSpecHash;

  const preflight = computeGeneration2PreflightWithAssessment(assessment, {
    currentLedgerText,
    startingLedgerText: currentLedgerText,
    expectedWindowSpec: spec,
    adjudicationHistory: history,
  });
  const gateAtStart = evaluateGeneration2WindowGate({
    spec,
    preflight,
    generation: {
      successfulOrganisationCount: state.successfulOrganisationCount,
      reserveConsumedCount: state.generation2ReserveConsumed,
    },
    completed: [],
  });

  const executionBindings = spec.workItems.map((item) => {
    if (item.kind !== 'PRIMARY') {
      refuse('WINDOW_05_NOT_PRIMARIES_ONLY', `${item.workItemId} is not a primary`);
    }
    const binding = buildPrimaryExecutionBinding(basis.frameIndex, basis.draw, item.selectionIndex);
    const ranked = basis.frameIndex.ranked[item.selectionIndex]!;
    const slot = basis.draw.selection[item.selectionIndex]!;
    return {
      workItemId: item.workItemId,
      kind: item.kind,
      source: 'exact frozen original draw selection entry, cross-checked against the frozen frame',
      selectionIndex: binding.selectionIndex,
      selectionIndexExact:
        binding.selectionIndex === item.selectionIndex &&
        slot.selectionIndex === item.selectionIndex,
      frameRankPosition: ranked.rankPosition,
      split: binding.split,
      splitExact: binding.split === slot.split && binding.split === item.split,
      identityEqualsDrawAndFrame:
        binding.echeRowKey === slot.echeRowKey &&
        binding.echeRowKey === ranked.echeRowKey &&
        binding.organisationId === slot.organisationId &&
        binding.organisationId === ranked.organisationId &&
        binding.rankHash === slot.rankHash &&
        binding.rankHash === ranked.rankHash,
      frameEntrySha256: frameEntrySha256(basis.frameIndex.rawByEcheRowKey.get(ranked.echeRowKey)!),
      rootAuthorityCount: binding.rootAuthorityCount,
      rootAuthorityCountEqualsSpec: binding.rootAuthorityCount === item.rootAuthorityCount,
      rootAuthorityTypes: binding.rootAuthorities.map((authority) => authority.type),
      rootAuthoritiesFromExactFrameEntryInOrder: true,
      identityDigestKind: item.identityDigestKind,
      drawEntrySha256: binding.drawEntrySha256,
      identityDigest: binding.drawEntrySha256,
      equalsSpecIdentityDigest: binding.drawEntrySha256 === item.identityDigest,
    };
  });

  // 7. Synthetic Window-05 failures: one failed primary, then several given out of order.
  const single = EXPECTED_WINDOW_05.syntheticSingleFailure;
  const firstPrimary = spec.workItems[0]!;
  const singleFailure = syntheticWindowFailure({
    basis,
    history,
    current,
    currentLedgerText,
    spec,
    verdicts: { [firstPrimary.selectionIndex]: 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE' },
    runRefSeed: 'window-05-readiness-single-primary-failure',
  });
  const occupantBefore = resolveCrossGenerationOccupant(
    basis,
    current,
    firstPrimary.selectionIndex,
  );
  const multiSlots = [spec.workItems[4]!, spec.workItems[0]!, spec.workItems[2]!].map(
    (item) => item.selectionIndex,
  );
  const multipleFailure = syntheticWindowFailure({
    basis,
    history,
    current,
    currentLedgerText,
    spec,
    verdicts: Object.fromEntries(
      multiSlots.map((slot, k) => [
        slot,
        k === 1
          ? 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET'
          : 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE',
      ]),
    ) as Record<number, ReplacementReason>,
    runRefSeed: 'window-05-readiness-multiple-primary-failure',
  });

  // 6. The prospective Window-05 authority shape: canonical only, no alias, no inherited correction.
  const prospectiveWindow = synthesiseAdjudicatedWindow({
    basis,
    priorHistory: history,
    startingLedgerText: currentLedgerText,
    prospectiveLedgerText: currentLedgerText,
    spec,
    verdicts: {},
    runRefSeed: 'window-05-readiness-prospective-authority-shape',
  });
  const prospective = prospectiveWindow.history.windows[4]!;
  const prospectiveAuthority = JSON.parse(prospective.authority.text) as Json;
  const aliased = {
    ...prospectiveAuthority,
    boundLedger: prospectiveAuthority.boundStartingLedger,
  };
  delete (aliased as Json).boundStartingLedger;
  const withAliasOnly: Generation2AdjudicationHistory = {
    windows: [
      ...history.windows,
      { ...prospective, authority: sealRecord(prospective.authority.path, aliased) },
    ],
  };
  const withInheritedCorrection: Generation2AdjudicationHistory = {
    windows: [
      ...history.windows,
      { ...prospective, authorityShapeCorrection: w04Binding.authorityShapeCorrection! },
    ],
  };
  const prospectiveShape = {
    canonicalFieldPresent: Object.hasOwn(prospectiveAuthority, 'boundStartingLedger'),
    aliasFieldPresent: Object.hasOwn(prospectiveAuthority, 'boundLedger'),
    canonicalReplays: refusalCode(() =>
      replayGeneration2History(basis, prospectiveWindow.ledger, prospectiveWindow.history),
    ),
    aliasOnlyRefusal: refusalCode(() =>
      replayGeneration2History(basis, prospectiveWindow.ledger, withAliasOnly),
    ),
    inheritedWindow04CorrectionRefusal: refusalCode(() =>
      replayGeneration2History(basis, prospectiveWindow.ledger, withInheritedCorrection),
    ),
  };

  const composition = Object.fromEntries(
    (['DEV_TRAIN', 'DEV_CONFIRM', 'FINAL_HOLDOUT'] as const).map((split: Split) => [
      split,
      spec.workItems.filter((item) => item.split === split).length,
    ]),
  );
  const window04 = replay.windows[3]!;
  const successfulBySplit = bySplitOf(basis, state.acquisitionSuccessful);
  const reserveConsumed = state.generation2ReserveConsumed;
  const p6 = p6Fires({
    reserveConsumedCount: reserveConsumed,
    successfulOrganisationCount: state.successfulOrganisationCount,
  });
  const replacements = spec.workItems.filter((item) => item.kind === 'REPLACEMENT').length;
  const correctionBlock = obj(correctionRecord.authorityShapeCorrection);
  const correctedWindows = historyBindingOf(replay).windows.map(
    (window) => 'authorityShapeCorrection' in window,
  );

  // Derived first; only now compared with the task's expectation.
  const expected = EXPECTED_WINDOW_05;
  const differences: string[] = [];
  const expect = (name: string, derived: unknown, wanted: unknown): void => {
    if (canonicalStringify(derived) !== canonicalStringify(wanted)) differences.push(name);
  };
  expect('history window count', replay.windows.length, 4);
  expect(
    'history ordinals',
    history.windows.map((w) => w.windowOrdinal),
    [1, 2, 3, 4],
  );
  expect('consumed ledger entries', replay.consumedLedgerEntryCount, 5);
  expect(
    'rebuilt spec hashes',
    integrity.rebuiltWindowSpecHashes,
    expected.rebuiltWindowSpecHashes,
  );
  expect(
    'rebuilt equals authority-bound',
    replay.windows.map((w) => w.windowSpecHash),
    expected.rebuiltWindowSpecHashes,
  );
  expect(
    'window-04 outcomes',
    window04.executed.map((item) => [item.workItemId, item.verdict, item.q3Reason]),
    expected.window04Outcomes,
  );
  expect('historical run references', runRefs.length, expected.historicalRunReferenceCount);
  expect('historical run references unique', new Set(runRefs).size, runRefs.length);
  expect(
    'run references per window',
    replay.windows.map((w) => w.executed.length),
    expected.runReferencesPerWindow,
  );
  expect('correction recorded on window 4 only', correctedWindows, [false, false, false, true]);
  expect('uncorrected window 04 refuses', uncorrectedRefusal, 'HISTORY_RECORD_SHAPE');
  expect('uncorrected integrity fails', uncorrectedIntegrity.holds, false);
  expect(
    'w04 authority has no canonical field',
    Object.hasOwn(w04Authority, 'boundStartingLedger'),
    false,
  );
  expect('one approved correction', APPROVED_AUTHORITY_SHAPE_CORRECTIONS.length, 1);
  expect(
    'approved correction pinned to window 4',
    APPROVED_AUTHORITY_SHAPE_CORRECTIONS[0]?.windowOrdinal,
    4,
  );
  expect(
    'approved correction pinned to the authority',
    APPROVED_AUTHORITY_SHAPE_CORRECTIONS[0]?.authoritySha256,
    WINDOW05_W04_PINS.authority.sha256,
  );
  expect(
    'correction maps boundLedger only',
    [correctionBlock.sourceField, correctionBlock.canonicalField],
    ['boundLedger', 'boundStartingLedger'],
  );
  expect(
    'correction grants nothing',
    [correctionRecord.isLiveAuthority, correctionRecord.thisFileAuthorises],
    [false, []],
  );
  expect(
    'correction binds the spec',
    correctionRecord.boundWindowSpecHash,
    WINDOW05_W04_PINS.windowSpecHash,
  );
  expect('prospective shape', prospectiveShape, {
    canonicalFieldPresent: true,
    aliasFieldPresent: false,
    canonicalReplays: 'NO_REFUSAL',
    aliasOnlyRefusal: 'HISTORY_RECORD_SHAPE',
    inheritedWindow04CorrectionRefusal: 'HISTORY_AUTHORITY_SHAPE_CORRECTION_KIND',
  });
  expect('successful', state.successfulOrganisationCount, expected.currentState.successful);
  expect('successful by split', successfulBySplit, expected.currentState.successfulBySplit);
  expect('failures', state.currentAcquisitionFailure, expected.currentState.failures);
  expect('assigned', state.replacementAssignedAwaitingExecution, expected.currentState.assigned);
  expect('pending', state.pendingCapabilityReview, expected.currentState.pending);
  expect('refused', state.carryForwardRefused, expected.currentState.refused);
  expect('never-started', range(state.neverStarted), expected.currentState.neverStarted);
  expect('accounting', state.accounting, expected.currentState.accounting);
  expect('q1 state', state.q1, expected.currentState.q1);
  expect('q1 planner', q1, expected.currentState.q1);
  expect('ledger entry count', state.ledgerEntryCount, expected.currentState.ledgerEntryCount);
  expect('ledger hash', state.ledgerHash, WINDOW05_CURRENT_LEDGER_REVISION.ledgerHash);
  expect(
    'next reserve',
    state.nextGeneration2ReservePosition,
    expected.currentState.nextGeneration2Reserve,
  );
  expect('empty Q1 has nothing to append', appendRefusal, 'NOTHING_TO_APPEND');
  expect(
    'window-05 items',
    spec.workItems.map((item) => ({ workItemId: item.workItemId, split: item.split })),
    expected.workItems,
  );
  expect(
    'splits from the frozen draw',
    spec.workItems.map((item) => basis.draw.selection[item.selectionIndex]!.split),
    expected.workItems.map((item) => item.split),
  );
  expect('composition', composition, expected.composition);
  expect('replacement items', replacements, expected.replacementItems);
  expect('primary items', spec.workItems.length - replacements, expected.primaryItems);
  expect('spec planned append', spec.plannedReplacementAppend, expected.plannedReplacementAppend);
  expect('spec rebuild identical', specRebuildIdentical, true);
  expect('p2', spec.gateThresholds.p2RobotsRefusalWindowCount, expected.p2Threshold);
  expect('p5', spec.gateThresholds.p5LowRawYieldWindowCount, expected.p5Threshold);
  expect(
    'p6',
    {
      reserveConsumed,
      successfulOrganisationCount: state.successfulOrganisationCount,
      fires: p6,
    },
    expected.p6,
  );
  expect(
    'identity bindings',
    executionBindings.every(
      (b) =>
        b.equalsSpecIdentityDigest &&
        b.identityEqualsDrawAndFrame &&
        b.selectionIndexExact &&
        b.splitExact &&
        b.rootAuthorityCountEqualsSpec,
    ),
    true,
  );
  expect('current ledger P7 misses', falseInvariants(preflight), []);
  expect(
    'preflight history integrity',
    preflight.operationalPrerequisites.adjudicationHistoryIntegrity,
    true,
  );
  expect('gate at start', gateAtStart.decision, 'CONTINUE_TO_NEXT_WORK_ITEM');
  expect('next work item', gateAtStart.nextWorkItemId, expected.nextWorkItemId);
  expect('single failure integrity', singleFailure.integrityHolds, true);
  expect('single failure item', firstPrimary.workItemId, single.failedWorkItemId);
  expect('single failure state', singleFailure.state.currentAcquisitionFailure, [
    firstPrimary.selectionIndex,
  ]);
  expect('single failure q1', singleFailure.q1, single.q1);
  expect(
    'single failure projection',
    singleFailure.projectedEntries.map((e) => [
      e.sequence,
      e.selectionIndex,
      e.generation2ReserveRankPosition,
      e.replacedOccupantKind,
      e.previousSequenceForSlot,
    ]),
    [[5, 92, 5, occupantBefore.kind, occupantBefore.generation2LedgerSequence]],
  );
  expect(
    'multiple failure supplied order',
    multiSlots,
    expected.syntheticMultipleFailure.suppliedOrder,
  );
  expect('multiple failure integrity', multipleFailure.integrityHolds, true);
  expect(
    'multiple failure q1 ascending',
    multipleFailure.q1.map((a) => a.selectionIndex),
    expected.syntheticMultipleFailure.failedSlots,
  );
  expect(
    'multiple failure reserves monotone',
    multipleFailure.q1.map((a) => a.generation2ReserveRankPosition),
    expected.syntheticMultipleFailure.reservePositions,
  );
  expect(
    'multiple failure projection',
    multipleFailure.projectedEntries.map((e) => [
      e.sequence,
      e.selectionIndex,
      e.generation2ReserveRankPosition,
    ]),
    expected.syntheticMultipleFailure.failedSlots.map((slot, k) => [
      5 + k,
      slot,
      expected.syntheticMultipleFailure.reservePositions[k],
    ]),
  );
  expect(
    'canonical ledger untouched by synthetic proofs',
    [
      singleFailure.canonicalEntryCountAfter,
      multipleFailure.canonicalEntryCountAfter,
      current.entries.length,
    ],
    [5, 5, 5],
  );
  if (differences.length !== 0) {
    refuse(
      'WINDOW_05_DIFFERS',
      `the derived Window 05 differs from the expectation at ${differences.join(', ')}`,
    );
  }

  const trueCount = GENERATION2_P7_INVARIANT_NAMES.length - falseInvariants(preflight).length;
  const record: Record<string, unknown> = {
    recordId: 'phase2b-2d-a2-generation2-window-05-offline-readiness-v1',
    recordKind: 'GENERATION2_WINDOW_OFFLINE_READINESS',
    records: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_05_OFFLINE_READINESS_V1',
    status: 'OFFLINE_READINESS',
    task: WINDOW05_READINESS_TASK_ID,
    ownerDecision: WINDOW05_READINESS_OWNER_DECISION,
    terminalState: WINDOW05_READINESS_TERMINAL_STATE,
    recordedAtUtc: WINDOW05_READINESS_RECORDED_AT_UTC,
    recordedAtUtcSource: 'date -u, read from the shell when this readiness was built',
    branch: OPERATIONAL_BRANCH,
    startingHead: WINDOW05_READINESS_STARTING_HEAD,
    generationId: GENERATION2_ID,
    publicSafe: true,
    thisFileAuthorises: [],
    isLiveAuthority: false,
    networkAuthorised: false,
    databaseAuthorised: false,
    ledgerMutationAuthorised: false,
    reserveAssignmentAuthorised: false,
    reserveAssigned: false,
    networkUsed: false,
    databaseUsed: false,
    ledgerMutated: false,
    acquisitionRunCreated: false,
    bound: {
      frozenMethodologyV3AuthorityChain: basis.bound,
      frozenHashes: spec.frozenHashes,
      currentGeneration2Ledger: {
        ...WINDOW05_CURRENT_LEDGER_REVISION,
        nextGeneration2ReservePosition: state.nextGeneration2ReservePosition,
      },
      window01: {
        authority: WINDOW05_W01_PINS.authority,
        liveResult: WINDOW05_W01_PINS.liveResult,
        adjudication: WINDOW05_W01_PINS.adjudication,
        startingLedgerRevisionCommit: WINDOW05_W01_PINS.startingLedgerRevisionCommit,
        startingLedgerFileSha256: replay.windows[0]!.startingLedger.fileSha256,
      },
      window02: {
        offlineReadiness: WINDOW05_W02_PINS.offlineReadiness,
        authority: WINDOW05_W02_PINS.authority,
        ledgerAppendCommit: WINDOW05_W02_PINS.ledgerAppendCommit,
        liveResult: WINDOW05_W02_PINS.liveResult,
        adjudication: WINDOW05_W02_PINS.adjudication,
        startingLedgerRevisionCommit: WINDOW05_W02_PINS.startingLedgerRevisionCommit,
        startingLedgerFileSha256: replay.windows[1]!.startingLedger.fileSha256,
      },
      window03: {
        offlineReadiness: WINDOW05_W03_PINS.offlineReadiness,
        authority: WINDOW05_W03_PINS.authority,
        ledgerAppendCommit: WINDOW05_W03_PINS.ledgerAppendCommit,
        liveResult: WINDOW05_W03_PINS.liveResult,
        adjudication: WINDOW05_W03_PINS.adjudication,
        startingLedgerRevisionCommit: WINDOW05_W03_PINS.startingLedgerRevisionCommit,
        startingLedgerFileSha256: replay.windows[2]!.startingLedger.fileSha256,
      },
      window04: {
        offlineReadiness: WINDOW05_W04_PINS.offlineReadiness,
        authority: WINDOW05_W04_PINS.authority,
        liveResult: WINDOW05_W04_PINS.liveResult,
        stopAudit: WINDOW05_W04_PINS.stopAudit,
        authorityShapeCorrection: WINDOW05_W04_PINS.correction,
        adjudication: WINDOW05_W04_PINS.adjudication,
        noLedgerAppend: 'Q1 was empty; Window 04 ran against the unchanged five-entry revision',
        startingLedgerRevisionCommit: WINDOW05_W04_PINS.startingLedgerRevisionCommit,
        startingLedgerFileSha256: window04.startingLedger.fileSha256,
      },
      window02ValidationChain: {
        originalValidation: {
          recordedIn: WINDOW05_W02_VALIDATION_CHAIN.stopAudit,
          formalVerdict: chain.originalValidationVerdict,
          reclassified: chain.originalValidationReclassified,
        },
        ownerRuling: WINDOW05_W02_VALIDATION_CHAIN.ownerRuling,
        ownerRulingDecisions: chain.ownerRulingDecisions,
        reproof: WINDOW05_W02_VALIDATION_CHAIN.reproof,
        reproofExitCode: chain.reproofExitCode,
        closureAudit: WINDOW05_W02_VALIDATION_CHAIN.closureAudit,
        adjudicationValidationResult: chain.adjudicationValidationResult,
        adjudicationPermittedOnlyThroughRulingAndReproof: true,
        window02P5Ruling: WINDOW02_P5_OWNER_RULING,
        window02P5RulingIsWindow02Specific: true,
        window02P5RulingReusedForAnyLaterWindow: false,
      },
      window03Validation,
      window04Validation,
      genericHistoryIntegrity: {
        version: HISTORY_BRIDGE_VERSION,
        implementation: [
          'src/test/harness/phase2b2d/generation2History/adjudicationHistory.ts',
          'src/test/harness/phase2b2d/generation2History/historyIntegrity.ts',
        ],
        globalRunReferenceRule: GLOBAL_RUN_REFERENCE_UNIQUENESS_RULE,
        enforcedBy:
          'assessAdjudicationHistoryIntegrity itself (requireUniqueHistoricalRunReferences over the replay), before it may return holds: true; no window-specific substitute',
        modifiedByThisTask: false,
      },
      derivedWindow05SpecHash: spec.windowSpecHash,
    },
    window04AuthorityShapeCorrection: {
      record: WINDOW05_W04_PINS.correction,
      authority: WINDOW05_W04_PINS.authority,
      boundWindowSpecHash: correctionRecord.boundWindowSpecHash,
      ownerRuling: correctionBlock.ownerRuling,
      mapping: { from: correctionBlock.sourceField, to: correctionBlock.canonicalField },
      sourceValueCanonicalSha256: correctionBlock.sourceValueCanonicalSha256,
      scope: correctionBlock.scope,
      valuesAltered: correctionBlock.valuesAltered,
      otherFieldsRemapped: correctionBlock.otherFieldsRemapped,
      grantsAuthority: false,
      thisFileAuthorises: correctionRecord.thisFileAuthorises,
      bridgeCommit: WINDOW05_W04_PINS.bridgeCommit,
      approvedCorrectionsInTheBridge: APPROVED_AUTHORITY_SHAPE_CORRECTIONS.length,
      suppliedExplicitlyWithWindow04Only: true,
      recordedOnReplayedWindows: correctedWindows,
      validatedBy:
        'the generic history bridge (validateAuthorityShapeCorrection), not this readiness',
      withoutCorrection: {
        replayRefusal: uncorrectedRefusal,
        integrityHolds: uncorrectedIntegrity.holds,
      },
      historicalCompatibilityOnly: true,
      futureWindowFallback: false,
    },
    prospectiveWindow05AuthorityShape: {
      requiredStartingLedgerField: 'boundStartingLedger',
      forbiddenField: 'boundLedger',
      provedOn: 'a synthetic, in-memory Window-05 authority built by the landed synthesiser',
      canonicalFieldPresent: prospectiveShape.canonicalFieldPresent,
      aliasFieldPresent: prospectiveShape.aliasFieldPresent,
      canonicalShapeReplays: prospectiveShape.canonicalReplays === 'NO_REFUSAL',
      aliasOnlyShapeRefusal: prospectiveShape.aliasOnlyRefusal,
      window04CorrectionAttachedRefusal: prospectiveShape.inheritedWindow04CorrectionRefusal,
      window04TypoPropagated: false,
    },
    adjudicationHistory: {
      explicitOrderedBindingsOnly: true,
      directoryDiscovery: false,
      order: ['Window 01', 'Window 02', 'Window 03', 'Window 04'],
      binding: historyBindingOf(replay),
      windows: replay.windows.map((window) => ({
        windowOrdinal: window.windowOrdinal,
        windowSpecHash: window.windowSpecHash,
        startingLedger: window.startingLedger,
        consumedLedgerSequences: window.consumedLedgerSequences,
        ledgerHashAfterAppend: window.ledgerHashAfterAppend,
        items: window.executed.map((item) => ({
          workItemId: item.workItemId,
          selectionIndex: item.selectionIndex,
          verdict: item.verdict,
          q3Reason: item.q3Reason,
          runRefSha256: item.runRefSha256,
        })),
        stateAfter: {
          ACQUISITION_SUCCESSFUL: window.stateAfter.acquisitionSuccessful.length,
          CURRENT_ACQUISITION_FAILURE: window.stateAfter.currentAcquisitionFailure,
          REPLACEMENT_ASSIGNED_AWAITING_EXECUTION:
            window.stateAfter.replacementAssignedAwaitingExecution,
          NEVER_STARTED: range(window.stateAfter.neverStarted),
        },
        summaryComparedAndEqual: true,
      })),
      rebuiltWindowSpecHashes: integrity.rebuiltWindowSpecHashes,
      rebuiltEqualsAuthorityBound: replay.windows.map(
        (window, k) => integrity.rebuiltWindowSpecHashes[k] === window.windowSpecHash,
      ),
      globalRunReferences: {
        rule: GLOBAL_RUN_REFERENCE_UNIQUENESS_RULE,
        count: runRefs.length,
        distinct: new Set(runRefs).size,
        perWindow: replay.windows.map((window) => window.executed.length),
        globallyUnique: new Set(runRefs).size === runRefs.length,
        checkedBy: 'the generic assessAdjudicationHistoryIntegrity',
      },
    },
    operationalPrerequisite: {
      name: ADJUDICATION_HISTORY_INTEGRITY,
      isFrozenP7: false,
      windowCount: integrity.windowCount,
      holds: integrity.holds,
      includesGlobalRunReferenceUniqueness: true,
      onCurrentLedgerPreflight: preflight.operationalPrerequisites.adjudicationHistoryIntegrity,
      readinessRequiresBoth:
        'frozen P7 18/18 on the current committed ledger AND four-window ADJUDICATION_HISTORY_INTEGRITY (with global run-reference uniqueness and the pinned Window-04 correction); the second is never folded into the first. A live Window-05 driver must require both before every item',
    },
    currentState: {
      derivedBy:
        'replay of the explicit history Window 01 -> 02 -> 03 -> 04 (with its pinned correction) over the frozen carry-forward baseline and the canonical ledger',
      ACQUISITION_SUCCESSFUL: state.successfulOrganisationCount,
      acquisitionSuccessfulBySplit: successfulBySplit,
      CURRENT_ACQUISITION_FAILURE: state.currentAcquisitionFailure,
      REPLACEMENT_ASSIGNED_AWAITING_EXECUTION: state.replacementAssignedAwaitingExecution,
      PENDING_CAPABILITY_REVIEW: state.pendingCapabilityReview,
      CARRY_FORWARD_REFUSED: state.carryForwardRefused,
      NEVER_STARTED: {
        ...range(state.neverStarted),
        bySplit: bySplitOf(basis, state.neverStarted),
      },
      q1: state.q1,
      ledgerEntryCount: state.ledgerEntryCount,
      ledgerHash: state.ledgerHash,
      nextGeneration2ReservePosition: state.nextGeneration2ReservePosition,
      accounting: state.accounting,
    },
    q1: {
      rule: 'APPROVE_ASCENDING_SELECTION_INDEX_RESERVE_ASSIGNMENT_V1: every current failed-slot obligation, ascending, next unused Generation-2 positions monotonically; derived by the landed planner',
      assignments: q1,
      empty: q1.length === 0,
      preNetworkAppendRequired: false,
      appendAttemptOnEmptyQ1: appendRefusal,
    },
    window05: {
      windowSpecHash: spec.windowSpecHash,
      independentRebuild: {
        rebuiltWindowSpecHash: rebuiltSpec.windowSpecHash,
        canonicalBytesEqual: specRebuildIdentical,
        recomputedHashEqual: recomputeWindowSpecHash(spec) === spec.windowSpecHash,
      },
      plannedWindowSize: spec.plannedWindowSize,
      rule: 'every Q1 replacement first (none), then the lowest NEVER_STARTED original primaries ascending, to the planned size (the unchanged builder)',
      order: spec.workItems.map((item) => item.workItemId),
      composition,
      replacementItems: replacements,
      primaryItems: spec.workItems.length - replacements,
      plannedReplacementAppend: spec.plannedReplacementAppend,
      workItems: spec.workItems,
      executionBindings,
      inheritedAnomalyWaivers: [],
      noDatabaseNoHostnameNoUrl: true,
    },
    gates: {
      P1_P6_P8:
        'the landed evaluateContinuationWindowGate, unchanged; P7 is the Generation-2 preflight',
      plannedWindowSize: spec.plannedWindowSize,
      p2ThresholdForPlannedSize: spec.gateThresholds.p2RobotsRefusalWindowCount,
      p5ThresholdForPlannedSize: spec.gateThresholds.p5LowRawYieldWindowCount,
      p6: {
        rule: `reserveConsumed > ${String(P6_MAX_REPLACEMENTS_BEFORE_SUCCESS_FLOOR)} AND successfulOrganisationCount < ${String(P6_SUCCESS_FLOOR)}`,
        reserveConsumed,
        successfulOrganisationCount: state.successfulOrganisationCount,
        fires: p6,
      },
      thresholdsChanged: false,
      p7: {
        frozenDefinitionUnchanged:
          'frame, draw, immutable Generation-1 ledger, Generation-2 reserve schedule, Generation-2 ledger; adjudication files, the Window-04 correction and run-reference uniqueness are NOT P7 inputs',
        invariantCount: GENERATION2_P7_INVARIANT_NAMES.length,
        invariants: [...GENERATION2_P7_INVARIANT_NAMES],
        onCurrentCommittedLedger: {
          trueCount,
          falseCount: GENERATION2_P7_INVARIANT_NAMES.length - trueCount,
          allTrue: trueCount === GENERATION2_P7_INVARIANT_NAMES.length,
          falseInvariants: falseInvariants(preflight),
          vector: Object.fromEntries(
            GENERATION2_P7_INVARIANT_NAMES.map((name) => [name, preflight.invariants[name]]),
          ),
          gateDecisionWithZeroCompleted: gateAtStart.decision,
          nextWorkItemId: gateAtStart.nextWorkItemId,
          meaning:
            'Q1 is empty, so Window 05 plans no append: the current committed ledger IS the starting and the running revision; there is no intentional 16/18 pre-append state',
        },
      },
      p8: FROZEN_P8_DEFINITION,
      operationalConcurrencyIntegrity: LIVE_CRITICAL_SECTION_POLICY,
    },
    syntheticPrimaryFailureProof: {
      synthetic: true,
      inMemoryOnly: true,
      scenario: `${firstPrimary.workItemId} fails (ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE) in a synthetic, adjudicated Window 05; every other item succeeds`,
      syntheticHistoryIntegrity: singleFailure.integrityHolds,
      currentAcquisitionFailure: singleFailure.state.currentAcquisitionFailure,
      q1: singleFailure.q1,
      replacedOccupantResolvedBy: 'resolveCrossGenerationOccupant (landed)',
      replacedOccupantKind: occupantBefore.kind,
      projectedEntries: singleFailure.projectedEntries,
      reserve5Prospective: true,
      canonicalAppend: false,
      canonicalEntryCountAfter: singleFailure.canonicalEntryCountAfter,
    },
    syntheticMultipleFailureProof: {
      synthetic: true,
      inMemoryOnly: true,
      scenario: `slots ${multiSlots.join(', ')} (given out of order) fail in a synthetic, adjudicated Window 05`,
      syntheticHistoryIntegrity: multipleFailure.integrityHolds,
      q1: multipleFailure.q1,
      q1AscendingBySelectionIndex: true,
      reservesMonotoneFromNextUnused: true,
      projectedEntries: multipleFailure.projectedEntries,
      canonicalAppend: false,
      canonicalEntryCountAfter: multipleFailure.canonicalEntryCountAfter,
    },
    sameSlotAndAdjudicationDiscipline:
      'unchanged landed Q2 same-slot rules; a Window-05 primary failure authorises NO replacement until the live window is completed or stopped, validated where required, adjudicated and replayed into current state. No speculative assignment during an unadjudicated Window 05',
    negativeAttacks: {
      provedBy: 'src/test/unit/orgunitCorpus2DA2Generation2Window05Readiness.test.ts',
      genericProvedBy: [
        'src/test/unit/orgunitCorpus2DA2Generation2HistoryIntegrity.test.ts',
        'src/test/unit/orgunitCorpus2DA2Generation2Window04AuthorityShapeCorrection.test.ts',
      ],
      allRefuse: true,
      resealedWhereMeaningful: true,
      correctionAttacks: [...WINDOW05_CORRECTION_ATTACKS],
      historyAttacks: [...WINDOW05_HISTORY_ATTACKS],
      stateAttacks: [...WINDOW05_STATE_ATTACKS],
    },
    canonicalGeneration2Ledger: {
      path: WINDOW05_CURRENT_LEDGER_REVISION.path,
      entryCountStill: current.entries.length,
      ledgerHashStill: current.ledgerHash,
      nextGeneration2ReserveStill: state.nextGeneration2ReservePosition,
      reserve5Assigned: false,
      mutatedByThisTask: false,
    },
    sideEffects: {
      institutionNetworkRequests: 0,
      databaseConnections: 0,
      ledgerWrites: 0,
      reserveAssignments: 0,
      liveAuthoritiesCreated: 0,
      acquisitionRuns: 0,
    },
    identityDisclosure:
      'slot numbers, positions, work item ids, digests, run-reference hashes and aggregates only; no echeRowKey, organisation id, root-authority id, hostname or URL',
    nextOwnerDecision: `whether to authorise EXACTLY ONE bounded live Generation-2 Window 05: ${spec.workItems.map((item) => item.workItemId).join(' -> ')}, primaries only, with no pre-network ledger append (Q1 is empty) and reserve 5 unassigned. Not granted here`,
    immutability: 'append-only. This record is never edited; a correction is a new record',
  };

  return { history, state, spec, preflight, record };
}
