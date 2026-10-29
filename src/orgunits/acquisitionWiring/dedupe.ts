/**
 * WW E-W - THE NOMINATED STAGE (ADR 0030 s3.2): canonical-domain checks and
 * deduplication. NOTHING IS MERGED.
 *
 *   1. The stored nomination is re-prepared through the SAME gates it passed
 *      when it was recorded (`prepareNomination`: request-URL rules, social
 *      and service hosts, admissibility); its registrable domain - from the
 *      one `tldts` implementation - must equal the stored domain and the work
 *      item's. Otherwise REFUSED POLICY_REFUSED.
 *   2. Scope: a search nomination's run geography must be inside the signed
 *      geographies; a link-out nomination must come from a research run of
 *      one of THIS campaign's own CAMPAIGN admissions. Otherwise REFUSED
 *      OUT_OF_SCOPE.
 *   3. Duplicates, each REFUSED DUPLICATE with a NAMED relationship signal
 *      (`acquisition_signals`), never a merge:
 *        - an ECHE / French-register website claim on the domain;
 *        - an existing discovery subject whose website or cited URL is on it;
 *        - an EARLIER nomination holding the domain's identity (migration
 *          0020: only the first nomination of a domain is promotable);
 *        - the plan's own exclusion set (`already_known`).
 *   4. A nomination carrying the landed higher-education flag is recorded
 *      LARGE_HEI_TAGGED: the scheduler serves that domain's later work only
 *      when nothing else is claimable. Deprioritised, NEVER dropped.
 *
 * Reads on the readonly role; signals are appended as the worker. Opens no
 * socket and fetches nothing.
 */
import type pg from 'pg';

import type {
  ContinuationScopeCheck,
  StageHandler,
  StageOutcome,
  WorkItemView,
} from '../acquisition/index.js';
import { loadNomination, prepareNomination, type NominationRow } from './sourceDiscoveryPort.js';
import type { WiringDeps } from './context.js';
import { geographyInScope } from './discover.js';
import { recordSignal, type RelatedKind, type SignalKind } from './records.js';

/** A URL's host, in SQL, for matching a stored URL against a registrable domain. */
const HOST_OF = (column: string) => `lower(substring(${column} FROM '^https?://([^/:?#]+)'))`;
const ON_DOMAIN = (column: string) =>
  `(${HOST_OF(column)} = $1 OR right(${HOST_OF(column)}, length($1) + 1) = '.' || $1)`;

interface Duplicate {
  readonly kind: SignalKind;
  readonly related: { readonly kind: RelatedKind; readonly id: string };
}

/** The first duplicate the nomination's domain has, in a fixed order, or null. */
export async function findDuplicate(
  readonly: pg.Pool,
  nomination: NominationRow,
): Promise<Duplicate | null> {
  const domain = nomination.registrableDomain;
  const claim = await readonly.query<{ id: string }>(
    `SELECT id FROM website_claims WHERE registrable_domain = $1 ORDER BY id LIMIT 1`,
    [domain],
  );
  if (claim.rows[0] !== undefined) {
    return {
      kind: 'DUPLICATE_OF_WEBSITE_CLAIM',
      related: { kind: 'WEBSITE_CLAIM', id: claim.rows[0].id },
    };
  }
  const subject = await readonly.query<{ subject_id: string }>(
    `SELECT subject_id FROM discovery_subject_identity_claims
      WHERE (claim_kind = 'PUBLIC_WEBSITE' AND website_url IS NOT NULL AND ${ON_DOMAIN('website_url')})
         OR (source_type = 'PUBLIC_URL' AND source_url IS NOT NULL AND ${ON_DOMAIN('source_url')})
      ORDER BY subject_id LIMIT 1`,
    [domain],
  );
  if (subject.rows[0] !== undefined) {
    return {
      kind: 'DUPLICATE_OF_DISCOVERY_SUBJECT',
      related: { kind: 'DISCOVERY_SUBJECT', id: subject.rows[0].subject_id },
    };
  }
  const identity = await readonly.query<{ first_nomination_id: string }>(
    `SELECT first_nomination_id FROM source_discovery_nomination_identities
      WHERE registrable_domain = $1`,
    [domain],
  );
  const first = identity.rows[0]?.first_nomination_id;
  if (first !== undefined && first !== nomination.id) {
    return {
      kind: 'DUPLICATE_OF_EARLIER_NOMINATION',
      related: { kind: 'NOMINATION', id: first },
    };
  }
  const known = await readonly.query<{ already_known: boolean }>(
    `SELECT already_known FROM source_discovery_nomination_known_marks WHERE nomination_id = $1`,
    [nomination.id],
  );
  if (known.rows[0]?.already_known === true) {
    return {
      kind: 'DUPLICATE_OF_PLAN_EXCLUSION',
      related: { kind: 'NOMINATION', id: nomination.id },
    };
  }
  return null;
}

