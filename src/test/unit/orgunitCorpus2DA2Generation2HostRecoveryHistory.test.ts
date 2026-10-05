/**
 * Phase 2B-2D A2 Generation 2: the GENERIC targeted-host-recovery history
 * extension (Methodology-V3 amendment V3-H1..V3-H10, Design A, owner approval
 * 639851a).
 *
 *   - BACKWARD COMPATIBILITY: the committed twelve-window history replays and
 *     binds byte-identically to the pre-change pin, every rebuilt spec hash is
 *     unchanged, and no recovery-only key appears anywhere in it;
 *   - POSITIVE: a synthetic recovery accepted on a replacement item and on a
 *     primary item, at three different window positions, successful and clean
 *     but unsuccessful - the original run stays represented, the recovery run
 *     becomes acquisition of record only through the adjudication, and the
 *     ledger, reserves and stop history do not move;
 *   - ATTACKS: every way to launder a retry, substitute a run, widen the
 *     target or rewrite history is refused by its own code.
 *
 * Every committed input is read by `git show` at a pinned commit; every
 * synthetic record is sealed after tampering, so the semantic rule - never a
 * stale pin - is what refuses. No socket, no database, no file written.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { canonicalStringify } from '../../orgunits/classify/canonical.js';
import type { ReplacementReason } from '../harness/phase2b2d/continuationWindow/windowContract.js';
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
  deriveGeneration2CurrentState,
  planCompleteQ1,
  type Generation2OperationalBasis,
} from '../harness/phase2b2d/generation2Acquisition/state.js';
import { buildGeneration2WindowSpec } from '../harness/phase2b2d/generation2Acquisition/windowSpec.js';
import {
  historyBindingOf,
  replayGeneration2History,
  validateGeneration2LiveResultForHistory,
  type Generation2AdjudicationHistory,
  type Generation2HistoryReplay,
  type Generation2WindowHistoryBinding,
} from '../harness/phase2b2d/generation2History/adjudicationHistory.js';
import {
  GLOBAL_RECOVERY_RUN_REFERENCE_UNIQUENESS_RULE,
  assessAdjudicationHistoryIntegrity,
  recoveryRunReferencesOf,
  requireUniqueHistoricalRunReferences,
} from '../harness/phase2b2d/generation2History/historyIntegrity.js';
import {
  APPROVED_HOST_RECOVERY_AMENDMENT,
  HOST_RECOVERY_EXTENSION_VERSION,
  SUPERSESSION_TOKEN,
} from '../harness/phase2b2d/generation2Recovery/hostRecoveryContract.js';
import type { PinnedCommittedRecord } from '../harness/phase2b2d/generation2Recovery/hostRecoveryEligibility.js';
import {
  validateHostRecoveryAuthority,
  validateHostRecoveryResult,
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
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const bytesOf = (text: string): number => Buffer.byteLength(text, 'utf8');
const show = (commit: string, path: string): string =>
  execFileSync('git', ['-C', REPO, 'show', `${commit}:${path}`], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

/** historyBindingOf(committed Windows 01-12) canonical sha256, computed BEFORE the change. */
const PRE_CHANGE_TWELVE_WINDOW_BINDING_SHA256 =
  '3f0a927a0a4cf92ac008d71a7e8876fc6cdaf7c660b41b54e0867cb9b1bc2a40';
const PRE_CHANGE_REBUILT_SPEC_HASHES = [
  'af9eafe58251a9dbb6a0af5baae0258b2a82a1f1183554d45f3b2dd14898fb23',
  '59bb957942e6f06e8c530bb5dffcd3118f9e3ff5b4a3fc9e1af8ea7e03297b9c',
  '012f983bd0b59b5fe20cf628cf765418ea8046d3f28c1eaafc70d2e679d30418',
  '8f8b4eef73b433d37bb8cae84836285eea0fb03d668c9ab068bad4745882a9da',
  '1714e3c9f9cd175cc6650e8cde150dee0f1c18ae742cc4508235291bee061cad',
  '470f0d281d104b2d099b8e8c62ff65ef4f58678adbba8e422c167a7398935ac0',
  '6a52a37a49b5b48a158a8a6535fdb6355f7b5e1225c902f841de9b261197cce3',
  'a5cf6eeec7067eeadd94266d972a8ecd16130bab184d0ba76b39adaf530b8131',
  'e2c7837660243dfb0420d97e2f72a59de7eb6b147fecba336a360029f8a8abdb',
  '9ab4edc800d1e5ba629b5bc4fb7844fa3e886f7de33bc49065094c65bf5c68a5',
  'df50897eb8d273fd0af753b06cf8266e1b7e34490ed8cd31fd69ebea9a391752',
  '699133f76a0e203d0e311ab4d90c8911b6e2a902dd0b4ae06bf03eb73fb314c2',
];
/** The canonical 21-entry ledger (Window-13 pre-network append) and the Window-13 records. */
const LEDGER_21 = {
  commit: 'ac19cb8ca4538237be49e03e0c19ce46cf6f4ecb',
  sha256: '07cf86644940bab23fcfe74ab1b28f2a1629d0a0ee7478ac57ce7c79ce33bafe',
  ledgerHash: 'c02e37ac42515cb689512b12425c41560fffeb32592e4e15f864892f63208ec8',
};
const W13 = 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_13_';
const W13_AUTHORITY = {
  path: `${W13}LIVE_AUTHORITY_V1.json`,
  commit: '0b9a7dabe5e720b18fcb41830fb687787b47b93f',
  sha256: '5333451e3c8b9287a92fbab26d66571866700958a9caf54a083cda924a237669',
};
const W13_LIVE = {
  path: `${W13}LIVE_RESULT_V1.json`,
  commit: 'bf15fe3b9e16ffbe0a075d4464f7363a2c88b008',
  sha256: 'a4ac8291544647bd5d740275949677858baa6239a0182c0a4fd0ed83f67b294a',
};
const CODE_TREE = { srcOrgunits: 'a'.repeat(40), srcCli: 'b'.repeat(40) };
const HOST: ReplacementReason = 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE';

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof Generation2OperationalRefusal) return error.code;
    throw error;
  }
  return 'NO_REFUSAL';
}
const keysDeep = (value: unknown, out = new Set<string>()): Set<string> => {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out));
  else if (typeof value === 'object' && value !== null) {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      keysDeep(v, out);
    }
  }
  return out;
};

