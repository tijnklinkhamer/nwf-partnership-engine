/**
 * REL Q1 - RECORDING ONE SOURCE-STATED COUNTRY-OF-OPERATION CLAIM FOR ONE
 * DISCOVERY SUBJECT (ADR 0024 s7, migration 0021).
 *
 * WHY THIS EXISTS. The C1 qualification-input export reads a subject's
 * country ONLY from STATED ADR 0024 COUNTRY_OF_OPERATION claims, and until
 * migration 0021 only the database owner could record one. This is the
 * smallest runtime writer: ONE claim kind, ONE basis, and ONE kind of source -
 * a source the subject ALREADY HOLDS.
 *
 * WHAT THE OPERATOR SUPPLIES, AND WHAT IS NEVER INFERRED. The operator names
 * the subject, the stored source, and the ISO 3166-1 alpha-2 code that source
 * STATES, with the basis `SOURCE_STATED`. Nothing here derives a country from
 * a domain, a top-level domain, a name, a language, an Erasmus-code prefix or
 * ECHE's Country Cd; nothing here reads any of them. A website claim is
 * refused as a source: it records only a URL a register published, so a
 * country taken from it would be a domain inference (rule 2).
 *
 * "ALREADY HOLDS" (checked here AND by migration 0021's trigger):
 *   PAGE_EVIDENCE  captured by a research run rooted in one of this subject's
 *                  admissions, or cited by one of its own identity claims;
 *                  the claim's observed_at IS the page's observed_at;
 *   PUBLIC_URL     the exact (url, version) provenance one of this subject's
 *                  own identity claims cites; the operator gives observed_at,
 *                  never later than the database clock.
 *
 * APPEND-ONLY. A correction is a NEW claim. A claim that disagrees with an
 * earlier one is recorded, not refused, and the subject's standing becomes
 * CONFLICTING - which the export reports as `country.value: null`. Only an
 * exact duplicate (same country, same provenance) is refused.
 *
 * TWO FORMS, ONE JUDGEMENT. `planCountryOfOperationClaim` runs the judgement
 * in a READ ONLY transaction (the CLI uses the readonly role) and writes
 * nothing. `recordCountryOfOperationClaim` runs it again inside ONE writer
 * transaction - never a superuser, never the table owner, must hold
 * `nwf_discovery_subject_writer`, narrowed with SET LOCAL ROLE - and appends
 * the row. Any refusal rolls everything back.
 *
 * NOT a review, a verification, a research admission, an eligibility, a rank
 * or a permission of any kind.
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';

import {
  deriveJurisdictionStanding,
  validateJurisdictionClaim,
} from '../subjectJurisdiction/standing.js';
import type { JurisdictionClaimRecord } from '../subjectJurisdiction/vocabulary.js';

/** The path key migration 0014's trigger binds every non-owner row to. */
export const JURISDICTION_WRITER_ACTOR_KEY = 'discovery-subjects-cli';
/** The capability the writer session must hold (migration 0014, widened by 0021). */
export const JURISDICTION_WRITER_ROLE = 'nwf_discovery_subject_writer';
/** The one claim kind this writer records. */
export const RECORDED_CLAIM_KIND = 'COUNTRY_OF_OPERATION';
export const JURISDICTION_WRITER_CONTRACT = 'nwf-pe.subject-jurisdiction-claim-writer.v1';
/** The registry's advisory-lock class (B2.2), so a claim serialises with registry writes. */
const SUBJECT_LOCK_CLASS = 140014;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
const ADMISSION_ROOT = /^subject_admission:([0-9a-f-]{36})$/;

export type CountrySourceInput =
  | { readonly sourceType: 'PAGE_EVIDENCE'; readonly pageEvidenceId: string }
  | {
      readonly sourceType: 'PUBLIC_URL';
      readonly url: string;
      readonly versionRef: string | null;
      readonly observedAt: string;
    }
  | { readonly sourceType: 'WEBSITE_CLAIM'; readonly websiteClaimId: string };

export interface CountryOfOperationRequest {
  readonly subjectId: string;
  /** What the cited source STATES: an officially assigned ISO 3166-1 alpha-2 code. */
  readonly statedCountry: string;
  readonly source: CountrySourceInput;
  /** Must be the literal `SOURCE_STATED`. */
  readonly claimBasis: string;
}

export type JurisdictionWriterRefusalCode =
  | 'INPUT_INVALID'
  | 'COUNTRY_NOT_ASSIGNED'
  | 'BASIS_NOT_SOURCE_STATED'
  | 'SUBJECT_NOT_FOUND'
  | 'SOURCE_STATES_NO_COUNTRY'
  | 'SOURCE_NOT_FOUND'
  | 'SOURCE_NOT_HELD_BY_SUBJECT'
  | 'OBSERVED_AT_IN_THE_FUTURE'
  | 'DUPLICATE_ASSERTION'
  | 'WRITER_SESSION_REFUSED'
  | 'DATABASE_REFUSED';

