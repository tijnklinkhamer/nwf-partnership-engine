-- 0016_subject_jurisdiction_claims.sql
-- Global Foundation R4: WORLDWIDE JURISDICTION EVIDENCE FOR DISCOVERY
-- SUBJECTS - one additive, append-only claim table and one immutable ISO
-- 3166-1 predicate. Reasoned about in
-- docs/adr/0024-worldwide-subject-jurisdiction-claims.md.
--
-- WHY THIS EXISTS
--
--   Migration 0013 already represents an organisation that is NOT an ECHE
--   source row: a discovery_subjects row is an opaque uuid with no mandatory
--   parent, and every claim about it carries external provenance (page
--   evidence, a website claim, or a public URL plus an optional content
--   hash) that is independent of eche_row_key. What 0013 cannot say is WHERE
--   a subject operates or WHAT legal form it claims, so a Japanese student
--   association and a French faculty were indistinguishable by jurisdiction.
--   The only country column in the schema is organisations.country_code,
--   which is ECHE's own Country Cd and exists only for ECHE source rows.
--
-- WHAT A ROW IS
--
--   ONE SOURCE'S STATEMENT about ONE subject's country of operation, country
--   of registration, or legal form. A claim, never a conclusion: two sources
--   may disagree and both rows stay; reviewed state is not modelled here.
--   The ABSENCE of a row means UNKNOWN - never "no jurisdiction", never a
--   default country, and never permission of any kind.
--
-- RULE 2 (NEVER GUESS) IS ENFORCED BY THE DATABASE
--
--   claim_basis admits SOURCE_STATED only. A country inferred from a name, a
--   language, a top-level domain or an Erasmus-code prefix cannot be stored.
--   The country must be an OFFICIALLY ASSIGNED ISO 3166-1 alpha-2 code
--   (249 codes: tzdata 2026e iso3166.tab, current as of ISO/TC 46 N1127,
--   2024-02-29; list sha256 over 'AD,AE,...,ZW,' =
--   a8303ad85a388f002211ab0df475d1a419ff9b7517b75250611dba53adc4bd94).
--   User-assigned codes (XK, AA, QM-QZ, XA-XZ, ZZ), exceptional reservations
--   (EU, UK) and lower-case values are refused.
--
-- WHAT IS DELIBERATELY ABSENT
--
--   - No change to any table, column, constraint, trigger or grant of
--     0001-0015. No ECHE row, website claim or cohort digest is touched.
--   - No INSERT grant to ANY runtime role: nwf_discovery_subject_writer,
--     nwf_discovery_subject_reviewer, nwf_research, nwf_ingest and
--     nwf_classifier cannot write here. Only the migration owner can, exactly
--     as 0013 stood before B2.2 approved a writer. A writer path is a later,
--     separately approved slice.
--   - No contact, eligibility, permission, consent, legal-basis, outreach,
--     market, locale or language-target column. A jurisdiction claim is
--     EVIDENCE about an organisation; whether contact is lawful in that
--     jurisdiction is not something this repository decides (rule 1).
--   - No identity equivalence: a shared country, legal form or source never
--     links two subjects, and a subject's country never becomes the country
--     of a PART_OF target or vice versa.
--   - The table name does not begin with 'discovery'; it follows the 0015
--     'subject_' precedent, so 0013's exactly-four-tables inventory still
--     describes 0013.

