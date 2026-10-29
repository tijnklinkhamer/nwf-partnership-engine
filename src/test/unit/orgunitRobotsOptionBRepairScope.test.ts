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
 * THE RANGE IS NOW BASE -> TERMINAL COMMIT, and that is the sentence this
 * file's earlier version promised: "when this repair becomes history, its
 * terminal commit is pinned here the same way the others now are." ADR 0013
 * (Option C-lite) is the phase that made it history. Leaving the range open
 * to the working tree would be exactly the defect
 * `docs/evaluation/PHASE_2B_ROBOTS_OPTION_B_FREEZE_COLLISION_OWNER_DECISION_V1.json`
 * corrects - a past phase measuring itself against a future it could not have
 * been approved for - and would make THIS file fail for changes ADR 0013
 * authorises rather than for anything ADR 0012 forbade.
 *
 * FOR THE SAME REASON, EVERY ASSERTION HERE READS THE REPAIR'S OWN BYTES.
 * The three that used to read live production values - the fetch policy
 * version, and the predicate's same-host behaviour - now read
 * `git show <terminal>:<path>`, because both genuinely moved under ADR 0013
 * and a historical scope proof must not silently restate itself as a claim
 * about today. What production does TODAY is
 * `orgunitRobotsOptionCLiteRepairScope.test.ts`'s subject, not this file's.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS } from '../../orgunits/web/policy.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/**
 * The commit this repair branched from: the acquisition-yield root-cause audit
 * that found the capability limit ADR 0012 repairs.
 */
const REPAIR_BASE_COMMIT = '74d8139cc3358ae600bb8751ae81121711ae313b';

/**
 * The commit this repair ENDED at: its implementation record. Everything
 * after it belongs to a later, separately authorised phase.
 */
const REPAIR_TERMINAL_COMMIT = '6b43663809f8b89cbfc2de48368b23f2a35e52a9';

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

const baseAvailable = commitExists(REPAIR_BASE_COMMIT) && commitExists(REPAIR_TERMINAL_COMMIT);

/** Every path this repair changed: its base commit -> its own terminal commit. */
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

function diffOf(path: string): string {
  return execFileSync(
    'git',
    ['-C', REPO_ROOT, 'diff', '-U0', REPAIR_BASE_COMMIT, REPAIR_TERMINAL_COMMIT, '--', path],
    { encoding: 'utf8' },
  );
}

/** A file's bytes AS THIS REPAIR LEFT THEM, never as they are today. */
function sourceAtTerminal(path: string): string {
  return execFileSync('git', ['-C', REPO_ROOT, 'show', `${REPAIR_TERMINAL_COMMIT}:${path}`], {
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

describe('ADR 0012 repair scope: the policy the repair declared', () => {
  it.skipIf(!baseAvailable)('named a new fetch policy version, and it was v2', () => {
    // READ AT THE TERMINAL COMMIT. Production is past v2 now (ADR 0013), and
    // asserting the live constant here would make this historical scope proof
    // fail for a change it was never asked about.
    const source = sourceAtTerminal('src/orgunits/web/policy.ts');
    expect(source.match(/FETCH_POLICY_VERSION\s*=\s*'[^']+'/g)).toEqual([
      "FETCH_POLICY_VERSION = 'orgunit-fetch-policy-v2'",
    ]);
  });

  it('bounds a site-policy continuation at exactly ONE hop - and still does', () => {
    // The ONE value this repair declared that ADR 0013 deliberately did not
    // move, so it is still honest to read live.
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

describe('ADR 0012 repair scope: the continuation predicate it landed was same-host', () => {
  /**
   * THE PREDICATE'S BEHAVIOUR IS READ FROM ITS OWN SOURCE AT THE TERMINAL
   * COMMIT, not exercised live.
   *
   * ADR 0013 widened the live predicate from byte-identical hostname to same
   * registrable domain. Calling it here would therefore measure ADR 0013 and
   * report the answer as ADR 0012's, which is the whole failure mode this
   * file's range pinning exists to prevent. What ADR 0012 landed is a fact
   * about bytes at one commit, and that is what is asserted. The CURRENT
   * predicate's behaviour is exercised, case by case, in
   * `orgunitRobotsOptionCLiteContinuation.test.ts`.
   */
  it.skipIf(!baseAvailable)('compared the hostname, byte for byte, and nothing wider', () => {
    const source = sourceAtTerminal('src/orgunits/web/robots.ts');
    expect(source).toContain(
      'if (target.hostname.toLowerCase() !== origin.hostname.toLowerCase()) return null;',
    );
    // No registrable-domain notion existed in this module at that commit.
    expect(source).not.toContain('registrableDomain');
  });

  it.skipIf(!baseAvailable)('bounded the path, the query, the fragment and the port', () => {
    const source = sourceAtTerminal('src/orgunits/web/robots.ts');
    expect(source).toContain(
      "if (target.pathname !== '/robots.txt' || target.search !== '' || target.hash !== '') return null;",
    );
    expect(source).toContain("if (target.port !== '') return null;");
  });

  it.skipIf(!baseAvailable)('refused a downgrade and a self-redirect', () => {
    const source = sourceAtTerminal('src/orgunits/web/robots.ts');
    expect(source).toContain('const sameScheme = target.protocol === origin.protocol;');
    expect(source).toContain(
      "const upgraded = origin.protocol === 'http:' && target.protocol === 'https:';",
    );
    expect(source).toContain('if (continuation === requestedRobotsUrl) return null;');
  });

  it('robots.ts is still the one production caller of the gateway, and owns no socket', () => {
    // Read LIVE on purpose: this is an invariant ADR 0013 had to preserve,
    // not a historical property of ADR 0012's commit.
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

  it.skipIf(!baseAvailable)(
    'predicted TWO robots requests, not one, under the unchanged 60-request ceiling',
    () => {
      // READ AT THE TERMINAL COMMIT. What ADR 0012 raised the prediction TO is
      // a fact about ADR 0012's commit, not about the working tree: ADR 0015's
      // bounded transport retry raises it again, to 3. A live read here would
      // either fail on that or be "fixed" by rewriting this repair's history
      // to claim it predicted a cost it never predicted.
      const source = sourceAtTerminal('src/orgunits/orchestrator/rootRunner.ts');
      expect(source).toContain('const predictedCost = (needsRobots ? 2 : 0) + 1;');
      expect(source).toContain('budget.consume(robotsRequestCount)');
      // The CEILING is a live invariant - ADR 0012 left it alone and so must
      // every later phase - so it is read from the current source.
      const constants = readFileSync(
        join(REPO_ROOT, 'src/orgunits/orchestrator/constants.ts'),
        'utf8',
      );
      expect(constants).toContain('export const MAX_TOTAL_REQUESTS_PER_ROOT = 60;');
    },
  );
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