let basis: Generation2OperationalBasis;
let twelve: Generation2AdjudicationHistory;
let ledger21Text: string;
let ledger21: OperationalGeneration2Ledger;
let ledger19Text: string;
let amendment: PinnedCommittedRecord;
const parse = (text: string) =>
  parseOperationalGeneration2Ledger(JSON.parse(text) as unknown, basis.genesis);

/**
 * A synthetic recovered window at history position `priorCount + 1`, planned
 * over the committed starting revision of that position.
 */
function recoveredAt(input: {
  priorCount: number;
  pick: (spec: ReturnType<typeof buildGeneration2WindowSpec>) => number;
  verdict: ReplacementReason | null;
  seed: string;
  tamper?: HostRecoveryTamper;
}): SynthesisedHostRecovery & { spec: ReturnType<typeof buildGeneration2WindowSpec> } {
  const prior = { windows: twelve.windows.slice(0, input.priorCount) };
  const startText =
    input.priorCount === 12 ? ledger19Text : twelve.windows[input.priorCount]!.startingLedgerText;
  const prospectiveText =
    input.priorCount === 12
      ? ledger21Text
      : twelve.windows[input.priorCount + 1]!.startingLedgerText;
  const spec = buildGeneration2WindowSpec({
    basis,
    startingLedger: parse(startText),
    startingLedgerFile: { sha256: sha256(startText), bytes: bytesOf(startText) },
    plannedWindowSize: input.priorCount === 12 ? 2 : 5,
    history: prior,
  });
  const slot = input.pick(spec);
  return {
    spec,
    ...synthesiseHostRecoveredWindow({
      basis,
      priorHistory: prior,
      startingLedgerText: startText,
      prospectiveLedgerText: prospectiveText,
      spec,
      verdicts: { [slot]: input.verdict },
      recoveredSelectionIndex: slot,
      runRefSeed: input.seed,
      approvedAmendment: amendment,
      codeTree: CODE_TREE,
      ...(input.tamper === undefined ? {} : { tamper: input.tamper }),
    }),
  };
}
const lastReplacement = (spec: ReturnType<typeof buildGeneration2WindowSpec>) =>
  spec.workItems.filter((i) => i.kind === 'REPLACEMENT').at(-1)!.selectionIndex;
const firstPrimary = (spec: ReturnType<typeof buildGeneration2WindowSpec>) =>
  spec.workItems.find((i) => i.kind === 'PRIMARY')!.selectionIndex;
/** The default attack target: the last replacement of a synthetic thirteenth window. */
const attacked = (tamper: HostRecoveryTamper, seed = 'attack') =>
  recoveredAt({ priorCount: 12, pick: lastReplacement, verdict: null, seed, tamper });
const replayCode = (syn: SynthesisedHostRecovery) =>
  codeOf(() => replayGeneration2History(basis, syn.ledger, syn.history));

beforeAll(() => {
  const inputs = readWindow13Inputs(REPO);
  basis = assessCommittedInputs(
    inputs.window12Inputs.window11Inputs.window10Inputs.window09Inputs.window08Inputs.committed,
  ).basis!;
  twelve = twelveWindowHistoryForWindow13(inputs);
  ledger19Text = inputs.currentLedgerText;
  ledger21Text = show(LEDGER_21.commit, GENERATION2_LEDGER_PATH);
  ledger21 = parse(ledger21Text);
  const text = show(APPROVED_HOST_RECOVERY_AMENDMENT.commit, APPROVED_HOST_RECOVERY_AMENDMENT.path);
  amendment = {
    path: APPROVED_HOST_RECOVERY_AMENDMENT.path,
    commit: APPROVED_HOST_RECOVERY_AMENDMENT.commit,
    sha256: sha256(text),
    text,
  };
}, 300_000);

