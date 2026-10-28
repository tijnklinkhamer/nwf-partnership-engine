/**
 * R2 - the pure parts of campaign CONTINUATION (ADR 0029 s12, migration
 * 0029): the v3 document's signed `scope.continuation`, its canonical
 * encoding, signing and verification; the template's `--continue-from`
 * drafts and refusals; the scheduler's signed-order tie-break; and the
 * `nwf-engine status` continuation section. TEST-ONLY in-memory keys; no
 * database, no network.
 */
import { createHash, createPublicKey, generateKeyPairSync, randomUUID } from 'node:crypto';
import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { runAcquisitionCli } from '../../cli/commands/acquisition.js';
import {
  CAMPAIGN_DOCUMENT_VERSION_V2,
  CAMPAIGN_DOCUMENT_VERSION_V3,
  CAMPAIGN_PROTOCOL,
  CampaignTrustSet,
  OWNER_CAMPAIGN_AUTHORITY,
  VerifiedCampaignEnvelope,
  selectNextCandidate,
  type ClaimCandidate,
} from '../../orgunits/acquisition/index.js';
import { canonicalBytes } from '../../orgunits/acquisition/canonical.js';
import { campaignPayloadBytes, parseCampaignPayload } from '../../orgunits/acquisition/document.js';
import {
  CAMPAIGN_DRAFT_VERSION_V2,
  CAMPAIGN_DRAFT_VERSION_V3,
  CampaignSigningRefusal,
  TEMPLATE_BUDGETS,
  campaignTemplate,
  parseCampaignDraft,
  signCampaignDraft,
} from '../../orgunits/acquisitionWiring/index.js';
import { buildEngineStatus, renderEngineStatus } from '../../runtime/status.js';
import { parseStatusRun } from '../../runtime/envelope.js';
import { campaignPayloadObject, testCampaignKey } from '../helpers/acquisitionCampaignFixtures.js';
import { CAMPAIGN, T0, statusRun } from '../helpers/macRuntimeFakes.js';

const ENV = '11111111-0000-4000-8000-000000000001';
const GRANT = '22222222-0000-4000-8000-000000000002';
const PRED = '33333333-0000-4000-8000-000000000003';
const N1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const N2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const N3 = 'aaaaaaaa-0000-4000-8000-000000000003';
const NOW = Date.parse('2026-10-28T10:00:00.000Z');

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

