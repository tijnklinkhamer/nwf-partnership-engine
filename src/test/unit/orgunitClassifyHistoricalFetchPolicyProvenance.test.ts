/**
 * PHASE 2B — HISTORICAL FETCH-POLICY PROVENANCE, AND THE PROOF IT IS NOT A
 * WEAKENING.
 *
 * ADR 0012 moved production acquisition to `orgunit-fetch-policy-v2`, and ADR
 * 0013 moved it again to `orgunit-fetch-policy-v3`, ADR 0015 to
 * `orgunit-fetch-policy-v4`, the anchor document-base repair to
 * `orgunit-fetch-policy-v5`, and the discovery RCDATA repair to
 * `orgunit-fetch-policy-v6`. Every
 * historical 2D2C freeze binds `orgunit-fetch-policy-v1` inside its frozen
 * `ClassifierBatchContext`, and therefore inside its frozen canonical bytes,
 * `assemblyInputSha256` and `finalInputSha256`. Those experiments really did
 * run under v1 provenance, and no new evidence was acquired.
 *
 * The freeze verifier used to require
 *
 *     freeze.inputConstruction.context.fetchPolicyVersion === FETCH_POLICY_VERSION
 *
 * where the right-hand side is the CURRENT acquisition build's constant. That
 * is the wrong temporal boundary: the classifier's own production loader takes
 * fetch-policy provenance from `orgunit_research_runs.fetch_policy_version`
 * (`loaders.ts::loadRunContext`), so for a classifier input it is a fact about
 * the acquisition RUN, not about the build reading the freeze. Under that rule
 * the only ways to make the suite green would have been to re-freeze history
 * to v2 — inventing new input identities for experiments whose evidence was
 * never re-acquired — or to abandon the repair.
 *
 * This file proves the third way is sound. It shows, in one place:
 *
 *   1. production is v3 RIGHT NOW - two bumps away from the frozen value,
 *      which is the point: the guard below is indifferent to HOW FAR
 *      production has moved, so a third bump needs no new argument here;
 *   2. a real historical freeze reconstructs and verifies exactly as v1,
 *      matching every frozen oracle byte for byte;
 *   3. mutating that frozen v1 to v2 IN MEMORY still fails with
 *      CORPUS_CONFIG_OR_HASH_DRIFT — in both places the value lives;
 *   4. every other version check still bites, so nothing else was relaxed;
 *   5. the freeze file on disk is byte-identical afterwards.
 *
 * (3) is the whole point: the guard did not go away, it stopped asking the
 * wrong question. It now asks "does this input match the provenance FROZEN FOR
 * IT?" instead of "does this input match today's global policy?".
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
  historicalRunProvenanceOf,
  reconstructAndVerifyFrozenBatches,
  reconstructFrozenBatches,
} from '../harness/phase2b2d2c/batches.js';
import { FREEZE_PATH } from '../harness/phase2b2d2c/constants.js';
import { loadDevCorpus } from '../harness/phase2b2d2c/corpus.js';
import {
  FreezeDriftError,
  loadFreezeFromBytes,
  type Freeze,
} from '../harness/phase2b2d2c/freeze.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FREEZE_BYTES = readFileSync(join(ROOT, FREEZE_PATH));
const { freeze } = loadFreezeFromBytes(FREEZE_BYTES);
const corpus = loadDevCorpus(freeze, { read: (relative) => readFileSync(join(ROOT, relative)) });

/** Everything that genuinely IS an algorithm this build implements. */
const ALGORITHMS = {
  canonicalStringify,
  computeFinalInputSha256,
  ruleVersion: ORGUNIT_SIGNAL_RULE_VERSION,
  assemblyVersion: ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION,
  outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
};

const HISTORICAL = 'orgunit-fetch-policy-v1';
const PRODUCTION = 'orgunit-fetch-policy-v6';

/** A deep structural copy, so a mutation can never reach the loaded freeze or the file. */
const cloneFreeze = (): Freeze => JSON.parse(JSON.stringify(freeze)) as Freeze;

