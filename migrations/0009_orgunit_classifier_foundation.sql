-- 0009_orgunit_classifier_foundation.sql
-- Phase 2B-2a: the PERSISTENCE + LEAST-PRIVILEGE FOUNDATION for the semantic
-- organisation-unit classifier.
--
-- WHAT THIS MIGRATION IS
--
--   Schema and a role that make the Phase 2B-2 trust contract a DATABASE
--   guarantee, exactly as migration 0007 did for bounded acquisition. It
--   creates four append-only tables that a later slice will write rows into.
--
-- WHAT THIS MIGRATION IS NOT
--
--   It is not a classifier. After this migration the repository still has
--   ZERO model-provider dependencies and ZERO classifier assembly code: no
--   handoff assembly, no content-hash dedupe, no prompt, no taxonomy
--   application code, no output validator, no provider adapter, no CLI
--   command. See docs/audits/PHASE_2B_2_SEMANTIC_CLASSIFIER_DESIGN_2026-08.md
--   for the full architecture this migration implements the foundation of.
--
-- THE GOVERNING PRINCIPLE, RESTATED FOR THIS PHASE
--
--   SOFTWARE DETERMINES WHERE CLAUDE MAY LOOK.
--   CLAUDE DETERMINES WHAT THE BOUNDED EVIDENCE MEANS.
--   SOFTWARE DETERMINES WHAT HAPPENS NEXT.
--
--   Every table below is on the software side outside the middle line: it
--   records that an interpretation was ATTEMPTED and what came back, never
--   the bounded evidence itself (already captured by migration 0007) and
--   never an authority derived from the interpretation.
--
-- WHY THESE FOUR TABLES, MIRRORING 0007'S RUN/COMPLETION SPLIT
--
--   nwf_classifier receives SELECT and INSERT and nothing else, so exactly
--   the same reasoning that split orgunit_research_runs from
--   orgunit_research_run_completions applies here: a call's INTENT and its
--   TERMINAL OUTCOME are two immutable rows in two tables, because the role
--   that issues a call cannot UPDATE it into "done" afterwards.
--
--   orgunit_page_classifications and orgunit_classification_subjects split
--   the same way run/fetch evidence does: one table holds the validated
--   semantic result (never model text, never chain-of-thought), the other
--   holds ONLY the provenance closure that survives content-hash dedupe -
--   which candidate rows (every track, every root, every URL variant) this
--   one classified document speaks for.
--
-- WHAT A ROW HERE MEANS, EXACTLY
--
--   orgunit_classifier_calls        : one attempted classifier INVOCATION,
--                                      recorded before the provider answers.
--   orgunit_classifier_call_completions
--                                    : the append-only terminal event for one
--                                      call. At most one per call.
--   orgunit_page_classifications    : one document's validated semantic
--                                      reading - INFERENCE, never FACT, never
--                                      authority for anything.
--   orgunit_classification_subjects : which orgunit_page_candidates rows one
--                                      classification speaks for, after
--                                      content-hash dedupe collapsed several
--                                      candidates onto one document.
--
-- WHAT IS DELIBERATELY ABSENT, AND MUST STAY ABSENT
--
--   No raw_response, raw_completion, chain_of_thought, prompt text or raw
--   prompt column, in this or any future migration - the same "no response
--   body" discipline migration 0007 applied to fetched pages applies here to
--   model output. No contact column (person/email/phone/mailbox/telephone/
--   linkedin). No outreach or eligibility column (research_eligible,
--   outreach_eligible, contact_ready, send_allowed, qualified) - a semantic
--   classification is evidence, never permission. No is_current/superseded/
--   active/latest column - historical evidence is append-only, and a
--   "current" reading is derived at read time, never stored. No organisation-
--   unit ENTITY table (organisation_units, canonical_units, unit_entities) -
--   Phase 2B-2 classifies candidate PAGES; consolidating them into unit
--   entities is a later, separately gated phase (design §14).
--
-- APPEND-ONLY, ONCE MORE
--
--   nwf_classifier holds SELECT and INSERT on its four tables and SELECT
--   ONLY on the upstream evidence it reads. No UPDATE, no DELETE, no
--   TRUNCATE, no TEMPORARY - the same posture 0002/0006/0007 established,
--   applied to a fourth writer role.

