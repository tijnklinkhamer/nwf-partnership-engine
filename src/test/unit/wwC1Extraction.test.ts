/**
 * WW E-X - the pure C1 extraction rules (`nwf-pe-c1-extraction-rules-v3`),
 * per rule and per language: positive, negative and ambiguous vectors; the
 * multilingual stated-date rules; the PII guard on quotes (JP / MX / NL / DE
 * contact formats); the class separation (OBSERVED claims vs proposals);
 * determinism; and the rule table itself. The WW E-XFX regression vectors
 * (statements never OBSERVED, negation / cancellation / discontinuation /
 * deadline guards in eight languages, contact-shaped and social-account
 * quotes, the full-sentence check before the quote cap) are in their own
 * describe blocks below, followed by the WW H-EX ones (rules v3: a dated
 * item is OBSERVED only on a listing-shaped unit, plain negations and moved
 * dates guard, a cancellation anywhere on a page guards its dated items,
 * more contact shapes withhold a quote).
 */
import { describe, expect, it } from 'vitest';

import { statedDatesC1 } from '../../orgunits/c1Extraction/dates.js';
import {
  extractC1,
  type C1Extraction,
  type C1PageInput,
} from '../../orgunits/c1Extraction/extract.js';
import { C1_LANGUAGES } from '../../orgunits/c1Extraction/lexicon.js';
import {
  C1_CONCEPTS,
  C1_EXTRACTION_RULES,
  C1_EXTRACTION_RULES_VERSION,
} from '../../orgunits/c1Extraction/rules.js';
import { C1_VALUE_SCHEMAS, type C1EmittedKey } from '../../orgunits/c1Extraction/vocabulary.js';
import { extractPage } from '../../orgunits/web/extract.js';

const CANDIDATE = 'rp-candidate:00000000-0000-4000-8000-00000000c001';
const DAY = '2026-10-27';
let n = 0;

function page(fields: Partial<C1PageInput> & { mainText: string }): C1PageInput {
  n += 1;
  return {
    pageId: `page-${String(n).padStart(4, '0')}`,
    rootKey: 'root-1',
    isRootUrl: false,
    publisher: 'SELF',
    capturedDay: DAY,
    title: null,
    headings: [],
    ...fields,
  };
}

const run = (...pages: C1PageInput[]): C1Extraction =>
  extractC1(pages, { candidateRef: CANDIDATE });
/** The INERT option: social-account proposals released under the ordinary shape checks. */
const runSocial = (...pages: C1PageInput[]): C1Extraction =>
  extractC1(pages, { candidateRef: CANDIDATE, socialAccountQuotes: 'SHAPE_CHECKED' });
const claimKeys = (r: C1Extraction) =>
  r.claims.map((c) => `${c.channelKey.split('|')[0]}:${c.key}`);
const proposalKeys = (r: C1Extraction) => r.proposals.map((p) => p.key);
const claim = (r: C1Extraction, key: string, kind: string) =>
  r.claims.find((c) => c.key === key && c.channelKey.startsWith(`${kind}|`));

describe('WW E-X: multilingual stated dates (nwf-pe-c1-stated-date-rules-v1)', () => {
  it.each([
    ['en', 'Welcome Week: 1 September 2026', '2026-09-01'],
    ['en', 'Starts September 1st, 2026', '2026-09-01'],
    ['fr', 'Semaine d’intégration le 1er septembre 2026', '2026-09-01'],
    ['fr', 'le 3 décembre 2026', '2026-12-03'],
    ['es', 'el 15 de noviembre de 2026', '2026-11-15'],
    ['nl', 'op 2 september 2026', '2026-09-02'],
    ['de', 'am 1. Oktober 2026', '2026-10-01'],
    ['de', 'am 3. März 2026', '2026-03-03'],
    ['it', 'il 1° settembre 2026', '2026-09-01'],
    ['it', 'il 4 febbraio 2027', '2027-02-04'],
    ['pt', '1º de setembro de 2026', '2026-09-01'],
    ['pt', '20 de março de 2027', '2027-03-20'],
    ['ja', '２０２６年４月１０日', '2026-04-10'],
    ['iso', '2026-09-01', '2026-09-01'],
  ])('%s: %s -> %s', (_lang, text, iso) => {
    expect(statedDatesC1(text)).toEqual([iso]);
  });

  it.each([
    ['a bare year', 'Welcome Week 2025'],
    ['a month and year', 'September 2026'],
    ['a numeric D/M/Y', '01/09/2026'],
    ['an impossible date', '31 February 2026'],
    ['a day and month without a year (never guessed)', '3 September'],
    ['a year outside 2000-2099', '1 September 1999'],
  ])('never reads %s', (_label, text) => {
    expect(statedDatesC1(text)).toEqual([]);
  });
});

describe('WW E-X: C1X.ORIENTATION_EVENT_DATED / _CYCLES (OBSERVED, ORIENTATION_EVENT)', () => {
  it.each([
    ['en', 'Welcome Week: 31 August 2026'],
    ['fr', 'Semaine d’intégration — 1er septembre 2026'],
    ['es', 'Semana de bienvenida: 7 de septiembre de 2026'],
    ['nl', 'Introductieweek 17 augustus 2026'],
    ['ja', '2026年4月10日 新入生歓迎会'],
    ['de', 'Erstiwoche: 5. Oktober 2026'],
    ['it', 'Settimana di accoglienza: 14 settembre 2026'],
    ['pt', 'Semana de recepção — 3 de março de 2026'],
  ])(
    '%s: a LISTED dated instance establishes the event channel with OBSERVED existence + instances',
    (lang, line) => {
      const r = run(page({ mainText: line }));
      expect(r.channels.map((c) => [c.kind, c.establishedBy])).toEqual([
        ['ORIENTATION_EVENT', 'OBSERVED_CLAIM'],
      ]);
      expect(claim(r, 'channel.existence', 'ORIENTATION_EVENT')?.ruleIds).toEqual([
        `C1X.ORIENTATION_EVENT_DATED.${lang}`,
      ]);
      const instances = claim(r, 'channel.event_instances', 'ORIENTATION_EVENT')!;
      expect(instances.value).toMatchObject({ upcomingAnnounced: false, discontinued: false });
      expect(instances.value['lastPastInstance']).toMatch(/^2026-/);
      // One year only: no recurrence is shown.
      expect(claim(r, 'channel.cycle_history', 'ORIENTATION_EVENT')).toBeUndefined();
    },
  );

  it.each([
    ['en', 'Welcome Week takes place on 31 August 2026.'],
    ['fr', 'Notre semaine d’intégration a eu lieu le 1er septembre 2026.'],
    ['es', 'La semana de bienvenida fue el 7 de septiembre de 2026.'],
    ['nl', 'De introductieweek begon op 17 augustus 2026.'],
    ['ja', '2026年4月10日 新入生歓迎会を開催しました。'],
    ['de', 'Die Erstiwoche begann am 5. Oktober 2026.'],
    ['it', 'La settimana di accoglienza si è svolta il 14 settembre 2026.'],
    ['pt', 'A semana de recepção foi em 3 de março de 2026.'],
  ])(
    '%s (rules v3): a dated event DESCRIBED in a sentence is a proposal, never OBSERVED',
    (lang, line) => {
      const r = run(page({ mainText: line }));
      expect(r.claims).toEqual([]);
      expect(r.channels.map((c) => [c.kind, c.establishedBy])).toEqual([
        ['ORIENTATION_EVENT', 'PROPOSAL_ONLY'],
      ]);
      const stated = r.proposals.filter((p) => p.ruleId === `C1P.ORIENTATION_EVENT_STATED.${lang}`);
      expect(stated.map((p) => [p.key, p.mode])).toEqual([
        ['channel.event_instances', 'SELF_ASSERTED'],
        ['channel.existence', 'SELF_ASSERTED'],
      ]);
      const instances = stated.find((p) => p.key === 'channel.event_instances')!;
      expect(instances.value).toMatchObject({ upcomingAnnounced: false, discontinued: false });
      expect(instances.value['lastPastInstance']).toMatch(/^2026-/);
      expect(instances.quote).toBe(line);
    },
  );

  it('negative: the event named without a full date establishes nothing', () => {
    const r = run(
      page({ title: 'Welcome Week 2026', mainText: 'Welcome Week is coming in September!' }),
    );
    expect(r.channels).toEqual([]);
    expect(r.claims).toEqual([]);
    expect(r.pageClasses[0]!.classes).toContain('EVENTS');
  });

  it('ambiguous: an event line and a dated line that are different lines never combine', () => {
    const r = run(page({ mainText: 'Welcome Week\nOpening ceremony on 1 September 2026' }));
    expect(r.channels).toEqual([]);
  });

  it('cycles: instances in two calendar years show recurrence (past dates only)', () => {
    const r = run(
      page({
        mainText:
          'Welcome Week 2024: 2 September 2024\nWelcome Week 2025: 1 September 2025\nWelcome Week 2027: 30 August 2027.',
      }),
    );
    expect(claim(r, 'channel.cycle_history', 'ORIENTATION_EVENT')!.value).toEqual({
      cycleDates: ['2024-09-02', '2025-09-01'],
      completeView: false,
      statedOneOff: false,
    });
    expect(claim(r, 'channel.event_instances', 'ORIENTATION_EVENT')!.value).toEqual({
      upcomingAnnounced: true,
      lastPastInstance: '2025-09-01',
      discontinued: false,
    });
    expect(claim(r, 'channel.cycle_history', 'ORIENTATION_EVENT')!.ruleIds).toEqual([
      'C1X.ORIENTATION_EVENT_CYCLES.en',
    ]);
  });

  it('cycles: a past instance and a LATER-year upcoming one also show recurrence', () => {
    const r = run(
      page({ mainText: 'Welcome Week: 1 September 2025.\nNext Welcome Week: 31 August 2027.' }),
    );
    expect(claim(r, 'channel.cycle_history', 'ORIENTATION_EVENT')!.value['cycleDates']).toEqual([
      '2025-09-01',
    ]);
  });

  it('cycles: a multi-day instance across a month boundary is ONE cycle (first date kept)', () => {
    const r = run(
      page({
        mainText:
          'Welcome Week: from 30 August 2025 to 3 September 2025\nWelcome Week 2026: 31 August 2026.',
      }),
    );
    expect(claim(r, 'channel.cycle_history', 'ORIENTATION_EVENT')!.value['cycleDates']).toEqual([
      '2025-08-30',
      '2026-08-31',
    ]);
    // The stated dates the claim rests on are still all disclosed in its basis.
    expect(claim(r, 'channel.cycle_history', 'ORIENTATION_EVENT')!.statedDates).toEqual([
      '2025-08-30',
      '2025-09-03',
      '2026-08-31',
    ]);
  });

  it('a page published by a third party never establishes an observed channel', () => {
    const r = run(
      page({ publisher: 'THIRD_PARTY', mainText: 'Welcome Week on 1 September 2026.' }),
    );
    expect(r.channels).toEqual([]);
    expect(r.claims).toEqual([]);
  });
});

