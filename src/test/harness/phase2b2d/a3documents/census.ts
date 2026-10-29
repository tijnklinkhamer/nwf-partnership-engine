/**
 * PHASE 2B-2D — A3 R21: THE PUBLIC, DERIVED DOCUMENT-SOURCE CENSUS.
 *
 * IT IS DERIVED, AND IT AUTHORISES NOTHING
 *
 *   `thisFileAuthorises: []`. Not acquisition authority, not database-evidence
 *   authority, not SET_P, not SET_R, not an SD7 graph, not short-text
 *   authority, not a final corpus and not a freeze. It counts what one
 *   in-process R20 -> R21 chain proved, so the assembly is reviewable without
 *   anyone needing the rows.
 *
 * AGGREGATES ONLY, AND NO NEW DIGEST
 *
 *   Every field is a count, a version label, a commit or a boolean. No
 *   selection index, organisation, run, row id, document digest, URL, host,
 *   root, title, heading, text, score or signal. No score distribution. And
 *   no `documentSourceBatchHash`, `documentCorpusHash`,
 *   `assemblyAuthorityHash` or `textRepresentationHash`: a digest would be a
 *   reusable token a later slice could accept INSTEAD of re-minting.
 *
 * TWO DIFFERENT DUPLICATE MEASURES
 *
 *   `exactDuplicateRowsRemoved` is `rowCount - distinctDocumentCount`. R20's
 *   `duplicateDocumentSourceRows` counts EVERY row participating in a shared
 *   digest. They answer different questions and are never conflated.
 */
import { refuse } from './refusal.js';
import {
  durableEvidenceForDocumentSourceAssembly,
  isA3DevTrainDocumentSourceBatch,
} from './devTrain.js';
import {
  R21_SUPPORTED_EXTRACTION_RULE_VERSION_V1,
  type A3DevTrainDocumentSourceBatchV1,
} from './types.js';
import { R20_EVIDENCE_SPLIT_V1 } from '../a3evidence/types.js';

export const R21_PUBLIC_CENSUS_RECORD_KIND =
  'PHASE_2B_2D_A3_R21_DEV_TRAIN_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1';

export interface R21CensusProvenance {
  readonly r20Tip: string;
  readonly implementationCommit: string;
}

export interface R21PublicDocumentSourceCensus {
  readonly record: typeof R21_PUBLIC_CENSUS_RECORD_KIND;
  readonly recordKind: 'PUBLIC_AGGREGATE_ONLY_DOCUMENT_SOURCE_ASSEMBLY_CENSUS';
  readonly generationId: string;
  readonly split: typeof R20_EVIDENCE_SPLIT_V1;
  readonly registryVersion: string;
  readonly governanceSnapshotCommit: string;
  readonly r20Tip: string;
  readonly implementationCommit: string;
  readonly thisFileAuthorises: readonly [];
  readonly assembly: {
    readonly r20DurableEvidenceItemCount: number;
    readonly mintedSlotAssemblyCount: number;
    readonly pageEvidenceSourceRowCount: number;
    readonly slotLocalDistinctDocumentCount: number;
    readonly exactDuplicateGroupCount: number;
    readonly exactDuplicateRowsRemoved: number;
    readonly documentsWithMultipleSourceRows: number;
  };
  readonly extractionSupport: {
    readonly supportedExtractionRuleVersion: typeof R21_SUPPORTED_EXTRACTION_RULE_VERSION_V1;
    readonly supportedExtractionSourceRowCount: number;
    readonly unsupportedExtractionSourceRowCount: number;
    readonly multiExtractionVersionDocumentCount: number;
    readonly textDivergenceGroupCount: number;
  };
  readonly scorePreparation: {
    readonly r10ScorePreparationCount: number;
    readonly r10SourceRowCoverageCount: number;
    readonly r10CandidateObservationCoverageCount: number;
    readonly candidateObservationsAssembled: number;
  };
  readonly semantics: {
    readonly exactGroupingPerSlotOnly: true;
    readonly crossOrganisationDocumentsCollapsed: false;
    readonly globalDocumentDedupe: false;
    readonly pageEvidenceRepresentativeSelected: false;
    readonly textRepresentativeSelected: false;
    readonly textValueJustifiedByEquality: true;
    readonly textTransformationsApplied: 0;
    readonly everySourceRowPreservedAsProvenance: true;
    readonly canonicalExactDuplicatePassUsed: true;
    readonly canonicalR10ScorePreparationUsed: true;
    readonly nearDuplicateGraphMeasured: false;
    readonly documentsRanked: false;
    readonly setPMembershipSelected: false;
    readonly setRMembershipSelected: false;
    readonly shortTextDecided: false;
  };
  readonly access: {
    readonly r21SqlStatements: 0;
    readonly databaseAccessOnlyThroughCanonicalR20: true;
    readonly databaseWrites: 0;
    readonly institutionNetworkRequests: 0;
    readonly sealedRootReads: 0;
    readonly nonDevTrainEvidenceReads: 0;
  };
  readonly whatThisIsNot: readonly string[];
  readonly identityDisclosure: {
    readonly selectionIndices: false;
    readonly reservePositions: false;
    readonly organisationIds: false;
    readonly echeRowKeys: false;
    readonly runIdentifiers: false;
    readonly runReferenceDigests: false;
    readonly rowIdentifiers: false;
    readonly documentDigests: false;
    readonly urlsOrHosts: false;
    readonly rootIdentifiers: false;
    readonly titlesHeadingsOrText: false;
    readonly individualScores: false;
    readonly candidateSignals: false;
    readonly sealedFilenames: false;
    readonly gatedSplitData: false;
  };
}

