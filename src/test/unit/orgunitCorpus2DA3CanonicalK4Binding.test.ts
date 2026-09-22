/**
 * PHASE 2B-2D A3 — K4 SD4 ORGANISATION GATE-SHARE OWNER-CLARIFICATION BINDING.
 *
 * The owner resolved K4
 * (`K4_SD4_GATE_LOCAL_GREATEST_FIXED_POINT_AND_G3_FREEZE_CLARIFICATION_V1`) by
 * an append-only record. This file proves the canonical contracts carry that
 * decision truthfully and nothing more:
 *
 *   - the record is bound by path, SHA-256 and commit, and its commit added
 *     that one file on top of the canonical R13 tip;
 *   - every owner-bound token in the contract is the record's exact value;
 *   - the record pins the count-level greatest-fixed-point definition, the
 *     exact integer ratio, gate locality, the numerator rule, G3's
 *     pre-semantic procedure commitment, the non-operative expected 66, G1's
 *     no-union-rank invariant, the disclosure default and an unchanged
 *     section O - and selects none of the rejected alternatives;
 *   - A3 decision K4 is not methodology section-K condition K4 (CLASS MINIMUM);
 *   - marker accounting is 4 historical / 4 resolved / 0 unresolved, no K5;
 *   - K4 ENFORCEMENT is still not implemented: no `organisationCaps.ts`, no
 *     function in the contract, and `K4_ENFORCEMENT` stays not-checked.
 *
 * It implements no fixed point. R15 will implement and test the mathematics.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as contracts from '../harness/phase2b2d/a3prep/contracts.js';
import {
  A3_CORPUS_FREEZE_PREFLIGHT_NOT_CHECKED_BY_CURRENT_PREP,
  deriveCurrentOwnerDecisionBlockers,
} from '../harness/phase2b2d/a3prep/corpusFreezePreflight.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const A3PREP_REL = 'src/test/harness/phase2b2d/a3prep';

const K4 = contracts.K4_OWNER_DECISION;

/** The canonical R13 tip the K4 record names as its parent. */
const R13_PARENT_COMMIT = '185a3df3c4e35e6943c78ecf3681112665c81af4';

function fileSha256(relativePath: string): string {
  return createHash('sha256')
    .update(readFileSync(join(REPO_ROOT, relativePath)))
    .digest('hex');
}

function git(...args: readonly string[]): string {
  return execFileSync('git', ['-C', REPO_ROOT, ...args], { encoding: 'utf8' });
}

function commitAvailable(commit: string): boolean {
  try {
    git('cat-file', '-e', `${commit}^{commit}`);
    return true;
  } catch {
    return false;
  }
}

interface BoundFile {
  readonly path: string;
  readonly sha256: string;
}

