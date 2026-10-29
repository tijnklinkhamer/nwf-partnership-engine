/**
 * PHASE 2B-2D — A3 R43: THE V5 READINESS COVERAGE EXPANSION AND THE PUBLIC, DERIVED CENSUS.
 *
 * THE COVERAGE EXPANSION IS COUNTS, NOT A TWENTY-SLOT BATCH
 *
 *   Historical R37 coverage enters as the committed aggregate baseline (see
 *   `history.ts`); delta coverage is derived from the MINTED R43 batch. The
 *   sum is an aggregate statement only - nothing is minted for it, and no
 *   historical readiness is re-derived, wrapped or copied.
 *
 * SD9 COUNTS ARE A3 MECHANICAL READINESS ONLY
 *
 *   They classify the canonical A3 survivor-count envelope R24's helper
 *   derived. They do not rewrite an A2 acquisition status, create a
 *   replacement obligation, consume a reserve, change a ledger, authorise
 *   acquisition, constitute an A2 adjudication or alter Governance V5.
 *
 * THE CENSUS IS DERIVED, AND IT AUTHORISES NOTHING
 *
 *   `thisFileAuthorises: []`. Counts, stated canonical constants, commits and
 *   booleans. No selection index, organisation, run, document digest,
 *   membership identity, rank digest or position, edge endpoint, score, URL,
 *   host, text, label, per-slot breakdown, per-slot cap status or per-slot
 *   SD9 result. And no readiness, membership or SD9 hash: authority is
 *   in-process R39 -> R40 -> R41 -> R42 -> R43 provenance, never a token.
 *
 * The cap, readiness and SD9 tokens are STATED in `types.ts`, not imported
 * from `a3prep/`. The unit suite asserts they equal the canonical constants.
 */
import { aggregateDeltaReadinessV5 } from './deriveDelta.js';
import {
  isA3DevTrainReachableMembershipSd9DeltaBatchV5,
  r24CallsForReadinessDeltaBatchV5,
  sampleDeltaBatchForReadinessDeltaBatchV5,
  samplePreparationForDeltaReadinessV5,
} from './devTrain.js';
import { historicalReadinessCoverageProofForBatch } from './history.js';
import { r42ReproductionProofForBatch, type R42ReproductionProof } from './r42Drift.js';
import { refuseV5Readiness } from './refusal.js';
import {
  R43_READINESS_SPLIT,
  R43_STATED_CANONICAL_READINESS_CONSTANTS as C,
  type A3DevTrainCanonicalReachableMembershipSd9CoverageExpansionV5,
  type A3DevTrainReachableMembershipSd9DeltaBatchV5,
  type CrossSampleSd9AggregateV5,
  type HistoricalV5ReadinessCoverageProof,
  type R43DeltaReadinessAggregates,
  type ReadinessSampleAggregateV5,
} from './types.js';

export const R43_PUBLIC_CENSUS_RECORD_KIND =
  'PHASE_2B_2D_A3_R43_DEV_TRAIN_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS_V1';
export const R43_CENSUS_PATH = `docs/evaluation/${R43_PUBLIC_CENSUS_RECORD_KIND}.json`;
export const R43_SUCCESS_TERMINAL =
  'R43_INCREMENTAL_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_V5_COMPLETE_READY_FOR_COMPLETE_CORPUS_PREFLIGHT';
export const R43_NEXT_OWNER_QUESTION =
  'Should R44 run the complete A3 DEV_TRAIN corpus-freeze preflight across all twenty canonically covered slots, reproducing the historical and V5 readiness state without resolving short text, performing unauthorised extension, or materialising a final corpus?';

function requireMintedReadinessBatch(batch: unknown): A3DevTrainReachableMembershipSd9DeltaBatchV5 {
  if (!isA3DevTrainReachableMembershipSd9DeltaBatchV5(batch)) {
    refuseV5Readiness(
      'R43_NOT_A_MINTED_DELTA_READINESS_BATCH',
      'the input was not a DEV_TRAIN reachable-membership / SD9 delta batch minted by R43',
    );
  }
  return batch;
}

