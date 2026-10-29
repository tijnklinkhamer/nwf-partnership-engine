/**
 * PHASE 2B-2D2C-F0X RECOVERY-1 — REQUEST-FREE POST-EXECUTION INVENTORY.
 *
 * Recovery-1 executed 2026-09-16 under owner authorisation and wrote a
 * `COMPLETED_ALL_SLOTS` study terminal. That record means "all ten frozen
 * slots reached a durably closed Class C state", NOT "all 120 logical
 * evaluations completed". This module pins the preserved evidence without
 * changing it and re-derives every execution count from the artifacts
 * themselves, so the closure never rests on an operator report:
 *
 *   - every file's SHA-256, a whole-study tree fingerprint and a per-slot
 *     tree fingerprint (the same `"<sha>  <path>\n"` fingerprint the
 *     failed-study inventory uses);
 *   - the study manifest, terminal and events, each `recordSha256`
 *     recomputed rather than trusted;
 *   - per slot: outer identity, consumption marker, experiment manifest,
 *     completion or stop, and per evaluation the original provider outcome,
 *     adapter attempts, auth-status invocations, Tier-1 diagnostics, Tier-2
 *     outcome, stop decision and repair calls;
 *   - each slot's inclusion class and durable closure, from the SAME
 *     `classifySlotEvidence` the executor used.
 *
 * It parses ONLY execution-control records: study/slot/experiment records,
 * `planned-input.json` (identity and document count), `provider-outcome.json`,
 * `stop-decision.json`, `tier2-outcome.json`, `repair-round.json`, and from
 * each repair only `repair-outcome.json`'s disposition and
 * `repair-provider-outcome.json`. Validation results, raw output checkpoints,
 * final records and repair validation/raw records are hashed as opaque bytes
 * and never parsed: this inventory carries no classifier verdict. No
 * network, no database, no child process, no provider, no gold or scoring
 * module.
 *
 *   node --import tsx src/test/harness/phase2b2d2c/f0x/recovery1ExecutionInventory.ts \
 *     --study-root <dir> --control-root <dir>
 */
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { F0V_SLOTS, F0V_TOTAL_SLOTS, futureOutputRootPathOf } from '../f0v/studyPlanCore.js';
import {
  classifySlotEvidence,
  inclusionClassOf,
  type SlotInclusionClass,
} from '../f0w/sequencing.js';
import {
  createReadOnlyInventoryProbes,
  pinRecord,
  treeFingerprint,
  type InventoryProbes,
  type PinnedRecord,
} from './failedStudyInventory.js';

export const RECOVERY_1_EXECUTION_INVENTORY_VERSION =
  'phase2b-2d2c-f0x-recovery-1-execution-inventory-v1';
export const RECOVERY_1_EXECUTION_INVENTORY_PATH =
  'docs/evaluation/PHASE_2B_2D2C_F0X_RECOVERY_1_EXECUTION_INVENTORY_V1.json';
export const RECOVERY_1_EXECUTION_INVENTORY_RAW_SHA256 =
  '61495b71d5a3702502708c1b19ee9fdbbad82e294ef359d79d496ed2b8477070';

const EVALUATION_ATTEMPT_PATTERN =
  /^evaluations\/([A-Z0-9_]+)\/batch-([0-9]{2})\/attempt-([1-9][0-9]*)\/([^/]+)$/;
const REPAIR_FILE_PATTERN =
  /^evaluations\/([A-Z0-9_]+)\/batch-([0-9]{2})\/attempt-([1-9][0-9]*)\/repair-1\/(?:doc-([0-9]+)\/)?([^/]+)$/;

export interface PinnedEnvelope extends PinnedRecord {
  readonly record: Readonly<Record<string, unknown>> | null;
}

export interface RepairCallInventory {
  readonly docIndex: number;
  readonly disposition: unknown;
  readonly providerRequestSent: unknown;
  readonly providerOutcome: unknown;
  readonly adapterAttempts: unknown;
  readonly authStatusInvocations: unknown;
  readonly monotonicWallTimeMs: unknown;
  readonly recordsVerified: boolean;
}

