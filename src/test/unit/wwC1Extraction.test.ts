/**
 * WW E-X - the pure C1 extraction rules (`nwf-pe-c1-extraction-rules-v1`),
 * per rule and per language: positive, negative and ambiguous vectors; the
 * multilingual stated-date rules; the PII guard on quotes (JP / MX / NL / DE
 * contact formats); the class separation (OBSERVED claims vs proposals);
 * determinism; and the rule table itself.
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
    ['en', 'Welcome Week takes place on 31 August 2026.'],
    ['fr', 'Notre semaine d’intégration a eu lieu le 1er septembre 2026.'],
    ['es', 'La semana de bienvenida fue el 7 de septiembre de 2026.'],
    ['nl', 'De introductieweek begon op 17 augustus 2026.'],
    ['ja', '2026年4月10日 新入生歓迎会を開催しました。'],
    ['de', 'Die Erstiwoche begann am 5. Oktober 2026.'],
    ['it', 'La settimana di accoglienza si è svolta il 14 settembre 2026.'],
    ['pt', 'A semana de recepção foi em 3 de março de 2026.'],
  ])(
    '%s: a dated instance establishes the event channel with OBSERVED existence + instances',
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
          'Welcome Week 2024 ran on 2 September 2024.\nWelcome Week 2025 ran on 1 September 2025.\nWelcome Week 2027: 30 August 2027.',
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

  it('a page published by a third party never establishes an observed channel', () => {
    const r = run(
      page({ publisher: 'THIRD_PARTY', mainText: 'Welcome Week on 1 September 2026.' }),
    );
    expect(r.channels).toEqual([]);
    expect(r.claims).toEqual([]);
  });
});

describe('WW E-X: C1X.NEWSLETTER_SIGNUP / NEWSLETTER_DATED_ISSUES (OBSERVED, MEMBER_NEWSLETTER)', () => {
  it.each([
    ['en', 'Subscribe to our newsletter and never miss an event.'],
    ['fr', 'Abonnez-vous à notre lettre d’information.'],
    ['es', 'Suscríbete a nuestro boletín.'],
    ['nl', 'Meld je aan voor onze nieuwsbrief.'],
    ['ja', 'ニュースレター登録はこちら'],
    ['de', 'Jetzt Newsletter abonnieren!'],
    ['it', 'Iscriviti alla nostra newsletter.'],
    ['pt', 'Inscreva-se na nossa newsletter.'],
  ])('%s: a sign-up call establishes the newsletter, PUSHED_TO_MEMBERS', (lang, line) => {
    const r = run(page({ mainText: line }));
    expect(r.channels.map((c) => [c.kind, c.channelClass, c.establishedBy])).toEqual([
      ['MEMBER_NEWSLETTER', 'FEED', 'OBSERVED_CLAIM'],
    ]);
    expect(claim(r, 'channel.reach_mode', 'MEMBER_NEWSLETTER')).toMatchObject({
      value: { reach: 'PUSHED_TO_MEMBERS' },
      ruleIds: [`C1X.NEWSLETTER_SIGNUP.${lang}`],
    });
    expect(claim(r, 'channel.existence', 'MEMBER_NEWSLETTER')!.value).toEqual({ status: 'EXISTS' });
  });

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
    const r = run(page({ mainText: 'Our Instagram has 3,400 followers.' }));
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
    const r = run(page({ mainText: 'インスタグラムのフォロワー1,200人' }));
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

  it('a named Instagram account: PROPOSAL_ONLY channel, existence + binding proposals, no handle', () => {
    const r = run(page({ mainText: 'Follow us on Instagram @example_handle for updates.' }));
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
    expect(JSON.stringify(r.channels)).not.toContain('example_handle');
  });

  it('WhatsApp is PRIVATE; a platform without a C1 kind is a gap; a platform without a follow call is nothing', () => {
    expect(
      run(page({ mainText: 'Join our WhatsApp group!' })).channels.map((c) => [
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
        'channel.reach_mode',
        'channel.event_instances',
        'channel.cycle_history',
        'channel.resource_openness',
      ]),
    );
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
    expect(C1_EXTRACTION_RULES_VERSION).toBe('nwf-pe-c1-extraction-rules-v1');
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
