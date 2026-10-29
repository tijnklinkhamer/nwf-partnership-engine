/**
 * PHASE 2B-2D — A3 R19: CANONICAL A2 GOVERNANCE REGISTRY, VERSION 1.
 *
 * ONE QUESTION
 *
 *   Which committed files is the R19 adapter ALLOWED to interpret, and what
 *   exact bytes must each of them have?
 *
 * WHAT THIS FILE IS, AND IS NOT
 *
 *   It is a MANUALLY EXPLICIT selection of already-authoritative committed
 *   bytes. It creates no authority of its own: every entry names a file that
 *   an owner decision already made authoritative, and pins the exact bytes so
 *   that reading it cannot silently read something else.
 *
 *   It is NOT a directory index. There is no glob, no enumeration, no "latest",
 *   no highest version, no newest commit and no newest filename anywhere in
 *   this namespace. An unregistered JSON file under `docs/evaluation/` has
 *   ZERO effect on the derived authority, however plausible its name.
 *
 * VERSIONING
 *
 *   Registry V1 is the exact governance snapshot at
 *   `CANONICAL_A2_A3_GOVERNANCE_INTEGRATION_TIP`. It is HISTORICAL IMMUTABLE
 *   CONFIGURATION from the moment R19 lands: when the A2 acquisition branch
 *   advances, a later explicit integration checkpoint creates a LATER registry
 *   version. V1 is never quietly re-pointed at newer governance, and nothing
 *   here follows a branch.
 *
 * THIS MODULE IS PURE DATA. It opens nothing; `loader.ts` does the reading.
 */

// ---------------------------------------------------------------------------
// A. THE SNAPSHOT THIS REGISTRY DESCRIBES.
// ---------------------------------------------------------------------------

export const CANONICAL_A2_GOVERNANCE_REGISTRY_VERSION = 'CANONICAL_A2_GOVERNANCE_REGISTRY_V1';

/** The integrated A2 + A3 governance tip Registry V1 is pinned to. */
export const CANONICAL_A2_A3_GOVERNANCE_INTEGRATION_TIP =
  '907d726268ad07fe94fec93f4c6f3ff5ce5f93f9';

// ---------------------------------------------------------------------------
// B. PARSER FAMILIES.
// ---------------------------------------------------------------------------

/**
 * The EXACT record families R19 knows how to read. There is no generic
 * fallback parser: a registered file whose family is not in this list is a
 * refusal (`UNSUPPORTED_GOVERNANCE_RECORD_FAMILY`), never a best effort.
 *
 * Three families share the `LIVE_WINDOW_EVIDENCE_ADJUDICATION` recordKind and
 * do NOT share an item shape, which is exactly why the family is chosen by
 * registry id and not by recordKind:
 *
 *   WINDOW_V1_EVIDENCE_ADJUDICATION     items carry `kind` + `reservePosition`
 *                                       and NO draw digest and NO
 *                                       `finalAdjudication`.
 *   MIXED_WINDOW_EVIDENCE_ADJUDICATION  items carry `drawEntryKind` +
 *                                       `drawEntrySha256` +
 *                                       `reserveRankPosition` +
 *                                       `finalAdjudication`.
 *   WINDOW_V2_PARTIAL_EVIDENCE_ADJUDICATION
 *                                       items carry a coarse
 *                                       `finalAdjudication` beside a separate
 *                                       `replacementReason`, and some items
 *                                       carry no terminal disposition at all.
 */
