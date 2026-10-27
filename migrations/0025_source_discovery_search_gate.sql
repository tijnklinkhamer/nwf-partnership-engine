-- Migration 0025 - WW E-SDFX: THE DATABASE GATES EVERY LIVE SEARCH.
-- Reasoned about in docs/adr/0028-campaign-bounded-live-source-discovery.md
-- s9 (the security-review repair of the WW E-SD implementation, Proposed).
-- Migration 0022 is committed and is NOT edited: every change below is a new
-- table, a widened CHECK on a 0022 table, or a CREATE OR REPLACE of a 0022
-- trigger function.
--
-- WHY THIS EXISTS (an independent security review of migration 0022):
--
--   P2-4. A grant's validity window was re-checked mid-run only against the
--     PROCESS clock: a query-call row was written AFTER its provider call, so
--     a search could run after the grant expired and the database learned
--     of it only afterwards. Now every provider call is preceded by its own
--     committed `source_discovery_query_call_starts` row - the DATABASE's
--     permission for exactly that one search - whose trigger refuses it
--     unless `issued_at <= clock_timestamp() < expires_at` for the run's
--     grant. The existing `source_discovery_query_calls` row becomes the
--     call's TERMINAL row and must match its start. Append-only: one start
--     row plus one terminal row, never an UPDATE.
--
--   P2-5. ADR 0027 D8's smoke did not gate anything: the first run of a
--     grant carried on past its smoke call. Now a call that is NOT a smoke
--     call may start only if an OWNER-path `source_discovery_smoke_
--     verifications` row exists for the same SDK version and model; until
--     the OWNER records one, every grant's first run stops after its smoke
--     call (ABORTED, SMOKE_UNVERIFIED). INSERT: the migration owner only.
--
--   P1-3. The provider's WebSearch was bound to the planned query by the
--     prompt alone. The binding is now enforced in the adapter (ADR 0028
--     s9); a violation is its own closed per-call outcome,
--     SEARCH_BINDING_REFUSED, and its own run failure reason.
--
--   P2-2. No 0022 trigger function pinned its search_path. Every 0022
--     function is replaced below, unchanged in meaning except where stated,
--     with `SET search_path = public, pg_catalog, pg_temp` (pg_temp LAST) and
--     every relation schema-qualified. Every new function here does the same.
--
-- WHAT IT DOES NOT DO. No LOGIN, no new role, no UPDATE/DELETE/TRUNCATE grant
-- to anyone, no SECURITY DEFINER function, no INSERT on the verification
-- table for any runtime role, no prompt, response or transcript column, no
-- contact, country, score or rank column. No existing row is rewritten: the
-- widened CHECKs accept every value the old ones did.

-- ---------------------------------------------------------------------------
-- A. The widened closed sets (P1-3, P2-5). Supersets of migration 0022's.
-- ---------------------------------------------------------------------------

ALTER TABLE source_discovery_query_calls
    DROP CONSTRAINT source_discovery_query_calls_outcome_chk;
ALTER TABLE source_discovery_query_calls
    ADD CONSTRAINT source_discovery_query_calls_outcome_chk
        CHECK (outcome IN ('RESULTS', 'PROVIDER_RESULT_ERROR', 'PROVIDER_OUTPUT_INVALID',
                           'PROVIDER_RESULT_MISSING', 'USAGE_LIMIT_EXHAUSTED', 'AUTH_FAILURE',
                           'TOOL_REFUSED', 'SEARCH_BINDING_REFUSED'));

ALTER TABLE source_discovery_run_completions
    DROP CONSTRAINT source_discovery_run_completions_reason_chk;
