/**
 * PHASE 2B-2D — A3 R24: THE PUBLIC, DERIVED REACHABLE-MEMBERSHIP / SD9 READINESS CENSUS.
 *
 * IT IS DERIVED, AND IT AUTHORISES NOTHING
 *
 *   `thisFileAuthorises: []`. Not acquisition authority, not an A2
 *   adjudication, not a replacement decision, not a final SET_P or SET_R, not
 *   short-text authority, not SD4 / K4, not a corpus-freeze preflight and not
 *   a freeze. It counts what one in-process R19 -> R20 -> R21 -> R22 -> R23 ->
 *   R24 chain derived.
 *
 * SD9 COUNTS ARE MECHANICAL ONLY
 *
 *   The SD9 status counts here classify the canonical A3 survivor-count
 *   envelope. They do not rewrite any A2 acquisition-of-record, adjudicate a
 *   run, create a reserve obligation or replacement reason, or alter a ledger.
 *
 * AGGREGATES ONLY, AND NO NEW DIGEST
 *
 *   Every field is a count, a frozen constant or token, a commit or a boolean.
 *   No selection index, organisation, run, row id, document digest, rank
 *   position, membership identity, score, edge, URL, host, root, text, label,
 *   per-slot SD9 result or per-slot cap status. And no membership / readiness
 *   batch hash: a digest would be a reusable token a later slice could accept
 *   INSTEAD of re-minting.
 */
import {
  MIN_PAGES_PER_ORGANISATION,
  SET_P_MAX_PAGES_PER_ORGANISATION,
  SET_R_MAX_PAGES_PER_ORGANISATION,
  SHORT_TEXT_ADMISSIBLE_MEMBERSHIP_TREATMENT_SPACE,
  SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY,
} from '../a3prep/contracts.js';
import { SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT } from '../a3prep/corpusFreezePreflight.js';
import { SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT } from '../a3prep/setRSd7Readiness.js';
import { R20_EVIDENCE_SPLIT_V1 } from '../a3evidence/types.js';
import {
  isA3DevTrainReachableMembershipSd9Batch,
  slotSamplePreparationForSlotReadiness,
} from './devTrain.js';
import { refuse } from './refusal.js';
import {
  REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT,
  R24_SD9_SEMANTICS,
  type A3DevTrainReachableMembershipSd9BatchV1,
  type A3MechanicalSd9Readiness,
  type A3ReachableMembership,
  type A3ReadinessSample,
} from './types.js';

export const R24_PUBLIC_CENSUS_RECORD_KIND =
  'PHASE_2B_2D_A3_R24_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_READINESS_CENSUS_V1';

export interface R24CensusProvenance {
  readonly r23Tip: string;
  readonly implementationCommit: string;
}

export interface R24SampleAggregate {
  readonly reachableMembershipExactSlotCount: number;
  readonly reachableMembershipBlockedSlotCount: number;
  readonly reachableMembershipDocumentCountAcrossExactSlots: number;
  readonly fullRankExactSlotCount: number;
  readonly fullRankShortTextBlockedSlotCount: number;
  readonly fullRankBlockedWhileReachableMembershipExactSlotCount: number;
  readonly measurableSurvivorCount: number;
  readonly unresolvedShortTextOccurrenceCount: number;
  readonly sd9MinEnvelopeTotal: number;
  readonly sd9MaxEnvelopeTotal: number;
  readonly sd9MechanicalSuccessfulSlotCount: number;
  readonly sd9MechanicalUnsuccessfulSlotCount: number;
  readonly sd9MechanicalPendingSlotCount: number;
}