describe('the two fetch-policy versions are genuinely different right now', () => {
  it('production acquisition is v6', () => {
    expect(FETCH_POLICY_VERSION).toBe(PRODUCTION);
  });

  it('has moved FIVE TIMES since the freeze, and the freeze followed none of them', () => {
    // ADR 0012 (v1 -> v2), ADR 0013 (v2 -> v3), ADR 0015 (v3 -> v4), the
    // anchor document-base repair (v4 -> v5) and the discovery RCDATA repair
    // (v5 -> v6). None required a single byte of a historical freeze to
    // change, and this is what proves it: the frozen value is still the FIRST
    // version, unchanged across all five bumps.
    expect(freeze.inputConstruction.context.fetchPolicyVersion).toBe('orgunit-fetch-policy-v1');
    for (const superseded of [
      'orgunit-fetch-policy-v2',
      'orgunit-fetch-policy-v3',
      'orgunit-fetch-policy-v4',
      'orgunit-fetch-policy-v5',
      'orgunit-fetch-policy-v6',
    ]) {
      expect(freeze.inputConstruction.context.fetchPolicyVersion, superseded).not.toBe(superseded);
    }
  });

  it('the historical freeze is v1, in its construction contract AND in every batch', () => {
    expect(freeze.inputConstruction.context.fetchPolicyVersion).toBe(HISTORICAL);
    for (const batch of freeze.batching.plan) {
      expect(batch.context.fetchPolicyVersion, `batch ${batch.ordinal}`).toBe(HISTORICAL);
    }
    // The regression this file exists for only has teeth while these differ.
    expect(FETCH_POLICY_VERSION).not.toBe(freeze.inputConstruction.context.fetchPolicyVersion);
  });

  it('the provenance reader returns the FROZEN value, not the production one', () => {
    expect(historicalRunProvenanceOf(freeze)).toEqual({ fetchPolicyVersion: HISTORICAL });
  });
});

describe('a historical v1 freeze verifies under a production v2 build', () => {
  it('reconstructs all twelve batches and matches every frozen oracle', () => {
    const batches = reconstructAndVerifyFrozenBatches(freeze, corpus.rows, ALGORITHMS);
    expect(batches).toHaveLength(freeze.batching.plan.length);
    for (const [index, batch] of batches.entries()) {
      const frozen = freeze.batching.plan[index]!;
      expect(batch.context.fetchPolicyVersion).toBe(HISTORICAL);
      expect(canonicalStringify(batch.context)).toBe(canonicalStringify(frozen.context));
      expect(batch.serializedBatchUtf8Bytes).toBe(frozen.serializedBatchUtf8Bytes);
      expect(batch.assemblyInputSha256).toBe(frozen.assemblyInputSha256);
      expect(batch.finalInputSha256.PROMPT_V1_CANONICAL).toBe(
        frozen.finalInputSha256.PROMPT_V1_CANONICAL,
      );
      expect(batch.finalInputSha256.PROMPT_V2_CANONICAL).toBe(
        frozen.finalInputSha256.PROMPT_V2_CANONICAL,
      );
    }
  });

  it('reconstructing with the PRODUCTION version instead would break every identity', () => {
    // Not how anything calls it any more - this is the counterfactual that
    // shows the choice of provenance is load-bearing rather than cosmetic.
    const wrong = reconstructFrozenBatches(corpus.rows, ALGORITHMS, {
      fetchPolicyVersion: PRODUCTION,
    });
    for (const [index, batch] of wrong.entries()) {
      const frozen = freeze.batching.plan[index]!;
      expect(batch.assemblyInputSha256).not.toBe(frozen.assemblyInputSha256);
      expect(batch.finalInputSha256.PROMPT_V1_CANONICAL).not.toBe(
        frozen.finalInputSha256.PROMPT_V1_CANONICAL,
      );
    }
  });
});

