/**
 * SPANISH LANGUAGE PACK - `orgunit-signal-rules-v2` ONLY.
 *
 * Not part of v1: only `scoreV2.ts` imports this pack; `score.ts` (v1) never
 * does, so every v1 score is unchanged by its existence.
 *
 * Phrases are stored WITHOUT accents (`coordinacion de movilidad`,
 * `linguistico`, `espanol`) for the same reason as `fr.ts`: normalisation
 * strips diacritics from both sides before comparing, so the spelling here is
 * a matter of readability only. Latin-script phrases keep the v1
 * token-boundary rule under v2: `idiomas` never matches inside a longer word.
 *
 * The vocabulary is ordinary Mexican/Latin-American and Spanish higher-
 * education usage: `Coordinacion de Movilidad Estudiantil`, `Centro de
 * Idiomas`, `Centro de Ensenanza de Lenguas Extranjeras` (UNAM's CELE),
 * `Centro de Autoacceso`, `intercambio de idiomas`, `cafe de idiomas`. It is
 * NOT a country rule: it runs unconditionally alongside every other v2 pack
 * (ADR 0007 s6). "erasmus" stays declared once, in `en.ts`.
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

export const ES_RULES: readonly SignalRuleV2[] = [
  // --- Track A: internacional / movilidad / intercambio ---------------------
  {
    id: 'A_ES_RELACIONES_INTERNACIONALES',
    pack: 'es',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ALL_FIELDS,
    phrases: [
      'relaciones internacionales',
      'oficina de relaciones internacionales',
      'oficina internacional',
      'direccion de internacionalizacion',
    ],
    weight: SIGNAL_WEIGHT.PHRASE_STRONG,
  },
  {
    id: 'A_ES_MOVILIDAD',
    pack: 'es',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ALL_FIELDS,
    phrases: [
      'movilidad estudiantil',
      'movilidad academica',
      'movilidad internacional',
      'coordinacion de movilidad',
      'oficina de movilidad',
    ],
    weight: SIGNAL_WEIGHT.PHRASE_MEDIUM,
  },
  {
    id: 'A_ES_INTERCAMBIO_ACADEMICO',
    pack: 'es',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ALL_FIELDS,
    phrases: [
      'intercambio academico',
      'intercambio estudiantil',
      'estudiantes de intercambio',
      'programa de intercambio',
    ],
    weight: SIGNAL_WEIGHT.PHRASE_MEDIUM,
  },
  {
    id: 'A_ES_ESTUDIANTES_INTERNACIONALES',
    pack: 'es',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ALL_FIELDS,
    phrases: ['estudiantes internacionales', 'estudiantes extranjeros', 'alumnos internacionales'],
    weight: SIGNAL_WEIGHT.PHRASE_MEDIUM,
  },
  {
    id: 'A_ES_INTERNACIONALIZACION',
    pack: 'es',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ALL_FIELDS,
    phrases: ['internacionalizacion'],
    weight: SIGNAL_WEIGHT.PHRASE_LIGHT,
  },
  {
    id: 'A_ES_GENERIC',
    pack: 'es',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ALL_FIELDS,
    // Bare generic terms: the smallest positive weight, as in en.ts.
    phrases: ['internacional', 'movilidad', 'intercambio'],
    weight: SIGNAL_WEIGHT.SINGLE_GENERIC,
  },

  // --- Track B: centros de idiomas / intercambio de idiomas ----------------
  {
    id: 'B_ES_CENTRO_DE_IDIOMAS',
    pack: 'es',
    kind: 'positive',
    tracks: TRACK_B,
    fields: ALL_FIELDS,
    phrases: [
      'centro de idiomas',
      'centro de lenguas',
      'centro de lenguas extranjeras',
      'centro de ensenanza de lenguas extranjeras',
      'escuela de idiomas',
    ],
    weight: SIGNAL_WEIGHT.PHRASE_STRONG,
  },
  {
    id: 'B_ES_DEPARTAMENTO_DE_IDIOMAS',
    pack: 'es',
    kind: 'positive',
    tracks: TRACK_B,
    fields: ALL_FIELDS,
    phrases: [
      'departamento de idiomas',
      'departamento de lenguas',
      'coordinacion de idiomas',
      'centro de autoacceso',
    ],
    weight: SIGNAL_WEIGHT.PHRASE_MEDIUM,
  },
  {
    id: 'B_ES_INTERCAMBIO_DE_IDIOMAS',
    pack: 'es',
    kind: 'positive',
    tracks: TRACK_B,
    fields: ALL_FIELDS,
    phrases: [
      'intercambio de idiomas',
      'intercambio de lenguas',
      'intercambio linguistico',
      'tandem de idiomas',
    ],
    weight: SIGNAL_WEIGHT.PHRASE_MEDIUM,
  },
  {
    id: 'B_ES_CAFE_DE_IDIOMAS',
    pack: 'es',
    kind: 'positive',
    tracks: TRACK_B,
    fields: ALL_FIELDS,
    phrases: [
      'cafe de idiomas',
      'cafe idiomas',
      'cafe linguistico',
      'club de conversacion',
      'club de idiomas',
    ],
    weight: SIGNAL_WEIGHT.PHRASE_MEDIUM,
  },
  {
    id: 'B_ES_ESPANOL_PARA_EXTRANJEROS',
    pack: 'es',
    kind: 'positive',
    tracks: TRACK_B,
    fields: ALL_FIELDS,
    // Spanish as a foreign language - the counterpart of fr.ts's FLE.
    // The bare abbreviation `ELE` is deliberately absent: `ele` is an
    // ordinary Portuguese pronoun, and every v2 pack runs on every page.
    phrases: ['espanol para extranjeros', 'espanol como lengua extranjera'],
    weight: SIGNAL_WEIGHT.PHRASE_MEDIUM,
  },
  {
    id: 'B_ES_CURSOS_DE_IDIOMAS',
    pack: 'es',
    kind: 'positive',
    tracks: TRACK_B,
    fields: ALL_FIELDS,
    phrases: [
      'cursos de idiomas',
      'curso de idiomas',
      'clases de idiomas',
      'cursos de lenguas',
      'cursos de ingles',
      'clases de ingles',
    ],
    weight: SIGNAL_WEIGHT.PHRASE_LIGHT,
  },
  {
    id: 'B_ES_IDIOMAS_GENERIC',
    pack: 'es',
    kind: 'positive',
    tracks: TRACK_B,
    fields: ALL_FIELDS,
    phrases: ['idiomas'],
    weight: SIGNAL_WEIGHT.SINGLE_GENERIC,
  },

  // --- Negatives ------------------------------------------------------------
  {
    id: 'NEG_ES_PROGRAMME_SHAPE',
    pack: 'es',
    kind: 'negative',
    tracks: BOTH_TRACKS,
    // `Licenciatura en Relaciones Internacionales` is a degree programme
    // carrying the same tokens as the office - the universal rule's own
    // failure mode, in Spanish.
    fields: ['urlPath', 'title'],
    phrases: ['licenciatura', 'maestria', 'doctorado'],
    weight: SIGNAL_WEIGHT.PROGRAMME_SHAPE,
  },
  {
    id: 'NEG_ES_UTILITY',
    pack: 'es',
    kind: 'negative',
    tracks: BOTH_TRACKS,
    fields: ['urlPath'],
    phrases: ['iniciar sesion', 'noticias', 'aviso de privacidad'],
    weight: SIGNAL_WEIGHT.STRUCTURAL_LIGHT,
  },
  {
    id: 'NEG_ES_ACADEMIC_RESEARCH_SCOPE',
    pack: 'es',
    kind: 'veto',
    tracks: BOTH_TRACKS,
    // The Spanish counterpart of universal.ts's `recherche`/`research` veto.
    fields: ['urlPath'],
    phrases: ['investigacion'],
    weight: SIGNAL_WEIGHT.SCOPE_VETO,
  },
];
