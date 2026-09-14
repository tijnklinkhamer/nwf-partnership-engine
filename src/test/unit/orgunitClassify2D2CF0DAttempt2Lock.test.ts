/**
 * PHASE 2B-2D2C-F0D/F0E — the ATTEMPT-2 double execution lock, pinned to the
 * CURRENT (F0E) freeze revision.
 *
 * Proves that nothing which satisfied the attempt-1 lock can satisfy this
 * one; that an authorisation naming the SUPERSEDED F0C freeze is refused by
 * name; that production pins the RECORDED F0E approval hash (an authorisation
 * must name it; a null pin refuses everything); and that, under a synthetic
 * approval pin injected through the test seam, every pinned value is still checked: the
 * spent attempt-1 bytes, the attempt-1 shape, the F0B hash, attempt 1,
 * either attempt-1 variant, the wrong commit, output root, attempt, window
 * and duplicate use are all refused. No file outside a scratch directory is
 * read; nothing is written outside it; no launcher exists here.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { REPAIR_MINIMUM_REMAINING_BUDGET_MS } from '../../orgunits/classify/repair.js';
import {
  AUTHORISATION_STATEMENT,
  AUTHORISATION_VERSION,
} from '../harness/phase2b2d2c/authorisation.js';
import {
  EXPECTED_F0B_FREEZE_RAW_SHA256,
  FROZEN_VARIANTS,
} from '../harness/phase2b2d2c/constants.js';
import {
  ATTEMPT2_AUTHORISATION_STATEMENT,
  ATTEMPT2_AUTHORISATION_VERSION,
  ATTEMPT2_FROZEN_ORDINALS,
  ATTEMPT2_MAX_ADAPTER_ATTEMPTS,
  ATTEMPT2_MAX_PROVIDER_REQUESTS,
  ATTEMPT_1_AUTHORISATION_VERSION,
  ATTEMPT_1_VARIANTS_NEVER_RERUN,
  Attempt2ExecutionAuthorisationSchema,
  evaluateAttempt2ExecutionLock,
  verifyAttempt2AuthorisationCandidate,
  type Attempt2ExecutionAuthorisation,
  type Attempt2ExecutionLockInput,
} from '../harness/phase2b2d2c/f0c/authorisationF0C.js';
import {
  APPROVED_F0C_FREEZE_RAW_SHA256,
  APPROVED_F0C_PLAN_SHA256,
} from '../harness/phase2b2d2c/f0c/freezeF0C.js';
import {
  F0E_APPROVAL_RECORD_RAW_SHA256,
  F0E_VARIANT,
  PROPOSED_F0E_FREEZE_RAW_SHA256,
  PROPOSED_F0E_PLAN_SHA256,
  SPENT_ATTEMPT_1_AUTHORISATION_SHA256,
  SUPERSEDED_V3_RUNTIME_COMMIT,
} from '../harness/phase2b2d2c/f0c/freezeF0E.js';
import { sha256Hex } from '../harness/phase2b2d2c/freeze.js';

const NOW = new Date('2026-09-15T12:00:00Z');
const OUTPUT_ROOT = '/synthetic/attempt-2-output';
/** A SYNTHETIC approval-record hash used through the test seam, so the tests below do not depend on the real record's bytes. */
const SYNTHETIC_APPROVAL_PIN = 'a'.repeat(64);

