/**
 * Phase 2B-2D A2 Generation 2: the PINNED WINDOW-04 AUTHORITY-SHAPE
 * CORRECTION - the proofs that the generic history bridge reads the committed
 * Window-04 authority's `boundLedger` as its `boundStartingLedger` ONLY
 * through the explicit, committed owner correction record, and never as a
 * fallback.
 *
 * Reads only committed bytes - at this task's own terminal commit (the one
 * that adds its closure audit) once it exists, else the working tree. Until
 * the Window-04 adjudication is committed, the replay is proved over an
 * IN-MEMORY adjudication built by the same pure builder. Opens no socket and
 * no database, writes no file, assigns no reserve and never mutates the
 * canonical Generation-2 ledger.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';
import { canonicalStringify } from '../../orgunits/classify/canonical.js';
import { COMMITTED_JSON_DIRECTORIES } from '../harness/phase2b2d/generation2Acquisition/materialiseReadiness.js';
import {
  GENERATION2_LEDGER_PATH,
  Generation2OperationalRefusal,
} from '../harness/phase2b2d/generation2Acquisition/operationalContract.js';
import { parseOperationalGeneration2Ledger } from '../harness/phase2b2d/generation2Acquisition/operationalLedger.js';
import {
  assessCommittedInputs,
  type CommittedTexts,
} from '../harness/phase2b2d/generation2Acquisition/state.js';
import {
  APPROVED_AUTHORITY_SHAPE_CORRECTIONS,
  historyBindingOf,
  replayGeneration2History,
  type CommittedRecordBinding,
  type Generation2AdjudicationHistory,
  type Generation2WindowHistoryBinding,
} from '../harness/phase2b2d/generation2History/adjudicationHistory.js';
import { assessAdjudicationHistoryIntegrity } from '../harness/phase2b2d/generation2History/historyIntegrity.js';
import {
  assessWindow04Closure,
  buildWindow04Adjudication,
  fourWindowHistory,
  type Window04ClosureInputs,
} from '../harness/phase2b2d/generation2Window04/window04Closure.js';
import {
  EXPECTED_WINDOW_04_CLOSURE,
  WINDOW04_ADJUDICATION_PATH,
  WINDOW04_CLOSURE_AUDIT_PATH,
  WINDOW04_OWNER_RULINGS,
  WINDOW04_PINS,
} from '../harness/phase2b2d/generation2Window04/window04ClosureContract.js';
import {
  GENESIS_REVISION_COMMIT,
  WINDOW04_W02_PINS,
  WINDOW04_W03_PINS,
} from '../harness/phase2b2d/generation2Window04/window04Contract.js';
import { threeWindowHistory } from '../harness/phase2b2d/generation2Window04/window04Readiness.js';

const REPO = resolve(import.meta.dirname, '../../..');
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const bytesOf = (text: string): number => Buffer.byteLength(text, 'utf8');
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function terminalCommit(): string | null {
  const commits = git('log', '--diff-filter=A', '--format=%H', '--', WINDOW04_CLOSURE_AUDIT_PATH)
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

const at = (commit: string): string => git('show', `${commit}:${GENERATION2_LEDGER_PATH}`);
const GENESIS_TEXT = at(GENESIS_REVISION_COMMIT);
const STARTS = [
  GENESIS_TEXT,
  at(WINDOW04_W02_PINS.startingLedgerRevisionCommit),
  at(WINDOW04_W03_PINS.startingLedgerRevisionCommit),
  at(WINDOW04_PINS.startingLedgerRevisionCommit),
] as const;
const CURRENT_TEXT = readState(GENERATION2_LEDGER_PATH);
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
const COMMITTED = committedState();
const INPUTS: Window04ClosureInputs = {
  committed: COMMITTED,
  currentLedgerText: CURRENT_TEXT,
  startingLedgerTexts: STARTS,
  authorityTextAtCommit: git(
    'show',
    `${WINDOW04_PINS.authority.commit}:${WINDOW04_PINS.authority.path}`,
  ),
};
const BASIS = assessCommittedInputs(COMMITTED).basis!;
const LEDGER = parseOperationalGeneration2Ledger(JSON.parse(CURRENT_TEXT), BASIS.genesis);

/** The committed Window-04 adjudication once it exists; until then the same builder, in memory. */
async function window04Adjudication(): Promise<CommittedRecordBinding> {
  const committed = COMMITTED.get(WINDOW04_ADJUDICATION_PATH);
  if (committed !== undefined) {
    return { path: WINDOW04_ADJUDICATION_PATH, sha256: sha256(committed), text: committed };
  }
  const record = buildWindow04Adjudication(INPUTS, {
    recordedAtUtc: '2026-09-29T00:00:00Z',
    postCorrectionValidation: {
      kind: 'POST_CORRECTION_REPOSITORY_SOFTWARE_INTEGRITY_VALIDATION',
      command: 'npm run validate',
      headValidated: '0'.repeat(40),
      worktreeCleanAtLaunch: true,
      startUtc: '2026-09-29T00:00:00Z',
      endUtc: '2026-09-29T00:00:00Z',
      exitCode: 0,
      testFiles: 'in-memory proof only',
      tests: 'in-memory proof only',
    },
  });
  const options = await resolveConfig(join(REPO, WINDOW04_ADJUDICATION_PATH));
  const text = await format(JSON.stringify(record, null, 2), {
    ...options,
    filepath: WINDOW04_ADJUDICATION_PATH,
    parser: 'json',
  });
  return { path: WINDOW04_ADJUDICATION_PATH, sha256: sha256(text), text };
}
const ADJUDICATION = await window04Adjudication();
const CORRECTED = fourWindowHistory(INPUTS, ADJUDICATION);
const UNCORRECTED = fourWindowHistory(INPUTS, ADJUDICATION, { withCorrection: false });
const [W01, W02, W03, W04] = CORRECTED.windows as [
  Generation2WindowHistoryBinding,
  Generation2WindowHistoryBinding,
  Generation2WindowHistoryBinding,
  Generation2WindowHistoryBinding,
];
const CORRECTION = W04.authorityShapeCorrection!;
const AUTHORITY = JSON.parse(W04.authority.text) as Json;
const CORRECTION_RECORD = JSON.parse(CORRECTION.record.text) as Json;