describe('WW E-X: C1P.NEWSLETTER_SIGNUP (proposals) / C1X.NEWSLETTER_DATED_ISSUES (OBSERVED)', () => {
  it.each([
    ['en', 'Subscribe to our newsletter and never miss an event.'],
    ['fr', 'Abonnez-vous à notre lettre d’information.'],
    ['es', 'Suscríbete a nuestro boletín.'],
    ['nl', 'Meld je aan voor onze nieuwsbrief.'],
    ['ja', 'ニュースレター登録はこちら'],
    ['de', 'Jetzt Newsletter abonnieren!'],
    ['it', 'Iscriviti alla nostra newsletter.'],
    ['pt', 'Inscreva-se na nossa newsletter.'],
  ])(
    "%s: a sign-up SENTENCE is the organisation's statement: existence + PUSHED_TO_MEMBERS PROPOSED, never OBSERVED",
    (lang, line) => {
      const r = run(page({ mainText: line }));
      expect(r.channels.map((c) => [c.kind, c.channelClass, c.establishedBy])).toEqual([
        ['MEMBER_NEWSLETTER', 'FEED', 'PROPOSAL_ONLY'],
      ]);
      expect(r.claims).toEqual([]);
      const signUp = r.proposals.filter((p) => p.ruleId === `C1P.NEWSLETTER_SIGNUP.${lang}`);
      expect(signUp.map((p) => [p.key, p.value, p.mode, p.subject])).toEqual([
        [
          'channel.existence',
          { status: 'EXISTS' },
          'SELF_ASSERTED',
          { kind: 'CHANNEL', channelKey: 'MEMBER_NEWSLETTER|root-1' },
        ],
        [
          'channel.reach_mode',
          { reach: 'PUSHED_TO_MEMBERS' },
          'SELF_ASSERTED',
          { kind: 'CHANNEL', channelKey: 'MEMBER_NEWSLETTER|root-1' },
        ],
      ]);
    },
  );

  it('negative: a newsletter mentioned without a sign-up or an issue date is not a channel', () => {
    const r = run(page({ mainText: 'Read our newsletter for updates.' }));
    expect(r.channels).toEqual([]);
    expect(r.proposals).toEqual([]);
    // "our newsletter" names a channel nothing established: an explicit gap.
    expect(r.unmapped.map((u) => [u.reason, u.label])).toEqual([
      ['CHANNEL_NOT_ESTABLISHED', 'channel.operator_binding:MEMBER_NEWSLETTER'],
    ]);
  });

  it('ambiguous: "subscribe" on another line does not make a sign-up', () => {
    const r = run(page({ mainText: 'Newsletter\nSubscribe to our events calendar.' }));
    expect(r.channels).toEqual([]);
  });

  it('dated issues: feed_activity with the past item dates, completeView false', () => {
    const r = run(
      page({
        mainText:
          'Newsletter — 3 March 2026\nNewsletter — 6 October 2026\nNewsletter preview — 3 December 2026',
      }),
    );
    expect(claim(r, 'channel.feed_activity', 'MEMBER_NEWSLETTER')!.value).toEqual({
      completeView: false,
      itemDates: ['2026-03-03', '2026-10-06'],
    });
    expect(claim(r, 'channel.reach_mode', 'MEMBER_NEWSLETTER')).toBeUndefined();
  });

  it('negative: only future-dated issues are no activity', () => {
    const r = run(page({ mainText: 'Newsletter — 3 December 2026' }));
    expect(r.claims).toEqual([]);
  });
});

describe('WW E-X: C1X.SUBMISSION_INVITATION / EXTERNAL_LINKS_LISTING (OBSERVED, admitted website)', () => {
  it.each([
    ['en', 'Submit your event to our calendar.'],
    ['fr', 'Proposez votre événement !'],
    ['es', 'Envía tu evento a la agenda.'],
    ['nl', 'Stuur je evenement in via het formulier.'],
    ['ja', 'イベント掲載依頼フォーム'],
    ['de', 'Veranstaltung einreichen'],
    ['it', 'Segnala il tuo evento'],
    ['pt', 'Envie seu evento para a agenda.'],
  ])('%s: a submission invitation is SUBMISSION_INVITATION on the website', (lang, line) => {
    const r = run(page({ mainText: line }));
    expect(r.claims).toEqual([
      {
        key: 'channel.resource_openness',
        channelKey: 'RESOURCE_PAGE|root-1',
        value: { kind: 'SUBMISSION_INVITATION', itemDate: null },
        ruleIds: [`C1X.SUBMISSION_INVITATION.${lang}`],
        pageIds: [r.pageClasses[0]!.pageId],
        statedDates: [],
      },
    ]);
    expect(r.channels).toEqual([]);
  });

  it('negative: "submit your application" is not an invitation to list a resource', () => {
    expect(run(page({ mainText: 'Submit your application before 1 May.' })).claims).toEqual([]);
  });

  it.each([
    ['en', 'Useful links'],
    ['fr', 'Liens utiles'],
    ['es', 'Enlaces útiles'],
    ['nl', 'Handige links'],
    ['ja', '外部リンク'],
    ['de', 'Nützliche Links'],
    ['it', 'Link utili'],
    ['pt', 'Links úteis'],
  ])('%s: a links-list heading is FORMAT_ALLOWS (never a precedent kind)', (lang, heading) => {
    const r = run(page({ headings: [heading], mainText: 'A list.' }));
    expect(r.claims.map((c) => [c.value, c.ruleIds])).toEqual([
      [{ kind: 'FORMAT_ALLOWS', itemDate: null }, [`C1X.EXTERNAL_LINKS_LISTING.${lang}`]],
    ]);
  });

  it('ambiguous: the phrase in body text is not a listing heading', () => {
    expect(run(page({ mainText: 'See the useful links on the left.' })).claims).toEqual([]);
  });
});

describe('WW E-X: C1P.AUDIENCE_LANGUAGES (proposal, never from the page language)', () => {
  it.each([
    ['en', 'For international students learning Dutch.', ['nl']],
    ['fr', 'Cours de français pour étudiants.', ['fr']],
    ['es', 'Clases de español para extranjeros.', ['es']],
    ['nl', 'Wij helpen je Nederlands leren.', ['nl']],
    ['ja', '日本語教室を毎週開催しています。', ['ja']],
    ['de', 'Hier kannst du Deutsch lernen.', ['de']],
    ['it', 'Corsi di italiano per studenti stranieri.', ['it']],
    ['pt', 'Aulas de português para estrangeiros.', ['pt']],
  ])('%s: %s', (lang, line, languages) => {
    const r = run(page({ mainText: line }));
    const p = r.proposals.find((x) => x.key === 'audience.languages')!;
    expect(p).toMatchObject({
      value: { languages },
      mode: 'SELF_ASSERTED',
      ruleId: `C1P.AUDIENCE_LANGUAGES.${lang}`,
      language: lang,
      subject: { kind: 'CHANNEL', channelKey: 'RESOURCE_PAGE|root-1' },
    });
    expect(r.claims).toEqual([]);
  });

  it('one proposal per page with the UNION of the languages it names', () => {
    const r = run(page({ mainText: 'Learn Dutch with us.\nEnglish courses too.' }));
    expect(r.proposals.filter((p) => p.key === 'audience.languages').map((p) => p.value)).toEqual([
      { languages: ['en', 'nl'] },
    ]);
  });

  it('negative: a page WRITTEN in Dutch about nothing learned proposes no language', () => {
    expect(run(page({ mainText: 'Wij zijn een gezellige club in Utrecht.' })).proposals).toEqual(
      [],
    );
  });
});