interface K4Record {
  readonly recordKind: string;
  readonly a3DecisionId: string;
  readonly decisionToken: string;
  readonly selectedCoreOption: string;
  readonly selectedG3Option: string;
  readonly jointSemantics: string;
  readonly classification: string;
  readonly explicitlyNotClassifiedAs: readonly string[];
  readonly notMethodologyV2R4: boolean;
  readonly notAThresholdChange: boolean;
  readonly notASampleCapChange: boolean;
  readonly notAGateDefinitionChange: boolean;
  readonly notAGateDenominatorChange: boolean;
  readonly notAnExecutionAuthority: boolean;
  readonly noCandidateOutcomeInspectedToSelectThisRule: boolean;
  readonly noFrozenR3OrPlanByteChanges: boolean;
  readonly canonicalParentCommit: string;
  readonly thisFileAuthorises: readonly unknown[];
  readonly resolvesMarker: { readonly id: string; readonly marker: string };
  readonly nameCollisionWarning: { readonly notMethodologySectionKClassMinimum: boolean };
  readonly revalidatedFrozenBasis: {
    readonly g3MembershipExistsPreSemantically: boolean;
    readonly expectedG3Denominator66: { readonly value: number };
  };
  readonly ownerDecision: {
    readonly clause_exactRatio: {
      readonly canonicalCondition: string;
      readonly floatingPointPermitted: boolean;
      readonly contractRational: { readonly numerator: number; readonly denominator: number };
      readonly newNumericalParameterCreated: boolean;
      readonly policyToken: string;
    };
    readonly clause_gateLocality: {
      readonly token: string;
      readonly scope: string;
      readonly truncationDoesNotRemoveItemFrom: readonly string[];
      readonly itemInferredExactlyOnce: boolean;
    };
    readonly clause_numerator: {
      readonly policyToken: string;
      readonly truncatedItemInGateNumerator: boolean;
      readonly denominatorOnlyRemovalPermitted: boolean;
    };
    readonly clause_outcomeBlindness: {
      readonly permittedInputs: readonly string[];
      readonly forbiddenInputs: readonly string[];
    };
    readonly clause_sameDeterministicRank: {
      readonly retainedItemPolicy: string;
      readonly perGate: Record<string, { readonly sampleRank: string | null }>;
      readonly secondRankingInvented: boolean;
    };
    readonly clause_g1: {
      readonly policy: string;
      readonly contractToken: string;
      readonly frozenSingleUnionRankExists: boolean;
      readonly unionRankInvented: boolean;
      readonly provedInvariant: {
        readonly perOrganisationMaximumUnionContribution: number;
        readonly minimumAdmissibleSetPDenominator: number;
        readonly holds: boolean;
      };
      readonly ifReached: string;
      readonly rejectedTieRules: readonly string[];
    };
    readonly clause_nonG3PlannedSafety: {
      readonly gates: Record<
        string,
        { readonly maxPerOrganisation: number; readonly minimumDenominator: number }
      >;
      readonly greatestFixedPointMustBeIdentityForG1G2G4G5G6AtConformantFreeze: boolean;
    };
    readonly clause_nonG3RealisedSafety: { readonly newResultCategoryAdded: boolean };
    readonly clause_g3Freeze: {
      readonly policy: string;
      readonly forbiddenAtFreeze: readonly string[];
      readonly realisedPolicyToken: string;
    };
    readonly clause_expectedDenominator66: {
      readonly role: string;
      readonly usedByAnyK4Algorithm: boolean;
    };
    readonly clause_g3ScoringTimeOrder: {
      readonly steps: readonly string[];
      readonly candidateCorrectnessConsultedDuringStep4: boolean;
    };
    readonly clause_greatestFixedPoint: {
      readonly policyToken: string;
      readonly q0: string;
      readonly recurrence: string;
      readonly convergence: string;
      readonly retainedCount: string;
      readonly finalDenominator: string;
      readonly finalAssertion: string;
      readonly properties: readonly string[];
      readonly organisationProcessingOrderParameter: boolean;
      readonly oneOriginalDenominatorApproximationPermitted: boolean;
    };
    readonly clause_onePassRejected: {
      readonly counterexample: {
        readonly D0: number;
        readonly denominatorAfterOnePass: number;
        readonly greatestFixedPointSequence: readonly number[];
        readonly qStar: number;
        readonly finalDenominator: number;
      };
    };
    readonly clause_zeroFixedPoint: {
      readonly relaxSd4: boolean;
      readonly retainOneItem: boolean;
      readonly metric: string;
    };
    readonly clause_fewerThanTenContributingOrganisations: { readonly newSeparateGate: boolean };
    readonly clause_sectionKInteraction: { readonly sd4Waives: readonly string[] };
    readonly clause_disclosure: {
      readonly policyToken: string;
      readonly newFeedbackChannel: boolean;
    };
    readonly clause_attemptConsumption: {
      readonly sectionOChanged: boolean;
      readonly DEV_CONFIRM: string;
      readonly k4FailureIsAFreeRetry: boolean;
      readonly exceptionIntroduced: boolean;
    };
    readonly clause_vOrgUnchanged: { readonly k4ChangesVOrg: boolean };
    readonly clause_historicalOrganisationCaps: {
      readonly status: string;
      readonly blessed: boolean;
      readonly presentOnCanonicalLineage: boolean;
    };
    readonly rejectedOptions: readonly { readonly token: string; readonly reason: string }[];
  };
  readonly boundAuthority: Record<string, unknown> & {
    readonly canonicalParentCommit: string;
  };
}

const record = JSON.parse(readFileSync(join(REPO_ROOT, K4.decisionRecordPath), 'utf8')) as K4Record;
const decision = record.ownerDecision;

