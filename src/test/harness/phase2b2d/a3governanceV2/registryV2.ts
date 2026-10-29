/**
 * PHASE 2B-2D — A3 R25: COMMITTED A2 GOVERNANCE REGISTRY, VERSION 2.
 *
 * ONE QUESTION
 *
 *   Which EXACT committed bytes - named by commit, path, SHA-256 and length -
 *   is the V2 snapshot allowed to interpret?
 *
 * WHY V2 IS COMMIT-ADDRESSED
 *
 *   Registry V1 pins the eight-entry replacement ledger. The A2 checkpoint V2
 *   describes holds the SAME repository path at a newer append-only revision
 *   with nine entries. Both revisions are legitimate, immutable history, so a
 *   path in a working tree is no longer enough to say WHICH governance a
 *   snapshot means. V2 therefore reads every entry from its own pinned commit
 *   (`commitLoader.ts`), and this A3 worktree keeps the eight-entry bytes that
 *   Registry V1 still reads - V1 is untouched, and still means exactly R19.
 *
 * WHAT THIS FILE IS, AND IS NOT
 *
 *   It is Registry V1's logical entries, REUSED BY REFERENCE, with exactly one
 *   binding replaced (the replacement ledger, by its nine-entry revision) and
 *   exactly two entries added (the second post-P18 window's live result and its
 *   terminal adjudication). It is NOT "latest A2": it is pinned to
 *   `COMMITTED_A2_GOVERNANCE_CHECKPOINT_V2` forever, and a later A2 checkpoint
 *   requires a later registry version. No glob, no enumeration, no branch, no
 *   newest anything.
 *
 * GIT IS A BYTE TRANSPORT HERE, NEVER AN AUTHORITY
 *
 *   Git does not decide which governance file is authoritative. This registry
 *   decides. Git only supplies the bytes already named by an exact commit, an
 *   exact path, an exact hash and an exact length - and those bytes are then
 *   re-hashed and re-counted before anything reads them.
 *
 * THIS MODULE IS PURE DATA. It opens nothing.
 */
import {
  CANONICAL_A2_GOVERNANCE_REGISTRY_V1,
  GOVERNANCE_PARSER_FAMILIES,
  type GovernanceRegistryEntry,
  type GovernanceSemanticRole,
} from '../a3governance/registryV1.js';
import { refuseV2 } from './refusal.js';

// ---------------------------------------------------------------------------
// A. THE CHECKPOINT THIS REGISTRY DESCRIBES.
// ---------------------------------------------------------------------------

export const COMMITTED_A2_GOVERNANCE_REGISTRY_V2 = 'COMMITTED_A2_GOVERNANCE_REGISTRY_V2';

/** The exact, already-adjudicated A2 commit Registry V2 describes. Not a branch. */
export const COMMITTED_A2_GOVERNANCE_CHECKPOINT_V2 = 'f76b8ae6653f1f8ec9dabd2d7eec3922c2e000f1';

// ---------------------------------------------------------------------------
// B. PARSER FAMILIES.
// ---------------------------------------------------------------------------

/** The one family V2 adds. It is read ONLY by `familiesV2.ts`. */
export const POST_P18_SECOND_WINDOW_FAMILY =
  'POST_P18_SECOND_REPLACEMENT_AND_PRIMARY_CONTINUATION_EVIDENCE_ADJUDICATION';

export const GOVERNANCE_PARSER_FAMILIES_V2 = Object.freeze([
  ...GOVERNANCE_PARSER_FAMILIES,
  POST_P18_SECOND_WINDOW_FAMILY,
] as const);
export type GovernanceParserFamilyV2 = (typeof GOVERNANCE_PARSER_FAMILIES_V2)[number];

export interface GovernanceRegistryEntryV2 {
  readonly id: string;
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
  /** The exact commit the bytes are READ FROM. Not a date, not a branch. */
  readonly commit: string;
  readonly expectedRecordKind: string | null;
  readonly expectedRecordId: string | null;
  readonly parserFamily: GovernanceParserFamilyV2;
  readonly roles: readonly GovernanceSemanticRole[];
}

// ---------------------------------------------------------------------------
// C. THE ONE REPLACED BINDING AND THE TWO ADDED ENTRIES.
// ---------------------------------------------------------------------------

