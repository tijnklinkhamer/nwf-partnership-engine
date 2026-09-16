/**
 * PHASE 2B-2D2C-F0W — THE FAIL-CLOSED STUDY SEQUENCING GATE.
 *
 * The F0V freeze's `inclusionRule` names three classes a completed
 * replicate's evidence can fall into (`classA`/`classB`/`classC`, restated
 * by the owner's brief §6):
 *
 *   - Class A `FAILURE_BEFORE_AUTHORISATION_CONSUMPTION` — the run never
 *     reached the point of consuming its authorisation. This is NOT, in
 *     general, "the first thing `runExperiment` writes" any more: under
 *     F0X, `study-slot-identity.json` (`f0x/outerSlotIdentity.ts`) is
 *     written write-once, durably, BEFORE `runExperiment` is ever called —
 *     and that write IS what consumes the slot's F0X authorisation (see
 *     that module's docstring). So Class A, precisely, is a failure
 *     STRICTLY BEFORE that outer-identity write: by construction it leaves
 *     NO durable trace under the slot's output root at all, and is
 *     therefore, BY DESIGN, indistinguishable from "this slot has simply
 *     never been attempted" — this module does not pretend otherwise. A
 *     failure AFTER that write is a DIFFERENT, confirmed fact — Class B,
 *     below — never Class A. Both a genuine Class A failure and true
 *     never-attempted read as `NO_EVIDENCE` here, and both are
 *     non-blocking: a slot with no evidence is eligible for a fresh (or
 *     first) attempt once its predecessors are closed.
 *   - Class B `AUTHORISATION_CONSUMED_CONFIRMED_PRE_INFERENCE_REFUSAL` — the
 *     authorisation WAS consumed (the F0X outer-slot-identity record and/or
 *     the coordinator's own legacy marker exists) but the run never got
 *     past child-manifest construction (exactly F0K's own historical case).
 *     This PAUSES the study: it is never silently replaced, only recovered
 *     by a SEPARATE, owner-reviewed decision for the SAME slot.
 *   - Class C `PROVIDER_REQUEST_OR_SEMANTIC_EXECUTION_OBSERVED` — some
 *     artifact exists that only comes into being once the parent got past
 *     manifest construction (a child manifest, preflight, provider outcome,
 *     final record, repair artifact, or the experiment's own terminal
 *     record). This PERMANENTLY includes the slot — inclusion is
 *     irrevocable — and, once the slot's OWN evidence is DURABLY CLOSED
 *     (an `experiment-completion.json` or `experiment-stop.json` exists, so
 *     no further artifact can legally be appended under write-once rules),
 *     progression to the next frozen slot is permitted.
 *
 * Anything this module cannot account for is `AMBIGUOUS` and BLOCKS
 * progression — fail closed, never assumed harmless, exactly as F0K's
 * `priorAttempt3Evidence.ts` (the direct ancestor of this module) already
 * established for a single attempt's own replacement question. This module
 * generalises that same evidence walk across an ORDERED SEQUENCE of ten
 * slots, and adds the ordering rule itself: slot N+1 is never eligible while
 * any slot 1..N is anything other than Class C AND durably closed.
 *
 * PURE aside from the injected probes. No network, no database, no clock, no
 * filesystem of its own, and it never writes, moves or deletes anything —
 * exactly like `priorAttempt3Evidence.ts`, it only reads the SHAPE of
 * preserved evidence.
 */
import { F0V_SLOTS, type StudySlotIdentity } from '../f0v/studyPlanCore.js';

/** Artifacts that can only exist once the parent got past child-manifest construction. */
const INFERENCE_CAPABLE_ARTIFACT_FILE_NAMES: readonly string[] = [
  'child-manifest.json',
  'child-preflight.json',
  'child-failure.json',
  'child-result.json',
  'raw-output-checkpoint.json',
  'validation-result.json',
  'provider-outcome.json',
  'tier1-diagnostics.json',
  'tier2-outcome.json',
  'stop-decision.json',
  'final-record.json',
  'experiment-completion.json',
  'repair-round.json',
  'repair-decision.json',
  'repair-request.json',
  'repair-raw-output-checkpoint.json',
  'repair-validation-result.json',
  'repair-provider-outcome.json',
  'repair-outcome.json',
];

/**
 * The shapes a PRE-INFERENCE slot root may hold, and nothing else.
 *
 * PHASE 2B-2D2C-F0X widening: `study-slot-identity.json`
 * (`f0x/outerSlotIdentity.ts`) is the durable OUTER-layer record F0X writes
 * write-once, at the slot's own output root, before (and as part of)
 * authorisation consumption — deliberately BEFORE `runExperiment`'s own
 * `authorisations/<hash>.json` marker can be relied on to exist. Without
 * this entry a slot root holding only that record would fall through to
 * the "unaccounted" branch below and read as `AMBIGUOUS` instead of the
 * correct `PRE_INFERENCE_REFUSAL` (Class B candidate) — misclassifying
 * every real slot's normal pre-launch state. It carries no inference-shaped
 * content (`outerSlotIdentity.ts`'s own record has no provider, prompt
 * output or classifier field), so admitting it here changes no Class C
 * detection: a slot root with ANY inference-capable artifact is still
 * `SEMANTIC_EXECUTION_OBSERVED` regardless of this file's presence, because
 * that check runs first.
 */