/** Delta aggregates, derived per slot from the minted readiness. Identities never leave memory. */
export function deriveDeltaReadinessAggregatesV5(
  readinessDeltaBatch: A3DevTrainReachableMembershipSd9DeltaBatchV5,
): R43DeltaReadinessAggregates {
  const batch = requireMintedReadinessBatch(readinessDeltaBatch);
  for (const item of batch.items) {
    if (samplePreparationForDeltaReadinessV5(item) === undefined) {
      refuseV5Readiness(
        'R43_DELTA_BATCH_COMPOSITION_INVALID',
        'a delta readiness does not trace to an R42 preparation',
      );
    }
  }
  return aggregateDeltaReadinessV5(batch.items);
}

function sumSample(
  a: ReadinessSampleAggregateV5,
  b: ReadinessSampleAggregateV5,
): ReadinessSampleAggregateV5 {
  const keys = Object.keys(a) as (keyof ReadinessSampleAggregateV5)[];
  return Object.freeze(
    Object.fromEntries(keys.map((key) => [key, a[key] + b[key]])) as unknown as Record<
      keyof ReadinessSampleAggregateV5,
      number
    >,
  );
}

function sumCross(
  a: CrossSampleSd9AggregateV5,
  b: CrossSampleSd9AggregateV5,
): CrossSampleSd9AggregateV5 {
  return Object.freeze({
    bothSamplesMechanicallySuccessfulSlotCount:
      a.bothSamplesMechanicallySuccessfulSlotCount + b.bothSamplesMechanicallySuccessfulSlotCount,
    sd9StatusDisagreementSlotCount:
      a.sd9StatusDisagreementSlotCount + b.sd9StatusDisagreementSlotCount,
  });
}

function requireProofsFor(batch: A3DevTrainReachableMembershipSd9DeltaBatchV5): {
  readonly reproduction: R42ReproductionProof;
  readonly historical: HistoricalV5ReadinessCoverageProof;
  readonly r24Calls: number;
} {
  const sampleBatch = sampleDeltaBatchForReadinessDeltaBatchV5(batch);
  const reproduction = r42ReproductionProofForBatch(sampleBatch);
  const historical = historicalReadinessCoverageProofForBatch(sampleBatch);
  const r24Calls = r24CallsForReadinessDeltaBatchV5(batch);
  if (reproduction === undefined || r24Calls === undefined) {
    refuseV5Readiness(
      'R43_R42_REPRODUCTION_NOT_PROVED_FOR_BATCH',
      'the R42 batch behind this R43 batch was not proved to reproduce the committed census',
    );
  }
  if (historical === undefined) {
    refuseV5Readiness(
      'R43_HISTORICAL_READINESS_COVERAGE_NOT_PROVED_FOR_BATCH',
      'the historical readiness coverage was not proved against the R42 batch behind this R43 batch',
    );
  }
  return { reproduction, historical, r24Calls };
}

/**
 * §37 / §38 / §63. Historical R37 baseline + minted delta = coverage. The
 * historical slot count must be exactly R42's proved historical sample and
 * readiness coverage; the delta count R42's proved delta; the combined count
 * R42's proved sample coverage; and the historical and delta reachable
 * membership, survivors and short text must describe R42's proved
 * historical and delta caps, survivors and short text.
 */