describe('R2: the v3 campaign document carries a signed, ordered continuation', () => {
  const key = testCampaignKey('test-r2-doc');
  const payload = (continuation?: { predecessorCampaignId: string; nominationIds: string[] }) =>
    JSON.parse(
      canonicalBytes(
        campaignPayloadObject(key, {
          environmentId: ENV,
          searchGrantIds: [GRANT],
          ...(continuation !== undefined ? { continuation } : {}),
        }),
      ).toString('utf8'),
    ) as Record<string, unknown>;
  const scopeOf = (p: Record<string, unknown>) => p['scope'] as Record<string, unknown>;

  it('parses a v3 document, keeps the OWNER order, and re-encodes byte for byte', () => {
    const value = payload({ predecessorCampaignId: PRED, nominationIds: [N3, N1, N2] });
    const p = parseCampaignPayload(value);
    expect(p.document).toBe(CAMPAIGN_DOCUMENT_VERSION_V3);
    expect(p.scope.continuation).toEqual({
      predecessorCampaignId: PRED,
      nominationIds: [N3, N1, N2],
    });
    expect(p.scope.linkOutMaxHops).toBe(1);
    expect(campaignPayloadBytes(p).equals(canonicalBytes(value as never))).toBe(true);
  });

  it('v1 and v2 documents are unchanged and carry no continuation', () => {
    expect(parseCampaignPayload(payload()).scope.continuation).toBeNull();
    const v2 = JSON.parse(
      canonicalBytes(
        campaignPayloadObject(key, {
          environmentId: ENV,
          searchGrantIds: [GRANT],
          linkOutMaxHops: '2',
        }),
      ).toString('utf8'),
    ) as Record<string, unknown>;
    const p = parseCampaignPayload(v2);
    expect(p.document).toBe(CAMPAIGN_DOCUMENT_VERSION_V2);
    expect(p.scope.continuation).toBeNull();
    expect(campaignPayloadBytes(p).equals(canonicalBytes(v2 as never))).toBe(true);
  });

  it('refuses a continuation outside v3, a v3 without one, and every malformed list', () => {
    const v2 = payload();
    v2['document'] = CAMPAIGN_DOCUMENT_VERSION_V2;
    scopeOf(v2)['linkOutMaxHops'] = '1';
    scopeOf(v2)['continuation'] = { predecessorCampaignId: PRED, nominationIds: [N1] };
    expect(() => parseCampaignPayload(v2)).toThrow(/SCOPE_INVALID/);

    const noCont = payload({ predecessorCampaignId: PRED, nominationIds: [N1] });
    delete scopeOf(noCont)['continuation'];
    expect(() => parseCampaignPayload(noCont)).toThrow(/SCOPE_INVALID/);

    const bad: unknown[] = [
      { predecessorCampaignId: PRED, nominationIds: [] },
      { predecessorCampaignId: PRED, nominationIds: [N1, N1] },
      { predecessorCampaignId: PRED, nominationIds: ['not-a-uuid'] },
      { predecessorCampaignId: PRED, nominationIds: [N1.toUpperCase()] },
      { predecessorCampaignId: 'x', nominationIds: [N1] },
      { predecessorCampaignId: PRED, nominationIds: [N1], extra: 'y' },
      {
        predecessorCampaignId: PRED,
        nominationIds: Array.from({ length: 201 }, () => randomUUID()),
      },
    ];
    for (const c of bad) {
      const p = payload({ predecessorCampaignId: PRED, nominationIds: [N1] });
      scopeOf(p)['continuation'] = c;
      expect(() => parseCampaignPayload(p), JSON.stringify(c).slice(0, 60)).toThrow(
        /SCOPE_INVALID/,
      );
    }
    const two00 = payload({
      predecessorCampaignId: PRED,
      nominationIds: Array.from({ length: 200 }, () => randomUUID()),
    });
    expect(parseCampaignPayload(two00).scope.continuation?.nominationIds).toHaveLength(200);
  });

  it('a v3 document must list SEARCH_GRANT (the adopted items keep that source kind)', () => {
    const p = payload({ predecessorCampaignId: PRED, nominationIds: [N1] });
    scopeOf(p)['sourceKinds'] = ['LINK_OUT'];
    scopeOf(p)['searchGrantIds'] = [];
    expect(() => parseCampaignPayload(p)).toThrow(/continuation_requires_search_grant/);
  });
});

describe('R2: the template drafts a v3 continuation and the signer signs it', () => {
  const base = {
    campaignKey: 'nl-continue-v1',
    environmentId: ENV,
    geographies: ['NL'],
    searchGrantIds: [GRANT],
    nowMs: NOW,
  };

  it('drafts v3 with the order given and signs NO search (maxSearchRuns 0)', () => {
    const draft = campaignTemplate({
      ...base,
      continuation: { predecessorCampaignId: PRED, nominationIds: [N2, N3, N1] },
    });
    expect(draft.draft).toBe(CAMPAIGN_DRAFT_VERSION_V3);
    expect(draft.scope.continuation).toEqual({
      predecessorCampaignId: PRED,
      nominationIds: [N2, N3, N1],
    });
    expect(draft.budgets).toEqual({ ...TEMPLATE_BUDGETS, maxSearchRuns: '0' });
    expect(campaignTemplate(base).draft).toBe(CAMPAIGN_DRAFT_VERSION_V2);

    const { privateKey, trust } = testKey('test-r2-signer');
    const signed = signCampaignDraft(draft, { keyId: 'test-r2-signer', privateKey, nowMs: NOW });
    const verified = VerifiedCampaignEnvelope.verify(Buffer.from(signed.envelope), trust);
    expect(verified.payload.document).toBe(CAMPAIGN_DOCUMENT_VERSION_V3);
    expect(verified.payload.scope.continuation?.nominationIds).toEqual([N2, N3, N1]);
    expect(verified.payload.budgets.maxSearchRuns).toBe(0);
  });

  it('refuses a malformed continuation or one without a search grant', () => {
    const refuse = (
      c: { predecessorCampaignId: string; nominationIds: string[] },
      grants = [GRANT],
    ) =>
      expect(() => campaignTemplate({ ...base, searchGrantIds: grants, continuation: c })).toThrow(
        CampaignSigningRefusal,
      );
    refuse({ predecessorCampaignId: PRED, nominationIds: [] });
    refuse({ predecessorCampaignId: PRED, nominationIds: [N1, N1] });
    refuse({ predecessorCampaignId: PRED, nominationIds: ['nope'] });
    refuse({ predecessorCampaignId: 'nope', nominationIds: [N1] });
    refuse({
      predecessorCampaignId: PRED,
      nominationIds: Array.from({ length: 201 }, () => randomUUID()),
    });
    refuse({ predecessorCampaignId: PRED, nominationIds: [N1] }, []);
  });

  it('a draft whose version and continuation disagree is refused', () => {
    const v3 = campaignTemplate({
      ...base,
      continuation: { predecessorCampaignId: PRED, nominationIds: [N1] },
    });
    expect(() => parseCampaignDraft({ ...v3, draft: CAMPAIGN_DRAFT_VERSION_V2 })).toThrow(
      /draft_continuation/,
    );
    const v2 = campaignTemplate(base);
    expect(() => parseCampaignDraft({ ...v2, draft: CAMPAIGN_DRAFT_VERSION_V3 })).toThrow(
      /draft_continuation/,
    );
  });
});

