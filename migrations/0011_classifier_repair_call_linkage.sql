-- 0011_classifier_repair_call_linkage.sql
-- Lets one classifier call be recorded as the ONE bounded, item-level
-- REPAIR of one document of an earlier call, and makes "one repair per
-- document, never a repair of a repair" a database guarantee rather than
-- an application convention (Phase 2B-2D2C-R1, ADR 0011).
--
-- WHAT A REPAIR CALL IS
--
--   The Max-runtime retry taxonomy (design §21, class E) said a document
--   whose answer failed layer-2 validation - an evidence span that is not a
--   literal substring of the field it names, a unit_name no supplied field
--   supports, a length bound exceeded - is DROPPED and never automatically
--   re-asked. Phase 2B-2D2C attempt 1 measured that rule against a gate
--   requiring every one of 49 documents to verify: two documents failed
--   identically under two prompts, one of them defeating the exact prompt
--   clause aimed at it. ADR 0011 therefore permits EXACTLY ONE repair round
--   per logical evaluation: each rejected document may be re-presented
--   ONCE, alone, with a structured notice of its invalid fields, to the
--   same provider under the same prompt and schema, and the UNCHANGED
--   validator decides again. Nothing is corrected, substituted or rewritten
--   by code; the original call, its completion and its accepted rows are
--   never touched.
--
--   A repair is its own row here - "one attempted invocation, recorded
--   before the provider answers" - exactly as the table's own comment
--   defines a row, and it carries its own append-only completion. The two
--   columns below are the ONLY things that distinguish it from an ordinary
--   call: which call it repairs, and which document of that call.
--
-- WHAT IS ENFORCED HERE, AND HOW
--
--   1. repair_of_call_id and repair_doc_index are set together or not at
--      all (repair_pair_chk): a row is either an ordinary call or a repair
--      of one named document, never half of either.
--   2. A repair carries exactly one document (repair_single_document_chk):
--      the isolation boundary ADR 0011 requires - no sibling document
--      travels with a repair - is visible in the row itself.
--   3. AT MOST ONE repair per (original call, document)
--      (orgunit_classifier_calls_repair_uidx, partial): a second repair of
--      the same document is a unique-violation error, not a policy the
--      application must remember.
--   4. A repair never repairs a repair
--      (orgunit_classifier_calls_refuse_repair_of_repair, a BEFORE INSERT
--      trigger): the referenced call must itself be an ordinary call. A
--      CHECK cannot look at another row, so this is the one place in this
--      schema a trigger is used; it reads only the referenced row and
--      raises, and it has no UPDATE/DELETE path because the role has none.
--   5. A repair never references itself (repair_not_self_chk).
--
--   "Only documents rejected as EVIDENCE or LENGTH may be repaired", "only
--   inside the original evaluation's remaining time budget" and "never for
--   a TIMEOUT, a provider failure or a whole-call SCHEMA_INVALID" are
--   APPLICATION-ENFORCED invariants (src/orgunits/classify/repair.ts,
--   pinned by tests and the firewall): the database does not hold the
--   validator's verdict per document or the clock, so it cannot check them,
--   and pretending otherwise would be a false guarantee.
--
-- WHAT DOES NOT CHANGE
--
--   The identity index (input_sha256, model_id, prompt_version,
--   classifier_version, output_schema_version, attempt_no) is untouched: a
--   repair's input_sha256 is computed over its OWN single-document request
--   (repair.ts), so it can never collide with, reuse or shadow the original.
--   attempt_no keeps its meaning - an operator-authorised reattempt of a
--   whole logical evaluation - and a repair carries the SAME attempt_no as
--   its original. The completion table is untouched: a repair completes
--   COMPLETED (its one document was accepted and persisted), or FAILED with
--   the existing error_kind vocabulary (EVIDENCE_SPAN_UNVERIFIED /
--   SCHEMA_INVALID when the validator rejected it again, TIMEOUT when its
--   window expired, the provider kinds when the provider failed, OTHER when
--   the orchestrator recorded the decision NOT to send it because too
--   little of the original budget remained - the error_summary names
--   REPAIR_SKIPPED_INSUFFICIENT_BUDGET in that case). A repair never
--   completes PARTIAL: with one document there is no partial.
--
--   No grant changes. nwf_classifier still holds exactly SELECT and INSERT
--   on its four tables; the trigger function runs with the invoker's
--   privileges and needs only SELECT on this table, which the role has.
--   No row exists to rewrite: all four Phase 2B-2 tables held zero rows in
--   the local databases when this migration was written.

