/**
 * The exact ECHE spreadsheet column set, verified against
 * accredited-HEIs-Erasmus-2021-2027_17082026_1.xlsx on 2026-08-21.
 *
 * Only columns that actually exist upstream are mapped. If the live file's header
 * ever differs from this list, the parser fails loudly with a schema-drift error
 * rather than shifting columns silently.
 */
export const ECHE_COLUMNS = [
  'Proposal Number',
  'Erasmus code',
  'PIC',
  'OID',
  'Legal Name',
  'Street',
  'Post Cd',
  'City',
  'Country Cd',
  'Website Url',
  'Erasmus Eche Start',
  'Erasmus Eche End',
] as const;

export type EcheColumn = (typeof ECHE_COLUMNS)[number];

/** Source system identifier recorded on every provenance row. */
export const ECHE_SOURCE_SYSTEM = 'eche';

/**
 * Reuse basis for European Commission website content.
 * Verified 2026-08-21 at https://commission.europa.eu/legal-notice_en
 * (Commission Decision 2011/833/EU; CC BY 4.0 unless otherwise indicated).
 */
export const ECHE_SOURCE_LICENCE =
  'CC BY 4.0 (European Commission reuse, Decision 2011/833/EU) - https://commission.europa.eu/legal-notice_en';

export class SchemaDriftError extends Error {
  constructor(
    message: string,
    readonly expected: readonly string[],
    readonly actual: readonly string[],
  ) {
    super(message);
    this.name = 'SchemaDriftError';
  }
}

/**
 * More than one sheet in the workbook carries the expected ECHE header.
 * Selecting one would be a guess, so the run stops instead.
 */
export class AmbiguousSheetError extends Error {
  constructor(
    message: string,
    readonly sheetNames: readonly string[],
  ) {
    super(message);
    this.name = 'AmbiguousSheetError';
  }
}
