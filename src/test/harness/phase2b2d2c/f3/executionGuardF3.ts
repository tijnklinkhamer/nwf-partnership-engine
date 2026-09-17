/**
 * PHASE 2B-2D2C-F3 — THE FINAL-V6 EXECUTION GUARD.
 *
 * The single entry point a future authorised F3 execution must pass through,
 * and the place where the owner's brief §5 is enforced rather than merely
 * documented. It composes, in order and fail-closed:
 *
 *   A. FREEZE_IDENTITY — the approved F2 freeze on disk still hashes to its
 *      pinned SHA-256 at its pinned byte length (brief §5.9).
 *   B. OWNER_FREEZE_APPROVAL_IDENTITY — the owner freeze-approval record on
 *      disk likewise (brief §5.9).
 *   C. RELIABILITY_SEMANTICS — the freeze still declares exactly
 *      `RELIABILITY_SEMANTICS_V2_TIMEOUT_CONTINUATION`, and C2 is still
 *      NOT_IMPLEMENTED (brief §5.10).
 *   D. ALL_FIVE_PREFLIGHT — all five candidates, the ONE study approval and
 *      all five output roots accepted TOGETHER, before anything is touched.
 *   E. COMPOSED_SLOT_DECISION — the six-gate per-slot decision for the one
 *      target slot: sequencing (§5.1), candidate (§5.2), study approval
 *      (§5.3), approval-names-this-exact-candidate-and-byte-length (§5.4),
 *      execution build == approval build == HEAD (§5.5, §5.6), output root
 *      (§5.7), candidate unconsumed (§5.8).
 *
 * WHAT THIS BUILD DELIBERATELY DOES NOT DO.
 *
 *   Even with every gate above satisfied, this build REFUSES at
 *   `SEMANTIC_DISPATCH_NOT_IMPLEMENTED` and constructs no provider, forks no
 *   child and writes nothing. The F3 task authorises the EXECUTION-CONTROL
 *   AUTHORITY, not a V6 semantic dispatch path, and wiring one is genuinely
 *   more than a rename: `runExperiment` consumes a `RunnerPlan` built from
 *   the historical F0I/F0O freezes, `buildSlotExecutionPlanTemplate` is typed
 *   `attemptNo: 3 | 4`, `variantRootsFor` knows only V4/V5 roots, and the
 *   child's own freeze-family validator has never been shown the F2 freeze.
 *   Producing that adapter is a separate, separately-reviewed slice; inventing
 *   it here would be building execution machinery this task did not authorise.
 *
 *   The refusal is therefore a STRUCTURAL guarantee, not a TODO: there is no
 *   flag, environment variable or argument that turns it off, and the F3
 *   firewall asserts this module imports no coordinator, launcher or provider.
 *
 * PURE aside from the injected probes. No network, no database, no
 * filesystem of its own, no clock of its own, no child process, no provider.
 */
import { RELIABILITY_SEMANTICS_V2 } from '../constants.js';
import type { SlotEvidenceProbes } from '../f0w/sequencing.js';
import type { OutputRootProbes as SlotOutputRootProbes } from '../artifacts.js';
import {
  F2_APPROVAL_RECORD_RAW_BYTES,
  F2_APPROVAL_RECORD_RAW_SHA256,
  PROPOSED_F2_FREEZE_RAW_BYTES,
  PROPOSED_F2_FREEZE_RAW_SHA256,
} from '../f2/freezeF2.js';
import { runF3AllFivePreflight, type F3AllFivePreflightDecision } from './allFivePreflightF3.js';
import {
  evaluateF3ComposedSlotExecutionDecision,
  type F3ComposedSlotExecutionDecision,
} from './composedExecutionDecisionF3.js';
import type { F3SlotRegistry } from './slotRegistryF3.js';

export type F3ExecutionRefusalStage =
  | 'FREEZE_IDENTITY'
  | 'OWNER_FREEZE_APPROVAL_IDENTITY'
  | 'RELIABILITY_SEMANTICS'
  | 'ALL_FIVE_PREFLIGHT'
  | 'COMPOSED_SLOT_DECISION'
  | 'SEMANTIC_DISPATCH_NOT_IMPLEMENTED';

export interface F3ExecutionRefusal {
  readonly launched: false;
  readonly stage: F3ExecutionRefusalStage;
  readonly detail: string;
  readonly preflight: F3AllFivePreflightDecision | null;
  readonly composed: F3ComposedSlotExecutionDecision | null;
  /** Always zero. This module has no path that could make it anything else. */
  readonly providerRequests: 0;
}

export interface F3ExecutionGuardInput {
  readonly targetSlotId: string;
  readonly registry: F3SlotRegistry;
  /** Absolute path to the committed, approved F2 freeze document. */
  readonly f2FreezePath: string;
  /** Absolute path to the committed owner freeze-approval record. */
  readonly f2OwnerFreezeApprovalPath: string;
  readonly candidatePathForSlot: (slotId: string) => string | null;
  readonly studyApprovalPath: string | null;
  readonly readFile: (path: string) => Buffer;
  readonly sha256: (bytes: Buffer) => string;
  readonly nowUtc: () => Date;
  readonly currentHead: () => string;
  readonly alreadyConsumed: (authorisationSha256: string, outputRoot: string) => boolean;
  readonly sequencingProbes: SlotEvidenceProbes;
  readonly outputRootProbes: SlotOutputRootProbes;
  readonly forbiddenOutputRootContainers: readonly string[];
  readonly studyRoot?: string;
}

