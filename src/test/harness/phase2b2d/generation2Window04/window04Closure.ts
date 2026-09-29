/**
 * THE GENERATION-2 WINDOW-04 ADJUDICATION CLOSURE, built PURELY from
 * committed bytes after the pinned authority-shape correction.
 *
 * The committed Window-04 authority names its starting-ledger binding
 * `boundLedger`; the generic history bridge reads `boundStartingLedger` and
 * correctly refuses it. The owner ruled that, for that EXACT authority only
 * and only through an explicit committed correction record, `boundLedger` is
 * read as `boundStartingLedger`. Nothing here edits the authority or its
 * LIVE_RESULT, and nothing here asks the bridge for a fallback: the
 * correction is supplied explicitly with Window 04 and validated by the
 * bridge itself.
 *
 * It derives - never asserts - in this order:
 *
 *   1. the explicit history Window 01 -> 02 -> 03 (unchanged, no correction)
 *      and Window 04 with its correction, every record re-hashed against its
 *      pin and the authority read at its own commit;
 *   2. the owner ruling record's three rulings, the governed validation it
 *      carries over and the G2P:88 channel ruling;
 *   3. every Window-04 item from the committed LIVE_RESULT: integrity, the
 *      frozen SD9 minimum on the exact or determinate post-SD7 count, and
 *      (failures only) the landed Q3 precedence;
 *   4. the adjudication record, whose summaries are a COMPARISON TARGET the
 *      four-window replay must reproduce exactly.
 *
 * Aggregates, positions and digests only. It authorises nothing: no network,
 * no database, no ledger mutation, no reserve assignment, no Window 05.
 */

import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import {
  HOST_UNREACHABLE_ERROR_KINDS,
  replacementReasonFor,
  type HostUnreachableErrorKind,
} from '../continuationWindow/replacementReason.js';
import {
  P6_MAX_REPLACEMENTS_BEFORE_SUCCESS_FLOOR,
  P6_SUCCESS_FLOOR,
  SD9_MIN_PAGES_PER_ORGANISATION,
} from '../continuationWindow/windowContract.js';
import {
  GENERATION2_ID,
  GENERATION2_LEDGER_PATH,
  OPERATIONAL_BRANCH,
  refuse,
} from '../generation2Acquisition/operationalContract.js';
import {
  parseOperationalGeneration2Ledger,
  prefixLedgerHash,
  type OperationalGeneration2Ledger,
} from '../generation2Acquisition/operationalLedger.js';
import {
  assessCommittedInputs,
  deriveGeneration2CurrentState,
  type CommittedTexts,
  type Generation2CurrentState,
  type Generation2OperationalBasis,
} from '../generation2Acquisition/state.js';
import { buildGeneration2WindowSpec } from '../generation2Acquisition/windowSpec.js';
import {
  accountingOf,
  bySplitOf,
  historyBindingOf,
  replayGeneration2History,
  type CommittedRecordBinding,
  type Generation2AdjudicationHistory,
  type Generation2WindowHistoryBinding,
} from '../generation2History/adjudicationHistory.js';
import {
  assessAdjudicationHistoryIntegrity,
  type AdjudicationHistoryIntegrity,
} from '../generation2History/historyIntegrity.js';
import {
  WINDOW04_ADJUDICATION_PATH,
  WINDOW04_OWNER_RULINGS,
  WINDOW04_PINS,
  type WINDOW04_POST_CORRECTION_VALIDATION,
} from './window04ClosureContract.js';
import { threeWindowHistory } from './window04Readiness.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const bytesOf = (text: string): number => Buffer.byteLength(text, 'utf8');
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type PostCorrectionValidation = NonNullable<typeof WINDOW04_POST_CORRECTION_VALIDATION>;

export interface Window04ClosureInputs {
  /** Committed JSON, with the genesis ledger at the canonical ledger path. */
  readonly committed: CommittedTexts;
  /** The canonical Generation-2 ledger as committed now. */
  readonly currentLedgerText: string;
  /** The ledger revisions Windows 01..04 were planned against, from their pinned commits. */
  readonly startingLedgerTexts: readonly [string, string, string, string];
  /** `git show <authority commit>:<authority path>`: the bytes the window executed under. */
  readonly authorityTextAtCommit: string;
}

