/**
 * TRACK B, B3.0 - the fail-closed RESEARCH-side evaluation-cohort guard.
 *
 * OFFLINE: no database, no network. A scripted pool answers ONLY the guard's
 * and the root resolver's read statements, records every statement it is
 * sent, and THROWS on anything else - so a guard that failed open would hit
 * `startRun`'s INSERT (or the gateway's run read) and that statement would be
 * recorded. A counting transport records every DNS lookup and every HTTP
 * attempt. Every cohort registry here is SYNTHETIC
 * (`../helpers/syntheticCohortRegistry.ts`); no protected organisation, key or
 * split from the committed artifacts is used as a fixture.
 *
 * Covers the B3.0 matrix: eligible, protected organisation id, protected
 * eche_row_key, identity conflicts, multiple roots, promoted roots,
 * ambiguous root attribution, missing / altered / malformed / unreadable
 * authority, internal errors, duplicate references, no roots, dry-run
 * eligible and refused, direct-execution refusal, the internal entry points
 * independently of the CLI, non-disclosure, and plan non-reuse.
 */
import { createHash } from 'node:crypto';
import type pg from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  evaluateCohortMembership,
  loadEvaluationCohortRegistry,
  type EvaluationCohortRegistry,
} from '../../orgunits/classify/evaluationCohortGuard.js';
import {
  RESEARCH_COHORT_REFUSAL_CODE,
  ResearchCohortRefusal,
  decideResearchEligibility,
  planOrganisationResearch,
  type ResearchCohortGuardDeps,
  type ResearchCohortRefusalReason,
} from '../../orgunits/orchestrator/researchCohortGuard.js';
import { runOrganisationDiscovery } from '../../orgunits/orchestrator/orchestrate.js';
import { runRootAcquisition } from '../../orgunits/orchestrator/rootRunner.js';
import type { WebTransport } from '../../orgunits/web/gateway.js';
import {
  syntheticCohort,
  type SyntheticCohort,
  type SyntheticIdentity,
} from '../helpers/syntheticCohortRegistry.js';

// --- the CLI's only pool source is mocked; everything else is real ----------

const cliPool: { current: pg.Pool | null } = { current: null };
vi.mock('../../db/client.js', () => ({
  withPool: async <T>(_role: string, fn: (pool: pg.Pool) => Promise<T>): Promise<T> => {
    if (cliPool.current === null) throw new Error('test did not provide a CLI pool');
    return fn(cliPool.current);
  },
}));
const { runOrgunitsDiscover } = await import('../../cli/commands/discover.js');

// --- synthetic identities ---------------------------------------------------

const ELIGIBLE: SyntheticIdentity = {
  organisationId: '00000000-0000-4000-8000-0000000b3001',
  echeRowKey: 'T B30 ELIGIBLE|300000001',
};
const PROTECTED: SyntheticIdentity = {
  organisationId: '00000000-0000-4000-8000-0000000b3002',
  echeRowKey: 'T B30 PROTECTED|300000002',
};
const OUTSIDE_FRAME: SyntheticIdentity = {
  organisationId: '00000000-0000-4000-8000-0000000b3003',
  echeRowKey: 'T B30 OUTSIDE|300000003',
};
const OTHER_ELIGIBLE: SyntheticIdentity = {
  organisationId: '00000000-0000-4000-8000-0000000b3004',
  echeRowKey: 'T B30 OTHER|300000004',
};
const RUN_ID = '00000000-0000-4000-8000-0000000b3099';

// --- scripted, recording pool -----------------------------------------------

interface FakeClaim {
  id: string;
  source_kind: string;
  eche_row_key: string;
  organisation_id: string | null;
  structural_status: string;
  normalised_url: string | null;
}
interface FakePromotion {
  id: string;
  eche_row_key: string;
  organisation_id: string | null;
  to_url_resolved: string | null;
  target_malformed: boolean;
  revoked: boolean;
}
interface FakeDb {
  organisations: { id: string; eche_row_key: string }[];
  claims: FakeClaim[];
  promotions: FakePromotion[];
  runFetchKeys: Record<string, string[]>;
}

const norm = (sql: string): string => sql.replace(/\s+/g, ' ').trim();

class UnexpectedStatement extends Error {}

function fakePool(
  db: FakeDb,
  hooks: { after?: (sql: string) => void; fail?: RegExp } = {},
): { pool: pg.Pool; statements: string[] } {
  const statements: string[] = [];
  const answer = (sql: string, params: unknown[]): unknown[] => {
    const p0 = params[0];
    if (hooks.fail?.test(sql)) throw new Error('simulated database failure: connection reset');
    if (/^SELECT id, eche_row_key FROM organisations WHERE id = \$1$/.test(sql)) {
      return db.organisations.filter((o) => o.id === p0);
    }
    if (/^SELECT eche_row_key FROM organisations WHERE id = \$1$/.test(sql)) {
      return db.organisations
        .filter((o) => o.id === p0)
        .map(({ eche_row_key }) => ({ eche_row_key }));
    }
    if (/^SELECT id FROM organisations WHERE eche_row_key = \$1$/.test(sql)) {
      return db.organisations.filter((o) => o.eche_row_key === p0).map(({ id }) => ({ id }));
    }
    if (/^SELECT id, source_kind FROM website_claims WHERE eche_row_key = \$1/.test(sql)) {
      return db.claims
        .filter((c) => c.eche_row_key === p0 && c.structural_status === 'STRUCTURALLY_VALID')
        .map(({ id, source_kind }) => ({ id, source_kind }));
    }
    if (/^SELECT DISTINCT p\.id FROM orgunit_root_promotions/.test(sql)) {
      return db.promotions
        .filter((p) => p.eche_row_key === p0 && !p.revoked)
        .map(({ id }) => ({ id }));
    }
    if (/^SELECT id, eche_row_key, organisation_id, structural_status, normalised_url/.test(sql)) {
      return db.claims.filter((c) => c.id === p0).slice(0, 1);
    }
    if (/^SELECT p\.id, r\.to_url_resolved/.test(sql)) {
      return db.promotions
        .filter((p) => p.id === p0)
        .slice(0, 1)
        .map((p) => ({ ...p, revocation_count: p.revoked ? '1' : '0' }));
    }
    // REL harvest H1: rootRunner reads the run's STORED signal rule
    // version once, after the guard and before the gateway. Every root in this
    // file is an ECHE root, so the run is stamped v1.
    if (/^SELECT rule_version FROM orgunit_research_runs WHERE id = \$1$/.test(sql)) {
      return [{ rule_version: 'orgunit-signal-rules-v1' }];
    }
    if (/^SELECT DISTINCT eche_row_key FROM orgunit_fetch_observations WHERE run_id/.test(sql)) {
      return (db.runFetchKeys[String(p0)] ?? []).map((eche_row_key) => ({ eche_row_key }));
    }
    throw new UnexpectedStatement(`fake pool: unexpected statement: ${sql.slice(0, 80)}`);
  };
  const query = async (text: string, params: unknown[] = []) => {
    const sql = norm(text);
    statements.push(sql);
    const rows = answer(sql, params);
    hooks.after?.(sql);
    return { rows, rowCount: rows.length };
  };
  const pool = {
    query,
    connect: async () => {
      statements.push('CONNECT');
      throw new UnexpectedStatement('fake pool: connect() is never expected here');
    },
  } as unknown as pg.Pool;
  return { pool, statements };
}

