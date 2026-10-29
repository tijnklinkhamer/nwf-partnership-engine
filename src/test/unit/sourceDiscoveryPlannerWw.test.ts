/**
 * WW E-SD - the worldwide search planner (`nwf-discovery-plan-v2`): PURE,
 * deterministic, every geography treated alike, novelty by cursor, exclusion
 * carried in the digest. JP, MX and NL appear here only as regression
 * examples next to BR, KE, VN, PL, TR and CA.
 */
import { describe, expect, it } from 'vitest';

import { ISO_3166_1_ALPHA2_ASSIGNED } from '../../orgunits/subjectJurisdiction/vocabulary.js';
import {
  PLAN_DEFAULT_PAGE_SIZE,
  PlannerRefusal,
  planBody,
  planDiscoveryQueries,
  queryLanguagesFor,
  rederiveStoredPlan,
} from '../../orgunits/sourceDiscovery/planner/plan.js';
import { PLACE_NAMES } from '../../orgunits/sourceDiscovery/planner/placeNames.js';
import {
  QUERY_TEMPLATES,
  QUERY_TEMPLATE_LANGUAGES,
  TEMPLATE_SLOTS,
} from '../../orgunits/sourceDiscovery/planner/templates.js';
import {
  DISCOVERY_ORG_KINDS,
  DISCOVERY_SEGMENTS,
  DISCOVERY_SIGNALS,
} from '../../orgunits/sourceDiscovery/planner/vocabulary.js';

const QUERY_ID = /^[a-z]{2}\.[a-z]{2,3}\.[a-z0-9-]{2,48}\.[0-9]{2}$/;

describe('WW E-SD planner: the reviewed tables', () => {
  it('every language carries every slot exactly once, with {place} exactly once', () => {
    const slugs = TEMPLATE_SLOTS.map((s) => s.slug).sort();
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const language of QUERY_TEMPLATE_LANGUAGES) {
      const texts = QUERY_TEMPLATES[language];
      expect(Object.keys(texts).sort(), language).toEqual(slugs);
      for (const [slug, text] of Object.entries(texts)) {
        expect(text.split('{place}'), `${language}.${slug}`).toHaveLength(2);
        expect(text.trim(), `${language}.${slug}`).toBe(text);
      }
    }
  });

  it('the slots cover every segment, organisation kind and distribution signal', () => {
    expect(new Set(TEMPLATE_SLOTS.map((s) => s.segment))).toEqual(new Set(DISCOVERY_SEGMENTS));
    expect(new Set(TEMPLATE_SLOTS.map((s) => s.orgKind))).toEqual(new Set(DISCOVERY_ORG_KINDS));
    expect(new Set(TEMPLATE_SLOTS.map((s) => s.signal))).toEqual(new Set(DISCOVERY_SIGNALS));
  });

  it('localises the text, not word by word: each language differs from English', () => {
    for (const language of QUERY_TEMPLATE_LANGUAGES.filter((l) => l !== 'en')) {
      const same = TEMPLATE_SLOTS.filter(
        (s) => QUERY_TEMPLATES[language][s.slug] === QUERY_TEMPLATES.en[s.slug],
      );
      expect(same, language).toEqual([]);
    }
  });

  it('has a place name for every one of the 249 geographies in every template language', () => {
    expect(Object.keys(PLACE_NAMES).sort()).toEqual([...ISO_3166_1_ALPHA2_ASSIGNED].sort());
    for (const [code, names] of Object.entries(PLACE_NAMES)) {
      expect(names, code).toHaveLength(QUERY_TEMPLATE_LANGUAGES.length);
      for (const name of names) expect(name.length, code).toBeGreaterThan(1);
    }
  });

  it('plans every one of the 249 geographies, English always last', () => {
    for (const geography of ISO_3166_1_ALPHA2_ASSIGNED) {
      const plan = planDiscoveryQueries({ geography });
      expect(plan.queries.length, geography).toBe(PLAN_DEFAULT_PAGE_SIZE);
      expect(plan.languages.at(-1), geography).toBe('en');
      for (const q of plan.queries) {
        expect(q.queryId, geography).toMatch(QUERY_ID);
        expect(q.queryId.startsWith(`${geography.toLowerCase()}.${q.language}.`)).toBe(true);
        expect(q.text.length).toBeLessThanOrEqual(200);
        expect(q.text).not.toContain('{place}');
      }
    }
  });
});

