/**
 * PHASE 2B-2D2C-F4 — SCORER UNIT TESTS.
 *
 * Two halves. The first is PURE and always runs: exact-count metrics, the
 * strict/conditional denominator separation, the identity join, the
 * fail-closed paths and byte-stable emission, all over synthetic rows. The
 * second runs only when `PHASE2B_2D2C_ATTEMPT1_ROOT` names the preserved
 * attempt, because that evidence lives outside every repository worktree and
 * is absent in CI — its absence must never turn a real check into a silent
 * pass, so the gate is explicit and the skip is visible.
 *
 * No test here performs inference, authenticates, opens a database or
 * launches a child process.
 */
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalStringify } from '../../orgunits/classify/canonical.js';
import {
  F4_EXPECTED_ARTIFACT_COUNT,
  F4_EXPECTED_VALIDATOR_TOTALS,
  F4_HOLDOUT_ITEM_COUNT,
  F4_OPEN_OWNER_GOLD_ID,
  F4_SLICES,
  F4_SLICE_NAMES,
} from '../harness/phase2b2d2c/scoring/constants.js';
import {
  emitOutputs,
  orderScoredItems,
  renderScoredItems,
} from '../harness/phase2b2d2c/scoring/emit.js';
import {
  GOLD_BACKED_FIELDS,
  GoldUnavailableError,
  requireAvailable,
  resolveGoldAvailability,
} from '../harness/phase2b2d2c/scoring/gold.js';
import {
  computeFieldMetrics,
  computeMcNemar,
  computeTernaryMetrics,
  rate,
} from '../harness/phase2b2d2c/scoring/metrics.js';
import {
  countConcordance,
  countCorrectnessTransitions,
  countValidityTransitions,
  pairByIdentity,
  PairingError,
} from '../harness/phase2b2d2c/scoring/paired.js';
import type { ScoredItem } from '../harness/phase2b2d2c/scoring/score.js';
import { runScoring } from '../harness/phase2b2d2c/scoring/run.js';
import { loadScoringSources, ScoringSourceError } from '../harness/phase2b2d2c/scoring/sources.js';
import { SCORER_REPO_ROOT } from '../harness/phase2b2d2c/scoring/generate.js';

// ---------------------------------------------------------------------------
// Synthetic rows — enough shape to exercise the joins and the denominators.
// ---------------------------------------------------------------------------

function row(
  overrides: Partial<ScoredItem> & Pick<ScoredItem, 'goldId' | 'variantName'>,
): ScoredItem {
  const accepted = overrides.validatorState !== 'REJECTED';
  return {
    corpusLineNumber: 1,
    docIndex: 0,
    echeRowKey: 'F TEST01|1',
    organisationId: 'org-1',
    logicalBatchOrdinal: 1,
    positionWithinBatch: 0,
    sequence: 1,
    promptVersion: 'p',
    promptSha256: 'a'.repeat(64),
    variantGitCommit: 'b'.repeat(40),
    finalInputSha256:
      overrides.variantName === 'PROMPT_V1_CANONICAL' ? 'c'.repeat(64) : 'd'.repeat(64),
    rawOutputSha256: 'e'.repeat(64),
    validationResultSha256: 'f'.repeat(64),
    finalRecordSha256: '0'.repeat(64),
    validatorState: accepted ? 'ACCEPTED' : 'REJECTED',
    rejectionCategory: accepted ? null : 'EVIDENCE',
    rejectionReason: accepted ? null : 'reason',
    prediction: accepted
      ? {
          verdict: 'UNIT_PAGE',
          unit_type: 'LANGUAGE_CENTRE',
          page_kind: null,
          serves_incoming_international_students: 'YES',
          serves_outgoing_mobility_students: 'UNKNOWN',
          provides_language_learning_or_support: 'YES',
          confidence: 'HIGH',
          unit_name_present: true,
          unit_name_sha256: '1'.repeat(64),
          evidence_span_sources: ['TITLE'],
          evidence_span_count: 1,
        }
      : null,
    gold: {},
    goldSource: {},
    fieldCorrectness: {},
    strictScorableFields: [],
    conditionalScorableFields: [],
    ...overrides,
  };
}

