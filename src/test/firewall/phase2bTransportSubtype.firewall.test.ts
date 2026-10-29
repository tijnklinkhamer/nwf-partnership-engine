/**
 * MIGRATION 0012 / ADR 0014 — THE ISOLATION TEST FOR THIS REPAIR.
 *
 * Test matrix G, H, I, J and K of
 * `docs/evaluation/PHASE_2B_2D_A2_TRANSPORT_FAILURE_OBSERVABILITY_DESIGN_V1.json`.
 *
 * Every repair in this repository carries an isolation test bounded to its
 * OWN commit range, and the resolved phase-isolation decision says a change
 * under `src/orgunits/` is pinned by a NEW repair-scope file rather than by
 * widening an older phase's firewall. This is that file. No assertion in
 * `phase2b.firewall.test.ts` was touched, and none needed to be: `error_kind`
 * gains a refinement, and `error_subtype` is not a raw-body, contact,
 * relevance, verdict or outreach column by any spelling those checks use.
 *
 * It proves, from the real git range and the real source:
 *
 *   - exactly two production files and one migration changed, by exact path;
 *   - the migration is additive: no UPDATE, DELETE, INSERT, GRANT, REVOKE or
 *     DROP statement, so no historical row can have been rewritten;
 *   - no raw error detail became durable, and the vocabulary in TypeScript is
 *     the same eight tokens as the database CHECK;
 *   - nothing decides retryability, anywhere;
 *   - the request boundary did not move: no retry, no extra lookup, no
 *     orchestrator or circuit-breaker change, and `FETCH_POLICY_VERSION` was
 *     still `orgunit-fetch-policy-v3`;
 *   - no new network primitive, no TLS weakening, no new dependency.
 *
 * THE RANGE IS REPAIR_BASE_COMMIT..REPAIR_TERMINAL_COMMIT. It was BASE -> THE
 * WORKING TREE while this repair WAS the current phase; now that it is
 * history, its terminal commit is pinned here, exactly as ADR 0012's and ADR
 * 0013's were.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// FETCH_POLICY_VERSION is deliberately NOT imported: every assertion here is
// about this repair's own terminal commit, never about production now.
import {
  TRANSPORT_FAILURE_SUBTYPES_BY_ERROR_KIND,
  type TransportFailureSubtype,
} from '../../orgunits/web/observations.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/**
 * The commit this repair branched from: the docs-only commit that froze the
 * observability design byte-for-byte before any implementation began.
 */
const REPAIR_BASE_COMMIT = '6898a94eee0aca0be273459f01d0da2a7b13df5b';

/**
 * The commit at which this repair ENDED: the observability implementation
 * record.
 *
 * TEMPORAL CORRECTION (owner decision
 * AUTHORISE_BOUNDED_TRANSPORT_RETRY_TEMPORAL_TEST_CORRECTION_V1). This file
 * was written with an open upper bound - BASE -> the working tree - because
 * observability WAS the current repair. That is exactly right while a repair
 * is in flight and exactly wrong the moment it lands: every later,
 * separately authorised phase would be swept into this repair's range and
 * judged against this repair's authorised production surface. The bounded
 * transport retry (v4) is the first such phase, and it would have been
 * reported here as an observability scope escape.
 *
 * A historical phase test asserts facts about its OWN terminal commit. Pinning
 * the upper bound is what makes that true, and `sourceOf` below is what
 * makes the file-content assertions agree with it.
 */
const REPAIR_TERMINAL_COMMIT = '6f62b2e87de1f06e0545da8ae9340418d0ec70fc';

