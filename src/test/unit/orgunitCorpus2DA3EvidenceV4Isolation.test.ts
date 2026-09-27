/**
 * PHASE 2B-2D A3 R33 — ISOLATION OF THE GOVERNANCE V4 INCREMENTAL EVIDENCE DELTA.
 *
 * By reading source text, the repository's own history and the committed
 * records, this file proves:
 *
 *   - R33 lives in the NEW sibling namespace `a3evidenceV4/`, and every
 *     earlier A3 namespace - R20's `a3evidence/`, R26's `a3evidenceV2/` and
 *     R32's `a3governanceV4/` above all - is byte-identical to the canonical
 *     R32 tip, with the reused R20 / R26 / R32 modules pinned by sha256;
 *   - R33 reuses R20's UNBOUND lower layer and R32's continuity path, never
 *     R20's V1 or R26's V2 minting, and writes no SQL of its own;
 *   - no environment, filesystem, network, provider, classifier, sealed-root,
 *     child-process, A2, "latest A2", document-assembly, SD7, SET_P, SET_R or
 *     SD9 capability exists in the namespace, and no other split is named;
 *   - the only pre-existing file R33 touched is R32's historical scope pin;
 *   - the committed R33 census discloses no identity and invents no digest.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { R33_PUBLIC_CENSUS_RECORD_KIND } from '../harness/phase2b2d/a3evidenceV4/census.js';
import {
  loadCommittedA2GovernanceV4,
  readyAuthoritiesOfV4,
} from '../harness/phase2b2d/a3governanceV4/snapshotV4.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const HARNESS = 'src/test/harness/phase2b2d';
const A3EVIDENCE_V4_REL = `${HARNESS}/a3evidenceV4`;

/** The exact canonical R32 tip R33 was cut from. */
const R32_TERMINAL = '747b64fa40c93e4b871ea1675682fb1531b21341';
/**
 * R33'S OWN TERMINAL COMMIT.
 *
 * R33's changed-surface and docs-scope assertions describe R33'S SLICE, so
 * they range over R33's own commits - `R32_TERMINAL..R33_TERMINAL` - rather
 * than over the working tree. Once a later slice lands on top, the working
 * tree is no longer R33's surface, and diffing to it would fail for the
 * honest reason that history moved on rather than because R33 changed.
 *
 * This is the same standing convention R19 through R32 apply, and it
 * WEAKENS NOTHING: R33's range is frozen, its permitted-path list is
 * unchanged, and each later slice pins the equivalent scope over its own range.
 */
const R33_TERMINAL = '31f389c8e1b6338d45a533b01feb6a2f6d932678';

/** The exact canonical R31 tip, R32's own base. */
const R31_TERMINAL = 'a11bad6f5e74b777e377962035e0d15d5aa605bd';

/** The one commit that pinned R32's own changed-surface test to its range. */
const R32_SCOPE_PIN_COMMIT = '52262d45dfa48e052534aff2afdb41fb69330e2c';
const R32_ISOLATION_TEST = 'src/test/unit/orgunitCorpus2DA3GovernanceV4Isolation.test.ts';

/** The frozen A2 checkpoint Governance V4 describes. */
const V4_A2_CHECKPOINT = '67ae047fb7de079bcba0eec83ca4f4baee77cc3e';

const R33_TESTS = [
  'src/test/unit/orgunitCorpus2DA3EvidenceV4Delta.test.ts',
  'src/test/unit/orgunitCorpus2DA3EvidenceV4Isolation.test.ts',
];
const R33_CENSUS_PATH =
  'docs/evaluation/PHASE_2B_2D_A3_R33_DEV_TRAIN_INCREMENTAL_DURABLE_EVIDENCE_CENSUS_V1.json';
const R33_AUDIT_PATH =
  'docs/audits/PHASE_2B_2D_A3_R33_INCREMENTAL_DEV_TRAIN_DURABLE_EVIDENCE_V1.md';

const A3EVIDENCE_V4_FILES = [
  'authorityDelta.ts',
  'census.ts',
  'devTrain.ts',
  'r32Drift.ts',
  'refusal.ts',
  'types.ts',
];

