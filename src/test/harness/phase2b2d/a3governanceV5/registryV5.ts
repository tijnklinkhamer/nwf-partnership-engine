/**
 * PHASE 2B-2D — A3 R38B: COMMITTED A2 GOVERNANCE REGISTRY, VERSION 5.
 *
 * ONE QUESTION
 *
 *   Which EXACT committed bytes - named by commit, path, SHA-256 and length -
 *   is the V5 snapshot allowed to interpret, to resolve the TERMINAL
 *   Generation-1 -> Generation-2 A2 state through the R38A cross-generation
 *   contract?
 *
 * WHAT THIS FILE IS, AND IS NOT
 *
 *   Two parts, never merged into one array for uniformity:
 *
 *   1. REUSED BY REFERENCE: the Registry V4 entries whose exact bytes remain
 *      required historical provenance - the frozen draw, and the 51 records a
 *      carried Generation-1 success decided before checkpoint 67ae047 still
 *      binds (its disposition authority, its adjudicated observation and the
 *      one acquisition-policy transition ledger). They are the V4 OBJECTS
 *      THEMSELVES, selected by id, never re-pinned or rewritten. V4's
 *      thirty-entry ledger is NOT reused: the terminal Generation-1 ledger is
 *      a later revision, registered below in its own right.
 *
 *   2. V5'S OWN ENTRIES: the A3 governance preconditions (R38 refusal, R38A
 *      contract record), the terminal A2 checkpoint (cross-check only), the
 *      Methodology-V3 structure freeze, the terminal Generation-1 record and
 *      39-entry ledger, the frozen frame, the Generation-2 reserve schedule
 *      (proposal and frozen), the 21-entry Generation-2 ledger, the
 *      carry-forward baseline and its per-slot audit, Generation-1 post-closure
 *      Windows 08..11, Generation-2 Windows 01..13 (adjudication, adjudicated
 *      observation, window authority), the cadence authorities of exactly
 *      Windows 8, 9, 10 and 12, and the Window-13 targeted host-recovery
 *      provenance.
 *
 *   Every entry has a semantic reason (its roles). Strategies, plans,
 *   pre-network assignments, offline readiness, operator prose, the unused
 *   reserve and owner commentary that carries no slot authority are NOT
 *   registered, even where the terminal freeze binds them: the freeze's
 *   binding list is a closure cross-check (`freezeCrossCheck.ts`), never this
 *   registry's composition.
 *
 *   It means "the exact committed governance at A2 checkpoint 29d0d48",
 *   forever. No glob, no enumeration, no branch, no `HEAD`, no newest
 *   anything: every window is named by its own id and ordinal.
 *
 * THIS MODULE IS PURE DATA. It opens nothing.
 */
import { GENERATION1_ID, GENERATION2_ID } from '../a3crossGenerationSlotAuthority/types.js';
import {
  COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES,
  type GovernanceRegistryEntryV4,
} from '../a3governanceV4/registryV4.js';
import { refuseV5 } from './refusal.js';

// ---------------------------------------------------------------------------
// A. THE CHECKPOINT THIS REGISTRY DESCRIBES.
// ---------------------------------------------------------------------------

export const COMMITTED_A2_GOVERNANCE_REGISTRY_V5 = 'COMMITTED_A2_GOVERNANCE_REGISTRY_V5';

/** The exact terminal A2 commit Registry V5 describes. Not a branch. */
export const COMMITTED_A2_GOVERNANCE_CHECKPOINT_V5 = '29d0d486cb268b5431a0fc23eabb064682ec47d9';

/** The terminal freeze record at that checkpoint, by exact path, digest and length. */
export const TERMINAL_A2_CHECKPOINT_RECORD_V5 = Object.freeze({
  path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_CORPUS_FREEZE_APPROVAL_V1.json',
  sha256: 'dc3f96120edcc9f37fa4e26034d4df1bae576b7289e8d2ad93e26fdb414c7942',
  bytes: 24833,
});

// ---------------------------------------------------------------------------
// B. PARSER FAMILIES AND SEMANTIC ROLES.
// ---------------------------------------------------------------------------

/** One family per genuinely different committed record shape. */
export const GOVERNANCE_PARSER_FAMILIES_V5 = Object.freeze([
  'R38_REFUSAL_PRECONDITION',
  'R38A_CONTRACT_PRECONDITION',
  'GENERATION2_CORPUS_FREEZE_CROSS_CHECK',
  'METHODOLOGY_V3_OWNER_FREEZE',
  'GENERATION1_TERMINAL_RECORD',
  'GENERATION1_TERMINAL_LEDGER',
  'FROZEN_FRAME',
  'GENERATION2_RESERVE_SCHEDULE_PROPOSAL',
  'GENERATION2_RESERVE_SCHEDULE',
  'GENERATION2_REPLACEMENT_LEDGER',
  'GENERATION2_CARRY_FORWARD_BASELINE',
  'GENERATION2_CARRY_FORWARD_FEASIBILITY',
  'GENERATION1_POST_CLOSURE_WINDOW_ADJUDICATION',
  'GENERATION1_POST_CLOSURE_WINDOW_LIVE_RESULT',
  'GENERATION2_WINDOW_ADJUDICATION',
  'GENERATION2_WINDOW_LIVE_RESULT',
  'GENERATION2_WINDOW_LIVE_AUTHORITY',
  'GENERATION2_WINDOW_CADENCE_AUTHORITY',
  'GENERATION2_HOST_INTEGRITY_RULING',
  'METHODOLOGY_V3_HOST_RECOVERY_AMENDMENT',
  'GENERATION2_HOST_RECOVERY_PRECONDITION',
  'GENERATION2_HOST_RECOVERY_AUTHORITY',
  'GENERATION2_HOST_RECOVERY_RESULT',
  'GENERATION2_HOST_RECOVERY_CLOSURE_RULING',
] as const);
export type GovernanceParserFamilyV5 = (typeof GOVERNANCE_PARSER_FAMILIES_V5)[number];

/**
 * Why a record is registered. Only TERMINAL_DISPOSITION_AUTHORITY can supply
 * a disposition, and only through its own family parser; every other role is
 * provenance, structure, execution governance or a cross-check.
 */
export const GOVERNANCE_SEMANTIC_ROLES_V5 = Object.freeze([
  'GOVERNANCE_PRECONDITION',
  'TERMINAL_CHECKPOINT_CROSS_CHECK',
  'GENERATION_STRUCTURE_AUTHORITY',
  'GENERATION1_TERMINAL_STATE',
  'FROZEN_OCCUPANT_IDENTITY',
  'OCCUPANT_CHAIN_AUTHORITY',
  'CARRY_FORWARD_ADMISSION_AUTHORITY',
  'CARRY_FORWARD_PER_SLOT_AUDIT',
  'TERMINAL_DISPOSITION_AUTHORITY',
  'HISTORICAL_REPLACEMENT_REASON_AUTHORITY',
  'ADJUDICATED_OBSERVATION_BINDING',
  'WINDOW_EXECUTION_AUTHORITY',
  'CADENCE_EXECUTION_AUTHORITY',
  'HOST_RECOVERY_PROVENANCE',
] as const);
export type GovernanceSemanticRoleV5 = (typeof GOVERNANCE_SEMANTIC_ROLES_V5)[number];

export interface GovernanceRegistryEntryV5 {
  readonly id: string;
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
  /** The exact commit the bytes are READ FROM. Not a date, not a branch. */
  readonly commit: string;
  readonly expectedRecordKind: string;
  readonly expectedRecordId: string | null;
  /** The record's own name field (`record` or `records`) and its exact value. */
  readonly expectedRecordName: {
    readonly field: 'record' | 'records';
    readonly value: string;
  } | null;
  readonly parserFamily: GovernanceParserFamilyV5;
  readonly roles: readonly GovernanceSemanticRoleV5[];
  /** The generation that committed the record; null for a generation-neutral record. */
  readonly generationId: typeof GENERATION1_ID | typeof GENERATION2_ID | null;
  /** The window a window-scoped record belongs to, by explicit ordinal. */
  readonly windowOrdinal: number | null;
}

function entry(value: GovernanceRegistryEntryV5): GovernanceRegistryEntryV5 {
  return Object.freeze({
    ...value,
    expectedRecordName:
      value.expectedRecordName === null ? null : Object.freeze({ ...value.expectedRecordName }),
    roles: Object.freeze([...value.roles]),
  });
}

// ---------------------------------------------------------------------------
// C. THE V4 ENTRIES REUSED BY REFERENCE.
// ---------------------------------------------------------------------------

/**
 * The exact Registry V4 ids V5 reuses, by reference. The frozen draw, then
 * every record a carried pre-67ae047 Generation-1 success binds. The resolver
 * re-derives the bound set from the facts themselves and refuses unless it is
 * EXACTLY this list - a missing or an extra id is a composition error.
 */
export const REGISTRY_V5_REUSED_V4_IDS: readonly string[] = Object.freeze([
  'FROZEN_DRAW_V2_GEN1',
  'ACQUISITION_POLICY_TRANSITION_LEDGER_V6',
  'BATCH01_PER_SLOT_ATTRIBUTION_ADJUDICATION',
  'BATCH01_EXECUTION_RECORD',
  'OPTION_B_REVALIDATION_ADJUDICATION',
  'OPTION_B_TARGETED_REVALIDATION_RESULT',
  'OPTION_C_LITE_REVALIDATION_ADJUDICATION',
  'OPTION_C_LITE_TARGETED_REVALIDATION_RESULT',
  'WINDOW_V1_EVIDENCE_ADJUDICATION',
  'WINDOW_V1_LIVE_RESULT',
  'WINDOW_V2_PARTIAL_EVIDENCE_ADJUDICATION',
  'WINDOW_V2_LIVE_RESULT',
  'POST_P12_MIXED_WINDOW_EVIDENCE_ADJUDICATION',
  'POST_P12_MIXED_WINDOW_LIVE_RESULT',
  'POST_MIXED_WINDOW_CHAIN_REPLACEMENT_EVIDENCE_ADJUDICATION',
  'POST_MIXED_WINDOW_LIVE_RESULT',
  'POST_P18_CONTINUATION_EVIDENCE_ADJUDICATION',
  'POST_P18_CONTINUATION_LIVE_RESULT',
  'POST_P18_SECOND_CONTINUATION_EVIDENCE_ADJUDICATION',
  'POST_P18_SECOND_CONTINUATION_LIVE_RESULT',
  'POST_P24_CONTINUATION_EVIDENCE_ADJUDICATION',
  'POST_P24_CONTINUATION_LIVE_RESULT',
  'POST_P29_P30_CONTINUATION_EVIDENCE_ADJUDICATION',
  'POST_P29_P30_CONTINUATION_LIVE_RESULT',
  'POST_P29_P30_NEXT_CONTINUATION_EVIDENCE_ADJUDICATION',
  'POST_P29_P30_NEXT_CONTINUATION_LIVE_RESULT',
  'Q1_WINDOW_01_EVIDENCE_ADJUDICATION',
  'Q1_WINDOW_01_LIVE_RESULT',
  'Q1_WINDOW_02_EVIDENCE_ADJUDICATION',
  'Q1_WINDOW_02_LIVE_RESULT',
  'TARGETED_VANTAGE_RECOVERY_EVIDENCE_ADJUDICATION',
  'TARGETED_VANTAGE_RECOVERY_LIVE_RESULT',
  'CHILD_WINDOW_A_EVIDENCE_ADJUDICATION',
  'CHILD_WINDOW_A_LIVE_RESULT',
  'CHILD_WINDOW_B_EVIDENCE_ADJUDICATION',
  'CHILD_WINDOW_B_LIVE_RESULT',
  'CHILD_WINDOW_C_PARTIAL_EVIDENCE_ADJUDICATION',
  'CHILD_WINDOW_C_LIVE_RESULT',
  'RECOVERY_WINDOW_D1_PARTIAL_EVIDENCE_ADJUDICATION',
  'RECOVERY_WINDOW_D1_LIVE_RESULT',
  'WINDOW_03_EVIDENCE_ADJUDICATION',
  'WINDOW_03_LIVE_RESULT',
  'WINDOW_04_EVIDENCE_ADJUDICATION',
  'WINDOW_04_LIVE_RESULT',
  'WINDOW_05_EVIDENCE_ADJUDICATION',
  'WINDOW_05_LIVE_RESULT',
  'WINDOW_06_EVIDENCE_ADJUDICATION',
  'WINDOW_06_LIVE_RESULT',
  'WINDOW_07_EVIDENCE_ADJUDICATION',
  'WINDOW_07_LIVE_RESULT',
  'FINAL_ORDINARY_WINDOW_EVIDENCE_ADJUDICATION',
  'FINAL_ORDINARY_WINDOW_LIVE_RESULT',
]);

