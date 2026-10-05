/**
 * THE TARGETED HOST RECOVERY CHAIN, VALIDATED HOP BY HOP: precondition ->
 * operator-kit repair -> recovery authority -> recovery result -> the
 * adjudication's acquisition-of-record block. PURE.
 *
 *   incident ruling ─┐
 *   approved amendment ─┼─> precondition ─> recovery authority ─> recovery result
 *   operator-kit repair ┘                                              │
 *                       adjudication item.acquisitionOfRecord <────────┘
 *
 * Every hop is a committed record bound by {path, commit, sha256, bytes} and
 * re-hashed here; nothing is looked up. A chain hop that does not name the
 * exact bytes of the hop before it is refused, so an adjudication cannot
 * substitute an arbitrary later run (I11): the acquisition-of-record run must
 * be the result's run, the result must be the authority's, the authority must
 * bind the precondition, the ruling and the approved amendment.
 *
 * A RESULT IS EVIDENCE ONLY. Nothing here moves acquisition-of-record, the
 * ledger, a reserve, Q1 or window membership; only the later owner
 * adjudication of the original window can accept a recovery, and only a CLEAN
 * one. The original run stays immutable and stays in history.
 *
 * No filesystem, no database, no network, no clock.
 */

import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import { refuse } from '../generation2Acquisition/operationalContract.js';
import type { CommittedRecordBinding } from '../generation2History/adjudicationHistory.js';
import {
  ACQUISITION_OF_RECORD_FIELDS,
  ACQUISITION_OF_RECORD_SOURCE,
  HOST_CONFOUNDED,
  HOST_RECOVERY_AUTHORITY_FALSE_FLAGS,
  HOST_RECOVERY_CONCEPT,
  HOST_RECOVERY_CONTROL_NAMES_V1,
  HOST_RECOVERY_LIMITS,
  HOST_RECOVERY_NO_DNS64_PROOF,
  HOST_RECOVERY_OWNER_RESOLUTIONS,
  HOST_RECOVERY_PRECONDITION_PARAMETERS,
  HOST_RECOVERY_PROBE_PROOFS,
  HOST_RECOVERY_RECORD_KINDS,
  HOST_RECOVERY_VANTAGE_PROOF_NAME,
  OPERATOR_KIT_REPAIR_REQUIRED_PROOFS,
  ORDINARY_WINDOW_RECORD_KINDS,
  ORIGINAL_RUN_DISPOSITION_FIELDS,
  PRECONDITION_PROVED,
  RECOVERY_GATE_READOUT_RULE,
  RECOVERY_INTEGRITY_SCOPE,
  RECOVERY_INTEGRITY_VERDICTS,
  RECOVERY_INVOCATION_DISPOSITIONS,
  RECOVERY_RESULT_STATUS,
  SUPERSESSION_TOKEN,
  type AcquisitionCodeTree,
  type FixedRecoveryTarget,
  type HostRecoveryChainRefusal,
  type HostRecoveryDefectClass,
  type HostRecoveryIncidentKey,
  type RecoveryIntegrityVerdict,
} from './hostRecoveryContract.js';
import {
  evaluateHostRecoveryEligibility,
  isCommit,
  parsePinned,
  refNames,
  type HostRecoveryEligibility,
  type PinnedCommittedRecord,
} from './hostRecoveryEligibility.js';

const GENERATION_ID = 'METHODOLOGY_V3_GEN2';
const HEX64 = /^[0-9a-f]{64}$/;
const MINUTE_MS = 60_000;
const bytesOf = (text: string): number => Buffer.byteLength(text, 'utf8');
const same = (a: unknown, b: unknown): boolean => {
  try {
    return canonicalStringify(a) === canonicalStringify(b);
  } catch {
    return false;
  }
};

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const fail = (code: HostRecoveryChainRefusal, message: string): never => refuse(code, message);

function obj(value: unknown, what: string): Json {
  if (!isObject(value)) fail('HOST_RECOVERY_RECORD_SHAPE', `${what} is not an object`);
  return value as Json;
}
function instant(value: unknown, what: string): number {
  const ms = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value) ||
    Number.isNaN(ms)
  ) {
    fail('HOST_RECOVERY_RECORD_SHAPE', `${what} is not a UTC instant`);
  }
  return ms;
}

/** The bytes hash to their binding and parse; else HOST_RECOVERY_RECORD_NOT_PINNED. */
function parseRecord(binding: PinnedCommittedRecord, role: string): Json {
  const record = parsePinned(binding);
  if (record === null || !isCommit(binding.commit)) {
    fail('HOST_RECOVERY_RECORD_NOT_PINNED', `${role} ${binding.path} is not pinned committed JSON`);
  }
  return record!;
}

/** A `{path, commit, sha256, bytes}` value must name exactly this pinned binding. */
function requirePinnedRef(
  value: unknown,
  binding: PinnedCommittedRecord,
  code: HostRecoveryChainRefusal,
  what: string,
): void {
  if (!(refNames(value, binding) && isObject(value) && value.commit === binding.commit)) {
    fail(code, `${what} does not bind ${binding.path} at its exact commit and bytes`);
  }
}
/** A `{path, commit, sha256, bytes}` value names these bytes at SOME commit (bytes fix identity). */
function requireRefWithCommit(
  value: unknown,
  binding: CommittedRecordBinding,
  code: HostRecoveryChainRefusal,
  what: string,
): void {
  if (!(
    refNames(value, binding) &&
    isObject(value) &&
    value.bytes === bytesOf(binding.text) &&
    isCommit(value.commit)
  )) {
    fail(code, `${what} does not bind ${binding.path} exactly`);
  }
}

