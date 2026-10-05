/**
 * PHASE 2B-2D — A3 R37: THE V4 READINESS COVERAGE EXPANSION AND THE PUBLIC, DERIVED CENSUS.
 *
 * THE COVERAGE EXPANSION IS COUNTS, NOT A THIRTEEN-SLOT BATCH
 *
 *   Historical R24 + R30 coverage enters as the committed aggregate baseline
 *   (see `r36Drift.ts`); delta coverage is derived from the MINTED R37 batch.
 *   The sum is an aggregate statement only - nothing is minted for it, and no
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
 *   host, text, label, per-slot breakdown, per-slot cap status or per-slot
 *   SD9 result. And no `readinessDeltaHash`, `membershipCoverageHash`,
 *   `sd9ExpansionHash` or `reachableCorpusHash`: authority is in-process
 *   R36 -> R37 provenance.
 *
 * The cap, readiness and SD9 tokens are STATED in `types.ts`, not imported
 * from `a3prep/`. The unit suite asserts they equal the canonical constants.
 */
import { aggregateDeltaReadinessV4 } from './deriveDelta.js';
import {
  isA3DevTrainReachableMembershipSd9DeltaBatchV4,
  samplePreparationForDeltaReadinessV4,
} from './devTrain.js';
import {
  r36ReproductionProofForBatch,
  requireHistoricalReadinessBaselineProofV4,
  type R36ReproducedSampleCounts,
} from './r36Drift.js';
import { refuseV4Readiness } from './refusal.js';
import {
  R37_READINESS_SPLIT,
  R37_STATED_CANONICAL_READINESS_CONSTANTS as C,
  type A3DevTrainCanonicalReachableMembershipSd9CoverageExpansionV4,
  type A3DevTrainReachableMembershipSd9DeltaBatchV4,
  type CrossSampleSd9AggregateV4,
  type HistoricalReadinessBaselineV4,
  type R37DeltaReadinessAggregates,
  type ReadinessSampleAggregateV4,
} from './types.js';

export const R37_PUBLIC_CENSUS_RECORD_KIND =
  'PHASE_2B_2D_A3_R37_DEV_TRAIN_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS_V1';

function requireMintedReadinessBatch(batch: unknown): A3DevTrainReachableMembershipSd9DeltaBatchV4 {
  if (!isA3DevTrainReachableMembershipSd9DeltaBatchV4(batch)) {
    refuseV4Readiness(
      'R37_NOT_A_MINTED_DELTA_READINESS_BATCH',
      'the input was not a DEV_TRAIN reachable-membership / SD9 delta batch minted by R37',
    );
  }
  return batch;
}

/** Delta aggregates, derived per slot from the minted readiness. Identities never leave memory. */
export function deriveDeltaReadinessAggregatesV4(
  readinessDeltaBatch: A3DevTrainReachableMembershipSd9DeltaBatchV4,
): R37DeltaReadinessAggregates {
  const batch = requireMintedReadinessBatch(readinessDeltaBatch);
  for (const item of batch.items) {
    if (samplePreparationForDeltaReadinessV4(item) === undefined) {
      refuseV4Readiness(
        'R37_DELTA_BATCH_COMPOSITION_INVALID',
        'a delta readiness does not trace to an R36 preparation',
      );
    }
  }
  return aggregateDeltaReadinessV4(batch.items);
}

function sumSample(
  a: ReadinessSampleAggregateV4,
  b: ReadinessSampleAggregateV4,
): ReadinessSampleAggregateV4 {
  const keys = Object.keys(a) as (keyof ReadinessSampleAggregateV4)[];
  return Object.freeze(
    Object.fromEntries(keys.map((key) => [key, a[key] + b[key]])) as unknown as Record<
      keyof ReadinessSampleAggregateV4,
      number
    >,
  );
}

function sumCross(
  a: CrossSampleSd9AggregateV4,
  b: CrossSampleSd9AggregateV4,
): CrossSampleSd9AggregateV4 {
  return Object.freeze({
    bothSamplesMechanicallySuccessfulSlotCount:
      a.bothSamplesMechanicallySuccessfulSlotCount + b.bothSamplesMechanicallySuccessfulSlotCount,
    sd9StatusDisagreementSlotCount:
      a.sd9StatusDisagreementSlotCount + b.sd9StatusDisagreementSlotCount,
  });
}

function historyAgrees(
  historical: ReadinessSampleAggregateV4,
  proved: R36ReproducedSampleCounts,
): boolean {
  return (
    historical.measurableSurvivorCount === proved.measurableSurvivorCount &&
    historical.unresolvedShortTextOccurrenceCount === proved.unresolvedShortTextOccurrenceCount &&
    historical.reachableMembershipExactSlotCount === proved.initialCapExactSlotCount &&
    historical.reachableMembershipBlockedSlotCount === proved.initialCapBlockedSlotCount &&
    historical.reachableMembershipDocumentCountAcrossExactSlots ===
      proved.exactCapDocumentCountAcrossExactSlots
  );
}

