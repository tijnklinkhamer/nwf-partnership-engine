/**
 * WW E-Q - the PURE parts of the OWNER-signed acquisition campaign: the
 * canonical encoding, signature-first verification against the pinned trust
 * set, the document schema, the fair scheduler, the backoff schedule, handler
 * output validation and handler coverage. No database, no network.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { runAcquisitionCli } from '../../cli/commands/acquisition.js';
import * as campaignCanonical from '../../orgunits/acquisition/canonical.js';
import {
  CampaignProtocolError,
  CampaignTrustSet,
  OPERATIONAL_OWNER_CAMPAIGN_KEYS,
  STAGES,
  VerifiedCampaignEnvelope,
  checkHandlerCoverage,
  priorityOf,
  resolveStageOutcome,
  retryDelaySeconds,
  selectNextCandidate,
  successorOf,
  type ClaimCandidate,
  type StageHandler,
  type WorkItemView,
} from '../../orgunits/acquisition/index.js';
import { validateCampaignTrustEntries } from '../../orgunits/acquisition/trust.js';
import * as reviewCanonical from '../../orgunits/subjectReview/canonical.js';
import { REVIEW_SIGNING_PREFIX } from '../../orgunits/subjectReview/protocol.js';
import {
  campaignPayloadObject,
  campaignTrustEntry,
  canonicalBytes,
  signCampaignBytes,
  signedCampaign,
  testCampaignKey,
  testCampaignTrust,
} from '../helpers/acquisitionCampaignFixtures.js';

const ENV = '11111111-2222-4333-8444-555555555555';
const KEY = testCampaignKey();
const TRUST = testCampaignTrust(campaignTrustEntry(KEY));

function refusal(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof CampaignProtocolError) return `${error.code}:${error.detail}`;
    throw error;
  }
  return 'VERIFIED';
}

function verifyText(text: string, trust = TRUST): string {
  return refusal(() => VerifiedCampaignEnvelope.verify(Buffer.from(text, 'utf8'), trust));
}

function signObject(payload: Record<string, unknown>): string {
  return signCampaignBytes(canonicalBytes(payload as never), KEY);
}

describe('WW E-Q canonical encoding: the campaign copy agrees with the review encoder', () => {
  const vectors: unknown[] = [
    { b: 'x', a: ['1', null, true, false], c: { z: 'é', y: ' ' } },
    ['', 'quote"back\\slash', '\u0000\u001f'],
    { nested: { deeper: { deepest: ['a', { k: 'v' }] } } },
  ];
  it('encodes every vector byte-for-byte as subjectReview/canonical.ts does', () => {
    for (const v of vectors) {
      expect(campaignCanonical.canonicalJson(v as never)).toBe(
        reviewCanonical.canonicalJson(v as never),
      );
    }
  });
  it('refuses the same non-canonical inputs with the same reasons', () => {
    for (const text of ['{"b":"1","a":"2"}', '{"a":1}', '{ "a":"1"}', '{"a":"1","a":"2"}', '﻿{}']) {
      const bytes = Buffer.from(text, 'utf8');
      const reason = (fn: () => unknown) => {
        try {
          fn();
          return 'OK';
        } catch (e) {
          return (e as { reason: string }).reason;
        }
      };
      expect(reason(() => campaignCanonical.parseCanonicalBytes(bytes))).toBe(
        reason(() => reviewCanonical.parseCanonicalBytes(bytes)),
      );
    }
  });
});

describe('WW E-Q verification: signature first, pinned trust set, exact shape', () => {
  it('verifies a well-formed campaign signed by a pinned TEST_ONLY key', () => {
    const v = VerifiedCampaignEnvelope.verify(
      Buffer.from(signedCampaign(KEY, { environmentId: ENV }), 'utf8'),
      TRUST,
    );
    expect(VerifiedCampaignEnvelope.isVerified(v)).toBe(true);
    expect(VerifiedCampaignEnvelope.isVerified({ ...v })).toBe(false);
    expect(v.payload.budgets.maxConcurrency).toBe(2);
  });

  it('the OPERATIONAL trust set is empty, so every real envelope is KEY_UNKNOWN', () => {
    expect(OPERATIONAL_OWNER_CAMPAIGN_KEYS).toEqual([]);
    expect(CampaignTrustSet.operational().hasActiveKey()).toBe(false);
    expect(
      verifyText(signedCampaign(KEY, { environmentId: ENV }), CampaignTrustSet.operational()),
    ).toBe('KEY_UNKNOWN:key_id_not_trusted');
  });

  it('refuses an unknown key, a bad signature and a signature made for the review protocol', () => {
    const stranger = testCampaignKey('test-stranger');
    expect(verifyText(signedCampaign(stranger, { environmentId: ENV }))).toBe(
      'KEY_UNKNOWN:key_id_not_trusted',
    );
    const good = JSON.parse(signedCampaign(KEY, { environmentId: ENV })) as Record<string, string>;
    const other = JSON.parse(signedCampaign(KEY, { environmentId: ENV })) as Record<string, string>;
    const swapped = `${campaignCanonical.canonicalJson({ ...good, signature: other['signature']! })}\n`;
    expect(verifyText(swapped)).toBe('SIGNATURE_INVALID:signature_not_verified');
    const bytes = canonicalBytes(campaignPayloadObject(KEY, { environmentId: ENV }));
    expect(verifyText(signCampaignBytes(bytes, KEY, { prefix: REVIEW_SIGNING_PREFIX }))).toBe(
      'SIGNATURE_INVALID:signature_not_verified',
    );
    expect(
      verifyText(signCampaignBytes(bytes, KEY, { protocol: 'nwf-pe.discovery-subject-review/1' })),
    ).toBe('ENVELOPE_PROTOCOL_MISMATCH:protocol_mismatch');
  });

  it('refuses a RETIRED or REVOKED key for a new campaign', () => {
    for (const state of ['RETIRED', 'REVOKED'] as const) {
      const trust = testCampaignTrust(campaignTrustEntry(KEY, state));
      expect(verifyText(signedCampaign(KEY, { environmentId: ENV }), trust)).toBe(
        `KEY_${state}:key_${state.toLowerCase()}`,
      );
    }
  });

  it('refuses shape violations only AFTER the signature verified', () => {
    const base = () => campaignPayloadObject(KEY, { environmentId: ENV });
    const cases: [Record<string, unknown>, string][] = [
      [{ ...base(), extra: 'x' }, 'PAYLOAD_SCHEMA_INVALID:payload_fields'],
      [{ ...base(), action: 'SOMETHING_ELSE' }, 'ACTION_AUDIENCE_MISMATCH:action'],
      [
        { ...base(), scope: { ...(base()['scope'] as object), geographies: ['WORLDWIDE', 'NL'] } },
        'SCOPE_INVALID:worldwide_not_alone',
      ],
      [
        { ...base(), scope: { ...(base()['scope'] as object), stages: ['IDENTITY_REVIEW'] } },
        'SCOPE_INVALID:stages_value',
      ],
      [
        {
          ...base(),
          scope: { ...(base()['scope'] as object), stages: ['DISCOVERED', 'DISCOVERED'] },
        },
        'SCOPE_INVALID:stages_duplicate',
      ],
      [
        { ...base(), budgets: { ...(base()['budgets'] as object), maxConcurrency: '5' } },
        'BUDGET_INVALID:maxConcurrency_out_of_bounds',
      ],
      [
        { ...base(), budgets: { ...(base()['budgets'] as object), maxWorkItems: '010' } },
        'BUDGET_INVALID:maxWorkItems_not_decimal',
      ],
      [
        {
          ...base(),
          window: { startsAt: '2026-10-01T00:00:00.000Z', endsAt: '2026-11-01T00:00:00.001Z' },
        },
        'WINDOW_INVALID:window_out_of_bounds',
      ],
      [
        { ...base(), purpose: 'call +31 6 1234 5678 now' },
        'PAYLOAD_SCHEMA_INVALID:purpose_invalid',
      ],
      [{ ...base(), purpose: 'mail owner@example.org' }, 'PAYLOAD_SCHEMA_INVALID:purpose_invalid'],
    ];
    for (const [payload, expected] of cases) expect(verifyText(signObject(payload))).toBe(expected);
    // Grants and the SEARCH_GRANT source kind go together.
    const noGrant = { ...base(), scope: { ...(base()['scope'] as object), searchGrantIds: [] } };
    expect(verifyText(signObject(noGrant))).toBe('SCOPE_INVALID:search_grants_vs_source_kind');
  });

  it('refuses a payload carrying a NUMBER (not canonical), and a non-canonical envelope file', () => {
    const p = { ...campaignPayloadObject(KEY, { environmentId: ENV }) } as Record<string, unknown>;
    const text = JSON.stringify(p).replace('"maxConcurrency":"2"', '"maxConcurrency":2');
    const bytes = Buffer.from(text, 'utf8');
    expect(verifyText(signCampaignBytes(bytes, KEY))).toBe('PAYLOAD_NOT_CANONICAL:number_value');
    expect(verifyText(` ${signedCampaign(KEY, { environmentId: ENV })}`)).toBe(
      'ENVELOPE_MALFORMED:not_canonical',
    );
  });

  it('builds a TEST_ONLY set only from test- keys, and refuses private-key material', () => {
    expect(() =>
      validateCampaignTrustEntries(
        [{ ...campaignTrustEntry(KEY), scope: 'TEST_ONLY' }],
        'OPERATIONAL',
      ),
    ).toThrow(/entry_scope_mismatch/);
    expect(() =>
      validateCampaignTrustEntries(
        [{ ...campaignTrustEntry(KEY), scope: 'OPERATIONAL' }],
        'OPERATIONAL',
      ),
    ).toThrow(/key_id_scope_prefix/);
    expect(() =>
      validateCampaignTrustEntries(
        [{ ...campaignTrustEntry(KEY), publicKey: Buffer.alloc(64, 1).toString('base64url') }],
        'TEST_ONLY',
      ),
    ).toThrow(/private_key_material/);
  });
});

// Valid shapes for the remaining tests need search grants when SEARCH_GRANT is listed.
const GRANT = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('WW E-Q stage vocabulary, priority rule and backoff', () => {
  it('priority is 100 x the stage ordinal, and only the human gate and ASSESSABLE have no successor', () => {
    expect(STAGES.map(priorityOf)).toEqual([0, 100, 200, 300, 400, 500, 600]);
    expect(STAGES.map(successorOf)).toEqual([
      'NOMINATED',
      'DEDUPLICATED',
      'RESEARCH_PENDING',
      'RESEARCHED',
      'IDENTITY_REVIEW',
      null,
      null,
    ]);
  });

  it('backs off exponentially from 60 s, capped at one hour, with no jitter', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 10].map(retryDelaySeconds)).toEqual([
      60, 120, 240, 480, 960, 1920, 3600, 3600, 3600,
    ]);
    expect(retryDelaySeconds(3)).toBe(retryDelaySeconds(3));
    expect(() => retryDelaySeconds(0)).toThrow();
  });
});

describe('WW E-Q scheduler: fair, deterministic', () => {
  const at = (n: number) => 1_000_000 + n;
  const item = (
    id: string,
    stage: ClaimCandidate['stage'],
    domain: string | null,
    age = 0,
  ): ClaimCandidate => ({
    workItemId: id,
    stage,
    registrableDomain: domain,
    priority: priorityOf(stage),
    createdAtMs: at(age),
  });
  const empty = {
    lastStage: null,
    domainLastServedMs: new Map(),
    blockedDomains: new Set<string>(),
  };

  it('starts at the highest-priority stage, then rotates stages so none starves', () => {
    const c = [
      item('1', 'DISCOVERED', null),
      item('2', 'NOMINATED', 'a.nl'),
      item('3', 'RESEARCHED', 'b.nl'),
    ];
    expect(selectNextCandidate(c, empty)!.workItemId).toBe('3');
    expect(selectNextCandidate(c, { ...empty, lastStage: 'RESEARCHED' })!.workItemId).toBe('2');
    expect(selectNextCandidate(c, { ...empty, lastStage: 'NOMINATED' })!.workItemId).toBe('1');
    expect(selectNextCandidate(c, { ...empty, lastStage: 'DISCOVERED' })!.workItemId).toBe('3');
  });

  it('serves the least recently served domain, then by domain, then by age and id', () => {
    const c = [
      item('a1', 'NOMINATED', 'a.nl', 1),
      item('a2', 'NOMINATED', 'a.nl', 0),
      item('b1', 'NOMINATED', 'b.nl', 2),
      item('c1', 'NOMINATED', 'c.nl', 3),
    ];
    expect(selectNextCandidate(c, empty)!.workItemId).toBe('a2');
    const served = new Map([
      ['a.nl', 30],
      ['b.nl', 10],
    ]);
    expect(selectNextCandidate(c, { ...empty, domainLastServedMs: served })!.workItemId).toBe('c1');
    served.set('c.nl', 20);
    expect(selectNextCandidate(c, { ...empty, domainLastServedMs: served })!.workItemId).toBe('b1');
  });

  it('skips a blocked domain entirely and returns null when nothing is eligible', () => {
    const c = [item('a1', 'NOMINATED', 'a.nl'), item('b1', 'NOMINATED', 'b.nl')];
    expect(
      selectNextCandidate(c, { ...empty, blockedDomains: new Set(['a.nl']) })!.workItemId,
    ).toBe('b1');
    expect(
      selectNextCandidate(c, { ...empty, blockedDomains: new Set(['a.nl', 'b.nl']) }),
    ).toBeNull();
    expect(selectNextCandidate([], empty)).toBeNull();
  });
});

describe('WW E-Q handler port: validated output, coverage, the human gate', () => {
  const view = (
    stage: WorkItemView['stage'],
    subjectKind: WorkItemView['subjectKind'],
  ): WorkItemView => ({
    id: '00000000-0000-4000-8000-000000000001',
    campaignId: '00000000-0000-4000-8000-000000000002',
    stage,
    sourceKind: 'SEARCH_GRANT',
    subjectKind,
    subjectId: '00000000-0000-4000-8000-000000000003',
    registrableDomain: 'example.nl',
    parentItemId: null,
    priority: priorityOf(stage),
    idempotencyKey: 'x',
  });

  it('accepts only the successor stage and admissible children', () => {
    const n = view('NOMINATED', 'NOMINATION');
    expect(resolveStageOutcome(n, 1, 3, { kind: 'ADVANCED', next: 'DEDUPLICATED' })).toEqual({
      kind: 'ADVANCED',
      nextStage: 'DEDUPLICATED',
      children: [
        { subjectKind: 'NOMINATION', subjectId: n.subjectId, registrableDomain: 'example.nl' },
      ],
    });
    expect(resolveStageOutcome(n, 1, 3, { kind: 'ADVANCED', next: 'RESEARCHED' })).toEqual({
      kind: 'REFUSED_TERMINAL',
      reason: 'HANDLER_OUTPUT_INVALID',
    });
    const d = view('DISCOVERED', 'SEARCH_GRANT');
    // The default child (same subject) is not a NOMINATION, so a search task must name its children.
    expect(resolveStageOutcome(d, 1, 3, { kind: 'ADVANCED', next: 'NOMINATED' }).kind).toBe(
      'REFUSED_TERMINAL',
    );
    expect(
      resolveStageOutcome(d, 1, 3, {
        kind: 'ADVANCED',
        next: 'NOMINATED',
        children: [
          { subjectKind: 'NOMINATION', subjectId: d.subjectId, registrableDomain: 'EXAMPLE.nl' },
        ],
      }).kind,
    ).toBe('REFUSED_TERMINAL');
    const a = view('ASSESSABLE', 'DISCOVERY_SUBJECT');
    expect(resolveStageOutcome(a, 1, 3, { kind: 'ADVANCED', next: null })).toEqual({
      kind: 'ADVANCED',
      nextStage: null,
      children: [],
    });
  });

  it('turns a retry at the last attempt into FAILED_TERMINAL and refuses reserved reasons', () => {
    const n = view('NOMINATED', 'NOMINATION');
    const retry = { kind: 'RETRY', reason: 'RATE_LIMITED', retryable: true };
    expect(resolveStageOutcome(n, 2, 3, retry)).toEqual({
      kind: 'RETRY_SCHEDULED',
      reason: 'RATE_LIMITED',
    });
    expect(resolveStageOutcome(n, 3, 3, retry)).toEqual({
      kind: 'FAILED_TERMINAL',
      reason: 'ATTEMPTS_EXHAUSTED',
    });
    for (const bad of [
      { kind: 'RETRY', reason: 'LEASE_EXPIRED', retryable: true },
      { kind: 'RETRY', reason: 'RATE_LIMITED' },
      { kind: 'REFUSED', reason: 'CAMPAIGN_EMERGENCY_STOPPED' },
      { kind: 'AWAITING_HUMAN', queue: 'SOMEONE' },
      { kind: 'PASSED' },
      null,
    ]) {
      expect(resolveStageOutcome(n, 1, 3, bad)).toEqual({
        kind: 'REFUSED_TERMINAL',
        reason: 'HANDLER_OUTPUT_INVALID',
      });
    }
  });

  it('requires a handler for every listed stage and refuses one for the human gate', () => {
    const h = (stage: string): StageHandler => ({
      stage: stage as StageHandler['stage'],
      handle: () => Promise.resolve({ kind: 'REFUSED', reason: 'DUPLICATE' }),
    });
    expect(checkHandlerCoverage(['DISCOVERED', 'NOMINATED'], [h('DISCOVERED')])).toEqual([
      'NOMINATED',
    ]);
    expect(checkHandlerCoverage(['DISCOVERED'], [h('DISCOVERED')])).toEqual([]);
    expect(() => checkHandlerCoverage([], [h('IDENTITY_REVIEW')])).toThrow(/HANDLER_NOT_PERMITTED/);
    expect(() => checkHandlerCoverage([], [h('DISCOVERED'), h('DISCOVERED')])).toThrow(
      /HANDLER_DUPLICATE/,
    );
  });
});

describe('WW E-Q CLI: verify is dry and honest about the empty trust set', () => {
  it('refuses a test-signed envelope under the operational set, and verifies it under a test set', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nwf-acq-'));
    try {
      const file = join(dir, 'campaign.json');
      writeFileSync(file, signedCampaign(KEY, { environmentId: ENV, searchGrantIds: [GRANT] }));
      const out: string[] = [];
      const deps = { out: (t: string) => out.push(t), err: () => undefined };
      expect(await runAcquisitionCli(['campaign', 'verify', '--file', file, '--json'], deps)).toBe(
        1,
      );
      expect(JSON.parse(out.pop()!)).toMatchObject({ outcome: 'REFUSED', code: 'KEY_UNKNOWN' });
      expect(
        await runAcquisitionCli(['campaign', 'verify', '--file', file, '--json'], {
          ...deps,
          trust: TRUST,
        }),
      ).toBe(0);
      expect(JSON.parse(out.pop()!)).toMatchObject({ outcome: 'VERIFIED' });
      // No option names every campaign, a key, a trust set or a signature.
      expect(await runAcquisitionCli(['campaign', 'verify', '--file', file, '--all'], deps)).toBe(
        1,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