export interface R24PublicReachableMembershipSd9Census {
  readonly record: typeof R24_PUBLIC_CENSUS_RECORD_KIND;
  readonly recordKind: 'PUBLIC_AGGREGATE_ONLY_REACHABLE_MEMBERSHIP_SD9_READINESS_CENSUS';
  readonly generationId: string;
  readonly split: typeof R20_EVIDENCE_SPLIT_V1;
  readonly registryVersion: string;
  readonly governanceSnapshotCommit: string;
  readonly r23Tip: string;
  readonly implementationCommit: string;
  readonly thisFileAuthorises: readonly [];
  readonly readiness: {
    readonly r23SlotPreparationCount: number;
    readonly slotReadinessCount: number;
  };
  readonly canonicalConstants: {
    readonly setPMaxPagesPerOrganisation: typeof SET_P_MAX_PAGES_PER_ORGANISATION;
    readonly setRMaxPagesPerOrganisation: typeof SET_R_MAX_PAGES_PER_ORGANISATION;
    readonly sd9MinPagesPerOrganisation: number;
    readonly reachableMembershipDecisionToken: string;
    readonly requiredMembershipScope: string;
    readonly zeroExtensionHeadroomScope: string;
    readonly unreachableTailFreezeEffect: string;
    readonly sd9EnvelopeTreatmentSpace: typeof SHORT_TEXT_ADMISSIBLE_MEMBERSHIP_TREATMENT_SPACE;
    readonly sd9EnvelopeFormula: 'MIN_EQUALS_MEASURABLE_SURVIVORS__MAX_EQUALS_MEASURABLE_SURVIVORS_PLUS_UNRESOLVED_SHORT_TEXT';
    readonly sd9Semantics: typeof R24_SD9_SEMANTICS;
  };
  readonly setP: R24SampleAggregate;
  readonly setR: R24SampleAggregate;
  readonly crossSample: {
    readonly bothSamplesMechanicallySuccessfulSlotCount: number;
    readonly sd9StatusDisagreementSlotCount: number;
  };
  readonly semantics: {
    readonly reachableMembershipScopeOwnerBound: true;
    readonly initialCapUsedAsReachableMembershipOnlyWhenCanonicalExact: true;
    readonly blockedCapMembershipInvented: false;
    readonly unreachableShortTextTailResolved: false;
    readonly fullRankExactnessRequiredForExactReachableCap: false;
    readonly setRReadinessRederived: false;
    readonly capSliced: false;
    readonly sd9UsesSurvivorEnvelopeNotCapCount: true;
    readonly sd9MechanicalOnly: true;
    readonly sd9SamplesForcedToAgree: false;
    readonly a2AcquisitionStatusChanged: false;
    readonly replacementDecisionMade: false;
    readonly extensionPerformed: false;
    readonly completeCorpusPreflightRun: false;
    readonly sd4Applied: false;
    readonly k4Applied: false;
    readonly labelsRead: false;
    readonly classifierCalled: false;
    readonly finalDevTrainCorpusMaterialised: false;
  };
  readonly access: {
    readonly r24SqlStatements: 0;
    readonly databaseAccessOnlyThroughCanonicalR20: true;
    readonly databaseWrites: 0;
    readonly institutionNetworkRequests: 0;
    readonly sealedRootReads: 0;
    readonly nonDevTrainEvidenceReads: 0;
  };
  readonly whatThisIsNot: readonly string[];
  readonly identityDisclosure: Readonly<Record<string, false>>;
}

function emptyAggregate(): { -readonly [K in keyof R24SampleAggregate]: number } {
  return {
    reachableMembershipExactSlotCount: 0,
    reachableMembershipBlockedSlotCount: 0,
    reachableMembershipDocumentCountAcrossExactSlots: 0,
    fullRankExactSlotCount: 0,
    fullRankShortTextBlockedSlotCount: 0,
    fullRankBlockedWhileReachableMembershipExactSlotCount: 0,
    measurableSurvivorCount: 0,
    unresolvedShortTextOccurrenceCount: 0,
    sd9MinEnvelopeTotal: 0,
    sd9MaxEnvelopeTotal: 0,
    sd9MechanicalSuccessfulSlotCount: 0,
    sd9MechanicalUnsuccessfulSlotCount: 0,
    sd9MechanicalPendingSlotCount: 0,
  };
}