const PRE_INFERENCE_PATH_PATTERNS: readonly RegExp[] = [
  /^authorisations\/[0-9a-f]{64}\.json$/,
  /^experiments\/attempt-[1-9][0-9]*\/experiment-manifest\.json$/,
  /^evaluations\/[A-Z0-9_]+\/batch-[0-9]{2}\/attempt-[1-9][0-9]*\/planned-input\.json$/,
  /^experiments\/attempt-[1-9][0-9]*\/experiment-stop\.json$/,
  /^study-slot-identity\.json$/,
];

const DURABLE_CLOSURE_FILE_NAMES: readonly string[] = [
  'experiment-completion.json',
  'experiment-stop.json',
];

export type SlotEvidenceDisposition =
  'NO_EVIDENCE' | 'PRE_INFERENCE_REFUSAL' | 'SEMANTIC_EXECUTION_OBSERVED' | 'AMBIGUOUS';

export interface SlotEvidenceProbes {
  readonly isDirectory: (path: string) => boolean;
  /** Every FILE under `root`, as root-relative POSIX paths, in any order. */
  readonly listFilesRecursively: (root: string) => readonly string[];
}

export interface SlotEvidenceClassification {
  readonly root: string;
  readonly disposition: SlotEvidenceDisposition;
  readonly detail: string;
  readonly files: readonly string[];
  readonly durablyClosed: boolean;
}

const MAX_REPORTED_FILES = 20;

/**
 * Classifies ONE slot's output root from its preserved evidence alone.
 * `root` is always an explicit caller-named path — there is no default and
 * no discovery, so this check can never be silently skipped.
 */
export function classifySlotEvidence(
  root: string,
  probes: SlotEvidenceProbes,
): SlotEvidenceClassification {
  const report = (
    disposition: SlotEvidenceDisposition,
    detail: string,
    files: readonly string[],
  ): SlotEvidenceClassification => ({
    root,
    disposition,
    detail,
    files: files.slice(0, MAX_REPORTED_FILES),
    durablyClosed: files.some((file) =>
      DURABLE_CLOSURE_FILE_NAMES.includes(file.slice(file.lastIndexOf('/') + 1)),
    ),
  });

  if (!probes.isDirectory(root)) {
    return report('NO_EVIDENCE', 'no directory exists at this slot output root.', []);
  }
  let files: readonly string[];
  try {
    files = [...probes.listFilesRecursively(root)].sort();
  } catch (error) {
    return report(
      'AMBIGUOUS',
      `this slot's output root could not be listed (${error instanceof Error ? error.message : String(error)}); an unreadable root is never read as "nothing happened".`,
      [],
    );
  }
  if (files.length === 0) {
    return report('NO_EVIDENCE', 'this slot output root is an empty directory.', []);
  }
  const inferenceCapable = files.filter((file) =>
    INFERENCE_CAPABLE_ARTIFACT_FILE_NAMES.includes(file.slice(file.lastIndexOf('/') + 1)),
  );
  if (inferenceCapable.length > 0) {
    return report(
      'SEMANTIC_EXECUTION_OBSERVED',
      `holds ${inferenceCapable.length} artifact(s) that exist only once the parent got past child-manifest construction (${inferenceCapable.slice(0, 5).join(', ')}).`,
      files,
    );
  }
  const unaccounted = files.filter(
    (file) => !PRE_INFERENCE_PATH_PATTERNS.some((pattern) => pattern.test(file)),
  );
  if (unaccounted.length > 0) {
    return report(
      'AMBIGUOUS',
      `holds ${unaccounted.length} file(s) this classifier cannot account for (${unaccounted.slice(0, 5).join(', ')}); an unexplained root is refused, never assumed harmless.`,
      files,
    );
  }
  return report(
    'PRE_INFERENCE_REFUSAL',
    `holds only a consumption marker, an experiment manifest and/or planned input(s) (${files.length} file(s)): the run was refused before any child was forked.`,
    files,
  );
}

export type SlotInclusionClass =
  /** Genuinely no evidence, OR (structurally indistinguishable from it) Class A: failed before authorisation consumption. Non-blocking. */
  | 'NO_EVIDENCE_OR_CLASS_A_FAILURE_BEFORE_CONSUMPTION'
  | 'CLASS_B_AUTHORISATION_CONSUMED_CONFIRMED_PRE_INFERENCE_REFUSAL'
  | 'CLASS_C_PROVIDER_REQUEST_OR_SEMANTIC_EXECUTION_OBSERVED'
  | 'AMBIGUOUS_EVIDENCE';

