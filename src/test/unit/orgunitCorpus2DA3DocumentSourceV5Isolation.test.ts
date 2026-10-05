/**
 * PHASE 2B-2D A3 R40 — ISOLATION OF THE GOVERNANCE V5 INCREMENTAL DOCUMENT-SOURCE DELTA.
 *
 * By reading source text, the repository's own history and the committed
 * records, this file proves:
 *
 *   - R40 lives in the NEW sibling namespace `a3documentsV5/`, and every
 *     earlier harness namespace - R21's `a3documents/`, R34's
 *     `a3documentsV4/`, R39's `a3evidenceV5/`, `sd7/` and `a3prep/` above all -
 *     is byte-identical to the R39 tip, with the reused modules pinned by
 *     sha256;
 *   - R40 reuses R21's pure assembler (once, per item) and its text lookup,
 *     never R21 / R27 / R34 minting or R34's V4 adapter, and reaches R39 only
 *     through its brand / provenance accessors and its census derivation;
 *   - the namespace is PURE: no pg, SQL, pool, environment, filesystem,
 *     network, clock, randomness, provider, classifier or sealed-root access,
 *     no SD7 graph / tokenising / shingling, no SET_P / SET_R / readiness,
 *     no text transformation, no generation branch and no hardcoded count in
 *     the binder path;
 *   - the only pre-existing file R40 touched is R39's historical scope pin;
 *   - the committed R40 census and audit disclose no identity and invent no
 *     digest.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { R40_PUBLIC_CENSUS_RECORD_KIND } from '../harness/phase2b2d/a3documentsV5/census.js';
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
const NAMESPACE = `${HARNESS}/a3documentsV5`;

/** The exact R39 tip R40 was cut from. */
const R39_TERMINAL = 'b4838059207216c4c4487dd816b3f3dae827166d';
/** The one commit that pinned R39's own isolation test to its range. */
const R39_SCOPE_PIN_COMMIT = '253aa1115e5a1354f4c00c7a95a3d6850113a987';
const R39_ISOLATION_TEST = 'src/test/unit/orgunitCorpus2DA3EvidenceV5Isolation.test.ts';
/** The terminal A2 checkpoint Governance V5 describes; never an A3 ancestor. */
const A2_CHECKPOINT = '29d0d486cb268b5431a0fc23eabb064682ec47d9';

const R40_TESTS = [
  'src/test/unit/orgunitCorpus2DA3DocumentSourceV5Delta.test.ts',
  'src/test/unit/orgunitCorpus2DA3DocumentSourceV5Isolation.test.ts',
];
const R40_CENSUS_PATH = `docs/evaluation/${R40_PUBLIC_CENSUS_RECORD_KIND}.json`;
const R40_AUDIT_PATH =
  'docs/audits/PHASE_2B_2D_A3_R40_INCREMENTAL_DEV_TRAIN_DOCUMENT_SOURCE_ASSEMBLY_V5_V1.md';

const NAMESPACE_FILES = [
  'assembleDelta.ts',
  'census.ts',
  'devTrain.ts',
  'history.ts',
  'r39Drift.ts',
  'refusal.ts',
  'types.ts',
];

