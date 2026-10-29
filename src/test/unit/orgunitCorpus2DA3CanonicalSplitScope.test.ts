/**
 * PHASE 2B-2D A3 R4 — PURE SPLIT SCOPING.
 *
 * Every record here is synthetic and invented. No sealed root is read, no
 * path is resolved and nothing touches the filesystem: these tests pin the
 * logical boundary a later scoped reader must be built on.
 */
import { describe, expect, expectTypeOf, it } from 'vitest';
import { A3_GATED_SPLITS, SPLITS, type Split } from '../harness/phase2b2d/a3prep/contracts.js';
import {
  A3_SPLIT_VISIBILITY_BY_SPLIT,
  A3SplitScopeRefusal,
  assertGatedAggregateMatchesScope,
  assertGatedSplitScope,
  assertRecordsMatchSplitScope,
  assertSingleSplitCollection,
  canonicalStorageRootForScope,
  createA3SplitScope,
  isA3GatedSplit,
  isA3SplitScope,
  type A3SplitScope,
  type A3SplitScopeRefusalCode,
} from '../harness/phase2b2d/a3prep/splitScope.js';
import type { A3GatedSplitPublicAggregate } from '../harness/phase2b2d/a3prep/types.js';
import { SEALED_ROOT_BY_SPLIT } from '../harness/phase2b2d/sd7/sd7Contract.js';

function refusalOf(fn: () => unknown): A3SplitScopeRefusal {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(A3SplitScopeRefusal);
    return error as A3SplitScopeRefusal;
  }
  throw new Error('expected an A3SplitScopeRefusal, got none');
}

function expectRefusal(
  fn: () => unknown,
  code: A3SplitScopeRefusalCode,
  detail: {
    recordIndex?: number;
    expectedSplit?: Split;
    actualSplit?: string;
  } = {},
): A3SplitScopeRefusal {
  const refusal = refusalOf(fn);
  expect(refusal.code).toBe(code);
  expect(refusal.recordIndex).toBe(detail.recordIndex);
  expect(refusal.expectedSplit).toBe(detail.expectedSplit);
  expect(refusal.actualSplit).toBe(detail.actualSplit);
  return refusal;
}

const rec = (split?: Split, extra: Record<string, unknown> = {}) =>
  split === undefined ? { ...extra } : { split, ...extra };

function aggregate(split: 'DEV_CONFIRM' | 'FINAL_HOLDOUT'): A3GatedSplitPublicAggregate {
  return {
    visibility: 'GATED_SPLIT_PUBLIC_AGGREGATE_ONLY',
    split,
    organisationCount: 7,
    setPDocumentCount: 11,
    setRDocumentCount: 5,
  };
}

// ---------------------------------------------------------------------------

describe('2D-A3 R4: scope construction', () => {
  it('creates a scope for each canonical split, naming exactly that split', () => {
    for (const split of SPLITS) {
      const scope = createA3SplitScope(split);
      expect(scope.split).toBe(split);
      expect(isA3SplitScope(scope)).toBe(true);
      expect(Object.isFrozen(scope)).toBe(true);
      expect(Object.keys(scope).sort()).toEqual(['split', 'visibility']);
    }
  });

  it('refuses a missing, unknown or near-miss split, and has no default', () => {
    for (const bad of [
      undefined,
      null,
      '',
      'dev_train',
      'DEV-CONFIRM',
      ' FINAL_HOLDOUT',
      'ALL',
      '*',
      0,
      ['DEV_CONFIRM', 'FINAL_HOLDOUT'],
      { split: 'DEV_TRAIN' },
    ]) {
      expectRefusal(() => createA3SplitScope(bad as Split), 'UNKNOWN_SPLIT');
    }
    expectRefusal(() => (createA3SplitScope as unknown as () => unknown)(), 'UNKNOWN_SPLIT');
  });

  it('does not echo a refused split value', () => {
    const refusal = refusalOf(() => createA3SplitScope('SECRET_SPLIT_VALUE_XYZ' as Split));
    expect(refusal.message).not.toContain('SECRET_SPLIT_VALUE_XYZ');
  });

  it('a lookalike scope - literal, spread copy or cast - is not a scope', () => {
    const real = createA3SplitScope('FINAL_HOLDOUT');
    const lookalikes: unknown[] = [
      { split: 'FINAL_HOLDOUT', visibility: 'SEALED_STRICT_HOLDOUT' },
      { ...real },
      Object.assign(Object.create(null), real),
      JSON.parse(JSON.stringify(real)),
    ];
    for (const fake of lookalikes) {
      expect(isA3SplitScope(fake)).toBe(false);
      const asScope = fake as A3SplitScope<'FINAL_HOLDOUT'>;
      expectRefusal(() => canonicalStorageRootForScope(asScope), 'SCOPE_NOT_ISSUED');
      expectRefusal(() => assertRecordsMatchSplitScope(asScope, []), 'SCOPE_NOT_ISSUED');
      expectRefusal(() => assertGatedSplitScope(asScope), 'SCOPE_NOT_ISSUED');
    }
  });

  it('A3SplitScope<Split> is a union of single-split scopes, not one multi-split scope', () => {
    expectTypeOf<A3SplitScope<Split>>().toEqualTypeOf<
      A3SplitScope<'DEV_TRAIN'> | A3SplitScope<'DEV_CONFIRM'> | A3SplitScope<'FINAL_HOLDOUT'>
    >();
    expectTypeOf<A3SplitScope<'DEV_CONFIRM'>['split']>().toEqualTypeOf<'DEV_CONFIRM'>();
  });
});

