/**
 * PHASE 2B-2D2C-F6 — THE F5 HOST-SLEEP STRUCTURAL CLOSURE, PINNED.
 *
 * F5 ran the owner-approved final V6 N=5 DEV study once and ended PAUSED:
 * V6_REP_1..3 complete, V6_REP_4 Class C STOPPED at evaluation 10, V6_REP_5
 * AMBIGUOUS. `docs/evaluation/PHASE_2B_2D2C_F5_HOST_SLEEP_STRUCTURAL_CLOSURE_V1.json`
 * records, from control-plane evidence only, that F5 can no longer satisfy its
 * frozen 5/5 completion rule and that the interruption coincides with macOS
 * host sleep. This module loads that record by exact hash and exposes the
 * identities F6 must keep separate from itself.
 *
 * IT RECLASSIFIES NOTHING. The durable F5 classifications are the ones the
 * frozen runtime recorded; the schema below refuses a record that forces
 * V6_REP_5 into Class B or C, that marks V6_REP_4 recoverable, or that draws
 * any semantic verdict from F5.
 *
 * PURE apart from the bytes its caller hands it.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { EXPECTED_CORPUS_ITEM_COUNT, EXPECTED_LOGICAL_BATCHES_PER_VARIANT } from '../constants.js';
import {
  F2_CONTROL_ROOT,
  F2_STUDY_ROOT,
  PROPOSED_F2_FREEZE_RAW_SHA256,
  PROPOSED_F2_PLAN_SHA256,
} from '../f2/freezeF2.js';
import { F2_SLOTS } from '../f2/studyPlanCoreF2.js';

export const F5_CLOSURE_PATH =
  'docs/evaluation/PHASE_2B_2D2C_F5_HOST_SLEEP_STRUCTURAL_CLOSURE_V1.json';
export const F5_CLOSURE_RAW_SHA256 =
  'a9cffba1c2d4f10755241d95d7d251a7214d3d212b64ade37940c01aedfaf2b9';
export const F5_CLOSURE_RAW_BYTES = 15_959;

/** The F5 study, as it ran. These are the identities F6 must never reuse or pool with. */
export const F5_STUDY_ID = 'FINAL_V6_DEV_N5';
export const F5_RUNNER_EXECUTION_BUILD_COMMIT = '1b000dda59803f804c5f03430733e711f67949d7';
export const F5_STUDY_ROOT = F2_STUDY_ROOT;
export const F5_CONTROL_ROOT = F2_CONTROL_ROOT;
export const F5_STUDY_EXECUTION_APPROVAL_SHA256 =
  'aed64a864c5e46ea2d58fac696c091dfea7fd5118e49f70b01fabc605266299d';
export const F5_STUDY_EXECUTION_APPROVAL_BYTES = 4_098;
export const F5_STUDY_ROOT_FILE_COUNT = 567;
export const F5_STUDY_ROOT_INVENTORY_SHA256 =
  'fc9d8aac1e8ba22429c99be3295078a58268dcbacb00390ee1bfb0c6394287db';
export const F5_CONTROL_ROOT_FILE_COUNT = 14;
export const F5_CONTROL_ROOT_INVENTORY_SHA256 =
  '266fde835f0477fb2af55dd422c05c7048a5ea436b74ddf16e54364e07ec610a';

/** The five consumed F4 candidate authorisations F5 ran under. Spent; never valid again anywhere. */
export const F5_CONSUMED_CANDIDATE_SHA256S: readonly string[] = Object.freeze([
  '5e56f40371561043098bc0ce06cc8f2f99a3f7896d15d415393e3bc5c0fda87d',
  'a8a570a0790e4faca2f5ba31003bb0a463b7b4d3e33b31c2064c86b400b32247',
  'c35f820887032aa684141b5f727784b77e60ace95738ffb9a570a7ce250ed8b5',
  'aa8e7ea50849396b70b386c2323aa37c4588c5d6c0cd9283ed799584c603dba1',
  'ca12fbba74b139712c91b2e0c9d33c70bd34b745d25b1f12bdffbd4fdf9bbe30',
]);

