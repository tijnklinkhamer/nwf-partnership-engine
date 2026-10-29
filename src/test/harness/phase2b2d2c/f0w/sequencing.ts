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
 *     the coordinator's own legacy marker exists) and no provider request
 *     or semantic execution happened, CONFIRMED by the evidence itself:
 *     either no child was ever forked (exactly F0K's own historical case),
 *     or every forked child left a self-hash-verified `child-preflight.json`
 *     recording `ok: false` AND `providerConstructed: false` — a refusal
 *     `childMain.ts` writes only on its `preflightStop` path, which returns
 *     before the provider factory is ever reached. This PAUSES the study:
 *     it is never silently replaced, only recovered by a SEPARATE,
 *     owner-reviewed decision for the SAME slot.
 *   - Class C `PROVIDER_REQUEST_OR_SEMANTIC_EXECUTION_OBSERVED` — some
 *     artifact exists that `childMain.ts` can only write AFTER
 *     `provider.classify` returned (`provider-outcome.json`,
 *     `raw-output-checkpoint.json`, `validation-result.json`,
 *     `tier1-diagnostics.json`, `child-result.json`, or any ADR 0011 repair
 *     artifact). This PERMANENTLY includes the slot — inclusion is
 *     irrevocable — and, once the slot's OWN evidence is DURABLY CLOSED
 *     (an `experiment-completion.json` or `experiment-stop.json` exists, so
 *     no further artifact can legally be appended under write-once rules),
 *     progression to the next frozen slot is permitted.
 *
 * PHASE 2B-2D2C-F0X ZERO-INFERENCE EXECUTION-RECOVERY CORRECTION: this module
 * previously read ANY artifact past parent child-manifest construction — a
 * `child-manifest.json`, a `child-preflight.json`, a `final-record.json`, a
 * `stop-decision.json`, a `tier2-outcome.json` — as Class C. The first real
 * F0X study invocation (2026-09-16) exposed that: all ten children refused
 * at their own freeze stage (`providerConstructed: false`, zero provider
 * requests, zero adapter attempts), yet each slot read as "semantic
 * execution observed" and the study advanced through all ten candidates.
 * Those files are PARENT/CHILD CONTROL-PLANE records: they prove a child
 * was dispatched, never that a provider request happened. They are now
 * admitted ONLY inside an attempt directory whose child preflight
 * CONFIRMS a pre-provider refusal; anywhere else — a child manifest with no
 * preflight, a preflight recording `ok: true` (the provider factory became
 * reachable, but nothing proves or excludes a request), a
 * `child-failure.json`, an unverifiable preflight — the slot is AMBIGUOUS
 * and blocks, fail closed.
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
 * preserved evidence, plus the CONTENT of exactly one kind of file,
 * `child-preflight.json` (a record carrying no gold id, no document and no
 * classifier output), and nothing else.
 */
import { join } from 'node:path';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import { F0V_SLOTS, sha256Hex, type StudySlotIdentity } from '../f0v/studyPlanCore.js';

/**
 * IRREVERSIBLE semantic-execution markers: artifacts `childMain.ts` writes
 * only AFTER `provider.classify` has returned (the original call's raw
 * checkpoint, validation, diagnostics, provider outcome and child result)
 * or inside the ADR 0011 repair round, which itself runs only after a
 * validated original. `experiment-completion.json` is deliberately NOT
 * here: it is the parent's closure record, and the coordinator writes it
 * for any run whose planned evaluations all ended — it proves closure,
 * never that a request happened.
 */
export const SEMANTIC_EXECUTION_MARKER_FILE_NAMES: readonly string[] = [
  'provider-outcome.json',
  'raw-output-checkpoint.json',
  'validation-result.json',
  'tier1-diagnostics.json',
  'child-result.json',
  'repair-round.json',
  'repair-decision.json',
  'repair-request.json',
  'repair-raw-output-checkpoint.json',
  'repair-validation-result.json',
  'repair-provider-outcome.json',
  'repair-outcome.json',
];

/** `evaluations/<VARIANT>/batch-NN/attempt-N/<file>` — one forked child's own directory. */
const ATTEMPT_DIRECTORY_FILE_PATTERN =
  /^(evaluations\/[A-Z0-9_]+\/batch-[0-9]{2}\/attempt-[1-9][0-9]*)\/([^/]+)$/;

const CHILD_MANIFEST_FILE_NAME = 'child-manifest.json';
const CHILD_PREFLIGHT_FILE_NAME = 'child-preflight.json';

/**
 * Parent/child CONTROL-PLANE records a dispatched child's attempt directory
 * holds after a confirmed pre-provider refusal: the parent's manifest, the
 * child's own refusing preflight, and the parent's reconciliation
 * (`final-record.json`, `stop-decision.json`, `tier2-outcome.json`). None of
 * them is evidence of a provider request; each is admitted ONLY inside an
 * attempt directory whose preflight confirms the refusal.
 */
const CONFIRMED_REFUSAL_ATTEMPT_FILE_NAMES: readonly string[] = [
  CHILD_MANIFEST_FILE_NAME,
  CHILD_PREFLIGHT_FILE_NAME,
  'final-record.json',
  'stop-decision.json',
  'tier2-outcome.json',
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
 * detection: a slot root with ANY semantic-execution marker is still
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
  /**
   * Exact bytes of one file. Called ONLY for `child-preflight.json` files
   * inside a dispatched child's attempt directory — never for a manifest,
   * planned input, final record, corpus or gold file.
   */
  readonly readFile: (path: string) => Buffer;
}

type PreflightVerdict =
  | { readonly confirmedRefusal: true; readonly stage: string | null }
  | { readonly confirmedRefusal: false; readonly detail: string };

/**
 * Reads ONE child preflight and answers only: does it CONFIRM a pre-provider
 * refusal? Requires the artifact envelope's own `recordSha256` to verify,
 * `artifactKind: 'CHILD_PREFLIGHT'`, `record.ok === false` and
 * `record.providerConstructed === false` — anything else is not a
 * confirmation, and the caller reads the slot as AMBIGUOUS.
 */
function verifyConfirmedPreflightRefusal(
  path: string,
  readFile: (path: string) => Buffer,
): PreflightVerdict {
  let envelope: {
    artifactKind?: unknown;
    record?: { ok?: unknown; providerConstructed?: unknown; checks?: { stage?: unknown } };
    recordSha256?: unknown;
  };
  try {
    envelope = JSON.parse(readFile(path).toString('utf8')) as typeof envelope;
  } catch (error) {
    return {
      confirmedRefusal: false,
      detail: `${path} could not be read or parsed (${error instanceof Error ? error.message : String(error)}).`,
    };
  }
  if (envelope.artifactKind !== 'CHILD_PREFLIGHT' || envelope.record === undefined) {
    return { confirmedRefusal: false, detail: `${path} is not a CHILD_PREFLIGHT envelope.` };
  }
  if (sha256Hex(canonicalStringify(envelope.record)) !== envelope.recordSha256) {
    return { confirmedRefusal: false, detail: `${path} fails its own recorded hash.` };
  }
  if (envelope.record.ok !== false) {
    return {
      confirmedRefusal: false,
      detail: `${path} records ok: ${JSON.stringify(envelope.record.ok)} — the child passed its preflight, so the provider factory was reachable, yet no semantic-execution marker exists: a provider request can be neither confirmed nor excluded.`,
    };
  }
  if (envelope.record.providerConstructed !== false) {
    return {
      confirmedRefusal: false,
      detail: `${path} records providerConstructed: ${JSON.stringify(envelope.record.providerConstructed)}, not false.`,
    };
  }
  const stage = envelope.record.checks?.stage;
  return { confirmedRefusal: true, stage: typeof stage === 'string' ? stage : null };
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
  const semanticMarkers = files.filter((file) =>
    SEMANTIC_EXECUTION_MARKER_FILE_NAMES.includes(file.slice(file.lastIndexOf('/') + 1)),
  );
  if (semanticMarkers.length > 0) {
    return report(
      'SEMANTIC_EXECUTION_OBSERVED',
      `holds ${semanticMarkers.length} semantic-execution marker(s) a child writes only after a provider call returned (${semanticMarkers.slice(0, 5).join(', ')}).`,
      files,
    );
  }

  // No marker. Every remaining file must be a parent-only pre-inference
  // record, or a control-plane record inside a dispatched child's attempt
  // directory — and each such directory must then CONFIRM its refusal.
  const unaccounted: string[] = [];
  const attemptDirectories = new Map<string, Set<string>>();
  for (const file of files) {
    if (PRE_INFERENCE_PATH_PATTERNS.some((pattern) => pattern.test(file))) continue;
    const match = ATTEMPT_DIRECTORY_FILE_PATTERN.exec(file);
    if (match !== null && CONFIRMED_REFUSAL_ATTEMPT_FILE_NAMES.includes(match[2]!)) {
      const names = attemptDirectories.get(match[1]!) ?? new Set<string>();
      names.add(match[2]!);
      attemptDirectories.set(match[1]!, names);
      continue;
    }
    unaccounted.push(file);
  }
  if (unaccounted.length > 0) {
    return report(
      'AMBIGUOUS',
      `holds ${unaccounted.length} file(s) this classifier cannot account for without a semantic-execution marker (${unaccounted.slice(0, 5).join(', ')}); an unexplained root is refused, never assumed harmless.`,
      files,
    );
  }

  const stages = new Set<string>();
  for (const [directory, names] of [...attemptDirectories.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (!names.has(CHILD_MANIFEST_FILE_NAME) || !names.has(CHILD_PREFLIGHT_FILE_NAME)) {
      return report(
        'AMBIGUOUS',
        `${directory} holds child control-plane record(s) (${[...names].sort().join(', ')}) without both a child manifest and a child preflight: no confirmed pre-provider refusal exists for that child.`,
        files,
      );
    }
    const verdict = verifyConfirmedPreflightRefusal(
      join(root, directory, CHILD_PREFLIGHT_FILE_NAME),
      probes.readFile,
    );
    if (!verdict.confirmedRefusal) {
      return report('AMBIGUOUS', verdict.detail, files);
    }
    stages.add(verdict.stage ?? '<unrecorded>');
  }

  if (attemptDirectories.size === 0) {
    return report(
      'PRE_INFERENCE_REFUSAL',
      `holds only a consumption marker, an experiment manifest and/or planned input(s) (${files.length} file(s)): the run was refused before any child was forked.`,
      files,
    );
  }
  return report(
    'PRE_INFERENCE_REFUSAL',
    `authorisation consumed; ${attemptDirectories.size} child(ren) dispatched, each with a hash-verified child preflight recording ok: false and providerConstructed: false (stage(s): ${[...stages].sort().join(', ')}), and no semantic-execution marker anywhere (${files.length} file(s)): a confirmed pre-provider refusal.`,
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
