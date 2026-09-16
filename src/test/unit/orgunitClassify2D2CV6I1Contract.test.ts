/**
 * PHASE 2B-2D2C-F1/V6I1 — SEMANTIC CONTRACT TESTS FOR THE THREE APPROVED
 * REPLACEMENTS (R1, R2, R3), AND NOTHING ELSE.
 *
 * These are SPECIFICATION tests, not a classifier and not a prediction of
 * model behaviour, following the exact philosophy
 * `orgunitClassify2D2CV4I1Contract.test.ts` established for D1/D2/D3 and
 * `orgunitClassify2D2CV5I1Contract.test.ts` continued for E1. Two kinds of
 * claim are checked, both purely textual:
 *
 *   1. THE RULE TEXT: that R1, R2 and R3 actually carry the structural
 *      distinction the F1 analysis says they carry, and that everything
 *      they were required NOT to touch is byte-identical to the canonical
 *      v5 base (reconstructed here by reversing the v6 delta, never read
 *      from a second copy of the prompt).
 *   2. GROUNDING against the frozen, committed 49-row DEVELOPMENT gold
 *      label fixture
 *      (`src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-dev-labels-v1.jsonl`):
 *      every gold id the owner instruction names as a semantic target or a
 *      regression-risk control is checked to actually exist in that fixture
 *      with the verdict / page_kind / unit_type / rationale substrings the
 *      F1 analysis attributes to it — so this file cannot silently drift
 *      from the frozen record it cites.
 *
 * WHAT THIS FILE DOES NOT CLAIM, ANYWHERE. It does not claim, assert or
 * imply that a live model call would answer any of these documents
 * correctly, that R1/R2/R3 will move any item, that any acceptance gate
 * will pass, or that V6 is accepted. A textual rule that targets a
 * structural distinction is not evidence that the model applies it. Zero
 * provider calls, zero inference, zero auth-status reads.
 *
 * `g66010a25ac194274` IS DELIBERATELY NOT TARGETED, per the owner
 * instruction: the F1 analysis found no safe generic rule that reaches it
 * without knowingly flipping multiple stable NOT_A_UNIT controls. This file
 * records that omission as a checked property rather than leaving it
 * implicit.
 *
 * DEVELOPMENT-only fixture, per the F0N erratum
 * (`docs/audits/PHASE_2B_2D2C_F0N_F0M_HOLDOUT_PHRASING_ERRATUM_2026-09.md`):
 * `orgunit-classifier-gold-v1.jsonl`, the mixed adjudication fixture, and
 * every other HOLDOUT-containing file are never opened here.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ORGUNIT_CLASSIFIER_PROMPT_VERSION,
  ORGUNIT_CLASSIFIER_SYSTEM_PROMPT,
} from '../../orgunits/classify/prompt.js';
import {
  V6_DELTA_OPERATIONS,
  V6_R1_OPERATOR_DEFINITION,
  V6_R2_EXTERNAL_SCHEME_STRUCTURE,
  V6_R3_THIN_EVIDENCE_PRECEDENCE,
  v5FromV6,
} from '../harness/phase2b2d2c/promptLineage.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const DEV_LABELS_PATH = join(
  REPO_ROOT,
  'src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-dev-labels-v1.jsonl',
);

interface DevGoldRecord {
  readonly goldId: string;
  readonly organisationName: string;
  readonly title: string | null;
  readonly difficulty: 'EASY' | 'MODERATE' | 'HARD';
  readonly ambiguity: string | null;
  readonly rationale: string;
  readonly proposed: {
    readonly verdict: 'UNIT_PAGE' | 'NOT_A_UNIT' | 'NEEDS_REVIEW';
    readonly hard_negative: boolean;
    readonly page_kind: string | null;
    readonly unit_type: string | null;
    readonly unit_name_expectation: {
      readonly kind: 'NULL' | 'NAMED' | 'ANY';
      readonly name: string | null;
    };
  };
}

/** The frozen 49-row DEVELOPMENT gold fixture. DEVELOPMENT only - never the HOLDOUT split, never the mixed adjudication file. */
const DEV_GOLD: readonly DevGoldRecord[] = readFileSync(DEV_LABELS_PATH, 'utf8')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line) as DevGoldRecord);

function goldRecord(goldId: string): DevGoldRecord {
  const rec = DEV_GOLD.find((r) => r.goldId === goldId);
  if (!rec) throw new Error(`gold id ${goldId} not found in the frozen 49-row DEV fixture`);
  return rec;
}

/** The live v6 prompt, and the canonical v5 base reconstructed from it. */
const V6 = ORGUNIT_CLASSIFIER_SYSTEM_PROMPT;
const V5 = v5FromV6(V6);

