import { describe, expect, it } from 'vitest';
import {
  ORGUNIT_CLASSIFIER_PROMPT_VERSION,
  ORGUNIT_CLASSIFIER_SYSTEM_PROMPT,
} from '../../orgunits/classify/prompt.js';
import {
  promptSha256,
  v1FromV2,
  v2FromV3,
  v3FromV2,
  v3FromV4,
  v4FromV3,
  v4FromV5,
  v5FromV4,
  v5FromV6,
  v6FromV5,
  V1_PROMPT_SHA256,
  V1_PROMPT_SIZE,
  V2_INLINE_INSERTION_3,
  V2_PARAGRAPH_INSERTIONS,
  V2_PROMPT_SHA256,
  V2_PROMPT_SIZE,
  V3_DELTA_OPERATIONS,
  V3_PROMPT_SHA256,
  V3_PROMPT_SIZE,
  V4_DELTA_OPERATIONS,
  V4_PROMPT_SHA256,
  V4_PROMPT_SIZE,
  V5_DELTA_OPERATIONS,
  V5_PROMPT_SHA256,
  V5_PROMPT_SIZE,
  V5_PROMPT_VERSION,
  V6_DELTA_OPERATIONS,
  V6_PROMPT_SHA256,
  V6_PROMPT_SIZE,
  V6_PROMPT_VERSION,
} from '../harness/phase2b2d2c/promptLineage.js';

describe('the frozen classifier system prompt', () => {
  it('is versioned exactly orgunit-classifier-prompt-v6', () => {
    expect(ORGUNIT_CLASSIFIER_PROMPT_VERSION).toBe(V6_PROMPT_VERSION);
    expect(V6_PROMPT_VERSION).toBe('orgunit-classifier-prompt-v6');
  });

  it('is a non-empty plain string with no template placeholders', () => {
    expect(typeof ORGUNIT_CLASSIFIER_SYSTEM_PROMPT).toBe('string');
    expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT.length).toBeGreaterThan(500);
    // No `${...}` interpolation and no `{{...}}`-style mustache placeholder -
    // one universal prompt, never per-call templated (design §11).
    expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT).not.toMatch(/\$\{/);
    expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT).not.toMatch(/\{\{/);
  });

  it('states the task verbatim, per design §11', () => {
    expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT).toContain('You are a document classifier.');
    expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT).toContain(
      'Prefer UNKNOWN and NEEDS_REVIEW over unsupported certainty.',
    );
  });

  it('names every taxonomy member', () => {
    for (const member of [
      'UNIT_PAGE',
      'NOT_A_UNIT',
      'NEEDS_REVIEW',
      'INTERNATIONAL_MOBILITY_OFFICE',
      'LANGUAGE_CENTRE',
      'LANGUAGE_DEPARTMENT',
      'OTHER_UNIT',
      'DEGREE_PROGRAMME_PAGE',
      'NEWS_OR_EVENT_PAGE',
      'RESEARCH_PAGE',
      'NAVIGATION_OR_LANDING_PAGE',
      'SERVICE_TOOL_PAGE',
      'GENERIC_INSTITUTIONAL_PAGE',
      'OTHER_NON_UNIT',
    ]) {
      expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT, `prompt does not name ${member}`).toContain(member);
    }
  });

  it('names every relevance axis', () => {
    for (const axis of [
      'serves_incoming_international_students',
      'serves_outgoing_mobility_students',
      'provides_language_learning_or_support',
    ]) {
      expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT, `prompt does not name ${axis}`).toContain(axis);
    }
  });

  it('states the untrusted-data / no-instruction-following rule', () => {
    const lower = ORGUNIT_CLASSIFIER_SYSTEM_PROMPT.toLowerCase();
    expect(lower).toContain('data');
    expect(lower).toContain('not instructions');
    expect(lower).toMatch(/ignore previous instructions/);
    expect(lower).toContain('never browse');
  });

  it('states the evidence-citation and no-invention rules', () => {
    expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT).toContain('evidence_spans');
    expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT.toLowerCase()).toContain('literal');
    expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT.toLowerCase()).toContain('never invented');
  });

  it('does not name any provider, model or organisation identity', () => {
    const lower = ORGUNIT_CLASSIFIER_SYSTEM_PROMPT.toLowerCase();
    expect(lower).not.toContain('anthropic');
    expect(lower).not.toContain('claude');
    expect(lower).not.toContain('openai');
  });
});

