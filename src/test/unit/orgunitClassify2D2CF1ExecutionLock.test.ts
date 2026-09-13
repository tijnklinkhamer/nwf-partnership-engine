/**
 * PHASE 2B-2D2C-F1 — the DOUBLE EXECUTION LOCK. A live path requires both
 * `--execute` and an explicit, closed-schema authorisation file; missing,
 * malformed, expired, mismatched, duplicate or partially correct
 * authorisation fails closed, and no rejected path reaches a launcher.
 *
 * Tests construct temporary SYNTHETIC authorisation objects only; no real
 * authorisation file is created or committed.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  AUTHORISATION_STATEMENT,
  AUTHORISATION_VERSION,
  evaluateExecutionLock,
  ExecutionAuthorisationSchema,
  type ExecutionAuthorisation,
  type ExecutionLockInput,
} from '../harness/phase2b2d2c/authorisation.js';
import { runCli, type CliIo } from '../harness/phase2b2d2c/cli.js';
import {
  EXPECTED_F0A_FREEZE_RAW_SHA256,
  FROZEN_VARIANTS,
} from '../harness/phase2b2d2c/constants.js';
import { sha256Hex } from '../harness/phase2b2d2c/freeze.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUTPUT_ROOT = join(tmpdir(), 'nwf-pe-2d2c-f1-lock-output');
const NOW = new Date('2026-09-13T12:00:00.000Z');

function validAuthorisation(
  overrides: Partial<Record<keyof ExecutionAuthorisation, unknown>> = {},
): Record<string, unknown> {
  return {
    authorisationVersion: AUTHORISATION_VERSION,
    scope: 'DEVELOPMENT_ONLY',
    freezeConfigRawSha256: EXPECTED_F0A_FREEZE_RAW_SHA256,
    variants: FROZEN_VARIANTS.map((v) => ({
      name: v.name,
      label: v.label,
      gitCommit: v.gitCommit,
    })),
    maxLogicalEvaluations: 24,
    attemptNo: 1,
    outputRoot: OUTPUT_ROOT,
    issuedAtUtc: '2026-09-13T11:00:00.000Z',
    validUntilUtc: '2026-09-13T13:00:00.000Z',
    operatorAuthorisationStatement: AUTHORISATION_STATEMENT,
    ...overrides,
  };
}

function lock(
  file: unknown,
  options: Partial<
    Pick<ExecutionLockInput, 'executeFlag' | 'authorisationPath' | 'alreadyConsumed' | 'nowUtc'>
  > & {
    readonly expected?: ExecutionLockInput['expected'];
    readonly rawText?: string;
    readonly unreadable?: boolean;
  } = {},
) {
  const text = options.rawText ?? JSON.stringify(file);
  return evaluateExecutionLock({
    executeFlag: options.executeFlag ?? true,
    authorisationPath:
      options.authorisationPath === undefined
        ? '/authorisations/synthetic.json'
        : options.authorisationPath,
    expected: options.expected ?? { outputRoot: OUTPUT_ROOT, attemptNo: 1 },
    readFile: () => {
      if (options.unreadable) throw new Error('ENOENT');
      return Buffer.from(text, 'utf8');
    },
    sha256: sha256Hex,
    alreadyConsumed: options.alreadyConsumed ?? (() => false),
    nowUtc: options.nowUtc ?? (() => NOW),
  });
}

describe('2D2C-F1 double execution lock: the schema and the statement', () => {
  it('pins one unmistakable statement naming the scope, the count, the order and the F0A hash', () => {
    expect(AUTHORISATION_STATEMENT).toContain('DEVELOPMENT-ONLY');
    expect(AUTHORISATION_STATEMENT).toContain('AT MOST 24');
    expect(AUTHORISATION_STATEMENT).toContain('12 PROMPT_V1_CANONICAL THEN 12 PROMPT_V2_CANONICAL');
    expect(AUTHORISATION_STATEMENT).toContain(EXPECTED_F0A_FREEZE_RAW_SHA256);
    expect(AUTHORISATION_STATEMENT).toContain('NO HOLDOUT');
  });

  it('the schema is closed: a synthetic authorisation parses, and any extra key is refused', () => {
    expect(ExecutionAuthorisationSchema.safeParse(validAuthorisation()).success).toBe(true);
    expect(
      ExecutionAuthorisationSchema.safeParse({ ...validAuthorisation(), bypass: true }).success,
    ).toBe(false);
    expect(
      ExecutionAuthorisationSchema.safeParse({ ...validAuthorisation(), scope: 'HOLDOUT' }).success,
    ).toBe(false);
  });

  it('grants exactly when both halves are present and every pinned value matches', () => {
    const decision = lock(validAuthorisation());
    expect(decision.granted).toBe(true);
    if (decision.granted) {
      expect(decision.authorisation.attemptNo).toBe(1);
      expect(decision.authorisationSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(decision.authorisationSha256).toBe(
        sha256Hex(Buffer.from(JSON.stringify(validAuthorisation()), 'utf8')),
      );
    }
  });
});

describe('2D2C-F1 double execution lock: every refusal', () => {
  const refusalOf = (decision: ReturnType<typeof lock>): string =>
    decision.granted ? 'GRANTED' : decision.refusal;

  it('either half alone enables nothing', () => {
    expect(refusalOf(lock(validAuthorisation(), { executeFlag: false }))).toBe(
      'EXECUTE_FLAG_ABSENT',
    );
    expect(refusalOf(lock(validAuthorisation(), { authorisationPath: null }))).toBe(
      'AUTHORISATION_PATH_ABSENT',
    );
    expect(
      refusalOf(lock(validAuthorisation(), { executeFlag: false, authorisationPath: null })),
    ).toBe('EXECUTE_FLAG_ABSENT');
  });

  it('a relative, unreadable or malformed file is refused', () => {
    expect(refusalOf(lock(validAuthorisation(), { authorisationPath: 'relative/auth.json' }))).toBe(
      'AUTHORISATION_PATH_NOT_ABSOLUTE',
    );
    expect(refusalOf(lock(validAuthorisation(), { unreadable: true }))).toBe(
      'AUTHORISATION_UNREADABLE',
    );
    expect(refusalOf(lock(null, { rawText: '{not json' }))).toBe('AUTHORISATION_MALFORMED');
    expect(refusalOf(lock({}))).toBe('AUTHORISATION_MALFORMED');
    expect(refusalOf(lock({ ...validAuthorisation(), extra: 1 }))).toBe('AUTHORISATION_MALFORMED');
  });

  it('every pinned value is checked: freeze hash, scope, version, count, statement', () => {
    expect(
      refusalOf(
        lock(
          validAuthorisation({
            freezeConfigRawSha256:
              '422873a11d3876e4aa24b250cbc484a7f66b3100f1e3cda08d733a11c40a7164',
          }),
        ),
      ),
    ).toBe('AUTHORISATION_MALFORMED');
    expect(refusalOf(lock(validAuthorisation({ scope: 'PRODUCTION' })))).toBe(
      'AUTHORISATION_MALFORMED',
    );
    expect(refusalOf(lock(validAuthorisation({ authorisationVersion: 'v0' })))).toBe(
      'AUTHORISATION_MALFORMED',
    );
    expect(refusalOf(lock(validAuthorisation({ maxLogicalEvaluations: 25 })))).toBe(
      'AUTHORISATION_MALFORMED',
    );
    expect(refusalOf(lock(validAuthorisation({ maxLogicalEvaluations: 12 })))).toBe(
      'AUTHORISATION_MALFORMED',
    );
    expect(
      refusalOf(
        lock(validAuthorisation({ operatorAuthorisationStatement: `${AUTHORISATION_STATEMENT} ` })),
      ),
    ).toBe('AUTHORISATION_MALFORMED');
    expect(
      refusalOf(
        lock(
          validAuthorisation({
            operatorAuthorisationStatement: AUTHORISATION_STATEMENT.toLowerCase(),
          }),
        ),
      ),
    ).toBe('AUTHORISATION_MALFORMED');
  });

  it('wrong commit, wrong label, swapped names, or a missing variant are variant mismatches', () => {
    const [v1, v2] = FROZEN_VARIANTS;
    expect(
      refusalOf(
        lock(
          validAuthorisation({
            variants: [
              { name: v1.name, label: v1.label, gitCommit: v2.gitCommit },
              { name: v2.name, label: v2.label, gitCommit: v2.gitCommit },
            ],
          }),
        ),
      ),
    ).toBe('AUTHORISATION_VARIANT_MISMATCH');
    expect(
      refusalOf(
        lock(
          validAuthorisation({
            variants: [
              { name: v1.name, label: v2.label, gitCommit: v1.gitCommit },
              { name: v2.name, label: v2.label, gitCommit: v2.gitCommit },
            ],
          }),
        ),
      ),
    ).toBe('AUTHORISATION_VARIANT_MISMATCH');
    expect(
      refusalOf(
        lock(
          validAuthorisation({
            variants: [
              { name: v1.name, label: v1.label, gitCommit: v1.gitCommit },
              { name: v1.name, label: v1.label, gitCommit: v1.gitCommit },
            ],
          }),
        ),
      ),
    ).toBe('AUTHORISATION_VARIANT_MISMATCH');
    expect(
      refusalOf(
        lock(
          validAuthorisation({
            variants: [{ name: v1.name, label: v1.label, gitCommit: v1.gitCommit }],
          }),
        ),
      ),
    ).toBe('AUTHORISATION_MALFORMED');
  });

  it('wrong output root, wrong attempt number, expiry, not-yet-valid and duplicate use are refused', () => {
    expect(refusalOf(lock(validAuthorisation({ outputRoot: `${OUTPUT_ROOT}-other` })))).toBe(
      'AUTHORISATION_OUTPUT_ROOT_MISMATCH',
    );
    expect(
      refusalOf(
        lock(validAuthorisation(), { expected: { outputRoot: OUTPUT_ROOT, attemptNo: 2 } }),
      ),
    ).toBe('AUTHORISATION_ATTEMPT_MISMATCH');
    expect(refusalOf(lock(validAuthorisation({ attemptNo: 2 })))).toBe(
      'AUTHORISATION_ATTEMPT_MISMATCH',
    );
    expect(
      refusalOf(lock(validAuthorisation(), { nowUtc: () => new Date('2026-09-13T14:00:00.000Z') })),
    ).toBe('AUTHORISATION_EXPIRED');
    expect(
      refusalOf(lock(validAuthorisation(), { nowUtc: () => new Date('2026-09-13T10:00:00.000Z') })),
    ).toBe('AUTHORISATION_NOT_YET_VALID');
    expect(refusalOf(lock(validAuthorisation({ validUntilUtc: '2026-09-13T10:00:00.000Z' })))).toBe(
      'AUTHORISATION_MALFORMED',
    );
    expect(refusalOf(lock(validAuthorisation(), { alreadyConsumed: () => true }))).toBe(
      'AUTHORISATION_ALREADY_CONSUMED',
    );
  });

  it('a partially correct authorisation (one byte off in one pinned value) never grants', () => {
    const base = validAuthorisation();
    for (const key of Object.keys(base)) {
      if (key === 'variants') continue;
      const value = base[key];
      const mutated =
        typeof value === 'number'
          ? value + 1
          : typeof value === 'string'
            ? `${value.slice(0, -1)}${value.endsWith('0') ? '1' : '0'}`
            : value;
      expect(
        lock(
          validAuthorisation({ [key]: mutated } as Partial<
            Record<keyof ExecutionAuthorisation, unknown>
          >),
        ).granted,
        key,
      ).toBe(false);
    }
  });
});

describe('2D2C-F1 double execution lock: through the CLI, no rejected path reaches a launcher', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'nwf-pe-2d2c-f1-lock-'));
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  function io() {
    const err: string[] = [];
    let launches = 0;
    const cliIo: CliIo = {
      stdout: () => {},
      stderr: (t) => err.push(t),
      env: {},
      nowUtc: () => NOW,
      launcher: {
        launch: async () => {
          launches += 1;
          throw new Error('unreachable');
        },
      },
    };
    return { cliIo, err, launches: () => launches };
  }

  it('--execute with an authorisation but no roots, no output root, no attempt or no config dir is refused', async () => {
    const authPath = join(scratch, 'auth.json');
    writeFileSync(authPath, JSON.stringify(validAuthorisation({ outputRoot: scratch })));
    const { cliIo, err, launches } = io();
    expect(await runCli(['--execute', '--authorisation', authPath], cliIo)).toBe(2);
    expect(err.join('')).toContain('REFUSED: execution requires');
    expect(launches()).toBe(0);
  });

  it('with every argument present but a variant root that is not a frozen worktree, the roots are refused before the lock is read', async () => {
    const authPath = join(scratch, 'auth2.json');
    writeFileSync(authPath, JSON.stringify(validAuthorisation({ outputRoot: scratch })));
    const { cliIo, err, launches } = io();
    const code = await runCli(
      [
        '--execute',
        '--authorisation',
        authPath,
        '--v1-root',
        ROOT,
        '--v2-root',
        ROOT,
        '--output-root',
        scratch,
        '--attempt-no',
        '1',
        '--classifier-config-dir',
        join(scratch, 'profile'),
      ],
      cliIo,
    );
    expect(code).toBe(2);
    expect(err.join('')).toContain('variant root failed verification');
    expect(launches()).toBe(0);
    // Nothing was created under the would-be output root.
    expect(readFileSync(authPath, 'utf8')).toContain(AUTHORISATION_VERSION);
  });
});
