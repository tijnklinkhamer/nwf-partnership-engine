/**
 * PHASE 2B-2D ACCEPTANCE METHODOLOGY V2 - the PROPOSAL, verified.
 *
 * This suite exists so the proposal cannot drift from arithmetic. Every
 * load-bearing number in the document is RECOMPUTED here from the pure
 * primitives rather than read and trusted, and the document's central
 * safety properties are asserted structurally:
 *
 *   - it authorises nothing;
 *   - its point-estimate targets are IDENTICAL to the currently-frozen
 *     thresholds, so the substantive quality bar provably was not lowered;
 *   - its certified floors follow the declared principle exactly
 *     (target - MAX_SUBGROUP_SHORTFALL), so no floor was hand-picked;
 *   - every gate it proposes is FEASIBLE at the denominator it proposes;
 *   - every gate currently frozen is INFEASIBLE at its DEV denominator.
 *
 * ZERO PROVIDER, ZERO NETWORK, ZERO DATABASE, ZERO INFERENCE, ZERO HOLDOUT.
 * Reads one committed JSON document and computes over integers.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ABSOLUTE_GATES,
  MAX_SUBGROUP_SHORTFALL,
} from '../../orgunits/classify/evaluation/protocol.js';
import {
  clopperPearsonLowerBound,
  gateFeasibility,
  minimumTrialsToCertify,
  passEveryReplicateAcceptanceProbability,
} from '../harness/phase2b2d2c/methodology/acceptanceStatistics.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const PROPOSAL_PATH = 'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL.json';

type JsonObject = Readonly<Record<string, unknown>>;

const raw = readFileSync(resolve(ROOT, PROPOSAL_PATH), 'utf8');
const proposal = JSON.parse(raw) as JsonObject;

/** Walk a dotted path. Throws on a missing key, so a renamed field fails loudly. */
function at(path: string): unknown {
  let cursor: unknown = proposal;
  for (const key of path.split('.')) {
    if (typeof cursor !== 'object' || cursor === null || !(key in cursor)) {
      throw new Error(`proposal path ${path} is missing at ${key}`);
    }
    cursor = (cursor as JsonObject)[key];
  }
  return cursor;
}

const obj = (path: string): JsonObject => at(path) as JsonObject;
const arr = (path: string): readonly JsonObject[] => at(path) as readonly JsonObject[];
const num = (value: unknown): number => value as number;

describe('the proposal authorises nothing', () => {
  it('carries an empty thisFileAuthorises and a PROPOSED status', () => {
    expect(proposal['thisFileAuthorises']).toEqual([]);
    expect(proposal['status']).toBe('PROPOSED_PENDING_OWNER_METHODOLOGY_APPROVAL');
    expect(obj('supersedes')['nothing']).toBe(true);
  });

  it('declares every prohibited action excluded', () => {
    const exclusions = obj('exclusions');
    for (const required of [
      'noProviderExecution',
      'noCandidateInference',
      'noPromptCandidateCreated',
      'noV6Rescore',
      'noHoldoutAccess',
      'noLiveWebAcquisition',
      'noInstitutionRequest',
      'noPhase2EExecution',
      'noRuntimeModelPromotion',
      'noProductionDefaultChanged',
      'noGoldChanged',
      'noNewNetworkAuthority',
    ]) {
      expect(exclusions[required], `${required} must be declared true`).toBe(true);
    }
  });

  it('requires owner approval to be a separate record naming this file by hash', () => {
    const approvalMustBe = obj('ownerDecisionRequired')['approvalMustBe'] as string;
    expect(approvalMustBe).toMatch(/SEPARATE/);
    expect(approvalMustBe).toMatch(/SHA-256/);
    expect(approvalMustBe).toMatch(/does not create it/);
  });

  it('names no gold id anywhere, so it cannot leak a sealed item', () => {
    // Gold ids are `g` followed by 16 lower-case hex characters.
    expect(raw).not.toMatch(/\bg[0-9a-f]{16}\b/);
  });
});