/** Not live, authorises nothing, and carries no `*Authorised: true`. */
function requireGrantsNothing(record: Json, role: string): void {
  const grants = Object.keys(record).filter(
    (key) => /Authori[sz]ed$/.test(key) && record[key] !== false,
  );
  if (record.isLiveAuthority !== false || !same(record.thisFileAuthorises, []) || grants.length) {
    fail('HOST_RECOVERY_RECORD_GRANTS_AUTHORITY', `${role} grants authority`);
  }
}

const targetMatches = (value: unknown, target: FixedRecoveryTarget): boolean =>
  isObject(value) && same(value, target);

// ---------------------------------------------------------------------------
// Probes (sustained series and T-0 share one shape).
// ---------------------------------------------------------------------------

/** Every proof of one probe holds, over exactly the committed control names. */
export function probeIsGreen(probe: unknown, noDns64Required: boolean): boolean {
  if (!isObject(probe)) return false;
  const names = Array.isArray(probe.namesQueried) ? probe.namesQueried : null;
  const allowed: readonly unknown[] = [
    ...HOST_RECOVERY_CONTROL_NAMES_V1,
    HOST_RECOVERY_VANTAGE_PROOF_NAME,
  ];
  return (
    probe.verdict === 'GREEN' &&
    HOST_RECOVERY_PROBE_PROOFS.every((proof) => probe[proof] === true) &&
    (!noDns64Required || probe[HOST_RECOVERY_NO_DNS64_PROOF] === true) &&
    same(probe.controlNamesResolved, [...HOST_RECOVERY_CONTROL_NAMES_V1]) &&
    probe.sleepWakeDarkWakeEvents === 0 &&
    names !== null &&
    names.every((name) => allowed.includes(name))
  );
}

// ---------------------------------------------------------------------------
// The precondition (V3-H4 under UQ2).
// ---------------------------------------------------------------------------

export interface HostRecoveryPreconditionExpectation {
  readonly incidentRuling: PinnedCommittedRecord;
  readonly approvedAmendment: PinnedCommittedRecord;
  readonly target: FixedRecoveryTarget;
  readonly ledger: { readonly entryCount: number; readonly ledgerHash: string };
  readonly defectClass: HostRecoveryDefectClass;
  /** The original authority's compliant-vantage rule requires no DNS64/NAT64. */
  readonly noDns64Required: boolean;
  /** The target's own names, when the caller has them: never a probe name. */
  readonly forbiddenNames?: readonly string[];
}

export interface ValidatedPrecondition {
  readonly recordedAtMs: number;
  readonly finalProbeMs: number;
  readonly validUntilMs: number;
}

export function validateHostRecoveryPrecondition(
  binding: PinnedCommittedRecord,
  expected: HostRecoveryPreconditionExpectation,
): ValidatedPrecondition {
  const record = parseRecord(binding, 'recovery precondition');
  if (
    record.recordKind !== HOST_RECOVERY_RECORD_KINDS.precondition ||
    record.generationId !== GENERATION_ID
  ) {
    fail('HOST_RECOVERY_RECORD_KIND', 'not a Generation-2 targeted host recovery precondition');
  }
  requireGrantsNothing(record, 'the precondition');
  if (record.outcome !== PRECONDITION_PROVED) {
    fail('HOST_RECOVERY_PRECONDITION_NOT_PROVED', 'the precondition outcome is not PROVED');
  }
  const P = HOST_RECOVERY_PRECONDITION_PARAMETERS;
  requirePinnedRef(
    record.boundIncidentRuling,
    expected.incidentRuling,
    'HOST_RECOVERY_PRECONDITION_BINDING',
    'precondition.boundIncidentRuling',
  );
  requirePinnedRef(
    record.boundApprovedAmendment,
    expected.approvedAmendment,
    'HOST_RECOVERY_PRECONDITION_BINDING',
    'precondition.boundApprovedAmendment',
  );
  if (
    record.defectClass !== expected.defectClass ||
    record.defectClass !== P.defectClass ||
    !same(record.parameters, {
      ownerDecision: P.ownerDecision,
      minimumProbes: P.minimumProbes,
      minimumSpanMinutes: P.minimumSpanMinutes,
      validityMinutes: P.validityMinutes,
    })
  ) {
    fail('HOST_RECOVERY_PRECONDITION_BINDING', 'the precondition is not for the approved class');
  }
  if (!targetMatches(record.target, expected.target)) {
    fail('HOST_RECOVERY_TARGET_MISMATCH', 'the precondition names another target');
  }
  if (!same(record.boundLedger, expected.ledger)) {
    fail('HOST_RECOVERY_LEDGER_MOVED', 'the precondition binds another ledger revision');
  }
  const series = obj(record.sustainedSeries, 'sustainedSeries');
  const probes = Array.isArray(series.probes) ? series.probes : [];
  const queried = probes.flatMap((p) =>
    isObject(p) && Array.isArray(p.namesQueried) ? p.namesQueried : [],
  );
  const forbidden = expected.forbiddenNames ?? [];
  const allowedNames: readonly unknown[] = [
    ...HOST_RECOVERY_CONTROL_NAMES_V1,
    HOST_RECOVERY_VANTAGE_PROOF_NAME,
  ];
  if (
    record.targetProbed !== false ||
    !same(record.controlNames, [...HOST_RECOVERY_CONTROL_NAMES_V1]) ||
    queried.some((name) => !allowedNames.includes(name)) ||
    forbidden.some(
      (name) =>
        queried.includes(name) ||
        (HOST_RECOVERY_CONTROL_NAMES_V1 as readonly string[]).includes(name),
    )
  ) {
    fail(
      'HOST_RECOVERY_PRECONDITION_TARGET_PROBED',
      'the precondition probes anything but the committed control names',
    );
  }
  const times = probes.map((p, k) =>
    instant(isObject(p) ? p.atUtc : undefined, `probe ${String(k)}`),
  );
  const ordered = times.every((t, k) => k === 0 || t > times[k - 1]!);
  if (
    probes.length < P.minimumProbes ||
    !ordered ||
    times.at(-1)! - times[0]! < P.minimumSpanMinutes * MINUTE_MS ||
    !probes.every((probe) => probeIsGreen(probe, expected.noDns64Required)) ||
    series.firstProbeAtUtc !== (probes[0] as Json | undefined)?.atUtc ||
    series.finalProbeAtUtc !== (probes.at(-1) as Json | undefined)?.atUtc
  ) {
    fail(
      'HOST_RECOVERY_PRECONDITION_SERIES_INSUFFICIENT',
      `the sustained series is not >= ${String(P.minimumProbes)} GREEN probes over >= ${String(P.minimumSpanMinutes)} minutes`,
    );
  }
  const finalProbeMs = times.at(-1)!;
  const validUntilMs = instant(record.validUntilUtc, 'validUntilUtc');
  const recordedAtMs = instant(record.recordedAtUtc, 'precondition.recordedAtUtc');
  if (
    validUntilMs !== finalProbeMs + P.validityMinutes * MINUTE_MS ||
    recordedAtMs < finalProbeMs
  ) {
    fail(
      'HOST_RECOVERY_PRECONDITION_STALE',
      `the precondition validity is not exactly ${String(P.validityMinutes)} minutes after its final probe`,
    );
  }
  return { recordedAtMs, finalProbeMs, validUntilMs };
}

