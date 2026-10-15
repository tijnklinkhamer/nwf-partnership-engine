import { describe, expect, it } from 'vitest';
import { createFrontier, frontierSectionOf } from '../../orgunits/orchestrator/frontier.js';

const alwaysAdmissible = (): boolean => true;

describe('Frontier admission', () => {
  it('admits a plausible URL and returns its computed score', () => {
    const frontier = createFrontier();
    const admission = frontier.add('https://example.edu/international/office', 'LINK', null, null);
    expect(admission.ok).toBe(true);
    expect(frontier.size).toBe(1);
  });

  it('refuses a duplicate URL (fragment-free identity)', () => {
    const frontier = createFrontier();
    frontier.add('https://example.edu/a', 'LINK', null, null);
    const second = frontier.add('https://example.edu/a', 'LINK', null, null);
    expect(second).toEqual({ ok: false, reason: 'ALREADY_SEEN' });
    expect(frontier.size).toBe(1);
  });

  it('refuses an obvious binary/document extension URL before scoring', () => {
    const frontier = createFrontier();
    const admission = frontier.add('https://example.edu/brochure.pdf', 'LINK', null, null);
    expect(admission).toEqual({ ok: false, reason: 'BINARY_EXTENSION' });
    expect(frontier.size).toBe(0);
  });

  it('a URL refused once is remembered as seen and not re-scored on a second attempt', () => {
    const frontier = createFrontier();
    frontier.add('https://example.edu/x.pdf', 'LINK', null, null);
    expect(frontier.hasSeen('https://example.edu/x.pdf')).toBe(true);
    const second = frontier.add('https://example.edu/x.pdf', 'LINK', null, null);
    expect(second).toEqual({ ok: false, reason: 'ALREADY_SEEN' });
  });

  it('totalObserved counts every URL ever offered, admitted or refused', () => {
    const frontier = createFrontier();
    frontier.add('https://example.edu/a', 'LINK', null, null);
    frontier.add('https://example.edu/b.pdf', 'LINK', null, null);
    expect(frontier.totalObserved).toBe(2);
  });
});

describe('Frontier deterministic ordering', () => {
  it('picks the higher-scoring URL first', () => {
    const frontier = createFrontier();
    frontier.add(
      'https://example.edu/international/erasmus-office',
      'LINK',
      null,
      'International Office',
    );
    frontier.add('https://example.edu/random-page', 'LINK', null, null);
    const first = frontier.pickNext(0, 8, alwaysAdmissible);
    expect(first?.url).toBe('https://example.edu/international/erasmus-office');
  });

  it('breaks a score tie between unpicked, equally deep sections by URL lexical order, deterministically', () => {
    const frontier = createFrontier();
    frontier.add('https://example.edu/zzz-page', 'LINK', null, null);
    frontier.add('https://example.edu/aaa-page', 'LINK', null, null);
    const first = frontier.pickNext(0, 8, alwaysAdmissible);
    expect(first?.url).toBe('https://example.edu/aaa-page');
  });

  it('pickNext removes the returned entry so it is never picked twice', () => {
    const frontier = createFrontier();
    frontier.add('https://example.edu/a', 'LINK', null, null);
    const first = frontier.pickNext(0, 8, alwaysAdmissible);
    expect(first?.url).toBe('https://example.edu/a');
    const second = frontier.pickNext(0, 8, alwaysAdmissible);
    expect(second).toBeNull();
    expect(frontier.size).toBe(0);
  });

  it('returns null immediately when the frontier is empty', () => {
    const frontier = createFrontier();
    expect(frontier.pickNext(0, 8, alwaysAdmissible)).toBeNull();
  });

  it('an inadmissible host is skipped even if it scores highest', () => {
    const frontier = createFrontier();
    frontier.add('https://blocked.example.edu/international-office', 'LINK', null, null);
    frontier.add('https://ok.example.edu/random', 'LINK', null, null);
    const admissible = (host: string): boolean => host !== 'blocked.example.edu';
    const first = frontier.pickNext(0, 8, admissible);
    expect(first?.url).toBe('https://ok.example.edu/random');
  });
});

