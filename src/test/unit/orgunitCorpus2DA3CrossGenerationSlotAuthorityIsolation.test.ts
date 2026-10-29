/**
 * PHASE 2B-2D A3 R38A — SCOPE, PURITY, CONTRACT SHAPE AND DISCLOSURE OF THE
 * CROSS-GENERATION SLOT-AUTHORITY CONTRACT.
 *
 * Proves, from the repository itself:
 *
 *   - R38A descends from the exact R38 blocker tip with no merge and no A2
 *     ancestor, and pinned R38's scope in exactly one commit touching exactly
 *     one file;
 *   - R17 (source and tests), R26's comparator, every Governance V1-V4 and
 *     R20-R37 namespace, the R38 refusal record / audit / test, and the
 *     Generation-1 draw / ledger code are byte-identical;
 *   - the new namespace is exactly seven pure files that import nothing but
 *     R17, the A3 contracts, the draw contract and each other, and carry no
 *     unsafe mint, recency rule, environment, filesystem, network or SQL;
 *   - nothing Governance-V5-shaped and nothing R39-shaped exists;
 *   - the contract's vocabulary matches the landed Generation-2 structures,
 *     read by exact commit from the A2 checkpoint as SHAPE fixtures only; and
 *   - the public record and audit disclose no identity.
 *
 * Reads git objects and repository files only. No database, no network.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalStringify } from '../../orgunits/classify/canonical.js';
import { ENTRY_FIELDS } from '../harness/phase2b2d/continuationWindow/replacementLedger.js';
import {
  GENERATION1_ID,
  GENERATION2_FIRST_SOURCE_FRAME_RANK,
  GENERATION2_ID,
  GENERATION2_LEDGER_ENTRY_FIELDS,
  GENERATION2_RESERVE_COUNT,
  GENERATION1_TERMINAL_OCCUPANT,
  GENERATION2_RESERVE_REPLACEMENT,
} from '../harness/phase2b2d/a3crossGenerationSlotAuthority/types.js';
import { CROSS_GENERATION_CONTINUITY_FIELDS } from '../harness/phase2b2d/a3crossGenerationSlotAuthority/continuity.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const HARNESS = 'src/test/harness/phase2b2d';
const NAMESPACE = `${HARNESS}/a3crossGenerationSlotAuthority`;

/** The exact R38 blocker tip R38A was cut from. */
const R38_TERMINAL = '960856bb4e503fcc6961843f88761f66ebffcd27';
/** The one commit that pinned R38's own changed-surface test to its range. */
const R38_SCOPE_PIN_COMMIT = '6d99b1c3d4ffcb74aa411ede1ff7c70af4da4a0d';
/**
 * R38A'S OWN TERMINAL COMMIT.
 *
 * R38A's changed-surface and docs-scope assertions describe R38A'S SLICE, so
 * they range over R38A's own commits - `R38_TERMINAL..R38A_TERMINAL` - rather
 * than over the working tree. Once a later slice lands on top, the working
 * tree is no longer R38A's surface, and diffing to it would fail for the
 * honest reason that history moved on rather than because R38A changed.
 *
 * This is the same standing convention R19 through R38 apply, and it
 * WEAKENS NOTHING: R38A's range is frozen, its permitted-path list is
 * unchanged, and each later slice pins the equivalent scope over its own range.
 */
const R38A_TERMINAL = '80f792de8117c3c91ddb56bbb4dbe6518fde7d8a';
const R38_TEST = 'src/test/unit/orgunitCorpus2DA3CrossGenerationAuthorityRefusal.test.ts';
const R38_REFUSAL =
  'docs/evaluation/PHASE_2B_2D_A3_R38_CROSS_GENERATION_AUTHORITY_ADAPTER_REFUSAL_V1.json';
const R38_REFUSAL_SHA256 = '7cf59593d06ba77cf29206120496c3e642acccd28a580b1b13b7d5181fc9dec0';
const R38_AUDIT = 'docs/audits/PHASE_2B_2D_A3_R38_CROSS_GENERATION_AUTHORITY_ADAPTER_BLOCKER_V1.md';

const R17_PATH = `${HARNESS}/a3prep/slotAuthority.ts`;
const R17_SHA256 = 'deee711b6eac66bccec51afee49615b71b94d0701b110a3abd50c1c12207f165';
const R26_PATH = `${HARNESS}/a3evidenceV2/authorityDelta.ts`;
const R26_SHA256 = '26cb34fea6ceaea38a6328bf0ac3eb6a33e86702166871856dd91f1ed2c2c2f3';

