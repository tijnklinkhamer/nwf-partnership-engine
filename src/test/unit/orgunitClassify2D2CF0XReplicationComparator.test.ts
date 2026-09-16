/**
 * PHASE 2B-2D2C-F0X — THE SHARED ATTEMPT-1 COMPARATOR PRECONDITION.
 *
 * The N=5 replication scorer's Recovery-1 invocation refused on a
 * comparator precondition that was structurally unsatisfiable: it required
 * F0I's and F0O's whole `scoring.comparatorPolicy.attempt1` objects to be
 * equal, while those objects deliberately carry DIFFERENT attempt-local
 * namespace assertions (`neverInsideAttempt3Namespace` in F0I,
 * `neverInsideAttempt4Namespace` in F0O). No freeze was wrong; the check was.
 *
 * These tests run against the REAL committed F0I and F0O freeze bytes and
 * prove the corrected check accepts exactly them, still refuses every real
 * provenance disagreement, and fails closed on an unexamined field.
 *
 * NOTHING HERE SCORES. No scorer entry point is invoked, no gold label,
 * supplement, adjudication record or DEV/HOLDOUT fixture is opened, no
 * provider is called, and no file is written. Every read is tracked and
 * asserted against an explicit allow-list at the end.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { canonicalStringify } from '../../orgunits/classify/canonical.js';
import { F0I_FREEZE_PATH, loadF0IFreezeFromBytes } from '../harness/phase2b2d2c/f0i/freezeF0I.js';
import { F0O_FREEZE_PATH, loadF0OFreezeFromBytes } from '../harness/phase2b2d2c/f0o/freezeF0O.js';
import { F0V_FREEZE_PATH } from '../harness/phase2b2d2c/f0v/freezeF0V.js';
import {
  assertSharedAttempt1Comparator,
  F0I_ATTEMPT_1_NAMESPACE_ASSERTION,
  F0O_ATTEMPT_1_NAMESPACE_ASSERTION,
  sharedAttempt1ComparatorIdentity,
  SHARED_ATTEMPT_1_COMPARATOR_FIELDS,
} from '../harness/phase2b2d2c/scoring/replicationComparator.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const COMPARATOR_MODULE = 'src/test/harness/phase2b2d2c/scoring/replicationComparator.ts';

/** Every file this test opens, so the last assertions can prove what was NOT opened. */
const READ_PATHS: string[] = [];
function readBytes(relativePath: string): Buffer {
  READ_PATHS.push(relativePath);
  return readFileSync(join(ROOT, relativePath));
}
function read(relativePath: string): string {
  return readBytes(relativePath).toString('utf8');
}

type Attempt1 = Record<string, unknown>;

function attempt1Of(freezePath: string): Attempt1 {
  return (
    JSON.parse(read(freezePath)) as {
      scoring: { comparatorPolicy: { attempt1: Attempt1 } };
    }
  ).scoring.comparatorPolicy.attempt1;
}

const F0I_ATTEMPT_1 = attempt1Of(F0I_FREEZE_PATH);
const F0O_ATTEMPT_1 = attempt1Of(F0O_FREEZE_PATH);

/** The two freezes are historical evidence: this file proves it never touched them. */
const FREEZE_BYTES_AT_LOAD = [F0I_FREEZE_PATH, F0O_FREEZE_PATH].map((path) => [
  path,
  createHash('sha256')
    .update(readFileSync(join(ROOT, path)))
    .digest('hex'),
]);

afterAll(() => {
  expect(
    [F0I_FREEZE_PATH, F0O_FREEZE_PATH].map((path) => [
      path,
      createHash('sha256')
        .update(readFileSync(join(ROOT, path)))
        .digest('hex'),
    ]),
  ).toEqual(FREEZE_BYTES_AT_LOAD);
});