/** A refusal: nothing was written. `detail` carries ids only, never row contents. */
export class JurisdictionWriterRefusal extends Error {
  constructor(
    readonly code: JurisdictionWriterRefusalCode,
    readonly detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = 'JurisdictionWriterRefusal';
  }
}

/** How the subject holds the cited source. */
export type SourceHolding =
  'CAPTURED_UNDER_THIS_SUBJECTS_ADMISSION' | 'CITED_BY_THIS_SUBJECTS_IDENTITY_CLAIM';

export type CountryStanding =
  | { readonly state: 'UNKNOWN' }
  | { readonly state: 'STATED'; readonly value: string }
  | { readonly state: 'CONFLICTING'; readonly values: readonly string[] };

export interface CountryOfOperationResult {
  readonly contract: typeof JURISDICTION_WRITER_CONTRACT;
  readonly mode: 'DRY_RUN' | 'EXECUTED';
  readonly subjectId: string;
  /** The id written (EXECUTED) or the provisional id a dry run used (regenerated on execution). */
  readonly claimId: string;
  readonly claim: JurisdictionClaimRecord;
  readonly holding: SourceHolding;
  /** The subject's COUNTRY_OF_OPERATION standing before and after this claim. */
  readonly standingBefore: CountryStanding;
  readonly standingAfter: CountryStanding;
  /** What `qualification-input export` would emit as `country.value` afterwards. */
  readonly exportCountryAfter: string | null;
}

type Queryable = Pick<pg.PoolClient, 'query'>;

function refuse(code: JurisdictionWriterRefusalCode, detail: string): never {
  throw new JurisdictionWriterRefusal(code, detail);
}

/** The request's own shape: checked before any connection is used. */
export function checkCountryOfOperationRequest(r: CountryOfOperationRequest): void {
  if (!UUID.test(r.subjectId)) refuse('INPUT_INVALID', 'subject id must be a lower-case UUID.');
  if (r.claimBasis !== 'SOURCE_STATED') {
    refuse(
      'BASIS_NOT_SOURCE_STATED',
      'only SOURCE_STATED is recorded: a country is never inferred (rule 2).',
    );
  }
  const s = r.source;
  if (s.sourceType === 'WEBSITE_CLAIM') {
    refuse(
      'SOURCE_STATES_NO_COUNTRY',
      'a website claim records only a published URL; a country read from it would be a ' +
        'domain inference. Cite page evidence or a public URL the subject holds.',
    );
  }
  if (s.sourceType === 'PAGE_EVIDENCE' && !UUID.test(s.pageEvidenceId)) {
    refuse('INPUT_INVALID', 'page evidence id must be a lower-case UUID.');
  }
  if (s.sourceType === 'PUBLIC_URL') {
    if (s.versionRef !== null && !SHA256_HEX.test(s.versionRef)) {
      refuse('INPUT_INVALID', 'source version must be a lower-case SHA-256.');
    }
    if (!UTC_INSTANT.test(s.observedAt) || Number.isNaN(Date.parse(s.observedAt))) {
      refuse('INPUT_INVALID', 'observed-at must be an ISO-8601 UTC instant ending in Z.');
    }
  }
}

