/**
 * REL L2 / U1 - CAPTURING OFF-DOMAIN LINK-OUTS AS NOMINATIONS. NEVER FETCHED.
 *
 * Bounded acquisition (`runRootAcquisition`) already extracts every anchor of
 * every page it reads, PII-safely (`orchestrator/anchors.ts`), and used to
 * discard the ones that leave the root's registrable domain. A university's
 * international office linking to a city's language cafe is exactly the kind
 * of obscure organisation U1 exists to surface, so the root runner now hands
 * those anchors to an OPTIONAL sink, and this module is that sink.
 *
 * WHAT IT DOES: prepares the absolute href exactly like a search result (the
 * same URL rules, social/messaging refusal, service-subdomain refusal and
 * redaction of the anchor text), then appends it as a PAGE_LINK_OUT
 * nomination citing the page evidence it came from, deduped per research run
 * by registrable domain. `retrieved_at` is that page's own `observed_at`,
 * which migration 0019 enforces.
 *
 * REL P2 (migration 0020): EVERY observation is kept. The nomination row
 * stays deduped per run (0019); the domain's ONE cross-run identity is
 * recorded (or read back) with it; and each (page, URL) is appended as a
 * sighting citing the page evidence, its redacted anchor text and the page's
 * observed_at - so a second page, or a later run, linking to an already
 * nominated domain adds evidence instead of being dropped.
 *
 * WHAT IT NEVER DOES: fetch, resolve, rank or follow the URL. Nothing here
 * can reach a socket, and the root runner calls the sink only AFTER the
 * page's evidence row exists. A nomination, an identity and a sighting
 * authorise nothing: fetching a nominated domain needs the separate
 * promote -> review -> OWNER admission -> research path.
 */
import type pg from 'pg';

import { prepareNomination, type NominationRefusalReason } from './nomination.js';
import {
  SourceDiscoverySessionRefused,
  inSourceDiscoveryTransaction,
  insertLinkOutSighting,
  insertNomination,
  linkOutRunFor,
} from './store.js';

export type LinkOutSink = (
  pageEvidenceId: string,
  href: string,
  anchorText: string | null,
) => Promise<void>;

export interface LinkOutSummary {
  readonly discoveryRunId: string | null;
  readonly offered: number;
  /** New nomination rows of this run (0019: one per registrable domain per run). */
  readonly inserted: number;
  /** Further offers of a domain this run had already nominated (their sightings are kept). */
  readonly duplicates: number;
  /** Of `inserted`: domains whose identity an EARLIER nomination already held. */
  readonly alreadyNominatedElsewhere: number;
  /** New sighting rows (migration 0020): one per (page, URL) observed. */
  readonly sightings: number;
  /** Offers of a (page, URL) already recorded as a sighting (idempotent replay). */
  readonly repeatedSightings: number;
  readonly refusals: Readonly<Partial<Record<NominationRefusalReason, number>>>;
}

export interface LinkOutCapture {
  readonly sink: LinkOutSink;
  summary(): LinkOutSummary;
}

/** A sink bound to ONE research run. Its link-out discovery run is created on first use. */
export function createLinkOutNominationSink(pool: pg.Pool, researchRunId: string): LinkOutCapture {
  let discoveryRunId: string | null = null;
  let offered = 0;
  let inserted = 0;
  let duplicates = 0;
  let alreadyNominatedElsewhere = 0;
  let sightings = 0;
  let repeatedSightings = 0;
  const refusals: Partial<Record<NominationRefusalReason, number>> = {};

  const sink: LinkOutSink = async (pageEvidenceId, href, anchorText) => {
    offered += 1;
    const prepared = prepareNomination({ url: href, title: anchorText, snippet: null });
    if (!prepared.ok) {
      refusals[prepared.reason] = (refusals[prepared.reason] ?? 0) + 1;
      return;
    }
    const outcome = await inSourceDiscoveryTransaction(pool, async (c) => {
      const runId = discoveryRunId ?? (await linkOutRunFor(c, researchRunId));
      const result = await insertNomination(c, {
        discoveryRunId: runId,
        method: 'PAGE_LINK_OUT',
        providerKey: 'page-link-out',
        queryId: null,
        sourcePageEvidenceId: pageEvidenceId,
        prepared: prepared.value,
        retrievedAt: null,
      });
      const sighting = await insertLinkOutSighting(c, {
        identityId: result.identityId,
        nominationId: result.nominationId,
        sourcePageEvidenceId: pageEvidenceId,
        prepared: prepared.value,
      });
      return { runId, result, sighting };
    });
    // Counted only AFTER the transaction committed.
    discoveryRunId = outcome.runId;
    if (outcome.result.outcome === 'INSERTED') {
      inserted += 1;
      if (outcome.result.canonicalNominationId !== outcome.result.id)
        alreadyNominatedElsewhere += 1;
    } else {
      duplicates += 1;
    }
    if (outcome.sighting === 'INSERTED') sightings += 1;
    else repeatedSightings += 1;
  };

  return {
    sink,
    summary: () => ({
      discoveryRunId,
      offered,
      inserted,
      duplicates,
      alreadyNominatedElsewhere,
      sightings,
      repeatedSightings,
      refusals: { ...refusals },
    }),
  };
}

/**
 * True when `pool`'s login may enter the `nwf_source_discovery` capability:
 * not a superuser, not a table owner, holding the role (store.ts's own
 * session check, in a transaction that writes nothing). Subject research
 * asks this BEFORE it starts a run, so a misconfigured link-out login is
 * refused before any run row, DNS lookup or request - not after the pages
 * were fetched. Any other error propagates.
 */
export async function linkOutCapabilityHeld(pool: pg.Pool): Promise<boolean> {
  try {
    await inSourceDiscoveryTransaction(pool, () => Promise.resolve());
    return true;
  } catch (error) {
    if (error instanceof SourceDiscoverySessionRefused) return false;
    throw error;
  }
}