/** The reused V4 entries: the V4 OBJECTS THEMSELVES, in the declared order. */
export const REGISTRY_V5_REUSED_V4_ENTRIES: readonly GovernanceRegistryEntryV4[] = Object.freeze(
  REGISTRY_V5_REUSED_V4_IDS.map((id) => {
    const found = COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES.find(
      (candidate) => candidate.id === id,
    );
    if (found === undefined) {
      return refuseV5('REGISTRY_V5_COMPOSITION_INVALID', `registry V4 holds no reused entry ${id}`);
    }
    return found;
  }),
);

/** The reused V4 id of the frozen draw. */
export const FROZEN_DRAW_V4_ID = 'FROZEN_DRAW_V2_GEN1';

// ---------------------------------------------------------------------------
// D. V5'S OWN ENTRIES.
// ---------------------------------------------------------------------------

export const COMMITTED_A2_GOVERNANCE_REGISTRY_V5_ENTRIES: readonly GovernanceRegistryEntryV5[] =
  Object.freeze([
    entry({
      id: 'R38_CROSS_GENERATION_AUTHORITY_ADAPTER_REFUSAL',
      path: 'docs/evaluation/PHASE_2B_2D_A3_R38_CROSS_GENERATION_AUTHORITY_ADAPTER_REFUSAL_V1.json',
      sha256: '7cf59593d06ba77cf29206120496c3e642acccd28a580b1b13b7d5181fc9dec0',
      bytes: 10274,
      commit: '960856bb4e503fcc6961843f88761f66ebffcd27',
      expectedRecordKind: 'PUBLIC_GOVERNANCE_ONLY_ARCHITECTURAL_REFUSAL',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A3_R38_CROSS_GENERATION_AUTHORITY_ADAPTER_REFUSAL_V1',
      },
      parserFamily: 'R38_REFUSAL_PRECONDITION',
      roles: ['GOVERNANCE_PRECONDITION'],
      generationId: null,
      windowOrdinal: null,
    }),
    entry({
      id: 'R38A_CROSS_GENERATION_SLOT_AUTHORITY_CONTRACT',
      path: 'docs/evaluation/PHASE_2B_2D_A3_R38A_CROSS_GENERATION_SLOT_AUTHORITY_CONTRACT_V1.json',
      sha256: 'ea2cac540d17aaf29b5e88b2f9a83b77617f783d6255a86a10f91de3b8b6641e',
      bytes: 11767,
      commit: '80f792de8117c3c91ddb56bbb4dbe6518fde7d8a',
      expectedRecordKind: 'PUBLIC_GOVERNANCE_ONLY_AUTHORITY_CONTRACT_RECORD',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A3_R38A_CROSS_GENERATION_SLOT_AUTHORITY_CONTRACT_V1',
      },
      parserFamily: 'R38A_CONTRACT_PRECONDITION',
      roles: ['GOVERNANCE_PRECONDITION'],
      generationId: null,
      windowOrdinal: null,
    }),
    entry({
      id: 'GEN2_CORPUS_FREEZE_APPROVAL',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_CORPUS_FREEZE_APPROVAL_V1.json',
      sha256: 'dc3f96120edcc9f37fa4e26034d4df1bae576b7289e8d2ad93e26fdb414c7942',
      bytes: 24833,
      commit: '29d0d486cb268b5431a0fc23eabb064682ec47d9',
      expectedRecordKind: 'GENERATION2_CORPUS_FREEZE_OWNER_APPROVAL',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_CORPUS_FREEZE_APPROVAL_V1',
      },
      parserFamily: 'GENERATION2_CORPUS_FREEZE_CROSS_CHECK',
      roles: ['TERMINAL_CHECKPOINT_CROSS_CHECK'],
      generationId: GENERATION2_ID,
      windowOrdinal: null,
    }),
    entry({
      id: 'METHODOLOGY_V3_OWNER_FREEZE_APPROVAL',
      path: 'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_OWNER_FREEZE_APPROVAL_V1.json',
      sha256: '36e8071738e1842ad03a9b51cf5820d58015305191c48490ef515e1cd1c34f9c',
      bytes: 12318,
      commit: '13dcdbed94fea08a833664948ac238737cf44c8e',
      expectedRecordKind: 'OWNER_FREEZE_APPROVAL',
      expectedRecordId: 'phase2b-2d-acceptance-methodology-v3-owner-freeze-approval-v1',
      expectedRecordName: {
        field: 'records',
        value: 'PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_OWNER_FREEZE_APPROVAL_V1',
      },
      parserFamily: 'METHODOLOGY_V3_OWNER_FREEZE',
      roles: ['GENERATION_STRUCTURE_AUTHORITY'],
      generationId: null,
      windowOrdinal: null,
    }),
    entry({
      id: 'GEN1_TERMINAL_RECORD',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION1_CORPUS_FREEZE_REFUSAL_V1.json',
      sha256: '6e37f7970ef6d222c3e775da3e9d629efa2645374fbda39e53e570041c82a1b5',
      bytes: 9720,
      commit: '7c3d24f8db72bf5401c4bfc176700c1d50e25cc0',
      expectedRecordKind: 'GENERATION1_CORPUS_FREEZE_REFUSAL',
      expectedRecordId: 'phase2b-2d-a2-generation1-corpus-freeze-refusal-v1',
      expectedRecordName: {
        field: 'records',
        value: 'PHASE_2B_2D_A2_GENERATION1_CORPUS_FREEZE_REFUSAL_V1',
      },
      parserFamily: 'GENERATION1_TERMINAL_RECORD',
      roles: ['GENERATION1_TERMINAL_STATE'],
      generationId: GENERATION1_ID,
      windowOrdinal: null,
    }),
    entry({
      id: 'GEN1_TERMINAL_LEDGER',
      path: 'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_RESERVE_REPLACEMENT_LEDGER_V2_GEN1.json',
      sha256: '90febac7b3e7c6ecb84ff879f948cf8e52de9731590b1720993f80557f3a0c2d',
      bytes: 28735,
      commit: '8931d78e53372c2265139e7a60d90e5d2a8f01d4',
      expectedRecordKind: 'RESERVE_REPLACEMENT_LEDGER_V2_GEN1',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_METHOD_V2_RESERVE_REPLACEMENT_LEDGER',
      },
      parserFamily: 'GENERATION1_TERMINAL_LEDGER',
      roles: ['OCCUPANT_CHAIN_AUTHORITY'],
      generationId: GENERATION1_ID,
      windowOrdinal: null,
    }),
    entry({
      id: 'FROZEN_FRAME',
      path: 'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_FRAME_V2_GEN1.json',
      sha256: 'c16b31c9c18e368bbf99e2d45fc2de1a284dd42c9a483ed34c30187e77b18878',
      bytes: 3554080,
      commit: 'c64fad3474499d392d316e35c720310c76e9405b',
      expectedRecordKind: 'FRAME_V2_GEN1',
      expectedRecordId: null,
      expectedRecordName: { field: 'record', value: 'PHASE_2B_2D_METHODOLOGY_V2_FRAME' },
      parserFamily: 'FROZEN_FRAME',
      roles: ['FROZEN_OCCUPANT_IDENTITY'],
      generationId: GENERATION1_ID,
      windowOrdinal: null,
    }),
    entry({
      id: 'GEN2_SCHEDULE_PROPOSAL',
      path: 'docs/evaluation/PHASE_2B_2D_METHOD_V3_GEN2_RESERVE_SCHEDULE_PROPOSAL_V1.json',
      sha256: '647507db46aa57983403f16f5841ba3fc139c255028b91106f39be9274311011',
      bytes: 2737703,
      commit: '2eb5ff94fc169909e12b0ce33e90957f9aae924e',
      expectedRecordKind: 'GENERATION2_RESERVE_SCHEDULE_PROPOSAL_V1',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_METHOD_V3_GEN2_RESERVE_SCHEDULE_PROPOSAL',
      },
      parserFamily: 'GENERATION2_RESERVE_SCHEDULE_PROPOSAL',
      roles: ['FROZEN_OCCUPANT_IDENTITY'],
      generationId: GENERATION2_ID,
      windowOrdinal: null,
    }),
    entry({
      id: 'GEN2_RESERVE_SCHEDULE',
      path: 'docs/evaluation/generation2/corpus/PHASE_2B_2D_METHOD_V3_GEN2_RESERVE_SCHEDULE_V1.json',
      sha256: 'ee5ce57f90dd59453f9354bc81c32d98f3390a5d42cd0317d91f4ec1d181e594',
      bytes: 2739585,
      commit: '2a0a86cbcff4a9016c30189d8c90adf1458c9ac4',
      expectedRecordKind: 'GENERATION2_RESERVE_SCHEDULE_FROZEN_V1',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_METHOD_V3_GEN2_RESERVE_SCHEDULE_V1',
      },
      parserFamily: 'GENERATION2_RESERVE_SCHEDULE',
      roles: ['FROZEN_OCCUPANT_IDENTITY'],
      generationId: GENERATION2_ID,
      windowOrdinal: null,
    }),
    entry({
      id: 'GEN2_LEDGER',
      path: 'docs/evaluation/generation2/corpus/PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER_V1_GEN2.json',
      sha256: '07cf86644940bab23fcfe74ab1b28f2a1629d0a0ee7478ac57ce7c79ce33bafe',
      bytes: 17842,
      commit: 'ac19cb8ca4538237be49e03e0c19ce46cf6f4ecb',
      expectedRecordKind: 'RESERVE_REPLACEMENT_LEDGER_V1_GEN2_FROZEN',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER_V1_GEN2',
      },
      parserFamily: 'GENERATION2_REPLACEMENT_LEDGER',
      roles: ['OCCUPANT_CHAIN_AUTHORITY'],
      generationId: GENERATION2_ID,
      windowOrdinal: null,
    }),
    entry({
      id: 'GEN2_CARRY_FORWARD_BASELINE',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_CARRY_FORWARD_BASELINE_V1.json',
      sha256: '739d40466f8fbc95085ea5467164a2672fa4f102677e22d4b89847eeaa6e205f',
      bytes: 20650,
      commit: '8491f9fd42771da342fd7f1f09251ac9322dd394',
      expectedRecordKind: 'GENERATION2_CARRY_FORWARD_BASELINE',
      expectedRecordId: 'phase2b-2d-a2-generation2-carry-forward-baseline-v1',
      expectedRecordName: {
        field: 'records',
        value: 'PHASE_2B_2D_A2_GENERATION2_CARRY_FORWARD_BASELINE_V1',
      },
      parserFamily: 'GENERATION2_CARRY_FORWARD_BASELINE',
      roles: ['CARRY_FORWARD_ADMISSION_AUTHORITY'],
      generationId: GENERATION2_ID,
      windowOrdinal: null,
    }),
    entry({
      id: 'GEN2_CARRY_FORWARD_FEASIBILITY',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_CARRY_FORWARD_FEASIBILITY_V1.json',
      sha256: '7467435b816c2b97c34af7e8da23bcd1575956477fe3cc6fa59a30600a43c38d',
      bytes: 143780,
      commit: '2eb5ff94fc169909e12b0ce33e90957f9aae924e',
      expectedRecordKind: 'GENERATION2_CARRY_FORWARD_FEASIBILITY_AUDIT',
      expectedRecordId: 'phase2b-2d-a2-generation2-carry-forward-feasibility-v1',
      expectedRecordName: {
        field: 'records',
        value: 'PHASE_2B_2D_A2_GENERATION2_CARRY_FORWARD_FEASIBILITY_V1',
      },
      parserFamily: 'GENERATION2_CARRY_FORWARD_FEASIBILITY',
      roles: ['CARRY_FORWARD_PER_SLOT_AUDIT'],
      generationId: GENERATION2_ID,
      windowOrdinal: null,
    }),
    entry({
      id: 'GEN1_POST_CLOSURE_WINDOW_08_ADJUDICATION',
      path: 'docs/evaluation/PHASE_2B_2D_A2_POST_PROVENANCE_CLOSURE_WINDOW_08_EVIDENCE_ADJUDICATION_V1.json',
      sha256: 'f93469742fbddf1598bc2f423c3ecd84c1e3cc768520181583a91a358a721a91',
      bytes: 15404,
      commit: '39a7752ef888d9b2948ff74bca50d2915068f839',
      expectedRecordKind: 'LIVE_WINDOW_EVIDENCE_ADJUDICATION',
      expectedRecordId: 'phase2b-2d-a2-post-provenance-closure-window-08-evidence-adjudication-v1',
      expectedRecordName: {
        field: 'records',
        value: 'PHASE_2B_2D_A2_POST_PROVENANCE_CLOSURE_WINDOW_08_EVIDENCE_ADJUDICATION_V1',
      },
      parserFamily: 'GENERATION1_POST_CLOSURE_WINDOW_ADJUDICATION',
      roles: ['TERMINAL_DISPOSITION_AUTHORITY', 'HISTORICAL_REPLACEMENT_REASON_AUTHORITY'],
      generationId: GENERATION1_ID,
      windowOrdinal: 8,
    }),
    entry({
      id: 'GEN1_POST_CLOSURE_WINDOW_08_LIVE_RESULT',
      path: 'docs/evaluation/PHASE_2B_2D_A2_POST_PROVENANCE_CLOSURE_WINDOW_08_LIVE_RESULT_V1.json',
      sha256: 'a62db60785d78a5ec1827e77588b1022215efebea1d65417dac1d4ad9ed03dad',
      bytes: 16612,
      commit: 'b94ec006e3cfcbea620b1b9fd36ac50e4a51e11b',
      expectedRecordKind: 'LIVE_WINDOW_RESULT',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_POST_PROVENANCE_CLOSURE_WINDOW_08_LIVE_RESULT_V1',
      },
      parserFamily: 'GENERATION1_POST_CLOSURE_WINDOW_LIVE_RESULT',
      roles: ['ADJUDICATED_OBSERVATION_BINDING'],
      generationId: GENERATION1_ID,
      windowOrdinal: 8,
    }),
    entry({
      id: 'GEN1_POST_CLOSURE_WINDOW_09_ADJUDICATION',
      path: 'docs/evaluation/PHASE_2B_2D_A2_POST_PROVENANCE_CLOSURE_WINDOW_09_EVIDENCE_ADJUDICATION_V1.json',
      sha256: '9f2434a0eb59b17ded9ffcbe4c4545c9a04eb7a34aacf13261cf689099317443',
      bytes: 15764,
      commit: 'da187d4f80f0f9ec2c205d1b1da86c475cdc7d45',
      expectedRecordKind: 'LIVE_WINDOW_EVIDENCE_ADJUDICATION',
      expectedRecordId: 'phase2b-2d-a2-post-provenance-closure-window-09-evidence-adjudication-v1',
      expectedRecordName: {
        field: 'records',
        value: 'PHASE_2B_2D_A2_POST_PROVENANCE_CLOSURE_WINDOW_09_EVIDENCE_ADJUDICATION_V1',
      },
      parserFamily: 'GENERATION1_POST_CLOSURE_WINDOW_ADJUDICATION',
      roles: ['TERMINAL_DISPOSITION_AUTHORITY', 'HISTORICAL_REPLACEMENT_REASON_AUTHORITY'],
      generationId: GENERATION1_ID,
      windowOrdinal: 9,
    }),
    entry({
      id: 'GEN1_POST_CLOSURE_WINDOW_09_LIVE_RESULT',
      path: 'docs/evaluation/PHASE_2B_2D_A2_POST_PROVENANCE_CLOSURE_WINDOW_09_LIVE_RESULT_V1.json',
      sha256: '7b5e7f16567e467c64572986d4c2d0601309f78cfd5630a2ab1b96c09f636654',
      bytes: 16815,
      commit: 'ba1d755381c77f708284783af91b5c34a49b8ab2',
      expectedRecordKind: 'LIVE_WINDOW_RESULT',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_POST_PROVENANCE_CLOSURE_WINDOW_09_LIVE_RESULT_V1',
      },
      parserFamily: 'GENERATION1_POST_CLOSURE_WINDOW_LIVE_RESULT',
      roles: ['ADJUDICATED_OBSERVATION_BINDING'],
      generationId: GENERATION1_ID,
      windowOrdinal: 9,
    }),
    entry({
      id: 'GEN1_POST_CLOSURE_WINDOW_10_ADJUDICATION',
      path: 'docs/evaluation/PHASE_2B_2D_A2_POST_PROVENANCE_CLOSURE_WINDOW_10_EVIDENCE_ADJUDICATION_V1.json',
      sha256: '5a0183ff8e57824fe5a80cebcc252b05bf7dcf376c7b7f1d98011b8f75f0374d',
      bytes: 13634,
      commit: 'c02e4f456b95a627edbb51b5d299a952918b778e',
      expectedRecordKind: 'LIVE_WINDOW_EVIDENCE_ADJUDICATION',
      expectedRecordId: 'phase2b-2d-a2-post-provenance-closure-window-10-evidence-adjudication-v1',
      expectedRecordName: {
        field: 'records',
        value: 'PHASE_2B_2D_A2_POST_PROVENANCE_CLOSURE_WINDOW_10_EVIDENCE_ADJUDICATION_V1',
      },
      parserFamily: 'GENERATION1_POST_CLOSURE_WINDOW_ADJUDICATION',
      roles: ['TERMINAL_DISPOSITION_AUTHORITY', 'HISTORICAL_REPLACEMENT_REASON_AUTHORITY'],
      generationId: GENERATION1_ID,
      windowOrdinal: 10,
    }),
    entry({
      id: 'GEN1_POST_CLOSURE_WINDOW_10_LIVE_RESULT',
      path: 'docs/evaluation/PHASE_2B_2D_A2_POST_PROVENANCE_CLOSURE_WINDOW_10_LIVE_RESULT_V1.json',
      sha256: '7b386cab2a977d0767a1d9ccd052bb9d90e2cee36da48956c16038e1fd2accce',
      bytes: 14534,
      commit: 'cc7fb42d51a8ce49dac6d1bb534c2a0e376a7199',
      expectedRecordKind: 'LIVE_WINDOW_RESULT',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_POST_PROVENANCE_CLOSURE_WINDOW_10_LIVE_RESULT_V1',
      },
      parserFamily: 'GENERATION1_POST_CLOSURE_WINDOW_LIVE_RESULT',
      roles: ['ADJUDICATED_OBSERVATION_BINDING'],
      generationId: GENERATION1_ID,
      windowOrdinal: 10,
    }),
    entry({
      id: 'GEN1_POST_CLOSURE_WINDOW_11_ADJUDICATION',
      path: 'docs/evaluation/PHASE_2B_2D_A2_POST_PROVENANCE_CLOSURE_WINDOW_11_EVIDENCE_ADJUDICATION_V1.json',
      sha256: '46e9db6e0f74e65176d074a487c5cfc1dced4b95c1875edda303f140af288bce',
      bytes: 14961,
      commit: '684dfb46ad1ab60f4a8e4af3da802eb58396cb76',
      expectedRecordKind: 'LIVE_WINDOW_EVIDENCE_ADJUDICATION',
      expectedRecordId: 'phase2b-2d-a2-post-provenance-closure-window-11-evidence-adjudication-v1',
      expectedRecordName: {
        field: 'records',
        value: 'PHASE_2B_2D_A2_POST_PROVENANCE_CLOSURE_WINDOW_11_EVIDENCE_ADJUDICATION_V1',
      },
      parserFamily: 'GENERATION1_POST_CLOSURE_WINDOW_ADJUDICATION',
      roles: ['TERMINAL_DISPOSITION_AUTHORITY', 'HISTORICAL_REPLACEMENT_REASON_AUTHORITY'],
      generationId: GENERATION1_ID,
      windowOrdinal: 11,
    }),
    entry({
      id: 'GEN1_POST_CLOSURE_WINDOW_11_LIVE_RESULT',
      path: 'docs/evaluation/PHASE_2B_2D_A2_POST_PROVENANCE_CLOSURE_WINDOW_11_LIVE_RESULT_V1.json',
      sha256: '53830d5d48a4d11e2369f89b8bad4b092a4a60e50219e5fc9e5352aa95438368',
      bytes: 14271,
      commit: 'c65369f1025030c2314266013170174c5f63fa78',
      expectedRecordKind: 'LIVE_WINDOW_RESULT',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_POST_PROVENANCE_CLOSURE_WINDOW_11_LIVE_RESULT_V1',
      },
      parserFamily: 'GENERATION1_POST_CLOSURE_WINDOW_LIVE_RESULT',
      roles: ['ADJUDICATED_OBSERVATION_BINDING'],
      generationId: GENERATION1_ID,
      windowOrdinal: 11,
    }),
    entry({
      id: 'GEN2_WINDOW_01_ADJUDICATION',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_01_EVIDENCE_ADJUDICATION_V1.json',
      sha256: '89e4f166e56292374d3cf1aa2fe8037225770d48193ae619a32a1d4c7f1df5df',
      bytes: 14009,
      commit: 'b281bf3b1dfc25c4540c6b17c1e8b97db468a77d',
      expectedRecordKind: 'GENERATION2_WINDOW_EVIDENCE_ADJUDICATION',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_01_EVIDENCE_ADJUDICATION_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_ADJUDICATION',
      roles: ['TERMINAL_DISPOSITION_AUTHORITY', 'HISTORICAL_REPLACEMENT_REASON_AUTHORITY'],
      generationId: GENERATION2_ID,
      windowOrdinal: 1,
    }),
    entry({
      id: 'GEN2_WINDOW_01_LIVE_RESULT',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_01_LIVE_RESULT_V1.json',
      sha256: '7162938e6f8ba5f7808075f58021b540244b2b5a0b05d61db0812cfd4d8102d0',
      bytes: 17987,
      commit: '41bbedad759c26f1cb1e110bfdd07e1599809178',
      expectedRecordKind: 'GENERATION2_WINDOW_LIVE_RESULT',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_01_LIVE_RESULT_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_LIVE_RESULT',
      roles: ['ADJUDICATED_OBSERVATION_BINDING'],
      generationId: GENERATION2_ID,
      windowOrdinal: 1,
    }),
    entry({
      id: 'GEN2_WINDOW_01_LIVE_AUTHORITY',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_01_LIVE_AUTHORITY_V1.json',
      sha256: 'e4874f7e84a184bd473b75f15dba0fd90700d4bb33ec0093593de90f4dea38ba',
      bytes: 17563,
      commit: '219f6d4a1cb869e9253a9701d48543a88f80f0ab',
      expectedRecordKind: 'GENERATION2_OWNER_LIVE_AUTHORITY',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_01_LIVE_AUTHORITY_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_LIVE_AUTHORITY',
      roles: ['WINDOW_EXECUTION_AUTHORITY'],
      generationId: GENERATION2_ID,
      windowOrdinal: 1,
    }),
    entry({
      id: 'GEN2_WINDOW_02_ADJUDICATION',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_02_EVIDENCE_ADJUDICATION_V1.json',
      sha256: '2e35cad7951aed780151b97400ea3b7e9fd78d4bfdec252f83d0652702bbdc8d',
      bytes: 17294,
      commit: 'c6f6cf6dd1609115858a7dc039d1919bdb4153e4',
      expectedRecordKind: 'GENERATION2_WINDOW_EVIDENCE_ADJUDICATION',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_02_EVIDENCE_ADJUDICATION_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_ADJUDICATION',
      roles: ['TERMINAL_DISPOSITION_AUTHORITY', 'HISTORICAL_REPLACEMENT_REASON_AUTHORITY'],
      generationId: GENERATION2_ID,
      windowOrdinal: 2,
    }),
    entry({
      id: 'GEN2_WINDOW_02_LIVE_RESULT',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_02_LIVE_RESULT_V1.json',
      sha256: '68852cbca3de127bb0a5442863cc99d2c3b72a5a69700c5fc5ac619fbc29b4ae',
      bytes: 20909,
      commit: 'd074c0647136b45ee094b2d46a98ee2110db5102',
      expectedRecordKind: 'GENERATION2_WINDOW_LIVE_RESULT',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_02_LIVE_RESULT_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_LIVE_RESULT',
      roles: ['ADJUDICATED_OBSERVATION_BINDING'],
      generationId: GENERATION2_ID,
      windowOrdinal: 2,
    }),
    entry({
      id: 'GEN2_WINDOW_02_LIVE_AUTHORITY',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_02_LIVE_AUTHORITY_V1.json',
      sha256: 'e2cb65b5a7d3b35391718e255fef4db926bcfe88020f392ac93f79981392bba2',
      bytes: 22304,
      commit: 'da659b586c05870f08f5af56d8816365a5203fa0',
      expectedRecordKind: 'GENERATION2_OWNER_LIVE_AUTHORITY',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_02_LIVE_AUTHORITY_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_LIVE_AUTHORITY',
      roles: ['WINDOW_EXECUTION_AUTHORITY'],
      generationId: GENERATION2_ID,
      windowOrdinal: 2,
    }),
    entry({
      id: 'GEN2_WINDOW_03_ADJUDICATION',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_03_EVIDENCE_ADJUDICATION_V1.json',
      sha256: '8d59cb2a1e2d6f3b447767a8c56078111658dbd07818e098fd363c153fe33ef0',
      bytes: 18002,
      commit: '8f4bc2185ce7b0010b1dd96fe22b016c9500b9b0',
      expectedRecordKind: 'GENERATION2_WINDOW_EVIDENCE_ADJUDICATION',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_03_EVIDENCE_ADJUDICATION_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_ADJUDICATION',
      roles: ['TERMINAL_DISPOSITION_AUTHORITY', 'HISTORICAL_REPLACEMENT_REASON_AUTHORITY'],
      generationId: GENERATION2_ID,
      windowOrdinal: 3,
    }),
    entry({
      id: 'GEN2_WINDOW_03_LIVE_RESULT',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_03_LIVE_RESULT_V1.json',
      sha256: 'c9654a837dde1c7c86a90c505b8cc1d5e6fcae1edc8a593981328576944e42ec',
      bytes: 21440,
      commit: '17398aaf44b33d831ab9fb8c23b17b0d529da160',
      expectedRecordKind: 'GENERATION2_WINDOW_LIVE_RESULT',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_03_LIVE_RESULT_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_LIVE_RESULT',
      roles: ['ADJUDICATED_OBSERVATION_BINDING'],
      generationId: GENERATION2_ID,
      windowOrdinal: 3,
    }),
    entry({
      id: 'GEN2_WINDOW_03_LIVE_AUTHORITY',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_03_LIVE_AUTHORITY_V1.json',
      sha256: 'aaa61ce72b9a5b943928f879f68daa06ea612aacfd5117310d54bd14cfa65478',
      bytes: 29867,
      commit: 'a39309f489aef60ae43ff4d179b9150dc5caf6c0',
      expectedRecordKind: 'GENERATION2_OWNER_LIVE_AUTHORITY',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_03_LIVE_AUTHORITY_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_LIVE_AUTHORITY',
      roles: ['WINDOW_EXECUTION_AUTHORITY'],
      generationId: GENERATION2_ID,
      windowOrdinal: 3,
    }),
    entry({
      id: 'GEN2_WINDOW_04_ADJUDICATION',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_04_EVIDENCE_ADJUDICATION_V1.json',
      sha256: '826f11851a6c000d3a314da2b6a4c31081014d29fdbdeb6012d157dae58b3dd8',
      bytes: 20718,
      commit: 'd023645a9c7e7a2afae92096e6b2c1bfd6daf861',
      expectedRecordKind: 'GENERATION2_WINDOW_EVIDENCE_ADJUDICATION',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_04_EVIDENCE_ADJUDICATION_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_ADJUDICATION',
      roles: ['TERMINAL_DISPOSITION_AUTHORITY', 'HISTORICAL_REPLACEMENT_REASON_AUTHORITY'],
      generationId: GENERATION2_ID,
      windowOrdinal: 4,
    }),
    entry({
      id: 'GEN2_WINDOW_04_LIVE_RESULT',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_04_LIVE_RESULT_V1.json',
      sha256: '89b2aac217502133e7cbd75a9144f81637a03ef3be906cdebd03d1edb30e22f4',
      bytes: 24090,
      commit: '8efe11c290b24d17bde24f61914a19698986f108',
      expectedRecordKind: 'GENERATION2_WINDOW_LIVE_RESULT',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_04_LIVE_RESULT_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_LIVE_RESULT',
      roles: ['ADJUDICATED_OBSERVATION_BINDING'],
      generationId: GENERATION2_ID,
      windowOrdinal: 4,
    }),
    entry({
      id: 'GEN2_WINDOW_04_LIVE_AUTHORITY',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_04_LIVE_AUTHORITY_V1.json',
      sha256: 'bb24c26a8f2816a2cba584edb3726254bd72b1a8b979ca3cf9348effae1802a5',
      bytes: 31894,
      commit: '05ffde6e8bcbbd2456ae1ccf69f43a7a41c2fcba',
      expectedRecordKind: 'GENERATION2_OWNER_LIVE_AUTHORITY',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_04_LIVE_AUTHORITY_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_LIVE_AUTHORITY',
      roles: ['WINDOW_EXECUTION_AUTHORITY'],
      generationId: GENERATION2_ID,
      windowOrdinal: 4,
    }),
    entry({
      id: 'GEN2_WINDOW_05_ADJUDICATION',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_05_EVIDENCE_ADJUDICATION_V1.json',
      sha256: '187eef89ed37f86e2f96c95e8772d9681ddcd944d04cff21961e4aaa63358642',
      bytes: 27399,
      commit: 'df3dddde6d9365da436e64c67e3b044df2f2cc42',
      expectedRecordKind: 'GENERATION2_WINDOW_EVIDENCE_ADJUDICATION',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_05_EVIDENCE_ADJUDICATION_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_ADJUDICATION',
      roles: ['TERMINAL_DISPOSITION_AUTHORITY', 'HISTORICAL_REPLACEMENT_REASON_AUTHORITY'],
      generationId: GENERATION2_ID,
      windowOrdinal: 5,
    }),
    entry({
      id: 'GEN2_WINDOW_05_LIVE_RESULT',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_05_LIVE_RESULT_V2.json',
      sha256: '6914f564726029ebf82ef9ea142279f9697d9adb68bf42bfad0ba359df748d26',
      bytes: 26819,
      commit: 'dbc7f0b4bb34ba1572ad2b59c3c0381807dbb0c6',
      expectedRecordKind: 'GENERATION2_WINDOW_LIVE_RESULT',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_05_LIVE_RESULT_V2',
      },
      parserFamily: 'GENERATION2_WINDOW_LIVE_RESULT',
      roles: ['ADJUDICATED_OBSERVATION_BINDING'],
      generationId: GENERATION2_ID,
      windowOrdinal: 5,
    }),
    entry({
      id: 'GEN2_WINDOW_05_LIVE_AUTHORITY',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_05_LIVE_AUTHORITY_V1.json',
      sha256: 'd88f741162bf27f6c290b2875edbeba522908c5545d6608b8d79b820ff701807',
      bytes: 37600,
      commit: 'c1b1a56fb6401d20f191b84e07b8f7508ba4b08c',
      expectedRecordKind: 'GENERATION2_OWNER_LIVE_AUTHORITY',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_05_LIVE_AUTHORITY_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_LIVE_AUTHORITY',
      roles: ['WINDOW_EXECUTION_AUTHORITY'],
      generationId: GENERATION2_ID,
      windowOrdinal: 5,
    }),
    entry({
      id: 'GEN2_WINDOW_06_ADJUDICATION',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_06_EVIDENCE_ADJUDICATION_V1.json',
      sha256: '845ca3a4bcd13409ac00dfc8b2a4224e9aee8ab08749aab523a8b7d478f5f340',
      bytes: 29965,
      commit: '47389c54b98aa1088a1e686f3592280e22046308',
      expectedRecordKind: 'GENERATION2_WINDOW_EVIDENCE_ADJUDICATION',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_06_EVIDENCE_ADJUDICATION_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_ADJUDICATION',
      roles: ['TERMINAL_DISPOSITION_AUTHORITY', 'HISTORICAL_REPLACEMENT_REASON_AUTHORITY'],
      generationId: GENERATION2_ID,
      windowOrdinal: 6,
    }),
    entry({
      id: 'GEN2_WINDOW_06_LIVE_RESULT',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_06_LIVE_RESULT_V3.json',
      sha256: '9dee6861dabc5c997ed2d458fad7d346f6b7aa9a019d421439f8c2b242cb1af6',
      bytes: 37590,
      commit: '3905bc27a3a54bb425d91813ed6e6e641d283d0c',
      expectedRecordKind: 'GENERATION2_WINDOW_LIVE_RESULT',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_06_LIVE_RESULT_V3',
      },
      parserFamily: 'GENERATION2_WINDOW_LIVE_RESULT',
      roles: ['ADJUDICATED_OBSERVATION_BINDING'],
      generationId: GENERATION2_ID,
      windowOrdinal: 6,
    }),
    entry({
      id: 'GEN2_WINDOW_06_LIVE_AUTHORITY',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_06_LIVE_AUTHORITY_V1.json',
      sha256: '6d847d8175054ecf7f09e45b5ab8ba8e488e9f8ca99553e9ca2c420b4dc977e3',
      bytes: 43944,
      commit: 'c3f6c223de48625976f52da1ce110133f0d01afb',
      expectedRecordKind: 'GENERATION2_OWNER_LIVE_AUTHORITY',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_06_LIVE_AUTHORITY_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_LIVE_AUTHORITY',
      roles: ['WINDOW_EXECUTION_AUTHORITY'],
      generationId: GENERATION2_ID,
      windowOrdinal: 6,
    }),
    entry({
      id: 'GEN2_WINDOW_07_ADJUDICATION',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_07_EVIDENCE_ADJUDICATION_V1.json',
      sha256: 'd138c9618b2919d79b3468eb27f034bd11b64daf09a6c01ef733e474aa57d2fb',
      bytes: 20671,
      commit: '2e814487cff6c8dcf5bcb9c6f8a7639e84d7e7db',
      expectedRecordKind: 'GENERATION2_WINDOW_EVIDENCE_ADJUDICATION',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_07_EVIDENCE_ADJUDICATION_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_ADJUDICATION',
      roles: ['TERMINAL_DISPOSITION_AUTHORITY', 'HISTORICAL_REPLACEMENT_REASON_AUTHORITY'],
      generationId: GENERATION2_ID,
      windowOrdinal: 7,
    }),
    entry({
      id: 'GEN2_WINDOW_07_LIVE_RESULT',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_07_LIVE_RESULT_V1.json',
      sha256: '41614f01a213a22203fbb655ead9df888727b4f7740e96e74389156cc9582734',
      bytes: 22592,
      commit: '003a9afd1720f858f721957dc029cd1a95e1c6c2',
      expectedRecordKind: 'GENERATION2_WINDOW_LIVE_RESULT',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_07_LIVE_RESULT_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_LIVE_RESULT',
      roles: ['ADJUDICATED_OBSERVATION_BINDING'],
      generationId: GENERATION2_ID,
      windowOrdinal: 7,
    }),
    entry({
      id: 'GEN2_WINDOW_07_LIVE_AUTHORITY',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_07_LIVE_AUTHORITY_V1.json',
      sha256: '726f78369af5fa5bb177a934c8c81e1bb317c04026dbf30575be4bb613db6020',
      bytes: 61160,
      commit: '73fc2c8b3e2f14def6ba7861cb7d2ba49ef402a6',
      expectedRecordKind: 'GENERATION2_OWNER_LIVE_AUTHORITY',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_07_LIVE_AUTHORITY_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_LIVE_AUTHORITY',
      roles: ['WINDOW_EXECUTION_AUTHORITY'],
      generationId: GENERATION2_ID,
      windowOrdinal: 7,
    }),
    entry({
      id: 'GEN2_WINDOW_08_ADJUDICATION',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_08_EVIDENCE_ADJUDICATION_V1.json',
      sha256: '2fb0b230d92b30746b2b62e3a598795cf4840011b710953df344774b9b8032da',
      bytes: 28467,
      commit: 'd4e450398b3435d97a2bf6a0cabcf416ac7205af',
      expectedRecordKind: 'GENERATION2_WINDOW_EVIDENCE_ADJUDICATION',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_08_EVIDENCE_ADJUDICATION_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_ADJUDICATION',
      roles: ['TERMINAL_DISPOSITION_AUTHORITY', 'HISTORICAL_REPLACEMENT_REASON_AUTHORITY'],
      generationId: GENERATION2_ID,
      windowOrdinal: 8,
    }),
    entry({
      id: 'GEN2_WINDOW_08_LIVE_RESULT',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_08_LIVE_RESULT_V1.json',
      sha256: '0a32d0d3e0c120e9b498046ea4df76d65ba85be22681f73e815c3dfc02cdc187',
      bytes: 37576,
      commit: '1645ce2d11c4a55c5cbb629de54b43353ea17de0',
      expectedRecordKind: 'GENERATION2_WINDOW_LIVE_RESULT',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_08_LIVE_RESULT_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_LIVE_RESULT',
      roles: ['ADJUDICATED_OBSERVATION_BINDING'],
      generationId: GENERATION2_ID,
      windowOrdinal: 8,
    }),
    entry({
      id: 'GEN2_WINDOW_08_LIVE_AUTHORITY',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_08_LIVE_AUTHORITY_V1.json',
      sha256: 'f77aa0cf6d232a070d348dcd36a74932f078a64f79e1ddf737ec2e3f35b69a61',
      bytes: 69312,
      commit: '202dbd57924080b54ac28e92efd001fc7dbae7a6',
      expectedRecordKind: 'GENERATION2_OWNER_LIVE_AUTHORITY',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_08_LIVE_AUTHORITY_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_LIVE_AUTHORITY',
      roles: ['WINDOW_EXECUTION_AUTHORITY'],
      generationId: GENERATION2_ID,
      windowOrdinal: 8,
    }),
    entry({
      id: 'GEN2_WINDOW_08_CADENCE_AUTHORITY',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_07_P5_REVIEW_AND_CONTINUATION_DECISION_V1.json',
      sha256: '2cfa5931946b8c71729a17ca98291df2a8f0fa6768a24ef3362b24f689c28b85',
      bytes: 10845,
      commit: '2c20af702c3a9aed93e41f61c28d274f01c8351a',
      expectedRecordKind: 'GENERATION2_OWNER_CONTINUATION_DECISION',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_07_P5_REVIEW_AND_CONTINUATION_DECISION_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_CADENCE_AUTHORITY',
      roles: ['CADENCE_EXECUTION_AUTHORITY'],
      generationId: GENERATION2_ID,
      windowOrdinal: 8,
    }),
    entry({
      id: 'GEN2_WINDOW_09_ADJUDICATION',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_09_EVIDENCE_ADJUDICATION_V1.json',
      sha256: '9cf694e5caf0f1c6d403d045b6939cae7bd57964372c9002ce22fc44ee739fa3',
      bytes: 31507,
      commit: 'ce139ff44df9248b35ceec0b04719e51371b0436',
      expectedRecordKind: 'GENERATION2_WINDOW_EVIDENCE_ADJUDICATION',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_09_EVIDENCE_ADJUDICATION_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_ADJUDICATION',
      roles: ['TERMINAL_DISPOSITION_AUTHORITY', 'HISTORICAL_REPLACEMENT_REASON_AUTHORITY'],
      generationId: GENERATION2_ID,
      windowOrdinal: 9,
    }),
    entry({
      id: 'GEN2_WINDOW_09_LIVE_RESULT',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_09_LIVE_RESULT_V2.json',
      sha256: 'e7d384ad58a03090ecdfc3130ef2eb5b4e9966b784aa1cc2f36bc2ed7825c0f1',
      bytes: 41297,
      commit: 'e5c3bf8ab93dabfc008862c108f1d68a32c7772b',
      expectedRecordKind: 'GENERATION2_WINDOW_LIVE_RESULT',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_09_LIVE_RESULT_V2',
      },
      parserFamily: 'GENERATION2_WINDOW_LIVE_RESULT',
      roles: ['ADJUDICATED_OBSERVATION_BINDING'],
      generationId: GENERATION2_ID,
      windowOrdinal: 9,
    }),
    entry({
      id: 'GEN2_WINDOW_09_LIVE_AUTHORITY',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_09_LIVE_AUTHORITY_V1.json',
      sha256: '97841c9a2c679b5adcd6673128353e4aa6e20b54d6474fb957bc9e2e63c61e51',
      bytes: 77058,
      commit: '38f14d98d6242be4f8e9560fc91bb8b258117cee',
      expectedRecordKind: 'GENERATION2_OWNER_LIVE_AUTHORITY',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_09_LIVE_AUTHORITY_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_LIVE_AUTHORITY',
      roles: ['WINDOW_EXECUTION_AUTHORITY'],
      generationId: GENERATION2_ID,
      windowOrdinal: 9,
    }),
    entry({
      id: 'GEN2_WINDOW_09_CADENCE_AUTHORITY',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_08_P5_REVIEW_AND_WINDOW_09_CONTINUATION_DECISION_V1.json',
      sha256: '316e6f9aa90c977ac1f43cf8155a297980b94f93c4935d33c378e1dec9a141e2',
      bytes: 10497,
      commit: '9deb681e6cb7f19ad4af0f677655f278ece6c149',
      expectedRecordKind: 'GENERATION2_OWNER_CONTINUATION_DECISION',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value:
          'PHASE_2B_2D_A2_GENERATION2_WINDOW_08_P5_REVIEW_AND_WINDOW_09_CONTINUATION_DECISION_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_CADENCE_AUTHORITY',
      roles: ['CADENCE_EXECUTION_AUTHORITY'],
      generationId: GENERATION2_ID,
      windowOrdinal: 9,
    }),
    entry({
      id: 'GEN2_WINDOW_10_ADJUDICATION',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_10_EVIDENCE_ADJUDICATION_V1.json',
      sha256: '6c27a6b5c0db88ca792367551ed134509affb4cc36a488e0f7387364ecdf1bae',
      bytes: 30051,
      commit: 'cd4a346648fda84dc334556165afeb91fa7d475a',
      expectedRecordKind: 'GENERATION2_WINDOW_EVIDENCE_ADJUDICATION',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_10_EVIDENCE_ADJUDICATION_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_ADJUDICATION',
      roles: ['TERMINAL_DISPOSITION_AUTHORITY', 'HISTORICAL_REPLACEMENT_REASON_AUTHORITY'],
      generationId: GENERATION2_ID,
      windowOrdinal: 10,
    }),
    entry({
      id: 'GEN2_WINDOW_10_LIVE_RESULT',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_10_LIVE_RESULT_V1.json',
      sha256: 'fb95f08928198d6c31107b292ccb142cda95f3c171ddd24b262f527fcecce50f',
      bytes: 30755,
      commit: '5af3ec75adcaad744d0c934ecedbed8c1c8b752e',
      expectedRecordKind: 'GENERATION2_WINDOW_LIVE_RESULT',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_10_LIVE_RESULT_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_LIVE_RESULT',
      roles: ['ADJUDICATED_OBSERVATION_BINDING'],
      generationId: GENERATION2_ID,
      windowOrdinal: 10,
    }),
    entry({
      id: 'GEN2_WINDOW_10_LIVE_AUTHORITY',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_10_LIVE_AUTHORITY_V1.json',
      sha256: '30dcbb6713aec1de2c12ac1c77db35ecbb4d29a84b5bf0568251d3471dc58145',
      bytes: 94829,
      commit: 'a3a6297015a195e887f2240a0730118aad6ac0ca',
      expectedRecordKind: 'GENERATION2_OWNER_LIVE_AUTHORITY',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_10_LIVE_AUTHORITY_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_LIVE_AUTHORITY',
      roles: ['WINDOW_EXECUTION_AUTHORITY'],
      generationId: GENERATION2_ID,
      windowOrdinal: 10,
    }),
    entry({
      id: 'GEN2_WINDOW_10_CADENCE_AUTHORITY',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_09_P5_REVIEW_AND_WINDOW_10_CONTINUATION_DECISION_V1.json',
      sha256: 'ceff378d1147b4d43ac754c368c6311543f673f37f4190a9840d6ef926238752',
      bytes: 11347,
      commit: '7b226de931752dc70028b5e20e37fa5d7a925ca5',
      expectedRecordKind: 'GENERATION2_OWNER_CONTINUATION_DECISION',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value:
          'PHASE_2B_2D_A2_GENERATION2_WINDOW_09_P5_REVIEW_AND_WINDOW_10_CONTINUATION_DECISION_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_CADENCE_AUTHORITY',
      roles: ['CADENCE_EXECUTION_AUTHORITY'],
      generationId: GENERATION2_ID,
      windowOrdinal: 10,
    }),
    entry({
      id: 'GEN2_WINDOW_11_ADJUDICATION',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_11_EVIDENCE_ADJUDICATION_V1.json',
      sha256: '99f3de0bb9fd85e2e3d5d919ee73addd73627a383bc95874df1098e2fa90e027',
      bytes: 33809,
      commit: '2e014b1dcd61ab567ef21141a2fb664456f375e4',
      expectedRecordKind: 'GENERATION2_WINDOW_EVIDENCE_ADJUDICATION',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_11_EVIDENCE_ADJUDICATION_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_ADJUDICATION',
      roles: ['TERMINAL_DISPOSITION_AUTHORITY', 'HISTORICAL_REPLACEMENT_REASON_AUTHORITY'],
      generationId: GENERATION2_ID,
      windowOrdinal: 11,
    }),
    entry({
      id: 'GEN2_WINDOW_11_LIVE_RESULT',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_11_LIVE_RESULT_V1.json',
      sha256: '9d7219e97c372141be75bfc49c795cc8d543709383424107542d15c35a15fec3',
      bytes: 41019,
      commit: '32bcda7fe7d0d03108a58d7ebb262228233b0a98',
      expectedRecordKind: 'GENERATION2_WINDOW_LIVE_RESULT',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_11_LIVE_RESULT_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_LIVE_RESULT',
      roles: ['ADJUDICATED_OBSERVATION_BINDING'],
      generationId: GENERATION2_ID,
      windowOrdinal: 11,
    }),
    entry({
      id: 'GEN2_WINDOW_11_LIVE_AUTHORITY',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_11_LIVE_AUTHORITY_V1.json',
      sha256: '99be494d50d72b2630f121aedec8d1b472b9e1e416e681661f8fe4efe7b8df21',
      bytes: 101078,
      commit: 'fdd3f740c8f05468fd926252599f48aa426b146d',
      expectedRecordKind: 'GENERATION2_OWNER_LIVE_AUTHORITY',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_11_LIVE_AUTHORITY_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_LIVE_AUTHORITY',
      roles: ['WINDOW_EXECUTION_AUTHORITY'],
      generationId: GENERATION2_ID,
      windowOrdinal: 11,
    }),
    entry({
      id: 'GEN2_WINDOW_12_ADJUDICATION',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_12_EVIDENCE_ADJUDICATION_V1.json',
      sha256: 'ecb063c42c80f81583a78509587ccb0182350e71222b781075224801ef02fd2b',
      bytes: 37091,
      commit: '1cb1a21dbb79585abc8518852bf69856fd59576d',
      expectedRecordKind: 'GENERATION2_WINDOW_EVIDENCE_ADJUDICATION',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_12_EVIDENCE_ADJUDICATION_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_ADJUDICATION',
      roles: ['TERMINAL_DISPOSITION_AUTHORITY', 'HISTORICAL_REPLACEMENT_REASON_AUTHORITY'],
      generationId: GENERATION2_ID,
      windowOrdinal: 12,
    }),
    entry({
      id: 'GEN2_WINDOW_12_LIVE_RESULT',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_12_LIVE_RESULT_V1.json',
      sha256: 'c3be5776739f9d3135d877b70d175c06319a255d0c91968524451749e7b8ee2f',
      bytes: 46769,
      commit: 'b302438289fedf4b457fc21873e0c1fc3d4aa388',
      expectedRecordKind: 'GENERATION2_WINDOW_LIVE_RESULT',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_12_LIVE_RESULT_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_LIVE_RESULT',
      roles: ['ADJUDICATED_OBSERVATION_BINDING'],
      generationId: GENERATION2_ID,
      windowOrdinal: 12,
    }),
    entry({
      id: 'GEN2_WINDOW_12_LIVE_AUTHORITY',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_12_LIVE_AUTHORITY_V1.json',
      sha256: '522cb1c99b99b8d968fb2a8943f0e88b8a40e4096f39211adfa46cec951be009',
      bytes: 107052,
      commit: '5ee2afe80ac750e762243335c3c5097ac92a66aa',
      expectedRecordKind: 'GENERATION2_OWNER_LIVE_AUTHORITY',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_12_LIVE_AUTHORITY_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_LIVE_AUTHORITY',
      roles: ['WINDOW_EXECUTION_AUTHORITY'],
      generationId: GENERATION2_ID,
      windowOrdinal: 12,
    }),
    entry({
      id: 'GEN2_WINDOW_12_CADENCE_AUTHORITY',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_11_P5_REVIEW_AND_WINDOW_12_CONTINUATION_DECISION_V1.json',
      sha256: 'cdb755868e2887feeb12f3df63faad00ca861b36723fb6213e29bb0017c19008',
      bytes: 11656,
      commit: '6dd2f7c737ebb016ffc6429cc9c85040a1312f66',
      expectedRecordKind: 'GENERATION2_OWNER_CONTINUATION_DECISION',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value:
          'PHASE_2B_2D_A2_GENERATION2_WINDOW_11_P5_REVIEW_AND_WINDOW_12_CONTINUATION_DECISION_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_CADENCE_AUTHORITY',
      roles: ['CADENCE_EXECUTION_AUTHORITY'],
      generationId: GENERATION2_ID,
      windowOrdinal: 12,
    }),
    entry({
      id: 'GEN2_WINDOW_13_ADJUDICATION',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_13_EVIDENCE_ADJUDICATION_V1.json',
      sha256: '5292f878413b648cd965c3743428eccce1bab3b28620f80d0d8df67178a5dac4',
      bytes: 37514,
      commit: '79918959c44cbbabe4e3e2f665cce2b8f84bb56e',
      expectedRecordKind: 'GENERATION2_WINDOW_EVIDENCE_ADJUDICATION',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_13_EVIDENCE_ADJUDICATION_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_ADJUDICATION',
      roles: ['TERMINAL_DISPOSITION_AUTHORITY', 'HISTORICAL_REPLACEMENT_REASON_AUTHORITY'],
      generationId: GENERATION2_ID,
      windowOrdinal: 13,
    }),
    entry({
      id: 'GEN2_WINDOW_13_LIVE_RESULT',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_13_LIVE_RESULT_V1.json',
      sha256: 'a4ac8291544647bd5d740275949677858baa6239a0182c0a4fd0ed83f67b294a',
      bytes: 34707,
      commit: 'bf15fe3b9e16ffbe0a075d4464f7363a2c88b008',
      expectedRecordKind: 'GENERATION2_WINDOW_LIVE_RESULT',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_13_LIVE_RESULT_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_LIVE_RESULT',
      roles: ['ADJUDICATED_OBSERVATION_BINDING'],
      generationId: GENERATION2_ID,
      windowOrdinal: 13,
    }),
    entry({
      id: 'GEN2_WINDOW_13_LIVE_AUTHORITY',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_13_LIVE_AUTHORITY_V1.json',
      sha256: '5333451e3c8b9287a92fbab26d66571866700958a9caf54a083cda924a237669',
      bytes: 107914,
      commit: '0b9a7dabe5e720b18fcb41830fb687787b47b93f',
      expectedRecordKind: 'GENERATION2_OWNER_LIVE_AUTHORITY',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_13_LIVE_AUTHORITY_V1',
      },
      parserFamily: 'GENERATION2_WINDOW_LIVE_AUTHORITY',
      roles: ['WINDOW_EXECUTION_AUTHORITY'],
      generationId: GENERATION2_ID,
      windowOrdinal: 13,
    }),
    entry({
      id: 'GEN2_WINDOW_13_HOST_INTEGRITY_RULING',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_13_HOST_INTEGRITY_OWNER_RULING_V1.json',
      sha256: 'fc4316749f901a4f9d448f37cfd0c077a455f1809c509a65e9bc09b628b6b656',
      bytes: 33257,
      commit: '1baeaa4380c28e16646f7d4164eb6418ed835d59',
      expectedRecordKind: 'GENERATION2_OWNER_RULING',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_13_HOST_INTEGRITY_OWNER_RULING_V1',
      },
      parserFamily: 'GENERATION2_HOST_INTEGRITY_RULING',
      roles: ['HOST_RECOVERY_PROVENANCE'],
      generationId: GENERATION2_ID,
      windowOrdinal: 13,
    }),
    entry({
      id: 'METHODOLOGY_V3_HOST_RECOVERY_AMENDMENT_APPROVAL',
      path: 'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_HOST_CONFOUNDED_REVALIDATION_AMENDMENT_OWNER_APPROVAL_V1.json',
      sha256: 'e0a3c97386089e7ff862ea21a53f441506c1fe5812590ac083a4e6c11876847c',
      bytes: 11520,
      commit: '639851a423026b917c93eaed4194979ced8a08b6',
      expectedRecordKind: 'METHODOLOGY_AMENDMENT_OWNER_APPROVAL',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value:
          'PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_HOST_CONFOUNDED_REVALIDATION_AMENDMENT_OWNER_APPROVAL_V1',
      },
      parserFamily: 'METHODOLOGY_V3_HOST_RECOVERY_AMENDMENT',
      roles: ['HOST_RECOVERY_PROVENANCE'],
      generationId: null,
      windowOrdinal: null,
    }),
    entry({
      id: 'GEN2_WINDOW_13_HOST_RECOVERY_PRECONDITION',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_13_TARGETED_HOST_RECOVERY_PRECONDITION_V1.json',
      sha256: '569b7a1ca377f686413044557f896a80179325da9d3fc696936454d0807b8a8a',
      bytes: 11905,
      commit: 'a92e8ef722490cde0edabe461ce75fa42741bc27',
      expectedRecordKind: 'GENERATION2_TARGETED_HOST_RECOVERY_PRECONDITION',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_13_TARGETED_HOST_RECOVERY_PRECONDITION_V1',
      },
      parserFamily: 'GENERATION2_HOST_RECOVERY_PRECONDITION',
      roles: ['HOST_RECOVERY_PROVENANCE'],
      generationId: GENERATION2_ID,
      windowOrdinal: 13,
    }),
    entry({
      id: 'GEN2_WINDOW_13_HOST_RECOVERY_AUTHORITY',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_13_TARGETED_HOST_RECOVERY_REVALIDATION_AUTHORITY_V1.json',
      sha256: 'e0029caf48494d1ab46e6318cb851fad31c925d94893dce76de5d9a74483226e',
      bytes: 8197,
      commit: '0ba04ab6a5431ee6d5725b3912708e40951e53f9',
      expectedRecordKind: 'GENERATION2_TARGETED_HOST_RECOVERY_REVALIDATION_AUTHORITY',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value:
          'PHASE_2B_2D_A2_GENERATION2_WINDOW_13_TARGETED_HOST_RECOVERY_REVALIDATION_AUTHORITY_V1',
      },
      parserFamily: 'GENERATION2_HOST_RECOVERY_AUTHORITY',
      roles: ['HOST_RECOVERY_PROVENANCE'],
      generationId: GENERATION2_ID,
      windowOrdinal: 13,
    }),
    entry({
      id: 'GEN2_WINDOW_13_HOST_RECOVERY_RESULT',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_13_TARGETED_HOST_RECOVERY_REVALIDATION_RESULT_V1.json',
      sha256: '2692001e426bb81649c89e6e291bfac74484c1e9da318f8c8b22df2745195bdb',
      bytes: 16528,
      commit: '1a11e45a4197bf888bd629112c35de5645fc199c',
      expectedRecordKind: 'GENERATION2_TARGETED_HOST_RECOVERY_REVALIDATION_RESULT',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_13_TARGETED_HOST_RECOVERY_REVALIDATION_RESULT_V1',
      },
      parserFamily: 'GENERATION2_HOST_RECOVERY_RESULT',
      roles: ['ADJUDICATED_OBSERVATION_BINDING', 'HOST_RECOVERY_PROVENANCE'],
      generationId: GENERATION2_ID,
      windowOrdinal: 13,
    }),
    entry({
      id: 'GEN2_WINDOW_13_HOST_RECOVERY_CLOSURE_RULING',
      path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_13_TARGETED_HOST_RECOVERY_OWNER_RULING_V1.json',
      sha256: 'ee1980625906a1c4db77e8981bfb5ff339fc62290ab740cd9f6ec42e59d2d50f',
      bytes: 15450,
      commit: 'de915b1ee8e7239e9894608a30639101bb945ade',
      expectedRecordKind: 'GENERATION2_OWNER_RULING',
      expectedRecordId: null,
      expectedRecordName: {
        field: 'record',
        value: 'PHASE_2B_2D_A2_GENERATION2_WINDOW_13_TARGETED_HOST_RECOVERY_OWNER_RULING_V1',
      },
      parserFamily: 'GENERATION2_HOST_RECOVERY_CLOSURE_RULING',
      roles: ['HOST_RECOVERY_PROVENANCE'],
      generationId: GENERATION2_ID,
      windowOrdinal: 13,
    }),
  ]);

