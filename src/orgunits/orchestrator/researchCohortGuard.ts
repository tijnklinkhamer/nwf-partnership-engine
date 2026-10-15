/**
 * RESEARCH-SIDE EVALUATION-COHORT GUARD (Track B, B3.0).
 *
 * WHY THIS EXISTS. The classifier operator command has refused protected
 * evaluation organisations since CLASSIFIER_OPERATOR_EVALUATION_COHORT_GUARD_V1
 * (`../classify/evaluationCohortGuard.ts`). The research path did not:
 * `runOrganisationDiscovery` appended an `orgunit_research_runs` row and began
 * acquiring evidence before anything asked whether the organisation belongs
 * to a protected cohort, so a protected organisation could receive a NEW run
 * and NEW evidence before the classifier refused it. This module closes that
 * gap. It refuses BEFORE any run row, any DNS lookup, any HTTP request and
 * any evidence write.
 *
 * ONE AUTHORITY, ONE MATCHER. Nothing here decides membership. The pinned
 * registry (`loadEvaluationCohortRegistry`) and the matcher
 * (`evaluateCohortMembership`) are the classifier guard's own exported
 * functions, imported unchanged: same four SHA-256-pinned artifacts, same
 * exact `eche_row_key` + organisation-id matching. This module adds only what
 * research needs on top: the requested organisation's identity, the identity
 * every planned ROOT is bound to, its OWN eligibility policy over the
 * matcher's verdict, and a generic refusal.
 *
 * PROTECTION IS NOT ELIGIBILITY (B3.0-R1). The matcher answers two different
 * questions at once, and research keeps them apart:
 *   - PROTECTED MEMBERSHIP. `buildEvaluationCohortRegistry` refuses to load
 *     unless every protected key is a frame key, so for an EXACT key or
 *     organisation id the matcher's PROTECTED / CONFLICT verdicts are
 *     complete: a protected key under a re-ingested id, or a protected id
 *     under another key, is caught whether or not the request is a frame
 *     member. Both collapse to `COHORT_INELIGIBLE`.
 *   - RESEARCH IDENTITY. The ONLY identity authority the Engine holds is the
 *     frame's own key -> organisation-id binding over the one ECHE artifact
 *     it was built from. An organisation outside it reaches
 *     EVALUATION_COHORT_IDENTITY_UNVERIFIED only AFTER the protection checks
 *     found nothing; that is not a protection verdict, and research reports it
 *     as `RESEARCH_IDENTITY_AUTHORITY_ABSENT`, never as `COHORT_INELIGIBLE`.
 *     It is still a REFUSAL: absence from the frame proves neither protection
 *     nor permission. Exact matching cannot see a protected institution that
 *     reappears under a NEW source-row key (a changed PIC or Erasmus code in a
 *     later ECHE artifact), and `nwf_research` cannot read ingest provenance,
 *     so no independent authority establishes an outside-frame identity.
 *     Admitting one needs a separately approved identity contract (an
 *     ECHE-successor identity authority, or a B2 contract for organisations
 *     ECHE does not publish) - never a default here.
 *
 * TWO ENFORCEMENT POINTS, ONE IMPLEMENTATION.
 *   - `planOrganisationResearch` - the organisation-level plan. Called by
 *     `runOrganisationDiscovery` BEFORE `startRun`, and by the CLI dry run.
 *     It resolves the exact roots the execution will use; the orchestrator
 *     then executes THAT frozen list and never re-queries, so a claim or a
 *     promotion appended after the check cannot join the run.
 *   - `enforceRootResearchEligibility` - the per-root check. Called by
 *     `runRootAcquisition` immediately after it resolves its root and before
 *     any request, so an internal caller that reaches the root runner without
 *     the organisation-level plan is refused too.
 *
 * FAIL-CLOSED. Unverifiable cohort metadata (missing, altered, malformed or
 * unreadable artifact), an organisation that does not exist, a requested key
 * that is not the organisation's own, a root bound to another organisation,
 * a duplicated root reference, any matcher verdict other than ALLOWED, and
 * ANY unexpected error all refuse. There is no override, no flag, no
 * environment variable and no identity that is exempt.
 *
 * NO DISCLOSURE. A refusal carries a stable code, one of four kinds and a
 * fixed reason - never an organisation name, a protected key, a cohort or
 * split name, or artifact content. Every protection-bearing verdict
 * (protected, or conflicting with the artifacts - which is how a protected
 * key under a re-ingested id surfaces) collapses to ONE reason,
 * `COHORT_INELIGIBLE`. `RESEARCH_IDENTITY_AUTHORITY_ABSENT` is reachable only
 * when neither the organisation nor any key its run names is protected or
 * conflicting, and every protected key is a frame key, so it says only that
 * the key is outside the frame (the public ECHE source row set) - never which
 * cohort anything is in. The database-only identity checks run BEFORE the
 * matcher, so whether a request fails as an identity conflict never depends
 * on cohort membership.
 *
 * Reads only: the pinned files, `organisations`, `website_claims`, the
 * promotion chain and (per root) the run's own fetch-evidence keys. Opens no
 * socket and writes nothing.
 */
