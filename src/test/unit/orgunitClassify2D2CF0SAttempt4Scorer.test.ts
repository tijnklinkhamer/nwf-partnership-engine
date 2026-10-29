/**
 * PHASE 2B-2D2C-F0S — the attempt-4 scorer, pinned to the owner-approved
 * F0O freeze, exercised over a SYNTHETIC attempt-4 root.
 *
 * Every test here builds an explicitly synthetic attempt-4 root in a
 * temporary directory from the preserved attempt-3 PROMPT_V4_CANONICAL
 * artifacts — the raw outputs and validation results are copied byte for
 * byte and only the identity envelopes are re-stamped for V5/attempt 4 —
 * scores it against the REAL, preserved attempt-1/2/3 comparator roots, and
 * deletes it. The result is a test of the machinery: "V5 rows identical to
 * V4 rows" is the expected, verifiable outcome, and nothing under the
 * repository or any preserved attempt is written.
 *
 * Skips visibly when PHASE2B_2D2C_ATTEMPT1_ROOT, PHASE2B_2D2C_ATTEMPT2_ROOT
 * or PHASE2B_2D2C_ATTEMPT3_ROOT is unset.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
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
  F0O_FREEZE_PATH,
  F0O_REVISION,
  PROPOSED_F0O_FREEZE_RAW_SHA256,
  SPENT_ATTEMPT_1_AUTHORISATION_SHA256,
  SPENT_ATTEMPT_2_AUTHORISATION_SHA256,
  SPENT_ATTEMPT_3_AUTHORISATION_SHA256,
} from '../harness/phase2b2d2c/f0o/freezeF0O.js';
import {
  buildAttempt4ExecutionPlan,
  loadAttempt4FreezeFromBytes,
} from '../harness/phase2b2d2c/f0o/attempt4FreezeCore.js';
import { sha256Hex } from '../harness/phase2b2d2c/freeze.js';
import { generateAttempt4 } from '../harness/phase2b2d2c/scoring/attempt4Generate.js';
import { runAttempt4Scoring } from '../harness/phase2b2d2c/scoring/attempt4Run.js';
import {
  ATTEMPT4_EXPECTED_PRIMARY_ARTIFACT_COUNT,
  loadAttempt4ScoringSources,
} from '../harness/phase2b2d2c/scoring/attempt4Sources.js';
import { ScoringSourceError } from '../harness/phase2b2d2c/scoring/sources.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ATTEMPT1_ROOT = process.env['PHASE2B_2D2C_ATTEMPT1_ROOT'] ?? '';
const ATTEMPT2_ROOT = process.env['PHASE2B_2D2C_ATTEMPT2_ROOT'] ?? '';
const ATTEMPT3_ROOT = process.env['PHASE2B_2D2C_ATTEMPT3_ROOT'] ?? '';
const ALL_COMPARATORS_PRESENT =
  ATTEMPT1_ROOT !== '' &&
  existsSync(ATTEMPT1_ROOT) &&
  ATTEMPT2_ROOT !== '' &&
  existsSync(ATTEMPT2_ROOT) &&
  ATTEMPT3_ROOT !== '' &&
  existsSync(ATTEMPT3_ROOT);
const SUPPLEMENT = 'docs/evaluation/PHASE_2B_2D2C_DEV_SCORING_SUPPLEMENT_V1.json';
const ADJUDICATION = 'docs/evaluation/PHASE_2B_2D2C_DEV_OWNER_ADJUDICATION_G1_V1.json';

const { freeze, rawSha256 } = loadAttempt4FreezeFromBytes(
  F0O_REVISION,
  readFileSync(join(REPO_ROOT, F0O_FREEZE_PATH)),
);
const PLAN = buildAttempt4ExecutionPlan(freeze, rawSha256);

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
 * A SYNTHETIC attempt-4 root: attempt-3 V4 outputs re-stamped as V5 /
 * attempt 4. `withSkippedRepair` adds one recorded, request-free SKIPPED
 * repair to batch 7's first EVIDENCE-rejected document, so the first-pass /
 * post-repair split is exercised without inventing any model output.
 */
