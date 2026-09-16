/**
 * PHASE 2B-2D2C-F0Z — THE FORWARD SCORING CONTRACT, AND THE VERSION GUARD.
 *
 * PREPARED, NOT EXECUTED. Nothing here scores anything. It declares what a
 * future run under `RELIABILITY_SEMANTICS_V2` would mean, and — the load-
 * bearing part — makes it impossible to feed such a run into the historical
 * Recovery-1 scorer as though it were historical evidence.
 *
 * WHY A VERSION AT ALL. Under v1 a confirmed Tier-1 TIMEOUT ended the whole
 * replicate, so its items AND every later batch's items were UNOBSERVED.
 * Under v2 that evaluation closes durably, its own items become OBSERVED and
 * INVALID, and the next frozen evaluation proceeds. The denominator's SIZE is
 * unchanged at 49 items per replicate; its COMPOSITION is not. Two runs under
 * different rules are therefore NOT draws from one protocol, and pooling them
 * silently would be a category error — so the mismatch is made structural
 * rather than remembered.
 *
 * RECOVERY-1 IS UNTOUCHED BY EVERY LINE OF THIS FILE. It wrote no
 * `reliabilitySemanticsVersion` field, so its ABSENCE means v1, and
 * `assertScorerReliabilitySemantics` returns without comment on exactly that
 * input. The guard can only ever fire on a manifest that explicitly names a
 * version the reader does not implement — which no historical artifact does.
 *
 * PURE. No filesystem, no network, no clock, no database.
 */
import { RELIABILITY_SEMANTICS_V1_HISTORICAL, RELIABILITY_SEMANTICS_V2 } from '../constants.js';

/**
 * How a scorer reads one planned item, per semantics version.
 *
 * `INVALID_PROVIDER_TIMEOUT` is NEW in v2 and exists for exactly one reason:
 * a timed-out batch's items were ASKED and produced nothing usable, which is
 * an observation. Recording them as `NOT_OBSERVED_DUE_TO_TERMINAL_FAILURE`
 * (v1's only option, because the replicate ended there) would conflate a
 * semantic INVALID with a terminal liveness failure — the precise conflation
 * F0Z exists to remove.
 */
export const FORWARD_ITEM_RESULTS = [
  /** A validated semantic verdict. */
  'OBSERVED_SEMANTIC_VERDICT',
  /** Observed, unusable: the SDK produced no structured result. Counts in the denominator. */
  'INVALID_NON_TERMINAL_PROVIDER_FAILURE',
  /** Observed, unusable: a confirmed Tier-1 TIMEOUT. v2 ONLY. Counts in the denominator. */
  'INVALID_PROVIDER_TIMEOUT',
  /** Genuinely unobserved: the replicate ended before this item was ever attempted. */
  'NOT_OBSERVED_DUE_TO_TERMINAL_FAILURE',
] as const;

export type ForwardItemResult = (typeof FORWARD_ITEM_RESULTS)[number];

/** One version's complete, closed reading rules. */
export interface ReliabilitySemanticsContract {
  readonly version: string;
  /** Provider outcomes an evaluation may carry WITHOUT stopping the replicate. */
  readonly admittedNonTerminalProviderOutcomes: readonly string[];
  /** Item results this version can produce. */
  readonly itemResults: readonly ForwardItemResult[];
  /** Whether a replicate may be COMPLETE while holding a timed-out batch. */
  readonly completeReplicateMayHoldProviderTimeout: boolean;
  readonly denominatorRule: string;
}

export const V1_HISTORICAL_CONTRACT: ReliabilitySemanticsContract = Object.freeze({
  version: RELIABILITY_SEMANTICS_V1_HISTORICAL,
  admittedNonTerminalProviderOutcomes: Object.freeze(['STRUCTURED_OUTPUT_FAILED']),
  itemResults: Object.freeze([
    'OBSERVED_SEMANTIC_VERDICT',
    'INVALID_NON_TERMINAL_PROVIDER_FAILURE',
    'NOT_OBSERVED_DUE_TO_TERMINAL_FAILURE',
  ] as const),
  completeReplicateMayHoldProviderTimeout: false,
  denominatorRule:
    'Every replicate contributes 49 planned items. A Tier-1 TIMEOUT ends the replicate, so its own ' +
    'items and every later batch’s items are NOT_OBSERVED_DUE_TO_TERMINAL_FAILURE and the replicate is ' +
    'TERMINAL_FAILURE_PARTIAL. N is never reduced to the number of complete replicates.',
});

