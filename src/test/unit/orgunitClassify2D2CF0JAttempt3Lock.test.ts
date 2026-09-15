/**
 * PHASE 2B-2D2C-F0J — the ATTEMPT-3 triple execution lock, pinned to the
 * approved+ratified F0I freeze.
 *
 * Proves that nothing which satisfied the attempt-1 or attempt-2 lock can
 * satisfy this one; that production pins the RECORDED F0I approval AND
 * ratification hashes (both non-null, both REAL, both checked); and that
 * every pinned value is checked: the spent attempt-1/attempt-2 bytes, the
 * attempt-1/attempt-2 authorisation shapes, the wrong freeze/plan hash, the
 * wrong prompt version/hash, the wrong runtime commit (V3B instead of V4),
 * the wrong repair floor (60000 instead of 120000), an altered ordinal
 * order, a nonzero rerun count for ANY of the three prior variants, an
 * inflated provider/adapter ceiling, a non-NONE prohibition, the wrong
 * output root, the wrong attempt number, an expired/not-yet-valid window,
 * and a duplicate (already-consumed) presentation. No file outside a
 * scratch directory is read; nothing is written outside it; no launcher
 * exists here.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { REPAIR_MINIMUM_REMAINING_BUDGET_MS } from '../../orgunits/classify/repair.js';
import { EXPECTED_LOGICAL_BATCHES_PER_VARIANT } from '../harness/phase2b2d2c/constants.js';
import {
  ATTEMPT_1_AUTHORISATION_VERSION,
  ATTEMPT_2_AUTHORISATION_VERSION,
  ATTEMPT3_AUTHORISATION_STATEMENT,
  ATTEMPT3_AUTHORISATION_VERSION,
  ATTEMPT3_FROZEN_ORDINALS,
  ATTEMPT3_MAX_ADAPTER_ATTEMPTS,
  ATTEMPT3_MAX_PROVIDER_REQUESTS,
  Attempt3ExecutionAuthorisationSchema,
  evaluateAttempt3ExecutionLock,
  PRIOR_VARIANTS_NEVER_RERUN,
  verifyAttempt3AuthorisationCandidate,
  type Attempt3ExecutionAuthorisation,
  type Attempt3ExecutionLockInput,
} from '../harness/phase2b2d2c/f0i/authorisationF0I.js';
import {
  F0I_APPROVAL_RECORD_RAW_SHA256,
  F0I_RATIFICATION_RECORD_RAW_SHA256,
  F0I_VARIANT,
  PROPOSED_F0I_FREEZE_RAW_SHA256,
  PROPOSED_F0I_PLAN_SHA256,
  SPENT_ATTEMPT_1_AUTHORISATION_SHA256,
  SPENT_ATTEMPT_2_AUTHORISATION_SHA256,
  V3B_RUNTIME_COMMIT,
} from '../harness/phase2b2d2c/f0i/freezeF0I.js';
import { sha256Hex } from '../harness/phase2b2d2c/freeze.js';

const NOW = new Date('2026-09-15T12:00:00Z');
const OUTPUT_ROOT = '/synthetic/attempt-3-output';

type AuthorisedVariant = Attempt3ExecutionAuthorisation['variants'][number];
/**
 * `overrides` is deliberately untyped (`Record<string, unknown>`), never
 * `Partial<AuthorisedVariant>`: the mutation-coverage tests below construct
 * INTENTIONALLY WRONG values (a stale prompt version, a foreign hash, an
 * inflated ceiling) to prove the runtime schema refuses them — the schema's
 * own literal types would refuse those same values at COMPILE time, which
 * would just move the proof from "the lock refuses this" to "TypeScript
 * refuses this", defeating the test's purpose.
 */
function variant(overrides: Record<string, unknown> = {}): AuthorisedVariant {
  return {
    name: F0I_VARIANT.name,
    label: F0I_VARIANT.label,
    gitCommit: F0I_VARIANT.gitCommit,
    promptVersion: F0I_VARIANT.promptVersion,
    promptSha256: F0I_VARIANT.runtimePromptSha256,
    ...overrides,
  } as AuthorisedVariant;
}

