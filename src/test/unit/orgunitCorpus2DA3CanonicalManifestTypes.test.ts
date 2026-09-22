/**
 * PHASE 2B-2D A3 R5 — PRE-LABEL MANIFEST-SAFE REPRESENTATIONS.
 *
 * Every value here is synthetic and made up. The content hashes are opaque
 * made-up strings, chosen so that no test encodes a hash algorithm. No real
 * or Generation-1 manifest is read, built or written, and nothing touches the
 * filesystem.
 */
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  A3_PREP_OWNER_DECISION_MARKERS,
  A3_PREP_OWNER_DECISIONS_REQUIRED,
  K1_SET_R_TRACK_REDUCTION,
  K2_EXACT_DUPLICATE_REPRESENTATIVE_AND_SCORE,
  K3_SD3_SINGLE_POOL_VS_SD7_PER_SAMPLE_SURVIVOR,
  K4_SD4_G3_FREEZE_TIME_TRUNCATION,
  SET_R_MAY_OVERLAP_SET_P,
  type Split,
} from '../harness/phase2b2d/a3prep/contracts.js';
import {
  A3_MANIFEST_PREP_STAGE,
  A3ManifestPrepRefusal,
  asA3SplitContentHash,
  createDevConfirmPublicManifestPrep,
  createDevTrainManifestPrep,
  createFinalHoldoutPublicManifestPrep,
  type A3DevConfirmPublicManifestPrep,
  type A3DevConfirmPublicManifestPrepInput,
  type A3DevTrainManifestPrep,
  type A3DevTrainManifestPrepInput,
  type A3FinalHoldoutPublicManifestPrep,
  type A3FinalHoldoutPublicManifestPrepInput,
  type A3ManifestPrepRefusalCode,
  type A3SplitContentHash,
} from '../harness/phase2b2d/a3prep/manifestTypes.js';
import { createA3SplitScope, type A3SplitScope } from '../harness/phase2b2d/a3prep/splitScope.js';
import type { A3DocumentSha256 } from '../harness/phase2b2d/a3prep/types.js';

// ---------------------------------------------------------------------------
// Synthetic fixtures
// ---------------------------------------------------------------------------

const DEV_TRAIN = createA3SplitScope('DEV_TRAIN');
const DEV_CONFIRM = createA3SplitScope('DEV_CONFIRM');
const FINAL_HOLDOUT = createA3SplitScope('FINAL_HOLDOUT');

/** A synthetic, well-formed document identity: 64 lower-case hex characters. */
const doc = (digit: string): A3DocumentSha256 => digit.repeat(64) as A3DocumentSha256;

const DT_HASH = asA3SplitContentHash(DEV_TRAIN, 'opaque-dev-train-content-hash');
const DC_HASH = asA3SplitContentHash(DEV_CONFIRM, 'opaque-dev-confirm-content-hash');
const FH_HASH = asA3SplitContentHash(FINAL_HOLDOUT, 'opaque-final-holdout-content-hash');

function devTrainInput(
  overrides: Partial<Record<keyof A3DevTrainManifestPrepInput, unknown>> = {},
): A3DevTrainManifestPrepInput {
  return {
    itemCount: 9,
    organisationCount: 3,
    realisedSetPSize: 7,
    realisedSetRSize: 4,
    splitContentHash: DT_HASH,
    setPDocumentSha256s: [doc('a'), doc('b')],
    setRDocumentSha256s: [doc('b'), doc('c')],
    ...overrides,
  } as A3DevTrainManifestPrepInput;
}

function devConfirmInput(
  overrides: Partial<Record<keyof A3DevConfirmPublicManifestPrepInput, unknown>> = {},
): A3DevConfirmPublicManifestPrepInput {
  return {
    itemCount: 13,
    organisationCount: 5,
    realisedSetPSize: 11,
    realisedSetRSize: 6,
    splitContentHash: DC_HASH,
    ...overrides,
  } as A3DevConfirmPublicManifestPrepInput;
}

function finalHoldoutInput(
  overrides: Partial<Record<keyof A3FinalHoldoutPublicManifestPrepInput, unknown>> = {},
): A3FinalHoldoutPublicManifestPrepInput {
  return {
    itemCount: 17,
    organisationCount: 6,
    realisedSetPSize: 14,
    realisedSetRSize: 8,
    splitContentHash: FH_HASH,
    ...overrides,
  } as A3FinalHoldoutPublicManifestPrepInput;
}