export interface EvaluationInventory {
  readonly logicalBatchOrdinal: number;
  readonly attemptNo: number;
  readonly fileCount: number;
  readonly files: readonly string[];
  readonly documents: number | null;
  readonly providerOutcome: unknown;
  readonly providerOutcomeDetail: unknown;
  readonly providerReportedModelId: unknown;
  readonly adapterAttempts: unknown;
  readonly authStatusInvocations: unknown;
  readonly monotonicWallTimeMs: unknown;
  readonly tier1DiagnosticsCaptured: unknown;
  readonly tier2Outcome: unknown;
  readonly tier2ExitCode: unknown;
  readonly tier2HardKillDisposition: unknown;
  readonly tier2GracePhaseVerdict: unknown;
  readonly stop: unknown;
  readonly stopCondition: unknown;
  readonly haltKind: unknown;
  readonly endedWithoutStop: boolean;
  readonly validationResultPresent: boolean;
  readonly rawOutputCheckpointPresent: boolean;
  readonly repairRound: {
    readonly planned: unknown;
    readonly executed: unknown;
    readonly accepted: unknown;
    readonly rejected: unknown;
    readonly providerFailed: unknown;
    readonly skipped: unknown;
    readonly excluded: unknown;
  } | null;
  readonly repairCalls: readonly RepairCallInventory[];
  readonly everyParsedRecordVerified: boolean;
}

export interface SlotExecutionInventory {
  readonly slotId: string;
  readonly sequence: number;
  readonly pairNumber: number;
  readonly variantName: string;
  readonly outputRoot: string;
  readonly fileCount: number;
  readonly treeSha256: string;
  readonly candidateAuthorisationSha256: unknown;
  readonly candidateMatchesStudyManifest: boolean;
  readonly outerSlotIdentity: PinnedRecord | null;
  readonly consumptionMarkers: readonly PinnedRecord[];
  readonly experiment: {
    readonly attemptDirectories: readonly string[];
    readonly manifest: PinnedEnvelope | null;
    readonly completion: PinnedEnvelope | null;
    readonly stop: PinnedEnvelope | null;
    readonly terminalKind: 'COMPLETION' | 'STOP' | 'NONE' | 'BOTH';
  };
  readonly evaluations: readonly EvaluationInventory[];
  readonly counts: {
    readonly evaluationsPlanned: unknown;
    readonly evaluationsStarted: number;
    readonly evaluationsEndedWithoutStop: number;
    readonly evaluationsEndedWithStop: number;
    readonly documentsInStartedEvaluations: number;
    readonly originalProviderRequests: number;
    readonly repairProviderRequests: number;
    readonly providerRequests: number;
    readonly adapterAttempts: number;
    readonly authStatusInvocations: number;
    readonly originalOutcomes: Readonly<Record<string, number>>;
    readonly tier2Outcomes: Readonly<Record<string, number>>;
    readonly tier1DiagnosticsCaptured: number;
    readonly repairCallsByDisposition: Readonly<Record<string, number>>;
  };
  readonly studyEvents: readonly {
    readonly path: string;
    readonly event: unknown;
    readonly fileSha256: string;
    readonly recordSha256Verified: boolean;
  }[];
  readonly inclusion: {
    readonly disposition: string;
    readonly inclusionClass: SlotInclusionClass;
    readonly durablyClosed: boolean;
    readonly detail: string;
  };
}

export interface Recovery1ExecutionInventory {
  readonly inventoryVersion: typeof RECOVERY_1_EXECUTION_INVENTORY_VERSION;
  readonly requestFree: true;
  readonly parsesClassifierVerdicts: false;
  readonly studyRoot: string;
  readonly wholeStudyTree: { readonly fileCount: number; readonly treeSha256: string };
  readonly studyLevelFiles: readonly string[];
  readonly studyManifest: PinnedEnvelope | null;
  readonly studyTerminal: PinnedEnvelope | null;
  readonly studyEvents: readonly {
    readonly path: string;
    readonly fileSha256: string;
    readonly recordSha256: string | null;
    readonly recordSha256Verified: boolean;
  }[];
  readonly control: {
    readonly controlRoot: string;
    readonly fileCount: number;
    readonly treeSha256: string;
    readonly files: readonly { readonly path: string; readonly fileSha256: string }[];
  } | null;
  readonly slots: readonly SlotExecutionInventory[];
  readonly totals: {
    readonly slotsPresent: number;
    readonly evaluationsPlanned: number;
    readonly evaluationsStarted: number;
    readonly evaluationsEndedWithoutStop: number;
    readonly evaluationsEndedWithStop: number;
    readonly originalProviderRequests: number;
    readonly repairProviderRequests: number;
    readonly providerRequests: number;
    readonly adapterAttempts: number;
    readonly authStatusInvocations: number;
    readonly originalOutcomes: Readonly<Record<string, number>>;
    readonly tier2Outcomes: Readonly<Record<string, number>>;
    readonly repairCallsByDisposition: Readonly<Record<string, number>>;
    readonly slotsWithCompletion: number;
    readonly slotsWithStop: number;
    readonly classA: number;
    readonly classB: number;
    readonly classC: number;
    readonly ambiguous: number;
    readonly durablyClosed: number;
    readonly everyParsedRecordVerified: boolean;
  };
}

