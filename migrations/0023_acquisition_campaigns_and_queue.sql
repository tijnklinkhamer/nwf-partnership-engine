-- Migration 0023 - WW E-Q: OWNER-SIGNED ACQUISITION CAMPAIGNS AND AN
-- APPEND-ONLY, DATABASE-GOVERNED WORK QUEUE (ADR 0029, Proposed).
--
-- Until now every acquisition step was one operator invocation for one
-- organisation. This migration adds the durable state a BOUNDED, OWNER-SIGNED
-- campaign needs so that approved work can be processed without a prompt per
-- organisation - and nothing that could grant authority by itself:
--
--   A. `acquisition_campaigns` - ONE OWNER-signed campaign document
--      (`nwf-pe.acquisition-campaign.v1`): the signed payload verbatim, its
--      SHA-256, the Ed25519 signature and key id, a bounded window, a scope
--      (geographies, source kinds, worker stages, search grants) and budgets.
--      The OWNER PATH (the migration owner) is the only writer. The signature
--      is verified in application code against a PINNED trust set that is
--      EMPTY in this build (src/orgunits/acquisition/trust.ts), so no
--      production campaign can verify; the database proves STRUCTURE (the
--      stored document IS the signed bytes, its fields equal the columns).
--   B. `acquisition_campaign_control_events` - START | PAUSE | RESUME | STOP |
--      EMERGENCY_STOP, totally ordered per campaign; owner path only. STOP and
--      EMERGENCY_STOP are terminal. A campaign's control state is DERIVED from
--      its latest event, never stored.
--   C. `acquisition_work_items` - one unit of work at one STAGE of the closed
--      pipeline DISCOVERED -> NOMINATED -> DEDUPLICATED -> RESEARCH_PENDING ->
--      RESEARCHED -> IDENTITY_REVIEW -> ASSESSABLE, idempotent per campaign.
--   D. `acquisition_work_claims` - one leased ATTEMPT; (item, attempt_no) is
--      unique, so two workers can never hold the same attempt.
--   E. `acquisition_work_outcomes` - one per claim; ADVANCED,
--      RETRY_SCHEDULED, REFUSED_TERMINAL, AWAITING_HUMAN or FAILED_TERMINAL.
--      At most ONE terminal (incl. ADVANCED) outcome per work item, by index.
--   F. `acquisition_worker_stops` - why a worker stopped claiming.
--   G. `acquisition_work_item_states` - the DERIVED item state (a view).
--
-- THE HUMAN GATE IS STRUCTURAL. An IDENTITY_REVIEW item can only ever receive
-- an AWAITING_HUMAN outcome (queue OWNER_IDENTITY_REVIEW), and an ASSESSABLE
-- item can only be created - as the child of an identity-review item that is
-- awaiting a human - by the OWNER PATH. The worker capability can do neither.
--
-- WHAT IT DOES NOT DO. No contact column, no score, no relevance, no ranking
-- of organisations (`priority` is a function of the STAGE alone), no country
-- on a work item, no UPDATE or DELETE grant to anyone, no SECURITY DEFINER
-- function, no LOGIN, and no change to any existing table, role or grant.

-- ---------------------------------------------------------------------------
-- 0. The capability role. NOLOGIN, no password, no attributes (0014 pattern).
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nwf_acquisition_worker') THEN
        CREATE ROLE nwf_acquisition_worker NOLOGIN;
    END IF;
END
$$;

ALTER ROLE nwf_acquisition_worker
    NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD NULL;

COMMENT ON ROLE nwf_acquisition_worker IS
    'WW E-Q CAPABILITY ROLE (NOLOGIN): reads campaigns and their control '
    'events, appends work items, claims, outcomes and worker stops. SELECT + '
    'INSERT only: no UPDATE, DELETE, TRUNCATE or TEMPORARY, and no INSERT on '
    'campaigns or control events. Holding it is not campaign authority: a '
    'campaign counts only if its OWNER signature verifies under the pinned '
    'trust set (ADR 0029).';

-- ---------------------------------------------------------------------------
-- 1. The closed stage vocabulary, and the documented priority rule.
-- ---------------------------------------------------------------------------

