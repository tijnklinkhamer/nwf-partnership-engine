/**
 * PHASE 2B-2D2C-F9 — THE SCORING-ONLY ADAPTER FOR THE CLOSED F6 RESTART STUDY.
 *
 * The v2 scorer (`f2/scoreV2.ts`) is pure: it is handed `LoadedReplicateV2`
 * structures and never reads a file. No loader existed that builds those
 * structures from real v2 evidence — the Recovery-1 loader
 * (`scoring/replicationSources.ts`) is a v1 reader that refuses v2 by design.
 * This module is that missing loader, and nothing more:
 *
 *   - the F6 study context is rebuilt through the UNCHANGED
 *     `loadF7RestartStudyContext` (F2 freeze, F2 owner approval, F0O freeze,
 *     F6 freeze, F6 owner approval, F6 plan `197f25e1...`), and each slot's
 *     twelve planned evaluations come from the UNCHANGED, pure
 *     `f7EvaluationsOfSlot` over that verified plan (never the runner-plan
 *     builder, whose graph reaches the coordinator and provider);
 *   - the study root must hash, before any artifact is parsed, to the
 *     owner-pinned structural inventory (`computeRootInventory`);
 *   - every VALIDATED evaluation is read through the UNCHANGED
 *     `loadEvaluationDirectory`, the same artifact contract attempts 1-4 and
 *     Recovery-1 were held to;
 *   - the DEVELOPMENT gold is read through the UNCHANGED `loadGoldSupplement`,
 *     after every pinned input is refused-or-verified by path and hash;
 *   - every replicate is scored by the UNCHANGED `scoreReplicateV2`, with the
 *     F0O frozen gates the F2 freeze restates verbatim;
 *   - `F6_FINAL_DEV_DECISION_RULE_V1` is applied to the scorer's own outcomes.
 *
 * FAIL-CLOSED SCOPE. This adapter admits exactly the evaluation shape the
 * closed F6 study holds: every planned evaluation ended without a stop with
 * provider outcome OK. Any other shape (an observed timeout or
 * structured-output INVALID batch, or a terminal stop) is REFUSED here rather
 * than loaded by a path this study never exercised.
 *
 * Filesystem reads only. No network, no database, no provider, no auth, no
 * coordinator, no child process, no clock, no randomness, no writes.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, normalize, sep } from 'node:path';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import { ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION } from '../../../../orgunits/classify/constants.js';
import type { GoldCorpusItem } from '../../../../orgunits/classify/evaluation/goldSchema.js';
import { computeFinalInputSha256 } from '../../../../orgunits/classify/finalIdentity.js';
import { ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION } from '../../../../orgunits/classify/outputSchema.js';
import type { ClassifierDocument } from '../../../../orgunits/classify/types.js';
import { ORGUNIT_SIGNAL_RULE_VERSION } from '../../../../orgunits/signals/score.js';
import { ARTIFACT_FILE_NAMES } from '../artifacts.js';
import {
  type ReconstructedBatch,
  historicalRunProvenanceOf,
  reconstructFrozenBatches,
} from '../batches.js';
import {
  EXPECTED_CORPUS_ITEM_COUNT,
  EXPECTED_LOGICAL_BATCHES_PER_VARIANT,
  RELIABILITY_SEMANTICS_V2,
} from '../constants.js';
import { loadDevCorpus } from '../corpus.js';
import { F2_FREEZE_PATH, F2_APPROVAL_RECORD_PATH } from '../f2/freezeF2.js';
import { F2_VARIANT_NAME } from '../f2/studyPlanCoreF2.js';
import {
  scoreReplicateV2,
  type LoadedReplicateV2,
  type ReplicateEvaluationV2,
  type ScoredReplicateV2,
} from '../f2/scoreV2.js';
import { F0O_FREEZE_PATH } from '../f0o/freezeF0O.js';
import { computeRootInventory } from '../f6/rootInventoryF6.js';
import { F6_APPROVAL_RECORD_PATH, F6_FREEZE_PATH } from '../f6/freezeF6.js';
import { F4_V6_SLOT_ATTEMPT_NO } from '../f4/v6StudyContextF4.js';
import {
  F6_SLOTS,
  F6_STUDY_ID,
  F6_STUDY_ROOT,
  f6OutputRootPathOf,
  resolveF6Slot,
} from '../f6/studyPlanCoreF6.js';
import {
  f7EvaluationsOfSlot,
  loadF7RestartStudyContext,
  type F7RestartStudyContext,
} from '../f7/restartStudyContextF7.js';
import { sha256Hex } from '../freeze.js';
import { resolveGoldAvailability, type GoldAvailability } from '../scoring/gold.js';
import type { ReplicateTerminalCondition } from '../scoring/replicationSources.js';
import {
  ConsumptionSchema,
  ExperimentCompletionSchema,
  loadEvaluationDirectory,
  readVerified,
  ScoringSourceError,
  type PlannedEvaluationIdentity,
} from '../scoring/sources.js';
import type { GateOutcome } from '../scoring/summarise.js';
import { loadGoldSupplement, type LoadedGoldSupplement } from '../scoring/supplement.js';
import { F4_HOLDOUT_ITEM_COUNT } from '../scoring/constants.js';

export const F9_SCORING_RESULT_VERSION = 'phase2b-2d2c-f9-f6-dev-scoring-result-v1';
export const F9_DECISION_RULE_ID = 'F6_FINAL_DEV_DECISION_RULE_V1';

/** The owner-pinned execution identities of the closed F6 study (F8 structural closure). */
export const F9_EXECUTION_PINS = Object.freeze({
  executionBuildCommit: '911309ecce0621c2ea51b84eb68cf484d332dd4a',
  studyRootFileCount: 746,
  studyRootInventorySha256: '957533e48ada0ada4e25d4c8d1be5018ca3bdfbaf2d442dcd6c86a1d25e5c8f2',
  studyExecutionApprovalSha256: 'f325ba1968c28adb7e1bf0a5af4b6bb52d2e3489e0240e7f30c4a2f7dbc7e8d8',
  studyExecutionApprovalBytes: 4477,
  candidateAuthorisationSha256BySlot: Object.freeze({
    V6_RESTART_1: '23e54aab0320b265a245e7c44fedf80337bf51a575977497a2370b3fe4f14e6f',
    V6_RESTART_2: 'e33f057dc1b47859663b6f956289de5260d8e633a360a7ce5fb02c1a48719247',
    V6_RESTART_3: 'df6d3b25b5c7d4595abfcc247b4d80f156f8b61e4c47c71ab57dcf26a795cd00',
    V6_RESTART_4: '4177e3f672675c28d8ca8bbf7ecba53b76a221de27065a0796efdaa331397586',
    V6_RESTART_5: 'b8a77ee8a65d37f25f7fcc401ddf967e463ca6e93a0de6ca526a2935c1073863',
  } as Readonly<Record<string, string>>),
});

