-- Migration 0019 - REL L2 / U1: INDEPENDENT SOURCE DISCOVERY NOMINATIONS.
--
-- Until now an organisation could enter the engine only from an official
-- register (ECHE, EWP, the French register) or when an operator PROPOSED a
-- discovery subject by hand (migration 0013/0014). Off-domain anchors found
-- during bounded acquisition were discarded. This migration adds an
-- APPEND-ONLY place to record that a source NOMINATED an organisation's
-- public URL - and nothing more:
--
--   A. `source_discovery_briefs` - one versioned, deterministic QUERY PLAN,
--      identified by its own SHA-256 digest, with the geography it claims to
--      cover, the target kinds it is written for and the languages it uses.
--   B. `source_discovery_runs` - one execution identity: a SEARCH_PROVIDER run
--      over ONE geography of ONE brief, a PAGE_LINK_OUT capture attached to
--      ONE research run, or an operator SEED list.
--   C. `source_discovery_nominations` - one nominated URL, deduplicated per
--      run by registrable domain.
--
-- A NOMINATION IS NOT AN ORGANISATION, NOT A SUBJECT, NOT A ROOT AND NOT A
-- VERDICT. It says "this provider, for this query, returned this public URL at
-- this time", or "this already-read page linked out to this URL". It is never
-- fetched by anything this migration enables, it grants no research authority
-- (no orgunit_* table references it), and it becomes a discovery subject only
-- through the EXISTING B2.2 writer, as an explicit operator act.
--
-- `eche_overlap` is a MEASUREMENT: whether any website claim publishes the
-- same registrable domain. The database recomputes it on every INSERT and
-- refuses a row that disagrees, so the caller cannot assert it. It is never a
-- join key and never a merge: sharing a domain is not identity (CLAUDE.md
-- "canonical_domain is descriptive/enrichment data, NOT an identity key").
--
-- `hei_signal` is a FLAG produced by a named, versioned deterministic rule,
-- not a classification: it does not say the organisation IS a university.
--
-- WHAT IT DOES NOT DO. No contact column, no country/locale/market column on
-- a nomination, no score, no relevance, no status, no UPDATE or DELETE grant
-- to anyone, no SECURITY DEFINER function, and no change to any existing
-- table, role or grant.

-- ---------------------------------------------------------------------------
-- 0. The capability role. NOLOGIN, no password, no attributes (0014 pattern).
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nwf_source_discovery') THEN
        CREATE ROLE nwf_source_discovery NOLOGIN;
    END IF;
END
$$;

ALTER ROLE nwf_source_discovery
    NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD NULL;

COMMENT ON ROLE nwf_source_discovery IS
    'REL L2 CAPABILITY ROLE (NOLOGIN): may append source-discovery briefs, runs '
    'and nominations, and read exactly the columns needed to MEASURE eche_overlap '
    'and the observed_at of a link-out source page. SELECT + INSERT only: no '
    'UPDATE, DELETE, TRUNCATE or TEMPORARY. Holding it is not research authority, '
    'not subject-writer authority and not OWNER identity.';

-- ---------------------------------------------------------------------------
-- A. Briefs.
-- ---------------------------------------------------------------------------

CREATE TABLE source_discovery_briefs (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    brief_key         text        NOT NULL,
    plan_digest       text        NOT NULL,
    query_plan        jsonb       NOT NULL,
    geography_claim   text[]      NOT NULL,
    target_kinds      text[]      NOT NULL,
    languages         text[]      NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT source_discovery_briefs_key_chk
        CHECK (brief_key ~ '^[a-z0-9][a-z0-9-]{2,62}-v[0-9]{1,4}$'),
    CONSTRAINT source_discovery_briefs_digest_chk
        CHECK (plan_digest ~ '^[0-9a-f]{64}$'),
    CONSTRAINT source_discovery_briefs_plan_chk
        CHECK (jsonb_typeof(query_plan) = 'object'),
    CONSTRAINT source_discovery_briefs_geography_chk
        CHECK (cardinality(geography_claim) BETWEEN 1 AND 64
               AND array_to_string(geography_claim, ',') ~ '^[A-Z]{2}(,[A-Z]{2})*$'),
    CONSTRAINT source_discovery_briefs_target_kinds_chk
        CHECK (cardinality(target_kinds) BETWEEN 1 AND 32
               AND array_to_string(target_kinds, ',') ~ '^[A-Z][A-Z_]{2,63}(,[A-Z][A-Z_]{2,63})*$'),
    CONSTRAINT source_discovery_briefs_languages_chk
        CHECK (cardinality(languages) BETWEEN 1 AND 32
               AND array_to_string(languages, ',') ~ '^[a-z]{2,3}(,[a-z]{2,3})*$')
);

