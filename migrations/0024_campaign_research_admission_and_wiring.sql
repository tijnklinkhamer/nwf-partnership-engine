-- Migration 0024 - WW E-W: CAMPAIGN RESEARCH ADMISSION AND THE ACQUISITION
-- WIRING RECORDS (ADR 0030, Proposed).
--
-- Migration 0023 gave an OWNER-signed campaign a queue and a worker, but no
-- stage could be performed by it: research still needed an OWNER-signed
-- per-subject review AND a per-subject OWNER admission (ADR 0023/0025). This
-- migration adds the NARROWEST admission basis that lets a campaign research
-- the subjects it proposed itself, plus the append-only records the wiring
-- needs to stay idempotent and auditable - and nothing that grants authority
-- by itself:
--
--   A. `acquisition_campaign_subjects` - "this discovery subject was proposed
--      INSIDE campaign C from nomination N by work item W". A binding, never
--      an identity confirmation.
--   B. `subject_research_admissions` gains an `admission_basis`:
--      OWNER_REVIEWED (every existing row, unchanged) or CAMPAIGN, under its
--      own policy version `subject-research-admission-policy-campaign-v1`. A
--      CAMPAIGN admission is bound by foreign key to the 0023 campaign row
--      and to the RESEARCH_PENDING work item it was made for, and the
--      database checks every fact it CAN check: the campaign is RUNNING and
--      inside its window, lists RESEARCH_PENDING, the item is in flight, the
--      subject was proposed inside THIS campaign, the root is https on the
--      nominated registrable domain, the campaign's research-root budget is
--      not spent, and no other live campaign admission exists for the
--      subject. The OWNER signature itself is verified in code
--      (`deriveCampaignAuthority`) - the database cannot verify Ed25519.
--   C. `acquisition_signals` - a duplicate or large-HEI RELATIONSHIP SIGNAL
--      recorded when a nomination is refused or deprioritised. A signal is
--      never a merge and never a verdict.
--   D. `acquisition_outbox_entries` - one row per outbox file set written
--      (`nwf-pe.acquisition-outbox.v1`): digests only, never content.
--   FOREIGN KEYS stay inside this package (campaigns, work items), exactly
--   as 0023 keeps `search_grant_ids` plain: the subject and nomination ids
--   are plain uuids checked by the triggers and the handlers, so no other
--   package's tables gain a dependant and their cleanup is unchanged.
--   E. The 0023 work-item trigger is re-created with ONE extra rule: a
--      LINK_OUT root may be enqueued by the WORKER (not only the owner path)
--      when the signed campaign lists LINK_OUT and the root is a research run
--      of one of THIS campaign's own CAMPAIGN admissions. SEED roots stay
--      owner-path only. Nothing else in the function changes.
--
-- WHAT IT DOES NOT DO. No contact column, no score, no relevance, no ranking
-- of organisations, no country on any row, no UPDATE or DELETE grant to
-- anyone, no SECURITY DEFINER function, no LOGIN, no change to the identity
-- review path: identity review stays a per-subject OWNER-signed act (ADR
-- 0023), and a CAMPAIGN admission confirms nothing about identity.

-- ---------------------------------------------------------------------------
-- 0. One shared predicate: is this work item's latest attempt in flight?
-- ---------------------------------------------------------------------------