function validAuthorisation(
  overrides: Record<string, unknown> = {},
): Attempt3ExecutionAuthorisation {
  return {
    authorisationVersion: ATTEMPT3_AUTHORISATION_VERSION,
    scope: 'DEVELOPMENT_ONLY',
    attemptNo: 3,
    freezeConfigRawSha256: PROPOSED_F0I_FREEZE_RAW_SHA256,
    planSha256: PROPOSED_F0I_PLAN_SHA256,
    freezeApprovalRecordRawSha256: F0I_APPROVAL_RECORD_RAW_SHA256 as string,
    freezeApprovalRatificationRecordRawSha256: F0I_RATIFICATION_RECORD_RAW_SHA256 as string,
    variants: [variant()],
    maxLogicalEvaluations: EXPECTED_LOGICAL_BATCHES_PER_VARIANT,
    frozenLogicalBatchOrdinals: [...ATTEMPT3_FROZEN_ORDINALS],
    priorVariantReruns: { PROMPT_V1_CANONICAL: 0, PROMPT_V2_CANONICAL: 0, PROMPT_V3_CANONICAL: 0 },
    maxProviderRequests: ATTEMPT3_MAX_PROVIDER_REQUESTS,
    maxAdapterAttempts: ATTEMPT3_MAX_ADAPTER_ATTEMPTS,
    repairPolicy: {
      enabled: true,
      maxRoundsPerLogicalEvaluation: 1,
      minimumRemainingBudgetMs: REPAIR_MINIMUM_REMAINING_BUDGET_MS,
    },
    prohibitions: {
      holdout: 'NONE',
      goldLabelChanges: 'NONE',
      thresholdChanges: 'NONE',
      databaseWrites: 'NONE',
      migrationWrites: 'NONE',
    },
    outputRoot: OUTPUT_ROOT,
    issuedAtUtc: '2026-09-15T00:00:00Z',
    validUntilUtc: '2026-09-15T23:59:59Z',
    operatorAuthorisationStatement: ATTEMPT3_AUTHORISATION_STATEMENT,
    ...overrides,
  } as Attempt3ExecutionAuthorisation;
}

const writtenFiles: string[] = [];
function bytesOf(authorisation: unknown): Buffer {
  return Buffer.from(JSON.stringify(authorisation), 'utf8');
}
afterAll(() => {
  // Nothing is actually written to disk by this file; readFile is stubbed
  // per-test. This afterAll exists only to document that intent.
  expect(writtenFiles).toEqual([]);
});

function inputFor(
  authorisation: unknown,
  overrides: Partial<Attempt3ExecutionLockInput> = {},
): Attempt3ExecutionLockInput {
  const bytes = bytesOf(authorisation);
  return {
    executeFlag: true,
    authorisationPath: '/synthetic/authorisation.json',
    expected: { outputRoot: OUTPUT_ROOT, attemptNo: 3 },
    readFile: () => bytes,
    sha256: sha256Hex,
    alreadyConsumed: () => false,
    nowUtc: () => NOW,
    ...overrides,
  };
}

