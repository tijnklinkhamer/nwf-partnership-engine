-- Migration 0027 - WW H-SD: WHAT A LIVE SEARCH OBSERVED, AND WHAT IT MAY KEEP.
-- Reasoned about in docs/adr/0028-campaign-bounded-live-source-discovery.md
-- s9 (the second independent security review of the WW E-SD / E-SDFX
-- implementation, Proposed). Migrations 0019, 0020, 0022 and 0025 are
-- committed and are NOT edited: every change below is a new table, a new
-- trigger, a CREATE OR REPLACE of an existing trigger function, or an ALTER
-- FUNCTION that pins a search_path.
--
-- NUMBERING. 0027 follows 0025 on this lane; 0026 is written in parallel by
-- another lane and is absent here. The runner applies migrations in sorted
-- order and does not require a dense sequence, so the gap is harmless to it;
-- `npm run migrations:check` reports the gap until 0026 is integrated.
--
-- WHY THIS EXISTS (an independent security review of migration 0025):
--
--   P1-3. The bundled executable's WebSearch tool runs a NESTED side query
--     that may make up to 8 server-side searches (`max_uses: 8`, hard-coded)
--     whose texts this build cannot inspect. The adapter now keeps a call's
--     results only when its one approved WebSearch REPORTED exactly one
--     search and every returned URL is one of that search's own hits. The
--     database records what each call observed - whether the PreToolUse hook
--     and canUseTool were consulted and how many searches the tool reported -
--     in `source_discovery_query_call_observations`, ONE row per terminal
--     query-call row, written in the same transaction (a deferred constraint
--     trigger refuses to COMMIT a terminal row without it), and refuses a
--     RESULTS call whose observation is not exactly one search through a
--     consulted gate surface.
--
--   P1-8. An OWNER smoke verification was bound to the smoke call's outcome
--     only, not to what the gate observed. The verification trigger is
--     replaced: a verification now requires the smoke's observation to show
--     hook_invoked AND search_count = 1, and the smoke's result_count > 0.
--
--   P2-1. Nothing in the database tied a live-search nomination to a call
--     that ended RESULTS. A new BEFORE INSERT trigger on
--     source_discovery_nominations (claude-max-web-search rows only;
--     scripted-search, link-out and seed nominations are unaffected) requires
--     the (run, query) terminal call to have ended RESULTS with an
--     observation of exactly one search, the run to have no completion row
--     yet, and fewer of the call's nominations than its result_count.
--
--   P2-15. (b) Three 0025 trigger functions read a grant row and carried on
--     when none was found (every comparison with a NULL row is NULL, so the
--     checks did not fire): replaced with an explicit IF NOT FOUND refusal.
--     (d) The 0019 nomination trigger function, and the two 0020 functions
--     beside it, did not pin their search_path: pinned here,
--     `public, pg_catalog, pg_temp` (pg_temp LAST).
--
-- WHAT IT DOES NOT DO. No LOGIN, no new role, no UPDATE/DELETE/TRUNCATE grant
-- to anyone, no SECURITY DEFINER function, no INSERT on an OWNER-path table
-- for any runtime role, no prompt, response, query-text or transcript column,
-- no contact, country, score or rank column. No existing row is rewritten and
-- no existing CHECK is dropped.

-- ---------------------------------------------------------------------------
-- A. Query-call observations (P1-3, P1-8). One per terminal query-call row.
-- ---------------------------------------------------------------------------

CREATE TABLE source_discovery_query_call_observations (
    run_id              uuid        NOT NULL,
    call_seq            integer     NOT NULL,
    hook_invoked        boolean     NOT NULL,
    permission_invoked  boolean     NOT NULL,
    search_count        integer,
    created_at          timestamptz NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT source_discovery_query_call_observations_pkey
        PRIMARY KEY (run_id, call_seq),
    CONSTRAINT source_discovery_query_call_observations_call_fk
        FOREIGN KEY (run_id, call_seq)
        REFERENCES source_discovery_query_calls (run_id, call_seq),
    CONSTRAINT source_discovery_query_call_observations_count_chk
        CHECK (search_count IS NULL OR search_count BETWEEN 0 AND 100)
);

COMMENT ON TABLE source_discovery_query_call_observations IS
    'WHAT ONE PROVIDER CALL OF A GRANTED RUN OBSERVED (migration 0027, ADR '
    '0028 s9): whether the PreToolUse hook and canUseTool were consulted for '
    'its one approved WebSearch, and how many searches that WebSearch '
    'REPORTED (tool_use_result.searchCount; NULL when no tool result was '
    'observed). Written in the same transaction as the call''s terminal '
    'query-call row, which cannot commit without it. A RESULTS call needs '
    'exactly one reported search through a consulted gate surface (enforced on '
    'INSERT). No query text, prompt, response or transcript is stored. '
    'Append-only (trigger-enforced).';

