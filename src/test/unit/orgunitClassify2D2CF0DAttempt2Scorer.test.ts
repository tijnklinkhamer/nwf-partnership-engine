/**
 * PHASE 2B-2D2C-F0D — the attempt-2 scorer, pinned to the approved F0C
 * freeze, exercised over a SYNTHETIC attempt-2 root.
 *
 * No attempt-2 evidence exists (attempt 2 is not authorised). To prove the
 * scorer's loaders, pins and pairing WITHOUT fabricating evidence, every
 * test here builds an explicitly synthetic attempt-2 root in a temporary
 * directory from the preserved attempt-1 PROMPT_V2_CANONICAL artifacts —
 * the raw outputs and validation results are copied byte for byte and only
 * the identity envelopes are re-stamped for V3/attempt 2 — scores it, and
 * deletes it. The result is a test of the machinery: "V3 rows identical to
 * V2 rows" is the expected, verifiable outcome, and nothing under the
 * repository or the preserved attempt is written.
 *
 * Skips visibly when PHASE2B_2D2C_ATTEMPT1_ROOT is unset.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ARTIFACT_FILE_NAMES,
  ensureRepairDirectory,
  readArtifact,
  repairDocumentDirectoryOf,
  repairRoundDirectoryOf,
  writeArtifactOnce,
} from '../harness/phase2b2d2c/artifacts.js';
import {
  APPROVED_F0C_FREEZE_RAW_SHA256,
  buildF0CExecutionPlan,
  F0C_FREEZE_PATH,
  loadF0CFreezeFromBytes,
  SPENT_ATTEMPT_1_AUTHORISATION_SHA256,
} from '../harness/phase2b2d2c/f0c/freezeF0C.js';
import { sha256Hex } from '../harness/phase2b2d2c/freeze.js';
import { generateAttempt2 } from '../harness/phase2b2d2c/scoring/attempt2Generate.js';
import { runAttempt2Scoring } from '../harness/phase2b2d2c/scoring/attempt2Run.js';
import {
  ATTEMPT2_EXPECTED_PRIMARY_ARTIFACT_COUNT,
  loadAttempt2ScoringSources,
} from '../harness/phase2b2d2c/scoring/attempt2Sources.js';
import { ScoringSourceError } from '../harness/phase2b2d2c/scoring/sources.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ATTEMPT1_ROOT = process.env['PHASE2B_2D2C_ATTEMPT1_ROOT'] ?? '';
const ATTEMPT1_PRESENT = ATTEMPT1_ROOT !== '' && existsSync(ATTEMPT1_ROOT);
const SUPPLEMENT = 'docs/evaluation/PHASE_2B_2D2C_DEV_SCORING_SUPPLEMENT_V1.json';
const ADJUDICATION = 'docs/evaluation/PHASE_2B_2D2C_DEV_OWNER_ADJUDICATION_G1_V1.json';
const F3_INVENTORY = 'ee17e1f2ee8021e59c06377342042e56f84269165f8ec39521011cb1d3538137';

const { freeze, rawSha256 } = loadF0CFreezeFromBytes(
  readFileSync(join(REPO_ROOT, F0C_FREEZE_PATH)),
);
const PLAN = buildF0CExecutionPlan(freeze, rawSha256);

const scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

const COPIED_AS_IS = [
  'CHILD_PREFLIGHT',
  'RAW_OUTPUT_CHECKPOINT',
  'VALIDATION_RESULT',
  'PROVIDER_OUTCOME',
  'TIER2_OUTCOME',
  'STOP_DECISION',
] as const;

function readRecord<T>(dir: string, kind: keyof typeof ARTIFACT_FILE_NAMES): T {
  const read = readArtifact<T>(dir, kind);
  if (!read.ok) throw new Error(`${kind} in ${dir}: ${read.detail}`);
  return read.envelope.record;
}

/**
 * A SYNTHETIC attempt-2 root: attempt-1 V2 outputs re-stamped as V3 /
 * attempt 2. `withSkippedRepair` adds one recorded, request-free SKIPPED
 * repair to batch 7's first EVIDENCE-rejected document, so the first-pass /
 * post-repair split is exercised without inventing any model output.
 */
