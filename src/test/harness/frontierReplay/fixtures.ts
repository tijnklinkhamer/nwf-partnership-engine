/**
 * B1.1 SYNTHETIC SITES FOR THE OFFLINE v7-VERSUS-v8 FRONTIER REPLAY.
 *
 * Every site, host and page here is INVENTED. No CP-1 observation, evaluation
 * cohort, frozen corpus artifact or real institution's URL structure was
 * consulted to build them. Domains are synthetic (`synth-...`) and nothing in
 * this file is ever requested.
 *
 * RELEVANCE IS A SYNTHETIC LABEL. `relevant` marks the pages a fixture was
 * built to hide; it says nothing about real-world usefulness, and precision /
 * recall computed against it do not establish real-world performance.
 * Diverse pages are deliberately NOT labelled relevant by default, and several
 * fixtures are ADVERSARIAL to section fairness (F07, F12, F14, the F15 sweep, F17):
 * they exist to show where v8 gains nothing or loses.
 *
 * Fixtures are pure data, built deterministically by index arithmetic - no
 * randomness, no clock.
 */
import type { PageBehaviour, SyntheticLink, SyntheticSite } from './simulate.js';

type LinkSpec = readonly [href: string, text: string | null];

class SiteBuilder {
  readonly pages: Record<string, PageBehaviour> = {};
  readonly sitemap: string[] = [];

  constructor(readonly root: string) {}

  url(path: string, host?: string): string {
    const base = host === undefined ? this.root : `https://${host}/`;
    return new URL(path, base).toString();
  }

  html(url: string, links: readonly LinkSpec[] = []): this {
    const list: SyntheticLink[] = links.map(([href, text]) => ({
      href: new URL(href, url).toString(),
      text,
    }));
    this.pages[url] = { kind: 'HTML', links: list };
    return this;
  }

  set(url: string, behaviour: PageBehaviour): this {
    this.pages[url] = behaviour;
    return this;
  }

  /** Adds `count` link-free HTML pages under `section`, all listed in the sitemap. */
  noise(section: string, stem: string, count: number, host?: string): string[] {
    const urls: string[] = [];
    for (let i = 1; i <= count; i += 1) {
      const url = this.url(`/${section}/${stem}-${String(i).padStart(3, '0')}`, host);
      this.html(url);
      urls.push(url);
    }
    this.sitemap.push(...urls);
    return urls;
  }

  listed(...urls: string[]): this {
    this.sitemap.push(...urls);
    return this;
  }

  build(
    id: string,
    description: string,
    relevant: readonly string[],
    highRelevance: readonly string[],
    extra: Partial<Pick<SyntheticSite, 'disallowPrefixes' | 'outOfScope'>> = {},
  ): SyntheticSite {
    for (const url of [...relevant, ...highRelevance]) {
      if (!(url in this.pages)) throw new Error(`fixture ${id}: labelled ${url} has no page`);
    }
    return {
      id,
      description,
      root: this.root,
      sitemap: [...this.sitemap],
      pages: { ...this.pages },
      relevant,
      highRelevance,
      ...extra,
    };
  }
}

// ---------------------------------------------------------------- F01

function f01(): SyntheticSite {
  const b = new SiteBuilder('https://www.synth-univ-a.fr/');
  b.html(b.root, [
    ['/agenda/evenement-001', 'Agenda'],
    ['/bibliotheque/ressource-001', 'Bibliothèque'],
  ]);
  b.noise('agenda', 'evenement', 90);
  b.noise('bibliotheque', 'ressource', 60);
  b.noise('campus', 'batiment', 60);
  b.noise('formation', 'parcours', 90);
  const hub = b.url('/vie-etudiante/');
  const assoc = b.url('/vie-etudiante/associations');
  const intl = b.url('/international/etudiants-internationaux');
  const crl = b.url('/langues/centre-de-langues');
  const esn = b.url('/vie-etudiante/associations/esn');
  const tandem = b.url('/vie-etudiante/associations/tandem-linguistique');
  b.html(hub, [
    [assoc, 'Associations étudiantes'],
    [intl, 'Étudiants internationaux'],
    [crl, 'Centre de langues'],
  ]);
  b.html(assoc, [
    [esn, 'Erasmus Student Network'],
    [tandem, 'Tandem linguistique'],
    ['/vie-etudiante/associations/bde', 'Bureau des étudiants'],
  ]);
  b.html(intl).html(crl).html(esn).html(tandem).html(b.url('/vie-etudiante/associations/bde'));
  b.html(b.url('/vie-etudiante/logement')).html(b.url('/vie-etudiante/sport'));
  b.listed(hub, assoc, b.url('/vie-etudiante/logement'), b.url('/vie-etudiante/sport'));
  return b.build(
    'F01_ALPHA_CLUSTERED_HIDDEN_HUB',
    '300 zero-score sitemap URLs in four alphabetically early sections; the student-life hub and its association listing sit in the alphabetically last section and are the only path to the high-signal pages.',
    [hub, assoc, intl, crl, esn, tandem],
    [assoc, intl, crl],
  );
}

