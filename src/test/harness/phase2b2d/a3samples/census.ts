/**
 * PHASE 2B-2D — A3 R23: THE PUBLIC, DERIVED SAMPLE SURVIVOR PREPARATION CENSUS.
 *
 * IT IS DERIVED, AND IT AUTHORISES NOTHING
 *
 *   `thisFileAuthorises: []`. Not acquisition authority, not database-evidence
 *   authority, not a final SET_P or SET_R corpus, not short-text authority,
 *   not SD4 / K4, not SD9 and not a freeze. It counts what one in-process
 *   R19 -> R20 -> R21 -> R22 -> R23 chain prepared, so the survivor and cap
 *   state is reviewable without anyone needing the documents.
 *
 * AGGREGATES ONLY, AND NO NEW DIGEST
 *
 *   Every field is a count, a frozen constant or token, a commit or a
 *   boolean. No selection index, organisation, run, row id, document digest,
 *   salted rank digest, rank / source / survivor / blocking position, edge
 *   endpoint, score, URL, host, root, title, text, label or per-slot
 *   breakdown. And no batch / preparation / rank-snapshot hash: a digest
 *   would be a reusable token a later slice could accept INSTEAD of
 *   re-minting.
 *
 * FULL-RANK AMBIGUITY IS NOT INITIAL-CAP AMBIGUITY
 *
 *   SET_R's full-rank readiness and initial-cap readiness are counted
 *   separately, exactly as the canonical readiness tokens distinguish them.
 */
import {
  K3_SD7_GRAPH_SCOPE,
  K3_SD7_SURVIVOR_PROCEDURE,
  K3_SD7_SURVIVOR_SCOPE,
  SET_P_MAX_PAGES_PER_ORGANISATION,
  SET_R_MAX_PAGES_PER_ORGANISATION,
} from '../a3prep/contracts.js';
import { SET_P_DOCUMENT_CAP_EXACT } from '../a3prep/setPSd7.js';
import {
  SET_R_DOCUMENT_CAP_EXACT,
  SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
  SET_R_INITIAL_CAP_EXACT,
} from '../a3prep/setRSd7Readiness.js';
import { R20_EVIDENCE_SPLIT_V1 } from '../a3evidence/types.js';
import { isA3DevTrainSampleSurvivorBatch, slotGraphForSlotSamplePreparation } from './devTrain.js';
import { sampleSurvivorDivergence } from './prepare.js';
import { refuse } from './refusal.js';
import type { A3DevTrainSampleSurvivorBatchV1 } from './types.js';

export const R23_PUBLIC_CENSUS_RECORD_KIND =
  'PHASE_2B_2D_A3_R23_DEV_TRAIN_SAMPLE_SURVIVOR_PREPARATION_CENSUS_V1';

export interface R23CensusProvenance {
  readonly r22Tip: string;
  readonly implementationCommit: string;
}

interface R23SampleAggregate {
  readonly preSd7RankEntryCount: number;
  readonly measurableDocumentCount: number;
  readonly measurableSurvivorCount: number;
  readonly measurableExclusionCount: number;
  readonly unresolvedShortTextOccurrenceCount: number;
  readonly initialCapExactSlotCount: number;
  readonly initialCapBlockedSlotCount: number;
  readonly exactCapDocumentCountAcrossExactSlots: number;
}

