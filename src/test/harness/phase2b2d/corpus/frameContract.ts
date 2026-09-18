/**
 * PHASE 2B-2D METHODOLOGY V2 — A1 FRAME CONTRACT.
 *
 * The frozen identities, the SD1 reason taxonomy and its precedence, and the
 * types the rest of the A1 tooling speaks. Nothing here reads a socket, a
 * database, a file or a clock.
 *
 * WHAT A1 IS
 *
 *   A1 enumerates EVERY examined organisation under the exact SD1 eligibility
 *   rule and freezes that enumeration as one artifact. It is strictly
 *   read-only: no network, no database mutation, no label, no provider.
 *
 * WHAT A1 IS NOT
 *
 *   A1 is NOT SD2. There is deliberately no ranking function, no
 *   sha256(eche_row_key) rank, no first-110 selection, no next-40 reserve, no
 *   selection index and no split assignment anywhere in this directory. That
 *   is A1b and it is not authorised. The absence is the design.
 */

/** The Methodology V2 corpus generation this frame belongs to. */
export const GENERATION_ID = 'METHODOLOGY_V2_GEN1';

/** The frozen R3 methodology bytes this frame is bound to. */
export const METHODOLOGY_R3_SHA256 =
  'fdc54873f4cdd47688d6d720229f0a0ea8426193711993a4f63a9f5000623f33';
export const METHODOLOGY_R3_BYTES = 142306;
export const METHODOLOGY_R3_PATH =
  'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL_R3.json';

/** The owner freeze approval of those exact bytes. */
export const METHODOLOGY_APPROVAL_SHA256 =
  '77dae976fb219bd94c33f236070a5c216a594a85ff8da3a490b5c948753d331e';
export const METHODOLOGY_APPROVAL_PATH =
  'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_OWNER_FREEZE_APPROVAL_V1.json';
export const METHODOLOGY_APPROVAL_COMMIT = '5988bebd0aacc21404a72de464e0c3ef033e3ee0';

/** The approved Corpus Acquisition Plan V1. */
export const CORPUS_PLAN_SHA256 =
  '54279f1b3e45fe1be8c24e5c81d56693ebb2cdf0a34f346b748d16b56847184e';
export const CORPUS_PLAN_BYTES = 45200;
export const CORPUS_PLAN_PATH =
  'docs/evaluation/PHASE_2B_2D_METHODOLOGY_V2_CORPUS_ACQUISITION_PLAN_V1.json';
export const CORPUS_PLAN_COMMIT = '6f2de0fd5a80f050857a14531e74b659f0ff30c1';

/** The owner approval of that plan, and of A1 frame materialisation. */
export const CORPUS_PLAN_APPROVAL_SHA256 =
  '0ac475031e81a60ae58d70bb83d5f71ee3cc441573dc82cf88145fdf1e8fec14';
export const CORPUS_PLAN_APPROVAL_PATH =
  'docs/evaluation/PHASE_2B_2D_METHODOLOGY_V2_CORPUS_ACQUISITION_PLAN_V1_OWNER_APPROVAL.json';

/** The A0 official-source artifact every claim in this frame is keyed to. */
export const A0_ECHE_ARTIFACT_SHA256 =
  '32e1de188c7a9395c80b8d4cb80f5746a3306f2d45638de241734045932fdee9';
export const A0_ECHE_ARTIFACT_BYTES = 873111;
export const A0_SOURCE_MANIFEST_SHA256 =
  '6f152a0cfb18831fe925a11a206debdffe195e99c4a8cc4d921237e35821a3cf';
export const A0_SOURCE_MANIFEST_BYTES = 2116;

/** Migrations 0001..0011, as applied to the working database. */
export const DATABASE_SCHEMA_VERSION_RANGE = '0001..0011';

/** The committed frame artifact. */
export const FRAME_ARTIFACT_PATH =
  'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_FRAME_V2_GEN1.json';

/**
 * The ONE historical corpus file A1 is permitted to open, and only to derive
 * the identities of the organisations that contributed to it. It is the
 * 49-item DEVELOPMENT set. No HOLDOUT file and no adjudication file is
 * opened by any module in this directory.
 */
export const HISTORICAL_DEVELOPMENT_CORPUS_PATH =
  'src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-v1-canonical-v2.jsonl';

/** The measured shape of that file, asserted rather than assumed at read time. */
export const HISTORICAL_DEVELOPMENT_ITEM_COUNT = 49;
export const HISTORICAL_DEVELOPMENT_ORGANISATION_COUNT = 12;

