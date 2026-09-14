/**
 * THE ONE BOUNDED ITEM-LEVEL REPAIR ROUND — PURE DECISION AND REQUEST
 * CONSTRUCTION (Phase 2B-2D2C-R1, ADR 0011; retry taxonomy class E as
 * amended).
 *
 * WHAT A REPAIR IS. After a classifier call's raw output and its layer-2
 * validation have both been durably persisted, each document the validator
 * rejected for an ITEM-LEVEL reason (category `EVIDENCE` or `LENGTH`) may
 * be re-presented to the provider EXACTLY ONCE, ALONE: the same frozen
 * system prompt, the same output schema, the same batch context, that one
 * document, and a structured notice naming the invalid fields, the values
 * the model emitted for them and machine-readable reason codes. The
 * UNCHANGED validator (`validate.ts`) decides the repair's answer exactly
 * as it decided the original. Nothing here corrects, substitutes or
 * rewrites a `unit_name`, a quote or a `source`; a repair that fails
 * validation is terminally rejected.
 *
 * WHAT IS NEVER REPAIRED, and why each exclusion is structural here:
 *
 *   - a whole-call `SCHEMA_INVALID` (class D: the SDK already re-prompted;
 *     nothing item-level exists to repair) — `planRepairRound` returns no
 *     candidate when `validation.kind === 'SCHEMA_INVALID'`;
 *   - a `DOC_INDEX` rejection (a missing, duplicated or out-of-batch
 *     result is a batch-shape defect, not a document's evidence contract)
 *     — listed under `excluded`, never a candidate;
 *   - any non-OK provider outcome (TIMEOUT, transient, refusal, usage
 *     limit, auth) — there is no validation result to plan from, so the
 *     orchestrator never reaches this module;
 *   - a repair of a repair — `originalIsRepair` short-circuits the plan,
 *     and migration 0011's trigger refuses the row regardless;
 *   - anything a gold label or an expected answer would inform — this
 *     module imports no evaluation fixture and has no input for one.
 *
 * ISOLATION. `buildRepairRequest` serialises `{ context, documents: [the
 * one document], repair: notice }` with the SAME canonicaliser the original
 * request used. No sibling document, no sibling output and no previous full
 * output can enter: the type has nowhere to put them.
 *
 * BUDGET. A repair spends the ORIGINAL logical evaluation's total budget,
 * measured by the caller on the injectable clock from the moment the
 * original provider call was entered. `decideRepairBudget` is the one
 * arithmetic: the usable window is the remaining budget minus the hard-kill
 * grace; below the named minimum it is a SKIP, recorded, with zero provider
 * calls. The provider then bounds each attempt by
 * min(soft deadline, window) exactly as it bounds an original attempt.
 * The three liveness numbers are restated here under repair-specific names
 * and pinned EQUAL to the runtime's frozen constants by test — never
 * imported from the provider namespace, which this module must not reach.
 *
 * PURE. No network, no database, no filesystem, no clock, no environment
 * read. It never names a persistence table and issues no write.
 */
import { createHash } from 'node:crypto';
import { canonicalStringify } from './canonical.js';
import { evidenceSpanVerifies, unitNameVerifies } from './evidenceVerification.js';
import {
  ClassifierResponseEnvelopeSchema,
  EVIDENCE_SOURCES,
  type ClassificationResult,
  type EvidenceSource,
} from './outputSchema.js';
import type { ClassifierBatch, ClassifierDocument } from './types.js';
import {
  MAX_EVIDENCE_QUOTE_CODE_POINTS,
  MAX_RATIONALE_CODE_POINTS,
  MAX_UNIT_NAME_CODE_POINTS,
  type RejectedDocument,
  type ValidationResult,
} from './validate.js';
import { unicodeCodePointLength } from '../web/extract.js';

/** Versions the SHAPE of the repair notice and of the serialised repair request. Bump on any change to either. */
export const REPAIR_REQUEST_VERSION = 'orgunit-classifier-repair-request-v1';