function refusalOf(fn: () => unknown): A3ManifestPrepRefusal {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(A3ManifestPrepRefusal);
    return error as A3ManifestPrepRefusal;
  }
  throw new Error('expected an A3ManifestPrepRefusal, got none');
}

function expectRefusal(
  fn: () => unknown,
  code: A3ManifestPrepRefusalCode,
  detail: { field?: string; position?: number; expectedSplit?: Split; actualSplit?: Split } = {},
): A3ManifestPrepRefusal {
  const refusal = refusalOf(fn);
  expect(refusal.code).toBe(code);
  expect(refusal.field).toBe(detail.field);
  expect(refusal.position).toBe(detail.position);
  expect(refusal.expectedSplit).toBe(detail.expectedSplit);
  expect(refusal.actualSplit).toBe(detail.actualSplit);
  return refusal;
}

const GATED_KEYS = [
  'itemCount',
  'organisationCount',
  'realisedSetPSize',
  'realisedSetRSize',
  'representation',
  'split',
  'splitContentHash',
  'stage',
  'visibility',
];

const DEV_TRAIN_KEYS = [...GATED_KEYS, 'setPDocumentSha256s', 'setRDocumentSha256s'].sort();

const COUNT_FIELDS = [
  'itemCount',
  'organisationCount',
  'realisedSetPSize',
  'realisedSetRSize',
] as const;

/** Every constructor, run with a synthetic input the test overrides. */
const BUILDERS = [
  {
    name: 'DEV_TRAIN',
    build: (overrides: Record<string, unknown>) =>
      createDevTrainManifestPrep(DEV_TRAIN, devTrainInput(overrides)),
  },
  {
    name: 'DEV_CONFIRM',
    build: (overrides: Record<string, unknown>) =>
      createDevConfirmPublicManifestPrep(DEV_CONFIRM, devConfirmInput(overrides)),
  },
  {
    name: 'FINAL_HOLDOUT',
    build: (overrides: Record<string, unknown>) =>
      createFinalHoldoutPublicManifestPrep(FINAL_HOLDOUT, finalHoldoutInput(overrides)),
  },
] as const;

/**
 * Synthetic forbidden extras, each with a unique marker value, smuggled in
 * through a cast. None of these markers may survive into any output, error or
 * serialisation.
 */
const SMUGGLED = {
  itemIds: ['SMUGGLED-ITEM-ID-7f3e'],
  itemId: 'SMUGGLED-ITEM-ID-SINGLE-19ab',
  documentSha256s: ['SMUGGLED-DOCUMENT-SHA-4c2d'],
  goldLabels: ['SMUGGLED-GOLD-LABEL-88aa'],
  gold: 'SMUGGLED-GOLD-0b1c',
  unitTypes: ['SMUGGLED-UNIT-TYPE-5e5e'],
  hardNegative: 'SMUGGLED-HARD-NEGATIVE-6d6d',
  goldClassDistribution: { SMUGGLED_CLASS_KEY_3a3a: 'SMUGGLED-CLASS-COUNT-3b3b' },
  organisationBreakdown: [{ organisation: 'SMUGGLED-ORG-9f9f', items: 'SMUGGLED-ORG-ITEMS-9e9e' }],
  text: 'SMUGGLED-TEXT-2a2a',
  url: 'https://smuggled.example/SMUGGLED-URL-1c1c',
  title: 'SMUGGLED-TITLE-4f4f',
  agreement: 'SMUGGLED-AGREEMENT-7a7a',
  kappa: 'SMUGGLED-KAPPA-7b7b',
  modelOutput: 'SMUGGLED-MODEL-OUTPUT-8c8c',
  secretMarker: 'SMUGGLED-SECRET-MARKER-0000',
} as const;

const SMUGGLED_MARKERS: readonly string[] = JSON.stringify(SMUGGLED).match(
  /SMUGGLED[-_][A-Z0-9_-]+/g,
) as string[];

// ---------------------------------------------------------------------------

