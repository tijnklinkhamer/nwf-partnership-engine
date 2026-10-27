/**
 * WHO SAYS THIS REQUEST MAY HAPPEN.
 *
 * Every Phase 2B request needs two independent authorities, and BOTH are read
 * from the database rather than accepted from the caller:
 *
 *   RUN AUTHORITY   - an open research run whose recorded fetch policy this
 *                     build actually implements.
 *   ROOT AUTHORITY  - an official source's website CLAIM, an operator's
 *                     explicit PROMOTION of an observed cross-domain redirect
 *                     target, or (Global R8, ADR 0025) an OWNER ADMISSION of
 *                     one discovery subject's own website claim.
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
  | { kind: 'ROOT_PROMOTION'; promotionId: string }
  | { kind: 'SUBJECT_ADMISSION'; admissionId: string };

/**
 * The subject-research admission policy versions this build implements
 * (Global R8, ADR 0025). An admission recorded under any other version is
 * refused before any request, exactly like an unimplemented fetch policy.
 */
export const SUBJECT_RESEARCH_ADMISSION_POLICY_VERSION = 'subject-research-admission-policy-v1';

/**
 * WW E-W (ADR 0030, migration 0024): the CAMPAIGN admission basis - a
 * subject proposed inside an OWNER-signed campaign, admitted for bounded
 * first-party research. Its row is bound by foreign key to the campaign and
 * its work item, and the database CHECK pins it to admission_basis CAMPAIGN.
 */
export const SUBJECT_RESEARCH_CAMPAIGN_ADMISSION_POLICY_VERSION =
  'subject-research-admission-policy-campaign-v1';

/** Every subject admission policy version this build implements. */
export const SUBJECT_RESEARCH_ADMISSION_POLICY_VERSIONS: readonly string[] = Object.freeze([
  SUBJECT_RESEARCH_ADMISSION_POLICY_VERSION,
  SUBJECT_RESEARCH_CAMPAIGN_ADMISSION_POLICY_VERSION,
]);

export interface ResolvedRun {
  id: string;
  networkVantage: string;
  fetchPolicyVersion: string;
  ruleVersion: string;
}

/** What a subject root's own guard needs from its stored admission (Global R8). */
export interface ResolvedSubjectAdmission {
  admissionId: string;
  subjectId: string;
  /**
   * WW H-ACQ (ADR 0030 s13): OWNER_REVIEWED (policy v1) or CAMPAIGN (policy
   * campaign-v1). A CAMPAIGN admission is honoured only inside its campaign.
   * The resolver always sets it; absent (a hand-built value) reads as
   * OWNER_REVIEWED.
   */
  admissionBasis?: 'OWNER_REVIEWED' | 'CAMPAIGN';
  identityClaimId: string;
  identityAuthorityScope: 'OPERATIONAL' | 'TEST_ONLY';
  protectedRegistryDigest: string;
}

