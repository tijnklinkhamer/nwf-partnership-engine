/**
 * PHASE 2B-2D — A3 R20: THE PUBLIC, DERIVED BINDING CENSUS.
 *
 * IT IS DERIVED, AND IT AUTHORISES NOTHING
 *
 *   `thisFileAuthorises: []`. This record is not acquisition authority, not
 *   corpus-sampling authority, not SET_P or SET_R authority, not holdout
 *   authority and not an A5 freeze. It is a count of what one in-process
 *   binding proved, published so that the binding is reviewable without
 *   anyone needing access to the rows.
 *
 * AGGREGATES ONLY, AND NO NEW DIGEST
 *
 *   Every field is a count, a version label, a commit or a boolean. There is
 *   no run UUID, no `runRefSha256`, no row id, no URL, no host, no document
 *   digest, no title, no heading, no extracted text and no candidate signal -
 *   and no selection index or reserve position, because those would
 *   reconstruct which organisations DEV_TRAIN holds.
 *
 *   There is deliberately no `databaseSnapshotHash`, `evidenceBatchHash`,
 *   `documentCorpusHash` or `r20AuthorityHash` either. A digest over the
 *   evidence would be a reusable token: something a later slice could accept
 *   INSTEAD of re-minting against real governance, which is exactly the
 *   in-process boundary R19 and R20 exist to keep.
 *
 * WHY A DISTINCT-DOCUMENT COUNT IS SAFE AND SET_P IS NOT
 *
 *   Reporting HOW MANY distinct response digests a split holds is an
 *   integrity measure. Ranking them, salting them, capping them at eight or
 *   selecting membership would be SET_P - which R20 has not created and must
 *   not appear to have created.
 */
import { refuse } from './refusal.js';
import { isA3DevTrainDurableEvidenceBatch } from './devTrain.js';
import type { ReadOnlyTransactionProof } from './database.js';
import type { A3DevTrainDurableEvidenceBatchV1 } from './types.js';
import { R20_EVIDENCE_SPLIT_V1, R20_REQUIRED_DATABASE_ROLE } from './types.js';

export const R20_PUBLIC_CENSUS_RECORD_KIND =
  'PHASE_2B_2D_A3_R20_DEV_TRAIN_DURABLE_EVIDENCE_BINDING_CENSUS_V1';

export interface R20CensusProvenance {
  /** The exact R19 branch tip this adapter was built from. */
  readonly r19Tip: string;
  /** The R20 implementation commit the real binding executed at. */
  readonly implementationCommit: string;
}

export interface R20PublicBindingCensus {
  readonly record: typeof R20_PUBLIC_CENSUS_RECORD_KIND;
  readonly recordKind: 'PUBLIC_AGGREGATE_ONLY_EVIDENCE_BINDING_CENSUS';
  readonly generationId: string;
  readonly split: typeof R20_EVIDENCE_SPLIT_V1;
  readonly registryVersion: string;
  readonly governanceSnapshotCommit: string;
  readonly r19Tip: string;
  readonly implementationCommit: string;
  readonly thisFileAuthorises: readonly [];
  readonly binding: {
    readonly readyAuthoritiesForSplit: number;
    readonly matchedRuns: number;
    readonly validCompletions: number;
    readonly fetchObservationRows: number;
    readonly pageEvidenceSourceRows: number;
    readonly distinctResponseSha256Documents: number;
    readonly candidateRows: number;
    readonly duplicateDocumentSourceRows: number;
    readonly multipleExtractionVersionDocuments: number;
  };
  readonly versionBreakdown: {
    readonly acquisitionPolicyVersionCounts: Readonly<Record<string, number>>;
    readonly pageExtractionRuleVersionCounts: Readonly<Record<string, number>>;
    readonly candidateSignalRuleVersionCounts: Readonly<Record<string, number>>;
    readonly candidateTrackCounts: Readonly<Record<string, number>>;
  };
  readonly integrity: {
    readonly identityContaminationCount: 0;
    readonly fetchPolicyMismatchCount: 0;
    readonly relationalOrphanCount: 0;
    readonly sameDocumentSameExtractionConflictCount: 0;
    readonly candidateTrackPairViolationCount: 0;
    readonly everyPageMapsToAFetchInItsRun: true;
    readonly everyCandidateMapsToAPageInItsRun: true;
    readonly everyRunCompletedCleanly: true;
    readonly everyObservationSharesTheAuthorityIdentity: true;
  };
  readonly databaseAccess: {
    readonly role: typeof R20_REQUIRED_DATABASE_ROLE;
    readonly databaseName: string;
    readonly transactionReadOnly: true;
    readonly transactionIsolationLevel: 'repeatable read';
    readonly writes: 0;
    readonly institutionNetworkRequests: 0;
    readonly sealedRootReads: 0;
    readonly nonDevTrainEvidenceQueries: 0;
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
    readonly urlsOrHosts: false;
    readonly documentDigests: false;
    readonly titlesHeadingsOrText: false;
    readonly candidateSignals: false;
    readonly sealedFilenames: false;
    readonly gatedSplitData: false;
  };
}

function merge(
  into: Record<string, number>,
  from: Readonly<Record<string, number>>,
): Record<string, number> {
  for (const [key, value] of Object.entries(from)) into[key] = (into[key] ?? 0) + value;
  return into;
}

/**
 * Derives the census from a MINTED batch. A batch that was not minted refuses:
 * a census over hand-assembled items would report numbers nothing proved.
 */
