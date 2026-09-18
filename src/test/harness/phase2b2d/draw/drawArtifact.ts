/**
 * THE DRAW ARTIFACT, AND THE TWO HASHES THAT ARE NOT THE SAME THING.
 *
 *   drawHash           SHA-256 over the canonical serialization of the draw
 *                      PAYLOAD, with the `drawHash` field itself excluded. It
 *                      identifies the draw's CONTENT and is stable under any
 *                      reformatting of the file that preserves that content.
 *
 *   artifactFileSha256 SHA-256 over the final committed FILE BYTES, drawHash
 *                      included. It identifies the artifact on disk.
 *
 *   They are never conflated and never reported as one value - the same
 *   discipline `frameArtifact.ts` established for the A1 frame, and for the
 *   same reason: a reformat moves the second and not the first.
 *
 * THE CANONICAL JSON CONVENTION
 *
 *   `canonicalStringify` from `src/orgunits/classify/canonical.ts` - this
 *   repository's existing canonicalizer, already the anchor for the classifier
 *   assembly hash, the gold corpus freeze hashes and the A1 frameHash. No
 *   mechanically necessary difference arose here, so there is none: a second
 *   canonicalizer would be a second definition of "identical draw".
 *
 * No network, no database, no clock, no randomness. Every function here is
 * pure EXCEPT `renderDrawArtifact`, which resolves this repository's Prettier
 * config from disk so the emitted bytes are the ones `prettier --check` will
 * accept.
 */
import { createHash } from 'node:crypto';
import { format, resolveConfig } from 'prettier';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import {
  A1B_AUTHORISATION_DECISION,
  A1B_AUTHORITY_RECORD_PATH,
  A1B_AUTHORITY_RECORD_SHA256,
  ACQUISITION_RESERVE_ORGANISATIONS,
  ACQUISITION_TARGET_ORGANISATIONS,
  CORPUS_PLAN_APPROVAL_PATH,
  CORPUS_PLAN_APPROVAL_SHA256,
  CORPUS_PLAN_BYTES,
  CORPUS_PLAN_COMMIT,
  CORPUS_PLAN_PATH,
  CORPUS_PLAN_SHA256,
  DRAW_ARTIFACT_PATH,
  EXACT_REALISED_SPLIT_COUNTS,
  EXPECTED_ELIGIBLE_ORGANISATIONS,
  FRAME_ARTIFACT_BYTES,
  FRAME_ARTIFACT_FILE_SHA256,
  FRAME_ARTIFACT_PATH,
  FRAME_COMMIT,
  FRAME_HASH,
  METHODOLOGY_APPROVAL_COMMIT,
  METHODOLOGY_APPROVAL_PATH,
  METHODOLOGY_APPROVAL_SHA256,
  METHODOLOGY_R3_BYTES,
  METHODOLOGY_R3_PATH,
  METHODOLOGY_R3_SHA256,
  RANK_ALGORITHM_ID,
  SPLIT_ASSIGNMENT_CYCLE_ID,
  SPLIT_ASSIGNMENT_CYCLE_LENGTH,
  SPLIT_ASSIGNMENT_CYCLE_REPETITIONS,
  SPLIT_ASSIGNMENT_CYCLE_V2_R2,
  type DrawCounts,
  type ReserveEntry,
  type SelectionEntry,
} from './drawContract.js';

export interface BuildDrawArtifactInput {
  readonly generationId: string;
  readonly counts: DrawCounts;
  readonly selection: readonly SelectionEntry[];
  readonly reserve: readonly ReserveEntry[];
  readonly rootAuthorityDistribution: DrawRootAuthorityDistribution;
}

/** The artifact payload, with `drawHash` deliberately absent. */
export type DrawPayload = Omit<DrawArtifact, 'drawHash'>;