export interface ResolvedRoot {
  /** Exactly one of these three is set, mirroring the schema's root XOR. */
  websiteClaimId: string | null;
  promotionId: string | null;
  subjectAdmissionId: string | null;
  /**
   * `claim:<uuid>`, `promotion:<uuid>` or `subject_admission:<uuid>` - the
   * value the database GENERATES on a fetch row.
   */
  rootKey: string;
  rootUrl: ValidatedUrl;
  /** NULL exactly for a subject admission, which has no ECHE source row (migration 0017). */
  echeRowKey: string | null;
  organisationId: string | null;
  /** Set exactly when `subjectAdmissionId` is. */
  subjectAdmission: ResolvedSubjectAdmission | null;
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
  | 'ROOT_PROMOTION_TARGET_MALFORMED'
  | 'ROOT_PROMOTION_NOT_ECHE_ROOTED'
  | 'ROOT_SUBJECT_ADMISSION_NOT_FOUND'
  | 'ROOT_SUBJECT_ADMISSION_REVOKED'
  | 'ROOT_SUBJECT_ADMISSION_EXPIRED'
  | 'ROOT_SUBJECT_ADMISSION_POLICY_UNSUPPORTED'
  | 'ROOT_SUBJECT_ADMISSION_STALE'
  | 'ROOT_SUBJECT_ADMISSION_CAMPAIGN_NOT_RUNNING'
  | 'ROOT_SUBJECT_ADMISSION_CAMPAIGN_ITEM_NOT_IN_FLIGHT'
  | 'ROOT_SUBJECT_ADMISSION_CAMPAIGN_RUN_NOT_FIRST';

/**
 * What the caller knows about the request being resolved. `runId` is the run
 * a gateway attempt (or a root runner) belongs to; absent, the resolution is
 * a PRE-RUN check (a plan, a dry run) and no run of the admission may exist.
 */
export interface RootResolutionContext {
  readonly runId?: string;
}

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
  eche_row_key: string | null;
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
export async function resolveRoot(
  client: Queryable,
  ref: RootAuthorityRef,
  context: RootResolutionContext = {},
): Promise<ResolvedRoot> {
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
      subjectAdmissionId: null,
      rootKey: `claim:${claim.id}`,
      rootUrl: requireUsableRootUrl(claim.normalised_url, `website claim ${claim.id}`),
      echeRowKey: claim.eche_row_key,
      organisationId: claim.organisation_id,
      subjectAdmission: null,
    };
  }

  if (ref.kind === 'SUBJECT_ADMISSION') {
    return resolveSubjectAdmissionRoot(client, ref.admissionId, context);
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
  if (promotion.eche_row_key === null) {
    /* Global R8 (ADR 0025): a redirect observed under a SUBJECT root has no
       ECHE row to descend from, and subject-research-admission-policy-v1
       admits no promotion of one. The fetch row's subject-root CHECK would
       refuse the write anyway; refusing here keeps it a pre-DNS refusal. */
    throw new WebGatewayRefusal(
      'ROOT_PROMOTION_NOT_ECHE_ROOTED',
      `promotion ${promotion.id} approves a redirect observed under a discovery-subject root. ` +
        `No admission policy authorises promoting one.`,
    );
  }
  return {
    websiteClaimId: null,
    promotionId: promotion.id,
    subjectAdmissionId: null,
    rootKey: `promotion:${promotion.id}`,
    rootUrl: requireUsableRootUrl(promotion.to_url_resolved, `promotion ${promotion.id}`),
    echeRowKey: promotion.eche_row_key,
    organisationId: promotion.organisation_id,
    subjectAdmission: null,
  };
}

interface SubjectAdmissionRow {
  id: string;
  subject_id: string;
  identity_claim_id: string;
  website_url: string;
  policy_version: string;
  admission_basis: 'OWNER_REVIEWED' | 'CAMPAIGN';
  identity_authority_scope: 'OPERATIONAL' | 'TEST_ONLY';
  protected_registry_digest: string;
  registry_fingerprint: string;
  live: boolean;
  revocation_count: string;
  current_fingerprint: string;
}

/**
 * GLOBAL R8 (ADR 0025): a discovery subject's root is an OWNER-path
 * ADMISSION, reached by id exactly like a promotion. The URL is the
 * admission's foreign-key-pinned copy of the subject's own website claim
 * (migration 0017), so this role needs no privilege on any subject table.
 *
 * Refused here, on every attempt and before any DNS lookup: an unknown or
 * revoked admission, one past its expiry by the DATABASE clock, one recorded
 * under a policy this build does not implement, and one whose registry
 * fingerprint no longer matches - any discovery-subject row appended since
 * the admission was evaluated makes it STALE (D7), however unrelated.
 */
