/**
 * Redirect FACTS, derived and never followed.
 *
 * Every case here ends with a stored row and nothing else. No target is
 * requested, no target is elected a winner between two official website claims,
 * and no cross-domain target becomes a root.
 */
import { describe, expect, it } from 'vitest';
import { deriveRedirectFacts, REDACTED_USERINFO } from '../../orgunits/web/redirect.js';

const FROM = 'https://www.example.ac.uk/office';

describe('deriveRedirectFacts', () => {
  it('resolves an absolute same-host target', () => {
    expect(deriveRedirectFacts(FROM, 'https://www.example.ac.uk/en/office')).toEqual({
      toUrlRaw: 'https://www.example.ac.uk/en/office',
      userinfoRedacted: false,
      toUrlResolved: 'https://www.example.ac.uk/en/office',
      targetMalformed: false,
      schemeDowngraded: false,
      hostChanged: false,
      registrableDomainChanged: false,
    });
  });

  it('resolves a relative target against the request URL', () => {
    const facts = deriveRedirectFacts(FROM, '/international');
    expect(facts.toUrlRaw).toBe('/international');
    expect(facts.toUrlResolved).toBe('https://www.example.ac.uk/international');
    expect(facts.hostChanged).toBe(false);
  });

  it('keeps the raw header verbatim even when it is odd', () => {
    // A malformed or relative target is itself a finding, and repairing it in
    // place would erase it.
    const facts = deriveRedirectFacts(FROM, '  /spaced  ');
    expect(facts.toUrlRaw).toBe('  /spaced  ');
    expect(facts.toUrlResolved).toBe('https://www.example.ac.uk/spaced');
  });

  it('separates a host change from a registrable-domain change', () => {
    // international.example.ac.uk is inside the root; example.fr is not. One
    // enum could not have said both.
    const sameDomain = deriveRedirectFacts(FROM, 'https://international.example.ac.uk/');
    expect(sameDomain.hostChanged).toBe(true);
    expect(sameDomain.registrableDomainChanged).toBe(false);

    const crossDomain = deriveRedirectFacts(FROM, 'https://sorbonne-nouvelle.fr/');
    expect(crossDomain.hostChanged).toBe(true);
    expect(crossDomain.registrableDomainChanged).toBe(true);
  });

  it('records an HTTPS to HTTP hop as a downgrade', () => {
    const facts = deriveRedirectFacts(FROM, 'http://www.example.ac.uk/office');
    expect(facts.schemeDowngraded).toBe(true);
    expect(facts.hostChanged).toBe(false);
  });

  it('records an HTTP to HTTPS hop as no downgrade', () => {
    const facts = deriveRedirectFacts('http://www.example.ac.uk/', 'https://www.example.ac.uk/');
    expect(facts.schemeDowngraded).toBe(false);
    expect(facts.hostChanged).toBe(false);
    expect(facts.registrableDomainChanged).toBe(false);
  });

  it('leaves every derived fact NULL when the target cannot be resolved', () => {
    // "did the host change?" has no answer, and NULL is the only honest one -
    // which is exactly the shape the schema CHECK constraints require.
    for (const location of ['http://', 'https://', 'https://[unterminated', 'http://:80/']) {
      const facts = deriveRedirectFacts(FROM, location);
      expect(facts.targetMalformed, location).toBe(true);
      expect(facts.toUrlResolved, location).toBeNull();
      expect(facts.schemeDowngraded, location).toBeNull();
      expect(facts.hostChanged, location).toBeNull();
      expect(facts.registrableDomainChanged, location).toBeNull();
    }
  });

  it('treats a non-web target as unresolvable rather than inventing facts about it', () => {
    for (const location of ['mailto:someone@example.ac.uk', 'javascript:void(0)', 'tel:+3312']) {
      const facts = deriveRedirectFacts(FROM, location);
      expect(facts.targetMalformed, location).toBe(true);
      expect(facts.toUrlRaw, location).toBe(location);
    }
  });

  it('records a target with no registrable domain as a domain change', () => {
    // It resolved fine, so it is not malformed; and the honest answer to "did
    // the registrable domain change?" is yes - the request had one and this has
    // none. Recording it keeps the hop visible; the URL and address gates
    // refuse it again if anyone ever promotes it.
    const literal = deriveRedirectFacts(FROM, 'http://169.254.169.254/latest/meta-data/');
    expect(literal.targetMalformed).toBe(false);
    expect(literal.toUrlResolved).toBe('http://169.254.169.254/latest/meta-data/');
    expect(literal.hostChanged).toBe(true);
    expect(literal.registrableDomainChanged).toBe(true);
    expect(literal.schemeDowngraded).toBe(true);

    const intranet = deriveRedirectFacts(FROM, 'http://intranet/');
    expect(intranet.registrableDomainChanged).toBe(true);
  });

  it('REDACTS a credential-bearing target and makes it structurally unpromotable', () => {
    // The observation must survive - a redirect carrying credentials is a
    // finding worth keeping - but the credential must not, because
    // orgunit_redirect_observations is APPEND-ONLY and nwf_research holds no
    // DELETE, so a secret written here could never afterwards be removed.
    const facts = deriveRedirectFacts(FROM, 'https://user:pw@www.example.ac.uk/x?a=1');

    expect(facts.userinfoRedacted).toBe(true);
    expect(REDACTED_USERINFO).toBe('REDACTED');
    expect(facts.toUrlRaw).toBe('https://REDACTED@www.example.ac.uk/x?a=1');
    expect(facts.toUrlRaw).not.toContain('pw');
    expect(facts.toUrlRaw).not.toContain('user');

    // targetMalformed = true leaves to_url_resolved NULL, and migration 0007's
    // promotion foreign key matches on target_malformed = false - so the
    // DATABASE refuses to approve it as a root, not merely this code.
    expect(facts.targetMalformed).toBe(true);
    expect(facts.toUrlResolved).toBeNull();
    expect(facts.schemeDowngraded).toBeNull();
    expect(facts.hostChanged).toBeNull();
    expect(facts.registrableDomainChanged).toBeNull();
  });

  it('redacts a username-only target, and one whose credentials are encoded', () => {
    const userOnly = deriveRedirectFacts(FROM, 'https://admin@www.example.ac.uk/');
    expect(userOnly.userinfoRedacted).toBe(true);
    expect(userOnly.toUrlRaw).not.toContain('admin');
    expect(userOnly.targetMalformed).toBe(true);

    // Percent-encoding is not a way around it: the question is asked of the
    // PARSED target, never of the raw string.
    const encoded = deriveRedirectFacts(FROM, 'https://a%40b:s%3Ac@www.example.ac.uk/');
    expect(encoded.userinfoRedacted).toBe(true);
    expect(encoded.toUrlRaw).not.toContain('s%3Ac');
    expect(encoded.targetMalformed).toBe(true);
  });

  it('leaves an ordinary target completely unredacted', () => {
    // An "@" in a PATH is not userinfo and must not trip the redaction.
    const facts = deriveRedirectFacts(FROM, 'https://www.example.ac.uk/staff/a@b');
    expect(facts.userinfoRedacted).toBe(false);
    expect(facts.toUrlRaw).toBe('https://www.example.ac.uk/staff/a@b');
    expect(facts.targetMalformed).toBe(false);
  });

  it('records an explicit port in the target without repairing it', () => {
    // The gateway REFUSES to request a URL with an explicit port. Recording one
    // a server sent is a different thing, and it stays exactly as received.
    const withPort = deriveRedirectFacts(FROM, 'https://www.example.ac.uk:8443/x');
    expect(withPort.toUrlResolved).toBe('https://www.example.ac.uk:8443/x');
    expect(withPort.hostChanged).toBe(false);
    expect(withPort.userinfoRedacted).toBe(false);
  });

  it('never implies a domain change without a host change', () => {
    // The schema's domain_implies_host CHECK, made structural rather than
    // incidental.
    for (const location of [
      'https://www.example.ac.uk/x',
      'https://international.example.ac.uk/',
      'https://elsewhere.fr/',
      'http://intranet/',
    ]) {
      const facts = deriveRedirectFacts(FROM, location);
      if (facts.registrableDomainChanged === true) {
        expect(facts.hostChanged, location).toBe(true);
      }
    }
  });
});
