/**
 * PHASE 2B-2D — A3 R32: COMMITTED A2 GOVERNANCE REGISTRY, VERSION 4.
 *
 * ONE QUESTION
 *
 *   Which EXACT committed bytes - named by commit, path, SHA-256 and length -
 *   is the V4 snapshot allowed to interpret?
 *
 * WHAT THIS FILE IS, AND IS NOT
 *
 *   It is Registry V3's logical entries, REUSED BY REFERENCE, with exactly one
 *   binding replaced (the replacement ledger, by its thirty-entry revision)
 *   and exactly the entries below added: every later terminal adjudication a
 *   CURRENT or REPLACED occupant's disposition depends on, the LIVE_RESULT
 *   each current fact binds, the SD9 reconciliation that corrected two pending
 *   slots, and the A2 run-provenance closure. It means "the exact committed
 *   governance state through that closure", pinned to
 *   `COMMITTED_A2_GOVERNANCE_CHECKPOINT_V4` forever. It does NOT mean "latest
 *   A2": a later A2 checkpoint requires a later registry version. No glob, no
 *   enumeration, no branch, no newest anything.
 *
 *   Strategies, plans, live authorities, pre-network assignments, P5 reviews,
 *   autopilot and resume decisions, operator interpretations, operational
 *   rules and the unused post-reconciliation acquisition authority all took
 *   part in A2 execution governance, but none of them carries a terminal slot
 *   disposition, so none is registered. The ledger rows the pre-network
 *   assignments appended are registered through the ledger itself, at its
 *   exact committed revision.
 *
 * GIT IS A BYTE TRANSPORT HERE, NEVER AN AUTHORITY
 *
 *   This registry decides which bytes are governance. Git only supplies bytes
 *   already named by exact commit and path, through R25's unchanged
 *   commit-addressed primitives, and those bytes are re-hashed and re-counted
 *   before anything reads them.
 *
 * THIS MODULE IS PURE DATA. It opens nothing.
 */
import { GOVERNANCE_SEMANTIC_ROLES } from '../a3governance/registryV1.js';
import {
  COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES,
  GOVERNANCE_PARSER_FAMILIES_V3,
  REPLACEMENT_LEDGER_REGISTRY_ID,
  type GovernanceRegistryEntryV3,
} from '../a3governanceV3/registryV3.js';
import { refuseV4 } from './refusal.js';

// ---------------------------------------------------------------------------
// A. THE CHECKPOINT THIS REGISTRY DESCRIBES.
// ---------------------------------------------------------------------------

export const COMMITTED_A2_GOVERNANCE_REGISTRY_V4 = 'COMMITTED_A2_GOVERNANCE_REGISTRY_V4';

/** The exact, provenance-closed A2 commit Registry V4 describes. Not a branch. */
export const COMMITTED_A2_GOVERNANCE_CHECKPOINT_V4 = '67ae047fb7de079bcba0eec83ca4f4baee77cc3e';

// ---------------------------------------------------------------------------
// B. PARSER FAMILIES AND ROLES.
// ---------------------------------------------------------------------------

/** Full-run-reference window adjudication whose whole plan executed. */
export const FULL_WINDOW_FAMILY = 'FULL_RUN_REFERENCE_WINDOW_EVIDENCE_ADJUDICATION';
/** Window adjudications that published only a 16-hex run-reference PREFIX. */
export const PREFIX_ERA_WINDOW_FAMILY = 'PREFIX_ERA_WINDOW_EVIDENCE_ADJUDICATION';
/** An owner resolution of prefix-era PENDING_CAPABILITY_REVIEW items. */
export const CAPABILITY_REVIEW_RESOLUTION_FAMILY = 'PENDING_CAPABILITY_REVIEW_RESOLUTION';
/** The Q1 window adjudicated offline, whose items state their Q3 obligation reason. */
export const Q1_OFFLINE_WINDOW_FAMILY = 'Q1_OFFLINE_WINDOW_EVIDENCE_ADJUDICATION';
/** The Q1 window whose two address-policy refusals were HELD, not adjudicated. */
export const Q1_HELD_WINDOW_FAMILY = 'Q1_HELD_WINDOW_EVIDENCE_ADJUDICATION';
/** The compliant-vantage revalidation that resolved the held items. */
export const TARGETED_VANTAGE_RECOVERY_FAMILY = 'TARGETED_VANTAGE_RECOVERY_EVIDENCE_ADJUDICATION';
/** The post-vantage-recovery ordinary windows 03 through 07. */
export const ORDINARY_WINDOW_FAMILY = 'POST_VANTAGE_ORDINARY_WINDOW_EVIDENCE_ADJUDICATION';
/** A targeted policy revalidation that renewed ONE replaced occupant's reason. */
export const TARGETED_POLICY_REVALIDATION_FAMILY =
  'TARGETED_POLICY_REVALIDATION_REASON_ADJUDICATION';
/** The final ordinary window, with an explicit PENDING outcome. */
export const FINAL_ORDINARY_WINDOW_FAMILY = 'FINAL_ORDINARY_WINDOW_EVIDENCE_ADJUDICATION';
/** The generation-wide SD9 extractable-text reconciliation. */
export const SD9_RECONCILIATION_FAMILY = 'SD9_EXTRACTABLE_TEXT_GENERATION_RECONCILIATION';
/** The A2 current-terminal run-provenance closure. Carries no disposition. */
export const RUN_PROVENANCE_CLOSURE_FAMILY = 'A2_TERMINAL_RUN_PROVENANCE_CLOSURE';

export const GOVERNANCE_PARSER_FAMILIES_V4 = Object.freeze([
  ...GOVERNANCE_PARSER_FAMILIES_V3,
  FULL_WINDOW_FAMILY,
  PREFIX_ERA_WINDOW_FAMILY,
  CAPABILITY_REVIEW_RESOLUTION_FAMILY,
  Q1_OFFLINE_WINDOW_FAMILY,
  Q1_HELD_WINDOW_FAMILY,
  TARGETED_VANTAGE_RECOVERY_FAMILY,
  ORDINARY_WINDOW_FAMILY,
  TARGETED_POLICY_REVALIDATION_FAMILY,
  FINAL_ORDINARY_WINDOW_FAMILY,
  SD9_RECONCILIATION_FAMILY,
  RUN_PROVENANCE_CLOSURE_FAMILY,
] as const);
export type GovernanceParserFamilyV4 = (typeof GOVERNANCE_PARSER_FAMILIES_V4)[number];

/**
 * The one role V4 adds: a record that SUPPLIES a full run reference for a
 * fact whose disposition authority is another record. It is never a
 * disposition authority by itself.
 */
