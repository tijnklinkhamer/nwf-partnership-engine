/**
 * PHASE 2B-2D ACCEPTANCE METHODOLOGY V2 - the R1 REVISION, verified.
 *
 * R1 exists because three of the original proposal's load-bearing claims
 * could not survive being computed:
 *
 *   - its certified floor of `target - 0.10` never BINDS. At every
 *     denominator worth acquiring the point-estimate condition has the same
 *     critical count, so the "certification" added nothing to the decision.
 *   - its feasibility table had five rows and said six. The missing gate is
 *     a CEILING gate, needing an UPPER bound, and it is the one frozen gate
 *     that was already certifiable.
 *   - its binding instrument was a percentile cluster bootstrap at ~30
 *     clusters, whose own coverage there is unknown.
 *
 * Every number the R1 document publishes is RECOMPUTED here from the pure
 * primitives rather than read and trusted, including the seeded coverage
 * simulation, which is also asserted to be exactly repeatable.
 *
 * ZERO PROVIDER, ZERO NETWORK, ZERO DATABASE, ZERO INFERENCE, ZERO GOLD,
 * ZERO HOLDOUT. Reads one committed JSON document and computes over
 * integers.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ABSOLUTE_GATES,
  NON_INFERIORITY_MARGINS,
} from '../../orgunits/classify/evaluation/protocol.js';
import {
  ceilingGateFeasibility,
  certificationAcceptanceProbability,
  certificationBoundary,
  clopperPearsonUpperBound,
  clusteredCoverage,
  designEffect,
  estimatorVarianceDecomposition,
  gateFeasibility,
  minimumTrialsToCertify,
  minimumTrialsToCertifyCeiling,
  type CertificationRule,
} from '../harness/phase2b2d2c/methodology/acceptanceStatistics.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const R1_PATH = 'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL_R1.json';

type JsonObject = Readonly<Record<string, unknown>>;

const raw = readFileSync(resolve(ROOT, R1_PATH), 'utf8');
const r1 = JSON.parse(raw) as JsonObject;

/** Walk a dotted path. Throws on a missing key, so a renamed field fails loudly. */
function at(path: string): unknown {
  let cursor: unknown = r1;
  for (const key of path.split('.')) {
    if (typeof cursor !== 'object' || cursor === null || !(key in cursor)) {
      throw new Error(`R1 path ${path} is missing at ${key}`);
    }
    cursor = (cursor as JsonObject)[key];
  }
  return cursor;
}
const obj = (path: string): JsonObject => at(path) as JsonObject;
const arr = (path: string): readonly JsonObject[] => at(path) as readonly JsonObject[];
const num = (value: unknown): number => value as number;

/** The recommended D2 rule for one gate, as the document specifies it. */
function recommendedRule(
  pointTarget: number,
  certificationLevel: number,
  denominator: number,
  averageClusterSize: number,
  direction: 'higher is better' | 'lower is better' = 'higher is better',
): CertificationRule {
  return {
    direction,
    pointTarget,
    certificationLevel,
    denominator,
    alpha: 0.05,
    clustering: { averageClusterSize, icc: 0.1 },
  };
}

describe('R1 authorises nothing and keeps the original as history', () => {
  it('is PROPOSED with an empty thisFileAuthorises', () => {
    expect(r1['status']).toBe('PROPOSED');
    expect(r1['thisFileAuthorises']).toEqual([]);
    expect(obj('supersedes')['nothing']).toBe(true);
  });

  it('names the original by its exact hash and does not claim to supersede it', () => {
    const revises = obj('revises');
    expect(revises['sha256']).toBe(
      'c53e9d26e7bf8d798d7b3057f109335ab9f07427ab51f3e1b4a80974b16ee86e',
    );
    expect(revises['relationship'] as string).toMatch(/retained unmodified/);
  });

  it('separates the approved owner decisions from the pending ones', () => {
    expect(r1['APPROVED_OWNER_DECISIONS']).toEqual(['D1', 'D4', 'D5', 'D6']);
    expect(r1['PENDING_OWNER_DECISIONS']).toEqual(['D2', 'D3']);
  });

  it('declares every prohibited action of this revision excluded', () => {
    const exclusions = obj('exclusions');
    for (const required of [
      'noProviderInference',
      'noPromptCandidateCreated',
      'noV6Rescore',
      'noHoldoutItemInspection',
      'noNewLabels',
      'noLiveWebAcquisition',
      'noClassifierRuntimeCodeTouched',
    ]) {
      expect(exclusions[required], `${required} must be declared true`).toBe(true);
    }
  });

  it('names no gold id anywhere, so it cannot leak a sealed item', () => {
    expect(raw).not.toMatch(/\bg[0-9a-f]{16}\b/);
  });

  it('requires approval to be a separate record naming this file by hash', () => {
    const approvalMustBe = obj('ownerDecisionRequired')['approvalMustBe'] as string;
    expect(approvalMustBe).toMatch(/SEPARATE/);
    expect(approvalMustBe).toMatch(/SHA-256/);
    expect(approvalMustBe).toMatch(/authorises nothing/);
  });
});

