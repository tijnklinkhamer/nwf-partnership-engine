/**
 * WW E-W - THE PRODUCTION STAGE HANDLERS (ADR 0030 s3): the real
 * dependencies, built lazily, for `nwf-pe acquisition worker`.
 *
 *   - live search: `productionLiveSearchDeps()` (the real Agent SDK `query`
 *     and the ADR 0010 auth-status runner), used ONLY under a stored OWNER
 *     grant the signed campaign lists;
 *   - research: NO injected dependency - the real gateway transport, the
 *     real clock and the committed cohort registry, exactly as
 *     `orgunits subjects research --execute` uses them;
 *   - one pool per capability role, created by the caller's factory.
 *
 * INERT IN THIS BUILD. The worker derives a `CampaignAuthority` before every
 * claim, from the stored campaign's OWNER signature verified under the
 * PINNED campaign trust set - which is EMPTY. So these handlers never run:
 * the worker stops CAMPAIGN_UNVERIFIED before its first claim. The trust
 * scope recorded on a CAMPAIGN admission is therefore always OPERATIONAL
 * here; a TEST_ONLY scope exists only in tests.
 */
import type pg from 'pg';

import type { ContinuationScopeCheck, StageHandler } from '../acquisition/index.js';
import { productionLiveSearchDeps } from './sourceDiscoveryPort.js';
import type { WiringPools } from './context.js';
import { continuationScopeCheck, createStageHandlers } from './handlers.js';

export type WiringRole = 'source_discovery' | 'discovery_subject_writer' | 'research' | 'readonly';

export interface ProductionWiringInput {
  /** The worker's own pool (a login holding nwf_acquisition_worker). */
  readonly workerPool: pg.Pool;
  /** Builds a pool for one capability role (production: `createPool`). */
  readonly poolFor: (role: WiringRole) => pg.Pool;
  readonly outboxDir: string | null;
  readonly networkVantage: string;
}

export interface ProductionWiring {
  readonly handlers: readonly StageHandler[];
  /** R2: the signed-geography check a continuation nomination passes before adoption. */
  readonly continuationScope: ContinuationScopeCheck;
  /** Ends every pool this wiring created (never the worker pool). */
  close(): Promise<void>;
}

export function createProductionStageHandlers(input: ProductionWiringInput): ProductionWiring {
  const created = new Map<WiringRole, pg.Pool>();
  const lazy = (role: WiringRole): pg.Pool => {
    let pool = created.get(role);
    if (pool === undefined) {
      pool = input.poolFor(role);
      created.set(role, pool);
    }
    return pool;
  };
  const pools: WiringPools = {
    worker: input.workerPool,
    get sourceDiscovery() {
      return lazy('source_discovery');
    },
    get writer() {
      return lazy('discovery_subject_writer');
    },
    get research() {
      return lazy('research');
    },
    get readonly() {
      return lazy('readonly');
    },
  };
  const handlers = createStageHandlers({
    pools,
    liveSearch: { ...productionLiveSearchDeps(), clock: { now: () => new Date() } },
    research: {},
    campaignTrustScope: 'OPERATIONAL',
    outboxDir: input.outboxDir,
    networkVantage: input.networkVantage,
  });
  return {
    handlers,
    continuationScope: continuationScopeCheck(() => lazy('readonly')),
    async close() {
      await Promise.all([...created.values()].map((p) => p.end()));
      created.clear();
    },
  };
}
