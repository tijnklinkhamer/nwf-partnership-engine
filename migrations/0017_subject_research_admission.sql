-- Migration 0017 - Global R8: SUBJECT RESEARCH ADMISSION (ADR 0025, Proposed).
--
-- A Discovery Subject (migration 0013) has no ECHE source row, so until now
-- the research path could not root a single request in one: every fetch
-- observation needed an `eche_row_key` and either a website claim or an
-- operator promotion (migration 0007). This migration adds exactly ONE more
-- root authority, on the same model as a promotion:
--
--   A. `subject_research_admissions` - an OWNER-path APPROVAL that ONE of a
--      subject's own SOURCE_STATED PUBLIC_WEBSITE claims may be researched,
--      under a named policy version, for at most 30 days. Append-only.
--   B. `subject_research_admission_revocations` - the append-only withdrawal.
--      NOTHING references it as authority, exactly like promotion
--      revocations: a revocation is structurally incapable of authorising a
--      fetch.
--   C. `subject_research_registry_fingerprint` - a view exposing ONLY the row
--      COUNTS of the five discovery-subject tables, so research can detect
--      that the registry changed after an admission (stale evidence) without
--      holding any privilege on those tables.
--   D. `orgunit_fetch_observations` gains a third root column,
--      `root_subject_admission_id`, and its generated `root_key` a third
--      branch, `subject_admission:<uuid>`.
--   E. `orgunit_research_runs.root_scope` and a composite foreign key from
--      every fetch row: one run holds ECHE evidence or ONE admission's, never
--      both and never two admissions'.
--
-- WHAT IT DOES NOT DO. It grants `nwf_research` nothing on any discovery
-- subject table (ADR 0019 s9 stays true), creates no role, adds no write
-- grant, stores no contact, country, legal form, score, eligibility or
-- verdict column, and leaves every classifier table untouched: a
-- `subject_admission:` root still fails `orgunit_classifier_calls_root_key_chk`
-- (migration 0009) and its NULL `eche_row_key` fails that table's NOT NULL,
-- so subject-rooted evidence cannot be classified (ADR 0025 D8).
--
-- HISTORICAL ROOT KEYS ARE PRESERVED BY CONSTRUCTION. PostgreSQL 16 cannot
-- change a generated column's expression in place (ALTER COLUMN ... SET
-- EXPRESSION is PostgreSQL 17+). Turning it into a plain column (DROP
-- EXPRESSION) would let a writer set it, which migration 0007 forbids and
-- `orgunitSchema.test.ts` pins (SQLSTATE 428C9). So section D drops the
-- generated column and re-adds it, GENERATED ALWAYS, with the SAME two
-- leading branches in the SAME order: for every existing row (exactly one of
-- the two original root columns set, the new one NULL) the new expression
-- evaluates to the identical text. The rewrite, the index and foreign-key
-- rebuild and the value checks all happen inside the migration runner's ONE
-- transaction; any failure rolls all of it back. The before/after per-row
-- equality is proven on a disposable database by
-- `src/test/integration/subjectResearchAdmissionR8.test.ts` (migration safety).
--
-- LOCKING. Dropping and adding a STORED generated column rewrites
-- `orgunit_fetch_observations` under ACCESS EXCLUSIVE; rebuilding
-- `orgunit_page_evidence_root_fk` takes SHARE ROW EXCLUSIVE on both tables and
-- validates every page row. Readers and writers of those two tables wait until
-- COMMIT. Applying this to any persistent database is a separate OWNER
-- decision; R8 applies it to disposable databases only.

-- ---------------------------------------------------------------------------
-- A. The approval.
-- ---------------------------------------------------------------------------

-- The composite foreign-key target that pins an admission to ONE claim's exact
-- subject, kind, basis and URL. `id` is already the primary key, so this
-- index adds no uniqueness the table did not already have; it exists only so
-- the admission can carry the claim's URL without being able to disagree with
-- it.
CREATE UNIQUE INDEX discovery_subject_identity_claims_admission_target_uidx
    ON discovery_subject_identity_claims (id, subject_id, claim_kind, claim_basis, website_url);