describe('D6 terminology: six semantic gates, seven structural preconditions', () => {
  it('lists exactly six semantic gates, and exactly one of them is a ceiling gate', () => {
    const gates = arr('sectionA_terminology.sixSemanticQualityGates');
    expect(gates).toHaveLength(6);
    expect(gates.map((gate) => gate['id'])).toEqual(['G1', 'G2', 'G3', 'G4', 'G5', 'G6']);
    const ceilings = gates.filter((gate) => gate['direction'] === 'lower is better');
    expect(ceilings).toHaveLength(1);
    expect(ceilings[0]!['name']).toBe('needsReviewRate');
  });

  it('lists exactly seven structural preconditions and never calls one a gate', () => {
    const preconditions = arr('sectionA_terminology.sevenStructuralPreconditions');
    expect(preconditions).toHaveLength(7);
    expect(preconditions.map((p) => p['id'])).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']);
    expect(obj('sectionA_terminology')['aStructuralConditionIsNeverCalledASemanticGate']).toBe(
      true,
    );
  });

  it('the six-gate RULE table also carries all six, with no missing sixth row', () => {
    const rules = arr('sectionC_D2.fourDesignsCompared.sixGateRuleUnderTheRecommendedMethod.gates');
    expect(rules).toHaveLength(6);
    expect(rules.map((gate) => gate['id'])).toEqual(['G1', 'G2', 'G3', 'G4', 'G5', 'G6']);
  });
});

describe('the point-estimate targets are the frozen thresholds, unchanged', () => {
  const ruleGates = () =>
    arr('sectionC_D2.fourDesignsCompared.sixGateRuleUnderTheRecommendedMethod.gates');

  it('reuses ABSOLUTE_GATES verbatim for every gate that has a threshold', () => {
    const byId = new Map(ruleGates().map((gate) => [gate['id'], gate]));
    expect(byId.get('G1')!['pointTarget']).toBe(ABSOLUTE_GATES.minSchemaValidRate);
    expect(byId.get('G2')!['pointTarget']).toBe(ABSOLUTE_GATES.minUnitPageRecall);
    expect(byId.get('G3')!['pointTarget']).toBe(ABSOLUTE_GATES.minUnitPagePrecision);
    expect(byId.get('G4')!['pointTarget']).toBe(ABSOLUTE_GATES.minUnitTypeAccuracy);
    expect(byId.get('G5')!['pointTarget']).toBe(ABSOLUTE_GATES.minHardNegativeRejection);
    expect(byId.get('G6')!['pointTarget']).toBe(ABSOLUTE_GATES.maxNeedsReviewRate);
  });
});

describe('the certification levels come from the frozen materiality margins', () => {
  const perMetric = () =>
    arr('sectionC_D2.fourDesignsCompared.recommendedMethod.certificationLevelDerivation.perMetric');

  it('derives each level as threshold -/+ that metric OWN NON_INFERIORITY_MARGIN', () => {
    const byGate = new Map(perMetric().map((row) => [(row['gate'] as string).split(' ')[0], row]));
    const expectations: readonly [string, number, number][] = [
      ['G2', NON_INFERIORITY_MARGINS.unitPageRecall, ABSOLUTE_GATES.minUnitPageRecall],
      ['G3', NON_INFERIORITY_MARGINS.unitPagePrecision, ABSOLUTE_GATES.minUnitPagePrecision],
      ['G4', NON_INFERIORITY_MARGINS.unitTypeAccuracy, ABSOLUTE_GATES.minUnitTypeAccuracy],
      [
        'G5',
        NON_INFERIORITY_MARGINS.hardNegativeRejection,
        ABSOLUTE_GATES.minHardNegativeRejection,
      ],
    ];
    for (const [gate, margin, threshold] of expectations) {
      const row = byGate.get(gate)!;
      expect(row['margin'], `${gate} margin`).toBe(margin);
      expect(num(row['level']), `${gate} level`).toBeCloseTo(threshold - margin, 10);
    }
  });

  it('flags the one level that is an ANALOGY rather than a derivation, and none other', () => {
    const analogies = perMetric().filter((row) =>
      (row['marginSource'] as string).includes('ANALOGY_NOT_DERIVATION'),
    );
    expect(analogies).toHaveLength(1);
    expect(analogies[0]!['gate']).toMatch(/^G6/);
    // The ceiling moves UP by the margin, because lower is better there.
    expect(num(analogies[0]!['level'])).toBeCloseTo(
      ABSOLUTE_GATES.maxNeedsReviewRate + num(analogies[0]!['margin']),
      10,
    );
    expect(analogies[0]!['margin']).toBe(NON_INFERIORITY_MARGINS.falseNoOnGoldUnknownRate);
  });

  it('invents no margin for G1, and says so instead of inventing one', () => {
    const g1 = perMetric().find((row) => (row['gate'] as string).startsWith('G1'))!;
    expect(g1['margin']).toBeNull();
    expect(g1['level']).toBeNull();
    expect(g1['marginSource'] as string).toMatch(/NONE EXISTS/);
  });
});