describe('WW E-SD planner: regression geographies', () => {
  it.each([
    ['JP', ['ja', 'en']],
    ['MX', ['es', 'en']],
    ['NL', ['nl', 'en']],
    ['BR', ['pt', 'en']],
    ['KE', ['en']],
    ['VN', ['en']],
    ['PL', ['en']],
    ['TR', ['en']],
    ['CA', ['fr', 'en']],
    ['BE', ['nl', 'fr', 'de', 'en']],
  ])('%s queries in %j', (geography, languages) => {
    expect(queryLanguagesFor(geography, [])).toEqual(languages);
    const plan = planDiscoveryQueries({ geography, pageSize: 40 });
    expect(plan.languages).toEqual(languages);
    expect(new Set(plan.queries.map((q) => q.language))).toEqual(new Set(languages));
  });

  it('writes Japanese query text for JP, with the Japanese place name', () => {
    const plan = planDiscoveryQueries({ geography: 'JP' });
    const ja = plan.queries.filter((q) => q.language === 'ja');
    expect(ja.length).toBeGreaterThan(0);
    for (const q of ja) {
      expect(q.text).toMatch(/[぀-ヿ一-鿿]/);
      expect(q.text).toContain('日本');
    }
    expect(plan.queries.find((q) => q.language === 'en')!.text).toContain('Japan');
  });

  it('an unknown-template geography gets English plus explicit languages', () => {
    expect(queryLanguagesFor('VN', [])).toEqual(['en']);
    const plan = planDiscoveryQueries({ geography: 'VN', languages: ['fr', 'ja'] });
    expect(plan.languages).toEqual(['fr', 'ja', 'en']);
    expect(plan.queries.find((q) => q.language === 'fr')!.text).toContain('Viêt Nam');
  });
});