const writesIn = (statements: readonly string[]): string[] =>
  statements.filter((s) => !s.startsWith('SELECT'));

function countingTransport(): { transport: WebTransport; calls: { dns: number; http: number } } {
  const calls = { dns: 0, http: 0 };
  return {
    calls,
    transport: {
      async resolveHostname() {
        calls.dns += 1;
        throw new Error('no network in this test');
      },
      async execute() {
        calls.http += 1;
        throw new Error('no network in this test');
      },
    },
  };
}

function claim(id: string, owner: SyntheticIdentity, over: Partial<FakeClaim> = {}): FakeClaim {
  return {
    id,
    source_kind: 'ECHE_PUBLISHED',
    eche_row_key: owner.echeRowKey,
    organisation_id: owner.organisationId,
    structural_status: 'STRUCTURALLY_VALID',
    normalised_url: `https://www.${id.slice(-4)}.example.ac.uk/`,
    ...over,
  };
}

function promotion(
  id: string,
  owner: SyntheticIdentity,
  over: Partial<FakePromotion> = {},
): FakePromotion {
  return {
    id,
    eche_row_key: owner.echeRowKey,
    organisation_id: owner.organisationId,
    to_url_resolved: `https://promoted-${id.slice(-4)}.example.org/`,
    target_malformed: false,
    revoked: false,
    ...over,
  };
}

const C1 = '00000000-0000-4000-8000-00000000c001';
const C2 = '00000000-0000-4000-8000-00000000c002';
const P1 = '00000000-0000-4000-8000-00000000f001';

let cohort: SyntheticCohort;
let deps: ResearchCohortGuardDeps;

function baseDb(): FakeDb {
  return {
    organisations: [ELIGIBLE, PROTECTED, OUTSIDE_FRAME, OTHER_ELIGIBLE].map((i) => ({
      id: i.organisationId,
      eche_row_key: i.echeRowKey,
    })),
    claims: [],
    promotions: [],
    runFetchKeys: {},
  };
}

beforeEach(() => {
  cohort = syntheticCohort();
  cohort.admit(ELIGIBLE);
  cohort.admit(OTHER_ELIGIBLE);
  cohort.protect(PROTECTED);
  deps = { loadCohortRegistry: cohort.load };
});

async function refusalOf(promise: Promise<unknown>): Promise<ResearchCohortRefusal> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ResearchCohortRefusal) return error;
    throw error;
  }
  throw new Error('expected a ResearchCohortRefusal, but the call succeeded');
}

const request = (identity: SyntheticIdentity) => ({
  organisationId: identity.organisationId,
  echeRowKey: identity.echeRowKey,
});

// ============================================================================