/** The reused lower layers, byte-pinned: R33 uses them without altering them. */
const REUSED_MODULE_SHA256: Readonly<Record<string, string>> = {
  'a3evidence/census.ts': 'af42fe57747530f3d0b3c5def0913eb7828f098c652b996a12a8b198d483e415',
  'a3evidence/database.ts': '48c47fb44a13ed3b5408c53afda8972a598cd6f7057d7e6191682633456d52e0',
  'a3evidence/devTrain.ts': '175aa179954395e86a5c0c5cf0529560b23e13abf36f0f4eee1d498f6c6def3f',
  'a3evidence/integrity.ts': 'a6f67b22581df40357ed0809083192eb839f80ff86797934d487bac721e877f4',
  'a3evidence/refusal.ts': '6cae64c61a08e919690ce1286f6433d429b4246c853a373b801470a705fc96a8',
  'a3evidence/runMatch.ts': '0d911386cb234964c616fadf51a6c9070f5ec47d1bed4498ee25ee62ea8aea00',
  'a3evidence/types.ts': '3b26c39afdb871a5f4de26969e1d1a167a5591a5820b44ab4ab42adc77544c2a',
  'a3evidenceV2/authorityDelta.ts':
    '26cb34fea6ceaea38a6328bf0ac3eb6a33e86702166871856dd91f1ed2c2c2f3',
  'a3evidenceV2/devTrain.ts': '5f92c32103755a9980066082af56a2cfbeb4f78e7607c44cf0c51c794ff6c109',
  'a3evidenceV2/types.ts': 'acba596c20b91f99be26452270bd1c98b7e87b40d66de90bd6ae4811335a6c0b',
  'a3governanceV4/census.ts': 'e83025d4665d705e067ed2432876fb125856cf4da902368c166b3268deae653f',
  'a3governanceV4/devTrainContinuity.ts':
    'f760059a641c332fb53aec855ff282c5d48e7fd7764e73067f113bf678b4add9',
  'a3governanceV4/snapshotV4.ts':
    'd6671faa0d7e7247407b9c9d92054199a7ae21ada98fd60674c94f88e571f2e7',
};

/** Every earlier namespace R33 must leave byte-identical, with its file count. */
const FROZEN_NAMESPACES: Readonly<Record<string, number>> = {
  a3prep: 16,
  a3governance: 7,
  a3governanceV2: 7,
  a3governanceV3: 8,
  a3governanceV4: 10,
  a3evidence: 7,
  a3evidenceV2: 6,
  a3documents: 6,
  a3documentsV2: 6,
  a3graphs: 6,
  a3graphsV2: 7,
  a3samples: 6,
  a3samplesV2: 6,
  a3readiness: 6,
  a3readinessV2: 6,
  acquisitionGate: -1,
  continuationWindow: -1,
  corpus: -1,
  draw: -1,
  sd7: -1,
  transition: -1,
  v3transition: -1,
};

function git(...args: readonly string[]): string {
  return execFileSync('git', ['-C', REPO_ROOT, ...args], { encoding: 'utf8' });
}