export function inclusionClassOf(classification: SlotEvidenceClassification): SlotInclusionClass {
  switch (classification.disposition) {
    case 'NO_EVIDENCE':
      return 'NO_EVIDENCE_OR_CLASS_A_FAILURE_BEFORE_CONSUMPTION';
    case 'PRE_INFERENCE_REFUSAL':
      return 'CLASS_B_AUTHORISATION_CONSUMED_CONFIRMED_PRE_INFERENCE_REFUSAL';
    case 'SEMANTIC_EXECUTION_OBSERVED':
      return 'CLASS_C_PROVIDER_REQUEST_OR_SEMANTIC_EXECUTION_OBSERVED';
    case 'AMBIGUOUS':
      return 'AMBIGUOUS_EVIDENCE';
  }
}

export type SequencingRefusal =
  | 'UNKNOWN_SLOT_ID'
  | 'PRIOR_SLOT_NOT_YET_CLASS_C'
  | 'PRIOR_SLOT_PAUSED_CLASS_B'
  | 'PRIOR_SLOT_AMBIGUOUS_EVIDENCE'
  | 'PRIOR_SLOT_CLASS_C_NOT_YET_DURABLY_CLOSED'
  | 'TARGET_SLOT_ALREADY_HAS_EVIDENCE';

export type SequencingDecision =
  | { readonly eligible: true; readonly slot: StudySlotIdentity }
  | {
      readonly eligible: false;
      readonly refusal: SequencingRefusal;
      readonly detail: string;
      readonly blockingSlot: StudySlotIdentity | null;
    };

/**
 * True iff every slot BEFORE `targetSlotId` (frozen order) is Class C and
 * durably closed, and the target slot's OWN root holds no evidence yet.
 * Never infers progression from a directory NAME — every verdict is derived
 * from `classifySlotEvidence`'s read of the preserved artifacts themselves.
 */
export function evaluateSequencingGate(
  targetSlotId: string,
  outputRootOfSlot: (slot: StudySlotIdentity) => string,
  probes: SlotEvidenceProbes,
  slots: readonly StudySlotIdentity[] = F0V_SLOTS,
): SequencingDecision {
  const targetIndex = slots.findIndex((slot) => slot.slotId === targetSlotId);
  if (targetIndex < 0) {
    return {
      eligible: false,
      refusal: 'UNKNOWN_SLOT_ID',
      detail: `"${targetSlotId}" is not one of the ${slots.length} frozen replication-study slots.`,
      blockingSlot: null,
    };
  }
  for (let index = 0; index < targetIndex; index += 1) {
    const priorSlot = slots[index]!;
    const classification = classifySlotEvidence(outputRootOfSlot(priorSlot), probes);
    const inclusionClass = inclusionClassOf(classification);
    if (inclusionClass === 'CLASS_B_AUTHORISATION_CONSUMED_CONFIRMED_PRE_INFERENCE_REFUSAL') {
      return {
        eligible: false,
        refusal: 'PRIOR_SLOT_PAUSED_CLASS_B',
        detail: `${priorSlot.slotId} (sequence ${priorSlot.sequence}) is paused: ${classification.detail} This requires a separate, owner-reviewed recovery decision for THAT slot before ${targetSlotId} may start.`,
        blockingSlot: priorSlot,
      };
    }
    if (inclusionClass === 'AMBIGUOUS_EVIDENCE') {
      return {
        eligible: false,
        refusal: 'PRIOR_SLOT_AMBIGUOUS_EVIDENCE',
        detail: `${priorSlot.slotId} (sequence ${priorSlot.sequence}) is ambiguous: ${classification.detail}`,
        blockingSlot: priorSlot,
      };
    }
    if (inclusionClass === 'NO_EVIDENCE_OR_CLASS_A_FAILURE_BEFORE_CONSUMPTION') {
      return {
        eligible: false,
        refusal: 'PRIOR_SLOT_NOT_YET_CLASS_C',
        detail: `${priorSlot.slotId} (sequence ${priorSlot.sequence}) has not been attempted (or failed before its authorisation was consumed): ${targetSlotId} may not start out of order.`,
        blockingSlot: priorSlot,
      };
    }
    // CLASS_C — permanently included, but must be DURABLY CLOSED before the next slot may start.
    if (!classification.durablyClosed) {
      return {
        eligible: false,
        refusal: 'PRIOR_SLOT_CLASS_C_NOT_YET_DURABLY_CLOSED',
        detail: `${priorSlot.slotId} (sequence ${priorSlot.sequence}) has semantic execution evidence but no terminal experiment record yet (no experiment-completion.json or experiment-stop.json); it may still receive writes.`,
        blockingSlot: priorSlot,
      };
    }
  }
  const target = slots[targetIndex]!;
  const targetClassification = classifySlotEvidence(outputRootOfSlot(target), probes);
  if (targetClassification.disposition !== 'NO_EVIDENCE') {
    return {
      eligible: false,
      refusal: 'TARGET_SLOT_ALREADY_HAS_EVIDENCE',
      detail: `${target.slotId} already holds evidence (${targetClassification.disposition}): ${targetClassification.detail} A fresh attempt at an already-attempted slot is a replacement decision, never an automatic re-run.`,
      blockingSlot: target,
    };
  }
  return { eligible: true, slot: target };
}