/** ADR 0011: exactly one repair round per logical evaluation, and this module cannot express another number. */
export const REPAIR_MAX_ROUNDS_PER_LOGICAL_EVALUATION = 1 as const;

/**
 * The original logical evaluation's total provider budget, in milliseconds.
 * EQUAL BY CONTRACT to the runtime's frozen `CLASSIFIER_CALL_TOTAL_BUDGET_MS`
 * (600 s); pinned by test. Restated rather than imported so this module
 * never reaches the provider namespace.
 */
export const REPAIR_TOTAL_BUDGET_MS = 600_000;

/** EQUAL BY CONTRACT to the runtime's frozen hard-kill grace (10 s); pinned by test. */
export const REPAIR_HARD_KILL_GRACE_MS = 10_000;

/** EQUAL BY CONTRACT to the runtime's frozen per-attempt soft deadline (300 s); pinned by test. Informational here: the provider applies it. */
export const REPAIR_ATTEMPT_SOFT_DEADLINE_MS = 300_000;

/**
 * Below this much USABLE window (remaining budget minus the grace) a repair
 * is skipped rather than started. OWNER-SELECTED for F0C (2026-09-14):
 * 120 000 ms. The auth-status pre-flight runs INSIDE the repair window and
 * may take up to 60 000 ms, so at exactly the floor a worst-case auth-status
 * check still leaves 60 000 ms of runner window - more than the slowest
 * observed attempt-1 full evaluation (50 179 ms, itself including its own
 * auth-status check). A conservative readiness threshold, not a proof that
 * a repair succeeds. The earlier 60 000 ms value (equal to the auth-status
 * bound alone) was rejected: at that floor a worst-case auth-status check
 * consumed the whole window and produced a TIMEOUT with zero inference.
 */
export const REPAIR_MINIMUM_REMAINING_BUDGET_MS = 120_000;

export interface RepairPolicy {
  readonly enabled: boolean;
  readonly maxRoundsPerLogicalEvaluation: typeof REPAIR_MAX_ROUNDS_PER_LOGICAL_EVALUATION;
  readonly minimumRemainingBudgetMs: number;
}

/** The default: exactly the pre-R1 fail-closed behaviour. No candidate is ever planned. */
export const REPAIR_POLICY_DISABLED: RepairPolicy = Object.freeze({
  enabled: false,
  maxRoundsPerLogicalEvaluation: REPAIR_MAX_ROUNDS_PER_LOGICAL_EVALUATION,
  minimumRemainingBudgetMs: REPAIR_MINIMUM_REMAINING_BUDGET_MS,
});

/** The one enabled shape ADR 0011 admits. */
export const REPAIR_POLICY_ONE_ROUND: RepairPolicy = Object.freeze({
  enabled: true,
  maxRoundsPerLogicalEvaluation: REPAIR_MAX_ROUNDS_PER_LOGICAL_EVALUATION,
  minimumRemainingBudgetMs: REPAIR_MINIMUM_REMAINING_BUDGET_MS,
});

/** The validator categories a repair may address. `DOC_INDEX` is deliberately absent. */
export const REPAIRABLE_CATEGORIES = ['EVIDENCE', 'LENGTH'] as const;
export type RepairableCategory = (typeof REPAIRABLE_CATEGORIES)[number];

/**
 * Stable, machine-readable reason codes. Derived DETERMINISTICALLY from the
 * rejected result and its own document with the same pure helpers the
 * validator uses; never from a gold label. `EVIDENCE_SPAN_VERIFIES_UNDER_OTHER_SOURCE`
 * is a DIAGNOSTIC (the quote is literal in a different field than the one
 * the model named) — a reason, never an acceptance: the validator's
 * verdict stands and the model must answer again.
 */