function buildSyntheticAttempt2Root(options: { withSkippedRepair?: boolean } = {}): {
  root: string;
  authorisationSha256: string;
} {
  const root = tmp('nwf-pe-f0d-synthetic-attempt2-');
  const authorisationSha256 = sha256Hex(`synthetic attempt-2 authorisation ${root}`);
  const experimentDir = join(root, 'experiments', 'attempt-2');
  mkdirSync(experimentDir, { recursive: true });
  mkdirSync(join(root, 'authorisations'), { recursive: true });
  writeArtifactOnce(join(root, 'authorisations'), 'AUTHORISATION_CONSUMPTION', {
    authorisationSha256,
    attemptNo: 2,
    experimentDir,
    consumedAtUtc: '2026-09-15T12:00:00.000Z',
  });
  // The marker file is named by the authorisation hash, as the coordinator names it.
  cpSync(
    join(root, 'authorisations', ARTIFACT_FILE_NAMES.AUTHORISATION_CONSUMPTION),
    join(root, 'authorisations', `${authorisationSha256}.json`),
  );
  rmSync(join(root, 'authorisations', ARTIFACT_FILE_NAMES.AUTHORISATION_CONSUMPTION));
  writeArtifactOnce(experimentDir, 'EXPERIMENT_MANIFEST', {
    freezeVersion: freeze.version,
    freezeConfigRawSha256: rawSha256,
    attemptNo: 2,
    plannedLogicalEvaluations: 12,
    variantRoots: { PROMPT_V3_CANONICAL: '/synthetic/v3' },
    authorisationSha256,
    tier2: { watchdogMs: 700_000, graceMs: 10_000 },
    startedAtUtc: '2026-09-15T12:00:00.000Z',
  });
  writeArtifactOnce(experimentDir, 'EXPERIMENT_COMPLETION', {
    status: 'COMPLETED_ALL_PLANNED',
    evaluationsStarted: 12,
    perVariantEndedWithoutStop: { PROMPT_V3_CANONICAL: 12 },
    completedAtUtc: '2026-09-15T13:00:00.000Z',
  });
  for (const planned of PLAN.evaluations) {
    const batch = `batch-${String(planned.logicalBatchOrdinal).padStart(2, '0')}`;
    const source = join(ATTEMPT1_ROOT, 'evaluations', 'PROMPT_V2_CANONICAL', batch, 'attempt-1');
    const target = join(root, 'evaluations', 'PROMPT_V3_CANONICAL', batch, 'attempt-2');
    mkdirSync(target, { recursive: true });
    for (const kind of COPIED_AS_IS) {
      cpSync(join(source, ARTIFACT_FILE_NAMES[kind]), join(target, ARTIFACT_FILE_NAMES[kind]));
    }
    writeArtifactOnce(target, 'PLANNED_INPUT', {
      ...planned,
      requestedModelId: PLAN.requestedModelId,
      runConfig: PLAN.runConfig,
    });
    writeArtifactOnce(target, 'CHILD_MANIFEST', { synthetic: true, attemptNo: 2 });
    const v2Result = readRecord<Record<string, unknown>>(source, 'CHILD_RESULT');
    writeArtifactOnce(target, 'CHILD_RESULT', {
      ...v2Result,
      variantName: 'PROMPT_V3_CANONICAL',
      attemptNo: 2,
      repairRound: null,
    });
    const v2Final = readRecord<Record<string, unknown>>(source, 'FINAL_RECORD');
    writeArtifactOnce(target, 'FINAL_RECORD', {
      ...v2Final,
      variantName: planned.variantName,
      variantLabel: planned.variantLabel,
      variantGitCommit: planned.variantGitCommit,
      promptVersion: planned.promptVersion,
      promptSha256: planned.promptSha256,
      finalInputSha256: planned.finalInputSha256,
      attemptNo: 2,
      freezeVersion: freeze.version,
      freezeConfigRawSha256: rawSha256,
      repairRound: null,
    });
    if (options.withSkippedRepair && planned.logicalBatchOrdinal === 7) {
      const validation = readRecord<{
        rejected: { docIndex: number | null; category: string; reason: string }[];
      }>(target, 'VALIDATION_RESULT');
      const rejected = validation.rejected.find(
        (r) => r.category === 'EVIDENCE' && r.docIndex !== null,
      );
      if (rejected === undefined)
        throw new Error('synthetic root: batch 7 has no EVIDENCE rejection to attach a repair to');
      const roundDir = repairRoundDirectoryOf(target);
      const docDir = repairDocumentDirectoryOf(target, rejected.docIndex!);
      ensureRepairDirectory(docDir);
      writeArtifactOnce(docDir, 'REPAIR_DECISION', {
        round: 1,
        docIndex: rejected.docIndex,
        category: 'EVIDENCE',
        rejectionReason: rejected.reason,
        reasonCodes: ['EVIDENCE_SPAN_NOT_LITERAL'],
        invalidFields: [],
        elapsedSinceOriginalMs: 500_000,
        totalBudgetMs: 600_000,
        hardKillGraceMs: 10_000,
        policy: freeze.repairPolicy,
        decision: {
          kind: 'SKIP',
          code: 'REPAIR_SKIPPED_INSUFFICIENT_BUDGET',
          remainingMs: 100_000,
          usableMs: 90_000,
          minimumRemainingBudgetMs: 120_000,
        },
      });
      writeArtifactOnce(docDir, 'REPAIR_OUTCOME', {
        round: 1,
        docIndex: rejected.docIndex,
        disposition: 'SKIPPED',
        providerOutcome: null,
        errorKind: 'OTHER',
        detail: 'synthetic skipped repair',
        verdict: null,
        providerRequestSent: false,
      });
      writeArtifactOnce(roundDir, 'REPAIR_ROUND', {
        round: 1,
        repairRequestVersion: 'orgunit-classifier-repair-request-v1',
        policy: freeze.repairPolicy,
        noCandidatesBecause: null,
        planned: 1,
        excluded: [],
        executed: 0,
        accepted: 0,
        rejected: 0,
        providerFailed: 0,
        skipped: 1,
        documents: [
          {
            docIndex: rejected.docIndex,
            disposition: 'SKIPPED',
            providerOutcome: null,
            errorKind: 'OTHER',
            repairOutcomeSha256: null,
          },
        ],
        inputTokens: 0,
        outputTokens: 0,
        monotonicWallTimeMs: 0,
      });
    }
  }
  return { root, authorisationSha256 };
}