// ---------------------------------------------------------------- F02

function f02(): SyntheticSite {
  const b = new SiteBuilder('https://www.synth-univ-b.fr/');
  b.html(b.root);
  const sections = [
    'admission',
    'bibliotheque',
    'campus',
    'culture',
    'documentation',
    'emploi',
    'formation',
    'orientation',
    'patrimoine',
    'services',
    'sport',
    'territoire',
  ];
  for (const section of sections) b.noise(section, 'page', 50);
  // The hub is an ordinary depth-2 page, NOT its section's landing page, and
  // not the first entry of its section either.
  const hub = b.url('/services/page-003');
  const office = b.url('/relations/international-office');
  b.html(hub, [[office, 'International Office']]);
  b.html(office);
  return b.build(
    'F02_HUNDREDS_ZERO_SCORE',
    '600 zero-score URLs across 12 sections; the hub is the third entry of the 10th section and has no landing page of its own.',
    [hub, office],
    [office],
  );
}

// ---------------------------------------------------------------- F03

function f03(): SyntheticSite {
  const b = new SiteBuilder('https://www.synth-univ-c.fr/');
  const intlRoot = b.url('/international/');
  b.html(b.root, [[intlRoot, null]]);
  b.html(intlRoot);
  b.noise('actualites', 'article', 30);
  b.noise('agenda', 'evenement', 30);
  b.noise('campus', 'lieu', 20);
  const early = b.url('/campus/vie-associative');
  b.html(early, [['/campus/vie-associative/annuaire', 'Annuaire des associations']]);
  b.html(b.url('/campus/vie-associative/annuaire'));
  b.listed(early);
  b.noise('formation', 'diplome', 30);
  b.noise('recherche', 'laboratoire', 30);
  b.noise('scolarite', 'demarche', 20);
  const late = b.url('/scolarite/etudiants-etrangers');
  const welcome = b.url('/scolarite/etudiants-etrangers/accueil-international');
  b.html(late, [[welcome, 'Accueil international']]);
  b.html(welcome);
  b.listed(late);
  return b.build(
    'F03_MULTI_SECTION_ONE_HOST',
    'Six sections on one host, one weak positive page, two zero-score hubs: one in an alphabetically early section, one in a late one.',
    [early, b.url('/campus/vie-associative/annuaire'), late, welcome],
    [late, welcome],
  );
}

// ---------------------------------------------------------------- F04

function f04(): SyntheticSite {
  const domain = 'synth-univ-d.fr';
  const b = new SiteBuilder(`https://www.${domain}/`);
  b.html(b.root);
  b.noise('agenda', 'evenement', 80, `agenda.${domain}`);
  b.noise('alumni', 'portrait', 20, `alumni.${domain}`);
  b.noise('catalogue', 'notice', 60, `bu.${domain}`);
  b.noise('lieux', 'salle', 40, `campus.${domain}`);
  b.noise('saison', 'spectacle', 20, `culture.${domain}`);
  b.noise('communiques', 'communique', 20, `presse.${domain}`);
  b.noise('activites', 'activite', 20, `sport.${domain}`);
  b.noise('formation', 'parcours', 40);
  const hub = b.url('/', `vie-etudiante.${domain}`);
  const office = b.url('/international/international-office');
  b.html(hub, [[office, 'International Office']]);
  b.html(office);
  b.listed(hub);
  b.noise('associations', 'fiche', 10, `vie-etudiante.${domain}`);
  b.noise('stages', 'offre', 20, `zz-stages.${domain}`);
  return b.build(
    'F04_MULTI_HOST',
    'Ten first-party hosts under one registrable domain (two more than the host cap); the hub is the landing page of an alphabetically late subdomain.',
    [hub, office],
    [office],
  );
}

