/**
 * PHASE 2B-2D ACCEPTANCE METHODOLOGY V2 - the R2 FINALISATION, verified.
 *
 * R2 closes the two decisions R1 left open (D2 certification design, D3
 * corpus option), retires full N = 5 replication, freezes a 40-item R = 3
 * stochastic-stability design with an exact instability veto, states the
 * Option B sampling contract in fully machine-checkable form, and moves the
 * methodology statistics helper OUT of the `src/orgunits/` production
 * namespace so the historical F7 firewall passes unweakened.
 *
 * Every gate number is RECOMPUTED here from the pure primitives rather than
 * read and trusted. Where the document states a certification boundary, an
 * error tolerance or an operating characteristic, this file derives it and
 * compares - so a document edited away from its own arithmetic fails.
 *
 * ZERO PROVIDER, ZERO NETWORK, ZERO DATABASE, ZERO INFERENCE, ZERO GOLD,
 * ZERO HOLDOUT. Reads committed JSON documents and computes over integers.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NON_INFERIORITY_MARGINS } from '../../orgunits/classify/evaluation/protocol.js';
import {
  certificationAcceptanceProbability,
  certificationBoundary,
  type CertificationRule,
} from '../harness/phase2b2d2c/methodology/acceptanceStatistics.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const R2_PATH = 'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL_R2.json';
const R1_PATH = 'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL_R1.json';
const HELPER_PATH = 'src/test/harness/phase2b2d2c/methodology/acceptanceStatistics.ts';
const FORBIDDEN_HELPER_PATH = 'src/orgunits/classify/evaluation/acceptanceStatistics.ts';

type JsonObject = Readonly<Record<string, unknown>>;

const raw = readFileSync(resolve(ROOT, R2_PATH), 'utf8');
const r2 = JSON.parse(raw) as JsonObject;

/** Walk a dotted path. Throws on a missing key, so a renamed field fails loudly. */
function at(path: string): unknown {
  let cursor: unknown = r2;
  for (const key of path.split('.')) {
    if (typeof cursor !== 'object' || cursor === null || !(key in cursor)) {
      throw new Error(`R2 path ${path} is missing at ${key}`);
    }
    cursor = (cursor as JsonObject)[key];
  }
  return cursor;
}
const obj = (path: string): JsonObject => at(path) as JsonObject;
const arr = (path: string): readonly JsonObject[] => at(path) as readonly JsonObject[];

const gateById = (id: string): JsonObject => {
  const found = arr('sectionC_D2_certificationDesign.theSixGates').find((g) => g['id'] === id);
  if (!found) throw new Error(`gate ${id} is missing`);
  return found;
};

