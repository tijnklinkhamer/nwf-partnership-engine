/**
 * PHASE 2B-2D OPTION-B TRANSITION ISOLATION — THE STEP GOVERNS AND MEASURES,
 * AND DOES NOTHING ELSE.
 *
 * By walking the real import graph, module specifiers and source text of
 * `src/test/harness/phase2b2d/transition/`, this file proves:
 *
 *   - the step holds exactly the reviewed modules, and A1's `corpus/`, A1b's
 *     `draw/` and A3a's `sd7/` directories are untouched - still exactly their
 *     eight, five and nine files, with no transition capability added to any;
 *   - no module opens a socket, calls fetch(), or imports a provider, an AI
 *     SDK, a browser or a search client - this step's network authority is
 *     zero and this is what that means in code;
 *   - the ONE production import is `continuationTargetFor`, the LANDED ADR
 *     0012 predicate, and no network-capable symbol is named anywhere;
 *   - exactly ONE module reaches the database, it connects as the READONLY
 *     role, and it contains no mutating SQL verb of any kind;
 *   - no module consumes a reserve, creates a replacement, materialises SET_P
 *     or SET_R, writes a label or a gold value, or names a survivor rank;
 *   - no module can print, log or return page content;
 *   - the step adds no file under src/orgunits/, touches no migration, no CLI
 *     and no firewall, and rewrites no frozen artifact.
 *
 * THE RANGE IS NOW BASE -> TERMINAL COMMIT, the way A1's, A1b's and A3a's
 * are, and the way `orgunitRobotsOptionBRepairScope.test.ts` now is. This
 * step stopped being the current phase when ADR 0013 (Option C-lite) opened
 * the next one; leaving the range open to the working tree would make this
 * file fail for changes a later phase authorises rather than for anything
 * this step did.
 *
 * ONE LATER PHASE HAS EDITED THIS STEP'S TOOLING SINCE, DELIBERATELY. ADR
 * 0013 widened the landed continuation predicate, so
 * `compatibilityCensus.ts` now expresses Option B as "the landed predicate
 * admits it AND the hostname did not change" - the same question, asked of
 * the code that answers it, rather than a frozen private copy that could
 * drift. The published census counts are unchanged, and the source
 * assertions below are read LIVE precisely so that such an edit still has to
 * satisfy every isolation property this step was approved under.
 *
 * WHY THIS LIVES IN src/test/unit/ AND NOT src/test/firewall/
 *
 *   `orgunitClassifyAcceptanceMethodologyV2R2.test.ts` asserts that NO file
 *   under `src/test/firewall/` has changed since the methodology branch point.
 *   A1, A1b and A3a all made exactly this call for exactly this reason; this
 *   step follows them rather than moving a baseline.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const HARNESS_2D = 'src/test/harness/phase2b2d';
const HARNESS_2D2C = 'src/test/harness/phase2b2d2c';
const TRANSITION_DIR = join(REPO_ROOT, HARNESS_2D, 'transition');
const A1_DIR = join(REPO_ROOT, HARNESS_2D, 'corpus');
const A1B_DIR = join(REPO_ROOT, HARNESS_2D, 'draw');
const SD7_DIR = join(REPO_ROOT, HARNESS_2D, 'sd7');

const TRANSITION_FILES = [
  'compatibilityCensus.ts',
  'materialiseTransition.ts',
  'readTransitionEvidence.ts',
  'transitionArtifact.ts',
  'transitionContract.ts',
];

/** The eight A1, five A1b and nine A3a modules, unchanged by this step. */
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

/** The one module permitted to reach a database. */
const THE_ONLY_DATABASE_MODULES = ['readTransitionEvidence.ts', 'materialiseTransition.ts'];

/** Modules with no IO of any kind at all. */
const PURE_MODULES = ['transitionContract.ts', 'compatibilityCensus.ts'];

/** The commit this step branched from: the targeted live revalidation result. */
const TRANSITION_BASE_COMMIT = '0662bcc938a9cf2b779c00355c6f7eb34df5279b';

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

/** The commit this step ENDED at. Everything after it is a later phase's. */
const TRANSITION_TERMINAL_COMMIT = 'b0f4efa01d7e861a701e3514afc690a99262f554';

const baseAvailable =
  commitExists(TRANSITION_BASE_COMMIT) && commitExists(TRANSITION_TERMINAL_COMMIT);

