/**
 * GOLD CORPUS SCHEMAS - the committed shape of
 * `src/test/fixtures/evaluation/orgunit-classifier-gold-v1.jsonl` (corpus
 * items), `orgunit-classifier-adjudication-v1.jsonl` (label proposals and
 * their adjudication status) and
 * `orgunit-classifier-injection-v1.jsonl` (the SEPARATE security suite).
 *
 * TWO FILES, TWO OWNERS. The corpus file is DETERMINISTIC: regenerated
 * byte-identically from the database by `scripts/build-gold-corpus.ts`. The
 * adjudication file is EDITORIAL: proposed labels with provenance, every one
 * `ADJUDICATION_REQUIRED` until the owner confirms it - no model's answer,
 * this session's included, becomes gold truth by itself (design SS23:
 * "Claude never grades Claude"; the operator confirms the full set).
 *
 * Label fields reuse the production WIRE vocabulary exactly
 * (`outputSchema.ts`'s exported value arrays) so a gold label can never
 * drift from what a model can actually answer.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import { z } from 'zod';
import { PAGE_KINDS, RELEVANCE_VALUES, UNIT_TYPES } from '../outputSchema.js';

const Sha256Schema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, 'expected a lowercase 64-character hex SHA-256');

/** `g` + first 16 hex of the item's identity hash - see `select.ts`. */
export const GoldIdSchema = z.string().regex(/^g[0-9a-f]{16}$/);

const HeadingSchema = z.strictObject({
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  text: z.string(),
});

const RootRefSchema = z.strictObject({
  rootKey: z.string().min(1),
  authorityKind: z.enum(['claim', 'promotion']),
  url: z.string().min(1),
});

const SignalSchema = z.strictObject({
  track: z.enum(['A', 'B']),
  id: z.string().min(1),
  kind: z.enum(['positive', 'negative', 'veto']),
  field: z.string().min(1),
});

/** Mirrors `ClassifierDocument` exactly - the bytes a production call would read. */
export const GoldDocumentSchema = z.strictObject({
  docIndex: z.int().min(0),
  url: z.string().min(1),
  title: z.string().nullable(),
  declaredLang: z.string().nullable(),
  headings: z.array(HeadingSchema),
  excerpt: z.string(),
  mainTextTruncated: z.boolean(),
  excerptTruncated: z.boolean(),
  extractionRuleVersion: z.string().min(1),
  discoveryMethod: z.string().min(1),
  roots: z.array(RootRefSchema),
  trackMembership: z.array(z.enum(['A', 'B'])),
  duplicateUrls: z.array(z.string()),
  signals: z.array(SignalSchema),
});

export const LANGUAGE_STRATA = ['FR', 'EN', 'OTHER', 'UNDECLARED'] as const;
export const SCORE_SIGNS = ['NEGATIVE', 'ZERO', 'POSITIVE'] as const;
export const SPLIT_VALUES = ['DEVELOPMENT', 'HOLDOUT'] as const;

/** Mechanical, label-free strata - derived by `strata.ts`, never asserted by hand. */
export const GoldStrataSchema = z.strictObject({
  language: z.enum(LANGUAGE_STRATA),
  trackMembership: z.array(z.enum(['A', 'B'])).min(1),
  trackAScoreSign: z.enum(SCORE_SIGNS).nullable(),
  trackBScoreSign: z.enum(SCORE_SIGNS).nullable(),
  sparse: z.boolean(),
  truncated: z.boolean(),
  hasDuplicateUrls: z.boolean(),
  discoveryMethod: z.string().min(1),
});

/** Rank/score provenance per track - evaluator metadata ONLY, never model input. */
export const CandidateMetaSchema = z.strictObject({
  track: z.enum(['A', 'B']),
  candidateScore: z.number(),
  rankWithinRoot: z.int().min(1),
  rootKey: z.string().min(1),
});

export const GoldCorpusItemSchema = z.strictObject({
  goldId: GoldIdSchema,
  corpusVersion: z.string().min(1),
  echeRowKey: z.string().min(1),
  organisationId: z.string().min(1),
  organisationName: z.string().min(1),
  countryCode: z.string().min(1),
  runId: z.string().min(1),
  batchRootKey: z.string().nullable(),
  assemblyInputSha256: Sha256Schema,
  docIndex: z.int().min(0),
  pageEvidenceId: z.string().min(1),
  responseSha256: Sha256Schema,
  candidateMeta: z.array(CandidateMetaSchema).min(1),
  document: GoldDocumentSchema,
  documentSha256: Sha256Schema,
  strata: GoldStrataSchema,
  split: z.enum(SPLIT_VALUES),
});

export type GoldCorpusItem = z.infer<typeof GoldCorpusItemSchema>;

export const GOLD_STATUSES = ['GOLD_CONFIRMED', 'ADJUDICATION_REQUIRED'] as const;
export const LABEL_PROVENANCES = [
  /** Mapped from a page-level judgement in a frozen 2026-08 shadow audit. */
  'AUDIT_2026_08',
  /** Proposed editorially in the 2B-2D1 session; requires owner confirmation. */
  'EDITORIAL_PROPOSED',
  /** Follows mechanically from structure (e.g. an empty-excerpt page); still owner-confirmed. */
  'DETERMINISTIC',
  /** Set directly by the owner during adjudication. */
  'OWNER',
  /**
   * Phase 2B-2D1B: a routine item independently researched against its own
   * captured evidence (never a candidate model's output) and confirmed gold
   * WITHOUT owner review - distinct from `OWNER` so a reader can always tell
   * which of the two confirmed the label.
   */
  'EDITORIAL_RESEARCH_CONFIRMED',
] as const;
export const ADJUDICATION_DIFFICULTIES = ['EASY', 'MODERATE', 'HARD'] as const;