export const REPLACEMENT_LEDGER_REGISTRY_ID = 'RESERVE_REPLACEMENT_LEDGER_V2_GEN1';

/**
 * The nine-entry revision of the SAME ledger path. Its family is a V1 family,
 * so the V1 parsers can read it; it is typed as a V1 entry on purpose.
 */
const REPLACEMENT_LEDGER_V2_ENTRY: GovernanceRegistryEntry = Object.freeze({
  id: REPLACEMENT_LEDGER_REGISTRY_ID,
  path: 'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_RESERVE_REPLACEMENT_LEDGER_V2_GEN1.json',
  sha256: '1a4c919d61b08c1a8dd7352ffe5e9d481e5db527c3ea82809879ccdfaeb50d4f',
  bytes: 10300,
  commit: 'c82f488ab5ad1551f616f08506c57d13087dff3b',
  expectedRecordKind: 'RESERVE_REPLACEMENT_LEDGER_V2_GEN1',
  expectedRecordId: null,
  parserFamily: 'RESERVE_REPLACEMENT_LEDGER',
  roles: Object.freeze(['OCCUPANT_CHAIN_AUTHORITY'] as const),
});

/**
 * The ledger's own recomputed hash and entry count at that revision. These are
 * byte-identity pins checked AFTER the canonical validator runs - never a
 * substitute for it.
 */
export const REPLACEMENT_LEDGER_V2_PIN = Object.freeze({
  ledgerHash: 'cc0aa07db079db2ab911a00484db3dac166d09046ec34964dcd1c376ffe0953d',
  entryCount: 9,
});

export const POST_P18_SECOND_LIVE_RESULT_REGISTRY_ID = 'POST_P18_SECOND_CONTINUATION_LIVE_RESULT';
export const POST_P18_SECOND_ADJUDICATION_REGISTRY_ID =
  'POST_P18_SECOND_CONTINUATION_EVIDENCE_ADJUDICATION';

/** The observation the new adjudication bound. Never itself terminal authority. */
const POST_P18_SECOND_LIVE_RESULT_ENTRY: GovernanceRegistryEntryV2 = Object.freeze({
  id: POST_P18_SECOND_LIVE_RESULT_REGISTRY_ID,
  path: 'docs/evaluation/PHASE_2B_2D_A2_POST_P18_SECOND_REPLACEMENT_AND_PRIMARY_CONTINUATION_LIVE_RESULT_V1.json',
  sha256: '3df8d1a3c385083278bcd3740e95c445c82d77db7800d5462ba80ccc27c3baee',
  bytes: 55900,
  commit: '117e1ea9367b0bc5608e4873f3460db79fa0dc31',
  expectedRecordKind: 'LIVE_WINDOW_RESULT_EVIDENCE_PENDING_ADJUDICATION',
  expectedRecordId:
    'phase2b-2d-a2-post-p18-second-replacement-and-primary-continuation-live-result-v1',
  parserFamily: 'ADJUDICATED_OBSERVATION_RECORD',
  roles: Object.freeze(['ADJUDICATED_OBSERVATION_BINDING'] as const),
});

/** The terminal owner adjudication at the checkpoint itself. */
const POST_P18_SECOND_ADJUDICATION_ENTRY: GovernanceRegistryEntryV2 = Object.freeze({
  id: POST_P18_SECOND_ADJUDICATION_REGISTRY_ID,
  path: 'docs/evaluation/PHASE_2B_2D_A2_POST_P18_SECOND_REPLACEMENT_AND_PRIMARY_CONTINUATION_EVIDENCE_ADJUDICATION_V1.json',
  sha256: '2a5f90fb0a998bec0eb9e94caef6ab7cf98522fb99411d0c48b076310e2d58ee',
  bytes: 72561,
  commit: COMMITTED_A2_GOVERNANCE_CHECKPOINT_V2,
  expectedRecordKind: 'LIVE_WINDOW_EVIDENCE_ADJUDICATION',
  expectedRecordId:
    'phase2b-2d-a2-post-p18-second-replacement-and-primary-continuation-evidence-adjudication-v1',
  parserFamily: POST_P18_SECOND_WINDOW_FAMILY,
  roles: Object.freeze(['TERMINAL_DISPOSITION_AUTHORITY'] as const),
});