describe('B3.0 planOrganisationResearch - the organisation-level guard', () => {
  it('ELIGIBLE: returns a frozen plan naming exactly the roots it verified, using reads only', async () => {
    const db = baseDb();
    db.claims.push(claim(C1, ELIGIBLE), claim(C2, ELIGIBLE, { organisation_id: null }));
    db.promotions.push(promotion(P1, ELIGIBLE));
    const { pool, statements } = fakePool(db);

    const plan = await planOrganisationResearch(pool, request(ELIGIBLE), deps);

    expect(plan.organisationId).toBe(ELIGIBLE.organisationId);
    expect(plan.echeRowKey).toBe(ELIGIBLE.echeRowKey);
    expect(plan.roots.map((r) => `${r.ref.kind}:${r.ref.id}`)).toEqual([
      `WEBSITE_CLAIM:${C1}`,
      `WEBSITE_CLAIM:${C2}`,
      `ROOT_PROMOTION:${P1}`,
    ]);
    expect(plan.roots.every((r) => r.url !== null)).toBe(true);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.roots)).toBe(true);
    expect(Object.isFrozen(plan.roots[0])).toBe(true);
    expect(writesIn(statements)).toEqual([]);
  });

  it('no roots: an eligible organisation with no root yields an empty plan, not a refusal', async () => {
    const { pool } = fakePool(baseDb());
    const plan = await planOrganisationResearch(pool, request(ELIGIBLE), deps);
    expect(plan.roots).toEqual([]);
  });

  it('no roots: a protected organisation with no root is still refused', async () => {
    const { pool } = fakePool(baseDb());
    const refusal = await refusalOf(planOrganisationResearch(pool, request(PROTECTED), deps));
    expect(refusal.reason).toBe('COHORT_INELIGIBLE');
  });

  it('PROTECTED organisation id: refused as PROTECTED_OR_INELIGIBLE, reads only', async () => {
    const db = baseDb();
    db.claims.push(claim(C1, PROTECTED));
    const { pool, statements } = fakePool(db);
    const refusal = await refusalOf(planOrganisationResearch(pool, request(PROTECTED), deps));
    expect(refusal.toJSON()).toEqual({
      code: RESEARCH_COHORT_REFUSAL_CODE,
      kind: 'PROTECTED_OR_INELIGIBLE',
      reason: 'COHORT_INELIGIBLE',
    });
    expect(writesIn(statements)).toEqual([]);
  });

  it.each(['DRAW_SELECTION', 'DRAW_RESERVE', 'HISTORICAL', 'R50'] as const)(
    'every protected membership kind (%s) is refused identically',
    async (as) => {
      const target: SyntheticIdentity = {
        organisationId: '00000000-0000-4000-8000-0000000b3077',
        echeRowKey: `T B30 KIND ${as}|300000077`,
      };
      cohort.protect(target, as);
      const db = baseDb();
      db.organisations.push({ id: target.organisationId, eche_row_key: target.echeRowKey });
      const { pool } = fakePool(db);
      const refusal = await refusalOf(planOrganisationResearch(pool, request(target), deps));
      expect(refusal.reason).toBe('COHORT_INELIGIBLE');
    },
  );

  it('PROTECTED eche_row_key: a protected key held by a different organisation id is refused', async () => {
    // The working database re-ingested the protected row under a new UUID:
    // the key is protected even though the id is not the artifacts' own.
    const reingested = '00000000-0000-4000-8000-0000000b30aa';
    const db = baseDb();
    db.organisations = db.organisations.filter((o) => o.eche_row_key !== PROTECTED.echeRowKey);
    db.organisations.push({ id: reingested, eche_row_key: PROTECTED.echeRowKey });
    const { pool } = fakePool(db);
    const refusal = await refusalOf(
      planOrganisationResearch(
        pool,
        { organisationId: reingested, echeRowKey: PROTECTED.echeRowKey },
        deps,
      ),
    );
    expect(refusal.reason).toBe('COHORT_INELIGIBLE');
  });

  it('an organisation outside the evaluation frame is refused: absence from every list is not proof', async () => {
    const db = baseDb();
    db.claims.push(claim(C1, OUTSIDE_FRAME));
    const { pool, statements } = fakePool(db);
    const refusal = await refusalOf(planOrganisationResearch(pool, request(OUTSIDE_FRAME), deps));
    // B3.0-R1: refused as an ABSENT IDENTITY AUTHORITY, not as protected.
    expect(refusal.toJSON()).toEqual({
      code: RESEARCH_COHORT_REFUSAL_CODE,
      kind: 'IDENTITY_UNVERIFIED',
      reason: 'RESEARCH_IDENTITY_AUTHORITY_ABSENT',
    });
    expect(writesIn(statements)).toEqual([]);
  });

  it('an outside-frame organisation with no roots is still refused', async () => {
    const { pool } = fakePool(baseDb());
    const refusal = await refusalOf(planOrganisationResearch(pool, request(OUTSIDE_FRAME), deps));
    expect(refusal.reason).toBe('RESEARCH_IDENTITY_AUTHORITY_ABSENT');
  });

  it('PROTECTED organisation id under a CHANGED key is refused as protected, not as unverified', async () => {
    // The protected UUID now carries a key the artifacts never bound to it.
    const db = baseDb();
    db.organisations = db.organisations.filter((o) => o.id !== PROTECTED.organisationId);
    db.organisations.push({
      id: PROTECTED.organisationId,
      eche_row_key: 'T B30 REKEYED|300000012',
    });
    const { pool } = fakePool(db);
    const refusal = await refusalOf(
      planOrganisationResearch(
        pool,
        { organisationId: PROTECTED.organisationId, echeRowKey: 'T B30 REKEYED|300000012' },
        deps,
      ),
    );
    expect(refusal.reason).toBe('COHORT_INELIGIBLE');
  });

  it('an UNPROTECTED frame member under a conflicting UUID is refused like a protected one', async () => {
    // A rebuilt database: the frame key is unprotected, but the identity the
    // frame binds is not this row. Indistinguishable, on purpose, from a
    // protected key under a re-ingested UUID.
    const rebuilt = '00000000-0000-4000-8000-0000000b30ad';
    const db = baseDb();
    db.organisations = db.organisations.filter((o) => o.eche_row_key !== ELIGIBLE.echeRowKey);
    db.organisations.push({ id: rebuilt, eche_row_key: ELIGIBLE.echeRowKey });
    const { pool } = fakePool(db);
    const refusal = await refusalOf(
      planOrganisationResearch(
        pool,
        { organisationId: rebuilt, echeRowKey: ELIGIBLE.echeRowKey },
        deps,
      ),
    );
    expect(refusal.reason).toBe('COHORT_INELIGIBLE');
  });

  it('a NON-FRAME key carried by a UUID the frame binds elsewhere is a conflict, never unverified', async () => {
    const db = baseDb();
    db.organisations = db.organisations.filter((o) => o.id !== OTHER_ELIGIBLE.organisationId);
    db.organisations.push({
      id: OTHER_ELIGIBLE.organisationId,
      eche_row_key: 'T B30 NEW|300000013',
    });
    const { pool } = fakePool(db);
    const refusal = await refusalOf(
      planOrganisationResearch(
        pool,
        { organisationId: OTHER_ELIGIBLE.organisationId, echeRowKey: 'T B30 NEW|300000013' },
        deps,
      ),
    );
    expect(refusal.reason).toBe('COHORT_INELIGIBLE');
  });

  it('AMBIGUOUS registry attribution (a key bound to two organisation ids) refuses both ids', async () => {
    // The draw binds PROTECTED to one id, the frame (re-pinned) to another.
    const alternate = '00000000-0000-4000-8000-0000000b30ae';
    const load = () =>
      cohort.loadTampered((pins, bytes) => {
        const frame = JSON.parse(bytes.get('FRAME')!.toString('utf8')) as {
          entries: { echeRowKey: string; organisationId: string }[];
        };
        for (const e of frame.entries) {
          if (e.echeRowKey === PROTECTED.echeRowKey) e.organisationId = alternate;
        }
        const buffer = Buffer.from(JSON.stringify(frame), 'utf8');
        bytes.set('FRAME', buffer);
        const pin = pins.find((x) => x.role === 'FRAME')!;
        pins[pins.indexOf(pin)] = {
          ...pin,
          sha256: createHash('sha256').update(buffer).digest('hex'),
        };
      });
    expect(load().ok).toBe(true);
    for (const id of [PROTECTED.organisationId, alternate]) {
      const db = baseDb();
      db.organisations = db.organisations.filter((o) => o.eche_row_key !== PROTECTED.echeRowKey);
      db.organisations.push({ id, eche_row_key: PROTECTED.echeRowKey });
      const { pool } = fakePool(db);
      const refusal = await refusalOf(
        planOrganisationResearch(
          pool,
          { organisationId: id, echeRowKey: PROTECTED.echeRowKey },
          { loadCohortRegistry: load },
        ),
      );
      expect(refusal.reason).toBe('COHORT_INELIGIBLE');
    }
  });

  it('IDENTITY: an organisation that does not exist is refused', async () => {
    const { pool } = fakePool(baseDb());
    const refusal = await refusalOf(
      planOrganisationResearch(
        pool,
        { organisationId: '00000000-0000-4000-8000-0000000b30ff', echeRowKey: 'T NONE|1' },
        deps,
      ),
    );
    expect(refusal.toJSON()).toMatchObject({
      kind: 'IDENTITY_CONFLICT',
      reason: 'ORGANISATION_NOT_FOUND',
    });
  });

  it('IDENTITY: an organisation id paired with another organisation key is refused', async () => {
    const { pool } = fakePool(baseDb());
    for (const key of [PROTECTED.echeRowKey, OTHER_ELIGIBLE.echeRowKey]) {
      const refusal = await refusalOf(
        planOrganisationResearch(
          pool,
          { organisationId: ELIGIBLE.organisationId, echeRowKey: key },
          deps,
        ),
      );
      expect(refusal.reason).toBe('ORGANISATION_KEY_MISMATCH');
    }
  });

  it('MULTIPLE ROOTS: one root bound to another organisation refuses the WHOLE organisation', async () => {
    const db = baseDb();
    db.claims.push(
      claim(C1, ELIGIBLE),
      claim(C2, ELIGIBLE, { organisation_id: PROTECTED.organisationId }),
    );
    const { pool } = fakePool(db);
    const refusal = await refusalOf(planOrganisationResearch(pool, request(ELIGIBLE), deps));
    expect(refusal.toJSON()).toMatchObject({
      kind: 'IDENTITY_CONFLICT',
      reason: 'ROOT_ORGANISATION_MISMATCH',
    });
  });

  it('PROMOTED ROOT: a live promotion whose evidence belongs to a protected organisation is refused', async () => {
    const db = baseDb();
    db.claims.push(claim(C1, ELIGIBLE));
    db.promotions.push(promotion(P1, ELIGIBLE, { organisation_id: PROTECTED.organisationId }));
    const { pool } = fakePool(db);
    const refusal = await refusalOf(planOrganisationResearch(pool, request(ELIGIBLE), deps));
    expect(refusal.reason).toBe('ROOT_ORGANISATION_MISMATCH');
  });

  it('PROMOTED ROOT: a revoked promotion is not planned at all', async () => {
    const db = baseDb();
    db.promotions.push(promotion(P1, ELIGIBLE, { revoked: true }));
    const { pool } = fakePool(db);
    const plan = await planOrganisationResearch(pool, request(ELIGIBLE), deps);
    expect(plan.roots).toEqual([]);
  });

  it('a root whose stored binding names another key at resolution time is refused', async () => {
    // The listing saw the claim under this organisation; by the time the
    // root's own authority is resolved, its row names a different key.
    const db = baseDb();
    db.claims.push(claim(C1, ELIGIBLE));
    const { pool } = fakePool(db, {
      after: (sql) => {
        if (sql.startsWith('SELECT id, source_kind FROM website_claims')) {
          db.claims[0]!.eche_row_key = OTHER_ELIGIBLE.echeRowKey;
        }
      },
    });
    const refusal = await refusalOf(planOrganisationResearch(pool, request(ELIGIBLE), deps));
    expect(refusal.reason).toBe('ROOT_NAMES_OTHER_ORGANISATION');
  });

  it('DUPLICATE root references are refused', async () => {
    const db = baseDb();
    db.claims.push(claim(C1, ELIGIBLE), claim(C1, ELIGIBLE));
    const { pool } = fakePool(db);
    const refusal = await refusalOf(planOrganisationResearch(pool, request(ELIGIBLE), deps));
    expect(refusal.reason).toBe('DUPLICATE_ROOT_REFERENCE');
  });

  it('an UNRESOLVABLE root stays in the plan with url null (it reaches no network, as before)', async () => {
    const db = baseDb();
    db.claims.push(claim(C1, ELIGIBLE, { normalised_url: 'https://www.example.ac.uk:8443/' }));
    const { pool } = fakePool(db);
    const plan = await planOrganisationResearch(pool, request(ELIGIBLE), deps);
    expect(plan.roots).toHaveLength(1);
    expect(plan.roots[0]!.url).toBeNull();
  });

  describe('NON-DISCLOSURE', () => {
    it('protected and artifact-conflicting organisations are indistinguishable; outside-frame names nothing', async () => {
      const reingested = '00000000-0000-4000-8000-0000000b30ab';
      const db = baseDb();
      db.organisations.push({ id: reingested, eche_row_key: 'T B30 CONFLICT|300000009' });
      cohort.protect({
        organisationId: reingested.replace(/ab$/, 'ac'),
        echeRowKey: 'T B30 CONFLICT|300000009',
      });
      const { pool } = fakePool(db);
      const outside = await refusalOf(planOrganisationResearch(pool, request(OUTSIDE_FRAME), deps));
      const refusals = [
        await refusalOf(planOrganisationResearch(pool, request(PROTECTED), deps)),
        await refusalOf(
          planOrganisationResearch(
            pool,
            { organisationId: reingested, echeRowKey: 'T B30 CONFLICT|300000009' },
            deps,
          ),
        ),
      ];
      for (const refusal of refusals) {
        expect(refusal.toJSON()).toEqual(refusals[0]!.toJSON());
        expect(refusal.message).toBe(refusals[0]!.message);
      }
      expect(refusals[0]!.reason).toBe('COHORT_INELIGIBLE');
      expect(outside.reason).toBe('RESEARCH_IDENTITY_AUTHORITY_ABSENT');
      const text = [refusals[0]!, outside]
        .map((r) => `${r.message} ${JSON.stringify(r)}`)
        .join(' ');
      for (const secret of [
        OUTSIDE_FRAME.echeRowKey,
        OUTSIDE_FRAME.organisationId,
        PROTECTED.echeRowKey,
        PROTECTED.organisationId,
        'DEV_TRAIN',
        'DEV_CONFIRM',
        'FINAL_HOLDOUT',
        'RESERVE',
        'R50',
        'HISTORICAL',
        'DRAW',
        'SELECTION',
      ]) {
        expect(text).not.toContain(secret);
      }
    });

    it('a database identity conflict is reported the same whether or not the organisation is protected', async () => {
      // The identity checks run BEFORE the matcher, so an identity refusal
      // never depends on cohort membership.
      const db = baseDb();
      db.claims.push(
        claim(C1, ELIGIBLE, { organisation_id: OTHER_ELIGIBLE.organisationId }),
        claim(C2, PROTECTED, { organisation_id: OTHER_ELIGIBLE.organisationId }),
      );
      const { pool } = fakePool(db);
      const eligible = await refusalOf(planOrganisationResearch(pool, request(ELIGIBLE), deps));
      const protectedOne = await refusalOf(
        planOrganisationResearch(pool, request(PROTECTED), deps),
      );
      expect(eligible.toJSON()).toEqual(protectedOne.toJSON());
      expect(eligible.reason).toBe('ROOT_ORGANISATION_MISMATCH');
    });
  });

  describe('AUTHORITY: fail closed, and before any database read', () => {
    const cases: [string, () => ReturnType<SyntheticCohort['load']>][] = [
      ['a missing artifact', () => cohort.loadTampered((_, b) => b.set('FRAME', null))],
      [
        'bytes that differ from the pin',
        () =>
          cohort.loadTampered((_, b) =>
            b.set('REPLACEMENT_LEDGER', Buffer.from('{"generationId":"X","entries":[]}')),
          ),
      ],
      [
        'a missing pin',
        () =>
          cohort.loadTampered((pins) => {
            pins.splice(
              pins.findIndex((p) => p.role === 'DRAW'),
              1,
            );
          }),
      ],
      [
        'malformed (non-JSON) bytes under a matching pin',
        () =>
          cohort.loadTampered((pins, b) => {
            const bad = Buffer.from('{not json');
            b.set('R50_HANDOFF_INDEX', bad);
            const pin = pins.find((p) => p.role === 'R50_HANDOFF_INDEX')!;
            pins[pins.indexOf(pin)] = {
              ...pin,
              sha256: createHash('sha256').update(bad).digest('hex'),
            };
          }),
      ],
      [
        'unreadable artifacts (the production loader with a failing reader)',
        () =>
          loadEvaluationCohortRegistry(undefined, '/nonexistent-b30/', () => {
            throw new Error('EACCES');
          }),
      ],
    ];

    it.each(cases)('%s refuses as AUTHORITY_UNAVAILABLE', async (_name, load) => {
      const db = baseDb();
      db.claims.push(claim(C1, ELIGIBLE));
      const { pool, statements } = fakePool(db);
      const refusal = await refusalOf(
        planOrganisationResearch(pool, request(ELIGIBLE), { loadCohortRegistry: load }),
      );
      expect(refusal.toJSON()).toMatchObject({
        kind: 'AUTHORITY_UNAVAILABLE',
        reason: 'COHORT_METADATA_UNVERIFIED',
      });
      expect(statements).toEqual([]);
    });

    it('a structurally inconsistent registry (protected organisation absent from the frame) refuses', async () => {
      const result = cohort.loadTampered((pins, b) => {
        const frame = {
          generationId: 'GEN_SYNTHETIC_B30',
          counts: { excludedHistoricalDevelopmentCount: 0 },
          entries: [],
        };
        const buf = Buffer.from(JSON.stringify(frame));
        b.set('FRAME', buf);
        const pin = pins.find((p) => p.role === 'FRAME')!;
        pins[pins.indexOf(pin)] = {
          ...pin,
          sha256: createHash('sha256').update(buf).digest('hex'),
        };
      });
      expect(result.ok).toBe(false);
      const { pool } = fakePool(baseDb());
      const refusal = await refusalOf(
        planOrganisationResearch(pool, request(ELIGIBLE), { loadCohortRegistry: () => result }),
      );
      expect(refusal.reason).toBe('COHORT_METADATA_UNVERIFIED');
    });

    it('omitting the loader uses the COMMITTED pinned artifacts, which never admit a synthetic organisation', async () => {
      const { pool } = fakePool(baseDb());
      const refusal = await refusalOf(planOrganisationResearch(pool, request(ELIGIBLE), {}));
      // A synthetic identity is outside the committed frame: refused, and
      // reported as an absent identity authority (it is in no protected list).
      expect(refusal.reason).toBe('RESEARCH_IDENTITY_AUTHORITY_ABSENT');
    });
  });

  describe('INTERNAL ERRORS are refusals, never permission', () => {
    it('a loader that throws', async () => {
      const { pool } = fakePool(baseDb());
      const refusal = await refusalOf(
        planOrganisationResearch(pool, request(ELIGIBLE), {
          loadCohortRegistry: () => {
            throw new TypeError('boom');
          },
        }),
      );
      expect(refusal.toJSON()).toMatchObject({
        kind: 'AUTHORITY_UNAVAILABLE',
        reason: 'GUARD_INTERNAL_ERROR',
      });
    });

    it('a loader that returns a malformed "ok" registry', async () => {
      const { pool } = fakePool(baseDb());
      const refusal = await refusalOf(
        planOrganisationResearch(pool, request(ELIGIBLE), {
          loadCohortRegistry: () => ({ ok: true, registry: {} as never }),
        }),
      );
      expect(refusal.reason).toBe('GUARD_INTERNAL_ERROR');
    });

    it('a database failure, whose text is kept as cause and never in the refusal', async () => {
      const { pool } = fakePool(baseDb(), { fail: /website_claims/ });
      const refusal = await refusalOf(planOrganisationResearch(pool, request(ELIGIBLE), deps));
      expect(refusal.reason).toBe('GUARD_INTERNAL_ERROR');
      expect((refusal.cause as Error).message).toContain('connection reset');
      expect(refusal.message).not.toContain('connection reset');
      expect(JSON.stringify(refusal)).not.toContain('connection reset');
    });
  });
});

