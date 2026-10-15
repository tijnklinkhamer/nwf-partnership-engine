/**
 * FETCH POLICY v8 - THE ISOLATION TEST FOR SECTION-FAIR FRONTIER ORDERING
 * (Track B, B1.1, ADR 0018).
 *
 * Owner decision APPROVE_B1_1_FRONTIER_SECTION_DIVERSITY_LOCAL_IMPLEMENTATION_V1
 * (docs/evaluation/TRACK_B_B1_1_FRONTIER_SECTION_DIVERSITY_FETCH_POLICY_V8_OWNER_APPROVAL_V1.json).
 *
 * Per the phase-isolation convention this change is pinned by its OWN
 * repair-scope file over its OWN commit range; no older firewall was edited
 * (`phase2bRobotsTrailingSlash.firewall.test.ts` reads its own terminal
 * commit, where production was - and stays - v7). It proves, from the real
 * git range and the real source:
 *
 *   - exactly two production files changed, by exact path, none new;
 *   - no migration, no dependency, no budget constant, no root-runner,
 *     candidate, signal, classifier, gateway, robots or CLI change;
 *   - `policy.ts` moved ONLY its version string and its prose;
 *   - the frontier's ADMISSION (`add`) is byte-identical to v7, and its
 *     strict priorities are still compared BEFORE any section term;
 *   - the frontier stays pure;
 *   - the test-only v7 baseline is never imported by production code.
 *
 * THE RANGE IS REPAIR_BASE_COMMIT..REPAIR_TERMINAL_COMMIT. It is open to the
 * working tree while the change is uncommitted, and must be pinned to the
 * implementation commit as soon as that commit exists.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** The approved B1.1 implementation base (fetch policy v7). */
const REPAIR_BASE_COMMIT = '6bbb84af801af778615e4733ca499c6ec051aae7';

/** Open (null) until the OWNER-reviewed implementation is committed; then pinned. */
const REPAIR_TERMINAL_COMMIT: string | null = null;

const AUTHORISED_PRODUCTION_FILES = [
  'src/orgunits/orchestrator/frontier.ts',
  'src/orgunits/web/policy.ts',
];

const PRODUCTION_PREFIXES = [
  'src/orgunits/',
  'src/cli/',
  'src/db/',
  'src/ingest/',
  'src/website/',
  'src/compare/',
  'src/config/',
  'migrations/',
  'scripts/',
];

const FORBIDDEN_PATHS = [
  'src/orgunits/orchestrator/rootRunner.ts',
  'src/orgunits/orchestrator/candidates.ts',
  'src/orgunits/orchestrator/constants.ts',
  'src/orgunits/orchestrator/requestBudget.ts',
  'src/orgunits/orchestrator/circuitBreaker.ts',
  'src/orgunits/orchestrator/anchors.ts',
  'src/orgunits/sitemap.ts',
  'src/orgunits/web/gateway.ts',
  'src/orgunits/web/robots.ts',
  'src/orgunits/web/robotsAuthority.ts',
  'src/orgunits/web/url.ts',
  'src/orgunits/web/hostPolicy.ts',
  'src/orgunits/signals/',
  'src/orgunits/classify/',
  'src/cli/',
  'migrations/',
  'package.json',
  'package-lock.json',
];

const POLICY = 'src/orgunits/web/policy.ts';
const FRONTIER = 'src/orgunits/orchestrator/frontier.ts';

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

const rangeAvailable =
  commitExists(REPAIR_BASE_COMMIT) &&
  (REPAIR_TERMINAL_COMMIT === null || commitExists(REPAIR_TERMINAL_COMMIT));

const range = (): string[] =>
  REPAIR_TERMINAL_COMMIT === null
    ? [REPAIR_BASE_COMMIT]
    : [REPAIR_BASE_COMMIT, REPAIR_TERMINAL_COMMIT];

function changedInRepair(...paths: readonly string[]): string[] {
  const tracked = execFileSync(
    'git',
    ['-C', REPO_ROOT, 'diff', '--name-only', ...range(), '--', ...paths],
    { encoding: 'utf8' },
  );
  const untracked =
    REPAIR_TERMINAL_COMMIT === null
      ? execFileSync(
          'git',
          ['-C', REPO_ROOT, 'ls-files', '--others', '--exclude-standard', '--', ...paths],
          { encoding: 'utf8' },
        )
      : '';
  return [...new Set(`${tracked}\n${untracked}`.split('\n').filter((l) => l.length > 0))].sort();
}

function sourceOf(path: string): string {
  if (REPAIR_TERMINAL_COMMIT === null) return readFileSync(join(REPO_ROOT, path), 'utf8');
  return execFileSync('git', ['-C', REPO_ROOT, 'show', `${REPAIR_TERMINAL_COMMIT}:${path}`], {
    encoding: 'utf8',
  });
}

function sourceAtV7(path: string): string {
  return execFileSync('git', ['-C', REPO_ROOT, 'show', `${REPAIR_BASE_COMMIT}:${path}`], {
    encoding: 'utf8',
  });
}

function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** The text of one class method, from its name through its closing brace. */
function methodText(source: string, signature: string): string {
  const start = source.indexOf(signature);
  expect(start, `${signature} not found`).toBeGreaterThan(-1);
  let depth = 0;
  let seen = false;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === '{') {
      depth += 1;
      seen = true;
    } else if (source[i] === '}') {
      depth -= 1;
      if (seen && depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`${signature} has no closing brace`);
}

// ============================================================== 1. FILE SCOPE