describe('2D-A3 K4: the owner record is bound by path, SHA-256 and commit', () => {
  it('exists at the contract path and hashes to the contract SHA-256', () => {
    expect(K4.decisionRecordPath).toBe(
      'docs/evaluation/PHASE_2B_2D_A3_K4_SD4_ORGANISATION_SHARE_OWNER_CLARIFICATION_V1.json',
    );
    expect(existsSync(join(REPO_ROOT, K4.decisionRecordPath))).toBe(true);
    expect(fileSha256(K4.decisionRecordPath)).toBe(K4.decisionRecordSha256);
    expect(K4.decisionRecordCommit).toMatch(/^[0-9a-f]{40}$/);
  });

  it('is an append-only owner clarification of the K4 marker, authorising nothing', () => {
    expect(record.recordKind).toBe('OWNER_CLARIFICATION');
    expect(record.a3DecisionId).toBe('K4');
    expect(record.resolvesMarker).toMatchObject({
      id: 'K4',
      marker: contracts.K4_SD4_G3_FREEZE_TIME_TRUNCATION,
    });
    expect(record.classification).toBe(
      'OWNER_OPERATIONAL_CLARIFICATION_OF_FROZEN_SD4_EXECUTION_SEMANTICS',
    );
    expect(record.thisFileAuthorises).toEqual([]);
    expect(record.notMethodologyV2R4).toBe(true);
    expect(record.notAThresholdChange).toBe(true);
    expect(record.notASampleCapChange).toBe(true);
    expect(record.notAGateDefinitionChange).toBe(true);
    expect(record.notAGateDenominatorChange).toBe(true);
    expect(record.notAnExecutionAuthority).toBe(true);
    expect(record.noCandidateOutcomeInspectedToSelectThisRule).toBe(true);
    expect(record.noFrozenR3OrPlanByteChanges).toBe(true);
    expect(record.explicitlyNotClassifiedAs).toEqual(
      expect.arrayContaining(['METHODOLOGY_V2_R4', 'EXECUTION_AUTHORITY']),
    );
    expect(record.canonicalParentCommit).toBe(R13_PARENT_COMMIT);
  });

  it('every bound authority file still hashes to the value the record names', () => {
    const bound = Object.entries(record.boundAuthority).filter(
      (entry): entry is [string, BoundFile] =>
        typeof entry[1] === 'object' &&
        entry[1] !== null &&
        'path' in entry[1] &&
        'sha256' in entry[1] &&
        !('atCommit' in entry[1]),
    );
    expect(bound.map(([name]) => name).sort()).toEqual([
      'corpusAcquisitionPlanApproval',
      'corpusAcquisitionPlanV1',
      'methodologyFreezeApproval',
      'methodologyR3',
      'r13Audit',
    ]);
    for (const [name, file] of bound) {
      expect(fileSha256(file.path), name).toBe(file.sha256);
    }
    expect(record.boundAuthority.canonicalParentCommit).toBe(R13_PARENT_COMMIT);
  });

  it.runIf(commitAvailable(K4.decisionRecordCommit))(
    'the recorded commit added exactly the record, on top of R13, with the bound bytes',
    () => {
      expect(git('show', '--name-status', '--format=', K4.decisionRecordCommit).trim()).toBe(
        `A\t${K4.decisionRecordPath}`,
      );
      expect(git('rev-parse', `${K4.decisionRecordCommit}^`).trim()).toBe(R13_PARENT_COMMIT);
      const committed = git('show', `${K4.decisionRecordCommit}:${K4.decisionRecordPath}`);
      expect(createHash('sha256').update(committed).digest('hex')).toBe(K4.decisionRecordSha256);
    },
  );

  it.runIf(commitAvailable(R13_PARENT_COMMIT))(
    'the record binds the R13 contract and preflight bytes it was decided against',
    () => {
      for (const key of ['canonicalContracts', 'canonicalCorpusFreezePreflight']) {
        const file = record.boundAuthority[key] as BoundFile & { atCommit: string };
        expect(file.atCommit).toBe(R13_PARENT_COMMIT);
        const bytes = git('show', `${R13_PARENT_COMMIT}:${file.path}`);
        expect(createHash('sha256').update(bytes).digest('hex'), key).toBe(file.sha256);
      }
    },
  );
});