async function inScope(
  deps: WiringDeps,
  item: WorkItemView,
  nomination: NominationRow,
  geographies: readonly string[],
): Promise<boolean> {
  const { rows } = await deps.pools.readonly.query<{
    run_kind: string;
    geography: string | null;
    research_run_id: string | null;
  }>(`SELECT run_kind, geography, research_run_id FROM source_discovery_runs WHERE id = $1`, [
    nomination.discoveryRunId,
  ]);
  const run = rows[0];
  if (run === undefined) return false;
  if (run.run_kind === 'PAGE_LINK_OUT') {
    // In scope by PROVENANCE: found on a page of this campaign's own admitted research.
    const owned = await deps.pools.readonly.query<{ ok: boolean }>(
      `SELECT EXISTS (
          SELECT 1 FROM orgunit_research_runs r
            JOIN subject_research_admissions a
              ON r.root_scope = 'subject_admission:' || a.id::text
           WHERE r.id = $1 AND a.admission_basis = 'CAMPAIGN' AND a.campaign_id = $2) AS ok`,
      [run.research_run_id, item.campaignId],
    );
    return owned.rows[0]!.ok;
  }
  return geographyInScope(geographies, run.geography);
}

/**
 * R2 (migration 0029): the scope rule a CONTINUATION nomination must pass
 * BEFORE a v3 campaign adopts it - the NOMINATED stage's own geography rule
 * (`inScope` above, search branch). A continued nomination comes from a
 * granted SEARCH run, whose geography must be inside the signed geographies;
 * anything else is out of scope. The worker role cannot read the run, so
 * this reads it on the readonly role; the NOMINATED handler re-checks it
 * after adoption, unchanged.
 */
export function continuationScopeCheck(
  readonlyPool: () => pg.Pool | pg.PoolClient,
): ContinuationScopeCheck {
  return async (nominationId, geographies) => {
    const { rows } = await readonlyPool().query<{ run_kind: string; geography: string | null }>(
      `SELECT r.run_kind, r.geography
         FROM source_discovery_nominations n
         JOIN source_discovery_runs r ON r.id = n.discovery_run_id
        WHERE n.id = $1`,
      [nominationId],
    );
    const run = rows[0];
    return (
      run !== undefined &&
      run.run_kind === 'SEARCH_PROVIDER' &&
      geographyInScope(geographies, run.geography)
    );
  };
}

export function nominatedHandler(deps: WiringDeps): StageHandler {
  return {
    stage: 'NOMINATED',
    async handle(item, ctx): Promise<StageOutcome> {
      const nomination = await loadNomination(deps.pools.readonly, item.subjectId);
      if (nomination === null) return { kind: 'REFUSED', reason: 'SUBJECT_NOT_FOUND' };
      const prepared = prepareNomination({
        url: nomination.url,
        title: nomination.title,
        snippet: null,
      });
      if (
        !prepared.ok ||
        prepared.value.registrableDomain !== nomination.registrableDomain ||
        item.registrableDomain !== nomination.registrableDomain
      ) {
        return { kind: 'REFUSED', reason: 'POLICY_REFUSED' };
      }
      if (!(await inScope(deps, item, nomination, ctx.campaign.scope.geographies))) {
        return { kind: 'REFUSED', reason: 'OUT_OF_SCOPE' };
      }
      const duplicate = await findDuplicate(deps.pools.readonly, nomination);
      if (duplicate !== null) {
        await recordSignal(deps.pools.worker, item, {
          kind: duplicate.kind,
          nominationId: nomination.id,
          related: duplicate.related,
        });
        return { kind: 'REFUSED', reason: 'DUPLICATE' };
      }
      if (nomination.heiSignal) {
        await recordSignal(deps.pools.worker, item, {
          kind: 'LARGE_HEI_TAGGED',
          nominationId: nomination.id,
          related: null,
        });
      }
      return { kind: 'ADVANCED', next: 'DEDUPLICATED' };
    },
  };
}
