/**
 * `orgunit-signal-rules-v2`: the ja/es/nl packs and the script-aware
 * matcher - and the proof that `orgunit-signal-rules-v1` did not move.
 *
 * v1 is proved unchanged three ways: its engine files hash to the landed
 * bytes; a golden fixture generated from the landed v1 engine BEFORE any v2
 * code existed (never regenerated) still matches exactly; and the v2 engine,
 * which restates v1's loop, reproduces every golden result once its ja/es/nl
 * signals are removed.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  compileScriptAwarePhrase,
  containsScriptAwarePhrase,
  normaliseForScriptAwareMatching,
  tokeniseScriptAware,
} from '../../orgunits/signals/scriptAware.js';
import {
  ORGUNIT_SIGNAL_RULE_VERSION,
  scoreFetchedPageCandidate,
  scoreFrontierUrl,
} from '../../orgunits/signals/score.js';
import {
  ORGUNIT_SIGNAL_RULE_VERSION_V2,
  scoreFetchedPageCandidateV2,
  scoreFrontierUrlV2,
  signalRulesV2,
} from '../../orgunits/signals/scoreV2.js';
import { EN_RULES } from '../../orgunits/signals/packs/en.js';
import { EN_V2_EXTENSION_RULES } from '../../orgunits/signals/packs/enV2.js';
import { ES_RULES } from '../../orgunits/signals/packs/es.js';
import { FR_RULES } from '../../orgunits/signals/packs/fr.js';
import { JA_RULES } from '../../orgunits/signals/packs/ja.js';
import { NL_RULES } from '../../orgunits/signals/packs/nl.js';
import { UNIVERSAL_RULES } from '../../orgunits/signals/packs/universal.js';
import type { CandidatePageInput, FrontierUrlInput } from '../../orgunits/signals/types.js';
import type {
  MatchedSignalV2,
  SignalRuleV2,
  TrackScoreV2,
} from '../../orgunits/signals/typesV2.js';

const REPO_ROOT = resolve(__dirname, '../../..');

interface GoldenTrack {
  readonly track: 'A' | 'B';
  readonly score: number;
  readonly matchedSignals: readonly MatchedSignalV2[];
  readonly negativeSignals: readonly MatchedSignalV2[];
  readonly vetoes: readonly MatchedSignalV2[];
  readonly ownScore?: number;
  readonly inheritedContribution?: number;
}

interface Golden {
  readonly candidates: readonly {
    input: CandidatePageInput;
    output: { tracks: readonly GoldenTrack[] };
  }[];
  readonly frontier: readonly {
    input: FrontierUrlInput;
    output: { tracks: readonly GoldenTrack[] };
  }[];
}

const GOLDEN = JSON.parse(
  readFileSync(
    resolve(REPO_ROOT, 'src/test/fixtures/signals/orgunit-signal-rules-v1-golden.json'),
    'utf8',
  ),
) as Golden;

/** The v1 engine's source files, as landed at fbe6a8c. */
const V1_SOURCE_SHA256: readonly (readonly [string, string])[] = [
  [
    'src/orgunits/signals/score.ts',
    'bf0622370dadaa82c177c10bcde2cda54d2b80ad80979e6533944cd3e19f917c',
  ],
  [
    'src/orgunits/signals/types.ts',
    '7a9be5ba66265381213ff4542eff66b3b6a3c80bee812ea1e765766f0f7244b3',
  ],
  [
    'src/orgunits/signals/normalise.ts',
    '9b86b92d98c58fca0a66a44e3f84484a8daccac96e0584778337825d82eb2487',
  ],
  [
    'src/orgunits/signals/tree.ts',
    '878e561030f346869271d422c16a0bfe0809621b28107683d6cc8bc80000a942',
  ],
  [
    'src/orgunits/signals/weights.ts',
    '4c5feef4fe5f2f6b70039adf27573ff5c7ebceb2e017df8be07c9be38cdb62b0',
  ],
  [
    'src/orgunits/signals/packs/universal.ts',
    '01956c4addda542b8a95d38676cbee8845a8aaf332e41fa0870bb11ffa670ee6',
  ],
  [
    'src/orgunits/signals/packs/fr.ts',
    '11ed50629596c85d1a88e935a53c73f57772ccf818b8ccfb3ca50d8b00014bde',
  ],
  [
    'src/orgunits/signals/packs/en.ts',
    'f8f451d95ef36371bb8d2d27b6a8009b8fe5e91440907602af659dd279b8f7fe',
  ],
];

