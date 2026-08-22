/**
 * Constants and error types for the EWP Registry catalogue.
 *
 * Verified against the live catalogue on 2026-08-22 (artifact sha256
 * 3f1977d0...2b9c7e74, 45,815,947 bytes). Nothing here is taken on trust from
 * the Phase 1A.5 audit: every structural claim below was re-measured against
 * that artifact.
 */

/** Source system identifier recorded on every EWP run and snapshot. */
export const EWP_SOURCE_SYSTEM = 'ewp_registry';

/**
 * The EWP Registry catalogue.
 *
 * Unlike ECHE, this is a STABLE WELL-KNOWN ENDPOINT defined by the EWP Registry
 * API rather than a file whose URL must be re-discovered from a document page,
 * so there is nothing to discover and no ambiguity to fail closed on. What does
 * still apply is the fail-closed rule that matters: if the fetch fails the run
 * FAILS. There is no fallback to a previously-downloaded artifact anywhere in
 * this module, and none may be added.
 */
export const EWP_CATALOGUE_URL = 'https://registry.erasmuswithoutpaper.eu/catalogue-v1.xml';

/** Only this host may serve an EWP catalogue. */
export const EWP_ALLOWED_HOSTS = new Set(['registry.erasmuswithoutpaper.eu']);

/** XML namespace of the catalogue document itself. */
export const EWP_REGISTRY_NS =
  'https://github.com/erasmus-without-paper/ewp-specs-api-registry/tree/stable-v1';

/** XML namespace of the shared EWP architecture types (ewp:admin-provider etc). */
export const EWP_COMMON_NS =
  'https://github.com/erasmus-without-paper/ewp-specs-architecture/blob/stable-v1/common-types.xsd';

/**
 * Reuse basis for the live EWP Registry catalogue.
 *
 * DELIBERATELY NARROW. The EWP specification and API repositories on GitHub
 * carry an MIT licence, but that is the licence of the SPECIFICATIONS. No
 * explicit licence statement for the LIVE CATALOGUE DATA was found, and the
 * licence of a specification repository does not automatically extend to the
 * dataset a service publishes. So this string claims only what is actually
 * true: the Registry exists to be consumed by EWP clients, and we consume it.
 *
 * Do not upgrade this wording to an open-data or MIT claim without explicit
 * evidence about the catalogue data itself. Phase 1B does not republish the
 * catalogue.
 */
export const EWP_SOURCE_REUSE_BASIS =
  'EWP Registry catalogue, published for client consumption at ' +
  `${EWP_CATALOGUE_URL} - retrieved and processed internally. ` +
  'NO dataset-licensing claim is made about the catalogue contents; the MIT ' +
  'licence on the EWP specification repositories is not evidence about this data.';

/** The catalogue could not be resolved, fetched or validated. */
export class EwpSourceResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EwpSourceResolutionError';
  }
}

/**
 * The catalogue's structure is not what this parser was written against, and
 * continuing would produce ambiguous or silently incomplete evidence.
 */
export class EwpSchemaDriftError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'EwpSchemaDriftError';
  }
}

/** A required structure inside the catalogue was malformed. Never repaired. */
export class EwpMalformedEntryError extends Error {
  constructor(
    message: string,
    readonly context: string,
  ) {
    super(message);
    this.name = 'EwpMalformedEntryError';
  }
}