describe('WW E-X: C1P.SEGMENT_* / C1P.COHORT (proposals)', () => {
  it.each([
    ['en', 'We are an association for international students.', 'INCOMING_INTERNATIONAL_STUDENTS'],
    ['fr', 'Une association pour les étudiants internationaux.', 'INCOMING_INTERNATIONAL_STUDENTS'],
    [
      'es',
      'Somos una asociación de estudiantes de intercambio.',
      'INCOMING_INTERNATIONAL_STUDENTS',
    ],
    ['nl', 'Een vereniging voor internationale studenten.', 'INCOMING_INTERNATIONAL_STUDENTS'],
    ['ja', '留学生のための団体です。', 'INCOMING_INTERNATIONAL_STUDENTS'],
    ['de', 'Ein Verein für internationale Studierende.', 'INCOMING_INTERNATIONAL_STUDENTS'],
    ['it', 'Associazione per studenti internazionali.', 'INCOMING_INTERNATIONAL_STUDENTS'],
    ['pt', 'Associação de estudantes internacionais.', 'INCOMING_INTERNATIONAL_STUDENTS'],
  ])('%s: a self-description frame is WHOLE_AUDIENCE', (lang, line, segment) => {
    const p = run(page({ mainText: line })).proposals.find(
      (x) => x.key === 'audience.segment_definition',
    )!;
    expect(p).toMatchObject({
      value: { segment, scope: 'WHOLE_AUDIENCE' },
      ruleId: `C1P.SEGMENT_WHOLE_AUDIENCE.${lang}`,
    });
  });

  it('"also for" is ADDRESSED_SUBGROUP; a bare "for international students" heading is neither', () => {
    const r = run(
      page({ headings: ['For international students'], mainText: 'Also for exchange students.' }),
    );
    expect(r.proposals.map((p) => p.value)).toEqual([
      { segment: 'INCOMING_INTERNATIONAL_STUDENTS', scope: 'ADDRESSED_SUBGROUP' },
    ]);
  });

  it.each([
    ['en', 'Open to all university students.', 'HIGHER_EDUCATION_ADULT'],
    ['ja', '大学生が中心のサークルです。', 'HIGHER_EDUCATION_ADULT'],
    ['es', 'Talleres para niños los sábados.', 'MINOR_TARGETED'],
    ['de', 'Kurse für Kinder und Jugendliche.', 'MINOR_TARGETED'],
    ['nl', 'Taallessen voor volwassenen.', 'ADULT_NON_HIGHER_EDUCATION'],
  ])(
    '%s: cohort %s -> %s (a minor-targeted statement is proposed like any other)',
    (_l, line, cohort) => {
      expect(run(page({ mainText: line })).proposals.map((p) => p.value)).toContainEqual({
        cohort,
      });
    },
  );
});

describe('WW E-X: C1P.AUDIENCE_COUNT_* (proposals; enrolment never a channel audience)', () => {
  const signUp = 'Subscribe to our newsletter.';

  it('subscribers on the observed newsletter: CHANNEL_SUBSCRIBERS, segment null', () => {
    const r = run(page({ mainText: `${signUp}\nOur newsletter reaches 1,200 subscribers.` }));
    expect(r.proposals.find((p) => p.key === 'channel.audience_count')).toMatchObject({
      subject: { kind: 'CHANNEL', channelKey: 'MEMBER_NEWSLETTER|root-1' },
      value: { count: 1200, basis: 'CHANNEL_SUBSCRIBERS', segment: null },
      ruleId: 'C1P.AUDIENCE_COUNT_SUBSCRIBERS.en',
    });
  });

  it('subscribers on a newsletter nothing established: a gap, never a count', () => {
    const r = run(page({ mainText: 'Our newsletter reaches 1.200 subscribers.' }));
    expect(proposalKeys(r)).toEqual([]);
    expect(r.unmapped.map((u) => u.reason)).toContain('CHANNEL_NOT_ESTABLISHED');
  });

  it.each([
    ['nl', 'Onze nieuwsbrief heeft 1.200 abonnees. Schrijf je in!', 1200],
    ['de', 'Unser Newsletter hat 2.500 Abonnenten. Jetzt anmelden!', 2500],
    ['fr', 'Notre newsletter compte 1\u202f200 abonnés. Abonnez-vous !', 1200],
  ])('%s: thousands separators of the language', (_l, line, count) => {
    const r = run(page({ mainText: line }));
    expect(r.proposals.find((p) => p.key === 'channel.audience_count')!.value['count']).toBe(count);
  });

  it('followers with a platform: PLATFORM_FOLLOWERS on that (proposed) account', () => {
    // Social-account proposals are withheld by default; the count rule itself is shown released.
    expect(run(page({ mainText: 'Our Instagram has 3,400 followers.' })).withheld).toEqual([
      expect.objectContaining({ key: 'channel.audience_count', reason: 'SOCIAL_ACCOUNT_QUOTE' }),
    ]);
    const r = runSocial(page({ mainText: 'Our Instagram has 3,400 followers.' }));
    expect(r.channels.map((c) => [c.kind, c.establishedBy])).toEqual([
      ['INSTAGRAM_ACCOUNT', 'PROPOSAL_ONLY'],
    ]);
    expect(r.proposals[0]!.value).toEqual({
      count: 3400,
      basis: 'PLATFORM_FOLLOWERS',
      segment: null,
    });
  });

  it('ja: フォロワー1,200人 on Instagram', () => {
    const r = runSocial(page({ mainText: 'インスタグラムのフォロワー1,200人' }));
    expect(r.proposals.find((p) => p.key === 'channel.audience_count')!.value).toEqual({
      count: 1200,
      basis: 'PLATFORM_FOLLOWERS',
      segment: null,
    });
  });

  it('enrolment: INSTITUTION_ENROLMENT on the website, never a channel audience', () => {
    const r = run(page({ mainText: 'The university has 30,000 students enrolled.' }));
    expect(r.proposals.map((p) => [p.subject, p.value])).toEqual([
      [
        { kind: 'CHANNEL', channelKey: 'RESOURCE_PAGE|root-1' },
        { count: 30000, basis: 'INSTITUTION_ENROLMENT', segment: null },
      ],
    ]);
  });

  it('members: an explicit gap, never a channel count; a decimal is never a count', () => {
    const r = run(page({ mainText: 'We have 800 members.\nRated 4,5 by 1,5 followers.' }));
    expect(proposalKeys(r)).toEqual([]);
    expect(r.unmapped.map((u) => u.reason)).toContain('MEMBER_COUNT_NOT_BOUND_TO_A_CHANNEL');
  });
});