/** The directory earlier Methodology V2 generation frames are published to. */
export const CORPUS_ARTIFACT_DIRECTORY = 'docs/evaluation/corpus';

/** A root authority is a website claim or a live root promotion. Never a URL. */
export type RootAuthorityType = 'WEBSITE_CLAIM' | 'ROOT_PROMOTION';

/** One root authority, carried by IDENTIFIER only (plan: rootAuthorityIdIsNeverAnAcquisitionUrl). */
export interface RootAuthority {
  readonly type: RootAuthorityType;
  /** The `website_claims.id` or `orgunit_root_promotions.id`. Never a URL. */
  readonly id: string;
  /** A provenance label, e.g. `claim:ECHE_PUBLISHED` or `promotion`. Never a URL. */
  readonly sourceLabel: string;
}

/**
 * The SD1 reason taxonomy. Every examined organisation carries exactly one of
 * these, chosen by the frozen precedence below.
 */
export const FRAME_REASONS = [
  'INCLUDED_STRUCTURALLY_VALID_CLAIM',
  'INCLUDED_LIVE_ROOT_PROMOTION',
  'EXCLUDED_HISTORICAL_DEVELOPMENT',
  'EXCLUDED_PRIOR_METHODOLOGY_GENERATION',
  'EXCLUDED_NO_VALID_ROOT_AUTHORITY',
] as const;

export type FrameReason = (typeof FRAME_REASONS)[number];

/**
 * THE FROZEN REASON PRECEDENCE, most significant first.
 *
 * More than one exclusion can apply to one organisation, so the reason a row
 * carries must be decided by a rule and not by evaluation order. The rule:
 *
 *   1. EXCLUDED_HISTORICAL_DEVELOPMENT
 *   2. EXCLUDED_PRIOR_METHODOLOGY_GENERATION
 *   3. EXCLUDED_NO_VALID_ROOT_AUTHORITY
 *   4. INCLUDED_STRUCTURALLY_VALID_CLAIM
 *   5. INCLUDED_LIVE_ROOT_PROMOTION
 *
 * CONTAMINATION OUTRANKS ABSENCE, deliberately. A historically-used
 * organisation is excluded whatever its current authority state, and saying
 * so is a stronger and more durable statement than "it happens to have no
 * root today" - which could change with the next ingest. Prior-generation
 * contamination outranks absence for the same reason, and sits below
 * historical development only so that an organisation contaminated both ways
 * reports the older, more binding fact.
 *
 * Because the primary reason is chosen by precedence, the three exclusion
 * counts PARTITION the excluded population exactly. The per-entry booleans
 * (`excludedHistoricalDevelopment`, `excludedPriorGeneration`,
 * `hasStructurallyValidClaim`, `hasLiveRootPromotion`) are carried beside the
 * reason so that every SD1 input stays visible on every row and no
 * co-applying exclusion is hidden by the precedence.
 */
export const FRAME_REASON_PRECEDENCE: readonly FrameReason[] = [
  'EXCLUDED_HISTORICAL_DEVELOPMENT',
  'EXCLUDED_PRIOR_METHODOLOGY_GENERATION',
  'EXCLUDED_NO_VALID_ROOT_AUTHORITY',
  'INCLUDED_STRUCTURALLY_VALID_CLAIM',
  'INCLUDED_LIVE_ROOT_PROMOTION',
];

/** One examined organisation, included or not. Every organisation emits exactly one. */
export interface FrameEntry {
  readonly echeRowKey: string;
  readonly organisationId: string;
  readonly included: boolean;
  readonly reason: FrameReason;
  /** SD1 clause A, visible per row. */
  readonly hasStructurallyValidClaim: boolean;
  /** SD1 clause B, visible per row. */
  readonly hasLiveRootPromotion: boolean;
  /** SD1 clause C, visible per row. */
  readonly excludedHistoricalDevelopment: boolean;
  /** SD1 clause D, visible per row. */
  readonly excludedPriorGeneration: boolean;
  /** The first authority in deterministic order, or null when there is none. */
  readonly rootAuthorityType: RootAuthorityType | null;
  readonly rootAuthorityId: string | null;
  readonly rootAuthorityCount: number;
  /** Every authority, in deterministic order, as `TYPE:id`. Never a URL. */
  readonly rootAuthorities: readonly string[];
}

/** The reconciling counts the artifact commits to. */
export interface FrameCounts {
  readonly examinedOrganisationCount: number;
  readonly eligibleOrganisationCount: number;
  readonly excludedOrganisationCount: number;
  readonly excludedHistoricalDevelopmentCount: number;
  readonly excludedPriorGenerationCount: number;
  readonly noValidAuthorityCount: number;
}