describe('Frontier Track B floor scheduling (spec s33/s34)', () => {
  function seedManyTrackAUrls(frontier: ReturnType<typeof createFrontier>, count: number): void {
    for (let i = 0; i < count; i += 1) {
      frontier.add(
        `https://example.edu/international/erasmus-mobility-${i}`,
        'LINK',
        null,
        'International mobility office',
      );
    }
  }
  function seedTrackBUrls(frontier: ReturnType<typeof createFrontier>, count: number): void {
    for (let i = 0; i < count; i += 1) {
      frontier.add(
        `https://example.edu/langues/centre-de-langues-${i}`,
        'LINK',
        null,
        'Centre de langues',
      );
    }
  }

  it('scenario A: 27+ viable Track A and 8 viable Track B -> Track B receives at least 8 selections within 35', () => {
    const frontier = createFrontier();
    seedManyTrackAUrls(frontier, 30);
    seedTrackBUrls(frontier, 8);

    let trackBSelected = 0;
    let total = 0;
    while (total < 35) {
      const next = frontier.pickNext(trackBSelected, 8, alwaysAdmissible);
      if (next === null) break;
      const bScore = next.score.tracks.find((t) => t.track === 'B')?.score ?? 0;
      if (bScore > 0) trackBSelected += 1;
      total += 1;
    }
    expect(trackBSelected).toBeGreaterThanOrEqual(8);
    expect(total).toBeLessThanOrEqual(35);
  });

  it('scenario B: many Track A, only 3 viable Track B -> all 3 are selected, no fake extra B pages invented', () => {
    const frontier = createFrontier();
    seedManyTrackAUrls(frontier, 30);
    seedTrackBUrls(frontier, 3);

    let trackBSelected = 0;
    let total = 0;
    while (total < 35) {
      const next = frontier.pickNext(trackBSelected, 8, alwaysAdmissible);
      if (next === null) break;
      const bScore = next.score.tracks.find((t) => t.track === 'B')?.score ?? 0;
      if (bScore > 0) trackBSelected += 1;
      total += 1;
    }
    expect(trackBSelected).toBe(3);
  });

  it('scenario C: a URL scoring on BOTH tracks is fetched once and counts toward both selections', () => {
    const frontier = createFrontier();
    // "international language centre" plausibly matches both Track A and Track B phrase lists.
    frontier.add(
      'https://example.edu/international-language-centre',
      'LINK',
      null,
      'International language centre for Erasmus students',
    );
    const next = frontier.pickNext(0, 8, alwaysAdmissible);
    expect(next).not.toBeNull();
    // Whatever it scores, it is a SINGLE frontier entry - fetched once.
    expect(frontier.size).toBe(0);
  });

  it('scenario D: a Track B URL with no Track A ancestry remains eligible', () => {
    const frontier = createFrontier();
    frontier.add(
      'https://example.edu/langues/centre-de-langues',
      'LINK',
      null,
      'Centre de langues',
    );
    const next = frontier.pickNext(0, 8, alwaysAdmissible);
    expect(next).not.toBeNull();
    const bScore = next?.score.tracks.find((t) => t.track === 'B')?.score ?? 0;
    expect(bScore).toBeGreaterThan(0);
  });

  it('scenario E: Track B candidates present early are not starved by a larger Track A volume', () => {
    const frontier = createFrontier();
    seedTrackBUrls(frontier, 8);
    seedManyTrackAUrls(frontier, 30);

    let trackBSelected = 0;
    let total = 0;
    const firstEightPicks: boolean[] = [];
    while (total < 10) {
      const next = frontier.pickNext(trackBSelected, 8, alwaysAdmissible);
      if (next === null) break;
      const bScore = next.score.tracks.find((t) => t.track === 'B')?.score ?? 0;
      firstEightPicks.push(bScore > 0);
      if (bScore > 0) trackBSelected += 1;
      total += 1;
    }
    // All 8 viable Track B URLs should be exhausted within the first ~8-10 picks,
    // rather than being pushed to the back of a much larger Track A queue.
    expect(trackBSelected).toBe(8);
  });
});

// ======================================================================
// Fetch policy v8 (ADR 0018): section-fair ordering among strict-priority ties
// ======================================================================

