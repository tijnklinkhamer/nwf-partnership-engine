/**
 * PHASE 2B-2D A3 R19 — THE ACQUISITION-POLICY TRANSITION LEDGER VALIDATOR AND
 * RUN-SUPERSESSION GRAPH.
 *
 * Proves the missing canonical offline validator R18 identified:
 *
 *   - the EXPLICIT V2 -> V3 -> V4 -> V6 chain accepts, with V6's predecessor
 *     being V4 DIRECTLY and no V5 ledger existing;
 *   - a predecessor SHA-256, byte count or entry count mismatch refuses;
 *   - an illegal carry-forward mutation refuses, while the intended
 *     `carriedForwardFromLedgerVersion` evolution is accepted;
 *   - a malformed run ref, `old === new`, a cycle, a fork and a split change
 *     each refuse;
 *   - a historical `isTheCurrentLedgerOfRecord: true` flag selects NOTHING:
 *     V3 and V4 both carry it, truthfully for their own moment, and the tip is
 *     the one Registry V1 names.
 */
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadRegisteredGovernance } from '../harness/phase2b2d/a3governance/loader.js';
import { A3GovernanceRefusal } from '../harness/phase2b2d/a3governance/refusal.js';
import {
  CANONICAL_A2_GOVERNANCE_REGISTRY_V1,
  TRANSITION_LEDGER_CHAIN_V1,
  registryEntryById,
  type GovernanceRegistryEntry,
} from '../harness/phase2b2d/a3governance/registryV1.js';
import {
  buildRunSupersessionChains,
  validateTransitionLedgerChain,
  type NormalisedTransitionEdge,
} from '../harness/phase2b2d/a3governance/transitionLedger.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const temporaryRoots: string[] = [];

afterAll(() => {
  for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true });
});

function governanceTree(): string {
  const root = mkdtempSync(join(tmpdir(), 'r19-transition-'));
  temporaryRoots.push(root);
  for (const entry of CANONICAL_A2_GOVERNANCE_REGISTRY_V1) {
    const destination = join(root, entry.path);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(REPO_ROOT, entry.path), destination);
  }
  return root;
}

/**
 * Rewrites one registered file and RE-REGISTERS its new digest, so the only
 * thing under test is the semantic rule, never the byte-drift guard.
 */
function withMutatedRecord(
  registryId: string,
  mutate: (record: Record<string, unknown>) => void,
): { root: string; registry: readonly GovernanceRegistryEntry[] } {
  const root = governanceTree();
  const entry = registryEntryById(registryId)!;
  const target = join(root, entry.path);
  const record = JSON.parse(readFileSync(target, 'utf8')) as Record<string, unknown>;
  mutate(record);
  const bytes = Buffer.from(JSON.stringify(record, null, 2));
  writeFileSync(target, bytes);
  const registry = CANONICAL_A2_GOVERNANCE_REGISTRY_V1.map((candidate) =>
    candidate.id === registryId
      ? {
          ...candidate,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          bytes: bytes.length,
        }
      : candidate,
  );
  return { root, registry };
}

function refusalCodeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(A3GovernanceRefusal);
    return (error as A3GovernanceRefusal).code;
  }
  throw new Error('expected a refusal, got a result');
}

function chainRefusal(
  registryId: string,
  mutate: (record: Record<string, unknown>) => void,
): string {
  const { root, registry } = withMutatedRecord(registryId, mutate);
  return refusalCodeOf(() =>
    validateTransitionLedgerChain(loadRegisteredGovernance(root, registry)),
  );
}

const V6 = 'ACQUISITION_POLICY_TRANSITION_LEDGER_V6';
const V4 = 'ACQUISITION_POLICY_TRANSITION_LEDGER_V4';

function edgesOf(record: Record<string, unknown>): Record<string, unknown>[] {
  return record.entries as Record<string, unknown>[];
}

// ---------------------------------------------------------------------------

