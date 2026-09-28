/**
 * Phase 2B-2D A2 Generation 2: the WINDOW-01 TEMPORAL TEST-SCOPING CORRECTION -
 * the current state it proves, and its isolation.
 *
 *   - the four historical lifecycle tests now read their lifecycle facts at
 *     their own terminal commits (freeze 218cd69, readiness cbbdc71,
 *     concurrency correction 40b6b0f); THIS test proves the separate, current
 *     fact: exactly one Window-01 live authority, a two-entry canonical
 *     Generation-2 ledger (slot 75 -> reserve 0, slot 76 -> reserve 1, next
 *     reserve 2), no LIVE_RESULT, no Window-02 authority, and a Generation-2
 *     P7 of 18/18;
 *   - over this task's own range (bbed7d2 -> the commit that adds the
 *     correction record; the working tree only while that commit does not yet
 *     exist) the only changes are the four historical tests, this test and the
 *     correction record. No production code, harness, frozen artifact,
 *     authority or ledger changed.
 *
 * "Current" is itself bounded to this task's terminal, so a later, separately
 * authorised Window-01 LIVE_RESULT does not turn this proof into the next
 * temporal defect. Reads only committed bytes; no socket, no database.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMMITTED_JSON_DIRECTORIES } from '../harness/phase2b2d/generation2Acquisition/materialiseReadiness.js';
import {
  FIRST_WINDOW_PLANNED_SIZE,
  PINNED,
} from '../harness/phase2b2d/generation2Acquisition/operationalContract.js';
import {
  parseOperationalGeneration2Ledger,
  resolveCrossGenerationOccupant,
} from '../harness/phase2b2d/generation2Acquisition/operationalLedger.js';
import {
  GENERATION2_P7_INVARIANT_NAMES,
  computeGeneration2Preflight,
} from '../harness/phase2b2d/generation2Acquisition/preflight.js';
import {
  assessCommittedInputs,
  deriveGeneration2CurrentState,
  type CommittedTexts,
} from '../harness/phase2b2d/generation2Acquisition/state.js';
import { buildGeneration2WindowSpec } from '../harness/phase2b2d/generation2Acquisition/windowSpec.js';

const REPO = resolve(import.meta.dirname, '../../..');
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO, ...args], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });

const PRE_CORRECTION_HEAD = 'bbed7d25b742c3b205a593e05ee5a770399ea3a6';
const FREEZE_TERMINAL_COMMIT = '218cd69daaaf43b8eef718cd7a96a4cf35d62044';
const READINESS_TERMINAL_COMMIT = 'cbbdc711de26b5a1dff4321a5cb5a213a2631824';
const CONCURRENCY_TERMINAL_COMMIT = '40b6b0f40a7ae13b00fbf064ed8143996c926f1d';
const AUTHORITY_COMMIT = '219f6d4a1cb869e9253a9701d48543a88f80f0ab';
const RECORD_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_01_TEMPORAL_TEST_SCOPING_CORRECTION_V1.json';
const AUTHORITY_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_01_LIVE_AUTHORITY_V1.json';
const LEDGER_PATH =
  'docs/evaluation/generation2/corpus/PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER_V1_GEN2.json';
const THIS_TEST =
  'src/test/unit/orgunitCorpus2DA2Generation2Window01TemporalScopingCorrection.test.ts';
const HISTORICAL_TESTS = [
  'src/test/unit/orgunitCorpus2DA2Generation2ConcurrencyCorrection.test.ts',
  'src/test/unit/orgunitCorpus2DA2Generation2FirstWindowReadiness.test.ts',
  'src/test/unit/orgunitCorpus2DA2Generation2FirstWindowReadinessIsolation.test.ts',
  'src/test/unit/orgunitCorpus2DA2Generation2Freeze.test.ts',
];

/** The commit that added the correction record, or null while it is uncommitted. */
function terminalCommit(): string | null {
  const commits = git('log', '--diff-filter=A', '--format=%H', '--', RECORD_PATH)
    .split('\n')
    .filter(Boolean);
  return commits.length === 0 ? null : commits[commits.length - 1]!;
}
const TERMINAL = terminalCommit();

/** Bytes as this correction left them: its terminal commit, else the working tree. */
const readState = (path: string): string =>
  TERMINAL === null ? readFileSync(join(REPO, path), 'utf8') : git('show', `${TERMINAL}:${path}`);
const namesState = (dir: string): string[] =>
  TERMINAL === null
    ? readdirSync(join(REPO, dir))
    : git('ls-tree', '--name-only', `${TERMINAL}:${dir}`).split('\n').filter(Boolean);
const readAt = (commit: string, path: string): string => git('show', `${commit}:${path}`);

