-- 0001_organisations.sql
-- Phase 1A core schema: organisations, provenance, ingest runs.
--
-- KEY DESIGN NOTE (verified against the live ECHE dataset, 2026-08-21):
--
--   `Erasmus code` is NOT unique in the official ECHE spreadsheet.
--   Measured on accredited-HEIs-Erasmus-2021-2027_17082026_1.xlsx:
--     6139 data rows, 6138 distinct Erasmus codes.
--     "E<NBSP> VIGO13" appears twice - the same institution under two names
--     ("CIFP AUDIOVISUAL DE VIGO" / "IES Audiovisual de Vigo"), same OID and
--     same address, but two different PIC values.
--
--   Gate 0.5 made a UNIQUE constraint on erasmus_code conditional on verifying
--   uniqueness first. That precondition FAILED, so no UNIQUE constraint is
--   placed on erasmus_code. It is indexed only.
--
--   PIC and OID are deliberately NOT unique either: whether their cardinality
--   maps 1:1 onto a future canonical organisation is a Phase 1B entity-
--   resolution question, not a Phase 1A one.
--
--   Idempotent ingestion therefore anchors on `eche_row_key`, which identifies
--   an ECHE SOURCE ROW - not a canonical real-world organisation. Measured
--   unique at 6139/6139 rows.
--
-- Measured over all 6139 rows of the official file (sha256
-- 32e1de18...932fdee9, retrieved 2026-08-21):
--
--   normalised erasmus_code : 6138 distinct, 1 duplicate group, 1 surplus row
--   pic                     : 6139 distinct, 0 null, 0 duplicates
--   oid                     : 6038 distinct, 100 null, 1 duplicate group
--   canonical_domain        : 5028 distinct, 248 null, 158 duplicate groups,
--                             863 surplus rows (52 institutions share gva.es)
--   eche_row_key            : 6139 distinct, 0 duplicates

CREATE TABLE ingest_runs (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_system     text        NOT NULL,
    source_page_url   text,
    resolved_file_url text,
    source_input_kind text        NOT NULL,
    source_file_sha256 text,
    started_at        timestamptz NOT NULL DEFAULT now(),
    finished_at       timestamptz,
    rows_read         integer     NOT NULL DEFAULT 0,
    rows_inserted     integer     NOT NULL DEFAULT 0,
    rows_updated      integer     NOT NULL DEFAULT 0,
    rows_unchanged    integer     NOT NULL DEFAULT 0,
    status            text        NOT NULL,
    error_summary     text,
    dry_run           boolean     NOT NULL DEFAULT false,
    CONSTRAINT ingest_runs_status_chk
        CHECK (status IN ('running', 'succeeded', 'failed')),
    CONSTRAINT ingest_runs_input_kind_chk
        CHECK (source_input_kind IN ('discovered', 'operator_url', 'operator_file'))
);

COMMENT ON TABLE ingest_runs IS
    'One execution of an ingest. Mutable: a run is created before it finishes. '
    'Together with organisation_sources this is the whole provenance model: the '
    'run says WHERE the bytes came from and WHAT they hashed to, the source row '
    'says what one record inside them contained.';