/**
 * A proposed gold label. Verdict-conditional fields follow the SAME
 * biconditionals as the production output schema; `superRefine` enforces
 * them so a malformed gold label cannot be committed.
 */
export const ProposedLabelSchema = z
  .strictObject({
    verdict: z.enum(['UNIT_PAGE', 'NOT_A_UNIT', 'NEEDS_REVIEW']),
    unit_type: z.enum(UNIT_TYPES).nullable(),
    page_kind: z.enum(PAGE_KINDS).nullable(),
    serves_incoming_international_students: z.enum(RELEVANCE_VALUES).nullable(),
    serves_outgoing_mobility_students: z.enum(RELEVANCE_VALUES).nullable(),
    provides_language_learning_or_support: z.enum(RELEVANCE_VALUES).nullable(),
    /**
     * `NULL`: no unit name is stated in the evidence, the model must return
     * null. `NAMED`: a name is stated; `name` records it for reporting, but
     * the hard gate on the model's `unit_name` stays the mechanical
     * verification rule - name AGREEMENT is a soft, reported metric only.
     * `ANY`: either behaviour is acceptable (e.g. NEEDS_REVIEW pages).
     */
    unit_name_expectation: z.strictObject({
      kind: z.enum(['NULL', 'NAMED', 'ANY']),
      name: z.string().min(1).max(200).nullable(),
    }),
    /** True when this item belongs to the hard-negative rejection denominator. */
    hard_negative: z.boolean(),
  })
  .superRefine((label, ctx) => {
    const isUnit = label.verdict === 'UNIT_PAGE';
    const isNonUnit = label.verdict === 'NOT_A_UNIT';
    if (isUnit === (label.unit_type === null)) {
      ctx.addIssue({ code: 'custom', message: 'unit_type must be set iff verdict is UNIT_PAGE' });
    }
    if (isNonUnit === (label.page_kind === null)) {
      ctx.addIssue({ code: 'custom', message: 'page_kind must be set iff verdict is NOT_A_UNIT' });
    }
    for (const axis of [
      label.serves_incoming_international_students,
      label.serves_outgoing_mobility_students,
      label.provides_language_learning_or_support,
    ]) {
      if (isUnit === (axis === null)) {
        ctx.addIssue({
          code: 'custom',
          message: 'each relevance axis must be set iff verdict is UNIT_PAGE',
        });
      }
    }
    if (label.hard_negative && label.verdict !== 'NOT_A_UNIT') {
      ctx.addIssue({ code: 'custom', message: 'hard_negative requires verdict NOT_A_UNIT' });
    }
    if (label.unit_name_expectation.kind === 'NAMED') {
      if (label.unit_name_expectation.name === null) {
        ctx.addIssue({ code: 'custom', message: 'NAMED expectation requires a name' });
      }
    } else if (label.unit_name_expectation.name !== null) {
      ctx.addIssue({ code: 'custom', message: 'only NAMED expectation carries a name' });
    }
  });

export type ProposedLabel = z.infer<typeof ProposedLabelSchema>;

export const AdjudicationItemSchema = z.strictObject({
  goldId: GoldIdSchema,
  corpusVersion: z.string().min(1),
  /** Convenience identity for the human reader; the join key is `goldId`. */
  url: z.string().min(1),
  title: z.string().nullable(),
  organisationName: z.string().min(1),
  proposed: ProposedLabelSchema,
  provenance: z.enum(LABEL_PROVENANCES),
  difficulty: z.enum(ADJUDICATION_DIFFICULTIES),
  /** One or two sentences: why this label, citing the evidence. */
  rationale: z.string().min(1).max(1000),
  /** The precise ambiguity the owner must resolve; null when confirmation is routine. */
  ambiguity: z.string().max(1000).nullable(),
  goldStatus: z.enum(GOLD_STATUSES),
});

export type AdjudicationItem = z.infer<typeof AdjudicationItemSchema>;

/**
 * The SEPARATE security-suite item shape (task SS32): synthetic documents
 * whose text attempts instruction injection. Never mixed into semantic
 * accuracy denominators.
 */
export const InjectionSuiteItemSchema = z.strictObject({
  injectionId: z.string().regex(/^inj-[a-z0-9-]+$/),
  suiteVersion: z.string().min(1),
  attackClass: z.enum([
    'TASK_OVERRIDE',
    'TOOL_REQUEST',
    'BROWSER_OR_SEARCH_REQUEST',
    'SECRET_EXFILTRATION',
    'JSON_SHAPE_CHANGE',
    'INSTRUCTION_IMPERSONATION',
    'CROSS_DOCUMENT_INFLUENCE',
  ]),
  document: GoldDocumentSchema,
  documentSha256: Sha256Schema,
  /** The verdict the CONTENT deserves, ignoring the embedded instructions. */
  expected: ProposedLabelSchema,
  expectation: z.string().min(1).max(1000),
});

export type InjectionSuiteItem = z.infer<typeof InjectionSuiteItemSchema>;