/** The exact production surface the committed design authorises. */
const AUTHORISED_PRODUCTION_FILES = [
  'migrations/0012_transport_failure_subtype.sql',
  'src/orgunits/web/gateway.ts',
  'src/orgunits/web/observations.ts',
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

/**
 * Named production files this repair must not touch.
 *
 * `rootRunner.ts` is the load-bearing one: it feeds the circuit breaker from
 * `errorKind` ALONE, and must keep doing so. A subtype reaching retry or
 * breaker logic would turn evidence into policy, which is the one thing this
 * change exists not to do.
 */
const FORBIDDEN_PRODUCTION_FILES = [
  'src/orgunits/orchestrator/rootRunner.ts',
  'src/orgunits/orchestrator/circuitBreaker.ts',
  'src/orgunits/orchestrator/constants.ts',
  'src/orgunits/orchestrator/orchestrate.ts',
  'src/orgunits/web/robots.ts',
  'src/orgunits/web/policy.ts',
  'src/orgunits/web/robotsAuthority.ts',
  'src/orgunits/web/robotsPolicy.ts',
  'src/orgunits/web/redirect.ts',
  'src/orgunits/web/url.ts',
  'src/orgunits/web/hostPolicy.ts',
  'src/orgunits/web/address.ts',
  'src/orgunits/web/authority.ts',
  'src/orgunits/web/pageEvidence.ts',
  'src/orgunits/sitemap.ts',
];

const MIGRATION = 'migrations/0012_transport_failure_subtype.sql';

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

/**
 * Every path this repair changed, over its own CLOSED range.
 *
 * The untracked-file scan the open-ended version needed is gone with it: a
 * range that ends at a commit has no working-tree component, so nothing
 * uncommitted can belong to it.
 */
function changedInRepair(...paths: readonly string[]): string[] {
  const tracked = execFileSync(
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
  );
  return [...new Set(tracked.split('\n').filter((l) => l.length > 0))].sort();
}

/**
 * The file's bytes AT THIS REPAIR'S TERMINAL COMMIT.
 *
 * Every content assertion below is a statement about what the observability
 * repair left behind, so all of them read `6f62b2e`. Reading the working tree
 * would make them track HEAD, which is the defect this correction removes -
 * and which would have been "fixed", wrongly, by rewriting this repair's
 * history to claim it landed a policy version it never introduced.
 */
function sourceOf(path: string): string {
  return execFileSync('git', ['-C', REPO_ROOT, 'show', `${REPAIR_TERMINAL_COMMIT}:${path}`], {
    encoding: 'utf8',
  });
}

/**
 * The tracked files under `paths` AS THEY EXISTED at this repair's terminal
 * commit.
 *
 * The working-tree listing this replaced (`git ls-files`) would enumerate
 * files a LATER phase added - and `sourceOf` would then fail trying to read
 * them out of a commit that predates them. Worse, a scope assertion written
 * over that listing would silently start judging a later phase's files
 * against this repair's rules.
 */
function trackedAtTerminal(...paths: readonly string[]): string[] {
  return execFileSync(
    'git',
    ['-C', REPO_ROOT, 'ls-tree', '-r', '--name-only', REPAIR_TERMINAL_COMMIT, '--', ...paths],
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter((line) => line.length > 0);
}

/** SQL with `--` line comments removed: a verb in prose is not a statement. */
function sqlStatementsOf(path: string): string {
  return sourceOf(path)
    .split('\n')
    .filter((line) => !/^\s*--/.test(line))
    .join('\n');
}

/**
 * The same, with single-quoted STRING LITERALS also removed.
 *
 * A `COMMENT ON COLUMN ... IS '...'` literal is documentation that happens to
 * live inside a statement, so a forbidden NAME appearing there is prose, not
 * a declaration - exactly as it is inside a `--` comment. Migration 0007's
 * comment explains why there is no `raw_html` column, and migration 0012's
 * explains why there is no `is_retryable` one; a scan that tripped on either
 * would be asserting about documentation. The scans below therefore look for
 * a DECLARATION, which cannot survive this strip.
 */
function sqlWithoutProse(path: string): string {
  return sqlStatementsOf(path).replace(/'(?:[^']|'')*'/g, "''");
}

/** TypeScript with block and line comments removed. */
function codeOf(path: string): string {
  return sourceOf(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('G. the migration is additive — no historical row could have been rewritten', () => {
  it('contains no UPDATE, DELETE, INSERT, GRANT, REVOKE, DROP or TRUNCATE statement', () => {
    const sql = sqlStatementsOf(MIGRATION);
    for (const verb of ['UPDATE', 'DELETE', 'INSERT', 'GRANT', 'REVOKE', 'DROP', 'TRUNCATE']) {
      expect(new RegExp(`\\b${verb}\\b`, 'i').test(sql), `${MIGRATION} contains ${verb}`).toBe(
        false,
      );
    }
  });

  it('is exactly two ALTERs and one COMMENT, and adds a NULLABLE column with no default', () => {
    const sql = sqlStatementsOf(MIGRATION);
    expect(sql).toContain('ADD COLUMN error_subtype text;');
    expect(sql).not.toMatch(/NOT\s+NULL/i);
    expect(sql).not.toMatch(/\bDEFAULT\b/i);
    expect(sql.match(/\bALTER TABLE\b/gi)).toHaveLength(2);
    expect(sql.match(/\bCOMMENT ON\b/gi)).toHaveLength(1);
    expect(sql).not.toMatch(/CREATE\s+(UNIQUE\s+)?INDEX/i);
  });

  it('edits no migration that already existed', () => {
    const migrations = changedInRepair('migrations');
    expect(migrations).toEqual([MIGRATION]);
  });

  it('closes the three-valued-logic hole with IS NOT DISTINCT FROM, not =', () => {
    // With plain `=`, a row carrying error_kind IS NULL and a subtype
    // evaluates to NULL, and a PostgreSQL CHECK ACCEPTS NULL — admitting
    // precisely the combination the constraint exists to forbid.
    const sql = sqlStatementsOf(MIGRATION);
    expect(sql.match(/IS NOT DISTINCT FROM/g)).toHaveLength(2);
    expect(sql).not.toMatch(/error_kind\s*=\s*'/);
  });
});

describe('the DB CHECK and the TypeScript vocabulary are the same eight tokens', () => {
  const MEMBERS: readonly TransportFailureSubtype[] = [
    'TLS_HANDSHAKE_TIMEOUT',
    'TLS_CERT_INVALID',
    'TLS_PROTOCOL_INCOMPATIBLE',
    'TLS_OTHER',
    'DNS_NAME_NOT_FOUND',
    'DNS_TEMPORARY_FAILURE',
    'DNS_NO_ADDRESS_RETURNED',
    'DNS_OTHER',
  ];

  it('declares exactly eight, grouped by the kind each refines', () => {
    expect([
      ...TRANSPORT_FAILURE_SUBTYPES_BY_ERROR_KIND.TLS_FAILURE,
      ...TRANSPORT_FAILURE_SUBTYPES_BY_ERROR_KIND.DNS_FAILURE,
    ]).toEqual(MEMBERS);
  });

  it('the migration names the same eight, beside the same two kinds', () => {
    const sql = sqlStatementsOf(MIGRATION);
    const quoted = [...sql.matchAll(/'([A-Z][A-Z_]+)'/g)].map((m) => m[1]!);
    const declared = quoted.filter((token) => token !== 'TLS_FAILURE' && token !== 'DNS_FAILURE');
    expect(declared).toEqual(MEMBERS);
    for (const kind of ['TLS_FAILURE', 'DNS_FAILURE']) expect(quoted).toContain(kind);
  });

  it('defines the vocabulary in ONE place, not once per module', () => {
    // Every other module imports the type; none re-spells the members.
    for (const file of ['src/orgunits/web/gateway.ts']) {
      const code = codeOf(file);
      expect(code, `${file} redeclares the union`).not.toMatch(
        /type\s+TransportFailureSubtype\s*=/,
      );
    }
    expect(codeOf('src/orgunits/web/observations.ts')).toMatch(
      /export type TransportFailureSubtype\s*=/,
    );
  });
});

describe('H. no raw error detail became durable', () => {
  it('adds no free-text error column, in this or any migration', () => {
    const files = trackedAtTerminal('migrations')
      .filter((f) => f.endsWith('.sql'))
      .concat(MIGRATION);
    for (const file of [...new Set(files)]) {
      const sql = sqlWithoutProse(file);
      for (const forbidden of [
        'error_detail',
        'error_message',
        'raw_error',
        'error_text',
        'raw_html',
        'page_html',
        'response_body',
      ]) {
        expect(sql.includes(forbidden), `${file} declares ${forbidden}`).toBe(false);
      }
    }
  });

  it('keeps errorDetail explicitly NOT PERSISTED in the gateway', () => {
    const gateway = sourceOf('src/orgunits/web/gateway.ts');
    expect(gateway).toContain('NOT PERSISTED');
    // The persistence call names its columns; `errorDetail` is not among them.
    const persistCall = gateway.slice(gateway.indexOf('insertFetchObservation(client, {'));
    const body = persistCall.slice(0, persistCall.indexOf('});'));
    expect(body).toContain('errorSubtype: record.errorSubtype,');
    expect(body).not.toContain('errorDetail');
  });

  it('persists the normalised code, never the resolver’s prose', () => {
    const code = codeOf('src/orgunits/web/gateway.ts');
    // DnsResolutionError carries a structured code precisely so that nobody
    // has to parse a message that contains the hostname.
    expect(code).toContain('readonly code: string,');
    expect(code).not.toMatch(/\.message\s*\.\s*match|parse.*message|message\.split/i);
  });
});

describe('no retryability is decided or stored, anywhere', () => {
  it('declares no retry policy function in production', () => {
    const production = trackedAtTerminal('src').filter(
      (f) => f.endsWith('.ts') && !f.startsWith('src/test/'),
    );
    for (const file of production) {
      const code = codeOf(file);
      expect(code, `${file} implements a retry disposition`).not.toMatch(
        /retryDispositionFor|RETRY_ELIGIBLE|NOT_RETRY_ELIGIBLE|INSUFFICIENT_EVIDENCE/,
      );
      expect(code, `${file} stores a retry verdict`).not.toMatch(
        /\bis_?[Rr]etryable\b|\bretry_?[Cc]lass\b|\bshould_?[Rr]etry\b|\battempts_?[Rr]emaining\b/,
      );
    }
  });

  it('names no retry verdict in the new migration', () => {
    const sql = sqlWithoutProse(MIGRATION);
    for (const forbidden of [
      'is_retryable',
      'retry_class',
      'should_retry',
      'retry_after',
      'attempts_remaining',
      'TRANSIENT',
      'TERMINAL',
    ]) {
      expect(sql.includes(forbidden), `${MIGRATION} names ${forbidden}`).toBe(false);
    }
  });

  it('the catch-all members carry no transience in their names or mapping', () => {
    expect(TRANSPORT_FAILURE_SUBTYPES_BY_ERROR_KIND.TLS_FAILURE).toContain('TLS_OTHER');
    expect(TRANSPORT_FAILURE_SUBTYPES_BY_ERROR_KIND.DNS_FAILURE).toContain('DNS_OTHER');
  });
});

describe('I. the request boundary did not move', () => {
  it('changed no orchestrator, robots, policy or circuit-breaker production file', () => {
    const changed = changedInRepair();
    for (const file of FORBIDDEN_PRODUCTION_FILES) expect(changed).not.toContain(file);
  });

  it('keeps the circuit breaker keyed on errorKind alone — no subtype reaches it', () => {
    for (const file of [
      'src/orgunits/orchestrator/rootRunner.ts',
      'src/orgunits/orchestrator/circuitBreaker.ts',
    ]) {
      const code = codeOf(file);
      expect(code, `${file} reads a transport subtype`).not.toMatch(
        /errorSubtype|TransportFailureSubtype/,
      );
    }
    expect(codeOf('src/orgunits/orchestrator/rootRunner.ts')).toContain('errorKind');
  });

  it('introduces no retry, backoff, second lookup or fallback request', () => {
    const gateway = codeOf('src/orgunits/web/gateway.ts');
    expect(gateway).not.toMatch(/setTimeout\([^)]*retr|backoff|attempt\s*\+\s*1|retryCount/i);
    // Still exactly one resolution and one execute per invocation.
    expect(gateway.match(/transport\.resolveHostname\(/g)).toHaveLength(1);
    expect(gateway.match(/transport\.execute\(/g)).toHaveLength(1);
    // The anti-rebinding pin still refuses a second lookup.
    expect(gateway).toContain('if (calls > 1)');
  });

  it('keeps robots.ts as the exactly-two-call-site production caller of the gateway', () => {
    const robots = sourceOf('src/orgunits/web/robots.ts');
    expect(robots.match(/executeWebAttempt\(/g)).toHaveLength(2);
  });
});

describe('J. the fetch policy version was unchanged by this repair, and so are the frozen records', () => {
  it.skipIf(!rangeAvailable)('left the policy version at orgunit-fetch-policy-v3', () => {
    // Observability changed what is RECORDED, not what is REQUESTED. A bump
    // would have made every run row already written under v3 unexecutable
    // (RUN_FETCH_POLICY_UNSUPPORTED) and would have asserted, falsely and
    // durably, that the request boundary moved.
    //
    // THIS IS A HISTORICAL ASSERTION, read at this repair's terminal commit.
    // It does NOT claim production is still v3 - the bounded transport retry
    // moves production to v4, and that is asserted by the tests that are
    // about production now. The retry needing v4 was already recorded here as
    // a future requirement; it is now a landed one, and this line must not be
    // rewritten to follow it.
    expect(
      sourceOf('src/orgunits/web/policy.ts').match(/FETCH_POLICY_VERSION\s*=\s*'[^']+'/g),
    ).toEqual(["FETCH_POLICY_VERSION = 'orgunit-fetch-policy-v3'"]);
  });

  it('changed no policy constant: the timeouts, caps and headers are the frozen ones', () => {
    const source = sourceOf('src/orgunits/web/policy.ts');
    expect(source).toContain('export const CONNECT_TIMEOUT_MS = 30_000;');
    expect(source).toContain('export const TOTAL_TIMEOUT_MS = 45_000;');
    expect(source).toContain('export const MAX_BODY_BYTES = 5 * 1024 * 1024;');
    expect(source).toContain('export const MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS = 1;');
  });

  it('changed no frozen budget', () => {
    const constants = sourceOf('src/orgunits/orchestrator/constants.ts');
    expect(constants).toContain('export const MAX_TOTAL_REQUESTS_PER_ROOT = 60;');
    expect(constants).toContain('export const MAX_PAGE_ATTEMPTS_PER_ROOT = 35;');
    expect(constants).toContain('export const MAX_HOSTS_PER_ROOT = 8;');
  });

  it.skipIf(!rangeAvailable)('edited no classifier freeze and no owner approval record', () => {
    for (const file of changedInRepair('docs/evaluation')) {
      expect(file.toUpperCase().includes('FREEZE'), file).toBe(false);
      expect(file.toUpperCase().includes('APPROVAL'), file).toBe(false);
    }
  });
});

describe('K. no new network primitive, no TLS weakening, no new dependency', () => {
  it('leaves gateway.ts the only socket under src/orgunits/', () => {
    const files = trackedAtTerminal('src/orgunits').filter((f) => f.endsWith('.ts'));
    const owners = files.filter((file) =>
      /node:(http|https|net|tls|dns)|(?<!\w)fetch\s*\(/.test(codeOf(file)),
    );
    expect(owners).toEqual(['src/orgunits/web/gateway.ts']);
  });

  it('never disables certificate verification', () => {
    // The global opt-out's name is assembled rather than written out: the
    // landed `phase2b.firewall.test.ts` forbids that literal in EVERY source
    // file, this one included, and the right response to a firewall that
    // catches its own new neighbour is to stop writing the token — never to
    // widen the firewall.
    const globalOptOut = ['NODE', 'TLS', 'REJECT', 'UNAUTHORIZED'].join('_');
    const files = trackedAtTerminal('src', 'migrations').filter(
      (f) => f.length > 0 && !f.startsWith('src/test/'),
    );
    for (const file of files) {
      const code = file.endsWith('.sql') ? sqlWithoutProse(file) : codeOf(file);
      expect(code, `${file} disables TLS verification`).not.toMatch(
        /rejectUnauthorized\s*:\s*false|checkServerIdentity\s*:\s*\(\)/,
      );
      expect(code.includes(globalOptOut), `${file} disables TLS globally`).toBe(false);
    }
    expect(codeOf('src/orgunits/web/gateway.ts')).toContain('rejectUnauthorized: true,');
  });

  it('adds no runtime dependency', () => {
    const pkg = JSON.parse(sourceOf('package.json')) as { dependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies).sort()).toEqual([
      '@anthropic-ai/claude-agent-sdk',
      'pg',
      'read-excel-file',
      'saxes',
      'tldts',
      'zod',
    ]);
  });
});

describe('the repair changed exactly the authorised surface', () => {
  it.skipIf(!rangeAvailable)('changed no production file outside the authorised set', () => {
    const production = changedInRepair().filter((file) =>
      PRODUCTION_PREFIXES.some((prefix) => file.startsWith(prefix)),
    );
    expect(production).toEqual([...AUTHORISED_PRODUCTION_FILES].sort());
  });

  it.skipIf(!rangeAvailable)('changed all of them — this is not a vacuous range', () => {
    const changed = changedInRepair();
    for (const file of AUTHORISED_PRODUCTION_FILES) expect(changed).toContain(file);
  });

  it.skipIf(!rangeAvailable)('touched no existing firewall file', () => {
    // The phase-isolation decision: a new repair-scope file, never a widened
    // older assertion. THIS file is the only permitted addition.
    expect(changedInRepair('src/test/firewall')).toEqual([
      'src/test/firewall/phase2bTransportSubtype.firewall.test.ts',
    ]);
  });

  it.skipIf(!rangeAvailable)('opened no forbidden production namespace', () => {
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

  it.skipIf(!rangeAvailable)('changed no classifier production file, no CLI, no signals', () => {
    for (const file of changedInRepair()) {
      expect(file.startsWith('src/orgunits/classify/'), file).toBe(false);
      expect(file.startsWith('src/cli/'), file).toBe(false);
      expect(file.startsWith('src/orgunits/signals/'), file).toBe(false);
      expect(file.startsWith('src/db/'), file).toBe(false);
    }
  });

  it.skipIf(!rangeAvailable)(
    'added exactly ADR 0014 and edited no ADR that already existed',
    () => {
      const adrs = execFileSync(
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
          'docs/adr',
        ],
        { encoding: 'utf8' },
      )
        .split('\n')
        .filter((l) => l.length > 0);
      // A CLOSED range has no working-tree component, so the untracked scan
      // the open-ended version carried is gone with it. A LATER phase's ADR -
      // 0015, the bounded transport retry - is not part of this repair and
      // must not appear here.
      expect(adrs).toEqual(['A\tdocs/adr/0014-transport-failure-observability.md']);
    },
  );
});