export const REPAIR_REASON_CODES = [
  'UNIT_NAME_UNSUPPORTED',
  'EVIDENCE_SPAN_NOT_LITERAL',
  'EVIDENCE_SPAN_VERIFIES_UNDER_OTHER_SOURCE',
  'LENGTH_EXCEEDED',
] as const;
export type RepairReasonCode = (typeof REPAIR_REASON_CODES)[number];

export type RepairInvalidField =
  | {
      readonly field: 'unit_name';
      readonly code: 'UNIT_NAME_UNSUPPORTED';
      readonly emitted: string;
    }
  | {
      readonly field: `evidence_spans[${number}]`;
      readonly code: 'EVIDENCE_SPAN_NOT_LITERAL' | 'EVIDENCE_SPAN_VERIFIES_UNDER_OTHER_SOURCE';
      readonly emittedSource: EvidenceSource;
      readonly emittedQuote: string;
      /** The other fields in which the emitted quote IS literal (empty for NOT_LITERAL). Diagnostic only. */
      readonly literalIn: readonly EvidenceSource[];
    }
  | {
      readonly field: 'unit_name' | 'rationale' | `evidence_spans[${number}].quote`;
      readonly code: 'LENGTH_EXCEEDED';
      readonly measuredCodePoints: number;
      readonly maximumCodePoints: number;
    };

export interface RepairCandidate {
  readonly docIndex: number;
  readonly category: RepairableCategory;
  /** The validator's own reason string, verbatim. */
  readonly rejectionReason: string;
  readonly reasonCodes: readonly RepairReasonCode[];
  readonly invalidFields: readonly RepairInvalidField[];
}

export interface RepairExclusion {
  readonly docIndex: number | null;
  readonly category: RejectedDocument['category'];
  readonly reason: string;
  readonly why: 'DOC_INDEX_IS_NOT_ITEM_LEVEL';
}

export interface RepairPlan {
  readonly round: typeof REPAIR_MAX_ROUNDS_PER_LOGICAL_EVALUATION;
  /** Why no candidate exists, when none does. */
  readonly noCandidatesBecause:
    | 'POLICY_DISABLED'
    | 'ORIGINAL_IS_A_REPAIR'
    | 'WHOLE_CALL_SCHEMA_INVALID'
    | 'NOTHING_REJECTED'
    | 'NO_ITEM_LEVEL_REJECTION'
    | null;
  /** In ascending `docIndex` order. */
  readonly candidates: readonly RepairCandidate[];
  readonly excluded: readonly RepairExclusion[];
}

export interface PlanRepairRoundInput {
  readonly batch: ClassifierBatch;
  readonly validation: ValidationResult;
  /** The ORIGINAL call's raw provider output, exactly as validated. */
  readonly rawOutput: unknown;
  readonly policy: RepairPolicy;
  /** True when the call being planned for is itself a repair: a repair is never repaired. */
  readonly originalIsRepair: boolean;
}

const EMPTY_PLAN = (why: NonNullable<RepairPlan['noCandidatesBecause']>): RepairPlan => ({
  round: REPAIR_MAX_ROUNDS_PER_LOGICAL_EVALUATION,
  noCandidatesBecause: why,
  candidates: [],
  excluded: [],
});

/**
 * Decides WHICH documents of a validated call may be repaired, and derives
 * each one's reason codes and invalid fields from its own document.
 */