function refusal(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof Generation2OperationalRefusal) return error.code;
    throw error;
  }
  return 'NO_REFUSAL';
}
const replay = (history: Generation2AdjudicationHistory) =>
  refusal(() => replayGeneration2History(BASIS, LEDGER, history));

/** Serialise `value` at `path` and pin the binding to exactly those bytes. */
const seal = (path: string, value: unknown): CommittedRecordBinding => {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  return { path, sha256: sha256(text), text };
};
/** Window 04 with a mutated correction record, RE-SEALED so only its semantics can refuse. */
function withCorrection(
  mutate: (record: Json) => void,
  authorityCommit: string = CORRECTION.authorityCommit,
): Generation2AdjudicationHistory {
  const record = clone(CORRECTION_RECORD);
  mutate(record);
  return {
    windows: [
      W01,
      W02,
      W03,
      {
        ...W04,
        authorityShapeCorrection: {
          record: seal(CORRECTION.record.path, record),
          authorityCommit,
        },
      },
    ],
  };
}
/** Window 04 with a mutated AUTHORITY, re-sealed, and a correction re-bound to it. */
function withAuthority(
  mutate: (authority: Json) => void,
  rebindCorrection: (record: Json, authority: CommittedRecordBinding) => void = (
    record,
    authority,
  ) => {
    record.boundAuthority.sha256 = authority.sha256;
    record.boundAuthority.bytes = bytesOf(authority.text);
  },
): Generation2AdjudicationHistory {
  const authorityJson = clone(AUTHORITY);
  mutate(authorityJson);
  const authority = seal(W04.authority.path, authorityJson);
  const record = clone(CORRECTION_RECORD);
  rebindCorrection(record, authority);
  return {
    windows: [
      W01,
      W02,
      W03,
      {
        ...W04,
        authority,
        authorityShapeCorrection: {
          record: seal(CORRECTION.record.path, record),
          authorityCommit: CORRECTION.authorityCommit,
        },
      },
    ],
  };
}

