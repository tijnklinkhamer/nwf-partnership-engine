/**
 * ADR 0013's OPTION-C-LITE BOUNDARY, AS A PURE PREDICATE.
 *
 * `continuationTargetFor` is the whole of what may be continued after a
 * robots.txt 3xx. Everything it returns null for stays exactly as it was
 * under `orgunit-fetch-policy-v1` and `-v2`: the policy is unread and every
 * ordinary page on that host is `ROBOTS_UNREADABLE`.
 *
 * WHAT MOVED FROM ADR 0012, AND ONLY IT: the host boundary went from
 * BYTE-IDENTICAL HOSTNAME to SAME REGISTRABLE DOMAIN. The three cases below
 * that used to assert a refusal - a `www.` label dropped, a `www.` label
 * added, a sibling host - now assert a continuation, and each says so. A
 * cross-registrable-domain target is still refused, which is the line this
 * repository holds tighter than RFC 9309 s2.3.1.2's "even across
 * authorities".
 *
 * THE PREDICATE ALSO REPORTS WHETHER THE HOST CHANGED, because two things
 * downstream turn on it and neither may recompute it: the distinct-host
 * budget, and whether the resulting policy may be memoised under the target
 * origin. Every case below asserts that flag, not just the URL.
 *
 * THE REDIRECT FACTS ARE DERIVED, NOT HAND-BUILT. Every case below runs the
 * real `deriveRedirectFacts` over a real `Location` value, because the
 * predicate leans on decisions that module already makes - above all that a
 * credential-bearing target is MALFORMED rather than repairable - and a
 * hand-written facts object would let this file agree with itself while
 * disagreeing with the gateway.
 *
 * PURE. No database, no network, no fixture.
 */
import { describe, expect, it } from 'vitest';
import { continuationTargetFor } from '../../orgunits/web/robots.js';
import { deriveRedirectFacts } from '../../orgunits/web/redirect.js';
import { MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS } from '../../orgunits/web/policy.js';
import type { WebAttemptResult } from '../../orgunits/web/gateway.js';

/**
 * A fetch observation shaped exactly as the gateway returns one for a 3xx:
 * a status, no error, no body of interest, and derived redirect facts.
 */
function redirected(requestedUrl: string, location: string, status = 301): WebAttemptResult {
  return {
    observationId: 'obs-1',
    duplicateOfExistingAttempt: false,
    runId: 'run-1',
    rootKey: 'claim:00000000-0000-0000-0000-000000000001',
    requestedUrl,
    attemptNo: 1,
    networkVantage: 'test-vantage',
    errorSubtype: null,
    httpStatus: status,
    errorKind: null,
    errorDetail: null,
    contentType: 'text/html',
    responseSha256: null,
    byteCount: 0,
    truncated: false,
    body: null,
    redirect: deriveRedirectFacts(requestedUrl, location),
    redirectObservationId: 'redir-1',
    resolvedIpFamily: 'IPV4',
    resolvedIpIsPublic: true,
    plan: null,
  };
}

const HTTP = 'http://www.example.ac.uk/robots.txt';
const HTTPS = 'https://www.example.ac.uk/robots.txt';