describe('WW E-X: C1P.ROLE_BASED_OWNERSHIP / CANDIDATE_KIND_* / SOCIAL_ACCOUNT_NAMED', () => {
  it.each([
    ['en', 'This website is run by the board.'],
    ['fr', 'Le site est géré par le bureau.'],
    ['es', 'Gestionado por la junta directiva.'],
    ['nl', 'Beheerd door het bestuur.'],
    ['ja', '実行委員会が運営しています。'],
    ['de', 'Vom Vorstand betreut.'],
    ['it', 'Gestito dal direttivo.'],
    ['pt', 'Gerido pela direção.'],
  ])('%s: role ownership on the website (SELF_ASSERTED only)', (lang, line) => {
    const r = run(page({ mainText: line }));
    expect(r.proposals).toHaveLength(1);
    expect(r.proposals[0]).toMatchObject({
      key: 'channel.role_based_ownership',
      value: { holder: 'ORGANISATION_ROLE' },
      ruleId: `C1P.ROLE_BASED_OWNERSHIP.${lang}`,
      mode: 'SELF_ASSERTED',
    });
  });

  it('a third-party page cannot propose role ownership (C1 admits SELF_ASSERTED only): withheld', () => {
    const r = run(page({ publisher: 'THIRD_PARTY', mainText: 'Run by the board.' }));
    expect(r.proposals).toEqual([]);
    expect(r.withheld.map((w) => w.reason)).toEqual(['MODE_NOT_ADMISSIBLE_FOR_KEY']);
  });

  it.each([
    ['en', 'We are an international student association.', 'INTERNATIONAL_STUDENT_ASSOCIATION'],
    ['fr', 'Nous sommes une association étudiante.', 'STUDENT_ASSOCIATION'],
    ['es', 'Somos un centro de idiomas.', 'LANGUAGE_CENTRE'],
    ['nl', 'Wij zijn een studentenvereniging.', 'STUDENT_ASSOCIATION'],
    ['ja', '留学生会です。', 'INTERNATIONAL_STUDENT_ASSOCIATION'],
    ['de', 'Wir sind ein Sprachcafé.', 'LANGUAGE_SOCIETY'],
    ['it', 'Siamo un centro linguistico.', 'LANGUAGE_CENTRE'],
    ['pt', 'Somos uma associação estudantil.', 'STUDENT_ASSOCIATION'],
  ])(
    '%s: self-description kind (the specific kind suppresses its generic form)',
    (lang, line, kind) => {
      const r = run(page({ mainText: line }));
      expect(
        r.proposals.filter((p) => p.key === 'candidate.kind').map((p) => [p.value, p.ruleId]),
      ).toEqual([[{ kind }, `C1P.CANDIDATE_KIND_SELF_DESCRIPTION.${lang}`]]);
    },
  );

  it('kind from the HOME title only; a kind mentioned in passing is no self-description', () => {
    const home = run(
      page({ isRootUrl: true, title: 'Student Association Example', mainText: 'Hi.' }),
    );
    expect(home.proposals.map((p) => p.ruleId)).toEqual(['C1P.CANDIDATE_KIND_HOME_TITLE.en']);
    const other = run(
      page({ title: 'Student Association Example', mainText: 'Visit the language centre.' }),
    );
    expect(other.proposals).toEqual([]);
  });

  it('a named Instagram account: WITHHELD by default; released, a PROPOSAL_ONLY channel with no handle', () => {
    const byDefault = run(page({ mainText: 'Follow us on Instagram for updates.' }));
    expect([byDefault.channels, byDefault.proposals]).toEqual([[], []]);
    expect(byDefault.withheld.map((w) => [w.key, w.reason])).toEqual([
      ['channel.existence', 'SOCIAL_ACCOUNT_QUOTE'],
      ['channel.operator_binding', 'SOCIAL_ACCOUNT_QUOTE'],
    ]);
    // Even released, a line carrying a handle is contact-shaped and withheld.
    const handle = runSocial(page({ mainText: 'Follow us on Instagram @example_handle.' }));
    expect(handle.proposals).toEqual([]);
    expect(new Set(handle.withheld.map((w) => w.reason))).toEqual(
      new Set(['CONTACT_SHAPED_QUOTE']),
    );
    const r = runSocial(page({ mainText: 'Follow us on Instagram for updates.' }));
    expect(r.channels.map((c) => [c.kind, c.visibility, c.establishedBy])).toEqual([
      ['INSTAGRAM_ACCOUNT', 'PUBLIC', 'PROPOSAL_ONLY'],
    ]);
    expect(r.claims).toEqual([]);
    expect(r.proposals.map((p) => [p.key, p.value])).toEqual([
      ['channel.existence', { status: 'EXISTS' }],
      [
        'channel.operator_binding',
        { operatorCandidateId: CANDIDATE, basis: 'OFFICIAL_PRESENCE_NAMES_CHANNEL' },
      ],
    ]);
    expect(JSON.stringify([r, handle])).not.toContain('example_handle');
  });

  it('WhatsApp is PRIVATE; a platform without a C1 kind is a gap; a platform without a follow call is nothing', () => {
    expect(
      runSocial(page({ mainText: 'Join our WhatsApp group!' })).channels.map((c) => [
        c.kind,
        c.visibility,
      ]),
    ).toEqual([['WHATSAPP_GROUP', 'PRIVATE']]);
    const tiktok = run(page({ mainText: 'Follow us on TikTok' }));
    expect(tiktok.channels).toEqual([]);
    expect(tiktok.unmapped.map((u) => [u.reason, u.label])).toEqual([
      ['NO_FAITHFUL_C1_CHANNEL_KIND', 'PLATFORM:tiktok'],
    ]);
    expect(run(page({ mainText: 'Instagram is a photo app.' })).channels).toEqual([]);
  });

  it('a news page with dated items is a gap (C1 has no website-feed kind), never a FEED channel', () => {
    const r = run(page({ headings: ['News'], mainText: 'Board elected on 2 October 2026.' }));
    expect(r.channels).toEqual([]);
    expect(r.unmapped.map((u) => u.label)).toEqual(['WEBSITE_NEWS_FEED']);
  });
});

describe('WW E-X: quotes never carry contact data (JP / MX / NL / DE formats)', () => {
  // The contact data sits in the SAME sentence as the matched phrase, so it would be quoted.
  const contactLines = [
    ['JP phone', 'We are an association for international students, 電話 ０６－１２３４－５６７８'],
    ['JP phone (bracketed)', 'We are an association for international students, 03(1234)5678'],
    ['MX phone', 'We are an association for international students, llama al +52 33 1234 5678'],
    ['NL phone', 'We are an association for international students, bel 071-123 45 67'],
    ['DE phone', 'We are an association for international students, telefonisch +49 (0)30 1234567'],
    ['email', 'We are an association for international students: info@example-fict.de'],
  ] as const;

  it.each(contactLines)(
    '%s on the quoted line, unredacted: the proposal is WITHHELD',
    (_l, line) => {
      const r = run(page({ mainText: line }));
      expect(r.proposals).toEqual([]);
      // Both the segment and the kind proposal on that sentence are withheld.
      expect(r.withheld.map((w) => [w.key, w.reason])).toEqual([
        ['candidate.kind', 'CONTACT_SHAPED_QUOTE'],
        ['audience.segment_definition', 'CONTACT_SHAPED_QUOTE'],
      ]);
    },
  );

  it.each(contactLines)(
    '%s through the real extraction path: nothing contact-shaped survives anywhere',
    (_l, line) => {
      const extracted = extractPage(
        `<html lang="en"><head><title>About</title></head><body><main><p>${line}</p><p>Learn Dutch with us. Questions? 020 123 4567</p></main></body></html>`,
      );
      const r = run(page({ title: extracted.title, mainText: extracted.mainText }));
      const text = JSON.stringify(r);
      expect(text).not.toMatch(/@|1234|4567|\+52|\+49|０６/);
      expect(r.proposals.every((p) => !/\[(EMAIL|PHONE)\]/.test(p.quote))).toBe(true);
    },
  );

  it('a quote carrying a reserved I0 namespace marker is withheld', () => {
    const r = run(page({ mainText: 'We are an association for international students (opp: 3).' }));
    expect(r.proposals).toEqual([]);
    expect(new Set(r.withheld.map((w) => w.reason))).toEqual(
      new Set(['RESERVED_NAMESPACE_MARKER_IN_QUOTE']),
    );
  });

  it('a quote is a contiguous substring of the stored text, at most 300 code points', () => {
    const long = `We are an association for international students. ${'Lorem ipsum dolor sit amet '.repeat(20)}`;
    const r = run(page({ mainText: long }));
    const p = r.proposals[0]!;
    expect(p.quote).toBe('We are an association for international students.');
    expect(long).toContain(p.quote);
    const unbroken = `We are an association for international students ${'x'.repeat(400)}`;
    const q = run(page({ mainText: unbroken })).proposals[0]!;
    expect(Array.from(q.quote)).toHaveLength(300);
    expect(q.quoteTruncated).toBe(true);
    expect(unbroken.startsWith(q.quote)).toBe(true);
  });
});

describe('WW E-X: class separation, determinism and the rule table', () => {
  const rich = () => [
    page({
      isRootUrl: true,
      title: 'International Student Association Example',
      mainText:
        'We are an association for international students learning Dutch.\nSubscribe to our newsletter.\nFollow us on Instagram.\nRun by the board.',
    }),
    page({
      title: 'Welcome Week',
      mainText:
        'Welcome Week: 2 September 2024.\nWelcome Week: 1 September 2025.\nSubmit your event!',
    }),
  ];

  it('claims are OBSERVED-only keys; proposals are self-description keys; never the same record', () => {
    const r = run(...rich());
    expect(new Set(r.claims.map((c) => c.key))).toEqual(
      new Set([
        'channel.existence',
        'channel.event_instances',
        'channel.cycle_history',
        'channel.resource_openness',
      ]),
    );
    // The sign-up sentence travels as proposals only (rules v2).
    expect(
      r.proposals.filter((p) => p.ruleId === 'C1P.NEWSLETTER_SIGNUP.en').map((p) => p.key),
    ).toEqual(['channel.existence', 'channel.reach_mode']);
    for (const p of r.proposals)
      expect(['SELF_ASSERTED', 'THIRD_PARTY_ASSERTED']).toContain(p.mode);
    for (const c of [...r.claims, ...r.proposals]) {
      const parsed = C1_VALUE_SCHEMAS[c.key as C1EmittedKey].safeParse(c.value);
      expect(parsed.success, c.key).toBe(true);
    }
  });

  it('is deterministic and order-independent', () => {
    const pages = rich();
    const a = JSON.stringify(run(...pages));
    expect(JSON.stringify(run(...[...pages].reverse()))).toBe(a);
    expect(JSON.stringify(run(...pages))).toBe(a);
  });

  it('every rule has a stable id, a language, its keys and a documented reason', () => {
    const ids = C1_EXTRACTION_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of C1_EXTRACTION_RULES) {
      expect(r.id).toMatch(/^C1[XPG]\.[A-Z0-9_]+\.(en|fr|es|nl|ja|de|it|pt)$/);
      expect(C1_LANGUAGES).toContain(r.language);
      expect(r.reason.length).toBeGreaterThan(40);
      if (r.ruleClass !== 'C1G') expect(r.keys.length).toBeGreaterThan(0);
    }
    // Every concept ships in at least the eight languages where its lexicon exists.
    for (const c of C1_CONCEPTS) {
      expect(
        C1_EXTRACTION_RULES.filter((r) => r.concept === c.concept).length,
        c.concept,
      ).toBeGreaterThanOrEqual(7);
    }
    expect(C1_EXTRACTION_RULES_VERSION).toBe('nwf-pe-c1-extraction-rules-v3');
  });

  it('a page with nothing to read yields nothing (unknown stays unknown)', () => {
    const r = run(page({ isRootUrl: true, title: 'Home', mainText: 'Welcome to our website.' }));
    expect([r.channels, r.claims, r.proposals, r.unmapped, r.withheld]).toEqual([
      [],
      [],
      [],
      [],
      [],
    ]);
    expect(claimKeys(r)).toEqual([]);
  });
});

