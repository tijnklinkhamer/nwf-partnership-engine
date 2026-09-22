/**
 * PHASE 2B-2D — A3 R19: THE ACQUISITION-POLICY TRANSITION LEDGER CHAIN
 * VALIDATOR AND RUN-SUPERSESSION GRAPH.
 *
 * R18 found that the transition-ledger family had no canonical offline
 * validator, unlike the reserve replacement ledger. This module is it.
 *
 * WHAT A TRANSITION IS, AND IS NOT
 *
 *   A transition changes WHICH RUN of ONE occupant the generation reads. A
 *   replacement changes WHO OCCUPIES a slot. They are different axes, and this
 *   module never mixes them: every edge here declares `reserveConsumed: false`,
 *   `replacementCreated: false`, `organisationChanged: false`,
 *   `selectionIndexChanged: false` and `splitChanged: false`, and a declaration
 *   that says otherwise is a refusal.
 *
 * THE CHAIN IS EXPLICIT, NEVER DISCOVERED
 *
 *   V2 -> V3 -> V4 -> V6, named by Registry V1. There is deliberately no V5
 *   ledger, so V6's predecessor IS V4 and that is checked, not tolerated.
 *   Nothing here globs a directory, sorts version numbers or looks for a
 *   newest file, and a historical `isTheCurrentLedgerOfRecord: true` flag -
 *   which V3 and V4 both carry, truthfully, for their own moment - establishes
 *   NOTHING about present-day currentness. Registry V1 pins the tip.
 *
 * CARRY-FORWARD, EXACTLY AS THE COMMITTED SCHEMAS DO IT
 *
 *   A new version copies every predecessor entry with its substance unchanged
 *   and evolves exactly ONE field, `carriedForwardFromLedgerVersion`:
 *
 *     - absent in the predecessor  -> ADDED, valued the predecessor's version;
 *     - `null` in the predecessor  -> SET to the predecessor's version;
 *     - a string in the predecessor -> PRESERVED byte for byte.
 *
 *   So the field always names the version that INTRODUCED the entry. Every
 *   other field must be deep-equal, with no key added and none removed. A
 *   loose deep equality over the whole entry would reject that intended
 *   evolution; anything looser than this would admit a real mutation.
 *
 * THIS MODULE IS PURE. Its input is already-verified parsed JSON.
 */
import { refuse } from './refusal.js';
import type { VerifiedGovernance } from './loader.js';
import { requireFile } from './loader.js';
import { TRANSITION_LEDGER_CHAIN_V1, TRANSITION_LEDGER_TIP_V1 } from './registryV1.js';

const LOWER_HEX_SHA256 = /^[0-9a-f]{64}$/;
const FETCH_POLICY_VERSION = /^orgunit-fetch-policy-v[1-9][0-9]*$/;
const LEDGER_VERSION_TOKEN = /^V[1-9][0-9]*_GEN1$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHex(value: unknown): value is string {
  return typeof value === 'string' && LOWER_HEX_SHA256.test(value);
}

/** Deep structural equality over JSON values. Key order is irrelevant. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((value, index) => deepEqual(value, b[index]));
  }
  if (isObject(a) && isObject(b)) {
    const aKeys = Object.keys(a).sort();
    const bKeys = Object.keys(b).sort();
    if (aKeys.length !== bKeys.length || aKeys.some((key, i) => key !== bKeys[i])) return false;
    return aKeys.every((key) => deepEqual(a[key], b[key]));
  }
  return false;
}

// ---------------------------------------------------------------------------
// A. ONE VALIDATED LEDGER VERSION.
// ---------------------------------------------------------------------------

/** The version token a ledger's own recordKind declares, e.g. `V4_GEN1`. */
function versionTokenOf(recordKind: unknown, at: string): string {
  if (typeof recordKind !== 'string') {
    refuse('TRANSITION_LEDGER_MALFORMED', `${at} recordKind is not a string`);
  }
  const found = /^ACQUISITION_POLICY_TRANSITION_LEDGER_(V[1-9][0-9]*_GEN1)$/.exec(recordKind);
  if (found === null) {
    refuse('TRANSITION_LEDGER_MALFORMED', `${at} recordKind is not a transition-ledger recordKind`);
  }
  return found[1]!;
}

export interface TransitionLedgerVersion {
  readonly registryId: string;
  readonly versionToken: string;
  readonly entries: readonly Record<string, unknown>[];
  readonly declaredEntryCount: number;
}