export const F5_CANNOT_SATISFY_MARKER = 'F5_CANNOT_SATISFY_FROZEN_5_OF_5_COMPLETION_RULE';
export const F5_NO_SEMANTIC_VERDICT_MARKER = 'NO_SEMANTIC_DEV_VERDICT_DRAWN_FROM_F5';
export const F5_HOST_SLEEP_CONCLUSION =
  'CONTROL-PLANE EVIDENCE IS CONSISTENT WITH HOST SLEEP / WHOLE-HOST SUSPENSION AND MOTIVATES A FRESH STUDY RESTART.';

export type F5ClosureErrorReason = 'HASH_MISMATCH' | 'PARSE_ERROR' | 'SHAPE_MISMATCH';

export class F5ClosureError extends Error {
  override readonly name = 'F5ClosureError';
  declare readonly reason: F5ClosureErrorReason;
  constructor(reason: F5ClosureErrorReason, message: string) {
    super(message);
    Object.defineProperty(this, 'reason', { value: reason, enumerable: true });
  }
}

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);

const CompleteSlotSchema = z.looseObject({
  inclusionClass: z.literal('C'),
  recordedEvent: z.literal('SLOT_COMPLETED_CLASS_C'),
  experimentStatus: z.literal('COMPLETED_ALL_PLANNED'),
  plannedLogicalEvaluations: z.literal(EXPECTED_LOGICAL_BATCHES_PER_VARIANT),
  evaluationsStartedAndClosed: z.literal(EXPECTED_LOGICAL_BATCHES_PER_VARIANT),
  itemsStructurallyObserved: z.literal(EXPECTED_CORPUS_ITEM_COUNT),
  stopCondition: z.null(),
});