export const RUN_REFERENCE_PROVENANCE_SUPPLEMENT = 'RUN_REFERENCE_PROVENANCE_SUPPLEMENT';

export const GOVERNANCE_SEMANTIC_ROLES_V4 = Object.freeze([
  ...GOVERNANCE_SEMANTIC_ROLES,
  RUN_REFERENCE_PROVENANCE_SUPPLEMENT,
] as const);
export type GovernanceSemanticRoleV4 = (typeof GOVERNANCE_SEMANTIC_ROLES_V4)[number];

export interface GovernanceRegistryEntryV4 {
  readonly id: string;
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
  /** The exact commit the bytes are READ FROM. Not a date, not a branch. */
  readonly commit: string;
  readonly expectedRecordKind: string | null;
  readonly expectedRecordId: string | null;
  readonly parserFamily: GovernanceParserFamilyV4;
  readonly roles: readonly GovernanceSemanticRoleV4[];
}

function entry(value: GovernanceRegistryEntryV4): GovernanceRegistryEntryV4 {
  return Object.freeze({ ...value, roles: Object.freeze([...value.roles]) });
}

const OBSERVATION = 'ADJUDICATED_OBSERVATION_RECORD' as const;
const OBSERVATION_ROLES = ['ADJUDICATED_OBSERVATION_BINDING'] as const;
const TERMINAL_ROLES = ['TERMINAL_DISPOSITION_AUTHORITY'] as const;

// ---------------------------------------------------------------------------
// C. THE ONE REPLACED BINDING.
// ---------------------------------------------------------------------------

export { REPLACEMENT_LEDGER_REGISTRY_ID };

/**
 * The thirty-entry revision of the SAME ledger path, last written pre-network
 * at `e5e4d51` (reserves 28 and 29) and byte-identical through the
 * checkpoint. Its family is a V1 family.
 */
const REPLACEMENT_LEDGER_V4_ENTRY: GovernanceRegistryEntryV4 = entry({
  id: REPLACEMENT_LEDGER_REGISTRY_ID,
  path: 'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_RESERVE_REPLACEMENT_LEDGER_V2_GEN1.json',
  sha256: '40775b28745f25edd0132c6142495c79f2fdaa6357f1575f963eea640d84c893',
  bytes: 23205,
  commit: 'e5e4d513b60362e9b32c7cb4d3fd7b0f859d5521',
  expectedRecordKind: 'RESERVE_REPLACEMENT_LEDGER_V2_GEN1',
  expectedRecordId: null,
  parserFamily: 'RESERVE_REPLACEMENT_LEDGER',
  roles: ['OCCUPANT_CHAIN_AUTHORITY'],
});

/**
 * The ledger's own recomputed hash and entry count at that revision. Byte
 * identity pins checked AFTER the canonical validator runs - never a
 * substitute for it.
 */
export const REPLACEMENT_LEDGER_V4_PIN = Object.freeze({
  ledgerHash: '64e9848427baf8ed7d3329becb4fcca66b1f581e5bc6d91a409f4c0139e9cff0',
  entryCount: 30,
});

// ---------------------------------------------------------------------------
// D. THE ADDED ENTRIES, IN COMMIT ORDER.
// ---------------------------------------------------------------------------

export const V4_IDS = Object.freeze({
  POST_P29_P30_LIVE_RESULT: 'POST_P29_P30_CONTINUATION_LIVE_RESULT',
  POST_P29_P30_ADJUDICATION: 'POST_P29_P30_CONTINUATION_EVIDENCE_ADJUDICATION',
  POST_P29_P30_NEXT_LIVE_RESULT: 'POST_P29_P30_NEXT_CONTINUATION_LIVE_RESULT',
  POST_P29_P30_NEXT_ADJUDICATION: 'POST_P29_P30_NEXT_CONTINUATION_EVIDENCE_ADJUDICATION',
  CHILD_A_LIVE_RESULT: 'CHILD_WINDOW_A_LIVE_RESULT',
  CHILD_A_ADJUDICATION: 'CHILD_WINDOW_A_EVIDENCE_ADJUDICATION',
  CHILD_B_LIVE_RESULT: 'CHILD_WINDOW_B_LIVE_RESULT',
  CHILD_B_ADJUDICATION: 'CHILD_WINDOW_B_EVIDENCE_ADJUDICATION',
  CHILD_C_LIVE_RESULT: 'CHILD_WINDOW_C_LIVE_RESULT',
  CHILD_C_ADJUDICATION: 'CHILD_WINDOW_C_PARTIAL_EVIDENCE_ADJUDICATION',
  CHILD_C_CAPABILITY_REVIEW_RESOLUTION: 'CHILD_WINDOW_C_CAPABILITY_REVIEW_RESOLUTION',
  D1_LIVE_RESULT: 'RECOVERY_WINDOW_D1_LIVE_RESULT',
  D1_ADJUDICATION: 'RECOVERY_WINDOW_D1_PARTIAL_EVIDENCE_ADJUDICATION',
  Q1_W01_LIVE_RESULT: 'Q1_WINDOW_01_LIVE_RESULT',
  Q1_W01_ADJUDICATION: 'Q1_WINDOW_01_EVIDENCE_ADJUDICATION',
  Q1_W02_LIVE_RESULT: 'Q1_WINDOW_02_LIVE_RESULT',
  Q1_W02_ADJUDICATION: 'Q1_WINDOW_02_EVIDENCE_ADJUDICATION',
  VANTAGE_RECOVERY_LIVE_RESULT: 'TARGETED_VANTAGE_RECOVERY_LIVE_RESULT',
  VANTAGE_RECOVERY_ADJUDICATION: 'TARGETED_VANTAGE_RECOVERY_EVIDENCE_ADJUDICATION',
  W03_LIVE_RESULT: 'WINDOW_03_LIVE_RESULT',
  W03_ADJUDICATION: 'WINDOW_03_EVIDENCE_ADJUDICATION',
  W04_LIVE_RESULT: 'WINDOW_04_LIVE_RESULT',
  W04_ADJUDICATION: 'WINDOW_04_EVIDENCE_ADJUDICATION',
  W05_LIVE_RESULT: 'WINDOW_05_LIVE_RESULT',
  W05_ADJUDICATION: 'WINDOW_05_EVIDENCE_ADJUDICATION',
  W06_LIVE_RESULT: 'WINDOW_06_LIVE_RESULT',
  W06_ADJUDICATION: 'WINDOW_06_EVIDENCE_ADJUDICATION',
  W07_LIVE_RESULT: 'WINDOW_07_LIVE_RESULT',
  W07_ADJUDICATION: 'WINDOW_07_EVIDENCE_ADJUDICATION',
  V7_REVALIDATION_ADJUDICATION: 'SLOT66_V7_TARGETED_REVALIDATION_ADJUDICATION',
  FINAL_LIVE_RESULT: 'FINAL_ORDINARY_WINDOW_LIVE_RESULT',
  FINAL_ADJUDICATION: 'FINAL_ORDINARY_WINDOW_EVIDENCE_ADJUDICATION',
  SD9_RECONCILIATION: 'SD9_EXTRACTABLE_TEXT_RECONCILIATION',
  PROVENANCE_CLOSURE: 'CURRENT_TERMINAL_RUN_PROVENANCE_CLOSURE',
} as const);

