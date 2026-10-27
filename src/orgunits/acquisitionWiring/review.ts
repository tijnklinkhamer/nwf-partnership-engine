/**
 * WW E-W - THE BATCHED OWNER IDENTITY REVIEW OF A CAMPAIGN (ADR 0030 s5).
 *
 *   listAwaitingReview  - every subject of ONE campaign whose IDENTITY_REVIEW
 *                         item is AWAITING_HUMAN and not yet released: its
 *                         name and kind CLAIMS and stated country (claims, never
 *                         verdicts), root URL, an evidence summary, the v2
 *                         export's research-status counts and the campaign's
 *                         duplicate signals on its domain. Read-only.
 *   signCampaignReviews - for EACH subject the OWNER listed explicitly, and
 *                         ONLY while it still reads at the state digest the
 *                         OWNER confirmed with `--expect` (WW H-ACQ P2-4): sign
 *                         and append the existing ADR 0023 OWNER-attested
 *                         CONFIRMED review (`reviewBridge.ts`), then release
 *                         the item to ASSESSABLE on the OWNER PATH. One
 *                         passphrase per batch (the caller decrypts the key
 *                         once). A subject that is not awaiting review in
 *                         this campaign is refused before anything is signed.
 *
 * There is no "all" form and no auto-approval: an unlisted subject is never
 * reviewed, and the review trust set is EMPTY in production.
 *
 * Opens no socket.
 */
import type pg from 'pg';

import { releaseIdentityReviewItem } from '../acquisition/index.js';
import {
  countryMentionsOf,
  recordCountryStatement,
  type CountryMention,
  type CountryStatement,
} from './countryMentions.js';
import { exportQualificationInputV2 } from './exportPort.js';
import {
  readSubjectReviewState,
  signAndAppendSubjectReview,
  type OwnerSigningKey,
  type OwnerReviewTrust,
} from './reviewBridge.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const REVIEW_BATCH_MAX_SUBJECTS = 50;

export interface AwaitingReviewEntry {
  readonly workItemId: string;
  readonly subjectId: string;
  /**
   * WW H-ACQ (P2-4): the subject's current identity-review head and state
   * digest, exactly as `review sign --expect <subjectId>=<stateDigest>` must
   * name them. A sign whose expectation differs is refused before signing.
   */
  readonly reviewHead: string | null;
  readonly stateDigest: string;
  readonly registrableDomain: string | null;
  readonly names: readonly string[];
  readonly registeredKind: string;
  readonly claimedKinds: readonly string[];
  /** From the v2 export (ADR 0024): a SOURCE_STATED country or UNKNOWN; never inferred. */
  readonly country: { readonly value: string | null; readonly standing: string };
  readonly rootUrl: string | null;
  readonly evidence: {
    readonly researchRuns: number;
    readonly completedRuns: number;
    readonly fetchObservations: number;
    readonly pageEvidence: number;
    readonly pageCandidates: number;
  };
  readonly researchStatusCounts: Readonly<Record<string, number>>;
  readonly duplicateSignals: readonly {
    readonly kind: string;
    readonly relatedKind: string | null;
  }[];
  /**
   * WW H-ACQ (lead addendum): at most three lines of the subject's OWN
   * captured pages that name an assigned country - mentions to read, never a
   * suggestion. `review sign --country <subjectId>=<CC>@<pageEvidenceId>`
   * may cite one to record the OWNER's statement of what that source says.
   */
  readonly countryMentions: readonly CountryMention[];
}

interface AwaitingRow {
  work_item_id: string;
  subject_id: string;
  registrable_domain: string | null;
}