describe('2D-A3 K4: the contract carries the record’s exact tokens', () => {
  it('decision, options and joint semantics', () => {
    expect(K4.id).toBe('K4');
    expect(K4.resolved).toBe(true);
    expect(K4.marker).toBe('A3_PREP_OWNER_DECISION_REQUIRED:SD4_G3_FREEZE_TIME_TRUNCATION');
    expect(K4.decisionToken).toBe(record.decisionToken);
    expect(K4.decisionToken).toBe(
      'K4_SD4_GATE_LOCAL_GREATEST_FIXED_POINT_AND_G3_FREEZE_CLARIFICATION_V1',
    );
    expect(K4.selectedCoreOption).toBe(record.selectedCoreOption);
    expect(K4.selectedCoreOption).toBe(
      'RECOMMEND_K4_GREATEST_FIXED_POINT_GATE_LOCAL_PREFIX_TRUNCATION',
    );
    expect(K4.selectedG3Option).toBe(record.selectedG3Option);
    expect(K4.selectedG3Option).toBe('RECOMMEND_K4_G3_PRECOMMIT_ALGORITHM_ONLY');
    expect(K4.jointSemantics).toBe(record.jointSemantics);
    expect(K4.jointSemantics).toBe(
      'K4_GATE_LOCAL_GREATEST_FIXED_POINT_WITH_G3_PRESEMANTIC_PROCEDURE_COMMITMENT_V1',
    );
    expect(Object.isFrozen(K4)).toBe(true);
  });

  it('gate locality, fixed point, retained items, ratio and numerator', () => {
    expect(contracts.ORGANISATION_SHARE_TRUNCATION_SCOPE).toBe('GATE_LOCAL');
    expect(K4.truncationScope).toBe(decision.clause_gateLocality.scope);
    expect(decision.clause_gateLocality.token).toBe('GATE_LOCAL_DENOMINATOR_TRUNCATION');
    expect(contracts.ORGANISATION_SHARE_TRUNCATION_POLICY).toBe(
      'GREATEST_FIXED_POINT_MAXIMAL_PREFIX_RETENTION',
    );
    expect(K4.truncationPolicy).toBe(decision.clause_greatestFixedPoint.policyToken);
    expect(contracts.ORGANISATION_SHARE_RETAINED_ITEM_POLICY).toBe(
      'EARLIEST_GATE_CONTRIBUTING_ITEMS_BY_FROZEN_SAMPLE_RANK',
    );
    expect(K4.retainedItemPolicy).toBe(decision.clause_sameDeterministicRank.retainedItemPolicy);
    expect(contracts.ORGANISATION_SHARE_EXACT_RATIO_POLICY).toBe(
      'TEN_TIMES_CONTRIBUTION_LE_FINAL_GATE_DENOMINATOR',
    );
    expect(K4.exactRatioPolicy).toBe(decision.clause_exactRatio.policyToken);
    expect(contracts.ORGANISATION_SHARE_NUMERATOR_POLICY).toBe(
      'TRUNCATED_ITEM_EXCLUDED_FROM_GATE_NUMERATOR_AND_DENOMINATOR',
    );
    expect(K4.numeratorPolicy).toBe(decision.clause_numerator.policyToken);
  });

  it('G3 freeze and realised policies, the expected 66, G1 and disclosure', () => {
    expect(contracts.G3_FREEZE_ORGANISATION_SHARE_POLICY).toBe(
      'PRECOMMIT_PROCEDURE_NO_PRESEMANTIC_ITEM_MASK',
    );
    expect(K4.g3FreezePolicy).toBe(decision.clause_g3Freeze.policy);
    expect(contracts.G3_EXPECTED_DENOMINATOR_66_ROLE).toBe(
      'EXPECTED_PLANNING_PROFILE_ONLY_NOT_K4_TRUNCATION_INPUT',
    );
    expect(K4.g3ExpectedDenominator66Role).toBe(decision.clause_expectedDenominator66.role);
    expect(contracts.G3_REALISED_ORGANISATION_SHARE_POLICY).toBe(
      'APPLY_GATE_LOCAL_GREATEST_FIXED_POINT_TO_REALISED_DENOMINATOR',
    );
    expect(K4.g3RealisedPolicy).toBe(decision.clause_g3Freeze.realisedPolicyToken);
    expect(contracts.G1_ORGANISATION_SHARE_POLICY).toBe(
      'TRUNCATION_PATH_MUST_BE_UNREACHABLE_NO_UNION_RANK_INVENTED',
    );
    expect(K4.g1Policy).toBe(decision.clause_g1.contractToken);
    expect(decision.clause_g1.policy).toBe(
      'G1_SD4_TRUNCATION_PATH_MUST_BE_UNREACHABLE_UNDER_CONFORMANT_INPUT',
    );
    expect(contracts.ORGANISATION_SHARE_DISCLOSURE_POLICY).toBe(
      'SEALED_INTERNAL_DEFAULT_WITHHOLD_FROM_PROMPT_DEVELOPMENT',
    );
    expect(K4.disclosurePolicy).toBe(decision.clause_disclosure.policyToken);
  });

  it('the share cap is the existing exact rational 1/10, by identity; no new parameter', () => {
    expect(K4.shareCap).toBe(contracts.ORGANISATION_GATE_SHARE_CAP);
    expect(decision.clause_exactRatio.contractRational).toEqual(
      contracts.ORGANISATION_GATE_SHARE_CAP,
    );
    expect(decision.clause_exactRatio.canonicalCondition).toBe(
      '10 * organisationContribution <= finalGateDenominator',
    );
    expect(decision.clause_exactRatio.floatingPointPermitted).toBe(false);
    expect(decision.clause_exactRatio.newNumericalParameterCreated).toBe(false);
  });
});