describe('the committed records are the ones the window executed under, unedited', () => {
  it('the authority, LIVE_RESULT and stop audit are byte-identical to their original commits', () => {
    for (const pin of [
      WINDOW04_PINS.authority,
      WINDOW04_PINS.liveResult,
      WINDOW04_PINS.stopAudit,
    ]) {
      const original = git('show', `${pin.commit}:${pin.path}`);
      expect(sha256(original), pin.path).toBe(pin.sha256);
      expect(readState(pin.path), pin.path).toBe(original);
      expect(git('log', '--format=%H', '--', pin.path).trim(), pin.path).toBe(pin.commit);
    }
  });

  it('the authority carries boundLedger (the correct 5-entry revision) and NO boundStartingLedger', () => {
    expect(Object.hasOwn(AUTHORITY, 'boundStartingLedger')).toBe(false);
    expect(AUTHORITY.boundLedger).toMatchObject({
      fileSha256: WINDOW04_PINS.startingLedgerFileSha256,
      bytes: bytesOf(STARTS[3]),
      ledgerHash: EXPECTED_WINDOW_04_CLOSURE.currentState.ledgerHash,
      entryCount: 5,
    });
    expect(AUTHORITY.windowOrdinal).toBe(4);
    expect(AUTHORITY.exactOrder).toEqual(['G2P:87', 'G2P:88', 'G2P:89', 'G2P:90', 'G2P:91']);
    expect(AUTHORITY.boundWindowSpec.windowSpecHash).toBe(WINDOW04_PINS.windowSpecHash);
  });

  it('the owner correction record is pinned, binds the exact authority and authorises nothing', () => {
    expect(CORRECTION.record.sha256).toBe(WINDOW04_PINS.correction.sha256);
    expect(git('log', '--format=%H', '--', WINDOW04_PINS.correction.path).trim()).toBe(
      WINDOW04_PINS.correction.commit,
    );
    expect(CORRECTION_RECORD.boundAuthority).toMatchObject({
      path: WINDOW04_PINS.authority.path,
      commit: WINDOW04_PINS.authority.commit,
      sha256: WINDOW04_PINS.authority.sha256,
      bytes: bytesOf(W04.authority.text),
    });
    expect(CORRECTION_RECORD.ownerRulings).toEqual(Object.values(WINDOW04_OWNER_RULINGS));
    expect(CORRECTION_RECORD.authorityShapeCorrection).toEqual({
      ownerRuling: WINDOW04_OWNER_RULINGS.authorityShapeCorrection,
      sourceField: 'boundLedger',
      canonicalField: 'boundStartingLedger',
      sourceValueCanonicalSha256: sha256(canonicalStringify(AUTHORITY.boundLedger)),
      valuesAltered: false,
      otherFieldsRemapped: false,
      originalBytesRemainAuthoritative: true,
      scope: 'EXACT_PINNED_WINDOW_04_AUTHORITY_ONLY',
    });
    for (const flag of [
      'networkAuthorised',
      'acquisitionAuthorised',
      'databaseAuthorised',
      'ledgerMutationAuthorised',
      'reserveAssignmentAuthorised',
      'window05Authorised',
      'isLiveAuthority',
    ]) {
      expect(CORRECTION_RECORD[flag], flag).toBe(false);
    }
    expect(CORRECTION_RECORD.thisFileAuthorises).toEqual([]);
  });

  it('exactly one correction is approved, pinned to the Window-04 authority', () => {
    expect(APPROVED_AUTHORITY_SHAPE_CORRECTIONS).toEqual([
      {
        ownerRuling: WINDOW04_OWNER_RULINGS.authorityShapeCorrection,
        windowOrdinal: 4,
        authoritySha256: WINDOW04_PINS.authority.sha256,
        sourceField: 'boundLedger',
        canonicalField: 'boundStartingLedger',
      },
    ]);
  });
});

