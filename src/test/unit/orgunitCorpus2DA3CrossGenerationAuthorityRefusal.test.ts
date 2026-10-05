/**
 * PHASE 2B-2D A3 R38 — THE CROSS-GENERATION AUTHORITY ADAPTER REFUSAL.
 *
 * R38 asked whether the terminal Generation-2 A2 checkpoint (29d0d48) can be
 * presented to the UNCHANGED R17 slot-authority contract without identity
 * translation. It cannot, and this file proves why from exact committed bytes:
 *
 *   - the checkpoint, the Generation-1 starting state and the Generation-2
 *     ledger are bound by commit, path, SHA-256 and bytes, and both ledgers
 *     re-validate entry by entry;
 *   - the Generation-2 reserve namespace is disjoint from the Generation-1 draw,
 *     so a Generation-2 reserve occupant has no draw entry R17 could name;
 *   - R17 itself refuses the Generation-2 generation id, and its ledger
 *     vocabulary and reserve cap cannot hold the two-ledger chain;
 *   - nothing was minted: no V5 namespace, no snapshot, no census, R17 and
 *     every earlier namespace byte-identical, and the public refusal record is
 *     aggregate-only.
 *
 * Reads git objects only. No database, no network, no sealed root.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  A3SlotAuthorityRefusal,
  resolveGenerationSlotAuthorities,
  type A3GenerationSlotAuthorityInput,
} from '../harness/phase2b2d/a3prep/slotAuthority.js';
import { GENERATION_1_RESERVE_ORGANISATIONS } from '../harness/phase2b2d/a3prep/contracts.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const HARNESS = 'src/test/harness/phase2b2d';

/** The exact canonical R37 tip R38 was cut from. */
const R37_TERMINAL = '9bfaa0ec2ec6f7c7c6eb18bce55e324505262064';
/**
 * R38'S OWN TERMINAL COMMIT.
 *
 * R38's changed-surface and harness-scope assertions describe R38'S SLICE, so
 * they range over R38's own commits - `R37_TERMINAL..R38_TERMINAL` - rather
 * than over the working tree. Once a later slice lands on top, the working
 * tree is no longer R38's surface, and diffing to it would fail for the
 * honest reason that history moved on rather than because R38 changed.
 *
 * This is the same standing convention R19 through R37 apply, and it
 * WEAKENS NOTHING: R38's range is frozen, its permitted-path list is
 * unchanged, and each later slice pins the equivalent scope over its own range.
 */
const R38_TERMINAL = '960856bb4e503fcc6961843f88761f66ebffcd27';
/** The one commit that pinned R37's own changed-surface test to its range. */
const R37_SCOPE_PIN_COMMIT = '3795d0677f832d39d83655e8aeea44cd1a130915';
const R37_ISOLATION_TEST =
  'src/test/unit/orgunitCorpus2DA3ReachableMembershipSd9V4Isolation.test.ts';
/** Governance V4 stays pinned here, forever. */
const V4_A2_CHECKPOINT = '67ae047fb7de079bcba0eec83ca4f4baee77cc3e';

const A2_CHECKPOINT = '29d0d486cb268b5431a0fc23eabb064682ec47d9';
const FREEZE_PATH = 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_CORPUS_FREEZE_APPROVAL_V1.json';
const FREEZE_SHA256 = 'dc3f96120edcc9f37fa4e26034d4df1bae576b7289e8d2ad93e26fdb414c7942';
const FREEZE_BYTES = 24833;

const GEN2_LEDGER_PATH =
  'docs/evaluation/generation2/corpus/PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER_V1_GEN2.json';
const GEN2_LEDGER_HASH = 'c02e37ac42515cb689512b12425c41560fffeb32592e4e15f864892f63208ec8';
const GEN1_TERMINAL_COMMIT = '7c3d24f8db72bf5401c4bfc176700c1d50e25cc0';
const DRAW_PATH = 'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_DRAW_V2_GEN1.json';