describe('F4 metrics keep strict and conditional denominators apart', () => {
  it('counts a rejected answer INCORRECT in the strict view', () => {
    const metrics = computeFieldMetrics(
      'verdict',
      ['UNIT_PAGE', 'NOT_A_UNIT'],
      [
        { gold: 'UNIT_PAGE', predicted: 'UNIT_PAGE' },
        { gold: 'UNIT_PAGE', predicted: 'NOT_A_UNIT' },
        { gold: 'NOT_A_UNIT', predicted: null },
      ],
    );
    expect(metrics.support).toBe(3);
    expect(metrics.correct).toBe(1);
    expect(metrics.incorrect).toBe(2);
    expect(metrics.strictDenominator).toBe(3);
    expect(metrics.strictAccuracy).toBeCloseTo(1 / 3, 12);
  });

  it('excludes a rejected answer from the CONDITIONAL denominator entirely', () => {
    const metrics = computeFieldMetrics(
      'verdict',
      ['UNIT_PAGE', 'NOT_A_UNIT'],
      [
        { gold: 'UNIT_PAGE', predicted: 'UNIT_PAGE' },
        { gold: 'NOT_A_UNIT', predicted: null },
      ],
    );
    expect(metrics.conditionalDenominator).toBe(1);
    expect(metrics.conditionalCorrect).toBe(1);
    expect(metrics.conditionalAccuracy).toBe(1);
    // The mutation this pins: counting the rejected item as conditionally
    // correct would give 2/2 here.
    expect(metrics.conditionalDenominator).not.toBe(metrics.strictDenominator);
  });

  it('reconciles every confusion-matrix total with the support', () => {
    const metrics = computeFieldMetrics(
      'verdict',
      ['UNIT_PAGE', 'NOT_A_UNIT', 'NEEDS_REVIEW'],
      [
        { gold: 'UNIT_PAGE', predicted: 'UNIT_PAGE' },
        { gold: 'UNIT_PAGE', predicted: 'NEEDS_REVIEW' },
        { gold: 'NOT_A_UNIT', predicted: null },
        { gold: 'NEEDS_REVIEW', predicted: 'NEEDS_REVIEW' },
      ],
    );
    const total = Object.values(metrics.confusion)
      .flatMap((row) => Object.values(row))
      .reduce((a, b) => a + b, 0);
    expect(total).toBe(metrics.support);
    expect(metrics.correct + metrics.incorrect).toBe(metrics.support);
  });

  it('never fabricates a rate from a zero denominator', () => {
    expect(rate(0, 0)).toBeNull();
    expect(rate(0, 1)).toBe(0);
    const metrics = computeFieldMetrics('verdict', ['UNIT_PAGE'], []);
    expect(metrics.strictAccuracy).toBeNull();
    expect(metrics.conditionalAccuracy).toBeNull();
  });

  it('computes ternary per-class precision, recall, F1 and macro-F1 with null zero denominators', () => {
    const ternary = computeTernaryMetrics(
      ['YES', 'NO', 'UNKNOWN'],
      [
        { gold: 'YES', predicted: 'YES' },
        { gold: 'NO', predicted: 'UNKNOWN' },
        { gold: 'UNKNOWN', predicted: 'UNKNOWN' },
        { gold: 'YES', predicted: null },
      ],
    );
    const yes = ternary.classes.find((c) => c.className === 'YES');
    const no = ternary.classes.find((c) => c.className === 'NO');
    expect(yes?.truePositives).toBe(1);
    expect(yes?.falseNegatives).toBe(1);
    expect(yes?.precision).toBe(1);
    expect(yes?.recall).toBeCloseTo(0.5, 12);
    // NO was never predicted, so its precision denominator is 0 -> null.
    expect(no?.precision).toBeNull();
    expect(no?.recall).toBe(0);
    expect(ternary.macroF1).not.toBeNull();
  });

  it('reports McNemar as exploratory and null when there are no discordant pairs', () => {
    expect(computeMcNemar(0, 0).chiSquare).toBeNull();
    const result = computeMcNemar(3, 1);
    expect(result.discordant).toBe(4);
    expect(result.chiSquare).toBe(1);
    expect(result.exploratoryOnly).toBe(true);
  });
});