-- 0..6 for the seven stages, NULL for anything else.
CREATE FUNCTION acquisition_stage_ordinal(stage text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT array_position(
        ARRAY['DISCOVERED', 'NOMINATED', 'DEDUPLICATED', 'RESEARCH_PENDING',
              'RESEARCHED', 'IDENTITY_REVIEW', 'ASSESSABLE']::text[],
        stage) - 1
$$;

COMMENT ON FUNCTION acquisition_stage_ordinal(text) IS
    'The position of a stage in the closed acquisition pipeline (0 = '
    'DISCOVERED .. 6 = ASSESSABLE). The documented PRIORITY RULE is '
    '`priority = 100 * ordinal`: later stages drain first, so work in progress '
    'reaches the human gate before more is discovered. Priority is never a '
    'property of the organisation: nothing here scores or ranks one.';

-- The one advisory-lock key per campaign, shared by the store and every
-- trigger below, so claim admission, concurrency and budget counts serialise.
CREATE FUNCTION acquisition_campaign_lock_key(campaign uuid)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
AS $$ SELECT hashtextextended('nwf-acq-campaign:' || campaign::text, 0) $$;

CREATE FUNCTION acquisition_item_lock_key(item uuid)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
AS $$ SELECT hashtextextended('nwf-acq-item:' || item::text, 0) $$;

-- ---------------------------------------------------------------------------
-- A. Campaigns.
-- ---------------------------------------------------------------------------

CREATE TABLE acquisition_campaigns (
    id                               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    environment_id                   uuid        NOT NULL
                                                 REFERENCES subject_review_environment (environment_id),
    campaign_key                     text        NOT NULL,
    document_version                 text        NOT NULL,
    document                         jsonb       NOT NULL,
    payload_base64url                text        NOT NULL,
    payload_sha256                   text        NOT NULL,
    signature                        text        NOT NULL,
    key_id                           text        NOT NULL,
    key_fingerprint                  text        NOT NULL,
    nonce                            text        NOT NULL,
    issued_at                        timestamptz NOT NULL,
    starts_at                        timestamptz NOT NULL,
    ends_at                          timestamptz NOT NULL,
    geographies                      text[]      NOT NULL,
    source_kinds                     text[]      NOT NULL,
    allowed_stages                   text[]      NOT NULL,
    search_grant_ids                 uuid[]      NOT NULL,
    max_work_items                   integer     NOT NULL,
    max_search_runs                  integer     NOT NULL,
    max_research_roots               integer     NOT NULL,
    max_gateway_requests             integer     NOT NULL,
    max_items_per_registrable_domain integer     NOT NULL,
    max_concurrency                  integer     NOT NULL,
    max_attempts_per_item            integer     NOT NULL,
    max_awaiting_human_backlog       integer     NOT NULL,
    actor_key                        text        NOT NULL,
    recorded_at                      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT acquisition_campaigns_version_chk
        CHECK (document_version = 'nwf-pe.acquisition-campaign.v1'),
    CONSTRAINT acquisition_campaigns_document_chk
        CHECK (jsonb_typeof(document) = 'object'
               AND document ->> 'document' = document_version),
    CONSTRAINT acquisition_campaigns_key_chk
        CHECK (campaign_key ~ '^[a-z0-9][a-z0-9-]{2,62}-v[0-9]{1,4}$'),
    CONSTRAINT acquisition_campaigns_payload_chk
        CHECK (payload_base64url ~ '^[A-Za-z0-9_-]+$' AND length(payload_base64url) <= 180000),
    CONSTRAINT acquisition_campaigns_sha_chk
        CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
    -- 64 signature bytes are exactly 86 unpadded base64url characters.
    CONSTRAINT acquisition_campaigns_signature_chk
        CHECK (signature ~ '^[A-Za-z0-9_-]{86}$'),
    CONSTRAINT acquisition_campaigns_key_id_chk
        CHECK (key_id ~ '^[a-z0-9][a-z0-9-]{2,40}$'),
    CONSTRAINT acquisition_campaigns_fingerprint_chk
        CHECK (key_fingerprint ~ '^[0-9a-f]{64}$'),
    CONSTRAINT acquisition_campaigns_nonce_chk
        CHECK (nonce ~ '^[A-Za-z0-9_-]{43}$'),
    -- A BOUNDED window: at most 30 days.
    CONSTRAINT acquisition_campaigns_window_chk
        CHECK (ends_at > starts_at AND ends_at <= starts_at + interval '720 hours'),
    CONSTRAINT acquisition_campaigns_geographies_chk
        CHECK (geographies = ARRAY['WORLDWIDE']::text[]
               OR (cardinality(geographies) BETWEEN 1 AND 64
                   AND array_to_string(geographies, ',') ~ '^[A-Z]{2}(,[A-Z]{2})*$')),
    CONSTRAINT acquisition_campaigns_source_kinds_chk
        CHECK (cardinality(source_kinds) BETWEEN 1 AND 3
               AND source_kinds <@ ARRAY['SEARCH_GRANT', 'LINK_OUT', 'SEED']::text[]),
    -- The worker may perform only the stages listed. IDENTITY_REVIEW is never
    -- a worker stage: it is the human gate.
    CONSTRAINT acquisition_campaigns_stages_chk
        CHECK (cardinality(allowed_stages) BETWEEN 1 AND 6
               AND allowed_stages <@ ARRAY['DISCOVERED', 'NOMINATED', 'DEDUPLICATED',
                                           'RESEARCH_PENDING', 'RESEARCHED',
                                           'ASSESSABLE']::text[]),
    CONSTRAINT acquisition_campaigns_search_grants_chk
        CHECK (cardinality(search_grant_ids) <= 64
               AND (('SEARCH_GRANT' = ANY (source_kinds)) = (cardinality(search_grant_ids) >= 1))),
    -- Mechanical safety bounds, not calibrated targets (ADR 0029 s5).
    CONSTRAINT acquisition_campaigns_budgets_chk
        CHECK (max_work_items BETWEEN 1 AND 10000
               AND max_search_runs BETWEEN 0 AND 100
               AND max_research_roots BETWEEN 0 AND 500
               AND max_gateway_requests BETWEEN 0 AND 30000
               AND max_items_per_registrable_domain BETWEEN 1 AND 100
               AND max_concurrency BETWEEN 1 AND 4
               AND max_attempts_per_item BETWEEN 1 AND 10
               AND max_awaiting_human_backlog BETWEEN 1 AND 1000),
    CONSTRAINT acquisition_campaigns_actor_key_chk
        CHECK (actor_key ~ '^[a-z0-9][a-z0-9_-]{2,63}$')
);

CREATE UNIQUE INDEX acquisition_campaigns_payload_uidx ON acquisition_campaigns (payload_sha256);
CREATE UNIQUE INDEX acquisition_campaigns_nonce_uidx ON acquisition_campaigns (nonce);
CREATE UNIQUE INDEX acquisition_campaigns_key_uidx ON acquisition_campaigns (campaign_key);

COMMENT ON TABLE acquisition_campaigns IS
    'ONE OWNER-SIGNED ACQUISITION CAMPAIGN (nwf-pe.acquisition-campaign.v1): '
    'the signed payload verbatim, its SHA-256, the Ed25519 signature and key '
    'id, a window of at most 30 days, a scope and budgets. Written only on the '
    'owner path. A row is not authority: the worker re-verifies the signature '
    'against the PINNED trust set before every claim, and that set is empty in '
    'this build. Append-only (trigger-enforced).';

COMMENT ON COLUMN acquisition_campaigns.geographies IS
    'The geographies the campaign is SCOPED to (ISO-3166-1 alpha-2), or exactly '
    '{WORLDWIDE}. A scope for handlers to enforce, never an organisation''s '
    'country: nothing writes it onto a work item or infers a country from it.';

COMMENT ON COLUMN acquisition_campaigns.search_grant_ids IS
    'The live source-discovery grants this campaign may consume. Plain uuids '
    'with no foreign key: the grant table belongs to another package. A grant '
    'is still checked by its own capability when used.';

COMMENT ON COLUMN acquisition_campaigns.actor_key IS
    'AN OPAQUE KEY NAMING THE TRUSTED PATH that recorded the campaign, with '
    'exactly the semantics of orgunit_root_promotions.actor_key: never a '
    'person''s name, handle or mailbox.';

-- True when the session is the OWNER PATH: the role that owns these tables.
CREATE FUNCTION acquisition_is_owner_path()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT current_user::text = pg_get_userbyid(relowner)::text
      FROM pg_class WHERE oid = 'acquisition_campaigns'::regclass
$$;

-- The stored document IS the signed bytes, and every column equals its field.
CREATE FUNCTION acquisition_campaign_verify_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    b64      text;
    bytes    bytea;
    doc      jsonb := NEW.document;
    env      uuid;
    env_rows integer;
BEGIN
    SELECT count(*), max(environment_id::text)::uuid INTO env_rows, env
      FROM subject_review_environment;
    IF env_rows <> 1 OR env IS DISTINCT FROM NEW.environment_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_campaigns: not this database''s environment';
    END IF;

    b64 := translate(NEW.payload_base64url, '-_', '+/');
    b64 := b64 || repeat('=', (4 - length(b64) % 4) % 4);
    bytes := decode(b64, 'base64');
    IF encode(sha256(bytes), 'hex') <> NEW.payload_sha256 THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_campaigns: payload_sha256 is not the hash of the signed payload';
    END IF;
    IF convert_from(bytes, 'UTF8')::jsonb IS DISTINCT FROM doc THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_campaigns: document is not the signed payload';
    END IF;

    IF NEW.campaign_key IS DISTINCT FROM doc ->> 'campaignKey'
       OR NEW.key_id IS DISTINCT FROM doc ->> 'keyId'
       OR NEW.key_fingerprint IS DISTINCT FROM doc ->> 'keyFingerprint'
       OR NEW.nonce IS DISTINCT FROM doc ->> 'nonce'
       OR NEW.environment_id::text IS DISTINCT FROM doc ->> 'environmentId'
       OR NEW.issued_at IS DISTINCT FROM (doc ->> 'issuedAt')::timestamptz
       OR NEW.starts_at IS DISTINCT FROM (doc #>> '{window,startsAt}')::timestamptz
       OR NEW.ends_at IS DISTINCT FROM (doc #>> '{window,endsAt}')::timestamptz
       OR NEW.geographies IS DISTINCT FROM
            ARRAY(SELECT jsonb_array_elements_text(doc #> '{scope,geographies}'))
       OR NEW.source_kinds IS DISTINCT FROM
            ARRAY(SELECT jsonb_array_elements_text(doc #> '{scope,sourceKinds}'))
       OR NEW.allowed_stages IS DISTINCT FROM
            ARRAY(SELECT jsonb_array_elements_text(doc #> '{scope,stages}'))
       OR NEW.search_grant_ids IS DISTINCT FROM
            ARRAY(SELECT jsonb_array_elements_text(doc #> '{scope,searchGrantIds}')::uuid)
       OR NEW.max_work_items IS DISTINCT FROM (doc #>> '{budgets,maxWorkItems}')::integer
       OR NEW.max_search_runs IS DISTINCT FROM (doc #>> '{budgets,maxSearchRuns}')::integer
       OR NEW.max_research_roots IS DISTINCT FROM (doc #>> '{budgets,maxResearchRoots}')::integer
       OR NEW.max_gateway_requests IS DISTINCT FROM (doc #>> '{budgets,maxGatewayRequests}')::integer
       OR NEW.max_items_per_registrable_domain IS DISTINCT FROM
            (doc #>> '{budgets,maxItemsPerRegistrableDomain}')::integer
       OR NEW.max_concurrency IS DISTINCT FROM (doc #>> '{budgets,maxConcurrency}')::integer
       OR NEW.max_attempts_per_item IS DISTINCT FROM (doc #>> '{budgets,maxAttemptsPerItem}')::integer
       OR NEW.max_awaiting_human_backlog IS DISTINCT FROM
            (doc #>> '{budgets,maxAwaitingHumanBacklog}')::integer
    THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_campaigns: a column disagrees with the signed document';
    END IF;

    IF (SELECT count(DISTINCT g) FROM unnest(NEW.geographies) g) <> cardinality(NEW.geographies)
       OR (SELECT count(DISTINCT k) FROM unnest(NEW.source_kinds) k) <> cardinality(NEW.source_kinds)
       OR (SELECT count(DISTINCT s) FROM unnest(NEW.allowed_stages) s) <> cardinality(NEW.allowed_stages)
       OR (SELECT count(DISTINCT u) FROM unnest(NEW.search_grant_ids) u) <> cardinality(NEW.search_grant_ids)
    THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_campaigns: a scope list repeats a value';
    END IF;

    -- By the DATABASE clock: not already over, not issued in the future.
    IF NOT (now() < NEW.ends_at AND NEW.issued_at <= now() + interval '300 seconds') THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_campaigns: window already closed or issued in the future';
    END IF;
    IF NEW.recorded_at IS DISTINCT FROM now() THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_campaigns: recorded_at must be the database clock';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER acquisition_campaigns_verify
    BEFORE INSERT ON acquisition_campaigns
    FOR EACH ROW EXECUTE FUNCTION acquisition_campaign_verify_insert();

-- ---------------------------------------------------------------------------
-- B. Control events, and the DERIVED control state.
-- ---------------------------------------------------------------------------

CREATE TABLE acquisition_campaign_control_events (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id  uuid        NOT NULL REFERENCES acquisition_campaigns (id),
    sequence_no  integer     NOT NULL,
    action       text        NOT NULL,
    actor_key    text        NOT NULL,
    reason       text,
    recorded_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT acquisition_control_action_chk
        CHECK (action IN ('START', 'PAUSE', 'RESUME', 'STOP', 'EMERGENCY_STOP')),
    CONSTRAINT acquisition_control_sequence_chk CHECK (sequence_no >= 1),
    CONSTRAINT acquisition_control_actor_key_chk
        CHECK (actor_key ~ '^[a-z0-9][a-z0-9_-]{2,63}$'),
    CONSTRAINT acquisition_control_reason_chk
        CHECK (reason IS NULL
               OR (length(reason) BETWEEN 1 AND 500
                   AND reason !~ '[[:cntrl:]]' AND position('@' in reason) = 0))
);

CREATE UNIQUE INDEX acquisition_control_sequence_uidx
    ON acquisition_campaign_control_events (campaign_id, sequence_no);

COMMENT ON TABLE acquisition_campaign_control_events IS
    'ONE OWNER-PATH CONTROL ACT on one campaign, totally ordered by '
    'sequence_no. The control state is DERIVED from the latest event: none = '
    'NOT_STARTED, START/RESUME = RUNNING, PAUSE = PAUSED, STOP = STOPPED, '
    'EMERGENCY_STOP = EMERGENCY_STOPPED. STOP and EMERGENCY_STOP are terminal '
    '(EMERGENCY_STOP may escalate a STOP). The worker only reads this table. '
    'Append-only (trigger-enforced).';

CREATE FUNCTION acquisition_campaign_control_state(campaign uuid)
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(
        (SELECT CASE e.action
                    WHEN 'START' THEN 'RUNNING'
                    WHEN 'RESUME' THEN 'RUNNING'
                    WHEN 'PAUSE' THEN 'PAUSED'
                    WHEN 'STOP' THEN 'STOPPED'
                    ELSE 'EMERGENCY_STOPPED'
                END
           FROM acquisition_campaign_control_events e
          WHERE e.campaign_id = campaign
          ORDER BY e.sequence_no DESC
          LIMIT 1),
        'NOT_STARTED')
$$;

CREATE FUNCTION acquisition_control_verify_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    expected integer;
    state    text;
BEGIN
    PERFORM pg_advisory_xact_lock(acquisition_campaign_lock_key(NEW.campaign_id));
    SELECT COALESCE(max(sequence_no), 0) + 1 INTO expected
      FROM acquisition_campaign_control_events WHERE campaign_id = NEW.campaign_id;
    IF NEW.sequence_no IS DISTINCT FROM expected THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_campaign_control_events: sequence_no must be the next in order';
    END IF;
    state := acquisition_campaign_control_state(NEW.campaign_id);
    IF NOT (
           (NEW.action = 'START' AND state = 'NOT_STARTED')
        OR (NEW.action = 'PAUSE' AND state = 'RUNNING')
        OR (NEW.action = 'RESUME' AND state = 'PAUSED')
        OR (NEW.action = 'STOP' AND state IN ('NOT_STARTED', 'RUNNING', 'PAUSED'))
        OR (NEW.action = 'EMERGENCY_STOP' AND state <> 'EMERGENCY_STOPPED'))
    THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = format('acquisition_campaign_control_events: %s is not permitted from %s',
                             NEW.action, state);
    END IF;
    IF NEW.recorded_at IS DISTINCT FROM now() THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_campaign_control_events: recorded_at must be the database clock';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER acquisition_control_verify
    BEFORE INSERT ON acquisition_campaign_control_events
    FOR EACH ROW EXECUTE FUNCTION acquisition_control_verify_insert();

-- ---------------------------------------------------------------------------
-- C. Work items.
-- ---------------------------------------------------------------------------

CREATE TABLE acquisition_work_items (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id        uuid        NOT NULL REFERENCES acquisition_campaigns (id),
    stage              text        NOT NULL,
    source_kind        text        NOT NULL,
    subject_kind       text        NOT NULL,
    subject_id         uuid        NOT NULL,
    registrable_domain text,
    idempotency_key    text        NOT NULL,
    parent_item_id     uuid,
    priority           integer     NOT NULL,
    not_before         timestamptz NOT NULL DEFAULT now(),
    created_at         timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT acquisition_work_items_stage_chk
        CHECK (acquisition_stage_ordinal(stage) IS NOT NULL),
    CONSTRAINT acquisition_work_items_source_kind_chk
        CHECK (source_kind IN ('SEARCH_GRANT', 'LINK_OUT', 'SEED')),
    CONSTRAINT acquisition_work_items_subject_kind_chk
        CHECK (subject_kind IN ('SEARCH_GRANT', 'RESEARCH_RUN', 'SEED_LIST', 'NOMINATION',
                                'DISCOVERY_SUBJECT')),
    -- What a stage is ABOUT. A root is a discovery task; a nomination is
    -- deduplicated; only a discovery subject is researched, reviewed, assessed.
    CONSTRAINT acquisition_work_items_subject_shape_chk
        CHECK ((stage = 'DISCOVERED'
                    AND ((source_kind = 'SEARCH_GRANT' AND subject_kind = 'SEARCH_GRANT')
                      OR (source_kind = 'LINK_OUT' AND subject_kind = 'RESEARCH_RUN')
                      OR (source_kind = 'SEED' AND subject_kind = 'SEED_LIST')))
            OR (stage = 'NOMINATED' AND subject_kind = 'NOMINATION')
            OR (stage = 'DEDUPLICATED' AND subject_kind IN ('NOMINATION', 'DISCOVERY_SUBJECT'))
            OR (stage IN ('RESEARCH_PENDING', 'RESEARCHED', 'IDENTITY_REVIEW', 'ASSESSABLE')
                    AND subject_kind = 'DISCOVERY_SUBJECT')),
    -- Only a discovery task is a root; everything else descends from one.
    CONSTRAINT acquisition_work_items_root_chk
        CHECK ((parent_item_id IS NULL) = (stage = 'DISCOVERED')),
    -- Idempotency is deterministic: one item per (stage, subject) per campaign.
    CONSTRAINT acquisition_work_items_idempotency_chk
        CHECK (idempotency_key = stage || '|' || subject_kind || ':' || subject_id::text),
    CONSTRAINT acquisition_work_items_priority_chk
        CHECK (priority = 100 * acquisition_stage_ordinal(stage)),
    CONSTRAINT acquisition_work_items_domain_chk
        CHECK (registrable_domain IS NULL
               OR registrable_domain ~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+([a-z]{2,63}|xn--[a-z0-9-]{1,59})$'),
    CONSTRAINT acquisition_work_items_not_before_chk
        CHECK (not_before >= created_at AND not_before <= created_at + interval '720 hours')
);

CREATE UNIQUE INDEX acquisition_work_items_idempotency_uidx
    ON acquisition_work_items (campaign_id, idempotency_key);
CREATE UNIQUE INDEX acquisition_work_items_campaign_uidx
    ON acquisition_work_items (id, campaign_id);
CREATE INDEX acquisition_work_items_domain_idx
    ON acquisition_work_items (campaign_id, registrable_domain);
CREATE INDEX acquisition_work_items_parent_idx
    ON acquisition_work_items (parent_item_id);

ALTER TABLE acquisition_work_items
    ADD CONSTRAINT acquisition_work_items_parent_fk
    FOREIGN KEY (parent_item_id, campaign_id)
    REFERENCES acquisition_work_items (id, campaign_id);

COMMENT ON TABLE acquisition_work_items IS
    'ONE UNIT OF CAMPAIGN WORK at one stage of the closed pipeline, about one '
    'subject (a search grant, a research run, a seed list, a nomination or a '
    'discovery subject - referenced by id, never copied). Idempotent per '
    'campaign by (stage, subject). Its STATE is derived from its claims and '
    'outcomes (acquisition_work_item_states), never stored. NOT an '
    'organisation, NOT a verdict, NOT a score. Append-only (trigger-enforced).';

COMMENT ON COLUMN acquisition_work_items.priority IS
    '100 * stage ordinal (acquisition_stage_ordinal): a deterministic function '
    'of the stage alone. It orders WORK, never organisations.';

COMMENT ON COLUMN acquisition_work_items.registrable_domain IS
    'The registrable domain the work concerns, when it has one: used only for '
    'per-domain fairness and the per-domain cap. Never identity.';

CREATE FUNCTION acquisition_work_item_verify_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    c            acquisition_campaigns%ROWTYPE;
    state        text;
    parent       acquisition_work_items%ROWTYPE;
    parent_claim uuid;
    parent_out   text;
    total        integer;
    per_domain   integer;
BEGIN
    PERFORM pg_advisory_xact_lock(acquisition_campaign_lock_key(NEW.campaign_id));
    SELECT * INTO c FROM acquisition_campaigns WHERE id = NEW.campaign_id;
    state := acquisition_campaign_control_state(NEW.campaign_id);

    IF state = 'EMERGENCY_STOPPED' THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_work_items: CAMPAIGN_CLOSED (emergency stopped)';
    END IF;
    IF NOT (NEW.source_kind = ANY (c.source_kinds)) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_work_items: source kind outside the campaign scope';
    END IF;

    IF NEW.parent_item_id IS NULL THEN
        -- A ROOT: a discovery task, while the campaign is open.
        IF state IN ('STOPPED') OR now() >= c.ends_at THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'acquisition_work_items: CAMPAIGN_CLOSED (no new root)';
        END IF;
        IF NEW.subject_kind = 'SEARCH_GRANT' AND NOT (NEW.subject_id = ANY (c.search_grant_ids)) THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'acquisition_work_items: search grant not listed by the signed campaign';
        END IF;
        IF NEW.subject_kind <> 'SEARCH_GRANT' AND NOT acquisition_is_owner_path() THEN
            RAISE EXCEPTION USING ERRCODE = '42501',
                MESSAGE = 'acquisition_work_items: only the owner path may seed a link-out or seed-list root';
        END IF;
    ELSE
        SELECT * INTO parent FROM acquisition_work_items WHERE id = NEW.parent_item_id;
        IF acquisition_stage_ordinal(NEW.stage) <> acquisition_stage_ordinal(parent.stage) + 1
           OR NEW.source_kind <> parent.source_kind THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'acquisition_work_items: a child must be at its parent''s next stage, same source kind';
        END IF;
        SELECT cl.id, o.outcome INTO parent_claim, parent_out
          FROM acquisition_work_claims cl
          LEFT JOIN acquisition_work_outcomes o ON o.claim_id = cl.id
         WHERE cl.work_item_id = parent.id
         ORDER BY cl.attempt_no DESC LIMIT 1;
        IF parent.stage = 'IDENTITY_REVIEW' THEN
            -- THE HUMAN GATE: only the owner path releases a reviewed subject.
            IF NOT acquisition_is_owner_path() THEN
                RAISE EXCEPTION USING ERRCODE = '42501',
                    MESSAGE = 'acquisition_work_items: only the owner path may release an identity-review item';
            END IF;
            IF parent_out IS DISTINCT FROM 'AWAITING_HUMAN' THEN
                RAISE EXCEPTION USING ERRCODE = '23514',
                    MESSAGE = 'acquisition_work_items: the identity-review item is not awaiting a human';
            END IF;
        ELSIF parent_claim IS NULL OR parent_out IS NOT NULL THEN
            -- A child is produced only while its parent's latest attempt is in flight.
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'acquisition_work_items: the parent has no in-flight claim';
        END IF;
    END IF;

    SELECT count(*) INTO total FROM acquisition_work_items WHERE campaign_id = NEW.campaign_id;
    IF total >= c.max_work_items THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_work_items: WORK_ITEM_BUDGET_EXHAUSTED';
    END IF;
    IF NEW.registrable_domain IS NOT NULL THEN
        SELECT count(*) INTO per_domain FROM acquisition_work_items
         WHERE campaign_id = NEW.campaign_id AND registrable_domain = NEW.registrable_domain;
        IF per_domain >= c.max_items_per_registrable_domain THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'acquisition_work_items: DOMAIN_CAP_REACHED';
        END IF;
    END IF;
    IF NEW.created_at IS DISTINCT FROM now() THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_work_items: created_at must be the database clock';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER acquisition_work_items_verify
    BEFORE INSERT ON acquisition_work_items
    FOR EACH ROW EXECUTE FUNCTION acquisition_work_item_verify_insert();

-- ---------------------------------------------------------------------------
-- D. Claims: one leased attempt.
-- ---------------------------------------------------------------------------

CREATE TABLE acquisition_work_claims (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    work_item_id     uuid        NOT NULL,
    campaign_id      uuid        NOT NULL,
    attempt_no       integer     NOT NULL,
    worker_id        text        NOT NULL,
    claimed_at       timestamptz NOT NULL DEFAULT now(),
    lease_expires_at timestamptz NOT NULL,

    CONSTRAINT acquisition_work_claims_item_fk
        FOREIGN KEY (work_item_id, campaign_id)
        REFERENCES acquisition_work_items (id, campaign_id),
    CONSTRAINT acquisition_work_claims_attempt_chk CHECK (attempt_no BETWEEN 1 AND 10),
    CONSTRAINT acquisition_work_claims_worker_chk
        CHECK (worker_id ~ '^[a-z0-9][a-z0-9_.:-]{2,63}$'),
    -- A lease of 1 s .. 1 h.
    CONSTRAINT acquisition_work_claims_lease_chk
        CHECK (lease_expires_at >= claimed_at + interval '1 second'
               AND lease_expires_at <= claimed_at + interval '3600 seconds')
);

-- THE RACE GUARD: two workers can never hold the same attempt of one item.
CREATE UNIQUE INDEX acquisition_work_claims_attempt_uidx
    ON acquisition_work_claims (work_item_id, attempt_no);
CREATE UNIQUE INDEX acquisition_work_claims_item_uidx
    ON acquisition_work_claims (id, work_item_id);
CREATE INDEX acquisition_work_claims_campaign_idx
    ON acquisition_work_claims (campaign_id, claimed_at);

COMMENT ON TABLE acquisition_work_claims IS
    'ONE LEASED ATTEMPT at one work item. A claim is an INSERT; (work_item_id, '
    'attempt_no) is unique, so a concurrent second claim of the same attempt '
    'fails. Attempt n+1 is admitted only after attempt n''s lease expired with '
    'no outcome, or after a RETRY_SCHEDULED outcome whose retry instant has '
    'passed. Admission also requires a RUNNING campaign inside its window, a '
    'stage the campaign lists (or the built-in identity-review parking) and a '
    'free concurrency slot. Append-only (trigger-enforced).';

-- ---------------------------------------------------------------------------
-- E. Outcomes: one per claim, at most one terminal per item.
-- ---------------------------------------------------------------------------

CREATE TABLE acquisition_work_outcomes (
    id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id                  uuid        NOT NULL,
    work_item_id              uuid        NOT NULL,
    outcome                   text        NOT NULL,
    next_stage                text,
    produced_child_ids        uuid[]      NOT NULL DEFAULT '{}',
    child_refusals            text[]      NOT NULL DEFAULT '{}',
    retry_reason              text,
    retry_not_before          timestamptz,
    refusal_reason            text,
    human_queue               text,
    failure_reason            text,
    search_runs_consumed      integer     NOT NULL DEFAULT 0,
    research_roots_consumed   integer     NOT NULL DEFAULT 0,
    gateway_requests_consumed integer     NOT NULL DEFAULT 0,
    recorded_by_worker_id     text        NOT NULL,
    recorded_at               timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT acquisition_work_outcomes_claim_fk
        FOREIGN KEY (claim_id, work_item_id)
        REFERENCES acquisition_work_claims (id, work_item_id),
    CONSTRAINT acquisition_work_outcomes_kind_chk
        CHECK (outcome IN ('ADVANCED', 'RETRY_SCHEDULED', 'REFUSED_TERMINAL', 'AWAITING_HUMAN',
                           'FAILED_TERMINAL')),
    CONSTRAINT acquisition_work_outcomes_shape_chk
        CHECK (
            (outcome = 'ADVANCED'
                AND retry_reason IS NULL AND retry_not_before IS NULL AND refusal_reason IS NULL
                AND human_queue IS NULL AND failure_reason IS NULL)
         OR (outcome = 'RETRY_SCHEDULED'
                AND retry_reason IS NOT NULL AND retry_not_before IS NOT NULL
                AND next_stage IS NULL AND refusal_reason IS NULL AND human_queue IS NULL
                AND failure_reason IS NULL)
         OR (outcome = 'REFUSED_TERMINAL'
                AND refusal_reason IS NOT NULL AND next_stage IS NULL AND retry_reason IS NULL
                AND retry_not_before IS NULL AND human_queue IS NULL AND failure_reason IS NULL)
         OR (outcome = 'AWAITING_HUMAN'
                AND human_queue IS NOT NULL AND next_stage IS NULL AND retry_reason IS NULL
                AND retry_not_before IS NULL AND refusal_reason IS NULL AND failure_reason IS NULL)
         OR (outcome = 'FAILED_TERMINAL'
                AND failure_reason IS NOT NULL AND next_stage IS NULL AND retry_not_before IS NULL
                AND refusal_reason IS NULL AND human_queue IS NULL)),
    CONSTRAINT acquisition_work_outcomes_children_chk
        CHECK ((outcome = 'ADVANCED' OR cardinality(produced_child_ids) = 0)
               AND cardinality(produced_child_ids) <= 500
               AND cardinality(child_refusals) <= 500
               AND child_refusals <@ ARRAY['DUPLICATE', 'WORK_ITEM_BUDGET_EXHAUSTED',
                                           'DOMAIN_CAP_REACHED', 'CAMPAIGN_CLOSED']::text[]),
    CONSTRAINT acquisition_work_outcomes_next_stage_chk
        CHECK (next_stage IS NULL OR acquisition_stage_ordinal(next_stage) IS NOT NULL),
    CONSTRAINT acquisition_work_outcomes_retry_reason_chk
        CHECK (retry_reason IS NULL OR retry_reason IN
            ('TRANSIENT_PROVIDER_FAILURE', 'TRANSIENT_NETWORK_FAILURE', 'DEPENDENCY_NOT_READY',
             'RATE_LIMITED', 'HANDLER_EXCEPTION', 'LEASE_EXPIRED')),
    CONSTRAINT acquisition_work_outcomes_refusal_reason_chk
        CHECK (refusal_reason IS NULL OR refusal_reason IN
            ('DUPLICATE', 'OUT_OF_SCOPE', 'NOT_ADMISSIBLE', 'POLICY_REFUSED', 'SUBJECT_NOT_FOUND',
             'GRANT_UNAVAILABLE', 'IDENTITY_UNRESOLVED', 'HANDLER_OUTPUT_INVALID',
             'CAMPAIGN_EMERGENCY_STOPPED')),
    CONSTRAINT acquisition_work_outcomes_human_queue_chk
        CHECK (human_queue IS NULL OR human_queue IN
            ('OWNER_IDENTITY_REVIEW', 'OWNER_RESEARCH_ADMISSION', 'EVIDENCE_REVIEW')),
    CONSTRAINT acquisition_work_outcomes_failure_reason_chk
        CHECK (failure_reason IS NULL OR failure_reason IN
            ('ATTEMPTS_EXHAUSTED', 'LEASE_EXPIRED_ATTEMPTS_EXHAUSTED')),
    CONSTRAINT acquisition_work_outcomes_consumption_chk
        CHECK (search_runs_consumed BETWEEN 0 AND 100
               AND research_roots_consumed BETWEEN 0 AND 100
               AND gateway_requests_consumed BETWEEN 0 AND 10000),
    CONSTRAINT acquisition_work_outcomes_worker_chk
        CHECK (recorded_by_worker_id ~ '^[a-z0-9][a-z0-9_.:-]{2,63}$')
);

-- One outcome per claim, and AT MOST ONE terminal outcome (ADVANCED included)
-- per work item: whatever any worker does, an item is never ADVANCED twice.
CREATE UNIQUE INDEX acquisition_work_outcomes_claim_uidx
    ON acquisition_work_outcomes (claim_id);
CREATE UNIQUE INDEX acquisition_work_outcomes_one_terminal_per_item_uidx
    ON acquisition_work_outcomes (work_item_id) WHERE outcome <> 'RETRY_SCHEDULED';

COMMENT ON TABLE acquisition_work_outcomes IS
    'THE ONE RESULT OF ONE CLAIM. ADVANCED names the children it produced; '
    'RETRY_SCHEDULED carries a capped, jitter-free backoff instant; '
    'REFUSED_TERMINAL, AWAITING_HUMAN and FAILED_TERMINAL carry a reason from '
    'a closed set. At most one terminal outcome per item (index). An '
    'IDENTITY_REVIEW item can only be AWAITING_HUMAN. Consumption columns are '
    'what the handler reported spending; campaign budgets are DERIVED from '
    'their sums. Append-only (trigger-enforced).';

CREATE FUNCTION acquisition_outcome_verify_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    cl       acquisition_work_claims%ROWTYPE;
    item     acquisition_work_items%ROWTYPE;
    c        acquisition_campaigns%ROWTYPE;
    latest   integer;
    state    text;
BEGIN
    PERFORM pg_advisory_xact_lock(acquisition_item_lock_key(NEW.work_item_id));
    SELECT * INTO cl FROM acquisition_work_claims WHERE id = NEW.claim_id;
    SELECT * INTO item FROM acquisition_work_items WHERE id = NEW.work_item_id;
    SELECT * INTO c FROM acquisition_campaigns WHERE id = item.campaign_id;

    SELECT max(attempt_no) INTO latest FROM acquisition_work_claims
     WHERE work_item_id = NEW.work_item_id;
    IF cl.attempt_no <> latest THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_work_outcomes: CLAIM_SUPERSEDED (a later attempt exists)';
    END IF;
    IF NEW.recorded_at IS DISTINCT FROM now() THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_work_outcomes: recorded_at must be the database clock';
    END IF;

    state := acquisition_campaign_control_state(item.campaign_id);
    IF state = 'EMERGENCY_STOPPED'
       AND NOT (NEW.outcome = 'FAILED_TERMINAL'
                OR (NEW.outcome = 'REFUSED_TERMINAL'
                    AND NEW.refusal_reason = 'CAMPAIGN_EMERGENCY_STOPPED')) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_work_outcomes: the campaign is emergency stopped';
    END IF;

    -- THE HUMAN GATE.
    IF item.stage = 'IDENTITY_REVIEW'
       AND NOT (NEW.outcome = 'AWAITING_HUMAN' AND NEW.human_queue = 'OWNER_IDENTITY_REVIEW') THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_work_outcomes: an identity-review item only ever awaits the OWNER';
    END IF;

    IF NEW.outcome = 'ADVANCED' THEN
        IF item.stage = 'ASSESSABLE' THEN
            IF NEW.next_stage IS NOT NULL OR cardinality(NEW.produced_child_ids) > 0 THEN
                RAISE EXCEPTION USING ERRCODE = '23514',
                    MESSAGE = 'acquisition_work_outcomes: ASSESSABLE is the end of the pipeline';
            END IF;
        ELSIF NEW.next_stage IS NULL
              OR acquisition_stage_ordinal(NEW.next_stage) <> acquisition_stage_ordinal(item.stage) + 1 THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'acquisition_work_outcomes: ADVANCED must name the next stage';
        END IF;
        IF EXISTS (SELECT 1 FROM unnest(NEW.produced_child_ids) AS p(child)
                    WHERE NOT EXISTS (SELECT 1 FROM acquisition_work_items w
                                       WHERE w.id = p.child
                                         AND w.parent_item_id = NEW.work_item_id
                                         AND w.stage = NEW.next_stage)) THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'acquisition_work_outcomes: a produced child is not this item''s child at the next stage';
        END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM acquisition_work_items w
                WHERE w.parent_item_id = NEW.work_item_id
                  AND item.stage <> 'IDENTITY_REVIEW'
                  AND NOT (w.id = ANY (NEW.produced_child_ids))) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_work_outcomes: every child of the item must be named by its outcome';
    END IF;

    IF NEW.outcome = 'RETRY_SCHEDULED' THEN
        IF cl.attempt_no >= c.max_attempts_per_item THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'acquisition_work_outcomes: no retry after the last permitted attempt';
        END IF;
        IF NOT (NEW.retry_not_before > now()
                AND NEW.retry_not_before <= now() + interval '3600 seconds') THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'acquisition_work_outcomes: retry_not_before must be in (now, now + 1 h]';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER acquisition_work_outcomes_verify
    BEFORE INSERT ON acquisition_work_outcomes
    FOR EACH ROW EXECUTE FUNCTION acquisition_outcome_verify_insert();

-- Declared after the outcome table: its function names the outcome row type.
CREATE FUNCTION acquisition_claim_verify_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    c          acquisition_campaigns%ROWTYPE;
    item       acquisition_work_items%ROWTYPE;
    prev       acquisition_work_claims%ROWTYPE;
    prev_out   acquisition_work_outcomes%ROWTYPE;
    live       integer;
BEGIN
    PERFORM pg_advisory_xact_lock(acquisition_campaign_lock_key(NEW.campaign_id));
    PERFORM pg_advisory_xact_lock(acquisition_item_lock_key(NEW.work_item_id));
    SELECT * INTO c FROM acquisition_campaigns WHERE id = NEW.campaign_id;
    SELECT * INTO item FROM acquisition_work_items WHERE id = NEW.work_item_id;

    IF NEW.claimed_at IS DISTINCT FROM now() THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_work_claims: claimed_at must be the database clock';
    END IF;
    IF acquisition_campaign_control_state(NEW.campaign_id) <> 'RUNNING' THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_work_claims: the campaign is not RUNNING';
    END IF;
    IF NOT (now() >= c.starts_at AND now() < c.ends_at) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_work_claims: outside the campaign window';
    END IF;
    IF NOT (item.stage = ANY (c.allowed_stages) OR item.stage = 'IDENTITY_REVIEW') THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_work_claims: stage not listed by the campaign';
    END IF;
    IF item.not_before > now() THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_work_claims: the item is not yet due';
    END IF;

    SELECT * INTO prev FROM acquisition_work_claims
     WHERE work_item_id = NEW.work_item_id ORDER BY attempt_no DESC LIMIT 1;
    IF prev.id IS NULL THEN
        IF NEW.attempt_no <> 1 THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'acquisition_work_claims: the first attempt is attempt 1';
        END IF;
    ELSE
        IF NEW.attempt_no <> prev.attempt_no + 1 THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'acquisition_work_claims: attempts are consecutive';
        END IF;
        SELECT * INTO prev_out FROM acquisition_work_outcomes WHERE claim_id = prev.id;
        IF prev_out.id IS NULL THEN
            IF prev.lease_expires_at > now() THEN
                RAISE EXCEPTION USING ERRCODE = '23514',
                    MESSAGE = 'acquisition_work_claims: the item is claimed (lease live)';
            END IF;
        ELSIF prev_out.outcome <> 'RETRY_SCHEDULED' THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'acquisition_work_claims: the item has a terminal outcome';
        ELSIF prev_out.retry_not_before > now() THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'acquisition_work_claims: the retry is not yet due';
        END IF;
    END IF;
    IF NEW.attempt_no > c.max_attempts_per_item THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_work_claims: attempts exhausted';
    END IF;

    SELECT count(*) INTO live
      FROM acquisition_work_claims cl
     WHERE cl.campaign_id = NEW.campaign_id
       AND cl.lease_expires_at > now()
       AND NOT EXISTS (SELECT 1 FROM acquisition_work_outcomes o WHERE o.claim_id = cl.id);
    IF live >= c.max_concurrency THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_work_claims: CONCURRENCY_CAP_REACHED';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER acquisition_work_claims_verify
    BEFORE INSERT ON acquisition_work_claims
    FOR EACH ROW EXECUTE FUNCTION acquisition_claim_verify_insert();

-- ---------------------------------------------------------------------------
-- F. Worker stops.
-- ---------------------------------------------------------------------------

CREATE TABLE acquisition_worker_stops (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id     uuid        NOT NULL REFERENCES acquisition_campaigns (id),
    worker_id       text        NOT NULL,
    stop_reason     text        NOT NULL,
    detail          text,
    items_processed integer     NOT NULL,
    started_at      timestamptz NOT NULL,
    stopped_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT acquisition_worker_stops_worker_chk
        CHECK (worker_id ~ '^[a-z0-9][a-z0-9_.:-]{2,63}$'),
    CONSTRAINT acquisition_worker_stops_reason_chk
        CHECK (stop_reason IN
            ('ONCE_COMPLETED', 'MAX_ITEMS_REACHED', 'QUEUE_DRAINED', 'IDLE', 'ABORTED',
             'BUDGET_EXHAUSTED', 'BACKPRESSURE', 'CAMPAIGN_NOT_STARTED', 'CAMPAIGN_PAUSED',
             'CAMPAIGN_STOPPED', 'CAMPAIGN_EMERGENCY_STOPPED', 'CAMPAIGN_WINDOW_NOT_OPEN',
             'CAMPAIGN_WINDOW_CLOSED', 'CAMPAIGN_UNVERIFIED')),
    CONSTRAINT acquisition_worker_stops_detail_chk
        CHECK (detail IS NULL OR detail ~ '^[A-Za-z0-9_:.-]{1,128}$'),
    CONSTRAINT acquisition_worker_stops_processed_chk CHECK (items_processed >= 0),
    CONSTRAINT acquisition_worker_stops_order_chk CHECK (stopped_at >= started_at)
);

CREATE INDEX acquisition_worker_stops_campaign_idx
    ON acquisition_worker_stops (campaign_id, stopped_at);

COMMENT ON TABLE acquisition_worker_stops IS
    'WHY ONE WORKER RUN STOPPED CLAIMING, from a closed set (budget, '
    'backpressure, control state, window, drained, aborted ...). Append-only '
    '(trigger-enforced).';

-- ---------------------------------------------------------------------------
-- G. The DERIVED item state.
-- ---------------------------------------------------------------------------

CREATE VIEW acquisition_work_item_states WITH (security_invoker = true) AS
SELECT i.id               AS work_item_id,
       i.campaign_id,
       i.stage,
       i.source_kind,
       i.subject_kind,
       i.subject_id,
       i.registrable_domain,
       i.parent_item_id,
       i.priority,
       i.not_before,
       i.created_at,
       cl.id              AS latest_claim_id,
       cl.attempt_no      AS latest_attempt_no,
       cl.worker_id       AS latest_worker_id,
       cl.claimed_at      AS latest_claimed_at,
       cl.lease_expires_at,
       o.outcome          AS latest_outcome,
       o.retry_reason,
       o.retry_not_before,
       o.refusal_reason,
       o.human_queue,
       o.failure_reason,
       o.recorded_at      AS outcome_recorded_at,
       CASE
           WHEN cl.id IS NULL THEN 'PENDING'
           WHEN o.id IS NULL AND cl.lease_expires_at > now() THEN 'CLAIMED'
           WHEN o.id IS NULL THEN 'LEASE_EXPIRED'
           ELSE o.outcome
       END                AS state
  FROM acquisition_work_items i
  LEFT JOIN LATERAL (
        SELECT c.* FROM acquisition_work_claims c
         WHERE c.work_item_id = i.id
         ORDER BY c.attempt_no DESC
         LIMIT 1) cl ON true
  LEFT JOIN acquisition_work_outcomes o ON o.claim_id = cl.id;

COMMENT ON VIEW acquisition_work_item_states IS
    'THE DERIVED STATE of every work item, from its latest claim and that '
    'claim''s outcome: PENDING, CLAIMED, LEASE_EXPIRED, or the outcome kind. '
    'Never stored. security_invoker: it grants nothing its reader lacks.';

-- ---------------------------------------------------------------------------
-- H. Append-only, for every role including the owner (0013's function).
-- ---------------------------------------------------------------------------

CREATE TRIGGER acquisition_campaigns_append_only
    BEFORE UPDATE OR DELETE ON acquisition_campaigns
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation();
CREATE TRIGGER acquisition_control_append_only
    BEFORE UPDATE OR DELETE ON acquisition_campaign_control_events
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation();
CREATE TRIGGER acquisition_work_items_append_only
    BEFORE UPDATE OR DELETE ON acquisition_work_items
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation();
CREATE TRIGGER acquisition_work_claims_append_only
    BEFORE UPDATE OR DELETE ON acquisition_work_claims
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation();
CREATE TRIGGER acquisition_work_outcomes_append_only
    BEFORE UPDATE OR DELETE ON acquisition_work_outcomes
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation();
CREATE TRIGGER acquisition_worker_stops_append_only
    BEFORE UPDATE OR DELETE ON acquisition_worker_stops
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation();

-- ---------------------------------------------------------------------------
-- I. Grants. SELECT + INSERT for the worker on the queue; SELECT on the
--    campaign and its control events; nothing else. SELECT for audit.
-- ---------------------------------------------------------------------------

REVOKE ALL ON acquisition_campaigns, acquisition_campaign_control_events,
              acquisition_work_items, acquisition_work_claims, acquisition_work_outcomes,
              acquisition_worker_stops, acquisition_work_item_states
    FROM PUBLIC, nwf_ingest, nwf_research, nwf_classifier, nwf_readonly,
         nwf_discovery_subject_writer, nwf_discovery_subject_reviewer, nwf_source_discovery;

DO $$
DECLARE
    db text := current_database();
BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO nwf_acquisition_worker', db);
END
$$;

GRANT USAGE ON SCHEMA public TO nwf_acquisition_worker;

GRANT SELECT ON acquisition_campaigns, acquisition_campaign_control_events
    TO nwf_acquisition_worker;
GRANT SELECT, INSERT ON acquisition_work_items, acquisition_work_claims,
                        acquisition_work_outcomes, acquisition_worker_stops
    TO nwf_acquisition_worker;
GRANT SELECT ON acquisition_work_item_states TO nwf_acquisition_worker;

GRANT SELECT ON acquisition_campaigns, acquisition_campaign_control_events,
                acquisition_work_items, acquisition_work_claims, acquisition_work_outcomes,
                acquisition_worker_stops, acquisition_work_item_states
    TO nwf_readonly;