describe('the frozen DEV gold fixture is exactly the 49-row DEVELOPMENT split this task is scoped to', () => {
  it('has exactly 49 rows, no HOLDOUT or mixed-adjudication content', () => {
    expect(DEV_GOLD).toHaveLength(49);
    expect(new Set(DEV_GOLD.map((r) => r.goldId)).size).toBe(49);
  });

  it('runs against the v6 prompt, whose v5 base reconstructs to the canonical study SHA', () => {
    expect(ORGUNIT_CLASSIFIER_PROMPT_VERSION).toBe('orgunit-classifier-prompt-v6');
    // The v5 base is reconstructed, never read from a second stored copy.
    expect(V5).not.toBe(V6);
    expect(V5.length).toBe(14_843);
  });
});

// ---------------------------------------------------------------------------
// §5A — the three rule texts carry the structural distinctions F1 assigns
// them, and touch nothing they were required to leave alone.
// ---------------------------------------------------------------------------

describe('R1 defines what MAY be the operator, and excludes a funding scheme as a subject', () => {
  it('names the admitted operator shapes, and keeps v5s own "named unit, service or provision" wording', () => {
    expect(V6).toContain(V6_R1_OPERATOR_DEFINITION);
    expect(V6_R1_OPERATOR_DEFINITION).toContain(
      'a named office, department, centre or standing student-facing service',
    );
    // The v5 opening clause is carried verbatim: R1 defines the operator, it
    // does not replace the category.
    expect(V6_R1_OPERATOR_DEFINITION).toContain(
      'the document presents a named unit, service or provision as the operator',
    );
  });

  it('states that a grant/bursary/aid/scholarship/funding-scheme NAME is a subject and not an operator', () => {
    expect(V6_R1_OPERATOR_DEFINITION).toContain(
      'never the name of a grant, bursary, aid, scholarship or funding scheme the page describes, which is a subject and not an operator',
    );
  });

  it('binds the whole-organisation restriction into the primary affirmative itself ("and only then")', () => {
    expect(V6_R1_OPERATOR_DEFINITION).toContain(
      'for a small or non-university organisation and only then, when the document attributes',
    );
    // The v5 sentence had no such restriction on its own affirmative.
    expect(V5).toContain(
      'or, for a small or non-university organisation, when the document attributes',
    );
    expect(V6).not.toContain(
      'or, for a small or non-university organisation, when the document attributes',
    );
  });

  it('states that the organisation naming only itself evidences NO operator, however complete the scheme description', () => {
    expect(V6_R1_OPERATOR_DEFINITION).toContain(
      "When the only entity the document names as administering the function is the organisation itself and that allowance does not apply, no operator is evidenced, however fully the document states the function's eligibility rules, amounts, procedure and contacts.",
    );
    // The apostrophe is the ASCII U+0027 the rest of the prompt uses, never a
    // typographic U+2019 - a smart-quote here would change the prompt SHA.
    expect(V6_R1_OPERATOR_DEFINITION).not.toContain('’');
  });

  it('does NOT weaken the separate whole-organisation allowance paragraph: it is byte-identical to v5', () => {
    const allowanceParagraph = (text: string): string => {
      const start = text.indexOf('The whole-organisation allowance is narrow');
      const end = text.indexOf('\n\n', start);
      return text.slice(start, end);
    };
    expect(allowanceParagraph(V6)).toBe(allowanceParagraph(V5));
    expect(allowanceParagraph(V6)).toContain('A named office is not required for this.');
  });
});

describe('R2 replaces the unobservable external-scheme test with an observable structural one', () => {
  it('requires a heading or section of the units OWN for this subject, with remit / address / opening hours / how it is reached', () => {
    expect(V6).toContain(V6_R2_EXTERNAL_SCHEME_STRUCTURE);
    expect(V6_R2_EXTERNAL_SCHEME_STRUCTURE).toContain(
      'gives that unit a heading or section of its own for this subject',
    );
    expect(V6_R2_EXTERNAL_SCHEME_STRUCTURE).toContain(
      'one stating its remit, its address, its opening hours, or how it is reached as a standing office',
    );
  });

  it('excludes a name that appears only in running text as a mailbox, a deposit point or a deadline', () => {
    expect(V6_R2_EXTERNAL_SCHEME_STRUCTURE).toContain(
      'not when its name appears only inside running text as the mailbox to write to, the place to deposit a file, or the deadline to meet',
    );
  });

  it('removes the incumbent unobservable "standing remit beyond that one scheme" test entirely', () => {
    expect(V5).toContain(
      "does not by itself satisfy step two, unless the document also describes that unit's own standing remit or ongoing operations beyond that one scheme",
    );
    expect(V6).not.toContain('beyond that one scheme');
    expect(V6).not.toContain('unless the document also describes');
    // The bare exclusion v4/v5 opened with is kept, as its own sentence.
    expect(V6_R2_EXTERNAL_SCHEME_STRUCTURE).toContain(
      'does not by itself satisfy step two. It satisfies step two when',
    );
  });

  it('leaves D3s contact-form narrowing, the step-one sentence and the mailbox-step exclusion untouched', () => {
    for (const survivor of [
      'A page whose only content is an interactive contact-form template',
      'does not satisfy step two; a page that instead displays identifying and contact information',
      'Step one: does the document evidence an ongoing operating responsibility',
      "A unit that appears only as one step, mailbox or contact line inside a procedure whose subject is the scheme does not make the page that unit's page.",
    ]) {
      expect(V6, survivor.slice(0, 48)).toContain(survivor);
      expect(V5, survivor.slice(0, 48)).toContain(survivor);
    }
  });
});