export function deriveR20PublicBindingCensus(
  batch: A3DevTrainDurableEvidenceBatchV1,
  transactionProof: ReadOnlyTransactionProof,
  provenance: R20CensusProvenance,
): R20PublicBindingCensus {
  if (!isA3DevTrainDurableEvidenceBatch(batch)) {
    refuse('NOT_A_MINTED_DURABLE_EVIDENCE', 'the census input was not a minted DEV_TRAIN batch');
  }

  const acquisitionPolicyVersionCounts: Record<string, number> = {};
  const pageExtractionRuleVersionCounts: Record<string, number> = {};
  const candidateSignalRuleVersionCounts: Record<string, number> = {};
  const candidateTrackCounts: Record<string, number> = {};

  let fetchObservationRows = 0;
  let pageEvidenceSourceRows = 0;
  let candidateRows = 0;
  let distinctResponseSha256Documents = 0;
  let duplicateDocumentSourceRows = 0;
  let multipleExtractionVersionDocuments = 0;

  for (const item of batch.items) {
    const { integrity, run } = item.evidence;
    acquisitionPolicyVersionCounts[run.fetchPolicyVersion] =
      (acquisitionPolicyVersionCounts[run.fetchPolicyVersion] ?? 0) + 1;
    merge(pageExtractionRuleVersionCounts, integrity.extractionRuleVersionCounts);
    merge(candidateSignalRuleVersionCounts, integrity.signalRuleVersionCounts);
    merge(candidateTrackCounts, integrity.candidateTrackCounts);
    fetchObservationRows += integrity.fetchObservationCount;
    pageEvidenceSourceRows += integrity.pageEvidenceSourceRowCount;
    candidateRows += integrity.candidateRowCount;
    distinctResponseSha256Documents += integrity.distinctResponseSha256Count;
    duplicateDocumentSourceRows += integrity.duplicateDocumentSourceRowCount;
    multipleExtractionVersionDocuments += integrity.multipleExtractionVersionDocumentCount;
  }

  const resolution = batch.governanceSnapshot.resolution;

  return Object.freeze({
    record: R20_PUBLIC_CENSUS_RECORD_KIND,
    recordKind: 'PUBLIC_AGGREGATE_ONLY_EVIDENCE_BINDING_CENSUS' as const,
    generationId: resolution.summary.generationId,
    split: R20_EVIDENCE_SPLIT_V1,
    registryVersion: resolution.registryVersion,
    governanceSnapshotCommit: resolution.governanceBaseCommit,
    r19Tip: provenance.r19Tip,
    implementationCommit: provenance.implementationCommit,
    thisFileAuthorises: Object.freeze([]) as readonly [],
    binding: Object.freeze({
      readyAuthoritiesForSplit: batch.items.length,
      matchedRuns: batch.items.length,
      validCompletions: batch.items.length,
      fetchObservationRows,
      pageEvidenceSourceRows,
      distinctResponseSha256Documents,
      candidateRows,
      duplicateDocumentSourceRows,
      multipleExtractionVersionDocuments,
    }),
    versionBreakdown: Object.freeze({
      acquisitionPolicyVersionCounts: Object.freeze(acquisitionPolicyVersionCounts),
      pageExtractionRuleVersionCounts: Object.freeze(pageExtractionRuleVersionCounts),
      candidateSignalRuleVersionCounts: Object.freeze(candidateSignalRuleVersionCounts),
      candidateTrackCounts: Object.freeze(candidateTrackCounts),
    }),
    integrity: Object.freeze({
      identityContaminationCount: 0 as const,
      fetchPolicyMismatchCount: 0 as const,
      relationalOrphanCount: 0 as const,
      sameDocumentSameExtractionConflictCount: 0 as const,
      candidateTrackPairViolationCount: 0 as const,
      everyPageMapsToAFetchInItsRun: true as const,
      everyCandidateMapsToAPageInItsRun: true as const,
      everyRunCompletedCleanly: true as const,
      everyObservationSharesTheAuthorityIdentity: true as const,
    }),
    databaseAccess: Object.freeze({
      role: R20_REQUIRED_DATABASE_ROLE,
      databaseName: transactionProof.databaseName,
      transactionReadOnly: true as const,
      transactionIsolationLevel: 'repeatable read' as const,
      writes: 0 as const,
      institutionNetworkRequests: 0 as const,
      sealedRootReads: 0 as const,
      nonDevTrainEvidenceQueries: 0 as const,
    }),
    whatThisIsNot: Object.freeze([
      'NOT_A2_ACQUISITION_AUTHORITY',
      'NOT_CORPUS_SAMPLING_AUTHORITY',
      'NOT_SET_P_AUTHORITY',
      'NOT_SET_R_AUTHORITY',
      'NOT_AN_SD7_CORPUS_GRAPH',
      'NOT_HOLDOUT_SCORING_AUTHORITY',
      'NOT_AN_A5_CORPUS_FREEZE',
      'NOT_A_DOCUMENT_ASSEMBLY_DECISION',
    ]),
    identityDisclosure: Object.freeze({
      selectionIndices: false as const,
      reservePositions: false as const,
      organisationIds: false as const,
      echeRowKeys: false as const,
      runIdentifiers: false as const,
      runReferenceDigests: false as const,
      rowIdentifiers: false as const,
      urlsOrHosts: false as const,
      documentDigests: false as const,
      titlesHeadingsOrText: false as const,
      candidateSignals: false as const,
      sealedFilenames: false as const,
      gatedSplitData: false as const,
    }),
  });
}