const RECORD =
  'docs/evaluation/PHASE_2B_2D_A3_R38A_CROSS_GENERATION_SLOT_AUTHORITY_CONTRACT_V1.json';
const AUDIT = 'docs/audits/PHASE_2B_2D_A3_R38A_CROSS_GENERATION_SLOT_AUTHORITY_CONTRACT_V1.md';
const R38A_TESTS = [
  'src/test/unit/orgunitCorpus2DA3CrossGenerationSlotAuthority.test.ts',
  'src/test/unit/orgunitCorpus2DA3CrossGenerationSlotAuthorityIsolation.test.ts',
];
const NAMESPACE_FILES = [
  'chain.ts',
  'continuity.ts',
  'occupantIdentity.ts',
  'refusal.ts',
  'resolve.ts',
  'terminalFacts.ts',
  'types.ts',
];

const A2_CHECKPOINT = '29d0d486cb268b5431a0fc23eabb064682ec47d9';
const GEN1_TERMINAL_COMMIT = '7c3d24f8db72bf5401c4bfc176700c1d50e25cc0';
const GEN2_LEDGER_PATH =
  'docs/evaluation/generation2/corpus/PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER_V1_GEN2.json';
const GEN2_SCHEDULE_PATH =
  'docs/evaluation/generation2/corpus/PHASE_2B_2D_METHOD_V3_GEN2_RESERVE_SCHEDULE_V1.json';
const FEASIBILITY_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_CARRY_FORWARD_FEASIBILITY_V1.json';
const W13_ADJUDICATION_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_13_EVIDENCE_ADJUDICATION_V1.json';

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

const lines = (value: string): string[] => value.split('\n').filter((l) => l.length > 0);
const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');

type Json = Record<string, unknown>;