// ---------------------------------------------------------------- F05

function f05(): SyntheticSite {
  const b = new SiteBuilder('https://www.synth-univ-e.fr/');
  b.html(b.root);
  b.noise('agenda', 'evenement', 500);
  b.noise('contact', 'service', 3);
  b.noise('scolarite', 'demarche', 5);
  b.noise('services', 'service', 4);
  const hub = b.url('/services/accueil');
  const office = b.url('/international-office');
  b.html(hub, [[office, 'International Office']]);
  b.html(office);
  b.listed(hub);
  return b.build(
    'F05_NOISY_SECTION',
    'One events section contributes 500 of 513 candidates; the hub is in a 5-page services section.',
    [hub, office],
    [office],
  );
}

// ---------------------------------------------------------------- F06

function f06(): SyntheticSite {
  const b = new SiteBuilder('https://www.synth-univ-f.fr/');
  b.html(b.root);
  for (let i = 1; i <= 30; i += 1) {
    const url = b.url(`/agenda/international-week-${String(i).padStart(2, '0')}`);
    b.html(url);
    b.listed(url);
  }
  for (let i = 1; i <= 20; i += 1) {
    const url = b.url(`/formation/international-track-${String(i).padStart(2, '0')}`);
    b.html(url);
    b.listed(url);
  }
  const hub = b.url('/services/international');
  const office = b.url('/services/international/international-office');
  const crl = b.url('/langues/centre-de-langues');
  b.html(hub, [
    [office, 'International Office'],
    [crl, 'Centre de langues'],
  ]);
  b.html(office).html(crl);
  b.listed(hub);
  return b.build(
    'F06_POSITIVE_TIES',
    'Fifty-one URLs tied on the same small positive score across three sections; only the services hub links onward to the strong pages.',
    [hub, office, crl],
    [office, crl],
  );
}

// ---------------------------------------------------------------- F07

function f07(): SyntheticSite {
  const b = new SiteBuilder('https://www.synth-univ-g.fr/');
  const office = b.url('/en/international-office');
  const exchange = b.url('/students/exchange-students');
  const crl = b.url('/langues/centre-de-langues');
  const erasmus = b.url('/x/erasmus');
  b.html(b.root, [
    [office, 'International Office'],
    [exchange, 'Exchange students'],
    [crl, 'Centre de langues'],
    [erasmus, null],
  ]);
  b.html(office).html(exchange).html(crl).html(erasmus);
  for (const section of ['agenda', 'bibliotheque', 'campus', 'formation']) {
    b.noise(section, 'page', 50);
  }
  return b.build(
    'F07_UNEQUAL_SCORES',
    'Four strongly positive pages linked from the root against 200 zero-score sitemap URLs. ADVERSARIAL: strict score priority decides everything that matters; fairness should change nothing material.',
    [office, exchange, crl, erasmus],
    [office, exchange, crl],
  );
}

// ---------------------------------------------------------------- F08

function f08(trackBCount: number, id: string): SyntheticSite {
  const b = new SiteBuilder(`https://www.synth-univ-${trackBCount === 12 ? 'h' : 'i'}.fr/`);
  const links: LinkSpec[] = [];
  const trackB: string[] = [];
  for (let i = 1; i <= 30; i += 1) {
    const url = b.url(`/international/mobilite-${String(i).padStart(2, '0')}`);
    b.html(url);
    links.push([url, 'Mobilité internationale']);
  }
  const bSections = ['crl', 'lansad', 'langues'] as const;
  for (let i = 0; i < trackBCount; i += 1) {
    const section = bSections[i % bSections.length]!;
    const url = b.url(`/${section}/centre-de-langues-${String(i + 1).padStart(2, '0')}`);
    b.html(url);
    links.push([url, 'Centre de langues']);
    trackB.push(url);
  }
  b.html(b.root, links);
  b.noise('agenda', 'evenement', 40);
  return b.build(
    id,
    `30 viable Track A links and ${trackBCount} tied viable Track B links spread over three sections; the Track B floor must allocate exactly as v7 did.`,
    trackB,
    trackB,
  );
}