function buildSyntheticAttempt4Root(options: { withSkippedRepair?: boolean } = {}): {
  root: string;
  authorisationSha256: string;
} {
  const root = tmp('nwf-pe-f0s-synthetic-attempt4-');
  const authorisationSha256 = sha256Hex(`synthetic attempt-4 authorisation ${root}`);
  const experimentDir = join(root, 'experiments', 'attempt-4');
  mkdirSync(experimentDir, { recursive: true });
  mkdirSync(join(root, 'authorisations'), { recursive: true });
  writeArtifactOnce(join(root, 'authorisations'), 'AUTHORISATION_CONSUMPTION', {
    authorisationSha256,
    attemptNo: 4,
    experimentDir,
    consumedAtUtc: '2026-09-15T20:00:00.000Z',
  });
  cpSync(
    join(root, 'authorisations', ARTIFACT_FILE_NAMES.AUTHORISATION_CONSUMPTION),
    join(root, 'authorisations', `${authorisationSha256}.json`),
  );
  rmSync(join(root, 'authorisations', ARTIFACT_FILE_NAMES.AUTHORISATION_CONSUMPTION));
  writeArtifactOnce(experimentDir, 'EXPERIMENT_MANIFEST', {
    freezeVersion: freeze.version,
    freezeConfigRawSha256: rawSha256,
    attemptNo: 4,
    plannedLogicalEvaluations: 12,
    variantRoots: { PROMPT_V5_CANONICAL: '/synthetic/v5' },
    authorisationSha256,
    tier2: { watchdogMs: 700_000, graceMs: 10_000 },
    startedAtUtc: '2026-09-15T20:00:00.000Z',
  });
  writeArtifactOnce(experimentDir, 'EXPERIMENT_COMPLETION', {
    status: 'COMPLETED_ALL_PLANNED',
    evaluationsStarted: 12,
    perVariantEndedWithoutStop: { PROMPT_V5_CANONICAL: 12 },
    completedAtUtc: '2026-09-15T21:00:00.000Z',
  });
  for (const planned of PLAN.evaluations) {
    const batch = `batch-${String(planned.logicalBatchOrdinal).padStart(2, '0')}`;
    const source = join(ATTEMPT3_ROOT, 'evaluations', 'PROMPT_V4_CANONICAL', batch, 'attempt-3');
    const target = join(root, 'evaluations', 'PROMPT_V5_CANONICAL', batch, 'attempt-4');
    mkdirSync(target, { recursive: true });
    for (const kind of COPIED_AS_IS) {
      cpSync(join(source, ARTIFACT_FILE_NAMES[kind]), join(target, ARTIFACT_FILE_NAMES[kind]));
    }
    // The real attempt-3 V4 root carries genuine, already-adjudicated repair
    // rounds on every batch (most are a trivial "no candidates" round;
    // batch-03 and batch-07 each recovered one genuinely rejected document).
    // Carrying them over byte for byte keeps the "V5 identical to V4"
    // construction honest for those items too, instead of silently dropping
    // their post-repair recovery. `withSkippedRepair` REPLACES batch 7's
    // real round with a synthetic SKIPPED one instead of layering on top of
    // it, so the two scenarios never collide.
    const injectingSyntheticRepairHere =
      options.withSkippedRepair === true && planned.logicalBatchOrdinal === 7;
    const sourceRepairDir = join(source, 'repair-1');
    if (!injectingSyntheticRepairHere && existsSync(sourceRepairDir)) {
      cpSync(sourceRepairDir, join(target, 'repair-1'), { recursive: true });
    }
    writeArtifactOnce(target, 'PLANNED_INPUT', {
      ...planned,
      requestedModelId: PLAN.requestedModelId,
      runConfig: PLAN.runConfig,
    });
    writeArtifactOnce(target, 'CHILD_MANIFEST', { synthetic: true, attemptNo: 4 });
    const v4Result = readRecord<Record<string, unknown>>(source, 'CHILD_RESULT');
    writeArtifactOnce(target, 'CHILD_RESULT', {
      ...v4Result,
      variantName: 'PROMPT_V5_CANONICAL',
      attemptNo: 4,
      repairRound: null,
    });
    const v4Final = readRecord<Record<string, unknown>>(source, 'FINAL_RECORD');
    writeArtifactOnce(target, 'FINAL_RECORD', {
      ...v4Final,
      variantName: planned.variantName,
      variantLabel: planned.variantLabel,
      variantGitCommit: planned.variantGitCommit,
      promptVersion: planned.promptVersion,
      promptSha256: planned.promptSha256,
      finalInputSha256: planned.finalInputSha256,
      attemptNo: 4,
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

describe.skipIf(!ALL_COMPARATORS_PRESENT)(
  '2D2C-F0S attempt-4 scorer over a SYNTHETIC attempt-4 root (nothing real is scored)',
  () => {
    it('the F0O freeze re-hashes to the pinned value (necessary precondition for every test below)', () => {
      expect(rawSha256).toBe(PROPOSED_F0O_FREEZE_RAW_SHA256);
    });

    it('V6 remains unadmitted: the freeze schema and the plan builder both know only PROMPT_V5_CANONICAL', () => {
      expect(PLAN.evaluations.every((e) => e.variantName === 'PROMPT_V5_CANONICAL')).toBe(true);
      expect(
        PLAN.evaluations.some((e) => (e.variantName as string) === 'PROMPT_V6_CANONICAL'),
      ).toBe(false);
    });

    it('loads and verifies the synthetic root against the pinned F0O freeze: 12 V5 evaluations, 123 primary artifacts, the marker the manifest names', () => {
      const { root, authorisationSha256 } = buildSyntheticAttempt4Root();
      const sources = loadAttempt4ScoringSources(REPO_ROOT, root);
      expect(sources.freezeRawSha256).toBe(PROPOSED_F0O_FREEZE_RAW_SHA256);
      expect(sources.evaluations).toHaveLength(12);
      expect(sources.evaluations.every((e) => e.variantName === 'PROMPT_V5_CANONICAL')).toBe(true);
      expect(sources.artifactsVerified).toBe(ATTEMPT4_EXPECTED_PRIMARY_ARTIFACT_COUNT);
      expect(sources.authorisationSha256).toBe(authorisationSha256);
      // The real attempt-3 V4 root's repair state (10 trivial "no
      // candidates" rounds plus batch-03's and batch-07's genuine 7-file
      // rounds) is carried over byte for byte; 24 is the same value
      // independently verified against the real attempt-3 root's own
      // REPAIR inventory.
      expect(sources.repairArtifactInventory.count).toBe(24);
    });

    it('refuses a V1/V2/V3/V4 directory planted inside the attempt-4 namespace', () => {
      const planted = buildSyntheticAttempt4Root().root;
      mkdirSync(join(planted, 'evaluations', 'PROMPT_V4_CANONICAL', 'batch-01', 'attempt-3'), {
        recursive: true,
      });
      expect(() => loadAttempt4ScoringSources(REPO_ROOT, planted)).toThrow(
        /attempt-1\/2\/3 variants are never inside/,
      );
    });

    it('refuses a wrong attempt number, a second experiment, and each of the four spent authorisations by name', () => {
      const twoExperiments = buildSyntheticAttempt4Root().root;
      mkdirSync(join(twoExperiments, 'experiments', 'attempt-3'));
      expect(() => loadAttempt4ScoringSources(REPO_ROOT, twoExperiments)).toThrow(
        /exactly attempt-4 is expected/,
      );

      for (const spentSha of [
        SPENT_ATTEMPT_1_AUTHORISATION_SHA256,
        SPENT_ATTEMPT_2_AUTHORISATION_SHA256,
        SPENT_ATTEMPT_3_AUTHORISATION_SHA256,
      ]) {
        const spent = buildSyntheticAttempt4Root();
        const manifestPath = join(
          spent.root,
          'experiments',
          'attempt-4',
          ARTIFACT_FILE_NAMES.EXPERIMENT_MANIFEST,
        );
        rmSync(manifestPath);
        writeArtifactOnce(join(spent.root, 'experiments', 'attempt-4'), 'EXPERIMENT_MANIFEST', {
          freezeVersion: freeze.version,
          freezeConfigRawSha256: rawSha256,
          attemptNo: 4,
          plannedLogicalEvaluations: 12,
          variantRoots: { PROMPT_V5_CANONICAL: '/synthetic/v5' },
          authorisationSha256: spentSha,
          tier2: { watchdogMs: 700_000, graceMs: 10_000 },
          startedAtUtc: '2026-09-15T20:00:00.000Z',
        });
        expect(() => loadAttempt4ScoringSources(REPO_ROOT, spent.root)).toThrow(/spent/);
      }
    });

    it('refuses missing/extra batches: deleting one batch directory fails closed', () => {
      const missing = buildSyntheticAttempt4Root().root;
      rmSync(join(missing, 'evaluations', 'PROMPT_V5_CANONICAL', 'batch-12'), {
        recursive: true,
        force: true,
      });
      expect(() => loadAttempt4ScoringSources(REPO_ROOT, missing)).toThrow(
        /the twelve frozen batches are expected/,
      );
    });

    it('refuses an incomplete experiment (status other than COMPLETED_ALL_PLANNED)', () => {
      const incomplete = buildSyntheticAttempt4Root().root;
      const manifest = JSON.parse(
        readFileSync(
          join(incomplete, 'experiments', 'attempt-4', ARTIFACT_FILE_NAMES.EXPERIMENT_COMPLETION),
          'utf8',
        ),
      ) as { record: Record<string, unknown> };
      rmSync(
        join(incomplete, 'experiments', 'attempt-4', ARTIFACT_FILE_NAMES.EXPERIMENT_COMPLETION),
      );
      writeArtifactOnce(join(incomplete, 'experiments', 'attempt-4'), 'EXPERIMENT_COMPLETION', {
        ...manifest.record,
        status: 'STOPPED_EARLY',
      });
      expect(() => loadAttempt4ScoringSources(REPO_ROOT, incomplete)).toThrow(
        /only COMPLETED_ALL_PLANNED is scorable/,
      );
    });

    it('refuses a missing/duplicated consumption marker', () => {
      const noMarker = buildSyntheticAttempt4Root().root;
      for (const entry of readdirSync(join(noMarker, 'authorisations'))) {
        rmSync(join(noMarker, 'authorisations', entry));
      }
      expect(() => loadAttempt4ScoringSources(REPO_ROOT, noMarker)).toThrow(
        /expected exactly one consumption marker/,
      );
    });

    it('refuses a corrupted artifact envelope (tampered recordSha256)', () => {
      const corrupted = buildSyntheticAttempt4Root().root;
      const target = join(
        corrupted,
        'evaluations',
        'PROMPT_V5_CANONICAL',
        'batch-01',
        'attempt-4',
        ARTIFACT_FILE_NAMES.CHILD_RESULT,
      );
      const envelope = JSON.parse(readFileSync(target, 'utf8')) as {
        record: Record<string, unknown>;
        recordSha256: string;
      };
      envelope.recordSha256 = 'f'.repeat(64);
      rmSync(target);
      writeFileSync(target, JSON.stringify(envelope), 'utf8');
      expect(() => loadAttempt4ScoringSources(REPO_ROOT, corrupted)).toThrow();
    });

    it('scores V5 post-repair, pairs it against V1/V2/V3/V4 read-only, pins every comparator identity, and (by construction) finds V5 identical to V4', () => {
      const { root } = buildSyntheticAttempt4Root();
      const run = runAttempt4Scoring(
        REPO_ROOT,
        root,
        ATTEMPT1_ROOT,
        ATTEMPT2_ROOT,
        ATTEMPT3_ROOT,
        SUPPLEMENT,
        ADJUDICATION,
      );
      expect(run.v5Rows).toHaveLength(49);
      expect(run.v1Rows).toHaveLength(49);
      expect(run.v2Rows).toHaveLength(49);
      expect(run.v3Rows).toHaveLength(49);
      expect(run.v4Rows).toHaveLength(49);
      expect(run.pairedV1ToV5).toHaveLength(49);
      expect(run.pairedV2ToV5).toHaveLength(49);
      expect(run.pairedV3ToV5).toHaveLength(49);
      expect(run.pairedV4ToV5).toHaveLength(49);
      expect(run.summary.sources.attempt1Comparator.readOnly).toBe(true);
      expect(run.summary.sources.attempt2Comparator.readOnly).toBe(true);
      expect(run.summary.sources.attempt3Comparator.readOnly).toBe(true);
      // Copied outputs: every V4->V5 pair keeps its validity and its structured answer.
      const v4ToV5 = run.summary.comparisons.find((c) => c.comparator === 'PROMPT_V4_CANONICAL')!;
      expect(v4ToV5.validity.REJECTED_TO_ACCEPTED + v4ToV5.validity.ACCEPTED_TO_REJECTED).toBe(0);
      expect(v4ToV5.concordanceByField.every((c) => c.disagree === 0)).toBe(true);
      expect(v4ToV5.verdictCorrections).toEqual([]);
      expect(v4ToV5.verdictRegressions).toEqual([]);
      // By construction (an exact copy of the real attempt-3 V4 artifacts,
      // repair state included), V5 reproduces V4's own documented DEV
      // numbers exactly: firstPass 47/49, postRepair 49/49 (F0L closure).
      expect(run.summary.candidate.firstPass.accepted).toBe(47);
      expect(run.summary.candidate.postRepair.accepted).toBe(49);
      expect(run.summary.candidate.recoveredByRepair).toBe(2);
      expect(run.summary.holdoutEligibility.holdoutInferencePermittedByThisSummary).toBe(false);
      expect(run.summary.goldSupplement?.pinnedByF0O).toBe(true);
      expect(run.summary.ownerAdjudication?.labelChanged).toBe(false);
      expect(run.summary.perBatchCost).toHaveLength(12);
      expect(run.summary.repair.gatesAppliedTo).toBe('POST_REPAIR_VALIDITY');
      expect(run.summary.repair.firstPassRateAlwaysReported).toBe(true);
    });

    it('a recorded SKIPPED repair on batch 7 replaces its real recovery: post-repair drops by exactly one, the skipped disposition is reported, and the round is counted', () => {
      const { root } = buildSyntheticAttempt4Root({ withSkippedRepair: true });
      const run = runAttempt4Scoring(
        REPO_ROOT,
        root,
        ATTEMPT1_ROOT,
        ATTEMPT2_ROOT,
        ATTEMPT3_ROOT,
        SUPPLEMENT,
        ADJUDICATION,
      );
      // Every one of the 12 batches carries a repair-1 directory (11 real,
      // one synthetic replacement), so every evaluation is "with a round"
      // even though only two ever had anything to repair.
      expect(run.summary.repair.evaluationsWithARound).toBe(12);
      // firstPass is unaffected by repair; postRepair drops by exactly the
      // one recovery batch 7's real round would otherwise have contributed
      // (47/49 first-pass -> 48/49 post-repair, instead of the real 49/49).
      expect(run.summary.candidate.firstPass.accepted).toBe(47);
      expect(run.summary.candidate.postRepair.accepted).toBe(48);
      expect(run.summary.candidate.recoveredByRepair).toBe(1);
      const batch7 = run.v5Rows.find(
        (r) => r.repair?.disposition === 'SKIPPED' && r.logicalBatchOrdinal === 7,
      );
      expect(batch7?.repair?.disposition).toBe('SKIPPED');
      expect(batch7?.validatorState).toBe('REJECTED');
    });

    it('without a gold supplement the outcome is INSUFFICIENT_VALID_DEV_EVIDENCE and no gate is measured', () => {
      const { root } = buildSyntheticAttempt4Root();
      const run = runAttempt4Scoring(REPO_ROOT, root, ATTEMPT1_ROOT, ATTEMPT2_ROOT, ATTEMPT3_ROOT);
      expect(run.summary.devGateOutcome).toBe('INSUFFICIENT_VALID_DEV_EVIDENCE');
      expect(run.summary.gates).toEqual([]);
      expect(run.summary.semanticMetrics).toBeUndefined();
      expect(run.summary.holdoutEligibility.devCandidatePassesEveryFrozenGate).toBeNull();
    });

    it('fails closed on a wrong gold-supplement path and on a supplement without an adjudication', () => {
      const good = buildSyntheticAttempt4Root().root;
      expect(() =>
        runAttempt4Scoring(
          REPO_ROOT,
          good,
          ATTEMPT1_ROOT,
          ATTEMPT2_ROOT,
          ATTEMPT3_ROOT,
          ADJUDICATION,
          ADJUDICATION,
        ),
      ).toThrow(/scoring supplement path .* is not the one the F0O freeze pins/);
      expect(() =>
        runAttempt4Scoring(
          REPO_ROOT,
          good,
          ATTEMPT1_ROOT,
          ATTEMPT2_ROOT,
          ATTEMPT3_ROOT,
          undefined,
          ADJUDICATION,
        ),
      ).toThrow(ScoringSourceError);
    });

    it('emits byte-identical derived outputs on two separate derivations, into scratch only, with no raw model text, and never touches the real committed attempt-4 result', async () => {
      const { root } = buildSyntheticAttempt4Root();
      const outA = tmp('nwf-pe-f0s-out-a-');
      const outB = tmp('nwf-pe-f0s-out-b-');
      const committedDir = join(
        REPO_ROOT,
        'docs/evaluation/results/phase2b-2d2c-dev-attribution-attempt-4-gold-v1-adjudicated',
      );
      const committedBefore = existsSync(committedDir)
        ? readdirSync(committedDir)
            .sort()
            .map((name) => `${name}:${readFileSync(join(committedDir, name)).length}`)
        : null;
      const a = await generateAttempt4({
        attempt4Root: root,
        attempt1Root: ATTEMPT1_ROOT,
        attempt2Root: ATTEMPT2_ROOT,
        attempt3Root: ATTEMPT3_ROOT,
        out: outA,
        goldSupplement: SUPPLEMENT,
        ownerAdjudication: ADJUDICATION,
      });
      const b = await generateAttempt4({
        attempt4Root: root,
        attempt1Root: ATTEMPT1_ROOT,
        attempt2Root: ATTEMPT2_ROOT,
        attempt3Root: ATTEMPT3_ROOT,
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
      expect(summaryText).toContain('"attemptNo": 4');
      expect(
        readFileSync(join(outA, 'scored-items.jsonl'), 'utf8').split('\n').filter(Boolean),
      ).toHaveLength(245);
      expect(outA).not.toBe(committedDir);
      expect(outB).not.toBe(committedDir);
      const committedAfter = existsSync(committedDir)
        ? readdirSync(committedDir)
            .sort()
            .map((name) => `${name}:${readFileSync(join(committedDir, name)).length}`)
        : null;
      expect(committedAfter).toEqual(committedBefore);
    });
  },
);