export const F5ClosureSchema = z.looseObject({
  closureId: z.literal('PHASE_2B_2D2C_F5_HOST_SLEEP_STRUCTURAL_CLOSURE_V1'),
  closureVersion: z.literal('phase2b-2d2c-f5-host-sleep-structural-closure-v1'),
  scope: z.looseObject({ evidenceClass: z.literal('CONTROL_PLANE_ONLY') }),
  zeroRequestConfirmation: z.strictObject({
    providerCalls: z.literal(0),
    classifierInference: z.literal(0),
    authStatusInvocations: z.literal(0),
    scoring: z.literal(0),
    devGoldLoaded: z.literal(false),
    scorerLoaded: z.literal(false),
    holdoutAccessed: z.literal(false),
    f5EvidenceModified: z.literal(false),
  }),
  f5Study: z.looseObject({
    studyId: z.literal(F5_STUDY_ID),
    runnerExecutionBuildCommit: z.literal(F5_RUNNER_EXECUTION_BUILD_COMMIT),
    f2FreezeRawSha256: z.literal(PROPOSED_F2_FREEZE_RAW_SHA256),
    f2PlanSha256: z.literal(PROPOSED_F2_PLAN_SHA256),
    studyRoot: z.literal(F5_STUDY_ROOT),
    controlRoot: z.literal(F5_CONTROL_ROOT),
    studyExecutionApproval: z.looseObject({
      rawSha256: z.literal(F5_STUDY_EXECUTION_APPROVAL_SHA256),
      rawBytes: z.literal(F5_STUDY_EXECUTION_APPROVAL_BYTES),
    }),
    terminalOutcome: z.literal('PAUSED'),
    consumedCandidateAuthorisationSha256s: z.array(Sha256).length(5),
  }),
  inventory: z.looseObject({
    studyRoot: z.looseObject({
      fileCount: z.literal(F5_STUDY_ROOT_FILE_COUNT),
      inventorySha256: z.literal(F5_STUDY_ROOT_INVENTORY_SHA256),
    }),
    controlRoot: z.looseObject({
      fileCount: z.literal(F5_CONTROL_ROOT_FILE_COUNT),
      inventorySha256: z.literal(F5_CONTROL_ROOT_INVENTORY_SHA256),
    }),
    immutable: z.literal(true),
  }),
  slots: z.tuple([
    CompleteSlotSchema.extend({ sequence: z.literal(1), slotId: z.literal('V6_REP_1') }),
    CompleteSlotSchema.extend({ sequence: z.literal(2), slotId: z.literal('V6_REP_2') }),
    CompleteSlotSchema.extend({ sequence: z.literal(3), slotId: z.literal('V6_REP_3') }),
    z.looseObject({
      sequence: z.literal(4),
      slotId: z.literal('V6_REP_4'),
      inclusionClass: z.literal('C'),
      recordedEvent: z.literal('SLOT_COMPLETED_CLASS_C'),
      experimentStatus: z.literal('STOPPED'),
      evaluationsStartedAndClosed: z.literal(10),
      itemsStructurallyObserved: z.literal(34),
      stopCondition: z.literal('TIER2_WATCHDOG_FIRED_BEFORE_TIER1_TIMEOUT'),
      itemAccounting: z.looseObject({ total: z.literal(EXPECTED_CORPUS_ITEM_COUNT) }),
      recoverableInsideF5: z.literal(false),
      rerun: z.literal(false),
      replaced: z.literal(false),
    }),
    z.looseObject({
      sequence: z.literal(5),
      slotId: z.literal('V6_REP_5'),
      inclusionClass: z.literal('AMBIGUOUS'),
      recordedEvent: z.literal('SLOT_AMBIGUOUS'),
      itemsStructurallyObserved: z.literal(0),
      confirmedProviderRequest: z.literal(false),
      mechanicalResolutionAttempt: z.looseObject({ result: z.literal('NOT_RESOLVED') }),
      forcedIntoClassB: z.literal(false),
      forcedIntoClassC: z.literal(false),
    }),
  ]),
  structuralConclusion: z.looseObject({
    markers: z.tuple([
      z.literal(F5_CANNOT_SATISFY_MARKER),
      z.literal(F5_NO_SEMANTIC_VERDICT_MARKER),
    ]),
    completeReplicates: z.literal(3),
    requiredCompleteReplicates: z.literal(5),
    f5Scored: z.literal(false),
  }),
  hostSleepIncident: z.looseObject({
    systemSleepBeganUtc: z.literal('2026-09-17T08:44:27Z'),
    conclusion: z.literal(F5_HOST_SLEEP_CONCLUSION),
  }),
  consequence: z.looseObject({
    f5RecoveredInPlace: z.literal(false),
    rep4RerunOrReplaced: z.literal(false),
    rep5RerunOrReplaced: z.literal(false),
    nextStudyIsAFreshStudyNotF5Recovery: z.literal(true),
    f5ObservationsCountTowardNextStudy: z.literal(0),
    f5AndNextStudyNeverPooled: z.literal(true),
  }),
  thisRecordAuthorises: z.array(z.never()).length(0),
});

export type F5Closure = z.infer<typeof F5ClosureSchema>;

export interface LoadedF5Closure {
  readonly closure: F5Closure;
  readonly rawSha256: string;
  readonly rawBytes: number;
}

/** Hash first, parse second, shape third — drifted bytes never reach the parser. */
export function loadF5ClosureFromBytes(bytes: Buffer): LoadedF5Closure {
  const rawSha256 = createHash('sha256').update(bytes).digest('hex');
  if (rawSha256 !== F5_CLOSURE_RAW_SHA256 || bytes.byteLength !== F5_CLOSURE_RAW_BYTES) {
    throw new F5ClosureError(
      'HASH_MISMATCH',
      `F5 closure is ${bytes.byteLength} bytes hashing to ${rawSha256}; ` +
        `${F5_CLOSURE_RAW_BYTES} bytes hashing to ${F5_CLOSURE_RAW_SHA256} are pinned.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new F5ClosureError('PARSE_ERROR', `F5 closure is not valid JSON: ${String(error)}`);
  }
  const shape = F5ClosureSchema.safeParse(parsed);
  if (!shape.success) {
    throw new F5ClosureError('SHAPE_MISMATCH', `F5 closure shape: ${shape.error.message}`);
  }
  return { closure: shape.data, rawSha256, rawBytes: bytes.byteLength };
}

/** The F5 slot ids, in their recorded order. F6 must never admit any of them. */
export const F5_SLOT_IDS: readonly string[] = Object.freeze(F2_SLOTS.map((slot) => slot.slotId));