/** Every path this step changed: its base commit -> its own terminal commit. */
function changedInStep(...paths: readonly string[]): string[] {
  return execFileSync(
    'git',
    [
      '-C',
      REPO_ROOT,
      'diff',
      '--name-only',
      TRANSITION_BASE_COMMIT,
      TRANSITION_TERMINAL_COMMIT,
      '--',
      ...paths,
    ],
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter((line) => line.length > 0);
}

function readSource(name: string): string {
  return readFileSync(join(TRANSITION_DIR, name), 'utf8');
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
  const queue = entries.map((name) => join(TRANSITION_DIR, name));
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

const GRAPH = graphFrom(TRANSITION_FILES);

describe('2D Option-B transition: the directory holds exactly the reviewed modules', () => {
  it('has no file beyond the five reviewed ones', () => {
    expect(
      readdirSync(TRANSITION_DIR)
        .filter((name) => !name.startsWith('.'))
        .sort(),
    ).toEqual(TRANSITION_FILES);
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

  it('leaves A3a’s sd7 directory at exactly its nine modules', () => {
    expect(
      readdirSync(SD7_DIR)
        .filter((name) => !name.startsWith('.'))
        .sort(),
    ).toEqual(SD7_FILES);
  });

  it('changed no file in any of those three directories', () => {
    if (!baseAvailable) return;
    for (const dir of ['corpus', 'draw', 'sd7']) {
      expect(changedInStep(`${HARNESS_2D}/${dir}`), dir).toEqual([]);
    }
  });
});

describe('2D Option-B transition: no network, and the one socket in the graph is inert', () => {
  /**
   * THE SOCKET MODULES IN THIS GRAPH ARE REAL, AND THEY ARE THE PRICE OF
   * CALLING THE LANDED PREDICATE.
   *
   * `continuationTargetFor` is exported from `src/orgunits/web/robots.ts`,
   * which imports the gateway - the one module in `src/orgunits/` permitted a
   * socket. Importing the predicate therefore drags `node:dns`, `node:http`,
   * `node:https` and `node:net` into the module graph, and pretending
   * otherwise would be a weaker test, not a stronger one.
   *
   * What matters is that nothing here can USE them: the socket modules are
   * reachable through exactly one file, the step names no symbol that could
   * open one, and the step's own five modules import none of them directly.
   * Reimplementing the predicate to keep the graph tidy would answer a
   * question about the copy rather than about the code that actually ran.
   */
  const SOCKET_MODULES = [
    'node:http',
    'node:https',
    'node:net',
    'node:tls',
    'node:dgram',
    'node:dns',
  ];

  const THIRD_PARTY_NETWORK_OR_PROVIDER = [
    'undici',
    'axios',
    'node-fetch',
    'got',
    'superagent',
    'puppeteer',
    'playwright',
    'cheerio',
    'jsdom',
    '@anthropic-ai/sdk',
    '@anthropic-ai/claude-agent-sdk',
    'openai',
    'googleapis',
    'serpapi',
  ];

  it('pulls in no third-party HTTP client, browser, scraper or provider SDK at all', () => {
    for (const specifier of GRAPH.external) {
      expect(THIRD_PARTY_NETWORK_OR_PROVIDER, specifier).not.toContain(specifier);
    }
  });

  it('imports no socket module directly in any of its own five modules', () => {
    for (const name of TRANSITION_FILES) {
      for (const specifier of importSpecifiersOf(codeOf(name))) {
        expect(SOCKET_MODULES, `${name} imports ${specifier}`).not.toContain(specifier);
      }
    }
  });

  it('reaches a socket module through exactly one file in the whole graph: the gateway', () => {
    const carriers = GRAPH.files.filter((file) =>
      importSpecifiersOf(readFileSync(join(REPO_ROOT, file), 'utf8')).some((specifier) =>
        SOCKET_MODULES.includes(specifier),
      ),
    );
    expect(carriers).toEqual(['src/orgunits/web/gateway.ts']);
  });

  it('reaches that gateway only through the robots module the predicate lives in', () => {
    const importersOfGateway = GRAPH.files.filter(
      (file) =>
        file !== 'src/orgunits/web/gateway.ts' &&
        importSpecifiersOf(readFileSync(join(REPO_ROOT, file), 'utf8')).some((specifier) =>
          specifier.endsWith('/gateway.js'),
        ),
    );
    expect(importersOfGateway).toEqual(['src/orgunits/web/robots.ts']);
  });

  it('calls fetch() nowhere in its own modules', () => {
    for (const name of TRANSITION_FILES) {
      expect(codeOf(name), name).not.toMatch(/\bfetch\s*\(/);
    }
  });

  it('names no network-capable gateway or orchestrator symbol', () => {
    for (const name of TRANSITION_FILES) {
      const code = codeOf(name);
      for (const symbol of [
        'executeWebAttempt',
        'authoriseAndFetchPage',
        'getRobotsPolicy',
        'runRootAcquisition',
        'runOrganisationDiscovery',
        'nodeWebTransport',
        'discoverSitemapUrls',
      ]) {
        expect(code, `${name} names ${symbol}`).not.toContain(symbol);
      }
    }
  });
});

describe('2D Option-B transition: the predicate is the LANDED one', () => {
  it('imports continuationTargetFor from the production robots module', () => {
    const code = codeOf('compatibilityCensus.ts');
    expect(code).toMatch(
      /import\s*\{\s*continuationTargetFor\s*\}\s*from\s*'\.\.\/\.\.\/\.\.\/\.\.\/orgunits\/web\/robots\.js'/,
    );
    expect(GRAPH.files).toContain('src/orgunits/web/robots.ts');
  });

  it('is the only module that imports from the orgunit web surface, apart from the pure policy', () => {
    const importers = TRANSITION_FILES.filter((name) =>
      importSpecifiersOf(codeOf(name)).some((specifier) => specifier.includes('orgunits/web/')),
    ).sort();
    expect(importers).toEqual(['compatibilityCensus.ts', 'transitionContract.ts']);
    // The contract's only web import is the PURE policy module, which has no
    // imports of its own - so the version strings it exposes are production's.
    expect(
      importSpecifiersOf(codeOf('transitionContract.ts')).filter((specifier) =>
        specifier.includes('orgunits/'),
      ),
    ).toEqual(['../../../../orgunits/web/policy.js']);
  });

  it('reimplements no part of the predicate: no path, host or scheme comparison of its own', () => {
    const code = codeOf('compatibilityCensus.ts');
    expect(code).not.toContain("'/robots.txt'" + ' && ');
    expect(code).not.toMatch(/target\.hostname/);
    expect(code).not.toMatch(/target\.protocol/);
    expect(code).not.toMatch(/https:/);
  });

  it('calls the predicate rather than duplicating its verdict', () => {
    expect(codeOf('compatibilityCensus.ts')).toContain('continuationTargetFor(');
  });
});

describe('2D Option-B transition: exactly one module reaches the database, read-only', () => {
  it('imports pg or the db helper in no other module', () => {
    for (const name of TRANSITION_FILES) {
      if (THE_ONLY_DATABASE_MODULES.includes(name)) continue;
      const specifiers = importSpecifiersOf(codeOf(name));
      expect(specifiers, name).not.toContain('pg');
      for (const specifier of specifiers) {
        expect(specifier.includes('/db/'), `${name} imports ${specifier}`).toBe(false);
      }
    }
  });

  it('connects as the readonly role and no other', () => {
    const code = codeOf('materialiseTransition.ts');
    expect(code).toContain("withPool('readonly'");
    for (const role of ['research', 'ingest', 'admin', 'classifier']) {
      expect(code, role).not.toContain(`withPool('${role}'`);
    }
  });

  it('contains no mutating SQL verb and no transaction-control statement', () => {
    const code = codeOf('readTransitionEvidence.ts');
    for (const verb of [
      'INSERT',
      'UPDATE',
      'DELETE',
      'TRUNCATE',
      'COPY',
      'CREATE',
      'ALTER',
      'DROP',
      'GRANT',
      'BEGIN',
      'COMMIT',
      'ROLLBACK',
    ]) {
      expect(code, verb).not.toContain(verb);
    }
  });

  it('verifies the table counts before AND after, and refuses any movement', () => {
    const code = codeOf('materialiseTransition.ts');
    expect(code).toContain('tableCountsBefore');
    expect(code).toContain('tableCountsAfter');
    expect(code).toContain('DATABASE DELTA');
  });
});

describe('2D Option-B transition: the modules that must be pure are pure', () => {
  it('reads no clock, no randomness, no environment and no filesystem', () => {
    for (const name of PURE_MODULES) {
      const code = codeOf(name);
      expect(code, name).not.toContain('process.env');
      expect(code, name).not.toContain('Date.now');
      expect(code, name).not.toContain('Math.random');
      expect(code, name).not.toContain('readFileSync');
      expect(code, name).not.toContain('writeFileSync');
    }
  });
});

describe('2D Option-B transition: it decides nothing it was not authorised to decide', () => {
  it('consumes no reserve, creates no replacement and materialises no sample', () => {
    for (const name of TRANSITION_FILES) {
      const code = codeOf(name);
      for (const forbidden of [
        'consumeReserve',
        'materialiseSetP',
        'materialiseSetR',
        'SET_P',
        'SET_R',
        'createReplacement',
      ]) {
        expect(code, `${name} contains ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('writes no label, no gold value and no survivor rank', () => {
    for (const name of TRANSITION_FILES) {
      const code = codeOf(name).toLowerCase();
      for (const forbidden of ['goldvalue', 'writelabel', 'survivorrank', 'chooseSurvivor']) {
        expect(code, `${name} contains ${forbidden}`).not.toContain(forbidden.toLowerCase());
      }
    }
  });

  it('names no holdout root and no provider', () => {
    for (const name of TRANSITION_FILES) {
      const code = codeOf(name).toLowerCase();
      expect(code, name).not.toContain('final_holdout');
      expect(code, name).not.toContain('anthropic');
      // `recordedBy: 'claude-code-session ...'` is the established provenance
      // convention in every execution record here, so the check is for a MODEL
      // identifier - the thing that would mean inference happened - not for the
      // word.
      for (const model of ['claude-opus', 'claude-sonnet', 'claude-haiku', 'claude-fable']) {
        expect(code, `${name} names ${model}`).not.toContain(model);
      }
      expect(code, name).not.toContain('orgunits/classify');
      expect(code, name).not.toContain('orgunit_page_classifications');
    }
  });

  it('routes its one sealed file to the DEV_TRAIN root by a checked split token', () => {
    const code = codeOf('transitionArtifact.ts');
    expect(code).toContain('sealedRootFor');
    expect(code).toContain('analysis.split !== split');
  });

  it('gives its sealed file a name that cannot collide with A3a’s', () => {
    const contract = codeOf('transitionContract.ts');
    expect(contract).toContain('OPTION_B_TRANSITION_SD7_MEASUREMENT_DETAIL_V1.json');
    expect(contract).not.toContain('A3A_SD7_PILOT_DETAIL_V1.json');
  });

  it('prints aggregates and opaque refs only - never page text or an identity', () => {
    const code = codeOf('materialiseTransition.ts');
    const logged = [...code.matchAll(/console\.log\(([^;]*)\);/g)].map((match) => match[1] ?? '');
    for (const line of logged) {
      for (const forbidden of [
        'mainText',
        'echeRowKey',
        'organisationId',
        'requestedUrl',
        'hostname',
      ]) {
        expect(line, `console.log leaks ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});

describe('2D Option-B transition: it changed no production file and weakened no firewall', () => {
  it.skipIf(!baseAvailable)(
    'touched nothing under src/orgunits/, migrations/, src/cli/, src/ingest/, src/website/, src/db/ or src/compare/',
    () => {
      for (const file of changedInStep()) {
        expect(file.startsWith('src/orgunits/'), file).toBe(false);
        expect(file.startsWith('migrations/'), file).toBe(false);
        expect(file.startsWith('src/cli/'), file).toBe(false);
        expect(file.startsWith('src/ingest/'), file).toBe(false);
        expect(file.startsWith('src/website/'), file).toBe(false);
        expect(file.startsWith('src/db/'), file).toBe(false);
        expect(file.startsWith('src/compare/'), file).toBe(false);
        expect(file.startsWith('src/config/'), file).toBe(false);
        expect(file.startsWith(`${HARNESS_2D2C}/`), file).toBe(false);
      }
    },
  );

  it.skipIf(!baseAvailable)('modified no firewall file at all', () => {
    expect(changedInStep('src/test/firewall')).toEqual([]);
  });

  it.skipIf(!baseAvailable)('rewrote no frozen artifact', () => {
    for (const file of changedInStep()) {
      for (const frozen of [
        'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_FRAME_V2_GEN1.json',
        'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_DRAW_V2_GEN1.json',
        'docs/evaluation/PHASE_2B_2D_METHODOLOGY_V2_CORPUS_ACQUISITION_PLAN_V1.json',
        'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL_R3.json',
        'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_OWNER_FREEZE_APPROVAL_V1.json',
        'docs/evaluation/PHASE_2B_2D_METHOD_V2_A2_BATCH_02_EXECUTION_RECORD_V1.json',
        'docs/evaluation/PHASE_2B_2D_METHOD_V2_A2_BATCH_01_EXECUTION_RECORD_V1.json',
        'docs/evaluation/PHASE_2B_2D_METHOD_V2_A3A_SD7_PILOT_EXECUTION_RECORD_V1.json',
        'docs/evaluation/PHASE_2B_ROBOTS_OPTION_B_TARGETED_REVALIDATION_RESULT_V1.json',
        'docs/adr/0012-same-host-robots-redirect-continuation.md',
      ]) {
        expect(file, `${frozen} was rewritten`).not.toBe(frozen);
      }
    }
  });

  it.skipIf(!baseAvailable)('committed no sealed detail file to git', () => {
    for (const file of changedInStep()) {
      expect(file.includes('SD7_MEASUREMENT_DETAIL'), `${file} is a sealed detail file`).toBe(
        false,
      );
      expect(file.includes('SD7_PILOT_DETAIL'), `${file} is a sealed detail file`).toBe(false);
    }
  });

  it('added no docs/evaluation filename carrying a reserved token', () => {
    for (const entry of readdirSync(join(REPO_ROOT, 'docs', 'evaluation'))) {
      expect(entry, `${entry} carries a reserved filename token`).not.toMatch(
        /authorisation|consumption/i,
      );
    }
  });
});