// ===========================================================================
// WW E-XFX regression vectors (independent review P1-2, P1-1, P2-9).
// ===========================================================================

const POSITIVE_CLAIM_OR_PROPOSAL = (r: C1Extraction) => [
  ...r.claims,
  ...r.proposals.filter(
    (p) => !(p.key === 'channel.existence' && p.value['status'] === 'DISCONTINUED'),
  ),
];
const guardLabels = (r: C1Extraction) =>
  r.unmapped.filter((u) => u.reason === 'STATEMENT_GUARDED').map((u) => u.label);

describe('WW E-XFX P1-2: the reproduced statements are never OBSERVED', () => {
  it('"We no longer send a newsletter, so please do not sign up." - no EXISTS, no reach mode; a DISCONTINUED proposal', () => {
    const r = run(page({ mainText: 'We no longer send a newsletter, so please do not sign up.' }));
    expect(r.claims).toEqual([]);
    expect(POSITIVE_CLAIM_OR_PROPOSAL(r)).toEqual([]);
    expect(r.proposals.map((p) => [p.key, p.value, p.mode, p.ruleId])).toEqual([
      [
        'channel.existence',
        { status: 'DISCONTINUED' },
        'SELF_ASSERTED',
        'C1P.CHANNEL_DISCONTINUATION_STATED.en',
      ],
    ]);
    expect(r.proposals[0]!.quote).toBe('We no longer send a newsletter, so please do not sign up.');
    expect(r.channels.map((c) => [c.kind, c.establishedBy])).toEqual([
      ['MEMBER_NEWSLETTER', 'PROPOSAL_ONLY'],
    ]);
    expect(guardLabels(r)).toEqual(['GUARD:DISCONTINUATION', 'GUARD:NEGATION']);
  });

  it('"Registration … closes on 1 June 2025; the welcome week itself was cancelled." - no event instance', () => {
    const r = run(
      page({
        mainText:
          'Registration for the Welcome Week closes on 1 June 2025; the welcome week itself was cancelled.',
      }),
    );
    expect([r.claims, r.proposals, r.channels]).toEqual([[], [], []]);
    expect(guardLabels(r).sort()).toEqual(['GUARD:CANCELLATION', 'GUARD:DEADLINE']);
  });

  it('"Sign up for our newsletter." - proposals only, never also an OBSERVED claim', () => {
    const r = run(page({ mainText: 'Sign up for our newsletter.' }));
    expect(r.claims).toEqual([]);
    expect(r.proposals.map((p) => [p.key, p.mode]).sort()).toEqual([
      ['channel.existence', 'SELF_ASSERTED'],
      ['channel.operator_binding', 'SELF_ASSERTED'],
      ['channel.reach_mode', 'SELF_ASSERTED'],
    ]);
  });

  it('the line between artefact and statement: a LISTED dated issue is observed, the sign-up sentence is not', () => {
    const r = run(page({ mainText: 'Subscribe to our newsletter.\nNewsletter — 3 March 2026' }));
    expect(r.claims.map((c) => [c.key, c.ruleIds])).toEqual([
      ['channel.existence', ['C1X.NEWSLETTER_DATED_ISSUES.en']],
      ['channel.feed_activity', ['C1X.NEWSLETTER_DATED_ISSUES.en']],
    ]);
    expect(r.channels.map((c) => c.establishedBy)).toEqual(['OBSERVED_CLAIM']);
    expect(r.proposals.find((p) => p.key === 'channel.reach_mode')!.mode).toBe('SELF_ASSERTED');
    // No claim ever rests on the sign-up rule.
    expect(r.claims.flatMap((c) => c.ruleIds).some((id) => id.includes('SIGNUP'))).toBe(false);
  });
});

describe('WW E-XFX P1-2: negation / cancellation / discontinuation / deadline guards, per language', () => {
  it.each([
    // [language, guarded line, the guard kinds it records]
    ['en', 'Welcome Week on 1 September 2026 has been postponed.', ['CANCELLATION']],
    ['en', 'Welcome Week: apply before 1 September 2026.', ['DEADLINE']],
    ['fr', "La semaine d'intégration du 1er septembre 2026 est annulée.", ['CANCELLATION']],
    ['fr', "Semaine d'intégration : inscriptions jusqu'au 1er septembre 2026.", ['DEADLINE']],
    ['fr', "Nous ne proposons pas de semaine d'intégration le 1er septembre 2026.", ['NEGATION']],
    ['es', 'La semana de bienvenida del 7 de septiembre de 2026 fue cancelada.', ['CANCELLATION']],
    ['es', 'Semana de bienvenida: fecha límite 7 de septiembre de 2026.', ['DEADLINE']],
    ['nl', 'De introductieweek van 17 augustus 2026 is geannuleerd.', ['CANCELLATION']],
    ['nl', 'Introductieweek: aanmelden tot 17 augustus 2026.', ['DEADLINE']],
    ['ja', '2026年4月10日 新入生歓迎会は中止になりました。', ['CANCELLATION']],
    ['ja', '新入生歓迎会 申込締切 2026年4月10日', ['DEADLINE']],
    ['ja', 'ニュースレター登録の受付は終了しました。', ['CANCELLATION']],
    ['ja', '新入生歓迎会は2026年4月10日に開催しません。', ['NEGATION']],
    ['de', 'Die Erstiwoche am 5. Oktober 2026 ist abgesagt.', ['CANCELLATION']],
    ['de', 'Erstiwoche: Anmeldeschluss 5. Oktober 2026.', ['DEADLINE']],
    ['it', 'La settimana di accoglienza del 14 settembre 2026 è annullata.', ['CANCELLATION']],
    ['it', 'Settimana di accoglienza: scadenza 14 settembre 2026.', ['DEADLINE']],
    ['pt', 'A semana de recepção de 3 de março de 2026 foi adiada.', ['CANCELLATION']],
    ['pt', 'Semana de recepção: prazo 3 de março de 2026.', ['DEADLINE']],
  ])('%s: %s -> no positive claim or proposal, an explicit gap', (lang, line, kinds) => {
    const r = run(page({ mainText: line }));
    expect(POSITIVE_CLAIM_OR_PROPOSAL(r)).toEqual([]);
    expect(r.channels).toEqual([]);
    expect(guardLabels(r).sort()).toEqual(kinds.map((k) => `GUARD:${k}`).sort());
    expect(r.unmapped.find((u) => u.reason === 'STATEMENT_GUARDED')!.ruleId).toMatch(
      new RegExp(`^C1G\\.GUARDED_STATEMENT\\.(${lang}|en)$`),
    );
  });

  it.each([
    ['en', 'We no longer send a newsletter. Subscribe elsewhere.', 'MEMBER_NEWSLETTER'],
    [
      'fr',
      "Nous n'envoyons plus de lettre d'information, abonnez-vous ailleurs.",
      'MEMBER_NEWSLETTER',
    ],
    ['es', 'Ya no publicamos nuestro boletín, suscríbete a otro.', 'MEMBER_NEWSLETTER'],
    ['nl', 'We sturen geen nieuwsbrief meer, meld je elders aan.', 'MEMBER_NEWSLETTER'],
    ['ja', 'ニュースレターは廃止しました。', 'MEMBER_NEWSLETTER'],
    [
      'de',
      'Wir verschicken keinen Newsletter mehr, bitte woanders abonnieren.',
      'MEMBER_NEWSLETTER',
    ],
    ['it', 'Non inviamo più la newsletter, iscriviti altrove.', 'MEMBER_NEWSLETTER'],
    ['pt', 'Não enviamos mais a newsletter, inscreva-se noutro lugar.', 'MEMBER_NEWSLETTER'],
    ['en', 'We no longer organise a Welcome Week.', 'ORIENTATION_EVENT'],
    ['fr', "Nous n'organisons plus de semaine d'intégration.", 'ORIENTATION_EVENT'],
    ['de', 'Die Erstiwoche findet nicht mehr statt.', 'ORIENTATION_EVENT'],
  ])(
    '%s: a stated discontinuation on the OWN page is a DISCONTINUED proposal (C1 has that negative)',
    (lang, line, kind) => {
      const r = run(page({ mainText: line }));
      expect(r.claims).toEqual([]);
      expect(r.proposals.map((p) => [p.key, p.value, p.subject, p.ruleId, p.language])).toEqual([
        [
          'channel.existence',
          { status: 'DISCONTINUED' },
          { kind: 'CHANNEL', channelKey: `${kind}|root-1` },
          `C1P.CHANNEL_DISCONTINUATION_STATED.${lang}`,
          lang,
        ],
      ]);
      expect(guardLabels(r)).toContain('GUARD:DISCONTINUATION');
    },
  );

  it('a discontinuation on a THIRD-PARTY page is a gap only, never a proposal', () => {
    const r = run(
      page({ publisher: 'THIRD_PARTY', mainText: 'They no longer organise a Welcome Week.' }),
    );
    expect([r.claims, r.proposals, r.channels]).toEqual([[], [], []]);
    // Rules v3: the plain negation `no` is a guard too, so "no longer" records both kinds.
    expect(guardLabels(r)).toEqual(['GUARD:DISCONTINUATION', 'GUARD:NEGATION']);
  });

  it('a guarded self-description, count or follow call yields nothing positive either', () => {
    const r = runSocial(
      page({
        mainText:
          'We are no longer an association for international students.\nOur Instagram no longer has 3,400 followers.\nFollow us on TikTok? Not any more.',
      }),
    );
    expect([r.claims, r.proposals, r.channels]).toEqual([[], [], []]);
    expect(r.unmapped.every((u) => u.reason === 'STATEMENT_GUARDED')).toBe(true);
  });

  it('a guarded links heading is no listing', () => {
    const r = run(page({ headings: ['Useful links (no longer maintained)'], mainText: 'A list.' }));
    expect(r.claims).toEqual([]);
  });

  it.each([
    ['en', 'We are a not-for-profit association for international students.'],
    ['en', "Don't miss Welcome Week on 1 September 2026!"],
    ['en', 'Subscribe to our newsletter and never miss an event.'],
    ['fr', "Ne manquez pas la semaine d'intégration le 1er septembre 2026 !"],
    ['es', 'No te pierdas la semana de bienvenida el 7 de septiembre de 2026.'],
    ['de', 'Nicht verpassen: Erstiwoche am 5. Oktober 2026.'],
    ['it', 'Non perdere la settimana di accoglienza il 14 settembre 2026.'],
    ['pt', 'Não perca a semana de recepção em 3 de março de 2026.'],
  ])('%s: a fixed phrase that negates nothing is not a guard: %s', (_lang, line) => {
    const r = run(page({ mainText: line }));
    expect(guardLabels(r)).toEqual([]);
    // Rules v3: an invitation SENTENCE ("Don't miss …") is a statement, so the dated event
    // it names is proposed rather than observed - but it is read, never suppressed.
    expect(r.claims.length + r.proposals.length).toBeGreaterThan(0);
  });
});