COMMENT ON COLUMN source_discovery_query_call_observations.search_count IS
    'The number of web searches the approved WebSearch tool use itself '
    'reported. The tool runs a NESTED side query that may search up to 8 '
    'times with texts this build cannot inspect; only a call reporting '
    'exactly 1 keeps results. A COUNT, never a query text.';

CREATE FUNCTION source_discovery_verify_query_call_observation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    c public.source_discovery_query_calls%ROWTYPE;
BEGIN
    SELECT * INTO c FROM public.source_discovery_query_calls
     WHERE run_id = NEW.run_id AND call_seq = NEW.call_seq;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_query_call_observations: an observation belongs to a recorded query call';
    END IF;
    IF EXISTS (SELECT 1 FROM public.source_discovery_run_completions WHERE run_id = NEW.run_id) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_query_call_observations: the run is already complete';
    END IF;
    IF c.outcome = 'RESULTS'
       AND (NEW.search_count IS DISTINCT FROM 1
            OR NOT (NEW.hook_invoked OR NEW.permission_invoked)) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_query_call_observations: a RESULTS call observed exactly one search through a consulted gate';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER source_discovery_query_call_observations_verify
    BEFORE INSERT ON source_discovery_query_call_observations
    FOR EACH ROW EXECUTE FUNCTION source_discovery_verify_query_call_observation();

-- A terminal query-call row inserted from now on cannot COMMIT without its
-- observation. Rows that already exist are untouched (an AFTER INSERT
-- trigger never revisits them).
CREATE FUNCTION source_discovery_require_query_call_observation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.source_discovery_query_call_observations
                    WHERE run_id = NEW.run_id AND call_seq = NEW.call_seq) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_query_calls: a terminal query-call row requires its observation';
    END IF;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER source_discovery_query_calls_require_observation
    AFTER INSERT ON source_discovery_query_calls
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION source_discovery_require_query_call_observation();

-- ---------------------------------------------------------------------------
-- B. The smoke verification is bound to what the smoke observed (P1-8).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION source_discovery_verify_smoke_verification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    c public.source_discovery_query_calls%ROWTYPE;
    o public.source_discovery_query_call_observations%ROWTYPE;
BEGIN
    SELECT * INTO c FROM public.source_discovery_query_calls
     WHERE run_id = NEW.run_id AND call_seq = NEW.call_seq;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_smoke_verifications: no such recorded smoke call';
    END IF;
    IF c.smoke IS DISTINCT FROM true OR c.outcome IS DISTINCT FROM 'RESULTS' THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_smoke_verifications: only a smoke call that ended RESULTS is verified';
    END IF;
    IF NEW.sdk_version IS DISTINCT FROM c.sdk_version OR NEW.model_id IS DISTINCT FROM c.model_id THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_smoke_verifications: the SDK version and model must be the smoke call''s own';
    END IF;
    -- 0027 (P1-8): the verification is bound to what the smoke OBSERVED.
    SELECT * INTO o FROM public.source_discovery_query_call_observations
     WHERE run_id = NEW.run_id AND call_seq = NEW.call_seq;
    IF NOT FOUND
       OR o.hook_invoked IS DISTINCT FROM true
       OR o.search_count IS DISTINCT FROM 1
       OR c.result_count IS NULL OR c.result_count <= 0 THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_smoke_verifications: the smoke must show hook_invoked, exactly one search and at least one result';
    END IF;
    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- C. A live-search nomination needs a call that ended RESULTS (P2-1).
-- ---------------------------------------------------------------------------

CREATE FUNCTION source_discovery_verify_live_search_nomination()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    c public.source_discovery_query_calls%ROWTYPE;
    searches integer;
    kept integer;
