-- Migration 0026 - WW H-ACQ: HARDENING OF CAMPAIGN RESEARCH ADMISSION AND THE
-- ACQUISITION WIRING (ADR 0030 s13, Proposed).
--
-- Migrations 0023 and 0024 are committed and are NOT edited: every change
-- below is a new function, view, column or trigger, a widened CHECK, or a
-- CREATE OR REPLACE of a 0023/0024 function whose body is restated in full
-- with the change marked. An independent review of the wired pipeline
-- (2026-10-27, @e5b7c07) found:
--
--   P1-1. A CAMPAIGN admission was usable OUTSIDE its campaign: the shared
--     root resolver accepted it like an OWNER admission, so the standalone
--     `orgunits subjects research --execute` (research role) could research
--     a campaign-admitted subject for a whole day, and in-flight research
--     never observed EMERGENCY_STOP. Now section I exposes, to the research
--     role, only what the resolver needs to refuse a CAMPAIGN admission on
--     EVERY gateway attempt unless the campaign is RUNNING and inside its
--     window, its work item is in flight, and the request belongs to that
--     admission's FIRST run, started under the item's current attempt; and
--     a CAMPAIGN admission's run row itself is refused unless it is the
--     admission's only run, started while all of that holds.
--   P1-2. Gateway spend was SELF-REPORTED by the handler. Now (section H)
--     the campaign's spend is derived per work item as the GREATER of what
--     its claims reserved/reported and what the database OBSERVED: the
--     fetch observations rooted in the item's CAMPAIGN admissions. Spend is
--     never below what was observed.
--   P2-2. `acquisition_campaign_subjects` never validated its subject id.
--     Now it must be the id DERIVED from (campaign, nomination) - the same
--     function the wiring uses (section C).
--   P2-3. Count-after-lock triggers are defeated by a snapshot taken before
--     the lock (REPEATABLE READ / SERIALIZABLE), and window checks used the
--     TRANSACTION start (`now()`). Now every acquisition write refuses any
--     isolation other than READ COMMITTED (section A), and every window and
--     lease comparison uses `clock_timestamp()`.
--   P2-4. An identity-review item could be released to ASSESSABLE without a
--     CONFIRMED review. Now the release requires the subject's current
--     review head(s) to be CONFIRMED and attested (section F).
--   P2-5. LINK_OUT roots skipped the geography scope and could recurse
--     without bound. Now the signed document `nwf-pe.acquisition-campaign.v2`
--     carries `scope.linkOutMaxHops` (0..3); a v1 document means exactly ONE
--     hop (a link-out root may come only from research of a SEARCH_GRANT or
--     SEED subject - the conservative reading of what v1 already did), and
--     the worker's link-out root is refused beyond the signed depth
--     (sections B and E).
--
-- WHAT IT DOES NOT DO. No LOGIN, no new role, no UPDATE/DELETE/TRUNCATE
-- grant, no SECURITY DEFINER function, no contact, score, verdict or country
-- column. The one ordinary (definer-rights) VIEW follows migration 0017's
-- fingerprint precedent: it exposes booleans, two instants, a run id and a
-- count per CAMPAIGN admission, and nothing else. No existing row is
-- rewritten; the new campaign column's default (1) is exactly the v1 reading.

-- ---------------------------------------------------------------------------
-- A. P2-3: READ COMMITTED only, for every acquisition write.
-- ---------------------------------------------------------------------------

CREATE FUNCTION acquisition_refuse_snapshot_isolation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
    -- The acquisition triggers serialise on a lock and THEN count. Under
    -- REPEATABLE READ or SERIALIZABLE the count would read the snapshot taken
    -- before the lock, and two racing inserts could both fit one budget.
    IF current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION USING ERRCODE = '25001',
            MESSAGE = format('%s: acquisition writes require READ COMMITTED (not %s)',
                             TG_TABLE_NAME, current_setting('transaction_isolation'));
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION acquisition_refuse_snapshot_isolation() IS
    'Refuses an acquisition write under REPEATABLE READ or SERIALIZABLE: every '
    'count-after-lock rule needs a statement snapshot taken after its lock '
    '(ADR 0030 s13, P2-3).';

-- Named to sort first among each table's BEFORE INSERT triggers.
CREATE TRIGGER a_snapshot_isolation_guard BEFORE INSERT ON acquisition_campaign_control_events
    FOR EACH ROW EXECUTE FUNCTION acquisition_refuse_snapshot_isolation();
CREATE TRIGGER a_snapshot_isolation_guard BEFORE INSERT ON acquisition_work_items
    FOR EACH ROW EXECUTE FUNCTION acquisition_refuse_snapshot_isolation();
CREATE TRIGGER a_snapshot_isolation_guard BEFORE INSERT ON acquisition_work_claims
    FOR EACH ROW EXECUTE FUNCTION acquisition_refuse_snapshot_isolation();
CREATE TRIGGER a_snapshot_isolation_guard BEFORE INSERT ON acquisition_work_outcomes
    FOR EACH ROW EXECUTE FUNCTION acquisition_refuse_snapshot_isolation();
