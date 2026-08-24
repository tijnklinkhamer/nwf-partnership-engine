-- 0005_website_evidence.sql
-- Phase 1D: WEBSITE SOURCE CLAIMS, kept strictly apart from interpretation.
--
-- WHAT A ROW IN website_claims MEANS, EXACTLY:
--
--   "This SOURCE published THIS VALUE in its website field for THIS ECHE
--    source row, in THIS artifact."
--
-- WHAT IT DOES NOT MEAN:
--
--   "This is the organisation's official website." Nothing in Phase 1D
--   verifies that. No value here is fetched, resolved, redirect-checked or
--   confirmed to exist, and a structurally valid URL may still point at a
--   parent ministry, a hospital, a franchise, an LMS or a dead host.
--
-- WHY CLAIMS AND CONCLUSIONS ARE SEPARATE TABLES - or rather, why the
-- conclusion has NO table at all.
--
--   The obvious design is one mutable website row per organisation moving
--   RAW -> CORROBORATED -> VERIFIED. That design is wrong here, and the live
--   data is what proves it. Joining the official French register to ECHE on
--   PIC - a deterministic join on an identifier both datasets publish - yields
--   65 rows where the two agree on a registrable domain and 10 where they
--   DISAGREE. Both sides are official. ECHE publishes univ-paris1.fr for
--   Universite Paris I; the French Ministry register publishes
--   pantheonsorbonne.fr. Neither is a mistake, and neither may overwrite the
--   other.
--
--   So AGREE / DISAGREE / ONE_SIDE_MISSING are RELATIONSHIPS BETWEEN CLAIMS,
--   not properties of a claim, and Phase 1D derives them deterministically at
--   query time from immutable evidence rather than storing a verdict that
--   would silently become stale. There is deliberately no `verified` column,
--   no `preferred_website` column and no winner anywhere in this migration.
--
-- MEASURED, against the authoritative ECHE artifact (sha256
-- 32e1de18...932fdee9, 6,139 rows) with the Phase 1D parser:
--
--   STRUCTURALLY_VALID  5,832
--   NOT_A_WEBSITE          59   (55 email addresses + 4 further values whose
--                                host sits outside the ICANN public suffix
--                                set; a 5th such host is itself one of the 55)
--   MALFORMED               9
--   ABSENT                239
--   -------------------------
--   TOTAL               6,139   = every data row in the artifact

-- ---------------------------------------------------------------------------
-- Legacy semantics, stated where a developer will actually look.
-- ---------------------------------------------------------------------------
--
-- NOTHING BELOW CHANGES A SINGLE STORED VALUE. organisations.website_url and
-- organisations.canonical_domain keep exactly the bytes Phase 1A wrote. They
-- are not back-filled, not re-derived and not repaired: they are historical
-- source-derived values, and rewriting them would destroy the record of what
-- the legacy path actually produced. These are COMMENT changes only, so that
-- `\d+ organisations` can no longer be read as a verification claim.

COMMENT ON COLUMN organisations.website_url IS
    'The ECHE "Website Url" cell after the LEGACY Phase 1A normalisation path '
    '(`normaliseWebsiteUrl`): blank-to-null, a scheme prefixed when absent, '
    'parsed as a URL. NOT VERIFIED, NOT FETCHED, and NOT guaranteed to be a '
    'website at all - that path accepts an EMAIL ADDRESS, because prefixing '
    '"https://" to "03014851@edu.gva.es" produces a URL whose userinfo is the '
    'mailbox. 55 rows in the measured artifact are email addresses published '
    'in this field. The verbatim published value, and a strict structural '
    'classification of it, live in website_claims (Phase 1D). This column is '
    'kept unchanged as the historical record of what Phase 1A derived.';

