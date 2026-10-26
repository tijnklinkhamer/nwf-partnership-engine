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
 * WHAT IT NEVER DOES: fetch, resolve, rank or follow the URL. Nothing here
 * can reach a socket, and the root runner calls the sink only AFTER the
 * page's evidence row exists.
 */
import type pg from 'pg';

import { prepareNomination, type NominationRefusalReason } from './nomination.js';
import { inSourceDiscoveryTransaction, insertNomination, linkOutRunFor } from './store.js';

export type LinkOutSink = (
  pageEvidenceId: string,
  href: string,
  anchorText: string | null,
) => Promise<void>;

export interface LinkOutSummary {
  readonly discoveryRunId: string | null;
  readonly offered: number;
  readonly inserted: number;
  readonly duplicates: number;
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
      return { runId, result };
    });
    discoveryRunId = outcome.runId;
    if (outcome.result.outcome === 'INSERTED') inserted += 1;
    else duplicates += 1;
  };

  return {
    sink,
    summary: () => ({ discoveryRunId, offered, inserted, duplicates, refusals: { ...refusals } }),
  };
}