import type pg from 'pg';
import {
  evaluateCohortMembership,
  loadCohortSubject,
  loadEvaluationCohortRegistry,
  type CohortSubject,
  type EvaluationCohortRegistry,
  type RegistryLoadResult,
} from '../classify/evaluationCohortGuard.js';
import {
  resolveRoot,
  WebGatewayRefusal,
  type ResolvedRoot,
  type RootAuthorityRef,
} from '../web/authority.js';

/** The ONE operational code every research cohort refusal carries. */
export const RESEARCH_COHORT_REFUSAL_CODE = 'RESEARCH_COHORT_GUARD_REFUSED';

export type ResearchCohortRefusalKind =
  'PROTECTED_OR_INELIGIBLE' | 'AUTHORITY_UNAVAILABLE' | 'IDENTITY_CONFLICT' | 'IDENTITY_UNVERIFIED';

export type ResearchCohortRefusalReason =
  /** A PROTECTED or CONFLICT matcher verdict. Deliberately undifferentiated. */
  | 'COHORT_INELIGIBLE'
  /**
   * No protected or conflicting identity matched, but the organisation is
   * outside the only identity authority that exists (the frame binding), so
   * its research identity cannot be verified. Not a protection verdict.
   */
  | 'RESEARCH_IDENTITY_AUTHORITY_ABSENT'
  /** The pinned cohort artifacts could not be read or verified. */
  | 'COHORT_METADATA_UNVERIFIED'
  /** Anything unexpected while deciding. Never treated as "not protected". */
  | 'GUARD_INTERNAL_ERROR'
  | 'ORGANISATION_NOT_FOUND'
  /** The requested `eche_row_key` is not the organisation's own. */
  | 'ORGANISATION_KEY_MISMATCH'
  /** A root's stored authority names no single organisation. */
  | 'ROOT_ORGANISATION_UNRESOLVED'
  /** A planned root's stored authority names a different `eche_row_key`. */
  | 'ROOT_NAMES_OTHER_ORGANISATION'
  /** A root's stored `organisation_id` is a different organisation. */
  | 'ROOT_ORGANISATION_MISMATCH'
  | 'DUPLICATE_ROOT_REFERENCE';

const KIND_OF_REASON: Readonly<Record<ResearchCohortRefusalReason, ResearchCohortRefusalKind>> =
  Object.freeze({
    COHORT_INELIGIBLE: 'PROTECTED_OR_INELIGIBLE',
    RESEARCH_IDENTITY_AUTHORITY_ABSENT: 'IDENTITY_UNVERIFIED',
    COHORT_METADATA_UNVERIFIED: 'AUTHORITY_UNAVAILABLE',
    GUARD_INTERNAL_ERROR: 'AUTHORITY_UNAVAILABLE',
    ORGANISATION_NOT_FOUND: 'IDENTITY_CONFLICT',
    ORGANISATION_KEY_MISMATCH: 'IDENTITY_CONFLICT',
    ROOT_ORGANISATION_UNRESOLVED: 'IDENTITY_CONFLICT',
    ROOT_NAMES_OTHER_ORGANISATION: 'IDENTITY_CONFLICT',
    ROOT_ORGANISATION_MISMATCH: 'IDENTITY_CONFLICT',
    DUPLICATE_ROOT_REFERENCE: 'IDENTITY_CONFLICT',
  });

