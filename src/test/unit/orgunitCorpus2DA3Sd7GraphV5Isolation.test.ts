/**
 * PHASE 2B-2D A3 R41 — ISOLATION OF THE GOVERNANCE V5 INCREMENTAL SD7 GRAPH DELTA.
 *
 * By reading source text, the repository's own history and the committed
 * records, this file proves:
 *
 *   - R41 lives in the NEW sibling namespace `a3graphsV5/`, and every earlier
 *     harness namespace - R22's `a3graphs/`, R35's `a3graphsV4/`, R40's
 *     `a3documentsV5/`, `sd7/` and `a3prep/` above all - is byte-identical to
 *     the R40 tip, with the reused modules pinned by sha256;
 *   - R41 reuses R22's pure measurement and structure check (once each, per
 *     slot) and R40's private text capability, never R22 / R28 / R35 minting
 *     or R35's V4 adapter, and reaches R40 only through its brand / provenance
 *     accessors and its census derivation;
 *   - the namespace is PURE: no pg, SQL, pool, environment, filesystem,
 *     network, clock, randomness, provider, classifier or sealed-root access,
 *     no tokenising / shingling / Jaccard, no component, survivor, SET_P /
 *     SET_R, cap, membership, readiness or SD9 work, no text read or length
 *     inspected, and no hardcoded count in the binder path;
 *   - the only pre-existing file R41 touched is R40's historical scope pin;
 *   - the committed R41 census and audit disclose no identity and invent no
 *     digest.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { R41_PUBLIC_CENSUS_RECORD_KIND } from '../harness/phase2b2d/a3graphsV5/census.js';
import {
  loadCommittedA2GovernanceV5,
  readyAuthoritiesOfV5,
} from '../harness/phase2b2d/a3governanceV5/snapshotV5.js';
import {
  loadCommittedA2GovernanceV4,
  readyAuthoritiesOfV4,
} from '../harness/phase2b2d/a3governanceV4/snapshotV4.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const HARNESS = 'src/test/harness/phase2b2d';
const NAMESPACE = `${HARNESS}/a3graphsV5`;

/** The exact R40 tip R41 was cut from. */
const R40_TERMINAL = '87f520d8549558e7d59cbe90b2419f378445a899';
/** The one commit that pinned R40's own isolation test to its range. */
const R40_SCOPE_PIN_COMMIT = '063e14c802f5a17d902f8591930dcf084b0bfd4b';
const R40_ISOLATION_TEST = 'src/test/unit/orgunitCorpus2DA3DocumentSourceV5Isolation.test.ts';
/**
 * R41'S OWN TERMINAL COMMIT.
 *
 * R41's lineage, changed-surface and historical-scope assertions describe
 * R41'S SLICE, so they range over R41's own commits - `R40_TERMINAL..R41_TERMINAL`
 * - rather than over the working tree. Once a later slice lands on top, the
 * working tree is no longer R41's surface, and diffing to it would fail for
 * the honest reason that history moved on rather than because R41 changed.
 *
 * This is the same standing convention R19 through R40 apply, and it
 * WEAKENS NOTHING: R41's range is frozen, its permitted-path list is
 * unchanged, and each later slice pins the equivalent scope over its own range.
 */
const R41_TERMINAL = '5ede687e8de9fa8df322f36ae8bc69c635f3762e';
/** The terminal A2 checkpoint Governance V5 describes; never an A3 ancestor. */
const A2_CHECKPOINT = '29d0d486cb268b5431a0fc23eabb064682ec47d9';

const R41_TESTS = [
  'src/test/unit/orgunitCorpus2DA3Sd7GraphV5Delta.test.ts',
  'src/test/unit/orgunitCorpus2DA3Sd7GraphV5Isolation.test.ts',
];
const R41_CENSUS_PATH = `docs/evaluation/${R41_PUBLIC_CENSUS_RECORD_KIND}.json`;
const R41_AUDIT_PATH = 'docs/audits/PHASE_2B_2D_A3_R41_INCREMENTAL_DEV_TRAIN_SD7_GRAPH_V5_V1.md';

