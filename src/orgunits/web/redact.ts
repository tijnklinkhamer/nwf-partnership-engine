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
 *   (international/French/German/Dutch-style numbers, however spaced or
 *   hyphenated), not general phone-number intelligence.
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
 * dot or parenthesis) among the digits, so a bare run of digits with no
 * separator and no `+` - which is exactly what a year or a page number looks
 * like - never matches at all. The digit-count check below then requires at
 * least 8 significant digits, which excludes any 4-digit year, any 1-3 digit
 * page/room number, and short reference codes, while still catching ordinary
 * institutional formats: `+33 1 23 45 67 89`, `01 23 45 67 89`,
 * `030-123-4567`, `(030) 123 4567`, `+49 (0)30 1234567`.
 */
const PHONE_CANDIDATE_PATTERN =
  /(?<![\w@.])(\+\d[\d\s().-]{6,18}\d|\(?\d{2,5}\)?[\s.-]\d[\d\s().-]{4,17}\d)(?![\w@])/g;

function significantDigitCount(candidate: string): number {
  return (candidate.match(/\d/g) ?? []).length;
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
 */
export function redactPhones(text: string): string {
  return text.replace(PHONE_CANDIDATE_PATTERN, (candidate) => {
    if (significantDigitCount(candidate) < 8) return candidate;
    return '[PHONE]';
  });
}

/** Applies every redaction this module knows about, in the order that composes correctly. */
export function redactContactData(text: string): string {
  return redactPhones(redactEmails(text));
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