type Ruleset = 'v1' | 'v2';

function track<T extends { track: 'A' | 'B' }>(tracks: readonly T[], id: 'A' | 'B'): T {
  const found = tracks.find((t) => t.track === id);
  if (found === undefined) throw new Error(`no track ${id}`);
  return found;
}

function ids(score: Pick<TrackScoreV2, 'matchedSignals' | 'negativeSignals' | 'vetoes'>): string[] {
  return [...score.matchedSignals, ...score.negativeSignals, ...score.vetoes].map((s) => s.id);
}

function candidate(input: CandidatePageInput, ruleset: Ruleset = 'v1') {
  const result =
    ruleset === 'v1' ? scoreFetchedPageCandidate(input) : scoreFetchedPageCandidateV2(input);
  return { result, A: track(result.tracks, 'A'), B: track(result.tracks, 'B') };
}

const NEW_PACKS: ReadonlySet<string> = new Set(['ja', 'es', 'nl']);
/** The v2-only English extension shares pack `en` with v1, so it is named by rule id. */
const EN_V2_EXTENSION_IDS: ReadonlySet<string> = new Set(EN_V2_EXTENSION_RULES.map((r) => r.id));
const isV2Only = (signal: MatchedSignalV2): boolean =>
  NEW_PACKS.has(signal.pack) || (signal.pack === 'en' && EN_V2_EXTENSION_IDS.has(signal.id));
const v1Only = (signals: readonly MatchedSignalV2[]): MatchedSignalV2[] =>
  signals.filter((signal) => !isV2Only(signal));
const newPackEffect = (t: GoldenTrack): number =>
  [...t.matchedSignals].filter(isV2Only).reduce((n, s) => n + s.weight, 0) -
  [...t.negativeSignals, ...t.vetoes].filter(isV2Only).reduce((n, s) => n + s.weight, 0);

// ---------------------------------------------------------------------------
// v1 is unchanged
// ---------------------------------------------------------------------------

describe('orgunit-signal-rules-v1 is byte-identical, in source and in behaviour', () => {
  it('keeps its version string; v2 has its own', () => {
    expect(ORGUNIT_SIGNAL_RULE_VERSION).toBe('orgunit-signal-rules-v1');
    expect(ORGUNIT_SIGNAL_RULE_VERSION_V2).toBe('orgunit-signal-rules-v2');
  });

  it('every v1 engine file is byte-identical to the landed engine', () => {
    // score.ts and types.ts are additionally bound by these exact hashes in
    // the 2D-A3 K1/K2 OWNER clarification records.
    for (const [path, sha256] of V1_SOURCE_SHA256) {
      const bytes = readFileSync(resolve(REPO_ROOT, path));
      expect(createHash('sha256').update(bytes).digest('hex'), path).toBe(sha256);
    }
  });

  it('the golden fixture covers every pilot language, so "unchanged" is measured where v2 differs', () => {
    expect(GOLDEN.candidates.length).toBeGreaterThanOrEqual(15);
    expect(GOLDEN.frontier.length).toBeGreaterThanOrEqual(8);
    const urls = GOLDEN.candidates.map((entry) => entry.input.url).join(' ');
    for (const tld of ['.fr', '.edu', '.jp', '.mx', '.nl']) expect(urls).toContain(tld);
  });

  for (const [index, entry] of GOLDEN.candidates.entries()) {
    it(`candidate #${index} ${entry.input.url} scores exactly as the landed v1 engine did`, () => {
      expect(JSON.parse(JSON.stringify(scoreFetchedPageCandidate(entry.input)))).toEqual(
        entry.output,
      );
    });
  }

  for (const [index, entry] of GOLDEN.frontier.entries()) {
    it(`frontier #${index} ${entry.input.url} scores exactly as the landed v1 engine did`, () => {
      expect(JSON.parse(JSON.stringify(scoreFrontierUrl(entry.input)))).toEqual(entry.output);
    });
  }
});

