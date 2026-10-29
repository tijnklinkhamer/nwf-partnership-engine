/**
 * REL L2 / U1 - TURNING ONE UNTRUSTED RESULT INTO ONE ADMISSIBLE NOMINATION.
 *
 * Every gate here is a gate that already exists elsewhere in this repository,
 * reused rather than re-implemented:
 *
 *   1. `validateRequestUrl` (web/url.ts) - the SAME URL rules the gateway
 *      applies to a request: explicit http(s) scheme, no userinfo, no IP
 *      literal, NO explicit port (read from the raw input), no fragment, no
 *      empty label, a real ICANN suffix. Nothing is repaired: a value that
 *      needs a guess to become a URL is refused.
 *   2. the registrable domain, from the single `tldts` implementation in
 *      `src/website/parse.ts` (which `validateRequestUrl` already calls).
 *   3. `isAdmissiblePublicUrl` (identity/admissibility.ts) - the exact TS
 *      mirror of migration 0013's `discovery_identity_url_admissible`, which
 *      migration 0019 also applies as a CHECK: no query string, no encoded
 *      at-sign, and NO social-platform or messaging host. A refused social
 *      URL is reported, never stored.
 *   4. `checkHostAdmissible` (web/hostPolicy.ts) - no service subdomain
 *      (`mail.`, `vpn.`, `moodle.` ...).
 *   5. `redactContactData` (web/redact.ts) - over title and snippet, before
 *      anything is capped, stored or printed - plus migration 0013's stricter
 *      telephone shape. A remaining `@handle` is a social handle and is
 *      redacted too, so no at-sign is ever stored.
 *
 * PURE. No socket, no database, no filesystem, no environment, no clock.
 */
import { isAdmissiblePublicUrl, SOCIAL_PLATFORM_HOSTS } from './identityBridge.js';
import { checkHostAdmissible } from '../web/hostPolicy.js';
import { redactContactData } from '../web/redact.js';
import { validateRequestUrl, type UrlRejectionReason } from '../web/url.js';
import { heiSignalOf, type HeiSignal } from './heiSignal.js';
import {
  NOMINATION_SNIPPET_MAX_CHARS,
  NOMINATION_TITLE_MAX_CHARS,
  type RawSearchResult,
} from './types.js';

export type NominationRefusalReason =
  | `URL_${Uppercase<UrlRejectionReason>}`
  | 'SOCIAL_OR_MESSAGING_HOST'
  | 'SERVICE_SUBDOMAIN'
  | 'URL_NOT_ADMISSIBLE';

export interface PreparedNomination {
  readonly url: string;
  readonly hostname: string;
  readonly registrableDomain: string;
  readonly title: string | null;
  readonly snippet: string | null;
  readonly heiSignal: HeiSignal;
}

export type NominationPreparation =
  | { readonly ok: true; readonly value: PreparedNomination }
  | { readonly ok: false; readonly reason: NominationRefusalReason };

/**
 * Nine or more digits joined only by space . ( ) + / - - the telephone shape
 * migration 0013 refuses in subject text. `redactContactData` is deliberately
 * conservative for page text and misses e.g. `(03)1234-5678` or a bare
 * `0312345678`; a nomination is a few short lines, so the stricter shape is
 * applied on top. A year (4 digits) or a range like `1990-2020` (8) survives.
 */
const LONG_DIGIT_RUN = /[0-9](?:[ .()+/-]{0,2}[0-9]){8,}/g;

/** A bare social handle (`@tokyo_lang`). Not an address, but not ours to keep either. */
const HANDLE_PATTERN = /@[\p{L}\p{N}_.-]+/gu;

/** C0 controls and DEL, as PostgreSQL's C-locale `[[:cntrl:]]` reads them. */
function stripControls(text: string): string {
  let out = '';
  for (const ch of text) {
    const unit = ch.codePointAt(0)!;
    out += unit <= 0x1f || unit === 0x7f ? ' ' : ch;
  }
  return out;
}

/** Truncates to at most `max` code points, deterministically, never splitting a surrogate pair. */
function capCodePoints(text: string, max: number): string {
  const points = [...text];
  return points.length <= max ? text : points.slice(0, max).join('').trimEnd();
}

/**
 * Redacts, normalises and caps one free-text field. Redaction runs FIRST, on
 * the whole text, so a capped field can never end with half an address that
 * redaction no longer recognises.
 */
export function sanitiseNominationText(raw: string | null, max: number): string | null {
  if (raw === null) return null;
  const redacted = redactContactData(stripControls(raw.normalize('NFC')))
    .replace(LONG_DIGIT_RUN, '[PHONE]')
    .replace(HANDLE_PATTERN, '[HANDLE]')
    .replace(/@/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const capped = capCodePoints(redacted, max);
  return capped === '' ? null : capped;
}

function isSocialPlatformHost(hostname: string): boolean {
  return SOCIAL_PLATFORM_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`));
}

export function prepareNomination(raw: RawSearchResult): NominationPreparation {
  const validated = validateRequestUrl(raw.url);
  if (!validated.ok) {
    return {
      ok: false,
      reason: `URL_${validated.reason.toUpperCase()}` as NominationRefusalReason,
    };
  }
  const { url, hostname, registrableDomain } = validated.value;
  if (isSocialPlatformHost(hostname)) return { ok: false, reason: 'SOCIAL_OR_MESSAGING_HOST' };
  if (!checkHostAdmissible(hostname, registrableDomain).ok) {
    return { ok: false, reason: 'SERVICE_SUBDOMAIN' };
  }
  if (!isAdmissiblePublicUrl(url)) return { ok: false, reason: 'URL_NOT_ADMISSIBLE' };

  const title = sanitiseNominationText(raw.title, NOMINATION_TITLE_MAX_CHARS);
  const snippet = sanitiseNominationText(raw.snippet, NOMINATION_SNIPPET_MAX_CHARS);
  return {
    ok: true,
    value: {
      url,
      hostname,
      registrableDomain,
      title,
      snippet,
      heiSignal: heiSignalOf(hostname, title),
    },
  };
}
