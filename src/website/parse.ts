/**
 * STRICT structural classification of a published website value.
 *
 * WHAT THIS ANSWERS
 *
 *   "Is the text a source published in its website field shaped like a web
 *    address at all, and if so what host and registrable domain does it name?"
 *
 * WHAT IT DOES NOT ANSWER
 *
 *   "Is this the organisation's official website?" Nothing here contacts a
 *   network, resolves DNS, follows a redirect or reads a page. A value can be
 *   STRUCTURALLY_VALID and still point at a parent ministry, a hospital, a
 *   franchise, an LMS or a dead host. Structural validity is a property of the
 *   STRING, never of the institution.
 *
 * WHY IT EXISTS
 *
 *   The legacy Phase 1A path (`normaliseWebsiteUrl` + `canonicalDomain`)
 *   accepted values that are plainly not websites. Measured on the live ECHE
 *   artifact: 55 published "Website Url" values are EMAIL ADDRESSES, which the
 *   legacy path turned into an https URL by prefixing a scheme - so
 *   "03014851@edu.gva.es" became "https://03014851@edu.gva.es/" and yielded the
 *   registrable domain "gva.es". That is a fabricated website. This module
 *   exists so that can never happen again, and the regression tests name those
 *   exact values.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import { parse as parseHost } from 'tldts';

/**
 * The structural verdict for ONE published value.
 *
 * These are deliberately four distinct outcomes. Collapsing MALFORMED into
 * NOT_A_WEBSITE would merge "the source published free text" with "the source
 * published something address-shaped that is definitively not a website", and
 * collapsing either into ABSENT would turn "the source published nothing" into
 * "the source published something bad".
 */
export type WebsiteStructuralStatus =
  /** The source published no value at all for this row. */
  | 'ABSENT'
  /** Parses as an http(s) URL naming a host under an ICANN public suffix. */
  | 'STRUCTURALLY_VALID'
  /** Not a single parsable web address: free text, two values in one field. */
  | 'MALFORMED'
  /** Address-shaped, but definitively not a website: an email, a bad TLD. */
  | 'NOT_A_WEBSITE';

/** Why a value was not STRUCTURALLY_VALID. Diagnostic only, never repaired. */
export type WebsiteRejectionReason =
  | 'blank'
  | 'interior_whitespace'
  | 'broken_scheme'
  | 'unparsable'
  | 'userinfo_present'
  | 'non_http_scheme'
  | 'host_without_dot'
  | 'no_icann_public_suffix';

export interface WebsiteCandidate {
  /** The value exactly as it was handed in. Never rewritten. */
  rawValue: string | null;
  status: WebsiteStructuralStatus;
  /** Absolute http(s) URL, only when STRUCTURALLY_VALID. */
  normalisedUrl: string | null;
  /** Lower-cased host, only when STRUCTURALLY_VALID. */
  hostname: string | null;
  /**
   * Registrable domain (eTLD+1), only when STRUCTURALLY_VALID.
   *
   * DELIBERATELY KEPT SEPARATE FROM `hostname`. They answer different
   * questions, and collapsing them loses the distinction the live data depends
   * on: 374 ECHE rows share a hostname and 1,021 share a registrable domain,
   * so two rows agreeing on a domain may still name different sites.
   */
  registrableDomain: string | null;
  /** Set whenever `status` is not STRUCTURALLY_VALID. */
  reason: WebsiteRejectionReason | null;
}

/**
 * The rule version stamped onto every claim this parser classifies.
 *
 * Persisted alongside the derived fields so a stored classification always says
 * WHICH rules produced it. Bump it when the rules below change; never re-derive
 * an existing claim row in place - a new rule version means new evidence rows
 * from a new run, because a claim is append-only.
 */
export const WEBSITE_PARSE_RULE_VERSION = 'website-parse-v1';

/**
 * Scheme words this parser recognises well enough to notice a BROKEN one.
 *
 * Only used to tell "http//example.fr" (a typo the source published, which
 * stays MALFORMED) apart from "httpexample.fr" (an ordinary host that merely
 * begins with those letters). Nothing here repairs the typo.
 */