ALTER TABLE source_discovery_run_completions
    ADD CONSTRAINT source_discovery_run_completions_reason_chk
        CHECK ((outcome = 'COMPLETED' AND reason IS NULL)
            OR (outcome = 'FAILED' AND reason IN
                   ('PROVIDER_RESULT_ERROR', 'PROVIDER_OUTPUT_INVALID', 'PROVIDER_RESULT_MISSING',
                    'AUTH_FAILURE', 'TOOL_REFUSED', 'SEARCH_BINDING_REFUSED', 'INTERNAL_ERROR'))
            OR (outcome = 'ABORTED' AND reason IN
                   ('USAGE_LIMIT_EXHAUSTED', 'GRANT_EXPIRED', 'SMOKE_UNVERIFIED')));

COMMENT ON TABLE source_discovery_query_calls IS
    'THE TERMINAL ROW of ONE PROVIDER CALL of a GRANTED run: the query id, '
    'a closed outcome, the result count, the model and pinned SDK version, '
    'its start and end, and whether it was the ADR 0027 D8 smoke. Since '
    'migration 0025 it must match a source_discovery_query_call_starts row '
    'the database accepted BEFORE the call (enforced on INSERT). No prompt, '
    'response text or search transcript is stored. Append-only '
    '(trigger-enforced).';

-- ---------------------------------------------------------------------------
-- B. Query-call starts (P2-4). The database's permission for ONE search.
-- ---------------------------------------------------------------------------

CREATE TABLE source_discovery_query_call_starts (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id       uuid        NOT NULL REFERENCES source_discovery_runs (id),
    call_seq     integer     NOT NULL,
    query_id     text        NOT NULL,
    model_id     text        NOT NULL,
    sdk_version  text        NOT NULL,
    smoke        boolean     NOT NULL,
    started_at   timestamptz NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT source_discovery_query_call_starts_seq_chk
        CHECK (call_seq BETWEEN 1 AND 100),
    CONSTRAINT source_discovery_query_call_starts_query_id_chk
        CHECK (query_id ~ '^[a-z]{2}\.[a-z]{2,3}\.[a-z0-9-]{2,48}\.[0-9]{2}$'),
    CONSTRAINT source_discovery_query_call_starts_sdk_version_chk
        CHECK (sdk_version ~ '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,6}$')
);

CREATE UNIQUE INDEX source_discovery_query_call_starts_run_seq_uidx
    ON source_discovery_query_call_starts (run_id, call_seq);
CREATE UNIQUE INDEX source_discovery_query_call_starts_run_query_uidx
    ON source_discovery_query_call_starts (run_id, query_id);

COMMENT ON TABLE source_discovery_query_call_starts IS
    'THE DATABASE''S PERMISSION FOR ONE PROVIDER CALL, committed BEFORE the '
    'call is made (migration 0025, ADR 0028 s9). Accepted only for a granted, '
    'not-yet-completed run whose previous call has its terminal row, for the '
    'next call_seq within max_queries, with the grant''s model, smoke exactly '
    'on the first call of the grant''s first run, while the database clock is '
    'inside the grant''s validity window, and - for any call that is not the '
    'smoke - only once an OWNER-path smoke verification exists for the same '
    'SDK version and model. started_at is the database''s own clock. '
    'Append-only (trigger-enforced).';

-- ---------------------------------------------------------------------------
-- C. Smoke verifications (P2-5). OWNER path only.
-- ---------------------------------------------------------------------------

CREATE TABLE source_discovery_smoke_verifications (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id       uuid        NOT NULL,
    call_seq     integer     NOT NULL,
    sdk_version  text        NOT NULL,
    model_id     text        NOT NULL,
    actor_key    text        NOT NULL,
    verified_at  timestamptz NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT source_discovery_smoke_verifications_call_fk
        FOREIGN KEY (run_id, call_seq)
        REFERENCES source_discovery_query_calls (run_id, call_seq),
    CONSTRAINT source_discovery_smoke_verifications_seq_chk
        CHECK (call_seq = 1),
    CONSTRAINT source_discovery_smoke_verifications_sdk_version_chk
        CHECK (sdk_version ~ '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,6}$'),
    CONSTRAINT source_discovery_smoke_verifications_actor_key_chk
        CHECK (actor_key ~ '^[a-z0-9][a-z0-9_-]{2,63}$')
);

