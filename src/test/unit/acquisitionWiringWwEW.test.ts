/**
 * WW E-W - the pure parts of the acquisition wiring (ADR 0030): the campaign
 * template and offline signer (TEST-ONLY in-memory keys), the large-HEI
 * deferral rule of the scheduler, the queue-shape checks on handler output,
 * and the geography scope rule. No database, no network.
 */
import { createHash, createPublicKey, generateKeyPairSync, randomUUID } from 'node:crypto';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { runAcquisitionCli } from '../../cli/commands/acquisition.js';
import {
  CampaignTrustSet,
  OWNER_CAMPAIGN_AUTHORITY,
  CAMPAIGN_PROTOCOL,
  VerifiedCampaignEnvelope,
  resolveStageOutcome,
  selectNextCandidate,
  type ClaimCandidate,
  type WorkItemView,
} from '../../orgunits/acquisition/index.js';
import {
  CampaignSigningRefusal,
  TEMPLATE_MAX_WINDOW_DAYS,
  campaignTemplate,
  signCampaignDraft,
} from '../../orgunits/acquisitionWiring/index.js';
import { geographyInScope } from '../../orgunits/acquisitionWiring/discover.js';

const ENV = '11111111-0000-4000-8000-000000000001';
const GRANT = '22222222-0000-4000-8000-000000000002';

function testKey(keyId: string) {
  const { privateKey } = generateKeyPairSync('ed25519');
  const der = createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
  const raw = Buffer.from(der.subarray(der.length - 32));
  const trust = CampaignTrustSet.vitestOnly([
    {
      keyId,
      fingerprint: createHash('sha256').update(raw).digest('hex'),
      publicKey: raw.toString('base64url'),
      authority: OWNER_CAMPAIGN_AUTHORITY,
      protocol: CAMPAIGN_PROTOCOL,
      scope: 'TEST_ONLY',
      state: 'ACTIVE',
      activatedAt: '2020-01-01T00:00:00.000Z',
      retiredAt: null,
      revokedAt: null,
    },
  ]);
  return { privateKey, trust };
}

describe('WW E-W campaign template and offline signer', () => {
  const now = Date.parse('2026-10-27T10:00:00.000Z');

  it('emits a conservative draft: every worker stage, a window of at most 14 days', () => {
    const draft = campaignTemplate({
      campaignKey: 'jp-pilot-v1',
      environmentId: ENV,
      geographies: ['JP'],
      searchGrantIds: [GRANT],
      nowMs: now,
    });
    expect(draft.scope.stages).toEqual([
      'DISCOVERED',
      'NOMINATED',
      'DEDUPLICATED',
      'RESEARCH_PENDING',
      'RESEARCHED',
      'ASSESSABLE',
    ]);
    expect(draft.scope.sourceKinds).toEqual(['SEARCH_GRANT', 'LINK_OUT']);
    expect(Date.parse(draft.window.endsAt) - Date.parse(draft.window.startsAt)).toBe(7 * 86400000);
    expect(draft.budgets['maxConcurrency']).toBe('1');
    expect(() =>
      campaignTemplate({
        campaignKey: 'jp-pilot-v1',
        environmentId: ENV,
        geographies: ['JP'],
        searchGrantIds: [GRANT],
        nowMs: now,
        windowDays: TEMPLATE_MAX_WINDOW_DAYS + 1,
      }),
    ).toThrow(CampaignSigningRefusal);
  });

  it('signs a draft into an envelope that verifies ONLY under a set listing the key', () => {
    const { privateKey, trust } = testKey('test-campaign-signer');
    const draft = campaignTemplate({
      campaignKey: 'jp-pilot-v1',
      environmentId: ENV,
      geographies: ['JP'],
      searchGrantIds: [GRANT],
      nowMs: now,
    });
    const signed = signCampaignDraft(draft, {
      keyId: 'test-campaign-signer',
      privateKey,
      nowMs: now,
    });
    const verified = VerifiedCampaignEnvelope.verify(Buffer.from(signed.envelope), trust);
    expect(verified.payload.scope.geographies).toEqual(['JP']);
    expect(verified.payload.issuedAt).toBe('2026-10-27T10:00:00.000Z');
    // The operational set is EMPTY: the same envelope is refused.
    expect(() =>
      VerifiedCampaignEnvelope.verify(Buffer.from(signed.envelope), CampaignTrustSet.operational()),
    ).toThrow(/KEY_UNKNOWN/);
    // A draft outside the protocol's bounds is refused before signing.
    expect(() =>
      signCampaignDraft(
        { ...draft, budgets: { ...draft.budgets, maxConcurrency: '9' } },
        { keyId: 'test-campaign-signer', privateKey, nowMs: now },
      ),
    ).toThrow(/BUDGET_INVALID/);
  });

  describe('the CLI signer (offline, encrypted key, new 0600 file)', () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'nwf-ew-sign-')));
    chmodSync(dir, 0o700);
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it('writes one signed envelope and refuses to overwrite it', async () => {
      const { privateKey, trust } = testKey('test-campaign-cli');
      const keyFile = join(dir, 'campaign.pem');
      writeFileSync(
        keyFile,
        privateKey.export({
          format: 'pem',
          type: 'pkcs8',
          cipher: 'aes-256-cbc',
          passphrase: 'pw-not-a-secret',
        }),
        { mode: 0o600 },
      );
      const draftFile = join(dir, 'draft.json');
      writeFileSync(
        draftFile,
        JSON.stringify(
          campaignTemplate({
            campaignKey: 'jp-pilot-v2',
            environmentId: ENV,
            geographies: ['JP'],
            searchGrantIds: [GRANT],
            nowMs: now,
          }),
        ),
      );
      const outFile = join(dir, 'signed.json');
      const args = [
        'campaign',
        'sign',
        '--file',
        draftFile,
        '--key-file',
        keyFile,
        '--key-id',
        'test-campaign-cli',
        '--out',
        outFile,
      ];
      const deps = {
        passphrase: () => Promise.resolve(Buffer.from('pw-not-a-secret')),
        now: () => now,
        out: () => undefined,
        err: () => undefined,
      };
      expect(await runAcquisitionCli(args, deps)).toBe(0);
      expect(statSync(outFile).mode & 0o777).toBe(0o600);
      expect(
        VerifiedCampaignEnvelope.verify(readFileSync(outFile), trust).payload.campaignKey,
      ).toBe('jp-pilot-v2');
      expect(await runAcquisitionCli(args, deps)).toBe(1);
    });
  });
});

