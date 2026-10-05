/**
 * GENERATION2_HOST_CONFOUNDED_REVALIDATION_ELIGIBLE: amendment clause V3-H1,
 * conditions E1-E14, as ONE PURE function over committed records. PURE.
 *
 * Every condition is evaluated, none short-circuits another, and each failed
 * condition yields exactly its own refusal code. Eligibility holds only when
 * all fourteen hold; anything unreadable fails its condition (fail closed).
 *
 * What eligibility may NEVER depend on: the organisation's desirability, the
 * recovery's expected yield, page or semantic content, labels, any recovery
 * result, or anyone's wish to improve an unfavourable outcome. Its inputs are
 * the original window's committed authority and LIVE_RESULT, the committed
 * owner incident ruling, the approved amendment, the ledger revision, and the
 * explicit history - all fixed BEFORE any recovery evidence exists.
 *
 * UQ3: no rule here interprets what a runtime DNS error code means. The
 * classification is the incident ruling's; eligibility needs an OBSERVED
 * host-side failure plus a causal channel, never a proved cause.
 *
 * No filesystem, no database, no network, no clock.
 */

import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import type { CommittedRecordBinding } from '../generation2History/adjudicationHistory.js';
import {
  APPROVED_HOST_RECOVERY_AMENDMENT,
  APPROVED_HOST_RECOVERY_AMENDMENT_BINDS,
  FIXED_RECOVERY_TARGET_FIELDS,
  HOST_CONFOUNDED_CAUSAL_EQUIVALENTS,
  HOST_CONFOUNDED_CAUSAL_PREFIX,
  HOST_INTEGRITY_STOP_CLASSIFICATION,
  HOST_RECOVERY_AMENDMENT_OWNER_DECISION,
  HOST_RECOVERY_AMENDMENT_RECORD_KIND,
  HOST_RECOVERY_APPROVED_DESIGN,
  HOST_RECOVERY_ELIGIBILITY_CONDITIONS,
  HOST_SAFETY_FAILURE_CLASSES,
  INCIDENT_RULING_RECORD_KIND,
  ORDINARY_CLEAN,
  ORDINARY_WINDOW_RECORD_KINDS,
  type FixedRecoveryTarget,
  type HostRecoveryDefectClass,
  type HostRecoveryEligibilityConditionId,
  type HostRecoveryEligibilityRefusal,
  type HostRecoveryIncidentKey,
} from './hostRecoveryContract.js';

const GENERATION_ID = 'METHODOLOGY_V3_GEN2';
const HEX64 = /^[0-9a-f]{64}$/;
const HEX40 = /^[0-9a-f]{40}$/;
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
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
const objectsOf = (value: unknown): Json[] => (Array.isArray(value) ? value.filter(isObject) : []);
/** The first own key of `value` matching `pattern`, or undefined. */
const keyed = (value: Json, pattern: RegExp): unknown =>
  Object.entries(value).find(([key]) => pattern.test(key))?.[1];

/** A committed record and the commit it was read at. */
export interface PinnedCommittedRecord extends CommittedRecordBinding {
  readonly commit: string;
}

