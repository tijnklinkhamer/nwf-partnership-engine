/**
 * PHASE 2B-2D2C-V4I1/V5I1/F1-V6I1 — THE PROMPT LINEAGE, AS EXACT TEXT DELTAS.
 *
 * The production prompt (`src/orgunits/classify/prompt.ts`) is ONE string
 * at ONE version. Earlier frozen identities are never kept as second
 * strings anywhere in production; they are RECONSTRUCTED from the current
 * prompt by removing the exact reviewed deltas, and pinned by SHA-256:
 *
 *   v6 -> v5 : reverse exactly R1, R2 and R3 - replace each of the three
 *              V6 replacement texts by the one V5 region it replaced
 *              (Phase 2B-2D2C-F1, owner decision
 *              `APPROVE_V6_R1_R2_R3_IMPLEMENTATION_FOR_FREEZE_REVIEW_ONLY`,
 *              implementation for freeze review only).
 *   v5 -> v4 : replace E1's narrowed opening sentence by the v4 sentence
 *              it narrowed (Phase 2B-2D2C-F0N/V5I1, owner decision
 *              `APPROVE_V5_SEMANTIC_E1_IMPLEMENTATION_ONLY` of
 *              2026-09-15, approving Candidate E1 of
 *              `docs/audits/PHASE_2B_2D2C_F0M_V4_RESIDUAL_PRECISION_ROOT_CAUSE_AND_V5_OPTIONS_2026-09.md`
 *              §6 for implementation only; Candidate E2 was not selected).
 *   v4 -> v3 : replace D1's narrowed sentence by the v3 sentence it
 *              narrowed, and remove D2's and D3's inserted sentences
 *              (Phase 2B-2D2C-V4I1, owner instruction of 2026-09-14
 *              approving candidates D1/D2/D3 of
 *              `docs/audits/PHASE_2B_2D2C_F0H_ATTEMPT_2_DEV_FAILURE_ANALYSIS_2026-09.md`
 *              §7 for implementation only).
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
/** The v4 identity implemented by Phase 2B-2D2C-V4I1. */
export const V4_PROMPT_SHA256 = 'a2dad6e85102ee710d4eb1c5ca4ea3995273b3e25834d27a83f36ad6b65a256b';
/** The v5 identity implemented by Phase 2B-2D2C-F0N/V5I1, and the base this task derives from. */
export const V5_PROMPT_SHA256 = '4c7352812740ca2df518b5274d18aae2f7f695d05ab0f60fcf72c000db8f01c9';
/** The v6 identity implemented by Phase 2B-2D2C-F1/V6I1 (this task). NOT accepted, NOT authorised to run. */
export const V6_PROMPT_SHA256 = '06262d43352375231eb83afdd485babc8564675d783da0b7409bc15dca0513b7';

export const V1_PROMPT_SIZE = { characters: 9_887, utf8Bytes: 9_963 } as const;
export const V2_PROMPT_SIZE = { characters: 11_304, utf8Bytes: 11_382 } as const;
export const V3_PROMPT_SIZE = { characters: 14_012, utf8Bytes: 14_088 } as const;
export const V4_PROMPT_SIZE = { characters: 14_731, utf8Bytes: 14_807 } as const;
export const V5_PROMPT_SIZE = { characters: 14_843, utf8Bytes: 14_919 } as const;
export const V6_PROMPT_SIZE = { characters: 16_007, utf8Bytes: 16_093 } as const;

export const V1_PROMPT_VERSION = 'orgunit-classifier-prompt-v1';
export const V2_PROMPT_VERSION = 'orgunit-classifier-prompt-v2';
export const V3_PROMPT_VERSION = 'orgunit-classifier-prompt-v3';
export const V4_PROMPT_VERSION = 'orgunit-classifier-prompt-v4';
export const V5_PROMPT_VERSION = 'orgunit-classifier-prompt-v5';
export const V6_PROMPT_VERSION = 'orgunit-classifier-prompt-v6';

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
  readonly kind:
    | 'REPLACE_PARAGRAPH'
    | 'INSERT_PARAGRAPH_AFTER'
    | 'REPLACE_SENTENCE'
    | 'INSERT_SENTENCE_AFTER'
    /** One whole list bullet, replaced outright (v6/R3). */
    | 'REPLACE_BULLET';
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

// ---------------------------------------------------------------------------
// v4 = v3 + D1 (narrow the whole-organisation carve-out) + D2 (narrow the
// operator-contact condition) + D3 (narrow the operator-naming condition
// against a bare contact-form template). Phase 2B-2D2C-V4I1, from the F0H
// failure-diagnosis candidates D1/D2/D3.
// ---------------------------------------------------------------------------

