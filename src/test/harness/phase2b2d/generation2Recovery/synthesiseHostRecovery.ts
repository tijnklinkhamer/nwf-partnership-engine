/**
 * A SYNTHETIC, IN-MEMORY host-recovered window, for proofs only. PURE.
 *
 * Builds one adjudicated window with the generic synthesiser, then turns ONE
 * chosen executed item into a host-confounded original with a complete,
 * hash-bound targeted-host-recovery chain: incident ruling, operator-kit
 * repair, precondition, recovery authority, recovery result, and the
 * adjudication's acquisitionOfRecord block. Every record is sealed AFTER an
 * optional tamper hook runs, and every reference is computed from the sealed
 * bytes, so in an attack test the SEMANTIC rule - never a stale pin - is what
 * refuses.
 *
 * The approved amendment is the real committed approval, supplied by the
 * caller. Nothing here is committed, live or persisted, and it names no
 * slot, window or reserve: every fact comes from its arguments. It authorises
 * nothing.
 */

import { createHash } from 'node:crypto';
import type { ReplacementReason } from '../continuationWindow/windowContract.js';
import { GENERATION2_ID } from '../generation2Acquisition/operationalContract.js';
import type { Generation2OperationalBasis } from '../generation2Acquisition/state.js';
import type { Generation2WindowSpec } from '../generation2Acquisition/windowSpec.js';
import type {
  CommittedRecordBinding,
  Generation2AdjudicationHistory,
  Generation2WindowHistoryBinding,
} from '../generation2History/adjudicationHistory.js';
import { refOf, synthesiseAdjudicatedWindow } from '../generation2Window03/synthesiseWindow.js';
import {
  ACQUISITION_OF_RECORD_SOURCE,
  HOST_CONFOUNDED,
  HOST_INTEGRITY_STOP_CLASSIFICATION,
  HOST_RECOVERY_AUTHORITY_FALSE_FLAGS,
  HOST_RECOVERY_CONCEPT,
  HOST_RECOVERY_CONTROL_NAMES_V1,
  HOST_RECOVERY_LIMITS,
  HOST_RECOVERY_OWNER_RESOLUTIONS,
  HOST_RECOVERY_PRECONDITION_PARAMETERS,
  HOST_RECOVERY_RECORD_KINDS,
  HOST_RECOVERY_VANTAGE_PROOF_NAME,
  HOST_SAFETY_FAILURE_CLASSES,
  INCIDENT_RULING_RECORD_KIND,
  OPERATOR_KIT_REPAIR_REQUIRED_PROOFS,
  PRECONDITION_PROVED,
  RECOVERY_GATE_READOUT_RULE,
  RECOVERY_INTEGRITY_SCOPE,
  RECOVERY_INVOCATION_DISPOSITIONS,
  RECOVERY_RESULT_STATUS,
  SUPERSESSION_TOKEN,
  type AcquisitionCodeTree,
  type FixedRecoveryTarget,
} from './hostRecoveryContract.js';
import type { PinnedCommittedRecord } from './hostRecoveryEligibility.js';
import type { TargetedHostRecoveryBinding } from './hostRecoveryProvenance.js';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const commitOf = (seed: string): string => sha256(`commit:${seed}`).slice(0, 40);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const MINUTE = 60_000;
const at = (base: number, minutes: number): string =>
  new Date(base + minutes * MINUTE).toISOString().replace('.000Z', 'Z');

function seal(path: string, value: unknown, commit: string): PinnedCommittedRecord {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  return { path, sha256: sha256(text), text, commit };
}
const pinnedRef = (record: PinnedCommittedRecord) => ({ ...refOf(record), commit: record.commit });

/** Tamper hooks: each runs on a record's JSON just before it is sealed. */
export interface HostRecoveryTamper {
  readonly authority?: (record: Json) => void;
  readonly liveResult?: (record: Json) => void;
  readonly incidentRuling?: (record: Json) => void;
  readonly operatorKitRepair?: (record: Json) => void;
  readonly precondition?: (record: Json) => void;
  readonly recoveryAuthority?: (record: Json) => void;
  readonly recoveryResult?: (record: Json) => void;
  readonly adjudication?: (record: Json) => void;
  readonly binding?: (binding: TargetedHostRecoveryBinding) => TargetedHostRecoveryBinding;
}

