/**
 * THE GENERATION-2 OPERATOR-KIT HOST SEMANTICS (UQ4): how future
 * targeted-host-recovery tooling turns host observations into the frozen P8
 * input and into a SEPARATE host/vantage-integrity result. PURE.
 *
 * WHY THIS EXISTS
 *
 *   An earlier, gitignored operator kit made two host-semantics mistakes the
 *   owner ruled on:
 *
 *     A. it computed the frozen P8 input as "the whole host check was not
 *        GREEN, or a sleep event occurred", so a resolver / vantage failure
 *        with ZERO sleep events became P8;
 *     B. it emitted a literal "host check GREEN again after the stop" boolean
 *        with no saved observation behind it.
 *
 *   That kit is incident evidence and stays untouched. This module is the
 *   version-controlled replacement every future recovery tool must use.
 *
 * THE THREE RULES
 *
 *   1. FROZEN P8 IS SLEEP/WAKE OR A PACING-CLOCK ANOMALY, AND NOTHING ELSE.
 *      `deriveFrozenP8HostStateAnomaly` takes a `FrozenP8Evidence` whose type
 *      has nowhere to put a resolver, route, IPv4, DNS64/NAT64, lid, power,
 *      concurrency or monitor-coverage fact: those cannot reach P8 even by
 *      mistake. The frozen gate itself is not touched; this prepares its input.
 *
 *   2. HOST/VANTAGE INTEGRITY IS ITS OWN CHANNEL. `deriveHostVantageIntegrity`
 *      grades every channel independently (route, native IPv4, resolver,
 *      control names, DNS64/NAT64, lid, power, sleep log, pacing) and never
 *      writes the P8 input. A RED channel is a host-integrity finding, not P8.
 *
 *   3. NO HOST-HEALTH CLAIM WITHOUT A PERSISTED OBSERVATION. Every verdict is
 *      derived from a persisted observation carrying its kind, timestamp,
 *      measurement inputs and structured outcome. A record's summaries are
 *      built only by `buildHostObservationRecord` and are re-derived by
 *      `replayHostObservationRecord`, which refuses any difference, any
 *      missing observation and any key it does not know (so no free-standing
 *      "green again" boolean can ride along). A later host-health claim
 *      (`validateHostHealthClaim`) must name the exact bytes of a persisted
 *      record whose every observation postdates the event it speaks about.
 *
 * GENERIC BY CONSTRUCTION: no window, slot, work item, run reference or
 * institution appears here. Nothing here measures anything: a future tool
 * measures, persists, and then hands the persisted bytes to this module.
 *
 * No filesystem, no database, no network, no clock. Authorises nothing.
 */

import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import { refuse } from '../generation2Acquisition/operationalContract.js';
import type { RECOVERY_INVOCATION_DISPOSITIONS } from './hostRecoveryContract.js';
import {
  HOST_RECOVERY_CONTROL_NAMES_V1,
  HOST_RECOVERY_VANTAGE_PROOF_NAME,
  OPERATOR_KIT_FROZEN_P8_INPUT_SEMANTICS,
  RECOVERY_GATE_READOUT_RULE,
} from './hostRecoveryContract.js';
import { recoveryInvocationDisposition } from './hostRecoveryProvenance.js';

// ---------------------------------------------------------------------------
// Versions, kinds and refusals.
// ---------------------------------------------------------------------------

export const OPERATOR_KIT_HOST_SEMANTICS_VERSION = 'GENERATION2_OPERATOR_KIT_HOST_SEMANTICS_V1';
export const HOST_OBSERVATION_RECORD_KIND = 'GENERATION2_HOST_OBSERVATION_RECORD';

export const OPERATOR_KIT_HOST_SEMANTICS_REFUSALS = [
  /** An observation, record or claim is not the exact persisted shape. */
  'OPERATOR_KIT_HOST_OBSERVATION_SHAPE',
  /** A stored verdict or summary differs from what its observations re-derive. */
  'OPERATOR_KIT_HOST_OBSERVATION_REPLAY_MISMATCH',
  /** A host-health claim names no persisted observation, or not its exact bytes. */
  'OPERATOR_KIT_HOST_HEALTH_CLAIM_WITHOUT_OBSERVATION',
  /** A host-health claim asserts more than its persisted observation supports. */
  'OPERATOR_KIT_HOST_HEALTH_CLAIM_NOT_SUPPORTED',
  /** The recovery readout disagrees with the frozen P8 input it was given. */
  'OPERATOR_KIT_RECOVERY_READOUT_INCONSISTENT',
] as const;
export type OperatorKitHostSemanticsRefusal = (typeof OPERATOR_KIT_HOST_SEMANTICS_REFUSALS)[number];