const NAMESPACE_FILES = [
  'census.ts',
  'devTrain.ts',
  'history.ts',
  'measureDelta.ts',
  'r40Drift.ts',
  'refusal.ts',
  'types.ts',
];

/** The reused and frozen modules, byte-pinned at the R40 tip: R41 uses them without altering them. */
const FROZEN_MODULE_SHA256: Readonly<Record<string, string>> = {
  'a3graphs/measure.ts': 'bde8456bdb60c348af6affe81da9e631417e41921bf12b3029fe1612367d0dad',
  'a3graphs/types.ts': '5a40dcb749e26b20eae8a5d75af7260a8407f29dfc89fd93b6849021ddb2def3',
  'a3graphs/refusal.ts': '4a7b437b37a6ab225f082742a4f500d22050f457025fa46abc91e5097a566ec3',
  'a3graphsV4/devTrain.ts': 'e7e0c8367cb745906261a6e223f7281bb6f0d29a151bcf7b129aec817233a1c6',
  'a3graphsV4/measureDelta.ts': '43e10411505af1613a023ef0e04ba957ae97047569f724635fe3af5d212d7a2c',
  'a3documentsV5/devTrain.ts': 'db7534759162a5dad35e558e8ee97f78efec235846ba86cd413b5a3c677f36a2',
  'a3documentsV5/census.ts': 'f6248a33d7c7033e6c056d7ed128f92b1c988c5e875ceb81a76cf58e1faa0832',
  'a3documentsV5/history.ts': 'ca85ebe20740e78bf11b8367c25504b57122c2a06b30e11df562920eda1b9b6a',
  'a3documentsV5/r39Drift.ts': '470449c4a093e6e316f031d91e77848f5ae825642cd797648eb2a737f94af075',
  'a3documentsV5/types.ts': 'db30921c0c4190f91e7ffca5ef41c688a3e817ed71bc5812f75b5bb59e21eedd',
  'a3documentsV5/assembleDelta.ts':
    '96772494af5b6b1b057f3051e678dfed9cbca199009eb551b78595bec37115ed',
  'a3documentsV5/refusal.ts': 'badd203ba6523cb7881d99d17fd92e169b70cbebe484b0760bf30d93f26ebe8e',
  'a3documents/assemble.ts': '062da3fdcb9013b8e90741478b398c217f58a1da6ffcf5ceeb3d640ce45cb1af',
  'sd7/nearDuplicatePairs.ts': '1851726bb28789791d96e0cd27532846e6a503b234a5813bec70782e6e078371',
  'sd7/sd7Contract.ts': '882dad5e990cf40ff326b5fecea3e691720b6d8214f02bf4629ab6fefd2b0f60',
  'sd7/normaliseText.ts': 'b518e2ab02eb9284c56a5c0172f79480a8fd110f7433f502fe3e619a3846df90',
  'sd7/tokenShingles.ts': '3a56ac6c9eea4dd70c66ea1d2965b323b38b21883103d7b1b4d0a646c9548b0f',
  'sd7/jaccard.ts': 'd086b5cd789b7877ddce962469839c8d7cbdf86412568962d42b04451529a930',
  'a3governanceV5/snapshotV5.ts':
    'd011e1ff595d1e2e1bf45c06daa5256925c73209641b9e6253577f4d95478cf8',
  'a3evidenceV5/devTrain.ts': '4637049717565a908205fd0fa589937012a26584e50bed23a6c04ae1dca2a7b6',
};

