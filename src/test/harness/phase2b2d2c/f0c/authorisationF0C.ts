/**
 * PHASE 2B-2D2C — THE ATTEMPT-2 DOUBLE EXECUTION LOCK, pinned to the
 * CURRENT attempt-2 freeze revision (F0E, `./freezeF0E.ts`).
 *
 * Attempt 2 is a DIFFERENT experiment from attempt 1, and its lock is a
 * different lock: a different authorisation version, a different closed
 * schema, a different statement, and pins — every one a literal — to the
 * proposed F0E freeze, the F0E plan, the one V3B variant, the repair policy
 * and the mechanical call ceiling. Nothing that satisfied the attempt-1 lock,
 * and nothing written against the SUPERSEDED F0C freeze, can satisfy it:
 *
 *   - the attempt-1 authorisation (version `...-f1-...`) is refused by NAME
 *     before the schema runs;
 *   - the CONSUMED attempt-1 authorisation bytes are refused by exact hash;
 *   - an authorisation naming the superseded F0C freeze hash is refused by
 *     NAME (SUPERSEDED_F0C_FREEZE_NAMED) before the schema runs;
 *   - until an owner approval record for F0E exists AND is pinned here by
 *     hash, EVERY authorisation is refused
 *     (REPLACEMENT_FREEZE_NOT_OWNER_APPROVED) — a freeze that is not
 *     approved cannot be executed against, whatever the file says;
 *   - the F0B hash, attempt 1, either attempt-1 variant, the wrong commit,
 *     ceiling or policy are refused by the closed schema;
 *   - a valid authorisation consumed once under an output root is refused
 *     the second time.
 *
 * As in F1: both halves — `--execute` AND `--authorisation <absolute
 * path>` — are required, and the lock is evaluated BEFORE any provider
 * construction, any authentication-status invocation, any child execution
 * and any output-directory mutation. This module does NOT create, template
 * or emit an authorisation file: the owner writes one.
 *
 * Pure aside from the injected reader, hasher and clock. No network, no
 * database, no filesystem of its own.
 */
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { REPAIR_MINIMUM_REMAINING_BUDGET_MS } from '../../../../orgunits/classify/repair.js';
import { EXPECTED_LOGICAL_BATCHES_PER_VARIANT } from '../constants.js';
import { APPROVED_F0C_FREEZE_RAW_SHA256 } from './freezeF0C.js';
import {
  ATTEMPT_2_NO,
  F0E_APPROVAL_RECORD_RAW_SHA256,
  F0E_VARIANT,
  PROPOSED_F0E_FREEZE_RAW_SHA256,
  PROPOSED_F0E_PLAN_SHA256,
  SPENT_ATTEMPT_1_AUTHORISATION_SHA256,
} from './freezeF0E.js';

export const ATTEMPT2_AUTHORISATION_VERSION = 'phase2b-2d2c-f0e-execution-authorisation-v1';

/** The attempt-1 authorisation version, named so it can be REFUSED by exact value, never accepted. */
export const ATTEMPT_1_AUTHORISATION_VERSION = 'phase2b-2d2c-f1-execution-authorisation-v1';

/** The mechanical call ceiling the freeze derives: 12 original + at most 49 repair requests. */
export const ATTEMPT2_MAX_PROVIDER_REQUESTS = 61;