ALTER TABLE orgunit_classifier_calls
    ADD COLUMN repair_of_call_id uuid REFERENCES orgunit_classifier_calls (id),
    ADD COLUMN repair_doc_index  integer;

ALTER TABLE orgunit_classifier_calls
    ADD CONSTRAINT orgunit_classifier_calls_repair_pair_chk
        CHECK ((repair_of_call_id IS NULL) = (repair_doc_index IS NULL)),
    ADD CONSTRAINT orgunit_classifier_calls_repair_doc_index_chk
        CHECK (repair_doc_index IS NULL OR repair_doc_index >= 0),
    ADD CONSTRAINT orgunit_classifier_calls_repair_single_document_chk
        CHECK (repair_of_call_id IS NULL OR input_document_count = 1),
    ADD CONSTRAINT orgunit_classifier_calls_repair_not_self_chk
        CHECK (repair_of_call_id IS NULL OR repair_of_call_id <> id);

-- ONE repair per (original call, document). Partial, so ordinary calls
-- (both columns NULL) never collide with each other.
CREATE UNIQUE INDEX orgunit_classifier_calls_repair_uidx
    ON orgunit_classifier_calls (repair_of_call_id, repair_doc_index)
    WHERE repair_of_call_id IS NOT NULL;

CREATE INDEX orgunit_classifier_calls_repair_of_idx
    ON orgunit_classifier_calls (repair_of_call_id)
    WHERE repair_of_call_id IS NOT NULL;

-- A repair never repairs a repair. The referenced row must be an ORDINARY
-- call (its own repair_of_call_id IS NULL). Raised as a check_violation
-- (SQLSTATE 23514) so callers see the same error class a CHECK would give.
CREATE FUNCTION orgunit_classifier_calls_refuse_repair_of_repair()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    parent_is_repair boolean;
BEGIN
    IF NEW.repair_of_call_id IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT (c.repair_of_call_id IS NOT NULL)
      INTO parent_is_repair
      FROM orgunit_classifier_calls c
     WHERE c.id = NEW.repair_of_call_id;
    IF parent_is_repair IS NULL THEN
        -- The foreign key reports a missing parent; nothing to add here.
        RETURN NEW;
    END IF;
    IF parent_is_repair THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'orgunit_classifier_calls: a repair call may not repair another repair call',
            CONSTRAINT = 'orgunit_classifier_calls_repair_of_repair_chk';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER orgunit_classifier_calls_refuse_repair_of_repair
    BEFORE INSERT ON orgunit_classifier_calls
    FOR EACH ROW
    EXECUTE FUNCTION orgunit_classifier_calls_refuse_repair_of_repair();

COMMENT ON COLUMN orgunit_classifier_calls.repair_of_call_id IS
    'NULL for an ordinary call. Otherwise this row is the ONE bounded '
    'item-level REPAIR (ADR 0011, retry taxonomy class E as amended) of one '
    'document of the referenced ORDINARY call: the same prompt, schema, '
    'model and attempt_no, one document only, re-asked once after the '
    'referenced call''s own raw output and validation were persisted. '
    'The referenced call and its completion are never edited; a repair '
    'never references another repair (trigger-enforced); at most one repair '
    'exists per (referenced call, repair_doc_index) (unique index).';

COMMENT ON COLUMN orgunit_classifier_calls.repair_doc_index IS
    'The doc_index, within the referenced call''s batch, of the ONE document '
    'this repair re-asks. Set exactly when repair_of_call_id is set. The '
    'repair''s own single document keeps this same doc_index so the '
    'validator addresses it identically.';
