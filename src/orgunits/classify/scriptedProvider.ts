/**
 * `ScriptedTestProvider` — the ONLY `ClassifierProvider` CI may ever
 * construct (Max-runtime design §44). Deterministic, zero network, no
 * model-provider dependency of any kind: it answers from an
 * operator-authored SCRIPT, one entry per call, and counts invocations so a
 * test can prove idempotent reuse or a bounded retry never invoked it more
 * times than expected.
 *
 * A script entry is either a fixed `ClassifierProviderResult` or a function
 * of the request and the zero-based call index — the function form lets a
 * test express "fail twice, then succeed" (bounded-retry proof) or "answer
 * differently depending on which batch this is" without a second class.
 *
 * The `scripted*` factory functions below build well-formed
 * `ClassifierProviderResult` values for every outcome the provider-neutral
 * taxonomy (`providerContract.ts`) admits, so a test reads as intent
 * ("scriptedUsageLimitExhausted()") rather than a hand-built object
 * literal repeated in every test file.
 *
 * PURE aside from the call log it keeps in memory. No network, no
 * database, no filesystem, no clock, no environment read.
 */
import type {
  ClassifierProvider,
  ClassifierProviderOutcomeKind,
  ClassifierProviderRequest,
  ClassifierProviderResult,
} from './providerContract.js';

export type ScriptedResponder =
  | ClassifierProviderResult
  | ((
      request: ClassifierProviderRequest,
      callIndex: number,
    ) => ClassifierProviderResult | Promise<ClassifierProviderResult>);

export class ScriptedTestProvider implements ClassifierProvider {
  readonly #script: readonly ScriptedResponder[];
  readonly #requests: ClassifierProviderRequest[] = [];

  constructor(script: readonly ScriptedResponder[]) {
    this.#script = script;
  }

  /** How many times `classify()` was actually invoked. */
  get callCount(): number {
    return this.#requests.length;
  }

  /** Every request `classify()` was actually invoked with, in order. */
  get requests(): readonly ClassifierProviderRequest[] {
    return this.#requests;
  }

  async classify(request: ClassifierProviderRequest): Promise<ClassifierProviderResult> {
    const index = this.#requests.length;
    this.#requests.push(request);
    const entry = this.#script[index];
    if (entry === undefined) {
      throw new Error(
        `ScriptedTestProvider: no scripted response for call #${index + 1} ` +
          `(the script only has ${this.#script.length} entr${this.#script.length === 1 ? 'y' : 'ies'}).`,
      );
    }
    return typeof entry === 'function' ? await entry(request, index) : entry;
  }
}

function baseResult(outcome: ClassifierProviderOutcomeKind): ClassifierProviderResult {
  return {
    outcome,
    rawOutput: null,
    responseModelId: null,
    inputTokens: null,
    outputTokens: null,
    outcomeDetail: null,
  };
}

/** A successful call: `rawOutput` is exactly what `validate.ts` will receive — deliberately untyped, so a test can script schema-invalid or semantically-invalid payloads too. */
export function scriptedOk(
  rawOutput: unknown,
  overrides: Partial<Omit<ClassifierProviderResult, 'outcome' | 'rawOutput'>> = {},
): ClassifierProviderResult {
  return {
    ...baseResult('OK'),
    rawOutput,
    responseModelId: overrides.responseModelId ?? 'scripted-test-model',
    inputTokens: overrides.inputTokens ?? 100,
    outputTokens: overrides.outputTokens ?? 50,
    outcomeDetail: overrides.outcomeDetail ?? null,
  };
}

export function scriptedTransient(detail = 'scripted transient failure'): ClassifierProviderResult {
  return { ...baseResult('PROVIDER_TRANSIENT'), outcomeDetail: detail };
}

export function scriptedRefusal(detail = 'scripted provider refusal'): ClassifierProviderResult {
  return { ...baseResult('PROVIDER_REFUSAL'), outcomeDetail: detail };
}

export function scriptedStructuredOutputFailed(
  detail = 'scripted structured-output failure',
): ClassifierProviderResult {
  return { ...baseResult('STRUCTURED_OUTPUT_FAILED'), outcomeDetail: detail };
}

export function scriptedTimeout(detail = 'scripted timeout'): ClassifierProviderResult {
  return { ...baseResult('TIMEOUT'), outcomeDetail: detail };
}

export function scriptedUsageLimitExhausted(
  detail = 'scripted subscription usage limit reached',
): ClassifierProviderResult {
  return { ...baseResult('USAGE_LIMIT_EXHAUSTED'), outcomeDetail: detail };
}

export function scriptedAuthFailure(
  detail = 'scripted authentication failure',
): ClassifierProviderResult {
  return { ...baseResult('AUTH_FAILURE'), outcomeDetail: detail };
}