async function resolveSubjectAdmissionRoot(
  client: Queryable,
  admissionId: string,
  context: RootResolutionContext,
): Promise<ResolvedRoot> {
  const { rows } = await client.query<SubjectAdmissionRow>(
    `SELECT a.id, a.subject_id, a.identity_claim_id, a.website_url, a.policy_version,
            a.admission_basis, a.identity_authority_scope, a.protected_registry_digest, a.registry_fingerprint,
            (a.expires_at > clock_timestamp()) AS live,
            (SELECT count(*) FROM subject_research_admission_revocations v
              WHERE v.admission_id = a.id)::text AS revocation_count,
            (SELECT fingerprint FROM subject_research_registry_fingerprint) AS current_fingerprint
       FROM subject_research_admissions a
      WHERE a.id = $1`,
    [admissionId],
  );
  const admission = rows[0];
  if (admission === undefined) {
    throw new WebGatewayRefusal(
      'ROOT_SUBJECT_ADMISSION_NOT_FOUND',
      `no subject_research_admissions row with id ${admissionId}. A discovery subject is a ` +
        `research root only under a stored OWNER admission.`,
    );
  }
  if (Number.parseInt(admission.revocation_count, 10) > 0) {
    throw new WebGatewayRefusal(
      'ROOT_SUBJECT_ADMISSION_REVOKED',
      `subject admission ${admission.id} has been revoked. It authorises no request now.`,
    );
  }
  if (!admission.live) {
    throw new WebGatewayRefusal(
      'ROOT_SUBJECT_ADMISSION_EXPIRED',
      `subject admission ${admission.id} has expired by the database clock.`,
    );
  }
  if (!SUBJECT_RESEARCH_ADMISSION_POLICY_VERSIONS.includes(admission.policy_version)) {
    throw new WebGatewayRefusal(
      'ROOT_SUBJECT_ADMISSION_POLICY_UNSUPPORTED',
      `subject admission ${admission.id} records policy "${admission.policy_version}" and this ` +
        `build implements ${SUBJECT_RESEARCH_ADMISSION_POLICY_VERSIONS.map((v) => `"${v}"`).join(', ')}.`,
    );
  }
  if (admission.current_fingerprint !== admission.registry_fingerprint) {
    throw new WebGatewayRefusal(
      'ROOT_SUBJECT_ADMISSION_STALE',
      `subject admission ${admission.id} was evaluated over a discovery-subject registry that ` +
        `has since changed. The evidence it was granted on is stale; a new admission is needed.`,
    );
  }
  if (admission.admission_basis === 'CAMPAIGN') {
    await requireCampaignAdmissionInsideItsCampaign(client, admission.id, context);
  }
  return {
    websiteClaimId: null,
    promotionId: null,
    subjectAdmissionId: admission.id,
    rootKey: `subject_admission:${admission.id}`,
    rootUrl: requireUsableRootUrl(admission.website_url, `subject admission ${admission.id}`),
    echeRowKey: null,
    organisationId: null,
    subjectAdmission: {
      admissionId: admission.id,
      subjectId: admission.subject_id,
      admissionBasis: admission.admission_basis,
      identityClaimId: admission.identity_claim_id,
      identityAuthorityScope: admission.identity_authority_scope,
      protectedRegistryDigest: admission.protected_registry_digest,
    },
  };
}

interface CampaignStandingRow {
  campaign_running: boolean;
  campaign_window_open: boolean;
  item_in_flight: boolean;
  first_run_id: string | null;
  run_count: number;
  run_started_in_attempt: boolean | null;
}

/**
 * WW H-ACQ (ADR 0030 s13, P1-1): a CAMPAIGN admission is the campaign's, not
 * the research role's. It authorises a request ONLY while its campaign is
 * RUNNING inside its window, its RESEARCH_PENDING work item is in flight,
 * and the request belongs to the admission's FIRST run, started under the
 * item's current attempt (`subject_research_campaign_admission_standing`,
 * migration 0026). Checked on EVERY gateway attempt, so EMERGENCY_STOP,
 * PAUSE, STOP, a lapsed lease or a superseded attempt ends in-flight research
 * at its next request; a second run of the admission - the standalone CLI,
 * or a stale worker - is refused before its first.
 */
async function requireCampaignAdmissionInsideItsCampaign(
  client: Queryable,
  admissionId: string,
  context: RootResolutionContext,
): Promise<void> {
  const { rows } = await client.query<CampaignStandingRow>(
    `SELECT s.campaign_running, s.campaign_window_open, s.item_in_flight, s.first_run_id,
            s.run_count,
            (SELECT r.started_at >= s.attempt_claimed_at
               FROM orgunit_research_runs r WHERE r.id = $2) AS run_started_in_attempt
       FROM subject_research_campaign_admission_standing s
      WHERE s.admission_id = $1`,
    [admissionId, context.runId ?? null],
  );
  const s = rows[0];
  if (s === undefined || !s.campaign_running || !s.campaign_window_open) {
    throw new WebGatewayRefusal(
      'ROOT_SUBJECT_ADMISSION_CAMPAIGN_NOT_RUNNING',
      `subject admission ${admissionId} rests on a campaign that is not RUNNING inside its ` +
        `window. A CAMPAIGN admission authorises nothing outside its campaign.`,
    );
  }
  if (!s.item_in_flight) {
    throw new WebGatewayRefusal(
      'ROOT_SUBJECT_ADMISSION_CAMPAIGN_ITEM_NOT_IN_FLIGHT',
      `subject admission ${admissionId} was made for a work item that has no in-flight ` +
        `attempt. Only the worker holding that item may research under it.`,
    );
  }
  const firstRunOfThisAttempt =
    context.runId === undefined
      ? s.run_count === 0
      : s.first_run_id === context.runId && s.run_started_in_attempt === true;
  if (!firstRunOfThisAttempt) {
    throw new WebGatewayRefusal(
      'ROOT_SUBJECT_ADMISSION_CAMPAIGN_RUN_NOT_FIRST',
      `subject admission ${admissionId} authorises exactly one research run, started by the ` +
        `work item's current attempt; this request is not that run's.`,
    );
  }
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
