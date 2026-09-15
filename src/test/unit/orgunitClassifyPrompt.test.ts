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
} from '../harness/phase2b2d2c/promptLineage.js';

describe('the frozen classifier system prompt', () => {
  it('is versioned exactly orgunit-classifier-prompt-v5', () => {
    expect(ORGUNIT_CLASSIFIER_PROMPT_VERSION).toBe(V5_PROMPT_VERSION);
    expect(V5_PROMPT_VERSION).toBe('orgunit-classifier-prompt-v5');
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
 * Phase 2B-2D2C-F0N/V5I1: v5 is the frozen v4 runtime text plus exactly the
 * one owner-approved bounded semantic narrowing (Candidate E1) from F0M's
 * root-cause finding, and nothing else. The delta bytes live in
 * `src/test/harness/phase2b2d2c/promptLineage.ts`, copied from the F0M
 * audit's own §6 candidate text; the hashes are the audit's oracle and are
 * never updated to fit a result.
 */
describe('prompt v5 is v4 plus exactly the one approved bounded narrowing (E1)', () => {
  it('matches the v5 length, UTF-8 byte and SHA-256 oracles', () => {
    expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT.length).toBe(V5_PROMPT_SIZE.characters);
    expect(Buffer.byteLength(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT, 'utf8')).toBe(
      V5_PROMPT_SIZE.utf8Bytes,
    );
    expect(promptSha256(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT)).toBe(V5_PROMPT_SHA256);
    expect(V5_PROMPT_SIZE).toEqual({ characters: 14_843, utf8Bytes: 14_919 });
  });

  it('contains the E1 text exactly once, and not the unqualified v4 sentence it narrows', () => {
    for (const op of V5_DELTA_OPERATIONS) {
      expect(occurrences(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT, op.text), op.kind).toBe(1);
    }
    // E1 REPLACEs its anchor sentence outright: the old, unqualified opening sentence never appears.
    const e1 = V5_DELTA_OPERATIONS[0]!;
    expect(e1.kind).toBe('REPLACE_SENTENCE');
    expect(occurrences(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT, e1.anchorParagraph)).toBe(0);
  });

  it('reconstructs the frozen v4 runtime prompt exactly when the v5 delta is reversed, and re-applying the delta gives v5 back', () => {
    const v4 = v4FromV5(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT);
    expect(v4.length).toBe(V4_PROMPT_SIZE.characters);
    expect(Buffer.byteLength(v4, 'utf8')).toBe(V4_PROMPT_SIZE.utf8Bytes);
    expect(promptSha256(v4)).toBe(V4_PROMPT_SHA256);
    expect(v5FromV4(v4)).toBe(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT);
    // v5 is v4 plus 112 code points and 112 bytes: every added byte is ASCII.
    expect(V5_PROMPT_SIZE.characters - V4_PROMPT_SIZE.characters).toBe(112);
    expect(V5_PROMPT_SIZE.utf8Bytes - V4_PROMPT_SIZE.utf8Bytes).toBe(112);
  });

  it("E1 reuses D1's own exact small/non-university qualifying phrase rather than inventing a new one", () => {
    const e1 = V5_DELTA_OPERATIONS[0]!;
    expect(e1.text).toContain(
      'applies only to a small or non-university organisation as described above',
    );
    // The exact phrase D1 (V4I1) already introduced on the paragraph's second sentence.
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
    // D2's and D3's own inserted sentences are untouched by E1.
    expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT).toContain(
      "does not by itself satisfy step two, unless the document also describes that unit's own standing remit",
    );
    expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT).toContain(
      'does not satisfy step two; a page that instead displays identifying and contact information',
    );
    // Candidate C's evidence-output compliance check is untouched.
    expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT).toContain(
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
 * (`v4FromV5(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT)`), never against the live
 * production prompt directly - the production prompt is v5, and its own
 * lineage back to v4 is proven above. Reconstructing v4 and re-checking it
 * here is what proves v5 did not silently disturb anything v4 established.
 */
describe('prompt v4 is v3 plus exactly the three approved bounded narrowings (D1, D2, D3)', () => {
  const reconstructedV4 = (): string => v4FromV5(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT);

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
 * (`v3FromV4(v4FromV5(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT))`), never against
 * the live production prompt directly - the production prompt is v5, and
 * its own lineage back to v4 and then v3 is proven above. Reconstructing
 * v3 and re-checking it here is what proves v5 (and, before it, v4) did
 * not silently disturb anything v3 established.
 */
describe('the reconstructed prompt v3 is v2 plus exactly the approved delta, and v2 is v1 plus exactly five insertions', () => {
  const SERVICE_TOOL_LINE_V1 =
    '- **SERVICE_TOOL_PAGE** — a login, shopping-cart, search, account, or portal page.';
  const SERVICE_TOOL_LINE_V2 =
    '- **SERVICE_TOOL_PAGE** — a contact form, login, shopping-cart, search, account, or portal page.';

  const reconstructedV3 = (): string => v3FromV4(v4FromV5(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT));

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
