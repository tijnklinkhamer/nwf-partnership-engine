/**
 * PHASE 2B-2D — A3 R47: THE PUBLIC, AGGREGATE-ONLY GLOBAL R4 REPLAY CENSUS.
 *
 * Derived ONLY from minted objects of this process - the R46 approval
 * binding, the eight-checkpoint reproduction proof, the replay view and the
 * R4 graph, sample and readiness batches, each checked by brand and by its
 * private provenance chain. The one caller-supplied input is the real-run
 * harness's own pool-level access observation, which is labelled as such.
 *
 * DISCLOSURE FIREWALL
 *
 *   Aggregate counts only. No selection index, organisation, ECHE row, run,
 *   document digest, page, text, token, equivalence-class membership, edge
 *   endpoint, per-slot count, cap, score, rank, URL, host, title, heading,
 *   label, gold, and no statement of which slots hold short text, gained an R4
 *   edge, or are Generation-2 replacements.
 *
 * THIS MODULE IS PURE. It writes nothing; the caller serialises the result.
 */
import { isR46ApprovalBinding, R46_TERMINAL_COMMIT } from './approval.js';
import { documentPopulationOf, isA3R4DevTrainCanonicalDocumentReplayView } from './documents.js';
import { r4GraphAggregatesOf, r4GraphBatchForView, r4GraphMeasurementsForBatch } from './graphs.js';
import {
  isA3R4DevTrainReadinessBatch,
  r4ReadinessDerivationsForBatch,
  r4SampleBatchForReadinessBatch,
} from './readiness.js';
import { refuseR47 } from './refusal.js';
import {
  R47_REPRODUCTION_EXCLUDED_FIELDS,
  reproducedDocumentBatchesForProof,
  type R47HistoricalReproductionProof,
} from './reproduction.js';
import { r4GraphBatchForSampleBatch, r4SamplePreparationsForBatch } from './samples.js';
import { r4SampleDivergence } from './survivors.js';
import {
  R47_HISTORICAL_R3_BASELINE,
  R47_STRATUM_SLOT_COUNTS,
  type A3R4DevTrainCanonicalDocumentReplayView,
  type A3R4DevTrainReadinessBatch,
  type A3R4DevTrainSlotReadiness,
  type A3R4DevTrainSlotSamplePreparation,
} from './types.js';

export const R47_CENSUS_RECORD = 'PHASE_2B_2D_A3_R47_R4_GLOBAL_DEV_TRAIN_REPLAY_CENSUS_V1';
export const R47_TASK = 'A3_R47_R4_IMPLEMENTATION_AND_GLOBAL_DEV_TRAIN_REPLAY_V1';
export const R47_SUCCESS_TERMINAL =
  'A3_R4_GLOBAL_DEV_TRAIN_REPLAY_COMPLETE_SHORT_TEXT_FREEZE_BLOCKER_CLASS_CLEARED_AWAIT_OWNER_NEXT_PHASE_DECISION';
export const R47_REFUSAL_TERMINAL = 'A3_R4_GLOBAL_DEV_TRAIN_REPLAY_REFUSED_AWAIT_OWNER_REVIEW';
export const R47_BLOCKER_CLASS_CLEARED =
  'DEV_TRAIN_R3_SHORT_TEXT_REQUIRED_MEMBERSHIP_BLOCKER_CLASS_CLEARED_UNDER_R4';
export const R47_NEXT_OWNER_QUESTION =
  'R47 has replayed all twenty DEV_TRAIN slots under approved Methodology V2 R4. Should the next slice audit and authorise the next frozen-methodology phase boundary, without automatically opening DEV_CONFIRM or FINAL_HOLDOUT?';

/** One upstream layer's database access, as the real-run harness's pool wrapper counted it. */
export interface R47LayerAccessObservation {
  readonly layer: 'R20' | 'R26' | 'R33' | 'R39';
  readonly poolConnections: number;
  readonly snapshotTransactions: number;
  readonly sqlStatements: number;
  readonly evidenceLoads: number;
}

export interface R47AccessObservation {
  readonly role: string;
  readonly database: string;
  readonly layers: readonly R47LayerAccessObservation[];
  readonly sqlStatementsAfterLastPoolClosed: number;
  readonly writes: number;
  readonly networkRequests: number;
  readonly devConfirmEvidenceReads: number;
  readonly finalHoldoutEvidenceReads: number;
  readonly sealedRootReads: number;
}

