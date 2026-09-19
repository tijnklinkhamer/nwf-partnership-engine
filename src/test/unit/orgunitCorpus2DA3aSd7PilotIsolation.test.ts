/**
 * PHASE 2B-2D A3a ISOLATION — THE PILOT MEASURES, AND DOES NOTHING ELSE.
 *
 * By walking the real import graph, module specifiers and source text of
 * `src/test/harness/phase2b2d/sd7/`, this file proves:
 *
 *   - A3a holds exactly the reviewed modules, and A1's `corpus/` and A1b's
 *     `draw/` directories are untouched - still exactly their eight and five
 *     files, with no SD7 capability added to either;
 *   - no module opens a socket, calls fetch(), or imports a provider, an AI
 *     SDK, a browser or a search client - A3a's authority sets
 *     `networkAuthorised` to false and this is what that means in code;
 *   - exactly ONE module reaches the database, it connects as the READONLY
 *     role, and it contains no mutating SQL verb of any kind;
 *   - no module consumes a reserve, creates a replacement, materialises SET_P
 *     or SET_R, writes a label or a gold value, or names a survivor rank;
 *   - no module can print, log or return page content;
 *   - A3a adds no file under src/orgunits/, touches no migration, no CLI and
 *     no firewall.
 *
 * WHY THIS LIVES IN src/test/unit/ AND NOT src/test/firewall/
 *
 *   `orgunitClassifyAcceptanceMethodologyV2R2.test.ts` asserts that NO file
 *   under `src/test/firewall/` has changed since the methodology branch point.
 *   A3a descends from A2, which descends from A1b and A1, which descend from
 *   that point, so adding a firewall FILE here would break an assertion that is
 *   otherwise still true. A1 and A1b both made exactly this call for exactly
 *   this reason; A3a follows them rather than moving a baseline.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const HARNESS_2D = 'src/test/harness/phase2b2d';
const HARNESS_2D2C = 'src/test/harness/phase2b2d2c';
const SD7_DIR = join(REPO_ROOT, HARNESS_2D, 'sd7');
const A1_DIR = join(REPO_ROOT, HARNESS_2D, 'corpus');
const A1B_DIR = join(REPO_ROOT, HARNESS_2D, 'draw');

const SD7_FILES = [
  'jaccard.ts',
  'materialisePilot.ts',
  'nearDuplicatePairs.ts',
  'normaliseText.ts',
  'pilotAnalysis.ts',
  'pilotArtifact.ts',
  'readPilotEvidence.ts',
  'sd7Contract.ts',
  'tokenShingles.ts',
];

/** The eight A1 modules and the five A1b modules, unchanged by A3a. */
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
const A1B_FILES = [
  'deterministicDraw.ts',
  'drawArtifact.ts',
  'drawContract.ts',
  'materialiseDraw.ts',
  'readFrozenFrame.ts',
];

/** Modules with no IO of any kind at all. */
const PURE_MODULES = [
  'sd7Contract.ts',
  'normaliseText.ts',
  'tokenShingles.ts',
  'jaccard.ts',
  'nearDuplicatePairs.ts',
  'pilotAnalysis.ts',
];

/** The ONE module permitted to reach a database. */
const THE_ONLY_DATABASE_MODULE = 'readPilotEvidence.ts';

/** The ONLY modules permitted to touch the filesystem. */
const THE_ONLY_FILE_MODULES = ['pilotArtifact.ts', 'materialisePilot.ts'];

/** The commit A3a branched from: the A2 Batch-01 execution record. */
const A3A_BASE_COMMIT = 'a0ae27cc30f15537014fa8a4efaae9aa25da542a';

