/**
 * THE v4 TRANSITION CENSUS, RE-DERIVED RATHER THAN TRUSTED.
 *
 * `docs/evaluation/PHASE_2B_2D_A2_V4_TRANSPORT_RETRY_TRANSITION_CENSUS_V1.json`
 * records, for every persisted acquisition run, which v4 compatibility class
 * it falls in AND the exact site-policy failure evidence that decision was
 * made from. This file re-computes every one of those classifications from
 * that recorded evidence, through the LANDED `retryDispositionFor`.
 *
 * WHY THAT IS WORTH DOING. A census is a claim about a decision procedure
 * applied to data. Reading its conclusions back would test nothing. Reading
 * its INPUTS back and re-running the real procedure over them tests the thing
 * that matters: that the published classifications are what the landed policy
 * actually says, and that they stay so if the policy is ever edited.
 *
 * The census itself was produced read-only against the working database with
 * zero network activity; this file needs no database at all, because the
 * census carries its own evidence.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { retryDispositionFor } from '../../orgunits/web/retryPolicy.js';
import type { FetchErrorKind, TransportFailureSubtype } from '../../orgunits/web/observations.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CENSUS_PATH = 'docs/evaluation/PHASE_2B_2D_A2_V4_TRANSPORT_RETRY_TRANSITION_CENSUS_V1.json';

interface FailureEvidence {
  readonly errorKind: FetchErrorKind | null;
  readonly errorSubtype: TransportFailureSubtype | null;
  readonly httpStatus: number | null;
}

interface CensusRun {
  readonly runRefSha256: string;
  readonly fetchPolicyVersion: string;
  readonly observations: number;
  readonly robotsObservations: number;
  readonly robotsFailureEvidence: readonly FailureEvidence[];
  readonly nonRobotsFailureCount: number;
  readonly classification: string;
}

interface Census {
  readonly totals: {
    readonly runsExamined: number;
    readonly fetchObservationsExamined: number;
    readonly robotsFailureObservations: number;
  };
  readonly countsByClass: Readonly<Record<string, number>>;
  readonly runs: readonly CensusRun[];
  readonly currentFailureClassifications: readonly {
    readonly selectionIndex: number;
    readonly runRefSha256: string;
    readonly robotsFailureEvidence: readonly FailureEvidence[];
    readonly classification: string;
    readonly wouldSucceed: string;
  }[];
  readonly noWouldSucceedClaimAnywhere: boolean;
  readonly semanticImplementationCommit: string;
  readonly method: Readonly<Record<string, unknown>>;
}

const census = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_PATH), 'utf8')) as Census;

/** The census's own stated rule, implemented here over the LANDED policy. */
function classify(evidence: readonly FailureEvidence[]): string {
  const dispositions = evidence.map((e) =>
    retryDispositionFor({
      context: 'ROBOTS_POLICY_RESOLUTION',
      errorKind: e.errorKind,
      errorSubtype: e.errorSubtype,
      httpStatus: e.httpStatus,
    }),
  );
  if (dispositions.includes('RETRY_ELIGIBLE')) return 'V4_TRANSITION_AFFECTED';
  if (dispositions.includes('INSUFFICIENT_EVIDENCE')) {
    return 'V4_TRANSITION_CLASSIFICATION_UNAVAILABLE_FROM_HISTORICAL_EVIDENCE';
  }
  return 'V4_TRANSITION_UNAFFECTED';
}

describe('v4 transition census: every classification re-derives from the landed policy', () => {
  it('examined all twelve persisted runs and all 204 observations', () => {
    expect(census.totals.runsExamined).toBe(12);
    expect(census.totals.fetchObservationsExamined).toBe(204);
    expect(census.runs).toHaveLength(12);
  });

  it('re-derives every run’s class from its own recorded evidence', () => {
    for (const run of census.runs) {
      expect(classify(run.robotsFailureEvidence), run.runRefSha256).toBe(run.classification);
    }
  });

  it('counts by class add up, and match the re-derived classes', () => {
    const recomputed: Record<string, number> = {
      V4_TRANSITION_UNAFFECTED: 0,
      V4_TRANSITION_AFFECTED: 0,
      V4_TRANSITION_CLASSIFICATION_UNAVAILABLE_FROM_HISTORICAL_EVIDENCE: 0,
    };
    for (const run of census.runs) {
      const key = classify(run.robotsFailureEvidence);
      recomputed[key] = (recomputed[key] ?? 0) + 1;
    }
    expect(recomputed).toEqual({
      V4_TRANSITION_UNAFFECTED: 9,
      V4_TRANSITION_AFFECTED: 0,
      V4_TRANSITION_CLASSIFICATION_UNAVAILABLE_FROM_HISTORICAL_EVIDENCE: 3,
    });
    expect(census.countsByClass).toEqual(recomputed);
    expect(Object.values(census.countsByClass).reduce((a, b) => a + b, 0)).toBe(12);
  });

  it('finds ZERO affected runs, because every site-policy failure predates migration 0012', () => {
    // AFFECTED requires PROOF that v4 would have issued an extra request. A
    // NULL subtype on TLS_FAILURE or DNS_FAILURE cannot supply it in either
    // direction, which is exactly what the third class exists for.
    expect(census.countsByClass['V4_TRANSITION_AFFECTED']).toBe(0);
    for (const run of census.runs) {
      for (const e of run.robotsFailureEvidence) expect(e.errorSubtype).toBeNull();
    }
    expect(census.totals.robotsFailureObservations).toBe(3);
  });
});

