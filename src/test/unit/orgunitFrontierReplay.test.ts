/**
 * B1.1 - OFFLINE v7-VERSUS-v8 FRONTIER REPLAY (fetch policy v8, ADR 0018).
 *
 * Both policies receive IDENTICAL synthetic sites, admission gates and
 * budgets through `src/test/harness/frontierReplay/simulate.ts`. The v7
 * baseline is the test-only `FrozenV7Frontier`, which is first proved
 * pick-for-pick equal to the REAL v7 `Frontier` (golden sequences captured
 * at 6bbb84a). Production keeps exactly one implementation.
 *
 * No socket, no database, no model, no clock, no randomness. Every site is
 * invented (fixtures.ts); synthetic precision/recall do not establish
 * real-world performance.
 *
 * The acceptance gates are numbered as in the B1.1 authorisation:
 *   G1 budgets and scope        G4 controlled non-regression (REPORTED)
 *   G2 determinism              G5 meaningful improvement
 *   G3 scoring contract         G6 local section fairness
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CIRCUIT_BREAKER_TRANSIENT_FAILURE_THRESHOLD,
  MAX_HOSTS_PER_ROOT,
  MAX_PAGE_ATTEMPTS_PER_ROOT,
  MAX_TOTAL_REQUESTS_PER_ROOT,
  TRACK_B_FLOOR,
} from '../../orgunits/orchestrator/constants.js';
import {
  createFrontier,
  frontierSectionOf,
  type FrontierEntry,
} from '../../orgunits/orchestrator/frontier.js';
import { validateRequestUrl } from '../../orgunits/web/url.js';
import { allFixtures, h1HostCapLimitation } from '../harness/frontierReplay/fixtures.js';
import { lostRelativeTo, measure } from '../harness/frontierReplay/metrics.js';
import {
  replaySite,
  type ReplayResult,
  type SyntheticLink,
  type SyntheticSite,
} from '../harness/frontierReplay/simulate.js';
import {
  compareEntriesV7,
  FrozenV7Frontier,
  strictPriorityKey,
  trackScore,
} from '../harness/frontierReplay/v7Frontier.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const GOLDEN = JSON.parse(
  readFileSync(
    join(REPO_ROOT, 'src/test/fixtures/frontierReplay/v7-golden-sequences.json'),
    'utf8',
  ),
) as {
  capturedFrom: { commit: string; fetchPolicyVersion: string; module: string };
  sequences: Record<string, string[]>;
};

const FIXTURES = allFixtures();
// Memoised per fixture: a replay is deterministic (G2 proves it with FRESH
// runs), so re-running it for every assertion would only cost time.
const memo = new Map<string, ReplayResult>();
const v7 = (site: SyntheticSite): ReplayResult => {
  const key = `v7:${site.id}`;
  if (!memo.has(key)) memo.set(key, replaySite(site, new FrozenV7Frontier()));
  return memo.get(key)!;
};
const v8 = (site: SyntheticSite): ReplayResult => {
  const key = `v8:${site.id}`;
  if (!memo.has(key)) memo.set(key, replaySite(site, createFrontier()));
  return memo.get(key)!;
};
const v8WithPools = (site: SyntheticSite): ReplayResult => {
  const key = `v8pools:${site.id}`;
  if (!memo.has(key)) memo.set(key, replaySite(site, createFrontier(), { recordPools: true }));
  return memo.get(key)!;
};
const sequenceOf = (r: ReplayResult): string[] => r.picks.map((p) => `${p.status} ${p.url}`);

/**
 * The pinned synthetic outcome per fixture: [relevant discovered, relevant
 * fetched, high-relevance fetched] for each policy, the number of relevant
 * targets v7 fetched and v8 did not, total requests and distinct hosts.
 * Pinned so the comparison report is reproducible and any drift is a
 * visible, reviewed edit - never a silent change of the evaluation.
 */
const EXPECTED: Readonly<
  Record<
    string,
    {
      v7: [number, number, number];
      v8: [number, number, number];
      lost: number;
      requests: [number, number];
      hosts: [number, number];
    }
  >
