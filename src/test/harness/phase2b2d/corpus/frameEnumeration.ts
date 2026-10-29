/**
 * SD1, EXACTLY — the pure enumeration core.
 *
 *   An organisation is FRAME-ELIGIBLE iff
 *
 *     (A  it has at least one STRUCTURALLY_VALID website_claims row
 *      OR B  it has at least one live, un-revoked orgunit_root_promotions
 *            authority)
 *     AND C  it contributes no item to the historical 49-item DEVELOPMENT set
 *     AND D  it appears in no earlier Methodology V2 generation corpus
 *
 * A and B are a disjunction; C and D are conjuncts. The implementation below
 * is that sentence and nothing else.
 *
 * Every examined organisation emits exactly one entry, included or not. There
 * is no filter step anywhere in this file - excluded rows are carried, with
 * their reason, because "we looked and rejected it" and "we never looked" are
 * different findings and only one of them is recoverable later.
 *
 * NOT IN THIS FILE, DELIBERATELY: any rank, any sha256 of an eche_row_key, any
 * selection, any reserve, any split. That is SD2 / A1b and is not authorised.
 *
 * PURE. No network, no database, no filesystem, no clock, no randomness.
 */
import type {
  FrameCounts,
  FrameEntry,
  FrameReason,
  RootAuthority,
  RootAuthorityType,
} from './frameContract.js';

/** One examined organisation and everything SD1 needs to judge it. */
export interface ExaminedOrganisation {
  readonly echeRowKey: string;
  readonly organisationId: string;
  /** Every STRUCTURALLY_VALID claim and every live promotion, in any order. */
  readonly rootAuthorities: readonly RootAuthority[];
}

export interface EnumerationInput {
  readonly organisations: readonly ExaminedOrganisation[];
  readonly historicalDevelopmentEcheRowKeys: ReadonlySet<string>;
  readonly priorGenerationEcheRowKeys: ReadonlySet<string>;
}

export interface EnumerationResult {
  readonly entries: readonly FrameEntry[];
  readonly counts: FrameCounts;
}

/**
 * The deterministic authority order: WEBSITE_CLAIM before ROOT_PROMOTION, then
 * by source label, then by id. It mirrors `orchestrate.ts`, which resolves
 * claim roots before promotion roots and orders claims by `source_kind, id`.
 */
const AUTHORITY_TYPE_RANK: Record<RootAuthorityType, number> = {
  WEBSITE_CLAIM: 0,
  ROOT_PROMOTION: 1,
};

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortRootAuthorities(
  authorities: readonly RootAuthority[],
): readonly RootAuthority[] {
  return [...authorities].sort(
    (a, b) =>
      AUTHORITY_TYPE_RANK[a.type] - AUTHORITY_TYPE_RANK[b.type] ||
      compare(a.sourceLabel, b.sourceLabel) ||
      compare(a.id, b.id),
  );
}

/**
 * The frozen precedence of `frameContract.ts`, applied. Contamination outranks
 * absence; absence outranks inclusion.
 */
function decideReason(clauses: {
  hasStructurallyValidClaim: boolean;
  hasLiveRootPromotion: boolean;
  excludedHistoricalDevelopment: boolean;
  excludedPriorGeneration: boolean;
}): FrameReason {
  if (clauses.excludedHistoricalDevelopment) return 'EXCLUDED_HISTORICAL_DEVELOPMENT';
  if (clauses.excludedPriorGeneration) return 'EXCLUDED_PRIOR_METHODOLOGY_GENERATION';
  if (!clauses.hasStructurallyValidClaim && !clauses.hasLiveRootPromotion) {
    return 'EXCLUDED_NO_VALID_ROOT_AUTHORITY';
  }
  if (clauses.hasStructurallyValidClaim) return 'INCLUDED_STRUCTURALLY_VALID_CLAIM';
  return 'INCLUDED_LIVE_ROOT_PROMOTION';
}