/** Every independently graded host/vantage channel. */
export const HOST_OBSERVATION_KINDS = [
  'IPV4_ROUTE',
  'NATIVE_IPV4',
  'RESOLVER_HEALTH',
  'CONTROL_NAME_RESOLUTION',
  'DNS64_NAT64',
  'LID_STATE',
  'POWER_STATE',
  'SLEEP_WAKE',
  'PACING_CLOCK',
] as const;
export type HostObservationKind = (typeof HOST_OBSERVATION_KINDS)[number];

/** The ONLY kinds that may feed the frozen P8 input. */
export const FROZEN_P8_OBSERVATION_KINDS = ['SLEEP_WAKE', 'PACING_CLOCK'] as const;

/** When the observations were taken, relative to the operator's invocation. */
export const HOST_OBSERVATION_PHASES = [
  'PRECONDITION_PROBE',
  'T0_BEFORE_EXECUTE',
  'POST_INVOCATION',
  'AFTER_STOP',
] as const;
export type HostObservationPhase = (typeof HOST_OBSERVATION_PHASES)[number];

export type ObservationVerdict = 'GREEN' | 'RED';

/** The pmset event kinds the frozen sleep-detection method counts. */
export const QUALIFYING_SLEEP_WAKE_EVENT_KINDS = ['Sleep', 'Wake', 'DarkWake'] as const;

/**
 * Largest |wall-clock elapsed - monotonic elapsed| over one paced interval
 * that is still "consistent with the pacing clock". An UNCALIBRATED,
 * version-bound mechanical bound of this semantics version, not a
 * measurement: changing it is a new semantics version.
 */
export const PACING_CLOCK_TOLERANCE_MS = 5_000;

/** The IPv4 range a CLAT (464XLAT) interface address comes from: not native IPv4. */
const CLAT_IPV4_PREFIX = '192.0.0.';
const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const IPV6 = /^[0-9a-fA-F:.]+$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const HEX64 = /^[0-9a-f]{64}$/;

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const fail = (code: OperatorKitHostSemanticsRefusal, message: string): never =>
  refuse(code, message);
const shape = (message: string): never => fail('OPERATOR_KIT_HOST_OBSERVATION_SHAPE', message);
const same = (a: unknown, b: unknown): boolean => {
  try {
    return canonicalStringify(a) === canonicalStringify(b);
  } catch {
    return false;
  }
};
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

function exactKeys(value: unknown, keys: readonly string[], what: string): Json {
  if (!isObject(value)) return shape(`${what} is not an object`);
  const actual = Object.keys(value).sort();
  if (!same(actual, [...keys].sort())) {
    shape(
      `${what} keys are [${actual.join(', ')}], expected exactly [${[...keys].sort().join(', ')}]`,
    );
  }
  return value;
}
function instant(value: unknown, what: string): number {
  const ms = typeof value === 'string' && UTC.test(value) ? Date.parse(value) : Number.NaN;
  if (Number.isNaN(ms)) shape(`${what} is not a UTC instant`);
  return ms;
}
const bool = (value: unknown, what: string): boolean =>
  typeof value === 'boolean' ? value : shape(`${what} is not a boolean`);
const nullableString = (value: unknown, what: string): string | null =>
  value === null || typeof value === 'string' ? value : shape(`${what} is not a string or null`);
function stringArray(value: unknown, what: string): readonly string[] {
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
    shape(`${what} is not a string array`);
  }
  return value as string[];
}
const finiteNumber = (value: unknown, what: string): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : shape(`${what} is not a number`);

// ---------------------------------------------------------------------------
// The persisted observation.
// ---------------------------------------------------------------------------

/**
 * One persisted host observation: WHAT was measured, WHEN, with WHICH inputs,
 * WHAT came back, and the verdict this module derives from exactly that.
 */
export interface HostObservation {
  readonly kind: HostObservationKind;
  readonly recordedAtUtc: string;
  readonly measurement: Json;
  readonly outcome: Json;
  readonly verdict: ObservationVerdict;
}
const OBSERVATION_KEYS = ['kind', 'measurement', 'outcome', 'recordedAtUtc', 'verdict'] as const;

/** The host-safety requirements a record is graded against (from the governing authority). */
export interface HostVantageRequirements {
  readonly doNotStartAtOrBelowBatteryPercent: number;
  readonly lidOpenRequired: boolean;
  readonly noDns64Required: boolean;
}
const REQUIREMENT_KEYS = [
  'doNotStartAtOrBelowBatteryPercent',
  'lidOpenRequired',
  'noDns64Required',
] as const;

