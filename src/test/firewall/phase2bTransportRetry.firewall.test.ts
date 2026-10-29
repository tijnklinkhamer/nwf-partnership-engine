/**
 * ADR 0015 / FETCH POLICY v4 — THE ISOLATION TEST FOR THIS REPAIR.
 *
 * Test matrix I, U, X, Y and Z of the frozen design
 * `docs/evaluation/PHASE_2B_2D_A2_BOUNDED_TRANSPORT_RETRY_POLICY_DESIGN_V1.json`.
 *
 * Every repair in this repository carries an isolation test bounded to its OWN
 * commit range, and the resolved phase-isolation decision says a change under
 * `src/orgunits/` is pinned by a NEW repair-scope file rather than by widening
 * an older phase's firewall. This is that file. No assertion in
 * `phase2b.firewall.test.ts` was touched, and none needed to be.
 *
 * It proves, from the real git range and the real source:
 *
 *   - exactly four production files changed, by exact path, one of them new;
 *   - no migration was added or changed - the range is still 0001..0012;
 *   - the gateway, the redirect module, the robots authority, the robots
 *     policy parser, the circuit breaker and the frozen budgets are untouched;
 *   - the retry policy is PURE and decides nothing it persists;
 *   - `FETCH_POLICY_VERSION` is `orgunit-fetch-policy-v4`, declared once;
 *   - the retry token and the redirect hop bound are separate constants, each 1;
 *   - no TLS weakening, no new dependency, no new network location;
 *   - no historical freeze, owner approval or evaluation artifact moved.
 *
 * THE RANGE IS REPAIR_BASE_COMMIT..REPAIR_TERMINAL_COMMIT, CLOSED IMMEDIATELY.
 * It was open to the working tree only while the semantic implementation was
 * being written; the moment that landed, the terminal commit was pinned here -
 * exactly as ADR 0012's, ADR 0013's and the observability repair's now are.
 * The temporal-test correction
 * (`docs/evaluation/PHASE_2B_2D_A2_BOUNDED_TRANSPORT_RETRY_TEMPORAL_TEST_CORRECTION_V1.json`)
 * exists precisely because leaving that open is a promise rather than a
 * mechanism, and this file was not going to repeat the defect it was written
 * alongside. Everything after the terminal commit - the acquisition-plan
 * amendment, the transition census, this pin itself - is governance, belongs
 * to no production range, and is correctly invisible here.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// FETCH_POLICY_VERSION is deliberately NOT imported: v4 is a fact about this
// repair's terminal commit, and production moved on to v5 (the anchor
// document-base repair). `sourceOf` reads the terminal commit.
import {
  MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS,
  MAX_ROBOTS_TRANSPORT_RETRIES_PER_POLICY_RESOLUTION,
} from '../../orgunits/web/policy.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/**
 * The commit this repair branched from: the temporal-test correction, which
 * landed green under v3 and changed no production file, precisely so that
 * everything after it is this repair's semantic change and nothing else.
 */
const REPAIR_BASE_COMMIT = 'ba6ae909f9179ee3da8ac083eb29049fa8baddce';

/**
 * The commit this repair ENDS at, or `null` while it is still the current
 * phase.
 *
 * Null would mean "compare against the working tree", which is correct for
 * exactly as long as this repair IS the present. It names the semantic
 * implementation commit instead - otherwise a later phase would be swept into
 * this range and judged against this repair's authorised surface, which is the
 * defect the temporal-test correction removed from three other files.
 */
const REPAIR_TERMINAL_COMMIT: string | null = 'd9c32af156d2241151601d6d6b0bf3eb9dafcee2';

/** The exact production surface this repair is authorised to change. */
const AUTHORISED_PRODUCTION_FILES = [
  'src/orgunits/orchestrator/rootRunner.ts',
  'src/orgunits/web/policy.ts',
  'src/orgunits/web/retryPolicy.ts',
  'src/orgunits/web/robots.ts',
];

/** The one file this repair ADDS. */
const NEW_PRODUCTION_FILE = 'src/orgunits/web/retryPolicy.ts';

/** Production namespaces. Anything changed here and not authorised above is a scope escape. */
const PRODUCTION_PREFIXES = [
  'src/orgunits/',
  'src/cli/',
  'src/db/',
  'src/ingest/',
  'src/website/',
  'src/compare/',
  'src/config/',
  'migrations/',
];

/**
 * Named production files this repair must not touch.
 *
 * `gateway.ts` is the load-bearing one: a retry is a SECOND INVOCATION of it,
 * never a loop inside it. If this file ever appears in the changed set, the
 * retry has been pushed below the one socket owner, where none of the checks
 * above it run.
 *
 * `circuitBreaker.ts` is the second: the retry is local to site-policy
 * resolution, and feeding it into the page-level breaker would redefine a
 * frozen threshold by making one real failure count twice.
 */
