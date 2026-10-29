/**
 * R2-P3 - the pure processing-allocation rule of a v3 continuation campaign
 * (vocabulary.ts): what a lineage still needs, what adopting one commits the
 * campaign to, whether a request fits after every adopted lineage's
 * allocation, how many lineages a campaign's signed budgets carry (the
 * OWNER's exact R2-P3 numbers: 16 listed, 8 research roots, 600 gateway
 * requests, 400 work items), and how `nwf-engine status` renders a
 * NO_PROCESSING_ALLOCATION skip. No database, no network.
 */
import { describe, expect, it } from 'vitest';

import {
  CONTINUATION_SKIPS,
  RESEARCH_GATEWAY_RESERVATION,
  WORKER_STAGES,
  adoptionNeed,
  allocationShortfall,
  continuationCapacity,
  lineageNeed,
  type AllocationLedger,
  type LineageNeed,
} from '../../orgunits/acquisition/index.js';
import { TEMPLATE_BUDGETS } from '../../orgunits/acquisitionWiring/index.js';
import { buildEngineStatus, renderEngineStatus } from '../../runtime/status.js';
import { parseStatusRun } from '../../runtime/envelope.js';
import { CAMPAIGN, T0, statusRun } from '../helpers/macRuntimeFakes.js';

const ALL = [...WORKER_STAGES];
const need = (workItems: number, research: boolean): LineageNeed => ({
  workItems,
  researchRoots: research ? 1 : 0,
  gatewayRequests: research ? RESEARCH_GATEWAY_RESERVATION : 0,
});

describe('R2-P3: what a lineage still needs, stage by stage', () => {
  it('a fresh adoption under every worker stage: 6 work items, 1 root, 60 gateway requests', () => {
    expect(adoptionNeed(ALL)).toEqual(need(6, true));
  });

  it.each([
    ['NOMINATED', 'PENDING', need(5, true)],
    ['NOMINATED', 'CLAIMED', need(5, true)],
    ['DEDUPLICATED', 'RETRY_SCHEDULED', need(4, true)],
    ['RESEARCH_PENDING', 'PENDING', need(3, true)],
    // A live research claim's reservation is already counted as spend.
    ['RESEARCH_PENDING', 'CLAIMED', need(3, false)],
    // A lapsed lease or a retry reserves in full again.
    ['RESEARCH_PENDING', 'LEASE_EXPIRED', need(3, true)],
    ['RESEARCH_PENDING', 'RETRY_SCHEDULED', need(3, true)],
    ['RESEARCHED', 'PENDING', need(2, false)],
    ['IDENTITY_REVIEW', 'PENDING', need(1, false)],
    // Parked for the OWNER: one release to ASSESSABLE is still ahead.
    ['IDENTITY_REVIEW', 'AWAITING_HUMAN', need(1, false)],
    ['ASSESSABLE', 'PENDING', need(0, false)],
    ['ASSESSABLE', 'ADVANCED', need(0, false)],
    ['NOMINATED', 'REFUSED_TERMINAL', need(0, false)],
    ['RESEARCH_PENDING', 'FAILED_TERMINAL', need(0, false)],
    // ADVANCED without a child (a refused child) or parked elsewhere: nothing more.
    ['DEDUPLICATED', 'ADVANCED', need(0, false)],
    ['NOMINATED', 'AWAITING_HUMAN', need(0, false)],
  ] as const)('%s / %s', (stage, state, expected) => {
    expect(lineageNeed({ stage, state }, ALL)).toEqual(expected);
  });

  it('counts only the stages the campaign signs: a lineage stops at the first unsigned one', () => {
    const toResearchPending = ['NOMINATED', 'DEDUPLICATED'];
    expect(adoptionNeed(toResearchPending)).toEqual(need(3, false));
    expect(lineageNeed({ stage: 'RESEARCH_PENDING', state: 'PENDING' }, toResearchPending)).toEqual(
      need(0, false),
    );
    expect(adoptionNeed(['NOMINATED'])).toEqual(need(2, false));
    expect(adoptionNeed(['DISCOVERED'])).toEqual(need(1, false));
  });
});

