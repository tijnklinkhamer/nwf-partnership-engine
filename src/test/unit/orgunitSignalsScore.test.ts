/**
 * THE TWO SCORING ENTRY POINTS, end to end: Track A / Track B coverage, the
 * frontier/candidate separation matrix, section-root behaviour,
 * explainability, and the invariants the design brief calls load-bearing.
 *
 * Weight arithmetic in these tests is worked out by hand against
 * `weights.ts` and the rule catalogues in `packs/`, and several inputs are
 * deliberately chosen so that only ONE rule can fire (e.g. "incoming
 * students" contains neither "international" nor "mobility" as a token) -
 * that keeps exact-score assertions honest rather than approximate. Where a
 * specific phrase's own tokens overlap a generic single-word rule (most
 * Track A EN phrases contain the token "international"), both rules
 * legitimately fire and the test says so explicitly rather than asserting a
 * misleadingly round number.
 */
import { describe, expect, it } from 'vitest';
import {
  scoreFetchedPageCandidate,
  scoreFrontierUrl,
  ORGUNIT_SIGNAL_RULE_VERSION,
} from '../../orgunits/signals/score.js';
import { SIGNAL_WEIGHT } from '../../orgunits/signals/weights.js';

function ids(signals: readonly { id: string }[]): string[] {
  return signals.map((s) => s.id).sort();
}

describe('ORGUNIT_SIGNAL_RULE_VERSION', () => {
  it('is a stable, non-timestamp, non-SHA identifier', () => {
    expect(ORGUNIT_SIGNAL_RULE_VERSION).toBe('orgunit-signal-rules-v1');
  });

  it('is stamped onto every score result, top-level and per-track', () => {
    const candidate = scoreFetchedPageCandidate({ url: 'https://example.edu/x/' });
    expect(candidate.ruleVersion).toBe(ORGUNIT_SIGNAL_RULE_VERSION);
    for (const track of candidate.tracks)
      expect(track.ruleVersion).toBe(ORGUNIT_SIGNAL_RULE_VERSION);

    const frontier = scoreFrontierUrl({ url: 'https://example.edu/x/' });
    expect(frontier.ruleVersion).toBe(ORGUNIT_SIGNAL_RULE_VERSION);
    for (const track of frontier.tracks)
      expect(track.ruleVersion).toBe(ORGUNIT_SIGNAL_RULE_VERSION);
  });
});

