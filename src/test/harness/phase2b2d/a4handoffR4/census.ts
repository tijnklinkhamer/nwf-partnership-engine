/**
 * PHASE 2B-2D — A3 R50: THE PUBLIC AGGREGATE-ONLY HANDOFF CENSUS.
 *
 * Counts and hash values only: no goldId, ECHE row key, organisation id,
 * selection index, document digest, page id, URL, host, title, heading, text,
 * P / R membership, per-organisation count, score, rank or candidate datum.
 * Derived only from a genuine R50 handoff; `thisFileAuthorises: []`.
 */
import type { R47LayerAccessObservation } from '../a3replayR4/census.js';
import { GOLD_ID_DOES_NOT_MEAN_GOLD_YET } from './identity.js';
import { isGenuineR50Handoff, type GenuineR50Handoff } from './materialise.js';
import { refuseR50 } from './refusal.js';
import {
  NOT_YET_MEASURABLE_PRE_LABEL,
  R47_TERMINAL_COMMIT,
  R48_TERMINAL_COMMIT,
  R48_TERMINAL_STATE,
  R49_TERMINAL_COMMIT,
  R49_TERMINAL_STATE,
  R50_ARTIFACT_PATHS,
  R50_CENSUS_RECORD,
  R50_CENSUS_RECORD_KIND,
  R50_NEXT_OWNER_QUESTION,
  R50_PACKAGE_HASH_ALGORITHM,
  R50_PACKAGE_HASH_INPUT_CONTRACT,
  R50_PACKAGE_HASH_NAME,
  R50_PACKAGE_SCHEMA,
  R50_SPLIT,
  R50_SUCCESS_TERMINAL,
  R50_TASK,
  R50_TEMPLATE_SCHEMA,
} from './types.js';

export interface R50AccessObservation {
  readonly role: string;
  readonly database: string;
  /** The canonical R47 reproduction's own per-layer observation. */
  readonly r47ReproductionLayers: readonly R47LayerAccessObservation[];
  /** R39's own landed observation, independently reproduced. */
  readonly r39LandedObservation: {
    readonly poolConnections: number;
    readonly snapshotTransactions: number;
    readonly sqlStatements: number;
    readonly evidenceLoads: number;
  };
  readonly poolsOpenAfterReproduction: number;
  readonly sqlStatementsAfterLastPoolClosed: number;
  readonly writes: number;
  readonly networkRequests: number;
  readonly providerCalls: number;
  readonly devConfirmEvidenceReads: number;
  readonly finalHoldoutEvidenceReads: number;
  readonly sealedRootReads: number;
}

