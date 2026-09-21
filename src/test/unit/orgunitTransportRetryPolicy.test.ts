/**
 * ADR 0015 — THE BOUNDED TRANSPORT-RETRY POLICY, AS A PURE FUNCTION.
 *
 * Test matrix B, C, D, V and AA of the frozen design
 * `docs/evaluation/PHASE_2B_2D_A2_BOUNDED_TRANSPORT_RETRY_POLICY_DESIGN_V1.json`.
 *
 * This file pins the DECISION. `orgunitTransportRetry.test.ts` (integration)
 * pins what that decision causes. They are deliberately separate: a policy
 * that returned the right verdict while `robots.ts` ignored it would pass here
 * and fail there, and a caller that retried the right things for the wrong
 * reasons would pass there and fail here.
 *
 * THE TABLE BELOW IS THE OWNER-FROZEN ONE, restated as data so that a drift in
 * either direction - a class quietly gaining or losing retryability - fails a
 * named test rather than passing unnoticed.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  retryDispositionFor,
  type RetryDisposition,
  type TransportRetryContext,
} from '../../orgunits/web/retryPolicy.js';
import type { FetchErrorKind, TransportFailureSubtype } from '../../orgunits/web/observations.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (relative: string): string => readFileSync(join(REPO_ROOT, relative), 'utf8');

/**
 * ADR 0015's semantic implementation commit. The v4 bump is a fact about THIS
 * commit; production moved to v5 afterwards (the anchor document-base repair),
 * so reading the working tree would restate history as a claim about today.
 */
const ADR_0015_TERMINAL_COMMIT = 'd9c32af156d2241151601d6d6b0bf3eb9dafcee2';
const readAtAdr0015Terminal = (relative: string): string =>
  execFileSync('git', ['-C', REPO_ROOT, 'show', `${ADR_0015_TERMINAL_COMMIT}:${relative}`], {
    encoding: 'utf8',
  });

const ROBOTS: TransportRetryContext = 'ROBOTS_POLICY_RESOLUTION';
const PAGE: TransportRetryContext = 'ORDINARY_PAGE';

/** Every `error_kind` the landed taxonomy admits, so the totality test cannot drift from it. */
const ALL_ERROR_KINDS: readonly FetchErrorKind[] = [
  'DNS_FAILURE',
  'CONNECT_TIMEOUT',
  'READ_TIMEOUT',
  'TLS_FAILURE',
  'CONNECTION_REFUSED',
  'CONNECTION_RESET',
  'BLOCKED_BY_POLICY',
  'MALFORMED_URL',
  'RESPONSE_TOO_LARGE',
  'UNSUPPORTED_CONTENT_TYPE',
  'TOO_MANY_REDIRECTS',
  'OTHER',
];

const ALL_SUBTYPES: readonly TransportFailureSubtype[] = [
  'TLS_HANDSHAKE_TIMEOUT',
  'TLS_CERT_INVALID',
  'TLS_PROTOCOL_INCOMPATIBLE',
  'TLS_OTHER',
  'DNS_NAME_NOT_FOUND',
  'DNS_TEMPORARY_FAILURE',
  'DNS_NO_ADDRESS_RETURNED',
  'DNS_OTHER',
];

interface Case {
  readonly errorKind: FetchErrorKind | null;
  readonly errorSubtype: TransportFailureSubtype | null;
}

const disposition = (
  c: Case,
  context: TransportRetryContext = ROBOTS,
  httpStatus: number | null = null,
): RetryDisposition => retryDispositionFor({ context, httpStatus, ...c });

/** THE SIX. Frozen by REVISE_BOUNDED_TRANSPORT_RETRY_POLICY_RETRYABLE_SET_V1. */
const RETRYABLE: readonly Case[] = [
  { errorKind: 'TLS_FAILURE', errorSubtype: 'TLS_HANDSHAKE_TIMEOUT' },
  { errorKind: 'DNS_FAILURE', errorSubtype: 'DNS_TEMPORARY_FAILURE' },
  { errorKind: 'CONNECT_TIMEOUT', errorSubtype: null },
  { errorKind: 'READ_TIMEOUT', errorSubtype: null },
  { errorKind: 'CONNECTION_RESET', errorSubtype: null },
  { errorKind: 'CONNECTION_REFUSED', errorSubtype: null },
];