function readLedgerVersion(
  governance: VerifiedGovernance,
  registryId: string,
): TransitionLedgerVersion {
  const file = requireFile(governance, registryId);
  const record = file.parsed;
  const versionToken = versionTokenOf(record.recordKind, registryId);
  if (record.generationId !== 'METHODOLOGY_V2_GEN1') {
    refuse('TRANSITION_LEDGER_MALFORMED', `${registryId} names another generation`);
  }
  if (record.appendOnly !== true) {
    refuse('TRANSITION_LEDGER_MALFORMED', `${registryId} does not declare itself append-only`);
  }
  if (!Array.isArray(record.entries)) {
    refuse('TRANSITION_LEDGER_MALFORMED', `${registryId} has no entries array`);
  }
  const entries = record.entries;
  if (!entries.every(isObject)) {
    refuse('TRANSITION_LEDGER_MALFORMED', `${registryId} holds a non-object entry`);
  }
  if (typeof record.entryCount !== 'number' || record.entryCount !== entries.length) {
    refuse(
      'TRANSITION_LEDGER_ENTRY_COUNT_MISMATCH',
      `${registryId} entryCount does not equal its entries array length`,
    );
  }
  entries.forEach((entry, index) => {
    if ((entry as Record<string, unknown>).entryIndex !== index) {
      refuse('TRANSITION_LEDGER_MALFORMED', `${registryId} entry ${String(index)} is out of order`);
    }
  });
  return Object.freeze({
    registryId,
    versionToken,
    entries: Object.freeze(entries as Record<string, unknown>[]),
    declaredEntryCount: entries.length,
  });
}

// ---------------------------------------------------------------------------
// B. THE PREDECESSOR CONTRACT AND CARRY-FORWARD.
// ---------------------------------------------------------------------------

const CARRY_FORWARD_FIELD = 'carriedForwardFromLedgerVersion';

function checkPredecessorBinding(
  governance: VerifiedGovernance,
  successorId: string,
  predecessor: TransitionLedgerVersion,
): void {
  const file = requireFile(governance, successorId);
  const declared: unknown = file.parsed.predecessor;
  if (!isObject(declared)) {
    refuse(
      'TRANSITION_LEDGER_PREDECESSOR_MISMATCH',
      `${successorId} declares no predecessor binding`,
    );
  }
  const predecessorFile = requireFile(governance, predecessor.registryId);
  if (declared.path !== predecessorFile.entry.path) {
    refuse(
      'TRANSITION_LEDGER_PREDECESSOR_MISMATCH',
      `${successorId} predecessor path is not the registered predecessor`,
    );
  }
  if (declared.sha256 !== predecessorFile.sha256) {
    refuse(
      'TRANSITION_LEDGER_PREDECESSOR_MISMATCH',
      `${successorId} predecessor SHA-256 is not the predecessor's exact bytes`,
    );
  }
  if (declared.bytes !== predecessorFile.bytes) {
    refuse(
      'TRANSITION_LEDGER_PREDECESSOR_MISMATCH',
      `${successorId} predecessor byte count is not the predecessor's`,
    );
  }
  if (declared.entryCountAtThatVersion !== predecessor.declaredEntryCount) {
    refuse(
      'TRANSITION_LEDGER_ENTRY_COUNT_MISMATCH',
      `${successorId} predecessor entry count is not the predecessor's own`,
    );
  }
  if (declared.editedByThisRecord !== false || declared.deletedByThisRecord !== false) {
    refuse(
      'TRANSITION_LEDGER_PREDECESSOR_MISMATCH',
      `${successorId} does not declare its predecessor unedited and undeleted`,
    );
  }
  // Only V6 restates the predecessor's recordKind; when present it must agree.
  if (
    declared.recordKind !== undefined &&
    declared.recordKind !== `ACQUISITION_POLICY_TRANSITION_LEDGER_${predecessor.versionToken}`
  ) {
    refuse(
      'TRANSITION_LEDGER_PREDECESSOR_MISMATCH',
      `${successorId} predecessor recordKind is not the predecessor's own`,
    );
  }
}

/**
 * Proves that `successor` carries every predecessor entry forward with its
 * substance unchanged, under the exact `carriedForwardFromLedgerVersion`
 * evolution the committed schemas use.
 */
