-- Migration 0022 - WW E-SD: OWNER-PATH GRANTS FOR BOUNDED LIVE SOURCE DISCOVERY.
-- Reasoned about in docs/adr/0027-owner-granted-live-source-discovery-pilot.md
-- (D1-D8, Proposed) and docs/adr/0028-campaign-bounded-live-source-discovery.md
-- (the implementation and its one generalisation, Proposed).
--
-- WHY THIS EXISTS
--
--   Migration 0019 lets the NOLOGIN capability nwf_source_discovery record a
--   SEARCH_PROVIDER run for the provider key 'claude-max-web-search', and
--   nothing recorded WHO allowed such a run, for which plan, geography, model
--   or budget. ADR 0027 D4 makes that authority a STORED OWNER-PATH ROW, on the
--   root-promotion pattern (CLAUDE.md rule 16): the role that runs the search
--   reads the grant and can never write one.
--
--   A. `source_discovery_grants` - ONE OWNER-path authority: one registered
--      brief or plan (by id AND digest), one geography it claims, the provider
--      key, one model from a closed allowlist, a query and result budget, a
--      validity window of at most 14 days, and how many runs it covers
--      (max_runs, 1..200, default 1 - ADR 0028; max_runs = 1 is ADR 0027 D4's
--      single use exactly). INSERT: the migration owner only.
--   B. `source_discovery_grant_uses` - ONE row per run that spends a grant,
--      written in the run-start transaction BEFORE the first query. run_seq is
--      dense (1, 2, ...) and at most max_runs; UNIQUE (grant_id, run_seq) is
--      what refuses two concurrent runs racing for the same slot.
--   C. `source_discovery_query_calls` - ONE row per provider call: the query
--      id, a closed outcome (ADR 0027 D5), the result count, the model and the
--      pinned SDK version, start and end, and whether it was the D8 smoke.
--      No prompt, response or search transcript is stored.
--   D. `source_discovery_run_completions` - ONE terminal event per run:
--      COMPLETED, FAILED or ABORTED, with counts.
--   E. `source_discovery_nomination_known_marks` - for a run over a
--      `nwf-discovery-plan-v2` plan, whether a nominated registrable domain was
--      in that plan's own exclusion set ("already known"). A MEASUREMENT the
--      database re-derives from the stored plan, never caller data, never a
--      score and never a reason to drop the nomination.
--
--   F. A deferred constraint trigger on the EXISTING source_discovery_runs: a
--      run carrying the live provider key 'claude-max-web-search' cannot
--      commit without a grant-use row. A live run without a stored grant is
--      therefore not merely unimplemented - the database refuses it.
--
-- WHAT IT DOES NOT DO. No LOGIN, no new role, no UPDATE/DELETE/TRUNCATE grant
-- to anyone, no SECURITY DEFINER function, no contact column, no country /
-- locale / market column on a nomination, no score, no rank, no status
-- column, and no edit of an existing table's columns, constraints or grants.
-- Every new table is append-only for every role (0013's trigger function).

-- ---------------------------------------------------------------------------
-- 0. The composite target a grant binds: a registered plan BY ID AND DIGEST.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX source_discovery_briefs_id_digest_uidx
    ON source_discovery_briefs (id, plan_digest);

-- ---------------------------------------------------------------------------
-- A. Grants. OWNER path only.
-- ---------------------------------------------------------------------------

CREATE TABLE source_discovery_grants (
    id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    brief_id               uuid        NOT NULL,
    plan_digest            text        NOT NULL,
    geography              text        NOT NULL,
    provider_key           text        NOT NULL,
    model_id               text        NOT NULL,
    max_queries            integer     NOT NULL,
    max_results_per_query  integer     NOT NULL,
    max_runs               integer     NOT NULL DEFAULT 1,
    issued_at              timestamptz NOT NULL,
    expires_at             timestamptz NOT NULL,
    actor_key              text        NOT NULL,
    created_at             timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT source_discovery_grants_plan_fk
        FOREIGN KEY (brief_id, plan_digest)
        REFERENCES source_discovery_briefs (id, plan_digest),
    CONSTRAINT source_discovery_grants_digest_chk
        CHECK (plan_digest ~ '^[0-9a-f]{64}$'),
    CONSTRAINT source_discovery_grants_geography_chk
        CHECK (geography ~ '^[A-Z]{2}$'),
    CONSTRAINT source_discovery_grants_provider_chk
        CHECK (provider_key = 'claude-max-web-search'),
    -- The closed model allowlist. Mirrors SOURCE_DISCOVERY_ALLOWED_MODELS
    -- (src/orgunits/sourceDiscovery/grant.ts) value for value.
    CONSTRAINT source_discovery_grants_model_chk
        CHECK (model_id IN ('claude-haiku-4-5', 'claude-opus-5', 'claude-sonnet-5')),
    CONSTRAINT source_discovery_grants_max_queries_chk
        CHECK (max_queries BETWEEN 1 AND 100),
    CONSTRAINT source_discovery_grants_max_results_chk
        CHECK (max_results_per_query BETWEEN 1 AND 20),
    CONSTRAINT source_discovery_grants_max_runs_chk
        CHECK (max_runs BETWEEN 1 AND 200),
    CONSTRAINT source_discovery_grants_window_chk
        CHECK (expires_at > issued_at AND expires_at - issued_at <= interval '14 days'),
    CONSTRAINT source_discovery_grants_actor_key_chk
        CHECK (actor_key ~ '^[a-z0-9][a-z0-9_-]{2,63}$')
);

COMMENT ON TABLE source_discovery_grants IS
    'ONE OWNER-PATH AUTHORITY for live source-discovery search (ADR 0027 D4, '
    'ADR 0028): one registered brief or plan by id and digest, one geography '
    'that plan claims, the live provider key, one allowlisted model, a query '
    'and result budget, a validity window of at most 14 days, and at most '
    'max_runs runs. INSERT by the migration owner only; nwf_source_discovery '
    'can read it and never write it. A grant authorises SEARCH ONLY: never a '
    'fetch, a classification, a score, a contact or an outreach. Append-only '
    '(trigger-enforced).';

COMMENT ON COLUMN source_discovery_grants.max_runs IS
    'How many runs this grant covers (ADR 0028). 1, the default, is ADR 0027 '
    'D4''s single use exactly. Each run still spends exactly one grant-use row.';

COMMENT ON COLUMN source_discovery_grants.geography IS
    'The geography whose queries the grant authorises, which the plan must '
    'claim (enforced on INSERT). A property of the QUERY PLAN only: it is '
    'never written onto a nomination as an organisation''s country.';

COMMENT ON COLUMN source_discovery_grants.actor_key IS
    'AN OPAQUE KEY NAMING THE OWNER PATH that issued the grant, with exactly '
    'the semantics and prohibitions of orgunit_root_promotions.actor_key: '
    'never a person''s name, handle or mailbox.';

-- ---------------------------------------------------------------------------
-- B. Grant uses. One per run, written before the first query.
-- ---------------------------------------------------------------------------

CREATE TABLE source_discovery_grant_uses (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    grant_id    uuid        NOT NULL REFERENCES source_discovery_grants (id),
    run_id      uuid        NOT NULL REFERENCES source_discovery_runs (id),
    run_seq     integer     NOT NULL,
    actor_key   text        NOT NULL,
    used_at     timestamptz NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT source_discovery_grant_uses_seq_chk
        CHECK (run_seq BETWEEN 1 AND 200),
    CONSTRAINT source_discovery_grant_uses_actor_key_chk
        CHECK (actor_key ~ '^[a-z0-9][a-z0-9_-]{2,63}$')
);

-- One grant per run, and one run per (grant, slot): the race refusal.
CREATE UNIQUE INDEX source_discovery_grant_uses_run_uidx
    ON source_discovery_grant_uses (run_id);
CREATE UNIQUE INDEX source_discovery_grant_uses_grant_seq_uidx
    ON source_discovery_grant_uses (grant_id, run_seq);

COMMENT ON TABLE source_discovery_grant_uses IS
    'ONE RUN SPENDING ONE SLOT OF ONE GRANT, recorded in the run-start '
    'transaction before the first query. run_seq is dense and at most the '
    'grant''s max_runs; the run must carry the grant''s plan, geography and '
    'provider; the grant must be inside its validity window (all enforced on '
    'INSERT). Append-only (trigger-enforced).';

-- ---------------------------------------------------------------------------
-- C. Query calls. One per provider call; no prompt or response text.
-- ---------------------------------------------------------------------------

CREATE TABLE source_discovery_query_calls (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id        uuid        NOT NULL REFERENCES source_discovery_runs (id),
    call_seq      integer     NOT NULL,
    query_id      text        NOT NULL,
    outcome       text        NOT NULL,
    result_count  integer,
    model_id      text        NOT NULL,
    sdk_version   text        NOT NULL,
    smoke         boolean     NOT NULL,
    started_at    timestamptz NOT NULL,
    ended_at      timestamptz NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT source_discovery_query_calls_seq_chk
        CHECK (call_seq BETWEEN 1 AND 100),
    CONSTRAINT source_discovery_query_calls_query_id_chk
        CHECK (query_id ~ '^[a-z]{2}\.[a-z]{2,3}\.[a-z0-9-]{2,48}\.[0-9]{2}$'),
    -- ADR 0027 D5's closed outcome set, verbatim.
    CONSTRAINT source_discovery_query_calls_outcome_chk
        CHECK (outcome IN ('RESULTS', 'PROVIDER_RESULT_ERROR', 'PROVIDER_OUTPUT_INVALID',
                           'PROVIDER_RESULT_MISSING', 'USAGE_LIMIT_EXHAUSTED', 'AUTH_FAILURE',
                           'TOOL_REFUSED')),
    CONSTRAINT source_discovery_query_calls_count_chk
        CHECK ((outcome = 'RESULTS') = (result_count IS NOT NULL)
               AND (result_count IS NULL OR result_count BETWEEN 0 AND 20)),
    CONSTRAINT source_discovery_query_calls_sdk_version_chk
        CHECK (sdk_version ~ '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,6}$'),
    CONSTRAINT source_discovery_query_calls_instants_chk
        CHECK (ended_at >= started_at)
);

CREATE UNIQUE INDEX source_discovery_query_calls_run_seq_uidx
    ON source_discovery_query_calls (run_id, call_seq);
CREATE UNIQUE INDEX source_discovery_query_calls_run_query_uidx
    ON source_discovery_query_calls (run_id, query_id);

COMMENT ON TABLE source_discovery_query_calls IS
    'ONE PROVIDER CALL of a GRANTED run (enforced on INSERT): the query id, '
    'a closed outcome, the result count, the model and pinned SDK version, '
    'its start and end, and whether it was the ADR 0027 D8 smoke (the first '
    'call of a grant''s first run). No prompt, response text or search '
    'transcript is stored. Append-only (trigger-enforced).';

-- ---------------------------------------------------------------------------
-- D. Run completions. At most one terminal event per run.
-- ---------------------------------------------------------------------------

CREATE TABLE source_discovery_run_completions (
    run_id                  uuid        PRIMARY KEY REFERENCES source_discovery_runs (id),
    outcome                 text        NOT NULL,
    reason                  text,
    queries_attempted       integer     NOT NULL,
    nominations_inserted    integer     NOT NULL,
    nominations_duplicated  integer     NOT NULL,
    nominations_refused     integer     NOT NULL,
    nominations_known       integer     NOT NULL,
    completed_at            timestamptz NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT source_discovery_run_completions_outcome_chk
        CHECK (outcome IN ('COMPLETED', 'FAILED', 'ABORTED')),
    CONSTRAINT source_discovery_run_completions_reason_chk
        CHECK ((outcome = 'COMPLETED' AND reason IS NULL)
            OR (outcome = 'FAILED' AND reason IN
                   ('PROVIDER_RESULT_ERROR', 'PROVIDER_OUTPUT_INVALID', 'PROVIDER_RESULT_MISSING',
                    'AUTH_FAILURE', 'TOOL_REFUSED', 'INTERNAL_ERROR'))
            OR (outcome = 'ABORTED' AND reason IN ('USAGE_LIMIT_EXHAUSTED', 'GRANT_EXPIRED'))),
    CONSTRAINT source_discovery_run_completions_counts_chk
        CHECK (queries_attempted >= 0 AND nominations_inserted >= 0
               AND nominations_duplicated >= 0 AND nominations_refused >= 0
               AND nominations_known BETWEEN 0 AND nominations_inserted)
);

COMMENT ON TABLE source_discovery_run_completions IS
    'THE TERMINAL EVENT of one SEARCH_PROVIDER run: COMPLETED, FAILED (a '
    'provider or internal failure ended it) or ABORTED (the subscription '
    'usage limit, or the grant''s window, ended it). For a granted run '
    'queries_attempted must equal its query-call rows (enforced on INSERT). '
    'Append-only (trigger-enforced).';

-- ---------------------------------------------------------------------------
-- E. Known marks. A re-derived measurement over a v2 plan's exclusion set.
-- ---------------------------------------------------------------------------

CREATE TABLE source_discovery_nomination_known_marks (
    nomination_id  uuid        PRIMARY KEY REFERENCES source_discovery_nominations (id),
    already_known  boolean     NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE source_discovery_nomination_known_marks IS
    'Whether a nomination of a nwf-discovery-plan-v2 run named a registrable '
    'domain in that plan''s own exclusion set. A MEASUREMENT re-derived by '
    'the database from the stored plan on INSERT: never caller data, never a '
    'score, never a reason to drop the nomination. Append-only '
    '(trigger-enforced).';

-- ---------------------------------------------------------------------------
-- G. The consistency is the database's, not the caller's.
-- ---------------------------------------------------------------------------
--
-- Run with the INSERTING role's rights (no SECURITY DEFINER): every relation
-- they read is SELECT-granted to nwf_source_discovery below or by 0019.
-- Raised as check_violation (SQLSTATE 23514).

CREATE FUNCTION source_discovery_verify_grant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    claim text[];
    plan jsonb;
    available integer;
BEGIN
    SELECT geography_claim, query_plan INTO claim, plan
      FROM source_discovery_briefs WHERE id = NEW.brief_id;
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

CREATE TRIGGER source_discovery_grants_verify
    BEFORE INSERT ON source_discovery_grants
    FOR EACH ROW EXECUTE FUNCTION source_discovery_verify_grant();

CREATE FUNCTION source_discovery_verify_grant_use()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    g source_discovery_grants%ROWTYPE;
    r source_discovery_runs%ROWTYPE;
    used integer;
BEGIN
    SELECT * INTO g FROM source_discovery_grants WHERE id = NEW.grant_id;
    SELECT * INTO r FROM source_discovery_runs WHERE id = NEW.run_id;
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
    SELECT count(*) INTO used FROM source_discovery_grant_uses WHERE grant_id = NEW.grant_id;
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

CREATE TRIGGER source_discovery_grant_uses_verify
    BEFORE INSERT ON source_discovery_grant_uses
    FOR EACH ROW EXECUTE FUNCTION source_discovery_verify_grant_use();

CREATE FUNCTION source_discovery_verify_query_call()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    g source_discovery_grants%ROWTYPE;
    seq integer;
    calls integer;
BEGIN
    SELECT u.run_seq INTO seq FROM source_discovery_grant_uses u WHERE u.run_id = NEW.run_id;
    IF seq IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_query_calls: a query call belongs to a granted run';
    END IF;
    SELECT gr.* INTO g
      FROM source_discovery_grant_uses u
      JOIN source_discovery_grants gr ON gr.id = u.grant_id
     WHERE u.run_id = NEW.run_id;
    IF EXISTS (SELECT 1 FROM source_discovery_run_completions WHERE run_id = NEW.run_id) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_query_calls: the run is already complete';
    END IF;
    SELECT count(*) INTO calls FROM source_discovery_query_calls WHERE run_id = NEW.run_id;
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
    RETURN NEW;
END;
$$;

CREATE TRIGGER source_discovery_query_calls_verify
    BEFORE INSERT ON source_discovery_query_calls
    FOR EACH ROW EXECUTE FUNCTION source_discovery_verify_query_call();

CREATE FUNCTION source_discovery_verify_run_completion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    kind text;
    calls integer;
BEGIN
    SELECT run_kind INTO kind FROM source_discovery_runs WHERE id = NEW.run_id;
    IF kind IS DISTINCT FROM 'SEARCH_PROVIDER' THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_run_completions: only a SEARCH_PROVIDER run completes';
    END IF;
    IF EXISTS (SELECT 1 FROM source_discovery_grant_uses WHERE run_id = NEW.run_id) THEN
        SELECT count(*) INTO calls FROM source_discovery_query_calls WHERE run_id = NEW.run_id;
        IF NEW.queries_attempted <> calls THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'source_discovery_run_completions: queries_attempted must equal the run''s query calls';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER source_discovery_run_completions_verify
    BEFORE INSERT ON source_discovery_run_completions
    FOR EACH ROW EXECUTE FUNCTION source_discovery_verify_run_completion();

CREATE FUNCTION source_discovery_verify_known_mark()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    key text;
    plan jsonb;
    domain text;
BEGIN
    SELECT b.brief_key, b.query_plan, n.registrable_domain INTO key, plan, domain
      FROM source_discovery_nominations n
      JOIN source_discovery_runs r ON r.id = n.discovery_run_id
      JOIN source_discovery_briefs b ON b.id = r.brief_id
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

CREATE TRIGGER source_discovery_nomination_known_marks_verify
    BEFORE INSERT ON source_discovery_nomination_known_marks
    FOR EACH ROW EXECUTE FUNCTION source_discovery_verify_known_mark();

-- ---------------------------------------------------------------------------
-- F. A live-provider run cannot commit without a grant use (ADR 0027 D7).
-- ---------------------------------------------------------------------------

CREATE FUNCTION source_discovery_require_grant_use()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM source_discovery_grant_uses WHERE run_id = NEW.id) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_runs: a claude-max-web-search run requires a stored grant use';
    END IF;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER source_discovery_runs_live_requires_grant
    AFTER INSERT ON source_discovery_runs
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    WHEN (NEW.provider_key = 'claude-max-web-search')
    EXECUTE FUNCTION source_discovery_require_grant_use();

-- ---------------------------------------------------------------------------
-- H. Append-only, for every role including the owner (0013's function).
-- ---------------------------------------------------------------------------

CREATE TRIGGER source_discovery_grants_append_only
    BEFORE UPDATE OR DELETE ON source_discovery_grants
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation();
CREATE TRIGGER source_discovery_grant_uses_append_only
    BEFORE UPDATE OR DELETE ON source_discovery_grant_uses
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation();
CREATE TRIGGER source_discovery_query_calls_append_only
    BEFORE UPDATE OR DELETE ON source_discovery_query_calls
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation();
CREATE TRIGGER source_discovery_run_completions_append_only
    BEFORE UPDATE OR DELETE ON source_discovery_run_completions
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation();
CREATE TRIGGER source_discovery_nomination_known_marks_append_only
    BEFORE UPDATE OR DELETE ON source_discovery_nomination_known_marks
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation();

-- ---------------------------------------------------------------------------
-- I. Grants. The capability READS grants and appends the run's own evidence;
--    audit reads everything; nothing else.
-- ---------------------------------------------------------------------------

REVOKE ALL ON source_discovery_grants, source_discovery_grant_uses,
              source_discovery_query_calls, source_discovery_run_completions,
              source_discovery_nomination_known_marks
    FROM PUBLIC, nwf_ingest, nwf_research, nwf_classifier, nwf_readonly,
         nwf_discovery_subject_writer, nwf_discovery_subject_reviewer, nwf_source_discovery;

GRANT SELECT ON source_discovery_grants TO nwf_source_discovery;

GRANT SELECT, INSERT ON source_discovery_grant_uses, source_discovery_query_calls,
                        source_discovery_run_completions,
                        source_discovery_nomination_known_marks
    TO nwf_source_discovery;

GRANT SELECT ON source_discovery_grants, source_discovery_grant_uses,
                source_discovery_query_calls, source_discovery_run_completions,
                source_discovery_nomination_known_marks
    TO nwf_readonly;
