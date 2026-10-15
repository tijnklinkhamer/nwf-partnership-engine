/**
 * TRACK B, B3.0 - THE ISOLATION TEST FOR THE RESEARCH-SIDE EVALUATION-COHORT
 * GUARD.
 *
 * Per the phase-isolation convention this change is pinned by its OWN
 * repair-scope file over its OWN commit range; no older firewall was edited.
 * It proves, from the real git range and the real source:
 *
 *   - the change set is EXACTLY the authorised files, by path and status;
 *   - the classifier namespace (its guard and pins included), the gateway,
 *     robots, URL/host policy, fetch policy, budgets, frontier, signals,
 *     migrations, dependencies and every pinned cohort artifact are
 *     unchanged;
 *   - the organisation-level guard runs before `startRun`, and the
 *     orchestrator executes only the plan's roots (it issues no SQL itself);
 *   - the per-root guard runs in `runRootAcquisition` after root resolution
 *     and before any robots cache, frontier or request;
 *   - every production path to the gateway passes the per-root guard, and
 *     the guarded entry points have no new production caller;
 *   - the guard reuses the classifier's matcher instead of a second one, adds
 *     no network client, writes nothing, discloses no membership, and has no
 *     override, flag or environment bypass; no production module injects a
 *     cohort registry.
 *
 * THE RANGE IS REPAIR_BASE_COMMIT..REPAIR_TERMINAL_COMMIT. It is open to the
 * working tree while the change is uncommitted, and must be pinned to the
 * implementation commit as soon as that commit exists.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  EVALUATION_COHORT_ARTIFACT_PINS,
  loadEvaluationCohortRegistry,
} from '../../orgunits/classify/evaluationCohortGuard.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** The accepted B1.1 tip (fetch policy v8, firewall pinned). */
const REPAIR_BASE_COMMIT = '02ddcf25931a91397216a6c20c91bef9c16663e4';

/** Open (null) until the OWNER-reviewed implementation is committed; then pinned. */
const REPAIR_TERMINAL_COMMIT: string | null = null;

const GUARD = 'src/orgunits/orchestrator/researchCohortGuard.ts';
const ORCHESTRATE = 'src/orgunits/orchestrator/orchestrate.ts';
const ROOT_RUNNER = 'src/orgunits/orchestrator/rootRunner.ts';
const DISCOVER_CLI = 'src/cli/commands/discover.ts';
const CLASSIFIER_GUARD = 'src/orgunits/classify/evaluationCohortGuard.ts';

/** The exact authorised change set, as `git diff --name-status` lines. */
const AUTHORISED_CHANGESET = [
  'A\tdocs/audits/TRACK_B_B3_0_RESEARCH_COHORT_GUARD_V1.md',
  'A\tdocs/evaluation/TRACK_B_B3_0_RESEARCH_COHORT_GUARD_OWNER_DECISION_V1.json',
  `M\t${DISCOVER_CLI}`,
  `M\t${ORCHESTRATE}`,
  `A\t${GUARD}`,
  `M\t${ROOT_RUNNER}`,
  'A\tsrc/test/firewall/phase2bResearchCohortGuard.firewall.test.ts',
  'A\tsrc/test/helpers/syntheticCohortRegistry.ts',
  'M\tsrc/test/integration/orgunitAnchorDocumentBase.test.ts',
  'M\tsrc/test/integration/orgunitAnchorHygiene.test.ts',
  'M\tsrc/test/integration/orgunitDiscoverCli.test.ts',
  'M\tsrc/test/integration/orgunitDiscoveryRcdata.test.ts',
  'M\tsrc/test/integration/orgunitOrchestrator.test.ts',
  'M\tsrc/test/integration/orgunitOrchestratorSafety.test.ts',
  'A\tsrc/test/integration/orgunitResearchCohortGuard.test.ts',
  'M\tsrc/test/integration/orgunitRobotsOptionCLite.test.ts',
  'M\tsrc/test/integration/orgunitRobotsTrailingSlash.test.ts',
  'M\tsrc/test/integration/orgunitTransportRetry.test.ts',
  'A\tsrc/test/unit/researchCohortGuardB30.test.ts',
].sort();

