/**
 * PHASE 2B-2D A3 R39 — ISOLATION OF THE GOVERNANCE V5 INCREMENTAL EVIDENCE DELTA.
 *
 * By reading source text, the repository's own history and the committed
 * records, this file proves:
 *
 *   - R39 lives in the NEW sibling namespace `a3evidenceV5/`, and every
 *     earlier harness namespace - R20's `a3evidence/`, R33's `a3evidenceV4/`,
 *     R38A's contract, R38B's `a3governanceV5/` and R34-R37 downstream above
 *     all - is byte-identical to the R38B tip, with the reused modules pinned
 *     by sha256;
 *   - R39 reuses ONLY R20's authority-free lower reader and snapshot
 *     transaction, never R20's R17-only `evidenceRequestForAuthority` or its
 *     V1 binders, never R26 / R33 minting, and writes no SQL of its own;
 *   - no environment, filesystem, network, provider, classifier, sealed-root,
 *     child-process, pool-construction, document-assembly, SD7, sample or
 *     readiness capability exists in the namespace; DEV_CONFIRM and
 *     FINAL_HOLDOUT are named only to COUNT that none of their identities
 *     reached a parameter;
 *   - the only pre-existing file R39 touched is R38B's historical scope pin;
 *   - the committed R39 census and audit disclose no identity and invent no
 *     digest.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { R39_PUBLIC_CENSUS_RECORD_KIND } from '../harness/phase2b2d/a3evidenceV5/census.js';
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
const NAMESPACE = `${HARNESS}/a3evidenceV5`;

/** The exact R38B tip R39 was cut from. */
const R38B_TERMINAL = '834b3d99e41044ec5c93ec8ec905b4c2887c6ae8';
/** The one commit that pinned R38B's own isolation test to its range. */
const R38B_SCOPE_PIN_COMMIT = '904281b8fa0b155c0522b41996c9731231869659';
const R38B_ISOLATION_TEST = 'src/test/unit/orgunitCorpus2DA3GovernanceV5Isolation.test.ts';
/**
 * R39'S OWN TERMINAL COMMIT.
 *
 * R39's lineage, changed-surface and historical-scope assertions describe
 * R39'S SLICE, so they range over R39's own commits - `R38B_TERMINAL..R39_TERMINAL`
 * - rather than over the working tree. Once a later slice lands on top, the
 * working tree is no longer R39's surface, and diffing to it would fail for
 * the honest reason that history moved on rather than because R39 changed.
 *
 * This is the same standing convention R19 through R38B apply, and it
 * WEAKENS NOTHING: R39's range is frozen, its permitted-path list is
 * unchanged, and each later slice pins the equivalent scope over its own range.
 */
const R39_TERMINAL = 'b4838059207216c4c4487dd816b3f3dae827166d';
/** The terminal A2 checkpoint Governance V5 describes; never an A3 ancestor. */
const A2_CHECKPOINT = '29d0d486cb268b5431a0fc23eabb064682ec47d9';

const R39_TESTS = [
  'src/test/unit/orgunitCorpus2DA3EvidenceV5Delta.test.ts',
  'src/test/unit/orgunitCorpus2DA3EvidenceV5Isolation.test.ts',
];
const R39_CENSUS_PATH = `docs/evaluation/${R39_PUBLIC_CENSUS_RECORD_KIND}.json`;
const R39_AUDIT_PATH =
  'docs/audits/PHASE_2B_2D_A3_R39_INCREMENTAL_DEV_TRAIN_DURABLE_EVIDENCE_V5_V1.md';

const NAMESPACE_FILES = [
  'authorityDelta.ts',
  'census.ts',
  'devTrain.ts',
  'history.ts',
  'r38bDrift.ts',
  'refusal.ts',
  'types.ts',
];