CREATE TABLE subject_research_admissions (
    id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id                uuid        NOT NULL,
    identity_claim_id         uuid        NOT NULL,
    -- Mirrored ONLY to be constrained; see the composite foreign key below.
    claim_kind                text        NOT NULL,
    claim_basis               text        NOT NULL,
    -- The root URL, as the referenced claim states it. The foreign key makes a
    -- different value unrecordable, so research reads its root here without
    -- any privilege on the claim table.
    website_url               text        NOT NULL,
    policy_version            text        NOT NULL,
    -- The trust scope the subject's identity confirmation was verified under.
    -- TEST_ONLY admissions are refused outside vitest at the root resolver.
    identity_authority_scope  text        NOT NULL,
    subject_state_digest      text        NOT NULL,
    protected_registry_digest text        NOT NULL,
    registry_fingerprint      text        NOT NULL,
    actor_key                 text        NOT NULL,
    reason                    text        NOT NULL,
    validity_seconds          integer     NOT NULL,
    -- Both instants are set by the BEFORE INSERT trigger from the DATABASE
    -- clock; a caller-supplied value is overwritten.
    admitted_at               timestamptz NOT NULL,
    expires_at                timestamptz NOT NULL,

    CONSTRAINT subject_research_admissions_claim_kind_chk
        CHECK (claim_kind = 'PUBLIC_WEBSITE'),
    CONSTRAINT subject_research_admissions_claim_basis_chk
        CHECK (claim_basis = 'SOURCE_STATED'),
    CONSTRAINT subject_research_admissions_policy_version_chk
        CHECK (policy_version = 'subject-research-admission-policy-v1'),
    CONSTRAINT subject_research_admissions_authority_scope_chk
        CHECK (identity_authority_scope IN ('OPERATIONAL', 'TEST_ONLY')),
    CONSTRAINT subject_research_admissions_state_digest_chk
        CHECK (subject_state_digest ~ '^[0-9a-f]{64}$'),
    CONSTRAINT subject_research_admissions_registry_digest_chk
        CHECK (protected_registry_digest ~ '^[0-9a-f]{64}$'),
    CONSTRAINT subject_research_admissions_fingerprint_chk
        CHECK (registry_fingerprint ~ '^s=[0-9]+;i=[0-9]+;r=[0-9]+;v=[0-9]+;a=[0-9]+$'),
    -- AN OPAQUE ACTOR KEY naming the trusted path, never a person (0007's form).
    CONSTRAINT subject_research_admissions_actor_key_chk
        CHECK (actor_key ~ '^[a-z0-9][a-z0-9_-]{2,63}$'),
    CONSTRAINT subject_research_admissions_reason_chk
        CHECK (length(reason) BETWEEN 1 AND 1000 AND discovery_identity_text_admissible(reason)),
    -- D4: at most 30 days.
    CONSTRAINT subject_research_admissions_validity_chk
        CHECK (validity_seconds BETWEEN 1 AND 2592000),
    CONSTRAINT subject_research_admissions_window_chk
        CHECK (expires_at > admitted_at AND expires_at - admitted_at <= interval '30 days'),

    CONSTRAINT subject_research_admissions_claim_fk
        FOREIGN KEY (identity_claim_id, subject_id, claim_kind, claim_basis, website_url)
        REFERENCES discovery_subject_identity_claims (id, subject_id, claim_kind, claim_basis,
                                                      website_url)
);

CREATE INDEX subject_research_admissions_subject_idx ON subject_research_admissions (subject_id);

CREATE FUNCTION subject_research_admission_stamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.admitted_at := clock_timestamp();
    NEW.expires_at := NEW.admitted_at + make_interval(secs => NEW.validity_seconds);
    RETURN NEW;
END;
$$;

CREATE TRIGGER subject_research_admissions_stamp
    BEFORE INSERT ON subject_research_admissions
    FOR EACH ROW EXECUTE FUNCTION subject_research_admission_stamp();

-- Append-only for every role, the owner included (0013's refusal, SQLSTATE 55000).
CREATE TRIGGER subject_research_admissions_append_only
    BEFORE UPDATE OR DELETE ON subject_research_admissions
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation();

COMMENT ON TABLE subject_research_admissions IS
    'One OWNER-path approval that ONE discovery subject''s own SOURCE_STATED '
    'PUBLIC_WEBSITE claim may be researched under subject-research-admission-'
    'policy-v1, for at most 30 days (ADR 0025). An approval, not a verdict: it '
    'never says the subject exists, is eligible, qualified or contactable. The '
    'URL is a foreign-key-pinned copy of the claim''s, so it cannot disagree with '
    'it. Withdrawn only by appending to subject_research_admission_revocations.';
COMMENT ON COLUMN subject_research_admissions.registry_fingerprint IS
    'The row counts of the five discovery-subject tables when the admission '
    'was evaluated, under SHARE locks (s=subjects;i=identity claims;'
    'r=relationship claims;v=reviews;a=attestations). Those tables are '
    'append-only, so ANY later row changes it and the admission reads STALE. '
    'Deliberately global (ADR 0025 D7): it over-invalidates on unrelated '
    'registry writes, which is its known scalability limit.';

-- ---------------------------------------------------------------------------
-- B. The withdrawal. Nothing references it.
-- ---------------------------------------------------------------------------

CREATE TABLE subject_research_admission_revocations (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    admission_id uuid        NOT NULL REFERENCES subject_research_admissions (id),
    actor_key    text        NOT NULL,
    reason       text        NOT NULL,
    revoked_at   timestamptz NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT subject_research_admission_revocations_actor_key_chk
        CHECK (actor_key ~ '^[a-z0-9][a-z0-9_-]{2,63}$'),
    CONSTRAINT subject_research_admission_revocations_reason_chk
        CHECK (length(reason) BETWEEN 1 AND 1000 AND discovery_identity_text_admissible(reason))
);

CREATE INDEX subject_research_admission_revocations_admission_idx
    ON subject_research_admission_revocations (admission_id);

CREATE TRIGGER subject_research_admission_revocations_append_only
    BEFORE UPDATE OR DELETE ON subject_research_admission_revocations
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation();

COMMENT ON TABLE subject_research_admission_revocations IS
    'Append-only withdrawal of one subject research admission. NOTHING '
    'REFERENCES THIS TABLE AS AUTHORITY: orgunit_fetch_observations.'
    'root_subject_admission_id points only at the approval table.';

-- ---------------------------------------------------------------------------
-- C. Counts only.
-- ---------------------------------------------------------------------------
--
-- An ordinary view (not security_invoker), so it reads the subject tables
-- with its OWNER's privileges and returns nothing but five integers. It is
-- the ONLY discovery-subject information `nwf_research` can obtain.

CREATE VIEW subject_research_registry_fingerprint AS
SELECT 's=' || (SELECT count(*) FROM discovery_subjects)
    || ';i=' || (SELECT count(*) FROM discovery_subject_identity_claims)
    || ';r=' || (SELECT count(*) FROM discovery_subject_relationship_claims)
    || ';v=' || (SELECT count(*) FROM discovery_subject_reviews)
    || ';a=' || (SELECT count(*) FROM subject_review_attestations) AS fingerprint;

COMMENT ON VIEW subject_research_registry_fingerprint IS
    'Row counts of the five append-only discovery-subject tables, as one '
    'string. Exposes no row, id, name, URL or review: research uses it only to '
    'refuse an admission whose registry state has changed since evaluation.';

-- ---------------------------------------------------------------------------
-- D. A third root authority on fetch evidence.
-- ---------------------------------------------------------------------------

ALTER TABLE orgunit_fetch_observations
    ADD COLUMN root_subject_admission_id uuid,
    ADD CONSTRAINT orgunit_fetch_observations_root_subject_admission_fk
        FOREIGN KEY (root_subject_admission_id) REFERENCES subject_research_admissions (id);

-- A subject root has no ECHE source row. NULL is now the truthful value for
-- exactly that root and no other (the CHECK below); `_eche_row_key_chk`
-- (non-empty) still applies whenever a key is present.
ALTER TABLE orgunit_fetch_observations ALTER COLUMN eche_row_key DROP NOT NULL;

ALTER TABLE orgunit_fetch_observations DROP CONSTRAINT orgunit_fetch_observations_root_xor_chk;
ALTER TABLE orgunit_fetch_observations ADD CONSTRAINT orgunit_fetch_observations_root_xor_chk
    CHECK (num_nonnulls(root_website_claim_id, root_promotion_id, root_subject_admission_id) = 1);

-- A subject-rooted attempt names no ECHE row and no organisation; every other
-- attempt names its ECHE row, exactly as before.
ALTER TABLE orgunit_fetch_observations ADD CONSTRAINT orgunit_fetch_observations_subject_root_chk
    CHECK (CASE WHEN root_subject_admission_id IS NULL
                THEN eche_row_key IS NOT NULL
                ELSE eche_row_key IS NULL AND organisation_id IS NULL END);

CREATE INDEX orgunit_fetch_observations_subject_admission_idx
    ON orgunit_fetch_observations (root_subject_admission_id)
    WHERE root_subject_admission_id IS NOT NULL;

-- The root_key rebuild (see the header). Dependents first, in reverse.
ALTER TABLE orgunit_page_evidence DROP CONSTRAINT orgunit_page_evidence_root_fk;
DROP INDEX orgunit_fetch_observations_id_root_key_uidx;
DROP INDEX orgunit_fetch_observations_dedupe_uidx;
ALTER TABLE orgunit_fetch_observations DROP COLUMN root_key;

-- One statement, so the table is rewritten ONCE for both generated columns.
ALTER TABLE orgunit_fetch_observations
    ADD COLUMN root_key text
        GENERATED ALWAYS AS (
            CASE
                WHEN root_website_claim_id IS NOT NULL
                    THEN 'claim:' || root_website_claim_id::text
                WHEN root_promotion_id IS NOT NULL
                    THEN 'promotion:' || root_promotion_id::text
                WHEN root_subject_admission_id IS NOT NULL
                    THEN 'subject_admission:' || root_subject_admission_id::text
            END
        ) STORED NOT NULL,
    -- See section E: the run scope this attempt belongs to, derived, never written.
    ADD COLUMN run_root_scope text
        GENERATED ALWAYS AS (
            CASE
                WHEN root_subject_admission_id IS NULL THEN 'ECHE'
                ELSE 'subject_admission:' || root_subject_admission_id::text
            END
        ) STORED NOT NULL;

CREATE UNIQUE INDEX orgunit_fetch_observations_dedupe_uidx
    ON orgunit_fetch_observations (run_id, root_key, requested_url,
                                   fetch_policy_version, attempt_no);
CREATE UNIQUE INDEX orgunit_fetch_observations_id_root_key_uidx
    ON orgunit_fetch_observations (id, root_key);

-- Re-validates every existing page row against the regenerated key: a page
-- whose fetch's key changed would fail here and roll the migration back.
ALTER TABLE orgunit_page_evidence ADD CONSTRAINT orgunit_page_evidence_root_fk
    FOREIGN KEY (fetch_observation_id, root_key)
    REFERENCES orgunit_fetch_observations (id, root_key);

COMMENT ON COLUMN orgunit_fetch_observations.root_key IS
    'GENERATED ALWAYS from the three root columns: ''claim:<uuid>'', '
    '''promotion:<uuid>'' or (migration 0017) ''subject_admission:<uuid>''. It is '
    'the single NOT NULL handle on this fetch''s root authority, and downstream '
    'tables carry a copy pinned by a composite foreign key so a page or a '
    'candidate CANNOT claim a root its own fetch does not have. Generated rather '
    'than written, so it can never disagree with the columns it summarises. '
    'Rebuilt by 0017 with the original two branches first and unchanged, so every '
    'historical value is identical.';
COMMENT ON COLUMN orgunit_fetch_observations.root_subject_admission_id IS
    'A discovery subject''s research root: an OWNER-path approval in '
    'subject_research_admissions - the APPROVAL table, never its revocations. Set '
    'only when eche_row_key and organisation_id are NULL. ADR 0025.';
COMMENT ON COLUMN orgunit_fetch_observations.eche_row_key IS
    'THE ANCHOR: normalised(erasmus_code) || ''|'' || pic, identifying one ECHE '
    'SOURCE ROW - not a real-world institution. Identical in meaning to '
    'website_claims.eche_row_key, deliberately, so research evidence joins to '
    'source evidence without either one strengthening the other''s identity '
    'claim. NULL exactly when the root is a discovery-subject admission '
    '(migration 0017), which has no ECHE source row; never NULL otherwise.';

-- ---------------------------------------------------------------------------
-- E. One root scope per run, enforced by the database.
-- ---------------------------------------------------------------------------
--
-- A run is EITHER an ECHE research run (every existing run, and every run
-- `startRun` creates: the default) OR the run of exactly ONE subject
-- admission. Each fetch row's generated `run_root_scope` must equal its run's
-- `root_scope` through a composite foreign key, so an ECHE attempt cannot be
-- written into a subject run, a subject attempt cannot be written into an
-- ECHE run, and two admissions cannot share a run - whichever code path tries.
-- The existing single-column run foreign key stays.

ALTER TABLE orgunit_research_runs
    ADD COLUMN root_scope text NOT NULL DEFAULT 'ECHE',
    ADD CONSTRAINT orgunit_research_runs_root_scope_chk
        CHECK (root_scope = 'ECHE'
               OR root_scope ~ '^subject_admission:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

CREATE UNIQUE INDEX orgunit_research_runs_id_root_scope_uidx
    ON orgunit_research_runs (id, root_scope);

ALTER TABLE orgunit_fetch_observations ADD CONSTRAINT orgunit_fetch_observations_run_scope_fk
    FOREIGN KEY (run_id, run_root_scope) REFERENCES orgunit_research_runs (id, root_scope);

COMMENT ON COLUMN orgunit_research_runs.root_scope IS
    '''ECHE'' for every ECHE research run (the default, so every pre-0017 run and '
    'every run startRun creates), or ''subject_admission:<uuid>'' for the run of '
    'exactly one discovery-subject admission (ADR 0025). Fetch evidence is pinned '
    'to it by orgunit_fetch_observations_run_scope_fk.';
COMMENT ON COLUMN orgunit_fetch_observations.run_root_scope IS
    'GENERATED: ''ECHE'' for a claim or promotion root, ''subject_admission:<uuid>'' '
    'for a subject root. Pinned to the run''s root_scope by a composite foreign '
    'key, so one run never mixes root scopes or admissions.';

-- ---------------------------------------------------------------------------
-- F. Grants: read-only, and only what a subject root needs.
-- ---------------------------------------------------------------------------

GRANT SELECT ON subject_research_admissions             TO nwf_research;
GRANT SELECT ON subject_research_admission_revocations  TO nwf_research;
GRANT SELECT ON subject_research_registry_fingerprint   TO nwf_research;

-- The audit convention of 0002-0016.
GRANT SELECT ON subject_research_admissions, subject_research_admission_revocations,
                subject_research_registry_fingerprint TO nwf_readonly;