export function deriveCanonicalReachableMembershipSd9CoverageExpansionV5(
  readinessDeltaBatch: A3DevTrainReachableMembershipSd9DeltaBatchV5,
): A3DevTrainCanonicalReachableMembershipSd9CoverageExpansionV5 {
  const batch = requireMintedReadinessBatch(readinessDeltaBatch);
  const { reproduction: proof, historical } = requireProofsFor(batch);
  const delta = deriveDeltaReadinessAggregatesV5(batch);
  const describes = (
    readiness: ReadinessSampleAggregateV5,
    sample: R42ReproductionProof['deltaSetP'],
  ): boolean =>
    readiness.reachableMembershipExactSlotCount === sample.initialCapExactSlotCount &&
    readiness.reachableMembershipBlockedSlotCount === sample.initialCapBlockedSlotCount &&
    readiness.reachableMembershipDocumentCountAcrossExactSlots ===
      sample.exactCapDocumentCountAcrossExactSlots &&
    readiness.measurableSurvivorCount === sample.measurableSurvivorCount &&
    readiness.unresolvedShortTextOccurrenceCount === sample.unresolvedShortTextOccurrenceCount;
  if (
    historical.slotReadinessCount !== proof.historicalSlotPreparations ||
    historical.slotReadinessCount !== proof.readinessCoverageBeforeR43 ||
    delta.slotReadinessCount !== proof.deltaSlotPreparations ||
    historical.slotReadinessCount + delta.slotReadinessCount !== proof.sampleCoverageBeforeR43 ||
    !describes(historical.setP, proof.historicalSetP) ||
    !describes(historical.setR, proof.historicalSetR) ||
    !describes(delta.setP, proof.deltaSetP) ||
    !describes(delta.setR, proof.deltaSetR) ||
    delta.setR.fullRankExactSlotCount !== proof.deltaSetRFullRankExactSlotCount ||
    delta.setR.fullRankShortTextBlockedSlotCount !==
      proof.deltaSetRFullRankShortTextBlockedSlotCount
  ) {
    refuseV5Readiness(
      'R43_SAMPLE_DELTA_COVERAGE_NOT_ADDITIVE',
      'historical R37 readiness plus delta readiness does not equal the R42 sample coverage',
    );
  }
  const coverageSlots = historical.slotReadinessCount + delta.slotReadinessCount;
  return Object.freeze({
    kind: 'A3_DEV_TRAIN_CANONICAL_REACHABLE_MEMBERSHIP_SD9_COVERAGE_EXPANSION_V5' as const,
    historicalReadinessSlotCount: historical.slotReadinessCount,
    deltaReadinessSlotCount: delta.slotReadinessCount,
    coverageReadinessSlotCount: coverageSlots,
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
    sampleCoverageAfterR43: proof.sampleCoverageBeforeR43,
    readinessCoverageAfterR43: coverageSlots,
  });
}

export interface R43CensusProvenance {
  /** The exact R42 tip R43 was cut from. */
  readonly r42Tip: string;
  /** The one commit that pinned R42's isolation test to its own range. */
  readonly r42ScopePinCommit: string;
  /** The R43 commit the real reproduction and delta readiness executed at. */
  readonly implementationCommit: string;
}

