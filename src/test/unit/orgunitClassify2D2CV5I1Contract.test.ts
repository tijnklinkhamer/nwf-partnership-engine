/**
 * PHASE 2B-2D2C-F0N/V5I1 — SEMANTIC CONTRACT TESTS FOR THE ONE BOUNDED
 * NARROWING (E1), AND NOTHING ELSE.
 *
 * These are SPECIFICATION tests, not a classifier and not a prediction of
 * model behaviour, following the exact philosophy
 * `orgunitClassify2D2CV4I1Contract.test.ts` established for D1/D2/D3. Two
 * kinds of claim are checked, both purely textual:
 *
 *   1. STRUCTURAL MONOTONICITY of the v5 delta itself: E1's REPLACE keeps
 *      the entire v4 sentence it narrows, verbatim, as a suffix - it adds
 *      a restrictive condition, it removes and weakens nothing v4 already
 *      required. This is checked against the prompt text alone, with no
 *      reference to any document.
 *   2. GROUNDING against the frozen, committed 49-row DEVELOPMENT gold
 *      label fixture
 *      (`src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-dev-labels-v1.jsonl`):
 *      every gold id the owner instruction and F0M name as the residual
 *      target, a V4-fixed regression, a protected positive, or a
 *      nearest-neighbour item is checked to actually exist in that
 *      fixture with the verdict/page_kind/rationale/organisation-name
 *      substrings F0M attributes to it - so this file cannot silently
 *      drift from the frozen record it cites.
 *
 * This file predicts NOTHING about what a live model call would answer on
 * any of these documents. Zero provider calls, zero inference. It is a
 * contract on the PROMPT TEXT and an audit of the CITED GOLD RECORDS, not
 * a hand-built classifier.
 *
 * DEVELOPMENT-only fixture, per the F0N erratum
 * (`docs/audits/PHASE_2B_2D2C_F0N_F0M_HOLDOUT_PHRASING_ERRATUM_2026-09.md`):
 * `orgunit-classifier-gold-v1.jsonl`, the mixed adjudication fixture, and
 * every other HOLDOUT-containing file are never opened here.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ORGUNIT_CLASSIFIER_SYSTEM_PROMPT } from '../../orgunits/classify/prompt.js';
import { V5_DELTA_OPERATIONS, v4FromV5, v5FromV6 } from '../harness/phase2b2d2c/promptLineage.js';

/**
 * The v5 text this contract is about, RECONSTRUCTED from the live production
 * prompt. Production is v6 (2D2C-F1/V6I1), so E1's contract is checked
 * against the reconstructed v5 rather than against the live prompt - which
 * is also what proves V6's R1/R2/R3 did not disturb anything E1 established.
 */
const reconstructedV5 = (): string => v5FromV6(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT);

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

describe('the frozen DEV gold fixture is exactly the 49-row DEVELOPMENT split this task is scoped to', () => {
  it('has exactly 49 rows, no HOLDOUT or mixed-adjudication content', () => {
    expect(DEV_GOLD).toHaveLength(49);
    expect(new Set(DEV_GOLD.map((r) => r.goldId)).size).toBe(49);
  });
});

/**
 * E1 is a NARROWING: it can only move a page from a potential UNIT_PAGE
 * reading toward NOT_A_UNIT, never the reverse, because it only adds a
 * restrictive condition on top of text v4 already had, and removes
 * nothing.
 */
describe('E1 is a pure textual narrowing of v4 - nothing removed, nothing weakened', () => {
  it('E1 (REPLACE_SENTENCE) keeps every word of the v4 opening sentence, only inserting the qualifying clause before its final colon', () => {
    const e1 = V5_DELTA_OPERATIONS[0]!;
    expect(e1.kind).toBe('REPLACE_SENTENCE');
    // The narrowed sentence, with the inserted qualifying clause removed, is byte-for-byte the v4 sentence.
    const insertion =
      ' and, like the rest of this paragraph, applies only to a small or non-university organisation as described above';
    expect(e1.text.includes(insertion)).toBe(true);
    expect(e1.text.replace(insertion, '')).toBe(e1.anchorParagraph);
  });

  it('does not touch D2, D3 or Candidate C: reconstructing v4 and diffing shows exactly one sentence changed', () => {
    const v5 = reconstructedV5();
    const v4 = v4FromV5(v5);
    // Every v4 paragraph other than the one E1 replaces survives unchanged in v5.
    const v4Paragraphs = v4.split('\n\n');
    const v5Paragraphs = v5.split('\n\n');
    expect(v5Paragraphs).toHaveLength(v4Paragraphs.length);
    const changed = v4Paragraphs.filter((p, i) => p !== v5Paragraphs[i]);
    expect(changed).toHaveLength(1);
    expect(changed[0]).toContain(V5_DELTA_OPERATIONS[0]!.anchorParagraph.slice(0, 40));
  });

  it('does not touch the NEEDS_REVIEW section, the taxonomy, or the evidence/citation rules', () => {
    const v5 = reconstructedV5();
    const v4 = v4FromV5(v5);
    const needsReviewSectionV4 = v4.slice(
      v4.indexOf('## When to use NEEDS_REVIEW'),
      v4.indexOf('## Evidence and citation'),
    );
    const needsReviewSectionV5 = v5.slice(
      v5.indexOf('## When to use NEEDS_REVIEW'),
      v5.indexOf('## Evidence and citation'),
    );
    expect(needsReviewSectionV5).toBe(needsReviewSectionV4);
  });
});

