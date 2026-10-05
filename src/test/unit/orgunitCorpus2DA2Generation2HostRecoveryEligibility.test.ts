/**
 * Phase 2B-2D A2 Generation 2: targeted-host-recovery ELIGIBILITY (E1-E14),
 * the owner's UQ1-UQ5 resolutions as code, the UQ4 operator-kit pre-live
 * blocker, and the static genericity of the recovery namespace.
 *
 *   - the approved amendment is pinned to its exact committed bytes, and it
 *     binds the exact proposal, design and freeze bytes;
 *   - E1-E14 each refuse with their own code, from synthetic records sealed
 *     after tampering; positive cases hold;
 *   - over the REAL committed records, the generic reader finds exactly the
 *     incident the owner ruling describes eligible, and the clean item not;
 *   - UQ5: an invocation is spent on CLI-execute issuance OR run creation;
 *   - no generic recovery file names a window, slot, work item or run.
 *
 * Reads committed bytes by `git show` at pinned commits; opens no socket and
 * no database; writes nothing.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  GENERATION2_LEDGER_PATH,
  Generation2OperationalRefusal,
} from '../harness/phase2b2d/generation2Acquisition/operationalContract.js';
import {
  parseOperationalGeneration2Ledger,
  type OperationalGeneration2Ledger,
} from '../harness/phase2b2d/generation2Acquisition/operationalLedger.js';
import {
  assessCommittedInputs,
  type Generation2OperationalBasis,
} from '../harness/phase2b2d/generation2Acquisition/state.js';
import { buildGeneration2WindowSpec } from '../harness/phase2b2d/generation2Acquisition/windowSpec.js';
import {
  replayGeneration2History,
  validateGeneration2LiveResultForHistory,
  type CommittedRecordBinding,
  type Generation2AdjudicationHistory,
} from '../harness/phase2b2d/generation2History/adjudicationHistory.js';
import {
  APPROVED_HOST_RECOVERY_AMENDMENT,
  APPROVED_HOST_RECOVERY_AMENDMENT_BINDS,
  AUTOMATIC_REPLACEMENT_RECOVERY_INVOCATION,
  HOST_RECOVERY_CHAIN_REFUSALS,
  HOST_RECOVERY_CONTROL_NAMES_V1,
  HOST_RECOVERY_ELIGIBILITY_CONDITIONS,
  HOST_RECOVERY_LIMITS,
  HOST_RECOVERY_OWNER_RESOLUTIONS,
  HOST_RECOVERY_PRECONDITION_PARAMETERS,
  HOST_RECOVERY_RECORD_KINDS,
  OPERATOR_KIT_REPAIR_REQUIRED_PROOFS,
  RECOVERY_GATE_READOUT_RULE,
  RECOVERY_INVOCATION_DISPOSITIONS,
} from '../harness/phase2b2d/generation2Recovery/hostRecoveryContract.js';
import {
  evaluateHostRecoveryEligibility,
  isApprovedHostRecoveryAmendment,
  type HostRecoveryEligibilityInput,
  type PinnedCommittedRecord,
} from '../harness/phase2b2d/generation2Recovery/hostRecoveryEligibility.js';
import {
  recoveryInvocationDisposition,
  validateOperatorKitHostSemanticsRepair,
  validateTargetedHostRecovery,
  type TargetedHostRecoveryContext,
} from '../harness/phase2b2d/generation2Recovery/hostRecoveryProvenance.js';
import {
  synthesiseHostRecoveredWindow,
  type HostRecoveryTamper,
  type SynthesisedHostRecovery,
} from '../harness/phase2b2d/generation2Recovery/synthesiseHostRecovery.js';
import { readWindow13Inputs } from '../harness/phase2b2d/generation2Window13/materialiseWindow13Readiness.js';
import { twelveWindowHistoryForWindow13 } from '../harness/phase2b2d/generation2Window13/window13Readiness.js';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const REPO = resolve(import.meta.dirname, '../../..');
const RECOVERY_DIR = 'src/test/harness/phase2b2d/generation2Recovery';
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const bytesOf = (text: string): number => Buffer.byteLength(text, 'utf8');
const show = (commit: string, path: string): string =>
  execFileSync('git', ['-C', REPO, 'show', `${commit}:${path}`], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
const pinned = (path: string, commit: string): PinnedCommittedRecord => {
  const text = show(commit, path);
  return { path, commit, sha256: sha256(text), text };
};
function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof Generation2OperationalRefusal) return error.code;
    throw error;
  }
  return 'NO_REFUSAL';
}

const CODE_TREE = { srcOrgunits: 'a'.repeat(40), srcCli: 'b'.repeat(40) };
const LEDGER_21_COMMIT = 'ac19cb8ca4538237be49e03e0c19ce46cf6f4ecb';
const RULING = {
  path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_13_HOST_INTEGRITY_OWNER_RULING_V1.json',
  commit: '1baeaa4380c28e16646f7d4164eb6418ed835d59',
};
const W13 = 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_13_';
const W13_AUTHORITY = {
  path: `${W13}LIVE_AUTHORITY_V1.json`,
  commit: '0b9a7dabe5e720b18fcb41830fb687787b47b93f',
};
const W13_LIVE = {
  path: `${W13}LIVE_RESULT_V1.json`,
  commit: 'bf15fe3b9e16ffbe0a075d4464f7363a2c88b008',
};

let basis: Generation2OperationalBasis;
let twelve: Generation2AdjudicationHistory;
let ledger19Text: string;
let ledger21Text: string;
let ledger21: OperationalGeneration2Ledger;
let amendment: PinnedCommittedRecord;
let priorIds: string[];
let priorRefs: string[];

const parse = (text: string) =>
  parseOperationalGeneration2Ledger(JSON.parse(text) as unknown, basis.genesis);

beforeAll(() => {
  const inputs = readWindow13Inputs(REPO);
  basis = assessCommittedInputs(
    inputs.window12Inputs.window11Inputs.window10Inputs.window09Inputs.window08Inputs.committed,
  ).basis!;
  twelve = twelveWindowHistoryForWindow13(inputs);
  ledger19Text = inputs.currentLedgerText;
  ledger21Text = show(LEDGER_21_COMMIT, GENERATION2_LEDGER_PATH);
  ledger21 = parse(ledger21Text);
  amendment = pinned(
    APPROVED_HOST_RECOVERY_AMENDMENT.path,
    APPROVED_HOST_RECOVERY_AMENDMENT.commit,
  );
  const replay = replayGeneration2History(basis, ledger21, twelve);
  priorIds = replay.windows.flatMap((w) => w.executed.map((e) => e.workItemId));
  priorRefs = replay.windows.flatMap((w) => w.executed.map((e) => e.runRefSha256));
}, 300_000);

/** A synthetic recovered thirteenth window over the real twelve-window history. */
function synthetic(tamper: HostRecoveryTamper = {}, seed = 'eligibility'): SynthesisedHostRecovery {
  const spec = buildGeneration2WindowSpec({
    basis,
    startingLedger: parse(ledger19Text),
    startingLedgerFile: { sha256: sha256(ledger19Text), bytes: bytesOf(ledger19Text) },
    plannedWindowSize: 2,
    history: twelve,
  });
  const slot = spec.workItems.at(-1)!.selectionIndex;
  return synthesiseHostRecoveredWindow({
    basis,
    priorHistory: twelve,
    startingLedgerText: ledger19Text,
    prospectiveLedgerText: ledger21Text,
    spec,
    verdicts: {},
    recoveredSelectionIndex: slot,
    runRefSeed: seed,
    approvedAmendment: amendment,
    codeTree: CODE_TREE,
    tamper,
  });
}
const validatedItemsOf = (authority: CommittedRecordBinding, live: CommittedRecordBinding) => {
  const a = JSON.parse(authority.text) as Json;
  return validateGeneration2LiveResultForHistory(live, {
    windowOrdinal: a.windowOrdinal,
    authority,
    windowSpecHash: a.boundWindowSpec.windowSpecHash,
    authorisedWorkItems: a.authorisedWorkItems,
    exactOrder: a.exactOrder,
    ledgerHash: ledger21.ledgerHash,
    ledgerEntryCount: ledger21.entries.length,
  });
};
function inputOf(
  syn: SynthesisedHostRecovery,
  over: Partial<HostRecoveryEligibilityInput> = {},
): HostRecoveryEligibilityInput {
  const items = validatedItemsOf(syn.window.authority, syn.window.liveResult);
  return {
    target: {
      windowOrdinal: syn.target.windowOrdinal,
      workItemId: syn.target.workItemId,
      originalRunRefSha256: syn.target.originalRunRefSha256,
    },
    window: {
      windowOrdinal: syn.target.windowOrdinal,
      authority: syn.window.authority,
      liveResult: syn.window.liveResult,
      validatedLiveItems: items,
      isOpenLastWindow: true,
    },
    priorAdjudicatedWorkItemIds: priorIds,
    ordinaryRunRefs: [...priorRefs, ...items.map((i) => i.runRefSha256 as string)],
    ledgerEntries: syn.ledger.entries,
    incidentRuling: syn.recovery.incidentRuling,
    approvedAmendment: syn.recovery.approvedAmendment,
    recordedIntegrityVerdicts: [],
    existingRecoveryIncidents: [],
    ...over,
  };
}
const codesOf = (input: HostRecoveryEligibilityInput): string[] =>
  evaluateHostRecoveryEligibility(input).refusals.map((r) => r.code);
