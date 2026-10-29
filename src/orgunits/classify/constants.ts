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
 *
 * `v2` (Phase 2B-2D2B-1): assembly now canonicalises the evidence text of
 * documents whose page evidence predates canonical extraction - see
 * `EXTRACTION_VERSION_REQUIRING_ASSEMBLY_CANONICALISATION` below. That
 * changes the BYTES a call reads for such documents, hence the bump: a v1
 * and a v2 assembly of the same run are genuinely different inputs and must
 * hash differently rather than collide under one version label.
 */
export const ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION = 'orgunit-classifier-assembly-v2';

/**
 * THE NARROW, REVIEWED EXTRACTION-VERSION GATE (Phase 2B-2D2B-1).
 *
 * Evidence persisted under THIS exact `extraction_rule_version` predates
 * canonical extraction, so `document.ts` canonicalises its text while
 * building the classifier document. Evidence written under
 * `orgunit-extraction-v2` is ALREADY canonical and is passed through
 * untouched - decoding it again would turn an author's literal
 * `&amp;eacute;` into `é`, a character the page never contained.
 *
 * WHY A SINGLE EQUALITY, NOT AN ORDERING. There is no version comparator
 * here and there must not be one: inventing "any version below v2" would
 * require this module to parse arbitrary future version strings and decide
 * what they mean, and it would silently opt in a v0 or a
 * `orgunit-extraction-v1-experimental` nobody reviewed. The set of versions
 * needing assembly-time canonicalisation is a closed, historical fact -
 * exactly one member - and it is written here as exactly one member.
 *
 * WHY THIS IS NOT SIMPLY FIXED IN THE DATABASE. Canonicalising the persisted
 * rows would be an UPDATE of append-only evidence, which `nwf_research`
 * cannot perform and which this repository's provenance rules forbid; and
 * re-extracting them is impossible, because no response body is stored
 * anywhere (rule 17). So the correction is applied at READ time, and the
 * stored `extractionRuleVersion` is carried into the document unchanged as
 * provenance - a reader can always tell that a canonical document was
 * derived from v1 bytes.
 */
export const EXTRACTION_VERSION_REQUIRING_ASSEMBLY_CANONICALISATION = 'orgunit-extraction-v1';

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
