/**
 * ENGLISH PACK - v2 EXTENSION (`orgunit-signal-rules-v2` only).
 *
 * WHY AN EXTENSION RATHER THAN AN EDIT TO `en.ts`
 *
 *   `en.ts` is shared: v1 (`score.ts`) and v2 (`scoreV2.ts`) both compose
 *   `EN_RULES`, and v1 is pinned by persisted runs, frozen classifier
 *   configurations and OWNER records bound by bytes. Adding a phrase there
 *   would change every v1 score without changing the v1 version string. So
 *   the new English Track B terms live here, and only `scoreV2.ts` imports
 *   this file; `score.ts` never does (phase2b firewall).
 *
 * WHAT IT ADDS
 *
 *   Language-exchange formats that NWF's distribution organisations run
 *   under English names - the Track B counterparts of `nl.ts`'s
 *   `taalcafe`/`taaluitwisseling` and `es.ts`'s `intercambio`/`cafe de
 *   idiomas`. `language cafe` also matches "language café": accents are
 *   stripped before comparing, so one phrase covers both spellings (listing
 *   both would declare one compiled phrase twice). Bare `tandem` is broad
 *   (a tandem bicycle, a tandem degree), so it is LIGHT; the multi-word
 *   formats are MEDIUM, below the STRONG unit names (`language centre`).
 *   A Spanish `tandem de idiomas` heading fires both `es.ts`'s exchange rule
 *   and `B_TANDEM`: two different reviewed rules, so both are reported, and
 *   the LIGHT weight keeps that overlap small.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import type { SignalTrack } from '../types.js';
import type { SignalRuleV2 } from '../typesV2.js';
import { SIGNAL_WEIGHT } from '../weights.js';

const TRACK_B: readonly SignalTrack[] = ['B'];
const ALL_FIELDS = ['urlPath', 'anchorText', 'title', 'heading'] as const;

export const EN_V2_EXTENSION_RULES: readonly SignalRuleV2[] = [
  {
    id: 'B_LANGUAGE_EXCHANGE',
    pack: 'en',
    kind: 'positive',
    tracks: TRACK_B,
    fields: ALL_FIELDS,
    phrases: ['language exchange'],
    weight: SIGNAL_WEIGHT.PHRASE_MEDIUM,
  },
  {
    id: 'B_LANGUAGE_CAFE',
    pack: 'en',
    kind: 'positive',
    tracks: TRACK_B,
    fields: ALL_FIELDS,
    phrases: ['language cafe'],
    weight: SIGNAL_WEIGHT.PHRASE_MEDIUM,
  },
  {
    id: 'B_CONVERSATION_CLUB',
    pack: 'en',
    kind: 'positive',
    tracks: TRACK_B,
    fields: ALL_FIELDS,
    phrases: ['conversation club'],
    weight: SIGNAL_WEIGHT.PHRASE_MEDIUM,
  },
  {
    id: 'B_TANDEM',
    pack: 'en',
    kind: 'positive',
    tracks: TRACK_B,
    fields: ALL_FIELDS,
    phrases: ['tandem'],
    weight: SIGNAL_WEIGHT.PHRASE_LIGHT,
  },
];
