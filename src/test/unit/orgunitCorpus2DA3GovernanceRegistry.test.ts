/**
 * PHASE 2B-2D A3 R19 — REGISTRY V1 AND THE VERIFIED BYTE LOADER.
 *
 * Proves that the adapter reads the exact committed governance snapshot at
 * `907d726...` and nothing else:
 *
 *   - every Registry V1 binding matches the integrated bytes exactly;
 *   - a missing registered file refuses, and so does ONE byte of drift;
 *   - an unregistered extra JSON file has ZERO effect;
 *   - a fake, lexicographically LATER adjudication has ZERO effect;
 *   - the loader globs nothing, reads no directory and inspects no branch;
 *   - Registry V1 is pinned to the governance base commit by name.
 */
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { A3GovernanceRefusal } from '../harness/phase2b2d/a3governance/refusal.js';
import { loadRegisteredGovernance, requireFile } from '../harness/phase2b2d/a3governance/loader.js';
import {
  CANONICAL_A2_A3_GOVERNANCE_INTEGRATION_TIP,
  CANONICAL_A2_GOVERNANCE_REGISTRY_V1,
  TRANSITION_LEDGER_CHAIN_V1,
  TRANSITION_LEDGER_TIP_V1,
  registryEntryById,
} from '../harness/phase2b2d/a3governance/registryV1.js';
import {
  derivePublicGovernanceAuthorityCensus,
  loadCanonicalA2GovernanceV1,
} from '../harness/phase2b2d/a3governance/snapshot.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const A3GOVERNANCE_REL = 'src/test/harness/phase2b2d/a3governance';

const temporaryRoots: string[] = [];

afterAll(() => {
  for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true });
});

/** A throwaway tree holding ONLY the registered governance files. */
function governanceTree(): string {
  const root = mkdtempSync(join(tmpdir(), 'r19-governance-'));
  temporaryRoots.push(root);
  for (const entry of CANONICAL_A2_GOVERNANCE_REGISTRY_V1) {
    const destination = join(root, entry.path);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(REPO_ROOT, entry.path), destination);
  }
  return root;
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

// ---------------------------------------------------------------------------

describe('2D-A3 R19: Registry V1 is pinned, explicit and internally consistent', () => {
  it('names the governance base commit this snapshot describes', () => {
    expect(CANONICAL_A2_A3_GOVERNANCE_INTEGRATION_TIP).toBe(
      '907d726268ad07fe94fec93f4c6f3ff5ce5f93f9',
    );
  });

  it('holds unique ids and unique repository-relative evaluation paths', () => {
    const ids = CANONICAL_A2_GOVERNANCE_REGISTRY_V1.map((entry) => entry.id);
    const paths = CANONICAL_A2_GOVERNANCE_REGISTRY_V1.map((entry) => entry.path);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) expect(path.startsWith('docs/evaluation/')).toBe(true);
  });

  it('names the transition chain and its tip explicitly, with no V5', () => {
    expect([...TRANSITION_LEDGER_CHAIN_V1]).toEqual([
      'ACQUISITION_POLICY_TRANSITION_LEDGER_V2',
      'ACQUISITION_POLICY_TRANSITION_LEDGER_V3',
      'ACQUISITION_POLICY_TRANSITION_LEDGER_V4',
      'ACQUISITION_POLICY_TRANSITION_LEDGER_V6',
    ]);
    expect(TRANSITION_LEDGER_TIP_V1).toBe('ACQUISITION_POLICY_TRANSITION_LEDGER_V6');
    expect(registryEntryById('ACQUISITION_POLICY_TRANSITION_LEDGER_V5')).toBeUndefined();
    for (const id of TRANSITION_LEDGER_CHAIN_V1) expect(registryEntryById(id)).toBeDefined();
  });

  it('registers no strategy, window plan, pre-network assignment or live-window authority', () => {
    for (const entry of CANONICAL_A2_GOVERNANCE_REGISTRY_V1) {
      expect(entry.path, entry.id).not.toMatch(
        /_STRATEGY_|_WINDOW_PLAN_|_PRENETWORK_ASSIGNMENT_|_LIVE_WINDOW_AUTHORITY_|_LIVE_AUTHORITY_/,
      );
    }
  });
});