function accumulate<S extends A3ReadinessSample>(
  into: { -readonly [K in keyof R24SampleAggregate]: number },
  membership: A3ReachableMembership<S>,
  fullRankExact: boolean,
  readinessCounts: {
    readonly measurableSurvivorCount: number;
    readonly shortTextUnresolvedCount: number;
  },
  sd9: A3MechanicalSd9Readiness<S>,
): void {
  const exact = membership.status === REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT;
  if (exact) {
    into.reachableMembershipExactSlotCount += 1;
    into.reachableMembershipDocumentCountAcrossExactSlots += membership.documentCount;
  } else {
    into.reachableMembershipBlockedSlotCount += 1;
  }
  if (fullRankExact) {
    into.fullRankExactSlotCount += 1;
  } else {
    into.fullRankShortTextBlockedSlotCount += 1;
    if (exact) into.fullRankBlockedWhileReachableMembershipExactSlotCount += 1;
  }
  into.measurableSurvivorCount += readinessCounts.measurableSurvivorCount;
  into.unresolvedShortTextOccurrenceCount += readinessCounts.shortTextUnresolvedCount;
  into.sd9MinEnvelopeTotal += sd9.canonical.minCount;
  into.sd9MaxEnvelopeTotal += sd9.canonical.maxCount;
  if (sd9.canonical.status === 'ACQUISITION_SUCCESSFUL') {
    into.sd9MechanicalSuccessfulSlotCount += 1;
  } else if (sd9.canonical.status === 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET') {
    into.sd9MechanicalUnsuccessfulSlotCount += 1;
  } else {
    into.sd9MechanicalPendingSlotCount += 1;
  }
}

/**
 * Derives the census from a MINTED readiness batch. Anything else refuses: a
 * census over hand-built readiness would report numbers nothing proved.
 */