describe('the ORIGINAL defect still refuses: there is no generic fallback', () => {
  it('the four-window history WITHOUT the correction refuses at the record shape', () => {
    expect(replay(UNCORRECTED)).toBe('HISTORY_RECORD_SHAPE');
    const integrity = assessAdjudicationHistoryIntegrity(BASIS, LEDGER, UNCORRECTED);
    expect(integrity.holds).toBe(false);
    expect(integrity.failures).toEqual([
      'REFUSED HISTORY_RECORD_SHAPE: boundStartingLedger is not an object',
    ]);
  });

  it('an unrelated authority carrying only boundLedger is refused without a correction', () => {
    const authority = clone(JSON.parse(W03.authority.text) as Json);
    authority.boundLedger = authority.boundStartingLedger;
    delete authority.boundStartingLedger;
    const renamed = { ...W03, authority: seal(W03.authority.path, authority) };
    expect(replay({ windows: [W01, W02, renamed] })).toBe('HISTORY_RECORD_SHAPE');
  });

  it('a future authority (Window 05) carrying only boundLedger is refused, with or without a forged correction', () => {
    const authority = clone(AUTHORITY);
    authority.windowOrdinal = 5;
    const sealed = seal('synthetic/window-05-authority.json', authority);
    const w05: Generation2WindowHistoryBinding = {
      windowOrdinal: 5,
      authority: sealed,
      liveResult: W04.liveResult,
      adjudication: W04.adjudication,
      startingLedgerText: W04.startingLedgerText,
    };
    expect(replay({ windows: [W01, W02, W03, W04, w05] })).toBe('HISTORY_RECORD_SHAPE');
    const record = clone(CORRECTION_RECORD);
    record.windowOrdinal = 5;
    record.authorityShapeCorrection.scope = 'EXACT_PINNED_WINDOW_05_AUTHORITY_ONLY';
    record.boundAuthority = {
      ...record.boundAuthority,
      path: sealed.path,
      sha256: sealed.sha256,
      bytes: bytesOf(sealed.text),
    };
    const forged: Generation2WindowHistoryBinding = {
      ...w05,
      authorityShapeCorrection: {
        record: seal(CORRECTION.record.path, record),
        authorityCommit: CORRECTION.authorityCommit,
      },
    };
    // Every structural binding holds; the approval is pinned to Window 04's exact authority.
    expect(replay({ windows: [W01, W02, W03, W04, forged] })).toBe(
      'HISTORY_AUTHORITY_SHAPE_CORRECTION_NOT_APPROVED',
    );
  });
});

