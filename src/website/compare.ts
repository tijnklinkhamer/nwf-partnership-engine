/**
 * PURE derivation of cross-source website verdicts from immutable claims.
 *
 * WHY THIS IS A FUNCTION AND NOT A TABLE.
 *
 * AGREE / DISAGREE / ONE_SIDE_MISSING are RELATIONSHIPS BETWEEN CLAIMS, not
 * properties of any one claim. Storing them would mean a stored verdict could
 * silently contradict the evidence it was derived from as soon as either
 * source published a new artifact. Deriving them keeps exactly one source of
 * truth: the append-only claim rows.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO:
 *
 *   - decide which source is right. It never does. A DOMAIN_DISAGREE verdict
 *     is an OUTPUT, not a problem to fix: ECHE publishes univ-paris1.fr and the
 *     French Ministry register publishes pantheonsorbonne.fr for the same
 *     institution, and both are official.
 *   - compute similarity of any kind. No edit distance, no substring matching,
 *     no "close enough" domains. Two registrable domains are equal or they are
 *     not.
 *   - treat agreement as verification. Two sources agreeing on a domain is
 *     corroboration of a DOMAIN, and even that is not proof the domain is the
 *     institution's main site - nothing here fetches anything.
 *
 * No network, no database, no clock.
 */
import type { WebsiteStructuralStatus } from './parse.js';
import type { WebsiteClaimSourceKind } from './schema.js';

/**
 * The minimum a claim must expose to be compared.
 *
 * A structural view of a stored row, so the same pure logic serves the CLI
 * reading from the database and the unit tests driving it directly.
 */
export interface WebsiteClaimView {
  sourceKind: WebsiteClaimSourceKind;
  echeRowKey: string;
  sourceRowKey: string;
  rawValue: string | null;
  structuralStatus: WebsiteStructuralStatus;
  normalisedUrl: string | null;
  hostname: string | null;
  registrableDomain: string | null;
}

/**
 * The verdict for ONE pair of claims about ONE ECHE source row.
 *
 * Four outcomes, kept apart on purpose. Folding ONE_SIDE_MISSING into
 * NOT_COMPARABLE would merge "one official source published a usable website
 * and the other published none" - which is the single most useful thing the
 * second source tells us - with "neither published anything usable".
 */
export type WebsiteComparisonVerdict =
  /** Both sides are structurally valid and name the SAME registrable domain. */
  | 'DOMAIN_AGREE'
  /** Both sides are structurally valid and name DIFFERENT registrable domains. */
  | 'DOMAIN_DISAGREE'
  /** Exactly one side is structurally valid; the other published nothing usable. */
  | 'ONE_SIDE_MISSING'
  /** Neither side is structurally valid. There is nothing to compare. */
  | 'NOT_COMPARABLE';

export interface WebsiteComparison {
  echeRowKey: string;
  eche: WebsiteClaimView;
  fr: WebsiteClaimView;
  verdict: WebsiteComparisonVerdict;
  /**
   * True when both sides are structurally valid AND their full hostnames are
   * equal. A DETAIL, never a verdict: hostname equality is strictly stronger
   * than domain equality, so a pair can agree on the domain while naming
   * different hosts (www.example.fr vs international.example.fr). Reported so
   * that distinction stays visible instead of being flattened away.
   */
  hostnamesEqual: boolean;
}

function isUsable(claim: WebsiteClaimView): boolean {
  return claim.structuralStatus === 'STRUCTURALLY_VALID';
}

/** Derives the verdict for one ECHE claim against one FR claim. */
export function compareClaimPair(eche: WebsiteClaimView, fr: WebsiteClaimView): WebsiteComparison {
  const echeUsable = isUsable(eche);
  const frUsable = isUsable(fr);

  let verdict: WebsiteComparisonVerdict;
  if (echeUsable && frUsable) {
    verdict = eche.registrableDomain === fr.registrableDomain ? 'DOMAIN_AGREE' : 'DOMAIN_DISAGREE';
  } else if (echeUsable || frUsable) {
    verdict = 'ONE_SIDE_MISSING';
  } else {
    verdict = 'NOT_COMPARABLE';
  }

  return {
    echeRowKey: eche.echeRowKey,
    eche,
    fr,
    verdict,
    hostnamesEqual: echeUsable && frUsable && eche.hostname === fr.hostname,
  };
}

/**
 * Compares every ECHE claim against every FR claim for the same ECHE row.
 *
 * The cross product is deliberate rather than lazy. The relationship is
 * many-to-many in principle - two register records could publish the same PIC,
 * and a PIC could appear on two ECHE rows - and reducing each side to one
 * claim first would mean CHOOSING one, which is the resolution this phase does
 * not perform. Every pair is reported; none is preferred.
 */
export function compareClaims(
  echeClaims: readonly WebsiteClaimView[],
  frClaims: readonly WebsiteClaimView[],
): WebsiteComparison[] {
  const out: WebsiteComparison[] = [];
  for (const eche of echeClaims) {
    for (const fr of frClaims) out.push(compareClaimPair(eche, fr));
  }
  return out;
}