const scratch = mkdtempSync(join(tmpdir(), 'nwf-pe-2d2c-f0e-lock-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

type AuthorisedVariant = Attempt2ExecutionAuthorisation['variants'][number];
/** The one V3B variant as the strengthened (F0F) schema binds it: name, label, commit AND prompt identity. */
function variant(overrides: Partial<AuthorisedVariant> = {}): AuthorisedVariant {
  return {
    name: F0E_VARIANT.name,
    label: F0E_VARIANT.label,
    gitCommit: F0E_VARIANT.gitCommit,
    promptVersion: F0E_VARIANT.promptVersion,
    promptSha256: F0E_VARIANT.runtimePromptSha256,
    ...overrides,
  };
}

function validAuthorisation(
  overrides: Partial<Attempt2ExecutionAuthorisation> = {},
): Attempt2ExecutionAuthorisation {
  return {
    authorisationVersion: ATTEMPT2_AUTHORISATION_VERSION,
    scope: 'DEVELOPMENT_ONLY',
    attemptNo: 2,
    freezeConfigRawSha256: PROPOSED_F0E_FREEZE_RAW_SHA256,
    planSha256: PROPOSED_F0E_PLAN_SHA256,
    supersededFreezeRawSha256: APPROVED_F0C_FREEZE_RAW_SHA256,
    freezeApprovalRecordRawSha256: SYNTHETIC_APPROVAL_PIN,
    variants: [variant()],
    maxLogicalEvaluations: 12,
    frozenLogicalBatchOrdinals: [...ATTEMPT2_FROZEN_ORDINALS],
    attempt1VariantReruns: { PROMPT_V1_CANONICAL: 0, PROMPT_V2_CANONICAL: 0 },
    maxProviderRequests: ATTEMPT2_MAX_PROVIDER_REQUESTS,
    maxAdapterAttempts: ATTEMPT2_MAX_ADAPTER_ATTEMPTS,
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
    issuedAtUtc: '2026-09-15T11:00:00.000Z',
    validUntilUtc: '2026-09-15T13:00:00.000Z',
    operatorAuthorisationStatement: ATTEMPT2_AUTHORISATION_STATEMENT,
    ...overrides,
  };
}

let counter = 0;
function writeAuth(value: unknown): string {
  counter += 1;
  const path = join(scratch, `auth-${counter}.json`);
  writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value));
  return path;
}

function evaluate(
  path: string | null,
  overrides: Partial<Attempt2ExecutionLockInput> = {},
): ReturnType<typeof evaluateAttempt2ExecutionLock> {
  return evaluateAttempt2ExecutionLock({
    executeFlag: true,
    authorisationPath: path,
    expected: { outputRoot: OUTPUT_ROOT, attemptNo: 2 },
    readFile: (p) => readFileSync(p),
    sha256: sha256Hex,
    alreadyConsumed: () => false,
    nowUtc: () => NOW,
    // The seam: simulate the future approved state; a separate test proves production pins null.
    pinnedApprovalRecordRawSha256: SYNTHETIC_APPROVAL_PIN,
    ...overrides,
  });
}

const refusalOf = (decision: ReturnType<typeof evaluateAttempt2ExecutionLock>): string =>
  decision.granted ? 'GRANTED' : decision.refusal;

describe('2D2C-F0E attempt-2 lock: the approval pin is the gate, and the superseded F0C is refused by name', () => {
  it('production pins the RECORDED F0E approval hash: an authorisation naming that record grants, one naming any other record is refused, and a null pin (the pre-approval state) refuses everything before the schema', () => {
    expect(F0E_APPROVAL_RECORD_RAW_SHA256).toMatch(/^[0-9a-f]{64}$/);
    const real = validAuthorisation({
      freezeApprovalRecordRawSha256: F0E_APPROVAL_RECORD_RAW_SHA256!,
    });
    expect(evaluate(writeAuth(real), { pinnedApprovalRecordRawSha256: undefined }).granted).toBe(
      true,
    );
    expect(
      refusalOf(
        evaluate(writeAuth(validAuthorisation()), { pinnedApprovalRecordRawSha256: undefined }),
      ),
    ).toBe('AUTHORISATION_APPROVAL_RECORD_MISMATCH');
    const preApproval = evaluate(writeAuth(real), { pinnedApprovalRecordRawSha256: null });
    expect(refusalOf(preApproval)).toBe('REPLACEMENT_FREEZE_NOT_OWNER_APPROVED');
    if (!preApproval.granted)
      expect(preApproval.detail).toContain(
        'no authorisation can execute against an unapproved freeze',
      );
  });

  it('an authorisation naming the SUPERSEDED F0C freeze is refused by name, before the schema, approval or not', () => {
    const named = {
      ...validAuthorisation(),
      freezeConfigRawSha256: APPROVED_F0C_FREEZE_RAW_SHA256,
    };
    expect(refusalOf(evaluate(writeAuth(named)))).toBe('SUPERSEDED_F0C_FREEZE_NAMED');
    expect(
      refusalOf(evaluate(writeAuth(named), { pinnedApprovalRecordRawSha256: undefined })),
    ).toBe('SUPERSEDED_F0C_FREEZE_NAMED');
  });

  it('an authorisation naming an approval record other than the pinned one is refused', () => {
    expect(
      refusalOf(
        evaluate(writeAuth(validAuthorisation({ freezeApprovalRecordRawSha256: 'b'.repeat(64) }))),
      ),
    ).toBe('AUTHORISATION_APPROVAL_RECORD_MISMATCH');
  });
});