describe('2D-A3 R19: every binding matches the integrated bytes', () => {
  it('recomputes each registered SHA-256, byte count and record discriminator', () => {
    for (const entry of CANONICAL_A2_GOVERNANCE_REGISTRY_V1) {
      const bytes = readFileSync(join(REPO_ROOT, entry.path));
      expect(createHash('sha256').update(bytes).digest('hex'), entry.id).toBe(entry.sha256);
      expect(bytes.length, entry.id).toBe(entry.bytes);
      const parsed: unknown = JSON.parse(bytes.toString('utf8'));
      const record = parsed as Record<string, unknown>;
      if (entry.expectedRecordKind !== null) {
        expect(record.recordKind, entry.id).toBe(entry.expectedRecordKind);
      }
      if (entry.expectedRecordId !== null) {
        expect(record.recordId, entry.id).toBe(entry.expectedRecordId);
      }
    }
  });

  it('loads the whole registry from the real tree', () => {
    const governance = loadRegisteredGovernance(REPO_ROOT);
    expect(governance.files.size).toBe(CANONICAL_A2_GOVERNANCE_REGISTRY_V1.length);
    expect(governance.governanceBaseCommit).toBe(CANONICAL_A2_A3_GOVERNANCE_INTEGRATION_TIP);
    expect(requireFile(governance, 'FROZEN_DRAW_V2_GEN1').entry.expectedRecordKind).toBe(
      'DRAW_V2_GEN1',
    );
  });
});

describe('2D-A3 R19: the loader fails closed', () => {
  it('refuses a missing registered file', () => {
    const root = governanceTree();
    rmSync(join(root, 'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_DRAW_V2_GEN1.json'));
    expect(refusalCodeOf(() => loadRegisteredGovernance(root))).toBe(
      'REGISTERED_GOVERNANCE_FILE_MISSING',
    );
  });

  it('refuses ONE byte of drift in any registered source', () => {
    for (const entry of CANONICAL_A2_GOVERNANCE_REGISTRY_V1.slice(0, 6)) {
      const root = governanceTree();
      const target = join(root, entry.path);
      writeFileSync(target, `${readFileSync(target, 'utf8')} `);
      expect(
        refusalCodeOf(() => loadRegisteredGovernance(root)),
        entry.id,
      ).toBe('REGISTERED_GOVERNANCE_FILE_DRIFT');
    }
  });

  it('refuses a registered path that would escape the repository root', () => {
    const escaping = CANONICAL_A2_GOVERNANCE_REGISTRY_V1.map((entry, index) =>
      index === 0 ? { ...entry, path: 'docs/evaluation/../../etc/passwd.json' } : entry,
    );
    expect(refusalCodeOf(() => loadRegisteredGovernance(REPO_ROOT, escaping))).toBe(
      'REGISTRY_ENTRY_MALFORMED',
    );
  });

  it('refuses a registered file whose recordKind is not its registered discriminator', () => {
    const root = governanceTree();
    const entry = registryEntryById('WINDOW_V1_EVIDENCE_ADJUDICATION')!;
    const target = join(root, entry.path);
    const record = JSON.parse(readFileSync(target, 'utf8')) as Record<string, unknown>;
    record.recordKind = 'SOMETHING_ELSE';
    // Re-register with the mutated bytes' own digest, so the ONLY thing wrong
    // is the discriminator.
    const bytes = Buffer.from(JSON.stringify(record));
    writeFileSync(target, bytes);
    const registry = CANONICAL_A2_GOVERNANCE_REGISTRY_V1.map((candidate) =>
      candidate.id === entry.id
        ? {
            ...candidate,
            sha256: createHash('sha256').update(bytes).digest('hex'),
            bytes: bytes.length,
          }
        : candidate,
    );
    expect(refusalCodeOf(() => loadRegisteredGovernance(root, registry))).toBe(
      'REGISTERED_GOVERNANCE_RECORD_KIND_MISMATCH',
    );
  });

  it('refuses a registry entry naming a parser family that does not exist', () => {
    const registry = CANONICAL_A2_GOVERNANCE_REGISTRY_V1.map((entry, index) =>
      index === 0
        ? { ...entry, parserFamily: 'INVENTED_FAMILY' as (typeof entry)['parserFamily'] }
        : entry,
    );
    expect(refusalCodeOf(() => loadRegisteredGovernance(REPO_ROOT, registry))).toBe(
      'UNSUPPORTED_GOVERNANCE_RECORD_FAMILY',
    );
  });

  it('refuses a duplicated registry entry', () => {
    const first = CANONICAL_A2_GOVERNANCE_REGISTRY_V1[0]!;
    expect(
      refusalCodeOf(() =>
        loadRegisteredGovernance(REPO_ROOT, [...CANONICAL_A2_GOVERNANCE_REGISTRY_V1, first]),
      ),
    ).toBe('REGISTRY_DUPLICATE_ENTRY');
  });
});