/** Shared literal-occurrence counter for the v5, v4 and v3 lineage describe blocks. */
const occurrences = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

/** The institution named by the committed 2D2B diagnostic record; never prompt material. */
const DIAGNOSTIC_INSTITUTION_TOKENS = ['insa', 'rouen'];

/**
 * Phase 2B-2D2C-F1/V6I1: v6 is the canonical v5 runtime text plus exactly
 * the three owner-approved semantic replacements R1, R2 and R3 from the F1
 * analysis, and nothing else (owner decision
 * `APPROVE_V6_R1_R2_R3_IMPLEMENTATION_FOR_FREEZE_REVIEW_ONLY` —
 * implementation for freeze review only; not accepted, not authorised to
 * run). The delta bytes live in
 * `src/test/harness/phase2b2d2c/promptLineage.ts`; the v5 hash is the
 * canonical base oracle and is never updated to fit a result.
 */
describe('prompt v6 is v5 plus exactly the three approved semantic replacements (R1, R2, R3)', () => {
  it('matches the v6 length, UTF-8 byte and SHA-256 oracles', () => {
    expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT.length).toBe(V6_PROMPT_SIZE.characters);
    expect(Buffer.byteLength(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT, 'utf8')).toBe(
      V6_PROMPT_SIZE.utf8Bytes,
    );
    expect(promptSha256(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT)).toBe(V6_PROMPT_SHA256);
    expect(V6_PROMPT_SIZE).toEqual({ characters: 16_007, utf8Bytes: 16_093 });
  });

  it('is exactly three operations, every one a whole-region REPLACE with its source region gone', () => {
    expect(V6_DELTA_OPERATIONS).toHaveLength(3);
    expect(V6_DELTA_OPERATIONS.map((op) => op.kind)).toEqual([
      'REPLACE_SENTENCE',
      'REPLACE_SENTENCE',
      'REPLACE_BULLET',
    ]);
    for (const op of V6_DELTA_OPERATIONS) {
      // Each replacement text is present exactly once...
      expect(occurrences(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT, op.text), op.kind).toBe(1);
      // ...and the v5 region it replaced is gone entirely.
      expect(
        occurrences(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT, op.anchorParagraph),
        op.anchorParagraph.slice(0, 40),
      ).toBe(0);
    }
  });

  it('reconstructs the canonical v5 runtime prompt exactly when the v6 delta is reversed, and re-applying the delta gives v6 back', () => {
    const v5 = v5FromV6(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT);
    expect(v5.length).toBe(V5_PROMPT_SIZE.characters);
    expect(Buffer.byteLength(v5, 'utf8')).toBe(V5_PROMPT_SIZE.utf8Bytes);
    expect(promptSha256(v5)).toBe(V5_PROMPT_SHA256);
    // The canonical V5 base this task derives from, named explicitly.
    expect(promptSha256(v5)).toBe(
      '4c7352812740ca2df518b5274d18aae2f7f695d05ab0f60fcf72c000db8f01c9',
    );
    expect(v6FromV5(v5)).toBe(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT);
    // v6 is v5 plus 1,164 code points and 1,174 bytes: the five added
    // em-dashes account for the ten-byte difference.
    expect(V6_PROMPT_SIZE.characters - V5_PROMPT_SIZE.characters).toBe(1_164);
    expect(V6_PROMPT_SIZE.utf8Bytes - V5_PROMPT_SIZE.utf8Bytes).toBe(1_174);
  });

  it('each individual R1/R2/R3 replacement has the exact character delta the F1 implementation record attributes to it', () => {
    const [r1, r2, r3] = V6_DELTA_OPERATIONS as readonly [
      (typeof V6_DELTA_OPERATIONS)[number],
      (typeof V6_DELTA_OPERATIONS)[number],
      (typeof V6_DELTA_OPERATIONS)[number],
    ];
    expect(r1.text.length - r1.anchorParagraph.length).toBe(477);
    expect(r2.text.length - r2.anchorParagraph.length).toBe(231);
    expect(r3.text.length - r3.anchorParagraph.length).toBe(456);
    expect(477 + 231 + 456).toBe(V6_PROMPT_SIZE.characters - V5_PROMPT_SIZE.characters);
  });

  it('changes exactly two paragraphs of v5 - the two-step page-subject paragraph (R1, R2) and the NEEDS_REVIEW blocker list (R3) - and adds no paragraph', () => {
    const v5Paragraphs = v5FromV6(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT).split('\n\n');
    const v6Paragraphs = ORGUNIT_CLASSIFIER_SYSTEM_PROMPT.split('\n\n');
    expect(v6Paragraphs).toHaveLength(v5Paragraphs.length);
    const changed = v5Paragraphs
      .map((p, i) => (p === v6Paragraphs[i] ? -1 : i))
      .filter((i) => i >= 0);
    expect(changed).toHaveLength(2);
    // The first changed paragraph carries R1 and R2; the second carries R3.
    expect(v6Paragraphs[changed[0]!]).toContain(V6_DELTA_OPERATIONS[0]!.text);
    expect(v6Paragraphs[changed[0]!]).toContain(V6_DELTA_OPERATIONS[1]!.text);
    expect(v6Paragraphs[changed[1]!]).toContain(V6_DELTA_OPERATIONS[2]!.text);
  });

  it('leaves E1, D1, D3, Candidate C, the taxonomy and the output section byte-identical to v5', () => {
    const v5 = v5FromV6(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT);
    // E1's own whole-organisation-allowance sentence.
    expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT).toContain(
      'The whole-organisation allowance is narrow and, like the rest of this paragraph, applies only to a small or non-university organisation as described above',
    );
    // D1's second-sentence qualifier.
    expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT).toContain(
      'For a small or non-university organisation as described above, a page whose title names a programme',
    );
    // D3's contact-form narrowing.
    expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT).toContain(
      'does not satisfy step two; a page that instead displays identifying and contact information',
    );
    // Candidate C's evidence-output compliance check.
    expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT).toContain(
      'Before returning, check every result against its own document and nothing else.',
    );
    // The whole taxonomy section and the whole output section are untouched.
    const section = (text: string, from: string, to: string): string =>
      text.slice(text.indexOf(from), to === '' ? undefined : text.indexOf(to));
    expect(section(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT, '## Taxonomy', '## Relevance axes')).toBe(
      section(v5, '## Taxonomy', '## Relevance axes'),
    );
    expect(section(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT, '## Output', '')).toBe(
      section(v5, '## Output', ''),
    );
    expect(
      section(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT, '## Evidence and citation', '## Untrusted content'),
    ).toBe(section(v5, '## Evidence and citation', '## Untrusted content'));
  });

  it('the v6 delta is organisation-agnostic: no institution, URL, gold id, DEVELOPMENT/evaluation-set language or threshold copied from the corpus', () => {
    const delta = V6_DELTA_OPERATIONS.map((op) => op.text).join('\n');
    expect(delta).not.toMatch(/:\/\//);
    expect(delta).not.toMatch(/\b[\w-]+\.(fr|com|org|net|eu|edu)\b/i);
    expect(delta, 'the delta carries a digit').not.toMatch(/\d/);
    expect(delta).not.toMatch(/\bg[0-9a-f]{16}\b/i);
    for (const banned of [
      'gold',
      'threshold',
      'DEVELOPMENT',
      'HOLDOUT',
      'recall',
      'precision',
      'paris',
      'mayotte',
      'evry',
      'eslsca',
      'ipag',
      'irtess',
      'sorbonne',
    ]) {
      expect(delta.toLowerCase(), `the delta names ${banned}`).not.toContain(banned.toLowerCase());
    }
    for (const token of DIAGNOSTIC_INSTITUTION_TOKENS) {
      expect(delta, `the delta names ${token}`).not.toMatch(new RegExp(`\\b${token}\\b`, 'i'));
    }
  });
});

