/**
 * LANE L1 - THE VERIFIED SUBJECT ADMISSION: the capability that subject
 * research EXECUTES under (ADR 0025 s12).
 *
 * A discovery subject is researched only under an OWNER admission recorded
 * in `subject_research_admissions` (migration 0017), which no runtime role can
 * write: `nwf_research` holds SELECT on it and nothing else, so the role that
 * runs the research can never create, extend or un-revoke one. This module
 * turns that stored record into an in-process capability the same way the
 * robots capability is built (`web/robotsAuthority.ts`):
 *
 *   1. RUNTIME BRAND - a genuinely private `#sealed` field. A literal, a
 *      spread clone, a cast or `Object.create(prototype)` lacks it, and
 *      `isVerified` checks the brand, never the shape.
 *   2. A MINT TOKEN - the constructor is private AND refuses any call that
 *      does not present this module's unexported symbol, so even a reflective
 *      `new` from outside this file throws at runtime.
 *   3. ONE PRODUCTION DERIVATION - `verifySubjectAdmission` reads the
 *      subject's admissions AS THE CALLER'S ROLE, requires exactly one live
 *      (unrevoked, unexpired by the DATABASE clock) admission, and passes it
 *      through `planSubjectDiscovery` - the very resolver and subject guard
 *      `runSubjectDiscovery` applies (policy version, staleness, TEST_ONLY
 *      outside vitest, protected-registry digest, domain isolation). There is
 *      no constructor that takes an admission id, a URL or a verdict from the
 *      caller: the agent path can only ASK the database.
 *   4. A VITEST-ONLY SEAM - `forVitestUnverified` throws outside vitest. It
 *      exists so tests can prove that a capability naming an admission the
 *      database does not hold authorises nothing: execution re-resolves the
 *      admission from the database before any request, whatever it carries.
 *
 * The capability is a CARRIER, not the authority. The authority stays the
 * database row, re-read on every gateway attempt (`web/authority.ts`).
 *
 * Opens no socket. Reads only what `nwf_research` is granted. Writes nothing.
 */
import type pg from 'pg';

import { SubjectRootRefusal, planSubjectDiscovery } from '../orchestrator/orchestrate.js';
import type { RootRunnerDeps } from '../orchestrator/rootRunner.js';
import { WebGatewayRefusal } from '../web/authority.js';

const MINT: unique symbol = Symbol('VerifiedSubjectAdmission.mint');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type AdmissionProvenance = 'DATABASE_VERIFIED' | 'VITEST_UNVERIFIED';

interface AdmissionFields {
  readonly admissionId: string;
  readonly subjectId: string;
  readonly rootKey: string;
  readonly rootUrl: string;
  readonly identityAuthorityScope: 'OPERATIONAL' | 'TEST_ONLY';
}

export class VerifiedSubjectAdmission {
  /** The runtime brand: unforgeable by a literal, a clone, a cast or reflection. */
  readonly #sealed = true;

  readonly admissionId: string;
  readonly subjectId: string;
  /** `subject_admission:<uuid>` - the key the database generates on every evidence row. */
  readonly rootKey: string;
  /** The admission's foreign-key-pinned copy of the subject's own website claim. */
  readonly rootUrl: string;
  readonly identityAuthorityScope: 'OPERATIONAL' | 'TEST_ONLY';
  readonly provenance: AdmissionProvenance;

  private constructor(mint: symbol, fields: AdmissionFields, provenance: AdmissionProvenance) {
    if (mint !== MINT) {
      throw new Error(
        'VerifiedSubjectAdmission cannot be constructed directly: it is derived only from a ' +
          'stored OWNER admission by verifySubjectAdmission (ADR 0025 s12).',
      );
    }
    this.admissionId = fields.admissionId;
    this.subjectId = fields.subjectId;
    this.rootKey = fields.rootKey;
    this.rootUrl = fields.rootUrl;
    this.identityAuthorityScope = fields.identityAuthorityScope;
    this.provenance = provenance;
    Object.freeze(this);
  }

  /** True only for a value this class actually constructed. */
  static isVerified(value: unknown): value is VerifiedSubjectAdmission {
    return typeof value === 'object' && value !== null && #sealed in value;
  }

