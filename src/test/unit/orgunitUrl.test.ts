/**
 * What this gateway will and will not turn into a socket, and how far a root's
 * authority reaches.
 *
 * The scope rule is SAME REGISTRABLE DOMAIN, not same host, because the units
 * this phase looks for genuinely live on sibling hosts. The registrable-domain
 * answer itself comes from Phase 1D's single implementation, which is what the
 * agreement test at the bottom exists to keep honest.
 */
import { describe, expect, it } from 'vitest';
import { checkRootScope, validateRequestUrl } from '../../orgunits/web/url.js';
import { icannRegistrableDomain, parseWebsiteCandidate } from '../../website/parse.js';

function ok(raw: string) {
  const result = validateRequestUrl(raw);
  if (!result.ok) throw new Error(`expected ${raw} to validate, got ${result.reason}`);
  return result.value;
}

function reason(raw: string | null | undefined): string {
  const result = validateRequestUrl(raw);
  return result.ok ? 'OK' : result.reason;
}

describe('validateRequestUrl: accepts an ordinary institutional URL', () => {
  it('keeps the host, domain, path and query', () => {
    expect(ok('https://international.example.ac.uk/en/offices?tab=1')).toEqual({
      url: 'https://international.example.ac.uk/en/offices?tab=1',
      scheme: 'https:',
      hostname: 'international.example.ac.uk',
      registrableDomain: 'example.ac.uk',
      port: 443,
      requestPath: '/en/offices?tab=1',
    });
  });

  it('lower-cases the host and normalises an empty path', () => {
    const value = ok('https://WWW.Example.FR');
    expect(value.hostname).toBe('www.example.fr');
    expect(value.requestPath).toBe('/');
  });

  it('accepts the scheme default port written explicitly', () => {
    expect(ok('https://example.fr:443/a').url).toBe('https://example.fr/a');
    expect(ok('http://example.fr:80/a').url).toBe('http://example.fr/a');
  });
});

describe('validateRequestUrl: refusals', () => {
  it('refuses a value that is not one address', () => {
    expect(reason(null)).toBe('blank');
    expect(reason('   ')).toBe('blank');
    expect(reason('https://a.fr /b')).toBe('interior_whitespace');
  });

  it('refuses a missing scheme rather than inventing one', () => {
    // Phase 1D may prefix https:// to CLASSIFY a published value. Doing it here
    // would invent the scheme of an actual request.
    expect(reason('www.example.fr')).toBe('scheme_missing');
    expect(reason('example.fr/path')).toBe('scheme_missing');
  });

  it('refuses a non-web scheme', () => {
    expect(reason('ftp://example.fr/')).toBe('scheme_not_http');
    expect(reason('file:///etc/passwd')).toBe('scheme_not_http');
    expect(reason('gopher://example.fr/')).toBe('scheme_not_http');
    expect(reason('javascript:alert(1)')).toBe('scheme_not_http');
  });

  it('refuses credentials in the URL', () => {
    expect(reason('https://user@example.fr/')).toBe('userinfo_present');
    expect(reason('https://user:pass@example.fr/')).toBe('userinfo_present');
    // The exact shape of the 55-email defect, aimed at a request this time.
    expect(reason('https://03014851@edu.gva.es/')).toBe('userinfo_present');
  });

  it('refuses an IP-literal host in either family', () => {
    // No approved rule in this repository permits requesting one, and an IP
    // literal names no registrable domain, so it can be scoped to no root.
    expect(reason('http://127.0.0.1/')).toBe('host_is_ip_literal');
    expect(reason('http://169.254.169.254/latest/meta-data/')).toBe('host_is_ip_literal');
    expect(reason('http://[::1]/')).toBe('host_is_ip_literal');
    expect(reason('http://[fd00::1]/')).toBe('host_is_ip_literal');
    expect(reason('http://10.0.0.1/')).toBe('host_is_ip_literal');
  });

  it('refuses a host that names no ICANN registrable domain', () => {
    expect(reason('http://localhost/')).toBe('host_without_dot');
    expect(reason('http://intranet/')).toBe('host_without_dot');
    expect(reason('https://www.fpvalencia/')).toBe('no_icann_public_suffix');
    expect(reason('https://host.invalidtld/')).toBe('no_icann_public_suffix');
  });

  it('refuses an unexpected explicit port', () => {
    expect(reason('http://example.fr:8080/')).toBe('non_default_port');
    expect(reason('https://example.fr:8443/')).toBe('non_default_port');
    expect(reason('https://example.fr:22/')).toBe('non_default_port');
    // Including the OTHER scheme's default, which is still not this scheme's.
    expect(reason('https://example.fr:80/')).toBe('non_default_port');
  });

  it('refuses a fragment, because it is not part of the request', () => {
    // Two URLs differing only by a fragment are the SAME request but would be
    // two rows on the attempt identity index.
    expect(reason('https://example.fr/a#section')).toBe('fragment_present');
  });
});

