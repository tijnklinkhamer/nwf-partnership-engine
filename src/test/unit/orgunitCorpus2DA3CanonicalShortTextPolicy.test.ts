/**
 * PHASE 2B-2D A3 — SD7 SHORT-TEXT SAMPLE-MEMBERSHIP OWNER POLICY BINDING.
 *
 * The owner resolved the HANDLING of `SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP` by an
 * append-only record (`SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_AMBIGUITY_PROPAGATION_V1`).
 * This file proves the canonical contracts carry that policy truthfully and
 * nothing more:
 *
 *   - RESOLVED: the operational policy (propagate ambiguity, materialise only
 *     treatment-invariant membership, refuse freeze while BLOCKED);
 *   - UNRESOLVED: every short-text document's semantic near-duplicate status,
 *     and in BLOCKED cases its final sample membership;
 *   - the earlier short-text SD9 record and the K3 record are untouched;
 *   - K1, K2, K4 stay unresolved and no K5 exists;
 *   - R8's two EXACT cases are exactly the cases the policy's treatment space
 *     leaves invariant - proved by exhaustive enumeration over synthetic
 *     scenarios, without changing R8.
 *
 * It checks key fields of the record, never a second copy of it. Every
 * identity here is INVENTED; no corpus, database or network is touched.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as contracts from '../harness/phase2b2d/a3prep/contracts.js';
import { rankSetPFull } from '../harness/phase2b2d/a3prep/setP.js';
import { prepareSetPSd7, SET_P_DOCUMENT_CAP_EXACT } from '../harness/phase2b2d/a3prep/setPSd7.js';
import type {
  A3DistinctDocument,
  A3DocumentSha256,
  A3PageEvidenceId,
  A3SelectionIndex,
} from '../harness/phase2b2d/a3prep/types.js';
import * as drawContract from '../harness/phase2b2d/draw/drawContract.js';
import type { NearDuplicateGraphMeasurement } from '../harness/phase2b2d/sd7/nearDuplicatePairs.js';
import * as sd7Contract from '../harness/phase2b2d/sd7/sd7Contract.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const POLICY = contracts.SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY;

const ORIGINAL_SHORT_TEXT_RECORD = Object.freeze({
  path: 'docs/evaluation/PHASE_2B_2D_METHOD_V2_SD7_SHORT_TEXT_OWNER_DECISION_V1.json',
  sha256: '2f41f495322eceae3b675cbe1d227115f3b4292d6e3a711879793af33b466fff',
});

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from }, (_, i) => from + i);

function fileSha256(relativePath: string): string {
  return createHash('sha256')
    .update(readFileSync(join(REPO_ROOT, relativePath)))
    .digest('hex');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(REPO_ROOT, relativePath), 'utf8')) as T;
}

interface BoundFile {
  readonly path: string;
  readonly sha256: string;
}

interface PolicyRecord {
  readonly recordKind: string;
  readonly decisionToken: string;
  readonly selectedOption: string;
  readonly classification: string;
  readonly explicitlyNotClassifiedAs: readonly string[];
  readonly thisFileAuthorises: readonly string[];
  readonly answersResidualIssue: {
    readonly token: string;
    readonly k3DecidedShortTextSampleMembership: boolean;
    readonly thePriorSd9OwnerDecisionDecidedSampleMembership: boolean;
    readonly afterThisRecord: Readonly<Record<string, string>>;
    readonly addedAsANumberedK5ContractMarker: boolean;
  };
  readonly analysisRecommendation: {
    readonly recommended: string;
    readonly optionsConsidered: Readonly<
      Record<string, { readonly rejected: boolean; readonly selected?: boolean }>
    >;
  };
  readonly ownerDecision: {
    readonly clause1_semanticStatusRemainsUnresolved: {
      readonly semanticStatusRemains: string;
      readonly canonicalSimilarityValueForTheUnresolvedCase: null;
      readonly globalVerdictAssigned: null;
      readonly verdictsNotAssigned: readonly string[];
    };
    readonly clause2_preSd7RankEligibility: {
      readonly newMinimumTokenEligibilityFilterIntroduced: boolean;
      readonly candidateBImplemented: boolean;
      readonly shortTextDocumentKeepsItsPositionInTheSamplesFrozenTotalRank: boolean;
    };
    readonly clause3_canonicalGraphRemainsMeasurableOnly: {
      readonly r6GraphRuleChanged: boolean;
      readonly edgesAddedForShortText: number;
      readonly nonEdgeInterpretedSemantically: boolean;
    };
    readonly clause4_admissibleMembershipTreatmentSpace: {
      readonly token: string;
      readonly isASemanticGraph: boolean;
      readonly isTheTrueSemanticState: boolean;
      readonly perUnresolvedDocumentTreatments: readonly string[];
      readonly treatmentsAreIndependentPerDocument: boolean;
      readonly admitsArbitrarySubsetsOfUnresolvedDocuments: boolean;
      readonly pairwiseSimilarityAmongShortTextDocumentsDefined: boolean;
      readonly presentTreatment: Readonly<Record<string, boolean>>;
      readonly absentTreatment: Readonly<Record<string, boolean>>;
    };
    readonly clause5_whyMeasurableSurvivorsAreNotEvicted: {
      readonly priorRatifiedSd9Envelope: { readonly ratifiedScope: string };
      readonly priorDecisionRewritten: boolean;
      readonly priorDecisionAlreadyDecidedSampleMembership: boolean;
      readonly thisIsAClaimThatShortTextIsNotANearDuplicate: boolean;
    };
    readonly clause6_invariantOnlyMaterialisation: {
      readonly rule: string;
      readonly policyKind: string;
      readonly treatmentSpace: string;
      readonly otherwise: string;
    };
    readonly clause7_acceptR8ExactCapProofs: {
      readonly boundK3Procedure: string;
      readonly acceptedMechanicallyExactCases: Readonly<
        Record<string, { readonly r8Reason: string }>
      >;
      readonly otherwiseR8Returns: string;
      readonly r8ProofIsConsistentWithThisPolicy: boolean;
      readonly thisIsAShortTextSemanticDecision: boolean;
      readonly r8CodeChangedByThisRecord: boolean;
    };
    readonly clause8_extensionBoundary: {
      readonly initialCapExactnessImpliesWholeRankExactness: boolean;
      readonly implementationDeferredTo: string;
    };
    readonly clause9_acquisitionStatusUnchanged: Readonly<Record<string, boolean | string>>;
    readonly clause10_noReplacement: {
      readonly createsAReplacementReason: boolean;
      readonly consumesAReserve: boolean;
      readonly replacesTheOrganisation: boolean;
      readonly newFailureTaxonomyValue: null;
      readonly boundPlanV1Rules: {
        readonly replacementReasonTaxonomyIsMechanicalOnly: readonly string[];
        readonly noReplacementReasonMayBeSemantic: boolean;
      };
      readonly effectToken: string;
    };
    readonly clause11_corpusFreezeConsequence: {
      readonly refusalToken: string;
      readonly freezePolicy: string;
      readonly effectToken: string;
      readonly thenFreezeStops: boolean;
    };
    readonly clause12_noPostLabelDiscretion: { readonly postLabelDiscretionIntroduced: boolean };
    readonly clause13_sd9Unchanged: {
      readonly priorDecision: string;
      readonly priorDecisionRevised: boolean;
      readonly minPagesPerOrganisation: number;
      readonly sampleMembershipBlockedAndSd9PendingAreDistinct: boolean;
    };
    readonly clause14_setRFutureApplication: {
      readonly makesSetRConstructibleToday: boolean;
      readonly setRImplementationAuthorised: boolean;
    };
    readonly clause15_kState: Readonly<Record<string, unknown>>;
    readonly clause16_noMethodologyFallbackRule: {
      readonly authorises: readonly string[];
      readonly doesNotAuthorise: readonly string[];
    };
  };
  readonly whatThisDoesNotChange: Readonly<Record<string, boolean | string>>;
  readonly boundAuthority: Readonly<Record<string, BoundFile | string | boolean>>;
}

const record = readJson<PolicyRecord>(POLICY.decisionRecordPath);
const decision = record.ownerDecision;

// ---------------------------------------------------------------------------

describe('2D-A3 short-text policy: the committed owner record', () => {
  it('(1) exists and its file SHA-256 equals the contract binding', () => {
    expect(fileSha256(POLICY.decisionRecordPath)).toBe(POLICY.decisionRecordSha256);
    expect(POLICY.decisionRecordPath).toBe(
      'docs/evaluation/PHASE_2B_2D_A3_SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_OWNER_POLICY_V1.json',
    );
    expect(POLICY.decisionRecordCommit).toMatch(/^[0-9a-f]{40}$/);
  });

  it('(2) carries the selected Option C token and the decision token', () => {
    expect(POLICY.selectedOption).toBe(
      'RECOMMEND_SHORT_TEXT_OPTION_C_PROPAGATE_AMBIGUITY_AND_MATERIALISE_ONLY_INVARIANTS',
    );
    expect(record.selectedOption).toBe(POLICY.selectedOption);
    expect(record.decisionToken).toBe(POLICY.decisionToken);
    expect(POLICY.decisionToken).toBe('SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_AMBIGUITY_PROPAGATION_V1');
    expect(record.analysisRecommendation.recommended).toBe('C');
    const options = record.analysisRecommendation.optionsConsidered;
    expect(Object.keys(options).sort()).toEqual(['A', 'B', 'C', 'D', 'E']);
    for (const id of ['A', 'B', 'D', 'E']) expect(options[id]!.rejected, id).toBe(true);
    expect(options.C).toMatchObject({ rejected: false, selected: true });
  });

  it('is an operational policy extension, never a methodology amendment, and authorises nothing', () => {
    expect(record.recordKind).toBe('OWNER_OPERATIONAL_POLICY_EXTENSION');
    expect(record.classification).toBe(
      'OWNER_OPERATIONAL_POLICY_EXTENSION_OF_EXISTING_FAIL_CLOSED_SHORT_TEXT_HANDLING',
    );
    for (const not of [
      'METHODOLOGY_AMENDMENT',
      'R4',
      'SD9_THRESHOLD_CHANGE',
      'EXECUTION_AUTHORITY',
    ]) {
      expect(record.explicitlyNotClassifiedAs).toContain(not);
    }
    expect(record.thisFileAuthorises).toEqual([]);
  });

  it('binds R3, its approval, Plan V1 and its approval by the canonical hashes', () => {
    const bound = record.boundAuthority as Record<string, BoundFile>;
    expect(bound.methodologyR3).toMatchObject({
      path: drawContract.METHODOLOGY_R3_PATH,
      sha256: drawContract.METHODOLOGY_R3_SHA256,
    });
    expect(bound.methodologyFreezeApproval).toMatchObject({
      path: drawContract.METHODOLOGY_APPROVAL_PATH,
      sha256: drawContract.METHODOLOGY_APPROVAL_SHA256,
    });
    expect(bound.corpusPlanV1).toMatchObject({
      path: drawContract.CORPUS_PLAN_PATH,
      sha256: drawContract.CORPUS_PLAN_SHA256,
    });
    expect(bound.corpusPlanApproval).toMatchObject({
      path: drawContract.CORPUS_PLAN_APPROVAL_PATH,
      sha256: drawContract.CORPUS_PLAN_APPROVAL_SHA256,
    });
    expect(bound.k3OwnerClarification).toMatchObject({
      path: contracts.K3_OWNER_DECISION.decisionRecordPath,
      sha256: contracts.K3_OWNER_DECISION.decisionRecordSha256,
    });
    expect(bound.sd7ShortTextOwnerDecision).toMatchObject(ORIGINAL_SHORT_TEXT_RECORD);
  });

  it('every bound file still hashes to the value the record carries', () => {
    const files = Object.values(record.boundAuthority).filter(
      (v): v is BoundFile => typeof v === 'object' && v !== null && 'sha256' in v,
    );
    expect(files).toHaveLength(11);
    for (const file of files) expect(fileSha256(file.path), file.path).toBe(file.sha256);
    expect(record.boundAuthority.k3OwnerRecordCommit).toBe(
      contracts.K3_OWNER_DECISION.decisionRecordCommit,
    );
    expect(record.boundAuthority.canonicalR7ImplementationCommit).toBe(
      'd513e01655711d7caf7323e12381043e7b20eb91',
    );
    expect(record.boundAuthority.canonicalR8ImplementationCommit).toBe(
      '8b636326e65d6a948fda2764b78d013d51e47ea5',
    );
    expect(record.boundAuthority.canonicalR8TerminalCommit).toBe(
      '03da163497901d7f53bf1a94c604dee3b0da1a6c',
    );
  });
});

describe('2D-A3 short-text policy: earlier owner records stay immutable', () => {
  it('(3) the original short-text SD9 owner record is byte-unchanged and still says what it said', () => {
    expect(fileSha256(ORIGINAL_SHORT_TEXT_RECORD.path)).toBe(ORIGINAL_SHORT_TEXT_RECORD.sha256);
    const original = readJson<{
      ownerDecision: { decision: string; shortTextStillUnresolvedSemantically: boolean };
    }>(ORIGINAL_SHORT_TEXT_RECORD.path);
    expect(original.ownerDecision.decision).toBe(
      'SHORT_TEXT_AMBIGUITY_BLOCKS_ONLY_WHEN_IT_CAN_CHANGE_SD9',
    );
    expect(original.ownerDecision.shortTextStillUnresolvedSemantically).toBe(true);
    expect(decision.clause13_sd9Unchanged.priorDecision).toBe(original.ownerDecision.decision);
    expect(decision.clause13_sd9Unchanged.priorDecisionRevised).toBe(false);
  });

  it('(4) the K3 record is byte-unchanged and still did not decide short-text membership', () => {
    const k3 = contracts.K3_OWNER_DECISION;
    expect(fileSha256(k3.decisionRecordPath)).toBe(k3.decisionRecordSha256);
    const k3Record = readJson<{
      ownerDecision: {
        clause10_shortTextRemainsUnresolved: { k3DecidesShortTextSampleMembership: boolean };
        clause12_whatK3DoesNotDecide: { residualAdjacentIssue: { token: string } };
      };
    }>(k3.decisionRecordPath);
    expect(
      k3Record.ownerDecision.clause10_shortTextRemainsUnresolved.k3DecidesShortTextSampleMembership,
    ).toBe(false);
    expect(k3Record.ownerDecision.clause12_whatK3DoesNotDecide.residualAdjacentIssue.token).toBe(
      POLICY.answersResidualIssue,
    );
  });

  it('neither earlier decision is claimed to have already decided sample membership', () => {
    expect(record.answersResidualIssue.k3DecidedShortTextSampleMembership).toBe(false);
    expect(record.answersResidualIssue.thePriorSd9OwnerDecisionDecidedSampleMembership).toBe(false);
    const c5 = decision.clause5_whyMeasurableSurvivorsAreNotEvicted;
    expect(c5.priorDecisionAlreadyDecidedSampleMembership).toBe(false);
    expect(c5.priorDecisionRewritten).toBe(false);
    expect(c5.priorRatifiedSd9Envelope.ratifiedScope).toBe('SD9_ONLY');
  });
});

describe('2D-A3 short-text policy: semantic status stays unresolved', () => {
  it('(5) the semantic near-duplicate status is UNRESOLVED; only the handling is resolved', () => {
    expect(POLICY.resolved).toBe(true);
    expect(POLICY.semanticNearDuplicateStatus).toBe('REMAINS_UNRESOLVED');
    expect(contracts.SHORT_TEXT_SEMANTIC_NEAR_DUPLICATE_STATUS).toBe('UNRESOLVED');
    expect(record.answersResidualIssue.afterThisRecord).toEqual({
      operationalHandlingPolicy: 'RESOLVED',
      semanticNearDuplicateStatus: 'UNRESOLVED',
      perDocumentSampleMembershipWhereNotInvariant: 'UNRESOLVED_BLOCKED',
    });
    expect(decision.clause1_semanticStatusRemainsUnresolved.semanticStatusRemains).toBe(
      'SD7_SHORT_TEXT_UNRESOLVED',
    );
  });

  it('(6) no include, exclude, unique or near-duplicate verdict is assigned', () => {
    const c1 = decision.clause1_semanticStatusRemainsUnresolved;
    expect(c1.globalVerdictAssigned).toBeNull();
    expect(c1.canonicalSimilarityValueForTheUnresolvedCase).toBeNull();
    expect([...c1.verdictsNotAssigned].sort()).toEqual([
      'DROP',
      'KEEP',
      'NEAR_DUPLICATE',
      'UNIQUE',
    ]);
    expect(record.whatThisDoesNotChange.shortTextGloballyIncluded).toBe(false);
    expect(record.whatThisDoesNotChange.shortTextGloballyExcluded).toBe(false);
    expect(record.whatThisDoesNotChange.shortTextUniquenessDefined).toBe(false);
    expect(record.whatThisDoesNotChange.shortTextNearDuplicateStatusDefined).toBe(false);
    expect(record.whatThisDoesNotChange.similarityValueDefined).toBe(false);
  });

  it('adds no eligibility filter (not Candidate B) and leaves the R6 graph measurable-only', () => {
    const c2 = decision.clause2_preSd7RankEligibility;
    expect(c2.newMinimumTokenEligibilityFilterIntroduced).toBe(false);
    expect(c2.candidateBImplemented).toBe(false);
    expect(c2.shortTextDocumentKeepsItsPositionInTheSamplesFrozenTotalRank).toBe(true);
    const c3 = decision.clause3_canonicalGraphRemainsMeasurableOnly;
    expect(c3.r6GraphRuleChanged).toBe(false);
    expect(c3.edgesAddedForShortText).toBe(0);
    expect(c3.nonEdgeInterpretedSemantically).toBe(false);
  });

  it('changes no frozen value: 5-token shingles, 0.90 inclusive, SD9 minimum 4', () => {
    expect(sd7Contract.MIN_PAGES_PER_ORGANISATION).toBe(4);
    expect(decision.clause13_sd9Unchanged.minPagesPerOrganisation).toBe(
      sd7Contract.MIN_PAGES_PER_ORGANISATION,
    );
    for (const key of [
      'r3Changed',
      'planV1Changed',
      'shingleSizeChanged',
      'jaccardThresholdChanged',
      'sd9ThresholdChanged',
      'newEligibilityFilterCreated',
      'r4Created',
    ]) {
      expect(record.whatThisDoesNotChange[key], key).toBe(false);
    }
  });
});

describe('2D-A3 short-text policy: the treatment space and materialisation rule', () => {
  it('(7) the treatment-space token is exact, and it is operational, not semantic', () => {
    expect(contracts.SHORT_TEXT_ADMISSIBLE_MEMBERSHIP_TREATMENT_SPACE).toBe(
      'SHORT_TEXT_ADMISSIBLE_MEMBERSHIP_TREATMENT_SPACE_V1',
    );
    expect(POLICY.treatmentSpace).toBe(contracts.SHORT_TEXT_ADMISSIBLE_MEMBERSHIP_TREATMENT_SPACE);
    const space = decision.clause4_admissibleMembershipTreatmentSpace;
    expect(space.token).toBe(POLICY.treatmentSpace);
    expect(space.perUnresolvedDocumentTreatments).toEqual([
      'ABSENT',
      'PRESENT_AT_FROZEN_SAMPLE_RANK_POSITION',
    ]);
    expect(space.isASemanticGraph).toBe(false);
    expect(space.isTheTrueSemanticState).toBe(false);
    expect(space.treatmentsAreIndependentPerDocument).toBe(true);
    expect(space.admitsArbitrarySubsetsOfUnresolvedDocuments).toBe(true);
    expect(space.pairwiseSimilarityAmongShortTextDocumentsDefined).toBe(false);
  });

  it('(8) a PRESENT treatment cannot evict, alter or reclassify a measurable survivor', () => {
    expect(contracts.SHORT_TEXT_PRESENT_TREATMENT_EFFECT_ON_MEASURABLE_SURVIVORS).toBe(
      'NO_EVICTION_OR_RECLASSIFICATION',
    );
    expect(POLICY.presentTreatmentEffectOnMeasurableSurvivors).toBe(
      contracts.SHORT_TEXT_PRESENT_TREATMENT_EFFECT_ON_MEASURABLE_SURVIVORS,
    );
    const present = decision.clause4_admissibleMembershipTreatmentSpace.presentTreatment;
    expect(present.evictsAMeasurableSurvivor).toBe(false);
    expect(present.altersAMeasurableSurvivor).toBe(false);
    expect(present.reclassifiesAMeasurableSurvivor).toBe(false);
    expect(present.createsACanonicalSimilarityEdge).toBe(false);
    // ...and neither treatment is a verdict.
    expect(present.meansUnique).toBe(false);
    expect(present.meansCanonicalSampleMembership).toBe(false);
    const absent = decision.clause4_admissibleMembershipTreatmentSpace.absentTreatment;
    expect(absent.meansNearDuplicate).toBe(false);
    expect(absent.meansCanonicallyExcluded).toBe(false);
    expect(
      decision.clause5_whyMeasurableSurvivorsAreNotEvicted
        .thisIsAClaimThatShortTextIsNotANearDuplicate,
    ).toBe(false);
  });

  it('(9) materialise-only-invariants is exact, BLOCKED otherwise', () => {
    expect(contracts.SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY_KIND).toBe(
      'PROPAGATE_AMBIGUITY_MATERIALISE_ONLY_INVARIANTS',
    );
    expect(POLICY.policy).toBe(contracts.SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY_KIND);
    expect(POLICY.materialisationRule).toBe(
      'MATERIALISE_ONLY_MEMBERSHIP_INVARIANT_ACROSS_ALL_ADMISSIBLE_SHORT_TEXT_TREATMENTS',
    );
    const c6 = decision.clause6_invariantOnlyMaterialisation;
    expect(c6.rule).toBe(POLICY.materialisationRule);
    expect(c6.policyKind).toBe(POLICY.policy);
    expect(c6.treatmentSpace).toBe(POLICY.treatmentSpace);
    expect(c6.otherwise).toBe('BLOCKED');
    expect(decision.clause12_noPostLabelDiscretion.postLabelDiscretionIntroduced).toBe(false);
  });

  it('defers the extension-boundary machinery to R9', () => {
    const c8 = decision.clause8_extensionBoundary;
    expect(c8.initialCapExactnessImpliesWholeRankExactness).toBe(false);
    expect(c8.implementationDeferredTo).toBe('R9');
  });
});

describe('2D-A3 short-text policy: consequences of BLOCKED', () => {
  it('(10) BLOCKED does not change acquisition status', () => {
    expect(contracts.SHORT_TEXT_BLOCKED_SAMPLE_ACQUISITION_EFFECT).toBe(
      'NO_ACQUISITION_STATUS_CHANGE',
    );
    expect(POLICY.acquisitionEffect).toBe(contracts.SHORT_TEXT_BLOCKED_SAMPLE_ACQUISITION_EFFECT);
    const c9 = decision.clause9_acquisitionStatusUnchanged;
    expect(c9.effectToken).toBe(POLICY.acquisitionEffect);
    expect(c9.blockedSampleMembershipIsAcquisitionUnsuccessful).toBe(false);
    expect(c9.blockedSampleMembershipReversesAcquisitionSuccessful).toBe(false);
    expect(c9.blockedSampleMembershipChangesSd9).toBe(false);
    expect(c9.acquisitionAndExactSampleMembershipAreSeparateStates).toBe(true);
    expect(decision.clause13_sd9Unchanged.sampleMembershipBlockedAndSd9PendingAreDistinct).toBe(
      true,
    );
  });

  it('(11) BLOCKED creates no replacement reason, bound to Plan V1’s mechanical taxonomy', () => {
    expect(contracts.SHORT_TEXT_BLOCKED_SAMPLE_REPLACEMENT_EFFECT).toBe('NO_REPLACEMENT_REASON');
    expect(POLICY.replacementEffect).toBe(contracts.SHORT_TEXT_BLOCKED_SAMPLE_REPLACEMENT_EFFECT);
    const c10 = decision.clause10_noReplacement;
    expect(c10.effectToken).toBe(POLICY.replacementEffect);
    expect(c10.createsAReplacementReason).toBe(false);
    expect(c10.consumesAReserve).toBe(false);
    expect(c10.replacesTheOrganisation).toBe(false);
    expect(c10.newFailureTaxonomyValue).toBeNull();
    const plan = readJson<{
      organisationReplacementPolicy?: unknown;
      [k: string]: unknown;
    }>(drawContract.CORPUS_PLAN_PATH);
    const planText = JSON.stringify(plan);
    expect(planText).toContain('"noReplacementReasonMayBeSemantic":true');
    for (const reason of c10.boundPlanV1Rules.replacementReasonTaxonomyIsMechanicalOnly) {
      expect(planText).toContain(`"${reason}"`);
      expect(reason).not.toMatch(/SHORT_TEXT|MEMBERSHIP/);
    }
  });

  it('(12) BLOCKED refuses corpus freeze with the exact owner token', () => {
    expect(contracts.SHORT_TEXT_BLOCKED_SAMPLE_FREEZE_EFFECT).toBe('REFUSE_CORPUS_FREEZE');
    expect(contracts.SHORT_TEXT_BLOCKED_SAMPLE_FREEZE_REFUSAL).toBe(
      'CORPUS_FREEZE_REFUSED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED',
    );
    expect(POLICY.freezePolicy).toBe('REFUSE_IF_REQUIRED_MEMBERSHIP_BLOCKED');
    const c11 = decision.clause11_corpusFreezeConsequence;
    expect(c11.refusalToken).toBe(POLICY.freezeRefusal);
    expect(c11.freezePolicy).toBe(POLICY.freezePolicy);
    expect(c11.effectToken).toBe(POLICY.freezeEffect);
    expect(c11.thenFreezeStops).toBe(true);
  });
});

describe('2D-A3 short-text policy: K-state and scope', () => {
  it('(13) the record left K1, K2, K4 unresolved; K1 and K2 were resolved later, K4 still is not', () => {
    // Today's contract: only K4 is open. K1 and K2 were answered by their own
    // owner records after this policy landed.
    expect(contracts.A3_PREP_OWNER_DECISIONS_REQUIRED.map((d) => [d.id, d.resolved])).toEqual([
      ['K4', false],
    ]);
    expect(contracts.A3_PREP_OWNER_DECISIONS_RESOLVED.map((d) => d.id)).toEqual(['K1', 'K2', 'K3']);
    // The immutable policy record's own K state, as of when it was written.
    expect(decision.clause15_kState).toMatchObject({
      K1: 'UNRESOLVED',
      K2: 'UNRESOLVED',
      K3: 'RESOLVED',
      K4: 'UNRESOLVED',
      numberedK5Created: false,
    });
    expect(decision.clause14_setRFutureApplication.makesSetRConstructibleToday).toBe(false);
    expect(decision.clause14_setRFutureApplication.setRImplementationAuthorised).toBe(false);
  });

  it('(14) no K5 exists, and the policy is not a K marker', () => {
    expect(Object.keys(contracts).filter((name) => /^K5/.test(name))).toEqual([]);
    expect(contracts.A3_PREP_OWNER_DECISION_MARKERS).toHaveLength(4);
    expect(contracts.A3_PREP_OWNER_DECISION_MARKERS.join('\n')).not.toMatch(/SHORT_TEXT/);
    expect(record.answersResidualIssue.addedAsANumberedK5ContractMarker).toBe(false);
    expect(Object.keys(POLICY)).not.toContain('id');
    expect(Object.keys(POLICY)).not.toContain('marker');
  });

  it('(15) no real A3, corpus freeze or methodology version is authorised', () => {
    expect(record.thisFileAuthorises).toEqual([]);
    expect(record.whatThisDoesNotChange.realA3Authorised).toBe(false);
    expect(record.whatThisDoesNotChange.corpusFreezeAuthorised).toBe(false);
    expect(record.whatThisDoesNotChange.newMethodologyVersion).toBe(false);
  });

  it('the short-text exports are exactly the reviewed policy facts, and are plain frozen data', () => {
    expect(
      Object.keys(contracts)
        .filter((name) => /SHORT_TEXT/.test(name))
        .sort(),
    ).toEqual([
      'SHORT_TEXT_ADMISSIBLE_MEMBERSHIP_TREATMENT_SPACE',
      'SHORT_TEXT_BLOCKED_SAMPLE_ACQUISITION_EFFECT',
      'SHORT_TEXT_BLOCKED_SAMPLE_FREEZE_EFFECT',
      'SHORT_TEXT_BLOCKED_SAMPLE_FREEZE_REFUSAL',
      'SHORT_TEXT_BLOCKED_SAMPLE_REPLACEMENT_EFFECT',
      'SHORT_TEXT_PRESENT_TREATMENT_EFFECT_ON_MEASURABLE_SURVIVORS',
      'SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY',
      'SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY_KIND',
      'SHORT_TEXT_SEMANTIC_NEAR_DUPLICATE_STATUS',
    ]);
    expect(Object.isFrozen(POLICY)).toBe(true);
    for (const value of Object.values(POLICY)) expect(typeof value).not.toBe('function');
  });
});

// ---------------------------------------------------------------------------
// NEGATIVE POLICY ASSERTIONS. Exact reviewed values, not a string denylist:
// every policy-valued field is pinned, so a verdict could only appear by
// changing one of these reviewed values.
// ---------------------------------------------------------------------------

describe('2D-A3 short-text policy: forbidden claims', () => {
  const FORBIDDEN_VERDICTS = [
    'ALWAYS_INCLUDE',
    'ALWAYS_EXCLUDE',
    'UNIQUE',
    'NEAR_DUPLICATE',
    'JACCARD_EMPTY_EQUALS_ZERO',
    'JACCARD_EMPTY_EQUALS_ONE',
  ];

  it('no contract value is a verdict or a Jaccard convention', () => {
    const values = [
      ...Object.values(POLICY).filter((v): v is string => typeof v === 'string'),
      contracts.SHORT_TEXT_SEMANTIC_NEAR_DUPLICATE_STATUS,
    ];
    for (const value of values) expect(FORBIDDEN_VERDICTS, value).not.toContain(value);
    expect(POLICY.semanticNearDuplicateStatus).not.toMatch(/^(UNIQUE|NEAR_DUPLICATE)$/);
  });

  it('the record defines no fallback similarity and authorises none', () => {
    const c16 = decision.clause16_noMethodologyFallbackRule;
    expect(c16.authorises).toEqual([]);
    expect([...c16.doesNotAuthorise].sort()).toEqual(
      [
        'always-exclude',
        'always-include',
        'character shingles',
        'exact normalised-text matching',
        'smaller token n-grams',
        'special empty-set Jaccard',
        'token-set similarity',
      ].sort(),
    );
  });

  it('no semantic replacement reason exists in the record or the contract', () => {
    expect(POLICY.replacementEffect).toBe('NO_REPLACEMENT_REASON');
    expect(decision.clause10_noReplacement.boundPlanV1Rules.noReplacementReasonMayBeSemantic).toBe(
      true,
    );
    expect(
      decision.clause10_noReplacement.boundPlanV1Rules.replacementReasonTaxonomyIsMechanicalOnly,
    ).toEqual([
      'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET',
      'ACQUISITION_UNSUCCESSFUL_ROOT_AUTHORITY_FAILURE',
      'ACQUISITION_UNSUCCESSFUL_ROBOTS_DISALLOWED',
      'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE',
    ]);
  });
});

// ---------------------------------------------------------------------------
// R8 PROOF BINDING. The owner record accepts R8's two EXACT cases. This proves,
// by exhaustive enumeration of the policy's treatment space over synthetic
// scenarios, that R8's EXACT/BLOCKED answer is EXACTLY "invariant across every
// admissible treatment" - without touching R8's code.
//
// Under SHORT_TEXT_ADMISSIBLE_MEMBERSHIP_TREATMENT_SPACE_V1, a treatment is a
// subset of unresolved short-text positions that are PRESENT; a PRESENT one
// takes its frozen rank position and evicts no measurable survivor. The
// resulting sample order is therefore the measurable survivors plus the
// present positions, in source-rank order.
// ---------------------------------------------------------------------------

describe('2D-A3 short-text policy: R8 exactness equals invariance under the treatment space', () => {
  const clause7 = decision.clause7_acceptR8ExactCapProofs;

  it('the record accepts exactly R8’s two reasons, bound to the K3 GREEDY procedure', () => {
    expect(clause7.boundK3Procedure).toBe(contracts.K3_SD7_SURVIVOR_PROCEDURE);
    expect(POLICY.boundK3Procedure).toBe(contracts.K3_SD7_SURVIVOR_PROCEDURE);
    expect(
      Object.values(clause7.acceptedMechanicallyExactCases)
        .map((c) => c.r8Reason)
        .sort(),
    ).toEqual([
      'EIGHT_MEASURABLE_SURVIVORS_PRECEDE_ALL_UNRESOLVED_SHORT_TEXT',
      'NO_UNRESOLVED_SHORT_TEXT',
    ]);
    expect(clause7.otherwiseR8Returns).toBe(
      'SET_P_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP',
    );
    expect(clause7.r8ProofIsConsistentWithThisPolicy).toBe(true);
    expect(clause7.thisIsAShortTextSemanticDecision).toBe(false);
    expect(clause7.r8CodeChangedByThisRecord).toBe(false);
  });

  function sha(label: string): A3DocumentSha256 {
    return createHash('sha256')
      .update(`synthetic-a3-short-text-policy:${label}`, 'utf8')
      .digest('hex') as A3DocumentSha256;
  }

  interface Built {
    readonly pool: A3DistinctDocument[];
    readonly graph: NearDuplicateGraphMeasurement;
  }

  /** Short-text and edges are given in SET_P rank positions; graph order is reversed. */
  function build(
    tag: string,
    n: number,
    short: ReadonlySet<number>,
    edges: readonly (readonly [number, number])[],
  ): Built {
    const pool: A3DistinctDocument[] = Array.from({ length: n }, (_, i) => ({
      selectionIndex: 3 as A3SelectionIndex,
      split: 'DEV_TRAIN',
      documentSha256: sha(`${tag}:${i}`),
      sourcePageEvidenceIds: [`pe-${tag}-${i}` as A3PageEvidenceId],
    }));
    const shaAtRank = rankSetPFull(pool).map((r) => r.documentSha256 as string);
    const graphRank = Array.from({ length: n }, (_, i) => n - 1 - i);
    const graphIndexOfRank = new Map(graphRank.map((rank, gi) => [rank, gi]));
    const documents = graphRank.map((rank) => ({
      documentSha256: shaAtRank[rank]!,
      tokenCount: short.has(rank) ? 2 : 50,
      shingleCount: short.has(rank) ? 0 : 46,
      measurable: !short.has(rank),
    }));
    const measurableIndices = documents.flatMap((d, i) => (d.measurable ? [i] : []));
    return {
      pool,
      graph: {
        documents,
        measurableIndices,
        shortTextUnresolvedCount: documents.length - measurableIndices.length,
        comparedPairCount: (measurableIndices.length * (measurableIndices.length - 1)) / 2,
        edges: edges.map(([a, b]) => {
          const x = graphIndexOfRank.get(a)!;
          const y = graphIndexOfRank.get(b)!;
          return {
            aIndex: Math.min(x, y),
            bIndex: Math.max(x, y),
            measurement: {
              intersectionSize: 9,
              unionSize: 10,
              similarity: 0.9,
              atOrAboveThreshold: true,
            },
          };
        }),
      },
    };
  }

  /** Every treatment: each subset of short positions PRESENT; first-cap positions. */
  function capsAcrossTreatmentSpace(
    measurableSurvivors: readonly number[],
    short: readonly number[],
  ): Set<string> {
    const caps = new Set<string>();
    for (let mask = 0; mask < 1 << short.length; mask += 1) {
      const present = short.filter((_, i) => (mask >> i) & 1);
      const sample = [...measurableSurvivors, ...present].sort((a, b) => a - b);
      caps.add(sample.slice(0, contracts.SET_P_MAX_PAGES_PER_ORGANISATION).join(','));
    }
    return caps;
  }

  // Deterministic scenario family: sizes 0..13, short-text sets and edge sets
  // chosen by a fixed arithmetic schedule (no randomness).
  const scenarios: { n: number; short: number[]; edges: [number, number][] }[] = [];
  for (let n = 0; n <= 13; n += 1) {
    for (let variant = 0; variant < 12; variant += 1) {
      const short = Array.from({ length: n }, (_, i) => i)
        .filter((i) => (i * 7 + variant * 3) % 11 < variant % 4)
        .slice(0, 4);
      const measurable = Array.from({ length: n }, (_, i) => i).filter((i) => !short.includes(i));
      const edges: [number, number][] = [];
      for (let k = 0; k + 1 < measurable.length; k += 1) {
        if ((k * 5 + variant) % 4 === 0) edges.push([measurable[k]!, measurable[k + 1]!]);
      }
      scenarios.push({ n, short, edges });
    }
  }

  it('over the scenario family, R8 is EXACT iff the cap is invariant, and then equals it', () => {
    let exactCount = 0;
    let blockedCount = 0;
    scenarios.forEach(({ n, short, edges }, idx) => {
      const built = build(`s${idx}`, n, new Set(short), edges);
      const prepared = prepareSetPSd7(built);
      const survivors = prepared.measurableSurvivorAwareFullRank.map((s) => s.sourceRankPosition);
      const caps = capsAcrossTreatmentSpace(survivors, short);
      const invariant = caps.size === 1;
      const cap = prepared.documentCap;
      expect(cap.status === SET_P_DOCUMENT_CAP_EXACT, `scenario ${idx}`).toBe(invariant);
      if (cap.status === SET_P_DOCUMENT_CAP_EXACT) {
        exactCount += 1;
        expect(cap.documents.map((d) => d.sourceRankPosition).join(',')).toBe([...caps][0]);
      } else {
        blockedCount += 1;
        expect('documents' in cap).toBe(false);
      }
    });
    // The family genuinely exercises both sides, including the tail-after-cap case.
    expect(exactCount).toBeGreaterThan(0);
    expect(blockedCount).toBeGreaterThan(0);
  });

  it('exercises both accepted reasons, including the tail-after-cap case', () => {
    const noShort = prepareSetPSd7(build('a', 10, new Set(), [[0, 1]]));
    expect(noShort.documentCap).toMatchObject({ reason: 'NO_UNRESOLVED_SHORT_TEXT' });
    const tail = prepareSetPSd7(build('b', 11, new Set([9, 10]), []));
    expect(tail.documentCap).toMatchObject({
      reason: 'EIGHT_MEASURABLE_SURVIVORS_PRECEDE_ALL_UNRESOLVED_SHORT_TEXT',
    });
    expect(capsAcrossTreatmentSpace(range(0, 9), [9, 10]).size).toBe(1);
    const early = prepareSetPSd7(build('c', 11, new Set([3]), []));
    expect(early.documentCap.status).not.toBe(SET_P_DOCUMENT_CAP_EXACT);
  });
});

