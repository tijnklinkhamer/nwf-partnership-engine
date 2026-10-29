/**
 * PHASE 2B-2D METHODOLOGY V2 — A1b DRAW CONTRACT.
 *
 * The frozen SD2 identities, the exact split cycle, and the types the rest of
 * the A1b tooling speaks. Nothing here reads a socket, a database, a file, an
 * environment variable or a clock.
 *
 * WHAT A1b IS
 *
 *   A1b implements frozen SD2 over the already-frozen A1 frame: rank every
 *   eligible organisation by sha256 of its eche_row_key, take the first 110 as
 *   the SELECTION LIST and the next 40 as the RESERVE LIST, and assign each
 *   selection index its split from SPLIT_ASSIGNMENT_CYCLE_V2_R2. It reads
 *   exactly ONE file and writes exactly ONE file.
 *
 * WHAT A1b IS NOT
 *
 *   A1b is not A2. There is deliberately no root-URL derivation, no hostname,
 *   no registrable domain, no acquisition manifest, no sitemap or robots path,
 *   no replacement, no reserve consumption, no page identity, no gold and no
 *   classifier output anywhere in this directory. A reserve entry carries NO
 *   split, because no replacement has occurred.
 *
 * WHY THIS DIRECTORY IS `draw/` AND NOT `corpus/`
 *
 *   The owner instruction names `src/test/harness/phase2b2d/corpus/` as the
 *   preferred location and adds "use repository conventions where better".
 *   `orgunitCorpus2DA1FrameIsolation.test.ts` asserts that `corpus/` holds
 *   EXACTLY the eight reviewed A1 modules, and separately asserts that no
 *   module in it names a rank, a draw, a selection, a reserve, a split or a
 *   cycle - SD2's absence from A1 is an executable claim, not a promise.
 *   Adding A1b there would force that file to be weakened, which CLAUDE.md
 *   rule 7 forbids. A sibling directory keeps every A1 assertion intact and
 *   true: A1 still has no draw capability, and A1b's is somewhere else.
 */

/** The Methodology V2 corpus generation this draw belongs to. */
export const GENERATION_ID = 'METHODOLOGY_V2_GEN1';

/** The frozen R3 methodology bytes this draw is bound to. */
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

/** The owner approval of that plan. */
export const CORPUS_PLAN_APPROVAL_SHA256 =
  '0ac475031e81a60ae58d70bb83d5f71ee3cc441573dc82cf88145fdf1e8fec14';
export const CORPUS_PLAN_APPROVAL_PATH =
  'docs/evaluation/PHASE_2B_2D_METHODOLOGY_V2_CORPUS_ACQUISITION_PLAN_V1_OWNER_APPROVAL.json';

/**
 * The owner authorisation of THIS step, committed before this file existed.
 *
 * WHY THE FILE IS NAMED `..._AUTHORITY_RECORD_V1` AND NOT `..._AUTHORISATION_V1`
 *
 *   Two landed checks - `phase2b.firewall.test.ts` and
 *   `orgunitClassify2D2CF0CFreeze.test.ts` - scan `docs/evaluation/` and refuse
 *   any FILENAME matching /authorisation/i or /consumption/i, so that a raw
 *   2D2C runner authorisation token or consumption marker can never leak in
 *   beside the governance records. `authorisation` is therefore a RESERVED
 *   filename token in that directory.
 *
 *   The owner instruction offered its path as a suggestion and named the
 *   artifact an "authority record" in its own prose, so this is the same
 *   record under the directory's existing vocabulary - `OWNER_APPROVAL`,
 *   `OWNER_FREEZE_APPROVAL`, and now `AUTHORITY_RECORD`. The file's BYTES are
 *   byte-identical to the ones first committed (sha256
 *   c24656400469cfe98136df4b705fc80b3916dd4fa66d4114305d101a468108d3, 11,853
 *   bytes); only its path moved, so the immutable record was not edited and no
 *   firewall assertion was weakened to accommodate it.
 */