describe('the v2 engine is a faithful restatement of the v1 engine', () => {
  // On the frozen v1 corpus, a v2 result with its ja/es/nl signals removed
  // must be EXACTLY the v1 result: same signals, same order, same arithmetic.
  // Any drift in the restated loop, ordering or inheritance shows up here.
  //
  // The ONE intended matcher difference on this corpus is listed, not
  // tolerated silently: v2 folds NFKC, so a full-width English title now
  // matches the en pack that v1 could not see.
  const INTENDED_MATCHER_DIFFERENCES: Readonly<Record<string, readonly string[]>> = {
    'https://www.example.edu/a/b/c/d/': ['A_INTERNATIONAL_GENERIC', 'A_INTL_OFFICE'],
  };

  it('the intended difference is exactly the NFKC-folded full-width title', () => {
    const v2 = scoreFetchedPageCandidateV2({
      url: 'https://www.example.edu/a/b/c/d/',
      title: 'ＩＮＴＥＲＮＡＴＩＯＮＡＬ ＯＦＦＩＣＥ',
    });
    expect(track(v2.tracks, 'A').matchedSignals.map((s) => s.id)).toEqual([
      'A_INTERNATIONAL_GENERIC',
      'A_INTL_OFFICE',
    ]);
  });

  const cases = [
    ...GOLDEN.candidates.map((entry) => ({
      url: entry.input.url,
      golden: entry.output,
      v2: scoreFetchedPageCandidateV2(entry.input),
      label: `candidate ${entry.input.url}`,
    })),
    ...GOLDEN.frontier.map((entry) => ({
      url: entry.input.url,
      golden: entry.output,
      v2: scoreFrontierUrlV2(entry.input),
      label: `frontier ${entry.input.url}`,
    })),
  ];
  for (const { url, golden, v2, label } of cases) {
    it(label, () => {
      expect(v2.ruleVersion).toBe(ORGUNIT_SIGNAL_RULE_VERSION_V2);
      const intended = new Set(
        label.startsWith('candidate') ? (INTENDED_MATCHER_DIFFERENCES[url] ?? []) : [],
      );
      const keep = (signals: readonly MatchedSignalV2[]) =>
        v1Only(signals).filter((signal) => !intended.has(signal.id));
      const intendedEffect = (signals: readonly MatchedSignalV2[]) =>
        signals.filter((signal) => intended.has(signal.id)).reduce((n, sg) => n + sg.weight, 0);
      for (const id of ['A', 'B'] as const) {
        const g = track(golden.tracks, id);
        const t = track(v2.tracks as readonly GoldenTrack[], id);
        expect(keep(t.matchedSignals), `${label} ${id} positives`).toEqual(g.matchedSignals);
        expect(keep(t.negativeSignals), `${label} ${id} negatives`).toEqual(g.negativeSignals);
        expect(keep(t.vetoes), `${label} ${id} vetoes`).toEqual(g.vetoes);
        expect(
          t.score - newPackEffect(t) - intendedEffect(t.matchedSignals),
          `${label} ${id} score`,
        ).toBe(g.score);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// The three pilot pages
// ---------------------------------------------------------------------------

describe('pilot pages: positive on Track B under v2, unchanged (zero) under v1', () => {
  const JAPANESE_ASSOCIATION: CandidatePageInput = {
    url: 'https://www.example-ia.or.jp/nihongo/kouryu/',
    title: '国際交流協会｜日本語教室・言語交換のご案内',
    headings: [
      { level: 1, text: '言語交換パートナー募集' },
      { level: 2, text: '外国人のための日本語教室（毎週土曜日）' },
    ],
  };
  const MEXICAN_GROUP: CandidatePageInput = {
    url: 'https://www.example.mx/comunidad/intercambio-de-idiomas/',
    title: 'Intercambio de Idiomas Guadalajara - Grupo de conversación',
    headings: [
      { level: 1, text: 'Café de idiomas cada jueves' },
      { level: 2, text: 'Club de conversación inglés-español' },
    ],
  };
  const DUTCH_TAALCAFE: CandidatePageInput = {
    url: 'https://www.example.nl/activiteiten/taalcafe/',
    title: 'Taalcafé Utrecht | Oefen Nederlands met een taalmaatje',
    headings: [{ level: 2, text: 'Elke woensdag in de bibliotheek' }],
  };

  it('Japanese language-exchange association page', () => {
    const v2 = candidate(JAPANESE_ASSOCIATION, 'v2');
    expect(v2.result.ruleVersion).toBe(ORGUNIT_SIGNAL_RULE_VERSION_V2);
    expect(v2.B.ruleVersion).toBe(ORGUNIT_SIGNAL_RULE_VERSION_V2);
    expect(v2.B.score).toBeGreaterThan(0);
    expect(ids(v2.B)).toEqual(
      expect.arrayContaining(['B_JA_LANGUAGE_EXCHANGE', 'B_JA_NIHONGO_KYOSHITSU']),
    );
    expect(v2.B.matchedSignals.every((s) => s.pack === 'ja')).toBe(true);
    // v2 is opt-in: the v1 entry points never return a v2-stamped result.

    const v1 = candidate(JAPANESE_ASSOCIATION);
    expect(v1.result.ruleVersion).toBe(ORGUNIT_SIGNAL_RULE_VERSION);
    expect(v1.B.score).toBe(0);
    expect(v1.A.score).toBe(0);
    expect(v1.B.matchedSignals).toEqual([]);
  });

  it('Mexican language-exchange group page', () => {
    const v2 = candidate(MEXICAN_GROUP, 'v2');
    expect(v2.B.score).toBeGreaterThan(0);
    expect(ids(v2.B)).toEqual(
      expect.arrayContaining([
        'B_ES_INTERCAMBIO_DE_IDIOMAS',
        'B_ES_CAFE_DE_IDIOMAS',
        'B_ES_IDIOMAS_GENERIC',
      ]),
    );
    const v1 = candidate(MEXICAN_GROUP);
    expect(v1.B.score).toBe(0);
    expect(v1.B.matchedSignals).toEqual([]);
  });

  it('Dutch taalcafe page', () => {
    const v2 = candidate(DUTCH_TAALCAFE, 'v2');
    expect(v2.B.score).toBeGreaterThan(0);
    expect(ids(v2.B)).toEqual(expect.arrayContaining(['B_NL_TAALCAFE', 'B_NL_TAALUITWISSELING']));
    const v1 = candidate(DUTCH_TAALCAFE);
    expect(v1.B.score).toBe(0);
    expect(v1.B.matchedSignals).toEqual([]);
  });

  it('the same three pages are also discoverable by the v2 frontier from their anchors', () => {
    for (const [url, anchorText] of [
      ['https://www.example-ia.or.jp/event/', '日本語教室・言語交換'],
      ['https://www.example.mx/grupo/', 'Intercambio de idiomas'],
      ['https://www.example.nl/agenda/', 'Taalcafé'],
    ] as const) {
      const v2 = track(scoreFrontierUrlV2({ url, anchorText }).tracks, 'B');
      const v1 = track(scoreFrontierUrl({ url, anchorText }).tracks, 'B');
      expect(v2.score, anchorText).toBeGreaterThan(0);
      expect(v2.ruleVersion).toBe(ORGUNIT_SIGNAL_RULE_VERSION_V2);
      expect(v1.score, anchorText).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Track A per language
// ---------------------------------------------------------------------------

describe('v2 Track A: international / exchange / mobility', () => {
  it.each([
    [
      { url: 'https://www.u-example.ac.jp/kokusai/', title: '国際交流センター' },
      'A_JA_INTL_OFFICE',
    ],
    [{ url: 'https://www.u-example.ac.jp/', title: '外国人留学生の皆さんへ' }, 'A_JA_RYUGAKUSEI'],
    [{ url: 'https://www.u-example.ac.jp/ryugaku/', title: null }, 'A_JA_ROMAJI_PATH'],
    [
      {
        url: 'https://www.u.example.mx/movilidad/',
        title: 'Coordinación de Movilidad Estudiantil',
      },
      'A_ES_MOVILIDAD',
    ],
    [
      { url: 'https://www.u.example.mx/', title: 'Oficina de Relaciones Internacionales' },
      'A_ES_RELACIONES_INTERNACIONALES',
    ],
    [
      { url: 'https://www.u.example.nl/', title: 'Internationale studenten' },
      'A_NL_INTERNATIONALE_STUDENTEN',
    ],
    [
      { url: 'https://www.u.example.nl/uitwisseling/', title: 'Uitwisselingsstudenten' },
      'A_NL_UITWISSELINGSSTUDENTEN',
    ],
  ] as const)('%o fires %s', (input, ruleId) => {
    const v2 = candidate(input, 'v2');
    expect(ids(v2.A)).toContain(ruleId);
    expect(v2.A.score).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Precision: what must NOT fire
// ---------------------------------------------------------------------------

describe('v2 precision: the substring and compound hazards are closed', () => {
  it('linguistics (言語学, 英語学, 日本語学) is not a language-teaching unit', () => {
    for (const title of ['言語学研究室', '英語学概論', '日本語学会']) {
      const v2 = candidate({ url: 'https://www.u.example.jp/', title }, 'v2');
      expect(v2.B.matchedSignals, title).toEqual([]);
    }
  });

  it('語学科目 (language subjects) is not penalised as a programme shape', () => {
    const v2 = candidate(
      { url: 'https://www.u.example.jp/', title: '語学科目の履修について' },
      'v2',
    );
    expect(v2.B.negativeSignals).toEqual([]);
  });

  it('a Japanese major/graduate-school title is a programme shape', () => {
    const v2 = candidate(
      { url: 'https://www.u.example.jp/', title: '国際交流専攻（修士課程）' },
      'v2',
    );
    expect(ids(v2.A)).toContain('NEG_JA_PROGRAMME_SHAPE');
    expect(v2.A.score).toBeLessThan(
      candidate({ url: 'https://www.u.example.jp/', title: '国際交流' }, 'v2').A.score,
    );
  });

  it('Dutch compounds: taalkunde and vertaalbureau do not fire Track B', () => {
    for (const title of ['Taalkunde', 'Vertaalbureau Amsterdam', 'Talentenprogramma']) {
      const v2 = candidate({ url: 'https://www.u.example.nl/', title }, 'v2');
      expect(v2.B.matchedSignals, title).toEqual([]);
    }
  });

  it('Latin token boundaries still hold under v2: langues never matches inside languedoc', () => {
    const v2 = candidate({ url: 'https://x.example/languedoc/', title: 'Languedoc' }, 'v2');
    expect(v2.B.matchedSignals).toEqual([]);
    expect(candidate({ url: 'https://x.example/', title: 'Idiomaster' }, 'v2').B.score).toBe(0);
  });

  it('a Spanish degree title carrying the office tokens is pushed down', () => {
    const office = candidate(
      { url: 'https://x.example/', title: 'Relaciones Internacionales' },
      'v2',
    );
    const degree = candidate(
      { url: 'https://x.example/', title: 'Licenciatura en Relaciones Internacionales' },
      'v2',
    );
    expect(ids(degree.A)).toContain('NEG_ES_PROGRAMME_SHAPE');
    expect(degree.A.score).toBeLessThan(office.A.score);
  });

  it('the es/nl research-scope vetoes zero an inherited frontier contribution', () => {
    for (const [root, child, vetoId] of [
      [
        'https://x.example/movilidad/',
        'https://x.example/movilidad/investigacion/',
        'NEG_ES_ACADEMIC_RESEARCH_SCOPE',
      ],
      [
        'https://x.example/internationaal/',
        'https://x.example/internationaal/onderzoek/',
        'NEG_NL_ACADEMIC_RESEARCH_SCOPE',
      ],
    ] as const) {
      const result = scoreFrontierUrlV2({
        url: child,
        sectionAncestors: [{ url: root, ownScore: 8, track: 'A' }],
      });
      const a = result.tracks.find((t) => t.track === 'A');
      expect(a?.vetoes.map((v) => v.id)).toContain(vetoId);
      expect(a?.inheritedContribution).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// The script-aware matcher
// ---------------------------------------------------------------------------

describe('script-aware matching (v2 only)', () => {
  it('splits at script boundaries and folds full-width / half-width forms', () => {
    expect(tokeniseScriptAware('erasmus留学 ＩＮＴＥＲＮＡＴＩＯＮＡＬ ｾﾝﾀｰ')).toEqual([
      { text: 'erasmus', cjk: false },
      { text: '留学', cjk: true },
      { text: 'international', cjk: false },
      { text: 'センター', cjk: true },
    ]);
    expect(tokeniseScriptAware('第2回・日本語教室（無料）').map((t) => t.text)).toEqual([
      '第',
      '2',
      '回',
      '日本語教室',
      '無料',
    ]);
    expect(tokeniseScriptAware('')).toEqual([]);
  });

  it('keeps ー and 々 inside their CJK run', () => {
    expect(tokeniseScriptAware('佐々木センター')).toEqual([{ text: '佐々木センター', cjk: true }]);
  });

  it('normalisation is idempotent', () => {
    for (const text of ['Taalcafé  Amsterdam', '国際交流センター', 'ＣＡＦＥ de Idiomas']) {
      const once = normaliseForScriptAwareMatching(text);
      expect(normaliseForScriptAwareMatching(once)).toBe(once);
    }
  });

  it('a CJK phrase matches as a substring of one CJK run, never across a space or a Latin run', () => {
    const phrase = compileScriptAwarePhrase('日本語教室');
    expect(phrase).toEqual({ kind: 'cjk', text: '日本語教室' });
    expect(
      containsScriptAwarePhrase(tokeniseScriptAware('外国人のための日本語教室です'), phrase),
    ).toBe(true);
    expect(containsScriptAwarePhrase(tokeniseScriptAware('日本語 教室'), phrase)).toBe(false);
    expect(containsScriptAwarePhrase(tokeniseScriptAware('日本語abc教室'), phrase)).toBe(false);
  });

  it('a Latin phrase matches a whole token even when glued to CJK text', () => {
    const phrase = compileScriptAwarePhrase('erasmus');
    expect(containsScriptAwarePhrase(tokeniseScriptAware('erasmus留学'), phrase)).toBe(true);
    expect(containsScriptAwarePhrase(tokeniseScriptAware('erasmusplus'), phrase)).toBe(false);
  });

  it('refuses a CJK phrase that is not one unbroken CJK run', () => {
    expect(() => compileScriptAwarePhrase('JICA国際')).toThrow(/one unbroken CJK run/);
    expect(() => compileScriptAwarePhrase('日本語 教室')).toThrow(/one unbroken CJK run/);
  });
});

// ---------------------------------------------------------------------------
// Pack hygiene
// ---------------------------------------------------------------------------

describe('v2 pack hygiene', () => {
  const PACKS: readonly (readonly [string, readonly SignalRuleV2[]])[] = [
    ['ja', JA_RULES],
    ['es', ES_RULES],
    ['nl', NL_RULES],
  ];

  it('v2 is exactly v1 plus the en v2 extension, ja, es and nl, in that order', () => {
    expect(signalRulesV2().map((rule) => rule.id)).toEqual(
      [
        ...UNIVERSAL_RULES,
        ...FR_RULES,
        ...EN_RULES,
        ...EN_V2_EXTENSION_RULES,
        ...JA_RULES,
        ...ES_RULES,
        ...NL_RULES,
      ].map((rule) => rule.id),
    );
  });

  it('every v2 rule id is unique', () => {
    const all = signalRulesV2().map((rule) => rule.id);
    expect(new Set(all).size).toBe(all.length);
  });

  for (const [pack, rules] of PACKS) {
    it(`${pack} carries real rules on BOTH tracks, each tagged with its own pack`, () => {
      expect(rules.length).toBeGreaterThanOrEqual(8);
      for (const rule of rules) {
        expect(rule.pack, rule.id).toBe(pack);
        expect(rule.phrases.length, rule.id).toBeGreaterThan(0);
        for (const phrase of rule.phrases) expect(phrase.trim(), rule.id).not.toBe('');
      }
      for (const t of ['A', 'B'] as const) {
        const positives = rules.filter((r) => r.kind === 'positive' && r.tracks.includes(t));
        expect(positives.length, `${pack} track ${t}`).toBeGreaterThanOrEqual(4);
      }
    });
  }

  it('no compiled phrase is declared by two rules on the same track (no silent double weight)', () => {
    const seen = new Map<string, string>();
    for (const rule of [
      ...JA_RULES,
      ...ES_RULES,
      ...NL_RULES,
      ...EN_RULES,
      ...EN_V2_EXTENSION_RULES,
      ...FR_RULES,
    ]) {
      for (const phrase of rule.phrases) {
        const compiled = JSON.stringify(compileScriptAwarePhrase(phrase));
        for (const t of rule.tracks) {
          const key = `${t}:${compiled}`;
          const previous = seen.get(key);
          expect(previous, `${rule.id} redeclares ${phrase} from ${previous}`).toBeUndefined();
          seen.set(key, rule.id);
        }
      }
    }
  });

  it('v2 scoring is deterministic', () => {
    const input: CandidatePageInput = {
      url: 'https://x.example/taalcafe/',
      title: '国際交流協会 日本語教室 / Intercambio de idiomas / Taalcafé',
      headings: [{ level: 1, text: 'International Office' }],
    };
    expect(scoreFetchedPageCandidateV2(input)).toEqual(scoreFetchedPageCandidateV2(input));
  });
});

// ---------------------------------------------------------------------------
// The en v2 extension (REL Engine integration)
// ---------------------------------------------------------------------------

describe('the en v2 extension: language-exchange formats, v2 only', () => {
  const TERMS: readonly (readonly [string, string])[] = [
    ['Language Exchange evenings', 'B_LANGUAGE_EXCHANGE'],
    ['Language Café', 'B_LANGUAGE_CAFE'],
    ['language cafe', 'B_LANGUAGE_CAFE'],
    ['Conversation Club', 'B_CONVERSATION_CLUB'],
    ['Tandem programme', 'B_TANDEM'],
  ];

  it('is four Track B positive rules, tagged en, each with one phrase', () => {
    expect(EN_V2_EXTENSION_RULES.map((r) => r.id)).toEqual([
      'B_LANGUAGE_EXCHANGE',
      'B_LANGUAGE_CAFE',
      'B_CONVERSATION_CLUB',
      'B_TANDEM',
    ]);
    for (const rule of EN_V2_EXTENSION_RULES) {
      expect(rule.pack, rule.id).toBe('en');
      expect(rule.kind, rule.id).toBe('positive');
      expect(rule.tracks, rule.id).toEqual(['B']);
      expect(rule.phrases, rule.id).toHaveLength(1);
    }
    // The v1 en pack declares none of them.
    for (const rule of EN_RULES) expect(EN_V2_EXTENSION_IDS.has(rule.id), rule.id).toBe(false);
  });

  for (const [title, id] of TERMS) {
    it(`"${title}" scores ${id} on Track B under v2, and nothing new under v1`, () => {
      const input: CandidatePageInput = { url: 'https://www.example.edu/students/', title };
      const v2 = candidate(input, 'v2');
      expect(v2.B.matchedSignals.map((s) => s.id)).toContain(id);
      expect(v2.result.ruleVersion).toBe('orgunit-signal-rules-v2');
      const v1 = candidate(input, 'v1');
      expect(ids(v1.B)).not.toContain(id);
      expect(v1.result.ruleVersion).toBe('orgunit-signal-rules-v1');
    });
  }

  it('bare "tandem" is LIGHT and the multi-word formats are MEDIUM', () => {
    const weight = (id: string) => EN_V2_EXTENSION_RULES.find((r) => r.id === id)!.weight;
    expect(weight('B_TANDEM')).toBe(3);
    for (const id of ['B_LANGUAGE_EXCHANGE', 'B_LANGUAGE_CAFE', 'B_CONVERSATION_CLUB']) {
      expect(weight(id), id).toBe(4);
    }
  });

  it('matches whole tokens only: "tandems" and "exchanged" do not fire', () => {
    const v2 = candidate(
      { url: 'https://www.example.edu/x/', title: 'Tandems and exchanged languages' },
      'v2',
    );
    expect(v2.B.matchedSignals.map((s) => s.id)).not.toContain('B_TANDEM');
    expect(v2.B.matchedSignals.map((s) => s.id)).not.toContain('B_LANGUAGE_EXCHANGE');
  });
});
