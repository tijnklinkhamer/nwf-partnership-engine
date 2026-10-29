/**
 * PHASE 2B-2D2C-R1 — the pure repair module (ADR 0011): planning, the
 * deterministic diagnosis, the isolated request, the derived identity and
 * the budget arithmetic. Every case is in-process; nothing here touches a
 * provider, a database, a clock or the filesystem.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalStringify } from '../../orgunits/classify/canonical.js';
import {
  CLASSIFIER_CALL_HARD_KILL_GRACE_MS,
  CLASSIFIER_CALL_SOFT_DEADLINE_MS,
  CLASSIFIER_CALL_TOTAL_BUDGET_MS,
} from '../../orgunits/classify/provider/agentSdkRunner.js';
import {
  buildRepairRequest,
  computeRepairInputSha256,
  decideRepairBudget,
  describeRepairSkip,
  diagnoseInvalidFields,
  planRepairRound,
  REPAIR_ATTEMPT_SOFT_DEADLINE_MS,
  REPAIR_HARD_KILL_GRACE_MS,
  REPAIR_MAX_ROUNDS_PER_LOGICAL_EVALUATION,
  REPAIR_MINIMUM_REMAINING_BUDGET_MS,
  REPAIR_NOTICE_INSTRUCTION,
  REPAIR_POLICY_DISABLED,
  REPAIR_POLICY_ONE_ROUND,
  REPAIR_REASON_CODES,
  REPAIR_REQUEST_VERSION,
  REPAIR_TOTAL_BUDGET_MS,
  REPAIRABLE_CATEGORIES,
} from '../../orgunits/classify/repair.js';
import type { ClassificationResult } from '../../orgunits/classify/outputSchema.js';
import type { ClassifierBatch, ClassifierDocument } from '../../orgunits/classify/types.js';
import { validateClassifierResponse } from '../../orgunits/classify/validate.js';

function document(
  docIndex: number,
  overrides: Partial<ClassifierDocument> = {},
): ClassifierDocument {
  return {
    docIndex,
    url: `https://exemple-univ.fr/international/page-${docIndex}`,
    title: `Page ${docIndex}`,
    declaredLang: 'fr',
    headings: [
      { level: 1, text: `Contacter la DAI ${docIndex}` },
      { level: 2, text: 'Adresse et horaires' },
    ],
    excerpt: `La Direction des Affaires Internationales (DAI) accueille les étudiants ${docIndex}.`,
    mainTextTruncated: false,
    excerptTruncated: false,
    extractionRuleVersion: 'orgunit-extraction-v2',
    discoveryMethod: 'LINK',
    roots: [],
    trackMembership: ['A'],
    duplicateUrls: [],
    signals: [],
    ...overrides,
  };
}

function batch(documents: readonly ClassifierDocument[]): ClassifierBatch {
  return {
    context: {
      organisationName: 'Test Institution',
      echeRowKey: 'X TEST01|999000111',
      countryCode: 'FR',
      runId: '00000000-0000-0000-0000-0000000000aa',
      ruleVersion: 'orgunit-signal-rules-v1',
      fetchPolicyVersion: 'orgunit-fetch-policy-v1',
      assemblyVersion: 'orgunit-classifier-assembly-v2',
      rootKey: null,
      roots: [],
    },
    documents,
  };
}

function result(docIndex: number, overrides: Record<string, unknown> = {}): ClassificationResult {
  return {
    doc_index: docIndex,
    verdict: 'UNIT_PAGE',
    unit_type: 'INTERNATIONAL_MOBILITY_OFFICE',
    page_kind: null,
    unit_name: 'DAI',
    serves_incoming_international_students: 'YES',
    serves_outgoing_mobility_students: 'UNKNOWN',
    provides_language_learning_or_support: 'UNKNOWN',
    confidence: 'HIGH',
    rationale: 'The directorate is the operator.',
    evidence_spans: [{ source: 'HEADING', quote: `Contacter la DAI ${docIndex}` }],
    ...overrides,
  } as ClassificationResult;
}

const sha = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

describe('repair constants restate the frozen liveness contract exactly', () => {
  it('equals the runtime constants it must never import', () => {
    expect(REPAIR_TOTAL_BUDGET_MS).toBe(CLASSIFIER_CALL_TOTAL_BUDGET_MS);
    expect(REPAIR_HARD_KILL_GRACE_MS).toBe(CLASSIFIER_CALL_HARD_KILL_GRACE_MS);
    expect(REPAIR_ATTEMPT_SOFT_DEADLINE_MS).toBe(CLASSIFIER_CALL_SOFT_DEADLINE_MS);
  });

  it('admits exactly one round, and the policy shapes cannot say otherwise', () => {
    expect(REPAIR_MAX_ROUNDS_PER_LOGICAL_EVALUATION).toBe(1);
    expect(REPAIR_POLICY_DISABLED.enabled).toBe(false);
    expect(REPAIR_POLICY_ONE_ROUND.enabled).toBe(true);
    expect(REPAIR_POLICY_ONE_ROUND.maxRoundsPerLogicalEvaluation).toBe(1);
    expect(REPAIR_POLICY_DISABLED.minimumRemainingBudgetMs).toBe(
      REPAIR_MINIMUM_REMAINING_BUDGET_MS,
    );
    expect(Object.isFrozen(REPAIR_POLICY_ONE_ROUND)).toBe(true);
    expect(REPAIRABLE_CATEGORIES).toEqual(['EVIDENCE', 'LENGTH']);
    expect(REPAIR_REASON_CODES).toEqual([
      'UNIT_NAME_UNSUPPORTED',
      'EVIDENCE_SPAN_NOT_LITERAL',
      'EVIDENCE_SPAN_VERIFIES_UNDER_OTHER_SOURCE',
      'LENGTH_EXCEEDED',
    ]);
    expect(REPAIR_REQUEST_VERSION).toBe('orgunit-classifier-repair-request-v1');
  });
});

describe('diagnoseInvalidFields is the validator restated as codes', () => {
  it('an expanded unit_name that no field supports -> UNIT_NAME_UNSUPPORTED with the emitted value', () => {
    const fields = diagnoseInvalidFields(
      document(0),
      result(0, { unit_name: 'Direction des Relations Internationales' }),
    );
    expect(fields).toEqual([
      {
        field: 'unit_name',
        code: 'UNIT_NAME_UNSUPPORTED',
        emitted: 'Direction des Relations Internationales',
      },
    ]);
  });

  it('a literal quote attributed to the wrong field -> VERIFIES_UNDER_OTHER_SOURCE naming where it is literal', () => {
    const fields = diagnoseInvalidFields(
      document(0),
      result(0, {
        evidence_spans: [
          { source: 'HEADING', quote: 'La Direction des Affaires Internationales (DAI)' },
        ],
      }),
    );
    expect(fields).toEqual([
      {
        field: 'evidence_spans[0]',
        code: 'EVIDENCE_SPAN_VERIFIES_UNDER_OTHER_SOURCE',
        emittedSource: 'HEADING',
        emittedQuote: 'La Direction des Affaires Internationales (DAI)',
        literalIn: ['EXCERPT'],
      },
    ]);
  });

  it('a quote that is literal nowhere -> EVIDENCE_SPAN_NOT_LITERAL with an empty literalIn', () => {
    const fields = diagnoseInvalidFields(
      document(0),
      result(0, { evidence_spans: [{ source: 'EXCERPT', quote: 'nowhere in this document' }] }),
    );
    expect(fields).toEqual([
      {
        field: 'evidence_spans[0]',
        code: 'EVIDENCE_SPAN_NOT_LITERAL',
        emittedSource: 'EXCERPT',
        emittedQuote: 'nowhere in this document',
        literalIn: [],
      },
    ]);
  });

  it('length violations are reported by field with the measured and maximum code points', () => {
    const fields = diagnoseInvalidFields(document(0), result(0, { rationale: 'x'.repeat(501) }));
    expect(fields).toEqual([
      {
        field: 'rationale',
        code: 'LENGTH_EXCEEDED',
        measuredCodePoints: 501,
        maximumCodePoints: 500,
      },
    ]);
  });

  it('a fully valid result diagnoses nothing', () => {
    expect(diagnoseInvalidFields(document(0), result(0))).toEqual([]);
  });
});

describe('planRepairRound decides WHICH documents may be repaired', () => {
  const twoDocs = batch([document(0), document(1)]);
  // NOTE: the excerpt fixture carries the full directorate name, so an
  // UNSUPPORTED name must be one the document never states.
  const raw = {
    results: [
      result(0, { unit_name: 'Direction des Relations Internationales' }), // EVIDENCE
      result(1), // accepted
    ],
  };

  it('plans one candidate per EVIDENCE/LENGTH rejection, with codes, and nothing for accepted siblings', () => {
    const validation = validateClassifierResponse(raw, twoDocs);
    const plan = planRepairRound({
      batch: twoDocs,
      validation,
      rawOutput: raw,
      policy: REPAIR_POLICY_ONE_ROUND,
      originalIsRepair: false,
    });
    expect(plan.round).toBe(1);
    expect(plan.noCandidatesBecause).toBeNull();
    expect(plan.candidates).toHaveLength(1);
    expect(plan.candidates[0]).toMatchObject({
      docIndex: 0,
      category: 'EVIDENCE',
      rejectionReason: 'unit_name is not supported by any supplied field',
      reasonCodes: ['UNIT_NAME_UNSUPPORTED'],
    });
    expect(plan.excluded).toEqual([]);
  });

  it('a disabled policy plans nothing - the pre-R1 lifecycle exactly', () => {
    const validation = validateClassifierResponse(raw, twoDocs);
    const plan = planRepairRound({
      batch: twoDocs,
      validation,
      rawOutput: raw,
      policy: REPAIR_POLICY_DISABLED,
      originalIsRepair: false,
    });
    expect(plan.candidates).toEqual([]);
    expect(plan.noCandidatesBecause).toBe('POLICY_DISABLED');
  });

  it('a repair is never repaired', () => {
    const validation = validateClassifierResponse(raw, twoDocs);
    const plan = planRepairRound({
      batch: twoDocs,
      validation,
      rawOutput: raw,
      policy: REPAIR_POLICY_ONE_ROUND,
      originalIsRepair: true,
    });
    expect(plan.candidates).toEqual([]);
    expect(plan.noCandidatesBecause).toBe('ORIGINAL_IS_A_REPAIR');
  });

  it('a whole-call SCHEMA_INVALID plans nothing (class D)', () => {
    const validation = validateClassifierResponse({ not: 'an envelope' }, twoDocs);
    const plan = planRepairRound({
      batch: twoDocs,
      validation,
      rawOutput: { not: 'an envelope' },
      policy: REPAIR_POLICY_ONE_ROUND,
      originalIsRepair: false,
    });
    expect(plan.candidates).toEqual([]);
    expect(plan.noCandidatesBecause).toBe('WHOLE_CALL_SCHEMA_INVALID');
  });

  it('DOC_INDEX rejections are excluded, never candidates: a missing result is a batch-shape defect', () => {
    const missing = { results: [result(0)] }; // doc 1 never answered
    const validation = validateClassifierResponse(missing, twoDocs);
    const plan = planRepairRound({
      batch: twoDocs,
      validation,
      rawOutput: missing,
      policy: REPAIR_POLICY_ONE_ROUND,
      originalIsRepair: false,
    });
    expect(plan.candidates).toEqual([]);
    expect(plan.noCandidatesBecause).toBe('NO_ITEM_LEVEL_REJECTION');
    expect(plan.excluded).toEqual([
      {
        docIndex: 1,
        category: 'DOC_INDEX',
        reason: 'no result was returned for doc_index 1',
        why: 'DOC_INDEX_IS_NOT_ITEM_LEVEL',
      },
    ]);
  });

  it('nothing rejected -> nothing planned', () => {
    const clean = { results: [result(0), result(1)] };
    const plan = planRepairRound({
      batch: twoDocs,
      validation: validateClassifierResponse(clean, twoDocs),
      rawOutput: clean,
      policy: REPAIR_POLICY_ONE_ROUND,
      originalIsRepair: false,
    });
    expect(plan.candidates).toEqual([]);
    expect(plan.noCandidatesBecause).toBe('NOTHING_REJECTED');
  });

  it('candidates are in ascending docIndex order regardless of rejection order', () => {
    const three = batch([document(0), document(1), document(2)]);
    const rawThree = {
      results: [
        result(2, { unit_name: 'Expanded Two' }),
        result(0, { evidence_spans: [{ source: 'TITLE', quote: 'not in the title' }] }),
        result(1),
      ],
    };
    const plan = planRepairRound({
      batch: three,
      validation: validateClassifierResponse(rawThree, three),
      rawOutput: rawThree,
      policy: REPAIR_POLICY_ONE_ROUND,
      originalIsRepair: false,
    });
    expect(plan.candidates.map((c) => [c.docIndex, c.category])).toEqual([
      [0, 'EVIDENCE'],
      [2, 'EVIDENCE'],
    ]);
  });
});

describe('buildRepairRequest is isolated to the one document', () => {
  const three = batch([document(0), document(1), document(2)]);
  const raw = { results: [result(0), result(1, { unit_name: 'Expanded One' }), result(2)] };
  const plan = planRepairRound({
    batch: three,
    validation: validateClassifierResponse(raw, three),
    rawOutput: raw,
    policy: REPAIR_POLICY_ONE_ROUND,
    originalIsRepair: false,
  });
  const candidate = plan.candidates[0]!;
  const request = buildRepairRequest(three, candidate);

  it('carries the original context byte-identically, exactly one document, and the notice', () => {
    expect(request.docIndex).toBe(1);
    expect(request.batch.context).toBe(three.context);
    expect(request.batch.documents).toEqual([three.documents[1]]);
    expect(request.notice).toEqual({
      version: REPAIR_REQUEST_VERSION,
      round: 1,
      doc_index: 1,
      instruction: REPAIR_NOTICE_INSTRUCTION,
      reason_codes: ['UNIT_NAME_UNSUPPORTED'],
      invalid_fields: [
        { field: 'unit_name', code: 'UNIT_NAME_UNSUPPORTED', emitted: 'Expanded One' },
      ],
    });
  });

  it('serialises with the same canonicaliser as the original request, and no sibling can be present', () => {
    expect(request.serializedInput).toBe(
      canonicalStringify({
        context: three.context,
        documents: [three.documents[1]],
        repair: request.notice,
      }),
    );
    expect(request.serializedInput).not.toContain('page-0');
    expect(request.serializedInput).not.toContain('page-2');
    expect(request.serializedInput).not.toContain('Contacter la DAI 0');
    expect(request.requestSha256).toBe(sha(request.serializedInput));
  });

  it('the notice names no expected value: it carries the emitted value and a code, never a correct answer', () => {
    const text = JSON.stringify(request.notice);
    expect(text).not.toMatch(/expected|correct|gold|should be/i);
    expect(REPAIR_NOTICE_INSTRUCTION).not.toMatch(/gold|expected answer/i);
  });

  it('refuses a candidate whose document is not in the batch', () => {
    expect(() => buildRepairRequest(batch([document(0)]), candidate)).toThrow(/not in this batch/);
  });
});

describe('computeRepairInputSha256 derives an identity that cannot collide with the original', () => {
  it('differs from the original identity and between two documents of one call', () => {
    const original = 'a'.repeat(64);
    const one = computeRepairInputSha256({
      repairOfInputSha256: original,
      repairRequestSha256: 'b'.repeat(64),
      promptVersion: 'orgunit-classifier-prompt-v2',
      outputSchemaVersion: 'orgunit-classifier-output-schema-v2',
    });
    const two = computeRepairInputSha256({
      repairOfInputSha256: original,
      repairRequestSha256: 'c'.repeat(64),
      promptVersion: 'orgunit-classifier-prompt-v2',
      outputSchemaVersion: 'orgunit-classifier-output-schema-v2',
    });
    expect(one).toMatch(/^[0-9a-f]{64}$/);
    expect(one).not.toBe(original);
    expect(one).not.toBe(two);
    expect(one).toBe(
      sha(
        canonicalStringify({
          repairOfInputSha256: original,
          repairRound: 1,
          repairRequestSha256: 'b'.repeat(64),
          promptVersion: 'orgunit-classifier-prompt-v2',
          outputSchemaVersion: 'orgunit-classifier-output-schema-v2',
        }),
      ),
    );
  });
});

describe('decideRepairBudget is the one budget arithmetic', () => {
  it('proceeds with remaining minus the grace as the window, and min(soft, window) as the first deadline', () => {
    const decision = decideRepairBudget({ elapsedMs: 100_000, policy: REPAIR_POLICY_ONE_ROUND });
    expect(decision).toEqual({
      kind: 'PROCEED',
      remainingMs: 500_000,
      windowMs: 490_000,
      firstAttemptDeadlineMs: 300_000,
    });
  });

  it('a short remainder becomes the first deadline itself', () => {
    const decision = decideRepairBudget({ elapsedMs: 450_000, policy: REPAIR_POLICY_ONE_ROUND });
    expect(decision).toMatchObject({
      kind: 'PROCEED',
      windowMs: 140_000,
      firstAttemptDeadlineMs: 140_000,
    });
  });

  it('skips, with a named code and the numbers, below the minimum usable window', () => {
    const decision = decideRepairBudget({ elapsedMs: 545_000, policy: REPAIR_POLICY_ONE_ROUND });
    expect(decision).toEqual({
      kind: 'SKIP',
      code: 'REPAIR_SKIPPED_INSUFFICIENT_BUDGET',
      remainingMs: 55_000,
      usableMs: 45_000,
      minimumRemainingBudgetMs: 120_000,
    });
    if (decision.kind !== 'SKIP') throw new Error('unreachable');
    expect(describeRepairSkip(decision)).toBe(
      'REPAIR_SKIPPED_INSUFFICIENT_BUDGET: 45000 ms usable of 55000 ms remaining in the original ' +
        "evaluation's budget, below the 120000 ms minimum; no provider request was sent.",
    );
  });

  it('exactly the minimum usable window still proceeds; one millisecond less skips', () => {
    const boundary =
      REPAIR_TOTAL_BUDGET_MS - REPAIR_HARD_KILL_GRACE_MS - REPAIR_MINIMUM_REMAINING_BUDGET_MS;
    expect(decideRepairBudget({ elapsedMs: boundary, policy: REPAIR_POLICY_ONE_ROUND }).kind).toBe(
      'PROCEED',
    );
    expect(
      decideRepairBudget({ elapsedMs: boundary + 1, policy: REPAIR_POLICY_ONE_ROUND }).kind,
    ).toBe('SKIP');
  });

  it('an exhausted or overspent budget skips with zero remaining, never a negative number', () => {
    const decision = decideRepairBudget({ elapsedMs: 900_000, policy: REPAIR_POLICY_ONE_ROUND });
    expect(decision).toMatchObject({ kind: 'SKIP', remainingMs: 0, usableMs: 0 });
  });

  it('refuses a negative or non-finite elapsed time', () => {
    expect(() => decideRepairBudget({ elapsedMs: -1, policy: REPAIR_POLICY_ONE_ROUND })).toThrow(
      RangeError,
    );
    expect(() =>
      decideRepairBudget({ elapsedMs: Number.NaN, policy: REPAIR_POLICY_ONE_ROUND }),
    ).toThrow(RangeError);
  });
});
