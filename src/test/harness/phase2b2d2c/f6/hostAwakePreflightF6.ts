/**
 * PHASE 2B-2D2C-F6 — THE HOST-AWAKE EXECUTION CONTRACT AND ITS PREFLIGHT.
 *
 * F5 was interrupted because the MacBook's lid was closed on battery and the
 * host slept (`f5ClosureF6.ts`). F6 prevents a recurrence WITHOUT touching
 * classifier semantics: the study CLI runs wrapped in `caffeinate -dimsu --`,
 * on external power where possible, with the lid physically open until the
 * study writes its terminal record. This module holds that contract and a
 * request-free preflight that RECORDS the host state before slot 1.
 *
 * WHAT IS CHECKED, AND WHAT IS DELIBERATELY NOT.
 *
 *   - platform must be `darwin`.
 *   - The caffeinate assertion must actually cover THIS process. Measured on
 *     the run Mac (macOS 26.6, 2026-09-17): `caffeinate -dimsu -- <utility>`
 *     is NOT an ancestor of the utility — it holds its assertions from a
 *     separate process and `pmset -g assertions` reports each one as
 *     "caffeinate asserting on behalf of '<path>' (pid N)". A process-ancestry
 *     check would therefore be a false check. The preflight instead requires a
 *     `PreventUserIdleSystemSleep` caffeinate assertion on behalf of this
 *     process or one of its ancestors (the wrapped utility may be `npm`/`node`
 *     above the study process).
 *   - Power source is RECORDED. Not on AC is an ADVISORY, not a refusal: the
 *     owner's contract says external power SHOULD be connected, and `-s`
 *     (PreventSystemSleep) is honoured only on AC power.
 *   - Lid state is OBSERVED through `ioreg`'s `AppleClamshellState`. A reading
 *     of CLOSED refuses. A reading of OPEN never waives the operator
 *     precondition, and an unreadable state is recorded as UNREADABLE and
 *     left to the operator: no check is invented where none is reliable.
 *     `caffeinate` does NOT make lid-close sleep safe; LID_OPEN_REQUIRED is an
 *     explicit operator precondition for the whole study either way.
 *
 * NOTHING HERE CHANGES THE STUDY. No timeout, retry, watchdog, reliability or
 * model setting is read or written; `altersClassifierSemantics` is false by
 * construction. No `pmset` setting is changed — observations are read-only.
 *
 * PURE. The caller supplies already-captured command output; this module runs
 * no command, opens no file and reads no clock.
 */

export const F6_HOST_AWAKE_CONTRACT_VERSION = 'phase2b-2d2c-f6-host-awake-execution-contract-v1';
export const F6_HOST_AWAKE_PREFLIGHT_RECORD_VERSION =
  'phase2b-2d2c-f6-host-awake-preflight-record-v1';

/** The exact wrapper, verified on the run Mac: `caffeinate -dimsu -- <study command>`. */
export const F6_CAFFEINATE_WRAPPER: readonly string[] = Object.freeze([
  '/usr/bin/caffeinate',
  '-dimsu',
  '--',
]);

export const LID_OPEN_REQUIRED = 'LID_OPEN_REQUIRED' as const;

export const F6_OPERATOR_PRECONDITIONS: readonly string[] = Object.freeze([
  LID_OPEN_REQUIRED,
  'NO_LID_CLOSE_UNTIL_STUDY_TERMINAL_RECORD',
  'EXTERNAL_POWER_CONNECTED_SHOULD',
  'CAFFEINATE_WRAPS_THE_FULL_CLI_LIFETIME',
  'NO_PERMANENT_PMSET_CHANGE',
]);

/** The read-only commands whose stdout the preflight consumes. None needs privilege. */
export const F6_HOST_OBSERVATION_COMMANDS = Object.freeze({
  powerSource: ['/usr/bin/pmset', '-g', 'batt'],
  assertions: ['/usr/bin/pmset', '-g', 'assertions'],
  clamshell: ['/usr/sbin/ioreg', '-r', '-k', 'AppleClamshellState', '-d', '4'],
});

export type PowerSource = 'AC_POWER' | 'BATTERY_POWER' | 'UPS_POWER' | 'UNKNOWN';
export type LidObservation = 'OPEN' | 'CLOSED' | 'UNREADABLE';

export interface CaffeinateAssertion {
  readonly assertingPid: number;
  readonly assertionType: string;
  readonly onBehalfOfPid: number | null;
}

export interface HostAwakeObservations {
  readonly platform: string;
  readonly observedAtUtc: string;
  /** This process first, then each ancestor pid, nearest first. */
  readonly processLineagePids: readonly number[];
  readonly pmsetBattStdout: string | null;
  readonly pmsetAssertionsStdout: string | null;
  readonly ioregClamshellStdout: string | null;
}

export type HostAwakeRefusal =
  | 'PLATFORM_NOT_DARWIN'
  | 'NO_PROCESS_LINEAGE'
  | 'ASSERTIONS_UNREADABLE'
  | 'NO_CAFFEINATE_IDLE_SLEEP_ASSERTION_FOR_THIS_PROCESS'
  | 'LID_OBSERVED_CLOSED';

export type HostAwakeAdvisory =
  | 'NOT_ON_AC_POWER_PREVENT_SYSTEM_SLEEP_INEFFECTIVE'
  | 'POWER_SOURCE_UNKNOWN'
  | 'LID_STATE_UNREADABLE_OPERATOR_PRECONDITION_ONLY';