function requirementsOf(value: unknown): HostVantageRequirements {
  const r = exactKeys(value, REQUIREMENT_KEYS, 'requirements');
  return {
    doNotStartAtOrBelowBatteryPercent: finiteNumber(
      r.doNotStartAtOrBelowBatteryPercent,
      'requirements.doNotStartAtOrBelowBatteryPercent',
    ),
    lidOpenRequired: bool(r.lidOpenRequired, 'requirements.lidOpenRequired'),
    noDns64Required: bool(r.noDns64Required, 'requirements.noDns64Required'),
  };
}

const green = (ok: boolean): ObservationVerdict => (ok ? 'GREEN' : 'RED');

/** Qualifying sleep/wake events inside the observed span, by the frozen method. */
function qualifyingSleepWakeEvents(measurement: Json, outcome: Json): number {
  const since = instant(measurement.sinceUtc, 'SLEEP_WAKE.measurement.sinceUtc');
  const until = instant(measurement.untilUtc, 'SLEEP_WAKE.measurement.untilUtc');
  if (until < since) shape('SLEEP_WAKE span ends before it starts');
  if (!Array.isArray(outcome.events)) return shape('SLEEP_WAKE.outcome.events is not an array');
  return outcome.events.filter((event, k) => {
    const e = exactKeys(event, ['atUtc', 'kind'], `SLEEP_WAKE event ${String(k)}`);
    if (typeof e.kind !== 'string') shape(`SLEEP_WAKE event ${String(k)} kind is not a string`);
    const at = instant(e.atUtc, `SLEEP_WAKE event ${String(k)}.atUtc`);
    return (
      (QUALIFYING_SLEEP_WAKE_EVENT_KINDS as readonly unknown[]).includes(e.kind) &&
      at >= since &&
      at <= until
    );
  }).length;
}

/** True when the paced interval's wall-clock and monotonic elapsed times disagree. */
function pacingClockAnomalous(measurement: Json, outcome: Json): boolean {
  const start = instant(measurement.intervalStartUtc, 'PACING_CLOCK.measurement.intervalStartUtc');
  const end = instant(measurement.intervalEndUtc, 'PACING_CLOCK.measurement.intervalEndUtc');
  if (measurement.toleranceMs !== PACING_CLOCK_TOLERANCE_MS) {
    shape(
      `PACING_CLOCK tolerance is not the version-bound ${String(PACING_CLOCK_TOLERANCE_MS)} ms`,
    );
  }
  const wall = finiteNumber(outcome.wallElapsedMs, 'PACING_CLOCK.outcome.wallElapsedMs');
  const mono = finiteNumber(outcome.monotonicElapsedMs, 'PACING_CLOCK.outcome.monotonicElapsedMs');
  if (end < start || wall !== end - start || mono < 0) {
    shape(
      'PACING_CLOCK wall-clock elapsed is not its own interval, or monotonic elapsed is negative',
    );
  }
  return Math.abs(wall - mono) > PACING_CLOCK_TOLERANCE_MS;
}

/** The measurement-input and outcome keys each kind persists, exactly. */
const KIND_SHAPES: Record<HostObservationKind, { measurement: string[]; outcome: string[] }> = {
  IPV4_ROUTE: { measurement: ['family'], outcome: ['defaultInterface'] },
  NATIVE_IPV4: { measurement: ['interface'], outcome: ['ipv4Address'] },
  RESOLVER_HEALTH: { measurement: ['resolver'], outcome: ['error', 'serversReachable'] },
  CONTROL_NAME_RESOLUTION: { measurement: ['names', 'resolver'], outcome: ['answers'] },
  DNS64_NAT64: {
    measurement: ['name', 'resolver'],
    outcome: ['aRecords', 'aaaaRecords', 'error', 'queryCompleted'],
  },
  LID_STATE: { measurement: ['source'], outcome: ['clamshellClosed'] },
  POWER_STATE: { measurement: ['source'], outcome: ['batteryPercent', 'powerSource'] },
  SLEEP_WAKE: {
    measurement: ['sinceUtc', 'source', 'untilUtc'],
    outcome: ['events', 'logAvailable'],
  },
  PACING_CLOCK: {
    measurement: ['intervalEndUtc', 'intervalStartUtc', 'toleranceMs'],
    outcome: ['monotonicElapsedMs', 'wallElapsedMs'],
  },
};

/**
 * The verdict ONE persisted observation supports, from its measurement and
 * outcome only. Its own stored `verdict` is never read here.
 */