describe('the APPROVED correction, supplied explicitly with Window 04', () => {
  const closure = assessWindow04Closure(INPUTS, ADJUDICATION);

  it('ADJUDICATION_HISTORY_INTEGRITY holds over Window 01 -> 02 -> 03 -> 04', () => {
    expect(closure.integrity.holds).toBe(true);
    expect(closure.integrity.failures).toEqual([]);
    expect(closure.integrity.windowCount).toBe(4);
    expect(CORRECTED.windows.map((window) => window.windowOrdinal)).toEqual([1, 2, 3, 4]);
  });

  it('all four specs rebuild to their exact authority-bound hashes', () => {
    expect(closure.integrity.rebuiltWindowSpecHashes).toEqual(
      EXPECTED_WINDOW_04_CLOSURE.rebuiltWindowSpecHashes,
    );
    expect(closure.authorityBoundSpecHashes).toEqual(
      EXPECTED_WINDOW_04_CLOSURE.rebuiltWindowSpecHashes,
    );
  });

  it('20 historical run references, all globally unique', () => {
    const refs = closure.integrity.historicalRunReferences;
    expect(refs).toHaveLength(EXPECTED_WINDOW_04_CLOSURE.historicalRunReferenceCount);
    expect(new Set(refs).size).toBe(20);
  });

  it('the replay reads the exact boundLedger object and records the correction on Window 04 only', () => {
    const window = closure.integrity.replay!.windows[3]!;
    expect(window.startingLedger).toEqual({
      fileSha256: AUTHORITY.boundLedger.fileSha256,
      ledgerHash: AUTHORITY.boundLedger.ledgerHash,
      entryCount: AUTHORITY.boundLedger.entryCount,
    });
    expect(closure.historyBinding.windows.map((w) => 'authorityShapeCorrection' in w)).toEqual([
      false,
      false,
      false,
      true,
    ]);
    expect(window.authorityShapeCorrection).toEqual({
      path: WINDOW04_PINS.correction.path,
      sha256: WINDOW04_PINS.correction.sha256,
    });
    // The parsed authority is never mutated into the canonical shape.
    expect(Object.hasOwn(JSON.parse(W04.authority.text) as Json, 'boundStartingLedger')).toBe(
      false,
    );
  });

  it('every Window-04 verdict is derived, not asserted', () => {
    const adjudication = JSON.parse(ADJUDICATION.text) as Json;
    expect(
      (adjudication.items as Json[]).map((item) => [
        item.workItemId,
        item.adjudication.verdict,
        item.adjudication.q3Reason,
      ]),
    ).toEqual(EXPECTED_WINDOW_04_CLOSURE.window04Outcomes);
    const g2p90 = (adjudication.items as Json[]).find((item) => item.workItemId === 'G2P:90')!;
    expect(g2p90.bridge.postSd7Range).toEqual([4, 4]);
  });

  it('derives 92 / 110 with Q1 empty and reserve 5 unassigned', () => {
    const want = EXPECTED_WINDOW_04_CLOSURE.currentState;
    const state = closure.state;
    expect(state.successfulOrganisationCount).toBe(want.successful);
    expect(state.currentAcquisitionFailure).toEqual(want.failures);
    expect(state.replacementAssignedAwaitingExecution).toEqual(want.assigned);
    expect(state.pendingCapabilityReview).toEqual(want.pending);
    expect(state.carryForwardRefused).toEqual(want.refused);
    expect(state.q1).toEqual(want.q1);
    expect(state.neverStarted[0]).toBe(want.neverStarted.from);
    expect(state.neverStarted.at(-1)).toBe(want.neverStarted.to);
    expect(state.neverStarted).toHaveLength(want.neverStarted.count);
    expect(state.ledgerEntryCount).toBe(want.ledgerEntryCount);
    expect(state.ledgerHash).toBe(want.ledgerHash);
    expect(state.nextGeneration2ReservePosition).toBe(want.nextGeneration2Reserve);
    expect(state.accounting).toBe(want.accounting);
  });
});

