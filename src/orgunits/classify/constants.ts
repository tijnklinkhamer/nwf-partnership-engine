/**
 * FROZEN BOUNDS for Phase 2B-2b classifier handoff assembly.
 *
 * Every number here is named in
 * `docs/audits/PHASE_2B_2_SEMANTIC_CLASSIFIER_DESIGN_2026-08.md` §3, and
 * changing one is a reviewed edit to that design, not a runtime option -
 * the same discipline `orchestrator/constants.ts` applies to acquisition
 * budgets.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */

/**
 * Versions the HANDOFF ASSEMBLY POLICY implemented by this namespace -
 * selection rule, content-hash dedupe, input bounds, canonical ordering and
 * serialization. Deliberately separate from `ORGUNIT_SIGNAL_RULE_VERSION`
 * (the deterministic ranking ruleset a run was scored under) and from the
 * classifier prompt/output-schema/model versions 2B-2c will introduce - the
 * four version dimensions must remain independently traceable (design §26,
 * §28).
 */
export const ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION = 'orgunit-classifier-assembly-v1';

/**
 * Per (root, track) eligibility cutoff, by the PERSISTED `rank_within_root`
 * column - never re-derived. Score-agnostic: positive, zero and negative
 * `candidate_score` rows within this cutoff are equally eligible. See design
 * §3 "the floor is wrong, stated precisely" - a `candidate_score > 0` floor
 * was proposed and explicitly REJECTED on owner review.
 */
export const MAX_CANDIDATES_PER_ROOT_TRACK = 8;

/**
 * Maximum unique (post-dedupe) documents in one classifier call payload.
 * `MAX_CANDIDATES_PER_ROOT_TRACK` × 2 tracks = 16 per root pre-dedupe, so a
 * SINGLE root can never reach this bound; only combining multiple roots'
 * eligible sets can, which is exactly the condition the per-root overflow
 * split (see `ordering.ts`) exists to resolve.
 */
export const MAX_UNIQUE_DOCUMENTS_PER_BATCH = 24;

/** Maximum redacted excerpt length, in Unicode CODE POINTS, per document. */
export const MAX_EXCERPT_CODE_POINTS = 2_000;

/** Maximum headings retained per document. */
export const MAX_HEADINGS_PER_DOCUMENT = 12;

/** Maximum length of one heading's text, in Unicode CODE POINTS. */
export const MAX_HEADING_CODE_POINTS = 200;

/**
 * Defensive ceiling on one batch's canonical serialized size, in Unicode
 * CODE POINTS. Design §3: "unreachable under the per-document bounds" in
 * the ordinary case - real excerpts/headings/titles rarely approach their
 * own maxima - but not a mathematical impossibility, so `ordering.ts` still
 * measures the actual canonical size and splits further rather than assume
 * it never binds.
 */
export const MAX_BATCH_PAYLOAD_CODE_POINTS = 64_000;
