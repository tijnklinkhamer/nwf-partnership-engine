/**
 * PHASE 2B ROBOTS OPTION-B REPAIR — THE ISOLATION TEST FOR THIS REPAIR.
 *
 * Every earlier phase carries an isolation test bounded to its OWN commit
 * range (see `orgunitCorpus2DA1FrameIsolation.test.ts` and its siblings). This
 * is the ADR 0012 repair's, and it is the reason those earlier ones did not
 * have to be weakened: an old phase's "forbid `src/orgunits/`" is preserved
 * exactly over the range where it was approved and true, and THIS file governs
 * what the current change surface is allowed to be.
 *
 * It proves, from the real git range and the real source:
 *
 *   - exactly three production files changed, by exact path;
 *   - no migration, no gateway, no redirect module, no classifier production
 *     file, no CLI, no database layer, no provider;
 *   - the fetch policy version is v2 and the continuation bound is ONE hop;
 *   - the continuation predicate is same-host only - no cross-host hop of any
 *     kind, including the `www.` canonicalisation ADR 0008 accepts for
 *     ordinary pages;
 *   - `rootRunner.ts`'s only semantic effect is total-request accounting for
 *     the at-most-two-request robots resolution;
 *   - no firewall was weakened: the only firewall files this range touches are
 *     the two whose HISTORICAL RANGES were bounded to their own phase ends,
 *     and neither lost a forbidden path, module or assertion.
 *
 * The range is BASE -> WORKING TREE on purpose, and that is not the defect
 * `docs/evaluation/PHASE_2B_ROBOTS_OPTION_B_FREEZE_COLLISION_OWNER_DECISION_V1.json`
 * corrects: this repair IS the current phase, so its own end is the working
 * tree. The defect was a PAST phase measuring itself against a future it
 * could not have been approved for. When this repair becomes history, its
 * terminal commit is pinned here the same way the others now are.
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
import type { WebAttemptResult } from '../../orgunits/web/gateway.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/**
 * The commit this repair branched from: the acquisition-yield root-cause audit
 * that found the capability limit ADR 0012 repairs.
 */
const REPAIR_BASE_COMMIT = '74d8139cc3358ae600bb8751ae81121711ae313b';

/** The exact production surface this repair is authorised to change. */
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
];

/**
 * The two firewall files this repair touches, and the ONLY change either was
 * allowed: binding its historical git range to its own phase's terminal
 * commit instead of to HEAD.
 */