describe('2D-A3 R19: unregistered bytes have ZERO effect', () => {
  it('an extra JSON file, and a lexicographically later fake adjudication, change nothing', () => {
    const clean = governanceTree();
    const baseline = derivePublicGovernanceAuthorityCensus(loadCanonicalA2GovernanceV1(clean));

    const polluted = governanceTree();
    const fake = {
      recordId: 'zzzz-fake-adjudication-v9',
      recordKind: 'LIVE_WINDOW_EVIDENCE_ADJUDICATION',
      generationId: 'METHODOLOGY_V2_GEN1',
      thisFileAuthorises: [],
      appendOnly: true,
      isLiveAuthority: false,
      items: [
        {
          workItemId: 'P:24',
          kind: 'PRIMARY',
          selectionIndex: 24,
          reserveRankPosition: null,
          split: 'DEV_TRAIN',
          drawEntryKind: 'SELECTION',
          drawEntrySha256: 'f'.repeat(64),
          runRefSha256: 'e'.repeat(64),
          integrity: { dryRun: false, runFetchPolicyVersion: 'orgunit-fetch-policy-v6' },
          formalSd7: { sealedDetail: null },
          finalSd9: 'ACQUISITION_SUCCESSFUL',
          finalAdjudication: 'ACQUISITION_SUCCESSFUL',
        },
      ],
    };
    writeFileSync(
      join(polluted, 'docs/evaluation/ZZZZ_FAKE_LATER_EVIDENCE_ADJUDICATION_V9.json'),
      JSON.stringify(fake),
    );
    writeFileSync(
      join(polluted, 'docs/evaluation/corpus/ZZZZ_FAKE_TRANSITION_LEDGER_V9_GEN1.json'),
      JSON.stringify({ recordKind: 'ACQUISITION_POLICY_TRANSITION_LEDGER_V9_GEN1', entries: [] }),
    );
    const after = derivePublicGovernanceAuthorityCensus(loadCanonicalA2GovernanceV1(polluted));

    expect(after).toEqual(baseline);
    expect(after.slotAuthoritySummary.readySlotCount).toBe(23);
  });
});

describe('2D-A3 R19: the loader reads registered paths only', () => {
  /**
   * Executable tokens only: the documentation in these files DESCRIBES the
   * forbidden capabilities ("no glob, no latest, no newest commit"), so a scan
   * over raw text would trip on the prose that promises the rule.
   */
  const source = (file: string): string =>
    readFileSync(join(REPO_ROOT, A3GOVERNANCE_REL, file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/`(?:\\.|[^`\\])*`/g, '``')
      .replace(/'(?:\\.|[^'\\])*'/g, "''");

  it('globs nothing, reads no directory and never lists a branch', () => {
    for (const file of ['loader.ts', 'registryV1.ts', 'resolve.ts', 'families.ts']) {
      const text = source(file);
      expect(text, file).not.toMatch(/readdir|globSync|\bglob\b|fast-glob|minimatch|opendir/i);
      expect(text, file).not.toMatch(/execFile|spawn|child_process|git\s+log|rev-parse|origin\//);
      expect(text, file).not.toMatch(/latest|newest|mostRecent|mtime|birthtime/i);
    }
  });

  it('reads files only through the registry, never through a caller-supplied path', () => {
    expect(source('loader.ts')).toMatch(/readFileSync/);
    for (const file of ['registryV1.ts', 'resolve.ts', 'families.ts', 'transitionLedger.ts']) {
      expect(source(file), file).not.toMatch(/readFileSync|writeFileSync|createReadStream/);
    }
  });
});