describe('R3 gives the thin-evidence blocker explicit precedence, with two stated exceptions', () => {
  it('states the precedence instruction in so many words', () => {
    expect(V6).toContain(V6_R3_THIN_EVIDENCE_PRECEDENCE);
    expect(V6_R3_THIN_EVIDENCE_PRECEDENCE).toContain(
      'Check this blocker before answering UNIT_PAGE',
    );
    expect(V6_R3_THIN_EVIDENCE_PRECEDENCE).toContain(
      'a named office and a way to reach it, with nothing else, is this blocker rather than a unit page',
    );
  });

  it('keys the blocker to a named office with NO body text and uninformative title/headings', () => {
    expect(V6_R3_THIN_EVIDENCE_PRECEDENCE).toContain(
      'the document names an office but supplies no body text at all, and neither its title nor its headings state what that office does, whom it serves, or what it administers',
    );
  });

  it('carries BOTH exceptions, so it is a precedence clarification and not a broad abstention rule', () => {
    expect(V6_R3_THIN_EVIDENCE_PRECEDENCE).toContain(
      "It is not this blocker when the title or the leading heading is that office's own name",
    );
    expect(V6_R3_THIN_EVIDENCE_PRECEDENCE).toContain(
      "nor when the headings themselves state the function's remit, strategy, eligibility or standing procedures",
    );
  });

  it('changes ONLY the one blocker bullet: the NEEDS_REVIEW framing, the other three blockers and the anti-abstention paragraph are byte-identical to v5', () => {
    const needsReviewSection = (text: string): string =>
      text.slice(text.indexOf('## When to use NEEDS_REVIEW'), text.indexOf('## Evidence and'));
    const v5Section = needsReviewSection(V5);
    const v6Section = needsReviewSection(V6);
    // The framing sentence that gates the whole blocker list is unchanged -
    // the list is reached only for a page with genuine partial unit evidence.
    for (const unchanged of [
      'Reserve NEEDS_REVIEW for a page with genuine partial evidence of a unit AND a specific blocker you can name in the rationale. Legitimate blockers, and only these:',
      '- the page describes multiple distinct units with no single primary subject;',
      '- a genuine LANGUAGE_CENTRE vs LANGUAGE_DEPARTMENT (or unit vs degree-programme) ambiguity the evidence itself cannot resolve;',
      '- conflicting evidence within the supplied fields (for example, the title names an office but the excerpt describes a degree programme).',
      'Being merely unsure which `page_kind` a NOT_A_UNIT page deserves is NOT NEEDS_REVIEW',
    ]) {
      expect(v6Section, unchanged.slice(0, 48)).toContain(unchanged);
      expect(v5Section, unchanged.slice(0, 48)).toContain(unchanged);
    }
    // Reversing R3 alone restores the v5 section byte for byte.
    expect(
      v6Section.replace(V6_R3_THIN_EVIDENCE_PRECEDENCE, V6_DELTA_OPERATIONS[2]!.anchorParagraph),
    ).toBe(v5Section);
  });
});

