/**
 * WHO SAYS THIS REQUEST MAY HAPPEN.
 *
 * Every Phase 2B request needs two independent authorities, and BOTH are read
 * from the database rather than accepted from the caller:
 *
 *   RUN AUTHORITY   - an open research run whose recorded fetch policy this
 *                     build actually implements.
 *   ROOT AUTHORITY  - either an official source's website CLAIM, or an operator's
 *                     explicit PROMOTION of an observed cross-domain redirect
 *                     target.
 *
 * THE CALLER NEVER SUPPLIES A ROOT URL. It supplies an ID, and the URL is
 * whatever the referenced row says it is. That asymmetry is the whole trust
 * model: a caller that could pass `{ claimId, rootUrl }` could pair a real
 * claim with any URL it liked, and every scope check below it would then be
 * measuring the caller's own answer. There is no `canonicalWebsite`,
 * `preferredWebsite` or `verifiedWebsite` input, because no such thing exists
 * in this repository.
 *
 * Reads only. This module opens no socket and writes no row.
 */
import type { Queryable } from './observations.js';
import { FETCH_POLICY_VERSION } from './policy.js';
import { validateRequestUrl, type ValidatedUrl } from './url.js';

/** How the caller names the root. An ID, never a URL. */
export type RootAuthorityRef =
  | { kind: 'WEBSITE_CLAIM'; websiteClaimId: string }
  | { kind: 'ROOT_PROMOTION'; promotionId: string };

export interface ResolvedRun {
  id: string;
  networkVantage: string;
  fetchPolicyVersion: string;
  ruleVersion: string;
}

export interface ResolvedRoot {
  /** Exactly one of these two is set, mirroring the schema's root XOR. */
  websiteClaimId: string | null;
  promotionId: string | null;
  /** `claim:<uuid>` or `promotion:<uuid>` - the value the database GENERATES on a fetch row. */
  rootKey: string;
  rootUrl: ValidatedUrl;
  echeRowKey: string;
  organisationId: string | null;
}

export type AuthorityRefusalReason =
  | 'RUN_NOT_FOUND'
  | 'RUN_ALREADY_COMPLETED'
  | 'RUN_IS_DRY_RUN'
  | 'RUN_FETCH_POLICY_UNSUPPORTED'
  | 'ROOT_CLAIM_NOT_FOUND'
  | 'ROOT_CLAIM_NOT_STRUCTURALLY_VALID'
  | 'ROOT_URL_UNUSABLE'
  | 'ROOT_PROMOTION_NOT_FOUND'
  | 'ROOT_PROMOTION_REVOKED'
  | 'ROOT_PROMOTION_TARGET_MALFORMED';

/**
 * A request that will not be made.
 *
 * Thrown BEFORE any DNS resolution or socket activity, and deliberately
 * without an evidence row: `orgunit_fetch_observations` records HTTP ATTEMPTS,
 * and a refusal at this layer means no attempt existed. Its CHECK constraints
 * agree - a row needs a root authority and an `https?://` URL, so a request
 * refused for lacking either is not merely undesirable to record, it is
 * unrecordable.
 */
export class WebGatewayRefusal extends Error {
  readonly reason: string;

  constructor(reason: string, message: string) {
    super(`${reason}: ${message}`);
    this.name = 'WebGatewayRefusal';
    this.reason = reason;
  }
}

interface RunRow {
  id: string;
  network_vantage: string;
  fetch_policy_version: string;
  rule_version: string;
  dry_run: boolean;
  terminal_state: string | null;
}

/**
 * Loads the run and proves it may still cause network activity.
 *
 * A run is NEVER created here. Run creation and run completion belong to an
 * orchestration layer that does not exist yet; a gateway that could open a run
 * on demand would make "which run authorised this?" answerable only in
 * hindsight.
 *
 * Terminal state is DERIVED from the presence of a completion row, because
 * `nwf_research` holds no UPDATE grant and so a run has no mutable status
 * column to read.
 */
export async function resolveRun(client: Queryable, runId: string): Promise<ResolvedRun> {
  const { rows } = await client.query<RunRow>(
    `SELECT r.id, r.network_vantage, r.fetch_policy_version, r.rule_version, r.dry_run,
            c.terminal_state
       FROM orgunit_research_runs r
       LEFT JOIN orgunit_research_run_completions c ON c.run_id = r.id
      WHERE r.id = $1`,
    [runId],
  );
  const run = rows[0];
  if (run === undefined) {
    throw new WebGatewayRefusal(
      'RUN_NOT_FOUND',
      `no orgunit_research_runs row with id ${runId}. A run is never created implicitly.`,
    );
  }
  if (run.terminal_state !== null) {
    throw new WebGatewayRefusal(
      'RUN_ALREADY_COMPLETED',
      `run ${runId} already has a terminal completion (${run.terminal_state}). ` +
        `A completed run is closed evidence; a later attempt belongs to a new run.`,
    );
  }
  if (run.dry_run) {
    throw new WebGatewayRefusal(
      'RUN_IS_DRY_RUN',
      `run ${runId} is a dry run. A dry run reaches no third-party host, ` +
        `so there is nothing for this gateway to do under it.`,
    );
  }
  if (run.fetch_policy_version !== FETCH_POLICY_VERSION) {
    throw new WebGatewayRefusal(
      'RUN_FETCH_POLICY_UNSUPPORTED',
      `run ${runId} records fetch policy "${run.fetch_policy_version}" and this build ` +
        `implements "${FETCH_POLICY_VERSION}". Executing it anyway would stamp a policy ` +
        `version onto evidence produced under different timeouts and caps.`,
    );
  }
  return {
    id: run.id,
    networkVantage: run.network_vantage,
    fetchPolicyVersion: run.fetch_policy_version,
    ruleVersion: run.rule_version,
  };
}

