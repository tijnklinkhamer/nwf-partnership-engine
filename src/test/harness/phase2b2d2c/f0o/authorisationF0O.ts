/**
 * PHASE 2B-2D2C-F0P — THE ATTEMPT-4 EXECUTION LOCK.
 *
 * Attempt 4 is a DIFFERENT experiment from attempts 1, 2 and 3, and its lock
 * is a different lock: a different authorisation version, a different closed
 * schema, a different statement, and pins — every one a literal — to the
 * approved F0O freeze, the F0O plan, the ONE V5 runtime variant, the repair
 * policy and the mechanical call ceiling. Nothing that satisfied the
 * attempt-1, attempt-2 or attempt-3 lock can satisfy this one:
 *
 *   - the attempt-1 authorisation (version `...-f1-...`), the attempt-2
 *     authorisation (version `...-f0e-...`) and the attempt-3 authorisation
 *     (version `...-f0i-...`) are refused BY NAME before the schema runs;
 *   - the CONSUMED attempt-1, attempt-2 and BOTH attempt-3 authorisation
 *     bytes are refused by exact SHA-256, whatever they parse to. Attempt 3
 *     carries two spent authorisations: the first
 *     (`d7a66ad4834753be4b6c07cb7aac5f279181d0da9b92f541c07ca0b00b81d7d4`)
 *     was physically consumed by a run refused before any inference
 *     (PRE_INFERENCE_REFUSAL, F0K), and its replacement
 *     (`7feb00b2ab5a04db56e1949532269289880ac8f82c1e8bfe196ef0b2fe746bd4`)
 *     was later issued and actually executed
 *     (`COMPLETED_ALL_PLANNED`). Neither may drive attempt 4;
 *   - an authorisation naming the F0B, F0E or F0I freeze hash, attempt 1,
 *     attempt 2, attempt 3, or any of the four prior variants (V1, V2, V3,
 *     V4) as a scheduled candidate is refused by the closed schema;
 *   - a valid authorisation consumed once under an output root is refused
 *     the second time (the consumption marker is named by its hash).
 *
 * Attempt 4 is a FRESH semantic attempt: no prior attempt-4 authorisation has
 * ever been issued or consumed, so — unlike the attempt-3 lock F0K built —
 * this lock carries no `replacementOf` block and no companion
 * "preserved-prior-root" classifier. Should a future attempt-4 invocation
 * ever need a replacement, that is a separately-reviewed widening, exactly
 * as F0K was for attempt 3, never something this module pre-empts.
 *
 * As in F0C/F0F/F0J: both halves — `--execute` AND `--authorisation
 * <absolute path>` — are required, and the lock is evaluated BEFORE any
 * provider construction, any authentication-status invocation, any child
 * execution and any output-directory mutation. There is no alternate flag,
 * environment variable or undocumented path. This module does NOT create,
 * template or emit an authorisation file: the owner writes one.
 *
 * The closed schema pins, as literals: the F0O owner-approval record hash
 * (inside the statement), the variant's prompt identity (version and
 * SHA-256), the mechanical ADAPTER-attempt ceiling (61 x 3 = 183), the exact
 * frozen ordinal sequence 1..12, an explicit zero rerun count for EACH of the
 * FOUR prior variants (V1, V2, V3, V4), and an explicit `NONE` for HOLDOUT,
 * gold-label, threshold, prompt, database and migration writes. Every one of
 * these is a literal; an authorisation carrying any other value is
 * AUTHORISATION_MALFORMED. `verifyAttempt4AuthorisationCandidate` is the
 * VERIFICATION-ONLY entry the plan-only CLI uses to prove a candidate would
 * be accepted structurally: it evaluates exactly the same checks and grants
 * nothing, because its only caller has no execution branch.
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
  ATTEMPT_4_NO,
  F0O_APPROVAL_RECORD_RAW_SHA256,
  F0O_VARIANT,
  PROPOSED_F0O_FREEZE_RAW_SHA256,
  PROPOSED_F0O_PLAN_SHA256,
  SPENT_ATTEMPT_1_AUTHORISATION_SHA256,
  SPENT_ATTEMPT_2_AUTHORISATION_SHA256,
  SPENT_ATTEMPT_3_AUTHORISATION_SHA256,
  SPENT_ATTEMPT_3_REPLACEMENT_AUTHORISATION_SHA256,
} from './freezeF0O.js';

export const ATTEMPT4_AUTHORISATION_VERSION = 'phase2b-2d2c-f0o-execution-authorisation-v1';

/** Prior-attempt authorisation versions, named so they can be REFUSED by exact value, never accepted. */
export const ATTEMPT_1_AUTHORISATION_VERSION = 'phase2b-2d2c-f1-execution-authorisation-v1';
export const ATTEMPT_2_AUTHORISATION_VERSION = 'phase2b-2d2c-f0e-execution-authorisation-v1';
export const ATTEMPT_3_AUTHORISATION_VERSION = 'phase2b-2d2c-f0i-execution-authorisation-v1';

