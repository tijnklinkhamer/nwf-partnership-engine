/**
 * The dedicated-profile hygiene check (names-only, real filesystem, no
 * file-content reads) and the pure auth-status evaluator (stored
 * subscription login required; identity fields never echoed).
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  FORBIDDEN_PROFILE_ENTRIES,
  checkProfileHygiene,
} from '../../orgunits/classify/provider/profileHygiene.js';
import {
  REQUIRED_API_PROVIDER,
  REQUIRED_AUTH_METHOD,
  REQUIRED_SUBSCRIPTION_TYPE,
  evaluateAuthStatus,
} from '../../orgunits/classify/provider/authStatus.js';

const cleanups: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanups.splice(0).map((dir) => rm(dir, { recursive: true, force: true, maxRetries: 3 })),
  );
});

async function freshProfileDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'nwf-pe-test-profile-'));
  cleanups.push(dir);
  return dir;
}

describe('checkProfileHygiene', () => {
  it('refuses a missing profile directory with the provisioning remedy', async () => {
    const result = await checkProfileHygiene(join(tmpdir(), 'nwf-pe-test-does-not-exist'));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.kind).toBe('PROFILE_NOT_PROVISIONED');
    expect(result.detail).toContain('/login');
  });

  it('accepts an empty provisioned directory', async () => {
    const dir = await freshProfileDir();
    expect(await checkProfileHygiene(dir)).toEqual({ ok: true });
  });

  it('accepts Claude-owned internal auth/state entries without reading them', async () => {
    const dir = await freshProfileDir();
    await writeFile(join(dir, '.claude.json'), '{"not":"read"}', 'utf8');
    await writeFile(join(dir, '.credentials.json'), '{"never":"read"}', 'utf8');
    await mkdir(join(dir, 'projects'));
    await mkdir(join(dir, 'statsig'));
    await mkdir(join(dir, 'todos'));
    await mkdir(join(dir, 'shell-snapshots'));
    expect(await checkProfileHygiene(dir)).toEqual({ ok: true });
  });

  for (const entry of FORBIDDEN_PROFILE_ENTRIES) {
    it(`refuses a profile containing ${entry}`, async () => {
      const dir = await freshProfileDir();
      // Directory-shaped surfaces are created as directories, file-shaped as files;
      // the check matches NAMES, so either representation must refuse.
      if (entry.includes('.')) await writeFile(join(dir, entry), '', 'utf8');
      else await mkdir(join(dir, entry));
      const result = await checkProfileHygiene(dir);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('unreachable');
      expect(result.kind).toBe('PROFILE_HYGIENE_VIOLATION');
      expect(result.forbiddenEntries).toEqual([entry]);
      expect(result.detail).toContain(entry);
    });
  }

  it('matches forbidden entries case-insensitively and names every offender', async () => {
    const dir = await freshProfileDir();
    await writeFile(join(dir, 'claude.md'), '', 'utf8');
    await mkdir(join(dir, 'SKILLS'));
    const result = await checkProfileHygiene(dir);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect([...(result.forbiddenEntries ?? [])].sort()).toEqual(['SKILLS', 'claude.md']);
  });

  it('the forbidden list covers every semantic/config surface the task requires', () => {
    for (const required of [
      'CLAUDE.md',
      'settings.json',
      'settings.local.json',
      'managed-settings.json',
      '.mcp.json',
      'agents',
      'commands',
      'skills',
      'hooks',
      'rules',
      'output-styles',
    ]) {
      expect(FORBIDDEN_PROFILE_ENTRIES).toContain(required);
    }
  });
});

describe('evaluateAuthStatus', () => {
  const GOOD = {
    loggedIn: true,
    authMethod: REQUIRED_AUTH_METHOD,
    apiProvider: REQUIRED_API_PROVIDER,
    subscriptionType: REQUIRED_SUBSCRIPTION_TYPE,
  };

  function evaluate(report: unknown, exitCode = 0) {
    return evaluateAuthStatus({ exitCode, stdout: JSON.stringify(report) });
  }

  it('pins the required values: claude.ai, firstParty, max', () => {
    expect(REQUIRED_AUTH_METHOD).toBe('claude.ai');
    expect(REQUIRED_API_PROVIDER).toBe('firstParty');
    expect(REQUIRED_SUBSCRIPTION_TYPE).toBe('max');
  });

  it('accepts a logged-in claude.ai / firstParty / max report', () => {
    expect(evaluate(GOOD)).toEqual({ ok: true });
  });

  it('accepts a report with no subscriptionType field (older CLI)', () => {
    const { subscriptionType: _omitted, ...withoutSubscription } = GOOD;
    expect(evaluate(withoutSubscription)).toEqual({ ok: true });
  });

  it('refuses non-JSON output without echoing it', () => {
    const result = evaluateAuthStatus({ exitCode: 1, stdout: 'Error: secret@example.org boom' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.kind).toBe('AUTH_STATUS_UNPARSEABLE');
    expect(result.detail).not.toContain('secret@example.org');
  });

  it('refuses a non-object JSON report', () => {
    for (const bad of ['null', '"logged in"', '42']) {
      const result = evaluateAuthStatus({ exitCode: 0, stdout: bad });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('unreachable');
      expect(result.kind).toBe('AUTH_STATUS_UNPARSEABLE');
    }
  });

  it('refuses a logged-out profile with the provisioning remedy', () => {
    const result = evaluate({ ...GOOD, loggedIn: false });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.kind).toBe('NOT_LOGGED_IN');
    expect(result.detail).toContain('/login');
  });

  it('refuses the setup-token auth method (oauth_token) — the prohibited mechanism', () => {
    const result = evaluate({ ...GOOD, authMethod: 'oauth_token' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.kind).toBe('WRONG_AUTH_METHOD');
    expect(result.detail).toContain('oauth_token');
  });

  it('refuses a non-firstParty provider', () => {
    const result = evaluate({ ...GOOD, apiProvider: 'thirdPartyProxy' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.kind).toBe('WRONG_API_PROVIDER');
  });

  it('refuses a reported non-max subscription', () => {
    for (const bad of ['pro', 'team', 'enterprise']) {
      const result = evaluate({ ...GOOD, subscriptionType: bad });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('unreachable');
      expect(result.kind).toBe('WRONG_SUBSCRIPTION_TYPE');
      expect(result.detail).toContain(bad);
    }
  });

  it('refuses a present but non-string subscriptionType (fail closed)', () => {
    const result = evaluate({ ...GOOD, subscriptionType: 7 });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.kind).toBe('WRONG_SUBSCRIPTION_TYPE');
  });

  it('never echoes identity fields (email, org id, org name) in any detail', () => {
    const identityCarrying = {
      loggedIn: true,
      authMethod: 'oauth_token',
      apiProvider: REQUIRED_API_PROVIDER,
      subscriptionType: REQUIRED_SUBSCRIPTION_TYPE,
      email: 'owner-mailbox@example.org',
      orgId: 'org-identity-value',
      orgName: 'Owner Org Name',
    };
    const result = evaluate(identityCarrying);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    for (const secret of ['owner-mailbox@example.org', 'org-identity-value', 'Owner Org Name']) {
      expect(JSON.stringify(result)).not.toContain(secret);
    }
  });
});