// ---------------------------------------------------------------------------
// The operator-kit host-semantics repair (UQ4): no recovery LIVE authority without it.
// ---------------------------------------------------------------------------

export function validateOperatorKitHostSemanticsRepair(binding: PinnedCommittedRecord): {
  readonly recordedAtMs: number;
} {
  const record = parseRecord(binding, 'operator-kit host-semantics repair');
  const review = isObject(record.review) ? record.review : {};
  const reviewRecord = isObject(review.reviewRecord) ? review.reviewRecord : {};
  if (
    record.recordKind !== HOST_RECOVERY_RECORD_KINDS.operatorKitRepair ||
    record.generationId !== GENERATION_ID ||
    record.isLiveAuthority !== false ||
    !same(record.thisFileAuthorises, []) ||
    !same(record.proves, OPERATOR_KIT_REPAIR_REQUIRED_PROOFS) ||
    review.reviewed !== true ||
    typeof reviewRecord.path !== 'string' ||
    !isCommit(reviewRecord.commit) ||
    typeof reviewRecord.sha256 !== 'string' ||
    !HEX64.test(reviewRecord.sha256) ||
    !Number.isInteger(reviewRecord.bytes)
  ) {
    fail(
      'HOST_RECOVERY_OPERATOR_KIT_REPAIR_NOT_PROVED',
      'no committed, separately reviewed operator-kit host-semantics repair proves frozen-P8-only input, separate host integrity, no hard-coded host claims and persisted observations',
    );
  }
  return { recordedAtMs: instant(record.recordedAtUtc, 'repair.recordedAtUtc') };
}

// ---------------------------------------------------------------------------
// The recovery authority.
// ---------------------------------------------------------------------------

export interface HostRecoveryAuthorityExpectation {
  readonly originalWindowAuthority: CommittedRecordBinding;
  readonly originalLiveResult: CommittedRecordBinding;
  readonly originalHostSafety: unknown;
  readonly incidentRuling: PinnedCommittedRecord;
  readonly approvedAmendment: PinnedCommittedRecord;
  readonly precondition: PinnedCommittedRecord;
  readonly validatedPrecondition: ValidatedPrecondition;
  readonly operatorKitRepair: PinnedCommittedRecord;
  readonly incident: HostRecoveryIncidentKey;
  readonly target: FixedRecoveryTarget;
  readonly ledger: { readonly entryCount: number; readonly ledgerHash: string };
  readonly originalAcquisitionCodeTree: AcquisitionCodeTree;
}