const FORBIDDEN_PRODUCTION_FILES = [
  'src/orgunits/web/gateway.ts',
  'src/orgunits/web/observations.ts',
  'src/orgunits/web/redirect.ts',
  'src/orgunits/web/robotsAuthority.ts',
  'src/orgunits/web/robotsPolicy.ts',
  'src/orgunits/web/url.ts',
  'src/orgunits/web/hostPolicy.ts',
  'src/orgunits/web/address.ts',
  'src/orgunits/web/authority.ts',
  'src/orgunits/web/pageEvidence.ts',
  'src/orgunits/web/charset.ts',
  'src/orgunits/web/extract.ts',
  'src/orgunits/web/redact.ts',
  'src/orgunits/sitemap.ts',
  'src/orgunits/orchestrator/circuitBreaker.ts',
  'src/orgunits/orchestrator/constants.ts',
  'src/orgunits/orchestrator/orchestrate.ts',
  'src/orgunits/orchestrator/frontier.ts',
  'src/orgunits/orchestrator/candidates.ts',
  'src/orgunits/orchestrator/pageCollection.ts',
  'src/orgunits/orchestrator/requestBudget.ts',
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

/** Every path this repair changed, over its range - closed if pinned, open if not. */
function changedInRepair(...paths: readonly string[]): string[] {
  const range =
    REPAIR_TERMINAL_COMMIT === null
      ? [REPAIR_BASE_COMMIT]
      : [REPAIR_BASE_COMMIT, REPAIR_TERMINAL_COMMIT];
  const tracked = execFileSync(
    'git',
    ['-C', REPO_ROOT, 'diff', '--name-only', ...range, '--', ...paths],
    { encoding: 'utf8' },
  );
  // An OPEN range still has a working-tree component, so an untracked file -
  // this repair's new module, before it is committed - must be counted.
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

/** A file's bytes at this repair's terminal commit, or the working tree while it is open. */
function sourceOf(path: string): string {
  if (REPAIR_TERMINAL_COMMIT === null) return readFileSync(join(REPO_ROOT, path), 'utf8');
  return execFileSync('git', ['-C', REPO_ROOT, 'show', `${REPAIR_TERMINAL_COMMIT}:${path}`], {
    encoding: 'utf8',
  });
}

/** Source with comments stripped: reasoning in prose is not a code path. */
function codeOf(path: string): string {
  return sourceOf(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('ADR 0015 repair scope: exactly four production files, by exact path', () => {
  it.skipIf(!rangeAvailable)('changed no production file outside the authorised four', () => {
    const production = changedInRepair().filter((file) =>
      PRODUCTION_PREFIXES.some((prefix) => file.startsWith(prefix)),
    );
    expect([...production].sort()).toEqual([...AUTHORISED_PRODUCTION_FILES].sort());
  });

  it.skipIf(!rangeAvailable)('changed all four of them - this is not a vacuous range', () => {
    const changed = changedInRepair();
    for (const file of AUTHORISED_PRODUCTION_FILES) expect(changed).toContain(file);
  });

  it.skipIf(!rangeAvailable)('added no migration and changed none', () => {
    expect(changedInRepair('migrations')).toEqual([]);
  });

  it.skipIf(!rangeAvailable)(
    'left the gateway, the circuit breaker and every other primitive untouched',
    () => {
      const changed = changedInRepair();
      for (const file of FORBIDDEN_PRODUCTION_FILES) expect(changed).not.toContain(file);
    },
  );

  it.skipIf(!rangeAvailable)('changed no classifier production file, no CLI, no signals', () => {
    for (const file of changedInRepair()) {
      expect(file.startsWith('src/orgunits/classify/'), file).toBe(false);
      expect(file.startsWith('src/orgunits/signals/'), file).toBe(false);
      expect(file.startsWith('src/cli/'), file).toBe(false);
      expect(file.startsWith('src/db/'), file).toBe(false);
      expect(file.startsWith('src/ingest/'), file).toBe(false);
    }
  });
});

describe('ADR 0015 repair scope: the retry policy is a pure decision', () => {
  it('exists, and is the one new production file', () => {
    expect(() => sourceOf(NEW_PRODUCTION_FILE)).not.toThrow();
  });

  it('opens no socket, no database, no clock and no environment', () => {
    const source = sourceOf(NEW_PRODUCTION_FILE);
    for (const forbidden of [
      'node:dns',
      'node:net',
      'node:tls',
      'node:http',
      'node:https',
      'node:fs',
      'node:child_process',
      "from 'pg'",
      'process.env',
      'Date.now(',
      'Math.random(',
    ]) {
      expect(source, `${NEW_PRODUCTION_FILE} references ${forbidden}`).not.toContain(forbidden);
    }
    expect(source).not.toMatch(/\bfetch\s*\(/);
  });

  it('persists no verdict, by any spelling', () => {
    const code = codeOf(NEW_PRODUCTION_FILE);
    for (const forbidden of [
      'is_retryable',
      'retry_class',
      'should_retry',
      'retry_after',
      'attempts_remaining',
      'retry_reason',
      'INSERT',
      'UPDATE',
    ]) {
      expect(code, `${NEW_PRODUCTION_FILE} names ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('admits RETRY_ELIGIBLE in exactly one context token', () => {
    const code = codeOf(NEW_PRODUCTION_FILE);
    expect(code).toContain("'ROBOTS_POLICY_RESOLUTION'");
    // Any other context is refused by an explicit guard, not by omission.
    expect(code).toContain("context !== 'ROBOTS_POLICY_RESOLUTION'");
  });
});

describe('ADR 0015 repair scope: the request boundary moved by exactly one bounded retry', () => {
  it('declares the retry token as 1, once, and keeps the hop bound separate and 1', () => {
    const policy = sourceOf('src/orgunits/web/policy.ts');
    expect(policy.match(/MAX_ROBOTS_TRANSPORT_RETRIES_PER_POLICY_RESOLUTION\s*=\s*\d+/g)).toEqual([
      'MAX_ROBOTS_TRANSPORT_RETRIES_PER_POLICY_RESOLUTION = 1',
    ]);
    expect(policy.match(/MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS\s*=\s*\d+/g)).toEqual([
      'MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS = 1',
    ]);
    expect(MAX_ROBOTS_TRANSPORT_RETRIES_PER_POLICY_RESOLUTION).toBe(1);
    expect(MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS).toBe(1);
  });

  it('U: this repair set orgunit-fetch-policy-v4, declared exactly once', () => {
    // At REPAIR_TERMINAL_COMMIT, not today: production is v5 since the anchor
    // document-base repair, which carries its own repair-scope test.
    expect(
      sourceOf('src/orgunits/web/policy.ts').match(/FETCH_POLICY_VERSION\s*=\s*'[^']+'/g),
    ).toEqual(["FETCH_POLICY_VERSION = 'orgunit-fetch-policy-v4'"]);
  });

  it('extends no timeout and raises no cap - a retry is a second bounded attempt', () => {
    const policy = sourceOf('src/orgunits/web/policy.ts');
    expect(policy).toContain('export const CONNECT_TIMEOUT_MS = 30_000;');
    expect(policy).toContain('export const TOTAL_TIMEOUT_MS = 45_000;');
    expect(policy).toContain('export const MAX_BODY_BYTES = 5 * 1024 * 1024;');
  });

  it('leaves every frozen budget exactly where it was', () => {
    const constants = sourceOf('src/orgunits/orchestrator/constants.ts');
    expect(constants).toContain('export const MAX_TOTAL_REQUESTS_PER_ROOT = 60;');
    expect(constants).toContain('export const MAX_PAGE_ATTEMPTS_PER_ROOT = 35;');
    expect(constants).toContain('export const MAX_HOSTS_PER_ROOT = 8;');
    expect(constants).toContain('export const MIN_HOST_PACING_SECONDS = 1.2;');
    expect(constants).toContain('export const CIRCUIT_BREAKER_TRANSIENT_FAILURE_THRESHOLD = 3;');
  });

  it('raises the robots prediction to three, and charges the retry through the existing count', () => {
    const runner = sourceOf('src/orgunits/orchestrator/rootRunner.ts');
    expect(runner).toContain('const predictedCost = (needsRobots ? 3 : 0) + 1;');
    expect(runner).toContain('budget.consume(robotsRequestCount)');
    // No second, hidden budget was introduced alongside the ceiling.
    expect(runner).not.toMatch(/retryBudgetPerRoot|extraRetryRequests/);
  });

  it('keeps robots.ts as the exactly-two-call-site production caller of the gateway', () => {
    // A retry is a second INVOCATION of the existing call site, never a new one.
    expect(sourceOf('src/orgunits/web/robots.ts').match(/executeWebAttempt\(/g)).toHaveLength(2);
  });

  it('spends the token BEFORE the second request, so a failed retry cannot refund it', () => {
    const robots = codeOf('src/orgunits/web/robots.ts');
    const spend = robots.indexOf('retryBudget -= 1');
    const second = robots.indexOf('const second = await fetchRobotsDocument(url)');
    expect(spend).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(-1);
    expect(spend).toBeLessThan(second);
  });

  it('declares exactly one retry token, in the resolution closure', () => {
    const robots = codeOf('src/orgunits/web/robots.ts');
    expect(robots.match(/let retryBudget/g)).toHaveLength(1);
  });

  it('fails closed when no admission callback is supplied', () => {
    const robots = sourceOf('src/orgunits/web/robots.ts');
    expect(robots).toContain('REFUSE_TRANSPORT_RETRY');
    expect(robots).toContain('Promise.resolve(false)');
  });
});

describe('ADR 0015 repair scope: nothing below the gateway changed', () => {
  it('I: never disables certificate verification, anywhere in the changed surface', () => {
    const globalOptOut = ['NODE', 'TLS', 'REJECT', 'UNAUTHORIZED'].join('_');
    for (const file of AUTHORISED_PRODUCTION_FILES) {
      const source = sourceOf(file);
      expect(source, `${file} disables TLS verification`).not.toMatch(
        /rejectUnauthorized\s*:\s*false/,
      );
      expect(source, `${file} names the global TLS opt-out`).not.toContain(globalOptOut);
    }
  });

  it('introduces no alternate host, proxy, downgrade or user-agent path', () => {
    for (const file of AUTHORISED_PRODUCTION_FILES) {
      const code = codeOf(file);
      for (const forbidden of [
        'HTTP_PROXY',
        'HTTPS_PROXY',
        'http_proxy',
        'agent:',
        'setHeader(',
        'insecure',
        'allowInsecure',
      ]) {
        expect(code, `${file} names ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('never feeds the retry into the page-level circuit breaker', () => {
    const robots = codeOf('src/orgunits/web/robots.ts');
    expect(robots).not.toContain('updateCircuitBreaker');
    expect(robots).not.toContain('circuitBreaker');
    // And the breaker still reads errorKind alone, one call site, on the page.
    const runner = codeOf('src/orgunits/orchestrator/rootRunner.ts');
    expect(runner.match(/updateCircuitBreaker\(/g)).toHaveLength(2); // declaration + one call
  });

  it.skipIf(!rangeAvailable)('adds no runtime dependency', () => {
    // Asserted as "UNCHANGED OVER THIS RANGE" rather than against a hardcoded
    // list: the list is a property of the repository at large (it legitimately
    // includes the approved Agent SDK, ADR 0009/0010), while what THIS repair
    // must prove is that it added nothing to it.
    expect(changedInRepair('package.json', 'package-lock.json')).toEqual([]);
    const pkg = JSON.parse(sourceOf('package.json')) as { dependencies: Record<string, string> };
    for (const forbidden of ['axios', 'node-fetch', 'got', 'undici', 'p-retry', 'async-retry']) {
      expect(Object.keys(pkg.dependencies), `added ${forbidden}`).not.toContain(forbidden);
    }
  });
});

describe('ADR 0015 repair scope: X. no frozen artifact moved', () => {
  it.skipIf(!rangeAvailable)('edited no historical freeze, approval or evaluation record', () => {
    const changed = changedInRepair('docs/evaluation', 'docs/audits');
    for (const file of changed) {
      // Only NEW records may appear; nothing pre-existing may be modified.
      const status = execFileSync(
        'git',
        [
          '-C',
          REPO_ROOT,
          'diff',
          '--name-status',
          ...(REPAIR_TERMINAL_COMMIT === null
            ? [REPAIR_BASE_COMMIT]
            : [REPAIR_BASE_COMMIT, REPAIR_TERMINAL_COMMIT]),
          '--',
          file,
        ],
        { encoding: 'utf8' },
      ).trim();
      if (status.length > 0) expect(status.startsWith('A\t'), `${file}: ${status}`).toBe(true);
    }
  });

  it.skipIf(!rangeAvailable)('left the frozen retry design and the frame byte-identical', () => {
    for (const frozen of [
      'docs/evaluation/PHASE_2B_2D_A2_BOUNDED_TRANSPORT_RETRY_POLICY_DESIGN_V1.json',
      'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_FRAME_V2_GEN1.json',
    ]) {
      expect(changedInRepair(frozen)).toEqual([]);
    }
  });

  it.skipIf(!rangeAvailable)('adds ADR 0015 and edits no earlier ADR', () => {
    const status = execFileSync(
      'git',
      [
        '-C',
        REPO_ROOT,
        'diff',
        '--name-status',
        ...(REPAIR_TERMINAL_COMMIT === null
          ? [REPAIR_BASE_COMMIT]
          : [REPAIR_BASE_COMMIT, REPAIR_TERMINAL_COMMIT]),
        '--',
        'docs/adr',
      ],
      { encoding: 'utf8' },
    )
      .split('\n')
      .filter((l) => l.length > 0);
    for (const line of status) expect(line.startsWith('A\t'), line).toBe(true);
  });
});