COMMENT ON COLUMN organisations.canonical_domain IS
    'LEGACY, MECHANICAL, AND DESCRIPTIVE ONLY: the registrable domain (eTLD+1) '
    'that Phase 1A''s normalisation path derived from website_url. Despite the '
    'name it is NOT a canonical domain, NOT a verified official website and '
    'NOT identity. Three separate reasons, all measured: (1) it is strongly '
    'non-unique - 5,891 non-null values over 5,028 distinct domains, 52 rows '
    'sharing gva.es, and some values are generic hosts (google.com, '
    'wixsite.com); (2) 55 of the source values it was derived from are email '
    'addresses, so those domains are the mail domain of an education '
    'authority, not the institution''s site; (3) 64 rows carry a value '
    'string-equal to an EWP SCHAC identifier with no identifier evidence '
    'linking them. Never dedupe on it, never join on it as identity, and never '
    'present it as a verified website. Phase 1D''s website_claims supersedes '
    'it as evidence; this column is not rewritten.';

-- ---------------------------------------------------------------------------
-- website_source_snapshots: one row per DISTINCT EXTERNAL ARTIFACT.
-- ---------------------------------------------------------------------------
--
-- Only EXTERNAL website-verification sources get a snapshot. ECHE does not:
-- its artifact identity already lives in ingest_runs.source_file_sha256, and
-- inventing a second snapshot record for it would create two places that
-- disagree about the same bytes. Every website_claims row carries
-- source_artifact_sha256 regardless, so an ECHE claim is still bound to exact
-- bytes.
--
-- The provenance columns repeat the lesson migration 0004 had to learn the
-- hard way: HOW THIS RUN READ THE BYTES and WHERE THE ARTIFACT WAS PUBLISHED
-- are DIFFERENT FACTS and must not be collapsed into one column.