// ---------------------------------------------------------------- F09

function f09(): SyntheticSite {
  const b = new SiteBuilder('https://www.synth-univ-j.fr/');
  b.html(b.root, [
    ['/en/', 'English'],
    ['/fr/', 'Français'],
  ]);
  b.html(b.url('/en/')).html(b.url('/fr/'));
  b.noise('en/events', 'event', 60);
  b.noise('en/library', 'collection', 40);
  b.noise('fr/agenda', 'evenement', 60);
  b.noise('fr/bibliotheque', 'collection', 40);
  const frHub = b.url('/fr/vie-etudiante/');
  const enHub = b.url('/en/student-life/');
  const office = b.url('/en/international-office');
  const crl = b.url('/fr/langues/centre-de-langues');
  b.html(frHub, [[crl, 'Centre de langues']]);
  b.html(enHub, [[office, 'International Office']]);
  b.html(office).html(crl);
  b.listed(frHub, enHub);
  return b.build(
    'F09_LOCALE_PREFIX',
    'Every URL under a /en/ or /fr/ prefix; without locale handling every page would fall in one of two sections.',
    [frHub, enHub, office, crl],
    [office, crl],
  );
}

// ---------------------------------------------------------------- F10

function f10(lang: 'nl' | 'de' | 'es'): SyntheticSite {
  const spec = {
    nl: {
      domain: 'synth-uni-k.nl',
      noise: [
        ['agenda', 'evenement'],
        ['bibliotheek', 'collectie'],
        ['onderwijs', 'opleiding'],
        ['onderzoek', 'project'],
      ],
      hub: '/studentenleven/verenigingen',
      native: [
        '/studentenleven/verenigingen/internationale-studentenvereniging',
        'Internationale studentenvereniging',
      ],
      english: ['/en/international-office', 'International Office'],
    },
    de: {
      domain: 'synth-uni-l.de',
      noise: [
        ['aktuelles', 'meldung'],
        ['bibliothek', 'bestand'],
        ['forschung', 'projekt'],
        ['lehre', 'modul'],
      ],
      hub: '/studium/studentisches-leben',
      native: ['/studium/akademisches-auslandsamt', 'Akademisches Auslandsamt'],
      english: ['/en/language-centre', 'Language Centre'],
    },
    es: {
      domain: 'synth-uni-m.es',
      noise: [
        ['agenda', 'evento'],
        ['biblioteca', 'fondo'],
        ['estudios', 'grado'],
        ['investigacion', 'grupo'],
      ],
      hub: '/vida-universitaria/asociaciones',
      native: ['/vida-universitaria/oficina-de-movilidad', 'Oficina de movilidad'],
      english: ['/en/incoming-students', 'Incoming students'],
    },
  }[lang];
  const b = new SiteBuilder(`https://www.${spec.domain}/`);
  b.html(b.root);
  for (const [section, stem] of spec.noise) b.noise(section!, stem!, 60);
  const hub = b.url(spec.hub);
  const native = b.url(spec.native[0]!);
  const english = b.url(spec.english[0]!);
  b.html(hub, [
    [native, spec.native[1]!],
    [english, spec.english[1]!],
  ]);
  b.html(native).html(english);
  b.listed(hub);
  return b.build(
    `F10_${lang.toUpperCase()}_NATIVE_PATHS`,
    `A ${lang} site whose hub and native-language target match no current signal term (B1.2 territory); only its English target scores.`,
    [hub, native, english],
    [native, english],
  );
}

// ---------------------------------------------------------------- F11