describe('2D-A3 R19: the real V2 -> V3 -> V4 -> V6 chain', () => {
  const governance = loadRegisteredGovernance(REPO_ROOT);
  const chain = validateTransitionLedgerChain(governance);

  it('accepts the four explicit versions and takes V6 as the tip', () => {
    expect(chain.versions.map((version) => version.versionToken)).toEqual([
      'V2_GEN1',
      'V3_GEN1',
      'V4_GEN1',
      'V6_GEN1',
    ]);
    expect(chain.tipRegistryId).toBe(V6);
    expect(chain.tip.versionToken).toBe('V6_GEN1');
  });

  it("accepts V6's predecessor being V4 DIRECTLY, with no V5 ledger anywhere", () => {
    const v6 = loadRegisteredGovernance(REPO_ROOT).files.get(V6)!.parsed;
    const predecessor = v6.predecessor as Record<string, unknown>;
    expect(predecessor.recordKind).toBe('ACQUISITION_POLICY_TRANSITION_LEDGER_V4_GEN1');
    const noV5 = v6.noV5Ledger as Record<string, unknown>;
    expect(noV5.v5LedgerFileExists).toBe(false);
    expect(noV5.predecessorIsV4Directly).toBe(true);
    expect(TRANSITION_LEDGER_CHAIN_V1).not.toContain('ACQUISITION_POLICY_TRANSITION_LEDGER_V5');
  });

  it('carries the entry counts the committed versions declare', () => {
    expect(chain.versions.map((version) => version.declaredEntryCount)).toEqual([1, 3, 6, 7]);
    expect(chain.edges).toHaveLength(7);
  });

  it('derives the introducing ledger version of every edge from the tip itself', () => {
    expect(chain.edges.map((edge) => edge.introducedByLedgerVersion)).toEqual([
      'V2_GEN1',
      'V3_GEN1',
      'V3_GEN1',
      'V4_GEN1',
      'V4_GEN1',
      'V4_GEN1',
      'V6_GEN1',
    ]);
  });

  it('normalises every edge with a lower-hex run ref, a real policy change and old !== new', () => {
    for (const edge of chain.edges) {
      expect(edge.oldRunOpaqueRef).toMatch(/^[0-9a-f]{64}$/);
      expect(edge.newRunOpaqueRef).toMatch(/^[0-9a-f]{64}$/);
      expect(edge.oldRunOpaqueRef).not.toBe(edge.newRunOpaqueRef);
      expect(edge.oldPolicyVersion).not.toBe(edge.newPolicyVersion);
      expect(edge.transitionReason.length).toBeGreaterThan(0);
    }
  });

  it('does NOT let a historical isTheCurrentLedgerOfRecord flag select the tip', () => {
    // V3, V4 and V6 each carry it, truthfully for their own moment.
    expect(chain.historicalCurrentFlagCount).toBe(3);
    expect(chain.tip.versionToken).toBe('V6_GEN1');
  });
});

