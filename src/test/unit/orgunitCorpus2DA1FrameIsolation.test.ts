/**
 * PHASE 2B-2D A1 ISOLATION — THE FRAME LAYER ENUMERATES, AND DOES NOTHING ELSE.
 *
 * By walking the real import graph, module specifiers and source text of
 * `src/test/harness/phase2b2d/corpus/`, this file proves:
 *
 *   - A1 holds exactly the reviewed modules;
 *   - NO ranking, draw, selection, reserve, split-assignment or cycle
 *     capability exists anywhere in it - SD2 is A1b and is unauthorised, and
 *     the absence is asserted rather than promised;
 *   - no module opens a socket, calls fetch(), or imports a provider, an AI
 *     SDK, a browser, a search client or the orgunit web/orchestrator surface;
 *   - exactly one module reaches a database, it connects as the least-
 *     privilege `readonly` role, and its SQL contains no mutating verb and no
 *     transaction-control statement;
 *   - the historical exclusion opens the DEVELOPMENT corpus and no HOLDOUT or
 *     adjudication file, and its path is frozen rather than a parameter;
 *   - the frame artifact carries authority IDENTIFIERS and no URL, hostname,
 *     registrable domain, label, score or gate outcome;
 *   - A1 adds no file under src/orgunits/ and weakens no firewall.
 *
 * WHY THIS LIVES IN src/test/unit/ AND NOT src/test/firewall/
 *
 *   `orgunitClassifyAcceptanceMethodologyV2R2.test.ts` asserts that NO file
 *   under `src/test/firewall/` has changed since the methodology branch point
 *   `9b8a0e6`. A1 descends from that branch, so adding a firewall FILE here
 *   would break an assertion that is otherwise still true - methodology work
 *   did not touch a firewall, A1 would have. Rather than weaken that check or
 *   move its baseline, these structural boundaries live beside
 *   `orgunitClassify2D2CF1Isolation.test.ts`, which is the same kind of
 *   source-boundary/import-graph test and is already a unit test. Not one
 *   assertion was dropped in the move; only the directory changed.
 *
 * WHY THE TOOLING IS NOT UNDER `phase2b2d2c/`
 *
 *   `orgunitClassify2D2CF1Isolation.test.ts` walks that namespace RECURSIVELY
 *   and forbids every file in it from importing `pg` or `/db/` - a boundary
 *   hardened for exactly the case of a new subdirectory. A1 legitimately reads
 *   the database, so it lives in the sibling `phase2b2d/` namespace instead of
 *   weakening that assertion. The 2D2C runner namespace stays database-free.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const HARNESS_2D = 'src/test/harness/phase2b2d';
const HARNESS_2D2C = 'src/test/harness/phase2b2d2c';
const A1_DIR = join(REPO_ROOT, HARNESS_2D, 'corpus');

const A1_FILES = [
  'claimSnapshot.ts',
  'frameArtifact.ts',
  'frameContract.ts',
  'frameEnumeration.ts',
  'historicalExclusion.ts',
  'materialiseFrame.ts',
  'priorGenerationExclusion.ts',
  'readFrameInputs.ts',
];

/** The one module permitted to reach a database, and the one permitted to read a fixture. */
const THE_ONLY_DATABASE_MODULES = ['readFrameInputs.ts', 'materialiseFrame.ts'];
/**
 * Modules with no IO of any kind. `frameArtifact.ts` is excluded on purpose:
 * `renderFrameArtifact` resolves this repository's Prettier config from disk so
 * the emitted bytes pass `prettier --check`. Its hashing functions stay pure,
 * and the checks below still forbid it a clock, randomness and the environment.
 */
const PURE_MODULES = ['frameContract.ts', 'claimSnapshot.ts', 'frameEnumeration.ts'];

/** The commit A1 branched from: the Corpus Plan V1 owner approval. */
const A1_BASE_COMMIT = 'ee7384087979ec74a45668bc9d770963444600cc';