function f11(): SyntheticSite {
  const b = new SiteBuilder('https://www.synth-univ-n.fr/');
  b.html(b.root, [
    ['/vie-etudiante', 'Vie étudiante'],
    ['/ancien-international', 'International'],
    ['/boucle-a', 'Boucle'],
  ]);
  b.noise('agenda', 'evenement', 60);
  b.noise('bibliotheque', 'ressource', 40);
  // duplicate sitemap entries, case and encoding variants of one section
  b.listed(b.url('/agenda/evenement-001'), b.url('/agenda/evenement-002'));
  const variants = [
    'https://www.synth-univ-n.fr/Vie-Etudiante/plan',
    'https://www.synth-univ-n.fr/vie-%C3%A9tudiante/plan',
    'https://www.synth-univ-n.fr/vie-étudiante/plan',
  ];
  for (const url of variants) b.html(url);
  b.listed(...variants);
  // redirect chains: one to a hub, one three hops long, one loop
  const hub = b.url('/vie-etudiante/');
  const crl = b.url('/langues/centre-de-langues');
  b.set(b.url('/vie-etudiante'), { kind: 'REDIRECT', to: hub });
  b.html(hub, [[crl, 'Centre de langues']]);
  b.html(crl);
  b.set(b.url('/ancien-international'), { kind: 'REDIRECT', to: '/international-v2' });
  b.set(b.url('/international-v2'), { kind: 'REDIRECT', to: '/international-v3' });
  const intl = b.url('/international-v3');
  b.html(intl);
  b.set(b.url('/boucle-a'), { kind: 'REDIRECT', to: '/boucle-b' });
  b.set(b.url('/boucle-b'), { kind: 'REDIRECT', to: '/boucle-a' });
  return b.build(
    'F11_DUPLICATES_REDIRECTS',
    'Duplicate sitemap entries, case/percent-encoding variants of one section, a redirect to a hub, a three-hop chain and a two-URL redirect loop.',
    [hub, crl, intl],
    [crl],
  );
}

// ---------------------------------------------------------------- F12

function f12(): SyntheticSite {
  const b = new SiteBuilder('https://www.synth-ecole-langues.fr/');
  const pages = [
    '/cours/anglais',
    '/cours/espagnol',
    '/cours/allemand',
    '/cours/fle',
    '/ecole/equipe',
    '/ecole/tarifs',
    '/ecole/contact',
    '/etudiants/temoignages',
    '/etudiants/partenaires',
    '/inscription',
  ];
  b.html(
    b.root,
    pages.map((p) => [p, null] as const),
  );
  for (const p of pages) b.html(b.url(p));
  b.listed(...pages.map((p) => b.url(p)));
  return b.build(
    'F12_SMALL_SPECIALIST',
    'An eleven-page specialist language school. ADVERSARIAL: the budget never binds, so ordering cannot matter.',
    [b.url('/cours/fle'), b.url('/etudiants/partenaires')],
    [b.url('/etudiants/partenaires')],
  );
}

// ---------------------------------------------------------------- F13

function f13(): SyntheticSite {
  const domain = 'synth-univ-o.fr';
  const b = new SiteBuilder(`https://www.${domain}/`);
  const intl = b.url('/international/');
  b.html(b.root, [[intl, null]]);
  b.html(intl);
  const sections = [
    'admission',
    'agenda',
    'alumni',
    'bibliotheque',
    'campus',
    'carrieres',
    'culture',
    'documentation',
    'droit',
    'economie',
    'entreprises',
    'formation',
    'gestion',
    'histoire',
    'informatique',
    'lettres',
    'medecine',
    'orientation',
    'patrimoine',
    'pharmacie',
    'sante',
    'sciences',
    'scolarite',
    'sport',
    'universite',
  ];
  for (const [i, section] of sections.entries()) b.noise(section, 'page', 80 + (i % 5) * 10);
  b.noise('catalogue', 'notice', 150, `bu.${domain}`);
  b.noise('evenements', 'evenement', 100, `agenda.${domain}`);
  const hubs = [
    b.url('/campus/vie-etudiante'),
    b.url('/scolarite/etudiants-etrangers'),
    b.url('/', `associations.${domain}`),
  ];
  const office = b.url('/international/international-office');
  const crl = b.url('/langues/centre-de-langues');
  const esn = b.url('/annuaire/esn', `associations.${domain}`);
  b.html(hubs[0]!, [[crl, 'Centre de langues']]);
  b.html(hubs[1]!, [[office, 'International Office']]);
  b.html(hubs[2]!, [[esn, 'Erasmus Student Network']]);
  b.html(office).html(crl).html(esn);
  b.listed(...hubs);
  return b.build(
    'F13_LARGE_UNIVERSITY',
    'A ~2,700-URL general university: 25 sections on the main host, two large subdomains, three zero-score hubs in different places.',
    [...hubs, office, crl, esn],
    [office, crl, esn],
  );
}