// ============================================================================

describe('B3.0 runOrganisationDiscovery - called DIRECTLY, without the CLI', () => {
  const refusedScenarios: [
    string,
    () => { db: FakeDb; who: SyntheticIdentity; d?: ResearchCohortGuardDeps },
    ResearchCohortRefusalReason,
  ][] = [
    [
      'protected organisation with a claim and a promotion',
      () => {
        const db = baseDb();
        db.claims.push(claim(C1, PROTECTED));
        db.promotions.push(promotion(P1, PROTECTED));
        return { db, who: PROTECTED };
      },
      'COHORT_INELIGIBLE',
    ],
    [
      'eligible organisation with a promoted root bound to a protected organisation',
      () => {
        const db = baseDb();
        db.claims.push(claim(C1, ELIGIBLE));
        db.promotions.push(promotion(P1, ELIGIBLE, { organisation_id: PROTECTED.organisationId }));
        return { db, who: ELIGIBLE };
      },
      'ROOT_ORGANISATION_MISMATCH',
    ],
    [
      'organisation outside the evaluation frame, with a claim',
      () => {
        const db = baseDb();
        db.claims.push(claim(C1, OUTSIDE_FRAME));
        return { db, who: OUTSIDE_FRAME };
      },
      'RESEARCH_IDENTITY_AUTHORITY_ABSENT',
    ],
    [
      'unverifiable authority',
      () => {
        const db = baseDb();
        db.claims.push(claim(C1, ELIGIBLE));
        return {
          db,
          who: ELIGIBLE,
          d: { loadCohortRegistry: () => cohort.loadTampered((_, b) => b.set('DRAW', null)) },
        };
      },
      'COHORT_METADATA_UNVERIFIED',
    ],
  ];

  it.each(refusedScenarios)(
    '%s: refused with ZERO startRun, ZERO writes, ZERO DNS and ZERO HTTP',
    async (_name, setup, reason) => {
      const { db, who, d } = setup();
      const { pool, statements } = fakePool(db);
      const { transport, calls } = countingTransport();
      const refusal = await refusalOf(
        runOrganisationDiscovery(
          pool,
          { ...request(who), networkVantage: 'test' },
          { ...(d ?? deps), transport },
        ),
      );
      expect(refusal.reason).toBe(reason);
      expect(writesIn(statements)).toEqual([]);
      expect(statements.some((s) => s.includes('orgunit_research_runs'))).toBe(false);
      expect(calls).toEqual({ dns: 0, http: 0 });
    },
  );

  it('an ELIGIBLE organisation passes the guard and its FIRST write is startRun', async () => {
    const db = baseDb();
    db.claims.push(claim(C1, ELIGIBLE));
    const { pool, statements } = fakePool(db);
    const { transport, calls } = countingTransport();
    await expect(
      runOrganisationDiscovery(
        pool,
        { ...request(ELIGIBLE), networkVantage: 'test' },
        { ...deps, transport },
      ),
    ).rejects.toBeInstanceOf(UnexpectedStatement);
    const firstWrite = writesIn(statements)[0];
    expect(firstWrite).toMatch(/^INSERT INTO orgunit_research_runs/);
    expect(calls).toEqual({ dns: 0, http: 0 });
  });

  it('a dry-run plan is never a token: execution re-evaluates, and refuses once the authority changes', async () => {
    const db = baseDb();
    db.claims.push(claim(C1, ELIGIBLE));
    const { pool, statements } = fakePool(db);
    const plan = await planOrganisationResearch(pool, request(ELIGIBLE), deps);
    expect(plan.roots).toHaveLength(1);

    // The pinned authority moves on (say, a reviewed pin now protects it).
    cohort.protect(ELIGIBLE, 'DRAW_RESERVE');
    const { transport, calls } = countingTransport();
    const refusal = await refusalOf(
      runOrganisationDiscovery(
        pool,
        { ...request(ELIGIBLE), networkVantage: 'test' },
        { ...deps, transport },
      ),
    );
    expect(refusal.kind).toBe('PROTECTED_OR_INELIGIBLE');
    expect(writesIn(statements)).toEqual([]);
    expect(calls).toEqual({ dns: 0, http: 0 });
  });

  it('runOrganisationDiscovery accepts no plan, flag or override - only the request and its deps', () => {
    expect(runOrganisationDiscovery.length).toBe(2);
  });
});