/** The one unmistakable owner statement for attempt 2. Compared byte for byte; never normalised. */
export const ATTEMPT2_AUTHORISATION_STATEMENT =
  'I AUTHORISE PHASE 2B-2D2C DEVELOPMENT-ONLY EXECUTION OF ATTEMPT 2: AT MOST 12 LOGICAL ' +
  'EVALUATIONS OF PROMPT_V3_CANONICAL (FROZEN ORDINALS 1..12, ONE VARIANT; NO ' +
  'PROMPT_V1_CANONICAL AND NO PROMPT_V2_CANONICAL RERUN) AGAINST THE APPROVED F0E FREEZE ' +
  `${PROPOSED_F0E_FREEZE_RAW_SHA256} WITH DERIVED PLAN ${PROPOSED_F0E_PLAN_SHA256}, ` +
  `RUNTIME ${F0E_VARIANT.gitCommit}, ` +
  'REPAIR POLICY ENABLED (ONE ROUND PER LOGICAL EVALUATION, 120000 MS USABLE-WINDOW FLOOR), ' +
  `AT MOST ${ATTEMPT2_MAX_PROVIDER_REQUESTS} PROVIDER REQUESTS. ` +
  'NO HOLDOUT. NO GOLD LABEL CHANGE. NO DATABASE.';

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const GitSha = z.string().regex(/^[0-9a-f]{40}$/);
const UtcInstant = z.iso.datetime({ offset: false });

export const Attempt2ExecutionAuthorisationSchema = z.strictObject({
  authorisationVersion: z.literal(ATTEMPT2_AUTHORISATION_VERSION),
  scope: z.literal('DEVELOPMENT_ONLY'),
  attemptNo: z.literal(ATTEMPT_2_NO),
  freezeConfigRawSha256: z.literal(PROPOSED_F0E_FREEZE_RAW_SHA256),
  planSha256: z.literal(PROPOSED_F0E_PLAN_SHA256),
  /** The superseded F0C freeze the owner acknowledges as superseded by this authorisation. */
  supersededFreezeRawSha256: z.literal(APPROVED_F0C_FREEZE_RAW_SHA256),
  /** The F0E owner freeze-approval record; compared to the pinned hash after parsing. */
  freezeApprovalRecordRawSha256: Sha256,
  variants: z
    .array(
      z.strictObject({
        name: z.literal(F0E_VARIANT.name),
        label: z.literal(F0E_VARIANT.label),
        gitCommit: GitSha,
      }),
    )
    .length(1),
  maxLogicalEvaluations: z.literal(EXPECTED_LOGICAL_BATCHES_PER_VARIANT),
  maxProviderRequests: z.literal(ATTEMPT2_MAX_PROVIDER_REQUESTS),
  repairPolicy: z.strictObject({
    enabled: z.literal(true),
    maxRoundsPerLogicalEvaluation: z.literal(1),
    minimumRemainingBudgetMs: z.literal(REPAIR_MINIMUM_REMAINING_BUDGET_MS),
  }),
  outputRoot: z.string().min(1),
  issuedAtUtc: UtcInstant,
  validUntilUtc: UtcInstant,
  operatorAuthorisationStatement: z.literal(ATTEMPT2_AUTHORISATION_STATEMENT),
});

export type Attempt2ExecutionAuthorisation = z.infer<typeof Attempt2ExecutionAuthorisationSchema>;

export type Attempt2ExecutionLockRefusal =
  | 'EXECUTE_FLAG_ABSENT'
  | 'AUTHORISATION_PATH_ABSENT'
  | 'AUTHORISATION_PATH_NOT_ABSOLUTE'
  | 'AUTHORISATION_UNREADABLE'
  | 'SPENT_ATTEMPT_1_AUTHORISATION_PRESENTED'
  | 'ATTEMPT_1_AUTHORISATION_PRESENTED'
  | 'SUPERSEDED_F0C_FREEZE_NAMED'
  | 'REPLACEMENT_FREEZE_NOT_OWNER_APPROVED'
  | 'AUTHORISATION_MALFORMED'
  | 'AUTHORISATION_APPROVAL_RECORD_MISMATCH'
  | 'AUTHORISATION_EXPIRED'
  | 'AUTHORISATION_NOT_YET_VALID'
  | 'AUTHORISATION_VARIANT_MISMATCH'
  | 'AUTHORISATION_OUTPUT_ROOT_MISMATCH'
  | 'AUTHORISATION_ATTEMPT_MISMATCH'
  | 'AUTHORISATION_ALREADY_CONSUMED';

