/**
 * PHASE 2B-2D1B - SONNET ACCEPTANCE CORPUS SELECTION.
 *
 * MODEL SELECTION SUPERSEDED BY OWNER PRODUCT DECISION on 2026-09-02:
 * PRODUCTION CLASSIFIER = CLAUDE SONNET 5. This module reduces the frozen
 * `orgunit-classifier-gold-v1` 160-item candidate pool (unedited, retained as
 * `CANDIDATE_POOL_V1`) to a focused ~72-item Sonnet acceptance/regression
 * corpus:
 *
 *   - 36 REVIEWED items: every one of the 27 Stage-A ambiguity items plus
 *     the 9 Stage-B spotlight items the owner adjudicated on 2026-09-02.
 *     `REVIEWED_GOLD_IDS` is the frozen, hand-authored list of exactly those
 *     goldIds - it is evidence of a real decision having been made, not a
 *     value this module can derive.
 *   - ~36 ROUTINE items: selected DETERMINISTICALLY from the remaining pool
 *     by category quota (`ROUTINE_CATEGORY_QUOTAS`) and a per-organisation
 *     cap, ordered by each candidate's own content-derived `goldId` -
 *     never by whether its proposed label is "interesting", never by a
 *     model's output. The quotas were fixed by inspecting the REMAINING
 *     pool's category/organisation distribution once (this file's own
 *     comments record that reasoning); they are not re-tuned per result.
 *
 * PURE. No network, no database, no filesystem, no clock, no randomness -
 * `selectRoutineItems` is a total function of its inputs, so the routine 36
 * are reproducible from the committed 160-item pool alone.
 */
import type { ProposedLabel } from './goldSchema.js';

/**
 * The 36 owner-adjudicated goldIds (27 Stage-A ambiguity items + 9 Stage-B
 * spotlight items), confirmed by the owner on 2026-09-02. Every one keeps
 * its already-reasoned `proposed` label from
 * `orgunit-classifier-adjudication-v1.jsonl` verbatim - the owner accepted
 * every recommendation as presented - and is written to the acceptance
 * label file with `goldStatus: GOLD_CONFIRMED`, `provenance: OWNER`.
 */