/**
 * A research request that will not be executed. Thrown before any run row,
 * DNS lookup, HTTP request or evidence write. Its message and `toJSON()` hold
 * only the code, kind and reason; an unexpected underlying error is kept as
 * `cause` for in-process diagnosis and is never part of either.
 */
export class ResearchCohortRefusal extends Error {
  readonly code = RESEARCH_COHORT_REFUSAL_CODE;
  readonly kind: ResearchCohortRefusalKind;
  readonly reason: ResearchCohortRefusalReason;

  constructor(reason: ResearchCohortRefusalReason, options?: { cause?: unknown }) {
    const kind = KIND_OF_REASON[reason];
    super(
      `${RESEARCH_COHORT_REFUSAL_CODE}: ${kind} (${reason}). Refused before any network ` +
        'request or research-evidence write.',
      options,
    );
    this.name = 'ResearchCohortRefusal';
    this.kind = kind;
    this.reason = reason;
  }

  toJSON(): {
    code: typeof RESEARCH_COHORT_REFUSAL_CODE;
    kind: ResearchCohortRefusalKind;
    reason: ResearchCohortRefusalReason;
  } {
    return { code: this.code, kind: this.kind, reason: this.reason };
  }
}

export interface ResearchCohortGuardDeps {
  /**
   * Loads and verifies the pinned evaluation-cohort metadata. Omitted means
   * the committed, SHA-256-pinned artifacts of the Engine checkout this
   * module runs from - exactly the classifier's default. Tests pass a
   * synthetic loader; no production module may pass one (pinned by
   * `phase2bResearchCohortGuard.firewall.test.ts`).
   */
  readonly loadCohortRegistry?: () => RegistryLoadResult;
}

/** How a planned root is named. An ID, never a URL. */
export interface OrganisationRootRef {
  readonly kind: 'WEBSITE_CLAIM' | 'ROOT_PROMOTION';
  readonly id: string;
  readonly sourceLabel: string;
}

export interface ResearchRootPlanEntry {
  readonly ref: OrganisationRootRef;
  /**
   * The URL the stored authority names, or null when the root cannot be
   * resolved at all. An unresolvable root reaches no network: the root runner
   * refuses it again and reports INVALID_ROOT_AUTHORITY with zero requests,
   * exactly as it did before this guard existed.
   */
  readonly url: string | null;
}

/** The exact, frozen root set one eligible organisation's run will execute. */
export interface ResearchExecutionPlan {
  readonly organisationId: string;
  readonly echeRowKey: string;
  readonly roots: readonly ResearchRootPlanEntry[];
}

export interface ResearchRequest {
  readonly organisationId: string;
  readonly echeRowKey: string;
}

/** Converts every unexpected failure into a refusal: an error is never permission. */
async function guarded<T>(decide: () => Promise<T>): Promise<T> {
  try {
    return await decide();
  } catch (error) {
    if (error instanceof ResearchCohortRefusal) throw error;
    throw new ResearchCohortRefusal('GUARD_INTERNAL_ERROR', { cause: error });
  }
}

/** Org-independent, so it runs first: its outcome reveals nothing about one organisation. */
function loadVerifiedCohortRegistry(deps: ResearchCohortGuardDeps): EvaluationCohortRegistry {
  const result = (deps.loadCohortRegistry ?? loadEvaluationCohortRegistry)();
  if (!result.ok) {
    throw new ResearchCohortRefusal('COHORT_METADATA_UNVERIFIED', {
      cause: new Error(result.detail),
    });
  }
  return result.registry;
}

export type ResearchEligibilityDecision =
  | { readonly eligible: true }
  | {
      readonly eligible: false;
      readonly reason: 'COHORT_INELIGIBLE' | 'RESEARCH_IDENTITY_AUTHORITY_ABSENT';
    };

