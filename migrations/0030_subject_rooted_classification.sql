-- Migration 0030 - R2-P3 / R3P3-A: SUBJECT-ROOTED CLASSIFICATION (ADR 0031, Proposed).
--
-- OWNER decision (2026-10-29): independently admitted student, language and
-- cultural organisations - discovery subjects with no ECHE source row - are
-- researched under a subject admission (migration 0017, ADR 0025). Their
-- page evidence could not be classified: `orgunit_classifier_calls.eche_row_key`
-- is NOT NULL and `orgunit_classifier_calls_root_key_chk` admits only
-- `claim:`/`promotion:` (migration 0009; ADR 0025 D8). This migration lets the
-- classifier record ONE more call kind, on exactly the model 0017 used for
-- fetch evidence:
--
--   A. `orgunit_classifier_calls.root_subject_admission_id` - a foreign key to
--      the APPROVAL table `subject_research_admissions`, never to its
--      revocations. A subject-rooted call names its admission and NO ECHE row,
--      NO organisation and NO split `root_key` (CHECK `_subject_root_chk`). An
--      ECHE call is exactly as before: it names its ECHE row, and every
--      existing CHECK - `_eche_row_key_chk`, `_root_key_chk`, the repair
--      CHECKs of 0011 - is left byte-identical.
--   B. `orgunit_classifier_calls.run_root_scope`, GENERATED from the admission
--      column ('ECHE' or 'subject_admission:<uuid>'), and a composite foreign
--      key to `orgunit_research_runs (id, root_scope)`: a subject call can only
--      be filed under ITS admission's run, an ECHE call only under an ECHE
--      run - the same design 0017 s E (fetches) and 0018 (candidates) used.
--
-- So a subject-rooted call is recordable ONLY for an admission that exists,
-- ONLY under that admission's own run, and never with an invented
-- `eche_row_key` or `organisation_id`.
--
-- WHAT IT DOES NOT DO.
--   - It grants nothing. `nwf_classifier` keeps SELECT + INSERT on its four
--     tables (0009) - a table-level grant, so the new column needs no grant -
--     and receives NO privilege on any discovery-subject table: the foreign
--     key is checked by the referential-integrity trigger as the table
--     owner, and the classify path reads the admission as `nwf_research`,
--     which 0017 s F already granted SELECT on it. The minimal grant is the
--     empty one (ADR 0019 s9 stays true for the classifier role).
--   - It changes no existing value, rewrites no `input_sha256`, prompt,
--     identity or completion, and touches no classifier table other than
--     `orgunit_classifier_calls` (`orgunit_page_classifications` and
--     `orgunit_classification_subjects` carry no ECHE key and need nothing).
--   - It adds no contact, country, score, eligibility, verdict or outreach
--     column. A subject-rooted classification is INFERENCE, exactly like an
--     ECHE one (0009's table comment applies unchanged).
--   - It does not make any evaluation-cohort item classifiable: every
--     DEV/HOLDOUT/reserve member is an ECHE source row, and a subject call
--     names none (ADR 0031 s4 states the cohort rule and its proof).
--
-- EXISTING ROWS. Every call written before this migration names an ECHE row
-- (0009 NOT NULL), so its generated `run_root_scope` is 'ECHE', and the
-- classifier only ever classified ECHE runs (`assertRunBelongsToOrganisation`
-- refuses a run whose evidence names no ECHE key, ADR 0025 s8). Adding the
-- composite foreign key VALIDATES every existing row; one that violated the
-- invariant would fail here and roll the whole migration back, surfacing the
-- defect instead of grandfathering it.
--
-- LOCKING. Adding a STORED generated column rewrites
-- `orgunit_classifier_calls` under ACCESS EXCLUSIVE, and the foreign key takes
-- SHARE ROW EXCLUSIVE on `orgunit_research_runs` and
-- `subject_research_admissions` while it validates. Readers and writers of
-- those tables wait until COMMIT. Applying this to any persistent database is
-- a separate OWNER decision; this package applies it to disposable databases
-- only.

-- ---------------------------------------------------------------------------
-- A. A subject admission as the root of a classifier call.
-- ---------------------------------------------------------------------------

ALTER TABLE orgunit_classifier_calls
    ADD COLUMN root_subject_admission_id uuid,
    ADD CONSTRAINT orgunit_classifier_calls_root_subject_admission_fk
        FOREIGN KEY (root_subject_admission_id) REFERENCES subject_research_admissions (id);

-- A subject-rooted call has no ECHE source row. NULL is now the truthful value
-- for exactly that call and no other (the CHECK below); `_eche_row_key_chk`
-- (non-empty) still applies whenever a key is present.
ALTER TABLE orgunit_classifier_calls ALTER COLUMN eche_row_key DROP NOT NULL;

-- An ECHE call names its ECHE row, exactly as before. A subject-rooted call
-- names no ECHE row, no organisation, and no split root key: its run has
-- exactly one root, which IS the admission.
ALTER TABLE orgunit_classifier_calls ADD CONSTRAINT orgunit_classifier_calls_subject_root_chk
    CHECK (CASE WHEN root_subject_admission_id IS NULL
                THEN eche_row_key IS NOT NULL
                ELSE eche_row_key IS NULL AND organisation_id IS NULL AND root_key IS NULL END);

CREATE INDEX orgunit_classifier_calls_subject_admission_idx
    ON orgunit_classifier_calls (root_subject_admission_id)
    WHERE root_subject_admission_id IS NOT NULL;

COMMENT ON COLUMN orgunit_classifier_calls.root_subject_admission_id IS
    'NULL for an ECHE call. Otherwise the subject research admission '
    '(subject_research_admissions - the APPROVAL table, never its revocations) '
    'whose run this call classifies: eche_row_key, organisation_id and root_key '
    'are then NULL (orgunit_classifier_calls_subject_root_chk), and the call is '
    'pinned to that admission''s own run by orgunit_classifier_calls_run_scope_fk. '
    'Migration 0030, ADR 0031.';
COMMENT ON COLUMN orgunit_classifier_calls.eche_row_key IS
    'IDENTITY BOUNDARY: the ECHE source row whose run this call classifies, '
    'exactly as every Phase 2B table anchors on it. NULL exactly when the call '
    'is subject-rooted (root_subject_admission_id set, migration 0030), which '
    'has no ECHE source row; never NULL otherwise.';

-- ---------------------------------------------------------------------------
-- B. One run scope per call, enforced by the database.
-- ---------------------------------------------------------------------------

ALTER TABLE orgunit_classifier_calls
    ADD COLUMN run_root_scope text
        GENERATED ALWAYS AS (
            CASE
                WHEN root_subject_admission_id IS NULL THEN 'ECHE'
                ELSE 'subject_admission:' || root_subject_admission_id::text
            END
        ) STORED NOT NULL;

ALTER TABLE orgunit_classifier_calls ADD CONSTRAINT orgunit_classifier_calls_run_scope_fk
    FOREIGN KEY (run_id, run_root_scope) REFERENCES orgunit_research_runs (id, root_scope);

COMMENT ON COLUMN orgunit_classifier_calls.run_root_scope IS
    'GENERATED: ''ECHE'' for an ECHE call, ''subject_admission:<uuid>'' for a '
    'subject-rooted call. Pinned to the run''s root_scope by '
    'orgunit_classifier_calls_run_scope_fk (migration 0030), so a call can never '
    'be filed under a run of the other scope or of another admission.';