describe('the substantive quality bar was NOT lowered', () => {
  const qualityGates = () => arr('proposedAcceptanceRule.stage2_quality.gates');

  it('reuses the currently-frozen thresholds as its point-estimate targets, unchanged', () => {
    const byMetric = new Map(qualityGates().map((gate) => [gate['metric'], gate]));
    expect(byMetric.get('unitPageRecall')!['pointEstimateTarget']).toBe(
      ABSOLUTE_GATES.minUnitPageRecall,
    );
    expect(byMetric.get('unitPagePrecision')!['pointEstimateTarget']).toBe(
      ABSOLUTE_GATES.minUnitPagePrecision,
    );
    expect(byMetric.get('unitTypeAccuracy')!['pointEstimateTarget']).toBe(
      ABSOLUTE_GATES.minUnitTypeAccuracy,
    );
    expect(byMetric.get('hardNegativeRejection')!['pointEstimateTarget']).toBe(
      ABSOLUTE_GATES.minHardNegativeRejection,
    );
    expect(byMetric.get('needsReviewRate')!['pointEstimateTarget']).toBe(
      ABSOLUTE_GATES.maxNeedsReviewRate,
    );
  });

  it('derives every certified floor from the declared principle, with no hand-picked value', () => {
    const derivation = obj('proposedAcceptanceRule.stage2_quality.floorDerivation');
    expect(derivation['constant']).toBe(MAX_SUBGROUP_SHORTFALL);

    for (const gate of qualityGates()) {
      const target = num(gate['pointEstimateTarget']);
      if (gate['direction'] === 'lower is better') {
        expect(gate['certifiedCeiling']).toBeCloseTo(target + MAX_SUBGROUP_SHORTFALL, 10);
      } else {
        expect(
          gate['certifiedFloor'],
          `${gate['metric']} floor must be target - ${MAX_SUBGROUP_SHORTFALL}`,
        ).toBeCloseTo(target - MAX_SUBGROUP_SHORTFALL, 10);
      }
    }
  });

  it('never claims a floor at or above its own target, which would be incoherent', () => {
    for (const gate of qualityGates()) {
      if (gate['direction'] === 'lower is better') continue;
      expect(num(gate['certifiedFloor'])).toBeLessThan(num(gate['pointEstimateTarget']));
    }
  });
});

describe('the diagnosis recomputes - no number is merely asserted', () => {
  const evidence = () => arr('diagnosis.d1_noGateIsCertifiable.evidence');

  it('reproduces every claimed best-attainable lower bound exactly', () => {
    for (const row of evidence()) {
      const denominator = num(row['devDenominator']);
      expect(
        clopperPearsonLowerBound(denominator, denominator),
        `${row['gate']} best attainable bound`,
      ).toBeCloseTo(num(row['bestAttainableLowerBound']), 4);
    }
  });

  it('reproduces every claimed certification corpus size exactly', () => {
    for (const row of evidence()) {
      expect(minimumTrialsToCertify(num(row['threshold'])), `${row['gate']} minimum trials`).toBe(
        row['trialsNeededForZeroErrorCertification'],
      );
    }
  });

  it('confirms every currently-frozen gate is INFEASIBLE at its own DEV denominator', () => {
    for (const row of evidence()) {
      const feasibility = gateFeasibility(num(row['threshold']), num(row['devDenominator']));
      expect(feasibility.certifiableAtThisDenominator, `${row['gate']}`).toBe(false);
    }
  });

  it('reproduces the compound 5/5 stringency claim', () => {
    const perReplicate = Math.pow(0.95, 14);
    expect(passEveryReplicateAcceptanceProbability(perReplicate, 5)).toBeCloseTo(0.0276, 4);
    expect(
      obj('diagnosis.d3_compoundRuleStringencyWasNeverComputed')['consequence'] as string,
    ).toMatch(/0\.99682/);
    expect(Math.pow(0.8, 1 / 70)).toBeCloseTo(0.99682, 5);
  });

  it('reproduces the measured DEV class counts it relies on', () => {
    const base = 'diagnosis.d7_corpusIsOneCountryAndTwelveOrganisations.measured';
    const measured = obj(base);
    const verdicts = obj(`${base}.devVerdicts`);
    const unitPages = num(verdicts['UNIT_PAGE']);
    expect(unitPages + num(verdicts['NOT_A_UNIT']) + num(verdicts['NEEDS_REVIEW'])).toBe(
      num(measured['devItems']),
    );
    // unit_type is defined exactly on gold UNIT_PAGE items, so the two must agree.
    const unitTypeTotal = Object.values(obj(`${base}.devUnitType`)).reduce<number>(
      (total, count) => total + num(count),
      0,
    );
    expect(unitTypeTotal).toBe(unitPages);
    // The relevance axes are three per gold UNIT_PAGE item.
    const axes = obj(`${base}.devRelevanceAxisInstances`);
    expect(num(axes['total'])).toBe(3 * unitPages);
    expect(num(axes['UNKNOWN']) + num(axes['YES']) + num(axes['NO'])).toBe(num(axes['total']));
    expect(num(axes['NO']), 'the NO axis class is structurally empty').toBe(0);
  });
});