function drain(
  frontier: ReturnType<typeof createFrontier>,
  count: number,
  admissible: (host: string) => boolean = alwaysAdmissible,
): string[] {
  const picked: string[] = [];
  let trackBSelected = 0;
  while (picked.length < count) {
    const next = frontier.pickNext(trackBSelected, 8, admissible);
    if (next === null) break;
    if ((next.score.tracks.find((t) => t.track === 'B')?.score ?? 0) > 0) trackBSelected += 1;
    picked.push(next.url);
  }
  return picked;
}

const path = (url: string): string => new URL(url).pathname;

describe('frontierSectionOf (v8 section identity)', () => {
  it('is hostname plus the first path segment, with path depth', () => {
    expect(frontierSectionOf('https://www.example.edu/international/students')).toEqual({
      key: 'www.example.edu/international',
      depth: 2,
    });
    expect(frontierSectionOf('https://www.example.edu/vie-etudiante/associations')).toEqual({
      key: 'www.example.edu/vie-etudiante',
      depth: 2,
    });
  });

  it('gives a root URL, with or without a trailing slash, the host root section at depth 0', () => {
    expect(frontierSectionOf('https://www.example.edu/')).toEqual({
      key: 'www.example.edu/',
      depth: 0,
    });
    expect(frontierSectionOf('https://www.example.edu')).toEqual({
      key: 'www.example.edu/',
      depth: 0,
    });
  });

  it('skips ONE leading locale prefix from the closed list, with or without a region', () => {
    expect(frontierSectionOf('https://x.example.edu/fr/international/accueil')).toEqual({
      key: 'x.example.edu/international',
      depth: 2,
    });
    expect(frontierSectionOf('https://x.example.edu/en/students/exchange')).toEqual({
      key: 'x.example.edu/students',
      depth: 2,
    });
    expect(frontierSectionOf('https://x.example.edu/en-gb/students').key).toBe(
      'x.example.edu/students',
    );
    expect(frontierSectionOf('https://x.example.edu/pt_BR/estudantes').key).toBe(
      'x.example.edu/estudantes',
    );
    // A bare locale home page is that host's root section.
    expect(frontierSectionOf('https://x.example.edu/de/')).toEqual({
      key: 'x.example.edu/',
      depth: 0,
    });
    // Only the first segment, only once.
    expect(frontierSectionOf('https://x.example.edu/fr/en/x').key).toBe('x.example.edu/en');
  });

  it('does NOT treat every short segment as a locale: unlisted two-letter segments stay sections', () => {
    for (const segment of ['ri', 'bu', 'ue', 'rh', 'io', 'ac', 'zz']) {
      expect(frontierSectionOf(`https://x.example.edu/${segment}/page`).key).toBe(
        `x.example.edu/${segment}`,
      );
    }
    // Neither a three-letter segment nor a longer word that merely starts like a locale.
    expect(frontierSectionOf('https://x.example.edu/eng/page').key).toBe('x.example.edu/eng');
    expect(frontierSectionOf('https://x.example.edu/french/page').key).toBe('x.example.edu/french');
    expect(frontierSectionOf('https://x.example.edu/fr-studies-abroad/page').key).toBe(
      'x.example.edu/fr-studies-abroad',
    );
  });

  it('folds case, percent-encoding and Unicode normalisation consistently', () => {
    const keys = [
      'https://x.example.edu/Vie-Etudiante/plan',
      'https://x.example.edu/vie-etudiante/plan',
    ].map((u) => frontierSectionOf(u).key);
    expect(new Set(keys).size).toBe(1);
    const accented = [
      'https://x.example.edu/vie-%C3%A9tudiante/plan',
      'https://x.example.edu/vie-étudiante/plan',
      'https://x.example.edu/VIE-%C3%89TUDIANTE/plan',
      // decomposed e + combining acute
      'https://x.example.edu/vie-e%CC%81tudiante/plan',
    ].map((u) => frontierSectionOf(u).key);
    expect(new Set(accented)).toEqual(new Set(['x.example.edu/vie-étudiante']));
  });

  it('drops empty segments from repeated or trailing slashes and ignores query and fragment', () => {
    expect(frontierSectionOf('https://x.example.edu//international///students//')).toEqual({
      key: 'x.example.edu/international',
      depth: 2,
    });
    expect(frontierSectionOf('https://x.example.edu/international?lang=fr#top')).toEqual({
      key: 'x.example.edu/international',
      depth: 1,
    });
  });

  it('never merges two hosts, and treats http and https of one host as one section', () => {
    expect(frontierSectionOf('https://a.example.edu/international').key).not.toBe(
      frontierSectionOf('https://b.example.edu/international').key,
    );
    expect(frontierSectionOf('http://a.example.edu/international').key).toBe(
      frontierSectionOf('https://A.EXAMPLE.EDU/international').key,
    );
  });

  it('survives a malformed percent-escape and an unparsable string without throwing', () => {
    expect(frontierSectionOf('https://x.example.edu/%E0%A4%A/page').key).toBe(
      'x.example.edu/%e0%a4%a',
    );
    expect(() => frontierSectionOf('not a url')).not.toThrow();
  });

  it('is a pure function of its input', () => {
    const url = 'https://x.example.edu/fr/Vie-%C3%89tudiante//associations';
    expect(frontierSectionOf(url)).toEqual(frontierSectionOf(url));
  });
});