export function deriveObservationVerdict(
  observation: unknown,
  requirements: HostVantageRequirements,
): ObservationVerdict {
  const o = exactKeys(observation, OBSERVATION_KEYS, 'observation');
  const kind = o.kind as HostObservationKind;
  if (!(HOST_OBSERVATION_KINDS as readonly unknown[]).includes(kind)) {
    shape(`observation kind ${String(o.kind)} is not a known host observation kind`);
  }
  instant(o.recordedAtUtc, `${kind}.recordedAtUtc`);
  const m = exactKeys(o.measurement, KIND_SHAPES[kind].measurement, `${kind}.measurement`);
  const out = exactKeys(o.outcome, KIND_SHAPES[kind].outcome, `${kind}.outcome`);
  switch (kind) {
    case 'IPV4_ROUTE': {
      if (m.family !== 'inet') shape('IPV4_ROUTE measures the inet family');
      const iface = nullableString(out.defaultInterface, 'IPV4_ROUTE.outcome.defaultInterface');
      return green(iface !== null && iface.length > 0);
    }
    case 'NATIVE_IPV4': {
      nullableString(m.interface, 'NATIVE_IPV4.measurement.interface');
      const address = nullableString(out.ipv4Address, 'NATIVE_IPV4.outcome.ipv4Address');
      return green(address !== null && IPV4.test(address) && !address.startsWith(CLAT_IPV4_PREFIX));
    }
    case 'RESOLVER_HEALTH': {
      if (m.resolver !== 'system') shape('RESOLVER_HEALTH measures the system resolver');
      const reachable = bool(out.serversReachable, 'RESOLVER_HEALTH.outcome.serversReachable');
      const error = nullableString(out.error, 'RESOLVER_HEALTH.outcome.error');
      return green(reachable && error === null);
    }
    case 'CONTROL_NAME_RESOLUTION': {
      if (m.resolver !== 'system') shape('CONTROL_NAME_RESOLUTION uses the system resolver');
      if (!same(m.names, [...HOST_RECOVERY_CONTROL_NAMES_V1])) {
        shape('CONTROL_NAME_RESOLUTION resolves exactly the committed control names');
      }
      if (
        !Array.isArray(out.answers) ||
        out.answers.length !== HOST_RECOVERY_CONTROL_NAMES_V1.length
      ) {
        return shape('CONTROL_NAME_RESOLUTION carries one answer per control name');
      }
      return green(
        out.answers.every((answer, k) => {
          const a = exactKeys(answer, ['aRecords', 'error', 'name'], `control answer ${String(k)}`);
          if (a.name !== HOST_RECOVERY_CONTROL_NAMES_V1[k]) {
            shape(`control answer ${String(k)} is not for ${HOST_RECOVERY_CONTROL_NAMES_V1[k]!}`);
          }
          const records = stringArray(a.aRecords, `control answer ${String(k)}.aRecords`);
          const error = nullableString(a.error, `control answer ${String(k)}.error`);
          return error === null && records.length > 0 && records.every((r) => IPV4.test(r));
        }),
      );
    }
    case 'DNS64_NAT64': {
      if (m.name !== HOST_RECOVERY_VANTAGE_PROOF_NAME || m.resolver !== 'system') {
        shape(
          `DNS64_NAT64 queries ${HOST_RECOVERY_VANTAGE_PROOF_NAME} through the system resolver`,
        );
      }
      const completed = bool(out.queryCompleted, 'DNS64_NAT64.outcome.queryCompleted');
      const error = nullableString(out.error, 'DNS64_NAT64.outcome.error');
      const a = stringArray(out.aRecords, 'DNS64_NAT64.outcome.aRecords');
      const aaaa = stringArray(out.aaaaRecords, 'DNS64_NAT64.outcome.aaaaRecords');
      if (!a.every((r) => IPV4.test(r)) || !aaaa.every((r) => IPV6.test(r))) {
        // A resolver error string is never an answer record (the defect the
        // earlier kit had: "no servers could be reached" read as an AAAA).
        shape('DNS64_NAT64 answer records must be addresses, never error text');
      }
      // A query that did not complete is NOT an empty AAAA answer: no proof.
      return green(
        completed &&
          error === null &&
          a.length > 0 &&
          (!requirements.noDns64Required || aaaa.length === 0),
      );
    }
    case 'LID_STATE': {
      const closed = out.clamshellClosed;
      if (closed !== null && typeof closed !== 'boolean') {
        shape('LID_STATE.outcome.clamshellClosed is not a boolean or null');
      }
      return green(closed !== null && (!requirements.lidOpenRequired || closed === false));
    }
    case 'POWER_STATE': {
      const percent = out.batteryPercent;
      if (percent !== null && (typeof percent !== 'number' || !Number.isFinite(percent))) {
        shape('POWER_STATE.outcome.batteryPercent is not a number or null');
      }
      nullableString(out.powerSource, 'POWER_STATE.outcome.powerSource');
      return green(
        typeof percent === 'number' && percent > requirements.doNotStartAtOrBelowBatteryPercent,
      );
    }
    case 'SLEEP_WAKE': {
      // An unreadable sleep log fails CLOSED here (host integrity) and is
      // never itself a sleep event (P8): the frozen method says "fail closed
      // if unreadable", not "assume a sleep".
      const available = bool(out.logAvailable, 'SLEEP_WAKE.outcome.logAvailable');
      const events = qualifyingSleepWakeEvents(m, out);
      if (!available && events > 0) shape('an unavailable sleep log cannot carry events');
      return green(available && events === 0);
    }
    case 'PACING_CLOCK':
      return green(!pacingClockAnomalous(m, out));
  }
}