export function validateHostRecoveryAuthority(
  binding: PinnedCommittedRecord,
  expected: HostRecoveryAuthorityExpectation,
): { readonly recordedAtMs: number } {
  const record = parseRecord(binding, 'recovery authority');
  if (
    record.recordKind !== HOST_RECOVERY_RECORD_KINDS.authority ||
    record.generationId !== GENERATION_ID ||
    record.isLiveAuthority !== true ||
    record.concept !== HOST_RECOVERY_CONCEPT
  ) {
    fail('HOST_RECOVERY_RECORD_KIND', 'not a Generation-2 targeted host recovery authority');
  }
  const kit = validateOperatorKitHostSemanticsRepair(expected.operatorKitRepair);
  const code = 'HOST_RECOVERY_AUTHORITY_BINDING';
  requireRefWithCommit(
    record.boundOriginalWindowAuthority,
    expected.originalWindowAuthority,
    code,
    'boundOriginalWindowAuthority',
  );
  requireRefWithCommit(
    record.boundOriginalLiveResult,
    expected.originalLiveResult,
    code,
    'boundOriginalLiveResult',
  );
  requirePinnedRef(
    record.boundIncidentRuling,
    expected.incidentRuling,
    code,
    'boundIncidentRuling',
  );
  requirePinnedRef(
    record.boundApprovedAmendment,
    expected.approvedAmendment,
    code,
    'boundApprovedAmendment',
  );
  requirePinnedRef(record.boundPrecondition, expected.precondition, code, 'boundPrecondition');
  requirePinnedRef(
    record.boundOperatorKitHostSemanticsRepair,
    expected.operatorKitRepair,
    'HOST_RECOVERY_OPERATOR_KIT_REPAIR_NOT_PROVED',
    'boundOperatorKitHostSemanticsRepair',
  );
  if (!same(record.originalItem, expected.incident)) {
    fail(code, 'the authority names another incident');
  }
  if (!targetMatches(record.target, expected.target)) {
    fail('HOST_RECOVERY_TARGET_MISMATCH', 'the authority target is not the fixed target');
  }
  if (!same(record.acquisitionCodeTree, expected.originalAcquisitionCodeTree)) {
    fail(
      'HOST_RECOVERY_ACQUISITION_CODE_CHANGED',
      'the acquisition code tree differs from the original authority',
    );
  }
  if (!same(record.boundLedger, expected.ledger)) {
    fail('HOST_RECOVERY_LEDGER_MOVED', 'the ledger moved since the incident');
  }
  if (!same(record.limits, HOST_RECOVERY_LIMITS)) {
    fail(
      'HOST_RECOVERY_AUTHORITY_LIMITS',
      'the authority limits are not exactly one invocation, one per target, no retry, concurrency one',
    );
  }
  const flags = obj(record.flags, 'flags');
  const topLevelGrants = HOST_RECOVERY_AUTHORITY_FALSE_FLAGS.filter(
    (flag) => Object.hasOwn(record, flag) && record[flag] !== false,
  );
  if (
    !same(Object.keys(flags).sort(), [...HOST_RECOVERY_AUTHORITY_FALSE_FLAGS].sort()) ||
    HOST_RECOVERY_AUTHORITY_FALSE_FLAGS.some((flag) => flags[flag] !== false) ||
    topLevelGrants.length !== 0
  ) {
    fail(
      'HOST_RECOVERY_AUTHORITY_GRANTS_MUTATION',
      'the authority grants ledger, reserve, acquisition-of-record, adjudication or window mutation',
    );
  }
  if (!same(record.hostSafety, expected.originalHostSafety)) {
    fail('HOST_RECOVERY_HOST_SAFETY_CHANGED', 'the host-safety block is not the original verbatim');
  }
  if (
    record.invocationConsumptionRule !== HOST_RECOVERY_OWNER_RESOLUTIONS.UQ5 ||
    !same(record.gateReadoutRule, RECOVERY_GATE_READOUT_RULE)
  ) {
    fail(code, 'the authority does not carry the owner UQ1/UQ5 rules');
  }
  const recordedAtMs = instant(record.recordedAtUtc, 'authority.recordedAtUtc');
  const pre = expected.validatedPrecondition;
  if (recordedAtMs < pre.recordedAtMs || recordedAtMs < kit.recordedAtMs) {
    fail(
      'HOST_RECOVERY_PRECONDITION_AFTER_AUTHORITY',
      'the precondition or operator-kit repair was recorded after the authority',
    );
  }
  if (recordedAtMs > pre.validUntilMs) {
    fail(
      'HOST_RECOVERY_PRECONDITION_STALE',
      'the authority was recorded after the precondition validity expired; a new series is required',
    );
  }
  return { recordedAtMs };
}

// ---------------------------------------------------------------------------
// UQ5: when is the one recovery invocation spent?
// ---------------------------------------------------------------------------

/** Consumed once a CLI execute was issued OR a run row exists; never replaced automatically. */
export function recoveryInvocationDisposition(input: {
  readonly cliExecuteIssued: boolean;
  readonly runCreated: boolean;
}): (typeof RECOVERY_INVOCATION_DISPOSITIONS)[keyof typeof RECOVERY_INVOCATION_DISPOSITIONS] {
  return input.cliExecuteIssued || input.runCreated
    ? RECOVERY_INVOCATION_DISPOSITIONS.consumed
    : RECOVERY_INVOCATION_DISPOSITIONS.unspent;
}

// ---------------------------------------------------------------------------
// The recovery result (evidence only).
// ---------------------------------------------------------------------------

export interface HostRecoveryResultExpectation {
  readonly recoveryAuthority: PinnedCommittedRecord;
  readonly authorityRecordedAtMs: number;
  readonly precondition: PinnedCommittedRecord;
  readonly incidentRuling: PinnedCommittedRecord;
  readonly incident: HostRecoveryIncidentKey;
  readonly target: FixedRecoveryTarget;
  readonly ledger: { readonly entryCount: number; readonly ledgerHash: string };
  readonly originalAcquisitionCodeTree: AcquisitionCodeTree;
  readonly noDns64Required: boolean;
  /** Every ordinary and earlier recovery run reference known when the result is read. */
  readonly knownRunRefs: readonly string[];
}

export interface ValidatedHostRecoveryResult {
  readonly integrityVerdict: RecoveryIntegrityVerdict;
  readonly invocationDisposition: ReturnType<typeof recoveryInvocationDisposition>;
  readonly recoveryRunRefSha256: string | null;
}