/** A copy with one field changed to a different value of the same type. */
function withMutated(attempt1: Attempt1, field: string): Attempt1 {
  const value = attempt1[field];
  const mutated =
    typeof value === 'string'
      ? `${value}-mutated`
      : typeof value === 'number'
        ? value + 1
        : typeof value === 'boolean'
          ? !value
          : 'mutated';
  return { ...attempt1, [field]: mutated };
}

function without(attempt1: Attempt1, field: string): Attempt1 {
  const copy = { ...attempt1 };
  delete copy[field];
  return copy;
}

describe('2D2C-F0X: the shared attempt-1 comparator identity, over the REAL F0I/F0O freeze bytes', () => {
  it('accepts the real F0I/F0O pair and returns the seven shared provenance fields', () => {
    const shared = assertSharedAttempt1Comparator(F0I_ATTEMPT_1, F0O_ATTEMPT_1);
    expect(Object.keys(shared).sort()).toEqual([...SHARED_ATTEMPT_1_COMPARATOR_FIELDS].sort());
    // The attempt-local assertions are NOT part of the shared identity.
    expect(Object.hasOwn(shared, F0I_ATTEMPT_1_NAMESPACE_ASSERTION)).toBe(false);
    expect(Object.hasOwn(shared, F0O_ATTEMPT_1_NAMESPACE_ASSERTION)).toBe(false);
    expect(shared).toEqual({
      freezeRawSha256: 'c3f0a76b3a5939f3e4bf395d46237cf0b0f365fa1f4bf019092a6944849d6157',
      artifactInventorySha256: 'ee17e1f2ee8021e59c06377342042e56f84269165f8ec39521011cb1d3538137',
      artifactCount: 243,
      authorisationSha256: '46d1bd9ebed544f7ebf463f26ff6ec7cca89d8a9d849fdfd04a42412dc2d5705',
      planSha256: '05cb6984a57a871ac6b0a0720ab2fefceb5b5843f440dbf7831abdf9bfc82f6c',
      adjudicatedResults:
        'docs/evaluation/results/phase2b-2d2c-dev-attribution-attempt-1-gold-v1-adjudicated',
      readOnly: true,
    });
  });

  it('accepts the pair as the SCORER sees it — schema-parsed, not raw JSON', () => {
    // The scorer compares the zod-parsed freezes. `looseObject` is what carries
    // `adjudicatedResults` through undeclared; if a schema change ever dropped a
    // shared field, the projection would be comparing less than it claims.
    const parsedAttempt1 = (freeze: { scoring: { comparatorPolicy: { attempt1: unknown } } }) =>
      freeze.scoring.comparatorPolicy.attempt1;
    const f0i = parsedAttempt1(loadF0IFreezeFromBytes(readBytes(F0I_FREEZE_PATH)).freeze);
    const f0o = parsedAttempt1(loadF0OFreezeFromBytes(readBytes(F0O_FREEZE_PATH)).freeze);
    expect(Object.keys(f0i as object).sort()).toEqual(
      [...SHARED_ATTEMPT_1_COMPARATOR_FIELDS, F0I_ATTEMPT_1_NAMESPACE_ASSERTION].sort(),
    );
    expect(Object.keys(f0o as object).sort()).toEqual(
      [...SHARED_ATTEMPT_1_COMPARATOR_FIELDS, F0O_ATTEMPT_1_NAMESPACE_ASSERTION].sort(),
    );
    expect(assertSharedAttempt1Comparator(f0i, f0o)).toEqual(
      assertSharedAttempt1Comparator(F0I_ATTEMPT_1, F0O_ATTEMPT_1),
    );
  });

  it('the OLD whole-object equality fails on the real pair, for exactly the namespace key and nothing else', () => {
    // This is the refusal that stopped the authorised Recovery-1 scoring run.
    expect(canonicalStringify(F0I_ATTEMPT_1)).not.toEqual(canonicalStringify(F0O_ATTEMPT_1));

    // Each freeze carries its OWN assertion, and only its own.
    expect(F0I_ATTEMPT_1[F0I_ATTEMPT_1_NAMESPACE_ASSERTION]).toBe(true);
    expect(F0O_ATTEMPT_1[F0O_ATTEMPT_1_NAMESPACE_ASSERTION]).toBe(true);
    expect(Object.hasOwn(F0I_ATTEMPT_1, F0O_ATTEMPT_1_NAMESPACE_ASSERTION)).toBe(false);
    expect(Object.hasOwn(F0O_ATTEMPT_1, F0I_ATTEMPT_1_NAMESPACE_ASSERTION)).toBe(false);

    // Remove the two attempt-local keys and the remainder is byte-identical:
    // the whole-object difference WAS the intentional namespace key, nothing more.
    const strip = (attempt1: Attempt1): Attempt1 =>
      without(
        without(attempt1, F0I_ATTEMPT_1_NAMESPACE_ASSERTION),
        F0O_ATTEMPT_1_NAMESPACE_ASSERTION,
      );
    expect(canonicalStringify(strip(F0I_ATTEMPT_1))).toEqual(
      canonicalStringify(strip(F0O_ATTEMPT_1)),
    );
    // And that remainder is exactly the shared identity — no field went unexamined.
    expect(Object.keys(strip(F0I_ATTEMPT_1)).sort()).toEqual(
      [...SHARED_ATTEMPT_1_COMPARATOR_FIELDS].sort(),
    );
  });

  it('refuses a disagreement in EACH shared provenance field, from either side', () => {
    for (const field of SHARED_ATTEMPT_1_COMPARATOR_FIELDS) {
      expect(
        () => assertSharedAttempt1Comparator(withMutated(F0I_ATTEMPT_1, field), F0O_ATTEMPT_1),
        `F0I ${field}`,
      ).toThrow(new RegExp(`different attempt-1 comparators.*${field}`));
      expect(
        () => assertSharedAttempt1Comparator(F0I_ATTEMPT_1, withMutated(F0O_ATTEMPT_1, field)),
        `F0O ${field}`,
      ).toThrow(new RegExp(`different attempt-1 comparators.*${field}`));
    }
  });

  it('refuses F0I unless its OWN attempt-3 namespace assertion is exactly true', () => {
    for (const value of [false, 'true', 1, null]) {
      expect(() =>
        assertSharedAttempt1Comparator(
          { ...F0I_ATTEMPT_1, [F0I_ATTEMPT_1_NAMESPACE_ASSERTION]: value },
          F0O_ATTEMPT_1,
        ),
      ).toThrow(new RegExp(`F0I freeze.*${F0I_ATTEMPT_1_NAMESPACE_ASSERTION} is not true`));
    }
  });

  it('refuses F0O unless its OWN attempt-4 namespace assertion is exactly true', () => {
    for (const value of [false, 'true', 1, null]) {
      expect(() =>
        assertSharedAttempt1Comparator(F0I_ATTEMPT_1, {
          ...F0O_ATTEMPT_1,
          [F0O_ATTEMPT_1_NAMESPACE_ASSERTION]: value,
        }),
      ).toThrow(new RegExp(`F0O freeze.*${F0O_ATTEMPT_1_NAMESPACE_ASSERTION} is not true`));
    }
  });

  it('fails closed on a missing shared field, a missing namespace assertion, or an unexamined extra field', () => {
    for (const field of SHARED_ATTEMPT_1_COMPARATOR_FIELDS) {
      expect(
        () => assertSharedAttempt1Comparator(without(F0I_ATTEMPT_1, field), F0O_ATTEMPT_1),
        `F0I without ${field}`,
      ).toThrow(new RegExp(`F0I freeze.*missing ${field}`));
      expect(
        () => assertSharedAttempt1Comparator(F0I_ATTEMPT_1, without(F0O_ATTEMPT_1, field)),
        `F0O without ${field}`,
      ).toThrow(new RegExp(`F0O freeze.*missing ${field}`));
    }
    expect(() =>
      assertSharedAttempt1Comparator(
        without(F0I_ATTEMPT_1, F0I_ATTEMPT_1_NAMESPACE_ASSERTION),
        F0O_ATTEMPT_1,
      ),
    ).toThrow(new RegExp(`F0I freeze.*missing ${F0I_ATTEMPT_1_NAMESPACE_ASSERTION}`));

    expect(() =>
      assertSharedAttempt1Comparator(
        { ...F0I_ATTEMPT_1, comparatorSourceAddedLater: 'x' },
        F0O_ATTEMPT_1,
      ),
    ).toThrow(/unexamined field\(s\) comparatorSourceAddedLater/);

    // One freeze's assertion is never accepted in place of the other's: F0I
    // carrying the attempt-4 key is an unexamined field, not a substitute.
    expect(() =>
      assertSharedAttempt1Comparator(
        { ...F0I_ATTEMPT_1, [F0O_ATTEMPT_1_NAMESPACE_ASSERTION]: true },
        F0O_ATTEMPT_1,
      ),
    ).toThrow(new RegExp(`unexamined field\\(s\\) ${F0O_ATTEMPT_1_NAMESPACE_ASSERTION}`));
    expect(() =>
      assertSharedAttempt1Comparator(
        {
          ...without(F0I_ATTEMPT_1, F0I_ATTEMPT_1_NAMESPACE_ASSERTION),
          [F0O_ATTEMPT_1_NAMESPACE_ASSERTION]: true,
        },
        F0O_ATTEMPT_1,
      ),
    ).toThrow(new RegExp(`F0I freeze.*missing ${F0I_ATTEMPT_1_NAMESPACE_ASSERTION}`));

    for (const notAnObject of [null, [], 'attempt1', 42]) {
      expect(() =>
        sharedAttempt1ComparatorIdentity(
          notAnObject,
          F0I_ATTEMPT_1_NAMESPACE_ASSERTION,
          'the F0I freeze',
        ),
      ).toThrow(/is not an object/);
    }
  });
});