describe('the v6 delta as a whole is bounded: three operations, two paragraphs, nothing else in the prompt', () => {
  it('touches neither the taxonomy, the relevance axes, the evidence/citation rules, the untrusted-content rules nor the output section', () => {
    const sections = (text: string): Record<string, string> => {
      const cut = (from: string, to: string): string =>
        text.slice(text.indexOf(from), to === '' ? undefined : text.indexOf(to));
      return {
        taxonomy: cut('## Taxonomy', '## Relevance axes'),
        axes: cut('## Relevance axes', '## When to use NEEDS_REVIEW'),
        evidence: cut('## Evidence and citation', '## Untrusted content'),
        untrusted: cut('## Untrusted content', '## Other rules'),
        otherRules: cut('## Other rules', '## Output'),
        output: cut('## Output', ''),
      };
    };
    const v5s = sections(V5);
    const v6s = sections(V6);
    for (const key of Object.keys(v6s)) {
      expect(v6s[key], `section ${key} changed`).toBe(v5s[key]);
    }
  });

  it('introduces no new taxonomy value, no threshold, no digit and no confidence rule', () => {
    const delta = V6_DELTA_OPERATIONS.map((op) => op.text).join('\n');
    expect(delta, 'the delta carries a digit').not.toMatch(/\d/);
    for (const banned of [
      'confidence',
      'threshold',
      'gold',
      'DEVELOPMENT',
      'HOLDOUT',
      'precision',
      'recall',
      'repair',
      'NEEDS_REVIEW always',
    ]) {
      expect(delta.toLowerCase(), `the delta names ${banned}`).not.toContain(banned.toLowerCase());
    }
    // The only verdict tokens the delta may name are the two it already used.
    expect(delta).toContain('UNIT_PAGE');
    expect(delta).not.toContain('DEGREE_PROGRAMME_PAGE');
    expect(delta).not.toContain('GENERIC_INSTITUTIONAL_PAGE');
  });
});

// ---------------------------------------------------------------------------
// §5A — the seven historical semantic-error items, all grounded in the
// frozen fixture. Each test states which structural distinction the new text
// targets or preserves; NONE predicts the model's answer.
// ---------------------------------------------------------------------------

describe('§5A: the seven historical semantic-error items are grounded, and each ones mechanism is named', () => {
  it('g04d170f4d3fda759 (R1 target) is a funding-scheme page at a full university that names no unit - exactly R1s excluded shape', () => {
    const rec = goldRecord('g04d170f4d3fda759');
    expect(rec.proposed.verdict).toBe('NOT_A_UNIT');
    expect(rec.proposed.hard_negative).toBe(true);
    expect(rec.proposed.page_kind).toBe('GENERIC_INSTITUTIONAL_PAGE');
    expect(rec.proposed.unit_name_expectation.kind).toBe('NULL');
    // A full university, so R1's "and only then" whole-organisation gate does not open.
    expect(rec.organisationName).toMatch(/^UNIVERSITE/i);
    // Its subject is a family of aid schemes, and no unit is named.
    expect(rec.rationale).toContain('no unit is named');
    expect(rec.rationale).toContain('mobility aids');
    // The gold rationale's own enumeration is the one R1's closing sentence
    // now explicitly declares insufficient.
    for (const stated of ['eligibility', 'versement', 'candidature', 'contacts']) {
      expect(rec.rationale, stated).toContain(stated);
    }
    expect(V6_R1_OPERATOR_DEFINITION).toContain(
      "however fully the document states the function's eligibility rules, amounts, procedure and contacts",
    );
  });

  it('g0ec0d43dad311a77 (R2 target, a POSITIVE) has DAI headings of its own - exactly the structure R2 now admits', () => {
    const rec = goldRecord('g0ec0d43dad311a77');
    expect(rec.proposed.verdict).toBe('UNIT_PAGE');
    expect(rec.proposed.unit_type).toBe('INTERNATIONAL_MOBILITY_OFFICE');
    expect(rec.proposed.unit_name_expectation).toEqual({ kind: 'NAMED', name: 'DAI' });
    // The gold record's own evidence is a heading naming the unit AND a
    // heading giving its address and opening hours - the two observables
    // R2's replacement test names.
    expect(rec.rationale).toContain("headings 'Contacter la DAI', 'Adresse et horaires de la DAI'");
    expect(V6_R2_EXTERNAL_SCHEME_STRUCTURE).toContain('its address, its opening hours');
  });

  it('g536c8b148048fcbc (R2 negative control) names the DRI only as a contact - exactly the shape R2 still refuses', () => {
    const rec = goldRecord('g536c8b148048fcbc');
    expect(rec.proposed.verdict).toBe('NOT_A_UNIT');
    expect(rec.proposed.hard_negative).toBe(true);
    expect(rec.proposed.page_kind).toBe('GENERIC_INSTITUTIONAL_PAGE');
    expect(rec.rationale).toContain('the DRI appears only as a contact');
    // No heading or section of the DRI's own is recorded for this item.
    expect(rec.rationale).not.toContain('horaires');
    expect(V6_R2_EXTERNAL_SCHEME_STRUCTURE).toContain(
      'not when its name appears only inside running text as the mailbox to write to',
    );
  });

  it('g6458a352bc79ca01 (R3 target) names an office in its headings with an EMPTY excerpt, and its title is not the offices own name', () => {
    const rec = goldRecord('g6458a352bc79ca01');
    expect(rec.proposed.verdict).toBe('NEEDS_REVIEW');
    expect(rec.difficulty).toBe('HARD');
    expect(rec.proposed.page_kind).toBeNull();
    expect(rec.proposed.unit_type).toBeNull();
    // The exact shape R3's blocker is keyed to: an office named, no body text.
    expect(rec.rationale).toContain('the excerpt is empty');
    expect(rec.rationale).toContain('too sparse');
    // R3's FIRST exception is keyed to the title (or leading heading) being
    // the office's own name. This item's title is a generic "Contacts", so
    // that exception does not reach it on the title.
    expect(rec.title).toBe('Contacts');
    expect(rec.title).not.toContain('Direction');
    // NOTE, and this is a limit of what can be checked here: whether this
    // document's LEADING HEADING is the office's own name is a property of
    // its headings, which the gold fixture does not carry. No claim is made
    // either way, and no claim is made about what a model would answer.
  });

  it('g34bbf7536e99b410 and ga971a6fc52af6b5f (the ESLSCA pair) are non-university positives naming no unit - R1s "and only then" gate is open for them', () => {
    for (const goldId of ['g34bbf7536e99b410', 'ga971a6fc52af6b5f']) {
      const rec = goldRecord(goldId);
      expect(rec.proposed.verdict, goldId).toBe('UNIT_PAGE');
      expect(rec.proposed.unit_type, goldId).toBe('INTERNATIONAL_MOBILITY_OFFICE');
      expect(rec.proposed.unit_name_expectation.kind, goldId).toBe('NULL');
      // A private business school, not a full university: the exact
      // organisation class R1's restriction admits rather than excludes.
      expect(rec.organisationName, goldId).not.toMatch(/^UNIVERSIT/i);
      expect(rec.organisationName, goldId).toContain('Ecole Sup');
      expect(rec.rationale, goldId).toContain('no unit name stated');
    }
  });

  it('g66010a25ac194274 is DELIBERATELY UNFIXED: it names no office at all, so R3s blocker is not even keyed to it', () => {
    const rec = goldRecord('g66010a25ac194274');
    expect(rec.proposed.verdict).toBe('NEEDS_REVIEW');
    expect(rec.difficulty).toBe('HARD');
    // Its only content is a scheme name plus a post-archive navigation
    // control; unlike g6458a35 it names no office whatsoever.
    expect(rec.rationale).toContain("'Erasmus +' plus 'Posts navigation'");
    expect(rec.rationale).not.toContain('office');
    // R3's blocker is keyed to "the document names an office"; this item does
    // not, so no operation in this delta targets it. Recorded, not fixed.
    expect(V6_R3_THIN_EVIDENCE_PRECEDENCE).toContain('the document names an office');
    // And no operation names a post-archive / listing distinction that would
    // reach it instead.
    const delta = V6_DELTA_OPERATIONS.map((op) => op.text)
      .join('\n')
      .toLowerCase();
    for (const absent of ['archive', 'navigation', 'listing', 'post']) {
      expect(delta, `the delta names ${absent}`).not.toContain(absent);
    }
  });
});