CREATE FUNCTION acquisition_item_in_flight(item uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(
        (SELECT o.id IS NULL AND cl.lease_expires_at > now()
           FROM acquisition_work_claims cl
           LEFT JOIN acquisition_work_outcomes o ON o.claim_id = cl.id
          WHERE cl.work_item_id = item
          ORDER BY cl.attempt_no DESC
          LIMIT 1),
        false)
$$;

COMMENT ON FUNCTION acquisition_item_in_flight(uuid) IS
    'True when the work item''s latest claim has a live lease and no outcome: '
    'the only moment a stage handler may append a wiring record for it.';

-- ---------------------------------------------------------------------------
-- A. The campaign subject binding.
-- ---------------------------------------------------------------------------

CREATE TABLE acquisition_campaign_subjects (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id        uuid        NOT NULL REFERENCES acquisition_campaigns (id),
    work_item_id       uuid        NOT NULL,
    nomination_id      uuid        NOT NULL,
    subject_id         uuid        NOT NULL,
    registrable_domain text        NOT NULL,
    nominated_url      text        NOT NULL,
    actor_key          text        NOT NULL,
    recorded_at        timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT acquisition_campaign_subjects_item_fk
        FOREIGN KEY (work_item_id, campaign_id)
        REFERENCES acquisition_work_items (id, campaign_id),
    CONSTRAINT acquisition_campaign_subjects_domain_chk
        CHECK (registrable_domain ~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+([a-z]{2,63}|xn--[a-z0-9-]{1,59})$'),
    CONSTRAINT acquisition_campaign_subjects_url_chk
        CHECK (nominated_url ~ '^https?://' AND length(nominated_url) <= 2048),
    CONSTRAINT acquisition_campaign_subjects_actor_key_chk
        CHECK (actor_key ~ '^[a-z0-9][a-z0-9_-]{2,63}$')
);

CREATE UNIQUE INDEX acquisition_campaign_subjects_subject_uidx
    ON acquisition_campaign_subjects (campaign_id, subject_id);
CREATE UNIQUE INDEX acquisition_campaign_subjects_nomination_uidx
    ON acquisition_campaign_subjects (campaign_id, nomination_id);

COMMENT ON TABLE acquisition_campaign_subjects IS
    'ONE DISCOVERY SUBJECT PROPOSED INSIDE ONE CAMPAIGN, from one nomination, '
    'by one DEDUPLICATED work item (ADR 0030). A binding of PROVENANCE: it says '
    'the campaign proposed the subject, never that the subject is who the '
    'evidence says it is (identity review stays a per-subject OWNER act). '
    'Append-only (trigger-enforced).';

CREATE FUNCTION acquisition_campaign_subject_verify_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    item acquisition_work_items%ROWTYPE;
BEGIN
    PERFORM pg_advisory_xact_lock(acquisition_item_lock_key(NEW.work_item_id));
    SELECT * INTO item FROM acquisition_work_items WHERE id = NEW.work_item_id;
    IF item.stage IS DISTINCT FROM 'DEDUPLICATED'
       OR item.subject_kind IS DISTINCT FROM 'NOMINATION'
       OR item.subject_id IS DISTINCT FROM NEW.nomination_id
       OR item.registrable_domain IS DISTINCT FROM NEW.registrable_domain THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_campaign_subjects: not this campaign''s DEDUPLICATED item for the nomination';
    END IF;
    IF NOT acquisition_item_in_flight(NEW.work_item_id) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_campaign_subjects: the work item has no in-flight claim';
    END IF;
    IF acquisition_campaign_control_state(NEW.campaign_id) = 'EMERGENCY_STOPPED' THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_campaign_subjects: the campaign is emergency stopped';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM source_discovery_nominations n
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

CREATE TRIGGER acquisition_campaign_subjects_verify
    BEFORE INSERT ON acquisition_campaign_subjects
    FOR EACH ROW EXECUTE FUNCTION acquisition_campaign_subject_verify_insert();

-- ---------------------------------------------------------------------------
-- B. The CAMPAIGN admission basis on subject_research_admissions.
-- ---------------------------------------------------------------------------

ALTER TABLE subject_research_admissions
    ADD COLUMN admission_basis       text NOT NULL DEFAULT 'OWNER_REVIEWED',
    ADD COLUMN campaign_id           uuid REFERENCES acquisition_campaigns (id),
    ADD COLUMN campaign_work_item_id uuid;

ALTER TABLE subject_research_admissions
    ADD CONSTRAINT subject_research_admissions_campaign_item_fk
        FOREIGN KEY (campaign_work_item_id, campaign_id)
        REFERENCES acquisition_work_items (id, campaign_id);

-- The 0017 policy CHECK named exactly one version; the basis decides which.
ALTER TABLE subject_research_admissions
    DROP CONSTRAINT subject_research_admissions_policy_version_chk;
ALTER TABLE subject_research_admissions
    ADD CONSTRAINT subject_research_admissions_policy_version_chk
        CHECK ((admission_basis = 'OWNER_REVIEWED'
                    AND policy_version = 'subject-research-admission-policy-v1'
                    AND campaign_id IS NULL AND campaign_work_item_id IS NULL)
            OR (admission_basis = 'CAMPAIGN'
                    AND policy_version = 'subject-research-admission-policy-campaign-v1'
                    AND campaign_id IS NOT NULL AND campaign_work_item_id IS NOT NULL
                    -- A campaign admission is short-lived: at most one day.
                    AND validity_seconds <= 86400));

CREATE INDEX subject_research_admissions_campaign_idx
    ON subject_research_admissions (campaign_id, subject_id) WHERE campaign_id IS NOT NULL;

COMMENT ON COLUMN subject_research_admissions.admission_basis IS
    'OWNER_REVIEWED: an OWNER-path admission of a subject whose identity an '
    'OWNER-signed review CONFIRMED (ADR 0025, policy v1; every pre-0024 row). '
    'CAMPAIGN: a bounded first-party research admission of a subject proposed '
    'inside the referenced OWNER-signed campaign (ADR 0030, policy campaign-v1). '
    'A CAMPAIGN admission confirms NOTHING about identity; its '
    'identity_authority_scope names the trust scope the CAMPAIGN signature was '
    'verified under (TEST_ONLY is refused outside vitest, as before).';
COMMENT ON COLUMN subject_research_admissions.campaign_id IS
    'The OWNER-signed campaign a CAMPAIGN admission rests on; NULL for OWNER_REVIEWED.';
COMMENT ON COLUMN subject_research_admissions.campaign_work_item_id IS
    'The RESEARCH_PENDING work item a CAMPAIGN admission was made for; NULL for OWNER_REVIEWED.';

CREATE FUNCTION subject_research_admission_campaign_verify()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    c       acquisition_campaigns%ROWTYPE;
    item    acquisition_work_items%ROWTYPE;
    host    text;
    used    integer;
BEGIN
    IF NEW.admission_basis IS DISTINCT FROM 'CAMPAIGN' THEN
        -- Only the owner path records an OWNER_REVIEWED admission (0017 grants
        -- INSERT to no runtime role; 0024 grants the worker INSERT for CAMPAIGN only).
        IF NOT acquisition_is_owner_path() THEN
            RAISE EXCEPTION USING ERRCODE = '42501',
                MESSAGE = 'subject_research_admissions: only the owner path may record an OWNER_REVIEWED admission';
        END IF;
        RETURN NEW;
    END IF;

    PERFORM pg_advisory_xact_lock(acquisition_campaign_lock_key(NEW.campaign_id));
    SELECT * INTO c FROM acquisition_campaigns WHERE id = NEW.campaign_id;
    SELECT * INTO item FROM acquisition_work_items WHERE id = NEW.campaign_work_item_id;

    IF acquisition_campaign_control_state(NEW.campaign_id) <> 'RUNNING' THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'subject_research_admissions: CAMPAIGN basis needs a RUNNING campaign';
    END IF;
    IF NOT (now() >= c.starts_at AND now() < c.ends_at) THEN
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
    IF NOT EXISTS (SELECT 1 FROM acquisition_campaign_subjects s
                    WHERE s.campaign_id = NEW.campaign_id
                      AND s.subject_id = NEW.subject_id
                      AND s.registrable_domain = item.registrable_domain) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'subject_research_admissions: the subject was not proposed inside this campaign';
    END IF;

    -- The root: https only, on the nominated registrable domain (the host IS
    -- that domain or a subdomain of it). Service hosts are refused in code
    -- (hostPolicy) and again by the gateway before DNS.
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

    -- The research-root budget: every CAMPAIGN admission counts, live or not.
    SELECT count(*) INTO used FROM subject_research_admissions
     WHERE campaign_id = NEW.campaign_id AND admission_basis = 'CAMPAIGN';
    IF used >= c.max_research_roots THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'subject_research_admissions: RESEARCH_ROOT_BUDGET_EXHAUSTED';
    END IF;
    IF EXISTS (SELECT 1 FROM subject_research_admissions a
                WHERE a.subject_id = NEW.subject_id
                  AND a.expires_at > clock_timestamp()
                  AND NOT EXISTS (SELECT 1 FROM subject_research_admission_revocations v
                                   WHERE v.admission_id = a.id)) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'subject_research_admissions: the subject already holds a live admission';
    END IF;
    RETURN NEW;
END;
$$;

-- Fires before the 0017 stamp trigger (triggers fire in name order).
CREATE TRIGGER subject_research_admissions_campaign_verify
    BEFORE INSERT ON subject_research_admissions
    FOR EACH ROW EXECUTE FUNCTION subject_research_admission_campaign_verify();

-- ---------------------------------------------------------------------------
-- C. Relationship signals: a duplicate is refused with a NAMED signal, never merged.
-- ---------------------------------------------------------------------------

CREATE TABLE acquisition_signals (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id        uuid        NOT NULL REFERENCES acquisition_campaigns (id),
    work_item_id       uuid        NOT NULL,
    nomination_id      uuid,
    registrable_domain text        NOT NULL,
    signal_kind        text        NOT NULL,
    related_kind       text,
    related_id         uuid,
    actor_key          text        NOT NULL,
    recorded_at        timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT acquisition_signals_item_fk
        FOREIGN KEY (work_item_id, campaign_id)
        REFERENCES acquisition_work_items (id, campaign_id),
    CONSTRAINT acquisition_signals_kind_chk
        CHECK (signal_kind IN ('DUPLICATE_OF_WEBSITE_CLAIM', 'DUPLICATE_OF_DISCOVERY_SUBJECT',
                               'DUPLICATE_OF_EARLIER_NOMINATION', 'DUPLICATE_OF_PLAN_EXCLUSION',
                               'LARGE_HEI_TAGGED')),
    CONSTRAINT acquisition_signals_related_chk
        CHECK ((related_kind IS NULL AND related_id IS NULL)
            OR (related_kind IN ('WEBSITE_CLAIM', 'DISCOVERY_SUBJECT', 'NOMINATION')
                AND related_id IS NOT NULL)),
    CONSTRAINT acquisition_signals_domain_chk
        CHECK (registrable_domain ~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+([a-z]{2,63}|xn--[a-z0-9-]{1,59})$'),
    CONSTRAINT acquisition_signals_actor_key_chk
        CHECK (actor_key ~ '^[a-z0-9][a-z0-9_-]{2,63}$')
);

CREATE UNIQUE INDEX acquisition_signals_item_kind_uidx
    ON acquisition_signals (work_item_id, signal_kind);
CREATE INDEX acquisition_signals_campaign_idx
    ON acquisition_signals (campaign_id, signal_kind, registrable_domain);

COMMENT ON TABLE acquisition_signals IS
    'A RELATIONSHIP SIGNAL recorded by a campaign stage: a refused duplicate '
    '(of a website claim, a discovery subject, an earlier nomination or the '
    'plan''s own exclusion set) or a large higher-education tag that '
    'DEPRIORITISES the domain''s later work (scheduled only when nothing else '
    'is claimable) and never drops it. Never a merge, never a verdict, never a '
    'score. Append-only (trigger-enforced).';

CREATE FUNCTION acquisition_signal_verify_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM acquisition_work_items i
                    WHERE i.id = NEW.work_item_id
                      AND i.campaign_id = NEW.campaign_id
                      AND i.registrable_domain = NEW.registrable_domain) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_signals: not this campaign''s work item for the domain';
    END IF;
    IF NOT acquisition_item_in_flight(NEW.work_item_id) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_signals: the work item has no in-flight claim';
    END IF;
    IF NEW.recorded_at IS DISTINCT FROM now() THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_signals: recorded_at must be the database clock';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER acquisition_signals_verify
    BEFORE INSERT ON acquisition_signals
    FOR EACH ROW EXECUTE FUNCTION acquisition_signal_verify_insert();

-- ---------------------------------------------------------------------------
-- D. Outbox entries: digests of what was written, never content.
-- ---------------------------------------------------------------------------

CREATE TABLE acquisition_outbox_entries (
    id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id            uuid        NOT NULL REFERENCES acquisition_campaigns (id),
    work_item_id           uuid        NOT NULL,
    subject_id             uuid        NOT NULL,
    entry_kind             text        NOT NULL,
    outbox_format          text        NOT NULL,
    export_v2_sha256       text        NOT NULL,
    subject_facts_sha256   text        NOT NULL,
    actor_key              text        NOT NULL,
    recorded_at            timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT acquisition_outbox_entries_item_fk
        FOREIGN KEY (work_item_id, campaign_id)
        REFERENCES acquisition_work_items (id, campaign_id),
    CONSTRAINT acquisition_outbox_entries_kind_chk
        CHECK (entry_kind IN ('RESEARCH_EXPORT', 'ASSESSABLE_MANIFEST')),
    CONSTRAINT acquisition_outbox_entries_format_chk
        CHECK (outbox_format = 'nwf-pe.acquisition-outbox.v1'),
    CONSTRAINT acquisition_outbox_entries_digests_chk
        CHECK (export_v2_sha256 ~ '^[0-9a-f]{64}$' AND subject_facts_sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT acquisition_outbox_entries_actor_key_chk
        CHECK (actor_key ~ '^[a-z0-9][a-z0-9_-]{2,63}$')
);

CREATE UNIQUE INDEX acquisition_outbox_entries_item_uidx
    ON acquisition_outbox_entries (work_item_id, entry_kind);
CREATE INDEX acquisition_outbox_entries_campaign_idx
    ON acquisition_outbox_entries (campaign_id, entry_kind, recorded_at);

COMMENT ON TABLE acquisition_outbox_entries IS
    'ONE OUTBOX WRITE of a campaign (nwf-pe.acquisition-outbox.v1): the '
    'RESEARCHED stage''s export pair (qualification-input export v2 and '
    'subject-facts export v1) or the ASSESSABLE stage''s manifest line. Holds '
    'the SHA-256 of each file, never its content. Append-only (trigger-enforced).';

CREATE FUNCTION acquisition_outbox_entry_verify_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    item acquisition_work_items%ROWTYPE;
BEGIN
    SELECT * INTO item FROM acquisition_work_items WHERE id = NEW.work_item_id;
    IF item.subject_kind IS DISTINCT FROM 'DISCOVERY_SUBJECT'
       OR item.subject_id IS DISTINCT FROM NEW.subject_id
       OR NOT ((NEW.entry_kind = 'RESEARCH_EXPORT' AND item.stage = 'RESEARCHED')
            OR (NEW.entry_kind = 'ASSESSABLE_MANIFEST' AND item.stage = 'ASSESSABLE')) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_outbox_entries: the entry does not match its work item''s stage and subject';
    END IF;
    IF NOT acquisition_item_in_flight(NEW.work_item_id) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_outbox_entries: the work item has no in-flight claim';
    END IF;
    IF NEW.recorded_at IS DISTINCT FROM now() THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_outbox_entries: recorded_at must be the database clock';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER acquisition_outbox_entries_verify
    BEFORE INSERT ON acquisition_outbox_entries
    FOR EACH ROW EXECUTE FUNCTION acquisition_outbox_entry_verify_insert();

-- ---------------------------------------------------------------------------
-- E. The 0023 work-item rule, with exactly one widening: a campaign-listed
--    LINK_OUT root from this campaign's own campaign-admitted research run.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION acquisition_work_item_verify_insert()
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
            -- 0024 (ADR 0030): the ONE non-owner exception - a LINK_OUT root
            -- (the source kind is listed, checked above) naming a research run
            -- of one of THIS campaign's own CAMPAIGN admissions. SEED roots,
            -- and any other link-out root, stay owner-path only.
            IF NOT (NEW.source_kind = 'LINK_OUT' AND NEW.subject_kind = 'RESEARCH_RUN'
                    AND EXISTS (SELECT 1
                                  FROM orgunit_research_runs r
                                  JOIN subject_research_admissions a
                                    ON r.root_scope = 'subject_admission:' || a.id::text
                                 WHERE r.id = NEW.subject_id
                                   AND a.admission_basis = 'CAMPAIGN'
                                   AND a.campaign_id = NEW.campaign_id)) THEN
                RAISE EXCEPTION USING ERRCODE = '42501',
                    MESSAGE = 'acquisition_work_items: only the owner path may seed a link-out or seed-list root';
            END IF;
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

-- ---------------------------------------------------------------------------
-- F. Append-only, for every role including the owner (0013's function).
-- ---------------------------------------------------------------------------

CREATE TRIGGER acquisition_campaign_subjects_append_only
    BEFORE UPDATE OR DELETE ON acquisition_campaign_subjects
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation();
CREATE TRIGGER acquisition_signals_append_only
    BEFORE UPDATE OR DELETE ON acquisition_signals
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation();
CREATE TRIGGER acquisition_outbox_entries_append_only
    BEFORE UPDATE OR DELETE ON acquisition_outbox_entries
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation();

-- ---------------------------------------------------------------------------
-- G. Grants: SELECT + INSERT for the worker on its own records and on CAMPAIGN
--    admissions (the trigger above refuses any other basis from it), and the
--    column reads its triggers need. SELECT for audit. Nothing mutating.
-- ---------------------------------------------------------------------------

REVOKE ALL ON acquisition_campaign_subjects, acquisition_signals, acquisition_outbox_entries
    FROM PUBLIC, nwf_ingest, nwf_research, nwf_classifier,
         nwf_discovery_subject_writer, nwf_discovery_subject_reviewer, nwf_source_discovery;

GRANT SELECT, INSERT ON acquisition_campaign_subjects, acquisition_signals,
                        acquisition_outbox_entries
    TO nwf_acquisition_worker;
GRANT SELECT, INSERT ON subject_research_admissions TO nwf_acquisition_worker;
GRANT SELECT ON subject_research_admission_revocations TO nwf_acquisition_worker;
GRANT SELECT (id, root_scope) ON orgunit_research_runs TO nwf_acquisition_worker;
GRANT SELECT (id, url, registrable_domain) ON source_discovery_nominations
    TO nwf_acquisition_worker;

GRANT SELECT ON acquisition_campaign_subjects, acquisition_signals, acquisition_outbox_entries
    TO nwf_readonly;

-- ===========================================================================
-- PART II - REVIEW FIXES TO THE 0023 QUEUE (independent review, 2026-10-27).
-- All acquisition SQL lives in this one migration (0025 is reserved).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- H. Pinned search_path (P2-2). Every acquisition function resolves names in
--    public first and pg_temp LAST, so a temporary table can never shadow a
--    campaign, a claim or the owner-path lookup.
-- ---------------------------------------------------------------------------

ALTER FUNCTION acquisition_stage_ordinal(text) SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION acquisition_campaign_lock_key(uuid) SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION acquisition_item_lock_key(uuid) SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION acquisition_campaign_verify_insert() SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION acquisition_campaign_control_state(uuid) SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION acquisition_work_item_verify_insert() SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION acquisition_item_in_flight(uuid) SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION acquisition_campaign_subject_verify_insert() SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION subject_research_admission_campaign_verify() SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION acquisition_signal_verify_insert() SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION acquisition_outbox_entry_verify_insert() SET search_path = public, pg_catalog, pg_temp;

-- The owner-path test names its table by SCHEMA, not through the search path.
CREATE OR REPLACE FUNCTION acquisition_is_owner_path()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog, pg_temp
AS $$
    SELECT current_user::text = pg_catalog.pg_get_userbyid(c.relowner)::text
      FROM pg_catalog.pg_class c
     WHERE c.oid = 'public.acquisition_campaigns'::regclass
$$;

-- ---------------------------------------------------------------------------
-- I. Budget reservations (P1-4). A claim RESERVES what its stage may spend,
--    under the campaign lock; the database refuses a claim whose reservation
--    does not fit the signed budget. A claim WITHOUT an outcome (live,
--    crashed, expired or superseded) counts its full reservation as spent; an
--    outcome replaces the reservation with what was reported, and may never
--    report more than was reserved. So every resource is bounded by the
--    signed budget whatever any process does.
-- ---------------------------------------------------------------------------

ALTER TABLE acquisition_work_claims
    ADD COLUMN reserved_search_runs      integer NOT NULL DEFAULT 0,
    ADD COLUMN reserved_research_roots   integer NOT NULL DEFAULT 0,
    ADD COLUMN reserved_gateway_requests integer NOT NULL DEFAULT 0,
    ADD CONSTRAINT acquisition_work_claims_reservation_chk
        CHECK (reserved_search_runs BETWEEN 0 AND 100
               AND reserved_research_roots BETWEEN 0 AND 100
               AND reserved_gateway_requests BETWEEN 0 AND 10000);

COMMENT ON COLUMN acquisition_work_claims.reserved_gateway_requests IS
    'What this attempt may spend, reserved at claim time (ADR 0030): a search '
    'run for a search-grant discovery task; one research root and 60 gateway '
    'requests (the frozen per-root bound, MAX_TOTAL_REQUESTS_PER_ROOT) for '
    'RESEARCH_PENDING; nothing otherwise. Counted as spent until an outcome '
    'reports the actual spend.';

-- The DERIVED spend of a campaign: reported consumption for claims with an
-- outcome, the full reservation for every claim without one.
CREATE FUNCTION acquisition_campaign_spend(campaign uuid,
                                           OUT search_runs integer,
                                           OUT research_roots integer,
                                           OUT gateway_requests integer)
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog, pg_temp
AS $$
    SELECT COALESCE(sum(CASE WHEN o.id IS NULL THEN cl.reserved_search_runs
                             ELSE o.search_runs_consumed END), 0)::integer,
           COALESCE(sum(CASE WHEN o.id IS NULL THEN cl.reserved_research_roots
                             ELSE o.research_roots_consumed END), 0)::integer,
           COALESCE(sum(CASE WHEN o.id IS NULL THEN cl.reserved_gateway_requests
                             ELSE o.gateway_requests_consumed END), 0)::integer
      FROM public.acquisition_work_claims cl
      LEFT JOIN public.acquisition_work_outcomes o ON o.claim_id = cl.id
     WHERE cl.campaign_id = campaign
$$;

-- ---------------------------------------------------------------------------
-- J. Lease heartbeats (P1-4). A claim's lease can be EXTENDED by appending a
--    row while its attempt is live, so a long stage is never re-claimed while
--    it still runs; an extension is refused once the lease has lapsed (the
--    worker then aborts the handler). A claim's total lease is capped at six
--    hours from its claim.
-- ---------------------------------------------------------------------------

CREATE TABLE acquisition_claim_lease_extensions (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id       uuid        NOT NULL,
    work_item_id   uuid        NOT NULL,
    extended_until timestamptz NOT NULL,
    worker_id      text        NOT NULL,
    recorded_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT acquisition_lease_extensions_claim_fk
        FOREIGN KEY (claim_id, work_item_id)
        REFERENCES acquisition_work_claims (id, work_item_id),
    CONSTRAINT acquisition_lease_extensions_worker_chk
        CHECK (worker_id ~ '^[a-z0-9][a-z0-9_.:-]{2,63}$')
);

CREATE INDEX acquisition_lease_extensions_claim_idx
    ON acquisition_claim_lease_extensions (claim_id, extended_until);

COMMENT ON TABLE acquisition_claim_lease_extensions IS
    'ONE LEASE HEARTBEAT of one live claim (ADR 0030): the effective lease is '
    'the latest of the claim''s own lease and its extensions. Append-only '
    '(trigger-enforced).';

CREATE FUNCTION acquisition_claim_lease_until(claim uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog, pg_temp
AS $$
    SELECT GREATEST(cl.lease_expires_at,
                    (SELECT max(e.extended_until) FROM public.acquisition_claim_lease_extensions e
                      WHERE e.claim_id = cl.id))
      FROM public.acquisition_work_claims cl
     WHERE cl.id = claim
$$;

CREATE FUNCTION acquisition_lease_extension_verify_insert()
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
    IF acquisition_claim_lease_until(cl.id) <= now() THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_claim_lease_extensions: LEASE_LOST (the lease already lapsed)';
    END IF;
    IF acquisition_campaign_control_state(cl.campaign_id) = 'EMERGENCY_STOPPED' THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_claim_lease_extensions: the campaign is emergency stopped';
    END IF;
    IF NOT (NEW.extended_until > now()
            AND NEW.extended_until <= now() + interval '3600 seconds'
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

CREATE TRIGGER acquisition_lease_extensions_verify
    BEFORE INSERT ON acquisition_claim_lease_extensions
    FOR EACH ROW EXECUTE FUNCTION acquisition_lease_extension_verify_insert();
CREATE TRIGGER acquisition_lease_extensions_append_only
    BEFORE UPDATE OR DELETE ON acquisition_claim_lease_extensions
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation();

-- In flight = the latest attempt has no outcome and its EFFECTIVE lease is live.
CREATE OR REPLACE FUNCTION acquisition_item_in_flight(item uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog, pg_temp
AS $$
    SELECT COALESCE(
        (SELECT o.id IS NULL AND acquisition_claim_lease_until(cl.id) > now()
           FROM public.acquisition_work_claims cl
           LEFT JOIN public.acquisition_work_outcomes o ON o.claim_id = cl.id
          WHERE cl.work_item_id = item
          ORDER BY cl.attempt_no DESC
          LIMIT 1),
        false)
$$;

-- The derived item state, now over the EFFECTIVE lease (same columns, same order).
CREATE OR REPLACE VIEW acquisition_work_item_states WITH (security_invoker = true) AS
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
       acquisition_claim_lease_until(cl.id) AS lease_expires_at,
       o.outcome          AS latest_outcome,
       o.retry_reason,
       o.retry_not_before,
       o.refusal_reason,
       o.human_queue,
       o.failure_reason,
       o.recorded_at      AS outcome_recorded_at,
       CASE
           WHEN cl.id IS NULL THEN 'PENDING'
           WHEN o.id IS NULL AND acquisition_claim_lease_until(cl.id) > now() THEN 'CLAIMED'
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

-- ---------------------------------------------------------------------------
-- K. The claim rule (0023 D), re-created: effective leases, reservations
--    that must match the stage and fit the signed budget.
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
            IF acquisition_claim_lease_until(prev.id) > now() THEN
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
      FROM public.acquisition_work_claims cl
     WHERE cl.campaign_id = NEW.campaign_id
       AND acquisition_claim_lease_until(cl.id) > now()
       AND NOT EXISTS (SELECT 1 FROM public.acquisition_work_outcomes o WHERE o.claim_id = cl.id);
    IF live >= c.max_concurrency THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_work_claims: CONCURRENCY_CAP_REACHED';
    END IF;

    -- The reservation is the stage's own, never a caller's choice ...
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
    -- ... and it must fit what the signed budget has left.
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

-- ---------------------------------------------------------------------------
-- L. The outcome rule (0023 E), re-created: the CAMPAIGN lock is taken first
--    (P2-7: an outcome and a racing child insert serialise), and a claim may
--    never report more than it reserved (P1-4).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION acquisition_outcome_verify_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    cl       public.acquisition_work_claims%ROWTYPE;
    item     public.acquisition_work_items%ROWTYPE;
    c        public.acquisition_campaigns%ROWTYPE;
    latest   integer;
    state    text;
BEGIN
    SELECT * INTO item FROM public.acquisition_work_items WHERE id = NEW.work_item_id;
    PERFORM pg_advisory_xact_lock(acquisition_campaign_lock_key(item.campaign_id));
    PERFORM pg_advisory_xact_lock(acquisition_item_lock_key(NEW.work_item_id));
    SELECT * INTO cl FROM public.acquisition_work_claims WHERE id = NEW.claim_id;
    SELECT * INTO c FROM public.acquisition_campaigns WHERE id = item.campaign_id;

    SELECT max(attempt_no) INTO latest FROM public.acquisition_work_claims
     WHERE work_item_id = NEW.work_item_id;
    IF cl.attempt_no <> latest THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_work_outcomes: CLAIM_SUPERSEDED (a later attempt exists)';
    END IF;
    IF NEW.recorded_at IS DISTINCT FROM now() THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_work_outcomes: recorded_at must be the database clock';
    END IF;
    IF NEW.search_runs_consumed > cl.reserved_search_runs
       OR NEW.research_roots_consumed > cl.reserved_research_roots
       OR NEW.gateway_requests_consumed > cl.reserved_gateway_requests THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'acquisition_work_outcomes: consumption beyond the claim''s reservation';
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
                    WHERE NOT EXISTS (SELECT 1 FROM public.acquisition_work_items w
                                       WHERE w.id = p.child
                                         AND w.parent_item_id = NEW.work_item_id
                                         AND w.stage = NEW.next_stage)) THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'acquisition_work_outcomes: a produced child is not this item''s child at the next stage';
        END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM public.acquisition_work_items w
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

-- ---------------------------------------------------------------------------
-- M. Queue shape (P2-6), applied on top of section E's rule by a SECOND
--    trigger that fires after it (name order): roots only while RUNNING or
--    PAUSED and on/after starts_at; below DISCOVERED one child per parent,
--    carrying the parent's subject whenever it is the same kind of subject
--    (only the nomination -> discovery-subject boundary names a new id); a
--    child keeps its parent's registrable domain whenever the parent has one.
-- ---------------------------------------------------------------------------

CREATE FUNCTION acquisition_work_item_shape_verify()
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
        IF state NOT IN ('RUNNING', 'PAUSED') OR now() < c.starts_at THEN
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
        -- The same KIND of subject moves on unchanged; only the kind boundary
        -- (a nomination becoming its discovery subject) may name a new id.
        IF NEW.subject_kind = parent.subject_kind AND NEW.subject_id IS DISTINCT FROM parent.subject_id THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'acquisition_work_items: below DISCOVERED a child carries its parent''s subject';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER acquisition_work_items_verify_shape
    BEFORE INSERT ON acquisition_work_items
    FOR EACH ROW EXECUTE FUNCTION acquisition_work_item_shape_verify();

-- ---------------------------------------------------------------------------
-- N. EMERGENCY_STOP never waits on the campaign advisory lock (P2-3). Any
--    role that can connect can take an advisory lock with the (computable)
--    campaign key; a halt must not queue behind it. The control rule takes
--    the advisory lock for every other action, but for EMERGENCY_STOP only a
--    NO KEY UPDATE row lock on the campaign row - a lock no runtime role can
--    hold (it needs UPDATE privilege) and that foreign-key checks (KEY SHARE)
--    do not conflict with. Concurrent control events are still serialised by
--    the unique (campaign_id, sequence_no) index; the recorder retries.
--    RECOVERY if anything else ever blocks the owner path: as the owner,
--    `SELECT pg_terminate_backend(pid) FROM pg_locks WHERE locktype =
--    'advisory' AND ...` (ADR 0030 s9).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION acquisition_control_verify_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    expected integer;
    state    text;
BEGIN
    IF NEW.action = 'EMERGENCY_STOP' THEN
        PERFORM 1 FROM public.acquisition_campaigns WHERE id = NEW.campaign_id FOR NO KEY UPDATE;
    ELSE
        PERFORM pg_advisory_xact_lock(acquisition_campaign_lock_key(NEW.campaign_id));
    END IF;
    SELECT COALESCE(max(sequence_no), 0) + 1 INTO expected
      FROM public.acquisition_campaign_control_events WHERE campaign_id = NEW.campaign_id;
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

-- ---------------------------------------------------------------------------
-- O. Grants for the fixes: the worker appends heartbeats, and reads the ONE
--    environment row so a stored campaign's environment is checked against
--    THIS database's record, not against itself (P2-10).
-- ---------------------------------------------------------------------------

REVOKE ALL ON acquisition_claim_lease_extensions
    FROM PUBLIC, nwf_ingest, nwf_research, nwf_classifier,
         nwf_discovery_subject_writer, nwf_discovery_subject_reviewer, nwf_source_discovery;
GRANT SELECT, INSERT ON acquisition_claim_lease_extensions TO nwf_acquisition_worker;
GRANT SELECT ON acquisition_claim_lease_extensions TO nwf_readonly;
GRANT SELECT ON subject_review_environment TO nwf_acquisition_worker;
