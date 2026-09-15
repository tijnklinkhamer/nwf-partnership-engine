/**
 * PHASE 2B-2D2C-F0J — THE ATTEMPT-3 TRIPLE EXECUTION LOCK.
 *
 * Attempt 3 is a DIFFERENT experiment from attempt 1 and attempt 2, and its
 * lock is a different lock: a different authorisation version, a different
 * closed schema, a different statement, and pins — every one a literal — to
 * the approved+ratified F0I freeze, the F0I plan, the ONE V4 runtime
 * variant, the repair policy and the mechanical call ceiling. Nothing that
 * satisfied the attempt-1 or attempt-2 lock can satisfy this one:
 *
 *   - the attempt-1 authorisation (version `...-f1-...`) and the attempt-2
 *     authorisation (version `...-f0e-...`) are refused BY NAME before the
 *     schema runs;
 *   - the CONSUMED attempt-1, attempt-2 AND attempt-3 authorisation bytes
 *     are refused by exact SHA-256, whatever they parse to. The attempt-3
 *     one (F0K) is the authorisation whose invocation was refused BEFORE
 *     inference by the stale child-manifest variant set: it produced zero
 *     evaluations, but it was physically consumed, and physical consumption
 *     is permanent. A replacement attempt-3 run needs NEW owner bytes;
 *   - an authorisation naming the F0B or F0E freeze hash, attempt 1,
 *     attempt 2, or any of the three prior variants (V1, V2, V3) as a
 *     scheduled candidate is refused by the closed schema;
 *   - a valid authorisation consumed once under an output root is refused
 *     the second time (the consumption marker is named by its hash).
 *
 * As in F0C/F0F: both halves — `--execute` AND `--authorisation <absolute
 * path>` — are required, and the lock is evaluated BEFORE any provider
 * construction, any authentication-status invocation, any child execution
 * and any output-directory mutation. There is no alternate flag,
 * environment variable or undocumented path. This module does NOT create,
 * template or emit an authorisation file: the owner writes one.
 *
 * The closed schema pins, as literals: the F0I owner-approval record hash
 * AND the F0I owner-approval RATIFICATION record hash (both, inside the
 * statement), the variant's prompt identity (version and SHA-256), the
 * mechanical ADAPTER-attempt ceiling (61 x 3 = 183), the exact frozen
 * ordinal sequence 1..12, an explicit zero rerun count for EACH of the
 * three prior variants (V1, V2, V3 - never just the two attempt-1 ones),
 * and an explicit `NONE` for HOLDOUT, gold-label, threshold, database and
 * migration writes. Every one of these is a literal; an authorisation
 * carrying any other value is AUTHORISATION_MALFORMED.
 * `verifyAttempt3AuthorisationCandidate` is the VERIFICATION-ONLY entry the
 * plan-only CLI uses to prove a candidate would be accepted structurally:
 * it evaluates exactly the same checks and grants nothing, because its only
 * caller has no execution branch.
 *
 * Pure aside from the injected reader, hasher and clock. No network, no
 * database, no filesystem of its own.
 */
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { REPAIR_MINIMUM_REMAINING_BUDGET_MS } from '../../../../orgunits/classify/repair.js';
import {
  EXPECTED_LOGICAL_BATCHES_PER_VARIANT,
  FROZEN_MAX_TRANSIENT_RETRIES,
} from '../constants.js';
import {
  ATTEMPT_3_NO,
  F0I_APPROVAL_RECORD_RAW_SHA256,
  F0I_RATIFICATION_RECORD_RAW_SHA256,
  F0I_VARIANT,
  PROPOSED_F0I_FREEZE_RAW_SHA256,
  PROPOSED_F0I_PLAN_SHA256,
  SPENT_ATTEMPT_1_AUTHORISATION_SHA256,
  SPENT_ATTEMPT_2_AUTHORISATION_SHA256,
  SPENT_ATTEMPT_3_AUTHORISATION_SHA256,
  SPENT_ATTEMPT_3_CONSUMPTION_RECORD_SHA256,
} from './freezeF0I.js';

export const ATTEMPT3_AUTHORISATION_VERSION = 'phase2b-2d2c-f0i-execution-authorisation-v1';