describe('WW E-XFX P1-1 / P2-9: contact-shaped and social-account quotes are withheld', () => {
  const SELF = 'We are an association for international students';
  it.each([
    ['a social handle', `${SELF}, find us as @esn_utrecht.`],
    ['a full-width at-sign handle', `${SELF}、＠ryugakusei_rei`],
    ['an account URL', `${SELF}: instagram.com/janjansen`],
    ['a WhatsApp link', `${SELF}: wa.me/31612345678`],
    ['a scheme URL', `${SELF}: https://example.org/club`],
    ['a www host', `${SELF}, see www.example.org`],
    ['a separator-less NL mobile', `${SELF}, 0612345678`],
    ['a separator-less JP number (full-width)', `${SELF}、０３１２３４５６７８`],
    ['a separator-less MX number', `${SELF}, 8112345678`],
    ['a DE number in a short shape the redactor keeps', `${SELF}, 030/1234-567`],
    ['an eight-digit run', `${SELF}, ref 12345678`],
    ['an obfuscated address', `${SELF}: info [at] example [dot] org`],
    ['a personal name beside a contact cue (en)', `${SELF}, contact Jan Jansen`],
    ['a personal name beside a contact cue (nl)', `${SELF}, bel Jan Jansen`],
    ['a personal name beside a contact cue (es)', `${SELF}, escribe a María López`],
  ])('%s: the proposal is WITHHELD (CONTACT_SHAPED_QUOTE)', (_label, line) => {
    const r = run(page({ mainText: line }));
    expect(r.proposals).toEqual([]);
    expect(new Set(r.withheld.map((w) => w.reason))).toEqual(new Set(['CONTACT_SHAPED_QUOTE']));
    expect(JSON.stringify(r)).not.toMatch(/esn_utrecht|janjansen|612345678|Jansen|López/);
  });

  it('ja: a contact cue beside a name is withheld too', () => {
    const r = run(page({ mainText: '私たちは留学生のためのサークルです。お問い合わせは山田まで' }));
    // The self-description sentence is quoted alone: it carries no cue, so it survives.
    expect(r.proposals.every((p) => !p.quote.includes('山田'))).toBe(true);
    const joined = run(page({ mainText: '留学生のための団体です、担当 山田' }));
    expect(joined.proposals).toEqual([]);
    expect(new Set(joined.withheld.map((w) => w.reason))).toEqual(
      new Set(['CONTACT_SHAPED_QUOTE']),
    );
  });

  it('P2-9: a number straddling the 300-code-point cap is caught on the FULL sentence', () => {
    // The cap falls inside "0612 345678": the capped quote alone ("… 0612") looks harmless.
    const head = `${SELF} ${'x'.repeat(300 - SELF.length - 1 - 5)} 0612`;
    expect(Array.from(head)).toHaveLength(300);
    const line = `${head} 345678 and more`;
    const r = run(page({ mainText: line }));
    expect(r.proposals).toEqual([]);
    expect(new Set(r.withheld.map((w) => w.reason))).toEqual(new Set(['CONTACT_SHAPED_QUOTE']));
  });

  it('every social-account proposal is withheld by default, whatever its line says', () => {
    for (const line of [
      'Follow us on Instagram!',
      'Join our WhatsApp group!',
      'Follow us on Facebook.',
      'Our Instagram has 3,400 followers.',
    ]) {
      const r = run(page({ mainText: line }));
      expect(r.proposals, line).toEqual([]);
      expect(r.channels, line).toEqual([]);
      expect(new Set(r.withheld.map((w) => w.reason)), line).toEqual(
        new Set(['SOCIAL_ACCOUNT_QUOTE']),
      );
    }
  });

  it('ordinary self-descriptions still pass: years, dates and counts are not contact data', () => {
    const r = run(
      page({
        mainText:
          'We are an association for international students, founded in 2019 and active in 2026-2027.',
      }),
    );
    expect(r.withheld).toEqual([]);
    expect(r.proposals.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// WW H-EX regression vectors (independent review P1-4, P1-5, P2-8, P2-6):
// rules v3. Each probe text -> its expected output.
// ===========================================================================

const datedGaps = (r: C1Extraction) =>
  r.unmapped.filter((u) => u.reason === 'DATED_ITEM_NOT_A_LISTING').map((u) => u.label);
const pageGuards = (r: C1Extraction) =>
  r.unmapped.filter((u) => u.reason === 'PAGE_GUARDED').map((u) => u.label);

describe('WW H-EX P1-4: organisation prose is never an OBSERVED dated item', () => {
  it('"Our last newsletter was sent on 3 March 2026." -> no claim, no proposal; a STATEMENT gap', () => {
    const r = run(page({ mainText: 'Our last newsletter was sent on 3 March 2026.' }));
    expect(r.claims).toEqual([]);
    expect(r.proposals).toEqual([]);
    expect(r.channels).toEqual([]);
    expect(datedGaps(r)).toEqual(['MEMBER_NEWSLETTER:STATEMENT']);
    expect(r.unmapped.find((u) => u.reason === 'DATED_ITEM_NOT_A_LISTING')!.ruleId).toBe(
      'C1G.DATED_ITEM_NOT_LISTED.en',
    );
  });

  it('"Newsletter sign-up opened on 1 March 2026 - subscribe now!" -> sign-up PROPOSALS only, never an issue', () => {
    const r = run(page({ mainText: 'Newsletter sign-up opened on 1 March 2026 - subscribe now!' }));
    expect(r.claims).toEqual([]);
    expect(r.proposals.map((p) => [p.key, p.mode, p.ruleId])).toEqual([
      ['channel.existence', 'SELF_ASSERTED', 'C1P.NEWSLETTER_SIGNUP.en'],
      ['channel.reach_mode', 'SELF_ASSERTED', 'C1P.NEWSLETTER_SIGNUP.en'],
    ]);
    expect(r.channels.map((c) => c.establishedBy)).toEqual(['PROPOSAL_ONLY']);
    expect(datedGaps(r)).toEqual(['MEMBER_NEWSLETTER:SIGN_UP_LINE']);
  });

  it('"In the university newsletter of 3 March 2026 we were featured." -> nothing for the subject', () => {
    const r = run(
      page({ mainText: 'In the university newsletter of 3 March 2026 we were featured.' }),
    );
    expect([r.claims, r.proposals, r.channels]).toEqual([[], [], []]);
    expect(datedGaps(r)).toEqual(['MEMBER_NEWSLETTER:OTHER_ORGANISATION']);
  });

  it('"We hope to organise a welcome week on 1 September 2026 if funding allows." -> nothing', () => {
    const r = run(
      page({
        mainText: 'We hope to organise a welcome week on 1 September 2026 if funding allows.',
      }),
    );
    expect([r.claims, r.proposals, r.channels]).toEqual([[], [], []]);
    expect(datedGaps(r)).toEqual(['ORIENTATION_EVENT:INTENT_FRAME']);
  });

  it.each([
    ['en', 'Their welcome week: 1 September 2026', 'ORIENTATION_EVENT'],
    ['en', "The university's Welcome Week: 1 September 2026", 'ORIENTATION_EVENT'],
    ['en', 'Their newsletter — 3 March 2026', 'MEMBER_NEWSLETTER'],
    ['en', 'The newsletter of the faculty — 3 March 2026', 'MEMBER_NEWSLETTER'],
    ['es', 'Su boletín — 3 de marzo de 2026', 'MEMBER_NEWSLETTER'],
    [
      'es',
      'La semana de bienvenida de la universidad: 7 de septiembre de 2026',
      'ORIENTATION_EVENT',
    ],
    ['nl', 'Nieuwsbrief van de gemeente — 3 maart 2026', 'MEMBER_NEWSLETTER'],
    ['de', 'Erstiwoche der Hochschule: 5. Oktober 2026', 'ORIENTATION_EVENT'],
    ['fr', "Semaine d'intégration de l'université : 1er septembre 2026", 'ORIENTATION_EVENT'],
    ['ja', '大学の新入生歓迎会 2026年4月10日', 'ORIENTATION_EVENT'],
  ])("%s: another organisation's channel yields nothing for the subject: %s", (_l, line, kind) => {
    const r = run(page({ mainText: line }));
    expect([r.claims, r.proposals, r.channels]).toEqual([[], [], []]);
    expect(datedGaps(r)).toEqual([`${kind}:OTHER_ORGANISATION`]);
  });

  it('"Sign up for the university newsletter." credits nobody: no sign-up proposal, no binding', () => {
    const r = run(page({ mainText: 'Sign up for the university newsletter.' }));
    expect([r.claims, r.proposals, r.channels]).toEqual([[], [], []]);
  });

  it('an owner word AFTER the term without a genitive link is not another organisation', () => {
    const r = run(page({ mainText: 'Subscribe to our newsletter for university students.' }));
    expect(r.proposals.filter((p) => p.ruleId === 'C1P.NEWSLETTER_SIGNUP.en')).toHaveLength(2);
  });

  it.each([
    ['en', 'Welcome Week 2026 — 1 September 2026, if funding allows'],
    ['en', 'Welcome Week: 1 September 2026 (to be confirmed)'],
    ['fr', "Semaine d'intégration le 1er septembre 2026, sous réserve"],
    ['es', 'Semana de bienvenida: 7 de septiembre de 2026, por confirmar'],
    ['nl', 'Introductieweek 17 augustus 2026, onder voorbehoud'],
    ['de', 'Erstiwoche vielleicht am 5. Oktober 2026'],
    ['it', 'Settimana di accoglienza: 14 settembre 2026, da confermare'],
    ['pt', 'Semana de recepção talvez em 3 de março de 2026'],
    ['ja', '新入生歓迎会 2026年4月10日 未定'],
  ])(
    '%s: a date in a hope / condition / tentative frame is neither observed nor proposed: %s',
    (_l, line) => {
      const r = run(page({ mainText: line }));
      expect([r.claims, r.proposals, r.channels]).toEqual([[], [], []]);
      expect(datedGaps(r)).toEqual(['ORIENTATION_EVENT:INTENT_FRAME']);
    },
  );

  it.each([
    ['en', 'Welcome Week Utrecht — Monday 1 September 2025'],
    ['en', 'Newsletter no. 12 — 3 March 2026'],
    ['nl', 'Nieuwsbrief editie 3 — 3 maart 2026'],
    ['de', 'Newsletter Ausgabe 3 vom 3. März 2026'],
    ['it', 'Newsletter numero 4 del 3 marzo 2026'],
    ['pt', 'Boletim de 3 de março de 2026'],
  ])('%s: a short listing line is still OBSERVED: %s', (_l, line) => {
    const r = run(page({ mainText: line }));
    expect(r.claims.length).toBeGreaterThan(0);
    expect(r.claims.every((c) => c.ruleIds.every((id) => id.startsWith('C1X.')))).toBe(true);
    expect(r.proposals).toEqual([]);
  });

  it('a heading over the page is a listing unit; the same words as a sentence are not', () => {
    const heading = run(
      page({
        headings: ['Welcome Week Utrecht 2026: 1 September 2026'],
        mainText: 'Programme below.',
      }),
    );
    expect(claimKeys(heading)).toEqual([
      'ORIENTATION_EVENT:channel.event_instances',
      'ORIENTATION_EVENT:channel.existence',
    ]);
    const sentence = run(
      page({ headings: ['Our Welcome Week starts on 1 September 2026'], mainText: 'x' }),
    );
    expect(sentence.claims).toEqual([]);
  });

  it('a line with more unexplained words than a listing carries is a statement (fail closed)', () => {
    const r = run(
      page({ mainText: 'Welcome Week Utrecht Amsterdam Rotterdam — 1 September 2026' }),
    );
    expect(r.claims).toEqual([]);
    expect(r.proposals.map((p) => p.ruleId)).toEqual([
      'C1P.ORIENTATION_EVENT_STATED.en',
      'C1P.ORIENTATION_EVENT_STATED.en',
    ]);
  });

  it('newsletter prose is a gap in every language (feed_activity is OBSERVED-only in C1)', () => {
    for (const line of [
      'Notre dernière lettre d’information est parue le 3 mars 2026.',
      'Nuestro último boletín se envió el 3 de marzo de 2026.',
      'Onze laatste nieuwsbrief verscheen op 3 maart 2026.',
      'Unser letzter Newsletter erschien am 3. März 2026.',
      "L'ultima newsletter è stata inviata il 3 marzo 2026.",
      'O último boletim foi enviado em 3 de março de 2026.',
      '2026年3月3日にニュースレターを配信しました。',
    ]) {
      const r = run(page({ mainText: line }));
      expect(r.claims, line).toEqual([]);
      expect(r.proposals, line).toEqual([]);
      expect(datedGaps(r), line).toEqual(['MEMBER_NEWSLETTER:STATEMENT']);
    }
  });

  it('a statement whose date sits in another sentence of the line proposes nothing', () => {
    const r = run(page({ mainText: 'Welcome Week is great fun! Next edition: 1 September 2026.' }));
    expect(r.proposals).toEqual([]);
    expect(datedGaps(r)).toEqual(['ORIENTATION_EVENT:DATE_OUTSIDE_THE_QUOTED_SENTENCE']);
  });
});

describe('WW H-EX P1-5: plain negations, stops and moved dates guard a line, per language', () => {
  it.each([
    ['es', 'No celebraremos la semana de bienvenida el 1 de septiembre de 2026.', 'NEGATION'],
    ['es', 'Sin semana de bienvenida el 1 de septiembre de 2026.', 'NEGATION'],
    ['it', 'Non organizziamo la settimana di benvenuto il 1° settembre 2026.', 'NEGATION'],
    ['fr', "Aucune semaine d'intégration le 1er septembre 2026.", 'NEGATION'],
    ['en', 'Without a welcome week on 1 September 2026.', 'NEGATION'],
    ['en', 'No welcome week on 1 September 2026.', 'NEGATION'],
    ['nl', 'Geen introductieweek op 17 augustus 2026, zonder uitzondering.', 'NEGATION'],
    ['de', 'Ohne Erstiwoche am 5. Oktober 2026.', 'NEGATION'],
    ['pt', 'Sem semana de recepção em 3 de março de 2026.', 'NEGATION'],
    ['ja', '新入生歓迎会なし 2026年4月10日', 'NEGATION'],
    ['nl', 'Introductieweek 17 augustus 2026 vervalt.', 'CANCELLATION'],
    ['en', 'Welcome Week on 1 September 2026 has been moved.', 'CANCELLATION'],
    ['en', 'Welcome Week: 1 September 2026 - rescheduled', 'CANCELLATION'],
    ['fr', "La semaine d'intégration du 1er septembre 2026 est déplacée.", 'CANCELLATION'],
    ['es', 'La semana de bienvenida del 7 de septiembre de 2026 fue trasladada.', 'CANCELLATION'],
    ['nl', 'De introductieweek van 17 augustus 2026 is verplaatst.', 'CANCELLATION'],
    ['de', 'Die Erstiwoche am 5. Oktober 2026 wurde verlegt.', 'CANCELLATION'],
    ['it', 'La settimana di accoglienza del 14 settembre 2026 è stata spostata.', 'CANCELLATION'],
    ['pt', 'A semana de recepção de 3 de março de 2026 foi remarcada.', 'CANCELLATION'],
    ['ja', '2026年4月10日 新入生歓迎会は日程変更になりました。', 'CANCELLATION'],
  ])('%s: %s -> nothing positive', (_lang, line, kind) => {
    const r = run(page({ mainText: line }));
    expect(POSITIVE_CLAIM_OR_PROPOSAL(r)).toEqual([]);
    expect(r.channels).toEqual([]);
    expect(guardLabels(r)).toContain(`GUARD:${kind}`);
  });

  it.each([
    ['en', 'We stopped our newsletter on 3 March 2026.', 'MEMBER_NEWSLETTER'],
    ['nl', 'Nieuwsbrief: laatste editie 3 maart 2026, daarna stoppen we.', 'MEMBER_NEWSLETTER'],
  ])('%s: %s -> nothing positive, only the stated DISCONTINUED proposal', (_l, line, kind) => {
    const r = run(page({ mainText: line }));
    expect(r.claims).toEqual([]);
    expect(POSITIVE_CLAIM_OR_PROPOSAL(r)).toEqual([]);
    expect(r.proposals.map((p) => [p.key, p.value, p.subject])).toEqual([
      [
        'channel.existence',
        { status: 'DISCONTINUED' },
        { kind: 'CHANNEL', channelKey: `${kind}|root-1` },
      ],
    ]);
  });

  it('pt: the contraction "no dia" is a fixed exception, never a negation', () => {
    const r = run(page({ mainText: 'Semana de recepção no dia 3 de março de 2026' }));
    expect(guardLabels(r)).toEqual([]);
    expect(claimKeys(r)).toEqual([
      'ORIENTATION_EVENT:channel.event_instances',
      'ORIENTATION_EVENT:channel.existence',
    ]);
  });
});

describe('WW H-EX P2-8: a cancellation or discontinuation anywhere on a page guards its dated items', () => {
  it('heading "Welcome week 1 September 2026" + "This event has been cancelled." -> no OBSERVED', () => {
    const r = run(
      page({
        headings: ['Welcome week 1 September 2026'],
        mainText: 'This event has been cancelled.',
      }),
    );
    expect([r.claims, r.proposals, r.channels]).toEqual([[], [], []]);
    expect(pageGuards(r)).toEqual(['PAGE_GUARD:CANCELLATION']);
    expect(r.unmapped.find((u) => u.reason === 'PAGE_GUARDED')!.ruleId).toBe('C1G.PAGE_GUARDED.en');
  });

  it('every dated item of the page goes - listed issues, listed instances and described events', () => {
    const r = run(
      page({
        title: 'Archive',
        mainText:
          'Newsletter — 3 March 2026\nWelcome Week: 1 September 2025\nOur welcome week took place on 2 September 2024.\nThe newsletter has been discontinued.',
      }),
    );
    expect(r.claims).toEqual([]);
    expect(POSITIVE_CLAIM_OR_PROPOSAL(r)).toEqual([]);
    expect(pageGuards(r)).toEqual(['PAGE_GUARD:DISCONTINUATION']);
  });

  it.each([
    ['fr', "Semaine d'intégration — 1er septembre 2026\nL'événement est annulé."],
    ['es', 'Semana de bienvenida: 7 de septiembre de 2026\nEl evento fue cancelado.'],
    ['nl', 'Introductieweek 17 augustus 2026\nHet evenement is afgelast.'],
    ['de', 'Erstiwoche: 5. Oktober 2026\nDie Veranstaltung wurde abgesagt.'],
    ['it', 'Settimana di accoglienza: 14 settembre 2026\nL’evento è stato annullato.'],
    ['pt', 'Semana de recepção — 3 de março de 2026\nO evento foi cancelado.'],
    ['ja', '2026年4月10日 新入生歓迎会\nこのイベントは中止です。'],
  ])('%s: a listing above a cancellation line is no instance', (_l, text) => {
    const r = run(page({ mainText: text }));
    expect(r.claims).toEqual([]);
    expect(pageGuards(r)).toEqual(['PAGE_GUARD:CANCELLATION']);
  });

  it('the guard is per page: another page of the same site still shows its listings', () => {
    const r = run(
      page({ mainText: 'Welcome Week: 1 September 2025' }),
      page({ mainText: 'Newsletter — 3 March 2026\nThis issue was cancelled.' }),
    );
    expect(claimKeys(r)).toEqual([
      'ORIENTATION_EVENT:channel.event_instances',
      'ORIENTATION_EVENT:channel.existence',
    ]);
    expect(pageGuards(r)).toEqual(['PAGE_GUARD:CANCELLATION']);
  });

  it('a negation or a deadline elsewhere on the page does not guard the page', () => {
    const r = run(
      page({
        mainText: 'Welcome Week: 1 September 2025\nNo registration needed.\nDeadline: none.',
      }),
    );
    expect(claimKeys(r)).toEqual([
      'ORIENTATION_EVENT:channel.event_instances',
      'ORIENTATION_EVENT:channel.existence',
    ]);
    expect(pageGuards(r)).toEqual([]);
  });
});

describe('WW H-EX P2-6: more contact shapes withhold the quote (never redacted, withheld)', () => {
  const SELF = 'We are an association for international students';
  it.each([
    ['digits with any separators', `${SELF}, 06 – 12 – 34 – 56 – 78`],
    ['digits with middle dots', `${SELF}, 06·12·34·56·78`],
    ['an at in braces', `${SELF}: info {at} voorbeeld`],
    ['an (a) at-sign', `${SELF}: info (a) voorbeeld`],
    ['an at … dot spelling', `${SELF}: info at voorbeeld dot org`],
    ['a Dutch punt', `${SELF}: info at voorbeeld punt nl`],
    ['a German punkt', `${SELF}: info bei voorbeeld punkt de`],
    ['a French point', `${SELF}: info chez voorbeeld point fr`],
    ['a bare registrable host', `${SELF}, see Voorbeeld-Club.NL for more`],
    ['a handle without @ (IG)', `${SELF}, IG esn_utrecht`],
    ['a dotted handle', `${SELF}, find us as esn.utrecht`],
    ['a platform beside a name', `${SELF}, follow Jan on Instagram`],
    ['a platform abbreviation', `${SELF}, see our insta`],
    ['a short service number', `${SELF}, service line 0900-1234`],
    ['a freephone number', `${SELF}, 0800 123`],
    // (`ext. 4567` would end the quoted sentence at `ext.` - the number never reaches the quote.)
    ['an extension', `${SELF} (ext 4567)`],
    ['a French extension', `${SELF}, poste 123`],
    ['a JP extension', `${SELF}、内線123`],
    ['an en role word beside a name', `${SELF}, coordinator Maria Lopez`],
    ['an nl role word beside a name', `${SELF}, voorzitter Jan de Vries`],
    ['an es role word beside a name', `${SELF}, coordinadora María López`],
    ['a fr role word beside a name', `${SELF}, coordinatrice Marie Dupont`],
    ['a de role word beside a name', `${SELF}, Koordinatorin Anna Schmidt`],
    ['an it role word beside a name', `${SELF}, coordinatore Marco Rossi`],
    ['a pt role word beside a name', `${SELF}, coordenador João Silva`],
    ['a ja role word beside a name', `${SELF}、代表 山田`],
  ])('%s: the proposal is WITHHELD (CONTACT_SHAPED_QUOTE)', (_label, line) => {
    const r = run(page({ mainText: line }));
    expect(r.proposals).toEqual([]);
    expect(new Set(r.withheld.map((w) => w.reason))).toEqual(new Set(['CONTACT_SHAPED_QUOTE']));
    expect(JSON.stringify(r)).not.toMatch(
      /esn_utrecht|esn\.utrecht|Lopez|López|Vries|Dupont|Schmidt|Rossi|Silva|山田|Jan on/,
    );
  });

  it('ordinary self-descriptions still pass: year lists, counts and prose without contact shapes', () => {
    for (const line of [
      `${SELF}, active in 2024, 2025 and 2026.`,
      `${SELF}, with 1,200 subscribers.`,
      'Somos una asociación de estudiantes de intercambio.',
      '私たちは留学生のためのサークルです。',
    ]) {
      const r = run(page({ mainText: line }));
      expect(r.withheld, line).toEqual([]);
      expect(r.proposals.length, line).toBeGreaterThan(0);
    }
  });

  it('a social account proposal released by the INERT option may name its own platform, nothing more', () => {
    const released = runSocial(page({ mainText: 'Follow us on Instagram!' }));
    expect(released.proposals.length).toBeGreaterThan(0);
    const handle = runSocial(page({ mainText: 'Follow us on Instagram: esn_utrecht' }));
    expect(handle.proposals).toEqual([]);
    expect(new Set(handle.withheld.map((w) => w.reason))).toEqual(
      new Set(['CONTACT_SHAPED_QUOTE']),
    );
  });
});