// ---------------------------------------------------------------- F14

function f14(): SyntheticSite {
  const b = new SiteBuilder('https://www.synth-univ-p.fr/');
  b.html(b.root);
  for (const section of ['agenda', 'bibliotheque', 'campus', 'formation']) {
    b.noise(section, 'page', 50);
  }
  return b.build(
    'F14_NO_RELEVANT',
    '200 zero-score pages and nothing labelled relevant: only budget and determinism invariants are meaningful here.',
    [],
    [],
  );
}

// ---------------------------------------------------------------- F15

/**
 * The concentrated section's name sets its alphabetical rank among nine
 * sections; every other byte of the site is the same. Rank 1 and rank 9 are
 * the two extremes (F15A / F15B); the sweep covers every rank in between, so
 * v7's alphabetical luck and v8's placement-invariance are both measured
 * rather than asserted.
 */
const F15_PLACEMENTS: readonly (readonly [id: string, section: string, host: string])[] = [
  ['F15A_CONCENTRATED_FIRST', 'associations', 'q'],
  ['F15_RANK2', 'bureau-associations', 'q2'],
  ['F15_RANK3', 'clubs', 'q3'],
  ['F15_RANK4', 'engagement', 'q4'],
  ['F15_RANK5', 'mouvements', 'q5'],
  ['F15_RANK6', 'participation', 'q6'],
  ['F15_RANK7', 'reseaux', 'q7'],
  ['F15_RANK8', 'solidarite', 'q8'],
  ['F15B_CONCENTRATED_LAST', 'vie-associative', 'r'],
];

function f15(id: string, section: string, host: string): SyntheticSite {
  const b = new SiteBuilder(`https://www.synth-univ-${host}.fr/`);
  b.html(b.root);
  const landing = b.url(`/${section}/`);
  b.html(landing);
  b.listed(landing);
  const members = b.noise(section, 'association', 25);
  for (const other of [
    'bibliotheque',
    'campus',
    'culture',
    'formation',
    'orientation',
    'patrimoine',
    'scolarite',
    'sport',
  ]) {
    b.noise(other, 'page', 25);
  }
  return b.build(
    id,
    `ADVERSARIAL: 26 relevant association pages concentrated in ONE zero-score section ("${section}"), placed at one alphabetical rank among nine. v7 can reach many of them only when the section happens to sort first or second; round-robin reaches about one ninth of its turns wherever it sorts.`,
    [landing, ...members],
    [landing],
  );
}

// ---------------------------------------------------------------- F16

function f16(): SyntheticSite {
  const domain = 'synth-univ-s.fr';
  const b = new SiteBuilder(`https://www.${domain}/`);
  b.html(b.root);
  b.noise('agenda', 'evenement', 60);
  b.noise('formation', 'parcours', 60);
  // A flaky subdomain: every page times out, so its circuit opens after 3.
  for (let i = 1; i <= 20; i += 1) {
    const url = b.url(`/offres/offre-${String(i).padStart(3, '0')}`, `carrieres.${domain}`);
    b.set(url, { kind: 'TIMEOUT' });
    b.listed(url);
  }
  const hub = b.url('/vie-etudiante/');
  const section = b.url('/relations-internationales/');
  const children = ['accueil', 'partenaires', 'logement', 'cours-de-francais'].map((p) =>
    b.url(`/relations-internationales/${p}`),
  );
  b.html(hub, [[section, 'Relations internationales']]);
  b.html(
    section,
    children.map((c) => [c, null] as const),
  );
  for (const c of children) b.html(c);
  b.listed(hub);
  return b.build(
    'F16_CHANGING_ELIGIBILITY',
    'A hub reveals a strong section root whose children are then admitted with inherited scores; meanwhile a timing-out subdomain opens its circuit and its remaining entries become ineligible.',
    [hub, section, ...children],
    [section],
  );
}

// ---------------------------------------------------------------- F17

