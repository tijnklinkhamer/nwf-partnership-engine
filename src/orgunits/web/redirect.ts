/**
 * REDIRECT FACTS, derived and never followed.
 *
 * A 3xx is an INSTRUCTION FROM A THIRD PARTY. This module turns one into the
 * separate, independently-true facts migration 0007 stores, and does nothing
 * else with it: no target is requested here or anywhere else in this slice, no
 * target is elected a winner, and no cross-domain hop becomes a root.
 *
 * The facts are kept separate rather than collapsed into one enum because a
 * single hop can be several things at once - the host can change while the
 * registrable domain does not, and the scheme can be downgraded at the same
 * time - and a lossy label would decide at write time, invisibly, which of
 * those mattered.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import { icannRegistrableDomain } from '../../website/parse.js';

export interface RedirectFacts {
  /** The Location header EXACTLY as received. Never repaired. */
  toUrlRaw: string;
  /** Resolved against the request URL, or null when it could not be. */
  toUrlResolved: string | null;
  targetMalformed: boolean;
  /** All three are null exactly when the target could not be resolved. */
  schemeDowngraded: boolean | null;
  hostChanged: boolean | null;
  registrableDomainChanged: boolean | null;
}

/**
 * Derives the stored facts for one observed 3xx.
 *
 * `targetMalformed` means "this gateway could not resolve the header into an
 * http(s) target it could reason about". That covers an unparsable value and a
 * non-web scheme (`mailto:`, `javascript:`), because for either of those the
 * remaining three questions have no answer and NULL is the only honest one -
 * which is exactly the shape the schema's CHECK constraints require.
 *
 * A target whose host names no ICANN registrable domain - an IP literal, an
 * intranet name - is NOT malformed. It resolved fine, and the honest answer to
 * "did the registrable domain change?" is yes: the request had one and the
 * target has none. Recording it that way keeps the hop visible as evidence,
 * and the address and scheme checks refuse it again if anyone ever promotes it.
 */
export function deriveRedirectFacts(requestUrl: string, locationRaw: string): RedirectFacts {
  const base = new URL(requestUrl);
  const requestDomain = icannRegistrableDomain(base.hostname);

  let target: URL | null;
  try {
    target = new URL(locationRaw, base);
  } catch {
    target = null;
  }
  if (target !== null && target.protocol !== 'http:' && target.protocol !== 'https:') {
    target = null;
  }

  if (target === null) {
    return {
      toUrlRaw: locationRaw,
      toUrlResolved: null,
      targetMalformed: true,
      schemeDowngraded: null,
      hostChanged: null,
      registrableDomainChanged: null,
    };
  }

  const targetHost = target.hostname.toLowerCase();
  const targetDomain = icannRegistrableDomain(targetHost);
  const hostChanged = targetHost !== base.hostname.toLowerCase();

  return {
    toUrlRaw: locationRaw,
    toUrlResolved: target.toString(),
    targetMalformed: false,
    schemeDowngraded: base.protocol === 'https:' && target.protocol === 'http:',
    hostChanged,
    // A change of registrable domain always implies a change of host, which is
    // what the schema's domain_implies_host CHECK requires. Guarding on
    // hostChanged makes that structural rather than incidental.
    registrableDomainChanged:
      hostChanged && (targetDomain === null || targetDomain !== requestDomain),
  };
}
