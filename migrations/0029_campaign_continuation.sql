-- Migration 0029 - R2: AN OWNER-SIGNED CAMPAIGN MAY CONTINUE THE STRANDED
-- NOMINATIONS OF A NAMED, STOPPED PREDECESSOR (ADR 0029 s12, ADR 0030 s14).
--
-- Migrations 0023-0028 are committed and are NOT edited. Every change below
-- is a new table, function or trigger, a widened CHECK, or a CREATE OR
-- REPLACE of a 0026 function whose body is restated in full with the change
-- marked.
--
-- THE PROBLEM (measured in production nwf_pe, campaign
-- nwf-nl-canary-2026-10-v1, signed maxWorkItems 100). A search produced 87
-- nominations; 72 passed de-duplication (outcome ADVANCED, next DEDUPLICATED)
-- but only 4 received a child before the signed work-item budget was spent.
-- 68 NOMINATED items are ADVANCED with NO child: stranded. A second campaign
-- could not reach them - a re-found URL creates no new nomination, and a
-- re-found domain is refused DUPLICATE_OF_EARLIER_NOMINATION - and a signed
-- budget cannot be raised in place.
--
-- THE DECISION. A NEW OWNER-signed campaign document
-- `nwf-pe.acquisition-campaign.v3` names ONE predecessor campaign and, in the
-- OWNER's priority order, the nominations it continues
-- (`scope.continuation`). The worker ADOPTS each eligible one, once: one
-- append-only row here (`acquisition_campaign_continuations`) plus one NEW
-- work item in the NEW campaign at stage NOMINATED for the SAME nomination,
-- with NO parent - it is never presented as the predecessor's child. The
-- adopted item then runs the UNCHANGED de-duplication handler and the rest of
-- the pipeline, and every unit of it is charged to the NEW campaign's signed
-- budgets through the unchanged triggers (work items, per-domain cap,
-- reservations, concurrency, window, attempts).
--
-- WHAT THE DATABASE ENFORCES on every adoption (section D), whatever role
-- inserts it:
--   - the adopting campaign's STORED, SIGNED document is a v3 document naming
--     this predecessor and listing this nomination at exactly this position
--     (the stored document IS the signed payload: migration 0023 proves it);
--   - predecessor <> campaign, both in the same environment;
--   - the predecessor's latest control event is STOP (an OWNER act; nothing
--     here lets the worker record one), and the adopting campaign is RUNNING
--     inside its window;
--   - the predecessor item is the predecessor's NOMINATED item for this
--     nomination, of source kind SEARCH_GRANT, whose latest outcome is
--     ADVANCED and which has NO child (children share their parent's
--     campaign: migration 0023's foreign key);
--   - GLOBALLY UNIQUE nomination, predecessor item and adopted item: a
--     nomination is adopted at most once, by at most one campaign, ever.
-- The adopted work item may only be inserted when its adoption row exists
-- (section E), and the adoption row's foreign key to that item is DEFERRED
-- to commit, so an adoption without its item - or an item without its
-- adoption - can never commit (crash-safe: a transaction that dies between
-- the two leaves nothing).
--
-- WHAT IS NOT ENFORCED HERE, AND WHY. The geography scope of an adopted
-- nomination needs the nomination's discovery run, which the worker role
-- cannot read (it holds SELECT on three nomination columns only, migration
-- 0024) - this migration widens NO read grant. The worker checks it before
-- adopting (readonly role, the same rule the de-duplication handler applies)
-- and the unchanged NOMINATED handler re-checks it (OUT_OF_SCOPE).
--
-- WHAT IT DOES NOT DO. No LOGIN, no new role, no UPDATE/DELETE/TRUNCATE
-- grant, no SECURITY DEFINER function, no contact, score, verdict or country
-- column, no merge of nominations and no rewrite of any existing row. Source
-- discovery, the nomination store, I0 admission and the cloud are untouched.

-- ---------------------------------------------------------------------------
-- A. The document version (v3), and the v2 link-out depth rule for v3.
-- ---------------------------------------------------------------------------

ALTER TABLE acquisition_campaigns DROP CONSTRAINT acquisition_campaigns_version_chk;
ALTER TABLE acquisition_campaigns DROP CONSTRAINT acquisition_campaigns_link_out_hops_chk;
ALTER TABLE acquisition_campaigns
    ADD CONSTRAINT acquisition_campaigns_version_chk
        CHECK (document_version IN ('nwf-pe.acquisition-campaign.v1',
                                    'nwf-pe.acquisition-campaign.v2',
                                    'nwf-pe.acquisition-campaign.v3')),
    ADD CONSTRAINT acquisition_campaigns_link_out_hops_chk
        CHECK ((document_version = 'nwf-pe.acquisition-campaign.v1' AND link_out_max_hops = 1)
            OR (document_version IN ('nwf-pe.acquisition-campaign.v2',
                                     'nwf-pe.acquisition-campaign.v3')
                AND link_out_max_hops BETWEEN 0 AND 3));

-- ---------------------------------------------------------------------------
-- B. A v3 campaign's signed continuation is well formed and names a real,
--    distinct predecessor of this environment. (0026's campaign rule, which
--    already checks every column against the signed document and reads a
--    v3 depth like a v2 one, is unchanged; this is a second trigger.)
-- ---------------------------------------------------------------------------

CREATE FUNCTION acquisition_campaign_continuation_document_verify()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    cont   jsonb := NEW.document #> '{scope,continuation}';
    ids    jsonb;
    pred   public.acquisition_campaigns%ROWTYPE;
BEGIN
    IF NEW.document_version IS DISTINCT FROM 'nwf-pe.acquisition-campaign.v3' THEN
        IF cont IS NOT NULL THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'acquisition_campaigns: only a v3 document carries a continuation';
        END IF;
        RETURN NEW;
    END IF;
    IF cont IS NULL OR jsonb_typeof(cont) <> 'object'
       OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(cont) k)
              IS DISTINCT FROM ARRAY['nominationIds', 'predecessorCampaignId']::text[]
       OR jsonb_typeof(cont -> 'predecessorCampaignId') <> 'string'
       OR (cont ->> 'predecessorCampaignId')
              !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR jsonb_typeof(cont -> 'nominationIds') <> 'array' THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_campaigns: CONTINUATION_MALFORMED';
    END IF;
    ids := cont -> 'nominationIds';
    IF jsonb_array_length(ids) NOT BETWEEN 1 AND 200
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(ids) e
                   WHERE jsonb_typeof(e) <> 'string'
                      OR (e #>> '{}')
                             !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
       OR (SELECT count(DISTINCT e) FROM jsonb_array_elements_text(ids) e)
              <> jsonb_array_length(ids) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_campaigns: CONTINUATION_MALFORMED (1..200 distinct nomination ids)';
    END IF;
    IF NOT ('SEARCH_GRANT' = ANY (NEW.source_kinds)) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_campaigns: CONTINUATION_REQUIRES_SEARCH_GRANT';
    END IF;
    SELECT * INTO pred FROM public.acquisition_campaigns
     WHERE id = (cont ->> 'predecessorCampaignId')::uuid;
    IF pred.id IS NULL OR pred.id = NEW.id OR pred.environment_id IS DISTINCT FROM NEW.environment_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_campaigns: CONTINUATION_PREDECESSOR_UNKNOWN (no other campaign of this environment)';
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION acquisition_campaign_continuation_document_verify() IS
    'A v3 campaign''s signed scope.continuation names an existing, different '
    'campaign of the same environment and 1..200 distinct nomination ids, and '
    'the campaign lists SEARCH_GRANT; v1/v2 carry none (ADR 0029 s12).';

CREATE TRIGGER acquisition_campaigns_verify_continuation
    BEFORE INSERT ON acquisition_campaigns
    FOR EACH ROW EXECUTE FUNCTION acquisition_campaign_continuation_document_verify();

-- ---------------------------------------------------------------------------
-- C. The adoption record.
-- ---------------------------------------------------------------------------

CREATE TABLE acquisition_campaign_continuations (
    id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id             uuid        NOT NULL REFERENCES acquisition_campaigns (id),
    predecessor_campaign_id uuid        NOT NULL REFERENCES acquisition_campaigns (id),
    predecessor_item_id     uuid        NOT NULL,
    -- The nomination is named by id, never copied; the trigger requires it to
    -- be the predecessor item's own subject (no foreign key into the
    -- source-discovery package, exactly as acquisition_work_items).
    nomination_id           uuid        NOT NULL,
    adopted_item_id         uuid        NOT NULL,
    list_position           integer     NOT NULL,
    created_at              timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT acquisition_continuations_distinct_chk
        CHECK (campaign_id <> predecessor_campaign_id),
    CONSTRAINT acquisition_continuations_position_chk
        CHECK (list_position BETWEEN 1 AND 200),
    CONSTRAINT acquisition_continuations_predecessor_item_fk
        FOREIGN KEY (predecessor_item_id, predecessor_campaign_id)
        REFERENCES acquisition_work_items (id, campaign_id),
    -- Deferred: the adoption row is written first, its item right after, in
    -- the SAME transaction; at commit both exist or neither does.
    CONSTRAINT acquisition_continuations_adopted_item_fk
        FOREIGN KEY (adopted_item_id, campaign_id)
        REFERENCES acquisition_work_items (id, campaign_id)
        DEFERRABLE INITIALLY DEFERRED
);

