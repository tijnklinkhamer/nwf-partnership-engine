/**
 * PHASE 2B-2D A3 R26 — ISOLATION OF THE INCREMENTAL DEV_TRAIN EVIDENCE DELTA.
 *
 * By reading source text, the repository's own history and the committed
 * records, this file proves:
 *
 *   - R26 lives in the NEW sibling namespace `a3evidenceV2/`, and every
 *     earlier A3 namespace - R20's `a3evidence/` above all - is byte-identical
 *     to the canonical R25 tip, with R20's modules pinned by sha256;
 *   - R26 reuses R20's UNBOUND lower layer and never calls R20's V1 minting
 *     or batch binders;
 *   - no environment, filesystem, network, provider, classifier, sealed-root,
 *     child-process, A2-write, document-assembly, SD7, SET_P, SET_R or SD9
 *     capability exists in the namespace, and its only database capability is
 *     the one R20 already provides;
 *   - the only pre-existing file R26 touched is R25's historical scope pin;
 *   - the committed R26 census discloses no identity and invents no digest.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { R26_PUBLIC_CENSUS_RECORD_KIND } from '../harness/phase2b2d/a3evidenceV2/census.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const HARNESS = 'src/test/harness/phase2b2d';
const A3EVIDENCE_V2_REL = `${HARNESS}/a3evidenceV2`;

/** The exact canonical R25 tip R26 was cut from. */
const R25_TERMINAL = '77883886c1213dbf8cd4cff24009813e7d9e09c9';

/** The one commit that pinned R25's own changed-surface test to its range. */
const R25_SCOPE_PIN_COMMIT = 'ccbd3dcbcb606526b8fbcefd18539809835120ab';
const R25_ISOLATION_TEST = 'src/test/unit/orgunitCorpus2DA3GovernanceV2Isolation.test.ts';

const R26_TESTS = [
  'src/test/unit/orgunitCorpus2DA3EvidenceV2Delta.test.ts',
  'src/test/unit/orgunitCorpus2DA3EvidenceV2Isolation.test.ts',
];
const R26_CENSUS_PATH =
  'docs/evaluation/PHASE_2B_2D_A3_R26_DEV_TRAIN_INCREMENTAL_DURABLE_EVIDENCE_CENSUS_V1.json';
const R26_AUDIT_PATH =
  'docs/audits/PHASE_2B_2D_A3_R26_INCREMENTAL_DEV_TRAIN_DURABLE_EVIDENCE_V1.md';

const A3EVIDENCE_V2_FILES = [
  'authorityDelta.ts',
  'census.ts',
  'devTrain.ts',
  'r25Drift.ts',
  'refusal.ts',
  'types.ts',
];

/** R20's modules, byte-pinned: R26 reuses their lower layer without altering it. */
const R20_A3EVIDENCE_SHA256: Readonly<Record<string, string>> = {
  'census.ts': 'af42fe57747530f3d0b3c5def0913eb7828f098c652b996a12a8b198d483e415',
  'database.ts': '48c47fb44a13ed3b5408c53afda8972a598cd6f7057d7e6191682633456d52e0',
  'devTrain.ts': '175aa179954395e86a5c0c5cf0529560b23e13abf36f0f4eee1d498f6c6def3f',
  'integrity.ts': 'a6f67b22581df40357ed0809083192eb839f80ff86797934d487bac721e877f4',
  'refusal.ts': '6cae64c61a08e919690ce1286f6433d429b4246c853a373b801470a705fc96a8',
  'runMatch.ts': '0d911386cb234964c616fadf51a6c9070f5ec47d1bed4498ee25ee62ea8aea00',
  'types.ts': '3b26c39afdb871a5f4de26969e1d1a167a5591a5820b44ab4ab42adc77544c2a',
};