CREATE UNIQUE INDEX source_discovery_smoke_verifications_call_uidx
    ON source_discovery_smoke_verifications (run_id, call_seq);
CREATE INDEX source_discovery_smoke_verifications_runtime_idx
    ON source_discovery_smoke_verifications (sdk_version, model_id);

COMMENT ON TABLE source_discovery_smoke_verifications IS
    'ONE OWNER-PATH ATTESTATION that a recorded ADR 0027 D8 smoke call '
    'behaved as designed under the WebSearch gate (ADR 0028 s9): its terminal '
    'outcome was RESULTS (schema-valid structured output, enforced on INSERT) '
    'AND the OWNER read, from that run''s own output, that the PreToolUse '
    'hook was invoked for its one WebSearch (searchGate.hookInvoked). It '
    'covers every later call with the SAME SDK version and model; a new SDK '
    'version or model needs its own smoke and its own verification. INSERT '
    'by the migration owner only; nwf_source_discovery can read it and never '
    'write it. Append-only (trigger-enforced).';

COMMENT ON COLUMN source_discovery_smoke_verifications.actor_key IS
    'AN OPAQUE KEY NAMING THE OWNER PATH that recorded the verification, with '
    'exactly the semantics and prohibitions of source_discovery_grants.actor_key: '
    'never a person''s name, handle or mailbox.';

-- ---------------------------------------------------------------------------
-- D. The new triggers. Inserting role's rights; search_path pinned.
-- ---------------------------------------------------------------------------

CREATE FUNCTION source_discovery_verify_query_call_start()
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

CREATE TRIGGER source_discovery_query_call_starts_verify
    BEFORE INSERT ON source_discovery_query_call_starts
    FOR EACH ROW EXECUTE FUNCTION source_discovery_verify_query_call_start();

CREATE FUNCTION source_discovery_verify_smoke_verification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    c public.source_discovery_query_calls%ROWTYPE;
BEGIN
    SELECT * INTO c FROM public.source_discovery_query_calls
     WHERE run_id = NEW.run_id AND call_seq = NEW.call_seq;
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
    RETURN NEW;
END;
$$;

CREATE TRIGGER source_discovery_smoke_verifications_verify
    BEFORE INSERT ON source_discovery_smoke_verifications
    FOR EACH ROW EXECUTE FUNCTION source_discovery_verify_smoke_verification();

-- ---------------------------------------------------------------------------
-- E. Migration 0022's functions, replaced with a pinned search_path (P2-2).
--    verify_grant, verify_grant_use, verify_known_mark and
--    require_grant_use are unchanged in meaning. verify_query_call now
--    requires the matching start (P2-4); verify_run_completion counts starts.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION source_discovery_verify_grant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    claim text[];
    plan jsonb;
    available integer;
BEGIN
    SELECT geography_claim, query_plan INTO claim, plan
      FROM public.source_discovery_briefs WHERE id = NEW.brief_id;
    IF claim IS NULL OR NOT (NEW.geography = ANY (claim)) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_grants: the geography must be one the plan claims';
    END IF;
    IF plan ? 'sections' THEN
        SELECT jsonb_array_length(s -> 'queries') INTO available
          FROM jsonb_array_elements(plan -> 'sections') s
         WHERE s ->> 'geography' = NEW.geography;
    ELSE
        available := jsonb_array_length(plan -> 'queries');
    END IF;
    IF available IS NULL OR NEW.max_queries > available THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_grants: max_queries exceeds the plan''s queries for that geography';
    END IF;
    RETURN NEW;
END;
$$;

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
    SELECT * INTO r FROM public.source_discovery_runs WHERE id = NEW.run_id;
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
    -- 0025 (P2-4): the terminal row of a call the database permitted first.
    SELECT * INTO s FROM public.source_discovery_query_call_starts
     WHERE run_id = NEW.run_id AND call_seq = NEW.call_seq;
    IF s.id IS NULL
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

