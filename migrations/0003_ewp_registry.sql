-- 0003_ewp_registry.sql
-- Phase 1B: the EWP Registry as a SECOND official source.
--
-- WHAT THIS IS NOT
--
--   Nothing in this migration merges, enriches, deduplicates or resolves
--   `organisations`. No foreign key points at `organisations`, deliberately:
--   deciding that an EWP HEI and an ECHE row are the same real-world
--   institution is ENTITY RESOLUTION, which is a later gated phase that has not
--   been carried out. Phase 1B preserves EWP source evidence side by side with
--   ECHE source evidence and MEASURES how their published identifiers relate.
--   The measurement is computed artifact-to-artifact and is deliberately not
--   stored here as a claim.
--
-- STRUCTURE OF THE OFFICIAL DOCUMENT (verified against the live catalogue,
-- artifact sha256 3f1977d0468c6f207832fc692837dd0f4c0c8e4effbbae0c7e0d55742b9c7e74,
-- 45,815,947 bytes, fetched 2026-08-22):
--
--   <catalogue>
--     <host> x 3894            -- a server implementing EWP APIs
--       <apis-implemented>     -- WHICH APIS THIS HOST DECLARES
--       <institutions-covered> -- WHICH HEIs THIS HOST ACTS FOR (by hei-id)
--     <institutions>
--       <hei id="SCHAC"> x 3472
--         <other-id type="..."> x 7461
--         <name [xml:lang]>
--
--   API declarations therefore hang off a HOST, never directly off an HEI. The
--   tables below preserve that shape rather than flattening it, because
--   flattening would invent a relationship the source does not publish.
--
-- MEASURED PROPERTIES OF THAT ARTIFACT (see docs/adr/0001-ewp-registry-second-official-source.md):
--   hosts                          3894  (17 of them cover no HEI at all)
--   hosts covering exactly one HEI 3877  (none covers two or more)
--   HEIs                           3472  ids distinct 3472/3472, never blank
--   other-id elements              7461  types: erasmus 3476, pic 3443,
--                                        erasmus-charter 219, euc 149,
--                                        eche 104, oid 68, OID 1, local 1
--   of which persisted             7457  4 are published with an EMPTY value
--                                        (a self-closing <other-id type="euc"/>)
--                                        and are reported, not stored
--   HEIs with 2 erasmus ids           5  HEIs with 2 pic ids   7
--   HEIs with no pic id              36  HEIs with no erasmus  1
--
-- THE CATALOGUE IS CONTINUOUSLY REFRESHED. There is no upstream edition or
-- version number, so a snapshot is identified by the SHA-256 of its exact bytes
-- and by nothing else.

-- ---------------------------------------------------------------------------
-- ingest_runs: conservative extension, no change to existing semantics.
-- ---------------------------------------------------------------------------

-- Artifact size in bytes. Recorded alongside source_file_sha256 so a run states
-- both WHAT it consumed and HOW BIG it was. Nullable: Phase 1A runs predate it
-- and are never back-filled with a guess.
ALTER TABLE ingest_runs ADD COLUMN IF NOT EXISTS source_file_bytes bigint;

COMMENT ON COLUMN ingest_runs.source_file_bytes IS
    'Size in bytes of the exact artifact this run consumed. NULL for runs '
    'recorded before Phase 1B - never back-filled, because the byte count of a '
    'past artifact cannot be recovered from the run record.';

-- 'official_endpoint' is added for EWP. It is NOT the same thing as
-- 'discovered': the ECHE spreadsheet URL changes and must be re-discovered from
-- a document page each time, whereas the EWP catalogue lives at one stable
-- well-known URL defined by the EWP Registry API. Recording them as the same
-- kind would misdescribe how the bytes were obtained.
ALTER TABLE ingest_runs DROP CONSTRAINT IF EXISTS ingest_runs_input_kind_chk;
ALTER TABLE ingest_runs ADD CONSTRAINT ingest_runs_input_kind_chk
    CHECK (source_input_kind IN
        ('discovered', 'operator_url', 'operator_file', 'official_endpoint'));