-- ---------------------------------------------------------------------------
-- A. orgunit_classifier_calls - one attempted classifier INVOCATION.
-- ---------------------------------------------------------------------------
--
-- Inserted BEFORE the provider is invoked, exactly as orgunit_research_runs
-- is inserted before any network request. It therefore carries only
-- REQUEST-TIME fields: identity, versions, and the canonical input hash.
-- Response-time fields (status, reported model, token usage) belong on
-- orgunit_classifier_call_completions, for the same reason a run's outcome
-- does not live on orgunit_research_runs.

CREATE TABLE orgunit_classifier_calls (
    id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id                uuid        NOT NULL REFERENCES orgunit_research_runs (id),

    -- IDENTITY BOUNDARY, exactly as every Phase 2B table anchors on it.
    eche_row_key          text        NOT NULL,
    organisation_id       uuid        REFERENCES organisations (id),

    -- Set only when a call was split per root by the (future, not-yet-built)
    -- handoff overflow rule; NULL for an ordinary whole-organisation call.
    -- Deliberately NOT a foreign key: it is a copy of a fetch observation's
    -- GENERATED root_key, and no table in this schema exposes root_key as a
    -- unique key on its own (orgunit_fetch_observations is only unique on
    -- (id, root_key) together) - so there is no single row for a bare
    -- root_key value to reference. Cross-table consistency between this
    -- column and the actual roots a call's candidates were drawn from is an
    -- APPLICATION-ENFORCED invariant, not a database-enforced one; see
    -- orgunit_classification_subjects below for the equivalent boundary.
    root_key              text,

    model_id              text        NOT NULL,
    prompt_version        text        NOT NULL,
    -- Versions the HANDOFF ASSEMBLY POLICY: selection rule, content-hash
    -- dedupe, and the input bounds - deliberately separate from
    -- orgunit_research_runs.rule_version (the deterministic ranking ruleset).
    -- A future deterministic v2 and a future classifier v3 must remain
    -- independently traceable; this column is why they can be.
    classifier_version    text        NOT NULL,
    output_schema_version text        NOT NULL,

    -- Bounded, non-secret reproducibility metadata only (e.g. effort/
    -- thinking settings actually sent). NEVER a provider credential: the
    -- forbidden-key check below is defence in depth, not the only gate -
    -- no code path in this repository reads a credential into a jsonb value
    -- to begin with.
    request_config        jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- SHA-256 of the canonical serialized input (sorted keys; prompt
    -- version, schema version, batch context, every document). Computed by
    -- application code, never by this migration - a hash function belongs
    -- beside the serializer it hashes, not duplicated in SQL.
    input_sha256          text        NOT NULL,
    input_document_count  integer     NOT NULL,

    -- A deliberate re-observation (operator-invoked) is attempt_no + 1,
    -- never an overwrite - the same evidence-preserving reasoning as
    -- orgunit_fetch_observations.attempt_no.
    attempt_no            integer     NOT NULL DEFAULT 1,

    requested_at          timestamptz NOT NULL,
    created_at            timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT orgunit_classifier_calls_eche_row_key_chk
        CHECK (eche_row_key <> ''),
    CONSTRAINT orgunit_classifier_calls_root_key_chk
        CHECK (root_key IS NULL OR root_key ~ '^(claim|promotion):[0-9a-fA-F-]{36}$'),
    CONSTRAINT orgunit_classifier_calls_model_id_chk
        CHECK (model_id <> '' AND length(model_id) <= 64),
    CONSTRAINT orgunit_classifier_calls_prompt_version_chk
        CHECK (prompt_version <> '' AND length(prompt_version) <= 64),
    CONSTRAINT orgunit_classifier_calls_classifier_version_chk
        CHECK (classifier_version <> '' AND length(classifier_version) <= 64),
    CONSTRAINT orgunit_classifier_calls_output_schema_version_chk
        CHECK (output_schema_version <> '' AND length(output_schema_version) <= 64),
    CONSTRAINT orgunit_classifier_calls_request_config_chk
        CHECK (jsonb_typeof(request_config) = 'object'
               AND length(request_config::text) <= 2000
               AND NOT (request_config ?| ARRAY['api_key', 'apiKey', 'credential',
                                                 'credentials', 'authorization',
                                                 'secret', 'token'])),
    CONSTRAINT orgunit_classifier_calls_input_sha256_chk
        CHECK (input_sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT orgunit_classifier_calls_input_document_count_chk
        CHECK (input_document_count >= 1),
    CONSTRAINT orgunit_classifier_calls_attempt_no_chk
        CHECK (attempt_no >= 1)
);

-- THE IDEMPOTENCY IDENTITY. The exact same call - same input, same model,
-- same versions, same attempt - is a database error to insert twice, not an
-- application convention: a caller SELECTs for a COMPLETED match first (see
-- the design's idempotency section) and reuses it; the unique index is the
-- guarantee, mirroring orgunit_fetch_observations_dedupe_uidx.
CREATE UNIQUE INDEX orgunit_classifier_calls_identity_uidx
    ON orgunit_classifier_calls (input_sha256, model_id, prompt_version,
                                 classifier_version, output_schema_version,
                                 attempt_no);

CREATE INDEX orgunit_classifier_calls_run_idx ON orgunit_classifier_calls (run_id);
CREATE INDEX orgunit_classifier_calls_eche_row_key_idx
    ON orgunit_classifier_calls (eche_row_key);
CREATE INDEX orgunit_classifier_calls_organisation_idx
    ON orgunit_classifier_calls (organisation_id) WHERE organisation_id IS NOT NULL;

COMMENT ON TABLE orgunit_classifier_calls IS
    'One attempted semantic-classifier INVOCATION, recorded before the '
    'provider answers - configuration only, exactly as orgunit_research_runs '
    'is to a fetch. This row is never authority for anything: it names an '
    'ATTEMPT, not a result. A call''s outcome is a separate, append-only row '
    'in orgunit_classifier_call_completions, because nwf_classifier holds no '
    'UPDATE grant and cannot close out a mutable call record.';

COMMENT ON COLUMN orgunit_classifier_calls.classifier_version IS
    'Versions the HANDOFF ASSEMBLY POLICY (selection rule, content-hash '
    'dedupe, input bounds) - deliberately separate from '
    'orgunit_research_runs.rule_version, the DETERMINISTIC ranking ruleset. '
    'The two change independently and must never be conflated.';

COMMENT ON COLUMN orgunit_classifier_calls.input_sha256 IS
    'SHA-256 of the canonical serialized input, computed by application '
    'code. Together with the other identity columns this makes a call '
    'reproducible to its inputs without storing the inputs themselves twice - '
    'the inputs already live in orgunit_page_evidence/orgunit_page_candidates.';

COMMENT ON COLUMN orgunit_classifier_calls.request_config IS
    'Bounded, non-secret reproducibility metadata only (for example, effort '
    'or thinking settings actually sent). NEVER a provider credential of any '
    'kind - the CHECK forbidding common credential-shaped keys is defence in '
    'depth, not the only reason no credential can appear here: no code in '
    'this repository has one to put here.';

-- ---------------------------------------------------------------------------
-- B. orgunit_classifier_call_completions - the append-only terminal event.
-- ---------------------------------------------------------------------------
--
-- A call's current state is DERIVED, never stored twice, mirroring
-- orgunit_research_run_completions exactly:
--
--   no completion row  -> the call has not reached a terminal state (either
--                         still in flight, or it died without recording one)
--   one completion row -> that row IS the terminal state

CREATE TABLE orgunit_classifier_call_completions (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id          uuid        NOT NULL REFERENCES orgunit_classifier_calls (id),
    terminal_state   text        NOT NULL,
    -- The model the response ACTUALLY reported, which may differ from the
    -- requested model_id on a provider-side fallback. Drift evidence, kept
    -- deliberately separate from the request-time model_id above.
    response_model_id text,
    input_tokens     integer,
    output_tokens    integer,
    error_kind       text,
    error_summary    text,
    finished_at      timestamptz NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT orgunit_classifier_call_completions_state_chk
        CHECK (terminal_state IN ('COMPLETED', 'PARTIAL', 'FAILED')),
    -- A completed call has no failure to describe - mirrors
    -- orgunit_research_run_completions_completed_is_clean_chk exactly.
    CONSTRAINT orgunit_classifier_call_completions_completed_is_clean_chk
        CHECK (terminal_state <> 'COMPLETED'
               OR (error_kind IS NULL AND error_summary IS NULL)),
    -- PARTIAL and FAILED must name what happened - an incomplete or failed
    -- call with no error_kind would be an unreviewable terminal state.
    CONSTRAINT orgunit_classifier_call_completions_incomplete_has_error_chk
        CHECK (terminal_state = 'COMPLETED' OR error_kind IS NOT NULL),
    CONSTRAINT orgunit_classifier_call_completions_error_kind_chk
        CHECK (error_kind IS NULL OR error_kind IN
            ('PROVIDER_TRANSIENT', 'PROVIDER_REFUSAL', 'SCHEMA_INVALID',
             'EVIDENCE_SPAN_UNVERIFIED', 'TIMEOUT', 'OTHER')),
    -- Bounded on purpose, exactly like orgunit_research_run_completions: an
    -- operator-facing label, never a place to accumulate model text.
    CONSTRAINT orgunit_classifier_call_completions_error_summary_chk
        CHECK (error_summary IS NULL OR length(error_summary) <= 2000),
    CONSTRAINT orgunit_classifier_call_completions_response_model_id_chk
        CHECK (response_model_id IS NULL OR length(response_model_id) <= 64),
    CONSTRAINT orgunit_classifier_call_completions_input_tokens_chk
        CHECK (input_tokens IS NULL OR input_tokens >= 0),
    CONSTRAINT orgunit_classifier_call_completions_output_tokens_chk
        CHECK (output_tokens IS NULL OR output_tokens >= 0)
);

-- AT MOST ONE terminal row per call - the same guarantee
-- orgunit_research_run_completions_run_uidx gives a research run.
CREATE UNIQUE INDEX orgunit_classifier_call_completions_call_uidx
    ON orgunit_classifier_call_completions (call_id);

COMMENT ON TABLE orgunit_classifier_call_completions IS
    'The APPEND-ONLY terminal event of a classifier call. One row at most '
    'per call, inserted once and never edited. No raw provider response, no '
    'chain-of-thought and no prompt text is stored here or anywhere in this '
    'migration - only bounded, operator-facing outcome metadata.';

COMMENT ON COLUMN orgunit_classifier_call_completions.terminal_state IS
    'COMPLETED: every supplied document produced a validated classification '
    'row. PARTIAL: at least one document validated and was persisted, and '
    'at least one did not (error_kind names why). FAILED: no document was '
    'persisted from this call. One bad document never destroys a valid '
    'sibling''s result - the same non-transactional, per-document '
    'persistence lesson orgunit_page_evidence/orgunit_page_candidates '
    'already apply.';

-- ---------------------------------------------------------------------------
-- C. orgunit_page_classifications - one document's validated semantic reading.
-- ---------------------------------------------------------------------------
--
-- A row here is written ONLY for a result that has already passed structural
-- schema validation, closed-enum membership, the conditional-field rules
-- below, length bounds, and evidence-span literal substring verification
-- (application-side; the CHECKs below enforce everything a CHECK can). A
-- response that fails any of those checks contributes to the call's
-- PARTIAL/FAILED completion and produces NO row here.
--
-- THIS ROW IS INFERENCE, NEVER FACT AND NEVER AUTHORITY. It is a model's
-- reading of BOUNDED, ALREADY-REDACTED evidence under a named prompt and
-- model version - never a verified fact about the organisation, never a
-- claim, never a root, never contact truth, never outreach or legal
-- permission. Nothing in this schema, and nothing downstream, may read a row
-- here as authorising a fetch, a promotion, a claim change, an Apollo call,
-- an outreach flag, or any Phase 1 mutation.

CREATE TABLE orgunit_page_classifications (
    id                                       uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id                                  uuid         NOT NULL
                                                           REFERENCES orgunit_classifier_calls (id),
    -- The content-hash dedupe REPRESENTATIVE page. Every page this document
    -- also covers (other tracks, other roots, other URL variants that shared
    -- the same response_sha256) is recorded in orgunit_classification_subjects.
    page_evidence_id                         uuid         NOT NULL
                                                           REFERENCES orgunit_page_evidence (id),

    verdict                                  text         NOT NULL,
    unit_type                                text,
    page_kind                                text,
    -- The unit's name AS STATED in the supplied evidence, verbatim or
    -- near-verbatim; NULL when none is stated. Never conditioned on verdict:
    -- a NEEDS_REVIEW page may still name a partially-identified unit.
    unit_name                                text,

    serves_incoming_international_students   text,
    serves_outgoing_mobility_students        text,
    provides_language_learning_or_support    text,

    confidence                               text         NOT NULL,
    rationale                                text         NOT NULL,
    -- FULL STRUCTURAL VALIDATION, everything the database can locally know.
    -- Each element of the array is CHECKed to be an object carrying EXACTLY
    -- {source, quote} - source a non-empty string from the design's §7
    -- closed set (TITLE|HEADING|EXCERPT|URL_PATH), quote a non-empty string
    -- of at most 200 CODE POINTS (see the rationale_chk comment above for
    -- why length() needs no JS-side pre-computation to agree with it). This
    -- is everything the database CAN verify from the column's own bytes.
    --
    -- ONE THING THE DATABASE DELIBERATELY DOES NOT AND CANNOT VERIFY: that a
    -- `quote` is a LITERAL SUBSTRING of the actual supplied classifier
    -- document. That relationship spans this row and the assembled request
    -- payload the classifier answered, which is not itself a column of any
    -- table here - the canonical payload is reconstructed at read time from
    -- orgunit_page_evidence/orgunit_page_candidates plus the versions on
    -- orgunit_classifier_calls (see that table's input_sha256 comment), so
    -- there is nothing local to a CHECK constraint to compare against. That
    -- verification is therefore an APPLICATION responsibility, structurally
    -- as well as practically: it is exactly the design's §9 "anti-
    -- hallucination contract", and the future classifier write path (2B-2c)
    -- MUST perform BOTH gates - schema-valid (this CHECK) AND
    -- substring-verified (an application check against the assembled
    -- input) - before any INSERT. A response that fails either produces NO
    -- row (see the PARTIAL/FAILED completion semantics above); this schema
    -- makes it impossible to persist a structurally malformed span, and
    -- deliberately does not attempt to make it impossible to persist an
    -- unverified one, because it cannot.
    evidence_spans                           jsonb        NOT NULL,

    created_at                               timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT orgunit_page_classifications_verdict_chk
        CHECK (verdict IN ('UNIT_PAGE', 'NOT_A_UNIT', 'NEEDS_REVIEW')),
    CONSTRAINT orgunit_page_classifications_unit_type_chk
        CHECK (unit_type IS NULL OR unit_type IN
            ('INTERNATIONAL_MOBILITY_OFFICE', 'LANGUAGE_CENTRE',
             'LANGUAGE_DEPARTMENT', 'OTHER_UNIT')),
    CONSTRAINT orgunit_page_classifications_page_kind_chk
        CHECK (page_kind IS NULL OR page_kind IN
            ('DEGREE_PROGRAMME_PAGE', 'NEWS_OR_EVENT_PAGE', 'RESEARCH_PAGE',
             'NAVIGATION_OR_LANDING_PAGE', 'SERVICE_TOOL_PAGE',
             'GENERIC_INSTITUTIONAL_PAGE', 'OTHER_NON_UNIT')),
    -- unit_type is REQUIRED exactly when verdict is UNIT_PAGE, and forbidden
    -- otherwise - a biconditional, not two independent one-way rules.
    CONSTRAINT orgunit_page_classifications_unit_type_conditional_chk
        CHECK ((verdict = 'UNIT_PAGE') = (unit_type IS NOT NULL)),
    -- page_kind is REQUIRED exactly when verdict is NOT_A_UNIT.
    CONSTRAINT orgunit_page_classifications_page_kind_conditional_chk
        CHECK ((verdict = 'NOT_A_UNIT') = (page_kind IS NOT NULL)),
    CONSTRAINT orgunit_page_classifications_unit_name_chk
        CHECK (unit_name IS NULL OR (unit_name <> '' AND length(unit_name) <= 200)),

    CONSTRAINT orgunit_page_classifications_incoming_axis_chk
        CHECK (serves_incoming_international_students IS NULL
               OR serves_incoming_international_students IN ('YES', 'NO', 'UNKNOWN')),
    CONSTRAINT orgunit_page_classifications_outgoing_axis_chk
        CHECK (serves_outgoing_mobility_students IS NULL
               OR serves_outgoing_mobility_students IN ('YES', 'NO', 'UNKNOWN')),
    CONSTRAINT orgunit_page_classifications_language_axis_chk
        CHECK (provides_language_learning_or_support IS NULL
               OR provides_language_learning_or_support IN ('YES', 'NO', 'UNKNOWN')),
    -- All THREE relevance axes are REQUIRED exactly when verdict is
    -- UNIT_PAGE, and forbidden otherwise - never a partial set, and never
    -- present on a NOT_A_UNIT or NEEDS_REVIEW row. There is deliberately no
    -- single aggregate "is_relevant" column and no "distribution_potential"
    -- column anywhere in this table.
    CONSTRAINT orgunit_page_classifications_axes_conditional_chk
        CHECK ((verdict = 'UNIT_PAGE') = (serves_incoming_international_students IS NOT NULL)
               AND (verdict = 'UNIT_PAGE') = (serves_outgoing_mobility_students IS NOT NULL)
               AND (verdict = 'UNIT_PAGE') = (provides_language_learning_or_support IS NOT NULL)),

    CONSTRAINT orgunit_page_classifications_confidence_chk
        CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')),
    -- Rationale means CLASSIFICATION confidence only - never business
    -- attractiveness, deterministic score, contactability or outreach
    -- readiness. length() on a Postgres text column counts CODE POINTS, so
    -- this bound needs no application-side pre-computation to agree with it -
    -- unlike the historical main_text_chars defect, there is no separate
    -- JS-computed column here for a UTF-16/code-point mismatch to hide in.
    CONSTRAINT orgunit_page_classifications_rationale_chk
        CHECK (rationale <> '' AND length(rationale) <= 500),
    CONSTRAINT orgunit_page_classifications_evidence_spans_chk
        CHECK (jsonb_typeof(evidence_spans) = 'array'
               AND jsonb_array_length(evidence_spans) BETWEEN 1 AND 4),
    -- Every element is an OBJECT. Checked before the two element-shape
    -- CHECKs below run their own jsonpath methods on each element, because
    -- `.keyvalue()` (the next CHECK) raises a hard jsonpath error - not a
    -- false match - when applied to a non-object array element; this CHECK
    -- and that one are read together, in this order, for that reason.
    CONSTRAINT orgunit_page_classifications_evidence_spans_shape_chk
        CHECK (NOT jsonb_path_exists(evidence_spans, '$[*] ? (@.type() != "object")')),
    -- EXACTLY the two approved keys, no more, no less. `.keyvalue()` is
    -- guarded by a same-path `? (@.type() == "object")` filter first, so it
    -- is never invoked on a non-object element even though shape_chk above
    -- already refuses that case - a CHECK must be safe to evaluate on its
    -- own, independent of evaluation order, since Postgres makes no
    -- guarantee about which CHECK on a table runs first.
    CONSTRAINT orgunit_page_classifications_evidence_spans_keys_chk
        CHECK (NOT jsonb_path_exists(evidence_spans,
            '$[*] ? (@.type() == "object").keyvalue() ? (@.key != "source" && @.key != "quote")')),
    -- `source` present, a STRING, and a member of the design's §7 closed
    -- set. An empty string is refused by the same comparison - it matches
    -- none of the four values, so no separate "not empty" clause is needed.
    CONSTRAINT orgunit_page_classifications_evidence_spans_source_chk
        CHECK (NOT jsonb_path_exists(evidence_spans,
            '$[*] ? (!exists(@.source) || @.source.type() != "string"
                     || (@.source != "TITLE" && @.source != "HEADING"
                         && @.source != "EXCERPT" && @.source != "URL_PATH"))')),
    -- `quote` present, a STRING, and 1-200 CODE POINTS. `like_regex`
    -- operates on Postgres's own decoded text, so `.{1,200}` counts code
    -- points exactly as `length()` does elsewhere in this schema - verified
    -- empirically against this build's PostgreSQL with an astral (emoji)
    -- string at exactly 200 and 201 code points before this CHECK was
    -- written, matching the code-point semantics `rationale_chk` already
    -- relies on and the historical main_text_chars defect this repository
    -- has already paid for once (see migration 0007's ADR 0008 record).
    -- `{1,200}` already excludes an empty string, so no separate check is
    -- needed for that case.
    CONSTRAINT orgunit_page_classifications_evidence_spans_quote_chk
        CHECK (NOT jsonb_path_exists(evidence_spans,
            '$[*] ? (!exists(@.quote) || @.quote.type() != "string"
                     || !(@.quote like_regex "^.{1,200}$"))'))
);

-- One classification per (call, page). A call classifies each of its
-- documents once; a genuinely different reading is a new call (new
-- attempt_no), never a second row here for the same call and document.
CREATE UNIQUE INDEX orgunit_page_classifications_call_page_uidx
    ON orgunit_page_classifications (call_id, page_evidence_id);

CREATE INDEX orgunit_page_classifications_call_idx
    ON orgunit_page_classifications (call_id);
CREATE INDEX orgunit_page_classifications_page_idx
    ON orgunit_page_classifications (page_evidence_id);

COMMENT ON TABLE orgunit_page_classifications IS
    'ONE DOCUMENT''S VALIDATED SEMANTIC READING. THIS ROW IS INFERENCE - a '
    'model''s interpretation of bounded, already-redacted evidence under a '
    'named prompt and model version - NEVER A VERIFIED FACT, NEVER A CLAIM, '
    'NEVER A ROOT, NEVER CONTACT TRUTH, AND NEVER OUTREACH OR LEGAL '
    'PERMISSION. No code path anywhere may read a row here as authorising a '
    'fetch, a promotion, a claim change, an Apollo call, an outreach flag, '
    'or any Phase 1 mutation. Written only for a response that has already '
    'passed structured validation - no invalid semantic output is ever '
    'persisted here, regardless of how often a classifier call itself '
    'returns one.';

COMMENT ON COLUMN orgunit_page_classifications.confidence IS
    'Confidence in the CLASSIFICATION only. Never business attractiveness, '
    'never the deterministic candidate_score, never contactability, and '
    'never outreach readiness - those remain separate, later, human '
    'judgements this table does not encode.';

COMMENT ON COLUMN orgunit_page_classifications.serves_incoming_international_students IS
    'One of three independent tri-state relevance axes, required exactly '
    'when verdict = UNIT_PAGE. UNKNOWN is a first-class value: marketing '
    'language with no concrete service evidence yields UNKNOWN, never YES.';

-- ---------------------------------------------------------------------------
-- D. orgunit_classification_subjects - provenance closure across dedupe.
-- ---------------------------------------------------------------------------
--
-- Content-hash dedupe at handoff assembly collapses several
-- orgunit_page_candidates rows (different tracks, different roots, different
-- URL variants sharing one response_sha256) onto ONE classified document.
-- This table is how "which candidates does this verdict speak for" survives
-- that collapse: one row per (classification, candidate) pair covered.
--
-- CROSS-TABLE CONSISTENCY THIS SCHEMA DOES NOT ENFORCE, DOCUMENTED RATHER
-- THAN TRIGGERED: a subject's page_candidate_id and its classification's
-- call_id are expected to trace back to the SAME research run (candidate ->
-- run_id; classification -> call -> run_id) and the same organisation. That
-- invariant spans three tables and cannot be expressed as a plain foreign
-- key, and a trigger to enforce it would be exactly the kind of convenience
-- machinery this migration avoids (see the module-level note on
-- orgunit_classifier_calls.root_key for the same reasoning). It is an
-- APPLICATION-ENFORCED invariant: the handoff-assembly code that will be
-- built in a later slice is the only writer of these rows, and it never
-- receives a candidate that did not come from the run it is assembling.

CREATE TABLE orgunit_classification_subjects (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    classification_id  uuid        NOT NULL REFERENCES orgunit_page_classifications (id),
    page_candidate_id  uuid        NOT NULL REFERENCES orgunit_page_candidates (id),
    created_at         timestamptz NOT NULL DEFAULT now()
);

-- The same candidate cannot be attached twice to the same classification.
CREATE UNIQUE INDEX orgunit_classification_subjects_pair_uidx
    ON orgunit_classification_subjects (classification_id, page_candidate_id);

CREATE INDEX orgunit_classification_subjects_classification_idx
    ON orgunit_classification_subjects (classification_id);
CREATE INDEX orgunit_classification_subjects_candidate_idx
    ON orgunit_classification_subjects (page_candidate_id);

COMMENT ON TABLE orgunit_classification_subjects IS
    'PROVENANCE CLOSURE across content-hash dedupe: one row per '
    'orgunit_page_candidates row that one classified document speaks for, '
    'so a future reader can join rank <-> verdict without ambiguity even '
    'after several candidates collapsed onto one document. References '
    'existing candidate rows by id and mutates none of them - this table '
    'is pure ADDITIONAL provenance, never a rewrite.';

-- ---------------------------------------------------------------------------
-- nwf_classifier: the Phase 2B-2 semantic-classification execution role.
-- ---------------------------------------------------------------------------
--
-- WHY A SEPARATE ROLE, NOT nwf_research
--
--   nwf_research can INSERT into orgunit_fetch_observations,
--   orgunit_page_evidence and orgunit_page_candidates. Reusing it for
--   classifier writes would make the process that INTERPRETS evidence able
--   to also FORGE the evidence it interprets - collapsing exactly the
--   separation ADR 0004/0007/0008's whole design depends on. So a fourth,
--   narrower role exists instead, and nwf_research receives NOTHING on the
--   four new tables: acquisition and semantic classification stay separated
--   writers, each incapable of the other's job.
--
--   The privilege list below is deliberately narrower than nwf_research's:
--
--     organisations, orgunit_research_runs,
--     orgunit_fetch_observations, orgunit_page_evidence,
--     orgunit_page_candidates                    : SELECT (read-only context)
--     orgunit_classifier_*, orgunit_page_classifications,
--     orgunit_classification_subjects            : SELECT, INSERT
--     everything else                            : nothing
--
--   In particular, nwf_classifier holds NO grant at all on website_claims,
--   orgunit_redirect_observations, orgunit_root_promotions or
--   orgunit_root_promotion_revocations. It has no business with root
--   authority - it classifies pages a run already fetched, and root
--   authority is not among the evidence a classification is about.
--
--   No UPDATE anywhere. No DELETE anywhere. No TRUNCATE anywhere. No
--   TEMPORARY on the database.
--
--   Password is a deterministic LOCAL-DEVELOPMENT-ONLY value, matching the
--   convention 0002 and 0007 established. It is not a secret and is not
--   reused anywhere.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nwf_classifier') THEN
        CREATE ROLE nwf_classifier LOGIN PASSWORD 'local_dev_only';
    END IF;
END
$$;

-- Start from nothing, exactly as 0002 and 0007 do. Never grant schema-wide ALL.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM nwf_classifier;

DO $$
DECLARE
    db text := current_database();
BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO nwf_classifier', db);
END
$$;

GRANT USAGE ON SCHEMA public TO nwf_classifier;

-- READ side: exactly the upstream evidence a classification is ABOUT. No
-- write privilege anywhere on this list.
GRANT SELECT ON organisations                  TO nwf_classifier;
GRANT SELECT ON orgunit_research_runs          TO nwf_classifier;
GRANT SELECT ON orgunit_fetch_observations     TO nwf_classifier;
GRANT SELECT ON orgunit_page_evidence          TO nwf_classifier;
GRANT SELECT ON orgunit_page_candidates        TO nwf_classifier;

-- WRITE side: append-only, and ONLY on the four tables this migration adds.
GRANT SELECT, INSERT ON orgunit_classifier_calls            TO nwf_classifier;
GRANT SELECT, INSERT ON orgunit_classifier_call_completions TO nwf_classifier;
GRANT SELECT, INSERT ON orgunit_page_classifications        TO nwf_classifier;
GRANT SELECT, INSERT ON orgunit_classification_subjects     TO nwf_classifier;

-- The audit role can inspect Phase 2B-2 evidence, exactly as it can inspect
-- every other evidence table in this schema. It remains unable to write.
GRANT SELECT ON orgunit_classifier_calls, orgunit_classifier_call_completions,
                orgunit_page_classifications, orgunit_classification_subjects
    TO nwf_readonly;

-- Defensive: make the append-only intent explicit for any future role too.
REVOKE UPDATE, DELETE ON orgunit_classifier_calls            FROM PUBLIC;
REVOKE UPDATE, DELETE ON orgunit_classifier_call_completions FROM PUBLIC;
REVOKE UPDATE, DELETE ON orgunit_page_classifications        FROM PUBLIC;
REVOKE UPDATE, DELETE ON orgunit_classification_subjects     FROM PUBLIC;

-- nwf_research is UNTOUCHED by this migration: it receives no grant, of any
-- kind, on any of the four tables created above. Acquisition writes
-- deterministic evidence; it does not read or write interpretations of it.