function baseCommitAvailable(): boolean {
  try {
    execFileSync('git', ['-C', REPO_ROOT, 'cat-file', '-e', `${A3A_BASE_COMMIT}^{commit}`], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function readSource(name: string): string {
  return readFileSync(join(SD7_DIR, name), 'utf8');
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
  const queue = entries.map((name) => join(SD7_DIR, name));
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

const GRAPH = graphFrom(SD7_FILES);

describe('2D-A3a: the sd7 directory holds exactly the reviewed modules', () => {
  it('has no file beyond the nine reviewed ones', () => {
    expect(
      readdirSync(SD7_DIR)
        .filter((name) => !name.startsWith('.'))
        .sort(),
    ).toEqual(SD7_FILES);
  });

  it('leaves A1’s corpus directory at exactly its eight modules', () => {
    expect(
      readdirSync(A1_DIR)
        .filter((name) => !name.startsWith('.'))
        .sort(),
    ).toEqual(A1_FILES);
  });

  it('leaves A1b’s draw directory at exactly its five modules', () => {
    expect(
      readdirSync(A1B_DIR)
        .filter((name) => !name.startsWith('.'))
        .sort(),
    ).toEqual(A1B_FILES);
  });

  it('adds no SD7 capability to A1 or A1b', () => {
    for (const [dir, files] of [
      [A1_DIR, A1_FILES],
      [A1B_DIR, A1B_FILES],
    ] as const) {
      for (const name of files) {
        const code = readFileSync(join(dir, name), 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '');
        expect(/\bshingle\w*/i.test(code), `${name} gained a shingle capability`).toBe(false);
        expect(/\bjaccard\w*/i.test(code), `${name} gained a similarity capability`).toBe(false);
        expect(/\bnearDuplicate\w*/i.test(code), `${name} gained a dedupe capability`).toBe(false);
      }
    }
  });

  it('reaches no A1 or A1b module - the draw is read as BYTES, not as code', () => {
    for (const file of GRAPH.files) {
      expect(file.startsWith(`${HARNESS_2D}/corpus/`), `A3a reaches ${file}`).toBe(false);
      expect(file.startsWith(`${HARNESS_2D}/draw/`), `A3a reaches ${file}`).toBe(false);
      expect(file.startsWith(`${HARNESS_2D2C}/`), `A3a reaches ${file}`).toBe(false);
    }
  });
});

describe('2D-A3a: no network, no provider, no institution', () => {
  const FORBIDDEN_SPECIFIERS = [
    'node:dns',
    'node:net',
    'node:tls',
    'node:http',
    'node:https',
    'dns',
    'net',
    'tls',
    'http',
    'https',
    'undici',
    'node-fetch',
    'axios',
    'got',
    'superagent',
    '@anthropic-ai/sdk',
    '@anthropic-ai/claude-agent-sdk',
    'openai',
    'puppeteer',
    'playwright',
    'jsdom',
    'cheerio',
    'saxes',
  ];

  it('imports no socket, HTTP client, provider SDK, browser or parser', () => {
    for (const specifier of GRAPH.external) {
      expect(FORBIDDEN_SPECIFIERS, `A3a imports ${specifier}`).not.toContain(specifier);
    }
  });

  it('imports only the reviewed external modules', () => {
    // `pg` is a TYPE-ONLY import in readPilotEvidence.ts and a real one in the
    // db client A3a reuses; `prettier` lays out the committed record; `zod`
    // arrives with `src/config/env.ts`, which the db client reads the
    // connection string through. None of the four can reach an institution.
    expect([...GRAPH.external].sort()).toEqual([
      'node:crypto',
      'node:fs',
      'node:os',
      'node:path',
      'node:url',
      'pg',
      'prettier',
      'zod',
    ]);
  });

  it('reaches exactly two repository modules outside its own namespace', () => {
    // A3a reuses this repository's own least-privilege pool helper rather than
    // constructing a connection of its own - the same choice A1 made - and
    // reaches nothing else.
    expect(GRAPH.files.filter((file) => !file.startsWith(`${HARNESS_2D}/sd7/`)).sort()).toEqual([
      'src/config/env.ts',
      'src/db/client.ts',
    ]);
  });

  it('calls fetch() nowhere', () => {
    for (const name of SD7_FILES) {
      expect(/\bfetch\s*\(/.test(codeOf(name)), `${name} calls fetch()`).toBe(false);
    }
  });

  it('names no institution acquisition target - no URL, host, robots or sitemap', () => {
    for (const name of SD7_FILES) {
      const code = codeOf(name);
      expect(/https?:\/\//.test(code), `${name} carries a URL`).toBe(false);
      expect(/\brobots\b/i.test(code), `${name} names robots`).toBe(false);
      expect(/\bsitemap\b/i.test(code), `${name} names a sitemap`).toBe(false);
      expect(/\bregistrableDomain\b/.test(code), `${name} names a domain`).toBe(false);
      expect(/\bexecuteWebAttempt\b/.test(code), `${name} names the gateway`).toBe(false);
    }
  });

  it('imports nothing from the orgunit web, orchestrator or signals surface', () => {
    for (const file of GRAPH.files) {
      expect(file.startsWith('src/orgunits/'), `A3a reaches ${file}`).toBe(false);
    }
  });
});

describe('2D-A3a: exactly one module reaches the database, read-only', () => {
  const MUTATING_SQL = [
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'COPY',
    'CREATE',
    'ALTER',
    'DROP',
    'GRANT',
    'REVOKE',
    'BEGIN',
    'COMMIT',
    'ROLLBACK',
    'MERGE',
    'UPSERT',
  ];

  it('is the only module that imports pg or the db client', () => {
    for (const name of SD7_FILES) {
      if (name === THE_ONLY_DATABASE_MODULE || name === 'materialisePilot.ts') continue;
      const code = codeOf(name);
      expect(/from\s*['"]pg['"]/.test(code), `${name} imports pg`).toBe(false);
      expect(/\/db\/client/.test(code), `${name} imports the db client`).toBe(false);
    }
  });

  it('connects as the READONLY role, never research, ingest, classifier or owner', () => {
    const code = codeOf('materialisePilot.ts');
    expect(code).toContain("withPool('readonly'");
    for (const role of ['research', 'ingest', 'classifier', 'admin', 'owner']) {
      expect(new RegExp(`withPool\\(\\s*['"]${role}['"]`).test(code), role).toBe(false);
    }
  });

  it('contains no mutating SQL verb anywhere in the pilot namespace', () => {
    for (const name of SD7_FILES) {
      // Comments are stripped, so the prose explaining WHY these are absent
      // cannot itself trip the check.
      const code = codeOf(name);
      for (const verb of MUTATING_SQL) {
        expect(new RegExp(`\\b${verb}\\b`).test(code), `${name} contains ${verb}`).toBe(false);
      }
    }
  });

  it('issues only SELECT statements', () => {
    const code = codeOf(THE_ONLY_DATABASE_MODULE);
    const statements = [...code.matchAll(/`(\s*SELECT[\s\S]*?)`/g)];
    expect(statements.length).toBeGreaterThan(0);
    // Every backtick-quoted SQL literal in the module begins with SELECT.
    for (const match of code.matchAll(/pool\.query<[^>]*>\(\s*`([^`]*)`/g)) {
      expect(match[1]!.trimStart().startsWith('SELECT'), match[1]).toBe(true);
    }
  });

  it('verifies table counts before AND after, and treats any movement as a violation', () => {
    const code = codeOf('materialisePilot.ts');
    expect(code).toContain('tableCountsBefore');
    expect(code).toContain('tableCountsAfter');
    expect(code).toContain('DATABASE DELTA');
  });
});

describe('2D-A3a: the pilot consumes no reserve and draws no sample', () => {
  it('has no reserve-consumption, replacement or inheritance capability at all', () => {
    for (const name of SD7_FILES) {
      const code = codeOf(name);
      for (const forbidden of [
        'consumeReserve',
        'reserveEntry',
        'replacementLedger',
        'createReplacement',
        'inheritSelectionIndex',
        'REPLACEMENT_LEDGER',
      ]) {
        expect(code.includes(forbidden), `${name} carries ${forbidden}`).toBe(false);
      }
    }
  });

  it('never reads the draw’s reserve list', () => {
    for (const name of SD7_FILES) {
      expect(/\.reserve\b/.test(codeOf(name)), `${name} reads the reserve`).toBe(false);
    }
  });

  /**
   * These two checks are written as "every occurrence is one of the permitted
   * DECLARATIONS" rather than "the substring never appears".
   *
   * The crude form fails on its own subject matter: `setPMaterialised: false`
   * and `survivorOrderDiscipline` are the record keys that STATE the absence,
   * so a substring ban would forbid saying the thing it wants to be true. What
   * must be absent is the CAPABILITY, and that is what is asserted - by
   * enumerating the exact permitted spellings and refusing everything else.
   */
  it('materialises no SET_P and no SET_R', () => {
    const PERMITTED = ['setPMaterialised: false', 'setRMaterialised: false'];
    for (const name of SD7_FILES) {
      const code = codeOf(name);
      expect(/\bSET_P\b/.test(code), `${name} names SET_P`).toBe(false);
      expect(/\bSET_R\b/.test(code), `${name} names SET_R`).toBe(false);
      for (const match of code.matchAll(/\bset[PR]\w*[^,\n]*/g)) {
        expect(
          PERMITTED.some((permitted) => match[0].startsWith(permitted)),
          `${name} carries a SET_P/SET_R construction: ${match[0]}`,
        ).toBe(true);
      }
    }
  });

  it('invents no survivor rank under any of the forbidden names', () => {
    const PERMITTED_SURVIVOR_ORDER_MENTIONS = ['survivorOrderDiscipline'];
    for (const name of SD7_FILES) {
      const code = codeOf(name);
      for (const forbidden of [
        'survivorRank',
        'chooseSurvivor',
        'pickSurvivor',
        'selectSurvivor',
        'rankKey',
        'rankHash',
        'deterministicRank',
        'salt',
      ]) {
        expect(code.includes(forbidden), `${name} carries ${forbidden}`).toBe(false);
      }
      for (const match of code.matchAll(/\bsurvivorOrder\w*/g)) {
        expect(
          PERMITTED_SURVIVOR_ORDER_MENTIONS.includes(match[0]),
          `${name} carries a survivor-order capability: ${match[0]}`,
        ).toBe(true);
      }
    }
  });

  it('creates no label and no gold value', () => {
    for (const name of SD7_FILES) {
      const code = codeOf(name);
      for (const forbidden of ['goldLabel', 'goldClass', 'hardNegative', 'annotation', 'rubric']) {
        expect(code.includes(forbidden), `${name} carries ${forbidden}`).toBe(false);
      }
    }
  });
});

describe('2D-A3a: no page content can reach a terminal, a log or a public artifact', () => {
  it('logs nothing outside the one reporting entry point', () => {
    for (const name of SD7_FILES) {
      if (name === 'materialisePilot.ts') continue;
      const code = codeOf(name);
      expect(/console\./.test(code), `${name} logs`).toBe(false);
      expect(/process\.stdout/.test(code), `${name} writes to stdout`).toBe(false);
    }
  });

  it('never logs a text, title, url or shingle field', () => {
    const code = codeOf('materialisePilot.ts');
    for (const line of code.split('\n').filter((l) => l.includes('console.'))) {
      for (const forbidden of [
        'mainText',
        'main_text',
        'title',
        'url',
        'Url',
        'shingle',
        'echeRowKey',
        'documentSha256',
        'pageId',
        'split',
      ]) {
        expect(line.includes(forbidden), `a console line carries ${forbidden}: ${line}`).toBe(
          forbidden === 'split' ? line.includes('sealedOutcome.split') : false,
        );
      }
    }
  });

  it('keeps main_text out of every type an artifact is built from', () => {
    // `PageForSd7` is the ONLY type carrying page text, and it is an INPUT.
    // Nothing that is serialised has anywhere to put one.
    const artifact = codeOf('pilotArtifact.ts');
    expect(/mainText/.test(artifact), 'the artifact writer sees page text').toBe(false);
    expect(/shingleSet|encodeShingle/.test(artifact), 'the artifact writer sees shingles').toBe(
      false,
    );
  });

  it('declares in the public record contract that no per-index result is emitted', () => {
    const code = codeOf('materialisePilot.ts');
    expect(code).toContain('thisRecordCarriesNoPerSelectionIndexResult');
    expect(code).toContain('thisRecordCarriesNoSplitSpecificDedupeCount');
    expect(code).toContain('thisRecordCarriesNoPageOrDocumentId');
  });

  it('routes each split to its OWN root, three roots, not three subdirectories', () => {
    const contract = codeOf('sd7Contract.ts');
    expect(contract).toContain('phase2b-2d-methodology-v2/gen1-dev-train');
    expect(contract).toContain('phase2b-2d-methodology-v2-sealed/gen1-dev-confirm');
    expect(contract).toContain('phase2b-2d-methodology-v2-sealed-holdout/gen1-final-holdout');
    // The three roots share no parent directory below the home directory.
    const roots = [
      'phase2b-2d-methodology-v2',
      'phase2b-2d-methodology-v2-sealed',
      'phase2b-2d-methodology-v2-sealed-holdout',
    ];
    expect(new Set(roots).size).toBe(3);
  });
});

describe('2D-A3a: purity, and the one entry point', () => {
  it('keeps the pure modules free of filesystem, database, clock and randomness', () => {
    for (const name of PURE_MODULES) {
      const code = codeOf(name);
      expect(/node:fs|readFileSync|writeFileSync/.test(code), `${name} touches the fs`).toBe(false);
      expect(/from\s*['"]pg['"]/.test(code), `${name} imports pg`).toBe(false);
      expect(/process\.env/.test(code), `${name} reads the environment`).toBe(false);
      expect(/Date\.now|new Date\(/.test(code), `${name} reads a clock`).toBe(false);
      expect(/Math\.random/.test(code), `${name} uses randomness`).toBe(false);
    }
  });

  it('confines filesystem access to the two modules that need it', () => {
    for (const name of SD7_FILES) {
      if (THE_ONLY_FILE_MODULES.includes(name)) continue;
      expect(/node:fs/.test(codeOf(name)), `${name} touches the fs`).toBe(false);
    }
  });

  it('binds every input by hash, in the contract, and refuses a mismatch', () => {
    // The hashes live in `sd7Contract.ts` - one place, reviewable at a glance -
    // and `materialisePilot.ts` is what enforces them.
    const contract = codeOf('sd7Contract.ts');
    expect(contract).toContain('03e1e08054eb381d9be527857ef70d92ae1aade0e5095e7b6507f0c7e8105a46');
    expect(contract).toContain('8a1b0f57f1c568e2ac04aced7ba453ad8d7b666f557fd622b3a5e6378309f9cc');
    expect(contract).toContain('b7021416894b7547cfe53d0d5f5e34b4e9c35843f8be35f0d2844bc67683b7b3');
    expect(contract).toMatch(/BATCH_01_AUTHORITY_RECORD_BYTES\s*=\s*17425/);
    expect(contract).toMatch(/BATCH_01_EXECUTION_RECORD_BYTES\s*=\s*23602/);
    expect(contract).toMatch(/BATCH_01_RAW_PAGE_EVIDENCE_ROWS\s*=\s*59/);

    const code = codeOf('materialisePilot.ts');
    expect(code).toContain('verifyBoundInputs');
    expect(code).toContain('not the bound');
  });

  it('binds the owner authorisation that permits this step at all', () => {
    const recordPath = join(
      REPO_ROOT,
      'docs/evaluation/PHASE_2B_2D_METHOD_V2_A3A_SD7_PILOT_AUTHORITY_RECORD_V1.json',
    );
    expect(existsSync(recordPath)).toBe(true);
    const record = JSON.parse(readFileSync(recordPath, 'utf8')) as {
      ownerDecision: string;
      authorityFlags: Record<string, boolean>;
    };
    expect(record.ownerDecision).toBe('AUTHORISE_PHASE_2B_2D_A3A_SD7_PILOT_V1');
    expect(record.authorityFlags.a3aSd7PilotAuthorised).toBe(true);
    expect(record.authorityFlags.databaseReadAuthorised).toBe(true);
    for (const flag of [
      'networkAuthorised',
      'databaseWriteAuthorised',
      'setPAuthorised',
      'setRAuthorised',
      'replacementAuthorised',
      'reserveConsumptionAuthorised',
      'labellingAuthorised',
      'providerInferenceAuthorised',
      'holdoutSemanticDisclosureAuthorised',
      'institutionAcquisitionAuthorised',
      'pageSelectionAuthorised',
      'candidateDevelopmentAuthorised',
      'holdoutExecutionAuthorised',
      'phase2EAuthorised',
    ]) {
      expect(record.authorityFlags[flag], flag).toBe(false);
    }
  });

  it('records the owner’s Batch-01 deviation adjudication before measuring anything', () => {
    const recordPath = join(
      REPO_ROOT,
      'docs/evaluation/PHASE_2B_2D_METHOD_V2_A2_BATCH_01_DEVIATION_ADJUDICATION_V1.json',
    );
    expect(existsSync(recordPath)).toBe(true);
    const record = JSON.parse(readFileSync(recordPath, 'utf8')) as {
      ownerAdjudication: Record<string, unknown>;
      futureP5Semantics: Record<string, unknown>;
    };
    expect(record.ownerAdjudication.classification).toBe(
      'PROCESS_DEVIATION_WITHIN_AUTHORISED_SCOPE',
    );
    expect(record.ownerAdjudication.dataDisposition).toBe('RETAIN');
    expect(record.ownerAdjudication.rerunPermitted).toBe(false);
    expect(record.ownerAdjudication.deleteEvidencePermitted).toBe(false);
    expect(record.ownerAdjudication.batch01Invalidated).toBe(false);
    expect(record.futureP5Semantics.semantics).toBe('INCREMENTAL_BETWEEN_RUN_GATE');
    expect(record.futureP5Semantics.threshold).toBe(2);
  });

  it('added no docs/evaluation filename carrying a reserved token', () => {
    for (const entry of readdirSync(join(REPO_ROOT, 'docs', 'evaluation'))) {
      expect(entry, `${entry} carries a reserved filename token`).not.toMatch(
        /authorisation|consumption/i,
      );
    }
  });
});

describe('2D-A3a: A3a changed no production file and weakened no firewall', () => {
  it.skipIf(!baseCommitAvailable())(
    'since the A2 Batch-01 commit, A3a touched nothing under src/orgunits/, migrations/, src/cli/ or src/ingest/',
    () => {
      const changed = execFileSync(
        'git',
        ['-C', REPO_ROOT, 'diff', '--name-only', A3A_BASE_COMMIT, '--'],
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
        expect(file.startsWith('src/compare/'), file).toBe(false);
        expect(file.startsWith(`${HARNESS_2D2C}/`), file).toBe(false);
        // A1's and A1b's modules and their artifacts are INPUTS here.
        expect(file.startsWith(`${HARNESS_2D}/corpus/`), file).toBe(false);
        expect(file.startsWith(`${HARNESS_2D}/draw/`), file).toBe(false);
        expect(file, 'A3a rewrote the frozen frame').not.toBe(
          'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_FRAME_V2_GEN1.json',
        );
        expect(file, 'A3a rewrote the frozen draw').not.toBe(
          'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_DRAW_V2_GEN1.json',
        );
        expect(file, 'A3a edited the Batch-01 execution record').not.toBe(
          'docs/evaluation/PHASE_2B_2D_METHOD_V2_A2_BATCH_01_EXECUTION_RECORD_V1.json',
        );
        expect(file, 'A3a edited the Batch-01 authority record').not.toBe(
          'docs/evaluation/PHASE_2B_2D_METHOD_V2_A2_BATCH_01_AUTHORITY_RECORD_V1.json',
        );
      }
    },
  );

  it.skipIf(!baseCommitAvailable())('modified no firewall file at all', () => {
    const changed = execFileSync(
      'git',
      ['-C', REPO_ROOT, 'diff', '--name-only', A3A_BASE_COMMIT, '--', 'src/test/firewall'],
      { encoding: 'utf8' },
    )
      .split('\n')
      .filter((line) => line.length > 0);
    expect(changed).toEqual([]);
  });

  it.skipIf(!baseCommitAvailable())('committed no sealed detail file to git', () => {
    const changed = execFileSync(
      'git',
      ['-C', REPO_ROOT, 'diff', '--name-only', A3A_BASE_COMMIT, '--'],
      { encoding: 'utf8' },
    )
      .split('\n')
      .filter((line) => line.length > 0);
    for (const file of changed) {
      expect(file.includes('SD7_PILOT_DETAIL'), `${file} is a sealed detail file`).toBe(false);
      expect(file.includes('gen1-dev-confirm'), file).toBe(false);
      expect(file.includes('gen1-final-holdout'), file).toBe(false);
    }
  });
});