describe('2D-A3 K4: the record pins the semantics R15 must implement', () => {
  it('the count-level greatest fixed point, exactly', () => {
    const fp = decision.clause_greatestFixedPoint;
    expect(fp.q0).toBe('floor(sum_i c_i / 10)');
    expect(fp.recurrence).toBe('q_(t+1) = floor(sum_i min(c_i, q_t) / 10)');
    expect(fp.convergence).toBe('stop at the first t with q_(t+1) = q_t; call it q*');
    expect(fp.retainedCount).toBe('x_i = min(c_i, q*)');
    expect(fp.finalDenominator).toBe('D* = sum_i x_i');
    expect(fp.finalAssertion).toBe('for every organisation i: 10*x_i <= sum_j x_j');
    expect([...fp.properties]).toEqual([
      'DETERMINISTIC',
      'FINITE',
      'ORDER_INDEPENDENT',
      'NO_ORGANISATION_PROCESSING_ORDER_PARAMETER',
      'UNIQUE_GREATEST_FEASIBLE_RETAINED_VECTOR',
      'MAXIMAL_RETENTION_MINIMAL_TRUNCATION',
      'PREFIX_PRESERVING',
      'EXACT_RATIONAL_FINAL_CONDITION',
    ]);
    expect(fp.organisationProcessingOrderParameter).toBe(false);
    expect(fp.oneOriginalDenominatorApproximationPermitted).toBe(false);
  });

  it('the one-pass counterexample is pinned: 3 + 17*1, one-pass 19 < 20, fixed point 18', () => {
    const cx = decision.clause_onePassRejected.counterexample;
    expect(cx.D0).toBe(20);
    expect(cx.denominatorAfterOnePass).toBe(19);
    expect(10 * Math.floor(cx.D0 / 10)).toBeGreaterThan(cx.denominatorAfterOnePass);
    expect([...cx.greatestFixedPointSequence]).toEqual([2, 1]);
    expect(cx.qStar).toBe(1);
    expect(cx.finalDenominator).toBe(18);
    expect(10 * cx.qStar).toBeLessThanOrEqual(cx.finalDenominator);
  });

  it('gate-local truncation removes nothing from the samples or the union; one inference', () => {
    expect([...decision.clause_gateLocality.truncationDoesNotRemoveItemFrom]).toEqual([
      'SET_P',
      'SET_R',
      'THE_FROZEN_EVALUATION_UNION',
      'ANY_OTHER_GATE_DENOMINATOR_UNLESS_THAT_GATE_INDEPENDENTLY_APPLIES_SD4',
    ]);
    expect(decision.clause_gateLocality.itemInferredExactlyOnce).toBe(true);
  });

  it('the numerator follows the retained denominator; no denominator-only removal', () => {
    expect(decision.clause_numerator.truncatedItemInGateNumerator).toBe(false);
    expect(decision.clause_numerator.denominatorOnlyRemovalPermitted).toBe(false);
  });

  it('truncation is outcome-blind', () => {
    expect([...decision.clause_outcomeBlindness.permittedInputs]).toEqual([
      'GATE_DENOMINATOR_MEMBERSHIP_UNDER_THE_FROZEN_GATE_DEFINITION',
      'ORGANISATION',
      'FROZEN_DETERMINISTIC_SAMPLE_RANK',
      'EXACT_SD4_SHARE_ARITHMETIC',
    ]);
    expect(decision.clause_outcomeBlindness.forbiddenInputs).toEqual(
      expect.arrayContaining([
        'CANDIDATE_CORRECTNESS',
        'GOLD_AGREEMENT_OR_MISMATCH',
        'RESULTING_PASS_OR_FAIL',
        'CONFIDENCE_BOUND_EFFECT',
      ]),
    );
    expect(decision.clause_g3ScoringTimeOrder.candidateCorrectnessConsultedDuringStep4).toBe(false);
  });

  it('each gate reads its own sample rank; no second ranking; G1 has none', () => {
    const perGate = decision.clause_sameDeterministicRank.perGate;
    expect(
      Object.fromEntries(Object.entries(perGate).map(([gate, v]) => [gate, v.sampleRank])),
    ).toEqual({ G1: null, G2: 'SET_R', G3: 'SET_P', G4: 'SET_R', G5: 'SET_P', G6: 'SET_P' });
    expect(decision.clause_sameDeterministicRank.secondRankingInvented).toBe(false);
  });

  it('G1: no union rank, 10*12 <= 155, and reaching truncation refuses', () => {
    const g1 = decision.clause_g1;
    expect(g1.frozenSingleUnionRankExists).toBe(false);
    expect(g1.unionRankInvented).toBe(false);
    expect(g1.provedInvariant.perOrganisationMaximumUnionContribution).toBe(
      contracts.SET_P_MAX_PAGES_PER_ORGANISATION + contracts.SET_R_MAX_PAGES_PER_ORGANISATION,
    );
    expect(g1.provedInvariant.minimumAdmissibleSetPDenominator).toBe(155);
    expect(10 * g1.provedInvariant.perOrganisationMaximumUnionContribution).toBeLessThanOrEqual(
      g1.provedInvariant.minimumAdmissibleSetPDenominator,
    );
    expect(g1.provedInvariant.holds).toBe(true);
    expect(g1.ifReached).toBe('REFUSE_STRUCTURAL_INCONSISTENCY');
    expect([...g1.rejectedTieRules]).toEqual([
      'SET_P_FIRST',
      'SET_R_FIRST',
      'MIN_RANK',
      'MAX_RANK',
      'GOLD_ID_HASH',
      'INVENTED_UNION_RANK',
    ]);
  });

  it('non-G3 gates are SD4-safe at a conformant freeze: every inequality holds, identity required', () => {
    const planned = decision.clause_nonG3PlannedSafety;
    expect(Object.keys(planned.gates).sort()).toEqual(['G1', 'G2', 'G4', 'G5', 'G6']);
    for (const [gate, g] of Object.entries(planned.gates)) {
      expect(10 * g.maxPerOrganisation, gate).toBeLessThanOrEqual(g.minimumDenominator);
    }
    expect(planned.gates.G2!.maxPerOrganisation).toBe(contracts.SET_R_MAX_PAGES_PER_ORGANISATION);
    expect(planned.gates.G5!.maxPerOrganisation).toBe(contracts.SET_P_MAX_PAGES_PER_ORGANISATION);
    expect(planned.greatestFixedPointMustBeIdentityForG1G2G4G5G6AtConformantFreeze).toBe(true);
    expect(decision.clause_nonG3RealisedSafety.newResultCategoryAdded).toBe(false);
  });

  it('G3 at freeze: procedure only, no mask, no prefix, no refusal on potential concentration', () => {
    expect(record.revalidatedFrozenBasis.g3MembershipExistsPreSemantically).toBe(false);
    expect(decision.clause_g3Freeze.forbiddenAtFreeze).toEqual(
      expect.arrayContaining([
        'TRUNCATE_SET_P',
        'CREATE_A_G3_ELIGIBILITY_PREFIX',
        'USE_EXPECTED_DENOMINATOR_66_AS_A_QUOTA',
        'USE_GOLD_TO_ESTIMATE_CANDIDATE_UNIT_PAGE_OUTPUTS',
        'REFUSE_MERELY_BECAUSE_AN_ORGANISATION_COULD_EXCEED_ONE_TENTH_UNDER_SOME_FUTURE_CANDIDATE_RESULT',
      ]),
    );
  });

  it('the expected 66 is an R3 planning number that no K4 algorithm uses', () => {
    expect(record.revalidatedFrozenBasis.expectedG3Denominator66.value).toBe(66);
    expect(decision.clause_expectedDenominator66.usedByAnyK4Algorithm).toBe(false);
  });

  it('G3 scoring order: membership -> fixed point -> numerator/cbar -> section K -> gate', () => {
    const steps = decision.clause_g3ScoringTimeOrder.steps;
    expect(steps).toHaveLength(10);
    const at = (fragment: string): number => steps.findIndex((s) => s.includes(fragment));
    expect(at('DETERMINE_ACTUAL_G3_DENOMINATOR_MEMBERSHIP')).toBe(0);
    expect(at('GREATEST_FIXED_POINT')).toBe(3);
    expect(at('NUMERATOR_AND_G3_DENOMINATOR')).toBe(4);
    expect(at('CBAR')).toBe(7);
    expect(at('SECTION_K')).toBe(8);
    expect(at('CERTIFY_G3')).toBe(9);
  });

  it('a zero fixed point stays zero and is INADMISSIBLE; fewer than ten organisations adds no gate', () => {
    expect(decision.clause_zeroFixedPoint.relaxSd4).toBe(false);
    expect(decision.clause_zeroFixedPoint.retainOneItem).toBe(false);
    expect(decision.clause_zeroFixedPoint.metric).toBe('INADMISSIBLE');
    expect(decision.clause_fewerThanTenContributingOrganisations.newSeparateGate).toBe(false);
    expect(decision.clause_sectionKInteraction.sd4Waives).toEqual([]);
  });

  it('disclosure stays sealed; section O and V_ORG are unchanged', () => {
    expect(decision.clause_disclosure.newFeedbackChannel).toBe(false);
    expect(decision.clause_attemptConsumption.sectionOChanged).toBe(false);
    expect(decision.clause_attemptConsumption.DEV_CONFIRM).toBe('ATTEMPT_CONSUMED');
    expect(decision.clause_attemptConsumption.k4FailureIsAFreeRetry).toBe(false);
    expect(decision.clause_attemptConsumption.exceptionIntroduced).toBe(false);
    expect(decision.clause_vOrgUnchanged.k4ChangesVOrg).toBe(false);
  });
});