/**
 * RESEARCH ELIGIBILITY POLICY V1. PURE. The classifier's matcher, unchanged,
 * read through research's own policy. EXHAUSTIVE over the verdict kinds: a
 * verdict kind added to the classifier later fails to compile here rather
 * than falling through to permission. ELIGIBLE only for ALLOWED, i.e. a
 * frame-verified identity that is in no protected list and names no
 * protected organisation through its run's evidence.
 */
export function decideResearchEligibility(
  registry: EvaluationCohortRegistry,
  subject: CohortSubject,
): ResearchEligibilityDecision {
  const verdict = evaluateCohortMembership(registry, subject);
  switch (verdict.kind) {
    case 'ALLOWED':
      return { eligible: true };
    case 'EVALUATION_COHORT_PROTECTED':
    case 'EVALUATION_COHORT_CONFLICT':
      return { eligible: false, reason: 'COHORT_INELIGIBLE' };
    case 'EVALUATION_COHORT_IDENTITY_UNVERIFIED':
      return { eligible: false, reason: 'RESEARCH_IDENTITY_AUTHORITY_ABSENT' };
    default: {
      const unhandled: never = verdict;
      throw new Error(`unhandled cohort verdict: ${JSON.stringify(unhandled)}`);
    }
  }
}

function applyResearchEligibilityPolicy(
  registry: EvaluationCohortRegistry,
  subject: CohortSubject,
): void {
  const decision = decideResearchEligibility(registry, subject);
  if (!decision.eligible) throw new ResearchCohortRefusal(decision.reason);
}

/** A resolved root must be bound to the requested organisation and to no other. */
function checkRootBinding(request: ResearchRequest, root: ResolvedRoot): void {
  if (root.echeRowKey !== request.echeRowKey) {
    throw new ResearchCohortRefusal('ROOT_NAMES_OTHER_ORGANISATION');
  }
  if (root.organisationId !== null && root.organisationId !== request.organisationId) {
    throw new ResearchCohortRefusal('ROOT_ORGANISATION_MISMATCH');
  }
}

export function toRootAuthorityRef(ref: OrganisationRootRef): RootAuthorityRef {
  return ref.kind === 'WEBSITE_CLAIM'
    ? { kind: 'WEBSITE_CLAIM', websiteClaimId: ref.id }
    : { kind: 'ROOT_PROMOTION', promotionId: ref.id };
}

/**
 * Every STRUCTURALLY_VALID website claim for `echeRowKey`, each an
 * independent root - never deduplicated or merged even when two claims
 * normalise to similar URLs (spec "root processing").
 */
async function findOrganisationClaimRoots(
  pool: pg.Pool,
  echeRowKey: string,
): Promise<OrganisationRootRef[]> {
  const { rows } = await pool.query<{ id: string; source_kind: string }>(
    `SELECT id, source_kind FROM website_claims
      WHERE eche_row_key = $1 AND structural_status = 'STRUCTURALLY_VALID'
      ORDER BY source_kind, id`,
    [echeRowKey],
  );
  return rows.map((row) => ({
    kind: 'WEBSITE_CLAIM' as const,
    id: row.id,
    sourceLabel: `claim:${row.source_kind}`,
  }));
}

/**
 * Every LIVE (approved, not revoked) root promotion for `echeRowKey`,
 * reached through the redirect observation -> fetch observation chain, since
 * a promotion carries no `eche_row_key` of its own (ADR 0004 s7: it stores
 * no URL and no organisation link of its own; the referenced observation
 * supplies both).
 */