describe('Frontier v8 section fairness among ties', () => {
  it('round-robins tied zero-score candidates across sections instead of draining the alphabetically first one', () => {
    const frontier = createFrontier();
    for (let i = 1; i <= 20; i += 1)
      frontier.add(
        `https://x.example.edu/agenda/e-${String(i).padStart(2, '0')}`,
        'SITEMAP',
        null,
        null,
      );
    for (let i = 1; i <= 3; i += 1)
      frontier.add(`https://x.example.edu/services/s-${i}`, 'SITEMAP', null, null);
    for (let i = 1; i <= 3; i += 1)
      frontier.add(`https://x.example.edu/vie-etudiante/v-${i}`, 'SITEMAP', null, null);

    expect(drain(frontier, 9).map(path)).toEqual([
      '/agenda/e-01',
      '/services/s-1',
      '/vie-etudiante/v-1',
      '/agenda/e-02',
      '/services/s-2',
      '/vie-etudiante/v-2',
      '/agenda/e-03',
      '/services/s-3',
      '/vie-etudiante/v-3',
    ]);
    // Once the small sections run out, the remaining one simply continues.
    expect(drain(frontier, 3).map(path)).toEqual(['/agenda/e-04', '/agenda/e-05', '/agenda/e-06']);
  });

  it('within a section, prefers the shallower page, after fairness', () => {
    const frontier = createFrontier();
    frontier.add('https://x.example.edu/agenda/a/b/c', 'SITEMAP', null, null);
    frontier.add('https://x.example.edu/agenda/z', 'SITEMAP', null, null);
    frontier.add('https://x.example.edu/zzz/deep/deeper', 'SITEMAP', null, null);
    // Round 1: both sections unpicked -> depth decides across them (z is depth 2, zzz/... depth 3).
    expect(drain(frontier, 3).map(path)).toEqual([
      '/agenda/z',
      '/zzz/deep/deeper',
      '/agenda/a/b/c',
    ]);
  });

  it('keeps discovery-source precedence and then URL as the last tie-breakers', () => {
    const frontier = createFrontier();
    frontier.add('https://x.example.edu/a/from-anchor', 'LINK', null, null);
    frontier.add('https://x.example.edu/b/from-listing', 'SITEMAP', null, null);
    expect(drain(frontier, 1).map(path)).toEqual(['/b/from-listing']);
  });

  it('NEVER lets fairness lift a lower score above a higher one, however often its section was picked', () => {
    const frontier = createFrontier();
    for (let i = 1; i <= 6; i += 1) {
      frontier.add(`https://x.example.edu/international/erasmus-${i}`, 'LINK', null, 'Erasmus');
    }
    frontier.add('https://x.example.edu/agenda/page', 'SITEMAP', null, null);
    const picked = drain(frontier, 7).map(path);
    expect(picked.slice(0, 6).every((p) => p.startsWith('/international/'))).toBe(true);
    expect(picked[6]).toBe('/agenda/page');
  });

  it('keeps own evidence ahead of purely inherited evidence on a tied score, regardless of section counts', () => {
    const frontier = createFrontier();
    // A section root whose own score (4) comes from its anchor text alone...
    frontier.add('https://x.example.edu/s/p', 'LINK', null, 'Exchange students');
    // ...so its child scores 2, ALL of it inherited (own 0).
    const inherited = frontier.add('https://x.example.edu/s/p/q', 'LINK', null, null);
    expect(inherited.ok && inherited.entry.score.tracks.find((t) => t.track === 'A')).toMatchObject(
      {
        score: 2,
        ownScore: 0,
      },
    );
    // Three OWN-evidence entries tied on that same score of 2, all in ONE section.
    for (const p of ['/z/mobility-international', '/z/international/mobility', '/z/b']) {
      const own = frontier.add(
        `https://x.example.edu${p}`,
        'LINK',
        null,
        p === '/z/b' ? 'International mobility' : null,
      );
      expect(own.ok && own.entry.score.tracks.find((t) => t.track === 'A')).toMatchObject({
        score: 2,
        ownScore: 2,
      });
    }
    // /z/ is picked three times before the fresh /s/ section's inherited child:
    // own-over-inherited is a strict priority, and fairness only orders ties inside it.
    expect(drain(frontier, 5).map(path)).toEqual([
      '/s/p',
      '/z/b',
      '/z/mobility-international', // depth 2 before depth 3, inside the same section
      '/z/international/mobility',
      '/s/p/q',
    ]);
  });

  it('advances the section counter on SELECTION: a picked entry that then fails still yields its section turn', () => {
    const frontier = createFrontier();
    for (const s of ['broken', 'healthy']) {
      for (let i = 1; i <= 3; i += 1)
        frontier.add(`https://x.example.edu/${s}/p-${i}`, 'SITEMAP', null, null);
    }
    // The caller learns nothing back from the frontier about outcomes; the
    // frontier must alternate whatever happens to /broken/... pages.
    expect(drain(frontier, 4).map(path)).toEqual([
      '/broken/p-1',
      '/healthy/p-1',
      '/broken/p-2',
      '/healthy/p-2',
    ]);
  });

  it('gives a section that enters LATE its fair turn among ties, without replaying earlier rounds', () => {
    const frontier = createFrontier();
    for (const s of ['a', 'b']) {
      for (let i = 1; i <= 4; i += 1)
        frontier.add(`https://x.example.edu/${s}/p-${i}`, 'SITEMAP', null, null);
    }
    expect(drain(frontier, 4).map(path)).toEqual(['/a/p-1', '/b/p-1', '/a/p-2', '/b/p-2']);
    for (let i = 1; i <= 4; i += 1)
      frontier.add(`https://x.example.edu/c/p-${i}`, 'LINK', null, null);
    // c has 0 picks against 2 each: it wins the next two ties, then rejoins the rotation.
    expect(drain(frontier, 5).map(path)).toEqual([
      '/c/p-1',
      '/c/p-2',
      '/a/p-3',
      '/b/p-3',
      '/c/p-3',
    ]);
  });

  it('counts per strict-priority class: positive-class picks do not reorder the zero-score ties', () => {
    const withPositives = createFrontier();
    const without = createFrontier();
    for (const frontier of [withPositives, without]) {
      for (const s of ['a', 'b']) {
        for (let i = 1; i <= 2; i += 1)
          frontier.add(`https://x.example.edu/${s}/p-${i}`, 'SITEMAP', null, null);
      }
    }
    for (let i = 1; i <= 3; i += 1) {
      withPositives.add(`https://x.example.edu/a/erasmus-${i}`, 'LINK', null, 'Erasmus');
    }
    const zeroOrderWith = drain(withPositives, 7)
      .map(path)
      .filter((p) => !p.includes('erasmus'));
    const zeroOrderWithout = drain(without, 4).map(path);
    expect(zeroOrderWith).toEqual(zeroOrderWithout);
  });

  it('skips an inadmissible host without charging its section', () => {
    const frontier = createFrontier();
    frontier.add('https://down.example.edu/a/p-1', 'SITEMAP', null, null);
    frontier.add('https://up.example.edu/a/p-1', 'SITEMAP', null, null);
    frontier.add('https://up.example.edu/b/p-1', 'SITEMAP', null, null);
    const admissible = (host: string): boolean => host !== 'down.example.edu';
    expect(drain(frontier, 5, admissible)).toEqual([
      'https://up.example.edu/a/p-1',
      'https://up.example.edu/b/p-1',
    ]);
    expect(frontier.size).toBe(1);
  });

  it('keeps state per Frontier instance: one root never affects another', () => {
    const first = createFrontier();
    for (let i = 1; i <= 3; i += 1)
      first.add(`https://x.example.edu/a/p-${i}`, 'SITEMAP', null, null);
    drain(first, 3);
    const second = createFrontier();
    second.add('https://x.example.edu/a/q', 'SITEMAP', null, null);
    second.add('https://x.example.edu/b/q', 'SITEMAP', null, null);
    expect(drain(second, 1).map(path)).toEqual(['/a/q']);
  });

  it('is independent of insertion order for a fixed candidate set', () => {
    const urls: string[] = [];
    for (const s of ['agenda', 'campus', 'fr/vie-etudiante', 'en/international', 'services']) {
      for (let i = 1; i <= 4; i += 1) urls.push(`https://x.example.edu/${s}/p-${i}`);
    }
    const orders = [
      urls,
      [...urls].reverse(),
      [...urls.slice(7), ...urls.slice(0, 7)],
      urls.filter((_, i) => i % 2 === 0).concat(urls.filter((_, i) => i % 2 === 1)),
      [...urls].sort(),
    ];
    const sequences = orders.map((order) => {
      const frontier = createFrontier();
      for (const url of order) frontier.add(url, 'SITEMAP', null, null);
      return drain(frontier, urls.length);
    });
    for (const sequence of sequences) expect(sequence).toEqual(sequences[0]);
  });
});