CREATE UNIQUE INDEX source_discovery_briefs_key_digest_uidx
    ON source_discovery_briefs (brief_key, plan_digest);

COMMENT ON TABLE source_discovery_briefs IS
    'ONE VERSIONED, DETERMINISTIC QUERY PLAN for independent source discovery, '
    'identified by the SHA-256 of its canonical form. Re-registering the same '
    'plan inserts nothing. A changed plan is a new digest, never an edit. '
    'Append-only (trigger-enforced).';

COMMENT ON COLUMN source_discovery_briefs.geography_claim IS
    'The geography the BRIEF CLAIMS to be written for (ISO-3166-1 alpha-2). It '
    'is a property of the query plan only: it is never written onto a '
    'nomination as the organisation''s country, and nothing infers a country '
    'from it.';

-- ---------------------------------------------------------------------------
-- B. Runs.
-- ---------------------------------------------------------------------------

CREATE TABLE source_discovery_runs (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    run_kind         text        NOT NULL,
    provider_key     text        NOT NULL,
    brief_id         uuid        REFERENCES source_discovery_briefs (id),
    geography        text,
    research_run_id  uuid        REFERENCES orgunit_research_runs (id),
    actor_key        text        NOT NULL,
    started_at       timestamptz NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT source_discovery_runs_kind_chk
        CHECK (run_kind IN ('SEARCH_PROVIDER', 'PAGE_LINK_OUT', 'SEED')),
    CONSTRAINT source_discovery_runs_provider_chk
        CHECK (provider_key IN
            ('scripted-search', 'claude-max-web-search', 'page-link-out', 'operator-seed')),
    CONSTRAINT source_discovery_runs_shape_chk
        CHECK (
            (run_kind = 'SEARCH_PROVIDER'
                AND brief_id IS NOT NULL AND geography IS NOT NULL AND research_run_id IS NULL
                AND provider_key IN ('scripted-search', 'claude-max-web-search'))
         OR (run_kind = 'PAGE_LINK_OUT'
                AND brief_id IS NULL AND geography IS NULL AND research_run_id IS NOT NULL
                AND provider_key = 'page-link-out')
         OR (run_kind = 'SEED'
                AND brief_id IS NULL AND geography IS NULL AND research_run_id IS NULL
                AND provider_key = 'operator-seed')),
    CONSTRAINT source_discovery_runs_geography_chk
        CHECK (geography IS NULL OR geography ~ '^[A-Z]{2}$'),
    CONSTRAINT source_discovery_runs_actor_key_chk
        CHECK (actor_key ~ '^[a-z0-9][a-z0-9_-]{2,63}$')
);

-- The composite target that pins a nomination's method AND provider to its run's.
CREATE UNIQUE INDEX source_discovery_runs_kind_provider_uidx
    ON source_discovery_runs (id, run_kind, provider_key);

-- One link-out capture per research run, so re-running roots of the same
-- research run deduplicates into the same nomination set.
CREATE UNIQUE INDEX source_discovery_runs_link_out_uidx
    ON source_discovery_runs (research_run_id) WHERE run_kind = 'PAGE_LINK_OUT';

COMMENT ON TABLE source_discovery_runs IS
    'ONE SOURCE-DISCOVERY EXECUTION IDENTITY, recorded at its start. A '
    'SEARCH_PROVIDER run covers ONE geography of ONE brief; a PAGE_LINK_OUT run '
    'is the capture of off-domain anchors from ONE research run; a SEED run is '
    'an operator-supplied list. A run grants no research authority. '
    'Append-only (trigger-enforced).';

COMMENT ON COLUMN source_discovery_runs.actor_key IS
    'AN OPAQUE KEY NAMING THE TRUSTED PATH that started the run, with exactly '
    'the semantics and prohibitions of orgunit_root_promotions.actor_key: never '
    'a person''s name, handle or mailbox.';

