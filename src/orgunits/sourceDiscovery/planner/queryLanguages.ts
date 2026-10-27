/**
 * WW E-SD - WHICH LANGUAGES A PLAN WRITES ITS QUERIES IN, PER GEOGRAPHY.
 *
 * QUERY LOCALISATION ONLY. This table decides the language of a SEARCH
 * QUERY and nothing else. It is never an organisation attribute, never
 * written onto a nomination, never a score or a weight, and never evidence of
 * what language any organisation uses. A geography absent from both tables
 * below gets English queries (plus any languages the request names
 * explicitly) - "no template language" is never a reason to search less.
 * There is no list of preferred or pilot geographies anywhere in the planner.
 *
 * SOURCES (cited).
 *   PRIMARY  - the likely language of each territory under Unicode CLDR 48
 *              likelySubtags (`new Intl.Locale('und-<CC>').maximize()` on the
 *              ICU 78.3 of Node v24.18.0), GENERATED ONCE on 2026-10-27 and
 *              frozen here, restricted to the template languages.
 *   ADDITIONAL - further official (or constitutionally designated working)
 *              languages of multilingual territories, among the template
 *              languages only, reviewed by hand on 2026-10-27 from each
 *              state's constitutional language provision. Not re-verified
 *              against a live source in this package (no network): ADR 0028
 *              s7 lists it as OPEN for review.
 *
 * English is always appended last, so every plan can be read by a reviewer
 * and every geography is searched in at least one language.
 *
 * PURE. No socket, no database, no filesystem, no environment, no clock.
 */
import type { QueryTemplateLanguage } from './templates.js';

export const QUERY_LANGUAGE_TABLE_VERSION = 'nwf-discovery-query-languages-v1';

/** CLDR 48 likelySubtags territory -> language, where that language has templates. */
// prettier-ignore
const PRIMARY: Readonly<Record<Exclude<QueryTemplateLanguage, 'en'>, readonly string[]>> = {
  fr: ['BF', 'BJ', 'BL', 'CD', 'CG', 'CI', 'CM', 'DJ', 'FR', 'GA', 'GF', 'GN', 'GP', 'LU',
       'MC', 'MF', 'MQ', 'MU', 'NC', 'PF', 'PM', 'RE', 'SC', 'TF', 'TG', 'WF', 'YT'],
  es: ['AR', 'BO', 'CL', 'CO', 'CR', 'CU', 'DO', 'EC', 'ES', 'GQ', 'GT', 'HN', 'MX', 'NI',
       'PA', 'PE', 'PR', 'SV', 'UY', 'VE'],
  nl: ['AW', 'BE', 'NL', 'SR'],
  ja: ['JP'],
  de: ['AT', 'CH', 'DE', 'LI'],
  it: ['IT', 'SM', 'VA'],
  pt: ['AO', 'BR', 'CV', 'GW', 'MZ', 'PT', 'ST', 'TL'],
};

/** Further official / working languages of multilingual territories (hand-reviewed). */
const ADDITIONAL: Readonly<Record<string, readonly QueryTemplateLanguage[]>> = {
  BE: ['fr', 'de'],
  BI: ['fr'],
  BQ: ['nl'],
  CA: ['fr'],
  CF: ['fr'],
  CH: ['fr', 'it'],
  CW: ['nl'],
  GQ: ['fr', 'pt'],
  HT: ['fr'],
  KM: ['fr'],
  LU: ['de'],
  MG: ['fr'],
  ML: ['fr'],
  MO: ['pt'],
  NE: ['fr'],
  PY: ['es'],
  RW: ['fr'],
  SN: ['fr'],
  SX: ['nl'],
  TD: ['fr'],
  VU: ['fr'],
};

const PRIMARY_BY_GEOGRAPHY: ReadonlyMap<string, QueryTemplateLanguage> = new Map(
  (Object.entries(PRIMARY) as [QueryTemplateLanguage, readonly string[]][]).flatMap(
    ([language, codes]) => codes.map((code): [string, QueryTemplateLanguage] => [code, language]),
  ),
);

/**
 * The table languages for ONE geography, local first, English last. Explicit
 * request languages are merged by the planner, never here.
 */
export function tableQueryLanguagesFor(geography: string): readonly QueryTemplateLanguage[] {
  const out: QueryTemplateLanguage[] = [];
  const primary = PRIMARY_BY_GEOGRAPHY.get(geography);
  if (primary !== undefined) out.push(primary);
  for (const language of ADDITIONAL[geography] ?? []) {
    if (!out.includes(language)) out.push(language);
  }
  return out;
}