describe('the original certified floor is REFUTED, not merely disliked', () => {
  it('shows the target-minus-0.10 floor never binds at a denominator worth acquiring', () => {
    const rows = arr('sectionC_D2.whyTheOriginalDerivationWasNotAccepted.objection2Evidence.rows');
    const evidence = obj('sectionC_D2.whyTheOriginalDerivationWasNotAccepted.objection2Evidence');
    const target = num(evidence['pointTarget']);
    const floor = num(evidence['floor']);
    expect(rows.length).toBeGreaterThanOrEqual(5);
    for (const row of rows) {
      const denominator = num(row['denominator']);
      const pointOnly = certificationBoundary({
        direction: 'higher is better',
        pointTarget: target,
        certificationLevel: null,
        denominator,
        alpha: 0.05,
      });
      const withFloor = certificationBoundary({
        direction: 'higher is better',
        pointTarget: target,
        certificationLevel: floor,
        denominator,
        alpha: 0.05,
      });
      expect(pointOnly.criticalCount, `point-only n=${denominator}`).toBe(
        row['criticalCountPointOnly'],
      );
      expect(withFloor.criticalCount, `with-floor n=${denominator}`).toBe(
        row['criticalCountWithFloor'],
      );
      // The refutation itself: adding the floor changes nothing.
      expect(withFloor.criticalCount).toBe(pointOnly.criticalCount);
      expect(row['floorBinds']).toBe(false);
    }
  });
});

describe('the D2 operating characteristics recompute exactly', () => {
  const table = () => obj('sectionC_D2.fourDesignsCompared.operatingCharacteristics');

  it('reproduces every published acceptance probability', () => {
    const spec = table();
    const target = num(spec['pointTarget']);
    const clustering = obj(
      'sectionC_D2.fourDesignsCompared.operatingCharacteristics.clusteringForD',
    );
    const rates = [0.9, 0.95, 0.975, 1.0];
    for (const row of arr('sectionC_D2.fourDesignsCompared.operatingCharacteristics.rows')) {
      const denominator = num(row['denominator']);
      const design = row['design'] as string;
      const delta = row['delta'] === undefined ? null : num(row['delta']);
      const rule: CertificationRule = {
        direction: 'higher is better',
        pointTarget: target,
        certificationLevel:
          design === 'D2_A' ? null : design === 'D2_B' ? target : target - (delta ?? 0),
        denominator,
        alpha: 0.05,
        ...(design === 'D2_D'
          ? {
              clustering: {
                averageClusterSize: num(clustering['averageClusterSize']),
                icc: num(clustering['icc']),
              },
            }
          : {}),
      };
      const boundary = certificationBoundary(rule);
      expect(boundary.criticalCount, `${design} n=${denominator} critical count`).toBe(
        row['criticalCount'],
      );
      const published = row['acceptance'] as readonly number[];
      rates.forEach((rate, index) => {
        expect(
          certificationAcceptanceProbability(rule, rate),
          `${design} n=${denominator} acceptance at ${rate}`,
        ).toBeCloseTo(published[index]!, 4);
      });
    }
  });

  it('confirms the declared design effect', () => {
    const clustering = obj(
      'sectionC_D2.fourDesignsCompared.operatingCharacteristics.clusteringForD',
    );
    expect(designEffect(num(clustering['averageClusterSize']), num(clustering['icc']))).toBeCloseTo(
      num(clustering['designEffect']),
      10,
    );
  });

  it('reproduces the non-monotonicity warning, so the warning is not rhetorical', () => {
    // Acceptance is NOT monotone in n for an exact discrete test.
    const at60 = certificationAcceptanceProbability(recommendedRule(0.95, 0.9, 60, 4), 0.975);
    const at70 = certificationAcceptanceProbability(recommendedRule(0.95, 0.9, 70, 4), 0.975);
    const at80 = certificationAcceptanceProbability(recommendedRule(0.95, 0.9, 80, 4), 0.975);
    expect(at70).toBeLessThan(at60);
    expect(at80).toBeGreaterThan(at60);
    expect(obj('sectionC_D2.fourDesignsCompared.operatingCharacteristics')['readingNote']).toMatch(
      /NOT monotone/,
    );
  });

  it('reproduces design B being unable to accept a candidate that exactly meets the bar', () => {
    for (const denominator of [60, 120, 200, 400]) {
      const rule: CertificationRule = {
        direction: 'higher is better',
        pointTarget: 0.95,
        certificationLevel: 0.95,
        denominator,
        alpha: 0.05,
      };
      expect(certificationAcceptanceProbability(rule, 0.95)).toBeLessThanOrEqual(0.05);
    }
  });
});