/** The owner-pinned DEVELOPMENT scoring inputs (F2 freeze `gold`). */
export const F9_GOLD_PINS = Object.freeze({
  devLabelsPath:
    'src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-dev-labels-v1.jsonl',
  devLabelsRawSha256: '19d9cc3e9dcfe0b10930aa095075cd4828459377d9ea67c8dd296da6126fcd08',
  devLabelsRawBytes: 50486,
  devLabelsManifestPath:
    'src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-dev-labels-v1.manifest.json',
  devLabelsManifestRawSha256: '53801e48498777727af719cd67cef09f3865617b15283b9e3d24daa4d884d519',
  scoringSupplementPath: 'docs/evaluation/PHASE_2B_2D2C_DEV_SCORING_SUPPLEMENT_V1.json',
  scoringSupplementRawSha256: 'dd00e1653deac617eb6ba82e537f090b34de37de5c939a0e52c0466fdc874db5',
});

/** The six frozen DEV gates, in the scorer's own order. */
export const F9_SIX_FROZEN_GATES = Object.freeze([
  'minSchemaValidSpanVerifiedRate',
  'minUnitPageRecall',
  'minUnitPagePrecision',
  'minUnitTypeAccuracy',
  'minHardNegativeRejection',
  'maxNeedsReviewRate',
]);

function fail(message: string): never {
  throw new ScoringSourceError(`F9: ${message}`);
}

function readRepo(repoRoot: string, relativePath: string): Buffer {
  return readFileSync(join(repoRoot, relativePath));
}

/**
 * Refuses, by path and BEFORE any read, every file the F2 freeze lists as
 * never-read or forbidden, and any path naming a holdout or adjudication
 * source.
 */
export function refuseForbiddenF9Source(
  relativePath: string,
  forbiddenPaths: readonly string[],
): void {
  const normalised = normalize(relativePath).split(sep).join('/');
  if (forbiddenPaths.map((p) => normalize(p).split(sep).join('/')).includes(normalised)) {
    fail(`${relativePath} is a file the F2 freeze forbids; it is never opened.`);
  }
  if (/holdout/i.test(normalised) || /adjudication/i.test(basename(normalised))) {
    fail(`${relativePath} names a holdout or adjudication source; it is never opened.`);
  }
}

