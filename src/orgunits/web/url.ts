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
  | 'host_empty_label'
  | 'host_is_ip_literal'
  | 'host_without_dot'
  | 'no_icann_public_suffix'
  | 'explicit_port'
  | 'fragment_present';

export interface ValidatedUrl {
  /** The absolute URL, serialised deterministically by the WHATWG parser. */
  url: string;
  scheme: 'http:' | 'https:';
  hostname: string;
  registrableDomain: string;
  /** Always the scheme default; ANY explicit port is refused, never carried. */
  port: number;
  /** Path plus query, exactly what goes on the request line. Never includes a fragment. */
  requestPath: string;
}

export type UrlValidation =
  { ok: true; value: ValidatedUrl } | { ok: false; reason: UrlRejectionReason };

const SCHEME_PREFIX = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/**
 * The AUTHORITY component as the caller actually wrote it.
 *
 * Read from the RAW string rather than from the parsed URL, because the WHATWG
 * parser ERASES a scheme-default port: `https://x.fr:443/` and `https://x.fr/`
 * both leave `url.port === ''`. A check written against `url.port` therefore
 * cannot fire for `:443` or `:80` at all - it only ever caught the ports it was
 * not the sole defence against.
 *
 * Everything after the FIRST colon is taken and leading slashes are stripped,
 * rather than requiring a literal `://`, because the parser accepts `https:/x.fr/`
 * and a backslash-separated form for special schemes, and a stricter reader would
 * mis-locate the authority on exactly those inputs. The authority ends at the
 * first path, query or fragment delimiter.
 */
function rawAuthority(trimmed: string): string {
  const afterScheme = trimmed.slice(trimmed.indexOf(':') + 1).replace(/^[/\\]*/, '');
  const end = afterScheme.search(/[/?#\\]/);
  return end === -1 ? afterScheme : afterScheme.slice(0, end);
}

/**
 * Whether the caller wrote a port at all, default or not.
 *
 * Userinfo is dropped first (it may contain a colon of its own, and it is
 * refused a gate earlier in any case), and an IPv6 literal's brackets are
 * skipped so its interior colons are not mistaken for a port separator.
 */
function hasExplicitPort(authority: string): boolean {
  const at = authority.lastIndexOf('@');
  const hostPart = at === -1 ? authority : authority.slice(at + 1);
  const closingBracket = hostPart.lastIndexOf(']');
  const afterHost = closingBracket === -1 ? hostPart : hostPart.slice(closingBracket + 1);
  return afterHost.includes(':');
}

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

  // A TRAILING ROOT DOT IS NORMALISED AWAY, not carried.
  //
  // `www.example.fr.` and `www.example.fr` are the same name, and the WHATWG
  // parser keeps the dot. Carrying it would produce two `requested_host` values
  // for one host, two rows on the attempt identity index, and - worse - two
  // scope answers, because the registrable-domain lookup does not agree with
  // itself across the two spellings. Exactly ONE dot is removed: `example.fr..`
  // is not a spelling of anything and goes on to fail the suffix gate.
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (hostname === '') return { ok: false, reason: 'host_empty' };
  // Anything still carrying an empty label after that is malformed, and saying
  // so here matters: `tldts` TOLERATES a trailing dot and answers with the same
  // registrable domain either way, so `www.example.fr..` would otherwise pass
  // the suffix gate while remaining a hostname no resolver should be handed.
  if (hostname.split('.').includes('')) return { ok: false, reason: 'host_empty_label' };
  // Written back so the SERIALISED url agrees with the host that was checked.
  // `requested_url` and `requested_host` are stored side by side and are both
  // part of how an attempt is identified; letting them disagree about the same
  // host would put the contradiction in the evidence.
  if (url.hostname !== hostname) url.hostname = hostname;

  // An IP literal names no registrable domain, so it can neither be scoped to a
  // root nor be checked against one. No approved rule in this repository
  // permits requesting one.
  if (isIpLiteral(hostname)) return { ok: false, reason: 'host_is_ip_literal' };
  if (!hostname.includes('.')) return { ok: false, reason: 'host_without_dot' };

  const registrableDomain = icannRegistrableDomain(hostname);
  if (registrableDomain === null) return { ok: false, reason: 'no_icann_public_suffix' };

  // EVERY EXPLICIT PORT IS REFUSED, including the scheme's own default.
  //
  // The frozen contract is that a port is refused before DNS, and it has to be
  // read from what the caller WROTE: `url.port` is empty for `:443` on https
  // because the parser normalised it away, so testing that alone would enforce
  // the rule for `:8443` and silently exempt `:443`. A published default port
  // is also not something an official register has any reason to write, and
  // accepting it would mean two spellings of one request - which is one
  // spelling too many for a value that is part of an attempt's identity.
  const defaultPort = DEFAULT_PORT_FOR_SCHEME[url.protocol]!;
  if (url.port !== '' || hasExplicitPort(rawAuthority(trimmed))) {
    return { ok: false, reason: 'explicit_port' };
  }

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
 * SCHEME: a DOWNGRADE is navigating FROM a secure (https) root TO an insecure
 * (http) target - a hop the CALLER chose rather than one the server asked
 * for. It is not merely "the requested URL uses http". When the official
 * claim's OWN scheme is http, an http request anywhere inside the root's
 * scope is the root's native scheme, not a downgrade of anything: that is how
 * the site-policy bootstrap request, the root page itself, and every
 * ordinary page discovered from it are all reachable at all for an
 * http-published claim (correction: an earlier revision restricted an http
 * root to authorising only its own exact URL byte-for-byte, which made the
 * bootstrap request - a DIFFERENT URL on the same host - refuse itself
 * before any socket opened, silently killing acquisition for every
 * http-published claim; see the fix that removed that restriction). An https
 * root, by contrast, never authorises an http descendant at any path,
 * because that is always a downgrade the caller would be choosing on the
 * server's behalf.
 */
export function checkRootScope(root: ValidatedUrl, requested: ValidatedUrl): ScopeVerdict {
  if (requested.registrableDomain !== root.registrableDomain) {
    return { ok: false, reason: 'registrable_domain_outside_root' };
  }
  if (requested.scheme === 'http:' && root.scheme !== 'http:') {
    return { ok: false, reason: 'scheme_downgrade' };
  }
  return { ok: true };
}