/** The bytes parse and hash to their binding; otherwise null (the caller's condition fails). */
export function parsePinned(binding: CommittedRecordBinding | null | undefined): Json | null {
  if (binding == null || !HEX64.test(binding.sha256) || sha256(binding.text) !== binding.sha256) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(binding.text);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** A `{path, sha256[, bytes]}` value names exactly this binding's bytes. */
export const refNames = (value: unknown, binding: CommittedRecordBinding): boolean =>
  isObject(value) &&
  value.path === binding.path &&
  value.sha256 === binding.sha256 &&
  (value.bytes === undefined || value.bytes === bytesOf(binding.text));

// ---------------------------------------------------------------------------
// The approved amendment (E13).
// ---------------------------------------------------------------------------

/** E13: present, pinned to the approved bytes and commit, and an approval of Design A. */
export function isApprovedHostRecoveryAmendment(
  binding: PinnedCommittedRecord | null | undefined,
): boolean {
  const pin = APPROVED_HOST_RECOVERY_AMENDMENT;
  if (
    binding == null ||
    binding.path !== pin.path ||
    binding.commit !== pin.commit ||
    binding.sha256 !== pin.sha256 ||
    bytesOf(binding.text) !== pin.bytes
  ) {
    return false;
  }
  const record = parsePinned(binding);
  if (record === null || !isObject(record.bound)) return false;
  const bound = record.bound;
  return (
    record.recordKind === HOST_RECOVERY_AMENDMENT_RECORD_KIND &&
    record.generationId === GENERATION_ID &&
    record.isLiveAuthority === false &&
    record.methodologyAmendmentApproved === true &&
    record.approvedDesign === HOST_RECOVERY_APPROVED_DESIGN &&
    record.ownerDecision === HOST_RECOVERY_AMENDMENT_OWNER_DECISION &&
    Object.entries(APPROVED_HOST_RECOVERY_AMENDMENT_BINDS).every(([key, ref]) => {
      const named = bound[key];
      return (
        isObject(named) &&
        named.path === ref.path &&
        named.commit === ref.commit &&
        named.sha256 === ref.sha256 &&
        named.bytes === ref.bytes
      );
    })
  );
}

// ---------------------------------------------------------------------------
// Reading an incident ruling, generically.
// ---------------------------------------------------------------------------

/** The ruling's entry for one executed item, its host-integrity and causal blocks. */
export interface RulingItemReading {
  readonly item: Json;
  readonly hostIntegrity: Json | null;
  readonly causalAttribution: Json | null;
  readonly observedAcquisition: Json | null;
}

/**
 * The incident ruling's reading of one executed item: the `executedItems`
 * entry naming exactly this work item AND original run reference. Block keys
 * are matched by suffix (`*hostIntegrity`, `*causalAttribution`,
 * `*observedAcquisitionResult`), never by an item position.
 */
export function rulingItemOf(ruling: Json, key: HostRecoveryIncidentKey): RulingItemReading | null {
  if (!isObject(ruling.executedItems)) return null;
  const item = Object.values(ruling.executedItems).find(
    (value): value is Json =>
      isObject(value) &&
      value.workItemId === key.workItemId &&
      value.runRefSha256 === key.originalRunRefSha256,
  );
  if (item === undefined) return null;
  const block = (pattern: RegExp): Json | null => {
    const value = keyed(item, pattern);
    return isObject(value) ? value : null;
  };
  return {
    item,
    hostIntegrity: block(/(^|_)hostIntegrity$/),
    causalAttribution: block(/(^|_)causalAttribution$/),
    observedAcquisition: block(/(^|_)observedAcquisitionResult$/),
  };
}

/** The window ordinal a ruling's scope names (`WINDOW_<n>_HOST_INCIDENT_ONLY`), or null. */
export function rulingWindowOrdinal(ruling: Json): number | null {
  const match = /^WINDOW_(\d+)_HOST_INCIDENT_ONLY$/.exec(
    typeof ruling.scope === 'string' ? ruling.scope : '',
  );
  return match === null ? null : Number(match[1]);
}

const isHostConfoundedClassification = (value: unknown): boolean =>
  typeof value === 'string' &&
  (value.startsWith(HOST_CONFOUNDED_CAUSAL_PREFIX) ||
    HOST_CONFOUNDED_CAUSAL_EQUIVALENTS.includes(value));

/** The failure class of the host-safety component the ruling says failed, or null. */
export function failureClassOf(
  hostIntegrity: Json | null,
): (typeof HOST_SAFETY_FAILURE_CLASSES)[number] | null {
  if (hostIntegrity === null) return null;
  const component = hostIntegrity.onlyFailingComponent ?? hostIntegrity.failingHostSafetyComponent;
  return HOST_SAFETY_FAILURE_CLASSES.find((c) => c.failingComponent === component) ?? null;
}

// ---------------------------------------------------------------------------
// The eligibility function.
// ---------------------------------------------------------------------------

export interface HostRecoveryEligibilityInput {
  /** The incident: which executed item of which window, and its original run. */
  readonly target: HostRecoveryIncidentKey;
  /** The ordinary window the item executed in. */
  readonly window: {
    readonly windowOrdinal: number;
    readonly authority: CommittedRecordBinding;
    readonly liveResult: CommittedRecordBinding;
    /** What validateGeneration2LiveResultForHistory returned for it, or null when it refused. */
    readonly validatedLiveItems: readonly Readonly<Record<string, unknown>>[] | null;
    /** The window is the last committed window and no adjudication of it exists yet. */
    readonly isOpenLastWindow: boolean;
  };
  /** Work items adjudicated by any window of the explicit history before this one. */
  readonly priorAdjudicatedWorkItemIds: readonly string[];
  /** Every ordinary executed run reference: the explicit history plus this window. */
  readonly ordinaryRunRefs: readonly string[];
  /** The ledger revision at recovery time (sequence order). */
  readonly ledgerEntries: readonly {
    readonly sequence: number;
    readonly selectionIndex: number;
    readonly generation2ReserveRankPosition: number;
  }[];
  readonly incidentRuling: CommittedRecordBinding | null;
  readonly approvedAmendment: PinnedCommittedRecord | null;
  /** Every integrity verdict any committed record gives this item (E9). */
  readonly recordedIntegrityVerdicts: readonly unknown[];
  /** Incidents that already have a recovery authority, result or accepted recovery (E12). */
  readonly existingRecoveryIncidents: readonly HostRecoveryIncidentKey[];
  /** When supplied: the digest re-derived from the frozen frame / schedule / draw. */
  readonly rederivedIdentityDigest?: string;
  /** When supplied: a target a recovery record declares; it must be the fixed target (E14). */
  readonly declaredTarget?: unknown;
}

export interface HostRecoveryEligibilityRefusalEntry {
  readonly id: HostRecoveryEligibilityConditionId;
  readonly code: HostRecoveryEligibilityRefusal;
  readonly detail: string;
}

export interface HostRecoveryEligibility {
  readonly eligible: boolean;
  readonly refusals: readonly HostRecoveryEligibilityRefusalEntry[];
  /** The target fixed by E1-E5 evidence; null when it cannot be fixed. */
  readonly fixedTarget: FixedRecoveryTarget | null;
  readonly defectClass: HostRecoveryDefectClass | null;
}

const CODE = Object.fromEntries(HOST_RECOVERY_ELIGIBILITY_CONDITIONS) as Record<
  HostRecoveryEligibilityConditionId,
  HostRecoveryEligibilityRefusal
>;

export function evaluateHostRecoveryEligibility(
  input: HostRecoveryEligibilityInput,
): HostRecoveryEligibility {
  const { target, window } = input;
  const failed = new Map<HostRecoveryEligibilityConditionId, string>();
  const fail = (id: HostRecoveryEligibilityConditionId, detail: string): void => {
    if (!failed.has(id)) failed.set(id, detail);
  };

  const authority = parsePinned(window.authority);
  const live = parsePinned(window.liveResult);
  const ruling = parsePinned(input.incidentRuling);
  const authorisedItem = objectsOf(authority?.authorisedWorkItems).find(
    (item) => item.workItemId === target.workItemId,
  );
  const liveItem = (window.validatedLiveItems ?? []).find(
    (item) => item.workItemId === target.workItemId,
  ) as Json | undefined;
  const reading = ruling === null ? null : rulingItemOf(ruling, target);

  // E1 - an authorised item of a committed ordinary window, present in its LIVE_RESULT.
  if (
    authority === null ||
    authority.recordKind !== ORDINARY_WINDOW_RECORD_KINDS.authority ||
    authority.generationId !== GENERATION_ID ||
    authority.isLiveAuthority !== true ||
    authority.windowOrdinal !== window.windowOrdinal ||
    target.windowOrdinal !== window.windowOrdinal ||
    authorisedItem === undefined ||
    live === null ||
    live.recordKind !== ORDINARY_WINDOW_RECORD_KINDS.liveResult ||
    !objectsOf(live.items).some((item) => item.workItemId === target.workItemId)
  ) {
    fail('E1', 'not an authorised, executed item of a committed ordinary Generation-2 window');
  }

  // E2 - the LIVE_RESULT validates unchanged, and the item is one clean completed run.
  const invocations = isObject(live?.liveInvocations) ? live.liveInvocations : null;
  if (
    window.validatedLiveItems === null ||
    liveItem === undefined ||
    liveItem.cliExecuteInvocations !== 1 ||
    liveItem.runsForOccupant !== 1 ||
    liveItem.completionRows !== 1 ||
    liveItem.runTerminalState !== 'COMPLETED' ||
    liveItem.dryRun !== false ||
    invocations?.retries !== 0
  ) {
    fail('E2', 'the original is not one clean completed non-dry run in a validated LIVE_RESULT');
  }

  // E3 - the ordinary invocation right is exhausted (never unused window capacity).
  if (authority?.maximumLiveInvocationsPerWorkItem !== 1 || liveItem?.cliExecuteInvocations !== 1) {
    fail('E3', "the item's one ordinary invocation is not recorded as used");
  }

  // E4 - a full 64-hex original reference, the LIVE_RESULT's, exactly once in history.
  const occurrences = input.ordinaryRunRefs.filter((r) => r === target.originalRunRefSha256);
  if (
    !HEX64.test(target.originalRunRefSha256) ||
    liveItem?.runRefSha256 !== target.originalRunRefSha256 ||
    occurrences.length !== 1
  ) {
    fail('E4', 'the original run reference is malformed, not the LIVE_RESULT one, or not unique');
  }

  // E5 - a committed owner incident ruling naming exactly this item and run.
  const stop = isObject(ruling?.hostIntegrityStop) ? ruling.hostIntegrityStop : null;
  const affected = Array.isArray(stop?.affectedItems) ? stop.affectedItems : [];
  const boundRefs = isObject(ruling?.bound) ? Object.values(ruling.bound) : [];
  const preserved = (block: unknown): boolean =>
    block === undefined || (isObject(block) && block.preserved === true && block.waived === false);
  if (
    ruling === null ||
    ruling.recordKind !== INCIDENT_RULING_RECORD_KIND ||
    ruling.generationId !== GENERATION_ID ||
    ruling.isLiveAuthority !== false ||
    rulingWindowOrdinal(ruling) !== window.windowOrdinal ||
    !boundRefs.some((ref) => refNames(ref, window.liveResult)) ||
    !boundRefs.some((ref) => refNames(ref, window.authority)) ||
    reading === null ||
    !isHostConfoundedClassification(reading.causalAttribution?.classification) ||
    stop?.classification !== HOST_INTEGRITY_STOP_CLASSIFICATION ||
    !affected.includes(target.workItemId) ||
    ruling.frozenSignalsRemainHistoricallyRealRegardlessOfCause !== true ||
    !preserved(ruling.p2) ||
    !preserved(ruling.p5) ||
    !isObject(ruling.p8) ||
    typeof ruling.p8.frozenP8Fired !== 'boolean'
  ) {
    fail('E5', 'no committed host-confounded owner incident ruling names this exact item and run');
  }

  // E6 - an OBSERVED host/vantage failure of a check the authority made a precondition.
  const host = reading?.hostIntegrity ?? null;
  const failureClass = failureClassOf(host);
  const hostSafety = isObject(authority?.hostSafety) ? authority.hostSafety : null;
  const observedRed =
    host?.postItemHostCheck === 'RED' ||
    (host?.preItemHostCheck === 'GREEN' && host.inItemHostCheck === 'RED');
  if (
    !observedRed ||
    failureClass === null ||
    hostSafety === null ||
    !(failureClass.hostSafetyKey in hostSafety)
  ) {
    fail('E6', 'the ruling cites no observed RED host/vantage precondition check for this item');
  }

  // E7 - the observed failure could have produced the observed outcome.
  const errorKind =
    reading?.observedAcquisition?.errorKind ?? liveItem?.q3BlockingTransportErrorKind;
  const hostPoints = reading?.causalAttribution
    ? keyed(reading.causalAttribution, /^pointsTowardHost/)
    : undefined;
  if (
    failureClass === null ||
    !(failureClass.causalErrorKinds as readonly unknown[]).includes(errorKind) ||
    liveItem?.q3BlockingTransportErrorKind !== errorKind ||
    !Array.isArray(hostPoints) ||
    hostPoints.length === 0
  ) {
    fail('E7', 'no causal channel from the observed host failure to the observed outcome');
  }

  // E8 - the execution record itself corroborates a host-side observation.
  const vantage = isObject(liveItem?.hostAndVantage) ? liveItem.hostAndVantage : null;
  const executionRecordShowsHostFailure =
    vantage !== null &&
    (vantage.postItem === false ||
      vantage.inItem === false ||
      (typeof vantage.sleepWakeDarkWakeEventsDuringItem === 'number' &&
        vantage.sleepWakeDarkWakeEventsDuringItem > 0));
  if (!executionRecordShowsHostFailure) {
    fail('E8', 'the only grounds are the acquisition outcome; no host-side observation exists');
  }

  // E9 - the original was never recorded CLEAN anywhere.
  const verdicts = [
    ...input.recordedIntegrityVerdicts,
    isObject(liveItem?.integrity) ? liveItem.integrity.verdict : undefined,
  ];
  if (
    verdicts.includes(ORDINARY_CLEAN) ||
    reading?.item.disposition === 'ACQUISITION_EVIDENCE_INDEPENDENTLY_INTACT' ||
    reading?.item.laterIncidentCouldHaveCorruptedThisItem === false
  ) {
    fail('E9', 'the original item is recorded CLEAN; a clean result is never recoverable');
  }

  // E10 - the same occupant still holds the slot in the ledger revision.
  const slot = liveItem?.selectionIndex;
  const forSlot = input.ledgerEntries.filter((e) => e.selectionIndex === slot);
  const occupantHolds =
    liveItem?.kind === 'PRIMARY'
      ? forSlot.length === 0
      : liveItem?.kind === 'REPLACEMENT' &&
        forSlot.length > 0 &&
        forSlot.at(-1)!.generation2ReserveRankPosition === liveItem.generation2ReserveRankPosition;
  if (!occupantHolds) {
    fail('E10', 'a later ledger entry replaced the original occupant of the slot');
  }

  // E11 - the item is unadjudicated and its window is the open, last window.
  if (!window.isOpenLastWindow || input.priorAdjudicatedWorkItemIds.includes(target.workItemId)) {
    fail('E11', 'the item is already adjudicated or its window is not the open last window');
  }

  // E12 - one recovery per incident.
  if (input.existingRecoveryIncidents.some((existing) => same(existing, target))) {
    fail('E12', 'a recovery authority, result or acceptance already exists for this incident');
  }

  // E13 - the approved amendment is present and pinned.
  if (!isApprovedHostRecoveryAmendment(input.approvedAmendment)) {
    fail('E13', 'the approved host-confounded amendment is absent or not its pinned bytes');
  }

  // E14 - the target is fixed by committed evidence, and nothing about it is adapted.
  let fixedTarget: FixedRecoveryTarget | null = null;
  if (authority !== null && liveItem !== undefined && authorisedItem !== undefined) {
    const candidate = {
      windowOrdinal: window.windowOrdinal,
      workItemId: liveItem.workItemId,
      kind: liveItem.kind,
      selectionIndex: liveItem.selectionIndex,
      generation2ReserveRankPosition: liveItem.generation2ReserveRankPosition,
      split: liveItem.split,
      identityDigest: liveItem.identityDigest,
      originalRunRefSha256: target.originalRunRefSha256,
      rootAuthorityCount: authorisedItem.rootAuthorityCount,
      fetchPolicyVersion: liveItem.fetchPolicyVersion,
      ruleVersion: liveItem.ruleVersion,
      executionPath: authority.executionPath,
    };
    const identityFields = [
      'workItemId',
      'kind',
      'selectionIndex',
      'generation2ReserveRankPosition',
      'split',
      'identityDigest',
    ] as const;
    if (
      identityFields.every((field) => same(authorisedItem[field], candidate[field])) &&
      typeof candidate.workItemId === 'string' &&
      (candidate.kind === 'REPLACEMENT' || candidate.kind === 'PRIMARY') &&
      typeof candidate.identityDigest === 'string' &&
      HEX64.test(candidate.identityDigest) &&
      Number.isInteger(candidate.rootAuthorityCount) &&
      candidate.fetchPolicyVersion === authority.requiredFetchPolicy &&
      candidate.ruleVersion === authority.requiredRuleVersion &&
      typeof candidate.executionPath === 'string' &&
      (input.rederivedIdentityDigest === undefined ||
        input.rederivedIdentityDigest === candidate.identityDigest)
    ) {
      fixedTarget = candidate as FixedRecoveryTarget;
    }
  }
  if (
    fixedTarget === null ||
    (input.declaredTarget !== undefined &&
      !(
        isObject(input.declaredTarget) &&
        same(Object.keys(input.declaredTarget).sort(), [...FIXED_RECOVERY_TARGET_FIELDS].sort()) &&
        same(input.declaredTarget, fixedTarget)
      ))
  ) {
    fail('E14', 'the recovery target is not exactly the target fixed by committed evidence');
  }

  const refusals = HOST_RECOVERY_ELIGIBILITY_CONDITIONS.filter(([id]) => failed.has(id)).map(
    ([id, code]) => ({ id, code, detail: failed.get(id)! }),
  );
  return {
    eligible: refusals.length === 0,
    refusals,
    fixedTarget,
    defectClass: failureClass?.defectClass ?? null,
  };
}

/** The refusal code of a failed condition (for callers that throw on the first). */
export const eligibilityRefusalCode = (id: HostRecoveryEligibilityConditionId) => CODE[id];

/** A 40-hex commit. */
export const isCommit = (value: unknown): boolean => typeof value === 'string' && HEX40.test(value);