export interface DrawArtifact {
  readonly record: string;
  readonly recordKind: string;
  readonly generationId: string;
  readonly boundMethodology: Readonly<Record<string, unknown>>;
  readonly boundCorpusPlan: Readonly<Record<string, unknown>>;
  readonly boundAuthorisation: Readonly<Record<string, unknown>>;
  readonly frame: Readonly<Record<string, unknown>>;
  readonly algorithm: Readonly<Record<string, unknown>>;
  readonly counts: DrawCounts;
  readonly rootAuthorityDistribution: DrawRootAuthorityDistribution;
  readonly noAcquisitionTargetIsDerivedHere: Readonly<Record<string, unknown>>;
  readonly replacementState: Readonly<Record<string, unknown>>;
  readonly hashing: Readonly<Record<string, unknown>>;
  readonly selection: readonly SelectionEntry[];
  readonly reserve: readonly ReserveEntry[];
  readonly drawHash: string;
}

/** Assembles the payload. Deterministic: same inputs, same bytes. */
export function buildDrawPayload(input: BuildDrawArtifactInput): DrawPayload {
  return {
    record: 'PHASE_2B_2D_METHODOLOGY_V2_DRAW',
    recordKind: 'DRAW_V2_GEN1',
    generationId: input.generationId,

    boundMethodology: {
      methodologyR3Path: METHODOLOGY_R3_PATH,
      methodologyR3Sha256: METHODOLOGY_R3_SHA256,
      methodologyR3Bytes: METHODOLOGY_R3_BYTES,
      methodologyApprovalPath: METHODOLOGY_APPROVAL_PATH,
      methodologyApprovalSha256: METHODOLOGY_APPROVAL_SHA256,
      methodologyApprovalCommit: METHODOLOGY_APPROVAL_COMMIT,
      sd2Rule:
        'Rank every FRAME-ELIGIBLE organisation by sha256(eche_row_key) ascending. Walk that ' +
        'rank from position 0, admitting each organisation to the SELECTION LIST until it holds ' +
        'ACQUISITION_TARGET_ORGANISATIONS = 110 entries; continue to admit a further ' +
        'ACQUISITION_RESERVE_ORGANISATIONS = 40 to the RESERVE LIST, in the same rank order. ' +
        'Both lists are committed together, BEFORE acquisition begins. Assign the split of the ' +
        'organisation at selection index i as SPLIT_ASSIGNMENT_CYCLE_V2_R2[i mod 22].',
      methodologyIsNotReopenedHere: true,
    },

    boundCorpusPlan: {
      corpusPlanPath: CORPUS_PLAN_PATH,
      corpusPlanSha256: CORPUS_PLAN_SHA256,
      corpusPlanBytes: CORPUS_PLAN_BYTES,
      corpusPlanCommit: CORPUS_PLAN_COMMIT,
      corpusPlanApprovalPath: CORPUS_PLAN_APPROVAL_PATH,
      corpusPlanApprovalSha256: CORPUS_PLAN_APPROVAL_SHA256,
    },

    boundAuthorisation: {
      authorityRecordPath: A1B_AUTHORITY_RECORD_PATH,
      authorityRecordSha256: A1B_AUTHORITY_RECORD_SHA256,
      ownerDecision: A1B_AUTHORISATION_DECISION,
      networkAuthorised: false,
      databaseReadAuthorised: false,
      databaseWriteAuthorised: false,
      institutionAcquisitionAuthorised: false,
      replacementAuthorised: false,
      pageSelectionAuthorised: false,
      labellingAuthorised: false,
      providerInferenceAuthorised: false,
      holdoutExecutionAuthorised: false,
    },

    frame: {
      framePath: FRAME_ARTIFACT_PATH,
      frameHash: FRAME_HASH,
      artifactFileSha256: FRAME_ARTIFACT_FILE_SHA256,
      artifactFileBytes: FRAME_ARTIFACT_BYTES,
      frameCommit: FRAME_COMMIT,
      eligibleOrganisationCount: EXPECTED_ELIGIBLE_ORGANISATIONS,
      frameWasTheOnlyInput:
        'A1 projected every SD1 eligibility decision into the frame bytes named here. This draw ' +
        'opened that one file, verified both of its hashes and its byte length before reading a ' +
        'single entry, and opened no database, no official source artifact, no historical ' +
        'evaluation fixture and no socket.',
      onlyIncludedEntriesParticipated: true,
      frameWasNotModified: true,
      undrawnFrameEntriesAreNotMarkedRejected:
        'Positions at or beyond rank 150 were simply not reached by this generation initial ' +
        'draw. They carry no marker, and the frame is unchanged.',
    },

    algorithm: {
      rankAlgorithmId: RANK_ALGORITHM_ID,
      rankKey: 'sha256(echeRowKey)',
      hashedBytes: 'the UTF-8 bytes of the EXACT echeRowKey string stored in the frozen frame',
      noTrim: true,
      noLowercase: true,
      noUppercase: true,
      noLocaleTransform: true,
      noUnicodeNormalization: true,
      noPrefix: true,
      noSalt: true,
      seeded: false,
      rankRendering: '64-character lower-case hexadecimal',
      sortOrder: 'ascending, plain lexicographic comparison of the 64-character string',
      whySortIsNotLocaleAware:
        'Every character of a lower-case hex digest is one of 0-9a-f: single-byte in UTF-8 and ' +
        'identically ordered in ASCII and UTF-16, so plain comparison IS byte comparison. ' +
        'localeCompare would add collation that varies by ICU version and locale, which a frozen ' +
        'draw cannot have.',
      collisionBetweenDistinctKeysIsAStop: 'STOP_FAIL_CLOSED',
      noTieBreakRuleWasInvented:
        'SD2 freezes no tie-break rule. A collision between two distinct eche_row_keys refuses ' +
        'the draw rather than resolving it, because resolving it would be inventing methodology.',
      target: ACQUISITION_TARGET_ORGANISATIONS,
      reserve: ACQUISITION_RESERVE_ORGANISATIONS,
      selectionPositions: '0..109',
      reservePositions: '110..149',
      cycleId: SPLIT_ASSIGNMENT_CYCLE_ID,
      cycleLength: SPLIT_ASSIGNMENT_CYCLE_LENGTH,
      cycle: SPLIT_ASSIGNMENT_CYCLE_V2_R2,
      cycleRepetitions: SPLIT_ASSIGNMENT_CYCLE_REPETITIONS,
      splitAssignment:
        'SPLIT_ASSIGNMENT_CYCLE_V2_R2[i mod 22] where i is the 0-based selectionIndex',
      exactRealisedCounts: EXACT_REALISED_SPLIT_COUNTS,
      exactCountsAreStructural:
        '20 : 45 : 45 reduces to 4 : 9 : 9, which sums to 22, and 110 / 22 = 5. The counts are a ' +
        'property of the cycle and the total, never of the data - no remainder rule, no ' +
        'rounding, no discretion.',
      assignmentIsLabelBlindDifficultyBlindResultBlind:
        'sha256(eche_row_key) is a content hash of a source-row identity. It cannot encode a ' +
        'label, a difficulty, a model result or an acquisition outcome, because none of those ' +
        'existed when it was computed.',
    },

    counts: input.counts,
    rootAuthorityDistribution: input.rootAuthorityDistribution,

    noAcquisitionTargetIsDerivedHere: {
      statement:
        'Entries carry root authority IDENTIFIERS exactly as the frame carried them, byte for ' +
        'byte. A2 re-resolves each identifier into a request target from the database under its ' +
        'own authority, as CLAUDE.md rule 18 requires.',
      containsNoCanonicalRootUrl: true,
      containsNoDomainOrHostname: true,
      containsNoInstitutionTitle: true,
      containsNoAcquisitionUrl: true,
      containsNoSitemapUrl: true,
      containsNoRobotsUrl: true,
      thisIsASelectionArtifactNotAnAcquisitionManifest: true,
    },

    replacementState: {
      noReplacementHasOccurred: true,
      noSelectedOrganisationIsDeclaredSuccessful: true,
      noSelectedOrganisationIsDeclaredFailed: true,
      noReserveEntryIsConsumed: true,
      reserveEntriesCarryNoSplit: true,
      reserveEntriesCarryNoInheritedSelectionIndex: true,
      reserveEntriesCarryNoReplacementReason: true,
      whyReserveEntriesHaveNoSplitField:
        'A reserve organisation acquires a split ONLY by inheriting a failed selection index ' +
        'under separately authorised A2 replacement. A reserve entry shaped to hold one would ' +
        'make that unauthorised step look like filling in a blank rather than like the separate ' +
        'action it is, so the field does not exist rather than being null.',
      noReplacementLedgerExistsYet: true,
      replacementWillBeAppendOnlyUnderFutureA2Authority: true,
    },

    hashing: {
      canonicalJsonConvention:
        'canonicalStringify (src/orgunits/classify/canonical.ts): object keys sorted ascending ' +
        'by code unit, arrays kept in their given order, no whitespace, JSON.stringify string ' +
        'escaping, undefined refused. The same canonicalizer the A1 frameHash, the classifier ' +
        'assembly hash and the gold corpus freeze hashes already use; no mechanically necessary ' +
        'difference arose, so none was introduced.',
      drawHashCoverage: 'the entire draw payload EXCLUDING the drawHash field itself',
      drawHashIsNotTheFileHash:
        'drawHash identifies the draw CONTENT and is stable under reformatting. ' +
        'artifactFileSha256 identifies the committed FILE BYTES and is reported separately, ' +
        'never conflated with drawHash.',
    },

    selection: input.selection,
    reserve: input.reserve,
  };
}

