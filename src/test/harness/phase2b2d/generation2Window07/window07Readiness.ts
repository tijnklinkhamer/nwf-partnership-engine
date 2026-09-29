/**
 * THE GENERATION-2 WINDOW-07 OFFLINE READINESS RECORD, built PURELY from
 * committed bytes through the UNCHANGED generic adjudication-aware machinery
 * as hardened after Window 06.
 *
 * It derives - never asserts - in this order:
 *
 *   1. the post-Window-06 hardening it stands on (record pinned, authorises
 *      nothing, terminal state ready for exactly this readiness);
 *   2. the explicit six-window history Window 01 -> 02 -> 03 -> 04 -> 05 ->
 *      06, every record re-hashed against its pin; Windows 01-05 exactly as
 *      Window-06 readiness bound them (Window 04 with its pinned owner
 *      authority-shape correction, Window 05 through LIVE_RESULT V2), Window 06
 *      through LIVE_RESULT V3 (never V1 or V2) with NO correction; no directory
 *      scan, no glob, no "latest";
 *   3. every earlier validation chain, plus Window 06's own: V1 -> V2 -> V3
 *      provenance, the G2P:98 concurrency ruling, the post-final P5 ruling,
 *      the first (exit 1, not accepted) validation, the single accepted
 *      post-fix re-proof and the temporal test-scoping ruling - all kept as
 *      Window-06 facts that Window 07 does NOT inherit;
 *   4. the hardened LIVE_RESULT contract over all six canonical bindings, and
 *      ADJUDICATION_HISTORY_INTEGRITY (with global run-reference uniqueness);
 *   5. the replayed current state, the complete Q1 by the landed planner,
 *      each replaced occupant by the landed resolver (slot 96's occupant is
 *      itself a Generation-2 reserve replacement), and the prospective
 *      IN-MEMORY append with its post-append state;
 *   6. the Window-07 spec by the unchanged builder (built twice, compared),
 *      its execution bindings, P2/P5 thresholds, P6, and frozen P7 on the
 *      current committed ledger (intentional pre-append refusal) and on the
 *      prospective ledger (18/18);
 *   7. that a prospective canonical Window-07 authority carries
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
  P2_BATCH_PERCENT_STRICTLY_ABOVE,
  P2_CONSECUTIVE_ROBOTS_REFUSALS,
  P5_BATCH_PERCENT_STRICTLY_ABOVE,
  P5_MIN_RAW_PAGE_EVIDENCE,
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
  validateGeneration2LiveResultForHistory,
  type CommittedRecordBinding,
  type Generation2AdjudicationHistory,
  type Generation2LiveResultExpectation,
  type Generation2WindowHistoryBinding,
  type ReplayedWindow,
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
import {
  bindWindow05Record,
  fiveWindowHistoryForWindow06,
  verifyWindow05Validation,
} from '../generation2Window06/window06Readiness.js';
import {
  EXPECTED_WINDOW_07,
  WINDOW07_CANONICAL_LIVE_RESULTS,
  WINDOW07_CURRENT_LEDGER_REVISION,
  WINDOW07_HARDENING_PINS,
  WINDOW07_PLANNED_SIZE,
  WINDOW07_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
  WINDOW07_READINESS_OWNER_DECISION,
  WINDOW07_READINESS_RECORDED_AT_UTC,
  WINDOW07_READINESS_STARTING_HEAD,
  WINDOW07_READINESS_TASK_ID,
  WINDOW07_READINESS_TERMINAL_STATE,
  WINDOW07_W01_PINS,
  WINDOW07_W02_PINS,
  WINDOW07_W03_PINS,
  WINDOW07_W04_PINS,
  WINDOW07_W05_PINS,
  WINDOW07_W06_PINS,
  WINDOW07_W06_STARTING_LEDGER_REVISION,
} from './window07Contract.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const bytesOf = (text: string): number => Buffer.byteLength(text, 'utf8');
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const WINDOW07_HISTORY_ATTACKS = [
  'missing Window 01',
  'missing Window 06',
  'reordered history',
  'duplicated window ordinal',
  'edited historical authority',
  'edited Window-06 LIVE_RESULT (re-sealed)',
  'edited Window-06 adjudication (re-sealed)',
  'Window-06 LIVE_RESULT V1 or V2 substituted for V3',
  'malformed historical LIVE_RESULT refused through the hardened contract',
  'Window-06 validation chain altered (re-sealed)',
  'Window-06 rulings converted into a Window-07 waiver',
  'Window-04 correction omitted',
  'Window-04 correction attached to Window 06',
  'duplicate historical run reference',
  'wrong starting ledger revision',
  'hardening record altered or missing',
] as const;

export const WINDOW07_Q1_ATTACKS = [
  'incomplete Q1 (one obligation only, or none)',
  'reversed Q1 [99, 96]',
  'skipped reserve (7 or 8 skipped)',
  'reserve reused (slot 99 given reserve 7)',
  'wrong replacement reason',
  'a fake third Q1 obligation',
  'slot 96 lineage rewritten to GENERATION1_TERMINAL_OCCUPANT / null (re-chained)',
  'slot 96 previousSequenceForSlot pointing at another sequence (re-chained)',
  'slot 99 given a Generation-2 predecessor (re-chained)',
  'canonical ledger mutated during readiness',
] as const;

export const WINDOW07_WINDOW_ATTACKS = [
  'unauthorised sixth work item',
  'G2P:100 placed before a Q1 replacement',
  'G2P:103 substituted for 100/101/102',
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
// Inputs and the explicit six-window history.
// ---------------------------------------------------------------------------

export interface Window07Inputs {
  /** Committed JSON by path; the genesis path carries the GENESIS revision's bytes. */
  readonly committed: CommittedTexts;
  /** The canonical ledger's current committed bytes (the seven-entry revision). */
  readonly currentLedgerText: string;
  /** Windows 01, 02, 03 and 04's starting revisions, in that order. */
  readonly startingLedgerTexts: readonly [string, string, string, string];
  /** The five-entry revision Windows 05 and 06 both started from. */
  readonly fiveEntryLedgerText: string;
  /** `git show <Window-04 authority commit>:<its path>`. */
  readonly window04AuthorityTextAtCommit: string;
  /** `git show <pinned commit>:<path>` for every Window-05 record. */
  readonly window05TextsAtCommit: ReadonlyMap<string, string>;
  /** `git show <pinned commit>:<path>` for every Window-06 record. */
  readonly window06TextsAtCommit: ReadonlyMap<string, string>;
  /** Committed audit bytes by path (the Window-02 stop and closure audits). */
  readonly auditTexts: ReadonlyMap<string, string>;
}

const obj = (value: unknown): Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {};