describe('the feasibility precondition binds the proposal itself', () => {
  it('every proposed certified floor IS achievable at the proposed denominator', () => {
    const evidenceSet = 'corpusDecision.proposedNewEvidenceSet';
    const perSplit = obj(`${evidenceSet}.targets.perSplitOrganisations`);
    const goldUnitPages = num(obj(`${evidenceSet}.twoSampleDesign.SET_R`)['targetGoldUnitPages']);
    const prevalenceFaithfulDocuments = num(
      obj(`${evidenceSet}.twoSampleDesign.SET_P`)['targetDocuments'],
    );
    const minClusters = num(obj('proposedAcceptanceRule.feasibilityPrecondition')['MIN_CLUSTERS']);

    // Recall and unit_type are measured on the enriched positive sample.
    expect(gateFeasibility(0.85, goldUnitPages).certifiableAtThisDenominator).toBe(true);
    expect(gateFeasibility(0.75, goldUnitPages).certifiableAtThisDenominator).toBe(true);
    // Precision and hard-negative rejection are measured on the prevalence-faithful sample,
    // whose positive-prediction and hard-negative denominators are far above 29.
    expect(minimumTrialsToCertify(0.8)).toBeLessThanOrEqual(prevalenceFaithfulDocuments);

    expect(num(perSplit['DEV_CONFIRM'])).toBeGreaterThanOrEqual(minClusters);
    expect(num(perSplit['HOLDOUT'])).toBeGreaterThanOrEqual(minClusters);
  });

  it('the organisation targets sum to the declared total', () => {
    const targets = obj('corpusDecision.proposedNewEvidenceSet.targets');
    const perSplit = obj('corpusDecision.proposedNewEvidenceSet.targets.perSplitOrganisations');
    expect(Object.values(perSplit).reduce<number>((total, count) => total + num(count), 0)).toBe(
      num(targets['totalOrganisations']),
    );
  });

  it('answers the corpus-sufficiency question with a decision, not a hedge', () => {
    expect(obj('corpusDecision')['answer']).toBe('NO');
    expect(obj('corpusDecision.roleOfTheExisting49Items')['retainedAs']).toBe(
      'DEV_TRAIN (diagnostic only)',
    );
  });
});

describe('structural safety properties of the proposed rule', () => {
  const rule = (path: string): JsonObject => obj(`proposedAcceptanceRule.${path}`);

  it('keeps the splits organisation-disjoint and the confirmation split sealed', () => {
    expect(obj('proposedSplits')['disjointness'] as string).toMatch(/ORGANISATION-DISJOINT/);
    const splits = arr('proposedSplits.splits');
    const byName = new Map(splits.map((split) => [split['name'], split]));
    expect(byName.get('DEV_TRAIN')!['sealed']).toBe(false);
    expect(byName.get('DEV_CONFIRM')!['sealed']).toBe(true);
    expect(byName.get('HOLDOUT')!['sealed']).toBe(true);
    expect(byName.get('DEV_TRAIN')!['usedForAcceptanceDecision']).toBe(false);
  });

  it('bounds HOLDOUT multiplicity instead of leaving it unbounded', () => {
    const holdout = arr('proposedSplits.splits').find((split) => split['name'] === 'HOLDOUT')!;
    expect(holdout['multiplicityBudget']).toBe(3);
    expect(obj('holdoutPolicy')['mayTuningFollowAHoldoutFailure'] as string).toMatch(/^NO/);
  });

  it('never permits a vacuous or unmeasured gate to pass', () => {
    const aggregation = rule('stage4_aggregation');
    expect(aggregation['unmeasuredGateIsNeverAPassedGate']).toBe(true);
    expect(aggregation['vacuousGateIsReportedAndBlocks'] as string).toMatch(/never a pass/);
    expect(aggregation['noThresholdTuningAfterOutcomes']).toBe(true);
    expect(aggregation['noPromptTuningAfterOutcomes']).toBe(true);
  });

  it('separates INADMISSIBLE from REJECT so infrastructure never becomes a semantic verdict', () => {
    expect(obj('proposedAcceptanceRule')['outcomes']).toEqual(['ACCEPT', 'REJECT', 'INADMISSIBLE']);
    expect(rule('stage0_admissibility')['failureOutcome']).toBe('INADMISSIBLE');
    const missingness = rule('missingnessAndRetrySemantics');
    expect(missingness['infrastructureInvalid'] as string).toMatch(
      /INFRASTRUCTURE, not a semantic property/,
    );
    // And the assumption that buys is stated, not hidden.
    expect(missingness['assumptionStated'] as string).toMatch(/UNMEASURED/);
  });

  it('forbids retry, replacement and pooling exactly as the frozen rule did', () => {
    const retry = rule('missingnessAndRetrySemantics')['retry'] as string;
    expect(retry).toMatch(/no retry/);
    expect(retry).toMatch(/no replacement/);
    expect(rule('stage4_aggregation')['noPooling'] as string).toMatch(/never pooled/);
    expect(rule('stage4_aggregation')['noFallback']).toBe(true);
  });

  it('declares candidate independence and records that V6 was not back-tested', () => {
    const independence = obj('candidateIndependence');
    expect(independence['noCandidateExistedWhenThisWasWritten']).toBe(true);
    expect(independence['promptUnchanged']).toBe(true);
    expect(independence['v6NotBackTestedUnderThisRule']).toBe(true);
  });

  it('discloses the boundary event rather than omitting it', () => {
    const events = arr('disclosedBoundaryEvents');
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(event['holdoutInferenceRun']).toBe(false);
      expect(event['holdoutLabelsRead']).toBe(false);
    }
  });

  it('states its unknowns as UNKNOWN rather than resolving them by inference', () => {
    const unknowns = at('openUnknowns') as readonly string[];
    expect(unknowns.length).toBeGreaterThanOrEqual(5);
    for (const unknown of unknowns) expect(unknown).toMatch(/^UNKNOWN:/);
  });
});