/** The mechanical call ceiling the F0O freeze derives: 12 original + at most 49 repair requests. */
export const ATTEMPT4_MAX_PROVIDER_REQUESTS = 61;

/** The mechanical adapter-attempt ceiling: every provider request may make at most 1 + FROZEN_MAX_TRANSIENT_RETRIES adapter attempts (61 x 3 = 183). */
export const ATTEMPT4_MAX_ADAPTER_ATTEMPTS =
  ATTEMPT4_MAX_PROVIDER_REQUESTS * (1 + FROZEN_MAX_TRANSIENT_RETRIES);

/** The frozen logical-batch ordinals in the ONE order the plan executes them: 1..12, nothing else, nothing reordered. */
export const ATTEMPT4_FROZEN_ORDINALS: readonly number[] = Object.freeze(
  Array.from({ length: EXPECTED_LOGICAL_BATCHES_PER_VARIANT }, (_, index) => index + 1),
);

/** The four prior variants attempt 4 must schedule ZERO times; their artifacts are read-only comparators. */
export const PRIOR_VARIANTS_NEVER_RERUN = [
  'PROMPT_V1_CANONICAL',
  'PROMPT_V2_CANONICAL',
  'PROMPT_V3_CANONICAL',
  'PROMPT_V4_CANONICAL',
] as const;

/**
 * The one unmistakable owner statement for attempt 4. Compared byte for
 * byte; never normalised. Every identity in it is a literal pin from this
 * module's imports - the F0O freeze, its plan, its owner-approval record,
 * the V5 runtime, the prompt SHA-256, the repair policy and BOTH mechanical
 * ceilings. While no F0O approval record is pinned the statement is
 * deliberately unissuable (it then names
 * `<NO F0O APPROVAL RECORD IS PINNED; NOTHING IS AUTHORISABLE>`).
 */
export const ATTEMPT4_AUTHORISATION_STATEMENT =
  'I AUTHORISE PHASE 2B-2D2C DEVELOPMENT-ONLY EXECUTION OF ATTEMPT 4: AT MOST 12 LOGICAL ' +
  'EVALUATIONS OF PROMPT_V5_CANONICAL (FROZEN ORDINALS 1..12, ONE VARIANT; NO ' +
  'PROMPT_V1_CANONICAL, PROMPT_V2_CANONICAL, PROMPT_V3_CANONICAL OR PROMPT_V4_CANONICAL RERUN) ' +
  `AGAINST THE APPROVED F0O FREEZE ${PROPOSED_F0O_FREEZE_RAW_SHA256} WITH DERIVED PLAN ${PROPOSED_F0O_PLAN_SHA256}, ` +
  `F0O OWNER-APPROVAL RECORD ${F0O_APPROVAL_RECORD_RAW_SHA256 ?? '<NO F0O APPROVAL RECORD IS PINNED; NOTHING IS AUTHORISABLE>'}, ` +
  `RUNTIME ${F0O_VARIANT.gitCommit}, ` +
  `PROMPT SHA-256 ${F0O_VARIANT.runtimePromptSha256}, ` +
  'REPAIR POLICY ENABLED (ONE ROUND PER LOGICAL EVALUATION, 120000 MS USABLE-WINDOW FLOOR), ' +
  `AT MOST ${ATTEMPT4_MAX_PROVIDER_REQUESTS} PROVIDER REQUESTS AND AT MOST ` +
  `${ATTEMPT4_MAX_ADAPTER_ATTEMPTS} ADAPTER ATTEMPTS. ` +
  'NO HOLDOUT. NO GOLD LABEL, THRESHOLD OR PROMPT CHANGE. NO DATABASE OR MIGRATION WRITE.';

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const GitSha = z.string().regex(/^[0-9a-f]{40}$/);
const UtcInstant = z.iso.datetime({ offset: false });

