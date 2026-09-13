/**
 * PHASE 2B-2D2C-F1 — preflight and freeze: the runner loads and
 * hash-verifies the F0B freeze, reads only the DEVELOPMENT canonical corpus
 * and manifest, reconstructs the twelve frozen batches, verifies all twelve
 * assembly identities and all twenty-four final identities, and builds a
 * deterministic plan in the frozen v1-then-v2 order — all with zero
 * provider, authentication, database and network calls.
 *
 * Reads exactly two evaluation fixtures (the DEVELOPMENT corpus and its
 * manifest). Never opens the mixed source corpus or an adjudication file.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { canonicalStringify } from '../../orgunits/classify/canonical.js';
import { ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION } from '../../orgunits/classify/constants.js';
import { computeFinalInputSha256 } from '../../orgunits/classify/finalIdentity.js';
import { ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION } from '../../orgunits/classify/outputSchema.js';
import { ORGUNIT_SIGNAL_RULE_VERSION } from '../../orgunits/signals/score.js';
import { FETCH_POLICY_VERSION } from '../../orgunits/web/policy.js';
import {
  batchMismatches,
  reconstructAndVerifyFrozenBatches,
  reconstructFrozenBatches,
} from '../harness/phase2b2d2c/batches.js';
import { parseCliArgs, runCli, type CliIo } from '../harness/phase2b2d2c/cli.js';
import {
  EXPECTED_F0B_FREEZE_RAW_SHA256,
  EXPECTED_LOGICAL_EVALUATIONS,
  FREEZE_PATH,
  FROZEN_VARIANTS,
  SUPERSEDED_F0A_FREEZE_RAW_SHA256,
} from '../harness/phase2b2d2c/constants.js';
import { loadDevCorpus } from '../harness/phase2b2d2c/corpus.js';
import { FreezeDriftError, loadFreezeFromBytes, sha256Hex } from '../harness/phase2b2d2c/freeze.js';
import { buildExecutionPlan, planOrderIsFrozen, planSha256 } from '../harness/phase2b2d2c/plan.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FREEZE_BYTES = readFileSync(join(ROOT, FREEZE_PATH));
const ALGORITHMS = {
  canonicalStringify,
  computeFinalInputSha256,
  ruleVersion: ORGUNIT_SIGNAL_RULE_VERSION,
  fetchPolicyVersion: FETCH_POLICY_VERSION,
  assemblyVersion: ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION,
  outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
};
const realReader = { read: (relative: string) => readFileSync(join(ROOT, relative)) };

function flipLastByte(bytes: Buffer): Buffer {
  const copy = Buffer.from(bytes);
  // The file ends with "}\n": flip the closing brace's neighbour inside the JSON text.
  const index = copy.length - 3;
  copy[index] = copy[index] === 0x20 ? 0x21 : 0x20;
  return copy;
}

describe('2D2C-F1 preflight: the F0B freeze', () => {
  it('accepts the committed freeze bytes by exact raw SHA-256', () => {
    const loaded = loadFreezeFromBytes(FREEZE_BYTES);
    expect(loaded.rawSha256).toBe(EXPECTED_F0B_FREEZE_RAW_SHA256);
    expect(loaded.rawBytes).toBe(55_531);
    expect(loaded.freeze.freezeRevision).toBe('F0B_AUTH_RUNTIME_PARITY');
    expect(loaded.freeze.supersedesFreezeRawSha256).toBe(SUPERSEDED_F0A_FREEZE_RAW_SHA256);
    expect(loaded.freeze.batching.plan).toHaveLength(12);
    expect(loaded.freeze.classifier.variants.map((v) => v.name)).toEqual(
      FROZEN_VARIANTS.map((v) => v.name),
    );
  });

  it('rejects a one-byte drift as CORPUS_CONFIG_OR_HASH_DRIFT before parsing', () => {
    const drifted = flipLastByte(FREEZE_BYTES);
    expect(drifted.equals(FREEZE_BYTES)).toBe(false);
    let caught: unknown;
    try {
      loadFreezeFromBytes(drifted);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(FreezeDriftError);
    expect((caught as FreezeDriftError).stopCondition).toBe('CORPUS_CONFIG_OR_HASH_DRIFT');
    expect((caught as Error).message).toContain(EXPECTED_F0B_FREEZE_RAW_SHA256);
    // Appending a byte is also a drift, even though the JSON would still parse.
    expect(() => loadFreezeFromBytes(Buffer.concat([FREEZE_BYTES, Buffer.from('\n')]))).toThrow(
      FreezeDriftError,
    );
    // The superseded F0A hash is named in the freeze but is NOT the accepted hash.
    expect(loadFreezeFromBytes(FREEZE_BYTES).freeze.supersedesFreezeRawSha256).not.toBe(
      EXPECTED_F0B_FREEZE_RAW_SHA256,
    );
  });

  it('refuses the superseded F0A freeze bytes by exact hash, naming them as superseded (F0B rejects F0A)', () => {
    // The exact F0A bytes are committed as a fixture (their hash is the F0A value)
    // so the refusal is BEHAVIOURAL, not structural.
    const f0aBytes = readFileSync(
      join(ROOT, 'src/test/fixtures/phase2b2d2c/freeze-f0a-superseded.json'),
    );
    expect(sha256Hex(f0aBytes)).toBe(SUPERSEDED_F0A_FREEZE_RAW_SHA256);
    let caught: unknown;
    try {
      loadFreezeFromBytes(f0aBytes);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(FreezeDriftError);
    expect((caught as Error).message).toContain('SUPERSEDED F0A');
    expect(EXPECTED_F0B_FREEZE_RAW_SHA256).not.toBe(SUPERSEDED_F0A_FREEZE_RAW_SHA256);
    expect(SUPERSEDED_F0A_FREEZE_RAW_SHA256).toBe(
      '7b84ac0bca90086eea8fb59cdbd501317e3bfd53533fa529a85a8a44988ad6aa',
    );
    expect(FREEZE_BYTES.toString('utf8')).toContain(SUPERSEDED_F0A_FREEZE_RAW_SHA256);
    // The freeze's own variants are the corrected commits, never the R2B/R3 base commits.
    const { freeze } = loadFreezeFromBytes(FREEZE_BYTES);
    for (const variant of freeze.classifier.variants) {
      expect(variant.gitCommit).not.toBe(variant.runtimeBaseCommit);
      expect(FROZEN_VARIANTS.find((v) => v.name === variant.name)?.gitCommit).toBe(
        variant.gitCommit,
      );
    }
  });
});

describe('2D2C-F1 preflight: the DEVELOPMENT corpus', () => {
  const { freeze } = loadFreezeFromBytes(FREEZE_BYTES);

  it('reads exactly the two frozen fixture paths and verifies both raw hashes and the content hash', () => {
    const read: string[] = [];
    const corpus = loadDevCorpus(freeze, {
      read: (relative) => {
        read.push(relative);
        return realReader.read(relative);
      },
    });
    expect(read).toEqual([freeze.corpus.canonicalCorpusPath, freeze.corpus.canonicalManifestPath]);
    expect(corpus.rows).toHaveLength(49);
    expect(corpus.corpusRawSha256).toBe(freeze.corpus.derivedCorpusRawSha256);
    expect(corpus.manifestRawSha256).toBe(freeze.corpus.derivedManifestRawSha256);
    expect(corpus.contentSha256).toBe(freeze.corpus.derivedCorpusContentSha256);
    for (const row of corpus.rows) expect(row.split).toBe('DEVELOPMENT');
  });

  it('refuses to read a path the freeze lists as never-read, before touching the reader', () => {
    const holdout = freeze.corpus.holdoutFilesNeverRead[0]!;
    const poisoned = { ...freeze, corpus: { ...freeze.corpus, canonicalCorpusPath: holdout } };
    let reads = 0;
    expect(() =>
      loadDevCorpus(poisoned, {
        read: () => {
          reads += 1;
          return Buffer.alloc(0);
        },
      }),
    ).toThrow(/never-read/);
    expect(reads).toBe(0);
  });

  it('a corpus whose bytes differ from the freeze is a drift, whatever it parses to', () => {
    const mutated = Buffer.concat([
      realReader.read(freeze.corpus.canonicalCorpusPath),
      Buffer.from('\n'),
    ]);
    expect(() =>
      loadDevCorpus(freeze, {
        read: (relative) =>
          relative === freeze.corpus.canonicalCorpusPath ? mutated : realReader.read(relative),
      }),
    ).toThrow(FreezeDriftError);
  });
});

describe('2D2C-F1 preflight: the twelve frozen batches and their identities', () => {
  const { freeze, rawSha256 } = loadFreezeFromBytes(FREEZE_BYTES);
  const corpus = loadDevCorpus(freeze, realReader);

  it('reconstructs all 12 batches exactly, with every assembly and final identity equal to the freeze', () => {
    const batches = reconstructAndVerifyFrozenBatches(freeze, corpus.rows, ALGORITHMS);
    expect(batches).toHaveLength(12);
    expect(batches.reduce((n, b) => n + b.documents.length, 0)).toBe(49);
    for (const [index, batch] of batches.entries()) {
      const frozen = freeze.batching.plan[index]!;
      expect(batch.ordinal).toBe(frozen.ordinal);
      expect(batch.assemblyInputSha256).toBe(frozen.assemblyInputSha256);
      expect(batch.serializedBatchUtf8Bytes).toBe(frozen.serializedBatchUtf8Bytes);
      expect(canonicalStringify(batch.context)).toBe(canonicalStringify(frozen.context));
      expect(batch.finalInputSha256.PROMPT_V1_CANONICAL).toBe(
        frozen.finalInputSha256.PROMPT_V1_CANONICAL,
      );
      expect(batch.finalInputSha256.PROMPT_V2_CANONICAL).toBe(
        frozen.finalInputSha256.PROMPT_V2_CANONICAL,
      );
      expect(batch.docIndices).toEqual(frozen.docIndices);
      expect(batch.goldIds).toEqual(frozen.goldIds);
    }
    expect(batches[8]!.docIndices).toEqual([2, 8, 5, 10]);
    expect(
      new Set(
        batches.flatMap((b) => [
          b.finalInputSha256.PROMPT_V1_CANONICAL,
          b.finalInputSha256.PROMPT_V2_CANONICAL,
        ]),
      ).size,
    ).toBe(24);
  });

  it('a corpus/config/hash mismatch is reported by exact check and stops before anything executable', () => {
    const batches = reconstructFrozenBatches(corpus.rows, ALGORITHMS);
    const recomputed = reconstructFrozenBatches(
      corpus.rows.map((row, index) =>
        index === 3 ? corpus.rows[4]! : index === 4 ? corpus.rows[3]! : row,
      ),
      ALGORITHMS,
    );
    expect(batchMismatches(freeze.batching.plan, recomputed, canonicalStringify)).toEqual([
      '2:goldIds',
      '2:docIndices',
      '2:assemblyInputSha256',
      '2:canonicalSerializedInputSha256',
      '2:finalInputSha256.PROMPT_V1_CANONICAL',
      '2:finalInputSha256.PROMPT_V2_CANONICAL',
    ]);
    expect(batchMismatches(freeze.batching.plan, batches, canonicalStringify)).toEqual([]);
    // A changed production version constant is a drift before any batch is compared.
    expect(() =>
      reconstructAndVerifyFrozenBatches(freeze, corpus.rows, {
        ...ALGORITHMS,
        ruleVersion: 'orgunit-signal-rules-v2',
      }),
    ).toThrow(/ruleVersion/);
    // A corpus row whose organisation fields disagree stops construction; no version is chosen.
    const [first, ...rest] = corpus.rows;
    expect(() =>
      reconstructFrozenBatches([{ ...first!, runId: `${first!.runId}-x` }, ...rest], ALGORITHMS),
    ).toThrow(/runId disagrees/);
  });

  it('builds a deterministic 24-evaluation plan: v1 batches 1..12, then v2 batches 1..12, byte-identical across builds', () => {
    const batches = reconstructAndVerifyFrozenBatches(freeze, corpus.rows, ALGORITHMS);
    const plan = buildExecutionPlan(freeze, rawSha256, batches);
    const again = buildExecutionPlan(
      freeze,
      rawSha256,
      reconstructAndVerifyFrozenBatches(freeze, corpus.rows, ALGORITHMS),
    );
    expect(plan.evaluations).toHaveLength(EXPECTED_LOGICAL_EVALUATIONS);
    expect(planOrderIsFrozen(plan)).toBe(true);
    expect(planSha256(plan)).toBe(planSha256(again));
    expect(canonicalStringify(plan)).toBe(canonicalStringify(again));
    expect(
      plan.evaluations.slice(0, 12).every((e) => e.variantName === 'PROMPT_V1_CANONICAL'),
    ).toBe(true);
    expect(plan.evaluations.slice(12).every((e) => e.variantName === 'PROMPT_V2_CANONICAL')).toBe(
      true,
    );
    expect(plan.evaluations.map((e) => e.logicalBatchOrdinal)).toEqual([
      ...Array.from({ length: 12 }, (_, i) => i + 1),
      ...Array.from({ length: 12 }, (_, i) => i + 1),
    ]);
    for (const evaluation of plan.evaluations) {
      const frozen = freeze.batching.plan[evaluation.logicalBatchOrdinal - 1]!;
      expect(evaluation.finalInputSha256).toBe(frozen.finalInputSha256[evaluation.variantName]);
      expect(evaluation.canonicalSerializedInputSha256).toBe(evaluation.assemblyInputSha256);
      expect(evaluation.variantLabel).toBe(
        evaluation.variantName === 'PROMPT_V1_CANONICAL'
          ? 'PROMPT_V1_COMPARATOR'
          : 'PROMPT_V2_CANDIDATE',
      );
    }
    expect(plan.freezeConfigRawSha256).toBe(EXPECTED_F0B_FREEZE_RAW_SHA256);
    // A reordered plan is not the frozen order.
    const reordered = { ...plan, evaluations: [...plan.evaluations].reverse() };
    expect(planOrderIsFrozen(reordered)).toBe(false);
    // The plan carries no credential, transcript, environment value or timestamp.
    const keys = new Set<string>();
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value !== null && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
          keys.add(k);
          walk(v);
        }
      }
    };
    walk(plan);
    for (const key of keys)
      expect(key).not.toMatch(/token|secret|password|credential|transcript|env|At$|timestamp/i);
  });
});

describe('2D2C-F1 preflight: the default CLI is plan-only and reaches no launcher', () => {
  function io() {
    const out: string[] = [];
    const err: string[] = [];
    let launches = 0;
    const cliIo: CliIo = {
      stdout: (t) => out.push(t),
      stderr: (t) => err.push(t),
      env: {},
      nowUtc: () => new Date('2026-09-13T12:00:00Z'),
      launcher: {
        launch: async () => {
          launches += 1;
          throw new Error('the launcher must never be reached in these tests');
        },
      },
    };
    return { cliIo, out, err, launches: () => launches };
  }

  it('parses a closed argument set and refuses unknown flags', () => {
    expect(parseCliArgs([])).toEqual({
      execute: false,
      authorisation: null,
      outputRoot: null,
      attemptNo: null,
      v1Root: null,
      v2Root: null,
      classifierConfigDir: null,
      json: false,
    });
    expect(parseCliArgs(['--execute', '--attempt-no', '2']).attemptNo).toBe(2);
    expect(() => parseCliArgs(['--force'])).toThrow(/unknown argument/);
    expect(() => parseCliArgs(['--skip-lock'])).toThrow(/unknown argument/);
    expect(() => parseCliArgs(['--attempt-no', '0'])).toThrow(/positive integer/);
    expect(() => parseCliArgs(['--authorisation'])).toThrow(/requires a value/);
  });

  it('the default invocation prints the plan, verifies every identity, and calls no launcher', async () => {
    const { cliIo, out, launches } = io();
    expect(await runCli([], cliIo)).toBe(0);
    const text = out.join('');
    expect(text).toContain('PLAN ONLY');
    expect(text).toContain(EXPECTED_F0B_FREEZE_RAW_SHA256);
    expect(text).toContain('24 logical evaluations');
    expect(launches()).toBe(0);
  });

  it('--json prints the deterministic plan and --execute alone is refused before any launcher', async () => {
    const a = io();
    const b = io();
    expect(await runCli(['--json'], a.cliIo)).toBe(0);
    expect(await runCli(['--json'], b.cliIo)).toBe(0);
    expect(a.out.join('')).toBe(b.out.join(''));
    const parsed = JSON.parse(a.out.join('')) as { plan: { evaluations: unknown[] }; mode: string };
    expect(parsed.mode).toBe('PLAN_ONLY');
    expect(parsed.plan.evaluations).toHaveLength(24);
    const c = io();
    expect(await runCli(['--execute'], c.cliIo)).toBe(2);
    expect(c.err.join('')).toMatch(/REFUSED: execution requires .*--authorisation/);
    expect(c.launches()).toBe(0);
  });
});