describe('Track A: international / mobility / Erasmus', () => {
  function trackA(title: string) {
    const result = scoreFetchedPageCandidate({
      url: 'https://example.edu/about/contact-42/',
      title,
    });
    return result.tracks.find((t) => t.track === 'A')!;
  }

  it('a strong multi-word phrase scores materially higher than a bare generic term', () => {
    const strong = trackA('International Office');
    const bare = trackA('International');
    // "International Office" also fires the bare-generic rule on its own
    // "international" token - both are legitimate own-page evidence, so the
    // exact total is PHRASE_STRONG + SINGLE_GENERIC, not PHRASE_STRONG alone.
    expect(ids(strong.matchedSignals)).toEqual(['A_INTERNATIONAL_GENERIC', 'A_INTL_OFFICE']);
    expect(strong.score).toBe(SIGNAL_WEIGHT.PHRASE_STRONG + SIGNAL_WEIGHT.SINGLE_GENERIC);
    expect(ids(bare.matchedSignals)).toEqual(['A_INTERNATIONAL_GENERIC']);
    expect(bare.score).toBe(SIGNAL_WEIGHT.SINGLE_GENERIC);
    expect(strong.score).toBeGreaterThan(bare.score);
  });

  it('a medium multi-word phrase that shares no token with a generic rule scores exactly its own weight', () => {
    expect(trackA('Incoming Students').score).toBe(SIGNAL_WEIGHT.PHRASE_MEDIUM);
    expect(trackA('Exchange Students').score).toBe(SIGNAL_WEIGHT.PHRASE_MEDIUM);
    expect(ids(trackA('Incoming Students').matchedSignals)).toEqual(['A_INCOMING_STUDENTS']);
  });

  it('a light phrase and bare Erasmus score their own light weight', () => {
    expect(trackA('Study Abroad').score).toBe(SIGNAL_WEIGHT.PHRASE_LIGHT);
    expect(trackA('Erasmus').score).toBe(SIGNAL_WEIGHT.PHRASE_LIGHT);
  });

  it('bare "international" and bare "mobility" score the smallest positive weight', () => {
    expect(trackA('International').score).toBe(SIGNAL_WEIGHT.SINGLE_GENERIC);
    expect(trackA('Mobility').score).toBe(SIGNAL_WEIGHT.SINGLE_GENERIC);
  });

  it('token boundary: "internationalisation" is a different token and does not match', () => {
    expect(trackA('Internationalisation Strategy').score).toBe(0);
  });

  it('accent-insensitive and hyphen-aware French compound phrases', () => {
    const accented = scoreFetchedPageCandidate({
      url: 'https://example.edu/x/',
      title: 'Étudiants Internationaux',
    });
    const trackAAccented = accented.tracks.find((t) => t.track === 'A')!;
    expect(ids(trackAAccented.matchedSignals)).toEqual(['A_FR_ETUDIANTS_INTERNATIONAUX']);
    expect(trackAAccented.score).toBe(SIGNAL_WEIGHT.PHRASE_MEDIUM);

    const hyphenated = scoreFrontierUrl({ url: 'https://example.edu/relations-internationales/' });
    const spaced = scoreFetchedPageCandidate({
      url: 'https://example.edu/x/',
      title: 'relations internationales',
    });
    expect(hyphenated.tracks.find((t) => t.track === 'A')!.matchedSignals[0]?.id).toBe(
      'A_FR_RELATIONS_INTERNATIONALES',
    );
    expect(spaced.tracks.find((t) => t.track === 'A')!.matchedSignals[0]?.id).toBe(
      'A_FR_RELATIONS_INTERNATIONALES',
    );
  });

  it('a French compound path stacks two distinct Track A phrases', () => {
    const result = scoreFrontierUrl({
      url: 'https://example.edu/relations-internationales/etudiants-entrants/',
    });
    const trackAResult = result.tracks.find((t) => t.track === 'A')!;
    expect(ids(trackAResult.matchedSignals)).toEqual([
      'A_FR_ETUDIANTS_ENTRANTS',
      'A_FR_RELATIONS_INTERNATIONALES',
    ]);
    expect(trackAResult.score).toBe(SIGNAL_WEIGHT.PHRASE_STRONG + SIGNAL_WEIGHT.PHRASE_MEDIUM);
  });

  it('an English page on a French-style host/path still scores via the English pack', () => {
    const result = scoreFrontierUrl({ url: 'https://univ-exemple.fr/en/international-office/' });
    const trackAResult = result.tracks.find((t) => t.track === 'A')!;
    expect(trackAResult.matchedSignals.some((s) => s.id === 'A_INTL_OFFICE')).toBe(true);
  });
});