/** The recovery integrity verdict the evidence supports (recorded must equal it). */
export function deriveRecoveryIntegrity(
  result: Json,
  noDns64Required: boolean,
): RecoveryIntegrityVerdict {
  const hv = isObject(result.hostAndVantage) ? result.hostAndVantage : {};
  const delta = isObject(result.databaseDelta) ? result.databaseDelta : {};
  const invocation = isObject(result.invocation) ? result.invocation : {};
  if (!probeIsGreen(hv.t0, noDns64Required)) return 'PRECONDITION_NOT_HELD_AT_EXECUTION';
  if (
    !probeIsGreen(hv.postInvocation, noDns64Required) ||
    hv.sleepWakeDarkWakeEventsDuringRecovery !== 0
  ) {
    return 'HOST_INTEGRITY_NOT_PROVED_DURING_RECOVERY';
  }
  if (result.executionExclusivityVerdict !== 'EXCLUSIVE_PROVED_FOR_THIS_ITEM') {
    return 'CONCURRENCY_INTEGRITY_STOP';
  }
  if (result.monitorCoverageSufficient !== true) return 'MONITOR_COVERAGE_INSUFFICIENT';
  if (
    invocation.runCreated !== true ||
    delta.runs !== 1 ||
    delta.completions !== 1 ||
    delta.dryRunRuns !== 0 ||
    delta.runsWithoutCompletion !== 0
  ) {
    return 'PERSISTENCE_INTEGRITY_STOP';
  }
  return 'CLEAN';
}

export function validateHostRecoveryResult(
  binding: PinnedCommittedRecord,
  expected: HostRecoveryResultExpectation,
): ValidatedHostRecoveryResult {
  const record = parseRecord(binding, 'recovery result');
  if (
    record.recordKind !== HOST_RECOVERY_RECORD_KINDS.result ||
    record.generationId !== GENERATION_ID ||
    record.status !== RECOVERY_RESULT_STATUS ||
    record.resultDoesNotMutateAcquisitionOfRecord !== true
  ) {
    fail('HOST_RECOVERY_RECORD_KIND', 'not an evidence-only targeted host recovery result');
  }
  requireGrantsNothing(record, 'the recovery result');
  const code = 'HOST_RECOVERY_RESULT_BINDING';
  requirePinnedRef(
    record.boundRecoveryAuthority,
    expected.recoveryAuthority,
    code,
    'result.boundRecoveryAuthority',
  );
  requirePinnedRef(
    record.boundPrecondition,
    expected.precondition,
    code,
    'result.boundPrecondition',
  );
  requirePinnedRef(
    record.boundIncidentRuling,
    expected.incidentRuling,
    code,
    'result.boundIncidentRuling',
  );
  if (
    record.originalRunRefSha256 !== expected.incident.originalRunRefSha256 ||
    !same(record.originalItem, expected.incident)
  ) {
    fail(code, 'the result names another original run');
  }
  if (
    !targetMatches(record.target, expected.target) ||
    record.fetchPolicyVersion !== expected.target.fetchPolicyVersion ||
    record.ruleVersion !== expected.target.ruleVersion
  ) {
    fail('HOST_RECOVERY_TARGET_MISMATCH', 'the result measured another target, policy or ruleset');
  }
  if (!same(record.acquisitionCodeTreeAtExecution, expected.originalAcquisitionCodeTree)) {
    fail('HOST_RECOVERY_ACQUISITION_CODE_CHANGED', 'the recovery ran other acquisition code');
  }
  if (
    !same(record.ledgerDuringRecovery, expected.ledger) ||
    record.ledgerMovement !== 0 ||
    record.reserveConsumed !== 0 ||
    record.membershipChange !== 0
  ) {
    fail(
      'HOST_RECOVERY_LEDGER_MOVED',
      'the recovery moved the ledger, a reserve or window membership',
    );
  }
  const readout = obj(record.recoveryLocalGateReadout, 'recoveryLocalGateReadout');
  if (
    Object.entries(RECOVERY_GATE_READOUT_RULE).some(([key, value]) => readout[key] !== value) ||
    !Array.isArray(readout.firedConditions) ||
    typeof readout.decision !== 'string'
  ) {
    fail(
      'HOST_RECOVERY_GATE_READOUT_MISAPPLIED',
      'the recovery P1-P8 readout must be recorded only, never a pause system or a window input',
    );
  }

  // UQ5 invocation accounting.
  const invocation = obj(record.invocation, 'invocation');
  const issued = invocation.cliExecuteIssued;
  const created = invocation.runCreated;
  if (typeof issued !== 'boolean' || typeof created !== 'boolean') {
    fail('HOST_RECOVERY_RECORD_SHAPE', 'invocation.cliExecuteIssued / runCreated are not booleans');
  }
  const disposition = recoveryInvocationDisposition({
    cliExecuteIssued: issued as boolean,
    runCreated: created as boolean,
  });
  const t0Ms = instant(
    obj(obj(record.hostAndVantage, 'hostAndVantage').t0, 't0').atUtc,
    't0.atUtc',
  );
  if (
    invocation.disposition !== disposition ||
    invocation.automaticReplacementInvocation !== false ||
    t0Ms < expected.authorityRecordedAtMs ||
    record.retries !== 0
  ) {
    fail(
      'HOST_RECOVERY_INVOCATION_ACCOUNTING',
      'the invocation disposition is not the UQ5 rule, T-0 precedes the authority, or a retry exists',
    );
  }

  const integrityVerdict = deriveRecoveryIntegrity(record, expected.noDns64Required);
  if (
    !(RECOVERY_INTEGRITY_VERDICTS as readonly unknown[]).includes(record.integrityVerdict) ||
    record.integrityVerdict !== integrityVerdict
  ) {
    fail(
      'HOST_RECOVERY_RESULT_INTEGRITY_INCONSISTENT',
      `the recorded integrity verdict is not the one its evidence supports (${integrityVerdict})`,
    );
  }

  let recoveryRunRefSha256: string | null = null;
  if (disposition === RECOVERY_INVOCATION_DISPOSITIONS.unspent) {
    if (
      integrityVerdict !== 'PRECONDITION_NOT_HELD_AT_EXECUTION' ||
      record.cliExecuteInvocations !== 0 ||
      record.runsForTarget !== 0 ||
      record.recoveryRunRefSha256 !== null
    ) {
      fail(
        'HOST_RECOVERY_INVOCATION_ACCOUNTING',
        'an unspent invocation is only a T-0 abort with zero CLI executions and zero runs',
      );
    }
  } else {
    const ref = record.recoveryRunRefSha256;
    if (typeof ref !== 'string' || !HEX64.test(ref)) {
      fail(
        'HOST_RECOVERY_RECORD_SHAPE',
        'a consumed invocation needs a 64-hex recovery run reference',
      );
    }
    recoveryRunRefSha256 = ref as string;
    if (
      recoveryRunRefSha256 === expected.incident.originalRunRefSha256 ||
      expected.knownRunRefs.includes(recoveryRunRefSha256)
    ) {
      fail(
        'HOST_RECOVERY_RUN_REFERENCE_DUPLICATE',
        'the recovery run reference repeats the original or another historical run',
      );
    }
    if (
      integrityVerdict === 'CLEAN' &&
      (record.cliExecuteInvocations !== 1 ||
        record.runsForTarget !== 1 ||
        record.completionRows !== 1 ||
        record.runTerminalState !== 'COMPLETED' ||
        record.dryRun !== false)
    ) {
      fail(
        'HOST_RECOVERY_RESULT_NOT_ONE_CLEAN_RUN',
        'the recovery is not exactly one clean completed non-dry run',
      );
    }
  }
  return { integrityVerdict, invocationDisposition: disposition, recoveryRunRefSha256 };
}