describe('WW E-W scheduler deferral (large-HEI tagged domains)', () => {
  const c = (id: string, stage: ClaimCandidate['stage'], domain: string): ClaimCandidate => ({
    workItemId: id,
    stage,
    registrableDomain: domain,
    priority: 0,
    createdAtMs: 0,
  });

  it('serves a deferred domain only when nothing else is claimable, and never drops it', () => {
    const history = {
      lastStage: null,
      domainLastServedMs: new Map<string, number>(),
      blockedDomains: new Set<string>(),
      deferredDomains: new Set(['fict-u.ac.jp']),
    };
    // A later-stage deferred item loses to an earlier-stage undeferred one.
    expect(
      selectNextCandidate(
        [c('a', 'RESEARCH_PENDING', 'fict-u.ac.jp'), c('b', 'NOMINATED', 'assoc-fict.jp')],
        history,
      )!.workItemId,
    ).toBe('b');
    expect(
      selectNextCandidate([c('a', 'RESEARCH_PENDING', 'fict-u.ac.jp')], history)!.workItemId,
    ).toBe('a');
  });
});

describe('WW E-W queue shape on handler output', () => {
  const item: WorkItemView = {
    id: randomUUID(),
    campaignId: randomUUID(),
    stage: 'NOMINATED',
    sourceKind: 'SEARCH_GRANT',
    subjectKind: 'NOMINATION',
    subjectId: randomUUID(),
    registrableDomain: 'a-fict.nl',
    parentItemId: randomUUID(),
    priority: 100,
    idempotencyKey: 'x',
  };
  const advance = (children: unknown) => ({ kind: 'ADVANCED', next: 'DEDUPLICATED', children });

  it('refuses two children, another subject of the same kind, or another domain', () => {
    const same = {
      subjectKind: 'NOMINATION',
      subjectId: item.subjectId,
      registrableDomain: 'a-fict.nl',
    };
    expect(resolveStageOutcome(item, 1, 3, advance([same])).kind).toBe('ADVANCED');
    expect(resolveStageOutcome(item, 1, 3, advance([same, same]))).toMatchObject({
      reason: 'HANDLER_OUTPUT_INVALID',
    });
    expect(
      resolveStageOutcome(item, 1, 3, advance([{ ...same, subjectId: randomUUID() }])),
    ).toMatchObject({ reason: 'HANDLER_OUTPUT_INVALID' });
    expect(
      resolveStageOutcome(item, 1, 3, advance([{ ...same, registrableDomain: 'b-fict.nl' }])),
    ).toMatchObject({ reason: 'HANDLER_OUTPUT_INVALID' });
  });
});

describe('WW E-W geography scope', () => {
  it('admits a geography the signed scope lists, or any under WORLDWIDE; never an unknown one', () => {
    expect(geographyInScope(['JP', 'NL'], 'NL')).toBe(true);
    expect(geographyInScope(['NL'], 'JP')).toBe(false);
    expect(geographyInScope(['NL'], null)).toBe(false);
    expect(geographyInScope(['WORLDWIDE'], 'JP')).toBe(true);
  });
});
