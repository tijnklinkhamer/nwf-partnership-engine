/**
 * Global R5 - migration 0016 rows, read as `nwf_readonly` inside ONE
 * REPEATABLE READ transaction, become the jurisdiction evidence companion
 * (nwf_pe_test only; SYNTHETIC rows, reserved `.example` hosts).
 *
 * Proves, against real PostgreSQL:
 *   - the read-only role can produce a companion for each of the three
 *     cases, and the database's own provenance key equals the one the
 *     companion cites;
 *   - a Japanese student association reads JP / informal group, a Brazilian
 *     language association reads a source-stated multi-country operation,
 *     and an existing French ECHE university's faculty reads UNKNOWN;
 *   - producing companions writes nothing: ECHE organisations, website
 *     claims and jurisdiction rows are byte-identical before and after.
 */
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';

import {
  JURISDICTION_EVIDENCE_CONTRACT,
  projectJurisdictionEvidence,
  reproduceJurisdictionEvidence,
} from '../../orgunits/subjectJurisdiction/evidence.js';
import { jurisdictionProvenanceKeyOf } from '../../orgunits/subjectJurisdiction/standing.js';
import type { JurisdictionClaimRecord } from '../../orgunits/subjectJurisdiction/vocabulary.js';
import {
  adminPool,
  classifierDatabaseConfigured,
  readonlyPool,
  researchDatabaseConfigured,
  seedOrgunitRoot,
  truncateAll,
} from './helpers.js';

const describeDb =
  classifierDatabaseConfigured() && researchDatabaseConfigured() ? describe : describe.skip;

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

