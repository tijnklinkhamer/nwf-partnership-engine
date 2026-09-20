/**
 * PHASE 2B ROBOTS OPTION-C-LITE REPAIR — THE ISOLATION TEST FOR THIS REPAIR.
 *
 * Every repair in this repository carries an isolation test bounded to its OWN
 * commit range, and every earlier one is pinned to its own phase's terminal
 * commit rather than to HEAD (see `orgunitRobotsOptionBRepairScope.test.ts`,
 * which this repair pinned closed). This is ADR 0013's, and it is why none of
 * those earlier files had to be weakened: an old phase's change surface is
 * preserved exactly over the range where it was approved and true, and THIS
 * file governs what the current change surface is allowed to be.
 *
 * It proves, from the real git range and the real source:
 *
 *   - exactly three production files changed, by exact path, and they are the
 *     three ADR 0013's authorisation names;
 *   - no migration, no gateway, no redirect module, no root-authority module,
 *     no classifier production file, no CLI, no database layer, no provider;
 *   - the fetch policy version is v3 and the continuation bound is still ONE
 *     hop;
 *   - the predicate's host boundary is the SINGLE registrable-domain
 *     implementation, reached through the gateway's own URL gate, and not a
 *     second host taxonomy written here;
 *   - a cross-registrable-domain target is still refused;
 *   - `rootRunner.ts`'s only semantic effect is host and request accounting
 *     for the at-most-two-request site-policy resolution;
 *   - no firewall file was touched at all.
 *
 * THE RANGE IS REPAIR_BASE_COMMIT..REPAIR_TERMINAL_COMMIT. It was BASE ->
 * WORKING TREE while this WAS the current phase; the repair is now history,
 * so its terminal commit is pinned here, exactly the way ADR 0012's is. A
 * pinned range is what stops a landed phase's isolation test from policing
 * every later phase forever - the discipline already adopted for A1, A1b,
 * A3a, F7 and the Option-B repair.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FETCH_POLICY_VERSION,
  MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS,
} from '../../orgunits/web/policy.js';
import { continuationTargetFor } from '../../orgunits/web/robots.js';
import { deriveRedirectFacts } from '../../orgunits/web/redirect.js';
import type { WebAttemptResult } from '../../orgunits/web/gateway.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/**
 * The commit this repair branched from: the Batch-02 v2 continuation
 * execution record, which is where the SECOND host-changing robots redirect
 * was observed and where this repair's authorisation begins.
 */
const REPAIR_BASE_COMMIT = 'e860b29853cff308f4a27ac8cd089745d1dd12a3';

/**
 * The commit this repair ENDED at: the Option-C-lite implementation itself.
 * Everything after it - the targeted-revalidation authority and result
 * records, and every later phase - is outside this repair's change surface
 * and is not this file's business.
 */
const REPAIR_TERMINAL_COMMIT = 'c2e07b87ab2394287154977580240a5723bf6cbd';

/** The exact production surface ADR 0013 is authorised to change. */
const AUTHORISED_PRODUCTION_FILES = [
  'src/orgunits/orchestrator/rootRunner.ts',
  'src/orgunits/web/policy.ts',
  'src/orgunits/web/robots.ts',
];

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