const REFUSAL_PATH =
  'docs/evaluation/PHASE_2B_2D_A3_R38_CROSS_GENERATION_AUTHORITY_ADAPTER_REFUSAL_V1.json';
const AUDIT_PATH =
  'docs/audits/PHASE_2B_2D_A3_R38_CROSS_GENERATION_AUTHORITY_ADAPTER_BLOCKER_V1.md';
const THIS_TEST = 'src/test/unit/orgunitCorpus2DA3CrossGenerationAuthorityRefusal.test.ts';

/** R17, pinned by digest: R38 must not modify it. */
const R17_SLOT_AUTHORITY_SHA256 =
  'deee711b6eac66bccec51afee49615b71b94d0701b110a3abd50c1c12207f165';
/** R26's pure continuity comparator, pinned by digest. */
const R26_AUTHORITY_DELTA_SHA256 =
  '26cb34fea6ceaea38a6328bf0ac3eb6a33e86702166871856dd91f1ed2c2c2f3';

function git(...args: string[]): string {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function commitExists(commit: string): boolean {
  try {
    git('cat-file', '-e', `${commit}^{commit}`);
    return true;
  } catch {
    return false;
  }
}

function lines(value: string): string[] {
  return value.split('\n').filter((line) => line.length > 0);
}

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Committed bytes at an exact commit - never a branch, never the working tree. */
function bytesAt(commit: string, path: string): Buffer {
  return execFileSync('git', ['show', `${commit}:${path}`], {
    cwd: REPO_ROOT,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

type Json = Record<string, unknown>;

function jsonAt(commit: string, path: string): Json {
  return JSON.parse(bytesAt(commit, path).toString('utf8')) as Json;
}

/** Sorted-key canonical JSON: the A2 ledgers' own entry/ledger hash rule. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Json).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical((value as Json)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

interface LedgerCheck {
  readonly entryCount: number;
  readonly entryHashesValid: number;
  readonly ledgerHashValid: boolean;
}

function validateLedger(ledger: Json): LedgerCheck {
  const entries = ledger['entries'] as Json[];
  let previous: unknown = null;
  let valid = 0;
  for (const entry of entries) {
    const { entryHash, ...rest } = entry;
    if (sha256(canonical(rest)) === entryHash && entry['previousEntryHash'] === previous) valid++;
    previous = entryHash;
  }
  const { ledgerHash, ...withoutHash } = ledger;
  return {
    entryCount: entries.length,
    entryHashesValid: valid,
    ledgerHashValid: sha256(canonical(withoutHash)) === ledgerHash,
  };
}

const a2Available = commitExists(A2_CHECKPOINT) && commitExists(GEN1_TERMINAL_COMMIT);
const baseAvailable =
  commitExists(R37_TERMINAL) && commitExists(R37_SCOPE_PIN_COMMIT) && commitExists(R38_TERMINAL);

const refusal = JSON.parse(readFileSync(join(REPO_ROOT, REFUSAL_PATH), 'utf8')) as Record<
  string,
  Json
>;

// ---------------------------------------------------------------------------

describe.skipIf(!a2Available)('2D-A3 R38: the terminal A2 checkpoint, by exact bytes', () => {
  const freezeBytes = a2Available ? bytesAt(A2_CHECKPOINT, FREEZE_PATH) : Buffer.alloc(0);
  const freeze = a2Available ? (JSON.parse(freezeBytes.toString('utf8')) as Json) : {};

  it('binds the exact commit, path, SHA-256 and byte length', () => {
    expect(sha256(freezeBytes)).toBe(FREEZE_SHA256);
    expect(freezeBytes.length).toBe(FREEZE_BYTES);
    expect(refusal['a2Checkpoint']!['commit']).toBe(A2_CHECKPOINT);
    expect(refusal['a2Checkpoint']!['bytes']).toBe(FREEZE_BYTES);
  });

  it('is a non-live terminal freeze that disclaims A3 work', () => {
    expect(freeze['isLiveAuthority']).toBe(false);
    expect(freeze['thisFileAuthorises']).toEqual([]);
    expect(freeze['corpusFreezeStatus']).toBe('APPROVED');
    expect(freeze['corpusState']).toBe('GENERATION2_ACQUISITION_CORPUS_FROZEN');
    expect(freeze['terminalState']).toBe(
      'PHASE_2B_2D_A2_GENERATION2_CORPUS_FREEZE_APPROVED_TERMINAL',
    );
    const checkpoint = freeze['terminalCheckpoint'] as Json;
    expect(checkpoint['designation']).toBe(
      'TERMINAL_A2_GOVERNANCE_CHECKPOINT_ELIGIBLE_FOR_SEPARATELY_AUTHORISED_A3_REVIEW',
    );
    expect(checkpoint['thisRecordDoesNot']).toEqual(
      expect.arrayContaining(['modify A3', 'create Governance V5', 'authorise R38']),
    );
    expect((freeze['a3Boundary'] as Json)['a2FreezeImpliesA3Completion']).toBe(false);
  });

  it('every one of its 57 path/SHA-256 bindings matches committed ancestral bytes', () => {
    const bindings: Json[] = [];
    for (const b of Object.values(freeze['bound'] as Json)) {
      if (b !== null && typeof b === 'object' && 'path' in b) bindings.push(b as Json);
    }
    const windows = (freeze['explicitThirteenWindowHistory'] as Json)['windows'] as Json[];
    expect(windows.map((w) => w['windowOrdinal'])).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
    ]);
    for (const w of windows) {
      for (const b of Object.values(w)) {
        if (b !== null && typeof b === 'object' && 'sha256' in b) bindings.push(b as Json);
      }
    }
    expect(bindings).toHaveLength(57);
    for (const b of bindings) {
      const commit = typeof b['commit'] === 'string' ? b['commit'] : A2_CHECKPOINT;
      expect(() => git('merge-base', '--is-ancestor', commit, A2_CHECKPOINT)).not.toThrow();
      const bytes = bytesAt(commit, String(b['path']));
      expect(sha256(bytes), String(b['path'])).toBe(b['sha256']);
      if (typeof b['bytes'] === 'number') expect(bytes.length).toBe(b['bytes']);
    }
    expect(windows.filter((w) => 'cadenceAuthority' in w).map((w) => w['windowOrdinal'])).toEqual([
      8, 9, 10, 12,
    ]);
  });

  it('is never made an ancestor of A3', () => {
    expect(() => git('merge-base', '--is-ancestor', A2_CHECKPOINT, 'HEAD')).toThrow();
    expect(refusal['lineage']!['a2CheckpointIsAncestorOfA3']).toBe(false);
  });
});

describe.skipIf(!a2Available)('2D-A3 R38: cross-generation truth, not flattened', () => {
  const gen2 = a2Available ? jsonAt(A2_CHECKPOINT, GEN2_LEDGER_PATH) : {};
  const start = (gen2['generation1StartingState'] ?? {}) as Json;
  const gen1 = a2Available ? jsonAt(GEN1_TERMINAL_COMMIT, String(start['ledgerPath'])) : {};
  const draw = a2Available ? jsonAt(A2_CHECKPOINT, DRAW_PATH) : {};

  it('binds the Methodology-V3 same-cohort, no-new-draw, fresh-reserve decision', () => {
    const binding = gen2['ownerFreezeApproval'] as Json;
    const bytes = bytesAt(A2_CHECKPOINT, String(binding['path']));
    expect(sha256(bytes)).toBe(binding['sha256']);
    const approval = JSON.parse(bytes.toString('utf8')) as Json;
    expect(JSON.stringify(approval)).toContain('"noNewPrimaryDraw":true');
    expect(gen2['generationId']).toBe('METHODOLOGY_V3_GEN2');
    expect(gen2['selectionCount']).toBe(110);
  });

  it('binds the terminal Generation-1 starting state, not the V4 30-entry ledger', () => {
    expect(start['generationId']).toBe('METHODOLOGY_V2_GEN1');
    expect(start['terminalStatus']).toBe('CORPUS_FREEZE_REFUSED');
    expect(start['terminalCommit']).toBe(GEN1_TERMINAL_COMMIT);
    expect(sha256(bytesAt(GEN1_TERMINAL_COMMIT, String(start['terminalRecordPath'])))).toBe(
      start['terminalRecordSha256'],
    );
    expect(sha256(bytesAt(GEN1_TERMINAL_COMMIT, String(start['ledgerPath'])))).toBe(
      start['ledgerFileSha256'],
    );
    expect(validateLedger(gen1)).toEqual({
      entryCount: 39,
      entryHashesValid: 39,
      ledgerHashValid: true,
    });
    expect(gen1['ledgerHash']).toBe(start['ledgerHash']);
  });

  it('validates the Generation-2 ledger at 21 entries, independently', () => {
    expect(validateLedger(gen2)).toEqual({
      entryCount: 21,
      entryHashesValid: 21,
      ledgerHashValid: true,
    });
    expect(gen2['ledgerHash']).toBe(GEN2_LEDGER_HASH);
    const positions = (gen2['entries'] as Json[]).map((e) => e['generation2ReserveRankPosition']);
    expect(positions).toEqual([...Array(21).keys()]);
    expect(gen2['ledgerHash']).not.toBe(gen1['ledgerHash']);
  });

  it('keeps the two reserve namespaces disjoint: no Generation-2 reserve is a draw entry', () => {
    const schedule = gen2['reserveSchedule'] as Json;
    const scheduleBytes = bytesAt(
      A2_CHECKPOINT,
      'docs/evaluation/generation2/corpus/PHASE_2B_2D_METHOD_V3_GEN2_RESERVE_SCHEDULE_V1.json',
    );
    expect(sha256(scheduleBytes)).toBe(schedule['fileSha256']);
    const entries = (JSON.parse(scheduleBytes.toString('utf8')) as Json)['entries'] as Json[];
    expect(entries).toHaveLength(5670);
    const drawIdentities = new Set(
      [...(draw['selection'] as Json[]), ...(draw['reserve'] as Json[])].map(
        (e) => e['echeRowKey'],
      ),
    );
    expect((draw['reserve'] as Json[]).length).toBe(GENERATION_1_RESERVE_ORGANISATIONS);
    const replacements = (gen2['entries'] as Json[]).map((e) => e['replacementEcheRowKey']);
    expect(replacements.filter((key) => drawIdentities.has(key))).toEqual([]);
  });

  it('derives the current-occupant structure through the explicit two-ledger chain', () => {
    const kind = new Map<number, { kind: string; split: string }>();
    for (const s of draw['selection'] as Json[]) {
      kind.set(Number(s['selectionIndex']), { kind: 'PRIMARY', split: String(s['split']) });
    }
    for (const [ledger, label] of [
      [gen1, 'GEN1'],
      [gen2, 'GEN2'],
    ] as const) {
      for (const e of ledger['entries'] as Json[]) {
        const slot = kind.get(Number(e['selectionIndex']))!;
        expect(e['split']).toBe(slot.split);
        kind.set(Number(e['selectionIndex']), { kind: label, split: slot.split });
      }
    }
    const count = (k: string, split?: string): number =>
      [...kind.values()].filter((v) => v.kind === k && (split === undefined || v.split === split))
        .length;
    const recorded = (refusal['crossGenerationTruthVerified'] as Json)[
      'currentOccupantStructure'
    ] as Json;
    expect({
      totalSlots: kind.size,
      primaryOccupants: count('PRIMARY'),
      generation1ReserveOccupants: count('GEN1'),
      generation2ReserveOccupants: count('GEN2'),
      devTrainSlots: [...kind.values()].filter((v) => v.split === 'DEV_TRAIN').length,
      devTrainGeneration2ReserveOccupants: count('GEN2', 'DEV_TRAIN'),
    }).toEqual({
      totalSlots: recorded['totalSlots'],
      primaryOccupants: recorded['primaryOccupants'],
      generation1ReserveOccupants: recorded['generation1ReserveOccupants'],
      generation2ReserveOccupants: recorded['generation2ReserveOccupants'],
      devTrainSlots: recorded['devTrainSlots'],
      devTrainGeneration2ReserveOccupants: recorded['devTrainGeneration2ReserveOccupants'],
    });
    expect(count('GEN2', 'DEV_TRAIN')).toBeGreaterThan(0);
  });

  it('binds the 75-occupant carry-forward baseline the Generation-2 ledger names', () => {
    const binding = gen2['carryForwardBaseline'] as Json;
    const bytes = bytesAt(A2_CHECKPOINT, String(binding['path']));
    expect(sha256(bytes)).toBe(binding['sha256']);
    const baseline = JSON.parse(bytes.toString('utf8')) as Json;
    expect((baseline['startingState'] as Json)['ACQUISITION_SUCCESSFUL']).toBe(75);
    expect((baseline['a3Reuse'] as Json)['governanceV4RemainsPinnedTo']).toBe(V4_A2_CHECKPOINT);
  });
});

describe.skipIf(!a2Available)('2D-A3 R38: why unchanged R17 cannot hold Generation 2', () => {
  const gen2 = a2Available ? jsonAt(A2_CHECKPOINT, GEN2_LEDGER_PATH) : {};
  const gen2Entries = (gen2['entries'] ?? []) as Json[];

  it('I1: R17 refuses the Generation-2 id before reading anything else', () => {
    const attempt = (): unknown =>
      resolveGenerationSlotAuthorities({
        generationId: 'METHODOLOGY_V3_GEN2',
      } as unknown as A3GenerationSlotAuthorityInput);
    expect(attempt).toThrow(A3SlotAuthorityRefusal);
    try {
      attempt();
    } catch (error) {
      expect((error as A3SlotAuthorityRefusal).code).toBe('GENERATION_MISMATCH');
    }
  });

  it('I3: the two ledgers together exceed R17’s single 40-entry reserve namespace', () => {
    expect(39 + gen2Entries.length).toBeGreaterThan(GENERATION_1_RESERVE_ORGANISATIONS);
  });

  it('I4: Generation-2 entries do not speak R17’s ledger vocabulary', () => {
    for (const entry of gen2Entries) {
      expect('reserveRankPosition' in entry).toBe(false);
      expect('generation2ReserveRankPosition' in entry).toBe(true);
      expect(['ORIGINAL_SELECTION', 'RESERVE_REPLACEMENT']).not.toContain(
        entry['replacedOccupantKind'],
      );
    }
    expect([...new Set(gen2Entries.map((e) => e['replacedOccupantKind']))].sort()).toEqual([
      'GENERATION1_TERMINAL_OCCUPANT',
      'GENERATION2_RESERVE_REPLACEMENT',
    ]);
  });

  it('records the refusal, not a snapshot, and lists all five incompatibilities', () => {
    expect(refusal['thisFileAuthorises']).toEqual([]);
    expect(refusal['terminalState']).toBe(
      'R38_CROSS_GENERATION_AUTHORITY_MAPPING_REFUSED_AWAIT_OWNER_CONTRACT_DECISION',
    );
    expect(refusal['refusal']!['r17SufficientUnchanged']).toBe(false);
    expect((refusal['refusal']!['incompatibilities'] as Json[]).map((i) => i['id'])).toEqual([
      'I1_GENERATION_IDENTITY',
      'I2_RESERVE_NAMESPACE',
      'I3_SINGLE_LEDGER_CHAIN',
      'I4_LEDGER_ENTRY_VOCABULARY',
      'I5_CONTINUITY_PROJECTION',
    ]);
    expect(refusal['governanceV5']).toEqual({
      minted: false,
      registryCreated: false,
      namespaceCreated: false,
      census: false,
    });
    expect(refusal['devTrainContinuity']!['newAuthoritiesDerived']).toBe(0);
    expect(refusal['a2Checkpoint']!['freezeAggregateUsedAsDispositionSource']).toBe(false);
  });
});

describe('2D-A3 R38: nothing minted, nothing modified', () => {
  // R38's "nothing minted" claim describes R38'S SLICE, so it reads the tree
  // at R38_TERMINAL rather than the working tree: a later, separately
  // authorised slice (R38B) legitimately creates the V5 namespace. Same
  // standing range convention as R19-R38A; nothing widened or weakened.
  it.skipIf(!commitExists(R38_TERMINAL))(
    'creates no Governance V5 namespace and no V5 census',
    () => {
      const tree = lines(git('ls-tree', '-r', '--name-only', R38_TERMINAL));
      expect(tree.filter((path) => path.startsWith(`${HARNESS}/a3governanceV5/`))).toEqual([]);
      expect(tree).not.toContain(
        'docs/evaluation/PHASE_2B_2D_A3_R38_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V5.json',
      );
    },
  );

  it('leaves R17 and R26’s comparator byte-identical', () => {
    expect(sha256(readFileSync(join(REPO_ROOT, HARNESS, 'a3prep/slotAuthority.ts')))).toBe(
      R17_SLOT_AUTHORITY_SHA256,
    );
    expect(sha256(readFileSync(join(REPO_ROOT, HARNESS, 'a3evidenceV2/authorityDelta.ts')))).toBe(
      R26_AUTHORITY_DELTA_SHA256,
    );
  });
});

describe.skipIf(!baseAvailable)('2D-A3 R38: lineage and changed surface', () => {
  it('descends from the exact R37 tip through its scope pin, and merges nothing', () => {
    expect(() => git('merge-base', '--is-ancestor', R37_TERMINAL, 'HEAD')).not.toThrow();
    expect(git('rev-parse', `${R37_SCOPE_PIN_COMMIT}^`).trim()).toBe(R37_TERMINAL);
    expect(lines(git('rev-list', '--merges', `${R37_TERMINAL}..HEAD`))).toEqual([]);
    expect(lines(git('diff', '--name-only', R37_TERMINAL, R37_SCOPE_PIN_COMMIT))).toEqual([
      R37_ISOLATION_TEST,
    ]);
  });

  it('leaves every harness namespace and every earlier A3 record untouched', () => {
    expect(lines(git('diff', '--name-only', R37_TERMINAL, R38_TERMINAL, '--', HARNESS))).toEqual(
      [],
    );
    const prior = lines(
      git('ls-tree', '-r', '--name-only', R37_TERMINAL, '--', 'docs/evaluation', 'docs/audits'),
    ).filter((path) => /PHASE_2B_2D_A3_R\d+_/.test(path));
    for (const record of prior) {
      expect(sha256(readFileSync(join(REPO_ROOT, record))), record).toBe(
        sha256(bytesAt(R37_TERMINAL, record)),
      );
    }
  });

  it('changes nothing but the R37 pin, this test, the refusal record and its audit', () => {
    const paths = lines(git('diff', '--name-only', R37_TERMINAL, R38_TERMINAL));
    const permitted = new Set([R37_ISOLATION_TEST, THIS_TEST, REFUSAL_PATH, AUDIT_PATH]);
    expect(paths.filter((path) => !permitted.has(path))).toEqual([]);
  });
});

describe('2D-A3 R38: the public refusal record and audit disclose nothing', () => {
  const raw = readFileSync(join(REPO_ROOT, REFUSAL_PATH), 'utf8');
  const payload = (() => {
    const copy = JSON.parse(raw) as Json;
    delete copy['identityDisclosure'];
    return JSON.stringify(copy);
  })();

  it('names only the permitted commits and no 64-hex digest', () => {
    expect(payload).not.toMatch(/\b[0-9a-f]{64}\b/);
    const commits = [...new Set(payload.match(/\b[0-9a-f]{40}\b/g) ?? [])].sort();
    expect(commits).toEqual(
      [
        R37_TERMINAL,
        R37_SCOPE_PIN_COMMIT,
        A2_CHECKPOINT,
        GEN1_TERMINAL_COMMIT,
        'ac19cb8ca4538237be49e03e0c19ce46cf6f4ecb',
      ].sort(),
    );
  });

  it('carries no slot, reserve, run, organisation or host identity', () => {
    expect(payload).not.toMatch(/G2[PR]:\d|"[A-Z]{1,3} [A-Z0-9-]+\|\d+"/);
    expect(payload).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/);
    expect(payload).not.toMatch(/https?:\/\/|SD7_DETAIL|sealed-/);
    // The only numeric array is the window-ordinal cadence list - never slots.
    expect(payload.match(/\[\s*\d[^\]]*\]/g)).toEqual(['[8,9,10,12]']);
  });

  it('the audit names the refusal, its digest only, and claims no R39', () => {
    const audit = readFileSync(join(REPO_ROOT, AUDIT_PATH), 'utf8');
    expect(audit).toContain(
      'R38_CROSS_GENERATION_AUTHORITY_MAPPING_REFUSED_AWAIT_OWNER_CONTRACT_DECISION',
    );
    expect([...new Set(audit.match(/\b[0-9a-f]{64}\b/g) ?? [])]).toEqual([sha256(raw)]);
    expect(audit).not.toMatch(/G2[PR]:\d|https?:\/\//);
    expect(audit).not.toMatch(/R39 (is|was) authori[sz]ed/i);
  });
});

describe.skipIf(!a2Available)('2D-A3 R38: negative bindings are refused', () => {
  const gen2 = a2Available ? jsonAt(A2_CHECKPOINT, GEN2_LEDGER_PATH) : {};
  const start = (gen2['generation1StartingState'] ?? {}) as Json;
  const gen1 = a2Available ? jsonAt(GEN1_TERMINAL_COMMIT, String(start['ledgerPath'])) : {};

  it('a wrong checkpoint does not carry the freeze record', () => {
    expect(() => bytesAt(GEN1_TERMINAL_COMMIT, FREEZE_PATH)).toThrow();
    expect(() => bytesAt(V4_A2_CHECKPOINT, FREEZE_PATH)).toThrow();
  });

  it('a one-byte mutation of the freeze changes its digest', () => {
    const bytes = Buffer.from(bytesAt(A2_CHECKPOINT, FREEZE_PATH));
    bytes[bytes.length - 2] = bytes[bytes.length - 2]! ^ 1;
    expect(sha256(bytes)).not.toBe(FREEZE_SHA256);
  });

  it('a mutated Generation-2 entry or ledger hash fails validation', () => {
    const entries = structuredClone(gen2['entries']) as Json[];
    entries[3]!['reason'] = 'ACQUISITION_UNSUCCESSFUL_ROBOTS_DISALLOWED';
    expect(validateLedger({ ...gen2, entries }).entryHashesValid).toBeLessThan(21);
    expect(validateLedger({ ...gen2, ledgerHash: '0'.repeat(64) }).ledgerHashValid).toBe(false);
  });

  it('renumbering a Generation-2 reserve into R17 vocabulary breaks its entry hash', () => {
    const entries = (structuredClone(gen2['entries']) as Json[]).map((entry) => {
      const { generation2ReserveRankPosition, ...rest } = entry;
      return { ...rest, reserveRankPosition: generation2ReserveRankPosition };
    });
    expect(validateLedger({ ...gen2, entries }).entryHashesValid).toBe(0);
  });

  it('flattening Generation-1 history into the Generation-2 ledger breaks both chains', () => {
    const flattened = [...(gen1['entries'] as Json[]), ...(gen2['entries'] as Json[])];
    const check = validateLedger({ ...gen2, entries: flattened });
    expect(check.entryHashesValid).toBeLessThan(flattened.length);
    expect(check.ledgerHashValid).toBe(false);
  });
});