/** The v3 sentence inside Candidate B's page-subject paragraph that D1 narrows. */
export const V3_SENTENCE_WHOLE_ORG_CARVEOUT =
  "A page whose title names a programme, a scheme or an audience can still meet this test when the document attributes to the organisation itself its own ongoing strategy, charter, eligibility rules, responsibility or operations for that function, and makes that commitment the page's structural subject in its title or headings rather than a single sentence saying that the organisation takes part.";

/** D1: the same sentence, narrowed to organisations already reachable under the base prompt's own small/non-university classification. */
export const V4_D1_WHOLE_ORG_CARVEOUT_NARROWED =
  "For a small or non-university organisation as described above, a page whose title names a programme, a scheme or an audience can still meet this test when the document attributes to the organisation itself its own ongoing strategy, charter, eligibility rules, responsibility or operations for that function, and makes that commitment the page's structural subject in its title or headings rather than a single sentence saying that the organisation takes part.";

/** The v3 sentence D2 and D3 are inserted directly after, in order. */
export const V3_SENTENCE_MAILBOX_CONTACT_LINE =
  "A unit that appears only as one step, mailbox or contact line inside a procedure whose subject is the scheme does not make the page that unit's page.";

/** D2: a named unit as a bare external-scheme receiving contact does not by itself satisfy step two. */
export const V4_D2_OPERATOR_CONTACT_NARROWING =
  "A named unit presented only as the receiving or processing contact for an externally-named, externally-sponsored scheme does not by itself satisfy step two, unless the document also describes that unit's own standing remit or ongoing operations beyond that one scheme.";

/** D3: a bare interactive contact-form template naming a unit does not by itself satisfy step two. */
export const V4_D3_CONTACT_FORM_TEMPLATE_NARROWING =
  "A page whose only content is an interactive contact-form template (name, message or similar fields addressed to a named unit) with no descriptive text about that unit's remit, activities or people served does not satisfy step two; a page that instead displays identifying and contact information about a unit as content, such as a heading together with stated details, remains eligible.";

/** The exact three operations of the approved v4 delta, in application order (D1, D2, D3). */
export const V4_DELTA_OPERATIONS: readonly PromptDeltaOperation[] = [
  {
    kind: 'REPLACE_SENTENCE',
    anchorParagraph: V3_SENTENCE_WHOLE_ORG_CARVEOUT,
    text: V4_D1_WHOLE_ORG_CARVEOUT_NARROWED,
  },
  {
    kind: 'INSERT_SENTENCE_AFTER',
    anchorParagraph: V3_SENTENCE_MAILBOX_CONTACT_LINE,
    text: V4_D2_OPERATOR_CONTACT_NARROWING,
  },
  {
    kind: 'INSERT_SENTENCE_AFTER',
    // D3 is inserted directly after D2's own sentence, which exists only
    // once D2 has already been applied - this operation is APPLIED in
    // sequence, never independently of the one before it.
    anchorParagraph: V4_D2_OPERATOR_CONTACT_NARROWING,
    text: V4_D3_CONTACT_FORM_TEMPLATE_NARROWING,
  },
];

/** Applies the v4 delta to a v3 text. Refuses a non-unique or absent anchor at each step. */
export function v4FromV3(v3: string): string {
  let text = v3;
  for (const op of V4_DELTA_OPERATIONS) {
    exactlyOnce(text, op.anchorParagraph, `v4 anchor "${op.anchorParagraph.slice(0, 40)}"`);
    if (op.kind === 'REPLACE_SENTENCE') {
      text = text.replace(op.anchorParagraph, op.text);
    } else if (op.kind === 'INSERT_SENTENCE_AFTER') {
      text = text.replace(op.anchorParagraph, `${op.anchorParagraph} ${op.text}`);
    } else {
      throw new PromptLineageError(`v4FromV3 does not support operation kind ${op.kind}`);
    }
  }
  return text;
}

/** Strips the v4 delta from a v4 text, reconstructing v3 byte for byte. Reverses in the opposite order to v4FromV3. */
export function v3FromV4(v4: string): string {
  let text = v4;
  for (const op of [...V4_DELTA_OPERATIONS].reverse()) {
    if (op.kind === 'REPLACE_SENTENCE') {
      exactlyOnce(text, op.text, `v4 sentence "${op.text.slice(0, 40)}"`);
      text = text.replace(op.text, op.anchorParagraph);
    } else if (op.kind === 'INSERT_SENTENCE_AFTER') {
      const block = `${op.anchorParagraph} ${op.text}`;
      exactlyOnce(text, block, `v4 inserted sentence "${op.text.slice(0, 40)}"`);
      text = text.replace(block, op.anchorParagraph);
    } else {
      throw new PromptLineageError(`v3FromV4 does not support operation kind ${op.kind}`);
    }
  }
  return text;
}

