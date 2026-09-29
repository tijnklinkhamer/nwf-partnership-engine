/**
 * Generation-2 post-Window-06 hardening: the reusable LIVE_RESULT contract
 * (validateGeneration2LiveResultForHistory), which the generic history replay
 * itself calls. Every committed byte is read at a pinned commit through
 * `git show` / `git ls-tree`; nothing is discovered (no scan, no glob, no
 * "latest") and nothing depends on the moving HEAD except the isolation
 * block, which is bounded to this task's own terminal commit.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
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
  bySplitOf,
  replayGeneration2History,
  validateGeneration2LiveResultForHistory,
  type CommittedRecordBinding,
  type Generation2AdjudicationHistory,
  type Generation2LiveResultExpectation,
  type Generation2WindowHistoryBinding,
  type ReplayedWindow,
} from '../harness/phase2b2d/generation2History/adjudicationHistory.js';
import { assessAdjudicationHistoryIntegrity } from '../harness/phase2b2d/generation2History/historyIntegrity.js';
import {
  GENESIS_REVISION_COMMIT,
  WINDOW06_W02_PINS,
  WINDOW06_W02_VALIDATION_CHAIN,
  WINDOW06_W03_PINS,
  WINDOW06_W04_PINS,
  WINDOW06_W05_PINS,
  WINDOW06_W05_RECORD_PINS,
} from '../harness/phase2b2d/generation2Window06/window06Contract.js';
import {
  fiveWindowHistoryForWindow06,
  type Window06Inputs,
} from '../harness/phase2b2d/generation2Window06/window06Readiness.js';

const REPO = resolve(import.meta.dirname, '../../..');
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const show = (commit: string, path: string): string => git('show', `${commit}:${path}`);
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// ---------------------------------------------------------------------------
// Pins: the canonical start of this hardening pass and the Window-06 records.
// ---------------------------------------------------------------------------

/** The Window-06 adjudication commit: the canonical start of this hardening pass. */
const HARDENING_STARTING_HEAD = '47389c54b98aa1088a1e686f3592280e22046308';
const HARDENING_RECORD_PATH =
  'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_POST_WINDOW_06_HARDENING_V1.json';
const W06 = 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_06_';
const W06_PINS = {
  authority: {
    path: `${W06}LIVE_AUTHORITY_V1.json`,
    commit: 'c3f6c223de48625976f52da1ce110133f0d01afb',
  },
  liveResultV1: {
    path: `${W06}LIVE_RESULT_V1.json`,
    commit: '2b831d67ea973e4dfd30a9ab6b1f68d29ef4602e',
  },
  liveResultV2: {
    path: `${W06}LIVE_RESULT_V2.json`,
    commit: 'f7ad412ce774d42d2060d79b38492e7c41353d79',
  },
  liveResultV3: {
    path: `${W06}LIVE_RESULT_V3.json`,
    commit: '3905bc27a3a54bb425d91813ed6e6e641d283d0c',
  },
  adjudication: { path: `${W06}EVIDENCE_ADJUDICATION_V1.json`, commit: HARDENING_STARTING_HEAD },
  /** The five-entry revision Window 06 was precommitted against. */
  startingLedgerCommit: 'df3dddde6d9365da436e64c67e3b044df2f2cc42',
  /** The seven-entry revision after the Window-06 pre-network append. */
  ledgerCommit: 'f3c02276b91ab2daa06763c2ae30c9c601c6cf35',
} as const;
const LEDGER_HASH = '02ab72faa20ce846df8ac40cd21f62f8814fa0e1e56d1b990b234ca5c814b65e';

const bindingAt = (pin: { path: string; commit: string }): CommittedRecordBinding => {
  const text = show(pin.commit, pin.path);
  return { path: pin.path, sha256: sha256(text), text };
};

// ---------------------------------------------------------------------------
// The explicit six-window history, every byte read at a pinned commit.
// ---------------------------------------------------------------------------