interface ClaimRow {
  id: string;
  eche_row_key: string;
  organisation_id: string | null;
  structural_status: string;
  normalised_url: string | null;
}

interface PromotionRow {
  id: string;
  to_url_resolved: string | null;
  target_malformed: boolean;
  eche_row_key: string;
  organisation_id: string | null;
  revocation_count: string;
}

/**
 * Turns a root reference into the URL the database says it is.
 *
 * For a PROMOTION the target is reached by join - promotion -> redirect
 * observation -> `to_url_resolved` - because the approval deliberately stores
 * no URL of its own and therefore cannot name a target different from the
 * redirect it claims to approve.
 *
 * A REVOKED promotion fails here, before any hostname is resolved and before
 * any socket exists. That ordering is load-bearing: a revocation that only
 * took effect after the request would have authorised exactly the fetch it was
 * written to prevent.
 */
export async function resolveRoot(client: Queryable, ref: RootAuthorityRef): Promise<ResolvedRoot> {
  if (ref.kind === 'WEBSITE_CLAIM') {
    const { rows } = await client.query<ClaimRow>(
      `SELECT id, eche_row_key, organisation_id, structural_status, normalised_url
         FROM website_claims WHERE id = $1`,
      [ref.websiteClaimId],
    );
    const claim = rows[0];
    if (claim === undefined) {
      throw new WebGatewayRefusal(
        'ROOT_CLAIM_NOT_FOUND',
        `no website_claims row with id ${ref.websiteClaimId}.`,
      );
    }
    if (claim.structural_status !== 'STRUCTURALLY_VALID' || claim.normalised_url === null) {
      throw new WebGatewayRefusal(
        'ROOT_CLAIM_NOT_STRUCTURALLY_VALID',
        `website claim ${claim.id} is ${claim.structural_status}. An ABSENT, MALFORMED or ` +
          `NOT_A_WEBSITE claim names no site, and repairing one into a request target would ` +
          `fabricate the website Phase 1D exists to prove was never published.`,
      );
    }
    return {
      websiteClaimId: claim.id,
      promotionId: null,
      rootKey: `claim:${claim.id}`,
      rootUrl: requireUsableRootUrl(claim.normalised_url, `website claim ${claim.id}`),
      echeRowKey: claim.eche_row_key,
      organisationId: claim.organisation_id,
    };
  }

  const { rows } = await client.query<PromotionRow>(
    `SELECT p.id,
            r.to_url_resolved,
            r.target_malformed,
            f.eche_row_key,
            f.organisation_id,
            (SELECT count(*) FROM orgunit_root_promotion_revocations v
              WHERE v.promotion_id = p.id)::text AS revocation_count
       FROM orgunit_root_promotions p
       JOIN orgunit_redirect_observations r ON r.id = p.redirect_observation_id
       JOIN orgunit_fetch_observations f    ON f.id = r.fetch_observation_id
      WHERE p.id = $1`,
    [ref.promotionId],
  );
  const promotion = rows[0];
  if (promotion === undefined) {
    throw new WebGatewayRefusal(
      'ROOT_PROMOTION_NOT_FOUND',
      `no orgunit_root_promotions row with id ${ref.promotionId}. A cross-domain target ` +
        `is a root only when an operator stored an approval; observation is never enough.`,
    );
  }
  if (Number.parseInt(promotion.revocation_count, 10) > 0) {
    throw new WebGatewayRefusal(
      'ROOT_PROMOTION_REVOKED',
      `promotion ${promotion.id} has been revoked. The approval row remains as the record ` +
        `that it once authorised fetches; it authorises none now.`,
    );
  }
  if (promotion.target_malformed || promotion.to_url_resolved === null) {
    /* The schema's composite foreign key already refuses to approve a malformed
       target, so reaching this branch would mean the constraint had been
       weakened. Refusing here as well costs nothing and fails closed. */
    throw new WebGatewayRefusal(
      'ROOT_PROMOTION_TARGET_MALFORMED',
      `promotion ${promotion.id} references a redirect whose target could not be resolved.`,
    );
  }
  return {
    websiteClaimId: null,
    promotionId: promotion.id,
    rootKey: `promotion:${promotion.id}`,
    rootUrl: requireUsableRootUrl(promotion.to_url_resolved, `promotion ${promotion.id}`),
    echeRowKey: promotion.eche_row_key,
    organisationId: promotion.organisation_id,
  };
}

/**
 * A stored root URL still has to pass every request gate.
 *
 * Being official, or being approved, does not make a value requestable: a
 * register can publish a URL with an unusual port, and an operator can approve a
 * redirect whose target is an IP literal. Validating the root in its own right
 * is what keeps those from becoming sockets.
 */
function requireUsableRootUrl(candidate: string, describedAs: string): ValidatedUrl {
  const validated = validateRequestUrl(candidate);
  if (!validated.ok) {
    throw new WebGatewayRefusal(
      'ROOT_URL_UNUSABLE',
      `${describedAs} names "${candidate}", which this gateway refuses (${validated.reason}).`,
    );
  }
  return validated.value;
}