interface Authority {
  isLiveAuthority: boolean;
  exactOrder: string[];
  maximumLiveInvocations: number;
  boundWindowSpec: { windowSpecHash: string };
  boundStartingLedger: {
    fileSha256: string;
    ledgerHash: string;
    entryCount: number;
    revisionCommit: string;
  };
}
interface Correction {
  thisFileAuthorises: unknown[];
  isLiveAuthority: boolean;
  networkAuthorised: boolean;
  databaseAuthorised: boolean;
  ledgerMutationAuthorised: boolean;
  preCorrectionHead: string;
  historicalTerminals: Record<string, { commit: string; tests: string[] }>;
  existingLiveAuthority: { path: string; sha256: string; bytes: number; commit: string };
  currentGeneration2Ledger: {
    path: string;
    fileSha256: string;
    bytes: number;
    ledgerHash: string;
    entryCount: number;
    nextGeneration2ReservePosition: number;
  };
  sideEffects: Record<string, number>;
}

const RECORD = JSON.parse(readState(RECORD_PATH)) as Correction;
const AUTHORITY_TEXT = readState(AUTHORITY_PATH);
const AUTHORITY = JSON.parse(AUTHORITY_TEXT) as Authority;
const LEDGER_TEXT = readState(LEDGER_PATH);
/** The revision the window was precommitted against: the zero-entry genesis. */
const STARTING_LEDGER_TEXT = readAt(AUTHORITY.boundStartingLedger.revisionCommit, LEDGER_PATH);

/**
 * The committed-input map at this correction's terminal, with the pinned
 * genesis path carrying the genesis bytes of the precommit revision: the
 * genesis is an immutable reference, while the ledger's current bytes are
 * the separate `currentLedgerText` input.
 */
function committedWithPinnedGenesis(): CommittedTexts {
  const committed = new Map<string, string>();
  for (const dir of COMMITTED_JSON_DIRECTORIES) {
    for (const name of namesState(dir)) {
      if (name.endsWith('.json')) committed.set(`${dir}/${name}`, readState(`${dir}/${name}`));
    }
  }
  committed.set(PINNED.genesisLedger.path, STARTING_LEDGER_TEXT);
  return committed;
}
const COMMITTED = committedWithPinnedGenesis();
const ASSESSMENT = assessCommittedInputs(COMMITTED);