const TEMPORALLY_BOUND_FIREWALLS = [
  'src/test/firewall/phase2b2d2cF7RestartExecution.firewall.test.ts',
  'src/test/firewall/phase2b2d2cF9ScoringAdapter.firewall.test.ts',
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

const baseAvailable = commitExists(REPAIR_BASE_COMMIT);

/** Every path this repair changed: its base commit -> the current working tree. */
function changedInRepair(...paths: readonly string[]): string[] {
  return execFileSync(
    'git',
    ['-C', REPO_ROOT, 'diff', '--name-only', REPAIR_BASE_COMMIT, '--', ...paths],
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter((line) => line.length > 0);
}

function diffOf(path: string): string {
  return execFileSync('git', ['-C', REPO_ROOT, 'diff', '-U0', REPAIR_BASE_COMMIT, '--', path], {
    encoding: 'utf8',
  });
}

/** Added/removed lines of a diff, with hunk headers and file headers dropped. */
function changedLinesOf(diff: string): string[] {
  return diff
    .split('\n')
    .filter((line) => /^[+-]/.test(line) && !/^(\+\+\+|---)/.test(line))
    .map((line) => line.slice(1));
}

describe('ADR 0012 repair scope: exactly three production files, by exact path', () => {
  it.skipIf(!baseAvailable)('changed no production file outside the authorised three', () => {
    const changed = changedInRepair();
    const production = changed.filter((file) =>
      PRODUCTION_PREFIXES.some((prefix) => file.startsWith(prefix)),
    );
    expect([...production].sort()).toEqual([...AUTHORISED_PRODUCTION_FILES].sort());
  });

  it.skipIf(!baseAvailable)('changed all three of them - this is not a vacuous range', () => {
    const changed = changedInRepair();
    for (const file of AUTHORISED_PRODUCTION_FILES) expect(changed).toContain(file);
  });

  it.skipIf(!baseAvailable)('added no migration and changed none', () => {
    expect(changedInRepair('migrations')).toEqual([]);
  });

  it.skipIf(!baseAvailable)(
    'left the gateway, the redirect module and every other web primitive untouched',
    () => {
      const changed = changedInRepair();
      for (const file of FORBIDDEN_PRODUCTION_FILES) expect(changed).not.toContain(file);
    },
  );

  it.skipIf(!baseAvailable)(
    'changed no classifier production file, no CLI, no database layer and no provider',
    () => {
      const changed = changedInRepair();
      for (const file of changed) {
        expect(file.startsWith('src/orgunits/classify/'), file).toBe(false);
        expect(file.startsWith('src/cli/'), file).toBe(false);
        expect(file.startsWith('src/db/'), file).toBe(false);
        expect(file.startsWith('src/orgunits/signals/'), file).toBe(false);
      }
    },
  );
});

describe('ADR 0012 repair scope: the policy the repair declares', () => {
  it('names the new fetch policy version, and it is v2', () => {
    expect(FETCH_POLICY_VERSION).toBe('orgunit-fetch-policy-v2');
  });

  it('bounds a site-policy continuation at exactly ONE hop', () => {
    expect(MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS).toBe(1);
  });

  it('does not reuse ADR 0008’s five-hop ordinary-page budget for a policy resource', () => {
    const source = readFileSync(join(REPO_ROOT, 'src/orgunits/web/policy.ts'), 'utf8');
    // The only assignment of the constant, anywhere in the file, is to 1.
    expect(source.match(/MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS\s*=\s*\d+/g)).toEqual([
      'MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS = 1',
    ]);
  });
});

describe('ADR 0012 repair scope: the continuation predicate is same-host, single-hop', () => {
  const resultRedirectingTo = (target: string | null): WebAttemptResult =>
    ({
      redirect:
        target === null
          ? null
          : { toUrlResolved: target, targetMalformed: false, status: 301, locationRaw: target },
    }) as unknown as WebAttemptResult;

  const from = 'https://www.example.edu/robots.txt';

  it('continues the one authorised shape: http -> https on the identical hostname', () => {
    expect(
      continuationTargetFor(
        'http://www.example.edu/robots.txt',
        resultRedirectingTo('https://www.example.edu/robots.txt'),
      ),
    ).toBe('https://www.example.edu/robots.txt');
  });

  it('refuses EVERY cross-host target, including a www canonicalisation', () => {
    for (const target of [
      'https://example.edu/robots.txt',
      'https://www2.example.edu/robots.txt',
      'https://international.example.edu/robots.txt',
      'https://elsewhere.fr/robots.txt',
    ]) {
      expect(continuationTargetFor(from, resultRedirectingTo(target)), target).toBeNull();
    }
  });

  it('refuses a second hop by refusing the only target a first hop could reach', () => {
    // From an https policy URL the sole same-host, non-downgrading target is
    // the identical URL, and a self-redirect is refused - so a chain has
    // nowhere to go even before the loop bound is applied.
    expect(continuationTargetFor(from, resultRedirectingTo(from))).toBeNull();
  });

  it('refuses any path that is not exactly the same host’s own /robots.txt', () => {
    for (const target of [
      'https://www.example.edu/robots',
      'https://www.example.edu/policy/robots.txt',
      'https://www.example.edu/robots.txt?v=2',
      'https://www.example.edu/robots.txt#top',
    ]) {
      expect(continuationTargetFor(from, resultRedirectingTo(target)), target).toBeNull();
    }
  });

  it('robots.ts is still the one production caller of the gateway, and owns no socket', () => {
    const source = readFileSync(join(REPO_ROOT, 'src/orgunits/web/robots.ts'), 'utf8');
    for (const forbidden of ['node:http', 'node:https', 'node:net', 'node:tls', 'node:dns']) {
      expect(source, forbidden).not.toContain(forbidden);
    }
    expect(source).not.toContain('fetch(');
    // Both requests go through the ONE gateway entry point, under freshly
    // minted URL-scoped authorities - never a reused or manufactured verdict.
    expect(source).toContain('RobotsAuthorisation.forRobotsTxtBootstrap(url)');
    expect(source).not.toMatch(/createRobotsAuthorisation|forTesting|ALLOWED'\s*\)/);
  });
});

describe('ADR 0012 repair scope: rootRunner.ts changed request accounting and nothing else', () => {
  /**
   * Every identifier the accounting change is allowed to touch. A changed
   * CODE line that mentions none of these - and is not bare punctuation from
   * a reformatted union - is a behaviour change outside the authorisation.
   */
  const ACCOUNTING_TOKENS = [
    'robotsRequestCount',
    'robotsFetched',
    'robotsRequests',
    'predictedCost',
    'budget.consume',
    'result.robots.robotsFetch',
    'WebAttemptResult',
    'status',
    'decision',
  ];

  it.skipIf(!baseAvailable)(
    'every changed code line is part of the robots request accounting',
    () => {
      const lines = changedLinesOf(diffOf('src/orgunits/orchestrator/rootRunner.ts'))
        // Comments carry the reasoning and are reviewed as prose, not as code.
        .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        // Punctuation-only lines produced by reformatting a union type.
        .filter((line) => !/^[|{};,()\s]+$/.test(line));
      for (const line of lines) {
        expect(
          ACCOUNTING_TOKENS.some((token) => line.includes(token)),
          `rootRunner.ts changed a line outside request accounting: ${line}`,
        ).toBe(true);
      }
      expect(lines.length).toBeGreaterThan(0);
    },
  );

  it.skipIf(!baseAvailable)('added no import, so it reaches nothing new', () => {
    const added = changedLinesOf(diffOf('src/orgunits/orchestrator/rootRunner.ts')).filter((line) =>
      /^\s*import\s/.test(line),
    );
    expect(added).toEqual([]);
  });

  it.skipIf(!baseAvailable)('changed no frozen budget constant', () => {
    expect(changedInRepair('src/orgunits/orchestrator/constants.ts')).toEqual([]);
  });

  it('predicts TWO robots requests, not one, under the unchanged 60-request ceiling', () => {
    const source = readFileSync(join(REPO_ROOT, 'src/orgunits/orchestrator/rootRunner.ts'), 'utf8');
    expect(source).toContain('const predictedCost = (needsRobots ? 2 : 0) + 1;');
    expect(source).toContain('budget.consume(robotsRequestCount)');
    const constants = readFileSync(
      join(REPO_ROOT, 'src/orgunits/orchestrator/constants.ts'),
      'utf8',
    );
    expect(constants).toContain('60');
  });
});

describe('ADR 0012 repair scope: no firewall was weakened', () => {
  it.skipIf(!baseAvailable)('touched only the two temporally-bound firewall files', () => {
    expect([...changedInRepair('src/test/firewall')].sort()).toEqual(
      [...TEMPORALLY_BOUND_FIREWALLS].sort(),
    );
  });

  it.skipIf(!baseAvailable)(
    'deleted no forbidden path, module or namespace from either of them',
    () => {
      for (const file of TEMPORALLY_BOUND_FIREWALLS) {
        const removed = diffOf(file)
          .split('\n')
          .filter((line) => line.startsWith('-') && !line.startsWith('---'))
          .map((line) => line.slice(1));
        for (const line of removed) {
          for (const marker of [
            'src/orgunits/',
            'src/db/',
            'migrations/',
            'node:http',
            'node:https',
            'node:net',
            'node:tls',
            'node:dns',
            '@anthropic-ai/',
            'provider/',
            'coordinator.ts',
            'childMain.ts',
          ]) {
            expect(
              line.includes(marker),
              `${file} deleted a line naming a forbidden target: ${line.trim()}`,
            ).toBe(false);
          }
        }
      }
    },
  );

  it('both still declare their full forbidden surface in the current source', () => {
    const f7 = readFileSync(join(REPO_ROOT, TEMPORALLY_BOUND_FIREWALLS[0]!), 'utf8');
    for (const marker of [
      'src/orgunits/web/gateway.ts',
      'src/orgunits/web/robots.ts',
      'src/orgunits/orchestrator/',
      'node:dns',
    ]) {
      expect(f7, marker).toContain(marker);
    }
    const f9 = readFileSync(join(REPO_ROOT, TEMPORALLY_BOUND_FIREWALLS[1]!), 'utf8');
    for (const marker of [
      'src/orgunits/web/gateway.ts',
      'src/orgunits/web/robots.ts',
      '@anthropic-ai/claude-agent-sdk',
    ]) {
      expect(f9, marker).toContain(marker);
    }
  });

  it.skipIf(!baseAvailable)('opened no new production namespace', () => {
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
});