/** The reused and frozen modules, byte-pinned: R40 uses them without altering them. */
const FROZEN_MODULE_SHA256: Readonly<Record<string, string>> = {
  'a3documents/assemble.ts': '062da3fdcb9013b8e90741478b398c217f58a1da6ffcf5ceeb3d640ce45cb1af',
  'a3documents/census.ts': 'ebffcae2b9a5840e1a087d94e59e7d9fbe7463a357a36716b1dd33eb467e94ef',
  'a3documents/devTrain.ts': 'd962748b397f9c0e62da4d9e7aa649d5f47ea109fd5d4ff16b70afc3ce6f1ad1',
  'a3documents/r20Drift.ts': '0750310eaf1f44ed18f27132964ae3a261870bc276a7f0cefaca57f9c6d934ae',
  'a3documents/refusal.ts': 'e62a186837302ff0836b794934c28e0f5cf6e643490d13de22b3439258825aca',
  'a3documents/types.ts': 'ed497379c839dde668862baa785c9abc8f8c39ca4a355e73b97f12e48c3d859f',
  'a3documentsV4/assembleDelta.ts':
    '8cc6eb2929377c892ad2b19d4a7a9aeff5dc293fd223017757e798d69cf2f488',
  'a3documentsV4/devTrain.ts': 'ec073c7d709886e05311061a49427d13381d2d7ca9ed8204db662a53d80fe920',
  'a3evidenceV5/authorityDelta.ts':
    '100121c9cf3bf1edbd3eced3891bb1fa76a937d3a3854352a6b2bdc44f601310',
  'a3evidenceV5/census.ts': '272aa44202991221046370fa16d2bcea15952094ef488c0df8f0ba5491760bef',
  'a3evidenceV5/devTrain.ts': '4637049717565a908205fd0fa589937012a26584e50bed23a6c04ae1dca2a7b6',
  'a3evidenceV5/history.ts': '12ed663830fb388eea8324fdcaebfdbd1556db1abd4a67982fe7aa883a31e4a7',
  'a3evidenceV5/r38bDrift.ts': 'a455e7879525ad99794582ec912b47267f1f67dd9b94fc50b8474daeef4fe4ef',
  'a3evidenceV5/refusal.ts': '9e53e3e30249a95f2ff609241749741fce611d8da6216f0f60c3ed9cb3b66732',
  'a3evidenceV5/types.ts': 'b06d883adab544c2c2cc345908394f4636932092a3432af1ff5fb1c04a3602c1',
  'sd7/nearDuplicatePairs.ts': '1851726bb28789791d96e0cd27532846e6a503b234a5813bec70782e6e078371',
  'a3prep/setRScore.ts': '055747a5f5f067e06079562cd7e37a4e12d011d3736e28b947b5a30d6f588cf7',
  'a3governanceV5/snapshotV5.ts':
    'd011e1ff595d1e2e1bf45c06daa5256925c73209641b9e6253577f4d95478cf8',
  'a3crossGenerationSlotAuthority/resolve.ts':
    'd6645b109a83b4de98c108b0c18b18414192a68df68f9b86a66fc8f2a2faef7d',
};

/** Every earlier namespace R40 must leave in place, with its file count. */
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

const baseAvailable = commitExists(R39_TERMINAL) && commitExists(R39_SCOPE_PIN_COMMIT);

// ---------------------------------------------------------------------------
// A. THE NAMESPACE AND THE FROZEN SURFACES.
// ---------------------------------------------------------------------------