describe('Track B: language centres / language-teaching units', () => {
  function trackB(title: string) {
    const result = scoreFetchedPageCandidate({ url: 'https://example.edu/x/', title });
    return result.tracks.find((t) => t.track === 'B')!;
  }

  it('English and French compound phrases score their catalogued weight, with no generic stacking', () => {
    expect(trackB('Language Centre').score).toBe(SIGNAL_WEIGHT.PHRASE_STRONG);
    expect(trackB('Language Center').score).toBe(SIGNAL_WEIGHT.PHRASE_STRONG);
    expect(trackB('Language Department').score).toBe(SIGNAL_WEIGHT.PHRASE_MEDIUM);
    expect(trackB('Département Langues').score).toBe(SIGNAL_WEIGHT.PHRASE_STRONG);
    expect(trackB('FLE').score).toBe(SIGNAL_WEIGHT.PHRASE_MEDIUM);
    expect(trackB('LANSAD').score).toBe(SIGNAL_WEIGHT.PHRASE_MEDIUM);
    expect(trackB('CRL').score).toBe(SIGNAL_WEIGHT.PHRASE_LIGHT);
  });

  it('Track B is discoverable with ZERO Track A parent context', () => {
    const result = scoreFrontierUrl({ url: 'https://example.edu/departement-langues/' });
    const trackAResult = result.tracks.find((t) => t.track === 'A')!;
    const trackBResult = result.tracks.find((t) => t.track === 'B')!;
    expect(trackAResult.score).toBe(0);
    expect(trackAResult.matchedSignals).toEqual([]);
    expect(trackBResult.matchedSignals.some((s) => s.id === 'B_FR_DEPARTEMENT_LANGUES')).toBe(true);
    expect(trackBResult.score).toBeGreaterThan(0);
  });
});

