/**
 * PHASE 2B-2D2C-F0V — the PROPOSED V4/V5 N=5 paired replication-study
 * freeze (`docs/evaluation/PHASE_2B_2D2C_DEV_REPLICATION_STUDY_FREEZE_F0V_V1.json`).
 * FREEZE PREPARATION ONLY, per owner decision
 * `APPROVE_F0U_M1_FOR_REPLICATION_STUDY_FREEZE_PREPARATION_ONLY`. No owner
 * freeze approval exists, no execution authorisation exists, no output
 * root exists, and none is created anywhere by this file.
 *
 * What is proved:
 *   - F0V loads at its pinned raw SHA-256/byte count, PROPOSED, revision
 *     F0V_REPLICATION_STUDY_V4_V5_N5, authorising nothing;
 *   - the derived 120-evaluation replication-study plan (10 slots x 12
 *     already-frozen batches) matches the pinned plan SHA-256 and is
 *     byte-deterministic across repeated derivations;
 *   - the plan schedules EXACTLY the frozen alternating pair order
 *     (V4/V5/V5/V4/V4/V5/V5/V4/V4/V5) and NOTHING else - no V1/V2/V3/V6
 *     evaluation anywhere;
 *   - each of the 10 slots covers exactly the 49 DEVELOPMENT documents via
 *     its variant's 12 already-frozen batches;
 *   - the per-run ceiling (61 provider requests / 183 adapter attempts) is
 *     identical for V4 and V5, and the full-study ceiling (610/1830) is
 *     RE-DERIVED by summing each of the 10 slots' own per-run ceiling, not
 *     a hardcoded multiplication - proved by an explicit disagreement
 *     case;
 *   - all 10 future output-root names are distinct and none exists on
 *     disk;
 *   - every identity (V4/V5 runtime commit, prompt SHA-256, historical
 *     freeze/plan SHA-256, F0U methodology commit/hash) matches this
 *     build's production constants;
 *   - MUTATION: a changed byte, a reordered/substituted slot, and a wrong
 *     V4/V5 identity are refused;
 *   - no execution CLI, execution lock, output-root creator or
 *     authorisation-candidate module exists anywhere under
 *     `src/test/harness/phase2b2d2c/f0v/`.
 *
 * No Git, no network, no database, no provider, no filesystem write.
 * Zero inference is exercised or authorised by this file.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { canonicalStringify } from '../../orgunits/classify/canonical.js';
import {
  loadF0IFreezeFromBytes,
  buildF0IExecutionPlan,
  F0I_FREEZE_PATH,
} from '../harness/phase2b2d2c/f0i/freezeF0I.js';
import {
  loadF0OFreezeFromBytes,
  buildF0OExecutionPlan,
  F0O_FREEZE_PATH,
  V4_RUNTIME_COMMIT,
  V5_RUNTIME_COMMIT,
} from '../harness/phase2b2d2c/f0o/freezeF0O.js';
import {
  F0V_APPROVAL_RECORD_PATH,
  F0V_APPROVAL_RECORD_RAW_SHA256,
  F0V_FREEZE_ID,
  F0V_FREEZE_PATH,
  F0V_FREEZE_REVISION,
  F0V_STATUS,
  F0V_STUDY_ROOT,
  F0VFreezeError,
  assertF0VFreezeAgreesWithProduction,
  f0vPlanSha256,
  loadF0VFreezeFromBytes,
  PROPOSED_F0V_FREEZE_RAW_BYTES,
  PROPOSED_F0V_FREEZE_RAW_SHA256,
  PROPOSED_F0V_PLAN_SHA256,
} from '../harness/phase2b2d2c/f0v/freezeF0V.js';
import {
  buildReplicationStudyPlan,
  deriveStudyCeilings,
  F0V_N_PER_PROMPT,
  F0V_SLOTS,
  F0V_TOTAL_SLOTS,
  futureOutputRootPathOf,
  futureOutputRootsAreDistinct,
  StudyPlanError,
  studyPlanOrderIsFrozen,
  studyPlanSha256,
} from '../harness/phase2b2d2c/f0v/studyPlanCore.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const F0V_BYTES = readFileSync(join(ROOT, F0V_FREEZE_PATH));
const F0I_BYTES = readFileSync(join(ROOT, F0I_FREEZE_PATH));
const F0O_BYTES = readFileSync(join(ROOT, F0O_FREEZE_PATH));
const F0V = loadF0VFreezeFromBytes(F0V_BYTES);
const F0I = loadF0IFreezeFromBytes(F0I_BYTES);
const F0O = loadF0OFreezeFromBytes(F0O_BYTES);
const F0I_PLAN = buildF0IExecutionPlan(F0I.freeze, F0I.rawSha256);
const F0O_PLAN = buildF0OExecutionPlan(F0O.freeze, F0O.rawSha256);
const PLAN = buildReplicationStudyPlan(F0I_PLAN, F0O_PLAN);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const raw = (bytes: Buffer): Record<string, unknown> =>
  JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

describe('2D2C-F0V: identity and status - FREEZE APPROVED, no execution authorisation, no output root', () => {
  it('loads at the pinned raw SHA-256 and byte count, PROPOSED, authorising nothing', () => {
    expect(F0V.rawSha256).toBe(PROPOSED_F0V_FREEZE_RAW_SHA256);
    expect(F0V.rawBytes).toBe(PROPOSED_F0V_FREEZE_RAW_BYTES);
    expect(F0V.freeze.freezeId).toBe(F0V_FREEZE_ID);
    expect(F0V.freeze.status).toBe(F0V_STATUS);
    expect(F0V.freeze.freezeRevision).toBe(F0V_FREEZE_REVISION);
    expect(F0V.freeze.approvalModel.thisFileAuthorises).toEqual([]);
    expect(F0V.freeze.exclusions.thisFreezeAuthorises).toEqual([]);
  });

  it('the F0V owner approval record EXISTS, hashes to the pinned value, names exactly the frozen bytes/plan, and authorises no execution', () => {
    expect(F0V_APPROVAL_RECORD_PATH).not.toBeNull();
    const bytes = readFileSync(join(ROOT, F0V_APPROVAL_RECORD_PATH as string));
    expect(F0V_APPROVAL_RECORD_RAW_SHA256).toBe(sha(bytes));
    expect(F0V_APPROVAL_RECORD_RAW_SHA256).toMatch(/^[0-9a-f]{64}$/);
    const record = JSON.parse(bytes.toString('utf8')) as {
      recordKind: string;
      approves: string;
      approvedFreeze: {
        file: string;
        rawSha256: string;
        rawBytes: number;
        derivedStudyPlanSha256: string;
        branchCommit: string;
        freezeRevision: string;
      };
      studyDesign: {
        nPerPrompt: number;
        totalFreshRuns: number;
        totalLogicalEvaluations: number;
        v4LogicalEvaluations: number;
        v5LogicalEvaluations: number;
        historicalRunsRole: string;
      };
      ceilings: {
        fullStudy: { maxProviderRequests: number; maxAdapterAttempts: number };
      };
      freezeApprovalIsNotExecutionAuthorisation: boolean;
      holdout: { forbidden: boolean };
      statementMarkerAsReceived: string;
      thisRecordAuthorises: unknown[];
      thisRecordDoesNotAuthorise: string[];
    };
    expect(record.recordKind).toBe('OWNER_FREEZE_APPROVAL');
    expect(record.approves).toBe('REPLICATION_STUDY_FREEZE_ONLY');
    expect(record.approvedFreeze.file).toBe(F0V_FREEZE_PATH);
    expect(record.approvedFreeze.rawSha256).toBe(PROPOSED_F0V_FREEZE_RAW_SHA256);
    expect(record.approvedFreeze.rawBytes).toBe(PROPOSED_F0V_FREEZE_RAW_BYTES);
    expect(record.approvedFreeze.derivedStudyPlanSha256).toBe(PROPOSED_F0V_PLAN_SHA256);
    expect(record.approvedFreeze.freezeRevision).toBe(F0V_FREEZE_REVISION);
    expect(record.studyDesign.nPerPrompt).toBe(F0V_N_PER_PROMPT);
    expect(record.studyDesign.totalFreshRuns).toBe(F0V_TOTAL_SLOTS);
    expect(record.studyDesign.totalLogicalEvaluations).toBe(120);
    expect(record.studyDesign.v4LogicalEvaluations).toBe(60);
    expect(record.studyDesign.v5LogicalEvaluations).toBe(60);
    expect(record.studyDesign.historicalRunsRole).toBe('PILOT_ONLY');
    expect(record.ceilings.fullStudy.maxProviderRequests).toBe(610);
    expect(record.ceilings.fullStudy.maxAdapterAttempts).toBe(1830);
    expect(record.freezeApprovalIsNotExecutionAuthorisation).toBe(true);
    expect(record.holdout.forbidden).toBe(true);
    expect(record.statementMarkerAsReceived).toBe('APPROVE_F0V_REPLICATION_STUDY_FREEZE');
    expect(record.thisRecordAuthorises).toEqual([]);
    expect(record.thisRecordDoesNotAuthorise.length).toBeGreaterThan(0);
    expect(record.thisRecordDoesNotAuthorise).toEqual(
      expect.arrayContaining([
        'any classifier inference',
        'any execution',
        'creation of any study output root',
        'creation of any execution-authorisation candidate',
      ]),
    );
  });

  it('names its owner decision as freeze-preparation-only', () => {
    expect(raw(F0V_BYTES).methodology).toMatchObject({
      ownerDecision: 'APPROVE_F0U_M1_FOR_REPLICATION_STUDY_FREEZE_PREPARATION_ONLY',
      recommendation: 'M1_FULL_PAIRED_REPLICATION_STUDY',
    });
    expect(F0V.freeze.methodology.recommendation).toBe('M1_FULL_PAIRED_REPLICATION_STUDY');
  });

  it('creates no output root and no execution-authorisation candidate anywhere on disk', () => {
    expect(existsSync(F0V_STUDY_ROOT)).toBe(false);
    for (const slot of F0V_SLOTS) {
      expect(existsSync(futureOutputRootPathOf(F0V_STUDY_ROOT, slot))).toBe(false);
    }
  });

  it('the f0v harness directory holds only freeze/plan-derivation machinery - no CLI, no lock, no authorisation, no variant root', () => {
    const dir = resolve(ROOT, 'src/test/harness/phase2b2d2c/f0v');
    const files = readdirSync(dir).sort();
    expect(files).toEqual(['freezeF0V.ts', 'studyPlanCore.ts']);
    for (const file of files) {
      const content = readFileSync(join(dir, file), 'utf8');
      expect(content).not.toMatch(/execFileSync|execSync|spawn\(|child_process/);
      expect(content).not.toMatch(/mkdirSync|writeFileSync/);
      expect(content).not.toMatch(/AgentSdkRunner|createProvider|query\(/);
    }
  });
});

describe('2D2C-F0V: the disclosed F0U process deviation, preserved and not rewritten', () => {
  it('names the exact unauthorised commit, its parent, and the superseding commit', () => {
    expect(F0V.freeze.processDeviationDisclosure).toMatchObject({
      unauthorisedCommit: '444dce0a84838116246b48ed9b3f3a3994fd2324',
      unauthorisedCommitParent: '71933872510c1a27e5e011d76641999c029bea24',
      unauthorisedCommitFilesChanged: [
        'docs/audits/PHASE_2B_2D2C_F0U_REPLICATION_METHODOLOGY_REVIEW_2026-09.md',
      ],
      supersededByCommit: '9454e0167fa8cc28d929a1fbf023b26c9727c9b6',
      supersedingCommitIsDirectChildOfUnauthorisedCommit: true,
      forcePushOccurred: false,
      historyRewritten: false,
      priorCommitDeleted: false,
      mainTouched: false,
      classification: 'PROCEDURAL_AGENT_CONTROL_DEVIATION_NOT_EMPIRICAL_EVIDENCE_CONTAMINATION',
    });
  });

  it('methodology.commit is exactly the reconciled F0U commit, hashed at 59,082 bytes', () => {
    expect(F0V.freeze.methodology.commit).toBe('9454e0167fa8cc28d929a1fbf023b26c9727c9b6');
    expect(F0V.freeze.methodology.rawSha256).toBe(
      'd8b3e57992fe091aed95e7490d4b3c0fe0f4a7bfcc1bb6c7b09bd83252e79cf7',
    );
    expect(F0V.freeze.methodology.rawBytes).toBe(59_082);
  });
});

describe('2D2C-F0V: the two F0U methodological clarifications are encoded verbatim', () => {
  it('does not claim batch-mate causal dependence - only that the effect is unmeasured', () => {
    const text = F0V.freeze.clarifications.batchPreservationRationale;
    expect(text).toMatch(/UNMEASURED/);
    expect(text).toMatch(/not established that batch-mates are causally material/);
    expect(text).not.toMatch(/proves? causal dependence/i);
  });

  it('does not claim to isolate pure sampling randomness - names residual provider-side unknowns', () => {
    const text = F0V.freeze.clarifications.estimand;
    expect(text).toMatch(/RUN-TO-RUN BEHAVIOURAL VARIABILITY AND PAIRED V4\/V5 DIFFERENCES/);
    // Never a source-code literal (phase1a.firewall.test.ts): the requested
    // model id is read from F0O's own already-loaded freeze at runtime.
    expect(text).toContain(F0O.freeze.classifier.requestedModelId);
    expect(text).toMatch(/prompt-caching/);
    expect(text).not.toMatch(/isolat(e|ing) pure sampling randomness$/m);
  });
});

describe("2D2C-F0V: approved design is Design B directly - Design A' is documented context only", () => {
  it("approvedDesign is DESIGN_B_FULL_FROZEN_BATCH_RESAMPLING; Design A' is not executed first", () => {
    expect(F0V.freeze.studyDesign.approvedDesign).toBe('DESIGN_B_FULL_FROZEN_BATCH_RESAMPLING');
    expect(F0V.freeze.studyDesign.designAPrimeExecutedFirst).toBe(false);
  });

  it('N=5 per prompt, 10 fresh runs, historical runs pilot-only, never counted toward N, no V1/V2/V3/V6', () => {
    expect(F0V.freeze.studyDesign).toMatchObject({
      nPerPrompt: 5,
      totalFreshRuns: 10,
      historicalRunsCountTowardN: false,
      historicalRunsRole: 'PILOT_ONLY',
      v1v2v3Rerun: false,
      v6: false,
    });
  });
});

describe('2D2C-F0V: the derived 120-evaluation replication-study plan', () => {
  it('rebuilds to the pinned plan SHA-256, deterministically across repeated derivations', () => {
    expect(studyPlanSha256(PLAN)).toBe(PROPOSED_F0V_PLAN_SHA256);
    expect(f0vPlanSha256(PLAN)).toBe(PROPOSED_F0V_PLAN_SHA256);
    const second = buildReplicationStudyPlan(F0I_PLAN, F0O_PLAN);
    expect(studyPlanSha256(second)).toBe(PROPOSED_F0V_PLAN_SHA256);
    expect(canonicalStringify(second)).toBe(canonicalStringify(PLAN));
  });

  it('schedules exactly 10 slots x 12 batches = 120 logical evaluations, in the frozen order', () => {
    expect(PLAN.plannedLogicalEvaluations).toBe(120);
    expect(PLAN.evaluations).toHaveLength(120);
    expect(studyPlanOrderIsFrozen(PLAN)).toBe(true);
  });

  it('the frozen slot/variant sequence is exactly V4,V5,V5,V4,V4,V5,V5,V4,V4,V5 (PAIR_1_V4 .. PAIR_5_V5)', () => {
    expect(F0V_SLOTS.map((slot) => slot.slotId)).toEqual([
      'PAIR_1_V4',
      'PAIR_1_V5',
      'PAIR_2_V5',
      'PAIR_2_V4',
      'PAIR_3_V4',
      'PAIR_3_V5',
      'PAIR_4_V5',
      'PAIR_4_V4',
      'PAIR_5_V4',
      'PAIR_5_V5',
    ]);
    expect(F0V_SLOTS.map((slot) => slot.variantName)).toEqual([
      'PROMPT_V4_CANONICAL',
      'PROMPT_V5_CANONICAL',
      'PROMPT_V5_CANONICAL',
      'PROMPT_V4_CANONICAL',
      'PROMPT_V4_CANONICAL',
      'PROMPT_V5_CANONICAL',
      'PROMPT_V5_CANONICAL',
      'PROMPT_V4_CANONICAL',
      'PROMPT_V4_CANONICAL',
      'PROMPT_V5_CANONICAL',
    ]);
    expect(F0V_TOTAL_SLOTS).toBe(10);
    expect(F0V_N_PER_PROMPT).toBe(5);
  });

  it('no PROMPT_V1/V2/V3/V6_CANONICAL evaluation appears anywhere in the plan - only V4 and V5', () => {
    const names = new Set(PLAN.evaluations.map((evaluation) => evaluation.variantName));
    expect(names).toEqual(new Set(['PROMPT_V4_CANONICAL', 'PROMPT_V5_CANONICAL']));
  });

  it('each slot covers exactly the 49 DEVELOPMENT documents (12 batches, ordinals 1..12) via its own goldIds union', () => {
    for (const slot of F0V_SLOTS) {
      const slotEvaluations = PLAN.evaluations.filter(
        (evaluation) => evaluation.slotId === slot.slotId,
      );
      expect(slotEvaluations).toHaveLength(12);
      expect(slotEvaluations.map((evaluation) => evaluation.logicalBatchOrdinal)).toEqual(
        Array.from({ length: 12 }, (_, index) => index + 1),
      );
      const goldIds = new Set(slotEvaluations.flatMap((evaluation) => evaluation.orderedGoldIds));
      expect(goldIds.size).toBe(49);
    }
  });

  it("every V4 slot copies F0I's plan verbatim; every V5 slot copies F0O's plan verbatim (same assemblyInputSha256/finalInputSha256 per ordinal)", () => {
    for (const slot of F0V_SLOTS) {
      const sourcePlan = slot.variantName === 'PROMPT_V4_CANONICAL' ? F0I_PLAN : F0O_PLAN;
      const slotEvaluations = PLAN.evaluations.filter(
        (evaluation) => evaluation.slotId === slot.slotId,
      );
      for (const [index, evaluation] of slotEvaluations.entries()) {
        const source = sourcePlan.evaluations[index]!;
        expect(evaluation.assemblyInputSha256).toBe(source.assemblyInputSha256);
        expect(evaluation.finalInputSha256).toBe(source.finalInputSha256);
        expect(evaluation.organisationId).toBe(source.organisationId);
        expect(evaluation.echeRowKey).toBe(source.echeRowKey);
        expect(canonicalStringify(evaluation.callCeiling)).toBe(
          canonicalStringify(source.callCeiling),
        );
      }
    }
  });
});

describe('2D2C-F0V: ceilings are re-derived by summation, never hardcoded', () => {
  it('per-run ceiling is identical for V4 and V5: 61 provider requests, 183 adapter attempts', () => {
    expect(F0I_PLAN.callCeilingTotals.maxProviderRequests).toBe(61);
    expect(F0I_PLAN.callCeilingTotals.maxAdapterAttempts).toBe(183);
    expect(F0O_PLAN.callCeilingTotals.maxProviderRequests).toBe(61);
    expect(F0O_PLAN.callCeilingTotals.maxAdapterAttempts).toBe(183);
  });

  it('full-study ceiling derives to 610 provider requests / 1830 adapter attempts, by summing 10 slots', () => {
    const ceilings = deriveStudyCeilings(F0I_PLAN.callCeilingTotals, F0O_PLAN.callCeilingTotals);
    expect(ceilings).toEqual({
      perRunMaxProviderRequests: 61,
      perRunMaxAdapterAttempts: 183,
      totalSlots: 10,
      fullStudyMaxProviderRequests: 610,
      fullStudyMaxAdapterAttempts: 1830,
    });
    expect(F0V.freeze.fullStudyCeilings).toMatchObject({
      totalSlots: 10,
      totalLogicalEvaluations: 120,
      maxProviderRequests: 610,
      maxAdapterAttempts: 1830,
    });
  });

  it('refuses to derive a full-study ceiling from disagreeing per-run totals - proving the sum is genuine, not a bare literal', () => {
    const inflatedV5 = { ...F0O_PLAN.callCeilingTotals, maxProviderRequests: 999 };
    expect(() => deriveStudyCeilings(F0I_PLAN.callCeilingTotals, inflatedV5)).toThrow(
      StudyPlanError,
    );
  });

  it('a manually-halved per-slot sum would NOT equal 610/1830 - the full-study figure genuinely depends on all 10 slots', () => {
    const fiveSlots = F0V_SLOTS.slice(0, 5);
    const ceilings = deriveStudyCeilings(
      F0I_PLAN.callCeilingTotals,
      F0O_PLAN.callCeilingTotals,
      fiveSlots,
    );
    expect(ceilings.fullStudyMaxProviderRequests).toBe(305);
    expect(ceilings.fullStudyMaxAdapterAttempts).toBe(915);
  });
});

describe('2D2C-F0V: future output roots are named, distinct, and never created', () => {
  it('all 10 future output-root names are distinct', () => {
    expect(futureOutputRootsAreDistinct(F0V_SLOTS)).toBe(true);
  });

  it('matches the exact freeze-pinned slot list and study root', () => {
    expect(F0V.freeze.slots).toEqual(
      F0V_SLOTS.map((slot) => ({
        sequence: slot.sequence,
        slotId: slot.slotId,
        pairNumber: slot.pairNumber,
        variantName: slot.variantName,
        futureOutputRootName: slot.futureOutputRootName,
      })),
    );
    expect(F0V.freeze.studyRoot).toBe(F0V_STUDY_ROOT);
  });
});

describe('2D2C-F0V: identities independently reverified against production constants', () => {
  it('V4/V5 runtime commits match freezeF0O.ts exactly', () => {
    expect(F0V.freeze.identities.v4.runtimeCommit).toBe(V4_RUNTIME_COMMIT);
    expect(F0V.freeze.identities.v5.runtimeCommit).toBe(V5_RUNTIME_COMMIT);
  });

  it('V4/V5 prompt SHA-256 values match the owner-quoted hashes exactly', () => {
    expect(F0V.freeze.identities.v4.promptSha256).toBe(
      'a2dad6e85102ee710d4eb1c5ca4ea3995273b3e25834d27a83f36ad6b65a256b',
    );
    expect(F0V.freeze.identities.v5.promptSha256).toBe(
      '4c7352812740ca2df518b5274d18aae2f7f695d05ab0f60fcf72c000db8f01c9',
    );
  });

  it('V4/V5 historical plan SHA-256 values match the owner-quoted "historical plan identity" hashes, and F0I/F0O\'s own pinned plan hashes', () => {
    expect(F0V.freeze.identities.v4.historicalPlanSha256).toBe(
      '3829955f64b9bdddb51ba7b5389363b0fa36c0449628206914f608f9f1830a2b',
    );
    expect(F0V.freeze.identities.v5.historicalPlanSha256).toBe(
      '292d9424d487f3d69903a3b81172bd0a90c65adbd7ee6fa63cf3a9d0ced79898',
    );
  });

  it("the pinned requestedModelId matches F0I's and F0O's own already-loaded, already-verified freeze value exactly (never a source-code literal, phase1a.firewall.test.ts)", () => {
    expect(F0V.freeze.perRunPolicy.requestedModelId).toBe(F0I.freeze.classifier.requestedModelId);
    expect(F0V.freeze.perRunPolicy.requestedModelId).toBe(F0O.freeze.classifier.requestedModelId);
  });
});

describe('2D2C-F0V: MUTATION - refused', () => {
  it('a changed byte is refused', () => {
    const mutated = Buffer.concat([F0V_BYTES.subarray(0, F0V_BYTES.length - 2), Buffer.from('} ')]);
    expect(() => loadF0VFreezeFromBytes(mutated)).toThrow(F0VFreezeError);
  });

  it('a freeze whose slots are reordered is refused by production agreement', () => {
    const mutated = clone(F0V.freeze);
    const swapped = [mutated.slots[1], mutated.slots[0], ...mutated.slots.slice(2)];
    expect(() =>
      assertF0VFreezeAgreesWithProduction({ ...mutated, slots: swapped as typeof mutated.slots }),
    ).toThrow(F0VFreezeError);
  });

  it('a freeze naming a wrong V4 runtime commit is refused', () => {
    const mutated = clone(F0V.freeze);
    mutated.identities.v4.runtimeCommit = '0000000000000000000000000000000000000f';
    expect(() => assertF0VFreezeAgreesWithProduction(mutated)).toThrow(F0VFreezeError);
  });

  it('a freeze naming a wrong V5 historical plan SHA-256 is refused', () => {
    const mutated = clone(F0V.freeze);
    mutated.identities.v5.historicalPlanSha256 =
      '0000000000000000000000000000000000000000000000000000000000000';
    expect(() => assertF0VFreezeAgreesWithProduction(mutated)).toThrow(F0VFreezeError);
  });

  it('a study-plan attempt with 11 or 13 evaluations in a source plan is refused', () => {
    const short = { ...F0I_PLAN, evaluations: F0I_PLAN.evaluations.slice(0, 11) };
    expect(() => buildReplicationStudyPlan(short, F0O_PLAN)).toThrow(StudyPlanError);
  });
});

describe('2D2C-F0V: gold-blind, HOLDOUT-forbidden, no adaptive stopping', () => {
  it('names the four HOLDOUT-forbidden files and forbids opening any of them', () => {
    expect(F0V.freeze.holdout.forbiddenFiles).toEqual([
      'src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-v1.jsonl',
      'src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-adjudication-v1.jsonl',
      'src/test/fixtures/evaluation/orgunit-classifier-gold-v1.jsonl',
      'src/test/fixtures/evaluation/orgunit-classifier-adjudication-v1.jsonl',
    ]);
    expect(F0V.freeze.holdout.forbidden).toBe(true);
    expect(F0V.freeze.corpus.noneOpenedByF0V).toBe(true);
  });

  it('this test file and the f0v harness never reference any HOLDOUT-forbidden file path', () => {
    const dir = resolve(ROOT, 'src/test/harness/phase2b2d2c/f0v');
    for (const file of readdirSync(dir)) {
      const content = readFileSync(join(dir, file), 'utf8');
      expect(content).not.toMatch(/orgunit-classifier-sonnet-acceptance-v1\.jsonl/);
      expect(content).not.toMatch(/orgunit-classifier-sonnet-acceptance-adjudication-v1\.jsonl/);
      expect(content).not.toMatch(/orgunit-classifier-gold-v1\.jsonl/);
      expect(content).not.toMatch(/orgunit-classifier-adjudication-v1\.jsonl/);
    }
  });

  it('the freeze fixes N, slot count, slot order and prompt order before any inference, and states the rule explicitly', () => {
    expect(F0V.freeze.noAdaptiveStopping).toMatchObject({
      nFrozenBeforeInference: true,
      slotCountFixedAt: 10,
      slotOrderFixed: true,
    });
  });

  it('the inclusion rule names exactly the three predeclared failure classes A/B/C', () => {
    expect(F0V.freeze.inclusionRule.classA.id).toBe('FAILURE_BEFORE_AUTHORISATION_CONSUMPTION');
    expect(F0V.freeze.inclusionRule.classB.id).toBe(
      'AUTHORISATION_CONSUMED_CONFIRMED_PRE_INFERENCE_REFUSAL',
    );
    expect(F0V.freeze.inclusionRule.classC.id).toBe(
      'PROVIDER_REQUEST_OR_SEMANTIC_EXECUTION_OBSERVED',
    );
  });

  it('creates zero execution-authorisation candidates', () => {
    expect(F0V.freeze.futureAuthorisationModel.candidatesCreatedByThisFile).toBe(0);
    expect(F0V.freeze.futureAuthorisationModel.candidatesCreatedByF0VTask).toBe(0);
  });
});

describe('2D2C-F0V: the F0U analysis contract is pinned as diagnostic only, never a new HOLDOUT gate', () => {
  it('pins the six frozen DEV gates and the five interpretation labels exactly', () => {
    expect(F0V.freeze.analysisContract.sixFrozenDevGates).toEqual({
      minSchemaValidSpanVerifiedRate: 0.99,
      minUnitPageRecall: 0.95,
      minUnitPagePrecision: 0.9,
      minUnitTypeAccuracy: 0.85,
      minHardNegativeRejection: 0.9,
      maxNeedsReviewRate: 0.15,
    });
    expect(F0V.freeze.analysisContract.interpretationLabels).toEqual([
      'STABLE_WITHIN_PROMPT',
      'UNSTABLE_WITHIN_PROMPT',
      'V5_REPRODUCIBLY_BETTER',
      'V5_REPRODUCIBLY_WORSE',
      'NO_CLEAR_PROMPT_EFFECT',
    ]);
  });

  it('states explicitly that the labels are diagnostic only and never retroactively alter the historical, already-frozen gate outcomes', () => {
    expect(F0V.freeze.analysisContract.labelsAreDiagnosticReportingOnly).toBe(true);
    expect(F0V.freeze.analysisContract.labelsDoNotReplaceOrCreateAHoldoutAcceptanceGate).toBe(true);
    expect(F0V.freeze.analysisContract.doesNotRetroactivelyAlterHistoricalGateOutcomes).toBe(true);
    expect(F0V.freeze.analysisContract.historicalV4GateOutcomeFrozen).toBe(
      'FROZEN_GATES_FAILED_ON_DEV',
    );
    expect(F0V.freeze.analysisContract.historicalV5GateOutcomeFrozen).toBe(
      'FROZEN_GATES_FAILED_ON_DEV',
    );
  });
});