// ============================================================================

describe('B3.0 runRootAcquisition - the per-root guard, called DIRECTLY by an internal caller', () => {
  async function acquire(
    db: FakeDb,
    ref: Parameters<typeof runRootAcquisition>[2],
    d: ResearchCohortGuardDeps = deps,
  ) {
    const { pool, statements } = fakePool(db);
    const { transport, calls } = countingTransport();
    const outcome = await runRootAcquisition(pool, RUN_ID, ref, { ...d, transport }).then(
      (summary) => ({ summary, refusal: null as ResearchCohortRefusal | null, error: null }),
      (error: unknown) =>
        error instanceof ResearchCohortRefusal
          ? { summary: null, refusal: error, error: null }
          : { summary: null, refusal: null, error },
    );
    return { ...outcome, statements, calls };
  }

  it('a PROTECTED claim root is refused before any request', async () => {
    const db = baseDb();
    db.claims.push(claim(C1, PROTECTED));
    const r = await acquire(db, { kind: 'WEBSITE_CLAIM', websiteClaimId: C1 });
    expect(r.refusal?.reason).toBe('COHORT_INELIGIBLE');
    expect(writesIn(r.statements)).toEqual([]);
    expect(r.calls).toEqual({ dns: 0, http: 0 });
  });

  it('a PROTECTED promoted root is refused before any request', async () => {
    const db = baseDb();
    db.promotions.push(promotion(P1, PROTECTED));
    const r = await acquire(db, { kind: 'ROOT_PROMOTION', promotionId: P1 });
    expect(r.refusal?.reason).toBe('COHORT_INELIGIBLE');
    expect(writesIn(r.statements)).toEqual([]);
    expect(r.calls).toEqual({ dns: 0, http: 0 });
  });

  it('a protected key whose root records no organisation id is still refused', async () => {
    const db = baseDb();
    db.claims.push(claim(C1, PROTECTED, { organisation_id: null }));
    const r = await acquire(db, { kind: 'WEBSITE_CLAIM', websiteClaimId: C1 });
    expect(r.refusal?.reason).toBe('COHORT_INELIGIBLE');
    expect(r.calls).toEqual({ dns: 0, http: 0 });
  });

  it('a root whose recorded organisation is not the owner of its key is refused', async () => {
    const db = baseDb();
    db.claims.push(claim(C1, ELIGIBLE, { organisation_id: PROTECTED.organisationId }));
    const r = await acquire(db, { kind: 'WEBSITE_CLAIM', websiteClaimId: C1 });
    expect(r.refusal?.reason).toBe('ROOT_ORGANISATION_MISMATCH');
    expect(r.calls).toEqual({ dns: 0, http: 0 });
  });

  it('AMBIGUOUS attribution: a promoted root whose key names no organisation is refused', async () => {
    const db = baseDb();
    db.promotions.push(
      promotion(
        P1,
        { organisationId: OUTSIDE_FRAME.organisationId, echeRowKey: 'T ORPHAN|9' },
        {
          organisation_id: null,
        },
      ),
    );
    const r = await acquire(db, { kind: 'ROOT_PROMOTION', promotionId: P1 });
    expect(r.refusal?.reason).toBe('ROOT_ORGANISATION_UNRESOLVED');
    expect(r.calls).toEqual({ dns: 0, http: 0 });
  });

  it('AMBIGUOUS attribution: a key that names two organisations is refused', async () => {
    const db = baseDb();
    db.organisations.push({
      id: OUTSIDE_FRAME.organisationId + '0',
      eche_row_key: ELIGIBLE.echeRowKey,
    });
    db.claims.push(claim(C1, ELIGIBLE, { organisation_id: null }));
    const r = await acquire(db, { kind: 'WEBSITE_CLAIM', websiteClaimId: C1 });
    expect(r.refusal?.reason).toBe('ROOT_ORGANISATION_UNRESOLVED');
  });

  it('an eligible root cannot be appended to a run whose evidence already names a protected organisation', async () => {
    const db = baseDb();
    db.claims.push(claim(C1, ELIGIBLE));
    db.runFetchKeys[RUN_ID] = [PROTECTED.echeRowKey];
    const r = await acquire(db, { kind: 'WEBSITE_CLAIM', websiteClaimId: C1 });
    expect(r.refusal?.reason).toBe('COHORT_INELIGIBLE');
    expect(r.calls).toEqual({ dns: 0, http: 0 });
  });

  it('an OUTSIDE-FRAME claim root is refused before any request', async () => {
    const db = baseDb();
    db.claims.push(claim(C1, OUTSIDE_FRAME));
    const r = await acquire(db, { kind: 'WEBSITE_CLAIM', websiteClaimId: C1 });
    expect(r.refusal?.reason).toBe('RESEARCH_IDENTITY_AUTHORITY_ABSENT');
    expect(writesIn(r.statements)).toEqual([]);
    expect(r.calls).toEqual({ dns: 0, http: 0 });
  });

  it('an outside-frame root in a run naming a PROTECTED key is refused as protected (protection first)', async () => {
    const db = baseDb();
    db.claims.push(claim(C1, OUTSIDE_FRAME));
    db.runFetchKeys[RUN_ID] = [PROTECTED.echeRowKey];
    const r = await acquire(db, { kind: 'WEBSITE_CLAIM', websiteClaimId: C1 });
    expect(r.refusal?.reason).toBe('COHORT_INELIGIBLE');
    expect(r.calls).toEqual({ dns: 0, http: 0 });
  });

  it('unverifiable authority refuses the root too', async () => {
    const db = baseDb();
    db.claims.push(claim(C1, ELIGIBLE));
    const r = await acquire(
      db,
      { kind: 'WEBSITE_CLAIM', websiteClaimId: C1 },
      {
        loadCohortRegistry: () => cohort.loadTampered((_, b) => b.set('FRAME', Buffer.from('{}'))),
      },
    );
    expect(r.refusal?.kind).toBe('AUTHORITY_UNAVAILABLE');
    expect(r.calls).toEqual({ dns: 0, http: 0 });
  });

  it('an ELIGIBLE root passes the guard: the next statement is the gateway reading its run', async () => {
    const db = baseDb();
    db.claims.push(claim(C1, ELIGIBLE));
    const r = await acquire(db, { kind: 'WEBSITE_CLAIM', websiteClaimId: C1 });
    expect(r.refusal).toBeNull();
    expect(r.error).toBeInstanceOf(UnexpectedStatement);
    expect(r.statements.at(-1)).toMatch(/FROM orgunit_research_runs r/);
    expect(r.statements.at(-2)).toBe(
      'SELECT rule_version FROM orgunit_research_runs WHERE id = $1',
    );
    expect(writesIn(r.statements)).toEqual([]);
  });
});