/**
 * §10 / §25. Historical R24 + R30 baseline + minted delta = coverage. The
 * historical slot count must be exactly R33's historical canonical coverage
 * and R36's proved historical preparations, with the historical readiness
 * describing R36's proved historical caps / survivors / short text; the
 * delta count must be R33's newly bound delta; and the combined count the V4
 * DEV_TRAIN coverage. No expected count is accepted from a caller.
 */
export function deriveCanonicalReachableMembershipSd9CoverageExpansionV4(
  readinessDeltaBatch: A3DevTrainReachableMembershipSd9DeltaBatchV4,
  historicalBaseline: HistoricalReadinessBaselineV4,
): A3DevTrainCanonicalReachableMembershipSd9CoverageExpansionV4 {
  const batch = requireMintedReadinessBatch(readinessDeltaBatch);
  const historical = requireHistoricalReadinessBaselineProofV4(historicalBaseline);
  const proof = r36ReproductionProofForBatch(batch.sampleDeltaBatch);
  if (proof === undefined) {
    refuseV4Readiness(
      'R37_R36_REPRODUCTION_NOT_PROVED_FOR_BATCH',
      'the R36 batch behind this R37 batch was not proved to reproduce the committed census',
    );
  }
  const delta = deriveDeltaReadinessAggregatesV4(batch);
  const evidenceCoverage =
    batch.sampleDeltaBatch.graphDeltaBatch.documentSourceDeltaBatch.evidenceDeltaBatch.coverage;
  if (
    historical.slotReadinessCount !== evidenceCoverage.historicalCanonicalCoverageCount ||
    historical.slotReadinessCount !== proof.historicalSlotPreparations ||
    !historyAgrees(historical.setP, proof.historicalSetP) ||
    !historyAgrees(historical.setR, proof.historicalSetR) ||
    historical.setR.fullRankExactSlotCount !== proof.historicalSetRFullRankExactSlotCount ||
    historical.setR.fullRankShortTextBlockedSlotCount !==
      proof.historicalSetRFullRankShortTextBlockedSlotCount ||
    delta.slotReadinessCount !== evidenceCoverage.newlyBoundDeltaCount ||
    delta.slotReadinessCount !== proof.deltaSlotPreparations ||
    historical.slotReadinessCount + delta.slotReadinessCount !==
      evidenceCoverage.v4DevTrainReadyCount ||
    historical.slotReadinessCount + delta.slotReadinessCount !== proof.coverageSlotPreparations
  ) {
    refuseV4Readiness(
      'R37_SAMPLE_DELTA_COVERAGE_NOT_ADDITIVE',
      'historical R24 + R30 readiness plus delta readiness does not equal the V4 DEV_TRAIN coverage',
    );
  }
  return Object.freeze({
    kind: 'A3_DEV_TRAIN_CANONICAL_REACHABLE_MEMBERSHIP_SD9_COVERAGE_EXPANSION_V4' as const,
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

export interface R37CensusProvenance {
  /** The exact R36 tip R37 was cut from. */
  readonly r36Tip: string;
  /** The one commit that pinned R36's isolation test to its own range. */
  readonly r36ScopePinCommit: string;
  /** The R37 commit the real reproduction and delta readiness executed at. */
  readonly implementationCommit: string;
}

/** Derives the public census from a MINTED readiness delta batch; anything else refuses. */
export function deriveR37PublicIncrementalReachableMembershipSd9Census(
  readinessDeltaBatch: A3DevTrainReachableMembershipSd9DeltaBatchV4,
  historicalBaseline: HistoricalReadinessBaselineV4,
  provenance: R37CensusProvenance,
) {
  const batch = requireMintedReadinessBatch(readinessDeltaBatch);
  const historical = requireHistoricalReadinessBaselineProofV4(historicalBaseline);
  const delta = deriveDeltaReadinessAggregatesV4(batch);
  const expansion = deriveCanonicalReachableMembershipSd9CoverageExpansionV4(batch, historical);
  const reproduction = r36ReproductionProofForBatch(batch.sampleDeltaBatch);
  if (reproduction === undefined) {
    refuseV4Readiness(
      'R37_R36_REPRODUCTION_NOT_PROVED_FOR_BATCH',
      'the R36 batch behind this R37 batch was not proved to reproduce the committed census',
    );
  }

  return Object.freeze({
    record: R37_PUBLIC_CENSUS_RECORD_KIND,
    recordKind: 'PUBLIC_AGGREGATE_ONLY_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS' as const,
    generationId: batch.governanceSnapshotV4.resolution.summary.generationId,
    split: R37_READINESS_SPLIT,
    r36Tip: provenance.r36Tip,
    r36ScopePinCommit: provenance.r36ScopePinCommit,
    implementationCommit: provenance.implementationCommit,
    thisFileAuthorises: Object.freeze([]) as readonly [],
    r36Reproduction: Object.freeze({
      freshInProcessR33R34R35R36MintConsumed: true as const,
      freshR36CensusEqualsCommitted: reproduction.differingPaths.length === 0,
      comparedTopLevelFieldCount: reproduction.comparedTopLevelFieldCount,
      excludedExecutionProvenanceFields: reproduction.excludedFields,
      reproductionProofBoundToExactR36BatchByIdentity: true as const,
      reproducedDeltaSlotPreparations: reproduction.deltaSlotPreparations,
      reproducedDeltaSetP: reproduction.deltaSetP,
      reproducedDeltaSetR: reproduction.deltaSetR,
    }),
    delta: Object.freeze({
      deltaReadinessSlots: delta.slotReadinessCount,
      setP: delta.setP,
      setR: delta.setR,
      crossSample: delta.crossSample,
    }),
    canonicalConstants: C,
    historicalReadinessCoverage: Object.freeze({
      r24HistoricalReadinessSlots: historical.r24SlotReadinessCount,
      r30NewReadinessSlots: historical.r30NewSlotReadinessCount,
      historicalReadinessSlots: historical.slotReadinessCount,
      readFromCommittedAggregateRecordsOnly: true as const,
      r24PlusR30ArithmeticClosed: true as const,
      historicalReadinessSlotsEqualR36HistoricalPreparationSlots: true as const,
      historicalReachableMembershipEqualsR36HistoricalCaps: true as const,
    }),
    coverage: Object.freeze({
      historicalCanonicalReadinessSlots: expansion.historicalReadinessSlotCount,
      newR37ReadinessSlots: expansion.deltaReadinessSlotCount,
      coverageReadinessSlots: expansion.coverageReadinessSlotCount,
      historical: expansion.historical,
      new: expansion.delta,
      coverage: expansion.coverage,
      coverageIsSumOfPerSlotCounts: true as const,
      thirteenSlotReadinessBatchMinted: false as const,
    }),
    semantics: Object.freeze({
      historicalR24R30StatesRecomputed: false as const,
      historicalReadinessObjectsReminted: false as const,
      deltaOnlyReadinessDerivation: true as const,
      canonicalR24PureHelperUsed: true as const,
      canonicalR24HelperCallsPerDeltaSlot: 1 as const,
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
    }),
    sd9AuthorityBoundary: Object.freeze({
      a3MechanicalReadinessOnly: true as const,
      rewritesA2AcquisitionStatus: false as const,
      createsReplacementObligation: false as const,
      consumesReserve: false as const,
      changesLedger: false as const,
      authorisesAcquisition: false as const,
      constitutesA2Adjudication: false as const,
      altersGovernanceV4: false as const,
      createsGovernanceV5: false as const,
    }),
    access: Object.freeze({
      r37SqlStatements: 0 as const,
      databaseAccessOnlyThroughCanonicalUpstreamR33Reproduction: true as const,
      upstreamReproducedR33OldAuthorityQueries: reproduction.upstreamOldAuthorityQueries,
      upstreamReproducedR33DeltaAuthorityQueries: reproduction.upstreamDeltaAuthorityQueries,
      historicalDocumentReassembly: 0 as const,
      historicalGraphRemeasurement: 0 as const,
      historicalSampleRepreparation: 0 as const,
      historicalReadinessRederivation: 0 as const,
      databaseWrites: 0 as const,
      institutionNetworkRequests: 0 as const,
      sealedRootReads: 0 as const,
      devConfirmEvidenceReads: 0 as const,
      finalHoldoutEvidenceReads: 0 as const,
    }),
    whatThisIsNot: Object.freeze([
      'NOT_A_THIRTEEN_SLOT_READINESS_BATCH',
      'NOT_A_REDERIVATION_OF_R24_OR_R30_CANONICAL_HISTORY',
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
      'NOT_GOVERNANCE_V5',
      'NOT_R38_AUTHORITY',
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
      perSlotIdentities: false as const,
      perSlotCapStatus: false as const,
      perSlotSd9Results: false as const,
      perSlotEnvelopeBounds: false as const,
    }),
  });
}

export type R37PublicIncrementalReachableMembershipSd9Census = ReturnType<
  typeof deriveR37PublicIncrementalReachableMembershipSd9Census
>;