/** The reused and frozen modules, byte-pinned: R39 uses them without altering them. */
const FROZEN_MODULE_SHA256: Readonly<Record<string, string>> = {
  'a3evidence/census.ts': 'af42fe57747530f3d0b3c5def0913eb7828f098c652b996a12a8b198d483e415',
  'a3evidence/database.ts': '48c47fb44a13ed3b5408c53afda8972a598cd6f7057d7e6191682633456d52e0',
  'a3evidence/devTrain.ts': '175aa179954395e86a5c0c5cf0529560b23e13abf36f0f4eee1d498f6c6def3f',
  'a3evidence/integrity.ts': 'a6f67b22581df40357ed0809083192eb839f80ff86797934d487bac721e877f4',
  'a3evidence/refusal.ts': '6cae64c61a08e919690ce1286f6433d429b4246c853a373b801470a705fc96a8',
  'a3evidence/runMatch.ts': '0d911386cb234964c616fadf51a6c9070f5ec47d1bed4498ee25ee62ea8aea00',
  'a3evidence/types.ts': '3b26c39afdb871a5f4de26969e1d1a167a5591a5820b44ab4ab42adc77544c2a',
  'a3governanceV5/census.ts': '1c11e1c6d2bec575820f16d7d44585751656513f6d068cbecc6f8d9cdea6ec0c',
  'a3governanceV5/devTrainContinuity.ts':
    '01a82fbb130cb327594a5a955b6e812658071a6e1a0717b756b46506e903a412',
  'a3governanceV5/snapshotV5.ts':
    'd011e1ff595d1e2e1bf45c06daa5256925c73209641b9e6253577f4d95478cf8',
  'a3governanceV4/snapshotV4.ts':
    'd6671faa0d7e7247407b9c9d92054199a7ae21ada98fd60674c94f88e571f2e7',
  'a3crossGenerationSlotAuthority/continuity.ts':
    '9104db585a26b5ba167fad782263b355b65ea26d08c564123ac8301d56d0dea1',
  'a3crossGenerationSlotAuthority/resolve.ts':
    'd6645b109a83b4de98c108b0c18b18414192a68df68f9b86a66fc8f2a2faef7d',
  'a3crossGenerationSlotAuthority/types.ts':
    '2092b929bdb7fcb1d5f1b38a5c7eae870ffe950558ff4067db2f74b9d104be19',
  'a3prep/slotAuthority.ts': 'deee711b6eac66bccec51afee49615b71b94d0701b110a3abd50c1c12207f165',
};