const ADDED_ENTRIES: readonly GovernanceRegistryEntryV4[] = Object.freeze([
  entry({
    id: V4_IDS.POST_P29_P30_LIVE_RESULT,
    path: 'docs/evaluation/PHASE_2B_2D_A2_POST_P29_P30_REPLACEMENT_AND_PRIMARY_CONTINUATION_LIVE_RESULT_V1.json',
    sha256: '349f44235bfb69b9def23d6c5d0b98def0d3fc409ed44ea97722962bc72b0e23',
    bytes: 76705,
    commit: '1e92d01309c5a740a6d0c7ad324c0cd2ba3437a3',
    expectedRecordKind: 'LIVE_WINDOW_RESULT_EVIDENCE_PENDING_ADJUDICATION',
    expectedRecordId:
      'phase2b-2d-a2-post-p29-p30-replacement-and-primary-continuation-live-result-v1',
    parserFamily: OBSERVATION,
    roles: OBSERVATION_ROLES,
  }),
  entry({
    id: V4_IDS.POST_P29_P30_ADJUDICATION,
    path: 'docs/evaluation/PHASE_2B_2D_A2_POST_P29_P30_REPLACEMENT_AND_PRIMARY_CONTINUATION_EVIDENCE_ADJUDICATION_V1.json',
    sha256: 'bf6219ac649241b8234c684ea97a3f3441a09c81216daeaabf4aa058c682aed8',
    bytes: 83865,
    commit: 'bbe7ddcf91b8d68d45d1f822fc8ccde4534e9bf9',
    expectedRecordKind: 'LIVE_WINDOW_EVIDENCE_ADJUDICATION',
    expectedRecordId:
      'phase2b-2d-a2-post-p29-p30-replacement-and-primary-continuation-evidence-adjudication-v1',
    parserFamily: FULL_WINDOW_FAMILY,
    roles: TERMINAL_ROLES,
  }),
  entry({
    id: V4_IDS.POST_P29_P30_NEXT_LIVE_RESULT,
    path: 'docs/evaluation/PHASE_2B_2D_A2_POST_P29_P30_REPLACEMENT_AND_PRIMARY_CONTINUATION_NEXT_LIVE_RESULT_V1.json',
    sha256: 'be1ea66065e2ee6d68c381dc795bfaddd633475a20236f2da4d2e778eafd19c2',
    bytes: 49078,
    commit: '6f52db74bf8e9bc9bc51b4fcc55a6ebb5edf0e75',
    expectedRecordKind: 'LIVE_WINDOW_RESULT_EVIDENCE_PENDING_ADJUDICATION',
    expectedRecordId:
      'phase2b-2d-a2-post-p29-p30-replacement-and-primary-continuation-next-live-result-v1',
    parserFamily: OBSERVATION,
    roles: OBSERVATION_ROLES,
  }),
  entry({
    id: V4_IDS.POST_P29_P30_NEXT_ADJUDICATION,
    path: 'docs/evaluation/PHASE_2B_2D_A2_POST_P29_P30_REPLACEMENT_AND_PRIMARY_CONTINUATION_NEXT_EVIDENCE_ADJUDICATION_V1.json',
    sha256: 'f16b667d38c3b1afec09ede9a40320b9d8491b07a8ce039e565afb13344fc895',
    bytes: 51309,
    commit: 'c05bba9e48b7c5bc1d574b997cff68fefd62260a',
    expectedRecordKind: 'LIVE_WINDOW_EVIDENCE_ADJUDICATION',
    expectedRecordId:
      'phase2b-2d-a2-post-p29-p30-replacement-and-primary-continuation-next-evidence-adjudication-v1',
    parserFamily: PREFIX_ERA_WINDOW_FAMILY,
    roles: ['TERMINAL_DISPOSITION_AUTHORITY', 'HISTORICAL_REPLACEMENT_REASON_AUTHORITY'],
  }),
  entry({
    id: V4_IDS.CHILD_A_LIVE_RESULT,
    path: 'docs/evaluation/PHASE_2B_2D_A2_AUTOPILOT_CHILD_WINDOW_A_P41_P45_LIVE_RESULT_V1.json',
    sha256: '53730c93fce69194ac1ec4b7db94ed6bd9f8fef7386d6822ab4747f5d4e01067',
    bytes: 64840,
    commit: '4834ced688456c73e54c454ccdfd12b7fa2fdf4c',
    expectedRecordKind: 'LIVE_WINDOW_RESULT_EVIDENCE_PENDING_ADJUDICATION',
    expectedRecordId: 'phase2b-2d-a2-autopilot-child-window-a-p41-p45-live-result-v1',
    parserFamily: OBSERVATION,
    roles: OBSERVATION_ROLES,
  }),
  entry({
    id: V4_IDS.CHILD_A_ADJUDICATION,
    path: 'docs/evaluation/PHASE_2B_2D_A2_AUTOPILOT_CHILD_WINDOW_A_P41_P45_EVIDENCE_ADJUDICATION_V1.json',
    sha256: '95161e6d4845ba94912fdb9feeb1de2bb2848e01273e19118949e236728f19a8',
    bytes: 49068,
    commit: '5050e7eb4103e2b8c132cee9b064a27b062424c2',
    expectedRecordKind: 'LIVE_WINDOW_EVIDENCE_ADJUDICATION',
    expectedRecordId: 'phase2b-2d-a2-autopilot-child-window-a-p41-p45-evidence-adjudication-v1',
    parserFamily: PREFIX_ERA_WINDOW_FAMILY,
    roles: ['TERMINAL_DISPOSITION_AUTHORITY', 'HISTORICAL_REPLACEMENT_REASON_AUTHORITY'],
  }),
  entry({
    id: V4_IDS.CHILD_B_LIVE_RESULT,
    path: 'docs/evaluation/PHASE_2B_2D_A2_POST_P5_CONTINUATION_CHILD_WINDOW_B_P46_P50_LIVE_RESULT_V1.json',
    sha256: 'bfa95a3ca67190259f48ac03540b8157fd771506a8bcdb666b26e6aa13e2c3a1',
    bytes: 61339,
    commit: '563707875d22611426a846a7ebbd96b80da033ef',
    expectedRecordKind: 'LIVE_WINDOW_RESULT_EVIDENCE_PENDING_ADJUDICATION',
    expectedRecordId: 'phase2b-2d-a2-post-p5-continuation-child-window-b-p46-p50-live-result-v1',
    parserFamily: OBSERVATION,
    roles: OBSERVATION_ROLES,
  }),
  entry({
    id: V4_IDS.CHILD_B_ADJUDICATION,
    path: 'docs/evaluation/PHASE_2B_2D_A2_POST_P5_CONTINUATION_CHILD_WINDOW_B_P46_P50_EVIDENCE_ADJUDICATION_V1.json',
    sha256: '47e3c1c119fc534e8caa5b45b7f2ea02f3dbbb5e2bbea3d9a27c6fcb2dfbd801',
    bytes: 46467,
    commit: 'a417bea48ba64350c8e12a607f3775769c131973',
    expectedRecordKind: 'LIVE_WINDOW_EVIDENCE_ADJUDICATION',
    expectedRecordId:
      'phase2b-2d-a2-post-p5-continuation-child-window-b-p46-p50-evidence-adjudication-v1',
    parserFamily: PREFIX_ERA_WINDOW_FAMILY,
    roles: TERMINAL_ROLES,
  }),
  entry({
    id: V4_IDS.CHILD_C_LIVE_RESULT,
    path: 'docs/evaluation/PHASE_2B_2D_A2_POST_P5_CONTINUATION_CHILD_WINDOW_C_P51_P55_LIVE_RESULT_V1.json',
    sha256: '7f93c1c4da2b9c37562bbeed6fbf853af9fef774adf7939171822c499dd9a3ca',
    bytes: 60721,
    commit: '1d17e515d6cdfdb6ba81c70f17619ef7e4e55239',
    expectedRecordKind: 'LIVE_WINDOW_RESULT_EVIDENCE_PENDING_ADJUDICATION',
    expectedRecordId: 'phase2b-2d-a2-post-p5-continuation-child-window-c-p51-p55-live-result-v1',
    parserFamily: OBSERVATION,
    roles: OBSERVATION_ROLES,
  }),
  entry({
    id: V4_IDS.CHILD_C_ADJUDICATION,
    path: 'docs/evaluation/PHASE_2B_2D_A2_POST_P5_CONTINUATION_CHILD_WINDOW_C_P51_P55_EVIDENCE_ADJUDICATION_V1.json',
    sha256: '936dd38c1ed16c6580d44d50d1d2a36d6760999c455c3d22937e42dc3b7c4520',
    bytes: 48349,
    commit: 'b4f7be9302a006d0b0a6f61c2895333a9f886208',
    expectedRecordKind: 'LIVE_WINDOW_EVIDENCE_PARTIAL_ADJUDICATION',
    expectedRecordId:
      'phase2b-2d-a2-post-p5-continuation-child-window-c-p51-p55-evidence-adjudication-v1',
    parserFamily: PREFIX_ERA_WINDOW_FAMILY,
    roles: TERMINAL_ROLES,
  }),
  entry({
    id: V4_IDS.CHILD_C_CAPABILITY_REVIEW_RESOLUTION,
    path: 'docs/evaluation/PHASE_2B_2D_A2_POST_CHILD_WINDOW_C_ADDRESS_POLICY_REFUSAL_CAPABILITY_REVIEW_RESOLUTION_V1.json',
    sha256: '72ae3ed8e4c4c790650c674482c75b976e3bcd848f9e07feb339d48a11c2b6ad',
    bytes: 33363,
    commit: '8957eac7ee7952355cd0881f0e97d95ba4ec752c',
    expectedRecordKind: 'OWNER_CAPABILITY_REVIEW_RESOLUTION',
    expectedRecordId:
      'phase2b-2d-a2-post-child-window-c-address-policy-refusal-capability-review-resolution-v1',
    parserFamily: CAPABILITY_REVIEW_RESOLUTION_FAMILY,
    roles: ['HISTORICAL_REPLACEMENT_REASON_AUTHORITY'],
  }),
  entry({
    id: V4_IDS.D1_LIVE_RESULT,
    path: 'docs/evaluation/PHASE_2B_2D_A2_POST_CHILD_WINDOW_C_RECOVERY_WINDOW_D1_P55_P59_LIVE_RESULT_V1.json',
    sha256: 'fb9336dc200b8e8e69ac44dc6ed575828bcaf95e61582a2d03266a77e8bf9e54',
    bytes: 61954,
    commit: '097bff027d6dfcd2e8b1a757e0eb7c0b27459477',
    expectedRecordKind: 'LIVE_WINDOW_RESULT',
    expectedRecordId: 'phase2b-2d-a2-post-child-window-c-recovery-window-d1-p55-p59-live-result-v1',
    parserFamily: OBSERVATION,
    roles: OBSERVATION_ROLES,
  }),
  entry({
    id: V4_IDS.D1_ADJUDICATION,
    path: 'docs/evaluation/PHASE_2B_2D_A2_POST_CHILD_WINDOW_C_RECOVERY_WINDOW_D1_P55_P59_EVIDENCE_ADJUDICATION_V1.json',
    sha256: 'b042a8798ec47037e694b5c2b0176e7ee8f2f044063e259a5a245365722f4b73',
    bytes: 57858,
    commit: 'ef0820f84c4e668c427b9750a0fbd34c70e74cdc',
    expectedRecordKind: 'LIVE_WINDOW_EVIDENCE_PARTIAL_ADJUDICATION',
    expectedRecordId:
      'phase2b-2d-a2-post-child-window-c-recovery-window-d1-p55-p59-evidence-adjudication-v1',
    parserFamily: PREFIX_ERA_WINDOW_FAMILY,
    roles: TERMINAL_ROLES,
  }),
  entry({
    id: V4_IDS.Q1_W01_LIVE_RESULT,
    path: 'docs/evaluation/PHASE_2B_2D_A2_POST_P6_Q1_WINDOW_01_LIVE_RESULT_V1.json',
    sha256: '3612e2bf373d55c3d52d1cb1216d8cd7430e836be8dc793e9a86b7ee7da45e1a',
    bytes: 29521,
    commit: '973bbfc8655cabed88ec2ffa43e74035bc30eaa5',
    expectedRecordKind: 'LIVE_WINDOW_RESULT_EVIDENCE_PENDING_ADJUDICATION',
    expectedRecordId: 'phase2b-2d-a2-post-p6-q1-window-01-live-result-v1',
    parserFamily: OBSERVATION,
    roles: OBSERVATION_ROLES,
  }),
  entry({
    id: V4_IDS.Q1_W01_ADJUDICATION,
    path: 'docs/evaluation/PHASE_2B_2D_A2_POST_P6_Q1_WINDOW_01_EVIDENCE_ADJUDICATION_V1.json',
    sha256: '3fdb09dafa0a1d01543ae09884bb022c632af8b7e89431a4d7150896a4dbb403',
    bytes: 25358,
    commit: '72bdfbe075cf856fa77f42e083ca7a594c2f99a8',
    expectedRecordKind: 'OFFLINE_EVIDENCE_ADJUDICATION',
    expectedRecordId: 'phase2b-2d-a2-post-p6-q1-window-01-evidence-adjudication-v1',
    parserFamily: Q1_OFFLINE_WINDOW_FAMILY,
    roles: ['TERMINAL_DISPOSITION_AUTHORITY', 'HISTORICAL_REPLACEMENT_REASON_AUTHORITY'],
  }),
  entry({
    id: V4_IDS.Q1_W02_LIVE_RESULT,
    path: 'docs/evaluation/PHASE_2B_2D_A2_POST_P6_Q1_WINDOW_02_LIVE_RESULT_V1.json',
    sha256: 'c83c4dba0252fe42ca7e643d814075f26da22ece24da43be3623538f21ed9d9c',
    bytes: 34523,
    commit: 'ae25bab3efe744a468c74f07252a96fb0d6cc637',
    expectedRecordKind: 'LIVE_WINDOW_RESULT_EVIDENCE_PENDING_ADJUDICATION',
    expectedRecordId: 'phase2b-2d-a2-post-p6-q1-window-02-live-result-v1',
    parserFamily: OBSERVATION,
    roles: OBSERVATION_ROLES,
  }),
  entry({
    id: V4_IDS.Q1_W02_ADJUDICATION,
    path: 'docs/evaluation/PHASE_2B_2D_A2_POST_P6_Q1_WINDOW_02_EVIDENCE_ADJUDICATION_V1.json',
    sha256: 'd42bcc8ddaec933246ae319aa49a15e872a209eff959ad6aa2d006d2f5248836',
    bytes: 25755,
    commit: 'd1afd083f6fbcfdad3a01a6e878ca80bfd4d4715',
    expectedRecordKind: 'ACQUISITION_EVIDENCE_ADJUDICATION',
    expectedRecordId: 'phase2b-2d-a2-post-p6-q1-window-02-evidence-adjudication-v1',
    parserFamily: Q1_HELD_WINDOW_FAMILY,
    roles: TERMINAL_ROLES,
  }),
  entry({
    id: V4_IDS.VANTAGE_RECOVERY_LIVE_RESULT,
    path: 'docs/evaluation/PHASE_2B_2D_A2_POST_Q1_WINDOW_02_TARGETED_VANTAGE_RECOVERY_LIVE_RESULT_V1.json',
    sha256: '97c6e1bef26cc36be9ffa23c2fab6e7eef113a6caf41cfa30ddcdd04fb09296c',
    bytes: 22957,
    commit: '5d4f4becf5c5dd5d1d06994e3af531d211c5fa94',
    expectedRecordKind: 'LIVE_ACQUISITION_RESULT',
    expectedRecordId: 'phase2b-2d-a2-post-q1-window-02-targeted-vantage-recovery-live-result-v1',
    parserFamily: OBSERVATION,
    roles: OBSERVATION_ROLES,
  }),
  entry({
    id: V4_IDS.VANTAGE_RECOVERY_ADJUDICATION,
    path: 'docs/evaluation/PHASE_2B_2D_A2_POST_Q1_WINDOW_02_TARGETED_VANTAGE_RECOVERY_EVIDENCE_ADJUDICATION_V1.json',
    sha256: '236b71f45b1127ff6569c0c7339ee5859e180913ac2fd2aedcbe8087f8326681',
    bytes: 29114,
    commit: 'cdda77d0653db460898d806bfe0667d5aeb7c09c',
    expectedRecordKind: 'OWNER_EVIDENCE_ADJUDICATION',
    expectedRecordId:
      'phase2b-2d-a2-post-q1-window-02-targeted-vantage-recovery-evidence-adjudication-v1',
    parserFamily: TARGETED_VANTAGE_RECOVERY_FAMILY,
    roles: [
      'TERMINAL_DISPOSITION_AUTHORITY',
      'RUN_SUPERSESSION_AUTHORITY',
      'HISTORICAL_REPLACEMENT_REASON_AUTHORITY',
    ],
  }),
  entry({
    id: V4_IDS.W03_LIVE_RESULT,
    path: 'docs/evaluation/PHASE_2B_2D_A2_POST_VANTAGE_RECOVERY_WINDOW_03_LIVE_RESULT_V1.json',
    sha256: 'b72e8557f3fc5090565624fba242028c3bdfe8205a2a1d1748c9aeacd85de391',
    bytes: 33629,
    commit: '0469b3f0118db8bb057b3a9f9ab9302de8a0985b',
    expectedRecordKind: 'LIVE_WINDOW_RESULT_EVIDENCE_PENDING_ADJUDICATION',
    expectedRecordId: 'phase2b-2d-a2-post-vantage-recovery-window-03-live-result-v1',
    parserFamily: OBSERVATION,
    roles: OBSERVATION_ROLES,
  }),
  entry({
    id: V4_IDS.W03_ADJUDICATION,
    path: 'docs/evaluation/PHASE_2B_2D_A2_POST_VANTAGE_RECOVERY_WINDOW_03_EVIDENCE_ADJUDICATION_V1.json',
    sha256: '6273166d91ac4ed07d937411b72de2a791cf60e9ab05fd6c7ac7e5e40b8e2fc8',
    bytes: 19534,
    commit: '63d95cd1b2fd96e915cb3400cd3931c78221ca64',
    expectedRecordKind: 'LIVE_WINDOW_EVIDENCE_ADJUDICATION',
    expectedRecordId: 'phase2b-2d-a2-post-vantage-recovery-window-03-evidence-adjudication-v1',
    parserFamily: ORDINARY_WINDOW_FAMILY,
    roles: ['TERMINAL_DISPOSITION_AUTHORITY', 'HISTORICAL_REPLACEMENT_REASON_AUTHORITY'],
  }),
  entry({
    id: V4_IDS.W04_LIVE_RESULT,
    path: 'docs/evaluation/PHASE_2B_2D_A2_POST_VANTAGE_RECOVERY_WINDOW_04_LIVE_RESULT_V1.json',
    sha256: 'fd07cbd949e0c7db87b1bbc76f3190d44fb0a93fd9218ed674f3e97c7effba64',
    bytes: 24916,
    commit: 'e9a99c3434f09b3cadc0700a84a47cda26fd2e80',
    expectedRecordKind: 'LIVE_WINDOW_RESULT_EVIDENCE_PENDING_ADJUDICATION',
    expectedRecordId: 'phase2b-2d-a2-post-vantage-recovery-window-04-live-result-v1',
    parserFamily: OBSERVATION,
    roles: OBSERVATION_ROLES,
  }),
  entry({
    id: V4_IDS.W04_ADJUDICATION,
    path: 'docs/evaluation/PHASE_2B_2D_A2_POST_VANTAGE_RECOVERY_WINDOW_04_EVIDENCE_ADJUDICATION_V1.json',
    sha256: '58f9fe2b1ea57754bc20247875b9e44951808ccf622c3044bf113f2c1403f70a',
    bytes: 19977,
    commit: 'f44689b7e01f35aae4979172d12c474cc18dcd69',
    expectedRecordKind: 'LIVE_WINDOW_EVIDENCE_ADJUDICATION',
    expectedRecordId: 'phase2b-2d-a2-post-vantage-recovery-window-04-evidence-adjudication-v1',
    parserFamily: ORDINARY_WINDOW_FAMILY,
    roles: ['TERMINAL_DISPOSITION_AUTHORITY', 'HISTORICAL_REPLACEMENT_REASON_AUTHORITY'],
  }),
  entry({
    id: V4_IDS.W05_LIVE_RESULT,
    path: 'docs/evaluation/PHASE_2B_2D_A2_POST_WINDOW_04_WINDOW_05_LIVE_RESULT_V1.json',
    sha256: '51981b7c1af454a96f6160fc7df6734df035c9833922f88c79a191e8a8d0f0a3',
    bytes: 23936,
    commit: 'c088d9ed08aeddea9310b2ed7a8b478fe1d1427b',
    expectedRecordKind: 'LIVE_WINDOW_RESULT_EVIDENCE_PENDING_ADJUDICATION',
    expectedRecordId: 'phase2b-2d-a2-post-window-04-window-05-live-result-v1',
    parserFamily: OBSERVATION,
    roles: OBSERVATION_ROLES,
  }),
  entry({
    id: V4_IDS.W05_ADJUDICATION,
    path: 'docs/evaluation/PHASE_2B_2D_A2_POST_WINDOW_04_WINDOW_05_EVIDENCE_ADJUDICATION_V1.json',
    sha256: '0a04e88ecfb2a9d2c357563cf3b2c32908ddbf07ca26d56af25ec90ede7e765b',
    bytes: 22867,
    commit: 'b5a06b4332b379b46c19bf976b6413a30966363d',
    expectedRecordKind: 'LIVE_WINDOW_EVIDENCE_ADJUDICATION',
    expectedRecordId: 'phase2b-2d-a2-post-window-04-window-05-evidence-adjudication-v1',
    parserFamily: ORDINARY_WINDOW_FAMILY,
    roles: ['TERMINAL_DISPOSITION_AUTHORITY', 'HISTORICAL_REPLACEMENT_REASON_AUTHORITY'],
  }),
  entry({
    id: V4_IDS.W06_LIVE_RESULT,
    path: 'docs/evaluation/PHASE_2B_2D_A2_POST_WINDOW_05_WINDOW_06_LIVE_RESULT_V1.json',
    sha256: '9a496f5727b0054b93f4ca00a465e79eb92810848053e4df2a9056ad34049e3f',
    bytes: 25392,
    commit: 'bbcddd45406a8ac085a4988663b79ce7bbc9e4ea',
    expectedRecordKind: 'LIVE_WINDOW_RESULT_EVIDENCE_PENDING_ADJUDICATION',
    expectedRecordId: 'phase2b-2d-a2-post-window-05-window-06-live-result-v1',
    parserFamily: OBSERVATION,
    roles: OBSERVATION_ROLES,
  }),
  entry({
    id: V4_IDS.W06_ADJUDICATION,
    path: 'docs/evaluation/PHASE_2B_2D_A2_POST_WINDOW_05_WINDOW_06_EVIDENCE_ADJUDICATION_V1.json',
    sha256: '463cf5e76b56029998a53a07256829e305e734554536bd767cd6deaf82ba89aa',
    bytes: 21444,
    commit: 'c208fde6b17f457f12be5ec54cc5d84877be4015',
    expectedRecordKind: 'LIVE_WINDOW_EVIDENCE_ADJUDICATION',
    expectedRecordId: 'phase2b-2d-a2-post-window-05-window-06-evidence-adjudication-v1',
    parserFamily: ORDINARY_WINDOW_FAMILY,
    roles: ['TERMINAL_DISPOSITION_AUTHORITY', 'HISTORICAL_REPLACEMENT_REASON_AUTHORITY'],
  }),
  entry({
    id: V4_IDS.W07_LIVE_RESULT,
    path: 'docs/evaluation/PHASE_2B_2D_A2_POST_WINDOW_06_WINDOW_07_LIVE_RESULT_V1.json',
    sha256: '13748f6151359cdac40523cbe116fbb747906340ad1dd87dea7e0d0e76916f9b',
    bytes: 19014,
    commit: '5fbbe9bf1e0e3bceeb9491e63f9150d1b9b981ef',
    expectedRecordKind: 'LIVE_WINDOW_RESULT_EVIDENCE_PENDING_ADJUDICATION',
    expectedRecordId: 'phase2b-2d-a2-post-window-06-window-07-live-result-v1',
    parserFamily: OBSERVATION,
    roles: OBSERVATION_ROLES,
  }),
  entry({
    id: V4_IDS.W07_ADJUDICATION,
    path: 'docs/evaluation/PHASE_2B_2D_A2_POST_WINDOW_06_WINDOW_07_EVIDENCE_ADJUDICATION_V1.json',
    sha256: '3b77909986fa8c7fd8f3c3d7829f6c4f7a46a55fa9d2aca02d452bd4cef728a5',
    bytes: 26682,
    commit: 'a1ef1e2dda57d66848052914a36508a5dd5999b4',
    expectedRecordKind: 'LIVE_WINDOW_EVIDENCE_ADJUDICATION',
    expectedRecordId: 'phase2b-2d-a2-post-window-06-window-07-evidence-adjudication-v1',
    parserFamily: ORDINARY_WINDOW_FAMILY,
    roles: ['TERMINAL_DISPOSITION_AUTHORITY', 'HISTORICAL_REPLACEMENT_REASON_AUTHORITY'],
  }),
  entry({
    id: V4_IDS.V7_REVALIDATION_ADJUDICATION,
    path: 'docs/evaluation/PHASE_2B_2D_A2_SLOT66_RESERVE27_FETCH_POLICY_V7_TARGETED_REVALIDATION_EVIDENCE_ADJUDICATION_V1.json',
    sha256: '61409f62cc0d3fa0b2fff1d618968956815ceb4812e68e189f24e6fd7a263387',
    bytes: 16682,
    commit: '7ffe80b9d434e4d93c6077dbfb16aa93fa2f161f',
    expectedRecordKind: 'TARGETED_CAPABILITY_REVALIDATION_EVIDENCE_ADJUDICATION',
    expectedRecordId:
      'phase2b-2d-a2-slot66-reserve27-fetch-policy-v7-targeted-revalidation-evidence-adjudication-v1',
    parserFamily: TARGETED_POLICY_REVALIDATION_FAMILY,
    roles: ['HISTORICAL_REPLACEMENT_REASON_AUTHORITY'],
  }),
  entry({
    id: V4_IDS.FINAL_LIVE_RESULT,
    path: 'docs/evaluation/PHASE_2B_2D_A2_FINAL_ORDINARY_WINDOW_LIVE_RESULT_V1.json',
    sha256: '8fece71a6139e0d1905aff659e1071110e3cb62c8021081e9982277552797c1d',
    bytes: 19133,
    commit: '23644f0c8bd1dcae3ca1373cf71d11a6b28181ac',
    expectedRecordKind: 'LIVE_WINDOW_RESULT',
    expectedRecordId: null,
    parserFamily: OBSERVATION,
    roles: OBSERVATION_ROLES,
  }),
  entry({
    id: V4_IDS.FINAL_ADJUDICATION,
    path: 'docs/evaluation/PHASE_2B_2D_A2_FINAL_ORDINARY_WINDOW_EVIDENCE_ADJUDICATION_V1.json',
    sha256: '4283edee2355a886b50f1a5aba88de5ec2e010884f36f5105b6c1c535874ce35',
    bytes: 21656,
    commit: 'ba8b8720447803f826c0abce352ca22d228ac381',
    expectedRecordKind: 'LIVE_WINDOW_EVIDENCE_ADJUDICATION',
    expectedRecordId: 'phase2b-2d-a2-final-ordinary-window-evidence-adjudication-v1',
    parserFamily: FINAL_ORDINARY_WINDOW_FAMILY,
    roles: TERMINAL_ROLES,
  }),
  entry({
    id: V4_IDS.SD9_RECONCILIATION,
    path: 'docs/evaluation/PHASE_2B_2D_A2_SD9_EXTRACTABLE_TEXT_GENERATION1_RECONCILIATION_V1.json',
    sha256: '66bff9882d78c2369898b0b646d79dffdef4d623fd5a21a3948c8e1248a397a1',
    bytes: 29160,
    commit: 'd6f783cbee4389242a3ab43624062fcf4a04f367',
    expectedRecordKind: 'GENERATION_WIDE_RECONCILIATION_RECORD',
    expectedRecordId: 'phase2b-2d-a2-sd9-extractable-text-generation1-reconciliation-v1',
    parserFamily: SD9_RECONCILIATION_FAMILY,
    roles: ['TERMINAL_DISPOSITION_AUTHORITY', RUN_REFERENCE_PROVENANCE_SUPPLEMENT],
  }),
  entry({
    id: V4_IDS.PROVENANCE_CLOSURE,
    path: 'docs/evaluation/PHASE_2B_2D_A2_CURRENT_TERMINAL_RUN_PROVENANCE_CLOSURE_V1.json',
    sha256: '9da26f676f7cf461843c7a007a76af253b6f8b1d2a47cb1e4ce3e4abde872540',
    bytes: 64352,
    commit: COMMITTED_A2_GOVERNANCE_CHECKPOINT_V4,
    expectedRecordKind: 'A2_TERMINAL_RUN_PROVENANCE_CLOSURE',
    expectedRecordId: 'phase2b-2d-a2-current-terminal-run-provenance-closure-v1',
    parserFamily: RUN_PROVENANCE_CLOSURE_FAMILY,
    roles: [RUN_REFERENCE_PROVENANCE_SUPPLEMENT],
  }),
]);