const NOT_RETRYABLE: readonly Case[] = [
  { errorKind: 'TLS_FAILURE', errorSubtype: 'TLS_CERT_INVALID' },
  { errorKind: 'TLS_FAILURE', errorSubtype: 'TLS_PROTOCOL_INCOMPATIBLE' },
  { errorKind: 'DNS_FAILURE', errorSubtype: 'DNS_NAME_NOT_FOUND' },
  { errorKind: 'DNS_FAILURE', errorSubtype: 'DNS_NO_ADDRESS_RETURNED' },
  { errorKind: 'BLOCKED_BY_POLICY', errorSubtype: null },
  { errorKind: 'MALFORMED_URL', errorSubtype: null },
  { errorKind: 'RESPONSE_TOO_LARGE', errorSubtype: null },
  { errorKind: 'UNSUPPORTED_CONTENT_TYPE', errorSubtype: null },
  { errorKind: 'TOO_MANY_REDIRECTS', errorSubtype: null },
];

const INSUFFICIENT: readonly Case[] = [
  { errorKind: 'TLS_FAILURE', errorSubtype: 'TLS_OTHER' },
  { errorKind: 'DNS_FAILURE', errorSubtype: 'DNS_OTHER' },
  // The two historical shapes: every row written before migration 0012.
  { errorKind: 'TLS_FAILURE', errorSubtype: null },
  { errorKind: 'DNS_FAILURE', errorSubtype: null },
  { errorKind: 'OTHER', errorSubtype: null },
];

describe('ADR 0015 retry policy: the six retryable classes', () => {
  it('has exactly six, and they are the owner-frozen six', () => {
    expect(RETRYABLE).toHaveLength(6);
    expect(RETRYABLE.map((c) => c.errorSubtype ?? c.errorKind)).toEqual([
      'TLS_HANDSHAKE_TIMEOUT',
      'DNS_TEMPORARY_FAILURE',
      'CONNECT_TIMEOUT',
      'READ_TIMEOUT',
      'CONNECTION_RESET',
      'CONNECTION_REFUSED',
    ]);
  });

  for (const c of RETRYABLE) {
    const name = c.errorSubtype ?? c.errorKind;
    it(`${name} is RETRY_ELIGIBLE in site-policy resolution`, () => {
      expect(disposition(c)).toBe('RETRY_ELIGIBLE');
    });
  }
});

describe('ADR 0015 retry policy: what is decided NOT retryable', () => {
  for (const c of NOT_RETRYABLE) {
    const name = c.errorSubtype ?? c.errorKind;
    it(`${name} is NOT_RETRY_ELIGIBLE`, () => {
      expect(disposition(c)).toBe('NOT_RETRY_ELIGIBLE');
    });
  }

  it('has nine of them, and none overlaps the retryable six', () => {
    expect(NOT_RETRYABLE).toHaveLength(9);
    const retryableKeys = new Set(RETRYABLE.map((c) => `${c.errorKind}|${c.errorSubtype}`));
    for (const c of NOT_RETRYABLE) {
      expect(retryableKeys.has(`${c.errorKind}|${c.errorSubtype}`)).toBe(false);
    }
  });
});

describe('ADR 0015 retry policy: what is INSUFFICIENT_EVIDENCE', () => {
  for (const c of INSUFFICIENT) {
    const name = `${c.errorKind}/${c.errorSubtype ?? 'null'}`;
    it(`${name} is INSUFFICIENT_EVIDENCE`, () => {
      expect(disposition(c)).toBe('INSUFFICIENT_EVIDENCE');
    });
  }

  it('distinguishes "cannot tell" from "decided no", which is the whole point of three values', () => {
    // TLS_FAILURE spans a retryable and two non-retryable conditions. A row
    // that does not say which cannot be placed in either, and collapsing it
    // into NOT_RETRY_ELIGIBLE would turn "we cannot tell" into "we checked
    // and it was fine".
    expect(disposition({ errorKind: 'TLS_FAILURE', errorSubtype: null })).toBe(
      'INSUFFICIENT_EVIDENCE',
    );
    expect(disposition({ errorKind: 'TLS_FAILURE', errorSubtype: 'TLS_CERT_INVALID' })).toBe(
      'NOT_RETRY_ELIGIBLE',
    );
  });

  it('never lets an unnamed TLS or DNS condition look recognised', () => {
    // TLS_OTHER/DNS_OTHER mean "a condition this build's taxonomy does not
    // name". They must not be mistaken for a named, retry-compatible one.
    expect(disposition({ errorKind: 'TLS_FAILURE', errorSubtype: 'TLS_OTHER' })).not.toBe(
      'RETRY_ELIGIBLE',
    );
    expect(disposition({ errorKind: 'DNS_FAILURE', errorSubtype: 'DNS_OTHER' })).not.toBe(
      'RETRY_ELIGIBLE',
    );
  });
});