describe('v8 scope: exactly two production files, by exact path', () => {
  it.skipIf(!rangeAvailable)('changed no production file outside the authorised two', () => {
    const production = changedInRepair().filter((file) =>
      PRODUCTION_PREFIXES.some((prefix) => file.startsWith(prefix)),
    );
    expect(production).toEqual([...AUTHORISED_PRODUCTION_FILES].sort());
  });

  it.skipIf(!rangeAvailable)(
    'touched no root runner, candidate, budget, signal, classifier, gateway, robots, CLI, migration or dependency file',
    () => {
      expect(changedInRepair(...FORBIDDEN_PATHS)).toEqual([]);
    },
  );
});

// ============================================================== 2. POLICY VERSION

describe('v8 scope: the policy version, current and historical', () => {
  it('production is orgunit-fetch-policy-v8, declared exactly once', () => {
    expect(sourceOf(POLICY).match(/FETCH_POLICY_VERSION\s*=\s*'[^']+'/g)).toEqual([
      "FETCH_POLICY_VERSION = 'orgunit-fetch-policy-v8'",
    ]);
  });

  it.skipIf(!rangeAvailable)('the v7 base is still v7', () => {
    expect(sourceAtV7(POLICY).match(/FETCH_POLICY_VERSION\s*=\s*'[^']+'/g)).toEqual([
      "FETCH_POLICY_VERSION = 'orgunit-fetch-policy-v7'",
    ]);
  });

  it.skipIf(!rangeAvailable)('policy.ts moved ONLY its version string and its prose', () => {
    const strip = (s: string) =>
      codeOf(s)
        .replace(/FETCH_POLICY_VERSION = '[^']+'/, 'FETCH_POLICY_VERSION = X')
        .replace(/\s+/g, ' ');
    expect(strip(sourceOf(POLICY))).toBe(strip(sourceAtV7(POLICY)));
  });
});

// ============================================================== 3. THE FRONTIER

describe('v8 scope: the frontier changed ORDER only', () => {
  it.skipIf(!rangeAvailable)('admission (add) is byte-identical to v7', () => {
    const signature = '  add(\n';
    expect(methodText(sourceOf(FRONTIER), signature).replace('queued(entry)', 'entry')).toBe(
      methodText(sourceAtV7(FRONTIER), signature),
    );
  });

  it('compares the v7 strict priorities BEFORE any section, depth, source or URL term', () => {
    const compare = codeOf(methodText(sourceOf(FRONTIER), 'private compareQueued('));
    const at = (needle: string): number => {
      const index = compare.indexOf(needle);
      expect(index, needle).toBeGreaterThan(-1);
      return index;
    };
    const score = at('b.bestScore !== a.bestScore');
    const own = at('b.ownEvidence !== a.ownEvidence');
    const section = at('this.sectionPicks.get(');
    const depth = at('a.section.depth !== b.section.depth');
    const source = at('SOURCE_PRECEDENCE[');
    const url = at('a.entry.url < b.entry.url');
    expect([score, own, section, depth, source, url]).toEqual(
      [score, own, section, depth, source, url].sort((x, y) => x - y),
    );
  });

  it('keeps the Track B floor pool and its Track B-score ordering exactly as v7 had them', () => {
    const code = codeOf(sourceOf(FRONTIER));
    expect(code).toContain('if (trackBSelected < trackBFloor) {');
    expect(code).toContain("eligible.filter((item) => trackScore(item.entry, 'B') > 0)");
    expect(code).toContain("const delta = trackScore(b.entry, 'B') - trackScore(a.entry, 'B');");
    const v7 = codeOf(sourceAtV7(FRONTIER));
    expect(v7).toContain("eligible.filter((entry) => trackScore(entry, 'B') > 0)");
  });

  it('writes the section counter only in pickNext, after the choice', () => {
    const code = codeOf(sourceOf(FRONTIER));
    expect(code.match(/this\.sectionPicks\.set\(/g)).toHaveLength(1);
    const pick = codeOf(methodText(sourceOf(FRONTIER), '  pickNext('));
    expect(pick.indexOf('this.sectionPicks.set(')).toBeGreaterThan(
      pick.indexOf('this.entries.delete(chosen.entry.url)'),
    );
    expect(codeOf(methodText(sourceOf(FRONTIER), 'private compareQueued('))).not.toContain(
      'sectionPicks.set(',
    );
  });

  it('stays pure: no clock, randomness, environment, filesystem, network or database', () => {
    const code = codeOf(sourceOf(FRONTIER));
    for (const forbidden of [
      'Date.now',
      'new Date(',
      'Math.random',
      'process.env',
      'performance.now',
      'localeCompare',
      'toLocaleLowerCase',
      "from 'node:",
      "from 'pg'",
      'executeWebAttempt',
      'fetch(',
    ]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
  });

  it('adds no keyword, signal term or vocabulary of its own', () => {
    const code = codeOf(sourceOf(FRONTIER)).toLowerCase();
    for (const word of ['vie-etudiante', 'association', 'international', 'erasmus', 'langue']) {
      expect(code, word).not.toContain(word);
    }
  });
});

// ============================================================== 4. TEST-ONLY BASELINE

describe('v8 scope: the frozen v7 baseline lives in tests only', () => {
  it('no production module imports the replay harness', () => {
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const absolute = join(dir, entry);
        if (statSync(absolute).isDirectory()) walk(absolute);
        else if (absolute.endsWith('.ts')) files.push(relative(REPO_ROOT, absolute));
      }
    };
    walk(join(REPO_ROOT, 'src'));
    for (const file of files.filter((f) => !f.startsWith('src/test/'))) {
      expect(readFileSync(join(REPO_ROOT, file), 'utf8'), file).not.toContain('frontierReplay');
    }
  });
});