// ---------------------------------------------------------------------------
// Backward compatibility.
// ---------------------------------------------------------------------------

describe('recovery-free histories replay and bind exactly as before', () => {
  it('pins the canonical 21-entry ledger and the approved amendment bytes', () => {
    expect(sha256(ledger21Text)).toBe(LEDGER_21.sha256);
    expect(ledger21.entries).toHaveLength(21);
    expect(ledger21.ledgerHash).toBe(LEDGER_21.ledgerHash);
    expect([amendment.sha256, bytesOf(amendment.text)]).toEqual([
      APPROVED_HOST_RECOVERY_AMENDMENT.sha256,
      APPROVED_HOST_RECOVERY_AMENDMENT.bytes,
    ]);
  });

  it('Windows 01-12 hold, bind to the pre-change hash and rebuild every spec unchanged', () => {
    const integrity = assessAdjudicationHistoryIntegrity(basis, ledger21, twelve);
    expect(integrity.failures).toEqual([]);
    expect(integrity.historicalRunReferences).toHaveLength(52);
    expect(integrity.rebuiltWindowSpecHashes).toEqual(PRE_CHANGE_REBUILT_SPEC_HASHES);
    expect(sha256(canonicalStringify(historyBindingOf(integrity.replay!)))).toBe(
      PRE_CHANGE_TWELVE_WINDOW_BINDING_SHA256,
    );
    expect(recoveryRunReferencesOf(integrity.replay!)).toEqual([]);
  });

  it('no recovery-only key appears on a recovery-free replay or binding', () => {
    const replay = replayGeneration2History(basis, ledger21, twelve);
    expect(Object.hasOwn(replay, 'recoveryExtension')).toBe(false);
    for (const window of replay.windows) {
      expect(Object.hasOwn(window, 'recoveryExtension')).toBe(false);
      expect(Object.hasOwn(window, 'targetedHostRecoveries')).toBe(false);
      for (const item of window.executed) {
        expect(Object.hasOwn(item, 'acquisitionOfRecord')).toBe(false);
      }
    }
    const keys = keysDeep(historyBindingOf(replay));
    for (const key of ['recoveryExtension', 'targetedHostRecoveries', 'acquisitionOfRecord']) {
      expect(keys.has(key), key).toBe(false);
    }
  });

  it('the Window-13 spec still rebuilds to its authority, and its LIVE_RESULT still validates unchanged', () => {
    const authorityText = show(W13_AUTHORITY.commit, W13_AUTHORITY.path);
    const liveText = show(W13_LIVE.commit, W13_LIVE.path);
    expect([sha256(authorityText), sha256(liveText)]).toEqual([
      W13_AUTHORITY.sha256,
      W13_LIVE.sha256,
    ]);
    const authority = JSON.parse(authorityText) as Json;
    const spec = buildGeneration2WindowSpec({
      basis,
      startingLedger: parse(ledger19Text),
      startingLedgerFile: { sha256: sha256(ledger19Text), bytes: bytesOf(ledger19Text) },
      plannedWindowSize: 2,
      history: twelve,
    });
    expect(spec.windowSpecHash).toBe(authority.boundWindowSpec.windowSpecHash);
    const items = validateGeneration2LiveResultForHistory(
      { path: W13_LIVE.path, sha256: W13_LIVE.sha256, text: liveText },
      {
        windowOrdinal: 13,
        authority: { path: W13_AUTHORITY.path, sha256: W13_AUTHORITY.sha256, text: authorityText },
        windowSpecHash: spec.windowSpecHash,
        authorisedWorkItems: authority.authorisedWorkItems,
        exactOrder: authority.exactOrder,
        ledgerHash: ledger21.ledgerHash,
        ledgerEntryCount: 21,
      },
    );
    expect(items.map((i) => i.workItemId)).toEqual(['G2R:106:19', 'G2R:109:20']);
  });

  it('before any accepted recovery the open window stays ASSIGNED: no obligation, reserve 21 unassigned', () => {
    const state = deriveGeneration2CurrentState(basis, ledger21, twelve);
    expect(state.replacementAssignedAwaitingExecution).toEqual([106, 109]);
    expect(state.currentAcquisitionFailure).toEqual([]);
    expect(state.q1).toEqual([]);
    expect(state.generation2ReserveConsumed).toBe(21);
    expect(planCompleteQ1(basis, ledger21, twelve)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Positive: accepted recoveries at different positions.
// ---------------------------------------------------------------------------

describe('an accepted recovery becomes acquisition of record only through the adjudication', () => {
  const check = (
    syn: ReturnType<typeof recoveredAt>,
    slot: number,
    verdict: ReplacementReason | null,
  ) => {
    const integrity = assessAdjudicationHistoryIntegrity(basis, syn.ledger, syn.history);
    expect(integrity.failures).toEqual([]);
    const replay = integrity.replay!;
    const window = replay.windows.at(-1)!;
    const item = window.executed.find((e) => e.selectionIndex === slot)!;
    // The original run stays represented, unrelabelled.
    expect(item.runRefSha256).toBe(syn.target.originalRunRefSha256);
    expect(item.acquisitionOfRecord).toMatchObject({
      runRefSha256: syn.recoveryRunRefSha256,
      originalRunDisposition: SUPERSESSION_TOKEN,
      incident: {
        windowOrdinal: window.windowOrdinal,
        workItemId: syn.target.workItemId,
        originalRunRefSha256: syn.target.originalRunRefSha256,
      },
    });
    expect(item.verdict).toBe(
      verdict === null ? 'ACQUISITION_SUCCESSFUL' : 'ACQUISITION_UNSUCCESSFUL',
    );
    expect(item.q3Reason).toBe(verdict);
    // Every executed item is still there exactly once; no membership change.
    expect(window.executed.map((e) => e.workItemId)).toEqual(
      syn.spec.workItems.map((w) => w.workItemId),
    );
    expect(window.recoveryExtension).toBe(HOST_RECOVERY_EXTENSION_VERSION);
    expect(replay.recoveryExtension).toBe(HOST_RECOVERY_EXTENSION_VERSION);
    expect(historyBindingOf(replay).windows.at(-1)).toHaveProperty('targetedHostRecoveries');
    // Global uniqueness covers the recovery reference too.
    expect(recoveryRunReferencesOf(replay)).toEqual([syn.recoveryRunRefSha256]);
    expect(integrity.historicalRunReferences).not.toContain(syn.recoveryRunRefSha256);
    // Ledger and reserves did not move.
    expect(replay.consumedLedgerEntryCount).toBe(syn.ledger.entries.length);
    return replay;
  };

  it('window 13, replacement item, successful recovery -> SUCCESSFUL; Q1 empty; reserves unchanged', () => {
    const syn = recoveredAt({
      priorCount: 12,
      pick: lastReplacement,
      verdict: null,
      seed: 'w13-ok',
    });
    const slot = lastReplacement(syn.spec);
    const replay = check(syn, slot, null);
    expect(replay.final.acquisitionSuccessful).toContain(slot);
    expect(replay.final.currentAcquisitionFailure).toEqual([]);
    expect(replay.consumedLedgerEntryCount).toBe(21);
    expect(planCompleteQ1(basis, syn.ledger, syn.history)).toEqual([]);
  });

  it('window 13, replacement item, CLEAN but unsuccessful recovery -> FAILURE(recovery Q3) and ONE later obligation', () => {
    const syn = recoveredAt({
      priorCount: 12,
      pick: lastReplacement,
      verdict: HOST,
      seed: 'w13-ko',
    });
    const slot = lastReplacement(syn.spec);
    const replay = check(syn, slot, HOST);
    expect(replay.final.currentAcquisitionFailure).toEqual([slot]);
    expect(replay.final.failureReasons).toEqual([{ selectionIndex: slot, reason: HOST }]);
    const q1 = planCompleteQ1(basis, syn.ledger, syn.history);
    expect(q1).toHaveLength(1);
    expect(q1[0]).toMatchObject({ selectionIndex: slot, generation2ReserveRankPosition: 21 });
  });

  it('window 4, primary item, successful recovery', () => {
    const syn = recoveredAt({ priorCount: 3, pick: firstPrimary, verdict: null, seed: 'w04-ok' });
    const slot = firstPrimary(syn.spec);
    const replay = check(syn, slot, null);
    expect(replay.final.acquisitionSuccessful).toContain(slot);
  });

  it('window 2, primary item, clean unsuccessful recovery', () => {
    const syn = recoveredAt({ priorCount: 1, pick: firstPrimary, verdict: HOST, seed: 'w02-ko' });
    const slot = firstPrimary(syn.spec);
    const replay = check(syn, slot, HOST);
    expect(replay.final.currentAcquisitionFailure).toContain(slot);
  });

  it('window 2, replacement item, successful recovery', () => {
    const syn = recoveredAt({
      priorCount: 1,
      pick: lastReplacement,
      verdict: null,
      seed: 'w02-ok',
    });
    check(syn, lastReplacement(syn.spec), null);
  });

  it('the original stop history and per-item P5 contribution are preserved, not recomputed', () => {
    const syn = recoveredAt({
      priorCount: 12,
      pick: lastReplacement,
      verdict: null,
      seed: 'stops',
    });
    const adjudication = JSON.parse(syn.window.adjudication.text) as Json;
    expect(adjudication.originalWindowStopHistory).toMatchObject({
      recomputedFromRecoveryEvidence: false,
      p2: { fired: true },
      p5: { fired: true, windowLowYieldCount: 1 },
      p8: { recordedInLiveResult: true, frozenP8Fired: false },
    });
    expect(replayCode(syn)).toBe('NO_REFUSAL');
  });
});

// ---------------------------------------------------------------------------
// Attacks.
// ---------------------------------------------------------------------------

const itemOf = (adjudication: Json): Json =>
  (adjudication.items as Json[]).find((i) => Object.hasOwn(i, 'acquisitionOfRecord'))!;
const withoutRecoveryBlocks = (adjudication: Json): void => {
  delete itemOf(adjudication).acquisitionOfRecord;
  delete adjudication.windowSummary.acquisitionOfRecordRecovered;
  delete adjudication.originalWindowStopHistory;
};

describe('the history refuses every laundering of a retry or rewrite of history', () => {
  const cases: [string, HostRecoveryTamper, string][] = [
    [
      'a recovery binding on a CLEAN original',
      { adjudication: (j) => void (itemOf(j).integrity.verdict = 'CLEAN') },
      'HOST_RECOVERY_TARGET_WAS_CLEAN',
    ],
    [
      'an original integrity that is neither CLEAN nor HOST_CONFOUNDED',
      { adjudication: (j) => void (itemOf(j).integrity.verdict = 'SOMETHING_ELSE') },
      'HOST_RECOVERY_INTEGRITY_NOT_HOST_CONFOUNDED',
    ],
    [
      'a recovery result that is not CLEAN',
      {
        recoveryResult: (j) => {
          j.monitorCoverageSufficient = false;
          j.integrityVerdict = 'MONITOR_COVERAGE_INSUFFICIENT';
        },
      },
      'HOST_RECOVERY_RESULT_NOT_CLEAN',
    ],
    [
      'a result that calls itself CLEAN against its own evidence',
      { recoveryResult: (j) => void (j.executionExclusivityVerdict = 'NOT_PROVED') },
      'HOST_RECOVERY_RESULT_INTEGRITY_INCONSISTENT',
    ],
    [
      'an arbitrary newer run substituted as acquisition of record',
      { adjudication: (j) => void (itemOf(j).acquisitionOfRecord.runRefSha256 = 'c'.repeat(64)) },
      'HOST_RECOVERY_ACQUISITION_OF_RECORD_MISMATCH',
    ],
    [
      'an original run marked deleted',
      { adjudication: (j) => void (itemOf(j).acquisitionOfRecord.originalRun.deleted = true) },
      'HOST_RECOVERY_ACQUISITION_OF_RECORD_MISMATCH',
    ],
    [
      'an original run with another disposition',
      {
        adjudication: (j) =>
          void (itemOf(j).acquisitionOfRecord.originalRun.disposition = 'RETRACTED'),
      },
      'HOST_RECOVERY_ACQUISITION_OF_RECORD_MISMATCH',
    ],
    [
      'a recovery reference equal to the original',
      {
        recoveryResult: (j) => void (j.recoveryRunRefSha256 = j.originalRunRefSha256),
      },
      'HOST_RECOVERY_RUN_REFERENCE_DUPLICATE',
    ],
    [
      'a changed target field on the recovery authority',
      { recoveryAuthority: (j) => void (j.target.split = 'DEV_TRAIN') },
      'HOST_RECOVERY_TARGET_NOT_FIXED_BY_COMMITTED_EVIDENCE',
    ],
    [
      'another selection index on the recovery authority',
      { recoveryAuthority: (j) => void (j.target.selectionIndex = j.target.selectionIndex + 1) },
      'HOST_RECOVERY_TARGET_NOT_FIXED_BY_COMMITTED_EVIDENCE',
    ],
    [
      'a changed root-authority count',
      { recoveryAuthority: (j) => void (j.target.rootAuthorityCount = 2) },
      'HOST_RECOVERY_TARGET_NOT_FIXED_BY_COMMITTED_EVIDENCE',
    ],
    [
      'a precondition for another target',
      { precondition: (j) => void (j.target.identityDigest = 'd'.repeat(64)) },
      'HOST_RECOVERY_TARGET_MISMATCH',
    ],
    [
      'a recovery measured under another fetch policy',
      { recoveryResult: (j) => void (j.fetchPolicyVersion = 'orgunit-fetch-policy-other') },
      'HOST_RECOVERY_TARGET_MISMATCH',
    ],
    [
      'an authority whose acquisition code tree changed',
      { recoveryAuthority: (j) => void (j.acquisitionCodeTree.srcOrgunits = 'e'.repeat(40)) },
      'HOST_RECOVERY_ACQUISITION_CODE_CHANGED',
    ],
    [
      'a recovery that ran other acquisition code',
      { recoveryResult: (j) => void (j.acquisitionCodeTreeAtExecution.srcCli = 'e'.repeat(40)) },
      'HOST_RECOVERY_ACQUISITION_CODE_CHANGED',
    ],
    [
      'an authority over a moved ledger',
      { recoveryAuthority: (j) => void (j.boundLedger.entryCount += 1) },
      'HOST_RECOVERY_LEDGER_MOVED',
    ],
    [
      'a recovery that consumed a reserve',
      { recoveryResult: (j) => void (j.reserveConsumed = 1) },
      'HOST_RECOVERY_LEDGER_MOVED',
    ],
    [
      'a recovery that changed window membership',
      { recoveryResult: (j) => void (j.membershipChange = 1) },
      'HOST_RECOVERY_LEDGER_MOVED',
    ],
    [
      'a stale precondition (authority 61 minutes after the final probe)',
      { recoveryAuthority: (j) => void (j.recordedAtUtc = '2026-01-01T01:21:00Z') },
      'HOST_RECOVERY_PRECONDITION_STALE',
    ],
    [
      'a precondition recorded after the authority',
      { precondition: (j) => void (j.recordedAtUtc = '2026-01-01T00:31:00Z') },
      'HOST_RECOVERY_PRECONDITION_AFTER_AUTHORITY',
    ],
    [
      'a validity window longer than 60 minutes',
      { precondition: (j) => void (j.validUntilUtc = '2026-01-02T00:20:00Z') },
      'HOST_RECOVERY_PRECONDITION_STALE',
    ],
    [
      'five probes',
      {
        precondition: (j) => {
          j.sustainedSeries.probes.shift();
          j.sustainedSeries.firstProbeAtUtc = j.sustainedSeries.probes[0].atUtc;
        },
      },
      'HOST_RECOVERY_PRECONDITION_SERIES_INSUFFICIENT',
    ],
    [
      'six probes spanning under ten minutes',
      {
        precondition: (j) => {
          (j.sustainedSeries.probes as Json[]).forEach((p, k) => {
            p.atUtc = `2026-01-01T00:1${String(k)}:00Z`;
          });
          j.sustainedSeries.firstProbeAtUtc = j.sustainedSeries.probes[0].atUtc;
          j.sustainedSeries.finalProbeAtUtc = j.sustainedSeries.probes[5].atUtc;
          j.validUntilUtc = '2026-01-01T01:15:00Z';
        },
      },
      'HOST_RECOVERY_PRECONDITION_SERIES_INSUFFICIENT',
    ],
    [
      'one RED probe',
      { precondition: (j) => void (j.sustainedSeries.probes[3].systemResolverFunctioning = false) },
      'HOST_RECOVERY_PRECONDITION_SERIES_INSUFFICIENT',
    ],
    [
      'a control probe set that includes the target',
      { precondition: (j) => void j.sustainedSeries.probes[2].namesQueried.push('target.invalid') },
      'HOST_RECOVERY_PRECONDITION_TARGET_PROBED',
    ],
    [
      'a precondition that says it probed the target',
      { precondition: (j) => void (j.targetProbed = true) },
      'HOST_RECOVERY_PRECONDITION_TARGET_PROBED',
    ],
    [
      'a precondition not PROVED',
      { precondition: (j) => void (j.outcome = 'PRECONDITION_NOT_PROVED') },
      'HOST_RECOVERY_PRECONDITION_NOT_PROVED',
    ],
    [
      'an authority with more than one invocation',
      { recoveryAuthority: (j) => void (j.limits.maximumLiveInvocations = 2) },
      'HOST_RECOVERY_AUTHORITY_LIMITS',
    ],
    [
      'an authority with retries',
      { recoveryAuthority: (j) => void (j.limits.retries = 1) },
      'HOST_RECOVERY_AUTHORITY_LIMITS',
    ],
    [
      'an authority granting ledger mutation',
      { recoveryAuthority: (j) => void (j.flags.ledgerMutationAuthorised = true) },
      'HOST_RECOVERY_AUTHORITY_GRANTS_MUTATION',
    ],
    [
      'an authority granting reserve assignment at top level',
      { recoveryAuthority: (j) => void (j.reserveAssignmentAuthorised = true) },
      'HOST_RECOVERY_AUTHORITY_GRANTS_MUTATION',
    ],
    [
      'an authority that rewrote the host-safety block',
      { recoveryAuthority: (j) => void (j.hostSafety = {}) },
      'HOST_RECOVERY_HOST_SAFETY_CHANGED',
    ],
    [
      'no proved operator-kit host-semantics repair (UQ4)',
      { operatorKitRepair: (j) => void (j.proves.hardCodedHostHealthClaims = 1) },
      'HOST_RECOVERY_OPERATOR_KIT_REPAIR_NOT_PROVED',
    ],
    [
      'an operator-kit repair never separately reviewed (UQ4)',
      { operatorKitRepair: (j) => void (j.review.reviewed = false) },
      'HOST_RECOVERY_OPERATOR_KIT_REPAIR_NOT_PROVED',
    ],
    [
      'a ruling naming no host-integrity stop for the item',
      { incidentRuling: (j) => void (j.hostIntegrityStop.affectedItems = []) },
      'HOST_RECOVERY_NO_INCIDENT_RULING',
    ],
    [
      'a ruling with no observed RED check',
      {
        incidentRuling: (j) =>
          void (j.executedItems.item1.C_hostIntegrity.postItemHostCheck = 'GREEN'),
      },
      'HOST_RECOVERY_NO_OBSERVED_HOST_INTEGRITY_FAILURE',
    ],
    [
      'an execution record showing no host failure (outcome-only grounds)',
      {
        liveResult: (j) => {
          for (const item of j.items as Json[]) item.hostAndVantage.postItem = true;
        },
      },
      'HOST_RECOVERY_GROUNDS_ARE_OUTCOME_ONLY',
    ],
    [
      'a rewritten original P5 count',
      { adjudication: (j) => void (j.originalWindowStopHistory.p5.windowLowYieldCount = 0) },
      'HOST_RECOVERY_STOP_HISTORY_REWRITTEN',
    ],
    [
      'a P2/P5 history recomputed from recovery evidence',
      {
        adjudication: (j) => {
          j.originalWindowStopHistory.recomputedFromRecoveryEvidence = true;
          j.originalWindowStopHistory.p5.fired = false;
        },
      },
      'HOST_RECOVERY_STOP_HISTORY_REWRITTEN',
    ],
    [
      'a frozen-P8 correction that does not match the ruling',
      { adjudication: (j) => void (j.originalWindowStopHistory.p8.frozenP8Fired = true) },
      'HOST_RECOVERY_STOP_HISTORY_REWRITTEN',
    ],
    [
      "the recovered item's P5 contribution rewritten",
      { adjudication: (j) => void (itemOf(j).p5LowYieldContribution = false) },
      'HOST_RECOVERY_STOP_HISTORY_REWRITTEN',
    ],
    [
      'a summary that does not name the recovered item',
      { adjudication: (j) => void (j.windowSummary.acquisitionOfRecordRecovered = []) },
      'HISTORY_SUMMARY_DISAGREES',
    ],
    [
      'a synthetic membership insertion',
      {
        adjudication: (j) => {
          const extra = { ...(j.items as Json[])[0], workItemId: 'synthetic:not-authorised' };
          (j.items as Json[]).push(extra);
        },
      },
      'HISTORY_ADJUDICATION_ITEMS',
    ],
    [
      'HOST_CONFOUNDED with a supplied chain but no acquisition-of-record block',
      { adjudication: withoutRecoveryBlocks },
      'HISTORY_INTEGRITY_NOT_CLEAN',
    ],
    [
      'a supplied recovery chain that no item accepts (unused binding)',
      {
        adjudication: (j) => {
          withoutRecoveryBlocks(j);
          (j.items as Json[]).forEach((item) => void (item.integrity.verdict = 'CLEAN'));
        },
      },
      'HOST_RECOVERY_BINDING_UNUSED',
    ],
    [
      'a recovery result naming another recovery authority',
      {
        recoveryResult: (j) => void (j.boundRecoveryAuthority.sha256 = 'f'.repeat(64)),
      },
      'HOST_RECOVERY_RESULT_BINDING',
    ],
    [
      'an authority naming another precondition',
      { recoveryAuthority: (j) => void (j.boundPrecondition.commit = '0'.repeat(40)) },
      'HOST_RECOVERY_AUTHORITY_BINDING',
    ],
  ];

  it.each(cases)('refuses %s', (_name, tamper, code) => {
    expect(replayCode(attacked(tamper))).toBe(code);
  });

  it('refuses HOST_CONFOUNDED standing alone (no block, no binding)', () => {
    const syn = attacked({ adjudication: withoutRecoveryBlocks });
    const history = {
      windows: [...twelve.windows, { ...syn.window, targetedHostRecoveries: undefined }],
    } as unknown as Generation2AdjudicationHistory;
    const { targetedHostRecoveries: _unused, ...plain } = syn.window;
    expect(codeOf(() => replayGeneration2History(basis, syn.ledger, history))).toBe(
      'HISTORY_INTEGRITY_NOT_CLEAN',
    );
    expect(
      codeOf(() =>
        replayGeneration2History(basis, syn.ledger, { windows: [...twelve.windows, plain] }),
      ),
    ).toBe('HISTORY_INTEGRITY_NOT_CLEAN');
  });

  it('refuses an acquisition of record with no supplied chain', () => {
    const syn = attacked({});
    const { targetedHostRecoveries: _unused, ...plain } = syn.window;
    expect(
      codeOf(() =>
        replayGeneration2History(basis, syn.ledger, { windows: [...twelve.windows, plain] }),
      ),
    ).toBe('HOST_RECOVERY_BINDING_MISSING');
  });

  it('refuses an empty recovery list, two chains for one incident, and an amendment that is not the approved bytes', () => {
    const syn = attacked({});
    const replay = (window: Generation2WindowHistoryBinding) =>
      codeOf(() =>
        replayGeneration2History(basis, syn.ledger, { windows: [...twelve.windows, window] }),
      );
    expect(replay({ ...syn.window, targetedHostRecoveries: [] })).toBe(
      'HOST_RECOVERY_BINDING_UNUSED',
    );
    expect(replay({ ...syn.window, targetedHostRecoveries: [syn.recovery, syn.recovery] })).toBe(
      'HOST_RECOVERY_ALREADY_EXISTS_FOR_INCIDENT',
    );
    const forged = attacked({
      binding: (b) => {
        const text = b.approvedAmendment.text.replace(
          '"approvedDesign": "A"',
          '"approvedDesign": "B"',
        );
        return { ...b, approvedAmendment: { ...b.approvedAmendment, text, sha256: sha256(text) } };
      },
    });
    expect(replayCode(forged)).toBe('HOST_RECOVERY_AMENDMENT_NOT_APPROVED');
  });

  it('refuses a recovery-free window whose summary claims a recovered item', () => {
    const syn = attacked({});
    const prior = { windows: twelve.windows.slice(0, 11) };
    const w12 = twelve.windows[11]!;
    const adjudication = JSON.parse(w12.adjudication.text) as Json;
    adjudication.windowSummary.acquisitionOfRecordRecovered = [];
    const text = `${JSON.stringify(adjudication, null, 2)}\n`;
    const forged = { ...w12, adjudication: { ...w12.adjudication, text, sha256: sha256(text) } };
    expect(
      codeOf(() =>
        replayGeneration2History(basis, syn.ledger, { windows: [...prior.windows, forged] }),
      ),
    ).toBe('HISTORY_SUMMARY_DISAGREES');
  });

  it('refuses a recovery reference that repeats a historical ordinary run of an earlier window', () => {
    const earlier = (JSON.parse(twelve.windows[0]!.adjudication.text) as Json).items[0]
      .runRefSha256 as string;
    const syn = attacked({ recoveryResult: (j) => void (j.recoveryRunRefSha256 = earlier) });
    expect(replayCode(syn)).toBe('HOST_RECOVERY_RUN_REFERENCE_DUPLICATE');
  });

  it(`${GLOBAL_RECOVERY_RUN_REFERENCE_UNIQUENESS_RULE}: a later ordinary run cannot reuse an accepted recovery reference`, () => {
    const syn = attacked({});
    const replay = replayGeneration2History(basis, syn.ledger, syn.history);
    const window = replay.windows.at(-1)!;
    const forged: Generation2HistoryReplay = {
      ...replay,
      windows: [
        ...replay.windows,
        {
          ...window,
          windowOrdinal: window.windowOrdinal + 1,
          executed: [{ ...window.executed[0]!, runRefSha256: syn.recoveryRunRefSha256 }].map(
            ({ acquisitionOfRecord: _drop, ...rest }) => rest,
          ),
        },
      ],
    };
    expect(codeOf(() => requireUniqueHistoricalRunReferences(replay))).toBe('NO_REFUSAL');
    expect(codeOf(() => requireUniqueHistoricalRunReferences(forged))).toBe(
      'HISTORY_DUPLICATE_RUN_REFERENCE',
    );
  });
});

// ---------------------------------------------------------------------------
// Structural separation of record kinds.
// ---------------------------------------------------------------------------

describe('recovery records and ordinary window records never stand in for one another', () => {
  it('the LIVE_RESULT validator refuses a recovery RESULT, the window replay refuses a recovery AUTHORITY', () => {
    const syn = attacked({});
    const authority = JSON.parse(syn.window.authority.text) as Json;
    expect(
      codeOf(() =>
        validateGeneration2LiveResultForHistory(syn.recovery.recoveryResult, {
          windowOrdinal: 13,
          authority: syn.window.authority,
          windowSpecHash: authority.boundWindowSpec.windowSpecHash,
          authorisedWorkItems: authority.authorisedWorkItems,
          exactOrder: authority.exactOrder,
          ledgerHash: syn.ledger.ledgerHash,
          ledgerEntryCount: syn.ledger.entries.length,
        }),
      ),
    ).toBe('HISTORY_LIVE_RESULT_KIND');
    expect(
      codeOf(() =>
        replayGeneration2History(basis, syn.ledger, {
          windows: [
            ...twelve.windows,
            { ...syn.window, authority: syn.recovery.recoveryAuthority },
          ],
        }),
      ),
    ).toBe('HISTORY_AUTHORITY_NOT_APPLICABLE');
  });

  it('the recovery validators refuse ordinary window records', () => {
    const syn = attacked({});
    const asPinned = (b: { path: string; sha256: string; text: string }) => ({
      ...b,
      commit: '1'.repeat(40),
    });
    expect(
      codeOf(() => validateHostRecoveryAuthority(asPinned(syn.window.authority), {} as never)),
    ).toBe('HOST_RECOVERY_RECORD_KIND');
    expect(
      codeOf(() => validateHostRecoveryResult(asPinned(syn.window.liveResult), {} as never)),
    ).toBe('HOST_RECOVERY_RECORD_KIND');
  });
});