/** The entries V4 adds, by id and in order. Nothing else may appear in V4 and not in V3. */
export const REGISTRY_V4_ADDED_IDS: readonly string[] = Object.freeze(
  ADDED_ENTRIES.map((added) => added.id),
);

/**
 * The LIVE_RESULT each V4 terminal adjudication binds. A parser reads its
 * record's own binding and proves it names EXACTLY this registered file; it
 * never invents one.
 */
export const V4_BOUND_LIVE_RESULT: Readonly<Record<string, string>> = Object.freeze({
  [V4_IDS.POST_P29_P30_ADJUDICATION]: V4_IDS.POST_P29_P30_LIVE_RESULT,
  [V4_IDS.POST_P29_P30_NEXT_ADJUDICATION]: V4_IDS.POST_P29_P30_NEXT_LIVE_RESULT,
  [V4_IDS.CHILD_A_ADJUDICATION]: V4_IDS.CHILD_A_LIVE_RESULT,
  [V4_IDS.CHILD_B_ADJUDICATION]: V4_IDS.CHILD_B_LIVE_RESULT,
  [V4_IDS.CHILD_C_ADJUDICATION]: V4_IDS.CHILD_C_LIVE_RESULT,
  [V4_IDS.D1_ADJUDICATION]: V4_IDS.D1_LIVE_RESULT,
  [V4_IDS.Q1_W01_ADJUDICATION]: V4_IDS.Q1_W01_LIVE_RESULT,
  [V4_IDS.Q1_W02_ADJUDICATION]: V4_IDS.Q1_W02_LIVE_RESULT,
  [V4_IDS.VANTAGE_RECOVERY_ADJUDICATION]: V4_IDS.VANTAGE_RECOVERY_LIVE_RESULT,
  [V4_IDS.W03_ADJUDICATION]: V4_IDS.W03_LIVE_RESULT,
  [V4_IDS.W04_ADJUDICATION]: V4_IDS.W04_LIVE_RESULT,
  [V4_IDS.W05_ADJUDICATION]: V4_IDS.W05_LIVE_RESULT,
  [V4_IDS.W06_ADJUDICATION]: V4_IDS.W06_LIVE_RESULT,
  [V4_IDS.W07_ADJUDICATION]: V4_IDS.W07_LIVE_RESULT,
  [V4_IDS.FINAL_ADJUDICATION]: V4_IDS.FINAL_LIVE_RESULT,
});