describe('R2: the CLI template refuses ambiguous continuation input before any read', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'nwf-r2-cont-')));
  chmodSync(dir, 0o700);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const run = async (extra: string[]) => {
    const out: string[] = [];
    const err: string[] = [];
    const code = await runAcquisitionCli(
      [
        'campaign',
        'template',
        '--campaign-key',
        'nl-continue-v1',
        '--geography',
        'NL',
        '--environment-id',
        ENV,
        '--search-grant-id',
        GRANT,
        ...extra,
      ],
      {
        now: () => NOW,
        readonlyPool: () => {
          throw new Error('no database read expected');
        },
        out: (t) => void out.push(t),
        err: (t) => void err.push(t),
      },
    );
    return { code, out: out.join(''), err: err.join('') };
  };

  it('drafts v3 from --continue-from and repeated --nomination-id, in order', async () => {
    const r = await run(['--continue-from', PRED, '--nomination-id', N3, '--nomination-id', N1]);
    expect(r.code).toBe(0);
    const draft = JSON.parse(r.out) as { draft: string; scope: { continuation: unknown } };
    expect(draft.draft).toBe(CAMPAIGN_DRAFT_VERSION_V3);
    expect(draft.scope.continuation).toEqual({
      predecessorCampaignId: PRED,
      nominationIds: [N3, N1],
    });
  });

  it('drafts v3 from --continuation-file', async () => {
    const file = join(dir, 'continuation.json');
    writeFileSync(file, JSON.stringify({ predecessorCampaignId: PRED, nominationIds: [N2] }));
    const r = await run(['--continuation-file', file]);
    expect(r.code).toBe(0);
    expect((JSON.parse(r.out) as { scope: { continuation: unknown } }).scope.continuation).toEqual({
      predecessorCampaignId: PRED,
      nominationIds: [N2],
    });
    writeFileSync(file, JSON.stringify({ predecessorCampaignId: PRED, nominationIds: [N2], x: 1 }));
    expect((await run(['--continuation-file', file])).code).toBe(1);
  });

  it('refuses ids without a predecessor, a predecessor without ids, mixtures and bad uuids', async () => {
    expect((await run(['--nomination-id', N1])).err).toMatch(/needs --continue-from/);
    expect((await run(['--continue-from', PRED])).err).toMatch(/at least one --nomination-id/);
    const file = join(dir, 'mixed.json');
    writeFileSync(file, JSON.stringify({ predecessorCampaignId: PRED, nominationIds: [N2] }));
    expect(
      (await run(['--continuation-file', file, '--continue-from', PRED, '--nomination-id', N1]))
        .err,
    ).toMatch(/cannot be combined/);
    expect((await run(['--continue-from', 'nope', '--nomination-id', N1])).code).toBe(1);
    expect((await run(['--continue-from', PRED, '--nomination-id', 'NOPE'])).code).toBe(1);
    expect(
      (await run(['--continue-from', PRED, '--nomination-id', N1, '--nomination-id', N1])).code,
    ).toBe(1);
  });
});

