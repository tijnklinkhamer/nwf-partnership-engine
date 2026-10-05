/**
 * Phase 2B-2D A2 Generation 2: the UQ4 operator-kit HOST-SEMANTICS repair.
 *
 *   - frozen P8 is derived ONLY from qualifying sleep/wake events or a
 *     pacing-clock anomaly; every resolver / route / IPv4 / DNS64-NAT64 /
 *     lid / power / host-check failure stays out of it;
 *   - host/vantage integrity grades each channel separately;
 *   - every summary replays from persisted observations, a differing stored
 *     summary or a free-standing health boolean is refused, and a later
 *     host-health claim must name exact persisted bytes;
 *   - UQ5: unspent only with no execute issued and no run created;
 *   - UQ1: the recovery readout is evidence only and touches no window count;
 *   - a FUTURE repair record of the committed shape passes
 *     validateOperatorKitHostSemanticsRepair, malformed ones refuse;
 *   - static: the repaired semantics carry neither historical defect.
 *
 * Synthetic observations only: no host is measured, no socket, no database,
 * no historical incident file is read.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Generation2OperationalRefusal } from '../harness/phase2b2d/generation2Acquisition/operationalContract.js';
import {
  HOST_RECOVERY_CONTROL_NAMES_V1,
  HOST_RECOVERY_RECORD_KINDS,
  OPERATOR_KIT_FROZEN_P8_INPUT_SEMANTICS,
  OPERATOR_KIT_REPAIR_REQUIRED_PROOFS,
  RECOVERY_GATE_READOUT_RULE,
  RECOVERY_INVOCATION_DISPOSITIONS,
} from '../harness/phase2b2d/generation2Recovery/hostRecoveryContract.js';
import type { PinnedCommittedRecord } from '../harness/phase2b2d/generation2Recovery/hostRecoveryEligibility.js';
import { validateOperatorKitHostSemanticsRepair } from '../harness/phase2b2d/generation2Recovery/hostRecoveryProvenance.js';
import {
  HOST_OBSERVATION_KINDS,
  PACING_CLOCK_TOLERANCE_MS,
  buildHostObservationRecord,
  buildRecoveryLocalGateReadout,
  deriveFrozenP8HostStateAnomaly,
  deriveHostVantageIntegrity,
  deriveOperatorInvocationBoundary,
  frozenP8EvidenceOf,
  hostHealthClaimFrom,
  replayHostObservationRecord,
  sealObservation,
  serialiseHostObservationRecord,
  validateHostHealthClaim,
  type HostObservation,
  type HostObservationKind,
  type HostObservationPhase,
  type HostObservationRecord,
  type HostVantageRequirements,
} from '../harness/phase2b2d/generation2Recovery/operatorKitHostSemantics.js';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Unsealed = Omit<HostObservation, 'verdict'>;
const REPO = resolve(import.meta.dirname, '../../..');
const MODULE = 'src/test/harness/phase2b2d/generation2Recovery/operatorKitHostSemantics.ts';
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const REQ: HostVantageRequirements = {
  doNotStartAtOrBelowBatteryPercent: 20,
  lidOpenRequired: true,
  noDns64Required: true,
};

const codeOf = (fn: () => unknown): string | null => {
  try {
    fn();
    return null;
  } catch (error) {
    if (error instanceof Generation2OperationalRefusal) return error.code;
    throw error;
  }
};

const T = Date.parse('2030-01-01T00:00:00Z');
const at = (minutes: number): string => new Date(T + minutes * 60_000).toISOString();

/** One GREEN observation of every kind, recorded at minute `m`. */
function greenSet(m = 10): Unsealed[] {
  const recordedAtUtc = at(m);
  return [
    {
      kind: 'IPV4_ROUTE',
      recordedAtUtc,
      measurement: { family: 'inet' },
      outcome: { defaultInterface: 'en0' },
    },
    {
      kind: 'NATIVE_IPV4',
      recordedAtUtc,
      measurement: { interface: 'en0' },
      outcome: { ipv4Address: '10.1.2.3' },
    },
    {
      kind: 'RESOLVER_HEALTH',
      recordedAtUtc,
      measurement: { resolver: 'system' },
      outcome: { serversReachable: true, error: null },
    },
    {
      kind: 'CONTROL_NAME_RESOLUTION',
      recordedAtUtc,
      measurement: { resolver: 'system', names: [...HOST_RECOVERY_CONTROL_NAMES_V1] },
      outcome: {
        answers: HOST_RECOVERY_CONTROL_NAMES_V1.map((name) => ({
          name,
          aRecords: ['93.184.215.14'],
          error: null,
        })),
      },
    },
    {
      kind: 'DNS64_NAT64',
      recordedAtUtc,
      measurement: { name: 'ipv4only.arpa', resolver: 'system' },
      outcome: {
        queryCompleted: true,
        error: null,
        aRecords: ['192.0.0.170', '192.0.0.171'],
        aaaaRecords: [],
      },
    },
    {
      kind: 'LID_STATE',
      recordedAtUtc,
      measurement: { source: 'ioreg AppleClamshellState' },
      outcome: { clamshellClosed: false },
    },
    {
      kind: 'POWER_STATE',
      recordedAtUtc,
      measurement: { source: 'pmset -g batt' },
      outcome: { batteryPercent: 100, powerSource: 'AC Power' },
    },
    {
      kind: 'SLEEP_WAKE',
      recordedAtUtc,
      measurement: { source: 'pmset -g log', sinceUtc: at(0), untilUtc: at(m) },
      outcome: { logAvailable: true, events: [{ kind: 'Sleep', atUtc: at(-30) }] },
    },
    {
      kind: 'PACING_CLOCK',
      recordedAtUtc,
      measurement: {
        intervalStartUtc: at(0),
        intervalEndUtc: at(m),
        toleranceMs: PACING_CLOCK_TOLERANCE_MS,
      },
      outcome: { wallElapsedMs: m * 60_000, monotonicElapsedMs: m * 60_000 - 40 },
    },
  ];
}

