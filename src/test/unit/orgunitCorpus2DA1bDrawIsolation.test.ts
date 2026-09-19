/**
 * PHASE 2B-2D A1b ISOLATION — THE DRAW SELECTS, AND DOES NOTHING ELSE.
 *
 * By walking the real import graph, module specifiers and source text of
 * `src/test/harness/phase2b2d/draw/`, this file proves:
 *
 *   - A1b holds exactly the reviewed modules, and A1's `corpus/` directory is
 *     untouched - still exactly its eight files, still with no draw capability
 *     in it;
 *   - no module opens a socket, calls fetch(), or imports a provider, an AI
 *     SDK, a browser or a search client;
 *   - NO module reaches a database - `pg`, a `/db/` helper, a role name or a
 *     SQL verb - because A1b's authorisation sets `databaseReadAuthorised` to
 *     false, so A1's "one reader, readonly role" allowance does not apply here
 *     at all;
 *   - no module derives an acquisition target from a root authority: no URL,
 *     hostname, registrable domain, sitemap or robots path, and no import of
 *     the orgunit web, orchestrator or sitemap surface;
 *   - no module opens a HOLDOUT, adjudication, gold or historical evaluation
 *     file, and A1b reads exactly ONE path - the frozen frame;
 *   - no module reads a clock, randomness or the environment, so the draw is
 *     reproducible;
 *   - exactly one file is written, and it is the draw artifact;
 *   - A1b creates no replacement ledger and no split-scoped manifest;
 *   - A1b adds no file under src/orgunits/, touches no migration, no CLI and
 *     no firewall.
 *
 * WHY THIS LIVES IN src/test/unit/ AND NOT src/test/firewall/
 *
 *   `orgunitClassifyAcceptanceMethodologyV2R2.test.ts` asserts that NO file
 *   under `src/test/firewall/` has changed since the methodology branch point.
 *   A1b descends from A1, which descends from that point, so adding a firewall
 *   FILE here would break an assertion that is otherwise still true. A1 made
 *   exactly this call for exactly this reason; A1b follows it rather than
 *   moving a baseline.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const HARNESS_2D = 'src/test/harness/phase2b2d';
const HARNESS_2D2C = 'src/test/harness/phase2b2d2c';
const A1B_DIR = join(REPO_ROOT, HARNESS_2D, 'draw');
const A1_DIR = join(REPO_ROOT, HARNESS_2D, 'corpus');

const A1B_FILES = [
  'deterministicDraw.ts',
  'drawArtifact.ts',
  'drawContract.ts',
  'materialiseDraw.ts',
  'readFrozenFrame.ts',
];

/** The eight A1 modules, unchanged by A1b. */
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

/**
 * Modules with no IO of any kind. `drawArtifact.ts` is excluded on purpose:
 * `renderDrawArtifact` resolves this repository's Prettier config from disk so
 * the emitted bytes pass `prettier --check`. Its hashing functions stay pure,
 * and the checks below still forbid it a clock, randomness and the environment.
 */
const PURE_MODULES = ['drawContract.ts', 'deterministicDraw.ts'];

/** The ONE module permitted to touch the filesystem for data. */
const THE_ONLY_FILE_MODULES = ['readFrozenFrame.ts', 'materialiseDraw.ts'];

/** The commit A1b branched from: the A1 frame materialisation. */
const A1B_BASE_COMMIT = 'c64fad3474499d392d316e35c720310c76e9405b';