describe('2D-A3 R4: visibility domains', () => {
  it('gives each split its own, distinct domain', () => {
    expect(A3_SPLIT_VISIBILITY_BY_SPLIT).toEqual({
      DEV_TRAIN: 'INSPECTABLE_DEVELOPMENT',
      DEV_CONFIRM: 'SEALED_GATED_CONFIRMATION',
      FINAL_HOLDOUT: 'SEALED_STRICT_HOLDOUT',
    });
    expect(new Set(Object.values(A3_SPLIT_VISIBILITY_BY_SPLIT)).size).toBe(SPLITS.length);
    expect(Object.isFrozen(A3_SPLIT_VISIBILITY_BY_SPLIT)).toBe(true);
    for (const split of SPLITS) {
      expect(createA3SplitScope(split).visibility).toBe(A3_SPLIT_VISIBILITY_BY_SPLIT[split]);
    }
  });

  it('DEV_CONFIRM and FINAL_HOLDOUT do not collapse into one sealed domain', () => {
    expect(createA3SplitScope('DEV_CONFIRM').visibility).not.toBe(
      createA3SplitScope('FINAL_HOLDOUT').visibility,
    );
    expectTypeOf<A3SplitScope<'DEV_CONFIRM'>>().not.toEqualTypeOf<A3SplitScope<'FINAL_HOLDOUT'>>();
  });
});

describe('2D-A3 R4: canonical root references', () => {
  it('returns exactly the frozen SEALED_ROOT_BY_SPLIT entry for each scope', () => {
    for (const split of SPLITS) {
      expect(canonicalStorageRootForScope(createA3SplitScope(split))).toBe(
        SEALED_ROOT_BY_SPLIT[split],
      );
    }
  });

  it('pins the three committed relative roots verbatim', () => {
    expect(canonicalStorageRootForScope(createA3SplitScope('DEV_TRAIN'))).toBe(
      'Developer/phase2b-2d-methodology-v2/gen1-dev-train',
    );
    expect(canonicalStorageRootForScope(createA3SplitScope('DEV_CONFIRM'))).toBe(
      'Developer/phase2b-2d-methodology-v2-sealed/gen1-dev-confirm',
    );
    expect(canonicalStorageRootForScope(createA3SplitScope('FINAL_HOLDOUT'))).toBe(
      'Developer/phase2b-2d-methodology-v2-sealed-holdout/gen1-final-holdout',
    );
  });

  it('the three roots are distinct, relative and unresolved', () => {
    const roots = SPLITS.map((s) => canonicalStorageRootForScope(createA3SplitScope(s)));
    expect(new Set(roots).size).toBe(3);
    for (const root of roots) {
      expect(root.startsWith('/')).toBe(false);
      expect(root.startsWith('~')).toBe(false);
      expect(root).not.toMatch(/(^|\/)\.\.?(\/|$)/);
      expect(root.endsWith('/')).toBe(false);
    }
  });

  it('no root is a path ancestor of another, so none can stand in for another', () => {
    const roots = SPLITS.map((s) => canonicalStorageRootForScope(createA3SplitScope(s)));
    for (const a of roots) {
      for (const b of roots) {
        if (a === b) continue;
        expect(b.startsWith(`${a}/`), `${a} contains ${b}`).toBe(false);
      }
    }
  });

  it('each split lives under its own top-level directory, not a shared corpus parent', () => {
    const containers = SPLITS.map((s) =>
      canonicalStorageRootForScope(createA3SplitScope(s)).split('/').slice(0, 2).join('/'),
    );
    expect(new Set(containers).size).toBe(3);
  });
});