async function awaitingRows(readonly: pg.Pool, campaignId: string): Promise<AwaitingRow[]> {
  const { rows } = await readonly.query<AwaitingRow>(
    `SELECT s.work_item_id, s.subject_id, s.registrable_domain
       FROM acquisition_work_item_states s
      WHERE s.campaign_id = $1 AND s.stage = 'IDENTITY_REVIEW' AND s.state = 'AWAITING_HUMAN'
        AND s.human_queue = 'OWNER_IDENTITY_REVIEW'
        AND NOT EXISTS (SELECT 1 FROM acquisition_work_items c WHERE c.parent_item_id = s.work_item_id)
      ORDER BY s.created_at, s.work_item_id`,
    [campaignId],
  );
  return rows;
}

export async function listAwaitingReview(
  readonly: pg.Pool,
  campaignId: string,
  trust: OwnerReviewTrust,
): Promise<readonly AwaitingReviewEntry[]> {
  if (!UUID.test(campaignId)) return [];
  const out: AwaitingReviewEntry[] = [];
  for (const row of await awaitingRows(readonly, campaignId)) {
    const id = row.subject_id;
    const subject = await readonly.query<{ registered_kind: string }>(
      'SELECT registered_kind FROM discovery_subjects WHERE id = $1',
      [id],
    );
    const claims = await readonly.query<{
      claim_kind: string;
      name_text: string | null;
      claimed_kind: string | null;
      website_url: string | null;
    }>(
      `SELECT claim_kind, name_text, claimed_kind, website_url
         FROM discovery_subject_identity_claims WHERE subject_id = $1 ORDER BY created_at, id`,
      [id],
    );
    const evidence = await readonly.query<{
      runs: number;
      completed: number;
      fetches: number;
      pages: number;
      candidates: number;
    }>(
      `WITH runs AS (
         SELECT r.id FROM subject_research_admissions a
           JOIN orgunit_research_runs r ON r.root_scope = 'subject_admission:' || a.id::text
          WHERE a.subject_id = $1 AND a.campaign_id = $2)
       SELECT (SELECT count(*) FROM runs)::int AS runs,
              (SELECT count(*) FROM orgunit_research_run_completions c
                WHERE c.run_id IN (SELECT id FROM runs) AND c.terminal_state = 'COMPLETED')::int
                AS completed,
              (SELECT count(*) FROM orgunit_fetch_observations f
                WHERE f.run_id IN (SELECT id FROM runs))::int AS fetches,
              (SELECT count(*) FROM orgunit_page_evidence p
                 JOIN orgunit_fetch_observations f ON f.id = p.fetch_observation_id
                WHERE f.run_id IN (SELECT id FROM runs))::int AS pages,
              (SELECT count(*) FROM orgunit_page_candidates k
                WHERE k.run_id IN (SELECT id FROM runs))::int AS candidates`,
      [id, campaignId],
    );
    const signals = await readonly.query<{ signal_kind: string; related_kind: string | null }>(
      `SELECT DISTINCT signal_kind, related_kind FROM acquisition_signals
        WHERE campaign_id = $1 AND registrable_domain = $2 ORDER BY 1, 2`,
      [campaignId, row.registrable_domain],
    );
    const statusCounts: Record<string, number> = {};
    const doc = await exportQualificationInputV2(readonly, { subjectId: id, evaluatedAt: null });
    for (const entry of doc.researchStatus) {
      statusCounts[entry.status] = (statusCounts[entry.status] ?? 0) + 1;
    }
    const e = evidence.rows[0]!;
    const state = await readSubjectReviewState(readonly, id, trust);
    if (state === null) continue;
    out.push({
      workItemId: row.work_item_id,
      subjectId: id,
      reviewHead: state.head,
      stateDigest: state.stateDigest,
      registrableDomain: row.registrable_domain,
      names: claims.rows.flatMap((c) =>
        ['NAME', 'ALTERNATE_NAME', 'NATIVE_NAME'].includes(c.claim_kind) && c.name_text !== null
          ? [c.name_text]
          : [],
      ),
      registeredKind: subject.rows[0]?.registered_kind ?? 'UNKNOWN',
      claimedKinds: claims.rows.flatMap((c) =>
        c.claim_kind === 'ENTITY_KIND' && c.claimed_kind !== null ? [c.claimed_kind] : [],
      ),
      // The v2 export's ADR 0024 reading: a STATED country, or UNKNOWN / CONFLICTING.
      country: { value: doc.country.value, standing: doc.country.standing },
      rootUrl:
        claims.rows.find((c) => c.claim_kind === 'PUBLIC_WEBSITE' && c.website_url !== null)
          ?.website_url ?? null,
      evidence: {
        researchRuns: e.runs,
        completedRuns: e.completed,
        fetchObservations: e.fetches,
        pageEvidence: e.pages,
        pageCandidates: e.candidates,
      },
      researchStatusCounts: statusCounts,
      duplicateSignals: signals.rows.map((s) => ({
        kind: s.signal_kind,
        relatedKind: s.related_kind,
      })),
      countryMentions: await countryMentionsOf(readonly, id),
    });
  }
  return out;
}

