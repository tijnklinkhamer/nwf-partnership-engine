/**
 * Derivation of cross-source website verdicts.
 *
 * The property under test throughout: a verdict is a RELATIONSHIP between two
 * claims, it is computed and never stored, and it never chooses a winner.
 */
import { describe, expect, it } from 'vitest';
import {
  compareClaimPair,
  compareClaimSets,
  summariseComparisons,
  summariseStructure,
  type WebsiteClaimView,
} from '../../website/compare.js';
import { parseWebsiteCandidate } from '../../website/parse.js';
import type { WebsiteClaimSourceKind } from '../../website/schema.js';

/** Builds a claim view the way the ingest path would, from a published value. */
function claim(
  sourceKind: WebsiteClaimSourceKind,
  echeRowKey: string,
  rawValue: string | null,
  sourceRowKey = `${sourceKind}:${echeRowKey}`,
): WebsiteClaimView {
  const candidate = parseWebsiteCandidate(rawValue);
  return {
    sourceKind,
    echeRowKey,
    sourceRowKey,
    rawValue: candidate.rawValue,
    structuralStatus: candidate.status,
    normalisedUrl: candidate.normalisedUrl,
    hostname: candidate.hostname,
    registrableDomain: candidate.registrableDomain,
  };
}

const ROW = 'F PARIS001|999859123';

describe('website compare: the four verdicts', () => {
  it('DOMAIN_AGREE when both sources name the same registrable domain', () => {
    const result = compareClaimPair(
      claim('ECHE_PUBLISHED', ROW, 'www.uva.nl'),
      claim('FR_ESR', ROW, 'https://www.uva.nl/en'),
    );
    expect(result.verdict).toBe('DOMAIN_AGREE');
    expect(result.hostnamesEqual).toBe(true);
  });

  it('DOMAIN_AGREE but hostnames differing is reported, not flattened', () => {
    const result = compareClaimPair(
      claim('ECHE_PUBLISHED', ROW, 'https://intl.study.subdomain-test.co.uk/en'),
      claim('FR_ESR', ROW, 'https://www.subdomain-test.co.uk/'),
    );
    expect(result.verdict).toBe('DOMAIN_AGREE');
    // Agreement on the DOMAIN is weaker than agreement on the HOST, and the
    // difference stays visible.
    expect(result.hostnamesEqual).toBe(false);
  });

  it('DOMAIN_DISAGREE when two official sources name different domains', () => {
    const result = compareClaimPair(
      claim('ECHE_PUBLISHED', ROW, 'http://www.univ-paris1.fr'),
      claim('FR_ESR', ROW, 'https://www.pantheonsorbonne.fr/'),
    );
    expect(result.verdict).toBe('DOMAIN_DISAGREE');
    // BOTH values survive. Neither is nulled, replaced or marked wrong.
    expect(result.eche.registrableDomain).toBe('univ-paris1.fr');
    expect(result.fr.registrableDomain).toBe('pantheonsorbonne.fr');
  });

  it('ONE_SIDE_MISSING when only the register published a usable website', () => {
    const result = compareClaimPair(
      claim('ECHE_PUBLISHED', ROW, null),
      claim('FR_ESR', ROW, 'https://www.univ-rennes.fr/'),
    );
    expect(result.verdict).toBe('ONE_SIDE_MISSING');
  });

  it('ONE_SIDE_MISSING when ECHE published a broken value and the register did not', () => {
    // The live case: ECHE publishes "http//www.univ-perp.fr", the register
    // publishes the same site correctly. That is the second source earning
    // its place - but it is still not a merge, and nothing is rewritten.
    const result = compareClaimPair(
      claim('ECHE_PUBLISHED', ROW, 'http//www.univ-perp.fr'),
      claim('FR_ESR', ROW, 'https://www.univ-perp.fr/'),
    );
    expect(result.verdict).toBe('ONE_SIDE_MISSING');
    expect(result.eche.structuralStatus).toBe('MALFORMED');
    expect(result.eche.rawValue).toBe('http//www.univ-perp.fr');
  });

  it('NOT_COMPARABLE when neither side published a usable website', () => {
    expect(
      compareClaimPair(claim('ECHE_PUBLISHED', ROW, null), claim('FR_ESR', ROW, null)).verdict,
    ).toBe('NOT_COMPARABLE');
  });

  it('NOT_COMPARABLE when both sides published something unusable', () => {
    const result = compareClaimPair(
      claim('ECHE_PUBLISHED', ROW, '03014851@edu.gva.es'),
      claim('FR_ESR', ROW, 'http//broken-test.fr'),
    );
    expect(result.verdict).toBe('NOT_COMPARABLE');
  });

  it('an email address never agrees with anything, whatever its domain', () => {
    // The legacy path would have derived "gva.es" from the ECHE side. If it
    // ever did so again, this pair would read as agreement on a domain that
    // belongs to a mail server.
    const result = compareClaimPair(
      claim('ECHE_PUBLISHED', ROW, '03014851@edu.gva.es'),
      claim('FR_ESR', ROW, 'https://www.gva.es/'),
    );
    expect(result.verdict).toBe('ONE_SIDE_MISSING');
    expect(result.verdict).not.toBe('DOMAIN_AGREE');
  });
});