/**
 * The V4 records committed AFTER the ledger revision Registry V4 pins
 * (`e5e4d51`). None of them can be the authority for why that ledger replaced
 * anyone: a reason must come from governance the ledger append itself relied
 * on. The ancestry is proved by an internal test against the repository.
 */
export const REGISTRY_V4_IDS_POSTDATING_LEDGER_REVISION: readonly string[] = Object.freeze([
  V4_IDS.FINAL_LIVE_RESULT,
  V4_IDS.FINAL_ADJUDICATION,
  V4_IDS.SD9_RECONCILIATION,
  V4_IDS.PROVENANCE_CLOSURE,
]);

// ---------------------------------------------------------------------------
// E. REGISTRY V4.
// ---------------------------------------------------------------------------

/**
 * Registry V3's entries in V3's order - the unchanged ones are the V3 OBJECTS
 * THEMSELVES, not copies - with the ledger binding replaced, then the
 * additions. The length is whatever that construction yields; nothing here
 * asserts it.
 */
export const COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES: readonly GovernanceRegistryEntryV4[] =
  Object.freeze([
    ...COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES.map((existing): GovernanceRegistryEntryV4 =>
      existing.id === REPLACEMENT_LEDGER_REGISTRY_ID ? REPLACEMENT_LEDGER_V4_ENTRY : existing,
    ),
    ...ADDED_ENTRIES,
  ]);

