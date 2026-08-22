/**
 * Conservative normalisation of ECHE rows.
 *
 * What this deliberately does NOT do:
 *   - fuzzy-normalise organisation names into identity
 *   - rewrite legal names
 *   - infer missing websites
 *   - infer country from city or name (verified necessary: "B<NBSP> DIEPENB07"
 *     is Transnationale Universiteit Limburg with Country Cd = NL, so the
 *     Erasmus-code country prefix is NOT the country)
 *   - infer PIC or OID
 *   - contact any external service
 *
 * The raw source payload is always preserved in organisation_sources.raw_payload.
 */
import { getDomain } from 'tldts';
import type { RawEcheRow } from './parse.js';

/** U+00A0. Declared explicitly so no invisible character appears in source. */
const NON_BREAKING_SPACE = String.fromCharCode(0x00a0);

/**
 * Erasmus codes in the live file mix U+00A0 (non-breaking space, 4740
 * occurrences) with ordinary spaces. Normalisation maps NBSP to space, collapses
 * whitespace runs, trims and uppercases.
 *
 * Verified collision-free on the live dataset (2026-08-21): 6138 distinct codes
 * before normalisation and 6138 after, with 0 normalised keys covering more than
 * one distinct raw code. This is what makes the transformation safe to apply.
 */
export function normaliseErasmusCode(raw: string): string {
  return raw.split(NON_BREAKING_SPACE).join(' ').replace(/\s+/g, ' ').trim().toUpperCase();
}

/** Blank-to-null, with surrounding whitespace removed. Interior left untouched. */
export function blankToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** ISO 3166-1 alpha-2 shape check. Rejects anything else rather than guessing. */
export function normaliseCountryCode(raw: string | null): string | null {
  const value = blankToNull(raw);
  if (value === null) return null;
  const upper = value.toUpperCase();
  return /^[A-Z]{2}$/.test(upper) ? upper : null;
}

/**
 * Normalises a website URL.
 *
 * 4271 of 5900 non-blank ECHE website values have no scheme (bare
 * "www.example.com"), so a scheme is added for parsing purposes only. The value
 * stored is the parsed absolute URL; the untouched original always remains in
 * raw_payload.
 */
export function normaliseWebsiteUrl(raw: string | null): string | null {
  const value = blankToNull(raw);
  if (value === null) return null;

  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value) ? value : `https://${value}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (!parsed.hostname.includes('.')) return null;
  return parsed.toString();
}

/**
 * Registrable domain (eTLD+1) via the public suffix list, e.g.
 * "https://www.uni-graz.at/x" -> "uni-graz.at".
 * Returns null when no registrable domain can be determined.
 */
export function canonicalDomain(websiteUrl: string | null): string | null {
  if (websiteUrl === null) return null;
  const domain = getDomain(websiteUrl);
  return domain ? domain.toLowerCase() : null;
}

export interface NormalisedOrganisation {
  echeRowKey: string;
  legalName: string;
  displayName: string;
  countryCode: string;
  city: string | null;
  erasmusCode: string;
  pic: string | null;
  oid: string | null;
  websiteUrl: string | null;
  canonicalDomain: string | null;
  orgType: 'higher_education_institution';
}

export class RowValidationError extends Error {
  constructor(
    message: string,
    readonly row: RawEcheRow,
  ) {
    super(message);
    this.name = 'RowValidationError';
  }
}

/**
 * Delimiter separating the two components of `eche_row_key`.
 *
 * Chosen because it cannot occur in either component. Measured on the live file
 * (2026-08-21): normalised Erasmus codes use only [ -0-9A-Z] and PIC values are
 * digits only, so neither can contain "|". `normaliseRow` rejects a row that
 * would break that, so the property is enforced rather than merely observed.
 */
const ROW_KEY_DELIMITER = '|';

/**
 * The deterministic ECHE SOURCE ROW key.
 *
 * Erasmus code alone is not unique in the official file (verified: "E<NBSP> VIGO13"
 * appears twice - same institution, same OID, two different PIC values).
 * normalised(erasmus_code) + PIC is unique at 6139/6139 rows, and PIC is
 * non-blank on every row (0 of 6139 blank).
 *
 * This identifies an ECHE SOURCE ROW, NOT a canonical real-world organisation.
 * Two rows with different keys may well be the same institution. Entity
 * resolution is a later gated phase and has not happened.
 */
export function echeRowKey(erasmusCodeNormalised: string, pic: string | null): string {
  return `${erasmusCodeNormalised}${ROW_KEY_DELIMITER}${pic ?? ''}`;
}

/** Maps one raw ECHE row to a normalised organisation, or throws for a bad row. */
export function normaliseRow(row: RawEcheRow): NormalisedOrganisation {
  const rawCode = blankToNull(row['Erasmus code'] ?? null);
  if (rawCode === null) {
    throw new RowValidationError('Row has no Erasmus code', row);
  }
  const erasmusCode = normaliseErasmusCode(rawCode);
  if (erasmusCode === '') {
    throw new RowValidationError('Erasmus code normalised to an empty string', row);
  }

  const legalName = blankToNull(row['Legal Name'] ?? null);
  if (legalName === null) {
    throw new RowValidationError('Row has no Legal Name', row);
  }

  const countryCode = normaliseCountryCode(row['Country Cd'] ?? null);
  if (countryCode === null) {
    throw new RowValidationError(
      `Row has a missing or malformed Country Cd: ${JSON.stringify(row['Country Cd'])}`,
      row,
    );
  }

  const pic = blankToNull(row['PIC'] ?? null);

  // Without this, a code containing the delimiter could produce the same key as
  // a different (code, PIC) pair. Neither component contains it in the live
  // file; a row that broke that is reported, never silently repaired.
  for (const [field, value] of [
    ['Erasmus code', erasmusCode],
    ['PIC', pic],
  ] as const) {
    if (value !== null && value.includes(ROW_KEY_DELIMITER)) {
      throw new RowValidationError(
        `${field} contains the row-key delimiter "${ROW_KEY_DELIMITER}" ` +
          `(${JSON.stringify(value)}), which would make eche_row_key ambiguous`,
        row,
      );
    }
  }

  const websiteUrl = normaliseWebsiteUrl(row['Website Url'] ?? null);

  return {
    echeRowKey: echeRowKey(erasmusCode, pic),
    legalName,
    // ECHE publishes a single name. display_name is kept distinct because later
    // sources may supply a better display form; it is not derived or rewritten.
    displayName: legalName,
    countryCode,
    city: blankToNull(row['City'] ?? null),
    erasmusCode,
    pic,
    oid: blankToNull(row['OID'] ?? null),
    websiteUrl,
    canonicalDomain: canonicalDomain(websiteUrl),
    orgType: 'higher_education_institution',
  };
}
