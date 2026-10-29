/**
 * PHASE 2B-2D — A3 R31: COMMITTED A2 GOVERNANCE REGISTRY, VERSION 3.
 *
 * ONE QUESTION
 *
 *   Which EXACT committed bytes - named by commit, path, SHA-256 and length -
 *   is the V3 snapshot allowed to interpret?
 *
 * WHAT THIS FILE IS, AND IS NOT
 *
 *   It is Registry V2's logical entries, REUSED BY REFERENCE, with exactly one
 *   binding replaced (the replacement ledger, by its ten-entry revision) and
 *   exactly two entries added (the post-P24 window's live result and its
 *   terminal adjudication). It means "the exact committed governance state
 *   through that adjudication", pinned to `COMMITTED_A2_GOVERNANCE_CHECKPOINT_V3`
 *   forever. It does NOT mean "latest A2": a later A2 checkpoint requires a
 *   later registry version. No glob, no enumeration, no branch, no newest
 *   anything.
 *
 *   The post-P24 window's strategy, plan, live authority and pre-network
 *   assignment took part in A2 execution governance, but none of them carries
 *   a terminal slot disposition, so none is registered. The ledger row the
 *   pre-network assignment appended is registered through the ledger itself,
 *   at its exact committed revision.
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
import {
  COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES,
  GOVERNANCE_PARSER_FAMILIES_V2,
  REPLACEMENT_LEDGER_REGISTRY_ID,
  type GovernanceRegistryEntryV2,
} from '../a3governanceV2/registryV2.js';
import type { GovernanceSemanticRole } from '../a3governance/registryV1.js';
import { refuseV3 } from './refusal.js';

// ---------------------------------------------------------------------------
// A. THE CHECKPOINT THIS REGISTRY DESCRIBES.
// ---------------------------------------------------------------------------

export const COMMITTED_A2_GOVERNANCE_REGISTRY_V3 = 'COMMITTED_A2_GOVERNANCE_REGISTRY_V3';

/** The exact, already-adjudicated A2 commit Registry V3 describes. Not a branch. */
export const COMMITTED_A2_GOVERNANCE_CHECKPOINT_V3 = '58f756453bdc19168b584b5994379e05f0281781';

// ---------------------------------------------------------------------------
// B. PARSER FAMILIES.
// ---------------------------------------------------------------------------

/** The one family V3 adds. It is read ONLY by `familiesV3.ts`. */
export const POST_P24_WINDOW_FAMILY =
  'POST_P24_REPLACEMENT_AND_PRIMARY_CONTINUATION_EVIDENCE_ADJUDICATION';

export const GOVERNANCE_PARSER_FAMILIES_V3 = Object.freeze([
  ...GOVERNANCE_PARSER_FAMILIES_V2,
  POST_P24_WINDOW_FAMILY,
] as const);
export type GovernanceParserFamilyV3 = (typeof GOVERNANCE_PARSER_FAMILIES_V3)[number];

export interface GovernanceRegistryEntryV3 {
  readonly id: string;
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
  /** The exact commit the bytes are READ FROM. Not a date, not a branch. */
  readonly commit: string;
  readonly expectedRecordKind: string | null;
  readonly expectedRecordId: string | null;
  readonly parserFamily: GovernanceParserFamilyV3;
  readonly roles: readonly GovernanceSemanticRole[];
}

// ---------------------------------------------------------------------------
// C. THE ONE REPLACED BINDING AND THE TWO ADDED ENTRIES.
// ---------------------------------------------------------------------------

export { REPLACEMENT_LEDGER_REGISTRY_ID };

/**
 * The ten-entry revision of the SAME ledger path, appended pre-network at
 * `3eb2733` and unchanged through the checkpoint. Its family is a V1 family;
 * it is typed as a V2 entry on purpose.
 */