describe('website compare: grouping and cardinality', () => {
  it('produces no comparison for a row only one source spoke about', () => {
    // Absence of a counterpart claim is NOT the same as a counterpart claim of
    // absence, so no pair is invented.
    expect(compareClaimSets([claim('ECHE_PUBLISHED', ROW, 'www.uva.nl')])).toHaveLength(0);
  });

  it('never compares claims belonging to different ECHE rows', () => {
    const comparisons = compareClaimSets([
      claim('ECHE_PUBLISHED', 'A|1', 'www.a-test.fr'),
      claim('FR_ESR', 'B|2', 'www.b-test.fr'),
    ]);
    expect(comparisons).toHaveLength(0);
  });

  it('compares every pair when a row carries two claims from one source', () => {
    // Many-to-many is possible in principle, and reducing either side to one
    // claim first would be choosing - which this phase does not do.
    const comparisons = compareClaimSets([
      claim('ECHE_PUBLISHED', ROW, 'www.uva.nl'),
      claim('FR_ESR', ROW, 'https://www.uva.nl/en', 'FR:first'),
      claim('FR_ESR', ROW, 'https://www.other-test.nl/', 'FR:second'),
    ]);
    expect(comparisons).toHaveLength(2);
    expect(comparisons.map((c) => c.verdict).sort()).toEqual(['DOMAIN_AGREE', 'DOMAIN_DISAGREE']);
  });
});

describe('website compare: summaries are exhaustive', () => {
  it('the four verdict buckets always sum to the pair count', () => {
    const comparisons = compareClaimSets([
      claim('ECHE_PUBLISHED', 'A|1', 'www.same-test.fr'),
      claim('FR_ESR', 'A|1', 'https://www.same-test.fr/'),
      claim('ECHE_PUBLISHED', 'B|2', 'www.one-test.fr'),
      claim('FR_ESR', 'B|2', 'https://www.two-test.fr/'),
      claim('ECHE_PUBLISHED', 'C|3', null),
      claim('FR_ESR', 'C|3', 'https://www.three-test.fr/'),
      claim('ECHE_PUBLISHED', 'D|4', null),
      claim('FR_ESR', 'D|4', null),
    ]);
    const summary = summariseComparisons(comparisons);
    expect(summary).toMatchObject({
      pairs: 4,
      domainAgree: 1,
      domainDisagree: 1,
      oneSideMissing: 1,
      notComparable: 1,
    });
    expect(
      summary.domainAgree + summary.domainDisagree + summary.oneSideMissing + summary.notComparable,
    ).toBe(summary.pairs);
  });
});

describe('website compare: structural summary', () => {
  const claims = [
    claim('ECHE_PUBLISHED', 'A|1', 'http://www.edu.gva.es/centro/03014851'),
    claim('ECHE_PUBLISHED', 'B|2', 'http://www.edu.gva.es/centro/12005544'),
    claim('ECHE_PUBLISHED', 'C|3', 'https://intl.uni-test.fr/'),
    claim('ECHE_PUBLISHED', 'D|4', 'https://www.uni-test.fr/'),
    claim('ECHE_PUBLISHED', 'E|5', '03014851@edu.gva.es'),
    claim('ECHE_PUBLISHED', 'F|6', 'www.uoi.gr / www.rc.uoi.gr'),
    claim('ECHE_PUBLISHED', 'G|7', null),
  ];

  it('partitions every claim into exactly one structural bucket', () => {
    const summary = summariseStructure(claims);
    expect(summary.totalClaims).toBe(7);
    expect(
      summary.structurallyValid + summary.malformed + summary.notAWebsite + summary.absent,
    ).toBe(summary.totalClaims);
    expect(summary.notAWebsite).toBe(1);
    expect(summary.malformed).toBe(1);
    expect(summary.absent).toBe(1);
    expect(summary.withRawValue).toBe(6);
  });

  it('counts a shared host and a shared domain separately', () => {
    const summary = summariseStructure(claims);
    // Two claims share the host www.edu.gva.es.
    expect(summary.sharedHostnames).toBe(1);
    expect(summary.claimsOnSharedHostnames).toBe(2);
    // Two MORE claims share only the domain uni-test.fr, on different hosts.
    expect(summary.sharedRegistrableDomains).toBe(2);
    expect(summary.claimsOnSharedRegistrableDomains).toBe(4);
  });

  it('excludes rejected values from the host and domain tallies entirely', () => {
    const summary = summariseStructure(claims);
    // The email address must contribute no host and no domain. If it ever
    // does, the legacy defect has returned by another route.
    expect(summary.distinctRegistrableDomains).toBe(2);
    expect(summary.distinctHostnames).toBe(3);
  });
});