-- The three columns below must be read together. Only source_input_kind says
-- whether resolved_file_url is a URL or a local path, so neither this schema nor
-- any tool built on it may present a local path as an official EU source URL.
COMMENT ON COLUMN ingest_runs.source_input_kind IS
    'How the bytes were obtained, and therefore how to read resolved_file_url: '
    '''discovered'' = found on the official ECHE document page (source_page_url '
    'is set, resolved_file_url is an official https URL); ''operator_url'' = an '
    'operator-supplied official URL, still origin-validated; ''operator_file'' = '
    'a LOCAL FILE supplied by the operator, in which case resolved_file_url is a '
    'filesystem path and NOT a published source of any kind.';
COMMENT ON COLUMN ingest_runs.source_page_url IS
    'The authoritative ECHE document page the file was discovered from. NULL '
    'whenever the operator supplied the file or URL directly - never back-filled '
    'with a guess.';
COMMENT ON COLUMN ingest_runs.resolved_file_url IS
    'Where the ingested bytes were actually read from: an official https URL for '
    '''discovered''/''operator_url'', or a local filesystem path for '
    '''operator_file''. Read source_input_kind before interpreting it.';
COMMENT ON COLUMN ingest_runs.source_file_sha256 IS
    'SHA-256 of the exact bytes ingested. This, not the path or URL, is what '
    'identifies WHICH ECHE artifact a run consumed, and it is what makes an '
    'ingest from a local cached copy verifiable against the published file.';

CREATE TABLE organisations (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    eche_row_key     text        NOT NULL,
    legal_name       text        NOT NULL,
    display_name     text        NOT NULL,
    country_code     char(2)     NOT NULL,
    city             text,
    erasmus_code     text        NOT NULL,
    pic              text,
    oid              text,
    website_url      text,
    canonical_domain text,
    org_type         text        NOT NULL DEFAULT 'higher_education_institution',
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT organisations_country_code_chk CHECK (country_code ~ '^[A-Z]{2}$'),
    CONSTRAINT organisations_org_type_chk
        CHECK (org_type IN ('higher_education_institution'))
);

-- The ONLY uniqueness claim in Phase 1A. Scope: one ECHE source row.
-- This is deliberately not a claim about canonical organisation identity.
CREATE UNIQUE INDEX organisations_eche_row_key_uidx ON organisations (eche_row_key);

-- Non-unique: duplicates are data to analyse, not errors to merge away.
CREATE INDEX organisations_erasmus_code_idx     ON organisations (erasmus_code);
CREATE INDEX organisations_country_code_idx     ON organisations (country_code);
CREATE INDEX organisations_pic_idx              ON organisations (pic)              WHERE pic IS NOT NULL;
CREATE INDEX organisations_oid_idx              ON organisations (oid)              WHERE oid IS NOT NULL;
CREATE INDEX organisations_canonical_domain_idx ON organisations (canonical_domain) WHERE canonical_domain IS NOT NULL;

-- Phase 1A ingests ECHE source rows. It does NOT perform entity resolution, and
-- nothing in this schema establishes that one row corresponds to one real-world
-- institution. These comments put that where a future developer or agent will
-- actually look - `\d+ organisations` - not only in a markdown file.
COMMENT ON TABLE organisations IS
    'PROVISIONAL organisation records derived from ECHE SOURCE ROWS. '
    'In Phase 1A one row = one ECHE source row, NOT a verified unique '
    'real-world institution: two rows may be the same institution, and entity '
    'resolution is a later gated phase that has not been carried out. Nothing '
    'here merges records automatically, and no column in this table may be '
    'treated as a canonical identity key.';

COMMENT ON COLUMN organisations.eche_row_key IS
    'SOURCE-ROW identity only: normalised(erasmus_code) || ''|'' || pic. The '
    'idempotency anchor for re-ingestion. Measured unique at 6139/6139. Two '
    'DIFFERENT row keys are NOT proof of two different real-world institutions '
    '- the one duplicated Erasmus code in the file (E VIGO13) produces two row '
    'keys for what is plausibly one institution. Never use it as entity proof.';

COMMENT ON COLUMN organisations.erasmus_code IS
    'Normalised (NBSP->space, whitespace collapsed, trimmed, uppercased); '
    'normalisation verified collision-free on the live dataset. NOT unique '
    '(6138 distinct over 6139 rows) and NOT an identity key.';

COMMENT ON COLUMN organisations.pic IS
    'Participant Identification Code as published. Stored EVIDENCE and a '
    'candidate join key for a future entity-resolution phase, NOT a canonical '
    'identity key. Currently distinct on every row and never blank, which is an '
    'observation about one snapshot, not a guarantee - hence no unique '
    'constraint.';

COMMENT ON COLUMN organisations.oid IS
    'Organisation ID as published. Stored EVIDENCE and a candidate join key, '
    'NOT a canonical identity key. 100 rows have none and one value is shared '
    'by two rows.';

COMMENT ON COLUMN organisations.canonical_domain IS
    'Registrable domain (eTLD+1) derived from website_url. DESCRIPTIVE '
    'ENRICHMENT, NOT an identity key: strongly non-unique because institutions '
    'share regional education portals (52 rows share gva.es) and generic hosts '
    '(google.com, wixsite.com). Never dedupe or join on it as if it were '
    'identity.';

COMMENT ON COLUMN organisations.display_name IS
    'Currently a copy of legal_name; ECHE publishes one name. Kept separate so '
    'a later source can supply a better display form. Never derived or rewritten.';

CREATE TABLE organisation_sources (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id  uuid        NOT NULL REFERENCES organisations (id),
    ingest_run_id    uuid        NOT NULL REFERENCES ingest_runs (id),
    source_system    text        NOT NULL,
    source_record_id text        NOT NULL,
    source_url       text        NOT NULL,
    source_licence   text        NOT NULL,
    retrieved_at     timestamptz NOT NULL,
    raw_payload      jsonb       NOT NULL,
    payload_sha256   text        NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now()
);

-- Deterministic re-ingestion: an identical source record for the same
-- organisation is recognised and not duplicated.
CREATE UNIQUE INDEX organisation_sources_dedupe_uidx
    ON organisation_sources (organisation_id, source_system, source_record_id, payload_sha256);

CREATE INDEX organisation_sources_org_idx ON organisation_sources (organisation_id);
CREATE INDEX organisation_sources_run_idx ON organisation_sources (ingest_run_id);

COMMENT ON TABLE organisation_sources IS
    'Append-only provenance. Evidence is never overwritten: UPDATE and DELETE '
    'are revoked from the ingest role (see 0002_roles.sql).';

COMMENT ON COLUMN organisation_sources.source_url IS
    'Where this record was read from, copied from the run''s resolved_file_url: '
    'an official https URL, or a LOCAL FILE PATH when the run''s '
    'source_input_kind is ''operator_file''. It is NOT a claim that the value is '
    'a published or authoritative URL. Join ingest_run_id -> ingest_runs to see '
    'source_input_kind, source_page_url and source_file_sha256.';
COMMENT ON COLUMN organisation_sources.source_system IS
    'Which dataset this evidence came from. Phase 1A ingests one: ''eche''.';
COMMENT ON COLUMN organisation_sources.payload_sha256 IS
    'SHA-256 of this single source row''s raw payload, used to recognise an '
    'unchanged record on re-ingest. Distinct from ingest_runs.source_file_sha256, '
    'which hashes the whole artifact.';
