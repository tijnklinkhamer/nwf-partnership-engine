/**
 * WW E-W - THE RESEARCH_PENDING STAGE (ADR 0030 s4): research admission BY
 * CAMPAIGN, then the EXISTING subject research path.
 *
 * Admission (`subject-research-admission-policy-campaign-v1`, migration 0024)
 * - the narrowest basis that lets a campaign research what it proposed:
 *   - the worker already holds a `CampaignAuthority` derived from the VERIFIED
 *     OWNER signature, and claimed this item only because the signed campaign
 *     lists RESEARCH_PENDING and its reservation (one root, 60 gateway
 *     requests) fit the signed budget;
 *   - the subject was proposed inside THIS campaign (the binding row);
 *   - the root is the subject's own SOURCE_STATED website claim, which must be
 *     https, on the nominated registrable domain, and pass the nomination
 *     gates again (no service or social host);
 *   - the database re-checks all of that, the research-root budget and "no
 *     other live admission" on INSERT; it records the campaign and the work
 *     item by foreign key;
 *   - the existing subject guard then refuses, before any request, a
 *     TEST_ONLY campaign outside vitest, a changed protected-cohort registry,
 *     and a root on any ECHE / promoted domain (domain isolation).
 *
 * Research: `verifySubjectAdmission` + `runSubjectResearch`, unchanged - the
 * frozen 35/60/8 budgets, robots, the one gateway, redaction, page evidence,
 * candidates. Off-domain link-outs are captured as PAGE_LINK_OUT nominations
 * (never fetched) and, when the campaign lists LINK_OUT, become ONE new
 * LINK_OUT root in the same campaign.
 *
 * IDEMPOTENT: a retried attempt finds the research run of the admission its
 * earlier attempt recorded and does not research again.
 *
 * Production transport is the real gateway (`deps.research` is empty), so
 * nothing here can fetch without a verifying campaign; tests inject a
 * scripted transport.
 */
import type pg from 'pg';

import {
  enqueueCampaignLinkOutRoot,
  inWorkerTransaction,
  type StageHandler,
  type StageHandlerContext,
  type StageOutcome,
  type WorkItemView,
} from '../acquisition/index.js';
import { loadEvaluationCohortRegistry } from '../classify/evaluationCohortGuard.js';
import { protectedRegistryDigest } from '../subjectAdmission/registryDigest.js';
import { verifySubjectAdmission } from '../subjectRun/admission.js';
import { executionRefusalCodeOf, runSubjectResearch } from '../subjectRun/execute.js';
import { hostOf, hostOnDomain, type WiringDeps } from './context.js';
import { prepareNomination } from './sourceDiscoveryPort.js';
import {
  CampaignAdmissionRefused,
  alreadyReported,
  loadCampaignSubject,
  recordCampaignAdmission,
  supersedeCampaignAdmission,
} from './records.js';
import { admissionReadOf } from './registryBridge.js';

const STALE = /STALE/;
/**
 * WW acceptance fix: the campaign stopped standing behind this item WHILE it ran - a PAUSE
 * or STOP (H-ACQ P1-1 ends in-flight research at its next request), or the item's attempt
 * was superseded. That is an interruption, never a verdict on the subject: the item is
 * retried (on RESUME), not refused for good. A retried attempt that already has a run
 * advances with what that run captured (research never runs twice per admission).
 */
const INTERRUPTED =
  /CAMPAIGN_NOT_RUNNING|CAMPAIGN_ITEM_NOT_IN_FLIGHT|needs a RUNNING campaign|has no in-flight claim/;
const retryable = (code: string): boolean => STALE.test(code) || INTERRUPTED.test(code);

interface PriorRun {
  admission_id: string;
  revoked: boolean;
  run_id: string | null;
}

async function priorAdmissions(readonly: pg.Pool, workItemId: string): Promise<PriorRun[]> {
  const { rows } = await readonly.query<PriorRun>(
    `SELECT a.id AS admission_id, r.id AS run_id,
            EXISTS (SELECT 1 FROM subject_research_admission_revocations v
                     WHERE v.admission_id = a.id) AS revoked
       FROM subject_research_admissions a
       LEFT JOIN orgunit_research_runs r ON r.root_scope = 'subject_admission:' || a.id::text
      WHERE a.campaign_work_item_id = $1
      ORDER BY a.admitted_at, a.id, r.started_at, r.id`,
    [workItemId],
  );
  return rows;
}

/** Page evidence captured under these runs (what an interrupted run kept). */
async function pagesCapturedBy(readonly: pg.Pool, runIds: readonly string[]): Promise<number> {
  if (runIds.length === 0) return 0;
  const { rows } = await readonly.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM orgunit_page_evidence p
       JOIN orgunit_fetch_observations f ON f.id = p.fetch_observation_id
      WHERE f.run_id = ANY($1::uuid[])`,
    [runIds],
  );
  return rows[0]!.n;
}

async function gatewayRequestsOf(readonly: pg.Pool, runIds: readonly string[]): Promise<number> {
  if (runIds.length === 0) return 0;
  const { rows } = await readonly.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM orgunit_fetch_observations WHERE run_id = ANY($1::uuid[])`,
    [runIds],
  );
  return rows[0]!.n;
}

