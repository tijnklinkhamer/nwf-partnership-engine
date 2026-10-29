/**
 * WW ACCEPTANCE WORLD - the fictitious worldwide web the acquisition acceptance
 * and the Mac runtime full-system test run against: six organisations in NL,
 * MX, JP, BR, DE and KE (four Latin-script languages plus Japanese), a large
 * university, an ECHE duplicate, contact details on the pages that must never
 * leave the Engine, and a scripted search that answers one result set per
 * gated call. `-fict` registrable domains under real ICANN suffixes; a suffix
 * is never read as a country. No network, no model, no real organisation.
 */
import { fakeSdk, type FakeResult, type FakeSdk } from './acquisitionWiringHarness.js';
import { ALLOW_ALL, ScriptedTransport, html, response } from './relSubjectHarness.js';

/**
 * The fictitious world: one `-fict` registrable domain per organisation (dedupe is by registrable
 * domain) under real ICANN suffixes (the gateway's rule). A suffix is never read as a country.
 */
export const SITE = {
  nl: 'https://www.uitwisseling-utrecht-fict.nl/',
  mx: 'https://www.intercambio-mty-fict.mx/',
  jp: 'https://www.ryugaku-kansai-fict.jp/',
  br: 'https://www.intercambio-sp-fict.com.br/',
  de: 'https://www.sprachcafe-berlin-fict.de/',
  ke: 'https://www.language-exchange-nairobi-fict.co.ke/',
  university: 'https://www.fict-u.ac.jp/',
  echeDup: 'https://www.eche-dup-fict.jp/',
} as const;
/** Contact details printed on the pages: none may ever leave the Engine. */
export const PII = [
  'bestuur@uitwisseling-utrecht-fict.nl',
  '030 123 4567',
  '+52 81 1234 5678',
  '06-1234-5678',
  'kontakt@sprachcafe-berlin-fict.de',
  '+254 20 123 4567',
];

/** A page with headings and separate lines (the extraction reads them as units). */
export function richPage(
  lang: string,
  title: string,
  blocks: readonly ({ h2: string } | { p: string })[],
  links: readonly (readonly [string, string])[] = [],
): string {
  const body = blocks.map((b) => ('h2' in b ? `<h2>${b.h2}</h2>` : `<p>${b.p}</p>`)).join('');
  const anchors = links.map(([href, label]) => `<a href="${href}">${label}</a>`).join(' ');
  return (
    `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${title}</title></head>` +
    `<body><main><h1>${title}</h1>${body}<nav>${anchors}</nav></main></body></html>`
  );
}