const REPLACEMENT_LEDGER_V3_ENTRY: GovernanceRegistryEntryV2 = Object.freeze({
  id: REPLACEMENT_LEDGER_REGISTRY_ID,
  path: 'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_RESERVE_REPLACEMENT_LEDGER_V2_GEN1.json',
  sha256: '5d67a8f83506852cb745557dfe4e0ff0b9b037e59dc2c5a67fdbd16dbe0d666d',
  bytes: 10911,
  commit: '3eb2733ccceea9db6eace652eae3000a91f759d4',
  expectedRecordKind: 'RESERVE_REPLACEMENT_LEDGER_V2_GEN1',
  expectedRecordId: null,
  parserFamily: 'RESERVE_REPLACEMENT_LEDGER',
  roles: Object.freeze(['OCCUPANT_CHAIN_AUTHORITY'] as const),
});

/**
 * The ledger's own recomputed hash and entry count at that revision. Byte
 * identity pins checked AFTER the canonical validator runs - never a
 * substitute for it.
 */
export const REPLACEMENT_LEDGER_V3_PIN = Object.freeze({
  ledgerHash: 'd71035336ed6b5e7d23f499a4349b6cb5c963c299319e4c7ba60dd3ca6c7e158',
  entryCount: 10,
});

export const POST_P24_LIVE_RESULT_REGISTRY_ID = 'POST_P24_CONTINUATION_LIVE_RESULT';
export const POST_P24_ADJUDICATION_REGISTRY_ID = 'POST_P24_CONTINUATION_EVIDENCE_ADJUDICATION';

/** The observation the new adjudication bound. Never itself terminal authority. */
const POST_P24_LIVE_RESULT_ENTRY: GovernanceRegistryEntryV3 = Object.freeze({
  id: POST_P24_LIVE_RESULT_REGISTRY_ID,
  path: 'docs/evaluation/PHASE_2B_2D_A2_POST_P24_REPLACEMENT_AND_PRIMARY_CONTINUATION_LIVE_RESULT_V1.json',
  sha256: 'f0c1ca745e16eda85d8b9457ba5b1d1513658071f231feaa68d6ee88daecacb4',
  bytes: 52004,
  commit: 'bb64cc6e851b4e9c9a5d8c1f2d73620ac71c2108',
  expectedRecordKind: 'LIVE_WINDOW_RESULT_EVIDENCE_PENDING_ADJUDICATION',
  expectedRecordId: 'phase2b-2d-a2-post-p24-replacement-and-primary-continuation-live-result-v1',
  parserFamily: 'ADJUDICATED_OBSERVATION_RECORD',
  roles: Object.freeze(['ADJUDICATED_OBSERVATION_BINDING'] as const),
});

/**
 * The terminal owner adjudication at the checkpoint itself. Its SHA-256 was
 * recomputed in full from `<checkpoint>:<path>` before it was written here.
 */
const POST_P24_ADJUDICATION_ENTRY: GovernanceRegistryEntryV3 = Object.freeze({
  id: POST_P24_ADJUDICATION_REGISTRY_ID,
  path: 'docs/evaluation/PHASE_2B_2D_A2_POST_P24_REPLACEMENT_AND_PRIMARY_CONTINUATION_EVIDENCE_ADJUDICATION_V1.json',
  sha256: '8d6e48d8a98028f36f961f53a9ab98980b59b1352910f64df1471a45a6e30577',
  bytes: 92216,
  commit: COMMITTED_A2_GOVERNANCE_CHECKPOINT_V3,
  expectedRecordKind: 'LIVE_WINDOW_EVIDENCE_ADJUDICATION',
  expectedRecordId:
    'phase2b-2d-a2-post-p24-replacement-and-primary-continuation-evidence-adjudication-v1',
  parserFamily: POST_P24_WINDOW_FAMILY,
  roles: Object.freeze(['TERMINAL_DISPOSITION_AUTHORITY'] as const),
});

/** The entries V3 adds, by id. Nothing else may appear in V3 and not in V2. */
export const REGISTRY_V3_ADDED_IDS: readonly string[] = Object.freeze([
  POST_P24_LIVE_RESULT_REGISTRY_ID,
  POST_P24_ADJUDICATION_REGISTRY_ID,
]);

// ---------------------------------------------------------------------------
// D. REGISTRY V3.
// ---------------------------------------------------------------------------

