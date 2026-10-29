/**
 * PHASE 2B-2D — A3 R30: THE READINESS COVERAGE EXPANSION AND THE PUBLIC, DERIVED CENSUS.
 *
 * THE COVERAGE EXPANSION IS COUNTS, NOT A SIX-SLOT BATCH
 *
 *   Historical R24 coverage enters as the committed aggregate baseline (see
 *   `r29Drift.ts`); delta coverage is derived from the MINTED R30 batch. The
 *   sum is an aggregate statement only - nothing is minted for it, and no
 *   historical readiness is re-derived, wrapped or copied.
 *
 * SD9 COUNTS ARE A3 MECHANICAL READINESS ONLY
 *
 *   They classify the canonical A3 survivor-count envelope R24's helper
 *   derived. They do not rewrite an A2 acquisition status, create a
 *   replacement obligation, consume a reserve, change a ledger, authorise
 *   acquisition or constitute an A2 adjudication.
 *
 * THE CENSUS IS DERIVED, AND IT AUTHORISES NOTHING
 *
 *   `thisFileAuthorises: []`. Counts, stated canonical constants, commits and
 *   booleans. No selection index, organisation, run, document digest,
 *   membership identity, rank digest or position, edge endpoint, score, URL,
 *   host, text, label, per-slot breakdown or per-slot SD9 result. And no
 *   `readinessDeltaHash`, `membershipCoverageHash`, `sd9ExpansionHash` or
 *   `reachableCorpusHash`: authority is in-process R29 -> R30 provenance.
 *
 * The cap, readiness and SD9 tokens below are STATED, not imported from
 * `a3prep/`. The unit suite asserts they equal the canonical constants.
 */
import { R24_SD9_SEMANTICS, REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT } from '../a3readiness/types.js';
import type { A3MechanicalSd9Readiness, A3ReachableMembership } from '../a3readiness/types.js';
import { R30_STATED_REACHABLE_MEMBERSHIP_POLICY } from './deriveDelta.js';
import {
  isA3DevTrainReachableMembershipSd9DeltaBatchV2,
  samplePreparationForDeltaReadiness,
} from './devTrain.js';
import { refuseV2Readiness } from './refusal.js';
import {
  R30_READINESS_SPLIT,
  type A3DevTrainCanonicalReachableMembershipSd9CoverageExpansionV2,
  type A3DevTrainReachableMembershipSd9DeltaBatchV2,
  type CrossSampleSd9Aggregate,
  type R24HistoricalReadinessBaseline,
  type R30DeltaReadinessAggregates,
  type ReadinessSampleAggregate,
} from './types.js';

export const R30_PUBLIC_CENSUS_RECORD_KIND =
  'PHASE_2B_2D_A3_R30_DEV_TRAIN_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS_V1';

/** The canonical constants and tokens R24's helper derived under, stated for the record. */
export const R30_STATED_CANONICAL_READINESS_CONSTANTS = Object.freeze({
  setPMaxPagesPerOrganisation: 8,
  setRMaxPagesPerOrganisation: 4,
  sd9MinPagesPerOrganisation: 4,
  reachableMembershipDecisionToken: R30_STATED_REACHABLE_MEMBERSHIP_POLICY.decisionToken,
  generation: R30_STATED_REACHABLE_MEMBERSHIP_POLICY.generation,
  requiredMembershipScope: R30_STATED_REACHABLE_MEMBERSHIP_POLICY.requiredMembershipScope,
  zeroExtensionHeadroomScope: R30_STATED_REACHABLE_MEMBERSHIP_POLICY.zeroExtensionHeadroomScope,
  unreachableTailFreezeEffect: R30_STATED_REACHABLE_MEMBERSHIP_POLICY.unreachableTailFreezeEffect,
  sd9EnvelopeFormula:
    'MIN_EQUALS_MEASURABLE_SURVIVORS__MAX_EQUALS_MEASURABLE_SURVIVORS_PLUS_UNRESOLVED_SHORT_TEXT',
  sd9Semantics: R24_SD9_SEMANTICS,
  setPFullSampleRankMembershipExact: 'FULL_SAMPLE_RANK_MEMBERSHIP_EXACT',
  setRFullSampleRankMembershipExact: 'SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT',
  sd9Successful: 'ACQUISITION_SUCCESSFUL',
  sd9Unsuccessful: 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET',
  sd9Pending: 'ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL',
} as const);

