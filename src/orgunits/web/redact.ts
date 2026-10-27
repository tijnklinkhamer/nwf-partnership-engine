/**
 * CONTACT-DATA REDACTION, applied BEFORE anything extracted reaches
 * persistence, a log line or an error message.
 *
 * WHY THIS EXISTS
 *
 *   Institutional pages routinely carry staff names, email addresses,
 *   telephone numbers and `mailto:`/`tel:` links. Phase 2B does not collect
 *   contacts (ADR 0004 s13; CLAUDE.md rule 26) - it produces bounded, safe
 *   TEXTUAL evidence about an organisational unit's page, and a page that
 *   happens to mention a contact method is not a licence to keep it. This
 *   module is the one place that boundary is enforced on TEXT, and it is
 *   applied to every field extract.ts hands to persistence: title, headings,
 *   main text.
 *
 * WHY IT IS CONSERVATIVE ABOUT PHONE NUMBERS SPECIFICALLY
 *
 *   A broad phone-shaped regex would also redact years, page numbers, room
 *   numbers and ordinary short numeric values - which would quietly destroy
 *   large amounts of ordinary curriculum and page text for a false gain in
 *   privacy. It is better to miss an exotic phone format in memory than to
 *   turn a page's main text into holes. The trade this module makes is
 *   therefore CONTACT MINIMISATION for the ordinary institutional case
 *   (international/French/German/Dutch/Japanese/Mexican-style numbers,
 *   however spaced or hyphenated), not general phone-number intelligence.
 *
 * FULL-WIDTH (ZENKAKU) DIGITS AND SEPARATORS
 *
 *   Japanese pages routinely write a number as `０３－１２３４－５６７８` or
 *   `03（1234）5678`. Those characters are FOLDED, for DETECTION ONLY, to
 *   their ASCII equivalents (`foldPhoneCharacters`) before the phone pattern
 *   runs; `[PHONE]` is then spliced into the ORIGINAL text at the same
 *   offsets. Every folded character is one UTF-16 code unit mapped to one
 *   UTF-16 code unit, so offsets in the folded copy and the original agree.
 *   Text containing none of them folds to itself, so ASCII-only input is
 *   matched exactly as before the fold existed. Deliberately NOT folded:
 *   en/em dashes and the minus sign - `2019–2020` is a year range, never a
 *   number to call, and folding it would start redacting years.
 *
 * VERSIONING
 *
 *   Redaction output is part of the extraction rule version
 *   (`pageEvidence.ts`'s `EXTRACTION_RULE_VERSION`). Two output changes
 *   were made in the Japan/Mexico/Netherlands slice, and every pre-existing
 *   test vector is unchanged: (1) the full-width fold and the
 *   bracketed-exchange form redact MORE (only text containing those shapes
 *   is affected); (2) a whole candidate that is a day-month-year date
 *   (`26-10-2026`, `26.10.2026`) is now KEPT - it was previously destroyed
 *   as `[PHONE]`, the "redacts dates" failure this module exists to avoid,
 *   and no real phone number is written as a valid DD-MM-19YY/20YY date.
 *   Because that changes extracted text, the OWNER-directed REL Engine
 *   integration (2026-10-26) bumped the label to `orgunit-extraction-v3`:
 *   `orgunit-extraction-v2` names the earlier redaction and only that, so
 *   one label never names two transforms. Rows already persisted under v2
 *   keep their label and are never rewritten (append-only evidence); to the
 *   classifier v3 means "canonical text" exactly as v2 does
 *   (`classify/constants.ts`).
 *
 *   The REL final join (OWNER directive, 2026-10-26) then stopped redacting
 *   academic-year ranges and sequences of them (`maskAcademicYearRanges`):
 *   a false positive H4 had hidden by rewording a fixture. That change STAYS
 *   WITHIN `orgunit-extraction-v3`, deliberately: no v3 row has ever been
 *   persisted outside a disposable test database, so no stored row was ever
 *   produced by the pre-fix v3 transform and the label still names exactly
 *   one transform as far as any persisted evidence is concerned. It redacts
 *   only LESS (a character-wise subset), so every text that was a redaction
 *   fixed point before is still one.
 *
 *   WW E-XFX (2026-10-27) then closed the separator-less gap (the fourth
 *   phone alternative, below): `0612345678` was stored readable. This change
 *   redacts MORE, and it too stays within `orgunit-extraction-v3` on the
 *   same ground as the REL final join: v3 was introduced 2026-10-26 and
 *   every v3 row this repository knows of was written to a disposable test
 *   database (live acquisition is not authorised in this period), so no
 *   persisted row was produced by the pre-fix v3 transform. That ground is
 *   a FACT TO CONFIRM, not one this code can check: if any v3 row exists in
 *   a persistent database, this change needs its own label before such rows
 *   and new ones are compared. Every pre-existing redaction vector is
 *   unchanged; only text containing a bare 9-15 digit run is affected.
 *
 *   WW H-EX (2026-10-27, independent review P2-9) corrected that: the
 *   bare-run change was NOT within v3. `orgunit-extraction-v3` names the
 *   transform as it stood BEFORE WW E-XFX - three phone alternatives, the
 *   full-width fold, the bracketed exchange, kept DMY dates and the masked
 *   academic-year ranges - and that transform is FROZEN here as
 *   `redactPhonesV3` / `redactContactDataV3`, so a v3 row is judged by the
 *   rules it was written under. New evidence is `orgunit-extraction-v4`:
 *   the bare-run alternative, plus one exception the bare run needed - a
 *   valid ISBN-13 (`9789012345678`, `978`/`979` with a correct check digit)
 *   is a book number, never a telephone number, and is kept. Every earlier
 *   redaction vector is unchanged under v4. `redactorsForStoredExtraction`
 *   picks the redactor a STORED row is judged by: v3 rows by the frozen v3
 *   redactor, every other label (v1, v2, v4, anything unknown) by the
 *   current - strictest - one.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */

const EMAIL_PATTERN =
  /[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+/g;

/**
 * A phone-SHAPED run of digits, conservatively bounded.
 *
 * Requires EITHER a leading `+` (an international prefix is the strongest
 * possible phone signal) OR at least one grouping separator (space, hyphen,
 * dot or parenthesis) among the digits, OR - the fourth alternative, see
 * below - a bare run of at least nine digits, so a short bare run with no
 * separator and no `+` - which is exactly what a year or a page number looks
 * like - never matches at all. The digit-count check below then requires at
 * least 8 significant digits, which excludes any 4-digit year, any 1-3 digit
 * page/room number, and short reference codes, while still catching ordinary
 * institutional formats: `+33 1 23 45 67 89`, `01 23 45 67 89`,
 * `030-123-4567`, `(030) 123 4567`, `+49 (0)30 1234567`.
 */
const PHONE_CANDIDATE_PATTERN =
  /(?<![\w@.])(\+\d[\d\s().-]{6,18}\d|\(?\d{2,5}\)?[\s.-]\d[\d\s().-]{4,17}\d|\d{2,5}\(\d{1,4}\)\d{3,5}|\d{9,15})(?![\w@])/g;

/**
 * The phone pattern of `orgunit-extraction-v3`, FROZEN (WW H-EX, P2-9): the
 * same three alternatives as above, without the bare-run fourth. Never
 * edited; it exists so a stored v3 row is judged by the rules it was
 * written under (`redactorsForStoredExtraction`).
 */
const PHONE_CANDIDATE_PATTERN_V3 =
  /(?<![\w@.])(\+\d[\d\s().-]{6,18}\d|\(?\d{2,5}\)?[\s.-]\d[\d\s().-]{4,17}\d|\d{2,5}\(\d{1,4}\)\d{3,5})(?![\w@])/g;

/*
 * The THIRD alternative above is the Japanese bracketed-exchange form
 * `03(1234)5678` (after folding, also `03（1234）5678`): area code, the
 * exchange in parentheses, the subscriber number, and NO separator - which
 * is why the second alternative, which needs a space/dot/hyphen after the
 * area code, never saw it. Digits, `(`, digits, `)`, digits with nothing in
 * between is not a shape a year, a postcode, a date, a price or a room
 * number takes, and the 8-significant-digit floor still applies to it. Added
 * as the LAST alternative so every match the first two made before is still
 * made, at the same position, unchanged.
 */

/*
 * The FOURTH alternative (WW E-XFX, 2026-10-27) is a BARE run of digits with
 * no separator at all - `0612345678` (NL mobile), `0312345678` (Tokyo),
 * `8112345678` (Monterrey), `030123456` (Berlin) - which the other three
 * never matched, so such a number was stored readable. It is the LAST
 * alternative, so every match the first three made before is still made, at
 * the same position, unchanged; and it is bounded much more tightly than the
 * digit floor (`isBareSubscriberNumber`): a bare run is redacted only when it
 * is 10-15 digits long, or exactly 9 digits beginning with the national
 * trunk prefix `0`. An 8-digit run (`20261026`, a YYYYMMDD date), a year, a
 * page or room number, a postcode, and any 9-digit run not starting with `0`
 * are therefore kept. A run glued to a letter, `@` or `.` on either side
 * (an identifier, an e-mail local part, a version string) never starts or
 * ends a match, exactly as for the other alternatives.
 */

/**
 * Full-width / ideographic separators folded to ASCII for phone DETECTION
 * only, keyed by UTF-16 code unit. Written as escapes, never as literal
 * characters, so a reviewer can see exactly which code points are folded.
 */
const PHONE_SEPARATOR_FOLD: ReadonlyMap<number, string> = new Map([
  [0xff08, '('], // FULLWIDTH LEFT PARENTHESIS
  [0xff09, ')'], // FULLWIDTH RIGHT PARENTHESIS
  [0xff0b, '+'], // FULLWIDTH PLUS SIGN
  [0xff0d, '-'], // FULLWIDTH HYPHEN-MINUS
  [0xff0e, '.'], // FULLWIDTH FULL STOP
  [0x3000, ' '], // IDEOGRAPHIC SPACE
  [0x30fc, '-'], // KATAKANA-HIRAGANA PROLONGED SOUND MARK, routinely typed as a hyphen in JP numbers
]);

/** Full-width digits U+FF10-U+FF19 plus every key of `PHONE_SEPARATOR_FOLD`. */
const PHONE_FOLD_PATTERN = /[\uFF10-\uFF19\uFF08\uFF09\uFF0B\uFF0D\uFF0E\u3000\u30FC]/g;

const FULLWIDTH_DIGIT_ZERO = 0xff10;
const FULLWIDTH_DIGIT_NINE = 0xff19;
const ASCII_DIGIT_ZERO = 0x30;

/**
 * Folds full-width digits and the separators in `PHONE_SEPARATOR_FOLD` to
 * ASCII. LENGTH-PRESERVING: one UTF-16 code unit in, one out, so an offset
 * in the folded copy is the same offset in the original. Used for phone
 * DETECTION only - the returned text is never itself emitted.
 */
export function foldPhoneCharacters(text: string): string {
  return text.replace(PHONE_FOLD_PATTERN, (character) => {
    const code = character.charCodeAt(0);
    if (code >= FULLWIDTH_DIGIT_ZERO && code <= FULLWIDTH_DIGIT_NINE) {
      return String.fromCharCode(code - FULLWIDTH_DIGIT_ZERO + ASCII_DIGIT_ZERO);
    }
    return PHONE_SEPARATOR_FOLD.get(code) ?? character;
  });
}

function significantDigitCount(candidate: string): number {
  return (candidate.match(/\d/g) ?? []).length;
}

const BARE_DIGITS = /^\d+$/;

/** A separator-less candidate that is shaped like a whole subscriber number (see above). */
function isBareSubscriberNumber(candidate: string): boolean {
  return candidate.length >= 10 || (candidate.length === 9 && candidate.startsWith('0'));
}

/**
 * A bare 13-digit ISBN-13 (`orgunit-extraction-v4`): prefix `978` or `979`
 * and a correct check digit (weights 1,3,1,3,... over the first twelve
 * digits; the check digit brings the sum to a multiple of ten). A book
 * number printed on a library or course page is not a contact. Only a valid
 * checksum is kept, so roughly nine in ten mistyped or phone-shaped
 * 978/979 runs are still redacted. Bare runs only: an ISBN written with
 * hyphens is redacted exactly as before (a residual over-redaction).
 */
function isIsbn13(candidate: string): boolean {
  if (!/^97[89]\d{10}$/.test(candidate)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(candidate[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === Number(candidate[12]);
}

/**
 * A WHOLE candidate that is a day-month-year calendar date - `26-10-2026`,
 * `26.10.2026`, `1-2-2026` - with one repeated separator, a day 1-31, a
 * month 1-12 and a 19xx/20xx year. Dutch and Mexican pages write dates
 * exactly this way, and the phone pattern's hyphen/dot grouping plus eight
 * digits would otherwise turn every one into `[PHONE]`. ISO `2026-10-26`
 * never reaches here (the second alternative cannot match it). Checked on
 * the WHOLE candidate only: a date-shaped run INSIDE a longer phone-shaped
 * candidate does not save it.
 */
const DAY_MONTH_YEAR = /^(?:0?[1-9]|[12]\d|3[01])([-.])(?:0?[1-9]|1[0-2])\1(?:19|20)\d{2}$/;

function isDayMonthYearDate(candidate: string): boolean {
  return DAY_MONTH_YEAR.test(candidate);
}

/**
 * ACADEMIC-YEAR RANGES - `2026-2027`, `2026–2027`, `2026/2027`, `2026-27`,
 * `2026 - 2027` - and whitespace-separated SEQUENCES of them
 * (`collegejaar 2026-2027 2027-2028`).
 *
 * One range on its own never reaches the phone pattern's eight-digit floor
 * in a shape it can match, but two adjacent ranges do: `2026-2027 2027-2028`
 * is sixteen digits grouped by a hyphen and a space, exactly what the second
 * phone alternative accepts, so a Dutch "collegejaren" line came out as
 * `[PHONE]`. The REL harvest (H4) hit that and rewrote a fixture to hide it;
 * this is the fix.
 *
 * A run is MASKED from phone detection (never from the output: masking is
 * applied to the folded DETECTION copy only, length-preserving) when ALL of:
 *
 *   - every range is a 19xx/20xx year, a dash/slash (optionally spaced), and
 *     either a 19xx/20xx year or a two-digit suffix, with the end strictly
 *     AFTER the start and at most `MAX_ACADEMIC_RANGE_SPAN` years later
 *     (`isPlausibleAcademicRange`). `2026-25`, `2026-2026` and `2026-2099`
 *     are not ranges and are never masked;
 *   - the run is NOT preceded by a digit or `+`, even across separators -
 *     so `03-2019-2020` (a Tokyo number) or `(55) 2026-2027` (a Mexico City
 *     number) is never sheltered: its year-shaped tail is part of the phone;
 *   - the run is NOT followed, even across separators, by another digit - so
 *     a run that continues into further digits is left to the phone pattern
 *     unchanged.
 *
 * Both context rules err towards REDACTING: a year sequence glued to other
 * digits (`2026-2027 2027-2028 30 EC`) is still `[PHONE]`, a residual false
 * positive accepted rather than ever leaving part of a real number readable.
 */
const ACADEMIC_YEAR = '(?:19|20)\\d{2}';
const ACADEMIC_RANGE = `${ACADEMIC_YEAR}\\s*[-\\u2013\\u2014/]\\s*(?:${ACADEMIC_YEAR}|\\d{2})`;
const ACADEMIC_RANGE_PART = new RegExp(
  `(${ACADEMIC_YEAR})\\s*[-\\u2013\\u2014/]\\s*(\\d{4}|\\d{2})`,
  'g',
);
const ACADEMIC_RANGE_RUN = new RegExp(
  `(?<![\\d+][\\s.()\\-]*)${ACADEMIC_RANGE}(?:\\s+${ACADEMIC_RANGE})*(?![\\s.()\\-]*\\d)`,
  'g',
);

/** The widest span accepted as one range: a seven-year programme period such as `2021-2027` fits. */
const MAX_ACADEMIC_RANGE_SPAN = 10;

function isPlausibleAcademicRange(startText: string, endText: string): boolean {
  const start = Number(startText);
  let end = Number(endText);
  if (endText.length === 2) {
    end += Math.floor(start / 100) * 100;
    if (end <= start) end += 100;
  }
  const span = end - start;
  return span >= 1 && span <= MAX_ACADEMIC_RANGE_SPAN;
}

function isAcademicRangeRun(run: string): boolean {
  for (const part of run.matchAll(ACADEMIC_RANGE_PART)) {
    if (!isPlausibleAcademicRange(part[1]!, part[2]!)) return false;
  }
  return true;
}

/**
 * Replaces every academic-year run (see above) with the same number of `#`
 * characters - not a digit, not a phone separator, not a word character - so
 * the phone pattern can neither match inside it nor bridge across it.
 * LENGTH-PRESERVING; used on the DETECTION copy only.
 */
export function maskAcademicYearRanges(folded: string): string {
  return folded.replace(ACADEMIC_RANGE_RUN, (run) =>
    isAcademicRangeRun(run) ? '#'.repeat(run.length) : run,
  );
}

/** Replaces email-shaped text with `[EMAIL]`. */
export function redactEmails(text: string): string {
  return text.replace(EMAIL_PATTERN, '[EMAIL]');
}

/**
 * Replaces phone-shaped text with `[PHONE]`.
 *
 * Run AFTER `redactEmails`: an email's local part can itself contain digits
 * and separators that would otherwise present as a phone-shaped run, and an
 * already-redacted `[EMAIL]` token contains no digits to match.
 *
 * Matches against the FOLDED copy (`foldPhoneCharacters`) and splices
 * `[PHONE]` into the ORIGINAL at the same offsets, so a full-width number is
 * redacted while every character outside a redacted span - full-width or
 * not - is returned exactly as given. Same left-to-right, non-overlapping
 * scan as `String.prototype.replace`: a candidate below the digit floor is
 * kept and scanning resumes after it.
 */
export function redactPhones(text: string): string {
  const folded = maskAcademicYearRanges(foldPhoneCharacters(text));
  let output = '';
  let cursor = 0;
  for (const match of folded.matchAll(PHONE_CANDIDATE_PATTERN)) {
    const candidate = match[0];
    if (significantDigitCount(candidate) < 8 || isDayMonthYearDate(candidate)) continue;
    if (
      BARE_DIGITS.test(candidate) &&
      (!isBareSubscriberNumber(candidate) || isIsbn13(candidate))
    ) {
      continue;
    }
    output += `${text.slice(cursor, match.index)}[PHONE]`;
    cursor = match.index + candidate.length;
  }
  return output + text.slice(cursor);
}

/** Applies every redaction this module knows about, in the order that composes correctly. */
export function redactContactData(text: string): string {
  return redactPhones(redactEmails(text));
}

/**
 * `redactPhones` as `orgunit-extraction-v3` defined it, FROZEN (WW H-EX,
 * P2-9): no bare-run alternative, so no ISBN exception either. Used ONLY to
 * judge rows stored under v3; nothing new is ever extracted with it.
 */
export function redactPhonesV3(text: string): string {
  const folded = maskAcademicYearRanges(foldPhoneCharacters(text));
  let output = '';
  let cursor = 0;
  for (const match of folded.matchAll(PHONE_CANDIDATE_PATTERN_V3)) {
    const candidate = match[0];
    if (significantDigitCount(candidate) < 8 || isDayMonthYearDate(candidate)) continue;
    output += `${text.slice(cursor, match.index)}[PHONE]`;
    cursor = match.index + candidate.length;
  }
  return output + text.slice(cursor);
}

/** `redactContactData` as `orgunit-extraction-v3` defined it, FROZEN. */
export function redactContactDataV3(text: string): string {
  return redactPhonesV3(redactEmails(text));
}

/** The label whose stored rows are judged by the FROZEN v3 redactor. */
export const FROZEN_V3_EXTRACTION_RULE_VERSION = 'orgunit-extraction-v3';

/** The redactors one stored evidence row is judged by, and what to call them in a refusal. */
export interface StoredRowRedactors {
  /** `current` or the frozen label; a constant, never page text. */
  readonly rules: string;
  readonly emails: (text: string) => string;
  readonly phones: (text: string) => string;
  readonly contactData: (text: string) => string;
}

const CURRENT_REDACTORS: StoredRowRedactors = Object.freeze({
  rules: 'current',
  emails: redactEmails,
  phones: redactPhones,
  contactData: redactContactData,
});

const FROZEN_V3_REDACTORS: StoredRowRedactors = Object.freeze({
  rules: FROZEN_V3_EXTRACTION_RULE_VERSION,
  emails: redactEmails,
  phones: redactPhonesV3,
  contactData: redactContactDataV3,
});

/**
 * Which redaction a row STORED under `extractionRuleVersion` must be a fixed
 * point of (WW H-EX, P2-9). A v3 row by the frozen v3 redactor - the rules it
 * was written under, so a later widening of the CURRENT redactor never
 * silently re-judges it. Every other label - v1 and v2 (which predate the
 * JP/MX/NL widening), v4 (current), anything unknown - by the CURRENT
 * redactor, the strictest this module has. An exact equality, never a
 * version ordering.
 */
export function redactorsForStoredExtraction(extractionRuleVersion: string): StoredRowRedactors {
  return extractionRuleVersion === FROZEN_V3_EXTRACTION_RULE_VERSION
    ? FROZEN_V3_REDACTORS
    : CURRENT_REDACTORS;
}

/**
 * Redacts a `mailto:`/`tel:` HREF TARGET, keeping the scheme visible as a
 * structural fact (a link points somewhere addressable) without exposing what
 * it points to.
 *
 * Not currently called by any persistence path in this slice - `main_text`,
 * `title` and `headings` are the only fields extract.ts populates, and anchor
 * hrefs are not among them (ADR 0006 s6: no `src/orgunits/web/frontier.ts`
 * exists to consume them yet). Exported now, defensively, so that whichever
 * later slice DOES start returning anchors for link discovery cannot do so
 * without redacting their contact-shaped targets - the function already
 * exists and is already tested.
 */
export function redactHrefTarget(href: string): string | null {
  const trimmed = href.trim();
  if (/^mailto:/i.test(trimmed)) return '[EMAIL]';
  if (/^tel:/i.test(trimmed)) return '[PHONE]';
  return null;
}