export const A1B_AUTHORISATION_DECISION = 'AUTHORISE_PHASE_2B_2D_A1B_DETERMINISTIC_DRAW_V1';
export const A1B_AUTHORITY_RECORD_PATH =
  'docs/evaluation/PHASE_2B_2D_METHOD_V2_A1B_DRAW_AUTHORITY_RECORD_V1.json';
export const A1B_AUTHORITY_RECORD_SHA256 =
  'c24656400469cfe98136df4b705fc80b3916dd4fa66d4114305d101a468108d3';

/**
 * THE ONE INPUT. A1b opens this file and no other.
 *
 * Not the database, not an official source artifact, not a historical
 * evaluation fixture, not a website. A1 already projected every SD1
 * eligibility decision into these bytes; re-deriving any of it here would be a
 * second, divergent definition of the frame.
 */
export const FRAME_ARTIFACT_PATH =
  'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_FRAME_V2_GEN1.json';

/** The frame's two hashes, which are different values and are checked apart. */
export const FRAME_HASH = '302dccd8250919213dc329d0b84093f04ff3cc68a1cafe07f844044f94cae650';
export const FRAME_ARTIFACT_FILE_SHA256 =
  'c16b31c9c18e368bbf99e2d45fc2de1a284dd42c9a483ed34c30187e77b18878';
export const FRAME_ARTIFACT_BYTES = 3554080;
export const FRAME_COMMIT = 'c64fad3474499d392d316e35c720310c76e9405b';

/** The exact eligible population SD2 is drawn from. Anything else is a STOP. */
export const EXPECTED_ELIGIBLE_ORGANISATIONS = 5820;

/** The committed draw artifact. */
export const DRAW_ARTIFACT_PATH = 'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_DRAW_V2_GEN1.json';

/**
 * THE FROZEN RANK ALGORITHM.
 *
 *   rankHash = sha256(the EXACT UTF-8 bytes of the echeRowKey string stored in
 *   the frozen frame), rendered as 64 lower-case hex characters, sorted
 *   ascending by plain lexicographic comparison of that string.
 *
 * No trim, no lower-casing, no upper-casing, no locale transform, no Unicode
 * normalization, no prefix and no salt. The identifier below is written into
 * the artifact so a later reader can check WHICH rank function produced it
 * rather than infer one.
 *
 * The normalisations are named individually because the ECHE key is exactly
 * the kind of string that invites them: `normaliseErasmusCode` already folded
 * U+00A0 to a space upstream, and `A BADEN01|948821603` carries a space, a
 * pipe and mixed case. Applying any further fold HERE would produce a
 * different, equally deterministic draw - which is why the absence has to be
 * asserted rather than assumed.
 */
export const RANK_ALGORITHM_ID = 'SHA256_EXACT_UTF8_ECHE_ROW_KEY_ASC_V1';

/** SD2's frozen sizes. Five repetitions of a 22-cycle: 110 = 5 x 22, exactly. */
export const ACQUISITION_TARGET_ORGANISATIONS = 110;
export const ACQUISITION_RESERVE_ORGANISATIONS = 40;
export const SPLIT_ASSIGNMENT_CYCLE_LENGTH = 22;
export const SPLIT_ASSIGNMENT_CYCLE_REPETITIONS = 5;

/** The three splits, and nothing else. */
export const SPLITS = ['DEV_TRAIN', 'DEV_CONFIRM', 'FINAL_HOLDOUT'] as const;
export type Split = (typeof SPLITS)[number];

/** The cycle identifier the artifact records, so a reader checks rather than assumes. */
export const SPLIT_ASSIGNMENT_CYCLE_ID = 'SPLIT_ASSIGNMENT_CYCLE_V2_R2';

