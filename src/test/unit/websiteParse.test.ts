/**
 * The strict website candidate parser.
 *
 * THE REGRESSION SUITE FOR A REAL DEFECT. Every value under "live ECHE
 * defects" below was published in the official ECHE artifact's "Website Url"
 * column and was accepted by the legacy Phase 1A path. The 55 email addresses
 * are the worst of them: prefixing "https://" to "03014851@edu.gva.es"
 * produces a parsable URL whose registrable domain is "gva.es", so the legacy
 * path fabricated a website for an institution out of an education
 * authority's mail domain.
 *
 * If any assertion here is ever relaxed, that defect is back.
 */
import { describe, expect, it } from 'vitest';
import {
  parseWebsiteCandidate,
  WEBSITE_PARSE_RULE_VERSION,
  type WebsiteStructuralStatus,
} from '../../website/parse.js';

function statusOf(raw: string | null): WebsiteStructuralStatus {
  return parseWebsiteCandidate(raw).status;
}

describe('website parse: live ECHE defects - EMAIL ADDRESSES ARE NOT WEBSITES', () => {
  // Verbatim values from the live artifact. 55 rows are email addresses.
  const publishedEmails = [
    '03014851@edu.gva.es',
    'science.hernan@gmail.com',
    'legta.angers@educagri.fr',
    'ce.0040490l@ac-aix-marseille.fr',
    'ce.0620040G@ac-lille.fr',
    'jefatura@navarrosantafe.com',
    'iesstaluciadeltrampal@edu.gobex.ex',
    'www.ies.sanfernando@edu.gobex.es',
    'www.legta.laval@educagri.fr',
    'ibarrekolanada@ibarrekolanda.net/www.ibarrekolanada.net',
    'http://www.lyc-joliotcurie@ac-aix-marseille.fr',
    'http://lp.jean.perrin@ac-reunion.fr',
    '46006495@edu.gva.es/iespesetaleixandre.edu.gva.es',
  ];

  it.each(publishedEmails)('classifies %s as NOT_A_WEBSITE', (value) => {
    const candidate = parseWebsiteCandidate(value);
    expect(candidate.status).toBe('NOT_A_WEBSITE');
    expect(candidate.reason).toBe('userinfo_present');
  });

  it('derives NO domain from an email address', () => {
    const candidate = parseWebsiteCandidate('03014851@edu.gva.es');
    // The legacy path produced "gva.es" here. That value belonged to a
    // regional education authority's mail domain, not to this institution.
    expect(candidate.registrableDomain).toBeNull();
    expect(candidate.hostname).toBeNull();
    expect(candidate.normalisedUrl).toBeNull();
  });

  it('keeps the published value verbatim even when rejecting it', () => {
    expect(parseWebsiteCandidate('03014851@edu.gva.es').rawValue).toBe('03014851@edu.gva.es');
  });

  it('rejects a URL carrying explicit credentials', () => {
    const candidate = parseWebsiteCandidate('https://user:secret@example.fr/');
    expect(candidate.status).toBe('NOT_A_WEBSITE');
    expect(candidate.reason).toBe('userinfo_present');
  });
});

describe('website parse: live ECHE defects - hosts outside the ICANN suffix set', () => {
  // Exactly five live values fail this gate. One of them
  // ("iesstaluciadeltrampal@edu.gobex.ex") is ALSO an email address and is
  // caught a gate earlier, which is why the two defect counts overlap by one.
  const publishedNonDomains = [
    'www.iesmenendezpidal',
    'www.escuelasanitaria/educacion.navarra.es',
    'www.fpvalencia',
    'www.lka',
  ];

  it.each(publishedNonDomains)('classifies %s as NOT_A_WEBSITE', (value) => {
    const candidate = parseWebsiteCandidate(value);
    expect(candidate.status).toBe('NOT_A_WEBSITE');
    expect(candidate.reason).toBe('no_icann_public_suffix');
    expect(candidate.registrableDomain).toBeNull();
  });

  it('rejects an invented TLD even when the value is otherwise well formed', () => {
    // "gobex.ex" - .ex is not a TLD. The live artifact publishes it inside an
    // email address; on its own it must still be rejected.
    const candidate = parseWebsiteCandidate('https://edu.gobex.ex/');
    expect(candidate.status).toBe('NOT_A_WEBSITE');
    expect(candidate.reason).toBe('no_icann_public_suffix');
  });

  it('rejects a reserved TLD that can never resolve', () => {
    expect(statusOf('https://www.example.invalid/')).toBe('NOT_A_WEBSITE');
  });
});