export interface SynthesisedHostRecovery {
  /** priorHistory + the recovered window, with its recovery chain supplied. */
  readonly history: Generation2AdjudicationHistory;
  readonly window: Generation2WindowHistoryBinding;
  readonly recovery: TargetedHostRecoveryBinding;
  readonly target: FixedRecoveryTarget;
  readonly recoveryRunRefSha256: string;
  readonly ledger: ReturnType<typeof synthesiseAdjudicatedWindow>['ledger'];
}

/**
 * @param verdicts  EFFECTIVE verdicts: for the recovered slot, the recovery's.
 */
export function synthesiseHostRecoveredWindow(input: {
  readonly basis: Generation2OperationalBasis;
  readonly priorHistory: Generation2AdjudicationHistory;
  readonly startingLedgerText: string;
  readonly prospectiveLedgerText: string;
  readonly spec: Generation2WindowSpec;
  readonly verdicts: Readonly<Record<number, ReplacementReason | null>>;
  readonly recoveredSelectionIndex: number;
  readonly runRefSeed: string;
  readonly approvedAmendment: PinnedCommittedRecord;
  readonly codeTree: AcquisitionCodeTree;
  readonly tamper?: HostRecoveryTamper;
}): SynthesisedHostRecovery {
  const tamper = input.tamper ?? {};
  const base = synthesiseAdjudicatedWindow({
    basis: input.basis,
    priorHistory: input.priorHistory,
    startingLedgerText: input.startingLedgerText,
    prospectiveLedgerText: input.prospectiveLedgerText,
    spec: input.spec,
    verdicts: input.verdicts,
    runRefSeed: input.runRefSeed,
  });
  const plain = base.history.windows.at(-1)!;
  const ordinal = plain.windowOrdinal;
  const seed = `${input.runRefSeed}:${String(ordinal)}`;
  const t = Date.parse('2026-01-01T00:00:00Z');
  const vantage = HOST_SAFETY_FAILURE_CLASSES[0];

  // ---- the ordinary window authority (production-shaped fields) ----------------
  const authority = JSON.parse(plain.authority.text) as Json;
  authority.requiredFetchPolicy = 'orgunit-fetch-policy-synthetic';
  authority.requiredRuleVersion = 'orgunit-signal-rules-synthetic';
  authority.executionPath = 'synthetic execution path (UNCHANGED production code)';
  authority.hostSafety = { [vantage.hostSafetyKey]: 'synthetic compliant-vantage rule' };
  tamper.authority?.(authority);
  const A = seal(plain.authority.path, authority, commitOf(`${seed}:authority`));

  // ---- the LIVE_RESULT: the recovered item ran under a RED post-item vantage check ---
  const live = JSON.parse(plain.liveResult.text) as Json;
  live.boundAuthority = refOf(A);
  const k = (live.items as Json[]).findIndex(
    (item) => item.selectionIndex === input.recoveredSelectionIndex,
  );
  if (k < 0) throw new Error('the recovered slot is not an executed item of this window');
  for (const item of live.items as Json[]) {
    item.fetchPolicyVersion = authority.requiredFetchPolicy;
    item.ruleVersion = authority.requiredRuleVersion;
    item.hostAndVantage = { preItem: true, postItem: true, sleepWakeDarkWakeEventsDuringItem: 0 };
  }
  const recovered = (live.items as Json[])[k]!;
  const workItemId = recovered.workItemId as string;
  recovered.hostAndVantage = {
    preItem: true,
    postItem: false,
    sleepWakeDarkWakeEventsDuringItem: 0,
  };
  recovered.q3BlockingTransportErrorKind = vantage.causalErrorKinds[0];
  recovered.rawPageEvidenceCount = 0;
  live.stops = {
    itemsNotStarted: [],
    p2: { fired: true, windowRobotsRefusalCount: 1 },
    p5: {
      fired: true,
      windowLowYieldCount: 1,
      denominator: (live.items as Json[]).length,
      lowYieldItems: [workItemId],
    },
    p8: { fired: true },
    hostIntegrityStop: {
      fired: true,
      classification: HOST_INTEGRITY_STOP_CLASSIFICATION,
      affectedItems: [workItemId],
    },
  };
  tamper.liveResult?.(live);
  const L = seal(plain.liveResult.path, live, commitOf(`${seed}:live`));
  const originalRunRefSha256 = recovered.runRefSha256 as string;
  const incident = { windowOrdinal: ordinal, workItemId, originalRunRefSha256 };

  // ---- the owner incident ruling --------------------------------------------------
  const ruling: Json = {
    recordKind: INCIDENT_RULING_RECORD_KIND,
    generationId: GENERATION2_ID,
    isLiveAuthority: false,
    appendOnly: true,
    recordedAtUtc: at(t, 0),
    scope: `WINDOW_${String(ordinal)}_HOST_INCIDENT_ONLY`,
    thisFileAuthorises: [],
    bound: {
      windowLiveAuthority: pinnedRef(A),
      windowLiveResult: pinnedRef(L),
    },
    executedItems: {
      item1: {
        workItemId,
        runRefSha256: originalRunRefSha256,
        A_observedAcquisitionResult: { errorKind: vantage.causalErrorKinds[0] },
        C_hostIntegrity: {
          preItemHostCheck: 'GREEN',
          postItemHostCheck: 'RED',
          onlyFailingComponent: vantage.failingComponent,
        },
        D_causalAttribution: {
          classification: 'INDETERMINATE_HOST_VS_INSTITUTION_DNS_FAILURE',
          pointsTowardHostLocalResolver: ['synthetic: the vantage probe reached no DNS server'],
        },
      },
    },
    p2: { fired: true, preserved: true, waived: false },
    p5: { fired: true, preserved: true, waived: false },
    p8: { frozenP8Fired: false, recordedP8InLiveResult: true },
    frozenSignalsRemainHistoricallyRealRegardlessOfCause: true,
    hostIntegrityStop: {
      classification: HOST_INTEGRITY_STOP_CLASSIFICATION,
      affectedItems: [workItemId],
      isFrozenP8: false,
    },
  };
  tamper.incidentRuling?.(ruling);
  const ruling$ = seal(
    `synthetic/window-${String(ordinal)}-ruling.json`,
    ruling,
    commitOf(`${seed}:ruling`),
  );

  // ---- the operator-kit host-semantics repair (UQ4) ------------------------------------
  const kit: Json = {
    recordKind: HOST_RECOVERY_RECORD_KINDS.operatorKitRepair,
    generationId: GENERATION2_ID,
    isLiveAuthority: false,
    thisFileAuthorises: [],
    recordedAtUtc: at(t, 1),
    proves: clone(OPERATOR_KIT_REPAIR_REQUIRED_PROOFS),
    review: {
      reviewed: true,
      reviewRecord: {
        path: 'synthetic/operator-kit-review.json',
        commit: commitOf(`${seed}:review`),
        sha256: sha256(`${seed}:review`),
        bytes: 1,
      },
    },
  };
  tamper.operatorKitRepair?.(kit);
  const kit$ = seal('synthetic/operator-kit-repair.json', kit, commitOf(`${seed}:kit`));

  // ---- the fixed target and the ledger during the window ------------------------------
  const authorised = (authority.authorisedWorkItems as Json[]).find(
    (item) => item.workItemId === workItemId,
  )!;
  const target: FixedRecoveryTarget = {
    windowOrdinal: ordinal,
    workItemId,
    kind: recovered.kind,
    selectionIndex: recovered.selectionIndex,
    generation2ReserveRankPosition: recovered.generation2ReserveRankPosition,
    split: recovered.split,
    identityDigest: recovered.identityDigest,
    originalRunRefSha256,
    rootAuthorityCount: authorised.rootAuthorityCount,
    fetchPolicyVersion: authority.requiredFetchPolicy,
    ruleVersion: authority.requiredRuleVersion,
    executionPath: authority.executionPath,
  };
  const ledger = { entryCount: base.ledger.entries.length, ledgerHash: base.ledger.ledgerHash };

  // ---- the precondition: 6 GREEN probes, 2 minutes apart (10-minute span) ---------------
  const probe = (minutes: number) => ({
    atUtc: at(t, minutes),
    verdict: 'GREEN',
    ipv4DefaultRoute: true,
    nativeNonClatIpv4: true,
    systemResolverFunctioning: true,
    controlNamesResolved: [...HOST_RECOVERY_CONTROL_NAMES_V1],
    ipv4onlyArpaAAnswered: true,
    ipv4onlyArpaAaaaEmpty: true,
    frozenHostSafetyGreen: true,
    sleepWakeDarkWakeEvents: 0,
    namesQueried: [...HOST_RECOVERY_CONTROL_NAMES_V1, HOST_RECOVERY_VANTAGE_PROOF_NAME],
  });
  const probes = [10, 12, 14, 16, 18, 20].map(probe);
  const P = HOST_RECOVERY_PRECONDITION_PARAMETERS;
  const precondition: Json = {
    recordKind: HOST_RECOVERY_RECORD_KINDS.precondition,
    generationId: GENERATION2_ID,
    isLiveAuthority: false,
    thisFileAuthorises: [],
    appendOnly: true,
    recordedAtUtc: at(t, 21),
    outcome: PRECONDITION_PROVED,
    defectClass: vantage.defectClass,
    parameters: {
      ownerDecision: P.ownerDecision,
      minimumProbes: P.minimumProbes,
      minimumSpanMinutes: P.minimumSpanMinutes,
      validityMinutes: P.validityMinutes,
    },
    boundIncidentRuling: pinnedRef(ruling$),
    boundApprovedAmendment: pinnedRef(input.approvedAmendment),
    boundLedger: clone(ledger),
    target: clone(target),
    controlNames: [...HOST_RECOVERY_CONTROL_NAMES_V1],
    targetProbed: false,
    sustainedSeries: {
      probes,
      firstProbeAtUtc: probes[0]!.atUtc,
      finalProbeAtUtc: probes.at(-1)!.atUtc,
    },
    validUntilUtc: at(t, 20 + P.validityMinutes),
  };
  tamper.precondition?.(precondition);
  const pre$ = seal('synthetic/recovery-precondition.json', precondition, commitOf(`${seed}:pre`));

  // ---- the recovery authority ------------------------------------------------------------
  const recoveryAuthority: Json = {
    recordKind: HOST_RECOVERY_RECORD_KINDS.authority,
    generationId: GENERATION2_ID,
    isLiveAuthority: true,
    concept: HOST_RECOVERY_CONCEPT,
    recordedAtUtc: at(t, 30),
    boundOriginalWindowAuthority: pinnedRef(A),
    boundOriginalLiveResult: pinnedRef(L),
    boundIncidentRuling: pinnedRef(ruling$),
    boundApprovedAmendment: pinnedRef(input.approvedAmendment),
    boundPrecondition: pinnedRef(pre$),
    boundOperatorKitHostSemanticsRepair: pinnedRef(kit$),
    boundLedger: clone(ledger),
    originalItem: clone(incident),
    target: clone(target),
    acquisitionCodeTree: clone(input.codeTree),
    limits: clone(HOST_RECOVERY_LIMITS),
    flags: Object.fromEntries(HOST_RECOVERY_AUTHORITY_FALSE_FLAGS.map((flag) => [flag, false])),
    hostSafety: clone(authority.hostSafety),
    invocationConsumptionRule: HOST_RECOVERY_OWNER_RESOLUTIONS.UQ5,
    gateReadoutRule: clone(RECOVERY_GATE_READOUT_RULE),
  };
  tamper.recoveryAuthority?.(recoveryAuthority);
  const auth$ = seal(
    'synthetic/recovery-authority.json',
    recoveryAuthority,
    commitOf(`${seed}:auth`),
  );

  // ---- the recovery result -----------------------------------------------------------------
  const recoveryRunRefSha256 = sha256(`${seed}:recovery-run`);
  const effective = input.verdicts[input.recoveredSelectionIndex] ?? null;
  const result: Json = {
    recordKind: HOST_RECOVERY_RECORD_KINDS.result,
    generationId: GENERATION2_ID,
    isLiveAuthority: false,
    thisFileAuthorises: [],
    status: RECOVERY_RESULT_STATUS,
    resultDoesNotMutateAcquisitionOfRecord: true,
    recordedAtUtc: at(t, 45),
    boundRecoveryAuthority: pinnedRef(auth$),
    boundPrecondition: pinnedRef(pre$),
    boundIncidentRuling: pinnedRef(ruling$),
    originalItem: clone(incident),
    originalRunRefSha256,
    recoveryRunRefSha256,
    runRefDerivation: 'sha256(lowercase run UUID), no prefix',
    target: clone(target),
    invocation: {
      cliExecuteIssued: true,
      runCreated: true,
      disposition: RECOVERY_INVOCATION_DISPOSITIONS.consumed,
      automaticReplacementInvocation: false,
    },
    hostAndVantage: {
      t0: probe(35),
      postInvocation: probe(40),
      sleepWakeDarkWakeEventsDuringRecovery: 0,
    },
    executionExclusivityVerdict: 'EXCLUSIVE_PROVED_FOR_THIS_ITEM',
    monitorCoverageSufficient: true,
    cliExecuteInvocations: 1,
    runsForTarget: 1,
    completionRows: 1,
    runTerminalState: 'COMPLETED',
    dryRun: false,
    retries: 0,
    fetchPolicyVersion: target.fetchPolicyVersion,
    ruleVersion: target.ruleVersion,
    acquisitionCodeTreeAtExecution: clone(input.codeTree),
    databaseDelta: { runs: 1, completions: 1, dryRunRuns: 0, runsWithoutCompletion: 0 },
    mechanical: {
      sd9StatusMechanical: effective === null ? 'ACQUISITION_SUCCESSFUL' : effective,
      q3ReasonMechanical: effective,
    },
    recoveryLocalGateReadout: {
      ...clone(RECOVERY_GATE_READOUT_RULE),
      decision: effective === null ? 'CONTINUE' : 'PAUSE_P5_LOW_RAW_YIELD',
      firedConditions: effective === null ? [] : ['P5'],
    },
    integrityVerdict: 'CLEAN',
    ledgerDuringRecovery: clone(ledger),
    ledgerMovement: 0,
    reserveConsumed: 0,
    membershipChange: 0,
  };
  tamper.recoveryResult?.(result);
  const result$ = seal('synthetic/recovery-result.json', result, commitOf(`${seed}:result`));

  let recovery: TargetedHostRecoveryBinding = {
    incidentRuling: ruling$,
    approvedAmendment: input.approvedAmendment,
    precondition: pre$,
    operatorKitRepair: kit$,
    recoveryAuthority: auth$,
    recoveryResult: result$,
    originalAcquisitionCodeTree: clone(input.codeTree),
  };
  recovery = tamper.binding?.(recovery) ?? recovery;

  // ---- the adjudication: original item retained, verdict from the recovery ----------------
  const adjudication = JSON.parse(plain.adjudication.text) as Json;
  adjudication.bound.liveResult = refOf(L);
  adjudication.bound.authority = refOf(A);
  const item = (adjudication.items as Json[])[k]!;
  item.integrity = { verdict: HOST_CONFOUNDED, verdictScope: RECOVERY_INTEGRITY_SCOPE };
  item.p5LowYieldContribution = true;
  const ref = (b: CommittedRecordBinding) => refOf(b);
  item.acquisitionOfRecord = {
    source: ACQUISITION_OF_RECORD_SOURCE,
    runRefSha256: recoveryRunRefSha256,
    recoveryAuthority: ref(recovery.recoveryAuthority),
    recoveryResult: ref(recovery.recoveryResult),
    precondition: ref(recovery.precondition),
    incidentRuling: ref(recovery.incidentRuling),
    approvedAmendment: ref(recovery.approvedAmendment),
    originalRun: {
      runRefSha256: originalRunRefSha256,
      disposition: SUPERSESSION_TOKEN,
      retained: true,
      deleted: false,
      executionRecordEdited: false,
      remainsValidEvidenceOf: 'the acquisition attempt under the host condition the ruling records',
    },
    recoveryIntegrity: { verdict: 'CLEAN', verdictScope: RECOVERY_INTEGRITY_SCOPE },
  };
  adjudication.windowSummary.acquisitionOfRecordRecovered = [workItemId];
  adjudication.originalWindowStopHistory = {
    recomputedFromRecoveryEvidence: false,
    p2: { fired: true, windowRobotsRefusalCount: 1 },
    p5: { fired: true, windowLowYieldCount: 1, denominator: (live.items as Json[]).length },
    p8: { recordedInLiveResult: true, frozenP8Fired: false },
    hostIntegrityStop: {
      fired: true,
      classification: HOST_INTEGRITY_STOP_CLASSIFICATION,
      affectedItems: [workItemId],
    },
  };
  tamper.adjudication?.(adjudication);
  const J = seal(plain.adjudication.path, adjudication, commitOf(`${seed}:adjudication`));

  const window: Generation2WindowHistoryBinding = {
    ...plain,
    authority: A,
    liveResult: L,
    adjudication: J,
    targetedHostRecoveries: [recovery],
  };
  return {
    history: { windows: [...input.priorHistory.windows, window] },
    window,
    recovery,
    target: clone(target),
    recoveryRunRefSha256,
    ledger: base.ledger,
  };
}