// ---------------------------------------------------------------------------
// The whole chain, for one recovered adjudication item.
// ---------------------------------------------------------------------------

/** One recovery, supplied explicitly with its window's history binding; never looked up. */
export interface TargetedHostRecoveryBinding {
  readonly incidentRuling: PinnedCommittedRecord;
  readonly approvedAmendment: PinnedCommittedRecord;
  readonly precondition: PinnedCommittedRecord;
  readonly operatorKitRepair: PinnedCommittedRecord;
  readonly recoveryAuthority: PinnedCommittedRecord;
  readonly recoveryResult: PinnedCommittedRecord;
  /** Git tree hashes of src/orgunits/ and src/cli/ at the ORIGINAL window authority commit. */
  readonly originalAcquisitionCodeTree: AcquisitionCodeTree;
}

/** What the replay knows when it reaches the recovered item of the window it is closing. */
export interface TargetedHostRecoveryContext {
  readonly windowOrdinal: number;
  readonly authority: CommittedRecordBinding;
  readonly liveResult: CommittedRecordBinding;
  readonly validatedLiveItems: readonly Readonly<Record<string, unknown>>[];
  readonly incident: HostRecoveryIncidentKey;
  /** The ledger revision during the window (its prefix through the window's append). */
  readonly ledgerEntries: readonly {
    readonly sequence: number;
    readonly selectionIndex: number;
    readonly generation2ReserveRankPosition: number;
  }[];
  readonly ledgerDuringWindow: { readonly entryCount: number; readonly ledgerHash: string };
  readonly priorAdjudicatedWorkItemIds: readonly string[];
  /** Prior windows' executed references plus this window's LIVE_RESULT references. */
  readonly ordinaryRunRefs: readonly string[];
  readonly priorRecoveryRunRefs: readonly string[];
  readonly priorRecoveryIncidents: readonly HostRecoveryIncidentKey[];
}

export interface ValidatedTargetedHostRecovery {
  readonly incident: HostRecoveryIncidentKey;
  readonly eligibility: HostRecoveryEligibility;
  readonly fixedTarget: FixedRecoveryTarget;
  readonly integrityVerdict: RecoveryIntegrityVerdict;
  readonly recoveryRunRefSha256: string | null;
}

