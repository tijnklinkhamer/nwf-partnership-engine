/**
 * PHASE 2B-2D2C-F0D — THE ATTEMPT-2 DOUBLE EXECUTION LOCK.
 *
 * Attempt 2 is a DIFFERENT experiment from attempt 1, and its lock is a
 * different lock: a different authorisation version, a different closed
 * schema, a different statement, and pins to the APPROVED F0C freeze, the
 * approved attempt-2 plan, the one V3 variant, the repair policy and the
 * mechanical call ceiling. Nothing that satisfied the attempt-1 lock can
 * satisfy this one:
 *
 *   - the attempt-1 authorisation (version `...-f1-...`) is refused by
 *     NAME before the schema runs, with a refusal that says so;
 *   - the CONSUMED attempt-1 authorisation bytes are refused by exact
 *     SHA-256, whatever they parse to;
 *   - an authorisation naming the F0B freeze hash, or attempt 1, or either
 *     attempt-1 variant, is refused by the closed schema;
 *   - a valid authorisation consumed once under an output root is refused
 *     the second time (the consumption marker is named by its hash).
 *
 * As in F1: both halves — `--execute` AND `--authorisation <absolute
 * path>` — are required, and the lock is evaluated BEFORE any provider
 * construction, any authentication-status invocation, any child execution
 * and any output-directory mutation. There is no alternate flag,
 * environment variable or undocumented path. This module does NOT create,
 * template or emit an authorisation file: the owner writes one.
 *
 * Pure aside from the injected reader, hasher and clock. No network, no
 * database, no filesystem of its own.
 */
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import {
  APPROVED_F0C_FREEZE_RAW_SHA256,
  APPROVED_F0C_PLAN_SHA256,
  F0C_APPROVAL_RECORD_RAW_SHA256,
  F0C_ATTEMPT_NO,
  F0C_RATIFICATION_RECORD_RAW_SHA256,
  F0C_VARIANT,
  SPENT_ATTEMPT_1_AUTHORISATION_SHA256,
} from './freezeF0C.js';
import { EXPECTED_LOGICAL_BATCHES_PER_VARIANT } from '../constants.js';
import { REPAIR_MINIMUM_REMAINING_BUDGET_MS } from '../../../../orgunits/classify/repair.js';

export const F0C_AUTHORISATION_VERSION = 'phase2b-2d2c-f0c-execution-authorisation-v1';

/** The attempt-1 authorisation version, named so it can be REFUSED by exact value, never accepted. */
export const ATTEMPT_1_AUTHORISATION_VERSION = 'phase2b-2d2c-f1-execution-authorisation-v1';

/** The mechanical call ceiling F0C derives: 12 original + at most 49 repair requests. */
export const F0C_MAX_PROVIDER_REQUESTS = 61;

/** The one unmistakable owner statement for attempt 2. Compared byte for byte; never normalised. */
export const F0C_AUTHORISATION_STATEMENT =
  'I AUTHORISE PHASE 2B-2D2C DEVELOPMENT-ONLY EXECUTION OF ATTEMPT 2: AT MOST 12 LOGICAL ' +
  'EVALUATIONS OF PROMPT_V3_CANONICAL (FROZEN ORDINALS 1..12, ONE VARIANT; NO ' +
  'PROMPT_V1_CANONICAL AND NO PROMPT_V2_CANONICAL RERUN) AGAINST THE APPROVED F0C FREEZE ' +
  `${APPROVED_F0C_FREEZE_RAW_SHA256} WITH DERIVED PLAN ${APPROVED_F0C_PLAN_SHA256}, ` +
  'REPAIR POLICY ENABLED (ONE ROUND PER LOGICAL EVALUATION, 120000 MS USABLE-WINDOW FLOOR), ' +
  `AT MOST ${F0C_MAX_PROVIDER_REQUESTS} PROVIDER REQUESTS. ` +
  'NO HOLDOUT. NO GOLD LABEL CHANGE. NO DATABASE.';

const GitSha = z.string().regex(/^[0-9a-f]{40}$/);
const UtcInstant = z.iso.datetime({ offset: false });