/**
 * Derives the census from a MINTED document-source batch. Anything else
 * refuses: a census over hand-assembled slots would report numbers nothing
 * proved.
 */
export function deriveR21PublicDocumentSourceCensus(
  batch: A3DevTrainDocumentSourceBatchV1,
  provenance: R21CensusProvenance,
): R21PublicDocumentSourceCensus {
  if (!isA3DevTrainDocumentSourceBatch(batch)) {
    refuse(
      'R21_BATCH_COMPOSITION_INVALID',
      'the census input was not a minted DEV_TRAIN document-source batch',
    );
  }

  let pageEvidenceSourceRowCount = 0;
  let slotLocalDistinctDocumentCount = 0;
  let exactDuplicateGroupCount = 0;
  let exactDuplicateRowsRemoved = 0;
  let textDivergenceGroupCount = 0;
  let documentsWithMultipleSourceRows = 0;
  let supportedExtractionSourceRowCount = 0;
  let unsupportedExtractionSourceRowCount = 0;
  let multiExtractionVersionDocumentCount = 0;
  let r10ScorePreparationCount = 0;
  let r10SourceRowCoverageCount = 0;
  let r10CandidateObservationCoverageCount = 0;
  let candidateObservationsAssembled = 0;

  for (const slot of batch.items) {
    pageEvidenceSourceRowCount += slot.exactDuplicate.rowCount;
    slotLocalDistinctDocumentCount += slot.exactDuplicate.distinctDocumentCount;
    exactDuplicateGroupCount += slot.exactDuplicate.duplicateGroupCount;
    exactDuplicateRowsRemoved += slot.exactDuplicate.duplicateRowsRemoved;
    textDivergenceGroupCount += slot.exactDuplicate.divergentGroupCount;
    candidateObservationsAssembled += slot.candidateObservationCount;
    // Extraction support is re-derived from the R20 SOURCE ROWS the slot was
    // assembled from, independently of the assembler's own refusal gate.
    const durable = durableEvidenceForDocumentSourceAssembly(slot);
    if (durable === undefined) {
      refuse('R21_BATCH_COMPOSITION_INVALID', 'a slot assembly does not trace to an R20 item');
    }
    const versionsByDocument = new Map<string, Set<string>>();
    for (const row of durable.evidence.pageEvidence) {
      if (row.page.ruleVersion === R21_SUPPORTED_EXTRACTION_RULE_VERSION_V1) {
        supportedExtractionSourceRowCount += 1;
      } else {
        unsupportedExtractionSourceRowCount += 1;
      }
      const versions = versionsByDocument.get(row.responseSha256) ?? new Set<string>();
      versions.add(row.page.ruleVersion);
      versionsByDocument.set(row.responseSha256, versions);
    }
    for (const versions of versionsByDocument.values()) {
      if (versions.size > 1) multiExtractionVersionDocumentCount += 1;
    }
    for (const entry of slot.documents) {
      if (entry.sourceRowCount > 1) documentsWithMultipleSourceRows += 1;
      r10ScorePreparationCount += 1;
      r10SourceRowCoverageCount += entry.scorePreparation.sourceRowScores.length;
      for (const row of entry.scorePreparation.sourceRowScores) {
        r10CandidateObservationCoverageCount += row.trackScores.length;
      }
    }
  }

  const resolution = batch.governanceSnapshot.resolution;

  return Object.freeze({
    record: R21_PUBLIC_CENSUS_RECORD_KIND,
    recordKind: 'PUBLIC_AGGREGATE_ONLY_DOCUMENT_SOURCE_ASSEMBLY_CENSUS' as const,
    generationId: resolution.summary.generationId,
    split: R20_EVIDENCE_SPLIT_V1,
    registryVersion: resolution.registryVersion,
    governanceSnapshotCommit: resolution.governanceBaseCommit,
    r20Tip: provenance.r20Tip,
    implementationCommit: provenance.implementationCommit,
    thisFileAuthorises: Object.freeze([]) as readonly [],
    assembly: Object.freeze({
      r20DurableEvidenceItemCount: batch.items.length,
      mintedSlotAssemblyCount: batch.items.length,
      pageEvidenceSourceRowCount,
      slotLocalDistinctDocumentCount,
      exactDuplicateGroupCount,
      exactDuplicateRowsRemoved,
      documentsWithMultipleSourceRows,
    }),
    extractionSupport: Object.freeze({
      supportedExtractionRuleVersion: R21_SUPPORTED_EXTRACTION_RULE_VERSION_V1,
      supportedExtractionSourceRowCount,
      unsupportedExtractionSourceRowCount,
      multiExtractionVersionDocumentCount,
      textDivergenceGroupCount,
    }),
    scorePreparation: Object.freeze({
      r10ScorePreparationCount,
      r10SourceRowCoverageCount,
      r10CandidateObservationCoverageCount,
      candidateObservationsAssembled,
    }),
    semantics: Object.freeze({
      exactGroupingPerSlotOnly: true as const,
      crossOrganisationDocumentsCollapsed: false as const,
      globalDocumentDedupe: false as const,
      pageEvidenceRepresentativeSelected: false as const,
      textRepresentativeSelected: false as const,
      textValueJustifiedByEquality: true as const,
      textTransformationsApplied: 0 as const,
      everySourceRowPreservedAsProvenance: true as const,
      canonicalExactDuplicatePassUsed: true as const,
      canonicalR10ScorePreparationUsed: true as const,
      nearDuplicateGraphMeasured: false as const,
      documentsRanked: false as const,
      setPMembershipSelected: false as const,
      setRMembershipSelected: false as const,
      shortTextDecided: false as const,
    }),
    access: Object.freeze({
      r21SqlStatements: 0 as const,
      databaseAccessOnlyThroughCanonicalR20: true as const,
      databaseWrites: 0 as const,
      institutionNetworkRequests: 0 as const,
      sealedRootReads: 0 as const,
      nonDevTrainEvidenceReads: 0 as const,
    }),
    whatThisIsNot: Object.freeze([
      'NOT_A2_ACQUISITION_AUTHORITY',
      'NOT_DATABASE_EVIDENCE_AUTHORITY',
      'NOT_SET_P',
      'NOT_SET_R_MEMBERSHIP',
      'NOT_AN_SD7_NEAR_DUPLICATE_GRAPH',
      'NOT_AN_SD7_SURVIVOR_DECISION',
      'NOT_A_RANK',
      'NOT_A_CAP',
      'NOT_SHORT_TEXT_AUTHORITY',
      'NOT_A_FINAL_CORPUS',
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
      urlsOrHosts: false as const,
      rootIdentifiers: false as const,
      titlesHeadingsOrText: false as const,
      individualScores: false as const,
      candidateSignals: false as const,
      sealedFilenames: false as const,
      gatedSplitData: false as const,
    }),
  });
}