export interface Window04Bindings {
  readonly authority: CommittedRecordBinding;
  readonly liveResult: CommittedRecordBinding;
  readonly correction: CommittedRecordBinding;
}

/** The three Window-04 records, each re-hashed against its pin. */
export function bindWindow04Records(inputs: Window04ClosureInputs): Window04Bindings {
  const bind = (pin: { path: string; sha256: string }): CommittedRecordBinding => {
    const text = inputs.committed.get(pin.path);
    if (text === undefined || sha256(text) !== pin.sha256) {
      refuse('HISTORY_BINDING_NOT_PINNED', `${pin.path} is not the pinned committed record`);
    }
    return { path: pin.path, sha256: pin.sha256, text };
  };
  const authority = bind(WINDOW04_PINS.authority);
  if (inputs.authorityTextAtCommit !== authority.text) {
    refuse(
      'HISTORY_BINDING_NOT_PINNED',
      'the Window-04 authority bytes differ from those at its own commit',
    );
  }
  return {
    authority,
    liveResult: bind(WINDOW04_PINS.liveResult),
    correction: bind(WINDOW04_PINS.correction),
  };
}

/**
 * Window 04's history binding. `withCorrection: false` is the ORIGINAL,
 * uncorrected shape, kept so the refusal it earns stays provable.
 */
export function window04HistoryBinding(
  inputs: Window04ClosureInputs,
  adjudication: CommittedRecordBinding,
  options: { readonly withCorrection: boolean } = { withCorrection: true },
): Generation2WindowHistoryBinding {
  const records = bindWindow04Records(inputs);
  if (sha256(inputs.startingLedgerTexts[3]) !== WINDOW04_PINS.startingLedgerFileSha256) {
    refuse('HISTORY_BINDING_NOT_PINNED', 'the Window-04 starting revision is not the pinned one');
  }
  return {
    windowOrdinal: 4,
    authority: records.authority,
    liveResult: records.liveResult,
    adjudication,
    startingLedgerText: inputs.startingLedgerTexts[3],
    ...(options.withCorrection
      ? {
          authorityShapeCorrection: {
            record: records.correction,
            authorityCommit: WINDOW04_PINS.authority.commit,
          },
        }
      : {}),
  };
}

/** Window 01 -> 02 -> 03 (unchanged, uncorrected) -> Window 04. */
export function fourWindowHistory(
  inputs: Window04ClosureInputs,
  adjudication: CommittedRecordBinding,
  options: { readonly withCorrection: boolean } = { withCorrection: true },
): Generation2AdjudicationHistory {
  const [w01, w02, w03] = inputs.startingLedgerTexts;
  const before = threeWindowHistory(inputs.committed, [w01, w02, w03]);
  return {
    windows: [...before.windows, window04HistoryBinding(inputs, adjudication, options)],
  };
}

export interface Window04ClosureBasis {
  readonly basis: Generation2OperationalBasis;
  readonly ledger: OperationalGeneration2Ledger;
  readonly historyBefore: Generation2AdjudicationHistory;
  readonly integrityBefore: AdjudicationHistoryIntegrity;
}

export function window04ClosureBasis(inputs: Window04ClosureInputs): Window04ClosureBasis {
  const assessment = assessCommittedInputs(inputs.committed);
  if (assessment.basis === null) {
    refuse('BASIS_NOT_EXACT', assessment.failures.join(' | '));
  }
  const basis = assessment.basis;
  const ledger = parseOperationalGeneration2Ledger(
    JSON.parse(inputs.currentLedgerText) as unknown,
    basis.genesis,
  );
  const [w01, w02, w03] = inputs.startingLedgerTexts;
  const historyBefore = threeWindowHistory(inputs.committed, [w01, w02, w03]);
  const integrityBefore = assessAdjudicationHistoryIntegrity(basis, ledger, historyBefore);
  if (!integrityBefore.holds) {
    refuse('HISTORY_INTEGRITY', integrityBefore.failures.join(' | '));
  }
  return { basis, ledger, historyBefore, integrityBefore };
}

const obj = (value: unknown, what: string): Json => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    refuse('WINDOW04_CLOSURE_RECORD_SHAPE', `${what} is not an object`);
  }
  return value as Json;
};
const range = (indices: readonly number[]) => ({
  from: indices[0] ?? null,
  to: indices.at(-1) ?? null,
  count: indices.length,
});

