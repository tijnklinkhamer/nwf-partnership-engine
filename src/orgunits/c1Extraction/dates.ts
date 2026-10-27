/**
 * WW E-X - STATED CALENDAR DATES, MULTILINGUAL (`nwf-pe-c1-stated-date-rules-v1`).
 *
 * The same discipline as the v1 export's `qualificationInput/dates.ts`
 * (`nwf-pe-stated-date-rules-v1`), which stays byte-for-byte unchanged so
 * the v1 export is unchanged: a date is read ONLY when the text states a
 * FULL calendar date - day, month AND year - in one of four closed forms:
 *
 *   ISO_YYYY_MM_DD       2026-11-15
 *   JA_YEAR_MONTH_DAY    2026年11月15日 (full-width digits folded by NFKC)
 *   DAY_MONTHNAME_YEAR   15 November 2026 · 15 novembre 2026 · 15. November 2026 ·
 *                        1er septembre 2026 · 15 de noviembre de 2026 · 1° settembre 2026 ·
 *                        15 de novembro de 2026 · 15 november 2026
 *   MONTHNAME_DAY_YEAR   November 15, 2026
 *
 * Never a bare year (`Welcome Week 2025`), never a month and year, never a
 * numeric D/M/Y or M/D/Y form (ambiguous between conventions), never a year
 * guessed for a day-and-month (`3 September`), never an impossible date.
 * Month names: English, French, Spanish, Dutch, German, Italian and
 * Portuguese, diacritic-folded. Years outside 2000-2099 are ignored.
 *
 * PURE: no socket, no database, no filesystem, no environment, no clock.
 */

export const C1_STATED_DATE_RULE_VERSION = 'nwf-pe-c1-stated-date-rules-v1';

const MONTHS: Readonly<Record<string, number>> = Object.freeze({
  // en
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  // nl
  januari: 1,
  februari: 2,
  maart: 3,
  mei: 5,
  juni: 6,
  juli: 7,
  augustus: 8,
  oktober: 10,
  // es
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
  // fr
  janvier: 1,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
  // de
  januar: 1,
  janner: 1,
  februar: 2,
  marz: 3,
  dezember: 12,
  // it
  gennaio: 1,
  febbraio: 2,
  aprile: 4,
  maggio: 5,
  giugno: 6,
  luglio: 7,
  settembre: 9,
  ottobre: 10,
  dicembre: 12,
  // pt
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  maio: 5,
  junho: 6,
  julho: 7,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
});

/** The rule table, as data. */
export const C1_STATED_DATE_RULES = Object.freeze({
  version: C1_STATED_DATE_RULE_VERSION,
  forms: ['ISO_YYYY_MM_DD', 'JA_YEAR_MONTH_DAY', 'DAY_MONTHNAME_YEAR', 'MONTHNAME_DAY_YEAR'],
  months: MONTHS,
  yearBounds: [2000, 2099] as const,
});

const pad = (n: number) => String(n).padStart(2, '0');

function calendarDate(y: number, m: number, d: number): string | null {
  const [lo, hi] = C1_STATED_DATE_RULES.yearBounds;
  if (y < lo || y > hi || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  return new Date(`${iso}T00:00:00.000Z`).toISOString().slice(0, 10) === iso ? iso : null;
}

const MONTH_NAMES = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length || (a < b ? -1 : 1))
  .join('|');

/** A day: digits, then an optional ordinal mark (`1st`, `1er`, `1.`, `1°`, and `1º`, which NFKC folds to `1o`). */
const DAY = `(\\d{1,2})(?:st|nd|rd|th|er|o|\\.|°)?`;

const PATTERNS: readonly {
  readonly re: RegExp;
  readonly ymd: (m: RegExpMatchArray) => [number, number, number];
}[] = [
  {
    re: /(?<![\d-])(\d{4})-(\d{2})-(\d{2})(?![\d-])/g,
    ymd: (m) => [Number(m[1]), Number(m[2]), Number(m[3])],
  },
  {
    re: /(?<!\d)(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g,
    ymd: (m) => [Number(m[1]), Number(m[2]), Number(m[3])],
  },
  {
    re: new RegExp(
      `(?<![\\p{L}\\d])${DAY}\\s+(?:de\\s+)?(${MONTH_NAMES})\\s+(?:de\\s+|del\\s+)?(\\d{4})(?![\\d])`,
      'gu',
    ),
    ymd: (m) => [Number(m[3]), MONTHS[m[2]!]!, Number(m[1])],
  },
  {
    re: new RegExp(
      `(?<![\\p{L}\\d])(${MONTH_NAMES})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})(?![\\d])`,
      'gu',
    ),
    ymd: (m) => [Number(m[3]), MONTHS[m[1]!]!, Number(m[2])],
  },
];

/** NFKC (full-width digits), diacritics stripped, lower-cased. */
const fold = (text: string): string =>
  text.normalize('NFKC').normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC').toLowerCase();

/** Every valid full calendar date `text` states, distinct and sorted. */
export function statedDatesC1(text: string): string[] {
  const out = new Set<string>();
  const folded = fold(text);
  for (const { re, ymd } of PATTERNS) {
    for (const m of folded.matchAll(re)) {
      const date = calendarDate(...ymd(m));
      if (date !== null) out.add(date);
    }
  }
  return [...out].sort();
}