/** Opaque-bytes hash: the file is never parsed. */
function fileEntry(
  root: string,
  path: string,
  probes: InventoryProbes,
): { readonly path: string; readonly fileSha256: string } {
  return {
    path,
    fileSha256: createHash('sha256')
      .update(probes.readFile(join(root, path)))
      .digest('hex'),
  };
}

function tally(values: readonly unknown[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const key = String(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function sumNumbers(values: readonly unknown[]): number {
  return values.reduce<number>(
    (total, value) => total + (typeof value === 'number' ? value : 0),
    0,
  );
}

function envelopeAt(root: string, path: string, probes: InventoryProbes): PinnedEnvelope {
  const { pinned, record } = pinRecord(root, path, probes);
  return { ...pinned, record };
}

function inventoryEvaluation(
  outputRoot: string,
  prefix: string,
  ordinal: number,
  attemptNo: number,
  slotFiles: readonly string[],
  probes: InventoryProbes,
): EvaluationInventory {
  const files = slotFiles.filter((file) => file.startsWith(`${prefix}/`));
  const verified: boolean[] = [];
  const read = (name: string): Readonly<Record<string, unknown>> | null => {
    const path = `${prefix}/${name}`;
    if (!files.includes(path)) return null;
    const envelope = envelopeAt(outputRoot, path, probes);
    verified.push(envelope.recordSha256Verified);
    return envelope.record;
  };
  const planned = read('planned-input.json');
  const provider = read('provider-outcome.json');
  const stop = read('stop-decision.json');
  const tier2 = read('tier2-outcome.json');
  const round = read('repair-1/repair-round.json');
  const hardKill = tier2?.['hardKillDisposition'];
  const repairDocs = [
    ...new Set(
      files
        .map((file) => REPAIR_FILE_PATTERN.exec(file)?.[4])
        .filter((doc): doc is string => doc !== undefined),
    ),
  ]
    .map(Number)
    .sort((a, b) => a - b);
  const repairCalls = repairDocs.map((docIndex): RepairCallInventory => {
    const before = verified.length;
    const outcome = read(`repair-1/doc-${docIndex}/repair-outcome.json`);
    const call = read(`repair-1/doc-${docIndex}/repair-provider-outcome.json`);
    return {
      docIndex,
      disposition: outcome?.['disposition'] ?? null,
      providerRequestSent: outcome?.['providerRequestSent'] ?? null,
      providerOutcome: call?.['outcome'] ?? null,
      adapterAttempts: call?.['internalAdapterAttemptCountWhereObservable'] ?? null,
      authStatusInvocations: call?.['authStatusInvocationsObserved'] ?? null,
      monotonicWallTimeMs: call?.['monotonicWallTimeMs'] ?? null,
      recordsVerified: verified.slice(before).every(Boolean) && outcome !== null,
    };
  });
  const orderedDocIndices = planned?.['orderedDocIndices'];
  return {
    logicalBatchOrdinal: ordinal,
    attemptNo,
    fileCount: files.length,
    files: files.map((file) => file.slice(prefix.length + 1)),
    documents: Array.isArray(orderedDocIndices) ? orderedDocIndices.length : null,
    providerOutcome: provider?.['outcome'] ?? null,
    providerOutcomeDetail: provider?.['outcomeDetail'] ?? null,
    providerReportedModelId: provider?.['providerReportedModelId'] ?? null,
    adapterAttempts: provider?.['internalAdapterAttemptCountWhereObservable'] ?? null,
    authStatusInvocations: provider?.['authStatusInvocationsObserved'] ?? null,
    monotonicWallTimeMs: provider?.['monotonicWallTimeMs'] ?? null,
    tier1DiagnosticsCaptured: provider?.['tier1DiagnosticsCaptured'] ?? null,
    tier2Outcome: tier2?.['outcome'] ?? null,
    tier2ExitCode: tier2?.['exitCode'] ?? null,
    tier2HardKillDisposition: hardKill ?? null,
    tier2GracePhaseVerdict: tier2?.['gracePhaseVerdict'] ?? null,
    stop: stop?.['stop'] ?? null,
    stopCondition: stop?.['stopCondition'] ?? null,
    haltKind: stop?.['haltKind'] ?? null,
    endedWithoutStop: stop?.['stop'] === false,
    validationResultPresent: files.includes(`${prefix}/validation-result.json`),
    rawOutputCheckpointPresent: files.includes(`${prefix}/raw-output-checkpoint.json`),
    repairRound:
      round === null
        ? null
        : {
            planned: round['planned'],
            executed: round['executed'],
            accepted: round['accepted'],
            rejected: round['rejected'],
            providerFailed: round['providerFailed'],
            skipped: round['skipped'],
            excluded: round['excluded'],
          },
    repairCalls,
    everyParsedRecordVerified: verified.every(Boolean) && provider !== null && stop !== null,
  };
}

export function buildRecovery1ExecutionInventory(
  studyRoot: string,
  controlRoot: string | null,
  probes: InventoryProbes,
): Recovery1ExecutionInventory {
  const allFiles = probes.isDirectory(studyRoot)
    ? [...probes.listFilesRecursively(studyRoot)].sort()
    : [];
  const hashed = allFiles.map((path) => fileEntry(studyRoot, path, probes));
  const slotNames = new Set(F0V_SLOTS.map((slot) => slot.futureOutputRootName));
  const studyLevelFiles = allFiles.filter((file) => !slotNames.has(file.split('/')[0]!));
  const studyManifest = allFiles.includes('study-manifest.json')
    ? envelopeAt(studyRoot, 'study-manifest.json', probes)
    : null;
  const studyTerminal = allFiles.includes('study-terminal.json')
    ? envelopeAt(studyRoot, 'study-terminal.json', probes)
    : null;
  const eventFiles = allFiles.filter((file) => file.startsWith('study-events/'));
  const events = eventFiles.map((path) => envelopeAt(studyRoot, path, probes));
  const candidateSet = studyManifest?.record?.['candidateSet'];

  const slots: SlotExecutionInventory[] = [];
  for (const slot of F0V_SLOTS) {
    const outputRoot = futureOutputRootPathOf(studyRoot, slot);
    if (!probes.isDirectory(outputRoot)) continue;
    const files = [...probes.listFilesRecursively(outputRoot)].sort();
    const fileHashes = files.map((path) => fileEntry(outputRoot, path, probes));
    const identity = files.includes('study-slot-identity.json')
      ? envelopeAt(outputRoot, 'study-slot-identity.json', probes)
      : null;
    const candidate = identity?.record?.['candidateAuthorisationSha256'] ?? null;
    const manifestCandidate = Array.isArray(candidateSet)
      ? (candidateSet as readonly Record<string, unknown>[]).find(
          (entry) => entry['slotId'] === slot.slotId && entry['sequence'] === slot.sequence,
        )?.['candidateAuthorisationSha256']
      : undefined;
    const attemptDirectories = [
      ...new Set(
        files
          .map((file) => /^experiments\/(attempt-[1-9][0-9]*)\//.exec(file)?.[1])
          .filter((dir): dir is string => dir !== undefined),
      ),
    ].sort();
    const experimentFile = (name: string): PinnedEnvelope | null => {
      const path =
        attemptDirectories.length === 1 ? `experiments/${attemptDirectories[0]}/${name}` : null;
      return path !== null && files.includes(path) ? envelopeAt(outputRoot, path, probes) : null;
    };
    const completion = experimentFile('experiment-completion.json');
    const stop = experimentFile('experiment-stop.json');

    const attemptPrefixes = new Map<string, { ordinal: number; attemptNo: number }>();
    for (const file of files) {
      const match = EVALUATION_ATTEMPT_PATTERN.exec(file) ?? REPAIR_FILE_PATTERN.exec(file);
      if (match === null) continue;
      const prefix = `evaluations/${match[1]}/batch-${match[2]}/attempt-${match[3]}`;
      attemptPrefixes.set(prefix, { ordinal: Number(match[2]), attemptNo: Number(match[3]) });
    }
    const evaluations = [...attemptPrefixes.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([prefix, { ordinal, attemptNo }]) =>
        inventoryEvaluation(outputRoot, prefix, ordinal, attemptNo, files, probes),
      );
    const repairCalls = evaluations.flatMap((e) => e.repairCalls);
    const classification = classifySlotEvidence(outputRoot, probes);
    const slotEvents = events
      .filter((event) => event.record?.['slotId'] === slot.slotId)
      .map((event) => ({
        path: event.path,
        event: event.record?.['event'] ?? null,
        fileSha256: event.fileSha256,
        recordSha256Verified: event.recordSha256Verified,
      }));

    slots.push({
      slotId: slot.slotId,
      sequence: slot.sequence,
      pairNumber: slot.pairNumber,
      variantName: slot.variantName,
      outputRoot,
      fileCount: files.length,
      treeSha256: treeFingerprint(fileHashes),
      candidateAuthorisationSha256: candidate,
      candidateMatchesStudyManifest:
        typeof candidate === 'string' && candidate === manifestCandidate,
      outerSlotIdentity:
        identity === null
          ? null
          : {
              path: identity.path,
              fileSha256: identity.fileSha256,
              recordSha256: identity.recordSha256,
              recordSha256Verified: identity.recordSha256Verified,
            },
      consumptionMarkers: files
        .filter((file) => /^authorisations\/[0-9a-f]{64}\.json$/.test(file))
        .map((file) => pinRecord(outputRoot, file, probes).pinned),
      experiment: {
        attemptDirectories,
        manifest: experimentFile('experiment-manifest.json'),
        completion,
        stop,
        terminalKind:
          completion !== null && stop !== null
            ? 'BOTH'
            : completion !== null
              ? 'COMPLETION'
              : stop !== null
                ? 'STOP'
                : 'NONE',
      },
      evaluations,
      counts: {
        evaluationsPlanned:
          experimentFile('experiment-manifest.json')?.record?.['plannedLogicalEvaluations'] ?? null,
        evaluationsStarted: evaluations.length,
        evaluationsEndedWithoutStop: evaluations.filter((e) => e.endedWithoutStop).length,
        evaluationsEndedWithStop: evaluations.filter((e) => e.stop === true).length,
        documentsInStartedEvaluations: sumNumbers(evaluations.map((e) => e.documents)),
        originalProviderRequests: evaluations.filter((e) => e.providerOutcome !== null).length,
        repairProviderRequests: repairCalls.filter((call) => call.providerOutcome !== null).length,
        providerRequests:
          evaluations.filter((e) => e.providerOutcome !== null).length +
          repairCalls.filter((call) => call.providerOutcome !== null).length,
        adapterAttempts:
          sumNumbers(evaluations.map((e) => e.adapterAttempts)) +
          sumNumbers(repairCalls.map((call) => call.adapterAttempts)),
        authStatusInvocations:
          sumNumbers(evaluations.map((e) => e.authStatusInvocations)) +
          sumNumbers(repairCalls.map((call) => call.authStatusInvocations)),
        originalOutcomes: tally(evaluations.map((e) => e.providerOutcome)),
        tier2Outcomes: tally(evaluations.map((e) => e.tier2Outcome)),
        tier1DiagnosticsCaptured: sumNumbers(evaluations.map((e) => e.tier1DiagnosticsCaptured)),
        repairCallsByDisposition: tally(repairCalls.map((call) => call.disposition)),
      },
      studyEvents: slotEvents,
      inclusion: {
        disposition: classification.disposition,
        inclusionClass: inclusionClassOf(classification),
        durablyClosed: classification.durablyClosed,
        detail: classification.detail,
      },
    });
  }

  const control =
    controlRoot === null || !probes.isDirectory(controlRoot)
      ? null
      : (() => {
          const files = [...probes.listFilesRecursively(controlRoot)]
            .sort()
            .map((path) => fileEntry(controlRoot, path, probes));
          return {
            controlRoot,
            fileCount: files.length,
            treeSha256: treeFingerprint(files),
            files,
          };
        })();

  const sum = (select: (slot: SlotExecutionInventory) => number): number =>
    slots.reduce((total, slot) => total + select(slot), 0);
  const count = (cls: SlotInclusionClass): number =>
    slots.filter((slot) => slot.inclusion.inclusionClass === cls).length;
  const everyParsedRecordVerified =
    studyManifest?.recordSha256Verified === true &&
    studyTerminal?.recordSha256Verified === true &&
    events.every((event) => event.recordSha256Verified) &&
    slots.every(
      (slot) =>
        slot.outerSlotIdentity?.recordSha256Verified === true &&
        slot.consumptionMarkers.every((marker) => marker.recordSha256Verified) &&
        slot.experiment.manifest?.recordSha256Verified === true &&
        (slot.experiment.completion?.recordSha256Verified ?? true) &&
        (slot.experiment.stop?.recordSha256Verified ?? true) &&
        slot.evaluations.every(
          (e) => e.everyParsedRecordVerified && e.repairCalls.every((call) => call.recordsVerified),
        ),
    );

  return {
    inventoryVersion: RECOVERY_1_EXECUTION_INVENTORY_VERSION,
    requestFree: true,
    parsesClassifierVerdicts: false,
    studyRoot,
    wholeStudyTree: { fileCount: hashed.length, treeSha256: treeFingerprint(hashed) },
    studyLevelFiles,
    studyManifest,
    studyTerminal,
    studyEvents: events.map(({ path, fileSha256, recordSha256, recordSha256Verified }) => ({
      path,
      fileSha256,
      recordSha256,
      recordSha256Verified,
    })),
    control,
    slots,
    totals: {
      slotsPresent: slots.length,
      evaluationsPlanned: sumNumbers(slots.map((slot) => slot.counts.evaluationsPlanned)),
      evaluationsStarted: sum((slot) => slot.counts.evaluationsStarted),
      evaluationsEndedWithoutStop: sum((slot) => slot.counts.evaluationsEndedWithoutStop),
      evaluationsEndedWithStop: sum((slot) => slot.counts.evaluationsEndedWithStop),
      originalProviderRequests: sum((slot) => slot.counts.originalProviderRequests),
      repairProviderRequests: sum((slot) => slot.counts.repairProviderRequests),
      providerRequests: sum((slot) => slot.counts.providerRequests),
      adapterAttempts: sum((slot) => slot.counts.adapterAttempts),
      authStatusInvocations: sum((slot) => slot.counts.authStatusInvocations),
      originalOutcomes: tally(
        slots.flatMap((slot) => slot.evaluations.map((e) => e.providerOutcome)),
      ),
      tier2Outcomes: tally(slots.flatMap((slot) => slot.evaluations.map((e) => e.tier2Outcome))),
      repairCallsByDisposition: tally(
        slots.flatMap((slot) =>
          slot.evaluations.flatMap((e) => e.repairCalls.map((call) => call.disposition)),
        ),
      ),
      slotsWithCompletion: slots.filter((slot) => slot.experiment.terminalKind === 'COMPLETION')
        .length,
      slotsWithStop: slots.filter((slot) => slot.experiment.terminalKind === 'STOP').length,
      classA: count('NO_EVIDENCE_OR_CLASS_A_FAILURE_BEFORE_CONSUMPTION'),
      classB: count('CLASS_B_AUTHORISATION_CONSUMED_CONFIRMED_PRE_INFERENCE_REFUSAL'),
      classC: count('CLASS_C_PROVIDER_REQUEST_OR_SEMANTIC_EXECUTION_OBSERVED'),
      ambiguous: count('AMBIGUOUS_EVIDENCE'),
      durablyClosed: slots.filter((slot) => slot.inclusion.durablyClosed).length,
      everyParsedRecordVerified: everyParsedRecordVerified && slots.length === F0V_TOTAL_SLOTS,
    },
  };
}

/** The exact committed bytes: two-space JSON plus a trailing newline. */
export function recovery1ExecutionInventoryBytes(inventory: Recovery1ExecutionInventory): string {
  return `${JSON.stringify(inventory, null, 2)}\n`;
}

const isMainModule =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const argv = process.argv.slice(2);
  const valueOf = (flag: string): string | null => {
    const index = argv.indexOf(flag);
    return index >= 0 && argv[index + 1] !== undefined ? argv[index + 1]! : null;
  };
  const known = new Set(['--study-root', '--control-root']);
  const unknown = argv.filter((arg) => arg.startsWith('--') && !known.has(arg));
  const studyRoot = valueOf('--study-root');
  const controlRoot = valueOf('--control-root');
  if (studyRoot === null || controlRoot === null || unknown.length > 0) {
    process.stderr.write(
      'usage: recovery1ExecutionInventory.ts --study-root <dir> --control-root <dir>\n',
    );
    process.exitCode = 2;
  } else {
    process.stdout.write(
      recovery1ExecutionInventoryBytes(
        buildRecovery1ExecutionInventory(
          resolve(studyRoot),
          resolve(controlRoot),
          createReadOnlyInventoryProbes(),
        ),
      ),
    );
  }
}
