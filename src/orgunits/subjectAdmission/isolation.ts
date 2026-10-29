/**
 * GLOBAL R8 - THE TWO READS A SUBJECT ROOT IS CHECKED AGAINST, on the OWNER
 * path when it is admitted and again by research before its first request.
 *
 *   `loadIsolationDomains` - every registrable domain a website claim names
 *   (ECHE and the FR register alike, whatever its structural status) and
 *   every promoted redirect target's, revoked or not. A subject root on any
 *   of them is refused (ADR 0025 Q2). Read from the tables `nwf_research`
 *   already reads for its own roots; the promoted targets' domains are
 *   derived with the one shared registrable-domain implementation
 *   (`src/website/parse.ts`), never a second one, and a target it cannot
 *   place fails the whole read closed.
 *
 *   `readRegistryFingerprint` - the row counts of the five discovery-subject
 *   tables, through the migration 0017 view, which is all of that registry
 *   research may see.
 *
 * SELECT only. Opens no socket and writes nothing.
 */
import { icannRegistrableDomain } from '../../website/parse.js';
import type { Queryable } from '../web/observations.js';

export async function loadIsolationDomains(q: Queryable): Promise<string[]> {
  const claims = await q.query<{ registrable_domain: string }>(
    `SELECT DISTINCT registrable_domain FROM website_claims
      WHERE registrable_domain IS NOT NULL AND registrable_domain <> ''`,
  );
  const promoted = await q.query<{ to_url_resolved: string }>(
    `SELECT DISTINCT r.to_url_resolved
       FROM orgunit_root_promotions p
       JOIN orgunit_redirect_observations r ON r.id = p.redirect_observation_id
      WHERE r.to_url_resolved IS NOT NULL`,
  );
  const domains = new Set(claims.rows.map((r) => r.registrable_domain));
  for (const row of promoted.rows) {
    // Every promoted target counts, requestable or not: the WHATWG host
    // through the one shared registrable-domain implementation.
    let hostname: string | null;
    try {
      hostname = new URL(row.to_url_resolved).hostname;
    } catch {
      hostname = null;
    }
    const domain = hostname === null ? null : icannRegistrableDomain(hostname);
    if (domain === null) {
      throw new Error(
        'a promoted redirect target names no registrable domain; refusing to judge isolation',
      );
    }
    domains.add(domain);
  }
  return [...domains].sort();
}

export async function readRegistryFingerprint(q: Queryable): Promise<string> {
  const { rows } = await q.query<{ fingerprint: string }>(
    `SELECT fingerprint FROM subject_research_registry_fingerprint`,
  );
  const fingerprint = rows[0]?.fingerprint;
  if (rows.length !== 1 || typeof fingerprint !== 'string') {
    throw new Error('subject_research_registry_fingerprint returned no single row');
  }
  return fingerprint;
}