COMMENT ON COLUMN ingest_runs.source_input_kind IS
    'How the bytes were obtained, and therefore how to read resolved_file_url: '
    '''discovered'' = found on the official ECHE document page (source_page_url '
    'is set, resolved_file_url is an official https URL); ''official_endpoint'' '
    '= fetched from a stable well-known official API URL, currently the EWP '
    'Registry catalogue; ''operator_url'' = an operator-supplied official URL, '
    'still origin-validated; ''operator_file'' = a LOCAL FILE supplied by the '
    'operator, in which case resolved_file_url is a filesystem path and NOT a '
    'published source of any kind.';

-- Phase 1A ingested one source system. Phase 1B adds a second, and it is
-- deliberately NOT recorded through this table.
COMMENT ON COLUMN organisation_sources.source_system IS
    'Which dataset this evidence came from. Phase 1A ingests ''eche''. EWP '
    'Registry evidence is NEVER written here: it lives in the ewp_* tables and '
    'is deliberately not attached to an organisation, because attaching it '
    'would assert an entity resolution that has not been carried out.';

-- ---------------------------------------------------------------------------
-- ewp_snapshots: one row per DISTINCT ARTIFACT, not per run.
-- ---------------------------------------------------------------------------

CREATE TABLE ewp_snapshots (
    id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    artifact_sha256       text        NOT NULL,
    artifact_bytes        bigint      NOT NULL,
    source_input_kind     text        NOT NULL,
    source_location       text        NOT NULL,
    fetched_at            timestamptz NOT NULL,
    first_ingest_run_id   uuid        NOT NULL REFERENCES ingest_runs (id),
    host_count            integer     NOT NULL,
    hei_count             integer     NOT NULL,
    other_id_count        integer     NOT NULL,
    api_declaration_count integer     NOT NULL,
    created_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ewp_snapshots_sha256_chk
        CHECK (artifact_sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ewp_snapshots_bytes_chk CHECK (artifact_bytes > 0),
    CONSTRAINT ewp_snapshots_counts_chk
        CHECK (host_count >= 0 AND hei_count >= 0
               AND other_id_count >= 0 AND api_declaration_count >= 0),
    -- 'discovered' is deliberately excluded: there is no EWP document page to
    -- discover a file from, so recording that kind here would be a false claim.
    CONSTRAINT ewp_snapshots_input_kind_chk
        CHECK (source_input_kind IN
            ('official_endpoint', 'operator_url', 'operator_file'))
);

-- THE artifact identity. The catalogue is refreshed continuously and publishes
-- no edition identifier, so identical bytes are the same snapshot and are
-- ingested once. Re-ingesting the same artifact is a no-op, not a duplicate.
CREATE UNIQUE INDEX ewp_snapshots_artifact_sha256_uidx
    ON ewp_snapshots (artifact_sha256);

COMMENT ON TABLE ewp_snapshots IS
    'One EWP Registry catalogue ARTIFACT, identified solely by the SHA-256 of '
    'its exact bytes. The live catalogue is continuously refreshed and carries '
    'no upstream edition or version number, so no other identity exists and '
    'none is invented. Every ewp_* evidence row belongs to exactly one snapshot.';

COMMENT ON COLUMN ewp_snapshots.source_location IS
    'Where the bytes were read from: an official https URL for '
    '''official_endpoint''/''operator_url'', or a LOCAL FILESYSTEM PATH for '
    '''operator_file''. Read source_input_kind before interpreting it, and '
    'never present a local path as an official published source.';

COMMENT ON COLUMN ewp_snapshots.first_ingest_run_id IS
    'The run that first persisted this artifact. Later runs over identical '
    'bytes are recorded in ingest_runs as unchanged and do not re-insert '
    'evidence, so this column names the run that created the rows - not the '
    'most recent run that saw them.';

-- ---------------------------------------------------------------------------
-- ewp_heis: the <institutions> block.
-- ---------------------------------------------------------------------------

CREATE TABLE ewp_heis (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id    uuid        NOT NULL REFERENCES ewp_snapshots (id),
    document_index integer     NOT NULL,
    hei_id         text        NOT NULL,
    hei_id_folded  text        NOT NULL,
    names          jsonb       NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ewp_heis_hei_id_chk CHECK (hei_id <> ''),
    CONSTRAINT ewp_heis_names_is_array_chk CHECK (jsonb_typeof(names) = 'array')
);

CREATE UNIQUE INDEX ewp_heis_snapshot_hei_uidx ON ewp_heis (snapshot_id, hei_id);
CREATE UNIQUE INDEX ewp_heis_snapshot_index_uidx
    ON ewp_heis (snapshot_id, document_index);
CREATE INDEX ewp_heis_folded_idx ON ewp_heis (hei_id_folded);

COMMENT ON TABLE ewp_heis IS
    'One <hei> entry from one EWP catalogue snapshot. This is SOURCE EVIDENCE '
    'from a second official dataset, NOT an organisation and NOT a verified '
    'match to any organisations row. Nothing in Phase 1B links the two: whether '
    'an ewp_heis row and an organisations row are the same real-world '
    'institution is an entity-resolution question that has not been answered.';

-- The single most important comment in this migration.
COMMENT ON COLUMN ewp_heis.hei_id IS
    'The SCHAC-style institutional identifier, exactly as published in the '
    '<hei id="..."> attribute. IT IS AN IDENTIFIER, NOT A WEBSITE. Many values '
    'are domain-shaped (aalto.fi), which makes it tempting and WRONG to read '
    'one as a web address: the live catalogue also publishes '
    '"0740047Z.educonnect.education.gouv.fr", which is plainly a registry key '
    'rather than an institution''s site. This column must NEVER be copied into '
    'organisations.canonical_domain, never used to infer a website, and never '
    'used as a crawl target. Establishing that a particular SCHAC identifier '
    'corresponds to a usable official web domain requires independent evidence '
    'and is a later phase.';

COMMENT ON COLUMN ewp_heis.hei_id_folded IS
    'hei_id trimmed and lower-cased. A CASE-FOLDED COMPARISON KEY ONLY. It '
    'carries exactly the same warning as hei_id: it is not a domain, not a '
    'website and not identity. Exactly one value in the measured snapshot '
    'differed from its raw form by case.';

COMMENT ON COLUMN ewp_heis.names IS
    'JSON array of {"lang": <xml:lang or null>, "value": <name>} in document '
    'order. EWP publishes 1 to 5 names per HEI. Values are stored exactly as '
    'the XML decodes: the live catalogue double-escapes some entities, so a '
    'name may legitimately contain the literal text "&#39;". That is preserved, '
    'not repaired - the artifact is the evidence.';

COMMENT ON COLUMN ewp_heis.document_index IS
    'Zero-based position of this <hei> within the snapshot''s <institutions> '
    'block. Preserved so evidence can be located in the original artifact.';

-- ---------------------------------------------------------------------------
-- ewp_hei_other_ids: the one-to-many identifier evidence.
-- ---------------------------------------------------------------------------

CREATE TABLE ewp_hei_other_ids (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id         uuid        NOT NULL REFERENCES ewp_snapshots (id),
    ewp_hei_id          uuid        NOT NULL REFERENCES ewp_heis (id),
    ordinal             integer     NOT NULL,
    id_type             text        NOT NULL,
    id_type_folded      text        NOT NULL,
    id_value            text        NOT NULL,
    id_value_normalised text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ewp_hei_other_ids_type_chk  CHECK (id_type <> ''),
    CONSTRAINT ewp_hei_other_ids_value_chk CHECK (id_value <> '')
);

CREATE UNIQUE INDEX ewp_hei_other_ids_uidx
    ON ewp_hei_other_ids (ewp_hei_id, ordinal);
CREATE INDEX ewp_hei_other_ids_lookup_idx
    ON ewp_hei_other_ids (snapshot_id, id_type_folded, id_value_normalised)
    WHERE id_value_normalised IS NOT NULL;

COMMENT ON TABLE ewp_hei_other_ids IS
    'Official identifiers an EWP HEI publishes about itself. DELIBERATELY '
    'one-to-many and deliberately unconstrained on uniqueness: the measured '
    'snapshot contains HEIs carrying two Erasmus codes and HEIs carrying two '
    'PICs, and choosing a winner would be entity resolution. Both are stored, '
    'both are reported, neither is preferred.';

COMMENT ON COLUMN ewp_hei_other_ids.id_type IS
    'The type attribute EXACTLY as published, including its case. The live '
    'catalogue publishes both "oid" (68 rows) and "OID" (1 row); folding them '
    'together here would silently assert they mean the same thing, which the '
    'source does not state. Group on id_type_folded when you want that '
    'assumption, and make it visible when you do.';

COMMENT ON COLUMN ewp_hei_other_ids.id_value IS
    'The identifier value EXACTLY as published, never repaired. Eight PIC '
    'values in the measured snapshot are not plain digits as published: two '
    'carry a stray leading or trailing space, which trimming resolves, and six '
    'do not survive at all - scientific notation ("9.9958762E8"), a truncated '
    'decimal ("9.99630009"), and four values that are plainly OIDs rather than '
    'PICs ("E10158141"). All eight are stored verbatim; the six get no '
    'comparison value, because guessing the intended digits would fabricate an '
    'official identifier.';

COMMENT ON COLUMN ewp_hei_other_ids.id_value_normalised IS
    'A DETERMINISTIC comparison value, or NULL when no justified rule exists. '
    'Rules, and only these: type "erasmus" uses the repository''s single '
    'Erasmus-code normalisation (NBSP to space, whitespace runs collapsed, '
    'trimmed, upper-cased) - EWP pads codes with two spaces ("F  THONON03") '
    'where ECHE uses NBSP, and this is what makes them comparable at all; type '
    '"pic" is trimmed and kept only if it is all digits. Every other type is '
    'NULL, because inventing a normalisation would invent semantics the source '
    'does not define. NULL means "not deterministically comparable", never '
    '"absent" - the published value is always in id_value.';

-- ---------------------------------------------------------------------------
-- ewp_hosts and what they declare.
-- ---------------------------------------------------------------------------

CREATE TABLE ewp_hosts (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id    uuid        NOT NULL REFERENCES ewp_snapshots (id),
    document_index integer     NOT NULL,
    admin_provider text,
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ewp_hosts_snapshot_index_uidx
    ON ewp_hosts (snapshot_id, document_index);

COMMENT ON TABLE ewp_hosts IS
    'One <host> from a snapshot: a server that implements EWP APIs on behalf of '
    'the institutions it covers. A host is NOT an institution, and the two must '
    'not be conflated - in the measured snapshot 17 hosts cover no institution '
    'at all, and several institutions are served by more than one host.';

-- Phase 1B has no contact capability, so it does not collect contacts.
COMMENT ON COLUMN ewp_hosts.admin_provider IS
    'The <ewp:admin-provider> value: the software vendor or consortium '
    'operating the host (for example "MUCI (USOS)"). The sibling '
    '<ewp:admin-email> element IS PRESENT IN THE SOURCE AND IS DELIBERATELY NOT '
    'PERSISTED ANYWHERE IN THIS SCHEMA. It is a technical contact address, and '
    'Phase 1B has no approved contact-discovery or contact-storage capability. '
    'Do not add a column for it.';

CREATE TABLE ewp_host_covered_heis (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id   uuid        NOT NULL REFERENCES ewp_snapshots (id),
    ewp_host_id   uuid        NOT NULL REFERENCES ewp_hosts (id),
    ordinal       integer     NOT NULL,
    hei_id        text        NOT NULL,
    hei_id_folded text        NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ewp_host_covered_heis_hei_id_chk CHECK (hei_id <> '')
);

CREATE UNIQUE INDEX ewp_host_covered_heis_uidx
    ON ewp_host_covered_heis (ewp_host_id, ordinal);
CREATE INDEX ewp_host_covered_heis_hei_idx
    ON ewp_host_covered_heis (snapshot_id, hei_id);

COMMENT ON TABLE ewp_host_covered_heis IS
    'The <institutions-covered>/<hei-id> references linking a host to the '
    'institutions it serves. Stored as a table rather than as an array on '
    'ewp_hosts because the format permits many, even though every covering host '
    'in the measured snapshot covered exactly one. That is an observation about '
    'one artifact, not an invariant, and the schema does not pretend otherwise. '
    'No foreign key to ewp_heis: this is a reference AS PUBLISHED, and a '
    'dangling reference is a finding to report rather than an error to reject.';

CREATE TABLE ewp_api_declarations (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id      uuid        NOT NULL REFERENCES ewp_snapshots (id),
    ewp_host_id      uuid        NOT NULL REFERENCES ewp_hosts (id),
    ordinal          integer     NOT NULL,
    api_namespace    text        NOT NULL,
    api_local_name   text        NOT NULL,
    declared_version text,
    endpoints        jsonb       NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ewp_api_declarations_ns_chk    CHECK (api_namespace <> ''),
    CONSTRAINT ewp_api_declarations_local_chk CHECK (api_local_name <> ''),
    CONSTRAINT ewp_api_declarations_endpoints_is_object_chk
        CHECK (jsonb_typeof(endpoints) = 'object')
);

CREATE UNIQUE INDEX ewp_api_declarations_uidx
    ON ewp_api_declarations (ewp_host_id, ordinal);
CREATE INDEX ewp_api_declarations_type_idx
    ON ewp_api_declarations (snapshot_id, api_local_name);

COMMENT ON TABLE ewp_api_declarations IS
    'Which EWP APIs a host DECLARES. Declaration only: Phase 1B records that an '
    'endpoint was advertised and NEVER calls it. In particular the '
    'organizational-units (OUnits) API, declared by 3086 hosts, would expose '
    'faculties, departments and language centres - which is precisely why '
    'calling it is out of scope until a phase is approved for it.';

COMMENT ON COLUMN ewp_api_declarations.api_local_name IS
    'The manifest entry element''s local name, for example "institutions" or '
    '"organizational-units". NOT unique on its own: the same local name appears '
    'under different namespaces for different major versions of the same API '
    '("imobilities" exists under stable-v1, stable-v2 and stable-v3). The API '
    'type is (api_namespace, api_local_name) together.';

COMMENT ON COLUMN ewp_api_declarations.declared_version IS
    'The version attribute exactly as published, or NULL when the entry carried '
    'none. Not parsed into components and not reconciled with the namespace''s '
    'major version - they disagree in the live data, and resolving that would '
    'be a guess.';

COMMENT ON COLUMN ewp_api_declarations.endpoints IS
    'JSON object of the entry''s endpoint children, keyed by element local name '
    '("url", "get-url", "index-url", "stats-url", "update-url", '
    '"catalogue-url"). Recorded as evidence of what is advertised. Nothing in '
    'this repository fetches them. Non-endpoint children (max-* limits, '
    'http-security, and the admin-email contact address) are not stored.';

-- ---------------------------------------------------------------------------
-- Grants. Stricter than Phase 1A on purpose.
-- ---------------------------------------------------------------------------
--
-- Every ewp_* table is PURE SOURCE EVIDENCE keyed to an immutable artifact
-- hash. Unlike organisations, there is no legitimate reason for the ingest role
-- ever to change a row: a changed catalogue is a NEW snapshot, never an edit to
-- an old one. So nwf_ingest gets SELECT and INSERT and nothing else, and the
-- database - not this repository's code - is what enforces it.

GRANT SELECT, INSERT ON ewp_snapshots         TO nwf_ingest;
GRANT SELECT, INSERT ON ewp_heis              TO nwf_ingest;
GRANT SELECT, INSERT ON ewp_hei_other_ids     TO nwf_ingest;
GRANT SELECT, INSERT ON ewp_hosts             TO nwf_ingest;
GRANT SELECT, INSERT ON ewp_host_covered_heis TO nwf_ingest;
GRANT SELECT, INSERT ON ewp_api_declarations  TO nwf_ingest;

GRANT SELECT ON ewp_snapshots, ewp_heis, ewp_hei_other_ids,
                ewp_hosts, ewp_host_covered_heis, ewp_api_declarations
    TO nwf_readonly;

-- Defensive: make the append-only intent explicit for any future role too.
REVOKE UPDATE, DELETE ON ewp_snapshots         FROM PUBLIC;
REVOKE UPDATE, DELETE ON ewp_heis              FROM PUBLIC;
REVOKE UPDATE, DELETE ON ewp_hei_other_ids     FROM PUBLIC;
REVOKE UPDATE, DELETE ON ewp_hosts             FROM PUBLIC;
REVOKE UPDATE, DELETE ON ewp_host_covered_heis FROM PUBLIC;
REVOKE UPDATE, DELETE ON ewp_api_declarations  FROM PUBLIC;
