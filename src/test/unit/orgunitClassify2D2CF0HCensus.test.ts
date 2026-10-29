/**
 * PHASE 2B-2D2C-F0H — the deterministic attempt-2 failure census reconciles
 * EXACTLY to the six frozen gates the committed attempt-2 summary already
 * reports, and re-derivation is byte-stable.
 *
 * Requires PHASE2B_2D2C_ATTEMPT1_ROOT and PHASE2B_2D2C_ATTEMPT2_ROOT (the
 * preserved evidence roots, outside the repository); skips visibly when
 * either is unset, exactly as the other 2D2C scoring suites do.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildAttempt2FailureCensus,
  V1,
  V2,
  V3,
  type RepairPointer,
} from '../harness/phase2b2d2c/f0h/census.js';
import {
  buildCensusDocument,
  COMMITTED_CENSUS_PATH,
  F0H_REPO_ROOT,
  renderCensusDocument,
} from '../harness/phase2b2d2c/f0h/generate.js';
import { parseScoredItemsJsonl } from '../harness/phase2b2d2c/v3d1/census.js';

const ATTEMPT1_ROOT = process.env['PHASE2B_2D2C_ATTEMPT1_ROOT'];
const ATTEMPT2_ROOT = process.env['PHASE2B_2D2C_ATTEMPT2_ROOT'];

describe.skipIf(ATTEMPT2_ROOT === undefined)(
  '2D2C-F0H attempt-2 failure census: reconciles exactly to the committed six-gate arithmetic',
  () => {
    const repoRoot = resolve(__dirname, '..', '..', '..');
    const committedSummary = JSON.parse(
      readFileSync(
        join(
          repoRoot,
          'docs/evaluation/results/phase2b-2d2c-dev-attribution-attempt-2-gold-v1-adjudicated/summary.json',
        ),
        'utf8',
      ),
    ) as { gates: readonly { gate: string; denominator: number; observed: number }[] };

    const scoredItemsText = readFileSync(
      join(
        repoRoot,
        'docs/evaluation/results/phase2b-2d2c-dev-attribution-attempt-2-gold-v1-adjudicated/scored-items.jsonl',
      ),
      'utf8',
    );
    const rows = parseScoredItemsJsonl(scoredItemsText);
    const v1Rows = rows.filter((r) => r.variantName === V1);
    const v2Rows = rows.filter((r) => r.variantName === V2);
    const v3Rows = rows.filter((r) => r.variantName === V3);

    // A synthetic empty repair map reproduces every gate number the
    // committed summary reports EXCEPT it needs the real repair pointer for
    // the one repaired item's `repairedEvidenceItem` flag — that flag does
    // not affect any of the six gates, so an empty map is sufficient here.
    const census = buildAttempt2FailureCensus(
      v1Rows,
      v2Rows,
      v3Rows,
      new Map<string, RepairPointer>(),
    );

    it('covers exactly 49 DEVELOPMENT items', () => {
      expect(census.itemCount).toBe(49);
      expect(census.items).toHaveLength(49);
    });

    it('every gate observed value and denominator equals the committed attempt-2 summary exactly', () => {
      for (const gate of census.reconciliation) {
        const committed = committedSummary.gates.find((g) => g.gate === gate.gate);
        expect(committed, gate.gate).toBeDefined();
        expect(gate.denominator, gate.gate).toBe(committed!.denominator);
        expect(gate.observed, gate.gate).toBeCloseTo(committed!.observed, 9);
      }
    });

    it('the "two hard negatives" reporting gap is reconciled: the hard-negative-rejection gate fails on three items, one of which answered NEEDS_REVIEW rather than UNIT_PAGE', () => {
      const hardNeg = census.reconciliation.find((g) => g.gate === 'minHardNegativeRejection')!;
      expect(hardNeg.numeratorFailures).toBe(3);
      expect(hardNeg.failingGoldIds).toEqual([
        'g04d170f4d3fda759',
        'g52788fd323659c9c',
        'g536c8b148048fcbc',
      ]);
      const needsReviewFailure = census.items.find((i) => i.goldId === 'g52788fd323659c9c')!;
      expect(needsReviewFailure.v3.postRepairVerdict).toBe('NEEDS_REVIEW');
      expect(needsReviewFailure.gold.hardNegative).toBe('HARD_NEGATIVE');
      expect(needsReviewFailure.gateContribution.minUnitPagePrecision_falsePositive).toBe(false);
    });

    it('the precision gate fails on exactly five items: two hard negatives, two ordinary negatives, one gold-NEEDS_REVIEW item', () => {
      const precision = census.reconciliation.find((g) => g.gate === 'minUnitPagePrecision')!;
      expect(precision.numeratorFailures).toBe(5);
      const byClass = { hardNegative: 0, ordinaryNegative: 0, goldNeedsReview: 0 };
      for (const goldId of precision.failingGoldIds) {
        const item = census.items.find((i) => i.goldId === goldId)!;
        if (item.gold.hardNegative === 'HARD_NEGATIVE') byClass.hardNegative += 1;
        else if (item.gold.verdict === 'NEEDS_REVIEW') byClass.goldNeedsReview += 1;
        else byClass.ordinaryNegative += 1;
      }
      expect(byClass).toEqual({ hardNegative: 2, ordinaryNegative: 2, goldNeedsReview: 1 });
    });

    it('recall and unit-type accuracy are perfect: every gold UNIT_PAGE item was answered UNIT_PAGE with the correct unit_type', () => {
      expect(
        census.reconciliation.find((g) => g.gate === 'minUnitPageRecall')!.numeratorFailures,
      ).toBe(0);
      expect(
        census.reconciliation.find((g) => g.gate === 'minUnitTypeAccuracy')!.numeratorFailures,
      ).toBe(0);
      expect(census.summary.falseNegatives).toHaveLength(0);
    });

    it('every V2-to-V3 regression the committed comparator reports is exactly reproduced', () => {
      expect(census.summary.v2ToV3Regressions).toEqual([
        'g04d170f4d3fda759',
        'g4454e841c09dd8d0',
        'g52788fd323659c9c',
        'g536c8b148048fcbc',
        'ga435ea22d4b11cf4',
      ]);
    });

    it('every V2 false negative V3 corrected is exactly the union of the three verdict-level recoveries and the two evidence-compliance recoveries', () => {
      expect([...census.summary.correctedV2FalseNegatives].sort()).toEqual(
        [
          'g0ec0d43dad311a77',
          'g57607d4278d6dc23',
          'g877a05e6f5bba835',
          'ge789b0f0aedc398c',
          'gf65026e32d9da8db',
        ].sort(),
      );
    });
  },
);

describe.skipIf(ATTEMPT1_ROOT === undefined || ATTEMPT2_ROOT === undefined)(
  '2D2C-F0H census generator: byte-stable re-derivation, read-only',
  () => {
    it('derives byte-identical bytes on a second run into a scratch directory', async () => {
      const scratch = mkdtempSync(join(tmpdir(), 'nwf-pe-2d2c-f0h-census-'));
      try {
        const document = buildCensusDocument(F0H_REPO_ROOT, ATTEMPT2_ROOT!);
        const rendered = await renderCensusDocument(document);
        const documentAgain = buildCensusDocument(F0H_REPO_ROOT, ATTEMPT2_ROOT!);
        const renderedAgain = await renderCensusDocument(documentAgain);
        expect(renderedAgain).toBe(rendered);

        const committedPath = join(F0H_REPO_ROOT, COMMITTED_CENSUS_PATH);
        const committed = readFileSync(committedPath, 'utf8');
        expect(rendered).toBe(committed);
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    });

    it('touches nothing outside the repository and nothing inside the preserved attempt-1/attempt-2 roots (git status stays clean for both source trees)', () => {
      const attempt1Before = execFileSync('find', [ATTEMPT1_ROOT!, '-type', 'f'], {
        encoding: 'utf8',
      }).split('\n').length;
      const attempt2Before = execFileSync('find', [ATTEMPT2_ROOT!, '-type', 'f'], {
        encoding: 'utf8',
      }).split('\n').length;
      buildCensusDocument(F0H_REPO_ROOT, ATTEMPT2_ROOT!);
      const attempt1After = execFileSync('find', [ATTEMPT1_ROOT!, '-type', 'f'], {
        encoding: 'utf8',
      }).split('\n').length;
      const attempt2After = execFileSync('find', [ATTEMPT2_ROOT!, '-type', 'f'], {
        encoding: 'utf8',
      }).split('\n').length;
      expect(attempt1After).toBe(attempt1Before);
      expect(attempt2After).toBe(attempt2Before);
    });
  },
);