  /**
   * A TEST SEAM. Unavailable outside vitest. The value it returns carries
   * whatever the test says and is verified by nothing: execution still
   * re-resolves the admission from the database before any request.
   */
  static forVitestUnverified(fields: AdmissionFields): VerifiedSubjectAdmission {
    if (process.env['VITEST'] !== 'true') {
      throw new Error(
        'VerifiedSubjectAdmission.forVitestUnverified is a TEST SEAM and is unavailable outside ' +
          'vitest. A subject admission is derived only from the database (ADR 0025 s12).',
      );
    }
    return new VerifiedSubjectAdmission(MINT, fields, 'VITEST_UNVERIFIED');
  }

  /** @internal The production derivation below is this file's only other caller. */
  static fromDatabase(mint: symbol, fields: AdmissionFields): VerifiedSubjectAdmission {
    return new VerifiedSubjectAdmission(mint, fields, 'DATABASE_VERIFIED');
  }
}

export type AdmissionRefusalCode =
  | 'SUBJECT_ID_INVALID'
  | 'NO_ADMISSION_RECORD'
  | 'NO_LIVE_ADMISSION'
  | 'ADMISSION_AMBIGUOUS'
  | 'ADMISSION_REFUSED';

export type VerifyAdmissionResult =
  | { readonly outcome: 'VERIFIED'; readonly admission: VerifiedSubjectAdmission }
  | {
      readonly outcome: 'REFUSED';
      readonly code: AdmissionRefusalCode;
      /** The resolver's or guard's own code for ADMISSION_REFUSED; a count otherwise. Never a URL. */
      readonly detail: string;
    };

interface AdmissionStandingRow {
  id: string;
  live: boolean;
}

/**
 * THE production derivation. Total for expected refusals (returns REFUSED);
 * anything else - a lost connection, a missing grant - propagates.
 */
export async function verifySubjectAdmission(
  pool: pg.Pool,
  subjectId: string,
  deps: RootRunnerDeps = {},
): Promise<VerifyAdmissionResult> {
  if (typeof subjectId !== 'string' || !UUID.test(subjectId)) {
    return { outcome: 'REFUSED', code: 'SUBJECT_ID_INVALID', detail: 'subjectId' };
  }
  const { rows } = await pool.query<AdmissionStandingRow>(
    `SELECT a.id,
            (a.expires_at > clock_timestamp()
             AND NOT EXISTS (SELECT 1 FROM subject_research_admission_revocations v
                              WHERE v.admission_id = a.id)) AS live
       FROM subject_research_admissions a
      WHERE a.subject_id = $1
      ORDER BY a.admitted_at, a.id`,
    [subjectId],
  );
  if (rows.length === 0) {
    return { outcome: 'REFUSED', code: 'NO_ADMISSION_RECORD', detail: 'admissions=0' };
  }
  const live = rows.filter((r) => r.live);
  if (live.length === 0) {
    return { outcome: 'REFUSED', code: 'NO_LIVE_ADMISSION', detail: `admissions=${rows.length}` };
  }
  if (live.length > 1) {
    return { outcome: 'REFUSED', code: 'ADMISSION_AMBIGUOUS', detail: `live=${live.length}` };
  }

  let root;
  try {
    root = await planSubjectDiscovery(pool, live[0]!.id, deps);
  } catch (error) {
    if (error instanceof WebGatewayRefusal) {
      return { outcome: 'REFUSED', code: 'ADMISSION_REFUSED', detail: error.reason };
    }
    if (error instanceof SubjectRootRefusal) {
      return { outcome: 'REFUSED', code: 'ADMISSION_REFUSED', detail: error.code };
    }
    throw error;
  }
  const resolved = root.subjectAdmission;
  if (resolved === null || resolved.subjectId !== subjectId) {
    return { outcome: 'REFUSED', code: 'ADMISSION_REFUSED', detail: 'SUBJECT_MISMATCH' };
  }
  return {
    outcome: 'VERIFIED',
    admission: VerifiedSubjectAdmission.fromDatabase(MINT, {
      admissionId: resolved.admissionId,
      subjectId: resolved.subjectId,
      rootKey: root.rootKey,
      rootUrl: root.rootUrl.url,
      identityAuthorityScope: resolved.identityAuthorityScope,
    }),
  };
}
