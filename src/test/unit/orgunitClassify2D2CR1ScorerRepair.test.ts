/**
 * PHASE 2B-2D2C-R1 — the scorer's repair-round support (ADR 0011), proved on
 * a temporary COPY of the preserved attempt 1 into which SYNTHETIC repair
 * artifacts are written with the real write-once writer. The preserved
 * attempt is never touched; the synthetic repair answers are test fixtures,
 * not model output, and are labelled as such in every record they touch.
 *
 * What is proved:
 *   - the primary artifact inventory (the F3 aggregate every supplement and
 *     adjudication record pins) is UNCHANGED by repair artifacts, which are
 *     inventoried separately;
 *   - first-pass validator totals still match F3 (variants[].accepted), while
 *     gates are applied to post-repair validity;
 *   - a repaired row carries `firstPass` and `repair`, every other row is
 *     byte-identical to the committed derivation;
 *   - an ACCEPTED repair whose raw output does not re-validate fails closed.
 *
 * Skips visibly when the preserved attempt root is not available.
 */
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalStringify } from '../../orgunits/classify/canonical.js';
import type { ClassificationResult } from '../../orgunits/classify/outputSchema.js';
import {
  ensureRepairDirectory,
  readArtifact,
  repairDocumentDirectoryOf,
  repairRoundDirectoryOf,
  writeArtifactOnce,
} from '../harness/phase2b2d2c/artifacts.js';
import { sha256Hex } from '../harness/phase2b2d2c/freeze.js';
import { renderScoredItems } from '../harness/phase2b2d2c/scoring/emit.js';
import { runScoring } from '../harness/phase2b2d2c/scoring/run.js';
import { ScoringSourceError, loadScoringSources } from '../harness/phase2b2d2c/scoring/sources.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ATTEMPT_ROOT = process.env['PHASE2B_2D2C_ATTEMPT1_ROOT'] ?? '';
const ATTEMPT_PRESENT = ATTEMPT_ROOT !== '' && existsSync(ATTEMPT_ROOT);

const SUPPLEMENT = 'docs/evaluation/PHASE_2B_2D2C_DEV_SCORING_SUPPLEMENT_V1.json';
const ADJUDICATION = 'docs/evaluation/PHASE_2B_2D2C_DEV_OWNER_ADJUDICATION_G1_V1.json';
const COMMITTED_SCORED_ITEMS =
  'docs/evaluation/results/phase2b-2d2c-dev-attribution-attempt-1-gold-v1-adjudicated/scored-items.jsonl';
/** The F3 aggregate, pinned by the committed supplement and adjudication records. */
const F3_INVENTORY = 'ee17e1f2ee8021e59c06377342042e56f84269165f8ec39521011cb1d3538137';

/** The two persistent V2 rejections (V3D1 §5), both in PROMPT_V2_CANONICAL batch 7. */
const V2_BATCH_7 = 'evaluations/PROMPT_V2_CANONICAL/batch-07/attempt-1';
const EXPANDED_NAME_DOC = 1; // g0ec0d43dad311a77
const MIS_SOURCED_DOC = 2; // g877a05e6f5bba835