export function planRepairRound(input: PlanRepairRoundInput): RepairPlan {
  if (!input.policy.enabled) return EMPTY_PLAN('POLICY_DISABLED');
  if (input.originalIsRepair) return EMPTY_PLAN('ORIGINAL_IS_A_REPAIR');
  if (input.validation.kind === 'SCHEMA_INVALID') return EMPTY_PLAN('WHOLE_CALL_SCHEMA_INVALID');
  if (input.validation.rejected.length === 0) return EMPTY_PLAN('NOTHING_REJECTED');

  const resultsByDocIndex = indexRawResults(input.rawOutput);
  const documentsByIndex = new Map(input.batch.documents.map((d) => [d.docIndex, d]));

  const candidates: RepairCandidate[] = [];
  const excluded: RepairExclusion[] = [];
  for (const rejected of input.validation.rejected) {
    if (rejected.category === 'DOC_INDEX' || rejected.docIndex === null) {
      excluded.push({
        docIndex: rejected.docIndex,
        category: rejected.category,
        reason: rejected.reason,
        why: 'DOC_INDEX_IS_NOT_ITEM_LEVEL',
      });
      continue;
    }
    const document = documentsByIndex.get(rejected.docIndex);
    const result = resultsByDocIndex.get(rejected.docIndex);
    if (document === undefined || result === undefined) {
      // Unreachable for a VALIDATED result: an EVIDENCE/LENGTH rejection is
      // only produced for a document that exists and answered exactly once.
      throw new Error(
        `planRepairRound: doc_index ${rejected.docIndex} was rejected as ${rejected.category} ` +
          `but its document or its single result cannot be found.`,
      );
    }
    const invalidFields = diagnoseInvalidFields(document, result);
    candidates.push({
      docIndex: rejected.docIndex,
      category: rejected.category,
      rejectionReason: rejected.reason,
      reasonCodes: [...new Set(invalidFields.map((f) => f.code))],
      invalidFields,
    });
  }
  candidates.sort((a, b) => a.docIndex - b.docIndex);

  return {
    round: REPAIR_MAX_ROUNDS_PER_LOGICAL_EVALUATION,
    noCandidatesBecause: candidates.length === 0 ? 'NO_ITEM_LEVEL_REJECTION' : null,
    candidates,
    excluded,
  };
}

/** Re-reads the ORIGINAL raw output through the same envelope schema the validator used; returns the one result per addressed doc_index. */
function indexRawResults(rawOutput: unknown): ReadonlyMap<number, ClassificationResult> {
  const parsed = ClassifierResponseEnvelopeSchema.safeParse(rawOutput);
  const map = new Map<number, ClassificationResult>();
  if (!parsed.success) return map;
  for (const result of parsed.data.results) {
    // A doc_index answered more than once is a DOC_INDEX rejection and never
    // reaches a candidate; keeping the first is only for completeness.
    if (!map.has(result.doc_index)) map.set(result.doc_index, result);
  }
  return map;
}

/**
 * The deterministic diagnosis of ONE rejected result against ITS OWN
 * document: the same checks the validator applied, restated as codes and
 * emitted values. Length first, then evidence, mirroring the validator's
 * own order so a result that failed on length reports length.
 */
export function diagnoseInvalidFields(
  document: ClassifierDocument,
  result: ClassificationResult,
): readonly RepairInvalidField[] {
  const fields: RepairInvalidField[] = [];

  if (result.unit_name !== null) {
    const measured = unicodeCodePointLength(result.unit_name);
    if (measured > MAX_UNIT_NAME_CODE_POINTS) {
      fields.push({
        field: 'unit_name',
        code: 'LENGTH_EXCEEDED',
        measuredCodePoints: measured,
        maximumCodePoints: MAX_UNIT_NAME_CODE_POINTS,
      });
    }
  }
  const rationaleLength = unicodeCodePointLength(result.rationale);
  if (rationaleLength > MAX_RATIONALE_CODE_POINTS) {
    fields.push({
      field: 'rationale',
      code: 'LENGTH_EXCEEDED',
      measuredCodePoints: rationaleLength,
      maximumCodePoints: MAX_RATIONALE_CODE_POINTS,
    });
  }
  result.evidence_spans.forEach((span, i) => {
    const measured = unicodeCodePointLength(span.quote);
    if (measured > MAX_EVIDENCE_QUOTE_CODE_POINTS) {
      fields.push({
        field: `evidence_spans[${i}].quote`,
        code: 'LENGTH_EXCEEDED',
        measuredCodePoints: measured,
        maximumCodePoints: MAX_EVIDENCE_QUOTE_CODE_POINTS,
      });
    }
  });

  result.evidence_spans.forEach((span, i) => {
    if (evidenceSpanVerifies(document, span.source, span.quote)) return;
    const literalIn = EVIDENCE_SOURCES.filter(
      (source) => source !== span.source && evidenceSpanVerifies(document, source, span.quote),
    );
    fields.push({
      field: `evidence_spans[${i}]`,
      code:
        literalIn.length > 0
          ? 'EVIDENCE_SPAN_VERIFIES_UNDER_OTHER_SOURCE'
          : 'EVIDENCE_SPAN_NOT_LITERAL',
      emittedSource: span.source,
      emittedQuote: span.quote,
      literalIn,
    });
  });
  if (result.unit_name !== null && !unitNameVerifies(document, result.unit_name)) {
    fields.push({ field: 'unit_name', code: 'UNIT_NAME_UNSUPPORTED', emitted: result.unit_name });
  }

  return fields;
}