describe('2D-A3 R5: DEV_TRAIN pre-label representation', () => {
  it('builds a frozen DEV_TRAIN prep with exactly the intended keys', () => {
    const prep = createDevTrainManifestPrep(DEV_TRAIN, devTrainInput());
    expect(Object.keys(prep).sort()).toEqual(DEV_TRAIN_KEYS);
    expect(Object.isFrozen(prep)).toBe(true);
    expect(prep).toEqual({
      stage: 'PRE_LABEL_A3_NOT_FINAL_CORPUS_MANIFEST',
      representation: 'A3_DEV_TRAIN_PRE_LABEL_PREP',
      split: 'DEV_TRAIN',
      visibility: 'INSPECTABLE_DEVELOPMENT',
      itemCount: 9,
      organisationCount: 3,
      realisedSetPSize: 7,
      realisedSetRSize: 4,
      splitContentHash: 'opaque-dev-train-content-hash',
      setPDocumentSha256s: [doc('a'), doc('b')],
      setRDocumentSha256s: [doc('b'), doc('c')],
    });
  });

  it('refuses the DEV_CONFIRM and FINAL_HOLDOUT scopes', () => {
    for (const scope of [DEV_CONFIRM, FINAL_HOLDOUT]) {
      expectRefusal(
        () =>
          createDevTrainManifestPrep(
            scope as unknown as A3SplitScope<'DEV_TRAIN'>,
            devTrainInput(),
          ),
        'WRONG_SPLIT_SCOPE',
        { expectedSplit: 'DEV_TRAIN', actualSplit: scope.split },
      );
    }
  });

  it('copies and freezes the document identity lists, never keeping the caller array', () => {
    const setP = [doc('a'), doc('b')];
    const setR = [doc('c')];
    const prep = createDevTrainManifestPrep(
      DEV_TRAIN,
      devTrainInput({ setPDocumentSha256s: setP, setRDocumentSha256s: setR }),
    );
    expect(prep.setPDocumentSha256s).not.toBe(setP);
    expect(prep.setRDocumentSha256s).not.toBe(setR);
    expect(Object.isFrozen(prep.setPDocumentSha256s)).toBe(true);
    expect(Object.isFrozen(prep.setRDocumentSha256s)).toBe(true);
    setP.push(doc('d'));
    setR.length = 0;
    expect(prep.setPDocumentSha256s).toEqual([doc('a'), doc('b')]);
    expect(prep.setRDocumentSha256s).toEqual([doc('c')]);
  });

  it('keeps caller order and neither refuses nor collapses a repeated identity', () => {
    const prep = createDevTrainManifestPrep(
      DEV_TRAIN,
      devTrainInput({ setPDocumentSha256s: [doc('c'), doc('a'), doc('c')] }),
    );
    expect(prep.setPDocumentSha256s).toEqual([doc('c'), doc('a'), doc('c')]);
  });

  it('accepts empty identity lists', () => {
    const prep = createDevTrainManifestPrep(
      DEV_TRAIN,
      devTrainInput({ setPDocumentSha256s: [], setRDocumentSha256s: [] }),
    );
    expect(prep.setPDocumentSha256s).toEqual([]);
    expect(prep.setRDocumentSha256s).toEqual([]);
  });

  it('validates identities with the canonical R2 check, naming a position and never the value', () => {
    const bad = [
      'A'.repeat(64),
      'a'.repeat(63),
      'a'.repeat(65),
      ` ${'a'.repeat(64)}`,
      'g'.repeat(64),
      '',
      42,
      null,
    ];
    for (const entry of bad) {
      for (const field of ['setPDocumentSha256s', 'setRDocumentSha256s'] as const) {
        const refusal = expectRefusal(
          () =>
            createDevTrainManifestPrep(DEV_TRAIN, devTrainInput({ [field]: [doc('a'), entry] })),
          'DOCUMENT_IDENTITY_NOT_LOWER_HEX_SHA256',
          { field, position: 1 },
        );
        expect(refusal.message).not.toContain('a'.repeat(63));
        expect(refusal.message).not.toContain('A'.repeat(63));
      }
    }
  });

  it('refuses an identity list that is not a list', () => {
    for (const value of [undefined, null, doc('a'), { 0: doc('a') }]) {
      expectRefusal(
        () => createDevTrainManifestPrep(DEV_TRAIN, devTrainInput({ setRDocumentSha256s: value })),
        'DOCUMENT_IDENTITIES_NOT_A_LIST',
        { field: 'setRDocumentSha256s' },
      );
    }
  });

  it('does not tie counts to identity list lengths', () => {
    const prep = createDevTrainManifestPrep(
      DEV_TRAIN,
      devTrainInput({
        realisedSetPSize: 40,
        realisedSetRSize: 0,
        setPDocumentSha256s: [doc('a')],
        setRDocumentSha256s: [doc('b'), doc('c')],
      }),
    );
    expect(prep.realisedSetPSize).toBe(40);
    expect(prep.realisedSetRSize).toBe(0);
  });

  it('invents no item identity and carries no gold, review or model field, by type', () => {
    expectTypeOf<keyof A3DevTrainManifestPrep>().toEqualTypeOf<
      | 'stage'
      | 'representation'
      | 'split'
      | 'visibility'
      | 'itemCount'
      | 'organisationCount'
      | 'realisedSetPSize'
      | 'realisedSetRSize'
      | 'splitContentHash'
      | 'setPDocumentSha256s'
      | 'setRDocumentSha256s'
    >();
    expectTypeOf<A3DevTrainManifestPrep>().not.toHaveProperty('itemIds');
    expectTypeOf<A3DevTrainManifestPrep>().not.toHaveProperty('goldId');
    expectTypeOf<A3DevTrainManifestPrep>().not.toHaveProperty('gold');
    expectTypeOf<A3DevTrainManifestPrep>().not.toHaveProperty('unitType');
    expectTypeOf<A3DevTrainManifestPrep>().not.toHaveProperty('hardNegative');
    expectTypeOf<A3DevTrainManifestPrep>().not.toHaveProperty('kappa');
    expectTypeOf<A3DevTrainManifestPrep>().not.toHaveProperty('agreement');
    expectTypeOf<A3DevTrainManifestPrep>().not.toHaveProperty('url');
    expectTypeOf<A3DevTrainManifestPrep>().not.toHaveProperty('text');
  });

  it('invents no item identity and carries no gold, review or model field, at runtime', () => {
    const prep = createDevTrainManifestPrep(DEV_TRAIN, devTrainInput());
    for (const key of Object.keys(prep)) {
      expect(key).not.toMatch(/item(Id|s$)|gold|label|unitType|hardNegative|review|adjudic/i);
      expect(key).not.toMatch(/agreement|kappa|verdict|model|url|title|host|name|text/i);
    }
  });
});