function baseCommitAvailable(): boolean {
  try {
    execFileSync('git', ['-C', REPO_ROOT, 'cat-file', '-e', `${A1B_BASE_COMMIT}^{commit}`], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function readSource(name: string): string {
  return readFileSync(join(A1B_DIR, name), 'utf8');
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
  const queue = entries.map((name) => join(A1B_DIR, name));
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

const GRAPH = graphFrom(A1B_FILES);

describe('2D-A1b: the draw directory holds exactly the reviewed modules', () => {
  it('has no file beyond the five reviewed ones', () => {
    expect(
      readdirSync(A1B_DIR)
        .filter((name) => !name.startsWith('.'))
        .sort(),
    ).toEqual(A1B_FILES);
  });

  it('leaves A1’s corpus directory at exactly its eight modules', () => {
    expect(
      readdirSync(A1_DIR)
        .filter((name) => !name.startsWith('.'))
        .sort(),
    ).toEqual(A1_FILES);
  });

  it('adds no draw capability to A1 - the SD2 absence there is still true', () => {
    for (const name of A1_FILES) {
      const code = readFileSync(join(A1_DIR, name), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/\bSELECT\b/g, 'READ');
      expect(/\brank\w*/i.test(code), `${name} gained a rank capability`).toBe(false);
      expect(/\bdraw\w*/i.test(code), `${name} gained a draw capability`).toBe(false);
      expect(/\bSPLIT_ASSIGNMENT\w*/.test(code), name).toBe(false);
    }
  });

  it('imports nothing from A1’s corpus directory - the frame is read as BYTES, not as code', () => {
    for (const file of GRAPH.files) {
      expect(file.startsWith(`${HARNESS_2D}/corpus/`), `A1b reaches ${file}`).toBe(false);
    }
  });
});

describe('2D-A1b: no network, no provider, no institution', () => {
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

  it('imports no socket, HTTP client, browser or AI SDK - directly or transitively', () => {
    for (const specifier of GRAPH.external) {
      for (const forbidden of FORBIDDEN_SPECIFIERS) {
        expect(
          specifier === forbidden || specifier.startsWith(`${forbidden}/`),
          `A1b reaches ${specifier}`,
        ).toBe(false);
      }
    }
  });

  it('reaches exactly these external modules and no others', () => {
    expect(GRAPH.external).toEqual(['node:crypto', 'node:fs', 'node:path', 'node:url', 'prettier']);
  });

  it('calls fetch() nowhere', () => {
    for (const name of A1B_FILES) {
      expect(/\bfetch\s*\(/.test(codeOf(name)), name).toBe(false);
    }
  });

  it('never reaches the orgunit web gateway, robots reader, sitemap reader or orchestrator', () => {
    for (const file of GRAPH.files) {
      expect(file.startsWith('src/orgunits/web/'), `A1b reaches ${file}`).toBe(false);
      expect(file.startsWith('src/orgunits/orchestrator/'), `A1b reaches ${file}`).toBe(false);
      expect(file === 'src/orgunits/sitemap.ts', `A1b reaches ${file}`).toBe(false);
    }
  });

  it('reaches exactly two src/orgunits files: the pure canonicalizer and the type module it imports', () => {
    expect(GRAPH.files.filter((file) => file.startsWith('src/orgunits/')).sort()).toEqual([
      'src/orgunits/classify/canonical.ts',
      'src/orgunits/classify/types.ts',
    ]);
  });

  it('names no URL, scheme, mail or telephone target anywhere in code', () => {
    for (const name of A1B_FILES) {
      const code = codeOf(name);
      expect(/https?:\/\//.test(code), `${name} contains a URL`).toBe(false);
      expect(/\bmailto:|\btel:/.test(code), name).toBe(false);
    }
  });
});

describe('2D-A1b: NO database at all - A1’s readonly allowance does not extend here', () => {
  const SQL_VERBS = [
    /\bSELECT\b/i,
    /\bINSERT\s+INTO\b/i,
    /\bUPDATE\s+\w+\s+SET\b/i,
    /\bDELETE\s+FROM\b/i,
    /\bTRUNCATE\b/i,
    /\bDROP\s+(?:TABLE|SCHEMA|DATABASE|ROLE|INDEX)\b/i,
    /\bALTER\s+(?:TABLE|ROLE|DATABASE)\b/i,
    /\bCREATE\s+(?:TABLE|TEMP|TEMPORARY|INDEX|SCHEMA|ROLE|VIEW)\b/i,
    /\bGRANT\b/i,
  ];

  it('no A1b module imports pg or a db helper', () => {
    for (const name of A1B_FILES) {
      for (const specifier of importSpecifiersOf(readSource(name))) {
        expect(specifier, `${name} imports ${specifier}`).not.toBe('pg');
        expect(specifier.includes('/db/'), `${name} imports ${specifier}`).toBe(false);
      }
    }
  });

  it('nothing in the whole import graph reaches src/db/', () => {
    for (const file of GRAPH.files) {
      expect(file.startsWith('src/db/'), `A1b reaches ${file}`).toBe(false);
    }
  });

  it('no A1b module contains a SQL verb of any kind, read or write', () => {
    for (const name of A1B_FILES) {
      const code = codeOf(name);
      for (const pattern of SQL_VERBS) {
        expect(pattern.test(code), `${name} matches ${pattern}`).toBe(false);
      }
    }
  });

  it('no A1b module names a database role or a pool helper', () => {
    for (const name of A1B_FILES) {
      const code = codeOf(name);
      for (const role of ['admin', 'ingest', 'research', 'classifier', 'readonly']) {
        expect(code.includes(`withPool('${role}'`), `${name} uses the ${role} role`).toBe(false);
        expect(code.includes(`createPool('${role}'`), name).toBe(false);
      }
      expect(code.includes('withTransaction'), name).toBe(false);
      expect(/\bwithPool\b|\bcreatePool\b|\bnew Pool\b/.test(code), name).toBe(false);
    }
  });
});

describe('2D-A1b: one file read, one file written, and nothing else touched', () => {
  it('only readFrozenFrame.ts and materialiseDraw.ts touch the filesystem', () => {
    for (const name of A1B_FILES) {
      if (THE_ONLY_FILE_MODULES.includes(name)) continue;
      const code = codeOf(name);
      expect(/node:fs|readFileSync|writeFileSync/.test(code), name).toBe(false);
    }
  });

  it('writes exactly one file, and it is the draw artifact', () => {
    const writes = codeOf('materialiseDraw.ts').match(/\bwriteFileSync\(/g) ?? [];
    expect(writes).toHaveLength(1);
    expect(codeOf('materialiseDraw.ts')).toContain('join(repoRoot, DRAW_ARTIFACT_PATH)');
    for (const name of A1B_FILES) {
      if (name === 'materialiseDraw.ts') continue;
      expect(
        /\bwriteFileSync\b|\bappendFileSync\b|\bcreateWriteStream\b/.test(codeOf(name)),
        name,
      ).toBe(false);
    }
  });

  it('reads exactly one data path, and it is the frozen frame', () => {
    const reader = codeOf('readFrozenFrame.ts');
    expect(reader).toContain('join(repoRoot, FRAME_ARTIFACT_PATH)');
    const reads = reader.match(/readFileSync\(/g) ?? [];
    expect(reads).toHaveLength(1);
    // The entry point reads only what it just wrote, for verification.
    const entryReads = codeOf('materialiseDraw.ts').match(/readFileSync\(([^)]*)\)/g) ?? [];
    expect(entryReads).toEqual(["readFileSync(artifactPath, 'utf8')"]);
  });

  it('the draw artifact path is the one the frozen plan commits to git', () => {
    const contract = codeOf('drawContract.ts');
    const match = contract.match(/DRAW_ARTIFACT_PATH\s*=\s*\n?\s*'([^']+)'/);
    expect(match?.[1]).toBe('docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_DRAW_V2_GEN1.json');
  });

  it('NO A1b module reads a clock, randomness or the environment', () => {
    for (const name of A1B_FILES) {
      const code = codeOf(name);
      expect(/Date\.now\(|new Date\(/.test(code), name).toBe(false);
      expect(/Math\.random\(/.test(code), name).toBe(false);
      expect(/process\.env/.test(code), name).toBe(false);
      expect(/randomUUID|randomBytes/.test(code), name).toBe(false);
    }
  });

  it('the two pure modules touch no filesystem at all', () => {
    for (const name of PURE_MODULES) {
      const code = codeOf(name);
      expect(/node:fs|readFileSync|writeFileSync|resolveConfig/.test(code), name).toBe(false);
    }
  });

  it('the artifact renderer reads only Prettier configuration, never a data file', () => {
    const code = codeOf('drawArtifact.ts');
    expect(code).toContain('resolveConfig(DRAW_ARTIFACT_PATH)');
    expect(/node:fs|readFileSync|writeFileSync/.test(code)).toBe(false);
  });
});

describe('2D-A1b: no acquisition target is derived from an authority identifier', () => {
  it('no module names a URL-, host- or crawl-shaped identifier in code', () => {
    for (const name of A1B_FILES) {
      const code = codeOf(name);
      for (const forbidden of [
        'canonicalDomain',
        'registrableDomain',
        'hostname',
        'websiteUrl',
        'rootUrl',
        'acquisitionUrl',
        'sitemap',
        'robots',
        'normalisedUrl',
        'rawValue',
      ]) {
        expect(new RegExp(`\\b${forbidden}\\b`, 'i').test(code), `${name} names ${forbidden}`).toBe(
          false,
        );
      }
    }
  });

  it('no module imports the website parser, which is the only thing that could produce a domain', () => {
    for (const file of GRAPH.files) {
      expect(file.startsWith('src/website/'), `A1b reaches ${file}`).toBe(false);
      expect(file.startsWith('src/ingest/'), `A1b reaches ${file}`).toBe(false);
    }
    for (const specifier of GRAPH.external) {
      expect(specifier).not.toBe('tldts');
    }
  });

  it('the entry types carry an authority identifier and nothing requestable', () => {
    const contract = codeOf('drawContract.ts');
    for (const typeName of ['SelectionEntry', 'ReserveEntry']) {
      const start = contract.indexOf(`interface ${typeName}`);
      expect(start, typeName).toBeGreaterThan(-1);
      const body = contract.slice(start, contract.indexOf('}', start));
      for (const forbidden of [
        'url',
        'hostname',
        'domain',
        'website',
        'title',
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
        'page',
        'gold',
      ]) {
        expect(
          new RegExp(`\\b\\w*${forbidden}\\w*\\s*[?:]`, 'i').test(body),
          `${typeName} has a ${forbidden}-shaped field`,
        ).toBe(false);
      }
    }
  });
});

describe('2D-A1b: a reserve entry is structurally incapable of carrying a replacement', () => {
  it('ReserveEntry declares no split, no selectionIndex and no replacement field', () => {
    const contract = codeOf('drawContract.ts');
    const start = contract.indexOf('interface ReserveEntry');
    const body = contract.slice(start, contract.indexOf('}', start));
    expect(/\bsplit\s*[?:]/.test(body)).toBe(false);
    expect(/\bselectionIndex\s*[?:]/.test(body)).toBe(false);
    expect(/\breplacement\w*\s*[?:]/.test(body)).toBe(false);
    expect(/\binherited\w*\s*[?:]/.test(body)).toBe(false);
  });

  it('no module creates or writes a replacement ledger', () => {
    for (const name of A1B_FILES) {
      const code = codeOf(name);
      expect(/REPLACEMENT_LEDGER/i.test(code), name).toBe(false);
      expect(/ACQUISITION_SUCCESSFUL|ACQUISITION_UNSUCCESSFUL/.test(code), name).toBe(false);
      expect(/\breplacedEcheRowKey\b|\breplacementEcheRowKey\b/.test(code), name).toBe(false);
    }
  });

  it('no module writes a split-scoped manifest', () => {
    for (const name of A1B_FILES) {
      const code = codeOf(name);
      expect(
        /MANIFEST_DEV_TRAIN|MANIFEST_DEV_CONFIRM|MANIFEST_FINAL_HOLDOUT/.test(code),
        name,
      ).toBe(false);
      expect(/CORPUS_FREEZE_V2/.test(code), name).toBe(false);
    }
  });

  it('the split vocabulary appears ONLY as the frozen cycle, never as a file or a directory', () => {
    for (const name of A1B_FILES) {
      const code = codeOf(name);
      // DEV_CONFIRM / FINAL_HOLDOUT are legitimate cycle VALUES; what is
      // forbidden is one of them shaped as a path a reader could open.
      const PATH_SHAPED =
        /[\w./-]*(?:DEV_CONFIRM|FINAL_HOLDOUT|DEV_TRAIN|holdout|sealed|gold|adjudicat)[\w./-]*\.(?:json|jsonl|ts|md|txt)/i;
      expect(PATH_SHAPED.test(code), `${name} names a split-scoped or sealed file path`).toBe(
        false,
      );
    }
  });
});

describe('2D-A1b: no HOLDOUT, adjudication, gold or historical evaluation file is opened', () => {
  it('no module names a historical evaluation fixture', () => {
    for (const name of A1B_FILES) {
      const code = codeOf(name);
      expect(/src\/test\/fixtures/.test(code), `${name} names a fixture path`).toBe(false);
      expect(/orgunit-classifier-sonnet-acceptance/.test(code), name).toBe(false);
      expect(/\bgoldId\b|\bgoldLabel\b|\bgoldClass\b/.test(code), name).toBe(false);
    }
  });

  it('no module names a page, item, document hash or classifier output', () => {
    for (const name of A1B_FILES) {
      const code = codeOf(name);
      for (const forbidden of [
        'pageId',
        'itemId',
        'documentHash',
        'classifierOutput',
        'classification',
        'predictedClass',
        'confidence',
        'promptVersion',
      ]) {
        expect(new RegExp(`\\b${forbidden}\\b`, 'i').test(code), `${name} names ${forbidden}`).toBe(
          false,
        );
      }
    }
  });

  it('A1b reads the frame artifact and NOTHING else - every readFileSync argument is accounted for', () => {
    for (const name of A1B_FILES) {
      for (const match of codeOf(name).matchAll(/readFileSync\(([\s\S]*?),\s*'utf8'\)/g)) {
        const argument = match[1]!.replace(/\s+/g, ' ').trim();
        expect(
          argument === 'join(repoRoot, FRAME_ARTIFACT_PATH)' || argument === 'artifactPath',
          `${name} reads ${argument}`,
        ).toBe(true);
      }
    }
  });
});

describe('2D-A1b: the frozen constants are declared by value, so a drift is visible', () => {
  it('declares 110, 40 and 22 exactly once each, as named constants', () => {
    const contract = codeOf('drawContract.ts');
    expect(contract).toMatch(/ACQUISITION_TARGET_ORGANISATIONS\s*=\s*110/);
    expect(contract).toMatch(/ACQUISITION_RESERVE_ORGANISATIONS\s*=\s*40/);
    expect(contract).toMatch(/SPLIT_ASSIGNMENT_CYCLE_LENGTH\s*=\s*22/);
    expect(contract).toMatch(/SPLIT_ASSIGNMENT_CYCLE_REPETITIONS\s*=\s*5/);
    expect(contract).toMatch(/EXPECTED_ELIGIBLE_ORGANISATIONS\s*=\s*5820/);
  });

  it('no other module BINDS an SD2 magic number of its own', () => {
    // A binding, not any occurrence: `drawArtifact.ts` legitimately QUOTES
    // SD2's own rule text, which contains "= 110 entries". Quoting the frozen
    // rule into the artifact is the point; re-deriving its numbers is what
    // must not happen, and only a binding could do that.
    const BINDS_A_LITERAL =
      /\b(?:const|let|var)\s+\w+(?:\s*:\s*number)?\s*=\s*(?:110|40|22|5820)\b/;
    for (const name of A1B_FILES) {
      if (name === 'drawContract.ts') continue;
      expect(BINDS_A_LITERAL.test(codeOf(name)), `${name} binds an SD2 magic number`).toBe(false);
    }
  });

  it('every SD2 number the other modules use arrives from the contract by name', () => {
    const draw = codeOf('deterministicDraw.ts');
    expect(draw).toContain('ACQUISITION_TARGET_ORGANISATIONS');
    expect(draw).toContain('ACQUISITION_RESERVE_ORGANISATIONS');
    expect(draw).toContain('SPLIT_ASSIGNMENT_CYCLE_V2_R2');
    // The 150 boundary is computed from the two named constants, never typed.
    expect(draw).toContain('ACQUISITION_TARGET_ORGANISATIONS + ACQUISITION_RESERVE_ORGANISATIONS');
    expect(/\b150\b/.test(draw), 'deterministicDraw.ts types 150 as a literal').toBe(false);
  });

  it('binds the frame by both hashes and its byte length', () => {
    const contract = codeOf('drawContract.ts');
    expect(contract).toContain('302dccd8250919213dc329d0b84093f04ff3cc68a1cafe07f844044f94cae650');
    expect(contract).toContain('c16b31c9c18e368bbf99e2d45fc2de1a284dd42c9a483ed34c30187e77b18878');
    expect(contract).toMatch(/FRAME_ARTIFACT_BYTES\s*=\s*3554080/);
  });

  it('binds the owner authorisation that permits this step at all, by path AND by hash', () => {
    const contract = codeOf('drawContract.ts');
    expect(contract).toContain('AUTHORISE_PHASE_2B_2D_A1B_DETERMINISTIC_DRAW_V1');

    const recordPath = join(
      REPO_ROOT,
      'docs/evaluation/PHASE_2B_2D_METHOD_V2_A1B_DRAW_AUTHORITY_RECORD_V1.json',
    );
    expect(existsSync(recordPath)).toBe(true);
    const bytes = readFileSync(recordPath, 'utf8');
    expect(createHash('sha256').update(bytes, 'utf8').digest('hex')).toBe(
      'c24656400469cfe98136df4b705fc80b3916dd4fa66d4114305d101a468108d3',
    );

    const record = JSON.parse(bytes) as {
      ownerDecision: string;
      authorityFlags: Record<string, boolean>;
    };
    expect(record.ownerDecision).toBe('AUTHORISE_PHASE_2B_2D_A1B_DETERMINISTIC_DRAW_V1');
    expect(record.authorityFlags.A1bDeterministicDrawAuthorised).toBe(true);
    for (const flag of [
      'networkAuthorised',
      'databaseReadAuthorised',
      'databaseWriteAuthorised',
      'institutionAcquisitionAuthorised',
      'replacementAuthorised',
      'pageSelectionAuthorised',
      'labellingAuthorised',
      'providerInferenceAuthorised',
      'candidateDevelopmentAuthorised',
      'holdoutExecutionAuthorised',
      'phase2EAuthorised',
    ]) {
      expect(record.authorityFlags[flag], flag).toBe(false);
    }
  });

  /**
   * `authorisation` and `consumption` are RESERVED filename tokens in
   * `docs/evaluation/`: two landed checks refuse any entry matching them, so a
   * raw 2D2C runner authorisation token or consumption marker can never land
   * beside the governance records. A1b's own record was named
   * `..._AUTHORITY_RECORD_V1.json` to respect that rather than to widen it,
   * and this asserts A1b did not put the invariant back at risk.
   */
  it('added no docs/evaluation filename carrying a reserved token', () => {
    for (const entry of readdirSync(join(REPO_ROOT, 'docs', 'evaluation'))) {
      expect(entry, `${entry} carries a reserved filename token`).not.toMatch(
        /authorisation|consumption/i,
      );
    }
  });
});

describe('2D-A1b: A1b changed no production file and weakened no firewall', () => {
  it.skipIf(!baseCommitAvailable())(
    'since the A1 frame commit, A1b touched nothing under src/orgunits/, migrations/, src/cli/ or src/ingest/',
    () => {
      const changed = execFileSync(
        'git',
        ['-C', REPO_ROOT, 'diff', '--name-only', A1B_BASE_COMMIT, '--'],
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
        expect(file.startsWith('src/db/'), file).toBe(false);
        expect(file.startsWith(`${HARNESS_2D2C}/`), file).toBe(false);
        // A1's own eight modules and its frame artifact are INPUTS here.
        expect(file.startsWith(`${HARNESS_2D}/corpus/`), file).toBe(false);
        expect(file, 'A1b rewrote the frozen frame').not.toBe(
          'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_FRAME_V2_GEN1.json',
        );
      }
    },
  );

  it.skipIf(!baseCommitAvailable())('modified no firewall file at all', () => {
    const changed = execFileSync(
      'git',
      ['-C', REPO_ROOT, 'diff', '--name-only', A1B_BASE_COMMIT, '--', 'src/test/firewall'],
      { encoding: 'utf8' },
    )
      .split('\n')
      .filter((line) => line.length > 0);
    expect(changed).toEqual([]);
  });

  it.skipIf(!baseCommitAvailable())('changed no frozen methodology, plan or approval byte', () => {
    const changed = execFileSync(
      'git',
      ['-C', REPO_ROOT, 'diff', '--name-only', A1B_BASE_COMMIT, '--', 'docs/evaluation'],
      { encoding: 'utf8' },
    )
      .split('\n')
      .filter((line) => line.length > 0);
    // WHY THIS LIST GREW, ONCE, BY EXACT NAME.
    //
    //   This assertion diffs the WHOLE of `docs/evaluation` against the A1
    //   frame commit, so it does not only bound A1b: it bounds every branch
    //   that DESCENDS from A1b. A2 descends from A1b - deliberately, because
    //   the methodology, plan, frame and draw bytes it binds are all already
    //   in that tree - and A2 must land its own governance records in the
    //   same directory as every record before them.
    //
    //   So the two A2 Batch-01 filenames are permitted BY EXACT NAME, the
    //   same deliberate, reviewed widening Phase 2B-1c applied to the
    //   firewall when a later slice legitimately needed a file an earlier
    //   slice had pinned closed. Nothing is weakened: every other path under
    //   `docs/evaluation` is still refused, the frozen methodology, plan,
    //   approval, frame and draw bytes are all still covered, and no other
    //   assertion in this file was touched. A future step that needs its own
    //   record widens this list the same visible way - it does not delete
    //   the check.
    //
    //   IT GREW A SECOND TIME, FOR A3a, BY EXACT NAME. A3a descends from A2
    //   and lands three records: the owner's adjudication of the one Batch-01
    //   process deviation, A3a's own authority record, and A3a's aggregate
    //   public execution record. None of them is a gated-split artifact -
    //   every detailed SD7 result is written to a split-scoped external root
    //   outside this repository - and the three names are listed here rather
    //   than covered by a prefix so that a fourth one is a visible edit too.
    const permitted = [
      'docs/evaluation/PHASE_2B_2D_METHOD_V2_A1B_DRAW_AUTHORITY_RECORD_V1.json',
      'docs/evaluation/PHASE_2B_2D_METHOD_V2_A2_BATCH_01_AUTHORITY_RECORD_V1.json',
      'docs/evaluation/PHASE_2B_2D_METHOD_V2_A2_BATCH_01_DEVIATION_ADJUDICATION_V1.json',
      'docs/evaluation/PHASE_2B_2D_METHOD_V2_A2_BATCH_01_EXECUTION_RECORD_V1.json',
      'docs/evaluation/PHASE_2B_2D_METHOD_V2_A3A_SD7_PILOT_AUTHORITY_RECORD_V1.json',
      'docs/evaluation/PHASE_2B_2D_METHOD_V2_A3A_SD7_PILOT_EXECUTION_RECORD_V1.json',
      'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_DRAW_V2_GEN1.json',
    ];
    for (const file of changed) {
      expect(permitted, `A1b changed ${file}`).toContain(file);
    }
  });
});