function readPinnedRepoFile(
  repoRoot: string,
  relativePath: string,
  rawSha256: string,
  forbidden: readonly string[],
  rawBytes?: number,
): { readonly rawSha256: string; readonly rawBytes: number } {
  refuseForbiddenF9Source(relativePath, forbidden);
  const bytes = readRepo(repoRoot, relativePath);
  const actual = sha256Hex(bytes);
  if (actual !== rawSha256) fail(`${relativePath} hashes to ${actual}; ${rawSha256} is pinned.`);
  if (rawBytes !== undefined && bytes.length !== rawBytes) {
    fail(`${relativePath} is ${bytes.length} bytes; ${rawBytes} are pinned.`);
  }
  return { rawSha256: actual, rawBytes: bytes.length };
}

export interface F9StudyContext {
  readonly study: F7RestartStudyContext;
  readonly corpusRows: readonly GoldCorpusItem[];
  readonly corpusRawSha256: string;
  readonly corpusManifestRawSha256: string;
  readonly corpusContentSha256: string;
  readonly batches: readonly ReconstructedBatch[];
  readonly gates: Readonly<Record<string, number>>;
  readonly forbiddenPaths: readonly string[];
}

/** Gold-free: the verified F6 study context, corpus, frozen batches and frozen gates. */
export function loadF9StudyContext(repoRoot: string): F9StudyContext {
  const study = loadF7RestartStudyContext({
    f2FreezeBytes: readRepo(repoRoot, F2_FREEZE_PATH),
    f2OwnerFreezeApprovalBytes: readRepo(repoRoot, F2_APPROVAL_RECORD_PATH),
    f0oFreezeBytes: readRepo(repoRoot, F0O_FREEZE_PATH),
    f6FreezeBytes: readRepo(repoRoot, F6_FREEZE_PATH),
    f6OwnerFreezeApprovalBytes: readRepo(repoRoot, F6_APPROVAL_RECORD_PATH),
  });
  const f2 = study.f4.f2Freeze as unknown as {
    corpus: {
      holdoutFilesNeverRead: string[];
      additionalForbiddenFilesForThisStudy: string[];
    };
    sixFrozenDevGates: Record<string, number>;
  };
  const forbiddenPaths = [
    ...f2.corpus.holdoutFilesNeverRead,
    ...f2.corpus.additionalForbiddenFilesForThisStudy,
  ];
  const corpus = loadDevCorpus(
    study.f4.f2Freeze as unknown as Parameters<typeof loadDevCorpus>[0],
    {
      read: (relative) => {
        refuseForbiddenF9Source(relative, forbiddenPaths);
        return readRepo(repoRoot, relative);
      },
    },
  );
  if (corpus.rows.length !== EXPECTED_CORPUS_ITEM_COUNT) {
    fail(`the DEVELOPMENT corpus holds ${corpus.rows.length} items.`);
  }
  const batches = reconstructFrozenBatches(
    corpus.rows,
    {
      canonicalStringify,
      computeFinalInputSha256,
      ruleVersion: ORGUNIT_SIGNAL_RULE_VERSION,
      assemblyVersion: ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION,
      outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
    },
    // The fetch-policy version is HISTORICAL RUN PROVENANCE, and it is read
    // from the F0O freeze rather than from the F2 one on purpose: F2 carries no
    // `inputConstruction` and no batch plan of its own - its own `batching`
    // block records `inheritedFrom: "attempt-4 (F0O) execution plan"` and pins
    // the F0O freeze by path and raw SHA-256. The partition being reconstructed
    // here IS the F0O partition, so its provenance is the F0O freeze's.
    historicalRunProvenanceOf(study.f4.f0oFreeze),
  );
  const f0oGates = study.f4.f0oFreeze.scoring.gates;
  if (canonicalStringify(f0oGates) !== canonicalStringify(f2.sixFrozenDevGates)) {
    fail('the F2 freeze does not restate the F0O frozen gates verbatim.');
  }
  const f6Gates = study.f6Freeze as unknown as { sixFrozenDevGates: Record<string, number> };
  for (const gate of F9_SIX_FROZEN_GATES) {
    if (typeof f0oGates[gate] !== 'number' || f6Gates.sixFrozenDevGates[gate] !== f0oGates[gate]) {
      fail(`frozen gate ${gate} differs between the F6 freeze and the F0O/F2 gates.`);
    }
  }
  return {
    study,
    corpusRows: corpus.rows,
    corpusRawSha256: corpus.corpusRawSha256,
    corpusManifestRawSha256: corpus.manifestRawSha256,
    corpusContentSha256: corpus.contentSha256,
    batches,
    gates: f0oGates,
    forbiddenPaths,
  };
}

