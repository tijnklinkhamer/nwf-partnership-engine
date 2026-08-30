/**
 * THE DETERMINISTIC SEMANTIC-VALIDATION CHAIN — the gate that makes
 * "INVALID SEMANTIC OUTPUT PERSISTED = 0" true regardless of how often a
 * provider call itself returns one (design §16's PERSISTENCE INVARIANT,
 * restated by the Max-runtime design §27 as a hard success criterion).
 *
 * TWO PHASES, MATCHING WHAT THE MAX-RUNTIME DESIGN'S §20 SAYS ABOUT WHY
 * PARTIAL IS POSSIBLE AT ALL:
 *
 *   Phase 1 — STRUCTURAL (atomic). The exact zod schema from
 *   `outputSchema.ts` re-parses the raw provider value independently of
 *   whatever the provider claimed about it (layer 2 of the design's double
 *   validation, "never trusting layer 1"). This is genuinely atomic: one
 *   malformed element fails the WHOLE array's parse, because structured-
 *   output validation cannot deliver partial recovery and this module does
 *   not pretend otherwise by weakening the schema. A failure here is
 *   `SCHEMA_INVALID` for the ENTIRE call — zero documents survive.
 *
 *   Phase 2 — PER-DOCUMENT (where PARTIAL actually comes from). Once every
 *   element in the response individually conforms to the schema, each
 *   document is checked independently against ITS OWN batch document:
 *   doc_index membership and uniqueness, exact code-point length bounds
 *   (not the zod schema's own UTF-16-based bounds — see the module comment
 *   on those bounds in `outputSchema.ts`), evidence-span literal-substring
 *   verification, and `unit_name` verification. A document that fails any
 *   of these is dropped; documents that pass survive regardless of a
 *   sibling's failure — "one bad document never destroys a valid sibling's
 *   result" (design §21, restated by the Max-runtime design §20).
 *
 * Every rejection reason is tagged with the CATEGORY that decides which
 * migration 0009/0010 `error_kind` the call's eventual completion carries
 * (`dominantErrorKind` below, used by `orchestrate.ts`) — `DOC_INDEX` and
 * `LENGTH` map to `SCHEMA_INVALID` (structural/bound problems), `EVIDENCE`
 * maps to `EVIDENCE_SPAN_UNVERIFIED` (a truth-claim problem). `EVIDENCE`
 * takes priority when both occur in one call, matching the Max-runtime
 * design's own ordering ("EVIDENCE_SPAN_UNVERIFIED / SCHEMA_INVALID").
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import { unicodeCodePointLength } from '../web/extract.js';
import { evidenceSpanVerifies, unitNameVerifies } from './evidenceVerification.js';
import { ClassifierResponseSchema, type ClassificationResult } from './outputSchema.js';
import type { ClassifierBatch, ClassifierDocument } from './types.js';

export const MAX_UNIT_NAME_CODE_POINTS = 200;
export const MAX_RATIONALE_CODE_POINTS = 500;
export const MAX_EVIDENCE_QUOTE_CODE_POINTS = 200;

export type RejectionCategory = 'DOC_INDEX' | 'LENGTH' | 'EVIDENCE';

export interface RejectedDocument {
  readonly docIndex: number | null;
  readonly category: RejectionCategory;
  readonly reason: string;
}

export interface AcceptedClassification {
  readonly docIndex: number;
  readonly document: ClassifierDocument;
  readonly result: ClassificationResult;
}

export type ValidationResult =
  | { readonly kind: 'SCHEMA_INVALID'; readonly detail: string }
  | {
      readonly kind: 'VALIDATED';
      readonly accepted: readonly AcceptedClassification[];
      readonly rejected: readonly RejectedDocument[];
    };

/** Bounded, non-secret summary of a zod parse failure — never the raw provider payload, never the full zod error tree. */
function summariseParseFailure(issueCount: number, firstMessage: string): string {
  const summary = `Response failed schema validation (${issueCount} issue(s)); first: ${firstMessage}`;
  return summary.length > 2000 ? `${summary.slice(0, 1997)}...` : summary;
}