/** The ids Registry V3 registers, i.e. the V3-compatible subview. Derived, never listed. */
export const REGISTRY_V3_IDS: ReadonlySet<string> = new Set(
  COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES.map((existing) => existing.id),
);

// ---------------------------------------------------------------------------
// F. COMPOSITION PROOF.
// ---------------------------------------------------------------------------

/**
 * Path fragments that name a record kind which can never be governance input:
 * none of them carries a terminal disposition.
 */
export const NON_GOVERNANCE_PATH_TOKENS_V4 = Object.freeze([
  '_STRATEGY_',
  '_PLAN_',
  '_LIVE_AUTHORITY_',
  '_PRENETWORK_',
  '_STATE_SUMMARY',
  '_P5_PAUSE_REVIEW',
  '_P5_REVIEW_',
  '_AUTOPILOT_V1',
  '_AUTOPILOT_GOVERNANCE_',
  '_AUTOPILOT_RESUME_',
  '_ACQUISITION_RESUME_',
  '_WINDOW_RELEASE_',
  '_REVALIDATION_AUTHORITY_',
  '_NETWORK_PRECONDITION_',
  '_RECOVERY_DECISION_',
  '_INTERPRETATION_',
  '_TRANSPORT_FAILURE_REVIEW_',
  '_VALIDATION_INCIDENT_',
  '_EVIDENCE_INTEGRITY_',
  '_POLICY_V7_REPAIR_',
]);