describe('WW E-SD planner: determinism and digest', () => {
  it('the same request yields the same plan and digest; any change is a new digest', () => {
    const a = planDiscoveryQueries({ geography: 'MX', excludedDomains: ['b.mx', 'a.mx'] });
    const b = planDiscoveryQueries({ geography: 'MX', excludedDomains: ['A.MX ', 'b.mx', 'b.mx'] });
    expect(b).toEqual(a);
    expect(a.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(a.planId).toBe(`nwf-discovery-plan-v2.MX.${a.digest.slice(0, 16)}`);
    expect(a.request.excludedDomains).toEqual(['a.mx', 'b.mx']);
    const c = planDiscoveryQueries({ geography: 'MX', excludedDomains: ['a.mx'] });
    expect(c.digest).not.toBe(a.digest);
    expect(c.queries).toEqual(a.queries);
  });

  it('pins one digest so an accidental table edit is visible', () => {
    // Regression pin: a changed template, place name, language table or
    // ordering moves this digest and must be a reviewed edit.
    expect(planDiscoveryQueries({ geography: 'NL' }).digest).toBe(
      '7bbf2262f2c553eec1bb30d77c33faa8e1a6a355e4afcc448ad691946367ad5e',
    );
  });

  it('re-derives a stored body byte for byte, and refuses any edited one', () => {
    const plan = planDiscoveryQueries({ geography: 'BR', pageSize: 5 });
    const stored = JSON.parse(JSON.stringify(planBody(plan))) as Record<string, unknown>;
    expect(rederiveStoredPlan(stored, plan.digest)).toEqual(plan);
    expect(rederiveStoredPlan(stored, 'f'.repeat(64))).toBeNull();
    const tampered = JSON.parse(JSON.stringify(stored)) as {
      queries: { text: string }[];
    };
    tampered.queries[0]!.text = 'buy cheap followers';
    expect(rederiveStoredPlan(tampered, plan.digest)).toBeNull();
    expect(rederiveStoredPlan(null, plan.digest)).toBeNull();
    expect(rederiveStoredPlan({ request: { geography: 'ZZ' } }, plan.digest)).toBeNull();
  });
});

describe('WW E-SD planner: novelty, exclusion and filters', () => {
  it('a cursor never repeats a query, and the universe ends exhausted', () => {
    const seen = new Set<string>();
    let cursor: { usedQueryIds: readonly string[] } | undefined;
    let pages = 0;
    for (;;) {
      const plan = planDiscoveryQueries({
        geography: 'PL',
        pageSize: 7,
        ...(cursor ? { cursor } : {}),
      });
      if (plan.exhausted) {
        expect(plan.queries).toEqual([]);
        expect(plan.remaining).toBe(0);
        break;
      }
      for (const q of plan.queries) {
        expect(seen.has(q.queryId)).toBe(false);
        seen.add(q.queryId);
      }
      cursor = plan.nextCursor;
      pages += 1;
    }
    // PL has English only: 20 slots x 1 language.
    expect(seen.size).toBe(20);
    expect(pages).toBe(3);
  });

  it('filters by segment, kind and signal, never by geography', () => {
    const plan = planDiscoveryQueries({
      geography: 'TR',
      signals: ['NEWSLETTER'],
      pageSize: 40,
    });
    expect(plan.queries.length).toBeGreaterThan(0);
    for (const q of plan.queries) expect(q.dimensions.signal).toBe('NEWSLETTER');
    const buddy = planDiscoveryQueries({ geography: 'KE', orgKinds: ['BUDDY_PROGRAMME'] });
    expect(buddy.queries.map((q) => q.dimensions.orgKind)).toEqual(['BUDDY_PROGRAMME']);
  });

  it('gives no geography a stereotype: same-language geographies get identical dimension sequences', () => {
    const shape = (geography: string) =>
      planDiscoveryQueries({ geography, pageSize: 40 }).queries.map(
        (q) =>
          `${q.language}|${q.dimensions.segment}|${q.dimensions.orgKind}|${q.dimensions.signal}`,
      );
    // English-only geographies on four continents: identical query shapes.
    expect(shape('KE')).toEqual(shape('VN'));
    expect(shape('KE')).toEqual(shape('PL'));
    expect(shape('KE')).toEqual(shape('TR'));
    expect(shape('KE')).toEqual(shape('US'));
    // Spanish-primary geographies: identical too.
    expect(shape('MX')).toEqual(shape('ES'));
    expect(shape('MX')).toEqual(shape('AR'));
    // Every plan uses the same page size and the full dimension vocabulary.
    for (const g of ['JP', 'MX', 'NL', 'BR', 'KE', 'VN', 'PL', 'TR', 'CA']) {
      expect(planDiscoveryQueries({ geography: g }).queries).toHaveLength(PLAN_DEFAULT_PAGE_SIZE);
    }
  });

  it('carries the exclusion set in the plan without removing any query', () => {
    const plain = planDiscoveryQueries({ geography: 'NL' });
    const excluded = planDiscoveryQueries({
      geography: 'NL',
      excludedDomains: ['taalcafe-fict.nl', 'esn-fict.nl'],
    });
    expect(excluded.queries).toEqual(plain.queries);
    expect(excluded.request.excludedDomains).toEqual(['esn-fict.nl', 'taalcafe-fict.nl']);
  });

  it.each([
    [{ geography: 'XK' }, 'PLAN_GEOGRAPHY_UNKNOWN'],
    [{ geography: 'jp' }, 'PLAN_GEOGRAPHY_UNKNOWN'],
    [{ geography: 'JP', languages: ['sw'] }, 'PLAN_LANGUAGE_UNSUPPORTED'],
    [{ geography: 'JP', segments: [] }, 'PLAN_DIMENSION_INVALID'],
    [{ geography: 'JP', signals: ['SCORE'] }, 'PLAN_DIMENSION_INVALID'],
    [{ geography: 'JP', excludedDomains: ['https://x.jp/'] }, 'PLAN_EXCLUSION_INVALID'],
    [
      { geography: 'JP', cursor: { usedQueryIds: ['mx.es.language-cafe.01'] } },
      'PLAN_CURSOR_INVALID',
    ],
    [{ geography: 'JP', pageSize: 0 }, 'PLAN_PAGE_SIZE_INVALID'],
    [{ geography: 'JP', pageSize: 41 }, 'PLAN_PAGE_SIZE_INVALID'],
  ])('refuses %j with %s', (request, code) => {
    let caught: unknown;
    try {
      planDiscoveryQueries(request as Parameters<typeof planDiscoveryQueries>[0]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PlannerRefusal);
    expect((caught as PlannerRefusal).code).toBe(code);
  });
});