export function deriveR24PublicReachableMembershipSd9Census(
  batch: A3DevTrainReachableMembershipSd9BatchV1,
  provenance: R24CensusProvenance,
): R24PublicReachableMembershipSd9Census {
  if (!isA3DevTrainReachableMembershipSd9Batch(batch)) {
    refuse(
      'R24_BATCH_COMPOSITION_INVALID',
      'the census input was not a minted DEV_TRAIN reachable-membership / SD9 batch',
    );
  }

  const p = emptyAggregate();
  const r = emptyAggregate();
  let bothSuccessful = 0;
  let disagreement = 0;
  for (const item of batch.items) {
    if (slotSamplePreparationForSlotReadiness(item) === undefined) {
      refuse('R24_BATCH_COMPOSITION_INVALID', 'a slot readiness does not trace to an R23 slot');
    }
    accumulate(
      p,
      item.setPReachableMembership,
      item.setPFreezeSlotReadiness.fullRankReadiness === SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
      item.setPFreezeSlotReadiness,
      item.setPSd9,
    );
    accumulate(
      r,
      item.setRReachableMembership,
      item.setRFreezeSlotReadiness.fullRankReadiness === SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
      item.setRFreezeSlotReadiness,
      item.setRSd9,
    );
    const pStatus = item.setPSd9.canonical.status;
    const rStatus = item.setRSd9.canonical.status;
    if (pStatus === 'ACQUISITION_SUCCESSFUL' && rStatus === 'ACQUISITION_SUCCESSFUL') {
      bothSuccessful += 1;
    }
    if (pStatus !== rStatus) disagreement += 1;
  }

  const resolution = batch.governanceSnapshot.resolution;
  const policy = SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY;

  return Object.freeze({
    record: R24_PUBLIC_CENSUS_RECORD_KIND,
    recordKind: 'PUBLIC_AGGREGATE_ONLY_REACHABLE_MEMBERSHIP_SD9_READINESS_CENSUS' as const,
    generationId: resolution.summary.generationId,
    split: R20_EVIDENCE_SPLIT_V1,
    registryVersion: resolution.registryVersion,
    governanceSnapshotCommit: resolution.governanceBaseCommit,
    r23Tip: provenance.r23Tip,
    implementationCommit: provenance.implementationCommit,
    thisFileAuthorises: Object.freeze([]) as readonly [],
    readiness: Object.freeze({
      r23SlotPreparationCount: batch.items.length,
      slotReadinessCount: batch.items.length,
    }),
    canonicalConstants: Object.freeze({
      setPMaxPagesPerOrganisation: SET_P_MAX_PAGES_PER_ORGANISATION,
      setRMaxPagesPerOrganisation: SET_R_MAX_PAGES_PER_ORGANISATION,
      sd9MinPagesPerOrganisation: MIN_PAGES_PER_ORGANISATION,
      reachableMembershipDecisionToken: policy.decisionToken,
      requiredMembershipScope: policy.requiredMembershipScope,
      zeroExtensionHeadroomScope: policy.zeroExtensionHeadroomScope,
      unreachableTailFreezeEffect: policy.unreachableTailFreezeEffect,
      sd9EnvelopeTreatmentSpace: SHORT_TEXT_ADMISSIBLE_MEMBERSHIP_TREATMENT_SPACE,
      sd9EnvelopeFormula:
        'MIN_EQUALS_MEASURABLE_SURVIVORS__MAX_EQUALS_MEASURABLE_SURVIVORS_PLUS_UNRESOLVED_SHORT_TEXT' as const,
      sd9Semantics: R24_SD9_SEMANTICS,
    }),
    setP: Object.freeze(p),
    setR: Object.freeze(r),
    crossSample: Object.freeze({
      bothSamplesMechanicallySuccessfulSlotCount: bothSuccessful,
      sd9StatusDisagreementSlotCount: disagreement,
    }),
    semantics: Object.freeze({
      reachableMembershipScopeOwnerBound: true as const,
      initialCapUsedAsReachableMembershipOnlyWhenCanonicalExact: true as const,
      blockedCapMembershipInvented: false as const,
      unreachableShortTextTailResolved: false as const,
      fullRankExactnessRequiredForExactReachableCap: false as const,
      setRReadinessRederived: false as const,
      capSliced: false as const,
      sd9UsesSurvivorEnvelopeNotCapCount: true as const,
      sd9MechanicalOnly: true as const,
      sd9SamplesForcedToAgree: false as const,
      a2AcquisitionStatusChanged: false as const,
      replacementDecisionMade: false as const,
      extensionPerformed: false as const,
      completeCorpusPreflightRun: false as const,
      sd4Applied: false as const,
      k4Applied: false as const,
      labelsRead: false as const,
      classifierCalled: false as const,
      finalDevTrainCorpusMaterialised: false as const,
    }),
    access: Object.freeze({
      r24SqlStatements: 0 as const,
      databaseAccessOnlyThroughCanonicalR20: true as const,
      databaseWrites: 0 as const,
      institutionNetworkRequests: 0 as const,
      sealedRootReads: 0 as const,
      nonDevTrainEvidenceReads: 0 as const,
    }),
    whatThisIsNot: Object.freeze([
      'NOT_A2_ACQUISITION_AUTHORITY',
      'NOT_AN_A2_ADJUDICATION',
      'NOT_A_REPLACEMENT_DECISION',
      'NOT_DATABASE_EVIDENCE_AUTHORITY',
      'NOT_A_GENERATION_1_CORPUS',
      'NOT_A_FINAL_DEV_TRAIN_SET_P',
      'NOT_A_FINAL_DEV_TRAIN_SET_R',
      'NOT_SHORT_TEXT_AUTHORITY',
      'NOT_AN_EXTENSION',
      'NOT_SD4_OR_K4',
      'NOT_A_COMPLETE_CORPUS_FREEZE_PREFLIGHT',
      'NOT_A_LABEL_OR_CLASSIFICATION',
      'NOT_AN_A5_CORPUS_FREEZE',
    ]),
    identityDisclosure: Object.freeze({
      selectionIndices: false as const,
      reservePositions: false as const,
      organisationIds: false as const,
      echeRowKeys: false as const,
      runIdentifiers: false as const,
      runReferenceDigests: false as const,
      rowIdentifiers: false as const,
      candidateIdentifiers: false as const,
      documentDigests: false as const,
      membershipDocumentIdentities: false as const,
      saltedRankDigests: false as const,
      rankPositions: false as const,
      sourceRankPositions: false as const,
      survivorRankPositions: false as const,
      edgeEndpoints: false as const,
      scoresOrScoreDistributions: false as const,
      perSlotBreakdown: false as const,
      perSlotSd9Results: false as const,
      perSlotCapStatus: false as const,
      urlsOrHosts: false as const,
      rootIdentifiers: false as const,
      titlesHeadingsOrText: false as const,
      candidateSignals: false as const,
      labels: false as const,
      sealedFilenames: false as const,
      gatedSplitData: false as const,
    }),
  });
}
