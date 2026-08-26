/**
 * A RUN-SCOPED, HOST-SCOPED CIRCUIT BREAKER.
 *
 * Purpose: prevent repeatedly spending a full 30s connect-timeout attempt on
 * a host that is clearly broken, without needing the gateway itself to know
 * anything about repetition (the gateway's own contract stays "one attempt,
 * one row" - ADR 0005). This lives ABOVE the gateway, in the orchestrator,
 * exactly where ADR 0004 s11 always said the per-host circuit breaker
 * belonged.
 *
 * POLICY (conservative v1; NOT statistically calibrated - see the 2B-1E
 * ADR "circuit breaker policy" section for why, and constants.ts for the
 * named threshold):
 *
 *   - a DETERMINISTIC HOST-TERMINAL failure (DNS_FAILURE, or the gateway
 *     refusing to connect to a resolved address at all - BLOCKED_BY_POLICY
 *     arriving on an ACTUALLY-ATTEMPTED fetch rather than a robots refusal)
 *     opens the circuit IMMEDIATELY;
 *   - a TRANSIENT transport failure (CONNECT_TIMEOUT, READ_TIMEOUT,
 *     CONNECTION_REFUSED, CONNECTION_RESET, TLS_FAILURE) increments a
 *     consecutive-failure streak, and the circuit opens once that streak
 *     reaches CIRCUIT_BREAKER_TRANSIENT_FAILURE_THRESHOLD;
 *   - ANY response actually received (any HTTP status, 2xx through 5xx)
 *     resets the transient streak to zero - the host answered, so it is not
 *     dead, whatever it said;
 *   - a PAGE-LEVEL issue (RESPONSE_TOO_LARGE, non-HTML content type, an
 *     unresolved charset) is not evidence the HOST is dead and has NO effect
 *     on the breaker - only recordSuccess/recordTransientFailure/
 *     recordTerminalFailure change state.
 *
 * NO HIDDEN GLOBAL STATE: one instance is created per run by the caller and
 * threaded through, exactly like `RobotsCache`. It is never a module-level
 * singleton, so it cannot leak across runs or across unrelated tests sharing
 * one process.
 *
 * NO RETRIES ARE ISSUED BY THIS MODULE. It only ever answers "is this host
 * currently open" and records what happened; deciding not to attempt a
 * skipped host is the caller's job, and a skip produces no fetch observation
 * of its own - the observation for the failure that opened the circuit
 * already exists.
 *
 * PURE state machine. No network, no database, no filesystem, no clock.
 */
import { CIRCUIT_BREAKER_TRANSIENT_FAILURE_THRESHOLD } from './constants.js';

export type CircuitState = 'CLOSED' | 'OPEN';

export type TerminalFailureKind = 'DNS_FAILURE' | 'HOST_ADDRESS_FORBIDDEN';

export type TransientFailureKind =
  'CONNECT_TIMEOUT' | 'READ_TIMEOUT' | 'CONNECTION_REFUSED' | 'CONNECTION_RESET' | 'TLS_FAILURE';

interface HostRecord {
  state: CircuitState;
  consecutiveTransientFailures: number;
  openedReason: TerminalFailureKind | 'TRANSIENT_STREAK' | null;
}

export interface HostCircuitSnapshot {
  readonly host: string;
  readonly state: CircuitState;
  readonly consecutiveTransientFailures: number;
  readonly openedReason: TerminalFailureKind | 'TRANSIENT_STREAK' | null;
}

/** One run's per-host circuit-breaker state. Created fresh per run, never a module-level singleton. */
export class HostCircuitBreaker {
  private readonly hosts = new Map<string, HostRecord>();

  private record(host: string): HostRecord {
    const key = host.toLowerCase();
    let record = this.hosts.get(key);
    if (record === undefined) {
      record = { state: 'CLOSED', consecutiveTransientFailures: 0, openedReason: null };
      this.hosts.set(key, record);
    }
    return record;
  }

  isOpen(host: string): boolean {
    return this.record(host).state === 'OPEN';
  }

  /** A deterministic, host-terminal failure. Opens the circuit immediately. */
  recordTerminalFailure(host: string, kind: TerminalFailureKind): void {
    const record = this.record(host);
    record.state = 'OPEN';
    record.openedReason = kind;
  }

  /** A transient transport failure. Opens the circuit once the consecutive streak reaches the threshold. */
  recordTransientFailure(host: string, _kind: TransientFailureKind): void {
    const record = this.record(host);
    if (record.state === 'OPEN') return;
    record.consecutiveTransientFailures += 1;
    if (record.consecutiveTransientFailures >= CIRCUIT_BREAKER_TRANSIENT_FAILURE_THRESHOLD) {
      record.state = 'OPEN';
      record.openedReason = 'TRANSIENT_STREAK';
    }
  }

  /** Any response actually received (any HTTP status). Resets the transient streak. Never re-closes an already-open circuit. */
  recordSuccess(host: string): void {
    const record = this.record(host);
    record.consecutiveTransientFailures = 0;
  }

  /**
   * A PAGE-LEVEL issue (too-large, non-HTML, unresolved charset). Deliberately
   * a no-op: the host answered, or the failure is about this one document,
   * neither of which is evidence the host itself is unreachable.
   */
  recordPageLevelIssue(_host: string): void {
    // Intentionally does nothing. Named so a caller's intent is explicit
    // rather than "just don't call anything here".
  }

  openHosts(): string[] {
    return [...this.hosts.entries()]
      .filter(([, record]) => record.state === 'OPEN')
      .map(([host]) => host)
      .sort();
  }

  snapshot(host: string): HostCircuitSnapshot {
    const record = this.record(host);
    return {
      host: host.toLowerCase(),
      state: record.state,
      consecutiveTransientFailures: record.consecutiveTransientFailures,
      openedReason: record.openedReason,
    };
  }
}

export function createHostCircuitBreaker(): HostCircuitBreaker {
  return new HostCircuitBreaker();
}