describe('2D-A3 R4: records against an explicit scope', () => {
  it('an empty collection under an explicit scope is valid', () => {
    for (const split of SPLITS) {
      const empty: { split?: Split }[] = [];
      expect(assertRecordsMatchSplitScope(createA3SplitScope(split), empty)).toBe(empty);
    }
  });

  it('matching records pass and the SAME collection comes back, unfiltered', () => {
    const records = [rec('DEV_CONFIRM', { n: 1 }), rec('DEV_CONFIRM', { n: 2 })];
    const result = assertRecordsMatchSplitScope(createA3SplitScope('DEV_CONFIRM'), records);
    expect(result).toBe(records);
    expect(result).toHaveLength(2);
  });

  it('refuses at the exact index of the first missing token', () => {
    const records = [rec('DEV_TRAIN'), rec('DEV_TRAIN'), rec(), rec()];
    expectRefusal(
      () => assertRecordsMatchSplitScope(createA3SplitScope('DEV_TRAIN'), records),
      'MISSING_SPLIT_TOKEN',
      { recordIndex: 2, expectedSplit: 'DEV_TRAIN' },
    );
  });

  it('refuses at the FIRST differing split, naming only the two canonical tokens', () => {
    const records = [
      rec('FINAL_HOLDOUT'),
      rec('DEV_CONFIRM'),
      rec('DEV_TRAIN'),
      rec('FINAL_HOLDOUT'),
    ];
    expectRefusal(
      () => assertRecordsMatchSplitScope(createA3SplitScope('FINAL_HOLDOUT'), records),
      'CROSS_SPLIT_RECORD',
      { recordIndex: 1, expectedSplit: 'FINAL_HOLDOUT', actualSplit: 'DEV_CONFIRM' },
    );
  });

  it('refuses every cross-split pairing at index 0', () => {
    for (const expected of SPLITS) {
      for (const actual of SPLITS) {
        if (actual === expected) continue;
        expectRefusal(
          () => assertRecordsMatchSplitScope(createA3SplitScope(expected), [rec(actual)]),
          'CROSS_SPLIT_RECORD',
          { recordIndex: 0, expectedSplit: expected, actualSplit: actual },
        );
      }
    }
  });

  it('a non-canonical token is a cross-split refusal and is never echoed', () => {
    const records = [{ split: 'dev_confirm' }] as unknown as { split?: Split }[];
    const refusal = expectRefusal(
      () => assertRecordsMatchSplitScope(createA3SplitScope('DEV_CONFIRM'), records),
      'CROSS_SPLIT_RECORD',
      { recordIndex: 0, expectedSplit: 'DEV_CONFIRM', actualSplit: 'NON_CANONICAL_SPLIT_TOKEN' },
    );
    expect(refusal.message).not.toContain('dev_confirm');
  });

  it('refuses a non-object record and a non-list collection', () => {
    const scope = createA3SplitScope('DEV_TRAIN');
    expectRefusal(
      () =>
        assertRecordsMatchSplitScope(scope, [rec('DEV_TRAIN'), null] as unknown as {
          split?: Split;
        }[]),
      'RECORD_NOT_AN_OBJECT',
      { recordIndex: 1 },
    );
    expectRefusal(
      () => assertRecordsMatchSplitScope(scope, undefined as unknown as []),
      'RECORDS_NOT_A_LIST',
    );
  });

  it('returns no partial result: a bad LAST record still refuses everything before it', () => {
    const records = [...Array.from({ length: 9 }, () => rec('DEV_CONFIRM')), rec('FINAL_HOLDOUT')];
    let returned: unknown = 'NOTHING_RETURNED';
    expectRefusal(
      () => {
        returned = assertRecordsMatchSplitScope(createA3SplitScope('DEV_CONFIRM'), records);
      },
      'CROSS_SPLIT_RECORD',
      { recordIndex: 9, expectedSplit: 'DEV_CONFIRM', actualSplit: 'FINAL_HOLDOUT' },
    );
    expect(returned).toBe('NOTHING_RETURNED');
    expect(records).toHaveLength(10);
  });

  it('stops at the first failure without reading later records', () => {
    let laterRead = false;
    const trap = {
      get split(): Split {
        laterRead = true;
        return 'DEV_TRAIN';
      },
    };
    expectRefusal(
      () => assertRecordsMatchSplitScope(createA3SplitScope('DEV_TRAIN'), [rec(), trap]),
      'MISSING_SPLIT_TOKEN',
      { recordIndex: 0, expectedSplit: 'DEV_TRAIN' },
    );
    expect(laterRead).toBe(false);
  });
});

