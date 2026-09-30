/**
 * Phase 2B-2D A2 Generation 2: WINDOW-08 OFFLINE READINESS under the
 * owner-approved primary-first cadence.
 *
 * Every input is committed bytes at a pinned commit (see the materialiser);
 * the record is compared with its bytes at THIS task's terminal commit (the
 * commit that adds the audit) once it exists, else the working tree - so a
 * later Window-08 authority, ledger append or live result cannot turn these
 * readiness claims red.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildReserveExecutionBinding } from '../harness/phase2b2d/generation2Acquisition/executionBinding.js';
import { assessCommittedInputs } from '../harness/phase2b2d/generation2Acquisition/state.js';
import { verifyWindowCadenceAuthority } from '../harness/phase2b2d/generation2Cadence/windowCadence.js';
import {
  readWindow08Inputs,
  renderWindow08Readiness,
} from '../harness/phase2b2d/generation2Window08/materialiseWindow08Readiness.js';
import {
  EXPECTED_WINDOW_08,
  WINDOW08_CADENCE_DECISION,
  WINDOW08_CURRENT_LEDGER_REVISION,
  WINDOW08_READINESS_AUDIT_PATH,
  WINDOW08_READINESS_PATH,
  WINDOW08_READINESS_TERMINAL_STATE,
} from '../harness/phase2b2d/generation2Window08/window08Contract.js';
import {
  buildWindow08Readiness,
  cadenceBindingOf,
  type Window08Inputs,
  type Window08Readiness,
} from '../harness/phase2b2d/generation2Window08/window08Readiness.js';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const REPO = resolve(import.meta.dirname, '../../..');
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8' }).trim();
const terminal = (() => {
  const commits = git('log', '--diff-filter=A', '--format=%H', '--', WINDOW08_READINESS_AUDIT_PATH)
    .split('\n')
    .filter(Boolean);
  return commits.length === 0 ? null : commits[commits.length - 1]!;
})();
const committedRecord = (): string =>
  terminal === null
    ? readFileSync(join(REPO, WINDOW08_READINESS_PATH), 'utf8')
    : execFileSync('git', ['-C', REPO, 'show', `${terminal}:${WINDOW08_READINESS_PATH}`], {
        encoding: 'utf8',
      });

let inputs: Window08Inputs;
let built: Window08Readiness;
let record: Json;

beforeAll(() => {
  inputs = readWindow08Inputs(REPO);
  built = buildWindow08Readiness(inputs);
  record = JSON.parse(committedRecord()) as Json;
}, 300_000);

describe('Phase 2B-2D A2 Generation-2 Window-08 offline readiness', () => {
  it('re-derives byte-identically from committed bytes and authorises nothing', async () => {
    expect(await renderWindow08Readiness(inputs)).toBe(committedRecord());
    expect(record.terminalState).toBe(WINDOW08_READINESS_TERMINAL_STATE);
    expect(record.thisFileAuthorises).toEqual([]);
    expect(record.isLiveAuthority).toBe(false);
    for (const key of [
      'networkAuthorised',
      'databaseAuthorised',
      'ledgerMutationAuthorised',
      'reserveAssignmentAuthorised',
      'networkUsed',
      'databaseUsed',
      'ledgerMutated',
      'reserveAssigned',
      'acquisitionRunCreated',
    ]) {
      expect(record[key], key).toBe(false);
    }
    expect(Object.values(record.sideEffects as Json).every((v) => v === 0 || v === false)).toBe(
      true,
    );
    expect(record.bound.cadenceImplementationCommit).toMatch(/^[0-9a-f]{40}$/);
  });

  it('replays the explicit seven-window history: 32 / 32 run references, every historical spec hash', () => {
    expect(record.adjudicationHistory.windows.map((w: Json) => w.windowOrdinal)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(record.adjudicationHistory.windows.map((w: Json) => w.rebuiltWindowSpecHash)).toEqual(
      EXPECTED_WINDOW_08.rebuiltWindowSpecHashes,
    );
    expect(record.adjudicationHistory.integrity).toEqual({
      holds: true,
      isFrozenP7: false,
      historicalRunReferences: 32,
      distinct: 32,
    });
    expect(
      record.adjudicationHistory.hardenedLiveResultContract.map((c: Json) => [c.result, c.items]),
    ).toEqual([
      ['PASS', 5],
      ['PASS', 5],
      ['PASS', 5],
      ['PASS', 5],
      ['PASS', 5],
      ['PASS', 5],
      ['PASS', 2],
    ]);
  });

  it('the current state and complete Q1 are the unchanged rules', () => {
    const s = EXPECTED_WINDOW_08.currentState;
    expect(record.currentState).toMatchObject({
      ACQUISITION_SUCCESSFUL: s.successful,
      acquisitionSuccessfulBySplit: s.successfulBySplit,
      CURRENT_ACQUISITION_FAILURE: s.failures,
      failureReasons: s.failureReasons,
      REPLACEMENT_ASSIGNED_AWAITING_EXECUTION: s.assigned,
      PENDING_CAPABILITY_REVIEW: s.pending,
      NEVER_STARTED: s.neverStarted,
      q1: s.q1,
      accounting: s.accounting,
      nextGeneration2ReservePosition: s.nextGeneration2Reserve,
    });
    expect(record.q1.assignments).toEqual(EXPECTED_WINDOW_08.q1Assignments);
    expect(
      record.q1.occupantsReplaced.map((o: Json) => [
        o.selectionIndex,
        o.kind,
        o.generation2LedgerSequence,
      ]),
    ).toEqual([
      [96, 'GENERATION2_RESERVE_REPLACEMENT', 7],
      [99, 'GENERATION2_RESERVE_REPLACEMENT', 8],
    ]);
  });

  it('reserves 9 and 10 are the frozen schedule entries (identities checked here only)', () => {
    const basis = assessCommittedInputs(inputs.committed).basis!;
    const want: Record<number, [string, string]> = {
      9: ['F VENDOME01|948661747', 'd3393e14-2959-41c7-a8bf-54f19d479f76'],
      10: ['E BADAJOZ43|879298308', '0b370fc5-8bb2-445a-a284-8f2c0ac7ced0'],
    };
    for (const reserve of EXPECTED_WINDOW_08.reserves) {
      const b = buildReserveExecutionBinding(
        basis.frameIndex,
        basis.schedule,
        reserve.generation2ReserveRankPosition,
      );
      expect({
        sourceFrameRankPosition: b.sourceFrameRankPosition,
        rankHash: b.rankHash,
        frameEntrySha256: b.frameEntrySha256,
        scheduleEntrySha256: b.scheduleEntrySha256,
      }).toEqual({
        sourceFrameRankPosition: reserve.sourceFrameRankPosition,
        rankHash: reserve.rankHash,
        frameEntrySha256: reserve.frameEntrySha256,
        scheduleEntrySha256: reserve.scheduleEntrySha256,
      });
      expect([b.echeRowKey, b.organisationId]).toEqual(
        want[reserve.generation2ReserveRankPosition],
      );
      expect(b.rootAuthorities.map((a) => a.type)).toEqual(['WEBSITE_CLAIM']);
    }
    expect(committedRecord()).not.toMatch(/VENDOME|BADAJOZ|d3393e14|0b370fc5/);
  });

  it('the prospective append is in memory only: 96 -> 9 (prev seq 7) then 99 -> 10 (prev seq 8), 11 entries', () => {
    const a = record.prospectiveAppend;
    expect(a.written).toBe(false);
    expect(
      a.entries.map((e: Json) => ({
        sequence: e.sequence,
        selectionIndex: e.selectionIndex,
        generation2ReserveRankPosition: e.generation2ReserveRankPosition,
        split: e.split,
        reason: e.reason,
        replacedOccupantKind: e.replacedOccupantKind,
        previousSequenceForSlot: e.previousSequenceForSlot,
      })),
    ).toEqual(EXPECTED_WINDOW_08.plannedAppend);
    expect(a.entries[0].previousEntryHash).toBe(WINDOW08_CURRENT_LEDGER_REVISION.lastEntryHash);
    expect(a.entries[1].previousEntryHash).toBe(a.entries[0].entryHash);
    expect([a.prospectiveEntryCount, a.nextGeneration2ReservePosition]).toEqual([11, 11]);
    expect(record.prospectiveState).toMatchObject({
      ACQUISITION_SUCCESSFUL: 98,
      CURRENT_ACQUISITION_FAILURE: [],
      REPLACEMENT_ASSIGNED_AWAITING_EXECUTION: [96, 99],
      NEVER_STARTED: EXPECTED_WINDOW_08.prospective.neverStarted,
      q1: [],
      accounting: EXPECTED_WINDOW_08.prospective.accounting,
    });
    expect(built.prospectiveLedgerText).not.toBe(
      readFileSync(join(REPO, WINDOW08_CURRENT_LEDGER_REVISION.path), 'utf8'),
    );
  });

  it('membership is complete Q1 + exactly G2P:100-102; the order is precommitted primary-first', () => {
    const w = record.window08;
    expect(w.membership).toEqual(EXPECTED_WINDOW_08.membership);
    expect(w.defaultCadenceOrder).toEqual(EXPECTED_WINDOW_08.defaultOrder);
    expect(w.order).toEqual(EXPECTED_WINDOW_08.order);
    expect(w.workItems.map((i: Json) => i.split)).toEqual(EXPECTED_WINDOW_08.splits);
    expect(w.composition).toEqual(EXPECTED_WINDOW_08.composition);
    expect(w.membershipEqualsDefaultCadence).toBe(true);
    expect(w.windowSpecHash).toBe(built.spec.windowSpecHash);
    expect(w.defaultCadenceSpecHash).not.toBe(w.windowSpecHash);
    expect(w.executionCadence).toEqual(verifyWindowCadenceAuthority(cadenceBindingOf(inputs), 8));
    expect(w.executionCadence.authority.sha256).toBe(WINDOW08_CADENCE_DECISION.sha256);
    expect(sha256(inputs.cadenceDecisionText)).toBe(WINDOW08_CADENCE_DECISION.sha256);
    expect(w.executionIdentities.every((i: Json) => i.rebuiltEqualsSpec === true)).toBe(true);
    expect(w.executionIdentities.slice(0, 3).map((i: Json) => i.identityDigest)).toEqual([
      'b4abfe39242a39edb702052479a2c6235760c641dcd0a106dd6b7105b6fc14fb',
      '0ebc03aae802c50db2527f6a258e7a95480b5aabd7804abdf5f22ee6abb7b638',
      'ea0189ded885dda2755d8c0eefb1b2a78180954c78fa4dbfe1c79814900db4ae',
    ]);
  });

  it('P2 / P5 / P6 / P7 / P8 and both operational prerequisites', () => {
    const g = record.gates;
    expect(g.p2.threshold).toBe(3);
    expect([g.p5.threshold, g.p5.denominator, g.p5.scope, g.p5.exemptForPrimaries]).toEqual([
      2,
      5,
      'CURRENT_WINDOW',
      false,
    ]);
    expect([
      g.p6.beforeAppend.reserveConsumed,
      g.p6.beforeAppend.fires,
      g.p6.afterAppend.reserveConsumed,
      g.p6.afterAppend.fires,
    ]).toEqual([9, false, 11, false]);
    expect(g.p7.invariants).toBe(18);
    expect(g.p7.onCurrentLedger).toMatchObject({
      held: '16/18',
      falseInvariants: EXPECTED_WINDOW_08.p7CurrentFalse,
    });
    expect(g.p7.onProspectiveLedger).toEqual({ held: '18/18', falseInvariants: [] });
    expect(g.p7.withoutTheCadenceDecision.windowCadenceAuthorityIntegrity).toBe(false);
    expect(g.operationalPrerequisites).toEqual({
      adjudicationHistoryIntegrity: true,
      windowCadenceAuthorityIntegrity: true,
      bothOutsideFrozenP7: true,
    });
    expect(g.zeroCompletedGate).toEqual({
      decision: 'CONTINUE_TO_NEXT_WORK_ITEM',
      nextWorkItemId: 'G2P:100',
      mayStartNextWorkItem: true,
    });
    expect(
      built.preflightOnProspective.operationalPrerequisites.windowCadenceAuthorityIntegrity,
    ).toBe(true);
  });

  it('the canonical ledger is untouched at this task terminal: nine entries, reserve 9 unassigned', () => {
    const at = terminal ?? 'HEAD';
    const text = execFileSync(
      'git',
      ['-C', REPO, 'show', `${at}:${WINDOW08_CURRENT_LEDGER_REVISION.path}`],
      { encoding: 'utf8' },
    );
    expect(sha256(text)).toBe(WINDOW08_CURRENT_LEDGER_REVISION.fileSha256);
    expect(record.canonicalGeneration2Ledger).toEqual({
      unchanged: true,
      entryCount: 9,
      ledgerHash: WINDOW08_CURRENT_LEDGER_REVISION.ledgerHash,
      reserve9Assigned: false,
    });
  });
});