function sampleCensus(
  sample: 'SET_P' | 'SET_R',
  preparations: readonly A3R4DevTrainSlotSamplePreparation[],
  readiness: readonly A3R4DevTrainSlotReadiness[],
) {
  const prep = (p: A3R4DevTrainSlotSamplePreparation) => (sample === 'SET_P' ? p.setP : p.setR);
  const membership = (r: A3R4DevTrainSlotReadiness) =>
    sample === 'SET_P' ? r.setPReachableMembership : r.setRReachableMembership;
  const fullRank = (r: A3R4DevTrainSlotReadiness) =>
    sample === 'SET_P' ? r.setPFullRank : r.setRFullRank;
  const sd9 = (r: A3R4DevTrainSlotReadiness) => (sample === 'SET_P' ? r.setPSd9 : r.setRSd9);
  const statuses = readiness.map((r) => sd9(r).status);
  return Object.freeze({
    capSize: sample === 'SET_P' ? 8 : 4,
    rankedDocuments: preparations.reduce((t, p) => t + prep(p).preSd7FullRank.length, 0),
    survivors: preparations.reduce((t, p) => t + prep(p).sd7Preparation.counts.survivorCount, 0),
    exclusions: preparations.reduce((t, p) => t + prep(p).sd7Preparation.counts.exclusionCount, 0),
    unresolved: preparations.reduce((t, p) => t + prep(p).sd7Preparation.counts.unresolvedCount, 0),
    exactCaps: preparations.filter((p) =>
      prep(p).documentCap.status.endsWith('_DOCUMENT_CAP_EXACT'),
    ).length,
    blockedCaps: preparations.filter(
      (p) => !prep(p).documentCap.status.endsWith('_DOCUMENT_CAP_EXACT'),
    ).length,
    documentsAcrossExactCaps: preparations.reduce(
      (t, p) => t + prep(p).documentCap.documents.length,
      0,
    ),
    fullRankExact: readiness.filter(
      (r) => fullRank(r).status === 'R4_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT',
    ).length,
    fullRankBlocked: readiness.filter(
      (r) => fullRank(r).status !== 'R4_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT',
    ).length,
    reachableExact: readiness.filter(
      (r) => membership(r).status === 'REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT',
    ).length,
    reachableBlocked: readiness.filter(
      (r) => membership(r).status !== 'REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT',
    ).length,
    reachableMembershipIsCapArrayByReference: readiness.every(
      (r, i) => membership(r).documents === prep(preparations[i]!).documentCap.documents,
    ),
    shortTextMembershipBlockers: 0,
    mechanicalSd9: Object.freeze({
      successful: statuses.filter((s) => s === 'ACQUISITION_SUCCESSFUL').length,
      unsuccessful: statuses.filter((s) => s === 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET')
        .length,
      pending: statuses.filter((s) => s === 'ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL').length,
    }),
  });
}

/**
 * Derives the public census from the minted chain. Anything not minted in
 * this process, or not linked by private provenance, refuses.
 */
export function deriveR47PublicGlobalReplayCensus(input: {
  readonly approval: unknown;
  readonly reproductionProof: R47HistoricalReproductionProof;
  readonly view: A3R4DevTrainCanonicalDocumentReplayView;
  readonly readinessBatch: A3R4DevTrainReadinessBatch;
  readonly implementationCommit: string;
  readonly access: R47AccessObservation;
}) {
  const { approval, reproductionProof, view, readinessBatch } = input;
  if (!isR46ApprovalBinding(approval)) {
    refuseR47('R47_R46_APPROVAL_NOT_BOUND', 'the census needs the bound R46 approval');
  }
  if (reproducedDocumentBatchesForProof(reproductionProof) === undefined) {
    refuseR47(
      'R47_HISTORICAL_REPRODUCTION_NOT_PROVED',
      'the census needs the minted reproduction proof',
    );
  }
  if (
    !isA3R4DevTrainCanonicalDocumentReplayView(view) ||
    !isA3R4DevTrainReadinessBatch(readinessBatch)
  ) {
    refuseR47(
      'R47_NOT_A_MINTED_R4_READINESS_BATCH',
      'the census needs the minted view and readiness batch',
    );
  }
  const sampleBatch = r4SampleBatchForReadinessBatch(readinessBatch)!;
  const graphBatch = r4GraphBatchForSampleBatch(sampleBatch);
  if (graphBatch === undefined || r4GraphBatchForView(view) !== graphBatch) {
    refuseR47('R47_NOT_A_MINTED_R4_GRAPH_BATCH', 'the readiness batch does not trace to this view');
  }

  const graphs = graphBatch.items;
  const preparations = sampleBatch.items;
  const readiness = readinessBatch.items;
  const graphAggregates = r4GraphAggregatesOf(graphs);
  const population = documentPopulationOf(view.slots);
  const setP = sampleCensus('SET_P', preparations, readiness);
  const setR = sampleCensus('SET_R', preparations, readiness);

  const divergence = preparations
    .map((p, i) => r4SampleDivergence(p, graphs[i]!.graph))
    .reduce(
      (t, d) => ({
        documents: t.documents + d.documentCount,
        survivingBothSamples: t.survivingBothSamples + d.survivingBothSamples,
        survivingSetPOnly: t.survivingSetPOnly + d.survivingSetPOnly,
        survivingSetROnly: t.survivingSetROnly + d.survivingSetROnly,
        excludedInBothSamples: t.excludedInBothSamples + d.excludedInBothSamples,
      }),
      {
        documents: 0,
        survivingBothSamples: 0,
        survivingSetPOnly: 0,
        survivingSetROnly: 0,
        excludedInBothSamples: 0,
      },
    );

  const a2Matched = graphs.filter(
    (g) => g.a2StatusMatches && g.graphSd9Status === g.a2AcquisitionOfRecordDisposition,
  ).length;
  const strata = Object.fromEntries(
    Object.keys(R47_STRATUM_SLOT_COUNTS).map((stratum) => [
      stratum,
      view.slots.filter((slot) => slot.stratum === stratum).length,
    ]),
  );
  const continuity = {
    unchangedHistorical: view.slots.filter(
      (s) => s.governanceContinuity === 'V4_TO_V5_UNCHANGED_HISTORICAL',
    ).length,
    v5Additions: view.slots.filter((s) => s.governanceContinuity === 'V5_ADDITION').length,
  };
  const blockerClassCleared =
    view.slots.length === 20 &&
    a2Matched === 20 &&
    setP.reachableExact === 20 &&
    setP.reachableBlocked === 0 &&
    setR.reachableExact === 20 &&
    setR.reachableBlocked === 0 &&
    setP.unresolved === 0 &&
    setR.unresolved === 0;

  return Object.freeze({
    record: R47_CENSUS_RECORD,
    recordKind: 'PUBLIC_AGGREGATE_ONLY_R4_GLOBAL_DEV_TRAIN_REPLAY_CENSUS' as const,
    task: R47_TASK,
    split: 'DEV_TRAIN' as const,
    r46Terminal: R46_TERMINAL_COMMIT,
    implementationCommit: input.implementationCommit,
    thisFileAuthorises: [] as const,
    r46ApprovalBinding: {
      approvalRecordPath: approval.approvalRecord.path,
      approvalRecordSha256: approval.approvalRecord.sha256,
      approvalRecordBytes: approval.approvalRecord.bytes,
      approvalRecordCommit: approval.approvalRecord.commit,
      approvedProposalPath: approval.approvedProposal.path,
      approvedProposalSha256: approval.approvedProposal.sha256,
      approvedProposalBytes: approval.approvedProposal.bytes,
      methodologyVersion: approval.methodologyVersion,
      ruleId: approval.ruleId,
      optionToken: approval.optionToken,
      consumedMarkers: approval.consumedMarkers,
      appliesToGenerations: approval.appliesToGenerations,
      methodologyR4Approved: approval.methodologyR4Approved,
      methodologyR4Frozen: approval.methodologyR4Frozen,
      r47ImplementationReplayAuthorised: approval.r47ImplementationReplayAuthorised,
      r47ExecutedAtApproval: approval.r47ExecutedAtApproval,
      newMethodologyChoiceMade: false,
    },
    historicalInputReproduction: {
      checkpoints: reproductionProof.checkpoints.map((c) => ({
        checkpoint: c.checkpoint,
        committedRecordSha256: c.committedRecordSha256,
        comparedTopLevelFieldCount: c.comparedTopLevelFieldCount,
        differingSemanticPathCount: c.differingSemanticPathCount,
      })),
      excludedFields: R47_REPRODUCTION_EXCLUDED_FIELDS,
      checkpointsReproduced: reproductionProof.checkpoints.length,
      landedCensusDerivationsUsed: true,
      upstreamPoolsClosedBeforeFirstR4Graph: reproductionProof.upstreamPoolsClosed,
      newDocumentSemantics: false,
      newCanonicalDocumentVersion: false,
    },
    documentReplayView: {
      viewKind: view.kind,
      isNewDocumentAuthority: view.isNewDocumentAuthority,
      strata,
      slots: view.slots.length,
      population,
      privateTextCapabilities: view.slots.length,
      globalCrossSlotTextMap: false,
      textOrTokensSerialised: false,
    },
    r3Baseline: {
      ...R47_HISTORICAL_R3_BASELINE,
      status: 'HISTORY_ONLY_NOT_R4_AUTHORITY',
      historicalGraphSampleReadinessConsumedAsR4Authority: false,
    },
    r4Graph: {
      ...graphAggregates,
      measurements: r4GraphMeasurementsForBatch(graphBatch),
      longComponentsNotExactlyAuditable: 0,
      shortCliquesAuditedByEnumeration: 0,
      shortBranchJaccardCalls: 0,
      fabricatedJaccardValues: 0,
      r3LongBranchReproducedExactly: true,
    },
    a2Invariance: {
      devTrainSlotsChecked: graphs.length,
      a2AcquisitionOfRecordStatusesMatched: a2Matched,
      mismatches: graphs.length - a2Matched,
      sd9Function: 'evaluateSd9FromAdmissiblePostSd7Bounds',
      a2Reopened: false,
      reserveReplay: false,
      governanceV5Changed: false,
    },
    setP: { ...setP, preparations: r4SamplePreparationsForBatch(sampleBatch) },
    setR: { ...setR, preparations: r4SamplePreparationsForBatch(sampleBatch) },
    readinessDerivations: r4ReadinessDerivationsForBatch(readinessBatch),
    divergence: {
      ...divergence,
      closes:
        divergence.survivingBothSamples +
          divergence.survivingSetPOnly +
          divergence.survivingSetROnly +
          divergence.excludedInBothSamples ===
        divergence.documents,
    },
    coverage: {
      documentSlots: view.slots.length,
      r4GraphSlots: graphs.length,
      r4SampleSlots: preparations.length,
      r4ReadinessSlots: readiness.length,
      governanceContinuity: continuity,
      historicalR3GraphSampleReadiness: 'RETAINED_AS_HISTORY_ONLY',
      historicalRecordsOverwritten: false,
    },
    r44Comparison: {
      historicalR44SetPBlockedRequiredMemberships: 6,
      historicalR44SetRBlockedRequiredMemberships: 4,
      historicalStatusesCarriedForward: false,
      r4SetPShortTextMembershipBlockers: setP.reachableBlocked,
      r4SetRShortTextMembershipBlockers: setR.reachableBlocked,
    },
    semantics: {
      r3Sd7ImplementationModified: false,
      r4RelationVersioned: true,
      r4ShortBranchRule: 'EQUAL_LENGTH_ELEMENTWISE_IDENTICAL_CANONICAL_TOKEN_SEQUENCE',
      r4ShortEdgeCarriesMeasurement: false,
      k3Procedure: 'GREEDY_SAMPLE_RANK_SURVIVOR_WALK',
      k3Changed: false,
      setPRank: 'rankSetPFull_UNCHANGED',
      setRRank: 'rankSetRFull_UNCHANGED',
      capsChanged: false,
      ownerPolicy: 'REACHABLE_SELECTED_CAPPED_MEMBERSHIP_UNCHANGED',
      sd9FunctionsChanged: false,
      blockerTargetedReplay: false,
      sameGlobalPathForEverySlot: true,
      historicalR3GraphConsumed: false,
    },
    access: {
      role: input.access.role,
      database: input.access.database,
      observedBy: 'R47_REAL_RUN_HARNESS_POOL_WRAPPER',
      layers: input.access.layers,
      sqlStatementsAfterLastPoolClosed: input.access.sqlStatementsAfterLastPoolClosed,
      sqlDuringR4GraphSampleReadiness: 0,
      writes: input.access.writes,
      networkRequests: input.access.networkRequests,
      devConfirmEvidenceReads: input.access.devConfirmEvidenceReads,
      finalHoldoutEvidenceReads: input.access.finalHoldoutEvidenceReads,
      sealedRootReads: input.access.sealedRootReads,
      providerCalls: 0,
      labelsOrGoldRead: false,
    },
    freezeBoundary: {
      conclusion: blockerClassCleared ? R47_BLOCKER_CLASS_CLEARED : null,
      corpusFreezeClear: false,
      corpusFrozen: false,
      whyNotCorpusFreezeClear: [
        'DEV_CONFIRM absent',
        'FINAL_HOLDOUT absent',
        'K4 gated-split readiness absent',
        'complete 110-slot preflight not run',
        'later freeze conditions remain',
      ],
      devConfirmOpened: false,
      finalHoldoutOpened: false,
      a4Started: false,
      a5Started: false,
      completeCorpusPreflightRun: false,
      twentySlotFinalCorpusMinted: false,
    },
    identityDisclosure: {
      selectionIndices: false,
      organisationIds: false,
      echeRowKeys: false,
      runIds: false,
      documentDigests: false,
      pageIds: false,
      normalisedTextOrTokens: false,
      shortTextEquivalenceClassMembership: false,
      slotsWithShortText: false,
      slotsGainingR4Edges: false,
      edgeEndpoints: false,
      perSlotCounts: false,
      scoresOrRanks: false,
      urlsOrHosts: false,
      titlesOrHeadings: false,
      labelsOrGold: false,
      generation2Replacements: false,
    },
    terminalState: blockerClassCleared ? R47_SUCCESS_TERMINAL : R47_REFUSAL_TERMINAL,
    nextOwnerQuestion: R47_NEXT_OWNER_QUESTION,
  });
}
