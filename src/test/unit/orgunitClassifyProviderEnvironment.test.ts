/**
 * The sanitized child environment: allowlist-built, never a parent spread.
 * Covers the child-env secret-exclusion matrix (the prohibited setup-token
 * variable now included), the dedicated persistent CLAUDE_CONFIG_DIR, and
 * Windows case-insensitive OS passthrough.
 */
import { describe, expect, it } from 'vitest';
import {
  buildChildEnvironment,
  CLASSIFIER_CHILD_ENV_FIXED,
  CLASSIFIER_CHILD_ENV_OS_PASSTHROUGH,
} from '../../orgunits/classify/provider/environment.js';

const PROFILE_DIR = 'C:\\Users\\owner\\.claude-nwf-classifier';

describe('buildChildEnvironment', () => {
  it('excludes every unrelated secret category and includes only the allowlist', () => {
    const child = buildChildEnvironment({
      parentEnv: {
        CLAUDE_CODE_OAUTH_TOKEN: 'test-oauth-secret-do-not-log',
        DATABASE_URL: 'postgres://x',
        DATABASE_URL_ADMIN: 'postgres://x',
        DATABASE_URL_CLASSIFIER: 'postgres://x',
        GITHUB_TOKEN: 'ghp_secret',
        APOLLO_KEY_LIKE_SECRET: 'apollo-secret',
        EMAIL_PROVIDER_SECRET: 'mail-secret',
        RANDOM_UNRELATED_SECRET: 'whatever',
        AWS_SECRET_ACCESS_KEY: 'aws',
        GOOGLE_APPLICATION_CREDENTIALS: 'gcp',
        AZURE_CLIENT_SECRET: 'az',
        PATH: 'C:\\bin',
        TEMP: 'C:\\t',
        HOME: 'C:\\Users\\owner',
      },
      configDir: PROFILE_DIR,
    });
    expect(Object.keys(child).sort()).toEqual(
      [
        'CLAUDE_CONFIG_DIR',
        ...Object.keys(CLASSIFIER_CHILD_ENV_FIXED),
        'PATH',
        'TEMP',
        'HOME',
      ].sort(),
    );
    const serialized = JSON.stringify(child);
    for (const leaked of [
      'test-oauth-secret-do-not-log',
      'postgres://x',
      'ghp_secret',
      'apollo-secret',
      'mail-secret',
      'whatever',
      'aws',
      'gcp',
      'az',
    ]) {
      expect(serialized).not.toContain(leaked);
    }
  });

  it('NEVER forwards the prohibited setup-token variable, even when the parent carries it (ADR 0010)', () => {
    const child = buildChildEnvironment({
      parentEnv: { CLAUDE_CODE_OAUTH_TOKEN: 'stray-token-value', PATH: 'C:\\bin' },
      configDir: PROFILE_DIR,
    });
    expect(Object.keys(child)).not.toContain('CLAUDE_CODE_OAUTH_TOKEN');
    expect(JSON.stringify(child)).not.toContain('stray-token-value');
  });

  it('sets the dedicated persistent CLAUDE_CONFIG_DIR and every fixed isolation flag', () => {
    const child = buildChildEnvironment({ parentEnv: {}, configDir: PROFILE_DIR });
    expect(child.CLAUDE_CONFIG_DIR).toBe(PROFILE_DIR);
    expect(child.CLAUDE_CODE_DISABLE_AUTO_MEMORY).toBe('1');
    expect(child.CLAUDE_CODE_SKIP_PROMPT_HISTORY).toBe('1');
    expect(child.DISABLE_TELEMETRY).toBe('1');
    expect(child.DISABLE_ERROR_REPORTING).toBe('1');
    expect(child.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBe('1');
    expect(child.ENABLE_CLAUDEAI_MCP_SERVERS).toBe('false');
  });

  it('passes OS variables through case-insensitively (Windows publishes Path, not PATH)', () => {
    const child = buildChildEnvironment({
      parentEnv: {
        Path: 'C:\\Windows\\system32',
        SystemRoot: 'C:\\Windows',
        ComSpec: 'C:\\Windows\\system32\\cmd.exe',
        UserProfile: 'C:\\Users\\owner',
      },
      configDir: PROFILE_DIR,
    });
    expect(child.PATH).toBe('C:\\Windows\\system32');
    expect(child.SYSTEMROOT).toBe('C:\\Windows');
    expect(child.COMSPEC).toBe('C:\\Windows\\system32\\cmd.exe');
    expect(child.USERPROFILE).toBe('C:\\Users\\owner');
  });

  it('omits an OS passthrough variable entirely when the parent lacks it', () => {
    const child = buildChildEnvironment({ parentEnv: {}, configDir: PROFILE_DIR });
    for (const name of CLASSIFIER_CHILD_ENV_OS_PASSTHROUGH) {
      expect(Object.keys(child)).not.toContain(name);
    }
  });

  it('throws when the profile directory is blank - the builder is not a second, softer gate', () => {
    expect(() => buildChildEnvironment({ parentEnv: {}, configDir: '  ' })).toThrow(/pre-flight/);
  });

  it('the fixed allowlist constants never contain a credential or database variable', () => {
    const names = [
      ...Object.keys(CLASSIFIER_CHILD_ENV_FIXED),
      ...CLASSIFIER_CHILD_ENV_OS_PASSTHROUGH,
    ];
    for (const name of names) {
      expect(name.includes('DATABASE_URL')).toBe(false);
      expect(name.startsWith('ANTHROPIC_')).toBe(false);
      expect(name.startsWith('CLAUDE_CODE_USE_')).toBe(false);
      expect(name.includes('OAUTH')).toBe(false);
    }
  });
});
