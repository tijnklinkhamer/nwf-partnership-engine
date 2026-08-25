/**
 * REQUEST-URL validation and ROOT-SCOPE enforcement.
 *
 * This module answers two questions and refuses to answer any others:
 *
 *   1. "Is this string a URL this gateway is willing to request at all?"
 *   2. "Does it fall inside the scope of the root authority that permits it?"
 *
 * It is deliberately STRICTER than Phase 1D's `parseWebsiteCandidate`, and the
 * asymmetry is the point. That parser CLASSIFIES a value an official source
 * published, including values it will never accept, and it prefixes a scheme
 * for parsing because 4,271 ECHE rows publish a bare hostname. This module
 * validates a value that is about to become a SOCKET, so a missing scheme, a
 * surprising port or an IP literal is a refusal rather than something to
 * normalise around.
 *
 * The one thing the two share is the registrable-domain answer, imported from
 * Phase 1D rather than reimplemented: two definitions of "same registrable
 * domain" would be two trust boundaries that can disagree.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import { icannRegistrableDomain } from '../../website/parse.js';
import { isIpLiteral } from './address.js';
import { DEFAULT_PORT_FOR_SCHEME } from './policy.js';

export type UrlRejectionReason =
  | 'blank'
  | 'unparsable'
  | 'interior_whitespace'
  | 'scheme_missing'
  | 'scheme_not_http'
  | 'userinfo_present'
  | 'host_empty'
  | 'host_is_ip_literal'
  | 'host_without_dot'
  | 'no_icann_public_suffix'
  | 'non_default_port'
  | 'fragment_present';

export interface ValidatedUrl {
  /** The absolute URL, serialised deterministically by the WHATWG parser. */
  url: string;
  scheme: 'http:' | 'https:';
  hostname: string;
  registrableDomain: string;
  /** Always the scheme default; a non-default port is refused, never carried. */
  port: number;
  /** Path plus query, exactly what goes on the request line. Never includes a fragment. */
  requestPath: string;
}

export type UrlValidation =
  { ok: true; value: ValidatedUrl } | { ok: false; reason: UrlRejectionReason };

const SCHEME_PREFIX = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/**
 * Validates one URL this gateway is being asked to request.
 *
 * The gates are ordered and total. NOTHING here repairs a value: a URL that
 * needs a guess to become requestable is refused, because the guess would
 * become a socket to a host nobody chose.
 */
export function validateRequestUrl(raw: string | null | undefined): UrlValidation {
  if (raw === null || raw === undefined) return { ok: false, reason: 'blank' };
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, reason: 'blank' };

  // Interior whitespace means the value is not one address. Phase 1D found
  // cells holding two sites; a request built from one of them would be a guess
  // about which the source meant.
  if (/\s/.test(trimmed)) return { ok: false, reason: 'interior_whitespace' };

  // An EXPLICIT scheme is required. Phase 1D may add "https://" to classify a
  // published value; adding one here would invent the scheme of a request.
  if (!SCHEME_PREFIX.test(trimmed)) return { ok: false, reason: 'scheme_missing' };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: 'unparsable' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'scheme_not_http' };
  }

  // Credentials are never sent to a third-party site by this repository, and a
  // URL carrying them is how 55 ECHE rows turned an address into a website.
  if (url.username !== '' || url.password !== '') {
    return { ok: false, reason: 'userinfo_present' };
  }

  // A fragment never reaches the wire, so two requests differing only by one
  // are the SAME request - but they would be two rows on the attempt identity
  // index, and the second would look like a distinct observation.
  if (url.hash !== '') return { ok: false, reason: 'fragment_present' };

  const hostname = url.hostname.toLowerCase();
  if (hostname === '') return { ok: false, reason: 'host_empty' };

  // An IP literal names no registrable domain, so it can neither be scoped to a
  // root nor be checked against one. No approved rule in this repository
  // permits requesting one.
  if (isIpLiteral(hostname)) return { ok: false, reason: 'host_is_ip_literal' };
  if (!hostname.includes('.')) return { ok: false, reason: 'host_without_dot' };

  const registrableDomain = icannRegistrableDomain(hostname);
  if (registrableDomain === null) return { ok: false, reason: 'no_icann_public_suffix' };

  const defaultPort = DEFAULT_PORT_FOR_SCHEME[url.protocol]!;
  // `url.port` is empty when the port is the scheme default, because the WHATWG
  // parser drops it. Anything left is an explicit, non-default port.
  if (url.port !== '') return { ok: false, reason: 'non_default_port' };

  return {
    ok: true,
    value: {
      url: url.toString(),
      scheme: url.protocol,
      hostname,
      registrableDomain,
      port: defaultPort,
      requestPath: `${url.pathname}${url.search}`,
    },
  };
}

export type ScopeRefusal = 'registrable_domain_outside_root' | 'scheme_downgrade';

export type ScopeVerdict = { ok: true } | { ok: false; reason: ScopeRefusal };

/**
 * Decides whether a validated URL falls inside a root's authority.
 *
 * SAME REGISTRABLE DOMAIN, NOT SAME HOST. ADR 0004 s4 sets the boundary there
 * because the units this phase exists to find genuinely live on sibling hosts -
 * `international.`, `langues.`, `en.`, `www2.` - and a same-host rule would
 * miss them by construction. A hop that LEAVES the registrable domain is a new
 * root and needs its own explicit operator approval; it never extends this one.
 *
 * SCHEME: an HTTPS root never authorises an HTTP descendant, because that is a
 * downgrade the caller chose rather than one the server asked for. When the
 * official claim ITSELF is HTTP, the exact root URL may be requested - that is
 * how the institution's current behaviour (very often a redirect to HTTPS) gets
 * observed at all - but nothing below it. Widening that is a later, deliberate
 * policy decision, not something to infer here.
 */
export function checkRootScope(root: ValidatedUrl, requested: ValidatedUrl): ScopeVerdict {
  if (requested.registrableDomain !== root.registrableDomain) {
    return { ok: false, reason: 'registrable_domain_outside_root' };
  }
  if (requested.scheme === 'http:') {
    const isExactRoot = requested.url === root.url;
    if (!(root.scheme === 'http:' && isExactRoot)) {
      return { ok: false, reason: 'scheme_downgrade' };
    }
  }
  return { ok: true };
}