CREATE TABLE website_source_snapshots (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    source_key          text        NOT NULL,
    source_input_kind   text        NOT NULL,
    source_location     text        NOT NULL,
    fetched_at          timestamptz NOT NULL,
    publication_url     text,
    read_url            text,
    origin_retrieved_at timestamptz,
    artifact_sha256     text        NOT NULL,
    artifact_bytes      bigint      NOT NULL,
    record_count        integer     NOT NULL,
    first_ingest_run_id uuid        NOT NULL REFERENCES ingest_runs (id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT website_source_snapshots_sha256_chk
        CHECK (artifact_sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT website_source_snapshots_bytes_chk CHECK (artifact_bytes > 0),
    CONSTRAINT website_source_snapshots_records_chk CHECK (record_count >= 0),
    -- Phase 1D approves exactly ONE external website-verification source.
    -- A second national register is a separate approved phase, and the
    -- database refuses to store one until this constraint is deliberately
    -- widened by a new migration.
    CONSTRAINT website_source_snapshots_source_key_chk
        CHECK (source_key IN ('fr_esr')),
    CONSTRAINT website_source_snapshots_input_kind_chk
        CHECK (source_input_kind IN ('official_endpoint', 'operator_file')),
    -- The host allow-list, restated in the database. src/ingest/fresr/source.ts
    -- enforces it too; stating it here means a false origin is rejected even if
    -- application code is bypassed entirely.
    CONSTRAINT website_source_snapshots_read_url_chk
        CHECK (read_url IS NULL
               OR read_url ~ '^https://data\.enseignementsup-recherche\.gouv\.fr/'),
    CONSTRAINT website_source_snapshots_publication_url_chk
        CHECK (publication_url IS NULL
               OR publication_url ~ '^https://data\.enseignementsup-recherche\.gouv\.fr/'),
    -- A retrieval time with no URL describes nothing.
    CONSTRAINT website_source_snapshots_origin_pair_chk
        CHECK (origin_retrieved_at IS NULL OR read_url IS NOT NULL),
    -- A run that fetched the bytes itself ALWAYS knows where from, so for that
    -- kind the origin columns are mandatory. Only 'operator_file' may be NULL,
    -- and NULL there means NOT RECORDED - never "unofficial".
    CONSTRAINT website_source_snapshots_fetched_has_origin_chk
        CHECK (source_input_kind = 'operator_file'
               OR (read_url IS NOT NULL
                   AND publication_url IS NOT NULL
                   AND origin_retrieved_at IS NOT NULL))
);

-- THE artifact identity. The register is refreshed upstream and carries no
-- edition number, so identical bytes are the same snapshot, ingested once.
CREATE UNIQUE INDEX website_source_snapshots_artifact_sha256_uidx
    ON website_source_snapshots (artifact_sha256);

CREATE INDEX website_source_snapshots_source_key_idx
    ON website_source_snapshots (source_key, fetched_at DESC);

COMMENT ON TABLE website_source_snapshots IS
    'One EXTERNAL website-verification source ARTIFACT, identified solely by '
    'the SHA-256 of its exact bytes. Phase 1D approves exactly one such '
    'source: the official French Ministry register '
    '(fr-esr-principaux-etablissements-enseignement-superieur). This table '
    'records that an artifact was read and what it contained. It asserts '
    'nothing about any organisation.';

COMMENT ON COLUMN website_source_snapshots.source_location IS
    'Where THIS RUN read the bytes: an https URL for ''official_endpoint'', a '
    'LOCAL FILESYSTEM PATH for ''operator_file''. Read source_input_kind '
    'before interpreting it, and never present a local path as an official '
    'published source.';

COMMENT ON COLUMN website_source_snapshots.publication_url IS
    'WHERE THE DATASET IS PUBLISHED - the official landing page a human can '
    'verify - as distinct from read_url, the machine endpoint the bytes were '
    'actually requested from. NULL means NOT RECORDED, never "unofficial".';

COMMENT ON COLUMN website_source_snapshots.read_url IS
    'The exact URL requested, including the field selection. Phase 1D narrows '
    'the request at the server with an explicit field list, so contact columns '
    'the dataset publishes (a telephone number, and any address field a future '
    'revision might add) are NEVER TRANSMITTED to this process at all. That is '
    'a stronger guarantee than filtering after download, and this column is '
    'the evidence of it.';

COMMENT ON COLUMN website_source_snapshots.fetched_at IS
    'When THIS RUN READ THE BYTES: the HTTP fetch for ''official_endpoint'', '
    'the LOCAL FILE READ for ''operator_file''. For an operator_file run that '
    'is normally LATER than origin_retrieved_at, which is when the artifact '
    'was actually downloaded.';

COMMENT ON COLUMN website_source_snapshots.record_count IS
    'How many records the artifact contained, before any join to ECHE. Kept so '
    'the un-joined remainder stays visible: most records in the French '
    'register publish no PIC, so most of them produce no claim, and a reader '
    'who only counted claims would think the artifact was smaller than it is.';

-- ---------------------------------------------------------------------------
-- website_claims: immutable, per-source assertions.
-- ---------------------------------------------------------------------------

CREATE TABLE website_claims (
    id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    source_kind            text        NOT NULL,
    eche_row_key           text        NOT NULL,
    organisation_id        uuid        REFERENCES organisations (id),
    source_row_key         text        NOT NULL,
    raw_value              text,
    structural_status      text        NOT NULL,
    rejection_reason       text,
    normalised_url         text,
    hostname               text,
    registrable_domain     text,
    rule_version           text        NOT NULL,
    source_snapshot_id     uuid        REFERENCES website_source_snapshots (id),
    source_artifact_sha256 text        NOT NULL,
    observed_at            timestamptz NOT NULL,
    ingest_run_id          uuid        NOT NULL REFERENCES ingest_runs (id),
    created_at             timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT website_claims_source_kind_chk
        CHECK (source_kind IN ('ECHE_PUBLISHED', 'FR_ESR')),
    CONSTRAINT website_claims_sha256_chk
        CHECK (source_artifact_sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT website_claims_eche_row_key_chk CHECK (eche_row_key <> ''),
    CONSTRAINT website_claims_source_row_key_chk CHECK (source_row_key <> ''),

    -- The four structural outcomes, and nothing that resembles a conclusion.
    -- CORROBORATED, VERIFIED and CONFLICT are deliberately ABSENT: they are
    -- relationships between claims, and no single source can hold one.
    CONSTRAINT website_claims_structural_status_chk
        CHECK (structural_status IN
            ('STRUCTURALLY_VALID', 'MALFORMED', 'NOT_A_WEBSITE', 'ABSENT')),

    -- Derived fields exist if and only if the value survived every gate. This
    -- is what stops a rejected value from quietly acquiring a domain later.
    CONSTRAINT website_claims_derived_iff_valid_chk
        CHECK ((structural_status = 'STRUCTURALLY_VALID')
               = (normalised_url IS NOT NULL
                  AND hostname IS NOT NULL
                  AND registrable_domain IS NOT NULL)),

    -- ABSENT is the one status that means the source published nothing.
    CONSTRAINT website_claims_absent_has_no_value_chk
        CHECK ((structural_status = 'ABSENT') = (raw_value IS NULL)),

    -- A rejection carries its reason; an accepted value has none to give.
    CONSTRAINT website_claims_reason_chk
        CHECK ((structural_status = 'STRUCTURALLY_VALID') = (rejection_reason IS NULL)),

    -- An external source's claim must name the artifact snapshot it came from.
    -- ECHE has no snapshot row by design (see above), so it is NULL there.
    CONSTRAINT website_claims_snapshot_chk
        CHECK ((source_kind = 'ECHE_PUBLISHED') = (source_snapshot_id IS NULL))
);

-- IDEMPOTENCY, and the reason this table needs no UPDATE grant.
--
-- Re-running the same source over the same artifact under the same rules is a
-- no-op: the INSERT conflicts and does nothing. A NEW artifact or a NEW rule
-- version produces NEW rows beside the old ones - never an edit - so the
-- history of what each artifact said, and of what each rule version made of
-- it, is fully recoverable.
--
-- source_row_key is part of the key because the relationship is many-to-many
-- in principle: one ECHE row could be named by two records of an external
-- source, and one external record could match two ECHE rows. Both are stored.
-- Neither is resolved.
CREATE UNIQUE INDEX website_claims_dedupe_uidx
    ON website_claims (source_kind, source_artifact_sha256, eche_row_key,
                       source_row_key, rule_version);

CREATE INDEX website_claims_eche_row_key_idx  ON website_claims (eche_row_key);
CREATE INDEX website_claims_organisation_idx  ON website_claims (organisation_id)
    WHERE organisation_id IS NOT NULL;
CREATE INDEX website_claims_domain_idx        ON website_claims (registrable_domain)
    WHERE registrable_domain IS NOT NULL;
CREATE INDEX website_claims_hostname_idx      ON website_claims (hostname)
    WHERE hostname IS NOT NULL;
CREATE INDEX website_claims_run_idx           ON website_claims (ingest_run_id);

COMMENT ON TABLE website_claims IS
    'APPEND-ONLY SOURCE CLAIMS about websites. One row = "this source '
    'published this value for this ECHE source row in this artifact". It is '
    'EVIDENCE, never a conclusion: there is no verified flag, no preferred '
    'website and no winner in this schema, because two official sources '
    'genuinely disagree about 10 French institutions and neither may overwrite '
    'the other. AGREE / DISAGREE / ONE_SIDE_MISSING are derived '
    'deterministically from these rows at query time (src/website/compare.ts), '
    'never stored. UPDATE and DELETE are revoked from the ingest role.';

COMMENT ON COLUMN website_claims.eche_row_key IS
    'THE ANCHOR: normalised(erasmus_code) || ''|'' || pic, identifying one '
    'ECHE SOURCE ROW. Every claim - including one made by the French register '
    '- is about an ECHE source row, because that is the grain this repository '
    'ingests. It is NOT proof of a real-world institution; see the comment on '
    'organisations.eche_row_key.';

COMMENT ON COLUMN website_claims.organisation_id IS
    'CONVENIENCE ONLY, and deliberately NULLABLE. Set when an organisations '
    'row with this eche_row_key already exists in this database, and left NULL '
    'otherwise. It is nullable so the evidence layer can cover an entire '
    'artifact regardless of which subset of it a working database happens to '
    'hold: making it mandatory would silently shrink the evidence to the '
    'ingested subset, and a partial denominator that looks complete is exactly '
    'the failure this repository keeps guarding against. Join on eche_row_key '
    'when you want completeness.';

COMMENT ON COLUMN website_claims.source_row_key IS
    'Stable identity of the row INSIDE the claiming source: the eche_row_key '
    'again for ECHE, and the register''s own internal identifier '
    '(etablissement_id_paysage) for FR_ESR. Part of the idempotency key, so '
    'that two source records naming the same ECHE row both survive.';

COMMENT ON COLUMN website_claims.raw_value IS
    'THE PUBLISHED VALUE, VERBATIM, and the single most important column in '
    'this table. It is read from the artifact itself, NEVER from '
    'organisations.website_url or organisations.canonical_domain - those have '
    'already been through the legacy normalisation path, which is precisely '
    'the defect Phase 1D exists to record. Values such as '
    '"03014851@edu.gva.es", "20004497200087" and '
    '"www.uoi.gr / www.rc.uoi.gr" are stored exactly as published. Only '
    'surrounding whitespace is removed, by the shared ECHE cell reader; '
    'interior characters are untouched. NULL if and only if the source '
    'published nothing, which is recorded as structural_status = ''ABSENT''.';

COMMENT ON COLUMN website_claims.structural_status IS
    'A property of the STRING, never of the institution. STRUCTURALLY_VALID '
    'means only that the value parses as an http(s) URL naming a host under a '
    'real ICANN public suffix and carrying no userinfo. It does NOT mean the '
    'site exists, resolves, belongs to this organisation, or is its main site '
    '- Phase 1D never fetches anything. NOT_A_WEBSITE is address-shaped but '
    'definitively not a website (an email address, an invented TLD); '
    'MALFORMED is not a single parsable web address at all (free text, two '
    'URLs in one cell, a broken scheme); ABSENT means the source published '
    'no value.';

COMMENT ON COLUMN website_claims.registrable_domain IS
    'eTLD+1 under the ICANN section of the public suffix list. DELIBERATELY '
    'SEPARATE FROM hostname, and deliberately not identity: 1,021 ECHE rows '
    'share a registrable domain and 374 share a full hostname, so agreement '
    'here is agreement about a DOMAIN and never about an institution. One '
    'institution may legitimately use several domains, and one domain may '
    'serve many institutions.';

COMMENT ON COLUMN website_claims.rule_version IS
    'Which version of the structural rules produced the derived columns. '
    'Stored so a classification always says what made it, and part of the '
    'idempotency key so a rule change yields NEW rows rather than a rewrite '
    'of existing evidence.';

COMMENT ON COLUMN website_claims.observed_at IS
    'When this claim was read out of its artifact. Distinct from created_at, '
    'which is when the row was inserted.';

-- An ABSENT claim is a POSITIVE FACT and is stored as a row on purpose.
--
-- "The source published no website for this row" and "we never examined this
-- row" are different findings, and representing the first as a missing row
-- would make them indistinguishable. Storing it means the ECHE claim count for
-- an artifact equals that artifact's row count exactly - 6,139 - so
-- completeness is verifiable with a single COUNT rather than assumed.
COMMENT ON CONSTRAINT website_claims_absent_has_no_value_chk ON website_claims IS
    'ABSENT rows exist deliberately: a source publishing nothing is evidence, '
    'and is not the same as a row that was never looked at.';

-- ---------------------------------------------------------------------------
-- Grants. Append-only, enforced by the database.
-- ---------------------------------------------------------------------------
--
-- Both tables are pure source evidence keyed to an immutable artifact hash.
-- There is no legitimate reason for the ingest role ever to change a row: a
-- changed register is a NEW snapshot and a NEW set of claims, never an edit to
-- an old one. So nwf_ingest gets SELECT and INSERT and nothing else.

GRANT SELECT, INSERT ON website_source_snapshots TO nwf_ingest;
GRANT SELECT, INSERT ON website_claims           TO nwf_ingest;

GRANT SELECT ON website_source_snapshots, website_claims TO nwf_readonly;

-- Defensive: make the append-only intent explicit for any future role too.
REVOKE UPDATE, DELETE ON website_source_snapshots FROM PUBLIC;
REVOKE UPDATE, DELETE ON website_claims           FROM PUBLIC;
