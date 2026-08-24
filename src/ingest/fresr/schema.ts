/**
 * Constants and error types for the official French Ministry register of
 * principal higher-education institutions.
 *
 *   fr-esr-principaux-etablissements-enseignement-superieur
 *
 * WHY THIS SOURCE, AND ONLY THIS SOURCE.
 *
 * Phase 1D needed ONE independent, official, deterministic check on the
 * website values ECHE publishes. This register is the only candidate the audit
 * found that satisfies all three: it is published by the ministry that
 * accredits these institutions, it publishes a WEBSITE, and it publishes a
 * PIC - the same Participant Identification Code ECHE publishes. That shared
 * identifier means the two datasets can be joined DETERMINISTICALLY, with no
 * name matching, no fuzzy comparison and no domain-as-identity guessing.
 *
 * Verified against the live register on 2026-08-24: 245 records, 95 of which
 * carry a PIC.
 *
 * IT IS ONE SOURCE, NOT THE FIRST OF MANY. No second national register is
 * approved, and migration 0005 constrains `source_key` to this one value so a
 * second cannot be stored without a deliberate schema change.
 */

/** Source key recorded on the snapshot, and on every claim it produces. */
export const FRESR_SOURCE_KEY = 'fr_esr';

/** Source system recorded on the ingest_runs row. */
export const FRESR_SOURCE_SYSTEM = 'fr_esr';

/** The claim source kind this adapter writes. */
export const FRESR_CLAIM_SOURCE_KIND = 'FR_ESR';

/** The one host that may serve this dataset. Widening it widens the trust boundary. */
export const FRESR_ALLOWED_HOSTS = new Set(['data.enseignementsup-recherche.gouv.fr']);

export const FRESR_DATASET_ID = 'fr-esr-principaux-etablissements-enseignement-superieur';

/**
 * The human-verifiable landing page for the dataset.
 *
 * Recorded as provenance ONLY. This repository NEVER requests it: the single
 * request Phase 1D issues is to `FRESR_EXPORT_URL` below. Storing a page URL
 * that is never fetched is the point - it is where a human goes to check the
 * dataset, not where this process gets its bytes.
 */
export const FRESR_PUBLICATION_URL =
  `https://data.enseignementsup-recherche.gouv.fr/explore/assets/${FRESR_DATASET_ID}/` as const;

/**
 * THE ONLY FIELDS THIS REPOSITORY ASKS FOR.
 *
 * This list is a capability boundary, not an optimisation. The dataset
 * publishes 100+ columns including `numero_telephone_uai`, a TELEPHONE NUMBER,
 * and Phase 1D has no approved contact-discovery or contact-storage
 * capability. Because the field selection is applied BY THE SERVER, those
 * columns are never transmitted to this process at all - which is a stronger
 * guarantee than downloading everything and filtering afterwards, and it means
 * a contact value cannot reach a log, a buffer, an error message or a heap
 * dump here.
 *
 * Each field earns its place:
 *   etablissement_id_paysage  the register's own stable row identifier, used
 *                             as the claim's source_row_key
 *   uo_lib                    the institution label, so `website show` can say
 *                             WHICH register record made a claim
 *   uai                       the official national establishment identifier;
 *                             kept as published, including the 19 records that
 *                             publish SEVERAL separated by ";"
 *   identifiant_pic           THE JOIN KEY - the only field used to attach a
 *                             claim to an ECHE source row
 *   url                       the claim itself
 *
 * Do not add a field here without an approved reason, and never add a contact
 * field: `src/test/firewall/phase1d.firewall.test.ts` fails if one appears.
 */
export const FRESR_SELECTED_FIELDS = [
  'etablissement_id_paysage',
  'uo_lib',
  'uai',
  'identifiant_pic',
  'url',
] as const;

/** Path prefix every permitted request must sit under. */
export const FRESR_API_PATH_PREFIX = `/api/explore/v2.1/catalog/datasets/${FRESR_DATASET_ID}/`;

/**
 * The exact export endpoint, with the field selection baked in.
 *
 * `order_by` is present so the artifact is BYTE-STABLE for unchanged upstream
 * data: without a total order the service may return records in any order, and
 * a reshuffle would produce a new SHA-256 for identical content, making the
 * artifact hash useless as an identity.
 */
export const FRESR_EXPORT_URL =
  `https://data.enseignementsup-recherche.gouv.fr${FRESR_API_PATH_PREFIX}exports/json` +
  `?select=${FRESR_SELECTED_FIELDS.join('%2C')}&order_by=etablissement_id_paysage`;

/**
 * Reuse basis, read from the dataset's own metadata on 2026-08-24.
 *
 * Unlike the EWP catalogue, this dataset states its licence explicitly, so the
 * claim here is narrow and evidenced rather than inferred.
 */
export const FRESR_SOURCE_LICENCE =
  'Licence Ouverte v2.0 (Etalab) - ' +
  'https://www.etalab.gouv.fr/wp-content/uploads/2017/04/ETALAB-Licence-Ouverte-v2.0.pdf';

/**
 * Upper bound on the artifact size. The measured artifact is ~44 KB; this
 * limit exists so an unexpected response cannot be streamed into memory
 * unbounded, not as a tuned value.
 */
export const FRESR_MAX_ARTIFACT_BYTES = 32 * 1024 * 1024;

/** Upper bound on record count, for the same reason. Measured: 245. */
export const FRESR_MAX_RECORDS = 20_000;

/** The dataset could not be resolved, fetched or validated. Never falls back. */
export class FresrSourceResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FresrSourceResolutionError';
  }
}

/**
 * The register's structure is not what this adapter was written against.
 * Continuing would produce evidence whose meaning is unknown, so the run stops.
 */
export class FresrSchemaDriftError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'FresrSchemaDriftError';
  }
}
