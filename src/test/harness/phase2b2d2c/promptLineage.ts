/**
 * PHASE 2B-2D2C-V3 — THE PROMPT LINEAGE, AS EXACT TEXT DELTAS.
 *
 * The production prompt (`src/orgunits/classify/prompt.ts`) is ONE string
 * at ONE version. Earlier frozen identities are never kept as second
 * strings anywhere in production; they are RECONSTRUCTED from the current
 * prompt by removing the exact reviewed deltas, and pinned by SHA-256:
 *
 *   v3 -> v2 : replace Candidate B's two paragraphs by the two Prompt V2
 *              paragraphs they replaced, and remove Candidate C's inserted
 *              paragraph (Phase 2B-2D2C-V3, owner decision
 *              APPROVE_V3_SEMANTIC_B_PLUS_C, 2026-09-14; the deltas are the
 *              committed design record's own bytes,
 *              `docs/evaluation/PHASE_2B_2D2C_PROMPT_V3_DESIGN_CANDIDATES_V1.json`).
 *   v2 -> v1 : remove the five reviewed 2D2B-3 insertions
 *              (`docs/audits/PHASE_2B_2D2B_3_PROMPT_V2_RECOVERY_2026-09.md` §3).
 *
 * Every text below is copied byte for byte from those records; the tests
 * assert equality with the records rather than trusting this copy. Test
 * harness only: no production module imports this file.
 *
 * PURE. No filesystem, no network, no clock.
 */
import { createHash } from 'node:crypto';

export const V1_PROMPT_SHA256 = '65f7f327ad14e78aaf3024cb7253e979b1e360fdcd1a58081fccc08fdb0facd0';
export const V2_PROMPT_SHA256 = '181a5d6fec9763be5a57e7e4d08c7d8c8a9d9e21838df2ea3e05dd680e4c7635';
/** The projected and now landed v3 identity (V3R1 owner review packet §2). */
export const V3_PROMPT_SHA256 = 'd05dcce614397e09f93d0aec981a3d626d5e90a16851040901ffafec30d3abd1';

export const V1_PROMPT_SIZE = { characters: 9_887, utf8Bytes: 9_963 } as const;
export const V2_PROMPT_SIZE = { characters: 11_304, utf8Bytes: 11_382 } as const;
export const V3_PROMPT_SIZE = { characters: 14_012, utf8Bytes: 14_088 } as const;

export const V1_PROMPT_VERSION = 'orgunit-classifier-prompt-v1';
export const V2_PROMPT_VERSION = 'orgunit-classifier-prompt-v2';
export const V3_PROMPT_VERSION = 'orgunit-classifier-prompt-v3';

// ---------------------------------------------------------------------------
// v2 = v1 + five reviewed insertions (2D2B-3).
// ---------------------------------------------------------------------------

/** Prompt V2 insertion 1 (the page-subject test) — REPLACED in v3 by Candidate B. */
export const V2_INSERTION_1_PAGE_SUBJECT =
  "Classify the page's primary subject, not the presence of relevant words, activities, or services. Use UNIT_PAGE only when an organisational unit or operating function is itself the page's primary subject — for example, the page presents that unit's identity, remit, team, responsibility, or ongoing operations. Use NOT_A_UNIT when the page instead has a programme, grant, activity, event, form, navigation destination, or general institutional information as its primary subject, even when it describes Erasmus, mobility, international students, language learning, or student services. Describing Erasmus or services does not by itself make a page a UNIT_PAGE.";

/** Prompt V2 insertion 2 (the whole-organisation allowance bound) — REPLACED in v3 by Candidate A's text, carried by Candidate B. */
export const V2_INSERTION_2_ALLOWANCE_BOUND =
  "The whole-organisation allowance is narrow: use it only when the document presents the whole organisation in the role of an operating unit or function and makes that role the page's primary subject. The organisation's small size alone is never enough; a homepage, marketing or navigation page, programme or course page, and news or event page remain NOT_A_UNIT when no operating unit or function is the page's primary subject.";

