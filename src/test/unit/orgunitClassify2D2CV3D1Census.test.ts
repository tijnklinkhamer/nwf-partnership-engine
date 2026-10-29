/**
 * PHASE 2B-2D2C-V3D1 — THE FAILURE CENSUS RECONCILES WITH THE COMMITTED
 * G2 DERIVATION, AND THE COMMITTED CENSUS FILE IS ITS EXACT OUTPUT.
 *
 * Every count the census reports must equal what the post-adjudication
 * summary already records; every category must name exactly the ids the
 * F4A/G2 audits name. No preserved attempt root is needed: the census is a
 * function of the committed scored rows alone.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMMITTED_ADJUDICATED_RESULTS_DIR } from '../harness/phase2b2d2c/scoring/generate.js';
import {
  buildFailureCensus,
  parseScoredItemsJsonl,
  V3D1_CENSUS_VERSION,
} from '../harness/phase2b2d2c/v3d1/census.js';
import {
  buildCensusDocument,
  CENSUS_SOURCE_PATH,
  COMMITTED_CENSUS_PATH,
  renderCensusDocument,
} from '../harness/phase2b2d2c/v3d1/generate.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const rows = parseScoredItemsJsonl(
  readFileSync(join(REPO_ROOT, COMMITTED_ADJUDICATED_RESULTS_DIR, 'scored-items.jsonl'), 'utf8'),
);
const summary = JSON.parse(
  readFileSync(join(REPO_ROOT, COMMITTED_ADJUDICATED_RESULTS_DIR, 'summary.json'), 'utf8'),
) as {
  semanticMetrics: {
    variantName: string;
    gates: { gate: string; observed: number; denominator: number }[];
  }[];
  variants: { variantName: string; accepted: number; rejected: number }[];
  f4aInterpretation: { persistentRejections: { goldId: string }[] };
};
const census = buildFailureCensus(rows);

const LOST_UNITS = ['g57607d4278d6dc23', 'ge789b0f0aedc398c', 'gf65026e32d9da8db'];
const PERSISTENT_REJECTIONS = ['g0ec0d43dad311a77', 'g877a05e6f5bba835'];

function gate(variant: string, name: string): { observed: number; denominator: number } {
  const metrics = summary.semanticMetrics.find((m) => m.variantName === variant);
  const found = metrics?.gates.find((g) => g.gate === name);
  if (!found) throw new Error(`${variant} ${name} missing from summary`);
  return found;
}

describe('the V3D1 failure census reconciles with the committed G2 derivation', () => {
  it('covers exactly the 49 DEVELOPMENT items, 14 + 33 + 2 by gold verdict', () => {
    expect(census.censusVersion).toBe(V3D1_CENSUS_VERSION);
    expect(census.itemCount).toBe(49);
    expect(census.goldVerdictCounts).toEqual({ UNIT_PAGE: 14, NOT_A_UNIT: 33, NEEDS_REVIEW: 2 });
    expect(census.records.map((r) => r.goldId)).toEqual(
      [...census.records.map((r) => r.goldId)].sort(),
    );
  });

  it.each([
    ['PROMPT_V1_CANONICAL', 'v1'],
    ['PROMPT_V2_CANONICAL', 'v2'],
  ] as const)('%s counts equal every frozen gate numerator and denominator', (variant, key) => {
    const r = census.reconciliation[key];
    const v = summary.variants.find((x) => x.variantName === variant)!;
    expect(r.accepted).toBe(v.accepted);
    expect(r.rejected).toBe(v.rejected);
    expect([r.accepted, r.items]).toEqual([
      Math.round(gate(variant, 'minSchemaValidSpanVerifiedRate').observed * r.items),
      gate(variant, 'minSchemaValidSpanVerifiedRate').denominator,
    ]);
    expect(r.unitPageGold).toBe(gate(variant, 'minUnitPageRecall').denominator);
    expect(r.unitPageRecalled / r.unitPageGold).toBeCloseTo(
      gate(variant, 'minUnitPageRecall').observed,
      12,
    );
    expect(r.unitPagePredicted).toBe(gate(variant, 'minUnitPagePrecision').denominator);
    expect(r.unitPageCorrect / r.unitPagePredicted).toBeCloseTo(
      gate(variant, 'minUnitPagePrecision').observed,
      12,
    );
    expect(r.unitTypeCorrect / r.unitPageGold).toBeCloseTo(
      gate(variant, 'minUnitTypeAccuracy').observed,
      12,
    );
    expect(r.hardNegatives).toBe(gate(variant, 'minHardNegativeRejection').denominator);
    expect(r.hardNegativesRejectedAsNonUnit / r.hardNegatives).toBeCloseTo(
      gate(variant, 'minHardNegativeRejection').observed,
      12,
    );
    expect(r.needsReviewAnswered / r.items).toBeCloseTo(
      gate(variant, 'maxNeedsReviewRate').observed,
      12,
    );
  });

  it('reproduces the G2 headline numbers exactly', () => {
    expect(census.reconciliation.v1).toMatchObject({
      accepted: 45,
      rejected: 4,
      unitPageRecalled: 12,
      unitPagePredicted: 17,
      unitPageCorrect: 12,
      unitTypeCorrect: 12,
      hardNegativesRejectedAsNonUnit: 16,
      needsReviewAnswered: 1,
      notAUnitCorrect: 27,
    });
    expect(census.reconciliation.v2).toMatchObject({
      accepted: 47,
      rejected: 2,
      unitPageRecalled: 9,
      unitPagePredicted: 10,
      unitPageCorrect: 9,
      unitTypeCorrect: 9,
      hardNegativesRejectedAsNonUnit: 21,
      needsReviewAnswered: 0,
      notAUnitCorrect: 33,
    });
  });
});

describe('the eight census categories name exactly the items the audits name', () => {
  const c = census.categories;

  it('V1 false-positive units: four negatives plus one gold NEEDS_REVIEW item answered UNIT_PAGE', () => {
    expect(c.falsePositiveUnits.v1).toEqual([
      'g04b64db14c03ce3a',
      'g04d170f4d3fda759',
      'g3130d41296ab8739',
      'g536c8b148048fcbc',
      'g6458a352bc79ca01',
    ]);
  });

  it('V1 false-negative units: none answered, two validator-rejected', () => {
    expect(c.falseNegativeUnitsAnswered.v1).toEqual([]);
    expect(c.falseNegativeUnitsRejected.v1).toEqual(PERSISTENT_REJECTIONS);
  });

  it('V2 false-positive units: only the gold NEEDS_REVIEW contacts index', () => {
    expect(c.falsePositiveUnits.v2).toEqual(['g6458a352bc79ca01']);
  });

  it('V2 false-negative units: exactly the three lost unit pages, plus the same two rejections', () => {
    expect(c.falseNegativeUnitsAnswered.v2).toEqual(LOST_UNITS);
    expect(c.falseNegativeUnitsRejected.v2).toEqual(PERSISTENT_REJECTIONS);
  });

  it('validator rejections: four under V1, two under V2, the same two persistent', () => {
    expect(c.validatorRejected.v1).toEqual([
      'g0ec0d43dad311a77',
      'g32779df2d7b56a34',
      'g877a05e6f5bba835',
      'g956f99fae4ad4764',
    ]);
    expect(c.validatorRejected.v2).toEqual(PERSISTENT_REJECTIONS);
    expect(c.validatorRejected.persistent).toEqual(PERSISTENT_REJECTIONS);
    expect(summary.f4aInterpretation.persistentRejections.map((p) => p.goldId).sort()).toEqual(
      PERSISTENT_REJECTIONS,
    );
  });

  it('independent axis errors: eight NO-for-UNKNOWN answers under V1, none under V2', () => {
    expect(c.independentAxisErrors.v1).toHaveLength(8);
    expect(
      c.independentAxisErrors.v1.every((e) => e.gold === 'UNKNOWN' && e.predicted === 'NO'),
    ).toBe(true);
    expect(c.independentAxisErrors.v2).toEqual([]);
  });

  it('axis errors caused only by an incorrect verdict: 2 rejected items x 3 axes under V1; those plus 3 lost units x 3 axes under V2', () => {
    expect(c.axisErrorsCausedOnlyByIncorrectVerdict.v1).toHaveLength(6);
    expect(c.axisErrorsCausedOnlyByIncorrectVerdict.v2).toHaveLength(15);
    const v2Ids = new Set(c.axisErrorsCausedOnlyByIncorrectVerdict.v2.map((e) => e.goldId));
    expect([...v2Ids].sort()).toEqual([...LOST_UNITS, ...PERSISTENT_REJECTIONS].sort());
  });

  it('every axis difference on the three lost units is mechanically nulled by the verdict, not an independent axis decision', () => {
    for (const goldId of LOST_UNITS) {
      const record = census.records.find((r) => r.goldId === goldId)!;
      expect(record.paired.verdictDiffers).toBe(true);
      expect(record.axisDifferences).toHaveLength(3);
      expect(
        record.axisDifferences.every(
          (d) => d.classification === 'MECHANICALLY_NULLED_BY_NON_UNIT_VERDICT',
        ),
      ).toBe(true);
    }
  });

  it('the owner-confirmed item carries one verdict-independent difference: V2 emitted a unit name where gold expects none', () => {
    const record = census.records.find((r) => r.goldId === 'ge789b0f0aedc398c')!;
    expect(record.paired.verdictIndependentFieldDifferences).toEqual(['unit_name_present']);
    expect(record.paired.differenceCausedByTopLevelVerdict).toBe(false);
    expect(record.v2.fieldCorrectness['unit_name_expectation']).toBe('INCORRECT');
  });

  it('correct items at risk under a broader positive rule: all 21 hard negatives plus the small-organisation homepage V1 called a unit', () => {
    expect(c.correctItemsAtRiskUnderBroaderPositiveRule).toHaveLength(22);
    expect(c.correctItemsAtRiskUnderBroaderPositiveRule).toContain('g04b64db14c03ce3a');
    expect(c.correctItemsAtRiskUnderBroaderPositiveRule).toContain('g32779df2d7b56a34');
    expect(c.correctItemsAtRiskUnderBroaderPositiveRule).toContain('g956f99fae4ad4764');
    expect(c.correctItemsAtRiskUnderBroaderPositiveRule).not.toContain('g6458a352bc79ca01');
  });

  it('gate contributions: each lost unit counts against recall and type accuracy under V2 only; each rejection counts against the span rate, recall and type accuracy under both', () => {
    for (const goldId of LOST_UNITS) {
      const record = census.records.find((r) => r.goldId === goldId)!;
      expect(record.v1.countsAgainstGates).toEqual([]);
      expect(record.v2.countsAgainstGates).toEqual(['minUnitPageRecall', 'minUnitTypeAccuracy']);
    }
    for (const goldId of PERSISTENT_REJECTIONS) {
      const record = census.records.find((r) => r.goldId === goldId)!;
      for (const view of [record.v1, record.v2]) {
        expect(view.countsAgainstGates).toEqual([
          'minSchemaValidSpanVerifiedRate',
          'minUnitPageRecall',
          'minUnitTypeAccuracy',
        ]);
      }
    }
  });

  it('carries no prose: no rationale, quote or unit-name text anywhere in a record', () => {
    const serialized = JSON.stringify(census.records);
    expect(serialized).not.toMatch(/rationale/);
    expect(serialized).not.toMatch(/"quote"/);
    expect(serialized).not.toMatch(/unit_name":/);
  });
});

describe('the committed census file is the exact, byte-stable output of the generator', () => {
  it('matches a fresh in-memory derivation byte for byte', async () => {
    const committed = readFileSync(join(REPO_ROOT, COMMITTED_CENSUS_PATH), 'utf8');
    const rendered = await renderCensusDocument(buildCensusDocument(REPO_ROOT));
    expect(rendered).toBe(committed);
    const parsed = JSON.parse(committed) as { sourceScoredItemsPath: string; census: unknown };
    expect(parsed.sourceScoredItemsPath).toBe(CENSUS_SOURCE_PATH);
    expect(parsed.census).toEqual(JSON.parse(JSON.stringify(census)));
  });
});
