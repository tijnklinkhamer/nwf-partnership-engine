-- 0008_signed_candidate_score.sql
-- Removes a domain restriction migration 0007 placed on
-- orgunit_page_candidates.candidate_score BEFORE the deterministic scoring
-- formula it was meant to describe existed.
--
-- WHAT WAS WRONG
--
--   Migration 0007 (Phase 2B-1a) created the candidates table as SCHEMA ONLY:
--   no scorer existed yet, no code produced a candidate_score, and all eight
--   orgunit_* tables were empty. In that state, `candidate_score >= 0` looked
--   like an obvious sanity bound on "a score".
--
--   Phase 2B-1d then established what a candidate score actually IS
--   (docs/adr/0007-deterministic-orgunit-signal-rules-v1.md). It is a SIGNED
--   sum, computed in src/orgunits/signals/score.ts as:
--
--     sum(positive weights) - sum(negative weights) - sum(veto weights)
--
--   with NO zero floor, deliberately. A page carrying only structural
--   negatives and no unit vocabulary is genuinely worth LESS than a page
--   carrying neither, and collapsing both to 0 would erase that distinction.
--
--   Phase 2B-1e then made this reachable for the first time: it is the slice
--   that actually persists candidate rows.
--
--   Measured against the landed scorer at the time this migration was written
--   (weights.ts: SINGLE_GENERIC=1, PROGRAMME_SHAPE=4, STRUCTURAL=3,
--   STRUCTURAL_LIGHT=2), every one of these is an ordinary page an ordinary
--   institutional site will produce, and every one scores below zero:
--
--     title "MSc International Marketing"
--       track A:  +1 (A_INTERNATIONAL_GENERIC) - 4 (NEG_PROGRAMME_SHAPE) = -3
--       track B:   0                           - 4 (NEG_PROGRAMME_SHAPE) = -4
--     title "Login",       /login/       -> -3 on both tracks (NEG_LOGIN_AUTH)
--     title "News archive",/news/archive/-> -2 on both tracks (NEG_NEWS_ARCHIVE)
--     a .pdf link                        -> -3 on both tracks
--                                           (NEG_BINARY_FILE_EXTENSION)
--
--   "MSc International Marketing" is not an incidental example. It is the
--   CANONICAL case ADR 0007 s3/s9 uses to explain why this deterministic layer
--   cannot separate a unit from a degree programme, and why type_hint admits
--   DEGREE_PROGRAMME at all.
--
--   So the CHECK and the scorer disagreed about the value domain, and the
--   database would have won: a real research run would have raised
--   `violates check constraint "orgunit_page_candidates_score_chk"` on the
--   first ordinary login page or PDF link it ranked, aborting that root's
--   candidate persistence. No live research run has been executed, so this was
--   caught before it produced a single bad row.
--
-- WHY THE SCHEMA MOVES AND THE SCORER DOES NOT
--
--   The tempting "fix" is a clamp in the application - Math.max(0, score) or
--   equivalent - and it would be wrong in a way that is hard to see later:
--
--     - it DESTROYS information. -2 and -4 are different findings; 0 and 0
--       are not.
--     - it COLLAPSES deterministic ordering. Ranking is by score, and
--       flattening the negative tail makes tie-breaking do work the score is
--       supposed to do.
--     - it makes the PERSISTED value differ from the SCORER'S OUTPUT, so a
--       stored row would no longer be reproducible by re-running
--       orgunit-signal-rules-v1 over the same evidence - which is the entire
--       auditability claim of the deterministic layer.
--     - it would silently alter a VERSIONED ruleset without bumping its
--       version.
--
--   The scoring ruleset owns score production. The database's job is to store
--   that signed result faithfully. So the schema is what changes here.
--
-- WHAT THIS CHANGES, AND WHAT IT DOES NOT
--
--   It drops exactly ONE constraint: the non-negative domain restriction.
--   Nothing else about the column or the table moves.
--
--   candidate_score STAYS numeric(8,4) NOT NULL. The type is unchanged
--   because it already represents the scorer's full output faithfully:
--   integer weights well inside +/-9999.9999. The type itself remains the
--   only bound on magnitude, which is the honest one - it reflects storage,
--   not a guess about how negative a legitimate score may be.
--
--   NO NEW LOWER BOUND IS INTRODUCED. A replacement such as
--   `candidate_score >= -10` would be exactly the same mistake this migration
--   corrects: a number invented by schema review rather than derived from the
--   ruleset. Weights are versioned and reviewable in weights.ts; if a bound
--   is ever wanted, it belongs there, tied to a rule version, not here.
--
--   Every other constraint on the table is deliberately left in place -
--   the primary key, both foreign keys, the composite root_fk that pins a
--   candidate to its own page's root, the track and type_hint taxonomies,
--   the rank and rule_version checks, the jsonb-array check on signals, and
--   NOT NULL on candidate_score itself. A score is still required; only its
--   sign is no longer restricted.
--
--   It changes ONLY what values future INSERTs may carry. It rewrites no row
--   (there are none: all eight orgunit_* tables were empty in both the working
--   and the test database when this was written) and it grants no privilege.
--   nwf_research still holds SELECT and INSERT and nothing else; dropping a
--   CHECK does not widen a grant.

ALTER TABLE orgunit_page_candidates
    DROP CONSTRAINT orgunit_page_candidates_score_chk;

-- Restated in full rather than appended to, because COMMENT ON replaces.
-- Migration 0007's text is preserved verbatim below and extended with the
-- signed-domain paragraph; 0007 itself is untouched, as forward-only history
-- requires.
COMMENT ON COLUMN orgunit_page_candidates.candidate_score IS
    'The deterministic score of a page that has been READ. Deliberately NOT a '
    'frontier score: a frontier score ranks a URL before it is fetched and may '
    'inherit from its URL tree, and letting that inheritance reach this column '
    'would silently convert "worth trying" into "worth reporting". No '
    'frontier score column exists in this schema, and if one is ever added it '
    'belongs on the frontier, not here. '
    'SIGNED, AND THAT IS LOAD-BEARING (migration 0008). The value is '
    'positives - negatives - vetoes under a named rule_version, with no zero '
    'floor: a page carrying only structural negatives scores below zero, and '
    'the canonical case is a degree-programme title such as "MSc '
    'International Marketing" (ADR 0007). Migration 0007 originally carried a '
    'CHECK (candidate_score >= 0) written before that formula existed; it was '
    'dropped rather than satisfied by clamping, because clamping in the '
    'application would make the stored value differ from the scorer''s output '
    'and break the reproducibility the deterministic layer exists to provide. '
    'Store what the ruleset computed.';