const copies: string[] = [];
afterEach(() => {
  for (const dir of copies.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function copyAttempt(): string {
  const copy = mkdtempSync(join(tmpdir(), 'r1-scorer-repair-'));
  copies.push(copy);
  cpSync(ATTEMPT_ROOT, copy, { recursive: true });
  return copy;
}

function rawResultsOf(attemptDir: string): ClassificationResult[] {
  const read = readArtifact<{ rawOutputCanonicalSerialization: string }>(
    attemptDir,
    'RAW_OUTPUT_CHECKPOINT',
  );
  if (!read.ok) throw new Error(read.detail);
  return (
    JSON.parse(read.envelope.record.rawOutputCanonicalSerialization) as {
      results: ClassificationResult[];
    }
  ).results;
}

interface SyntheticRepair {
  readonly docIndex: number;
  readonly reasonCodes: readonly string[];
  readonly rejectionReason: string;
  readonly repaired: ClassificationResult;
  /** What the validator would say about `repaired` against the document; the scorer re-derives it. */
  readonly accepted: boolean;
}

/**
 * Writes one synthetic repair round into a COPY's attempt directory using the
 * real write-once writer: the round summary, and per document a decision, a
 * request, a raw checkpoint, a validation result, a provider outcome and an
 * outcome. Every record says `synthetic: true`.
 */
function writeSyntheticRound(attemptDir: string, repairs: readonly SyntheticRepair[]): void {
  const roundDir = repairRoundDirectoryOf(attemptDir);
  ensureRepairDirectory(roundDir);
  const documents: {
    docIndex: number;
    disposition: string;
    providerOutcome: string;
    errorKind: string | null;
    repairOutcomeSha256: string | null;
  }[] = [];
  for (const repair of repairs) {
    const docDir = repairDocumentDirectoryOf(attemptDir, repair.docIndex);
    ensureRepairDirectory(docDir);
    writeArtifactOnce(docDir, 'REPAIR_DECISION', {
      synthetic: true,
      round: 1,
      docIndex: repair.docIndex,
      category: 'EVIDENCE',
      rejectionReason: repair.rejectionReason,
      reasonCodes: repair.reasonCodes,
      invalidFields: [],
      elapsedSinceOriginalMs: 25_000,
      totalBudgetMs: 600_000,
      hardKillGraceMs: 10_000,
      policy: { enabled: true, maxRoundsPerLogicalEvaluation: 1, minimumRemainingBudgetMs: 60_000 },
      decision: {
        kind: 'PROCEED',
        remainingMs: 575_000,
        windowMs: 565_000,
        firstAttemptDeadlineMs: 300_000,
      },
    });
    writeArtifactOnce(docDir, 'REPAIR_REQUEST', {
      synthetic: true,
      round: 1,
      docIndex: repair.docIndex,
      repairRequestVersion: 'orgunit-classifier-repair-request-v1',
      documentCount: 1,
      windowMs: 565_000,
    });
    const raw = { results: [repair.repaired] };
    const serialization = canonicalStringify(raw);
    writeArtifactOnce(docDir, 'REPAIR_RAW_OUTPUT_CHECKPOINT', {
      rawOutputCanonicalSerialization: serialization,
      rawOutputSha256: sha256Hex(serialization),
      rawOutputUtf8Bytes: Buffer.byteLength(serialization, 'utf8'),
    });
    writeArtifactOnce(docDir, 'REPAIR_VALIDATION_RESULT', {
      kind: 'VALIDATED',
      detail: null,
      accepted: repair.accepted ? [{ docIndex: repair.docIndex, result: repair.repaired }] : [],
      rejected: repair.accepted
        ? []
        : [
            {
              docIndex: repair.docIndex,
              category: 'EVIDENCE',
              reason: 'synthetic: still unsupported',
            },
          ],
    });
    writeArtifactOnce(docDir, 'REPAIR_PROVIDER_OUTCOME', {
      synthetic: true,
      outcome: 'OK',
      providerReportedModelId: 'synthetic',
      inputTokens: 4_000,
      outputTokens: 150,
      outcomeDetail: null,
      internalAdapterAttemptCountWhereObservable: 1,
      authStatusInvocationsObserved: 1,
      startedAtUtc: '2026-09-14T00:00:00.000Z',
      endedAtUtc: '2026-09-14T00:00:20.000Z',
      monotonicWallTimeMs: 20_000,
      windowMs: 565_000,
    });
    const disposition = repair.accepted ? 'ACCEPTED' : 'REJECTED';
    const errorKind = repair.accepted ? null : 'EVIDENCE_SPAN_UNVERIFIED';
    writeArtifactOnce(docDir, 'REPAIR_OUTCOME', {
      synthetic: true,
      round: 1,
      docIndex: repair.docIndex,
      disposition,
      providerOutcome: 'OK',
      errorKind,
      detail: null,
      verdict: repair.accepted ? repair.repaired.verdict : null,
      providerRequestSent: true,
    });
    const outcomeRead = readArtifact(docDir, 'REPAIR_OUTCOME');
    documents.push({
      docIndex: repair.docIndex,
      disposition,
      providerOutcome: 'OK',
      errorKind,
      repairOutcomeSha256: outcomeRead.ok ? outcomeRead.fileSha256 : null,
    });
  }
  const accepted = documents.filter((d) => d.disposition === 'ACCEPTED').length;
  writeArtifactOnce(roundDir, 'REPAIR_ROUND', {
    synthetic: true,
    round: 1,
    repairRequestVersion: 'orgunit-classifier-repair-request-v1',
    policy: { enabled: true, maxRoundsPerLogicalEvaluation: 1, minimumRemainingBudgetMs: 60_000 },
    noCandidatesBecause: null,
    planned: repairs.length,
    excluded: [],
    executed: repairs.length,
    accepted,
    rejected: repairs.length - accepted,
    providerFailed: 0,
    skipped: 0,
    documents,
    inputTokens: 4_000 * repairs.length,
    outputTokens: 150 * repairs.length,
    monotonicWallTimeMs: 20_000 * repairs.length,
  });
}

/** The two observed attempt-1 defects, corrected the way a compliant re-answer would correct them. */
function observedRepairs(copy: string): SyntheticRepair[] {
  const results = rawResultsOf(join(copy, V2_BATCH_7));
  const expanded = results.find((r) => r.doc_index === EXPANDED_NAME_DOC)!;
  const misSourced = results.find((r) => r.doc_index === MIS_SOURCED_DOC)!;
  return [
    {
      docIndex: EXPANDED_NAME_DOC,
      reasonCodes: ['UNIT_NAME_UNSUPPORTED'],
      rejectionReason: 'unit_name is not supported by any supplied field',
      // The short form, which IS in the document's headings.
      repaired: { ...expanded, unit_name: 'DAI' } as ClassificationResult,
      accepted: true,
    },
    {
      docIndex: MIS_SOURCED_DOC,
      reasonCodes: ['EVIDENCE_SPAN_VERIFIES_UNDER_OTHER_SOURCE'],
      rejectionReason:
        'evidence_spans[0] (source=HEADING) is not a literal substring of the supplied field',
      // The same quote, attributed to the field it is literal in.
      repaired: {
        ...misSourced,
        evidence_spans: misSourced.evidence_spans.map((span, i) =>
          i === 0 ? { ...span, source: 'EXCERPT' as const } : span,
        ),
      } as ClassificationResult,
      accepted: true,
    },
  ];
}

describe.skipIf(!ATTEMPT_PRESENT)('2D2C-R1 scorer: repair artifacts on a COPY of attempt 1', () => {
  it('a plain copy still carries no repair key and the F3 inventory (control)', () => {
    const copy = copyAttempt();
    const run = runScoring(REPO_ROOT, copy, SUPPLEMENT, ADJUDICATION);
    expect(run.sources.artifactInventorySha256).toBe(F3_INVENTORY);
    expect(run.sources.repairArtifactInventory.count).toBe(0);
    expect('repair' in run.summary).toBe(false);
    expect(run.allRows.every((row) => !('repair' in row) && !('firstPass' in row))).toBe(true);
  });

  it('two accepted repairs: primary inventory unchanged, first-pass totals still F3, gates post-repair, first-pass rate beside them', () => {
    const copy = copyAttempt();
    writeSyntheticRound(join(copy, V2_BATCH_7), observedRepairs(copy));
    const run = runScoring(REPO_ROOT, copy, SUPPLEMENT, ADJUDICATION);

    // The supplement and adjudication records still pin the F3 aggregate, and it still holds.
    expect(run.sources.artifactInventorySha256).toBe(F3_INVENTORY);
    expect(run.sources.artifactsVerified).toBe(243);
    expect(run.sources.repairArtifactInventory.count).toBe(13); // 1 round + 2 x 6
    expect(run.sources.repairArtifactsVerified).toBe(13);

    // First-pass totals are what F3 recorded.
    const v2 = run.summary.variants.find((v) => v.variantName === 'PROMPT_V2_CANONICAL')!;
    expect(v2.accepted).toBe(47);
    expect(v2.rejected).toBe(2);
    expect(v2.matchesF3Totals).toBe(true);

    // The repair block: gates on post-repair validity, first pass beside it.
    const repair = run.summary.repair!;
    expect(repair.gatesAppliedTo).toBe('POST_REPAIR_VALIDITY');
    expect(repair.firstPassRateAlwaysReported).toBe(true);
    const v2Repair = repair.perVariant.find((v) => v.variantName === 'PROMPT_V2_CANONICAL')!;
    expect(v2Repair.firstPass).toEqual({ accepted: 47, rejected: 2, rate: 47 / 49 });
    expect(v2Repair.postRepair).toEqual({ accepted: 49, rejected: 0, rate: 1 });
    expect(v2Repair.recoveredByRepair).toBe(2);
    expect(v2Repair.repairs).toEqual({
      planned: 2,
      executed: 2,
      accepted: 2,
      rejected: 0,
      providerFailed: 0,
      skipped: 0,
    });
    expect(v2Repair.repairInputTokens).toBe(8_000);
    expect(v2Repair.evaluationsWithARound).toBe(1);
    const v1Repair = repair.perVariant.find((v) => v.variantName === 'PROMPT_V1_CANONICAL')!;
    expect(v1Repair.firstPass.accepted).toBe(45);
    expect(v1Repair.postRepair.accepted).toBe(45);
    expect(v1Repair.evaluationsWithARound).toBe(0);

    // The span-rate gate is applied POST-REPAIR: V2 now reads 49/49 and is met.
    const v2Gates = run.summary.semanticMetrics!.find(
      (m) => m.variantName === 'PROMPT_V2_CANONICAL',
    )!.gates;
    const spanRate = v2Gates.find((g) => g.gate === 'minSchemaValidSpanVerifiedRate')!;
    expect(spanRate).toMatchObject({ observed: 1, denominator: 49, met: true });
    // V1, untouched, still fails it exactly as committed.
    const v1Gates = run.summary.semanticMetrics!.find(
      (m) => m.variantName === 'PROMPT_V1_CANONICAL',
    )!.gates;
    expect(v1Gates.find((g) => g.gate === 'minSchemaValidSpanVerifiedRate')).toMatchObject({
      observed: 45 / 49,
      met: false,
    });

    // The two repaired rows carry firstPass + repair and are ACCEPTED; every other row is byte-identical to the committed derivation.
    const committed = readFileSync(join(REPO_ROOT, COMMITTED_SCORED_ITEMS), 'utf8')
      .split('\n')
      .filter((l) => l !== '');
    const rendered = renderScoredItems(run.allRows)
      .split('\n')
      .filter((l) => l !== '');
    expect(rendered).toHaveLength(committed.length);
    const repairedGoldIds = new Set(['g0ec0d43dad311a77', 'g877a05e6f5bba835']);
    let repairedRows = 0;
    for (const [index, line] of rendered.entries()) {
      const row = JSON.parse(line) as {
        goldId: string;
        variantName: string;
        validatorState: string;
        firstPass?: unknown;
        repair?: { disposition: string };
      };
      if (row.variantName === 'PROMPT_V2_CANONICAL' && repairedGoldIds.has(row.goldId)) {
        repairedRows += 1;
        expect(row.validatorState).toBe('ACCEPTED');
        expect(row.firstPass).toMatchObject({
          validatorState: 'REJECTED',
          rejectionCategory: 'EVIDENCE',
        });
        expect(row.repair).toMatchObject({ disposition: 'ACCEPTED' });
        expect(line).not.toBe(committed[index]);
      } else {
        expect(line, `${row.goldId}/${row.variantName}`).toBe(committed[index]);
      }
    }
    expect(repairedRows).toBe(2);

    // Recall moves only where a repaired answer is a correct UNIT_PAGE: the mis-sourced item's raw verdict was UNIT_PAGE / IMO (V3D1 §5.2).
    const recall = v2Gates.find((g) => g.gate === 'minUnitPageRecall')!;
    expect(recall.observed).toBe(10 / 14);
  });

  it('a repair that fails again leaves the row REJECTED with its first-pass state and a REJECTED repair', () => {
    const copy = copyAttempt();
    const [expanded] = observedRepairs(copy);
    const results = rawResultsOf(join(copy, V2_BATCH_7));
    const original = results.find((r) => r.doc_index === EXPANDED_NAME_DOC)!;
    writeSyntheticRound(join(copy, V2_BATCH_7), [
      { ...expanded!, repaired: original, accepted: false }, // expands again
    ]);
    const run = runScoring(REPO_ROOT, copy, SUPPLEMENT, ADJUDICATION);
    const row = run.allRows.find(
      (r) => r.goldId === 'g0ec0d43dad311a77' && r.variantName === 'PROMPT_V2_CANONICAL',
    )!;
    expect(row.validatorState).toBe('REJECTED');
    expect(row.rejectionReason).toBe('unit_name is not supported by any supplied field');
    expect(row.repair).toMatchObject({
      disposition: 'REJECTED',
      errorKind: 'EVIDENCE_SPAN_UNVERIFIED',
    });
    expect(run.summary.repair!.perVariant[1]!.postRepair.accepted).toBe(47);
  });

  it('fails closed on an ACCEPTED repair whose raw output does not re-validate, and on a repair of a first-pass-accepted document', () => {
    const copy = copyAttempt();
    const [expanded] = observedRepairs(copy);
    // Claims acceptance, but the raw output still carries the unsupported name.
    const results = rawResultsOf(join(copy, V2_BATCH_7));
    const original = results.find((r) => r.doc_index === EXPANDED_NAME_DOC)!;
    writeSyntheticRound(join(copy, V2_BATCH_7), [
      { ...expanded!, repaired: original, accepted: true },
    ]);
    expect(() => loadScoringSources(REPO_ROOT, copy)).toThrow(ScoringSourceError);
    expect(() => loadScoringSources(REPO_ROOT, copy)).toThrow(/does not validate|disagrees/);

    const second = copyAttempt();
    const accepted = rawResultsOf(join(second, V2_BATCH_7)).find((r) => r.doc_index === 4)!;
    writeSyntheticRound(join(second, V2_BATCH_7), [
      { docIndex: 4, reasonCodes: [], rejectionReason: 'n/a', repaired: accepted, accepted: true },
    ]);
    expect(() => loadScoringSources(REPO_ROOT, second)).toThrow(/not an item-level rejection/);
  });

  it('refuses a stray subdirectory beside repair-1, and a corrupt repair artifact', () => {
    const copy = copyAttempt();
    writeSyntheticRound(join(copy, V2_BATCH_7), observedRepairs(copy));
    const outcomePath = join(
      repairDocumentDirectoryOf(join(copy, V2_BATCH_7), MIS_SOURCED_DOC),
      'repair-outcome.json',
    );
    writeFileSync(
      outcomePath,
      readFileSync(outcomePath, 'utf8').replace('"ACCEPTED"', '"REJECTED"'),
    );
    expect(() => loadScoringSources(REPO_ROOT, copy)).toThrow(/HASH_MISMATCH/);

    const second = copyAttempt();
    ensureRepairDirectory(join(second, V2_BATCH_7, 'repair-2'));
    expect(() => loadScoringSources(REPO_ROOT, second)).toThrow(/unexpected directory repair-2/);
  });
});
