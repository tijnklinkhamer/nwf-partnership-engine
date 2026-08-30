-- 0010_classifier_max_runtime_error_kinds.sql
-- Widens migration 0009's orgunit_classifier_call_completions.error_kind
-- taxonomy with the two failure kinds the Phase 2B-2C Claude Max runtime
-- design (docs/audits/PHASE_2B_2C_CLAUDE_MAX_RUNTIME_DESIGN_2026-08.md §10)
-- requires and 2B-2C1's provider-neutral orchestration (src/orgunits/classify/
-- orchestrate.ts) already produces.
--
-- WHAT WAS MISSING
--
--   Migration 0009 closed error_kind to a set drafted before the owner's
--   Claude-Max-only runtime constraint existed:
--
--     PROVIDER_TRANSIENT, PROVIDER_REFUSAL, SCHEMA_INVALID,
--     EVIDENCE_SPAN_UNVERIFIED, TIMEOUT, OTHER
--
--   Two Max-runtime failures are operationally primary and truthfully map
--   onto NEITHER existing member:
--
--     USAGE_LIMIT_EXHAUSTED - a subscription session/weekly usage limit was
--       reached. Not PROVIDER_TRANSIENT (an immediate retry is wrong - the
--       allowance will not have reset); not OTHER (it is the single most
--       expected failure mode of a subscription-authenticated runtime, and
--       the operator's remedy - wait for reset, then a fresh attempt_no - is
--       unique to it, and worth being able to query for by name).
--
--     AUTH_FAILURE - the runtime's subscription token was rejected AFTER
--       the caller's own pre-flight passed (for example, a one-year
--       `claude setup-token` token that lapsed or was revoked mid-window).
--       Not PROVIDER_TRANSIENT (retrying cannot succeed until the operator
--       re-mints the token); not OTHER (its remedy is likewise unique and
--       nameable).
--
-- WHAT THIS MIGRATION CHANGES, AND WHAT IT DOES NOT
--
--   It drops and recreates exactly one CHECK constraint, adding exactly
--   these two members. Nothing else about the column, the table, or any
--   other constraint moves: error_kind stays a nullable text column, the
--   completed_is_clean and incomplete_has_error CHECKs (migration 0009) are
--   untouched and continue to hold for both new members exactly as they do
--   for the six existing ones.
--
--   No table is created. No column is added or dropped. No grant changes:
--   nwf_classifier still holds exactly SELECT and INSERT on its four
--   tables, and nothing else changes what any role may do. This mirrors
--   migration 0008's precedent (a landed CHECK corrected to match a design
--   truth the schema predated) rather than needing a new ADR - the full
--   reasoning lives in this migration file and in the Claude Max runtime
--   design artifact it implements, exactly as 0008 did for the signed
--   candidate_score correction.
--
--   No row exists to rewrite: all four Phase 2B-2 tables held zero rows in
--   both the working database and nwf_pe_test when this migration was
--   written (2B-2C1 makes zero live model-provider calls - see the Max
--   runtime design's own "NO IMPLEMENTATION" boundary, honoured by this
--   slice).

ALTER TABLE orgunit_classifier_call_completions
    DROP CONSTRAINT orgunit_classifier_call_completions_error_kind_chk;

ALTER TABLE orgunit_classifier_call_completions
    ADD CONSTRAINT orgunit_classifier_call_completions_error_kind_chk
    CHECK (error_kind IS NULL OR error_kind IN
        ('PROVIDER_TRANSIENT', 'PROVIDER_REFUSAL', 'SCHEMA_INVALID',
         'EVIDENCE_SPAN_UNVERIFIED', 'TIMEOUT', 'OTHER',
         'USAGE_LIMIT_EXHAUSTED', 'AUTH_FAILURE'));

-- Restated in full rather than appended to, because COMMENT ON replaces -
-- migration 0009's original text is preserved verbatim below and extended
-- with the two new members' own paragraph; 0009 itself is untouched, as
-- forward-only history requires.
COMMENT ON COLUMN orgunit_classifier_call_completions.error_kind IS
    'PROVIDER_TRANSIENT: a transport-level failure (5xx, timeout, connection '
    'reset) the provider adapter already retried internally before giving up. '
    'PROVIDER_REFUSAL: the model or provider policy declined to answer - an '
    'outcome, never a flake, never retried. SCHEMA_INVALID: the response did '
    'not conform to the required structured-output shape, whether caught by '
    'the provider itself or by this repository''s own independent re-parse. '
    'EVIDENCE_SPAN_UNVERIFIED: the response was schema-valid but at least one '
    'evidence span or unit_name failed literal-substring verification against '
    'the supplied document. TIMEOUT: the call exceeded its bounded time '
    'budget. OTHER: a failure that does not fit any named member. '
    'USAGE_LIMIT_EXHAUSTED (migration 0010): the owner''s Claude Max '
    'subscription session/weekly usage allowance was reached - never retried '
    'automatically, never given a paid fallback (there is none in this '
    'runtime), and recoverable only by a deliberate later attempt_no once the '
    'allowance resets. AUTH_FAILURE (migration 0010): the runtime''s '
    'subscription authentication was rejected after this call''s own '
    'pre-flight had already passed - recoverable only by the owner re-minting '
    'the credential outside this engine, never by retrying the call as-is. '
    'Every member here is nullable and required exactly when terminal_state '
    'is not COMPLETED (completed_is_clean_chk / incomplete_has_error_chk, '
    'migration 0009, unchanged).';