describe('checkRootScope', () => {
  const httpsRoot = ok('https://www.example.ac.uk/');
  const httpRoot = ok('http://www.legacy.fr/');

  it('admits a sibling host under the same registrable domain', () => {
    // The whole reason the boundary is the domain and not the host: ADR 0004 s4.
    for (const url of [
      'https://international.example.ac.uk/office',
      'https://langues.example.ac.uk/',
      'https://en.example.ac.uk/',
      'https://www2.example.ac.uk/',
      'https://www.example.ac.uk/deep/path',
    ]) {
      expect(checkRootScope(httpsRoot, ok(url)), url).toEqual({ ok: true });
    }
  });

  it('refuses a different registrable domain', () => {
    for (const url of [
      'https://example.fr/',
      'https://www.example.co.uk/',
      'https://evil.fr/',
      'https://example.ac.uk.evil.fr/',
    ]) {
      expect(checkRootScope(httpsRoot, ok(url)), url).toEqual({
        ok: false,
        reason: 'registrable_domain_outside_root',
      });
    }
  });

  it('refuses an HTTPS root authorising an HTTP descendant', () => {
    expect(checkRootScope(httpsRoot, ok('http://www.example.ac.uk/'))).toEqual({
      ok: false,
      reason: 'scheme_downgrade',
    });
    expect(checkRootScope(httpsRoot, ok('http://international.example.ac.uk/'))).toEqual({
      ok: false,
      reason: 'scheme_downgrade',
    });
  });

  it('lets an HTTP root be requested exactly as published, and no further', () => {
    // The point is to OBSERVE what the institution does with it - very often a
    // redirect to https, which is evidence rather than something to pre-empt.
    expect(checkRootScope(httpRoot, ok('http://www.legacy.fr/'))).toEqual({ ok: true });
    expect(checkRootScope(httpRoot, ok('http://www.legacy.fr/somewhere'))).toEqual({
      ok: false,
      reason: 'scheme_downgrade',
    });
    // Upgrading on our own initiative is fine: it is not a downgrade.
    expect(checkRootScope(httpRoot, ok('https://www.legacy.fr/anything'))).toEqual({ ok: true });
  });
});

describe('one registrable-domain implementation, shared with Phase 1D', () => {
  it('agrees with the website claim parser on every host it classifies', () => {
    // Two definitions of "same registrable domain" would be two trust
    // boundaries that can disagree, and here that would be a security defect
    // rather than a cosmetic one.
    for (const host of [
      'www.example.ac.uk',
      'international.sorbonne-nouvelle.fr',
      'a.b.c.gva.es',
      'example.com',
      'x.co.jp',
    ]) {
      const claim = parseWebsiteCandidate(host);
      expect(claim.registrableDomain, host).toBe(icannRegistrableDomain(host));
      expect(ok(`https://${host}/`).registrableDomain, host).toBe(claim.registrableDomain);
    }
  });

  it('returns null where no registrable domain exists', () => {
    expect(icannRegistrableDomain('localhost')).toBeNull();
    expect(icannRegistrableDomain('127.0.0.1')).toBeNull();
    expect(icannRegistrableDomain('host.invalidtld')).toBeNull();
  });
});