export interface R23PublicSampleSurvivorCensus {
  readonly record: typeof R23_PUBLIC_CENSUS_RECORD_KIND;
  readonly recordKind: 'PUBLIC_AGGREGATE_ONLY_SAMPLE_SURVIVOR_PREPARATION_CENSUS';
  readonly generationId: string;
  readonly split: typeof R20_EVIDENCE_SPLIT_V1;
  readonly registryVersion: string;
  readonly governanceSnapshotCommit: string;
  readonly r22Tip: string;
  readonly implementationCommit: string;
  readonly thisFileAuthorises: readonly [];
  readonly preparation: {
    readonly r22SlotGraphCount: number;
    readonly slotPreparationCount: number;
    readonly sharedExactDocumentPopulationCount: number;
  };
  readonly setP: R23SampleAggregate;
  readonly setR: R23SampleAggregate & {
    readonly fullRankExactSlotCount: number;
    readonly fullRankShortTextBlockedSlotCount: number;
    readonly fullRankBlockedWhileInitialCapExactSlotCount: number;
  };
  readonly sampleSpecificDivergence: {
    readonly measurableDocumentCount: number;
    readonly survivingBothSamples: number;
    readonly survivingSetPOnly: number;
    readonly survivingSetROnly: number;
    readonly excludedInBothSamples: number;
  };
  readonly canonicalConstants: {
    readonly setPMaxPagesPerOrganisation: typeof SET_P_MAX_PAGES_PER_ORGANISATION;
    readonly setRMaxPagesPerOrganisation: typeof SET_R_MAX_PAGES_PER_ORGANISATION;
    readonly k3SurvivorProcedure: typeof K3_SD7_SURVIVOR_PROCEDURE;
    readonly k3SurvivorScope: typeof K3_SD7_SURVIVOR_SCOPE;
    readonly k3GraphScope: typeof K3_SD7_GRAPH_SCOPE;
  };
  readonly semantics: {
    readonly sameCanonicalGraphUsedForBothSamples: true;
    readonly sameExactDocumentPopulationForBothSamples: true;
    readonly setPOrderCanonical: true;
    readonly setROrderCanonical: true;
    readonly k3SampleSpecificGreedySurvivorsUsed: true;
    readonly canonicalCompositionOnly: true;
    readonly survivorWalkReimplemented: false;
    readonly rankReimplemented: false;
    readonly capReimplemented: false;
    readonly scoresRecomputed: false;
    readonly survivorIndependenceVerified: true;
    readonly exclusionWitnessesVerified: true;
    readonly shortTextResolved: false;
    readonly shortTextCountedAsSurvivorOrExclusion: false;
    readonly blockedCapsInventMembership: false;
    readonly extensionPerformed: false;
    readonly sd4Applied: false;
    readonly k4Applied: false;
    readonly sd9Evaluated: false;
    readonly labelsRead: false;
    readonly classifierCalled: false;
    readonly finalGenerationSetPMaterialised: false;
    readonly finalGenerationSetRMaterialised: false;
  };
  readonly access: {
    readonly r23SqlStatements: 0;
    readonly databaseAccessOnlyThroughCanonicalR20: true;
    readonly databaseWrites: 0;
    readonly institutionNetworkRequests: 0;
    readonly sealedRootReads: 0;
    readonly nonDevTrainEvidenceReads: 0;
  };
  readonly whatThisIsNot: readonly string[];
  readonly identityDisclosure: Readonly<Record<string, false>>;
}

/**
 * Derives the census from a MINTED sample batch. Anything else refuses: a
 * census over hand-built preparations would report numbers nothing proved.
 */