function envelopeRecord(path: string): Record<string, unknown> {
  const envelope = JSON.parse(readFileSync(path).toString('utf8')) as {
    record?: Record<string, unknown>;
    recordSha256?: unknown;
  };
  if (
    envelope.record === undefined ||
    sha256Hex(canonicalStringify(envelope.record)) !== envelope.recordSha256
  ) {
    fail(`${path} fails its own recorded hash.`);
  }
  return envelope.record;
}

function sameList(a: readonly unknown[], b: readonly unknown[]): boolean {
  return canonicalStringify(a) === canonicalStringify(b);
}

/** Loads ONE closed F6 slot into the structure `scoreReplicateV2` consumes. */
export function loadF9Replicate(
  context: F9StudyContext,
  slotId: string,
  outputRoot: string,
): LoadedReplicateV2 {
  const pins = F9_EXECUTION_PINS;
  const candidate =
    pins.candidateAuthorisationSha256BySlot[slotId] ?? fail(`${slotId} is not an F6 slot.`);
  const slot = resolveF6Slot(slotId);
  const plannedEvaluations = f7EvaluationsOfSlot(context.study, slotId);
  const attemptNo = F4_V6_SLOT_ATTEMPT_NO;
  const freezeRawSha256 = context.study.f6FreezeRawSha256;

  const top = readdirSync(outputRoot).sort();
  if (
    !sameList(top, ['authorisations', 'evaluations', 'experiments', 'study-slot-identity.json'])
  ) {
    fail(`${outputRoot} holds ${top.join(', ')}.`);
  }

  const identity = envelopeRecord(join(outputRoot, 'study-slot-identity.json'));
  const expectedIdentity: Record<string, unknown> = {
    studyId: F6_STUDY_ID,
    slotId,
    sequence: slot.sequence,
    replicateNumber: slot.replicateNumber,
    variantName: F2_VARIANT_NAME,
    attemptNo,
    f6FreezeRawSha256: freezeRawSha256,
    f6PlanSha256: context.study.f6PlanSha256,
    f6OwnerFreezeApprovalRawSha256: context.study.f6OwnerFreezeApprovalRawSha256,
    reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V2,
    executionBuildCommit: pins.executionBuildCommit,
    candidateAuthorisationSha256: candidate,
    studyExecutionApprovalSha256: pins.studyExecutionApprovalSha256,
    outputRoot,
  };
  for (const [field, value] of Object.entries(expectedIdentity)) {
    if (identity[field] !== value)
      fail(`${outputRoot}: slot identity ${field} is not ${String(value)}.`);
  }
  if (
    !sameList(
      identity['plannedFinalInputSha256'] as unknown[],
      plannedEvaluations.map((e) => e.finalInputSha256),
    )
  ) {
    fail(`${outputRoot}: slot identity plans different final inputs.`);
  }

  const experiments = readdirSync(join(outputRoot, 'experiments')).sort();
  if (!sameList(experiments, [`attempt-${attemptNo}`])) {
    fail(`${outputRoot}: experiments/ holds ${experiments.join(', ')}.`);
  }
  const experimentDirectory = join(outputRoot, 'experiments', `attempt-${attemptNo}`);
  const experimentFiles = readdirSync(experimentDirectory).sort();
  if (
    !sameList(
      experimentFiles,
      [ARTIFACT_FILE_NAMES.EXPERIMENT_COMPLETION, ARTIFACT_FILE_NAMES.EXPERIMENT_MANIFEST].sort(),
    )
  ) {
    fail(
      `${outputRoot}: the adapter admits only a completed experiment; found ${experimentFiles.join(', ')}.`,
    );
  }
  const manifest = readVerified<Record<string, unknown>>(
    experimentDirectory,
    'EXPERIMENT_MANIFEST',
  ).record;
  const binding = manifest['studyBinding'] as Record<string, unknown> | undefined;
  if (
    manifest['freezeConfigRawSha256'] !== freezeRawSha256 ||
    manifest['attemptNo'] !== attemptNo ||
    manifest['plannedLogicalEvaluations'] !== EXPECTED_LOGICAL_BATCHES_PER_VARIANT ||
    !sameList(Object.keys(manifest['variantRoots'] as object).sort(), [F2_VARIANT_NAME]) ||
    manifest['authorisationSha256'] !== candidate ||
    binding?.['studyId'] !== F6_STUDY_ID ||
    binding['slotId'] !== slotId ||
    binding['f6PlanSha256'] !== context.study.f6PlanSha256 ||
    binding['executionBuildCommit'] !== pins.executionBuildCommit ||
    binding['candidateAuthorisationSha256'] !== candidate ||
    binding['studyExecutionApprovalSha256'] !== pins.studyExecutionApprovalSha256 ||
    binding['corpusContentSha256'] !== context.corpusContentSha256
  ) {
    fail(`${outputRoot}: the experiment manifest is not the frozen ${slotId} experiment.`);
  }
  const completionRecord = readVerified(experimentDirectory, 'EXPERIMENT_COMPLETION').record;
  const completion = ExperimentCompletionSchema.parse(completionRecord);
  if (
    completion.status !== 'COMPLETED_ALL_PLANNED' ||
    completion.evaluationsStarted !== EXPECTED_LOGICAL_BATCHES_PER_VARIANT ||
    !sameList(Object.entries(completion.perVariantEndedWithoutStop), [
      [F2_VARIANT_NAME, EXPECTED_LOGICAL_BATCHES_PER_VARIANT],
    ])
  ) {
    fail(`${outputRoot}: the completion record does not complete all twelve planned evaluations.`);
  }

  const markers = readdirSync(join(outputRoot, 'authorisations'));
  if (!sameList(markers, [`${candidate}.json`])) {
    fail(`${outputRoot}: authorisations/ holds ${markers.join(', ')}.`);
  }
  const marker = ConsumptionSchema.parse(
    envelopeRecord(join(outputRoot, 'authorisations', markers[0]!)),
  );
  if (marker.authorisationSha256 !== candidate || marker.attemptNo !== attemptNo) {
    fail(`${outputRoot}: the consumption marker names another authorisation or attempt.`);
  }

  if (!sameList(readdirSync(join(outputRoot, 'evaluations')).sort(), [F2_VARIANT_NAME])) {
    fail(`${outputRoot}: evaluations/ must hold exactly ${F2_VARIANT_NAME}.`);
  }
  const variantDirectory = join(outputRoot, 'evaluations', F2_VARIANT_NAME);
  const plannedBatchDirs = plannedEvaluations.map(
    (e) => `batch-${String(e.logicalBatchOrdinal).padStart(2, '0')}`,
  );
  if (!sameList(readdirSync(variantDirectory).sort(), [...plannedBatchDirs].sort())) {
    fail(`${outputRoot}: the batch directories are not exactly the twelve planned evaluations.`);
  }

  const evaluations: ReplicateEvaluationV2[] = plannedEvaluations.map((runnerEvaluation, index) => {
    if (
      runnerEvaluation.slotId !== slotId ||
      runnerEvaluation.sequenceWithinReplicate !== index + 1 ||
      runnerEvaluation.variantName !== F2_VARIANT_NAME
    ) {
      fail(`${slotId}: planned evaluation ${index + 1} is not in the frozen F6 order.`);
    }
    const planned: PlannedEvaluationIdentity = {
      sequence: runnerEvaluation.sequenceWithinReplicate,
      variantName: runnerEvaluation.variantName,
      logicalBatchOrdinal: runnerEvaluation.logicalBatchOrdinal,
      organisationId: runnerEvaluation.organisationId,
      echeRowKey: runnerEvaluation.echeRowKey,
      orderedGoldIds: runnerEvaluation.orderedGoldIds,
      orderedDocIndices: runnerEvaluation.orderedDocIndices,
      promptVersion: runnerEvaluation.promptVersion,
      promptSha256: runnerEvaluation.promptSha256,
      variantGitCommit: runnerEvaluation.variantGitCommit,
      finalInputSha256: runnerEvaluation.finalInputSha256,
    };
    const batchDirectory = join(variantDirectory, plannedBatchDirs[index]!);
    const directory = join(batchDirectory, `attempt-${attemptNo}`);
    const stop = readVerified<{ stop: boolean }>(directory, 'STOP_DECISION').record;
    const provider = readVerified<{ outcome: string }>(directory, 'PROVIDER_OUTCOME').record;
    if (stop.stop !== false || provider.outcome !== 'OK') {
      fail(
        `${directory}: the F9 adapter admits only evaluations that ended without a stop with provider outcome OK; ` +
          `found stop=${String(stop.stop)} outcome=${provider.outcome}.`,
      );
    }
    const frozenBatch =
      context.batches.find((b) => b.ordinal === runnerEvaluation.logicalBatchOrdinal) ??
      fail(`${batchDirectory}: no frozen batch ${runnerEvaluation.logicalBatchOrdinal}.`);
    if (frozenBatch.assemblyInputSha256 !== runnerEvaluation.assemblyInputSha256) {
      fail(
        `${batchDirectory}: the reconstructed batch assembly identity differs from the F6 plan.`,
      );
    }
    const loaded = loadEvaluationDirectory({
      batchDirectory,
      attemptNo,
      planned,
      freezeRawSha256,
      frozenBatch: {
        context: frozenBatch.context,
        documents: frozenBatch.documents as unknown as readonly ClassifierDocument[],
      },
    });
    return { state: 'VALIDATED', planned, evaluation: loaded.evaluation };
  });

  const terminalCondition: ReplicateTerminalCondition = {
    kind: 'EXPERIMENT_COMPLETION',
    status: completion.status,
    completedAtUtc: completion.completedAtUtc,
    recordSha256: sha256Hex(canonicalStringify(completionRecord)),
  };
  return {
    slotId,
    variantName: F2_VARIANT_NAME,
    outputRoot,
    replicateStatus: 'COMPLETE',
    terminalCondition,
    reliabilitySemanticsVersion: manifest['reliabilitySemanticsVersion'] as string,
    evaluations,
  };
}