describe('2D-A3 R19: the chain validator fails closed', () => {
  it('refuses a predecessor SHA-256 mutation', () => {
    expect(
      chainRefusal(V6, (record) => {
        (record.predecessor as Record<string, unknown>).sha256 = 'a'.repeat(64);
      }),
    ).toBe('TRANSITION_LEDGER_PREDECESSOR_MISMATCH');
  });

  it('refuses a predecessor byte-count mutation', () => {
    expect(
      chainRefusal(V6, (record) => {
        (record.predecessor as Record<string, unknown>).bytes = 1;
      }),
    ).toBe('TRANSITION_LEDGER_PREDECESSOR_MISMATCH');
  });

  it('refuses a predecessor path that is not the registered predecessor', () => {
    expect(
      chainRefusal(V6, (record) => {
        (record.predecessor as Record<string, unknown>).path =
          'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_DRAW_V2_GEN1.json';
      }),
    ).toBe('TRANSITION_LEDGER_PREDECESSOR_MISMATCH');
  });

  it('refuses a predecessor that declares itself edited by the successor', () => {
    expect(
      chainRefusal(V6, (record) => {
        (record.predecessor as Record<string, unknown>).editedByThisRecord = true;
      }),
    ).toBe('TRANSITION_LEDGER_PREDECESSOR_MISMATCH');
  });

  it('refuses a predecessor entry-count mutation', () => {
    expect(
      chainRefusal(V6, (record) => {
        (record.predecessor as Record<string, unknown>).entryCountAtThatVersion = 5;
      }),
    ).toBe('TRANSITION_LEDGER_ENTRY_COUNT_MISMATCH');
  });

  it('refuses an entryCount that disagrees with its own entries array', () => {
    expect(
      chainRefusal(V6, (record) => {
        record.entryCount = 99;
      }),
    ).toBe('TRANSITION_LEDGER_ENTRY_COUNT_MISMATCH');
  });

  it('refuses a carried-forward entry whose substance was mutated', () => {
    expect(
      chainRefusal(V6, (record) => {
        edgesOf(record)[0]!.transitionReason = 'SOMETHING_ELSE';
      }),
    ).toBe('TRANSITION_LEDGER_CARRY_FORWARD_MUTATED');
  });

  it('refuses a carried-forward entry that gained a field', () => {
    expect(
      chainRefusal(V6, (record) => {
        edgesOf(record)[0]!.aNewField = true;
      }),
    ).toBe('TRANSITION_LEDGER_CARRY_FORWARD_MUTATED');
  });

  it('refuses a carried-forward entry that lost a field', () => {
    expect(
      chainRefusal(V6, (record) => {
        delete edgesOf(record)[0]!.transitionReason;
      }),
    ).toBe('TRANSITION_LEDGER_CARRY_FORWARD_MUTATED');
  });

  it('refuses a carriedForwardFromLedgerVersion rewritten to a later version', () => {
    expect(
      chainRefusal(V6, (record) => {
        edgesOf(record)[0]!.carriedForwardFromLedgerVersion = 'V6_GEN1';
      }),
    ).toBe('TRANSITION_LEDGER_CARRY_FORWARD_MUTATED');
  });

  it('refuses a NEW entry that does not declare carriedForwardFromLedgerVersion: null', () => {
    expect(
      chainRefusal(V6, (record) => {
        edgesOf(record)[6]!.carriedForwardFromLedgerVersion = 'V4_GEN1';
      }),
    ).toBe('TRANSITION_LEDGER_CARRY_FORWARD_MUTATED');
  });

  it("ACCEPTS the intended evolution: V4's new entries became V4_GEN1 in V6", () => {
    // The already-committed chain is exactly that evolution, and it validates.
    const chain = validateTransitionLedgerChain(loadRegisteredGovernance(REPO_ROOT));
    const v4Entries = chain.versions[2]!.entries;
    expect(v4Entries[3]!.carriedForwardFromLedgerVersion).toBeNull();
    expect(chain.tip.entries[3]!.carriedForwardFromLedgerVersion).toBe('V4_GEN1');
  });

  it('refuses a malformed run reference', () => {
    expect(
      chainRefusal(V6, (record) => {
        edgesOf(record)[6]!.newRunOpaqueRef = 'not-a-digest';
      }),
    ).toBe('TRANSITION_EDGE_RUN_REF_MALFORMED');
  });

  it('refuses an edge that supersedes a run by itself', () => {
    expect(
      chainRefusal(V6, (record) => {
        const edge = edgesOf(record)[6]!;
        edge.newRunOpaqueRef = edge.oldRunOpaqueRef;
      }),
    ).toBe('TRANSITION_EDGE_SELF_SUPERSESSION');
  });

  it('refuses an edge that declares a reserve consumed or a replacement created', () => {
    expect(
      chainRefusal(V6, (record) => {
        edgesOf(record)[6]!.reserveConsumed = true;
      }),
    ).toBe('TRANSITION_EDGE_DECLARATION_INCONSISTENT');
    expect(
      chainRefusal(V6, (record) => {
        edgesOf(record)[6]!.replacementCreated = true;
      }),
    ).toBe('TRANSITION_EDGE_DECLARATION_INCONSISTENT');
    expect(
      chainRefusal(V6, (record) => {
        edgesOf(record)[6]!.selectionIndexChanged = true;
      }),
    ).toBe('TRANSITION_EDGE_DECLARATION_INCONSISTENT');
    expect(
      chainRefusal(V6, (record) => {
        edgesOf(record)[6]!.splitChanged = true;
      }),
    ).toBe('TRANSITION_EDGE_DECLARATION_INCONSISTENT');
  });

  it('refuses a chain whose registered tip is not its last version', () => {
    expect(
      refusalCodeOf(() =>
        validateTransitionLedgerChain(
          loadRegisteredGovernance(REPO_ROOT),
          TRANSITION_LEDGER_CHAIN_V1,
          V4,
        ),
      ),
    ).toBe('TRANSITION_LEDGER_CHAIN_MALFORMED');
  });
});