-- ONCE ONLY, ACROSS EVERY CAMPAIGN.
CREATE UNIQUE INDEX acquisition_continuations_nomination_uidx
    ON acquisition_campaign_continuations (nomination_id);
CREATE UNIQUE INDEX acquisition_continuations_predecessor_item_uidx
    ON acquisition_campaign_continuations (predecessor_item_id);
CREATE UNIQUE INDEX acquisition_continuations_adopted_item_uidx
    ON acquisition_campaign_continuations (adopted_item_id);
CREATE UNIQUE INDEX acquisition_continuations_position_uidx
    ON acquisition_campaign_continuations (campaign_id, list_position);

COMMENT ON TABLE acquisition_campaign_continuations IS
    'ONE ADOPTION: a v3 campaign continues ONE stranded nomination of its '
    'signed, STOPPED predecessor - a NOMINATED item there that was ADVANCED '
    'past de-duplication but never received a child. The adopted item is a NEW '
    'work item of THIS campaign with no parent (never the predecessor''s '
    'child), charged to THIS campaign''s signed budgets. A nomination, a '
    'predecessor item and an adopted item each appear at most once, across '
    'every campaign. The nomination, its evidence and its dedupe identity are '
    'untouched: nothing is merged. Append-only (trigger-enforced).';

COMMENT ON COLUMN acquisition_campaign_continuations.list_position IS
    'The 1-based position of the nomination in the adopting campaign''s SIGNED '
    'continuation list: the OWNER''s priority order (1 first). It orders WORK '
    '(the scheduler''s tie-break between never-served domains), never an '
    'organisation.';

