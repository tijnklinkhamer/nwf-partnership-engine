/**
 * THE STRICT, VERSIONED OUTPUT CONTRACT — `orgunit-classifier-output-schema-v1`.
 *
 * ONE zod schema serves BOTH layers the Max-runtime design (§20) requires:
 *
 *   - the PROVIDER-FACING JSON Schema (`ORGUNIT_CLASSIFIER_OUTPUT_JSON_SCHEMA`,
 *     converted once via `z.toJSONSchema(..., { target: 'draft-7' })`) — what
 *     a future structured-output-capable provider is asked to produce;
 *   - LAYER 2 of the double-validation gate: the exact same schema re-parses
 *     the raw provider response independently, in `validate.ts`, never
 *     trusting that the provider actually honoured layer 1.
 *
 * `verdict` is modelled as a `z.discriminatedUnion`, not a flat object with
 * optional fields, so the CONDITIONAL truth table migration 0009's own
 * CHECKs enforce (`unit_type` iff UNIT_PAGE, `page_kind` iff NOT_A_UNIT, all
 * three relevance axes iff UNIT_PAGE, NEEDS_REVIEW carries none of them) is
 * enforced by THIS SCHEMA'S SHAPE, not merely documented — a response
 * mixing `verdict: NOT_A_UNIT` with a non-null `unit_type` fails to parse
 * before any semantic check runs. `z.toJSONSchema` renders a discriminated
 * union as `oneOf` branches keyed by a `const` discriminator, which the
 * Max-runtime design confirmed (§20, citing S8) is a supported structured-
 * output feature.
 *
 * Every object is `z.strictObject` — unknown keys are a parse failure, not a
 * silent drop — matching the design's "closed objects... no additional
 * properties" requirement (§9) as an actual validation behaviour, not only
 * JSON-Schema metadata.
 *
 * BOUNDS HERE ARE ADVISORY GUIDANCE TO THE PROVIDER, NOT THE AUTHORITATIVE
 * GATE. `z.string().max(n)` counts UTF-16 code units, and this repository's
 * own `main_text_chars` defect (documented in `web/extract.ts` and
 * migration 0007/ADR history) is exactly what happens when a UTF-16 length
 * is trusted where PostgreSQL's `length()` — Unicode CODE POINTS — is the
 * real bound. So the loose bounds below exist only to shape what the
 * provider is asked to produce; the EXACT, code-point-precise length gate
 * that actually decides persistence lives in `validate.ts`'s separate
 * length-validation step, which this file does not perform.
 *
 * `doc_index`'s membership in the supplied batch, and its uniqueness across
 * the response, are likewise NOT this schema's job — a schema has no way to
 * know what a specific batch's valid indices are. That is `validate.ts`'s
 * doc_index-completeness step.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import { z } from 'zod';

/** Versions THIS OUTPUT CONTRACT. Part of the persisted call identity (`finalIdentity.ts`). */
export const ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION = 'orgunit-classifier-output-schema-v1';

export const UNIT_TYPES = [
  'INTERNATIONAL_MOBILITY_OFFICE',
  'LANGUAGE_CENTRE',
  'LANGUAGE_DEPARTMENT',
  'OTHER_UNIT',
] as const;

export const PAGE_KINDS = [
  'DEGREE_PROGRAMME_PAGE',
  'NEWS_OR_EVENT_PAGE',
  'RESEARCH_PAGE',
  'NAVIGATION_OR_LANDING_PAGE',
  'SERVICE_TOOL_PAGE',
  'GENERIC_INSTITUTIONAL_PAGE',
  'OTHER_NON_UNIT',
] as const;

export const RELEVANCE_VALUES = ['YES', 'NO', 'UNKNOWN'] as const;

export const CONFIDENCE_VALUES = ['HIGH', 'MEDIUM', 'LOW'] as const;

/** The design's §7 closed evidence-source set — exactly the four fields a document actually carries. */
export const EVIDENCE_SOURCES = ['TITLE', 'HEADING', 'EXCERPT', 'URL_PATH'] as const;

export type UnitType = (typeof UNIT_TYPES)[number];
export type PageKind = (typeof PAGE_KINDS)[number];
export type RelevanceValue = (typeof RELEVANCE_VALUES)[number];
export type ConfidenceValue = (typeof CONFIDENCE_VALUES)[number];
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];

const EvidenceSpanSchema = z.strictObject({
  source: z.enum(EVIDENCE_SOURCES),
  // 200 is advisory (UTF-16 units); the exact code-point bound is enforced
  // separately in validate.ts, matching migration 0009's evidence_spans_quote_chk.
  quote: z.string().min(1).max(200),
});

export type EvidenceSpanOutput = z.infer<typeof EvidenceSpanSchema>;

/** Fields every verdict branch carries, regardless of which conditional fields it adds. */
const CommonFields = {
  doc_index: z.int().min(0),
  // Advisory (UTF-16 units) — see module comment; exact bound in validate.ts.
  unit_name: z.string().min(1).max(200).nullable(),
  confidence: z.enum(CONFIDENCE_VALUES),
  rationale: z.string().min(1).max(500),
  evidence_spans: z.array(EvidenceSpanSchema).min(1).max(4),
};

const UnitPageResultSchema = z.strictObject({
  ...CommonFields,
  verdict: z.literal('UNIT_PAGE'),
  unit_type: z.enum(UNIT_TYPES),
  page_kind: z.null(),
  serves_incoming_international_students: z.enum(RELEVANCE_VALUES),
  serves_outgoing_mobility_students: z.enum(RELEVANCE_VALUES),
  provides_language_learning_or_support: z.enum(RELEVANCE_VALUES),
});

const NotAUnitResultSchema = z.strictObject({
  ...CommonFields,
  verdict: z.literal('NOT_A_UNIT'),
  unit_type: z.null(),
  page_kind: z.enum(PAGE_KINDS),
  serves_incoming_international_students: z.null(),
  serves_outgoing_mobility_students: z.null(),
  provides_language_learning_or_support: z.null(),
});

const NeedsReviewResultSchema = z.strictObject({
  ...CommonFields,
  verdict: z.literal('NEEDS_REVIEW'),
  unit_type: z.null(),
  page_kind: z.null(),
  serves_incoming_international_students: z.null(),
  serves_outgoing_mobility_students: z.null(),
  provides_language_learning_or_support: z.null(),
});

/** One document's result. The discriminated union IS the conditional truth table (module comment). */
export const ClassificationResultSchema = z.discriminatedUnion('verdict', [
  UnitPageResultSchema,
  NotAUnitResultSchema,
  NeedsReviewResultSchema,
]);

export type ClassificationResult = z.infer<typeof ClassificationResultSchema>;

/**
 * The whole call-level response: one result per supplied document, no more,
 * no fewer than the schema itself can express (batch-specific completeness
 * is `validate.ts`'s job — this only says "at least one").
 */
export const ClassifierResponseSchema = z.array(ClassificationResultSchema).min(1);

export type ClassifierResponse = z.infer<typeof ClassifierResponseSchema>;

/**
 * The provider-facing JSON Schema, computed once at module load. Draft-07,
 * per the Max-runtime design's verified provider contract (§20, citing S8).
 */
export const ORGUNIT_CLASSIFIER_OUTPUT_JSON_SCHEMA: unknown = z.toJSONSchema(
  ClassifierResponseSchema,
  { target: 'draft-7' },
);
