-- Migration 0021 - REL Q1: A NARROW WRITER FOR SOURCE-STATED COUNTRY-OF-OPERATION
-- CLAIMS. Reasoned about in docs/adr/0024-worldwide-subject-jurisdiction-claims.md
-- s7 (Proposed amendment, REL Q1).
--
-- WHY THIS EXISTS
--
--   Migration 0016 created subject_jurisdiction_claims and granted INSERT to
--   no runtime role: only the migration owner could record a claim, and ADR
--   0024 s3 left "a writer" to a later, separately approved slice. The REL P1
--   qualification-input export reads candidate.location ONLY from STATED
--   COUNTRY_OF_OPERATION claims, so every real discovery subject exported
--   `country.value: null` and was not rankable: nothing at runtime could
--   record what a source states about where the subject operates.
--
--   This migration lets the EXISTING B2.2 writer capability
--   (nwf_discovery_subject_writer, migration 0014) append exactly one kind of
--   claim - COUNTRY_OF_OPERATION, SOURCE_STATED - and only when it cites a
--   source the subject ALREADY HOLDS. It creates no role, no LOGIN, no table
--   and no column, and changes no existing constraint, trigger or grant.
--
-- WHAT THE WRITER MAY RECORD, ENFORCED HERE FOR EVERY NON-OWNER INSERT
--
--   - claim_kind COUNTRY_OF_OPERATION only. Registration country and legal
--     form stay owner-path only.
--   - claim_basis SOURCE_STATED (0016's CHECK, unchanged).
--   - recorded_by_actor_key 'discovery-subjects-cli' (0014's binding function,
--     attached to this table by section C below).
--   - a source the subject already holds:
--       PAGE_EVIDENCE  page evidence captured by a research run rooted in one
--                      of THIS subject's admissions (root_key
--                      'subject_admission:<admission id>'), or cited by one of
--                      THIS subject's own identity claims; observed_at must
--                      equal that page's own observed_at;
--       PUBLIC_URL     the exact (url, version) provenance one of THIS
--                      subject's own identity claims already cites, observed
--                      no later than the statement instant;
--       WEBSITE_CLAIM  REFUSED. A website claim records only a URL a register
--                      published for an ECHE source row; any country read
--                      from it would be inferred from a domain or a top-level
--                      domain, which rule 2 forbids.
--   The country itself is the operator's explicit statement of what that
--   source says. The database cannot read a page; it can only refuse a claim
--   whose source the subject does not hold.
--
-- PRIVILEGES, AND WHY EACH IS NEEDED
--
--   subject_jurisdiction_claims        SELECT, INSERT
--     INSERT is the capability. SELECT is reading for validation: the writer
--     reads the subject's existing claims to refuse an exact duplicate and to
--     report the standing the new claim produces (STATED / CONFLICTING).
--   orgunit_page_evidence (id, root_key, observed_at)   SELECT on those columns
--   subject_research_admissions (id, subject_id)        SELECT on those columns
--     Needed by the scope check below, which runs with the INSERTING role's
--     rights (no SECURITY DEFINER). The writer learns which admission a page
--     was captured under and when - never its title, headings or text, never
--     an admission's URL, reason, policy or validity.
--
--   NOT granted: UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, TEMPORARY, any
--   other column of either table, any other orgunit_* table, any website,
--   ECHE, EWP, classifier or source-discovery table. nwf_research,
--   nwf_ingest, nwf_classifier, nwf_readonly, nwf_source_discovery and
--   nwf_discovery_subject_reviewer are not changed.
--
-- APPEND-ONLY IS UNCHANGED
--
--   0016's BEFORE UPDATE OR DELETE trigger still refuses both for every role.
--   A correction is a NEW claim; two claims that disagree both stay, and the
--   derived standing is CONFLICTING (ADR 0024 s2).
--
-- WHAT THIS IS NOT
--
--   Not a review, not a verification and not a permission. A recorded claim
--   grants no research eligibility, no qualification, no ranking and no
--   contact permission; it is evidence the Operator's C1 rubric may read.
--   Applying this migration to any persistent database is a separate OWNER
--   decision; the capability stays NOLOGIN and nobody holds it until a
--   deployment grants it to a provisioned login.