> = {
  F01_ALPHA_CLUSTERED_HIDDEN_HUB: {
    v7: [2, 0, 0],
    v8: [6, 6, 3],
    lost: 0,
    requests: [37, 37],
    hosts: [1, 1],
  },
  F02_HUNDREDS_ZERO_SCORE: {
    v7: [1, 0, 0],
    v8: [2, 1, 0],
    lost: 0,
    requests: [37, 37],
    hosts: [1, 1],
  },
  F03_MULTI_SECTION_ONE_HOST: {
    v7: [2, 0, 0],
    v8: [2, 0, 0],
    lost: 0,
    requests: [37, 37],
    hosts: [1, 1],
  },
  F04_MULTI_HOST: { v7: [1, 0, 0], v8: [2, 2, 1], lost: 0, requests: [38, 44], hosts: [2, 8] },
  F05_NOISY_SECTION: { v7: [1, 0, 0], v8: [2, 2, 1], lost: 0, requests: [37, 37], hosts: [1, 1] },
  F06_POSITIVE_TIES: { v7: [1, 0, 0], v8: [3, 3, 2], lost: 0, requests: [37, 37], hosts: [1, 1] },
  F07_UNEQUAL_SCORES: { v7: [4, 4, 3], v8: [4, 4, 3], lost: 0, requests: [37, 37], hosts: [1, 1] },
  F08A_TRACK_B_FLOOR: {
    v7: [12, 12, 12],
    v8: [12, 12, 12],
    lost: 0,
    requests: [37, 37],
    hosts: [1, 1],
  },
  F08B_TRACK_B_SCARCE: { v7: [3, 3, 3], v8: [3, 3, 3], lost: 0, requests: [37, 37], hosts: [1, 1] },
  F09_LOCALE_PREFIX: { v7: [2, 0, 0], v8: [4, 4, 2], lost: 0, requests: [37, 37], hosts: [1, 1] },
  F10_NL_NATIVE_PATHS: { v7: [1, 0, 0], v8: [3, 3, 2], lost: 0, requests: [37, 37], hosts: [1, 1] },
  F10_DE_NATIVE_PATHS: { v7: [1, 0, 0], v8: [3, 3, 2], lost: 0, requests: [37, 37], hosts: [1, 1] },
  F10_ES_NATIVE_PATHS: { v7: [1, 0, 0], v8: [3, 3, 2], lost: 0, requests: [37, 37], hosts: [1, 1] },
  F11_DUPLICATES_REDIRECTS: {
    v7: [1, 1, 0],
    v8: [3, 3, 1],
    lost: 0,
    requests: [37, 37],
    hosts: [1, 1],
  },
  F12_SMALL_SPECIALIST: {
    v7: [2, 2, 1],
    v8: [2, 2, 1],
    lost: 0,
    requests: [13, 13],
    hosts: [1, 1],
  },
  F13_LARGE_UNIVERSITY: {
    v7: [3, 0, 0],
    v8: [5, 4, 2],
    lost: 0,
    requests: [38, 40],
    hosts: [2, 4],
  },
  F14_NO_RELEVANT: { v7: [0, 0, 0], v8: [0, 0, 0], lost: 0, requests: [37, 37], hosts: [1, 1] },
  F15A_CONCENTRATED_FIRST: {
    v7: [26, 26, 1],
    v8: [26, 4, 1],
    lost: 22,
    requests: [37, 37],
    hosts: [1, 1],
  },
  F15_RANK2: { v7: [26, 9, 1], v8: [26, 4, 1], lost: 5, requests: [37, 37], hosts: [1, 1] },
  F15_RANK3: { v7: [26, 0, 0], v8: [26, 4, 1], lost: 0, requests: [37, 37], hosts: [1, 1] },
  F15_RANK4: { v7: [26, 0, 0], v8: [26, 4, 1], lost: 0, requests: [37, 37], hosts: [1, 1] },
  F15_RANK5: { v7: [26, 0, 0], v8: [26, 4, 1], lost: 0, requests: [37, 37], hosts: [1, 1] },
  F15_RANK6: { v7: [26, 0, 0], v8: [26, 4, 1], lost: 0, requests: [37, 37], hosts: [1, 1] },
  F15_RANK7: { v7: [26, 0, 0], v8: [26, 4, 1], lost: 0, requests: [37, 37], hosts: [1, 1] },
  F15_RANK8: { v7: [26, 0, 0], v8: [26, 3, 1], lost: 0, requests: [37, 37], hosts: [1, 1] },
  F15B_CONCENTRATED_LAST: {
    v7: [26, 0, 0],
    v8: [26, 3, 1],
    lost: 0,
    requests: [37, 37],
    hosts: [1, 1],
  },
  F16_CHANGING_ELIGIBILITY: {
    v7: [1, 0, 0],
    v8: [6, 6, 1],
    lost: 0,
    requests: [38, 38],
    hosts: [2, 2],
  },
  F17_EXACT_BUDGET: { v7: [1, 1, 1], v8: [1, 1, 1], lost: 0, requests: [37, 37], hosts: [1, 1] },
  F18_OFF_DOMAIN_ASSOCIATION: {
    v7: [1, 0, 0],
    v8: [1, 1, 1],
    lost: 0,
    requests: [37, 37],
    hosts: [1, 1],
  },
};