export interface HostAwakePreflightRecord {
  readonly recordVersion: typeof F6_HOST_AWAKE_PREFLIGHT_RECORD_VERSION;
  readonly contractVersion: typeof F6_HOST_AWAKE_CONTRACT_VERSION;
  readonly observedAtUtc: string;
  readonly platform: string;
  readonly powerSource: PowerSource;
  readonly lidObservation: LidObservation;
  readonly coveringCaffeinateAssertionTypes: readonly string[];
  readonly coveredPid: number | null;
  readonly operatorPreconditions: readonly string[];
  readonly refusals: readonly HostAwakeRefusal[];
  readonly advisories: readonly HostAwakeAdvisory[];
  readonly verdict: 'HOST_AWAKE_PREFLIGHT_PASSED' | 'HOST_AWAKE_PREFLIGHT_REFUSED';
  readonly altersClassifierSemantics: false;
}

/** `pmset -g batt` first line: "Now drawing from 'AC Power'" / 'Battery Power' / 'UPS Power'. */
export function parsePowerSource(stdout: string | null): PowerSource {
  const match = stdout === null ? null : /Now drawing from '([^']+)'/.exec(stdout);
  switch (match?.[1]) {
    case 'AC Power':
      return 'AC_POWER';
    case 'Battery Power':
      return 'BATTERY_POWER';
    case 'UPS Power':
      return 'UPS_POWER';
    default:
      return 'UNKNOWN';
  }
}

/**
 * Every caffeinate assertion in `pmset -g assertions`. An assertion line is
 *   `pid 81313(caffeinate): [0x...] 00:00:00 PreventUserIdleSystemSleep named: "caffeinate command-line tool"`
 * optionally followed by
 *   `Details: caffeinate asserting on behalf of '/bin/sh' (pid 81312)`.
 */
export function parseCaffeinateAssertions(stdout: string): readonly CaffeinateAssertion[] {
  const assertions: CaffeinateAssertion[] = [];
  const lines = stdout.split('\n');
  lines.forEach((line, index) => {
    const head = /^\s*pid (\d+)\(caffeinate\): \[[^\]]*\] \S+ (\w+) named: /.exec(line);
    if (head === null) return;
    const details = lines[index + 1] ?? '';
    const behalf = /^\s*Details: caffeinate asserting on behalf of '.*' \(pid (\d+)\)\s*$/.exec(
      details,
    );
    assertions.push({
      assertingPid: Number(head[1]),
      assertionType: head[2]!,
      onBehalfOfPid: behalf === null ? null : Number(behalf[1]),
    });
  });
  return assertions;
}

/**
 * `AppleClamshellState` is `Yes` when the lid is closed. Every reading must
 * agree; none, or a disagreement, is UNREADABLE rather than a guess.
 */
export function parseLidObservation(stdout: string | null): LidObservation {
  if (stdout === null) return 'UNREADABLE';
  const values = [...stdout.matchAll(/"AppleClamshellState" = (Yes|No)\b/g)].map((m) => m[1]);
  if (values.length === 0 || new Set(values).size !== 1) return 'UNREADABLE';
  return values[0] === 'Yes' ? 'CLOSED' : 'OPEN';
}

export function evaluateHostAwakePreflight(
  observations: HostAwakeObservations,
): HostAwakePreflightRecord {
  const refusals: HostAwakeRefusal[] = [];
  const advisories: HostAwakeAdvisory[] = [];

  if (observations.platform !== 'darwin') refusals.push('PLATFORM_NOT_DARWIN');

  const lineage = new Set(observations.processLineagePids);
  if (lineage.size === 0) refusals.push('NO_PROCESS_LINEAGE');

  let coveringTypes: string[] = [];
  let coveredPid: number | null = null;
  if (observations.pmsetAssertionsStdout === null) {
    refusals.push('ASSERTIONS_UNREADABLE');
  } else {
    const covering = parseCaffeinateAssertions(observations.pmsetAssertionsStdout).filter(
      (assertion) => assertion.onBehalfOfPid !== null && lineage.has(assertion.onBehalfOfPid),
    );
    coveringTypes = [...new Set(covering.map((assertion) => assertion.assertionType))].sort();
    coveredPid = covering[0]?.onBehalfOfPid ?? null;
    if (!coveringTypes.includes('PreventUserIdleSystemSleep')) {
      refusals.push('NO_CAFFEINATE_IDLE_SLEEP_ASSERTION_FOR_THIS_PROCESS');
    }
  }

  const powerSource = parsePowerSource(observations.pmsetBattStdout);
  if (powerSource === 'UNKNOWN') advisories.push('POWER_SOURCE_UNKNOWN');
  else if (powerSource !== 'AC_POWER') {
    advisories.push('NOT_ON_AC_POWER_PREVENT_SYSTEM_SLEEP_INEFFECTIVE');
  }

  const lidObservation = parseLidObservation(observations.ioregClamshellStdout);
  if (lidObservation === 'CLOSED') refusals.push('LID_OBSERVED_CLOSED');
  if (lidObservation === 'UNREADABLE') {
    advisories.push('LID_STATE_UNREADABLE_OPERATOR_PRECONDITION_ONLY');
  }

  return {
    recordVersion: F6_HOST_AWAKE_PREFLIGHT_RECORD_VERSION,
    contractVersion: F6_HOST_AWAKE_CONTRACT_VERSION,
    observedAtUtc: observations.observedAtUtc,
    platform: observations.platform,
    powerSource,
    lidObservation,
    coveringCaffeinateAssertionTypes: coveringTypes,
    coveredPid,
    operatorPreconditions: F6_OPERATOR_PRECONDITIONS,
    refusals,
    advisories,
    verdict: refusals.length === 0 ? 'HOST_AWAKE_PREFLIGHT_PASSED' : 'HOST_AWAKE_PREFLIGHT_REFUSED',
    altersClassifierSemantics: false,
  };
}