// ---------------------------------------------------------------------------
// E. THE EXPLICIT HISTORY THE REGISTRY MUST NAME.
// ---------------------------------------------------------------------------

/** Generation-2 Windows 01..13, by explicit ordinal, in replay order. */
export const GENERATION2_WINDOW_ORDINALS_V5: readonly number[] = Object.freeze([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
]);
/** The ONLY windows that executed under a cadence authority. */
export const GENERATION2_CADENCE_WINDOW_ORDINALS_V5: readonly number[] = Object.freeze([
  8, 9, 10, 12,
]);
/** Generation-1 windows decided after Governance V4's checkpoint, by explicit ordinal. */
export const GENERATION1_POST_CLOSURE_WINDOW_ORDINALS_V5: readonly number[] = Object.freeze([
  8, 9, 10, 11,
]);

const pad = (ordinal: number): string => String(ordinal).padStart(2, '0');

export function generation2WindowAdjudicationId(ordinal: number): string {
  return `GEN2_WINDOW_${pad(ordinal)}_ADJUDICATION`;
}
export function generation2WindowLiveResultId(ordinal: number): string {
  return `GEN2_WINDOW_${pad(ordinal)}_LIVE_RESULT`;
}
export function generation2WindowAuthorityId(ordinal: number): string {
  return `GEN2_WINDOW_${pad(ordinal)}_LIVE_AUTHORITY`;
}
export function generation2WindowCadenceId(ordinal: number): string {
  return `GEN2_WINDOW_${pad(ordinal)}_CADENCE_AUTHORITY`;
}
export function generation1PostClosureAdjudicationId(ordinal: number): string {
  return `GEN1_POST_CLOSURE_WINDOW_${pad(ordinal)}_ADJUDICATION`;
}
export function generation1PostClosureLiveResultId(ordinal: number): string {
  return `GEN1_POST_CLOSURE_WINDOW_${pad(ordinal)}_LIVE_RESULT`;
}

