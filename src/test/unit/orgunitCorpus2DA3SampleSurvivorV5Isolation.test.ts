/**
 * PHASE 2B-2D A3 R42 — ISOLATION OF THE V5 INCREMENTAL SAMPLE SURVIVOR DELTA.
 *
 * Static and lineage proofs that R42:
 *
 *   - is exactly one new namespace, `a3samplesV5/`, and leaves every earlier
 *     namespace, frozen module, census and audit byte-identical;
 *   - reuses R23 only through its pure `prepareUnboundSlotSampleSurvivors`
 *     (exactly one call site) and `sampleSurvivorDivergence`, and R41 / R40
 *     only through their private brands and provenance;
 *   - never calls or re-implements a lower rank, salt, survivor-walk, cap or
 *     readiness helper, never mints through R23 / R29 / R36, and does no R43
 *     reachable-membership or SD9 work;
 *   - has no SQL, pool, environment, filesystem, network, clock, randomness,
 *     provider, classifier or sealed-root capability;
 *   - descends from the exact R41 tip, pins R41's scope in one first commit,
 *     and changes nothing outside its namespace, tests, census and audit;
 *   - publishes a census and audit that carry aggregate counts only.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { R42_PUBLIC_CENSUS_RECORD_KIND } from '../harness/phase2b2d/a3samplesV5/census.js';
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
const NAMESPACE = `${HARNESS}/a3samplesV5`;

/** The exact R41 tip R42 was cut from. */
const R41_TERMINAL = '5ede687e8de9fa8df322f36ae8bc69c635f3762e';
/** The one commit that pinned R41's own isolation test to its range. */
const R41_SCOPE_PIN_COMMIT = 'bf10b3ef931e599b701a80c543c5b5c4eb4091f5';
const R41_ISOLATION_TEST = 'src/test/unit/orgunitCorpus2DA3Sd7GraphV5Isolation.test.ts';
/** The terminal A2 checkpoint Governance V5 describes; never an A3 ancestor. */
const A2_CHECKPOINT = '29d0d486cb268b5431a0fc23eabb064682ec47d9';

const R42_TESTS = [
  'src/test/unit/orgunitCorpus2DA3SampleSurvivorV5Delta.test.ts',
  'src/test/unit/orgunitCorpus2DA3SampleSurvivorV5Isolation.test.ts',
];
const R42_CENSUS_PATH = `docs/evaluation/${R42_PUBLIC_CENSUS_RECORD_KIND}.json`;
const R42_AUDIT_PATH =
  'docs/audits/PHASE_2B_2D_A3_R42_INCREMENTAL_DEV_TRAIN_SAMPLE_SURVIVOR_PREPARATION_V5_V1.md';

const NAMESPACE_FILES = [
  'census.ts',
  'devTrain.ts',
  'history.ts',
  'prepareDelta.ts',
  'r41Drift.ts',
  'refusal.ts',
  'types.ts',
];