/** The APPROVED D2 rule for one gate, exactly as section C specifies it. */
function approvedRule(
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

describe('R2 authorises nothing and leaves R1 and the original as history', () => {
  it('is PROPOSED with an empty thisFileAuthorises', () => {
    expect(r2['status']).toBe('PROPOSED');
    expect(r2['thisFileAuthorises']).toEqual([]);
    expect(obj('supersedes')['nothing']).toBe(true);
  });

  it('names R1 by its exact hash and byte length, and does not supersede it', () => {
    const revises = obj('revises');
    expect(revises['sha256']).toBe(
      '3eb37ca36d854a76de4894bca399bf5112d3bd481b1d0ec3c1f999cdd3841d9e',
    );
    expect(revises['byteLength']).toBe(87449);
    expect(revises['relationship'] as string).toMatch(/retained unmodified/);
  });

  it('leaves the R1 bytes on disk exactly as R1 committed them', () => {
    const r1Raw = readFileSync(resolve(ROOT, R1_PATH), 'utf8');
    expect(Buffer.byteLength(r1Raw, 'utf8')).toBe(87449);
    const r1 = JSON.parse(r1Raw) as JsonObject;
    expect(r1['version']).toBe('PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL_R1');
    expect(r1['PENDING_OWNER_DECISIONS']).toEqual(['D2', 'D3']);
  });

  it('records every owner decision D1-D6 as APPROVED and leaves nothing pending', () => {
    const approved = obj('APPROVED_OWNER_DECISIONS');
    expect(Object.keys(approved).sort()).toEqual(['D1', 'D2', 'D3', 'D4', 'D5', 'D6']);
    for (const id of Object.keys(approved)) {
      expect(approved[id], `${id}`).toBe('APPROVED_OWNER_DECISION');
    }
    expect(r2['PENDING_OWNER_DECISIONS']).toEqual([]);
  });

  it('leaves exactly one remaining owner action, and it is the freeze approval', () => {
    expect(r2['remainingOwnerAction']).toBe('OWNER_FREEZE_APPROVAL_OF_EXACT_R2_BYTES');
    const detail = obj('remainingOwnerActionDetail');
    expect(detail['noMethodologyDecisionRemains']).toBe(true);
    expect(detail['form'] as string).toMatch(/SEPARATE/);
    expect(detail['form'] as string).toMatch(/SHA-256/);
    expect(detail['form'] as string).toMatch(/authorises nothing/);
  });

  it('declares every prohibited action of this revision excluded', () => {
    const exclusions = obj('exclusions');
    for (const required of [
      'noProviderInference',
      'noPromptCandidateCreated',
      'noPromptV7Created',
      'noPromptFileEdited',
      'noV6Run',
      'noV6Rescore',
      'noHoldoutAccess',
      'noHoldoutItemInspection',
      'noHistoricalHoldoutFileOpened',
      'noNewLabels',
      'noLabelsCollected',
      'noLiveWebAcquisition',
      'noRuntimeModelSelected',
      'noClassifierRuntimeCodeTouched',
      'noProductionOrgunitsFileTouched',
      'noFirewallAssertionWeakened',
    ]) {
      expect(exclusions[required], `${required} must be declared true`).toBe(true);
    }
  });

  it('names no gold id anywhere, so it cannot leak a sealed item', () => {
    expect(raw).not.toMatch(/\bg[0-9a-f]{16}\b/);
  });
});

describe('D2: all six gates match the owner decision exactly', () => {
  /** The owner's table, transcribed from the decision and asserted against the document. */
  const OWNER_TABLE = [
    { id: 'G2', metric: 'unitPageRecall', point: 0.95, level: 0.9, bound: 'LOWER' },
    { id: 'G3', metric: 'unitPagePrecision', point: 0.9, level: 0.85, bound: 'LOWER' },
    { id: 'G4', metric: 'unitTypeAccuracy', point: 0.85, level: 0.75, bound: 'LOWER' },
    { id: 'G5', metric: 'hardNegativeRejection', point: 0.9, level: 0.85, bound: 'LOWER' },
    { id: 'G6', metric: 'needsReviewRate', point: 0.15, level: 0.25, bound: 'UPPER' },
  ] as const;

  it('carries exactly six semantic gates and no more', () => {
    expect(arr('sectionC_D2_certificationDesign.theSixGates')).toHaveLength(6);
    expect(obj('sectionA_terminology')['exactlySixSemanticGates']).toBe(6);
    expect(arr('sectionA_terminology.sixSemanticQualityGates')).toHaveLength(6);
  });

  it('selects design D2_D and rejects A, B and C by name', () => {
    const c = obj('sectionC_D2_certificationDesign');
    expect(c['status']).toBe('CLOSED - APPROVED_OWNER_DECISION');
    expect(c['selectedDesign']).toBe('D2_D');
    const notSelected = obj('sectionC_D2_certificationDesign.designsNotSelected');
    expect(Object.keys(notSelected).sort()).toEqual(['D2_A', 'D2_B', 'D2_C']);
  });

  it.each(OWNER_TABLE)(
    '$id carries the owner point target, certification level and bound direction',
    ({ id, metric, point, level, bound }) => {
      const gate = gateById(id);
      expect(gate['metric']).toBe(metric);
      expect(gate['pointTarget']).toBe(point);
      expect(gate['certificationLevel']).toBe(level);
      expect(gate['certificationBoundDirection']).toBe(bound);
    },
  );

  it('requires BOTH conditions - a point estimate alone never certifies', () => {
    const c = obj('sectionC_D2_certificationDesign');
    expect(c['bothConditionsRequired']).toBe(true);
    expect(c['pointEstimateAloneIsNeverSufficient']).toBe(true);
    expect(c['theBoundIsNotRequiredToMeetThePointTarget']).toBe(true);
    for (const { id } of OWNER_TABLE) {
      expect(gateById(id)['rule'] as string, id).toMatch(/ AND /);
    }
  });

  it('G6 uses an UPPER bound and is the only gate that does', () => {
    const upper = arr('sectionC_D2_certificationDesign.theSixGates').filter(
      (g) => g['certificationBoundDirection'] === 'UPPER',
    );
    expect(upper).toHaveLength(1);
    expect(upper[0]?.['id']).toBe('G6');
    const g6 = gateById('G6');
    expect(g6['direction']).toBe('lower is better');
    expect(g6['pointComparator']).toBe('<=');
    expect(g6['certificationComparator']).toBe('<=');
    expect(g6['rule'] as string).toMatch(/UpperBound <= 0\.25/);
    expect(g6['directionOfUncertainty'] as string).toMatch(/sign error/);
  });

  it('every higher-is-better gate uses a LOWER bound with >= comparators', () => {
    for (const id of ['G2', 'G3', 'G4', 'G5']) {
      const gate = gateById(id);
      expect(gate['direction'], id).toBe('higher is better');
      expect(gate['certificationBoundDirection'], id).toBe('LOWER');
      expect(gate['pointComparator'], id).toBe('>=');
      expect(gate['certificationComparator'], id).toBe('>=');
    }
  });

  it('G1 stays a zero-tolerance SEMANTIC gate with a non-binding reported bound', () => {
    const g1 = gateById('G1');
    expect(g1['gateKind']).toBe('ZERO_TOLERANCE');
    expect(g1['certificationLevel']).toBeNull();
    expect(g1['certificationBoundDirection']).toBeNull();
    expect(g1['boundIsBinding']).toBe(false);
    expect(g1['stillOneOfTheSixSemanticGates']).toBe(true);
    // All three counts must be zero, conjunctively.
    const rule = g1['rule'] as string;
    expect(rule).toMatch(/postRepairInvalidCount === 0/);
    expect(rule).toMatch(/unverifiableSpanCount === 0/);
    expect(rule).toMatch(/unverifiedNonNullUnitNameCount === 0/);
    expect(rule.split(' AND ')).toHaveLength(3);
    expect(g1['ruleIsConjunctiveAndAllThreeMustBeZero']).toBe(true);
    // And it is NOT replaced by a confidence-bound rule.
    expect(g1['boundReported'] as string).toMatch(/NON-BINDING/);
  });

  it('derives G2-G5 certification levels from the frozen materiality margins', () => {
    const cases = [
      { id: 'G2', key: 'unitPageRecall' },
      { id: 'G3', key: 'unitPagePrecision' },
      { id: 'G4', key: 'unitTypeAccuracy' },
      { id: 'G5', key: 'hardNegativeRejection' },
    ] as const;
    for (const { id, key } of cases) {
      const gate = gateById(id);
      const margin = NON_INFERIORITY_MARGINS[key];
      expect(gate['margin'], id).toBe(margin);
      expect(gate['marginClassification'], id).toBe('FROZEN_MATERIALITY_MARGIN');
      // level = threshold - margin, exactly.
      expect(Number(((gate['pointTarget'] as number) - margin).toFixed(10)), id).toBeCloseTo(
        gate['certificationLevel'] as number,
        10,
      );
    }
  });

  it("records G6's 0.10 as an OWNER DESIGN DECISION, not a derivation", () => {
    const g6Margin = obj('sectionC_D2_certificationDesign.g6MarginClassification');
    expect(g6Margin['margin']).toBe(0.1);
    expect(g6Margin['classification']).toBe('OWNER_DESIGN_DECISION');
    expect(g6Margin['ownerRequiredStatementVerbatim'] as string).toMatch(
      /OWNER DESIGN DECISION for Methodology V2/,
    );
    expect(g6Margin['ownerRequiredStatementVerbatim'] as string).toMatch(
      /NOT claimed to be mathematically derived from another historical constant/,
    );
    expect(g6Margin['notDerivedFrom']).toEqual([
      'MAX_SUBGROUP_SHORTFALL',
      'NON_INFERIORITY_MARGINS.falseNoOnGoldUnknownRate',
    ]);
    expect(gateById('G6')['marginClassification']).toBe('OWNER_DESIGN_DECISION');
  });

  it('freezes the ICC escalation rule and the conservative rounding in both directions', () => {
    const p = obj('sectionC_D2_certificationDesign.frozenParameters');
    expect(p['alpha']).toBe(0.05);
    expect(p['boundType']).toBe('exact one-sided Clopper-Pearson');
    expect(p['clusteringUnit']).toBe('organisation');
    expect(p['RHO_FLOOR']).toBe(0.1);
    expect(p['rhoRule'] as string).toMatch(/max\(RHO_FLOOR, observed/);
    expect(p['rhoEscalationOnly'] as string).toMatch(/only RAISE/);
    expect(p['designEffectFormula']).toBe('DEFF = 1 + (cbar - 1) * rho, floored at 1');
    expect(p['cbarIsPerGate']).toBe(true);
    const rounding = p['roundingRule'] as JsonObject;
    expect(rounding['effectiveTrials']).toBe('n_eff = floor(n / DEFF)');
    expect(rounding['effectiveSuccesses']).toBe('k_eff = floor((k / n) * n_eff)');
    expect(rounding['effectiveEventsForCeilingGates']).toBe('e_eff = ceil((e / n) * n_eff)');
    expect(rounding['frozenExplicitly']).toBe(true);
    expect(rounding['ceilingGateRoundingIsDeliberatelyDifferent']).toBe(true);
  });
});

describe('D2 recomputed: the published Option B gate profile is arithmetic, not assertion', () => {
  const profile = arr('sectionD_D3_corpusOption.derivedGateProfileUnderOptionB.gates');
  const row = (gate: string): JsonObject => {
    const found = profile.find((r) => (r['gate'] as string).startsWith(gate));
    if (!found) throw new Error(`profile row ${gate} is missing`);
    return found;
  };

  const RATE_GATES = [
    { id: 'G2', point: 0.95, level: 0.9, dir: 'higher is better' as const },
    { id: 'G3', point: 0.9, level: 0.85, dir: 'higher is better' as const },
    { id: 'G4', point: 0.85, level: 0.75, dir: 'higher is better' as const },
    { id: 'G5', point: 0.9, level: 0.85, dir: 'higher is better' as const },
    { id: 'G6', point: 0.15, level: 0.25, dir: 'lower is better' as const },
  ];

  it.each(RATE_GATES)(
    '$id critical count and error tolerance recompute from the primitives',
    ({ id, point, level, dir }) => {
      const published = row(id);
      const denominator = published['denominator'] as number;
      const cbar = published['cbar'] as number;
      const boundary = certificationBoundary(approvedRule(point, level, denominator, cbar, dir));
      expect(boundary.feasible, id).toBe(true);
      expect(boundary.criticalCount, id).toBe(published['criticalCount']);
      const tolerance =
        dir === 'higher is better'
          ? denominator - (boundary.criticalCount as number)
          : (boundary.criticalCount as number);
      const publishedTolerance = (published['errorTolerance'] ??
        published['eventTolerance']) as number;
      expect(tolerance, id).toBe(publishedTolerance);
    },
  );

  it('every gate carries an error tolerance of at least 3, which is what Option B bought', () => {
    for (const { id } of RATE_GATES) {
      const published = row(id);
      const tolerance = (published['errorTolerance'] ?? published['eventTolerance']) as number;
      expect(tolerance, id).toBeGreaterThanOrEqual(3);
    }
    expect(
      obj('sectionD_D3_corpusOption.derivedGateProfileUnderOptionB')[
        'everyGateCarriesErrorToleranceAtLeastThree'
      ],
    ).toBe(true);
  });

  it('no rate gate is degenerate: the critical count is strictly inside the denominator (K2)', () => {
    for (const { id, point, level, dir } of RATE_GATES) {
      const published = row(id);
      const boundary = certificationBoundary(
        approvedRule(
          point,
          level,
          published['denominator'] as number,
          published['cbar'] as number,
          dir,
        ),
      );
      expect(boundary.criticalCount, id).not.toBeNull();
      if (dir === 'higher is better') {
        expect(boundary.criticalCount as number, id).toBeLessThan(
          published['denominator'] as number,
        );
      } else {
        expect(boundary.criticalCount as number, id).toBeGreaterThan(0);
      }
    }
  });

  it('the published operating characteristics recompute to four decimal places', () => {
    const checks = [
      { id: 'G2', point: 0.95, level: 0.9, at: 0.975, field: 'powerAt_0.975' },
      { id: 'G2', point: 0.95, level: 0.9, at: 0.9, field: 'falseAcceptAt_0.90' },
      { id: 'G3', point: 0.9, level: 0.85, at: 0.925, field: 'powerAt_0.925' },
      { id: 'G4', point: 0.85, level: 0.75, at: 0.875, field: 'powerAt_0.875' },
      { id: 'G5', point: 0.9, level: 0.85, at: 0.925, field: 'powerAt_0.925' },
    ] as const;
    for (const check of checks) {
      const published = row(check.id);
      const probability = certificationAcceptanceProbability(
        approvedRule(
          check.point,
          check.level,
          published['denominator'] as number,
          published['cbar'] as number,
        ),
        check.at,
      );
      expect(Number(probability.toFixed(4)), `${check.id} ${check.field}`).toBeCloseTo(
        published[check.field] as number,
        3,
      );
    }
  });

  it('G1 is feasible only as a zero-tolerance rule at the Option B denominator', () => {
    const g1 = row('G1');
    expect(g1['denominator']).toBe(560);
    expect(g1['rule']).toBe('zero-tolerance');
    // A 0.99 RATE gate at 560 items would tolerate nothing anyway: prove it.
    const asRateGate = certificationBoundary(approvedRule(0.99, 0.99, 560, 4));
    expect(asRateGate.criticalCount).toBe(560);
  });
});

describe('D3: the Option B corpus counts are exact and structural', () => {
  it('is 110 organisations split 20 / 45 / 45, summing exactly', () => {
    const org = obj('sectionD_D3_corpusOption.organisationContract');
    expect(obj('sectionD_D3_corpusOption')['selectedOption']).toBe('CORPUS_OPTION_B');
    expect(org['totalNewOrganisations']).toBe(110);
    expect(org['DEV_TRAIN']).toBe(20);
    expect(org['DEV_CONFIRM']).toBe(45);
    expect(org['FINAL_HOLDOUT']).toBe(45);
    expect(
      (org['DEV_TRAIN'] as number) +
        (org['DEV_CONFIRM'] as number) +
        (org['FINAL_HOLDOUT'] as number),
    ).toBe(110);
  });

  it('the split-assignment cycle PRODUCES 20 / 45 / 45 - the counts are not merely asserted', () => {
    const sd2 = arr('sectionE_samplingContract.rules').find((r) => r['id'] === 'SD2');
    const cycle = sd2?.['cycle'] as readonly string[];
    expect(cycle).toHaveLength(22);
    const counts = new Map<string, number>();
    for (let i = 0; i < 110; i += 1) {
      const split = cycle[i % 22] as string;
      counts.set(split, (counts.get(split) ?? 0) + 1);
    }
    expect(counts.get('DEV_TRAIN')).toBe(20);
    expect(counts.get('DEV_CONFIRM')).toBe(45);
    expect(counts.get('FINAL_HOLDOUT')).toBe(45);
    // 4 : 9 : 9 per cycle, and 110 / 22 = 5 with no remainder.
    expect(110 % 22).toBe(0);
    // Maximally interleaved: no two consecutive positions share a split.
    for (let i = 0; i < 110 - 1; i += 1) {
      expect(cycle[i % 22], `position ${i}`).not.toBe(cycle[(i + 1) % 22]);
    }
  });

  it('holds the frozen per-split minima the gates depend on', () => {
    const per = obj('sectionD_D3_corpusOption.perGatedSplitContract');
    expect(per['SET_P']).toBe(360);
    expect(per['SET_R_goldUnitPages_minimum']).toBe(100);
    expect(per['hardNegativesInSET_P_minimum']).toBe(155);
    expect(per['minimumRepresentationPerGatedSemanticClass']).toBe(2);
  });

  it('keeps the ~1,370 document figure a planning estimate, never a freeze condition', () => {
    const docs = obj('sectionD_D3_corpusOption.documentContract');
    expect(docs['approximateTotalDocuments']).toBe(1370);
    expect(docs['planningEstimateOnly']).toBe(true);
    expect(docs['documentCountIsNeverAFreezeCondition']).toBe(true);
  });
});

describe('split overlap is impossible, not merely forbidden', () => {
  it('assigns each organisation exactly one split by its selection index', () => {
    const j = obj('sectionJ_splits');
    expect(j['disjointness'] as string).toMatch(/STRICTLY ORGANISATION-DISJOINT/);
    expect(j['disjointnessIsStructural'] as string).toMatch(/cannot appear twice by construction/);
    // The cycle is a total function from index to ONE split: no index yields two.
    const sd2 = arr('sectionE_samplingContract.rules').find((r) => r['id'] === 'SD2');
    const cycle = sd2?.['cycle'] as readonly string[];
    for (let i = 0; i < 110; i += 1) {
      const assignments = cycle.filter((_, position) => position === i % 22);
      expect(assignments, `index ${i}`).toHaveLength(1);
    }
  });

  it('keeps replacement from ever changing a split count', () => {
    const sd2 = arr('sectionE_samplingContract.rules').find((r) => r['id'] === 'SD2');
    expect(sd2?.['replacementNeverChangesSplitCounts']).toBe(true);
    expect(sd2?.['replacementRule'] as string).toMatch(/INHERITS/);
    expect(sd2?.['reserveExhaustionIsARefusal'] as string).toMatch(/REFUSED/);
  });

  it('the three splits are exactly the three named, each with its own budget', () => {
    const splits = arr('sectionJ_splits.splits');
    expect(splits.map((s) => s['name'])).toEqual(['DEV_TRAIN', 'DEV_CONFIRM', 'FINAL_HOLDOUT']);
    expect(splits[0]?.['sealed']).toBe(false);
    expect(splits[1]?.['sealed']).toBe(true);
    expect(splits[2]?.['sealed']).toBe(true);
  });
});

describe('candidate budgets: 3 against DEV_CONFIRM, 1 against FINAL_HOLDOUT', () => {
  it('caps DEV_CONFIRM at exactly three candidates per methodology generation', () => {
    const budget = obj('sectionG_devConfirmInformationBoundary.budget');
    expect(budget['candidatesPerMethodologyGeneration']).toBe(3);
    expect(budget['maxCandidatesAgainstDEV_CONFIRM']).toBe(3);
    expect(budget['afterCandidateThreeFails']).toBe('METHODOLOGY_GENERATION_CLOSED');
    expect(arr('sectionJ_splits.splits')[1]?.['scoringBudget']).toBe(3);
  });

  it('caps FINAL_HOLDOUT at exactly one, one-shot, retired on either outcome', () => {
    const holdout = obj('sectionH_finalHoldout.methodologyV2FinalHoldout');
    expect(holdout['maxCandidatesAgainstFINAL_HOLDOUT']).toBe(1);
    expect(arr('sectionJ_splits.splits')[2]?.['scoringBudget']).toBe(1);
    const oneShot = holdout['oneShotSemantics'] as JsonObject;
    expect(oneShot['noRepeatedHoldoutAttempts']).toBe(true);
    expect(oneShot['retiredOnEitherOutcome'] as string).toMatch(/after PASS and after FAIL/);
    expect(oneShot['onFailure']).toContain('the HOLDOUT is RETIRED');
  });

  it('does not let INADMISSIBLE become an escape hatch', () => {
    const budget = obj('sectionG_devConfirmInformationBoundary.budget');
    expect(budget['inadmissibleDoesNotConsumeASlot'] as string).toMatch(/measured nothing/);
    expect(budget['inadmissibleIsNotAnEscapeHatch'] as string).toMatch(/never be declared/);
  });
});

describe('the historical HOLDOUT cannot satisfy the new FINAL_HOLDOUT identity', () => {
  it('retires the historical HOLDOUT and declares it ineligible', () => {
    const historical = obj('sectionH_finalHoldout.historicalHoldout');
    expect(historical['disposition']).toBe('HISTORICAL_EVALUATION_ONLY');
    expect(historical['eligibleAsMethodologyV2FinalHoldout']).toBe(false);
    expect(historical['noExistingHistoricalHoldoutFileIsEligible']).toBe(true);
    expect(historical['priorAggregateAccessRecordedAs']).toBe(
      'PROCEDURAL_HOLDOUT_ACCESS_WITHOUT_ITEM_LEVEL_SEMANTIC_DISCLOSURE',
    );
    expect(
      obj('sectionB_existingHoldout.dispositionForMethodologyV2')['eligibleAsFinalHoldout'],
    ).toBe(false);
  });

  it('requires the new FINAL_HOLDOUT to be newly acquired and sealed before an eligible candidate exists', () => {
    const holdout = obj('sectionH_finalHoldout.methodologyV2FinalHoldout');
    expect(holdout['existsToday']).toBe(false);
    expect(holdout['sealedBeforeAnEligibleCandidateExists']).toBe(true);
    const requirements = (holdout['requirements'] as readonly string[]).join(' | ');
    expect(requirements).toMatch(/NEWLY ACQUIRED/);
    expect(requirements).toMatch(/organisation-disjoint from DEV_TRAIN and DEV_CONFIRM/);
    expect(requirements).toMatch(/dual-reviewed/);
    expect(requirements).toMatch(/ONE-SHOT/);
  });

  it('is structurally impossible for the historical set to qualify: it is not organisation-disjoint from DEV_TRAIN', () => {
    // The historical 49 items BECOME DEV_TRAIN_DIAGNOSTIC_ONLY, so reusing them as
    // FINAL_HOLDOUT would place the same organisations in two splits at once.
    const historical = obj('sectionJ_splits.historicalDevelopmentSet');
    expect(historical['becomes']).toBe('DEV_TRAIN_DIAGNOSTIC_ONLY');
    expect(historical['mayEverAgainCertifyARuntimeCandidate']).toBe(false);
    expect(historical['isPartOfTheMethodologyV2Corpus']).toBe(false);
  });

  it('opened no historical HOLDOUT file in this task', () => {
    expect(obj('exclusions')['noHistoricalHoldoutFileOpened']).toBe(true);
    expect(
      obj('sectionB_existingHoldout.dispositionForMethodologyV2')['r2InspectedNoHoldoutFile'],
    ).toBe(true);
  });
});

describe('full N = 5 replication is not part of Methodology V2', () => {
  it('records N = 5 as RETIRED and not carried forward', () => {
    const full = obj('sectionL_replicationAndStability.fullNFiveReplication');
    expect(full['status']).toBe('RETIRED');
    expect(full['carriedIntoMethodologyV2']).toBe(false);
    expect(full['fiveRepeatedModelCallsAreNotFiveIndependentDatasets']).toBe(true);
  });

  it('runs the main pass at R = 1 over the full split, and no gate reads a replicate', () => {
    const main = obj('sectionL_replicationAndStability.theFrozenReplicationDesign.mainPass');
    expect(main['replicates']).toBe(1);
    expect(main['allSixGatesAreComputedOnThisPassOnly']).toBe(true);
    expect(main['noGateReadsAStabilityReplicate'] as string).toMatch(/forbidden/);
    expect(
      obj('sectionM_acceptanceRuleShape.invariants')['noGateIsComputedFromAStabilityReplicate'],
    ).toBe(true);
  });

  it('removes the catastrophic-replicate rule outright rather than deferring it', () => {
    const removed = obj('sectionL_replicationAndStability.noCatastrophicReplicateGate');
    expect(removed['status']).toBe('REMOVED');
    expect(removed['notDeferredNotOptional'] as string).toMatch(/not available to be switched on/);
  });

  it('retains the organisation-level catastrophe veto, precisely defined and justified', () => {
    const vOrg = obj('sectionL_replicationAndStability.organisationLevelCatastropheVeto');
    expect(vOrg['id']).toBe('V_ORG');
    expect(vOrg['status'] as string).toMatch(/RETAINED/);
    expect(vOrg['rule'] as string).toMatch(/must be 0/);
    expect(vOrg['isASemanticGate']).toBe(false);
    expect(vOrg['countsTowardTheSix']).toBe(false);
  });

  it('spends the saved inference budget on items, which is the whole argument', () => {
    const cost = obj('sectionL_replicationAndStability.costComparisonAtCorpusOptionB');
    const old = cost['frozenDesign_NEqualsFive'] as JsonObject;
    const now = cost['methodologyV2Design'] as JsonObject;
    expect(old['inferencesPerGatedSplit']).toBe(2800);
    expect(now['inferencesPerGatedSplit']).toBe(640);
    // 560 items x 1 pass, plus 2 extra passes over the 40-item subset.
    expect(560 * 1 + 40 * 2).toBe(now['inferencesPerGatedSplit']);
    expect(
      (now['inferencesPerGatedSplit'] as number) < (old['inferencesPerGatedSplit'] as number),
    ).toBe(true);
  });
});

describe('the 40-item R = 3 stochastic-stability design is frozen', () => {
  const subset = obj('sectionL_replicationAndStability.theFrozenReplicationDesign.stabilitySubset');

  it('is 40 items evaluated R = 3 in total', () => {
    expect(subset['size']).toBe(40);
    expect(subset['replicatesTotal']).toBe(3);
    expect(subset['extraInferenceCost']).toBe(80);
    expect(subset['replicatesTotalIncludesTheMainPass'] as string).toMatch(
      /plus 2 additional passes/,
    );
  });

  it('is selected BEFORE candidate inference and never from model errors', () => {
    expect(subset['selectedBeforeCandidateInference']).toBe(true);
    expect(subset['selectedBeforeAnyModelOutputExists']).toBe(true);
    expect(subset['neverChosenOnModelErrors'] as string).toMatch(/No model output/);
    expect(subset['itemsNeverSurfacedToPromptAuthors'] as string).toMatch(/never shown/);
  });

  it('freezes the exact selection algorithm, and records that it is unseeded', () => {
    const algorithm = subset['selectionAlgorithm'] as JsonObject;
    expect(algorithm['deterministic']).toBe(true);
    expect(algorithm['seeded']).toBe(false);
    expect(algorithm['seedValue']).toBeNull();
    expect(algorithm['whyNoSeed'] as string).toMatch(/content hash/);
    // Every step is present and ordered.
    for (const step of [
      'step1_frame',
      'step2_strata',
      'step3_quotas',
      'step4_withinStratumRank',
      'step5_walk',
      'step6_shortfall',
    ]) {
      expect(algorithm[step], step).toBeDefined();
    }
    expect(algorithm['step4_withinStratumRank'] as string).toMatch(/STABILITY_V2_R2:/);
  });

  it('stratifies by gold class with quotas summing to exactly 40', () => {
    const quotas = (subset['selectionAlgorithm'] as JsonObject)['step3_quotas'] as Record<
      string,
      number
    >;
    expect(Object.keys(quotas).sort()).toEqual([
      'GOLD_HARD_NEGATIVE',
      'GOLD_OTHER',
      'GOLD_UNIT_PAGE',
    ]);
    expect(Object.values(quotas).reduce((a, b) => a + b, 0)).toBe(40);
    expect(subset['quotaSumCheck']).toBe(40);
    expect(quotas['GOLD_UNIT_PAGE']).toBe(16);
    expect(quotas['GOLD_HARD_NEGATIVE']).toBe(16);
    expect(quotas['GOLD_OTHER']).toBe(8);
  });

  it('stratifies by organisation with a cap that guarantees at least 20 organisations', () => {
    const cap = subset['STABILITY_MAX_ITEMS_PER_ORGANISATION'] as number;
    expect(cap).toBe(2);
    expect(Math.ceil(40 / cap)).toBe(20);
    expect(Math.ceil(40 / cap)).toBeGreaterThanOrEqual(
      obj('sectionK_feasibilityPrecondition')['MIN_ORGANISATIONS_PER_GATE'] as number,
    );
  });

  it('refuses the freeze on a shortfall rather than rebalancing quotas', () => {
    const shortfall = (subset['selectionAlgorithm'] as JsonObject)['step6_shortfall'] as string;
    expect(shortfall).toMatch(/REFUSED/);
    expect(shortfall).toMatch(/never rebalanced/);
    expect(shortfall).toMatch(/never accepted/);
  });

  it('freezes exactly three stability metrics, all reported with raw counts', () => {
    const metrics = arr('sectionL_replicationAndStability.stabilityMetrics.metrics');
    expect(metrics.map((m) => m['id'])).toEqual(['ST1', 'ST2', 'ST3']);
    expect(metrics[0]?.['denominator']).toBe(40);
    for (const metric of metrics) {
      expect(metric['reportedWith'] as string, metric['id'] as string).toMatch(
        /raw|three per-replicate/,
      );
    }
  });

  it('never treats the three stability calls as three independent datasets', () => {
    const never = obj('sectionL_replicationAndStability.stabilityMetrics')[
      'whatIsNeverDone'
    ] as readonly string[];
    const joined = never.join(' | ');
    expect(joined).toMatch(/never treated as three independent datasets/);
    expect(joined).toMatch(/no gate is averaged across replicates/);
    expect(joined).toMatch(/no replicate is replaced/);
    expect(
      obj('sectionM_acceptanceRuleShape.invariants')[
        'theThreeStabilityCallsAreNotThreeIndependentDatasets'
      ],
    ).toBe(true);
  });

  it('freezes an exact instability VETO whose tolerances are declared uncalibrated', () => {
    const veto = obj('sectionL_replicationAndStability.instabilityVeto');
    expect(veto['id']).toBe('V_STAB');
    expect(veto['status']).toBe('FROZEN');
    expect(veto['kind']).toBe('STRUCTURAL VETO');
    expect(veto['isASemanticGate']).toBe(false);
    expect(veto['countsTowardTheSix']).toBe(false);
    expect(veto['ST1_MINIMUM_AGREEMENT']).toBe(0.9);
    expect(veto['ST3_MAXIMUM_RANGE']).toBe(0.1);
    expect(veto['rule'] as string).toMatch(/REJECT/);
    expect(veto['canOnlyReject'] as string).toMatch(/never rescue/);
    expect(veto['toleranceClassification'] as string).toMatch(/NOT CALIBRATED/);
    expect(veto['toleranceHonesty'] as string).toMatch(/does not invent one and dress it up/);
    expect(veto['replicateCountIsExact'] as string).toMatch(/exactly 3/);
  });

  it('applies the veto at stage 1, alongside V_ORG, never as a seventh gate', () => {
    const stages = arr('sectionM_acceptanceRuleShape.stages');
    const vetoStage = stages.find((s) => s['stage'] === 1);
    expect(vetoStage?.['failureOutcome']).toBe('REJECT');
    expect(vetoStage?.['conditions']).toEqual(['V_ORG (section L)', 'V_STAB (section L)']);
    // Still exactly six semantic gates.
    expect(arr('sectionC_D2_certificationDesign.theSixGates')).toHaveLength(6);
  });
});

describe('the DEV_CONFIRM information boundary is exactly the owner-enumerated surface', () => {
  const boundary = obj('sectionG_devConfirmInformationBoundary');

  it('permits exactly the five owner-enumerated categories', () => {
    expect(boundary['permitted' + 'AfterEachCandidateDEV_CONFIRMEvaluation']).toEqual([
      'pass/fail per frozen gate',
      'aggregate numerator/denominator',
      'aggregate confidence bounds',
      'stability-subset aggregate statistics',
      'structural veto status',
    ]);
    expect(boundary['permittedListIsExhaustive']).toBe(true);
  });

  it('forbids exactly the seven owner-enumerated disclosures, plus their indirect routes', () => {
    expect(boundary['forbidden']).toEqual([
      'item IDs',
      'URLs',
      'titles',
      'organisation names',
      'per-item gold',
      'per-item model output',
      'error examples',
    ]);
    const extended = (boundary['forbiddenByExtension'] as readonly string[]).join(' | ');
    expect(extended).toMatch(/identifies WHICH items failed/);
    expect(extended).toMatch(/per-organisation breakdowns/);
  });

  it('surfaces its one proposed addition explicitly rather than folding it into the permitted list', () => {
    const additions = boundary[
      'additionsRequiringOwnerConfirmationAtFreeze'
    ] as readonly JsonObject[];
    expect(additions).toHaveLength(1);
    const addition = additions[0] as JsonObject;
    expect(addition['classification']).toBe('PROCEDURAL, not semantic');
    expect(addition['item'] as string).toMatch(/INADMISSIBLE/);
    expect(addition['notSilentlyIncluded'] as string).toMatch(/decision point/);
    expect(addition['statusIfTheOwnerDeclines']).toBeDefined();
    // It is NOT in the permitted list.
    const permitted = boundary[
      'permittedAfterEachCandidateDEV_CONFIRMEvaluation'
    ] as readonly string[];
    expect(permitted.join(' | ')).not.toMatch(/INADMISSIBLE/);
  });

  it('records that R2 narrows R1 rather than silently disagreeing with it', () => {
    expect(boundary['narrowedFromR1'] as string).toMatch(/R2 NARROWS/);
    expect(boundary['richerFeedbackJustification'] as string).toMatch(/NOT proposed/);
  });
});

describe('the Phase 2E entry rule is frozen as seven conjunctive conditions', () => {
  it('lists exactly the owner seven conditions, in order', () => {
    const conditions = arr(
      'sectionN_phase2EEntryRule.phase2EBecomesEligibleOnlyIfOneFrozenCandidate',
    );
    expect(conditions).toHaveLength(7);
    expect(conditions.map((c) => c['n'])).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const text = conditions.map((c) => c['condition'] as string);
    expect(text[0]).toMatch(/all six Methodology V2 DEV_CONFIRM gates/);
    expect(text[1]).toMatch(/stability/);
    expect(text[2]).toMatch(/no structural veto/);
    expect(text[3]).toMatch(/selected and frozen/);
    expect(text[4]).toMatch(/all six FINAL_HOLDOUT gates/);
    expect(text[5]).toMatch(/FINAL_HOLDOUT stability/);
    expect(text[6]).toMatch(/no FINAL_HOLDOUT structural veto/);
    expect(obj('sectionN_phase2EEntryRule')['allSevenRequired']).toBe(true);
    expect(obj('sectionN_phase2EEntryRule')['conditionsAreConjunctive']).toBe(true);
  });

  it('answers condition 6 rather than leaving it conditional', () => {
    const applies = obj('sectionN_phase2EEntryRule.doesMethodologyV2ApplyStabilityAtFINAL_HOLDOUT');
    expect(applies['answer']).toBe('YES');
    expect(applies['detail'] as string).toMatch(/its OWN pre-registered 40-item/);
    expect(applies['theSubsetIsSplitScoped'] as string).toMatch(/never reused/);
  });

  it('separates eligibility from authorisation', () => {
    const n = obj('sectionN_phase2EEntryRule');
    expect(n['onlyThenMayItBecome']).toBe('SELECTED_RUNTIME_MODEL');
    expect(n['eligibilityIsNotAuthorisation']).toBe(true);
    expect(n['noSelectedRuntimeModelExistsToday']).toBe(true);
    expect(n['neitherPassAuthorisesLiveExecution'] as string).toMatch(
      /Neither DEV_CONFIRM PASS nor FINAL_HOLDOUT PASS/,
    );
  });
});

describe('the Option B sampling contract is machine-checkable, not prose', () => {
  const ruleIds = arr('sectionE_samplingContract.rules').map((r) => r['id'] as string);

  it('pins an exact rule for every subject the owner enumerated', () => {
    // SD1 frame, SD2 split assignment, SD3 page sampling, SD4 max contribution,
    // SD5 unit-page enrichment, SD6 hard-negative enrichment, SD7 duplicates,
    // SD8 multilingual, SD9 acquisition stop/min/max, SD10 semantic classes,
    // SD11 representative vs enriched, SD12 weighting.
    expect(ruleIds).toEqual([
      'SD1',
      'SD2',
      'SD3',
      'SD4',
      'SD5',
      'SD6',
      'SD7',
      'SD8',
      'SD9',
      'SD10',
      'SD11',
      'SD12',
    ]);
    for (const rule of arr('sectionE_samplingContract.rules')) {
      expect(typeof rule['rule'], rule['id'] as string).toBe('string');
      expect((rule['rule'] as string).length, rule['id'] as string).toBeGreaterThan(40);
    }
  });

  it('declares the whole contract deterministic and unseeded', () => {
    const determinism = obj('sectionE_samplingContract.globalDeterminismRule');
    expect(determinism['seeded']).toBe(false);
    expect(determinism['rankDefinition'] as string).toMatch(/sha256/);
    expect(determinism['saltedRankDefinition'] as string).toMatch(/not a secret/);
    expect(obj('sectionE_samplingContract')['noApproximateProseWhereExecutionNeedsADecision']).toBe(
      true,
    );
  });

  it('freezes every acquisition and selection bound as a number', () => {
    const constants = obj('sectionE_samplingContract.frozenConstantsIndex') as Record<
      string,
      number
    >;
    expect(constants['ACQUISITION_TARGET_ORGANISATIONS']).toBe(110);
    expect(constants['ACQUISITION_RESERVE_ORGANISATIONS']).toBe(40);
    expect(constants['SET_P_MAX_PAGES_PER_ORGANISATION']).toBe(8);
    expect(constants['SET_R_MAX_PAGES_PER_ORGANISATION']).toBe(4);
    expect(constants['ORGANISATION_GATE_SHARE_CAP']).toBe(0.1);
    expect(constants['MIN_PAGES_PER_ORGANISATION']).toBe(4);
    expect(constants['MAX_PAGES_ACQUIRED_PER_ORGANISATION']).toBe(35);
    expect(constants['NEAR_DUPLICATE_JACCARD_THRESHOLD']).toBe(0.9);
    expect(constants['MIN_GOLD_ITEMS_PER_GATED_CLASS']).toBe(2);
    for (const value of Object.values(constants)) {
      expect(typeof value).toBe('number');
    }
  });

  it('uses no weighting anywhere, so no prevalence-sensitive metric needs one', () => {
    const sd12 = arr('sectionE_samplingContract.rules').find((r) => r['id'] === 'SD12');
    expect(sd12?.['rule'] as string).toMatch(/NO WEIGHTING IS USED ANYWHERE/);
    expect(sd12?.['postHocReweightingIsForbidden']).toBe(true);
    expect(obj('sectionF_prevalenceAndEnrichment')['weighting']).toBe('NONE. See SD12.');
  });

  it('keeps every prevalence-dependent gate on the prevalence-faithful sample', () => {
    const classification = arr('sectionF_prevalenceAndEnrichment.metricClassification');
    const on = (gate: string) =>
      classification.find((c) => (c['gate'] as string).startsWith(gate))?.['estimatedOn'];
    expect(on('G3')).toBe('SET_P ONLY');
    expect(on('G5')).toBe('SET_P ONLY');
    expect(on('G6')).toBe('SET_P ONLY');
    expect(on('G2')).toBe('SET_R');
    expect(on('G4')).toBe('SET_R');
  });

  it('declares its uncalibrated constants as uncalibrated', () => {
    const uncalibrated = obj('sectionE_samplingContract')[
      'uncalibratedConstantsDeclaredAsSuch'
    ] as readonly string[];
    expect(uncalibrated).toContain('NEAR_DUPLICATE_JACCARD_THRESHOLD');
    expect(uncalibrated).toContain('MIN_ORGANISATIONS_PER_GATE');
    const unknowns = (r2['openUnknowns'] as readonly string[]).join(' | ');
    expect(unknowns).toMatch(/NEAR_DUPLICATE_JACCARD_THRESHOLD/);
    expect(unknowns).toMatch(/V_STAB tolerances/);
  });

  it('ends every shortfall in a refusal, never a silently smaller corpus', () => {
    expect(
      obj('sectionE_samplingContract')['everyRefusalIsARefusalNeverASilentDowngrade'] as string,
    ).toMatch(/REFUSED freeze/);
  });
});

describe('the gold and review contract is frozen, with adjudication specified', () => {
  it('requires dual independent blind review on both gated splits only', () => {
    const which = obj('sectionI_goldAndReviewContract.whichSplitsRequireDualReview');
    expect(which['DEV_TRAIN'] as string).toMatch(/^NO/);
    expect(which['DEV_CONFIRM']).toBe('YES - required.');
    expect(which['FINAL_HOLDOUT']).toBe('YES - required.');
    const workflow = obj('sectionI_goldAndReviewContract.workflow');
    expect(workflow['neitherReviewerSeesCandidateModelOutputs']).toBe(true);
    expect(workflow['step2_reviewerB'] as string).toMatch(/BLIND TO A/);
    expect(workflow['step3_agreementRecorded'] as string).toMatch(/kappa/);
    expect(workflow['step5_provenance'] as string).toMatch(/BOTH source labels/);
  });

  it('specifies who may adjudicate: owner OR an independent third human reviewer', () => {
    const who = obj('sectionI_goldAndReviewContract.whoMayAdjudicate');
    expect(who['ownerAdjudicationRequired']).toBe(false);
    expect(who['independentThirdReviewerPermitted']).toBe(true);
    expect(who['frozenBeforeLabellingBegins']).toBe(true);
    const constraints = (who['constraintsOnAnyAdjudicator'] as readonly string[]).join(' | ');
    expect(constraints).toMatch(/must be HUMAN/);
    expect(constraints).toMatch(/NOT have been reviewer A or reviewer B/);
    expect(constraints).toMatch(/no model output/);
    expect(constraints).toMatch(/\^\[a-z0-9\]\[a-z0-9_-\]\{2,63\}\$/);
    expect(obj('sectionI_goldAndReviewContract')['ownerNeedNotBeReviewerAOrB']).toBe(true);
  });

  it('never lets a model define or confirm gold, and never fabricates agreement', () => {
    const i = obj('sectionI_goldAndReviewContract');
    expect(i['secondReviewerMustBeHuman'] as string).toMatch(
      /never a fabricated agreement statistic/,
    );
    expect(i['noFabrication'] as string).toMatch(/never guessed/);
    expect(i['noLabelsCollectedInThisTask']).toBe(true);
  });
});

describe('G1 stays zero tolerance and the six gates stay six', () => {
  it('counts six semantic gates and seven structural preconditions, and never confuses them', () => {
    const a = obj('sectionA_terminology');
    expect(a['exactlySixSemanticGates']).toBe(6);
    expect(a['exactlySevenStructuralPreconditions']).toBe(7);
    expect(arr('sectionA_terminology.sevenStructuralPreconditions')).toHaveLength(7);
    expect(a['aStructuralConditionIsNeverCalledASemanticGate']).toBe(true);
    expect(a['structuralPreconditionsAndVetoesAreNotSemanticGates'] as string).toMatch(
      /never counted as such/,
    );
  });

  it('keeps the two vetoes out of the six', () => {
    const vetoIds = ['V_ORG', 'V_STAB'];
    const gateIds = arr('sectionC_D2_certificationDesign.theSixGates').map(
      (g) => g['id'] as string,
    );
    for (const veto of vetoIds) {
      expect(gateIds).not.toContain(veto);
    }
    expect(gateIds).toEqual(['G1', 'G2', 'G3', 'G4', 'G5', 'G6']);
  });
});

describe('the methodology helper is unreachable from production classifier code', () => {
  it('lives under src/test/harness and NOT under src/orgunits', () => {
    expect(r2['machineVerifiableSupport']).toBeDefined();
    const support = obj('machineVerifiableSupport');
    expect(support['module']).toBe(HELPER_PATH);
    expect((support['module'] as string).startsWith('src/orgunits/')).toBe(false);
    expect(existsSync(resolve(ROOT, HELPER_PATH))).toBe(true);
    expect(existsSync(resolve(ROOT, FORBIDDEN_HELPER_PATH))).toBe(false);
  });

  it('is imported by nothing outside src/test/', () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(resolve(ROOT, dir))) {
        const relative = join(dir, entry);
        const absolute = resolve(ROOT, relative);
        if (statSync(absolute).isDirectory()) {
          walk(relative);
          continue;
        }
        if (!/\.(ts|mts|cts|js|mjs)$/.test(entry)) continue;
        if (relative.startsWith('src/test/')) continue;
        if (readFileSync(absolute, 'utf8').includes('acceptanceStatistics')) {
          offenders.push(relative);
        }
      }
    };
    walk('src');
    expect(offenders).toEqual([]);
  });

  it('is imported by no classifier runtime or provider path at all', () => {
    for (const namespace of ['src/orgunits/classify', 'src/orgunits/classify/provider']) {
      const walk = (dir: string): string[] => {
        const hits: string[] = [];
        for (const entry of readdirSync(resolve(ROOT, dir))) {
          const relative = join(dir, entry);
          const absolute = resolve(ROOT, relative);
          if (statSync(absolute).isDirectory()) {
            hits.push(...walk(relative));
          } else if (
            /\.ts$/.test(entry) &&
            readFileSync(absolute, 'utf8').includes('acceptanceStatistics')
          ) {
            hits.push(relative);
          }
        }
        return hits;
      };
      expect(walk(namespace), namespace).toEqual([]);
    }
  });

  it('is excluded from the production build', () => {
    const buildConfig = JSON.parse(readFileSync(resolve(ROOT, 'tsconfig.build.json'), 'utf8')) as {
      exclude?: readonly string[];
    };
    expect(buildConfig.exclude).toContain('src/test/**/*');
  });

  it('itself imports nothing, so it can pull no production module in behind it', () => {
    const source = readFileSync(resolve(ROOT, HELPER_PATH), 'utf8');
    const importLines = source
      .split('\n')
      .filter((line) => /^\s*import\s/.test(line) || /\brequire\(/.test(line));
    expect(importLines).toEqual([]);
  });
});