describe('2D-A3 K4: rejected alternatives are recorded and none is selected', () => {
  const REJECTED = [
    'ORIGINAL_DENOMINATOR_ONE_PASS',
    'FIXED_FLOOR_D0_OVER_10_TRUNCATION',
    'SUM_OR_AVERAGE_WEIGHTING',
    'ARBITRARY_ORGANISATION_PRIORITY',
    'G3_SIX_ITEM_PREFIX',
    'G3_PRECOMMITTED_WORST_CASE_GATE_LOCAL_PREFIX',
    'G3_MASK_FROM_EXPECTED_DENOMINATOR_66',
    'G3_FREEZE_REFUSAL_ON_POTENTIAL_VIOLATION',
    'SAMPLE_LEVEL_ITEM_DELETION',
    'CORRECTNESS_GUIDED_TRUNCATION',
    'GOLD_GUIDED_G3_TRUNCATION',
    'CAP_RELAXATION',
    'G1_INVENTED_UNION_RANK',
  ];

  it('the record rejects exactly these, each with a reason', () => {
    expect(decision.rejectedOptions.map((o) => o.token)).toEqual(REJECTED);
    for (const option of decision.rejectedOptions) {
      expect(option.reason.length, option.token).toBeGreaterThan(0);
    }
  });

  it('no rejected token appears in the contract or among the selected tokens', () => {
    const source = readFileSync(join(REPO_ROOT, A3PREP_REL, 'contracts.ts'), 'utf8');
    const selected = JSON.stringify(K4);
    for (const token of REJECTED) {
      expect(source, token).not.toContain(token);
      expect(selected, token).not.toContain(token);
    }
  });

  it('the historical organisationCaps.ts is non-authoritative and absent here', () => {
    expect(decision.clause_historicalOrganisationCaps.status).toBe(
      'HISTORICAL_NON_AUTHORITATIVE_PREP',
    );
    expect(decision.clause_historicalOrganisationCaps.blessed).toBe(false);
    expect(decision.clause_historicalOrganisationCaps.presentOnCanonicalLineage).toBe(false);
  });
});