CREATE TRIGGER a_snapshot_isolation_guard BEFORE INSERT ON acquisition_claim_lease_extensions
    FOR EACH ROW EXECUTE FUNCTION acquisition_refuse_snapshot_isolation();
CREATE TRIGGER a_snapshot_isolation_guard BEFORE INSERT ON acquisition_campaign_subjects
    FOR EACH ROW EXECUTE FUNCTION acquisition_refuse_snapshot_isolation();
CREATE TRIGGER a_snapshot_isolation_guard BEFORE INSERT ON acquisition_signals
    FOR EACH ROW EXECUTE FUNCTION acquisition_refuse_snapshot_isolation();
CREATE TRIGGER a_snapshot_isolation_guard BEFORE INSERT ON acquisition_outbox_entries
    FOR EACH ROW EXECUTE FUNCTION acquisition_refuse_snapshot_isolation();
-- subject_research_admissions: only its CAMPAIGN rows (section D) - the OWNER
-- admission recorder (0017) deliberately inserts under REPEATABLE READ.

-- In flight = latest attempt, no outcome, EFFECTIVE lease live by the
-- STATEMENT clock (was the transaction clock). VOLATILE now, honestly.
CREATE OR REPLACE FUNCTION acquisition_item_in_flight(item uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
SET search_path = public, pg_catalog, pg_temp
AS $$
    SELECT COALESCE(
        (SELECT o.id IS NULL AND acquisition_claim_lease_until(cl.id) > clock_timestamp()
           FROM public.acquisition_work_claims cl
           LEFT JOIN public.acquisition_work_outcomes o ON o.claim_id = cl.id
          WHERE cl.work_item_id = item
          ORDER BY cl.attempt_no DESC
          LIMIT 1),
        false)
$$;

-- ---------------------------------------------------------------------------
-- B. P2-5: the signed link-out depth (`nwf-pe.acquisition-campaign.v2`).
-- ---------------------------------------------------------------------------

ALTER TABLE acquisition_campaigns
    ADD COLUMN link_out_max_hops integer NOT NULL DEFAULT 1;

ALTER TABLE acquisition_campaigns DROP CONSTRAINT acquisition_campaigns_version_chk;
ALTER TABLE acquisition_campaigns
    ADD CONSTRAINT acquisition_campaigns_version_chk
        CHECK (document_version IN ('nwf-pe.acquisition-campaign.v1',
                                    'nwf-pe.acquisition-campaign.v2')),
    ADD CONSTRAINT acquisition_campaigns_link_out_hops_chk
        CHECK ((document_version = 'nwf-pe.acquisition-campaign.v1' AND link_out_max_hops = 1)
            OR (document_version = 'nwf-pe.acquisition-campaign.v2'
                AND link_out_max_hops BETWEEN 0 AND 3));

COMMENT ON COLUMN acquisition_campaigns.link_out_max_hops IS
    'How many LINK_OUT generations the worker may enqueue (ADR 0030 s13, P2-5): '
    'hop 1 is a link-out found by research of a SEARCH_GRANT or SEED subject, '
    'hop n+1 one found by research of a hop-n subject. Signed in a v2 document '
    '(scope.linkOutMaxHops, 0..3); a v1 document means exactly 1. Link-out '
    'nominations carry no geography (a country is never inferred), so this '
    'depth is what bounds how far a geography-scoped campaign can wander.';

-- 0023's campaign rule, restated, with the v2 field checked against the
-- signed document and the window read by the statement clock.
CREATE OR REPLACE FUNCTION acquisition_campaign_verify_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    b64      text;
    bytes    bytea;
    doc      jsonb := NEW.document;
    env      uuid;
    env_rows integer;
BEGIN
    SELECT count(*), max(environment_id::text)::uuid INTO env_rows, env
      FROM public.subject_review_environment;
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
       -- 0026 (P2-5): v1 carries no depth and means 1; v2 signs it.
       OR NEW.link_out_max_hops IS DISTINCT FROM
            (CASE NEW.document_version
                 WHEN 'nwf-pe.acquisition-campaign.v1' THEN
                     (CASE WHEN doc #> '{scope,linkOutMaxHops}' IS NULL THEN 1 END)
                 ELSE (doc #>> '{scope,linkOutMaxHops}')::integer
             END)
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

    -- By the DATABASE clock (0026: the statement clock): not already over,
    -- not issued in the future.
    IF NOT (clock_timestamp() < NEW.ends_at
            AND NEW.issued_at <= clock_timestamp() + interval '300 seconds') THEN
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

-- The hop a LINK_OUT root naming research run `run` would be: 1 when the run
-- researched a subject of a SEARCH_GRANT or SEED tree, 1 + that tree's own
-- hop when it researched a subject of a LINK_OUT tree. NULL when the run is
-- not a CAMPAIGN admission's run (no worker link-out root then). Bounded.
CREATE FUNCTION acquisition_link_out_hop_of_run(run uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    item  public.acquisition_work_items%ROWTYPE;
    cur   uuid := run;
    hops  integer := 1;
    i     integer;
    j     integer;
BEGIN
    FOR i IN 1..16 LOOP
        SELECT w.* INTO item
          FROM public.orgunit_research_runs r
          JOIN public.subject_research_admissions a
            ON r.root_scope = 'subject_admission:' || a.id::text
          JOIN public.acquisition_work_items w ON w.id = a.campaign_work_item_id
         WHERE r.id = cur AND a.admission_basis = 'CAMPAIGN';
        IF NOT FOUND THEN
            RETURN NULL;
        END IF;
        IF item.source_kind <> 'LINK_OUT' THEN
            RETURN hops;
        END IF;
        -- A child keeps its parent's source kind: walk to the LINK_OUT root.
        j := 0;
        WHILE item.parent_item_id IS NOT NULL AND j < 16 LOOP
            SELECT * INTO item FROM public.acquisition_work_items WHERE id = item.parent_item_id;
            j := j + 1;
        END LOOP;
        IF item.parent_item_id IS NOT NULL OR item.subject_kind <> 'RESEARCH_RUN' THEN
            RETURN NULL;
        END IF;
        cur := item.subject_id;
        hops := hops + 1;
    END LOOP;
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION acquisition_link_out_hop_of_run(uuid) IS
    'The link-out generation a LINK_OUT root naming this research run would '
    'be (ADR 0030 s13, P2-5), or NULL when the run is not a CAMPAIGN '
    'admission''s. Reads with the caller''s rights.';

-- ---------------------------------------------------------------------------
-- C. P2-2: the campaign subject id is DERIVED, never chosen.
-- ---------------------------------------------------------------------------

-- Byte-for-byte the wiring's `campaignSubjectIdOf` (acquisitionWiring/context.ts):
-- a UUID v4 shape over SHA-256('nwf-pe.acquisition-subject.v1|<campaign>|<nomination>').
CREATE FUNCTION acquisition_campaign_subject_id(campaign uuid, nomination uuid)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_catalog, pg_temp
AS $$
    SELECT (substr(h, 1, 8) || '-' || substr(h, 9, 4) || '-4' || substr(h, 14, 3) || '-'
            || to_hex((('x' || substr(h, 17, 1))::bit(4)::integer & 3) | 8)
            || substr(h, 18, 3) || '-' || substr(h, 21, 12))::uuid
      FROM (SELECT encode(sha256(convert_to(
                       'nwf-pe.acquisition-subject.v1|' || campaign::text || '|' || nomination::text,
                       'UTF8')), 'hex') AS h) d
$$;

COMMENT ON FUNCTION acquisition_campaign_subject_id(uuid, uuid) IS
    'The discovery-subject id a campaign proposes for one nomination - the '
    'SAME derivation as the wiring''s campaignSubjectIdOf, so a binding can '
    'only name the subject its own nomination produced (ADR 0030 s13, P2-2).';

CREATE OR REPLACE FUNCTION acquisition_campaign_subject_verify_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    item public.acquisition_work_items%ROWTYPE;
BEGIN
    PERFORM pg_advisory_xact_lock(acquisition_item_lock_key(NEW.work_item_id));
    SELECT * INTO item FROM public.acquisition_work_items WHERE id = NEW.work_item_id;
    IF item.stage IS DISTINCT FROM 'DEDUPLICATED'
       OR item.subject_kind IS DISTINCT FROM 'NOMINATION'
       OR item.subject_id IS DISTINCT FROM NEW.nomination_id
       OR item.registrable_domain IS DISTINCT FROM NEW.registrable_domain THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_campaign_subjects: not this campaign''s DEDUPLICATED item for the nomination';
    END IF;
    -- 0026 (P2-2): the subject is the one DERIVED from (campaign, nomination).
    IF NEW.subject_id IS DISTINCT FROM acquisition_campaign_subject_id(NEW.campaign_id, NEW.nomination_id) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_campaign_subjects: subject_id is not the subject derived from (campaign, nomination)';
    END IF;
    IF NOT acquisition_item_in_flight(NEW.work_item_id) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_campaign_subjects: the work item has no in-flight claim';
    END IF;
    IF acquisition_campaign_control_state(NEW.campaign_id) = 'EMERGENCY_STOPPED' THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_campaign_subjects: the campaign is emergency stopped';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.source_discovery_nominations n
                    WHERE n.id = NEW.nomination_id
                      AND n.url = NEW.nominated_url
                      AND n.registrable_domain = NEW.registrable_domain) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_campaign_subjects: the URL and domain are not the nomination''s';
    END IF;
    IF NEW.recorded_at IS DISTINCT FROM now() THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_campaign_subjects: recorded_at must be the database clock';
    END IF;
    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- D. The CAMPAIGN admission rule (0024 B), restated: READ COMMITTED for a
--    CAMPAIGN row, and the window by the statement clock.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION subject_research_admission_campaign_verify()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    c       public.acquisition_campaigns%ROWTYPE;
    item    public.acquisition_work_items%ROWTYPE;
    host    text;
    used    integer;
BEGIN
    IF NEW.admission_basis IS DISTINCT FROM 'CAMPAIGN' THEN
        IF NOT acquisition_is_owner_path() THEN
            RAISE EXCEPTION USING ERRCODE = '42501',
                MESSAGE = 'subject_research_admissions: only the owner path may record an OWNER_REVIEWED admission';
        END IF;
        RETURN NEW;
    END IF;

    -- 0026 (P2-3): the budget and "no other live admission" counts below must
    -- read rows committed after the campaign lock.
    IF current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION USING ERRCODE = '25001',
            MESSAGE = 'subject_research_admissions: a CAMPAIGN admission requires READ COMMITTED';
    END IF;

    PERFORM pg_advisory_xact_lock(acquisition_campaign_lock_key(NEW.campaign_id));
    SELECT * INTO c FROM public.acquisition_campaigns WHERE id = NEW.campaign_id;
    SELECT * INTO item FROM public.acquisition_work_items WHERE id = NEW.campaign_work_item_id;

    IF acquisition_campaign_control_state(NEW.campaign_id) <> 'RUNNING' THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'subject_research_admissions: CAMPAIGN basis needs a RUNNING campaign';
    END IF;
    IF NOT (clock_timestamp() >= c.starts_at AND clock_timestamp() < c.ends_at) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'subject_research_admissions: CAMPAIGN basis outside the campaign window';
    END IF;
    IF NOT ('RESEARCH_PENDING' = ANY (c.allowed_stages)) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'subject_research_admissions: the signed campaign does not list RESEARCH_PENDING';
    END IF;
    IF item.stage IS DISTINCT FROM 'RESEARCH_PENDING'
       OR item.subject_kind IS DISTINCT FROM 'DISCOVERY_SUBJECT'
       OR item.subject_id IS DISTINCT FROM NEW.subject_id
       OR item.registrable_domain IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'subject_research_admissions: not this campaign''s RESEARCH_PENDING item for the subject';
    END IF;
    IF NOT acquisition_item_in_flight(item.id) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'subject_research_admissions: the work item has no in-flight claim';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.acquisition_campaign_subjects s
                    WHERE s.campaign_id = NEW.campaign_id
                      AND s.subject_id = NEW.subject_id
                      AND s.registrable_domain = item.registrable_domain) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'subject_research_admissions: the subject was not proposed inside this campaign';
    END IF;

    IF NEW.website_url !~ '^https://' THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'subject_research_admissions: a CAMPAIGN root must be https';
    END IF;
    host := lower(substring(NEW.website_url FROM '^https://([^/:?#]+)'));
    IF host IS NULL
       OR NOT (host = item.registrable_domain OR right(host, length(item.registrable_domain) + 1)
                                                  = '.' || item.registrable_domain) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'subject_research_admissions: a CAMPAIGN root must be on the nominated registrable domain';
    END IF;

    SELECT count(*) INTO used FROM public.subject_research_admissions
     WHERE campaign_id = NEW.campaign_id AND admission_basis = 'CAMPAIGN';
    IF used >= c.max_research_roots THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'subject_research_admissions: RESEARCH_ROOT_BUDGET_EXHAUSTED';
    END IF;
    IF EXISTS (SELECT 1 FROM public.subject_research_admissions a
                WHERE a.subject_id = NEW.subject_id
                  AND a.expires_at > clock_timestamp()
                  AND NOT EXISTS (SELECT 1 FROM public.subject_research_admission_revocations v
                                   WHERE v.admission_id = a.id)) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'subject_research_admissions: the subject already holds a live admission';
    END IF;
    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- E/F. The work-item rule (0024 E), restated: the statement clock, the
--      signed link-out depth on the worker's ONE root exception (P2-5), and
--      a CONFIRMED, attested review before an identity-review release (P2-4).
-- ---------------------------------------------------------------------------

-- True when every current head of the subject's own review chain is an
-- attested CONFIRMED review, and at least one review exists. A later
-- DISPUTED, REJECTED or WITHDRAWN head, or an unattested head, is not.
CREATE FUNCTION acquisition_subject_identity_confirmed(subject uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog, pg_temp
AS $$
    SELECT EXISTS (SELECT 1 FROM public.discovery_subject_reviews r
                    WHERE r.reviewed_subject_id = subject)
       AND NOT EXISTS (
           SELECT 1 FROM public.discovery_subject_reviews r
            WHERE r.reviewed_subject_id = subject
              AND NOT EXISTS (SELECT 1 FROM public.discovery_subject_reviews s
                               WHERE s.supersedes_review_id = r.id)
              AND (r.review_outcome <> 'CONFIRMED'
                   OR NOT EXISTS (SELECT 1 FROM public.subject_review_attestations t
                                   WHERE t.review_id = r.id)))
$$;

COMMENT ON FUNCTION acquisition_subject_identity_confirmed(uuid) IS
    'Whether the subject''s identity review head is an OWNER-attested CONFIRMED '
    'review (ADR 0030 s13, P2-4): required before an identity-review item is '
    'released to ASSESSABLE and before its outbox manifest line is written.';

CREATE OR REPLACE FUNCTION acquisition_work_item_verify_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    c            public.acquisition_campaigns%ROWTYPE;
    state        text;
    parent       public.acquisition_work_items%ROWTYPE;
    parent_claim uuid;
    parent_out   text;
    total        integer;
    per_domain   integer;
    hop          integer;
BEGIN
    PERFORM pg_advisory_xact_lock(acquisition_campaign_lock_key(NEW.campaign_id));
    SELECT * INTO c FROM public.acquisition_campaigns WHERE id = NEW.campaign_id;
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
        IF state IN ('STOPPED') OR clock_timestamp() >= c.ends_at THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'acquisition_work_items: CAMPAIGN_CLOSED (no new root)';
        END IF;
        IF NEW.subject_kind = 'SEARCH_GRANT' AND NOT (NEW.subject_id = ANY (c.search_grant_ids)) THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'acquisition_work_items: search grant not listed by the signed campaign';
        END IF;
        IF NEW.subject_kind <> 'SEARCH_GRANT' AND NOT acquisition_is_owner_path() THEN
            IF NOT (NEW.source_kind = 'LINK_OUT' AND NEW.subject_kind = 'RESEARCH_RUN'
                    AND EXISTS (SELECT 1
                                  FROM public.orgunit_research_runs r
                                  JOIN public.subject_research_admissions a
                                    ON r.root_scope = 'subject_admission:' || a.id::text
                                 WHERE r.id = NEW.subject_id
                                   AND a.admission_basis = 'CAMPAIGN'
                                   AND a.campaign_id = NEW.campaign_id)) THEN
                RAISE EXCEPTION USING ERRCODE = '42501',
                    MESSAGE = 'acquisition_work_items: only the owner path may seed a link-out or seed-list root';
            END IF;
            -- 0026 (P2-5): never deeper than the signed link-out depth.
            hop := acquisition_link_out_hop_of_run(NEW.subject_id);
            IF hop IS NULL OR hop > c.link_out_max_hops THEN
                RAISE EXCEPTION USING ERRCODE = '23514',
                    MESSAGE = 'acquisition_work_items: LINK_OUT_HOP_LIMIT (beyond the signed link-out depth)';
            END IF;
        END IF;
    ELSE
        SELECT * INTO parent FROM public.acquisition_work_items WHERE id = NEW.parent_item_id;
        IF acquisition_stage_ordinal(NEW.stage) <> acquisition_stage_ordinal(parent.stage) + 1
           OR NEW.source_kind <> parent.source_kind THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'acquisition_work_items: a child must be at its parent''s next stage, same source kind';
        END IF;
        SELECT cl.id, o.outcome INTO parent_claim, parent_out
          FROM public.acquisition_work_claims cl
          LEFT JOIN public.acquisition_work_outcomes o ON o.claim_id = cl.id
         WHERE cl.work_item_id = parent.id
         ORDER BY cl.attempt_no DESC LIMIT 1;
        IF parent.stage = 'IDENTITY_REVIEW' THEN
            IF NOT acquisition_is_owner_path() THEN
                RAISE EXCEPTION USING ERRCODE = '42501',
                    MESSAGE = 'acquisition_work_items: only the owner path may release an identity-review item';
            END IF;
            IF parent_out IS DISTINCT FROM 'AWAITING_HUMAN' THEN
                RAISE EXCEPTION USING ERRCODE = '23514',
                    MESSAGE = 'acquisition_work_items: the identity-review item is not awaiting a human';
            END IF;
            -- 0026 (P2-4): the release needs the OWNER-attested CONFIRMED review.
            IF parent.subject_kind IS DISTINCT FROM 'DISCOVERY_SUBJECT'
               OR NOT acquisition_subject_identity_confirmed(parent.subject_id) THEN
                RAISE EXCEPTION USING ERRCODE = '23514',
                    MESSAGE = 'acquisition_work_items: IDENTITY_NOT_CONFIRMED (no attested CONFIRMED review heads the subject)';
            END IF;
        ELSIF parent_claim IS NULL OR parent_out IS NOT NULL THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'acquisition_work_items: the parent has no in-flight claim';
        END IF;
    END IF;

    SELECT count(*) INTO total FROM public.acquisition_work_items WHERE campaign_id = NEW.campaign_id;
    IF total >= c.max_work_items THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_work_items: WORK_ITEM_BUDGET_EXHAUSTED';
    END IF;
    IF NEW.registrable_domain IS NOT NULL THEN
        SELECT count(*) INTO per_domain FROM public.acquisition_work_items
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

-- 0024 M, restated with the statement clock.
CREATE OR REPLACE FUNCTION acquisition_work_item_shape_verify()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    c      public.acquisition_campaigns%ROWTYPE;
    parent public.acquisition_work_items%ROWTYPE;
    state  text;
BEGIN
    SELECT * INTO c FROM public.acquisition_campaigns WHERE id = NEW.campaign_id;
    IF NEW.parent_item_id IS NULL THEN
        state := acquisition_campaign_control_state(NEW.campaign_id);
        IF state NOT IN ('RUNNING', 'PAUSED') OR clock_timestamp() < c.starts_at THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'acquisition_work_items: CAMPAIGN_NOT_OPEN (no root before START or starts_at)';
        END IF;
        RETURN NEW;
    END IF;
    SELECT * INTO parent FROM public.acquisition_work_items WHERE id = NEW.parent_item_id;
    IF parent.registrable_domain IS NOT NULL
       AND NEW.registrable_domain IS DISTINCT FROM parent.registrable_domain THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_work_items: a child keeps its parent''s registrable domain';
    END IF;
    IF parent.stage <> 'DISCOVERED' THEN
        IF EXISTS (SELECT 1 FROM public.acquisition_work_items w
                    WHERE w.parent_item_id = NEW.parent_item_id) THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'acquisition_work_items: below DISCOVERED a parent has exactly one child';
        END IF;
        IF NEW.subject_kind = parent.subject_kind AND NEW.subject_id IS DISTINCT FROM parent.subject_id THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'acquisition_work_items: below DISCOVERED a child carries its parent''s subject';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- G. The claim rule (0024 K), restated with the statement clock for the
--    window, the due instant and every lease comparison.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION acquisition_claim_verify_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    c          public.acquisition_campaigns%ROWTYPE;
    item       public.acquisition_work_items%ROWTYPE;
    prev       public.acquisition_work_claims%ROWTYPE;
    prev_out   public.acquisition_work_outcomes%ROWTYPE;
    live       integer;
    spend      record;
    need_s     integer := 0;
    need_r     integer := 0;
    need_g     integer := 0;
BEGIN
    PERFORM pg_advisory_xact_lock(acquisition_campaign_lock_key(NEW.campaign_id));
    PERFORM pg_advisory_xact_lock(acquisition_item_lock_key(NEW.work_item_id));
    SELECT * INTO c FROM public.acquisition_campaigns WHERE id = NEW.campaign_id;
    SELECT * INTO item FROM public.acquisition_work_items WHERE id = NEW.work_item_id;

    IF NEW.claimed_at IS DISTINCT FROM now() THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_work_claims: claimed_at must be the database clock';
    END IF;
    IF acquisition_campaign_control_state(NEW.campaign_id) <> 'RUNNING' THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_work_claims: the campaign is not RUNNING';
    END IF;
    IF NOT (clock_timestamp() >= c.starts_at AND clock_timestamp() < c.ends_at) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_work_claims: outside the campaign window';
    END IF;
    IF NOT (item.stage = ANY (c.allowed_stages) OR item.stage = 'IDENTITY_REVIEW') THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_work_claims: stage not listed by the campaign';
    END IF;
    IF item.not_before > clock_timestamp() THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_work_claims: the item is not yet due';
    END IF;

    SELECT * INTO prev FROM public.acquisition_work_claims
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
        SELECT * INTO prev_out FROM public.acquisition_work_outcomes WHERE claim_id = prev.id;
        IF prev_out.id IS NULL THEN
            IF acquisition_claim_lease_until(prev.id) > clock_timestamp() THEN
                RAISE EXCEPTION USING ERRCODE = '23514',
                    MESSAGE = 'acquisition_work_claims: the item is claimed (lease live)';
            END IF;
        ELSIF prev_out.outcome <> 'RETRY_SCHEDULED' THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'acquisition_work_claims: the item has a terminal outcome';
        ELSIF prev_out.retry_not_before > clock_timestamp() THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'acquisition_work_claims: the retry is not yet due';
        END IF;
    END IF;
    IF NEW.attempt_no > c.max_attempts_per_item THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_work_claims: attempts exhausted';
    END IF;

    SELECT count(*) INTO live
      FROM public.acquisition_work_claims cl
     WHERE cl.campaign_id = NEW.campaign_id
       AND acquisition_claim_lease_until(cl.id) > clock_timestamp()
       AND NOT EXISTS (SELECT 1 FROM public.acquisition_work_outcomes o WHERE o.claim_id = cl.id);
    IF live >= c.max_concurrency THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_work_claims: CONCURRENCY_CAP_REACHED';
    END IF;

    IF item.stage = 'DISCOVERED' AND item.source_kind = 'SEARCH_GRANT' THEN
        need_s := 1;
    ELSIF item.stage = 'RESEARCH_PENDING' THEN
        need_r := 1;
        need_g := 60;
    END IF;
    IF NEW.reserved_search_runs <> need_s OR NEW.reserved_research_roots <> need_r
       OR NEW.reserved_gateway_requests <> need_g THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_work_claims: the reservation is not the stage''s';
    END IF;
    SELECT * INTO spend FROM acquisition_campaign_spend(NEW.campaign_id);
    IF spend.search_runs + need_s > c.max_search_runs
       OR spend.research_roots + need_r > c.max_research_roots
       OR spend.gateway_requests + need_g > c.max_gateway_requests THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_work_claims: BUDGET_EXHAUSTED';
    END IF;
    RETURN NEW;
END;
$$;

-- 0024 J, restated with the statement clock.
CREATE OR REPLACE FUNCTION acquisition_lease_extension_verify_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    cl     public.acquisition_work_claims%ROWTYPE;
    latest integer;
BEGIN
    PERFORM pg_advisory_xact_lock(acquisition_item_lock_key(NEW.work_item_id));
    SELECT * INTO cl FROM public.acquisition_work_claims WHERE id = NEW.claim_id;
    SELECT max(attempt_no) INTO latest FROM public.acquisition_work_claims
     WHERE work_item_id = NEW.work_item_id;
    IF cl.attempt_no <> latest
       OR EXISTS (SELECT 1 FROM public.acquisition_work_outcomes o WHERE o.claim_id = cl.id) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_claim_lease_extensions: LEASE_LOST (the attempt is no longer live)';
    END IF;
    IF acquisition_claim_lease_until(cl.id) <= clock_timestamp() THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_claim_lease_extensions: LEASE_LOST (the lease already lapsed)';
    END IF;
    IF acquisition_campaign_control_state(cl.campaign_id) = 'EMERGENCY_STOPPED' THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_claim_lease_extensions: the campaign is emergency stopped';
    END IF;
    IF NOT (NEW.extended_until > clock_timestamp()
            AND NEW.extended_until <= clock_timestamp() + interval '3600 seconds'
            AND NEW.extended_until <= cl.claimed_at + interval '6 hours') THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_claim_lease_extensions: extended_until out of bounds';
    END IF;
    IF NEW.worker_id IS DISTINCT FROM cl.worker_id OR NEW.recorded_at IS DISTINCT FROM now() THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_claim_lease_extensions: only the claiming worker, at the database clock';
    END IF;
    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- H. P1-2: spend derived from OBSERVATIONS, never below them.
-- ---------------------------------------------------------------------------

-- Per work item: what its claims reserved (no outcome) or reported (an
-- outcome), and what the database OBSERVED for it - its CAMPAIGN admissions
-- (research roots) and the fetch observations rooted in them (gateway
-- requests). The item spends the GREATER of the two, so a handler that
-- reports less than it fetched - or an exception that reports nothing -
-- still spends what it fetched. Search runs stay reservation-based (a search
-- slot is bounded again by its own grant's max_runs).
CREATE OR REPLACE FUNCTION acquisition_campaign_spend(campaign uuid,
                                                      OUT search_runs integer,
                                                      OUT research_roots integer,
                                                      OUT gateway_requests integer)
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog, pg_temp
AS $$
    WITH claimed AS (
        SELECT cl.work_item_id,
               sum(CASE WHEN o.id IS NULL THEN cl.reserved_search_runs
                        ELSE o.search_runs_consumed END) AS s,
               sum(CASE WHEN o.id IS NULL THEN cl.reserved_research_roots
                        ELSE o.research_roots_consumed END) AS r,
               sum(CASE WHEN o.id IS NULL THEN cl.reserved_gateway_requests
                        ELSE o.gateway_requests_consumed END) AS g
          FROM public.acquisition_work_claims cl
          LEFT JOIN public.acquisition_work_outcomes o ON o.claim_id = cl.id
         WHERE cl.campaign_id = campaign
         GROUP BY cl.work_item_id),
    observed AS (
        SELECT a.campaign_work_item_id AS work_item_id,
               count(DISTINCT a.id) AS r,
               count(f.root_subject_admission_id) AS g
          FROM public.subject_research_admissions a
          LEFT JOIN public.orgunit_fetch_observations f ON f.root_subject_admission_id = a.id
         WHERE a.campaign_id = campaign AND a.admission_basis = 'CAMPAIGN'
         GROUP BY a.campaign_work_item_id)
    SELECT COALESCE(sum(COALESCE(c.s, 0)), 0)::integer,
           COALESCE(sum(GREATEST(COALESCE(c.r, 0), COALESCE(ob.r, 0))), 0)::integer,
           COALESCE(sum(GREATEST(COALESCE(c.g, 0), COALESCE(ob.g, 0))), 0)::integer
      FROM claimed c
      FULL JOIN observed ob ON ob.work_item_id = c.work_item_id
$$;

COMMENT ON FUNCTION acquisition_campaign_spend(uuid) IS
    'A campaign''s DERIVED spend (ADR 0030 s9 + s13, P1-2): per work item the '
    'greater of its claims'' reservations/reports and what the database '
    'observed (CAMPAIGN admissions; fetch observations rooted in them).';

-- ---------------------------------------------------------------------------
-- I. P1-1: what the research role may know about a CAMPAIGN admission.
-- ---------------------------------------------------------------------------
--
-- An ordinary view (not security_invoker), exactly like 0017's registry
-- fingerprint: it reads the acquisition tables with its OWNER's privileges
-- and returns, per CAMPAIGN admission, three booleans, one instant, the id
-- of its first run and its run count - nothing else. Every expression reads
-- tables directly (no function call), so no privilege of the reader is
-- consulted below the view. The root resolver (web/authority.ts) reads it on
-- every gateway attempt and refuses the admission unless the campaign is
-- RUNNING inside its window, the item is in flight, and the request belongs
-- to the admission's first run, started under the item's current attempt.

CREATE VIEW subject_research_campaign_admission_standing AS
SELECT a.id AS admission_id,
       COALESCE((SELECT e.action IN ('START', 'RESUME')
                   FROM public.acquisition_campaign_control_events e
                  WHERE e.campaign_id = a.campaign_id
                  ORDER BY e.sequence_no DESC
                  LIMIT 1), false) AS campaign_running,
       (clock_timestamp() >= c.starts_at AND clock_timestamp() < c.ends_at) AS campaign_window_open,
       COALESCE((SELECT o.id IS NULL
                        AND GREATEST(cl.lease_expires_at,
                                     (SELECT max(x.extended_until)
                                        FROM public.acquisition_claim_lease_extensions x
                                       WHERE x.claim_id = cl.id)) > clock_timestamp()
                   FROM public.acquisition_work_claims cl
                   LEFT JOIN public.acquisition_work_outcomes o ON o.claim_id = cl.id
                  WHERE cl.work_item_id = a.campaign_work_item_id
                  ORDER BY cl.attempt_no DESC
                  LIMIT 1), false) AS item_in_flight,
       (SELECT cl.claimed_at
          FROM public.acquisition_work_claims cl
         WHERE cl.work_item_id = a.campaign_work_item_id
         ORDER BY cl.attempt_no DESC
         LIMIT 1) AS attempt_claimed_at,
       (SELECT r.id
          FROM public.orgunit_research_runs r
         WHERE r.root_scope = 'subject_admission:' || a.id::text
         ORDER BY r.started_at, r.id
         LIMIT 1) AS first_run_id,
       (SELECT count(*)
          FROM public.orgunit_research_runs r
         WHERE r.root_scope = 'subject_admission:' || a.id::text)::integer AS run_count
  FROM public.subject_research_admissions a
  JOIN public.acquisition_campaigns c ON c.id = a.campaign_id
 WHERE a.admission_basis = 'CAMPAIGN';

COMMENT ON VIEW subject_research_campaign_admission_standing IS
    'Per CAMPAIGN admission: is its campaign RUNNING and inside its window, is '
    'its work item in flight, when was the item''s current attempt claimed, '
    'and which is the admission''s first research run (ADR 0030 s13, P1-1). '
    'Exposes no URL, subject, campaign payload or count beyond runs: the root '
    'resolver refuses a CAMPAIGN admission outside its campaign with it.';

-- ONE run per CAMPAIGN admission, started only inside its campaign. A run is
-- written by the research role, which cannot read the acquisition tables:
-- the check reads the standing view above. Two racing starts serialise on a
-- transaction advisory lock keyed by the run scope. OWNER_REVIEWED
-- admissions (and ECHE runs) are untouched.
CREATE FUNCTION orgunit_research_run_campaign_admission_verify()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    s public.subject_research_campaign_admission_standing%ROWTYPE;
BEGIN
    IF NEW.root_scope = 'ECHE' THEN
        RETURN NEW;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('nwf-run-scope:' || NEW.root_scope, 0));
    SELECT * INTO s FROM public.subject_research_campaign_admission_standing
     WHERE 'subject_admission:' || admission_id::text = NEW.root_scope;
    IF NOT FOUND THEN
        RETURN NEW;  -- not a CAMPAIGN admission
    END IF;
    IF current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION USING ERRCODE = '25001',
            MESSAGE = 'orgunit_research_runs: a CAMPAIGN admission''s run requires READ COMMITTED';
    END IF;
    IF NOT (s.campaign_running AND s.campaign_window_open AND s.item_in_flight) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'orgunit_research_runs: a CAMPAIGN admission''s run starts only while its campaign runs and its work item is in flight';
    END IF;
    IF s.run_count > 0 THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'orgunit_research_runs: a CAMPAIGN admission has exactly one research run';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER orgunit_research_runs_campaign_admission_verify
    BEFORE INSERT ON orgunit_research_runs
    FOR EACH ROW EXECUTE FUNCTION orgunit_research_run_campaign_admission_verify();

-- ---------------------------------------------------------------------------
-- J. Grants: SELECT only.
-- ---------------------------------------------------------------------------

GRANT SELECT ON subject_research_campaign_admission_standing TO nwf_research;
GRANT SELECT ON subject_research_campaign_admission_standing TO nwf_readonly;
-- The derived spend counts the fetch observations of the worker's own CAMPAIGN
-- admissions: one column, read inside acquisition_campaign_spend only.
GRANT SELECT (root_subject_admission_id) ON orgunit_fetch_observations TO nwf_acquisition_worker;
