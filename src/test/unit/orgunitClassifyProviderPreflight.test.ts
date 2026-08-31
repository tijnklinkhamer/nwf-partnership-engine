/**
 * The Max-only pre-flight: pure, environment-object-driven, fail-closed.
 * Covers the conflict-guard matrix (every canonical forbidden variable
 * individually, multiple conflicts, conflict domination), the ADR 0010
 * setup-token prohibition, dedicated-profile resolution and refusal, and
 * the model-allowlist and run-config validity gates.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PROHIBITED_SETUP_TOKEN_VARIABLE,
  FORBIDDEN_AUTH_VARIABLES,
  findConflictingAuthVariables,
} from '../../orgunits/classify/provider/authConflicts.js';
import {
  CLASSIFIER_PROFILE_DIR_BASENAME,
  CLASSIFIER_PROFILE_DIR_VARIABLE,
} from '../../orgunits/classify/provider/profile.js';
import { ORGUNIT_CLASSIFIER_ALLOWED_MODELS } from '../../orgunits/classify/provider/allowedModels.js';
import {
  MAX_CLASSIFIER_MAX_TURNS,
  runClassifierPreflight,
} from '../../orgunits/classify/provider/preflight.js';

const FAKE_TOKEN = 'test-oauth-secret-do-not-log';
const ALLOWED = ['test-model-max'];
const HOME_DIR = join(tmpdir(), 'nwf-pe-test-home');
const REPO_ROOT = join(tmpdir(), 'nwf-pe-test-repo');
const DEFAULT_PROFILE = join(HOME_DIR, CLASSIFIER_PROFILE_DIR_BASENAME);

function validEnv(): Record<string, string | undefined> {
  return { USERPROFILE: HOME_DIR, PATH: 'C:\\bin' };
}

function preflight(env: Record<string, string | undefined>, modelId = 'test-model-max') {
  return runClassifierPreflight({
    env,
    repoRoot: REPO_ROOT,
    modelId,
    runConfig: {},
    allowedModels: ALLOWED,
  });
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
    it(`refuses when ${variable} is present, even in an otherwise valid environment`, () => {
      const env = validEnv();
      env[variable] = 'anything';
      const result = preflight(env);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('unreachable');
      expect(result.kind).toBe('CONFLICTING_AUTH_VARIABLES');
      expect(result.conflictingVariables).toEqual([variable]);
      expect(result.detail).toContain(variable);
      expect(result.detail).not.toContain('anything');
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

  it('a conflict dominates the setup-token finding: the refusal is the conflict, still fail-closed', () => {
    const env = validEnv();
    env.ANTHROPIC_AUTH_TOKEN = 'x';
    env[PROHIBITED_SETUP_TOKEN_VARIABLE] = FAKE_TOKEN;
    const result = preflight(env);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.kind).toBe('CONFLICTING_AUTH_VARIABLES');
    expect(result.detail).not.toContain(FAKE_TOKEN);
  });
});

describe('pre-flight: the setup-token prohibition (ADR 0010)', () => {
  it('refuses when the prohibited setup-token variable is set, without echoing its value', () => {
    const env = validEnv();
    env[PROHIBITED_SETUP_TOKEN_VARIABLE] = FAKE_TOKEN;
    const result = preflight(env);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.kind).toBe('SETUP_TOKEN_PRESENT');
    expect(result.detail).toContain(PROHIBITED_SETUP_TOKEN_VARIABLE);
    expect(result.detail).toContain('dedicated');
    expect(result.detail).not.toContain(FAKE_TOKEN);
  });

  it('refuses even a DEFINED-but-empty setup-token variable (fail closed, no sanitisation)', () => {
    const env = validEnv();
    env[PROHIBITED_SETUP_TOKEN_VARIABLE] = '';
    const result = preflight(env);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.kind).toBe('SETUP_TOKEN_PRESENT');
  });

  it('the setup-token variable is NOT required: a token-free environment passes', () => {
    const result = preflight(validEnv());
    expect(result.ok).toBe(true);
  });
});

describe('pre-flight: dedicated profile resolution', () => {
  it('resolves the default <home>/.claude-nwf-classifier from USERPROFILE', () => {
    const result = preflight(validEnv());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.profileDir).toBe(DEFAULT_PROFILE);
  });

  it('resolves the default from HOME when USERPROFILE is absent', () => {
    const result = preflight({ HOME: HOME_DIR });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.profileDir).toBe(DEFAULT_PROFILE);
  });

  it('prefers an explicit absolute override variable', () => {
    const override = join(tmpdir(), 'nwf-pe-test-override-profile');
    const env = validEnv();
    env[CLASSIFIER_PROFILE_DIR_VARIABLE] = override;
    const result = preflight(env);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.profileDir).toBe(override);
  });

  it('refuses when no override is set and no home directory exists', () => {
    const result = preflight({ PATH: 'C:\\bin' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.kind).toBe('PROFILE_DIR_UNRESOLVED');
  });

  it('refuses a blank or relative override', () => {
    for (const bad of ['', '   ', 'relative/profile']) {
      const env = validEnv();
      env[CLASSIFIER_PROFILE_DIR_VARIABLE] = bad;
      const result = preflight(env);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('unreachable');
      expect(result.kind).toBe('PROFILE_DIR_UNRESOLVED');
    }
  });

  it('refuses the repository root, and any path inside it', () => {
    for (const bad of [REPO_ROOT, join(REPO_ROOT, '.claude-profile')]) {
      const env = validEnv();
      env[CLASSIFIER_PROFILE_DIR_VARIABLE] = bad;
      const result = preflight(env);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('unreachable');
      expect(result.kind).toBe('PROFILE_DIR_FORBIDDEN');
    }
  });

  it("refuses the user's ordinary <home>/.claude profile, case-insensitively", () => {
    for (const bad of [join(HOME_DIR, '.claude'), join(HOME_DIR, '.CLAUDE')]) {
      const env = validEnv();
      env[CLASSIFIER_PROFILE_DIR_VARIABLE] = bad;
      const result = preflight(env);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('unreachable');
      expect(result.kind).toBe('PROFILE_DIR_FORBIDDEN');
    }
  });

  it('refuses the home directory itself', () => {
    const env = validEnv();
    env[CLASSIFIER_PROFILE_DIR_VARIABLE] = HOME_DIR;
    const result = preflight(env);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.kind).toBe('PROFILE_DIR_FORBIDDEN');
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
      repoRoot: REPO_ROOT,
      modelId: 'test-model-max',
      runConfig: {},
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.kind).toBe('MODEL_NOT_ALLOWED');
    // And a genuine member passes the same default gate.
    const member = ORGUNIT_CLASSIFIER_ALLOWED_MODELS[0]!;
    const passed = runClassifierPreflight({
      env: validEnv(),
      repoRoot: REPO_ROOT,
      modelId: member,
      runConfig: {},
    });
    expect(passed.ok).toBe(true);
  });

  it('refuses an out-of-bounds or non-integer maxTurns', () => {
    for (const bad of [0, -1, 2.5, MAX_CLASSIFIER_MAX_TURNS + 1]) {
      const result = runClassifierPreflight({
        env: validEnv(),
        repoRoot: REPO_ROOT,
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
    const result = runClassifierPreflight({
      env: validEnv(),
      repoRoot: REPO_ROOT,
      modelId: 'test-model-max',
      runConfig: { maxTurns: 3 },
      allowedModels: ALLOWED,
    });
    expect(result.ok).toBe(true);
  });
});