describe('2D-A3 K4: A3 decision K4 is not methodology section-K condition K4', () => {
  it('the record and the contract both say so', () => {
    expect(record.nameCollisionWarning.notMethodologySectionKClassMinimum).toBe(true);
    expect(K4.notMethodologySectionKClassMinimum).toBe(true);
    expect(JSON.stringify(K4)).not.toMatch(/CLASS_MINIMUM|CLASS MINIMUM/);
  });
});

describe('2D-A3 K4: marker accounting and K-state', () => {
  it('4 historical, 4 resolved, 0 unresolved; K1-K4 resolved in id order; no K5', () => {
    expect(contracts.A3_PREP_OWNER_DECISION_MARKERS).toHaveLength(4);
    expect(contracts.A3_PREP_RESOLVED_OWNER_DECISION_MARKERS).toHaveLength(4);
    expect(contracts.A3_PREP_UNRESOLVED_OWNER_DECISION_MARKERS).toHaveLength(0);
    expect(contracts.A3_PREP_OWNER_DECISIONS_REQUIRED).toEqual([]);
    expect(contracts.A3_PREP_OWNER_DECISIONS_RESOLVED.map((d) => [d.id, d.resolved])).toEqual([
      ['K1', true],
      ['K2', true],
      ['K3', true],
      ['K4', true],
    ]);
    expect(contracts.A3_PREP_OWNER_DECISIONS_RESOLVED[3]).toBe(K4);
    expect(Object.keys(contracts).filter((name) => /^K5/.test(name))).toEqual([]);
    const source = readFileSync(join(REPO_ROOT, A3PREP_REL, 'contracts.ts'), 'utf8');
    expect(source.match(/A3_PREP_OWNER_DECISION_REQUIRED:/g)).toHaveLength(4);
  });

  it('no fake K4 requirement with resolved: true exists anywhere', () => {
    for (const requirement of contracts.A3_PREP_OWNER_DECISIONS_REQUIRED as readonly {
      id: string;
    }[]) {
      expect(requirement.id).not.toBe('K4');
    }
    expect(deriveCurrentOwnerDecisionBlockers()).toEqual([]);
  });
});