/** The one implementation of "is this a valid, adjudicable-or-not recovery of this incident". */
export function validateTargetedHostRecovery(
  binding: TargetedHostRecoveryBinding,
  context: TargetedHostRecoveryContext,
): ValidatedTargetedHostRecovery {
  const eligibility = evaluateHostRecoveryEligibility({
    target: context.incident,
    window: {
      windowOrdinal: context.windowOrdinal,
      authority: context.authority,
      liveResult: context.liveResult,
      validatedLiveItems: context.validatedLiveItems,
      // As of the recovery: a later window cannot be authorised before this one
      // is adjudicated, so when the recovery ran this window was the open, last one.
      isOpenLastWindow: true,
    },
    priorAdjudicatedWorkItemIds: context.priorAdjudicatedWorkItemIds,
    ordinaryRunRefs: context.ordinaryRunRefs,
    ledgerEntries: context.ledgerEntries,
    incidentRuling: binding.incidentRuling,
    approvedAmendment: binding.approvedAmendment,
    recordedIntegrityVerdicts: [],
    existingRecoveryIncidents: context.priorRecoveryIncidents,
    declaredTarget: (parsePinned(binding.recoveryAuthority) ?? {}).target,
  });
  const first = eligibility.refusals[0];
  if (first !== undefined || eligibility.fixedTarget === null) {
    refuse(
      first?.code ?? 'HOST_RECOVERY_TARGET_NOT_FIXED_BY_COMMITTED_EVIDENCE',
      `window ${String(context.windowOrdinal)} ${context.incident.workItemId}: not eligible for targeted host recovery (${eligibility.refusals.map((r) => `${r.id} ${r.code}`).join('; ')})`,
    );
  }
  const target = eligibility.fixedTarget!;
  const originalAuthority = parsePinned(context.authority)!;
  const noDns64Required = isObject(originalAuthority.hostSafety)
    ? 'compliantVantageRequired' in originalAuthority.hostSafety
    : false;
  const pre = validateHostRecoveryPrecondition(binding.precondition, {
    incidentRuling: binding.incidentRuling,
    approvedAmendment: binding.approvedAmendment,
    target,
    ledger: context.ledgerDuringWindow,
    defectClass: eligibility.defectClass!,
    noDns64Required,
  });
  const authority = validateHostRecoveryAuthority(binding.recoveryAuthority, {
    originalWindowAuthority: context.authority,
    originalLiveResult: context.liveResult,
    originalHostSafety: originalAuthority.hostSafety,
    incidentRuling: binding.incidentRuling,
    approvedAmendment: binding.approvedAmendment,
    precondition: binding.precondition,
    validatedPrecondition: pre,
    operatorKitRepair: binding.operatorKitRepair,
    incident: context.incident,
    target,
    ledger: context.ledgerDuringWindow,
    originalAcquisitionCodeTree: binding.originalAcquisitionCodeTree,
  });
  const result = validateHostRecoveryResult(binding.recoveryResult, {
    recoveryAuthority: binding.recoveryAuthority,
    authorityRecordedAtMs: authority.recordedAtMs,
    precondition: binding.precondition,
    incidentRuling: binding.incidentRuling,
    incident: context.incident,
    target,
    ledger: context.ledgerDuringWindow,
    originalAcquisitionCodeTree: binding.originalAcquisitionCodeTree,
    noDns64Required,
    knownRunRefs: [...context.ordinaryRunRefs, ...context.priorRecoveryRunRefs],
  });
  return {
    incident: context.incident,
    eligibility,
    fixedTarget: target,
    integrityVerdict: result.integrityVerdict,
    recoveryRunRefSha256: result.recoveryRunRefSha256,
  };
}

/** Which incident a supplied binding is for, read from its authority. */
export function incidentOfBinding(binding: TargetedHostRecoveryBinding): HostRecoveryIncidentKey {
  const authority = parsePinned(binding.recoveryAuthority);
  const item = isObject(authority?.originalItem) ? authority.originalItem : null;
  if (
    item === null ||
    !Number.isInteger(item.windowOrdinal) ||
    typeof item.workItemId !== 'string' ||
    typeof item.originalRunRefSha256 !== 'string'
  ) {
    fail('HOST_RECOVERY_RECORD_NOT_PINNED', 'a recovery binding names no readable incident');
  }
  return {
    windowOrdinal: item!.windowOrdinal as number,
    workItemId: item!.workItemId as string,
    originalRunRefSha256: item!.originalRunRefSha256 as string,
  };
}

// ---------------------------------------------------------------------------
// The adjudication item's acquisition-of-record block (V3-H7).
// ---------------------------------------------------------------------------

/** The public-safe provenance a replay exposes for a recovered item. */
export interface ReplayedAcquisitionOfRecord {
  readonly source: typeof ACQUISITION_OF_RECORD_SOURCE;
  /** The recovery run the current Generation-2 state reads for this item. */
  readonly runRefSha256: string;
  /** The incident: window, work item and ORIGINAL run (retained, never relabelled). */
  readonly incident: HostRecoveryIncidentKey;
  readonly originalRunDisposition: typeof SUPERSESSION_TOKEN;
  readonly incidentRuling: { readonly path: string; readonly sha256: string };
  readonly approvedAmendment: { readonly path: string; readonly sha256: string };
  readonly precondition: { readonly path: string; readonly sha256: string };
  readonly operatorKitRepair: { readonly path: string; readonly sha256: string };
  readonly recoveryAuthority: { readonly path: string; readonly sha256: string };
  readonly recoveryResult: { readonly path: string; readonly sha256: string };
}

/**
 * The adjudication item that accepts a recovery: original integrity exactly
 * HOST_CONFOUNDED, and an acquisitionOfRecord block that names exactly this
 * chain, this recovery run and a CLEAN recovery integrity. Anything else is
 * refused; the frozen verdict vocabulary is checked by the caller as for any
 * item.
 */