export const GOVERNANCE_PARSER_FAMILIES = Object.freeze([
  'FROZEN_DRAW',
  'RESERVE_REPLACEMENT_LEDGER',
  'ACQUISITION_POLICY_TRANSITION_LEDGER',
  'BATCH01_ATTRIBUTION_OWNER_ADJUDICATION',
  'OPTION_B_TRANSITION_OWNER_ADJUDICATION',
  'OPTION_B_TRANSITION_MEASUREMENT_OF_RECORD',
  'OPTION_C_LITE_REVALIDATION_ADJUDICATION',
  'V4_TRANSPORT_REVALIDATION_ADJUDICATION',
  'P12_V6_TARGETED_REVALIDATION_ADJUDICATION',
  'WINDOW_V1_EVIDENCE_ADJUDICATION',
  'WINDOW_V2_PARTIAL_EVIDENCE_ADJUDICATION',
  'MIXED_WINDOW_EVIDENCE_ADJUDICATION',
  'OWNER_REPLACEMENT_REASON_PRECEDENCE_CLARIFICATION',
  'ADJUDICATED_OBSERVATION_RECORD',
] as const);
export type GovernanceParserFamily = (typeof GOVERNANCE_PARSER_FAMILIES)[number];

/** What a registered file contributes. Roles are descriptive, never authority. */
export const GOVERNANCE_SEMANTIC_ROLES = Object.freeze([
  'FROZEN_OCCUPANT_IDENTITY',
  'OCCUPANT_CHAIN_AUTHORITY',
  'RUN_SUPERSESSION_AUTHORITY',
  'TERMINAL_DISPOSITION_AUTHORITY',
  'HISTORICAL_REPLACEMENT_REASON_AUTHORITY',
  'ADJUDICATED_OBSERVATION_BINDING',
] as const);
export type GovernanceSemanticRole = (typeof GOVERNANCE_SEMANTIC_ROLES)[number];

// ---------------------------------------------------------------------------
// C. ENTRY SHAPE.
// ---------------------------------------------------------------------------

export interface GovernanceRegistryEntry {
  /** Stable registry id. Parsers select by this, never by filename shape. */
  readonly id: string;
  /** Repository-relative path, under `docs/evaluation/`, ending `.json`. */
  readonly path: string;
  /** Lower-hex SHA-256 of the exact committed bytes. */
  readonly sha256: string;
  readonly bytes: number;
  /** The full 40-character commit that last wrote these exact bytes. */
  readonly commit: string;
  /** The record's own `recordKind`, when it declares one; else null. */
  readonly expectedRecordKind: string | null;
  /** The record's own `recordId`, when it declares one; else null. */
  readonly expectedRecordId: string | null;
  readonly parserFamily: GovernanceParserFamily;
  readonly roles: readonly GovernanceSemanticRole[];
}

function entry(value: GovernanceRegistryEntry): GovernanceRegistryEntry {
  return Object.freeze(value);
}

// ---------------------------------------------------------------------------
// D. REGISTRY V1.
// ---------------------------------------------------------------------------

/**
 * The MINIMAL COMPLETE set of committed files needed to derive current R17
 * authority at the pinned governance tip, plus the historical authority needed
 * to justify all eight replacement-ledger entries.
 *
 * Strategies, window plans, live-window authorities and pre-network
 * assignments are DELIBERATELY ABSENT: none of them can carry a terminal
 * disposition (R17's `A2_NON_ADJUDICATIVE_RECORD_KINDS` says so), and no
 * parser here needs one as provenance. State-summary records are absent for
 * the same reason - `generation1State` blocks are a cross-check after
 * derivation, never an input to it.
 */