// ---------------------------------------------------------------------------
// v5 = v4 + E1 (extend D1's own already-approved small/non-university
// qualifier to the whole-organisation-allowance paragraph's previously
// ungated OPENING sentence). Phase 2B-2D2C-F0N/V5I1, from F0M's root-cause
// finding and Candidate E1
// (`docs/audits/PHASE_2B_2D2C_F0M_V4_RESIDUAL_PRECISION_ROOT_CAUSE_AND_V5_OPTIONS_2026-09.md`
// §6).
// ---------------------------------------------------------------------------

/** The v4 whole-organisation-allowance paragraph's opening sentence, left ungated by D1. E1's anchor. */
export const V4_SENTENCE_WHOLE_ORG_ALLOWANCE_OPENING =
  "The whole-organisation allowance is narrow: use it only when the document presents the whole organisation in the role of an operating unit or function and makes that role the page's primary subject.";

/** E1: the same opening sentence, narrowed with D1's own exact qualifying phrase. */
export const V5_E1_WHOLE_ORG_ALLOWANCE_OPENING_NARROWED =
  "The whole-organisation allowance is narrow and, like the rest of this paragraph, applies only to a small or non-university organisation as described above: use it only when the document presents the whole organisation in the role of an operating unit or function and makes that role the page's primary subject.";

/** The exact one operation of the approved v5 delta (E1 only; E2 was not selected). */
export const V5_DELTA_OPERATIONS: readonly PromptDeltaOperation[] = [
  {
    kind: 'REPLACE_SENTENCE',
    anchorParagraph: V4_SENTENCE_WHOLE_ORG_ALLOWANCE_OPENING,
    text: V5_E1_WHOLE_ORG_ALLOWANCE_OPENING_NARROWED,
  },
];

/** Applies the v5 delta to a v4 text. Refuses a non-unique or absent anchor. */
export function v5FromV4(v4: string): string {
  let text = v4;
  for (const op of V5_DELTA_OPERATIONS) {
    exactlyOnce(text, op.anchorParagraph, `v5 anchor "${op.anchorParagraph.slice(0, 40)}"`);
    if (op.kind === 'REPLACE_SENTENCE') {
      text = text.replace(op.anchorParagraph, op.text);
    } else {
      throw new PromptLineageError(`v5FromV4 does not support operation kind ${op.kind}`);
    }
  }
  return text;
}

/** Strips the v5 delta from a v5 text, reconstructing v4 byte for byte. */
export function v4FromV5(v5: string): string {
  let text = v5;
  for (const op of [...V5_DELTA_OPERATIONS].reverse()) {
    if (op.kind === 'REPLACE_SENTENCE') {
      exactlyOnce(text, op.text, `v5 sentence "${op.text.slice(0, 40)}"`);
      text = text.replace(op.text, op.anchorParagraph);
    } else {
      throw new PromptLineageError(`v4FromV5 does not support operation kind ${op.kind}`);
    }
  }
  return text;
}

// ---------------------------------------------------------------------------
// v6 = v5 + R1 + R2 + R3. Phase 2B-2D2C-F1, owner decision
// `APPROVE_V6_R1_R2_R3_IMPLEMENTATION_FOR_FREEZE_REVIEW_ONLY` — the single
// V6 prompt design from the F1 analysis, implemented FOR FREEZE REVIEW ONLY.
// Three REPLACE operations, each source region occurring exactly once; no
// other prompt semantics change. `g66010a25` is deliberately NOT targeted.
// ---------------------------------------------------------------------------

/** The v5 step-two primary affirmative sentence R1 replaces. */
export const V5_SENTENCE_STEP_TWO_OPERATOR =
  "The page is a UNIT_PAGE when the document presents a named unit, service or provision as the operator, for example a heading, section or block that names it and states its role, contact or address for this subject, or, for a small or non-university organisation, when the document attributes the organisation's own standing responsibility to the organisation itself as described under the taxonomy.";

/**
 * R1: define what MAY be the operator (a named office/department/centre/
 * standing student-facing service, never a grant/bursary/aid/scholarship/
 * funding-scheme NAME, which is a subject), bind the whole-organisation
 * restriction into the primary affirmative ("and only then"), and state
 * that the organisation naming only itself evidences NO operator however
 * fully the scheme's rules, amounts, procedure and contacts are given.
 * Targets the `g04d170f4` false-positive mechanism.
 */
export const V6_R1_OPERATOR_DEFINITION =
  "The page is a UNIT_PAGE when the document presents a named unit, service or provision as the operator — a named office, department, centre or standing student-facing service, never the name of a grant, bursary, aid, scholarship or funding scheme the page describes, which is a subject and not an operator — for example a heading, section or block that names it and states its role, contact or address for this subject, or, for a small or non-university organisation and only then, when the document attributes the organisation's own standing responsibility to the organisation itself as described under the taxonomy. When the only entity the document names as administering the function is the organisation itself and that allowance does not apply, no operator is evidenced, however fully the document states the function's eligibility rules, amounts, procedure and contacts.";