describeDb('R5 jurisdiction evidence companion over migration 0016 (integration)', () => {
  let admin: pg.Pool;
  let readonly: pg.Pool;
  let jp: string;
  let br: string;
  let fr: string;

  async function insertSubject(kind: string): Promise<string> {
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO discovery_subjects (registered_kind, registered_by_actor_key)
       VALUES ($1, 'owner-cli') RETURNING id`,
      [kind],
    );
    return rows[0]!.id;
  }

  async function insertJurisdiction(
    subjectId: string,
    kind: string,
    country: string | null,
    legalForm: string | null,
    url: string,
  ): Promise<void> {
    await admin.query(
      `INSERT INTO subject_jurisdiction_claims
         (subject_id, claim_kind, claimed_country, claimed_legal_form, source_type,
          source_url, source_version_ref, observed_at, claim_basis, recorded_by_actor_key)
       VALUES ($1, $2, $3, $4, 'PUBLIC_URL', $5, $6, '2026-10-19T09:00:00Z',
               'SOURCE_STATED', 'owner-cli')`,
      [subjectId, kind, country, legalForm, url, 'd'.repeat(64)],
    );
  }

  /** One subject's claims and their database provenance keys, in ONE snapshot. */
  async function readSnapshot(
    subjectId: string,
  ): Promise<{ claims: JurisdictionClaimRecord[]; keys: string[] }> {
    const client = await readonly.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const { rows } = await client.query<Record<string, string | Date | null>>(
        `SELECT * FROM subject_jurisdiction_claims WHERE subject_id = $1 ORDER BY id`,
        [subjectId],
      );
      await client.query('COMMIT');
      return {
        keys: rows.map((r) => r['provenance_key'] as string).sort(),
        claims: rows.map((r) => ({
          id: r['id'] as string,
          subjectId: r['subject_id'] as string,
          claimKind: r['claim_kind'] as JurisdictionClaimRecord['claimKind'],
          claimedCountry: r['claimed_country'] as string | null,
          claimedLegalForm: r['claimed_legal_form'] as string | null,
          sourceType: r['source_type'] as JurisdictionClaimRecord['sourceType'],
          sourcePageEvidenceId: r['source_page_evidence_id'] as string | null,
          sourceWebsiteClaimId: r['source_website_claim_id'] as string | null,
          sourceUrl: r['source_url'] as string | null,
          sourceVersionRef: r['source_version_ref'] as string | null,
          observedAt: (r['observed_at'] as Date).toISOString(),
          claimBasis: r['claim_basis'] as string,
          recordedByActorKey: r['recorded_by_actor_key'] as string,
        })),
      };
    } finally {
      client.release();
    }
  }

  async function companion(subjectId: string) {
    const { claims, keys } = await readSnapshot(subjectId);
    const result = projectJurisdictionEvidence(claims, {
      contract: JURISDICTION_EVIDENCE_CONTRACT,
      subjectId,
      subjectEvidenceDocumentDigest: null,
      sourceRepository: 'nwf-partnership-engine',
      sourceRevision: null,
      readConsistency: 'SINGLE_SNAPSHOT_TRANSACTION',
      producedAt: '2026-10-19T12:00:00.000Z',
    });
    if (result.outcome !== 'PROJECTED') throw new Error(`refused ${result.code}`);
    return { result, claims, keys };
  }

  async function stateDigest(): Promise<string> {
    const { rows } = await admin.query<{ row: string }>(
      `SELECT o::text AS row FROM organisations o
       UNION ALL SELECT w::text FROM website_claims w
       UNION ALL SELECT j::text FROM subject_jurisdiction_claims j
       ORDER BY 1`,
    );
    return createHash('sha256')
      .update(rows.map((r) => r.row).join('\n'), 'utf8')
      .digest('hex');
  }

  beforeAll(async () => {
    admin = adminPool();
    readonly = readonlyPool();
    await truncateAll(admin);
    const echeRowKey = (await seedOrgunitRoot(admin)).echeRowKey;

    jp = await insertSubject('INDEPENDENT_STUDENT_ASSOCIATION');
    await insertJurisdiction(
      jp,
      'COUNTRY_OF_OPERATION',
      'JP',
      null,
      'https://synthetic-r5-jp.example/about',
    );
    await insertJurisdiction(
      jp,
      'LEGAL_FORM',
      null,
      'UNREGISTERED_INFORMAL_GROUP',
      'https://synthetic-r5-jp.example/about',
    );

    br = await insertSubject('INDEPENDENT_COMMUNITY');
    const site = 'https://synthetic-r5-br.example/quem-somos';
    await insertJurisdiction(br, 'COUNTRY_OF_OPERATION', 'BR', null, site);
    await insertJurisdiction(br, 'COUNTRY_OF_OPERATION', 'PT', null, site);
    await insertJurisdiction(
      br,
      'COUNTRY_OF_REGISTRATION',
      'BR',
      null,
      'https://synthetic-r5-br.example/estatuto',
    );

    fr = await insertSubject('FACULTY_SCHOOL_DEPARTMENT');
    await admin.query(
      `INSERT INTO discovery_subject_relationship_claims
         (subject_id, predicate, target_eche_row_key, source_type, source_url,
          observed_at, claim_basis, recorded_by_actor_key)
       VALUES ($1, 'PART_OF', $2, 'PUBLIC_URL', 'https://synthetic-r5-fr.example/faculte',
               '2026-10-19T09:00:00Z', 'SOURCE_STATED', 'owner-cli')`,
      [fr, echeRowKey],
    );
  });

  afterAll(async () => {
    await truncateAll(admin);
    await admin.end();
    await readonly.end();
  });

  it('cites exactly the provenance keys the database generated', async () => {
    for (const subjectId of [jp, br]) {
      const { claims, keys } = await companion(subjectId);
      expect(claims.map(jurisdictionProvenanceKeyOf).sort()).toEqual(keys);
    }
  });

  it('reads the three cases without resolving anything', async () => {
    const before = await stateDigest();
    const jpDoc = (await companion(jp)).result;
    const brDoc = (await companion(br)).result;
    const frDoc = (await companion(fr)).result;
    expect((jpDoc.document.reading as Json).countryOfOperation.state).toBe('SINGLE_COUNTRY_STATED');
    expect((jpDoc.document.reading as Json).legalForm.values[0].value).toBe(
      'UNREGISTERED_INFORMAL_GROUP',
    );
    expect((brDoc.document.reading as Json).countryOfOperation.state).toBe(
      'MULTI_COUNTRY_SOURCE_STATED',
    );
    expect(brDoc.document.openQuestions).toEqual(['COUNTRY_OF_OPERATION_MULTI_COUNTRY_UNREVIEWED']);
    expect(frDoc.document.reading).toEqual({
      countryOfOperation: { state: 'UNKNOWN' },
      countryOfRegistration: { state: 'UNKNOWN' },
      legalForm: { state: 'UNKNOWN' },
    });
    for (const doc of [jpDoc, brDoc, frDoc]) {
      expect(reproduceJurisdictionEvidence(doc.document).state).toBe('REPRODUCED');
    }
    expect(await stateDigest()).toBe(before);
  });
});