// ============================================================================

describe('B3.0 nwf-pe orgunits discover - dry run and --execute', () => {
  let stdout = '';
  let stderr = '';
  beforeEach(() => {
    stdout = '';
    stderr = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdout += String(chunk);
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      stderr += String(chunk);
      return true;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    cliPool.current = null;
  });

  function useDb(db: FakeDb): string[] {
    const { pool, statements } = fakePool(db);
    cliPool.current = pool;
    return statements;
  }

  it('dry run, ELIGIBLE: shows the ordinary plan, exit 0, reads only', async () => {
    const db = baseDb();
    db.claims.push(claim(C1, ELIGIBLE));
    db.promotions.push(promotion(P1, ELIGIBLE));
    const statements = useDb(db);
    const code = await runOrgunitsDiscover(
      { organisationId: ELIGIBLE.organisationId, execute: false, json: true },
      deps,
    );
    expect(code).toBe(0);
    const out = JSON.parse(stdout) as Record<string, unknown>;
    expect(out).toMatchObject({ mode: 'DRY_RUN', eligibility: 'ELIGIBLE' });
    expect((out.roots as unknown[]).length).toBe(2);
    expect(out.note).toContain('No DNS lookup and no HTTP request were made');
    expect(writesIn(statements)).toEqual([]);
  });

  it('dry run, PROTECTED: generic refusal, no root list, no key, exit 1, reads only', async () => {
    const db = baseDb();
    db.claims.push(claim(C1, PROTECTED));
    const statements = useDb(db);
    const code = await runOrgunitsDiscover(
      { organisationId: PROTECTED.organisationId, execute: false, json: true },
      deps,
    );
    expect(code).toBe(1);
    const out = JSON.parse(stdout) as Record<string, unknown>;
    expect(out).toEqual({
      mode: 'DRY_RUN',
      organisationId: PROTECTED.organisationId,
      eligibility: 'REFUSED',
      refusal: {
        code: RESEARCH_COHORT_REFUSAL_CODE,
        kind: 'PROTECTED_OR_INELIGIBLE',
        reason: 'COHORT_INELIGIBLE',
      },
      note: 'No research run was created. No DNS lookup and no HTTP request were made.',
    });
    expect(stdout).not.toContain(PROTECTED.echeRowKey);
    expect(stdout).not.toContain(C1);
    expect(writesIn(statements)).toEqual([]);
  });

  it('dry run, PROTECTED, human mode: one generic line, no key, no root', async () => {
    const db = baseDb();
    db.claims.push(claim(C1, PROTECTED));
    useDb(db);
    const code = await runOrgunitsDiscover(
      { organisationId: PROTECTED.organisationId, execute: false, json: false },
      deps,
    );
    expect(code).toBe(1);
    expect(stderr).toContain(RESEARCH_COHORT_REFUSAL_CODE);
    expect(stderr).not.toContain(PROTECTED.echeRowKey);
    expect(stderr).not.toContain(C1);
    expect(stdout).toBe('');
  });

  it('--execute, PROTECTED, with NO prior dry run: refused, no run, no write, exit 1', async () => {
    const db = baseDb();
    db.claims.push(claim(C1, PROTECTED));
    const statements = useDb(db);
    const code = await runOrgunitsDiscover(
      { organisationId: PROTECTED.organisationId, execute: true, json: true },
      deps,
    );
    expect(code).toBe(1);
    expect(JSON.parse(stdout)).toMatchObject({ mode: 'EXECUTE', eligibility: 'REFUSED' });
    expect(writesIn(statements)).toEqual([]);
  });

  it('--execute after an ELIGIBLE dry run is re-guarded: a changed authority refuses it', async () => {
    const db = baseDb();
    db.claims.push(claim(C1, ELIGIBLE));
    const statements = useDb(db);
    expect(
      await runOrgunitsDiscover(
        { organisationId: ELIGIBLE.organisationId, execute: false, json: true },
        deps,
      ),
    ).toBe(0);
    stdout = '';
    cohort.protect(ELIGIBLE, 'HISTORICAL');
    const code = await runOrgunitsDiscover(
      { organisationId: ELIGIBLE.organisationId, execute: true, json: true },
      deps,
    );
    expect(code).toBe(1);
    expect(JSON.parse(stdout)).toMatchObject({
      mode: 'EXECUTE',
      eligibility: 'REFUSED',
      refusal: { kind: 'PROTECTED_OR_INELIGIBLE' },
    });
    expect(writesIn(statements)).toEqual([]);
  });

  it('identity conflict and unavailable authority are refused in both modes with zero writes', async () => {
    const db = baseDb();
    db.claims.push(claim(C1, ELIGIBLE, { organisation_id: OTHER_ELIGIBLE.organisationId }));
    for (const execute of [false, true]) {
      stdout = '';
      const statements = useDb(db);
      expect(
        await runOrgunitsDiscover(
          { organisationId: ELIGIBLE.organisationId, execute, json: true },
          deps,
        ),
      ).toBe(1);
      expect(JSON.parse(stdout).refusal.kind).toBe('IDENTITY_CONFLICT');
      expect(writesIn(statements)).toEqual([]);

      stdout = '';
      const s2 = useDb(baseDb());
      expect(
        await runOrgunitsDiscover(
          { organisationId: ELIGIBLE.organisationId, execute, json: true },
          { loadCohortRegistry: () => cohort.loadTampered((_, b) => b.set('DRAW', null)) },
        ),
      ).toBe(1);
      expect(JSON.parse(stdout).refusal.kind).toBe('AUTHORITY_UNAVAILABLE');
      expect(writesIn(s2)).toEqual([]);
    }
  });
});