/** Prior-attempt authorisation versions, named so they can be REFUSED by exact value, never accepted. */
export const ATTEMPT_1_AUTHORISATION_VERSION = 'phase2b-2d2c-f1-execution-authorisation-v1';
export const ATTEMPT_2_AUTHORISATION_VERSION = 'phase2b-2d2c-f0e-execution-authorisation-v1';

/** The mechanical call ceiling the F0I freeze derives: 12 original + at most 49 repair requests. */
export const ATTEMPT3_MAX_PROVIDER_REQUESTS = 61;

/** The mechanical adapter-attempt ceiling: every provider request may make at most 1 + FROZEN_MAX_TRANSIENT_RETRIES adapter attempts (61 x 3 = 183). */
export const ATTEMPT3_MAX_ADAPTER_ATTEMPTS =
  ATTEMPT3_MAX_PROVIDER_REQUESTS * (1 + FROZEN_MAX_TRANSIENT_RETRIES);

/** The frozen logical-batch ordinals in the ONE order the plan executes them: 1..12, nothing else, nothing reordered. */
export const ATTEMPT3_FROZEN_ORDINALS: readonly number[] = Object.freeze(
  Array.from({ length: EXPECTED_LOGICAL_BATCHES_PER_VARIANT }, (_, index) => index + 1),
);

/** The three prior variants attempt 3 must schedule ZERO times; their artifacts are read-only comparators. */
export const PRIOR_VARIANTS_NEVER_RERUN = [
  'PROMPT_V1_CANONICAL',
  'PROMPT_V2_CANONICAL',
  'PROMPT_V3_CANONICAL',
] as const;

/**
 * The one unmistakable owner statement for attempt 3. Compared byte for
 * byte; never normalised. Every identity in it is a literal pin from this
 * module's imports - the F0I freeze, its plan, its owner-approval AND
 * ratification records, the V4 runtime, the prompt SHA-256, the repair
 * policy and BOTH mechanical ceilings. While no F0I approval or
 * ratification record is pinned the statement is deliberately unissuable
 * (it then names `<NO ... RECORD IS PINNED; NOTHING IS AUTHORISABLE>`).
 */
export const ATTEMPT3_AUTHORISATION_STATEMENT =
  'I AUTHORISE PHASE 2B-2D2C DEVELOPMENT-ONLY EXECUTION OF ATTEMPT 3: AT MOST 12 LOGICAL ' +
  'EVALUATIONS OF PROMPT_V4_CANONICAL (FROZEN ORDINALS 1..12, ONE VARIANT; NO ' +
  'PROMPT_V1_CANONICAL, PROMPT_V2_CANONICAL OR PROMPT_V3_CANONICAL RERUN) AGAINST THE ' +
  `APPROVED F0I FREEZE ${PROPOSED_F0I_FREEZE_RAW_SHA256} WITH DERIVED PLAN ${PROPOSED_F0I_PLAN_SHA256}, ` +
  `F0I OWNER-APPROVAL RECORD ${F0I_APPROVAL_RECORD_RAW_SHA256 ?? '<NO F0I APPROVAL RECORD IS PINNED; NOTHING IS AUTHORISABLE>'}, ` +
  `F0I OWNER-APPROVAL RATIFICATION RECORD ${F0I_RATIFICATION_RECORD_RAW_SHA256 ?? '<NO F0I RATIFICATION RECORD IS PINNED; NOTHING IS AUTHORISABLE>'}, ` +
  `RUNTIME ${F0I_VARIANT.gitCommit}, ` +
  `PROMPT SHA-256 ${F0I_VARIANT.runtimePromptSha256}, ` +
  'REPAIR POLICY ENABLED (ONE ROUND PER LOGICAL EVALUATION, 120000 MS USABLE-WINDOW FLOOR), ' +
  `AT MOST ${ATTEMPT3_MAX_PROVIDER_REQUESTS} PROVIDER REQUESTS AND AT MOST ` +
  `${ATTEMPT3_MAX_ADAPTER_ATTEMPTS} ADAPTER ATTEMPTS. ` +
  'NO HOLDOUT. NO GOLD LABEL OR THRESHOLD CHANGE. NO DATABASE OR MIGRATION WRITE.';