/** Derives the public census from a MINTED readiness delta batch; anything else refuses. */
export function deriveR43PublicIncrementalReachableMembershipSd9Census(
  readinessDeltaBatch: A3DevTrainReachableMembershipSd9DeltaBatchV5,
  provenance: R43CensusProvenance,
) {
  const batch = requireMintedReadinessBatch(readinessDeltaBatch);
  const { reproduction, historical, r24Calls } = requireProofsFor(batch);
  const delta = deriveDeltaReadinessAggregatesV5(batch);
  const expansion = deriveCanonicalReachableMembershipSd9CoverageExpansionV5(batch);

  return Object.freeze({
    record: R43_PUBLIC_CENSUS_RECORD_KIND,
    recordKind: 'PUBLIC_AGGREGATE_ONLY_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS' as const,
    task: 'A3_R43_INCREMENTAL_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_V5' as const,
    ownerDecision: 'AUTHORISE_A3_R43_INCREMENTAL_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_V5' as const,
    split: R43_READINESS_SPLIT,
    r42Tip: provenance.r42Tip,
    r42ScopePinCommit: provenance.r42ScopePinCommit,
    implementationCommit: provenance.implementationCommit,
    thisFileAuthorises: Object.freeze([]) as readonly [],
    r42Reproduction: Object.freeze({
      committedRecord: reproduction.committedRecord,
      freshInProcessUpstreamChainConsumed: true as const,
      freshR42CensusEqualsCommitted: reproduction.differingSemanticPathCount === 0,
      comparedTopLevelFieldCount: reproduction.comparedTopLevelFieldCount,
      excludedExecutionProvenanceFields: reproduction.excludedFields,
      differingSemanticPathCount: reproduction.differingSemanticPathCount,
      reproductionProofBoundToExactR42BatchByIdentity: true as const,
      reproducedSampleSlots: reproduction.deltaSlotPreparations,
      reproducedDeltaSetP: reproduction.deltaSetP,
      reproducedDeltaSetR: Object.freeze({
        ...reproduction.deltaSetR,
        fullRankExactSlotCount: reproduction.deltaSetRFullRankExactSlotCount,
        fullRankShortTextBlockedSlotCount: reproduction.deltaSetRFullRankShortTextBlockedSlotCount,
      }),
      reproducedDeltaDivergence: reproduction.deltaDivergence,
      reproducedSampleCoverage: reproduction.sampleCoverageBeforeR43,
      reproducedReadinessCoverage: reproduction.readinessCoverageBeforeR43,
    }),
    delta: Object.freeze({
      deltaReadinessSlots: delta.slotReadinessCount,
      setP: delta.setP,
      setR: delta.setR,
      crossSample: delta.crossSample,
    }),
    canonicalConstants: C,
    generationBoundary: Object.freeze({
      reachableMembershipPolicyGeneration: C.generation,
      policyGenerationIsTheFrozenA3MethodologyGeneration: true as const,
      governanceV5IsCrossGenerationAcquisitionGovernance: true as const,
      policyGenerationDerivedFromAcquisitionGeneration: false as const,
      policyGenerationDerivedFromResolutionGeneration: false as const,
      policyGenerationDerivedFromV5Authority: false as const,
      crossGenerationMembershipPolicyInvented: false as const,
      r24OwnerPolicyBindingModified: false as const,
    }),
    historicalReadinessCoverage: Object.freeze({
      r37Record:
        'PHASE_2B_2D_A3_R37_DEV_TRAIN_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS_V1' as const,
      r42Record:
        'PHASE_2B_2D_A3_R42_DEV_TRAIN_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION_CENSUS_V1' as const,
      r37HistoricalReadinessSlotsBeforeR37: historical.r37HistoricalReadinessSlotsBeforeR37,
      r37NewReadinessSlots: historical.r37NewReadinessSlots,
      r37ReadinessSlots: historical.slotReadinessCount,
      r42HistoricalSampleCoverage: historical.r42HistoricalSampleCoverage,
      r42HistoricalReadinessCoverage: historical.r42HistoricalReadinessCoverage,
      readFromCommittedAggregateRecordsOnly: true as const,
      r37ArithmeticClosed: true as const,
      r37ReadinessSlotsEqualR42HistoricalSampleAndReadinessCoverage: true as const,
      historicalReachableMembershipEqualsR42HistoricalCaps: true as const,
      historicalReadinessObjectsReconstructed: false as const,
      historicalR24R30R37HelpersRerun: false as const,
    }),
    coverage: Object.freeze({
      historicalCanonicalReadinessSlots: expansion.historicalReadinessSlotCount,
      newR43ReadinessSlots: expansion.deltaReadinessSlotCount,
      coverageReadinessSlots: expansion.coverageReadinessSlotCount,
      historical: expansion.historical,
      new: expansion.delta,
      coverage: expansion.coverage,
      authorityCoverage: reproduction.authorityCoverage,
      evidenceCoverage: reproduction.evidenceCoverage,
      documentCoverage: reproduction.documentCoverage,
      graphCoverage: reproduction.graphCoverage,
      sampleCoverage: expansion.sampleCoverageAfterR43,
      readinessCoverageAfterR43: expansion.readinessCoverageAfterR43,
      coverageIsSumOfPerSlotCounts: true as const,
      twentySlotReadinessBatchMinted: false as const,
      corpusFreezeApproved: false as const,
      finalSetPMaterialised: false as const,
      finalSetRMaterialised: false as const,
      completePreflightClear: false as const,
      a5Frozen: false as const,
    }),
    semantics: Object.freeze({
      historicalReadinessRederived: false as const,
      historicalReadinessObjectsReminted: false as const,
      deltaOnlyReadinessDerivation: true as const,
      canonicalR24PureHelperUsed: true as const,
      canonicalR24CallsPerDeltaSlot: r24Calls / delta.slotReadinessCount,
      canonicalR24CallCount: r24Calls,
      historicalR24Calls: 0 as const,
      genuineR42PreparationPassedToR24: true as const,
      setRReadinessRederived: false as const,
      canonicalCapArraysUsedByReference: true as const,
      capSliced: false as const,
      blockedCapMembershipInvented: false as const,
      fullRankExactnessRequiredForExactReachableCap: false as const,
      unreachableShortTextTailResolved: false as const,
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
      allOrNothingMinting: true as const,
    }),
    sd9AuthorityBoundary: Object.freeze({
      a3MechanicalReadinessOnly: true as const,
      rewritesA2AcquisitionStatus: false as const,
      createsReplacementObligation: false as const,
      consumesReserve: false as const,
      changesLedger: false as const,
      authorisesAcquisition: false as const,
      constitutesA2Adjudication: false as const,
      altersGovernanceV5: false as const,
      createsGovernanceV6: false as const,
    }),
    access: Object.freeze({
      r43SqlStatements: 0 as const,
      databaseAccessOnlyThroughCanonicalUpstreamR39Reproduction: true as const,
      upstreamRole: reproduction.upstreamRole,
      upstreamDatabase: reproduction.upstreamDatabase,
      upstreamTransactionReadOnly: reproduction.upstreamTransactionReadOnly,
      upstreamTransactionIsolation: reproduction.upstreamTransactionIsolation,
      upstreamPoolConnections: reproduction.upstreamPoolConnections,
      upstreamSnapshotTransactions: reproduction.upstreamSnapshotTransactions,
      upstreamSqlStatements: reproduction.upstreamSqlStatements,
      upstreamNewAuthorityEvidenceLoads: reproduction.upstreamNewAuthorityEvidenceLoads,
      upstreamOldAuthorityEvidenceLoads: reproduction.upstreamOldAuthorityEvidenceLoads,
      upstreamDevConfirmEvidenceReads: reproduction.upstreamDevConfirmEvidenceReads,
      upstreamFinalHoldoutEvidenceReads: reproduction.upstreamFinalHoldoutEvidenceReads,
      upstreamWrites: reproduction.upstreamWrites,
      upstreamPoolClosedBeforeR40Assembly: reproduction.upstreamPoolClosedBeforeR40Assembly,
      r21DocumentCalls: reproduction.r21Calls,
      r22GraphCalls: reproduction.r22Calls,
      r23SampleCalls: reproduction.r23Calls,
      r24ReadinessCalls: r24Calls,
      historicalR24ReadinessCalls: 0 as const,
      sqlAfterUpstreamPoolClose: 0 as const,
      databaseWrites: 0 as const,
      institutionNetworkRequests: 0 as const,
      sealedRootReads: 0 as const,
    }),
    whatThisIsNot: Object.freeze([
      'NOT_A_TWENTY_SLOT_READINESS_BATCH',
      'NOT_A_REDERIVATION_OF_THE_THIRTEEN_HISTORICAL_READINESS_SLOTS',
      'NOT_SHORT_TEXT_AUTHORITY',
      'NOT_AN_EXTENSION',
      'NOT_SD4_OR_K4',
      'NOT_A_COMPLETE_CORPUS_FREEZE_PREFLIGHT',
      'NOT_A_FINAL_SET_P',
      'NOT_A_FINAL_SET_R',
      'NOT_A2_ACQUISITION_AUTHORITY',
      'NOT_AN_A2_ADJUDICATION',
      'NOT_A_REPLACEMENT_DECISION',
      'NOT_A_LABEL_OR_CLASSIFICATION',
      'NOT_GOVERNANCE_V6',
      'NOT_AN_A5_FREEZE',
    ]),
    identityDisclosure: Object.freeze({
      selectionIndices: false as const,
      reservePositions: false as const,
      organisationIds: false as const,
      echeRowKeys: false as const,
      runIdentifiers: false as const,
      runReferenceDigests: false as const,
      pageIdentifiers: false as const,
      documentDigests: false as const,
      membershipDocumentIdentities: false as const,
      saltedRankDigests: false as const,
      rankPositions: false as const,
      survivorPositions: false as const,
      exclusionPositions: false as const,
      blockingPositions: false as const,
      edgeEndpoints: false as const,
      scoresOrScoreDistributions: false as const,
      urlsOrHosts: false as const,
      titlesHeadingsOrText: false as const,
      labels: false as const,
      sealedFilenames: false as const,
      perSlotCapStatus: false as const,
      perSlotSd9Results: false as const,
      perSlotEnvelopeBounds: false as const,
      whichDeltaSlotsAreGeneration2Reserves: false as const,
      aggregateCountsOnly: true as const,
    }),
    terminalState: R43_SUCCESS_TERMINAL,
    nextOwnerQuestion: R43_NEXT_OWNER_QUESTION,
    immutability: 'append-only. This record is never edited; a correction is a new record',
  });
}

export type R43PublicIncrementalReachableMembershipSd9Census = ReturnType<
  typeof deriveR43PublicIncrementalReachableMembershipSd9Census
>;
