/**
 * THE GENERATION-2 WINDOW-06 OFFLINE READINESS RECORD, built PURELY from
 * committed bytes through the UNCHANGED generic adjudication-aware machinery.
 *
 * It derives - never asserts - in this order:
 *
 *   1. the explicit five-window history Window 01 -> 02 -> 03 -> 04 -> 05,
 *      every record re-hashed against its pin; Window 04 carries its pinned
 *      owner authority-shape correction EXPLICITLY, Window 05 is bound through
 *      its LIVE_RESULT V2 (never V1) and carries NO correction; no directory
 *      scan, no glob, no "latest";
 *   2. the Window-02 ruling + re-proof chain, Window 03's own clean
 *      validation, Window 04's carried-over validation and G2P:88 operator
 *      ruling (Window-04-only), and Window 05's validation chain (first V2
 *      validation preserved NOT_PROVED -> owner ruling -> clean re-proof ->
 *      adjudication from the re-proof only) with its monitor-coverage
 *      deviations kept as Window-05 facts that Window 06 does NOT inherit;
 *   3. ADJUDICATION_HISTORY_INTEGRITY over all five windows, including the
 *      generic global run-reference rule, and the proof that Window 04
 *      WITHOUT its correction still refuses;
 *   4. the replayed current state, the complete Q1 by the landed planner,
 *      each replaced occupant by the landed resolver, and the prospective
 *      IN-MEMORY append with its post-append state;
 *   5. the Window-06 spec by the unchanged builder (built twice, compared),
 *      its execution bindings, P2/P5 thresholds, P6, and frozen P7 on the
 *      current committed ledger (intentional pre-append refusal) and on the
 *      prospective ledger (18/18);
 *   6. that a prospective canonical Window-06 authority carries
 *      `boundStartingLedger`, and that neither `boundLedger` nor the Window-04
 *      correction is accepted for it;
 *
 * and only THEN compares the derivation with the task's expectation, stopping
 * on any difference.
 *
 * Aggregates, positions and digests only: no echeRowKey, organisation id,
 * root-authority id, hostname or URL. It authorises nothing; the prospective
 * append exists in memory only.
 */

import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import {
  P6_MAX_REPLACEMENTS_BEFORE_SUCCESS_FLOOR,
  P6_SUCCESS_FLOOR,
} from '../continuationWindow/windowContract.js';
import type { Split } from '../draw/drawContract.js';
import { frameEntrySha256 } from '../generation2/reserveSchedule.js';
import {
  buildPrimaryExecutionBinding,
  buildReserveExecutionBinding,
  executionEntrySha256,
} from '../generation2Acquisition/executionBinding.js';
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
import { verifyWindow03Validation } from '../generation2Window04/window04Readiness.js';
import {
  verifyWindow04Adjudication,
  window04AdjudicationBinding,
} from '../generation2Window05/window05Readiness.js';
import {
  EXPECTED_WINDOW_06,
  WINDOW06_CURRENT_LEDGER_REVISION,
  WINDOW06_PLANNED_SIZE,
  WINDOW06_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
  WINDOW06_READINESS_OWNER_DECISION,
  WINDOW06_READINESS_RECORDED_AT_UTC,
  WINDOW06_READINESS_STARTING_HEAD,
  WINDOW06_READINESS_TASK_ID,
  WINDOW06_READINESS_TERMINAL_STATE,
  WINDOW06_W01_PINS,
  WINDOW06_W02_PINS,
  WINDOW06_W02_VALIDATION_CHAIN,
  WINDOW06_W03_PINS,
  WINDOW06_W04_PINS,
  WINDOW06_W05_PINS,
} from './window06Contract.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const bytesOf = (text: string): number => Buffer.byteLength(text, 'utf8');
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const WINDOW06_HISTORY_ATTACKS = [
  'missing Window 01',
  'missing Window 05',
  'reordered history',
  'duplicated window ordinal',
  'edited historical authority',
  'edited LIVE_RESULT',
  'edited adjudication',
  'Window-05 LIVE_RESULT V1 substituted for V2',
  'Window-05 validation re-proof omitted or altered',
  'first Window-05 validation reclassified clean',
  'Window-04 correction omitted',
  'Window-04 correction attached to Window 05 or Window 06',
  'duplicate historical run reference',
  'wrong starting ledger revision',
] as const;

export const WINDOW06_Q1_ATTACKS = [
  'Q1 [96, 94] instead of ascending [94, 96]',
  'slot 94 assigned reserve 6',
  'slot 96 assigned reserve 5',
  'reserve 5 skipped',
  'reserve 6 skipped',
  'only one of the two Q1 obligations planned',
  'a fake third Q1 obligation',
  'wrong replacement reason',
  'wrong replaced-occupant kind',
  'non-null previousSequenceForSlot for 94 or 96',
  'canonical ledger mutated during readiness',
] as const;

export const WINDOW06_WINDOW_ATTACKS = [
  'G2P:97 placed before a Q1 replacement',
  'G2P:100 substituted for 97/98/99',
  'work items reordered',
  'wrong split',
  'wrong execution identity',
  'altered P2 threshold',
  'altered P5 threshold',
  'altered P6 semantics',
  'frozen P7 changed',
  'prospective future authority using boundLedger',
  'Window-04 authority-shape correction used as a future fallback',
] as const;

// ---------------------------------------------------------------------------
// The explicit five-window history.
// ---------------------------------------------------------------------------

export interface Window06Inputs {
  /** Committed JSON by path; the genesis path carries the GENESIS revision's bytes. */
  readonly committed: CommittedTexts;
  /** The canonical ledger's current committed bytes. */
  readonly currentLedgerText: string;
  /** Windows 01, 02, 03 and 04's starting revisions, in that order. */
  readonly startingLedgerTexts: readonly [string, string, string, string];
  /** `git show <Window-04 authority commit>:<its path>`. */
  readonly window04AuthorityTextAtCommit: string;
  /**
   * `git show <pinned commit>:<path>` for every Window-05 record in
   * `WINDOW06_W05_PINS` (authority, LIVE_RESULT V1 and V2, adjudication,
   * rulings, re-proof): each must equal the committed bytes.
   */
  readonly window05TextsAtCommit: ReadonlyMap<string, string>;
  /** Committed audit bytes by path (the Window-02 stop and closure audits). */
  readonly auditTexts: ReadonlyMap<string, string>;
}

const closureInputs = (inputs: Window06Inputs): Window04ClosureInputs => ({
  committed: inputs.committed,
  currentLedgerText: inputs.currentLedgerText,
  startingLedgerTexts: inputs.startingLedgerTexts,
  authorityTextAtCommit: inputs.window04AuthorityTextAtCommit,
});