/** The green set with one kind's observation rewritten. */
function withKind(kind: HostObservationKind, edit: (o: Json) => void, m = 10): Unsealed[] {
  return greenSet(m).map((o) => {
    if (o.kind !== kind) return o;
    const copy = clone(o) as Json;
    edit(copy);
    return copy as Unsealed;
  });
}

const record = (observations: Unsealed[], observedFor: HostObservationPhase = 'POST_INVOCATION') =>
  buildHostObservationRecord({ observedFor, requirements: REQ, observations });
const p8Of = (observations: Unsealed[]) =>
  deriveFrozenP8HostStateAnomaly(
    frozenP8EvidenceOf(observations.map((o) => sealObservation(o, REQ))),
  );

// Each non-P8 failure, as a single-channel edit of an otherwise green set.
const NON_P8_FAILURES: [string, HostObservationKind, (o: Json) => void][] = [
  [
    'resolver failure',
    'RESOLVER_HEALTH',
    (o) => {
      o.outcome.serversReachable = false;
      o.outcome.error = 'connection timed out; no servers could be reached';
    },
  ],
  [
    'DNS control-probe failure',
    'CONTROL_NAME_RESOLUTION',
    (o) => {
      o.outcome.answers[1] = { name: 'example.net', aRecords: [], error: 'SERVFAIL' };
    },
  ],
  ['route failure', 'IPV4_ROUTE', (o) => void (o.outcome.defaultInterface = null)],
  ['native-IPv4 failure (CLAT)', 'NATIVE_IPV4', (o) => void (o.outcome.ipv4Address = '192.0.0.2')],
  [
    'DNS64/NAT64 failure (AAAA synthesised)',
    'DNS64_NAT64',
    (o) => void (o.outcome.aaaaRecords = ['64:ff9b::c000:aa']),
  ],
  [
    'DNS64/NAT64 proof query did not complete',
    'DNS64_NAT64',
    (o) => {
      o.outcome.queryCompleted = false;
      o.outcome.error = 'connection timed out; no servers could be reached';
      o.outcome.aRecords = [];
    },
  ],
  ['battery at the floor', 'POWER_STATE', (o) => void (o.outcome.batteryPercent = 20)],
  ['lid closed', 'LID_STATE', (o) => void (o.outcome.clamshellClosed = true)],
  ['sleep log unreadable', 'SLEEP_WAKE', (o) => void (o.outcome.logAvailable = false)],
];

// ---------------------------------------------------------------------------
// 1-8: frozen P8.
// ---------------------------------------------------------------------------