/** Prompt V2 insertion 4 (NO versus UNKNOWN) — unchanged in v3. */
export const V2_INSERTION_4_NO_VERSUS_UNKNOWN =
  'NO requires affirmative evidence of absence; silence is UNKNOWN; a service list that omits an axis is not evidence against it.';

/** Prompt V2 insertion 5 (document-local unit name) — unchanged in v3; Candidate C is inserted directly after it. */
export const V2_INSERTION_5_DOCUMENT_LOCAL_NAME =
  "`unit_name` must be copied exactly from this document's own title, headings, or excerpt. Never take it from another document in the batch, and never expand an abbreviation or acronym.";

/** Prompt V2 insertion 3 (inline, inside the SERVICE_TOOL_PAGE line) — unchanged in v3. */
export const V2_INLINE_INSERTION_3 = 'contact form, ';

export const V2_PARAGRAPH_INSERTIONS = [
  V2_INSERTION_1_PAGE_SUBJECT,
  V2_INSERTION_2_ALLOWANCE_BOUND,
  V2_INSERTION_4_NO_VERSUS_UNKNOWN,
  V2_INSERTION_5_DOCUMENT_LOCAL_NAME,
] as const;

// ---------------------------------------------------------------------------
// v3 = v2 + Candidate B (which carries A) + Candidate C.
// ---------------------------------------------------------------------------

/** Candidate B, operation 1: replaces V2 insertion 1. */
export const V3_B_TWO_STEP_PAGE_SUBJECT =
  "Classify the page's primary subject, not the presence of relevant words, activities, or services. Decide in two steps. Step one: does the document evidence an ongoing operating responsibility, meaning a standing function that receives, supports, advises, teaches or administers on a continuing basis, as the page's primary subject? Evidence for this is the document's own title, headings or body presenting that responsibility's remit, the people it serves, its standing procedures, or the operator that administers it together with how to reach that operator. A single dated event, a news or category listing, a degree programme's curriculum or admissions, an index or navigation destination, a form, tool or viewer, general institutional marketing, and a description of an external programme or funding scheme as such, with the organisation appearing only as a participant, are not such evidence, however much they mention Erasmus, mobility, international students, language learning or student services. Step two: if such a responsibility is evidenced, who holds it in this document? The page is a UNIT_PAGE when the document presents a named unit, service or provision as the operator, for example a heading, section or block that names it and states its role, contact or address for this subject, or, for a small or non-university organisation, when the document attributes the organisation's own standing responsibility to the organisation itself as described under the taxonomy. A unit that appears only as one step, mailbox or contact line inside a procedure whose subject is the scheme does not make the page that unit's page. When no operator is evidenced, the page is NOT_A_UNIT with the page_kind that fits its subject; the institution as a whole counts as an operator only under the small or non-university allowance. Describing Erasmus or services does not by itself make a page a UNIT_PAGE.";

/** Candidate B, operation 2 == Candidate A: replaces V2 insertion 2. */
export const V3_A_WHOLE_ORGANISATION_RESCUE =
  "The whole-organisation allowance is narrow: use it only when the document presents the whole organisation in the role of an operating unit or function and makes that role the page's primary subject. A page whose title names a programme, a scheme or an audience can still meet this test when the document attributes to the organisation itself its own ongoing strategy, charter, eligibility rules, responsibility or operations for that function, and makes that commitment the page's structural subject in its title or headings rather than a single sentence saying that the organisation takes part. A named office is not required for this. The organisation's small size alone is never enough, and a page whose subject is the external programme itself, its grant amounts, its conditions or its sponsor's description, with the organisation appearing only as a participant, is NOT_A_UNIT; a homepage, marketing or navigation page, degree or course page, and news or event page remain NOT_A_UNIT when no operating unit or function is the page's primary subject.";