/** Routes the world into `t` (a fresh scripted transport by default). */
export function worldTransport(t: ScriptedTransport = new ScriptedTransport()): ScriptedTransport {
  for (const site of Object.values(SITE)) {
    t.route(`${site}robots.txt`, response(200, ALLOW_ALL, 'text/plain'));
  }
  // NL, MX and JP keep their events (and NL its newsletter issues) on pages of their own, as
  // real sites do; BR and DE announce theirs on the home page only (no locator of its own).
  t.route(
    SITE.nl,
    html(
      richPage(
        'nl',
        'Uitwisselingsvereniging Utrecht',
        [
          { p: 'Wij zijn een vereniging voor internationale studenten. Samen Nederlands leren.' },
          { p: 'Schrijf je in voor onze nieuwsbrief.' },
          { p: 'Utrecht, Nederland' },
          { p: `Mail ons via ${PII[0]} of bel ${PII[1]}.` },
        ],
        [
          ['/agenda/', 'Agenda'],
          ['/nieuwsbrief/', 'Nieuwsbrief'],
          [SITE.br, 'Partnervereniging in São Paulo'],
        ],
      ),
    ),
  );
  t.route(
    `${SITE.nl}agenda/`,
    html(
      richPage('nl', 'Agenda', [
        { h2: 'Introductieweek 2 september 2026' },
        { h2: 'Introductieweek 3 september 2025' },
      ]),
    ),
  );
  t.route(
    `${SITE.nl}nieuwsbrief/`,
    html(
      richPage('nl', 'Nieuwsbrief', [
        { h2: 'Nieuwsbrief 1 oktober 2026' },
        { h2: 'Nieuwsbrief 1 september 2026' },
      ]),
    ),
  );
  t.route(
    SITE.mx,
    html(
      richPage(
        'es',
        'Comunidad de Intercambio Monterrey',
        [
          {
            p: 'Somos una comunidad de intercambio para estudiantes internacionales con clases de español.',
          },
          { p: 'Monterrey, México' },
          { p: `Escríbenos o llama al ${PII[2]}.` },
        ],
        [
          ['/eventos/', 'Eventos'],
          [SITE.ke, 'Our partners in Nairobi'],
        ],
      ),
    ),
  );
  t.route(
    `${SITE.mx}eventos/`,
    html(richPage('es', 'Eventos', [{ h2: 'Semana de bienvenida 1 de septiembre de 2026' }])),
  );
  t.route(
    SITE.jp,
    html(
      richPage(
        'ja',
        '関西留学生交流サークル',
        [
          { p: '留学生のための日本語教室と交流サークルです。' },
          { p: `お問い合わせ: ${PII[3]}` },
          { p: 'Osaka, Japan' },
        ],
        [
          ['/events/', 'イベント'],
          [SITE.de, 'Sprachcafé Berlin'],
        ],
      ),
    ),
  );
  t.route(
    `${SITE.jp}events/`,
    html(richPage('ja', 'イベント', [{ h2: '新入生歓迎会 2026年4月10日' }])),
  );
  t.route(
    SITE.br,
    html(
      richPage('pt', 'Associação de Intercâmbio São Paulo', [
        {
          p: 'Somos uma associação de intercâmbio para estudantes internacionais com aulas de português.',
        },
        { h2: 'Semana de boas-vindas 3 de agosto de 2026' },
        { p: 'São Paulo, Brasil' },
      ]),
    ),
  );
  t.route(
    SITE.de,
    html(
      richPage('de', 'Sprachcafé Berlin', [
        { p: 'Ein Sprachcafé für internationale Studierende, die Deutsch lernen.' },
        { h2: 'Erstiwoche 12. Oktober 2026' },
        { p: 'Berlin, Deutschland' },
        { p: `Kontakt: ${PII[4]}` },
      ]),
    ),
  );
  t.route(
    SITE.ke,
    html(
      richPage('en', 'Language Exchange Nairobi', [
        { p: 'A language exchange community for international students learning Swahili.' },
        { p: 'Nairobi, Kenya' },
        { p: `Call ${PII[5]}.` },
      ]),
    ),
  );
  t.route(
    SITE.university,
    html(richPage('en', 'Fict University International Office', [{ p: 'Exchange students.' }])),
  );
  return t;
}

/** One gated fake call per search grant: call k returns results[k] (no network, no geography). */
export function perCallFakeSdk(resultSets: readonly (readonly FakeResult[])[]): FakeSdk {
  const fakes = resultSets.map((r) => fakeSdk(r));
  let call = 0;
  return {
    query: (args) => {
      const fake = fakes[Math.min(call, fakes.length - 1)]!;
      call += 1;
      return fake.query(args);
    },
    calls: () => call,
    get decisions() {
      return fakes.flatMap((f) => f.decisions);
    },
  } as FakeSdk;
}

/** The three search grants' scripted answers (NL, MX, JP), in grant order. */
export function worldSdk(): FakeSdk {
  return perCallFakeSdk([
    [
      [SITE.nl, 'Uitwisselingsvereniging Utrecht'],
      [SITE.echeDup, 'ECHE Duplicate Institute'],
    ],
    [
      [SITE.mx, 'Comunidad de Intercambio Monterrey'],
      [SITE.university, 'Fict University International Office'],
    ],
    [[SITE.jp, '関西留学生交流サークル']],
  ]);
}

/** The country each organisation's OWN page states (the university states none). */
export const STATED_COUNTRY: Readonly<Record<string, string>> = {
  [SITE.nl]: 'NL',
  [SITE.mx]: 'MX',
  [SITE.jp]: 'JP',
  [SITE.br]: 'BR',
  [SITE.de]: 'DE',
  [SITE.ke]: 'KE',
};
