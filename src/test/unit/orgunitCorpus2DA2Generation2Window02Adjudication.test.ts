/**
 * Phase 2B-2D A2 Generation 2: the WINDOW-02 VALIDATION RE-PROOF and
 * ADJUDICATION CLOSURE - the proofs.
 *
 * Reads only committed bytes - at this task's own terminal commit (the one
 * that adds its closure audit) once it exists, else the working tree - so a
 * later, separately authorised Window-03 decision cannot turn these claims
 * into a temporal defect. Opens no socket and no database, writes no file,
 * assigns no reserve and never mutates the canonical Generation-2 ledger.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMMITTED_JSON_DIRECTORIES } from '../harness/phase2b2d/generation2Acquisition/materialiseReadiness.js';
import { GENERATION2_LEDGER_PATH } from '../harness/phase2b2d/generation2Acquisition/operationalContract.js';
import { parseOperationalGeneration2Ledger } from '../harness/phase2b2d/generation2Acquisition/operationalLedger.js';
import {
  assessCommittedInputs,
  deriveGeneration2CurrentState,
  planCompleteQ1,
  type CommittedTexts,
} from '../harness/phase2b2d/generation2Acquisition/state.js';
import {
  bySplitOf,
  type CommittedRecordBinding,
  type Generation2AdjudicationHistory,
} from '../harness/phase2b2d/generation2History/adjudicationHistory.js';
import { assessAdjudicationHistoryIntegrity } from '../harness/phase2b2d/generation2History/historyIntegrity.js';

const REPO = resolve(import.meta.dirname, '../../..');
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

const AUDIT_PATH =
  'docs/audits/PHASE_2B_2D_A2_GENERATION2_WINDOW_02_VALIDATION_REPROOF_AND_ADJUDICATION_CLOSURE_V1.md';
const GENESIS_REVISION_COMMIT = '40b6b0f40a7ae13b00fbf064ed8143996c926f1d';
const WINDOW02_START_REVISION_COMMIT = 'a768cf9b632ceaa76ccd3781d4554b5e92820981';
const EVAL = 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_';
const PINS = {
  w01Authority: [
    `${EVAL}01_LIVE_AUTHORITY_V1.json`,
    'e4874f7e84a184bd473b75f15dba0fd90700d4bb33ec0093593de90f4dea38ba',
  ],
  w01Live: [
    `${EVAL}01_LIVE_RESULT_V1.json`,
    '7162938e6f8ba5f7808075f58021b540244b2b5a0b05d61db0812cfd4d8102d0',
  ],
  w01Adjudication: [
    `${EVAL}01_EVIDENCE_ADJUDICATION_V1.json`,
    '89e4f166e56292374d3cf1aa2fe8037225770d48193ae619a32a1d4c7f1df5df',
  ],
  w02Authority: [
    `${EVAL}02_LIVE_AUTHORITY_V1.json`,
    'e2cb65b5a7d3b35391718e255fef4db926bcfe88020f392ac93f79981392bba2',
  ],
  w02Live: [
    `${EVAL}02_LIVE_RESULT_V1.json`,
    '68852cbca3de127bb0a5442863cc99d2c3b72a5a69700c5fc5ac619fbc29b4ae',
  ],
  w02Adjudication: [
    `${EVAL}02_EVIDENCE_ADJUDICATION_V1.json`,
    '2e35cad7951aed780151b97400ea3b7e9fd78d4bfdec252f83d0652702bbdc8d',
  ],
  ruling: [`${EVAL}02_VALIDATION_EXCLUSIVITY_OWNER_RULING_V1.json`, null],
  reproof: [
    `${EVAL}02_VALIDATION_EXCLUSIVITY_REPROOF_V1.json`,
    '009eb574f6a08e3206fc23df226979f6b6bce87297b5a632394c2331c6aa2b2e',
  ],
} as const;
const LEDGER_HASH = '11c931e8172cc81a7516ad57a1a8f12e733b2f72ccfc7fc8809cb1ee7c174a21';

function terminalCommit(): string | null {
  const commits = git('log', '--diff-filter=A', '--format=%H', '--', AUDIT_PATH)
    .split('\n')
    .filter(Boolean);
  return commits.length === 0 ? null : commits[commits.length - 1]!;
}
const TERMINAL = terminalCommit();
const readState = (path: string): string =>
  TERMINAL === null ? readFileSync(join(REPO, path), 'utf8') : git('show', `${TERMINAL}:${path}`);
const namesState = (dir: string): string[] =>
  TERMINAL === null
    ? readdirSync(join(REPO, dir))
    : git('ls-tree', '--name-only', `${TERMINAL}:${dir}`).split('\n').filter(Boolean);

const GENESIS_TEXT = git('show', `${GENESIS_REVISION_COMMIT}:${GENERATION2_LEDGER_PATH}`);
const W02_START_TEXT = git('show', `${WINDOW02_START_REVISION_COMMIT}:${GENERATION2_LEDGER_PATH}`);
const LEDGER_TEXT = readState(GENERATION2_LEDGER_PATH);
function committedState(): CommittedTexts {
  const committed = new Map<string, string>();
  for (const dir of COMMITTED_JSON_DIRECTORIES) {
    for (const name of namesState(dir)) {
      if (name.endsWith('.json')) committed.set(`${dir}/${name}`, readState(`${dir}/${name}`));
    }
  }
  committed.set(GENERATION2_LEDGER_PATH, GENESIS_TEXT);
  return committed;
}
const BASIS = assessCommittedInputs(committedState()).basis!;
const LEDGER = parseOperationalGeneration2Ledger(JSON.parse(LEDGER_TEXT), BASIS.genesis);
const bind = ([path, pin]: readonly [string, string | null]): CommittedRecordBinding => {
  const text = readState(path);
  if (pin !== null) expect(sha256(text), path).toBe(pin);
  return { path, sha256: sha256(text), text };
};
const json = (key: keyof typeof PINS) => JSON.parse(bind(PINS[key]).text) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const HISTORY: Generation2AdjudicationHistory = {
  windows: [
    {
      windowOrdinal: 1,
      authority: bind(PINS.w01Authority),
      liveResult: bind(PINS.w01Live),
      adjudication: bind(PINS.w01Adjudication),
      startingLedgerText: GENESIS_TEXT,
    },
    {
      windowOrdinal: 2,
      authority: bind(PINS.w02Authority),
      liveResult: bind(PINS.w02Live),
      adjudication: bind(PINS.w02Adjudication),
      startingLedgerText: W02_START_TEXT,
    },
  ],
};

describe('Generation-2 Window 02: validation re-proof and adjudication closure', () => {
  it('binds every record exactly: re-proof -> owner ruling, adjudication -> LIVE_RESULT, authority, ruling and re-proof', () => {
    const ruling = bind(PINS.ruling);
    const reproof = json('reproof');
    const adjudication = json('w02Adjudication');
    expect(reproof.ownerRuling.sha256).toBe(ruling.sha256);
    expect(adjudication.bound.ownerRuling.sha256).toBe(ruling.sha256);
    expect(adjudication.bound.validationReproof.sha256).toBe(PINS.reproof[1]);
    expect(adjudication.bound.liveResult.sha256).toBe(PINS.w02Live[1]);
    expect(adjudication.bound.authority.sha256).toBe(PINS.w02Authority[1]);
    expect(adjudication.thisFileAuthorises).toEqual([]);
  });

  it('the re-proof is clean and exclusive, and the first validation stays NOT_PROVED', () => {
    const reproof = json('reproof');
    expect(reproof.exclusivityVerdict).toBe('WINDOW_02_VALIDATION_EXCLUSIVITY_REPROVED_CLEAN');
    expect(reproof.validation.exitCode).toBe(0);
    expect(reproof.validation.runs).toBe(1);
    expect(reproof.monitor.coverageSufficient).toBe(true);
    expect(reproof.monitor.maxGapSeconds).toBeLessThanOrEqual(5);
    expect(reproof.candidateSummary.EXTERNAL_COMPETING_PROCESS).toBe(0);
    expect(reproof.candidateSummary.ANCESTRY_NOT_PROVED).toBe(0);
    expect(reproof.landedEvaluator.integritySatisfied).toBe(true);
    for (const candidate of reproof.candidates) {
      expect(candidate.finalClassification).toBe('GOVERNED_VALIDATION_DESCENDANT_PROVED');
      expect(candidate.chainReachesGovernedValidation).toBe(true);
    }
    expect(reproof.originalValidation.formalVerdict).toBe(
      'VALIDATION_EXECUTION_EXCLUSIVITY_NOT_PROVED',
    );
    expect(reproof.originalValidation.reclassified).toBe(false);
  });

  it('replays Window 01 then Window 02 with ADJUDICATION_HISTORY_INTEGRITY and no unadjudicated gap', () => {
    const integrity = assessAdjudicationHistoryIntegrity(BASIS, LEDGER, HISTORY);
    expect(integrity.failures).toEqual([]);
    expect(integrity.holds).toBe(true);
    expect(integrity.replay!.consumedLedgerEntryCount).toBe(3);
    const runRefs = integrity.replay!.windows.flatMap((w) => w.executed.map((e) => e.runRefSha256));
    expect(new Set(runRefs).size).toBe(10);
    expect(
      integrity.replay!.windows[1]!.executed.map((e) => [e.workItemId, e.verdict, e.q3Reason]),
    ).toEqual([
      ['G2R:78:2', 'ACQUISITION_SUCCESSFUL', null],
      ['G2P:80', 'ACQUISITION_SUCCESSFUL', null],
      ['G2P:81', 'ACQUISITION_SUCCESSFUL', null],
      ['G2P:82', 'ACQUISITION_UNSUCCESSFUL', 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE'],
      ['G2P:83', 'ACQUISITION_UNSUCCESSFUL', 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE'],
    ]);
  });

  it('derives the complete 110-slot state, Q1 [82, 83] and P6 false from the two-window history', () => {
    const state = deriveGeneration2CurrentState(BASIS, LEDGER, HISTORY);
    expect(state.successfulOrganisationCount).toBe(82);
    expect(bySplitOf(BASIS, state.acquisitionSuccessful)).toEqual({
      DEV_TRAIN: 15,
      DEV_CONFIRM: 34,
      FINAL_HOLDOUT: 33,
    });
    expect(state.currentAcquisitionFailure).toEqual([82, 83]);
    expect(state.q1).toEqual([82, 83]);
    expect(state.q1Reasons.map((r) => r.reason)).toEqual([
      'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE',
      'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE',
    ]);
    expect(state.replacementAssignedAwaitingExecution).toEqual([]);
    expect(state.pendingCapabilityReview).toEqual([]);
    expect(state.carryForwardRefused).toEqual([]);
    expect(state.neverStarted).toEqual(Array.from({ length: 26 }, (_, k) => 84 + k));
    expect(state.accounting).toBe(
      '82 successful + 2 failed + 0 assigned + 0 pending + 26 never started = 110',
    );
    expect(planCompleteQ1(BASIS, LEDGER, HISTORY).map((a) => a.selectionIndex)).toEqual([82, 83]);
    expect(json('w02Adjudication').p6.fires).toBe(false);
  });

  it('preserves P5 as a valid post-final-item pause and leaves the ledger at three entries, reserve 3 unassigned', () => {
    const adjudication = json('w02Adjudication');
    expect(adjudication.p5.decision).toBe('PAUSE_P5_LOW_RAW_YIELD');
    expect(adjudication.p5.firedAfter).toBe('G2P:83');
    expect(adjudication.p5.record).toBe(
      'VALID_FROZEN_GATE_PAUSE_REVIEWED_BY_OWNER_AFTER_WINDOW_COMPLETION',
    );
    expect(adjudication.p5.retrospectiveEvidenceInvalidation).toBe(false);
    expect(LEDGER.entries).toHaveLength(3);
    expect(LEDGER.ledgerHash).toBe(LEDGER_HASH);
    expect(adjudication.reserves.reserve3Assigned).toBe(false);
  });

  it('creates no Window-03 record', () => {
    expect(
      namesState('docs/evaluation').filter((name) => /GENERATION2_WINDOW_03/.test(name)),
    ).toEqual([]);
  });
});