describe('the clustered-coverage simulation is frozen and exactly repeatable', () => {
  const simulation = () => obj('sectionC_D2.fourDesignsCompared.clusteredCoverage.simulation');

  function ruleFor(row: JsonObject): CertificationRule {
    const label = row['rule'] as string;
    const delta = label.includes('0.05') ? 0.05 : 0.1;
    const organisations = num(row['organisations']);
    const itemsPerOrganisation = num(row['itemsPerOrganisation']);
    return {
      direction: 'higher is better',
      pointTarget: 0.95,
      certificationLevel: 0.95 - delta,
      denominator: organisations * itemsPerOrganisation,
      alpha: 0.05,
      ...(label.startsWith('D2_D')
        ? { clustering: { averageClusterSize: itemsPerOrganisation, icc: 0.1 } }
        : {}),
    };
  }

  it('reproduces every published nominal and actual acceptance probability', () => {
    const spec = simulation();
    const seed = num(spec['seed']);
    const repetitions = num(spec['repetitions']);
    const trueRate = num(spec['trueRate']);
    for (const row of arr('sectionC_D2.fourDesignsCompared.clusteredCoverage.rows')) {
      const result = clusteredCoverage({
        rule: ruleFor(row),
        trueRate,
        organisations: num(row['organisations']),
        itemsPerOrganisation: num(row['itemsPerOrganisation']),
        icc: num(row['trueIcc']),
        repetitions,
        seed,
      });
      expect(result.independentAcceptanceProbability, `${row['rule']} nominal`).toBeCloseTo(
        num(row['nominal']),
        4,
      );
      expect(result.acceptanceProbability, `${row['rule']} actual`).toBeCloseTo(
        num(row['actual']),
        4,
      );
    }
  });

  it('is deterministic for the frozen seed and differs for another', () => {
    const rule = recommendedRule(0.95, 0.9, 120, 4);
    const base = {
      rule,
      trueRate: 0.9,
      organisations: 30,
      itemsPerOrganisation: 4,
      icc: 0.1,
      repetitions: 2000,
    };
    const a = clusteredCoverage({ ...base, seed: 20260918 });
    const b = clusteredCoverage({ ...base, seed: 20260918 });
    const c = clusteredCoverage({ ...base, seed: 7 });
    expect(a.acceptanceProbability).toBe(b.acceptanceProbability);
    expect(a.acceptanceProbability).not.toBe(c.acceptanceProbability);
  });

  it('shows the unclustered rule LOSING its nominal error rate, which is the whole argument', () => {
    for (const row of arr('sectionC_D2.fourDesignsCompared.clusteredCoverage.rows')) {
      // Under a clustered truth every rule accepts MORE often than its
      // nominal figure; the deflated rule is the one that stays bounded.
      expect(num(row['actual']), `${row['rule']} must exceed its nominal`).toBeGreaterThan(
        num(row['nominal']),
      );
    }
    const deflatedRows = arr('sectionC_D2.fourDesignsCompared.clusteredCoverage.rows').filter(
      (row) => (row['rule'] as string).startsWith('D2_D'),
    );
    for (const row of deflatedRows) {
      expect(num(row['actual']), 'the deflated rule stays under alpha').toBeLessThan(0.05);
    }
  });
});

describe('the SIXTH gate - the upper-bound NEEDS_REVIEW case', () => {
  it('is stated as an UPPER bound problem, not a lower one', () => {
    const g6 = arr(
      'sectionC_D2.fourDesignsCompared.sixGateRuleUnderTheRecommendedMethod.gates',
    ).find((gate) => gate['id'] === 'G6')!;
    expect(g6['direction']).toBe('lower is better');
    expect(g6['rule'] as string).toMatch(/UPPERBound/);
    expect(g6['directionOfUncertainty'] as string).toMatch(/UPPER confidence bound/);
    expect(g6['directionOfUncertainty'] as string).toMatch(/not an LCB problem/);
  });

  it('reproduces the minimum feasible denominator at each ceiling', () => {
    const minimums = obj(
      'sectionC_D2.fourDesignsCompared.sixGateRuleUnderTheRecommendedMethod.G6Detail.minimumFeasibleDenominator',
    );
    expect(minimumTrialsToCertifyCeiling(0.25)).toBe(num(minimums['ceiling_0.25']));
    expect(minimumTrialsToCertifyCeiling(0.15)).toBe(num(minimums['ceiling_0.15']));
    // And the minimum really is minimal: one fewer trial does not certify.
    for (const [ceiling, n] of [
      [0.25, num(minimums['ceiling_0.25'])],
      [0.15, num(minimums['ceiling_0.15'])],
    ] as const) {
      expect(clopperPearsonUpperBound(0, n)).toBeLessThanOrEqual(ceiling);
      expect(clopperPearsonUpperBound(0, n - 1)).toBeGreaterThan(ceiling);
    }
  });

  it('reproduces the historical denominator context, including the strictness inversion', () => {
    const context = obj(
      'sectionC_D2.fourDesignsCompared.sixGateRuleUnderTheRecommendedMethod.G6Detail.historicalDenominatorAsContextOnly',
    );
    const denominator = num(context['denominator']);
    const strict = ceilingGateFeasibility(0.15, denominator);
    const loose = ceilingGateFeasibility(0.25, denominator);
    expect(strict.bestAttainableUpperBound).toBeCloseTo(
      num(context['bestAttainableUpperBound']),
      4,
    );
    expect(strict.certifiableAtThisDenominator).toBe(context['certifiableAt_0.15']);
    expect(loose.certifiableAtThisDenominator).toBe(context['certifiableAt_0.25']);
    expect(strict.maxEventsStillCertifying).toBe(context['maxEventsStillCertifying_0.15']);
    expect(loose.maxEventsStillCertifying).toBe(context['maxEventsStillCertifying_0.25']);
    expect(strict.pointEstimateEventTolerance).toBe(context['pointEstimateEventTolerance_0.15']);

    // The inversion the document claims: certification is STRICTER than the
    // point gate here, and 7/49 is the observation that separates them.
    expect(strict.maxEventsStillCertifying!).toBeLessThan(strict.pointEstimateEventTolerance);
    expect(7 / 49).toBeLessThanOrEqual(0.15);
    expect(clopperPearsonUpperBound(7, 49)).toBeGreaterThan(0.25);
  });

  it('is the ONE frozen gate already certifiable at the historical denominator', () => {
    const rows = arr(
      'sectionK_feasibilityPrecondition.everyCurrentlyFrozenGateFailsThisCheck.atHistoricalDEVDenominators',
    );
    for (const row of rows) {
      expect(
        gateFeasibility(num(row['threshold']), num(row['denominator']))
          .certifiableAtThisDenominator,
        `${row['gate']}`,
      ).toBe(false);
    }
    const sixth = obj(
      'sectionK_feasibilityPrecondition.everyCurrentlyFrozenGateFailsThisCheck.theSixth',
    );
    expect(
      ceilingGateFeasibility(num(sixth['ceiling']), num(sixth['denominator']))
        .certifiableAtThisDenominator,
    ).toBe(true);
    expect(sixth['certifiable']).toBe(true);
  });
});