// ---------------------------------------------------------------------------
// §5B/§5C/§5D — the regression-risk controls the owner instruction names.
// ---------------------------------------------------------------------------

describe('§5B: R1 controls - each stays outside R1s excluded shape, for a stated reason', () => {
  it('gf65026e32d9da8db and g877a05e6f5bba835 are carried by a NAMED OFFICE (the DAI), which is exactly what R1 admits as an operator', () => {
    for (const goldId of ['gf65026e32d9da8db', 'g877a05e6f5bba835']) {
      const rec = goldRecord(goldId);
      expect(rec.proposed.verdict, goldId).toBe('UNIT_PAGE');
      expect(rec.proposed.unit_type, goldId).toBe('INTERNATIONAL_MOBILITY_OFFICE');
      expect(rec.proposed.unit_name_expectation, goldId).toEqual({
        kind: 'NAMED',
        name: 'Direction des Affaires Internationales (DAI)',
      });
      // A "Direction des Affaires Internationales" is a named office/
      // department, not the name of the aid scheme the page describes - so
      // R1's scheme-name exclusion does not reach it, even at a full
      // university.
      expect(rec.rationale, goldId).toContain('Direction des Affaires Internationales');
    }
    expect(V6_R1_OPERATOR_DEFINITION).toContain('a named office, department, centre');
  });

  it('g99a9fe00e4856de2 is a named standing student-facing PROVISION (FLE), a category R1 carries over from v5 verbatim', () => {
    const rec = goldRecord('g99a9fe00e4856de2');
    expect(rec.proposed.verdict).toBe('UNIT_PAGE');
    expect(rec.proposed.unit_type).toBe('LANGUAGE_CENTRE');
    expect(rec.rationale).toContain('Operational French-as-a-foreign-language teaching provision');
    // "provision" and "standing student-facing service" are both admitted
    // operator shapes under R1; neither is a funding scheme's name.
    expect(V6_R1_OPERATOR_DEFINITION).toContain('named unit, service or provision');
    expect(V6_R1_OPERATOR_DEFINITION).toContain('standing student-facing service');
  });

  it('ge789b0f0aedc398c and gdb5b7246327094ef are whole-organisation positives at NON-university organisations - R1s "and only then" gate is open for both', () => {
    const expected: Record<string, string> = {
      ge789b0f0aedc398c: 'small BTS school',
      gdb5b7246327094ef: 'CUFR',
    };
    for (const [goldId, marker] of Object.entries(expected)) {
      const rec = goldRecord(goldId);
      expect(rec.proposed.verdict, goldId).toBe('UNIT_PAGE');
      expect(rec.proposed.unit_type, goldId).toBe('INTERNATIONAL_MOBILITY_OFFICE');
      expect(rec.proposed.unit_name_expectation.kind, goldId).toBe('NULL');
      expect(rec.organisationName, goldId).not.toMatch(/^UNIVERSIT/i);
      expect(rec.rationale, goldId).toContain(marker);
    }
  });

  it('g32779df2d7b56a34 and g956f99fae4ad4764 (the IPAG pair) stay NOT_A_UNIT on the allowance paragraphs OWN unchanged requirements, not on anything R1 added', () => {
    for (const goldId of ['g32779df2d7b56a34', 'g956f99fae4ad4764']) {
      const rec = goldRecord(goldId);
      expect(rec.proposed.verdict, goldId).toBe('NOT_A_UNIT');
      expect(rec.proposed.hard_negative, goldId).toBe(true);
      expect(rec.proposed.page_kind, goldId).toBe('GENERIC_INSTITUTIONAL_PAGE');
      expect(rec.proposed.unit_name_expectation.kind, goldId).toBe('NULL');
      // These are institution-level scheme pages whose SUBJECT is the
      // programme. IPAG is not university-prefixed, so the whole-organisation
      // allowance is reachable for it - which is precisely why the reason
      // these stay NOT_A_UNIT must come from the allowance's own narrowness
      // ("a page whose subject is the external programme itself ... is
      // NOT_A_UNIT"), and R1 leaves that paragraph byte-identical.
      expect(rec.organisationName, goldId).not.toMatch(/^UNIVERSIT/i);
      // Both twins record the page as institution-level with no unit named;
      // the two rationales word it differently ("Institution-level page" /
      // "at institution level with no unit named"), so match either.
      expect(rec.rationale, goldId).toMatch(/institution.level/i);
      expect(rec.rationale, goldId).toMatch(/no (organisational )?unit (is )?named/i);
    }
    expect(V6).toContain(
      "a page whose subject is the external programme itself, its grant amounts, its conditions or its sponsor's description, with the organisation appearing only as a participant, is NOT_A_UNIT",
    );
  });
});