export function deriveR50PublicHandoffCensus(input: {
  readonly handoff: GenuineR50Handoff;
  readonly access: R50AccessObservation;
  readonly implementationCommit: string;
}) {
  const { handoff, access } = input;
  if (!isGenuineR50Handoff(handoff)) {
    refuseR50('R50_REPRODUCTION_NOT_PROVED', 'the census needs a genuine R50 handoff');
  }
  const { built, rubric, proof } = handoff;
  const c = built.counts;
  return {
    record: R50_CENSUS_RECORD,
    recordKind: R50_CENSUS_RECORD_KIND,
    task: R50_TASK,
    consumedOwnerMarker: rubric.consumedOwnerMarker,
    split: R50_SPLIT,
    r49Terminal: R49_TERMINAL_COMMIT,
    implementationCommit: input.implementationCommit,
    thisFileAuthorises: [],
    rubricBinding: {
      path: rubric.rubricPath,
      sha256: rubric.rubricSha256,
      bytes: rubric.rubricBytes,
      rubricVersion: rubric.rubricVersion,
      status: rubric.rubricStatus,
      approvalPath: rubric.approvalPath,
      approvalSha256RecomputedLocally: rubric.approvalSha256,
      approvalBytes: rubric.approvalBytes,
      approvalTerminalState: R49_TERMINAL_STATE,
      rubricReinterpreted: false,
      rubricCopiedIntoPackage: false,
    },
    r48BlockerResolution: {
      r48Terminal: R48_TERMINAL_COMMIT,
      r48TerminalState: R48_TERMINAL_STATE,
      r48StoppedCorrectlyBecauseRubricSemanticsWereAbsent: true,
      r49SuppliedAndFrozeThem: true,
      r48RecordEdited: false,
    },
    r47Reproduction: {
      r47Terminal: R47_TERMINAL_COMMIT,
      censusPath: proof.r47CensusPath,
      censusSha256: proof.r47CensusSha256,
      censusBytes: proof.r47CensusBytes,
      freshlyReproducedInOneProcess: true,
      comparedTopLevelFieldCount: proof.comparedTopLevelFieldCount,
      differingSemanticPathCount: proof.differingSemanticPathCount,
      excludedFields: proof.excludedFields,
      r47CodeModified: false,
      sampleObjectsConstructedFromCensus: false,
    },
    selection: {
      devTrainOrganisations: proof.slots,
      documents: proof.documents,
      setPExactCaps: proof.setPExactCaps,
      setPBlockedCaps: proof.setPBlockedCaps,
      setRExactCaps: proof.setRExactCaps,
      setRBlockedCaps: proof.setRBlockedCaps,
      r4UnresolvedDocuments: proof.unresolvedDocuments,
      a2StatusesMatched: proof.a2StatusesMatched,
      a2StatusMismatches: proof.a2StatusMismatches,
      setPSelected: c.setPSelected,
      setRSelected: c.setRSelected,
      selectedAuthority:
        'preparation.setP/setR.documentCap.documents of the genuine R47 sample batch',
      reRanked: false,
    },
    handoff: {
      unionItems: c.unionItems,
      overlapItems: c.overlapItems,
      setPOnlyItems: c.setPOnlyItems,
      setROnlyItems: c.setROnlyItems,
      unionPlusOverlapEqualsSelected:
        c.unionItems + c.overlapItems === c.setPSelected + c.setRSelected,
      uniqueGoldIds: c.uniqueGoldIds,
      goldIdCollisions: 0,
      goldIdPrimitive: 'deriveGoldId(echeRowKey, responseSha256), unchanged',
      goldIdOrganisationInput: 'current Governance V5 READY occupant source.echeRowKey',
      goldIdDocumentInput: 'canonical A3 document.documentSha256 (exact fetch-response SHA-256)',
      goldIdDoesNotMeanGoldYet: GOLD_ID_DOES_NOT_MEAN_GOLD_YET,
      multiSourceSelectedUnionItems: c.multiSourceItems,
      sourcePresentations: c.sourcePresentations,
      allSourcePresentationsRetained: true,
      pageRepresentativeInvented: false,
      mainTextEqualityJustified: true,
      mainTextReprovedAgainstReplayTextCapability: handoff.textCapabilityChecks,
      reviewPackageRecords: c.reviewPackageRecords,
      responseTemplateRecords: c.responseTemplateRecords,
      htmlPacketWritten: false,
    },
    artifacts: {
      internalIndex: { path: R50_ARTIFACT_PATHS.index, reviewerVisible: false },
      reviewPackage: {
        path: R50_ARTIFACT_PATHS.reviewPackage,
        schema: R50_PACKAGE_SCHEMA,
        reviewerVisible: true,
      },
      responseTemplate: {
        path: R50_ARTIFACT_PATHS.responseTemplate,
        schema: R50_TEMPLATE_SCHEMA,
        humanResponseValuesNull: true,
      },
      order: 'goldId ASC',
      writtenAtomically: true,
    },
    packageHash: {
      name: R50_PACKAGE_HASH_NAME,
      algorithm: R50_PACKAGE_HASH_ALGORITHM,
      canonicalInputContract: R50_PACKAGE_HASH_INPUT_CONTRACT,
      value: built.packageHash,
      recordCount: built.reviewRecords.length,
      isA5SplitContentHash: false,
      isGoldManifestHash: false,
      isCorpusFreezeHash: false,
      immutableForA4: true,
    },
    blinding: {
      setPOrSetRMembershipVisible: false,
      scoresSignalsOrRanksVisible: false,
      modelOutputVisible: false,
      generationReserveOrA2Visible: false,
      identityKeysVisible: false,
      structuredKeysInspected: true,
      pageTextCensored: false,
    },
    access: {
      role: access.role,
      database: access.database,
      r47ReproductionLayers: access.r47ReproductionLayers,
      r39LandedObservation: access.r39LandedObservation,
      totalCombinedSqlCountClaimed: false,
      poolsOpenAfterReproduction: access.poolsOpenAfterReproduction,
      sqlStatementsAfterLastPoolClosed: access.sqlStatementsAfterLastPoolClosed,
      newSqlLayer: false,
      writes: access.writes,
      networkRequests: access.networkRequests,
      providerCalls: access.providerCalls,
      devConfirmReads: access.devConfirmEvidenceReads,
      finalHoldoutReads: access.finalHoldoutEvidenceReads,
      sealedRootReads: access.sealedRootReads,
      historicalLabelsOrGoldRead: false,
    },
    labelBoundary: {
      labelsCreated: 0,
      goldRecordsCreated: 0,
      modelLabels: 0,
      adjudications: 0,
      humanLabellingExecuted: false,
      humanLabellingAuthorised: false,
      a4HandoffPrepared: true,
      a5Started: false,
      devConfirmOpened: false,
      finalHoldoutOpened: false,
      devTrainRealisedSetREnrichment: NOT_YET_MEASURABLE_PRE_LABEL,
    },
    identityDisclosure: {
      goldIds: false,
      echeRowKeys: false,
      organisationIds: false,
      selectionIndices: false,
      documentDigests: false,
      pageEvidenceIds: false,
      urlsOrHosts: false,
      titlesOrHeadings: false,
      text: false,
      sampleMembership: false,
      perOrganisationCounts: false,
      scoresOrRanks: false,
      candidateData: false,
    },
    terminalState: R50_SUCCESS_TERMINAL,
    nextOwnerQuestion: R50_NEXT_OWNER_QUESTION,
  };
}
