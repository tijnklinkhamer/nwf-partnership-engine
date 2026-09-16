/**
 * PHASE 2B-2D2C-F0Z — THE FORWARD SCORING CONTRACT AND ITS FAIL-CLOSED GUARD.
 *
 * Nothing here scores anything, and nothing here reads a Recovery-1 artifact.
 * The contract is PREPARED, not executed.
 *
 * The property that matters: a future v2 run can never be fed into the
 * historical Recovery-1 scorer as though it were historical evidence, and
 * Recovery-1 itself is completely unaffected — because it recorded no
 * semantics version at all, and an absent version IS v1 by definition.
 */
import { describe, expect, it } from 'vitest';
import {
  RELIABILITY_SEMANTICS_V1_HISTORICAL,
  RELIABILITY_SEMANTICS_V2,
} from '../harness/phase2b2d2c/constants.js';
import {
  FORWARD_ITEM_RESULTS,
  ReliabilitySemanticsMismatchError,
  V1_HISTORICAL_CONTRACT,
  V2_CONTRACT,
  assertScorerReliabilitySemantics,
  contractFor,
} from '../harness/phase2b2d2c/scoring/reliabilitySemantics.js';

describe('2D2C-F0Z forward scoring contract', () => {
  it('v2 admits a provider TIMEOUT as an OBSERVED invalid item; v1 does not', () => {
    expect([...V1_HISTORICAL_CONTRACT.admittedNonTerminalProviderOutcomes]).toEqual([
      'STRUCTURED_OUTPUT_FAILED',
    ]);
    expect([...V2_CONTRACT.admittedNonTerminalProviderOutcomes]).toEqual([
      'STRUCTURED_OUTPUT_FAILED',
      'TIMEOUT',
    ]);
    expect(V2_CONTRACT.itemResults).toContain('INVALID_PROVIDER_TIMEOUT');
    expect(V1_HISTORICAL_CONTRACT.itemResults).not.toContain('INVALID_PROVIDER_TIMEOUT');
  });

  it('v2 allows a COMPLETE replicate to hold provider-failure INVALID batches; v1 does not', () => {
    expect(V2_CONTRACT.completeReplicateMayHoldProviderTimeout).toBe(true);
    expect(V1_HISTORICAL_CONTRACT.completeReplicateMayHoldProviderTimeout).toBe(false);
  });

  it('both versions keep the denominator SIZE and never reduce N', () => {
    for (const contract of [V1_HISTORICAL_CONTRACT, V2_CONTRACT]) {
      expect(contract.denominatorRule).toContain('49 planned items');
      expect(contract.denominatorRule).toContain('N is never reduced');
    }
  });

  it('both versions keep terminal liveness failure as genuinely UNOBSERVED', () => {
    for (const contract of [V1_HISTORICAL_CONTRACT, V2_CONTRACT]) {
      expect(contract.itemResults).toContain('NOT_OBSERVED_DUE_TO_TERMINAL_FAILURE');
    }
    expect(V2_CONTRACT.denominatorRule).toContain(
      'TERMINAL LIVENESS FAILURE still ends the replicate',
    );
  });

  it('the item vocabulary keeps semantic INVALID and terminally-unobserved apart', () => {
    // The whole point of the taxonomy: these are four distinct readings and
    // none of them is a synonym of another.
    expect(new Set(FORWARD_ITEM_RESULTS).size).toBe(FORWARD_ITEM_RESULTS.length);
    expect([...FORWARD_ITEM_RESULTS]).toEqual([
      'OBSERVED_SEMANTIC_VERDICT',
      'INVALID_NON_TERMINAL_PROVIDER_FAILURE',
      'INVALID_PROVIDER_TIMEOUT',
      'NOT_OBSERVED_DUE_TO_TERMINAL_FAILURE',
    ]);
  });

  it('resolves a contract by version, and returns null for an unknown one', () => {
    expect(contractFor(RELIABILITY_SEMANTICS_V1_HISTORICAL)).toBe(V1_HISTORICAL_CONTRACT);
    expect(contractFor(RELIABILITY_SEMANTICS_V2)).toBe(V2_CONTRACT);
    expect(contractFor('RELIABILITY_SEMANTICS_V9_IMAGINARY')).toBeNull();
  });
});

describe('2D2C-F0Z semantics guard: a version mismatch FAILS CLOSED', () => {
  it('RECOVERY-1 IS UNAFFECTED: an absent version is v1, and a v1 reader accepts it silently', () => {
    // Every Recovery-1 experiment manifest lands on exactly this input.
    for (const absent of [undefined, null]) {
      expect(() =>
        assertScorerReliabilitySemantics(absent, RELIABILITY_SEMANTICS_V1_HISTORICAL, 'where'),
      ).not.toThrow();
    }
  });

  it('a v1 reader REFUSES a v2 run rather than pooling two denominator compositions', () => {
    expect(() =>
      assertScorerReliabilitySemantics(
        RELIABILITY_SEMANTICS_V2,
        RELIABILITY_SEMANTICS_V1_HISTORICAL,
        'outputRoot: experiment manifest',
      ),
    ).toThrow(ReliabilitySemanticsMismatchError);
  });

  it('a v2 reader REFUSES historical v1 evidence, explicit or absent', () => {
    for (const observed of [undefined, null, RELIABILITY_SEMANTICS_V1_HISTORICAL]) {
      expect(() =>
        assertScorerReliabilitySemantics(observed, RELIABILITY_SEMANTICS_V2, 'where'),
      ).toThrow(ReliabilitySemanticsMismatchError);
    }
  });

  it('a matching version is accepted', () => {
    expect(() =>
      assertScorerReliabilitySemantics(RELIABILITY_SEMANTICS_V2, RELIABILITY_SEMANTICS_V2, 'w'),
    ).not.toThrow();
  });

  it('a malformed or unknown version is refused, never coerced', () => {
    for (const bad of [42, {}, [], 'RELIABILITY_SEMANTICS_V9_IMAGINARY']) {
      expect(() =>
        assertScorerReliabilitySemantics(bad, RELIABILITY_SEMANTICS_V1_HISTORICAL, 'w'),
      ).toThrow(ReliabilitySemanticsMismatchError);
    }
  });

  it('the refusal explains WHY the two protocols are not poolable', () => {
    try {
      assertScorerReliabilitySemantics(
        RELIABILITY_SEMANTICS_V2,
        RELIABILITY_SEMANTICS_V1_HISTORICAL,
        'root: experiment manifest',
      );
      expect.unreachable('the guard must throw');
    } catch (error) {
      const mismatch = error as ReliabilitySemanticsMismatchError;
      expect(mismatch.observedVersion).toBe(RELIABILITY_SEMANTICS_V2);
      expect(mismatch.readerVersion).toBe(RELIABILITY_SEMANTICS_V1_HISTORICAL);
      expect(mismatch.message).toContain('NOT the same observation protocol');
      expect(mismatch.message).toContain('Refusing rather than pooling');
    }
  });
});