describe('ADR 0015 retry policy: D. historical NULL confers nothing', () => {
  it('yields INSUFFICIENT_EVIDENCE for the exact shapes indices 4, 6 and 8 carry', () => {
    // Index 4 is DNS_FAILURE with a NULL subtype; indices 6 and 8 are
    // TLS_FAILURE with a NULL subtype. Widening the retryable set to include
    // the broad CONNECT/READ/RESET/REFUSED kinds must NOT retroactively make
    // these decidable - they are a different error_kind entirely.
    expect(disposition({ errorKind: 'DNS_FAILURE', errorSubtype: null })).toBe(
      'INSUFFICIENT_EVIDENCE',
    );
    expect(disposition({ errorKind: 'TLS_FAILURE', errorSubtype: null })).toBe(
      'INSUFFICIENT_EVIDENCE',
    );
  });
});

describe('ADR 0015 retry policy: V. context is part of the decision', () => {
  it('returns NOT_RETRY_ELIGIBLE for every retryable class in ORDINARY_PAGE context', () => {
    for (const c of RETRYABLE) {
      expect(disposition(c, PAGE), `${c.errorSubtype ?? c.errorKind} retried on a page`).toBe(
        'NOT_RETRY_ELIGIBLE',
      );
    }
  });

  it('calls a wrong context DECIDED, never insufficient', () => {
    // The context is always known to the caller, so there is no evidential
    // gap to report - V1 has decided not to retry there.
    expect(disposition({ errorKind: 'CONNECT_TIMEOUT', errorSubtype: null }, PAGE)).toBe(
      'NOT_RETRY_ELIGIBLE',
    );
  });
});

describe('ADR 0015 retry policy: W. every HTTP response is out of scope', () => {
  for (const status of [200, 301, 404, 429, 500, 502, 503, 504]) {
    it(`HTTP ${status} receives no transport retry`, () => {
      expect(
        retryDispositionFor({
          context: ROBOTS,
          errorKind: null,
          errorSubtype: null,
          httpStatus: status,
        }),
      ).toBe('NOT_RETRY_ELIGIBLE');
    });
  }

  it('refuses even when a status somehow arrives beside a retryable error kind', () => {
    // The status check runs FIRST, so no combination can route an HTTP
    // outcome into a transport branch.
    expect(
      retryDispositionFor({
        context: ROBOTS,
        errorKind: 'CONNECT_TIMEOUT',
        errorSubtype: null,
        httpStatus: 503,
      }),
    ).toBe('NOT_RETRY_ELIGIBLE');
  });

  it('treats a clean success as nothing to retry', () => {
    expect(disposition({ errorKind: null, errorSubtype: null })).toBe('NOT_RETRY_ELIGIBLE');
  });
});

