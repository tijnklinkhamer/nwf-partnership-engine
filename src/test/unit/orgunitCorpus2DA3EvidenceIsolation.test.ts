/**
 * PHASE 2B-2D A3 R20 ISOLATION — `a3evidence/` READS ONE DATABASE, AND THAT IS
 * ITS ONLY EXTERNAL EFFECT.
 *
 * R20 lives in a THIRD sibling namespace, beside `a3prep/` (the pure, frozen
 * R1-R17 methodology layer) and `a3governance/` (the offline adapter over
 * committed bytes). The three stay apart for the same reason they were split
 * in the first place: R17 must remain unable to learn about a file, and
 * neither R17 nor R19 may learn about a database.
 *
 * This file proves:
 *
 *   - `a3evidence/` imports `pg` types, `node:crypto`, R19's snapshot API and
 *     R17's authority predicate - and nothing else: no gateway, no robots, no
 *     socket, no transport, no orchestrator, no provider, no classifier, no
 *     sealed reader, no SET_P, no SET_R, no corpus-freeze preflight, and no
 *     environment-selected database;
 *   - every SQL statement it can issue is a read; no DML or DDL verb appears;
 *   - there is no minting backdoor of any name;
 *   - `a3prep/` and `a3governance/` are byte-identical to R19;
 *   - R19 still derives exactly the same governance census it did before;
 *   - the committed R20 census discloses no identity.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { R20_SQL_STATEMENTS } from '../harness/phase2b2d/a3evidence/database.js';
import {
  R20_EVIDENCE_SPLIT_V1,
  R20_EXPECTED_CANDIDATE_TRACKS,
  R20_REAL_WORKING_DATABASE_NAME,
  R20_REQUIRED_DATABASE_ROLE,
} from '../harness/phase2b2d/a3evidence/types.js';
import { R20_PUBLIC_CENSUS_RECORD_KIND } from '../harness/phase2b2d/a3evidence/census.js';
import { loadCanonicalA2GovernanceV1 } from '../harness/phase2b2d/a3governance/snapshot.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const A3PREP_REL = 'src/test/harness/phase2b2d/a3prep';
const A3GOVERNANCE_REL = 'src/test/harness/phase2b2d/a3governance';
const A3EVIDENCE_REL = 'src/test/harness/phase2b2d/a3evidence';

/** The exact R19 branch tip R20 was cut from. */
const R19_TIP = '6369b28408dd99b0edca86c7fb0e5376bdccf68a';

const R20_CENSUS_PATH =
  'docs/evaluation/PHASE_2B_2D_A3_R20_DEV_TRAIN_DURABLE_EVIDENCE_BINDING_CENSUS_V1.json';

const A3EVIDENCE_FILES = [
  'census.ts',
  'database.ts',
  'devTrain.ts',
  'integrity.ts',
  'refusal.ts',
  'runMatch.ts',
  'types.ts',
];

/**
 * The a3prep and a3governance bytes as R19 left them. R20 adds a namespace
 * beside them and changes neither.
 */