// ---------------------------------------------------------------------------
// Rule 1: the frozen P8 input.
// ---------------------------------------------------------------------------

/**
 * The ONLY evidence the frozen P8 input may be derived from. There is
 * deliberately no field for a resolver, route, IPv4, DNS64/NAT64, lid, power,
 * host-check, acquisition-error, concurrency or monitor-coverage fact.
 */
export interface FrozenP8Evidence {
  readonly sleepWake: readonly HostObservation[];
  readonly pacingClock: readonly HostObservation[];
}

export type FrozenP8Ground = 'QUALIFYING_SLEEP_WAKE_EVENT' | 'PACING_CLOCK_ANOMALY';

export interface FrozenP8Derivation {
  readonly semantics: typeof OPERATOR_KIT_FROZEN_P8_INPUT_SEMANTICS;
  readonly hostStateAnomaly: boolean;
  readonly grounds: readonly FrozenP8Ground[];
}

export function deriveFrozenP8HostStateAnomaly(evidence: FrozenP8Evidence): FrozenP8Derivation {
  const grounds: FrozenP8Ground[] = [];
  const sleeps = evidence.sleepWake.some((observation) => {
    const o = exactKeys(observation, OBSERVATION_KEYS, 'sleep/wake observation');
    if (o.kind !== 'SLEEP_WAKE')
      shape('a frozen-P8 sleep/wake input is not a SLEEP_WAKE observation');
    return (
      qualifyingSleepWakeEvents(
        exactKeys(o.measurement, KIND_SHAPES.SLEEP_WAKE.measurement, 'SLEEP_WAKE.measurement'),
        exactKeys(o.outcome, KIND_SHAPES.SLEEP_WAKE.outcome, 'SLEEP_WAKE.outcome'),
      ) > 0
    );
  });
  if (sleeps) grounds.push('QUALIFYING_SLEEP_WAKE_EVENT');
  const pacing = evidence.pacingClock.some((observation) => {
    const o = exactKeys(observation, OBSERVATION_KEYS, 'pacing observation');
    if (o.kind !== 'PACING_CLOCK')
      shape('a frozen-P8 pacing input is not a PACING_CLOCK observation');
    return pacingClockAnomalous(
      exactKeys(o.measurement, KIND_SHAPES.PACING_CLOCK.measurement, 'PACING_CLOCK.measurement'),
      exactKeys(o.outcome, KIND_SHAPES.PACING_CLOCK.outcome, 'PACING_CLOCK.outcome'),
    );
  });
  if (pacing) grounds.push('PACING_CLOCK_ANOMALY');
  return {
    semantics: OPERATOR_KIT_FROZEN_P8_INPUT_SEMANTICS,
    hostStateAnomaly: grounds.length > 0,
    grounds,
  };
}

/** Selects the frozen-P8 kinds out of a full observation list; every other kind is dropped. */
export function frozenP8EvidenceOf(observations: readonly HostObservation[]): FrozenP8Evidence {
  return {
    sleepWake: observations.filter((o) => o.kind === 'SLEEP_WAKE'),
    pacingClock: observations.filter((o) => o.kind === 'PACING_CLOCK'),
  };
}

// ---------------------------------------------------------------------------
// Rule 2: host/vantage integrity, separately.
// ---------------------------------------------------------------------------

export type HostVantageIntegrityVerdict =
  'HOST_VANTAGE_INTEGRITY_GREEN' | 'HOST_VANTAGE_INTEGRITY_NOT_PROVED';