/**
 * F0K. The second unmistakable owner sentence an attempt-3 authorisation
 * must carry, and the ONLY place a replacement is described: the pinned
 * `operatorAuthorisationStatement` above is a literal that every attempt-3
 * authorisation shares and may never be edited, so the fact that THIS one
 * follows a preserved pre-inference refusal is stated here, by hash,
 * separately and explicitly. Compared byte for byte; never normalised.
 *
 * The block carrying it is REQUIRED, which is deliberate: the first
 * attempt-3 authorisation did not carry it and is permanently spent, so no
 * attempt-3 authorisation can ever again be issued without acknowledging
 * what happened to that one.
 */
export const ATTEMPT3_REPLACEMENT_STATEMENT =
  'THIS IS A REPLACEMENT ATTEMPT-3 EXECUTION AUTHORISATION. THE FIRST ATTEMPT-3 AUTHORISATION ' +
  `${SPENT_ATTEMPT_3_AUTHORISATION_SHA256} WAS PHYSICALLY CONSUMED ON 2026-09-15 AND IS PERMANENTLY ` +
  `SPENT; ITS CONSUMPTION RECORD IS ${SPENT_ATTEMPT_3_CONSUMPTION_RECORD_SHA256}. THE INVOCATION IT ` +
  'DROVE WAS REFUSED BEFORE ANY INFERENCE (PRE_INFERENCE_REFUSAL): THE TIER-2 CHILD DISPATCH PATH DID ' +
  'NOT ADMIT THE APPROVED PROMPT_V4_CANONICAL VARIANT, SO ZERO LOGICAL EVALUATIONS, ZERO PROVIDER ' +
  'REQUESTS, ZERO ADAPTER ATTEMPTS, ZERO CLASSIFIER RESPONSES AND ZERO REPAIRS OCCURRED. ITS EVIDENCE ' +
  'IS PRESERVED IMMUTABLY AND IS NEVER REUSED, RELABELLED OR EMPTIED. SEMANTIC ATTEMPT 3 HAS NOT BEEN ' +
  'EXECUTED, AND THIS AUTHORISATION AUTHORISES ITS FIRST AND ONLY EXECUTION.';

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const GitSha = z.string().regex(/^[0-9a-f]{40}$/);
const UtcInstant = z.iso.datetime({ offset: false });

