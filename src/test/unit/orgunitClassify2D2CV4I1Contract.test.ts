/**
 * PHASE 2B-2D2C-V4I1 — SEMANTIC CONTRACT TESTS FOR THE THREE BOUNDED
 * NARROWINGS (D1, D2, D3), AND NOTHING ELSE.
 *
 * These are SPECIFICATION tests, not a classifier and not a prediction of
 * model behaviour. Two kinds of claim are checked, both purely textual:
 *
 *   1. STRUCTURAL MONOTONICITY of the v4 delta itself: each of D1/D2/D3
 *      only ADDS a restrictive condition to the v3 text — D1's REPLACE
 *      keeps the entire v3 sentence it narrows, verbatim, as a suffix; D2
 *      and D3's INSERTs leave their anchor sentence untouched and add a
 *      new sentence strictly AFTER it. None removes or weakens anything
 *      v3 already required. This is checked against the prompt text
 *      alone, with no reference to any document.
 *   2. GROUNDING against the frozen, committed 49-row DEVELOPMENT gold
 *      label fixture
 *      (`src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-dev-labels-v1.jsonl`):
 *      every gold id this task's owner instruction and the F0H audit name
 *      as a "must remain rescued" positive or a "false positive restored"
 *      negative is checked to actually exist in that fixture with the
 *      verdict/page_kind/rationale substrings the audit attributes to it —
 *      so this file cannot silently drift from the frozen record it cites.
 *
 * This file predicts NOTHING about what a live model call would answer on
 * any of these documents. Zero provider calls, zero inference. It is a
 * contract on the PROMPT TEXT and an audit of the CITED GOLD RECORDS, not
 * a hand-built classifier.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ORGUNIT_CLASSIFIER_SYSTEM_PROMPT } from '../../orgunits/classify/prompt.js';
import { V4_DELTA_OPERATIONS, v3FromV4 } from '../harness/phase2b2d2c/promptLineage.js';

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

describe('the frozen DEV gold fixture is exactly the 49-row DEVELOPMENT split this task is scoped to', () => {
  it('has exactly 49 rows, no HOLDOUT or mixed-adjudication content', () => {
    expect(DEV_GOLD).toHaveLength(49);
    expect(new Set(DEV_GOLD.map((r) => r.goldId)).size).toBe(49);
  });
});

/**
 * D1/D2/D3 are each a NARROWING: they can only move a page from a
 * potential UNIT_PAGE reading toward NOT_A_UNIT, never the reverse,
 * because each operation only adds a restrictive condition on top of text
 * v3 already had, and removes nothing.
 */
describe('D1, D2 and D3 are each a pure textual narrowing of v3 - nothing removed, nothing weakened', () => {
  it('D1 (REPLACE_SENTENCE) keeps every word of the v3 sentence, only lower-casing its leading letter to read as a subordinate clause', () => {
    const d1 = V4_DELTA_OPERATIONS[0]!;
    expect(d1.kind).toBe('REPLACE_SENTENCE');
    // The narrowed sentence, with the restrictive prefix removed and its first letter re-capitalised, is byte-for-byte the v3 sentence.
    const prefix = 'For a small or non-university organisation as described above, ';
    expect(d1.text.startsWith(prefix)).toBe(true);
    const remainder = d1.text.slice(prefix.length);
    const recapitalised = remainder.charAt(0).toUpperCase() + remainder.slice(1);
    expect(recapitalised).toBe(d1.anchorParagraph);
  });

  it('D2 and D3 (INSERT_SENTENCE_AFTER) leave their anchor sentence untouched and add new material strictly after it', () => {
    const d2 = V4_DELTA_OPERATIONS[1]!;
    const d3 = V4_DELTA_OPERATIONS[2]!;
    expect(d2.kind).toBe('INSERT_SENTENCE_AFTER');
    expect(d3.kind).toBe('INSERT_SENTENCE_AFTER');
    // Both new sentences are exclusionary ("does not ... satisfy step two"), never permissive.
    expect(d2.text).toMatch(/does not by itself satisfy step two/);
    expect(d3.text).toMatch(/does not satisfy step two/);
    // Neither sentence removes or contradicts anything the anchor already said.
    expect(d2.text.includes(d2.anchorParagraph)).toBe(false);
    expect(d3.text.includes(d3.anchorParagraph)).toBe(false);
  });

  it('none of the three operations touches the NEEDS_REVIEW section, the taxonomy, or the evidence/citation rules', () => {
    const v3 = v3FromV4(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT);
    const needsReviewSection = v3.slice(
      v3.indexOf('## When to use NEEDS_REVIEW'),
      v3.indexOf('## Evidence and citation'),
    );
    const v4NeedsReviewSection = ORGUNIT_CLASSIFIER_SYSTEM_PROMPT.slice(
      ORGUNIT_CLASSIFIER_SYSTEM_PROMPT.indexOf('## When to use NEEDS_REVIEW'),
      ORGUNIT_CLASSIFIER_SYSTEM_PROMPT.indexOf('## Evidence and citation'),
    );
    expect(v4NeedsReviewSection).toBe(needsReviewSection);
  });
});