export interface HostVantageIntegrity {
  readonly verdict: HostVantageIntegrityVerdict;
  /** Each channel's verdict; a channel with several observations is RED if any is. */
  readonly channels: Readonly<Record<HostObservationKind, ObservationVerdict | 'MISSING'>>;
  readonly failedChannels: readonly HostObservationKind[];
  readonly missingChannels: readonly HostObservationKind[];
}

export function deriveHostVantageIntegrity(
  observations: readonly HostObservation[],
  requirements: HostVantageRequirements,
): HostVantageIntegrity {
  const channels = {} as Record<HostObservationKind, ObservationVerdict | 'MISSING'>;
  for (const kind of HOST_OBSERVATION_KINDS) {
    const ofKind = observations.filter((o) => isObject(o) && o.kind === kind);
    channels[kind] =
      ofKind.length === 0
        ? 'MISSING'
        : ofKind.every((o) => deriveObservationVerdict(o, requirements) === 'GREEN')
          ? 'GREEN'
          : 'RED';
  }
  for (const o of observations) deriveObservationVerdict(o, requirements); // unknown kinds refuse
  const failedChannels = HOST_OBSERVATION_KINDS.filter((k) => channels[k] === 'RED');
  const missingChannels = HOST_OBSERVATION_KINDS.filter((k) => channels[k] === 'MISSING');
  return {
    verdict:
      failedChannels.length === 0 && missingChannels.length === 0
        ? 'HOST_VANTAGE_INTEGRITY_GREEN'
        : 'HOST_VANTAGE_INTEGRITY_NOT_PROVED',
    channels,
    failedChannels,
    missingChannels,
  };
}

// ---------------------------------------------------------------------------
// Rule 3: the persisted record, its only builder, and its replay.
// ---------------------------------------------------------------------------

export interface HostObservationSummary {
  readonly frozenP8: FrozenP8Derivation;
  readonly hostVantageIntegrity: HostVantageIntegrity;
}

export interface HostObservationRecord {
  readonly recordKind: typeof HOST_OBSERVATION_RECORD_KIND;
  readonly semanticsVersion: typeof OPERATOR_KIT_HOST_SEMANTICS_VERSION;
  readonly observedFor: HostObservationPhase;
  readonly requirements: HostVantageRequirements;
  readonly observations: readonly HostObservation[];
  readonly summary: HostObservationSummary;
}
const RECORD_KEYS = [
  'observations',
  'observedFor',
  'recordKind',
  'requirements',
  'semanticsVersion',
  'summary',
] as const;

/** The observation's verdict, filled in mechanically; a caller never supplies one. */
export function sealObservation(
  observation: Omit<HostObservation, 'verdict'>,
  requirements: HostVantageRequirements,
): HostObservation {
  const unsealed = { ...observation, verdict: 'RED' as ObservationVerdict };
  return { ...observation, verdict: deriveObservationVerdict(unsealed, requirements) };
}

function summarise(
  observations: readonly HostObservation[],
  requirements: HostVantageRequirements,
): HostObservationSummary {
  return {
    frozenP8: deriveFrozenP8HostStateAnomaly(frozenP8EvidenceOf(observations)),
    hostVantageIntegrity: deriveHostVantageIntegrity(observations, requirements),
  };
}

/** The ONLY way a summary comes to exist: derived from the observations it sits beside. */
export function buildHostObservationRecord(input: {
  readonly observedFor: HostObservationPhase;
  readonly requirements: HostVantageRequirements;
  readonly observations: readonly Omit<HostObservation, 'verdict'>[];
}): HostObservationRecord {
  const requirements = requirementsOf(input.requirements);
  if (input.observations.length === 0) {
    fail('OPERATOR_KIT_HOST_HEALTH_CLAIM_WITHOUT_OBSERVATION', 'a record needs observations');
  }
  const observations = input.observations.map((o) => sealObservation(o, requirements));
  return {
    recordKind: HOST_OBSERVATION_RECORD_KIND,
    semanticsVersion: OPERATOR_KIT_HOST_SEMANTICS_VERSION,
    observedFor: input.observedFor,
    requirements,
    observations,
    summary: summarise(observations, requirements),
  };
}

/** Persisted bytes for a record (canonical, so replay and hashing are deterministic). */
export const serialiseHostObservationRecord = (record: HostObservationRecord): string =>
  `${canonicalStringify(record)}\n`;

/**
 * Re-derives every observation verdict and both summaries from the persisted
 * record and refuses ANY difference. Unknown keys refuse too, so a stored
 * free-standing health boolean cannot pass. Optionally pins the requirements
 * to the governing authority's.
 */