/** Splits a finite decimal literal into an exact integer ratio. */
export function exactRatioOf(value: number): {
  readonly numerator: bigint;
  readonly denominator: bigint;
} {
  const text = String(value);
  if (!/^\d+(\.\d+)?$/.test(text)) fail(`threshold ${text} is not a plain decimal.`);
  const [whole, fraction = ''] = text.split('.');
  return {
    numerator: BigInt(`${whole}${fraction}`),
    denominator: 10n ** BigInt(fraction.length),
  };
}

export interface F9GateResult {
  readonly gate: string;
  readonly comparator: '>=' | '<=';
  readonly threshold: number;
  readonly numerator: number | null;
  readonly denominator: number;
  readonly observed: number | null;
  readonly scorerMet: boolean | null;
  readonly exactRationalMet: boolean | null;
  readonly outcome: 'PASS' | 'FAIL';
  readonly note: string;
}

/**
 * Restates one frozen gate outcome with its exact integer numerator and an
 * exact-rational re-evaluation. The scorer's own `met` is authoritative; the
 * rational check must AGREE with it or the adapter refuses. An unmeasured gate
 * is FAIL.
 */
export function exactGateResultOf(outcome: GateOutcome): F9GateResult {
  const comparator = outcome.gate.startsWith('max') ? '<=' : '>=';
  let numerator: number | null = null;
  let exactRationalMet: boolean | null = null;
  if (outcome.observed !== null) {
    numerator = Math.round(outcome.observed * outcome.denominator);
    if (numerator / outcome.denominator !== outcome.observed) {
      fail(
        `${outcome.gate}: observed ${outcome.observed} is not an exact ratio over ${outcome.denominator}.`,
      );
    }
    const t = exactRatioOf(outcome.threshold);
    const left = BigInt(numerator) * t.denominator;
    const right = t.numerator * BigInt(outcome.denominator);
    exactRationalMet = comparator === '>=' ? left >= right : left <= right;
  }
  if (exactRationalMet !== outcome.met) {
    fail(`${outcome.gate}: the exact rational comparison disagrees with the frozen scorer.`);
  }
  return {
    gate: outcome.gate,
    comparator,
    threshold: outcome.threshold,
    numerator,
    denominator: outcome.denominator,
    observed: outcome.observed,
    scorerMet: outcome.met,
    exactRationalMet,
    outcome: outcome.met === true ? 'PASS' : 'FAIL',
    note: outcome.note,
  };
}