/** Judges one organisation. Total: every organisation yields an entry. */
export function evaluateOrganisation(
  organisation: ExaminedOrganisation,
  historicalDevelopmentEcheRowKeys: ReadonlySet<string>,
  priorGenerationEcheRowKeys: ReadonlySet<string>,
): FrameEntry {
  const authorities = sortRootAuthorities(organisation.rootAuthorities);
  const hasStructurallyValidClaim = authorities.some((a) => a.type === 'WEBSITE_CLAIM');
  const hasLiveRootPromotion = authorities.some((a) => a.type === 'ROOT_PROMOTION');
  const excludedHistoricalDevelopment = historicalDevelopmentEcheRowKeys.has(
    organisation.echeRowKey,
  );
  const excludedPriorGeneration = priorGenerationEcheRowKeys.has(organisation.echeRowKey);

  const clauses = {
    hasStructurallyValidClaim,
    hasLiveRootPromotion,
    excludedHistoricalDevelopment,
    excludedPriorGeneration,
  };
  const reason = decideReason(clauses);

  // SD1 as one expression, not as a consequence of the reason label.
  const included =
    (hasStructurallyValidClaim || hasLiveRootPromotion) &&
    !excludedHistoricalDevelopment &&
    !excludedPriorGeneration;

  const first = authorities[0];
  return {
    echeRowKey: organisation.echeRowKey,
    organisationId: organisation.organisationId,
    included,
    reason,
    ...clauses,
    rootAuthorityType: first ? first.type : null,
    rootAuthorityId: first ? first.id : null,
    rootAuthorityCount: authorities.length,
    rootAuthorities: authorities.map((a) => `${a.type}:${a.id}`),
  };
}

/** Enumerates the whole examined population, in `eche_row_key` order. */
export function enumerateFrame(input: EnumerationInput): EnumerationResult {
  const seen = new Set<string>();
  for (const organisation of input.organisations) {
    if (seen.has(organisation.echeRowKey)) {
      throw new Error(
        `Examined population contains eche_row_key ${organisation.echeRowKey} more than once. ` +
          `Every examined organisation must emit exactly one frame entry.`,
      );
    }
    seen.add(organisation.echeRowKey);
  }

  const entries = [...input.organisations]
    .sort((a, b) => compare(a.echeRowKey, b.echeRowKey))
    .map((organisation) =>
      evaluateOrganisation(
        organisation,
        input.historicalDevelopmentEcheRowKeys,
        input.priorGenerationEcheRowKeys,
      ),
    );

  const counts = countFrame(entries);
  return { entries, counts };
}

/**
 * The reconciling counts. Because the primary reason is precedence-assigned,
 * the three exclusion counts partition the excluded population exactly, and
 * `reconcileCounts` proves it rather than asserting it.
 */
export function countFrame(entries: readonly FrameEntry[]): FrameCounts {
  const by = (reason: FrameReason): number =>
    entries.filter((entry) => entry.reason === reason).length;
  return {
    examinedOrganisationCount: entries.length,
    eligibleOrganisationCount: entries.filter((entry) => entry.included).length,
    excludedOrganisationCount: entries.filter((entry) => !entry.included).length,
    excludedHistoricalDevelopmentCount: by('EXCLUDED_HISTORICAL_DEVELOPMENT'),
    excludedPriorGenerationCount: by('EXCLUDED_PRIOR_METHODOLOGY_GENERATION'),
    noValidAuthorityCount: by('EXCLUDED_NO_VALID_ROOT_AUTHORITY'),
  };
}

/** Throws unless the counts reconcile against each other and the entries. */
export function reconcileCounts(entries: readonly FrameEntry[], counts: FrameCounts): void {
  const recomputed = countFrame(entries);
  for (const [key, value] of Object.entries(recomputed) as [keyof FrameCounts, number][]) {
    if (counts[key] !== value) {
      throw new Error(`Frame count ${key} is ${counts[key]}, recomputed ${value}.`);
    }
  }
  if (counts.examinedOrganisationCount !== entries.length) {
    throw new Error('examinedOrganisationCount does not equal the entry count.');
  }
  if (
    counts.eligibleOrganisationCount + counts.excludedOrganisationCount !==
    counts.examinedOrganisationCount
  ) {
    throw new Error('eligible + excluded does not equal examined.');
  }
  const partition =
    counts.excludedHistoricalDevelopmentCount +
    counts.excludedPriorGenerationCount +
    counts.noValidAuthorityCount;
  if (partition !== counts.excludedOrganisationCount) {
    throw new Error(
      `The three exclusion reasons total ${partition} but ${counts.excludedOrganisationCount} ` +
        `organisations are excluded. The precedence must partition the excluded population.`,
    );
  }
}
