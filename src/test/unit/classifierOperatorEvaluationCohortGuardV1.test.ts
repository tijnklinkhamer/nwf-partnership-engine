/**
 * CLASSIFIER_OPERATOR_EVALUATION_COHORT_GUARD_V1 - the fail-closed
 * evaluation-cohort preflight of `nwf-pe orgunits classify`.
 *
 * Covers: the real pinned artifacts verify; allowed, protected, missing and
 * conflicting membership; and, at command level, that every refusal happens
 * before assembly, before the provider is constructed and before any write
 * (the fake classifier pool answers ONLY the guard's two identity SELECTs and
 * records every statement it is sent).
 */
import { createHash } from 'node:crypto';
import type pg from 'pg';
import { describe, expect, it } from 'vitest';

import {
  EVALUATION_COHORT_ARTIFACT_PINS,
  buildEvaluationCohortRegistry,
  evaluateCohortMembership,
  loadEvaluationCohortRegistry,
  type CohortArtifactRole,
  type EvaluationCohortRegistry,
  type PinnedCohortArtifact,
  type RegistryLoadResult,
} from '../../orgunits/classify/evaluationCohortGuard.js';
import { executeClassifyCommand, type ClassifyDependencies } from '../../cli/commands/classify.js';
import { ORGUNIT_CLASSIFIER_ALLOWED_MODELS } from '../../orgunits/classify/provider/allowedModels.js';

const MODEL = ORGUNIT_CLASSIFIER_ALLOWED_MODELS[0]!;
const ORG_A = '00000000-0000-4000-8000-00000000000a';
const ORG_B = '00000000-0000-4000-8000-00000000000b';
const ORG_R0 = '00000000-0000-4000-8000-0000000000c0';
const ORG_R1 = '00000000-0000-4000-8000-0000000000c1';
const ORG_H = '00000000-0000-4000-8000-0000000000d0';
const ORG_FREE = '00000000-0000-4000-8000-0000000000f0';
const RUN = '00000000-0000-4000-8000-000000000099';

// --- Synthetic, structurally faithful artifacts -----------------------------

interface Synthetic {
  draw: Record<string, unknown>;
  ledger: Record<string, unknown>;
  r50: Record<string, unknown>;
  frame: Record<string, unknown>;
}

function synthetic(): Synthetic {
  return {
    draw: {
      recordKind: 'DRAW_V2_GEN1',
      generationId: 'GEN_TEST',
      counts: {
        selectionCount: 2,
        reserveCount: 2,
        splitCounts: { DEV_TRAIN: 1, DEV_CONFIRM: 0, FINAL_HOLDOUT: 1 },
      },
      selection: [
        { selectionIndex: 0, echeRowKey: 'T A|1', organisationId: ORG_A, split: 'DEV_TRAIN' },
        { selectionIndex: 1, echeRowKey: 'T B|2', organisationId: ORG_B, split: 'FINAL_HOLDOUT' },
      ],
      reserve: [
        { reserveRankPosition: 0, echeRowKey: 'T R0|3', organisationId: ORG_R0 },
        { reserveRankPosition: 1, echeRowKey: 'T R1|4', organisationId: ORG_R1 },
      ],
    },
    ledger: {
      generationId: 'GEN_TEST',
      entries: [
        {
          sequence: 0,
          selectionIndex: 1,
          split: 'FINAL_HOLDOUT',
          replacedEcheRowKey: 'T B|2',
          replacementEcheRowKey: 'T R0|3',
          reserveRankPosition: 0,
        },
      ],
    },
    r50: { split: 'DEV_TRAIN', items: [{ echeRowKey: 'T R50ONLY|5' }] },
    frame: {
      generationId: 'GEN_TEST',
      counts: { excludedHistoricalDevelopmentCount: 1 },
      entries: [
        { echeRowKey: 'T A|1', organisationId: ORG_A, excludedHistoricalDevelopment: false },
        { echeRowKey: 'T H|6', organisationId: ORG_H, excludedHistoricalDevelopment: true },
        { echeRowKey: 'T FREE|7', organisationId: ORG_FREE, excludedHistoricalDevelopment: false },
      ],
    },
  };
}

const ROLE_OF: Record<keyof Synthetic, CohortArtifactRole> = {
  draw: 'DRAW',
  ledger: 'REPLACEMENT_LEDGER',
  r50: 'R50_HANDOFF_INDEX',
  frame: 'FRAME',
};