describe('normalisation-sensitive matching end to end', () => {
  it('LANGUES does not match inside a page about Languedoc', () => {
    const result = scoreFetchedPageCandidate({
      url: 'https://example.edu/regions/languedoc/',
      title: 'Languedoc, a region of France',
    });
    expect(result.tracks.find((t) => t.track === 'B')!.score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The frontier / candidate separation matrix (design brief s40)
// ---------------------------------------------------------------------------

describe('Matrix A: strong international parent, direct child - frontier inherits, candidate cannot', () => {
  const ancestorUrl = 'https://example.edu/international-office/';
  const childUrl = 'https://example.edu/international-office/team/';

  it('the ancestor qualifies as a section root', () => {
    const ancestor = scoreFrontierUrl({ url: ancestorUrl });
    const trackA = ancestor.tracks.find((t) => t.track === 'A')!;
    expect(trackA.isSectionRoot).toBe(true);
    expect(trackA.ownScore).toBeGreaterThanOrEqual(4);
  });

  it('the frontier child receives a positive, bounded inherited contribution', () => {
    const ancestor = scoreFrontierUrl({ url: ancestorUrl });
    const ancestorTrackA = ancestor.tracks.find((t) => t.track === 'A')!;
    const child = scoreFrontierUrl({
      url: childUrl,
      sectionAncestors: [{ url: ancestorUrl, ownScore: ancestorTrackA.ownScore, track: 'A' }],
    });
    const childTrackA = child.tracks.find((t) => t.track === 'A')!;
    expect(childTrackA.inheritedContribution).toBeGreaterThan(0);
    expect(childTrackA.score).toBe(childTrackA.ownScore + childTrackA.inheritedContribution);
  });

  it('the candidate result for the SAME URL carries no inheritance field at all', () => {
    const candidate = scoreFetchedPageCandidate({ url: childUrl });
    const candidateTrackA = candidate.tracks.find((t) => t.track === 'A')!;
    expect('inheritedContribution' in candidateTrackA).toBe(false);
    expect('isSectionRoot' in candidateTrackA).toBe(false);
    expect('ownScore' in candidateTrackA).toBe(false);
  });
});

describe('Matrix B: a third-level descendant receives no inherited contribution', () => {
  it('depth 3 below a qualifying root inherits nothing', () => {
    const ancestorUrl = 'https://example.edu/international-office/';
    const ancestor = scoreFrontierUrl({ url: ancestorUrl });
    const ancestorTrackA = ancestor.tracks.find((t) => t.track === 'A')!;
    const deepChild = scoreFrontierUrl({
      url: 'https://example.edu/international-office/team/staff/bios/',
      sectionAncestors: [{ url: ancestorUrl, ownScore: ancestorTrackA.ownScore, track: 'A' }],
    });
    expect(deepChild.tracks.find((t) => t.track === 'A')!.inheritedContribution).toBe(0);
  });
});

describe('Matrix C: a negative-veto descendant loses its inherited contribution', () => {
  const ancestorUrl = 'https://example.edu/international-office/';

  it('a sibling without the veto inherits; the vetoed sibling does not', () => {
    const ancestor = scoreFrontierUrl({ url: ancestorUrl });
    const ancestorTrackA = ancestor.tracks.find((t) => t.track === 'A')!;
    const ancestors = [
      { url: ancestorUrl, ownScore: ancestorTrackA.ownScore, track: 'A' as const },
    ];

    const plainSibling = scoreFrontierUrl({
      url: 'https://example.edu/international-office/students/',
      sectionAncestors: ancestors,
    });
    const vetoedSibling = scoreFrontierUrl({
      url: 'https://example.edu/international-office/recherche/',
      sectionAncestors: ancestors,
    });

    const plainTrackA = plainSibling.tracks.find((t) => t.track === 'A')!;
    const vetoedTrackA = vetoedSibling.tracks.find((t) => t.track === 'A')!;

    expect(plainTrackA.inheritedContribution).toBeGreaterThan(0);
    expect(vetoedTrackA.vetoes.some((v) => v.id === 'NEG_ACADEMIC_RESEARCH_SCOPE')).toBe(true);
    expect(vetoedTrackA.inheritedContribution).toBe(0);
  });
});

describe('Matrix D vs E: a genuine unit title outranks a degree-programme title', () => {
  it('"International Office" scores strongly on its own evidence', () => {
    const result = scoreFetchedPageCandidate({
      url: 'https://example.edu/staff/directory/42/',
      title: 'International Office',
    });
    const trackA = result.tracks.find((t) => t.track === 'A')!;
    expect(trackA.score).toBe(SIGNAL_WEIGHT.PHRASE_STRONG + SIGNAL_WEIGHT.SINGLE_GENERIC);
  });

  it('"MSc International Marketing" scores materially lower under otherwise comparable evidence', () => {
    const unit = scoreFetchedPageCandidate({
      url: 'https://example.edu/staff/directory/42/',
      title: 'International Office',
    });
    const programme = scoreFetchedPageCandidate({
      url: 'https://example.edu/programmes/12345/',
      title: 'MSc International Marketing',
    });
    const unitScore = unit.tracks.find((t) => t.track === 'A')!.score;
    const programmeResult = programme.tracks.find((t) => t.track === 'A')!;

    expect(programmeResult.negativeSignals.some((s) => s.id === 'NEG_PROGRAMME_SHAPE')).toBe(true);
    expect(programmeResult.score).toBeLessThan(unitScore);
    // Materially lower, not a marginal difference: the whole point of
    // PROGRAMME_SHAPE's weight (ADR 0007 s3, weights.ts) is to move it well
    // below a genuine unit title, not merely edge it down.
    expect(unitScore - programmeResult.score).toBeGreaterThanOrEqual(SIGNAL_WEIGHT.PHRASE_STRONG);
  });
});

describe('Matrix F: a page published UNDER a unit is not automatically the unit', () => {
  it('candidate scoring cannot be affected by parent/ancestor context - proved at the type level (see @ts-expect-error below, checked by `npm run typecheck`)', () => {
    // CandidatePageInput has no field an inherited/parent context value could
    // occupy; this is the compile-time half of the frontier/candidate
    // separation (score.ts, types.ts). Left uncalled - its only job is to
    // fail `tsc --noEmit` if the type ever grows the field.
    const _neverCalled = (): void =>
      void scoreFetchedPageCandidate({
        url: 'https://example.edu/x/',
        // @ts-expect-error - sectionAncestors does not exist on CandidatePageInput
        sectionAncestors: [{ url: 'https://example.edu/international/', ownScore: 10, track: 'A' }],
      });
    expect(typeof _neverCalled).toBe('function');
  });

  it('a page whose own URL/title describe no unit scores low as a candidate, even beneath a strong section', () => {
    const genericAdminPage = scoreFetchedPageCandidate({
      url: 'https://example.edu/pages/999/',
      title: 'Assessment Regulations',
    });
    const genuineUnit = scoreFetchedPageCandidate({
      url: 'https://example.edu/staff/directory/42/',
      title: 'International Office',
    });
    expect(genericAdminPage.tracks.find((t) => t.track === 'A')!.score).toBe(0);
    expect(genuineUnit.tracks.find((t) => t.track === 'A')!.score).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Section-root behaviour, end to end
// ---------------------------------------------------------------------------

describe('section-root behaviour', () => {
  it('a local veto disqualifies an otherwise score-and-depth-eligible URL from being a section root', () => {
    const result = scoreFrontierUrl({
      url: 'https://example.edu/international-office/international-student-services/recherche/',
    });
    const trackA = result.tracks.find((t) => t.track === 'A')!;
    expect(trackA.vetoes.length).toBeGreaterThan(0);
    expect(trackA.sectionRootEligible).toBe(true); // own score/depth alone would qualify
    expect(trackA.isSectionRoot).toBe(false); // the veto disqualifies it anyway
  });

  it('depth beyond the section-root limit disqualifies even a high-scoring URL', () => {
    const result = scoreFrontierUrl({
      url: 'https://example.edu/a/b/c/international-office/',
    });
    const trackA = result.tracks.find((t) => t.track === 'A')!;
    expect(trackA.ownScore).toBeGreaterThanOrEqual(4);
    expect(trackA.sectionRootEligible).toBe(false);
    expect(trackA.isSectionRoot).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Explainability (design brief s42)
// ---------------------------------------------------------------------------

describe('explainability', () => {
  it('every matched signal carries id, pack, track, kind, field, weight, inherited, inheritanceDepth', () => {
    const result = scoreFetchedPageCandidate({
      url: 'https://example.edu/x/',
      title: 'International Office',
    });
    const trackA = result.tracks.find((t) => t.track === 'A')!;
    for (const signal of trackA.matchedSignals) {
      expect(typeof signal.id).toBe('string');
      expect(signal.pack).toBe('en');
      expect(signal.track).toBe('A');
      expect(signal.kind).toBe('positive');
      expect(signal.field).toBe('title');
      expect(typeof signal.weight).toBe('number');
      expect(signal.inherited).toBe(false);
      expect(signal.inheritanceDepth).toBeNull();
    }
  });

  it('an inherited contribution is reported as its own explainable signal', () => {
    const ancestorUrl = 'https://example.edu/international-office/';
    const ancestor = scoreFrontierUrl({ url: ancestorUrl });
    const ancestorTrackA = ancestor.tracks.find((t) => t.track === 'A')!;
    const child = scoreFrontierUrl({
      url: 'https://example.edu/international-office/team/',
      sectionAncestors: [{ url: ancestorUrl, ownScore: ancestorTrackA.ownScore, track: 'A' }],
    });
    const childTrackA = child.tracks.find((t) => t.track === 'A')!;
    const inheritedSignal = childTrackA.matchedSignals.find((s) => s.inherited);
    expect(inheritedSignal).toBeDefined();
    expect(inheritedSignal?.id).toBe('INHERITED_SECTION_CONTEXT');
    expect(inheritedSignal?.pack).toBe('universal');
    expect(inheritedSignal?.field).toBe('sectionContext');
    expect(inheritedSignal?.inheritanceDepth).toBe(1);
    expect(inheritedSignal?.weight).toBe(childTrackA.inheritedContribution);
  });

  it('a veto signal carries its own identity distinctly from an ordinary negative', () => {
    const result = scoreFrontierUrl({
      url: 'https://example.edu/recherche/relations-internationales/',
    });
    const trackA = result.tracks.find((t) => t.track === 'A')!;
    const veto = trackA.vetoes.find((v) => v.id === 'NEG_ACADEMIC_RESEARCH_SCOPE');
    expect(veto).toBeDefined();
    expect(veto?.kind).toBe('veto');
    expect(veto?.pack).toBe('universal');
    expect(veto?.field).toBe('urlPath');
    expect(veto?.weight).toBe(SIGNAL_WEIGHT.SCOPE_VETO);
  });

  it('a score with no signals returns explicit empty arrays, never null or undefined', () => {
    const result = scoreFetchedPageCandidate({ url: 'https://example.edu/random-page-xyz/' });
    for (const track of result.tracks) {
      expect(track.matchedSignals).toEqual([]);
      expect(track.negativeSignals).toEqual([]);
      expect(track.vetoes).toEqual([]);
      expect(track.score).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Invariants (design brief s43)
// ---------------------------------------------------------------------------

describe('invariants', () => {
  it('frontier ownScore is unaffected by sectionAncestors input; only inheritedContribution/score change', () => {
    const url = 'https://example.edu/international-office/team/';
    const withoutAncestor = scoreFrontierUrl({ url });
    const withAncestor = scoreFrontierUrl({
      url,
      sectionAncestors: [
        { url: 'https://example.edu/international-office/', ownScore: 20, track: 'A' },
      ],
    });
    const a = withoutAncestor.tracks.find((t) => t.track === 'A')!;
    const b = withAncestor.tracks.find((t) => t.track === 'A')!;
    expect(b.ownScore).toBe(a.ownScore);
    expect(b.inheritedContribution).toBeGreaterThan(a.inheritedContribution);
    expect(b.score).toBeGreaterThan(a.score);
  });

  it('inherited contribution never increases with depth', () => {
    const ancestorUrl = 'https://example.edu/international-office/';
    const ancestor = scoreFrontierUrl({ url: ancestorUrl });
    const ancestorTrackA = ancestor.tracks.find((t) => t.track === 'A')!;
    const ancestors = [
      { url: ancestorUrl, ownScore: ancestorTrackA.ownScore, track: 'A' as const },
    ];

    const depth1 = scoreFrontierUrl({
      url: 'https://example.edu/international-office/students/',
      sectionAncestors: ancestors,
    }).tracks.find((t) => t.track === 'A')!.inheritedContribution;
    const depth2 = scoreFrontierUrl({
      url: 'https://example.edu/international-office/students/incoming/',
      sectionAncestors: ancestors,
    }).tracks.find((t) => t.track === 'A')!.inheritedContribution;

    expect(depth2).toBeLessThan(depth1);
  });

  it('signal ordering is deterministic across repeated calls with identical input', () => {
    const input = { url: 'https://example.edu/relations-internationales/etudiants-entrants/' };
    const first = scoreFrontierUrl(input);
    const second = scoreFrontierUrl(input);
    expect(second).toEqual(first);
  });

  it('adding an unrelated heading does not remove an existing direct positive match', () => {
    const withoutExtra = scoreFetchedPageCandidate({
      url: 'https://example.edu/x/',
      headings: [{ level: 1, text: 'International Office' }],
    });
    const withExtra = scoreFetchedPageCandidate({
      url: 'https://example.edu/x/',
      headings: [
        { level: 1, text: 'International Office' },
        { level: 2, text: 'Parking Information' },
      ],
    });
    const a = withoutExtra.tracks.find((t) => t.track === 'A')!;
    const b = withExtra.tracks.find((t) => t.track === 'A')!;
    expect(b.matchedSignals.some((s) => s.id === 'A_INTL_OFFICE')).toBe(true);
    expect(a.matchedSignals.some((s) => s.id === 'A_INTL_OFFICE')).toBe(true);
    expect(b.score).toBe(a.score);
  });

  it('a negative veto cannot increase a score', () => {
    const withoutVeto = scoreFetchedPageCandidate({
      url: 'https://example.edu/international-office/',
    });
    const withVeto = scoreFetchedPageCandidate({
      url: 'https://example.edu/international-office/recherche/',
    });
    const a = withoutVeto.tracks.find((t) => t.track === 'A')!;
    const b = withVeto.tracks.find((t) => t.track === 'A')!;
    expect(b.score).toBeLessThanOrEqual(a.score);
  });
});