/** Every earlier namespace R26 must leave byte-identical, with its file count. */
const FROZEN_NAMESPACES: Readonly<Record<string, number>> = {
  a3prep: 16,
  a3governance: 7,
  a3governanceV2: 7,
  a3evidence: 7,
  a3documents: 6,
  a3graphs: 6,
  a3samples: 6,
  a3readiness: 6,
  continuationWindow: -1,
  sd7: -1,
  draw: -1,
};

const PRIOR_RECORDS = [
  'docs/evaluation/PHASE_2B_2D_A3_R19_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V1.json',
  'docs/evaluation/PHASE_2B_2D_A3_R20_DEV_TRAIN_DURABLE_EVIDENCE_BINDING_CENSUS_V1.json',
  'docs/evaluation/PHASE_2B_2D_A3_R21_DEV_TRAIN_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1.json',
  'docs/evaluation/PHASE_2B_2D_A3_R22_DEV_TRAIN_SD7_GRAPH_MEASUREMENT_CENSUS_V1.json',
  'docs/evaluation/PHASE_2B_2D_A3_R23_DEV_TRAIN_SAMPLE_SURVIVOR_PREPARATION_CENSUS_V1.json',
  'docs/evaluation/PHASE_2B_2D_A3_R24_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_READINESS_CENSUS_V1.json',
  'docs/evaluation/PHASE_2B_2D_A3_R25_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V2.json',
  'docs/audits/PHASE_2B_2D_A3_R19_COMMITTED_A2_GOVERNANCE_AUTHORITY_ADAPTER_V1.md',
  'docs/audits/PHASE_2B_2D_A3_R20_DEV_TRAIN_DURABLE_EVIDENCE_ADAPTER_V1.md',
  'docs/audits/PHASE_2B_2D_A3_R21_DEV_TRAIN_DOCUMENT_SOURCE_ASSEMBLY_V1.md',
  'docs/audits/PHASE_2B_2D_A3_R22_DEV_TRAIN_SD7_GRAPH_MEASUREMENT_V1.md',
  'docs/audits/PHASE_2B_2D_A3_R23_DEV_TRAIN_SAMPLE_SURVIVOR_PREPARATION_V1.md',
  'docs/audits/PHASE_2B_2D_A3_R24_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_READINESS_V1.md',
  'docs/audits/PHASE_2B_2D_A3_R25_COMMITTED_GOVERNANCE_SNAPSHOT_V2_V1.md',
];

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
  return stripComments(readFileSync(join(REPO_ROOT, A3EVIDENCE_V2_REL, file), 'utf8'));
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
  return A3EVIDENCE_V2_FILES.map(code).join('\n');
}

const baseAvailable = commitExists(R25_TERMINAL) && commitExists(R25_SCOPE_PIN_COMMIT);

// ---------------------------------------------------------------------------

describe('2D-A3 R26: the new namespace is exactly these files', () => {
  it('holds the six incremental-evidence modules', () => {
    expect(readdirSync(join(REPO_ROOT, A3EVIDENCE_V2_REL)).sort()).toEqual(A3EVIDENCE_V2_FILES);
  });

  it('leaves every earlier A3 namespace at its file count', () => {
    for (const [namespace, count] of Object.entries(FROZEN_NAMESPACES)) {
      if (count < 0) continue;
      expect(readdirSync(join(REPO_ROOT, HARNESS, namespace)), namespace).toHaveLength(count);
    }
  });

  it('leaves every R20 module byte-identical', () => {
    for (const [file, digest] of Object.entries(R20_A3EVIDENCE_SHA256)) {
      expect(sha256(readFileSync(join(REPO_ROOT, HARNESS, 'a3evidence', file))), file).toBe(digest);
    }
  });
});