function checkCarryForward(
  predecessor: TransitionLedgerVersion,
  successor: TransitionLedgerVersion,
): void {
  if (successor.entries.length < predecessor.entries.length) {
    refuse(
      'TRANSITION_LEDGER_ENTRY_COUNT_MISMATCH',
      `${successor.registryId} holds fewer entries than its predecessor`,
    );
  }
  predecessor.entries.forEach((before, index) => {
    const after = successor.entries[index]!;
    const at = `${successor.registryId} carried-forward entry ${String(index)}`;

    const beforeKeys = Object.keys(before)
      .filter((key) => key !== CARRY_FORWARD_FIELD)
      .sort();
    const afterKeys = Object.keys(after)
      .filter((key) => key !== CARRY_FORWARD_FIELD)
      .sort();
    if (beforeKeys.length !== afterKeys.length || beforeKeys.some((k, i) => k !== afterKeys[i])) {
      refuse('TRANSITION_LEDGER_CARRY_FORWARD_MUTATED', `${at} changed its field set`);
    }
    for (const key of beforeKeys) {
      if (!deepEqual(before[key], after[key])) {
        refuse('TRANSITION_LEDGER_CARRY_FORWARD_MUTATED', `${at} changed field ${key}`);
      }
    }

    const had = CARRY_FORWARD_FIELD in before;
    const previous = had ? before[CARRY_FORWARD_FIELD] : undefined;
    const expected = !had || previous === null ? predecessor.versionToken : (previous as unknown);
    if (!deepEqual(after[CARRY_FORWARD_FIELD], expected)) {
      refuse(
        'TRANSITION_LEDGER_CARRY_FORWARD_MUTATED',
        `${at} ${CARRY_FORWARD_FIELD} is not the version that introduced it`,
      );
    }
    if (typeof expected !== 'string' || !LEDGER_VERSION_TOKEN.test(expected)) {
      refuse(
        'TRANSITION_LEDGER_CARRY_FORWARD_MUTATED',
        `${at} ${CARRY_FORWARD_FIELD} is not a ledger version token`,
      );
    }
  });
  successor.entries.slice(predecessor.entries.length).forEach((entry, offset) => {
    const at = `${successor.registryId} new entry ${String(predecessor.entries.length + offset)}`;
    if (!(CARRY_FORWARD_FIELD in entry) || entry[CARRY_FORWARD_FIELD] !== null) {
      refuse(
        'TRANSITION_LEDGER_CARRY_FORWARD_MUTATED',
        `${at} does not declare ${CARRY_FORWARD_FIELD}: null`,
      );
    }
  });
}

// ---------------------------------------------------------------------------
// C. NORMALISED EDGES.
// ---------------------------------------------------------------------------

export interface NormalisedTransitionEdge {
  readonly entryIndex: number;
  readonly selectionIndex: number;
  readonly split: string;
  readonly oldPolicyVersion: string;
  readonly newPolicyVersion: string;
  readonly oldRunOpaqueRef: string;
  readonly newRunOpaqueRef: string;
  /** The ledger version that INTRODUCED this edge, from the tip's own field. */
  readonly introducedByLedgerVersion: string;
  readonly transitionReason: string;
}