export const V2_CONTRACT: ReliabilitySemanticsContract = Object.freeze({
  version: RELIABILITY_SEMANTICS_V2,
  admittedNonTerminalProviderOutcomes: Object.freeze(['STRUCTURED_OUTPUT_FAILED', 'TIMEOUT']),
  itemResults: Object.freeze(FORWARD_ITEM_RESULTS),
  // THE substantive difference. A replicate may now be COMPLETE while holding
  // one or more provider-failure INVALID batches, because those items WERE
  // observed - the provider was asked and produced nothing usable.
  completeReplicateMayHoldProviderTimeout: true,
  denominatorRule:
    'Every replicate contributes 49 planned items. A confirmed Tier-1 TIMEOUT makes ONLY ITS OWN ' +
    'batch’s items INVALID_PROVIDER_TIMEOUT - observed, and counted - and later batches are observed ' +
    'normally, so a replicate may be COMPLETE with one or more provider-failure INVALID batches. A ' +
    'TERMINAL LIVENESS FAILURE still ends the replicate and still produces genuinely unobserved items. ' +
    'N is never reduced to the number of complete replicates.',
});

export const RELIABILITY_SEMANTICS_CONTRACTS: readonly ReliabilitySemanticsContract[] =
  Object.freeze([V1_HISTORICAL_CONTRACT, V2_CONTRACT]);

/** Thrown when a scorer is handed evidence produced under semantics it does not implement. */
export class ReliabilitySemanticsMismatchError extends Error {
  override readonly name = 'ReliabilitySemanticsMismatchError';
  declare readonly observedVersion: string;
  declare readonly readerVersion: string;

  constructor(observedVersion: string, readerVersion: string, where: string) {
    super(
      `${where}: this evidence was produced under reliability semantics ${JSON.stringify(observedVersion)}, ` +
        `but this scorer implements ${JSON.stringify(readerVersion)}. These are NOT the same observation ` +
        'protocol: under v2 a confirmed provider TIMEOUT makes its own items observed-INVALID and the ' +
        'replicate continues, where under v1 it ended the replicate and left those items unobserved. ' +
        'Refusing rather than pooling two different denominator compositions. Score this run with the ' +
        'reader that declares its own semantics version.',
    );
    Object.defineProperty(this, 'observedVersion', { value: observedVersion, enumerable: true });
    Object.defineProperty(this, 'readerVersion', { value: readerVersion, enumerable: true });
  }
}

/**
 * The FAIL-CLOSED guard. `observed` is whatever an experiment manifest
 * recorded under `reliabilitySemanticsVersion`.
 *
 *   - `undefined` / `null` -> the historical v1 evidence. Every Recovery-1
 *     manifest lands here, so the historical scorer is unaffected.
 *   - equal to `readerVersion` -> accepted.
 *   - anything else -> THROWS. A v1 reader can never silently consume a v2
 *     run, and a v2 reader can never silently consume an explicitly-v1 one.
 */
export function assertScorerReliabilitySemantics(
  observed: unknown,
  readerVersion: string,
  where: string,
): void {
  if (observed === undefined || observed === null) {
    // Absent means v1 by definition. A v1 reader accepts it; a reader that
    // implements anything else must not silently treat it as its own.
    if (readerVersion === RELIABILITY_SEMANTICS_V1_HISTORICAL) return;
    throw new ReliabilitySemanticsMismatchError(
      RELIABILITY_SEMANTICS_V1_HISTORICAL,
      readerVersion,
      where,
    );
  }
  if (typeof observed !== 'string' || observed !== readerVersion) {
    throw new ReliabilitySemanticsMismatchError(String(observed), readerVersion, where);
  }
}

/** The contract a version declares, or `null` when the version is unknown to this build. */
export function contractFor(version: string): ReliabilitySemanticsContract | null {
  return RELIABILITY_SEMANTICS_CONTRACTS.find((c) => c.version === version) ?? null;
}
