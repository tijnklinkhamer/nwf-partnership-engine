/**
 * WW E-M - READING THE ENGINE CLI'S JSON ENVELOPES.
 *
 * The Mac runtime does no acquisition work and holds no acquisition
 * capability of its own: it runs the existing `nwf-pe acquisition ...`
 * commands and reads what they print with `--json`. That output is a
 * versioned contract (`nwf-pe.acquisition-cli.v1`), and this file is the one
 * place that interprets it.
 *
 * TOLERANT BY DESIGN. The status document is being extended concurrently (a
 * versioned `nwf-pe.acquisition-status.v1`), so a field this build does not
 * know is carried through and shown, never dropped, and a field that is
 * absent is "not reported", never zero. What is NOT tolerated is an
 * unreadable document: that is reported as such, never guessed around.
 *
 * PURE: no socket, no filesystem, no environment, no clock.
 */

export const ACQUISITION_CLI_CONTRACT = 'nwf-pe.acquisition-cli.v1';
/** The versioned status contract another package is introducing. Accepted when it appears. */
export const ACQUISITION_STATUS_CONTRACT_PREFIX = 'nwf-pe.acquisition-status.';

/** What one finished Engine CLI process produced. */
export interface CliRun {
  readonly exitCode: number | null;
  /** The terminating signal, if the process was killed. */
  readonly signal: string | null;
  readonly stdout: string;
  /** The last part of stderr, for the log. */
  readonly stderrTail: string;
}

