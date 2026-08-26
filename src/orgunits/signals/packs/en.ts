/**
 * ENGLISH LANGUAGE PACK.
 *
 * WHY THIS PACK RUNS REGARDLESS OF AN ORGANISATION'S COUNTRY
 *
 *   The 2026-08-24 holdout's own institutions were French, and several
 *   published their strongest international-office evidence on an ENGLISH
 *   page. "French organisation -> French pack only" is exactly the inference
 *   ADR 0004 s12 forbids. score.ts runs this pack over every input alongside
 *   `fr.ts` and `universal.ts`, unconditionally - see ADR 0007 s6.
 *
 * WHY THE LIST IS SHORT
 *
 *   Reviewability. Every phrase here is either a well-known institutional
 *   English term (ADR 0004's own vocabulary) or a compound the design brief
 *   named directly. This is a v1 heuristic catalogue, not an exhaustive
 *   thesaurus - shadow validation, not a longer list, is how coverage gaps
 *   get found (weights.ts).
 *
 * A NOTE ON "erasmus"
 *
 *   Spelled identically in French and English, so it is declared exactly
 *   ONCE, here, rather than in both `en.ts` and `fr.ts` - a phrase declared in
 *   two packs would fire twice on one match and silently double its own
 *   weight.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import type { SignalRule, SignalTrack } from '../types.js';
import { SIGNAL_WEIGHT } from '../weights.js';

const TRACK_A: readonly SignalTrack[] = ['A'];
const TRACK_B: readonly SignalTrack[] = ['B'];
const ALL_FIELDS = ['urlPath', 'anchorText', 'title', 'heading'] as const;

export const EN_RULES: readonly SignalRule[] = [
  // --- Track A: international / mobility / Erasmus -------------------------
  {
    id: 'A_INTL_OFFICE',
    pack: 'en',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ALL_FIELDS,
    phrases: ['international office'],
    weight: SIGNAL_WEIGHT.PHRASE_STRONG,
  },
  {
    id: 'A_INTL_STUDENT_SERVICES',
    pack: 'en',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ALL_FIELDS,
    phrases: ['international student services'],
    weight: SIGNAL_WEIGHT.PHRASE_STRONG,
  },
  {
    id: 'A_INTL_RELATIONS_OFFICE',
    pack: 'en',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ALL_FIELDS,
    phrases: ['international relations office', 'office of international relations'],
    weight: SIGNAL_WEIGHT.PHRASE_STRONG,
  },
  {
    id: 'A_INTL_STUDENTS',
    pack: 'en',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ALL_FIELDS,
    phrases: ['international students'],
    weight: SIGNAL_WEIGHT.PHRASE_MEDIUM,
  },
  {
    id: 'A_INCOMING_STUDENTS',
    pack: 'en',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ALL_FIELDS,
    phrases: ['incoming students'],
    weight: SIGNAL_WEIGHT.PHRASE_MEDIUM,
  },
  {
    id: 'A_EXCHANGE_STUDENTS',
    pack: 'en',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ALL_FIELDS,
    phrases: ['exchange students', 'exchange programme', 'exchange program'],
    weight: SIGNAL_WEIGHT.PHRASE_MEDIUM,
  },
  {
    id: 'A_MOBILITY_OFFICE',
    pack: 'en',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ALL_FIELDS,
    phrases: ['mobility office'],
    weight: SIGNAL_WEIGHT.PHRASE_MEDIUM,
  },
  {
    id: 'A_STUDY_ABROAD',
    pack: 'en',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ALL_FIELDS,
    phrases: ['study abroad'],
    weight: SIGNAL_WEIGHT.PHRASE_LIGHT,
  },
  {
    id: 'A_WELCOME_INTERNATIONAL',
    pack: 'en',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ALL_FIELDS,
    phrases: ['welcome international', 'international welcome'],
    weight: SIGNAL_WEIGHT.PHRASE_LIGHT,
  },
  {
    id: 'A_ERASMUS',
    pack: 'en',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ALL_FIELDS,
    phrases: ['erasmus'],
    weight: SIGNAL_WEIGHT.PHRASE_LIGHT,
  },
  {
    id: 'A_INTERNATIONAL_GENERIC',
    pack: 'en',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ALL_FIELDS,
    // Deliberately the smallest positive weight: the holdout found bare
    // "international" too broad on its own to carry much signal.
    phrases: ['international'],
    weight: SIGNAL_WEIGHT.SINGLE_GENERIC,
  },
  {
    id: 'A_MOBILITY_GENERIC',
    pack: 'en',
    kind: 'positive',
    tracks: TRACK_A,
    fields: ALL_FIELDS,
    phrases: ['mobility'],
    weight: SIGNAL_WEIGHT.SINGLE_GENERIC,
  },

  // --- Track B: language centres / language-teaching units -----------------
  {
    id: 'B_LANGUAGE_CENTRE',
    pack: 'en',
    kind: 'positive',
    tracks: TRACK_B,
    fields: ALL_FIELDS,
    phrases: ['language centre', 'language center'],
    weight: SIGNAL_WEIGHT.PHRASE_STRONG,
  },
  {
    id: 'B_LANGUAGE_DEPARTMENT',
    pack: 'en',
    kind: 'positive',
    tracks: TRACK_B,
    fields: ALL_FIELDS,
    phrases: ['language department', 'languages department'],
    weight: SIGNAL_WEIGHT.PHRASE_MEDIUM,
  },
  {
    id: 'B_LANGUAGE_TEACHING',
    pack: 'en',
    kind: 'positive',
    tracks: TRACK_B,
    fields: ALL_FIELDS,
    phrases: ['language teaching'],
    weight: SIGNAL_WEIGHT.PHRASE_LIGHT,
  },
];