describe('the frozen-gate diagnosis recomputes, all six rows', () => {
  it('reproduces every best-attainable bound, trial count and point tolerance', () => {
    for (const row of arr(
      'sectionK_feasibilityPrecondition.everyCurrentlyFrozenGateFailsThisCheck.atHistoricalDEVDenominators',
    )) {
      const feasibility = gateFeasibility(num(row['threshold']), num(row['denominator']));
      expect(feasibility.bestAttainableLowerBound, `${row['gate']} bound`).toBeCloseTo(
        num(row['bestAttainableLowerBound']),
        4,
      );
      expect(feasibility.minimumTrialsForZeroErrorCertification, `${row['gate']} trials`).toBe(
        row['trialsNeeded'],
      );
      expect(feasibility.pointEstimateErrorTolerance, `${row['gate']} tolerance`).toBe(
        row['pointEstimateErrorTolerance'],
      );
      expect(minimumTrialsToCertify(num(row['threshold']))).toBe(row['trialsNeeded']);
    }
  });
});

describe('the corpus options are decidable: every published number recomputes', () => {
  const options = () => arr('sectionD_D3_corpusOptions.options');

  it('offers three options, one of which is named the minimum viable', () => {
    expect(options()).toHaveLength(3);
    const ids = options().map((option) => option['id']);
    expect(ids).toEqual(['CORPUS_OPTION_A', 'CORPUS_OPTION_B', 'CORPUS_OPTION_C']);
    const section = obj('sectionD_D3_corpusOptions');
    expect(ids).toContain(section['minimumViableOption']);
    expect(ids).toContain(section['recommendedOption']);
    const minimum = options().find((option) => option['id'] === section['minimumViableOption'])!;
    expect(minimum['isTheSmallestGenuinelyAdequateDesign']).toBe(true);
  });

  it('reproduces every derived gate profile in every option', () => {
    const levels: Readonly<Record<string, { target: number; level: number }>> = {
      G2: { target: 0.95, level: 0.9 },
      G3: { target: 0.9, level: 0.85 },
      G4: { target: 0.85, level: 0.75 },
      G5: { target: 0.9, level: 0.85 },
    };
    for (const option of options()) {
      for (const row of option['derivedGateProfile'] as readonly JsonObject[]) {
        const id = (row['gate'] as string).split(' ')[0]!;
        if (id === 'G1') continue;
        const denominator = num(row['denominator']);
        const cbar = num(row['cbar']);
        if (id === 'G6') {
          const rule = recommendedRule(0.15, 0.25, denominator, cbar, 'lower is better');
          const boundary = certificationBoundary(rule);
          expect(boundary.criticalCount, `${option['id']} G6 critical count`).toBe(
            row['criticalCount'],
          );
          expect(
            certificationAcceptanceProbability(rule, 0.2),
            `${option['id']} G6 false accept`,
          ).toBeCloseTo(num(row['falseAcceptAt_0.20']), 3);
          expect(
            certificationAcceptanceProbability(rule, 0.15),
            `${option['id']} G6 power at target`,
          ).toBeCloseTo(num(row['powerAt_0.15']), 3);
          expect(
            certificationAcceptanceProbability(rule, 0.125),
            `${option['id']} G6 power at 0.125`,
          ).toBeCloseTo(num(row['powerAt_0.125']), 3);
          continue;
        }
        const spec = levels[id]!;
        const rule = recommendedRule(spec.target, spec.level, denominator, cbar);
        const boundary = certificationBoundary(rule);
        expect(boundary.criticalCount, `${option['id']} ${id} critical count`).toBe(
          row['criticalCount'],
        );
        expect(denominator - boundary.criticalCount!, `${option['id']} ${id} tolerance`).toBe(
          row['errorTolerance'],
        );
        // The document tabulates the four true rates the revision asked
        // for, so the false-accept column sits at target - 0.05 - which is
        // NOT the certification level for a gate whose margin is 0.10.
        const falseAcceptKey = `falseAcceptAt_${(spec.target - 0.05).toFixed(2)}`;
        expect(
          certificationAcceptanceProbability(rule, spec.target - 0.05),
          `${option['id']} ${id} ${falseAcceptKey}`,
        ).toBeCloseTo(num(row[falseAcceptKey]), 3);
        // And the guarantee the rule actually makes: at the certification
        // level itself, acceptance never exceeds alpha.
        expect(
          certificationAcceptanceProbability(rule, spec.level),
          `${option['id']} ${id} acceptance at its own certification level`,
        ).toBeLessThanOrEqual(0.05);
        expect(
          certificationAcceptanceProbability(rule, spec.target),
          `${option['id']} ${id} power at target`,
        ).toBeCloseTo(num(row[`powerAt_${spec.target}`]), 3);
        expect(
          certificationAcceptanceProbability(rule, spec.target + 0.025),
          `${option['id']} ${id} power at target + 0.025`,
        ).toBeCloseTo(num(row[`powerAt_${spec.target + 0.025}`]), 3);
      }
    }
  });

  it('proves the feasibility precondition mechanically for every option: K1 and K2', () => {
    for (const option of options()) {
      for (const row of option['derivedGateProfile'] as readonly JsonObject[]) {
        const id = (row['gate'] as string).split(' ')[0]!;
        if (id === 'G1') {
          // The ONE declared zero-tolerance exception, and it says so.
          expect(row['rule']).toBe('zero-tolerance');
          expect(row['feasible']).toBe(true);
          continue;
        }
        const tolerance = row['errorTolerance'] ?? row['eventTolerance'];
        expect(
          num(tolerance),
          `${option['id']} ${id} must tolerate at least one error`,
        ).toBeGreaterThanOrEqual(1);
      }
      expect(option['everyGateMathematicallyFeasible']).toBe(true);
      expect(option['organisationClusteredUncertaintyEstimable']).toBe(true);
    }
  });

  it('keeps the two gated splits equal in size, since HOLDOUT is the binding test', () => {
    for (const option of options()) {
      const organisations = option['organisations'] as JsonObject;
      expect(organisations['DEV_CONFIRM'], `${option['id']}`).toBe(organisations['FINAL_HOLDOUT']);
      const total =
        num(organisations['DEV_TRAIN']) +
        num(organisations['DEV_CONFIRM']) +
        num(organisations['FINAL_HOLDOUT']);
      expect(total, `${option['id']} organisation total`).toBe(num(organisations['total']));
    }
  });

  it('honours the per-organisation caps it declares', () => {
    const caps = obj('sectionD_D3_corpusOptions.commonToAllThreeOptions.perOrganisationCaps');
    for (const option of options()) {
      const organisations = num((option['organisations'] as JsonObject)['DEV_CONFIRM']);
      const perSplit = option['perGatedSplit'] as JsonObject;
      expect(num(perSplit['SET_P']), `${option['id']} SET_P within cap`).toBeLessThanOrEqual(
        organisations * num(caps['SET_P']),
      );
      expect(
        num(perSplit['SET_R_goldUnitPages']),
        `${option['id']} SET_R within cap`,
      ).toBeLessThanOrEqual(organisations * num(caps['SET_R']));
    }
  });

  it('grows monotonically in cost and in the binding recall denominator', () => {
    const recallDenominator = (option: JsonObject): number =>
      num(
        (option['derivedGateProfile'] as readonly JsonObject[]).find((row) =>
          (row['gate'] as string).startsWith('G2'),
        )!['denominator'],
      );
    const [a, b, c] = options();
    expect(recallDenominator(a!)).toBeLessThan(recallDenominator(b!));
    expect(recallDenominator(b!)).toBeLessThan(recallDenominator(c!));
    expect(num((a!['organisations'] as JsonObject)['total'])).toBeLessThan(
      num((b!['organisations'] as JsonObject)['total']),
    );
    expect(num((b!['organisations'] as JsonObject)['total'])).toBeLessThan(
      num((c!['organisations'] as JsonObject)['total']),
    );
  });
});