export const F0CExecutionAuthorisationSchema = z.strictObject({
  authorisationVersion: z.literal(F0C_AUTHORISATION_VERSION),
  scope: z.literal('DEVELOPMENT_ONLY'),
  attemptNo: z.literal(F0C_ATTEMPT_NO),
  freezeConfigRawSha256: z.literal(APPROVED_F0C_FREEZE_RAW_SHA256),
  planSha256: z.literal(APPROVED_F0C_PLAN_SHA256),
  freezeApprovalRecordRawSha256: z.literal(F0C_APPROVAL_RECORD_RAW_SHA256),
  freezeApprovalRatificationRecordRawSha256: z.literal(F0C_RATIFICATION_RECORD_RAW_SHA256),
  variants: z
    .array(
      z.strictObject({
        name: z.literal(F0C_VARIANT.name),
        label: z.literal(F0C_VARIANT.label),
        gitCommit: GitSha,
      }),
    )
    .length(1),
  maxLogicalEvaluations: z.literal(EXPECTED_LOGICAL_BATCHES_PER_VARIANT),
  maxProviderRequests: z.literal(F0C_MAX_PROVIDER_REQUESTS),
  repairPolicy: z.strictObject({
    enabled: z.literal(true),
    maxRoundsPerLogicalEvaluation: z.literal(1),
    minimumRemainingBudgetMs: z.literal(REPAIR_MINIMUM_REMAINING_BUDGET_MS),
  }),
  outputRoot: z.string().min(1),
  issuedAtUtc: UtcInstant,
  validUntilUtc: UtcInstant,
  operatorAuthorisationStatement: z.literal(F0C_AUTHORISATION_STATEMENT),
});

export type F0CExecutionAuthorisation = z.infer<typeof F0CExecutionAuthorisationSchema>;

export type F0CExecutionLockRefusal =
  | 'EXECUTE_FLAG_ABSENT'
  | 'AUTHORISATION_PATH_ABSENT'
  | 'AUTHORISATION_PATH_NOT_ABSOLUTE'
  | 'AUTHORISATION_UNREADABLE'
  | 'SPENT_ATTEMPT_1_AUTHORISATION_PRESENTED'
  | 'ATTEMPT_1_AUTHORISATION_PRESENTED'
  | 'AUTHORISATION_MALFORMED'
  | 'AUTHORISATION_EXPIRED'
  | 'AUTHORISATION_NOT_YET_VALID'
  | 'AUTHORISATION_VARIANT_MISMATCH'
  | 'AUTHORISATION_OUTPUT_ROOT_MISMATCH'
  | 'AUTHORISATION_ATTEMPT_MISMATCH'
  | 'AUTHORISATION_ALREADY_CONSUMED';

export type F0CExecutionLockDecision =
  | {
      readonly granted: true;
      readonly authorisation: F0CExecutionAuthorisation;
      /** SHA-256 of the exact authorisation bytes — the identity a consumption marker records. */
      readonly authorisationSha256: string;
    }
  | {
      readonly granted: false;
      readonly refusal: F0CExecutionLockRefusal;
      readonly detail: string;
    };

export interface F0CExecutionLockInput {
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

const refuse = (refusal: F0CExecutionLockRefusal, detail: string): F0CExecutionLockDecision => ({
  granted: false,
  refusal,
  detail,
});

/**
 * Evaluates both halves of the attempt-2 lock. A caller that presents only
 * one half, the attempt-1 lock, the spent attempt-1 bytes, or any value
 * that is not the approved F0C identity never reaches a granted decision.
 */
export function evaluateF0CExecutionLock(input: F0CExecutionLockInput): F0CExecutionLockDecision {
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
      'these are the exact bytes of the attempt-1 authorisation consumed on 2026-09-13; attempt 2 requires a NEW owner authorisation.',
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    return refuse('AUTHORISATION_MALFORMED', 'the authorisation file is not valid JSON.');
  }
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    (parsed as { authorisationVersion?: unknown }).authorisationVersion ===
      ATTEMPT_1_AUTHORISATION_VERSION
  ) {
    return refuse(
      'ATTEMPT_1_AUTHORISATION_PRESENTED',
      `the file is an attempt-1 authorisation (${ATTEMPT_1_AUTHORISATION_VERSION}); attempt 2 requires ${F0C_AUTHORISATION_VERSION}.`,
    );
  }
  const result = F0CExecutionAuthorisationSchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    return refuse(
      'AUTHORISATION_MALFORMED',
      `the authorisation does not match the closed attempt-2 schema at ` +
        `${first ? first.path.join('.') || '<root>' : '<unknown>'}: ${first?.message ?? 'unknown'}.`,
    );
  }
  const authorisation = result.data;
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
  if (given.gitCommit !== F0C_VARIANT.gitCommit) {
    return refuse(
      'AUTHORISATION_VARIANT_MISMATCH',
      `the authorisation names ${given.name} at ${given.gitCommit}; the frozen V3 runtime is ${F0C_VARIANT.gitCommit}.`,
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