export class ReviewBatchRefusal extends Error {
  constructor(
    readonly code:
      | 'SUBJECTS_REQUIRED'
      | 'TOO_MANY_SUBJECTS'
      | 'SUBJECT_ID_INVALID'
      | 'SUBJECT_REPEATED'
      | 'SUBJECT_NOT_AWAITING_REVIEW'
      | 'EXPECTATION_INVALID'
      | 'EXPECTATION_MISSING'
      | 'EXPECTATION_UNLISTED'
      | 'STATE_DIGEST_MISMATCH',
    readonly detail: string | null = null,
  ) {
    super(detail === null ? code : `${code}: ${detail}`);
    this.name = 'ReviewBatchRefusal';
  }
}

export interface ReviewBatchPools {
  readonly readonly: pg.Pool;
  /** A login holding nwf_discovery_subject_reviewer. */
  readonly reviewer: pg.Pool;
  /** The owner path (releases a reviewed item to ASSESSABLE). */
  readonly owner: pg.Pool;
  /** A login holding nwf_discovery_subject_writer; needed only for `--country`. */
  readonly writer?: pg.Pool;
}

export interface ReviewBatchResult {
  readonly subjectId: string;
  readonly workItemId: string;
  readonly outcome: 'REVIEWED_AND_RELEASED' | 'FAILED';
  readonly code: string | null;
  /**
   * The OWNER's `--country` statement for this subject, recorded AFTER its
   * review was appended and its item released: the claim id and the country,
   * or the writer's refusal code. Null when no statement was given.
   */
  readonly country: {
    readonly statedCountry: string;
    readonly pageEvidenceId: string;
    readonly claimId: string | null;
    readonly code: string | null;
  } | null;
}

const DIGEST = /^[0-9a-f]{64}$/;

/**
 * Parses repeated `--expect <subjectId>=<stateDigest>` values into a map.
 * A malformed or repeated expectation is refused.
 */
export function parseReviewExpectations(values: readonly string[]): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const v of values) {
    const m = v.match(/^([0-9a-f-]{36})=([0-9a-f]{64})$/);
    if (m === null || !UUID.test(m[1]!) || !DIGEST.test(m[2]!) || out.has(m[1]!)) {
      throw new ReviewBatchRefusal('EXPECTATION_INVALID', v.slice(0, 120));
    }
    out.set(m[1]!, m[2]!);
  }
  return out;
}

/**
 * Checks the batch BEFORE anything is signed: every listed subject must be
 * awaiting review here, and (WW H-ACQ P2-4) carry exactly one expectation
 * naming the state digest `review list` showed - which must still be the
 * subject's digest now. No expectation may name an unlisted subject.
 */