function commitExists(commit: string): boolean {
  try {
    execFileSync('git', ['-C', REPO_ROOT, 'cat-file', '-e', `${commit}^{commit}`], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function code(file: string): string {
  return stripComments(readFileSync(join(REPO_ROOT, A3EVIDENCE_V4_REL, file), 'utf8'));
}

function specifiersOf(source: string): string[] {
  const found: string[] = [];
  for (const m of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) found.push(m[1] ?? '');
  for (const m of source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) found.push(m[1] ?? '');
  for (const m of source.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g))
    found.push(m[1] ?? '');
  for (const m of source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) found.push(m[1] ?? '');
  return found;
}

function lines(value: string): string[] {
  return value.split('\n').filter((line) => line.length > 0);
}

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function allCode(): string {
  return A3EVIDENCE_V4_FILES.map(code).join('\n');
}

/**
 * Code with string literals blanked. Used ONLY for the capability-name
 * patterns below: the history gate legitimately names committed record kinds
 * such as the R30 `..._SD9_CENSUS_V1`, which is a record name, not an SD9
 * capability.
 */
function allCodeWithoutStrings(): string {
  return allCode()
    .replace(/'[^'\n]*'/g, "''")
    .replace(/"[^"\n]*"/g, '""');
}

const baseAvailable =
  commitExists(R32_TERMINAL) &&
  commitExists(R31_TERMINAL) &&
  commitExists(R32_SCOPE_PIN_COMMIT) &&
  commitExists(R33_TERMINAL);

// ---------------------------------------------------------------------------

describe('2D-A3 R33: the new namespace is exactly these files', () => {
  it('holds the six V4 incremental-evidence modules', () => {
    expect(readdirSync(join(REPO_ROOT, A3EVIDENCE_V4_REL)).sort()).toEqual(A3EVIDENCE_V4_FILES);
  });

  it('leaves every earlier A3 namespace at its file count', () => {
    for (const [namespace, count] of Object.entries(FROZEN_NAMESPACES)) {
      if (count < 0) continue;
      expect(readdirSync(join(REPO_ROOT, HARNESS, namespace)), namespace).toHaveLength(count);
    }
  });

  it('leaves every reused R20 / R26 / R32 module byte-identical', () => {
    for (const [file, digest] of Object.entries(REUSED_MODULE_SHA256)) {
      expect(sha256(readFileSync(join(REPO_ROOT, HARNESS, file))), file).toBe(digest);
    }
  });
});

describe('2D-A3 R33: reuse R20 lower mechanics and R32 continuity, never older minting', () => {
  const PERMITTED_SPECIFIERS = new Set([
    'pg',
    '../a3prep/slotAuthority.js',
    '../a3governanceV3/snapshotV3.js',
    '../a3governanceV4/snapshotV4.js',
    '../a3governanceV4/devTrainContinuity.js',
    '../a3governanceV4/census.js',
    '../a3evidence/database.js',
    '../a3evidence/devTrain.js',
    '../a3evidence/types.js',
    '../a3evidenceV2/authorityDelta.js',
    '../a3evidenceV2/types.js',
    './authorityDelta.js',
    './census.js',
    './devTrain.js',
    './r32Drift.js',
    './refusal.js',
    './types.js',
  ]);

  it('imports nothing but pg types and landed A3 governance / evidence modules', () => {
    for (const file of A3EVIDENCE_V4_FILES) {
      for (const specifier of specifiersOf(code(file))) {
        expect(PERMITTED_SPECIFIERS.has(specifier), `${file}: ${specifier}`).toBe(true);
      }
    }
    expect(code('devTrain.ts')).toMatch(/import type pg from 'pg'/);
  });

  it('takes from R20 only the unbound loader, the snapshot transaction and the request fields', () => {
    const source = code('devTrain.ts');
    expect(source).toContain('loadUnboundDurableRunEvidence');
    expect(source).toContain('withReadOnlyEvidenceSnapshot');
    expect(source).toContain('evidenceRequestForAuthority');
    const r20Imports = [
      ...allCode().matchAll(
        /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'\.\.\/a3evidence\/devTrain\.js'/g,
      ),
    ]
      .flatMap((m) => (m[1] ?? '').split(',').map((name) => name.trim()))
      .filter((name) => name.length > 0);
    expect(r20Imports).toEqual(['evidenceRequestForAuthority']);
  });

  it('takes from R26 only the pure comparator rendering and the delta type', () => {
    const r26Imports = [
      ...allCode().matchAll(
        /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'\.\.\/a3evidenceV2\/[a-zA-Z]+\.js'/g,
      ),
    ]
      .flatMap((m) => (m[1] ?? '').split(',').map((name) => name.trim()))
      .filter((name) => name.length > 0)
      .sort();
    expect([...new Set(r26Imports)]).toEqual(['DevTrainReadyAuthorityDelta', 'canonicalRender']);
  });

  it('derives the delta only through R32 continuity and gates it with R32 own gate', () => {
    const source = code('authorityDelta.ts');
    expect(source).toContain('deriveDevTrainAuthorityContinuityV3ToV4');
    expect(source).toContain('requireNoChangedOrRetractedDevTrainAuthority');
    expect(allCode()).not.toMatch(/\bcompareDevTrainReadyAuthorities\b/);
  });

  it('never calls R20 V1 or R26 V2 minting / batch binders, nor older snapshot brands', () => {
    const source = allCode();
    for (const forbidden of [
      'bindDurableEvidenceForReadyAuthority',
      'bindDevTrainDurableEvidenceBatch',
      'runDevTrainDurableEvidenceBinding',
      'isA3DurableAcquisitionEvidence',
      'devTrainReadyAuthoritiesOf',
      'governanceSnapshotForReadyAuthority',
      'bindDevTrainEvidenceDeltaV2',
      'runDevTrainEvidenceDeltaBindingV2',
      'deltaEvidenceRequests',
      'isA3DurableAcquisitionEvidenceDeltaV2',
      'governanceSnapshotV2ForReadyAuthority',
      'governanceSnapshotV3ForReadyAuthority',
      'deriveDevTrainReadyAuthorityDelta',
      'runRefSha256Of',
      'selectAuthorisedRunId',
      'loadCandidateRunIds',
    ]) {
      expect(source, forbidden).not.toMatch(new RegExp(`\\b${forbidden}\\b`));
    }
  });

  it('writes no SQL of its own and opens no transaction or pool of its own', () => {
    const source = allCode();
    expect(source).not.toMatch(
      /\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bTRUNCATE\b|\bBEGIN\b|COMMIT|ROLLBACK/,
    );
    expect(source).not.toMatch(/\.connect\s*\(|new\s+pg\.|Pool\s*\(|\.query\s*\(/);
  });

  it('hardcodes no selection index list in the generic delta, binder or census', () => {
    for (const file of ['authorityDelta.ts', 'devTrain.ts', 'census.ts', 'types.ts']) {
      const source = code(file);
      expect(source, file).not.toMatch(/\bselectionIndex\b/);
      expect(source, file).not.toMatch(/\b(34|39|44|49|56|61|71)\b/);
    }
  });
});

describe('2D-A3 R33: no env, fs, network, provider, sealed, A2 or corpus capability', () => {
  it('reads no environment and touches no filesystem, socket, provider or child process', () => {
    const source = allCode();
    for (const forbidden of [
      /process\.env/,
      /DATABASE_URL/,
      /config\/env/,
      /src\/db\//,
      /node:(fs|net|tls|http|https|dns|child_process)/,
      /\bfetch\s*\(/,
      /readFile|writeFile|appendFile|mkdir|rmSync|unlink|createWriteStream|execFileSync/,
      /anthropic|claude-agent-sdk|@anthropic-ai|openai|apollo/i,
      /orgunits\/(classify|web|orchestrator|signals)|phase2b2d2c/,
      /methodology-v2-sealed|gen1-dev-train|gen1-dev-confirm|gen1-final-holdout|SD7_DETAIL/,
    ]) {
      expect(source, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it('reaches no A2 harness, current-A2 discovery, document assembly, SD7, SET_P, SET_R or SD9', () => {
    expect(allCode()).not.toMatch(/'\.\.\/(a3documents|a3graphs|a3samples|a3readiness|sd7)/);
    expect(allCode()).not.toMatch(
      /a3governanceV4\/(registryV4|resolveV4|familiesV4|commitLoaderV4)/,
    );
    const source = allCodeWithoutStrings();
    for (const forbidden of [
      /continuationWindow|acquisitionGate|v3transition|\/transition\/|\/corpus\/|\/draw\//,
      /a3documents|a3graphs|a3samples|a3readiness|\/sd7\/|setP|setR|sd9/i,
      /commitLoader|readCommittedBlob|\/registryV4\b|\/resolveV4\b|familiesV4|provenanceClosure/,
      /\blatest\b|rev-parse|ls-remote|origin\/|feat\/phase2b-2d-a2/i,
    ]) {
      expect(source, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it('names no DEV_CONFIRM or FINAL_HOLDOUT split and takes no split parameter', () => {
    const source = allCode();
    expect(source).not.toMatch(/DEV_CONFIRM|FINAL_HOLDOUT/);
    expect(source).not.toMatch(/\bsplit\s*:\s*(Split|string)\s*[,)]/);
  });

  it('invents no evidence, coverage, continuity or batch digest', () => {
    const source = allCode();
    expect(source).not.toMatch(/createHash|node:crypto/);
    expect(source).not.toMatch(
      /evidenceDeltaHash|coverageExpansionHash|authorityContinuityHash|batchHash/i,
    );
  });
});

describe.skipIf(!baseAvailable)('2D-A3 R33: lineage and changed surface', () => {
  it('descends from the exact canonical R32 tip, and merges no commit', () => {
    expect(() => git('merge-base', '--is-ancestor', R32_TERMINAL, 'HEAD')).not.toThrow();
    expect(() => git('merge-base', '--is-ancestor', R32_SCOPE_PIN_COMMIT, 'HEAD')).not.toThrow();
    expect(lines(git('rev-list', '--merges', `${R32_TERMINAL}..HEAD`))).toEqual([]);
    expect(git('rev-parse', `${R32_SCOPE_PIN_COMMIT}^`).trim()).toBe(R32_TERMINAL);
  });

  it('adds no A2 commit beyond the frozen V4 checkpoint', () => {
    const introduced = lines(git('rev-list', `${R32_TERMINAL}..HEAD`));
    for (const commit of introduced) {
      expect(lines(git('rev-list', '--parents', '-n', '1', commit))[0]!.split(' ')).toHaveLength(2);
    }
    if (commitExists(V4_A2_CHECKPOINT)) {
      expect(() => git('merge-base', '--is-ancestor', V4_A2_CHECKPOINT, 'HEAD')).toThrow();
    }
  });

  it("pinned R32's scope in exactly one commit that touched exactly one file", () => {
    expect(lines(git('diff', '--name-only', R32_TERMINAL, R32_SCOPE_PIN_COMMIT))).toEqual([
      R32_ISOLATION_TEST,
    ]);
    expect(sha256(readFileSync(join(REPO_ROOT, R32_ISOLATION_TEST)))).toBe(
      sha256(git('show', `${R32_SCOPE_PIN_COMMIT}:${R32_ISOLATION_TEST}`)),
    );
  });

  it('leaves every earlier A3 namespace and the A2 harness untouched', () => {
    for (const namespace of Object.keys(FROZEN_NAMESPACES)) {
      const path = `${HARNESS}/${namespace}`;
      expect(lines(git('diff', '--name-only', R32_TERMINAL, '--', path)), path).toEqual([]);
      expect(lines(git('ls-files', '--others', '--exclude-standard', '--', path)), path).toEqual(
        [],
      );
    }
  });

  it('leaves every earlier A3 public census and audit byte-identical', () => {
    const prior = lines(
      git('ls-tree', '-r', '--name-only', R32_TERMINAL, '--', 'docs/evaluation', 'docs/audits'),
    ).filter((path) => /PHASE_2B_2D_A3_R\d+_/.test(path));
    expect(prior.length).toBeGreaterThanOrEqual(28);
    for (const record of prior) {
      expect(sha256(readFileSync(join(REPO_ROOT, record))), record).toBe(
        sha256(git('show', `${R32_TERMINAL}:${record}`)),
      );
    }
  });

  it('writes no governance record: every docs/evaluation change is the R33 census', () => {
    const changed = lines(
      git('diff', '--name-only', R32_TERMINAL, R33_TERMINAL, '--', 'docs/evaluation'),
    );
    expect(changed.filter((path) => path !== R33_CENSUS_PATH)).toEqual([]);
  });

  it('changes nothing outside its own namespace, tests, records and the R32 scope pin', () => {
    const paths = lines(git('diff', '--name-only', R32_TERMINAL, R33_TERMINAL));
    const permitted = (path: string): boolean =>
      path.startsWith(`${A3EVIDENCE_V4_REL}/`) ||
      R33_TESTS.includes(path) ||
      path === R32_ISOLATION_TEST ||
      path === R33_CENSUS_PATH ||
      path === R33_AUDIT_PATH;
    expect(paths.filter((path) => !permitted(path))).toEqual([]);
  });
});

describe.skipIf(!existsSync(join(REPO_ROOT, R33_CENSUS_PATH)))(
  '2D-A3 R33: the public census discloses nothing',
  () => {
    const raw = existsSync(join(REPO_ROOT, R33_CENSUS_PATH))
      ? readFileSync(join(REPO_ROOT, R33_CENSUS_PATH), 'utf8')
      : '{}';
    const audit = existsSync(join(REPO_ROOT, R33_AUDIT_PATH))
      ? readFileSync(join(REPO_ROOT, R33_AUDIT_PATH), 'utf8')
      : '';
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const payload = (() => {
      const copy = JSON.parse(raw) as Record<string, unknown>;
      delete copy['identityDisclosure'];
      delete copy['whatThisIsNot'];
      return JSON.stringify(copy, null, 2);
    })();

    it('is the derived census record, and authorises nothing', () => {
      expect(parsed['record']).toBe(R33_PUBLIC_CENSUS_RECORD_KIND);
      expect(parsed['recordKind']).toBe('PUBLIC_AGGREGATE_ONLY_INCREMENTAL_EVIDENCE_CENSUS');
      expect(parsed['thisFileAuthorises']).toEqual([]);
      expect(parsed['r32Tip']).toBe(R32_TERMINAL);
      expect(parsed['r32ScopePinCommit']).toBe(R32_SCOPE_PIN_COMMIT);
    });

    it('states 6 canonical + 7 newly bound = 13, from seven delta queries and no legacy query', () => {
      const coverage = parsed['coverage'] as Record<string, unknown>;
      expect(coverage['historicalCanonicalCoverageCount']).toBe(6);
      expect(coverage['r33NewlyBoundEvidenceCount']).toBe(7);
      expect(coverage['totalAuthorityCoverageAfterExpansion']).toBe(13);
      expect(coverage['coverageEqualsV4DevTrainReady']).toBe(true);
      const delta = parsed['governanceDelta'] as Record<string, unknown>;
      expect(delta['changedExistingAuthorityCount']).toBe(0);
      expect(delta['removedAuthorityCount']).toBe(0);
      const access = parsed['databaseAccess'] as Record<string, unknown>;
      expect(access['role']).toBe('nwf_readonly');
      expect(access['database']).toBe('nwf_pe');
      expect(access['transactionReadOnly']).toBe(true);
      expect(access['transactionIsolation']).toBe('repeatable read');
      expect(access['legacyAuthorityEvidenceQueries']).toBe(0);
      expect(access['deltaAuthorityEvidenceQueries']).toBe(7);
      expect(access['devConfirmEvidenceReads']).toBe(0);
      expect(access['finalHoldoutEvidenceReads']).toBe(0);
      expect(access['writes']).toBe(0);
      const evidence = parsed['deltaEvidence'] as Record<string, unknown>;
      expect(evidence['matchedRuns']).toBe(7);
      expect(evidence['validCompletions']).toBe(7);
      const integrity = parsed['integrity'] as Record<string, number>;
      for (const [key, value] of Object.entries(integrity)) expect(value, key).toBe(0);
    });

    it('carries no identity-, position-, run-, digest- or per-slot-bearing key', () => {
      for (const key of [
        'selectionIndex',
        'selectionIndices',
        'reserveRankPosition',
        'organisationId',
        'echeRowKey',
        'runId',
        'runRef',
        'runRefSha256',
        'drawEntrySha256',
        'responseSha256',
        'pageEvidenceId',
        'fetchObservationId',
        'candidateId',
        'url',
        'host',
        'title',
        'mainText',
        'candidateScore',
        'signals',
        'sealedSd7Detail',
        'items',
        'slots',
      ]) {
        expect(payload, key).not.toContain(`"${key}":`);
      }
    });

    it('names no URL, domain, sealed filename or run-shaped digest', () => {
      expect(payload).not.toMatch(/https?:\/\/|\.(fr|eu|org|com)\b|SD7_DETAIL|\.json"|sealed-/);
      const digests = [...new Set(payload.match(/\b[0-9a-f]{40,64}\b/g) ?? [])].sort();
      const permitted = new Set([
        '58f756453bdc19168b584b5994379e05f0281781',
        V4_A2_CHECKPOINT,
        R32_TERMINAL,
        R32_SCOPE_PIN_COMMIT,
        String(parsed['implementationCommit']),
      ]);
      expect(digests.filter((digest) => !permitted.has(digest))).toEqual([]);
      expect(String(parsed['implementationCommit'])).toMatch(/^[0-9a-f]{40}$/);
    });

    it('neither the census nor the audit carries any V4 READY authority identity', () => {
      const v4 = loadCommittedA2GovernanceV4(REPO_ROOT);
      const secrets = new Set<string>();
      for (const ready of readyAuthoritiesOfV4(v4)) {
        for (const value of [
          ready.organisationId,
          ready.echeRowKey,
          ready.runRefSha256,
          ready.runRefSha256.slice(0, 12),
          ready.drawEntrySha256,
          ...ready.slotChainLedgerEntryHashes,
          ready.sealedSd7Detail?.sha256,
          ready.sealedSd7Detail?.file,
        ]) {
          if (typeof value === 'string' && value.length >= 8) secrets.add(value);
        }
      }
      expect(secrets.size).toBeGreaterThan(69 * 3);
      for (const secret of secrets) {
        expect(raw.includes(secret)).toBe(false);
        expect(audit.includes(secret)).toBe(false);
      }
    });
  },
);