// ---------------------------------------------------------------------------

describe('2D-A3 R5: DEV_CONFIRM public pre-label representation', () => {
  it('builds a frozen DEV_CONFIRM prep with exactly the aggregate-safe keys', () => {
    const prep = createDevConfirmPublicManifestPrep(DEV_CONFIRM, devConfirmInput());
    expect(Object.keys(prep).sort()).toEqual(GATED_KEYS);
    expect(Object.isFrozen(prep)).toBe(true);
    expect(prep).toEqual({
      stage: 'PRE_LABEL_A3_NOT_FINAL_CORPUS_MANIFEST',
      representation: 'A3_DEV_CONFIRM_PUBLIC_PRE_LABEL_PREP',
      split: 'DEV_CONFIRM',
      visibility: 'SEALED_GATED_CONFIRMATION',
      itemCount: 13,
      organisationCount: 5,
      realisedSetPSize: 11,
      realisedSetRSize: 6,
      splitContentHash: 'opaque-dev-confirm-content-hash',
    });
  });

  it('refuses the DEV_TRAIN and FINAL_HOLDOUT scopes', () => {
    for (const scope of [DEV_TRAIN, FINAL_HOLDOUT]) {
      expectRefusal(
        () =>
          createDevConfirmPublicManifestPrep(
            scope as unknown as A3SplitScope<'DEV_CONFIRM'>,
            devConfirmInput(),
          ),
        'WRONG_SPLIT_SCOPE',
        { expectedSplit: 'DEV_CONFIRM', actualSplit: scope.split },
      );
    }
  });

  it('refuses a wrong scope at compile time', () => {
    // @ts-expect-error a FINAL_HOLDOUT scope is not a DEV_CONFIRM scope
    expect(() => createDevConfirmPublicManifestPrep(FINAL_HOLDOUT, devConfirmInput())).toThrow(
      A3ManifestPrepRefusal,
    );
    // @ts-expect-error a DEV_TRAIN scope is not a DEV_CONFIRM scope
    expect(() => createDevConfirmPublicManifestPrep(DEV_TRAIN, devConfirmInput())).toThrow(
      A3ManifestPrepRefusal,
    );
  });
});

// ---------------------------------------------------------------------------

