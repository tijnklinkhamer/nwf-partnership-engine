/**
 * JAPANESE LANGUAGE PACK - `orgunit-signal-rules-v2` ONLY.
 *
 * Not part of v1: only `scoreV2.ts` imports this pack; `score.ts` (v1) never
 * does, so every v1 score is unchanged by its existence.
 *
 * HOW THESE PHRASES MATCH
 *
 *   Japanese has no spaces, so a phrase written in kanji/kana here matches as
 *   a SUBSTRING inside one CJK run of the field text (`scriptAware.ts`) -
 *   `日本語教室` matches inside `国際交流協会の日本語教室`. That is precisely why the phrases below are
 *   COMPOUNDS rather than bare morphemes: a bare `語学` would also match inside
 *   `言語学` (linguistics) and `英語学` (English linguistics), which are
 *   academic disciplines, not language-teaching units - the Japanese
 *   equivalent of `langues` inside `languedoc`. Every `語学` phrase is
 *   therefore anchored by what follows it (`語学センター`, `語学講座`, ...).
 *
 *   Japanese institutional URL paths are written in romaji or English
 *   (`/kokusai/`, `/ryugaku/`), so a small set of romaji rules applies to
 *   `urlPath` only; romaji in a title is too ambiguous to score.
 *
 * Runs unconditionally alongside every other v2 pack - an organisation's
 * country never selects it (ADR 0007 s6). Weights are the shared, reviewed
 * classes in `weights.ts`, uncalibrated, exactly like `fr.ts`/`en.ts`.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import type { SignalTrack } from '../types.js';
import type { SignalRuleV2 } from '../typesV2.js';
import { SIGNAL_WEIGHT } from '../weights.js';

const TRACK_A: readonly SignalTrack[] = ['A'];
const TRACK_B: readonly SignalTrack[] = ['B'];
const BOTH_TRACKS: readonly SignalTrack[] = ['A', 'B'];
const ALL_FIELDS = ['urlPath', 'anchorText', 'title', 'heading'] as const;

export const JA_RULES: readonly SignalRuleV2[] = [
  // --- Track A: 国際交流 / 留学 (international exchange / study abroad) ------
  {
    id: 'A_JA_INTL_OFFICE',
    pack: 'ja',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ALL_FIELDS,
    // International exchange centre/division/office; international centre;
    // international-student centre; international education centre.
    phrases: [
      '国際交流センター',
      '国際交流課',
      '国際交流室',
      '国際センター',
      '留学生センター',
      '国際教育センター',
      '国際連携課',
    ],
    weight: SIGNAL_WEIGHT.PHRASE_STRONG,
  },
  {
    id: 'A_JA_INTL_ASSOCIATION',
    pack: 'ja',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ALL_FIELDS,
    // Municipal/prefectural international associations (国際交流協会,
    // 国際協会) - the community bodies that run local Japanese classes and
    // language-exchange events.
    phrases: ['国際交流協会', '国際協会'],
    weight: SIGNAL_WEIGHT.PHRASE_MEDIUM,
  },
  {
    id: 'A_JA_RYUGAKUSEI',
    pack: 'ja',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ALL_FIELDS,
    // International students (incl. 外国人留学生, 交換留学生 by substring).
    phrases: ['留学生'],
    weight: SIGNAL_WEIGHT.PHRASE_MEDIUM,
  },
  {
    id: 'A_JA_EXCHANGE_STUDY',
    pack: 'ja',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ALL_FIELDS,
    // Exchange study / student exchange / study abroad.
    phrases: ['交換留学', '学生交流', '海外留学'],
    weight: SIGNAL_WEIGHT.PHRASE_LIGHT,
  },
  {
    id: 'A_JA_KOKUSAI_KORYU',
    pack: 'ja',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ALL_FIELDS,
    // "International exchange" on its own: broad, so LIGHT.
    phrases: ['国際交流'],
    weight: SIGNAL_WEIGHT.PHRASE_LIGHT,
  },
  {
    id: 'A_JA_ROMAJI_PATH',
    pack: 'ja',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ['urlPath'],
    phrases: ['kokusai koryu', 'kokusaikoryu', 'ryugakusei', 'ryugaku'],
    weight: SIGNAL_WEIGHT.PHRASE_LIGHT,
  },
  {
    id: 'A_JA_KOKUSAI_GENERIC',
    pack: 'ja',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ['urlPath'],
    phrases: ['kokusai'],
    weight: SIGNAL_WEIGHT.SINGLE_GENERIC,
  },

  // --- Track B: 語学 / 日本語教室 / 言語交換 (language teaching and exchange) --
  {
    id: 'B_JA_LANGUAGE_CENTRE',
    pack: 'ja',
    kind: 'positive',
    tracks: TRACK_B,
    fields: ALL_FIELDS,
    phrases: [
      '語学センター',
      '言語教育センター',
      '外国語教育センター',
      '日本語教育センター',
      '日本語センター',
      '外国語センター',
    ],
    weight: SIGNAL_WEIGHT.PHRASE_STRONG,
  },
  {
    id: 'B_JA_NIHONGO_KYOSHITSU',
    pack: 'ja',
    kind: 'positive',
    tracks: TRACK_B,
    fields: ALL_FIELDS,
    // Japanese-language classes (community and campus) and Japanese schools.
    phrases: ['日本語教室', '日本語学校', '日本語講座', '日本語クラス'],
    weight: SIGNAL_WEIGHT.PHRASE_STRONG,
  },
  {
    id: 'B_JA_LANGUAGE_EXCHANGE',
    pack: 'ja',
    kind: 'positive',
    tracks: TRACK_B,
    fields: ALL_FIELDS,
    // Language exchange (incl. the katakana loanwords) and tandem learning.
    phrases: ['言語交換', 'ランゲージエクスチェンジ', 'タンデム学習', '語学交流'],
    weight: SIGNAL_WEIGHT.PHRASE_MEDIUM,
  },
  {
    id: 'B_JA_LANGUAGE_CAFE',
    pack: 'ja',
    kind: 'positive',
    tracks: TRACK_B,
    fields: ALL_FIELDS,
    phrases: ['語学カフェ', '言語カフェ', 'ランゲージカフェ', '多言語カフェ', '英語カフェ'],
    weight: SIGNAL_WEIGHT.PHRASE_MEDIUM,
  },
  {
    id: 'B_JA_LANGUAGE_CLASSES',
    pack: 'ja',
    kind: 'positive',
    tracks: TRACK_B,
    fields: ALL_FIELDS,
    // Language courses/classes/training; foreign-language courses;
    // English-conversation classes; Japanese-volunteer tutoring.
    phrases: [
      '語学講座',
      '語学教育',
      '語学研修',
      '語学学校',
      '語学クラス',
      '外国語講座',
      '英会話教室',
      '日本語ボランティア',
    ],
    weight: SIGNAL_WEIGHT.PHRASE_LIGHT,
  },
  {
    id: 'B_JA_ROMAJI_PATH',
    pack: 'ja',
    kind: 'positive',
    tracks: TRACK_B,
    fields: ['urlPath'],
    phrases: ['nihongo kyoshitsu', 'nihongokyoshitsu', 'gogaku'],
    weight: SIGNAL_WEIGHT.PHRASE_LIGHT,
  },

  // --- Negatives ------------------------------------------------------------
  {
    id: 'NEG_JA_PROGRAMME_SHAPE',
    pack: 'ja',
    kind: 'negative',
    tracks: BOTH_TRACKS,
    // Major / graduate-school shapes - the Japanese counterpart of the
    // universal `msc`/`master of` rule: `国際交流専攻` is a degree
    // programme, not the unit. Bare `学科` (department of study) is
    // deliberately ABSENT: as a substring it also fires inside `語学科目`
    // (language subjects), a page this layer should not penalise.
    fields: ['urlPath', 'title'],
    phrases: ['専攻', '研究科'],
    weight: SIGNAL_WEIGHT.PROGRAMME_SHAPE,
  },
  {
    id: 'NEG_JA_UTILITY',
    pack: 'ja',
    kind: 'negative',
    tracks: BOTH_TRACKS,
    fields: ['urlPath', 'title'],
    // Login; news/notices.
    phrases: ['ログイン', 'お知らせ一覧', 'ニュース一覧'],
    weight: SIGNAL_WEIGHT.STRUCTURAL_LIGHT,
  },
];