-- ---------------------------------------------------------------------------
-- D. Every adoption is checked against the SIGNED document and the stored
--    state of both campaigns.
-- ---------------------------------------------------------------------------

CREATE FUNCTION acquisition_campaign_continuation_verify_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    c          public.acquisition_campaigns%ROWTYPE;
    p          public.acquisition_campaigns%ROWTYPE;
    pi         public.acquisition_work_items%ROWTYPE;
    pos        bigint;
    latest_out text;
BEGIN
    PERFORM pg_advisory_xact_lock(acquisition_campaign_lock_key(NEW.campaign_id));
    SELECT * INTO c FROM public.acquisition_campaigns WHERE id = NEW.campaign_id;
    SELECT * INTO p FROM public.acquisition_campaigns WHERE id = NEW.predecessor_campaign_id;

    IF c.document_version IS DISTINCT FROM 'nwf-pe.acquisition-campaign.v3'
       OR (c.document #>> '{scope,continuation,predecessorCampaignId}')
              IS DISTINCT FROM NEW.predecessor_campaign_id::text THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_campaign_continuations: CONTINUATION_NOT_SIGNED (the campaign''s signed document names no such predecessor)';
    END IF;
    SELECT x.ord INTO pos
      FROM jsonb_array_elements_text(c.document #> '{scope,continuation,nominationIds}')
           WITH ORDINALITY AS x(v, ord)
     WHERE x.v = NEW.nomination_id::text;
    IF pos IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_campaign_continuations: NOT_LISTED (the signed continuation does not list the nomination)';
    END IF;
    IF NEW.list_position IS DISTINCT FROM pos THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_campaign_continuations: list_position is not the nomination''s signed position';
    END IF;
    IF p.id IS NULL OR p.id = c.id OR p.environment_id IS DISTINCT FROM c.environment_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_campaign_continuations: the predecessor is not another campaign of this environment';
    END IF;
    -- The predecessor is STOPPED - by the OWNER: no runtime role records a control event.
    IF acquisition_campaign_control_state(p.id) IS DISTINCT FROM 'STOPPED' THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_campaign_continuations: PREDECESSOR_NOT_STOPPED';
    END IF;
    IF acquisition_campaign_control_state(c.id) IS DISTINCT FROM 'RUNNING'
       OR NOT (clock_timestamp() >= c.starts_at AND clock_timestamp() < c.ends_at) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_campaign_continuations: CAMPAIGN_NOT_RUNNING (adoption needs a RUNNING campaign inside its window)';
    END IF;

    SELECT * INTO pi FROM public.acquisition_work_items WHERE id = NEW.predecessor_item_id;
    IF pi.campaign_id IS DISTINCT FROM p.id
       OR pi.stage IS DISTINCT FROM 'NOMINATED'
       OR pi.subject_kind IS DISTINCT FROM 'NOMINATION'
       OR pi.subject_id IS DISTINCT FROM NEW.nomination_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_campaign_continuations: NOT_A_PREDECESSOR_NOMINATION';
    END IF;
    IF pi.source_kind IS DISTINCT FROM 'SEARCH_GRANT' THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_campaign_continuations: SOURCE_KIND_NOT_SEARCH_GRANT';
    END IF;
    SELECT o.outcome INTO latest_out
      FROM public.acquisition_work_claims cl
      LEFT JOIN public.acquisition_work_outcomes o ON o.claim_id = cl.id
     WHERE cl.work_item_id = pi.id
     ORDER BY cl.attempt_no DESC
     LIMIT 1;
    IF latest_out IS DISTINCT FROM 'ADVANCED' THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_campaign_continuations: NOT_ADVANCED (the predecessor item did not pass de-duplication)';
    END IF;
    IF EXISTS (SELECT 1 FROM public.acquisition_work_items w WHERE w.parent_item_id = pi.id) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_campaign_continuations: HAS_CHILD (the predecessor item is not stranded)';
    END IF;
    IF EXISTS (SELECT 1 FROM public.acquisition_work_items w WHERE w.id = NEW.adopted_item_id) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_campaign_continuations: adopted_item_id must name the item inserted after this row';
    END IF;
    IF NEW.created_at IS DISTINCT FROM now() THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_campaign_continuations: created_at must be the database clock';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER acquisition_campaign_continuations_verify
    BEFORE INSERT ON acquisition_campaign_continuations
    FOR EACH ROW EXECUTE FUNCTION acquisition_campaign_continuation_verify_insert();

-- ---------------------------------------------------------------------------
-- E. The adopted item: a parentless NOMINATED item exists ONLY as the item
--    its adoption row names. 0023's root CHECK is widened by exactly that
--    shape, and 0026's work-item rule is restated with the check marked.
-- ---------------------------------------------------------------------------

ALTER TABLE acquisition_work_items DROP CONSTRAINT acquisition_work_items_root_chk;
ALTER TABLE acquisition_work_items
    ADD CONSTRAINT acquisition_work_items_root_chk
        CHECK ((parent_item_id IS NULL) = (stage = 'DISCOVERED')
            OR (parent_item_id IS NULL AND stage = 'NOMINATED'
                AND subject_kind = 'NOMINATION' AND source_kind = 'SEARCH_GRANT'));

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

    -- 0029: an item an adoption row names is exactly that adoption's
    -- parentless NOMINATED item - nothing else may borrow its id.
    IF EXISTS (SELECT 1 FROM public.acquisition_campaign_continuations a
                WHERE a.adopted_item_id = NEW.id)
       AND NOT (NEW.parent_item_id IS NULL AND NEW.stage = 'NOMINATED') THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_work_items: an adopted item is a parentless NOMINATED item';
    END IF;

    IF NEW.parent_item_id IS NULL THEN
        IF state IN ('STOPPED') OR clock_timestamp() >= c.ends_at THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'acquisition_work_items: CAMPAIGN_CLOSED (no new root)';
        END IF;
        IF NEW.stage = 'NOMINATED' THEN
            -- 0029: a CONTINUATION item - only as named by this campaign's
            -- adoption row (written first, in this transaction), for the
            -- same nomination, domain and source kind as the predecessor's.
            IF NOT EXISTS (SELECT 1
                             FROM public.acquisition_campaign_continuations a
                             JOIN public.acquisition_work_items p ON p.id = a.predecessor_item_id
                            WHERE a.adopted_item_id = NEW.id
                              AND a.campaign_id = NEW.campaign_id
                              AND a.nomination_id = NEW.subject_id
                              AND NEW.subject_kind = 'NOMINATION'
                              AND p.registrable_domain IS NOT DISTINCT FROM NEW.registrable_domain
                              AND p.source_kind = NEW.source_kind) THEN
                RAISE EXCEPTION USING ERRCODE = '23514',
                    MESSAGE = 'acquisition_work_items: a parentless NOMINATED item needs its adoption row (CONTINUATION_NOT_ADOPTED)';
            END IF;
        ELSIF NEW.subject_kind = 'SEARCH_GRANT' AND NOT (NEW.subject_id = ANY (c.search_grant_ids)) THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'acquisition_work_items: search grant not listed by the signed campaign';
        ELSIF NEW.subject_kind <> 'SEARCH_GRANT' AND NOT acquisition_is_owner_path() THEN
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

-- ---------------------------------------------------------------------------
-- F. Append-only for every role, READ COMMITTED only (0026 A).
-- ---------------------------------------------------------------------------

CREATE TRIGGER acquisition_campaign_continuations_append_only
    BEFORE UPDATE OR DELETE ON acquisition_campaign_continuations
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation();
CREATE TRIGGER a_snapshot_isolation_guard BEFORE INSERT ON acquisition_campaign_continuations
    FOR EACH ROW EXECUTE FUNCTION acquisition_refuse_snapshot_isolation();

-- ---------------------------------------------------------------------------
-- G. Grants: SELECT + INSERT for the worker, SELECT for audit. Nothing else.
-- ---------------------------------------------------------------------------

REVOKE ALL ON acquisition_campaign_continuations
    FROM PUBLIC, nwf_ingest, nwf_research, nwf_classifier, nwf_readonly,
         nwf_discovery_subject_writer, nwf_discovery_subject_reviewer, nwf_source_discovery;

GRANT SELECT, INSERT ON acquisition_campaign_continuations TO nwf_acquisition_worker;
GRANT SELECT ON acquisition_campaign_continuations TO nwf_readonly;