describe('2D2C-F0X: this precondition test scores nothing and opens no label source', () => {
  it('the comparator helper is pure: no filesystem, network, database, clock or gold reach', () => {
    const source = read(COMPARATOR_MODULE);
    const code = source.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const capability of [
      'node:fs',
      'node:http',
      'node:https',
      'node:child_process',
      'readFileSync',
      'writeFileSync',
      'mkdirSync',
      'Date.now',
      'Math.random',
      'process.env',
      './supplement.js',
      './adjudication.js',
      './gold.js',
      'runReplicationStudyScoring',
    ]) {
      expect(code.includes(capability), `${COMPARATOR_MODULE} names ${capability}`).toBe(false);
    }
  });

  it('opened only the two freezes and the helper source — no holdout, mixed, gold or label file', () => {
    const forbidden = (
      JSON.parse(read(F0V_FREEZE_PATH)) as { holdout: { forbiddenFiles: string[] } }
    ).holdout.forbiddenFiles;
    expect(forbidden).toHaveLength(4);

    // Every read this file can perform, whichever subset of its tests runs.
    const ALLOWED = [F0I_FREEZE_PATH, F0O_FREEZE_PATH, F0V_FREEZE_PATH, COMPARATOR_MODULE];
    const opened = [...new Set(READ_PATHS)].sort();
    expect(opened).toContain(F0I_FREEZE_PATH);
    expect(opened).toContain(F0O_FREEZE_PATH);
    for (const path of opened) expect(ALLOWED, `${path} was opened`).toContain(path);
    for (const path of opened) {
      expect(/holdout/i.test(path), `${path} names the holdout split`).toBe(false);
      expect(forbidden, `${path} is F0V-forbidden`).not.toContain(path);
      expect(
        /label|supplement|adjudication|\.jsonl$/i.test(path),
        `${path} is a label source`,
      ).toBe(false);
    }
  });
});