describe('F4 pairing joins by identity, never by position', () => {
  it('pairs shuffled rows correctly by gold id', () => {
    const v1 = [
      row({ goldId: 'ga', variantName: 'PROMPT_V1_CANONICAL' }),
      row({ goldId: 'gb', variantName: 'PROMPT_V1_CANONICAL' }),
    ];
    const v2 = [
      row({ goldId: 'gb', variantName: 'PROMPT_V2_CANONICAL' }),
      row({ goldId: 'ga', variantName: 'PROMPT_V2_CANONICAL' }),
    ];
    const paired = pairByIdentity(v1, v2);
    expect(paired.map((p) => p.goldId)).toEqual(['ga', 'gb']);
    for (const pair of paired) expect(pair.v1.goldId).toBe(pair.v2.goldId);
    // A position join over these arrays would have paired ga with gb.
    expect(v1[0]?.goldId).not.toBe(v2[0]?.goldId);
  });

  it('fails closed on a missing, extra, duplicated or mismatched item', () => {
    const a = row({ goldId: 'ga', variantName: 'PROMPT_V1_CANONICAL' });
    const b2 = row({ goldId: 'gb', variantName: 'PROMPT_V2_CANONICAL' });
    expect(() => pairByIdentity([a], [b2])).toThrow(PairingError);
    expect(() =>
      pairByIdentity([a, a], [row({ goldId: 'ga', variantName: 'PROMPT_V2_CANONICAL' })]),
    ).toThrow(PairingError);
    expect(() =>
      pairByIdentity([a], [row({ goldId: 'ga', variantName: 'PROMPT_V2_CANONICAL' }), b2]),
    ).toThrow(PairingError);
    expect(() =>
      pairByIdentity([a], [row({ goldId: 'ga', variantName: 'PROMPT_V2_CANONICAL', docIndex: 9 })]),
    ).toThrow(PairingError);
  });

  it('refuses two variants that report the same final input identity', () => {
    const v1 = row({
      goldId: 'ga',
      variantName: 'PROMPT_V1_CANONICAL',
      finalInputSha256: 'c'.repeat(64),
    });
    const v2 = row({
      goldId: 'ga',
      variantName: 'PROMPT_V2_CANONICAL',
      finalInputSha256: 'c'.repeat(64),
    });
    expect(() => pairByIdentity([v1], [v2])).toThrow(PairingError);
  });

  it('keeps validity transitions separate from correctness transitions', () => {
    const v1 = [
      row({
        goldId: 'ga',
        variantName: 'PROMPT_V1_CANONICAL',
        validatorState: 'REJECTED',
        fieldCorrectness: { verdict: 'INCORRECT' },
      }),
      row({
        goldId: 'gb',
        variantName: 'PROMPT_V1_CANONICAL',
        fieldCorrectness: { verdict: 'CORRECT' },
      }),
    ];
    const v2 = [
      row({
        goldId: 'ga',
        variantName: 'PROMPT_V2_CANONICAL',
        fieldCorrectness: { verdict: 'CORRECT' },
      }),
      row({
        goldId: 'gb',
        variantName: 'PROMPT_V2_CANONICAL',
        fieldCorrectness: { verdict: 'INCORRECT' },
      }),
    ];
    const paired = pairByIdentity(v1, v2);
    const validity = countValidityTransitions(paired);
    expect(validity.REJECTED_TO_ACCEPTED).toBe(1);
    expect(validity.ACCEPTED_TO_REJECTED).toBe(0);
    expect(validity.netValidityChange).toBe(1);
    const correctness = countCorrectnessTransitions(paired, 'verdict');
    expect(correctness.recoveries).toBe(1);
    expect(correctness.regressions).toBe(1);
    expect(correctness.netStrictCorrectnessChange).toBe(0);
  });

  it('reports concordance as agreement, never as correctness', () => {
    const v1 = [row({ goldId: 'ga', variantName: 'PROMPT_V1_CANONICAL' })];
    const v2 = [row({ goldId: 'ga', variantName: 'PROMPT_V2_CANONICAL' })];
    const concordance = countConcordance(pairByIdentity(v1, v2), 'verdict');
    expect(concordance.agree).toBe(1);
    expect(concordance.comparablePairs).toBe(1);
  });
});