async function findOrganisationPromotionRoots(
  pool: pg.Pool,
  echeRowKey: string,
): Promise<OrganisationRootRef[]> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT DISTINCT p.id
       FROM orgunit_root_promotions p
       JOIN orgunit_redirect_observations r ON r.id = p.redirect_observation_id
       JOIN orgunit_fetch_observations f    ON f.id = r.fetch_observation_id
      WHERE f.eche_row_key = $1
        AND NOT EXISTS (
          SELECT 1 FROM orgunit_root_promotion_revocations v WHERE v.promotion_id = p.id
        )
      ORDER BY p.id`,
    [echeRowKey],
  );
  return rows.map((row) => ({
    kind: 'ROOT_PROMOTION' as const,
    id: row.id,
    sourceLabel: 'promotion',
  }));
}

/**
 * THE ORGANISATION-LEVEL GUARD. Resolves the requested organisation and the
 * exact roots a run for it would use, verifies every root's stored identity
 * binding, then asks the pinned matcher. Returns a frozen plan only when the
 * organisation is ELIGIBLE; otherwise throws `ResearchCohortRefusal`.
 *
 * The plan is a description, never an authorisation: no function accepts it
 * back, and `runOrganisationDiscovery` always computes its own.
 */
export async function planOrganisationResearch(
  pool: pg.Pool,
  request: ResearchRequest,
  deps: ResearchCohortGuardDeps = {},
): Promise<ResearchExecutionPlan> {
  return guarded(async () => {
    const registry = loadVerifiedCohortRegistry(deps);

    const org = await pool.query<{ id: string; eche_row_key: string }>(
      `SELECT id, eche_row_key FROM organisations WHERE id = $1`,
      [request.organisationId],
    );
    const row = org.rows[0];
    if (row === undefined || org.rows.length !== 1) {
      throw new ResearchCohortRefusal('ORGANISATION_NOT_FOUND');
    }
    if (row.id !== request.organisationId || row.eche_row_key !== request.echeRowKey) {
      throw new ResearchCohortRefusal('ORGANISATION_KEY_MISMATCH');
    }
    const subject: ResearchRequest = { organisationId: row.id, echeRowKey: row.eche_row_key };

    const refs = [
      ...(await findOrganisationClaimRoots(pool, subject.echeRowKey)),
      ...(await findOrganisationPromotionRoots(pool, subject.echeRowKey)),
    ];
    const seen = new Set<string>();
    const roots: ResearchRootPlanEntry[] = [];
    for (const ref of refs) {
      const identity = `${ref.kind}:${ref.id}`;
      if (seen.has(identity)) throw new ResearchCohortRefusal('DUPLICATE_ROOT_REFERENCE');
      seen.add(identity);
      let resolved: ResolvedRoot | null = null;
      try {
        resolved = await resolveRoot(pool, toRootAuthorityRef(ref));
      } catch (error) {
        if (!(error instanceof WebGatewayRefusal)) throw error;
      }
      if (resolved !== null) checkRootBinding(subject, resolved);
      roots.push(
        Object.freeze({ ref: Object.freeze({ ...ref }), url: resolved?.rootUrl.url ?? null }),
      );
    }

    applyResearchEligibilityPolicy(registry, { ...subject, runEcheRowKeys: [] });

    return Object.freeze({ ...subject, roots: Object.freeze(roots) });
  });
}

/**
 * THE PER-ROOT GUARD, for `runRootAcquisition`. Knows only the root it was
 * handed and the run it would write into, so it derives the subject from the
 * root's OWN stored authority: the one organisation holding the root's
 * `eche_row_key`, cross-checked against the root's `organisation_id` when one
 * is recorded, plus every key the run's existing fetch evidence already names
 * (the classifier's own `loadCohortSubject`). Throws `ResearchCohortRefusal`.
 */
export async function enforceRootResearchEligibility(
  pool: pg.Pool,
  runId: string,
  root: ResolvedRoot,
  deps: ResearchCohortGuardDeps = {},
): Promise<void> {
  await guarded(async () => {
    const registry = loadVerifiedCohortRegistry(deps);

    const owners = await pool.query<{ id: string }>(
      `SELECT id FROM organisations WHERE eche_row_key = $1`,
      [root.echeRowKey],
    );
    const owner = owners.rows[0];
    if (owner === undefined || owners.rows.length !== 1) {
      throw new ResearchCohortRefusal('ROOT_ORGANISATION_UNRESOLVED');
    }
    if (root.organisationId !== null && root.organisationId !== owner.id) {
      throw new ResearchCohortRefusal('ROOT_ORGANISATION_MISMATCH');
    }
    const subject = await loadCohortSubject(pool, owner.id, runId);
    if (subject === null || subject.echeRowKey !== root.echeRowKey) {
      throw new ResearchCohortRefusal('ROOT_ORGANISATION_UNRESOLVED');
    }

    applyResearchEligibilityPolicy(registry, subject);
  });
}