describe('Phase 2B-2D A2 Generation-2 Window-01 temporal test-scoping correction', () => {
  it('the record authorises nothing and binds the exact terminals, authority and ledger', () => {
    expect(RECORD).toMatchObject({
      thisFileAuthorises: [],
      isLiveAuthority: false,
      networkAuthorised: false,
      databaseAuthorised: false,
      ledgerMutationAuthorised: false,
      preCorrectionHead: PRE_CORRECTION_HEAD,
    });
    expect(Object.values(RECORD.sideEffects).every((count) => count === 0)).toBe(true);
    expect(RECORD.historicalTerminals).toMatchObject({
      generation2Freeze: { commit: FREEZE_TERMINAL_COMMIT },
      firstWindowReadinessV1: { commit: READINESS_TERMINAL_COMMIT },
      concurrencyCorrection: { commit: CONCURRENCY_TERMINAL_COMMIT },
    });
    expect(
      Object.values(RECORD.historicalTerminals)
        .flatMap((terminal) => terminal.tests)
        .sort(),
    ).toEqual([...HISTORICAL_TESTS].sort());
    // Each historical test names its own terminal commit.
    for (const { commit, tests } of Object.values(RECORD.historicalTerminals)) {
      for (const test of tests) expect(readState(test), test).toContain(`'${commit}'`);
    }
    expect(RECORD.existingLiveAuthority).toEqual(
      expect.objectContaining({
        path: AUTHORITY_PATH,
        sha256: sha256(AUTHORITY_TEXT),
        bytes: Buffer.byteLength(AUTHORITY_TEXT, 'utf8'),
        commit: AUTHORITY_COMMIT,
      }),
    );
    expect(RECORD.currentGeneration2Ledger).toEqual(
      expect.objectContaining({
        path: LEDGER_PATH,
        fileSha256: sha256(LEDGER_TEXT),
        bytes: Buffer.byteLength(LEDGER_TEXT, 'utf8'),
        ledgerHash: 'ce56b07efbf7fdfd0ba56dc473ef9c4465fd3852a2c012f1c24271612465ab82',
        entryCount: 2,
        nextGeneration2ReservePosition: 2,
      }),
    );
  });

  it('current state: exactly one Generation-2 live authority, for Window 01, unconsumed', () => {
    const generation2 = namesState('docs/evaluation').filter((name) =>
      /GENERATION2|GEN2|METHOD_V3/i.test(name),
    );
    expect(generation2.filter((name) => /LIVE_AUTHORITY/i.test(name))).toEqual([
      'PHASE_2B_2D_A2_GENERATION2_WINDOW_01_LIVE_AUTHORITY_V1.json',
    ]);
    expect(generation2.filter((name) => /LIVE_RESULT|ADJUDICATION/i.test(name))).toEqual([]);
    expect(generation2.filter((name) => /WINDOW_0[2-9]|WINDOW_[1-9]\d/i.test(name))).toEqual([]);
    expect(AUTHORITY).toMatchObject({
      isLiveAuthority: true,
      exactOrder: ['G2R:75:0', 'G2R:76:1', 'G2P:77', 'G2P:78', 'G2P:79'],
      maximumLiveInvocations: 5,
    });
    // The authority is byte-identical to the commit that recorded it.
    expect(AUTHORITY_TEXT).toBe(readAt(AUTHORITY_COMMIT, AUTHORITY_PATH));
  });

  it('current state: the canonical ledger holds the two-entry pre-network append, next reserve 2', () => {
    const basis = ASSESSMENT.basis!;
    expect(ASSESSMENT.failures).toEqual([]);
    expect(sha256(STARTING_LEDGER_TEXT)).toBe(AUTHORITY.boundStartingLedger.fileSha256);
    expect(LEDGER_TEXT).toBe(readAt(PRE_CORRECTION_HEAD, LEDGER_PATH));
    const ledger = parseOperationalGeneration2Ledger(JSON.parse(LEDGER_TEXT), basis.genesis);
    expect(ledger.status).toBe('FROZEN');
    expect(ledger.reserveAssigned).toBe(false);
    expect(ledger.entries).toHaveLength(2);
    expect(ledger.ledgerHash).toBe(
      'ce56b07efbf7fdfd0ba56dc473ef9c4465fd3852a2c012f1c24271612465ab82',
    );
    expect(deriveGeneration2CurrentState(basis, ledger)).toMatchObject({
      ledgerEntryCount: 2,
      generation2ReserveConsumed: 2,
      nextGeneration2ReservePosition: 2,
      q1: [],
      replacementAssignedAwaitingExecution: [75, 76],
    });
    for (const [slot, position] of [
      [75, 0],
      [76, 1],
    ] as const) {
      expect(resolveCrossGenerationOccupant(basis, ledger, slot)).toMatchObject({
        kind: 'GENERATION2_RESERVE_REPLACEMENT',
        generation2ReserveRankPosition: position,
      });
    }
  });

  it('current state: the Generation-2 P7 preflight holds 18/18 on the post-append ledger', () => {
    const basis = ASSESSMENT.basis!;
    const expectedWindowSpec = buildGeneration2WindowSpec({
      basis,
      startingLedger: basis.genesis,
      startingLedgerFile: {
        sha256: sha256(STARTING_LEDGER_TEXT),
        bytes: Buffer.byteLength(STARTING_LEDGER_TEXT, 'utf8'),
      },
      plannedWindowSize: FIRST_WINDOW_PLANNED_SIZE,
    });
    expect(expectedWindowSpec.windowSpecHash).toBe(AUTHORITY.boundWindowSpec.windowSpecHash);
    const result = computeGeneration2Preflight({
      committed: COMMITTED,
      currentLedgerText: LEDGER_TEXT,
      startingLedgerText: STARTING_LEDGER_TEXT,
      expectedWindowSpec,
    });
    expect(result.failures).toEqual([]);
    expect(GENERATION2_P7_INVARIANT_NAMES).toHaveLength(18);
    expect(GENERATION2_P7_INVARIANT_NAMES.filter((name) => !result.invariants[name])).toEqual([]);
    expect(result.currentLedgerEntryCount).toBe(2);
  });

  it('isolation: only the four historical tests, this test and the record changed', () => {
    const args =
      TERMINAL === null
        ? ['diff', '--name-status', '--no-renames', PRE_CORRECTION_HEAD]
        : ['diff', '--name-status', '--no-renames', PRE_CORRECTION_HEAD, TERMINAL];
    const listed = git(...args)
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [status, path] = line.split('\t');
        return { status: status!, path: path! };
      });
    const untracked =
      TERMINAL === null
        ? git('ls-files', '--others', '--exclude-standard')
            .split('\n')
            .filter(Boolean)
            .map((path) => ({ status: 'A', path }))
        : [];
    const changes = [...listed, ...untracked];
    for (const change of changes) {
      const allowed =
        (change.status === 'M' && HISTORICAL_TESTS.includes(change.path)) ||
        (change.status === 'A' && [RECORD_PATH, THIS_TEST].includes(change.path));
      expect({ ...change, allowed }).toEqual({ ...change, allowed: true });
    }
    expect(changes.map((change) => change.path)).toContain(RECORD_PATH);
    // The authority, the ledger and every frozen input are untouched.
    const range = TERMINAL === null ? [PRE_CORRECTION_HEAD] : [PRE_CORRECTION_HEAD, TERMINAL];
    for (const path of [AUTHORITY_PATH, LEDGER_PATH, 'src/orgunits', 'src/test/harness']) {
      expect(git('diff', '--name-only', ...range, '--', path), path).toBe('');
    }
  });
});