describe('2D-A3 R5: FINAL_HOLDOUT public pre-label representation', () => {
  it('builds a frozen FINAL_HOLDOUT prep with exactly the aggregate-safe keys', () => {
    const prep = createFinalHoldoutPublicManifestPrep(FINAL_HOLDOUT, finalHoldoutInput());
    expect(Object.keys(prep).sort()).toEqual(GATED_KEYS);
    expect(Object.isFrozen(prep)).toBe(true);
    expect(prep).toEqual({
      stage: 'PRE_LABEL_A3_NOT_FINAL_CORPUS_MANIFEST',
      representation: 'A3_FINAL_HOLDOUT_PUBLIC_PRE_LABEL_PREP',
      split: 'FINAL_HOLDOUT',
      visibility: 'SEALED_STRICT_HOLDOUT',
      itemCount: 17,
      organisationCount: 6,
      realisedSetPSize: 14,
      realisedSetRSize: 8,
      splitContentHash: 'opaque-final-holdout-content-hash',
    });
  });

  it('refuses the DEV_TRAIN and DEV_CONFIRM scopes', () => {
    for (const scope of [DEV_TRAIN, DEV_CONFIRM]) {
      expectRefusal(
        () =>
          createFinalHoldoutPublicManifestPrep(
            scope as unknown as A3SplitScope<'FINAL_HOLDOUT'>,
            finalHoldoutInput(),
          ),
        'WRONG_SPLIT_SCOPE',
        { expectedSplit: 'FINAL_HOLDOUT', actualSplit: scope.split },
      );
    }
  });

  it('refuses a wrong scope at compile time', () => {
    // @ts-expect-error a DEV_CONFIRM scope is not a FINAL_HOLDOUT scope
    expect(() => createFinalHoldoutPublicManifestPrep(DEV_CONFIRM, finalHoldoutInput())).toThrow(
      A3ManifestPrepRefusal,
    );
  });

  it('has a strict-holdout visibility and a representation tag distinct from DEV_CONFIRM', () => {
    const fh = createFinalHoldoutPublicManifestPrep(FINAL_HOLDOUT, finalHoldoutInput());
    const dc = createDevConfirmPublicManifestPrep(DEV_CONFIRM, devConfirmInput());
    expect(fh.visibility).not.toBe(dc.visibility);
    expect(fh.representation).not.toBe(dc.representation);
    expect(fh.split).not.toBe(dc.split);
  });

  it('is not assignable to or from the DEV_CONFIRM shape', () => {
    expectTypeOf<A3FinalHoldoutPublicManifestPrep>().not.toMatchTypeOf<A3DevConfirmPublicManifestPrep>();
    expectTypeOf<A3DevConfirmPublicManifestPrep>().not.toMatchTypeOf<A3FinalHoldoutPublicManifestPrep>();
    expectTypeOf<A3SplitContentHash<'FINAL_HOLDOUT'>>().not.toMatchTypeOf<
      A3SplitContentHash<'DEV_CONFIRM'>
    >();
    // @ts-expect-error a DEV_CONFIRM content hash cannot build a FINAL_HOLDOUT prep
    const wrongHash: A3FinalHoldoutPublicManifestPrepInput = { ...devConfirmInput() };
    expect(wrongHash).toBeDefined();
  });
});

// ---------------------------------------------------------------------------

describe('2D-A3 R5: the gated shapes have nowhere to put sensitive data', () => {
  it('has exactly the aggregate keys by type, for both gated shapes', () => {
    type GatedKey =
      | 'stage'
      | 'representation'
      | 'split'
      | 'visibility'
      | 'itemCount'
      | 'organisationCount'
      | 'realisedSetPSize'
      | 'realisedSetRSize'
      | 'splitContentHash';
    expectTypeOf<keyof A3DevConfirmPublicManifestPrep>().toEqualTypeOf<GatedKey>();
    expectTypeOf<keyof A3FinalHoldoutPublicManifestPrep>().toEqualTypeOf<GatedKey>();
    type InputKey =
      | 'itemCount'
      | 'organisationCount'
      | 'realisedSetPSize'
      | 'realisedSetRSize'
      | 'splitContentHash';
    expectTypeOf<keyof A3DevConfirmPublicManifestPrepInput>().toEqualTypeOf<InputKey>();
    expectTypeOf<keyof A3FinalHoldoutPublicManifestPrepInput>().toEqualTypeOf<InputKey>();
  });

  it('rejects a sensitive field at compile time', () => {
    const base = devConfirmInput();
    // @ts-expect-error a gated input has no document hashes
    createDevConfirmPublicManifestPrep(DEV_CONFIRM, { ...base, setPDocumentSha256s: [] });
    // @ts-expect-error a gated input has no item ids
    createDevConfirmPublicManifestPrep(DEV_CONFIRM, { ...base, itemIds: [] });
    // @ts-expect-error a gated input has no gold
    createDevConfirmPublicManifestPrep(DEV_CONFIRM, { ...base, gold: [] });
    const fhBase = finalHoldoutInput();
    // @ts-expect-error a gated input has no per-organisation breakdown
    createFinalHoldoutPublicManifestPrep(FINAL_HOLDOUT, { ...fhBase, organisationBreakdown: [] });
    // @ts-expect-error a gated input has no text
    createFinalHoldoutPublicManifestPrep(FINAL_HOLDOUT, { ...fhBase, text: '' });
  });
});