const KNOWN_SCHEME_WORD = /^(https?|ftps?)(?![a-z0-9+.-])/i;
const WELL_FORMED_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;
const ANY_SCHEME_PREFIX = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

function reject(
  rawValue: string | null,
  status: WebsiteStructuralStatus,
  reason: WebsiteRejectionReason,
): WebsiteCandidate {
  return {
    rawValue,
    status,
    normalisedUrl: null,
    hostname: null,
    registrableDomain: null,
    reason,
  };
}

/**
 * Classifies one published website value.
 *
 * The gates below are ordered, total, and deliberately free of repair logic.
 * A value that needs a guess to become a URL is reported as published, never
 * mended: "Never guess a value" is a repository rule, and the whole point of
 * this phase is that the evidence layer preserves bad evidence honestly.
 */
export function parseWebsiteCandidate(rawValue: string | null | undefined): WebsiteCandidate {
  if (rawValue === null || rawValue === undefined) {
    return reject(null, 'ABSENT', 'blank');
  }
  const trimmed = rawValue.trim();
  if (trimmed === '') return reject(rawValue, 'ABSENT', 'blank');

  // Gate 1. Interior whitespace means the field holds more than one thing, or
  // free text. "www.uoi.gr / www.rc.uoi.gr" is two sites in one cell; picking
  // one would be a guess about which the institution meant.
  if (/\s/.test(trimmed)) return reject(rawValue, 'MALFORMED', 'interior_whitespace');

  // Gate 2. A recognisable scheme word that is not followed by "://" is a typo
  // in the source ("http//www.example.fr"). Reported, not corrected.
  if (KNOWN_SCHEME_WORD.test(trimmed) && !WELL_FORMED_SCHEME.test(trimmed)) {
    return reject(rawValue, 'MALFORMED', 'broken_scheme');
  }

  // Gate 3. Parse. A value carrying its own scheme is parsed as published; a
  // bare host gets "https://" FOR PARSING ONLY, which is what 4,271 of the
  // 5,900 non-blank ECHE values need. The prefix never reaches storage as the
  // published value - raw_value keeps the original.
  const hasScheme = ANY_SCHEME_PREFIX.test(trimmed);
  let url: URL;
  try {
    url = new URL(hasScheme ? trimmed : `https://${trimmed}`);
  } catch {
    return reject(rawValue, 'MALFORMED', 'unparsable');
  }

  // Gate 4. USERINFO. This single check is what closes the 55-email defect:
  // "03014851@edu.gva.es" parses with username "03014851" and host
  // "edu.gva.es". An email address is not a website, and a website URL that
  // carries credentials is not one this repository will ever treat as an
  // institution's public site.
  if (url.username !== '' || url.password !== '') {
    return reject(rawValue, 'NOT_A_WEBSITE', 'userinfo_present');
  }

  // Gate 5. Only the web. "mailto:", "ftp:", "tel:" and friends are addresses,
  // but they are not websites.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return reject(rawValue, 'NOT_A_WEBSITE', 'non_http_scheme');
  }

  const hostname = url.hostname.toLowerCase();

  // Gate 6. A host with no dot is not a web address at all - it is a bare
  // token that happened to sit in a URL field. The live artifact publishes the
  // SIRET number "20004497200087" this way.
  if (!hostname.includes('.')) return reject(rawValue, 'MALFORMED', 'host_without_dot');

  // Gate 7. The host must sit under a real ICANN public suffix. This is what
  // rejects "www.fpvalencia" and "gobex.ex": both are address-SHAPED, and
  // neither names a registrable domain that could exist. `allowPrivateDomains`
  // stays false so the registrable domain is eTLD+1 under the ICANN section
  // only - the same basis Phase 1A's canonical_domain already used.
  const host = parseHost(hostname, { allowPrivateDomains: false });
  if (host.isIcann !== true || host.domain === null) {
    return reject(rawValue, 'NOT_A_WEBSITE', 'no_icann_public_suffix');
  }

  return {
    rawValue,
    status: 'STRUCTURALLY_VALID',
    normalisedUrl: url.toString(),
    hostname,
    registrableDomain: host.domain.toLowerCase(),
    reason: null,
  };
}