const E = Object.fromEntries(HOST_RECOVERY_ELIGIBILITY_CONDITIONS) as Record<string, string>;

// ---------------------------------------------------------------------------
// The approved amendment and the owner's resolutions.
// ---------------------------------------------------------------------------

describe('the approved amendment is the governance anchor, by exact bytes', () => {
  it('pins the committed owner approval exactly, and it approves Design A with UQ1-UQ5', () => {
    expect([amendment.sha256, bytesOf(amendment.text)]).toEqual([
      APPROVED_HOST_RECOVERY_AMENDMENT.sha256,
      APPROVED_HOST_RECOVERY_AMENDMENT.bytes,
    ]);
    expect(isApprovedHostRecoveryAmendment(amendment)).toBe(true);
    const record = JSON.parse(amendment.text) as Json;
    expect(record).toMatchObject({
      recordKind: 'METHODOLOGY_AMENDMENT_OWNER_APPROVAL',
      isLiveAuthority: false,
      methodologyAmendmentApproved: true,
      approvedDesign: 'A',
    });
    expect(record.thisFileAuthorises).toHaveLength(2);
    for (const [uq, token] of Object.entries(HOST_RECOVERY_OWNER_RESOLUTIONS)) {
      expect(record.unresolvedQuestionResolutions[uq].decision, uq).toBe(token);
    }
    for (const key of [
      'recoveryPreconditionMeasurement',
      'institutionNetwork',
      'recoveryLiveAuthority',
      'window13Adjudication',
      'ledgerMutation',
      'reserve21Assignment',
      'window14',
      'operatorKitRepair',
    ]) {
      expect(record.doesNotAuthorise[key], key).toBe(true);
    }
  });

  it('binds the exact proposal, design and freeze bytes, which re-hash at their commits', () => {
    for (const [key, ref] of Object.entries(APPROVED_HOST_RECOVERY_AMENDMENT_BINDS)) {
      const text = show(ref.commit, ref.path);
      expect([sha256(text), bytesOf(text)], key).toEqual([ref.sha256, ref.bytes]);
    }
    const proposal = JSON.parse(
      show(
        APPROVED_HOST_RECOVERY_AMENDMENT_BINDS.amendmentProposal.commit,
        APPROVED_HOST_RECOVERY_AMENDMENT_BINDS.amendmentProposal.path,
      ),
    ) as Json;
    expect(proposal.methodologyAmendmentApproved).toBe(false);
    expect(proposal.thisFileAuthorises).toEqual([]);
    expect(Object.keys(proposal.clauses)).toHaveLength(10);
    expect(
      proposal.clauses['V3-H1_eligibility'].conditions.map((c: Json) => [c.id, c.refusal]),
    ).toEqual(HOST_RECOVERY_ELIGIBILITY_CONDITIONS.map(([id, code]) => [id, code]));
  });

  it('refuses an amendment at another commit, with other bytes, or absent', () => {
    expect(isApprovedHostRecoveryAmendment(null)).toBe(false);
    expect(isApprovedHostRecoveryAmendment({ ...amendment, commit: '0'.repeat(40) })).toBe(false);
    const text = amendment.text.replace('"approvedDesign": "A"', '"approvedDesign": "B"');
    expect(isApprovedHostRecoveryAmendment({ ...amendment, text, sha256: sha256(text) })).toBe(
      false,
    );
  });

  it('UQ2: 6 GREEN probes over >= 10 minutes, 60-minute validity, fixed control names', () => {
    expect(HOST_RECOVERY_PRECONDITION_PARAMETERS).toMatchObject({
      minimumProbes: 6,
      minimumSpanMinutes: 10,
      validityMinutes: 60,
      everyProbeGreen: true,
      ownerDecision: HOST_RECOVERY_OWNER_RESOLUTIONS.UQ2,
    });
    expect(HOST_RECOVERY_CONTROL_NAMES_V1.length).toBeGreaterThan(0);
  });

  it('V3-H2/H5 ceilings and UQ1 readout rule are exact', () => {
    expect(HOST_RECOVERY_LIMITS).toEqual({
      maximumLiveInvocations: 1,
      maximumLiveInvocationsPerTarget: 1,
      retries: 0,
      concurrency: 1,
      otherSelectionIndices: [],
      windowContinuation: false,
    });
    expect(RECOVERY_GATE_READOUT_RULE).toEqual({
      recordedOnly: true,
      isRecoveryWindowPauseSystem: false,
      appliedToOriginalWindow: false,
      joinsOriginalWindowDenominator: false,
    });
    // One code per condition, no code shared between eligibility and the chain.
    const codes = HOST_RECOVERY_ELIGIBILITY_CONDITIONS.map(([, code]) => code);
    expect(new Set(codes).size).toBe(14);
    expect(
      codes.filter((c) => (HOST_RECOVERY_CHAIN_REFUSALS as readonly string[]).includes(c)),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// E1-E14.
// ---------------------------------------------------------------------------

describe('eligibility E1-E14: all required, one refusal per failed condition', () => {
  it('a synthetic host-confounded item with a full ruling is eligible, and its target is fixed', () => {
    const syn = synthetic();
    const result = evaluateHostRecoveryEligibility(inputOf(syn));
    expect(result.refusals).toEqual([]);
    expect(result.eligible).toBe(true);
    expect(result.fixedTarget).toEqual(syn.target);
    expect(result.defectClass).toBe('RESOLVER_VANTAGE');
  });

  const single: [string, () => HostRecoveryEligibilityInput, string][] = [
    [
      'E1 the authority is not an ordinary window authority',
      () =>
        inputOf(
          synthetic({
            authority: (j) => void (j.recordKind = HOST_RECOVERY_RECORD_KINDS.authority),
          }),
        ),
      E.E1!,
    ],
    [
      'E2 the original is not one clean completed run',
      () => {
        const input = inputOf(synthetic());
        const items = input.window.validatedLiveItems!.map((i) =>
          i.workItemId === input.target.workItemId ? { ...i, runTerminalState: 'FAILED' } : i,
        );
        return { ...input, window: { ...input.window, validatedLiveItems: items } };
      },
      E.E2!,
    ],
    [
      'E3 the ordinary invocation right is not exhausted',
      () => {
        const syn = synthetic({ authority: (j) => void (j.maximumLiveInvocationsPerWorkItem = 2) });
        return inputOf(syn, {
          window: {
            ...inputOf(syn).window,
            validatedLiveItems: JSON.parse(syn.window.liveResult.text).items,
          },
        });
      },
      E.E3!,
    ],
    [
      'E4 the original reference is not unique in history',
      () => {
        const input = inputOf(synthetic());
        return {
          ...input,
          ordinaryRunRefs: [...input.ordinaryRunRefs, input.target.originalRunRefSha256],
        };
      },
      E.E4!,
    ],
    [
      'E5 the ruling names no host-integrity stop for the item',
      () =>
        inputOf(
          synthetic({ incidentRuling: (j) => void (j.hostIntegrityStop.affectedItems = []) }),
        ),
      E.E5!,
    ],
    [
      'E5 the ruling classification is not host-confounded',
      () =>
        inputOf(
          synthetic({
            incidentRuling: (j) =>
              void (j.executedItems.item1.D_causalAttribution.classification =
                'INSTITUTION_DNS_FAILURE'),
          }),
        ),
      E.E5!,
    ],
    [
      'E5 the ruling waived a frozen pause',
      () => inputOf(synthetic({ incidentRuling: (j) => void (j.p5.waived = true) })),
      E.E5!,
    ],
    [
      'E6 no observed RED host/vantage check',
      () =>
        inputOf(
          synthetic({
            incidentRuling: (j) =>
              void (j.executedItems.item1.C_hostIntegrity.postItemHostCheck = 'GREEN'),
          }),
        ),
      E.E6!,
    ],
    [
      'E6 a failing component the authority never made a precondition',
      () => inputOf(synthetic({ authority: (j) => void (j.hostSafety = { batteryFloor: 20 }) })),
      E.E6!,
    ],
    [
      'E7 no causal channel from a resolver failure to a connect timeout',
      () =>
        inputOf(
          synthetic({
            incidentRuling: (j) =>
              void (j.executedItems.item1.A_observedAcquisitionResult.errorKind =
                'CONNECT_TIMEOUT'),
          }),
        ),
      E.E7!,
    ],
    [
      'E7 no host-side causal points',
      () =>
        inputOf(
          synthetic({
            incidentRuling: (j) =>
              void (j.executedItems.item1.D_causalAttribution.pointsTowardHostLocalResolver = []),
          }),
        ),
      E.E7!,
    ],
    [
      'E8 outcome-only grounds: the execution record shows no host failure',
      () =>
        inputOf(
          synthetic({
            liveResult: (j) => {
              for (const item of j.items as Json[]) item.hostAndVantage.postItem = true;
            },
          }),
        ),
      E.E8!,
    ],
    [
      'E9 a CLEAN item can never be recovered',
      () => inputOf(synthetic(), { recordedIntegrityVerdicts: ['CLEAN'] }),
      E.E9!,
    ],
    [
      'E10 the occupant was superseded by a later ledger entry',
      () => {
        const input = inputOf(synthetic());
        const slot = input.window.validatedLiveItems!.find(
          (i) => i.workItemId === input.target.workItemId,
        )!.selectionIndex as number;
        return {
          ...input,
          ledgerEntries: [
            ...input.ledgerEntries,
            {
              sequence: input.ledgerEntries.length,
              selectionIndex: slot,
              generation2ReserveRankPosition: 999,
            },
          ],
        };
      },
      E.E10!,
    ],
    [
      'E11 the window is not the open last window',
      () =>
        inputOf(synthetic(), {
          window: { ...inputOf(synthetic()).window, isOpenLastWindow: false },
        }),
      E.E11!,
    ],
    [
      'E11 the item was already adjudicated',
      () => {
        const input = inputOf(synthetic());
        return {
          ...input,
          priorAdjudicatedWorkItemIds: [
            ...input.priorAdjudicatedWorkItemIds,
            input.target.workItemId,
          ],
        };
      },
      E.E11!,
    ],
    [
      'E12 a recovery already exists for the incident',
      () => {
        const input = inputOf(synthetic());
        return { ...input, existingRecoveryIncidents: [input.target] };
      },
      E.E12!,
    ],
    ['E13 no approved amendment', () => inputOf(synthetic(), { approvedAmendment: null }), E.E13!],
    [
      'E13 an amendment with the wrong hash',
      () => inputOf(synthetic(), { approvedAmendment: { ...amendment, sha256: 'f'.repeat(64) } }),
      E.E13!,
    ],
    [
      'E14 a declared target with another fetch policy',
      () => {
        const syn = synthetic();
        return inputOf(syn, { declaredTarget: { ...syn.target, fetchPolicyVersion: 'other' } });
      },
      E.E14!,
    ],
    [
      'E14 a declared target with another rules version',
      () => {
        const syn = synthetic();
        return inputOf(syn, { declaredTarget: { ...syn.target, ruleVersion: 'other' } });
      },
      E.E14!,
    ],
    [
      'E14 a declared target with an extra (widened) field',
      () => {
        const syn = synthetic();
        return inputOf(syn, { declaredTarget: { ...syn.target, alternateRoot: true } });
      },
      E.E14!,
    ],
    [
      'E14 a digest that is not the re-derived one',
      () => inputOf(synthetic(), { rederivedIdentityDigest: '9'.repeat(64) }),
      E.E14!,
    ],
    [
      'E14 an execution that ran another policy than the authority required',
      () => {
        const syn = synthetic({
          liveResult: (j) => {
            for (const item of j.items as Json[]) item.fetchPolicyVersion = 'other';
          },
        });
        return inputOf(syn);
      },
      E.E14!,
    ],
  ];

  it.each(single)('%s', (_name, build, code) => {
    expect(codesOf(build())).toEqual([code]);
  });

  it('a missing ruling, a wrong run and a wrong identity are refused (E5 among them)', () => {
    const syn = synthetic();
    expect(codesOf(inputOf(syn, { incidentRuling: null }))).toContain(E.E5);
    const wrongRun = inputOf(syn);
    const refused = codesOf({
      ...wrongRun,
      target: { ...wrongRun.target, originalRunRefSha256: '7'.repeat(64) },
    });
    expect(refused).toEqual(expect.arrayContaining([E.E4, E.E5]));
    const live = JSON.parse(syn.window.liveResult.text) as Json;
    const other = (live.items as Json[]).find((i) => i.workItemId !== syn.target.workItemId)!;
    expect(
      codesOf({
        ...wrongRun,
        target: {
          ...wrongRun.target,
          workItemId: other.workItemId,
          originalRunRefSha256: other.runRefSha256,
        },
      }),
    ).toEqual(expect.arrayContaining([E.E5, E.E6, E.E7, E.E8]));
  });

  it('eligibility never reads a recovery result or yield: changing them changes nothing', () => {
    const base = evaluateHostRecoveryEligibility(inputOf(synthetic()));
    const other = evaluateHostRecoveryEligibility(
      inputOf(
        synthetic({
          recoveryResult: (j) => {
            j.mechanical.sd9StatusMechanical = 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET';
            j.integrityVerdict = 'MONITOR_COVERAGE_INSUFFICIENT';
          },
        }),
      ),
    );
    expect(other).toEqual(base);
  });
});

// ---------------------------------------------------------------------------
// The real committed records.
// ---------------------------------------------------------------------------

describe('over the REAL committed records the generic reader agrees with the owner ruling', () => {
  const realInput = (index: 0 | 1): HostRecoveryEligibilityInput => {
    const authority = pinned(W13_AUTHORITY.path, W13_AUTHORITY.commit);
    const live = pinned(W13_LIVE.path, W13_LIVE.commit);
    const items = validatedItemsOf(authority, live);
    const item = items[index]!;
    return {
      target: {
        windowOrdinal: 13,
        workItemId: item.workItemId as string,
        originalRunRefSha256: item.runRefSha256 as string,
      },
      window: {
        windowOrdinal: 13,
        authority,
        liveResult: live,
        validatedLiveItems: items,
        isOpenLastWindow: true,
      },
      priorAdjudicatedWorkItemIds: priorIds,
      ordinaryRunRefs: [...priorRefs, ...items.map((i) => i.runRefSha256 as string)],
      ledgerEntries: ledger21.entries,
      incidentRuling: pinned(RULING.path, RULING.commit),
      approvedAmendment: amendment,
      recordedIntegrityVerdicts: [],
      existingRecoveryIncidents: [],
    };
  };

  it('the host-confounded item satisfies E1-E14 (eligibility only: no precondition, no authority)', () => {
    const result = evaluateHostRecoveryEligibility(realInput(1));
    expect(result.refusals).toEqual([]);
    expect(result.fixedTarget).toMatchObject({
      workItemId: 'G2R:109:20',
      selectionIndex: 109,
      generation2ReserveRankPosition: 20,
      split: 'FINAL_HOLDOUT',
      identityDigest: '927eb875b4c77347bb15a8181fabb93a3d379558f8d935b08468d86e0318dc33',
      originalRunRefSha256: '5bf76c8d6d158fd4d5deec70797af68002a11dc66917c2c6f30642932246fe7f',
      fetchPolicyVersion: 'orgunit-fetch-policy-v7',
      ruleVersion: 'orgunit-signal-rules-v1',
      rootAuthorityCount: 1,
    });
  });

  it('the clean item is not eligible', () => {
    const result = evaluateHostRecoveryEligibility(realInput(0));
    expect(result.eligible).toBe(false);
    expect(result.refusals.map((r) => r.id)).toEqual(['E5', 'E6', 'E7', 'E8', 'E9']);
  });
});

// ---------------------------------------------------------------------------
// UQ5 and the T-0 abort.
// ---------------------------------------------------------------------------

describe('UQ5: the one invocation is spent on CLI-execute issuance or run creation', () => {
  it('only "nothing issued AND no run" leaves it unspent; nothing is ever replaced automatically', () => {
    const d = (cliExecuteIssued: boolean, runCreated: boolean) =>
      recoveryInvocationDisposition({ cliExecuteIssued, runCreated });
    expect(d(false, false)).toBe(RECOVERY_INVOCATION_DISPOSITIONS.unspent);
    expect(d(true, false)).toBe(RECOVERY_INVOCATION_DISPOSITIONS.consumed);
    expect(d(false, true)).toBe(RECOVERY_INVOCATION_DISPOSITIONS.consumed);
    expect(d(true, true)).toBe(RECOVERY_INVOCATION_DISPOSITIONS.consumed);
    expect(AUTOMATIC_REPLACEMENT_RECOVERY_INVOCATION).toBe(false);
  });

  const contextOf = (syn: SynthesisedHostRecovery): TargetedHostRecoveryContext => {
    const input = inputOf(syn);
    return {
      windowOrdinal: input.window.windowOrdinal,
      authority: syn.window.authority,
      liveResult: syn.window.liveResult,
      validatedLiveItems: input.window.validatedLiveItems!,
      incident: input.target,
      ledgerEntries: syn.ledger.entries,
      ledgerDuringWindow: {
        entryCount: syn.ledger.entries.length,
        ledgerHash: syn.ledger.ledgerHash,
      },
      priorAdjudicatedWorkItemIds: priorIds,
      ordinaryRunRefs: input.ordinaryRunRefs,
      priorRecoveryRunRefs: [],
      priorRecoveryIncidents: [],
    };
  };
  const t0Failed = (issued: boolean, created: boolean) => (j: Json) => {
    j.hostAndVantage.t0.verdict = 'RED';
    j.hostAndVantage.t0.systemResolverFunctioning = false;
    j.invocation = {
      cliExecuteIssued: issued,
      runCreated: created,
      disposition: recoveryInvocationDisposition({ cliExecuteIssued: issued, runCreated: created }),
      automaticReplacementInvocation: false,
    };
    j.integrityVerdict = 'PRECONDITION_NOT_HELD_AT_EXECUTION';
    if (!issued && !created) {
      j.cliExecuteInvocations = 0;
      j.runsForTarget = 0;
      j.recoveryRunRefSha256 = null;
    }
  };

  it('a T-0 failure before any execute and any run: PRECONDITION_NOT_HELD_AT_EXECUTION, invocation UNSPENT', () => {
    const syn = synthetic({ recoveryResult: t0Failed(false, false) });
    const v = validateTargetedHostRecovery(syn.recovery, contextOf(syn));
    expect(v.integrityVerdict).toBe('PRECONDITION_NOT_HELD_AT_EXECUTION');
    expect(v.recoveryRunRefSha256).toBeNull();
  });

  it('a T-0 failure after the execute was issued, or once a run exists: CONSUMED and not adjudicable', () => {
    for (const [issued, created] of [
      [true, false],
      [false, true],
      [true, true],
    ] as const) {
      const syn = synthetic(
        { recoveryResult: t0Failed(issued, created) },
        `t0-${String(issued)}-${String(created)}`,
      );
      const v = validateTargetedHostRecovery(syn.recovery, contextOf(syn));
      expect(v.integrityVerdict).toBe('PRECONDITION_NOT_HELD_AT_EXECUTION');
      expect(codeOf(() => replayGeneration2History(basis, syn.ledger, syn.history))).toBe(
        'HOST_RECOVERY_RESULT_NOT_CLEAN',
      );
    }
  });

  it('claiming an unspent invocation after an execute was issued is refused', () => {
    const syn = synthetic({
      recoveryResult: (j) => {
        t0Failed(true, false)(j);
        j.invocation.disposition = RECOVERY_INVOCATION_DISPOSITIONS.unspent;
      },
    });
    expect(codeOf(() => validateTargetedHostRecovery(syn.recovery, contextOf(syn)))).toBe(
      'HOST_RECOVERY_INVOCATION_ACCOUNTING',
    );
  });

  it('an "unspent" result that nonetheless carries a run reference is refused', () => {
    const syn = synthetic({
      recoveryResult: (j) => {
        t0Failed(false, false)(j);
        j.recoveryRunRefSha256 = '8'.repeat(64);
      },
    });
    expect(codeOf(() => validateTargetedHostRecovery(syn.recovery, contextOf(syn)))).toBe(
      'HOST_RECOVERY_INVOCATION_ACCOUNTING',
    );
  });

  it('a result that records an automatic replacement invocation is refused', () => {
    const syn = synthetic({
      recoveryResult: (j) => void (j.invocation.automaticReplacementInvocation = true),
    });
    expect(codeOf(() => validateTargetedHostRecovery(syn.recovery, contextOf(syn)))).toBe(
      'HOST_RECOVERY_INVOCATION_ACCOUNTING',
    );
  });

  it('UQ1: a readout that is applied to the original window or acts as a pause system is refused', () => {
    for (const key of [
      'appliedToOriginalWindow',
      'isRecoveryWindowPauseSystem',
      'joinsOriginalWindowDenominator',
    ]) {
      const syn = synthetic(
        { recoveryResult: (j) => void (j.recoveryLocalGateReadout[key] = true) },
        key,
      );
      expect(
        codeOf(() => validateTargetedHostRecovery(syn.recovery, contextOf(syn))),
        key,
      ).toBe('HOST_RECOVERY_GATE_READOUT_MISAPPLIED');
    }
  });
});

// ---------------------------------------------------------------------------
// UQ4: the operator-kit host-semantics repair is a pre-live blocker.
// ---------------------------------------------------------------------------

describe('UQ4: no recovery authority without a proved, reviewed operator-kit repair', () => {
  const kitOf = (mutate: (j: Json) => void): PinnedCommittedRecord => {
    const syn = synthetic({ operatorKitRepair: mutate }, 'kit');
    return syn.recovery.operatorKitRepair;
  };
  it('a complete repair passes', () => {
    expect(codeOf(() => validateOperatorKitHostSemanticsRepair(kitOf(() => undefined)))).toBe(
      'NO_REFUSAL',
    );
  });
  it.each(Object.keys(OPERATOR_KIT_REPAIR_REQUIRED_PROOFS))(
    'a repair that does not prove %s is refused',
    (proof) => {
      const record = kitOf((j) => void (j.proves[proof] = 'NOT_PROVED'));
      expect(codeOf(() => validateOperatorKitHostSemanticsRepair(record))).toBe(
        'HOST_RECOVERY_OPERATOR_KIT_REPAIR_NOT_PROVED',
      );
    },
  );
  it('a repair with no review record, or one that grants authority, is refused', () => {
    expect(
      codeOf(() =>
        validateOperatorKitHostSemanticsRepair(kitOf((j) => void delete j.review.reviewRecord)),
      ),
    ).toBe('HOST_RECOVERY_OPERATOR_KIT_REPAIR_NOT_PROVED');
    expect(
      codeOf(() =>
        validateOperatorKitHostSemanticsRepair(kitOf((j) => void (j.thisFileAuthorises = ['x']))),
      ),
    ).toBe('HOST_RECOVERY_OPERATOR_KIT_REPAIR_NOT_PROVED');
  });
});

// ---------------------------------------------------------------------------
// Static: the recovery namespace is generic.
// ---------------------------------------------------------------------------

describe('the generic recovery namespace names no window, slot, work item or run', () => {
  const files = readdirSync(join(REPO, RECOVERY_DIR)).filter((f) => f.endsWith('.ts'));
  const sourceOf = (file: string) => readFileSync(join(REPO, RECOVERY_DIR, file), 'utf8');
  const allowedHex64 = new Set<string>([
    APPROVED_HOST_RECOVERY_AMENDMENT.sha256,
    ...Object.values(APPROVED_HOST_RECOVERY_AMENDMENT_BINDS).map((ref) => ref.sha256),
  ]);
  const allowedHex40 = new Set<string>([
    APPROVED_HOST_RECOVERY_AMENDMENT.commit,
    ...Object.values(APPROVED_HOST_RECOVERY_AMENDMENT_BINDS).map((ref) => ref.commit),
  ]);

  it('contains exactly the four generic modules and the synthetic fixture builder', () => {
    expect(files.sort()).toEqual([
      'hostRecoveryContract.ts',
      'hostRecoveryEligibility.ts',
      'hostRecoveryProvenance.ts',
      'operatorKitHostSemantics.ts',
      'synthesiseHostRecovery.ts',
    ]);
  });

  it.each(files)(
    '%s carries no window/slot/work-item/run literal or ordinal special case',
    (file) => {
      // The one generic synthesiser the fixture builder reuses lives under a window-named path.
      const source = sourceOf(file).replace(
        "from '../generation2Window03/synthesiseWindow.js'",
        '',
      );
      expect(source).not.toMatch(/G2[PR]:\d/);
      expect(source).not.toMatch(/\b(?:windowOrdinal|selectionIndex|ordinal)\s*[!=]==?\s*\d/);
      expect(source).not.toMatch(/\bWINDOW_\d/);
      expect(source).not.toMatch(/[Ww]indow[-_ ]?\d/);
      expect(source).not.toMatch(/g2w\d|data\/g2w/);
      expect(source).not.toMatch(/generation2Window\d/);
      for (const hex of source.match(/\b[0-9a-f]{64}\b/g) ?? []) {
        expect(allowedHex64.has(hex), `${file}: ${hex}`).toBe(true);
      }
      for (const hex of source.match(/\b[0-9a-f]{40}\b/g) ?? []) {
        expect(allowedHex40.has(hex), `${file}: ${hex}`).toBe(true);
      }
    },
  );

  it('the generic history files gained no window special case and import no window-specific kit', () => {
    for (const path of [
      'src/test/harness/phase2b2d/generation2History/adjudicationHistory.ts',
      'src/test/harness/phase2b2d/generation2History/historyIntegrity.ts',
    ]) {
      const source = readFileSync(join(REPO, path), 'utf8');
      expect(source, path).not.toMatch(/G2[PR]:\d/);
      expect(source, path).not.toMatch(/\bwindowOrdinal\s*[!=]==?\s*\d/);
      expect(source, path).not.toMatch(/generation2Window\d|data\/g2w/);
    }
    for (const file of files) {
      expect(sourceOf(file), file).not.toMatch(
        /from '\.\.\/generation2Window(?!03\/synthesiseWindow)/,
      );
      expect(sourceOf(file), file).not.toMatch(/from '[^']*orgunits\/(?!classify\/canonical)/);
      expect(sourceOf(file), file).not.toMatch(/node:(?:fs|net|http|https|dns|tls|child_process)/);
    }
  });
});