describe('§5C: R2 controls', () => {
  it('g3130d41296ab8739 names the DRRI only as the office to inform - the running-text mailbox shape R2 still refuses', () => {
    const rec = goldRecord('g3130d41296ab8739');
    expect(rec.proposed.verdict).toBe('NOT_A_UNIT');
    expect(rec.proposed.hard_negative).toBe(true);
    expect(rec.proposed.page_kind).toBe('GENERIC_INSTITUTIONAL_PAGE');
    expect(rec.rationale).toContain('DRRI appears only as the office to inform');
    expect(rec.rationale).toContain('subject is the scheme');
    expect(V6_R2_EXTERNAL_SCHEME_STRUCTURE).toContain('the mailbox to write to');
  });

  it('gf65026e32d9da8db has a dedicated section of the units own - the structure R2 now admits', () => {
    const rec = goldRecord('gf65026e32d9da8db');
    expect(rec.proposed.verdict).toBe('UNIT_PAGE');
    expect(rec.rationale).toContain("dedicated 'Contact à la DAI' section");
    expect(V6_R2_EXTERNAL_SCHEME_STRUCTURE).toContain('a heading or section of its own');
  });
});

describe('§5D: R3 controls - each is reached by one of R3s two stated exceptions, or is outside the blocker entirely', () => {
  it('g7e9744e811f58e20s TITLE is the units own name - R3s first exception names exactly this case', () => {
    const rec = goldRecord('g7e9744e811f58e20');
    expect(rec.proposed.verdict).toBe('UNIT_PAGE');
    expect(rec.proposed.unit_type).toBe('OTHER_UNIT');
    expect(rec.proposed.unit_name_expectation).toEqual({
      kind: 'NAMED',
      name: 'Centre de documentation',
    });
    // The title LEADS with the unit's own name, which is R3's first exception.
    expect(rec.title).not.toBeNull();
    expect(rec.title!.startsWith('Centre de documentation')).toBe(true);
    expect(V6_R3_THIN_EVIDENCE_PRECEDENCE).toContain(
      "It is not this blocker when the title or the leading heading is that office's own name",
    );
    // It also has body content (H1 plus contact details), so it is not the
    // "no body text at all" shape in the first place.
    expect(rec.rationale).toContain('opening hours');
  });

  it('ge789b0f0aedc398cs HEADINGS state charter, strategy and eligibility - R3s second exception names exactly this case', () => {
    const rec = goldRecord('ge789b0f0aedc398c');
    expect(rec.proposed.verdict).toBe('UNIT_PAGE');
    // Empty excerpt, but the HEADINGS carry the function's own remit.
    expect(rec.ambiguity).toContain('Excerpt is empty');
    expect(rec.rationale).toContain('own headings describe');
    for (const stated of ['charter', 'strategy', 'eligibility']) {
      expect(rec.rationale, stated).toContain(stated);
    }
    expect(V6_R3_THIN_EVIDENCE_PRECEDENCE).toContain(
      "nor when the headings themselves state the function's remit, strategy, eligibility or standing procedures",
    );
  });

  it('g52788fd323659c9c is a NOT_A_UNIT directory, outside the NEEDS_REVIEW blocker list R3 edits at all', () => {
    const rec = goldRecord('g52788fd323659c9c');
    expect(rec.proposed.verdict).toBe('NOT_A_UNIT');
    expect(rec.proposed.page_kind).toBe('NAVIGATION_OR_LANDING_PAGE');
    expect(rec.rationale).toContain('an index of people, no single unit as the page');
    // R3 edits one bullet INSIDE the blocker list, and that list is reached
    // only for "a page with genuine partial evidence of a unit". The framing
    // sentence that says so is byte-identical to v5 (asserted above), and R3
    // adds no instruction to prefer NEEDS_REVIEW over NOT_A_UNIT.
    expect(V6_R3_THIN_EVIDENCE_PRECEDENCE).not.toContain('NOT_A_UNIT');
    expect(V6).toContain(
      'Being merely unsure which `page_kind` a NOT_A_UNIT page deserves is NOT NEEDS_REVIEW',
    );
  });
});

