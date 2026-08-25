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

/**
 * What replaces a credential-bearing userinfo component.
 *
 * A fixed marker rather than a partial mask: nothing about the credential's
 * length, shape or alphabet survives, which a masked form would leak. In stored
 * evidence the marker is never read alone - it always appears on a row whose
 * `target_malformed` is true and whose `to_url_resolved` is NULL, and that
 * combination is what a reader identifies a redacted hop by.
 */
export const REDACTED_USERINFO = 'REDACTED';

export interface RedirectFacts {
  /**
   * The Location header as received, with ONE transformation and no other: a
   * userinfo component is replaced by `REDACTED_USERINFO`.
   *
   * `orgunit_redirect_observations` is APPEND-ONLY and `nwf_research` holds no
   * DELETE, so a credential written here could never afterwards be removed -
   * not by this repository and not by an operator using the research role. A
   * third party's `Location: https://user:secret@host/` is not evidence about
   * an institution's structure; the FACT that such a header arrived is. So the
   * fact is kept and the secret is not, and `userinfoRedacted` records that the
   * transformation happened rather than leaving the marker to be inferred.
   *
   * Nothing else is repaired.
   */
  toUrlRaw: string;
  /** True when a userinfo component was removed from `toUrlRaw`. */
  userinfoRedacted: boolean;
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
 *
 * A CREDENTIAL-BEARING TARGET IS TREATED AS MALFORMED, and that is a security
 * decision rather than a description. `validateRequestUrl` refuses userinfo
 * outright, so such a target can never become a request under any authority;
 * resolving it would therefore store a URL that exists only to be refused
 * later, and storing it with the credentials stripped would be a REPAIR - it
 * would turn `https://user:secret@evil.fr/` into the perfectly requestable
 * `https://evil.fr/` and make it promotable. Marking it malformed leaves
 * `to_url_resolved` NULL, and migration 0007's promotion foreign key matches on
 * `target_malformed = false`, so the database itself refuses to approve it.
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

  // Read the credential question off the PARSED target, not off the raw string:
  // a percent-encoded or otherwise obfuscated userinfo is still userinfo, and a
  // textual scan for "@" would both miss those and fire on an "@" in a path.
  const carriesUserinfo = target !== null && (target.username !== '' || target.password !== '');
  const toUrlRaw = carriesUserinfo && target !== null ? redactUserinfo(target) : locationRaw;

  if (target === null || carriesUserinfo) {
    return {
      toUrlRaw,
      userinfoRedacted: carriesUserinfo,
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
    userinfoRedacted: false,
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

/**
 * Rebuilds a credential-bearing Location from PARSED components only.
 *
 * Never by editing the raw string. A substring edit keeps whatever it failed to
 * match, and the one property this function must guarantee is that no byte of
 * the credential reaches its return value - which is only provable when the raw
 * string is not a source for it at all.
 */
function redactUserinfo(target: URL): string {
  const safe = new URL(target.toString());
  // Assigned through the URL object rather than assembled by concatenation.
  // Phase 1D's firewall refuses any expression that joins a value to a domain
  // with an "@" - the shape of an inferred mailbox - and it is right to: this
  // module has no business constructing an address, and the serialiser puts
  // the marker in the userinfo slot without that shape ever appearing here.
  safe.username = REDACTED_USERINFO;
  safe.password = '';
  return safe.toString();
}