describe('D1 (SMALL_ORGANISATION_RESCUE_TOO_BROAD): protected positive and restored negative, grounded in the frozen fixture', () => {
  it('the whole-organisation-rescue positive that must remain rescued is in fact a small, named non-university organisation', () => {
    const rec = goldRecord('ge789b0f0aedc398c');
    expect(rec.proposed.verdict).toBe('UNIT_PAGE');
    expect(rec.organisationName).not.toMatch(/UNIVERSIT/i);
    expect(rec.rationale).toContain('small BTS school');
  });

  it('the false positive D1 restores is in fact a large university with no unit named in the evidence', () => {
    const rec = goldRecord('g04d170f4d3fda759');
    expect(rec.proposed.verdict).toBe('NOT_A_UNIT');
    expect(rec.proposed.hard_negative).toBe(true);
    expect(rec.organisationName).toMatch(/UNIVERSITE/i);
    expect(rec.rationale).toContain('no unit is named');
  });

  it('the three predicted-at-risk hard negatives that stayed correct under V3 already fail the rescue on a DIFFERENT ground than organisation size, so D1 cannot disturb them', () => {
    // Each of these documents was already rejected because ITS OWN subject
    // is the external scheme, not because of any size qualifier - so
    // adding a size qualifier (which only NARROWS eligibility) cannot flip
    // them, regardless of whether the named organisation is itself small.
    for (const goldId of ['g32779df2d7b56a34', 'g956f99fae4ad4764', 'g3130d41296ab8739']) {
      const rec = goldRecord(goldId);
      expect(rec.proposed.verdict, goldId).toBe('NOT_A_UNIT');
      expect(rec.proposed.hard_negative, goldId).toBe(true);
      expect(rec.rationale, goldId).toMatch(
        /no (organisational )?unit (is )?named|DRRI appears only/,
      );
    }
  });
});

describe('D2 (OPERATOR_MENTION_MISTAKEN_FOR_PAGE_SUBJECT): protected positives and restored negative, grounded in the frozen fixture', () => {
  it('every positive that must remain rescued describes the named office’s OWN remit, not merely a contact line for an external scheme', () => {
    const ownRemitMarkers = [
      { goldId: 'gf65026e32d9da8db', marker: 'Direction des Affaires Internationales' },
      { goldId: 'g57607d4278d6dc23', marker: 'director named, mission stated' },
      { goldId: 'g0ec0d43dad311a77', marker: 'DAI service page' },
      { goldId: 'g877a05e6f5bba835', marker: "DAI's own welcome page" },
    ];
    for (const { goldId, marker } of ownRemitMarkers) {
      const rec = goldRecord(goldId);
      expect(rec.proposed.verdict, goldId).toBe('UNIT_PAGE');
      expect(rec.proposed.unit_type, goldId).toBe('INTERNATIONAL_MOBILITY_OFFICE');
      expect(rec.rationale, goldId).toContain(marker);
    }
  });

  it('the false positive D2 restores is in fact a named office appearing only as a contact for an externally-sponsored scheme', () => {
    const rec = goldRecord('g536c8b148048fcbc');
    expect(rec.proposed.verdict).toBe('NOT_A_UNIT');
    expect(rec.proposed.hard_negative).toBe(true);
    expect(rec.rationale).toContain('the DRI appears only as a contact');
  });
});