describe('website parse: live ECHE defects - MALFORMED free text', () => {
  it('classifies a SIRET number as MALFORMED, not as a host', () => {
    // A bare run of digits is a company registration number, not an address.
    // It is rejected at the parse gate rather than the dot gate: WHATWG URL
    // refuses an all-numeric host outright, reading it as a malformed IPv4
    // literal. Either way it never becomes a domain.
    const candidate = parseWebsiteCandidate('20004497200087');
    expect(candidate.status).toBe('MALFORMED');
    expect(candidate.reason).toBe('unparsable');
    expect(candidate.registrableDomain).toBeNull();
  });

  it('classifies a bare dotless token as MALFORMED', () => {
    const candidate = parseWebsiteCandidate('intranet');
    expect(candidate.status).toBe('MALFORMED');
    expect(candidate.reason).toBe('host_without_dot');
    expect(candidate.registrableDomain).toBeNull();
  });

  it('classifies two URLs in one cell as MALFORMED', () => {
    const candidate = parseWebsiteCandidate('www.uoi.gr / www.rc.uoi.gr');
    expect(candidate.status).toBe('MALFORMED');
    expect(candidate.reason).toBe('interior_whitespace');
    // Neither of the two is chosen. Picking one would be a guess about which
    // site the institution meant.
    expect(candidate.hostname).toBeNull();
  });

  it('classifies an email and a URL in one cell as MALFORMED', () => {
    expect(statusOf('38002791@gobiernodecanarias.org / http://www.lalaboral.com')).toBe(
      'MALFORMED',
    );
  });

  it.each(['http//www.univ-perp.fr', 'http//lyceefrancoismarty.org'])(
    'classifies the broken scheme %s as MALFORMED',
    (value) => {
      const candidate = parseWebsiteCandidate(value);
      expect(candidate.status).toBe('MALFORMED');
      expect(candidate.reason).toBe('broken_scheme');
    },
  );

  it('does not repair a broken scheme into a working URL', () => {
    // The obvious "fix" is to insert the missing colon. That is a guess about
    // what the source meant, and this repository does not make those.
    expect(parseWebsiteCandidate('http//www.univ-perp.fr').normalisedUrl).toBeNull();
  });

  it.each([
    'www. iesadaja.centros.educa.jcyl.es',
    'lyc-newton-clichy@ac-versailles .fr',
    'www. hopitaux-st-maurice.fr',
  ])('classifies the interior-whitespace value %s as MALFORMED', (value) => {
    expect(statusOf(value)).toBe('MALFORMED');
  });

  it('does not mistake an ordinary host beginning with a scheme word', () => {
    // "httpwww.example.fr" merely starts with those letters; it is a host.
    expect(statusOf('httpwww.example.fr')).toBe('STRUCTURALLY_VALID');
  });
});

describe('website parse: values that ARE structurally valid', () => {
  it('accepts a bare hostname, which 4,271 live values need', () => {
    const candidate = parseWebsiteCandidate('www.uni-graz.at');
    expect(candidate.status).toBe('STRUCTURALLY_VALID');
    expect(candidate.normalisedUrl).toBe('https://www.uni-graz.at/');
    expect(candidate.hostname).toBe('www.uni-graz.at');
    expect(candidate.registrableDomain).toBe('uni-graz.at');
  });

  it('accepts an explicit http URL without upgrading its scheme', () => {
    const candidate = parseWebsiteCandidate('http://www.univ-paris1.fr');
    expect(candidate.status).toBe('STRUCTURALLY_VALID');
    expect(candidate.normalisedUrl).toBe('http://www.univ-paris1.fr/');
  });

  it('keeps hostname and registrable domain SEPARATE', () => {
    const candidate = parseWebsiteCandidate('https://intl.study.subdomain-test.co.uk/en');
    expect(candidate.hostname).toBe('intl.study.subdomain-test.co.uk');
    expect(candidate.registrableDomain).toBe('subdomain-test.co.uk');
    // Collapsing the two would lose the distinction that 374 live rows share a
    // hostname while 1,021 share only a registrable domain.
    expect(candidate.hostname).not.toBe(candidate.registrableDomain);
  });

  it('stays structurally valid on a shared regional portal host', () => {
    // 52 live rows publish a gva.es address and 50 publish madrid.org. Sharing
    // a domain is a fact about the domain, never a reason to reject a value
    // and never evidence that two rows are one institution.
    const first = parseWebsiteCandidate('http://www.edu.gva.es/centro/03014851');
    const second = parseWebsiteCandidate('http://www.edu.gva.es/centro/12005544');
    expect(first.status).toBe('STRUCTURALLY_VALID');
    expect(second.status).toBe('STRUCTURALLY_VALID');
    expect(first.registrableDomain).toBe('gva.es');
    expect(second.registrableDomain).toBe(first.registrableDomain);
    expect(first.hostname).toBe(second.hostname);
  });

  it('lower-cases the host but leaves the path alone', () => {
    const candidate = parseWebsiteCandidate('https://WWW.Example.FR/Path/To/Page');
    expect(candidate.hostname).toBe('www.example.fr');
    expect(candidate.normalisedUrl).toContain('/Path/To/Page');
  });

  it('accepts a multi-label public suffix', () => {
    const candidate = parseWebsiteCandidate('https://www.a.b.c.gouv.fr/');
    expect(candidate.status).toBe('STRUCTURALLY_VALID');
    expect(candidate.registrableDomain).toBe('c.gouv.fr');
  });
});

describe('website parse: absence and non-web schemes', () => {
  it.each([null, undefined, '', '   '])('treats %s as ABSENT', (value) => {
    const candidate = parseWebsiteCandidate(value);
    expect(candidate.status).toBe('ABSENT');
    expect(candidate.reason).toBe('blank');
    expect(candidate.registrableDomain).toBeNull();
  });

  it('distinguishes ABSENT from MALFORMED', () => {
    // "the source published nothing" and "the source published something bad"
    // are different findings and must never be merged.
    expect(statusOf(null)).toBe('ABSENT');
    expect(statusOf('20004497200087')).toBe('MALFORMED');
  });

  it.each(['mailto:info@example.fr', 'ftp://files.example.fr/', 'tel:+33123456789'])(
    'rejects the non-web scheme %s',
    (value) => {
      expect(statusOf(value)).toBe('NOT_A_WEBSITE');
    },
  );
});

describe('website parse: rule version', () => {
  it('stamps a rule version so a stored classification says what made it', () => {
    expect(WEBSITE_PARSE_RULE_VERSION).toBe('website-parse-v1');
  });

  it('is pure: the same input always yields the same output', () => {
    const first = parseWebsiteCandidate('www.uni-graz.at');
    const second = parseWebsiteCandidate('www.uni-graz.at');
    expect(first).toEqual(second);
  });
});
