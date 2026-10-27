/**
 * WW E-W - WHAT EVERY ACQUISITION STAGE HANDLER IS GIVEN (ADR 0030).
 *
 * The wiring is the one place that connects the E-Q queue (`acquisition/`)
 * to the paths that already do the work: granted source discovery, the B2.2
 * registry writer, subject research under an admission, and the read-only
 * exports. Each path keeps its own capability ROLE, so a handler holds one
 * pool per role and never borrows another role's:
 *
 *   worker          nwf_acquisition_worker  queue, signals, bindings, CAMPAIGN admissions, outbox rows
 *   sourceDiscovery nwf_source_discovery    the granted search run, link-out capture
 *   writer          nwf_discovery_subject_writer  propose + website claim
 *   research        nwf_research            subject research through the one gateway
 *   readonly        nwf_readonly            every read and both exports
 *
 * Nothing here holds authority: a handler runs only after the worker derived
 * a `CampaignAuthority` from a verified OWNER signature, and every path below
 * re-checks its own stored authority (grant, admission, review).
 *
 * Opens no socket.
 */
import { createHash } from 'node:crypto';
import type pg from 'pg';

import type { RootRunnerDeps } from '../orchestrator/rootRunner.js';
import type { GrantedRunDeps } from './sourceDiscoveryPort.js';

/** The opaque path key every wiring row carries: names the PATH, never a person. */
export const ACQUISITION_WIRING_ACTOR_KEY = 'acquisition-worker';

export interface WiringPools {
  readonly worker: pg.Pool;
  readonly sourceDiscovery: pg.Pool;
  readonly writer: pg.Pool;
  readonly research: pg.Pool;
  readonly readonly: pg.Pool;
}

export interface WiringDeps {
  readonly pools: WiringPools;
  /** The granted search run's live dependencies (production: `productionLiveSearchDeps`). */
  readonly liveSearch: GrantedRunDeps;
  /** Research dependencies (production: none - the real gateway transport and clock). */
  readonly research: RootRunnerDeps;
  /**
   * The trust scope the CAMPAIGN signature is verified under (the worker's
   * trust set): recorded on a CAMPAIGN admission, where TEST_ONLY is refused
   * outside vitest by the existing subject guard.
   */
  readonly campaignTrustScope: 'OPERATIONAL' | 'TEST_ONLY';
  /** Absolute outbox root (`nwf-pe.acquisition-outbox.v1`); null refuses the export stages. */
  readonly outboxDir: string | null;
  /** The research network vantage label recorded on every research run. */
  readonly networkVantage: string;
}

/**
 * The deterministic discovery-subject id a campaign proposes for one
 * nomination, so a retried proposal is the SAME subject (the writer refuses a
 * second proposal of an existing id). A UUID v4 shape over a SHA-256.
 */
export function campaignSubjectIdOf(campaignId: string, nominationId: string): string {
  const h = createHash('sha256')
    .update(`nwf-pe.acquisition-subject.v1|${campaignId}|${nominationId}`, 'utf8')
    .digest('hex');
  const variant = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** The actor key a granted search run started for one work item carries (idempotency key). */
export function searchRunActorKeyOf(workItemId: string): string {
  return `acq-${workItemId}`;
}

/** The lower-case host of an http(s) URL, or null. */
export function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** True when `host` IS `domain` or a subdomain of it. */
export function hostOnDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}