/**
 * Registry V2's entries in V2's order - the unchanged ones are the V2 OBJECTS
 * THEMSELVES, not copies - with the ledger binding replaced, then the two
 * additions. The length is whatever that construction yields; nothing here
 * asserts it.
 */
export const COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES: readonly GovernanceRegistryEntryV3[] =
  Object.freeze([
    ...COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES.map((entry) =>
      entry.id === REPLACEMENT_LEDGER_REGISTRY_ID ? REPLACEMENT_LEDGER_V3_ENTRY : entry,
    ),
    POST_P24_LIVE_RESULT_ENTRY,
    POST_P24_ADJUDICATION_ENTRY,
  ]);

/** The ids Registry V2 registers, i.e. the V2-compatible subview. Derived, never listed. */
export const REGISTRY_V2_IDS: ReadonlySet<string> = new Set(
  COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES.map((entry) => entry.id),
);

// ---------------------------------------------------------------------------
// E. COMPOSITION PROOF.
// ---------------------------------------------------------------------------

/** Record kinds that can never be governance input: they carry no disposition. */
const NON_GOVERNANCE_PATH_TOKENS = Object.freeze([
  '_STRATEGY_',
  '_PLAN_',
  '_LIVE_AUTHORITY_',
  '_PRENETWORK_',
  '_STATE_SUMMARY',
]);

export interface RegistryV3Composition {
  readonly v2EntryCount: number;
  readonly v3EntryCount: number;
  readonly unchangedIds: readonly string[];
  readonly replacedIds: readonly string[];
  readonly addedIds: readonly string[];
}

function sameEntry(a: GovernanceRegistryEntryV3, b: GovernanceRegistryEntryV3): boolean {
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
 * Proves V3 is exactly "V2, one binding replaced, two entries added". Every
 * unchanged V2 entry must agree on id, path, SHA-256, bytes, commit,
 * discriminators, family and roles; the replaced ledger must keep its id,
 * path, family, roles and discriminators and change its bytes; and no
 * strategy, plan, live authority, pre-network assignment or state summary may
 * appear anywhere.
 */
export function proveRegistryV3Composition(
  v3: readonly GovernanceRegistryEntryV3[] = COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES,
  v2: readonly GovernanceRegistryEntryV2[] = COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES,
): RegistryV3Composition {
  const byId = new Map(v3.map((entry) => [entry.id, entry]));
  if (byId.size !== v3.length) {
    refuseV3('REGISTRY_V3_DUPLICATE_ENTRY', 'registry V3 repeats an id');
  }
  const unchangedIds: string[] = [];
  const replacedIds: string[] = [];
  for (const old of v2) {
    const next = byId.get(old.id);
    if (next === undefined) {
      refuseV3('REGISTRY_V3_COMPOSITION_INVALID', `registry V3 drops V2 entry ${old.id}`);
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
      refuseV3(
        'REGISTRY_V3_COMPOSITION_INVALID',
        `registry V3 changes V2 entry ${old.id} beyond the one permitted ledger rebinding`,
      );
    }
    replacedIds.push(old.id);
  }
  const v2Ids = new Set(v2.map((entry) => entry.id));
  const addedIds = v3.filter((entry) => !v2Ids.has(entry.id)).map((entry) => entry.id);
  if (
    addedIds.length !== REGISTRY_V3_ADDED_IDS.length ||
    addedIds.some((id, index) => id !== REGISTRY_V3_ADDED_IDS[index])
  ) {
    refuseV3('REGISTRY_V3_COMPOSITION_INVALID', 'registry V3 adds entries it does not declare');
  }
  for (const entry of v3) {
    if (NON_GOVERNANCE_PATH_TOKENS.some((token) => entry.path.includes(token))) {
      refuseV3(
        'REGISTRY_V3_COMPOSITION_INVALID',
        `${entry.id} names a record kind that can never carry a disposition`,
      );
    }
  }
  return Object.freeze({
    v2EntryCount: v2.length,
    v3EntryCount: v3.length,
    unchangedIds: Object.freeze(unchangedIds),
    replacedIds: Object.freeze(replacedIds),
    addedIds: Object.freeze(addedIds),
  });
}