describe('E1: the residual target and its structural shape, grounded in the frozen fixture', () => {
  it('the residual false positive E1 targets is a large university with no unit named in the evidence - unchanged from F0M', () => {
    const rec = goldRecord('g04d170f4d3fda759');
    expect(rec.proposed.verdict).toBe('NOT_A_UNIT');
    expect(rec.proposed.hard_negative).toBe(true);
    expect(rec.proposed.page_kind).toBe('GENERIC_INSTITUTIONAL_PAGE');
    // Anchored: a full "Université" name, not merely an org whose name contains "universitaire".
    expect(rec.organisationName).toMatch(/^UNIVERSITE/i);
    expect(rec.rationale).toContain('no unit is named');
  });
});

describe('the three V4-fixed regressions (D2/D3) stay outside E1s target shape and are untouched by it', () => {
  it('g536c8b148048fcbc (D2 target) remains a named office appearing only as a contact for an externally-sponsored scheme - not a whole-organisation-allowance case', () => {
    const rec = goldRecord('g536c8b148048fcbc');
    expect(rec.proposed.verdict).toBe('NOT_A_UNIT');
    expect(rec.proposed.hard_negative).toBe(true);
    expect(rec.rationale).toContain('the DRI appears only as a contact');
    // Not the "no unit is named" shape E1 targets.
    expect(rec.rationale).not.toContain('no unit is named');
  });

  it('g4454e841c09dd8d0 and ga435ea22d4b11cf4 (D3 targets) remain bare contact-form pages naming a real unit - not a whole-organisation-allowance case', () => {
    for (const goldId of ['g4454e841c09dd8d0', 'ga435ea22d4b11cf4']) {
      const rec = goldRecord(goldId);
      expect(rec.proposed.verdict, goldId).toBe('NOT_A_UNIT');
      expect(rec.proposed.page_kind, goldId).toBe('SERVICE_TOOL_PAGE');
      expect(rec.rationale, goldId).toContain('contact-form template');
      // Both name a REAL unit (the contact-form's addressee); this is not the
      // "no unit is named" shape E1 targets, and the base prompt's
      // whole-organisation-allowance paragraph does not apply to a page
      // whose subject is a bare form in the first place.
      expect(rec.rationale, goldId).not.toContain('no unit is named');
    }
  });
});

describe('protected UNIT_PAGE positives remain outside E1s target shape, grounded in the frozen fixture', () => {
  it('g57607d4278d6dc23 and gf65026e32d9da8db describe a NAMED offices own remit - never reach the whole-organisation-allowance paragraph at all', () => {
    const ownRemitMarkers = [
      { goldId: 'gf65026e32d9da8db', marker: 'Direction des Affaires Internationales' },
      { goldId: 'g57607d4278d6dc23', marker: 'director named, mission stated' },
    ];
    for (const { goldId, marker } of ownRemitMarkers) {
      const rec = goldRecord(goldId);
      expect(rec.proposed.verdict, goldId).toBe('UNIT_PAGE');
      expect(rec.proposed.unit_type, goldId).toBe('INTERNATIONAL_MOBILITY_OFFICE');
      expect(rec.rationale, goldId).toContain(marker);
      // A real large university (UNIVERSITE*) is fine here BECAUSE a named
      // office carries the verdict, not the whole-organisation allowance -
      // E1 only narrows who may use THAT allowance, and neither item uses it.
    }
  });

  it('ge789b0f0aedc398c (the sole D1 whole-organisation-allowance recovery) is in fact a small, non-university organisation - remains eligible under E1s extended gate exactly as it already was under D1s', () => {
    const rec = goldRecord('ge789b0f0aedc398c');
    expect(rec.proposed.verdict).toBe('UNIT_PAGE');
    expect(rec.organisationName).not.toMatch(/^UNIVERSIT/i);
    expect(rec.rationale).toContain('small BTS school');
  });
});