/** The owner ruling record: its three rulings, the carried-over validation, the G2P:88 ruling. */
export function verifyOwnerRuling(correctionText: string, live: Json): Json {
  const ruling = obj(JSON.parse(correctionText) as unknown, 'owner ruling');
  const validation = obj(ruling.governedValidationCarryOver, 'governedValidationCarryOver');
  const g88 = obj(ruling.g2p88ExecutionChannelRuling, 'g2p88ExecutionChannelRuling');
  const anomaly = obj(live.operatorExecutionChannelAnomaly, 'operatorExecutionChannelAnomaly');
  const liveItem = obj(
    (live.items as Json[]).find((item) => item.workItemId === 'G2P:88'),
    'G2P:88',
  );
  const rulings = Object.values(WINDOW04_OWNER_RULINGS);
  if (
    canonicalStringify(ruling.ownerRulings) !== canonicalStringify(rulings) ||
    ruling.startingHead !== WINDOW04_PINS.stopAudit.commit ||
    obj(ruling.boundStopAudit, 'boundStopAudit').sha256 !== WINDOW04_PINS.stopAudit.sha256 ||
    obj(ruling.boundLiveResult, 'boundLiveResult').sha256 !== WINDOW04_PINS.liveResult.sha256 ||
    obj(ruling.boundOfflineReadiness, 'boundOfflineReadiness').sha256 !==
      WINDOW04_PINS.offlineReadiness.sha256
  ) {
    refuse('WINDOW04_OWNER_RULING', 'the owner ruling record is not the pinned one');
  }
  if (
    validation.ownerRuling !== WINDOW04_OWNER_RULINGS.validationCarryOver ||
    validation.exitCode !== 0 ||
    validation.runs !== 1 ||
    validation.headValidated !== WINDOW04_PINS.liveResult.commit ||
    validation.worktreeCleanAtLaunch !== true ||
    validation.ancestrySamplerSelfTest !== 'PASS' ||
    validation.EXTERNAL_COMPETING_PROCESS !== 0 ||
    validation.ANCESTRY_UNPROVED !== 0 ||
    validation.GOVERNED_VALIDATION_DESCENDANT_PROVED !== validation.competingShapedIdentities ||
    validation.rootAliveThroughValidation !== true ||
    obj(validation.landedEvaluator, 'landedEvaluator').monitorCoverageSufficient !== true ||
    obj(validation.landedEvaluator, 'landedEvaluator').integritySatisfied !== true ||
    validation.exclusivityVerdict !== 'VALIDATION_EXECUTION_EXCLUSIVITY_PROVED' ||
    validation.carriedOverUnchanged !== true ||
    validation.replacedOrReclassified !== false
  ) {
    refuse(
      'WINDOW_04_VALIDATION_NOT_ACCEPTED',
      'the governed Window-04 validation is not the proved one',
    );
  }
  if (
    g88.ownerRuling !== WINDOW04_OWNER_RULINGS.g2p88 ||
    g88.confirms !== 'CONTINUE_MITIGATED' ||
    anomaly.item !== 'G2P:88' ||
    anomaly.evidenceInvalidated !== false ||
    anomaly.isP8 !== false ||
    typeof anomaly.mitigationForLaterItems !== 'string' ||
    liveItem.cliExecuteInvocations !== 1 ||
    liveItem.cliExitCode !== 0 ||
    liveItem.runsForOccupant !== 1 ||
    !/^CLEAN \(\d+ polls, 0 detections\)$/.test(String(liveItem.inItemConcurrencyWatch)) ||
    obj(live.liveInvocations, 'liveInvocations').retries !== 0 ||
    obj(live.databaseReconciliation, 'databaseReconciliation').unexplainedMovement !== false ||
    obj(obj(live.stops, 'stops').p8, 'p8').fired !== false ||
    g88.evidenceInvalidated !== false ||
    g88.convertsItemToFailure !== false ||
    g88.requiresRetry !== false
  ) {
    refuse('WINDOW04_G2P88_RULING', 'the G2P:88 execution-channel ruling does not hold');
  }
  return { ruling, validation, g88, anomaly };
}

