/**
 * FETCH POLICY v7 - THE ISOLATION TEST FOR THE BARE TRAILING-SLASH ROBOTS
 * REDIRECT CONTINUATION REPAIR (ADR 0016).
 *
 * Owner decision
 * APPROVE_FETCH_POLICY_V7_FOR_BARE_ROBOTS_TRAILING_SLASH_REDIRECT_CONTINUATION_V1
 * (docs/evaluation/PHASE_2B_2D_A2_ROBOTS_TRAILING_SLASH_FETCH_POLICY_V7_REPAIR_V1.json).
 *
 * Per the phase-isolation decision, this repair is pinned by its OWN
 * repair-scope file over its OWN commit range; no older firewall was widened
 * (each earlier repair file already reads its own terminal commit). It proves,
 * from the real git range and the real source:
 *
 *   - exactly three production files changed, by exact path, none new;
 *   - no migration, no dependency, no gateway / redirect / retry / budget /
 *     root-runner / page-evidence / frontier / CLI / classifier / SD7 /
 *     corpus change;
 *   - the INITIAL bootstrap authority is still exact-path `/robots.txt`,
 *     byte-identical to v6, so site-policy discovery still has exactly one
 *     starting point per origin;
 *   - the new capability is a SEPARATE production factory whose admissible
 *     path set is exactly two literals, with no prefix test and no
 *     normaliser anywhere near it;
 *   - the continuation predicate reads that same set and changed nothing
 *     else: every other condition's text is byte-identical to v6;
 *   - `robots.ts` is still the EXACTLY-ONE production caller of
 *     `executeWebAttempt`, with exactly two call sites and no socket of its
 *     own, and the production-factory caller set is still explicitly pinned;
 *   - `FETCH_POLICY_VERSION` is `orgunit-fetch-policy-v7`, declared once,
 *     while the v6 terminal commit still reads v6 WITHOUT the fix;
 *   - no pre-existing evaluation record, freeze or ledger was edited.
 *
 * THE RANGE IS REPAIR_BASE_COMMIT..REPAIR_TERMINAL_COMMIT. It is open to the
 * working tree only while the implementation is being written, and is pinned
 * to the implementation commit as soon as that commit exists.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** The Window-07 adjudication commit: the terminal state this repair starts from. */
const REPAIR_BASE_COMMIT = 'a1ef1e2dda57d66848052914a36508a5dd5999b4';

/**
 * The commit this repair ENDS at: the v7 implementation. Left open only while
 * the implementation is being written, and pinned immediately after it lands,
 * so a later phase is never judged against this repair's authorised surface.
 */
const REPAIR_TERMINAL_COMMIT: string | null = null;