BEGIN
    -- Serialises nominations of one (run, query): the count below is exact.
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtext('source_discovery_nominations|' || NEW.discovery_run_id::text
                            || '|' || COALESCE(NEW.query_id, '')));
    SELECT * INTO c FROM public.source_discovery_query_calls
     WHERE run_id = NEW.discovery_run_id AND query_id = NEW.query_id;
    IF NOT FOUND OR c.outcome IS DISTINCT FROM 'RESULTS' THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_nominations: a live-search nomination belongs to a query call that ended RESULTS';
    END IF;
    IF EXISTS (SELECT 1 FROM public.source_discovery_run_completions
                WHERE run_id = NEW.discovery_run_id) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_nominations: the live-search run is already complete';
    END IF;
    SELECT o.search_count INTO searches
      FROM public.source_discovery_query_call_observations o
     WHERE o.run_id = c.run_id AND o.call_seq = c.call_seq;
    IF searches IS DISTINCT FROM 1 THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_nominations: its query call must have observed exactly one search';
    END IF;
    SELECT count(*) INTO kept FROM public.source_discovery_nominations n
     WHERE n.discovery_run_id = NEW.discovery_run_id AND n.query_id = NEW.query_id;
    IF kept >= c.result_count THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_nominations: more nominations than its query call returned results';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER source_discovery_nominations_live_search_verify
    BEFORE INSERT ON source_discovery_nominations
    FOR EACH ROW
    WHEN (NEW.provider_key = 'claude-max-web-search')
    EXECUTE FUNCTION source_discovery_verify_live_search_nomination();

-- ---------------------------------------------------------------------------
-- D. 0025's grant-reading functions refuse a missing row (P2-15b).
--    Otherwise unchanged in meaning from migration 0025.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION source_discovery_verify_grant_use()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    g public.source_discovery_grants%ROWTYPE;
    r public.source_discovery_runs%ROWTYPE;
    used integer;
BEGIN
    SELECT * INTO g FROM public.source_discovery_grants WHERE id = NEW.grant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_grant_uses: no such grant';
    END IF;
    SELECT * INTO r FROM public.source_discovery_runs WHERE id = NEW.run_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_grant_uses: no such run';
    END IF;
    IF NEW.run_seq > g.max_runs THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_grant_uses: the grant is exhausted (run_seq exceeds max_runs)';
    END IF;
    IF clock_timestamp() < g.issued_at OR clock_timestamp() >= g.expires_at THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_grant_uses: the grant is outside its validity window';
    END IF;
    SELECT count(*) INTO used FROM public.source_discovery_grant_uses WHERE grant_id = NEW.grant_id;
    IF NEW.run_seq <> used + 1 THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_grant_uses: run_seq must be the grant''s next slot';
    END IF;
    IF r.run_kind IS DISTINCT FROM 'SEARCH_PROVIDER'
       OR r.provider_key IS DISTINCT FROM g.provider_key
       OR r.brief_id IS DISTINCT FROM g.brief_id
       OR r.geography IS DISTINCT FROM g.geography THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_grant_uses: the run must carry the grant''s plan, geography and provider';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION source_discovery_verify_query_call_start()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    g public.source_discovery_grants%ROWTYPE;
    seq integer;
    starts integer;
    calls integer;
BEGIN
    SELECT u.run_seq INTO seq
      FROM public.source_discovery_grant_uses u WHERE u.run_id = NEW.run_id;
    IF seq IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_query_call_starts: a query call belongs to a granted run';
    END IF;
    SELECT gr.* INTO g
      FROM public.source_discovery_grant_uses u
      JOIN public.source_discovery_grants gr ON gr.id = u.grant_id
     WHERE u.run_id = NEW.run_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_query_call_starts: no such grant for the run';
    END IF;
    IF EXISTS (SELECT 1 FROM public.source_discovery_run_completions WHERE run_id = NEW.run_id) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_query_call_starts: the run is already complete';
    END IF;
    SELECT count(*) INTO starts
      FROM public.source_discovery_query_call_starts WHERE run_id = NEW.run_id;
    SELECT count(*) INTO calls
      FROM public.source_discovery_query_calls WHERE run_id = NEW.run_id;
    IF NEW.call_seq <> starts + 1 OR NEW.call_seq > g.max_queries THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_query_call_starts: call_seq must be the next call within the grant''s max_queries';
    END IF;
    IF calls <> starts THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_query_call_starts: the previous call has no terminal row';
    END IF;
    IF NEW.model_id <> g.model_id THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_query_call_starts: the call must use the grant''s model';
    END IF;
    IF NEW.smoke IS DISTINCT FROM (seq = 1 AND NEW.call_seq = 1) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_query_call_starts: smoke is exactly the first call of the grant''s first run';
    END IF;
    IF clock_timestamp() < g.issued_at OR clock_timestamp() >= g.expires_at THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_query_call_starts: the grant is outside its validity window';
    END IF;
    IF NOT NEW.smoke AND NOT EXISTS (
        SELECT 1 FROM public.source_discovery_smoke_verifications v
         WHERE v.sdk_version = NEW.sdk_version AND v.model_id = NEW.model_id) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_query_call_starts: no smoke verification for this SDK version and model';
    END IF;
    NEW.started_at := clock_timestamp();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION source_discovery_verify_query_call()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    g public.source_discovery_grants%ROWTYPE;
    s public.source_discovery_query_call_starts%ROWTYPE;
    seq integer;
    calls integer;