function committedAt(commit: string): CommittedTexts {
  const committed = new Map<string, string>();
  for (const dir of COMMITTED_JSON_DIRECTORIES) {
    for (const name of git('ls-tree', '--name-only', `${commit}:${dir}`).split('\n')) {
      if (name.endsWith('.json')) committed.set(`${dir}/${name}`, show(commit, `${dir}/${name}`));
    }
  }
  committed.set(GENERATION2_LEDGER_PATH, show(GENESIS_REVISION_COMMIT, GENERATION2_LEDGER_PATH));
  return committed;
}
const COMMITTED = committedAt(HARDENING_STARTING_HEAD);
const BASIS = assessCommittedInputs(COMMITTED).basis!;
const LEDGER5_TEXT = show(W06_PINS.startingLedgerCommit, GENERATION2_LEDGER_PATH);
const LEDGER7 = parseOperationalGeneration2Ledger(
  JSON.parse(show(W06_PINS.ledgerCommit, GENERATION2_LEDGER_PATH)),
  BASIS.genesis,
);
const INPUTS: Window06Inputs = {
  committed: COMMITTED,
  currentLedgerText: LEDGER5_TEXT,
  startingLedgerTexts: [
    show(GENESIS_REVISION_COMMIT, GENERATION2_LEDGER_PATH),
    show(WINDOW06_W02_PINS.startingLedgerRevisionCommit, GENERATION2_LEDGER_PATH),
    show(WINDOW06_W03_PINS.startingLedgerRevisionCommit, GENERATION2_LEDGER_PATH),
    show(WINDOW06_W04_PINS.startingLedgerRevisionCommit, GENERATION2_LEDGER_PATH),
  ],
  window04AuthorityTextAtCommit: show(
    WINDOW06_W04_PINS.authority.commit,
    WINDOW06_W04_PINS.authority.path,
  ),
  window05TextsAtCommit: new Map(
    WINDOW06_W05_RECORD_PINS.map((pin) => [pin.path, show(pin.commit, pin.path)] as const),
  ),
  auditTexts: new Map(
    [WINDOW06_W02_VALIDATION_CHAIN.stopAudit, WINDOW06_W02_VALIDATION_CHAIN.closureAudit].map(
      (pin) => [pin.path, show(pin.commit, pin.path)] as const,
    ),
  ),
};
const W06_AUTHORITY = bindingAt(W06_PINS.authority);
const W06_V1 = bindingAt(W06_PINS.liveResultV1);
const W06_V2 = bindingAt(W06_PINS.liveResultV2);
const W06_V3 = bindingAt(W06_PINS.liveResultV3);
const W06_BINDING: Generation2WindowHistoryBinding = {
  windowOrdinal: 6,
  authority: W06_AUTHORITY,
  liveResult: W06_V3,
  adjudication: bindingAt(W06_PINS.adjudication),
  startingLedgerText: LEDGER5_TEXT,
};
const HISTORY: Generation2AdjudicationHistory = {
  windows: [...fiveWindowHistoryForWindow06(INPUTS).windows, W06_BINDING],
};
const REPLAY = replayGeneration2History(BASIS, LEDGER7, HISTORY);

/** The expectation, from the authority and the replayed ledger - never from the LIVE_RESULT. */
function expectationFor(
  binding: Generation2WindowHistoryBinding,
  replayed: ReplayedWindow,
): Generation2LiveResultExpectation {
  const authority = JSON.parse(binding.authority.text) as Json;
  return {
    windowOrdinal: binding.windowOrdinal,
    authority: binding.authority,
    windowSpecHash: authority.boundWindowSpec.windowSpecHash,
    authorisedWorkItems: authority.authorisedWorkItems,
    exactOrder: authority.exactOrder,
    ledgerHash: replayed.ledgerHashAfterAppend,
    ledgerEntryCount: replayed.startingLedger.entryCount + replayed.consumedLedgerSequences.length,
  };
}
const W06_EXPECTATION = expectationFor(W06_BINDING, REPLAY.windows[5]!);