/** Frozen SD9 over the committed LIVE_RESULT, then (failures only) the landed Q3. */
function adjudicateItem(item: Json, specItem: Json) {
  if (
    item.workItemId !== specItem.workItemId ||
    item.identityDigest !== specItem.identityDigest ||
    item.selectionIndex !== specItem.selectionIndex ||
    item.split !== specItem.split
  ) {
    refuse('WINDOW04_ITEM_IDENTITY', `${String(item.workItemId)} is not the spec's item`);
  }
  const preflight = obj(item.itemPreflight, 'itemPreflight');
  const clean =
    item.cliExecuteInvocations === 1 &&
    item.cliExitCode === 0 &&
    item.runsForOccupant === 1 &&
    item.completionRows === 1 &&
    item.runTerminalState === 'COMPLETED' &&
    item.everyObservationV7 === true &&
    item.fetchPolicyVersion === 'orgunit-fetch-policy-v7' &&
    item.dryRun === false &&
    item.postItemHostStateClean === true &&
    item.sleepEventsDuringItem === 0 &&
    preflight.identityDigestMatchesAuthority === true &&
    preflight.dryRunWasNetworkFree === true &&
    preflight.dryRunRootsEqualFrozenRootAuthorities === true &&
    /^CLEAN \(\d+ polls, 0 detections\)$/.test(String(item.inItemConcurrencyWatch));
  if (!clean) refuse('WINDOW04_ITEM_INTEGRITY', `${String(item.workItemId)} is not clean`);
  const [lo, hi] = item.postSd7Range as [number, number];
  if (
    item.countIsExact !== (lo === hi) ||
    item.sd9EligiblePageCount + item.zeroExtractedTextPageCount !== item.rawPageEvidenceCount ||
    hi > item.sd9EligiblePageCount ||
    lo > hi
  ) {
    refuse('WINDOW04_ITEM_BRIDGE', `${String(item.workItemId)}: bridge counts do not reconcile`);
  }
  if (!(lo >= SD9_MIN_PAGES_PER_ORGANISATION || hi < SD9_MIN_PAGES_PER_ORGANISATION)) {
    refuse(
      'WINDOW04_SD9_AMBIGUOUS',
      `${String(item.workItemId)}: the SD9 decision is not determinate`,
    );
  }
  const success = lo >= SD9_MIN_PAGES_PER_ORGANISATION;
  const blocking = Object.keys(item.fetchObservationsByErrorKind as Json).filter((kind) =>
    (HOST_UNREACHABLE_ERROR_KINDS as readonly string[]).includes(kind),
  );
  if (blocking.length > 1) {
    refuse('WINDOW04_Q3_AMBIGUOUS', `${String(item.workItemId)}: several blocking kinds`);
  }
  const q3 = success
    ? null
    : replacementReasonFor({
        rootTerminalReason: item.rootTerminalReason,
        blockingTransportErrorKind: (blocking[0] ?? null) as HostUnreachableErrorKind | null,
        usableHttpResponseObtained: item.usableHttpResponseObtained,
        postSd7PageCount: lo,
      });
  const mechanical = success
    ? 'ACQUISITION_SUCCESSFUL'
    : 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET';
  if (q3 !== item.q3ReasonMechanical || mechanical !== item.sd9StatusMechanical) {
    refuse(
      'WINDOW04_ITEM_MECHANICAL',
      `${String(item.workItemId)}: the mechanical reading differs`,
    );
  }
  const verdict = success ? 'ACQUISITION_SUCCESSFUL' : 'ACQUISITION_UNSUCCESSFUL';
  return {
    workItemId: item.workItemId,
    selectionIndex: item.selectionIndex,
    split: item.split,
    kind: item.kind,
    generation2ReserveRankPosition: item.generation2ReserveRankPosition,
    identityDigest: item.identityDigest,
    runRefSha256: item.runRefSha256,
    integrity: {
      cliExecuteInvocations: 1,
      cliExitCode: 0,
      runsForOccupant: 1,
      completionRows: 1,
      runTerminalState: 'COMPLETED',
      everyObservationV7: true,
      dryRun: false,
      postItemHostStateClean: true,
      sleepEventsDuringItem: 0,
      itemPreflightAllGreen: true,
      inItemConcurrencyWatch: item.inItemConcurrencyWatch,
      verdict: 'CLEAN',
    },
    bridge: {
      rawPageEvidenceCount: item.rawPageEvidenceCount,
      sd9EligiblePageCount: item.sd9EligiblePageCount,
      zeroExtractedTextPageCount: item.zeroExtractedTextPageCount,
      postSd7Range: item.postSd7Range,
      countIsExact: item.countIsExact,
      shortTextUnresolvedCount: item.shortTextUnresolvedCount,
      decidedByCase: item.decidedByCase,
      thresholdAmbiguity: false,
    },
    adjudication: success
      ? {
          verdict,
          vantageIntegrity: 'CLEAN',
          q3Reason: null,
          sd9: `post-SD7 [${String(lo)},${String(hi)}] ${
            item.countIsExact
              ? 'exact'
              : 'not exact; the lower bound already meets the minimum, so the SD9 decision is determinate'
          }, at or above 4`,
        }
      : {
          verdict,
          vantageIntegrity: 'CLEAN',
          q3Reason: q3,
          sd9: `post-SD7 [${String(lo)},${String(hi)}], below 4`,
          q3Basis: `landed replacementReasonFor over root ${String(item.rootTerminalReason)}`,
        },
  };
}