export function replayHostObservationRecord(
  persisted: unknown,
  expectedRequirements?: HostVantageRequirements,
): HostObservationRecord {
  const r = exactKeys(persisted, RECORD_KEYS, 'host observation record');
  if (
    r.recordKind !== HOST_OBSERVATION_RECORD_KIND ||
    r.semanticsVersion !== OPERATOR_KIT_HOST_SEMANTICS_VERSION ||
    !(HOST_OBSERVATION_PHASES as readonly unknown[]).includes(r.observedFor)
  ) {
    shape('not a host observation record of this semantics version');
  }
  const requirements = requirementsOf(r.requirements);
  if (expectedRequirements !== undefined && !same(requirements, expectedRequirements)) {
    fail(
      'OPERATOR_KIT_HOST_OBSERVATION_REPLAY_MISMATCH',
      'the record was graded against other host-safety requirements',
    );
  }
  if (!Array.isArray(r.observations) || r.observations.length === 0) {
    return fail(
      'OPERATOR_KIT_HOST_HEALTH_CLAIM_WITHOUT_OBSERVATION',
      'a host-health summary exists without any persisted observation',
    );
  }
  const observations = r.observations as HostObservation[];
  observations.forEach((o, k) => {
    const derived = deriveObservationVerdict(o, requirements);
    if (o.verdict !== derived) {
      fail(
        'OPERATOR_KIT_HOST_OBSERVATION_REPLAY_MISMATCH',
        `observation ${String(k)} (${o.kind}) stores ${String(o.verdict)} but its measurement supports ${derived}`,
      );
    }
  });
  const summary = summarise(observations, requirements);
  if (!same(r.summary, summary)) {
    fail(
      'OPERATOR_KIT_HOST_OBSERVATION_REPLAY_MISMATCH',
      'the stored summary is not the one its persisted observations re-derive',
    );
  }
  return r as unknown as HostObservationRecord;
}

// ---------------------------------------------------------------------------
// A later host-health claim must name persisted bytes (replaces the literal
// "green again after the stop" boolean).
// ---------------------------------------------------------------------------

export const HOST_HEALTH_CLAIM_KIND = 'HOST_VANTAGE_INTEGRITY_AFTER_EVENT';

export interface HostHealthClaim {
  readonly claimKind: typeof HOST_HEALTH_CLAIM_KIND;
  /** The event the claim speaks about (e.g. a stop); every observation must postdate it. */
  readonly afterUtc: string;
  readonly observationRecord: {
    readonly path: string;
    readonly sha256: string;
    readonly bytes: number;
  };
  readonly verdict: HostVantageIntegrityVerdict;
}

/** Builds a claim from persisted bytes; there is no other constructor. */
export function hostHealthClaimFrom(input: {
  readonly afterUtc: string;
  readonly path: string;
  readonly persistedText: string;
  readonly requirements: HostVantageRequirements;
}): HostHealthClaim {
  const record = replayHostObservationRecord(
    JSON.parse(input.persistedText) as unknown,
    input.requirements,
  );
  return {
    claimKind: HOST_HEALTH_CLAIM_KIND,
    afterUtc: input.afterUtc,
    observationRecord: {
      path: input.path,
      sha256: sha256(input.persistedText),
      bytes: Buffer.byteLength(input.persistedText, 'utf8'),
    },
    verdict: record.summary.hostVantageIntegrity.verdict,
  };
}

/**
 * Validates a claim against the persisted observation bytes it names: the
 * bytes hash to the claim, the record replays, every observation postdates
 * `afterUtc`, and the claimed verdict is exactly the replayed one.
 */
