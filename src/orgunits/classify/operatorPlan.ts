/**
 * THE OPERATOR EXECUTION PLAN — a READ-ONLY, provider-free preflight over
 * every batch one organisation's one completed research run assembles to,
 * at one operator-chosen attempt number (CLASSIFIER_OPERATOR_ENTRY_POINT_V1).
 *
 * WHY IT EXISTS. `runOrganisationClassification` reuses a COMPLETED call at
 * an exact identity, and otherwise INSERTs a new call row before invoking
 * the provider. A PARTIAL / FAILED / un-completed call at the same identity
 * is deliberately not reusable (`persist.ts`), so re-running the same
 * attempt would reach `insertClassifierCall` and fail on migration 0009's
 * identity unique index — possibly after an earlier batch of the same
 * organisation had already spent a provider call. This planner turns that
 * accidental database error into a deterministic, GLOBAL operator decision
 * made before anything is written or invoked: every batch is assembled and
 * every identity inspected first, and a single collision refuses the whole
 * execution start.
 *
 * WHAT IT DOES NOT DO. It never chooses another attempt number, never
 * retries, never writes, never constructs or invokes a provider, and never
 * re-implements assembly or identity: assembly is the landed
 * `assembleClassifierHandoff` (which also enforces run completion and
 * `assertRunBelongsToOrganisation`), and identity is the one shared
 * `buildClassifierCallIdentity` the orchestrator itself uses.
 *
 * `pool` MUST be a `classifier`-role pool. `runCompletion` comes from the
 * caller's research-role `checkRunCompleted`, exactly as for the runtime.
 *
 * WHAT THE PLAN GUARANTEES. All-or-nothing START authority only: once
 * provider execution begins, multi-batch persistence is per-call, exactly
 * as the runtime always was. A concurrent writer between plan and execution
 * is still stopped by the unique index — as an error, never an overwrite.
 */
import type pg from 'pg';
import { assembleClassifierHandoff } from './assemble.js';
import { buildClassifierCallIdentity } from './callIdentity.js';
import { findCallStateAtIdentity, type PersistedIdentityState } from './persist.js';
import type { RunCompletionStatus } from './runStatus.js';

export type OperatorBatchPlanState =
  'READY_NEW_ATTEMPT' | 'REUSABLE_COMPLETED' | 'ATTEMPT_ALREADY_EXISTS_NON_COMPLETED';

export interface OperatorBatchPlan {
  readonly batchIndex: number;
  readonly documentCount: number;
  readonly inputSha256: string;
  readonly state: OperatorBatchPlanState;
  /** What is persisted at this exact identity (`ABSENT` when nothing is). */
  readonly persistedState: PersistedIdentityState;
  /** The existing call at this identity, when one exists. */
  readonly existingCallId: string | null;
  readonly existingErrorKind: string | null;
}

export type OperatorPlan =
  | {
      readonly kind: 'NO_CANDIDATES';
      readonly organisationId: string;
      readonly runId: string;
      readonly modelId: string;
      readonly attemptNo: number;
    }
  | {
      readonly kind: 'BATCHES';
      readonly organisationId: string;
      readonly runId: string;
      readonly modelId: string;
      readonly attemptNo: number;
      readonly batches: readonly OperatorBatchPlan[];
      /** True iff NO batch is `ATTEMPT_ALREADY_EXISTS_NON_COMPLETED`. */
      readonly executionPermitted: boolean;
      /** True iff at least one batch would make a NEW provider call. */
      readonly requiresProvider: boolean;
    };

export interface OperatorPlanInput {
  readonly organisationId: string;
  readonly runId: string;
  readonly runCompletion: RunCompletionStatus;
  readonly modelId: string;
  readonly attemptNo: number;
}

/** PURE: one persisted identity state -> the batch's plan state. */
export function planStateFor(persisted: PersistedIdentityState): OperatorBatchPlanState {
  switch (persisted) {
    case 'ABSENT':
      return 'READY_NEW_ATTEMPT';
    case 'COMPLETED':
      return 'REUSABLE_COMPLETED';
    case 'PARTIAL':
    case 'FAILED':
    case 'NO_COMPLETION_RECORDED':
      return 'ATTEMPT_ALREADY_EXISTS_NON_COMPLETED';
  }
}

export async function planOrganisationClassification(
  pool: pg.Pool,
  input: OperatorPlanInput,
): Promise<OperatorPlan> {
  if (!Number.isSafeInteger(input.attemptNo) || input.attemptNo < 1) {
    throw new Error('planOrganisationClassification: attemptNo must be an integer >= 1.');
  }
  const assembly = await assembleClassifierHandoff(pool, {
    organisationId: input.organisationId,
    runId: input.runId,
    runCompletion: input.runCompletion,
  });
  const header = {
    organisationId: input.organisationId,
    runId: input.runId,
    modelId: input.modelId,
    attemptNo: input.attemptNo,
  };
  if (assembly.kind === 'NO_CANDIDATES') {
    return { kind: 'NO_CANDIDATES', ...header };
  }

  const batches: OperatorBatchPlan[] = [];
  for (const [batchIndex, assembled] of assembly.batches.entries()) {
    const identity = buildClassifierCallIdentity({
      assemblyInputSha256: assembled.assemblyInputSha256,
      modelId: input.modelId,
      attemptNo: input.attemptNo,
    });
    const persisted = await findCallStateAtIdentity(pool, identity);
    batches.push({
      batchIndex,
      documentCount: assembled.batch.documents.length,
      inputSha256: identity.inputSha256,
      state: planStateFor(persisted.state),
      persistedState: persisted.state,
      existingCallId: persisted.callId,
      existingErrorKind: persisted.errorKind,
    });
  }

  return {
    kind: 'BATCHES',
    ...header,
    batches,
    executionPermitted: batches.every((b) => b.state !== 'ATTEMPT_ALREADY_EXISTS_NON_COMPLETED'),
    requiresProvider: batches.some((b) => b.state === 'READY_NEW_ATTEMPT'),
  };
}