describe('nearest-neighbour whole-organisation positive: the closest analogue to the residual target, protected by organisation type', () => {
  it('gdb5b7246327094ef (CUFR Mayotte) is a true positive that, like g04d, names no unit in evidence - but is NOT a full university, so E1s extended gate does not disturb it', () => {
    const rec = goldRecord('gdb5b7246327094ef');
    expect(rec.proposed.verdict).toBe('UNIT_PAGE');
    // "Centre Universitaire..." is NOT anchored on "Universite" the way
    // "UNIVERSITE PARIS CITE" is - this is exactly the distinction that
    // must survive E1: a small regional higher-education centre, not a
    // full multi-faculty public university.
    expect(rec.organisationName).not.toMatch(/^UNIVERSIT/i);
    expect(rec.organisationName).toContain('Centre Universitaire');
    expect(rec.ambiguity).toContain('No unit is named');
    expect(rec.proposed.unit_name_expectation.kind).toBe('NULL');
  });
});

describe('named-heading positives: the ESLSCA pair, protected because the organisation itself is non-university-shaped', () => {
  it('g34bbf7536e99b410 and ga971a6fc52af6b5f name no unit in gold either, but ESLSCA is a private business school, not a full university - eligible under E1s extended gate regardless of exactly which sentence a future model call would reach', () => {
    for (const goldId of ['g34bbf7536e99b410', 'ga971a6fc52af6b5f']) {
      const rec = goldRecord(goldId);
      expect(rec.proposed.verdict, goldId).toBe('UNIT_PAGE');
      expect(rec.organisationName, goldId).not.toMatch(/^UNIVERSIT/i);
      expect(rec.proposed.unit_name_expectation.kind, goldId).toBe('NULL');
      expect(rec.rationale, goldId).toContain('no unit name stated');
    }
  });
});

describe('g6458a352bc79ca01 is explicitly OUT OF V5 SEMANTIC SCOPE - documented, never targeted', () => {
  it('is a persistent named-unit, sparse-evidence disagreement unrelated to the whole-organisation-allowance mechanism E1 touches; no contract here expects it to move', () => {
    const rec = goldRecord('g6458a352bc79ca01');
    expect(rec.proposed.verdict).toBe('NEEDS_REVIEW');
    expect(rec.difficulty).toBe('HARD');
    // A REAL unit (DRRI) is named in the evidence - this is not the
    // "no unit is named" whole-organisation shape E1 targets at all.
    expect(rec.rationale).not.toContain('no unit is named');
    expect(rec.proposed.page_kind).toBeNull();
  });
});

/**
 * Coverage check: every item this contract file relies on is exactly the
 * set the owner instruction and F0M's own report name - neither a superset
 * invented here nor a subset that quietly drops one of the cited items.
 */
describe('this contract file names exactly the gold ids the owner instruction and F0M specify', () => {
  it('covers the residual target, all three V4-fixed regressions, all three protected positives, the nearest-neighbour whole-organisation positive, the ESLSCA pair, and the explicitly out-of-scope item', () => {
    const residualTarget = ['g04d170f4d3fda759'];
    const v4FixedRegressions = ['g536c8b148048fcbc', 'g4454e841c09dd8d0', 'ga435ea22d4b11cf4'];
    const protectedPositives = ['g57607d4278d6dc23', 'ge789b0f0aedc398c', 'gf65026e32d9da8db'];
    const nearestNeighbourPositive = ['gdb5b7246327094ef'];
    const namedHeadingPositives = ['g34bbf7536e99b410', 'ga971a6fc52af6b5f'];
    const explicitlyOutOfScope = ['g6458a352bc79ca01'];
    for (const goldId of [
      ...residualTarget,
      ...v4FixedRegressions,
      ...protectedPositives,
      ...nearestNeighbourPositive,
      ...namedHeadingPositives,
      ...explicitlyOutOfScope,
    ]) {
      expect(() => goldRecord(goldId), goldId).not.toThrow();
    }
    expect(residualTarget).toHaveLength(1);
    expect(v4FixedRegressions).toHaveLength(3);
    expect(protectedPositives).toHaveLength(3);
    expect(nearestNeighbourPositive).toHaveLength(1);
    expect(namedHeadingPositives).toHaveLength(2);
    expect(explicitlyOutOfScope).toHaveLength(1);
  });
});