export function validateHostHealthClaim(
  claim: unknown,
  persisted: { readonly path: string; readonly text: string } | null,
  requirements: HostVantageRequirements,
): HostVantageIntegrityVerdict {
  const c = exactKeys(claim, ['afterUtc', 'claimKind', 'observationRecord', 'verdict'], 'claim');
  if (c.claimKind !== HOST_HEALTH_CLAIM_KIND) shape('not a host-health claim');
  const after = instant(c.afterUtc, 'claim.afterUtc');
  const ref = exactKeys(
    c.observationRecord,
    ['bytes', 'path', 'sha256'],
    'claim.observationRecord',
  );
  if (
    persisted === null ||
    typeof ref.sha256 !== 'string' ||
    !HEX64.test(ref.sha256) ||
    ref.path !== persisted.path ||
    ref.sha256 !== sha256(persisted.text) ||
    ref.bytes !== Buffer.byteLength(persisted.text, 'utf8')
  ) {
    return fail(
      'OPERATOR_KIT_HOST_HEALTH_CLAIM_WITHOUT_OBSERVATION',
      'the host-health claim does not name the exact bytes of a persisted observation record',
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(persisted.text);
  } catch {
    return shape('the persisted observation record is not JSON');
  }
  const record = replayHostObservationRecord(parsed, requirements);
  if (
    !record.observations.every((o) => instant(o.recordedAtUtc, 'observation.recordedAtUtc') > after)
  ) {
    fail(
      'OPERATOR_KIT_HOST_HEALTH_CLAIM_NOT_SUPPORTED',
      'an observation behind the claim does not postdate the event the claim speaks about',
    );
  }
  if (c.verdict !== record.summary.hostVantageIntegrity.verdict) {
    fail(
      'OPERATOR_KIT_HOST_HEALTH_CLAIM_NOT_SUPPORTED',
      `the claim says ${String(c.verdict)}; its observations support ${record.summary.hostVantageIntegrity.verdict}`,
    );
  }
  return record.summary.hostVantageIntegrity.verdict;
}

// ---------------------------------------------------------------------------
// UQ1: the recovery's local P1-P8 readout is evidence only.
// ---------------------------------------------------------------------------

/**
 * The recovery-local readout: the frozen gate's fired condition NAMES and
 * decision over the recovery's own observation, plus the two host channels,
 * side by side and never merged. It carries no window denominator or window
 * counter, and nothing here reads or writes an original window's counts.
 */
export function buildRecoveryLocalGateReadout(input: {
  readonly frozenGate: {
    readonly triggeredConditions: readonly { readonly condition: string }[];
    readonly decision: string;
  };
  readonly hostObservations: HostObservationRecord;
}) {
  const record = replayHostObservationRecord(input.hostObservations);
  const firedConditions = input.frozenGate.triggeredConditions.map((t) => t.condition);
  if (firedConditions.includes('P8') !== record.summary.frozenP8.hostStateAnomaly) {
    fail(
      'OPERATOR_KIT_RECOVERY_READOUT_INCONSISTENT',
      'the frozen gate fired P8 differently from the frozen P8 input its observations derive',
    );
  }
  return {
    ...RECOVERY_GATE_READOUT_RULE,
    firedConditions,
    decision: input.frozenGate.decision,
    frozenP8HostStateAnomaly: record.summary.frozenP8.hostStateAnomaly,
    hostVantageIntegrityVerdict: record.summary.hostVantageIntegrity.verdict,
  };
}

// ---------------------------------------------------------------------------
// UQ5: the T-0 invocation boundary.
// ---------------------------------------------------------------------------

export type OperatorInvocationBoundary =
  'NOT_ISSUED_T0_ABORTED' | 'NOT_ISSUED' | 'EXECUTE_ISSUED' | 'RUN_CREATED';

export interface OperatorInvocationState {
  /** The replayed T-0 observation record, or null before T-0 was observed. */
  readonly t0: HostObservationRecord | null;
  readonly cliExecuteIssued: boolean;
  readonly runCreated: boolean;
  /** Recorded for evidence; NEVER an input to whether the invocation is spent. */
  readonly institutionRequestCount: number;
}

/**
 * Unspent ONLY when no CLI execute was issued AND no run row exists; zero
 * institution requests never restore a spent invocation.
 */
export function deriveOperatorInvocationBoundary(state: OperatorInvocationState): {
  readonly boundary: OperatorInvocationBoundary;
  readonly disposition: (typeof RECOVERY_INVOCATION_DISPOSITIONS)[keyof typeof RECOVERY_INVOCATION_DISPOSITIONS];
  readonly institutionRequestCount: number;
} {
  const issued = bool(state.cliExecuteIssued, 'cliExecuteIssued');
  const created = bool(state.runCreated, 'runCreated');
  if (!Number.isInteger(state.institutionRequestCount) || state.institutionRequestCount < 0) {
    shape('institutionRequestCount is not a non-negative integer');
  }
  const t0 = state.t0 === null ? null : replayHostObservationRecord(state.t0);
  if (t0 !== null && t0.observedFor !== 'T0_BEFORE_EXECUTE') {
    shape('the T-0 record was not observed before execute');
  }
  const disposition = recoveryInvocationDisposition({
    cliExecuteIssued: issued,
    runCreated: created,
  });
  const boundary: OperatorInvocationBoundary = created
    ? 'RUN_CREATED'
    : issued
      ? 'EXECUTE_ISSUED'
      : t0 !== null && t0.summary.hostVantageIntegrity.verdict !== 'HOST_VANTAGE_INTEGRITY_GREEN'
        ? 'NOT_ISSUED_T0_ABORTED'
        : 'NOT_ISSUED';
  return { boundary, disposition, institutionRequestCount: state.institutionRequestCount };
}
