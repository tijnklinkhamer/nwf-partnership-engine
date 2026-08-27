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
});

describe('validateRequestUrl: the explicit-port contract, read from the RAW input', () => {
  // The frozen contract is that an explicit port is refused BEFORE DNS. It has
  // to be checked against what the caller WROTE, because the WHATWG parser
  // erases a scheme-default port: `https://x.fr:443/` leaves `url.port === ''`,
  // exactly like `https://x.fr/`. A check written against `url.port` alone
  // therefore enforces the rule for :8443 and silently exempts :443 - it can
  // never fire for the two ports it is the sole defence against.
  it('refuses the scheme default port written explicitly', () => {
    expect(reason('https://example.fr:443/')).toBe('explicit_port');
    expect(reason('http://example.fr:80/')).toBe('explicit_port');
  });

  it('refuses the OTHER scheme default, which is not this scheme default either', () => {
    expect(reason('https://example.fr:80/')).toBe('explicit_port');
    expect(reason('http://example.fr:443/')).toBe('explicit_port');
  });

  it('refuses any other explicit port', () => {
    expect(reason('https://example.fr:8443/')).toBe('explicit_port');
    expect(reason('http://example.fr:8080/')).toBe('explicit_port');
    expect(reason('https://example.fr:22/')).toBe('explicit_port');
    expect(reason('https://example.fr:0/')).toBe('explicit_port');
  });

  it('refuses an empty explicit port marker', () => {
    // `https://x.fr:/a` parses and leaves url.port empty. The caller still
    // wrote a port separator, and a value that needed interpreting to become
    // requestable is refused rather than interpreted.
    expect(reason('https://example.fr:/a')).toBe('explicit_port');
  });

  it('accepts the same URLs without a port', () => {
    expect(ok('https://example.fr/a').url).toBe('https://example.fr/a');
    expect(ok('http://example.fr/a').url).toBe('http://example.fr/a');
  });

  it('does not mistake a colon elsewhere in the URL for a port', () => {
    // The authority ends at the first path, query or fragment delimiter.
    expect(ok('https://example.fr/a:b').requestPath).toBe('/a:b');
    expect(ok('https://example.fr/a?t=1:2').requestPath).toBe('/a?t=1:2');
  });

  it('reports userinfo rather than a port when both are present', () => {
    // Userinfo is refused a gate earlier, and its own colon must not be read
    // as a port separator by the raw-authority reader.
    expect(reason('https://user:pass@example.fr/')).toBe('userinfo_present');
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

  it('lets an HTTP root authorise http requests anywhere in its scope, not just its own exact URL', () => {
    // Shadow-validation finding (2026-08): the http bootstrap request for
    // robots.txt is a DIFFERENT URL from the root itself, so restricting an
    // http root to "exactly as published, and no further" made every
    // http-published claim refuse its own robots.txt fetch before any socket
    // opened - killing acquisition for 17.4% of structurally-valid ECHE
    // claims. An http root is not a downgrade of anything; it is the root's
    // own native scheme.
    expect(checkRootScope(httpRoot, ok('http://www.legacy.fr/'))).toEqual({ ok: true });
    expect(checkRootScope(httpRoot, ok('http://www.legacy.fr/robots.txt'))).toEqual({ ok: true });
    expect(checkRootScope(httpRoot, ok('http://www.legacy.fr/somewhere'))).toEqual({ ok: true });
    expect(checkRootScope(httpRoot, ok('http://sub.legacy.fr/deep/path'))).toEqual({ ok: true });
    // Upgrading on our own initiative is fine: it is not a downgrade.
    expect(checkRootScope(httpRoot, ok('https://www.legacy.fr/anything'))).toEqual({ ok: true });
  });
});

describe('checkRootScope: the boundary cases the design audit named', () => {
  const root = ok('https://univ-evry.fr/');

  it('accepts www and the apex against each other, in both directions', () => {
    expect(checkRootScope(root, ok('https://www.univ-evry.fr/'))).toEqual({ ok: true });
    expect(checkRootScope(ok('https://www.univ-evry.fr/'), ok('https://univ-evry.fr/'))).toEqual({
      ok: true,
    });
  });

  it('accepts a deeper subdomain under the same registrable domain', () => {
    expect(checkRootScope(root, ok('https://ri.international.univ-evry.fr/x'))).toEqual({
      ok: true,
    });
  });

  it('REFUSES notuniv-evry.fr, which merely ends with the root domain as text', () => {
    // The exact shape a string `endsWith` check gets wrong. `univ-evry.fr` is
    // a suffix of `notuniv-evry.fr` as TEXT and names a different registrant.
    expect(checkRootScope(root, ok('https://notuniv-evry.fr/'))).toEqual({
      ok: false,
      reason: 'registrable_domain_outside_root',
    });
    expect(checkRootScope(root, ok('https://www.notuniv-evry.fr/'))).toEqual({
      ok: false,
      reason: 'registrable_domain_outside_root',
    });
    // And the other direction: the root domain as a PREFIX of another.
    expect(checkRootScope(root, ok('https://univ-evry.fr.evil.fr/'))).toEqual({
      ok: false,
      reason: 'registrable_domain_outside_root',
    });
  });

  it('compares IDN hosts deterministically, in punycode', () => {
    // The WHATWG parser normalises a unicode host to its A-label form, so both
    // spellings of one host produce one hostname and one registrable domain.
    // Asserted rather than assumed: an implicit answer here would be a trust
    // boundary nobody checked.
    const unicode = ok('https://université-exemple.fr/');
    const puny = ok('https://xn--universit-exemple-jtb.fr/');
    expect(unicode.hostname).toBe(puny.hostname);
    expect(unicode.registrableDomain).toBe(puny.registrableDomain);
    expect(unicode.hostname.startsWith('xn--')).toBe(true);

    const idnRoot = ok('https://université-exemple.fr/');
    expect(checkRootScope(idnRoot, puny)).toEqual({ ok: true });
    expect(checkRootScope(idnRoot, ok('https://sous.université-exemple.fr/'))).toEqual({
      ok: true,
    });
    expect(checkRootScope(idnRoot, ok('https://autre-exemple.fr/'))).toEqual({
      ok: false,
      reason: 'registrable_domain_outside_root',
    });
  });

  it('normalises a trailing root dot before comparing', () => {
    // `example.fr.` and `example.fr` are the same name. Two rows on the attempt
    // identity index, and two different scope answers, would both be wrong.
    const dotted = ok('https://www.univ-evry.fr./');
    expect(dotted.hostname).toBe('www.univ-evry.fr');
    expect(dotted.registrableDomain).toBe('univ-evry.fr');
    // The SERIALISED url is normalised too, so requested_url and requested_host
    // cannot disagree about the same host in the stored evidence.
    expect(dotted.url).toBe('https://www.univ-evry.fr/');
    expect(checkRootScope(root, dotted)).toEqual({ ok: true });
    // And a dotted ROOT reaches the same answer as an undotted one.
    expect(checkRootScope(ok('https://univ-evry.fr./'), ok('https://www.univ-evry.fr/'))).toEqual({
      ok: true,
    });
    // More than one trailing dot is not a spelling of anything.
    expect(reason('https://www.univ-evry.fr../')).toBe('host_empty_label');
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
