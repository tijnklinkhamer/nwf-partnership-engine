-- Migration 0028 - WW acceptance: a CAMPAIGN admission its own work item could
-- not use is SUPERSEDED by the worker holding that item, never retried forever
-- (ADR 0030 s13, Proposed).
--
-- Migrations 0017, 0024 and 0026 are committed and are NOT edited.
--
-- WHY THIS EXISTS (found by the Mac runtime full-system acceptance test,
-- `wwMacRuntimeFullSystem.test.ts`, 2026-10-28):
--
--   A CAMPAIGN admission records the discovery-subject registry fingerprint
--   it was granted over (migration 0017), and the root resolver re-checks it
--   on EVERY gateway attempt (ROOT_SUBJECT_ADMISSION_STALE). The fingerprint
--   counts every subject, identity claim, relationship claim, review and
--   attestation - so ANY registry change between recording an admission and
--   starting its run (the OWNER signing the daily identity review while the
--   Engine runs; a PAUSE landing between the two steps; a crash) leaves the
--   item holding an admission that can never verify again. The handler
--   retried the item with that same admission, and 0026 refuses a second
--   live admission for the subject: the item looped STALE -> RETRY until its
--   attempts ran out, and the organisation was lost to the campaign.
--
-- WHAT IT DOES. The acquisition worker may append ONE revocation, reason
-- `CAMPAIGN_ATTEMPT_SUPERSEDED`, of a CAMPAIGN admission when, all at once:
--   - its work item is in flight (a live claim, by the statement clock);
--   - it was recorded under an EARLIER attempt than the item's current one;
--   - no page evidence was captured under it (captured research is never
--     discarded: a retried attempt whose run kept pages advances with them;
--     a run cut off before its first page - a PAUSE at the wrong moment -
--     kept nothing, and is re-run under the fresh admission);
--   - it is not already revoked;
--   - the actor key is the worker's own (`acquisition-worker`).
-- The handler then records a fresh CAMPAIGN admission through the unchanged
-- 0026 rule, which counts it against the campaign's signed research-root
-- budget - so supersession is bounded by the OWNER's signature, never free.
-- The OWNER path (the migration owner) keeps revoking anything, as before.
--
-- WHAT IT DOES NOT DO. No LOGIN, no new role, no UPDATE/DELETE/TRUNCATE
-- grant, no SECURITY DEFINER function (the one ordinary view exposes a page
-- count per CAMPAIGN admission and nothing else), no change to any existing row, no
-- weakening of the fingerprint check: a stale admission authorises nothing;
-- it is replaced by a new one evaluated over the current registry.

-- Counts only, per CAMPAIGN admission: the pages its research captured. An
-- ordinary (definer-rights) view, following the 0017 fingerprint and 0026
-- standing precedents, so the worker's trigger can ask "did this admission's
-- research keep anything?" without any privilege on the evidence tables.
CREATE VIEW subject_research_admission_page_capture AS
SELECT a.id AS admission_id,
       (SELECT count(*)
          FROM orgunit_page_evidence p
          JOIN orgunit_fetch_observations f ON f.id = p.fetch_observation_id
         WHERE f.root_subject_admission_id = a.id) AS pages_captured
  FROM subject_research_admissions a
 WHERE a.admission_basis = 'CAMPAIGN';

COMMENT ON VIEW subject_research_admission_page_capture IS
    'WW acceptance (migration 0028): for each CAMPAIGN admission, the number of '
    'pages its research captured - one integer, nothing else. Definer-rights '
    '(0017/0026 precedent), read by the revocation trigger as the worker.';

CREATE FUNCTION subject_research_admission_revocation_verify()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    a public.subject_research_admissions%ROWTYPE;
    attempt_at timestamptz;
BEGIN
    -- The OWNER path (the migration owner) is unchanged.
    IF public.acquisition_is_owner_path() THEN
        RETURN NEW;
    END IF;
    -- Anyone else (the acquisition worker is the only other role granted
    -- INSERT): exactly the supersession of its own item's unused admission.
    IF NEW.reason IS DISTINCT FROM 'CAMPAIGN_ATTEMPT_SUPERSEDED'
       OR NEW.actor_key IS DISTINCT FROM 'acquisition-worker' THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'subject_research_admission_revocations: only CAMPAIGN_ATTEMPT_SUPERSEDED by the acquisition worker';
    END IF;
    SELECT * INTO a FROM public.subject_research_admissions WHERE id = NEW.admission_id;
    IF a.admission_basis IS DISTINCT FROM 'CAMPAIGN' OR a.campaign_work_item_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'subject_research_admission_revocations: the worker supersedes CAMPAIGN admissions only';
    END IF;
    IF NOT public.acquisition_item_in_flight(a.campaign_work_item_id) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'subject_research_admission_revocations: the admission''s work item has no in-flight claim';
    END IF;
    SELECT max(c.claimed_at) INTO attempt_at
      FROM public.acquisition_work_claims c
     WHERE c.work_item_id = a.campaign_work_item_id
       AND c.attempt_no = (SELECT max(c2.attempt_no) FROM public.acquisition_work_claims c2
                            WHERE c2.work_item_id = a.campaign_work_item_id);
    IF attempt_at IS NULL OR a.admitted_at >= attempt_at THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'subject_research_admission_revocations: only an admission of an EARLIER attempt is superseded';
    END IF;
    IF COALESCE((SELECT c.pages_captured FROM public.subject_research_admission_page_capture c
                  WHERE c.admission_id = a.id), 0) > 0 THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'subject_research_admission_revocations: an admission whose research captured a page is never superseded';
    END IF;
    IF EXISTS (SELECT 1 FROM public.subject_research_admission_revocations v
                WHERE v.admission_id = a.id) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'subject_research_admission_revocations: the admission is already revoked';
    END IF;
    -- The database clock, whatever the caller sent.
    NEW.revoked_at := clock_timestamp();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION subject_research_admission_revocation_verify() IS
    'WW acceptance (migration 0028): the owner path revokes anything; the '
    'acquisition worker only supersedes its in-flight item''s CAMPAIGN '
    'admission of an earlier attempt whose research captured no page, as '
    'CAMPAIGN_ATTEMPT_SUPERSEDED. The fresh admission then counts against the '
    'signed research-root budget.';

CREATE TRIGGER subject_research_admission_revocations_verify
    BEFORE INSERT ON subject_research_admission_revocations
    FOR EACH ROW EXECUTE FUNCTION subject_research_admission_revocation_verify();

GRANT INSERT ON subject_research_admission_revocations TO nwf_acquisition_worker;
GRANT SELECT ON subject_research_admission_page_capture TO nwf_acquisition_worker;
GRANT SELECT ON subject_research_admission_page_capture TO nwf_readonly;