// ---------------------------------------------------------------------------
// §5E — the remaining protected controls named in the F1 instruction. These
// assert the RULE-LEVEL INTENDED OUTCOME recorded in the frozen fixture, and
// that nothing in the v6 delta is keyed to their shape.
// ---------------------------------------------------------------------------

describe('§5E: the remaining protected controls keep their recorded intended outcomes', () => {
  const NAMED_UNIT_POSITIVES: readonly (readonly [string, string])[] = [
    ['g57607d4278d6dc23', 'Direction de la Recherche et des Relations Internationales (DRRI)'],
    ['g735298870fe173b8', 'Student Mobility Office'],
    ['ge419f0b9902faee0', 'International Student Integration team'],
    ['g9c1b65eda41afda2', 'service des relations internationales'],
  ];

  it('the four named-unit UNIT_PAGE positives each name a real office in evidence - R1 admits a named office as the operator', () => {
    for (const [goldId, unitName] of NAMED_UNIT_POSITIVES) {
      const rec = goldRecord(goldId);
      expect(rec.proposed.verdict, goldId).toBe('UNIT_PAGE');
      expect(rec.proposed.unit_type, goldId).toBe('INTERNATIONAL_MOBILITY_OFFICE');
      expect(rec.proposed.unit_name_expectation, goldId).toEqual({
        kind: 'NAMED',
        name: unitName,
      });
      expect(rec.proposed.hard_negative, goldId).toBe(false);
    }
  });

  it('gcce4e2a5f608de5d stays a LANGUAGE_DEPARTMENT: none of R1/R2/R3 touches the unit-vs-degree-programme boundary', () => {
    const rec = goldRecord('gcce4e2a5f608de5d');
    expect(rec.proposed.verdict).toBe('UNIT_PAGE');
    expect(rec.proposed.unit_type).toBe('LANGUAGE_DEPARTMENT');
    expect(rec.difficulty).toBe('HARD');
    // The delta names no degree/programme distinction, and the taxonomy
    // section is byte-identical to v5 (asserted above).
    const delta = V6_DELTA_OPERATIONS.map((op) => op.text)
      .join('\n')
      .toLowerCase();
    for (const absent of ['degree', 'programme', 'licence', 'master', 'curriculum']) {
      expect(delta, `the delta names ${absent}`).not.toContain(absent);
    }
  });

  it('the two D3 contact-form negatives stay SERVICE_TOOL_PAGE, on D3s own unchanged sentence', () => {
    for (const goldId of ['g4454e841c09dd8d0', 'ga435ea22d4b11cf4']) {
      const rec = goldRecord(goldId);
      expect(rec.proposed.verdict, goldId).toBe('NOT_A_UNIT');
      expect(rec.proposed.page_kind, goldId).toBe('SERVICE_TOOL_PAGE');
      expect(rec.rationale, goldId).toContain('contact-form template');
    }
    // D3's sentence is byte-identical in v5 and v6.
    const d3 =
      "A page whose only content is an interactive contact-form template (name, message or similar fields addressed to a named unit) with no descriptive text about that unit's remit, activities or people served does not satisfy step two";
    expect(V6).toContain(d3);
    expect(V5).toContain(d3);
  });

  it('the two plain institutional non-units stay NOT_A_UNIT, untouched by every operation', () => {
    const rec057 = goldRecord('g057656b07c6aa620');
    expect(rec057.proposed.verdict).toBe('NOT_A_UNIT');
    expect(rec057.proposed.page_kind).toBe('GENERIC_INSTITUTIONAL_PAGE');
    expect(rec057.rationale).toContain('Plain institutional contact page');
    // A plain contact page with no unit as its subject: it names no office,
    // so R3's blocker is not keyed to it, and R2's scheme-contact test does
    // not apply (there is no externally-sponsored scheme).
    expect(rec057.rationale).toContain('no unit subject');

    const rec04b = goldRecord('g04b64db14c03ce3a');
    expect(rec04b.proposed.verdict).toBe('NOT_A_UNIT');
    expect(rec04b.proposed.page_kind).toBe('NAVIGATION_OR_LANDING_PAGE');
    expect(rec04b.rationale).toContain('no unit is its own subject');
  });
});