describe('2D-A3 R26: reuse R20 lower mechanics, never R20 V1 minting', () => {
  const PERMITTED_SPECIFIERS = new Set([
    'pg',
    '../a3prep/slotAuthority.js',
    '../a3governance/snapshot.js',
    '../a3governanceV2/snapshotV2.js',
    '../a3governanceV2/census.js',
    '../a3evidence/database.js',
    '../a3evidence/devTrain.js',
    '../a3evidence/types.js',
    './authorityDelta.js',
    './census.js',
    './devTrain.js',
    './r25Drift.js',
    './refusal.js',
    './types.js',
  ]);

  it('imports nothing but pg types and landed A3 governance / R20 evidence modules', () => {
    for (const file of A3EVIDENCE_V2_FILES) {
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

  it('never calls R20 V1 minting or batch binders, and never names the V1 brand', () => {
    const source = allCode();
    for (const forbidden of [
      'bindDurableEvidenceForReadyAuthority',
      'bindDevTrainDurableEvidenceBatch',
      'runDevTrainDurableEvidenceBinding',
      'isA3DurableAcquisitionEvidence',
      'devTrainReadyAuthoritiesOf',
      'governanceSnapshotForReadyAuthority',
    ]) {
      expect(source, forbidden).not.toMatch(new RegExp(`\\b${forbidden}\\b`));
    }
  });

  it('writes no SQL of its own and opens no transaction of its own', () => {
    const source = allCode();
    expect(source).not.toMatch(
      /\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bBEGIN\b|COMMIT|ROLLBACK/,
    );
    expect(source).not.toMatch(/\.connect\s*\(|new\s+pg\.|Pool\s*\(/);
  });
});

describe('2D-A3 R26: no env, fs, network, provider, sealed, A2-write or corpus capability', () => {
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

  it('reaches no A2 harness, document assembly, SD7, SET_P, SET_R or SD9 code', () => {
    const source = allCode();
    for (const forbidden of [
      /continuationWindow|acquisitionGate|v3transition|\/transition\/|\/corpus\/|\/draw\//,
      /a3documents|a3graphs|a3samples|a3readiness|\/sd7\/|setP|setR|sd9/i,
      /commitLoader|readCommittedBlob/,
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
      /evidenceDeltaHash|coverageExpansionHash|authorityContinuityHash|V2EvidenceBatchHash/,
    );
  });
});

describe.skipIf(!baseAvailable)('2D-A3 R26: lineage and changed surface', () => {
  it('descends from the exact canonical R25 tip, and merges no A2 commit', () => {
    expect(() => git('merge-base', '--is-ancestor', R25_TERMINAL, 'HEAD')).not.toThrow();
    expect(() => git('merge-base', '--is-ancestor', R25_SCOPE_PIN_COMMIT, 'HEAD')).not.toThrow();
    expect(lines(git('rev-list', '--merges', `${R25_TERMINAL}..HEAD`))).toEqual([]);
    for (const a2 of [
      'f76b8ae6653f1f8ec9dabd2d7eec3922c2e000f1',
      '117e1ea9367b0bc5608e4873f3460db79fa0dc31',
      'c82f488ab5ad1551f616f08506c57d13087dff3b',
    ]) {
      if (!commitExists(a2)) continue;
      expect(() => git('merge-base', '--is-ancestor', a2, 'HEAD'), a2).toThrow();
    }
  });

  it('pinned R25 scope in exactly one commit that touched exactly one file', () => {
    expect(lines(git('diff', '--name-only', R25_TERMINAL, R25_SCOPE_PIN_COMMIT))).toEqual([
      R25_ISOLATION_TEST,
    ]);
    expect(sha256(readFileSync(join(REPO_ROOT, R25_ISOLATION_TEST)))).toBe(
      sha256(git('show', `${R25_SCOPE_PIN_COMMIT}:${R25_ISOLATION_TEST}`)),
    );
  });

  it('leaves every earlier A3 namespace and the A2 harness untouched', () => {
    for (const namespace of Object.keys(FROZEN_NAMESPACES)) {
      const path = `${HARNESS}/${namespace}`;
      expect(lines(git('diff', '--name-only', R25_TERMINAL, '--', path)), path).toEqual([]);
      expect(lines(git('ls-files', '--others', '--exclude-standard', '--', path)), path).toEqual(
        [],
      );
    }
  });

  it('leaves every earlier public census and audit byte-identical', () => {
    for (const record of PRIOR_RECORDS) {
      expect(sha256(readFileSync(join(REPO_ROOT, record))), record).toBe(
        sha256(git('show', `${R25_TERMINAL}:${record}`)),
      );
    }
  });

  it('writes no governance record: every docs/evaluation change is the R26 census', () => {
    const changed = [
      ...lines(git('diff', '--name-only', R25_TERMINAL, '--', 'docs/evaluation')),
      ...lines(git('ls-files', '--others', '--exclude-standard', '--', 'docs/evaluation')),
    ];
    expect(changed.filter((path) => path !== R26_CENSUS_PATH)).toEqual([]);
  });

  it('changes nothing outside its own namespace, tests and records', () => {
    const paths = [
      ...new Set([
        ...lines(git('diff', '--name-only', R25_TERMINAL)),
        ...lines(git('ls-files', '--others', '--exclude-standard')),
      ]),
    ];
    const permitted = (path: string): boolean =>
      path.startsWith(`${A3EVIDENCE_V2_REL}/`) ||
      R26_TESTS.includes(path) ||
      path === R25_ISOLATION_TEST ||
      path === R26_CENSUS_PATH ||
      path === R26_AUDIT_PATH;
    expect(paths.filter((path) => !permitted(path))).toEqual([]);
  });
});

describe.skipIf(!existsSync(join(REPO_ROOT, R26_CENSUS_PATH)))(
  '2D-A3 R26: the public census discloses nothing',
  () => {
    const raw = existsSync(join(REPO_ROOT, R26_CENSUS_PATH))
      ? readFileSync(join(REPO_ROOT, R26_CENSUS_PATH), 'utf8')
      : '{}';
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const payload = (() => {
      const copy = JSON.parse(raw) as Record<string, unknown>;
      delete copy['identityDisclosure'];
      delete copy['whatThisIsNot'];
      return JSON.stringify(copy, null, 2);
    })();

    it('is the derived census record, and authorises nothing', () => {
      expect(parsed['record']).toBe(R26_PUBLIC_CENSUS_RECORD_KIND);
      expect(parsed['recordKind']).toBe('PUBLIC_AGGREGATE_ONLY_INCREMENTAL_EVIDENCE_CENSUS');
      expect(parsed['thisFileAuthorises']).toEqual([]);
    });

    it('states 5 canonical + 1 newly bound = 6, from one delta query and no legacy query', () => {
      const delta = parsed['governanceDelta'] as Record<string, unknown>;
      expect(delta['r20CanonicalEvidenceCoverageCount']).toBe(5);
      expect(delta['r26NewlyBoundEvidenceCount']).toBe(1);
      expect(delta['totalAuthorityCoverageAfterExpansion']).toBe(6);
      expect(delta['changedExistingAuthorityCount']).toBe(0);
      expect(delta['removedAuthorityCount']).toBe(0);
      const access = parsed['databaseAccess'] as Record<string, unknown>;
      expect(access['legacyAuthorityEvidenceQueries']).toBe(0);
      expect(access['deltaAuthorityEvidenceQueries']).toBe(1);
      expect(access['writes']).toBe(0);
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
        '907d726268ad07fe94fec93f4c6f3ff5ce5f93f9',
        'f76b8ae6653f1f8ec9dabd2d7eec3922c2e000f1',
        R25_TERMINAL,
        String(parsed['implementationCommit']),
      ]);
      expect(digests.filter((digest) => !permitted.has(digest))).toEqual([]);
      expect(String(parsed['implementationCommit'])).toMatch(/^[0-9a-f]{40}$/);
    });
  },
);