/** Every earlier namespace R41 must leave in place, with its file count. */
const FROZEN_NAMESPACES: Readonly<Record<string, number>> = {
  a3prep: 16,
  sd7: 9,
  a3governance: 7,
  a3governanceV2: 7,
  a3governanceV3: 8,
  a3governanceV4: 10,
  a3governanceV5: 12,
  a3crossGenerationSlotAuthority: 7,
  a3evidence: 7,
  a3evidenceV2: 6,
  a3evidenceV4: 6,
  a3evidenceV5: 7,
  a3documents: 6,
  a3documentsV2: 6,
  a3documentsV4: 6,
  a3documentsV5: 7,
  a3graphs: 6,
  a3graphsV2: 7,
  a3graphsV4: 6,
  a3samples: 6,
  a3samplesV2: 6,
  a3samplesV4: 6,
  a3readiness: 6,
  a3readinessV2: 6,
  a3readinessV4: 6,
};

function git(...args: readonly string[]): string {
  return execFileSync('git', ['-C', REPO_ROOT, ...args], {
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
const code = (file: string): string => readFileSync(join(REPO_ROOT, NAMESPACE, file), 'utf8');

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const allCode = (): string => NAMESPACE_FILES.map((file) => stripComments(code(file))).join('\n');

function specifiersOf(source: string): string[] {
  return [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]!);
}

const baseAvailable =
  commitExists(R40_TERMINAL) && commitExists(R40_SCOPE_PIN_COMMIT) && commitExists(R41_TERMINAL);

// ---------------------------------------------------------------------------
// A. THE NAMESPACE AND THE FROZEN SURFACES.
// ---------------------------------------------------------------------------

describe('2D-A3 R41: the new namespace is exactly these files', () => {
  it('holds the seven V5 incremental graph modules', () => {
    expect(readdirSync(join(REPO_ROOT, NAMESPACE)).sort()).toEqual(NAMESPACE_FILES);
  });

  it('leaves every earlier A3 namespace at its file count', () => {
    for (const [namespace, count] of Object.entries(FROZEN_NAMESPACES)) {
      expect(readdirSync(join(REPO_ROOT, HARNESS, namespace)), namespace).toHaveLength(count);
    }
  });

  it.each(Object.entries(FROZEN_MODULE_SHA256))('%s is byte-identical to its pin', (path, pin) => {
    expect(sha256(readFileSync(join(REPO_ROOT, HARNESS, path)))).toBe(pin);
  });
});

// ---------------------------------------------------------------------------
// B. WHAT IS REUSED, AND WHAT IS NOT.
// ---------------------------------------------------------------------------

describe('2D-A3 R41: reuse R22 and R40 by brand, never older minting or the V4 adapter', () => {
  const PERMITTED_SPECIFIERS = new Set([
    '../a3graphs/measure.js',
    '../a3graphs/types.js',
    '../a3governanceV5/snapshotV5.js',
    '../a3documentsV5/census.js',
    '../a3documentsV5/devTrain.js',
    '../a3documentsV5/history.js',
    '../a3documentsV5/r39Drift.js',
    '../a3documentsV5/types.js',
    ...NAMESPACE_FILES.map((file) => `./${file.replace(/\.ts$/, '.js')}`),
  ]);
  const TYPE_ONLY_SPECIFIERS = new Set(['../a3graphs/types.js']);

  it('imports nothing but landed R22 / R40 / V5 modules, and R22 types as TYPES only', () => {
    for (const file of NAMESPACE_FILES) {
      const source = code(file);
      for (const specifier of specifiersOf(source)) {
        expect(PERMITTED_SPECIFIERS.has(specifier), `${file}: ${specifier}`).toBe(true);
      }
      for (const specifier of TYPE_ONLY_SPECIFIERS) {
        const imports = [...source.matchAll(/^import (type )?[^;]*? from '([^']+)';/gms)].filter(
          (match) => match[2] === specifier,
        );
        for (const match of imports) expect(match[1], `${file}: ${specifier}`).toBe('type ');
      }
    }
  });

  it('calls R22 measureUnboundSlotSd7Graph and its structure check at exactly one site', () => {
    const calls = NAMESPACE_FILES.filter((file) =>
      stripComments(code(file)).includes('measureUnboundSlotSd7Graph('),
    );
    expect(calls).toEqual(['measureDelta.ts']);
    const adapter = stripComments(code('measureDelta.ts'));
    expect(adapter.match(/measureUnboundSlotSd7Graph\(/g)).toHaveLength(1);
    expect(adapter.match(/requireCanonicalGraphStructure\(/g)).toHaveLength(1);
    const loop = adapter.slice(adapter.indexOf('checked.forEach('));
    expect(loop.indexOf('measureUnboundSlotSd7Graph(request.slot, request.textLookup)')).toBe(
      loop.indexOf('measureUnboundSlotSd7Graph('),
    );
    expect(loop.indexOf('requireCanonicalGraphStructure(request.slot, unbound.graph)')).toBe(
      loop.indexOf('requireCanonicalGraphStructure('),
    );
    // Every request shape-checked before the first R22 call.
    expect(
      adapter.indexOf('requests.map((candidate, position) => requireRequestShape('),
    ).toBeLessThan(adapter.indexOf('checked.forEach('));
  });

  it('never calls R22 / R28 / R35 minting, R35 / R34 adapters, or older document accessors', () => {
    const source = allCode();
    for (const forbidden of [
      'bindDevTrainSd7GraphBatch(',
      'bindDevTrainSd7GraphDeltaBatchV2',
      'bindDevTrainSd7GraphDeltaBatchV4',
      'measureDeltaSlotGraphsAllOrNothingV4',
      'a3graphs/devTrain.js',
      'a3graphsV2/',
      'a3graphsV4/',
      'a3documents/',
      'a3documentsV2/',
      'a3documentsV4/',
      'a3evidenceV5/',
      'documentTextLookupForSlotAssembly',
      'documentTextLookupForDeltaSlotAssembly(',
      'documentTextLookupForDeltaSlotAssemblyV4',
      'documentTextLookupForUnboundSlotAssembly',
      'bindDevTrainDocumentSourceDeltaBatchV5',
      'runDevTrainEvidenceDeltaBindingV5',
    ]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });

  it('owns no SD7 semantics and never reads a text', () => {
    const source = allCode();
    for (const forbidden of [
      /measureNearDuplicateGraph|nearDuplicatePass|exactDuplicatePass|exactGroupsForSlotDocuments/,
      /tokeni[sz]e|shingleSet|tokenShingles|jaccard\(|intersectionSize|unionSize|minhash/i,
      /normaliseForShingling|hasEnoughTokensToShingle|atOrAboveNearDuplicateThreshold/,
      /\.similarity|measurement\.(intersection|union)|NEAR_DUPLICATE_/,
      /mainText|\.trim\(|toLowerCase|normalize\(/,
    ]) {
      expect(source, String(forbidden)).not.toMatch(forbidden);
    }
    // The only lookup R41 ever calls is R40's capability accessor; it never
    // invokes a lookup itself, so it never sees, measures or special-cases a text.
    const lookupCalls = [...source.matchAll(/\b(\w*[Ll]ookup\w*)\s*\(/g)].map((m) => m[1]);
    expect(new Set(lookupCalls)).toEqual(new Set(['documentTextLookupForDeltaSlotAssemblyV5']));
    expect(stripComments(code('types.ts'))).not.toMatch(
      /mainText|\btext\b|title|heading|url|host/i,
    );
  });

  it('computes no component, survivor, sample, rank, cap, membership, readiness or SD9', () => {
    const source = allCode();
    for (const forbidden of [
      /auditComponents|connectedComponent|maxSurvivors|minSurvivors|greedy/i,
      /prepareUnboundSlotSampleSurvivors|prepareSetPSd7|prepareSetRSd7|determineSetRDocumentCap/,
      /deriveSetRFreezeSlotReadiness|reachableMembership\w*\(|evaluateSd9|sd9\w*\(/,
      /setPCap|setRCap|rankSetP|rankSetR|prepareSetRDocumentScore/,
      /a3samples|a3readiness|a3prep|sd7\//,
    ]) {
      expect(source, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it('verifies, then obtains every capability, then measures, then mints - through private brands', () => {
    const binder = stripComments(code('devTrain.ts'));
    for (const brand of [
      'const MINTED_DELTA_GRAPHS = new WeakSet<object>();',
      'const MINTED_DELTA_GRAPH_BATCHES = new WeakSet<object>();',
      'const DOCUMENT_SLOT_BY_DELTA_GRAPH = new WeakMap<',
      'const DELTA_GRAPH_BY_DOCUMENT_SLOT = new WeakMap<',
      'const DOCUMENT_BATCH_BY_GRAPH_BATCH = new WeakMap<',
      'const GRAPH_BATCH_BY_DOCUMENT_BATCH = new WeakMap<',
    ]) {
      expect(binder).toContain(brand);
    }
    expect(allCode()).not.toMatch(
      /export const (MINTED_|DOCUMENT_SLOT|DELTA_GRAPH|DOCUMENT_BATCH|GRAPH_BATCH|R22_CALLS|IN_FLIGHT|REPRODUCTION_PROOF|HISTORY_PROOF)/,
    );
    const bind = binder.slice(binder.indexOf('export function bindDevTrainSd7GraphDeltaBatchV5'));
    const order = [
      'requireMintedDocumentDeltaBatch(',
      'requireAdditiveCoverage(',
      'requireSlotMintedForBatch(',
      'documentTextLookupForDeltaSlotAssemblyV5(',
      'measureDeltaSlotGraphsAllOrNothingV5(',
      'mintDeltaGraph(',
      'MINTED_DELTA_GRAPH_BATCHES.add(',
    ].map((marker) => bind.indexOf(marker));
    expect(order.every((index) => index > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(binder.match(/MINTED_DELTA_GRAPHS\.add\(/g)).toHaveLength(1);
    expect(binder).toContain('graph: unbound.graph,');
    expect(binder).not.toMatch(/unsafeMint|testOnlyMint|forceMint|fromPlainObject/);
  });

  it('hardcodes no count or index list in the binder path', () => {
    for (const file of ['measureDelta.ts', 'devTrain.ts']) {
      expect(stripComments(code(file)), file).not.toMatch(/\b(6|7|13|20|223|224|388|611)\b/);
      expect(stripComments(code(file)), file).not.toMatch(/\[\s*\d+\s*,\s*\d+\s*,\s*\d+/);
    }
    expect(stripComments(code('devTrain.ts'))).not.toMatch(/expected(Item|Slot)?Count/);
  });
});

// ---------------------------------------------------------------------------
// C. NO OTHER CAPABILITY.
// ---------------------------------------------------------------------------

describe('2D-A3 R41: no SQL, pool, env, fs, network, provider, sealed or downstream capability', () => {
  it('issues no SQL and touches no pool', () => {
    const source = allCode();
    expect(source).not.toMatch(/\bSELECT\b|\bINSERT\b|\bFROM\s+orgunit_|\bJOIN\b|\bWHERE\b/);
    expect(source).not.toMatch(
      /\.query\(|\.connect\(|\.end\(|\.release\(|new\s+Pool|from 'pg'|totalCount/,
    );
  });

  it('reads no environment and touches no filesystem, socket, provider or child process', () => {
    const source = allCode();
    for (const forbidden of [
      /process\.env/,
      /node:(fs|net|tls|http|https|dns|child_process|crypto)/,
      /\bfetch\s*\(/,
      /readFile|writeFile|appendFile|mkdir|createWriteStream|unlink|rmSync/,
      /execFile|execSync|spawn/,
      /anthropic|claude-agent-sdk|@anthropic-ai|orgunits\/classify|classifier/i,
      /DATABASE_URL|nwf_admin|nwf_research|nwf_ingest|nwf_classifier/,
      /Date\.now|new Date\(|Math\.random/,
      /createHash|sha256\(|console\./,
    ]) {
      expect(source, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it('reaches no sealed root, A2 harness, Governance V6 or other split', () => {
    const source = allCode();
    expect(source).not.toMatch(
      /methodology-v2-sealed|gen1-dev-train|gen1-dev-confirm|gen1-final-holdout|phase2b2d2c/,
    );
    expect(source).not.toMatch(/continuationWindow|acquisitionGate|\/corpus\/|a3governanceV6/);
    expect(source).not.toMatch(/'DEV_CONFIRM'|'FINAL_HOLDOUT'/);
    expect(stripComments(code('types.ts'))).toContain('R41_GRAPH_SPLIT = R40_DOCUMENT_SPLIT');
  });

  it('invents no graph, coverage, text-lookup or batch digest', () => {
    expect(allCode()).not.toMatch(
      /graphDeltaHash|graphCoverageHash|sd7ExpansionHash|textLookupHash|batchHash|deltaDigest/i,
    );
  });
});

// ---------------------------------------------------------------------------
// D. LINEAGE AND CHANGED SURFACE.
// ---------------------------------------------------------------------------

describe.skipIf(!baseAvailable)('2D-A3 R41: lineage and changed surface', () => {
  it('descends from the exact R40 tip, and merges no commit', () => {
    expect(() => git('merge-base', '--is-ancestor', R40_TERMINAL, R41_TERMINAL)).not.toThrow();
    expect(lines(git('rev-list', '--merges', `${R40_TERMINAL}..${R41_TERMINAL}`))).toEqual([]);
  });

  it('never makes the terminal A2 checkpoint an ancestor of A3', () => {
    if (commitExists(A2_CHECKPOINT)) {
      expect(() => git('merge-base', '--is-ancestor', A2_CHECKPOINT, 'HEAD')).toThrow();
    }
  });

  it("pinned R40's scope in exactly one first commit that touched exactly one file", () => {
    const [first] = lines(git('rev-list', '--reverse', `${R40_TERMINAL}..${R41_TERMINAL}`));
    expect(first).toBe(R40_SCOPE_PIN_COMMIT);
    expect(git('rev-parse', `${R40_SCOPE_PIN_COMMIT}^`).trim()).toBe(R40_TERMINAL);
    expect(lines(git('diff', '--name-only', R40_TERMINAL, R40_SCOPE_PIN_COMMIT))).toEqual([
      R40_ISOLATION_TEST,
    ]);
    expect(sha256(git('show', `${R41_TERMINAL}:${R40_ISOLATION_TEST}`))).toBe(
      sha256(git('show', `${R40_SCOPE_PIN_COMMIT}:${R40_ISOLATION_TEST}`)),
    );
  });

  it('leaves every earlier harness namespace untouched', () => {
    const touched = lines(
      git('diff', '--name-only', R40_TERMINAL, R41_TERMINAL, '--', HARNESS),
    ).filter((path) => !path.startsWith(`${NAMESPACE}/`));
    expect(touched).toEqual([]);
  });

  it('leaves every earlier A3 public census and audit byte-identical', () => {
    const prior = lines(
      git('ls-tree', '-r', '--name-only', R40_TERMINAL, '--', 'docs/evaluation', 'docs/audits'),
    );
    expect(prior.length).toBeGreaterThan(0);
    expect(lines(git('diff', '--name-only', R40_TERMINAL, R41_TERMINAL, '--', ...prior))).toEqual(
      [],
    );
  });

  it('changes nothing outside its namespace, tests, census, audit and the R40 scope pin', () => {
    const paths = lines(git('diff', '--name-only', R40_TERMINAL, R41_TERMINAL));
    const permitted = (path: string): boolean =>
      path === R40_ISOLATION_TEST ||
      path.startsWith(`${NAMESPACE}/`) ||
      R41_TESTS.includes(path) ||
      path === R41_CENSUS_PATH ||
      path === R41_AUDIT_PATH;
    expect(paths.filter((path) => !permitted(path))).toEqual([]);
  });

  it('created no R42, sample / readiness V5, Governance V6 or A5 artifact (tree at R41_TERMINAL)', () => {
    const tree = lines(git('ls-tree', '-r', '--name-only', R41_TERMINAL));
    for (const name of ['a3samplesV5', 'a3readinessV5', 'a3governanceV6']) {
      expect(
        tree.filter((path) => path.startsWith(`${HARNESS}/${name}/`)),
        name,
      ).toEqual([]);
    }
    const docs = tree
      .filter((path) => path.startsWith('docs/evaluation/') || path.startsWith('docs/audits/'))
      .map((path) => path.slice(path.lastIndexOf('/') + 1));
    expect(
      docs.filter((name) => /A3_R42|GOVERNANCE_AUTHORITY_CENSUS_V6|A5_.*FREEZE/.test(name)),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// E. THE PUBLIC CENSUS AND AUDIT.
// ---------------------------------------------------------------------------

describe.skipIf(!existsSync(join(REPO_ROOT, R41_CENSUS_PATH)))(
  '2D-A3 R41: the committed census and audit',
  () => {
    const censusText = existsSync(join(REPO_ROOT, R41_CENSUS_PATH))
      ? readFileSync(join(REPO_ROOT, R41_CENSUS_PATH), 'utf8')
      : '{}';
    const auditText = existsSync(join(REPO_ROOT, R41_AUDIT_PATH))
      ? readFileSync(join(REPO_ROOT, R41_AUDIT_PATH), 'utf8')
      : '';
    const census = JSON.parse(censusText) as Record<string, Record<string, unknown>>;

    it('is the derived census record, and authorises nothing', () => {
      expect(census.record).toBe(R41_PUBLIC_CENSUS_RECORD_KIND);
      expect(census.recordKind).toBe('PUBLIC_AGGREGATE_ONLY_INCREMENTAL_SD7_GRAPH_CENSUS');
      expect(census.thisFileAuthorises).toEqual([]);
      expect(census.r40Tip).toBe(R40_TERMINAL);
      expect(census.r40ScopePinCommit).toBe(R40_SCOPE_PIN_COMMIT);
      expect(census.terminalState).toBe(
        'R41_INCREMENTAL_DEV_TRAIN_SD7_GRAPH_V5_COMPLETE_READY_FOR_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION',
      );
    });

    it('reproduced R40 fresh, excluding only implementationCommit', () => {
      expect(census.r40Reproduction).toMatchObject({
        freshInProcessR39R40ChainConsumed: true,
        freshR40CensusEqualsCommitted: true,
        excludedExecutionProvenanceFields: ['implementationCommit'],
        differingSemanticPathCount: 0,
        freshR40DeltaSlots: 7,
        freshR40SourceRows: 224,
        freshR40Documents: 223,
        freshR40CandidateObservations: 448,
        freshR40R21Calls: 7,
        freshHistoricalR21Calls: 0,
      });
    });

    it('states 13 historical + 7 new = 20 graph slots over 611 documents, sample / readiness 13', () => {
      const delta = census.deltaGraph as Record<string, number>;
      const coverage = census.coverage as Record<string, unknown>;
      expect(delta.deltaGraphSlots).toBe(7);
      expect(delta.deltaDocuments).toBe(223);
      expect(delta.deltaMeasurableDocuments! + delta.deltaShortTextUnresolved!).toBe(223);
      expect(coverage).toMatchObject({
        historicalCanonicalGraphSlots: 13,
        newR41GraphSlots: 7,
        coverageGraphSlots: 20,
        historicalDocuments: 388,
        coverageDocuments: 611,
        coverageMeasurableDocuments: 380 + delta.deltaMeasurableDocuments!,
        coverageShortTextUnresolved: 8 + delta.deltaShortTextUnresolved!,
        coverageComparedPairs: 5582 + delta.deltaComparedPairs!,
        coverageNearDuplicateEdges: 58 + delta.deltaNearDuplicateEdges!,
        coverageDocumentsInAtLeastOneNearDuplicateEdge:
          41 + delta.deltaDocumentsInAtLeastOneNearDuplicateEdge!,
        documentCoverage: 20,
        graphCoverageAfterR41: 20,
        sampleCoverageAfterR41: 13,
        readinessCoverageAfterR41: 13,
        twentySlotGraphBatchMinted: false,
      });
      expect(census.canonicalSd7).toMatchObject({
        shingleSizeTokens: 5,
        jaccardThresholdNumerator: 9,
        jaccardThresholdDenominator: 10,
        thresholdComparison: 'AT_OR_ABOVE',
        comparisonScope: 'WITHIN_ONE_ORGANISATION_ONLY',
        shortTextStatus: 'SD7_SHORT_TEXT_UNRESOLVED',
      });
    });

    it('records zero R41 SQL, seven R22 calls and only canonical R39 access upstream', () => {
      expect(census.access).toMatchObject({
        r41SqlStatements: 0,
        databaseAccessOnlyThroughCanonicalUpstreamR39Reproduction: true,
        upstreamRole: 'nwf_readonly',
        upstreamDatabase: 'nwf_pe',
        upstreamTransactionReadOnly: true,
        upstreamTransactionIsolation: 'repeatable read',
        upstreamPoolConnections: 1,
        upstreamSnapshotTransactions: 1,
        upstreamSqlStatements: 45,
        upstreamNewAuthorityEvidenceLoads: 7,
        upstreamOldAuthorityEvidenceLoads: 0,
        upstreamDevConfirmEvidenceReads: 0,
        upstreamFinalHoldoutEvidenceReads: 0,
        upstreamWrites: 0,
        r21DocumentCallsDuringR40Reproduction: 7,
        r22GraphCalls: 7,
        historicalR22GraphCalls: 0,
        r22CallsWhileUpstreamPoolOpen: 0,
        sqlAfterUpstreamPoolClose: 0,
      });
      expect(census.semantics).toMatchObject({
        historicalGraphsRemeasured: false,
        historicalGraphObjectsReminted: false,
        canonicalR22CallsPerDeltaSlot: 1,
        canonicalR22CallCount: 7,
        historicalR22Calls: 0,
        textReadOnlyThroughR40Capability: true,
        textPersistedByR41: false,
        crossOrganisationPairsMeasured: false,
        shortTextResolved: false,
        componentsComputed: false,
        survivorSelectionPerformed: false,
        setPRanked: false,
        setRRanked: false,
        reachableMembershipPerformed: false,
        sd9Evaluated: false,
      });
    });

    it.each([
      ['census', censusText],
      ['audit', auditText],
    ])('the %s carries no identity-, position-, run- or digest-bearing value', (_name, text) => {
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(/\b[0-9a-f]{64}\b/);
      expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
      expect(text).not.toMatch(/https?:\/\//);
      expect(text).not.toMatch(
        /"selectionIndex"|"echeRowKey"|"organisationId"|"runRefSha256"|"aIndex"|"similarity"/,
      );
      expect(text).not.toMatch(/G2[PR]:\d|\bR:\d+:\d+|\bP:\d+\b/);
      expect(text).not.toMatch(/sd7[^\s"]*\.json|detail\.json/i);
    });

    it('the census carries no per-slot array, similarity or score', () => {
      expect(censusText).not.toMatch(/\[\s*-?\d+(\.\d+)?\s*,/);
      expect(censusText).not.toMatch(/-?\d+\.\d+/);
    });

    it('neither the census nor the audit carries any V4 or V5 READY identity', () => {
      const v4 = loadCommittedA2GovernanceV4(REPO_ROOT);
      const v5 = loadCommittedA2GovernanceV5(REPO_ROOT);
      const identities = [
        ...readyAuthoritiesOfV4(v4).flatMap((ready) => [
          ready.organisationId,
          ready.echeRowKey,
          ready.runRefSha256,
          ready.drawEntrySha256,
        ]),
        ...readyAuthoritiesOfV5(v5).flatMap((ready) => [
          ready.occupant.source.organisationId,
          ready.occupant.source.echeRowKey,
          ready.runRefSha256,
        ]),
      ];
      for (const identity of identities) {
        expect(censusText).not.toContain(identity);
        expect(auditText).not.toContain(identity);
      }
    });
  },
);
