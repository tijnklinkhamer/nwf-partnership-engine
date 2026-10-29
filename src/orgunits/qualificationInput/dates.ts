/**
 * REL P1 - STATED CALENDAR DATES IN CAPTURED PAGE TEXT
 * (`nwf-pe-stated-date-rules-v1`).
 *
 * The one page-text reading the qualification-input export makes, and it is
 * an OBSERVATION of what the capture states, not an interpretation: a FULL
 * calendar date (day, month AND year) written on the page in one of four
 * closed forms. No term near the date is read, no event, publication or
 * purpose is inferred, and nothing is guessed:
 *
 *   ISO_YYYY_MM_DD       2026-11-15
 *   JA_YEAR_MONTH_DAY    2026年11月15日 (full-width digits folded by NFKC)
 *   DAY_MONTHNAME_YEAR   15 November 2026 · 15 de noviembre de 2026 · 15 november 2026
 *   MONTHNAME_DAY_YEAR   November 15, 2026
 *
 * Never a bare year (`© 2026`), never a month and year, never a numeric
 * D/M/Y or M/D/Y form (ambiguous between conventions), never an impossible
 * date. Month names: English, Dutch and Spanish, diacritic-folded. Years
 * outside 2000-2099 are ignored.
 *
 * The export uses it for exactly one claim: `channel.static_currency`
 * CURRENT_OR_UPCOMING_YEAR when a capture states a date in its own capture
 * year or the next. A page that states no such date yields NO claim - never
 * NO_MARKER and never OUTDATED, which would be readings of an absence.
 *
 * PURE: no socket, no database, no filesystem, no environment, no clock.
 */

export const STATED_DATE_RULE_VERSION = 'nwf-pe-stated-date-rules-v1';

const MONTHS: Readonly<Record<string, number>> = Object.freeze({
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
  januari: 1,
  februari: 2,
  maart: 3,
  mei: 5,
  juni: 6,
  juli: 7,
  augustus: 8,
  oktober: 10,
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
});

/** The rule table, as data. */
export const STATED_DATE_RULES = Object.freeze({
  version: STATED_DATE_RULE_VERSION,
  forms: ['ISO_YYYY_MM_DD', 'JA_YEAR_MONTH_DAY', 'DAY_MONTHNAME_YEAR', 'MONTHNAME_DAY_YEAR'],
  months: MONTHS,
  yearBounds: [2000, 2099] as const,
});

const pad = (n: number) => String(n).padStart(2, '0');

function calendarDate(y: number, m: number, d: number): string | null {
  const [lo, hi] = STATED_DATE_RULES.yearBounds;
  if (y < lo || y > hi || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  return new Date(`${iso}T00:00:00.000Z`).toISOString().slice(0, 10) === iso ? iso : null;
}

const MONTH_NAMES = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length || (a < b ? -1 : 1))
  .join('|');

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
      `(?<![\\p{L}\\d])(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:de\\s+)?(${MONTH_NAMES})\\s+(?:de\\s+|del\\s+)?(\\d{4})(?![\\d])`,
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

/** Every valid full calendar date the texts state, distinct and sorted. */
export function statedDates(texts: readonly string[]): string[] {
  const out = new Set<string>();
  for (const text of texts) {
    const folded = fold(text);
    for (const { re, ymd } of PATTERNS) {
      for (const m of folded.matchAll(re)) {
        const date = calendarDate(...ymd(m));
        if (date !== null) out.add(date);
      }
    }
  }
  return [...out].sort();
}

/** The stated dates in the capture year (UTC) or the year after. */
export function currentOrUpcomingYearDates(texts: readonly string[], capturedAt: string): string[] {
  const year = Number(capturedAt.slice(0, 4));
  return statedDates(texts).filter((d) => {
    const y = Number(d.slice(0, 4));
    return y === year || y === year + 1;
  });
}