/** The registry ids that occur exactly once, outside any window. */
export const SINGLETON_IDS_V5 = Object.freeze({
  R38_CROSS_GENERATION_AUTHORITY_ADAPTER_REFUSAL: 'R38_REFUSAL_PRECONDITION',
  R38A_CROSS_GENERATION_SLOT_AUTHORITY_CONTRACT: 'R38A_CONTRACT_PRECONDITION',
  GEN2_CORPUS_FREEZE_APPROVAL: 'GENERATION2_CORPUS_FREEZE_CROSS_CHECK',
  METHODOLOGY_V3_OWNER_FREEZE_APPROVAL: 'METHODOLOGY_V3_OWNER_FREEZE',
  GEN1_TERMINAL_RECORD: 'GENERATION1_TERMINAL_RECORD',
  GEN1_TERMINAL_LEDGER: 'GENERATION1_TERMINAL_LEDGER',
  FROZEN_FRAME: 'FROZEN_FRAME',
  GEN2_SCHEDULE_PROPOSAL: 'GENERATION2_RESERVE_SCHEDULE_PROPOSAL',
  GEN2_RESERVE_SCHEDULE: 'GENERATION2_RESERVE_SCHEDULE',
  GEN2_LEDGER: 'GENERATION2_REPLACEMENT_LEDGER',
  GEN2_CARRY_FORWARD_BASELINE: 'GENERATION2_CARRY_FORWARD_BASELINE',
  GEN2_CARRY_FORWARD_FEASIBILITY: 'GENERATION2_CARRY_FORWARD_FEASIBILITY',
  GEN2_WINDOW_13_HOST_INTEGRITY_RULING: 'GENERATION2_HOST_INTEGRITY_RULING',
  METHODOLOGY_V3_HOST_RECOVERY_AMENDMENT_APPROVAL: 'METHODOLOGY_V3_HOST_RECOVERY_AMENDMENT',
  GEN2_WINDOW_13_HOST_RECOVERY_PRECONDITION: 'GENERATION2_HOST_RECOVERY_PRECONDITION',
  GEN2_WINDOW_13_HOST_RECOVERY_AUTHORITY: 'GENERATION2_HOST_RECOVERY_AUTHORITY',
  GEN2_WINDOW_13_HOST_RECOVERY_RESULT: 'GENERATION2_HOST_RECOVERY_RESULT',
  GEN2_WINDOW_13_HOST_RECOVERY_CLOSURE_RULING: 'GENERATION2_HOST_RECOVERY_CLOSURE_RULING',
} as const satisfies Readonly<Record<string, GovernanceParserFamilyV5>>);