/**
 * SPLIT_ASSIGNMENT_CYCLE_V2_R2, value-identical to the frozen R3 bytes
 * (`sectionE_samplingContract.rules[SD2].cycle`) and to the approved Plan V1
 * bytes (`SD2_draw.SPLIT_ASSIGNMENT_CYCLE_V2_R2`). A test compares this array
 * against both files element by element rather than trusting this copy.
 *
 * 20 : 45 : 45 reduces exactly to 4 : 9 : 9, which sums to 22, and 110 / 22 is
 * 5. So five repetitions yield EXACTLY 20 / 45 / 45 with no remainder rule, no
 * rounding and no discretion - the counts are a property of the cycle and the
 * total, never of the data.
 */
export const SPLIT_ASSIGNMENT_CYCLE_V2_R2: readonly Split[] = [
  'DEV_TRAIN',
  'DEV_CONFIRM',
  'FINAL_HOLDOUT',
  'DEV_CONFIRM',
  'FINAL_HOLDOUT',
  'DEV_TRAIN',
  'DEV_CONFIRM',
  'FINAL_HOLDOUT',
  'DEV_CONFIRM',
  'FINAL_HOLDOUT',
  'DEV_CONFIRM',
  'FINAL_HOLDOUT',
  'DEV_TRAIN',
  'DEV_CONFIRM',
  'FINAL_HOLDOUT',
  'DEV_CONFIRM',
  'FINAL_HOLDOUT',
  'DEV_TRAIN',
  'DEV_CONFIRM',
  'FINAL_HOLDOUT',
  'DEV_CONFIRM',
  'FINAL_HOLDOUT',
];

/** The exact realised counts five repetitions must produce. Asserted, not hoped for. */
export const EXACT_REALISED_SPLIT_COUNTS: Readonly<Record<Split, number>> = {
  DEV_TRAIN: 20,
  DEV_CONFIRM: 45,
  FINAL_HOLDOUT: 45,
};

/** A root authority is a website claim or a live root promotion. Never a URL. */
export type RootAuthorityType = 'WEBSITE_CLAIM' | 'ROOT_PROMOTION';

/**
 * One root authority, carried by IDENTIFIER only, byte-for-byte as the frame
 * carried it. A2 re-resolves the identifier into a request target from the
 * database under its own authority (CLAUDE.md rule 18); nothing here may do it.
 */
export interface DrawRootAuthority {
  readonly type: RootAuthorityType;
  /** The `website_claims.id` or `orgunit_root_promotions.id`. Never a URL. */
  readonly id: string;
}

/**
 * One of the 110 selected organisations.
 *
 * It carries a split because SD2 freezes split assignment BEFORE acquisition,
 * which is the whole reason this artifact is committed to git. It carries no
 * page, no item, no document hash, no gold and nothing requestable.
 */
export interface SelectionEntry {
  readonly selectionIndex: number;
  readonly echeRowKey: string;
  readonly organisationId: string;
  readonly rankHash: string;
  readonly split: Split;
  readonly rootAuthorityCount: number;
  readonly rootAuthorities: readonly DrawRootAuthority[];
}

/**
 * One of the 40 reserve organisations.
 *
 * It has NO `split`, NO inherited `selectionIndex` and NO replacement reason -
 * not as nulls, but as fields the type has nowhere to put. No replacement has
 * occurred, and a reserve entry shaped to hold one would make an unauthorised
 * A2 step look like filling in a blank rather than like the separate,
 * separately-authorised action it is.
 */
export interface ReserveEntry {
  readonly reserveRankPosition: number;
  readonly echeRowKey: string;
  readonly organisationId: string;
  readonly rankHash: string;
  readonly rootAuthorityCount: number;
  readonly rootAuthorities: readonly DrawRootAuthority[];
}

/** The reconciling counts the draw artifact commits to. */
export interface DrawCounts {
  readonly eligibleInputCount: number;
  readonly selectionCount: number;
  readonly reserveCount: number;
  readonly rankedButUndrawnCount: number;
  readonly splitCounts: Readonly<Record<Split, number>>;
}