export const REVIEWED_GOLD_IDS: readonly string[] = [
  // Stage-A: 27 ambiguity items (AdjudicationItem.ambiguity !== null in the
  // gold-v1 adjudication file).
  'gc93f2c13335c11d9', // IRTESS CERDIM: CAPTCHA interstitial, unit-named title -> UNIT_PAGE
  'g66010a25ac194274', // IRTESS /partenaires/erasmus/: near-empty archive -> NEEDS_REVIEW
  'g6458a352bc79ca01', // Evry /international/contacts.html: empty excerpt, DRRI in headings -> NEEDS_REVIEW
  'g52788fd323659c9c', // Evry correspondants-ri.html: per-department directory -> NOT_A_UNIT hard neg
  'g57607d4278d6dc23', // Evry partir-a-letranger.html: embedded DRRI service block -> UNIT_PAGE
  'ge419f0b9902faee0', // GEM international-students (EN): integration team -> UNIT_PAGE
  'gd6a3ebbc99b38c7c', // GEM etudiants-internationaux (FR): integration team -> UNIT_PAGE
  'g9e35e9bcdf1d2598', // Mayotte contacter-la-scolarite: bare contact form -> NOT_A_UNIT
  'ga435ea22d4b11cf4', // Mayotte contacter-le-centre-de-documentation: bare contact form -> NOT_A_UNIT
  'g4454e841c09dd8d0', // Mayotte contacter-le-centre-de-ressources-informatiques: bare contact form -> NOT_A_UNIT
  'g06ee8c44999938d2', // Mayotte erasmus.html: charter/candidature, whole-org reading -> UNIT_PAGE
  'gdb5b7246327094ef', // Mayotte relations-internationales.html: whole-org reading -> UNIT_PAGE
  'g5585ac7160247f93', // IMS bde/: empty excerpt, H1 only -> NEEDS_REVIEW
  'ge789b0f0aedc398c', // IMS erasmus/: empty excerpt, whole-org reading -> UNIT_PAGE
  'gcce4e2a5f608de5d', // Sorbonne LEA department page -> UNIT_PAGE / LANGUAGE_DEPARTMENT
  'gf65026e32d9da8db', // Sorbonne aides-a-la-mobilite-internationale: DAI page -> UNIT_PAGE
  'g32779df2d7b56a34', // IPAG /en/erasmus: institution-level, no unit named -> NOT_A_UNIT hard neg
  'g956f99fae4ad4764', // IPAG /erasmus (FR twin) -> NOT_A_UNIT hard neg
  'g1a0315d94121cfcf', // Paris Cite Welcome Desk (u-paris.fr, FR) event -> NOT_A_UNIT hard neg
  'g3dc15c65f8cabd30', // Paris Cite Welcome Desk (u-paris.fr, EN) event -> NOT_A_UNIT hard neg
  'g06b03dca0c4e00c0', // Paris Cite Welcome Desk (u-pariscite.fr, FR mirror) event -> NOT_A_UNIT hard neg
  'g82fe2243c52f4d73', // Paris Cite Welcome Desk (u-pariscite.fr, EN mirror) event -> NOT_A_UNIT hard neg
  'g34bbf7536e99b410', // ESLSCA international-students (EN): incoming support, no unit named -> UNIT_PAGE
  'ga971a6fc52af6b5f', // ESLSCA etudiants-internationaux (FR twin) -> UNIT_PAGE
  'gb2a14e66d0e71c3d', // INSA Rouen etudier-linsa: institutional marketing -> NOT_A_UNIT hard neg
  'g99a9fe00e4856de2', // INSA Rouen FLE page: operational teaching provision -> UNIT_PAGE / LANGUAGE_CENTRE
  'g74675818dd2661b8', // INSA Rouen /recherche/relations-internationales: research-scope veto -> NOT_A_UNIT hard neg

  // Stage-B: 9 spotlight items (protocol-flagged decision-boundary
  // patterns: Erasmus Mundus/BBA programme negatives, Erasmus Days event
  // negatives, the BTP CFA lapsed-domain content farm, ?RH= mirror pages,
  // the Paris Cite mobility-news category page). All provenance
  // AUDIT_2026_08 in the source file.
  'g9978fec48fa77fbb', // INSA Rouen Master Erasmus Mundus RESCO -> NOT_A_UNIT / DEGREE_PROGRAMME_PAGE
  'g7c122ea506478abd', // GEM International BBA (EN) -> NOT_A_UNIT / DEGREE_PROGRAMME_PAGE
  'g5f96e37ff602795a', // Mayotte Erasmus Days event -> NOT_A_UNIT / NEWS_OR_EVENT_PAGE
  'g7d88b2fecb73fdb4', // IMS Erasmus Days recap -> NOT_A_UNIT / NEWS_OR_EVENT_PAGE
  'g581e2c0586577331', // BTP CFA Occitanie: lapsed-domain content farm home -> NOT_A_UNIT / OTHER_NON_UNIT
  'g4aa8728f64f4525d', // BTP CFA Occitanie: content-farm archive -> NOT_A_UNIT / OTHER_NON_UNIT
  'gb92607abc8d746a4', // Sorbonne "Candidature ERASMUS+" (?RH= mirror): DAI service page -> UNIT_PAGE
  'g27504b2635a39531', // Paris Cite /category/mobilite-etudiante/: news category -> NOT_A_UNIT / NEWS_OR_EVENT_PAGE
  'g877a05e6f5bba835', // Sorbonne "Bienvenue a la Sorbonne Nouvelle": DAI welcome page -> UNIT_PAGE
];

/**
 * Routine-selection category: `UNIT:<unit_type>` for a UNIT_PAGE proposal,
 * `NEG:<page_kind>` for a NOT_A_UNIT proposal, `REVIEW` for NEEDS_REVIEW.
 * Reused as the coverage axis for the routine 36 because it is exactly the
 * axis the acceptance gates score against (unit_type accuracy, hard-negative
 * rejection by page_kind).
 */
export function routineCategoryOf(label: ProposedLabel): string {
  if (label.verdict === 'UNIT_PAGE') return `UNIT:${label.unit_type}`;
  if (label.verdict === 'NOT_A_UNIT') return `NEG:${label.page_kind}`;
  return 'REVIEW';
}

