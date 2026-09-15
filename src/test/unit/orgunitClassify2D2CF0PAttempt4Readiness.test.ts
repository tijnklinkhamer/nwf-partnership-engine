/**
 * PHASE 2B-2D2C-F0P — ATTEMPT-4 EXECUTION READINESS / CONTROL-PLANE
 * PREPARATION. REQUEST-FREE, ZERO INFERENCE.
 *
 * Proves that the attempt-4 machinery this task adds is mechanically ready,
 * against REAL committed bytes (the approved F0O freeze, its owner-approval
 * record, the real corpus, the real F0B/F0E/F0I predecessor freezes) and
 * against a REAL physical Tier-2 child process boundary, exactly as F0K
 * proved attempt-3 readiness after its own repair:
 *
 *   1. the attempt-4 execution lock: real pins are non-null, a structurally
 *      valid authorisation is GRANTED, and every mutation - wrong freeze,
 *      wrong plan, wrong approval record, wrong runtime commit, wrong
 *      prompt, a nonzero rerun of ANY of the four prior variants, an
 *      inflated ceiling, a non-NONE prohibition, the wrong output root, the
 *      wrong attempt number, an expired/not-yet-valid window, a duplicate
 *      presentation, the spent attempt-1/attempt-2/attempt-3 bytes (BOTH
 *      attempt-3 authorisations), and the attempt-1/2/3 authorisation
 *      SHAPES - is refused;
 *   2. the coordinator -> child boundary over the REAL approved F0O plan:
 *      all twelve V5 manifests are built and launched;
 *   3. the child under a real F0O manifest: family resolution, variant
 *      lookup, corpus reconstruction and the V5 FINAL IDENTITY all verify,
 *      and every prior-variant / wrong-attempt manifest is refused before
 *      any provider is constructed;
 *   4. the same thing at PROCESS level through the real Tier-2 child entry,
 *      which stops at its own preflight against a non-frozen root - before
 *      any provider import, so no authentication or network path is
 *      reachable. This is the physical, request-free proof that V5 reaches
 *      the point immediately before provider inference would occur;
 *   5. the plan-only CLI: real readiness checks pass against the real F0O
 *      freeze/approval/predecessor bytes; the execution lock refuses a
 *      missing authorisation, the wrong attempt number, and a non-empty
 *      attempt-4 output root; dry verification never creates a consumption
 *      marker and never invokes provider inference.
 *
 * No provider, no network, no database, no clock outside the injected ones.
 * Everything is written under scratch directories.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canonicalStringify } from '../../orgunits/classify/canonical.js';
import * as canonicalModule from '../../orgunits/classify/canonical.js';
import * as constantsModule from '../../orgunits/classify/constants.js';
import * as finalIdentityModule from '../../orgunits/classify/finalIdentity.js';
import * as outputSchemaModule from '../../orgunits/classify/outputSchema.js';
import * as promptModule from '../../orgunits/classify/prompt.js';
import * as allowedModelsModule from '../../orgunits/classify/provider/allowedModels.js';
import * as authStatusRunnerModule from '../../orgunits/classify/provider/authStatusRunner.js';
import * as claudeCodeExecutableModule from '../../orgunits/classify/provider/claudeCodeExecutable.js';
import * as environmentModule from '../../orgunits/classify/provider/environment.js';
import * as sdkOptionsModule from '../../orgunits/classify/provider/sdkOptions.js';
import { REPAIR_MINIMUM_REMAINING_BUDGET_MS } from '../../orgunits/classify/repair.js';
import * as repairModule from '../../orgunits/classify/repair.js';
import * as retryModule from '../../orgunits/classify/retry.js';
import * as validateModule from '../../orgunits/classify/validate.js';
import * as scoreModule from '../../orgunits/signals/score.js';
import * as policyModule from '../../orgunits/web/policy.js';
import {
  attemptDirectoryOf,
  readArtifact,
  writeArtifactOnce,
  type ArtifactKind,
} from '../harness/phase2b2d2c/artifacts.js';
import {
  runChildEvaluation,
  type ChildDependencies,
  type ChildManifest,
} from '../harness/phase2b2d2c/childMain.js';
import {
  EXPECTED_F0B_FREEZE_RAW_SHA256,
  EXPECTED_LOGICAL_BATCHES_PER_VARIANT,
  FREEZE_PATH,
  RUNNER_ARTIFACT_VERSION,
} from '../harness/phase2b2d2c/constants.js';
import {
  authorisationMarkerPathOf,
  runExperiment,
  type ChildLaunchInput,
  type ChildLauncher,
  type ExperimentInput,
} from '../harness/phase2b2d2c/coordinator.js';
import {
  PROPOSED_F0E_FREEZE_RAW_SHA256,
  F0E_FREEZE_PATH,
} from '../harness/phase2b2d2c/f0c/freezeF0E.js';
import {
  PROPOSED_F0I_FREEZE_RAW_SHA256,
  F0I_FREEZE_PATH,
} from '../harness/phase2b2d2c/f0i/freezeF0I.js';
import {
  ATTEMPT4_AUTHORISATION_VERSION,
  ATTEMPT4_FROZEN_ORDINALS,
  ATTEMPT4_MAX_ADAPTER_ATTEMPTS,
  ATTEMPT4_MAX_PROVIDER_REQUESTS,
  ATTEMPT_1_AUTHORISATION_VERSION,
  ATTEMPT_2_AUTHORISATION_VERSION,
  ATTEMPT_3_AUTHORISATION_VERSION,
  ATTEMPT4_AUTHORISATION_STATEMENT,
  Attempt4ExecutionAuthorisationSchema,
  evaluateAttempt4ExecutionLock,
  PRIOR_VARIANTS_NEVER_RERUN,
  verifyAttempt4AuthorisationCandidate,
  type Attempt4ExecutionAuthorisation,
  type Attempt4ExecutionLockInput,
} from '../harness/phase2b2d2c/f0o/authorisationF0O.js';
import {
  CHILD_ENTRY_PATH,
  parseF0OCliArgs,
  runF0OCli,
  type F0OCliIo,
} from '../harness/phase2b2d2c/f0o/cliF0O.js';
import {
  buildF0OExecutionPlan,
  F0O_APPROVAL_RECORD_RAW_SHA256,
  F0O_FREEZE_PATH,
  F0O_VARIANT,
  loadF0OFreezeFromBytes,
  PROPOSED_F0O_FREEZE_RAW_SHA256,
  PROPOSED_F0O_PLAN_SHA256,
  SPENT_ATTEMPT_1_AUTHORISATION_SHA256,
  SPENT_ATTEMPT_2_AUTHORISATION_SHA256,
  SPENT_ATTEMPT_3_AUTHORISATION_SHA256,
  SPENT_ATTEMPT_3_REPLACEMENT_AUTHORISATION_SHA256,
} from '../harness/phase2b2d2c/f0o/freezeF0O.js';
import { sha256Hex } from '../harness/phase2b2d2c/freeze.js';
import { runProcessIsolatedBatch } from '../harness/processIsolatedBatch.js';
import type { LoadedVariantRuntime } from '../harness/phase2b2d2c/runtimeLoader.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const F0O_BYTES = readFileSync(join(ROOT, F0O_FREEZE_PATH));
const F0I_BYTES = readFileSync(join(ROOT, F0I_FREEZE_PATH));
const F0E_BYTES = readFileSync(join(ROOT, F0E_FREEZE_PATH));
const F0B_BYTES = readFileSync(join(ROOT, FREEZE_PATH));
const { freeze, rawSha256 } = loadF0OFreezeFromBytes(F0O_BYTES);
const PLAN = buildF0OExecutionPlan(freeze, rawSha256);
const MODEL = PLAN.requestedModelId;
const V5_BATCH_1 = PLAN.evaluations[0]!;
const IS_WINDOWS = process.platform === 'win32';
const NOW = new Date('2026-09-15T12:00:00Z');
const OUTPUT_ROOT = '/synthetic/attempt-4-output';

const SCRATCH = realpathSync.native(mkdtempSync(join(tmpdir(), 'nwf-pe-2d2c-f0p-')));
afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));
let counter = 0;
function scratchDir(prefix: string): string {
  counter += 1;
  const dir = join(SCRATCH, `${prefix}-${counter}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const record = <T>(dir: string, kind: ArtifactKind): T | null => {
  const read = readArtifact<T>(dir, kind);
  return read.ok ? read.envelope.record : null;
};

// ---------------------------------------------------------------------------
// 1. The attempt-4 execution lock: real pins, grant, and fail-closed mutations.
// ---------------------------------------------------------------------------

type AuthorisedVariant = Attempt4ExecutionAuthorisation['variants'][number];
function variant(overrides: Record<string, unknown> = {}): AuthorisedVariant {
  return {
    name: F0O_VARIANT.name,
    label: F0O_VARIANT.label,
    gitCommit: F0O_VARIANT.gitCommit,
    promptVersion: F0O_VARIANT.promptVersion,
    promptSha256: F0O_VARIANT.runtimePromptSha256,
    ...overrides,
  } as AuthorisedVariant;
}

function validAuthorisation(
  overrides: Record<string, unknown> = {},
): Attempt4ExecutionAuthorisation {
  return {
    authorisationVersion: ATTEMPT4_AUTHORISATION_VERSION,
    scope: 'DEVELOPMENT_ONLY',
    attemptNo: 4,
    freezeConfigRawSha256: PROPOSED_F0O_FREEZE_RAW_SHA256,
    planSha256: PROPOSED_F0O_PLAN_SHA256,
    freezeApprovalRecordRawSha256: F0O_APPROVAL_RECORD_RAW_SHA256 as string,
    variants: [variant()],
    maxLogicalEvaluations: EXPECTED_LOGICAL_BATCHES_PER_VARIANT,
    frozenLogicalBatchOrdinals: [...ATTEMPT4_FROZEN_ORDINALS],
    priorVariantReruns: {
      PROMPT_V1_CANONICAL: 0,
      PROMPT_V2_CANONICAL: 0,
      PROMPT_V3_CANONICAL: 0,
      PROMPT_V4_CANONICAL: 0,
    },
    maxProviderRequests: ATTEMPT4_MAX_PROVIDER_REQUESTS,
    maxAdapterAttempts: ATTEMPT4_MAX_ADAPTER_ATTEMPTS,
    repairPolicy: {
      enabled: true,
      maxRoundsPerLogicalEvaluation: 1,
      minimumRemainingBudgetMs: REPAIR_MINIMUM_REMAINING_BUDGET_MS,
    },
    prohibitions: {
      holdout: 'NONE',
      goldLabelChanges: 'NONE',
      thresholdChanges: 'NONE',
      promptChanges: 'NONE',
      databaseWrites: 'NONE',
      migrationWrites: 'NONE',
    },
    outputRoot: OUTPUT_ROOT,
    issuedAtUtc: '2026-09-15T00:00:00Z',
    validUntilUtc: '2026-09-15T23:59:59Z',
    operatorAuthorisationStatement: ATTEMPT4_AUTHORISATION_STATEMENT,
    ...overrides,
  } as Attempt4ExecutionAuthorisation;
}

function bytesOf(authorisation: unknown): Buffer {
  return Buffer.from(JSON.stringify(authorisation), 'utf8');
}

function inputFor(
  authorisation: unknown,
  overrides: Partial<Attempt4ExecutionLockInput> = {},
): Attempt4ExecutionLockInput {
  const bytes = bytesOf(authorisation);
  return {
    executeFlag: true,
    authorisationPath: '/synthetic/authorisation.json',
    expected: { outputRoot: OUTPUT_ROOT, attemptNo: 4 },
    readFile: () => bytes,
    sha256: sha256Hex,
    alreadyConsumed: () => false,
    nowUtc: () => NOW,
    ...overrides,
  };
}

describe('2D2C-F0P: real production pins are non-null and are what the lock checks', () => {
  it('F0O_APPROVAL_RECORD_RAW_SHA256 is pinned (non-null)', () => {
    expect(F0O_APPROVAL_RECORD_RAW_SHA256).not.toBeNull();
    expect(F0O_APPROVAL_RECORD_RAW_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('the statement names the real pinned identities, never a placeholder', () => {
    expect(ATTEMPT4_AUTHORISATION_STATEMENT).toContain(PROPOSED_F0O_FREEZE_RAW_SHA256);
    expect(ATTEMPT4_AUTHORISATION_STATEMENT).toContain(PROPOSED_F0O_PLAN_SHA256);
    expect(ATTEMPT4_AUTHORISATION_STATEMENT).toContain(F0O_APPROVAL_RECORD_RAW_SHA256 as string);
    expect(ATTEMPT4_AUTHORISATION_STATEMENT).toContain(F0O_VARIANT.gitCommit);
    expect(ATTEMPT4_AUTHORISATION_STATEMENT).toContain(F0O_VARIANT.runtimePromptSha256);
    expect(ATTEMPT4_AUTHORISATION_STATEMENT).not.toContain('<NO F0O APPROVAL RECORD IS PINNED');
  });

  it('the mechanical ceiling is 61 provider requests / 183 adapter attempts', () => {
    expect(ATTEMPT4_MAX_PROVIDER_REQUESTS).toBe(61);
    expect(ATTEMPT4_MAX_ADAPTER_ATTEMPTS).toBe(183);
  });

  it('the four never-rerun prior variants are exactly V1, V2, V3, V4', () => {
    expect(PRIOR_VARIANTS_NEVER_RERUN).toEqual([
      'PROMPT_V1_CANONICAL',
      'PROMPT_V2_CANONICAL',
      'PROMPT_V3_CANONICAL',
      'PROMPT_V4_CANONICAL',
    ]);
  });
});

describe('2D2C-F0P: a structurally valid authorisation is GRANTED', () => {
  it('schema-parses and the lock grants it', () => {
    const authorisation = validAuthorisation();
    expect(Attempt4ExecutionAuthorisationSchema.safeParse(authorisation).success).toBe(true);
    const decision = evaluateAttempt4ExecutionLock(inputFor(authorisation));
    expect(decision.granted).toBe(true);
    if (decision.granted) {
      expect(decision.authorisationSha256).toBe(sha256Hex(bytesOf(authorisation)));
    }
  });

  it('verifyAttempt4AuthorisationCandidate reaches the same grant without an executeFlag', () => {
    const authorisation = validAuthorisation();
    const bytes = bytesOf(authorisation);
    const decision = verifyAttempt4AuthorisationCandidate({
      authorisationPath: '/synthetic/authorisation.json',
      expected: { outputRoot: OUTPUT_ROOT, attemptNo: 4 },
      readFile: () => bytes,
      sha256: sha256Hex,
      alreadyConsumed: () => false,
      nowUtc: () => NOW,
    });
    expect(decision.granted).toBe(true);
  });
});

describe('2D2C-F0P: fail-closed mutation coverage', () => {
  it('EXECUTE_FLAG_ABSENT: no --execute', () => {
    const decision = evaluateAttempt4ExecutionLock(
      inputFor(validAuthorisation(), { executeFlag: false }),
    );
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.refusal).toBe('EXECUTE_FLAG_ABSENT');
  });

  it('AUTHORISATION_PATH_ABSENT: no --authorisation', () => {
    const decision = evaluateAttempt4ExecutionLock(
      inputFor(validAuthorisation(), { authorisationPath: null }),
    );
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.refusal).toBe('AUTHORISATION_PATH_ABSENT');
  });

  it('SPENT_ATTEMPT_1_AUTHORISATION_PRESENTED: the exact attempt-1 bytes', () => {
    const decision = evaluateAttempt4ExecutionLock(
      inputFor('irrelevant', { sha256: () => SPENT_ATTEMPT_1_AUTHORISATION_SHA256 }),
    );
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.refusal).toBe('SPENT_ATTEMPT_1_AUTHORISATION_PRESENTED');
  });

  it('SPENT_ATTEMPT_2_AUTHORISATION_PRESENTED: the exact attempt-2 bytes', () => {
    const decision = evaluateAttempt4ExecutionLock(
      inputFor('irrelevant', { sha256: () => SPENT_ATTEMPT_2_AUTHORISATION_SHA256 }),
    );
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.refusal).toBe('SPENT_ATTEMPT_2_AUTHORISATION_PRESENTED');
  });

  it('SPENT_ATTEMPT_3_AUTHORISATION_PRESENTED: the FIRST (pre-inference-refused) attempt-3 bytes', () => {
    const decision = evaluateAttempt4ExecutionLock(
      inputFor('irrelevant', { sha256: () => SPENT_ATTEMPT_3_AUTHORISATION_SHA256 }),
    );
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.refusal).toBe('SPENT_ATTEMPT_3_AUTHORISATION_PRESENTED');
  });

  it('SPENT_ATTEMPT_3_REPLACEMENT_AUTHORISATION_PRESENTED: the EXECUTED replacement attempt-3 bytes', () => {
    const decision = evaluateAttempt4ExecutionLock(
      inputFor('irrelevant', {
        sha256: () => SPENT_ATTEMPT_3_REPLACEMENT_AUTHORISATION_SHA256,
      }),
    );
    expect(decision.granted).toBe(false);
    if (!decision.granted) {
      expect(decision.refusal).toBe('SPENT_ATTEMPT_3_REPLACEMENT_AUTHORISATION_PRESENTED');
      expect(decision.detail).toContain('COMPLETED_ALL_PLANNED');
    }
  });

  it('ATTEMPT_1_AUTHORISATION_PRESENTED: an attempt-1-shaped file', () => {
    const decision = evaluateAttempt4ExecutionLock(
      inputFor({ authorisationVersion: ATTEMPT_1_AUTHORISATION_VERSION }),
    );
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.refusal).toBe('ATTEMPT_1_AUTHORISATION_PRESENTED');
  });

  it('ATTEMPT_2_AUTHORISATION_PRESENTED: an attempt-2-shaped file', () => {
    const decision = evaluateAttempt4ExecutionLock(
      inputFor({ authorisationVersion: ATTEMPT_2_AUTHORISATION_VERSION }),
    );
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.refusal).toBe('ATTEMPT_2_AUTHORISATION_PRESENTED');
  });

  it('ATTEMPT_3_AUTHORISATION_PRESENTED: an attempt-3-shaped file', () => {
    const decision = evaluateAttempt4ExecutionLock(
      inputFor({ authorisationVersion: ATTEMPT_3_AUTHORISATION_VERSION }),
    );
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.refusal).toBe('ATTEMPT_3_AUTHORISATION_PRESENTED');
  });

  it('wrong F0O raw hash (freezeConfigRawSha256)', () => {
    const decision = evaluateAttempt4ExecutionLock(
      inputFor(validAuthorisation({ freezeConfigRawSha256: 'a'.repeat(64) })),
    );
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.refusal).toBe('AUTHORISATION_MALFORMED');
  });

  it('wrong plan hash', () => {
    const decision = evaluateAttempt4ExecutionLock(
      inputFor(validAuthorisation({ planSha256: 'b'.repeat(64) })),
    );
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.refusal).toBe('AUTHORISATION_MALFORMED');
  });

  it('wrong owner approval record hash: FREEZE_APPROVAL_RECORD_MISMATCH', () => {
    const decision = evaluateAttempt4ExecutionLock(
      inputFor(validAuthorisation({ freezeApprovalRecordRawSha256: 'c'.repeat(64) })),
    );
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.refusal).toBe('FREEZE_APPROVAL_RECORD_MISMATCH');
  });

  it('wrong V5 prompt version', () => {
    const decision = evaluateAttempt4ExecutionLock(
      inputFor(
        validAuthorisation({
          variants: [variant({ promptVersion: 'orgunit-classifier-prompt-v4' })],
        }),
      ),
    );
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.refusal).toBe('AUTHORISATION_MALFORMED');
  });

  it('wrong V5 prompt SHA-256', () => {
    const decision = evaluateAttempt4ExecutionLock(
      inputFor(validAuthorisation({ variants: [variant({ promptSha256: 'd'.repeat(64) })] })),
    );
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.refusal).toBe('AUTHORISATION_MALFORMED');
  });

  it('V4 runtime instead of V5: AUTHORISATION_VARIANT_MISMATCH', () => {
    // gitCommit is not a schema literal (only name/label/promptVersion/promptSha256
    // are), so a wrong commit reaches the runtime-equality check at the lock
    // boundary, not the schema.
    const decision = evaluateAttempt4ExecutionLock(
      inputFor(
        validAuthorisation({
          variants: [variant({ gitCommit: '7c3cb5b5b7e57c1c9cee03900c922a01b2075573' })],
        }),
      ),
    );
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.refusal).toBe('AUTHORISATION_VARIANT_MISMATCH');
  });

  it('repair floor 60000 instead of 120000', () => {
    const decision = evaluateAttempt4ExecutionLock(
      inputFor(
        validAuthorisation({
          repairPolicy: {
            enabled: true,
            maxRoundsPerLogicalEvaluation: 1,
            minimumRemainingBudgetMs: 60_000,
          },
        }),
      ),
    );
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.refusal).toBe('AUTHORISATION_MALFORMED');
  });

  it('altered ordinal ordering', () => {
    const decision = evaluateAttempt4ExecutionLock(
      inputFor(
        validAuthorisation({
          frozenLogicalBatchOrdinals: [2, 1, ...Array.from({ length: 10 }, (_, i) => i + 3)],
        }),
      ),
    );
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.refusal).toBe('AUTHORISATION_MALFORMED');
  });

  it('a nonzero rerun of ANY of the four prior variants is refused', () => {
    for (const name of PRIOR_VARIANTS_NEVER_RERUN) {
      const base = validAuthorisation().priorVariantReruns as Record<string, number>;
      const decision = evaluateAttempt4ExecutionLock(
        inputFor(validAuthorisation({ priorVariantReruns: { ...base, [name]: 1 } })),
      );
      expect(decision.granted).toBe(false);
      if (!decision.granted) expect(decision.refusal).toBe('AUTHORISATION_MALFORMED');
    }
  });

  it('provider ceiling > 61', () => {
    const decision = evaluateAttempt4ExecutionLock(
      inputFor(validAuthorisation({ maxProviderRequests: 62 })),
    );
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.refusal).toBe('AUTHORISATION_MALFORMED');
  });

  it('adapter ceiling > 183', () => {
    const decision = evaluateAttempt4ExecutionLock(
      inputFor(validAuthorisation({ maxAdapterAttempts: 184 })),
    );
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.refusal).toBe('AUTHORISATION_MALFORMED');
  });

  it('a non-NONE prohibition (each of the six) is refused', () => {
    for (const key of [
      'holdout',
      'goldLabelChanges',
      'thresholdChanges',
      'promptChanges',
      'databaseWrites',
      'migrationWrites',
    ] as const) {
      const base = validAuthorisation().prohibitions as Record<string, string>;
      const decision = evaluateAttempt4ExecutionLock(
        inputFor(validAuthorisation({ prohibitions: { ...base, [key]: 'SOME' } })),
      );
      expect(decision.granted).toBe(false);
      if (!decision.granted) expect(decision.refusal).toBe('AUTHORISATION_MALFORMED');
    }
  });

  it('wrong attempt number (schema literal 4 violated)', () => {
    const decision = evaluateAttempt4ExecutionLock(inputFor(validAuthorisation({ attemptNo: 3 })));
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.refusal).toBe('AUTHORISATION_MALFORMED');
  });

  it('wrong attempt number at the CALLER boundary (schema-valid 4, but this invocation expected a different attempt)', () => {
    const decision = evaluateAttempt4ExecutionLock(
      inputFor(validAuthorisation(), { expected: { outputRoot: OUTPUT_ROOT, attemptNo: 5 } }),
    );
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.refusal).toBe('AUTHORISATION_ATTEMPT_MISMATCH');
  });

  it('the authorised output root does not match the invocation output root', () => {
    const decision = evaluateAttempt4ExecutionLock(
      inputFor(validAuthorisation(), {
        expected: { outputRoot: '/synthetic/somewhere-else', attemptNo: 4 },
      }),
    );
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.refusal).toBe('AUTHORISATION_OUTPUT_ROOT_MISMATCH');
  });

  it('expired authorisation', () => {
    const decision = evaluateAttempt4ExecutionLock(
      inputFor(validAuthorisation(), { nowUtc: () => new Date('2026-09-16T00:00:00Z') }),
    );
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.refusal).toBe('AUTHORISATION_EXPIRED');
  });

  it('not-yet-valid authorisation', () => {
    const decision = evaluateAttempt4ExecutionLock(
      inputFor(validAuthorisation(), { nowUtc: () => new Date('2026-09-14T00:00:00Z') }),
    );
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.refusal).toBe('AUTHORISATION_NOT_YET_VALID');
  });

  it('validUntilUtc not after issuedAtUtc', () => {
    const decision = evaluateAttempt4ExecutionLock(
      inputFor(validAuthorisation({ validUntilUtc: '2026-09-15T00:00:00Z' })),
    );
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.refusal).toBe('AUTHORISATION_MALFORMED');
  });

  it('AUTHORISATION_ALREADY_CONSUMED: a duplicate presentation of the same bytes', () => {
    const decision = evaluateAttempt4ExecutionLock(
      inputFor(validAuthorisation(), { alreadyConsumed: () => true }),
    );
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.refusal).toBe('AUTHORISATION_ALREADY_CONSUMED');
  });

  it('one changed byte (a mutated statement) is refused before any grant', () => {
    const decision = evaluateAttempt4ExecutionLock(
      inputFor(
        validAuthorisation({
          operatorAuthorisationStatement: `${ATTEMPT4_AUTHORISATION_STATEMENT} `,
        }),
      ),
    );
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.refusal).toBe('AUTHORISATION_MALFORMED');
  });

  it('an unreadable authorisation path is refused', () => {
    const decision = evaluateAttempt4ExecutionLock(
      inputFor(validAuthorisation(), {
        readFile: () => {
          throw new Error('ENOENT');
        },
      }),
    );
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.refusal).toBe('AUTHORISATION_UNREADABLE');
  });

  it('a relative authorisation path is refused', () => {
    const decision = evaluateAttempt4ExecutionLock(
      inputFor(validAuthorisation(), { authorisationPath: 'relative/authorisation.json' }),
    );
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.refusal).toBe('AUTHORISATION_PATH_NOT_ABSOLUTE');
  });

  it('malformed JSON is refused', () => {
    const decision = evaluateAttempt4ExecutionLock(
      inputFor(validAuthorisation(), { readFile: () => Buffer.from('{not json', 'utf8') }),
    );
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.refusal).toBe('AUTHORISATION_MALFORMED');
  });

  it('an unknown extra key is refused (strict schema)', () => {
    const decision = evaluateAttempt4ExecutionLock(
      inputFor(validAuthorisation({ extraField: 'nope' })),
    );
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.refusal).toBe('AUTHORISATION_MALFORMED');
  });
});

// ---------------------------------------------------------------------------
// 2. The coordinator -> child boundary, over the REAL approved F0O plan.
// ---------------------------------------------------------------------------

function tier2Ok(scratch: string) {
  return {
    outcome: 'COMPLETED' as const,
    platform: 'posix' as const,
    pid: 4343,
    exitCode: 0,
    signal: null,
    gracefulShutdownRequested: false,
    gracefulPhase: null,
    gracePhaseVerdict: null,
    shutdownAcknowledged: false,
    exitedWithinGrace: false,
    gracefulShutdownConfirmed: false,
    hardKillRequired: false,
    hardKillDisposition: 'NOT_REQUIRED' as const,
    hardKillSuppressionReason: null,
    hardKill: null,
    posixGroupSweep: 'NO_SUCH_PROCESS' as const,
    stderrTail: '',
    scratchDir: join(scratch, 'gone'),
  };
}

function fakeLauncher(): {
  readonly launcher: ChildLauncher;
  readonly launched: { variantName: string; ordinal: number; attemptNo: number }[];
} {
  const launched: { variantName: string; ordinal: number; attemptNo: number }[] = [];
  const launcher: ChildLauncher = {
    launch: async (input: ChildLaunchInput) => {
      const manifest = (
        JSON.parse(readFileSync(input.manifestPath, 'utf8')) as {
          record: { variantName: string; logicalBatchOrdinal: number; attemptNo: number };
        }
      ).record;
      launched.push({
        variantName: manifest.variantName,
        ordinal: manifest.logicalBatchOrdinal,
        attemptNo: manifest.attemptNo,
      });
      const dir = input.attemptDir;
      writeArtifactOnce(dir, 'CHILD_PREFLIGHT', {
        ok: true,
        stopCondition: null,
        detail: 'fake',
        checks: [],
        providerConstructed: false,
      });
      const serialization = canonicalStringify({ results: [] });
      writeArtifactOnce(dir, 'RAW_OUTPUT_CHECKPOINT', {
        rawOutputCanonicalSerialization: serialization,
        rawOutputSha256: sha256Hex(serialization),
        rawOutputUtf8Bytes: Buffer.byteLength(serialization, 'utf8'),
      });
      writeArtifactOnce(dir, 'VALIDATION_RESULT', {
        kind: 'SCHEMA_INVALID',
        detail: 'fake',
        accepted: [],
        rejected: [],
      });
      writeArtifactOnce(dir, 'PROVIDER_OUTCOME', {
        outcome: 'OK',
        providerReportedModelId: MODEL,
        inputTokens: 10,
        outputTokens: 20,
        outcomeDetail: null,
        internalAdapterAttemptCountWhereObservable: 1,
        authStatusInvocationsObserved: 1,
        startedAtUtc: '2026-09-15T12:00:00.000Z',
        endedAtUtc: '2026-09-15T12:00:01.000Z',
        monotonicWallTimeMs: 1000,
        tier1DiagnosticsCaptured: 0,
      });
      writeArtifactOnce(dir, 'CHILD_RESULT', {
        variantName: manifest.variantName,
        logicalBatchOrdinal: manifest.logicalBatchOrdinal,
        attemptNo: manifest.attemptNo,
        providerOutcome: 'OK',
        providerReportedModelId: MODEL,
        rawCheckpointPersistedBeforeValidation: true,
        rawBeforeValidationSequence: { persistedSeq: 1, validationStartedSeq: 2 },
        childStopCondition: null,
        artifactHashes: {},
        repairRound: null,
      });
      return tier2Ok(SCRATCH);
    },
  };
  return { launcher, launched };
}

function experimentInput(
  overrides: Partial<ExperimentInput> & { readonly launcher: ChildLauncher },
): ExperimentInput {
  const outputRoot = scratchDir('out');
  return {
    plan: PLAN,
    freezePath: join(ROOT, F0O_FREEZE_PATH),
    outputRoot,
    attemptNo: 4,
    authorisation: { authorisationVersion: 'synthetic-for-test' },
    authorisationSha256: sha256Hex(`f0p-auth-${counter}`),
    variantRoots: { PROMPT_V5_CANONICAL: '/synthetic/v5' },
    classifierConfigDir: '/synthetic/profile',
    parentEnv: { PATH: '/usr/bin', HOME: '/home/x' },
    platform: 'posix',
    clock: { nowUtc: () => new Date('2026-09-15T12:00:00Z') },
    ...overrides,
  };
}

describe('2D2C-F0P: the coordinator builds and launches all twelve V5 children', () => {
  it('runs the real approved F0O plan end to end against a fake launcher', async () => {
    const { launcher, launched } = fakeLauncher();
    const input = experimentInput({ launcher });
    const result = await runExperiment(input);
    expect(result.status).toBe('COMPLETED_ALL_PLANNED');
    expect(result.halt).toBeNull();
    expect(result.evaluationsStarted).toBe(12);
    expect(result.perVariantEndedWithoutStop).toEqual({ PROMPT_V5_CANONICAL: 12 });
    expect(launched).toEqual(
      Array.from({ length: 12 }, (_, index) => ({
        variantName: 'PROMPT_V5_CANONICAL',
        ordinal: index + 1,
        attemptNo: 4,
      })),
    );
    for (let ordinal = 1; ordinal <= 12; ordinal += 1) {
      const dir = attemptDirectoryOf(input.outputRoot, 'PROMPT_V5_CANONICAL', ordinal, 4);
      const manifest = record<ChildManifest>(dir, 'CHILD_MANIFEST');
      expect(manifest?.variantName).toBe('PROMPT_V5_CANONICAL');
      expect(manifest?.variantLabel).toBe('PROMPT_V5_CANDIDATE');
      expect(manifest?.variantGitCommit).toBe(F0O_VARIANT.gitCommit);
      expect(manifest?.attemptNo).toBe(4);
      expect(manifest?.freezeConfigRawSha256).toBe(PROPOSED_F0O_FREEZE_RAW_SHA256);
    }
    expect(existsSync(authorisationMarkerPathOf(input.outputRoot, input.authorisationSha256))).toBe(
      true,
    );
  });

  it('reproduces the F0K failure MODE for an unadmitted future variant (V9): halts with planned-input written and child-manifest absent', async () => {
    const { launcher, launched } = fakeLauncher();
    const unadmitted = {
      ...PLAN,
      plannedLogicalEvaluations: 1,
      evaluations: [{ ...V5_BATCH_1, variantName: 'PROMPT_V9_CANONICAL' }],
    };
    const input = experimentInput({
      launcher,
      plan: unadmitted,
      variantRoots: { PROMPT_V9_CANONICAL: '/synthetic/v9' },
    });
    await expect(runExperiment(input)).rejects.toThrow();
    const dir = attemptDirectoryOf(input.outputRoot, 'PROMPT_V9_CANONICAL', 1, 4);
    expect(existsSync(join(dir, 'planned-input.json'))).toBe(true);
    expect(existsSync(join(dir, 'child-manifest.json'))).toBe(false);
    expect(launched).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. The child, in process, under a real F0O manifest.
// ---------------------------------------------------------------------------

const VARIANT_ROOT = '/synthetic/variant-root-v5';

function fakeRuntime(): LoadedVariantRuntime {
  const names = [
    'canonical',
    'finalIdentity',
    'prompt',
    'outputSchema',
    'validate',
    'constants',
    'retry',
    'score',
    'policy',
    'allowedModels',
    'sdkOptions',
    'authStatusRunner',
    'environment',
    'claudeCodeExecutable',
    'repair',
  ];
  return {
    root: VARIANT_ROOT,
    moduleUrls: Object.fromEntries(
      names.map((m) => [m, `file://${VARIANT_ROOT}/dist/${m}.js`]),
    ) as LoadedVariantRuntime['moduleUrls'],
    canonical: canonicalModule,
    finalIdentity: finalIdentityModule,
    // THIS worktree's production prompt is the V3 text, NOT the V5 text: the
    // V5 prompt lives only in the frozen V5 runtime root and is never copied
    // here. That is exactly why `promptSha256` is the one identity below that
    // legitimately differs — and why every OTHER identity matching proves the
    // child reconstructs a real V5 evaluation.
    prompt: promptModule,
    outputSchema: outputSchemaModule,
    validate: validateModule,
    constants: constantsModule,
    retry: retryModule,
    score: scoreModule,
    policy: policyModule,
    allowedModels: allowedModelsModule,
    sdkOptions: sdkOptionsModule,
    authStatusRunner: authStatusRunnerModule,
    environment: environmentModule,
    claudeCodeExecutable: claudeCodeExecutableModule,
    repair: repairModule,
  };
}

function manifestFor(dir: string, overrides: Partial<ChildManifest> = {}): ChildManifest {
  const e = V5_BATCH_1;
  return {
    runnerRecordVersion: RUNNER_ARTIFACT_VERSION,
    freezePath: join(ROOT, F0O_FREEZE_PATH),
    freezeConfigRawSha256: rawSha256,
    freezeVersion: freeze.version,
    variantName: e.variantName,
    variantLabel: e.variantLabel,
    variantGitCommit: e.variantGitCommit,
    variantRoot: VARIANT_ROOT,
    promptVersion: e.promptVersion,
    promptSha256: e.promptSha256,
    logicalBatchOrdinal: e.logicalBatchOrdinal,
    organisationId: e.organisationId,
    echeRowKey: e.echeRowKey,
    orderedGoldIds: e.orderedGoldIds,
    orderedDocIndices: e.orderedDocIndices,
    batchContext: e.batchContext,
    serializedBatchUtf8Bytes: e.serializedBatchUtf8Bytes,
    assemblyInputSha256: e.assemblyInputSha256,
    finalInputSha256: e.finalInputSha256,
    requestedModelId: PLAN.requestedModelId,
    runConfig: { maxTurns: 3, thinking: 'disabled' },
    outputSchemaVersion: PLAN.outputSchemaVersion,
    attemptNo: 4,
    attemptDir: dir,
    classifierConfigDir: '/synthetic/profile',
    ...overrides,
  };
}

const childScratch: string[] = [];
afterEach(() => {
  for (const dir of childScratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function childHarness(
  dir: string,
  options: { readonly manifest?: Partial<ChildManifest>; readonly freezeBytes?: Buffer } = {},
): { readonly manifestPath: string; readonly deps: ChildDependencies; factoryCalls: () => number } {
  const manifest = manifestFor(dir, options.manifest);
  const manifestPath = join(dir, 'manifest-envelope.json');
  writeFileSync(
    manifestPath,
    JSON.stringify({
      artifactKind: 'CHILD_MANIFEST',
      artifactVersion: RUNNER_ARTIFACT_VERSION,
      record: manifest,
      recordSha256: sha256Hex(canonicalStringify(manifest)),
    }),
  );
  const runtime = fakeRuntime();
  let factoryCalls = 0;
  let mono = 1000;
  const deps: ChildDependencies = {
    env: {
      PATH: '/usr/bin',
      HOME: '/home/x',
      NWF_PE_CLASSIFIER_CONFIG_DIR: '/synthetic/profile',
      NWF_PE_TIER2_SCRATCH_DIR: dir,
    },
    readFile: (path) => {
      if (path === manifestPath) return readFileSync(manifestPath);
      if (path === manifest.freezePath) return options.freezeBytes ?? F0O_BYTES;
      if (path.startsWith(`${VARIANT_ROOT}/`))
        return readFileSync(join(ROOT, path.slice(VARIANT_ROOT.length + 1)));
      throw new Error(`unexpected read ${path}`);
    },
    verifyRoot: async (variantName, root) => ({
      variantName,
      root,
      ok: true,
      checks: [{ id: 'PATH_ABSOLUTE_AND_REAL', ok: true, detail: 'fake' }],
      runtime,
      claudeCodeExecutable: null,
    }),
    providerFactory: {
      create: async () => {
        factoryCalls += 1;
        throw new Error('this test must never construct a provider');
      },
    },
    clock: {
      nowUtc: () => new Date('2026-09-15T12:00:00Z'),
      monotonicMs: () => (mono += 250),
    },
  };
  return { manifestPath, deps, factoryCalls: () => factoryCalls };
}

function childDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'nwf-pe-2d2c-f0p-child-'));
  childScratch.push(dir);
  return dir;
}

describe('2D2C-F0P: the child under a real attempt-4 (F0O) manifest', () => {
  it('resolves the F0O family, finds the V5 variant, and re-derives EVERY identity except the prompt this worktree cannot carry', async () => {
    const dir = childDir();
    const h = childHarness(dir);
    const outcome = await runChildEvaluation(h.manifestPath, h.deps);
    expect(outcome.stopCondition).toBe('CORPUS_CONFIG_OR_HASH_DRIFT');
    expect(h.factoryCalls()).toBe(0);
    const preflight = record<{ detail: string; checks: { mismatches?: string[] } }>(
      dir,
      'CHILD_PREFLIGHT',
    );
    expect(preflight?.checks.mismatches).toEqual(['promptSha256']);
    expect(preflight?.detail).not.toContain('is not a variant this freeze');
  });

  it('a V1, V2, V3 or V4 manifest under F0O is refused before any provider construction', async () => {
    for (const [variantName, variantLabel] of [
      ['PROMPT_V1_CANONICAL', 'PROMPT_V1_COMPARATOR'],
      ['PROMPT_V2_CANONICAL', 'PROMPT_V2_CANDIDATE'],
      ['PROMPT_V3_CANONICAL', 'PROMPT_V3_CANDIDATE'],
      ['PROMPT_V4_CANONICAL', 'PROMPT_V4_CANDIDATE'],
    ] as const) {
      const dir = childDir();
      const h = childHarness(dir, { manifest: { variantName, variantLabel } });
      const outcome = await runChildEvaluation(h.manifestPath, h.deps);
      expect(outcome.stopCondition).toBe('CORPUS_CONFIG_OR_HASH_DRIFT');
      expect(h.factoryCalls()).toBe(0);
      expect(record<{ detail: string }>(dir, 'CHILD_PREFLIGHT')?.detail).toContain(
        `${variantName} is not a variant this freeze (F0O_ATTEMPT_4) schedules`,
      );
    }
  });

  it('F0P: an F0O manifest requesting attempt 1, 2 or 3 is refused by the symmetric attempt gate', async () => {
    for (const attemptNo of [1, 2, 3]) {
      const dir = childDir();
      const h = childHarness(dir, { manifest: { attemptNo } });
      const outcome = await runChildEvaluation(h.manifestPath, h.deps);
      expect(outcome.stopCondition).toBe('CORPUS_CONFIG_OR_HASH_DRIFT');
      expect(h.factoryCalls()).toBe(0);
      expect(record<{ detail: string }>(dir, 'CHILD_PREFLIGHT')?.detail).toBe(
        `the F0O freeze configures attempt 4; the manifest requests attempt ${attemptNo}.`,
      );
    }
  });

  it('names the F0O family in its own hash-drift message, and leaves the F0I, F0E and F0B messages unchanged', async () => {
    const f0o = childDir();
    let h = childHarness(f0o, { manifest: { freezeConfigRawSha256: 'a'.repeat(64) } });
    await runChildEvaluation(h.manifestPath, h.deps);
    expect(record<{ detail: string }>(f0o, 'CHILD_PREFLIGHT')?.detail).toBe(
      'the manifest freeze hash is not the approved F0O hash.',
    );
    const f0i = childDir();
    h = childHarness(f0i, {
      freezeBytes: F0I_BYTES,
      manifest: { freezeConfigRawSha256: 'a'.repeat(64) },
    });
    await runChildEvaluation(h.manifestPath, h.deps);
    expect(record<{ detail: string }>(f0i, 'CHILD_PREFLIGHT')?.detail).toBe(
      'the manifest freeze hash is not the approved F0I hash.',
    );
    const f0e = childDir();
    h = childHarness(f0e, {
      freezeBytes: F0E_BYTES,
      manifest: { freezeConfigRawSha256: 'a'.repeat(64) },
    });
    await runChildEvaluation(h.manifestPath, h.deps);
    expect(record<{ detail: string }>(f0e, 'CHILD_PREFLIGHT')?.detail).toBe(
      'the manifest freeze hash is not the proposed F0E hash.',
    );
    const f0b = childDir();
    h = childHarness(f0b, {
      freezeBytes: F0B_BYTES,
      manifest: { freezeConfigRawSha256: 'a'.repeat(64) },
    });
    await runChildEvaluation(h.manifestPath, h.deps);
    expect(record<{ detail: string }>(f0b, 'CHILD_PREFLIGHT')?.detail).toBe(
      'the manifest freeze hash is not the F0B hash.',
    );
    // The four families remain distinguishable by hash alone.
    expect(
      new Set([
        PROPOSED_F0O_FREEZE_RAW_SHA256,
        PROPOSED_F0I_FREEZE_RAW_SHA256,
        PROPOSED_F0E_FREEZE_RAW_SHA256,
        EXPECTED_F0B_FREEZE_RAW_SHA256,
      ]).size,
    ).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 4. PROCESS level: the real Tier-2 child entry, request-free by construction.
//    This is the physical proof that V5 dispatch reaches the point
//    immediately before provider inference, with zero real provider calls.
// ---------------------------------------------------------------------------

describe.skipIf(IS_WINDOWS)(
  '2D2C-F0P: the REAL child entry under an attempt-4 (F0O) manifest',
  () => {
    it('boots, admits the V5 manifest, resolves the F0O family by hash, and stops at preflight against a non-frozen root — before any provider import', async () => {
      const pids: number[] = [];
      const launcher: ChildLauncher = {
        launch: (input) =>
          runProcessIsolatedBatch({
            modulePath: CHILD_ENTRY_PATH,
            args: ['--manifest', input.manifestPath],
            watchdogMs: 20_000,
            graceMs: 1_000,
            childEnv: input.childEnv,
            onChildSpawned: (pid) => {
              pids.push(pid);
            },
          }),
      };
      const input = experimentInput({
        launcher,
        plan: { ...PLAN, evaluations: PLAN.evaluations.slice(0, 1), plannedLogicalEvaluations: 1 },
        // THIS worktree, which is not the frozen V5 runtime root: the root check
        // fails, which is what makes the run structurally unable to reach a
        // provider, an auth path or a socket.
        variantRoots: { PROMPT_V5_CANONICAL: ROOT },
        parentEnv: {
          PATH: process.env['PATH'] ?? '',
          HOME: process.env['HOME'] ?? '',
          TMPDIR: process.env['TMPDIR'] ?? tmpdir(),
        },
      });
      const result = await runExperiment(input);
      expect(result.halt).toMatchObject({
        kind: 'STOP_CONDITION',
        stopCondition: 'CORPUS_CONFIG_OR_HASH_DRIFT',
        atSequence: 1,
      });
      expect(pids).toHaveLength(1);
      const dir = attemptDirectoryOf(input.outputRoot, 'PROMPT_V5_CANONICAL', 1, 4);
      // The manifest WAS built and WAS read by a real child process.
      expect(record<ChildManifest>(dir, 'CHILD_MANIFEST')?.variantName).toBe('PROMPT_V5_CANONICAL');
      const preflight = record<{
        ok: boolean;
        stopCondition: string;
        checks: { stage: string };
        providerConstructed: boolean;
      }>(dir, 'CHILD_PREFLIGHT');
      expect(preflight?.ok).toBe(false);
      expect(preflight?.providerConstructed).toBe(false);
      expect(preflight?.checks.stage).toBe('variantRoot');
      expect(existsSync(join(dir, 'provider-outcome.json'))).toBe(false);
      expect(existsSync(join(dir, 'raw-output-checkpoint.json'))).toBe(false);
    }, 60_000);
  },
);

// ---------------------------------------------------------------------------
// 5. The plan-only CLI, against REAL committed F0O/F0I/F0E/F0B bytes.
// ---------------------------------------------------------------------------

function cliIo(
  overrides: Partial<F0OCliIo> = {},
): F0OCliIo & { readonly out: string[]; readonly err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return {
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
    env: { PATH: '/usr/bin', HOME: '/home/x' },
    nowUtc: () => NOW,
    launcher: { launch: async () => tier2Ok(SCRATCH) },
    out,
    err,
    ...overrides,
  };
}

describe('2D2C-F0P: parseF0OCliArgs is a closed parser', () => {
  it('parses every flag, and refuses an unknown one', () => {
    const options = parseF0OCliArgs([
      '--execute',
      '--authorisation',
      '/a/b.json',
      '--output-root',
      '/a/out',
      '--attempt-no',
      '4',
      '--v5-root',
      '/a/v5',
      '--attempt1-root',
      '/a/1',
      '--attempt2-root',
      '/a/2',
      '--attempt3-root',
      '/a/3',
      '--classifier-config-dir',
      '/a/profile',
      '--json',
    ]);
    expect(options).toMatchObject({
      execute: true,
      authorisation: '/a/b.json',
      outputRoot: '/a/out',
      attemptNo: 4,
      v5Root: '/a/v5',
      attempt1Root: '/a/1',
      attempt2Root: '/a/2',
      attempt3Root: '/a/3',
      classifierConfigDir: '/a/profile',
      json: true,
    });
    expect(() => parseF0OCliArgs(['--v4-root', '/nope'])).toThrow();
    expect(() => parseF0OCliArgs(['--bogus'])).toThrow();
  });
});

describe('2D2C-F0P: the plan-only CLI against real committed bytes', () => {
  it('exits 0 and reports every readiness check ok with no root/comparator supplied', async () => {
    const io = cliIo();
    const code = await runF0OCli([], io);
    expect(code).toBe(0);
    const text = io.out.join('');
    expect(text).toContain('PLAN / READINESS ONLY');
    expect(text).toContain(PROPOSED_F0O_FREEZE_RAW_SHA256);
    expect(text).toContain(PROPOSED_F0O_PLAN_SHA256);
    expect(text).not.toContain('FAIL');
    expect(io.err).toEqual([]);
  });

  it('--json reports a structured summary naming the pinned identities', async () => {
    const io = cliIo();
    const code = await runF0OCli(['--json'], io);
    expect(code).toBe(0);
    const parsed = JSON.parse(io.out.join('')) as Record<string, unknown>;
    expect(parsed['freezeConfigRawSha256']).toBe(PROPOSED_F0O_FREEZE_RAW_SHA256);
    expect(parsed['planSha256']).toBe(PROPOSED_F0O_PLAN_SHA256);
    expect(parsed['executionAuthorisation']).toBe('NOT_EVALUATED_IN_PLAN_ONLY_MODE');
  });

  it('--execute without --authorisation is refused before any provider/child path', async () => {
    const outputRoot = scratchDir('exec-missing-auth');
    const io = cliIo();
    const code = await runF0OCli(
      ['--execute', '--output-root', outputRoot, '--attempt-no', '4'],
      io,
    );
    expect(code).toBe(2);
    expect(io.err.join('')).toContain('requires');
  });

  it('--execute with the wrong attempt number is refused', async () => {
    const outputRoot = scratchDir('exec-wrong-attempt');
    const io = cliIo();
    const code = await runF0OCli(
      [
        '--execute',
        '--authorisation',
        '/synthetic/auth.json',
        '--output-root',
        outputRoot,
        '--attempt-no',
        '3',
        '--v5-root',
        '/synthetic/v5',
        '--classifier-config-dir',
        '/synthetic/profile',
      ],
      io,
    );
    expect(code).toBe(2);
    expect(io.err.join('')).toContain('attempt 4');
  });

  it('--verify-authorisation-candidate combined with --execute is refused outright', async () => {
    const io = cliIo();
    const code = await runF0OCli(
      ['--execute', '--verify-authorisation-candidate', '/synthetic/candidate.json'],
      io,
    );
    expect(code).toBe(2);
    expect(io.err.join('')).toContain('CANDIDATE_VERIFICATION_EXCLUDES_EXECUTION');
  });

  it('a candidate naming a non-empty output root is refused, and nothing is issued or consumed', async () => {
    const outputRoot = scratchDir('candidate-nonempty');
    writeFileSync(join(outputRoot, 'stray-file.txt'), 'not empty');
    const candidatePath = join(scratchDir('candidate-file'), 'candidate.json');
    writeFileSync(candidatePath, JSON.stringify(validAuthorisation({ outputRoot })));
    const io = cliIo();
    const code = await runF0OCli(
      [
        '--verify-authorisation-candidate',
        candidatePath,
        '--output-root',
        outputRoot,
        '--attempt-no',
        '4',
      ],
      io,
    );
    expect(code).toBe(1);
    const text = io.out.join('');
    expect(text).toContain('ATTEMPT4_OUTPUT_ROOT_NOT_EMPTY');
    expect(text).toContain('issued: false; consumed: false');
  });

  it('a structurally acceptable candidate against a FRESH empty output root reports STRUCTURALLY_ACCEPTABLE and creates no marker', async () => {
    const outputRoot = scratchDir('candidate-fresh');
    const candidatePath = join(scratchDir('candidate-file'), 'candidate.json');
    writeFileSync(candidatePath, JSON.stringify(validAuthorisation({ outputRoot })));
    const io = cliIo();
    const code = await runF0OCli(
      [
        '--verify-authorisation-candidate',
        candidatePath,
        '--output-root',
        outputRoot,
        '--attempt-no',
        '4',
      ],
      io,
    );
    expect(code).toBe(0);
    const text = io.out.join('');
    expect(text).toContain('STRUCTURALLY_ACCEPTABLE');
    expect(text).toContain('issued: false; consumed: false');
    expect(existsSync(join(outputRoot, 'authorisations'))).toBe(false);
    // The output root is still empty: verification writes nothing.
    expect(readdirSync(outputRoot).length).toBe(0);
  });
});