/** The ONLY fixtures allowed to lose relevant targets to v8 - the adversarial concentration sweep. */
const DOCUMENTED_REGRESSIONS = ['F15A_CONCENTRATED_FIRST', 'F15_RANK2'];

/** v7's pick from a pool, without mutating anything: the real v7 pickNext logic over an array. */
function v7Choice(pool: readonly FrontierEntry[], trackBSelected: number): FrontierEntry {
  if (trackBSelected < TRACK_B_FLOOR) {
    const viableB = pool.filter((e) => trackScore(e, 'B') > 0);
    if (viableB.length > 0) {
      return [...viableB].sort((a, b) => {
        const delta = trackScore(b, 'B') - trackScore(a, 'B');
        return delta !== 0 ? delta : compareEntriesV7(a, b);
      })[0]!;
    }
  }
  return [...pool].sort(compareEntriesV7)[0]!;
}

// ====================================================== baseline integrity

describe('B1.1 replay: the v7 baseline is the real v7, not a straw man', () => {
  it('the golden file was captured from the v7 production module at the approved base', () => {
    expect(GOLDEN.capturedFrom).toMatchObject({
      commit: '6bbb84af801af778615e4733ca499c6ec051aae7',
      fetchPolicyVersion: 'orgunit-fetch-policy-v7',
      module: 'src/orgunits/orchestrator/frontier.ts',
    });
    expect(Object.keys(GOLDEN.sequences)).toEqual(FIXTURES.map((s) => s.id));
  });

  it.each(FIXTURES.map((s) => [s.id, s] as const))(
    '%s: the frozen v7 copy reproduces the real v7 Frontier pick for pick',
    (id, site) => {
      expect(sequenceOf(replaySite(site, new FrozenV7Frontier()))).toEqual(GOLDEN.sequences[id]);
    },
  );

  it('the frozen copy is the v7 comparator: source precedence then URL, with no section term', () => {
    const source = readFileSync(
      join(REPO_ROOT, 'src/test/harness/frontierReplay/v7Frontier.ts'),
      'utf8',
    );
    expect(source).not.toContain('frontierSectionOf');
    expect(source).not.toContain('sectionPicks');
  });
});

// ====================================================== G1 budgets and scope