export interface WebsiteComparisonSummary {
  /** Claim pairs compared. NOT a count of institutions. */
  pairs: number;
  domainAgree: number;
  domainDisagree: number;
  oneSideMissing: number;
  notComparable: number;
  /** Of `domainAgree`: pairs whose full hostnames also match. */
  hostnameAgree: number;
}

/** Counts verdicts. Exhaustive: the four buckets always sum to `pairs`. */
export function summariseComparisons(
  comparisons: readonly WebsiteComparison[],
): WebsiteComparisonSummary {
  const summary: WebsiteComparisonSummary = {
    pairs: comparisons.length,
    domainAgree: 0,
    domainDisagree: 0,
    oneSideMissing: 0,
    notComparable: 0,
    hostnameAgree: 0,
  };
  for (const comparison of comparisons) {
    if (comparison.verdict === 'DOMAIN_AGREE') summary.domainAgree += 1;
    else if (comparison.verdict === 'DOMAIN_DISAGREE') summary.domainDisagree += 1;
    else if (comparison.verdict === 'ONE_SIDE_MISSING') summary.oneSideMissing += 1;
    else summary.notComparable += 1;
    if (comparison.hostnamesEqual) summary.hostnameAgree += 1;
  }
  return summary;
}

/**
 * Groups claims by ECHE source row and compares each group.
 *
 * A row with claims from only ONE source produces no comparison at all, and
 * that is correct: there is no pair to compare, and inventing an empty
 * counterpart would turn "the other source has nothing to say about this row"
 * into "the other source published nothing for it". Those are different facts.
 */
export function compareClaimSets(claims: readonly WebsiteClaimView[]): WebsiteComparison[] {
  const byRow = new Map<string, { eche: WebsiteClaimView[]; fr: WebsiteClaimView[] }>();
  for (const claim of claims) {
    let bucket = byRow.get(claim.echeRowKey);
    if (bucket === undefined) {
      bucket = { eche: [], fr: [] };
      byRow.set(claim.echeRowKey, bucket);
    }
    if (claim.sourceKind === 'ECHE_PUBLISHED') bucket.eche.push(claim);
    else bucket.fr.push(claim);
  }

  const out: WebsiteComparison[] = [];
  for (const bucket of byRow.values()) {
    out.push(...compareClaims(bucket.eche, bucket.fr));
  }
  return out;
}

export interface WebsiteStructuralSummary {
  totalClaims: number;
  structurallyValid: number;
  malformed: number;
  notAWebsite: number;
  absent: number;
  /** Claims carrying a published value of any kind: totalClaims - absent. */
  withRawValue: number;
  distinctHostnames: number;
  /** Hostnames named by more than one claim. */
  sharedHostnames: number;
  /** Claims whose hostname is named by more than one claim. */
  claimsOnSharedHostnames: number;
  distinctRegistrableDomains: number;
  /** Registrable domains named by more than one claim. */
  sharedRegistrableDomains: number;
  /** Claims whose registrable domain is named by more than one claim. */
  claimsOnSharedRegistrableDomains: number;
}

function tally(values: Iterable<string>): {
  distinct: number;
  shared: number;
  onShared: number;
} {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let shared = 0;
  let onShared = 0;
  for (const count of counts.values()) {
    if (count > 1) {
      shared += 1;
      onShared += count;
    }
  }
  return { distinct: counts.size, shared, onShared };
}

/**
 * Structural totals over a set of claims from ONE source.
 *
 * The shared-host and shared-domain counts are the reason this exists. A
 * hostname used by 52 claims is not 52 institutions sharing a website - it is a
 * regional education portal - so the report must show sharing rather than
 * present a domain count as an institution count.
 */
export function summariseStructure(claims: readonly WebsiteClaimView[]): WebsiteStructuralSummary {
  const hostnames: string[] = [];
  const domains: string[] = [];
  let structurallyValid = 0;
  let malformed = 0;
  let notAWebsite = 0;
  let absent = 0;

  for (const claim of claims) {
    switch (claim.structuralStatus) {
      case 'STRUCTURALLY_VALID':
        structurallyValid += 1;
        if (claim.hostname !== null) hostnames.push(claim.hostname);
        if (claim.registrableDomain !== null) domains.push(claim.registrableDomain);
        break;
      case 'MALFORMED':
        malformed += 1;
        break;
      case 'NOT_A_WEBSITE':
        notAWebsite += 1;
        break;
      case 'ABSENT':
        absent += 1;
        break;
    }
  }

  const hostTally = tally(hostnames);
  const domainTally = tally(domains);

  return {
    totalClaims: claims.length,
    structurallyValid,
    malformed,
    notAWebsite,
    absent,
    withRawValue: claims.length - absent,
    distinctHostnames: hostTally.distinct,
    sharedHostnames: hostTally.shared,
    claimsOnSharedHostnames: hostTally.onShared,
    distinctRegistrableDomains: domainTally.distinct,
    sharedRegistrableDomains: domainTally.shared,
    claimsOnSharedRegistrableDomains: domainTally.onShared,
  };
}