/** Paths this change may not touch at all. */
const FORBIDDEN_PATHS = [
  'src/orgunits/classify/',
  'src/orgunits/web/',
  'src/orgunits/signals/',
  'src/orgunits/sitemap.ts',
  'src/orgunits/orchestrator/frontier.ts',
  'src/orgunits/orchestrator/constants.ts',
  'src/orgunits/orchestrator/requestBudget.ts',
  'src/orgunits/orchestrator/circuitBreaker.ts',
  'src/orgunits/orchestrator/anchors.ts',
  'src/orgunits/orchestrator/candidates.ts',
  'src/orgunits/orchestrator/pageCollection.ts',
  'src/orgunits/orchestrator/run.ts',
  'src/orgunits/orchestrator/clock.ts',
  'src/cli/index.ts',
  'src/cli/commands/classify.ts',
  'src/test/unit/classifierOperatorEvaluationCohortGuardV1.test.ts',
  'src/test/integration/classifierOperatorEvaluationCohortGuard.test.ts',
  'src/test/integration/cohortTestRegistry.ts',
  'docs/evaluation/corpus/',
  'docs/adr/',
  'migrations/',
  'scripts/',
  'package.json',
  'package-lock.json',
  'CLAUDE.md',
];

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

/** `--name-status` lines over the range, plus untracked files as `A` while the range is open. */
function changeset(...paths: readonly string[]): string[] {
  const tracked = execFileSync(
    'git',
    ['-C', REPO_ROOT, 'diff', '--name-status', '--find-renames', ...range(), '--', ...paths],
    { encoding: 'utf8' },
  );
  const untracked =
    REPAIR_TERMINAL_COMMIT === null
      ? execFileSync(
          'git',
          ['-C', REPO_ROOT, 'ls-files', '--others', '--exclude-standard', '--', ...paths],
          { encoding: 'utf8' },
        )
          .split('\n')
          .filter((l) => l.length > 0)
          .map((l) => `A\t${l}`)
          .join('\n')
      : '';
  return [...new Set(`${tracked}\n${untracked}`.split('\n').filter((l) => l.length > 0))].sort();
}

function sourceOf(path: string): string {
  if (REPAIR_TERMINAL_COMMIT === null) return readFileSync(join(REPO_ROOT, path), 'utf8');
  return execFileSync('git', ['-C', REPO_ROOT, 'show', `${REPAIR_TERMINAL_COMMIT}:${path}`], {
    encoding: 'utf8',
  });
}

function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** The text of one top-level function, from its signature through its closing brace. */
function functionText(source: string, signature: string): string {
  const start = source.indexOf(signature);
  expect(start, `${signature} not found`).toBeGreaterThan(-1);
  const open = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`${signature} is not closed`);
}

/** Every production TypeScript file (non-test) under `src/`. */
function productionFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (full === join(REPO_ROOT, 'src', 'test')) continue;
        walk(full);
      } else if (name.endsWith('.ts')) {
        out.push(relative(REPO_ROOT, full).split('\\').join('/'));
      }
    }
  };
  walk(join(REPO_ROOT, 'src'));
  return out.sort();
}

const describeRange = rangeAvailable ? describe : describe.skip;

describeRange('B3.0 research cohort guard: the change stays inside its authorised scope', () => {
  it('changes exactly the authorised files, by path and status', () => {
    expect(changeset()).toEqual(AUTHORISED_CHANGESET);
  });

  it('touches no classifier, gateway, robots, policy, budget, frontier, signal, migration, dependency or cohort artifact path', () => {
    expect(changeset(...FORBIDDEN_PATHS)).toEqual([]);
  });

  it('leaves the classifier guard and its artifact pins byte-identical to the base', () => {
    const base = execFileSync(
      'git',
      ['-C', REPO_ROOT, 'show', `${REPAIR_BASE_COMMIT}:${CLASSIFIER_GUARD}`],
      {
        encoding: 'utf8',
      },
    );
    expect(sourceOf(CLASSIFIER_GUARD)).toBe(base);
    for (const pin of EVALUATION_COHORT_ARTIFACT_PINS) {
      expect(changeset(pin.path), pin.path).toEqual([]);
    }
  });

  it('the committed pinned artifacts still verify (verification only - nothing is enumerated)', () => {
    expect(loadEvaluationCohortRegistry().ok).toBe(true);
  });
});