export function deriveR23PublicSampleSurvivorCensus(
  batch: A3DevTrainSampleSurvivorBatchV1,
  provenance: R23CensusProvenance,
): R23PublicSampleSurvivorCensus {
  if (!isA3DevTrainSampleSurvivorBatch(batch)) {
    refuse(
      'R23_BATCH_COMPOSITION_INVALID',
      'the census input was not a minted DEV_TRAIN sample survivor batch',
    );
  }

  let population = 0;
  const p = {
    preSd7RankEntryCount: 0,
    measurableDocumentCount: 0,
    measurableSurvivorCount: 0,
    measurableExclusionCount: 0,
    unresolvedShortTextOccurrenceCount: 0,
    initialCapExactSlotCount: 0,
    initialCapBlockedSlotCount: 0,
    exactCapDocumentCountAcrossExactSlots: 0,
  };
  const r = { ...p };
  let fullRankExactSlotCount = 0;
  let fullRankShortTextBlockedSlotCount = 0;
  let fullRankBlockedWhileInitialCapExactSlotCount = 0;
  const divergence = {
    measurableDocumentCount: 0,
    survivingBothSamples: 0,
    survivingSetPOnly: 0,
    survivingSetROnly: 0,
    excludedInBothSamples: 0,
  };

  for (const item of batch.items) {
    const slotGraph = slotGraphForSlotSamplePreparation(item);
    if (slotGraph === undefined) {
      refuse('R23_BATCH_COMPOSITION_INVALID', 'a slot preparation does not trace to an R22 graph');
    }
    population += slotGraph.graph.documents.length;

    const setP = item.setP;
    p.preSd7RankEntryCount += setP.preSd7FullRank.length;
    p.measurableDocumentCount += setP.sd7Preparation.counts.measurableDocumentCount;
    p.measurableSurvivorCount += setP.sd7Preparation.counts.measurableSurvivorCount;
    p.measurableExclusionCount += setP.sd7Preparation.counts.measurableExclusionCount;
    p.unresolvedShortTextOccurrenceCount += setP.sd7Preparation.counts.shortTextUnresolvedCount;
    if (setP.documentCap.status === SET_P_DOCUMENT_CAP_EXACT) {
      p.initialCapExactSlotCount += 1;
      p.exactCapDocumentCountAcrossExactSlots += setP.documentCap.documents.length;
    } else {
      p.initialCapBlockedSlotCount += 1;
    }

    const setR = item.setR;
    r.preSd7RankEntryCount += setR.preSd7FullRank.length;
    r.measurableDocumentCount += setR.sd7Preparation.counts.measurableDocumentCount;
    r.measurableSurvivorCount += setR.sd7Preparation.counts.measurableSurvivorCount;
    r.measurableExclusionCount += setR.sd7Preparation.counts.measurableExclusionCount;
    r.unresolvedShortTextOccurrenceCount += setR.sd7Preparation.counts.shortTextUnresolvedCount;
    if (item.setRDocumentCap.status === SET_R_DOCUMENT_CAP_EXACT) {
      r.initialCapExactSlotCount += 1;
      r.exactCapDocumentCountAcrossExactSlots += item.setRDocumentCap.documents.length;
    } else {
      r.initialCapBlockedSlotCount += 1;
    }
    const readiness = item.setRFreezeSlotReadiness;
    if (readiness.fullRankReadiness === SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT) {
      fullRankExactSlotCount += 1;
    } else {
      fullRankShortTextBlockedSlotCount += 1;
      if (readiness.initialCapReadiness === SET_R_INITIAL_CAP_EXACT) {
        fullRankBlockedWhileInitialCapExactSlotCount += 1;
      }
    }

    const slotDivergence = sampleSurvivorDivergence(item, slotGraph.graph);
    divergence.measurableDocumentCount += slotDivergence.measurableDocumentCount;
    divergence.survivingBothSamples += slotDivergence.survivingBothSamples;
    divergence.survivingSetPOnly += slotDivergence.survivingSetPOnly;
    divergence.survivingSetROnly += slotDivergence.survivingSetROnly;
    divergence.excludedInBothSamples += slotDivergence.excludedInBothSamples;
  }

  const resolution = batch.governanceSnapshot.resolution;

  return Object.freeze({
    record: R23_PUBLIC_CENSUS_RECORD_KIND,
    recordKind: 'PUBLIC_AGGREGATE_ONLY_SAMPLE_SURVIVOR_PREPARATION_CENSUS' as const,
    generationId: resolution.summary.generationId,
    split: R20_EVIDENCE_SPLIT_V1,
    registryVersion: resolution.registryVersion,
    governanceSnapshotCommit: resolution.governanceBaseCommit,
    r22Tip: provenance.r22Tip,
    implementationCommit: provenance.implementationCommit,
    thisFileAuthorises: Object.freeze([]) as readonly [],
    preparation: Object.freeze({
      r22SlotGraphCount: batch.items.length,
      slotPreparationCount: batch.items.length,
      sharedExactDocumentPopulationCount: population,
    }),
    setP: Object.freeze(p),
    setR: Object.freeze({
      ...r,
      fullRankExactSlotCount,
      fullRankShortTextBlockedSlotCount,
      fullRankBlockedWhileInitialCapExactSlotCount,
    }),
    sampleSpecificDivergence: Object.freeze(divergence),
    canonicalConstants: Object.freeze({
      setPMaxPagesPerOrganisation: SET_P_MAX_PAGES_PER_ORGANISATION,
      setRMaxPagesPerOrganisation: SET_R_MAX_PAGES_PER_ORGANISATION,
      k3SurvivorProcedure: K3_SD7_SURVIVOR_PROCEDURE,
      k3SurvivorScope: K3_SD7_SURVIVOR_SCOPE,
      k3GraphScope: K3_SD7_GRAPH_SCOPE,
    }),
    semantics: Object.freeze({
      sameCanonicalGraphUsedForBothSamples: true as const,
      sameExactDocumentPopulationForBothSamples: true as const,
      setPOrderCanonical: true as const,
      setROrderCanonical: true as const,
      k3SampleSpecificGreedySurvivorsUsed: true as const,
      canonicalCompositionOnly: true as const,
      survivorWalkReimplemented: false as const,
      rankReimplemented: false as const,
      capReimplemented: false as const,
      scoresRecomputed: false as const,
      survivorIndependenceVerified: true as const,
      exclusionWitnessesVerified: true as const,
      shortTextResolved: false as const,
      shortTextCountedAsSurvivorOrExclusion: false as const,
      blockedCapsInventMembership: false as const,
      extensionPerformed: false as const,
      sd4Applied: false as const,
      k4Applied: false as const,
      sd9Evaluated: false as const,
      labelsRead: false as const,
      classifierCalled: false as const,
      finalGenerationSetPMaterialised: false as const,
      finalGenerationSetRMaterialised: false as const,
    }),
    access: Object.freeze({
      r23SqlStatements: 0 as const,
      databaseAccessOnlyThroughCanonicalR20: true as const,
      databaseWrites: 0 as const,
      institutionNetworkRequests: 0 as const,
      sealedRootReads: 0 as const,
      nonDevTrainEvidenceReads: 0 as const,
    }),
    whatThisIsNot: Object.freeze([
      'NOT_A2_ACQUISITION_AUTHORITY',
      'NOT_DATABASE_EVIDENCE_AUTHORITY',
      'NOT_A_GENERATION_1_CORPUS',
      'NOT_A_FINAL_SET_P',
      'NOT_A_FINAL_SET_R',
      'NOT_SHORT_TEXT_AUTHORITY',
      'NOT_AN_EXTENSION',
      'NOT_SD4_OR_K4',
      'NOT_SD9',
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
      saltedRankDigests: false as const,
      rankPositions: false as const,
      sourceRankPositions: false as const,
      survivorRankPositions: false as const,
      blockingSurvivorPositions: false as const,
      edgeEndpoints: false as const,
      scoresOrScoreDistributions: false as const,
      perSlotBreakdown: false as const,
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