describe('v4 transition census: the four current failures, verified not asserted', () => {
  const byIndex = new Map(census.currentFailureClassifications.map((c) => [c.selectionIndex, c]));

  it('covers exactly indices 3, 4, 6 and 8', () => {
    expect([...byIndex.keys()].sort((a, b) => a - b)).toEqual([3, 4, 6, 8]);
  });

  it('index 3 is UNAFFECTED - an HTTP response, which V1 transport retry never triggers on', () => {
    const entry = byIndex.get(3)!;
    expect(entry.robotsFailureEvidence).toEqual([]);
    expect(classify(entry.robotsFailureEvidence)).toBe('V4_TRANSITION_UNAFFECTED');
    expect(entry.classification).toBe('V4_TRANSITION_UNAFFECTED');
  });

  for (const index of [4, 6, 8]) {
    it(`index ${index} is UNAVAILABLE_FROM_HISTORICAL_EVIDENCE, re-derived`, () => {
      const entry = byIndex.get(index)!;
      expect(entry.robotsFailureEvidence.length).toBeGreaterThan(0);
      for (const e of entry.robotsFailureEvidence) {
        expect(['TLS_FAILURE', 'DNS_FAILURE']).toContain(e.errorKind);
        expect(e.errorSubtype).toBeNull();
      }
      expect(classify(entry.robotsFailureEvidence)).toBe(
        'V4_TRANSITION_CLASSIFICATION_UNAVAILABLE_FROM_HISTORICAL_EVIDENCE',
      );
      expect(entry.classification).toBe(
        'V4_TRANSITION_CLASSIFICATION_UNAVAILABLE_FROM_HISTORICAL_EVIDENCE',
      );
    });
  }

  it('claims WOULD_SUCCEED nowhere, for any index', () => {
    expect(census.noWouldSucceedClaimAnywhere).toBe(true);
    for (const entry of census.currentFailureClassifications) {
      expect(entry.wouldSucceed).toBe('NOT CLAIMED');
    }
    expect(readFileSync(join(REPO_ROOT, CENSUS_PATH), 'utf8')).not.toContain('WOULD_SUCCEED"');
  });

  it('each index’s entry agrees with the run-level census row it names', () => {
    const runs = new Map(census.runs.map((r) => [r.runRefSha256, r]));
    for (const entry of census.currentFailureClassifications) {
      const run = runs.get(entry.runRefSha256);
      expect(run, `index ${entry.selectionIndex} names an unknown run`).toBeDefined();
      expect(run!.classification).toBe(entry.classification);
      expect(run!.robotsFailureEvidence).toEqual(entry.robotsFailureEvidence);
    }
  });
});

describe('v4 transition census: it leaks no identity and consulted no forbidden input', () => {
  const raw = readFileSync(join(REPO_ROOT, CENSUS_PATH), 'utf8');

  it('records no hostname, URL, ECHE row key or page content', () => {
    expect(raw).not.toMatch(/https?:\/\/(?!newwavefluent)/);
    expect(raw).not.toMatch(/\b[A-Z]{1,2} [A-Z]+\d+\b/); // an Erasmus code shape
    expect(raw).not.toContain('eche_row_key');
    expect(raw).not.toContain('echeRowKey');
    expect(raw).not.toContain('main_text');
  });

  it('names runs only by an opaque digest, never by run id', () => {
    for (const run of census.runs) expect(run.runRefSha256).toMatch(/^[0-9a-f]{64}$/);
    // A UUID anywhere would be a run id or an organisation id.
    expect(raw).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  });

  it('declares zero institution network activity and zero writes', () => {
    expect(census.method['networkRequestsToAnyInstitution']).toBe(0);
    expect(census.method['rowsWritten']).toBe(0);
    expect(census.method['rowsUpdated']).toBe(0);
    expect(census.method['rowsDeleted']).toBe(0);
    expect(census.method['forbiddenInputsUsed']).toEqual([]);
  });

  it('binds the real semantic implementation commit', () => {
    expect(census.semanticImplementationCommit).toMatch(/^[0-9a-f]{40}$/);
  });
});