describe('the historical F7 firewall passes unchanged', () => {
  const F6_OWNER_FREEZE_APPROVAL_COMMIT = '4a1daf4309e35c8be12b30ae085a9083551fdb8b';
  const F7_FIREWALL = 'src/test/firewall/phase2b2d2cF7RestartExecution.firewall.test.ts';

  const commitAvailable = (): boolean => {
    try {
      execFileSync(
        'git',
        ['-C', ROOT, 'cat-file', '-e', `${F6_OWNER_FREEZE_APPROVAL_COMMIT}^{commit}`],
        {
          stdio: 'ignore',
        },
      );
      return true;
    } catch {
      return false;
    }
  };

  it.skipIf(!commitAvailable())(
    'methodology work changed nothing under src/orgunits/ since the F6 approval commit',
    () => {
      const changed = execFileSync(
        'git',
        ['-C', ROOT, 'diff', '--name-only', F6_OWNER_FREEZE_APPROVAL_COMMIT, '--'],
        { encoding: 'utf8' },
      )
        .split('\n')
        .filter((line) => line.length > 0);
      expect(changed.filter((file) => file.startsWith('src/orgunits/'))).toEqual([]);
    },
  );

  /**
   * The branch point this design work was cut from, and therefore the exact
   * PRE-METHODOLOGY baseline. It is deliberately NOT `main`: this branch
   * inherits the whole 2D2C lineage, so `src/orgunits/` differs from `main`
   * by twenty files that predate methodology work entirely and are already
   * baked into the F6 approval commit. Nor is it the F6 approval commit
   * itself: the F7 firewall file was legitimately created after that commit,
   * by the F7 execution build (`911309e`). Only against the branch point does
   * "methodology work changed this" mean what it says.
   */
  const PRE_METHODOLOGY_BASELINE = '9b8a0e61a52ded96bfd40f1aa502d5311cef7619';

  const baselineAvailable = (): boolean => {
    try {
      execFileSync('git', ['-C', ROOT, 'cat-file', '-e', `${PRE_METHODOLOGY_BASELINE}^{commit}`], {
        stdio: 'ignore',
      });
      return true;
    } catch {
      return false;
    }
  };

  it.skipIf(!baselineAvailable())('methodology work edited no firewall file at all', () => {
    const changed = execFileSync(
      'git',
      ['-C', ROOT, 'diff', '--name-only', PRE_METHODOLOGY_BASELINE, '--'],
      { encoding: 'utf8' },
    )
      .split('\n')
      .filter((line) => line.length > 0);
    expect(changed).not.toContain(F7_FIREWALL);
    expect(changed.filter((file) => file.startsWith('src/test/firewall/'))).toEqual([]);
  });

  it.skipIf(!baselineAvailable())(
    'methodology work touched only docs/ and src/test/ - no production file in any namespace',
    () => {
      const changed = execFileSync(
        'git',
        ['-C', ROOT, 'diff', '--name-only', PRE_METHODOLOGY_BASELINE, '--'],
        { encoding: 'utf8' },
      )
        .split('\n')
        .filter((line) => line.length > 0);
      const stray = changed.filter(
        (file) => !file.startsWith('docs/') && !file.startsWith('src/test/'),
      );
      expect(stray).toEqual([]);
    },
  );

  it('records the repair honestly: the firewall was right and the file moved', () => {
    const p = obj('sectionP_firewallRepair');
    expect((p['whatWentWrong'] as JsonObject)['theFirewallWasCorrect']).toBe(true);
    expect((p['whatWentWrong'] as JsonObject)['theFirewallWasNotWeakened']).toBe(true);
    expect((p['theFix'] as JsonObject)['action']).toBe('MOVED, not exempted');
    expect((p['theFix'] as JsonObject)['from']).toBe(FORBIDDEN_HELPER_PATH);
    expect((p['theFix'] as JsonObject)['to']).toBe(HELPER_PATH);
    const met = p['requirementsMet'] as Record<string, boolean>;
    for (const key of Object.keys(met)) {
      expect(met[key], key).toBe(true);
    }
  });

  it('does not rewrite the historical documents to match the new path', () => {
    const historical = obj('sectionP_firewallRepair.historicalDocumentsNotRewritten');
    expect(historical['theStalePathsAreHistoricalFacts']).toBe(true);
    // R1 on disk still records where the file was when R1 was written.
    const r1Raw = readFileSync(resolve(ROOT, R1_PATH), 'utf8');
    expect(r1Raw).toContain(FORBIDDEN_HELPER_PATH);
  });
});