interface Bytes {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

/** A committed Window-05 record, re-hashed against its pin and its own commit. */
export function bindWindow05Record(
  pin: Bytes,
  committed: CommittedTexts,
  atCommit?: ReadonlyMap<string, string>,
): CommittedRecordBinding {
  const text = committed.get(pin.path);
  if (text === undefined || sha256(text) !== pin.sha256 || bytesOf(text) !== pin.bytes) {
    refuse('HISTORY_BINDING_NOT_PINNED', `${pin.path} is not the pinned committed record`);
  }
  if (atCommit !== undefined && atCommit.get(pin.path) !== text) {
    refuse('HISTORY_BINDING_NOT_PINNED', `${pin.path} differs from its bytes at its own commit`);
  }
  return { path: pin.path, sha256: pin.sha256, text };
}

/** Window 05's history binding: NO correction, its starting revision is the current ledger. */
export function window05HistoryBinding(inputs: Window06Inputs): Generation2WindowHistoryBinding {
  const at = inputs.window05TextsAtCommit;
  if (sha256(inputs.currentLedgerText) !== WINDOW06_CURRENT_LEDGER_REVISION.fileSha256) {
    refuse('HISTORY_BINDING_NOT_PINNED', 'the Window-05 starting revision is not the pinned one');
  }
  return {
    windowOrdinal: 5,
    authority: bindWindow05Record(WINDOW06_W05_PINS.authority, inputs.committed, at),
    liveResult: bindWindow05Record(WINDOW06_W05_PINS.liveResult, inputs.committed, at),
    adjudication: bindWindow05Record(WINDOW06_W05_PINS.adjudication, inputs.committed, at),
    startingLedgerText: inputs.currentLedgerText,
  };
}

/**
 * Window 01 -> 02 -> 03 -> 04 (with its correction) -> 05 from committed
 * bytes. `withCorrection: false` is Window 04's ORIGINAL, uncorrected shape,
 * kept so its refusal stays provable.
 */
export function fiveWindowHistoryForWindow06(
  inputs: Window06Inputs,
  options: { readonly withCorrection: boolean } = { withCorrection: true },
): Generation2AdjudicationHistory {
  const four = fourWindowHistory(
    closureInputs(inputs),
    window04AdjudicationBinding(inputs.committed),
    options,
  );
  return { windows: [...four.windows, window05HistoryBinding(inputs)] };
}

const obj = (value: unknown): Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {};

// ---------------------------------------------------------------------------
// The Window-05 validation chain and monitor-coverage facts.
// ---------------------------------------------------------------------------

export interface Window05Validation {
  readonly firstValidation: Json;
  readonly reproof: Json;
  readonly ownerRulingDecisions: readonly string[];
  readonly result: string;
  readonly monitorCoverage: Json;
  readonly liveResultSupersession: Json;
}

/**
 * Window 05 was adjudicated ONLY through: the first V2 validation (exit 0 but
 * exclusivity NOT_PROVED, preserved and never reclassified) -> the owner's
 * ruling -> ONE clean, owner-authorised re-proof -> the adjudication that
 * derives its accepted validation from the re-proof alone. Its G2P:92/G2P:93
 * monitor-coverage deviations are Window-05 facts, not waivers.
 *
 * @param texts  committed bytes by path
 * @param pins   defaults to the pinned Window-05 records; a test that
 *               RE-SEALS a record passes the re-sealed pins so that only the
 *               semantic checks below can refuse it
 */
export function verifyWindow05Validation(
  texts: ReadonlyMap<string, string>,
  pins: typeof WINDOW06_W05_PINS = WINDOW06_W05_PINS,
): Window05Validation {
  const fail = (what: string): never => refuse('WINDOW_05_VALIDATION_NOT_ACCEPTED', what);
  const text = (pin: Bytes): string => {
    const value = texts.get(pin.path);
    if (value === undefined || sha256(value) !== pin.sha256 || bytesOf(value) !== pin.bytes) {
      refuse('VALIDATION_CHAIN_NOT_PINNED', `${pin.path} is not the pinned committed record`);
    }
    return value;
  };
  const record = (pin: Bytes): Json => obj(JSON.parse(text(pin)) as unknown);
  const names = (ref: unknown, pin: Bytes): boolean =>
    obj(ref).path === pin.path && obj(ref).sha256 === pin.sha256 && obj(ref).bytes === pin.bytes;

  const ruling = record(pins.validationOwnerRuling);
  const decisions = (Array.isArray(ruling.ownerDecisions) ? ruling.ownerDecisions : []).map(obj);
  const rulingBound = obj(ruling.bound);
  const rulingFirst = obj(ruling.originalValidation);
  if (
    ruling.recordKind !== 'GENERATION2_WINDOW_OWNER_RULING' ||
    ruling.generationId !== GENERATION2_ID ||
    ruling.windowOrdinal !== 5 ||
    ruling.isLiveAuthority !== false ||
    !names(rulingBound.window05LiveResultV2, pins.liveResult) ||
    !names(rulingBound.window05LiveResultV1, pins.liveResultV1) ||
    rulingFirst.formalVerdict !== pins.firstValidationVerdict ||
    rulingFirst.reclassified !== false ||
    rulingFirst.exitCode !== 0 ||
    !decisions.some((d) => d.decision === pins.ownerDecisions.firstValidationPreserved) ||
    !decisions.some(
      (d) =>
        d.decision === pins.ownerDecisions.validationReproof &&
        d.fullValidationRunsAuthorised === 1 &&
        d.thirdV2ValidationAuthorised === false &&
        d.cleanReproofDoesNotProveTheFirstValidationWasExclusive === true,
    )
  ) {
    fail(
      'the owner ruling does not preserve the first validation and authorise exactly one re-proof',
    );
  }

  const reproof = record(pins.validationReproof);
  const re = obj(reproof.reproof);
  const first = obj(reproof.firstValidation);
  if (
    reproof.recordKind !== 'GENERATION2_WINDOW_VALIDATION_EXCLUSIVITY_REPROOF' ||
    reproof.windowOrdinal !== 5 ||
    reproof.isLiveAuthority !== false ||
    reproof.terminalVerdict !== pins.reproofVerdict ||
    reproof.furtherValidationAuthorised !== false ||
    !names(reproof.boundOwnerRuling, pins.validationOwnerRuling) ||
    !names(reproof.boundLiveResult, pins.liveResult) ||
    first.formalVerdict !== pins.firstValidationVerdict ||
    first.reclassified !== false ||
    re.runs !== 1 ||
    re.secondAttempt !== false ||
    re.exitCode !== 0 ||
    re.worktreeCleanAtLaunch !== true
  ) {
    fail('the re-proof is not the one clean, owner-authorised re-proof');
  }

  const adjudication = record(pins.adjudication);
  const validation = obj(adjudication.validation);
  const validationFirst = obj(validation.firstV2Validation);
  const validationRe = obj(validation.ownerAuthorisedReproof);
  const boundRecords = obj(validation.boundRecords);
  const bound = obj(adjudication.bound);
  if (
    adjudication.terminalState !== pins.adjudication.terminalState ||
    validation.exitCode !== 0 ||
    validation.result !== pins.validationResult ||
    validationFirst.formalVerdict !== pins.firstValidationVerdict ||
    validationFirst.reclassified !== false ||
    validationFirst.acceptedForAdjudication !== false ||
    validationRe.exclusivityVerdict !== pins.reproofVerdict ||
    validationRe.runs !== 1 ||
    validationRe.secondAttempt !== false ||
    validationRe.exitCode !== 0 ||
    validationRe.EXTERNAL_COMPETING_PROCESS !== 0 ||
    validationRe.ANCESTRY_UNPROVED !== 0 ||
    validationRe.doesNotProveTheFirstValidationWasExclusive !== true ||
    !names(boundRecords.ownerRuling, pins.validationOwnerRuling) ||
    !names(boundRecords.reproofRecord, pins.validationReproof) ||
    !names(bound.liveResult, pins.liveResult) ||
    !names(bound.liveResult.supersedesImmutableV1, pins.liveResultV1) ||
    !names(bound.authority, pins.authority) ||
    bound.authority.ledgerField !== 'boundStartingLedger' ||
    validation.fullValidationRunsAfterThisRecord !== 0 ||
    typeof validation.resultDerivedFrom !== 'string' ||
    !validation.resultDerivedFrom.includes('ownerAuthorisedReproof ONLY')
  ) {
    fail('the adjudication is not derived from the owner-authorised re-proof alone');
  }

  const deviations = obj(obj(adjudication.operationalDeviations).monitorCoverage);
  const coverage = pins.monitorCoverage;
  if (
    JSON.stringify(deviations.items) !== JSON.stringify(coverage.items) ||
    deviations.classification !== coverage.classification ||
    deviations.executionExclusivity !== coverage.executionExclusivity ||
    deviations.notP8 !== true ||
    deviations.evidenceInvalidated !== false ||
    deviations.notRewrittenAsClean !== true ||
    obj(deviations.proceduralDeviation).item !== coverage.procedurallyDeviantItem ||
    obj(deviations.proceduralDeviation).name !== coverage.proceduralDeviation
  ) {
    fail('the Window-05 monitor-coverage deviations are not preserved as recorded');
  }
  if (
    obj(adjudication.p5).fired !== false ||
    (obj(adjudication.p5).inheritedWaivers ?? []).length
  ) {
    fail('Window 05 inherited an anomaly waiver');
  }

  return {
    firstValidation: {
      formalVerdict: validationFirst.formalVerdict,
      reclassified: validationFirst.reclassified,
      acceptedForAdjudication: validationFirst.acceptedForAdjudication,
      exitCode: validationFirst.exitCode,
      headValidated: validationFirst.headValidated,
    },
    reproof: {
      exclusivityVerdict: validationRe.exclusivityVerdict,
      runs: validationRe.runs,
      exitCode: validationRe.exitCode,
      headValidated: validationRe.headValidated,
      externalCompetingProcess: validationRe.EXTERNAL_COMPETING_PROCESS,
      ancestryUnproved: validationRe.ANCESTRY_UNPROVED,
      provesOnlyItsOwnExecutionInterval: validationRe.provesOnlyItsOwnExecutionInterval,
    },
    ownerRulingDecisions: decisions.map((d) => d.decision as string),
    result: validation.result as string,
    monitorCoverage: {
      items: deviations.items,
      classification: deviations.classification,
      executionExclusivity: deviations.executionExclusivity,
      proceduralDeviation: deviations.proceduralDeviation,
      evidenceInvalidated: deviations.evidenceInvalidated,
      window05Only: true,
      inheritedByWindow06: false,
    },
    liveResultSupersession: {
      adjudicatedLiveResult: pins.liveResult.path,
      supersedesImmutableV1: pins.liveResultV1.path,
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

export interface Window06Readiness {
  readonly history: Generation2AdjudicationHistory;
  readonly state: Generation2CurrentState;
  readonly spec: Generation2WindowSpec;
  readonly prospectiveLedgerText: string;
  readonly preflightOnCurrent: Generation2Preflight;
  readonly preflightOnProspective: Generation2Preflight;
  readonly record: Record<string, unknown>;
}

const falseInvariants = (preflight: Generation2Preflight): string[] =>
  GENERATION2_P7_INVARIANT_NAMES.filter((name) => !preflight.invariants[name]);

const range = (indices: readonly number[]) => ({
  from: indices[0] ?? null,
  to: indices.at(-1) ?? null,
  count: indices.length,
});

export function buildWindow06Readiness(inputs: Window06Inputs): Window06Readiness {
  const { committed, currentLedgerText } = inputs;
  const assessment = assessCommittedInputs(committed);
  const basis = assessment.basis;
  if (basis === null) refuse('BASIS_NOT_EXACT', assessment.failures.join(' | '));
  if (
    sha256(currentLedgerText) !== WINDOW06_CURRENT_LEDGER_REVISION.fileSha256 ||
    bytesOf(currentLedgerText) !== WINDOW06_CURRENT_LEDGER_REVISION.bytes
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

  // 1. Explicit history: Window 04 with its explicit correction, Window 05 with none.
  const history = fiveWindowHistoryForWindow06(inputs);
  const uncorrected = fiveWindowHistoryForWindow06(inputs, { withCorrection: false });
  const [, w02Binding, w03Binding, w04Binding, w05Binding] = history.windows as [
    Generation2WindowHistoryBinding,
    Generation2WindowHistoryBinding,
    Generation2WindowHistoryBinding,
    Generation2WindowHistoryBinding,
    Generation2WindowHistoryBinding,
  ];
  const w02Authority = JSON.parse(w02Binding.authority.text) as { exactOrder: string[] };
  const w04Authority = JSON.parse(w04Binding.authority.text) as Json;
  const w05Authority = JSON.parse(w05Binding.authority.text) as Json;
  const correctionRecord = JSON.parse(w04Binding.authorityShapeCorrection!.record.text) as Json;

  // 2. Validation chains and the window-scoped operator rulings.
  const chain = verifyWindow02ValidationChain(
    new Map<string, string>([...committed, ...inputs.auditTexts]),
    w02Authority.exactOrder.at(-1)!,
  );
  const window03Validation = verifyWindow03Validation(w03Binding.adjudication.text);
  const window04Validation = verifyWindow04Adjudication(w04Binding.adjudication.text);
  const window05Validation = verifyWindow05Validation(committed);

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

  // 4. The replayed state, the complete Q1, the prospective in-memory append.
  const state = deriveGeneration2CurrentState(basis, current, history);
  const q1 = planCompleteQ1(basis, current, history);
  const occupantsBefore = q1.map((assignment) =>
    resolveCrossGenerationOccupant(basis, current, assignment.selectionIndex),
  );
  const append = prepareGeneration2ReplacementAppend({
    basis,
    ledger: current,
    assignments: q1,
    recordedAtUtc: WINDOW06_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
    history,
  });
  const prospectiveLedgerText = `${JSON.stringify(append.nextLedger, null, 2)}\n`;
  const prospective = parseOperationalGeneration2Ledger(
    JSON.parse(prospectiveLedgerText) as unknown,
    basis.genesis,
  );
  const postAppend = deriveGeneration2CurrentState(basis, prospective, history);

  // 5. The spec, built twice by the unchanged builder.
  const buildSpec = () =>
    buildGeneration2WindowSpec({
      basis,
      startingLedger: current,
      startingLedgerFile: { sha256: sha256(currentLedgerText), bytes: bytesOf(currentLedgerText) },
      plannedWindowSize: WINDOW06_PLANNED_SIZE,
      history,
    });
  const spec = buildSpec();
  const rebuiltSpec = buildSpec();
  const specRebuildIdentical =
    canonicalStringify(spec) === canonicalStringify(rebuiltSpec) &&
    rebuiltSpec.windowSpecHash === spec.windowSpecHash &&
    recomputeWindowSpecHash(spec) === spec.windowSpecHash;

  const preflight = (currentText: string): Generation2Preflight =>
    computeGeneration2PreflightWithAssessment(assessment, {
      currentLedgerText: currentText,
      startingLedgerText: currentLedgerText,
      expectedWindowSpec: spec,
      adjudicationHistory: history,
    });
  const preflightOnCurrent = preflight(currentLedgerText);
  const preflightOnProspective = preflight(prospectiveLedgerText);
  const gate = (p: Generation2Preflight, reserveConsumedCount: number) =>
    evaluateGeneration2WindowGate({
      spec,
      preflight: p,
      generation: {
        successfulOrganisationCount: state.successfulOrganisationCount,
        reserveConsumedCount,
      },
      completed: [],
    });
  const gateAtStart = gate(preflightOnProspective, append.reserveConsumedAfter);
  const gateOnCurrent = gate(preflightOnCurrent, append.reserveConsumedBefore);

  const executionBindings = spec.workItems.map((item) => {
    if (item.kind === 'REPLACEMENT') {
      const binding = buildReserveExecutionBinding(
        basis.frameIndex,
        basis.schedule,
        item.generation2ReserveRankPosition!,
      );
      const ranked = basis.frameIndex.ranked[binding.sourceFrameRankPosition]!;
      const raw = basis.frameIndex.rawByEcheRowKey.get(ranked.echeRowKey)!;
      const scheduled = basis.schedule[binding.generation2ReserveRankPosition]!;
      return {
        order: spec.workItems.indexOf(item) + 1,
        workItemId: item.workItemId,
        kind: item.kind,
        selectionIndex: item.selectionIndex,
        split: item.split,
        replacementReason: item.replacementReason,
        replacesOccupantKind: item.replacesOccupantKind,
        source: 'frozen Generation-2 reserve schedule entry -> exact frozen frame entry',
        generation2ReserveRankPosition: binding.generation2ReserveRankPosition,
        sourceFrameRankPosition: binding.sourceFrameRankPosition,
        identityEqualsScheduleAndFrame:
          binding.echeRowKey === scheduled.echeRowKey &&
          binding.echeRowKey === ranked.echeRowKey &&
          binding.organisationId === scheduled.organisationId &&
          binding.organisationId === ranked.organisationId &&
          binding.rankHash === scheduled.rankHash &&
          binding.rankHash === ranked.rankHash,
        frameEntrySha256RecomputedAndEqual:
          frameEntrySha256(raw) === binding.frameEntrySha256 &&
          binding.frameEntrySha256 === scheduled.frameEntrySha256,
        scheduleEntrySha256: binding.scheduleEntrySha256,
        rootAuthorityCount: binding.rootAuthorityCount,
        rootAuthorityCountEqualsSpec: binding.rootAuthorityCount === item.rootAuthorityCount,
        rootAuthorityTypes: binding.rootAuthorities.map((authority) => authority.type),
        rootAuthoritiesFromExactFrameEntryInOrder: true,
        identityDigestKind: item.identityDigestKind,
        identityDigest: executionEntrySha256(binding),
        equalsSpecIdentityDigest: executionEntrySha256(binding) === item.identityDigest,
      };
    }
    const binding = buildPrimaryExecutionBinding(basis.frameIndex, basis.draw, item.selectionIndex);
    const ranked = basis.frameIndex.ranked[item.selectionIndex]!;
    const slot = basis.draw.selection[item.selectionIndex]!;
    return {
      order: spec.workItems.indexOf(item) + 1,
      workItemId: item.workItemId,
      kind: item.kind,
      selectionIndex: binding.selectionIndex,
      generation2ReserveRankPosition: null,
      split: binding.split,
      replacementReason: null,
      replacesOccupantKind: null,
      source: 'exact frozen original draw selection entry, cross-checked against the frozen frame',
      selectionIndexExact:
        binding.selectionIndex === item.selectionIndex &&
        slot.selectionIndex === item.selectionIndex,
      frameRankPosition: ranked.rankPosition,
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
      identityDigest: binding.drawEntrySha256,
      equalsSpecIdentityDigest: binding.drawEntrySha256 === item.identityDigest,
    };
  });

  // 6. The prospective Window-06 authority shape: canonical only, no alias, no inherited correction.
  const prospectiveWindow = synthesiseAdjudicatedWindow({
    basis,
    priorHistory: history,
    startingLedgerText: currentLedgerText,
    prospectiveLedgerText,
    spec,
    verdicts: {},
    runRefSeed: 'window-06-readiness-prospective-authority-shape',
  });
  const prospectiveBinding = prospectiveWindow.history.windows[5]!;
  const prospectiveAuthority = JSON.parse(prospectiveBinding.authority.text) as Json;
  const aliased = {
    ...prospectiveAuthority,
    boundLedger: prospectiveAuthority.boundStartingLedger,
  };
  delete (aliased as Json).boundStartingLedger;
  const withAliasOnly: Generation2AdjudicationHistory = {
    windows: [
      ...history.windows,
      { ...prospectiveBinding, authority: sealRecord(prospectiveBinding.authority.path, aliased) },
    ],
  };
  const withInheritedCorrection: Generation2AdjudicationHistory = {
    windows: [
      ...history.windows,
      { ...prospectiveBinding, authorityShapeCorrection: w04Binding.authorityShapeCorrection! },
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
  const window05 = replay.windows[4]!;
  const successfulBySplit = bySplitOf(basis, state.acquisitionSuccessful);
  const appended = append.appendedEntries.map((entry) => ({
    sequence: entry.sequence,
    selectionIndex: entry.selectionIndex,
    generation2ReserveRankPosition: entry.generation2ReserveRankPosition,
    split: entry.split,
    reason: entry.reason,
    replacedOccupantKind: entry.replacedOccupantKind,
    previousSequenceForSlot: entry.previousSequenceForSlot,
  }));
  const p6 = (reserveConsumedCount: number) =>
    p6Fires({
      reserveConsumedCount,
      successfulOrganisationCount: state.successfulOrganisationCount,
    });
  const replacements = spec.workItems.filter((item) => item.kind === 'REPLACEMENT').length;
  const correctionBlock = obj(correctionRecord.authorityShapeCorrection);
  const correctedWindows = historyBindingOf(replay).windows.map(
    (window) => 'authorityShapeCorrection' in window,
  );
  const canonicalLedgerBytesUnchanged = currentLedgerText === inputs.currentLedgerText;

  // Derived first; only now compared with the task's expectation.
  const expected = EXPECTED_WINDOW_06;
  const differences: string[] = [];
  const expect = (name: string, derived: unknown, wanted: unknown): void => {
    if (canonicalStringify(derived) !== canonicalStringify(wanted)) differences.push(name);
  };
  expect('history window count', replay.windows.length, 5);
  expect(
    'history ordinals',
    history.windows.map((w) => w.windowOrdinal),
    [1, 2, 3, 4, 5],
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
    'window-05 outcomes',
    window05.executed.map((item) => [item.workItemId, item.verdict, item.q3Reason]),
    expected.window05Outcomes,
  );
  expect('window-05 spec hash pin', window05.windowSpecHash, WINDOW06_W05_PINS.windowSpecHash);
  expect('historical run references', runRefs.length, expected.historicalRunReferenceCount);
  expect('historical run references unique', new Set(runRefs).size, runRefs.length);
  expect(
    'run references per window',
    replay.windows.map((w) => w.executed.length),
    expected.runReferencesPerWindow,
  );
  expect('correction recorded on window 4 only', correctedWindows, [
    false,
    false,
    false,
    true,
    false,
  ]);
  expect('uncorrected window 04 refuses', uncorrectedRefusal, 'HISTORY_RECORD_SHAPE');
  expect('uncorrected integrity fails', uncorrectedIntegrity.holds, false);
  expect(
    'w04 authority has no canonical field',
    Object.hasOwn(w04Authority, 'boundStartingLedger'),
    false,
  );
  expect(
    'w05 authority has the canonical field and no alias',
    [
      Object.hasOwn(w05Authority, 'boundStartingLedger'),
      Object.hasOwn(w05Authority, 'boundLedger'),
    ],
    [true, false],
  );
  expect('one approved correction', APPROVED_AUTHORITY_SHAPE_CORRECTIONS.length, 1);
  expect(
    'approved correction pinned to window 4',
    APPROVED_AUTHORITY_SHAPE_CORRECTIONS[0]?.windowOrdinal,
    4,
  );
  expect(
    'correction maps boundLedger only',
    [correctionBlock.sourceField, correctionBlock.canonicalField],
    ['boundLedger', 'boundStartingLedger'],
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
  expect('failure reasons', state.q1Reasons, expected.currentState.failureReasons);
  expect('assigned', state.replacementAssignedAwaitingExecution, expected.currentState.assigned);
  expect('pending', state.pendingCapabilityReview, expected.currentState.pending);
  expect('refused', state.carryForwardRefused, expected.currentState.refused);
  expect('never-started', range(state.neverStarted), expected.currentState.neverStarted);
  expect('accounting', state.accounting, expected.currentState.accounting);
  expect('q1 state', state.q1, expected.currentState.q1);
  expect('ledger entry count', state.ledgerEntryCount, expected.currentState.ledgerEntryCount);
  expect('ledger hash', state.ledgerHash, WINDOW06_CURRENT_LEDGER_REVISION.ledgerHash);
  expect(
    'next reserve',
    state.nextGeneration2ReservePosition,
    expected.currentState.nextGeneration2Reserve,
  );
  expect('q1 assignments', q1, expected.q1Assignments);
  expect('prospective append', appended, expected.prospectiveAppend);
  expect(
    'replaced occupants derived by the resolver',
    append.appendedEntries.map((entry) => entry.replacedEcheRowKey),
    occupantsBefore.map((o) => o.echeRowKey),
  );
  expect(
    'replaced occupant kinds',
    occupantsBefore.map((o) => [o.kind, o.generation1OccupantKind, o.generation2LedgerSequence]),
    occupantsBefore.map(() => ['GENERATION1_TERMINAL_OCCUPANT', 'ORIGINAL_SELECTION', null]),
  );
  expect(
    'append chain',
    append.appendedEntries.map((entry) => entry.previousEntryHash),
    [current.entries[4]?.entryHash, append.appendedEntries[0]?.entryHash],
  );
  expect(
    'reserves come from the schedule in order',
    append.appendedEntries.map((entry) => entry.generation2ReserveRankPosition),
    [5, 6],
  );
  expect(
    'post-append successful',
    postAppend.successfulOrganisationCount,
    expected.postAppend.successful,
  );
  expect(
    'post-append failures',
    postAppend.currentAcquisitionFailure,
    expected.postAppend.failures,
  );
  expect(
    'post-append assigned',
    postAppend.replacementAssignedAwaitingExecution,
    expected.postAppend.assigned,
  );
  expect('post-append pending', postAppend.pendingCapabilityReview, expected.postAppend.pending);
  expect(
    'post-append never-started',
    range(postAppend.neverStarted),
    expected.postAppend.neverStarted,
  );
  expect('post-append q1', postAppend.q1, expected.postAppend.q1);
  expect(
    'post-append ledger count',
    postAppend.ledgerEntryCount,
    expected.postAppend.ledgerEntryCount,
  );
  expect(
    'post-append next reserve',
    postAppend.nextGeneration2ReservePosition,
    expected.postAppend.nextGeneration2Reserve,
  );
  expect('post-append accounting', postAppend.accounting, expected.postAppend.accounting);
  expect(
    'window-06 order',
    spec.workItems.map((item) => item.workItemId),
    expected.workItemIds,
  );
  expect(
    'replacement splits from the frozen draw',
    spec.workItems
      .filter((item) => item.kind === 'REPLACEMENT')
      .map((item) => basis.draw.selection[item.selectionIndex]!.split),
    expected.replacementSplits,
  );
  expect(
    'every split equals the frozen draw',
    spec.workItems.map((item) => item.split),
    spec.workItems.map((item) => basis.draw.selection[item.selectionIndex]!.split),
  );
  expect(
    'primaries are the lowest never-started ascending',
    spec.workItems.filter((item) => item.kind === 'PRIMARY').map((item) => item.selectionIndex),
    postAppend.neverStarted.slice(0, 3),
  );
  expect('replacement items', replacements, expected.replacementItems);
  expect('primary items', spec.workItems.length - replacements, expected.primaryItems);
  expect('spec rebuild identical', specRebuildIdentical, true);
  expect('spec planned append', spec.plannedReplacementAppend, expected.prospectiveAppend);
  expect('p2', spec.gateThresholds.p2RobotsRefusalWindowCount, expected.p2Threshold);
  expect('p5', spec.gateThresholds.p5LowRawYieldWindowCount, expected.p5Threshold);
  expect(
    'p6',
    {
      before: {
        reserveConsumed: append.reserveConsumedBefore,
        fires: p6(append.reserveConsumedBefore),
      },
      after: {
        reserveConsumed: append.reserveConsumedAfter,
        fires: p6(append.reserveConsumedAfter),
      },
    },
    expected.p6,
  );
  expect(
    'identity bindings',
    executionBindings.every(
      (b) =>
        b.equalsSpecIdentityDigest &&
        b.rootAuthorityCountEqualsSpec &&
        ('identityEqualsScheduleAndFrame' in b
          ? b.identityEqualsScheduleAndFrame && b.frameEntrySha256RecomputedAndEqual
          : b.identityEqualsDrawAndFrame && b.splitExact && b.selectionIndexExact),
    ),
    true,
  );
  expect(
    'current ledger P7 misses',
    falseInvariants(preflightOnCurrent),
    expected.currentLedgerFalseInvariants,
  );
  expect('current ledger gate', gateOnCurrent.decision, expected.currentLedgerGateDecision);
  expect('prospective ledger P7 misses', falseInvariants(preflightOnProspective), []);
  expect('prospective gate', gateAtStart.decision, expected.prospectiveGateDecision);
  expect('next work item', gateAtStart.nextWorkItemId, expected.nextWorkItemId);
  expect(
    'history integrity on both preflights',
    [
      preflightOnCurrent.operationalPrerequisites.adjudicationHistoryIntegrity,
      preflightOnProspective.operationalPrerequisites.adjudicationHistoryIntegrity,
    ],
    [true, true],
  );
  expect(
    'canonical ledger untouched',
    [current.entries.length, canonicalLedgerBytesUnchanged, prospective.entries.length],
    [5, true, 7],
  );
  if (differences.length !== 0) {
    refuse(
      'WINDOW_06_DIFFERS',
      `the derived Window 06 differs from the expectation at ${differences.join(', ')}`,
    );
  }

  const trueCount = (p: Generation2Preflight) =>
    GENERATION2_P7_INVARIANT_NAMES.length - falseInvariants(p).length;
  const pinRef = (pin: Bytes & { readonly commit?: string }) => ({ ...pin });
  const record: Record<string, unknown> = {
    recordId: 'phase2b-2d-a2-generation2-window-06-offline-readiness-v1',
    recordKind: 'GENERATION2_WINDOW_OFFLINE_READINESS',
    records: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_06_OFFLINE_READINESS_V1',
    status: 'OFFLINE_READINESS',
    task: WINDOW06_READINESS_TASK_ID,
    ownerDecision: WINDOW06_READINESS_OWNER_DECISION,
    terminalState: WINDOW06_READINESS_TERMINAL_STATE,
    recordedAtUtc: WINDOW06_READINESS_RECORDED_AT_UTC,
    recordedAtUtcSource: 'date -u, read from the shell when this readiness was built',
    branch: OPERATIONAL_BRANCH,
    startingHead: WINDOW06_READINESS_STARTING_HEAD,
    generationId: GENERATION2_ID,
    publicSafe: true,
    thisFileAuthorises: [],
    isLiveAuthority: false,
    networkAuthorised: false,
    databaseAuthorised: false,
    ledgerMutationAuthorised: false,
    reserveAssignmentAuthorised: false,
    reserveAssigned: false,
    canonicalLedgerMutated: false,
    networkUsed: false,
    databaseUsed: false,
    ledgerMutated: false,
    acquisitionRunCreated: false,
    bound: {
      frozenMethodologyV3AuthorityChain: basis.bound,
      frozenHashes: spec.frozenHashes,
      currentGeneration2Ledger: {
        ...WINDOW06_CURRENT_LEDGER_REVISION,
        nextGeneration2ReservePosition: state.nextGeneration2ReservePosition,
      },
      window01: {
        authority: WINDOW06_W01_PINS.authority,
        liveResult: WINDOW06_W01_PINS.liveResult,
        adjudication: WINDOW06_W01_PINS.adjudication,
        startingLedgerRevisionCommit: WINDOW06_W01_PINS.startingLedgerRevisionCommit,
        startingLedgerFileSha256: replay.windows[0]!.startingLedger.fileSha256,
      },
      window02: {
        offlineReadiness: WINDOW06_W02_PINS.offlineReadiness,
        authority: WINDOW06_W02_PINS.authority,
        ledgerAppendCommit: WINDOW06_W02_PINS.ledgerAppendCommit,
        liveResult: WINDOW06_W02_PINS.liveResult,
        adjudication: WINDOW06_W02_PINS.adjudication,
        startingLedgerRevisionCommit: WINDOW06_W02_PINS.startingLedgerRevisionCommit,
        startingLedgerFileSha256: replay.windows[1]!.startingLedger.fileSha256,
      },
      window03: {
        offlineReadiness: WINDOW06_W03_PINS.offlineReadiness,
        authority: WINDOW06_W03_PINS.authority,
        ledgerAppendCommit: WINDOW06_W03_PINS.ledgerAppendCommit,
        liveResult: WINDOW06_W03_PINS.liveResult,
        adjudication: WINDOW06_W03_PINS.adjudication,
        startingLedgerRevisionCommit: WINDOW06_W03_PINS.startingLedgerRevisionCommit,
        startingLedgerFileSha256: replay.windows[2]!.startingLedger.fileSha256,
      },
      window04: {
        offlineReadiness: WINDOW06_W04_PINS.offlineReadiness,
        authority: WINDOW06_W04_PINS.authority,
        liveResult: WINDOW06_W04_PINS.liveResult,
        stopAudit: WINDOW06_W04_PINS.stopAudit,
        authorityShapeCorrection: WINDOW06_W04_PINS.correction,
        adjudication: WINDOW06_W04_PINS.adjudication,
        startingLedgerRevisionCommit: WINDOW06_W04_PINS.startingLedgerRevisionCommit,
        startingLedgerFileSha256: replay.windows[3]!.startingLedger.fileSha256,
      },
      window05: {
        offlineReadiness: pinRef(WINDOW06_W05_PINS.offlineReadiness),
        authority: pinRef(WINDOW06_W05_PINS.authority),
        authorityLedgerField: 'boundStartingLedger',
        adjudicatedLiveResult: pinRef(WINDOW06_W05_PINS.liveResult),
        liveResultV1: {
          ...pinRef(WINDOW06_W05_PINS.liveResultV1),
          immutable: true,
          byteIdenticalToCommittedAtItsCommit: true,
          adjudicatedBinding: false,
          supersededBy: WINDOW06_W05_PINS.liveResult.path,
        },
        liveResultCorrectionOwnerRuling: pinRef(WINDOW06_W05_PINS.liveResultCorrectionOwnerRuling),
        monitorCoverageOwnerRuling: pinRef(WINDOW06_W05_PINS.monitorCoverageOwnerRuling),
        validationOwnerRuling: pinRef(WINDOW06_W05_PINS.validationOwnerRuling),
        validationReproof: pinRef(WINDOW06_W05_PINS.validationReproof),
        adjudication: pinRef(WINDOW06_W05_PINS.adjudication),
        closureChain: [...WINDOW06_W05_PINS.closureChain],
        noLedgerAppend: 'Q1 was empty; Window 05 ran against the unchanged five-entry revision',
        startingLedgerRevisionCommit: WINDOW06_CURRENT_LEDGER_REVISION.appendCommit,
        startingLedgerFileSha256: window05.startingLedger.fileSha256,
      },
      window02ValidationChain: {
        originalValidation: {
          recordedIn: WINDOW06_W02_VALIDATION_CHAIN.stopAudit,
          formalVerdict: chain.originalValidationVerdict,
          reclassified: chain.originalValidationReclassified,
        },
        ownerRuling: WINDOW06_W02_VALIDATION_CHAIN.ownerRuling,
        ownerRulingDecisions: chain.ownerRulingDecisions,
        reproof: WINDOW06_W02_VALIDATION_CHAIN.reproof,
        reproofExitCode: chain.reproofExitCode,
        closureAudit: WINDOW06_W02_VALIDATION_CHAIN.closureAudit,
        adjudicationValidationResult: chain.adjudicationValidationResult,
        adjudicationPermittedOnlyThroughRulingAndReproof: true,
        window02P5Ruling: WINDOW02_P5_OWNER_RULING,
        window02P5RulingIsWindow02Specific: true,
        window02P5RulingReusedForAnyLaterWindow: false,
      },
      window03Validation,
      window04Validation,
      window05Validation: {
        firstValidation: window05Validation.firstValidation,
        firstValidationReclassified: false,
        ownerRulingDecisions: window05Validation.ownerRulingDecisions,
        reproof: window05Validation.reproof,
        adjudicationValidationResult: window05Validation.result,
        adjudicationDerivedFromTheReproofOnly: true,
        liveResult: window05Validation.liveResultSupersession,
      },
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
      derivedWindow06SpecHash: spec.windowSpecHash,
    },
    window04AuthorityShapeCorrection: {
      record: WINDOW06_W04_PINS.correction,
      authority: WINDOW06_W04_PINS.authority,
      boundWindowSpecHash: correctionRecord.boundWindowSpecHash,
      ownerRuling: correctionBlock.ownerRuling,
      mapping: { from: correctionBlock.sourceField, to: correctionBlock.canonicalField },
      scope: correctionBlock.scope,
      grantsAuthority: false,
      thisFileAuthorises: correctionRecord.thisFileAuthorises,
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
      appliesToWindow05: false,
      appliesToWindow06: false,
      futureWindowFallback: false,
    },
    prospectiveWindow06AuthorityShape: {
      requiredStartingLedgerField: 'boundStartingLedger',
      forbiddenField: 'boundLedger',
      provedOn: 'a synthetic, in-memory Window-06 authority built by the landed synthesiser',
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
      order: ['Window 01', 'Window 02', 'Window 03', 'Window 04', 'Window 05'],
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
      onCurrentLedgerPreflight:
        preflightOnCurrent.operationalPrerequisites.adjudicationHistoryIntegrity,
      onProspectiveLedgerPreflight:
        preflightOnProspective.operationalPrerequisites.adjudicationHistoryIntegrity,
      readinessRequiresBoth:
        'frozen P7 18/18 on the prospective post-append ledger AND five-window ADJUDICATION_HISTORY_INTEGRITY (with global run-reference uniqueness and the pinned Window-04 correction); the second is never folded into the first. A live Window-06 driver must require both before every item',
    },
    currentState: {
      derivedBy:
        'replay of the explicit history Window 01 -> 02 -> 03 -> 04 (with its pinned correction) -> 05 over the frozen carry-forward baseline and the canonical ledger',
      ACQUISITION_SUCCESSFUL: state.successfulOrganisationCount,
      acquisitionSuccessfulBySplit: successfulBySplit,
      CURRENT_ACQUISITION_FAILURE: state.currentAcquisitionFailure,
      failureReasons: state.q1Reasons,
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
      rule: 'APPROVE_ASCENDING_SELECTION_INDEX_RESERVE_ASSIGNMENT_V1: every current failed-slot obligation, ascending by selectionIndex, to the next unused Generation-2 reserve positions monotonically; derived by the landed complete-Q1 planner',
      assignments: q1,
      preNetworkAppendRequired: true,
    },
    prospectiveAppend: {
      inMemoryOnly: true,
      persisted: false,
      recordedAtUtc: WINDOW06_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
      recordedAtUtcIsIllustrative:
        'a live authority supplies its own recordedAtUtc, so the live entry hashes and ledgerHash will differ from these by construction',
      replacedOccupants: occupantsBefore.map((o) => ({
        selectionIndex: o.selectionIndex,
        derivedBy: 'resolveCrossGenerationOccupant (landed)',
        kind: o.kind,
        generation1OccupantKind: o.generation1OccupantKind,
        generation2EntryCountForSlot: o.generation2EntryCountForSlot,
        previousSequenceForSlot: o.generation2LedgerSequence,
        appendedEntryReplacesExactlyThisOccupant: true,
      })),
      entries: append.appendedEntries.map((entry, k) => ({
        sequence: entry.sequence,
        selectionIndex: entry.selectionIndex,
        generation2ReserveRankPosition: entry.generation2ReserveRankPosition,
        split: entry.split,
        reason: entry.reason,
        replacedOccupantKind: entry.replacedOccupantKind,
        previousSequenceForSlot: entry.previousSequenceForSlot,
        previousEntryHash: entry.previousEntryHash,
        previousEntryHashIs:
          k === 0 ? 'canonical entry 4 entryHash' : 'prospective sequence 5 entryHash',
        entryHash: entry.entryHash,
        executionEntrySha256: append.appendedExecutionEntrySha256[k],
      })),
      canonicalEntry4EntryHash: current.entries[4]?.entryHash,
      previousLedgerHash: append.previousLedgerHash,
      nextLedgerHash: append.nextLedgerHash,
      entryCountBefore: append.reserveConsumedBefore,
      entryCountAfter: append.reserveConsumedAfter,
      stateAfter: {
        ACQUISITION_SUCCESSFUL: postAppend.successfulOrganisationCount,
        CURRENT_ACQUISITION_FAILURE: postAppend.currentAcquisitionFailure,
        REPLACEMENT_ASSIGNED_AWAITING_EXECUTION: postAppend.replacementAssignedAwaitingExecution,
        PENDING_CAPABILITY_REVIEW: postAppend.pendingCapabilityReview,
        NEVER_STARTED: range(postAppend.neverStarted),
        q1: postAppend.q1,
        ledgerEntryCount: postAppend.ledgerEntryCount,
        nextGeneration2ReservePosition: postAppend.nextGeneration2ReservePosition,
        accounting: postAppend.accounting,
      },
      unadjudicatedSuffix:
        'after the append, entries 5 and 6 lie beyond every adjudicated window, so the bridge reads them as REPLACEMENT_ASSIGNED_AWAITING_EXECUTION - never success or failure',
    },
    window06: {
      windowSpecHash: spec.windowSpecHash,
      independentRebuild: {
        rebuiltWindowSpecHash: rebuiltSpec.windowSpecHash,
        canonicalBytesEqual: specRebuildIdentical,
        recomputedHashEqual: recomputeWindowSpecHash(spec) === spec.windowSpecHash,
      },
      plannedWindowSize: spec.plannedWindowSize,
      rule: 'every complete Q1 replacement first (ascending), then the lowest NEVER_STARTED original primaries ascending, to the planned size (the unchanged builder)',
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
        successfulOrganisationCount: state.successfulOrganisationCount,
        reserveConsumedBeforeAppend: append.reserveConsumedBefore,
        reserveConsumedAfterAppend: append.reserveConsumedAfter,
        firesBefore: p6(append.reserveConsumedBefore),
        firesAfter: p6(append.reserveConsumedAfter),
      },
      thresholdsChanged: false,
      p7: {
        frozenDefinitionUnchanged:
          'frame, draw, immutable Generation-1 ledger, Generation-2 reserve schedule, Generation-2 ledger; adjudication files, the Window-04 correction and run-reference uniqueness are NOT P7 inputs',
        invariantCount: GENERATION2_P7_INVARIANT_NAMES.length,
        invariants: [...GENERATION2_P7_INVARIANT_NAMES],
        onCurrentCommittedLedger: {
          trueCount: trueCount(preflightOnCurrent),
          falseCount: falseInvariants(preflightOnCurrent).length,
          falseInvariants: falseInvariants(preflightOnCurrent),
          vector: Object.fromEntries(
            GENERATION2_P7_INVARIANT_NAMES.map((name) => [
              name,
              preflightOnCurrent.invariants[name],
            ]),
          ),
          gateDecisionWithZeroCompleted: gateOnCurrent.decision,
          intentional: true,
          meaning:
            'Window 06 cannot start until its Q1 append (slot 94 -> reserve 5, slot 96 -> reserve 6) is persisted, committed and pushed before any institution network; only the two persistence-dependent invariants are false, and that refusal is expected, not a defect',
        },
        onProspectivePostAppendLedger: {
          trueCount: trueCount(preflightOnProspective),
          allTrue: falseInvariants(preflightOnProspective).length === 0,
          falseInvariants: falseInvariants(preflightOnProspective),
          gateDecisionWithZeroCompleted: gateAtStart.decision,
          nextWorkItemId: gateAtStart.nextWorkItemId,
        },
      },
      p8: FROZEN_P8_DEFINITION,
      operationalConcurrencyIntegrity: LIVE_CRITICAL_SECTION_POLICY,
      window05MonitorDeviationsInherited: false,
      anomalyWaiversAtWindowStart: 0,
    },
    sameSlotAndAdjudicationDiscipline:
      'unchanged landed Q2 same-slot rules; a Window-06 failure authorises NO replacement until the live window is completed or stopped, validated where required, adjudicated and replayed into current state. No speculative assignment during an unadjudicated Window 06',
    negativeAttacks: {
      provedBy: 'src/test/unit/orgunitCorpus2DA2Generation2Window06Readiness.test.ts',
      genericProvedBy: [
        'src/test/unit/orgunitCorpus2DA2Generation2HistoryIntegrity.test.ts',
        'src/test/unit/orgunitCorpus2DA2Generation2Window04AuthorityShapeCorrection.test.ts',
      ],
      allRefuse: true,
      resealedWhereMeaningful: true,
      historyAttacks: [...WINDOW06_HISTORY_ATTACKS],
      q1Attacks: [...WINDOW06_Q1_ATTACKS],
      windowAttacks: [...WINDOW06_WINDOW_ATTACKS],
    },
    canonicalGeneration2Ledger: {
      path: WINDOW06_CURRENT_LEDGER_REVISION.path,
      entryCountStill: current.entries.length,
      ledgerHashStill: current.ledgerHash,
      nextGeneration2ReserveStill: state.nextGeneration2ReservePosition,
      reserve5Assigned: false,
      reserve6Assigned: false,
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
    nextOwnerDecision: `whether to authorise EXACTLY ONE bounded live Generation-2 Window 06: ${spec.workItems.map((item) => item.workItemId).join(' -> ')}, with the reserve-5 and reserve-6 assignments (slots 94 and 96) committed and pushed BEFORE any institution network. Authority is NOT granted by this readiness record`,
    immutability: 'append-only. This record is never edited; a correction is a new record',
  };

  return {
    history,
    state,
    spec,
    prospectiveLedgerText,
    preflightOnCurrent,
    preflightOnProspective,
    record,
  };
}