describe('B3.0 research cohort guard: enforced at the execution boundary', () => {
  it('runOrganisationDiscovery plans and guards BEFORE startRun, and executes only the plan', () => {
    const body = codeOf(
      functionText(sourceOf(ORCHESTRATE), 'export async function runOrganisationDiscovery('),
    );
    const plan = body.indexOf('planOrganisationResearch(');
    const start = body.indexOf('startRun(');
    expect(plan, 'no guard call').toBeGreaterThan(-1);
    expect(start, 'no startRun call').toBeGreaterThan(-1);
    expect(plan, 'the guard does not precede startRun').toBeLessThan(start);
    expect(body).toMatch(/for \(const \{ ref \} of plan\.roots\)/);
  });

  it('the orchestrator issues no SQL of its own, so no root can be found outside the plan', () => {
    const code = codeOf(sourceOf(ORCHESTRATE));
    expect(code).not.toMatch(/\.query\s*[<(]/);
    expect(code).not.toMatch(/\bSELECT\b/);
    expect(code).not.toMatch(/findOrganisation(Claim|Promotion)Roots/);
  });

  it('runRootAcquisition guards its root after resolving it and before any robots cache, frontier or request', () => {
    const body = codeOf(
      functionText(sourceOf(ROOT_RUNNER), 'export async function runRootAcquisition('),
    );
    const resolveAt = body.indexOf('resolveRoot(');
    const guardAt = body.indexOf(
      'await enforceRootResearchEligibility(pool, runId, resolved, deps)',
    );
    expect(resolveAt).toBeGreaterThan(-1);
    expect(guardAt, 'the per-root guard is missing').toBeGreaterThan(resolveAt);
    for (const later of [
      'createRobotsCache(',
      'createFrontier(',
      'createHostCircuitBreaker(',
      'authoriseAndFetchPage(',
      'discoverSitemapUrls(',
      'attemptUrl(',
    ]) {
      const at = body.indexOf(later);
      if (at > -1) expect(guardAt, `${later} precedes the guard`).toBeLessThan(at);
    }
  });

  it('every production path to the gateway passes through the guarded root runner', () => {
    const callers = (needle: string) =>
      productionFiles().filter((f) =>
        codeOf(readFileSync(join(REPO_ROOT, f), 'utf8')).includes(needle),
      );
    // robots.ts DEFINES authoriseAndFetchPage and is the one caller of
    // executeWebAttempt; the root runner is the one orchestration caller.
    expect(callers('authoriseAndFetchPage(')).toEqual([ROOT_RUNNER, 'src/orgunits/web/robots.ts']);
    expect(callers('runRootAcquisition(')).toEqual([ORCHESTRATE, ROOT_RUNNER]);
    expect(callers('runOrganisationDiscovery(')).toEqual([DISCOVER_CLI, ORCHESTRATE]);
    expect(callers('enforceRootResearchEligibility(')).toEqual([GUARD, ROOT_RUNNER]);
    // startRun (the research run row) is reachable only through the orchestrator.
    expect(callers("from './run.js'")).toEqual([ORCHESTRATE]);
    expect(callers('orchestrator/run.js')).toEqual([]);
  });

  it('the CLI uses the same guard for its dry run and refuses with a generic payload', () => {
    const code = codeOf(sourceOf(DISCOVER_CLI));
    expect(code).toContain('planOrganisationResearch(');
    expect(code).not.toMatch(/FROM website_claims|orgunit_root_promotions/);
    const refusal = functionText(code, 'function reportRefusal(');
    expect(refusal).toContain('refusal.toJSON()');
    for (const leak of ['roots', 'echeRowKey', 'memberships', 'cause', 'detail']) {
      expect(refusal, `the refusal output names ${leak}`).not.toContain(leak);
    }
  });
});

describe('B3.0 research cohort guard: one authority, no bypass, no disclosure', () => {
  it('reuses the classifier matcher and registry - it builds no second matcher', () => {
    const code = codeOf(sourceOf(GUARD));
    expect(code).toMatch(/from '\.\.\/classify\/evaluationCohortGuard\.js'/);
    expect(code).toContain('evaluateCohortMembership(');
    expect(code).toContain('loadEvaluationCohortRegistry');
    expect(code).not.toMatch(/membershipsByEcheRowKey|frameOrganisationIdByEcheRowKey/);
    expect(code).not.toMatch(/sha256|createHash|readFileSync|JSON\.parse/);
  });

  it('imports nothing else from the classifier, and the matcher it imports carries no runtime', () => {
    const imports = [...codeOf(sourceOf(GUARD)).matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(imports.filter((i) => i!.includes('classify'))).toEqual([
      '../classify/evaluationCohortGuard.js',
    ]);
    const matcherImports = [...codeOf(sourceOf(CLASSIFIER_GUARD)).matchAll(/from '([^']+)'/g)]
      .map((m) => m[1])
      .sort();
    expect(matcherImports).toEqual(['node:crypto', 'node:fs', 'node:url', 'pg']);
  });

  it('adds no network client and writes nothing', () => {
    for (const file of [GUARD, ORCHESTRATE, ROOT_RUNNER, DISCOVER_CLI]) {
      const code = codeOf(sourceOf(file));
      expect(code, `${file} imports a network module`).not.toMatch(
        /from\s+['"]node:(net|tls|http|https|dns)['"]/,
      );
      expect(code, `${file} calls fetch`).not.toMatch(/\bfetch\s*\(/);
    }
    const guard = codeOf(sourceOf(GUARD));
    expect(guard).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/);
    expect(guard).not.toContain('startRun');
  });

  it('has no override, force, skip, bypass or environment seam', () => {
    for (const file of [GUARD, ORCHESTRATE, ROOT_RUNNER, DISCOVER_CLI]) {
      const code = codeOf(sourceOf(file));
      expect(code, `${file} reads process.env`).not.toContain('process.env');
      expect(code, `${file} declares an override-shaped name`).not.toMatch(
        /override|bypass|skipCohort|ignoreCohort|forceResearch|allowProtected|unsafe|ownerExempt/i,
      );
    }
    const cli = codeOf(sourceOf('src/cli/index.ts'));
    expect(cli).not.toMatch(/cohort|override|bypass/i);
  });

  it('no production module injects a cohort registry: the committed pins always decide', () => {
    const injecting = productionFiles().filter((f) =>
      /\bloadCohortRegistry\b/.test(codeOf(readFileSync(join(REPO_ROOT, f), 'utf8'))),
    );
    // classify.ts: the classifier's own pre-existing test seam (default = pins).
    // researchCohortGuard.ts: the seam's declaration and its default.
    expect(injecting).toEqual(['src/cli/commands/classify.ts', GUARD]);
    const guard = codeOf(sourceOf(GUARD));
    expect(guard).toContain('deps.loadCohortRegistry ?? loadEvaluationCohortRegistry');
  });

  it('a refusal carries code, kind and reason only - never a membership, a detail or a key', () => {
    const guard = codeOf(sourceOf(GUARD));
    expect(guard).not.toContain('describeCohortRefusal');
    expect(guard).not.toMatch(/\.memberships\b/);
    expect(guard).toMatch(/return \{ code: this\.code, kind: this\.kind, reason: this\.reason \};/);
    for (const name of ['DEV_TRAIN', 'DEV_CONFIRM', 'FINAL_HOLDOUT', 'HOLDOUT']) {
      expect(guard, `the guard names ${name}`).not.toContain(name);
    }
  });
});

describe('B3.0-R1 research eligibility policy: protection is not eligibility, and neither is absence', () => {
  it('decideResearchEligibility is exhaustive and grants eligibility ONLY for the ALLOWED verdict', () => {
    const decide = codeOf(
      functionText(sourceOf(GUARD), 'export function decideResearchEligibility('),
    );
    expect(decide).toContain('evaluateCohortMembership(registry, subject)');
    expect(decide).toMatch(/const unhandled: never = verdict;/);
    expect(decide.match(/\{ eligible: true \}/g)).toHaveLength(1);
    expect(decide).toMatch(/case 'ALLOWED':\s*return \{ eligible: true \};/);
    // Absence from the frame is a refusal with its own reason, never permission.
    expect(decide).toMatch(
      /case 'EVALUATION_COHORT_IDENTITY_UNVERIFIED':\s*return \{ eligible: false, reason: 'RESEARCH_IDENTITY_AUTHORITY_ABSENT' \};/,
    );
    expect(decide).not.toMatch(/default:\s*return/);
  });

  it('nothing else in the guard asks the matcher or declares eligibility', () => {
    const code = codeOf(sourceOf(GUARD));
    expect(code.match(/evaluateCohortMembership\(/g)).toHaveLength(1);
    expect(code.match(/\{ eligible: true \}/g)).toHaveLength(1);
    expect(code).not.toMatch(/inFrame|notInFrame|outsideFrame/i);
  });

  it('both enforcement points apply the one research policy', () => {
    const code = codeOf(sourceOf(GUARD));
    for (const signature of [
      'export async function planOrganisationResearch(',
      'export async function enforceRootResearchEligibility(',
    ]) {
      expect(functionText(code, signature), signature).toContain('applyResearchEligibilityPolicy(');
    }
  });
});