/** Named production files this repair must not touch, however tempting. */
const FORBIDDEN_PRODUCTION_FILES = [
  'src/orgunits/web/gateway.ts',
  'src/orgunits/web/redirect.ts',
  'src/orgunits/web/robotsAuthority.ts',
  'src/orgunits/web/robotsPolicy.ts',
  'src/orgunits/web/hostPolicy.ts',
  'src/orgunits/web/url.ts',
  'src/orgunits/web/address.ts',
  'src/orgunits/web/authority.ts',
  'src/orgunits/web/observations.ts',
  'src/orgunits/web/pageEvidence.ts',
  'src/orgunits/orchestrator/constants.ts',
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

const rangeAvailable = commitExists(REPAIR_BASE_COMMIT) && commitExists(REPAIR_TERMINAL_COMMIT);

/** Every path this repair changed, over its own pinned commit range. */
function changedInRepair(...paths: readonly string[]): string[] {
  return execFileSync(
    'git',
    [
      '-C',
      REPO_ROOT,
      'diff',
      '--name-only',
      REPAIR_BASE_COMMIT,
      REPAIR_TERMINAL_COMMIT,
      '--',
      ...paths,
    ],
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter((line) => line.length > 0);
}

/**
 * The same range, with git's own CHANGE STATUS per path: `A` added, `M`
 * modified, `D` deleted, `R<score>` renamed. `--name-only` cannot tell those
 * apart, which is precisely the defect this file once carried: it read an
 * ADDED ADR 0013 as evidence that an ADR had been edited.
 */
function nameStatusInRepair(...paths: readonly string[]): string[] {
  return execFileSync(
    'git',
    [
      '-C',
      REPO_ROOT,
      'diff',
      '--name-status',
      '--find-renames',
      REPAIR_BASE_COMMIT,
      REPAIR_TERMINAL_COMMIT,
      '--',
      ...paths,
    ],
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter((line) => line.length > 0);
}

function diffOf(path: string): string {
  return execFileSync(
    'git',
    ['-C', REPO_ROOT, 'diff', '-U0', REPAIR_BASE_COMMIT, REPAIR_TERMINAL_COMMIT, '--', path],
    { encoding: 'utf8' },
  );
}

/** Added/removed lines of a diff, with hunk headers and file headers dropped. */
function changedLinesOf(diff: string): string[] {
  return diff
    .split('\n')
    .filter((line) => /^[+-]/.test(line) && !/^(\+\+\+|---)/.test(line))
    .map((line) => line.slice(1));
}

function sourceOf(path: string): string {
  return readFileSync(join(REPO_ROOT, path), 'utf8');
}

describe('ADR 0013 repair scope: exactly three production files, by exact path', () => {
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

  it.skipIf(!rangeAvailable)(
    'left the gateway, the redirect module, every other web primitive and the frozen budgets untouched',
    () => {
      const changed = changedInRepair();
      for (const file of FORBIDDEN_PRODUCTION_FILES) expect(changed).not.toContain(file);
    },
  );

  it.skipIf(!rangeAvailable)(
    'changed no classifier production file, no CLI, no database layer, no signals and no provider',
    () => {
      for (const file of changedInRepair()) {
        expect(file.startsWith('src/orgunits/classify/'), file).toBe(false);
        expect(file.startsWith('src/cli/'), file).toBe(false);
        expect(file.startsWith('src/db/'), file).toBe(false);
        expect(file.startsWith('src/orgunits/signals/'), file).toBe(false);
        expect(file.startsWith('src/config/'), file).toBe(false);
      }
    },
  );

  it.skipIf(!rangeAvailable)('touched no firewall file at all', () => {
    expect(changedInRepair('src/test/firewall')).toEqual([]);
  });

  it.skipIf(!rangeAvailable)('opened no new production namespace', () => {
    for (const forbidden of [
      'src/research/',
      'src/crawl/',
      'src/scrape/',
      'src/enrich/',
      'src/orgunits/candidates/',
      'src/orgunits/web/frontier.ts',
      'src/orgunits/web/sitemap.ts',
    ]) {
      expect(changedInRepair(forbidden), forbidden).toEqual([]);
    }
  });

  it.skipIf(!rangeAvailable)('edited no historical classifier freeze and no owner approval', () => {
    for (const file of changedInRepair('docs/evaluation')) {
      expect(file.toUpperCase().includes('FREEZE'), file).toBe(false);
      expect(file.toUpperCase().includes('APPROVAL'), file).toBe(false);
    }
  });

  it.skipIf(!rangeAvailable)(
    'added exactly ADR 0013 and edited no ADR that already existed',
    () => {
      // ADR 0006's and ADR 0012's bytes are history. ADR 0013 supersedes one
      // premise and one boundary of ADR 0012 by SAYING SO, never by editing it.
      //
      // A NAME-ONLY diff cannot express that, because it reports an ADDED path
      // and a MODIFIED one identically - so the honest assertion is over git's
      // own change STATUS, and it is exact in both directions at once: the one
      // and only entry under docs/adr is the ADDITION of ADR 0013. An edited,
      // deleted or renamed predecessor would appear as an M, D or R line and
      // fail; a second new ADR would appear as an extra A line and fail too.
      expect(nameStatusInRepair('docs/adr')).toEqual([
        'A\tdocs/adr/0013-same-registrable-domain-robots-redirect-continuation.md',
      ]);
      expect(
        sourceOf('docs/adr/0013-same-registrable-domain-robots-redirect-continuation.md'),
      ).toContain('RFC 9309 §2.3.1.2');
    },
  );
});

describe('ADR 0013 repair scope: the policy the repair declares', () => {
  it('names the new fetch policy version, and it is v3', () => {
    expect(FETCH_POLICY_VERSION).toBe('orgunit-fetch-policy-v3');
    expect(
      sourceOf('src/orgunits/web/policy.ts').match(/FETCH_POLICY_VERSION\s*=\s*'[^']+'/g),
    ).toEqual(["FETCH_POLICY_VERSION = 'orgunit-fetch-policy-v3'"]);
  });

  it('did NOT raise the continuation bound to RFC 9309’s five', () => {
    expect(MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS).toBe(1);
    expect(
      sourceOf('src/orgunits/web/policy.ts').match(
        /MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS\s*=\s*\d+/g,
      ),
    ).toEqual(['MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS = 1']);
  });

  it('records that the structural two-request argument has expired', () => {
    // ADR 0012 proved a two-request ceiling from the predicate's own shape.
    // C-lite admits a host change, so that argument is void and the constant
    // is now the whole bound. policy.ts must say so where the constant lives,
    // or a later reader could raise it on an argument that no longer holds.
    const source = sourceOf('src/orgunits/web/policy.ts');
    expect(source).toContain('RAISING IT WOULD REQUIRE A VISITED-URL SET');
  });

  it('changed nothing else in the policy: the timeouts, caps and headers are the frozen ones', () => {
    const source = sourceOf('src/orgunits/web/policy.ts');
    expect(source).toContain('export const CONNECT_TIMEOUT_MS = 30_000;');
    expect(source).toContain('export const TOTAL_TIMEOUT_MS = 45_000;');
    expect(source).toContain('export const MAX_BODY_BYTES = 5 * 1024 * 1024;');
    expect(source).toContain("'NWFPartnershipEngine-Research/1.0 (+https://newwavefluent.com/)'");
    expect(source).toContain('new Set([301, 302, 303, 307, 308])');
  });

  it.skipIf(!rangeAvailable)('changed no value in policy.ts other than the version string', () => {
    // Every changed CODE line (comments carry the reasoning and are reviewed
    // as prose) must be the version assignment itself.
    const lines = changedLinesOf(diffOf('src/orgunits/web/policy.ts'))
      .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    expect(lines).toEqual([
      "export const FETCH_POLICY_VERSION = 'orgunit-fetch-policy-v2';",
      "export const FETCH_POLICY_VERSION = 'orgunit-fetch-policy-v3';",
    ]);
  });
});

describe('ADR 0013 repair scope: the predicate uses the ONE registrable-domain implementation', () => {
  const redirected = (from: string, location: string): WebAttemptResult =>
    ({ redirect: deriveRedirectFacts(from, location) }) as unknown as WebAttemptResult;

  const WWW = 'https://www.example.ac.uk/robots.txt';

  it('reaches the registrable domain through the gateway’s own URL gate', () => {
    const source = sourceOf('src/orgunits/web/robots.ts');
    // Comments are stripped for the NEGATIVE checks below: the file's header
    // legitimately explains which implementation it defers to, and a scan
    // that tripped on that prose would be asserting about documentation.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // It calls validateRequestUrl, which imports icannRegistrableDomain from
    // Phase 1D's single tldts implementation. Two definitions of "same
    // registrable domain" would be two trust boundaries that can disagree.
    expect(source).toContain("import { validateRequestUrl } from './url.js';");
    expect(source).toContain('validateRequestUrl(requestedRobotsUrl)');
    expect(source).toContain('validateRequestUrl(facts.toUrlResolved)');
    // And it writes no host taxonomy of its own.
    expect(code).not.toMatch(/tldts|publicSuffix|\.split\('\.'\)/);
    expect(code).not.toMatch(/startsWith\('www\.'\)|replace\(\/\^www\\\./);
  });

  it('continues inside one registrable domain and reports the host change', () => {
    expect(continuationTargetFor(WWW, redirected(WWW, 'https://example.ac.uk/robots.txt'))).toEqual(
      { url: 'https://example.ac.uk/robots.txt', hostChanged: true },
    );
  });

  it('refuses EVERY cross-registrable-domain target', () => {
    for (const target of [
      'https://example.com/robots.txt',
      'https://www.example-two.ac.uk/robots.txt',
      'https://elsewhere.fr/robots.txt',
      'https://attacker.example.com/robots.txt',
    ]) {
      expect(continuationTargetFor(WWW, redirected(WWW, target)), target).toBeNull();
    }
  });

  it('robots.ts is still the one production caller of the gateway, and owns no socket', () => {
    const source = sourceOf('src/orgunits/web/robots.ts');
    for (const forbidden of ['node:http', 'node:https', 'node:net', 'node:tls', 'node:dns']) {
      expect(source, forbidden).not.toContain(forbidden);
    }
    expect(source).not.toContain('fetch(');
    expect(source).toContain('RobotsAuthorisation.forRobotsTxtBootstrap(url)');
    expect(source).not.toMatch(/createRobotsAuthorisation|forTesting|ALLOWED'\s*\)/);
    // Exactly two call sites, as ADR 0012 s6 established: the policy fetch
    // and the ordinary-page fetch. The continuation reuses the first.
    expect(source.match(/executeWebAttempt\(/g)).toHaveLength(2);
  });

  it('fails closed when no host ledger is supplied', () => {
    const source = sourceOf('src/orgunits/web/robots.ts');
    expect(source).toContain(
      'const REFUSE_HOST_CHANGING_CONTINUATION: HostChangingContinuationAdmission = () => false;',
    );
    expect(source).toContain(
      'context.admitHostChangingContinuation ?? REFUSE_HOST_CHANGING_CONTINUATION',
    );
  });

  it('memoises the target origin ONLY when the hostname did not change', () => {
    const source = sourceOf('src/orgunits/web/robots.ts');
    expect(source).toContain('!continuation.hostChanged &&');
  });
});

describe('ADR 0013 repair scope: rootRunner.ts changed host and request accounting only', () => {
  /**
   * Every identifier the accounting change is allowed to touch. A changed
   * CODE line that mentions none of these - and is not bare punctuation from
   * a reformatted call - is a behaviour change outside the authorisation.
   */
  const ACCOUNTING_TOKENS = [
    'admitHostChangingContinuation',
    'mayReachContinuationHost',
    'hostnameOf',
    'hostsUsed',
    'continuationUrl',
    'pendingHost',
    'candidate',
    'projected',
    'validated',
    'validateRequestUrl',
    'checkRootScope',
    'checkHostAdmissible',
    'circuitBreaker.isOpen',
    'MAX_HOSTS_PER_ROOT',
    'attemptedHost',
    '.hostname',
    'result.robots.robotsFetch',
    'runId',
    'root,',
    'targetUrl',
    'attemptNo',
    'discoveryMethod',
    'discoveryParentUrl',
    'return false',
    'return true',
    'return null',
  ];

  it.skipIf(!rangeAvailable)(
    'every changed code line is part of the host or request accounting',
    () => {
      const lines = changedLinesOf(diffOf('src/orgunits/orchestrator/rootRunner.ts'))
        .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .filter((line) => !/^[|{};,()\s]+$/.test(line))
        // A `function`/`try`/`catch` header carries no behaviour of its own.
        .filter((line) => !/^(function|try|\}\s*catch)\b/.test(line));
      for (const line of lines) {
        expect(
          ACCOUNTING_TOKENS.some((token) => line.includes(token)),
          `rootRunner.ts changed a line outside host/request accounting: ${line}`,
        ).toBe(true);
      }
      expect(lines.length).toBeGreaterThan(0);
    },
  );

  it.skipIf(!rangeAvailable)('added no import, so it reaches nothing new', () => {
    const added = changedLinesOf(diffOf('src/orgunits/orchestrator/rootRunner.ts')).filter((line) =>
      /^\s*import\s/.test(line),
    );
    expect(added).toEqual([]);
  });

  it('keeps the unchanged 60-request ceiling and its two-request robots prediction', () => {
    const source = sourceOf('src/orgunits/orchestrator/rootRunner.ts');
    expect(source).toContain('const predictedCost = (needsRobots ? 2 : 0) + 1;');
    expect(source).toContain('budget.consume(robotsRequestCount)');
    const constants = sourceOf('src/orgunits/orchestrator/constants.ts');
    expect(constants).toContain('export const MAX_TOTAL_REQUESTS_PER_ROOT = 60;');
    expect(constants).toContain('export const MAX_PAGE_ATTEMPTS_PER_ROOT = 35;');
    expect(constants).toContain('export const MAX_HOSTS_PER_ROOT = 8;');
  });

  it('gives a site-policy request no exemption from the host cap', () => {
    const source = sourceOf('src/orgunits/orchestrator/rootRunner.ts');
    // The projection includes the pending host, so the eighth host's
    // continuation cannot quietly become a ninth.
    expect(source).toContain('projected.add(pendingHost);');
    expect(source).toContain(
      'if (!projected.has(candidate) && projected.size >= MAX_HOSTS_PER_ROOT) return false;',
    );
  });
});