const C = R30_STATED_CANONICAL_READINESS_CONSTANTS;

function requireMintedReadinessBatch(batch: unknown): A3DevTrainReachableMembershipSd9DeltaBatchV2 {
  if (!isA3DevTrainReachableMembershipSd9DeltaBatchV2(batch)) {
    refuseV2Readiness(
      'R30_NOT_A_MINTED_DELTA_READINESS_BATCH',
      'the input was not a DEV_TRAIN reachable-membership / SD9 delta batch minted by R30',
    );
  }
  return batch;
}

type MutableAggregate = { -readonly [K in keyof ReadinessSampleAggregate]: number };

function emptyAggregate(): MutableAggregate {
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

/** One slot, one sample, counted exactly as R24's census counts it. */
function accumulate(
  into: MutableAggregate,
  membership: A3ReachableMembership<'SET_P'> | A3ReachableMembership<'SET_R'>,
  fullRankExact: boolean,
  readiness: {
    readonly measurableSurvivorCount: number;
    readonly shortTextUnresolvedCount: number;
  },
  sd9: A3MechanicalSd9Readiness<'SET_P'> | A3MechanicalSd9Readiness<'SET_R'>,
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
  into.measurableSurvivorCount += readiness.measurableSurvivorCount;
  into.unresolvedShortTextOccurrenceCount += readiness.shortTextUnresolvedCount;
  into.sd9MinEnvelopeTotal += sd9.canonical.minCount;
  into.sd9MaxEnvelopeTotal += sd9.canonical.maxCount;
  if (sd9.canonical.status === C.sd9Successful) {
    into.sd9MechanicalSuccessfulSlotCount += 1;
  } else if (sd9.canonical.status === C.sd9Unsuccessful) {
    into.sd9MechanicalUnsuccessfulSlotCount += 1;
  } else {
    into.sd9MechanicalPendingSlotCount += 1;
  }
}

/** Delta aggregates, derived per slot from the minted readiness. Identities never leave memory. */
export function deriveDeltaReadinessAggregates(
  readinessDeltaBatch: A3DevTrainReachableMembershipSd9DeltaBatchV2,
): R30DeltaReadinessAggregates {
  const batch = requireMintedReadinessBatch(readinessDeltaBatch);
  const p = emptyAggregate();
  const r = emptyAggregate();
  let bothSuccessful = 0;
  let disagreement = 0;
  for (const item of batch.items) {
    if (samplePreparationForDeltaReadiness(item) === undefined) {
      refuseV2Readiness(
        'R30_DELTA_BATCH_COMPOSITION_INVALID',
        'a delta readiness does not trace to an R29 preparation',
      );
    }
    accumulate(
      p,
      item.setPReachableMembership,
      item.setPFreezeSlotReadiness.fullRankReadiness === C.setPFullSampleRankMembershipExact,
      item.setPFreezeSlotReadiness,
      item.setPSd9,
    );
    accumulate(
      r,
      item.setRReachableMembership,
      item.setRFreezeSlotReadiness.fullRankReadiness === C.setRFullSampleRankMembershipExact,
      item.setRFreezeSlotReadiness,
      item.setRSd9,
    );
    const pStatus = item.setPSd9.canonical.status;
    const rStatus = item.setRSd9.canonical.status;
    if (pStatus === C.sd9Successful && rStatus === C.sd9Successful) bothSuccessful += 1;
    if (pStatus !== rStatus) disagreement += 1;
  }
  return Object.freeze({
    slotReadinessCount: batch.items.length,
    setP: Object.freeze(p),
    setR: Object.freeze(r),
    crossSample: Object.freeze({
      bothSamplesMechanicallySuccessfulSlotCount: bothSuccessful,
      sd9StatusDisagreementSlotCount: disagreement,
    }),
  });
}

function sumSample(
  a: ReadinessSampleAggregate,
  b: ReadinessSampleAggregate,
): ReadinessSampleAggregate {
  const sum = emptyAggregate();
  for (const key of Object.keys(sum) as (keyof ReadinessSampleAggregate)[]) {
    sum[key] = a[key] + b[key];
  }
  return Object.freeze(sum);
}

function sumCross(a: CrossSampleSd9Aggregate, b: CrossSampleSd9Aggregate): CrossSampleSd9Aggregate {
  return Object.freeze({
    bothSamplesMechanicallySuccessfulSlotCount:
      a.bothSamplesMechanicallySuccessfulSlotCount + b.bothSamplesMechanicallySuccessfulSlotCount,
    sd9StatusDisagreementSlotCount:
      a.sd9StatusDisagreementSlotCount + b.sd9StatusDisagreementSlotCount,
  });
}

/**
 * §38-§42. Historical R24 baseline + minted delta = coverage. The historical
 * slot count must be exactly R26's unchanged canonical coverage, and the
 * combined count exactly the V2 DEV_TRAIN coverage.
 */
export function deriveCanonicalReachableMembershipSd9CoverageExpansionV2(
  readinessDeltaBatch: A3DevTrainReachableMembershipSd9DeltaBatchV2,
  historical: R24HistoricalReadinessBaseline,
): A3DevTrainCanonicalReachableMembershipSd9CoverageExpansionV2 {
  const batch = requireMintedReadinessBatch(readinessDeltaBatch);
  const delta = deriveDeltaReadinessAggregates(batch);
  const evidenceCoverage =
    batch.sampleDeltaBatch.graphDeltaBatch.documentSourceDeltaBatch.evidenceDeltaBatch.coverage;
  if (
    historical.slotReadinessCount !== evidenceCoverage.unchangedCanonicalCoverageCount ||
    delta.slotReadinessCount !== evidenceCoverage.newlyBoundDeltaCount ||
    historical.slotReadinessCount + delta.slotReadinessCount !==
      evidenceCoverage.v2ReadyAuthorityCount
  ) {
    refuseV2Readiness(
      'R30_SAMPLE_DELTA_COVERAGE_NOT_ADDITIVE',
      'historical R24 readiness plus delta readiness does not equal the V2 DEV_TRAIN coverage',
    );
  }
  return Object.freeze({
    kind: 'A3_DEV_TRAIN_CANONICAL_REACHABLE_MEMBERSHIP_SD9_COVERAGE_EXPANSION_V2' as const,
    historicalReadinessSlotCount: historical.slotReadinessCount,
    deltaReadinessSlotCount: delta.slotReadinessCount,
    coverageReadinessSlotCount: historical.slotReadinessCount + delta.slotReadinessCount,
    historical: Object.freeze({
      setP: historical.setP,
      setR: historical.setR,
      crossSample: historical.crossSample,
    }),
    delta: Object.freeze({ setP: delta.setP, setR: delta.setR, crossSample: delta.crossSample }),
    coverage: Object.freeze({
      setP: sumSample(historical.setP, delta.setP),
      setR: sumSample(historical.setR, delta.setR),
      crossSample: sumCross(historical.crossSample, delta.crossSample),
    }),
  });
}

export interface R30CensusProvenance {
  /** The exact R29 tip R30 was cut from. */
  readonly r29Tip: string;
  /** The R30 implementation commit the real delta readiness executed at. */
  readonly implementationCommit: string;
}

/** Derives the public census from a MINTED readiness delta batch; anything else refuses. */
export function deriveR30PublicIncrementalReachableMembershipSd9Census(
  readinessDeltaBatch: A3DevTrainReachableMembershipSd9DeltaBatchV2,
  historical: R24HistoricalReadinessBaseline,
  provenance: R30CensusProvenance,
) {
  const batch = requireMintedReadinessBatch(readinessDeltaBatch);
  const delta = deriveDeltaReadinessAggregates(batch);
  const expansion = deriveCanonicalReachableMembershipSd9CoverageExpansionV2(batch, historical);
  const access =
    batch.sampleDeltaBatch.graphDeltaBatch.documentSourceDeltaBatch.evidenceDeltaBatch.coverage;

  return Object.freeze({
    record: R30_PUBLIC_CENSUS_RECORD_KIND,
    recordKind: 'PUBLIC_AGGREGATE_ONLY_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS' as const,
    generationId: batch.governanceSnapshotV2.resolution.summary.generationId,
    split: R30_READINESS_SPLIT,
    r29Tip: provenance.r29Tip,
    implementationCommit: provenance.implementationCommit,
    thisFileAuthorises: Object.freeze([]) as readonly [],
    delta: Object.freeze({
      deltaReadinessSlots: delta.slotReadinessCount,
      setP: delta.setP,
      setR: delta.setR,
      crossSample: delta.crossSample,
    }),
    canonicalConstants: C,
    coverage: Object.freeze({
      historicalCanonicalR24ReadinessSlots: expansion.historicalReadinessSlotCount,
      newR30ReadinessSlots: expansion.deltaReadinessSlotCount,
      coverageReadinessSlots: expansion.coverageReadinessSlotCount,
      historical: expansion.historical,
      coverage: expansion.coverage,
      coverageIsSumOfPerSlotCounts: true as const,
      sixSlotReadinessBatchMinted: false as const,
    }),
    semantics: Object.freeze({
      historicalR24StatesRecomputed: false as const,
      historicalR24ObjectsReminted: false as const,
      deltaOnlyReadinessDerivation: true as const,
      canonicalR24PureHelperUsed: true as const,
      canonicalR24HelperCallsPerDeltaSlot: 1 as const,
      setRReadinessRederived: false as const,
      canonicalCapArraysUsedByReference: true as const,
      capSliced: false as const,
      blockedCapMembershipInvented: false as const,
      fullRankExactnessRequiredForExactReachableCap: false as const,
      sd9UsesSurvivorEnvelopeNotCapCount: true as const,
      sd9MechanicalOnly: true as const,
      sd9SamplesForcedToAgree: false as const,
      directSd9Call: false as const,
      shortTextResolved: false as const,
      extensionPerformed: false as const,
      completeCorpusPreflightRun: false as const,
      sd4Applied: false as const,
      k4Applied: false as const,
      labelsRead: false as const,
      classifierCalled: false as const,
      finalDevTrainCorpusMaterialised: false as const,
    }),
    sd9AuthorityBoundary: Object.freeze({
      a3MechanicalReadinessOnly: true as const,
      rewritesA2AcquisitionStatus: false as const,
      createsReplacementObligation: false as const,
      consumesReserve: false as const,
      changesLedger: false as const,
      authorisesAcquisition: false as const,
      constitutesA2Adjudication: false as const,
    }),
    access: Object.freeze({
      r30SqlStatements: 0 as const,
      databaseAccessOnlyThroughCanonicalR26: true as const,
      legacyAuthorityEvidenceQueries: access.legacyAuthorityEvidenceRequests,
      deltaAuthorityEvidenceQueries: access.deltaAuthorityEvidenceRequests,
      oldFiveDocumentReassembly: 0 as const,
      oldFiveGraphRemeasurement: 0 as const,
      oldFiveSamplePreparation: 0 as const,
      oldFiveReadinessDerivation: 0 as const,
      databaseWrites: 0 as const,
      institutionNetworkRequests: 0 as const,
      sealedRootReads: 0 as const,
      devConfirmEvidenceReads: 0 as const,
      finalHoldoutEvidenceReads: 0 as const,
    }),
    whatThisIsNot: Object.freeze([
      'NOT_A_SIX_SLOT_READINESS_BATCH',
      'NOT_A_REDERIVATION_OF_R24_CANONICAL_HISTORY',
      'NOT_A2_ACQUISITION_AUTHORITY',
      'NOT_AN_A2_ADJUDICATION',
      'NOT_A_REPLACEMENT_DECISION',
      'NOT_DATABASE_EVIDENCE_AUTHORITY',
      'NOT_SHORT_TEXT_AUTHORITY',
      'NOT_AN_EXTENSION',
      'NOT_SD4_OR_K4',
      'NOT_A_COMPLETE_CORPUS_FREEZE_PREFLIGHT',
      'NOT_A_FINAL_SET_P',
      'NOT_A_FINAL_SET_R',
      'NOT_A_LABEL_OR_CLASSIFICATION',
      'NOT_AN_A5_CORPUS_FREEZE',
    ]),
    identityDisclosure: Object.freeze({
      selectionIndices: false as const,
      organisationIds: false as const,
      echeRowKeys: false as const,
      runIdentifiers: false as const,
      runReferenceDigests: false as const,
      documentDigests: false as const,
      membershipDocumentIdentities: false as const,
      saltedRankDigests: false as const,
      rankPositions: false as const,
      survivorPositions: false as const,
      exclusionPositions: false as const,
      edgeEndpoints: false as const,
      scoresOrScoreDistributions: false as const,
      urlsOrHosts: false as const,
      titlesHeadingsOrText: false as const,
      perSlotBreakdown: false as const,
      perSlotSd9Results: false as const,
      labels: false as const,
      sealedFilenames: false as const,
    }),
  });
}

export type R30PublicIncrementalReachableMembershipSd9Census = ReturnType<
  typeof deriveR30PublicIncrementalReachableMembershipSd9Census
>;