export type F9StudyDecision = 'DEV_READY_FOR_HOLDOUT' | 'DEV_NOT_READY_FOR_HOLDOUT';

/** `F6_FINAL_DEV_DECISION_RULE_V1`, mechanically: 5/5 COMPLETE AND 5/5 pass every frozen gate. */
export function applyF6FinalDevDecisionRule(
  replicates: readonly Pick<ScoredReplicateV2, 'slotId' | 'replicateStatus' | 'gateVector'>[],
): {
  readonly decision: F9StudyDecision;
  readonly completeReplicates: number;
  readonly replicatesPassingAllSixGates: number;
} {
  if (
    !sameList(
      replicates.map((r) => r.slotId),
      F6_SLOTS.map((s) => s.slotId),
    )
  ) {
    fail('the decision rule applies only to exactly the five F6 slots in frozen order.');
  }
  const complete = replicates.filter((r) => r.replicateStatus === 'COMPLETE').length;
  const passing = replicates.filter(
    (r) =>
      r.replicateStatus === 'COMPLETE' &&
      r.gateVector.kind === 'NUMERIC' &&
      r.gateVector.devGateOutcome === 'FROZEN_GATES_PASSED_ON_DEV' &&
      F9_SIX_FROZEN_GATES.every(
        (gate) =>
          r.gateVector.kind === 'NUMERIC' &&
          r.gateVector.metrics.gates.find((g) => g.gate === gate)?.met === true,
      ),
  ).length;
  return {
    decision:
      complete === F6_SLOTS.length && passing === F6_SLOTS.length
        ? 'DEV_READY_FOR_HOLDOUT'
        : 'DEV_NOT_READY_FOR_HOLDOUT',
    completeReplicates: complete,
    replicatesPassingAllSixGates: passing,
  };
}