/** SHA-256 over the canonical payload, drawHash excluded by construction. */
export function computeDrawHash(payload: DrawPayload): string {
  return createHash('sha256').update(canonicalStringify(payload), 'utf8').digest('hex');
}

/** The complete artifact: payload plus its own hash. */
export function buildDrawArtifact(input: BuildDrawArtifactInput): DrawArtifact {
  const payload = buildDrawPayload(input);
  return { ...payload, drawHash: computeDrawHash(payload) };
}

/** Recomputes a parsed artifact's drawHash by stripping the field back off. */
export function recomputeDrawHash(artifact: DrawArtifact): string {
  const clone = { ...artifact } as Record<string, unknown>;
  delete clone.drawHash;
  return createHash('sha256').update(canonicalStringify(clone), 'utf8').digest('hex');
}

/** The shape of the authority distribution, named so every field is checkable. */
export interface DrawRootAuthorityDistribution {
  readonly drawnOrganisations: number;
  readonly organisationsWithZeroAuthorities: number;
  readonly organisationsWithExactlyOneAuthority: number;
  readonly organisationsWithMoreThanOneAuthority: number;
  readonly totalRootAuthorities: number;
  readonly totalWebsiteClaimAuthorities: number;
  readonly totalRootPromotionAuthorities: number;
}