export const Attempt3ExecutionAuthorisationSchema = z.strictObject({
  authorisationVersion: z.literal(ATTEMPT3_AUTHORISATION_VERSION),
  scope: z.literal('DEVELOPMENT_ONLY'),
  attemptNo: z.literal(ATTEMPT_3_NO),
  freezeConfigRawSha256: z.literal(PROPOSED_F0I_FREEZE_RAW_SHA256),
  planSha256: z.literal(PROPOSED_F0I_PLAN_SHA256),
  freezeApprovalRecordRawSha256: Sha256,
  freezeApprovalRatificationRecordRawSha256: Sha256,
  variants: z
    .array(
      z.strictObject({
        name: z.literal(F0I_VARIANT.name),
        label: z.literal(F0I_VARIANT.label),
        gitCommit: GitSha,
        /** The prompt identity the V4 runtime carries; pinned by literal. */
        promptVersion: z.literal(F0I_VARIANT.promptVersion),
        promptSha256: z.literal(F0I_VARIANT.runtimePromptSha256),
      }),
    )
    .length(1),
  maxLogicalEvaluations: z.literal(EXPECTED_LOGICAL_BATCHES_PER_VARIANT),
  /** Exactly the frozen ordinals, in the frozen order: [1, 2, ..., 12] and nothing else. */
  frozenLogicalBatchOrdinals: z
    .array(z.int())
    .length(EXPECTED_LOGICAL_BATCHES_PER_VARIANT)
    .refine((ordinals) => ordinals.every((ordinal, index) => ordinal === index + 1), {
      message: 'frozenLogicalBatchOrdinals must be exactly [1, 2, ..., 12] in order.',
    }),
  /** Each of the THREE prior variants is scheduled ZERO times; their artifacts are read-only comparators. */
  priorVariantReruns: z.strictObject({
    PROMPT_V1_CANONICAL: z.literal(0),
    PROMPT_V2_CANONICAL: z.literal(0),
    PROMPT_V3_CANONICAL: z.literal(0),
  }),
  maxProviderRequests: z.literal(ATTEMPT3_MAX_PROVIDER_REQUESTS),
  maxAdapterAttempts: z.literal(ATTEMPT3_MAX_ADAPTER_ATTEMPTS),
  repairPolicy: z.strictObject({
    enabled: z.literal(true),
    maxRoundsPerLogicalEvaluation: z.literal(1),
    minimumRemainingBudgetMs: z.literal(REPAIR_MINIMUM_REMAINING_BUDGET_MS),
  }),
  /** Explicit, literal prohibitions; any other value - including a missing key - is malformed. */
  prohibitions: z.strictObject({
    holdout: z.literal('NONE'),
    goldLabelChanges: z.literal('NONE'),
    thresholdChanges: z.literal('NONE'),
    databaseWrites: z.literal('NONE'),
    migrationWrites: z.literal('NONE'),
  }),
  /**
   * F0K: the replacement binding. Every member is a literal, so an
   * authorisation that names the wrong superseded bytes, the wrong
   * consumption record, a non-zero execution count, an outcome other than
   * PRE_INFERENCE_REFUSAL, or a different replacement sentence is
   * AUTHORISATION_MALFORMED.
   */
  replacementOf: z.strictObject({
    supersededAuthorisationSha256: z.literal(SPENT_ATTEMPT_3_AUTHORISATION_SHA256),
    supersededConsumptionRecordSha256: z.literal(SPENT_ATTEMPT_3_CONSUMPTION_RECORD_SHA256),
    supersededOutcome: z.literal('PRE_INFERENCE_REFUSAL'),
    /** How many times semantic attempt 3 has actually executed: zero, or this is not a replacement. */
    priorSemanticAttemptExecutions: z.literal(0),
    operatorReplacementStatement: z.literal(ATTEMPT3_REPLACEMENT_STATEMENT),
  }),
  outputRoot: z.string().min(1),
  issuedAtUtc: UtcInstant,
  validUntilUtc: UtcInstant,
  operatorAuthorisationStatement: z.literal(ATTEMPT3_AUTHORISATION_STATEMENT),
});

export type Attempt3ExecutionAuthorisation = z.infer<typeof Attempt3ExecutionAuthorisationSchema>;

export type Attempt3ExecutionLockRefusal =
  | 'EXECUTE_FLAG_ABSENT'
  | 'AUTHORISATION_PATH_ABSENT'
  | 'AUTHORISATION_PATH_NOT_ABSOLUTE'
  | 'AUTHORISATION_UNREADABLE'
  | 'SPENT_ATTEMPT_1_AUTHORISATION_PRESENTED'
  | 'SPENT_ATTEMPT_2_AUTHORISATION_PRESENTED'
  | 'SPENT_ATTEMPT_3_AUTHORISATION_PRESENTED'
  | 'ATTEMPT_1_AUTHORISATION_PRESENTED'
  | 'ATTEMPT_2_AUTHORISATION_PRESENTED'
  | 'AUTHORISATION_MALFORMED'
  | 'AUTHORISATION_EXPIRED'
  | 'AUTHORISATION_NOT_YET_VALID'
  | 'AUTHORISATION_VARIANT_MISMATCH'
  | 'AUTHORISATION_OUTPUT_ROOT_MISMATCH'
  | 'AUTHORISATION_ATTEMPT_MISMATCH'
  | 'AUTHORISATION_ALREADY_CONSUMED'
  | 'FREEZE_APPROVAL_RECORD_MISMATCH'
  | 'FREEZE_APPROVAL_RATIFICATION_RECORD_MISMATCH';

export type Attempt3ExecutionLockDecision =
  | {
      readonly granted: true;
      readonly authorisation: Attempt3ExecutionAuthorisation;
      /** SHA-256 of the exact authorisation bytes - the identity a consumption marker records. */
      readonly authorisationSha256: string;
    }
  | {
      readonly granted: false;
      readonly refusal: Attempt3ExecutionLockRefusal;
      readonly detail: string;
    };