describe('2D2C-F0E attempt-2 lock: the schema and the statement', () => {
  it('pins one unmistakable statement naming attempt 2, the V3 variant, the F0E hash, the F0E plan, the V3B runtime, the repair policy and the 61-request ceiling — never V1/V2 rerun, never the F0B, F0C or superseded-runtime identity', () => {
    expect(ATTEMPT2_AUTHORISATION_STATEMENT).toContain('ATTEMPT 2');
    expect(ATTEMPT2_AUTHORISATION_STATEMENT).toContain(
      'AT MOST 12 LOGICAL EVALUATIONS OF PROMPT_V3_CANONICAL',
    );
    expect(ATTEMPT2_AUTHORISATION_STATEMENT).toContain(
      'NO PROMPT_V1_CANONICAL AND NO PROMPT_V2_CANONICAL RERUN',
    );
    expect(ATTEMPT2_AUTHORISATION_STATEMENT).toContain(PROPOSED_F0E_FREEZE_RAW_SHA256);
    expect(ATTEMPT2_AUTHORISATION_STATEMENT).toContain(PROPOSED_F0E_PLAN_SHA256);
    expect(ATTEMPT2_AUTHORISATION_STATEMENT).toContain(F0E_VARIANT.gitCommit);
    expect(ATTEMPT2_AUTHORISATION_STATEMENT).toContain('120000 MS USABLE-WINDOW FLOOR');
    expect(ATTEMPT2_AUTHORISATION_STATEMENT).toContain(
      'AT MOST 61 PROVIDER REQUESTS AND AT MOST 183 ADAPTER ATTEMPTS',
    );
    expect(ATTEMPT2_AUTHORISATION_STATEMENT).toContain(
      'NO HOLDOUT. NO GOLD LABEL OR THRESHOLD CHANGE. NO DATABASE OR MIGRATION WRITE.',
    );
    // F0F: the approval record and the prompt identity are named INSIDE the statement.
    expect(ATTEMPT2_AUTHORISATION_STATEMENT).toContain(
      `F0E OWNER-APPROVAL RECORD ${F0E_APPROVAL_RECORD_RAW_SHA256}`,
    );
    expect(ATTEMPT2_AUTHORISATION_STATEMENT).toContain(
      `PROMPT SHA-256 ${F0E_VARIANT.runtimePromptSha256}`,
    );
    expect(ATTEMPT2_AUTHORISATION_STATEMENT).not.toContain('NOTHING IS AUTHORISABLE');
    expect(ATTEMPT2_MAX_ADAPTER_ATTEMPTS).toBe(183);
    expect([...ATTEMPT2_FROZEN_ORDINALS]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect([...ATTEMPT_1_VARIANTS_NEVER_RERUN]).toEqual([
      'PROMPT_V1_CANONICAL',
      'PROMPT_V2_CANONICAL',
    ]);
    expect(ATTEMPT2_AUTHORISATION_STATEMENT).not.toContain(EXPECTED_F0B_FREEZE_RAW_SHA256);
    expect(ATTEMPT2_AUTHORISATION_STATEMENT).not.toContain(APPROVED_F0C_FREEZE_RAW_SHA256);
    expect(ATTEMPT2_AUTHORISATION_STATEMENT).not.toContain(APPROVED_F0C_PLAN_SHA256);
    expect(ATTEMPT2_AUTHORISATION_STATEMENT).not.toContain(SUPERSEDED_V3_RUNTIME_COMMIT);
    expect(ATTEMPT2_AUTHORISATION_STATEMENT).not.toBe(AUTHORISATION_STATEMENT);
    expect(ATTEMPT2_AUTHORISATION_VERSION).not.toBe(AUTHORISATION_VERSION);
    expect(ATTEMPT_1_AUTHORISATION_VERSION).toBe(AUTHORISATION_VERSION);
    expect(ATTEMPT2_MAX_PROVIDER_REQUESTS).toBe(61);
  });

  it('the schema is closed: a synthetic authorisation parses, and any extra key or second variant is refused', () => {
    expect(Attempt2ExecutionAuthorisationSchema.safeParse(validAuthorisation()).success).toBe(true);
    expect(
      Attempt2ExecutionAuthorisationSchema.safeParse({ ...validAuthorisation(), extra: true })
        .success,
    ).toBe(false);
    expect(
      Attempt2ExecutionAuthorisationSchema.safeParse({
        ...validAuthorisation(),
        variants: [variant(), variant()],
      }).success,
    ).toBe(false);
  });

  it('F0F: the verification-only entry reaches exactly the same decision as the lock, and a candidate that grants there has still consumed nothing', () => {
    const path = writeAuth(validAuthorisation());
    const viaLock = evaluate(path);
    const viaVerify = verifyAttempt2AuthorisationCandidate({
      authorisationPath: path,
      expected: { outputRoot: OUTPUT_ROOT, attemptNo: 2 },
      readFile: (p) => readFileSync(p),
      sha256: sha256Hex,
      alreadyConsumed: () => false,
      nowUtc: () => NOW,
      pinnedApprovalRecordRawSha256: SYNTHETIC_APPROVAL_PIN,
    });
    expect(viaVerify).toEqual(viaLock);
    expect(viaVerify.granted).toBe(true);
    // The pre-F0F (F0D/F0E) statement no longer satisfies the lock: the strengthened statement is the only one.
    const preF0F = validAuthorisation({
      operatorAuthorisationStatement: ATTEMPT2_AUTHORISATION_STATEMENT.replace(
        ' AND AT MOST 183 ADAPTER ATTEMPTS. NO HOLDOUT. NO GOLD LABEL OR THRESHOLD CHANGE. NO DATABASE OR MIGRATION WRITE.',
        '. NO HOLDOUT. NO GOLD LABEL CHANGE. NO DATABASE.',
      ) as typeof ATTEMPT2_AUTHORISATION_STATEMENT,
    });
    expect(refusalOf(evaluate(writeAuth(preF0F)))).toBe('AUTHORISATION_MALFORMED');
  });

  it('grants (under the synthetic approval pin) exactly when both halves are present and every pinned value matches', () => {
    const decision = evaluate(writeAuth(validAuthorisation()));
    expect(decision.granted).toBe(true);
    if (decision.granted) {
      expect(decision.authorisation.attemptNo).toBe(2);
      expect(decision.authorisationSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(decision.authorisationSha256).not.toBe(SPENT_ATTEMPT_1_AUTHORISATION_SHA256);
    }
  });
});

describe('2D2C-F0E attempt-2 lock: every refusal (under the synthetic approval pin)', () => {
  it('either half alone enables nothing', () => {
    expect(refusalOf(evaluate(writeAuth(validAuthorisation()), { executeFlag: false }))).toBe(
      'EXECUTE_FLAG_ABSENT',
    );
    expect(refusalOf(evaluate(null))).toBe('AUTHORISATION_PATH_ABSENT');
  });

  it('a relative, unreadable or malformed file is refused', () => {
    expect(refusalOf(evaluate('relative/auth.json'))).toBe('AUTHORISATION_PATH_NOT_ABSOLUTE');
    expect(refusalOf(evaluate(join(scratch, 'does-not-exist.json')))).toBe(
      'AUTHORISATION_UNREADABLE',
    );
    expect(refusalOf(evaluate(writeAuth('{ not json')))).toBe('AUTHORISATION_MALFORMED');
  });

  it('the SPENT attempt-1 authorisation bytes are refused by exact hash, whatever they parse to', () => {
    const decision = evaluate(writeAuth(validAuthorisation()), {
      sha256: () => SPENT_ATTEMPT_1_AUTHORISATION_SHA256,
    });
    expect(refusalOf(decision)).toBe('SPENT_ATTEMPT_1_AUTHORISATION_PRESENTED');
    if (!decision.granted) expect(decision.detail).toContain('consumed on 2026-09-13');
  });

  it('an attempt-1 authorisation (the F1 shape, valid for attempt 1) is refused by NAME, before the schema', () => {
    const attempt1 = {
      authorisationVersion: AUTHORISATION_VERSION,
      scope: 'DEVELOPMENT_ONLY',
      freezeConfigRawSha256: EXPECTED_F0B_FREEZE_RAW_SHA256,
      variants: FROZEN_VARIANTS.map((v) => ({
        name: v.name,
        label: v.label,
        gitCommit: v.gitCommit,
      })),
      maxLogicalEvaluations: 24,
      attemptNo: 1,
      outputRoot: OUTPUT_ROOT,
      issuedAtUtc: '2026-09-15T11:00:00.000Z',
      validUntilUtc: '2026-09-15T13:00:00.000Z',
      operatorAuthorisationStatement: AUTHORISATION_STATEMENT,
    };
    const decision = evaluate(writeAuth(attempt1));
    expect(refusalOf(decision)).toBe('ATTEMPT_1_AUTHORISATION_PRESENTED');
    if (!decision.granted) expect(decision.detail).toContain(ATTEMPT2_AUTHORISATION_VERSION);
  });

  it('every pinned value is checked by the closed schema: F0B hash, attempt-1 plan, superseded F0C plan, wrong superseded hash, attempt 1/3, either attempt-1 variant, wrong label, ceiling, repair policy, scope, version, statement', () => {
    const cases: readonly [string, Record<string, unknown>][] = [
      ['F0B freeze hash', { freezeConfigRawSha256: EXPECTED_F0B_FREEZE_RAW_SHA256 }],
      [
        'attempt-1 plan',
        { planSha256: '05cb6984a57a871ac6b0a0720ab2fefceb5b5843f440dbf7831abdf9bfc82f6c' },
      ],
      ['superseded F0C plan', { planSha256: APPROVED_F0C_PLAN_SHA256 }],
      ['wrong superseded hash', { supersededFreezeRawSha256: PROPOSED_F0E_FREEZE_RAW_SHA256 }],
      ['attempt 1', { attemptNo: 1 }],
      ['attempt 3', { attemptNo: 3 }],
      [
        'V1 variant',
        {
          variants: [
            {
              name: 'PROMPT_V1_CANONICAL',
              label: 'PROMPT_V1_COMPARATOR',
              gitCommit: FROZEN_VARIANTS[0].gitCommit,
            },
          ],
        },
      ],
      [
        'V2 variant',
        {
          variants: [
            {
              name: 'PROMPT_V2_CANONICAL',
              label: 'PROMPT_V2_CANDIDATE',
              gitCommit: FROZEN_VARIANTS[1].gitCommit,
            },
          ],
        },
      ],
      [
        'wrong label',
        {
          variants: [
            {
              name: F0E_VARIANT.name,
              label: 'PROMPT_V2_CANDIDATE',
              gitCommit: F0E_VARIANT.gitCommit,
            },
          ],
        },
      ],
      ['24 evaluations', { maxLogicalEvaluations: 24 }],
      ['62 requests', { maxProviderRequests: 62 }],
      ['184 adapter attempts', { maxAdapterAttempts: 184 }],
      ['182 adapter attempts', { maxAdapterAttempts: 182 }],
      [
        'prompt v2 version',
        { variants: [{ ...variant(), promptVersion: 'orgunit-classifier-prompt-v2' }] },
      ],
      [
        'prompt sha one digit off',
        {
          variants: [
            {
              ...variant(),
              promptSha256: `${F0E_VARIANT.runtimePromptSha256.slice(0, -1)}${F0E_VARIANT.runtimePromptSha256.endsWith('0') ? '1' : '0'}`,
            },
          ],
        },
      ],
      [
        'variant without prompt identity',
        {
          variants: [
            { name: F0E_VARIANT.name, label: F0E_VARIANT.label, gitCommit: F0E_VARIANT.gitCommit },
          ],
        },
      ],
      ['ordinals 1..11', { frozenLogicalBatchOrdinals: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }],
      [
        'ordinals 1..13',
        { frozenLogicalBatchOrdinals: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] },
      ],
      ['ordinals 2..13', { frozenLogicalBatchOrdinals: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] }],
      [
        'ordinals reordered',
        { frozenLogicalBatchOrdinals: [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
      ],
      [
        'ordinals duplicated',
        { frozenLogicalBatchOrdinals: [1, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
      ],
      [
        'one V1 rerun',
        { attempt1VariantReruns: { PROMPT_V1_CANONICAL: 1, PROMPT_V2_CANONICAL: 0 } },
      ],
      [
        'one V2 rerun',
        { attempt1VariantReruns: { PROMPT_V1_CANONICAL: 0, PROMPT_V2_CANONICAL: 1 } },
      ],
      ['reruns missing a variant', { attempt1VariantReruns: { PROMPT_V1_CANONICAL: 0 } }],
      [
        'holdout allowed',
        {
          prohibitions: {
            holdout: 'ALLOWED',
            goldLabelChanges: 'NONE',
            thresholdChanges: 'NONE',
            databaseWrites: 'NONE',
            migrationWrites: 'NONE',
          },
        },
      ],
      [
        'threshold change allowed',
        {
          prohibitions: {
            holdout: 'NONE',
            goldLabelChanges: 'NONE',
            thresholdChanges: 'ALLOWED',
            databaseWrites: 'NONE',
            migrationWrites: 'NONE',
          },
        },
      ],
      [
        'migration write allowed',
        {
          prohibitions: {
            holdout: 'NONE',
            goldLabelChanges: 'NONE',
            thresholdChanges: 'NONE',
            databaseWrites: 'NONE',
            migrationWrites: 'ALLOWED',
          },
        },
      ],
      [
        'prohibitions missing migration writes',
        {
          prohibitions: {
            holdout: 'NONE',
            goldLabelChanges: 'NONE',
            thresholdChanges: 'NONE',
            databaseWrites: 'NONE',
          },
        },
      ],
      [
        'repair disabled',
        {
          repairPolicy: {
            enabled: false,
            maxRoundsPerLogicalEvaluation: 1,
            minimumRemainingBudgetMs: 120_000,
          },
        },
      ],
      [
        '60000 floor',
        {
          repairPolicy: {
            enabled: true,
            maxRoundsPerLogicalEvaluation: 1,
            minimumRemainingBudgetMs: 60_000,
          },
        },
      ],
      [
        'two rounds',
        {
          repairPolicy: {
            enabled: true,
            maxRoundsPerLogicalEvaluation: 2,
            minimumRemainingBudgetMs: 120_000,
          },
        },
      ],
      ['scope', { scope: 'HOLDOUT' }],
      ['version', { authorisationVersion: 'phase2b-2d2c-f0e-execution-authorisation-v2' }],
      ['statement', { operatorAuthorisationStatement: `${ATTEMPT2_AUTHORISATION_STATEMENT} ` }],
      ['attempt-1 statement', { operatorAuthorisationStatement: AUTHORISATION_STATEMENT }],
    ];
    for (const [name, override] of cases) {
      const decision = evaluate(writeAuth({ ...validAuthorisation(), ...override }));
      expect(refusalOf(decision), name).toBe('AUTHORISATION_MALFORMED');
    }
  });

  it('the SUPERSEDED runtime commit 0c0d738 is a variant mismatch; wrong output root, wrong requested attempt, expiry, not-yet-valid and duplicate use are refused', () => {
    expect(
      refusalOf(
        evaluate(
          writeAuth(
            validAuthorisation({
              variants: [variant({ gitCommit: SUPERSEDED_V3_RUNTIME_COMMIT })],
            }),
          ),
        ),
      ),
    ).toBe('AUTHORISATION_VARIANT_MISMATCH');
    expect(
      refusalOf(evaluate(writeAuth(validAuthorisation({ outputRoot: '/synthetic/other' })))),
    ).toBe('AUTHORISATION_OUTPUT_ROOT_MISMATCH');
    expect(
      refusalOf(
        evaluate(writeAuth(validAuthorisation()), {
          expected: { outputRoot: OUTPUT_ROOT, attemptNo: 3 },
        }),
      ),
    ).toBe('AUTHORISATION_ATTEMPT_MISMATCH');
    expect(
      refusalOf(
        evaluate(writeAuth(validAuthorisation()), {
          nowUtc: () => new Date('2026-09-15T14:00:00Z'),
        }),
      ),
    ).toBe('AUTHORISATION_EXPIRED');
    expect(
      refusalOf(
        evaluate(writeAuth(validAuthorisation()), {
          nowUtc: () => new Date('2026-09-15T10:00:00Z'),
        }),
      ),
    ).toBe('AUTHORISATION_NOT_YET_VALID');
    expect(
      refusalOf(evaluate(writeAuth(validAuthorisation()), { alreadyConsumed: () => true })),
    ).toBe('AUTHORISATION_ALREADY_CONSUMED');
    expect(
      refusalOf(
        evaluate(
          writeAuth(
            validAuthorisation({
              issuedAtUtc: '2026-09-15T13:00:00.000Z',
              validUntilUtc: '2026-09-15T11:00:00.000Z',
            }),
          ),
        ),
      ),
    ).toBe('AUTHORISATION_MALFORMED');
  });

  it('a partially correct authorisation (one hex digit off in one pinned hash) never grants', () => {
    const flip = (hash: string): string => `${hash.slice(0, -1)}${hash.endsWith('0') ? '1' : '0'}`;
    for (const override of [
      { freezeConfigRawSha256: flip(PROPOSED_F0E_FREEZE_RAW_SHA256) },
      { planSha256: flip(PROPOSED_F0E_PLAN_SHA256) },
      { freezeApprovalRecordRawSha256: flip(SYNTHETIC_APPROVAL_PIN) },
      { supersededFreezeRawSha256: flip(APPROVED_F0C_FREEZE_RAW_SHA256) },
    ]) {
      expect(evaluate(writeAuth({ ...validAuthorisation(), ...override })).granted).toBe(false);
    }
    expect(
      evaluate(
        writeAuth(
          validAuthorisation({
            variants: [variant({ gitCommit: flip(F0E_VARIANT.gitCommit) })],
          }),
        ),
      ).granted,
    ).toBe(false);
  });
});