/**
 * Phase 2B-2D2C-F0N/V5I1: v5 is the frozen v4 runtime text plus exactly the
 * one owner-approved bounded semantic narrowing (Candidate E1) from F0M's
 * root-cause finding, and nothing else. The delta bytes live in
 * `src/test/harness/phase2b2d2c/promptLineage.ts`, copied from the F0M
 * audit's own §6 candidate text; the hashes are the audit's oracle and are
 * never updated to fit a result.
 *
 * This block now runs against the RECONSTRUCTED v5 text
 * (`v5FromV6(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT)`), never against the live
 * production prompt directly - the production prompt is v6, and its own
 * lineage back to v5 is proven above. Reconstructing v5 and re-checking it
 * here is what proves v6 did not silently disturb anything v5 established.
 */
describe('the reconstructed prompt v5 is v4 plus exactly the one approved bounded narrowing (E1)', () => {
  const reconstructedV5 = (): string => v5FromV6(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT);

  it('matches the v5 length, UTF-8 byte and SHA-256 oracles', () => {
    const v5 = reconstructedV5();
    expect(v5.length).toBe(V5_PROMPT_SIZE.characters);
    expect(Buffer.byteLength(v5, 'utf8')).toBe(V5_PROMPT_SIZE.utf8Bytes);
    expect(promptSha256(v5)).toBe(V5_PROMPT_SHA256);
    expect(V5_PROMPT_SIZE).toEqual({ characters: 14_843, utf8Bytes: 14_919 });
    // v5 is now a RECONSTRUCTED lineage identity, not the live production
    // version - the name stays pinned so the lineage record keeps naming it.
    expect(V5_PROMPT_VERSION).toBe('orgunit-classifier-prompt-v5');
    expect(ORGUNIT_CLASSIFIER_PROMPT_VERSION).not.toBe(V5_PROMPT_VERSION);
  });

  it('contains the E1 text exactly once, and not the unqualified v4 sentence it narrows', () => {
    const v5 = reconstructedV5();
    for (const op of V5_DELTA_OPERATIONS) {
      expect(occurrences(v5, op.text), op.kind).toBe(1);
    }
    // E1 REPLACEs its anchor sentence outright: the old, unqualified opening sentence never appears.
    const e1 = V5_DELTA_OPERATIONS[0]!;
    expect(e1.kind).toBe('REPLACE_SENTENCE');
    expect(occurrences(v5, e1.anchorParagraph)).toBe(0);
  });

  it('reconstructs the frozen v4 runtime prompt exactly when the v5 delta is reversed, and re-applying the delta gives v5 back', () => {
    const v5 = reconstructedV5();
    const v4 = v4FromV5(v5);
    expect(v4.length).toBe(V4_PROMPT_SIZE.characters);
    expect(Buffer.byteLength(v4, 'utf8')).toBe(V4_PROMPT_SIZE.utf8Bytes);
    expect(promptSha256(v4)).toBe(V4_PROMPT_SHA256);
    expect(v5FromV4(v4)).toBe(v5);
    // v5 is v4 plus 112 code points and 112 bytes: every added byte is ASCII.
    expect(V5_PROMPT_SIZE.characters - V4_PROMPT_SIZE.characters).toBe(112);
    expect(V5_PROMPT_SIZE.utf8Bytes - V4_PROMPT_SIZE.utf8Bytes).toBe(112);
  });

  it("E1 reuses D1's own exact small/non-university qualifying phrase rather than inventing a new one", () => {
    const e1 = V5_DELTA_OPERATIONS[0]!;
    expect(e1.text).toContain(
      'applies only to a small or non-university organisation as described above',
    );
    // The exact phrase D1 (V4I1) already introduced on the paragraph's second
    // sentence, and which R1/R2/R3 leave untouched in the live v6 prompt.
    expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT).toContain(
      'For a small or non-university organisation as described above, a page whose title names a programme',
    );
  });

  it('the v5 delta is organisation-agnostic: no institution, URL, gold id, DEVELOPMENT/evaluation-set language or threshold copied from the corpus', () => {
    const delta = V5_DELTA_OPERATIONS.map((op) => op.text).join('\n');
    expect(delta).not.toMatch(/:\/\//);
    expect(delta).not.toMatch(/\b[\w-]+\.(fr|com|org|net|eu|edu)\b/i);
    expect(delta, 'the delta carries a digit').not.toMatch(/\d/);
    expect(delta).not.toMatch(/\bg[0-9a-f]{16}\b/i);
    for (const banned of [
      'gold',
      'threshold',
      'DEVELOPMENT',
      'HOLDOUT',
      'recall',
      'precision',
      'paris',
      'mayotte',
      'evry',
    ]) {
      expect(delta.toLowerCase(), `the delta names ${banned}`).not.toContain(banned.toLowerCase());
    }
    for (const token of DIAGNOSTIC_INSTITUTION_TOKENS) {
      expect(delta, `the delta names ${token}`).not.toMatch(new RegExp(`\\b${token}\\b`, 'i'));
    }
  });

  it('does not touch D2, D3 or Candidate C: every other v4 sentence stays reachable unqualified', () => {
    const v5 = reconstructedV5();
    // D2's and D3's own inserted sentences are untouched by E1. D2's own
    // sentence is what R2 later REPLACES, so it is asserted on the
    // reconstructed v5 text rather than on the live v6 prompt.
    expect(v5).toContain(
      "does not by itself satisfy step two, unless the document also describes that unit's own standing remit",
    );
    expect(v5).toContain(
      'does not satisfy step two; a page that instead displays identifying and contact information',
    );
    // Candidate C's evidence-output compliance check is untouched.
    expect(v5).toContain(
      'Before returning, check every result against its own document and nothing else.',
    );
  });
});