export interface F9GoldInputs {
  readonly supplement: LoadedGoldSupplement;
  readonly availability: GoldAvailability;
  readonly preservedGoldId: string;
  readonly preservedLabel: string;
  readonly devLabels: { readonly rawSha256: string; readonly rawBytes: number };
  readonly devLabelsManifest: { readonly rawSha256: string; readonly rawBytes: number };
  readonly scoringSupplement: { readonly rawSha256: string; readonly rawBytes: number };
}

/** Opens the pinned DEVELOPMENT gold. Every input is refused-or-verified by path and hash first. */
export function loadF9GoldInputs(repoRoot: string, context: F9StudyContext): F9GoldInputs {
  const f2Gold = (context.study.f4.f2Freeze as unknown as { gold: Record<string, unknown> }).gold;
  const f0o = context.study.f4.f0oFreeze as unknown as {
    scoring: {
      scoringInputs: {
        devLabelsFixture: { path: string; rawSha256: string };
        scoringSupplement: { path: string; rawSha256: string };
      };
      comparatorPolicy: { attempt1: { freezeRawSha256: string; artifactInventorySha256: string } };
    };
    unresolvedGold: { goldId: string; committedLabel: string };
  };
  const pins = F9_GOLD_PINS;
  if (
    f2Gold['devLabelsPath'] !== pins.devLabelsPath ||
    f2Gold['devLabelsRawSha256'] !== pins.devLabelsRawSha256 ||
    f2Gold['devLabelsRawBytes'] !== pins.devLabelsRawBytes ||
    f2Gold['devLabelsManifestPath'] !== pins.devLabelsManifestPath ||
    f2Gold['devLabelsManifestRawSha256'] !== pins.devLabelsManifestRawSha256 ||
    f2Gold['scoringSupplementPath'] !== pins.scoringSupplementPath ||
    f2Gold['scoringSupplementRawSha256'] !== pins.scoringSupplementRawSha256 ||
    f0o.scoring.scoringInputs.devLabelsFixture.path !== pins.devLabelsPath ||
    f0o.scoring.scoringInputs.devLabelsFixture.rawSha256 !== pins.devLabelsRawSha256 ||
    f0o.scoring.scoringInputs.scoringSupplement.path !== pins.scoringSupplementPath ||
    f0o.scoring.scoringInputs.scoringSupplement.rawSha256 !== pins.scoringSupplementRawSha256
  ) {
    fail(
      'the owner-pinned gold inputs differ from the F2 freeze or the inherited F0O scoring inputs.',
    );
  }
  const forbidden = context.forbiddenPaths;
  const scoringSupplement = readPinnedRepoFile(
    repoRoot,
    pins.scoringSupplementPath,
    pins.scoringSupplementRawSha256,
    forbidden,
  );
  const devLabels = readPinnedRepoFile(
    repoRoot,
    pins.devLabelsPath,
    pins.devLabelsRawSha256,
    forbidden,
    pins.devLabelsRawBytes,
  );
  const devLabelsManifest = readPinnedRepoFile(
    repoRoot,
    pins.devLabelsManifestPath,
    pins.devLabelsManifestRawSha256,
    forbidden,
  );
  const corpusGoldIds = context.corpusRows.map((row) => row.goldId);
  const attempt1 = f0o.scoring.comparatorPolicy.attempt1;
  const supplement = loadGoldSupplement(repoRoot, pins.scoringSupplementPath, {
    freezeRawSha256: attempt1.freezeRawSha256,
    artifactInventorySha256: attempt1.artifactInventorySha256,
    goldIds: corpusGoldIds,
  });
  if (
    supplement.supplementRawSha256 !== pins.scoringSupplementRawSha256 ||
    supplement.fixturePath !== pins.devLabelsPath ||
    supplement.fixtureRawSha256 !== pins.devLabelsRawSha256 ||
    supplement.fixtureManifestRawSha256 !== pins.devLabelsManifestRawSha256 ||
    supplement.labelCount !== EXPECTED_CORPUS_ITEM_COUNT
  ) {
    fail('the loaded supplement does not name exactly the pinned DEVELOPMENT label fixture.');
  }
  const unresolved = f0o.unresolvedGold;
  if (supplement.labelByGoldId.get(unresolved.goldId)?.verdict !== unresolved.committedLabel) {
    fail(`the supplement does not preserve ${unresolved.goldId} as ${unresolved.committedLabel}.`);
  }
  const availability = resolveGoldAvailability({
    freezePreservedVerdictGoldIds: [unresolved.goldId],
    labelFileRecordCount: EXPECTED_CORPUS_ITEM_COUNT + F4_HOLDOUT_ITEM_COUNT,
    devItemCount: EXPECTED_CORPUS_ITEM_COUNT,
    supplement: {
      path: supplement.supplementPath,
      fixturePath: supplement.fixturePath,
      itemCount: supplement.labelCount,
    },
  });
  return {
    supplement,
    availability,
    preservedGoldId: unresolved.goldId,
    preservedLabel: unresolved.committedLabel,
    devLabels,
    devLabelsManifest,
    scoringSupplement,
  };
}

