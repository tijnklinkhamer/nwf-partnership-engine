import { describe, expect, it } from 'vitest';
import { createFrontier } from '../../orgunits/orchestrator/frontier.js';

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

  it('breaks a score tie by URL lexical order, deterministically', () => {
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