BEGIN
    SELECT u.run_seq INTO seq
      FROM public.source_discovery_grant_uses u WHERE u.run_id = NEW.run_id;
    IF seq IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_query_calls: a query call belongs to a granted run';
    END IF;
    SELECT gr.* INTO g
      FROM public.source_discovery_grant_uses u
      JOIN public.source_discovery_grants gr ON gr.id = u.grant_id
     WHERE u.run_id = NEW.run_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_query_calls: no such grant for the run';
    END IF;
    IF EXISTS (SELECT 1 FROM public.source_discovery_run_completions WHERE run_id = NEW.run_id) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_query_calls: the run is already complete';
    END IF;
    SELECT count(*) INTO calls FROM public.source_discovery_query_calls WHERE run_id = NEW.run_id;
    IF NEW.call_seq <> calls + 1 OR NEW.call_seq > g.max_queries THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_query_calls: call_seq must be the next call within the grant''s max_queries';
    END IF;
    IF NEW.model_id <> g.model_id
       OR (NEW.result_count IS NOT NULL AND NEW.result_count > g.max_results_per_query) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_query_calls: the call must use the grant''s model and result budget';
    END IF;
    IF NEW.smoke IS DISTINCT FROM (seq = 1 AND NEW.call_seq = 1) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_query_calls: smoke is exactly the first call of the grant''s first run';
    END IF;
    SELECT * INTO s FROM public.source_discovery_query_call_starts
     WHERE run_id = NEW.run_id AND call_seq = NEW.call_seq;
    IF NOT FOUND
       OR s.query_id IS DISTINCT FROM NEW.query_id
       OR s.model_id IS DISTINCT FROM NEW.model_id
       OR s.sdk_version IS DISTINCT FROM NEW.sdk_version
       OR s.smoke IS DISTINCT FROM NEW.smoke THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_query_calls: a terminal row must match its query-call start';
    END IF;
    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- E. The 0019 and 0020 nomination functions get a pinned search_path
--    (P2-15d). 0019's is replaced with every relation schema-qualified and
--    is otherwise unchanged; 0020's two only gain the setting (their
--    unqualified names now resolve in `public` first, then pg_catalog).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION source_discovery_verify_nomination()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    measured boolean;
    page_observed timestamptz;
BEGIN
    SELECT EXISTS (SELECT 1 FROM public.website_claims
                    WHERE registrable_domain = NEW.registrable_domain)
      INTO measured;
    IF NEW.eche_overlap IS DISTINCT FROM measured THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_nominations: eche_overlap must equal the measured registrable-domain match';
    END IF;
    IF NEW.discovery_method = 'PAGE_LINK_OUT' THEN
        SELECT observed_at INTO page_observed
          FROM public.orgunit_page_evidence WHERE id = NEW.source_page_evidence_id;
        IF NEW.retrieved_at IS DISTINCT FROM page_observed THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'source_discovery_nominations: a link-out retrieved_at must equal its source page observed_at';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

ALTER FUNCTION source_discovery_verify_nomination_identity()
    SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION source_discovery_verify_nomination_sighting()
    SET search_path = public, pg_catalog, pg_temp;

-- ---------------------------------------------------------------------------
-- F. Append-only, for every role including the owner (0013's function).
-- ---------------------------------------------------------------------------

CREATE TRIGGER source_discovery_query_call_observations_append_only
    BEFORE UPDATE OR DELETE ON source_discovery_query_call_observations
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation();

-- ---------------------------------------------------------------------------
-- G. Grants. The capability appends its own observations; audit reads them.
-- ---------------------------------------------------------------------------

REVOKE ALL ON source_discovery_query_call_observations
    FROM PUBLIC, nwf_ingest, nwf_research, nwf_classifier, nwf_readonly,
         nwf_discovery_subject_writer, nwf_discovery_subject_reviewer, nwf_source_discovery;

GRANT SELECT, INSERT ON source_discovery_query_call_observations TO nwf_source_discovery;

GRANT SELECT ON source_discovery_query_call_observations TO nwf_readonly;