-- ---------------------------------------------------------------------------
-- A. Grants.
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT ON subject_jurisdiction_claims TO nwf_discovery_subject_writer;

GRANT SELECT (id, root_key, observed_at) ON orgunit_page_evidence
    TO nwf_discovery_subject_writer;

GRANT SELECT (id, subject_id) ON subject_research_admissions
    TO nwf_discovery_subject_writer;

-- ---------------------------------------------------------------------------
-- B. The scope of a non-owner INSERT is the database's, not the caller's.
-- ---------------------------------------------------------------------------
--
-- "Owner" is decided from the catalogue exactly as 0014 decides it
-- (pg_class.relowner of the table being written): the owner path is checked by
-- 0016's constraints alone, as before. Raised as check_violation (SQLSTATE
-- 23514).

CREATE FUNCTION subject_jurisdiction_writer_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    table_owner   oid;
    page_root     text;
    page_observed timestamptz;
BEGIN
    SELECT relowner INTO table_owner FROM pg_class WHERE oid = TG_RELID;
    IF pg_has_role(current_user, table_owner, 'MEMBER') THEN
        RETURN NEW;
    END IF;
    IF NEW.claim_kind IS DISTINCT FROM 'COUNTRY_OF_OPERATION' THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'subject_jurisdiction_claims: a non-owner writer may record COUNTRY_OF_OPERATION only';
    END IF;
    IF NEW.source_type = 'PAGE_EVIDENCE' THEN
        SELECT root_key, observed_at INTO page_root, page_observed
          FROM orgunit_page_evidence WHERE id = NEW.source_page_evidence_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'subject_jurisdiction_claims: the cited page evidence does not exist';
        END IF;
        IF NOT (EXISTS (SELECT 1 FROM subject_research_admissions a
                         WHERE a.subject_id = NEW.subject_id
                           AND page_root = 'subject_admission:' || a.id::text)
                OR EXISTS (SELECT 1 FROM discovery_subject_identity_claims c
                            WHERE c.subject_id = NEW.subject_id
                              AND c.source_type = 'PAGE_EVIDENCE'
                              AND c.source_page_evidence_id = NEW.source_page_evidence_id)) THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'subject_jurisdiction_claims: the cited page evidence is not held by this subject';
        END IF;
        IF NEW.observed_at IS DISTINCT FROM page_observed THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'subject_jurisdiction_claims: observed_at must equal the cited page observed_at';
        END IF;
    ELSIF NEW.source_type = 'PUBLIC_URL' THEN
        IF NOT EXISTS (SELECT 1 FROM discovery_subject_identity_claims c
                        WHERE c.subject_id = NEW.subject_id
                          AND c.source_type = 'PUBLIC_URL'
                          AND c.source_url = NEW.source_url
                          AND c.source_version_ref IS NOT DISTINCT FROM NEW.source_version_ref) THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'subject_jurisdiction_claims: the cited public URL is not a source this subject already holds';
        END IF;
        IF NEW.observed_at > statement_timestamp() THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'subject_jurisdiction_claims: observed_at is in the future';
        END IF;
    ELSE
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'subject_jurisdiction_claims: a website claim states no country; a non-owner writer may not cite one';
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION subject_jurisdiction_writer_scope() IS
    'REL Q1 (migration 0021): for a NON-OWNER insert into '
    'subject_jurisdiction_claims, admits only a COUNTRY_OF_OPERATION claim '
    'citing page evidence or a public URL the subject already holds. Runs with '
    'the inserting role''s rights. Owner inserts are checked by 0016 alone.';

CREATE TRIGGER subject_jurisdiction_claims_writer_scope
    BEFORE INSERT ON subject_jurisdiction_claims
    FOR EACH ROW EXECUTE FUNCTION subject_jurisdiction_writer_scope();

-- ---------------------------------------------------------------------------
-- C. The recorded actor of a non-owner INSERT is the CLI path key (0014's
--    function, unchanged; it reads recorded_by_actor_key on this table).
-- ---------------------------------------------------------------------------

CREATE TRIGGER subject_jurisdiction_claims_writer_actor
    BEFORE INSERT ON subject_jurisdiction_claims
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_bind_writer_actor();
