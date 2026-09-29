/**
 * THE GENERATION-2 WINDOW-03 OFFLINE READINESS RECORD, built PURELY from
 * committed bytes through the UNCHANGED generic adjudication-aware machinery.
 *
 * It derives - never asserts - in this order:
 *
 *   1. the explicit two-window history (Window 01, then Window 02), each
 *      record re-hashed against its pin; no directory scan, no "latest";
 *   2. the Window-02 validation chain: the original validation preserved as
 *      NOT_PROVED, the owner ruling, the clean re-proof, and an adjudication
 *      that binds exactly that ruling and re-proof, with P5 kept as the valid
 *      post-final-item pause the owner reviewed;
 *   3. ADJUDICATION_HISTORY_INTEGRITY over both windows;
 *   4. the replayed current state, complete Q1, the prospective in-memory
 *      append and the post-append state;
 *   5. the Window-03 spec by the unchanged builder (built twice, compared),
 *      its execution bindings, P2/P5 thresholds, P6, and the Generation-2 P7
 *      preflight on the current and on the prospective ledger;
 *   6. a same-slot Q2 proof over a synthetic, in-memory Window 03;
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
  type ReplacementReason,
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
  PINNED,
  refuse,
} from '../generation2Acquisition/operationalContract.js';
import {
  parseOperationalGeneration2Ledger,
  resolveCrossGenerationOccupant,
  withEntries,
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
  HISTORY_BRIDGE_VERSION,
  bySplitOf,
  historyBindingOf,
  type CommittedRecordBinding,
  type Generation2AdjudicationHistory,
} from '../generation2History/adjudicationHistory.js';
import { CURRENT_LEDGER_REVISION as WINDOW02_STARTING_LEDGER_REVISION } from '../generation2History/historyContract.js';
import {
  ADJUDICATION_HISTORY_INTEGRITY,
  assessAdjudicationHistoryIntegrity,
  requireUniqueHistoricalRunReferences,
} from '../generation2History/historyIntegrity.js';
import { synthesiseAdjudicatedWindow } from './synthesiseWindow.js';
import {
  EXPECTED_WINDOW_03,
  WINDOW02_P5_OWNER_RULING,
  WINDOW03_CURRENT_LEDGER_REVISION,
  WINDOW03_PLANNED_SIZE,
  WINDOW03_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
  WINDOW03_READINESS_OWNER_DECISION,
  WINDOW03_READINESS_RECORDED_AT_UTC,
  WINDOW03_READINESS_STARTING_HEAD,
  WINDOW03_READINESS_TASK_ID,
  WINDOW03_READINESS_TERMINAL_STATE,
  WINDOW03_W01_PINS,
  WINDOW03_W02_PINS,
  WINDOW03_W02_VALIDATION_CHAIN,
} from './window03Contract.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const bytesOf = (text: string): number => Buffer.byteLength(text, 'utf8');
type Json = Record<string, unknown>;

export const WINDOW03_NEGATIVE_ATTACKS = [
  'history order reversed',
  'Window 01 omitted',
  'Window 02 omitted',
  'forged Window-02 adjudication summary',
  'forged Window-02 verdict',
  'forged validation re-proof',
  'forged owner ruling',
  'duplicate historical runRefSha256',
  'mismatched starting ledger revision',
  'Q1 partial assignment',
  'Q1 reversed',
  'reserve 3 skipped',
  'reserve 4 skipped',
  'wrong assignment reason',
  'wrong split',
  'wrong primary order',
  'P87 substituted for one Window-03 item',
  'stale current state ignoring the Window-02 adjudication',
  'current canonical ledger treated as though it already held reserves 3 and 4',
  'same-slot Q2 append before adjudication',
  'dynamic directory / latest lookup in place of explicit history',
] as const;

// ---------------------------------------------------------------------------
// The explicit two-window history.
// ---------------------------------------------------------------------------

export interface HistoryPin {
  readonly path: string;
  readonly sha256: string;
}
export interface TwoWindowHistoryPins {
  readonly w01: {
    readonly authority: HistoryPin;
    readonly liveResult: HistoryPin;
    readonly adjudication: HistoryPin;
  };
  readonly w02: {
    readonly authority: HistoryPin;
    readonly liveResult: HistoryPin;
    readonly adjudication: HistoryPin;
  };
  readonly w01StartingLedgerSha256: string;
  readonly w02StartingLedgerSha256: string;
}

export const WINDOW03_HISTORY_PINS: TwoWindowHistoryPins = {
  w01: WINDOW03_W01_PINS,
  w02: WINDOW03_W02_PINS,
  w01StartingLedgerSha256: PINNED.genesisLedger.sha256,
  w02StartingLedgerSha256: WINDOW02_STARTING_LEDGER_REVISION.fileSha256,
};

/** Window 01 then Window 02, from committed bytes, each re-hashed against its pin. */
export function twoWindowHistory(
  committed: CommittedTexts,
  genesisText: string,
  window02StartingLedgerText: string,
  pins: TwoWindowHistoryPins = WINDOW03_HISTORY_PINS,
): Generation2AdjudicationHistory {
  const bind = (pin: HistoryPin): CommittedRecordBinding => {
    const text = committed.get(pin.path);
    if (text === undefined || sha256(text) !== pin.sha256) {
      refuse('HISTORY_BINDING_NOT_PINNED', `${pin.path} is not the pinned committed record`);
    }
    return { path: pin.path, sha256: pin.sha256, text };
  };
  if (sha256(genesisText) !== pins.w01StartingLedgerSha256) {
    refuse('HISTORY_BINDING_NOT_PINNED', 'the Window-01 starting revision is not the pinned one');
  }
  if (sha256(window02StartingLedgerText) !== pins.w02StartingLedgerSha256) {
    refuse('HISTORY_BINDING_NOT_PINNED', 'the Window-02 starting revision is not the pinned one');
  }
  return {
    windows: [
      {
        windowOrdinal: 1,
        authority: bind(pins.w01.authority),
        liveResult: bind(pins.w01.liveResult),
        adjudication: bind(pins.w01.adjudication),
        startingLedgerText: genesisText,
      },
      {
        windowOrdinal: 2,
        authority: bind(pins.w02.authority),
        liveResult: bind(pins.w02.liveResult),
        adjudication: bind(pins.w02.adjudication),
        startingLedgerText: window02StartingLedgerText,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// The Window-02 validation chain: NOT_PROVED preserved -> ruling -> re-proof
// -> adjudication. Adjudication is permitted ONLY through that chain.
// ---------------------------------------------------------------------------

export interface ValidationChainPins {
  readonly stopAudit: HistoryPin & { readonly terminalState: string };
  readonly ownerRuling: HistoryPin & { readonly decision: string };
  readonly reproof: HistoryPin & { readonly verdict: string };
  readonly closureAudit: HistoryPin;
  readonly adjudication: HistoryPin;
  readonly authority: HistoryPin;
  readonly liveResult: HistoryPin;
  readonly originalValidationVerdict: string;
  readonly p5OwnerRuling: string;
}

export const WINDOW03_VALIDATION_CHAIN_PINS: ValidationChainPins = {
  ...WINDOW03_W02_VALIDATION_CHAIN,
  adjudication: WINDOW03_W02_PINS.adjudication,
  authority: WINDOW03_W02_PINS.authority,
  liveResult: WINDOW03_W02_PINS.liveResult,
  p5OwnerRuling: WINDOW02_P5_OWNER_RULING,
};

const obj = (value: unknown): Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {};

export interface Window02ValidationChain {
  readonly originalValidationVerdict: string;
  readonly originalValidationReclassified: false;
  readonly ownerRulingDecisions: readonly string[];
  readonly reproofVerdict: string;
  readonly reproofExitCode: number;
  readonly adjudicationValidationResult: string;
  readonly p5: Json;
}

/**
 * @param texts  committed bytes by path: the JSON records and both audits
 * @param lastAuthorisedWorkItemId  the Window-02 authority's final item, for P5
 */
export function verifyWindow02ValidationChain(
  texts: ReadonlyMap<string, string>,
  lastAuthorisedWorkItemId: string,
  pins: ValidationChainPins = WINDOW03_VALIDATION_CHAIN_PINS,
): Window02ValidationChain {
  const text = (pin: HistoryPin): string => {
    const value = texts.get(pin.path);
    if (value === undefined || sha256(value) !== pin.sha256) {
      refuse('VALIDATION_CHAIN_NOT_PINNED', `${pin.path} is not the pinned committed record`);
    }
    return value;
  };
  const record = (pin: HistoryPin): Json => obj(JSON.parse(text(pin)) as unknown);
  const fail = (what: string): never => refuse('VALIDATION_CHAIN_BROKEN', what);
  const names = (ref: unknown, pin: HistoryPin): boolean =>
    obj(ref).path === pin.path && obj(ref).sha256 === pin.sha256;

  // The original governed validation: recorded NOT_PROVED, and it stays so.
  const stopAudit = text(pins.stopAudit);
  if (
    !stopAudit.includes(pins.stopAudit.terminalState) ||
    !stopAudit.includes(pins.originalValidationVerdict)
  ) {
    fail('the stop audit does not record the original validation as not proved');
  }

  const ruling = record(pins.ownerRuling);
  const rulingBound = obj(ruling.bound);
  const original = obj(ruling.originalValidation);
  const decisions = (Array.isArray(ruling.ownerDecisions) ? ruling.ownerDecisions : []).map(obj);
  const p5Decision = decisions.find((d) => d.decision === pins.p5OwnerRuling);
  if (
    ruling.recordKind !== 'GENERATION2_WINDOW_OWNER_RULING' ||
    ruling.generationId !== GENERATION2_ID ||
    ruling.isLiveAuthority !== false ||
    !names(rulingBound.window02Authority, pins.authority) ||
    !names(rulingBound.window02LiveResult, pins.liveResult) ||
    !names(rulingBound.window02StopAudit, pins.stopAudit) ||
    original.formalVerdict !== pins.originalValidationVerdict ||
    original.neverOverwrittenNeverReclassified !== true ||
    !decisions.some((d) => d.decision === pins.ownerRuling.decision) ||
    p5Decision === undefined ||
    p5Decision.p5Preserved !== true ||
    p5Decision.p5WeakenedOrReinterpreted !== false ||
    p5Decision.p5FiredAfter !== lastAuthorisedWorkItemId
  ) {
    fail('the owner ruling does not bind Window 02, preserve the original verdict and rule on P5');
  }

  const reproof = record(pins.reproof);
  const reproofRuling = obj(reproof.ownerRuling);
  const reproofOriginal = obj(reproof.originalValidation);
  const reproofValidation = obj(reproof.validation);
  if (
    reproof.recordKind !== 'GENERATION2_WINDOW_VALIDATION_EXCLUSIVITY_REPROOF' ||
    reproof.isLiveAuthority !== false ||
    reproof.exclusivityVerdict !== pins.reproof.verdict ||
    reproofValidation.exitCode !== 0 ||
    reproofValidation.runs !== 1 ||
    !names(reproofRuling, pins.ownerRuling) ||
    reproofRuling.decision !== pins.ownerRuling.decision ||
    reproofOriginal.formalVerdict !== pins.originalValidationVerdict ||
    reproofOriginal.reclassified !== false
  ) {
    fail('the re-proof is not the one clean, owner-authorised re-proof');
  }

  const adjudication = record(pins.adjudication);
  const bound = obj(adjudication.bound);
  const validation = obj(adjudication.validation);
  const p5 = obj(adjudication.p5);
  if (
    !names(bound.ownerRuling, pins.ownerRuling) ||
    !names(bound.validationReproof, pins.reproof) ||
    validation.exitCode !== 0 ||
    validation.result !== 'WINDOW_02_VALIDATION_ACCEPTED' ||
    typeof validation.basis !== 'string' ||
    !validation.basis.includes(pins.reproof.verdict) ||
    p5.decision !== 'PAUSE_P5_LOW_RAW_YIELD' ||
    p5.firedAfter !== lastAuthorisedWorkItemId ||
    p5.ownerRuling !== pins.p5OwnerRuling ||
    p5.preservedNotWeakenedNotReinterpreted !== true ||
    p5.retrospectiveEvidenceInvalidation !== false ||
    p5.retriesRequired !== false ||
    p5.futureAcquisitionStillRequiresSeparateOwnerDecision !== true
  ) {
    fail('the adjudication is not reached through the ruling + re-proof chain with P5 preserved');
  }
  text(pins.closureAudit);

  return {
    originalValidationVerdict: original.formalVerdict as string,
    originalValidationReclassified: false,
    ownerRulingDecisions: decisions.map((d) => d.decision as string),
    reproofVerdict: reproof.exclusivityVerdict as string,
    reproofExitCode: 0,
    adjudicationValidationResult: validation.result as string,
    p5,
  };
}

// ---------------------------------------------------------------------------
// Run references across windows.
// ---------------------------------------------------------------------------

/**
 * Promoted into the generic ADJUDICATION_HISTORY_INTEGRITY
 * (generation2History/historyIntegrity.ts), which now enforces it itself;
 * re-exported so this layer keeps one implementation, not a copy.
 */
export { requireUniqueHistoricalRunReferences };

// ---------------------------------------------------------------------------
// The readiness.
// ---------------------------------------------------------------------------

export interface Window03Inputs {
  /** Committed JSON by path; the genesis path carries the GENESIS revision's bytes. */
  readonly committed: CommittedTexts;
  /** The canonical ledger's current committed bytes. */
  readonly currentLedgerText: string;
  /** Window 01's starting revision (the genesis). */
  readonly genesisText: string;
  /** Window 02's starting revision. */
  readonly window02StartingLedgerText: string;
  /** Committed audit bytes by path (the Window-02 stop and closure audits). */
  readonly auditTexts: ReadonlyMap<string, string>;
}

export interface Window03Readiness {
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

function refusalCode(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof Generation2OperationalRefusal) return error.code;
    throw error;
  }
  return 'NO_REFUSAL';
}

export function buildWindow03Readiness(inputs: Window03Inputs): Window03Readiness {
  const { committed, currentLedgerText } = inputs;
  const assessment = assessCommittedInputs(committed);
  const basis = assessment.basis;
  if (basis === null) refuse('BASIS_NOT_EXACT', assessment.failures.join(' | '));
  if (
    sha256(currentLedgerText) !== WINDOW03_CURRENT_LEDGER_REVISION.fileSha256 ||
    bytesOf(currentLedgerText) !== WINDOW03_CURRENT_LEDGER_REVISION.bytes
  ) {
    refuse(
      'CURRENT_LEDGER_NOT_CANONICAL',
      'the current ledger is not the pinned three-entry revision',
    );
  }
  const current = parseOperationalGeneration2Ledger(
    JSON.parse(currentLedgerText) as unknown,
    basis.genesis,
  );

  // 1. Explicit history.
  const history = twoWindowHistory(
    committed,
    inputs.genesisText,
    inputs.window02StartingLedgerText,
  );
  const w02Authority = JSON.parse(history.windows[1]!.authority.text) as { exactOrder: string[] };

  // 2. The Window-02 validation chain.
  const chainTexts = new Map<string, string>([...committed, ...inputs.auditTexts]);
  const chain = verifyWindow02ValidationChain(chainTexts, w02Authority.exactOrder.at(-1)!);

  // 3. History integrity (operational prerequisite, not P7).
  const integrity = assessAdjudicationHistoryIntegrity(basis, current, history);
  if (!integrity.holds || integrity.replay === null) {
    refuse('ADJUDICATION_HISTORY_INTEGRITY', integrity.failures.join(' | '));
  }
  const replay = integrity.replay;
  // Global uniqueness is now part of the generic integrity just asserted.
  const runRefs = integrity.historicalRunReferences;

  // 4. The replayed state, Q1, the prospective append.
  const state = deriveGeneration2CurrentState(basis, current, history);
  const q1 = planCompleteQ1(basis, current, history);
  const occupantsBefore = q1.map((assignment) =>
    resolveCrossGenerationOccupant(basis, current, assignment.selectionIndex),
  );
  const append = prepareGeneration2ReplacementAppend({
    basis,
    ledger: current,
    assignments: q1,
    recordedAtUtc: WINDOW03_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
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
      plannedWindowSize: WINDOW03_PLANNED_SIZE,
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
        workItemId: item.workItemId,
        kind: item.kind,
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
      workItemId: item.workItemId,
      kind: item.kind,
      source: 'exact frozen original draw selection entry, cross-checked against the frozen frame',
      selectionIndex: binding.selectionIndex,
      frameRankPosition: ranked.rankPosition,
      split: binding.split,
      identityEqualsDrawAndFrame:
        binding.echeRowKey === slot.echeRowKey &&
        binding.echeRowKey === ranked.echeRowKey &&
        binding.organisationId === slot.organisationId &&
        binding.organisationId === ranked.organisationId &&
        binding.rankHash === slot.rankHash &&
        binding.rankHash === ranked.rankHash,
      frameEntrySha256: frameEntrySha256(basis.frameIndex.rawByEcheRowKey.get(ranked.echeRowKey)!),
      rootAuthorityCount: binding.rootAuthorityCount,
      rootAuthorityTypes: binding.rootAuthorities.map((authority) => authority.type),
      rootAuthoritiesFromExactFrameEntryInOrder: true,
      identityDigestKind: item.identityDigestKind,
      identityDigest: binding.drawEntrySha256,
      equalsSpecIdentityDigest: binding.drawEntrySha256 === item.identityDigest,
    };
  });

  // 6. Same-slot Q2 over a synthetic Window 03 in which the FIRST replacement fails.
  const firstReplacement = spec.workItems.find((item) => item.kind === 'REPLACEMENT')!;
  const synthetic = synthesiseAdjudicatedWindow({
    basis,
    priorHistory: history,
    startingLedgerText: currentLedgerText,
    prospectiveLedgerText,
    spec,
    verdicts: {
      [firstReplacement.selectionIndex]:
        'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET' satisfies ReplacementReason,
    },
    runRefSeed: 'window-03-readiness-same-slot-q2',
  });
  const syntheticIntegrity = assessAdjudicationHistoryIntegrity(
    basis,
    synthetic.ledger,
    synthetic.history,
  );
  const syntheticQ1 = planCompleteQ1(basis, synthetic.ledger, synthetic.history);
  const q2Append = prepareGeneration2ReplacementAppend({
    basis,
    ledger: synthetic.ledger,
    assignments: syntheticQ1,
    recordedAtUtc: WINDOW03_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
    history: synthetic.history,
  });
  const q2Entry = q2Append.appendedEntries[0]!;
  const beforeAdjudication = withEntries(basis.genesis, [...prospective.entries, q2Entry]);
  const q2RefusedBeforeAdjudication = refusalCode(() =>
    deriveGeneration2CurrentState(basis, beforeAdjudication, history),
  );
  const q2AppendRefusedBeforeAdjudication = refusalCode(() =>
    prepareGeneration2ReplacementAppend({
      basis,
      ledger: prospective,
      assignments: syntheticQ1,
      recordedAtUtc: WINDOW03_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
      history,
    }),
  );

  const composition = Object.fromEntries(
    (['DEV_TRAIN', 'DEV_CONFIRM', 'FINAL_HOLDOUT'] as const).map((split: Split) => [
      split,
      spec.workItems.filter((item) => item.split === split).length,
    ]),
  );
  const window01 = replay.windows[0]!;
  const window02 = replay.windows[1]!;
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

  // Derived first; only now compared with the task's expectation.
  const expected = EXPECTED_WINDOW_03;
  const differences: string[] = [];
  const expect = (name: string, derived: unknown, wanted: unknown): void => {
    if (canonicalStringify(derived) !== canonicalStringify(wanted)) differences.push(name);
  };
  expect('history window count', replay.windows.length, 2);
  expect('consumed ledger entries', replay.consumedLedgerEntryCount, 3);
  expect(
    'window-02 outcomes',
    window02.executed.map((item) => [item.workItemId, item.verdict, item.q3Reason]),
    expected.window02Outcomes,
  );
  expect('historical run references', runRefs.length, expected.historicalRunReferenceCount);
  expect('historical run references unique', new Set(runRefs).size, runRefs.length);
  expect('successful', state.successfulOrganisationCount, expected.currentState.successful);
  expect('successful by split', successfulBySplit, expected.currentState.successfulBySplit);
  expect('failures', state.currentAcquisitionFailure, expected.currentState.failures);
  expect('failure reasons', state.q1Reasons, expected.currentState.failureReasons);
  expect('assigned', state.replacementAssignedAwaitingExecution, []);
  expect('pending', state.pendingCapabilityReview, []);
  expect('refused', state.carryForwardRefused, []);
  expect('never-started', range(state.neverStarted), expected.currentState.neverStarted);
  expect('accounting', state.accounting, expected.currentState.accounting);
  expect('q1', state.q1, expected.currentState.q1);
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
    [current.entries[2]?.entryHash, append.appendedEntries[0]?.entryHash],
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
    'window-03 items',
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
        ('identityEqualsScheduleAndFrame' in b
          ? b.identityEqualsScheduleAndFrame && b.frameEntrySha256RecomputedAndEqual
          : b.identityEqualsDrawAndFrame),
    ),
    true,
  );
  expect(
    'current ledger P7 misses',
    falseInvariants(preflightOnCurrent),
    expected.currentLedgerFalseInvariants,
  );
  expect('prospective ledger P7 misses', falseInvariants(preflightOnProspective), []);
  expect('next work item', gateAtStart.nextWorkItemId, expected.nextWorkItemId);
  expect('same-slot synthetic integrity', syntheticIntegrity.holds, true);
  expect(
    'same-slot failed item',
    firstReplacement.workItemId,
    expected.sameSlotQ2.failedWorkItemId,
  );
  expect(
    'same-slot next entry',
    {
      sequence: q2Entry.sequence,
      selectionIndex: q2Entry.selectionIndex,
      generation2ReserveRankPosition: q2Entry.generation2ReserveRankPosition,
      replacedOccupantKind: q2Entry.replacedOccupantKind,
      previousSequenceForSlot: q2Entry.previousSequenceForSlot,
    },
    expected.sameSlotQ2.nextEntry,
  );
  expect(
    'same-slot entry replaces the Window-03 reserve',
    q2Entry.replacedEcheRowKey,
    prospective.entries[3]?.replacementEcheRowKey,
  );
  expect(
    'same-slot refused before adjudication',
    q2RefusedBeforeAdjudication,
    'GENERATION2_ADJUDICATION_REQUIRED',
  );
  expect(
    'same-slot append refused before adjudication',
    q2AppendRefusedBeforeAdjudication,
    'NOTHING_TO_APPEND',
  );
  if (differences.length !== 0) {
    refuse(
      'WINDOW_03_DIFFERS',
      `the derived Window 03 differs from the expectation at ${differences.join(', ')}`,
    );
  }
  if (!preflightOnProspective.operationalPrerequisites.adjudicationHistoryIntegrity) {
    refuse(
      'ADJUDICATION_HISTORY_INTEGRITY',
      'the prospective preflight does not hold history integrity',
    );
  }
  if (gateAtStart.decision !== 'CONTINUE_TO_NEXT_WORK_ITEM') {
    refuse('GATE_NOT_READY', gateAtStart.decision);
  }

  const record: Record<string, unknown> = {
    recordId: 'phase2b-2d-a2-generation2-window-03-offline-readiness-v1',
    recordKind: 'GENERATION2_WINDOW_OFFLINE_READINESS',
    records: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_03_OFFLINE_READINESS_V1',
    status: 'OFFLINE_READINESS',
    task: WINDOW03_READINESS_TASK_ID,
    ownerDecision: WINDOW03_READINESS_OWNER_DECISION,
    terminalState: WINDOW03_READINESS_TERMINAL_STATE,
    recordedAtUtc: WINDOW03_READINESS_RECORDED_AT_UTC,
    recordedAtUtcSource: 'date -u, read from the shell when this readiness was built',
    branch: OPERATIONAL_BRANCH,
    startingHead: WINDOW03_READINESS_STARTING_HEAD,
    generationId: GENERATION2_ID,
    publicSafe: true,
    thisFileAuthorises: [],
    isLiveAuthority: false,
    networkAuthorised: false,
    databaseAuthorised: false,
    ledgerMutationAuthorised: false,
    reserveAssigned: false,
    networkUsed: false,
    databaseUsed: false,
    ledgerMutated: false,
    acquisitionRunCreated: false,
    bound: {
      frozenMethodologyV3AuthorityChain: basis.bound,
      frozenHashes: spec.frozenHashes,
      currentGeneration2Ledger: {
        ...WINDOW03_CURRENT_LEDGER_REVISION,
        nextGeneration2ReservePosition: state.nextGeneration2ReservePosition,
      },
      window01: {
        authority: WINDOW03_W01_PINS.authority,
        liveResult: WINDOW03_W01_PINS.liveResult,
        adjudication: WINDOW03_W01_PINS.adjudication,
        startingLedgerRevisionCommit: WINDOW03_W01_PINS.startingLedgerRevisionCommit,
        startingLedgerFileSha256: window01.startingLedger.fileSha256,
      },
      window02: {
        offlineReadiness: WINDOW03_W02_PINS.offlineReadiness,
        authority: WINDOW03_W02_PINS.authority,
        ledgerAppendCommit: WINDOW03_W02_PINS.ledgerAppendCommit,
        liveResult: WINDOW03_W02_PINS.liveResult,
        adjudication: WINDOW03_W02_PINS.adjudication,
        startingLedgerRevisionCommit: WINDOW03_W02_PINS.startingLedgerRevisionCommit,
        startingLedgerFileSha256: window02.startingLedger.fileSha256,
      },
      window02ValidationChain: {
        originalValidation: {
          recordedIn: WINDOW03_W02_VALIDATION_CHAIN.stopAudit,
          formalVerdict: chain.originalValidationVerdict,
          reclassified: chain.originalValidationReclassified,
        },
        ownerRuling: WINDOW03_W02_VALIDATION_CHAIN.ownerRuling,
        ownerRulingDecisions: chain.ownerRulingDecisions,
        reproof: WINDOW03_W02_VALIDATION_CHAIN.reproof,
        reproofExitCode: chain.reproofExitCode,
        closureAudit: WINDOW03_W02_VALIDATION_CHAIN.closureAudit,
        adjudicationValidationResult: chain.adjudicationValidationResult,
        adjudicationPermittedOnlyThroughRulingAndReproof: true,
      },
      stateBridge: {
        version: HISTORY_BRIDGE_VERSION,
        implementation: [
          'src/test/harness/phase2b2d/generation2History/adjudicationHistory.ts',
          'src/test/harness/phase2b2d/generation2History/historyIntegrity.ts',
        ],
        genericMachineryChangedByThisTask: false,
      },
      derivedWindow03SpecHash: spec.windowSpecHash,
    },
    window02P5Disposition: {
      ownerRuling: WINDOW02_P5_OWNER_RULING,
      p5: chain.p5,
      meaning: [
        'P5 fired validly, after the fifth and final authorised Window-02 item',
        'P5 was not weakened and not reinterpreted',
        'no Window-02 evidence was invalidated and no Window-02 retry is required',
        'the owner separately permits OFFLINE preparation of the next bounded window only',
      ],
      generalRule: false,
      futureP5: 'a future P5 still operates exactly as frozen; this ruling covers Window 02 only',
    },
    adjudicationHistory: {
      explicitOrderedBindingsOnly: true,
      directoryDiscovery: false,
      order: ['Window 01', 'Window 02'],
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
      historicalRunReferences: runRefs.length,
      historicalRunReferencesUnique: new Set(runRefs).size === runRefs.length,
      crossWindowRunReferenceCheck:
        'requireUniqueHistoricalRunReferences, at this readiness layer: the generic bridge refuses a repeat WITHIN a window, this refuses one ACROSS windows',
      rebuiltWindowSpecHashes: integrity.rebuiltWindowSpecHashes,
      rebuiltEqualsAuthorityBound: replay.windows.map(
        (window, k) => integrity.rebuiltWindowSpecHashes[k] === window.windowSpecHash,
      ),
    },
    operationalPrerequisite: {
      name: ADJUDICATION_HISTORY_INTEGRITY,
      isFrozenP7: false,
      windowCount: integrity.windowCount,
      holds: integrity.holds,
      onCurrentLedgerPreflight:
        preflightOnCurrent.operationalPrerequisites.adjudicationHistoryIntegrity,
      onProspectiveLedgerPreflight:
        preflightOnProspective.operationalPrerequisites.adjudicationHistoryIntegrity,
      readinessRequiresBoth:
        'P7 18/18 on the prospective append AND two-window ADJUDICATION_HISTORY_INTEGRITY; the second is never folded into the first',
    },
    currentState: {
      derivedBy:
        'replay of the explicit history Window 01 -> Window 02 over the canonical ledger, never carried baseline + ledger alone',
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
      rule: 'APPROVE_ASCENDING_SELECTION_INDEX_RESERVE_ASSIGNMENT_V1: every current failed-slot obligation, ascending, next unused Generation-2 positions monotonically; derived by the landed planner',
      assignments: q1,
    },
    prospectiveAppend: {
      inMemoryOnly: true,
      persisted: false,
      recordedAtUtc: WINDOW03_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
      recordedAtUtcIsIllustrative:
        'a live authority supplies its own recordedAtUtc, so the live entry hashes and ledgerHash will differ from these by construction',
      replacedOccupants: occupantsBefore.map((o) => ({
        selectionIndex: o.selectionIndex,
        derivedBy: 'resolveCrossGenerationOccupant (landed)',
        kind: o.kind,
        generation1OccupantKind: o.generation1OccupantKind,
        generation2EntryCountForSlot: o.generation2EntryCountForSlot,
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
          k === 0 ? 'canonical entry 2 entryHash' : 'prospective sequence 3 entryHash',
        entryHash: entry.entryHash,
        executionEntrySha256: append.appendedExecutionEntrySha256[k],
      })),
      canonicalEntry2EntryHash: current.entries[2]?.entryHash,
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
        'after the append, entries 3 and 4 lie beyond every adjudicated window, so the bridge reads them as REPLACEMENT_ASSIGNED_AWAITING_EXECUTION - never success or failure',
    },
    window03: {
      windowSpecHash: spec.windowSpecHash,
      independentRebuild: {
        rebuiltWindowSpecHash: rebuiltSpec.windowSpecHash,
        canonicalBytesEqual: specRebuildIdentical,
        recomputedHashEqual: recomputeWindowSpecHash(spec) === spec.windowSpecHash,
      },
      plannedWindowSize: spec.plannedWindowSize,
      rule: 'every Q1 replacement first, then the lowest NEVER_STARTED original primaries ascending, to the planned size (the unchanged builder)',
      order: spec.workItems.map((item) => item.workItemId),
      composition,
      replacementItems: replacements,
      primaryItems: spec.workItems.length - replacements,
      workItems: spec.workItems,
      executionBindings,
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
          'frame, draw, immutable Generation-1 ledger, Generation-2 reserve schedule, Generation-2 ledger; adjudication files are NOT a P7 input',
        invariantCount: GENERATION2_P7_INVARIANT_NAMES.length,
        invariants: [...GENERATION2_P7_INVARIANT_NAMES],
        onCurrentCommittedLedger: {
          trueCount:
            GENERATION2_P7_INVARIANT_NAMES.length - falseInvariants(preflightOnCurrent).length,
          falseInvariants: falseInvariants(preflightOnCurrent),
          vector: Object.fromEntries(
            GENERATION2_P7_INVARIANT_NAMES.map((name) => [
              name,
              preflightOnCurrent.invariants[name],
            ]),
          ),
          gateDecisionWithZeroCompleted: gateOnCurrent.decision,
          meaning:
            'Window 03 cannot start until its Q1 append (slot 82 -> reserve 3, slot 83 -> reserve 4) is persisted, committed and pushed before any institution network; only the two persistence-dependent invariants are false',
        },
        onProspectivePostAppendLedger: {
          trueCount:
            GENERATION2_P7_INVARIANT_NAMES.length - falseInvariants(preflightOnProspective).length,
          allTrue: falseInvariants(preflightOnProspective).length === 0,
          falseInvariants: falseInvariants(preflightOnProspective),
          gateDecisionWithZeroCompleted: gateAtStart.decision,
          nextWorkItemId: gateAtStart.nextWorkItemId,
        },
      },
      p8: FROZEN_P8_DEFINITION,
      operationalConcurrencyIntegrity: LIVE_CRITICAL_SECTION_POLICY,
    },
    sameSlotQ2Proof: {
      synthetic: true,
      inMemoryOnly: true,
      scenario: `${firstReplacement.workItemId} fails in a synthetic, adjudicated Window 03 (every other item succeeds)`,
      syntheticHistoryIntegrity: syntheticIntegrity.holds,
      q1AfterSyntheticWindow: syntheticQ1,
      nextEntry: {
        sequence: q2Entry.sequence,
        selectionIndex: q2Entry.selectionIndex,
        generation2ReserveRankPosition: q2Entry.generation2ReserveRankPosition,
        split: q2Entry.split,
        reason: q2Entry.reason,
        replacedOccupantKind: q2Entry.replacedOccupantKind,
        previousSequenceForSlot: q2Entry.previousSequenceForSlot,
        replacesTheProspectiveSequence3Reserve: true,
      },
      nextReserveIsAfterAllWindow03Q1Assignments: true,
      secondReplacementBeforeAdjudication: {
        ledgerReplayRefusal: q2RefusedBeforeAdjudication,
        appendRefusal: q2AppendRefusedBeforeAdjudication,
      },
      appended: false,
    },
    negativeAttacks: {
      provedBy: 'src/test/unit/orgunitCorpus2DA2Generation2Window03Readiness.test.ts',
      allRefuse: true,
      resealedWhereMeaningful: true,
      attacks: [...WINDOW03_NEGATIVE_ATTACKS],
    },
    canonicalGeneration2Ledger: {
      path: WINDOW03_CURRENT_LEDGER_REVISION.path,
      entryCountStill: current.entries.length,
      ledgerHashStill: current.ledgerHash,
      nextGeneration2ReserveStill: state.nextGeneration2ReservePosition,
      reserve3Assigned: false,
      reserve4Assigned: false,
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
    nextOwnerDecision: `whether to authorise EXACTLY ONE bounded live Generation-2 Window 03: ${spec.workItems.map((item) => item.workItemId).join(' -> ')}, with the reserve-3 and reserve-4 assignments (slots 82 and 83) committed and pushed BEFORE any institution network. Not granted here`,
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