describe('F4 gold availability is derived and fails closed', () => {
  const availability = resolveGoldAvailability({
    freezePreservedVerdictGoldIds: [F4_OPEN_OWNER_GOLD_ID],
    labelFileRecordCount: 72,
    devItemCount: 49,
  });

  it('finds no gold-backed field in the DEVELOPMENT-only canonical corpus', () => {
    expect(availability.anyCorpusWideFieldAvailable).toBe(false);
    expect(availability.holdoutItemCount).toBe(F4_HOLDOUT_ITEM_COUNT);
    for (const field of GOLD_BACKED_FIELDS) {
      const entry = availability.fields.find((f) => f.field === field);
      expect(entry?.source).not.toBe('DEV_CANONICAL_CORPUS');
    }
  });

  it('makes verdict available for the freeze-preserved item ALONE', () => {
    expect(() => requireAvailable(availability, 'verdict', F4_OPEN_OWNER_GOLD_ID)).not.toThrow();
    expect(() => requireAvailable(availability, 'verdict', 'g0000000000000000')).toThrow(
      GoldUnavailableError,
    );
  });

  it('throws rather than score an unavailable field', () => {
    for (const field of GOLD_BACKED_FIELDS.filter((f) => f !== 'verdict')) {
      expect(() => requireAvailable(availability, field, F4_OPEN_OWNER_GOLD_ID)).toThrow(
        GoldUnavailableError,
      );
    }
    expect(() => requireAvailable(availability, 'not_a_gold_field', F4_OPEN_OWNER_GOLD_ID)).toThrow(
      GoldUnavailableError,
    );
  });
});

