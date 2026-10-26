/**
 * DUTCH LANGUAGE PACK - `orgunit-signal-rules-v2` ONLY.
 *
 * Not part of v1: only `scoreV2.ts` imports this pack; `score.ts` (v1) never
 * does, so every v1 score is unchanged by its existence.
 *
 * WHY THE PHRASES ARE WHOLE COMPOUNDS
 *
 *   Dutch writes compounds as ONE word - `taalcafe`, `taalcursus`,
 *   `talencentrum`, `uitwisselingsstudenten` - and Latin-script phrases keep
 *   the token-boundary rule under v2, so each compound (and its common plural)
 *   is listed as its own token. A substring rule would let `taal` fire inside
 *   `taalkunde` (linguistics) and `vertaalbureau` (translation agency); the
 *   token rule cannot. Accents are stripped before comparing, so `taalcafe`
 *   matches `Taalcafé`.
 *
 * Runs unconditionally alongside every other v2 pack - an organisation's
 * country never selects it (ADR 0007 s6). "international office" and
 * "erasmus" stay declared once, in `en.ts`.
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

export const NL_RULES: readonly SignalRuleV2[] = [
  // --- Track A: internationaal / uitwisseling / mobiliteit ------------------
  {
    id: 'A_NL_INTERNATIONAAL_BUREAU',
    pack: 'nl',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ALL_FIELDS,
    phrases: [
      'internationaal bureau',
      'bureau internationale zaken',
      'afdeling internationale zaken',
      'internationale zaken',
    ],
    weight: SIGNAL_WEIGHT.PHRASE_STRONG,
  },
  {
    id: 'A_NL_INTERNATIONALE_STUDENTEN',
    pack: 'nl',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ALL_FIELDS,
    phrases: ['internationale studenten', 'buitenlandse studenten'],
    weight: SIGNAL_WEIGHT.PHRASE_MEDIUM,
  },
  {
    id: 'A_NL_UITWISSELINGSSTUDENTEN',
    pack: 'nl',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ALL_FIELDS,
    phrases: [
      'uitwisselingsstudenten',
      'uitwisselingsstudent',
      'uitwisselingsprogramma',
      'studentenuitwisseling',
    ],
    weight: SIGNAL_WEIGHT.PHRASE_MEDIUM,
  },
  {
    id: 'A_NL_UITWISSELING',
    pack: 'nl',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ALL_FIELDS,
    phrases: ['uitwisseling', 'studeren in het buitenland', 'studie in het buitenland'],
    weight: SIGNAL_WEIGHT.PHRASE_LIGHT,
  },
  {
    id: 'A_NL_GENERIC',
    pack: 'nl',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ALL_FIELDS,
    // Bare generic terms: the smallest positive weight, as in en.ts.
    phrases: ['internationaal', 'internationale', 'mobiliteit'],
    weight: SIGNAL_WEIGHT.SINGLE_GENERIC,
  },

  // --- Track B: talencentra / taalcafes / taalcursussen ---------------------
  {
    id: 'B_NL_TALENCENTRUM',
    pack: 'nl',
    kind: 'positive',
    tracks: TRACK_B,
    fields: ALL_FIELDS,
    phrases: ['talencentrum', 'taalcentrum', 'taleninstituut', 'taalinstituut', 'talenacademie'],
    weight: SIGNAL_WEIGHT.PHRASE_STRONG,
  },
  {
    id: 'B_NL_TAALCAFE',
    pack: 'nl',
    kind: 'positive',
    tracks: TRACK_B,
    fields: ALL_FIELDS,
    phrases: ['taalcafe', 'taalcafes', 'taal cafe', 'talencafe'],
    weight: SIGNAL_WEIGHT.PHRASE_MEDIUM,
  },
  {
    id: 'B_NL_TAALUITWISSELING',
    pack: 'nl',
    kind: 'positive',
    tracks: TRACK_B,
    fields: ALL_FIELDS,
    // Language exchange, language buddy (a common NL volunteer scheme),
    // language tandem.
    phrases: ['taaluitwisseling', 'taalmaatje', 'taalmaatjes', 'taaltandem'],
    weight: SIGNAL_WEIGHT.PHRASE_MEDIUM,
  },
  {
    id: 'B_NL_NT2',
    pack: 'nl',
    kind: 'positive',
    tracks: TRACK_B,
    fields: ALL_FIELDS,
    // Nederlands als tweede taal - the standard Dutch-as-a-second-language
    // label, and its abbreviation.
    phrases: ['nederlands als tweede taal', 'nt2'],
    weight: SIGNAL_WEIGHT.PHRASE_MEDIUM,
  },
  {
    id: 'B_NL_TAALCURSUS',
    pack: 'nl',
    kind: 'positive',
    tracks: TRACK_B,
    fields: ALL_FIELDS,
    phrases: [
      'taalcursus',
      'taalcursussen',
      'talencursus',
      'talencursussen',
      'taalles',
      'taallessen',
      'taalhuis',
    ],
    weight: SIGNAL_WEIGHT.PHRASE_LIGHT,
  },
  {
    id: 'B_NL_TALEN_GENERIC',
    pack: 'nl',
    kind: 'positive',
    tracks: TRACK_B,
    fields: ALL_FIELDS,
    phrases: ['talen'],
    weight: SIGNAL_WEIGHT.SINGLE_GENERIC,
  },

  // --- Negatives ------------------------------------------------------------
  {
    id: 'NEG_NL_PROGRAMME_SHAPE',
    pack: 'nl',
    kind: 'negative',
    tracks: BOTH_TRACKS,
    // Bare `opleiding` (training/programme) is deliberately absent: an
    // `NT2-opleiding` or `taalopleiding` IS a language-teaching page.
    fields: ['urlPath', 'title'],
    phrases: ['masteropleiding', 'bacheloropleiding'],
    weight: SIGNAL_WEIGHT.PROGRAMME_SHAPE,
  },
  {
    id: 'NEG_NL_UTILITY',
    pack: 'nl',
    kind: 'negative',
    tracks: BOTH_TRACKS,
    fields: ['urlPath'],
    phrases: ['inloggen', 'nieuws', 'privacyverklaring'],
    weight: SIGNAL_WEIGHT.STRUCTURAL_LIGHT,
  },
  {
    id: 'NEG_NL_ACADEMIC_RESEARCH_SCOPE',
    pack: 'nl',
    kind: 'veto',
    tracks: BOTH_TRACKS,
    // The Dutch counterpart of universal.ts's `recherche`/`research` veto.
    fields: ['urlPath'],
    phrases: ['onderzoek'],
    weight: SIGNAL_WEIGHT.SCOPE_VETO,
  },
];