function build(
  s: Synthetic,
  tamper: (
    pins: PinnedCohortArtifact[],
    bytes: Map<CohortArtifactRole, Buffer | null>,
  ) => void = () => {},
): RegistryLoadResult {
  const pins: PinnedCohortArtifact[] = [];
  const bytes = new Map<CohortArtifactRole, Buffer | null>();
  for (const [name, role] of Object.entries(ROLE_OF) as [keyof Synthetic, CohortArtifactRole][]) {
    const buf = Buffer.from(JSON.stringify(s[name]), 'utf8');
    pins.push({
      role,
      path: `${name}.json`,
      sha256: createHash('sha256').update(buf).digest('hex'),
    });
    bytes.set(role, buf);
  }
  tamper(pins, bytes);
  return buildEvaluationCohortRegistry(pins, bytes);
}

function registryOf(result: RegistryLoadResult): EvaluationCohortRegistry {
  if (!result.ok) throw new Error(`registry unexpectedly refused: ${result.detail}`);
  return result.registry;
}

const subject = (organisationId: string, echeRowKey: string, runEcheRowKeys = [echeRowKey]) => ({
  organisationId,
  echeRowKey,
  runEcheRowKeys,
});

// --- The real, committed artifacts -------------------------------------------

describe('evaluation-cohort guard - the committed pinned artifacts', () => {
  it('verify against their pins and index every protected cohort', () => {
    const registry = registryOf(loadEvaluationCohortRegistry());
    const keyed = registry.membershipsByEcheRowKey;
    const count = (m: string) => [...keyed.values()].filter((s) => s.has(m as never)).length;
    expect(count('DRAW_SELECTION:DEV_TRAIN')).toBe(20);
    expect(count('DRAW_SELECTION:DEV_CONFIRM')).toBe(45);
    expect(count('DRAW_SELECTION:FINAL_HOLDOUT')).toBe(45);
    expect(count('DRAW_RESERVE')).toBe(40);
    expect(count('HISTORICAL_DEVELOPMENT_EVALUATION')).toBe(12);
    expect(count('RESERVE_REPLACEMENT_OCCUPANT')).toBe(8);
    expect(count('R50_DEV_TRAIN_REVIEW_ITEM')).toBeGreaterThan(0);
  });

  it('refuses the organisation of the recorded FINAL_HOLDOUT exposure incident', () => {
    const registry = registryOf(loadEvaluationCohortRegistry());
    const verdict = evaluateCohortMembership(
      registry,
      subject('019c1389-1b1e-4bfd-bad9-680ce6542475', 'F PARIS520|949449193'),
    );
    expect(verdict).toEqual({
      kind: 'EVALUATION_COHORT_PROTECTED',
      echeRowKey: 'F PARIS520|949449193',
      memberships: ['DRAW_SELECTION:FINAL_HOLDOUT'],
    });
  });

  it('pins exactly the four authoritative artifacts and no label, review or adjudication file', () => {
    expect(EVALUATION_COHORT_ARTIFACT_PINS.map((p) => p.role).sort()).toEqual([
      'DRAW',
      'FRAME',
      'R50_HANDOFF_INDEX',
      'REPLACEMENT_LEDGER',
    ]);
    for (const pin of EVALUATION_COHORT_ARTIFACT_PINS) {
      expect(pin.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(pin.path).not.toMatch(/REVIEW_PACKAGE|RESPONSE|GOLD|ADJUDICATION|LABEL|fixtures/i);
    }
  });
});

// --- Allowed / protected ----------------------------------------------------

describe('evaluation-cohort guard - membership', () => {
  const registry = registryOf(build(synthetic()));

  it('ALLOWS an organisation in no protected cohort (frame-only, undrawn)', () => {
    expect(evaluateCohortMembership(registry, subject(ORG_FREE, 'T FREE|7'))).toEqual({
      kind: 'ALLOWED',
    });
  });

  it('ALLOWS an organisation the artifacts never mention at all', () => {
    const id = '00000000-0000-4000-8000-0000000000ee';
    expect(evaluateCohortMembership(registry, subject(id, 'T NEW|8'))).toEqual({ kind: 'ALLOWED' });
  });

  it.each([
    ['DEV_TRAIN selection', ORG_A, 'T A|1', ['DRAW_SELECTION:DEV_TRAIN']],
    [
      'FINAL_HOLDOUT selection (replaced slot stays protected)',
      ORG_B,
      'T B|2',
      ['DRAW_SELECTION:FINAL_HOLDOUT'],
    ],
    [
      'consumed reserve / replacement occupant',
      ORG_R0,
      'T R0|3',
      ['DRAW_RESERVE', 'RESERVE_REPLACEMENT_OCCUPANT'],
    ],
    ['unconsumed reserve', ORG_R1, 'T R1|4', ['DRAW_RESERVE']],
    ['historical development evaluation', ORG_H, 'T H|6', ['HISTORICAL_DEVELOPMENT_EVALUATION']],
  ])('REFUSES %s', (_label, id, key, memberships) => {
    expect(evaluateCohortMembership(registry, subject(id, key))).toEqual({
      kind: 'EVALUATION_COHORT_PROTECTED',
      echeRowKey: key,
      memberships,
    });
  });

  it('REFUSES an R50 review-item organisation that is outside the draw', () => {
    const id = '00000000-0000-4000-8000-0000000000e5';
    expect(evaluateCohortMembership(registry, subject(id, 'T R50ONLY|5'))).toMatchObject({
      kind: 'EVALUATION_COHORT_PROTECTED',
      memberships: ['R50_DEV_TRAIN_REVIEW_ITEM'],
    });
  });
});

// --- Conflicting identity -------------------------------------------------------

describe('evaluation-cohort guard - conflicting identity', () => {
  const registry = registryOf(build(synthetic()));

  it('REFUSES a protected key presented under a different organisation id', () => {
    const verdict = evaluateCohortMembership(registry, subject(ORG_FREE, 'T B|2'));
    expect(verdict.kind).toBe('EVALUATION_COHORT_CONFLICT');
  });

  it('REFUSES a known organisation id presented under a different key', () => {
    const verdict = evaluateCohortMembership(registry, subject(ORG_B, 'T FREE|7'));
    expect(verdict.kind).toBe('EVALUATION_COHORT_CONFLICT');
  });

  it('REFUSES when the run evidence names another, protected organisation', () => {
    const verdict = evaluateCohortMembership(
      registry,
      subject(ORG_FREE, 'T FREE|7', ['T B|2', 'T FREE|7']),
    );
    expect(verdict).toEqual({
      kind: 'EVALUATION_COHORT_PROTECTED',
      echeRowKey: 'T B|2',
      memberships: ['DRAW_SELECTION:FINAL_HOLDOUT'],
    });
  });

  it('leaves a run naming another, UNprotected organisation to the landed mismatch refusal', () => {
    const verdict = evaluateCohortMembership(registry, subject(ORG_FREE, 'T FREE|7', ['T NEW|8']));
    expect(verdict).toEqual({ kind: 'ALLOWED' });
  });
});

// --- Missing / inconsistent metadata -----------------------------------------

describe('evaluation-cohort guard - missing or inconsistent metadata refuses', () => {
  const unverified = (result: RegistryLoadResult, pattern: RegExp) => {
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('EVALUATION_COHORT_METADATA_UNVERIFIED');
      expect(result.detail).toMatch(pattern);
    }
  };

  it('a missing artifact', () => {
    unverified(
      build(synthetic(), (_p, b) => b.set('REPLACEMENT_LEDGER', null)),
      /REPLACEMENT_LEDGER: artifact missing/,
    );
  });

  it('a missing pin', () => {
    unverified(
      build(synthetic(), (p) =>
        p.splice(
          p.findIndex((x) => x.role === 'R50_HANDOFF_INDEX'),
          1,
        ),
      ),
      /R50_HANDOFF_INDEX: expected exactly one pin/,
    );
  });

  it('bytes that differ from the pin (e.g. an unreviewed ledger append)', () => {
    unverified(
      build(synthetic(), (_p, b) =>
        b.set('REPLACEMENT_LEDGER', Buffer.from('{"generationId":"GEN_TEST","entries":[]}')),
      ),
      /REPLACEMENT_LEDGER: artifact bytes do not match/,
    );
  });

  it('a file reader that cannot reach the checkout', () => {
    unverified(
      loadEvaluationCohortRegistry(EVALUATION_COHORT_ARTIFACT_PINS, '/zz-no-repo', () => {
        throw new Error('ENOENT');
      }),
      /artifact missing or unreadable/,
    );
  });

  it('an organisation drawn into two splits', () => {
    const s = synthetic();
    const sel = s.draw.selection as Record<string, unknown>[];
    sel[1] = { ...sel[1], echeRowKey: 'T A|1' };
    unverified(build(s), /DRAW: organisation drawn more than once/);
  });

  it('an organisation both drawn and reserved', () => {
    const s = synthetic();
    (s.draw.reserve as Record<string, unknown>[])[1]!.echeRowKey = 'T A|1';
    unverified(build(s), /DRAW: organisation both drawn and reserved/);
  });

  it('split counts that disagree with the selection', () => {
    const s = synthetic();
    (s.draw.counts as { splitCounts: Record<string, number> }).splitCounts.FINAL_HOLDOUT = 2;
    unverified(build(s), /split count for FINAL_HOLDOUT/);
  });

  it('a ledger entry whose split contradicts its draw slot', () => {
    const s = synthetic();
    (s.ledger.entries as Record<string, unknown>[])[0]!.split = 'DEV_CONFIRM';
    unverified(build(s), /REPLACEMENT_LEDGER: entry 0 split differs/);
  });

  it('a ledger replacement that is not the named reserve position', () => {
    const s = synthetic();
    (s.ledger.entries as Record<string, unknown>[])[0]!.replacementEcheRowKey = 'T R1|4';
    unverified(build(s), /replacement is not the named reserve position/);
  });

  it('a ledger entry that does not replace the current occupant', () => {
    const s = synthetic();
    (s.ledger.entries as Record<string, unknown>[])[0]!.replacedEcheRowKey = 'T A|1';
    unverified(build(s), /does not replace the slot's current occupant/);
  });

  it('a ledger from another generation', () => {
    const s = synthetic();
    s.ledger.generationId = 'GEN_OTHER';
    unverified(build(s), /REPLACEMENT_LEDGER: generationId differs/);
  });

  it('a historical-development count that disagrees with the flags', () => {
    const s = synthetic();
    (s.frame.counts as Record<string, number>).excludedHistoricalDevelopmentCount = 2;
    unverified(build(s), /FRAME: historical-development entries differ/);
  });

  it('a frame entry without an explicit boolean flag', () => {
    const s = synthetic();
    delete (s.frame.entries as Record<string, unknown>[])[2]!.excludedHistoricalDevelopment;
    unverified(build(s), /FRAME: entry without a boolean/);
  });

  it('an R50 index for another split', () => {
    const s = synthetic();
    s.r50.split = 'DEV_CONFIRM';
    unverified(build(s), /R50_HANDOFF_INDEX: unexpected split/);
  });
});

// --- Command level: refusal precedes assembly, provider and every write ------

interface Recorder {
  readonly deps: ClassifyDependencies;
  readonly statements: () => readonly string[];
  readonly providers: () => number;
  readonly pools: () => number;
  readonly stdout: () => string;
}

/**
 * Research pool: reports the run COMPLETED. Classifier pool: answers ONLY
 * the guard's organisation and run-key SELECTs; any other statement (assembly,
 * identity inspection, INSERT) throws a sentinel, and every statement is
 * recorded.
 */
function recorder(
  org: { id: string; key: string } | null,
  loadCohortRegistry: () => RegistryLoadResult,
): Recorder {
  const statements: string[] = [];
  let providers = 0;
  let pools = 0;
  let stdout = '';
  const research = {
    query: () => Promise.resolve({ rows: [{ terminal_state: 'COMPLETED', error_kind: null }] }),
  } as unknown as pg.Pool;
  const classifier = {
    query: (sql: string) => {
      statements.push(sql.replace(/\s+/g, ' ').trim());
      if (/^SELECT id, eche_row_key FROM organisations/.test(statements.at(-1)!)) {
        return Promise.resolve({
          rows: org === null ? [] : [{ id: org.id, eche_row_key: org.key }],
        });
      }
      if (
        /^SELECT DISTINCT eche_row_key FROM orgunit_fetch_observations/.test(statements.at(-1)!)
      ) {
        return Promise.resolve({ rows: org === null ? [] : [{ eche_row_key: org.key }] });
      }
      return Promise.reject(new Error('zz-beyond-the-guard'));
    },
  } as unknown as pg.Pool;
  return {
    deps: {
      withResearchPool: ((fn: (p: pg.Pool) => Promise<unknown>) => {
        pools += 1;
        return fn(research);
      }) as ClassifyDependencies['withResearchPool'],
      withClassifierPool: ((fn: (p: pg.Pool) => Promise<unknown>) => {
        pools += 1;
        return fn(classifier);
      }) as ClassifyDependencies['withClassifierPool'],
      env: { HOME: '/zz-home' },
      repoRoot: '/zz-repo',
      createProvider: () => {
        providers += 1;
        return Promise.reject(new Error('provider reached'));
      },
      stdout: (t) => {
        stdout += t;
      },
      stderr: () => {},
      loadCohortRegistry,
    },
    statements: () => statements,
    providers: () => providers,
    pools: () => pools,
    stdout: () => stdout,
  };
}

const envelopeOf = (text: string) =>
  JSON.parse(text) as {
    code: string;
    exitCode: number;
    reason: { kind: string; preflightKind: string; detail: string };
  };

describe('orgunits classify - the cohort guard refuses before assembly, provider and writes', () => {
  const syntheticRegistry = () => build(synthetic());

  for (const execute of [false, true]) {
    const mode = execute ? '--execute' : 'dry run';

    it(`${mode}: a protected organisation is refused after only the two identity SELECTs`, async () => {
      const r = recorder({ id: ORG_B, key: 'T B|2' }, syntheticRegistry);
      const exit = await executeClassifyCommand(
        { organisationId: ORG_B, runId: RUN, model: MODEL, execute, json: true },
        r.deps,
      );
      const env = envelopeOf(r.stdout());
      expect(exit).toBe(1);
      expect(env.code).toBe('PREFLIGHT_REFUSED');
      expect(env.reason.preflightKind).toBe('EVALUATION_COHORT_PROTECTED');
      expect(env.reason.detail).toContain('DRAW_SELECTION:FINAL_HOLDOUT');
      expect(r.providers()).toBe(0);
      expect(r.statements()).toHaveLength(2);
      expect(r.statements().every((s) => s.startsWith('SELECT'))).toBe(true);
      expect(r.statements().join(' ')).not.toMatch(
        /orgunit_page_evidence|orgunit_page_candidates|INSERT|orgunit_classifier/,
      );
    });

    it(`${mode}: conflicting identity is refused before assembly`, async () => {
      const r = recorder({ id: ORG_FREE, key: 'T B|2' }, syntheticRegistry);
      await executeClassifyCommand(
        { organisationId: ORG_FREE, runId: RUN, model: MODEL, execute, json: true },
        r.deps,
      );
      expect(envelopeOf(r.stdout()).reason.preflightKind).toBe('EVALUATION_COHORT_CONFLICT');
      expect(r.providers()).toBe(0);
      expect(r.statements()).toHaveLength(2);
    });

    it(`${mode}: unverified cohort metadata is refused before any pool is opened`, async () => {
      const r = recorder({ id: ORG_FREE, key: 'T FREE|7' }, () =>
        build(synthetic(), (_p, b) => b.set('DRAW', null)),
      );
      await executeClassifyCommand(
        { organisationId: ORG_FREE, runId: RUN, model: MODEL, execute, json: true },
        r.deps,
      );
      const env = envelopeOf(r.stdout());
      expect(env.code).toBe('PREFLIGHT_REFUSED');
      expect(env.reason.preflightKind).toBe('EVALUATION_COHORT_METADATA_UNVERIFIED');
      expect(r.pools()).toBe(0);
      expect(r.providers()).toBe(0);
    });

    it(`${mode}: an allowed organisation passes the guard and only then reaches assembly`, async () => {
      const r = recorder({ id: ORG_FREE, key: 'T FREE|7' }, syntheticRegistry);
      await executeClassifyCommand(
        { organisationId: ORG_FREE, runId: RUN, model: MODEL, execute, json: true },
        r.deps,
      );
      // The guard's two SELECTs, then the first assembly statement (which the
      // fake refuses) - proving the guard did not block an allowed organisation.
      expect(r.statements().length).toBe(3);
      expect(r.statements()[2]).toMatch(/^SELECT id, eche_row_key, legal_name/);
      expect(r.providers()).toBe(0);
    });
  }

  it('a missing organisation is left to the landed ORGANISATION_NOT_FOUND path', async () => {
    const r = recorder(null, syntheticRegistry);
    await executeClassifyCommand(
      { organisationId: ORG_FREE, runId: RUN, model: MODEL, execute: true, json: true },
      r.deps,
    );
    expect(r.statements()[0]).toMatch(/^SELECT id, eche_row_key FROM organisations/);
    expect(r.providers()).toBe(0);
  });

  it('omitting the loader uses the committed pinned artifacts (never a pool)', async () => {
    const r = recorder(
      { id: '019c1389-1b1e-4bfd-bad9-680ce6542475', key: 'F PARIS520|949449193' },
      loadEvaluationCohortRegistry,
    );
    const deps = { ...r.deps };
    delete (deps as { loadCohortRegistry?: unknown }).loadCohortRegistry;
    await executeClassifyCommand(
      {
        organisationId: '019c1389-1b1e-4bfd-bad9-680ce6542475',
        runId: RUN,
        model: MODEL,
        execute: true,
        json: true,
      },
      deps,
    );
    expect(envelopeOf(r.stdout()).reason.preflightKind).toBe('EVALUATION_COHORT_PROTECTED');
    expect(r.providers()).toBe(0);
  });
});