describe('2D-A3 R40: the new namespace is exactly these files', () => {
  it('holds the seven V5 incremental document-source modules', () => {
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

describe('2D-A3 R40: reuse R21 and R39 by brand, never older minting or the V4 adapter', () => {
  const PERMITTED_SPECIFIERS = new Set([
    '../a3documents/assemble.js',
    '../a3documents/types.js',
    '../a3crossGenerationSlotAuthority/resolve.js',
    '../a3governanceV5/snapshotV5.js',
    '../a3evidence/database.js',
    '../a3evidenceV5/census.js',
    '../a3evidenceV5/devTrain.js',
    '../a3evidenceV5/r38bDrift.js',
    '../a3evidenceV5/types.js',
    '../sd7/nearDuplicatePairs.js',
    ...NAMESPACE_FILES.map((file) => `./${file.replace(/\.ts$/, '.js')}`),
  ]);
  const TYPE_ONLY_SPECIFIERS = new Set([
    '../a3evidence/database.js',
    '../sd7/nearDuplicatePairs.js',
  ]);

  it('imports nothing but landed R21 / R39 / V5 modules, and SD7 / R20 as TYPES only', () => {
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

  it('calls R21 assembleUnboundSlotDocumentSources at exactly one site, once per item', () => {
    const calls = NAMESPACE_FILES.filter((file) =>
      stripComments(code(file)).includes('assembleUnboundSlotDocumentSources('),
    );
    expect(calls).toEqual(['assembleDelta.ts']);
    const adapter = stripComments(code('assembleDelta.ts'));
    expect(adapter.match(/assembleUnboundSlotDocumentSources\(/g)).toHaveLength(1);
    const loop = adapter.slice(adapter.indexOf('items.forEach('));
    expect(loop.indexOf('assembleUnboundSlotDocumentSources(')).toBeGreaterThan(0);
    // Every item is adapted before the first R21 call.
    expect(adapter.indexOf('items.map((item) => slotInputFromDeltaEvidenceV5(item))')).toBeLessThan(
      adapter.indexOf('items.forEach('),
    );
    const binder = stripComments(code('devTrain.ts'));
    expect(binder).toContain('documentTextLookupForUnboundSlotAssembly(unbound)');
  });

  it('never calls R21 / R27 / R34 minting, R34 / R33 adapters, or older evidence slices', () => {
    const source = allCode();
    for (const forbidden of [
      'bindDevTrainDocumentSourceBatch',
      'bindDevTrainDocumentSourceDeltaBatchV2',
      'bindDevTrainDocumentSourceDeltaBatchV4',
      'slotInputFromDeltaEvidenceV4',
      'assembleDeltaItemsAllOrNothingV4',
      'a3documents/devTrain.js',
      'a3documentsV2/',
      'a3documentsV4/',
      'a3evidenceV4/',
      'a3evidenceV2/',
      'a3evidence/devTrain.js',
      'runDevTrainEvidenceDeltaBindingV5',
      'bindDevTrainEvidenceDeltaV5',
    ]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });

  it('owns no document semantics: no pre-grouping, dedupe, SD7, text transform or scoring', () => {
    const source = allCode();
    for (const forbidden of [
      /exactDuplicatePass|nearDuplicatePass|measureNearDuplicateGraph|measureUnboundSlotSd7Graph/,
      /tokeni[sz]e|shingle|jaccard|minhash/i,
      /prepareSetRDocumentScore|parseFloat|Number\(.*Score|Math\.(round|max|min)\(/,
      /setPCap|setRCap|rankSetP|rankSetR|reachableMembership\w*\(|readiness\w*\(/,
    ]) {
      expect(source, String(forbidden)).not.toMatch(forbidden);
    }
    // Only the census may NAME short text, to state that it was not classified.
    for (const file of NAMESPACE_FILES.filter((name) => name !== 'census.ts')) {
      expect(stripComments(code(file)), file).not.toMatch(/shortText|SHORT_TEXT/i);
    }
    const adapter = stripComments(code('assembleDelta.ts'));
    expect(adapter).not.toMatch(
      /\.trim\(|toLowerCase|toUpperCase|normalize\(|\.replace\(|\.join\(|new Set\(/,
    );
    expect(adapter).toContain('mainText: row.page.mainText');
    expect(adapter).toContain('candidateScore: row.candidate.candidateScore');
    expect(adapter).toContain('extractionRuleVersion: row.page.ruleVersion');
  });

  it('has no generation branch in the adapter or binder', () => {
    for (const file of ['assembleDelta.ts', 'devTrain.ts']) {
      expect(stripComments(code(file)), file).not.toMatch(
        /sourceKind|[Rr]eserve|GENERATION[12_]|Generation[12]|PRIMARY|acquisitionGeneration|resolutionGeneration/,
      );
    }
  });

  it('mints only after every item assembled, through private brands', () => {
    const binder = stripComments(code('devTrain.ts'));
    for (const brand of [
      'const MINTED_DELTA_SLOT_ASSEMBLIES = new WeakSet<object>();',
      'const MINTED_DELTA_DOCUMENT_BATCHES = new WeakSet<object>();',
      'const TEXT_LOOKUP_BY_SLOT_ASSEMBLY = new WeakMap<object, DocumentTextLookup>();',
    ]) {
      expect(binder).toContain(brand);
    }
    expect(allCode()).not.toMatch(
      /export const (MINTED_|TEXT_LOOKUP|EVIDENCE_DELTA|SLOT_ASSEMBLY|DOCUMENT_BATCH|R21_CALLS|IN_FLIGHT|REPRODUCTION_PROOF|HISTORY_PROOF)/,
    );
    const bind = binder.slice(
      binder.indexOf('export function bindDevTrainDocumentSourceDeltaBatchV5'),
    );
    expect(bind.indexOf('requireItemMintedForBatch(')).toBeLessThan(
      bind.indexOf('assembleDeltaItemsAllOrNothingV5('),
    );
    expect(bind.indexOf('assembleDeltaItemsAllOrNothingV5(')).toBeLessThan(
      bind.indexOf('mintDeltaSlot('),
    );
    expect(binder.match(/MINTED_DELTA_SLOT_ASSEMBLIES\.add\(/g)).toHaveLength(1);
    expect(stripComments(code('types.ts'))).not.toMatch(
      /mainText|\btext\b|title|heading|url|host/i,
    );
  });

  it('hardcodes no count or index list in the binder path', () => {
    for (const file of ['assembleDelta.ts', 'devTrain.ts']) {
      expect(stripComments(code(file)), file).not.toMatch(/\b(6|7|13|20|223|224|393|448)\b/);
      expect(stripComments(code(file)), file).not.toMatch(/\[\s*\d+\s*,\s*\d+\s*,\s*\d+/);
    }
    expect(stripComments(code('devTrain.ts'))).not.toMatch(/expected(Item|Slot)?Count/);
  });
});

// ---------------------------------------------------------------------------
// C. NO OTHER CAPABILITY.
// ---------------------------------------------------------------------------

describe('2D-A3 R40: no SQL, pool, env, fs, network, provider, sealed or downstream capability', () => {
  it('issues no SQL and touches no pool beyond reading two closure properties', () => {
    const source = allCode();
    expect(source).not.toMatch(/\bSELECT\b|\bINSERT\b|\bFROM\s+orgunit_|\bJOIN\b|\bWHERE\b/);
    expect(source).not.toMatch(/\.query\(|\.connect\(|\.end\(|\.release\(|new\s+Pool|from 'pg'/);
    const gate = stripComments(code('r39Drift.ts'));
    expect(gate).toContain('upstreamPool.ended !== true');
    expect(gate).toContain('upstreamPool.totalCount !== 0');
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
      /createHash|sha256\(/,
    ]) {
      expect(source, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it('reaches no sealed root, A2 harness, graph, sample or readiness module', () => {
    const source = allCode();
    expect(source).not.toMatch(
      /methodology-v2-sealed|gen1-dev-train|gen1-dev-confirm|gen1-final-holdout|phase2b2d2c/,
    );
    expect(source).not.toMatch(
      /a3graphs|a3samples|a3readiness|continuationWindow|acquisitionGate|\/corpus\/|a3governanceV6/,
    );
    expect(source).not.toMatch(/'DEV_CONFIRM'|'FINAL_HOLDOUT'/);
    expect(stripComments(code('types.ts'))).toContain("R40_DOCUMENT_SPLIT = 'DEV_TRAIN' as const");
  });

  it('invents no document, coverage, text-lookup or batch digest', () => {
    expect(allCode()).not.toMatch(
      /documentDeltaHash|documentCoverageHash|assemblyExpansionHash|textLookupHash|batchHash|deltaDigest/i,
    );
  });
});

// ---------------------------------------------------------------------------
// D. LINEAGE AND CHANGED SURFACE.
// ---------------------------------------------------------------------------

describe.skipIf(!baseAvailable)('2D-A3 R40: lineage and changed surface', () => {
  it('descends from the exact R39 tip, and merges no commit', () => {
    expect(() => git('merge-base', '--is-ancestor', R39_TERMINAL, 'HEAD')).not.toThrow();
    expect(lines(git('rev-list', '--merges', `${R39_TERMINAL}..HEAD`))).toEqual([]);
  });

  it('never makes the terminal A2 checkpoint an ancestor of A3', () => {
    if (commitExists(A2_CHECKPOINT)) {
      expect(() => git('merge-base', '--is-ancestor', A2_CHECKPOINT, 'HEAD')).toThrow();
    }
  });

  it("pinned R39's scope in exactly one first commit that touched exactly one file", () => {
    const [first] = lines(git('rev-list', '--reverse', `${R39_TERMINAL}..HEAD`));
    expect(first).toBe(R39_SCOPE_PIN_COMMIT);
    expect(git('rev-parse', `${R39_SCOPE_PIN_COMMIT}^`).trim()).toBe(R39_TERMINAL);
    expect(lines(git('diff', '--name-only', R39_TERMINAL, R39_SCOPE_PIN_COMMIT))).toEqual([
      R39_ISOLATION_TEST,
    ]);
    expect(sha256(readFileSync(join(REPO_ROOT, R39_ISOLATION_TEST)))).toBe(
      sha256(git('show', `${R39_SCOPE_PIN_COMMIT}:${R39_ISOLATION_TEST}`)),
    );
  });

  it('leaves every earlier harness namespace untouched', () => {
    const touched = [
      ...lines(git('diff', '--name-only', R39_TERMINAL, '--', HARNESS)),
      ...lines(git('ls-files', '--others', '--exclude-standard', '--', HARNESS)),
    ].filter((path) => !path.startsWith(`${NAMESPACE}/`));
    expect(touched).toEqual([]);
  });

  it('leaves every earlier A3 public census and audit byte-identical', () => {
    const prior = lines(
      git('ls-tree', '-r', '--name-only', R39_TERMINAL, '--', 'docs/evaluation', 'docs/audits'),
    );
    expect(prior.length).toBeGreaterThan(0);
    expect(lines(git('diff', '--name-only', R39_TERMINAL, '--', ...prior))).toEqual([]);
  });

  it('changes nothing outside its namespace, tests, census, audit and the R39 scope pin', () => {
    const paths = [
      ...new Set([
        ...lines(git('diff', '--name-only', R39_TERMINAL)),
        ...lines(git('ls-files', '--others', '--exclude-standard')),
      ]),
    ];
    const permitted = (path: string): boolean =>
      path === R39_ISOLATION_TEST ||
      path.startsWith(`${NAMESPACE}/`) ||
      R40_TESTS.includes(path) ||
      path === R40_CENSUS_PATH ||
      path === R40_AUDIT_PATH;
    expect(paths.filter((path) => !permitted(path))).toEqual([]);
  });

  it('creates no R41, SD7-graph V5, Governance V6 or A5 artifact', () => {
    for (const name of ['a3graphsV5', 'a3samplesV5', 'a3readinessV5', 'a3governanceV6']) {
      expect(existsSync(join(REPO_ROOT, HARNESS, name)), name).toBe(false);
    }
    const docs = [
      ...readdirSync(join(REPO_ROOT, 'docs/evaluation')),
      ...readdirSync(join(REPO_ROOT, 'docs/audits')),
    ];
    expect(
      docs.filter((name) => /A3_R41|GOVERNANCE_AUTHORITY_CENSUS_V6|A5_.*FREEZE/.test(name)),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// E. THE PUBLIC CENSUS AND AUDIT.
// ---------------------------------------------------------------------------

describe.skipIf(!existsSync(join(REPO_ROOT, R40_CENSUS_PATH)))(
  '2D-A3 R40: the committed census and audit',
  () => {
    const censusText = existsSync(join(REPO_ROOT, R40_CENSUS_PATH))
      ? readFileSync(join(REPO_ROOT, R40_CENSUS_PATH), 'utf8')
      : '{}';
    const auditText = existsSync(join(REPO_ROOT, R40_AUDIT_PATH))
      ? readFileSync(join(REPO_ROOT, R40_AUDIT_PATH), 'utf8')
      : '';
    const census = JSON.parse(censusText) as Record<string, Record<string, unknown>>;

    it('is the derived census record, and authorises nothing', () => {
      expect(census.record).toBe(R40_PUBLIC_CENSUS_RECORD_KIND);
      expect(census.recordKind).toBe(
        'PUBLIC_AGGREGATE_ONLY_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS',
      );
      expect(census.thisFileAuthorises).toEqual([]);
      expect(census.r39Tip).toBe(R39_TERMINAL);
      expect(census.r39ScopePinCommit).toBe(R39_SCOPE_PIN_COMMIT);
      expect(census.terminalState).toBe(
        'R40_INCREMENTAL_DEV_TRAIN_DOCUMENT_SOURCE_V5_COMPLETE_READY_FOR_INCREMENTAL_SD7_GRAPH_MEASUREMENT',
      );
    });

    it('reproduced R39 fresh, excluding only implementationCommit', () => {
      expect(census.r39Reproduction).toMatchObject({
        freshInProcessR39BatchConsumed: true,
        freshR39CensusEqualsCommitted: true,
        excludedExecutionProvenanceFields: ['implementationCommit'],
        differingSemanticPathCount: 0,
        freshR39MatchedRuns: 7,
        freshR39PageEvidenceSourceRows: 224,
        freshR39DistinctResponseDocuments: 223,
        freshR39CandidateRows: 448,
        freshR39OldAuthorityQueries: 0,
        freshR39NewAuthorityQueries: 7,
      });
    });

    it('states 13 historical + 7 new = 20 document slots, downstream still 13', () => {
      expect(census.coverage).toMatchObject({
        historicalDocumentSlots: 13,
        newR40DocumentSlots: 7,
        coverageDocumentSlots: 20,
        v5DevTrainAuthorityCoverage: 20,
        coverageSourceRows: 617,
        coverageSlotLocalDocuments: 611,
        coverageCandidateObservations: 1234,
        coverageR10Preparations: 611,
        coverageR10SourceRows: 617,
        coverageR10CandidateObservations: 1234,
        graphCoverageAfterR40: 13,
        sampleCoverageAfterR40: 13,
        readinessCoverageAfterR40: 13,
        twentySlotDocumentBatchMinted: false,
      });
      expect(census.historicalDocumentCoverage).toMatchObject({
        r34DocumentSlots: 13,
        r37ReadinessSlots: 13,
        freshR39UnchangedAuthorities: 13,
      });
      expect(census.deltaExtractionSupport).toMatchObject({
        supportedExtractionRuleVersion: 'orgunit-extraction-v2',
        deltaUnsupportedExtractionRows: 0,
        deltaMixedVersionDocuments: 0,
        deltaTextDivergenceGroups: 0,
      });
    });

    it('records zero R40 SQL and only canonical R39 access upstream', () => {
      expect(census.access).toMatchObject({
        r40SqlStatements: 0,
        databaseAccessOnlyThroughCanonicalR39Reproduction: true,
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
        upstreamPoolClosedBeforeFirstR21Call: true,
        r21CallsWhileUpstreamPoolOpen: 0,
      });
      expect(census.semantics).toMatchObject({
        historicalDocumentSlotsReassembled: false,
        canonicalR21CallsPerNewSlot: 1,
        canonicalR21AssemblyCalls: 7,
        historicalR21AssemblyCalls: 0,
        crossOrganisationExactDedupePerformed: false,
        textStoredOnDocumentObjects: false,
        shortTextClassified: false,
        nearDuplicateGraphMeasured: false,
        setPRanked: false,
        setRRanked: false,
        readinessPerformed: false,
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
      expect(text).not.toMatch(/"selectionIndex"|"echeRowKey"|"organisationId"|"runRefSha256"/);
      expect(text).not.toMatch(/G2[PR]:\d|\bR:\d+:\d+|\bP:\d+\b/);
      expect(text).not.toMatch(/sd7[^\s"]*\.json|detail\.json/i);
    });

    it('the census carries no per-slot array and no score', () => {
      expect(censusText).not.toMatch(/\[\s*-?\d+(\.\d+)?\s*,/);
      expect(censusText).not.toMatch(/-?\d+\.\d{4}\b/);
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