export const CANONICAL_A2_GOVERNANCE_REGISTRY_V1: readonly GovernanceRegistryEntry[] =
  Object.freeze([
    // --- Frozen occupant identity and the occupant chain. -------------------
    entry({
      id: 'FROZEN_DRAW_V2_GEN1',
      path: 'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_DRAW_V2_GEN1.json',
      sha256: 'b7021416894b7547cfe53d0d5f5e34b4e9c35843f8be35f0d2844bc67683b7b3',
      bytes: 74047,
      commit: '34537caf2308ade014f9f459ca9f97596dc48a17',
      expectedRecordKind: 'DRAW_V2_GEN1',
      expectedRecordId: null,
      parserFamily: 'FROZEN_DRAW',
      roles: ['FROZEN_OCCUPANT_IDENTITY'],
    }),
    entry({
      id: 'RESERVE_REPLACEMENT_LEDGER_V2_GEN1',
      path: 'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_RESERVE_REPLACEMENT_LEDGER_V2_GEN1.json',
      sha256: '72c9af2c2b239a6eecb8e84d5a1139eb0b728b1330465f610e73165d7212f114',
      bytes: 9690,
      commit: 'b1438322bec15c1ffb54c53d1aa6c8d3e9e15bac',
      expectedRecordKind: 'RESERVE_REPLACEMENT_LEDGER_V2_GEN1',
      expectedRecordId: null,
      parserFamily: 'RESERVE_REPLACEMENT_LEDGER',
      roles: ['OCCUPANT_CHAIN_AUTHORITY'],
    }),

    // --- The explicit transition chain. V2 -> V3 -> V4 -> V6, no V5. -------
    entry({
      id: 'ACQUISITION_POLICY_TRANSITION_LEDGER_V2',
      path: 'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_ACQUISITION_POLICY_TRANSITION_LEDGER_V2_GEN1.json',
      sha256: 'e3a2fe6199af4c0859b625b8f2b599e51bf4273a815d50ca8a8527fc28611aaf',
      bytes: 3054,
      commit: 'b0f4efa01d7e861a701e3514afc690a99262f554',
      expectedRecordKind: 'ACQUISITION_POLICY_TRANSITION_LEDGER_V2_GEN1',
      expectedRecordId: null,
      parserFamily: 'ACQUISITION_POLICY_TRANSITION_LEDGER',
      roles: ['RUN_SUPERSESSION_AUTHORITY'],
    }),
    entry({
      id: 'ACQUISITION_POLICY_TRANSITION_LEDGER_V3',
      path: 'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_ACQUISITION_POLICY_TRANSITION_LEDGER_V3_GEN1.json',
      sha256: 'f994ac91863d83b9693f6e9aaf9864a783bcfe234bf117be83ee8d67841d0b2b',
      bytes: 8159,
      commit: '55dc413a28d169e074ae26cbf791e560e0d99de9',
      expectedRecordKind: 'ACQUISITION_POLICY_TRANSITION_LEDGER_V3_GEN1',
      expectedRecordId: null,
      parserFamily: 'ACQUISITION_POLICY_TRANSITION_LEDGER',
      roles: ['RUN_SUPERSESSION_AUTHORITY'],
    }),
    entry({
      id: 'ACQUISITION_POLICY_TRANSITION_LEDGER_V4',
      path: 'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_ACQUISITION_POLICY_TRANSITION_LEDGER_V4_GEN1.json',
      sha256: 'ca69abf483bad007419a1bcc8ab0e156901f87abd604ca369e8fa4cc7a965346',
      bytes: 17539,
      commit: '7a86da7464ab03edb5b04d9f49e44b23443b791a',
      expectedRecordKind: 'ACQUISITION_POLICY_TRANSITION_LEDGER_V4_GEN1',
      expectedRecordId: null,
      parserFamily: 'ACQUISITION_POLICY_TRANSITION_LEDGER',
      roles: ['RUN_SUPERSESSION_AUTHORITY'],
    }),
    entry({
      id: 'ACQUISITION_POLICY_TRANSITION_LEDGER_V6',
      path: 'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_ACQUISITION_POLICY_TRANSITION_LEDGER_V6_GEN1.json',
      sha256: '592b17062a601ac21f0525209e133220b90ebd97848790f9da66e22f9391461d',
      bytes: 19454,
      commit: '3702cf3bf5897f4b614c0806573f3218b130528c',
      expectedRecordKind: 'ACQUISITION_POLICY_TRANSITION_LEDGER_V6_GEN1',
      expectedRecordId: null,
      parserFamily: 'ACQUISITION_POLICY_TRANSITION_LEDGER',
      roles: ['RUN_SUPERSESSION_AUTHORITY'],
    }),

    // --- Terminal disposition authorities, by family. -----------------------
    entry({
      id: 'BATCH01_PER_SLOT_ATTRIBUTION_ADJUDICATION',
      path: 'docs/evaluation/PHASE_2B_2D_A2_BATCH_01_PER_SLOT_ACQUISITION_ATTRIBUTION_OWNER_ADJUDICATION_V1.json',
      sha256: '7b63c3ea6fa03f624891d971f7a1c0ae3030a724d57521abcb1a5812e58c3e47',
      bytes: 40391,
      commit: '3d177f04e78785cdf97b7605b886156165f5fc4e',
      expectedRecordKind: 'OWNER_ADJUDICATION',
      expectedRecordId:
        'phase2b-2d-a2-batch-01-per-slot-acquisition-attribution-owner-adjudication-v1',
      parserFamily: 'BATCH01_ATTRIBUTION_OWNER_ADJUDICATION',
      roles: ['TERMINAL_DISPOSITION_AUTHORITY'],
    }),
    entry({
      id: 'OPTION_B_REVALIDATION_ADJUDICATION',
      path: 'docs/evaluation/PHASE_2B_ROBOTS_OPTION_B_REVALIDATION_EVIDENCE_ADJUDICATION_V1.json',
      sha256: '2f42765263b375e939881c0f408aab246ceee0ab1a59f70401adfb4ec2daca1c',
      bytes: 5467,
      commit: '95f2bd78b7dd1f33cb82554e8abaf2aec6840a1d',
      expectedRecordKind: 'OWNER_ADJUDICATION',
      expectedRecordId: 'phase2b-robots-option-b-revalidation-evidence-adjudication-v1',
      parserFamily: 'OPTION_B_TRANSITION_OWNER_ADJUDICATION',
      roles: ['TERMINAL_DISPOSITION_AUTHORITY'],
    }),
    entry({
      id: 'OPTION_B_TRANSITION_SD7_MEASUREMENT_OF_RECORD',
      path: 'docs/evaluation/PHASE_2B_2D_OPTION_B_TRANSITION_SD7_MEASUREMENT_OF_RECORD_V1.json',
      sha256: 'e5bfae12c86b8661dde9232eddedb3a0a215df11b6438a7768be536725862b7f',
      bytes: 11574,
      commit: 'b0f4efa01d7e861a701e3514afc690a99262f554',
      expectedRecordKind: 'MEASUREMENT_OF_RECORD',
      expectedRecordId: 'phase2b-2d-option-b-transition-sd7-measurement-of-record-v1',
      parserFamily: 'OPTION_B_TRANSITION_MEASUREMENT_OF_RECORD',
      roles: ['TERMINAL_DISPOSITION_AUTHORITY'],
    }),
    entry({
      id: 'OPTION_C_LITE_REVALIDATION_ADJUDICATION',
      path: 'docs/evaluation/PHASE_2B_ROBOTS_OPTION_C_LITE_REVALIDATION_EVIDENCE_ADJUDICATION_V1.json',
      sha256: '3fcafa8ae20beb481e0b4446cc8b9681caad56915e231b71bb98567304cf96c0',
      bytes: 12865,
      commit: '55dc413a28d169e074ae26cbf791e560e0d99de9',
      expectedRecordKind: 'REVALIDATION_EVIDENCE_ADJUDICATION',
      expectedRecordId: 'phase2b-robots-option-c-lite-revalidation-evidence-adjudication-v1',
      parserFamily: 'OPTION_C_LITE_REVALIDATION_ADJUDICATION',
      roles: ['TERMINAL_DISPOSITION_AUTHORITY'],
    }),
    entry({
      id: 'WINDOW_V1_EVIDENCE_ADJUDICATION',
      path: 'docs/evaluation/PHASE_2B_2D_A2_POST_V4_REPLACEMENT_AND_INDEX9_LIVE_WINDOW_EVIDENCE_ADJUDICATION_V1.json',
      sha256: 'e535e792dba2b250fc734c8cce39f1375c7ed99f2d3a5e58c7f60fb828aa586c',
      bytes: 29385,
      commit: '2d95e26b555dd4a35027f2982959665380233da6',
      expectedRecordKind: 'LIVE_WINDOW_EVIDENCE_ADJUDICATION',
      expectedRecordId:
        'phase2b-2d-a2-post-v4-replacement-and-index9-live-window-evidence-adjudication-v1',
      parserFamily: 'WINDOW_V1_EVIDENCE_ADJUDICATION',
      roles: ['TERMINAL_DISPOSITION_AUTHORITY'],
    }),
    entry({
      id: 'WINDOW_V2_PARTIAL_EVIDENCE_ADJUDICATION',
      path: 'docs/evaluation/PHASE_2B_2D_A2_PRIMARY_10_14_LIVE_WINDOW_EVIDENCE_ADJUDICATION_V1.json',
      sha256: '9503dec328acaae530dd2574b0a7f14c7b2ed67e3f5fa1fdbce0f41830c0e563',
      bytes: 18185,
      commit: '69dff793439a8d20d29894100c4b73e064206308',
      expectedRecordKind: 'LIVE_WINDOW_EVIDENCE_PARTIAL_ADJUDICATION',
      expectedRecordId: 'phase2b-2d-a2-primary-10-14-live-window-evidence-adjudication-v1',
      parserFamily: 'WINDOW_V2_PARTIAL_EVIDENCE_ADJUDICATION',
      roles: ['TERMINAL_DISPOSITION_AUTHORITY', 'HISTORICAL_REPLACEMENT_REASON_AUTHORITY'],
    }),
    entry({
      id: 'POST_P12_MIXED_WINDOW_EVIDENCE_ADJUDICATION',
      path: 'docs/evaluation/PHASE_2B_2D_A2_POST_P12_MIXED_WINDOW_EVIDENCE_ADJUDICATION_V1.json',
      sha256: '92988ac55edafa1dd20f801f17f01405e9be6c26c4c78f4d4c4fde908d5009db',
      bytes: 36262,
      commit: '156df2ad08c90bbfef02a1187db7cdd73121ecc6',
      expectedRecordKind: 'LIVE_WINDOW_EVIDENCE_ADJUDICATION',
      expectedRecordId: 'phase2b-2d-a2-post-p12-mixed-window-evidence-adjudication-v1',
      parserFamily: 'MIXED_WINDOW_EVIDENCE_ADJUDICATION',
      roles: ['TERMINAL_DISPOSITION_AUTHORITY', 'HISTORICAL_REPLACEMENT_REASON_AUTHORITY'],
    }),
    entry({
      id: 'POST_MIXED_WINDOW_CHAIN_REPLACEMENT_EVIDENCE_ADJUDICATION',
      path: 'docs/evaluation/PHASE_2B_2D_A2_POST_MIXED_WINDOW_CHAIN_REPLACEMENT_AND_PRIMARY_EVIDENCE_ADJUDICATION_V1.json',
      sha256: 'd636f0361b9fad3b32a0aefbcd2de619108a1ccedfde19fb6d00c52fdc7211f6',
      bytes: 46704,
      commit: '696c52333fe0e16b41eacd6b387cc5f692c2dde9',
      expectedRecordKind: 'LIVE_WINDOW_EVIDENCE_ADJUDICATION',
      expectedRecordId:
        'phase2b-2d-a2-post-mixed-window-chain-replacement-and-primary-evidence-adjudication-v1',
      parserFamily: 'MIXED_WINDOW_EVIDENCE_ADJUDICATION',
      roles: ['TERMINAL_DISPOSITION_AUTHORITY', 'HISTORICAL_REPLACEMENT_REASON_AUTHORITY'],
    }),
    entry({
      id: 'POST_P18_CONTINUATION_EVIDENCE_ADJUDICATION',
      path: 'docs/evaluation/PHASE_2B_2D_A2_POST_P18_REPLACEMENT_AND_PRIMARY_CONTINUATION_EVIDENCE_ADJUDICATION_V1.json',
      sha256: '1cd0634e2c7c68e0596d3275bbb5bbf94a4dd1ff01ddfa1fcdb4aff691c46108',
      bytes: 63980,
      commit: 'b861d08871f8dcd2f498f5502c86dd51c0117be9',
      expectedRecordKind: 'LIVE_WINDOW_EVIDENCE_ADJUDICATION',
      expectedRecordId:
        'phase2b-2d-a2-post-p18-replacement-and-primary-continuation-evidence-adjudication-v1',
      parserFamily: 'MIXED_WINDOW_EVIDENCE_ADJUDICATION',
      roles: ['TERMINAL_DISPOSITION_AUTHORITY'],
    }),

    // --- Historical-only authorities. --------------------------------------
    entry({
      id: 'V4_TRANSPORT_REVALIDATION_ADJUDICATION',
      path: 'docs/evaluation/PHASE_2B_2D_A2_V4_TARGETED_TRANSPORT_REVALIDATION_EVIDENCE_ADJUDICATION_V1.json',
      sha256: '1aec378daa5f1e35834ec3be44de765f2f841c7f6076996a75c7f243fdef4f3c',
      bytes: 35365,
      commit: '7a86da7464ab03edb5b04d9f49e44b23443b791a',
      expectedRecordKind: 'REVALIDATION_EVIDENCE_ADJUDICATION',
      expectedRecordId: 'phase2b-2d-a2-v4-targeted-transport-revalidation-evidence-adjudication-v1',
      parserFamily: 'V4_TRANSPORT_REVALIDATION_ADJUDICATION',
      roles: ['RUN_SUPERSESSION_AUTHORITY'],
    }),
    entry({
      id: 'P12_V6_TARGETED_REVALIDATION_ADJUDICATION',
      path: 'docs/evaluation/PHASE_2B_2D_A2_P12_FETCH_POLICY_V6_TARGETED_REVALIDATION_EVIDENCE_ADJUDICATION_V1.json',
      sha256: '5da293dabcbd0b33d7d3c88788f1435983cd2ce1d88622fabb0bcea8809faef8',
      bytes: 20056,
      commit: '99864414ca0d3af6fccca420387648c4dabff75c',
      expectedRecordKind: 'TARGETED_CAPABILITY_REVALIDATION_FINAL_EVIDENCE_ADJUDICATION',
      expectedRecordId:
        'phase2b-2d-a2-p12-fetch-policy-v6-targeted-revalidation-evidence-adjudication-v1',
      parserFamily: 'P12_V6_TARGETED_REVALIDATION_ADJUDICATION',
      roles: ['HISTORICAL_REPLACEMENT_REASON_AUTHORITY', 'RUN_SUPERSESSION_AUTHORITY'],
    }),
    entry({
      id: 'OWNER_REPLACEMENT_REASON_PRECEDENCE_CLARIFICATION',
      path: 'docs/evaluation/PHASE_2B_2D_A2_RESERVE_ASSIGNMENT_ORDER_OWNER_CLARIFICATION_V1.json',
      sha256: 'd999f9f3a54119b875717cb1b25f6b544e334eccb86cda0ebd67fd3f79fb3528',
      bytes: 18443,
      commit: 'b17503a2420ff16cc0c71ac94709b54fe1f2ead6',
      expectedRecordKind: 'OWNER_OPERATIONAL_ADJUDICATION',
      expectedRecordId: 'phase2b-2d-a2-reserve-assignment-order-owner-clarification-v1',
      parserFamily: 'OWNER_REPLACEMENT_REASON_PRECEDENCE_CLARIFICATION',
      roles: ['HISTORICAL_REPLACEMENT_REASON_AUTHORITY'],
    }),

    // --- The observation records the adjudications bound. -------------------
    entry({
      id: 'BATCH01_EXECUTION_RECORD',
      path: 'docs/evaluation/PHASE_2B_2D_METHOD_V2_A2_BATCH_01_EXECUTION_RECORD_V1.json',
      sha256: '8a1b0f57f1c568e2ac04aced7ba453ad8d7b666f557fd622b3a5e6378309f9cc',
      bytes: 23602,
      commit: 'a0ae27cc30f15537014fa8a4efaae9aa25da542a',
      expectedRecordKind: 'EXECUTION_RECORD',
      expectedRecordId: 'phase2b-2d-method-v2-a2-batch-01-execution-v1',
      parserFamily: 'ADJUDICATED_OBSERVATION_RECORD',
      roles: ['ADJUDICATED_OBSERVATION_BINDING'],
    }),
    entry({
      id: 'OPTION_B_TARGETED_REVALIDATION_RESULT',
      path: 'docs/evaluation/PHASE_2B_ROBOTS_OPTION_B_TARGETED_REVALIDATION_RESULT_V1.json',
      sha256: '5f232cf5ba0746c65b9bbbc69d0310614cd1162e0aa61fc3e0cbec5960ef187a',
      bytes: 11365,
      commit: '0662bcc938a9cf2b779c00355c6f7eb34df5279b',
      expectedRecordKind: 'EXECUTION_RESULT',
      expectedRecordId: 'phase2b-robots-option-b-targeted-revalidation-result-v1',
      parserFamily: 'ADJUDICATED_OBSERVATION_RECORD',
      roles: ['ADJUDICATED_OBSERVATION_BINDING'],
    }),
    entry({
      id: 'OPTION_C_LITE_TARGETED_REVALIDATION_RESULT',
      path: 'docs/evaluation/PHASE_2B_ROBOTS_OPTION_C_LITE_TARGETED_REVALIDATION_RESULT_V1.json',
      sha256: 'dfee9e7770bdd1c385c112708d7b3cbb0efcaf0da43c5e7286b52fd24af2dae1',
      bytes: 16811,
      commit: '9493073aededf0ba2bec68820ebfcc15787efd05',
      expectedRecordKind: 'TARGETED_LIVE_REVALIDATION_RESULT',
      expectedRecordId: 'phase2b-robots-option-c-lite-targeted-revalidation-result-v1',
      parserFamily: 'ADJUDICATED_OBSERVATION_RECORD',
      roles: ['ADJUDICATED_OBSERVATION_BINDING'],
    }),
    entry({
      id: 'WINDOW_V1_LIVE_RESULT',
      path: 'docs/evaluation/PHASE_2B_2D_A2_POST_V4_REPLACEMENT_AND_INDEX9_LIVE_WINDOW_RESULT_V1.json',
      sha256: 'b8b2ad20905a3e36585aa157d819a3929f732a3fadd76f6143619214f8f5f4d8',
      bytes: 29878,
      commit: '3056635d31ccd7407b327f2ae0ba306f7de73955',
      expectedRecordKind: 'LIVE_WINDOW_RESULT_EVIDENCE_PENDING_ADJUDICATION',
      expectedRecordId: 'phase2b-2d-a2-post-v4-replacement-and-index9-live-window-result-v1',
      parserFamily: 'ADJUDICATED_OBSERVATION_RECORD',
      roles: ['ADJUDICATED_OBSERVATION_BINDING'],
    }),
    entry({
      id: 'WINDOW_V2_LIVE_RESULT',
      path: 'docs/evaluation/PHASE_2B_2D_A2_PRIMARY_10_14_LIVE_WINDOW_RESULT_V1.json',
      sha256: 'c16ec72e84b938d338d3108291e4d9899c438d9123ab90a80a0674c8eb0e9576',
      bytes: 22408,
      commit: '575b706d1c33f7b62eb3ac5000780581bc901dbe',
      expectedRecordKind: 'LIVE_WINDOW_RESULT_EVIDENCE_PENDING_ADJUDICATION',
      expectedRecordId: 'phase2b-2d-a2-primary-10-14-live-window-result-v1',
      parserFamily: 'ADJUDICATED_OBSERVATION_RECORD',
      roles: ['ADJUDICATED_OBSERVATION_BINDING'],
    }),
    entry({
      id: 'POST_P12_MIXED_WINDOW_LIVE_RESULT',
      path: 'docs/evaluation/PHASE_2B_2D_A2_POST_P12_MIXED_WINDOW_LIVE_RESULT_V1.json',
      sha256: 'd743096a53e2b55cbc3dd717eea4e50a768cf401db43eb86023c35e140b453f5',
      bytes: 40390,
      commit: 'ad7f788a74c6a5e108ca0df1f5776f5e3324e5dc',
      expectedRecordKind: 'LIVE_WINDOW_RESULT_EVIDENCE_PENDING_ADJUDICATION',
      expectedRecordId: 'phase2b-2d-a2-post-p12-mixed-window-live-result-v1',
      parserFamily: 'ADJUDICATED_OBSERVATION_RECORD',
      roles: ['ADJUDICATED_OBSERVATION_BINDING'],
    }),
    entry({
      id: 'POST_MIXED_WINDOW_LIVE_RESULT',
      path: 'docs/evaluation/PHASE_2B_2D_A2_POST_MIXED_WINDOW_CHAIN_REPLACEMENT_AND_PRIMARY_LIVE_RESULT_V1.json',
      sha256: '3aad9d175467f4f1ff760906ff6b5cb85f2ae1f7cafb63750b19824441f6cbad',
      bytes: 43248,
      commit: '11c3a68299adebe0578ca594ba8783da08aa8c1b',
      expectedRecordKind: 'LIVE_WINDOW_RESULT_EVIDENCE_PENDING_ADJUDICATION',
      expectedRecordId:
        'phase2b-2d-a2-post-mixed-window-chain-replacement-and-primary-live-result-v1',
      parserFamily: 'ADJUDICATED_OBSERVATION_RECORD',
      roles: ['ADJUDICATED_OBSERVATION_BINDING'],
    }),
    entry({
      id: 'POST_P18_CONTINUATION_LIVE_RESULT',
      path: 'docs/evaluation/PHASE_2B_2D_A2_POST_P18_REPLACEMENT_AND_PRIMARY_CONTINUATION_LIVE_RESULT_V1.json',
      sha256: '05f4766934914b78f78203fb06e6f2a16fc4b449934602ad8ab8603a7805be49',
      bytes: 46460,
      commit: '3e9764e3dbfb63cf13b4511f7de89a6f998a309d',
      expectedRecordKind: 'LIVE_WINDOW_RESULT_EVIDENCE_PENDING_ADJUDICATION',
      expectedRecordId:
        'phase2b-2d-a2-post-p18-replacement-and-primary-continuation-live-result-v1',
      parserFamily: 'ADJUDICATED_OBSERVATION_RECORD',
      roles: ['ADJUDICATED_OBSERVATION_BINDING'],
    }),
  ]);

/**
 * The transition-ledger chain, oldest first, BY REGISTRY ID. There is
 * intentionally no V5 ledger: `orgunit-fetch-policy-v5` was implemented but
 * never executed against the working corpus, so no acquisition of record ever
 * moved to it and the V6 ledger binds V4 directly. Versions are named here,
 * never discovered.
 */
export const TRANSITION_LEDGER_CHAIN_V1: readonly string[] = Object.freeze([
  'ACQUISITION_POLICY_TRANSITION_LEDGER_V2',
  'ACQUISITION_POLICY_TRANSITION_LEDGER_V3',
  'ACQUISITION_POLICY_TRANSITION_LEDGER_V4',
  'ACQUISITION_POLICY_TRANSITION_LEDGER_V6',
]);

/** Registry V1 pins this ledger as the transition tip. No flag in a file does. */
export const TRANSITION_LEDGER_TIP_V1 = 'ACQUISITION_POLICY_TRANSITION_LEDGER_V6';

export function registryEntryById(id: string): GovernanceRegistryEntry | undefined {
  return CANONICAL_A2_GOVERNANCE_REGISTRY_V1.find((candidate) => candidate.id === id);
}