/**
 * Phase 2B-2D2C-V4I1: v4 is the frozen v3 runtime text plus exactly the
 * three owner-approved bounded semantic narrowings (D1, D2, D3) from the
 * F0H failure diagnosis, and nothing else. The delta bytes live in
 * `src/test/harness/phase2b2d2c/promptLineage.ts`, copied from the F0H
 * audit's own §7 candidate text; the hashes are the audit's oracle and are
 * never updated to fit a result.
 *
 * This block now runs against the RECONSTRUCTED v4 text
 * (`v4FromV5(v5FromV6(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT))`), never against
 * the live production prompt directly - the production prompt is v6, and
 * its own lineage back to v5 and then v4 is proven above. Reconstructing v4
 * and re-checking it here is what proves v6 (and, before it, v5) did not
 * silently disturb anything v4 established.
 */
describe('the reconstructed prompt v4 is v3 plus exactly the three approved bounded narrowings (D1, D2, D3)', () => {
  const reconstructedV4 = (): string => v4FromV5(v5FromV6(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT));

  it('matches the v4 length, UTF-8 byte and SHA-256 oracles', () => {
    const v4 = reconstructedV4();
    expect(v4.length).toBe(V4_PROMPT_SIZE.characters);
    expect(Buffer.byteLength(v4, 'utf8')).toBe(V4_PROMPT_SIZE.utf8Bytes);
    expect(promptSha256(v4)).toBe(V4_PROMPT_SHA256);
    expect(V4_PROMPT_SIZE).toEqual({ characters: 14_731, utf8Bytes: 14_807 });
  });

  it('contains each of the three D1/D2/D3 texts exactly once, and none of the sentences they narrow, unqualified', () => {
    const v4 = reconstructedV4();
    for (const op of V4_DELTA_OPERATIONS) {
      expect(occurrences(v4, op.text), op.kind).toBe(1);
    }
    // D1 REPLACEs its anchor sentence outright: the old, unqualified sentence never appears.
    const d1 = V4_DELTA_OPERATIONS[0]!;
    expect(d1.kind).toBe('REPLACE_SENTENCE');
    expect(occurrences(v4, d1.anchorParagraph)).toBe(0);
    // D2 and D3 are INSERTed directly after their anchor sentence, space-joined, in order.
    const d2 = V4_DELTA_OPERATIONS[1]!;
    const d3 = V4_DELTA_OPERATIONS[2]!;
    expect(d2.kind).toBe('INSERT_SENTENCE_AFTER');
    expect(d3.kind).toBe('INSERT_SENTENCE_AFTER');
    expect(occurrences(v4, `${d2.anchorParagraph} ${d2.text}`)).toBe(1);
    expect(occurrences(v4, `${d3.anchorParagraph} ${d3.text}`)).toBe(1);
  });

  it('reconstructs the frozen v3 runtime prompt exactly when the v4 delta is reversed, and re-applying the delta gives v4 back', () => {
    const v4 = reconstructedV4();
    const v3 = v3FromV4(v4);
    expect(v3.length).toBe(V3_PROMPT_SIZE.characters);
    expect(Buffer.byteLength(v3, 'utf8')).toBe(V3_PROMPT_SIZE.utf8Bytes);
    expect(promptSha256(v3)).toBe(V3_PROMPT_SHA256);
    expect(v4FromV3(v3)).toBe(v4);
    // v4 is v3 plus 719 code points and 719 bytes: every added byte is ASCII (63 + 269 + 387 = 719).
    expect(V4_PROMPT_SIZE.characters - V3_PROMPT_SIZE.characters).toBe(719);
    expect(V4_PROMPT_SIZE.utf8Bytes - V3_PROMPT_SIZE.utf8Bytes).toBe(719);
  });

  it('each individual D1/D2/D3 delta has the exact character/byte length the F0H closure report attributes to it', () => {
    const d1 = V4_DELTA_OPERATIONS[0]!;
    const d2 = V4_DELTA_OPERATIONS[1]!;
    const d3 = V4_DELTA_OPERATIONS[2]!;
    // D1 is a plain REPLACE: no separator is added.
    expect(d1.text.length - d1.anchorParagraph.length).toBe(63);
    // D2 and D3 are INSERT_SENTENCE_AFTER: the applied delta is the sentence
    // text PLUS the one joining space `v4FromV3` inserts before it.
    expect(d2.text.length + 1).toBe(269);
    expect(d3.text.length + 1).toBe(387);
    expect(Buffer.byteLength(d2.text, 'utf8') + 1).toBe(269);
    expect(Buffer.byteLength(d3.text, 'utf8') + 1).toBe(387);
    expect(63 + 269 + 387).toBe(V4_PROMPT_SIZE.characters - V3_PROMPT_SIZE.characters);
  });

  it('the v4 delta is organisation-agnostic: no institution, URL, gold id, DEVELOPMENT/evaluation-set language or threshold copied from the corpus', () => {
    const delta = V4_DELTA_OPERATIONS.map((op) => op.text).join('\n');
    expect(delta).not.toMatch(/:\/\//);
    expect(delta).not.toMatch(/\b[\w-]+\.(fr|com|org|net|eu|edu)\b/i);
    expect(delta, 'the delta carries a digit').not.toMatch(/\d/);
    expect(delta).not.toMatch(/\bg[0-9a-f]{16}\b/i);
    for (const banned of [
      'gold',
      'threshold',
      'DEVELOPMENT',
      'HOLDOUT',
      'recall',
      'precision',
      'paris',
      'mayotte',
      'evry',
    ]) {
      expect(delta.toLowerCase(), `the delta names ${banned}`).not.toContain(banned.toLowerCase());
    }
    for (const token of DIAGNOSTIC_INSTITUTION_TOKENS) {
      expect(delta, `the delta names ${token}`).not.toMatch(new RegExp(`\\b${token}\\b`, 'i'));
    }
  });

  it('D1 reuses the existing small/non-university structural criterion rather than inventing a new one', () => {
    const d1 = V4_DELTA_OPERATIONS[0]!;
    expect(d1.text).toContain('small or non-university organisation');
    // The exact phrase used two sentences earlier in the base prompt for the whole-organisation allowance.
    expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT).toContain(
      'For a small or non-university organisation (a language school, a student association, a smaller institute)',
    );
  });

  it('does not restore V2 by removing the whole-organisation carve-out or the two-step decomposition wholesale', () => {
    // V4 keeps Candidate B's two-step decision and the carve-out itself narrowed, never removed.
    expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT).toContain('Decide in two steps.');
    expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT).toContain(
      'Step two: if such a responsibility is evidenced',
    );
    expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT).toContain('A named office is not required for this.');
  });
});