describe.skipIf(!ATTEMPT1_PRESENT)(
  '2D2C-F0D attempt-2 scorer over a SYNTHETIC attempt-2 root (nothing real is scored)',
  () => {
    it('loads and verifies the synthetic root against the approved F0C freeze: 12 V3 evaluations, 123 primary artifacts, the marker the manifest names', () => {
      const { root, authorisationSha256 } = buildSyntheticAttempt2Root();
      const sources = loadAttempt2ScoringSources(REPO_ROOT, root);
      expect(sources.freezeRawSha256).toBe(APPROVED_F0C_FREEZE_RAW_SHA256);
      expect(sources.evaluations).toHaveLength(12);
      expect(sources.evaluations.every((e) => e.variantName === 'PROMPT_V3_CANONICAL')).toBe(true);
      expect(sources.artifactsVerified).toBe(ATTEMPT2_EXPECTED_PRIMARY_ARTIFACT_COUNT);
      expect(sources.authorisationSha256).toBe(authorisationSha256);
      expect(sources.repairArtifactInventory.count).toBe(0);
    });

    it('scores V3 post-repair, pairs it against V1 and V2 read-only, pins the comparator inventory, and (by construction) finds V3 identical to V2', () => {
      const { root } = buildSyntheticAttempt2Root();
      const run = runAttempt2Scoring(REPO_ROOT, root, ATTEMPT1_ROOT, SUPPLEMENT, ADJUDICATION);
      expect(run.v3Rows).toHaveLength(49);
      expect(run.v1Rows).toHaveLength(49);
      expect(run.v2Rows).toHaveLength(49);
      expect(run.pairedV1ToV3).toHaveLength(49);
      expect(run.pairedV2ToV3).toHaveLength(49);
      expect(run.summary.sources.attempt1Comparator.artifactInventorySha256).toBe(F3_INVENTORY);
      expect(run.summary.sources.attempt1Comparator.readOnly).toBe(true);
      expect(run.summary.sources.attempt1Comparator.rerun).toBe(false);
      // Copied outputs: every V2->V3 pair keeps its validity and its structured answer.
      const v2ToV3 = run.summary.comparisons.find((c) => c.comparator === 'PROMPT_V2_CANONICAL')!;
      expect(v2ToV3.validity.REJECTED_TO_ACCEPTED + v2ToV3.validity.ACCEPTED_TO_REJECTED).toBe(0);
      expect(v2ToV3.concordanceByField.every((c) => c.disagree === 0)).toBe(true);
      expect(v2ToV3.verdictCorrections).toEqual([]);
      expect(v2ToV3.verdictRegressions).toEqual([]);
      expect(run.summary.candidate.firstPass).toMatchObject({ accepted: 47, rejected: 2 });
      expect(run.summary.candidate.postRepair).toMatchObject({ accepted: 47, rejected: 2 });
      expect(run.summary.candidate.recoveredByRepair).toBe(0);
      // Gates are the freeze's own; V2's known failures reappear on its copy.
      expect(run.summary.gates.map((g) => g.gate)).toEqual(
        Object.keys(freeze.scoring.gates).filter((g) =>
          [
            'minSchemaValidSpanVerifiedRate',
            'minUnitPageRecall',
            'minUnitPagePrecision',
            'minUnitTypeAccuracy',
            'minHardNegativeRejection',
            'maxNeedsReviewRate',
          ].includes(g),
        ),
      );
      expect(run.summary.failedGates).toContain('minSchemaValidSpanVerifiedRate');
      expect(run.summary.failedGates).toContain('minUnitPageRecall');
      expect(run.summary.devGateOutcome).toBe('FROZEN_GATES_FAILED_ON_DEV');
      expect(run.summary.holdoutEligibility.holdoutInferencePermittedByThisSummary).toBe(false);
      expect(run.summary.holdoutEligibility.devCandidatePassesEveryFrozenGate).toBe(false);
      expect(run.summary.goldSupplement?.pinnedByF0C).toBe(true);
      expect(run.summary.ownerAdjudication?.labelChanged).toBe(false);
      expect(run.summary.perBatchCost).toHaveLength(12);
      expect(run.summary.repair.gatesAppliedTo).toBe('POST_REPAIR_VALIDITY');
      expect(run.summary.repair.firstPassRateAlwaysReported).toBe(true);
      expect(run.summary.repair.evaluationsWithARound).toBe(0);
    });

    it('a recorded SKIPPED repair is loaded and reported: first-pass and post-repair stay equal, the round is counted, the repair inventory is separate', () => {
      const { root } = buildSyntheticAttempt2Root({ withSkippedRepair: true });
      const run = runAttempt2Scoring(REPO_ROOT, root, ATTEMPT1_ROOT, SUPPLEMENT, ADJUDICATION);
      expect(run.summary.repair.evaluationsWithARound).toBe(1);
      expect(run.summary.repair.repairs).toMatchObject({
        planned: 1,
        executed: 0,
        skipped: 1,
        accepted: 0,
      });
      expect(run.summary.repair.artifactInventory.count).toBe(3);
      expect(run.summary.candidate.recoveredByRepair).toBe(0);
      const repaired = run.v3Rows.find((r) => r.repair !== undefined);
      expect(repaired?.repair?.disposition).toBe('SKIPPED');
      expect(repaired?.firstPass?.validatorState).toBe('REJECTED');
      expect(repaired?.validatorState).toBe('REJECTED');
      expect(run.summary.repair.policy.minimumRemainingBudgetMs).toBe(120_000);
    });

    it('without a gold supplement the outcome is INSUFFICIENT_VALID_DEV_EVIDENCE and no gate is measured', () => {
      const { root } = buildSyntheticAttempt2Root();
      const run = runAttempt2Scoring(REPO_ROOT, root, ATTEMPT1_ROOT);
      expect(run.summary.devGateOutcome).toBe('INSUFFICIENT_VALID_DEV_EVIDENCE');
      expect(run.summary.gates).toEqual([]);
      expect(run.summary.semanticMetrics).toBeUndefined();
      expect(run.summary.holdoutEligibility.devCandidatePassesEveryFrozenGate).toBeNull();
    });

    it('fails closed: an attempt-1 variant directory inside the attempt-2 namespace, a second experiment, the spent attempt-1 authorisation, a drifted comparator, and a wrong supplement path', () => {
      const planted = buildSyntheticAttempt2Root().root;
      mkdirSync(join(planted, 'evaluations', 'PROMPT_V1_CANONICAL', 'batch-01', 'attempt-1'), {
        recursive: true,
      });
      expect(() => loadAttempt2ScoringSources(REPO_ROOT, planted)).toThrow(
        /attempt-1 variants are never inside/,
      );

      const twoExperiments = buildSyntheticAttempt2Root().root;
      mkdirSync(join(twoExperiments, 'experiments', 'attempt-1'));
      expect(() => loadAttempt2ScoringSources(REPO_ROOT, twoExperiments)).toThrow(
        /exactly attempt-2 is expected/,
      );

      const spent = buildSyntheticAttempt2Root();
      const manifestPath = join(
        spent.root,
        'experiments',
        'attempt-2',
        ARTIFACT_FILE_NAMES.EXPERIMENT_MANIFEST,
      );
      rmSync(manifestPath);
      writeArtifactOnce(join(spent.root, 'experiments', 'attempt-2'), 'EXPERIMENT_MANIFEST', {
        freezeVersion: freeze.version,
        freezeConfigRawSha256: rawSha256,
        attemptNo: 2,
        plannedLogicalEvaluations: 12,
        variantRoots: { PROMPT_V3_CANONICAL: '/synthetic/v3' },
        authorisationSha256: SPENT_ATTEMPT_1_AUTHORISATION_SHA256,
        tier2: { watchdogMs: 700_000, graceMs: 10_000 },
        startedAtUtc: '2026-09-15T12:00:00.000Z',
      });
      expect(() => loadAttempt2ScoringSources(REPO_ROOT, spent.root)).toThrow(
        /spent attempt-1 authorisation/,
      );

      const good = buildSyntheticAttempt2Root().root;
      const driftedComparator = tmp('nwf-pe-f0d-drifted-attempt1-');
      cpSync(ATTEMPT1_ROOT, driftedComparator, { recursive: true });
      const victim = join(
        driftedComparator,
        'evaluations',
        'PROMPT_V1_CANONICAL',
        'batch-01',
        'attempt-1',
        ARTIFACT_FILE_NAMES.STOP_DECISION,
      );
      rmSync(victim);
      writeArtifactOnce(dirname(victim), 'STOP_DECISION', {
        stop: false,
        stopCondition: null,
        haltKind: null,
        detail: 'drifted',
      });
      expect(() =>
        runAttempt2Scoring(REPO_ROOT, good, driftedComparator, SUPPLEMENT, ADJUDICATION),
      ).toThrow(/not the comparator the F0C freeze pins/);
      expect(() =>
        runAttempt2Scoring(REPO_ROOT, good, ATTEMPT1_ROOT, ADJUDICATION, ADJUDICATION),
      ).toThrow(/scoring supplement path .* is not the one the F0C freeze pins/);
      expect(() =>
        runAttempt2Scoring(REPO_ROOT, good, ATTEMPT1_ROOT, undefined, ADJUDICATION),
      ).toThrow(ScoringSourceError);
    });

    it('emits byte-identical derived outputs on two separate derivations, into scratch only, with no raw model text', async () => {
      const { root } = buildSyntheticAttempt2Root();
      const outA = tmp('nwf-pe-f0d-out-a-');
      const outB = tmp('nwf-pe-f0d-out-b-');
      const a = await generateAttempt2({
        attempt2Root: root,
        attempt1Root: ATTEMPT1_ROOT,
        out: outA,
        goldSupplement: SUPPLEMENT,
        ownerAdjudication: ADJUDICATION,
      });
      const b = await generateAttempt2({
        attempt2Root: root,
        attempt1Root: ATTEMPT1_ROOT,
        out: outB,
        goldSupplement: SUPPLEMENT,
        ownerAdjudication: ADJUDICATION,
      });
      expect(a.files).toEqual(b.files);
      expect(readdirSync(outA).sort()).toEqual([
        'manifest.json',
        'scored-items.jsonl',
        'summary.json',
      ]);
      for (const name of ['manifest.json', 'scored-items.jsonl', 'summary.json']) {
        expect(readFileSync(join(outA, name))).toEqual(readFileSync(join(outB, name)));
      }
      const summaryText = readFileSync(join(outA, 'summary.json'), 'utf8');
      expect(summaryText).not.toContain('rationale');
      expect(summaryText).toContain('"attemptNo": 2');
      expect(
        readFileSync(join(outA, 'scored-items.jsonl'), 'utf8').split('\n').filter(Boolean),
      ).toHaveLength(147);
      expect(
        existsSync(
          join(
            REPO_ROOT,
            'docs/evaluation/results/phase2b-2d2c-dev-attribution-attempt-2-gold-v1-adjudicated',
          ),
        ),
      ).toBe(false);
    });
  },
);
