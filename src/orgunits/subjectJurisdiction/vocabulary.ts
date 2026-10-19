/**
 * GLOBAL FOUNDATION R4 - THE CLOSED VOCABULARIES OF SUBJECT JURISDICTION
 * EVIDENCE.
 *
 * Mirrors migration 0016 value for value; the unit test parses the migration
 * and the integration test proves the database refuses everything outside
 * these lists. PURE: no socket, no database, no filesystem, no environment,
 * no clock. See ADR 0024.
 *
 * A jurisdiction claim is EVIDENCE about where an organisation operates or is
 * registered, or what legal form a source says it has. It is never a
 * conclusion, never a default, and never permission of any kind: no claim
 * means UNKNOWN.
 */

/**
 * The 249 officially assigned ISO 3166-1 alpha-2 codes, from tzdata 2026e
 * `iso3166.tab` (current as of ISO/TC 46 N1127, 2024-02-29). User-assigned
 * codes (XK, AA, QM-QZ, XA-XZ, ZZ) and exceptional reservations (EU, UK) are
 * deliberately absent. Widening this list is a new migration.
 */
export const ISO_3166_1_ALPHA2_ASSIGNED = [
  'AD',
  'AE',
  'AF',
  'AG',
  'AI',
  'AL',
  'AM',
  'AO',
  'AQ',
  'AR',
  'AS',
  'AT',
  'AU',
  'AW',
  'AX',
  'AZ',
  'BA',
  'BB',
  'BD',
  'BE',
  'BF',
  'BG',
  'BH',
  'BI',
  'BJ',
  'BL',
  'BM',
  'BN',
  'BO',
  'BQ',
  'BR',
  'BS',
  'BT',
  'BV',
  'BW',
  'BY',
  'BZ',
  'CA',
  'CC',
  'CD',
  'CF',
  'CG',
  'CH',
  'CI',
  'CK',
  'CL',
  'CM',
  'CN',
  'CO',
  'CR',
  'CU',
  'CV',
  'CW',
  'CX',
  'CY',
  'CZ',
  'DE',
  'DJ',
  'DK',
  'DM',
  'DO',
  'DZ',
  'EC',
  'EE',
  'EG',
  'EH',
  'ER',
  'ES',
  'ET',
  'FI',
  'FJ',
  'FK',
  'FM',
  'FO',
  'FR',
  'GA',
  'GB',
  'GD',
  'GE',
  'GF',
  'GG',
  'GH',
  'GI',
  'GL',
  'GM',
  'GN',
  'GP',
  'GQ',
  'GR',
  'GS',
  'GT',
  'GU',
  'GW',
  'GY',
  'HK',
  'HM',
  'HN',
  'HR',
  'HT',
  'HU',
  'ID',
  'IE',
  'IL',
  'IM',
  'IN',
  'IO',
  'IQ',
  'IR',
  'IS',
  'IT',
  'JE',
  'JM',
  'JO',
  'JP',
  'KE',
  'KG',
  'KH',
  'KI',
  'KM',
  'KN',
  'KP',
  'KR',
  'KW',
  'KY',
  'KZ',
  'LA',
  'LB',
  'LC',
  'LI',
  'LK',
  'LR',
  'LS',
  'LT',
  'LU',
  'LV',
  'LY',
  'MA',
  'MC',
  'MD',
  'ME',
  'MF',
  'MG',
  'MH',
  'MK',
  'ML',
  'MM',
  'MN',
  'MO',
  'MP',
  'MQ',
  'MR',
  'MS',
  'MT',
  'MU',
  'MV',
  'MW',
  'MX',
  'MY',
  'MZ',
  'NA',
  'NC',
  'NE',
  'NF',
  'NG',
  'NI',
  'NL',
  'NO',
  'NP',
  'NR',
  'NU',
  'NZ',
  'OM',
  'PA',
  'PE',
  'PF',
  'PG',
  'PH',
  'PK',
  'PL',
  'PM',
  'PN',
  'PR',
  'PS',
  'PT',
  'PW',
  'PY',
  'QA',
  'RE',
  'RO',
  'RS',
  'RU',
  'RW',
  'SA',
  'SB',
  'SC',
  'SD',
  'SE',
  'SG',
  'SH',
  'SI',
  'SJ',
  'SK',
  'SL',
  'SM',
  'SN',
  'SO',
  'SR',
  'SS',
  'ST',
  'SV',
  'SX',
  'SY',
  'SZ',
  'TC',
  'TD',
  'TF',
  'TG',
  'TH',
  'TJ',
  'TK',
  'TL',
  'TM',
  'TN',
  'TO',
  'TR',
  'TT',
  'TV',
  'TW',
  'TZ',
  'UA',
  'UG',
  'UM',
  'US',
  'UY',
  'UZ',
  'VA',
  'VC',
  'VE',
  'VG',
  'VI',
  'VN',
  'VU',
  'WF',
  'WS',
  'YE',
  'YT',
  'ZA',
  'ZM',
  'ZW',
] as const;
export type Iso3166Alpha2 = (typeof ISO_3166_1_ALPHA2_ASSIGNED)[number];

/** sha256 over the codes joined as 'AD,AE,...,ZW,' - the value migration 0016 records. */
export const ISO_3166_1_ALPHA2_LIST_SHA256 =
  'a8303ad85a388f002211ab0df475d1a419ff9b7517b75250611dba53adc4bd94';

export const JURISDICTION_CLAIM_KINDS = [
  'COUNTRY_OF_OPERATION',
  'COUNTRY_OF_REGISTRATION',
  'LEGAL_FORM',
] as const;
export type JurisdictionClaimKind = (typeof JURISDICTION_CLAIM_KINDS)[number];

/** A source's statement of legal form. Not a verified registration, and not the subject's kind. */
export const LEGAL_FORMS = [
  'REGISTERED_LEGAL_ENTITY',
  'UNREGISTERED_INFORMAL_GROUP',
  'UNIT_OF_LARGER_ENTITY',
] as const;
export type LegalForm = (typeof LEGAL_FORMS)[number];

/** Identical to 0013's source types: page evidence, a website claim, or a public URL. */
export const JURISDICTION_SOURCE_TYPES = ['PAGE_EVIDENCE', 'WEBSITE_CLAIM', 'PUBLIC_URL'] as const;
export type JurisdictionSourceType = (typeof JURISDICTION_SOURCE_TYPES)[number];

/** SOURCE_STATED only: rule 2 forbids an inferred country, and the database refuses one. */
export const JURISDICTION_CLAIM_BASES = ['SOURCE_STATED'] as const;

export interface JurisdictionClaimRecord {
  readonly id: string;
  readonly subjectId: string;
  readonly claimKind: JurisdictionClaimKind;
  readonly claimedCountry: string | null;
  readonly claimedLegalForm: string | null;
  readonly sourceType: JurisdictionSourceType;
  readonly sourcePageEvidenceId: string | null;
  readonly sourceWebsiteClaimId: string | null;
  readonly sourceUrl: string | null;
  readonly sourceVersionRef: string | null;
  /** When the SOURCE was observed (ISO-8601 UTC). */
  readonly observedAt: string;
  readonly claimBasis: string;
  /** The trusted path that RECORDED the claim - never its source, never a person. */
  readonly recordedByActorKey: string;
}

const ASSIGNED: ReadonlySet<string> = new Set(ISO_3166_1_ALPHA2_ASSIGNED);

/** Exact, case-sensitive membership - 'jp', 'XK' and 'EU' are all refused. */
export function isAssignedIso3166Alpha2(candidate: string): candidate is Iso3166Alpha2 {
  return ASSIGNED.has(candidate);
}