const ISO_US = (column: string) =>
  `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

function standingOf(
  subjectId: string,
  claims: readonly JurisdictionClaimRecord[],
): CountryStanding {
  const operation = deriveJurisdictionStanding(subjectId, claims).countryOfOperation;
  if (operation.state === 'STATED') return { state: 'STATED', value: operation.value };
  if (operation.state === 'CONFLICTING') return { state: 'CONFLICTING', values: operation.values };
  return { state: 'UNKNOWN' };
}

async function judge(
  c: Queryable,
  r: CountryOfOperationRequest,
  claimId: string,
): Promise<Omit<CountryOfOperationResult, 'mode'>> {
  checkCountryOfOperationRequest(r);
  const subject = await c.query('SELECT 1 FROM discovery_subjects WHERE id = $1', [r.subjectId]);
  if (subject.rowCount === 0) refuse('SUBJECT_NOT_FOUND', `no discovery subject ${r.subjectId}.`);

  let holding: SourceHolding;
  let observedAt: string;
  const s = r.source;
  if (s.sourceType === 'PAGE_EVIDENCE') {
    const page = await c.query<{ root_key: string; observed_at: string }>(
      `SELECT root_key, ${ISO_US('observed_at')} AS observed_at
         FROM orgunit_page_evidence WHERE id = $1`,
      [s.pageEvidenceId],
    );
    const row = page.rows[0];
    if (row === undefined) refuse('SOURCE_NOT_FOUND', `no page evidence ${s.pageEvidenceId}.`);
    const admissionId = ADMISSION_ROOT.exec(row.root_key)?.[1];
    const admitted =
      admissionId !== undefined &&
      ((
        await c.query(
          'SELECT 1 FROM subject_research_admissions WHERE id = $1 AND subject_id = $2',
          [admissionId, r.subjectId],
        )
      ).rowCount ?? 0) > 0;
    const cited =
      ((
        await c.query(
          `SELECT 1 FROM discovery_subject_identity_claims
            WHERE subject_id = $1 AND source_type = 'PAGE_EVIDENCE' AND source_page_evidence_id = $2`,
          [r.subjectId, s.pageEvidenceId],
        )
      ).rowCount ?? 0) > 0;
    if (!admitted && !cited) {
      refuse(
        'SOURCE_NOT_HELD_BY_SUBJECT',
        `page evidence ${s.pageEvidenceId} was not captured under an admission of this subject ` +
          'and is cited by none of its identity claims.',
      );
    }
    holding = admitted
      ? 'CAPTURED_UNDER_THIS_SUBJECTS_ADMISSION'
      : 'CITED_BY_THIS_SUBJECTS_IDENTITY_CLAIM';
    observedAt = row.observed_at;
  } else if (s.sourceType === 'PUBLIC_URL') {
    const cited = await c.query(
      `SELECT 1 FROM discovery_subject_identity_claims
        WHERE subject_id = $1 AND source_type = 'PUBLIC_URL' AND source_url = $2
          AND source_version_ref IS NOT DISTINCT FROM $3`,
      [r.subjectId, s.url, s.versionRef],
    );
    if ((cited.rowCount ?? 0) === 0) {
      refuse(
        'SOURCE_NOT_HELD_BY_SUBJECT',
        'the public URL (with that version) is cited by none of this subject’s identity claims.',
      );
    }
    const clock = await c.query<{ future: boolean }>(
      'SELECT $1::timestamptz > statement_timestamp() AS future',
      [s.observedAt],
    );
    if (clock.rows[0]!.future) refuse('OBSERVED_AT_IN_THE_FUTURE', s.observedAt);
    holding = 'CITED_BY_THIS_SUBJECTS_IDENTITY_CLAIM';
    observedAt = s.observedAt;
  } else {
    // checkCountryOfOperationRequest already refused a website claim.
    throw new Error('internal: unreachable source type');
  }

  const claim: JurisdictionClaimRecord = {
    id: claimId,
    subjectId: r.subjectId,
    claimKind: RECORDED_CLAIM_KIND,
    claimedCountry: r.statedCountry,
    claimedLegalForm: null,
    sourceType: s.sourceType,
    sourcePageEvidenceId: s.sourceType === 'PAGE_EVIDENCE' ? s.pageEvidenceId : null,
    sourceWebsiteClaimId: null,
    sourceUrl: s.sourceType === 'PUBLIC_URL' ? s.url : null,
    sourceVersionRef: s.sourceType === 'PUBLIC_URL' ? s.versionRef : null,
    observedAt,
    claimBasis: r.claimBasis,
    recordedByActorKey: JURISDICTION_WRITER_ACTOR_KEY,
  };
  const findings = validateJurisdictionClaim(claim);
  if (findings.includes('COUNTRY_NOT_ASSIGNED') || findings.includes('PAYLOAD_MISMATCH')) {
    refuse(
      'COUNTRY_NOT_ASSIGNED',
      `${JSON.stringify(r.statedCountry)} is not an officially assigned upper-case ISO 3166-1 alpha-2 code.`,
    );
  }
  if (findings.length > 0) refuse('INPUT_INVALID', findings.join(', '));

  const existing = await c.query<{
    id: string;
    claim_kind: JurisdictionClaimRecord['claimKind'];
    claimed_country: string | null;
    claimed_legal_form: string | null;
    source_type: JurisdictionClaimRecord['sourceType'];
    source_page_evidence_id: string | null;
    source_website_claim_id: string | null;
    source_url: string | null;
    source_version_ref: string | null;
    observed_at: string;
    claim_basis: string;
    recorded_by_actor_key: string;
  }>(
    `SELECT id, claim_kind, claimed_country, claimed_legal_form, source_type,
            source_page_evidence_id, source_website_claim_id, source_url, source_version_ref,
            ${ISO_US('observed_at')} AS observed_at, claim_basis, recorded_by_actor_key
       FROM subject_jurisdiction_claims WHERE subject_id = $1 ORDER BY id`,
    [r.subjectId],
  );
  const before: JurisdictionClaimRecord[] = existing.rows.map((j) => ({
    id: j.id,
    subjectId: r.subjectId,
    claimKind: j.claim_kind,
    claimedCountry: j.claimed_country,
    claimedLegalForm: j.claimed_legal_form,
    sourceType: j.source_type,
    sourcePageEvidenceId: j.source_page_evidence_id,
    sourceWebsiteClaimId: j.source_website_claim_id,
    sourceUrl: j.source_url,
    sourceVersionRef: j.source_version_ref,
    observedAt: j.observed_at,
    claimBasis: j.claim_basis,
    recordedByActorKey: j.recorded_by_actor_key,
  }));
  const duplicate = before.some(
    (b) =>
      b.claimKind === claim.claimKind &&
      b.claimedCountry === claim.claimedCountry &&
      b.sourceType === claim.sourceType &&
      b.sourcePageEvidenceId === claim.sourcePageEvidenceId &&
      b.sourceUrl === claim.sourceUrl &&
      b.sourceVersionRef === claim.sourceVersionRef,
  );
  if (duplicate) {
    refuse(
      'DUPLICATE_ASSERTION',
      'this subject already holds this country claim from this source.',
    );
  }
  const standingBefore = standingOf(r.subjectId, before);
  const standingAfter = standingOf(r.subjectId, [...before, claim]);
  return {
    contract: JURISDICTION_WRITER_CONTRACT,
    subjectId: r.subjectId,
    claimId,
    claim,
    holding,
    standingBefore,
    standingAfter,
    exportCountryAfter: standingAfter.state === 'STATED' ? standingAfter.value : null,
  };
}

/** DRY RUN: the full judgement in a READ ONLY transaction. Writes nothing. */
export async function planCountryOfOperationClaim(
  pool: pg.Pool,
  r: CountryOfOperationRequest,
): Promise<CountryOfOperationResult> {
  checkCountryOfOperationRequest(r);
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    return { mode: 'DRY_RUN', ...(await judge(client, r, randomUUID())) };
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

/** Refuses a superuser, a table owner, and a session without the capability; then narrows to it. */
async function enterWriterCapability(client: pg.PoolClient): Promise<void> {
  const { rows } = await client.query<{ super: boolean; writer: boolean; owner: boolean }>(
    `SELECT r.rolsuper AS super,
            pg_has_role(session_user, $1, 'MEMBER') AS writer,
            pg_has_role(session_user, c.relowner, 'MEMBER') AS owner
       FROM pg_roles r, pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE r.rolname = session_user AND n.nspname = 'public'
        AND c.relname = 'subject_jurisdiction_claims'`,
    [JURISDICTION_WRITER_ROLE],
  );
  const session = rows[0];
  if (session === undefined || session.super) {
    refuse('WRITER_SESSION_REFUSED', 'a superuser connection is refused.');
  }
  if (session.owner) refuse('WRITER_SESSION_REFUSED', 'a table-owner connection is refused.');
  if (!session.writer) {
    refuse('WRITER_SESSION_REFUSED', `the connection does not hold ${JURISDICTION_WRITER_ROLE}.`);
  }
  await client.query(`SET LOCAL ROLE ${JURISDICTION_WRITER_ROLE}`);
}

const CLAIM_INSERT = `INSERT INTO subject_jurisdiction_claims
    (id, subject_id, claim_kind, claimed_country, claimed_legal_form, source_type,
     source_page_evidence_id, source_website_claim_id, source_url, source_version_ref,
     observed_at, claim_basis, recorded_by_actor_key)
  VALUES ($1, $2, $3, $4, NULL, $5, $6, NULL, $7, $8, $9, $10, $11)`;

/** EXECUTE: one writer transaction; re-judges from scratch, then appends ONE row. */
export async function recordCountryOfOperationClaim(
  pool: pg.Pool,
  r: CountryOfOperationRequest,
): Promise<CountryOfOperationResult> {
  checkCountryOfOperationRequest(r);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await enterWriterCapability(client);
    await client.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [
      SUBJECT_LOCK_CLASS,
      r.subjectId,
    ]);
    const judged = await judge(client, r, randomUUID());
    const c = judged.claim;
    await client.query(CLAIM_INSERT, [
      c.id,
      c.subjectId,
      c.claimKind,
      c.claimedCountry,
      c.sourceType,
      c.sourcePageEvidenceId,
      c.sourceUrl,
      c.sourceVersionRef,
      c.observedAt,
      c.claimBasis,
      c.recordedByActorKey,
    ]);
    await client.query('COMMIT');
    return { mode: 'EXECUTED', ...judged };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof JurisdictionWriterRefusal) throw error;
    const code = (error as { code?: unknown }).code;
    if (code === '23505') {
      throw new JurisdictionWriterRefusal(
        'DUPLICATE_ASSERTION',
        'the database refused a duplicate claim.',
      );
    }
    if (typeof code === 'string' && /^(22|23|42501|55)/.test(code)) {
      throw new JurisdictionWriterRefusal(
        'DATABASE_REFUSED',
        `the database refused the row (${code}).`,
      );
    }
    throw error;
  } finally {
    client.release();
  }
}
