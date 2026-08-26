/**
 * FRENCH LANGUAGE PACK.
 *
 * Every phrase here is stored WITHOUT accents (`relations internationales`,
 * never `relations internationales` with a stray accent-sensitive form) -
 * `normalise.ts` strips diacritics from both the rule and the field text
 * before comparing, so the source spelling here is a matter of readability
 * only, never of matching correctness. Hyphenated URL forms
 * (`relations-internationales`) match the same two-token phrase as the
 * spaced prose form, for the same reason.
 *
 * "erasmus" is declared once, in `en.ts` - see that file's module comment.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import type { SignalRule, SignalTrack } from '../types.js';
import { SIGNAL_WEIGHT } from '../weights.js';

const TRACK_A: readonly SignalTrack[] = ['A'];
const TRACK_B: readonly SignalTrack[] = ['B'];
const ALL_FIELDS = ['urlPath', 'anchorText', 'title', 'heading'] as const;

export const FR_RULES: readonly SignalRule[] = [
  // --- Track A: international / mobilite ------------------------------------
  {
    id: 'A_FR_RELATIONS_INTERNATIONALES',
    pack: 'fr',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ALL_FIELDS,
    phrases: ['relations internationales', 'bureau des relations internationales'],
    weight: SIGNAL_WEIGHT.PHRASE_STRONG,
  },
  {
    id: 'A_FR_SERVICE_RELATIONS_INTERNATIONALES',
    pack: 'fr',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ALL_FIELDS,
    phrases: ['service des relations internationales'],
    weight: SIGNAL_WEIGHT.PHRASE_STRONG,
  },
  {
    id: 'A_FR_ETUDIANTS_INTERNATIONAUX',
    pack: 'fr',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ALL_FIELDS,
    phrases: ['etudiants internationaux'],
    weight: SIGNAL_WEIGHT.PHRASE_MEDIUM,
  },
  {
    id: 'A_FR_ETUDIANTS_ENTRANTS',
    pack: 'fr',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ALL_FIELDS,
    // "incoming students" - the French holdout used this exact compound.
    phrases: ['etudiants entrants'],
    weight: SIGNAL_WEIGHT.PHRASE_MEDIUM,
  },
  {
    id: 'A_FR_MOBILITE_INTERNATIONALE',
    pack: 'fr',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ALL_FIELDS,
    phrases: ['mobilite internationale', 'mobilite etudiante'],
    weight: SIGNAL_WEIGHT.PHRASE_MEDIUM,
  },
  {
    id: 'A_FR_ACCUEIL_INTERNATIONAL',
    pack: 'fr',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ALL_FIELDS,
    phrases: ['accueil international'],
    weight: SIGNAL_WEIGHT.PHRASE_LIGHT,
  },

  // --- Track B: centres et departements de langues --------------------------
  {
    id: 'B_FR_CENTRE_DE_LANGUES',
    pack: 'fr',
    kind: 'positive',
    tracks: TRACK_B,
    fields: ALL_FIELDS,
    phrases: ['centre de langues', 'centre des langues'],
    weight: SIGNAL_WEIGHT.PHRASE_STRONG,
  },
  {
    id: 'B_FR_DEPARTEMENT_LANGUES',
    pack: 'fr',
    kind: 'positive',
    tracks: TRACK_B,
    fields: ALL_FIELDS,
    phrases: ['departement langues', 'departement de langues', 'departement des langues'],
    weight: SIGNAL_WEIGHT.PHRASE_STRONG,
  },
  {
    id: 'B_FR_UFR_LANGUES',
    pack: 'fr',
    kind: 'positive',
    tracks: TRACK_B,
    fields: ALL_FIELDS,
    phrases: ['ufr langues', 'ufr de langues'],
    weight: SIGNAL_WEIGHT.PHRASE_MEDIUM,
  },
  {
    id: 'B_FR_FLE',
    pack: 'fr',
    kind: 'positive',
    tracks: TRACK_B,
    fields: ALL_FIELDS,
    // Francais Langue Etrangere - the standard French-as-a-foreign-language
    // abbreviation, and the full phrase it stands for.
    phrases: ['fle', 'francais langue etrangere'],
    weight: SIGNAL_WEIGHT.PHRASE_MEDIUM,
  },
  {
    id: 'B_FR_LANSAD',
    pack: 'fr',
    kind: 'positive',
    tracks: TRACK_B,
    fields: ALL_FIELDS,
    // Langues pour Specialistes d'Autres Disciplines - the standard French
    // higher-education abbreviation for non-specialist language teaching.
    phrases: ['lansad'],
    weight: SIGNAL_WEIGHT.PHRASE_MEDIUM,
  },
  {
    id: 'B_FR_CRL',
    pack: 'fr',
    kind: 'positive',
    tracks: TRACK_B,
    fields: ALL_FIELDS,
    // Centre de Ressources en Langues - a short, ambiguity-prone abbreviation,
    // deliberately given the LIGHT weight class rather than MEDIUM.
    phrases: ['crl'],
    weight: SIGNAL_WEIGHT.PHRASE_LIGHT,
  },
];