/** Structural pin of the whole closed study root, checked before and after scoring. */
export function assertF9StudyRootPinned(studyRoot: string): {
  readonly fileCount: number;
  readonly inventorySha256: string;
} {
  const inventory = computeRootInventory(studyRoot);
  if (
    inventory.nonRegularEntries.length !== 0 ||
    inventory.fileCount !== F9_EXECUTION_PINS.studyRootFileCount ||
    inventory.inventorySha256 !== F9_EXECUTION_PINS.studyRootInventorySha256
  ) {
    fail(
      `the study root is ${inventory.fileCount} files hashing to ${inventory.inventorySha256}; ` +
        `${F9_EXECUTION_PINS.studyRootFileCount} files hashing to ${F9_EXECUTION_PINS.studyRootInventorySha256} are pinned.`,
    );
  }
  return { fileCount: inventory.fileCount, inventorySha256: inventory.inventorySha256 };
}

export interface F9ScoringRun {
  readonly context: F9StudyContext;
  readonly gold: F9GoldInputs;
  readonly replicates: readonly ScoredReplicateV2[];
  readonly gateResults: readonly {
    readonly slotId: string;
    readonly gates: readonly F9GateResult[];
  }[];
  readonly decision: ReturnType<typeof applyF6FinalDevDecisionRule>;
  readonly studyRootInventory: { readonly fileCount: number; readonly inventorySha256: string };
}

/**
 * The one F9 scoring pass. The study root is pinned and every slot loaded
 * (gold-free) BEFORE the gold is opened.
 */
export function runF9F6DevScoring(repoRoot: string): F9ScoringRun {
  const studyRootInventory = assertF9StudyRootPinned(F6_STUDY_ROOT);
  const context = loadF9StudyContext(repoRoot);
  const loaded = F6_SLOTS.map((slot) =>
    loadF9Replicate(context, slot.slotId, f6OutputRootPathOf(slot)),
  );
  const gold = loadF9GoldInputs(repoRoot, context);
  const preserved = {
    verdictByGoldId: new Map<string, string>([[gold.preservedGoldId, gold.preservedLabel]]),
    labelByGoldId: gold.supplement.labelByGoldId,
  };
  const replicates = loaded.map((replicate) =>
    scoreReplicateV2(replicate, context.corpusRows, gold.availability, preserved, context.gates),
  );
  const gateResults = replicates.map((replicate) => {
    if (replicate.items.length !== EXPECTED_CORPUS_ITEM_COUNT) {
      fail(`${replicate.slotId} yielded ${replicate.items.length} item results.`);
    }
    if (replicate.gateVector.kind !== 'NUMERIC') fail(`${replicate.slotId} has no gate vector.`);
    const byName = replicate.gateVector.metrics.gates;
    const gates = F9_SIX_FROZEN_GATES.map((name) =>
      exactGateResultOf(
        byName.find((g) => g.gate === name) ?? fail(`${replicate.slotId} lacks gate ${name}.`),
      ),
    );
    return { slotId: replicate.slotId, gates };
  });
  const decision = applyF6FinalDevDecisionRule(replicates);
  assertF9StudyRootPinned(F6_STUDY_ROOT);
  return { context, gold, replicates, gateResults, decision, studyRootInventory };
}