// ---------------------------------------------------------------------------

describe('2D-A3 R5: extra-key smuggling is dropped at runtime', () => {
  for (const { name, build } of BUILDERS) {
    it(`${name}: no smuggled key or value reaches the output or its serialisation`, () => {
      const prep = build({ ...SMUGGLED });
      const expectedKeys = name === 'DEV_TRAIN' ? DEV_TRAIN_KEYS : GATED_KEYS;
      expect(Object.keys(prep).sort()).toEqual(expectedKeys);
      expect(Object.getOwnPropertyNames(prep).sort()).toEqual(expectedKeys);
      expect(Object.getOwnPropertySymbols(prep)).toEqual([]);
      const serialised = JSON.stringify(prep);
      for (const marker of SMUGGLED_MARKERS) {
        expect(serialised).not.toContain(marker);
      }
      for (const key of Object.keys(SMUGGLED)) {
        expect(Object.prototype.hasOwnProperty.call(prep, key), key).toBe(false);
      }
    });

    it(`${name}: no smuggled value reaches an error message`, () => {
      const refusal = refusalOf(() => build({ ...SMUGGLED, itemCount: -1 }));
      expect(refusal.code).toBe('COUNT_NOT_A_NON_NEGATIVE_SAFE_INTEGER');
      const everything = `${refusal.message} ${JSON.stringify(refusal)} ${String(refusal.stack)}`;
      for (const marker of SMUGGLED_MARKERS) expect(everything).not.toContain(marker);
    });
  }

  it('the gated outputs are not the caller object and do not alias it', () => {
    const input = { ...devConfirmInput(), ...SMUGGLED };
    const prep = createDevConfirmPublicManifestPrep(
      DEV_CONFIRM,
      input as unknown as A3DevConfirmPublicManifestPrepInput,
    );
    expect(prep).not.toBe(input);
    (input as { itemCount: number }).itemCount = 999;
    expect(prep.itemCount).toBe(13);
  });

  it('a smuggled count or hash value never appears in an error message', () => {
    const refusal = refusalOf(() =>
      createFinalHoldoutPublicManifestPrep(
        FINAL_HOLDOUT,
        finalHoldoutInput({ realisedSetRSize: 'SMUGGLED-COUNT-VALUE-1234' }),
      ),
    );
    expect(refusal.message).toBe('COUNT_NOT_A_NON_NEGATIVE_SAFE_INTEGER field=realisedSetRSize');
    const hashRefusal = refusalOf(() =>
      createDevConfirmPublicManifestPrep(
        DEV_CONFIRM,
        devConfirmInput({ splitContentHash: { hidden: 'SMUGGLED-HASH-OBJECT-5678' } }),
      ),
    );
    expect(hashRefusal.message).toBe('CONTENT_HASH_NOT_A_STRING field=splitContentHash');
  });
});

// ---------------------------------------------------------------------------

describe('2D-A3 R5: count validation', () => {
  const INVALID: readonly unknown[] = [
    -1,
    -0.5,
    0.5,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    2 ** 60,
    '3',
    null,
    undefined,
    3n,
  ];

  for (const { name, build } of BUILDERS) {
    for (const field of COUNT_FIELDS) {
      it(`${name}.${field}: refuses every non-(non-negative safe integer)`, () => {
        for (const value of INVALID) {
          expectRefusal(() => build({ [field]: value }), 'COUNT_NOT_A_NON_NEGATIVE_SAFE_INTEGER', {
            field,
          });
        }
      });

      it(`${name}.${field}: accepts 0 and MAX_SAFE_INTEGER`, () => {
        expect(build({ [field]: 0 })[field]).toBe(0);
        expect(build({ [field]: Number.MAX_SAFE_INTEGER })[field]).toBe(Number.MAX_SAFE_INTEGER);
      });
    }

    it(`${name}: accepts every count at 0 together`, () => {
      const prep = build({
        itemCount: 0,
        organisationCount: 0,
        realisedSetPSize: 0,
        realisedSetRSize: 0,
      });
      for (const field of COUNT_FIELDS) expect(prep[field]).toBe(0);
    });
  }
});