/** Every earlier namespace R39 must leave in place, with its file count. */
const FROZEN_NAMESPACES: Readonly<Record<string, number>> = {
  a3prep: 16,
  a3governance: 7,
  a3governanceV2: 7,
  a3governanceV3: 8,
  a3governanceV4: 10,
  a3governanceV5: 12,
  a3crossGenerationSlotAuthority: 7,
  a3evidence: 7,
  a3evidenceV2: 6,
  a3evidenceV4: 6,
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

const baseAvailable =
  commitExists(R38B_TERMINAL) && commitExists(R38B_SCOPE_PIN_COMMIT) && commitExists(R39_TERMINAL);

// ---------------------------------------------------------------------------
// A. THE NAMESPACE AND THE FROZEN SURFACES.
// ---------------------------------------------------------------------------

describe('2D-A3 R39: the new namespace is exactly these files', () => {
  it('holds the seven V5 incremental-evidence modules', () => {
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

describe('2D-A3 R39: reuse R20 lower mechanics and R38B continuity, never older minting', () => {
  const PERMITTED_SPECIFIERS = new Set([
    'pg',
    '../a3crossGenerationSlotAuthority/continuity.js',
    '../a3crossGenerationSlotAuthority/resolve.js',
    '../a3crossGenerationSlotAuthority/types.js',
    '../a3governanceV4/snapshotV4.js',
    '../a3governanceV5/census.js',
    '../a3governanceV5/devTrainContinuity.js',
    '../a3governanceV5/snapshotV5.js',
    '../a3evidence/database.js',
    '../a3evidence/types.js',
    ...NAMESPACE_FILES.map((file) => `./${file.replace(/\.ts$/, '.js')}`),
  ]);

  it('imports nothing but pg types and landed A3 governance / evidence modules', () => {
    for (const file of NAMESPACE_FILES) {
      for (const specifier of specifiersOf(code(file))) {
        expect(PERMITTED_SPECIFIERS.has(specifier), `${file}: ${specifier}`).toBe(true);
      }
    }
    for (const file of NAMESPACE_FILES) {
      expect(code(file), file).not.toMatch(/^import pg from|^import \* as pg/m);
      if (code(file).includes("from 'pg'"))
        expect(code(file)).toContain("import type pg from 'pg'");
    }
  });

  it('calls R20 unchanged loadUnboundDurableRunEvidence and withReadOnlyEvidenceSnapshot', () => {
    const binder = stripComments(code('devTrain.ts'));
    expect(binder).toMatch(/await loadUnboundDurableRunEvidence\(client, request\)/);
    expect(binder).toMatch(/await withReadOnlyEvidenceSnapshot\(/);
    expect(binder.match(/withReadOnlyEvidenceSnapshot\(/g)).toHaveLength(1);
  });

  it('never calls R20 evidenceRequestForAuthority or its V1 binders, nor R26 / R33 minting', () => {
    const source = allCode();
    for (const forbidden of [
      'evidenceRequestForAuthority(',
      'bindDurableEvidenceForReadyAuthority',
      'bindDevTrainDurableEvidenceBatch',
      'runDevTrainDurableEvidenceBinding',
      'devTrainReadyAuthoritiesOf',
      'a3evidence/devTrain.js',
      'a3evidenceV2/',
      'a3evidenceV4/',
      'compareDevTrainReadyAuthorities',
      'isA3SlotAcquisitionAuthorityReady',
    ]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });

  it('derives continuity only through R38B and the R38A bridge, at named sites', () => {
    const delta = stripComments(code('authorityDelta.ts'));
    expect(delta).toContain('requireAdditiveDevTrainContinuity(');
    expect(delta).toContain('deriveDevTrainAuthorityContinuityV4ToV5(');
    const bridgeCalls = NAMESPACE_FILES.filter((file) =>
      stripComments(code(file)).includes('compareR17WithCrossGenerationAuthorities('),
    );
    expect(bridgeCalls).toEqual(['r38bDrift.ts']);
    expect(stripComments(code('r38bDrift.ts'))).toContain('buildPublicGovernanceCensusV5(');
  });

  it('builds the request from occupant.source, runRefSha256 and acquisitionPolicyVersion only', () => {
    const binder = stripComments(code('devTrain.ts'));
    const adapter = binder.slice(
      binder.indexOf('export function evidenceRequestForNewV5DeltaAuthority'),
      binder.indexOf('export interface PlannedV5EvidenceRequest'),
    );
    expect(adapter).toMatch(
      /const authority = requireNewV5DeltaAuthority\(candidate, delta, v5Snapshot\);/,
    );
    expect(adapter.indexOf('requireNewV5DeltaAuthority(')).toBeLessThan(
      adapter.indexOf('authority.occupant.source.organisationId'),
    );
    for (const field of [
      'organisationId: authority.occupant.source.organisationId',
      'echeRowKey: authority.occupant.source.echeRowKey',
      'expectedRunRefSha256: authority.runRefSha256',
      'expectedAcquisitionPolicyVersion: authority.acquisitionPolicyVersion',
    ]) {
      expect(adapter).toContain(field);
    }
    expect(adapter).not.toMatch(
      /selectionIndex|reserveNamespace|ReserveRankPosition|sourceKind|drawEntrySha256|adjudication|originalRunRefSha256|recoveryRunRefSha256/,
    );
  });

  it('writes no SQL of its own and creates no pool: the only query is the pass-through', () => {
    const source = allCode();
    expect(source).not.toMatch(/\bSELECT\b|\bFROM\s+orgunit_|\bJOIN\b|\bWHERE\b/);
    expect([...source.matchAll(/\.query\(/g)]).toHaveLength(1);
    expect(source).toContain('return client.query(text, values as unknown[]);');
    expect(source).not.toMatch(/new\s+pg\.|new\s+Pool\(|new\s+Client\(|\.connect\(\s*\{/);
    expect(source).not.toMatch(/'COMMIT'|'ROLLBACK'|BEGIN TRANSACTION ISOLATION/);
  });

  it('mints only after the read phase, through private brands', () => {
    const binder = stripComments(code('devTrain.ts'));
    for (const brand of [
      'const MINTED_DELTA_EVIDENCE = new WeakSet<object>();',
      'const MINTED_DELTA_BATCHES = new WeakSet<object>();',
      'const BOUND_V5_SNAPSHOTS = new WeakSet<object>();',
    ]) {
      expect(binder).toContain(brand);
    }
    expect(allCode()).not.toMatch(/export const (MINTED_|BOUND_|DELTA_EVIDENCE_BY|ACCESS_BY)/);
    const mint = binder.slice(binder.indexOf('function mintValidatedDelta'));
    expect(mint.indexOf('requireValidDeltaReadComposition(')).toBeLessThan(
      mint.indexOf('MINTED_DELTA_EVIDENCE.add('),
    );
    expect(mint.indexOf('coverageOf(')).toBeLessThan(mint.indexOf('MINTED_DELTA_EVIDENCE.add('));
    expect(binder.match(/MINTED_DELTA_EVIDENCE\.add\(/g)).toHaveLength(1);
    const read = binder.slice(
      binder.indexOf('async function readDelta'),
      binder.indexOf('function mintValidatedDelta'),
    );
    expect(read).not.toMatch(/MINTED_|\.add\(|\.set\(/);
  });

  it('hardcodes no selection index list, expected count or authority list in the binder path', () => {
    for (const file of ['authorityDelta.ts', 'devTrain.ts', 'history.ts']) {
      expect(stripComments(code(file)), file).not.toMatch(/\[\s*\d+\s*,\s*\d+\s*,\s*\d+/);
    }
    expect(stripComments(code('devTrain.ts'))).not.toMatch(/\b(7|13|20)\b/);
  });
});

// ---------------------------------------------------------------------------
// C. NO OTHER CAPABILITY.
// ---------------------------------------------------------------------------

describe('2D-A3 R39: no env, fs, network, provider, sealed or downstream capability', () => {
  it('reads no environment and touches no filesystem, socket, provider or child process', () => {
    const source = allCode();
    for (const forbidden of [
      /process\.env/,
      /node:(fs|net|tls|http|https|dns|child_process)/,
      /\bfetch\s*\(/,
      /readFile|writeFile|appendFile|mkdir|createWriteStream|unlink|rmSync/,
      /execFile|execSync|spawn/,
      /anthropic|claude-agent-sdk|@anthropic-ai|orgunits\/classify/i,
      /DATABASE_URL|nwf_admin|nwf_research|nwf_ingest|nwf_classifier/,
      /Date\.now|new Date\(|Math\.random/,
      /createHash|sha256\(/,
    ]) {
      expect(source, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it('reaches no sealed root, A2 harness, document, graph, sample, readiness or SD7 module', () => {
    const source = allCode();
    expect(source).not.toMatch(
      /methodology-v2-sealed|gen1-dev-train|gen1-dev-confirm|gen1-final-holdout|phase2b2d2c/,
    );
    expect(source).not.toMatch(
      /a3documents|a3graphs|a3samples|a3readiness|\/sd7\/|continuationWindow|acquisitionGate|\/corpus\//,
    );
    expect(source).not.toMatch(
      /mainText|main_text|\bsetP\b|\bsetR\b|reachableMembership|exactDedupe/,
    );
  });

  it('names DEV_CONFIRM / FINAL_HOLDOUT only to count that none of their identities was sent', () => {
    for (const file of NAMESPACE_FILES) {
      const source = stripComments(code(file));
      const hits = [...source.matchAll(/'(DEV_CONFIRM|FINAL_HOLDOUT)'/g)].map((m) => m[0]);
      if (file === 'devTrain.ts') {
        expect(hits).toEqual(["'DEV_CONFIRM'", "'FINAL_HOLDOUT'"]);
        expect(source).toContain("splitIdentities('DEV_CONFIRM')");
        expect(source).toContain("splitIdentities('FINAL_HOLDOUT')");
      } else {
        expect(hits, file).toEqual([]);
      }
    }
    expect(stripComments(code('types.ts'))).toContain("R39_EVIDENCE_SPLIT = 'DEV_TRAIN' as const");
  });

  it('invents no evidence, coverage, continuity or batch digest', () => {
    expect(allCode()).not.toMatch(
      /evidenceDeltaHash|coverageExpansionHash|continuityHash|batchHash|deltaDigest/i,
    );
  });
});

// ---------------------------------------------------------------------------
// D. LINEAGE AND CHANGED SURFACE.
// ---------------------------------------------------------------------------

describe.skipIf(!baseAvailable)('2D-A3 R39: lineage and changed surface', () => {
  it('descends from the exact R38B tip, and merges no commit', () => {
    expect(() => git('merge-base', '--is-ancestor', R38B_TERMINAL, R39_TERMINAL)).not.toThrow();
    expect(lines(git('rev-list', '--merges', `${R38B_TERMINAL}..${R39_TERMINAL}`))).toEqual([]);
  });

  it('never makes the terminal A2 checkpoint an ancestor of A3', () => {
    if (commitExists(A2_CHECKPOINT)) {
      expect(() => git('merge-base', '--is-ancestor', A2_CHECKPOINT, 'HEAD')).toThrow();
    }
  });

  it("pinned R38B's scope in exactly one first commit that touched exactly one file", () => {
    const [first] = lines(git('rev-list', '--reverse', `${R38B_TERMINAL}..${R39_TERMINAL}`));
    expect(first).toBe(R38B_SCOPE_PIN_COMMIT);
    expect(git('rev-parse', `${R38B_SCOPE_PIN_COMMIT}^`).trim()).toBe(R38B_TERMINAL);
    expect(lines(git('diff', '--name-only', R38B_TERMINAL, R38B_SCOPE_PIN_COMMIT))).toEqual([
      R38B_ISOLATION_TEST,
    ]);
    expect(sha256(git('show', `${R39_TERMINAL}:${R38B_ISOLATION_TEST}`))).toBe(
      sha256(git('show', `${R38B_SCOPE_PIN_COMMIT}:${R38B_ISOLATION_TEST}`)),
    );
  });

  it('leaves every earlier harness namespace untouched', () => {
    const touched = lines(
      git('diff', '--name-only', R38B_TERMINAL, R39_TERMINAL, '--', HARNESS),
    ).filter((path) => !path.startsWith(`${NAMESPACE}/`));
    expect(touched).toEqual([]);
  });

  it('leaves every earlier A3 public census and audit byte-identical', () => {
    const prior = lines(
      git('ls-tree', '-r', '--name-only', R38B_TERMINAL, '--', 'docs/evaluation', 'docs/audits'),
    );
    expect(prior.length).toBeGreaterThan(0);
    expect(lines(git('diff', '--name-only', R38B_TERMINAL, R39_TERMINAL, '--', ...prior))).toEqual(
      [],
    );
  });

  it('changes nothing outside its namespace, tests, census, audit and the R38B scope pin', () => {
    const paths = lines(git('diff', '--name-only', R38B_TERMINAL, R39_TERMINAL));
    const permitted = (path: string): boolean =>
      path === R38B_ISOLATION_TEST ||
      path.startsWith(`${NAMESPACE}/`) ||
      R39_TESTS.includes(path) ||
      path === R39_CENSUS_PATH ||
      path === R39_AUDIT_PATH;
    expect(paths.filter((path) => !permitted(path))).toEqual([]);
  });

  it('created no Governance V6, R40, document-assembly or A5 artifact (tree at R39_TERMINAL)', () => {
    const tree = lines(git('ls-tree', '-r', '--name-only', R39_TERMINAL));
    expect(tree.filter((path) => path.startsWith(`${HARNESS}/a3governanceV6/`))).toEqual([]);
    expect(tree.filter((path) => path.startsWith(`${HARNESS}/a3documentsV5/`))).toEqual([]);
    const docs = tree
      .filter((path) => path.startsWith('docs/evaluation/') || path.startsWith('docs/audits/'))
      .map((path) => path.slice(path.lastIndexOf('/') + 1));
    expect(
      docs.filter((name) => /A3_R40|GOVERNANCE_AUTHORITY_CENSUS_V6|A5_.*FREEZE/.test(name)),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// E. THE PUBLIC CENSUS AND AUDIT.
// ---------------------------------------------------------------------------

describe.skipIf(!existsSync(join(REPO_ROOT, R39_CENSUS_PATH)))(
  '2D-A3 R39: the committed census and audit',
  () => {
    const censusText = existsSync(join(REPO_ROOT, R39_CENSUS_PATH))
      ? readFileSync(join(REPO_ROOT, R39_CENSUS_PATH), 'utf8')
      : '{}';
    const auditText = existsSync(join(REPO_ROOT, R39_AUDIT_PATH))
      ? readFileSync(join(REPO_ROOT, R39_AUDIT_PATH), 'utf8')
      : '';
    const census = JSON.parse(censusText) as Record<string, Record<string, unknown>>;

    it('is the derived census record, and authorises nothing', () => {
      expect(census.record).toBe(R39_PUBLIC_CENSUS_RECORD_KIND);
      expect(census.recordKind).toBe('PUBLIC_AGGREGATE_ONLY_INCREMENTAL_EVIDENCE_CENSUS');
      expect(census.thisFileAuthorises).toEqual([]);
      expect(census.terminalState).toBe(
        'R39_INCREMENTAL_DEV_TRAIN_DURABLE_EVIDENCE_V5_COMPLETE_READY_FOR_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY',
      );
    });

    it('states 13 historical + 7 newly bound = 20 evidence, downstream still 13', () => {
      expect(census.governanceDelta).toMatchObject({
        v4DevTrainReadyCount: 13,
        v5DevTrainReadyCount: 20,
        unchangedAuthorityCount: 13,
        newAuthorityCount: 7,
        changedExistingAuthorityCount: 0,
        removedAuthorityCount: 0,
        freshR38bCensusEquality: true,
      });
      expect(census.coverage).toMatchObject({
        historicalCanonicalEvidenceCoverageCount: 13,
        historicalCanonicalReadinessCoverageCount: 13,
        newlyBoundDeltaCount: 7,
        evidenceCoverageAfterR39: 20,
        downstreamReadinessCoverageAfterR39: 13,
        legacyAuthorityEvidenceRequests: 0,
        deltaAuthorityEvidenceRequests: 7,
        twentyItemEvidenceBatchMinted: false,
      });
      expect(census.canonicalHistory).toMatchObject({
        r33EvidenceCoverageCount: 13,
        r37ReadinessCoverageCount: 13,
        historicalAuthoritiesReRead: false,
        historicalEvidenceReminted: false,
        historicalDownstreamArtifactsReproduced: false,
      });
    });

    it('records one read-only repeatable-read nwf_readonly snapshot on nwf_pe, 45 statements', () => {
      expect(census.databaseAccess).toMatchObject({
        role: 'nwf_readonly',
        database: 'nwf_pe',
        transactionReadOnly: true,
        transactionIsolation: 'repeatable read',
        poolConnections: 1,
        readOnlySnapshotTransactions: 1,
        sqlStatements: 45,
        lowerEvidenceLoads: 7,
        legacyAuthorityEvidenceQueries: 0,
        deltaAuthorityEvidenceQueries: 7,
        unchangedAuthorityIdentityParameterHits: 0,
        devConfirmEvidenceReads: 0,
        finalHoldoutEvidenceReads: 0,
        writes: 0,
        institutionNetworkRequests: 0,
        sealedRootReads: 0,
      });
      expect(census.deltaEvidence).toMatchObject({
        matchedRuns: 7,
        distinctDurableRuns: 7,
        allRunsDistinct: true,
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
