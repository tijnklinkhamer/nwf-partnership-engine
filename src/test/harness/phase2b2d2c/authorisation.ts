/**
 * PHASE 2B-2D2C-F1 — THE DOUBLE EXECUTION LOCK.
 *
 * A live path requires BOTH an explicit `--execute` flag AND an explicit
 * execution-authorisation JSON file supplied by absolute path. Neither alone
 * enables execution. The schema is CLOSED (`strictObject`): a file with an
 * extra field, a missing field, a wrong value or a wrong type is refused.
 * Every pinned value must equal what the runner itself has verified — the
 * F0B freeze hash (F1A/F0B: the F0A hash is REFUSED, both as the pinned
 * literal and inside the statement), both variant names, labels and
 * CORRECTED runtime commits, the maximum evaluation count, the operator
 * attempt number and the exact output root — and the statement must equal
 * `AUTHORISATION_STATEMENT` byte for byte.
 *
 * The lock is evaluated BEFORE any production provider construction, any
 * authentication-status invocation, any child execution and any
 * output-directory mutation. There is no alternate flag, environment
 * variable or undocumented path.
 *
 * Pure aside from the injected reader and clock. No network, no database.
 */
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import {
  EXPECTED_F0B_FREEZE_RAW_SHA256,
  EXPECTED_LOGICAL_EVALUATIONS,
  FROZEN_VARIANTS,
} from './constants.js';

export const AUTHORISATION_VERSION = 'phase2b-2d2c-f1-execution-authorisation-v1';

/** The one unmistakable operator statement. Compared byte for byte; never normalised. */
export const AUTHORISATION_STATEMENT =
  'I AUTHORISE PHASE 2B-2D2C DEVELOPMENT-ONLY EXECUTION OF AT MOST 24 LOGICAL ' +
  'EVALUATIONS (12 PROMPT_V1_CANONICAL THEN 12 PROMPT_V2_CANONICAL) AGAINST THE F0B ' +
  `FREEZE ${EXPECTED_F0B_FREEZE_RAW_SHA256}. ` +
  'NO HOLDOUT. NO GOLD LABEL CHANGE. NO DATABASE.';

const GitSha = z.string().regex(/^[0-9a-f]{40}$/);
const UtcInstant = z.iso.datetime({ offset: false });

export const ExecutionAuthorisationSchema = z.strictObject({
  authorisationVersion: z.literal(AUTHORISATION_VERSION),
  scope: z.literal('DEVELOPMENT_ONLY'),
  freezeConfigRawSha256: z.literal(EXPECTED_F0B_FREEZE_RAW_SHA256),
  variants: z
    .array(
      z.strictObject({
        name: z.enum(['PROMPT_V1_CANONICAL', 'PROMPT_V2_CANONICAL']),
        label: z.enum(['PROMPT_V1_COMPARATOR', 'PROMPT_V2_CANDIDATE']),
        gitCommit: GitSha,
      }),
    )
    .length(2),
  maxLogicalEvaluations: z.literal(EXPECTED_LOGICAL_EVALUATIONS),
  attemptNo: z.int().min(1),
  outputRoot: z.string().min(1),
  issuedAtUtc: UtcInstant,
  validUntilUtc: UtcInstant,
  operatorAuthorisationStatement: z.literal(AUTHORISATION_STATEMENT),
});

export type ExecutionAuthorisation = z.infer<typeof ExecutionAuthorisationSchema>;

export type ExecutionLockRefusal =
  | 'EXECUTE_FLAG_ABSENT'
  | 'AUTHORISATION_PATH_ABSENT'
  | 'AUTHORISATION_PATH_NOT_ABSOLUTE'
  | 'AUTHORISATION_UNREADABLE'
  | 'AUTHORISATION_MALFORMED'
  | 'AUTHORISATION_EXPIRED'
  | 'AUTHORISATION_NOT_YET_VALID'
  | 'AUTHORISATION_VARIANT_MISMATCH'
  | 'AUTHORISATION_OUTPUT_ROOT_MISMATCH'
  | 'AUTHORISATION_ATTEMPT_MISMATCH'
  | 'AUTHORISATION_ALREADY_CONSUMED';

export type ExecutionLockDecision =
  | {
      readonly granted: true;
      readonly authorisation: ExecutionAuthorisation;
      /** SHA-256 of the exact authorisation bytes — the identity a consumption marker records. */
      readonly authorisationSha256: string;
    }
  | { readonly granted: false; readonly refusal: ExecutionLockRefusal; readonly detail: string };

export interface ExecutionLockInput {
  /** Whether `--execute` was passed. */
  readonly executeFlag: boolean;
  /** The `--authorisation` path exactly as passed, or null. */
  readonly authorisationPath: string | null;
  /** What the runner itself verified and will use. */
  readonly expected: {
    readonly outputRoot: string;
    readonly attemptNo: number;
  };
  /** Reads the authorisation bytes; throws when unreadable. */
  readonly readFile: (path: string) => Buffer;
  /** SHA-256 of bytes (injected so the lock stays free of a hashing import). */
  readonly sha256: (bytes: Buffer) => string;
  /** Whether an authorisation with this hash was already consumed under the output root. */
  readonly alreadyConsumed: (authorisationSha256: string) => boolean;
  readonly nowUtc: () => Date;
}

const refuse = (refusal: ExecutionLockRefusal, detail: string): ExecutionLockDecision => ({
  granted: false,
  refusal,
  detail,
});

/**
 * Evaluates both halves of the lock. The flag is checked first and the file
 * second, but a caller that presents only one half never reaches a granted
 * decision by any path.
 */
export function evaluateExecutionLock(input: ExecutionLockInput): ExecutionLockDecision {
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
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    return refuse('AUTHORISATION_MALFORMED', 'the authorisation file is not valid JSON.');
  }
  const result = ExecutionAuthorisationSchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    return refuse(
      'AUTHORISATION_MALFORMED',
      `the authorisation does not match the closed schema at ` +
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
  for (const frozen of FROZEN_VARIANTS) {
    const given = authorisation.variants.find((v) => v.name === frozen.name);
    if (
      given === undefined ||
      given.label !== frozen.label ||
      given.gitCommit !== frozen.gitCommit
    ) {
      return refuse(
        'AUTHORISATION_VARIANT_MISMATCH',
        `the authorisation does not name variant ${frozen.name} (${frozen.label}) at ${frozen.gitCommit}.`,
      );
    }
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
  const authorisationSha256 = input.sha256(bytes);
  if (input.alreadyConsumed(authorisationSha256)) {
    return refuse(
      'AUTHORISATION_ALREADY_CONSUMED',
      'this exact authorisation was already consumed under the output root; a re-attempt needs a new authorisation.',
    );
  }
  return { granted: true, authorisation, authorisationSha256 };
}