export async function planReviewBatch(
  readonly: pg.Pool,
  campaignId: string,
  subjectIds: readonly string[],
  expected: ReadonlyMap<string, string>,
  trust: OwnerReviewTrust,
): Promise<readonly AwaitingRow[]> {
  if (subjectIds.length === 0) throw new ReviewBatchRefusal('SUBJECTS_REQUIRED');
  if (subjectIds.length > REVIEW_BATCH_MAX_SUBJECTS) {
    throw new ReviewBatchRefusal('TOO_MANY_SUBJECTS', String(REVIEW_BATCH_MAX_SUBJECTS));
  }
  if (new Set(subjectIds).size !== subjectIds.length) {
    throw new ReviewBatchRefusal('SUBJECT_REPEATED');
  }
  const awaiting = await awaitingRows(readonly, campaignId);
  const rows = subjectIds.map((id) => {
    if (!UUID.test(id)) throw new ReviewBatchRefusal('SUBJECT_ID_INVALID', id);
    const row = awaiting.find((r) => r.subject_id === id);
    if (row === undefined) throw new ReviewBatchRefusal('SUBJECT_NOT_AWAITING_REVIEW', id);
    if (!expected.has(id)) throw new ReviewBatchRefusal('EXPECTATION_MISSING', id);
    return row;
  });
  for (const id of expected.keys()) {
    if (!subjectIds.includes(id)) throw new ReviewBatchRefusal('EXPECTATION_UNLISTED', id);
  }
  for (const row of rows) {
    const state = await readSubjectReviewState(readonly, row.subject_id, trust);
    if (state === null || state.stateDigest !== expected.get(row.subject_id)) {
      throw new ReviewBatchRefusal('STATE_DIGEST_MISMATCH', row.subject_id);
    }
  }
  return rows;
}

/**
 * Signs and appends one OWNER review per listed subject, then releases each
 * reviewed item to ASSESSABLE. A failure for one subject is reported and does
 * not release it; the others proceed (each is its own decision).
 */
export async function signCampaignReviews(
  pools: ReviewBatchPools,
  campaignId: string,
  subjectIds: readonly string[],
  expected: ReadonlyMap<string, string>,
  key: OwnerSigningKey,
  trust: OwnerReviewTrust,
  nowMs: () => number,
  countries: readonly CountryStatement[] = [],
): Promise<readonly ReviewBatchResult[]> {
  const planned = await planReviewBatch(pools.readonly, campaignId, subjectIds, expected, trust);
  const results: ReviewBatchResult[] = [];
  for (const row of planned) {
    try {
      await signAndAppendSubjectReview(
        pools,
        row.subject_id,
        expected.get(row.subject_id)!,
        key,
        trust,
        nowMs(),
      );
      await releaseIdentityReviewItem(pools.owner, {
        campaignId,
        identityReviewItemId: row.work_item_id,
      });
      results.push({
        subjectId: row.subject_id,
        workItemId: row.work_item_id,
        outcome: 'REVIEWED_AND_RELEASED',
        code: null,
        country: await statedCountry(pools, countries, row.subject_id),
      });
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      results.push({
        subjectId: row.subject_id,
        workItemId: row.work_item_id,
        outcome: 'FAILED',
        code: typeof code === 'string' ? code : 'INTERNAL_ERROR',
        country: null,
      });
    }
  }
  return results;
}

/** Records the OWNER's country statement for one reviewed subject, if any. Never throws. */
async function statedCountry(
  pools: ReviewBatchPools,
  countries: readonly CountryStatement[],
  subjectId: string,
): Promise<ReviewBatchResult['country']> {
  const s = countries.find((c) => c.subjectId === subjectId);
  if (s === undefined) return null;
  const base = { statedCountry: s.country, pageEvidenceId: s.pageEvidenceId };
  if (pools.writer === undefined) return { ...base, claimId: null, code: 'WRITER_POOL_MISSING' };
  try {
    const result = await recordCountryStatement(
      { readonly: pools.readonly, writer: pools.writer },
      s,
    );
    return { ...base, claimId: result.claimId, code: null };
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    return { ...base, claimId: null, code: typeof code === 'string' ? code : 'INTERNAL_ERROR' };
  }
}