describe('2D2C-F0J: real production pins are non-null and are what the lock checks', () => {
  it('F0I_APPROVAL_RECORD_RAW_SHA256 and F0I_RATIFICATION_RECORD_RAW_SHA256 are both pinned (non-null)', () => {
    expect(F0I_APPROVAL_RECORD_RAW_SHA256).not.toBeNull();
    expect(F0I_RATIFICATION_RECORD_RAW_SHA256).not.toBeNull();
    expect(F0I_APPROVAL_RECORD_RAW_SHA256).toMatch(/^[0-9a-f]{64}$/);
    expect(F0I_RATIFICATION_RECORD_RAW_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('the statement names the real pinned identities, never a placeholder', () => {
    expect(ATTEMPT3_AUTHORISATION_STATEMENT).toContain(PROPOSED_F0I_FREEZE_RAW_SHA256);
    expect(ATTEMPT3_AUTHORISATION_STATEMENT).toContain(PROPOSED_F0I_PLAN_SHA256);
    expect(ATTEMPT3_AUTHORISATION_STATEMENT).toContain(F0I_APPROVAL_RECORD_RAW_SHA256 as string);
    expect(ATTEMPT3_AUTHORISATION_STATEMENT).toContain(
      F0I_RATIFICATION_RECORD_RAW_SHA256 as string,
    );
    expect(ATTEMPT3_AUTHORISATION_STATEMENT).toContain(F0I_VARIANT.gitCommit);
    expect(ATTEMPT3_AUTHORISATION_STATEMENT).toContain(F0I_VARIANT.runtimePromptSha256);
    expect(ATTEMPT3_AUTHORISATION_STATEMENT).not.toContain('<NO F0I APPROVAL RECORD IS PINNED');
    expect(ATTEMPT3_AUTHORISATION_STATEMENT).not.toContain('<NO F0I RATIFICATION RECORD IS PINNED');
  });

  it('the mechanical ceiling is 61 provider requests / 183 adapter attempts', () => {
    expect(ATTEMPT3_MAX_PROVIDER_REQUESTS).toBe(61);
    expect(ATTEMPT3_MAX_ADAPTER_ATTEMPTS).toBe(183);
  });

  it('the three never-rerun prior variants are exactly V1, V2, V3', () => {
    expect(PRIOR_VARIANTS_NEVER_RERUN).toEqual([
      'PROMPT_V1_CANONICAL',
      'PROMPT_V2_CANONICAL',
      'PROMPT_V3_CANONICAL',
    ]);
  });
});

describe('2D2C-F0J: a structurally valid authorisation is GRANTED', () => {
  it('schema-parses and the lock grants it', () => {
    const authorisation = validAuthorisation();
    expect(Attempt3ExecutionAuthorisationSchema.safeParse(authorisation).success).toBe(true);
    const decision = evaluateAttempt3ExecutionLock(inputFor(authorisation));
    expect(decision.granted).toBe(true);
    if (decision.granted) {
      expect(decision.authorisationSha256).toBe(sha256Hex(bytesOf(authorisation)));
    }
  });

  it('verifyAttempt3AuthorisationCandidate reaches the same grant without an executeFlag', () => {
    const authorisation = validAuthorisation();
    const decision = verifyAttempt3AuthorisationCandidate({
      authorisationPath: '/synthetic/authorisation.json',
      expected: { outputRoot: OUTPUT_ROOT, attemptNo: 3 },
      readFile: () => bytesOf(authorisation),
      sha256: sha256Hex,
      alreadyConsumed: () => false,
      nowUtc: () => NOW,
    });
    expect(decision.granted).toBe(true);
  });
});

describe('2D2C-F0J: fail-closed mutation coverage (spec section 7)', () => {
  const refused = (authorisation: unknown, ioOverrides: Partial<Attempt3ExecutionLockInput> = {}) =>
    evaluateAttempt3ExecutionLock(inputFor(authorisation, ioOverrides));

  it('EXECUTE_FLAG_ABSENT: no --execute', () => {
    const d = evaluateAttempt3ExecutionLock(inputFor(validAuthorisation(), { executeFlag: false }));
    expect(d.granted).toBe(false);
  });

  it('SPENT_ATTEMPT_1_AUTHORISATION_PRESENTED: the exact attempt-1 bytes', () => {
    const bytes = Buffer.from('irrelevant', 'utf8');
    const d = evaluateAttempt3ExecutionLock(
      inputFor(validAuthorisation(), {
        readFile: () => bytes,
        sha256: () => SPENT_ATTEMPT_1_AUTHORISATION_SHA256,
      }),
    );
    expect(d.granted).toBe(false);
    if (!d.granted) expect(d.refusal).toBe('SPENT_ATTEMPT_1_AUTHORISATION_PRESENTED');
  });

  it('SPENT_ATTEMPT_2_AUTHORISATION_PRESENTED: the exact attempt-2 bytes', () => {
    const bytes = Buffer.from('irrelevant', 'utf8');
    const d = evaluateAttempt3ExecutionLock(
      inputFor(validAuthorisation(), {
        readFile: () => bytes,
        sha256: () => SPENT_ATTEMPT_2_AUTHORISATION_SHA256,
      }),
    );
    expect(d.granted).toBe(false);
    if (!d.granted) expect(d.refusal).toBe('SPENT_ATTEMPT_2_AUTHORISATION_PRESENTED');
  });

  it('ATTEMPT_1_AUTHORISATION_PRESENTED: an attempt-1-shaped file', () => {
    const d = refused({ authorisationVersion: ATTEMPT_1_AUTHORISATION_VERSION });
    expect(d.granted).toBe(false);
    if (!d.granted) expect(d.refusal).toBe('ATTEMPT_1_AUTHORISATION_PRESENTED');
  });

  it('ATTEMPT_2_AUTHORISATION_PRESENTED: an attempt-2-shaped file', () => {
    const d = refused({ authorisationVersion: ATTEMPT_2_AUTHORISATION_VERSION });
    expect(d.granted).toBe(false);
    if (!d.granted) expect(d.refusal).toBe('ATTEMPT_2_AUTHORISATION_PRESENTED');
  });

  it('wrong F0I raw hash (freezeConfigRawSha256)', () => {
    const d = refused(validAuthorisation({ freezeConfigRawSha256: 'f'.repeat(64) }));
    expect(d.granted).toBe(false);
    if (!d.granted) expect(d.refusal).toBe('AUTHORISATION_MALFORMED');
  });

  it('wrong plan hash', () => {
    const d = refused(validAuthorisation({ planSha256: 'f'.repeat(64) }));
    expect(d.granted).toBe(false);
    if (!d.granted) expect(d.refusal).toBe('AUTHORISATION_MALFORMED');
  });

  it('wrong owner approval record hash: FREEZE_APPROVAL_RECORD_MISMATCH', () => {
    const d = refused(validAuthorisation({ freezeApprovalRecordRawSha256: 'e'.repeat(64) }));
    expect(d.granted).toBe(false);
    if (!d.granted) expect(d.refusal).toBe('FREEZE_APPROVAL_RECORD_MISMATCH');
  });

  it('wrong owner ratification record hash: FREEZE_APPROVAL_RATIFICATION_RECORD_MISMATCH', () => {
    const d = refused(
      validAuthorisation({ freezeApprovalRatificationRecordRawSha256: 'e'.repeat(64) }),
    );
    expect(d.granted).toBe(false);
    if (!d.granted) expect(d.refusal).toBe('FREEZE_APPROVAL_RATIFICATION_RECORD_MISMATCH');
  });

  it('wrong V4 prompt version', () => {
    const d = refused(
      validAuthorisation({
        variants: [variant({ promptVersion: 'orgunit-classifier-prompt-v3' })],
      }),
    );
    expect(d.granted).toBe(false);
    if (!d.granted) expect(d.refusal).toBe('AUTHORISATION_MALFORMED');
  });

  it('wrong V4 prompt SHA-256', () => {
    const d = refused(
      validAuthorisation({ variants: [variant({ promptSha256: 'a'.repeat(64) })] }),
    );
    expect(d.granted).toBe(false);
    if (!d.granted) expect(d.refusal).toBe('AUTHORISATION_MALFORMED');
  });

  it('V3 runtime instead of V4: AUTHORISATION_VARIANT_MISMATCH', () => {
    const d = refused(
      validAuthorisation({ variants: [variant({ gitCommit: V3B_RUNTIME_COMMIT })] }),
    );
    expect(d.granted).toBe(false);
    if (!d.granted) expect(d.refusal).toBe('AUTHORISATION_VARIANT_MISMATCH');
  });

  it('repair floor 60000 instead of 120000', () => {
    const d = refused(
      validAuthorisation({
        repairPolicy: {
          enabled: true,
          maxRoundsPerLogicalEvaluation: 1,
          minimumRemainingBudgetMs: 60_000,
        },
      }),
    );
    expect(d.granted).toBe(false);
    if (!d.granted) expect(d.refusal).toBe('AUTHORISATION_MALFORMED');
  });

  it('altered ordinal ordering', () => {
    const shuffled = [...ATTEMPT3_FROZEN_ORDINALS].reverse();
    const d = refused(validAuthorisation({ frozenLogicalBatchOrdinals: shuffled }));
    expect(d.granted).toBe(false);
    if (!d.granted) expect(d.refusal).toBe('AUTHORISATION_MALFORMED');
  });

  it.each(['PROMPT_V1_CANONICAL', 'PROMPT_V2_CANONICAL', 'PROMPT_V3_CANONICAL'] as const)(
    '%s rerun (nonzero priorVariantReruns) is refused',
    (name) => {
      const d = refused(
        validAuthorisation({
          priorVariantReruns: {
            PROMPT_V1_CANONICAL: 0,
            PROMPT_V2_CANONICAL: 0,
            PROMPT_V3_CANONICAL: 0,
            [name]: 1,
          },
        }),
      );
      expect(d.granted).toBe(false);
      if (!d.granted) expect(d.refusal).toBe('AUTHORISATION_MALFORMED');
    },
  );

  it('provider ceiling > 61', () => {
    const d = refused(validAuthorisation({ maxProviderRequests: 62 }));
    expect(d.granted).toBe(false);
    if (!d.granted) expect(d.refusal).toBe('AUTHORISATION_MALFORMED');
  });

  it('adapter ceiling > 183', () => {
    const d = refused(validAuthorisation({ maxAdapterAttempts: 184 }));
    expect(d.granted).toBe(false);
    if (!d.granted) expect(d.refusal).toBe('AUTHORISATION_MALFORMED');
  });

  it.each([
    'holdout',
    'goldLabelChanges',
    'thresholdChanges',
    'databaseWrites',
    'migrationWrites',
  ] as const)('prohibitions.%s not NONE is refused', (key) => {
    const d = refused(
      validAuthorisation({
        prohibitions: {
          holdout: 'NONE',
          goldLabelChanges: 'NONE',
          thresholdChanges: 'NONE',
          databaseWrites: 'NONE',
          migrationWrites: 'NONE',
          [key]: 'SOME_HOLDOUT_IDENTIFIER_OR_PATH',
        },
      }),
    );
    expect(d.granted).toBe(false);
    if (!d.granted) expect(d.refusal).toBe('AUTHORISATION_MALFORMED');
  });

  it('wrong attempt number (schema literal 3 violated)', () => {
    const d = refused(validAuthorisation({ attemptNo: 2 as 3 }));
    expect(d.granted).toBe(false);
    if (!d.granted) expect(d.refusal).toBe('AUTHORISATION_MALFORMED');
  });

  it('wrong attempt number at the CALLER boundary (schema-valid 3, but this invocation expected a different attempt)', () => {
    const d = evaluateAttempt3ExecutionLock(
      inputFor(validAuthorisation(), { expected: { outputRoot: OUTPUT_ROOT, attemptNo: 2 } }),
    );
    expect(d.granted).toBe(false);
    if (!d.granted) expect(d.refusal).toBe('AUTHORISATION_ATTEMPT_MISMATCH');
  });

  it('the authorised output root does not match the invocation output root', () => {
    const d = refused(validAuthorisation({ outputRoot: '/synthetic/attempt-1' }));
    expect(d.granted).toBe(false);
    if (!d.granted) expect(d.refusal).toBe('AUTHORISATION_OUTPUT_ROOT_MISMATCH');
  });

  it('expired authorisation', () => {
    const d = refused(
      validAuthorisation({
        issuedAtUtc: '2020-01-01T00:00:00Z',
        validUntilUtc: '2020-01-02T00:00:00Z',
      }),
    );
    expect(d.granted).toBe(false);
    if (!d.granted) expect(d.refusal).toBe('AUTHORISATION_EXPIRED');
  });

  it('not-yet-valid authorisation', () => {
    const d = refused(
      validAuthorisation({
        issuedAtUtc: '2099-01-01T00:00:00Z',
        validUntilUtc: '2099-01-02T00:00:00Z',
      }),
    );
    expect(d.granted).toBe(false);
    if (!d.granted) expect(d.refusal).toBe('AUTHORISATION_NOT_YET_VALID');
  });

  it('validUntilUtc not after issuedAtUtc', () => {
    const d = refused(
      validAuthorisation({
        issuedAtUtc: '2026-09-15T12:00:00Z',
        validUntilUtc: '2026-09-15T12:00:00Z',
      }),
    );
    expect(d.granted).toBe(false);
    if (!d.granted) expect(d.refusal).toBe('AUTHORISATION_MALFORMED');
  });

  it('AUTHORISATION_ALREADY_CONSUMED: a duplicate presentation of the same bytes', () => {
    const authorisation = validAuthorisation();
    const d = evaluateAttempt3ExecutionLock(
      inputFor(authorisation, { alreadyConsumed: () => true }),
    );
    expect(d.granted).toBe(false);
    if (!d.granted) expect(d.refusal).toBe('AUTHORISATION_ALREADY_CONSUMED');
  });

  it('one changed byte (a mutated statement) is refused before any grant', () => {
    const d = refused(
      validAuthorisation({
        operatorAuthorisationStatement: `${ATTEMPT3_AUTHORISATION_STATEMENT} `,
      }),
    );
    expect(d.granted).toBe(false);
    if (!d.granted) expect(d.refusal).toBe('AUTHORISATION_MALFORMED');
  });

  it('an unreadable authorisation path is refused', () => {
    const d = evaluateAttempt3ExecutionLock(
      inputFor(validAuthorisation(), {
        readFile: () => {
          throw new Error('ENOENT');
        },
      }),
    );
    expect(d.granted).toBe(false);
    if (!d.granted) expect(d.refusal).toBe('AUTHORISATION_UNREADABLE');
  });

  it('a relative authorisation path is refused', () => {
    const d = evaluateAttempt3ExecutionLock(
      inputFor(validAuthorisation(), { authorisationPath: 'relative/path.json' }),
    );
    expect(d.granted).toBe(false);
    if (!d.granted) expect(d.refusal).toBe('AUTHORISATION_PATH_NOT_ABSOLUTE');
  });

  it('a missing authorisation path is refused', () => {
    const d = evaluateAttempt3ExecutionLock(
      inputFor(validAuthorisation(), { authorisationPath: null }),
    );
    expect(d.granted).toBe(false);
    if (!d.granted) expect(d.refusal).toBe('AUTHORISATION_PATH_ABSENT');
  });

  it('malformed JSON is refused', () => {
    const d = evaluateAttempt3ExecutionLock(
      inputFor(validAuthorisation(), { readFile: () => Buffer.from('{not json', 'utf8') }),
    );
    expect(d.granted).toBe(false);
    if (!d.granted) expect(d.refusal).toBe('AUTHORISATION_MALFORMED');
  });

  it('an unknown extra key is refused (strict schema)', () => {
    const withExtra = { ...validAuthorisation(), extraField: 'not allowed' };
    const d = refused(withExtra);
    expect(d.granted).toBe(false);
    if (!d.granted) expect(d.refusal).toBe('AUTHORISATION_MALFORMED');
  });
});