function refuse(
  stage: F3ExecutionRefusalStage,
  detail: string,
  preflight: F3AllFivePreflightDecision | null = null,
  composed: F3ComposedSlotExecutionDecision | null = null,
): F3ExecutionRefusal {
  return { launched: false, stage, detail, preflight, composed, providerRequests: 0 };
}

function identityProblem(
  input: F3ExecutionGuardInput,
  path: string,
  expectedSha256: string,
  expectedBytes: number,
): string | null {
  let bytes: Buffer;
  try {
    bytes = input.readFile(path);
  } catch (error) {
    return `could not be read (${error instanceof Error ? error.message : String(error)}).`;
  }
  const actual = input.sha256(bytes);
  if (actual !== expectedSha256) {
    return `hashes to ${actual}; the approved identity is ${expectedSha256}.`;
  }
  if (bytes.length !== expectedBytes) {
    return `is ${bytes.length} bytes; the approved identity is ${expectedBytes} bytes.`;
  }
  return null;
}

/**
 * Evaluates every §5 condition for ONE named slot and then refuses to
 * dispatch. This function NEVER returns a launch: its return type has no
 * success member, so a caller cannot branch into execution on it even by
 * mistake, and a future slice that adds semantic dispatch must widen the type
 * deliberately and visibly rather than flipping a boolean.
 */
export function runF3SlotExecution(input: F3ExecutionGuardInput): F3ExecutionRefusal {
  // A + B: the approved identities still match, byte for byte.
  const freezeProblem = identityProblem(
    input,
    input.f2FreezePath,
    PROPOSED_F2_FREEZE_RAW_SHA256,
    PROPOSED_F2_FREEZE_RAW_BYTES,
  );
  if (freezeProblem !== null) {
    return refuse('FREEZE_IDENTITY', `the approved F2 freeze ${freezeProblem}`);
  }
  const approvalProblem = identityProblem(
    input,
    input.f2OwnerFreezeApprovalPath,
    F2_APPROVAL_RECORD_RAW_SHA256,
    F2_APPROVAL_RECORD_RAW_BYTES,
  );
  if (approvalProblem !== null) {
    return refuse(
      'OWNER_FREEZE_APPROVAL_IDENTITY',
      `the owner freeze-approval record ${approvalProblem}`,
    );
  }

  // C: reliability semantics, read from the loaded freeze itself.
  const reliability = input.registry.f2Freeze.reliability;
  if (
    reliability.semanticsVersion !== RELIABILITY_SEMANTICS_V2 ||
    reliability.c2Implemented !== false ||
    reliability.c2Status !== 'NOT_IMPLEMENTED'
  ) {
    return refuse(
      'RELIABILITY_SEMANTICS',
      `the freeze declares semantics ${String(reliability.semanticsVersion)} with c2Status ` +
        `${String(reliability.c2Status)}; this study runs only ${RELIABILITY_SEMANTICS_V2} with C2 NOT_IMPLEMENTED.`,
    );
  }

  // D: all five together, before anything is touched.
  const preflight = runF3AllFivePreflight({
    registry: input.registry,
    candidatePathForSlot: input.candidatePathForSlot,
    studyApprovalPath: input.studyApprovalPath,
    readFile: input.readFile,
    sha256: input.sha256,
    nowUtc: input.nowUtc,
    currentHead: input.currentHead,
    alreadyConsumed: input.alreadyConsumed,
    sequencingProbes: input.sequencingProbes,
    outputRootProbes: input.outputRootProbes,
    forbiddenOutputRootContainers: input.forbiddenOutputRootContainers,
    ...(input.studyRoot === undefined ? {} : { studyRoot: input.studyRoot }),
  });
  if (!preflight.granted) {
    return refuse('ALL_FIVE_PREFLIGHT', preflight.reason, preflight);
  }

  // E: the six-gate composed decision for the one target slot.
  const composed = evaluateF3ComposedSlotExecutionDecision({
    targetSlotId: input.targetSlotId,
    registry: input.registry,
    authorisationPath: input.candidatePathForSlot(input.targetSlotId),
    studyApprovalPath: input.studyApprovalPath,
    readFile: input.readFile,
    sha256: input.sha256,
    nowUtc: input.nowUtc,
    currentHead: input.currentHead,
    alreadyConsumed: input.alreadyConsumed,
    sequencingProbes: input.sequencingProbes,
    outputRootProbes: input.outputRootProbes,
    forbiddenOutputRootContainers: input.forbiddenOutputRootContainers,
    ...(input.studyRoot === undefined ? {} : { studyRoot: input.studyRoot }),
  });
  if (!composed.granted) {
    return refuse(
      'COMPOSED_SLOT_DECISION',
      `${composed.failedGate}/${composed.refusal}: ${composed.detail}`,
      preflight,
      composed,
    );
  }

  // Every §5 condition is satisfied — and this build still launches nothing.
  return refuse(
    'SEMANTIC_DISPATCH_NOT_IMPLEMENTED',
    `every F3 execution gate is satisfied for ${composed.slot.slotId} under build ${composed.executionBuildCommit}, ` +
      'but this build implements the execution-control authority only: no V6 semantic dispatch adapter exists, ' +
      'no provider is constructed and no child is forked. Wiring the approved F2 plan into the coordinator is a ' +
      'separate, separately-authorised slice.',
    preflight,
    composed,
  );
}