describe('R2-P3: a request fits only after every adopted lineage allocation', () => {
  const ledger = (over: Partial<AllocationLedger> = {}): AllocationLedger => ({
    limits: { workItems: 20, researchRoots: 2, gatewayRequests: 150, itemsPerRegistrableDomain: 6 },
    used: { workItems: 0, researchRoots: 0, gatewayRequests: 0 },
    domainItems: new Map(),
    reserved: [],
    ...over,
  });

  it('fits on an empty campaign, and is short of the root budget behind two allocations', () => {
    expect(allocationShortfall(ledger(), { domain: 'a.jp', need: need(6, true) })).toBeNull();
    const two = ledger({
      reserved: [
        { domain: 'a.jp', need: need(6, true) },
        { domain: 'b.jp', need: need(6, true) },
      ],
    });
    expect(allocationShortfall(two, { domain: 'c.jp', need: need(6, true) })).toBe(
      'maxResearchRoots',
    );
  });

  it('counts DERIVED spend (live reservations included) before the allocations', () => {
    expect(
      allocationShortfall(
        ledger({ used: { workItems: 3, researchRoots: 1, gatewayRequests: 60 } }),
        { domain: 'c.jp', need: need(6, true) },
      ),
    ).toBeNull();
    expect(
      allocationShortfall(
        ledger({
          used: { workItems: 3, researchRoots: 1, gatewayRequests: 100 },
          reserved: [{ domain: 'a.jp', need: need(0, false) }],
        }),
        { domain: 'c.jp', need: need(6, true) },
      ),
    ).toBe('maxGatewayRequests');
  });

  it('is short of work items, and of the domain cap shared with an adopted lineage', () => {
    expect(
      allocationShortfall(
        ledger({ used: { workItems: 15, researchRoots: 0, gatewayRequests: 0 } }),
        {
          domain: 'a.jp',
          need: need(6, true),
        },
      ),
    ).toBe('maxWorkItems');
    expect(
      allocationShortfall(
        ledger({
          domainItems: new Map([['a.jp', 2]]),
          reserved: [{ domain: 'a.jp', need: need(3, false) }],
          limits: {
            workItems: 20,
            researchRoots: 2,
            gatewayRequests: 150,
            itemsPerRegistrableDomain: 10,
          },
        }),
        { domain: 'a.jp', need: need(6, true) },
      ),
    ).toBe('maxItemsPerRegistrableDomain');
  });

  it('checks only what the request needs: a research claim is not refused by a full domain', () => {
    const full = ledger({
      used: { workItems: 20, researchRoots: 0, gatewayRequests: 0 },
      domainItems: new Map([['a.jp', 6]]),
    });
    expect(allocationShortfall(full, { domain: 'a.jp', need: need(0, true) })).toBeNull();
    expect(
      allocationShortfall(full, {
        domain: 'a.jp',
        need: { workItems: 1, researchRoots: 0, gatewayRequests: 0 },
      }),
    ).toBe('maxWorkItems');
  });
});

describe("R2-P3: the OWNER's exact numbers - 16 listed, 8 roots, 600 gateway requests, 400 work items", () => {
  const budgets = {
    maxWorkItems: 400,
    maxResearchRoots: 8,
    maxGatewayRequests: 600,
    maxItemsPerRegistrableDomain: Number(TEMPLATE_BUDGETS['maxItemsPerRegistrableDomain']),
  };

  it('carries exactly 8 lineages (the research roots bind: 8 x 1 <= 8, 8 x 60 <= 600, 8 x 6 <= 400)', () => {
    expect(budgets.maxItemsPerRegistrableDomain).toBe(12);
    expect(continuationCapacity(budgets, ALL, 16)).toBe(8);
    // Without the root bound, 600 gateway requests would carry 10; 400 items 66.
    expect(continuationCapacity({ ...budgets, maxResearchRoots: 500 }, ALL, 16)).toBe(10);
    expect(
      continuationCapacity(
        { ...budgets, maxResearchRoots: 500, maxGatewayRequests: 30000 },
        ALL,
        100,
      ),
    ).toBe(66);
    // A per-domain cap below one lineage's six items carries none at all.
    expect(continuationCapacity({ ...budgets, maxItemsPerRegistrableDomain: 5 }, ALL, 16)).toBe(0);
  });

  it('in signed order: positions 1..8 fit one after another, position 9 is the first without an allocation', () => {
    const adoption = adoptionNeed(ALL);
    const reserved: { domain: string; need: LineageNeed }[] = [];
    const decisions: string[] = [];
    for (let position = 1; position <= 16; position += 1) {
      const domain = `listed-${position}-fict.jp`;
      const short = allocationShortfall(
        {
          limits: {
            workItems: 400,
            researchRoots: 8,
            gatewayRequests: 600,
            itemsPerRegistrableDomain: 12,
          },
          used: { workItems: 0, researchRoots: 0, gatewayRequests: 0 },
          domainItems: new Map(),
          reserved,
        },
        { domain, need: adoption },
      );
      if (short === null) reserved.push({ domain, need: adoption });
      decisions.push(short ?? 'ADOPT');
    }
    expect(decisions).toEqual([...Array(8).fill('ADOPT'), ...Array(8).fill('maxResearchRoots')]);
  });
});

describe('R2-P3: NO_PROCESSING_ALLOCATION is a named skip, rendered with an explanation', () => {
  it('is in the closed vocabulary', () => {
    expect(CONTINUATION_SKIPS).toContain('NO_PROCESSING_ALLOCATION');
  });

  it('nwf-engine status shows it per nomination and explains that it is recoverable', () => {
    const N = (i: number) => `aaaaaaaa-0000-4000-8000-00000000000${i}`;
    const continuation = {
      predecessorCampaignId: '33333333-0000-4000-8000-000000000003',
      listed: 4,
      adopted: 2,
      pending: 0,
      skipped: [
        { nominationId: N(3), position: 3, reason: 'NO_PROCESSING_ALLOCATION' },
        { nominationId: N(4), position: 4, reason: 'NO_PROCESSING_ALLOCATION' },
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
    const notice = doc.notices.find((n) => n.code === 'CONTINUATION_NO_PROCESSING_ALLOCATION');
    expect(notice?.message).toMatch(/^2 listed nomination\(s\) have no processing allocation/);
    expect(notice?.message).toContain('stay untouched in the STOPPED predecessor');
    const text = renderEngineStatus(doc);
    expect(text).toContain('4 listed, 2 adopted, 0 to adopt as the worker reaches them');
    expect(text).toMatch(new RegExp(`#3 ${N(3)}\\s+NO_PROCESSING_ALLOCATION`));
    expect(text).toMatch(new RegExp(`#4 ${N(4)}\\s+NO_PROCESSING_ALLOCATION`));
  });
});