// ---------------------------------------------------------------------------
// F. COMPOSITION PROOF.
// ---------------------------------------------------------------------------

/**
 * Path fragments naming a record kind that carries no slot authority. None
 * of them may appear in Registry V5 at all.
 */
export const NON_GOVERNANCE_PATH_TOKENS_V5 = Object.freeze([
  '_STRATEGY_',
  '_PLAN_',
  '_PRENETWORK_',
  '_STATE_SUMMARY',
  '_AUTOPILOT',
  '_OFFLINE_READINESS_',
  '_OPERATOR_KIT_',
  '_AMENDMENT_IMPLEMENTATION_',
  '_VALIDATION_',
  '_TEMPORAL_TEST_SCOPING_',
  '_INTERPRETATION_',
  '_CONCURRENCY_',
  '_MONITOR_COVERAGE_',
  '_SHAPE_CORRECTION_',
  '_CARRY_IN_',
  '_HARDENING_',
  '_DESIGN_',
  '_PROPOSAL_R',
  '_FIRST_WINDOW_',
  '_POST_FINAL_P5_',
  '_MID_WINDOW_P5_',
]);

/** Path fragments allowed ONLY to the one family that is defined by them. */
const FAMILY_EXCLUSIVE_PATH_TOKENS: Readonly<Record<string, GovernanceParserFamilyV5>> =
  Object.freeze({
    _LIVE_AUTHORITY_: 'GENERATION2_WINDOW_LIVE_AUTHORITY',
    _P5_REVIEW_: 'GENERATION2_WINDOW_CADENCE_AUTHORITY',
    _CONTINUATION_DECISION_: 'GENERATION2_WINDOW_CADENCE_AUTHORITY',
    _REVALIDATION_AUTHORITY_: 'GENERATION2_HOST_RECOVERY_AUTHORITY',
  });