export function validateAcquisitionOfRecord(
  item: Readonly<Record<string, unknown>>,
  binding: TargetedHostRecoveryBinding,
  validated: ValidatedTargetedHostRecovery,
): ReplayedAcquisitionOfRecord {
  const integrity = isObject(item.integrity) ? item.integrity : {};
  if (integrity.verdict !== HOST_CONFOUNDED) {
    fail(
      'HOST_RECOVERY_INTEGRITY_NOT_HOST_CONFOUNDED',
      `${validated.incident.workItemId}: a recovered item's original integrity must be exactly ${HOST_CONFOUNDED}`,
    );
  }
  if (validated.integrityVerdict !== 'CLEAN' || validated.recoveryRunRefSha256 === null) {
    fail(
      'HOST_RECOVERY_RESULT_NOT_CLEAN',
      `${validated.incident.workItemId}: the recovery result is ${validated.integrityVerdict}; only a CLEAN recovery is adjudicable`,
    );
  }
  const aor = obj(item.acquisitionOfRecord, 'acquisitionOfRecord');
  const originalRun = isObject(aor.originalRun) ? aor.originalRun : {};
  const mismatch =
    !same(Object.keys(aor).sort(), [...ACQUISITION_OF_RECORD_FIELDS]) ||
    aor.source !== ACQUISITION_OF_RECORD_SOURCE ||
    aor.runRefSha256 !== validated.recoveryRunRefSha256 ||
    !refNames(aor.recoveryAuthority, binding.recoveryAuthority) ||
    !refNames(aor.recoveryResult, binding.recoveryResult) ||
    !refNames(aor.precondition, binding.precondition) ||
    !refNames(aor.incidentRuling, binding.incidentRuling) ||
    !refNames(aor.approvedAmendment, binding.approvedAmendment) ||
    [
      aor.recoveryAuthority,
      aor.recoveryResult,
      aor.precondition,
      aor.incidentRuling,
      aor.approvedAmendment,
    ].some((ref) => !isObject(ref) || ref.bytes === undefined) ||
    !same(Object.keys(originalRun).sort(), [...ORIGINAL_RUN_DISPOSITION_FIELDS]) ||
    originalRun.runRefSha256 !== item.runRefSha256 ||
    originalRun.runRefSha256 !== validated.incident.originalRunRefSha256 ||
    originalRun.disposition !== SUPERSESSION_TOKEN ||
    originalRun.retained !== true ||
    originalRun.deleted !== false ||
    originalRun.executionRecordEdited !== false ||
    typeof originalRun.remainsValidEvidenceOf !== 'string' ||
    originalRun.remainsValidEvidenceOf.length === 0 ||
    !same(aor.recoveryIntegrity, { verdict: 'CLEAN', verdictScope: RECOVERY_INTEGRITY_SCOPE });
  if (mismatch) {
    fail(
      'HOST_RECOVERY_ACQUISITION_OF_RECORD_MISMATCH',
      `${validated.incident.workItemId}: acquisitionOfRecord does not name exactly the validated recovery chain`,
    );
  }
  const at = (b: CommittedRecordBinding) => ({ path: b.path, sha256: b.sha256 });
  return {
    source: ACQUISITION_OF_RECORD_SOURCE,
    runRefSha256: validated.recoveryRunRefSha256!,
    incident: validated.incident,
    originalRunDisposition: SUPERSESSION_TOKEN,
    incidentRuling: at(binding.incidentRuling),
    approvedAmendment: at(binding.approvedAmendment),
    precondition: at(binding.precondition),
    operatorKitRepair: at(binding.operatorKitRepair),
    recoveryAuthority: at(binding.recoveryAuthority),
    recoveryResult: at(binding.recoveryResult),
  };
}

// ---------------------------------------------------------------------------
// The original window's stop history is preserved, never recomputed.
// ---------------------------------------------------------------------------

/**
 * A window closed with a recovery records its ORIGINAL gate facts exactly as
 * the LIVE_RESULT holds them (P2, P5, recorded P8, the host-integrity stop)
 * plus the incident rulings' frozen-P8 correction - never a count recomputed
 * from recovery evidence, which never joins the window's denominator (UQ1).
 */
export function requireOriginalWindowStopHistoryPreserved(
  adjudication: Readonly<Record<string, unknown>>,
  liveResult: CommittedRecordBinding,
  incidentRulings: readonly PinnedCommittedRecord[],
  recoveredWorkItemIds: readonly string[],
): void {
  const live = parsePinned(liveResult) ?? {};
  const stops = isObject(live.stops) ? live.stops : {};
  const block = (key: string): Json => (isObject(stops[key]) ? stops[key] : {});
  const frozenP8 = [
    ...new Set(
      incidentRulings.map((ruling) => {
        const parsed = parsePinned(ruling);
        return isObject(parsed?.p8) ? parsed.p8.frozenP8Fired : undefined;
      }),
    ),
  ];
  const hostStop = block('hostIntegrityStop');
  const expected = {
    recomputedFromRecoveryEvidence: false,
    p2: {
      fired: block('p2').fired ?? false,
      windowRobotsRefusalCount: block('p2').windowRobotsRefusalCount ?? null,
    },
    p5: {
      fired: block('p5').fired ?? false,
      windowLowYieldCount: block('p5').windowLowYieldCount ?? null,
      denominator: block('p5').denominator ?? null,
    },
    p8: {
      recordedInLiveResult: block('p8').fired ?? false,
      frozenP8Fired: frozenP8.length === 1 ? frozenP8[0] : null,
    },
    hostIntegrityStop: {
      fired: hostStop.fired ?? false,
      classification: hostStop.classification ?? null,
      affectedItems: hostStop.affectedItems ?? [],
    },
  };
  const lowYieldValue = block('p5').lowYieldItems;
  const lowYield: readonly unknown[] = Array.isArray(lowYieldValue) ? lowYieldValue : [];
  const items = Array.isArray(adjudication.items) ? adjudication.items.filter(isObject) : [];
  const contributionRewritten = items.some(
    (item) =>
      recoveredWorkItemIds.includes(item.workItemId as string) &&
      Object.hasOwn(item, 'p5LowYieldContribution') &&
      item.p5LowYieldContribution !== lowYield.includes(item.workItemId),
  );
  if (
    typeof expected.p8.frozenP8Fired !== 'boolean' ||
    !same(adjudication.originalWindowStopHistory, expected) ||
    contributionRewritten
  ) {
    fail(
      'HOST_RECOVERY_STOP_HISTORY_REWRITTEN',
      'the recovered window must record its original P2/P5/P8 and host-integrity stop history unchanged',
    );
  }
}

/** For the record: the ordinary-window kinds a recovery validator refuses, by construction. */
export const RECOVERY_VALIDATORS_REFUSE_ORDINARY_KINDS = Object.values(
  ORDINARY_WINDOW_RECORD_KINDS,
);