export interface RegistryV4Composition {
  readonly v3EntryCount: number;
  readonly v4EntryCount: number;
  readonly unchangedIds: readonly string[];
  readonly replacedIds: readonly string[];
  readonly addedIds: readonly string[];
}

function sameEntry(a: GovernanceRegistryEntryV4, b: GovernanceRegistryEntryV4): boolean {
  return (
    a.id === b.id &&
    a.path === b.path &&
    a.sha256 === b.sha256 &&
    a.bytes === b.bytes &&
    a.commit === b.commit &&
    a.expectedRecordKind === b.expectedRecordKind &&
    a.expectedRecordId === b.expectedRecordId &&
    a.parserFamily === b.parserFamily &&
    a.roles.length === b.roles.length &&
    a.roles.every((role, index) => role === b.roles[index])
  );
}

/**
 * Proves V4 is exactly "V3, one binding replaced, the declared entries
 * added". Every unchanged V3 entry must agree on id, path, SHA-256, bytes,
 * commit, discriminators, family and roles; the replaced ledger must keep its
 * id, path, family, roles and discriminators and change its bytes; and no
 * strategy, plan, live authority, pre-network assignment, review, resume,
 * interpretation or operational rule may appear anywhere.
 */
export function proveRegistryV4Composition(
  v4: readonly GovernanceRegistryEntryV4[] = COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES,
  v3: readonly GovernanceRegistryEntryV3[] = COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES,
): RegistryV4Composition {
  const byId = new Map(v4.map((candidate) => [candidate.id, candidate]));
  if (byId.size !== v4.length) {
    refuseV4('REGISTRY_V4_DUPLICATE_ENTRY', 'registry V4 repeats an id');
  }
  const unchangedIds: string[] = [];
  const replacedIds: string[] = [];
  for (const old of v3) {
    const next = byId.get(old.id);
    if (next === undefined) {
      refuseV4('REGISTRY_V4_COMPOSITION_INVALID', `registry V4 drops V3 entry ${old.id}`);
    }
    if (sameEntry(old, next)) {
      unchangedIds.push(old.id);
      continue;
    }
    if (
      old.id !== REPLACEMENT_LEDGER_REGISTRY_ID ||
      next.path !== old.path ||
      next.parserFamily !== old.parserFamily ||
      next.expectedRecordKind !== old.expectedRecordKind ||
      next.expectedRecordId !== old.expectedRecordId ||
      next.roles.join('|') !== old.roles.join('|') ||
      next.sha256 === old.sha256
    ) {
      refuseV4(
        'REGISTRY_V4_COMPOSITION_INVALID',
        `registry V4 changes V3 entry ${old.id} beyond the one permitted ledger rebinding`,
      );
    }
    replacedIds.push(old.id);
  }
  const v3Ids = new Set(v3.map((existing) => existing.id));
  const addedIds = v4.filter((candidate) => !v3Ids.has(candidate.id)).map((added) => added.id);
  if (
    addedIds.length !== REGISTRY_V4_ADDED_IDS.length ||
    addedIds.some((id, index) => id !== REGISTRY_V4_ADDED_IDS[index])
  ) {
    refuseV4('REGISTRY_V4_COMPOSITION_INVALID', 'registry V4 adds entries it does not declare');
  }
  for (const candidate of v4) {
    if (NON_GOVERNANCE_PATH_TOKENS_V4.some((token) => candidate.path.includes(token))) {
      refuseV4(
        'REGISTRY_V4_COMPOSITION_INVALID',
        `${candidate.id} names a record kind that can never carry a disposition`,
      );
    }
  }
  return Object.freeze({
    v3EntryCount: v3.length,
    v4EntryCount: v4.length,
    unchangedIds: Object.freeze(unchangedIds),
    replacedIds: Object.freeze(replacedIds),
    addedIds: Object.freeze(addedIds),
  });
}