function f17(): SyntheticSite {
  const b = new SiteBuilder('https://www.synth-univ-t.fr/');
  b.html(b.root);
  b.noise('agenda', 'evenement', 12);
  b.noise('campus', 'lieu', 11);
  const hub = b.url('/services/accueil');
  b.html(hub);
  b.listed(hub);
  b.noise('services', 'service', 10);
  return b.build(
    'F17_EXACT_BUDGET',
    'Exactly 34 frontier URLs: with the root, exactly 35 page attempts are possible, so the page budget and the frontier run out together.',
    [hub],
    [hub],
  );
}

// ---------------------------------------------------------------- F18

function f18(): SyntheticSite {
  const b = new SiteBuilder('https://www.synth-univ-u.fr/');
  b.html(b.root);
  b.noise('agenda', 'evenement', 80);
  b.noise('formation', 'parcours', 40);
  const hub = b.url('/vie-etudiante/associations');
  const offDomain = [
    'https://www.synth-esn-section.org/',
    'https://bde-synth-univ-u.fr/',
    'https://www.synth-univ-u.com/international',
  ];
  b.html(hub, [
    [offDomain[0]!, 'Erasmus Student Network'],
    [offDomain[1]!, 'Bureau des étudiants'],
    [offDomain[2]!, 'International Office'],
  ]);
  for (const url of offDomain) b.html(url);
  b.listed(hub);
  return b.build(
    'F18_OFF_DOMAIN_ASSOCIATION',
    'A hub links to association and office sites on OTHER registrable domains; they must never be discovered, scored or requested under either policy.',
    [hub],
    [hub],
    { outOfScope: offDomain },
  );
}

// ---------------------------------------------------------------- H1

/**
 * KNOWN v8 LIMITATION H1 - THE HOST CAP SPENT ON NOISE. Deliberately NOT part
 * of `allFixtures()`: that set's v7 golden sequences were captured before the
 * v8 edit and keep their own provenance, and its G4 gate covers the coverage
 * fixtures. H1 is pinned on its own, with its own golden v7 sequence, in
 * `orgunitFrontierReplay.test.ts` ("KNOWN LIMITATION H1").
 *
 * One primary host (`www.`) with 15 zero-score sitemap URLs; eight
 * zero-score subdomains with 10 sitemap URLs each; and a POSITIVE target (an
 * "International Office" link, Track A 12) on a TENTH host that is listed
 * nowhere and is revealed only by an anchor on the third `/accueil/` page.
 * With the 8-host cap, whichever policy has not yet admitted the tenth host
 * when it learns of the target can never fetch it.
 */
export function h1HostCapLimitation(): SyntheticSite {
  const domain = 'synth-hostcap.fr';
  const b = new SiteBuilder(`https://www.${domain}/`);
  b.html(b.root);
  b.noise('accueil', 'page', 5);
  b.noise('formation', 'page', 10);
  for (const label of [
    'x-agenda',
    'x-alumni',
    'x-bu',
    'x-campus',
    'x-culture',
    'x-presse',
    'x-sport',
    'x-stages',
  ]) {
    b.noise('s', 'page', 10, `${label}.${domain}`);
  }
  const hub = b.url('/accueil/page-003');
  const office = b.url('/international-office', `international.${domain}`);
  b.html(hub, [[office, 'International Office']]);
  b.html(office);
  return b.build(
    'H1_HOST_CAP_SPENT_ON_NOISE',
    'KNOWN v8 LIMITATION: eight zero-score subdomains compete with the primary host; a positive target on a tenth host is revealed only by a link on the third /accueil/ page. v8 round-robin admits seven noise subdomains before reaching that page, so the 8-host cap permanently excludes the target; v7 reaches it while still on the primary host.',
    [hub, office],
    [office],
  );
}

/** Every fixture, in a fixed order. */
export function allFixtures(): SyntheticSite[] {
  return [
    f01(),
    f02(),
    f03(),
    f04(),
    f05(),
    f06(),
    f07(),
    f08(12, 'F08A_TRACK_B_FLOOR'),
    f08(3, 'F08B_TRACK_B_SCARCE'),
    f09(),
    f10('nl'),
    f10('de'),
    f10('es'),
    f11(),
    f12(),
    f13(),
    f14(),
    ...F15_PLACEMENTS.map(([id, section, host]) => f15(id, section, host)),
    f16(),
    f17(),
    f18(),
  ];
}