describe('2D-A3 R4: single-split inference over an in-memory collection', () => {
  it('an empty collection has no split identity and is refused', () => {
    expectRefusal(() => assertSingleSplitCollection([]), 'EMPTY_COLLECTION_HAS_NO_SPLIT_IDENTITY');
  });

  it('a one-split collection returns that split', () => {
    for (const split of SPLITS) {
      expect(assertSingleSplitCollection([rec(split), rec(split), rec(split)])).toBe(split);
    }
  });

  it('a mixed collection refuses at the first differing record', () => {
    expectRefusal(
      () =>
        assertSingleSplitCollection([
          rec('DEV_TRAIN'),
          rec('DEV_TRAIN'),
          rec('FINAL_HOLDOUT'),
          rec('DEV_CONFIRM'),
        ]),
      'MIXED_SPLIT_COLLECTION',
      { recordIndex: 2, expectedSplit: 'DEV_TRAIN', actualSplit: 'FINAL_HOLDOUT' },
    );
  });

  it('a missing token refuses, first row or later', () => {
    expectRefusal(
      () => assertSingleSplitCollection([rec(), rec('DEV_TRAIN')]),
      'MISSING_SPLIT_TOKEN',
      {
        recordIndex: 0,
      },
    );
    expectRefusal(
      () => assertSingleSplitCollection([rec('DEV_CONFIRM'), rec()]),
      'MISSING_SPLIT_TOKEN',
      { recordIndex: 1, expectedSplit: 'DEV_CONFIRM' },
    );
  });

  it('a non-canonical first token is refused and never echoed', () => {
    const refusal = expectRefusal(
      () =>
        assertSingleSplitCollection([{ split: 'EVERYTHING' }] as unknown as { split?: Split }[]),
      'MIXED_SPLIT_COLLECTION',
      { recordIndex: 0, actualSplit: 'NON_CANONICAL_SPLIT_TOKEN' },
    );
    expect(refusal.message).not.toContain('EVERYTHING');
  });
});

describe('2D-A3 R4: gated splits', () => {
  it('isA3GatedSplit accepts DEV_CONFIRM and FINAL_HOLDOUT only', () => {
    expect(isA3GatedSplit('DEV_CONFIRM')).toBe(true);
    expect(isA3GatedSplit('FINAL_HOLDOUT')).toBe(true);
    expect(isA3GatedSplit('DEV_TRAIN')).toBe(false);
    for (const bad of [undefined, null, '', 'dev_confirm', A3_GATED_SPLITS, 1]) {
      expect(isA3GatedSplit(bad)).toBe(false);
    }
    expect(SPLITS.filter(isA3GatedSplit)).toEqual([...A3_GATED_SPLITS]);
  });

  it('assertGatedSplitScope passes the gated scopes through unchanged and refuses DEV_TRAIN', () => {
    for (const split of A3_GATED_SPLITS) {
      const scope = createA3SplitScope(split);
      const gated = assertGatedSplitScope(scope);
      expect(gated).toBe(scope);
      expect(gated.split).toBe(split);
    }
    expectRefusal(
      () => assertGatedSplitScope(createA3SplitScope('DEV_TRAIN')),
      'NOT_A_GATED_SPLIT',
      {
        expectedSplit: 'DEV_TRAIN',
      },
    );
  });
});