describe('ADR 0015 retry policy: AA. total and fail-closed', () => {
  it('returns a value for EVERY kind/subtype/context combination, and never throws', () => {
    const kinds: readonly (FetchErrorKind | null)[] = [...ALL_ERROR_KINDS, null];
    const subtypes: readonly (TransportFailureSubtype | null)[] = [...ALL_SUBTYPES, null];
    const permitted: readonly RetryDisposition[] = [
      'RETRY_ELIGIBLE',
      'NOT_RETRY_ELIGIBLE',
      'INSUFFICIENT_EVIDENCE',
    ];
    let combinations = 0;
    for (const context of [ROBOTS, PAGE]) {
      for (const errorKind of kinds) {
        for (const errorSubtype of subtypes) {
          for (const httpStatus of [null, 200, 503]) {
            const answer = retryDispositionFor({ context, errorKind, errorSubtype, httpStatus });
            expect(permitted, `${context}/${errorKind}/${errorSubtype}/${httpStatus}`).toContain(
              answer,
            );
            combinations += 1;
          }
        }
      }
    }
    // 2 contexts x 13 kinds x 9 subtypes x 3 statuses - a real sweep, not a sample.
    expect(combinations).toBe(702);
  });

  it('RETRY_ELIGIBLE is reachable ONLY from the six, in the one context, with no status', () => {
    const eligible: string[] = [];
    for (const context of [ROBOTS, PAGE]) {
      for (const errorKind of [...ALL_ERROR_KINDS, null]) {
        for (const errorSubtype of [...ALL_SUBTYPES, null]) {
          for (const httpStatus of [null, 200, 503]) {
            if (
              retryDispositionFor({ context, errorKind, errorSubtype, httpStatus }) ===
              'RETRY_ELIGIBLE'
            ) {
              eligible.push(`${context}|${errorKind}|${errorSubtype}|${httpStatus}`);
            }
          }
        }
      }
    }
    expect([...eligible].sort()).toEqual(
      [
        'ROBOTS_POLICY_RESOLUTION|CONNECTION_REFUSED|null|null',
        'ROBOTS_POLICY_RESOLUTION|CONNECTION_RESET|null|null',
        'ROBOTS_POLICY_RESOLUTION|CONNECT_TIMEOUT|null|null',
        'ROBOTS_POLICY_RESOLUTION|DNS_FAILURE|DNS_TEMPORARY_FAILURE|null',
        'ROBOTS_POLICY_RESOLUTION|READ_TIMEOUT|null|null',
        'ROBOTS_POLICY_RESOLUTION|TLS_FAILURE|TLS_HANDSHAKE_TIMEOUT|null',
      ].sort(),
    );
  });

  it('refuses a subtype the database would not accept beside that kind', () => {
    // Migration 0012's CHECK forbids a TLS subtype on a DNS failure. Such a
    // value did not come from a persisted row, so it is not evidence this
    // policy may act on - and in particular a retryable subtype must not be
    // readable off the wrong kind.
    expect(disposition({ errorKind: 'DNS_FAILURE', errorSubtype: 'TLS_HANDSHAKE_TIMEOUT' })).toBe(
      'INSUFFICIENT_EVIDENCE',
    );
    expect(disposition({ errorKind: 'TLS_FAILURE', errorSubtype: 'DNS_TEMPORARY_FAILURE' })).toBe(
      'INSUFFICIENT_EVIDENCE',
    );
    expect(disposition({ errorKind: 'CONNECT_TIMEOUT', errorSubtype: 'TLS_OTHER' })).toBe(
      'INSUFFICIENT_EVIDENCE',
    );
  });
});