// ---------------------------------------------------------------------------

describe('2D-A3 R5: SET_P / SET_R overlap — no disjointness assumed', () => {
  it('the frozen contract says the two samples may overlap', () => {
    expect(SET_R_MAY_OVERLAP_SET_P).toBe(true);
  });

  for (const { name, build } of BUILDERS) {
    it(`${name}: accepts itemCount below realisedSetPSize + realisedSetRSize`, () => {
      const prep = build({ itemCount: 10, realisedSetPSize: 8, realisedSetRSize: 4 });
      expect(prep.itemCount).toBeLessThan(prep.realisedSetPSize + prep.realisedSetRSize);
      expect(prep.itemCount).toBe(10);
    });

    it(`${name}: never derives itemCount from the two sample sizes`, () => {
      expect(build({ itemCount: 5, realisedSetPSize: 3, realisedSetRSize: 3 }).itemCount).toBe(5);
      expect(build({ itemCount: 6, realisedSetPSize: 3, realisedSetRSize: 3 }).itemCount).toBe(6);
    });

    it(`${name}: enforces no cross-count relation, because item identity is not yet defined`, () => {
      const prep = build({
        itemCount: 1,
        organisationCount: 50,
        realisedSetPSize: 9,
        realisedSetRSize: 7,
      });
      expect([
        prep.itemCount,
        prep.organisationCount,
        prep.realisedSetPSize,
        prep.realisedSetRSize,
      ]).toEqual([1, 50, 9, 7]);
    });
  }
});

// ---------------------------------------------------------------------------

describe('2D-A3 R5: the per-split content hash is opaque', () => {
  const OPAQUE = [
    '',
    'x',
    'not-hex-at-all',
    'ZZZZ',
    ' leading and trailing space ',
    'a'.repeat(64),
    'A'.repeat(64),
    'sha512:whatever',
    'ünïcødé',
  ];

  it('the brand returns every string byte-for-byte, and assumes no encoding', () => {
    for (const value of OPAQUE) {
      expect(asA3SplitContentHash(DEV_CONFIRM, value)).toBe(value);
    }
  });

  it('refuses only a non-string, and an unissued scope', () => {
    for (const value of [undefined, null, 1, {}, []]) {
      expectRefusal(
        () => asA3SplitContentHash(FINAL_HOLDOUT, value as unknown as string),
        'CONTENT_HASH_NOT_A_STRING',
        { field: 'splitContentHash' },
      );
    }
    expectRefusal(
      () =>
        asA3SplitContentHash(
          {
            split: 'DEV_CONFIRM',
            visibility: 'SEALED_GATED_CONFIRMATION',
          } as unknown as A3SplitScope<'DEV_CONFIRM'>,
          'x',
        ),
      'SCOPE_NOT_ISSUED',
    );
  });

  for (const { name, build } of BUILDERS) {
    it(`${name}: carries exactly the supplied hash and never recomputes it`, () => {
      for (const value of OPAQUE) {
        expect(build({ splitContentHash: value }).splitContentHash).toBe(value);
      }
    });

    it(`${name}: the hash does not depend on the counts or identities`, () => {
      const a = build({ itemCount: 1, splitContentHash: 'same-opaque-value' });
      const b = build({ itemCount: 2, splitContentHash: 'same-opaque-value' });
      expect(a.splitContentHash).toBe(b.splitContentHash);
      const c = build({ itemCount: 1, splitContentHash: 'other-opaque-value' });
      expect(c.splitContentHash).not.toBe(a.splitContentHash);
    });

    it(`${name}: refuses a non-string hash`, () => {
      expectRefusal(() => build({ splitContentHash: 7 }), 'CONTENT_HASH_NOT_A_STRING', {
        field: 'splitContentHash',
      });
    });
  }
});

// ---------------------------------------------------------------------------