/**
 * Per-category quotas for the routine 36, fixed once by inspecting the
 * 124-item remaining pool's own category distribution (`NEG:NEWS_OR_EVENT_PAGE`
 * alone accounts for 48 of the 124, so it is deliberately capped rather than
 * proportionally represented; `UNIT:OTHER_UNIT` and `UNIT:LANGUAGE_DEPARTMENT`
 * each have exactly one remaining instance, so both are taken to give the
 * acceptance corpus a second example of each type beyond the one already in
 * `REVIEWED_GOLD_IDS`). Sums to 36. `UNIT:LANGUAGE_CENTRE` has zero
 * remaining instances - the single one in the pool is already reviewed - so
 * it carries no routine quota; this is reported, never invented.
 */
export const ROUTINE_CATEGORY_QUOTAS: Readonly<Record<string, number>> = {
  'UNIT:INTERNATIONAL_MOBILITY_OFFICE': 6,
  'UNIT:OTHER_UNIT': 1,
  'UNIT:LANGUAGE_DEPARTMENT': 1,
  'NEG:NEWS_OR_EVENT_PAGE': 7,
  'NEG:GENERIC_INSTITUTIONAL_PAGE': 6,
  'NEG:NAVIGATION_OR_LANDING_PAGE': 4,
  'NEG:SERVICE_TOOL_PAGE': 3,
  'NEG:OTHER_NON_UNIT': 3,
  'NEG:DEGREE_PROGRAMME_PAGE': 3,
  'NEG:RESEARCH_PAGE': 2,
};

/**
 * The one organisation with ZERO items in `REVIEWED_GOLD_IDS`
 * (Institut de Formation en Pedicurie-Podologie, Ergotherapie,
 * Masso-Kinesitherapie) - prioritised first within each category's quota so
 * the acceptance corpus covers all 12 organisations in the candidate pool,
 * never just the 10 the reviewed set happened to touch (task S6/S7 -
 * "multiple organisations", "do not allow one organisation to dominate").
 */
export const ROUTINE_PRIORITY_ORGANISATION =
  'INSTITUT DE FORMATION EN PEDICURIE-PODOLOGIE, ERGOTHERAPIE, MASSO-KINESITHERAPIE';

export interface RoutineCandidate {
  readonly goldId: string;
  readonly organisationName: string;
  readonly category: string;
}

/**
 * Selects the routine sample: within each quota category (iterated in the
 * quota table's own key order), candidates for the priority organisation are
 * taken first, then the remaining candidates in `goldId` ascending order -
 * both orderings are content-derived and fixed before selection, never a
 * function of which label looks more "interesting". A per-organisation cap
 * (`SONNET_ACCEPTANCE_ROUTINE_PER_ORGANISATION_CAP`) applies across the
 * whole routine set, not per category. Throws if a category's quota cannot
 * be filled - a shortfall must be a reviewed, visible protocol edit, never a
 * silently smaller corpus.
 */
export function selectRoutineItems(
  candidates: readonly RoutineCandidate[],
  quotas: Readonly<Record<string, number>>,
  perOrganisationCap: number,
  priorityOrganisation: string,
): readonly string[] {
  const byCategory = new Map<string, RoutineCandidate[]>();
  for (const candidate of candidates) {
    const group = byCategory.get(candidate.category);
    if (group === undefined) byCategory.set(candidate.category, [candidate]);
    else group.push(candidate);
  }
  for (const group of byCategory.values()) {
    group.sort((a, b) => (a.goldId < b.goldId ? -1 : a.goldId > b.goldId ? 1 : 0));
  }

  const orgCount = new Map<string, number>();
  const selected: string[] = [];
  const selectedIds = new Set<string>();

  const takeFrom = (pool: readonly RoutineCandidate[], quota: number): number => {
    let taken = 0;
    for (const candidate of pool) {
      if (taken >= quota) break;
      if (selectedIds.has(candidate.goldId)) continue;
      const count = orgCount.get(candidate.organisationName) ?? 0;
      if (count >= perOrganisationCap) continue;
      selected.push(candidate.goldId);
      selectedIds.add(candidate.goldId);
      orgCount.set(candidate.organisationName, count + 1);
      taken += 1;
    }
    return taken;
  };

  for (const category of Object.keys(quotas)) {
    const quota = quotas[category] ?? 0;
    const pool = byCategory.get(category) ?? [];
    const priorityPool = pool.filter((c) => c.organisationName === priorityOrganisation);
    let taken = takeFrom(priorityPool, quota);
    taken += takeFrom(pool, quota - taken);
    if (taken < quota) {
      throw new Error(
        `selectRoutineItems: category ${category} quota ${quota} could not be filled (got ${taken})`,
      );
    }
  }

  return selected;
}