describe('2D-A3 R19: the run-supersession graph', () => {
  const chain = validateTransitionLedgerChain(loadRegisteredGovernance(REPO_ROOT));

  const edge = (
    selectionIndex: number,
    older: string,
    newer: string,
    split = 'DEV_TRAIN',
  ): NormalisedTransitionEdge =>
    Object.freeze({
      entryIndex: 0,
      selectionIndex,
      split,
      oldPolicyVersion: 'orgunit-fetch-policy-v1',
      newPolicyVersion: 'orgunit-fetch-policy-v2',
      oldRunOpaqueRef: older.repeat(64),
      newRunOpaqueRef: newer.repeat(64),
      introducedByLedgerVersion: 'V2_GEN1',
      transitionReason: 'TEST',
    });

  it('builds one chain per slot from the real edges, with no cycle and no fork', () => {
    const chains = buildRunSupersessionChains(chain.edges);
    expect(chains).toHaveLength(7);
    expect(chains.map((c) => c.selectionIndex).sort((a, b) => a - b)).toEqual([
      1, 4, 5, 6, 7, 8, 12,
    ]);
    for (const built of chains) {
      expect(built.runRefs.length).toBe(built.edges.length + 1);
      expect(new Set(built.runRefs).size).toBe(built.runRefs.length);
    }
  });

  it('never joins two slots into one graph, even on a shared run reference', () => {
    const chains = buildRunSupersessionChains([
      edge(1, 'a', 'b'),
      edge(2, 'b', 'c', 'DEV_CONFIRM'),
    ]);
    expect(chains).toHaveLength(2);
    expect(chains[0]!.runRefs).toHaveLength(2);
    expect(chains[1]!.runRefs).toHaveLength(2);
  });

  it('refuses a cycle', () => {
    expect(
      refusalCodeOf(() => buildRunSupersessionChains([edge(1, 'a', 'b'), edge(1, 'b', 'a')])),
    ).toBe('TRANSITION_GRAPH_CYCLE');
  });

  it('refuses a fork on the outgoing side', () => {
    expect(
      refusalCodeOf(() => buildRunSupersessionChains([edge(1, 'a', 'b'), edge(1, 'a', 'c')])),
    ).toBe('TRANSITION_GRAPH_FORK');
  });

  it('refuses a fork on the incoming side', () => {
    expect(
      refusalCodeOf(() => buildRunSupersessionChains([edge(1, 'a', 'c'), edge(1, 'b', 'c')])),
    ).toBe('TRANSITION_GRAPH_FORK');
  });

  it('refuses one slot whose edges disagree about the split', () => {
    expect(
      refusalCodeOf(() =>
        buildRunSupersessionChains([edge(1, 'a', 'b'), edge(1, 'b', 'c', 'FINAL_HOLDOUT')]),
      ),
    ).toBe('TRANSITION_GRAPH_FORK');
  });
});
