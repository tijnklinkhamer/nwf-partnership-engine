/**
 * GENERATION 2 (PROPOSAL) CONTRACT: every pinned Generation-1 input and every
 * Generation-2 constant, in one place.
 *
 * Generation 1 (METHODOLOGY_V2_GEN1) is TERMINAL: CORPUS_FREEZE_REFUSED at
 * 7c3d24f. Nothing here edits, extends or reinterprets it. Generation 2 is a
 * NEW generation identity under a PROPOSED Methodology V3 that keeps the same
 * 110 selection slots and gives replacements a NEW reserve namespace: the
 * entire never-drawn suffix of the SAME frozen frame, source ranks
 * 150..5819, in the SAME frozen rank order.
 *
 * THIS FILE AUTHORISES NOTHING. It is proposal support: no acquisition, no
 * reserve assignment, no ledger append, no owner freeze.
 */

// ---------------------------------------------------------------------------
// Generation identities.
// ---------------------------------------------------------------------------

export const GENERATION1_ID = 'METHODOLOGY_V2_GEN1';
export const GENERATION2_ID = 'METHODOLOGY_V3_GEN2';
export const ARCHITECTURE_ID =
  'GENERATION2_SAME_SELECTION_COHORT_WITH_FRESH_UNDRAWN_FRAME_RESERVE_NAMESPACE_V1';
export const PROPOSAL_TERMINAL_STATE = 'GENERATION2_CONTINUATION_PROPOSAL_READY_FOR_OWNER_REVIEW';

// ---------------------------------------------------------------------------
// Generation-1 terminal, pinned.
// ---------------------------------------------------------------------------

export const GENERATION1_TERMINAL_COMMIT = '7c3d24f8db72bf5401c4bfc176700c1d50e25cc0';
export const GENERATION1_TERMINAL_RECORD_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION1_CORPUS_FREEZE_REFUSAL_V1.json';
export const GENERATION1_TERMINAL_STATUS = 'CORPUS_FREEZE_REFUSED';

export const GENERATION1_LEDGER_PATH =
  'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_RESERVE_REPLACEMENT_LEDGER_V2_GEN1.json';
export const GENERATION1_LEDGER_FILE_SHA256 =
  '90febac7b3e7c6ecb84ff879f948cf8e52de9731590b1720993f80557f3a0c2d';
export const GENERATION1_LEDGER_HASH =
  'a5a60d7e02faa831d38bab131a42e94f80203989989276393216fdc814623e18';
export const GENERATION1_LEDGER_ENTRY_COUNT = 39;
export const GENERATION1_RESERVE_COUNT = 40;
export const GENERATION1_UNUSED_RESERVE_POSITION = 39;

export const METHODOLOGY_R3_PATH =
  'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL_R3.json';
export const METHODOLOGY_R3_SHA256 =
  'fdc54873f4cdd47688d6d720229f0a0ea8426193711993a4f63a9f5000623f33';

// ---------------------------------------------------------------------------
// The frozen frame and draw, pinned (the same bytes Generation 1 used).
// ---------------------------------------------------------------------------

export const FRAME_PATH = 'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_FRAME_V2_GEN1.json';
export const FRAME_HASH = '302dccd8250919213dc329d0b84093f04ff3cc68a1cafe07f844044f94cae650';
export const FRAME_FILE_SHA256 = 'c16b31c9c18e368bbf99e2d45fc2de1a284dd42c9a483ed34c30187e77b18878';
export const FRAME_BYTES = 3554080;
export const FRAME_COMMIT = 'c64fad3474499d392d316e35c720310c76e9405b';

export const DRAW_PATH = 'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_DRAW_V2_GEN1.json';
export const DRAW_HASH = '79c9eec906bc9d74f2213722b8addb61cd7c4acd02ce466ab0f8f97137542293';
export const DRAW_FILE_SHA256 = 'b7021416894b7547cfe53d0d5f5e34b4e9c35843f8be35f0d2844bc67683b7b3';
export const DRAW_COMMIT = '34537ca';

export const RANK_ALGORITHM_ID = 'SHA256_EXACT_UTF8_ECHE_ROW_KEY_ASC_V1';

// ---------------------------------------------------------------------------
// Frame-rank arithmetic. Every number below is MECHANICAL, not chosen.
// ---------------------------------------------------------------------------

export const ELIGIBLE_COUNT = 5820;
export const SELECTION_COUNT = 110;
/** Source frame ranks 0..109 are the selection. */
export const SELECTION_FIRST_SOURCE_RANK = 0;
/** Source frame ranks 110..149 are the Generation-1 reserves (historical only). */
export const GENERATION1_RESERVE_FIRST_SOURCE_RANK = 110;
/** Source frame ranks 150..5819 were never drawn by Generation 1. */
export const GENERATION2_RESERVE_FIRST_SOURCE_RANK = SELECTION_COUNT + GENERATION1_RESERVE_COUNT;
/** 5820 - 150 = 5670: the whole untouched suffix, never a post-hoc count. */
export const GENERATION2_RESERVE_COUNT = ELIGIBLE_COUNT - GENERATION2_RESERVE_FIRST_SOURCE_RANK;
export const GENERATION2_RESERVE_LAST_SOURCE_RANK = ELIGIBLE_COUNT - 1;

export const GENERATION2_RESERVE_EXHAUSTION_REFUSAL = 'CORPUS_FREEZE_REFUSED';

// ---------------------------------------------------------------------------
// Proposal artifacts.
// ---------------------------------------------------------------------------

/**
 * Deliberately NOT under docs/evaluation/corpus/: the A1 SD1-clause-D scanner
 * (corpus/priorGenerationExclusion.ts) reads every corpus/ artifact whose
 * generationId differs from the one being built as an earlier-generation
 * FRAME. A proposal is not a frozen corpus artifact, and placing it there
 * would make a Generation-1 A1 re-run list Generation 2 as a "prior"
 * generation. Where frozen Generation-2 artifacts live is a V3 freeze decision.
 */
export const GENERATION2_RESERVE_SCHEDULE_PATH =
  'docs/evaluation/PHASE_2B_2D_METHOD_V3_GEN2_RESERVE_SCHEDULE_PROPOSAL_V1.json';
export const GENERATION2_RESERVE_SCHEDULE_RECORD =
  'PHASE_2B_2D_METHOD_V3_GEN2_RESERVE_SCHEDULE_PROPOSAL';
export const GENERATION2_RESERVE_SCHEDULE_RECORD_KIND = 'GENERATION2_RESERVE_SCHEDULE_PROPOSAL_V1';

export const METHODOLOGY_V3_PROPOSAL_PATH =
  'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_PROPOSAL_R1.json';
export const CARRY_FORWARD_FEASIBILITY_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_CARRY_FORWARD_FEASIBILITY_V1.json';

/**
 * The path the Generation-2 ledger WOULD take once the owner freezes V3. It is
 * deliberately NOT created by this proposal: an empty ledger file on disk
 * would look like a live generation. The genesis ledger exists in memory only.
 */
export const GENERATION2_LEDGER_FUTURE_PATH =
  'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER_V1_GEN2.json';
export const GENERATION2_LEDGER_RECORD = 'PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER';
export const GENERATION2_LEDGER_RECORD_KIND = 'RESERVE_REPLACEMENT_LEDGER_V1_GEN2';