export type Attempt2ExecutionLockDecision =
  | {
      readonly granted: true;
      readonly authorisation: Attempt2ExecutionAuthorisation;
      readonly authorisationSha256: string;
    }
  | {
      readonly granted: false;
      readonly refusal: Attempt2ExecutionLockRefusal;
      readonly detail: string;
    };

export interface Attempt2ExecutionLockInput {
  readonly executeFlag: boolean;
  readonly authorisationPath: string | null;
  readonly expected: {
    readonly outputRoot: string;
    readonly attemptNo: number;
  };
  readonly readFile: (path: string) => Buffer;
  readonly sha256: (bytes: Buffer) => string;
  readonly alreadyConsumed: (authorisationSha256: string) => boolean;
  readonly nowUtc: () => Date;
  /**
   * Test seam ONLY: the pinned F0E approval-record hash. Production passes
   * nothing and gets the module constant, which is `null` until the owner's
   * approval record exists and is pinned here by a reviewed edit.
   */
  readonly pinnedApprovalRecordRawSha256?: string | null | undefined;
}

const refuse = (
  refusal: Attempt2ExecutionLockRefusal,
  detail: string,
): Attempt2ExecutionLockDecision => ({ granted: false, refusal, detail });

/**
 * Evaluates both halves of the attempt-2 lock. A caller that presents only
 * one half, the attempt-1 lock, the spent attempt-1 bytes, the superseded
 * F0C identity, or any authorisation before F0E is owner-approved never
 * reaches a granted decision.
 */
export function evaluateAttempt2ExecutionLock(
  input: Attempt2ExecutionLockInput,
): Attempt2ExecutionLockDecision {
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
  const shape =
    typeof parsed === 'object' && parsed !== null
      ? (parsed as { authorisationVersion?: unknown; freezeConfigRawSha256?: unknown })
      : {};
  if (shape.authorisationVersion === ATTEMPT_1_AUTHORISATION_VERSION) {
    return refuse(
      'ATTEMPT_1_AUTHORISATION_PRESENTED',
      `the file is an attempt-1 authorisation (${ATTEMPT_1_AUTHORISATION_VERSION}); attempt 2 requires ${ATTEMPT2_AUTHORISATION_VERSION}.`,
    );
  }
  if (shape.freezeConfigRawSha256 === APPROVED_F0C_FREEZE_RAW_SHA256) {
    return refuse(
      'SUPERSEDED_F0C_FREEZE_NAMED',
      'the authorisation names the F0C freeze, which Finding F1 superseded before any execution; attempt 2 is authorised only against the approved F0E freeze.',
    );
  }
  const pinnedApproval =
    input.pinnedApprovalRecordRawSha256 === undefined
      ? F0E_APPROVAL_RECORD_RAW_SHA256
      : input.pinnedApprovalRecordRawSha256;
  if (pinnedApproval === null) {
    return refuse(
      'REPLACEMENT_FREEZE_NOT_OWNER_APPROVED',
      'the F0E replacement freeze has no owner approval record pinned; no authorisation can execute against an unapproved freeze.',
    );
  }
  const result = Attempt2ExecutionAuthorisationSchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    return refuse(
      'AUTHORISATION_MALFORMED',
      `the authorisation does not match the closed attempt-2 schema at ` +
        `${first ? first.path.join('.') || '<root>' : '<unknown>'}: ${first?.message ?? 'unknown'}.`,
    );
  }
  const authorisation = result.data;
  if (authorisation.freezeApprovalRecordRawSha256 !== pinnedApproval) {
    return refuse(
      'AUTHORISATION_APPROVAL_RECORD_MISMATCH',
      'the authorisation names an F0E approval record other than the pinned one.',
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
  if (given.gitCommit !== F0E_VARIANT.gitCommit) {
    return refuse(
      'AUTHORISATION_VARIANT_MISMATCH',
      `the authorisation names ${given.name} at ${given.gitCommit}; the frozen V3B runtime is ${F0E_VARIANT.gitCommit}.`,
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
