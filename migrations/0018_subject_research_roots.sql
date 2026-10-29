-- Migration 0018 - Lane L1: SUBJECT RESEARCH ROOTS, completed down to the
-- candidate grain (OWNER directive 2026-10-26; extends ADR 0025 s12).
--
-- Migration 0017 gave fetch evidence a third root, `subject_admission:<uuid>`,
-- and pinned every FETCH row's generated `run_root_scope` to its run's
-- `root_scope` by a composite foreign key: one run holds ECHE evidence or ONE
-- admission's, never both. Page evidence inherits that, because it hangs off
-- exactly one fetch row. A CANDIDATE does not: `orgunit_page_candidates`
-- carries its own `run_id` beside a `root_key` that is pinned only to its page
-- (0007's `orgunit_page_candidates_root_fk`). So a subject-rooted candidate
-- could be filed under an ECHE run, or an ECHE candidate under a subject run,
-- and a reader that selects candidates BY RUN (the R9 export, the classifier
-- loaders) would see evidence of the other scope. Nothing writes such a row
-- today; this migration makes it unrecordable, by the same design 0017 used:
--
--   A. `orgunit_page_candidates.run_root_scope`, GENERATED ALWAYS from the
--      candidate's own `root_key` - 'ECHE' for a `claim:` or `promotion:` root,
--      the root key itself for a `subject_admission:` root - and a composite
--      foreign key (run_id, run_root_scope) -> orgunit_research_runs
--      (id, root_scope). Never written, so it can never disagree with
--      `root_key`; and `root_key` is itself pinned to the page, the page to
--      its fetch, and the fetch to its run's scope.
--   B. A partial index on `orgunit_research_runs (root_scope)` for subject
--      runs only, so a subject's runs are found from its admissions without
--      scanning every ECHE run.
--
-- WHAT IT DOES NOT DO. It grants nothing to anyone. In particular
-- `nwf_research` still holds NO privilege on any discovery-subject table
-- (ADR 0019 s9): a subject root's URL is read from the admission row, whose
-- copy of the claim's URL is foreign-key-pinned (0017 s A), so the research
-- role needs none - the minimal grant is the empty one. It adds no root kind
-- (0017's `subject_admission:` IS the subject root; a second, unadmitted
-- `subject:` kind would be a root without an OWNER approval), changes no
-- existing value, rewrites no `root_key`, and touches no classifier table:
-- a subject-rooted candidate still cannot be classified (ADR 0025 D8).
--
-- EXISTING ROWS. Every candidate written before this migration has a root key
-- whose fetch is pinned to its run's scope by 0017, and every candidate the
-- orchestrator writes takes its run id and root key from the same fetch's run
-- and root. Adding the foreign key VALIDATES every existing row; one that
-- violated the invariant would fail here and roll the whole migration back,
-- surfacing the defect instead of grandfathering it.
--
-- LOCKING. Adding a STORED generated column rewrites `orgunit_page_candidates`
-- under ACCESS EXCLUSIVE, and the foreign key takes SHARE ROW EXCLUSIVE on
-- `orgunit_research_runs` while it validates. Readers and writers of those two
-- tables wait until COMMIT. Applying this to any persistent database is a
-- separate OWNER decision; lane L1 applies it to disposable databases only.

-- ---------------------------------------------------------------------------
-- A. One run scope per candidate.
-- ---------------------------------------------------------------------------

ALTER TABLE orgunit_page_candidates
    ADD COLUMN run_root_scope text
        GENERATED ALWAYS AS (
            CASE
                WHEN root_key LIKE 'subject\_admission:%' THEN root_key
                ELSE 'ECHE'
            END
        ) STORED NOT NULL;

ALTER TABLE orgunit_page_candidates ADD CONSTRAINT orgunit_page_candidates_run_scope_fk
    FOREIGN KEY (run_id, run_root_scope) REFERENCES orgunit_research_runs (id, root_scope);

COMMENT ON COLUMN orgunit_page_candidates.run_root_scope IS
    'GENERATED from root_key: ''ECHE'' for a claim or promotion root, the '
    'root key itself (''subject_admission:<uuid>'') for a discovery-subject '
    'root. Pinned to the run''s root_scope by orgunit_page_candidates_run_scope_fk '
    '(migration 0018), so a candidate can never be filed under a run of the '
    'other scope or of another admission.';

-- ---------------------------------------------------------------------------
-- B. Finding a subject's runs.
-- ---------------------------------------------------------------------------

CREATE INDEX orgunit_research_runs_subject_root_scope_idx
    ON orgunit_research_runs (root_scope)
    WHERE root_scope <> 'ECHE';