describe('replication: N = 5 is answered, not inherited', () => {
  it('proves more items beats more replicates at a fixed inference budget', () => {
    // The claim holds for EVERY positive pair of variance components, so it
    // needs no measurement of either. Sampled widely rather than asserted.
    for (const between of [0.01, 0.05, 0.1, 0.25]) {
      for (const within of [0.01, 0.05, 0.1, 0.25]) {
        const budget = 600;
        let previous = Number.NEGATIVE_INFINITY;
        for (const replicates of [1, 2, 3, 5, 6]) {
          const decomposition = estimatorVarianceDecomposition({
            betweenItemVariance: between,
            withinItemVariance: within,
            items: budget / replicates,
            replicates,
          });
          expect(decomposition.inferenceBudget).toBe(budget);
          expect(decomposition.total).toBeGreaterThan(previous);
          previous = decomposition.total;
        }
      }
    }
  });

  it('records the answer as NO and does not preserve N = 5 by inertia', () => {
    const replication = obj(
      'sectionL_replicationAndStochasticity.isFullNFiveReplicationStillNecessary',
    );
    expect(replication['answer']).toBe('NO');
    expect(replication['fiveRepeatedModelCallsAreNotFiveIndependentDatasets']).toBe(true);
    const structures = replication['alternativeStructuresCompared'] as readonly JsonObject[];
    const fullReplicates = structures.find((row) =>
      (row['structure'] as string).includes('multiple full replicates'),
    )!;
    expect(fullReplicates['verdict'] as string).toMatch(/^rejected/);
  });

  it('reproduces the declared inference-budget comparison', () => {
    const comparison = obj(
      'sectionL_replicationAndStochasticity.isFullNFiveReplicationStillNecessary.costComparisonAtCorpusOptionB',
    );
    const frozen = comparison['frozenDesign_NEqualsFive'] as JsonObject;
    expect(num(frozen['inferencesPerGatedSplit'])).toBe(
      num(frozen['itemsPerSplit']) * num(frozen['replicates']),
    );
    const stability = obj(
      'sectionL_replicationAndStochasticity.isFullNFiveReplicationStillNecessary.whatReplacesIt.stabilitySubset',
    );
    const r1Design = comparison['R1Design'] as JsonObject;
    const expected =
      num(r1Design['itemsPerSplit']) +
      (num(stability['replicatesOnTheSubset']) - 1) * num(stability['size']);
    expect(num(r1Design['inferencesPerGatedSplit'])).toBe(expected);
  });

  it('keeps the catastrophic-replicate rule explicit but does not freeze it', () => {
    const rule = obj('sectionL_replicationAndStochasticity.noCatastrophicReplicateRule');
    expect(rule['status'] as string).toMatch(/NOT RECOMMENDED FOR FREEZE/);
    for (const required of [
      'whatConstitutesCatastrophic',
      'operatesPer',
      'substantiveJustification',
      'interactionWithTheAggregateStatisticalRule',
      'whyNotRecommendedForFreeze',
    ]) {
      expect(typeof rule[required], `${required} must be stated`).toBe('string');
    }
    // The reason it is not frozen is itself arithmetic: on the stability
    // subset the recall gate would be zero-tolerance again.
    const stability = obj(
      'sectionL_replicationAndStochasticity.isFullNFiveReplicationStillNecessary.whatReplacesIt.stabilitySubset',
    );
    const subsetBoundary = certificationBoundary(
      recommendedRule(0.95, 0.9, num(stability['size']), 4),
    );
    expect(subsetBoundary.criticalCount).toBe(num(stability['size']));
  });
});