describe('2D-A3 K4: semantics resolved, enforcement NOT implemented', () => {
  it('K4 enforcement stays in notCheckedByCurrentPrep', () => {
    expect(A3_CORPUS_FREEZE_PREFLIGHT_NOT_CHECKED_BY_CURRENT_PREP).toContain('K4_ENFORCEMENT');
    expect(A3_CORPUS_FREEZE_PREFLIGHT_NOT_CHECKED_BY_CURRENT_PREP).toContain(
      'FINAL_GATE_DENOMINATORS',
    );
  });

  it('no organisationCaps.ts, no syntheticFixtures.ts, no function in the contract', () => {
    const files = readdirSync(join(REPO_ROOT, A3PREP_REL));
    expect(files).not.toContain('organisationCaps.ts');
    expect(files).not.toContain('syntheticFixtures.ts');
    const source = readFileSync(join(REPO_ROOT, A3PREP_REL, 'contracts.ts'), 'utf8');
    expect(source).not.toMatch(/export function|=>\s*\{|Math\.floor|Math\.min/);
    for (const [name, value] of Object.entries(contracts)) {
      expect(typeof value, name).not.toBe('function');
    }
  });

  it('the canonical a3prep namespace is exactly R13’s', () => {
    expect(
      readdirSync(join(REPO_ROOT, A3PREP_REL))
        .filter((f) => f.endsWith('.ts'))
        .sort(),
    ).toEqual([
      'contracts.ts',
      'corpusFreezePreflight.ts',
      'manifestTypes.ts',
      'rank.ts',
      'sd7.ts',
      'sd9.ts',
      'setP.ts',
      'setPSd7.ts',
      'setR.ts',
      'setRScore.ts',
      'setRSd7.ts',
      'setRSd7Readiness.ts',
      'splitScope.ts',
      'types.ts',
    ]);
  });
});