/** Window 06's history binding: V3, NO correction, the five-entry starting revision. */
export function window06HistoryBinding(inputs: Window07Inputs): Generation2WindowHistoryBinding {
  const at = inputs.window06TextsAtCommit;
  if (
    sha256(inputs.fiveEntryLedgerText) !== WINDOW07_W06_STARTING_LEDGER_REVISION.fileSha256 ||
    bytesOf(inputs.fiveEntryLedgerText) !== WINDOW07_W06_STARTING_LEDGER_REVISION.bytes
  ) {
    refuse('HISTORY_BINDING_NOT_PINNED', 'the Window-06 starting revision is not the pinned one');
  }
  return {
    windowOrdinal: 6,
    authority: bindWindow05Record(WINDOW07_W06_PINS.authority, inputs.committed, at),
    liveResult: bindWindow05Record(WINDOW07_W06_PINS.liveResult, inputs.committed, at),
    adjudication: bindWindow05Record(WINDOW07_W06_PINS.adjudication, inputs.committed, at),
    startingLedgerText: inputs.fiveEntryLedgerText,
  };
}

/**
 * Window 01 -> 02 -> 03 -> 04 (with its correction) -> 05 -> 06 from committed
 * bytes. `withCorrection: false` is Window 04's ORIGINAL, uncorrected shape,
 * kept so its refusal stays provable.
 */
export function sixWindowHistoryForWindow07(
  inputs: Window07Inputs,
  options: { readonly withCorrection: boolean } = { withCorrection: true },
): Generation2AdjudicationHistory {
  const five = fiveWindowHistoryForWindow06(
    {
      committed: inputs.committed,
      currentLedgerText: inputs.fiveEntryLedgerText,
      startingLedgerTexts: inputs.startingLedgerTexts,
      window04AuthorityTextAtCommit: inputs.window04AuthorityTextAtCommit,
      window05TextsAtCommit: inputs.window05TextsAtCommit,
      auditTexts: inputs.auditTexts,
    },
    options,
  );
  return { windows: [...five.windows, window06HistoryBinding(inputs)] };
}

// ---------------------------------------------------------------------------
// The hardening basis.
// ---------------------------------------------------------------------------

export interface HardeningBasis {
  readonly record: Json;
  readonly canonicalResults: readonly Json[];
}

/** The post-Window-06 hardening record: pinned, authorises nothing, ready for exactly this task. */
export function verifyHardening(
  texts: ReadonlyMap<string, string>,
  pins: typeof WINDOW07_HARDENING_PINS = WINDOW07_HARDENING_PINS,
): HardeningBasis {
  const text = texts.get(pins.record.path);
  if (
    text === undefined ||
    sha256(text) !== pins.record.sha256 ||
    bytesOf(text) !== pins.record.bytes
  ) {
    refuse('HARDENING_NOT_PINNED', `${pins.record.path} is not the pinned committed record`);
  }
  const record = obj(JSON.parse(text) as unknown);
  const side = obj(record.sideEffects);
  const results = (
    Array.isArray(obj(record.canonicalLiveResultPositiveChecks).results)
      ? (obj(record.canonicalLiveResultPositiveChecks).results as unknown[])
      : []
  ).map(obj);
  const zeroSideEffects =
    Object.keys(side).length > 0 &&
    Object.values(side).every((value) => value === 0 || value === false);
  if (
    record.recordKind !== 'GENERATION2_GOVERNANCE_HARDENING' ||
    record.generationId !== GENERATION2_ID ||
    record.isLiveAuthority !== false ||
    !Array.isArray(record.thisFileAuthorises) ||
    record.thisFileAuthorises.length !== 0 ||
    record.terminalState !== pins.terminalState ||
    record.startingHead !== pins.startingHead ||
    record.hardeningCodeCommit !== pins.codeCommit ||
    !zeroSideEffects ||
    side.window07Authority !== false ||
    side.window07Execution !== false ||
    side.g2p100Execution !== false ||
    canonicalStringify(
      results.map((r) => [r.window, `docs/evaluation/${String(r.liveResult)}`]),
    ) !== canonicalStringify(WINDOW07_CANONICAL_LIVE_RESULTS.map((path, k) => [k + 1, path])) ||
    !results.every((r) => r.result === 'PASS' && r.items === 5)
  ) {
    refuse(
      'HARDENING_NOT_ACCEPTED',
      'the hardening record is not the pinned, non-authorising basis',
    );
  }
  return { record, canonicalResults: results };
}

// ---------------------------------------------------------------------------
// The Window-06 closure chain and its window-scoped rulings.
// ---------------------------------------------------------------------------