describe('G1: budget, host and scope invariants (both policies, every fixture)', () => {
  it('the frozen budgets are unchanged in production source', () => {
    expect([
      MAX_PAGE_ATTEMPTS_PER_ROOT,
      MAX_TOTAL_REQUESTS_PER_ROOT,
      MAX_HOSTS_PER_ROOT,
      TRACK_B_FLOOR,
      CIRCUIT_BREAKER_TRANSIENT_FAILURE_THRESHOLD,
    ]).toEqual([35, 60, 8, 8, 3]);
  });

  it.each(FIXTURES.map((s) => [s.id, s] as const))('%s', (_id, site) => {
    const root = validateRequestUrl(site.root);
    expect(root.ok).toBe(true);
    const rootDomain = root.ok ? root.value.registrableDomain : '';

    for (const result of [v7(site), v8(site)]) {
      expect(result.pageAttempts).toBeLessThanOrEqual(MAX_PAGE_ATTEMPTS_PER_ROOT);
      expect(result.totalRequests).toBeLessThanOrEqual(MAX_TOTAL_REQUESTS_PER_ROOT);
      expect(result.hostsUsed.length).toBeLessThanOrEqual(MAX_HOSTS_PER_ROOT);
      // no attempt repeated, none outside the root's registrable domain
      expect(new Set(result.attemptedPages).size).toBe(result.attemptedPages.length);
      for (const url of [...result.attemptedPages, ...result.discovered]) {
        const v = validateRequestUrl(url);
        expect(v.ok && v.value.registrableDomain, url).toBe(rootDomain);
      }
      for (const url of site.outOfScope ?? []) {
        expect(result.discovered.has(url), url).toBe(false);
      }
      // a failing host never takes more than the breaker threshold of transient failures
      const failuresByHost = new Map<string, number>();
      for (const pick of result.picks) {
        if (pick.status !== 'FETCHED_TRANSPORT_FAILURE') continue;
        const host = new URL(pick.url).hostname;
        failuresByHost.set(host, (failuresByHost.get(host) ?? 0) + 1);
      }
      for (const n of failuresByHost.values()) {
        expect(n).toBeLessThanOrEqual(CIRCUIT_BREAKER_TRANSIENT_FAILURE_THRESHOLD);
      }
    }
  });

  it('page attempts are identical under v7 and v8 on every fixture: ordering never buys budget', () => {
    for (const site of FIXTURES) expect(v8(site).pageAttempts, site.id).toBe(v7(site).pageAttempts);
  });

  it('F17 exhausts the page budget exactly, with the frontier empty, under both policies', () => {
    const site = FIXTURES.find((s) => s.id === 'F17_EXACT_BUDGET')!;
    for (const result of [v7(site), v8(site)]) {
      expect(result.pageAttempts).toBe(MAX_PAGE_ATTEMPTS_PER_ROOT);
      expect(result.stopReason).toBe('PAGE_BUDGET_EXHAUSTED');
      expect(result.picks).toHaveLength(MAX_PAGE_ATTEMPTS_PER_ROOT - 1);
    }
  });

  it('F16: the timing-out subdomain opens its circuit and its remaining entries are never attempted, under both policies', () => {
    const site = FIXTURES.find((s) => s.id === 'F16_CHANGING_ELIGIBILITY')!;
    for (const result of [v7(site), v8(site)]) {
      const flaky = result.picks.filter((p) => new URL(p.url).hostname.startsWith('carrieres.'));
      expect(flaky.map((p) => p.status)).toEqual(
        Array(CIRCUIT_BREAKER_TRANSIENT_FAILURE_THRESHOLD).fill('FETCHED_TRANSPORT_FAILURE'),
      );
    }
  });
});

// ====================================================== G2 determinism