CREATE OR REPLACE FUNCTION source_discovery_verify_run_completion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    kind text;
    starts integer;
    calls integer;
BEGIN
    SELECT run_kind INTO kind FROM public.source_discovery_runs WHERE id = NEW.run_id;
    IF kind IS DISTINCT FROM 'SEARCH_PROVIDER' THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_run_completions: only a SEARCH_PROVIDER run completes';
    END IF;
    IF EXISTS (SELECT 1 FROM public.source_discovery_grant_uses WHERE run_id = NEW.run_id) THEN
        SELECT count(*) INTO starts
          FROM public.source_discovery_query_call_starts WHERE run_id = NEW.run_id;
        SELECT count(*) INTO calls
          FROM public.source_discovery_query_calls WHERE run_id = NEW.run_id;
        -- 0025 (P2-4): a query was attempted when the database permitted it.
        -- A run with no start row (none since 0025 can have a call without
        -- one) keeps 0022's rule.
        IF NEW.queries_attempted <> (CASE WHEN starts > 0 THEN starts ELSE calls END) THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'source_discovery_run_completions: queries_attempted must equal the run''s query calls';
        END IF;
        -- A permitted call without its terminal row ends the run only as an
        -- internal failure (the store failed after the provider call).
        IF calls < starts AND NOT (NEW.outcome = 'FAILED' AND NEW.reason = 'INTERNAL_ERROR') THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'source_discovery_run_completions: every started query call must record its terminal row';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION source_discovery_verify_known_mark()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    key text;
    plan jsonb;
    domain text;
BEGIN
    SELECT b.brief_key, b.query_plan, n.registrable_domain INTO key, plan, domain
      FROM public.source_discovery_nominations n
      JOIN public.source_discovery_runs r ON r.id = n.discovery_run_id
      JOIN public.source_discovery_briefs b ON b.id = r.brief_id
     WHERE n.id = NEW.nomination_id;
    IF key IS DISTINCT FROM 'nwf-discovery-plan-v2' THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_nomination_known_marks: only a nwf-discovery-plan-v2 nomination is marked';
    END IF;
    IF NEW.already_known IS DISTINCT FROM
       COALESCE((plan -> 'request' -> 'excludedDomains') ? domain, false) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_nomination_known_marks: already_known must equal the plan''s own exclusion measurement';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION source_discovery_require_grant_use()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.source_discovery_grant_uses WHERE run_id = NEW.id) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_runs: a claude-max-web-search run requires a stored grant use';
    END IF;
    RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- F. Append-only, for every role including the owner (0013's function).
-- ---------------------------------------------------------------------------

CREATE TRIGGER source_discovery_query_call_starts_append_only
    BEFORE UPDATE OR DELETE ON source_discovery_query_call_starts
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation();
CREATE TRIGGER source_discovery_smoke_verifications_append_only
    BEFORE UPDATE OR DELETE ON source_discovery_smoke_verifications
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation();

-- ---------------------------------------------------------------------------
-- G. Grants. The capability appends its own call starts and READS
--    verifications; audit reads both; nothing else.
-- ---------------------------------------------------------------------------

REVOKE ALL ON source_discovery_query_call_starts, source_discovery_smoke_verifications
    FROM PUBLIC, nwf_ingest, nwf_research, nwf_classifier, nwf_readonly,
         nwf_discovery_subject_writer, nwf_discovery_subject_reviewer, nwf_source_discovery;

GRANT SELECT, INSERT ON source_discovery_query_call_starts TO nwf_source_discovery;

GRANT SELECT ON source_discovery_smoke_verifications TO nwf_source_discovery;

GRANT SELECT ON source_discovery_query_call_starts, source_discovery_smoke_verifications
    TO nwf_readonly;
