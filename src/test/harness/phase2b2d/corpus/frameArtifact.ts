/**
 * THE FRAME ARTIFACT, AND THE TWO HASHES THAT ARE NOT THE SAME THING.
 *
 *   frameHash          SHA-256 over the canonical serialization of the frame
 *                      PAYLOAD, with the `frameHash` field itself excluded.
 *                      It identifies the frame's CONTENT, and is stable under
 *                      any reformatting of the file that preserves that
 *                      content.
 *
 *   artifactFileSha256 SHA-256 over the final committed FILE BYTES, frameHash
 *                      field included. It identifies the artifact on disk.
 *
 *   They are never conflated and never reported as one value. A reformat
 *   changes the second and not the first; an edit to a single entry changes
 *   both.
 *
 * THE CANONICAL JSON CONVENTION
 *
 *   `canonicalStringify` from `src/orgunits/classify/canonical.ts` - this
 *   repository's existing canonicalizer, already the anchor for the classifier
 *   assembly hash and the gold corpus freeze hashes. Object keys sorted
 *   ascending by code unit, arrays left in their given (already-canonical)
 *   order, no whitespace, `JSON.stringify` string escaping, `undefined`
 *   refused rather than silently dropped. A second canonicalizer written here
 *   would be a second definition of "identical corpus", so there is not one.
 *
 * No network, no database, no clock. Every function here is pure EXCEPT
 * `renderFrameArtifact`, which resolves this repository's Prettier config from
 * disk so the emitted bytes are the ones `prettier --check` will accept; see
 * its own note.
 */
import { createHash } from 'node:crypto';
import { format, resolveConfig } from 'prettier';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import {
  FRAME_ARTIFACT_PATH,
  CORPUS_PLAN_APPROVAL_PATH,
  CORPUS_PLAN_APPROVAL_SHA256,
  CORPUS_PLAN_BYTES,
  CORPUS_PLAN_COMMIT,
  CORPUS_PLAN_PATH,
  CORPUS_PLAN_SHA256,
  METHODOLOGY_APPROVAL_COMMIT,
  METHODOLOGY_APPROVAL_PATH,
  METHODOLOGY_APPROVAL_SHA256,
  METHODOLOGY_R3_BYTES,
  METHODOLOGY_R3_PATH,
  METHODOLOGY_R3_SHA256,
  type FrameCounts,
  type FrameEntry,
} from './frameContract.js';
import { CLAIM_SNAPSHOT_SEMANTICS, PROMOTION_SNAPSHOT_SEMANTICS } from './claimSnapshot.js';

export interface FrameSourceIdentityInput {
  readonly echeArtifactSha256: string;
  readonly echeArtifactBytes: number;
  readonly sourceManifestSha256: string;
  readonly sourceManifestBytes: number;
  /** Every ingest run that produced the examined population, sorted by start. */
  readonly ingestRunIds: readonly string[];
  readonly claimSnapshotSha256: string;
  readonly promotionSnapshotSha256: string;
  readonly claimRuleVersion: string;
  readonly claimSourceKind: string;
  readonly databaseSchemaVersion: string;
}

export interface FrameProvenanceInput {
  readonly generationId: string;
  readonly examinedPopulationDefinition: string;
  readonly historicalDevelopmentSourcePath: string;
  readonly historicalDevelopmentItemCount: number;
  readonly historicalDevelopmentOrganisationIds: readonly string[];
  readonly priorGenerationIds: readonly string[];
  readonly priorGenerationArtifacts: readonly string[];
}

export interface BuildFrameArtifactInput {
  readonly provenance: FrameProvenanceInput;
  readonly sourceIdentity: FrameSourceIdentityInput;
  readonly counts: FrameCounts;
  readonly entries: readonly FrameEntry[];
  readonly rootAuthorityDistribution: Readonly<Record<string, number>>;
}

/** The artifact payload, with `frameHash` deliberately absent. */
export type FramePayload = Omit<FrameArtifact, 'frameHash'>;

export interface FrameArtifact {
  readonly record: string;
  readonly recordKind: string;
  readonly generationId: string;
  readonly sd1: Readonly<Record<string, unknown>>;
  readonly boundMethodology: Readonly<Record<string, unknown>>;
  readonly boundCorpusPlan: Readonly<Record<string, unknown>>;
  readonly sourceIdentity: Readonly<Record<string, unknown>>;
  readonly counts: FrameCounts;
  readonly rootAuthorityDistribution: Readonly<Record<string, number>>;
  readonly exclusions: Readonly<Record<string, unknown>>;
  readonly hashing: Readonly<Record<string, unknown>>;
  readonly entries: readonly FrameEntry[];
  readonly frameHash: string;
}