export type JsonObject = Record<string, unknown>;

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The JSON document a run printed, or null when stdout is not one JSON object. */
export function parseEnvelope(stdout: string): JsonObject | null {
  const text = stdout.trim();
  if (text.length === 0) return null;
  try {
    const value: unknown = JSON.parse(text);
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

function crashDetail(run: CliRun): string {
  if (run.signal !== null) return `ended by signal ${run.signal}`;
  const tail = run.stderrTail.trim().split('\n').slice(-1)[0] ?? '';
  return `exit code ${String(run.exitCode)}, no readable result${tail ? `: ${tail}` : ''}`;
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const int = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) ? v : null;

// ---------------------------------------------------------------------------
// `acquisition worker --json`
// ---------------------------------------------------------------------------

export type WorkerResult =
  | {
      readonly kind: 'STOPPED';
      /** The worker's recorded stop reason (WORKER_STOP_REASONS), as printed. */
      readonly stopReason: string;
      readonly detail: string | null;
      readonly processed: number | null;
      readonly outcomes: Readonly<Record<string, number>>;
      readonly stopId: string | null;
    }
  | { readonly kind: 'REFUSED'; readonly code: string; readonly detail: string | null }
  | { readonly kind: 'CRASHED'; readonly detail: string };

export function parseWorkerRun(run: CliRun): WorkerResult {
  const doc = parseEnvelope(run.stdout);
  if (doc === null || doc['contract'] !== ACQUISITION_CLI_CONTRACT) {
    return { kind: 'CRASHED', detail: crashDetail(run) };
  }
  if (doc['outcome'] === 'REFUSED') {
    const code = str(doc['code']);
    if (code === null) return { kind: 'CRASHED', detail: 'refusal without a code' };
    return { kind: 'REFUSED', code, detail: str(doc['detail']) };
  }
  if (doc['outcome'] === 'STOPPED' && isObject(doc['summary'])) {
    const s = doc['summary'];
    const stopReason = str(s['stopReason']);
    if (stopReason === null) return { kind: 'CRASHED', detail: 'stop without a reason' };
    const outcomes: Record<string, number> = {};
    if (isObject(s['outcomes'])) {
      for (const [k, v] of Object.entries(s['outcomes'])) {
        if (int(v) !== null) outcomes[k] = v as number;
      }
    }
    return {
      kind: 'STOPPED',
      stopReason,
      detail: str(s['detail']),
      processed: int(s['processed']),
      outcomes,
      stopId: str(s['stopId']),
    };
  }
  return { kind: 'CRASHED', detail: `unexpected outcome ${String(doc['outcome'])}` };
}

// ---------------------------------------------------------------------------
// `acquisition status --json`
// ---------------------------------------------------------------------------

export type StatusRead =
  | {
      readonly kind: 'STATUS';
      /** The contract the document declared. */
      readonly contract: string;
      /** The status object exactly as reported (unknown fields included). */
      readonly status: JsonObject;
    }
  | { readonly kind: 'REFUSED'; readonly code: string; readonly detail: string | null }
  | { readonly kind: 'UNAVAILABLE'; readonly detail: string };

export function parseStatusRun(run: CliRun): StatusRead {
  const doc = parseEnvelope(run.stdout);
  if (doc === null) return { kind: 'UNAVAILABLE', detail: crashDetail(run) };
  const contract = str(doc['contract']);
  if (contract === ACQUISITION_CLI_CONTRACT) {
    if (doc['outcome'] === 'REFUSED') {
      return { kind: 'REFUSED', code: str(doc['code']) ?? 'UNKNOWN', detail: str(doc['detail']) };
    }
    if (isObject(doc['status'])) return { kind: 'STATUS', contract, status: doc['status'] };
  }
  if (contract !== null && contract.startsWith(ACQUISITION_STATUS_CONTRACT_PREFIX)) {
    if (doc['outcome'] === 'REFUSED') {
      return { kind: 'REFUSED', code: str(doc['code']) ?? 'UNKNOWN', detail: str(doc['detail']) };
    }
    return { kind: 'STATUS', contract, status: isObject(doc['status']) ? doc['status'] : doc };
  }
  return { kind: 'UNAVAILABLE', detail: `unrecognised status contract ${String(contract)}` };
}

/** The few status facts the supervisor acts on. Absent means UNKNOWN, never a default. */
export interface CampaignFacts {
  readonly controlState: string | null;
  readonly verified: boolean | null;
  readonly verificationDetail: string | null;
  readonly windowStartsAt: string | null;
  readonly windowEndsAt: string | null;
  readonly windowOpen: boolean | null;
}

export function campaignFactsOf(status: JsonObject): CampaignFacts {
  const verification = isObject(status['verification']) ? status['verification'] : {};
  const window = isObject(status['window']) ? status['window'] : {};
  return {
    controlState: str(status['controlState']),
    verified: typeof verification['verified'] === 'boolean' ? verification['verified'] : null,
    verificationDetail: str(verification['detail']),
    windowStartsAt: str(window['startsAt']),
    windowEndsAt: str(window['endsAt']),
    windowOpen: typeof window['open'] === 'boolean' ? window['open'] : null,
  };
}

// ---------------------------------------------------------------------------
// `acquisition campaign control ... --execute --json`
// ---------------------------------------------------------------------------

export type ControlResult =
  | {
      readonly kind: 'RECORDED';
      readonly previousState: string | null;
      readonly sequenceNo: number | null;
    }
  | { readonly kind: 'REFUSED'; readonly code: string; readonly detail: string | null }
  | { readonly kind: 'FAILED'; readonly detail: string };

export function parseControlRun(run: CliRun): ControlResult {
  const doc = parseEnvelope(run.stdout);
  if (doc === null || doc['contract'] !== ACQUISITION_CLI_CONTRACT) {
    return { kind: 'FAILED', detail: crashDetail(run) };
  }
  if (doc['outcome'] === 'RECORDED') {
    return {
      kind: 'RECORDED',
      previousState: str(doc['previousState']),
      sequenceNo: int(doc['sequenceNo']),
    };
  }
  if (doc['outcome'] === 'REFUSED') {
    return { kind: 'REFUSED', code: str(doc['code']) ?? 'UNKNOWN', detail: str(doc['detail']) };
  }
  return { kind: 'FAILED', detail: `unexpected outcome ${String(doc['outcome'])}` };
}