/**
 * Coverage check: every item this contract file relies on is exactly the set
 * the owner instruction names - neither a superset invented here nor a
 * subset that quietly drops one of the cited items.
 */
describe('this contract file names exactly the gold ids the owner F1 instruction specifies', () => {
  it('covers all seven semantic targets and every R1/R2/R3/other control, and every one exists in the frozen DEV fixture', () => {
    const sevenSemanticTargets = [
      'g04d170f4d3fda759',
      'g0ec0d43dad311a77',
      'g536c8b148048fcbc',
      'g6458a352bc79ca01',
      'g34bbf7536e99b410',
      'ga971a6fc52af6b5f',
      'g66010a25ac194274',
    ];
    const r1Controls = [
      'gf65026e32d9da8db',
      'g99a9fe00e4856de2',
      'ge789b0f0aedc398c',
      'gdb5b7246327094ef',
      'g32779df2d7b56a34',
      'g956f99fae4ad4764',
    ];
    const r2Controls = ['g3130d41296ab8739', 'gf65026e32d9da8db'];
    const r3Controls = ['g7e9744e811f58e20', 'ge789b0f0aedc398c', 'g52788fd323659c9c'];
    const otherProtectedControls = [
      'g57607d4278d6dc23',
      'g735298870fe173b8',
      'ge419f0b9902faee0',
      'g877a05e6f5bba835',
      'gcce4e2a5f608de5d',
      'g9c1b65eda41afda2',
      'g057656b07c6aa620',
      'g4454e841c09dd8d0',
      'ga435ea22d4b11cf4',
      'g04b64db14c03ce3a',
    ];
    expect(sevenSemanticTargets).toHaveLength(7);
    expect(r1Controls.length).toBeGreaterThanOrEqual(6);
    expect(r2Controls.length).toBeGreaterThanOrEqual(2);
    expect(r3Controls.length).toBeGreaterThanOrEqual(3);
    expect(otherProtectedControls).toHaveLength(10);
    for (const goldId of [
      ...sevenSemanticTargets,
      ...r1Controls,
      ...r2Controls,
      ...r3Controls,
      ...otherProtectedControls,
    ]) {
      expect(() => goldRecord(goldId), goldId).not.toThrow();
    }
  });

  it('asserts only fixture-recorded outcomes and prompt text: every expectation in this file reads the frozen gold fixture or the prompt, never a run result', () => {
    // There is no results directory, no summary.json, no provider record and
    // no metric in this file's reach: the only two sources it opens are the
    // frozen DEV label fixture and the production prompt module.
    expect(DEV_LABELS_PATH).toContain('orgunit-classifier-sonnet-acceptance-dev-labels-v1.jsonl');
    expect(DEV_LABELS_PATH).not.toContain('holdout');
    expect(DEV_LABELS_PATH).not.toContain('gold-v1.jsonl');
    expect(DEV_LABELS_PATH).not.toContain('results');
    // And the prompt this file checks carries no metric, threshold or gate of
    // its own that a contract here could be read as predicting.
    for (const absent of ['precision', 'recall', 'threshold', 'accuracy', 'gate']) {
      expect(V6.toLowerCase(), `the prompt names ${absent}`).not.toContain(absent);
    }
  });
});