// ---------------------------------------------------------------------------
// Refusal helpers.
// ---------------------------------------------------------------------------

/** The refusal code; any other throwable (a raw TypeError, a canonicalizer error) is re-thrown. */
function refusal(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof Generation2OperationalRefusal) return error.code;
    throw error;
  }
  return 'NO_REFUSAL';
}
const reseal = (path: string, record: Json): CommittedRecordBinding => {
  const text = `${JSON.stringify(record, null, 2)}\n`;
  return { path, sha256: sha256(text), text };
};
const contract = (live: CommittedRecordBinding, expected = W06_EXPECTATION): string =>
  refusal(() => validateGeneration2LiveResultForHistory(live, expected));
/** The same LIVE_RESULT substituted into the six-window replay. */
const replayWith = (live: CommittedRecordBinding): string =>
  refusal(() =>
    replayGeneration2History(BASIS, LEDGER7, {
      windows: [...HISTORY.windows.slice(0, 5), { ...W06_BINDING, liveResult: live }],
    }),
  );
const V3 = JSON.parse(W06_V3.text) as Json;
const mutated = (mutate: (record: Json) => void): CommittedRecordBinding => {
  const record = clone(V3);
  mutate(record);
  return reseal(W06_V3.path, record);
};

// ---------------------------------------------------------------------------
// The canonical state the contract is exercised over.
// ---------------------------------------------------------------------------

