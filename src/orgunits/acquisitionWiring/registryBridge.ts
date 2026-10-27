/**
 * WW E-W - THE ONE WIRING FILE THAT NAMES THE B2.2 DISCOVERY-SUBJECT REGISTRY
 * FOR WRITING A PROPOSAL (ADR 0030 s3.3).
 *
 * A campaign PROPOSES; it never confirms. The subject is written by the
 * EXISTING writer path (`executePropose`, `executeClaim`, capability
 * `nwf_discovery_subject_writer`) and judged by the EXISTING B2.1 validator,
 * exactly as an operator's `orgunits nominations promote` would be - with
 * three campaign-specific, deterministic choices:
 *
 *   - the subject id is derived from (campaign, nomination), so a retried
 *     proposal is the SAME subject and the writer's own SUBJECT_ALREADY_EXISTS
 *     refusal makes it idempotent;
 *   - the registered kind is `UNCERTAIN`: a campaign never guesses a kind;
 *   - the NAME claim and the PUBLIC_WEBSITE claim both cite the nomination
 *     (source PUBLIC_URL = the nominated URL, versionRef = the nomination
 *     citation digest, observedAt = its retrieval instant, basis
 *     SOURCE_STATED): the search result published that title at that URL.
 *     A nomination without a title is refused: a name is never invented.
 *
 * The recorded actor key on registry rows stays the writer's fixed path key
 * (migration 0014 refuses any other from a non-owner writer); the campaign
 * scope is recorded by `acquisition_campaign_subjects` (migration 0024).
 *
 * `admissionReadOf` reads, in ONE read-only snapshot, the subject
 * state digest and the registry fingerprint a CAMPAIGN admission binds.
 *
 * Opens no socket.
 */
import type pg from 'pg';

import { subjectStateDigest } from '../subjectRegistry/readModel.js';
import type { ClaimRequest, ProposeRequest } from '../subjectRegistry/requests.js';
import { databaseNow, loadSubjectGraph } from '../subjectRegistry/store.js';
import { RegistryRefusal, executeClaim, executePropose } from '../subjectRegistry/writer.js';
import {
  isAdmissibleName,
  nominationCitationDigest,
  type NominationRow,
} from './sourceDiscoveryPort.js';

export const CAMPAIGN_REGISTRATION_NOTE =
  'Proposed by an OWNER-signed acquisition campaign from a source-discovery nomination; not an identity confirmation.';

export type ProposalOutcome =
  | { readonly ok: true; readonly websiteClaimId: string }
  | { readonly ok: false; readonly reason: 'NO_TITLE' | 'NAME_INADMISSIBLE' | 'NOT_ADMISSIBLE' };

function provenanceOf(nomination: NominationRow): ProposeRequest['provenance'] {
  return {
    source: {
      sourceType: 'PUBLIC_URL',
      url: nomination.url,
      versionRef: nominationCitationDigest(nomination),
    },
    observedAt: nomination.retrievedAt,
    claimBasis: 'SOURCE_STATED',
  };
}

async function websiteClaimOf(
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

/**
 * Proposes the subject (idempotently) and records its website claim
 * (idempotently). Returns the website claim id research will be rooted on.
 */
export async function proposeCampaignSubject(
  pools: { readonly writer: pg.Pool; readonly readonly: pg.Pool },
  nomination: NominationRow,
  subjectId: string,
): Promise<ProposalOutcome> {
  if (nomination.title === null) return { ok: false, reason: 'NO_TITLE' };
  if (!isAdmissibleName(nomination.title)) return { ok: false, reason: 'NAME_INADMISSIBLE' };
  const propose: ProposeRequest = {
    subjectId,
    registeredKind: 'UNCERTAIN',
    registrationNote: CAMPAIGN_REGISTRATION_NOTE,
    name: nomination.title,
    nameLanguage: null,
    provenance: provenanceOf(nomination),
  };
  try {
    await executePropose(pools.writer, propose);
  } catch (error) {
    if (!(error instanceof RegistryRefusal)) throw error;
    if (error.code === 'VALIDATION_FAILED' || error.code === 'INPUT_INVALID') {
      return { ok: false, reason: 'NOT_ADMISSIBLE' };
    }
    if (error.code !== 'SUBJECT_ALREADY_EXISTS') throw error;
  }
  const existing = await websiteClaimOf(pools.readonly, subjectId, nomination.url);
  if (existing !== null) return { ok: true, websiteClaimId: existing };
  const claim: ClaimRequest = {
    subjectId,
    payload: { claimKind: 'PUBLIC_WEBSITE', websiteUrl: nomination.url },
    provenance: provenanceOf(nomination),
  };
  try {
    const result = await executeClaim(pools.writer, claim);
    return { ok: true, websiteClaimId: result.recordIds['identityClaim']! };
  } catch (error) {
    if (!(error instanceof RegistryRefusal)) throw error;
    if (error.code === 'DUPLICATE_ASSERTION') {
      const again = await websiteClaimOf(pools.readonly, subjectId, nomination.url);
      if (again !== null) return { ok: true, websiteClaimId: again };
    }
    if (error.code === 'VALIDATION_FAILED' || error.code === 'INPUT_INVALID') {
      return { ok: false, reason: 'NOT_ADMISSIBLE' };
    }
    throw error;
  }
}

/** The subject's state digest and the registry fingerprint, from ONE read-only snapshot. */
export async function admissionReadOf(
  readonly: pg.Pool,
  subjectId: string,
): Promise<{ subjectStateDigest: string; registryFingerprint: string } | null> {
  const client = await readonly.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const graph = await loadSubjectGraph(client, subjectId, { asOf: await databaseNow(client) });
    const { rows } = await client.query<{ fingerprint: string }>(
      'SELECT fingerprint FROM subject_research_registry_fingerprint',
    );
    if (graph === null || rows.length !== 1) return null;
    return {
      subjectStateDigest: subjectStateDigest(graph),
      registryFingerprint: rows[0]!.fingerprint,
    };
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}