/** Assembles the payload. Deterministic: same inputs, same bytes. */
export function buildFramePayload(input: BuildFrameArtifactInput): FramePayload {
  return {
    record: 'PHASE_2B_2D_METHODOLOGY_V2_FRAME',
    recordKind: 'FRAME_V2_GEN1',
    generationId: input.provenance.generationId,

    sd1: {
      eligibility:
        'at least one STRUCTURALLY_VALID website_claims row OR at least one live un-revoked ' +
        'orgunit_root_promotions authority; AND contributes no item to the historical 49-item ' +
        'DEVELOPMENT set; AND appears in no earlier Methodology V2 generation corpus',
      clauseA: 'hasStructurallyValidClaim',
      clauseB: 'hasLiveRootPromotion',
      clauseC: 'NOT excludedHistoricalDevelopment',
      clauseD: 'NOT excludedPriorGeneration',
      frameIsCountryBlind: true,
      examinedPopulationDefinition: input.provenance.examinedPopulationDefinition,
      everyExaminedOrganisationAppearsIncludedOrNot: true,
      reasonPrecedence: [
        'EXCLUDED_HISTORICAL_DEVELOPMENT',
        'EXCLUDED_PRIOR_METHODOLOGY_GENERATION',
        'EXCLUDED_NO_VALID_ROOT_AUTHORITY',
        'INCLUDED_STRUCTURALLY_VALID_CLAIM',
        'INCLUDED_LIVE_ROOT_PROMOTION',
      ],
      reasonPrecedenceRationale:
        'Contamination outranks absence: a historically-used organisation is excluded whatever ' +
        'its current authority state, and that is a more durable statement than "it has no root ' +
        'today", which the next ingest could change. Because the primary reason is chosen by ' +
        'precedence, the three exclusion counts partition the excluded population exactly; the ' +
        'four per-entry booleans keep every co-applying clause visible on every row.',
      rootAuthorityIdIsNeverAnAcquisitionUrl:
        'Entries carry authority IDENTIFIERS only. A2 re-resolves every root from the database ' +
        'at execution time, as rule 18 requires. No URL, hostname or registrable domain appears ' +
        'anywhere in this artifact.',
      entriesOrderedBy: 'echeRowKey ascending, plain lexicographic comparison',
    },

    boundMethodology: {
      methodologyR3Path: METHODOLOGY_R3_PATH,
      methodologyR3Sha256: METHODOLOGY_R3_SHA256,
      methodologyR3Bytes: METHODOLOGY_R3_BYTES,
      methodologyApprovalPath: METHODOLOGY_APPROVAL_PATH,
      methodologyApprovalSha256: METHODOLOGY_APPROVAL_SHA256,
      methodologyApprovalCommit: METHODOLOGY_APPROVAL_COMMIT,
    },

    boundCorpusPlan: {
      corpusPlanPath: CORPUS_PLAN_PATH,
      corpusPlanSha256: CORPUS_PLAN_SHA256,
      corpusPlanBytes: CORPUS_PLAN_BYTES,
      corpusPlanCommit: CORPUS_PLAN_COMMIT,
      corpusPlanApprovalPath: CORPUS_PLAN_APPROVAL_PATH,
      corpusPlanApprovalSha256: CORPUS_PLAN_APPROVAL_SHA256,
      authorisation: 'AUTHORISE_PHASE_2B_2D_A1_FRAME_MATERIALISATION_V1',
    },

    sourceIdentity: {
      echeArtifactSha256: input.sourceIdentity.echeArtifactSha256,
      echeArtifactBytes: input.sourceIdentity.echeArtifactBytes,
      a0SourceManifestSha256: input.sourceIdentity.sourceManifestSha256,
      a0SourceManifestBytes: input.sourceIdentity.sourceManifestBytes,
      ingestRunIds: input.sourceIdentity.ingestRunIds,
      claimSnapshotSemantics: CLAIM_SNAPSHOT_SEMANTICS,
      claimSnapshotSha256: input.sourceIdentity.claimSnapshotSha256,
      claimSnapshotIsNotAWebsiteSourceSnapshotSha:
        'website_source_snapshots is legitimately EMPTY after A0 - the ECHE claim path stores ' +
        'its artifact identity on the claim row and creates no snapshot row. This value is a ' +
        'canonical hash DERIVED from the eligibility-bearing claim rows themselves. No ' +
        'website_source_snapshots row was invented and none is implied.',
      promotionSnapshotSemantics: PROMOTION_SNAPSHOT_SEMANTICS,
      promotionSnapshotSha256: input.sourceIdentity.promotionSnapshotSha256,
      promotionSnapshotCoversTheOtherSd1AuthoritySource:
        'SD1 clause B admits an organisation on a live root promotion, so promotion state is ' +
        'eligibility-bearing exactly as claim state is. For this generation it hashes the empty ' +
        'set, which is a committed checkable fact rather than an omission.',
      claimRuleVersion: input.sourceIdentity.claimRuleVersion,
      claimSourceKind: input.sourceIdentity.claimSourceKind,
      databaseSchemaVersion: input.sourceIdentity.databaseSchemaVersion,
    },

    counts: input.counts,
    rootAuthorityDistribution: input.rootAuthorityDistribution,

    exclusions: {
      historicalDevelopmentSourcePath: input.provenance.historicalDevelopmentSourcePath,
      historicalDevelopmentItemCount: input.provenance.historicalDevelopmentItemCount,
      historicalDevelopmentOrganisationIds: input.provenance.historicalDevelopmentOrganisationIds,
      historicalExclusionMatchedOn: 'eche_row_key',
      whyNotOrganisationId:
        'MEASURED: none of the 12 historical organisationId values exists in the post-A0 ' +
        'database, because A0 rebuilt organisations from the ECHE artifact and mints a fresh ' +
        'UUID per ingest; all 12 historical echeRowKey values do exist. Matching on the UUID ' +
        'would have excluded nothing and would have done so silently. eche_row_key is the ' +
        'stable source-row identity (CLAUDE.md rule 4).',
      priorGenerationIds: input.provenance.priorGenerationIds,
      priorGenerationArtifactsScanned: input.provenance.priorGenerationArtifacts,
      priorGenerationExclusionIsVacuousHereButImplemented: true,
      noHoldoutFileOpened: true,
      noAdjudicationFileOpened: true,
    },

    hashing: {
      canonicalJsonConvention:
        'canonicalStringify (src/orgunits/classify/canonical.ts): object keys sorted ascending ' +
        'by code unit, arrays kept in their given order, no whitespace, JSON.stringify string ' +
        'escaping, undefined refused. The same canonicalizer the classifier assembly hash and ' +
        'the gold corpus freeze hashes already use.',
      frameHashCoverage: 'the entire frame payload EXCLUDING the frameHash field itself',
      frameHashIsNotTheFileHash:
        'frameHash identifies the frame CONTENT and is stable under reformatting. ' +
        'artifactFileSha256 identifies the committed FILE BYTES and is reported separately, ' +
        'never conflated with frameHash.',
    },

    entries: input.entries,
  };
}