/**
 * The fixed, versioned text that accompanies every repair notice. It names
 * no value, no field content and no expected answer; it says only that the
 * earlier answer was rejected and that the document is to be classified
 * again from its own evidence under the unchanged system instructions.
 */
export const REPAIR_NOTICE_INSTRUCTION =
  'This is a repair request. An earlier answer for the single document supplied in this ' +
  'request was rejected by a deterministic validator for the reasons listed under ' +
  'invalid_fields; that earlier answer is not shown and must not be reproduced. Classify ' +
  'this document again, from its own title, headings, excerpt and URL only, following the ' +
  'system instructions exactly, and return exactly one result for its doc_index.';

export interface RepairNotice {
  readonly version: typeof REPAIR_REQUEST_VERSION;
  readonly round: typeof REPAIR_MAX_ROUNDS_PER_LOGICAL_EVALUATION;
  readonly doc_index: number;
  readonly instruction: typeof REPAIR_NOTICE_INSTRUCTION;
  readonly reason_codes: readonly RepairReasonCode[];
  readonly invalid_fields: readonly RepairInvalidField[];
}

export interface RepairRequest {
  readonly docIndex: number;
  /** The single-document batch the validator will check the repair's answer against — the ORIGINAL context, byte-identical. */
  readonly batch: ClassifierBatch;
  readonly notice: RepairNotice;
  /** The exact user-turn payload: canonicalStringify({ context, documents: [document], repair: notice }). */
  readonly serializedInput: string;
  /** SHA-256 of `serializedInput`. */
  readonly requestSha256: string;
}

/** Builds the isolated, single-document repair request for one candidate. Pure. */
export function buildRepairRequest(
  batch: ClassifierBatch,
  candidate: RepairCandidate,
): RepairRequest {
  const document = batch.documents.find((d) => d.docIndex === candidate.docIndex);
  if (document === undefined) {
    throw new Error(`buildRepairRequest: doc_index ${candidate.docIndex} is not in this batch.`);
  }
  const notice: RepairNotice = {
    version: REPAIR_REQUEST_VERSION,
    round: REPAIR_MAX_ROUNDS_PER_LOGICAL_EVALUATION,
    doc_index: candidate.docIndex,
    instruction: REPAIR_NOTICE_INSTRUCTION,
    reason_codes: candidate.reasonCodes,
    invalid_fields: candidate.invalidFields,
  };
  const repairBatch: ClassifierBatch = { context: batch.context, documents: [document] };
  const serializedInput = canonicalStringify({
    context: repairBatch.context,
    documents: repairBatch.documents,
    repair: notice,
  });
  return {
    docIndex: candidate.docIndex,
    batch: repairBatch,
    notice,
    serializedInput,
    requestSha256: sha256(serializedInput),
  };
}