describe('D3 (PAGE_SUBJECT_TWO_STAGE_OVERREACH): protected positive and restored negatives, grounded in the frozen fixture', () => {
  it('the base-prompt precedent D3 is built to preserve DISPLAYS unit content rather than routing through a bare form', () => {
    const rec = goldRecord('g7e9744e811f58e20');
    expect(rec.proposed.verdict).toBe('UNIT_PAGE');
    expect(rec.proposed.page_kind).toBeNull();
    expect(rec.rationale).not.toMatch(/contact-form/i);
    expect(rec.rationale).toContain('H1, plus its email/phone/opening hours');
  });

  it('both false positives D3 restores are in fact bare, template-identical interactive contact-form pages naming a unit with no descriptive content', () => {
    for (const goldId of ['g4454e841c09dd8d0', 'ga435ea22d4b11cf4']) {
      const rec = goldRecord(goldId);
      expect(rec.proposed.verdict, goldId).toBe('NOT_A_UNIT');
      expect(rec.proposed.page_kind, goldId).toBe('SERVICE_TOOL_PAGE');
      expect(rec.rationale, goldId).toContain('contact-form template');
    }
  });
});

describe('items F0H identified as NOT a V3 semantic regression stay outside the D1/D2/D3 target shapes', () => {
  it('the two Evry NEEDS_REVIEW-policy items are neither whole-organisation-rescue, nor external-scheme-contact, nor bare-contact-form shaped', () => {
    const contactsPage = goldRecord('g6458a352bc79ca01');
    expect(contactsPage.proposed.verdict).toBe('NEEDS_REVIEW');
    expect(contactsPage.difficulty).toBe('HARD');
    expect(contactsPage.rationale).not.toMatch(/contact-form template/i);

    const directory = goldRecord('g52788fd323659c9c');
    expect(directory.proposed.verdict).toBe('NOT_A_UNIT');
    expect(directory.proposed.page_kind).toBe('NAVIGATION_OR_LANDING_PAGE');
    expect(directory.rationale).not.toMatch(/contact-form template/i);
    expect(directory.rationale).not.toMatch(/externally-sponsored|scholarship/i);
  });
});

/**
 * Coverage check: every item this contract file relies on is exactly the
 * set F0H's own §7/§4 tables named - neither a superset invented here nor
 * a subset that quietly drops one of the audit's own items.
 */
describe('this contract file names exactly the gold ids the owner instruction and the F0H audit specify', () => {
  it('covers all four targeted V3 false positives, all identified protected positives, and both untouched disagreement items', () => {
    const targetedFalsePositives = [
      'g04d170f4d3fda759',
      'g536c8b148048fcbc',
      'g4454e841c09dd8d0',
      'ga435ea22d4b11cf4',
    ];
    const protectedPositives = [
      'ge789b0f0aedc398c',
      'gf65026e32d9da8db',
      'g57607d4278d6dc23',
      'g0ec0d43dad311a77',
      'g877a05e6f5bba835',
      'g7e9744e811f58e20',
    ];
    const untouchedDisagreements = ['g6458a352bc79ca01', 'g52788fd323659c9c'];
    for (const goldId of [
      ...targetedFalsePositives,
      ...protectedPositives,
      ...untouchedDisagreements,
    ]) {
      expect(() => goldRecord(goldId), goldId).not.toThrow();
    }
    expect(targetedFalsePositives).toHaveLength(4);
    expect(protectedPositives).toHaveLength(6);
  });
});