/** The entries V2 adds, by id. Nothing else may appear in V2 and not in V1. */
export const REGISTRY_V2_ADDED_IDS: readonly string[] = Object.freeze([
  POST_P18_SECOND_LIVE_RESULT_REGISTRY_ID,
  POST_P18_SECOND_ADJUDICATION_REGISTRY_ID,
]);

// ---------------------------------------------------------------------------
// D. REGISTRY V2.
// ---------------------------------------------------------------------------

/**
 * Registry V1's entries in V1's order - the unchanged ones are the V1 OBJECTS
 * THEMSELVES, not copies - with the ledger binding replaced, then the two
 * additions. The length is whatever that construction yields; nothing here
 * asserts it.
 */
export const COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES: readonly GovernanceRegistryEntryV2[] =
  Object.freeze([
    ...CANONICAL_A2_GOVERNANCE_REGISTRY_V1.map((entry) =>
      entry.id === REPLACEMENT_LEDGER_REGISTRY_ID ? REPLACEMENT_LEDGER_V2_ENTRY : entry,
    ),
    POST_P18_SECOND_LIVE_RESULT_ENTRY,
    POST_P18_SECOND_ADJUDICATION_ENTRY,
  ]);

/** The ids the V1 family parsers are allowed to see. Derived, never listed. */
export const LEGACY_V1_REGISTRY_IDS: ReadonlySet<string> = new Set(
  CANONICAL_A2_GOVERNANCE_REGISTRY_V1.map((entry) => entry.id),
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

export interface RegistryV2Composition {
  readonly v1EntryCount: number;
  readonly v2EntryCount: number;
  readonly unchangedIds: readonly string[];
  readonly replacedIds: readonly string[];
  readonly addedIds: readonly string[];
}

function sameEntry(a: GovernanceRegistryEntryV2, b: GovernanceRegistryEntryV2): boolean {
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
 * Proves V2 is exactly "V1, one binding replaced, two entries added". Every
 * unchanged V1 entry must agree on id, path, SHA-256, bytes, commit,
 * discriminators, family and roles; the replaced ledger must keep its id,
 * path, family, roles and discriminators and change its bytes; and no
 * strategy, plan, live authority, pre-network assignment or state summary may
 * appear anywhere.
 */
export function proveRegistryV2Composition(
  v2: readonly GovernanceRegistryEntryV2[] = COMMITTED_A2_GOVERNANCE_REGISTRY_V2_ENTRIES,
  v1: readonly GovernanceRegistryEntry[] = CANONICAL_A2_GOVERNANCE_REGISTRY_V1,
): RegistryV2Composition {
  const byId = new Map(v2.map((entry) => [entry.id, entry]));
  if (byId.size !== v2.length) {
    refuseV2('REGISTRY_V2_DUPLICATE_ENTRY', 'registry V2 repeats an id');
  }
  const unchangedIds: string[] = [];
  const replacedIds: string[] = [];
  for (const old of v1) {
    const next = byId.get(old.id);
    if (next === undefined) {
      refuseV2('REGISTRY_V2_COMPOSITION_INVALID', `registry V2 drops V1 entry ${old.id}`);
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
      refuseV2(
        'REGISTRY_V2_COMPOSITION_INVALID',
        `registry V2 changes V1 entry ${old.id} beyond the one permitted ledger rebinding`,
      );
    }
    replacedIds.push(old.id);
  }
  const v1Ids = new Set(v1.map((entry) => entry.id));
  const addedIds = v2.filter((entry) => !v1Ids.has(entry.id)).map((entry) => entry.id);
  if (
    addedIds.length !== REGISTRY_V2_ADDED_IDS.length ||
    addedIds.some((id, index) => id !== REGISTRY_V2_ADDED_IDS[index])
  ) {
    refuseV2('REGISTRY_V2_COMPOSITION_INVALID', 'registry V2 adds entries it does not declare');
  }
  for (const entry of v2) {
    if (NON_GOVERNANCE_PATH_TOKENS.some((token) => entry.path.includes(token))) {
      refuseV2(
        'REGISTRY_V2_COMPOSITION_INVALID',
        `${entry.id} names a record kind that can never carry a disposition`,
      );
    }
  }
  return Object.freeze({
    v1EntryCount: v1.length,
    v2EntryCount: v2.length,
    unchangedIds: Object.freeze(unchangedIds),
    replacedIds: Object.freeze(replacedIds),
    addedIds: Object.freeze(addedIds),
  });
}