const PERMUTATIONS: readonly (readonly [string, <T>(xs: readonly T[]) => T[]])[] = [
  ['reverse', (xs) => [...xs].reverse()],
  [
    'rotate-third',
    (xs) => [...xs.slice(Math.floor(xs.length / 3)), ...xs.slice(0, Math.floor(xs.length / 3))],
  ],
  [
    'interleave-halves',
    (xs) => {
      const half = Math.ceil(xs.length / 2);
      const out: (typeof xs)[number][] = [];
      for (let i = 0; i < half; i += 1) {
        out.push(xs[i]!);
        if (i + half < xs.length) out.push(xs[i + half]!);
      }
      return out;
    },
  ],
  [
    'odd-then-even',
    (xs) => [...xs.filter((_, i) => i % 2 === 1), ...xs.filter((_, i) => i % 2 === 0)],
  ],
  [
    // A FIXED pseudo-shuffle (an LCG with a constant seed): deterministic, not runtime randomness.
    'fixed-lcg-shuffle',
    (xs) => {
      const out = [...xs];
      let state = 2026;
      for (let i = out.length - 1; i > 0; i -= 1) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        const j = state % (i + 1);
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
  ],
];

describe('G2: determinism', () => {
  it.each(FIXTURES.map((s) => [s.id, s] as const))(
    '%s: identical sequences on repeat and under five insertion-order permutations',
    (_id, site) => {
      const reference = sequenceOf(replaySite(site, createFrontier()));
      expect(sequenceOf(replaySite(site, createFrontier()))).toEqual(reference);
      for (const [, permute] of PERMUTATIONS) {
        const permuted = replaySite(site, createFrontier(), {
          sitemapOrder: (urls) => permute(urls),
          linkOrder: (links: readonly SyntheticLink[]) => permute(links),
        });
        expect(sequenceOf(permuted)).toEqual(reference);
      }
    },
  );

  it('F11: case and percent-encoding variants stay distinct frontier entries but share one section', () => {
    const site = FIXTURES.find((s) => s.id === 'F11_DUPLICATES_REDIRECTS')!;
    const result = v8(site);
    const variants = [
      'https://www.synth-univ-n.fr/Vie-Etudiante/plan',
      'https://www.synth-univ-n.fr/vie-%C3%A9tudiante/plan',
      'https://www.synth-univ-n.fr/vie-étudiante/plan',
    ];
    for (const url of variants) expect(result.discovered.has(url)).toBe(true);
    expect(new Set(variants.map((u) => frontierSectionOf(u).key)).size).toBe(2); // vie-etudiante vs vie-étudiante
    // the duplicate sitemap entries were admitted once
    const picks = result.picks.map((p) => p.url);
    expect(new Set(picks).size).toBe(picks.length);
    // the redirect loop terminated: each loop URL attempted at most once
    expect(result.attemptedPages.filter((u) => u.includes('/boucle-')).length).toBeLessThanOrEqual(
      2,
    );
  });
});

// ====================================================== G3 scoring contract

describe('G3: strict priorities and the Track B floor, pick by pick', () => {
  it.each(FIXTURES.map((s) => [s.id, s] as const))('%s', (_id, site) => {
    const result = v8WithPools(site);
    for (const pick of result.picks) {
      const pool = pick.eligiblePool!;
      const chosen = pool.find((e) => e.url === pick.url);
      expect(chosen, `${pick.url} was not in its own eligible pool`).toBeDefined();
      const baseline = v7Choice(pool, pick.trackBSelectedBefore);

      // Same strict-priority class as v7 would have picked from the SAME pool and state.
      expect(strictPriorityKey(chosen!)).toBe(strictPriorityKey(baseline));
      // Same floor decision: floor pool membership and Track B score match v7's.
      expect(trackScore(chosen!, 'B') > 0).toBe(trackScore(baseline, 'B') > 0);
      const floorActive =
        pick.trackBSelectedBefore < TRACK_B_FLOOR && pool.some((e) => trackScore(e, 'B') > 0);
      if (floorActive) expect(trackScore(chosen!, 'B')).toBe(trackScore(baseline, 'B'));
      // Nothing with a lower best score than an available alternative is ever chosen outside the floor.
      if (!floorActive) {
        const best = Math.max(...pool.map((e) => Number(strictPriorityKey(e).split('|')[0])));
        expect(Number(strictPriorityKey(chosen!).split('|')[0])).toBe(best);
      }
    }
  });

  it('where the budget never binds (F12), v8 attempts exactly the pages v7 attempts - only the order may differ', () => {
    const site = FIXTURES.find((s) => s.id === 'F12_SMALL_SPECIALIST')!;
    expect(new Set(v8(site).attemptedPages)).toEqual(new Set(v7(site).attemptedPages));
  });

  it('where every score-relevant decision is strict (F07), v8 fetches the strong pages in the same order as v7', () => {
    const site = FIXTURES.find((s) => s.id === 'F07_UNEQUAL_SCORES')!;
    const strong = new Set(site.relevant);
    const order = (r: ReplayResult): string[] =>
      r.picks.map((p) => p.url).filter((u) => strong.has(u));
    expect(order(v8(site))).toEqual(order(v7(site)));
  });

  it('the Track B selection count is identical wherever discovery is identical (F07, F08A, F08B, F12, F17)', () => {
    for (const id of [
      'F07_UNEQUAL_SCORES',
      'F08A_TRACK_B_FLOOR',
      'F08B_TRACK_B_SCARCE',
      'F12_SMALL_SPECIALIST',
      'F17_EXACT_BUDGET',
    ]) {
      const site = FIXTURES.find((s) => s.id === id)!;
      expect(v8(site).trackBSelected, id).toBe(v7(site).trackBSelected);
    }
  });
});

// ====================================================== G6 local fairness

describe('G6: among simultaneously eligible tied candidates, the least-picked section goes next', () => {
  it.each(FIXTURES.map((s) => [s.id, s] as const))('%s', (_id, site) => {
    const result = v8WithPools(site);
    const counts = new Map<string, number>();
    const countOf = (e: FrontierEntry): number =>
      counts.get(`${strictPriorityKey(e)}\u0000${frontierSectionOf(e.url).key}`) ?? 0;

    for (const pick of result.picks) {
      const pool = pick.eligiblePool!;
      const chosen = pool.find((e) => e.url === pick.url)!;
      const floorActive =
        pick.trackBSelectedBefore < TRACK_B_FLOOR && pool.some((e) => trackScore(e, 'B') > 0);
      // The tie group: what v7's strict keys could not separate from the chosen entry.
      const tied = pool.filter(
        (e) =>
          strictPriorityKey(e) === strictPriorityKey(chosen) &&
          (!floorActive || trackScore(e, 'B') === trackScore(chosen, 'B')),
      );
      const least = Math.min(...tied.map(countOf));
      expect(countOf(chosen), pick.url).toBe(least);
      // ...and among the least-picked sections, the shallowest candidate.
      const leastDepth = Math.min(
        ...tied.filter((e) => countOf(e) === least).map((e) => frontierSectionOf(e.url).depth),
      );
      expect(frontierSectionOf(chosen.url).depth).toBe(leastDepth);

      const key = `${strictPriorityKey(chosen)}\u0000${frontierSectionOf(chosen.url).key}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  });
});

// ====================================================== G4 / G5 outcomes

describe('G4/G5: synthetic coverage, pinned and reported', () => {
  it('pins every fixture outcome (no fixture added or removed silently)', () => {
    expect(Object.keys(EXPECTED)).toEqual(FIXTURES.map((s) => s.id));
  });

  it.each(FIXTURES.map((s) => [s.id, s] as const))('%s', (id, site) => {
    const baseline = v7(site);
    const candidate = v8(site);
    const mb = measure(site, baseline);
    const mc = measure(site, candidate);
    expect({
      v7: [mb.relevantDiscovered, mb.relevantFetched, mb.highRelevanceFetched],
      v8: [mc.relevantDiscovered, mc.relevantFetched, mc.highRelevanceFetched],
      lost: lostRelativeTo(site, baseline, candidate).length,
      requests: [mb.totalRequests, mc.totalRequests],
      hosts: [mb.distinctHosts, mc.distinctHosts],
    }).toEqual(EXPECTED[id]);
  });

  // Scoped to the coverage fixtures. NOT a claim that v8 never loses a
  // high-relevance target: the host-cap fixture H1, pinned separately below,
  // loses one.
  it('G4: among the coverage fixtures, only the documented adversarial ones lose targets, and none loses a high-relevance target', () => {
    const losing = FIXTURES.filter((site) => lostRelativeTo(site, v7(site), v8(site)).length > 0);
    expect(losing.map((s) => s.id)).toEqual(DOCUMENTED_REGRESSIONS);
    for (const site of FIXTURES) {
      const lost = new Set(lostRelativeTo(site, v7(site), v8(site)));
      for (const url of site.highRelevance) expect(lost.has(url), `${site.id}: ${url}`).toBe(false);
    }
  });

  it('G4: across the nine-placement concentration sweep, v8 is placement-invariant and loses at most one target in total', () => {
    const sweep = FIXTURES.filter((s) => s.id.startsWith('F15'));
    expect(sweep).toHaveLength(9);
    const v7Fetched = sweep.map((s) => measure(s, v7(s)).relevantFetched);
    const v8Fetched = sweep.map((s) => measure(s, v8(s)).relevantFetched);
    expect(v7Fetched).toEqual([26, 9, 0, 0, 0, 0, 0, 0, 0]);
    expect(v8Fetched).toEqual([4, 4, 4, 4, 4, 4, 4, 3, 3]);
    const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
    expect(sum(v7Fetched) - sum(v8Fetched)).toBe(1);
    // The section's landing page (tier 1): v7 2 of 9 placements (ranks 1-2), v8 9 of 9.
    expect(sweep.map((s) => measure(s, v7(s)).highRelevanceFetched)).toEqual([
      1, 1, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(sweep.map((s) => measure(s, v8(s)).highRelevanceFetched)).toEqual([
      1, 1, 1, 1, 1, 1, 1, 1, 1,
    ]);
  });

  it('G5: the principal alphabetical-starvation fixture improves from 0 to all 6 targets with identical budgets', () => {
    const site = FIXTURES.find((s) => s.id === 'F01_ALPHA_CLUSTERED_HIDDEN_HUB')!;
    const [b, c] = [v7(site), v8(site)];
    expect(c.pageAttempts).toBe(b.pageAttempts);
    expect(c.totalRequests).toBe(b.totalRequests);
    expect(measure(site, b).relevantFetched).toBe(0);
    expect(measure(site, c).relevantFetched).toBe(6);
  });

  it('G5: structurally different mechanisms also improve (noisy section, positive ties, multi-host, locale prefix)', () => {
    for (const id of [
      'F05_NOISY_SECTION',
      'F06_POSITIVE_TIES',
      'F04_MULTI_HOST',
      'F09_LOCALE_PREFIX',
    ]) {
      const site = FIXTURES.find((s) => s.id === id)!;
      expect(measure(site, v8(site)).relevantFetched, id).toBeGreaterThan(
        measure(site, v7(site)).relevantFetched,
      );
    }
  });
});

// ====================================================== KNOWN LIMITATION H1

/**
 * H1 IS A KNOWN, INTENTIONALLY RETAINED v8 REGRESSION - NOT A BUG TO "FIX" BY
 * EDITING THESE NUMBERS.
 *
 * With eight zero-score subdomains competing with the primary host, v8's
 * section round-robin (every host is its own section) admits seven of them
 * within its first nine picks, filling the 8-host cap (MAX_HOSTS_PER_ROOT).
 * The positive target - an "International Office" page on a TENTH host,
 * revealed only by a link on the third `/accueil/` page - is DISCOVERED by
 * both policies, but under v8 only after the cap is full, so its host is
 * never admissible and it is never attempted. v7 stays on the primary host
 * (`www` sorts before `x-*`), reaches the linking page at pick 3 and fetches
 * the target at pick 4.
 *
 * The B1.1 final-verification assignment accepted this PROVISIONALLY, for
 * local development evaluation only: the 8-host cap stays, and no host
 * reservation, admissibility rule or fallback scheduling was added. Whether
 * host-cap mitigation is needed is a SEPARATE policy decision that must be
 * taken before any production release of v8 (ADR 0018 s8). If that decision
 * changes v8's behaviour here, this block must change with it, visibly.
 *
 * The simulator charges ONE request per site-policy file. The real runner
 * budgets up to three per new host (continuation and transport retry), so
 * the request cost of v8's extra hosts on real sites is UNKNOWN and is not
 * measured here.
 */
describe('KNOWN LIMITATION H1: v8 can spend the 8-host cap on noise subdomains and lose a later-discovered target', () => {
  const site = h1HostCapLimitation();
  const [hub, office] = site.relevant as [string, string];
  const H1_GOLDEN = JSON.parse(
    readFileSync(
      join(REPO_ROOT, 'src/test/fixtures/frontierReplay/v7-golden-h1-host-cap.json'),
      'utf8',
    ),
  ) as {
    capturedFrom: { commit: string; fetchPolicyVersion: string; module: string };
    sequence: string[];
  };
  const baseline = replaySite(site, new FrozenV7Frontier());
  const candidate = replaySite(site, createFrontier(), { recordPools: true });
  const pickIndex = (r: ReplayResult, url: string): number =>
    r.picks.findIndex((p) => p.url === url) + 1;
  const hostOrder = (r: ReplayResult): string[] => {
    const order: string[] = [];
    for (const url of [site.root, ...r.attemptedPages]) {
      const label = new URL(url).hostname.split('.')[0]!;
      if (!order.includes(label)) order.push(label);
    }
    return order;
  };

  it('stays outside allFixtures(), so the original golden file and G4 set keep their provenance', () => {
    expect(FIXTURES.map((s) => s.id)).not.toContain(site.id);
    expect(Object.keys(GOLDEN.sequences)).not.toContain(site.id);
  });

  it('the v7 baseline is the real v7: the frozen copy reproduces the separately captured golden H1 sequence', () => {
    expect(H1_GOLDEN.capturedFrom).toMatchObject({
      commit: '6bbb84af801af778615e4733ca499c6ec051aae7',
      fetchPolicyVersion: 'orgunit-fetch-policy-v7',
      module: 'src/orgunits/orchestrator/frontier.ts',
    });
    expect(sequenceOf(baseline)).toEqual(H1_GOLDEN.sequence);
  });

  it('the target scores positive on its own evidence, so this is a host-cap loss, not a scoring loss', () => {
    // Scored exactly as the replay's frontier admits it: a LINK from the hub, with its anchor text.
    const probe = createFrontier();
    const admission = probe.add(office, 'LINK', hub, 'International Office');
    expect(admission.ok).toBe(true);
    if (admission.ok) {
      expect(trackScore(admission.entry, 'A')).toBe(12);
      expect(trackScore(admission.entry, 'B')).toBe(0);
    }
  });

  it('URL discovery: both policies discover the target, through the same hub link', () => {
    expect(baseline.discovered.has(office)).toBe(true);
    expect(candidate.discovered.has(office)).toBe(true);
    expect(baseline.discovered.size).toBe(97);
    expect(candidate.discovered.size).toBe(97);
    // ...but v8 reaches the linking page much later.
    expect(pickIndex(baseline, hub)).toBe(3);
    expect(pickIndex(candidate, hub)).toBe(19);
  });

  it('host admission: v8 fills the 8-host cap with seven noise subdomains by pick 9, ten picks before it learns of the target', () => {
    expect(hostOrder(baseline)).toEqual(['www', 'international', 'x-agenda', 'x-alumni']);
    expect(hostOrder(candidate)).toEqual([
      'www',
      'x-agenda',
      'x-alumni',
      'x-bu',
      'x-campus',
      'x-culture',
      'x-presse',
      'x-sport',
    ]);
    expect(candidate.hostsUsed).toHaveLength(MAX_HOSTS_PER_ROOT);
    const hostsAfter = new Set<string>([new URL(site.root).hostname]);
    candidate.picks.slice(0, 9).forEach((p) => hostsAfter.add(new URL(p.url).hostname));
    expect(hostsAfter.size).toBe(MAX_HOSTS_PER_ROOT);
  });

  it('page selection and fetch attempts: v7 picks and fetches the target at pick 4; v8 never offers it to selection', () => {
    expect(pickIndex(baseline, office)).toBe(4);
    expect(baseline.picks[3]!.status).toBe('FETCHED_HTML');
    expect(pickIndex(candidate, office)).toBe(0);
    expect(candidate.attemptedPages).not.toContain(office);
    // Discovered at pick 19, yet absent from every later eligible pool: its
    // host is inadmissible, so it is not even a candidate - not out-ranked.
    for (const pick of candidate.picks) {
      expect(
        pick.eligiblePool!.some((e) => e.url === office),
        pick.url,
      ).toBe(false);
    }
  });

  it('budgets: identical page attempts and stop reason; v8 spends four more site-policy requests', () => {
    for (const r of [baseline, candidate]) {
      expect(r.pageAttempts).toBe(MAX_PAGE_ATTEMPTS_PER_ROOT);
      expect(r.picks).toHaveLength(MAX_PAGE_ATTEMPTS_PER_ROOT - 1);
      expect(r.sitemapRequests).toBe(1);
      expect(r.stopReason).toBe('PAGE_BUDGET_EXHAUSTED');
    }
    expect([baseline.robotsRequests, candidate.robotsRequests]).toEqual([4, 8]);
    expect([baseline.totalRequests, candidate.totalRequests]).toEqual([40, 44]);
  });

  it('relevant pages successfully fetched: v7 2 of 2, v8 1 of 2 - the high-relevance target is LOST', () => {
    const [mb, mc] = [measure(site, baseline), measure(site, candidate)];
    expect([mb.relevantFetched, mb.highRelevanceFetched]).toEqual([2, 1]);
    expect([mc.relevantFetched, mc.highRelevanceFetched]).toEqual([1, 0]);
    expect(lostRelativeTo(site, baseline, candidate)).toEqual([office]);
    expect(site.highRelevance).toEqual([office]);
  });

  it('is deterministic: a fresh v8 run reproduces the same picks', () => {
    expect(sequenceOf(replaySite(site, createFrontier()))).toEqual(sequenceOf(candidate));
  });
});