describe('2D-A3 R4: gated public aggregate against a scope', () => {
  it('a DEV_CONFIRM aggregate matches only a DEV_CONFIRM scope', () => {
    const agg = aggregate('DEV_CONFIRM');
    expect(assertGatedAggregateMatchesScope(createA3SplitScope('DEV_CONFIRM'), agg)).toBe(agg);
    expectRefusal(
      () => assertGatedAggregateMatchesScope(createA3SplitScope('FINAL_HOLDOUT'), agg),
      'AGGREGATE_SPLIT_MISMATCH',
      { expectedSplit: 'FINAL_HOLDOUT', actualSplit: 'DEV_CONFIRM' },
    );
  });

  it('a FINAL_HOLDOUT aggregate matches only a FINAL_HOLDOUT scope', () => {
    const agg = aggregate('FINAL_HOLDOUT');
    expect(assertGatedAggregateMatchesScope(createA3SplitScope('FINAL_HOLDOUT'), agg)).toBe(agg);
    expectRefusal(
      () => assertGatedAggregateMatchesScope(createA3SplitScope('DEV_CONFIRM'), agg),
      'AGGREGATE_SPLIT_MISMATCH',
      { expectedSplit: 'DEV_CONFIRM', actualSplit: 'FINAL_HOLDOUT' },
    );
  });

  it('refuses a DEV_TRAIN scope outright', () => {
    const devTrain = createA3SplitScope('DEV_TRAIN') as unknown as A3SplitScope<'DEV_CONFIRM'>;
    expectRefusal(
      () => assertGatedAggregateMatchesScope(devTrain, aggregate('DEV_CONFIRM')),
      'NOT_A_GATED_SPLIT',
      { expectedSplit: 'DEV_TRAIN' },
    );
  });

  it('refuses a value that is not the gated aggregate shape, without echoing its counts', () => {
    const scope = createA3SplitScope('DEV_CONFIRM');
    for (const bad of [
      null,
      { ...aggregate('DEV_CONFIRM'), visibility: 'PUBLIC' },
      { split: 'DEV_CONFIRM', organisationCount: 424242 },
    ]) {
      const refusal = expectRefusal(
        () => assertGatedAggregateMatchesScope(scope, bad as A3GatedSplitPublicAggregate),
        'NOT_A_GATED_AGGREGATE',
        { expectedSplit: 'DEV_CONFIRM' },
      );
      expect(refusal.message).not.toContain('424242');
    }
  });
});

describe('2D-A3 R4: refusals never carry record contents', () => {
  const SECRETS = {
    text: 'SYNTHETIC_PAGE_TEXT_Q7ZK_do_not_leak',
    url: 'https://synthetic-not-real.invalid/secret-path-9f3',
    documentSha256: 'feedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface',
    label: 'SYNTHETIC_GOLD_LABEL_M4',
    organisationId: '00000000-0000-4000-8000-00000000abcd',
  };
  const leaks = (refusal: A3SplitScopeRefusal) => {
    const surfaces = [
      refusal.message,
      String(refusal),
      JSON.stringify(refusal),
      JSON.stringify({ ...refusal }),
      refusal.stack ?? '',
    ].join('\n');
    return Object.values(SECRETS).filter((secret) => surfaces.includes(secret));
  };

  it('cross-split, missing-token, mixed and non-object refusals leak nothing', () => {
    const refusals = [
      refusalOf(() =>
        assertRecordsMatchSplitScope(createA3SplitScope('DEV_CONFIRM'), [
          rec('DEV_CONFIRM', SECRETS),
          rec('FINAL_HOLDOUT', SECRETS),
        ]),
      ),
      refusalOf(() =>
        assertRecordsMatchSplitScope(createA3SplitScope('FINAL_HOLDOUT'), [
          rec(undefined, SECRETS),
        ]),
      ),
      refusalOf(() =>
        assertRecordsMatchSplitScope(createA3SplitScope('DEV_TRAIN'), [
          { ...SECRETS, split: SECRETS.text },
        ] as unknown as { split?: Split }[]),
      ),
      refusalOf(() =>
        assertSingleSplitCollection([rec('DEV_TRAIN', SECRETS), rec('DEV_CONFIRM', SECRETS)]),
      ),
      refusalOf(() =>
        assertSingleSplitCollection([{ ...SECRETS, split: SECRETS.url }] as unknown as {
          split?: Split;
        }[]),
      ),
    ];
    for (const refusal of refusals) expect(leaks(refusal)).toEqual([]);
  });

  it('the refusal exposes only code, index and split tokens as own fields', () => {
    const refusal = refusalOf(() =>
      assertRecordsMatchSplitScope(createA3SplitScope('DEV_CONFIRM'), [rec('DEV_TRAIN', SECRETS)]),
    );
    expect(Object.keys(refusal).sort()).toEqual([
      'actualSplit',
      'code',
      'expectedSplit',
      'name',
      'recordIndex',
    ]);
  });
});
