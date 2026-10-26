/**
 * Lane L1 - the VerifiedSubjectAdmission capability cannot be forged, and an
 * unverified value reaches neither the database nor the network.
 */
import type pg from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EXECUTION_BLOCKERS } from '../../orgunits/subjectResearch/plan.js';
import {
  VerifiedSubjectAdmission,
  verifySubjectAdmission,
} from '../../orgunits/subjectRun/admission.js';
import {
  BLOCKER_RESOLUTIONS,
  executionRefusalCodeOf,
  listSubjectRuns,
  runSubjectResearch,
  SubjectExecutionRefusal,
} from '../../orgunits/subjectRun/execute.js';

const FIELDS = {
  admissionId: '11111111-1111-4111-8111-111111111111',
  subjectId: '22222222-2222-4222-8222-222222222222',
  rootKey: 'subject_admission:11111111-1111-4111-8111-111111111111',
  rootUrl: 'https://www.nihongo-koryu-example.jp/',
  identityAuthorityScope: 'TEST_ONLY' as const,
};

/** A pool that fails the test if anything touches it. */
const untouchablePool = new Proxy(
  {},
  {
    get(_target, property) {
      throw new Error(`the pool was touched: ${String(property)}`);
    },
  },
) as pg.Pool;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('VerifiedSubjectAdmission is sealed', () => {
  it('recognises only values it constructed', () => {
    const genuine = VerifiedSubjectAdmission.forVitestUnverified(FIELDS);
    expect(VerifiedSubjectAdmission.isVerified(genuine)).toBe(true);
    expect(genuine.provenance).toBe('VITEST_UNVERIFIED');
    for (const forged of [
      { ...FIELDS, provenance: 'DATABASE_VERIFIED' },
      { ...genuine },
      Object.create(VerifiedSubjectAdmission.prototype) as unknown,
      JSON.parse(JSON.stringify(genuine)) as unknown,
      Object.assign(Object.create(VerifiedSubjectAdmission.prototype) as object, genuine),
      null,
      'subject_admission:11111111-1111-4111-8111-111111111111',
    ]) {
      expect(VerifiedSubjectAdmission.isVerified(forged)).toBe(false);
    }
  });

  it('refuses a reflective construction, and the production derivation without its mint', () => {
    expect(() =>
      Reflect.construct(VerifiedSubjectAdmission, [Symbol('forged'), FIELDS, 'DATABASE_VERIFIED']),
    ).toThrow(/cannot be constructed directly/);
    expect(() =>
      VerifiedSubjectAdmission.fromDatabase(Symbol('VerifiedSubjectAdmission.mint'), FIELDS),
    ).toThrow(/cannot be constructed directly/);
  });

  it('is frozen: a capability cannot be repointed at another admission', () => {
    const genuine = VerifiedSubjectAdmission.forVitestUnverified(FIELDS);
    expect(() => {
      (genuine as { admissionId: string }).admissionId = '33333333-3333-4333-8333-333333333333';
    }).toThrow(TypeError);
  });

  it('has its test seam only inside vitest', () => {
    vi.stubEnv('VITEST', 'false');
    expect(() => VerifiedSubjectAdmission.forVitestUnverified(FIELDS)).toThrow(/TEST SEAM/);
  });
});

describe('an unverified value reaches neither the database nor the network', () => {
  it('runSubjectResearch refuses it before touching the pool', async () => {
    const error = await runSubjectResearch(
      untouchablePool,
      { ...FIELDS } as unknown as VerifiedSubjectAdmission,
      { networkVantage: 'test' },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SubjectExecutionRefusal);
    expect(executionRefusalCodeOf(error)).toBe('ADMISSION_CAPABILITY_UNVERIFIED');
    expect(executionRefusalCodeOf(new Error('other'))).toBeNull();
  });

  it('verifySubjectAdmission and listSubjectRuns refuse a malformed subject id without a query', async () => {
    expect(await verifySubjectAdmission(untouchablePool, 'not-a-uuid')).toEqual({
      outcome: 'REFUSED',
      code: 'SUBJECT_ID_INVALID',
      detail: 'subjectId',
    });
    expect(await listSubjectRuns(untouchablePool, "x' OR 1=1 --")).toEqual([]);
  });
});

describe('the R6 execution blockers', () => {
  it('each one is named and resolved, and no other', () => {
    expect(Object.keys(BLOCKER_RESOLUTIONS).sort()).toEqual([...EXECUTION_BLOCKERS].sort());
    for (const resolution of Object.values(BLOCKER_RESOLUTIONS)) {
      expect(resolution).toMatch(/^(LIFTED|LIFTED IN CODE|NOT_NEEDED): /);
    }
  });
});
