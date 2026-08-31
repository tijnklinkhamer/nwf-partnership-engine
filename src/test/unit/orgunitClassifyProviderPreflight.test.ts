/**
 * The Max-only pre-flight: pure, environment-object-driven, fail-closed.
 * Covers the spec's conflict-guard matrix: every canonical forbidden
 * variable individually, multiple conflicts, token+conflict, no-token,
 * and the valid case — plus model-allowlist and run-config validity.
 */
import { describe, expect, it } from 'vitest';
import {
  CLAUDE_MAX_OAUTH_TOKEN_VARIABLE,
  FORBIDDEN_AUTH_VARIABLES,
  findConflictingAuthVariables,
} from '../../orgunits/classify/provider/authConflicts.js';
import { ORGUNIT_CLASSIFIER_ALLOWED_MODELS } from '../../orgunits/classify/provider/allowedModels.js';
import {
  MAX_CLASSIFIER_MAX_TURNS,
  runClassifierPreflight,
} from '../../orgunits/classify/provider/preflight.js';

const FAKE_TOKEN = 'test-oauth-secret-do-not-log';
const ALLOWED = ['test-model-max'];

function validEnv(): Record<string, string | undefined> {
  return { [CLAUDE_MAX_OAUTH_TOKEN_VARIABLE]: FAKE_TOKEN, PATH: 'C:\\bin' };
}

function preflight(env: Record<string, string | undefined>, modelId = 'test-model-max') {
  return runClassifierPreflight({ env, modelId, runConfig: {}, allowedModels: ALLOWED });
}

describe('the canonical conflicting-auth list', () => {
  it('is exactly the 14 names the runtime design approved, in its order', () => {
    expect(FORBIDDEN_AUTH_VARIABLES).toEqual([
      'CLAUDE_CODE_USE_BEDROCK',
      'CLAUDE_CODE_USE_VERTEX',
      'CLAUDE_CODE_USE_FOUNDRY',
      'ANTHROPIC_AUTH_TOKEN',
      'ANTHROPIC_API_KEY',
      'ANTHROPIC_PROFILE',
      'ANTHROPIC_FEDERATION_RULE_ID',
      'ANTHROPIC_ORGANIZATION_ID',
      'ANTHROPIC_BASE_URL',
      'ANTHROPIC_BEDROCK_BASE_URL',
      'ANTHROPIC_VERTEX_BASE_URL',
      'ANTHROPIC_FOUNDRY_BASE_URL',
      'ANTHROPIC_FOUNDRY_API_KEY',
      'ANTHROPIC_FOUNDRY_AUTH_TOKEN',
    ]);
  });

  it('findConflictingAuthVariables reports names only, never values', () => {
    const found = findConflictingAuthVariables({
      ANTHROPIC_API_KEY: 'sk-ant-super-secret-value',
      CLAUDE_CODE_USE_BEDROCK: '1',
    });
    expect(found).toEqual(['CLAUDE_CODE_USE_BEDROCK', 'ANTHROPIC_API_KEY']);
    expect(JSON.stringify(found)).not.toContain('sk-ant-super-secret-value');
  });

  it('treats a DEFINED-but-empty forbidden variable as present (fail closed)', () => {
    expect(findConflictingAuthVariables({ ANTHROPIC_PROFILE: '' })).toEqual(['ANTHROPIC_PROFILE']);
  });
});

describe('pre-flight: conflict guard matrix', () => {
  for (const variable of FORBIDDEN_AUTH_VARIABLES) {
    it(`refuses when ${variable} is present, even with a valid token`, () => {
      const env = validEnv();
      env[variable] = 'anything';
      const result = preflight(env);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('unreachable');
      expect(result.kind).toBe('CONFLICTING_AUTH_VARIABLES');
      expect(result.conflictingVariables).toEqual([variable]);
      expect(result.detail).toContain(variable);
      expect(result.detail).not.toContain('anything');
      expect(result.detail).not.toContain(FAKE_TOKEN);
    });
  }

  it('refuses multiple simultaneous conflicts and names them all', () => {
    const env = validEnv();
    env.ANTHROPIC_API_KEY = 'k';
    env.CLAUDE_CODE_USE_VERTEX = '1';
    env.ANTHROPIC_BASE_URL = 'https://proxy.example';
    const result = preflight(env);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.conflictingVariables).toEqual([
      'CLAUDE_CODE_USE_VERTEX',
      'ANTHROPIC_API_KEY',
      'ANTHROPIC_BASE_URL',
    ]);
  });

  it('a conflict dominates a missing token: the refusal is the conflict, still fail-closed', () => {
    const result = preflight({ ANTHROPIC_AUTH_TOKEN: 'x' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.kind).toBe('CONFLICTING_AUTH_VARIABLES');
  });

  it('refuses when no token and no conflicts exist (MISSING_OAUTH_TOKEN)', () => {
    const result = preflight({ PATH: 'C:\\bin' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.kind).toBe('MISSING_OAUTH_TOKEN');
  });

  it('refuses an empty token', () => {
    const result = preflight({ [CLAUDE_MAX_OAUTH_TOKEN_VARIABLE]: '' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.kind).toBe('MISSING_OAUTH_TOKEN');
  });

  it('refuses a whitespace-only or whitespace-carrying token, without echoing it', () => {
    for (const bad of ['   ', 'abc def', '\ttok\n']) {
      const result = preflight({ [CLAUDE_MAX_OAUTH_TOKEN_VARIABLE]: bad });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('unreachable');
      expect(result.kind).toBe('MALFORMED_OAUTH_TOKEN');
      expect(result.detail).not.toContain(bad);
    }
  });

  it('passes with a valid fake token and no conflicts', () => {
    expect(preflight(validEnv())).toEqual({ ok: true });
  });
});

describe('pre-flight: model allowlist and run config', () => {
  it('refuses a model id outside the closed allowlist', () => {
    const result = preflight(validEnv(), 'some-arbitrary-model');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.kind).toBe('MODEL_NOT_ALLOWED');
  });

  it('defaults to the code-owned closed allowlist when none is injected', () => {
    const result = runClassifierPreflight({
      env: validEnv(),
      modelId: 'test-model-max',
      runConfig: {},
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.kind).toBe('MODEL_NOT_ALLOWED');
    // And a genuine member passes the same default gate.
    const member = ORGUNIT_CLASSIFIER_ALLOWED_MODELS[0]!;
    expect(runClassifierPreflight({ env: validEnv(), modelId: member, runConfig: {} })).toEqual({
      ok: true,
    });
  });

  it('refuses an out-of-bounds or non-integer maxTurns', () => {
    for (const bad of [0, -1, 2.5, MAX_CLASSIFIER_MAX_TURNS + 1]) {
      const result = runClassifierPreflight({
        env: validEnv(),
        modelId: 'test-model-max',
        runConfig: { maxTurns: bad },
        allowedModels: ALLOWED,
      });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('unreachable');
      expect(result.kind).toBe('INVALID_RUN_CONFIG');
    }
  });

  it('accepts an in-bounds maxTurns', () => {
    expect(
      runClassifierPreflight({
        env: validEnv(),
        modelId: 'test-model-max',
        runConfig: { maxTurns: 3 },
        allowedModels: ALLOWED,
      }),
    ).toEqual({ ok: true });
  });
});