const LOWER_HEX_SHA256 = /^[0-9a-f]{64}$/;
const EXACT_COMMIT = /^[0-9a-f]{40}$/;

export interface RegistryV5Composition {
  readonly registryVersion: string;
  readonly checkpointCommit: string;
  readonly reusedV4EntryCount: number;
  readonly ownEntryCount: number;
  readonly ownEntriesByParserFamily: Readonly<Record<string, number>>;
  readonly ownEntriesBySemanticRole: Readonly<Record<string, number>>;
  readonly reusedV4EntriesBySemanticRole: Readonly<Record<string, number>>;
  readonly generation2WindowOrdinals: readonly number[];
  readonly cadenceWindowOrdinals: readonly number[];
  readonly generation1PostClosureWindowOrdinals: readonly number[];
}

function count(values: readonly string[]): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const value of [...values].sort()) out[value] = (out[value] ?? 0) + 1;
  return Object.freeze(out);
}

function requireWindowed(
  own: readonly GovernanceRegistryEntryV5[],
  family: GovernanceParserFamilyV5,
  ordinals: readonly number[],
  idOf: (ordinal: number) => string,
  generationId: string,
): void {
  const found = own.filter((candidate) => candidate.parserFamily === family);
  const seen = found.map((candidate) => candidate.windowOrdinal);
  if (
    found.length !== ordinals.length ||
    ordinals.some((ordinal, index) => seen[index] !== ordinal)
  ) {
    refuseV5(
      'REGISTRY_V5_COMPOSITION_INVALID',
      `registry V5 does not name exactly the declared windows for ${family}`,
    );
  }
  found.forEach((candidate) => {
    if (candidate.id !== idOf(candidate.windowOrdinal!)) {
      refuseV5('REGISTRY_V5_COMPOSITION_INVALID', `${candidate.id} is not its window's id`);
    }
    if (candidate.generationId !== generationId) {
      refuseV5('REGISTRY_V5_COMPOSITION_INVALID', `${candidate.id} names another generation`);
    }
  });
}