/**
 * Phase 2B-2D2C-V3: v3 is the frozen v2 runtime text plus exactly the
 * owner-approved delta (Candidate B, whose second operation IS Candidate A,
 * plus Candidate C), and v2 is the frozen v1 text plus exactly five reviewed
 * insertions (2D2B-3). The delta bytes live in
 * `src/test/harness/phase2b2d2c/promptLineage.ts`, copied from the committed
 * design record and pinned equal to it by
 * `orgunitClassify2D2CV3D1Candidates.test.ts`; the hashes are the packet's
 * and the recovery's oracles and are never updated to fit a result.
 *
 * This block now runs against the RECONSTRUCTED v3 text
 * (`v3FromV4(v4FromV5(v5FromV6(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT)))`), never
 * against the live production prompt directly - the production prompt is
 * v6, and its own lineage back to v5, v4 and then v3 is proven above.
 * Reconstructing v3 and re-checking it here is what proves v6 (and, before
 * it, v5 and v4) did not silently disturb anything v3 established.
 */
describe('the reconstructed prompt v3 is v2 plus exactly the approved delta, and v2 is v1 plus exactly five insertions', () => {
  const SERVICE_TOOL_LINE_V1 =
    '- **SERVICE_TOOL_PAGE** — a login, shopping-cart, search, account, or portal page.';
  const SERVICE_TOOL_LINE_V2 =
    '- **SERVICE_TOOL_PAGE** — a contact form, login, shopping-cart, search, account, or portal page.';

  const reconstructedV3 = (): string =>
    v3FromV4(v4FromV5(v5FromV6(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT)));

  it('matches the v3 length, UTF-8 byte and SHA-256 oracles', () => {
    const v3 = reconstructedV3();
    expect(v3.length).toBe(V3_PROMPT_SIZE.characters);
    expect(Buffer.byteLength(v3, 'utf8')).toBe(V3_PROMPT_SIZE.utf8Bytes);
    expect(promptSha256(v3)).toBe(V3_PROMPT_SHA256);
    expect(V3_PROMPT_SIZE).toEqual({ characters: 14_012, utf8Bytes: 14_088 });
  });

  it('contains each of the three v3 paragraphs exactly once, and none of the two v2 paragraphs they replaced', () => {
    const v3 = reconstructedV3();
    for (const op of V3_DELTA_OPERATIONS) {
      expect(occurrences(v3, op.text), op.kind).toBe(1);
      if (op.kind === 'REPLACE_PARAGRAPH') {
        expect(occurrences(v3, op.anchorParagraph)).toBe(0);
      } else {
        // The inserted paragraph directly follows its anchor, as its own paragraph.
        expect(occurrences(v3, `${op.anchorParagraph}\n\n${op.text}`)).toBe(1);
      }
    }
  });

  it('reconstructs the frozen v2 runtime prompt exactly when the v3 delta is reversed, and re-applying the delta gives v3 back', () => {
    const v3 = reconstructedV3();
    const v2 = v2FromV3(v3);
    expect(v2.length).toBe(V2_PROMPT_SIZE.characters);
    expect(Buffer.byteLength(v2, 'utf8')).toBe(V2_PROMPT_SIZE.utf8Bytes);
    expect(promptSha256(v2)).toBe(V2_PROMPT_SHA256);
    expect(v3FromV2(v2)).toBe(v3);
    // v3 is v2 plus 2,708 code points and 2,706 bytes: the em-dash of the replaced anchor accounts for the difference.
    expect(V3_PROMPT_SIZE.characters - V2_PROMPT_SIZE.characters).toBe(2_708);
    expect(V3_PROMPT_SIZE.utf8Bytes - V2_PROMPT_SIZE.utf8Bytes).toBe(2_706);
  });

  it('the reconstructed v2 carries the five 2D2B-3 insertions and reconstructs v1 exactly without them', () => {
    const v2 = v2FromV3(reconstructedV3());
    for (const paragraph of V2_PARAGRAPH_INSERTIONS) {
      expect(occurrences(v2, paragraph), paragraph.slice(0, 40)).toBe(1);
    }
    expect(occurrences(v2, `\n${SERVICE_TOOL_LINE_V2}\n`)).toBe(1);
    expect(SERVICE_TOOL_LINE_V2.replace(V2_INLINE_INSERTION_3, '')).toBe(SERVICE_TOOL_LINE_V1);
    const v1 = v1FromV2(v2);
    expect(v1.length).toBe(V1_PROMPT_SIZE.characters);
    expect(Buffer.byteLength(v1, 'utf8')).toBe(V1_PROMPT_SIZE.utf8Bytes);
    expect(promptSha256(v1)).toBe(V1_PROMPT_SHA256);
    expect(v1).toContain(SERVICE_TOOL_LINE_V1);
  });

  it('the reconstructed v3 prompt keeps every v2 paragraph other than the two replaced ones byte for byte, with no duplicate paragraph', () => {
    const v3 = reconstructedV3();
    const v2Paragraphs = v2FromV3(v3).split('\n\n');
    const v3Paragraphs = v3.split('\n\n');
    const replaced = new Set(
      V3_DELTA_OPERATIONS.filter((op) => op.kind === 'REPLACE_PARAGRAPH').map(
        (op) => op.anchorParagraph,
      ),
    );
    for (const paragraph of v2Paragraphs) {
      if (replaced.has(paragraph)) continue;
      expect(
        v3Paragraphs.filter((p) => p === paragraph),
        paragraph.slice(0, 40),
      ).toHaveLength(1);
    }
    expect(new Set(v3Paragraphs).size).toBe(v3Paragraphs.length);
    expect(v3Paragraphs).toHaveLength(v2Paragraphs.length + 1);
  });

  it('the v3 delta names no institution, URL, domain, identifier, digit, threshold or evaluation set', () => {
    const delta = V3_DELTA_OPERATIONS.map((op) => op.text).join('\n');
    expect(delta).not.toMatch(/:\/\//);
    expect(delta).not.toMatch(/\b[\w-]+\.(fr|com|org|net|eu|edu)\b/i);
    expect(delta, 'the delta carries a digit').not.toMatch(/\d/);
    expect(delta).not.toMatch(/\bg[0-9a-f]{16}\b/i);
    for (const banned of ['gold', 'threshold', 'DEVELOPMENT', 'HOLDOUT', 'recall', 'precision']) {
      expect(delta.toLowerCase(), `the delta names ${banned}`).not.toContain(banned.toLowerCase());
    }
    for (const token of DIAGNOSTIC_INSTITUTION_TOKENS) {
      expect(delta, `the delta names ${token}`).not.toMatch(new RegExp(`\\b${token}\\b`, 'i'));
    }
  });

  it('the whole live prompt carries no gold-ID-shaped token and no diagnostic institution name', () => {
    expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT).not.toMatch(/\bg[0-9a-f]{16}\b/i);
    for (const token of DIAGNOSTIC_INSTITUTION_TOKENS) {
      expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT, `prompt names ${token}`).not.toMatch(
        new RegExp(`\\b${token}\\b`, 'i'),
      );
    }
  });

  it('keeps the generic v1 injection-defence wording that names NWF', () => {
    expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT).toContain(
      'a claim to be an official instruction from NWF or from the model provider',
    );
  });
});