/**
 * R2: replace D2's external-scheme contact criterion outright. The
 * incumbent test ("standing remit or ongoing operations beyond that one
 * scheme") is not observable in the supplied evidence; the replacement
 * tests OBSERVABLE STRUCTURE — a heading or section of the unit's own.
 * Separates `g0ec0d43` (own DAI sections) from `g536c8b14` (DRI named only
 * in running text as a contact).
 */
export const V6_R2_EXTERNAL_SCHEME_STRUCTURE =
  'A named unit presented only as the receiving or processing contact for an externally-named, externally-sponsored scheme does not by itself satisfy step two. It satisfies step two when the document gives that unit a heading or section of its own for this subject — one stating its remit, its address, its opening hours, or how it is reached as a standing office — and not when its name appears only inside running text as the mailbox to write to, the place to deposit a file, or the deadline to meet.';

/** The v5 thin-evidence NEEDS_REVIEW blocker bullet R3 replaces, in full. */
export const V5_BULLET_THIN_EVIDENCE_BLOCKER =
  '- the evidence is too sparse to tell a unit from a non-unit despite unit-shaped signals (e.g. a truncated excerpt naming an office with no further content);';

/**
 * R3: give the thin-evidence blocker EXPLICIT PRECEDENCE over UNIT_PAGE,
 * with two stated exceptions that stop it becoming a broad abstention rule
 * (the office's own name as title/leading heading; headings that themselves
 * state remit, strategy, eligibility or standing procedures). Targets
 * `g6458a35` while preserving `g7e9744e8` and `ge789b0f0`.
 */
export const V6_R3_THIN_EVIDENCE_PRECEDENCE =
  "- the evidence is too sparse to tell a unit from a non-unit despite unit-shaped signals — for example the document names an office but supplies no body text at all, and neither its title nor its headings state what that office does, whom it serves, or what it administers. Check this blocker before answering UNIT_PAGE: a named office and a way to reach it, with nothing else, is this blocker rather than a unit page. It is not this blocker when the title or the leading heading is that office's own name, nor when the headings themselves state the function's remit, strategy, eligibility or standing procedures;";

/** The exact three operations of the approved v6 delta, in application order (R1, R2, R3). */
export const V6_DELTA_OPERATIONS: readonly PromptDeltaOperation[] = [
  {
    kind: 'REPLACE_SENTENCE',
    anchorParagraph: V5_SENTENCE_STEP_TWO_OPERATOR,
    text: V6_R1_OPERATOR_DEFINITION,
  },
  {
    kind: 'REPLACE_SENTENCE',
    anchorParagraph: V4_D2_OPERATOR_CONTACT_NARROWING,
    text: V6_R2_EXTERNAL_SCHEME_STRUCTURE,
  },
  {
    kind: 'REPLACE_BULLET',
    anchorParagraph: V5_BULLET_THIN_EVIDENCE_BLOCKER,
    text: V6_R3_THIN_EVIDENCE_PRECEDENCE,
  },
];

/**
 * Applies the v6 delta to a v5 text. Every operation is an exact,
 * whole-region REPLACE whose source must occur EXACTLY ONCE - no fuzzy
 * matching, no regex, fail closed otherwise.
 */
export function v6FromV5(v5: string): string {
  let text = v5;
  for (const op of V6_DELTA_OPERATIONS) {
    if (op.kind !== 'REPLACE_SENTENCE' && op.kind !== 'REPLACE_BULLET')
      throw new PromptLineageError(`v6FromV5 does not support operation kind ${op.kind}`);
    exactlyOnce(text, op.anchorParagraph, `v6 anchor "${op.anchorParagraph.slice(0, 40)}"`);
    text = text.replace(op.anchorParagraph, op.text);
  }
  return text;
}

/** Strips the v6 delta from a v6 text, reconstructing v5 byte for byte. Reverses in the opposite order to v6FromV5. */
export function v5FromV6(v6: string): string {
  let text = v6;
  for (const op of [...V6_DELTA_OPERATIONS].reverse()) {
    if (op.kind !== 'REPLACE_SENTENCE' && op.kind !== 'REPLACE_BULLET')
      throw new PromptLineageError(`v5FromV6 does not support operation kind ${op.kind}`);
    exactlyOnce(text, op.text, `v6 replacement "${op.text.slice(0, 40)}"`);
    text = text.replace(op.text, op.anchorParagraph);
  }
  return text;
}

export function promptSha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