/** SHA-256 over the canonical payload, frameHash excluded by construction. */
export function computeFrameHash(payload: FramePayload): string {
  return createHash('sha256').update(canonicalStringify(payload), 'utf8').digest('hex');
}

/** The complete artifact: payload plus its own hash. */
export function buildFrameArtifact(input: BuildFrameArtifactInput): FrameArtifact {
  const payload = buildFramePayload(input);
  return { ...payload, frameHash: computeFrameHash(payload) };
}

/** Recomputes a parsed artifact's frameHash by stripping the field back off. */
export function recomputeFrameHash(artifact: FrameArtifact): string {
  const clone = { ...artifact } as Record<string, unknown>;
  delete clone.frameHash;
  return createHash('sha256').update(canonicalStringify(clone), 'utf8').digest('hex');
}

/**
 * The exact bytes committed, laid out by THIS REPOSITORY'S OWN PRETTIER.
 *
 * `npm run validate` runs `prettier --check .`, which covers every committed
 * `.json` file, so an artifact emitted with a plain `JSON.stringify` layout
 * would fail the gate the moment it landed. Formatting here - rather than
 * emitting one layout and reformatting it afterwards - keeps the
 * write-then-reread-then-recompute verification in `materialiseFrame.ts`
 * applied to the real committed bytes rather than to a superseded draft.
 *
 * `frameHash` is unaffected either way: it covers the canonical serialization
 * of the payload, which no reformatting can change. That is precisely why the
 * two hashes are kept apart.
 */
export async function renderFrameArtifact(artifact: FrameArtifact): Promise<string> {
  const options = await resolveConfig(FRAME_ARTIFACT_PATH);
  return format(JSON.stringify(artifact, null, 2), {
    ...options,
    filepath: FRAME_ARTIFACT_PATH,
    parser: 'json',
  });
}
