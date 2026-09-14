/**
 * PHASE 2B-2D2C-V3D1 — LOADER AND CHECKER FOR THE PROMPT-V3 DESIGN RECORD.
 *
 * The design record (`docs/evaluation/PHASE_2B_2D2C_PROMPT_V3_DESIGN_CANDIDATES_V1.json`)
 * expresses each candidate as an exact textual delta against the frozen
 * Prompt V2. This module APPLIES a delta IN MEMORY so a test can measure it
 * — anchor uniqueness, character and UTF-8 byte deltas, and that the result
 * is a different prompt identity — and it screens the inserted text for the
 * content the task forbids. It never writes a prompt anywhere, never
 * exports one, and `src/orgunits/classify/prompt.ts` is untouched.
 *
 * PURE. No filesystem, no network, no clock.
 */
import { createHash } from 'node:crypto';

export type DeltaOperationKind = 'REPLACE_PARAGRAPH' | 'INSERT_PARAGRAPH_AFTER';

export interface DeltaOperation {
  readonly kind: DeltaOperationKind;
  /** The exact existing paragraph the operation anchors on; must occur exactly once in the base text. */
  readonly anchorParagraph: string;
  /** The new paragraph text (a replacement, or the paragraph inserted after the anchor). */
  readonly text: string;
}

export interface CandidateDesign {
  readonly id: string;
  readonly name: string;
  readonly operations: readonly DeltaOperation[];
  readonly measuredDelta: { readonly characters: number; readonly utf8Bytes: number };
  readonly changesPromptIdentity: boolean;
}

export interface AppliedCandidate {
  readonly text: string;
  readonly sha256: string;
  readonly characterDelta: number;
  readonly utf8ByteDelta: number;
}

export class CandidateDeltaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CandidateDeltaError';
  }
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function occurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

/** Applies one candidate's operations, in order, to the base prompt text. Refuses a non-unique or absent anchor. */
export function applyCandidateDelta(base: string, candidate: CandidateDesign): AppliedCandidate {
  let text = base;
  for (const operation of candidate.operations) {
    const found = occurrences(text, operation.anchorParagraph);
    if (found !== 1) {
      throw new CandidateDeltaError(
        `${candidate.id}: anchor occurs ${found} time(s), expected exactly once`,
      );
    }
    if (operation.text.length === 0) {
      throw new CandidateDeltaError(`${candidate.id}: an operation carries empty text`);
    }
    text =
      operation.kind === 'REPLACE_PARAGRAPH'
        ? text.replace(operation.anchorParagraph, operation.text)
        : text.replace(
            operation.anchorParagraph,
            `${operation.anchorParagraph}\n\n${operation.text}`,
          );
  }
  return {
    text,
    sha256: sha256(text),
    characterDelta: [...text].length - [...base].length,
    utf8ByteDelta: Buffer.byteLength(text, 'utf8') - Buffer.byteLength(base, 'utf8'),
  };
}

export interface ProhibitedContentPolicy {
  /** Case-insensitive substrings that may never appear in inserted text (organisation identifiers, split names, gold vocabulary). */
  readonly forbiddenSubstrings: readonly string[];
  /** Case-insensitive full titles from the frozen corpus that may never be copied. */
  readonly forbiddenTitles: readonly string[];
}

export interface ProhibitedContentFinding {
  readonly candidateId: string;
  readonly kind: 'GOLD_ID' | 'URL' | 'DIGIT' | 'FORBIDDEN_SUBSTRING' | 'FORBIDDEN_TITLE';
  readonly match: string;
}

const GOLD_ID_PATTERN = /\bg[0-9a-f]{16}\b/g;
const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/gi;

/** Screens every inserted/replacement paragraph of a candidate; returns every finding (empty means clean). */
export function screenCandidateText(
  candidate: CandidateDesign,
  policy: ProhibitedContentPolicy,
): readonly ProhibitedContentFinding[] {
  const findings: ProhibitedContentFinding[] = [];
  for (const operation of candidate.operations) {
    const text = operation.text;
    const lower = text.toLowerCase();
    for (const match of text.matchAll(GOLD_ID_PATTERN)) {
      findings.push({ candidateId: candidate.id, kind: 'GOLD_ID', match: match[0] });
    }
    for (const match of text.matchAll(URL_PATTERN)) {
      findings.push({ candidateId: candidate.id, kind: 'URL', match: match[0] });
    }
    for (const match of text.matchAll(/\d/g)) {
      findings.push({ candidateId: candidate.id, kind: 'DIGIT', match: match[0] });
    }
    for (const forbidden of policy.forbiddenSubstrings) {
      if (lower.includes(forbidden.toLowerCase())) {
        findings.push({ candidateId: candidate.id, kind: 'FORBIDDEN_SUBSTRING', match: forbidden });
      }
    }
    for (const title of policy.forbiddenTitles) {
      const needle = title.trim().toLowerCase();
      if (needle.length >= 12 && lower.includes(needle)) {
        findings.push({ candidateId: candidate.id, kind: 'FORBIDDEN_TITLE', match: title });
      }
    }
  }
  return findings;
}