const R19_FROZEN_BYTES: Readonly<Record<string, string>> = {
  [`${A3PREP_REL}/contracts.ts`]:
    '4d856f45dd6016e1007d661f31388bf7bdbefd71862a6585ed4962240454b40f',
  [`${A3PREP_REL}/corpusFreezePreflight.ts`]:
    'ddae984fec947845ec2e2df9feb24bf8b8f75c28993b413919c08a69c307fe75',
  [`${A3PREP_REL}/manifestTypes.ts`]:
    '63e35e879a1cc31731704abd4273fbd2c6e3d438cef93fa79127f91529b4d4ee',
  [`${A3PREP_REL}/organisationCaps.ts`]:
    '20432a5c7bd78ef7ec78e61b7a37e69abe5849539eca07564cc091bf6afc302c',
  [`${A3PREP_REL}/rank.ts`]: '91658202f744be7efa5acfcb7905c9819af2bd4cbcd762aaeb2b8a49bf7c513e',
  [`${A3PREP_REL}/sd7.ts`]: '322d2dd09f17dcc7ce0afa1862a13892f8bdadfece1c3ec919580f9d49977086',
  [`${A3PREP_REL}/sd9.ts`]: '1de6a2781f322be0dea679d58897c37f49f4b1ca41df1933e975b5291f6efbdd',
  [`${A3PREP_REL}/setP.ts`]: 'c6839c72d365e5fd9bbe1c0604a6539e42a297dfeb4876fd6ed17858b578401c',
  [`${A3PREP_REL}/setPSd7.ts`]: 'b13c047f12ecf27583f07cef28923e3adc1e77ed2b3a1e1655de372cd79fdd4a',
  [`${A3PREP_REL}/setR.ts`]: '76e8cae9f24c2ceb983ffa5777fcb96583cff0553e360126a711a282a6a75bec',
  [`${A3PREP_REL}/setRScore.ts`]:
    '055747a5f5f067e06079562cd7e37a4e12d011d3736e28b947b5a30d6f588cf7',
  [`${A3PREP_REL}/setRSd7.ts`]: 'b03e26fae833c527b9cbbd1962bdf95e886b3a01fbd5e636c61b4c9a8c62e056',
  [`${A3PREP_REL}/setRSd7Readiness.ts`]:
    '6db33d0d39d9ab90fbf2e1b8b44a9649a6aa6db380d9f97cb5f1f8bdeb19561a',
  [`${A3PREP_REL}/slotAuthority.ts`]:
    'deee711b6eac66bccec51afee49615b71b94d0701b110a3abd50c1c12207f165',
  [`${A3PREP_REL}/splitScope.ts`]:
    'a03a9a742588ffc18842d20a5f00c9eaaf505e721e0b72d5fcc510c16f219a36',
  [`${A3PREP_REL}/types.ts`]: 'b9358e63bdf49f92e094a0605d34dfbaaf92403839265bbaa6249165f8b00810',
  [`${A3GOVERNANCE_REL}/families.ts`]:
    'a54a6908c25c8730600b900136efe74161f775af77c6888f11adb6b67e007dc0',
  [`${A3GOVERNANCE_REL}/loader.ts`]:
    '912ebdd7abe0192bc8f64a386dddc2339ac18c4e15a2ab2792976fff4e579783',
  [`${A3GOVERNANCE_REL}/refusal.ts`]:
    '5bd9f1f9bd99033253c07c5d103e1d637c6ca3399384b1288a3060a4475095da',
  [`${A3GOVERNANCE_REL}/registryV1.ts`]:
    '9dfd82344bd2bc9ba74997b47b7f88d7d6ca9938aa86e86153c14954b215d05d',
  [`${A3GOVERNANCE_REL}/resolve.ts`]:
    '3163d80229dc5ae5b1dab7c1e7351527ddaddcefaad3bd368dcb9106ca205178',
  [`${A3GOVERNANCE_REL}/snapshot.ts`]:
    '635ea860ed672d33d4f19329fff177ecac7ecef0434908c667b9f9ee25bca2fb',
  [`${A3GOVERNANCE_REL}/transitionLedger.ts`]:
    'e921c39a44fb8596aa345c9dcf6f27074af8e198b5e4d1ae0e145ed74fc9e462',
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
  return stripComments(readFileSync(join(REPO_ROOT, A3EVIDENCE_REL, file), 'utf8'));
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

const baseAvailable = commitExists(R19_TIP);

// ---------------------------------------------------------------------------

describe('2D-A3 R20: the new namespace is exactly these files', () => {
  it('holds the seven adapter modules and no synthetic fixture', () => {
    expect(readdirSync(join(REPO_ROOT, A3EVIDENCE_REL)).sort()).toEqual(A3EVIDENCE_FILES);
    expect(existsSync(join(REPO_ROOT, A3EVIDENCE_REL, 'syntheticFixtures.ts'))).toBe(false);
  });

  it('leaves a3prep at sixteen files and a3governance at seven', () => {
    expect(readdirSync(join(REPO_ROOT, A3PREP_REL))).toHaveLength(16);
    expect(readdirSync(join(REPO_ROOT, A3GOVERNANCE_REL))).toHaveLength(7);
  });

  it('creates no R20 module inside a3prep or a3governance', () => {
    for (const rel of [A3PREP_REL, A3GOVERNANCE_REL]) {
      for (const file of readdirSync(join(REPO_ROOT, rel))) {
        expect(file).not.toMatch(/evidence|devTrain|runMatch|database/i);
      }
    }
  });
});

describe('2D-A3 R20: the adapter reaches only what it is allowed to reach', () => {
  const ALLOWED_BARE = new Set(['pg', 'node:crypto']);
  const ALLOWED_RELATIVE = new Set([
    './census.js',
    './database.js',
    './devTrain.js',
    './integrity.js',
    './refusal.js',
    './runMatch.js',
    './types.js',
    '../a3governance/snapshot.js',
    '../a3prep/slotAuthority.js',
  ]);

  it('imports only pg types, crypto, R19 snapshot APIs and R17 authority', () => {
    for (const file of A3EVIDENCE_FILES) {
      for (const specifier of specifiersOf(code(file))) {
        const allowed = specifier.startsWith('.')
          ? ALLOWED_RELATIVE.has(specifier)
          : ALLOWED_BARE.has(specifier);
        expect(allowed, `${file} imports ${specifier}`).toBe(true);
      }
    }
  });

  /**
   * These assert real CAPABILITIES - a module specifier, a socket module, an
   * environment read, a sealed root, a selection module - never an ordinary
   * English word. The census DECLARES that it is not SET_P or SET_R
   * authority, so a bare word scan would trip on the very promise it enforces.
   */
  it('holds no socket, transport, provider, classifier or sealed-root capability', () => {
    const FORBIDDEN: readonly RegExp[] = [
      /node:net|node:tls|node:http|node:https|node:dgram|node:dns/,
      /\bfetch\s*\(|executeWebAttempt|\/gateway\.js|\/robots\.js|\/sitemap\.js/,
      /orgunits\/web\/|orgunits\/orchestrator\/|orgunits\/signals\//,
      /from\s+['"][^'"]*(?:anthropic|openai|apollo|puppeteer|playwright)/i,
      /\bnew Anthropic\b|\bnew OpenAI\b|messages\.create\(/,
      /orgunits\/classify\//,
      /SEALED_ROOT_BY_SPLIT|gen1-dev-train|gen1-dev-confirm|gen1-final-holdout|-sealed/,
      /homedir|os\.homedir|~\/|Developer\//,
      /execFile|spawnSync|child_process/,
      /process\.env|dotenv|config\/env|databaseUrl|testDatabaseUrl|DATABASE_URL/,
      /createPool|withPool|src\/db\//,
      /a3prep\/setP|a3prep\/setR|a3prep\/sd7|a3prep\/sd9|a3prep\/corpusFreezePreflight/,
      /a3prep\/manifestTypes|a3prep\/splitScope|a3prep\/organisationCaps|a3prep\/rank/,
    ];
    for (const file of A3EVIDENCE_FILES) {
      const source = code(file);
      for (const pattern of FORBIDDEN) {
        expect(source, `${file} :: ${String(pattern)}`).not.toMatch(pattern);
      }
    }
  });

  it('writes no file and opens no file handle', () => {
    for (const file of A3EVIDENCE_FILES) {
      expect(code(file), file).not.toMatch(
        /writeFileSync|appendFileSync|mkdirSync|rmSync|unlinkSync|createWriteStream|readFileSync|node:fs/,
      );
    }
  });

  it('selects no "latest" run, and sorts no row into authority', () => {
    for (const file of A3EVIDENCE_FILES) {
      expect(code(file), file).not.toMatch(/latest|newest|mostRecent|ORDER BY .*DESC/i);
    }
  });
});

describe('2D-A3 R20: every statement it can issue is a read', () => {
  it('begins one repeatable-read read-only transaction', () => {
    expect(R20_SQL_STATEMENTS[0]).toBe(
      'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
    );
  });

  it('issues nothing but SELECT and transaction control', () => {
    for (const statement of R20_SQL_STATEMENTS) {
      const first = statement.trim().split(/\s+/)[0]?.toUpperCase() ?? '';
      expect(['SELECT', 'BEGIN', 'COMMIT', 'ROLLBACK'], statement.slice(0, 40)).toContain(first);
    }
  });

  it('contains no DML or DDL verb anywhere in the namespace', () => {
    const FORBIDDEN_SQL =
      /\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|TRUNCATE\b|DROP\s+TABLE|ALTER\s+TABLE|CREATE\s+(TABLE|INDEX|ROLE)|GRANT\s+\w|REVOKE\s+\w|SELECT\s+.*\s+INTO\s)/i;
    for (const file of A3EVIDENCE_FILES) {
      expect(code(file), file).not.toMatch(FORBIDDEN_SQL);
    }
  });

  it('interpolates no value into SQL text', () => {
    for (const statement of R20_SQL_STATEMENTS) {
      expect(statement, statement.slice(0, 40)).not.toMatch(/\$\{/);
    }
    // Every value-bearing statement uses positional parameters.
    const parameterised = R20_SQL_STATEMENTS.filter((statement) => statement.includes('WHERE'));
    expect(parameterised.length).toBeGreaterThan(0);
    for (const statement of parameterised) {
      expect(statement).toMatch(/\$\d/);
    }
  });

  it('reads no table whole, and no table outside the Phase 2B evidence set', () => {
    const PERMITTED_TABLES = [
      'orgunit_research_runs',
      'orgunit_research_run_completions',
      'orgunit_fetch_observations',
      'orgunit_page_evidence',
      'orgunit_page_candidates',
    ];
    for (const statement of R20_SQL_STATEMENTS) {
      if (!statement.includes('FROM')) continue;
      for (const match of statement.matchAll(/\b(?:FROM|JOIN)\s+([a-z_]+)/g)) {
        expect(PERMITTED_TABLES, statement.slice(0, 40)).toContain(match[1]);
      }
      expect(statement).toMatch(/WHERE/);
    }
  });
});

describe('2D-A3 R20: there is no minting backdoor', () => {
  it('exposes no bypass of any name', () => {
    for (const file of A3EVIDENCE_FILES) {
      expect(code(file), file).not.toMatch(
        /unsafeMint|skipAuthorityCheck|trustMe|testOnlyReady|forceMint|bypassAuthority|__test/i,
      );
    }
  });

  it('brands with its own private WeakSet and WeakMap', () => {
    const devTrain = code('devTrain.ts');
    expect(devTrain).toMatch(/new WeakSet<object>\(\)/);
    expect(devTrain).toMatch(/new WeakMap</);
    expect(devTrain).toMatch(
      /isA3SlotAcquisitionAuthorityReady|governanceSnapshotForReadyAuthority/,
    );
    expect(devTrain).toMatch(/isCommittedGovernanceSnapshot/);
  });

  it('supports exactly one split, as a constant rather than an argument', () => {
    expect(R20_EVIDENCE_SPLIT_V1).toBe('DEV_TRAIN');
    expect(R20_REQUIRED_DATABASE_ROLE).toBe('nwf_readonly');
    expect(R20_REAL_WORKING_DATABASE_NAME).toBe('nwf_pe');
    expect(R20_EXPECTED_CANDIDATE_TRACKS).toEqual(['INTERNATIONAL_OFFICE', 'LANGUAGE_CENTRE']);
    const devTrain = code('devTrain.ts');
    expect(devTrain).not.toMatch(/DEV_CONFIRM|FINAL_HOLDOUT/);
    for (const file of A3EVIDENCE_FILES) {
      expect(code(file), file).not.toMatch(/DEV_CONFIRM|FINAL_HOLDOUT/);
    }
  });

  /**
   * R20 loads durable evidence. It does not assemble documents, reduce
   * scores, build a corpus graph or select membership - and a module that
   * named any of those would have started to.
   */
  it('builds no SET_P, no SET_R, no SD7 graph and no manifest', () => {
    for (const file of A3EVIDENCE_FILES) {
      const source = code(file);
      expect(source, file).not.toMatch(
        /\bSET_P\b|\bSET_R\b|setPRank|setRRank|jaccard|fiveGram|nGram|shingle|nearDuplicate/i,
      );
      expect(source, file).not.toMatch(
        /CORPUS_SALT|corpusSalt|manifestMembership|freezePreflight/i,
      );
      expect(source, file).not.toMatch(/Math\.max\(0|clamp|RELEVANCE_THRESHOLD|threshold/i);
    }
  });
});

describe('2D-A3 R20: R19 is untouched', () => {
  it('leaves every a3prep and a3governance file byte-identical', () => {
    for (const [relative, expected] of Object.entries(R19_FROZEN_BYTES)) {
      const bytes = readFileSync(join(REPO_ROOT, relative));
      expect(createHash('sha256').update(bytes).digest('hex'), relative).toBe(expected);
    }
  });

  it('keeps R17 unable to learn about a database', () => {
    const r17 = readFileSync(join(REPO_ROOT, A3PREP_REL, 'slotAuthority.ts'), 'utf8');
    expect(r17).not.toMatch(/a3evidence|pg\b|Pool|SELECT |nwf_readonly/);
  });

  it('keeps R19 unable to learn about a database', () => {
    for (const file of readdirSync(join(REPO_ROOT, A3GOVERNANCE_REL))) {
      const source = readFileSync(join(REPO_ROOT, A3GOVERNANCE_REL, file), 'utf8');
      expect(source, file).not.toMatch(/a3evidence|from 'pg'|new Pool|nwf_readonly/);
    }
  });

  /** §81. R20 must not move a single governance number. */
  it('still derives exactly the R19 governance census', () => {
    const snapshot = loadCanonicalA2GovernanceV1(REPO_ROOT);
    expect(snapshot.resolution.summary).toMatchObject({
      totalSlotCount: 110,
      readySlotCount: 23,
      notReadySlotCount: 87,
      unsuccessfulCurrentOccupantCount: 1,
      pendingAdjudicationCount: 0,
      noTerminalEvidenceCount: 86,
      reserveConsumedCount: 8,
      reserveUnusedCount: 32,
      status: 'A3_GENERATION_SLOT_AUTHORITY_INCOMPLETE',
    });
    expect(snapshot.resolution.summary.slotCountBySplit).toEqual({
      DEV_TRAIN: 20,
      DEV_CONFIRM: 45,
      FINAL_HOLDOUT: 45,
    });
  });
});

describe.skipIf(!baseAvailable)('2D-A3 R20: lineage and changed surface', () => {
  it('descends from the exact R19 tip', () => {
    expect(() => git('merge-base', '--is-ancestor', R19_TIP, 'HEAD')).not.toThrow();
  });

  it('changes no a3prep, a3governance, production, migration or A2 record file', () => {
    const paths = [
      ...new Set([
        ...lines(git('diff', '--name-only', R19_TIP)),
        ...lines(git('ls-files', '--others', '--exclude-standard')),
      ]),
    ];
    const forbidden = paths.filter(
      (path) =>
        path.startsWith(`${A3PREP_REL}/`) ||
        path.startsWith(`${A3GOVERNANCE_REL}/`) ||
        (path.startsWith('src/test/harness/') && !path.startsWith(`${A3EVIDENCE_REL}/`)) ||
        path.startsWith('src/test/firewall/') ||
        path.startsWith('src/orgunits/') ||
        path.startsWith('src/cli/') ||
        path.startsWith('src/db/') ||
        path.startsWith('src/config/') ||
        path.startsWith('migrations/') ||
        path === 'package.json' ||
        path === 'package-lock.json',
    );
    expect(forbidden).toEqual([]);
  });

  it('adds only its own derived census under docs/evaluation', () => {
    const paths = [
      ...new Set([
        ...lines(git('diff', '--name-only', R19_TIP, '--', 'docs/evaluation')),
        ...lines(git('ls-files', '--others', '--exclude-standard', '--', 'docs/evaluation')),
      ]),
    ];
    for (const path of paths) expect(path).toBe(R20_CENSUS_PATH);
  });
});

/**
 * §74. The committed census must disclose no identity. The check activates as
 * soon as the census exists, and never stops applying afterwards.
 */
describe.skipIf(!existsSync(join(REPO_ROOT, R20_CENSUS_PATH)))(
  '2D-A3 R20: the public census discloses nothing',
  () => {
    const raw = existsSync(join(REPO_ROOT, R20_CENSUS_PATH))
      ? readFileSync(join(REPO_ROOT, R20_CENSUS_PATH), 'utf8')
      : '{}';

    it('is the derived census record, and authorises nothing', () => {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      expect(parsed['record']).toBe(R20_PUBLIC_CENSUS_RECORD_KIND);
      expect(parsed['thisFileAuthorises']).toEqual([]);
      expect(parsed['split']).toBe('DEV_TRAIN');
    });

    it('carries no identity-bearing key', () => {
      const FORBIDDEN_KEYS = [
        'selectionIndex',
        'selectionIndices',
        'reserveRankPosition',
        'organisationId',
        'echeRowKey',
        'runId',
        'runRefSha256',
        'fetchObservationId',
        'pageEvidenceId',
        'candidateId',
        'requestedUrl',
        'requestedHost',
        'registrableDomain',
        'responseSha256',
        'title',
        'headings',
        'mainText',
        'signals',
        'sealed',
      ];
      for (const key of FORBIDDEN_KEYS) {
        expect(raw, key).not.toMatch(new RegExp(`"${key}"`, 'i'));
      }
    });

    it('carries no bare digest, uuid, url or host', () => {
      expect(raw).not.toMatch(/https?:\/\//);
      expect(raw).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      // Commit hashes are 40 hex; a 64-hex digest would be a document or run reference.
      expect(raw).not.toMatch(/\b[0-9a-f]{64}\b/);
    });

    it('invents no new authority digest', () => {
      expect(raw).not.toMatch(
        /databaseSnapshotHash|evidenceBatchHash|documentCorpusHash|r20AuthorityHash/i,
      );
    });

    it('declares zero writes and zero non-DEV_TRAIN reads', () => {
      const parsed = JSON.parse(raw) as { databaseAccess?: Record<string, unknown> };
      expect(parsed.databaseAccess).toMatchObject({
        role: 'nwf_readonly',
        transactionReadOnly: true,
        transactionIsolationLevel: 'repeatable read',
        writes: 0,
        institutionNetworkRequests: 0,
        sealedRootReads: 0,
        nonDevTrainEvidenceQueries: 0,
      });
    });
  },
);