export interface Attempt3ExecutionLockInput {
  readonly executeFlag: boolean;
  readonly authorisationPath: string | null;
  /** What the runner itself verified and will use. */
  readonly expected: {
    readonly outputRoot: string;
    readonly attemptNo: number;
  };
  readonly readFile: (path: string) => Buffer;
  readonly sha256: (bytes: Buffer) => string;
  readonly alreadyConsumed: (authorisationSha256: string) => boolean;
  readonly nowUtc: () => Date;
}

const refuse = (
  refusal: Attempt3ExecutionLockRefusal,
  detail: string,
): Attempt3ExecutionLockDecision => ({ granted: false, refusal, detail });

/**
 * Evaluates both halves of the attempt-3 lock. A caller that presents only
 * one half, an attempt-1 or attempt-2 lock, the spent attempt-1/attempt-2
 * bytes, or any value that is not the approved+ratified F0I identity never
 * reaches a granted decision.
 */
export function evaluateAttempt3ExecutionLock(
  input: Attempt3ExecutionLockInput,
): Attempt3ExecutionLockDecision {
  if (!input.executeFlag) {
    return refuse('EXECUTE_FLAG_ABSENT', 'execution requires the explicit --execute flag.');
  }
  if (input.authorisationPath === null) {
    return refuse(
      'AUTHORISATION_PATH_ABSENT',
      'execution requires an explicit --authorisation <absolute path>; --execute alone enables nothing.',
    );
  }
  if (!isAbsolute(input.authorisationPath)) {
    return refuse(
      'AUTHORISATION_PATH_NOT_ABSOLUTE',
      'the authorisation path must be absolute; a relative path would depend on the working directory.',
    );
  }
  let bytes: Buffer;
  try {
    bytes = input.readFile(input.authorisationPath);
  } catch (error) {
    return refuse(
      'AUTHORISATION_UNREADABLE',
      `the authorisation file could not be read (${error instanceof Error ? error.message : String(error)}).`,
    );
  }
  const authorisationSha256 = input.sha256(bytes);
  if (authorisationSha256 === SPENT_ATTEMPT_1_AUTHORISATION_SHA256) {
    return refuse(
      'SPENT_ATTEMPT_1_AUTHORISATION_PRESENTED',
      'these are the exact bytes of the attempt-1 authorisation consumed on 2026-09-13; attempt 3 requires a NEW owner authorisation.',
    );
  }
  if (authorisationSha256 === SPENT_ATTEMPT_2_AUTHORISATION_SHA256) {
    return refuse(
      'SPENT_ATTEMPT_2_AUTHORISATION_PRESENTED',
      'these are the exact bytes of the attempt-2 authorisation consumed on 2026-09-14; attempt 3 requires a NEW owner authorisation.',
    );
  }
  // F0K. Root-independent and permanent: the consumption marker under an
  // output root cannot refuse these bytes under a DIFFERENT output root, and
  // a replacement attempt-3 run uses a different output root by construction.
  if (authorisationSha256 === SPENT_ATTEMPT_3_AUTHORISATION_SHA256) {
    return refuse(
      'SPENT_ATTEMPT_3_AUTHORISATION_PRESENTED',
      'these are the exact bytes of the FIRST attempt-3 authorisation, consumed on 2026-09-15; its invocation was refused before any inference (PRE_INFERENCE_REFUSAL), but consumption is physical and permanent, so a replacement attempt-3 run requires NEW owner authorisation bytes.',
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    return refuse('AUTHORISATION_MALFORMED', 'the authorisation file is not valid JSON.');
  }
  const version = (parsed as { authorisationVersion?: unknown } | null)?.authorisationVersion;
  if (version === ATTEMPT_1_AUTHORISATION_VERSION) {
    return refuse(
      'ATTEMPT_1_AUTHORISATION_PRESENTED',
      `the file is an attempt-1 authorisation (${ATTEMPT_1_AUTHORISATION_VERSION}); attempt 3 requires ${ATTEMPT3_AUTHORISATION_VERSION}.`,
    );
  }
  if (version === ATTEMPT_2_AUTHORISATION_VERSION) {
    return refuse(
      'ATTEMPT_2_AUTHORISATION_PRESENTED',
      `the file is an attempt-2 authorisation (${ATTEMPT_2_AUTHORISATION_VERSION}); attempt 3 requires ${ATTEMPT3_AUTHORISATION_VERSION}.`,
    );
  }
  const result = Attempt3ExecutionAuthorisationSchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    return refuse(
      'AUTHORISATION_MALFORMED',
      `the authorisation does not match the closed attempt-3 schema at ` +
        `${first ? first.path.join('.') || '<root>' : '<unknown>'}: ${first?.message ?? 'unknown'}.`,
    );
  }
  const authorisation = result.data;
  if (
    F0I_APPROVAL_RECORD_RAW_SHA256 === null ||
    authorisation.freezeApprovalRecordRawSha256 !== F0I_APPROVAL_RECORD_RAW_SHA256
  ) {
    return refuse(
      'FREEZE_APPROVAL_RECORD_MISMATCH',
      `the authorisation names freezeApprovalRecordRawSha256 ${authorisation.freezeApprovalRecordRawSha256}; the pinned F0I approval record is ${F0I_APPROVAL_RECORD_RAW_SHA256 ?? '<none pinned>'}.`,
    );
  }
  if (
    F0I_RATIFICATION_RECORD_RAW_SHA256 === null ||
    authorisation.freezeApprovalRatificationRecordRawSha256 !== F0I_RATIFICATION_RECORD_RAW_SHA256
  ) {
    return refuse(
      'FREEZE_APPROVAL_RATIFICATION_RECORD_MISMATCH',
      `the authorisation names freezeApprovalRatificationRecordRawSha256 ${authorisation.freezeApprovalRatificationRecordRawSha256}; the pinned F0I ratification record is ${F0I_RATIFICATION_RECORD_RAW_SHA256 ?? '<none pinned>'}.`,
    );
  }
  const now = input.nowUtc().getTime();
  const issuedAt = Date.parse(authorisation.issuedAtUtc);
  const validUntil = Date.parse(authorisation.validUntilUtc);
  if (!(validUntil > issuedAt)) {
    return refuse('AUTHORISATION_MALFORMED', 'validUntilUtc must be after issuedAtUtc.');
  }
  if (now < issuedAt) {
    return refuse('AUTHORISATION_NOT_YET_VALID', 'the authorisation is not yet valid.');
  }
  if (now > validUntil) {
    return refuse('AUTHORISATION_EXPIRED', 'the authorisation validity window has passed.');
  }
  const given = authorisation.variants[0]!;
  if (given.gitCommit !== F0I_VARIANT.gitCommit) {
    return refuse(
      'AUTHORISATION_VARIANT_MISMATCH',
      `the authorisation names ${given.name} at ${given.gitCommit}; the frozen V4 runtime is ${F0I_VARIANT.gitCommit}.`,
    );
  }
  if (authorisation.outputRoot !== input.expected.outputRoot) {
    return refuse(
      'AUTHORISATION_OUTPUT_ROOT_MISMATCH',
      'the authorised output root is not the output root supplied to this invocation.',
    );
  }
  if (authorisation.attemptNo !== input.expected.attemptNo) {
    return refuse(
      'AUTHORISATION_ATTEMPT_MISMATCH',
      `the authorised attempt number (${authorisation.attemptNo}) is not the requested one (${input.expected.attemptNo}).`,
    );
  }
  if (input.alreadyConsumed(authorisationSha256)) {
    return refuse(
      'AUTHORISATION_ALREADY_CONSUMED',
      'this exact authorisation was already consumed under the output root; a re-attempt needs a new authorisation.',
    );
  }
  return { granted: true, authorisation, authorisationSha256 };
}

/**
 * VERIFICATION ONLY. Evaluates every check of the attempt-3 lock against a
 * CANDIDATE authorisation file exactly as the execution path would - the
 * same schema, pins, approval and ratification records, window, variant,
 * output root, attempt number and consumption marker - and returns the
 * decision. It grants nothing: its only caller is the plan-only CLI path,
 * which has no execution branch, constructs no provider, launches no child
 * and writes no marker. A `granted: true` here means "this exact byte
 * sequence WOULD be accepted if the owner issued it and presented it with
 * --execute"; it never means that it has been.
 */
export function verifyAttempt3AuthorisationCandidate(
  input: Omit<Attempt3ExecutionLockInput, 'executeFlag'>,
): Attempt3ExecutionLockDecision {
  return evaluateAttempt3ExecutionLock({ ...input, executeFlag: true });
}