CREATE FUNCTION subject_iso3166_alpha2_assigned(candidate text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
    SELECT candidate = ANY (ARRAY[
        'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT',
        'AU', 'AW', 'AX', 'AZ', 'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI',
        'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BV', 'BW', 'BY',
        'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN',
        'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM',
        'DO', 'DZ', 'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK',
        'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL',
        'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM',
        'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR',
        'IS', 'IT', 'JE', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN',
        'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS',
        'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK',
        'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW',
        'MX', 'MY', 'MZ', 'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP',
        'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM',
        'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW',
        'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM',
        'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF',
        'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW',
        'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI',
        'VN', 'VU', 'WF', 'WS', 'YE', 'YT', 'ZA', 'ZM', 'ZW'
    ]::text[])
$$;

COMMENT ON FUNCTION subject_iso3166_alpha2_assigned(text) IS
    'TRUE only for one of the 249 officially assigned ISO 3166-1 alpha-2 codes '
    '(tzdata 2026e iso3166.tab, ISO/TC 46 N1127). Upper-case, exact match. '
    'Widening it is a new migration.';

CREATE TABLE subject_jurisdiction_claims (
    id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id              uuid        NOT NULL REFERENCES discovery_subjects (id),
    claim_kind              text        NOT NULL,
    claimed_country         text,
    claimed_legal_form      text,
    source_type             text        NOT NULL,
    source_page_evidence_id uuid        REFERENCES orgunit_page_evidence (id),
    source_website_claim_id uuid        REFERENCES website_claims (id),
    source_url              text,
    source_version_ref      text,
    observed_at             timestamptz NOT NULL,
    claim_basis             text        NOT NULL,
    recorded_by_actor_key   text        NOT NULL,
    created_at              timestamptz NOT NULL DEFAULT now(),
    provenance_key          text        NOT NULL GENERATED ALWAYS AS (
        CASE source_type
            WHEN 'PAGE_EVIDENCE' THEN 'page_evidence:' || source_page_evidence_id::text
            WHEN 'WEBSITE_CLAIM' THEN 'website_claim:' || source_website_claim_id::text
            ELSE 'url:' || source_url || '|v=' || coalesce(source_version_ref, '')
        END) STORED,
    value_key               text        NOT NULL GENERATED ALWAYS AS (
        CASE claim_kind
            WHEN 'LEGAL_FORM' THEN 'legal_form:' || claimed_legal_form
            ELSE 'country:' || claimed_country
        END) STORED,
    CONSTRAINT subject_jurisdiction_claims_kind_chk
        CHECK (claim_kind IN ('COUNTRY_OF_OPERATION', 'COUNTRY_OF_REGISTRATION',
                              'LEGAL_FORM')),
    CONSTRAINT subject_jurisdiction_claims_payload_chk
        CHECK (CASE claim_kind
            WHEN 'LEGAL_FORM' THEN
                claimed_legal_form IS NOT NULL AND claimed_country IS NULL
            ELSE
                claimed_country IS NOT NULL AND claimed_legal_form IS NULL
        END),
    CONSTRAINT subject_jurisdiction_claims_country_chk
        CHECK (claimed_country IS NULL OR subject_iso3166_alpha2_assigned(claimed_country)),
    CONSTRAINT subject_jurisdiction_claims_legal_form_chk
        CHECK (claimed_legal_form IS NULL OR claimed_legal_form IN (
            'REGISTERED_LEGAL_ENTITY', 'UNREGISTERED_INFORMAL_GROUP',
            'UNIT_OF_LARGER_ENTITY')),
    CONSTRAINT subject_jurisdiction_claims_source_chk
        CHECK ((source_type = 'PAGE_EVIDENCE'
                AND source_page_evidence_id IS NOT NULL
                AND source_website_claim_id IS NULL AND source_url IS NULL)
            OR (source_type = 'WEBSITE_CLAIM'
                AND source_website_claim_id IS NOT NULL
                AND source_page_evidence_id IS NULL AND source_url IS NULL)
            OR (source_type = 'PUBLIC_URL'
                AND source_url IS NOT NULL
                AND source_page_evidence_id IS NULL AND source_website_claim_id IS NULL)),
    CONSTRAINT subject_jurisdiction_claims_source_url_chk
        CHECK (source_url IS NULL OR discovery_identity_url_admissible(source_url)),
    CONSTRAINT subject_jurisdiction_claims_source_version_chk
        CHECK (source_version_ref IS NULL OR source_version_ref ~ '^[0-9a-f]{64}$'),
    CONSTRAINT subject_jurisdiction_claims_basis_chk
        CHECK (claim_basis = 'SOURCE_STATED'),
    CONSTRAINT subject_jurisdiction_claims_actor_key_chk
        CHECK (recorded_by_actor_key ~ '^[a-z0-9][a-z0-9_-]{2,63}$')
);

CREATE UNIQUE INDEX subject_jurisdiction_claims_dedupe_uidx
    ON subject_jurisdiction_claims (subject_id, claim_kind, value_key, provenance_key);
CREATE INDEX subject_jurisdiction_claims_subject_idx
    ON subject_jurisdiction_claims (subject_id);

COMMENT ON TABLE subject_jurisdiction_claims IS
    'ONE SOURCE''S STATEMENT about ONE discovery subject''s country of '
    'operation, country of registration or legal form. A claim, never a '
    'conclusion; conflicting rows coexist. No row means UNKNOWN, never a '
    'default and never permission. Source-stated only: a country is never '
    'inferred from a name, language, domain or Erasmus code. Grants no '
    'research eligibility, no contact permission and no identity equivalence. '
    'Append-only (trigger-enforced). ADR 0024.';
COMMENT ON COLUMN subject_jurisdiction_claims.claimed_country IS
    'An officially assigned ISO 3166-1 alpha-2 code AS THE SOURCE STATED IT. '
    'Not organisations.country_code, never copied from it, and never '
    'propagated along a relationship claim.';
COMMENT ON COLUMN subject_jurisdiction_claims.claimed_legal_form IS
    'The source''s statement of legal form: a registered legal entity, an '
    'unregistered informal group, or a unit of a larger entity. Not a '
    'verified registration, and not the subject''s kind: an '
    'INDEPENDENT_STUDENT_ASSOCIATION kind asserts no legal personality.';
COMMENT ON COLUMN subject_jurisdiction_claims.recorded_by_actor_key IS
    'AN OPAQUE KEY NAMING THE TRUSTED PATH that recorded the claim, with the '
    'semantics and prohibitions of discovery_subjects.registered_by_actor_key: '
    'never a person''s name, handle or mailbox.';

CREATE TRIGGER subject_jurisdiction_claims_append_only
    BEFORE UPDATE OR DELETE ON subject_jurisdiction_claims
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation();

REVOKE ALL ON subject_jurisdiction_claims
    FROM PUBLIC, nwf_ingest, nwf_research, nwf_classifier, nwf_readonly,
         nwf_discovery_subject_writer, nwf_discovery_subject_reviewer;

GRANT SELECT ON subject_jurisdiction_claims TO nwf_readonly;