// ============================================================================
describe('B3.0-R1 decideResearchEligibility - research policy over the UNCHANGED classifier verdict', () => {
  function registry(): EvaluationCohortRegistry {
    const loaded = cohort.load();
    if (!loaded.ok) throw new Error('synthetic registry failed to verify');
    return loaded.registry;
  }
  const subject = (i: SyntheticIdentity, runEcheRowKeys: string[] = []) => ({
    organisationId: i.organisationId,
    echeRowKey: i.echeRowKey,
    runEcheRowKeys,
  });

  it.each([
    ['frame member in no protected list', () => subject(ELIGIBLE), 'ALLOWED', null],
    [
      'protected organisation',
      () => subject(PROTECTED),
      'EVALUATION_COHORT_PROTECTED',
      'COHORT_INELIGIBLE',
    ],
    [
      'protected key under a re-ingested UUID',
      () => ({ ...subject(PROTECTED), organisationId: '00000000-0000-4000-8000-0000000b30af' }),
      'EVALUATION_COHORT_CONFLICT',
      'COHORT_INELIGIBLE',
    ],
    [
      'protected UUID under a changed key',
      () => ({ ...subject(PROTECTED), echeRowKey: 'T B30 REKEYED|300000012' }),
      'EVALUATION_COHORT_CONFLICT',
      'COHORT_INELIGIBLE',
    ],
    [
      'eligible organisation whose run names a protected key',
      () => subject(ELIGIBLE, [PROTECTED.echeRowKey]),
      'EVALUATION_COHORT_PROTECTED',
      'COHORT_INELIGIBLE',
    ],
    [
      'outside-frame organisation',
      () => subject(OUTSIDE_FRAME),
      'EVALUATION_COHORT_IDENTITY_UNVERIFIED',
      'RESEARCH_IDENTITY_AUTHORITY_ABSENT',
    ],
    [
      'outside-frame organisation whose run names a protected key',
      () => subject(OUTSIDE_FRAME, [PROTECTED.echeRowKey]),
      'EVALUATION_COHORT_PROTECTED',
      'COHORT_INELIGIBLE',
    ],
  ] as const)('%s: classifier verdict %s -> research %s', (_name, make, verdict, reason) => {
    const reg = registry();
    // The classifier's own verdict is exactly what it was: unchanged semantics.
    expect(evaluateCohortMembership(reg, make()).kind).toBe(verdict);
    expect(decideResearchEligibility(reg, make())).toEqual(
      reason === null ? { eligible: true } : { eligible: false, reason },
    );
  });

  it('research is never MORE permissive than the classifier: eligible implies ALLOWED', () => {
    const reg = registry();
    for (const i of [ELIGIBLE, PROTECTED, OUTSIDE_FRAME, OTHER_ELIGIBLE]) {
      for (const run of [[], [PROTECTED.echeRowKey], [OUTSIDE_FRAME.echeRowKey]]) {
        const s = subject(i, run);
        if (decideResearchEligibility(reg, s).eligible) {
          expect(evaluateCohortMembership(reg, s).kind).toBe('ALLOWED');
        }
      }
    }
  });
});