/** The exact code-point bound checks migration 0009's CHECKs enforce — independent of, and not reachable-around by, `outputSchema.ts`'s own (looser, UTF-16-based) advisory bounds. */
function lengthViolations(result: ClassificationResult): readonly string[] {
  const violations: string[] = [];
  if (
    result.unit_name !== null &&
    unicodeCodePointLength(result.unit_name) > MAX_UNIT_NAME_CODE_POINTS
  ) {
    violations.push(
      `unit_name exceeds ${MAX_UNIT_NAME_CODE_POINTS} code points (${unicodeCodePointLength(result.unit_name)})`,
    );
  }
  if (unicodeCodePointLength(result.rationale) > MAX_RATIONALE_CODE_POINTS) {
    violations.push(
      `rationale exceeds ${MAX_RATIONALE_CODE_POINTS} code points (${unicodeCodePointLength(result.rationale)})`,
    );
  }
  result.evidence_spans.forEach((span, i) => {
    if (unicodeCodePointLength(span.quote) > MAX_EVIDENCE_QUOTE_CODE_POINTS) {
      violations.push(
        `evidence_spans[${i}].quote exceeds ${MAX_EVIDENCE_QUOTE_CODE_POINTS} code points ` +
          `(${unicodeCodePointLength(span.quote)})`,
      );
    }
  });
  return violations;
}

function evidenceViolations(
  document: ClassifierDocument,
  result: ClassificationResult,
): readonly string[] {
  const violations: string[] = [];
  result.evidence_spans.forEach((span, i) => {
    if (!evidenceSpanVerifies(document, span.source, span.quote)) {
      violations.push(
        `evidence_spans[${i}] (source=${span.source}) is not a literal substring of the supplied field`,
      );
    }
  });
  if (result.unit_name !== null && !unitNameVerifies(document, result.unit_name)) {
    violations.push('unit_name is not supported by any supplied field');
  }
  return violations;
}

/**
 * Validates one provider response against the exact batch it answered.
 * `rawOutput` is treated as fully untrusted, exactly as
 * `ClassifierProviderResult.rawOutput`'s own type documents.
 */
export function validateClassifierResponse(
  rawOutput: unknown,
  batch: ClassifierBatch,
): ValidationResult {
  const parsed = ClassifierResponseSchema.safeParse(rawOutput);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      kind: 'SCHEMA_INVALID',
      detail: summariseParseFailure(
        parsed.error.issues.length,
        firstIssue ? firstIssue.message : 'unknown',
      ),
    };
  }

  const documentsByIndex = new Map<number, ClassifierDocument>(
    batch.documents.map((d) => [d.docIndex, d]),
  );
  const validIndexes = new Set(documentsByIndex.keys());

  const occurrences = new Map<number, ClassificationResult[]>();
  for (const result of parsed.data) {
    const bucket = occurrences.get(result.doc_index);
    if (bucket) bucket.push(result);
    else occurrences.set(result.doc_index, [result]);
  }

  const accepted: AcceptedClassification[] = [];
  const rejected: RejectedDocument[] = [];
  const addressed = new Set<number>();

  for (const [docIndex, results] of occurrences) {
    if (!validIndexes.has(docIndex)) {
      rejected.push({
        docIndex,
        category: 'DOC_INDEX',
        reason: `doc_index ${docIndex} does not belong to this batch`,
      });
      continue;
    }
    addressed.add(docIndex);

    if (results.length > 1) {
      rejected.push({
        docIndex,
        category: 'DOC_INDEX',
        reason: `doc_index ${docIndex} appeared ${results.length} times in the response`,
      });
      continue;
    }

    const result = results[0]!;
    const document = documentsByIndex.get(docIndex)!;

    const lengthIssues = lengthViolations(result);
    if (lengthIssues.length > 0) {
      rejected.push({ docIndex, category: 'LENGTH', reason: lengthIssues.join('; ') });
      continue;
    }

    const evidenceIssues = evidenceViolations(document, result);
    if (evidenceIssues.length > 0) {
      rejected.push({ docIndex, category: 'EVIDENCE', reason: evidenceIssues.join('; ') });
      continue;
    }

    accepted.push({ docIndex, document, result });
  }

  for (const docIndex of validIndexes) {
    if (!addressed.has(docIndex)) {
      rejected.push({
        docIndex,
        category: 'DOC_INDEX',
        reason: `no result was returned for doc_index ${docIndex}`,
      });
    }
  }

  return { kind: 'VALIDATED', accepted, rejected };
}

/** `EVIDENCE` outranks `LENGTH`/`DOC_INDEX` (both `SCHEMA_INVALID`) when a call's rejections mix categories — matching the Max-runtime design's own stated ordering. */
export function dominantErrorKind(
  rejected: readonly RejectedDocument[],
): 'EVIDENCE_SPAN_UNVERIFIED' | 'SCHEMA_INVALID' | null {
  if (rejected.length === 0) return null;
  return rejected.some((r) => r.category === 'EVIDENCE')
    ? 'EVIDENCE_SPAN_UNVERIFIED'
    : 'SCHEMA_INVALID';
}