/** The adjudication record. Its summaries are the target the four-window replay must equal. */
export function buildWindow04Adjudication(
  inputs: Window04ClosureInputs,
  options: {
    readonly recordedAtUtc: string;
    readonly postCorrectionValidation: PostCorrectionValidation;
  },
): Json {
  const { basis, ledger, historyBefore, integrityBefore } = window04ClosureBasis(inputs);
  const records = bindWindow04Records(inputs);
  const authority = JSON.parse(records.authority.text) as Json;
  const live = JSON.parse(records.liveResult.text) as Json;
  const correction = JSON.parse(records.correction.text) as Json;
  const { validation, g88, anomaly } = verifyOwnerRuling(records.correction.text, live);

  const startText = inputs.startingLedgerTexts[3];
  const startLedger = parseOperationalGeneration2Ledger(
    JSON.parse(startText) as unknown,
    basis.genesis,
  );
  const spec = buildGeneration2WindowSpec({
    basis,
    startingLedger: startLedger,
    startingLedgerFile: { sha256: sha256(startText), bytes: bytesOf(startText) },
    plannedWindowSize: authority.plannedWindowSize as number,
    history: historyBefore,
  });
  if (
    spec.windowSpecHash !== WINDOW04_PINS.windowSpecHash ||
    authority.boundWindowSpec.windowSpecHash !== spec.windowSpecHash ||
    live.windowSpecHash !== spec.windowSpecHash
  ) {
    refuse('WINDOW04_SPEC', 'the Window-04 spec does not rebuild to its bound hash');
  }
  const post = ledger.entries.length;
  if (
    prefixLedgerHash(ledger, post) !== live.ledgerDuringTheWindow.ledgerHash ||
    live.boundAuthority.sha256 !== records.authority.sha256 ||
    live.boundAuthority.commit !== WINDOW04_PINS.authority.commit ||
    live.stops.anyPauseFired !== false ||
    live.stops.finalGateDecision !== 'WINDOW_COMPLETE' ||
    live.stops.p5.fired !== false ||
    live.stops.concurrencyStop.fired !== false ||
    live.stops.monitorCoverageStop.fired !== false ||
    live.stops.p8.fired !== false ||
    live.concurrency.deviation !== null ||
    live.liveInvocations.used !== spec.workItems.length ||
    live.liveInvocations.retries !== 0 ||
    (live.items as Json[]).length !== spec.workItems.length
  ) {
    refuse('WINDOW04_LIVE_RESULT', 'the LIVE_RESULT is not one clean, fully consumed window');
  }
  const items = (live.items as Json[]).map((item, k) =>
    adjudicateItem(item, spec.workItems[k] as unknown as Json),
  );
  const historicalRefs = integrityBefore.historicalRunReferences;
  const refs = items.map((item) => item.runRefSha256 as string);
  if (new Set([...historicalRefs, ...refs]).size !== historicalRefs.length + refs.length) {
    refuse('HISTORY_DUPLICATE_RUN_REFERENCE', 'a Window-04 run reference is not globally unique');
  }

  const before = replayGeneration2History(basis, ledger, historyBefore).final;
  const ran = new Set(items.map((item) => item.selectionIndex as number));
  const slotsWith = (success: boolean) =>
    items
      .filter((item) => (item.adjudication.verdict === 'ACQUISITION_SUCCESSFUL') === success)
      .map((item) => item.selectionIndex as number)
      .sort((a, b) => a - b);
  const succeeded = slotsWith(true);
  const failed = slotsWith(false);
  const target = {
    acquisitionSuccessful: [...before.acquisitionSuccessful, ...succeeded].sort((a, b) => a - b),
    currentAcquisitionFailure: [
      ...before.currentAcquisitionFailure.filter((slot) => !ran.has(slot)),
      ...failed,
    ].sort((a, b) => a - b),
    replacementAssignedAwaitingExecution: before.replacementAssignedAwaitingExecution.filter(
      (slot) => !ran.has(slot),
    ),
    neverStarted: before.neverStarted.filter((slot) => !ran.has(slot)),
    failureReasons: items
      .filter((item) => item.adjudication.verdict !== 'ACQUISITION_SUCCESSFUL')
      .map((item) => ({
        selectionIndex: item.selectionIndex as number,
        reason: item.adjudication.q3Reason as never,
      }))
      .sort((a, b) => a.selectionIndex - b.selectionIndex),
  };
  const p6Fires =
    post > P6_MAX_REPLACEMENTS_BEFORE_SUCCESS_FLOOR &&
    target.acquisitionSuccessful.length < P6_SUCCESS_FLOOR;
  const ref = (binding: CommittedRecordBinding, commit: string) => ({
    path: binding.path,
    sha256: binding.sha256,
    bytes: bytesOf(binding.text),
    commit,
  });

  return {
    record: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_04_EVIDENCE_ADJUDICATION_V1',
    recordKind: 'GENERATION2_WINDOW_EVIDENCE_ADJUDICATION',
    recordedAtUtc: options.recordedAtUtc,
    recordedAtUtcSource:
      'date -u, read from the shell after the post-correction software-integrity validation',
    branch: OPERATIONAL_BRANCH,
    generationId: GENERATION2_ID,
    publicSafe: true,
    thisFileAuthorises: [],
    isLiveAuthority: false,
    appendOnly: true,
    startingHead: options.postCorrectionValidation.headValidated,
    networkUsedByThisRecord: false,
    databaseWrittenByThisRecord: false,
    ledgerAppendedByThisRecord: false,
    reserveAssignedByThisRecord: false,
    bound: {
      liveResult: ref(records.liveResult, WINDOW04_PINS.liveResult.commit),
      authority: {
        ...ref(records.authority, WINDOW04_PINS.authority.commit),
        ownerDecision: authority.ownerDecision,
        originalBytesUnchanged: true,
      },
      authorityShapeCorrection: {
        ...ref(records.correction, WINDOW04_PINS.correction.commit),
        ownerRuling: WINDOW04_OWNER_RULINGS.authorityShapeCorrection,
        sourceField: correction.authorityShapeCorrection.sourceField,
        canonicalField: correction.authorityShapeCorrection.canonicalField,
        suppliedExplicitlyWithWindow04: true,
        validatedByTheGenericBridge: true,
      },
      offlineReadiness: { ...WINDOW04_PINS.offlineReadiness },
      stopAudit: { ...WINDOW04_PINS.stopAudit },
      ledger: {
        path: GENERATION2_LEDGER_PATH,
        fileSha256: sha256(inputs.currentLedgerText),
        bytes: bytesOf(inputs.currentLedgerText),
        ledgerHash: ledger.ledgerHash,
        entryCount: post,
        nextGeneration2ReservePosition: post,
        unchangedByTheWindow: true,
        noAppendByThisWindow: true,
        appendCommit: WINDOW04_PINS.startingLedgerRevisionCommit,
      },
      startingLedgerRevision: {
        commit: WINDOW04_PINS.startingLedgerRevisionCommit,
        fileSha256: sha256(startText),
        ledgerHash: startLedger.ledgerHash,
        entryCount: startLedger.entries.length,
        identicalToCurrent: startText === inputs.currentLedgerText,
        readFromAuthorityField: 'boundLedger (through the pinned correction)',
      },
      adjudicationHistoryBefore: {
        windows: authority.boundAdjudicationHistory.windows,
        passedExplicitlyToEveryStateSpecAndReplayCall: true,
        noDirectoryScanGlobOrLatest: true,
      },
    },
    validation: {
      ownerRuling: WINDOW04_OWNER_RULINGS.validationCarryOver,
      carriedOverFrom: `${WINDOW04_PINS.correction.path} (governedValidationCarryOver)`,
      command: validation.command,
      runs: 1,
      automaticRerun: false,
      headValidated: validation.headValidated,
      worktreeCleanAtLaunch: true,
      startUtc: validation.startUtc,
      endUtc: validation.endUtc,
      exitCode: 0,
      testFiles: validation.testFiles,
      tests: validation.tests,
      ancestrySamplerSelfTest: validation.ancestrySamplerSelfTest,
      samplesTotal: validation.samplesTotal,
      samplesWithinValidation: validation.samplesWithinValidation,
      maxGapSecondsWithinValidation: validation.maxGapSecondsWithinValidation,
      competingShapedIdentities: validation.competingShapedIdentities,
      GOVERNED_VALIDATION_DESCENDANT_PROVED: validation.GOVERNED_VALIDATION_DESCENDANT_PROVED,
      EXTERNAL_COMPETING_PROCESS: 0,
      ANCESTRY_UNPROVED: 0,
      exclusivityVerdict: 'VALIDATION_EXECUTION_EXCLUSIVITY_PROVED',
      secondGovernedValidationRun: false,
      result: 'WINDOW_04_VALIDATION_ACCEPTED',
      basis:
        'the one governed validate at the LIVE_RESULT commit, exit 0, execution exclusivity proved by same-snapshot ancestry; carried over unchanged under the owner ruling, never replaced or reclassified',
    },
    postCorrectionSoftwareIntegrityValidation: {
      ...options.postCorrectionValidation,
      isGovernedWindow04Validation: false,
      provesOnly: 'the generic-bridge correction code and its tests are green',
    },
    orderOfRules:
      'integrity first (CLEAN on every item), then SD9 eligibility (main_text_chars > 0), exact SD7 -> near SD7, the frozen SD9 minimum of 4 distinct post-SD7 pages on the exact or determinate count, then (failures only) the landed Q3 precedence',
    items,
    windowSummary: {
      executed: items.length,
      authorised: authority.plannedWindowSize,
      acquisitionSuccessful: succeeded,
      acquisitionUnsuccessful: failed,
      pauseFired: false,
      finalGateDecision: live.stops.finalGateDecision,
    },
    generation2StateBefore: {
      ACQUISITION_SUCCESSFUL: before.acquisitionSuccessful.length,
      CURRENT_ACQUISITION_FAILURE: before.currentAcquisitionFailure,
      REPLACEMENT_ASSIGNED_AWAITING_EXECUTION: before.replacementAssignedAwaitingExecution,
      NEVER_STARTED: range(before.neverStarted),
      q1: before.currentAcquisitionFailure,
      ledgerEntryCount: post,
      nextGeneration2ReservePosition: post,
    },
    generation2StateAfter: {
      ACQUISITION_SUCCESSFUL: target.acquisitionSuccessful.length,
      acquisitionSuccessfulBySplit: bySplitOf(basis, target.acquisitionSuccessful),
      CURRENT_ACQUISITION_FAILURE: target.currentAcquisitionFailure,
      currentFailureBySplit: bySplitOf(basis, target.currentAcquisitionFailure),
      REPLACEMENT_ASSIGNED_AWAITING_EXECUTION: target.replacementAssignedAwaitingExecution,
      PENDING_CAPABILITY_REVIEW: [],
      CARRY_FORWARD_REFUSED: [],
      NEVER_STARTED: {
        ...range(target.neverStarted),
        bySplit: bySplitOf(basis, target.neverStarted),
      },
      accounting: accountingOf(target),
      derivation:
        'COMPARISON TARGET only: replayGeneration2History over the explicit four-window history (Window 01 -> 02 -> 03 -> 04 with its pinned authority-shape correction) and the committed five-entry ledger re-derives every field and refuses on any difference (requireSummaryAgreement)',
    },
    q1After: target.currentAcquisitionFailure,
    q1AfterReasons: target.failureReasons,
    pendingReplacementObligations: target.currentAcquisitionFailure,
    ledgerAfter: {
      entryCount: post,
      ledgerHash: ledger.ledgerHash,
      nextGeneration2ReservePosition: post,
      unchanged: true,
    },
    reserves: {
      generation2Consumed: post,
      nextGeneration2ReservePosition: post,
      reserve5Assigned: false,
      scheduleSize: basis.schedule.length,
    },
    p6: {
      rule: 'reserveConsumed > 10 AND successfulOrganisationCount < 50',
      reserveConsumed: post,
      successfulOrganisationCount: target.acquisitionSuccessful.length,
      fires: p6Fires,
    },
    p5: {
      fired: false,
      windowLowYieldCount: live.stops.p5.windowLowYieldCount,
      threshold: live.stops.p5.threshold,
      window02RulingNotReused: true,
    },
    operatorExecutionChannelAnomaly: {
      item: anomaly.item,
      classification: anomaly.classification,
      ownerRuling: WINDOW04_OWNER_RULINGS.g2p88,
      confirms: g88.confirms,
      ownerRulingScope: anomaly.ownerRulingScope,
      effectOnTheInvocation: anomaly.effectOnTheInvocation,
      laterItemMitigation: anomaly.mitigationForLaterItems,
      evidenceInvalidated: false,
      convertsItemToFailure: false,
      requiresRetry: false,
      isP8: false,
    },
    pauseDisposition:
      'no frozen pause fired (final gate WINDOW_COMPLETE); no concurrency-integrity, monitor-coverage or P8 event; one notification-only operator execution-channel anomaly during G2P:88, ruled CONTINUE_MITIGATED and confirmed by the owner (Window-04-specific, not a precedent)',
    runReferences: {
      historicalWindow01To03: historicalRefs.length,
      window04: refs.length,
      globallyUnique: true,
      rule: 'GENERATION2_HISTORICAL_RUN_REFERENCE_IS_GLOBALLY_UNIQUE_ACROSS_ALL_ADJUDICATED_WINDOWS_V1',
      gate: 'the generic assessAdjudicationHistoryIntegrity over the explicit history (three windows before, four after)',
    },
    authorityConsumption:
      'the Window-04 authority is fully consumed (5 of 5 invocations, 0 retries); it authorises nothing further',
    identityDisclosure:
      'slot numbers, work item ids, digests, run-reference hashes and aggregates only; no organisation id, echeRowKey, URL, hostname, root-authority id or page text',
    terminalState: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_04_ADJUDICATED_AUTHORITY_CONSUMED_STOPPED',
    nextOwnerDecision: `Generation 2 stands at ${String(target.acquisitionSuccessful.length)} / 110 successful with Q1 [${target.currentAcquisitionFailure.join(', ')}] and ${String(target.neverStarted.length)} never-started primaries (${String(target.neverStarted[0])}..${String(target.neverStarted.at(-1))}). The next Generation-2 reserve is ${String(post)}, unassigned. No Window-05 readiness, authority or reserve assignment exists or is precommitted here; any further acquisition needs a new owner decision`,
    immutability: 'append-only. This record is never edited; a correction is a new record',
  };
}