export const Attempt4ExecutionAuthorisationSchema = z.strictObject({
  authorisationVersion: z.literal(ATTEMPT4_AUTHORISATION_VERSION),
  scope: z.literal('DEVELOPMENT_ONLY'),
  attemptNo: z.literal(ATTEMPT_4_NO),
  freezeConfigRawSha256: z.literal(PROPOSED_F0O_FREEZE_RAW_SHA256),
  planSha256: z.literal(PROPOSED_F0O_PLAN_SHA256),
  freezeApprovalRecordRawSha256: Sha256,
  variants: z
    .array(
      z.strictObject({
        name: z.literal(F0O_VARIANT.name),
        label: z.literal(F0O_VARIANT.label),
        gitCommit: GitSha,
        /** The prompt identity the V5 runtime carries; pinned by literal. */
        promptVersion: z.literal(F0O_VARIANT.promptVersion),
        promptSha256: z.literal(F0O_VARIANT.runtimePromptSha256),
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
  /** Each of the FOUR prior variants is scheduled ZERO times; their artifacts are read-only comparators. */
  priorVariantReruns: z.strictObject({
    PROMPT_V1_CANONICAL: z.literal(0),
    PROMPT_V2_CANONICAL: z.literal(0),
    PROMPT_V3_CANONICAL: z.literal(0),
    PROMPT_V4_CANONICAL: z.literal(0),
  }),
  maxProviderRequests: z.literal(ATTEMPT4_MAX_PROVIDER_REQUESTS),
  maxAdapterAttempts: z.literal(ATTEMPT4_MAX_ADAPTER_ATTEMPTS),
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
    promptChanges: z.literal('NONE'),
    databaseWrites: z.literal('NONE'),
    migrationWrites: z.literal('NONE'),
  }),
  outputRoot: z.string().min(1),
  issuedAtUtc: UtcInstant,
  validUntilUtc: UtcInstant,
  operatorAuthorisationStatement: z.literal(ATTEMPT4_AUTHORISATION_STATEMENT),
});

export type Attempt4ExecutionAuthorisation = z.infer<typeof Attempt4ExecutionAuthorisationSchema>;

export type Attempt4ExecutionLockRefusal =
  | 'EXECUTE_FLAG_ABSENT'
  | 'AUTHORISATION_PATH_ABSENT'
  | 'AUTHORISATION_PATH_NOT_ABSOLUTE'
  | 'AUTHORISATION_UNREADABLE'
  | 'SPENT_ATTEMPT_1_AUTHORISATION_PRESENTED'
  | 'SPENT_ATTEMPT_2_AUTHORISATION_PRESENTED'
  | 'SPENT_ATTEMPT_3_AUTHORISATION_PRESENTED'
  | 'SPENT_ATTEMPT_3_REPLACEMENT_AUTHORISATION_PRESENTED'
  | 'ATTEMPT_1_AUTHORISATION_PRESENTED'
  | 'ATTEMPT_2_AUTHORISATION_PRESENTED'
  | 'ATTEMPT_3_AUTHORISATION_PRESENTED'
  | 'AUTHORISATION_MALFORMED'
  | 'AUTHORISATION_EXPIRED'
  | 'AUTHORISATION_NOT_YET_VALID'
  | 'AUTHORISATION_VARIANT_MISMATCH'
  | 'AUTHORISATION_OUTPUT_ROOT_MISMATCH'
  | 'AUTHORISATION_ATTEMPT_MISMATCH'
  | 'AUTHORISATION_ALREADY_CONSUMED'
  | 'FREEZE_APPROVAL_RECORD_MISMATCH';

export type Attempt4ExecutionLockDecision =
  | {
      readonly granted: true;
      readonly authorisation: Attempt4ExecutionAuthorisation;
      /** SHA-256 of the exact authorisation bytes - the identity a consumption marker records. */
      readonly authorisationSha256: string;
    }
  | {
      readonly granted: false;
      readonly refusal: Attempt4ExecutionLockRefusal;
      readonly detail: string;
    };

export interface Attempt4ExecutionLockInput {
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
  refusal: Attempt4ExecutionLockRefusal,
  detail: string,
): Attempt4ExecutionLockDecision => ({ granted: false, refusal, detail });

/**
 * Evaluates both halves of the attempt-4 lock. A caller that presents only
 * one half, an attempt-1/attempt-2/attempt-3 lock, any spent attempt-1,
 * attempt-2 or attempt-3 bytes (either attempt-3 authorisation), or any
 * value that is not the approved F0O identity never reaches a granted
 * decision.
 */
export function evaluateAttempt4ExecutionLock(
  input: Attempt4ExecutionLockInput,
): Attempt4ExecutionLockDecision {
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
      'these are the exact bytes of the attempt-1 authorisation consumed on 2026-09-13; attempt 4 requires a NEW owner authorisation.',
    );
  }
  if (authorisationSha256 === SPENT_ATTEMPT_2_AUTHORISATION_SHA256) {
    return refuse(
      'SPENT_ATTEMPT_2_AUTHORISATION_PRESENTED',
      'these are the exact bytes of the attempt-2 authorisation consumed on 2026-09-14; attempt 4 requires a NEW owner authorisation.',
    );
  }
  if (authorisationSha256 === SPENT_ATTEMPT_3_AUTHORISATION_SHA256) {
    return refuse(
      'SPENT_ATTEMPT_3_AUTHORISATION_PRESENTED',
      'these are the exact bytes of the FIRST attempt-3 authorisation, consumed on 2026-09-15 by a run refused before any inference (PRE_INFERENCE_REFUSAL); attempt 4 requires a NEW owner authorisation.',
    );
  }
  if (authorisationSha256 === SPENT_ATTEMPT_3_REPLACEMENT_AUTHORISATION_SHA256) {
    return refuse(
      'SPENT_ATTEMPT_3_REPLACEMENT_AUTHORISATION_PRESENTED',
      'these are the exact bytes of the REPLACEMENT attempt-3 authorisation, consumed on 2026-09-15 and executed to COMPLETED_ALL_PLANNED; attempt 4 requires a NEW owner authorisation.',
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
      `the file is an attempt-1 authorisation (${ATTEMPT_1_AUTHORISATION_VERSION}); attempt 4 requires ${ATTEMPT4_AUTHORISATION_VERSION}.`,
    );
  }
  if (version === ATTEMPT_2_AUTHORISATION_VERSION) {
    return refuse(
      'ATTEMPT_2_AUTHORISATION_PRESENTED',
      `the file is an attempt-2 authorisation (${ATTEMPT_2_AUTHORISATION_VERSION}); attempt 4 requires ${ATTEMPT4_AUTHORISATION_VERSION}.`,
    );
  }
  if (version === ATTEMPT_3_AUTHORISATION_VERSION) {
    return refuse(
      'ATTEMPT_3_AUTHORISATION_PRESENTED',
      `the file is an attempt-3 authorisation (${ATTEMPT_3_AUTHORISATION_VERSION}); attempt 4 requires ${ATTEMPT4_AUTHORISATION_VERSION}.`,
    );
  }
  const result = Attempt4ExecutionAuthorisationSchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    return refuse(
      'AUTHORISATION_MALFORMED',
      `the authorisation does not match the closed attempt-4 schema at ` +
        `${first ? first.path.join('.') || '<root>' : '<unknown>'}: ${first?.message ?? 'unknown'}.`,
    );
  }
  const authorisation = result.data;
  if (
    F0O_APPROVAL_RECORD_RAW_SHA256 === null ||
    authorisation.freezeApprovalRecordRawSha256 !== F0O_APPROVAL_RECORD_RAW_SHA256
  ) {
    return refuse(
      'FREEZE_APPROVAL_RECORD_MISMATCH',
      `the authorisation names freezeApprovalRecordRawSha256 ${authorisation.freezeApprovalRecordRawSha256}; the pinned F0O approval record is ${F0O_APPROVAL_RECORD_RAW_SHA256 ?? '<none pinned>'}.`,
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
  if (given.gitCommit !== F0O_VARIANT.gitCommit) {
    return refuse(
      'AUTHORISATION_VARIANT_MISMATCH',
      `the authorisation names ${given.name} at ${given.gitCommit}; the frozen V5 runtime is ${F0O_VARIANT.gitCommit}.`,
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
 * VERIFICATION ONLY. Evaluates every check of the attempt-4 lock against a
 * CANDIDATE authorisation file exactly as the execution path would - the
 * same schema, pins, approval record, window, variant, output root, attempt
 * number and consumption marker - and returns the decision. It grants
 * nothing: its only caller is the plan-only CLI path, which has no
 * execution branch, constructs no provider, launches no child and writes no
 * marker. A `granted: true` here means "this exact byte sequence WOULD be
 * accepted if the owner issued it and presented it with --execute"; it
 * never means that it has been.
 */
export function verifyAttempt4AuthorisationCandidate(
  input: Omit<Attempt4ExecutionLockInput, 'executeFlag'>,
): Attempt4ExecutionLockDecision {
  return evaluateAttempt4ExecutionLock({ ...input, executeFlag: true });
}