/**
 * Reports what this item's research actually spent, minus what earlier
 * outcomes already reported. WW H-ACQ (P1-2): called exactly once per
 * attempt, in `finally`, over every run of the item's admissions - so an
 * exception, a refusal or an emergency stop still reports what was fetched.
 * The database no longer depends on it: `acquisition_campaign_spend`
 * (migration 0026) counts the observations themselves.
 */
async function reportSpend(
  deps: WiringDeps,
  item: WorkItemView,
  ctx: StageHandlerContext,
  runIds: readonly string[],
): Promise<void> {
  const reported = await alreadyReported(deps.pools.worker, item.id);
  const roots = runIds.length > 0 ? 1 : 0;
  const requests = await gatewayRequestsOf(deps.pools.readonly, runIds);
  const r = Math.min(Math.max(0, roots - reported.researchRoots), ctx.remaining.researchRoots);
  const g = Math.min(
    Math.max(0, requests - reported.gatewayRequests),
    ctx.remaining.gatewayRequests,
  );
  if (r > 0) ctx.consume('researchRoots', r);
  if (g > 0) ctx.consume('gatewayRequests', g);
}

async function linkOutRoot(
  deps: WiringDeps,
  item: WorkItemView,
  ctx: StageHandlerContext,
  runId: string,
): Promise<void> {
  const { rows } = await deps.pools.readonly.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM source_discovery_nominations n
       JOIN source_discovery_runs r ON r.id = n.discovery_run_id
      WHERE r.run_kind = 'PAGE_LINK_OUT' AND r.research_run_id = $1`,
    [runId],
  );
  if (rows[0]!.n === 0) return;
  // WW H-ACQ (P2-5): never deeper than the SIGNED link-out depth (v1: one
  // hop). The database refuses it too (LINK_OUT_HOP_LIMIT, migration 0026);
  // asking first keeps a refused root from failing the attempt.
  const { rows: hops } = await inWorkerTransaction(deps.pools.worker, (c) =>
    c.query<{ hop: number | null }>('SELECT acquisition_link_out_hop_of_run($1) AS hop', [runId]),
  );
  const hop = hops[0]?.hop ?? null;
  if (hop === null || hop > ctx.campaign.scope.linkOutMaxHops) return;
  await enqueueCampaignLinkOutRoot(
    deps.pools.worker,
    { campaignId: item.campaignId, scope: ctx.campaign.scope },
    runId,
  );
}

async function websiteClaimId(
  readonly: pg.Pool,
  subjectId: string,
  url: string,
): Promise<string | null> {
  const { rows } = await readonly.query<{ id: string }>(
    `SELECT id FROM discovery_subject_identity_claims
      WHERE subject_id = $1 AND claim_kind = 'PUBLIC_WEBSITE' AND claim_basis = 'SOURCE_STATED'
        AND website_url = $2
      ORDER BY created_at, id LIMIT 1`,
    [subjectId, url],
  );
  return rows[0]?.id ?? null;
}

const runsOf = (prior: readonly PriorRun[]): string[] =>
  prior.flatMap((p) => (p.run_id === null ? [] : [p.run_id]));

export function researchPendingHandler(deps: WiringDeps): StageHandler {
  return {
    stage: 'RESEARCH_PENDING',
    async handle(item, ctx): Promise<StageOutcome> {
      // P1-2: whatever happens - an outcome, a refusal, an exception - report
      // what this item's runs fetched, exactly once per attempt.
      const report = async (): Promise<void> => {
        const runs = runsOf(await priorAdmissions(deps.pools.readonly, item.id));
        await reportSpend(deps, item, ctx, runs);
      };
      let outcome: StageOutcome;
      try {
        outcome = await researchOnce(deps, item, ctx);
      } catch (error) {
        // The original error wins; the database counts the observations anyway.
        await report().catch(() => undefined);
        throw error;
      }
      await report();
      return outcome;
    },
  };
}

async function researchOnce(
  deps: WiringDeps,
  item: WorkItemView,
  ctx: StageHandlerContext,
): Promise<StageOutcome> {
  const { readonly, worker, research } = deps.pools;
  // 1. A retried attempt never researches twice: a prior run that captured pages is the
  //    research (an interrupted one advances with what it kept). A prior run that captured
  //    NOTHING (cut off by a PAUSE before its first page) is superseded below and re-run.
  const prior = await priorAdmissions(readonly, item.id);
  const priorRuns = runsOf(prior);
  if (priorRuns.length > 0 && (await pagesCapturedBy(readonly, priorRuns)) > 0) {
    await linkOutRoot(deps, item, ctx, priorRuns[0]!);
    return { kind: 'ADVANCED', next: 'RESEARCHED' };
  }
  const live = prior.filter((p) => !p.revoked);

  // 2. The campaign's own proposal, and its root.
  const binding = await loadCampaignSubject(worker, item.campaignId, item.subjectId);
  if (binding === null || binding.registrableDomain !== item.registrableDomain) {
    return { kind: 'REFUSED', reason: 'NOT_ADMISSIBLE' };
  }
  const url = binding.nominatedUrl;
  const host = hostOf(url);
  const gate = prepareNomination({ url, title: null, snippet: null });
  if (
    !url.startsWith('https://') ||
    host === null ||
    !hostOnDomain(host, binding.registrableDomain) ||
    !gate.ok ||
    gate.value.registrableDomain !== binding.registrableDomain
  ) {
    return { kind: 'REFUSED', reason: 'POLICY_REFUSED' };
  }
  const claimId = await websiteClaimId(readonly, item.subjectId, url);
  if (claimId === null) return { kind: 'REFUSED', reason: 'NOT_ADMISSIBLE' };

  // 3. The CAMPAIGN admission: recorded now, or reused if an earlier attempt recorded it.
  const admit = async (): Promise<StageOutcome | null> => {
    const cohort = (deps.research.loadCohortRegistry ?? loadEvaluationCohortRegistry)();
    if (!cohort.ok) return { kind: 'RETRY', reason: 'DEPENDENCY_NOT_READY', retryable: true };
    const snapshot = await admissionReadOf(readonly, item.subjectId);
    if (snapshot === null) return { kind: 'REFUSED', reason: 'SUBJECT_NOT_FOUND' };
    try {
      await recordCampaignAdmission(worker, {
        item,
        subjectId: item.subjectId,
        identityClaimId: claimId,
        websiteUrl: url,
        trustScope: deps.campaignTrustScope,
        subjectStateDigest: snapshot.subjectStateDigest,
        protectedRegistryDigest: protectedRegistryDigest(cohort.registry),
        registryFingerprint: snapshot.registryFingerprint,
      });
    } catch (error) {
      if (error instanceof CampaignAdmissionRefused) {
        return INTERRUPTED.test(error.reason)
          ? { kind: 'RETRY', reason: 'DEPENDENCY_NOT_READY', retryable: true }
          : { kind: 'REFUSED', reason: 'POLICY_REFUSED' };
      }
      throw error;
    }
    return null;
  };
  if (live.length === 0) {
    const refused = await admit();
    if (refused !== null) return refused;
  } else if (priorRuns.length > 0) {
    // WW acceptance (migration 0028): the earlier attempt's run captured nothing.
    await supersedeCampaignAdmission(worker, live[live.length - 1]!.admission_id);
    const refused = await admit();
    if (refused !== null) return refused;
  }

  // 4. The existing research path, unchanged.
  let verified = await verifySubjectAdmission(research, item.subjectId, deps.research);
  if (
    verified.outcome !== 'VERIFIED' &&
    live.length > 0 &&
    priorRuns.length === 0 &&
    STALE.test(verified.detail)
  ) {
    // WW acceptance (migration 0028): an earlier attempt's admission, never used, went stale
    // (the registry changed before its run started: the OWNER's review, a PAUSE, a crash). It
    // can never verify again; supersede it and admit afresh over the current registry - the
    // new admission counts against the signed research-root budget.
    await supersedeCampaignAdmission(worker, live[live.length - 1]!.admission_id);
    const refused = await admit();
    if (refused !== null) return refused;
    verified = await verifySubjectAdmission(research, item.subjectId, deps.research);
  }
  if (verified.outcome !== 'VERIFIED') {
    return retryable(verified.detail)
      ? { kind: 'RETRY', reason: 'DEPENDENCY_NOT_READY', retryable: true }
      : { kind: 'REFUSED', reason: 'POLICY_REFUSED' };
  }
  let runId: string;
  try {
    const result = await runSubjectResearch(
      research,
      verified.admission,
      { networkVantage: deps.networkVantage, linkOutPool: deps.pools.sourceDiscovery },
      deps.research,
    );
    runId = result.runId;
    // A PAUSE / STOP / superseded attempt cut this run off: an interruption, retried (the
    // retry keeps what the run captured, or re-runs if it captured nothing).
    if (
      result.summary?.terminalReason === 'ROOT_REQUEST_REFUSED' &&
      INTERRUPTED.test(result.summary.refusalDetail ?? '')
    ) {
      return { kind: 'RETRY', reason: 'DEPENDENCY_NOT_READY', retryable: true };
    }
  } catch (error) {
    const code = executionRefusalCodeOf(error);
    if (code === null) throw error;
    return retryable(code)
      ? { kind: 'RETRY', reason: 'DEPENDENCY_NOT_READY', retryable: true }
      : { kind: 'REFUSED', reason: 'POLICY_REFUSED' };
  }
  await linkOutRoot(deps, item, ctx, runId);
  return { kind: 'ADVANCED', next: 'RESEARCHED' };
}