function bytesAt(commit: string, path: string): Buffer {
  return execFileSync('git', ['show', `${commit}:${path}`], {
    cwd: REPO_ROOT,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}
const jsonAt = (commit: string, path: string): Json =>
  JSON.parse(bytesAt(commit, path).toString('utf8')) as Json;

function source(file: string): string {
  return readFileSync(join(REPO_ROOT, NAMESPACE, file), 'utf8');
}
const ALL_SOURCE = NAMESPACE_FILES.map(source).join('\n');

const baseAvailable = commitExists(R38_TERMINAL) && commitExists(R38_SCOPE_PIN_COMMIT);
const a2Available = commitExists(A2_CHECKPOINT) && commitExists(GEN1_TERMINAL_COMMIT);

// ---------------------------------------------------------------------------

describe.skipIf(!baseAvailable)('2D-A3 R38A: lineage and changed surface', () => {
  it('descends from the exact R38 tip through its one-file scope pin, and merges nothing', () => {
    expect(() => git('merge-base', '--is-ancestor', R38_TERMINAL, 'HEAD')).not.toThrow();
    expect(() => git('merge-base', '--is-ancestor', R38_SCOPE_PIN_COMMIT, 'HEAD')).not.toThrow();
    expect(git('rev-parse', `${R38_SCOPE_PIN_COMMIT}^`).trim()).toBe(R38_TERMINAL);
    expect(lines(git('diff', '--name-only', R38_TERMINAL, R38_SCOPE_PIN_COMMIT))).toEqual([
      R38_TEST,
    ]);
    expect(lines(git('rev-list', '--merges', `${R38_TERMINAL}..HEAD`))).toEqual([]);
  });

  it('never makes the terminal A2 checkpoint an ancestor', () => {
    if (commitExists(A2_CHECKPOINT)) {
      expect(() => git('merge-base', '--is-ancestor', A2_CHECKPOINT, 'HEAD')).toThrow();
    }
  });

  it('changes nothing but the R38 pin, its own namespace, tests, record and audit', () => {
    const paths = lines(git('diff', '--name-only', R38_TERMINAL, R38A_TERMINAL));
    const permitted = (path: string): boolean =>
      path === R38_TEST ||
      path.startsWith(`${NAMESPACE}/`) ||
      R38A_TESTS.includes(path) ||
      path === RECORD ||
      path === AUDIT;
    expect(paths.filter((path) => !permitted(path))).toEqual([]);
  });

  it('leaves every other harness namespace untouched, Generation-1 draw and ledger included', () => {
    const touched = lines(
      git('diff', '--name-only', R38_TERMINAL, R38A_TERMINAL, '--', HARNESS),
    ).filter((path) => !path.startsWith(`${NAMESPACE}/`));
    expect(touched).toEqual([]);
  });

  it('leaves every earlier A3 record, the R38 refusal, audit and test byte-identical', () => {
    const prior = lines(
      git('ls-tree', '-r', '--name-only', R38_TERMINAL, '--', 'docs/evaluation', 'docs/audits'),
    ).filter((path) => /PHASE_2B_2D_A3_/.test(path));
    expect(prior.length).toBeGreaterThan(0);
    for (const record of prior) {
      expect(sha256(readFileSync(join(REPO_ROOT, record))), record).toBe(
        sha256(bytesAt(R38_TERMINAL, record)),
      );
    }
    expect(sha256(readFileSync(join(REPO_ROOT, R38_REFUSAL)))).toBe(R38_REFUSAL_SHA256);
    expect(sha256(readFileSync(join(REPO_ROOT, R38_AUDIT)))).toBe(
      sha256(bytesAt(R38_TERMINAL, R38_AUDIT)),
    );
  });

  it('changes R38’s own test only by its scope pin', () => {
    expect(sha256(bytesAt(R38A_TERMINAL, R38_TEST))).toBe(
      sha256(bytesAt(R38_SCOPE_PIN_COMMIT, R38_TEST)),
    );
  });
});

describe('2D-A3 R38A: R17 and R26 are frozen, and nothing V5 or R39 exists', () => {
  it('R17 and R26’s comparator are byte-identical to their pins', () => {
    expect(sha256(readFileSync(join(REPO_ROOT, R17_PATH)))).toBe(R17_SHA256);
    expect(sha256(readFileSync(join(REPO_ROOT, R26_PATH)))).toBe(R26_SHA256);
  });

  it.skipIf(!baseAvailable)(
    'creates no Governance V5 namespace, registry, census and no R39 artifact',
    () => {
      const tree = lines(git('ls-tree', '-r', '--name-only', R38A_TERMINAL));
      expect(tree.filter((path) => path.startsWith(`${HARNESS}/a3governanceV5/`))).toEqual([]);
      const docs = tree
        .filter((path) => path.startsWith('docs/evaluation/') || path.startsWith('docs/audits/'))
        .map((path) => path.slice(path.lastIndexOf('/') + 1));
      expect(
        docs.filter((name) => /A3_R39|GOVERNANCE_AUTHORITY_CENSUS_V5|REGISTRY_V5/.test(name)),
      ).toEqual([]);
      expect(ALL_SOURCE).not.toMatch(/COMMITTED_A2_GOVERNANCE_REGISTRY_V5|GovernanceV5/);
    },
  );
});

describe('2D-A3 R38A: the namespace is exactly seven pure files', () => {
  it('holds exactly the seven contract modules', () => {
    expect(readdirSync(join(REPO_ROOT, NAMESPACE)).sort()).toEqual(NAMESPACE_FILES);
  });

  it('imports only R17, the A3 contracts, the draw contract and its own modules', () => {
    const specifiers = [...ALL_SOURCE.matchAll(/from '([^']+)'/g)].map((m) => m[1]!);
    const allowed = new Set([
      '../a3prep/slotAuthority.js',
      '../a3prep/contracts.js',
      '../draw/drawContract.js',
      ...NAMESPACE_FILES.map((f) => `./${f.replace(/\.ts$/, '.js')}`),
    ]);
    expect(specifiers.filter((s) => !allowed.has(s))).toEqual([]);
  });

  it('reads no environment and touches no filesystem, socket, process, clock, randomness or SQL', () => {
    expect(ALL_SOURCE).not.toMatch(
      /node:|process\.|require\(|readFile|writeFile|fetch\(|Date\.now|new Date|Math\.random|\bSELECT\b|\bINSERT\b|from 'pg'|createHash/,
    );
  });

  it('has no unsafe, test-only, forced or plain-object mint, and no recency rule', () => {
    expect(ALL_SOURCE).not.toMatch(
      /unsafe|testOnly|forceMint|fromPlainObject|skip.?validation|trust.?caller|latest|last.?record|newest|recordedAtUtc\s*>\s*|\.sort\(\(a, b\) => b/i,
    );
  });

  it('mints only through private WeakSet provenance, after all checks', () => {
    const resolveSource = source('resolve.ts');
    expect(resolveSource).toMatch(/const ISSUED_READY = new WeakSet<object>\(\);/);
    expect(resolveSource.match(/ISSUED_READY\.add\(/g)).toHaveLength(1);
    expect(resolveSource.indexOf('ISSUED_READY.add(')).toBeGreaterThan(
      resolveSource.indexOf('Every admission must be consumed'),
    );
    expect(ALL_SOURCE).not.toMatch(/export const ISSUED|export \{ ISSUED/);
  });

  it('never broadens R17: it calls R17 for Generation 1 and declares its own Generation-2 vocabulary', () => {
    expect(source('chain.ts')).toMatch(
      /resolveGenerationSlotAuthorities\(\{\s*generationId: GENERATION1_ID/,
    );
    expect(GENERATION1_ID).toBe('METHODOLOGY_V2_GEN1');
    expect(GENERATION2_ID).toBe('METHODOLOGY_V3_GEN2');
    expect(CROSS_GENERATION_CONTINUITY_FIELDS).not.toContain('resolutionGenerationId');
  });
});

describe.skipIf(!a2Available)('2D-A3 R38A: contract shape matches the landed A2 structures', () => {
  // SHAPE FIXTURES ONLY: vocabulary and per-entry structure, never a resolution.
  const gen2 = a2Available ? jsonAt(A2_CHECKPOINT, GEN2_LEDGER_PATH) : {};

  it('names both generations exactly as the landed ledgers do', () => {
    expect(gen2['generationId']).toBe(GENERATION2_ID);
    expect((gen2['generation1StartingState'] as Json)['generationId']).toBe(GENERATION1_ID);
  });

  it('the Generation-2 ledger speaks exactly the native vocabulary the contract reads', () => {
    const entries = gen2['entries'] as Json[];
    expect(entries).toHaveLength(21);
    for (const entry of entries) {
      expect(Object.keys(entry).sort()).toEqual([...GENERATION2_LEDGER_ENTRY_FIELDS].sort());
    }
    expect([...new Set(entries.map((e) => e['replacedOccupantKind']))].sort()).toEqual(
      [GENERATION1_TERMINAL_OCCUPANT, GENERATION2_RESERVE_REPLACEMENT].sort(),
    );
    let previous: unknown = null;
    entries.forEach((entry, k) => {
      const { entryHash, ...payload } = entry;
      expect(sha256(canonicalStringify(payload))).toBe(entryHash);
      expect(entry['previousEntryHash']).toBe(previous);
      expect(entry['sequence']).toBe(k);
      previous = entryHash;
    });
    expect(Object.keys(gen2['generation1StartingState'] as Json)).toEqual(
      expect.arrayContaining([
        'ledgerPath',
        'ledgerFileSha256',
        'ledgerHash',
        'ledgerEntryCount',
        'drawHash',
      ]),
    );
    expect(Object.keys(gen2['reserveSchedule'] as Json)).toEqual(
      expect.arrayContaining(['path', 'scheduleHash']),
    );
  });

  it('the Generation-1 ledger keeps its own 39-entry vocabulary', () => {
    const start = gen2['generation1StartingState'] as Json;
    const gen1 = jsonAt(GEN1_TERMINAL_COMMIT, String(start['ledgerPath']));
    const entries = gen1['entries'] as Json[];
    expect(entries).toHaveLength(39);
    for (const entry of entries) {
      expect(Object.keys(entry).sort()).toEqual([...ENTRY_FIELDS].sort());
    }
  });

  it('the 5670-entry schedule has the exact entry shape and recomputable schedule identity', () => {
    const schedule = jsonAt(A2_CHECKPOINT, GEN2_SCHEDULE_PATH);
    const entries = schedule['entries'] as Json[];
    expect(entries).toHaveLength(GENERATION2_RESERVE_COUNT);
    entries.forEach((entry, p) => {
      expect(Object.keys(entry).sort()).toEqual(
        [
          'echeRowKey',
          'frameEntrySha256',
          'generation2ReserveRankPosition',
          'organisationId',
          'rankHash',
          'scheduleEntrySha256',
          'sourceFrameRankPosition',
        ].sort(),
      );
      expect(entry['generation2ReserveRankPosition']).toBe(p);
      expect(entry['sourceFrameRankPosition']).toBe(GENERATION2_FIRST_SOURCE_FRAME_RANK + p);
      const { scheduleEntrySha256, ...payload } = entry;
      expect(sha256(canonicalStringify(payload))).toBe(scheduleEntrySha256);
      expect('drawEntrySha256' in entry).toBe(false);
    });
  });

  it('carry-forward slot records carry every field the admission binds', () => {
    const feasibility = jsonAt(A2_CHECKPOINT, FEASIBILITY_PATH);
    const slots = feasibility['slots'] as Json[];
    const successful = slots.find((s) => s['generation1Status'] === 'ACQUISITION_SUCCESSFUL')!;
    expect(Object.keys(successful)).toEqual(
      expect.arrayContaining([
        'selectionIndex',
        'split',
        'occupantKind',
        'generation1ReserveRankPosition',
        'drawEntrySha256',
        'dispositionAuthority',
        'liveResult',
        'runRefSha256',
        'acquisitionPolicyVersion',
        'acquisitionPolicyTransitionLedger',
      ]),
    );
  });

  it('the accepted-recovery adjudication declares its acquisition of record explicitly', () => {
    const adjudication = jsonAt(A2_CHECKPOINT, W13_ADJUDICATION_PATH);
    expect(adjudication['generationId']).toBe(GENERATION2_ID);
    const provenance = adjudication['acquisitionOfRecordProvenance'] as Json;
    const original = provenance['originalRun'] as Json;
    const recovery = provenance['recoveryRun'] as Json;
    expect(original['retained']).toBe(true);
    expect(recovery['accepted']).toBe(true);
    expect(recovery['effectiveCurrentGenerationAcquisitionOfRecord']).toBe(true);
    expect(original['runRefSha256']).not.toBe(recovery['runRefSha256']);
    const history = adjudication['targetedHostRecoveryHistoryBinding'] as Json;
    expect(Object.keys(history)).toEqual(
      expect.arrayContaining(['recoveryResult', 'originalRunRefSha256']),
    );
  });
});

describe('2D-A3 R38A: the public record and audit disclose nothing', () => {
  const raw = readFileSync(join(REPO_ROOT, RECORD), 'utf8');
  const record = JSON.parse(raw) as Json;
  const payload = (() => {
    const copy = JSON.parse(raw) as Json;
    delete copy['identityDisclosure'];
    return JSON.stringify(copy);
  })();

  it('is a governance-only contract record that authorises nothing and claims no V5 or delta', () => {
    expect(record['recordKind']).toBe('PUBLIC_GOVERNANCE_ONLY_AUTHORITY_CONTRACT_RECORD');
    expect(record['thisFileAuthorises']).toEqual([]);
    expect(record['ownerDecision']).toBe(
      'AUTHORISE_A3_R38A_CROSS_GENERATION_SLOT_AUTHORITY_CONTRACT_V1',
    );
    expect(record['governanceV5']).toEqual({
      minted: false,
      registryCreated: false,
      namespaceCreated: false,
      snapshotCreated: false,
      census: false,
    });
    expect(record['devTrainContinuity']).toMatchObject({
      derived: false,
      unchangedClaimed: 0,
      newClaimed: 0,
    });
    expect(record['terminalA2']).toMatchObject({ authoritiesDerived: 0, slotsClassified: 0 });
    expect(record['r39Started']).toBe(false);
    expect(Object.values(record['sideEffects'] as Json).every((v) => v === 0)).toBe(true);
    expect((record['continuity'] as Json)['evidenceFields']).toEqual([
      ...CROSS_GENERATION_CONTINUITY_FIELDS,
    ]);
    expect((record['r38RefusalBinding'] as Json)['sha256']).toBe(R38_REFUSAL_SHA256);
    expect((record['r17'] as Json)['sha256']).toBe(R17_SHA256);
  });

  it('names only the permitted commits and digests', () => {
    expect([...new Set(payload.match(/\b[0-9a-f]{64}\b/g) ?? [])].sort()).toEqual(
      [R38_REFUSAL_SHA256, R17_SHA256].sort(),
    );
    expect([...new Set(payload.match(/\b[0-9a-f]{40}\b/g) ?? [])].sort()).toEqual(
      [R38_TERMINAL, R38_SCOPE_PIN_COMMIT, A2_CHECKPOINT].sort(),
    );
  });

  it('carries no slot, reserve, run, organisation, host or synthetic identity', () => {
    for (const text of [payload, readFileSync(join(REPO_ROOT, AUDIT), 'utf8')]) {
      expect(text).not.toMatch(/G2[PR]:\d|"[A-Z]{1,3} [A-Z0-9-]+\|\d+"|SYN [A-Z]/);
      expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/);
      expect(text).not.toMatch(/https?:\/\/|SD7_DETAIL|sealed-|SYNTHETIC_/);
    }
    expect(payload.match(/\[\s*\d[^\]]*\]/g)).toBeNull();
  });

  it('the audit names the terminal state, only two digests, and claims no R39', () => {
    const audit = readFileSync(join(REPO_ROOT, AUDIT), 'utf8');
    expect(audit).toContain(
      'R38A_CROSS_GENERATION_SLOT_AUTHORITY_CONTRACT_V1_COMPLETE_READY_FOR_SEPARATELY_AUTHORISED_GOVERNANCE_V5_RETRY',
    );
    expect([...new Set(audit.match(/\b[0-9a-f]{64}\b/g) ?? [])].sort()).toEqual(
      [R38_REFUSAL_SHA256, R17_SHA256].sort(),
    );
    expect(audit).not.toMatch(/R39 (is|was) authori[sz]ed/i);
  });
});