// ---------------------------------------------------------------------------
// R7/R8 RUNTIME UNCHANGED BY THIS BINDING (comment-only edits).
// ---------------------------------------------------------------------------

const R8_TERMINAL_COMMIT = '03da163497901d7f53bf1a94c604dee3b0da1a6c';
const A3PREP_REL = 'src/test/harness/phase2b2d/a3prep';

function r8Available(): boolean {
  try {
    execFileSync('git', ['-C', REPO_ROOT, 'cat-file', '-e', `${R8_TERMINAL_COMMIT}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

/** Removes block and line comments and blank lines; string literals here hold no comment tokens. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '')
    .join('\n');
}

describe.skipIf(!r8Available())('2D-A3 short-text policy: R7/R8 runtime is unchanged', () => {
  for (const file of ['sd7.ts', 'setPSd7.ts']) {
    it(`${file} differs from R8 in comments only`, () => {
      const before = execFileSync(
        'git',
        ['-C', REPO_ROOT, 'show', `${R8_TERMINAL_COMMIT}:${A3PREP_REL}/${file}`],
        { encoding: 'utf8' },
      );
      const after = readFileSync(join(REPO_ROOT, A3PREP_REL, file), 'utf8');
      expect(stripComments(after)).toBe(stripComments(before));
    });
  }

  it('the stale "still open" handling wording is gone', () => {
    const sd7 = readFileSync(join(REPO_ROOT, A3PREP_REL, 'sd7.ts'), 'utf8');
    const setPSd7 = readFileSync(join(REPO_ROOT, A3PREP_REL, 'setPSd7.ts'), 'utf8');
    expect(sd7).not.toMatch(/which is still open/);
    expect(setPSd7).not.toMatch(/`SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP` is still open/);
    expect(setPSd7).toMatch(/SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_AMBIGUITY_PROPAGATION_V1/);
  });
});