describe('ADR 0015 retry policy: the module is PURE', () => {
  const source = read('src/orgunits/web/retryPolicy.ts');

  it('imports no socket, no database and no clock', () => {
    for (const forbidden of [
      'node:dns',
      'node:net',
      'node:tls',
      'node:http',
      'node:https',
      'node:fs',
      "from 'pg'",
      'process.env',
      'Date.now(',
      'Math.random(',
    ]) {
      expect(source, `retryPolicy.ts references ${forbidden}`).not.toContain(forbidden);
    }
    expect(source).not.toMatch(/\bfetch\s*\(/);
  });

  it('imports exactly one module, and it is the evidence vocabulary', () => {
    const imports = source.match(/^import .*$/gm) ?? [];
    expect(imports).toEqual([
      "import type { FetchErrorKind, TransportFailureSubtype } from './observations.js';",
    ]);
  });

  it('persists nothing: no INSERT, no UPDATE, no column name', () => {
    // COMMENTS STRIPPED FIRST. The module legitimately NAMES the rejected
    // column shapes in its rationale - explaining why `is_retryable` was
    // refused is prose, not a code path - and the established convention here
    // is to review prose as prose and assert against code.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const forbidden of ['INSERT', 'UPDATE', 'retry_reason', 'is_retry', 'retry_of']) {
      expect(code, `retryPolicy.ts names ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('is deterministic: the same input answers the same way every time', () => {
    for (const c of [...RETRYABLE, ...NOT_RETRYABLE, ...INSUFFICIENT]) {
      const first = disposition(c);
      for (let i = 0; i < 5; i += 1) expect(disposition(c)).toBe(first);
    }
  });
});

describe('ADR 0015 retry policy: AB. a retry is reconstructible without a stored field', () => {
  /**
   * The reconstruction rule from the frozen design: a row is the retry of its
   * predecessor iff same run, same URL, attempt_no = predecessor + 1,
   * discovery_method ROBOTS, policy v4, AND the PREDECESSOR's own evidence is
   * RETRY_ELIGIBLE.
   *
   * This is what makes a stored `retry_reason` unnecessary - and storing one
   * would freeze a derived conclusion into an immutable evidence row.
   */
  interface Row {
    readonly attemptNo: number;
    readonly errorKind: FetchErrorKind | null;
    readonly errorSubtype: TransportFailureSubtype | null;
    readonly httpStatus: number | null;
  }

  const wasRetryOf = (predecessor: Row, candidate: Row): boolean =>
    candidate.attemptNo === predecessor.attemptNo + 1 &&
    retryDispositionFor({
      context: ROBOTS,
      errorKind: predecessor.errorKind,
      errorSubtype: predecessor.errorSubtype,
      httpStatus: predecessor.httpStatus,
    }) === 'RETRY_ELIGIBLE';

  it('identifies a retry from the predecessor row alone', () => {
    const failed: Row = {
      attemptNo: 1,
      errorKind: 'CONNECTION_RESET',
      errorSubtype: null,
      httpStatus: null,
    };
    const second: Row = { attemptNo: 2, errorKind: null, errorSubtype: null, httpStatus: 200 };
    expect(wasRetryOf(failed, second)).toBe(true);
  });

  it('does NOT mistake the ADR 0013 independent target-origin lookup for a retry', () => {
    // That lookup also produces attempt_no = 2 at one URL - but only after a
    // predecessor that redirected or succeeded, never after a retry-eligible
    // failure. The predecessor's own evidence is what separates them.
    const redirected: Row = {
      attemptNo: 1,
      errorKind: null,
      errorSubtype: null,
      httpStatus: 301,
    };
    const second: Row = { attemptNo: 2, errorKind: null, errorSubtype: null, httpStatus: 200 };
    expect(wasRetryOf(redirected, second)).toBe(false);
  });

  it('does NOT call a second attempt a retry when the first was never eligible', () => {
    const certInvalid: Row = {
      attemptNo: 1,
      errorKind: 'TLS_FAILURE',
      errorSubtype: 'TLS_CERT_INVALID',
      httpStatus: null,
    };
    const second: Row = { attemptNo: 2, errorKind: null, errorSubtype: null, httpStatus: 200 };
    expect(wasRetryOf(certInvalid, second)).toBe(false);
  });
});

describe('ADR 0015: the production surface declares the policy exactly once', () => {
  it('bumped the fetch policy to v4, in one declaration, at its terminal commit', () => {
    expect(
      readAtAdr0015Terminal('src/orgunits/web/policy.ts').match(
        /FETCH_POLICY_VERSION\s*=\s*'[^']+'/g,
      ),
    ).toEqual(["FETCH_POLICY_VERSION = 'orgunit-fetch-policy-v4'"]);
  });

  it('declares the retry token as 1, in one place, beside the hop bound', () => {
    const policy = read('src/orgunits/web/policy.ts');
    expect(policy.match(/MAX_ROBOTS_TRANSPORT_RETRIES_PER_POLICY_RESOLUTION\s*=\s*\d+/g)).toEqual([
      'MAX_ROBOTS_TRANSPORT_RETRIES_PER_POLICY_RESOLUTION = 1',
    ]);
    expect(policy.match(/MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS\s*=\s*\d+/g)).toEqual([
      'MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS = 1',
    ]);
  });

  it('leaves the timeouts, caps and headers exactly where v3 left them', () => {
    // A retry is a second BOUNDED attempt, never a longer one.
    const policy = read('src/orgunits/web/policy.ts');
    expect(policy).toContain('export const CONNECT_TIMEOUT_MS = 30_000;');
    expect(policy).toContain('export const TOTAL_TIMEOUT_MS = 45_000;');
    expect(policy).toContain('export const MAX_BODY_BYTES = 5 * 1024 * 1024;');
    expect(policy).toContain("'NWFPartnershipEngine-Research/1.0 (+https://newwavefluent.com/)'");
  });

  it('leaves every frozen budget untouched', () => {
    const constants = read('src/orgunits/orchestrator/constants.ts');
    expect(constants).toContain('export const MAX_TOTAL_REQUESTS_PER_ROOT = 60;');
    expect(constants).toContain('export const MAX_PAGE_ATTEMPTS_PER_ROOT = 35;');
    expect(constants).toContain('export const MAX_HOSTS_PER_ROOT = 8;');
    expect(constants).toContain('export const MIN_HOST_PACING_SECONDS = 1.2;');
  });

  it('raises the rootRunner robots prediction to 3, and charges the retry through the existing count', () => {
    const runner = read('src/orgunits/orchestrator/rootRunner.ts');
    expect(runner).toContain('const predictedCost = (needsRobots ? 3 : 0) + 1;');
    expect(runner).toContain('budget.consume(robotsRequestCount)');
  });

  it('adds no migration: the range is still 0001..0012', () => {
    const migrations = execFileSync('git', ['-C', REPO_ROOT, 'ls-files', 'migrations'], {
      encoding: 'utf8',
    })
      .split('\n')
      .filter((f) => f.endsWith('.sql'))
      .sort();
    expect(migrations).toHaveLength(12);
    expect(migrations.at(-1)).toBe('migrations/0012_transport_failure_subtype.sql');
    expect(migrations.some((f) => /\/0013_/.test(f))).toBe(false);
  });
});