describe('Generation-2 LIVE_RESULT contract: the canonical six-window history', () => {
  it('replays Windows 01..06 explicitly to the adjudicated post-Window-06 state', () => {
    const integrity = assessAdjudicationHistoryIntegrity(BASIS, LEDGER7, HISTORY);
    expect(integrity.failures).toEqual([]);
    expect(integrity.holds).toBe(true);
    expect(integrity.historicalRunReferences).toHaveLength(30);
    expect(new Set(integrity.historicalRunReferences).size).toBe(30);
    expect(REPLAY.windows.map((w) => w.windowOrdinal)).toEqual([1, 2, 3, 4, 5, 6]);
    const final = REPLAY.final;
    expect(final.acquisitionSuccessful).toHaveLength(98);
    expect(bySplitOf(BASIS, final.acquisitionSuccessful)).toEqual({
      DEV_TRAIN: 18,
      DEV_CONFIRM: 40,
      FINAL_HOLDOUT: 40,
    });
    expect(final.currentAcquisitionFailure).toEqual([96, 99]);
    expect(final.failureReasons).toEqual([
      { selectionIndex: 96, reason: 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE' },
      { selectionIndex: 99, reason: 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE' },
    ]);
    expect(final.replacementAssignedAwaitingExecution).toEqual([]);
    expect(final.neverStarted).toEqual(Array.from({ length: 10 }, (_, k) => 100 + k));
    expect(LEDGER7.entries).toHaveLength(7);
    expect(LEDGER7.ledgerHash).toBe(LEDGER_HASH);
  });
});

describe('Generation-2 LIVE_RESULT contract: canonical adjudicated LIVE_RESULTs 01..06', () => {
  const CANONICAL = [
    [1, 'PHASE_2B_2D_A2_GENERATION2_WINDOW_01_LIVE_RESULT_V1.json'],
    [2, 'PHASE_2B_2D_A2_GENERATION2_WINDOW_02_LIVE_RESULT_V1.json'],
    [3, 'PHASE_2B_2D_A2_GENERATION2_WINDOW_03_LIVE_RESULT_V1.json'],
    [4, 'PHASE_2B_2D_A2_GENERATION2_WINDOW_04_LIVE_RESULT_V1.json'],
    [5, 'PHASE_2B_2D_A2_GENERATION2_WINDOW_05_LIVE_RESULT_V2.json'],
    [6, 'PHASE_2B_2D_A2_GENERATION2_WINDOW_06_LIVE_RESULT_V3.json'],
  ] as const;

  for (const [ordinal, name] of CANONICAL) {
    it(`Window ${String(ordinal).padStart(2, '0')}: ${name} passes the contract`, () => {
      const binding = HISTORY.windows[ordinal - 1]!;
      expect(binding.windowOrdinal).toBe(ordinal);
      expect(binding.liveResult.path).toBe(`docs/evaluation/${name}`);
      const items = validateGeneration2LiveResultForHistory(
        binding.liveResult,
        expectationFor(binding, REPLAY.windows[ordinal - 1]!),
      );
      expect(items).toHaveLength(5);
      expect(items.map((item) => item.runRefSha256)).toEqual(
        REPLAY.windows[ordinal - 1]!.executed.map((e) => e.runRefSha256),
      );
    });
  }

  it('Window 05 V1 does not become canonical: it lacks boundAuthority.bytes and is refused', () => {
    const w05 = HISTORY.windows[4]!;
    expect(w05.liveResult.path).toBe(WINDOW06_W05_PINS.liveResult.path);
    const v1 = bindingAt(WINDOW06_W05_PINS.liveResultV1);
    expect((JSON.parse(v1.text) as Json).boundAuthority.bytes).toBeUndefined();
    expect(
      refusal(() =>
        validateGeneration2LiveResultForHistory(v1, expectationFor(w05, REPLAY.windows[4]!)),
      ),
    ).toBe('HISTORY_LIVE_RESULT_AUTHORITY');
  });

  it('Window 06 V1 and V2 stay historical provenance; only V3 is the canonical binding', () => {
    expect(HISTORY.windows[5]!.liveResult.sha256).toBe(W06_V3.sha256);
    expect(contract(W06_V3)).toBe('NO_REFUSAL');
    expect(contract(W06_V2)).toBe('HISTORY_RECORD_SHAPE');
    expect(contract(W06_V1)).toBe('HISTORY_RECORD_SHAPE');
  });
});

describe('Generation-2 LIVE_RESULT contract: the Window-06 V2 regression', () => {
  it('a missing top-level stops.itemsNotStarted is a deterministic HISTORY_RECORD_SHAPE refusal', () => {
    const v2 = JSON.parse(W06_V2.text) as Json;
    expect(v2.stops.itemsNotStarted).toBeUndefined();
    const errors: unknown[] = [];
    for (let k = 0; k < 3; k += 1) {
      try {
        validateGeneration2LiveResultForHistory(W06_V2, W06_EXPECTATION);
      } catch (error) {
        errors.push(error);
      }
    }
    expect(errors).toHaveLength(3);
    for (const error of errors) {
      expect(error).toBeInstanceOf(Generation2OperationalRefusal);
      expect(error).not.toBeInstanceOf(TypeError);
      expect((error as Generation2OperationalRefusal).code).toBe('HISTORY_RECORD_SHAPE');
      expect((error as Error).message).not.toMatch(/canonicalStringify/);
      expect((error as Error).message).toMatch(/stops\.itemsNotStarted/);
    }
  });

  it('the generic replay refuses Window-06 V2 the same way and accepts V3', () => {
    expect(replayWith(W06_V2)).toBe('HISTORY_RECORD_SHAPE');
    expect(replayWith(W06_V3)).toBe('NO_REFUSAL');
  });
});

describe('Generation-2 LIVE_RESULT contract: negative matrix (resealed, so semantics are reached)', () => {
  const CASES: [string, (record: Json) => void, string][] = [
    [
      'missing boundAuthority.bytes',
      (r) => delete r.boundAuthority.bytes,
      'HISTORY_LIVE_RESULT_AUTHORITY',
    ],
    [
      'wrong boundAuthority.bytes',
      (r) => (r.boundAuthority.bytes += 1),
      'HISTORY_LIVE_RESULT_AUTHORITY',
    ],
    [
      'missing top-level stops.itemsNotStarted',
      (r) => delete r.stops.itemsNotStarted,
      'HISTORY_RECORD_SHAPE',
    ],
    [
      'non-array stops.itemsNotStarted',
      (r) => (r.stops.itemsNotStarted = 'none'),
      'HISTORY_RECORD_SHAPE',
    ],
    [
      'non-string stops.itemsNotStarted entry',
      (r) => (r.stops.itemsNotStarted = [100]),
      'HISTORY_RECORD_SHAPE',
    ],
    [
      'wrong unstarted suffix',
      (r) => (r.stops.itemsNotStarted = ['G2P:100']),
      'HISTORY_LIVE_RESULT_ITEMS',
    ],
    [
      'executed item not an authority-prefix item',
      (r) => {
        r.items = r.items.slice(1);
        r.liveInvocations.used = 4;
      },
      'HISTORY_UNAUTHORISED_ITEM',
    ],
    [
      'reordered executed items',
      (r) => ([r.items[0], r.items[1]] = [r.items[1], r.items[0]]),
      'HISTORY_UNAUTHORISED_ITEM',
    ],
    ['duplicated work item', (r) => (r.items[1] = clone(r.items[0])), 'HISTORY_LIVE_RESULT_ITEMS'],
    [
      'liveInvocations.used mismatch',
      (r) => (r.liveInvocations.used = 4),
      'HISTORY_LIVE_RESULT_ITEMS',
    ],
    ['nonzero retry count', (r) => (r.liveInvocations.retries = 1), 'HISTORY_LIVE_RESULT_ITEMS'],
    [
      'duplicate run reference inside the window',
      (r) => (r.items[1].runRefSha256 = r.items[0].runRefSha256),
      'HISTORY_LIVE_RESULT_ITEMS',
    ],
    [
      'malformed run reference',
      (r) => (r.items[0].runRefSha256 = 'abc123'),
      'HISTORY_LIVE_RESULT_ITEMS',
    ],
    ['non-string run reference', (r) => (r.items[0].runRefSha256 = 7), 'HISTORY_RECORD_SHAPE'],
    [
      'wrong windowSpecHash',
      (r) => (r.windowSpecHash = '0'.repeat(64)),
      'HISTORY_LIVE_RESULT_AUTHORITY',
    ],
    [
      'wrong ledgerHash',
      (r) => (r.ledgerDuringTheWindow.ledgerHash = '0'.repeat(64)),
      'HISTORY_LEDGER_NOT_A_PREFIX',
    ],
    [
      'wrong ledger entryCount',
      (r) => (r.ledgerDuringTheWindow.entryCount = 6),
      'HISTORY_LEDGER_NOT_A_PREFIX',
    ],
    [
      'absent executed-item identity field',
      (r) => delete r.items[0].identityDigest,
      'HISTORY_RECORD_SHAPE',
    ],
    [
      'a second execute invocation',
      (r) => (r.items[2].cliExecuteInvocations = 2),
      'HISTORY_LIVE_RESULT_ITEMS',
    ],
    ['a dry run', (r) => (r.items[2].dryRun = true), 'HISTORY_LIVE_RESULT_ITEMS'],
    ['not COMPLETED', (r) => (r.items[2].runTerminalState = 'FAILED'), 'HISTORY_LIVE_RESULT_ITEMS'],
    [
      'wrong record kind',
      (r) => (r.recordKind = 'GENERATION2_OWNER_LIVE_AUTHORITY'),
      'HISTORY_LIVE_RESULT_KIND',
    ],
    ['a live authority flag', (r) => (r.isLiveAuthority = true), 'HISTORY_LIVE_RESULT_KIND'],
  ];

  for (const [name, mutate, code] of CASES) {
    it(`${name} -> ${code}, identically in the contract and in the generic replay`, () => {
      const live = mutated(mutate);
      expect(contract(live)).toBe(code);
      expect(replayWith(live)).toBe(code);
    });
  }

  it('an unresealed mutation fails the outer pin first', () => {
    const live = mutated((r) => (r.liveInvocations.retries = 1));
    expect(contract({ ...live, sha256: W06_V3.sha256 })).toBe('HISTORY_RECORD_NOT_PINNED');
  });

  it('an expectation whose order and items disagree is refused before the record is read', () => {
    expect(
      contract(W06_V3, {
        ...W06_EXPECTATION,
        authorisedWorkItems: W06_EXPECTATION.authorisedWorkItems.slice(1),
      }),
    ).toBe('HISTORY_AUTHORITY_ORDER');
  });
});

describe('Generation-2 LIVE_RESULT contract: one source of truth', () => {
  const path = 'src/test/harness/phase2b2d/generation2History/adjudicationHistory.ts';
  const terminal = terminalCommit();
  // Bytes as this task left them: its terminal commit, else the working tree.
  const source = terminal === null ? readFileSync(join(REPO, path), 'utf8') : show(terminal, path);

  it('replayWindow delegates its LIVE_RESULT checks to the exported contract', () => {
    const replayWindowBody = source.slice(
      source.indexOf('function replayWindow('),
      source.indexOf('// ---- adjudication ---'),
    );
    expect(replayWindowBody).toMatch(
      /validateGeneration2LiveResultForHistory\(binding\.liveResult,/,
    );
    expect(replayWindowBody).not.toMatch(/GENERATION2_WINDOW_LIVE_RESULT|itemsNotStarted/);
    expect(source.match(/'GENERATION2_WINDOW_LIVE_RESULT'/g)).toHaveLength(1);
    expect(source.match(/stops\.itemsNotStarted, 'LIVE_RESULT/g)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Isolation, bounded to THIS task's own terminal commit.
// ---------------------------------------------------------------------------

/** The commit that added the hardening record, or null while it is uncommitted. */
function terminalCommit(): string | null {
  const commits = git('log', '--diff-filter=A', '--format=%H', '--', HARDENING_RECORD_PATH)
    .split('\n')
    .filter(Boolean);
  return commits.length === 0 ? null : commits[commits.length - 1]!;
}

describe('Generation-2 post-Window-06 hardening: isolation', () => {
  const ALLOWED = new Map<string, string>([
    ['src/test/harness/phase2b2d/generation2History/adjudicationHistory.ts', 'M'],
    ['src/test/unit/orgunitCorpus2DA2Generation2Freeze.test.ts', 'M'],
    ['src/test/unit/orgunitCorpus2DA2Generation2LiveResultContract.test.ts', 'A'],
    [HARDENING_RECORD_PATH, 'A'],
  ]);

  it('changes exactly the allowed surface over its own range and nothing else', () => {
    const terminal = terminalCommit();
    const range =
      terminal === null ? [HARDENING_STARTING_HEAD] : [HARDENING_STARTING_HEAD, terminal];
    const changes = git('diff', '--name-status', '--no-renames', ...range)
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [status, path] = line.split('\t') as [string, string];
        return { status, path };
      });
    if (terminal === null) {
      for (const path of git('ls-files', '--others', '--exclude-standard').split('\n')) {
        if (path !== '') changes.push({ status: 'A', path });
      }
    }
    for (const change of changes) {
      expect({ ...change, allowed: ALLOWED.get(change.path) }).toEqual({
        ...change,
        allowed: change.status,
      });
    }
    for (const forbidden of [
      'src/orgunits',
      'docs/evaluation/generation2',
      'src/test/harness/phase2b2d/generation2Acquisition',
      'src/test/harness/phase2b2d/generation2Freeze',
      'src/test/harness/phase2b2d/continuationWindow',
    ]) {
      expect(
        changes.filter((c) => c.path.startsWith(forbidden)),
        forbidden,
      ).toEqual([]);
    }
  });

  it('no Window-07 record exists at this task terminal', () => {
    const at = terminalCommit() ?? HARDENING_STARTING_HEAD;
    const names = git('ls-tree', '--name-only', `${at}:docs/evaluation`).split('\n');
    expect(names.filter((name) => /GENERATION2_WINDOW_07/.test(name))).toEqual([]);
    expect(show(at, GENERATION2_LEDGER_PATH)).toBe(
      show(W06_PINS.ledgerCommit, GENERATION2_LEDGER_PATH),
    );
  });
});