describe('R2: the scheduler serves adopted items in the OWNER-signed order', () => {
  const c = (
    id: string,
    domain: string,
    position: number | null,
    createdAtMs = 0,
  ): ClaimCandidate => ({
    workItemId: id,
    stage: 'NOMINATED',
    registrableDomain: domain,
    priority: 100,
    createdAtMs,
    continuationPosition: position,
  });
  const history = {
    lastStage: null,
    domainLastServedMs: new Map(),
    blockedDomains: new Set<string>(),
  };

  it('breaks a never-served domain tie by signed position, not by the domain name', () => {
    const picks: string[] = [];
    let pool = [c('i1', 'aaa.nl', 3), c('i2', 'zzz.nl', 1), c('i3', 'mmm.nl', 2)];
    while (pool.length > 0) {
      const chosen = selectNextCandidate(pool, history)!;
      picks.push(chosen.workItemId);
      pool = pool.filter((x) => x.workItemId !== chosen.workItemId);
    }
    expect(picks).toEqual(['i2', 'i3', 'i1']);
  });

  it('without positions the rule is exactly the earlier lexical one', () => {
    const chosen = selectNextCandidate(
      [c('i1', 'zzz.nl', null), c('i2', 'aaa.nl', null, 5)],
      history,
    );
    expect(chosen?.workItemId).toBe('i2');
  });

  it('least-recent service still wins over the signed position', () => {
    const chosen = selectNextCandidate([c('i1', 'aaa.nl', 1), c('i2', 'bbb.nl', 2)], {
      ...history,
      domainLastServedMs: new Map([['aaa.nl', 10]]),
    });
    expect(chosen?.workItemId).toBe('i2');
  });
});

describe('R2: nwf-engine status shows the continuation', () => {
  it('renders predecessor, listed, adopted, pending and every skip with its reason', () => {
    const continuation = {
      predecessorCampaignId: PRED,
      listed: 3,
      adopted: 1,
      pending: 0,
      skipped: [
        { nominationId: N2, position: 2, reason: 'HAS_CHILD' },
        { nominationId: N3, position: 3, reason: 'OUT_OF_SCOPE' },
      ],
    };
    const doc = buildEngineStatus({
      nowMs: T0,
      lock: { kind: 'FREE' },
      supervisorState: null,
      campaignId: CAMPAIGN,
      campaignRead: parseStatusRun(statusRun({ extra: { continuation } })),
      lastPublication: { at: null, source: 'not known on this Mac' },
    });
    expect(doc.summary.continuation).toEqual(continuation);
    expect(doc.additionalFields).not.toHaveProperty('continuation');
    expect(doc.notices.map((n) => n.code)).toContain('CONTINUATION_SKIPPED');
    const text = renderEngineStatus(doc);
    expect(text).toContain('CONTINUATION (stranded nominations of a STOPPED campaign');
    expect(text).toContain(PRED);
    expect(text).toContain('3 listed, 1 adopted, 0 to adopt at the next worker start');
    expect(text).toMatch(new RegExp(`#2 ${N2}\\s+HAS_CHILD`));
    expect(text).toMatch(new RegExp(`#3 ${N3}\\s+OUT_OF_SCOPE`));
  });

  it('a v1/v2 campaign (continuation null) shows no continuation section', () => {
    const doc = buildEngineStatus({
      nowMs: T0,
      lock: { kind: 'FREE' },
      supervisorState: null,
      campaignId: CAMPAIGN,
      campaignRead: parseStatusRun(statusRun({ extra: { continuation: null } })),
      lastPublication: { at: null, source: 'not known on this Mac' },
    });
    expect(doc.summary.continuation).toBeNull();
    expect(renderEngineStatus(doc)).not.toContain('CONTINUATION');
  });
});