/** Counts authorities by type across the drawn 150. Pure. */
export function drawRootAuthorityDistribution(
  selection: readonly SelectionEntry[],
  reserve: readonly ReserveEntry[],
): DrawRootAuthorityDistribution {
  const all = [...selection, ...reserve];
  let one = 0;
  let many = 0;
  let total = 0;
  let claims = 0;
  let promotions = 0;
  for (const entry of all) {
    total += entry.rootAuthorityCount;
    if (entry.rootAuthorityCount === 1) one += 1;
    else many += 1;
    for (const authority of entry.rootAuthorities) {
      if (authority.type === 'WEBSITE_CLAIM') claims += 1;
      else promotions += 1;
    }
  }
  return {
    drawnOrganisations: all.length,
    organisationsWithZeroAuthorities: 0,
    organisationsWithExactlyOneAuthority: one,
    organisationsWithMoreThanOneAuthority: many,
    totalRootAuthorities: total,
    totalWebsiteClaimAuthorities: claims,
    totalRootPromotionAuthorities: promotions,
  };
}

/**
 * The exact bytes committed, laid out by THIS REPOSITORY'S OWN PRETTIER.
 *
 * `npm run validate` runs `prettier --check .`, which covers every committed
 * `.json` file, so an artifact emitted with a plain `JSON.stringify` layout
 * would fail the gate the moment it landed. Formatting here keeps the
 * write-then-reread-then-recompute verification in `materialiseDraw.ts`
 * applied to the real committed bytes rather than to a superseded draft.
 */
export async function renderDrawArtifact(artifact: DrawArtifact): Promise<string> {
  const options = await resolveConfig(DRAW_ARTIFACT_PATH);
  return format(JSON.stringify(artifact, null, 2), {
    ...options,
    filepath: DRAW_ARTIFACT_PATH,
    parser: 'json',
  });
}