export interface Window04Closure {
  readonly integrity: AdjudicationHistoryIntegrity;
  readonly state: Generation2CurrentState;
  readonly historyBinding: ReturnType<typeof historyBindingOf>;
  readonly authorityBoundSpecHashes: readonly string[];
}

/** The four-window replay over an adjudication's exact bytes; refuses unless it holds. */
export function assessWindow04Closure(
  inputs: Window04ClosureInputs,
  adjudication: CommittedRecordBinding,
): Window04Closure {
  const { basis, ledger } = window04ClosureBasis(inputs);
  if (adjudication.path !== WINDOW04_ADJUDICATION_PATH) {
    refuse('HISTORY_BINDING_NOT_PINNED', 'the Window-04 adjudication is not at its canonical path');
  }
  const history = fourWindowHistory(inputs, adjudication);
  const integrity = assessAdjudicationHistoryIntegrity(basis, ledger, history);
  if (!integrity.holds || integrity.replay === null) {
    refuse('HISTORY_INTEGRITY', integrity.failures.join(' | '));
  }
  return {
    integrity,
    state: deriveGeneration2CurrentState(basis, ledger, history),
    historyBinding: historyBindingOf(integrity.replay),
    authorityBoundSpecHashes: history.windows.map(
      (window) =>
        (JSON.parse(window.authority.text) as { boundWindowSpec: { windowSpecHash: string } })
          .boundWindowSpec.windowSpecHash,
    ),
  };
}