/** The reused and frozen modules, byte-pinned at the R41 tip: R42 uses them without altering them. */
const FROZEN_MODULE_SHA256: Readonly<Record<string, string>> = {
  'a3samples/prepare.ts': 'ac9f2af750d353cbe5faa9a2b67421fca7b66ebbfd0cfeffec9f93401ed4650b',
  'a3samples/types.ts': '08e67b9ea18a67e88894502490c5234572051d12228cfe292d3e32102b55c329',
  'a3samples/refusal.ts': '49a4bee4a2baacd7b50d32b2e4895ee5097287aab53339c7357ff40cdc4e6cef',
  'a3samplesV4/devTrain.ts': '34141dbe2d01357b7e6ae21f8d6f6ae87a4cc25b8560b785d6ad048a77f819ef',
  'a3samplesV4/prepareDelta.ts': 'ddde43591fad0682882b7aafb77131779f4940e81fbcd85829bd48850afe6225',
  'a3graphsV5/census.ts': '1645be0930c15c874edc627c4a35239e1bc6f7bf05e88703cbefe128fd2d1134',
  'a3graphsV5/devTrain.ts': 'fbc843c05b9915668e76fa3bbd3600632b2b757bf6f8c7f56604ff6d11d0fcc4',
  'a3graphsV5/history.ts': '2ec054dae3971c937747d6225354ea3a06149050da53488ca03a093771e6887e',
  'a3graphsV5/measureDelta.ts': '34eca0b9b012a814fae4a4db510bf32d1fd075999536ef9ca0785e3484734ca7',
  'a3graphsV5/r40Drift.ts': '85cda5d58259f616f5e40aa4e214eb786a428f451ea92c5e34dd55771e618857',
  'a3graphsV5/refusal.ts': '7e20e370cf7aecfc34e359e90d970b174e47ede10542475cd2eaf08e5e0b2f42',
  'a3graphsV5/types.ts': 'aa40d3bafdd7228ab75a4caec59a6c5c334675f026462eeb3a9e2d9a81d5aac3',
  'a3documentsV5/devTrain.ts': 'db7534759162a5dad35e558e8ee97f78efec235846ba86cd413b5a3c677f36a2',
  'a3documentsV5/types.ts': 'db30921c0c4190f91e7ffca5ef41c688a3e817ed71bc5812f75b5bb59e21eedd',
  'a3prep/sd7.ts': '322d2dd09f17dcc7ce0afa1862a13892f8bdadfece1c3ec919580f9d49977086',
  'a3prep/setPSd7.ts': 'b13c047f12ecf27583f07cef28923e3adc1e77ed2b3a1e1655de372cd79fdd4a',
  'a3prep/setRSd7.ts': 'b03e26fae833c527b9cbbd1962bdf95e886b3a01fbd5e636c61b4c9a8c62e056',
  'a3prep/setRSd7Readiness.ts': '6db33d0d39d9ab90fbf2e1b8b44a9649a6aa6db380d9f97cb5f1f8bdeb19561a',
  'a3prep/setP.ts': 'c6839c72d365e5fd9bbe1c0604a6539e42a297dfeb4876fd6ed17858b578401c',
  'a3prep/setR.ts': '76e8cae9f24c2ceb983ffa5777fcb96583cff0553e360126a711a282a6a75bec',
  'a3prep/setRScore.ts': '055747a5f5f067e06079562cd7e37a4e12d011d3736e28b947b5a30d6f588cf7',
  'a3prep/contracts.ts': '4d856f45dd6016e1007d661f31388bf7bdbefd71862a6585ed4962240454b40f',
  'a3readinessV4/devTrain.ts': 'b86f0c9f6cf2a73ad14eabe0470709be79894112f06f3b16c064ce1b39d4d388',
  'sd7/nearDuplicatePairs.ts': '1851726bb28789791d96e0cd27532846e6a503b234a5813bec70782e6e078371',
  'a3governanceV5/snapshotV5.ts':
    'd011e1ff595d1e2e1bf45c06daa5256925c73209641b9e6253577f4d95478cf8',
  'a3evidenceV5/devTrain.ts': '4637049717565a908205fd0fa589937012a26584e50bed23a6c04ae1dca2a7b6',
};

/** Every earlier namespace R42 must leave in place, with its file count. */
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
  a3graphsV5: 7,
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

const baseAvailable = commitExists(R41_TERMINAL) && commitExists(R41_SCOPE_PIN_COMMIT);

// ---------------------------------------------------------------------------
// A. THE NAMESPACE AND THE FROZEN SURFACES.
// ---------------------------------------------------------------------------