describe('F4 emission is deterministic', () => {
  it('orders rows by (goldId, variantName) regardless of input order', () => {
    const rows = [
      row({ goldId: 'gb', variantName: 'PROMPT_V2_CANONICAL' }),
      row({ goldId: 'ga', variantName: 'PROMPT_V2_CANONICAL' }),
      row({ goldId: 'gb', variantName: 'PROMPT_V1_CANONICAL' }),
      row({ goldId: 'ga', variantName: 'PROMPT_V1_CANONICAL' }),
    ];
    expect(orderScoredItems(rows).map((r) => `${r.goldId}/${r.variantName}`)).toEqual([
      'ga/PROMPT_V1_CANONICAL',
      'ga/PROMPT_V2_CANONICAL',
      'gb/PROMPT_V1_CANONICAL',
      'gb/PROMPT_V2_CANONICAL',
    ]);
    expect(renderScoredItems(rows)).toBe(renderScoredItems([...rows].reverse()));
  });

  it('writes byte-identical files into two separate directories', async () => {
    const rows = [row({ goldId: 'ga', variantName: 'PROMPT_V1_CANONICAL' })];
    // The manifest now records the summary's OWN versions, so a stub summary
    // must carry them: a gold-backed derivation and a no-gold one are not the
    // same scorer and must not claim the same version.
    const summary = {
      scorerVersion: 'x',
      outputSchemaVersion: 'x-schema',
      sources: {},
    } as never;
    const a = mkdtempSync(join(tmpdir(), 'f4a-'));
    const b = mkdtempSync(join(tmpdir(), 'f4b-'));
    try {
      const first = await emitOutputs(a, rows, summary, 'cmd');
      const second = await emitOutputs(b, rows, summary, 'cmd');
      expect(first.files.map((f) => f.sha256)).toEqual(second.files.map((f) => f.sha256));
      for (const file of first.files) {
        expect(readFileSync(join(a, file.name))).toEqual(readFileSync(join(b, file.name)));
      }
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });

  it('never emits raw provider prose', () => {
    const rendered = renderScoredItems([row({ goldId: 'ga', variantName: 'PROMPT_V1_CANONICAL' })]);
    for (const forbidden of ['rationale', 'quote', 'excerpt', 'transcript', 'unit_name"']) {
      expect(rendered).not.toContain(forbidden);
    }
  });
});

describe('F4 frozen slices name real DEVELOPMENT items', () => {
  it('lists every slice without a duplicate id', () => {
    const all = F4_SLICE_NAMES.flatMap((name) => [...F4_SLICES[name]]);
    expect(new Set(all).size).toBe(all.length);
    expect(F4_SLICES.PREVIOUSLY_REJECTED).toHaveLength(6);
    expect(F4_SLICES.PAGE_VERSUS_UNIT).toHaveLength(5);
    expect(F4_SLICES.UNKNOWN_NO_CALIBRATION).toHaveLength(4);
    expect(F4_SLICES.OPEN_OWNER_QUESTION).toEqual([F4_OPEN_OWNER_GOLD_ID]);
  });
});

// ---------------------------------------------------------------------------
// The preserved attempt. Absent in CI; the gate is explicit, never silent.
// ---------------------------------------------------------------------------

const ATTEMPT_ROOT = process.env['PHASE2B_2D2C_ATTEMPT1_ROOT'] ?? '';
const ATTEMPT_PRESENT = ATTEMPT_ROOT !== '' && existsSync(ATTEMPT_ROOT);

describe.skipIf(!ATTEMPT_PRESENT)('F4 scores the preserved attempt 1', () => {
  it('covers exactly 49 items twice and matches F3 validator totals', () => {
    const run = runScoring(SCORER_REPO_ROOT, ATTEMPT_ROOT);
    expect(run.sources.artifactsVerified).toBe(F4_EXPECTED_ARTIFACT_COUNT);
    expect(run.sources.corpusRows).toHaveLength(49);
    expect(run.allRows).toHaveLength(98);
    expect(run.paired).toHaveLength(49);
    for (const variant of run.summary.variants) {
      const expected = F4_EXPECTED_VALIDATOR_TOTALS[variant.variantName];
      expect(variant.items).toBe(49);
      expect(variant.accepted).toBe(expected.accepted);
      expect(variant.rejected).toBe(expected.rejected);
      expect(variant.matchesF3Totals).toBe(true);
    }
  });

  it('runs V1 sequences 1-12 before V2 sequences 13-24', () => {
    const run = runScoring(SCORER_REPO_ROOT, ATTEMPT_ROOT);
    const sequences = run.sources.evaluations.map((e) => ({ s: e.sequence, v: e.variantName }));
    expect(sequences.map((x) => x.s)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
    expect(sequences.slice(0, 12).every((x) => x.v === 'PROMPT_V1_CANONICAL')).toBe(true);
    expect(sequences.slice(12).every((x) => x.v === 'PROMPT_V2_CANONICAL')).toBe(true);
  });

  it('emits no HOLDOUT value and no HOLDOUT string', () => {
    const run = runScoring(SCORER_REPO_ROOT, ATTEMPT_ROOT);
    expect(run.sources.corpusRows.every((r) => r.split === 'DEVELOPMENT')).toBe(true);
    const serialized = `${renderScoredItems(run.allRows)}${canonicalStringify(run.summary)}`;
    expect(serialized).not.toContain('HOLDOUT_');
    expect(run.summary.sources.corpusSplit).toBe('DEVELOPMENT');
  });

  it('writes nothing into the preserved attempt', () => {
    const before = statSync(ATTEMPT_ROOT).mtimeMs;
    runScoring(SCORER_REPO_ROOT, ATTEMPT_ROOT);
    expect(statSync(ATTEMPT_ROOT).mtimeMs).toBe(before);
  });

  it('keeps the gold-question leave-one-out separate from the primary view', () => {
    const sensitivity = runScoring(SCORER_REPO_ROOT, ATTEMPT_ROOT).summary.goldQuestionSensitivity;
    expect(sensitivity.goldId).toBe(F4_OPEN_OWNER_GOLD_ID);
    expect(sensitivity.presentInCorpus).toBe(true);
    expect(sensitivity.labelChangedByThisTask).toBe(false);
    expect(sensitivity.primary.items).toBe(49);
    expect(sensitivity.leaveOneOut.items).toBe(48);
    expect(sensitivity.leaveOneOut.verdictCorrectness.scorablePairs).toBe(
      sensitivity.primary.verdictCorrectness.scorablePairs - 1,
    );
  });

  it('refuses a corrupted artifact hash, on a COPY — the preserved attempt is never touched', () => {
    const copy = mkdtempSync(join(tmpdir(), 'f4-corrupt-'));
    try {
      cpSync(ATTEMPT_ROOT, copy, { recursive: true });
      // The copy alone is scorable before the corruption.
      expect(() => loadScoringSources(SCORER_REPO_ROOT, copy)).not.toThrow();
      const target = join(
        copy,
        'evaluations/PROMPT_V1_CANONICAL/batch-01/attempt-1/final-record.json',
      );
      const envelope: { record: { logicalBatchOrdinal: number } } = JSON.parse(
        readFileSync(target, 'utf8'),
      ) as { record: { logicalBatchOrdinal: number } };
      envelope.record.logicalBatchOrdinal = 99; // recordSha256 now disagrees.
      writeFileSync(target, `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
      expect(() => loadScoringSources(SCORER_REPO_ROOT, copy)).toThrow(ScoringSourceError);
      expect(() => loadScoringSources(SCORER_REPO_ROOT, copy)).toThrow(/HASH_MISMATCH/);
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });

  it('refuses an extra or missing artifact, on a COPY', () => {
    const copy = mkdtempSync(join(tmpdir(), 'f4-extra-'));
    try {
      cpSync(ATTEMPT_ROOT, copy, { recursive: true });
      writeFileSync(
        join(copy, 'evaluations/PROMPT_V1_CANONICAL/batch-01/attempt-1/stray.json'),
        '{}\n',
        'utf8',
      );
      expect(() => loadScoringSources(SCORER_REPO_ROOT, copy)).toThrow(ScoringSourceError);
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });

  it('refuses a second attempt directory, on a COPY', () => {
    const copy = mkdtempSync(join(tmpdir(), 'f4-attempt2-'));
    try {
      cpSync(ATTEMPT_ROOT, copy, { recursive: true });
      cpSync(
        join(copy, 'evaluations/PROMPT_V1_CANONICAL/batch-01/attempt-1'),
        join(copy, 'evaluations/PROMPT_V1_CANONICAL/batch-01/attempt-2'),
        { recursive: true },
      );
      expect(() => loadScoringSources(SCORER_REPO_ROOT, copy)).toThrow(/write-once/);
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });

  it('produces byte-identical derived outputs on two separate derivations', async () => {
    const run = runScoring(SCORER_REPO_ROOT, ATTEMPT_ROOT);
    const a = mkdtempSync(join(tmpdir(), 'f4-real-a-'));
    const b = mkdtempSync(join(tmpdir(), 'f4-real-b-'));
    try {
      const first = await emitOutputs(a, run.allRows, run.summary, 'cmd');
      const second = await emitOutputs(b, run.allRows, run.summary, 'cmd');
      expect(first.files.map((f) => f.sha256)).toEqual(second.files.map((f) => f.sha256));
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });
});