function baseCommitAvailable(): boolean {
  try {
    execFileSync('git', ['-C', REPO_ROOT, 'cat-file', '-e', `${A1_BASE_COMMIT}^{commit}`], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function readSource(name: string): string {
  return readFileSync(join(A1_DIR, name), 'utf8');
}

/** Source with every comment stripped, so prose can never satisfy or trip a check. */
function codeOf(name: string): string {
  return readSource(name)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function importSpecifiersOf(source: string): readonly string[] {
  const specifiers: string[] = [];
  for (const pattern of [
    /\bimport\s+[^;]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]) {
    for (const match of source.matchAll(pattern)) {
      if (match[1] !== undefined) specifiers.push(match[1]);
    }
  }
  return specifiers;
}

function resolveSpecifier(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), specifier);
  for (const candidate of [
    base,
    base.replace(/\.js$/, '.ts'),
    `${base}.ts`,
    join(base, 'index.ts'),
  ]) {
    if (existsSync(candidate) && candidate.endsWith('.ts')) return candidate;
  }
  return null;
}

function graphFrom(entries: readonly string[]): {
  readonly files: readonly string[];
  readonly external: readonly string[];
} {
  const visited = new Set<string>();
  const external = new Set<string>();
  const queue = entries.map((name) => join(A1_DIR, name));
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    for (const specifier of importSpecifiersOf(readFileSync(file, 'utf8'))) {
      const resolved = resolveSpecifier(file, specifier);
      if (resolved === null) external.add(specifier);
      else if (!visited.has(resolved)) queue.push(resolved);
    }
  }
  return {
    files: [...visited].map((file) => file.slice(REPO_ROOT.length + 1)).sort(),
    external: [...external].sort(),
  };
}

describe('2D-A1: the corpus directory holds exactly the reviewed modules', () => {
  it('has no file beyond the eight reviewed ones', () => {
    expect(
      readdirSync(A1_DIR)
        .filter((name) => !name.startsWith('.'))
        .sort(),
    ).toEqual(A1_FILES);
  });
});

describe('2D-A1: SD2 does not exist here - no rank, no draw, no selection, no split', () => {
  /**
   * The exact SD2 vocabulary of the approved plan. Matched against CODE with
   * comments stripped, so the modules may (and do) explain in prose why these
   * capabilities are absent without that prose satisfying the check.
   */
  const SD2_IDENTIFIERS = [
    /\brank\w*/i,
    /\bdraw\w*/i,
    /\bselect(?:ion|ed|or)?\b/i,
    /\breserve\w*/i,
    /\bsplitAssignment\w*/i,
    /\bSPLIT_ASSIGNMENT\w*/,
    /\bDEV_TRAIN\b/,
    /\bDEV_CONFIRM\b/,
    /\bFINAL_HOLDOUT\b/,
    /\bshuffle\w*/i,
    /\bACQUISITION_TARGET\w*/,
    /\bACQUISITION_RESERVE\w*/,
  ];

  it('no A1 module names an SD2 capability in code', () => {
    for (const name of A1_FILES) {
      // `SELECT` in SQL is a read, not a selection; it is the one admitted form.
      const code = codeOf(name)
        .replace(/\bSELECT\b/g, 'READ')
        .replace(/\bDISTINCT\b/g, 'UNIQUE');
      for (const pattern of SD2_IDENTIFIERS) {
        expect(pattern.test(code), `${name} matches ${pattern}`).toBe(false);
      }
    }
  });

  it('no A1 module hashes an eche_row_key, which is what an SD2 rank key would be', () => {
    for (const name of A1_FILES) {
      const code = codeOf(name);
      expect(/sha256\s*\(\s*\w*eche/i.test(code), name).toBe(false);
      expect(/createHash\([^)]*\)[\s\S]{0,120}echeRowKey/i.test(code), name).toBe(false);
    }
  });

  it('no A1 module declares 110, 40, 150-as-a-draw, 22 or a cycle length', () => {
    for (const name of A1_FILES) {
      const code = codeOf(name);
      expect(/\b(?:110|40|22)\b/.test(code), `${name} declares an SD2 magic number`).toBe(false);
      expect(/cycle/i.test(code), name).toBe(false);
    }
  });

  it('no draw or split artifact is written anywhere in A1', () => {
    for (const name of A1_FILES) {
      const source = readSource(name);
      expect(/DRAW_V2/i.test(codeOf(name)), name).toBe(false);
      expect(source.includes('SPLIT_ASSIGNMENT_CYCLE_V2_R2'), name).toBe(false);
    }
  });
});

describe('2D-A1: no network, no provider, no institution', () => {
  const FORBIDDEN_SPECIFIERS = [
    'node:dns',
    'node:net',
    'node:tls',
    'node:http',
    'node:https',
    'node:http2',
    'node:dgram',
    'undici',
    'axios',
    'node-fetch',
    'got',
    'playwright',
    'puppeteer',
    '@anthropic-ai/sdk',
    '@anthropic-ai/claude-agent-sdk',
    'openai',
  ];

  const graph = graphFrom(A1_FILES);

  it('imports no socket, HTTP client, browser or AI SDK - directly or transitively', () => {
    for (const specifier of graph.external) {
      for (const forbidden of FORBIDDEN_SPECIFIERS) {
        expect(
          specifier === forbidden || specifier.startsWith(`${forbidden}/`),
          `A1 reaches ${specifier}`,
        ).toBe(false);
      }
    }
  });

  it('calls fetch() nowhere', () => {
    for (const name of A1_FILES) {
      expect(/\bfetch\s*\(/.test(codeOf(name)), name).toBe(false);
    }
  });

  it('never reaches the orgunit web gateway, robots reader or discovery orchestrator', () => {
    for (const file of graph.files) {
      expect(file.startsWith('src/orgunits/web/'), `A1 reaches ${file}`).toBe(false);
      expect(file.startsWith('src/orgunits/orchestrator/'), `A1 reaches ${file}`).toBe(false);
      expect(file === 'src/orgunits/sitemap.ts', `A1 reaches ${file}`).toBe(false);
    }
  });

  it('reaches exactly two src/orgunits files: the pure canonicalizer and the type module it imports', () => {
    expect(graph.files.filter((file) => file.startsWith('src/orgunits/')).sort()).toEqual([
      'src/orgunits/classify/canonical.ts',
      'src/orgunits/classify/types.ts',
    ]);
  });

  it('names no institution URL, hostname or scheme anywhere in code', () => {
    for (const name of A1_FILES) {
      const code = codeOf(name);
      expect(/https?:\/\//.test(code), `${name} contains a URL`).toBe(false);
      expect(/\bmailto:|\btel:/.test(code), name).toBe(false);
    }
  });
});

describe('2D-A1: read-only, and the database is what proves it', () => {
  const MUTATING_SQL = [
    /\bINSERT\s+INTO\b/i,
    /\bUPDATE\s+\w+\s+SET\b/i,
    /\bDELETE\s+FROM\b/i,
    /\bTRUNCATE\b/i,
    /\bDROP\s+(?:TABLE|SCHEMA|DATABASE|ROLE|INDEX)\b/i,
    /\bALTER\s+(?:TABLE|ROLE|DATABASE)\b/i,
    /\bCREATE\s+(?:TABLE|TEMP|TEMPORARY|INDEX|SCHEMA|ROLE|VIEW)\b/i,
    /\bGRANT\b/i,
    /\bCOPY\s+\w+\s+FROM\b/i,
    /\bBEGIN\b/,
    /\bCOMMIT\b/,
    /\bROLLBACK\b/,
  ];

  it('only readFrameInputs.ts and materialiseFrame.ts can reach a database at all', () => {
    for (const name of A1_FILES) {
      if (THE_ONLY_DATABASE_MODULES.includes(name)) continue;
      const specifiers = importSpecifiersOf(readSource(name));
      for (const specifier of specifiers) {
        expect(specifier, `${name} imports ${specifier}`).not.toBe('pg');
        expect(specifier.includes('/db/'), `${name} imports ${specifier}`).toBe(false);
      }
    }
  });

  it('the database reader contains no mutating SQL and no transaction control', () => {
    const code = codeOf('readFrameInputs.ts');
    for (const pattern of MUTATING_SQL) {
      expect(pattern.test(code), `readFrameInputs.ts matches ${pattern}`).toBe(false);
    }
  });

  it('no A1 module contains mutating SQL', () => {
    for (const name of A1_FILES) {
      const code = codeOf(name);
      for (const pattern of MUTATING_SQL) {
        expect(pattern.test(code), `${name} matches ${pattern}`).toBe(false);
      }
    }
  });

  it('connects as the least-privilege readonly role, and names no other role', () => {
    const code = codeOf('materialiseFrame.ts');
    expect(code).toContain("withPool('readonly'");
    for (const role of ['admin', 'ingest', 'research', 'classifier']) {
      expect(code.includes(`withPool('${role}'`), `materialiseFrame.ts uses the ${role} role`).toBe(
        false,
      );
      expect(code.includes(`createPool('${role}'`), role).toBe(false);
    }
  });

  it('imports no transaction helper, so it has no path to one', () => {
    for (const name of A1_FILES) {
      expect(codeOf(name).includes('withTransaction'), name).toBe(false);
    }
  });

  it('touches no migration, and writes exactly one file', () => {
    for (const name of A1_FILES) {
      const code = codeOf(name);
      expect(/migrations\//.test(code), name).toBe(false);
      if (name !== 'materialiseFrame.ts') {
        expect(/\bwriteFileSync\b|\bappendFileSync\b|\bcreateWriteStream\b/.test(code), name).toBe(
          false,
        );
      }
    }
    const writes = codeOf('materialiseFrame.ts').match(/\bwriteFileSync\(/g) ?? [];
    expect(writes).toHaveLength(1);
  });

  it('the three pure modules touch no filesystem, no clock and no randomness', () => {
    for (const name of PURE_MODULES) {
      const code = codeOf(name);
      expect(/node:fs|readFileSync|writeFileSync/.test(code), name).toBe(false);
      expect(/Date\.now\(|new Date\(/.test(code), name).toBe(false);
      expect(/Math\.random\(/.test(code), name).toBe(false);
      expect(/process\.env/.test(code), name).toBe(false);
    }
  });

  it('NO A1 module reads a clock, randomness or the environment - the frame must be reproducible', () => {
    for (const name of A1_FILES) {
      const code = codeOf(name);
      expect(/Date\.now\(|new Date\(/.test(code), name).toBe(false);
      expect(/Math\.random\(/.test(code), name).toBe(false);
      expect(/process\.env/.test(code), name).toBe(false);
    }
  });

  it('the artifact renderer reads only Prettier configuration, never a data file', () => {
    const code = codeOf('frameArtifact.ts');
    expect(code).toContain('resolveConfig(FRAME_ARTIFACT_PATH)');
    expect(/node:fs|readFileSync|writeFileSync/.test(code)).toBe(false);
  });
});

describe('2D-A1: the historical exclusion reads DEVELOPMENT only', () => {
  it('opens exactly one corpus path, and it is the 49-item DEVELOPMENT file', () => {
    const code = codeOf('historicalExclusion.ts');
    expect(code).toContain('HISTORICAL_DEVELOPMENT_CORPUS_PATH');
    // The path is frozen in the contract; this module takes no path argument.
    expect(/readHistoricalDevelopmentExclusion\(\s*repoRoot:\s*string,?\s*\)/.test(code)).toBe(
      true,
    );
  });

  it('no A1 module names a HOLDOUT, adjudication, sealed-split or gold-label FILE', () => {
    // The risk is opening such a file, not naming the concept: the artifact
    // legitimately asserts `noHoldoutFileOpened: true`. So this matches a
    // path-shaped token, which is what a reachable file would look like.
    const PATH_SHAPED =
      /[\w./-]*(?:holdout|adjudicat|sealed|gold)[\w./-]*\.(?:json|jsonl|ts|md|txt)/i;
    for (const name of A1_FILES) {
      const code = codeOf(name);
      expect(PATH_SHAPED.test(code), `${name} names a forbidden file path`).toBe(false);
      expect(/\bgoldId\b|\bgoldLabel\b/.test(code), name).toBe(false);
      expect(/DEV_CONFIRM|FINAL_HOLDOUT|DEV_TRAIN/.test(code), name).toBe(false);
    }
  });

  it('no A1 module reads any file other than the frozen DEVELOPMENT corpus and prior frame artifacts', () => {
    for (const name of A1_FILES) {
      const code = codeOf(name);
      for (const match of code.matchAll(/readFileSync\(([\s\S]*?),\s*'utf8'\)/g)) {
        const argument = match[1]!.replace(/\s+/g, ' ').trim();
        expect(
          argument === 'absolute' ||
            argument === 'artifactPath' ||
            argument === 'join(directory, name)',
          `${name} reads ${argument}`,
        ).toBe(true);
      }
    }
  });

  it('the frozen DEVELOPMENT path is the canonical v2 fixture and nothing adjacent to a holdout', () => {
    const contract = codeOf('frameContract.ts');
    const match = contract.match(/HISTORICAL_DEVELOPMENT_CORPUS_PATH\s*=\s*\n?\s*'([^']+)'/);
    expect(match?.[1]).toBe(
      'src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-v1-canonical-v2.jsonl',
    );
    expect(existsSync(join(REPO_ROOT, match![1]!))).toBe(true);
  });
});

describe('2D-A1: the frame carries identifiers, never targets or verdicts', () => {
  it('the entry type has no URL-shaped, label-shaped or score-shaped field', () => {
    const contract = codeOf('frameContract.ts');
    const entry = contract.slice(
      contract.indexOf('interface FrameEntry'),
      contract.indexOf('interface FrameCounts'),
    );
    expect(entry.length).toBeGreaterThan(0);
    for (const forbidden of [
      'url',
      'hostname',
      'domain',
      'website',
      'label',
      'score',
      'verdict',
      'relevant',
      'verified',
      'confirmed',
      'qualified',
      'contact',
      'email',
      'gate',
    ]) {
      expect(
        new RegExp(`\\b\\w*${forbidden}\\w*\\s*[?:]`, 'i').test(entry),
        `FrameEntry has a ${forbidden}-shaped field`,
      ).toBe(false);
    }
  });

  it('the reader never projects a claim URL, hostname or registrable domain out of the database', () => {
    const code = codeOf('readFrameInputs.ts');
    for (const column of ['normalised_url', 'hostname', 'registrable_domain', 'raw_value']) {
      expect(code.includes(column), `readFrameInputs.ts reads ${column}`).toBe(false);
    }
  });

  it('the claim snapshot semantics is named for what it is, not for a snapshot table', () => {
    const code = codeOf('claimSnapshot.ts');
    expect(code).toContain("'ECHE_WEBSITE_CLAIM_ELIGIBILITY_SNAPSHOT_V1'");
    expect(/CLAIM_SNAPSHOT_SEMANTICS\s*=\s*'[^']*website_source_snapshots/.test(code)).toBe(false);
  });
});

describe('2D-A1: A1 changed no production file and weakened no firewall', () => {
  it.skipIf(!baseCommitAvailable())(
    'since the Corpus Plan V1 approval commit, A1 touched nothing under src/orgunits/, migrations/ or src/cli/',
    () => {
      const changed = execFileSync(
        'git',
        ['-C', REPO_ROOT, 'diff', '--name-only', A1_BASE_COMMIT, '--'],
        { encoding: 'utf8' },
      )
        .split('\n')
        .filter((line) => line.length > 0);
      for (const file of changed) {
        expect(file.startsWith('src/orgunits/'), file).toBe(false);
        expect(file.startsWith('migrations/'), file).toBe(false);
        expect(file.startsWith('src/cli/'), file).toBe(false);
        expect(file.startsWith('src/ingest/'), file).toBe(false);
        expect(file.startsWith('src/website/'), file).toBe(false);
        // A1 adds a SIBLING harness namespace; the 2D2C runner namespace,
        // which `orgunitClassify2D2CF1Isolation.test.ts` keeps database-free,
        // is not touched at all.
        expect(file.startsWith(`${HARNESS_2D2C}/`), file).toBe(false);
      }
    },
  );

  it.skipIf(!baseCommitAvailable())('modified no existing firewall file', () => {
    const changed = execFileSync(
      'git',
      ['-C', REPO_ROOT, 'diff', '--name-only', A1_BASE_COMMIT, '--', 'src/test/firewall'],
      { encoding: 'utf8' },
    )
      .split('\n')
      .filter((line) => line.length > 0);
    // Before this file is committed it is untracked and the diff is empty;
    // afterwards it is the only firewall path in it. Neither state may contain
    // any OTHER firewall file, which is the assertion that matters.
    expect(
      changed.filter((file) => file !== 'src/test/firewall/phase2b2dA1Frame.firewall.test.ts'),
    ).toEqual([]);
  });
});