function normaliseEdge(
  entry: Record<string, unknown>,
  tipVersionToken: string,
  at: string,
): NormalisedTransitionEdge {
  const {
    entryIndex,
    selectionIndex,
    split,
    oldPolicyVersion,
    newPolicyVersion,
    oldRunOpaqueRef,
    newRunOpaqueRef,
    transitionReason,
  } = entry;
  if (typeof entryIndex !== 'number' || !Number.isInteger(entryIndex) || entryIndex < 0) {
    refuse('TRANSITION_EDGE_MALFORMED', `${at} entryIndex is not a non-negative integer`);
  }
  if (
    typeof selectionIndex !== 'number' ||
    !Number.isInteger(selectionIndex) ||
    selectionIndex < 0
  ) {
    refuse('TRANSITION_EDGE_MALFORMED', `${at} selectionIndex is not a non-negative integer`);
  }
  if (typeof split !== 'string' || split.length === 0) {
    refuse('TRANSITION_EDGE_MALFORMED', `${at} split is not a string`);
  }
  if (typeof oldPolicyVersion !== 'string' || !FETCH_POLICY_VERSION.test(oldPolicyVersion)) {
    refuse('TRANSITION_EDGE_MALFORMED', `${at} oldPolicyVersion is not a fetch-policy version`);
  }
  if (typeof newPolicyVersion !== 'string' || !FETCH_POLICY_VERSION.test(newPolicyVersion)) {
    refuse('TRANSITION_EDGE_MALFORMED', `${at} newPolicyVersion is not a fetch-policy version`);
  }
  if (!isHex(oldRunOpaqueRef) || !isHex(newRunOpaqueRef)) {
    refuse('TRANSITION_EDGE_RUN_REF_MALFORMED', `${at} carries a non lower-hex SHA-256 run ref`);
  }
  if (oldRunOpaqueRef === newRunOpaqueRef) {
    refuse('TRANSITION_EDGE_SELF_SUPERSESSION', `${at} supersedes a run by itself`);
  }
  if (oldPolicyVersion === newPolicyVersion) {
    refuse('TRANSITION_EDGE_MALFORMED', `${at} declares no policy change`);
  }
  // Every edge must DECLARE that it changed nothing about occupancy.
  for (const flag of [
    'reserveConsumed',
    'replacementCreated',
    'organisationChanged',
    'selectionIndexChanged',
    'splitChanged',
  ] as const) {
    if (entry[flag] !== false) {
      refuse('TRANSITION_EDGE_DECLARATION_INCONSISTENT', `${at} does not declare ${flag}: false`);
    }
  }
  if (entry.historicalRunRetained !== true) {
    refuse(
      'TRANSITION_EDGE_DECLARATION_INCONSISTENT',
      `${at} does not declare its superseded run retained`,
    );
  }
  if (typeof transitionReason !== 'string' || transitionReason.length === 0) {
    refuse('TRANSITION_EDGE_MALFORMED', `${at} has no transition reason`);
  }
  const introduced = entry[CARRY_FORWARD_FIELD];
  const introducedByLedgerVersion = introduced === null ? tipVersionToken : (introduced as string);
  if (
    typeof introducedByLedgerVersion !== 'string' ||
    !LEDGER_VERSION_TOKEN.test(introducedByLedgerVersion)
  ) {
    refuse('TRANSITION_EDGE_MALFORMED', `${at} introducing ledger version is not a version token`);
  }
  return Object.freeze({
    entryIndex,
    selectionIndex,
    split,
    oldPolicyVersion,
    newPolicyVersion,
    oldRunOpaqueRef,
    newRunOpaqueRef,
    introducedByLedgerVersion,
    transitionReason,
  });
}

// ---------------------------------------------------------------------------
// D. THE VALIDATED CHAIN.
// ---------------------------------------------------------------------------

export interface ValidatedTransitionLedgerChain {
  readonly versions: readonly TransitionLedgerVersion[];
  readonly tip: TransitionLedgerVersion;
  readonly tipRegistryId: string;
  readonly edges: readonly NormalisedTransitionEdge[];
  /** How many versions declared themselves current when written. Never used to select. */
  readonly historicalCurrentFlagCount: number;
}

export function validateTransitionLedgerChain(
  governance: VerifiedGovernance,
  chain: readonly string[] = TRANSITION_LEDGER_CHAIN_V1,
  tipRegistryId: string = TRANSITION_LEDGER_TIP_V1,
): ValidatedTransitionLedgerChain {
  if (chain.length < 2) {
    refuse(
      'TRANSITION_LEDGER_CHAIN_MALFORMED',
      'the transition chain names fewer than two versions',
    );
  }
  if (chain[chain.length - 1] !== tipRegistryId) {
    refuse(
      'TRANSITION_LEDGER_CHAIN_MALFORMED',
      'the registered tip is not the last version of the registered chain',
    );
  }
  const versions = chain.map((id) => readLedgerVersion(governance, id));
  const seenTokens = new Set<string>();
  for (const version of versions) {
    if (seenTokens.has(version.versionToken)) {
      refuse('TRANSITION_LEDGER_CHAIN_MALFORMED', 'the chain names one version token twice');
    }
    seenTokens.add(version.versionToken);
  }
  for (let i = 1; i < versions.length; i += 1) {
    checkPredecessorBinding(governance, versions[i]!.registryId, versions[i - 1]!);
    checkCarryForward(versions[i - 1]!, versions[i]!);
  }
  const tip = versions[versions.length - 1]!;
  const edges = tip.entries.map((entry, index) =>
    normaliseEdge(entry, tip.versionToken, `${tip.registryId} edge ${String(index)}`),
  );
  const historicalCurrentFlagCount = versions.filter(
    (version) =>
      requireFile(governance, version.registryId).parsed.isTheCurrentLedgerOfRecord === true,
  ).length;
  return Object.freeze({
    versions: Object.freeze(versions),
    tip,
    tipRegistryId,
    edges: Object.freeze(edges),
    historicalCurrentFlagCount,
  });
}