describe('the historical HOLDOUT is retired, and the boundary event is named honestly', () => {
  it('classifies the event precisely and refuses both euphemisms', () => {
    const event = obj('sectionB_existingHoldout.disclosedEvent');
    expect(event['classification']).toBe(
      'PROCEDURAL_HOLDOUT_ACCESS_WITHOUT_ITEM_LEVEL_SEMANTIC_DISCLOSURE',
    );
    expect(event['notCalled']).toEqual(['no access', 'item-level leakage']);
    expect(event['holdoutInferenceRun']).toBe(false);
    expect(event['holdoutLabelsRead']).toBe(false);
  });

  it('retires the historical holdout rather than adjudicating it', () => {
    const disposition = obj('sectionB_existingHoldout.dispositionForMethodologyV2');
    expect(disposition['existingHistoricalHoldout']).toBe('HISTORICAL_EVALUATION_ONLY');
    expect(disposition['eligibleAsFinalHoldout']).toBe(false);
    expect(disposition['notInspectedInThisTask']).toBe(true);
  });

  it('makes FINAL_HOLDOUT strictly one-shot, replacing the multiplicity budget of 3', () => {
    const oneShot = obj('sectionH_finalHoldoutSeal.oneShotSemantics');
    expect(oneShot['noRepeatedHoldoutAttempts']).toBe(true);
    expect(oneShot['supersedesTheOriginalProposal'] as string).toMatch(
      /REPLACED by strict one-shot/,
    );
    const holdoutSplit = arr('sectionJ_splitsAndTheHistoricalCorpus.splits').find(
      (split) => split['name'] === 'FINAL_HOLDOUT',
    )!;
    expect(holdoutSplit['scoringBudget']).toBe(1);
    expect(holdoutSplit['sealed']).toBe(true);
  });

  it('keeps the DEV_CONFIRM budget at the owner-approved three', () => {
    expect(obj('sectionG_confirmationSealing.budget')['candidatesPerMethodologyGeneration']).toBe(
      3,
    );
    const confirm = arr('sectionJ_splitsAndTheHistoricalCorpus.splits').find(
      (split) => split['name'] === 'DEV_CONFIRM',
    )!;
    expect(confirm['scoringBudget']).toBe(3);
  });
});