/** Candidate C: inserted directly after V2 insertion 5. */
export const V3_C_EVIDENCE_OUTPUT_COMPLIANCE =
  "Before returning, check every result against its own document and nothing else. A non-null `unit_name` must appear, apart from spacing, accents and letter case, in that document's title, headings or excerpt; if only a short form of the name appears there, return that short form, and if no form appears, return null, even when a longer or expanded form appears in another document of this batch or is known to you. Each evidence quote must be copied contiguously and unabridged from the one field its `source` names, with no ellipsis, no omitted words and no corrected characters, and `source` must name the field in which that exact text appears: text that opens the excerpt is EXCERPT even when it reads like a heading. A result that fails this check is discarded whole, so cite fewer spans rather than one that cannot be verified.";

export interface PromptDeltaOperation {
  readonly kind: 'REPLACE_PARAGRAPH' | 'INSERT_PARAGRAPH_AFTER';
  readonly anchorParagraph: string;
  readonly text: string;
}

/** The exact three operations of the approved v3 delta, in application order (B op 1, B op 2 = A, C). */
export const V3_DELTA_OPERATIONS: readonly PromptDeltaOperation[] = [
  {
    kind: 'REPLACE_PARAGRAPH',
    anchorParagraph: V2_INSERTION_1_PAGE_SUBJECT,
    text: V3_B_TWO_STEP_PAGE_SUBJECT,
  },
  {
    kind: 'REPLACE_PARAGRAPH',
    anchorParagraph: V2_INSERTION_2_ALLOWANCE_BOUND,
    text: V3_A_WHOLE_ORGANISATION_RESCUE,
  },
  {
    kind: 'INSERT_PARAGRAPH_AFTER',
    anchorParagraph: V2_INSERTION_5_DOCUMENT_LOCAL_NAME,
    text: V3_C_EVIDENCE_OUTPUT_COMPLIANCE,
  },
];

export class PromptLineageError extends Error {
  override readonly name = 'PromptLineageError';
}

function exactlyOnce(haystack: string, needle: string, what: string): void {
  const count = haystack.split(needle).length - 1;
  if (count !== 1)
    throw new PromptLineageError(`${what} occurs ${count} time(s), expected exactly once.`);
}

/** Applies the v3 delta to a v2 text. Refuses a non-unique or absent anchor. */
export function v3FromV2(v2: string): string {
  let text = v2;
  for (const op of V3_DELTA_OPERATIONS) {
    exactlyOnce(text, op.anchorParagraph, `v3 anchor "${op.anchorParagraph.slice(0, 40)}"`);
    text =
      op.kind === 'REPLACE_PARAGRAPH'
        ? text.replace(op.anchorParagraph, op.text)
        : text.replace(op.anchorParagraph, `${op.anchorParagraph}\n\n${op.text}`);
  }
  return text;
}

/** Strips the v3 delta from a v3 text, reconstructing v2 byte for byte. */
export function v2FromV3(v3: string): string {
  let text = v3;
  for (const op of V3_DELTA_OPERATIONS) {
    if (op.kind === 'REPLACE_PARAGRAPH') {
      exactlyOnce(text, op.text, `v3 paragraph "${op.text.slice(0, 40)}"`);
      text = text.replace(op.text, op.anchorParagraph);
    } else {
      const block = `${op.anchorParagraph}\n\n${op.text}`;
      exactlyOnce(text, block, `v3 inserted block "${op.text.slice(0, 40)}"`);
      text = text.replace(block, op.anchorParagraph);
    }
  }
  return text;
}

/** Strips the five 2D2B-3 insertions from a v2 text, reconstructing v1 byte for byte. */
export function v1FromV2(v2: string): string {
  let text = v2;
  for (const paragraph of V2_PARAGRAPH_INSERTIONS) {
    const block = `\n\n${paragraph}`;
    exactlyOnce(text, block, `v2 insertion "${paragraph.slice(0, 40)}"`);
    text = text.replace(block, '');
  }
  exactlyOnce(text, V2_INLINE_INSERTION_3, 'v2 inline insertion');
  return text.replace(V2_INLINE_INSERTION_3, '');
}

export function promptSha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