describe('2D-A3 R42: the new namespace is exactly these files', () => {
  it('holds the seven V5 incremental sample modules', () => {
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

describe('2D-A3 R42: reuse R23 and R41 by brand, never lower helpers or older minting', () => {
  const PERMITTED_SPECIFIERS = new Set([
    '../a3samples/prepare.js',
    '../a3samples/types.js',
    '../a3governanceV5/snapshotV5.js',
    '../a3graphsV5/census.js',
    '../a3graphsV5/devTrain.js',
    '../a3graphsV5/history.js',
    '../a3graphsV5/r40Drift.js',
    '../a3graphsV5/types.js',
    '../a3documentsV5/devTrain.js',
    '../a3documentsV5/types.js',
    ...NAMESPACE_FILES.map((file) => `./${file.replace(/\.ts$/, '.js')}`),
  ]);
  const TYPE_ONLY_SPECIFIERS = new Set([
    '../a3samples/types.js',
    '../a3governanceV5/snapshotV5.js',
    '../a3documentsV5/types.js',
  ]);

  it('imports nothing but landed R23 / R41 / R40 / V5 modules, and R23 types as TYPES only', () => {
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

  it('calls R23 prepareUnboundSlotSampleSurvivors at exactly one site, once per request', () => {
    const calls = NAMESPACE_FILES.filter((file) =>
      stripComments(code(file)).includes('prepareUnboundSlotSampleSurvivors('),
    );
    expect(calls).toEqual(['prepareDelta.ts']);
    const adapter = stripComments(code('prepareDelta.ts'));
    expect(adapter.match(/prepareUnboundSlotSampleSurvivors\(/g)).toHaveLength(1);
    expect(adapter).toContain('prepareUnboundSlotSampleSurvivors(request.slot, request.graph)');
    // Every request shape-checked before the first R23 call.
    expect(
      adapter.indexOf('requests.map((candidate, position) => requireRequestShape('),
    ).toBeLessThan(adapter.indexOf('prepareUnboundSlotSampleSurvivors('));
    // Divergence comes only from R23's own helper.
    const divergenceSites = NAMESPACE_FILES.filter((file) =>
      stripComments(code(file)).includes('sampleSurvivorDivergence('),
    );
    expect(divergenceSites.sort()).toEqual(['census.ts', 'prepareDelta.ts']);
  });

  it('never calls or re-implements a lower rank, salt, walk, cap or readiness helper', () => {
    const source = allCode();
    for (const forbidden of [
      /rankSetPFull|rankSetRFull|prepareSetPSd7|prepareSetRSd7|prepareSd7SampleSurvivors/,
      /determineSetRDocumentCap|deriveSetRFreezeSlotReadiness|prepareSetRDocumentScore/,
      // Only key-order normalisation sorts, and never with a comparator (no ranking).
      /salt\w*\(|saltedRank\w*\(|createHash|\.sort\(\s*\(|localeCompare/,
      /adjacency|survivorPositionByGraphIndex|connectedComponent|maxSurvivors|minSurvivors/,
      /\.slice\(0,\s*(8|4|max)/,
      /a3prep\/|sd7\//,
    ]) {
      expect(source, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it('never mints through R23 / R29 / R36, nor reaches R22 / R40 / R39 minting', () => {
    const source = allCode();
    for (const forbidden of [
      'bindDevTrainSampleSurvivorBatch(',
      'bindDevTrainSampleSurvivorDeltaBatchV2',
      'bindDevTrainSampleSurvivorDeltaBatchV4',
      'prepareDeltaSlotSamplesAllOrNothingV4',
      'a3samples/devTrain.js',
      'a3samplesV2/',
      'a3samplesV4/',
      'a3graphs/',
      'a3graphsV2/',
      'a3graphsV4/',
      'measureUnboundSlotSd7Graph',
      'bindDevTrainSd7GraphDeltaBatchV5',
      'bindDevTrainDocumentSourceDeltaBatchV5',
      'runDevTrainEvidenceDeltaBindingV5',
      'documentTextLookup',
    ]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });

  it('does no R43 reachable-membership, SD9, extension, SD4 / K4 or text work', () => {
    const source = allCode();
    for (const forbidden of [
      /deriveUnboundSlotReachableMembershipReadiness|reachableMembership\w*\(|a3readiness/,
      /evaluateSd9|sd9\w*\(|Sd9\w*\(|extension\w*\(|Extension\w*\(/,
      /\bsd4\w*\(|\bk4\w*\(|gateShare/i,
      /mainText|tokeni[sz]e|shingle|jaccard|toLowerCase/i,
    ]) {
      expect(source, String(forbidden)).not.toMatch(forbidden);
    }
    expect(stripComments(code('types.ts'))).not.toMatch(
      /mainText|\btext\b|title|heading|url|host/i,
    );
  });

  it('verifies, then prepares every slot, then mints - through private brands', () => {
    const binder = stripComments(code('devTrain.ts'));
    for (const brand of [
      'const MINTED_DELTA_PREPARATIONS = new WeakSet<object>();',
      'const MINTED_DELTA_SAMPLE_BATCHES = new WeakSet<object>();',
      'const DELTA_GRAPH_BY_PREPARATION = new WeakMap<',
      'const PREPARATION_BY_DELTA_GRAPH = new WeakMap<',
      'const GRAPH_BATCH_BY_SAMPLE_BATCH = new WeakMap<',
      'const SAMPLE_BATCH_BY_GRAPH_BATCH = new WeakMap<',
    ]) {
      expect(binder).toContain(brand);
    }
    expect(allCode()).not.toMatch(
      /export const (MINTED_|DELTA_GRAPH|PREPARATION_BY|GRAPH_BATCH|SAMPLE_BATCH|R23_CALLS|IN_FLIGHT|REPRODUCTION_PROOF|HISTORY_PROOF)/,
    );
    const bind = binder.slice(
      binder.indexOf('export function bindDevTrainSampleSurvivorDeltaBatchV5'),
    );
    const order = [
      'requireMintedGraphDeltaBatch(',
      'requireGraphMintedForBatch(',
      'requireAdditiveCoverage(',
      'prepareDeltaSlotSamplesAllOrNothingV5(',
      'mintDeltaPreparation(',
      'MINTED_DELTA_SAMPLE_BATCHES.add(',
    ].map((marker) => bind.indexOf(marker));
    expect(order.every((index) => index > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(binder.match(/MINTED_DELTA_PREPARATIONS\.add\(/g)).toHaveLength(1);
    // The exact R40 slot and the exact R41 canonical graph object, nothing else.
    expect(bind).toContain('pairs.map(({ graph, slot }) => ({ slot, graph: graph.graph }))');
    for (const field of ['setP', 'setR', 'setRDocumentCap', 'setRFreezeSlotReadiness']) {
      expect(binder).toContain(`${field}: unbound.${field},`);
    }
    expect(binder).not.toMatch(/unsafeMint|testOnlyMint|forceMint|fromPlainObject/);
    // Every request is prepared before any is validated, and validated before any mint.
    const adapter = stripComments(code('prepareDelta.ts'));
    expect(adapter.indexOf('prepareUnboundSlotSampleSurvivors(')).toBeLessThan(
      adapter.indexOf('requirePreparationCoversSlot(request'),
    );
  });

  it('hardcodes no count or index list in the binder path', () => {
    for (const file of ['prepareDelta.ts', 'devTrain.ts']) {
      expect(stripComments(code(file)), file).not.toMatch(/\b(6|7|13|20|23|200|223|388|580|611)\b/);
      expect(stripComments(code(file)), file).not.toMatch(/\[\s*\d+\s*,\s*\d+\s*,\s*\d+/);
    }
    expect(stripComments(code('devTrain.ts'))).not.toMatch(/expected(Item|Slot)?Count/);
  });
});

// ---------------------------------------------------------------------------
// C. NO OTHER CAPABILITY.
// ---------------------------------------------------------------------------

describe('2D-A3 R42: no SQL, pool, env, fs, network, provider, sealed or downstream capability', () => {
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
      /anthropic|claude-agent-sdk|@anthropic-ai|orgunits\/classify|classifier\w*\(/i,
      /DATABASE_URL|nwf_admin|nwf_research|nwf_ingest|nwf_classifier/,
      /Date\.now|new Date\(|Math\.random/,
      /sha256\(|console\./,
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
    expect(stripComments(code('types.ts'))).toContain('R42_SAMPLE_SPLIT = R41_GRAPH_SPLIT');
  });

  it('invents no sample, survivor, rank, cap or batch digest', () => {
    expect(allCode()).not.toMatch(
      /sampleDeltaHash|survivorCoverageHash|rankExpansionHash|capExpansionHash|batchHash|deltaDigest/i,
    );
  });
});

// ---------------------------------------------------------------------------
// D. LINEAGE AND CHANGED SURFACE.
// ---------------------------------------------------------------------------

describe.skipIf(!baseAvailable)('2D-A3 R42: lineage and changed surface', () => {
  it('descends from the exact R41 tip, and merges no commit', () => {
    expect(() => git('merge-base', '--is-ancestor', R41_TERMINAL, 'HEAD')).not.toThrow();
    expect(lines(git('rev-list', '--merges', `${R41_TERMINAL}..HEAD`))).toEqual([]);
  });

  it('never makes the terminal A2 checkpoint an ancestor of A3', () => {
    if (commitExists(A2_CHECKPOINT)) {
      expect(() => git('merge-base', '--is-ancestor', A2_CHECKPOINT, 'HEAD')).toThrow();
    }
  });

  it("pinned R41's scope in exactly one first commit that touched exactly one file", () => {
    const [first] = lines(git('rev-list', '--reverse', `${R41_TERMINAL}..HEAD`));
    expect(first).toBe(R41_SCOPE_PIN_COMMIT);
    expect(git('rev-parse', `${R41_SCOPE_PIN_COMMIT}^`).trim()).toBe(R41_TERMINAL);
    expect(lines(git('diff', '--name-only', R41_TERMINAL, R41_SCOPE_PIN_COMMIT))).toEqual([
      R41_ISOLATION_TEST,
    ]);
    expect(sha256(readFileSync(join(REPO_ROOT, R41_ISOLATION_TEST)))).toBe(
      sha256(git('show', `${R41_SCOPE_PIN_COMMIT}:${R41_ISOLATION_TEST}`)),
    );
  });

  it('leaves every earlier harness namespace untouched', () => {
    const touched = [
      ...lines(git('diff', '--name-only', R41_TERMINAL, '--', HARNESS)),
      ...lines(git('ls-files', '--others', '--exclude-standard', '--', HARNESS)),
    ].filter((path) => !path.startsWith(`${NAMESPACE}/`));
    expect(touched).toEqual([]);
  });

  it('leaves every earlier A3 public census and audit byte-identical', () => {
    const prior = lines(
      git('ls-tree', '-r', '--name-only', R41_TERMINAL, '--', 'docs/evaluation', 'docs/audits'),
    );
    expect(prior.length).toBeGreaterThan(0);
    expect(lines(git('diff', '--name-only', R41_TERMINAL, '--', ...prior))).toEqual([]);
  });

  it('changes nothing outside its namespace, tests, census, audit and the R41 scope pin', () => {
    const paths = [
      ...new Set([
        ...lines(git('diff', '--name-only', R41_TERMINAL)),
        ...lines(git('ls-files', '--others', '--exclude-standard')),
      ]),
    ];
    const permitted = (path: string): boolean =>
      path === R41_ISOLATION_TEST ||
      path.startsWith(`${NAMESPACE}/`) ||
      R42_TESTS.includes(path) ||
      path === R42_CENSUS_PATH ||
      path === R42_AUDIT_PATH;
    expect(paths.filter((path) => !permitted(path))).toEqual([]);
  });

  it('creates no R43, readiness V5, Governance V6 or A5 artifact', () => {
    for (const name of ['a3readinessV5', 'a3governanceV6']) {
      expect(existsSync(join(REPO_ROOT, HARNESS, name)), name).toBe(false);
    }
    const docs = [
      ...readdirSync(join(REPO_ROOT, 'docs/evaluation')),
      ...readdirSync(join(REPO_ROOT, 'docs/audits')),
    ];
    expect(
      docs.filter((name) => /A3_R43|GOVERNANCE_AUTHORITY_CENSUS_V6|A5_.*FREEZE/.test(name)),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// E. THE PUBLIC CENSUS AND AUDIT.
// ---------------------------------------------------------------------------

describe.skipIf(!existsSync(join(REPO_ROOT, R42_CENSUS_PATH)))(
  '2D-A3 R42: the committed census and audit',
  () => {
    const censusText = existsSync(join(REPO_ROOT, R42_CENSUS_PATH))
      ? readFileSync(join(REPO_ROOT, R42_CENSUS_PATH), 'utf8')
      : '{}';
    const auditText = existsSync(join(REPO_ROOT, R42_AUDIT_PATH))
      ? readFileSync(join(REPO_ROOT, R42_AUDIT_PATH), 'utf8')
      : '';
    const census = JSON.parse(censusText) as Record<string, Record<string, unknown>>;

    it('is the derived census record, and authorises nothing', () => {
      expect(census.record).toBe(R42_PUBLIC_CENSUS_RECORD_KIND);
      expect(census.recordKind).toBe(
        'PUBLIC_AGGREGATE_ONLY_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION_CENSUS',
      );
      expect(census.thisFileAuthorises).toEqual([]);
      expect(census.r41Tip).toBe(R41_TERMINAL);
      expect(census.r41ScopePinCommit).toBe(R41_SCOPE_PIN_COMMIT);
      expect(census.terminalState).toBe(
        'R42_INCREMENTAL_DEV_TRAIN_SAMPLE_SURVIVOR_V5_COMPLETE_READY_FOR_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9',
      );
    });

    it('reproduced R41 fresh, excluding only implementationCommit', () => {
      expect(census.r41Reproduction).toMatchObject({
        freshInProcessUpstreamChainConsumed: true,
        freshR41CensusEqualsCommitted: true,
        excludedExecutionProvenanceFields: ['implementationCommit'],
        differingSemanticPathCount: 0,
        reproducedGraphSlots: 7,
        reproducedDocuments: 223,
        reproducedMeasurableDocuments: 200,
        reproducedShortTextUnresolved: 23,
        reproducedComparedPairs: 2920,
        reproducedNearDuplicateEdges: 7,
        reproducedDocumentsInAtLeastOneNearDuplicateEdge: 13,
        reproducedCombinedGraphSlots: 20,
        reproducedCombinedDocuments: 611,
        reproducedCombinedMeasurableDocuments: 580,
        reproducedCombinedShortTextUnresolved: 31,
        reproducedCombinedComparedPairs: 8502,
        reproducedCombinedNearDuplicateEdges: 65,
        reproducedCombinedDocumentsInAtLeastOneNearDuplicateEdge: 54,
      });
    });

    it('states 13 historical + 7 new = 20 sample slots, every total a sum, readiness 13', () => {
      const coverage = census.coverage as Record<string, unknown>;
      const historical = coverage.historical as Record<string, Record<string, number>>;
      const added = coverage.new as Record<string, Record<string, number>>;
      const combined = coverage.coverage as Record<string, Record<string, number>>;
      expect(coverage).toMatchObject({
        historicalCanonicalSlotPreparations: 13,
        newR42SlotPreparations: 7,
        coverageSlotPreparations: 20,
        authorityCoverage: 20,
        evidenceCoverage: 20,
        documentCoverage: 20,
        graphCoverageAfterR42: 20,
        sampleCoverageAfterR42: 20,
        readinessCoverageAfterR42: 13,
        twentySlotSampleBatchMinted: false,
      });
      expect(historical.setP).toMatchObject({
        preSd7RankEntryCount: 388,
        measurableSurvivorCount: 354,
      });
      expect(historical.setR).toMatchObject({ exactCapDocumentCountAcrossExactSlots: 44 });
      expect(historical.divergence).toMatchObject({ survivingBothSamples: 342 });
      for (const sample of ['setP', 'setR'] as const) {
        expect(added[sample]).toMatchObject({
          preSd7RankEntryCount: 223,
          measurableDocumentCount: 200,
          unresolvedShortTextOccurrenceCount: 23,
        });
        expect(
          added[sample]!.measurableSurvivorCount! + added[sample]!.measurableExclusionCount!,
        ).toBe(200);
        expect(
          added[sample]!.initialCapExactSlotCount! + added[sample]!.initialCapBlockedSlotCount!,
        ).toBe(7);
        expect(combined[sample]).toMatchObject({
          preSd7RankEntryCount: 611,
          measurableDocumentCount: 580,
          unresolvedShortTextOccurrenceCount: 31,
        });
      }
      expect(
        added.setR!.fullRankExactSlotCount! + added.setR!.fullRankShortTextBlockedSlotCount!,
      ).toBe(7);
      const d = added.divergence!;
      expect(
        d.survivingBothSamples! +
          d.survivingSetPOnly! +
          d.survivingSetROnly! +
          d.excludedInBothSamples!,
      ).toBe(200);
      for (const section of ['setP', 'setR', 'divergence'] as const) {
        for (const [key, value] of Object.entries(combined[section]!)) {
          expect(value, `${section}.${key}`).toBe(
            historical[section]![key]! + added[section]![key]!,
          );
        }
      }
      expect(census.canonicalConstants).toMatchObject({
        setPMaxPagesPerOrganisation: 8,
        setRMaxPagesPerOrganisation: 4,
        k3SurvivorProcedure: 'GREEDY_SAMPLE_RANK_SURVIVOR_WALK',
        k3SurvivorScope: 'SAMPLE_SPECIFIC',
        k3GraphScope: 'ONE_CANONICAL_GRAPH_PER_ORGANISATION',
      });
    });

    it('records zero R42 SQL, seven R23 calls and only canonical R39 access upstream', () => {
      expect(census.access).toMatchObject({
        r42SqlStatements: 0,
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
        r21DocumentCalls: 7,
        r22GraphCalls: 7,
        r23SampleCalls: 7,
        historicalR23SampleCalls: 0,
        sqlAfterUpstreamPoolClose: 0,
        institutionNetworkRequests: 0,
        sealedRootReads: 0,
      });
      expect(census.semantics).toMatchObject({
        historicalPreparationsRecomputed: false,
        historicalPreparationObjectsReminted: false,
        deltaOnlySamplePreparation: true,
        canonicalR23PurePreparationUsed: true,
        canonicalR23CallsPerDeltaSlot: 1,
        canonicalR23CallCount: 7,
        historicalR23Calls: 0,
        canonicalR23DivergenceHelperUsed: true,
        rankReimplemented: false,
        survivorWalkReimplemented: false,
        capAlgorithmReimplemented: false,
        shortTextResolved: false,
        initialCapAndFullRankReadinessKeptSeparate: true,
        reachableMembershipBound: false,
        sd9Evaluated: false,
        completeCorpusPreflightRun: false,
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
        /"selectionIndex"|"echeRowKey"|"organisationId"|"runRefSha256"|"aIndex"|"documentSha256"|"sourceRankPosition"|"saltedRankSha256"/,
      );
      expect(text).not.toMatch(/G2[PR]:\d|\bR:\d+:\d+|\bP:\d+\b/);
      expect(text).not.toMatch(/sd7[^\s"]*\.json|detail\.json/i);
    });

    it('the census carries no per-slot array, score or fraction', () => {
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