interface Bytes {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface Window06Closure {
  readonly liveResultProvenance: Json;
  readonly rulings: Json;
  readonly validation: Json;
  readonly concurrency: Json;
  readonly p5: Json;
}

/**
 * Window 06 was adjudicated ONLY through: LIVE_RESULT V1 (concurrency stop in
 * G2P:98) -> the concurrency ruling -> V2 (P5 after G2P:99) -> the V3
 * shape-correction ruling -> V3 -> the post-final P5 ruling -> the first
 * validation (exit 1, NOT accepted) -> the validation-failure and temporal
 * test-scoping ruling -> ONE accepted post-fix re-proof -> the adjudication,
 * which derives its accepted validation from that re-proof alone. Every
 * ruling is WINDOW_06_ONLY; none is a waiver.
 *
 * @param texts  committed bytes by path
 * @param pins   defaults to the pinned Window-06 records; a test that
 *               RE-SEALS a record passes the re-sealed pins so that only the
 *               semantic checks below can refuse it
 */
export function verifyWindow06Closure(
  texts: ReadonlyMap<string, string>,
  pins: typeof WINDOW07_W06_PINS = WINDOW07_W06_PINS,
): Window06Closure {
  const fail = (what: string): never => refuse('WINDOW_06_CLOSURE_NOT_ACCEPTED', what);
  const record = (pin: Bytes): Json => {
    const value = texts.get(pin.path);
    if (value === undefined || sha256(value) !== pin.sha256 || bytesOf(value) !== pin.bytes) {
      refuse('VALIDATION_CHAIN_NOT_PINNED', `${pin.path} is not the pinned committed record`);
    }
    return obj(JSON.parse(value) as unknown);
  };
  const names = (ref: unknown, pin: Bytes): boolean =>
    obj(ref).path === pin.path && obj(ref).sha256 === pin.sha256 && obj(ref).bytes === pin.bytes;
  const same = (a: unknown, b: unknown): boolean => canonicalStringify(a) === canonicalStringify(b);

  const ruling = (pin: Bytes, decisions: readonly string[] | null): void => {
    const r = record(pin);
    if (
      r.recordKind !== 'GENERATION2_OWNER_RULING' ||
      r.generationId !== GENERATION2_ID ||
      r.isLiveAuthority !== false ||
      r.scope !== 'WINDOW_06_ONLY' ||
      (decisions !== null && !same(r.ownerDecisions, decisions))
    ) {
      fail(`${pin.path} is not a Window-06-only owner ruling with its pinned decisions`);
    }
  };
  ruling(pins.concurrencyDeviationOwnerRuling, pins.ownerDecisions.concurrencyDeviation);
  ruling(pins.postFinalP5OwnerRuling, pins.ownerDecisions.postFinalP5);
  ruling(
    pins.validationFailureAndTemporalTestScopingOwnerRuling,
    pins.ownerDecisions.validationFailureAndTemporalTestScoping,
  );
  ruling(pins.liveResultV3CorrectionOwnerRuling, null);

  const v3 = record(pins.liveResult);
  const v2 = record(pins.liveResultV2);
  const v1 = record(pins.liveResultV1);
  const correction = obj(v3.correction);
  if (
    [v1, v2, v3].some((r) => r.recordKind !== 'GENERATION2_WINDOW_LIVE_RESULT') ||
    !Array.isArray(obj(v3.stops).itemsNotStarted) ||
    obj(v3.stops).itemsNotStarted.length !== 0 ||
    obj(v2.stops).itemsNotStarted !== undefined ||
    obj(correction.ownerRuling).path !== pins.liveResultV3CorrectionOwnerRuling.path ||
    obj(correction.ownerRuling).sha256 !== pins.liveResultV3CorrectionOwnerRuling.sha256
  ) {
    fail('LIVE_RESULT V3 is not the ruled V2 shape correction');
  }

  const adjudication = record(pins.adjudication);
  const bound = obj(adjudication.bound);
  const live = obj(bound.liveResult);
  const decisionsOf = (key: string): unknown => obj(bound[key]).decisions;
  if (
    adjudication.recordKind !== 'GENERATION2_WINDOW_EVIDENCE_ADJUDICATION' ||
    adjudication.generationId !== GENERATION2_ID ||
    adjudication.isLiveAuthority !== false ||
    adjudication.terminalState !== pins.adjudication.terminalState ||
    !names(live, pins.liveResult) ||
    live.canonicalAdjudicationBinding !== true ||
    !names(live.supersedesImmutableV2, pins.liveResultV2) ||
    !names(live.supersedesImmutableV1, pins.liveResultV1) ||
    live.v1AndV2RemainImmutableHistoricalEvidence !== true ||
    !names(bound.authority, pins.authority) ||
    !names(bound.offlineReadiness, pins.offlineReadiness) ||
    !names(bound.liveResultV3CorrectionOwnerRuling, pins.liveResultV3CorrectionOwnerRuling) ||
    !names(bound.concurrencyDeviationOwnerRuling, pins.concurrencyDeviationOwnerRuling) ||
    !names(bound.postFinalP5OwnerRuling, pins.postFinalP5OwnerRuling) ||
    !names(
      bound.validationFailureAndTemporalTestScopingOwnerRuling,
      pins.validationFailureAndTemporalTestScopingOwnerRuling,
    ) ||
    !same(
      decisionsOf('concurrencyDeviationOwnerRuling'),
      pins.ownerDecisions.concurrencyDeviation,
    ) ||
    !same(decisionsOf('postFinalP5OwnerRuling'), pins.ownerDecisions.postFinalP5) ||
    !same(
      decisionsOf('validationFailureAndTemporalTestScopingOwnerRuling'),
      pins.ownerDecisions.validationFailureAndTemporalTestScoping,
    ) ||
    obj(bound.liveResultV3CorrectionOwnerRuling).decision !==
      pins.ownerDecisions.liveResultV3Correction ||
    obj(bound.ledger).commit !== pins.ledgerAppendCommit
  ) {
    fail('the Window-06 adjudication does not bind the pinned V3, authority and rulings');
  }

  const validation = obj(adjudication.validation);
  const first = obj(validation.firstPostFinalP5Validation);
  const re = obj(validation.ownerAuthorisedPostFixReproof);
  if (
    validation.exitCode !== 0 ||
    validation.result !== pins.validationResult ||
    validation.fullValidationRunsAfterThisRecord !== 0 ||
    typeof validation.resultDerivedFrom !== 'string' ||
    !validation.resultDerivedFrom.includes('ownerAuthorisedPostFixReproof ONLY') ||
    first.exitCode !== 1 ||
    first.reclassified !== false ||
    first.acceptedForAdjudication !== false ||
    first.formalVerdict !== pins.firstValidationVerdict ||
    re.runs !== 1 ||
    re.secondAttempt !== false ||
    re.exitCode !== 0 ||
    re.worktreeCleanAtLaunch !== true ||
    re.headValidated !== pins.testCorrectionCommit ||
    re.testCorrectionCommit !== pins.testCorrectionCommit ||
    re.EXTERNAL_COMPETING_PROCESS !== 0 ||
    re.ANCESTRY_UNPROVED !== 0 ||
    re.exclusivityVerdict !== pins.reproofVerdict ||
    re.doesNotRewriteTheFirstValidation !== true
  ) {
    fail('the Window-06 adjudication is not derived from the single accepted post-fix re-proof');
  }

  const concurrency = obj(obj(adjudication.operationalDeviations).concurrency);
  if (
    concurrency.item !== pins.concurrency.item ||
    concurrency.classification !== pins.concurrency.classification ||
    concurrency.inItemExecutionExclusivity !== pins.concurrency.inItemExecutionExclusivity ||
    concurrency.notP8 !== true ||
    concurrency.evidenceInvalidated !== false ||
    concurrency.notRewrittenAsClean !== true ||
    concurrency.scope !== 'WINDOW_06_ONLY'
  ) {
    fail('the G2P:98 concurrency deviation is not preserved as recorded');
  }

  const p5 = obj(adjudication.p5);
  if (
    p5.fired !== true ||
    p5.stillFired !== true ||
    p5.waived !== false ||
    p5.weakened !== false ||
    p5.reinterpreted !== false ||
    p5.priorWindowPostFinalWaiverApplied !== false ||
    !Array.isArray(p5.inheritedWaivers) ||
    p5.inheritedWaivers.length !== 0 ||
    !same(p5.lowYieldItems, pins.p5LowYieldItems)
  ) {
    fail('the Window-06 post-final P5 is not preserved as a fired, unwaived gate');
  }

  return {
    liveResultProvenance: {
      canonicalAdjudicatedBinding: pins.liveResult.path,
      immutableV1: pins.liveResultV1.path,
      immutableV2: pins.liveResultV2.path,
      v3DiffersFromV2Only: live.v3DiffersFromV2Only,
      v3ShapeCorrectionRuling: pins.liveResultV3CorrectionOwnerRuling.path,
    },
    rulings: {
      concurrencyDeviation: pins.ownerDecisions.concurrencyDeviation,
      postFinalP5: pins.ownerDecisions.postFinalP5,
      validationFailureAndTemporalTestScoping:
        pins.ownerDecisions.validationFailureAndTemporalTestScoping,
      liveResultV3Correction: pins.ownerDecisions.liveResultV3Correction,
      everyRulingScope: 'WINDOW_06_ONLY',
      transferredToWindow07: false,
    },
    validation: {
      firstPostFinalP5Validation: {
        exitCode: first.exitCode,
        formalVerdict: first.formalVerdict,
        reclassified: first.reclassified,
        acceptedForAdjudication: first.acceptedForAdjudication,
        headValidated: first.headValidated,
      },
      ownerAuthorisedPostFixReproof: {
        runs: re.runs,
        exitCode: re.exitCode,
        headValidated: re.headValidated,
        exclusivityVerdict: re.exclusivityVerdict,
        externalCompetingProcess: re.EXTERNAL_COMPETING_PROCESS,
        ancestryUnproved: re.ANCESTRY_UNPROVED,
      },
      result: validation.result,
      acceptedFromTheSinglePostFixReproofOnly: true,
    },
    concurrency: {
      item: concurrency.item,
      classification: concurrency.classification,
      inItemExecutionExclusivity: concurrency.inItemExecutionExclusivity,
      notP8: concurrency.notP8,
      evidenceInvalidated: concurrency.evidenceInvalidated,
      window06Only: true,
      inheritedByWindow07: false,
    },
    p5: {
      fired: p5.fired,
      lowYieldItems: p5.lowYieldItems,
      ownerDisposition: p5.ownerDisposition,
      waived: p5.waived,
      window06Only: true,
      inheritedByWindow07: false,
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

/** The contract's expectation, from the authority and the replayed ledger - never from the LIVE_RESULT. */
export function liveResultExpectationFor(
  binding: Generation2WindowHistoryBinding,
  replayed: ReplayedWindow,
): Generation2LiveResultExpectation {
  const authority = JSON.parse(binding.authority.text) as Json;
  return {
    windowOrdinal: binding.windowOrdinal,
    authority: binding.authority,
    windowSpecHash: authority.boundWindowSpec.windowSpecHash,
    authorisedWorkItems: authority.authorisedWorkItems,
    exactOrder: authority.exactOrder,
    ledgerHash: replayed.ledgerHashAfterAppend,
    ledgerEntryCount: replayed.startingLedger.entryCount + replayed.consumedLedgerSequences.length,
  };
}

// ---------------------------------------------------------------------------
// The readiness.
// ---------------------------------------------------------------------------

export interface Window07Readiness {
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

export function buildWindow07Readiness(inputs: Window07Inputs): Window07Readiness {
  const { committed, currentLedgerText } = inputs;
  const assessment = assessCommittedInputs(committed);
  const basis = assessment.basis;
  if (basis === null) refuse('BASIS_NOT_EXACT', assessment.failures.join(' | '));
  if (
    sha256(currentLedgerText) !== WINDOW07_CURRENT_LEDGER_REVISION.fileSha256 ||
    bytesOf(currentLedgerText) !== WINDOW07_CURRENT_LEDGER_REVISION.bytes
  ) {
    refuse(
      'CURRENT_LEDGER_NOT_CANONICAL',
      'the current ledger is not the pinned seven-entry revision',
    );
  }
  const current = parseOperationalGeneration2Ledger(
    JSON.parse(currentLedgerText) as unknown,
    basis.genesis,
  );

  // 1. The hardening basis.
  const hardening = verifyHardening(committed);

  // 2. Explicit history: Window 04 with its explicit correction, Windows 05/06 with none.
  const history = sixWindowHistoryForWindow07(inputs);
  const uncorrected = sixWindowHistoryForWindow07(inputs, { withCorrection: false });
  const w06Binding = history.windows[5]!;
  const w06Authority = JSON.parse(w06Binding.authority.text) as Json;

  // 3. Validation chains and the window-scoped rulings.
  const window05Validation = verifyWindow05Validation(committed);
  const window06Closure = verifyWindow06Closure(committed);

  // 4. History integrity (operational prerequisite, not P7); the uncorrected history must refuse.
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

  // 4b. The hardened LIVE_RESULT contract, explicitly, over all six canonical bindings.
  const liveResultContract = history.windows.map((binding, k) => {
    const replayed = replay.windows[k]!;
    const items = validateGeneration2LiveResultForHistory(
      binding.liveResult,
      liveResultExpectationFor(binding, replayed),
    );
    return {
      window: binding.windowOrdinal,
      liveResult: binding.liveResult.path,
      sha256: binding.liveResult.sha256,
      result: 'PASS',
      items: items.length,
      runRefsEqualReplay:
        canonicalStringify(items.map((i) => i.runRefSha256)) ===
        canonicalStringify(replayed.executed.map((e) => e.runRefSha256)),
    };
  });
  const binding = (pin: Bytes): CommittedRecordBinding => {
    const text = committed.get(pin.path) ?? '';
    return { path: pin.path, sha256: sha256(text), text };
  };
  const nonCanonical = {
    window05V1: refusalCode(() =>
      validateGeneration2LiveResultForHistory(
        binding(WINDOW07_W05_PINS.liveResultV1),
        liveResultExpectationFor(history.windows[4]!, replay.windows[4]!),
      ),
    ),
    window06V1: refusalCode(() =>
      validateGeneration2LiveResultForHistory(
        binding(WINDOW07_W06_PINS.liveResultV1),
        liveResultExpectationFor(w06Binding, replay.windows[5]!),
      ),
    ),
    window06V2: refusalCode(() =>
      validateGeneration2LiveResultForHistory(
        binding(WINDOW07_W06_PINS.liveResultV2),
        liveResultExpectationFor(w06Binding, replay.windows[5]!),
      ),
    ),
  };

  // 5. The replayed state, the complete Q1, the prospective in-memory append.
  const state = deriveGeneration2CurrentState(basis, current, history);
  const q1 = planCompleteQ1(basis, current, history);
  const occupantsBefore = q1.map((assignment) =>
    resolveCrossGenerationOccupant(basis, current, assignment.selectionIndex),
  );
  const append = prepareGeneration2ReplacementAppend({
    basis,
    ledger: current,
    assignments: q1,
    recordedAtUtc: WINDOW07_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
    history,
  });
  const prospectiveLedgerText = `${JSON.stringify(append.nextLedger, null, 2)}\n`;
  const prospective = parseOperationalGeneration2Ledger(
    JSON.parse(prospectiveLedgerText) as unknown,
    basis.genesis,
  );
  const postAppend = deriveGeneration2CurrentState(basis, prospective, history);

  // 6. The spec, built twice by the unchanged builder.
  const buildSpec = () =>
    buildGeneration2WindowSpec({
      basis,
      startingLedger: current,
      startingLedgerFile: { sha256: sha256(currentLedgerText), bytes: bytesOf(currentLedgerText) },
      plannedWindowSize: WINDOW07_PLANNED_SIZE,
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
      const reserve = buildReserveExecutionBinding(
        basis.frameIndex,
        basis.schedule,
        item.generation2ReserveRankPosition!,
      );
      const ranked = basis.frameIndex.ranked[reserve.sourceFrameRankPosition]!;
      const raw = basis.frameIndex.rawByEcheRowKey.get(ranked.echeRowKey)!;
      const scheduled = basis.schedule[reserve.generation2ReserveRankPosition]!;
      return {
        order: spec.workItems.indexOf(item) + 1,
        workItemId: item.workItemId,
        kind: item.kind,
        selectionIndex: item.selectionIndex,
        split: item.split,
        replacementReason: item.replacementReason,
        replacesOccupantKind: item.replacesOccupantKind,
        source: 'frozen Generation-2 reserve schedule entry -> exact frozen frame entry',
        generation2ReserveRankPosition: reserve.generation2ReserveRankPosition,
        sourceFrameRankPosition: reserve.sourceFrameRankPosition,
        rankHash: reserve.rankHash,
        identityEqualsScheduleAndFrame:
          reserve.echeRowKey === scheduled.echeRowKey &&
          reserve.echeRowKey === ranked.echeRowKey &&
          reserve.organisationId === scheduled.organisationId &&
          reserve.organisationId === ranked.organisationId &&
          reserve.rankHash === scheduled.rankHash &&
          reserve.rankHash === ranked.rankHash,
        frameEntrySha256: reserve.frameEntrySha256,
        frameEntrySha256RecomputedAndEqual:
          frameEntrySha256(raw) === reserve.frameEntrySha256 &&
          reserve.frameEntrySha256 === scheduled.frameEntrySha256,
        scheduleEntrySha256: reserve.scheduleEntrySha256,
        rootAuthorityCount: reserve.rootAuthorityCount,
        rootAuthorityCountEqualsSpec: reserve.rootAuthorityCount === item.rootAuthorityCount,
        rootAuthorityTypes: reserve.rootAuthorities.map((authority) => authority.type),
        rootAuthoritiesFromExactFrameEntryInOrder: true,
        identityDigestKind: item.identityDigestKind,
        identityDigest: executionEntrySha256(reserve),
        equalsSpecIdentityDigest: executionEntrySha256(reserve) === item.identityDigest,
      };
    }
    const primary = buildPrimaryExecutionBinding(basis.frameIndex, basis.draw, item.selectionIndex);
    const ranked = basis.frameIndex.ranked[item.selectionIndex]!;
    const slot = basis.draw.selection[item.selectionIndex]!;
    return {
      order: spec.workItems.indexOf(item) + 1,
      workItemId: item.workItemId,
      kind: item.kind,
      selectionIndex: primary.selectionIndex,
      generation2ReserveRankPosition: null,
      split: primary.split,
      replacementReason: null,
      replacesOccupantKind: null,
      source: 'exact frozen original draw selection entry, cross-checked against the frozen frame',
      selectionIndexExact:
        primary.selectionIndex === item.selectionIndex &&
        slot.selectionIndex === item.selectionIndex,
      frameRankPosition: ranked.rankPosition,
      splitExact: primary.split === slot.split && primary.split === item.split,
      identityEqualsDrawAndFrame:
        primary.echeRowKey === slot.echeRowKey &&
        primary.echeRowKey === ranked.echeRowKey &&
        primary.organisationId === slot.organisationId &&
        primary.organisationId === ranked.organisationId &&
        primary.rankHash === slot.rankHash &&
        primary.rankHash === ranked.rankHash,
      frameEntrySha256: frameEntrySha256(basis.frameIndex.rawByEcheRowKey.get(ranked.echeRowKey)!),
      rootAuthorityCount: primary.rootAuthorityCount,
      rootAuthorityCountEqualsSpec: primary.rootAuthorityCount === item.rootAuthorityCount,
      rootAuthorityTypes: primary.rootAuthorities.map((authority) => authority.type),
      rootAuthoritiesFromExactFrameEntryInOrder: true,
      identityDigestKind: item.identityDigestKind,
      identityDigest: primary.drawEntrySha256,
      equalsSpecIdentityDigest: primary.drawEntrySha256 === item.identityDigest,
    };
  });
  // Independent re-derivation of every execution identity, compared digest for digest.
  const rebuiltIdentityDigests = spec.workItems.map((item) =>
    item.kind === 'REPLACEMENT'
      ? executionEntrySha256(
          buildReserveExecutionBinding(
            basis.frameIndex,
            basis.schedule,
            item.generation2ReserveRankPosition!,
          ),
        )
      : buildPrimaryExecutionBinding(basis.frameIndex, basis.draw, item.selectionIndex)
          .drawEntrySha256,
  );

  // 7. The prospective Window-07 authority shape: canonical only, no alias, no inherited correction.
  const w04Binding = history.windows[3]!;
  const prospectiveWindow = synthesiseAdjudicatedWindow({
    basis,
    priorHistory: history,
    startingLedgerText: currentLedgerText,
    prospectiveLedgerText,
    spec,
    verdicts: {},
    runRefSeed: 'window-07-readiness-prospective-authority-shape',
  });
  const prospectiveBinding = prospectiveWindow.history.windows[6]!;
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
  const window06 = replay.windows[5]!;
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
  const reserveIdentities = executionBindings
    .filter((b) => b.kind === 'REPLACEMENT')
    .map((b) => ({
      generation2ReserveRankPosition: b.generation2ReserveRankPosition,
      sourceFrameRankPosition: 'sourceFrameRankPosition' in b ? b.sourceFrameRankPosition : null,
      rankHash: 'rankHash' in b ? b.rankHash : null,
      frameEntrySha256: b.frameEntrySha256,
      scheduleEntrySha256: 'scheduleEntrySha256' in b ? b.scheduleEntrySha256 : null,
    }));
  const p6 = (reserveConsumedCount: number) =>
    p6Fires({
      reserveConsumedCount,
      successfulOrganisationCount: state.successfulOrganisationCount,
    });
  const replacements = spec.workItems.filter((item) => item.kind === 'REPLACEMENT').length;
  const correctedWindows = historyBindingOf(replay).windows.map(
    (window) => 'authorityShapeCorrection' in window,
  );
  const canonicalLedgerBytesUnchanged = currentLedgerText === inputs.currentLedgerText;

  // Derived first; only now compared with the task's expectation.
  const expected = EXPECTED_WINDOW_07;
  const differences: string[] = [];
  const expect = (name: string, derived: unknown, wanted: unknown): void => {
    if (canonicalStringify(derived) !== canonicalStringify(wanted)) differences.push(name);
  };
  expect('history window count', replay.windows.length, 6);
  expect(
    'history ordinals',
    history.windows.map((w) => w.windowOrdinal),
    [1, 2, 3, 4, 5, 6],
  );
  expect('consumed ledger entries', replay.consumedLedgerEntryCount, 7);
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
    'window-06 outcomes',
    window06.executed.map((item) => [item.workItemId, item.verdict, item.q3Reason]),
    expected.window06Outcomes,
  );
  expect('window-06 spec hash pin', window06.windowSpecHash, WINDOW07_W06_PINS.windowSpecHash);
  expect('historical run references', runRefs.length, expected.historicalRunReferenceCount);
  expect('historical run references unique', new Set(runRefs).size, runRefs.length);
  expect(
    'run references per window',
    replay.windows.map((w) => w.executed.length),
    expected.runReferencesPerWindow,
  );
  expect(
    'hardened contract: six canonical bindings pass',
    liveResultContract.map((r) => [r.window, r.liveResult, r.items, r.runRefsEqualReplay]),
    WINDOW07_CANONICAL_LIVE_RESULTS.map((path, k) => [k + 1, path, 5, true]),
  );
  expect(
    'hardening record agrees with the derived contract results',
    hardening.canonicalResults.map((r) => [r.window, r.result, r.items]),
    liveResultContract.map((r) => [r.window, r.result, r.items]),
  );
  expect('non-canonical LIVE_RESULTs refuse', nonCanonical, {
    window05V1: 'HISTORY_LIVE_RESULT_AUTHORITY',
    window06V1: 'HISTORY_RECORD_SHAPE',
    window06V2: 'HISTORY_RECORD_SHAPE',
  });
  expect('correction recorded on window 4 only', correctedWindows, [
    false,
    false,
    false,
    true,
    false,
    false,
  ]);
  expect('uncorrected window 04 refuses', uncorrectedRefusal, 'HISTORY_RECORD_SHAPE');
  expect('uncorrected integrity fails', uncorrectedIntegrity.holds, false);
  expect(
    'w06 authority has the canonical field and no alias',
    [
      Object.hasOwn(w06Authority, 'boundStartingLedger'),
      Object.hasOwn(w06Authority, 'boundLedger'),
    ],
    [true, false],
  );
  expect('one approved correction', APPROVED_AUTHORITY_SHAPE_CORRECTIONS.length, 1);
  expect(
    'approved correction pinned to window 4',
    APPROVED_AUTHORITY_SHAPE_CORRECTIONS[0]?.windowOrdinal,
    4,
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
  expect('ledger hash', state.ledgerHash, WINDOW07_CURRENT_LEDGER_REVISION.ledgerHash);
  expect(
    'next reserve',
    state.nextGeneration2ReservePosition,
    expected.currentState.nextGeneration2Reserve,
  );
  expect('q1 assignments', q1, expected.q1Assignments);
  expect(
    'replaced occupants derived by the resolver',
    occupantsBefore.map((o) => ({
      selectionIndex: o.selectionIndex,
      kind: o.kind,
      generation1OccupantKind: o.generation1OccupantKind,
      generation2ReserveRankPosition: o.generation2ReserveRankPosition,
      generation2LedgerSequence: o.generation2LedgerSequence,
      generation2EntryCountForSlot: o.generation2EntryCountForSlot,
    })),
    expected.replacedOccupants,
  );
  expect(
    'slot 96 occupant is the canonical sequence-6 replacement',
    occupantsBefore[0]?.echeRowKey,
    current.entries[6]?.replacementEcheRowKey,
  );
  expect('prospective append', appended, expected.prospectiveAppend);
  expect(
    'appended entries replace exactly the resolved occupants',
    append.appendedEntries.map((entry) => entry.replacedEcheRowKey),
    occupantsBefore.map((o) => o.echeRowKey),
  );
  expect(
    'append chain',
    append.appendedEntries.map((entry) => entry.previousEntryHash),
    [expected.canonicalEntry6EntryHash, append.appendedEntries[0]?.entryHash],
  );
  expect(
    'canonical entry 6 hash',
    current.entries[6]?.entryHash,
    expected.canonicalEntry6EntryHash,
  );
  expect(
    'reserves come from the schedule in order',
    append.appendedEntries.map((entry) => [
      entry.generation2ReserveRankPosition,
      entry.replacementEcheRowKey ===
        basis.schedule[entry.generation2ReserveRankPosition]?.echeRowKey,
    ]),
    [
      [7, true],
      [8, true],
    ],
  );
  expect('reserve identities', reserveIdentities, expected.reserveIdentities);
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
    'window-07 order',
    spec.workItems.map((item) => item.workItemId),
    expected.workItemIds,
  );
  expect(
    'window-07 splits',
    spec.workItems.map((item) => item.split),
    expected.splits,
  );
  expect(
    'every split equals the frozen draw',
    spec.workItems.map((item) => item.split),
    spec.workItems.map((item) => basis.draw.selection[item.selectionIndex]!.split),
  );
  expect('composition', composition, expected.composition);
  expect(
    'primaries are the lowest never-started ascending',
    spec.workItems.filter((item) => item.kind === 'PRIMARY').map((item) => item.selectionIndex),
    postAppend.neverStarted.slice(0, 3),
  );
  expect('replacement items', replacements, expected.replacementItems);
  expect('primary items', spec.workItems.length - replacements, expected.primaryItems);
  expect(
    'one WEBSITE_CLAIM root authority each',
    executionBindings.map((b) => b.rootAuthorityTypes),
    expected.rootAuthorityTypes,
  );
  expect('spec rebuild identical', specRebuildIdentical, true);
  expect(
    'execution identities rebuilt independently',
    rebuiltIdentityDigests,
    spec.workItems.map((item) => item.identityDigest),
  );
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
        b.rootAuthorityCount === 1 &&
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
    [7, true, 9],
  );
  if (differences.length !== 0) {
    refuse(
      'WINDOW_07_DIFFERS',
      `the derived Window 07 differs from the expectation at ${differences.join(', ')}`,
    );
  }

  const trueCount = (p: Generation2Preflight) =>
    GENERATION2_P7_INVARIANT_NAMES.length - falseInvariants(p).length;
  const pinRef = (pin: Bytes & { readonly commit?: string }) => ({ ...pin });
  const window06Pins = WINDOW07_W06_PINS;
  const record: Record<string, unknown> = {
    recordId: 'phase2b-2d-a2-generation2-window-07-offline-readiness-v1',
    recordKind: 'GENERATION2_WINDOW_OFFLINE_READINESS',
    records: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_07_OFFLINE_READINESS_V1',
    status: 'OFFLINE_READINESS',
    task: WINDOW07_READINESS_TASK_ID,
    ownerDecision: WINDOW07_READINESS_OWNER_DECISION,
    terminalState: WINDOW07_READINESS_TERMINAL_STATE,
    recordedAtUtc: WINDOW07_READINESS_RECORDED_AT_UTC,
    recordedAtUtcSource: 'date -u, read from the shell when this readiness was built',
    branch: OPERATIONAL_BRANCH,
    startingHead: WINDOW07_READINESS_STARTING_HEAD,
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
        ...WINDOW07_CURRENT_LEDGER_REVISION,
        nextGeneration2ReservePosition: state.nextGeneration2ReservePosition,
        lastEntry: {
          sequence: current.entries[6]?.sequence,
          selectionIndex: current.entries[6]?.selectionIndex,
          generation2ReserveRankPosition: current.entries[6]?.generation2ReserveRankPosition,
          entryHash: current.entries[6]?.entryHash,
        },
      },
      postWindow06Hardening: {
        record: WINDOW07_HARDENING_PINS.record,
        codeCommit: WINDOW07_HARDENING_PINS.codeCommit,
        codeCommitChanges: [...WINDOW07_HARDENING_PINS.codeCommitChanges],
        startingHead: WINDOW07_HARDENING_PINS.startingHead,
        terminalState: WINDOW07_HARDENING_PINS.terminalState,
        thisFileAuthorises: hardening.record.thisFileAuthorises,
        isLiveAuthority: hardening.record.isLiveAuthority,
        liveResultContract: WINDOW07_HARDENING_PINS.liveResultContract,
        readinessDependsOnIt:
          'this readiness re-runs the hardened contract over all six canonical bindings and refuses unless the hardening record is the pinned, non-authorising one',
      },
      window01: {
        authority: WINDOW07_W01_PINS.authority,
        liveResult: WINDOW07_W01_PINS.liveResult,
        adjudication: WINDOW07_W01_PINS.adjudication,
        startingLedgerRevisionCommit: WINDOW07_W01_PINS.startingLedgerRevisionCommit,
        startingLedgerFileSha256: replay.windows[0]!.startingLedger.fileSha256,
      },
      window02: {
        authority: WINDOW07_W02_PINS.authority,
        liveResult: WINDOW07_W02_PINS.liveResult,
        adjudication: WINDOW07_W02_PINS.adjudication,
        startingLedgerRevisionCommit: WINDOW07_W02_PINS.startingLedgerRevisionCommit,
        startingLedgerFileSha256: replay.windows[1]!.startingLedger.fileSha256,
      },
      window03: {
        authority: WINDOW07_W03_PINS.authority,
        liveResult: WINDOW07_W03_PINS.liveResult,
        adjudication: WINDOW07_W03_PINS.adjudication,
        startingLedgerRevisionCommit: WINDOW07_W03_PINS.startingLedgerRevisionCommit,
        startingLedgerFileSha256: replay.windows[2]!.startingLedger.fileSha256,
      },
      window04: {
        authority: WINDOW07_W04_PINS.authority,
        liveResult: WINDOW07_W04_PINS.liveResult,
        authorityShapeCorrection: WINDOW07_W04_PINS.correction,
        adjudication: WINDOW07_W04_PINS.adjudication,
        correctionScope: 'pinned authority-shape correction only; Window 04 only',
        startingLedgerRevisionCommit: WINDOW07_W04_PINS.startingLedgerRevisionCommit,
        startingLedgerFileSha256: replay.windows[3]!.startingLedger.fileSha256,
      },
      window05: {
        authority: pinRef(WINDOW07_W05_PINS.authority),
        adjudicatedLiveResult: pinRef(WINDOW07_W05_PINS.liveResult),
        liveResultV1: { ...pinRef(WINDOW07_W05_PINS.liveResultV1), adjudicatedBinding: false },
        liveResultCorrectionOwnerRuling: pinRef(WINDOW07_W05_PINS.liveResultCorrectionOwnerRuling),
        monitorCoverageOwnerRuling: pinRef(WINDOW07_W05_PINS.monitorCoverageOwnerRuling),
        validationOwnerRuling: pinRef(WINDOW07_W05_PINS.validationOwnerRuling),
        validationReproof: pinRef(WINDOW07_W05_PINS.validationReproof),
        adjudication: pinRef(WINDOW07_W05_PINS.adjudication),
        startingLedgerFileSha256: replay.windows[4]!.startingLedger.fileSha256,
      },
      window06: {
        offlineReadiness: pinRef(window06Pins.offlineReadiness),
        authority: pinRef(window06Pins.authority),
        authorityLedgerField: 'boundStartingLedger',
        ledgerAppendCommit: window06Pins.ledgerAppendCommit,
        adjudicatedLiveResult: pinRef(window06Pins.liveResult),
        liveResultV2: { ...pinRef(window06Pins.liveResultV2), adjudicatedBinding: false },
        liveResultV1: { ...pinRef(window06Pins.liveResultV1), adjudicatedBinding: false },
        liveResultV3CorrectionOwnerRuling: pinRef(window06Pins.liveResultV3CorrectionOwnerRuling),
        concurrencyDeviationOwnerRuling: pinRef(window06Pins.concurrencyDeviationOwnerRuling),
        postFinalP5OwnerRuling: pinRef(window06Pins.postFinalP5OwnerRuling),
        validationFailureAndTemporalTestScopingOwnerRuling: pinRef(
          window06Pins.validationFailureAndTemporalTestScopingOwnerRuling,
        ),
        testCorrectionCommit: window06Pins.testCorrectionCommit,
        adjudication: pinRef(window06Pins.adjudication),
        closureChain: window06Pins.closureChain.map(([commit, status, path]) => ({
          commit,
          status,
          path,
        })),
        startingLedgerRevisionCommit: WINDOW07_W06_STARTING_LEDGER_REVISION.appendCommit,
        startingLedgerFileSha256: window06.startingLedger.fileSha256,
      },
      window05Validation: {
        firstValidation: window05Validation.firstValidation,
        reproof: window05Validation.reproof,
        adjudicationValidationResult: window05Validation.result,
        monitorCoverage: { ...window05Validation.monitorCoverage, inheritedByWindow07: false },
      },
      window06Closure,
      genericHistoryIntegrity: {
        version: HISTORY_BRIDGE_VERSION,
        implementation: [
          'src/test/harness/phase2b2d/generation2History/adjudicationHistory.ts',
          'src/test/harness/phase2b2d/generation2History/historyIntegrity.ts',
        ],
        globalRunReferenceRule: GLOBAL_RUN_REFERENCE_UNIQUENESS_RULE,
        modifiedByThisTask: false,
      },
      derivedWindow07SpecHash: spec.windowSpecHash,
    },
    hardenedLiveResultContract: {
      contract: WINDOW07_HARDENING_PINS.liveResultContract,
      implementation: 'src/test/harness/phase2b2d/generation2History/adjudicationHistory.ts',
      calledBy: 'this readiness explicitly, and the generic replay itself (replayWindow delegates)',
      expectationSource:
        'the authority record and the replayed window ledger values, never the LIVE_RESULT',
      canonicalBindings: liveResultContract,
      allSixPass: liveResultContract.length === 6,
      nonCanonicalStayRefused: nonCanonical,
    },
    window04AuthorityShapeCorrection: {
      record: WINDOW07_W04_PINS.correction,
      approvedCorrectionsInTheBridge: APPROVED_AUTHORITY_SHAPE_CORRECTIONS.length,
      suppliedExplicitlyWithWindow04Only: true,
      recordedOnReplayedWindows: correctedWindows,
      withoutCorrection: {
        replayRefusal: uncorrectedRefusal,
        integrityHolds: uncorrectedIntegrity.holds,
      },
      appliesToWindow05: false,
      appliesToWindow06: false,
      appliesToWindow07: false,
      futureWindowFallback: false,
    },
    prospectiveWindow07AuthorityShape: {
      requiredStartingLedgerField: 'boundStartingLedger',
      forbiddenField: 'boundLedger',
      provedOn: 'a synthetic, in-memory Window-07 authority built by the landed synthesiser',
      canonicalFieldPresent: prospectiveShape.canonicalFieldPresent,
      aliasFieldPresent: prospectiveShape.aliasFieldPresent,
      canonicalShapeReplays: prospectiveShape.canonicalReplays === 'NO_REFUSAL',
      aliasOnlyShapeRefusal: prospectiveShape.aliasOnlyRefusal,
      window04CorrectionAttachedRefusal: prospectiveShape.inheritedWindow04CorrectionRefusal,
    },
    adjudicationHistory: {
      explicitOrderedBindingsOnly: true,
      directoryDiscovery: false,
      latestLookup: false,
      order: ['Window 01', 'Window 02', 'Window 03', 'Window 04', 'Window 05', 'Window 06'],
      canonicalLiveResultBindings: [...WINDOW07_CANONICAL_LIVE_RESULTS],
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
        'frozen P7 18/18 on the prospective post-append ledger AND six-window ADJUDICATION_HISTORY_INTEGRITY (with global run-reference uniqueness, the pinned Window-04 correction and the hardened LIVE_RESULT contract); the second is never folded into the first. A live Window-07 driver must require both before every item',
    },
    currentState: {
      derivedBy:
        'replay of the explicit history Window 01 -> 02 -> 03 -> 04 (with its pinned correction) -> 05 -> 06 over the frozen carry-forward baseline and the canonical ledger',
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
      noPartialAssignment: true,
      noSkippedReserve: true,
      noReorder: true,
      noHumanSelectedReplacement: true,
      preNetworkAppendRequired: true,
    },
    prospectiveAppend: {
      inMemoryOnly: true,
      persisted: false,
      recordedAtUtc: WINDOW07_PROSPECTIVE_APPEND_RECORDED_AT_UTC,
      recordedAtUtcKind: 'READINESS_ONLY_ILLUSTRATIVE',
      recordedAtUtcIsIllustrative:
        'READINESS-ONLY: not authority and not the future live append timestamp. A live authority supplies its own operator-observed recordedAtUtc, so the live entry hashes and ledgerHash will differ from these by construction',
      replacedOccupants: occupantsBefore.map((o) => ({
        selectionIndex: o.selectionIndex,
        derivedBy: 'resolveCrossGenerationOccupant (landed)',
        kind: o.kind,
        generation1OccupantKind: o.generation1OccupantKind,
        generation2ReserveRankPosition: o.generation2ReserveRankPosition,
        generation2EntryCountForSlot: o.generation2EntryCountForSlot,
        previousSequenceForSlot: o.generation2LedgerSequence,
        appendedEntryReplacesExactlyThisOccupant: true,
      })),
      replacementOfAReplacement: {
        selectionIndex: 96,
        why: 'slot 96 was already replaced in Window 06 (sequence 6, Generation-2 reserve 6); that reserve occupant failed HOST_UNREACHABLE, so the new entry replaces the GENERATION-2 occupant and chains to its slot predecessor through previousSequenceForSlot = 6',
      },
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
          k === 0 ? 'canonical sequence 6 entryHash' : 'prospective sequence 7 entryHash',
        entryHash: entry.entryHash,
        executionEntrySha256: append.appendedExecutionEntrySha256[k],
      })),
      canonicalSequence6EntryHash: current.entries[6]?.entryHash,
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
        'after the append, entries 7 and 8 lie beyond every adjudicated window, so the bridge reads them as REPLACEMENT_ASSIGNED_AWAITING_EXECUTION - never success or failure',
    },
    window07: {
      windowSpecHash: spec.windowSpecHash,
      independentRebuild: {
        rebuiltWindowSpecHash: rebuiltSpec.windowSpecHash,
        canonicalBytesEqual: specRebuildIdentical,
        recomputedHashEqual: recomputeWindowSpecHash(spec) === spec.windowSpecHash,
        executionIdentitiesRebuiltAndEqual: true,
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
      targetsChosenFromNetworkInformation: false,
    },
    gates: {
      P1_P6_P8:
        'the landed evaluateContinuationWindowGate, unchanged; P7 is the Generation-2 preflight',
      plannedWindowSize: spec.plannedWindowSize,
      frozenDenominator: spec.plannedWindowSize,
      p2: {
        threshold: spec.gateThresholds.p2RobotsRefusalWindowCount,
        counts: ['ROBOTS_BLOCKED_ROOT', 'ROBOTS_UNREADABLE_ROOT'],
        rule: `>= ${String(P2_CONSECUTIVE_ROBOTS_REFUSALS)} consecutive, or strictly more than ${String(P2_BATCH_PERCENT_STRICTLY_ABOVE)}% of the planned window`,
      },
      p5: {
        threshold: spec.gateThresholds.p5LowRawYieldWindowCount,
        rule: `raw page evidence < ${String(P5_MIN_RAW_PAGE_EVIDENCE)} on strictly more than ${String(P5_BATCH_PERCENT_STRICTLY_ABOVE)}% of the planned window`,
        window06PostFinalP5RulingInherited: false,
      },
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
            'Window 07 cannot start until its Q1 append (slot 96 -> reserve 7, slot 99 -> reserve 8) is persisted, committed and pushed before any institution network; only the two persistence-dependent invariants are false, and that refusal is expected, not a defect',
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
      p8Unchanged: true,
      operationalConcurrencyIntegrity: LIVE_CRITICAL_SECTION_POLICY,
      concurrencyIsSeparateFromP8: true,
      priorWindowConcurrencyRulingInherited: false,
      anomalyWaiversAtWindowStart: 0,
    },
    sameSlotAndAdjudicationDiscipline:
      'unchanged landed Q2 same-slot rules; a Window-07 failure authorises NO replacement until the live window is completed or stopped, validated where required, adjudicated and replayed into current state. No speculative assignment during an unadjudicated Window 07',
    negativeAttacks: {
      provedBy: 'src/test/unit/orgunitCorpus2DA2Generation2Window07Readiness.test.ts',
      genericProvedBy: [
        'src/test/unit/orgunitCorpus2DA2Generation2HistoryIntegrity.test.ts',
        'src/test/unit/orgunitCorpus2DA2Generation2LiveResultContract.test.ts',
      ],
      allRefuse: true,
      resealedWhereMeaningful: true,
      historyAttacks: [...WINDOW07_HISTORY_ATTACKS],
      q1Attacks: [...WINDOW07_Q1_ATTACKS],
      windowAttacks: [...WINDOW07_WINDOW_ATTACKS],
    },
    canonicalGeneration2Ledger: {
      path: WINDOW07_CURRENT_LEDGER_REVISION.path,
      entryCountStill: current.entries.length,
      ledgerHashStill: current.ledgerHash,
      nextGeneration2ReserveStill: state.nextGeneration2ReservePosition,
      reserve7Assigned: false,
      reserve8Assigned: false,
      mutatedByThisTask: false,
    },
    sideEffects: {
      institutionNetworkRequests: 0,
      databaseConnections: 0,
      databaseWrites: 0,
      acquisitionRuns: 0,
      ledgerWrites: 0,
      reserveAssignments: 0,
      liveAuthoritiesCreated: 0,
      window07Executions: 0,
    },
    identityDisclosure:
      'slot numbers, positions, work item ids, digests, run-reference hashes and aggregates only; no echeRowKey, organisation id, root-authority id, hostname or URL',
    nextOwnerDecision: `whether to authorise (1) ONE two-entry pre-network Q1 append (slot 96 -> Generation-2 reserve 7, slot 99 -> Generation-2 reserve 8) with its own operator-observed timestamp, committed and pushed BEFORE any institution network, and (2) EXACTLY ONE bounded live Generation-2 Window 07: ${spec.workItems.map((item) => item.workItemId).join(' -> ')}. Authority is NOT granted by this readiness record`,
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