describe('ADR 0013: the continuable robots.txt redirect shapes', () => {
  it('CONTINUES an http -> https upgrade on the identical hostname', () => {
    // ADR 0012's shape, unchanged: the acquisition-yield diagnostic's
    // selection index 5, whose official ECHE claim publishes an http://
    // scheme and whose server canonicalises to https on the same hostname.
    expect(continuationTargetFor(HTTP, redirected(HTTP, HTTPS))).toEqual({
      url: HTTPS,
      hostChanged: false,
    });
  });

  it('REFUSES a relative Location, because one cannot express this upgrade', () => {
    // Worth pinning rather than assuming. A relative or scheme-relative
    // Location resolves against the REQUEST's own scheme, so from
    // http://host/robots.txt both `/robots.txt` and `//host/robots.txt`
    // resolve straight back to the URL just requested - a loop, not an
    // upgrade. The only Location that can be continued is an absolute https
    // one, which is also the only form a server canonicalising its scheme has
    // any reason to send.
    for (const location of ['/robots.txt', '//www.example.ac.uk/robots.txt']) {
      expect(continuationTargetFor(HTTP, redirected(HTTP, location)), location).toBeNull();
    }
  });

  it('CONTINUES across every redirect status the policy recognises', () => {
    for (const status of [301, 302, 303, 307, 308]) {
      expect(
        continuationTargetFor(HTTP, redirected(HTTP, HTTPS, status)),
        `status ${status}`,
      ).toEqual({ url: HTTPS, hostChanged: false });
    }
  });

  it('CONTINUES a www label being dropped, and reports the host change', () => {
    // THE ADR 0013 LINE. ADR 0012 refused this on the premise that a policy
    // retrieved from another origin cannot govern the original one. RFC 9309
    // s2.3.1.2 says otherwise: a robots.txt reached through redirects - "even
    // across authorities" - MUST have its rules followed in the context of
    // the INITIAL authority. This is the shape selection index 1 and
    // selection index 7 both exhibit.
    expect(
      continuationTargetFor(HTTPS, redirected(HTTPS, 'https://example.ac.uk/robots.txt')),
    ).toEqual({ url: 'https://example.ac.uk/robots.txt', hostChanged: true });
  });

  it('CONTINUES a www label being added', () => {
    const apex = 'https://example.ac.uk/robots.txt';
    expect(
      continuationTargetFor(apex, redirected(apex, 'https://www.example.ac.uk/robots.txt')),
    ).toEqual({ url: 'https://www.example.ac.uk/robots.txt', hostChanged: true });
  });

  it('CONTINUES a sibling host under the same registrable domain', () => {
    // Not narrowed to a `www.` rule. The boundary is the registrable domain,
    // computed by the one `tldts` implementation this repository has - a
    // narrower "www only" rule would be a second, hand-written host taxonomy.
    expect(
      continuationTargetFor(
        HTTPS,
        redirected(HTTPS, 'https://international.example.ac.uk/robots.txt'),
      ),
    ).toEqual({ url: 'https://international.example.ac.uk/robots.txt', hostChanged: true });
  });

  it('CONTINUES an http -> https upgrade that ALSO changes host', () => {
    const httpApex = 'http://example.ac.uk/robots.txt';
    expect(continuationTargetFor(httpApex, redirected(httpApex, HTTPS))).toEqual({
      url: HTTPS,
      hostChanged: true,
    });
  });

  it('REFUSES a registrable-domain SIBLING that merely shares a label', () => {
    // `example.ac.uk` and `example-two.ac.uk` are different registrable
    // domains under the same public suffix, and `ac.uk` is a multi-label
    // suffix - which is exactly the case a naive "last two labels" rule gets
    // wrong. The single tldts implementation is what makes this right.
    expect(
      continuationTargetFor(HTTPS, redirected(HTTPS, 'https://www.example-two.ac.uk/robots.txt')),
    ).toBeNull();
  });

  it('REFUSES a cross-registrable-domain target', () => {
    expect(
      continuationTargetFor(HTTPS, redirected(HTTPS, 'https://evil.example.com/robots.txt')),
    ).toBeNull();
  });

  it('REFUSES an https -> http downgrade', () => {
    // Refused on its own merits. NOTE that it is no longer ALSO the reason a
    // cycle is unreachable: ADR 0012's structural two-request argument relied
    // on the host being fixed, and C-lite admits a host change. The bound is
    // now MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS alone - see policy.ts.
    expect(continuationTargetFor(HTTPS, redirected(HTTPS, HTTP))).toBeNull();
    const apexHttp = 'http://example.ac.uk/robots.txt';
    expect(continuationTargetFor(HTTPS, redirected(HTTPS, apexHttp)), 'cross-host').toBeNull();
  });

  it('REFUSES any path other than exactly /robots.txt', () => {
    for (const path of [
      '/robots-policy.txt',
      '/robots.txt/',
      '/ROBOTS.TXT',
      '/',
      '/a/robots.txt',
    ]) {
      expect(
        continuationTargetFor(HTTP, redirected(HTTP, `https://www.example.ac.uk${path}`)),
        path,
      ).toBeNull();
    }
  });

  it('REFUSES a query or a fragment on the target', () => {
    expect(continuationTargetFor(HTTP, redirected(HTTP, `${HTTPS}?v=2`))).toBeNull();
    expect(continuationTargetFor(HTTP, redirected(HTTP, `${HTTPS}#top`))).toBeNull();
  });

  it('REFUSES a credential-bearing target, and never sees the credential', () => {
    // redirect.ts classifies userinfo as MALFORMED with to_url_resolved NULL,
    // precisely so that no layer above it can strip the credentials and
    // request the remainder. This asserts that decision is load-bearing here.
    const result = redirected(HTTP, 'https://user:secret@www.example.ac.uk/robots.txt');
    expect(result.redirect?.targetMalformed).toBe(true);
    expect(result.redirect?.toUrlResolved).toBeNull();
    expect(continuationTargetFor(HTTP, result)).toBeNull();
  });

  it('REFUSES a non-http(s) or unparsable target', () => {
    for (const location of [
      'ftp://www.example.ac.uk/robots.txt',
      'javascript:void(0)',
      'ht!tp://',
    ]) {
      expect(continuationTargetFor(HTTP, redirected(HTTP, location)), location).toBeNull();
    }
  });

  it('REFUSES an explicit non-default port', () => {
    expect(
      continuationTargetFor(HTTP, redirected(HTTP, 'https://www.example.ac.uk:8443/robots.txt')),
    ).toBeNull();
    // Including on a host-changing target, where a self-redirect refusal
    // could no longer catch it.
    expect(
      continuationTargetFor(HTTPS, redirected(HTTPS, 'https://example.ac.uk:8443/robots.txt')),
    ).toBeNull();
  });

  it('REFUSES a redirect to the URL just requested', () => {
    // A self-redirect offers no new bytes, and continuing to it would reach
    // the gateway's own DUPLICATE_ATTEMPT refusal. This is also why a
    // Location that merely spells out the default port is refused: the URL
    // parser erases :443, so it resolves to the identical string.
    expect(continuationTargetFor(HTTPS, redirected(HTTPS, HTTPS))).toBeNull();
    expect(
      continuationTargetFor(HTTPS, redirected(HTTPS, 'https://www.example.ac.uk:443/robots.txt')),
    ).toBeNull();
    expect(
      continuationTargetFor(HTTPS, redirected(HTTPS, 'https://WWW.EXAMPLE.AC.UK/robots.txt')),
    ).toBeNull();
  });

  it('REFUSES when there are no redirect facts at all', () => {
    const plain = redirected(HTTPS, HTTPS);
    expect(continuationTargetFor(HTTPS, { ...plain, redirect: null })).toBeNull();
  });

  it('bounds the continuation at exactly ONE hop', () => {
    // Not ADR 0008's five, and not RFC 9309 s2.3.1.2's "at least five"
    // either. A policy resource has no multi-hop journey to make, and the
    // second response is final whatever it says.
    expect(MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS).toBe(1);
  });
});