describe('Frontier v8 Track B floor is unchanged', () => {
  it('the floor pool is still exactly the viable Track B entries, ordered by Track B score first', () => {
    const frontier = createFrontier();
    frontier.add(
      'https://x.example.edu/international/international-office',
      'LINK',
      null,
      'International Office',
    );
    frontier.add(
      'https://x.example.edu/langues/centre-de-langues',
      'LINK',
      null,
      'Centre de langues',
    );
    frontier.add('https://x.example.edu/crl/atelier-1', 'LINK', null, null);
    const first = frontier.pickNext(0, 8, alwaysAdmissible);
    // Floor active: the strongest Track B entry wins even against a stronger Track A one.
    expect(path(first!.url)).toBe('/langues/centre-de-langues');
    const second = frontier.pickNext(1, 8, alwaysAdmissible);
    expect(path(second!.url)).toBe('/crl/atelier-1');
    // Floor met: back to the general order.
    const third = frontier.pickNext(8, 8, alwaysAdmissible);
    expect(path(third!.url)).toBe('/international/international-office');
  });

  it('a zero-Track-B entry never enters the floor pool, even when its section has never been picked', () => {
    const frontier = createFrontier();
    frontier.add('https://x.example.edu/crl/atelier-1', 'LINK', null, null);
    frontier.add('https://x.example.edu/crl/atelier-2', 'LINK', null, null);
    frontier.add('https://x.example.edu/agenda/page', 'SITEMAP', null, null);
    const picks = [0, 1].map((n) => frontier.pickNext(n, 8, alwaysAdmissible)!.url).map(path);
    expect(picks).toEqual(['/crl/atelier-1', '/crl/atelier-2']);
  });

  it('applies section fairness only among Track B entries tied on Track B score', () => {
    const frontier = createFrontier();
    // Neutral section names: `crl` and `lansad` are themselves Track B terms.
    for (const s of ['p', 'q']) {
      for (let i = 1; i <= 2; i += 1) {
        frontier.add(
          `https://x.example.edu/${s}/centre-de-langues-${i}`,
          'LINK',
          null,
          'Centre de langues',
        );
      }
    }
    const picks = [0, 1, 2, 3].map((n) => frontier.pickNext(n, 8, alwaysAdmissible)!.url).map(path);
    expect(picks).toEqual([
      '/p/centre-de-langues-1',
      '/q/centre-de-langues-1',
      '/p/centre-de-langues-2',
      '/q/centre-de-langues-2',
    ]);
  });
});