export interface RepairIdentityInput {
  /** The ORIGINAL call's persisted `input_sha256`. */
  readonly repairOfInputSha256: string;
  readonly repairRequestSha256: string;
  readonly promptVersion: string;
  readonly outputSchemaVersion: string;
}

/**
 * The repair call's OWN persisted `input_sha256`: derived from the original
 * identity plus the repair request's own bytes, so it can never equal, reuse
 * or shadow the original's, and two repairs of different documents of one
 * call never collide.
 */
export function computeRepairInputSha256(input: RepairIdentityInput): string {
  return sha256(
    canonicalStringify({
      repairOfInputSha256: input.repairOfInputSha256,
      repairRound: REPAIR_MAX_ROUNDS_PER_LOGICAL_EVALUATION,
      repairRequestSha256: input.repairRequestSha256,
      promptVersion: input.promptVersion,
      outputSchemaVersion: input.outputSchemaVersion,
    }),
  );
}

export const REPAIR_SKIPPED_INSUFFICIENT_BUDGET = 'REPAIR_SKIPPED_INSUFFICIENT_BUDGET' as const;

export type RepairBudgetDecision =
  | {
      readonly kind: 'PROCEED';
      readonly remainingMs: number;
      /** The total window handed to the provider: remaining minus the hard-kill grace. */
      readonly windowMs: number;
      /** What the provider will apply to the first attempt: min(soft deadline, window). Informational. */
      readonly firstAttemptDeadlineMs: number;
    }
  | {
      readonly kind: 'SKIP';
      readonly code: typeof REPAIR_SKIPPED_INSUFFICIENT_BUDGET;
      readonly remainingMs: number;
      readonly usableMs: number;
      readonly minimumRemainingBudgetMs: number;
    };

export interface RepairBudgetInput {
  /** Milliseconds elapsed on the injectable clock since the ORIGINAL provider call was entered (including any earlier repair of the same round). */
  readonly elapsedMs: number;
  readonly policy: RepairPolicy;
  readonly totalBudgetMs?: number;
  readonly graceMs?: number;
}

/** The one budget arithmetic. Pure: the caller supplies the elapsed time it measured. */
export function decideRepairBudget(input: RepairBudgetInput): RepairBudgetDecision {
  const totalBudgetMs = input.totalBudgetMs ?? REPAIR_TOTAL_BUDGET_MS;
  const graceMs = input.graceMs ?? REPAIR_HARD_KILL_GRACE_MS;
  if (!Number.isFinite(input.elapsedMs) || input.elapsedMs < 0) {
    throw new RangeError(`decideRepairBudget: elapsedMs must be a finite non-negative number.`);
  }
  const remainingMs = Math.max(0, totalBudgetMs - Math.floor(input.elapsedMs));
  const usableMs = Math.max(0, remainingMs - graceMs);
  if (usableMs < input.policy.minimumRemainingBudgetMs) {
    return {
      kind: 'SKIP',
      code: REPAIR_SKIPPED_INSUFFICIENT_BUDGET,
      remainingMs,
      usableMs,
      minimumRemainingBudgetMs: input.policy.minimumRemainingBudgetMs,
    };
  }
  return {
    kind: 'PROCEED',
    remainingMs,
    windowMs: usableMs,
    firstAttemptDeadlineMs: Math.min(REPAIR_ATTEMPT_SOFT_DEADLINE_MS, usableMs),
  };
}

/** The operator-facing error summary a skipped repair persists (bounded well under the 2000-character column limit). */
export function describeRepairSkip(
  decision: Extract<RepairBudgetDecision, { kind: 'SKIP' }>,
): string {
  return (
    `${decision.code}: ${decision.usableMs} ms usable of ${decision.remainingMs} ms remaining ` +
    `in the original evaluation's budget, below the ${decision.minimumRemainingBudgetMs} ms minimum; ` +
    `no provider request was sent.`
  );
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