describe('2D-A3 R5: scope and input refusals', () => {
  it('refuses a lookalike scope on every constructor', () => {
    const fakes = [
      { split: 'DEV_TRAIN', visibility: 'INSPECTABLE_DEVELOPMENT' },
      { ...DEV_CONFIRM },
      Object.freeze({ ...FINAL_HOLDOUT }),
      null,
      undefined,
      'DEV_CONFIRM',
    ];
    for (const fake of fakes) {
      expectRefusal(
        () =>
          createDevTrainManifestPrep(fake as unknown as A3SplitScope<'DEV_TRAIN'>, devTrainInput()),
        'SCOPE_NOT_ISSUED',
      );
      expectRefusal(
        () =>
          createDevConfirmPublicManifestPrep(
            fake as unknown as A3SplitScope<'DEV_CONFIRM'>,
            devConfirmInput(),
          ),
        'SCOPE_NOT_ISSUED',
      );
      expectRefusal(
        () =>
          createFinalHoldoutPublicManifestPrep(
            fake as unknown as A3SplitScope<'FINAL_HOLDOUT'>,
            finalHoldoutInput(),
          ),
        'SCOPE_NOT_ISSUED',
      );
    }
  });

  it('checks the scope before reading the input', () => {
    expectRefusal(
      () =>
        createDevConfirmPublicManifestPrep(
          FINAL_HOLDOUT as unknown as A3SplitScope<'DEV_CONFIRM'>,
          null as unknown as A3DevConfirmPublicManifestPrepInput,
        ),
      'WRONG_SPLIT_SCOPE',
      { expectedSplit: 'DEV_CONFIRM', actualSplit: 'FINAL_HOLDOUT' },
    );
  });

  it('refuses a non-object input', () => {
    for (const input of [null, undefined, 3, 'x', []]) {
      expectRefusal(
        () =>
          createFinalHoldoutPublicManifestPrep(
            FINAL_HOLDOUT,
            input as unknown as A3FinalHoldoutPublicManifestPrepInput,
          ),
        'INPUT_NOT_AN_OBJECT',
      );
    }
  });

  it('reads each input field exactly once', () => {
    const reads: Record<string, number> = {};
    const values: Record<string, unknown> = { ...devConfirmInput() };
    const input = new Proxy(values, {
      get(target, key: string) {
        reads[key] = (reads[key] ?? 0) + 1;
        return target[key];
      },
    });
    createDevConfirmPublicManifestPrep(
      DEV_CONFIRM,
      input as unknown as A3DevConfirmPublicManifestPrepInput,
    );
    expect(reads).toEqual({
      itemCount: 1,
      organisationCount: 1,
      realisedSetPSize: 1,
      realisedSetRSize: 1,
      splitContentHash: 1,
    });
  });
});

// ---------------------------------------------------------------------------

describe('2D-A3 R5: no finality claim', () => {
  it('every output identifies pre-label preparation, not a final corpus manifest', () => {
    expect(A3_MANIFEST_PREP_STAGE).toBe('PRE_LABEL_A3_NOT_FINAL_CORPUS_MANIFEST');
    for (const { build } of BUILDERS) {
      const prep = build({});
      expect(prep.stage).toBe(A3_MANIFEST_PREP_STAGE);
      expect(prep.representation).toMatch(/^A3_[A-Z_]+_PRE_LABEL_PREP$/);
      expect(JSON.stringify(prep)).not.toMatch(/MANIFEST_(DEV_TRAIN|DEV_CONFIRM|FINAL_HOLDOUT)/);
      expect(JSON.stringify(prep)).not.toMatch(/FROZEN|"FINAL_CORPUS_MANIFEST"/);
    }
  });
});

// ---------------------------------------------------------------------------

describe('2D-A3 R5: no owner decision remains unresolved (K3, then K1 and K2, then K4, later bound by owner clarification)', () => {
  it('all four markers are still present and ordered; all four have left the unresolved list', () => {
    expect(A3_PREP_OWNER_DECISION_MARKERS).toEqual([
      K1_SET_R_TRACK_REDUCTION,
      K2_EXACT_DUPLICATE_REPRESENTATIVE_AND_SCORE,
      K3_SD3_SINGLE_POOL_VS_SD7_PER_SAMPLE_SURVIVOR,
      K4_SD4_G3_FREEZE_TIME_TRUNCATION,
    ]);
    expect(A3_PREP_OWNER_DECISIONS_REQUIRED.map((d) => [d.id, d.resolved])).toEqual([]);
  });
});