describe('negative correction attacks (re-sealed, so semantics - not a stale hash - refuse)', () => {
  it('a tampered correction record that was not re-hashed', () => {
    const history = {
      windows: [
        W01,
        W02,
        W03,
        {
          ...W04,
          authorityShapeCorrection: {
            ...CORRECTION,
            record: { ...CORRECTION.record, text: CORRECTION.record.text.replace('false', 'true') },
          },
        },
      ],
    };
    expect(replay(history)).toBe('HISTORY_RECORD_NOT_PINNED');
  });

  it.each([
    [
      'wrong authority SHA-256',
      (r: Json) => {
        r.boundAuthority.sha256 = 'f'.repeat(64);
      },
    ],
    [
      'wrong authority path',
      (r: Json) => {
        r.boundAuthority.path = WINDOW04_W03_PINS.authority.path;
      },
    ],
    [
      'wrong authority commit',
      (r: Json) => {
        r.boundAuthority.commit = WINDOW04_PINS.liveResult.commit;
      },
    ],
    [
      'another window spec hash',
      (r: Json) => {
        r.boundWindowSpecHash = WINDOW04_W03_PINS.authority.sha256;
      },
    ],
  ])('%s', (_name, mutate) => {
    expect(replay(withCorrection(mutate))).toBe(
      'HISTORY_AUTHORITY_SHAPE_CORRECTION_NOT_FOR_THIS_AUTHORITY',
    );
  });

  it('a caller naming another authority commit than the record binds', () => {
    expect(replay(withCorrection(() => undefined, WINDOW04_PINS.liveResult.commit))).toBe(
      'HISTORY_AUTHORITY_SHAPE_CORRECTION_NOT_FOR_THIS_AUTHORITY',
    );
  });

  it.each([
    [
      'wrong window ordinal',
      (r: Json) => {
        r.windowOrdinal = 3;
      },
    ],
    [
      'wrong generation',
      (r: Json) => {
        r.generationId = 'METHODOLOGY_V3_GEN1';
      },
    ],
    [
      'wrong record kind',
      (r: Json) => {
        r.recordKind = 'GENERATION2_OWNER_LIVE_AUTHORITY';
      },
    ],
  ])('%s', (_name, mutate) => {
    expect(replay(withCorrection(mutate))).toBe('HISTORY_AUTHORITY_SHAPE_CORRECTION_KIND');
  });

  it.each([
    ['networkAuthorised', true],
    ['window05Authorised', true],
    ['reserveAssignmentAuthorised', true],
    ['ledgerMutationAuthorised', true],
    ['isLiveAuthority', true],
    ['thisFileAuthorises', ['G2P:92']],
  ])('the correction grants %s', (field, value) => {
    expect(
      replay(
        withCorrection((r) => {
          r[field] = value;
        }),
      ),
    ).toBe('HISTORY_AUTHORITY_SHAPE_CORRECTION_GRANTS_AUTHORITY');
  });

  it.each([
    [
      'alias source changed',
      (r: Json) => {
        r.authorityShapeCorrection.sourceField = 'boundAdjudicationHistory';
      },
    ],
    [
      'alias target changed',
      (r: Json) => {
        r.authorityShapeCorrection.canonicalField = 'boundWindowSpec';
      },
    ],
    [
      'another ruling token',
      (r: Json) => {
        r.authorityShapeCorrection.ownerRuling = 'APPROVE_ANY_FIELD_ALIAS_V1';
      },
    ],
    [
      'the ruling missing from ownerRulings',
      (r: Json) => {
        r.ownerRulings = r.ownerRulings.slice(1);
      },
    ],
    [
      'values declared altered',
      (r: Json) => {
        r.authorityShapeCorrection.valuesAltered = true;
      },
    ],
    [
      'other fields declared remapped',
      (r: Json) => {
        r.authorityShapeCorrection.otherFieldsRemapped = true;
      },
    ],
    [
      'a broader scope',
      (r: Json) => {
        r.authorityShapeCorrection.scope = 'ALL_GENERATION2_AUTHORITIES';
      },
    ],
    [
      'an extra mapping in the correction block',
      (r: Json) => {
        r.authorityShapeCorrection.extraMapping = { exactOrder: 'authorisedWorkItems' };
      },
    ],
    [
      'a ledger value override',
      (r: Json) => {
        r.boundStartingLedger = { ...r.boundCurrentLedger, entryCount: 6 };
      },
    ],
    [
      'an authorised-work-item override',
      (r: Json) => {
        r.authorisedWorkItems = [];
      },
    ],
    [
      'a windowSpecHash override',
      (r: Json) => {
        r.windowSpecHash = 'f'.repeat(64);
      },
    ],
    [
      'a live-invocation-limit override',
      (r: Json) => {
        r.maximumLiveInvocations = 10;
      },
    ],
    [
      'a validation override',
      (r: Json) => {
        r.validation = { exitCode: 0, result: 'WINDOW_04_VALIDATION_ACCEPTED' };
      },
    ],
  ])('%s', (_name, mutate) => {
    expect(replay(withCorrection(mutate))).toBe('HISTORY_AUTHORITY_SHAPE_CORRECTION_NOT_APPROVED');
  });

  it("the authority's boundLedger value modified (re-sealed, correction re-bound)", () => {
    const history = withAuthority((authority) => {
      authority.boundLedger.entryCount = 4;
    });
    // Re-bound by bytes, the approval is pinned to the original authority hash.
    expect(replay(history)).toBe('HISTORY_AUTHORITY_SHAPE_CORRECTION_NOT_APPROVED');
  });

  it('the modified value is refused by the pinned value hash on its own', () => {
    const correction = clone(CORRECTION_RECORD);
    correction.authorityShapeCorrection.sourceValueCanonicalSha256 = sha256(
      canonicalStringify({ ...AUTHORITY.boundLedger, entryCount: 4 }),
    );
    expect(
      replay(
        withCorrection((r) => {
          r.authorityShapeCorrection = correction.authorityShapeCorrection;
        }),
      ),
    ).toBe('HISTORY_AUTHORITY_SHAPE_CORRECTION_VALUE_MISMATCH');
  });

  it('the correction reused for Window 03', () => {
    const history = {
      windows: [W01, W02, { ...W03, authorityShapeCorrection: CORRECTION }],
    };
    expect(replay(history)).toBe('HISTORY_AUTHORITY_SHAPE_CORRECTION_KIND');
  });

  it('the correction reused for another synthetic Window-04 authority', () => {
    const history = withAuthority(
      (authority) => {
        authority.recordedAtUtc = '2026-09-29T12:00:00Z';
      },
      () => undefined,
    );
    expect(replay(history)).toBe('HISTORY_AUTHORITY_SHAPE_CORRECTION_NOT_FOR_THIS_AUTHORITY');
  });

  it('a forged record re-bound to another synthetic Window-04 authority is still not approved', () => {
    const history = withAuthority((authority) => {
      authority.recordedAtUtc = '2026-09-29T12:00:00Z';
    });
    expect(replay(history)).toBe('HISTORY_AUTHORITY_SHAPE_CORRECTION_NOT_APPROVED');
  });

  it('an authority carrying BOTH fields, conflicting, is refused without a correction', () => {
    const authority = clone(JSON.parse(W03.authority.text) as Json);
    authority.boundLedger = { ...authority.boundStartingLedger, entryCount: 99 };
    const history = {
      windows: [W01, W02, { ...W03, authority: seal(W03.authority.path, authority) }],
    };
    expect(replay(history)).toBe('HISTORY_AUTHORITY_SHAPE_CONFLICT');
  });

  it('a correction is never consulted for an authority carrying the canonical field', () => {
    const history = withAuthority(
      (authority) => {
        authority.boundStartingLedger = authority.boundLedger;
      },
      (record, authority) => {
        record.boundAuthority.sha256 = authority.sha256;
        record.boundAuthority.bytes = bytesOf(authority.text);
      },
    );
    // Refused before applicability: the approval is pinned to the original bytes.
    expect(replay(history)).toBe('HISTORY_AUTHORITY_SHAPE_CORRECTION_NOT_APPROVED');
  });
});