// ---------------------------------------------------------------------------
// E. THE RUN-SUPERSESSION GRAPH, PER SLOT.
// ---------------------------------------------------------------------------

/** One maximal supersession path for one selection slot: run[0] -> ... -> tail. */
export interface RunSupersessionChain {
  readonly selectionIndex: number;
  readonly split: string;
  /** Every run ref on the path, oldest first. The last one is the tail. */
  readonly runRefs: readonly string[];
  readonly edges: readonly NormalisedTransitionEdge[];
}

/**
 * Builds the per-slot supersession chains. Fails closed on a cycle, a fork
 * (one run superseded twice, or two runs superseded INTO one), a split change
 * and a selectionIndex change. There is no global run graph: edges are grouped
 * by slot FIRST, so a coincidence across slots can never join two chains.
 */
export function buildRunSupersessionChains(
  edges: readonly NormalisedTransitionEdge[],
): readonly RunSupersessionChain[] {
  const bySlot = new Map<number, NormalisedTransitionEdge[]>();
  for (const edge of edges) {
    const group = bySlot.get(edge.selectionIndex) ?? [];
    group.push(edge);
    bySlot.set(edge.selectionIndex, group);
  }
  const chains: RunSupersessionChain[] = [];
  for (const [selectionIndex, group] of [...bySlot.entries()].sort((a, b) => a[0] - b[0])) {
    const splits = new Set(group.map((edge) => edge.split));
    if (splits.size !== 1) {
      refuse(
        'TRANSITION_GRAPH_FORK',
        `selection slot ${String(selectionIndex)} has edges in more than one split`,
      );
    }
    const successor = new Map<string, NormalisedTransitionEdge>();
    const predecessor = new Map<string, NormalisedTransitionEdge>();
    for (const edge of group) {
      if (successor.has(edge.oldRunOpaqueRef)) {
        refuse(
          'TRANSITION_GRAPH_FORK',
          `selection slot ${String(selectionIndex)} supersedes one run into two successors`,
        );
      }
      if (predecessor.has(edge.newRunOpaqueRef)) {
        refuse(
          'TRANSITION_GRAPH_FORK',
          `selection slot ${String(selectionIndex)} reaches one run from two predecessors`,
        );
      }
      successor.set(edge.oldRunOpaqueRef, edge);
      predecessor.set(edge.newRunOpaqueRef, edge);
    }
    const heads = [...successor.keys()].filter((ref) => !predecessor.has(ref)).sort();
    if (heads.length === 0) {
      refuse(
        'TRANSITION_GRAPH_CYCLE',
        `selection slot ${String(selectionIndex)} supersession has no unsuperseded head`,
      );
    }
    for (const head of heads) {
      const runRefs = [head];
      const walked: NormalisedTransitionEdge[] = [];
      const seen = new Set([head]);
      let cursor = head;
      for (;;) {
        const next = successor.get(cursor);
        if (next === undefined) break;
        if (seen.has(next.newRunOpaqueRef)) {
          refuse(
            'TRANSITION_GRAPH_CYCLE',
            `selection slot ${String(selectionIndex)} supersession returns to an earlier run`,
          );
        }
        seen.add(next.newRunOpaqueRef);
        runRefs.push(next.newRunOpaqueRef);
        walked.push(next);
        cursor = next.newRunOpaqueRef;
      }
      chains.push(
        Object.freeze({
          selectionIndex,
          split: group[0]!.split,
          runRefs: Object.freeze(runRefs),
          edges: Object.freeze(walked),
        }),
      );
    }
    const reachedEdges = chains
      .filter((chain) => chain.selectionIndex === selectionIndex)
      .reduce((total, chain) => total + chain.edges.length, 0);
    if (reachedEdges !== group.length) {
      refuse(
        'TRANSITION_GRAPH_CYCLE',
        `selection slot ${String(selectionIndex)} has edges unreachable from any head`,
      );
    }
  }
  return Object.freeze(chains);
}
