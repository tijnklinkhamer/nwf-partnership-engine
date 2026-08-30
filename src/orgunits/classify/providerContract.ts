/**
 * THE PROVIDER-NEUTRAL CLASSIFIER-PROVIDER INTERFACE.
 *
 * Exactly the shape the Phase 2B-2C Claude Max runtime design (§8) approved:
 * `ClassifierProvider.classify(request) -> result`, naming no provider, no
 * SDK, no authentication mechanism and no network detail anywhere in its
 * types. Two implementations exist so far — `ScriptedTestProvider`
 * (`scriptedProvider.ts`, this slice) and, in a later slice, a real
 * Max-authenticated Agent SDK adapter (`ClaudeMaxAgentProvider`, 2B-2C2,
 * NOT built here). Nothing upstream of this interface (the prompt, the
 * output schema, the deterministic validator, persistence, orchestration)
 * needs to change when that adapter lands: it will simply implement this
 * same interface.
 *
 * WHAT THIS CONTRACT DELIBERATELY DOES NOT CARRY: an API key, a
 * subscription token, a database pool, filesystem access, a network tool,
 * or an MCP handle of any kind (design §18). A `ClassifierProviderRequest`
 * is exactly what the model needs to answer one bounded call; nothing more
 * reaches an implementation through this type.
 *
 * THE OUTCOME TAXONOMY is the Max-runtime design's own (§8): `OK` plus six
 * distinct failure kinds, each meaning something a caller can act on
 * differently — never a single generic "error" a caller must string-match
 * to understand. This is PROVIDER-LEVEL vocabulary, distinct from and
 * mapped onto migration 0009/0010's PERSISTED `error_kind` taxonomy by
 * `orchestrate.ts`; the two are not the same list; see that mapping's own
 * comment for why the shapes differ (`STRUCTURED_OUTPUT_FAILED` here vs.
 * `SCHEMA_INVALID` there, and `OK` never appears in the persisted taxonomy
 * at all — a completed call has no `error_kind`).
 *
 * PURE TYPES ONLY. This file declares shapes; it holds no implementation,
 * no network, no database, no filesystem, no clock.
 */

/**
 * Bounded, non-secret, reproducibility-only run configuration — exactly what
 * migration 0009's `orgunit_classifier_calls.request_config` may hold.
 * Never a credential of any kind: no field here is a token, a key or a
 * connection string, and no implementation of `ClassifierProvider` may add
 * one that becomes one.
 */
export interface ClassifierRunConfig {
  readonly maxTurns?: number;
  readonly thinking?: 'disabled' | 'enabled';
  readonly effort?: 'low' | 'medium' | 'high';
}

export interface ClassifierProviderRequest {
  /** The frozen system-prompt TEXT (`prompt.ts`) — never a version string alone. */
  readonly systemPrompt: string;
  /**
   * The exact 2B-2B canonical serialization of the batch this call answers
   * (`canonicalStringify({ context, documents })` from `canonical.ts`) —
   * never a re-derived or re-shaped payload.
   */
  readonly serializedBatch: string;
  /** The provider-facing JSON Schema (`outputSchema.ts`), draft-07. */
  readonly outputJsonSchema: unknown;
  readonly modelId: string;
  readonly runConfig: ClassifierRunConfig;
}

export type ClassifierProviderOutcomeKind =
  | 'OK'
  | 'USAGE_LIMIT_EXHAUSTED'
  | 'AUTH_FAILURE'
  | 'PROVIDER_TRANSIENT'
  | 'PROVIDER_REFUSAL'
  | 'STRUCTURED_OUTPUT_FAILED'
  | 'TIMEOUT';

export interface ClassifierProviderResult {
  readonly outcome: ClassifierProviderOutcomeKind;
  /**
   * The raw structured-output value, exactly as the provider returned it —
   * `unknown`, NEVER pre-trusted, NEVER pre-parsed. Present only when
   * `outcome === 'OK'`; every non-`OK` outcome carries `null` here, because
   * there is nothing to validate. Layer-2 validation (`validate.ts`) is the
   * ONLY code path permitted to interpret this value as a
   * `ClassificationResult[]`.
   */
  readonly rawOutput: unknown | null;
  /** The model the provider ACTUALLY reported answering with — may differ from `request.modelId` on a provider-side fallback. `null` when no response was received at all. */
  readonly responseModelId: string | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  /**
   * A short, bounded, operator-facing description of a non-`OK` outcome.
   * Never raw provider text, never a stack trace, never a credential —
   * this is exactly what a future `orgunit_classifier_call_completions
   * .error_summary` may hold, so it is bounded (<= 2000 characters) at the
   * source rather than at the persistence boundary.
   */
  readonly outcomeDetail: string | null;
}

/** The provider-neutral seam. Implementations own network, auth and retries entirely themselves. */
export interface ClassifierProvider {
  classify(request: ClassifierProviderRequest): Promise<ClassifierProviderResult>;
}
