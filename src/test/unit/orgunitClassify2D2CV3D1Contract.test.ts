/**
 * PHASE 2B-2D2C-V3D1 — SPECIFICATION TESTS FOR THE PROPOSED PROMPT-V3
 * PAGE-SUBJECT CONTRACT, AND THE DETERMINISTIC COUNTEREXAMPLE REVIEW.
 *
 * These pin what the contract MUST say, expressed over evidence attributes
 * an analyst read off the frozen DEVELOPMENT documents. They are not a
 * classifier and prove nothing about a model; they prove that the proposed
 * clauses, as written, separate the frozen positives from the frozen
 * negatives and that no positive rescue reaches a protected negative.
 * The second half applies each "broader reading" a looser prompt could
 * invite and lists exactly which negatives it would flip.
 *
 * The literal-evidence tests at the end run the REAL validator functions
 * against the frozen documents with the exact values the model emitted, so
 * "unsupported stays invalid" is a property of the landed contract, not of
 * this analysis.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  evidenceSpanVerifies,
  unitNameVerifies,
} from '../../orgunits/classify/evidenceVerification.js';
import type { ClassifierDocument } from '../../orgunits/classify/types.js';
import {
  applyBroaderReading,
  applyPromptV3Contract,
  BROADER_READINGS,
  type BroaderReading,
} from '../harness/phase2b2d2c/v3d1/contract.js';
import { DEV_ANNOTATIONS } from '../harness/phase2b2d2c/v3d1/devAnnotations.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const DEV_LABELS =
  'src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-dev-labels-v1.jsonl';
const DEV_CORPUS =
  'src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-v1-canonical-v2.jsonl';

const goldById = new Map(
  readFileSync(join(REPO_ROOT, DEV_LABELS), 'utf8')
    .trim()
    .split('\n')
    .map(
      (line) =>
        JSON.parse(line) as {
          goldId: string;
          proposed: { verdict: string; hard_negative: boolean };
        },
    )
    .map((record) => [record.goldId, record.proposed] as const),
);
const documentById = new Map(
  readFileSync(join(REPO_ROOT, DEV_CORPUS), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as { goldId: string; document: ClassifierDocument })
    .map((record) => [record.goldId, record.document] as const),
);
const annotationById = new Map(DEV_ANNOTATIONS.map((a) => [a.goldId, a] as const));
const annotation = (goldId: string) => {
  const found = annotationById.get(goldId);
  if (!found) throw new Error(`no annotation for ${goldId}`);
  return found;
};

describe('the annotations cover the frozen DEVELOPMENT corpus exactly and copy its gold verdicts unchanged', () => {
  it('annotates every one of the 49 ids once, and no other id', () => {
    expect(DEV_ANNOTATIONS).toHaveLength(49);
    expect(new Set(DEV_ANNOTATIONS.map((a) => a.goldId)).size).toBe(49);
    expect([...annotationById.keys()].sort()).toEqual([...goldById.keys()].sort());
  });

  it('carries the committed gold verdict beside each annotation, unchanged', () => {
    for (const a of DEV_ANNOTATIONS) {
      expect(a.goldVerdict, a.goldId).toBe(goldById.get(a.goldId)!.verdict);
    }
  });
});

describe('the proposed contract reproduces every frozen DEVELOPMENT verdict from the annotated evidence', () => {
  it.each(DEV_ANNOTATIONS.map((a) => [a.goldId, a.goldVerdict] as const))(
    '%s -> %s',
    (goldId, goldVerdict) => {
      expect(applyPromptV3Contract(annotation(goldId)).verdict).toBe(goldVerdict);
    },
  );

  it('pins the owner-confirmed whole-organisation mobility function as UNIT_PAGE through the allowance clause, with no named office', () => {
    const decision = applyPromptV3Contract(annotation('ge789b0f0aedc398c'));
    expect(decision).toEqual({
      verdict: 'UNIT_PAGE',
      clause: 'WHOLE_ORGANISATION_STANDING_FUNCTION_UNIT_PAGE',
    });
    expect(annotation('ge789b0f0aedc398c').namedUnit).toBe('NONE');
  });

  it('pins the two named-operator losses as UNIT_PAGE through the operator-section clause', () => {
    for (const goldId of ['g57607d4278d6dc23', 'gf65026e32d9da8db']) {
      expect(applyPromptV3Contract(annotation(goldId)).clause).toBe(
        'NAMED_OPERATOR_SECTION_UNIT_PAGE',
      );
    }
  });

  it('keeps the two external-programme pages NOT_A_UNIT because no operator is evidenced and the organisation is only a participant', () => {
    for (const goldId of ['g32779df2d7b56a34', 'g956f99fae4ad4764']) {
      const a = annotation(goldId);
      expect(a.organisationOwnStandingCommitment).toBe(false);
      expect(applyPromptV3Contract(a)).toEqual({
        verdict: 'NOT_A_UNIT',
        clause: 'NO_OPERATOR_EVIDENCED_NOT_A_UNIT',
      });
    }
  });

  it('keeps the small-organisation homepage NOT_A_UNIT by structural kind, before any positive clause', () => {
    expect(applyPromptV3Contract(annotation('g04b64db14c03ce3a')).clause).toBe(
      'STRUCTURAL_NON_OPERATING_KIND_NOT_A_UNIT',
    );
  });

  it('keeps the genuine international-student support function UNIT_PAGE (unnamed, small organisation)', () => {
    for (const goldId of ['g34bbf7536e99b410', 'ga971a6fc52af6b5f']) {
      expect(applyPromptV3Contract(annotation(goldId)).clause).toBe(
        'WHOLE_ORGANISATION_STANDING_FUNCTION_UNIT_PAGE',
      );
    }
  });

  it('keeps the named international-relations service UNIT_PAGE', () => {
    expect(applyPromptV3Contract(annotation('g9c1b65eda41afda2')).clause).toBe(
      'NAMED_OPERATOR_SECTION_UNIT_PAGE',
    );
  });

  it('keeps news/event and navigation pages NOT_A_UNIT by structural kind', () => {
    for (const goldId of [
      'g5f96e37ff602795a',
      'g12732ff0388c49e8',
      'g7d88b2fecb73fdb4',
      'g1a0315d94121cfcf',
      'g82fe2243c52f4d73',
      'g27504b2635a39531',
      'g2e0dc1ff57327033',
      'g39e7132da4064000',
    ]) {
      expect(applyPromptV3Contract(annotation(goldId)).clause, goldId).toBe(
        'STRUCTURAL_NON_OPERATING_KIND_NOT_A_UNIT',
      );
    }
  });

  it("keeps an inline-only unit mention from making a scheme page that unit's page", () => {
    for (const goldId of ['g3130d41296ab8739', 'g536c8b148048fcbc']) {
      expect(applyPromptV3Contract(annotation(goldId)).clause).toBe(
        'INLINE_MENTION_IS_NOT_AN_OPERATOR_NOT_A_UNIT',
      );
    }
  });

  it('keeps a scheme managed by a university as a whole NOT_A_UNIT: the allowance is not available to a university', () => {
    const a = annotation('g04d170f4d3fda759');
    expect(a.organisationOwnStandingCommitment).toBe(true);
    expect(a.organisationClass).toBe('UNIVERSITY');
    expect(applyPromptV3Contract(a).clause).toBe('NO_OPERATOR_EVIDENCED_NOT_A_UNIT');
  });

  it('sends sparse unit-shaped evidence to NEEDS_REVIEW before any positive or negative clause', () => {
    for (const goldId of ['g66010a25ac194274', 'g6458a352bc79ca01']) {
      expect(applyPromptV3Contract(annotation(goldId)).clause).toBe(
        'SPARSE_UNIT_SHAPED_EVIDENCE_NEEDS_REVIEW',
      );
    }
  });
});

describe('deterministic counterexample review: which protected negatives each broader reading would flip', () => {
  const negatives = DEV_ANNOTATIONS.filter((a) => a.goldVerdict !== 'UNIT_PAGE');

  const flipsUnder = (reading: BroaderReading): readonly string[] =>
    negatives
      .filter((a) => applyPromptV3Contract(applyBroaderReading(a, reading)).verdict === 'UNIT_PAGE')
      .map((a) => a.goldId)
      .sort();

  it('under the contract as written, zero of the 35 non-UNIT_PAGE items flip', () => {
    expect(negatives).toHaveLength(35);
    expect(negatives.filter((a) => applyPromptV3Contract(a).verdict === 'UNIT_PAGE')).toEqual([]);
  });

  it("reading mere participation as the organisation's own commitment flips exactly the two external-programme pages", () => {
    expect(flipsUnder('PARTICIPATION_READ_AS_OWN_COMMITMENT')).toEqual([
      'g32779df2d7b56a34',
      'g956f99fae4ad4764',
    ]);
  });

  it('reading an inline unit mention as an operator section flips exactly the staff-mobility how-to and the scholarship listing', () => {
    expect(flipsUnder('INLINE_MENTION_READ_AS_OPERATOR')).toEqual([
      'g3130d41296ab8739',
      'g536c8b148048fcbc',
    ]);
  });

  it('reading a university as a small organisation flips exactly the university-managed aid overview', () => {
    expect(flipsUnder('UNIVERSITY_READ_AS_SMALL_ORGANISATION')).toEqual(['g04d170f4d3fda759']);
  });

  it('reading a homepage as a standing function flips nothing: no homepage carries an own-commitment structural subject', () => {
    expect(flipsUnder('HOMEPAGE_READ_AS_STANDING_FUNCTION')).toEqual([]);
  });

  it("the two external-programme pages are the only hard negatives one broader reading flips together, and two flips exceed the precision gate's tolerance of one", () => {
    const atRisk = new Set<string>();
    for (const reading of BROADER_READINGS) for (const id of flipsUnder(reading)) atRisk.add(id);
    expect([...atRisk].sort()).toEqual([
      'g04d170f4d3fda759',
      'g3130d41296ab8739',
      'g32779df2d7b56a34',
      'g536c8b148048fcbc',
      'g956f99fae4ad4764',
    ]);
    for (const id of atRisk) expect(goldById.get(id)!.hard_negative, id).toBe(true);
  });
});

describe('unsupported names and spans remain invalid under the landed validator, on the frozen documents', () => {
  const grantPage = documentById.get('g0ec0d43dad311a77')!;
  const welcomePage = documentById.get('g877a05e6f5bba835')!;
  const siblingAidPage = documentById.get('gf65026e32d9da8db')!;

  it('the expanded unit name both prompts emitted for the grant page is not supported by that document, while its own short form is', () => {
    expect(unitNameVerifies(grantPage, 'Direction des Affaires Internationales (DAI)')).toBe(false);
    expect(unitNameVerifies(grantPage, 'Direction des Affaires Internationales')).toBe(false);
    expect(unitNameVerifies(grantPage, 'DAI')).toBe(true);
  });

  it('the expanded form IS supported by two sibling documents of the same batch — the cross-document source the contract must keep invalid', () => {
    expect(unitNameVerifies(siblingAidPage, 'Direction des Affaires Internationales (DAI)')).toBe(
      true,
    );
    expect(unitNameVerifies(welcomePage, 'Direction des Affaires Internationales (DAI)')).toBe(
      true,
    );
  });

  it('the welcome page quote both prompts attributed to HEADING is literal in EXCERPT only', () => {
    const quote = 'La Direction des Affaires Internationales (DAI)';
    expect(evidenceSpanVerifies(welcomePage, 'HEADING', quote)).toBe(false);
    expect(evidenceSpanVerifies(welcomePage, 'EXCERPT', quote)).toBe(true);
    expect(welcomePage.excerpt.split('\n')[0]).toBe(quote);
    expect(welcomePage.headings.map((h) => h.text)).not.toContain(quote);
  });

  it('a truncated or ellipsed quote stays invalid', () => {
    expect(
      evidenceSpanVerifies(
        welcomePage,
        'EXCERPT',
        'La Direction des Affaires Internationales met en place ... la mobilité encadrée',
      ),
    ).toBe(false);
  });
});