describe('sealing, sampling and gold policy are stated in decidable form', () => {
  it('returns no item-level information after a failed confirmation', () => {
    const feedback = obj(
      'sectionG_confirmationSealing.whatAPromptDeveloperSeesAfterAFailedDEV_CONFIRMCandidate',
    );
    expect(feedback['isThisTheDefault']).toBe(true);
    const forbidden = feedback['forbidden'] as readonly string[];
    for (const required of ['item IDs', 'URLs and titles', 'per-item gold labels']) {
      expect(forbidden).toContain(required);
    }
    expect(feedback['richerFeedbackJustification'] as string).toMatch(/NOT proposed/);
  });

  it('answers all eight sampling questions the revision asked for', () => {
    const rules = arr('sectionE_sampling.rules');
    expect(rules).toHaveLength(8);
    expect(rules.map((rule) => rule['id'])).toEqual([
      'SD1',
      'SD2',
      'SD3',
      'SD4',
      'SD5',
      'SD6',
      'SD7',
      'SD8',
    ]);
    expect(obj('sectionE_sampling')['samplingUnitIsTheOrganisation']).toBe(true);
    expect(obj('sectionE_sampling')['aPageIsNotAnIndependentTopLevelSample']).toBe(true);
  });

  it('keeps every prevalence-dependent metric off the enriched sample', () => {
    const classification = arr('sectionF_prevalenceAndEnrichment.metricClassification');
    expect(classification).toHaveLength(6);
    for (const row of classification) {
      if ((row['class'] as string).startsWith('PREVALENCE-DEPENDENT')) {
        expect(row['estimatedOn'], `${row['gate']} must not use SET_R`).toBe('SET_P ONLY');
      }
    }
    expect(obj('sectionF_prevalenceAndEnrichment')['everyWeightingRuleIsPreRegisterable']).toBe(
      true,
    );
  });

  it('requires dual review on exactly the two gated splits', () => {
    const scope = obj('sectionI_goldPolicy.whichSplitsRequireDualReview');
    expect(scope['DEV_TRAIN'] as string).toMatch(/^NO/);
    expect(scope['DEV_CONFIRM'] as string).toMatch(/^YES/);
    expect(scope['FINAL_HOLDOUT'] as string).toMatch(/^YES/);
    const process = obj('sectionI_goldPolicy.minimumDefensibleDualReviewProcess');
    expect(process['ownerNeedNotBeOneOfTheTwoReviewers']).toBe(true);
    expect(process['secondReviewerMustBeHuman'] as string).toMatch(/No model output/);
    for (const step of [
      'step1_independentFirstLabels',
      'step2_blindSecondReview',
      'step3_deterministicAgreementRecord',
      'step4_disagreementResolution',
    ]) {
      expect(typeof process[step], `${step} must be stated`).toBe('string');
    }
  });

  it('keeps the splits organisation-disjoint and the historical set diagnostic only', () => {
    expect(obj('sectionJ_splitsAndTheHistoricalCorpus')['disjointness'] as string).toMatch(
      /STRICTLY ORGANISATION-DISJOINT/,
    );
    const historical = obj('sectionJ_splitsAndTheHistoricalCorpus.historicalDevelopmentSet');
    expect(historical['becomes']).toBe('DEV_TRAIN_DIAGNOSTIC_ONLY');
    expect(historical['mayEverAgainCertifyARuntimeCandidate']).toBe(false);
  });

  it('never lets an unmeasured or vacuous gate pass', () => {
    const invariants = obj('sectionM_acceptanceRuleShape.invariants');
    expect(invariants['unmeasuredGateIsNeverAPassedGate']).toBe(true);
    expect(invariants['vacuousGateIsInadmissibleNeverAPass']).toBe(true);
    expect(invariants['noThresholdTuningAfterOutcomes']).toBe(true);
    expect(invariants['noPromptTuningAfterOutcomes']).toBe(true);
    expect(at('sectionM_acceptanceRuleShape.outcomes')).toEqual([
      'ACCEPT',
      'REJECT',
      'INADMISSIBLE',
    ]);
  });

  it('states its unknowns as UNKNOWN rather than resolving them by inference', () => {
    const unknowns = at('openUnknowns') as readonly string[];
    expect(unknowns.length).toBeGreaterThanOrEqual(8);
    for (const unknown of unknowns) expect(unknown).toMatch(/^UNKNOWN:/);
  });
});