-- ---------------------------------------------------------------------------
-- C. Nominations.
-- ---------------------------------------------------------------------------

CREATE TABLE source_discovery_nominations (
    id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    discovery_run_id        uuid        NOT NULL,
    discovery_method        text        NOT NULL,
    provider_key            text        NOT NULL,
    query_id                text,
    source_page_evidence_id uuid        REFERENCES orgunit_page_evidence (id),
    url                     text        NOT NULL,
    hostname                text        NOT NULL,
    registrable_domain      text        NOT NULL,
    title                   text,
    snippet                 text,
    retrieved_at            timestamptz NOT NULL,
    eche_overlap            boolean     NOT NULL,
    hei_signal              boolean     NOT NULL,
    hei_signal_rule_version text        NOT NULL,
    dedupe_key              text        GENERATED ALWAYS AS
                                (discovery_run_id::text || '|' || registrable_domain) STORED,
    created_at              timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT source_discovery_nominations_run_fk
        FOREIGN KEY (discovery_run_id, discovery_method, provider_key)
        REFERENCES source_discovery_runs (id, run_kind, provider_key),
    CONSTRAINT source_discovery_nominations_method_chk
        CHECK (discovery_method IN ('SEARCH_PROVIDER', 'PAGE_LINK_OUT', 'SEED')),
    CONSTRAINT source_discovery_nominations_method_shape_chk
        CHECK (
            (discovery_method = 'SEARCH_PROVIDER'
                AND query_id IS NOT NULL AND source_page_evidence_id IS NULL)
         OR (discovery_method = 'PAGE_LINK_OUT'
                AND query_id IS NULL AND source_page_evidence_id IS NOT NULL)
         OR (discovery_method = 'SEED'
                AND query_id IS NULL AND source_page_evidence_id IS NULL)),
    CONSTRAINT source_discovery_nominations_query_id_chk
        CHECK (query_id IS NULL OR query_id ~ '^[a-z]{2}\.[a-z]{2,3}\.[a-z0-9-]{2,48}\.[0-9]{2}$'),
    -- The SAME admissibility as a discovery-subject PUBLIC_URL (migration
    -- 0013): http(s) only, a lower-case DNS host with a real-looking suffix,
    -- no port, no userinfo, no IP literal, no query, no fragment, no
    -- encoded at-sign, and NO social-platform or messaging host.
    CONSTRAINT source_discovery_nominations_url_chk
        CHECK (discovery_identity_url_admissible(url)),
    CONSTRAINT source_discovery_nominations_host_chk
        CHECK (substring(url from '^https?://([^/]+)') = hostname
               AND (hostname = registrable_domain
                    OR right(hostname, length(registrable_domain) + 1) = '.' || registrable_domain)),
    CONSTRAINT source_discovery_nominations_domain_chk
        CHECK (registrable_domain ~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+([a-z]{2,63}|xn--[a-z0-9-]{1,59})$'),
    -- Title and snippet are REDACTED before they arrive (redactContactData);
    -- these CHECKs are the backstop: bounded, no control character, no at-sign.
    CONSTRAINT source_discovery_nominations_title_chk
        CHECK (title IS NULL
               OR (length(title) BETWEEN 1 AND 300
                   AND title !~ '[[:cntrl:]]' AND position('@' in title) = 0)),
    CONSTRAINT source_discovery_nominations_snippet_chk
        CHECK (snippet IS NULL
               OR (length(snippet) BETWEEN 1 AND 1000
                   AND snippet !~ '[[:cntrl:]]' AND position('@' in snippet) = 0)),
    CONSTRAINT source_discovery_nominations_hei_rule_chk
        CHECK (hei_signal_rule_version ~ '^[a-z0-9][a-z0-9-]{2,62}-v[0-9]{1,4}$')
);

-- THE DEDUPE KEY: the same registrable domain within one run is ONE nomination.
CREATE UNIQUE INDEX source_discovery_nominations_dedupe_uidx
    ON source_discovery_nominations (dedupe_key);

CREATE INDEX source_discovery_nominations_run_idx
    ON source_discovery_nominations (discovery_run_id, id);

COMMENT ON TABLE source_discovery_nominations IS
    'ONE NOMINATED PUBLIC URL: a provider returned it for a query, or an '
    'already-read page linked out to it, or an operator seeded it. NOT an '
    'organisation, NOT a discovery subject, NOT a research root and NOT a '
    'verdict. Nothing fetches it. It becomes a discovery subject only through '
    'the B2.2 writer, as an explicit operator act. Append-only (trigger-enforced).';

COMMENT ON COLUMN source_discovery_nominations.eche_overlap IS
    'A MEASUREMENT recomputed by the database on INSERT: true when any '
    'website_claims row publishes this registrable_domain. Never a join key, '
    'never a merge, never identity.';

COMMENT ON COLUMN source_discovery_nominations.hei_signal IS
    'A FLAG from the deterministic rule named in hei_signal_rule_version '
    '(academic-suffix host or a higher-education term in the title). Not a '
    'classification and not a verdict that the organisation is an institution.';

COMMENT ON COLUMN source_discovery_nominations.retrieved_at IS
    'When the nominating source was observed: the provider''s retrieval time, or '
    'for PAGE_LINK_OUT exactly the observed_at of the source page evidence '
    '(enforced on INSERT).';

-- ---------------------------------------------------------------------------
-- D. The measurement is the database's, not the caller's.
-- ---------------------------------------------------------------------------
--
-- Runs with the INSERTING role's rights (no SECURITY DEFINER), which is why
-- the role is granted exactly the two columns it reads below. Raised as
-- check_violation (SQLSTATE 23514).

CREATE FUNCTION source_discovery_verify_nomination()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    measured boolean;
    page_observed timestamptz;
BEGIN
    SELECT EXISTS (SELECT 1 FROM website_claims
                    WHERE registrable_domain = NEW.registrable_domain)
      INTO measured;
    IF NEW.eche_overlap IS DISTINCT FROM measured THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_nominations: eche_overlap must equal the measured registrable-domain match';
    END IF;
    IF NEW.discovery_method = 'PAGE_LINK_OUT' THEN
        SELECT observed_at INTO page_observed
          FROM orgunit_page_evidence WHERE id = NEW.source_page_evidence_id;
        IF NEW.retrieved_at IS DISTINCT FROM page_observed THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'source_discovery_nominations: a link-out retrieved_at must equal its source page observed_at';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER source_discovery_nominations_verify
    BEFORE INSERT ON source_discovery_nominations
    FOR EACH ROW EXECUTE FUNCTION source_discovery_verify_nomination();

-- ---------------------------------------------------------------------------
-- E. Append-only, for every role including the owner (0013's function).
-- ---------------------------------------------------------------------------

CREATE TRIGGER source_discovery_briefs_append_only
    BEFORE UPDATE OR DELETE ON source_discovery_briefs
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation();
CREATE TRIGGER source_discovery_runs_append_only
    BEFORE UPDATE OR DELETE ON source_discovery_runs
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation();
CREATE TRIGGER source_discovery_nominations_append_only
    BEFORE UPDATE OR DELETE ON source_discovery_nominations
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation();

-- ---------------------------------------------------------------------------
-- F. Grants. SELECT + INSERT for the capability; SELECT for audit; nothing else.
-- ---------------------------------------------------------------------------

REVOKE ALL ON source_discovery_briefs, source_discovery_runs, source_discovery_nominations
    FROM PUBLIC, nwf_ingest, nwf_research, nwf_classifier, nwf_readonly,
         nwf_discovery_subject_writer;

DO $$
DECLARE
    db text := current_database();
BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO nwf_source_discovery', db);
END
$$;

GRANT USAGE ON SCHEMA public TO nwf_source_discovery;

GRANT SELECT, INSERT ON source_discovery_briefs, source_discovery_runs,
                        source_discovery_nominations
    TO nwf_source_discovery;

GRANT SELECT (registrable_domain) ON website_claims TO nwf_source_discovery;

GRANT SELECT (id, observed_at) ON orgunit_page_evidence TO nwf_source_discovery;

GRANT SELECT ON source_discovery_briefs, source_discovery_runs, source_discovery_nominations
    TO nwf_readonly;