const AUTHORISED_PRODUCTION_FILES = [
  'src/orgunits/web/policy.ts',
  'src/orgunits/web/robots.ts',
  'src/orgunits/web/robotsAuthority.ts',
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

const FORBIDDEN_PRODUCTION_FILES = [
  'src/orgunits/web/gateway.ts',
  'src/orgunits/web/retryPolicy.ts',
  'src/orgunits/web/observations.ts',
  'src/orgunits/web/redirect.ts',
  'src/orgunits/web/robotsPolicy.ts',
  'src/orgunits/web/url.ts',
  'src/orgunits/web/hostPolicy.ts',
  'src/orgunits/web/address.ts',
  'src/orgunits/web/authority.ts',
  'src/orgunits/web/pageEvidence.ts',
  'src/orgunits/web/charset.ts',
  'src/orgunits/web/extract.ts',
  'src/orgunits/web/redact.ts',
  'src/orgunits/web/evidenceCanonical.ts',
  'src/orgunits/sitemap.ts',
  'src/orgunits/orchestrator/anchors.ts',
  'src/orgunits/orchestrator/rootRunner.ts',
  'src/orgunits/orchestrator/circuitBreaker.ts',
  'src/orgunits/orchestrator/constants.ts',
  'src/orgunits/orchestrator/orchestrate.ts',
  'src/orgunits/orchestrator/frontier.ts',
  'src/orgunits/orchestrator/candidates.ts',
  'src/orgunits/orchestrator/pageCollection.ts',
  'src/orgunits/orchestrator/requestBudget.ts',
  'src/orgunits/orchestrator/run.ts',
];

const FORBIDDEN_PREFIXES = [
  'src/orgunits/classify/',
  'src/orgunits/signals/',
  'src/cli/',
  'src/db/',
  'src/ingest/',
  'migrations/',
  'src/test/harness/phase2b2d/',
  'docs/evaluation/corpus/',
];

const POLICY = 'src/orgunits/web/policy.ts';
const ROBOTS = 'src/orgunits/web/robots.ts';
const AUTHORITY = 'src/orgunits/web/robotsAuthority.ts';

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

function sourceAtV6(path: string): string {
  return execFileSync('git', ['-C', REPO_ROOT, 'show', `${REPAIR_BASE_COMMIT}:${path}`], {
    encoding: 'utf8',
  });
}

function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** The full text of one (exported or static) function: signature through its closing brace. */
function functionText(source: string, name: string): string {
  const start = source.search(
    new RegExp(
      `(export\\s+)?(static\\s+)?(async\\s+)?function\\s+${name}\\b|static\\s+${name}\\s*\\(`,
    ),
  );
  expect(start, `${name} not found`).toBeGreaterThan(-1);
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
  throw new Error(`${name} has no closing brace`);
}

// ============================================================== 1. FILE SCOPE

describe('v7 repair scope: exactly three production files, by exact path', () => {
  it.skipIf(!rangeAvailable)('changed no production file outside the authorised three', () => {
    const production = changedInRepair().filter((file) =>
      PRODUCTION_PREFIXES.some((prefix) => file.startsWith(prefix)),
    );
    expect([...production].sort()).toEqual([...AUTHORISED_PRODUCTION_FILES].sort());
  });

  it.skipIf(!rangeAvailable)('changed all three of them - this is not a vacuous range', () => {
    const changed = changedInRepair();
    for (const file of AUTHORISED_PRODUCTION_FILES) expect(changed).toContain(file);
  });

  it.skipIf(!rangeAvailable)('added no migration and changed none', () => {
    expect(changedInRepair('migrations')).toEqual([]);
  });

  it.skipIf(!rangeAvailable)('added no runtime dependency and changed no lockfile', () => {
    expect(changedInRepair('package.json', 'package-lock.json')).toEqual([]);
  });

  it.skipIf(!rangeAvailable)(
    'left the gateway, the redirect module, every other web primitive, the orchestrator and the frozen budgets untouched',
    () => {
      const changed = changedInRepair();
      for (const file of FORBIDDEN_PRODUCTION_FILES) expect(changed).not.toContain(file);
    },
  );

  it.skipIf(!rangeAvailable)(
    'changed no classifier, signals, CLI, database, ingest, harness or corpus file',
    () => {
      for (const file of changedInRepair()) {
        for (const prefix of FORBIDDEN_PREFIXES) {
          expect(file.startsWith(prefix), `${file} is under ${prefix}`).toBe(false);
        }
      }
    },
  );

  it.skipIf(!rangeAvailable)('edited no pre-existing evaluation record, freeze or ledger', () => {
    // Every evidence record in this programme is append-only. A repair may
    // ADD its own records; it may never rewrite an earlier one.
    const modified = execFileSync(
      'git',
      ['-C', REPO_ROOT, 'diff', '--diff-filter=MD', '--name-only', ...range(), '--', 'docs/'],
      { encoding: 'utf8' },
    )
      .split('\n')
      .filter((l) => l.length > 0);
    expect(modified).toEqual([]);
  });
});

// ================================================= 2. THE BOOTSTRAP DID NOT MOVE

describe('v7 repair scope: the INITIAL bootstrap authority is byte-identical to v6', () => {
  it('still accepts exactly /robots.txt, with no query and no fragment', () => {
    const authority = codeOf(sourceOf(AUTHORITY));
    expect(authority, 'the bootstrap lost its exact-path check').toMatch(
      /pathname\s*!==\s*'\/robots\.txt'\s*\|\|\s*parsed\.search\s*!==\s*''\s*\|\|\s*parsed\.hash\s*!==\s*''/,
    );
  });

  it.skipIf(!rangeAvailable)(
    'is byte-for-byte the v6 function - this repair did not widen it',
    () => {
      // THE ONE-LINE FIX THAT WAS REFUSED. Adding `/robots.txt/` here would
      // have been three characters, and it would have given site-policy
      // discovery a SECOND starting point that a caller could choose on its
      // own authority. The v7 capability is reachable only from a redirect
      // target a host itself sent.
      const now = functionText(sourceOf(AUTHORITY), 'forRobotsTxtBootstrap');
      const before = functionText(sourceAtV6(AUTHORITY), 'forRobotsTxtBootstrap');
      expect(now.replace(/\s+/g, ' ')).toBe(before.replace(/\s+/g, ' '));
    },
  );

  it('never names the trailing-slash form inside the bootstrap function', () => {
    const bootstrap = functionText(sourceOf(AUTHORITY), 'forRobotsTxtBootstrap');
    expect(bootstrap).not.toContain("'/robots.txt/'");
    expect(bootstrap).not.toContain('CONTINUATION_PATHS');
  });
});

// ============================================ 3. THE NEW CAPABILITY, EXACTLY

describe('v7 repair scope: the redirect-continuation authority is a separate, two-literal capability', () => {
  it('exists as its own production factory', () => {
    expect(codeOf(sourceOf(AUTHORITY))).toMatch(/static forRobotsTxtRedirectContinuation\s*\(/);
  });

  it('declares its admissible path set as exactly two frozen literals', () => {
    const code = codeOf(sourceOf(AUTHORITY));
    expect(code).toMatch(
      /CONTINUATION_PATHS[^=]*=\s*Object\.freeze\(\[\s*'\/robots\.txt',\s*'\/robots\.txt\/',\s*\]\)/,
    );
  });

  it('uses NO prefix test, NO regular expression and NO trailing-slash normaliser', () => {
    // An open set nobody enumerated is the failure mode this factory exists
    // to avoid: `startsWith('/robots.txt')` admits `/robots.txt/index` and
    // every other child path.
    const code = codeOf(sourceOf(AUTHORITY));
    expect(code).not.toMatch(/startsWith\s*\(/);
    expect(code).not.toMatch(/endsWith\s*\(/);
    expect(code).not.toMatch(/replace\s*\(\s*\/\\?\/?\$\//);
    expect(code).not.toMatch(/\/\^\\\/robots/);
    expect(code).not.toContain('normalis');
  });

  it('produces NOT_APPLICABLE and a URL scope, never a caller-chosen decision', () => {
    const factory = functionText(sourceOf(AUTHORITY), 'forRobotsTxtRedirectContinuation');
    expect(factory).toContain("new RobotsAuthorisation('NOT_APPLICABLE', null, parsed.toString())");
    expect(factory).not.toContain('ALLOWED');
    expect(factory).not.toContain('scopedToUrl: null');
    expect(factory).not.toContain('null)');
  });

  it('is the THIRD production factory and no more; the unscoped seam stays test-only', () => {
    const code = codeOf(sourceOf(AUTHORITY));
    expect(code.match(/static for[A-Za-z]+\s*\(/g)?.sort()).toEqual([
      'static forEvaluatedPolicy(',
      'static forRobotsTxtBootstrap(',
      'static forRobotsTxtRedirectContinuation(',
      'static forTestsOnly(',
    ]);
    expect(code, 'the test seam lost its runtime guard').toContain("process.env['VITEST']");
    // The seam is the ONLY unscoped constructor, and it is still the only one.
    expect(code.match(/null\s*\)\s*;\s*\n\s*}/g)?.length ?? 0).toBeGreaterThan(0);
  });

  it('opens no socket, no database and no clock in the authority module', () => {
    const source = sourceOf(AUTHORITY);
    for (const forbidden of ['node:http', 'node:https', 'node:net', 'node:tls', 'node:dns', 'pg']) {
      expect(codeOf(source), forbidden).not.toMatch(
        new RegExp(`from\\s+'${forbidden.replace('/', '\\/')}'`),
      );
    }
    expect(codeOf(source)).not.toMatch(/\bfetch\s*\(/);
    expect(codeOf(source)).not.toContain('Date.now(');
  });
});

// ================================================ 4. THE PREDICATE'S ONE CHANGE

describe('v7 repair scope: continuationTargetFor changed exactly its path condition', () => {
  it('reads the authority module’s set rather than a literal of its own', () => {
    const predicate = functionText(sourceOf(ROBOTS), 'continuationTargetFor');
    expect(predicate).toContain('RobotsAuthorisation.CONTINUATION_PATHS.includes');
    // Exactly one path comparison, and it is that one.
    expect(predicate).not.toContain("'/robots.txt'");
    expect(predicate).not.toContain("'/robots.txt/'");
    expect(predicate).not.toMatch(/startsWith|endsWith/);
  });

  it.skipIf(!rangeAvailable)('changed NOTHING else in the predicate', () => {
    // Every other condition, character for character, as v6 had it: usable
    // redirect facts, both URLs through validateRequestUrl, same registrable
    // domain, same scheme or http -> https, not a self-redirect.
    const normalise = (s: string) =>
      functionText(s, 'continuationTargetFor')
        .replace(
          /if\s*\(!RobotsAuthorisation\.CONTINUATION_PATHS\.includes\(target\.value\.requestPath\)\)\s*return null;/,
          'PATH_CONDITION',
        )
        .replace(
          /if\s*\(target\.value\.requestPath\s*!==\s*'\/robots\.txt'\)\s*return null;/,
          'PATH_CONDITION',
        )
        .replace(/\s+/g, ' ');
    expect(normalise(sourceOf(ROBOTS))).toBe(normalise(sourceAtV6(ROBOTS)));
  });

  it('keeps every independent gate outside this module, as v6 did', () => {
    // Root scope, host policy, DNS, address classification and TLS are the
    // gateway's and run independently for the second request. A second
    // implementation here would be a drifting trust boundary.
    const code = codeOf(sourceOf(ROBOTS));
    expect(code).toContain("import { validateRequestUrl } from './url.js';");
    expect(code).not.toMatch(/tldts|publicSuffix|\.split\('\.'\)/);
    expect(code).not.toMatch(/checkHostAdmissible|classifyAddress|resolveHostname/);
  });
});

// ================================================== 5. THE CALLER SET IS PINNED

describe('v7 repair scope: robots.ts is still the exactly-one production caller', () => {
  it('has exactly two executeWebAttempt call sites and owns no socket', () => {
    const source = sourceOf(ROBOTS);
    for (const forbidden of ['node:http', 'node:https', 'node:net', 'node:tls', 'node:dns']) {
      expect(source, forbidden).not.toContain(forbidden);
    }
    expect(source).not.toContain('fetch(');
    // Two SITES - the policy fetch and the ordinary-page fetch. Both
    // continuation and retry reuse the first; neither adds a third.
    expect(source.match(/executeWebAttempt\(/g)).toHaveLength(2);
  });

  it('constructs its authorities ONLY from the three production factories', () => {
    const code = codeOf(sourceOf(ROBOTS));
    expect(code).toContain('RobotsAuthorisation.forRobotsTxtBootstrap(url)');
    expect(code).toContain('RobotsAuthorisation.forRobotsTxtRedirectContinuation(url)');
    expect(code).toMatch(/RobotsAuthorisation\.forEvaluatedPolicy\s*\(/);
    expect(code).not.toContain('forTestsOnly');
    expect(code).not.toMatch(/createRobotsAuthorisation|forTesting/);
  });

  it('is STILL the only production file that calls the gateway', () => {
    // Read live and across the whole namespace, because this is an invariant
    // the repair had to preserve rather than a property of its own range.
    const walk = (dir: string): string[] =>
      execFileSync('git', ['-C', REPO_ROOT, 'ls-files', dir], { encoding: 'utf8' })
        .split('\n')
        .filter((f) => f.endsWith('.ts') && !f.startsWith('src/test/'));
    const callers = walk('src')
      .filter((f) => f !== 'src/orgunits/web/gateway.ts')
      .filter((f) =>
        /\bexecuteWebAttempt\s*\(/.test(codeOf(readFileSync(join(REPO_ROOT, f), 'utf8'))),
      );
    expect(callers.sort()).toEqual(['src/orgunits/web/robots.ts']);
  });

  it('picks the factory by a CLOSED two-member role, not by a boolean or a string compare on the URL', () => {
    const code = codeOf(sourceOf(ROBOTS));
    expect(code).toContain(
      "export type PolicyRequestRole = 'BOOTSTRAP' | 'REDIRECT_CONTINUATION';",
    );
    // The initial request is BOOTSTRAP and the continuation is not - proved
    // by the two call sites of fetchWithBoundedRetry.
    expect(code).toContain("fetchWithBoundedRetry(requestedUrl, 'BOOTSTRAP')");
    expect(code).toContain("fetchWithBoundedRetry(requestedUrl, 'REDIRECT_CONTINUATION')");
  });
});

// ====================================================== 6. POLICY VERSION

describe('v7 repair scope: the policy version, current and historical', () => {
  it('production is orgunit-fetch-policy-v7, declared exactly once', () => {
    expect(sourceOf(POLICY).match(/FETCH_POLICY_VERSION\s*=\s*'[^']+'/g)).toEqual([
      "FETCH_POLICY_VERSION = 'orgunit-fetch-policy-v7'",
    ]);
  });

  it.skipIf(!rangeAvailable)('policy.ts moved ONLY its version string and its prose', () => {
    const strip = (s: string) =>
      codeOf(s)
        .replace(/FETCH_POLICY_VERSION = '[^']+'/, 'FETCH_POLICY_VERSION = X')
        .replace(/\s+/g, ' ');
    expect(strip(sourceOf(POLICY))).toBe(strip(sourceAtV6(POLICY)));
  });

  it.skipIf(!rangeAvailable)('the v6 terminal commit is still v6, WITHOUT the fix', () => {
    expect(sourceAtV6(POLICY).match(/FETCH_POLICY_VERSION\s*=\s*'[^']+'/g)).toEqual([
      "FETCH_POLICY_VERSION = 'orgunit-fetch-policy-v6'",
    ]);
    const before = codeOf(sourceAtV6(AUTHORITY));
    expect(before).not.toContain('forRobotsTxtRedirectContinuation');
    expect(before).not.toContain('CONTINUATION_PATHS');
    expect(codeOf(sourceAtV6(ROBOTS))).toContain(
      "if (target.value.requestPath !== '/robots.txt') return null;",
    );
  });

  it('kept every frozen policy value, and the hop bound, exactly where they were', () => {
    const source = sourceOf(POLICY);
    expect(source).toContain('export const CONNECT_TIMEOUT_MS = 30_000;');
    expect(source).toContain('export const TOTAL_TIMEOUT_MS = 45_000;');
    expect(source).toContain('export const MAX_BODY_BYTES = 5 * 1024 * 1024;');
    expect(source).toContain("'NWFPartnershipEngine-Research/1.0 (+https://newwavefluent.com/)'");
    expect(source).toContain('new Set([301, 302, 303, 307, 308])');
    expect(source.match(/MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS\s*=\s*\d+/g)).toEqual([
      'MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS = 1',
    ]);
    expect(source.match(/MAX_ROBOTS_TRANSPORT_RETRIES_PER_POLICY_RESOLUTION\s*=\s*\d+/g)).toEqual([
      'MAX_ROBOTS_TRANSPORT_RETRIES_PER_POLICY_RESOLUTION = 1',
    ]);
  });

  it('records that the hop bound is now the WHOLE bound', () => {
    // ADR 0012 proved a two-request ceiling from the predicate's shape; ADR
    // 0013 voided it by admitting a host change, and ADR 0016 voids what was
    // left on a single origin. The warning must live where the constant does.
    expect(sourceOf(POLICY)).toContain('RAISING IT WOULD REQUIRE A VISITED-URL SET');
  });
});