/**
 * Proves Registry V5's composition: well-formed pins, no repeated id or path,
 * the reused V4 entries are exactly the declared V4 OBJECTS, every singleton
 * family exactly once, every window family exactly at its declared ordinals,
 * the cadence family at exactly Windows 8, 9, 10 and 12, and no record kind
 * that carries no slot authority anywhere.
 */
export function proveRegistryV5Composition(
  own: readonly GovernanceRegistryEntryV5[] = COMMITTED_A2_GOVERNANCE_REGISTRY_V5_ENTRIES,
  reused: readonly GovernanceRegistryEntryV4[] = REGISTRY_V5_REUSED_V4_ENTRIES,
): RegistryV5Composition {
  const ids = new Set<string>();
  const paths = new Set<string>();
  const claim = (id: string, path: string): void => {
    if (ids.has(id)) refuseV5('REGISTRY_V5_DUPLICATE_ENTRY', `${id} is registered twice`);
    if (paths.has(path)) {
      refuseV5('REGISTRY_V5_DUPLICATE_ENTRY', `${id} repeats an already-registered path`);
    }
    ids.add(id);
    paths.add(path);
  };

  if (
    reused.length !== REGISTRY_V5_REUSED_V4_IDS.length ||
    reused.some(
      (candidate, index) =>
        candidate.id !== REGISTRY_V5_REUSED_V4_IDS[index] ||
        COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES.find((v4) => v4.id === candidate.id) !==
          candidate,
    )
  ) {
    refuseV5(
      'REGISTRY_V5_COMPOSITION_INVALID',
      'the reused V4 entries are not exactly the declared Registry V4 objects',
    );
  }
  reused.forEach((candidate) => claim(candidate.id, candidate.path));

  own.forEach((candidate, index) => {
    const at = `registryV5[${String(index)}]`;
    if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
      refuseV5('REGISTRY_V5_ENTRY_MALFORMED', `${at} has no stable id`);
    }
    if (!EXACT_COMMIT.test(candidate.commit)) {
      refuseV5('REGISTRY_V5_ENTRY_MALFORMED', `${candidate.id} commit is not an exact commit`);
    }
    if (!LOWER_HEX_SHA256.test(candidate.sha256)) {
      refuseV5('REGISTRY_V5_ENTRY_MALFORMED', `${candidate.id} sha256 is not a lower-hex SHA-256`);
    }
    if (!Number.isInteger(candidate.bytes) || candidate.bytes <= 0) {
      refuseV5('REGISTRY_V5_ENTRY_MALFORMED', `${candidate.id} byte count is not positive`);
    }
    if (typeof candidate.expectedRecordKind !== 'string' || candidate.expectedRecordKind === '') {
      refuseV5('REGISTRY_V5_ENTRY_MALFORMED', `${candidate.id} has no record-kind discriminator`);
    }
    if (!(GOVERNANCE_PARSER_FAMILIES_V5 as readonly string[]).includes(candidate.parserFamily)) {
      refuseV5('REGISTRY_V5_ENTRY_MALFORMED', `${candidate.id} names an unknown parser family`);
    }
    if (
      candidate.roles.length === 0 ||
      candidate.roles.some(
        (role) => !(GOVERNANCE_SEMANTIC_ROLES_V5 as readonly string[]).includes(role),
      )
    ) {
      refuseV5('REGISTRY_V5_ENTRY_MALFORMED', `${candidate.id} declares no known semantic role`);
    }
    claim(candidate.id, candidate.path);
    if (NON_GOVERNANCE_PATH_TOKENS_V5.some((token) => candidate.path.includes(token))) {
      refuseV5(
        'REGISTRY_V5_COMPOSITION_INVALID',
        `${candidate.id} names a record kind that carries no slot authority`,
      );
    }
    for (const [token, family] of Object.entries(FAMILY_EXCLUSIVE_PATH_TOKENS)) {
      if (candidate.path.includes(token) && candidate.parserFamily !== family) {
        refuseV5(
          'REGISTRY_V5_COMPOSITION_INVALID',
          `${candidate.id} carries a ${family}-only record kind under another family`,
        );
      }
    }
  });

  for (const [id, family] of Object.entries(SINGLETON_IDS_V5)) {
    const found = own.filter((candidate) => candidate.parserFamily === family);
    if (found.length !== 1 || found[0]!.id !== id) {
      refuseV5(
        'REGISTRY_V5_COMPOSITION_INVALID',
        `registry V5 does not register ${family} exactly once, as ${id}`,
      );
    }
  }
  requireWindowed(
    own,
    'GENERATION2_WINDOW_ADJUDICATION',
    GENERATION2_WINDOW_ORDINALS_V5,
    generation2WindowAdjudicationId,
    GENERATION2_ID,
  );
  requireWindowed(
    own,
    'GENERATION2_WINDOW_LIVE_RESULT',
    GENERATION2_WINDOW_ORDINALS_V5,
    generation2WindowLiveResultId,
    GENERATION2_ID,
  );
  requireWindowed(
    own,
    'GENERATION2_WINDOW_LIVE_AUTHORITY',
    GENERATION2_WINDOW_ORDINALS_V5,
    generation2WindowAuthorityId,
    GENERATION2_ID,
  );
  requireWindowed(
    own,
    'GENERATION2_WINDOW_CADENCE_AUTHORITY',
    GENERATION2_CADENCE_WINDOW_ORDINALS_V5,
    generation2WindowCadenceId,
    GENERATION2_ID,
  );
  requireWindowed(
    own,
    'GENERATION1_POST_CLOSURE_WINDOW_ADJUDICATION',
    GENERATION1_POST_CLOSURE_WINDOW_ORDINALS_V5,
    generation1PostClosureAdjudicationId,
    GENERATION1_ID,
  );
  requireWindowed(
    own,
    'GENERATION1_POST_CLOSURE_WINDOW_LIVE_RESULT',
    GENERATION1_POST_CLOSURE_WINDOW_ORDINALS_V5,
    generation1PostClosureLiveResultId,
    GENERATION1_ID,
  );

  const checkpoint = own.find((candidate) => candidate.id === 'GEN2_CORPUS_FREEZE_APPROVAL')!;
  if (
    checkpoint.commit !== COMMITTED_A2_GOVERNANCE_CHECKPOINT_V5 ||
    checkpoint.path !== TERMINAL_A2_CHECKPOINT_RECORD_V5.path ||
    checkpoint.sha256 !== TERMINAL_A2_CHECKPOINT_RECORD_V5.sha256 ||
    checkpoint.bytes !== TERMINAL_A2_CHECKPOINT_RECORD_V5.bytes
  ) {
    refuseV5(
      'REGISTRY_V5_CHECKPOINT_MISMATCH',
      'the registered terminal freeze is not the exact checkpoint record',
    );
  }

  return Object.freeze({
    registryVersion: COMMITTED_A2_GOVERNANCE_REGISTRY_V5,
    checkpointCommit: COMMITTED_A2_GOVERNANCE_CHECKPOINT_V5,
    reusedV4EntryCount: reused.length,
    ownEntryCount: own.length,
    ownEntriesByParserFamily: count(own.map((candidate) => candidate.parserFamily)),
    ownEntriesBySemanticRole: count(own.flatMap((candidate) => [...candidate.roles])),
    reusedV4EntriesBySemanticRole: count(reused.flatMap((candidate) => [...candidate.roles])),
    generation2WindowOrdinals: GENERATION2_WINDOW_ORDINALS_V5,
    cadenceWindowOrdinals: GENERATION2_CADENCE_WINDOW_ORDINALS_V5,
    generation1PostClosureWindowOrdinals: GENERATION1_POST_CLOSURE_WINDOW_ORDINALS_V5,
  });
}
