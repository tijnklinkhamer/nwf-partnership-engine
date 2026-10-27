/**
 * WW H-ACQ - the pure parts of the acquisition hardening (ADR 0030 s13): the
 * v2 campaign document's signed link-out depth (P2-5), the review
 * expectations (P2-4), the offline signer's --out handling (P2-16) and the
 * outbox root's ownership and mode (P2-14). TEST-ONLY in-memory keys; no
 * database, no network.
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
  CAMPAIGN_DOCUMENT_VERSION,
  CAMPAIGN_DOCUMENT_VERSION_V2,
  CAMPAIGN_PROTOCOL,
  CampaignTrustSet,
  OWNER_CAMPAIGN_AUTHORITY,
  VerifiedCampaignEnvelope,
} from '../../orgunits/acquisition/index.js';
import { canonicalBytes } from '../../orgunits/acquisition/canonical.js';
import { parseCampaignPayload } from '../../orgunits/acquisition/document.js';
import {
  CAMPAIGN_DRAFT_VERSION,
  CAMPAIGN_DRAFT_VERSION_V2,
  CampaignSigningRefusal,
  ReviewBatchRefusal,
  assertOutboxRoot,
  campaignTemplate,
  parseCampaignDraft,
  parseReviewExpectations,
  signCampaignDraft,
} from '../../orgunits/acquisitionWiring/index.js';
import { campaignPayloadObject, testCampaignKey } from '../helpers/acquisitionCampaignFixtures.js';

const ENV = '11111111-0000-4000-8000-000000000001';
const GRANT = '22222222-0000-4000-8000-000000000002';
const NOW = Date.parse('2026-10-27T10:00:00.000Z');

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

const template = () =>
  campaignTemplate({
    campaignKey: 'jp-pilot-v1',
    environmentId: ENV,
    geographies: ['JP'],
    searchGrantIds: [GRANT],
    nowMs: NOW,
  });

describe('WW H-ACQ P2-5: the signed link-out depth (nwf-pe.acquisition-campaign.v2)', () => {
  const key = testCampaignKey('test-hacq-doc');
  const payload = (linkOutMaxHops?: string) =>
    JSON.parse(
      canonicalBytes(
        campaignPayloadObject(key, {
          environmentId: ENV,
          ...(linkOutMaxHops !== undefined ? { linkOutMaxHops } : {}),
        }),
      ).toString('utf8'),
    ) as Record<string, unknown>;

  it('a v1 document stays valid and means exactly ONE hop', () => {
    const p = parseCampaignPayload(payload());
    expect(p.document).toBe(CAMPAIGN_DOCUMENT_VERSION);
    expect(p.scope.linkOutMaxHops).toBe(1);
  });

  it('a v2 document carries its signed depth within 0..3', () => {
    for (const hops of ['0', '1', '3']) {
      const p = parseCampaignPayload(payload(hops));
      expect(p.document).toBe(CAMPAIGN_DOCUMENT_VERSION_V2);
      expect(p.scope.linkOutMaxHops).toBe(Number(hops));
    }
    for (const bad of ['4', '-1', '01', 'x']) {
      expect(() => parseCampaignPayload(payload(bad)), bad).toThrow(/SCOPE_INVALID/);
    }
  });

  it('a v1 document may not smuggle a depth, nor a v2 document omit one', () => {
    const v1 = payload();
    (v1['scope'] as Record<string, unknown>)['linkOutMaxHops'] = '3';
    expect(() => parseCampaignPayload(v1)).toThrow(/SCOPE_INVALID/);
    const v2 = payload('2');
    delete (v2['scope'] as Record<string, unknown>)['linkOutMaxHops'];
    expect(() => parseCampaignPayload(v2)).toThrow(/SCOPE_INVALID/);
  });

  it('the template emits a v2 draft with ONE hop, signed as a v2 document', () => {
    const draft = template();
    expect(draft.draft).toBe(CAMPAIGN_DRAFT_VERSION_V2);
    expect(draft.scope.linkOutMaxHops).toBe('1');
    const { privateKey, trust } = testKey('test-hacq-signer');
    const signed = signCampaignDraft(draft, { keyId: 'test-hacq-signer', privateKey, nowMs: NOW });
    const verified = VerifiedCampaignEnvelope.verify(Buffer.from(signed.envelope), trust);
    expect(verified.payload.document).toBe(CAMPAIGN_DOCUMENT_VERSION_V2);
    expect(verified.payload.scope.linkOutMaxHops).toBe(1);
  });

  it('a v1 draft is still signed as v1; a draft whose version and depth disagree is refused', () => {
    const v2 = template();
    const { linkOutMaxHops: _drop, ...scopeV1 } = v2.scope;
    void _drop;
    const v1 = {
      ...v2,
      draft: CAMPAIGN_DRAFT_VERSION as typeof CAMPAIGN_DRAFT_VERSION,
      scope: scopeV1,
    };
    const { privateKey } = testKey('test-hacq-signer');
    const signed = signCampaignDraft(v1, { keyId: 'test-hacq-signer', privateKey, nowMs: NOW });
    expect(signed.payload.document).toBe(CAMPAIGN_DOCUMENT_VERSION);
    expect(signed.payload.scope.linkOutMaxHops).toBe(1);
    expect(() => parseCampaignDraft({ ...v2, draft: CAMPAIGN_DRAFT_VERSION })).toThrow(
      CampaignSigningRefusal,
    );
    expect(() => parseCampaignDraft({ ...v1, draft: CAMPAIGN_DRAFT_VERSION_V2 })).toThrow(
      CampaignSigningRefusal,
    );
  });
});

describe('WW H-ACQ P2-4: review expectations', () => {
  const id = randomUUID();
  const digest = 'a'.repeat(64);

  it('parses one <subjectId>=<stateDigest> per subject', () => {
    expect([...parseReviewExpectations([`${id}=${digest}`])]).toEqual([[id, digest]]);
  });

  it('refuses a malformed, upper-case, short or repeated expectation', () => {
    for (const bad of [
      `${id}`,
      `${id}=${digest.toUpperCase()}`,
      `${id}=${'a'.repeat(63)}`,
      `not-a-uuid=${digest}`,
    ]) {
      expect(() => parseReviewExpectations([bad]), bad).toThrow(ReviewBatchRefusal);
    }
    expect(() => parseReviewExpectations([`${id}=${digest}`, `${id}=${'b'.repeat(64)}`])).toThrow(
      /EXPECTATION_INVALID/,
    );
  });
});

describe('WW H-ACQ P2-16 / P2-14: files', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'nwf-hacq-')));
  chmodSync(dir, 0o700);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('campaign sign refuses an existing --out BEFORE asking for the passphrase', async () => {
    const { privateKey, trust } = testKey('test-hacq-cli');
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
    writeFileSync(draftFile, JSON.stringify(template()));
    const outFile = join(dir, 'signed.json');
    let prompts = 0;
    const errors: string[] = [];
    const deps = {
      passphrase: () => {
        prompts += 1;
        return Promise.resolve(Buffer.from('pw-not-a-secret'));
      },
      now: () => NOW,
      out: () => undefined,
      err: (t: string) => void errors.push(t),
    };
    const args = (out: string) => [
      'campaign',
      'sign',
      '--file',
      draftFile,
      '--key-file',
      keyFile,
      '--key-id',
      'test-hacq-cli',
      '--out',
      out,
    ];
    writeFileSync(outFile, 'occupied');
    expect(await runAcquisitionCli(args(outFile), deps)).toBe(1);
    expect(await runAcquisitionCli(args('relative.json'), deps)).toBe(1);
    expect(prompts).toBe(0);
    expect(errors.join('')).not.toMatch(/About to sign/);
    expect(readFileSync(outFile, 'utf8')).toBe('occupied');

    const fresh = join(dir, 'signed-fresh.json');
    expect(await runAcquisitionCli(args(fresh), deps)).toBe(0);
    expect(prompts).toBe(1);
    expect(statSync(fresh).mode & 0o777).toBe(0o600);
    const bytes = readFileSync(fresh);
    expect(bytes.at(-1)).toBe(0x0a);
    expect(VerifiedCampaignEnvelope.verify(bytes, trust).payload.campaignKey).toBe('jp-pilot-v1');
  });

  it('the outbox root must be our own directory and is narrowed back to 0700', () => {
    const root = realpathSync(mkdtempSync(join(dir, 'outbox-')));
    chmodSync(root, 0o755);
    expect(assertOutboxRoot(root)).toBe(root);
    expect(statSync(root).mode & 0o777).toBe(0o700);
    // `/` is a directory owned by root, not by this user (never run tests as root).
    if (process.getuid?.() !== 0) expect(() => assertOutboxRoot('/')).toThrow(/outbox_not_owned/);
  });
});