describe('frozen P8 input: sleep/wake or a pacing-clock anomaly ONLY', () => {
  it('a fully green set derives P8 false', () => {
    expect(p8Of(greenSet())).toEqual({
      semantics: OPERATOR_KIT_FROZEN_P8_INPUT_SEMANTICS,
      hostStateAnomaly: false,
      grounds: [],
    });
  });

  it.each(['Sleep', 'Wake', 'DarkWake'])('(1) a qualifying %s event derives P8 true', (kind) => {
    const set = withKind('SLEEP_WAKE', (o) => o.outcome.events.push({ kind, atUtc: at(4) }));
    expect(p8Of(set)).toMatchObject({
      hostStateAnomaly: true,
      grounds: ['QUALIFYING_SLEEP_WAKE_EVENT'],
    });
  });

  it('a sleep event outside the item span, or a non-qualifying kind, does not', () => {
    expect(p8Of(greenSet()).hostStateAnomaly).toBe(false); // the green set carries one at -30
    const other = withKind('SLEEP_WAKE', (o) =>
      o.outcome.events.push({ kind: 'Assertions', atUtc: at(4) }),
    );
    expect(p8Of(other).hostStateAnomaly).toBe(false);
  });

  it('(2) a pacing-clock anomaly beyond the tolerance derives P8 true; within it, false', () => {
    const gap = withKind('PACING_CLOCK', (o) => {
      o.outcome.monotonicElapsedMs = o.outcome.wallElapsedMs - PACING_CLOCK_TOLERANCE_MS - 1;
    });
    expect(p8Of(gap)).toMatchObject({ hostStateAnomaly: true, grounds: ['PACING_CLOCK_ANOMALY'] });
    const edge = withKind('PACING_CLOCK', (o) => {
      o.outcome.monotonicElapsedMs = o.outcome.wallElapsedMs - PACING_CLOCK_TOLERANCE_MS;
    });
    expect(p8Of(edge).hostStateAnomaly).toBe(false);
  });

  it.each(NON_P8_FAILURES)('(3-7) %s ALONE derives P8 false', (_name, kind, edit) => {
    const set = withKind(kind, edit);
    expect(
      deriveHostVantageIntegrity(
        set.map((o) => sealObservation(o, REQ)),
        REQ,
      ).verdict,
    ).toBe('HOST_VANTAGE_INTEGRITY_NOT_PROVED');
    expect(p8Of(set).hostStateAnomaly).toBe(false);
    expect(record(set).summary.frozenP8.hostStateAnomaly).toBe(false);
  });

  it('(8) a generic host/vantage RED with every non-P8 channel failing still derives P8 false', () => {
    let set = greenSet();
    for (const [, kind, edit] of NON_P8_FAILURES.filter(([, k]) => k !== 'SLEEP_WAKE')) {
      set = set.map((o) => {
        if (o.kind !== kind) return o;
        const copy = clone(o) as Json;
        edit(copy);
        return copy as Unsealed;
      });
    }
    const r = record(set);
    expect(r.summary.hostVantageIntegrity.verdict).toBe('HOST_VANTAGE_INTEGRITY_NOT_PROVED');
    expect(r.summary.frozenP8.hostStateAnomaly).toBe(false);
  });

  it('the P8 evidence type admits only SLEEP_WAKE / PACING_CLOCK observations', () => {
    const resolver = sealObservation(greenSet()[2]!, REQ);
    expect(
      codeOf(() => deriveFrozenP8HostStateAnomaly({ sleepWake: [resolver], pacingClock: [] })),
    ).toBe('OPERATOR_KIT_HOST_OBSERVATION_SHAPE');
    const selected = frozenP8EvidenceOf(greenSet().map((o) => sealObservation(o, REQ)));
    expect([...selected.sleepWake, ...selected.pacingClock].map((o) => o.kind)).toEqual([
      'SLEEP_WAKE',
      'PACING_CLOCK',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 9: separate host/vantage integrity.
// ---------------------------------------------------------------------------

describe('(9) host/vantage integrity records each failure independently', () => {
  it.each(NON_P8_FAILURES)('%s fails exactly its own channel', (_name, kind, edit) => {
    const integrity = record(withKind(kind, edit)).summary.hostVantageIntegrity;
    expect(integrity.failedChannels).toEqual([kind]);
    expect(integrity.missingChannels).toEqual([]);
    for (const other of HOST_OBSERVATION_KINDS.filter((k) => k !== kind)) {
      expect(integrity.channels[other]).toBe('GREEN');
    }
  });

  it('several failures are listed together, and a P8 event also reds the SLEEP_WAKE channel', () => {
    const set = withKind('SLEEP_WAKE', (o) =>
      o.outcome.events.push({ kind: 'Wake', atUtc: at(2) }),
    ).map((o) => (o.kind === 'IPV4_ROUTE' ? { ...o, outcome: { defaultInterface: null } } : o));
    const r = record(set);
    expect(r.summary.hostVantageIntegrity.failedChannels).toEqual(['IPV4_ROUTE', 'SLEEP_WAKE']);
    expect(r.summary.frozenP8.hostStateAnomaly).toBe(true);
  });

  it('a missing channel is NOT_PROVED, never assumed green', () => {
    const r = record(greenSet().filter((o) => o.kind !== 'DNS64_NAT64'));
    expect(r.summary.hostVantageIntegrity).toMatchObject({
      verdict: 'HOST_VANTAGE_INTEGRITY_NOT_PROVED',
      missingChannels: ['DNS64_NAT64'],
      failedChannels: [],
    });
  });

  it('a resolver error string can never pass as an AAAA answer (the earlier kit defect)', () => {
    const set = withKind('DNS64_NAT64', (o) => {
      o.outcome.aaaaRecords = [';; connection timed out; no servers could be reached'];
    });
    expect(codeOf(() => record(set))).toBe('OPERATOR_KIT_HOST_OBSERVATION_SHAPE');
  });

  it('without the no-DNS64 requirement an AAAA answer is admitted', () => {
    const set = withKind('DNS64_NAT64', (o) => void (o.outcome.aaaaRecords = ['64:ff9b::c000:aa']));
    const r = buildHostObservationRecord({
      observedFor: 'POST_INVOCATION',
      requirements: { ...REQ, noDns64Required: false },
      observations: set,
    });
    expect(r.summary.hostVantageIntegrity.verdict).toBe('HOST_VANTAGE_INTEGRITY_GREEN');
  });
});

// ---------------------------------------------------------------------------
// 10-14: persisted, reproducible observations; no free-standing claims.
// ---------------------------------------------------------------------------

describe('persisted observations replay mechanically', () => {
  const persist = (r: HostObservationRecord) =>
    JSON.parse(serialiseHostObservationRecord(r)) as Json;

  it('(10) a persisted GREEN record replays GREEN', () => {
    const replayed = replayHostObservationRecord(persist(record(greenSet())), REQ);
    expect(replayed.summary.hostVantageIntegrity.verdict).toBe('HOST_VANTAGE_INTEGRITY_GREEN');
    expect(replayed.summary.frozenP8.hostStateAnomaly).toBe(false);
  });

  it('(11) a persisted RED record replays RED', () => {
    const red = record(
      withKind(...(NON_P8_FAILURES[0]!.slice(1) as [HostObservationKind, (o: Json) => void])),
    );
    const replayed = replayHostObservationRecord(persist(red), REQ);
    expect(replayed.summary.hostVantageIntegrity.verdict).toBe('HOST_VANTAGE_INTEGRITY_NOT_PROVED');
    expect(replayed.summary.hostVantageIntegrity.failedChannels).toEqual(['RESOLVER_HEALTH']);
  });

  it('serialisation is canonical: the same observations persist to the same bytes', () => {
    expect(serialiseHostObservationRecord(record(greenSet()))).toBe(
      serialiseHostObservationRecord(record(greenSet().reverse().reverse())),
    );
  });

  describe('(12) a stored summary or verdict differing from the replay is refused', () => {
    const tampers: [string, (j: Json) => void][] = [
      [
        'RED observations with a GREEN integrity summary',
        (j) => {
          j.summary.hostVantageIntegrity.verdict = 'HOST_VANTAGE_INTEGRITY_GREEN';
          j.summary.hostVantageIntegrity.failedChannels = [];
          j.summary.hostVantageIntegrity.channels.RESOLVER_HEALTH = 'GREEN';
        },
      ],
      ['a P8 summary flipped true', (j) => void (j.summary.frozenP8.hostStateAnomaly = true)],
      ['a P8 ground added', (j) => void j.summary.frozenP8.grounds.push('PACING_CLOCK_ANOMALY')],
      [
        "an observation's stored verdict flipped GREEN",
        (j) => {
          const resolver = j.observations.find((o: Json) => o.kind === 'RESOLVER_HEALTH');
          resolver.verdict = 'GREEN';
        },
      ],
      [
        'an outcome edited under an unchanged summary',
        (j) => {
          const resolver = j.observations.find((o: Json) => o.kind === 'RESOLVER_HEALTH');
          resolver.outcome = { serversReachable: true, error: null };
          resolver.verdict = 'GREEN';
        },
      ],
    ];
    it.each(tampers)('%s', (_name, tamper) => {
      const j = persist(record(withKind('RESOLVER_HEALTH', NON_P8_FAILURES[0]![2])));
      tamper(j);
      expect(codeOf(() => replayHostObservationRecord(j, REQ))).toBe(
        'OPERATOR_KIT_HOST_OBSERVATION_REPLAY_MISMATCH',
      );
    });

    it('a record graded against other host-safety requirements', () => {
      const j = persist(record(greenSet()));
      expect(
        codeOf(() =>
          replayHostObservationRecord(j, { ...REQ, doNotStartAtOrBelowBatteryPercent: 100 }),
        ),
      ).toBe('OPERATOR_KIT_HOST_OBSERVATION_REPLAY_MISMATCH');
    });
  });

  it('(13) no host-health summary may exist without its persisted observations', () => {
    const j = persist(record(greenSet()));
    j.observations = [];
    expect(codeOf(() => replayHostObservationRecord(j, REQ))).toBe(
      'OPERATOR_KIT_HOST_HEALTH_CLAIM_WITHOUT_OBSERVATION',
    );
    expect(
      codeOf(() =>
        buildHostObservationRecord({
          observedFor: 'AFTER_STOP',
          requirements: REQ,
          observations: [],
        }),
      ),
    ).toBe('OPERATOR_KIT_HOST_HEALTH_CLAIM_WITHOUT_OBSERVATION');
    // An observation without its measurement inputs or timestamp is not an observation.
    for (const drop of ['measurement', 'recordedAtUtc', 'outcome']) {
      const k = persist(record(greenSet()));
      delete k.observations[0][drop];
      expect(
        codeOf(() => replayHostObservationRecord(k, REQ)),
        drop,
      ).toBe('OPERATOR_KIT_HOST_OBSERVATION_SHAPE');
    }
  });

  describe('(14) no hard-coded "green again" claim path exists', () => {
    it('a free-standing health boolean beside the record is refused', () => {
      const j = persist(record(greenSet()));
      j.hostCheckGreenAgainAfterStop = true;
      expect(codeOf(() => replayHostObservationRecord(j, REQ))).toBe(
        'OPERATOR_KIT_HOST_OBSERVATION_SHAPE',
      );
      const k = persist(record(greenSet()));
      k.summary.hostCheckGreenAgainAfterStop = true;
      expect(codeOf(() => replayHostObservationRecord(k, REQ))).toBe(
        'OPERATOR_KIT_HOST_OBSERVATION_REPLAY_MISMATCH',
      );
    });

    const stopAt = at(5);
    const afterStop = (observations: Unsealed[]) => {
      const text = serialiseHostObservationRecord(record(observations, 'AFTER_STOP'));
      return { path: 'synthetic/after-stop-host-observations.json', text };
    };

    it('a GREEN-after-stop claim built from persisted bytes validates', () => {
      const persisted = afterStop(greenSet(10));
      const claim = hostHealthClaimFrom({
        afterUtc: stopAt,
        path: persisted.path,
        persistedText: persisted.text,
        requirements: REQ,
      });
      expect(claim.verdict).toBe('HOST_VANTAGE_INTEGRITY_GREEN');
      expect(validateHostHealthClaim(claim, persisted, REQ)).toBe('HOST_VANTAGE_INTEGRITY_GREEN');
    });

    it('a literal GREEN claim with no persisted observation is refused', () => {
      const literal = {
        claimKind: 'HOST_VANTAGE_INTEGRITY_AFTER_EVENT',
        afterUtc: stopAt,
        observationRecord: { path: 'nowhere.json', sha256: sha256('x'), bytes: 1 },
        verdict: 'HOST_VANTAGE_INTEGRITY_GREEN',
      };
      expect(codeOf(() => validateHostHealthClaim(literal, null, REQ))).toBe(
        'OPERATOR_KIT_HOST_HEALTH_CLAIM_WITHOUT_OBSERVATION',
      );
      expect(codeOf(() => validateHostHealthClaim(true, null, REQ))).toBe(
        'OPERATOR_KIT_HOST_OBSERVATION_SHAPE',
      );
    });

    it('a GREEN claim over RED persisted observations is refused', () => {
      const persisted = afterStop(withKind('RESOLVER_HEALTH', NON_P8_FAILURES[0]![2]));
      const claim = {
        ...hostHealthClaimFrom({
          afterUtc: stopAt,
          path: persisted.path,
          persistedText: persisted.text,
          requirements: REQ,
        }),
        verdict: 'HOST_VANTAGE_INTEGRITY_GREEN',
      };
      expect(codeOf(() => validateHostHealthClaim(claim, persisted, REQ))).toBe(
        'OPERATOR_KIT_HOST_HEALTH_CLAIM_NOT_SUPPORTED',
      );
    });

    it('a claim whose observations predate the stop, or whose bytes changed, is refused', () => {
      const early = afterStop(greenSet(4)); // recorded before the stop at minute 5
      const claim = hostHealthClaimFrom({
        afterUtc: stopAt,
        path: early.path,
        persistedText: early.text,
        requirements: REQ,
      });
      expect(codeOf(() => validateHostHealthClaim(claim, early, REQ))).toBe(
        'OPERATOR_KIT_HOST_HEALTH_CLAIM_NOT_SUPPORTED',
      );
      const good = afterStop(greenSet(10));
      const goodClaim = hostHealthClaimFrom({
        afterUtc: stopAt,
        path: good.path,
        persistedText: good.text,
        requirements: REQ,
      });
      expect(
        codeOf(() => validateHostHealthClaim(goodClaim, { ...good, text: `${good.text} ` }, REQ)),
      ).toBe('OPERATOR_KIT_HOST_HEALTH_CLAIM_WITHOUT_OBSERVATION');
    });
  });
});

// ---------------------------------------------------------------------------
// 15-18: UQ5.
// ---------------------------------------------------------------------------

describe('UQ5: the T-0 invocation boundary', () => {
  const t0Red = record(withKind('RESOLVER_HEALTH', NON_P8_FAILURES[0]![2]), 'T0_BEFORE_EXECUTE');
  const t0Green = record(greenSet(), 'T0_BEFORE_EXECUTE');

  it('(15) a T-0 abort with no execute and no run leaves the invocation unspent', () => {
    expect(
      deriveOperatorInvocationBoundary({
        t0: t0Red,
        cliExecuteIssued: false,
        runCreated: false,
        institutionRequestCount: 0,
      }),
    ).toEqual({
      boundary: 'NOT_ISSUED_T0_ABORTED',
      disposition: RECOVERY_INVOCATION_DISPOSITIONS.unspent,
      institutionRequestCount: 0,
    });
  });

  it('(16) execute issued => consumed, whatever T-0 said', () => {
    for (const t0 of [t0Red, t0Green, null]) {
      expect(
        deriveOperatorInvocationBoundary({
          t0,
          cliExecuteIssued: true,
          runCreated: false,
          institutionRequestCount: 0,
        }),
      ).toMatchObject({
        boundary: 'EXECUTE_ISSUED',
        disposition: RECOVERY_INVOCATION_DISPOSITIONS.consumed,
      });
    }
  });

  it('(17) run created => consumed', () => {
    for (const issued of [true, false]) {
      expect(
        deriveOperatorInvocationBoundary({
          t0: t0Green,
          cliExecuteIssued: issued,
          runCreated: true,
          institutionRequestCount: 0,
        }),
      ).toMatchObject({
        boundary: 'RUN_CREATED',
        disposition: RECOVERY_INVOCATION_DISPOSITIONS.consumed,
      });
    }
  });

  it('(18) zero institution requests after execute issuance never restores the invocation', () => {
    const spent = deriveOperatorInvocationBoundary({
      t0: t0Red,
      cliExecuteIssued: true,
      runCreated: false,
      institutionRequestCount: 0,
    });
    expect(spent.disposition).toBe(RECOVERY_INVOCATION_DISPOSITIONS.consumed);
    expect(spent.institutionRequestCount).toBe(0);
  });

  it('the boundary refuses non-boolean flags, a bad count, and a T-0 not taken before execute', () => {
    const base = {
      t0: null,
      cliExecuteIssued: false,
      runCreated: false,
      institutionRequestCount: 0,
    };
    expect(
      codeOf(() => deriveOperatorInvocationBoundary({ ...base, cliExecuteIssued: 0 as never })),
    ).toBe('OPERATOR_KIT_HOST_OBSERVATION_SHAPE');
    expect(
      codeOf(() => deriveOperatorInvocationBoundary({ ...base, institutionRequestCount: -1 })),
    ).toBe('OPERATOR_KIT_HOST_OBSERVATION_SHAPE');
    expect(
      codeOf(() =>
        deriveOperatorInvocationBoundary({ ...base, t0: record(greenSet(), 'AFTER_STOP') }),
      ),
    ).toBe('OPERATOR_KIT_HOST_OBSERVATION_SHAPE');
    expect(deriveOperatorInvocationBoundary({ ...base, t0: t0Green }).boundary).toBe('NOT_ISSUED');
  });
});

// ---------------------------------------------------------------------------
// 19-20: UQ1.
// ---------------------------------------------------------------------------

describe('UQ1: the recovery P1-P8 readout is evidence only', () => {
  const deepFreeze = <V>(value: V): V => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(deepFreeze);
      Object.freeze(value);
    }
    return value;
  };

  it('(19) the readout carries the recorded-only rule and both host channels side by side', () => {
    const r = record(withKind('RESOLVER_HEALTH', NON_P8_FAILURES[0]![2]));
    const readout = buildRecoveryLocalGateReadout({
      frozenGate: { triggeredConditions: [{ condition: 'P5' }], decision: 'PAUSE_P5_LOW_YIELD' },
      hostObservations: r,
    });
    expect(readout).toEqual({
      ...RECOVERY_GATE_READOUT_RULE,
      firedConditions: ['P5'],
      decision: 'PAUSE_P5_LOW_YIELD',
      frozenP8HostStateAnomaly: false,
      hostVantageIntegrityVerdict: 'HOST_VANTAGE_INTEGRITY_NOT_PROVED',
    });
    expect(readout.recordedOnly).toBe(true);
    expect(readout.isRecoveryWindowPauseSystem).toBe(false);
  });

  it('a readout whose gate fired P8 without a P8 input (or the reverse) is refused', () => {
    const r = record(withKind('RESOLVER_HEALTH', NON_P8_FAILURES[0]![2]));
    expect(
      codeOf(() =>
        buildRecoveryLocalGateReadout({
          frozenGate: {
            triggeredConditions: [{ condition: 'P8' }],
            decision: 'PAUSE_P8_HOST_STATE_ANOMALY',
          },
          hostObservations: r,
        }),
      ),
    ).toBe('OPERATOR_KIT_RECOVERY_READOUT_INCONSISTENT');
  });

  it('(20) no original-window P2/P5 count is read, carried or mutated', () => {
    const originalWindow = deepFreeze({
      plannedWindowSize: 2,
      windowLowYieldCount: 1,
      windowRobotsRefusalCount: 0,
      p2PercentageThresholdCount: 1,
      p5LowYieldThresholdCount: 1,
      triggeredConditions: [{ condition: 'P5' }, { condition: 'P2' }],
      decision: 'PAUSE_P5_LOW_YIELD',
    });
    const before = JSON.stringify(originalWindow);
    const readout = buildRecoveryLocalGateReadout({
      frozenGate: { triggeredConditions: [], decision: 'WINDOW_COMPLETE' },
      hostObservations: record(greenSet()),
    });
    expect(JSON.stringify(originalWindow)).toBe(before);
    for (const counter of [
      'plannedWindowSize',
      'windowLowYieldCount',
      'windowRobotsRefusalCount',
      'p2PercentageThresholdCount',
      'p5LowYieldThresholdCount',
    ]) {
      expect(readout).not.toHaveProperty(counter);
    }
    expect(readout.appliedToOriginalWindow).toBe(false);
    expect(readout.joinsOriginalWindowDenominator).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The existing generic validator accepts a correct FUTURE repair record only.
// ---------------------------------------------------------------------------

describe('validateOperatorKitHostSemanticsRepair over a future repair record', () => {
  const reviewText = '{"recordKind":"GENERATION2_OPERATOR_KIT_HOST_SEMANTICS_REPAIR_REVIEW"}\n';
  const repair = (): Json => ({
    recordKind: HOST_RECOVERY_RECORD_KINDS.operatorKitRepair,
    generationId: 'METHODOLOGY_V3_GEN2',
    isLiveAuthority: false,
    thisFileAuthorises: [],
    recordedAtUtc: '2030-01-01T00:00:00Z',
    proves: clone(OPERATOR_KIT_REPAIR_REQUIRED_PROOFS),
    review: {
      reviewed: true,
      reviewRecord: {
        path: 'docs/evaluation/synthetic-review.json',
        commit: 'a'.repeat(40),
        sha256: sha256(reviewText),
        bytes: Buffer.byteLength(reviewText, 'utf8'),
      },
    },
  });
  const seal = (j: Json): PinnedCommittedRecord => {
    const text = `${JSON.stringify(j, null, 2)}\n`;
    return {
      path: 'docs/evaluation/synthetic-repair.json',
      commit: 'b'.repeat(40),
      sha256: sha256(text),
      text,
    };
  };

  it('the correct shape passes', () => {
    expect(validateOperatorKitHostSemanticsRepair(seal(repair()))).toEqual({
      recordedAtMs: Date.parse('2030-01-01T00:00:00Z'),
    });
  });

  const malformed: [string, (j: Json) => void][] = [
    [
      'wrong recordKind',
      (j) => void (j.recordKind = 'GENERATION2_OPERATOR_KIT_HOST_SEMANTICS_REPAIR_REVIEW'),
    ],
    ['live authority true', (j) => void (j.isLiveAuthority = true)],
    ['non-empty thisFileAuthorises', (j) => void (j.thisFileAuthorises = ['recovery'])],
    [
      'wrong P8 semantics proof',
      (j) => void (j.proves.frozenP8InputSemantics = 'ANY_HOST_CHECK_RED'),
    ],
    [
      'separate host integrity false',
      (j) => void (j.proves.hostVantageIntegrityRepresentedSeparately = false),
    ],
    ['hardCodedHostHealthClaims > 0', (j) => void (j.proves.hardCodedHostHealthClaims = 1)],
    [
      'observations not persisted/reproducible',
      (j) => void (j.proves.hostObservationsPersistedAndReproducible = false),
    ],
    ['tests not committed', (j) => void (j.proves.repairTestsCommitted = false)],
    ['separatelyReviewed false', (j) => void (j.proves.separatelyReviewed = false)],
    ['an extra proof', (j) => void (j.proves.somethingElse = true)],
    ['review.reviewed false', (j) => void (j.review.reviewed = false)],
    ['missing reviewRecord', (j) => void delete j.review.reviewRecord],
    ['malformed review commit', (j) => void (j.review.reviewRecord.commit = 'abc')],
    ['malformed review hash', (j) => void (j.review.reviewRecord.sha256 = 'Z'.repeat(64))],
    ['malformed review bytes', (j) => void (j.review.reviewRecord.bytes = '12')],
    ['wrong generation', (j) => void (j.generationId = 'METHODOLOGY_V2')],
  ];
  it.each(malformed)('%s refuses HOST_RECOVERY_OPERATOR_KIT_REPAIR_NOT_PROVED', (_name, tamper) => {
    const j = repair();
    tamper(j);
    expect(codeOf(() => validateOperatorKitHostSemanticsRepair(seal(j)))).toBe(
      'HOST_RECOVERY_OPERATOR_KIT_REPAIR_NOT_PROVED',
    );
  });
});

// ---------------------------------------------------------------------------
// Static: the repaired semantics carry neither historical defect.
// ---------------------------------------------------------------------------

describe('static defect regression over the version-controlled operator semantics', () => {
  const source = readFileSync(join(REPO, MODULE), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('derives no P8 input from a host or vantage OK flag', () => {
    expect(code).not.toMatch(/hostStateAnomaly\s*[:=]\s*!\s*\w*(?:host|vantage)\w*Ok/i);
    expect(code).not.toMatch(/hostStateAnomaly\s*[:=][^,;\n]*\b(?:hostOk|vantageOk|HOSTCHECK)\b/);
    expect(code).not.toMatch(/HOSTCHECK=GREEN/);
  });

  it('emits no literal host-health success boolean', () => {
    expect(code).not.toMatch(/hostCheckGreenAgainAfterStop/);
    expect(code).not.toMatch(
      /\b\w*(?:[Hh]ost|[Vv]antage|[Rr]esolver|[Hh]ealth|[Gg]reen)\w*\s*:\s*true\b/,
    );
    expect(code).not.toMatch(/verdict\s*:\s*'(?:GREEN|HOST_VANTAGE_INTEGRITY_GREEN)'/);
  });

  it('the P8 derivation reads only the two frozen kinds', () => {
    const body = /export function deriveFrozenP8HostStateAnomaly[\s\S]*?\n}\n/.exec(code)![0];
    expect(body).toMatch(/SLEEP_WAKE/);
    expect(body).toMatch(/PACING_CLOCK/);
    for (const kind of HOST_OBSERVATION_KINDS.filter(
      (k) => !['SLEEP_WAKE', 'PACING_CLOCK'].includes(k),
    )) {
      expect(body, kind).not.toContain(kind);
    }
    expect(body).not.toMatch(/integrity|requirements|DNS_FAILURE|concurren|monitor|battery/i);
  });

  it('opens no socket, file or process and imports nothing from acquisition code', () => {
    expect(source).not.toMatch(/node:(?:fs|net|http|https|dns|tls|child_process)/);
    expect(source).not.toMatch(/from '[^']*orgunits\/(?!classify\/canonical)/);
    expect(source).not.toMatch(/\bfetch\(|Date\.now\(|Math\.random\(|process\.env/);
  });
});