describe('Windows 01-03 are unchanged by the correction machinery', () => {
  const history = threeWindowHistory(COMMITTED, [STARTS[0], STARTS[1], STARTS[2]]);

  it('need no correction binding and replay exactly as before', () => {
    expect(history.windows.every((window) => window.authorityShapeCorrection === undefined)).toBe(
      true,
    );
    for (const window of history.windows) {
      const authority = JSON.parse(window.authority.text) as Json;
      expect(Object.hasOwn(authority, 'boundStartingLedger')).toBe(true);
      expect(Object.hasOwn(authority, 'boundLedger')).toBe(false);
    }
    const integrity = assessAdjudicationHistoryIntegrity(BASIS, LEDGER, history);
    expect(integrity.holds).toBe(true);
    expect(integrity.historicalRunReferences).toHaveLength(15);
    expect(new Set(integrity.historicalRunReferences).size).toBe(15);
    expect(integrity.rebuiltWindowSpecHashes).toEqual(
      EXPECTED_WINDOW_04_CLOSURE.rebuiltWindowSpecHashes.slice(0, 3),
    );
  });

  it('their replayed bindings carry no correction key and equal the four-window prefix', () => {
    const three = historyBindingOf(replayGeneration2History(BASIS, LEDGER, history));
    const four = historyBindingOf(replayGeneration2History(BASIS, LEDGER, CORRECTED));
    expect(three.windows.some((window) => 'authorityShapeCorrection' in window)).toBe(false);
    expect(four.windows.slice(0, 3)).toEqual(three.windows);
  });
});