describe('mutating the frozen historical provenance still fails: the guard was not removed', () => {
  it('v1 -> v2 in the construction contract is CORPUS_CONFIG_OR_HASH_DRIFT', () => {
    const mutated = cloneFreeze();
    mutated.inputConstruction.context.fetchPolicyVersion = PRODUCTION;
    let thrown: unknown;
    try {
      reconstructAndVerifyFrozenBatches(mutated, corpus.rows, ALGORITHMS);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(FreezeDriftError);
    expect((thrown as FreezeDriftError).stopCondition).toBe('CORPUS_CONFIG_OR_HASH_DRIFT');
    // And it names the disagreement rather than a hash, because the freeze
    // now contradicts itself before a single byte is serialized.
    expect((thrown as Error).message).toMatch(/disagrees with itself about fetchPolicyVersion/);
  });

  it('v1 -> v2 in EVERY batch context is CORPUS_CONFIG_OR_HASH_DRIFT too', () => {
    const mutated = cloneFreeze();
    mutated.inputConstruction.context.fetchPolicyVersion = PRODUCTION;
    for (const batch of mutated.batching.plan) batch.context.fetchPolicyVersion = PRODUCTION;
    // Self-consistent now, so it reaches the hash comparison - and fails
    // there, because the frozen bytes and identities were derived from v1.
    let thrown: unknown;
    try {
      reconstructAndVerifyFrozenBatches(mutated, corpus.rows, ALGORITHMS);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(FreezeDriftError);
    expect((thrown as FreezeDriftError).stopCondition).toBe('CORPUS_CONFIG_OR_HASH_DRIFT');
    expect((thrown as Error).message).toMatch(/assemblyInputSha256/);
    expect((thrown as Error).message).toMatch(/finalInputSha256/);
  });

  it('mutating ONE batch context alone is refused as a self-contradiction', () => {
    const mutated = cloneFreeze();
    mutated.batching.plan[0]!.context.fetchPolicyVersion = PRODUCTION;
    expect(() => reconstructAndVerifyFrozenBatches(mutated, corpus.rows, ALGORITHMS)).toThrow(
      /disagrees with itself about fetchPolicyVersion/,
    );
  });

  it('a structurally unusable frozen value is refused rather than hashed', () => {
    for (const bad of ['', '   ', 'v1', 'orgunit-fetch-policy', 'orgunit-signal-rules-v1']) {
      const mutated = cloneFreeze();
      mutated.inputConstruction.context.fetchPolicyVersion = bad;
      expect(() => historicalRunProvenanceOf(mutated), bad).toThrow(
        /no usable historical fetchPolicyVersion/,
      );
    }
  });
});

describe('nothing else was relaxed', () => {
  it('a drifted ruleVersion, assemblyVersion or outputSchemaVersion still stops the run', () => {
    expect(() =>
      reconstructAndVerifyFrozenBatches(freeze, corpus.rows, {
        ...ALGORITHMS,
        ruleVersion: 'orgunit-signal-rules-v2',
      }),
    ).toThrow(/ruleVersion/);
    expect(() =>
      reconstructAndVerifyFrozenBatches(freeze, corpus.rows, {
        ...ALGORITHMS,
        assemblyVersion: 'orgunit-classifier-assembly-v99',
      }),
    ).toThrow(/assemblyVersion/);
    expect(() =>
      reconstructAndVerifyFrozenBatches(freeze, corpus.rows, {
        ...ALGORITHMS,
        outputSchemaVersion: 'orgunit-classifier-output-schema-v99',
      }),
    ).toThrow(/outputSchemaVersion/);
  });

  it('a drifted corpus is still caught by the frozen identities', () => {
    const [first, ...rest] = corpus.rows;
    expect(() =>
      reconstructAndVerifyFrozenBatches(
        freeze,
        [{ ...first!, runId: `${first!.runId}-x` }, ...rest],
        ALGORITHMS,
      ),
    ).toThrow(/runId disagrees/);
  });

  it('the fetch-policy version is no longer a member of the ALGORITHMS contract at all', () => {
    // A caller cannot reintroduce the defect by habit: there is nowhere in
    // the algorithms bag for a production acquisition constant to sit.
    expect(Object.keys(ALGORITHMS)).not.toContain('fetchPolicyVersion');
    const source = readFileSync(join(ROOT, 'src/test/harness/phase2b2d2c/batches.ts'), 'utf8');
    // It names the production constant only in prose, explaining why it must
    // NOT be used; it imports nothing from the acquisition policy module.
    expect(source).not.toMatch(/^import[^\n]*orgunits\/web\/policy\.js/m);
  });
});

describe('no frozen byte moved', () => {
  it('the freeze file on disk is byte-identical after every mutation above', () => {
    expect(readFileSync(join(ROOT, FREEZE_PATH))).toEqual(FREEZE_BYTES);
  });

  it('the loaded in-memory freeze still reads v1', () => {
    expect(freeze.inputConstruction.context.fetchPolicyVersion).toBe(HISTORICAL);
    for (const batch of freeze.batching.plan) {
      expect(batch.context.fetchPolicyVersion).toBe(HISTORICAL);
    }
  });
});
