/**
 * Phase 2B-2D1B Sonnet acceptance corpus selection
 * (`evaluation/acceptanceSelection.ts`): the reviewed-id list is exactly 36
 * and duplicate-free, and `selectRoutineItems` is a deterministic, quota- and
 * cap-respecting, org-diversity-aware pure function.
 */
import { describe, expect, it } from 'vitest';
import {
  REVIEWED_GOLD_IDS,
  routineCategoryOf,
  selectRoutineItems,
  type RoutineCandidate,
} from '../../orgunits/classify/evaluation/acceptanceSelection.js';
import type { ProposedLabel } from '../../orgunits/classify/evaluation/goldSchema.js';

describe('REVIEWED_GOLD_IDS', () => {
  it('is exactly the 36 owner-adjudicated items (27 Stage-A + 9 Stage-B), duplicate-free', () => {
    expect(REVIEWED_GOLD_IDS.length).toBe(36);
    expect(new Set(REVIEWED_GOLD_IDS).size).toBe(36);
    for (const id of REVIEWED_GOLD_IDS) expect(id).toMatch(/^g[0-9a-f]{16}$/);
  });
});

describe('routineCategoryOf', () => {
  const base = {
    unit_type: null,
    page_kind: null,
    serves_incoming_international_students: null,
    serves_outgoing_mobility_students: null,
    provides_language_learning_or_support: null,
    unit_name_expectation: { kind: 'NULL', name: null },
    hard_negative: false,
  } as const;

  it('reads UNIT:<unit_type> for a UNIT_PAGE proposal', () => {
    const label: ProposedLabel = {
      ...base,
      verdict: 'UNIT_PAGE',
      unit_type: 'LANGUAGE_CENTRE',
      serves_incoming_international_students: 'UNKNOWN',
      serves_outgoing_mobility_students: 'UNKNOWN',
      provides_language_learning_or_support: 'YES',
    };
    expect(routineCategoryOf(label)).toBe('UNIT:LANGUAGE_CENTRE');
  });

  it('reads NEG:<page_kind> for a NOT_A_UNIT proposal', () => {
    const label: ProposedLabel = { ...base, verdict: 'NOT_A_UNIT', page_kind: 'RESEARCH_PAGE' };
    expect(routineCategoryOf(label)).toBe('NEG:RESEARCH_PAGE');
  });

  it('reads REVIEW for a NEEDS_REVIEW proposal', () => {
    const label: ProposedLabel = {
      ...base,
      verdict: 'NEEDS_REVIEW',
      unit_name_expectation: { kind: 'ANY', name: null },
    };
    expect(routineCategoryOf(label)).toBe('REVIEW');
  });
});

function candidate(goldId: string, organisationName: string, category: string): RoutineCandidate {
  return { goldId, organisationName, category };
}

describe('selectRoutineItems', () => {
  it('is deterministic: same inputs produce the same output every time', () => {
    const pool = [
      candidate('g1', 'Org A', 'NEG:NEWS_OR_EVENT_PAGE'),
      candidate('g3', 'Org A', 'NEG:NEWS_OR_EVENT_PAGE'),
      candidate('g2', 'Org B', 'NEG:NEWS_OR_EVENT_PAGE'),
    ];
    const quotas = { 'NEG:NEWS_OR_EVENT_PAGE': 2 };
    const first = selectRoutineItems(pool, quotas, 4, 'nobody');
    const second = selectRoutineItems(pool, quotas, 4, 'nobody');
    expect(first).toEqual(second);
  });

  it('orders within a category by goldId ascending, not input order', () => {
    const pool = [
      candidate('gz', 'Org A', 'CAT'),
      candidate('ga', 'Org B', 'CAT'),
      candidate('gm', 'Org C', 'CAT'),
    ];
    const selected = selectRoutineItems(pool, { CAT: 2 }, 4, 'nobody');
    expect(selected).toEqual(['ga', 'gm']);
  });

  it('prioritises the designated organisation first within each category', () => {
    const pool = [candidate('gb', 'Other Org', 'CAT'), candidate('gc', 'Priority Org', 'CAT')];
    const selected = selectRoutineItems(pool, { CAT: 1 }, 4, 'Priority Org');
    expect(selected).toEqual(['gc']);
  });

  it('enforces the per-organisation cap across the whole selection, not per category', () => {
    const pool = [
      candidate('g1', 'Org A', 'CAT1'),
      candidate('g2', 'Org A', 'CAT1'),
      candidate('g3', 'Org A', 'CAT2'),
      candidate('g4', 'Org B', 'CAT2'),
    ];
    const selected = selectRoutineItems(pool, { CAT1: 2, CAT2: 1 }, 2, 'nobody');
    // Org A already hit the cap of 2 from CAT1, so CAT2's single slot must
    // fall through to Org B rather than Org A's remaining CAT2 candidate.
    expect(selected).toEqual(['g1', 'g2', 'g4']);
  });

  it('throws when a category quota cannot be filled', () => {
    const pool = [candidate('g1', 'Org A', 'CAT')];
    expect(() => selectRoutineItems(pool, { CAT: 2 }, 4, 'nobody')).toThrow(/quota/);
  });

  it('never selects the same goldId twice even if it could satisfy two categories', () => {
    const pool = [candidate('g1', 'Org A', 'CAT1')];
    // g1 only belongs to CAT1's pool, so CAT2 has nothing to draw from - and
    // must throw rather than silently reuse g1.
    expect(() => selectRoutineItems(pool, { CAT1: 1, CAT2: 1 }, 4, 'nobody')).toThrow(/quota/);
  });
});
