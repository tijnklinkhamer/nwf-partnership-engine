/**
 * PHASE 2B-2D2C-F0D — the pure plan verification shared by the attempt-2
 * readiness CLI and the attempt-2 scorer, and its mutation coverage: a
 * reordered batch, a swapped-in attempt-1 identity, a changed assembly
 * identity, a changed gold-id order and a HOLDOUT path or token smuggled
 * into the plan are each detected. In-memory clones only; the committed
 * bytes are re-verified untouched afterwards.
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
import { reconstructFrozenBatches } from '../harness/phase2b2d2c/batches.js';
import { loadDevCorpus } from '../harness/phase2b2d2c/corpus.js';
import {
  APPROVED_F0C_PLAN_SHA256,
  buildF0CExecutionPlan,
  F0C_FREEZE_PATH,
  f0cPlanOrderIsFrozen,
  f0cPlanSha256,
  loadF0CFreezeFromBytes,
  type F0CExecutionPlan,
  type F0CFreeze,
} from '../harness/phase2b2d2c/f0c/freezeF0C.js';
import {
  f0cBatchMismatches,
  holdoutBoundaryViolations,
} from '../harness/phase2b2d2c/f0c/planVerification.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BYTES = readFileSync(join(ROOT, F0C_FREEZE_PATH));
const { freeze, rawSha256 } = loadF0CFreezeFromBytes(BYTES);
const corpus = loadDevCorpus(freeze, { read: (relative) => readFileSync(join(ROOT, relative)) });
const batches = reconstructFrozenBatches(corpus.rows, {
  canonicalStringify,
  computeFinalInputSha256,
  ruleVersion: ORGUNIT_SIGNAL_RULE_VERSION,
  fetchPolicyVersion: FETCH_POLICY_VERSION,
  assemblyVersion: ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION,
  outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
});
const PLAN = buildF0CExecutionPlan(freeze, rawSha256);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('2D2C-F0D plan verification: the approved plan against batches reconstructed from the DEVELOPMENT corpus', () => {
  it('the committed freeze reconstructs with zero mismatches, and the rebuilt plan is the approved one in the frozen order', () => {
    expect(f0cBatchMismatches(freeze, batches)).toEqual([]);
    expect(holdoutBoundaryViolations(freeze, PLAN)).toEqual([]);
    expect(f0cPlanOrderIsFrozen(PLAN)).toBe(true);
    expect(f0cPlanSha256(PLAN)).toBe(APPROVED_F0C_PLAN_SHA256);
  });

  it('a swapped-in attempt-1 identity, a changed assembly identity, a changed gold-id order and a reordered batch are each detected by name', () => {
    const swapped = clone(freeze) as F0CFreeze;
    swapped.batching.plan[0]!.finalInputSha256.PROMPT_V3_CANONICAL =
      swapped.batching.plan[0]!.attempt1ComparatorFinalInputSha256.PROMPT_V2_CANONICAL;
    expect(f0cBatchMismatches(swapped, batches)).toEqual([
      '1:finalInputSha256.PROMPT_V3_CANONICAL',
    ]);

    const assembly = clone(freeze) as F0CFreeze;
    assembly.batching.plan[4]!.assemblyInputSha256 = assembly.batching.plan[3]!.assemblyInputSha256;
    expect(f0cBatchMismatches(assembly, batches)).toContain('5:assemblyInputSha256');

    const goldOrder = clone(freeze) as F0CFreeze;
    goldOrder.batching.plan[1]!.goldIds = [...goldOrder.batching.plan[1]!.goldIds].reverse();
    expect(f0cBatchMismatches(goldOrder, batches)).toEqual(['2:goldIds']);

    const reordered = clone(freeze) as F0CFreeze;
    const [first, second] = reordered.batching.plan as [
      F0CFreeze['batching']['plan'][number],
      F0CFreeze['batching']['plan'][number],
    ];
    reordered.batching.plan.splice(0, 2, second, first);
    const mismatches = f0cBatchMismatches(reordered, batches);
    expect(mismatches).toContain('2:ordinal');
    expect(mismatches).toContain('1:ordinal');
  });

  it('a comparator identity equal to the V3 identity, or a comparator identity that is not the reconstruction’s, is detected', () => {
    const equal = clone(freeze) as F0CFreeze;
    equal.batching.plan[2]!.attempt1ComparatorFinalInputSha256.PROMPT_V1_CANONICAL =
      equal.batching.plan[2]!.finalInputSha256.PROMPT_V3_CANONICAL;
    const mismatches = f0cBatchMismatches(equal, batches);
    expect(mismatches).toContain('3:attempt1ComparatorFinalInputSha256.PROMPT_V1_CANONICAL');
    expect(mismatches).toContain('3:V3 identity equals PROMPT_V1_CANONICAL');
  });

  it('a HOLDOUT path or the HOLDOUT token smuggled into the plan is detected; a reordered or truncated plan is not in the frozen order', () => {
    const never = freeze.corpus.holdoutFilesNeverRead[0]!;
    const smuggledPath = clone(PLAN) as unknown as { evaluations: { echeRowKey: string }[] };
    smuggledPath.evaluations[0]!.echeRowKey = never;
    expect(holdoutBoundaryViolations(freeze, smuggledPath as unknown as F0CExecutionPlan)).toEqual([
      never,
    ]);
    const smuggledToken = clone(PLAN) as unknown as { evaluations: { organisationId: string }[] };
    smuggledToken.evaluations[11]!.organisationId = 'HOLDOUT-item';
    expect(holdoutBoundaryViolations(freeze, smuggledToken as unknown as F0CExecutionPlan)).toEqual(
      ['the token HOLDOUT'],
    );
    const reordered = clone(PLAN) as unknown as { evaluations: unknown[] };
    reordered.evaluations.reverse();
    expect(f0cPlanOrderIsFrozen(reordered as unknown as F0CExecutionPlan)).toBe(false);
    const truncated = clone(PLAN) as unknown as { evaluations: unknown[] };
    truncated.evaluations.pop();
    expect(f0cPlanOrderIsFrozen(truncated as unknown as F0CExecutionPlan)).toBe(false);
    // Every mutation above changes the plan identity; the committed bytes are untouched.
    expect(f0cPlanSha256(reordered as unknown as F0CExecutionPlan)).not.toBe(
      APPROVED_F0C_PLAN_SHA256,
    );
    expect(loadF0CFreezeFromBytes(readFileSync(join(ROOT, F0C_FREEZE_PATH))).rawSha256).toBe(
      rawSha256,
    );
  });
});
