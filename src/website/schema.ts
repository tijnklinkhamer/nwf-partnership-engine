/**
 * Shared vocabulary for the Phase 1D website evidence layer.
 *
 * Everything here describes SOURCE CLAIMS. There is deliberately no vocabulary
 * for a canonical, preferred or verified website, because Phase 1D never
 * establishes one: two official sources disagree about 10 French institutions,
 * and picking a winner is not something this phase is approved to do.
 */

/**
 * Which source made a claim.
 *
 * `ECHE_PUBLISHED` is the value the ECHE artifact publishes in its
 * "Website Url" column. `FR_ESR` is the value the official French Ministry
 * register publishes in its `url` field. Both are official. Neither outranks
 * the other, and migration 0005 constrains the column to exactly these two.
 */
export const WEBSITE_CLAIM_SOURCE_KINDS = ['ECHE_PUBLISHED', 'FR_ESR'] as const;
export type WebsiteClaimSourceKind = (typeof WEBSITE_CLAIM_SOURCE_KINDS)[number];

/** A website source could not be resolved, parsed or ingested. */
export class WebsiteEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebsiteEvidenceError';
  }
}
