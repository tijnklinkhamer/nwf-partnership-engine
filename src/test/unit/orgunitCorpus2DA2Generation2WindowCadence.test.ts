/**
 * Phase 2B-2D A2 Generation 2: the explicit WINDOW EXECUTION CADENCE.
 *
 *   - historical non-regression: the explicit seven-window history (Windows
 *     01-06 + the partial Window 07) replays exactly as before, 32/32 run
 *     references, every historical spec hash identical, and a default spec
 *     carries no cadence field;
 *   - the one approved non-default cadence (PRIMARIES_THEN_Q1_REPLACEMENTS,
 *     Window 08 only) keeps complete Q1, the reserve order, the pre-network
 *     append and the membership, and changes ONLY the order;
 *   - P7, history replay, history integrity and the LIVE_RESULT contract are
 *     cadence-aware, and fail closed on every forged cadence (the negative
 *     matrix);
 *   - P5 semantics are unchanged.
 *
 * Every input is read by `git show` at a PINNED commit, so later commits
 * cannot turn these claims into a temporal defect.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { canonicalStringify } from '../../orgunits/classify/canonical.js';
import { evaluateGeneration2WindowGate } from '../harness/phase2b2d/generation2Acquisition/gateAdapter.js';
import { prepareGeneration2ReplacementAppend } from '../harness/phase2b2d/generation2Acquisition/ledgerAppend.js';
import { readCommittedInputs } from '../harness/phase2b2d/generation2Acquisition/materialiseReadiness.js';
import {
  GENERATION2_LEDGER_PATH,
  Generation2OperationalRefusal,
} from '../harness/phase2b2d/generation2Acquisition/operationalContract.js';
import {
  parseOperationalGeneration2Ledger,
  type OperationalGeneration2Ledger,
} from '../harness/phase2b2d/generation2Acquisition/operationalLedger.js';
import {
  GENERATION2_P7_INVARIANT_NAMES,
  computeGeneration2PreflightWithAssessment,
  type Generation2Preflight,
} from '../harness/phase2b2d/generation2Acquisition/preflight.js';
import {
  assessCommittedInputs,
  planCompleteQ1,
  type CommittedInputAssessment,
  type Generation2OperationalBasis,
} from '../harness/phase2b2d/generation2Acquisition/state.js';
import {
  buildGeneration2WindowSpec,
  recomputeWindowSpecHash,
  type Generation2WindowSpec,
} from '../harness/phase2b2d/generation2Acquisition/windowSpec.js';
import {
  APPROVED_WINDOW_CADENCE_AUTHORITIES,
  DEFAULT_WINDOW_EXECUTION_CADENCE,
  WINDOW_EXECUTION_CADENCES,
  cadenceOfAuthority,
  verifyWindowCadenceAuthority,
  type ApprovedWindowCadenceAuthority,
  type WindowCadenceAuthorityBinding,
} from '../harness/phase2b2d/generation2Cadence/windowCadence.js';
import {
  replayGeneration2History,
  validateGeneration2LiveResultForHistory,
  type CommittedRecordBinding,
  type Generation2AdjudicationHistory,
  type Generation2WindowHistoryBinding,
} from '../harness/phase2b2d/generation2History/adjudicationHistory.js';
import { assessAdjudicationHistoryIntegrity } from '../harness/phase2b2d/generation2History/historyIntegrity.js';
import {
  refOf,
  sealRecord,
  synthesiseAdjudicatedWindow,
} from '../harness/phase2b2d/generation2Window03/synthesiseWindow.js';
import { requireHardeningChain } from '../harness/phase2b2d/generation2Window07/materialiseWindow07Readiness.js';
import {
  GENESIS_REVISION_COMMIT,
  WINDOW07_READINESS_STARTING_HEAD,
  WINDOW07_W02_PINS,
  WINDOW07_W02_VALIDATION_CHAIN,
  WINDOW07_W03_PINS,
  WINDOW07_W04_PINS,
  WINDOW07_W05_RECORD_PINS,
  WINDOW07_W06_RECORD_PINS,
  WINDOW07_W06_STARTING_LEDGER_REVISION,
} from '../harness/phase2b2d/generation2Window07/window07Contract.js';
import { sixWindowHistoryForWindow07 } from '../harness/phase2b2d/generation2Window07/window07Readiness.js';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const REPO = resolve(import.meta.dirname, '../../..');
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const git = (...args: string[]): string =>
  execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const show = (commit: string, path: string): string => git('show', `${commit}:${path}`);

const W07 = 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_07_';
const W07_AUTHORITY = {
  path: `${W07}LIVE_AUTHORITY_V1.json`,
  commit: '73fc2c8b3e2f14def6ba7861cb7d2ba49ef402a6',
};
const W07_LIVE = {
  path: `${W07}LIVE_RESULT_V1.json`,
  commit: '003a9afd1720f858f721957dc029cd1a95e1c6c2',
};
const W07_ADJ = {
  path: `${W07}EVIDENCE_ADJUDICATION_V1.json`,
  commit: '2e814487cff6c8dcf5bcb9c6f8a7639e84d7e7db',
};
const NINE_ENTRY_COMMIT = '987086b2ddc5164ce704728d360abe99e7e84e55';
const DECISION = APPROVED_WINDOW_CADENCE_AUTHORITIES[0]!;
const HISTORICAL_SPEC_HASHES = [
  'af9eafe58251a9dbb6a0af5baae0258b2a82a1f1183554d45f3b2dd14898fb23',
  '59bb957942e6f06e8c530bb5dffcd3118f9e3ff5b4a3fc9e1af8ea7e03297b9c',
  '012f983bd0b59b5fe20cf628cf765418ea8046d3f28c1eaafc70d2e679d30418',
  '8f8b4eef73b433d37bb8cae84836285eea0fb03d668c9ab068bad4745882a9da',
  '1714e3c9f9cd175cc6650e8cde150dee0f1c18ae742cc4508235291bee061cad',
  '470f0d281d104b2d099b8e8c62ff65ef4f58678adbba8e422c167a7398935ac0',
  '6a52a37a49b5b48a158a8a6535fdb6355f7b5e1225c902f841de9b261197cce3',
];
const PRIMARY_FIRST = ['G2P:100', 'G2P:101', 'G2P:102', 'G2R:96:9', 'G2R:99:10'];
const REPLACEMENT_FIRST = ['G2R:96:9', 'G2R:99:10', 'G2P:100', 'G2P:101', 'G2P:102'];
const ILLUSTRATIVE = '2026-09-30T10:27:05Z';

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof Generation2OperationalRefusal) return error.code;
    throw error;
  }
  return 'NO_REFUSAL';
}
const bind = (pin: { path: string; commit: string }): CommittedRecordBinding => {
  const text = show(pin.commit, pin.path);
  return { path: pin.path, sha256: sha256(text), text };
};
const reseal = (
  spec: Generation2WindowSpec,
  patch: Partial<Generation2WindowSpec>,
): Generation2WindowSpec => {
  const next = { ...spec, ...patch } as Generation2WindowSpec;
  return { ...next, windowSpecHash: recomputeWindowSpecHash(next) };
};
const reorder = (spec: Generation2WindowSpec, ids: readonly string[]) =>
  ids.map((id, k) => ({ ...spec.workItems.find((i) => i.workItemId === id)!, order: k + 1 }));
const falses = (pf: Generation2Preflight) =>
  GENERATION2_P7_INVARIANT_NAMES.filter((n) => !pf.invariants[n]);

let assessment: CommittedInputAssessment;
let basis: Generation2OperationalBasis;
let seven: Generation2AdjudicationHistory;
let nineText: string;
let nine: OperationalGeneration2Ledger;
let decision: WindowCadenceAuthorityBinding;
let spec: Generation2WindowSpec;
let defaultSpec: Generation2WindowSpec;
let elevenText: string;

beforeAll(() => {
  requireHardeningChain(REPO);
  const genesisText = show(GENESIS_REVISION_COMMIT, GENERATION2_LEDGER_PATH);
  const committed = new Map(readCommittedInputs(REPO));
  committed.set(GENERATION2_LEDGER_PATH, genesisText);
  const atCommit = (pins: readonly { path: string; commit: string }[]) =>
    new Map(pins.map((pin) => [pin.path, show(pin.commit, pin.path)] as const));
  const sevenEntryText = show(WINDOW07_READINESS_STARTING_HEAD, GENERATION2_LEDGER_PATH);
  const six = sixWindowHistoryForWindow07({
    committed,
    currentLedgerText: sevenEntryText,
    startingLedgerTexts: [
      genesisText,
      show(WINDOW07_W02_PINS.startingLedgerRevisionCommit, GENERATION2_LEDGER_PATH),
      show(WINDOW07_W03_PINS.startingLedgerRevisionCommit, GENERATION2_LEDGER_PATH),
      show(WINDOW07_W04_PINS.startingLedgerRevisionCommit, GENERATION2_LEDGER_PATH),
    ],
    fiveEntryLedgerText: show(
      WINDOW07_W06_STARTING_LEDGER_REVISION.appendCommit,
      GENERATION2_LEDGER_PATH,
    ),
    window04AuthorityTextAtCommit: show(
      WINDOW07_W04_PINS.authority.commit,
      WINDOW07_W04_PINS.authority.path,
    ),
    window05TextsAtCommit: atCommit(WINDOW07_W05_RECORD_PINS),
    window06TextsAtCommit: atCommit(WINDOW07_W06_RECORD_PINS),
    auditTexts: atCommit([
      WINDOW07_W02_VALIDATION_CHAIN.stopAudit,
      WINDOW07_W02_VALIDATION_CHAIN.closureAudit,
    ]),
  });
  const w07: Generation2WindowHistoryBinding = {
    windowOrdinal: 7,
    authority: bind(W07_AUTHORITY),
    liveResult: bind(W07_LIVE),
    adjudication: bind(W07_ADJ),
    startingLedgerText: sevenEntryText,
  };
  seven = { windows: [...six.windows, w07] };
  assessment = assessCommittedInputs(committed);
  basis = assessment.basis!;
  nineText = show(NINE_ENTRY_COMMIT, GENERATION2_LEDGER_PATH);
  nine = parseOperationalGeneration2Ledger(JSON.parse(nineText) as unknown, basis.genesis);
  const decisionText = show(DECISION.commit, DECISION.path);
  decision = {
    path: DECISION.path,
    commit: DECISION.commit,
    sha256: sha256(decisionText),
    text: decisionText,
  };
  const input = {
    basis,
    startingLedger: nine,
    startingLedgerFile: { sha256: sha256(nineText), bytes: Buffer.byteLength(nineText, 'utf8') },
    plannedWindowSize: 5,
    history: seven,
  };
  spec = buildGeneration2WindowSpec({ ...input, cadenceAuthority: decision });
  defaultSpec = buildGeneration2WindowSpec(input);
  const append = prepareGeneration2ReplacementAppend({
    basis,
    ledger: nine,
    assignments: planCompleteQ1(basis, nine, seven),
    recordedAtUtc: ILLUSTRATIVE,
    history: seven,
  });
  elevenText = `${JSON.stringify(append.nextLedger, null, 2)}\n`;
}, 300_000);

const preflight = (
  expected: Generation2WindowSpec,
  currentLedgerText: string,
  cadenceAuthority?: WindowCadenceAuthorityBinding,
) =>
  computeGeneration2PreflightWithAssessment(assessment, {
    currentLedgerText,
    startingLedgerText: nineText,
    expectedWindowSpec: expected,
    adjudicationHistory: seven,
    ...(cadenceAuthority === undefined ? {} : { cadenceAuthority }),
  });

describe('Generation-2 window execution cadence: historical non-regression', () => {
  it('the vocabulary has exactly two modes and the legacy default is replacement-first', () => {
    expect([...WINDOW_EXECUTION_CADENCES]).toEqual([
      'Q1_REPLACEMENTS_THEN_PRIMARIES',
      'PRIMARIES_THEN_Q1_REPLACEMENTS',
    ]);
    expect(DEFAULT_WINDOW_EXECUTION_CADENCE).toBe('Q1_REPLACEMENTS_THEN_PRIMARIES');
    expect(APPROVED_WINDOW_CADENCE_AUTHORITIES).toHaveLength(1);
    expect(DECISION.windowOrdinal).toBe(8);
  });

  it('the explicit seven-window history replays: 32 / 32 run references, every spec hash identical', () => {
    const integrity = assessAdjudicationHistoryIntegrity(basis, nine, seven);
    expect(integrity.failures).toEqual([]);
    expect(integrity.rebuiltWindowSpecHashes).toEqual(HISTORICAL_SPEC_HASHES);
    expect(integrity.historicalRunReferences).toHaveLength(32);
    expect(new Set(integrity.historicalRunReferences).size).toBe(32);
    const w07 = integrity.replay!.windows[6]!;
    expect(w07.executed.map((e) => [e.workItemId, e.verdict, e.q3Reason])).toEqual([
      ['G2R:96:7', 'ACQUISITION_UNSUCCESSFUL', 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE'],
      ['G2R:99:8', 'ACQUISITION_UNSUCCESSFUL', 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET'],
    ]);
    expect(w07.stateAfter.neverStarted).toEqual([100, 101, 102, 103, 104, 105, 106, 107, 108, 109]);
    for (const window of integrity.replay!.windows) expect(window.cadenceAuthority).toBeUndefined();
  });

  it('a default spec carries no cadence field and its bytes are those of the replacement-first builder', () => {
    expect(Object.hasOwn(defaultSpec, 'executionCadence')).toBe(false);
    expect(defaultSpec.workItems.map((i) => i.workItemId)).toEqual(REPLACEMENT_FIRST);
    expect(recomputeWindowSpecHash(defaultSpec)).toBe(defaultSpec.windowSpecHash);
    // Every historical authority's bound spec is still what the default builder derives.
    seven.windows.forEach((w, k) => {
      expect(
        (JSON.parse(w.authority.text) as { boundWindowSpec: { windowSpecHash: string } })
          .boundWindowSpec.windowSpecHash,
      ).toBe(HISTORICAL_SPEC_HASHES[k]);
      expect(Object.hasOwn(JSON.parse(w.authority.text) as object, 'executionCadence')).toBe(false);
    });
  });

  it('a default-cadence preflight reports no cadence prerequisite and behaves exactly as before', () => {
    const pf = preflight(defaultSpec, nineText);
    expect(falses(pf)).toEqual([
      'plannedReplacementAppendRecorded',
      'postAppendOccupantsMatchAssignedReserves',
    ]);
    expect(Object.keys(pf.operationalPrerequisites).sort()).toEqual([
      'adjudicationHistoryFailures',
      'adjudicationHistoryIntegrity',
    ]);
    expect(falses(preflight(defaultSpec, elevenText))).toEqual([]);
  });

  it('a cadence field bolted onto a legacy spec changes its bytes and cannot pass (16)', () => {
    const bolted = reseal(defaultSpec, {
      executionCadence: { ...spec.executionCadence!, mode: DEFAULT_WINDOW_EXECUTION_CADENCE },
    });
    expect(bolted.windowSpecHash).not.toBe(defaultSpec.windowSpecHash);
    const pf = preflight(bolted, elevenText, decision);
    expect(pf.invariants.windowSpecHashValid).toBe(false);
    expect(pf.operationalPrerequisites.windowCadenceAuthorityIntegrity).toBe(false);
  });
});

describe('Generation-2 window execution cadence: the Window-08 primary-first spec', () => {
  it('keeps complete Q1 and the membership, and changes only the order', () => {
    expect(spec.workItems.map((i) => i.workItemId)).toEqual(PRIMARY_FIRST);
    expect(spec.workItems.map((i) => i.order)).toEqual([1, 2, 3, 4, 5]);
    expect([...spec.workItems.map((i) => i.workItemId)].sort()).toEqual(
      [...REPLACEMENT_FIRST].sort(),
    );
    expect(spec.plannedReplacementAppend).toEqual(defaultSpec.plannedReplacementAppend);
    expect(spec.planningState).toEqual(defaultSpec.planningState);
    expect(spec.gateThresholds).toEqual(defaultSpec.gateThresholds);
    expect(
      spec.plannedReplacementAppend.map((p) => [
        p.sequence,
        p.selectionIndex,
        p.generation2ReserveRankPosition,
        p.previousSequenceForSlot,
      ]),
    ).toEqual([
      [9, 96, 9, 7],
      [10, 99, 10, 8],
    ]);
    expect(spec.workItems.map((i) => i.split)).toEqual([
      'DEV_TRAIN',
      'DEV_CONFIRM',
      'FINAL_HOLDOUT',
      'DEV_CONFIRM',
      'FINAL_HOLDOUT',
    ]);
    expect(spec.executionCadence).toEqual({
      mode: 'PRIMARIES_THEN_Q1_REPLACEMENTS',
      windowOrdinal: 8,
      authority: {
        path: DECISION.path,
        commit: DECISION.commit,
        sha256: DECISION.sha256,
        bytes: DECISION.bytes,
        ownerDecision: DECISION.ownerDecision,
      },
    });
  });

  it('the prospective ledger has 11 entries: slot 96 -> reserve 9 then slot 99 -> reserve 10', () => {
    const eleven = parseOperationalGeneration2Ledger(
      JSON.parse(elevenText) as unknown,
      basis.genesis,
    );
    expect(eleven.entries).toHaveLength(11);
    expect(
      eleven.entries
        .slice(9)
        .map((e) => [
          e.sequence,
          e.selectionIndex,
          e.generation2ReserveRankPosition,
          e.previousSequenceForSlot,
        ]),
    ).toEqual([
      [9, 96, 9, 7],
      [10, 99, 10, 8],
    ]);
    expect(eleven.entries[9]!.previousEntryHash).toBe(nine.entries[8]!.entryHash);
    expect(eleven.entries[10]!.previousEntryHash).toBe(eleven.entries[9]!.entryHash);
  });

  it('P7 is 16/18 on the nine-entry ledger, 18/18 on the prospective one, with cadence integrity true', () => {
    const current = preflight(spec, nineText, decision);
    expect(falses(current)).toEqual([
      'plannedReplacementAppendRecorded',
      'postAppendOccupantsMatchAssignedReserves',
    ]);
    const prospective = preflight(spec, elevenText, decision);
    expect(falses(prospective)).toEqual([]);
    expect(prospective.operationalPrerequisites.adjudicationHistoryIntegrity).toBe(true);
    expect(prospective.operationalPrerequisites.windowCadenceAuthorityIntegrity).toBe(true);
    const gate = evaluateGeneration2WindowGate({
      spec,
      preflight: prospective,
      generation: { successfulOrganisationCount: 98, reserveConsumedCount: 11 },
      completed: [],
    });
    expect([gate.decision, gate.nextWorkItemId]).toEqual(['CONTINUE_TO_NEXT_WORK_ITEM', 'G2P:100']);
  });

  it('without the decision a primary-first spec fails closed (1)', () => {
    const pf = preflight(spec, elevenText);
    expect(pf.invariants.windowSpecHashValid).toBe(false);
    expect(pf.invariants.workItemsMatchGovernance).toBe(false);
    expect(pf.operationalPrerequisites.windowCadenceAuthorityIntegrity).toBe(false);
    // and a bare mode string can never produce one: the builder only takes committed bytes
    expect(
      codeOf(() =>
        buildGeneration2WindowSpec({
          basis,
          startingLedger: nine,
          startingLedgerFile: {
            sha256: sha256(nineText),
            bytes: Buffer.byteLength(nineText, 'utf8'),
          },
          plannedWindowSize: 5,
          history: seven,
          cadenceAuthority: {
            ...decision,
            text: '"PRIMARIES_THEN_Q1_REPLACEMENTS"',
            sha256: sha256('"PRIMARIES_THEN_Q1_REPLACEMENTS"'),
          },
        }),
      ),
    ).toBe('CADENCE_AUTHORITY_NOT_PINNED');
  });
});

describe('Generation-2 window execution cadence: the decision verifier (negative matrix)', () => {
  const forged = (
    mutate: (record: Json) => void,
  ): [WindowCadenceAuthorityBinding, ApprovedWindowCadenceAuthority[]] => {
    const record = JSON.parse(decision.text) as Json;
    mutate(record);
    const text = `${JSON.stringify(record, null, 2)}\n`;
    const binding = { ...decision, text, sha256: sha256(text) };
    return [
      binding,
      [{ ...DECISION, sha256: binding.sha256, bytes: Buffer.byteLength(text, 'utf8') }],
    ];
  };
  const verify = (b: WindowCadenceAuthorityBinding, approved?: ApprovedWindowCadenceAuthority[]) =>
    codeOf(() => verifyWindowCadenceAuthority(b, 8, approved));

  it('accepts exactly the pinned decision', () => {
    expect(verify(decision)).toBe('NO_REFUSAL');
  });
  it('refuses a wrong SHA-256, commit, path or bytes (2, 3)', () => {
    expect(verify({ ...decision, sha256: '0'.repeat(64) })).toBe('CADENCE_AUTHORITY_NOT_PINNED');
    expect(verify({ ...decision, commit: '0'.repeat(40) })).toBe('CADENCE_AUTHORITY_NOT_PINNED');
    expect(verify({ ...decision, path: 'docs/evaluation/OTHER.json' })).toBe(
      'CADENCE_AUTHORITY_NOT_PINNED',
    );
    expect(
      verify({ ...decision, text: `${decision.text} `, sha256: sha256(`${decision.text} `) }),
    ).toBe('CADENCE_AUTHORITY_NOT_PINNED');
  });
  it('refuses the decision for another window, and a decision naming another window (4)', () => {
    expect(codeOf(() => verifyWindowCadenceAuthority(decision, 9))).toBe(
      'CADENCE_AUTHORITY_NOT_APPROVED',
    );
    expect(codeOf(() => verifyWindowCadenceAuthority(decision, 7))).toBe(
      'CADENCE_AUTHORITY_NOT_APPROVED',
    );
    const [b, a] = forged((r) => {
      r.executionCadence.windowOrdinal = 9;
    });
    expect(verify(b, a)).toBe('CADENCE_AUTHORITY_NOT_ACCEPTED');
  });
  it('refuses a wrong owner decision, a live authority, a broader scope or any grant', () => {
    for (const mutate of [
      (r: Json) => {
        r.ownerDecisions = ['APPROVE_SOMETHING_ELSE_V1'];
      },
      (r: Json) => {
        r.isLiveAuthority = true;
      },
      (r: Json) => {
        r.scope = 'ALL_WINDOWS_CADENCE';
      },
      (r: Json) => {
        r.executionCadence.appliesToWindowOrdinals = [8, 9];
      },
      (r: Json) => {
        r.ledgerWriteAuthorised = true;
      },
      (r: Json) => {
        r.networkAuthorised = 'ONLY_WINDOW_08';
      },
      (r: Json) => {
        r.recordKind = 'GENERATION2_OWNER_LIVE_AUTHORITY';
      },
      (r: Json) => {
        r.executionCadence.mode = 'Q1_REPLACEMENTS_THEN_PRIMARIES';
      },
    ]) {
      const [b, a] = forged(mutate);
      expect(verify(b, a)).toBe('CADENCE_AUTHORITY_NOT_ACCEPTED');
    }
  });
  it('refuses a decision that would weaken P5 (17) or change Q1 (18)', () => {
    for (const mutate of [
      (r: Json) => {
        r.executionCadence.isP5Change = true;
      },
      (r: Json) => {
        r.executionCadence.preserves.p5DenominatorAndThreshold = false;
      },
      (r: Json) => {
        r.executionCadence.isQ1Change = true;
      },
      (r: Json) => {
        r.executionCadence.preserves.completeQ1 = false;
      },
      (r: Json) => {
        r.executionCadence.preserves.reserveAssignmentOrder = false;
      },
      (r: Json) => {
        r.executionCadence.changes = ['WORK_ITEM_EXECUTION_ORDER', 'Q1_ASSIGNMENT'];
      },
      (r: Json) => {
        delete r.executionCadence.preserves.windowMembership;
      },
    ]) {
      const [b, a] = forged(mutate);
      expect(verify(b, a)).toBe('CADENCE_AUTHORITY_NOT_ACCEPTED');
    }
  });
  it('an approved pin for the default mode is refused', () => {
    expect(verify(decision, [{ ...DECISION, mode: 'Q1_REPLACEMENTS_THEN_PRIMARIES' }])).toBe(
      'CADENCE_AUTHORITY_NOT_ACCEPTED',
    );
  });
});

describe('Generation-2 window execution cadence: P7 refuses every forged Window-08 order and Q1 (5-15)', () => {
  const p7 = (s: Generation2WindowSpec) => preflight(s, elevenText, decision);
  const cases: [string, string[]][] = [
    ['5 primary omitted', ['G2P:100', 'G2P:101', 'G2R:96:9', 'G2R:99:10']],
    ['6 replacement omitted', ['G2P:100', 'G2P:101', 'G2P:102', 'G2R:96:9']],
    ['9 wrong primary order', ['G2P:101', 'G2P:100', 'G2P:102', 'G2R:96:9', 'G2R:99:10']],
    ['10 wrong replacement order', ['G2P:100', 'G2P:101', 'G2P:102', 'G2R:99:10', 'G2R:96:9']],
    ['11 interleaved', ['G2P:100', 'G2R:96:9', 'G2P:101', 'G2P:102', 'G2R:99:10']],
    ['12 replacement-first under the primary-first decision', REPLACEMENT_FIRST],
  ];
  it.each(cases)('%s', (_label, ids) => {
    const forgedSpec = reseal(spec, { workItems: reorder(spec, ids) });
    const pf = p7(forgedSpec);
    expect(pf.invariants.workItemsMatchGovernance).toBe(false);
    expect(pf.invariants.windowSpecHashValid).toBe(false);
  });
  it('7/8 an extra primary or an extra replacement', () => {
    const extraPrimary = {
      ...spec.workItems[0]!,
      workItemId: 'G2P:103',
      selectionIndex: 103,
      order: 6,
    };
    const extraReplacement = {
      ...spec.workItems[3]!,
      workItemId: 'G2R:96:11',
      generation2ReserveRankPosition: 11,
      order: 6,
    };
    for (const extra of [extraPrimary, extraReplacement]) {
      const pf = p7(reseal(spec, { workItems: [...spec.workItems, extra] }));
      expect(pf.invariants.workItemsMatchGovernance).toBe(false);
    }
  });
  it('13/14/15 an incorrect, skipped or reversed Q1 assignment', () => {
    const [a, b] = spec.plannedReplacementAppend;
    for (const planned of [
      [
        { ...a!, generation2ReserveRankPosition: 10 },
        { ...b!, generation2ReserveRankPosition: 9 },
      ],
      [
        { ...a!, generation2ReserveRankPosition: 10 },
        { ...b!, generation2ReserveRankPosition: 11 },
      ],
      [
        { ...b!, sequence: 9 },
        { ...a!, sequence: 10 },
      ],
    ]) {
      const pf = p7(reseal(spec, { plannedReplacementAppend: planned }));
      expect(pf.invariants.completeQ1EqualsPlanningQ1).toBe(false);
    }
    // the landed append itself refuses a reversed or skipped Q1
    const q1 = planCompleteQ1(basis, nine, seven);
    for (const assignments of [
      [q1[1]!, q1[0]!],
      [q1[0]!, { ...q1[1]!, generation2ReserveRankPosition: 11 }],
    ]) {
      expect(
        codeOf(() =>
          prepareGeneration2ReplacementAppend({
            basis,
            ledger: nine,
            assignments,
            recordedAtUtc: ILLUSTRATIVE,
            history: seven,
          }),
        ),
      ).not.toBe('NO_REFUSAL');
    }
  });
});

describe('Generation-2 window execution cadence: history replay and the LIVE_RESULT contract', () => {
  /** A synthetic adjudicated Window 08 whose authority carries the cadence block. */
  const synthesise = (withBlock: boolean) => {
    const base = synthesiseAdjudicatedWindow({
      basis,
      priorHistory: seven,
      startingLedgerText: nineText,
      prospectiveLedgerText: elevenText,
      spec,
      verdicts: {},
      runRefSeed: 'cadence-test',
    });
    const w = base.history.windows[7]!;
    const authorityJson = JSON.parse(w.authority.text) as Record<string, unknown>;
    if (withBlock) authorityJson.executionCadence = spec.executionCadence;
    const authority = sealRecord(w.authority.path, authorityJson);
    const live = JSON.parse(w.liveResult.text) as Json;
    live.boundAuthority = refOf(authority);
    const liveResult = sealRecord(w.liveResult.path, live);
    const adj = JSON.parse(w.adjudication.text) as Json;
    adj.bound.authority = refOf(authority);
    adj.bound.liveResult = refOf(liveResult);
    const adjudication = sealRecord(w.adjudication.path, adj);
    return { ledger: base.ledger, binding: { ...w, authority, liveResult, adjudication } };
  };

  it('replays a primary-first Window-08-shaped authority with its decision: Q1 append first, primaries executed first', () => {
    const { ledger, binding } = synthesise(true);
    const history = { windows: [...seven.windows, { ...binding, cadenceAuthority: decision }] };
    const integrity = assessAdjudicationHistoryIntegrity(basis, ledger, history);
    expect(integrity.failures).toEqual([]);
    const w08 = integrity.replay!.windows[7]!;
    expect(w08.consumedLedgerSequences).toEqual([9, 10]);
    expect(w08.authorisedWorkItemIds).toEqual(PRIMARY_FIRST);
    expect(w08.cadenceAuthority).toEqual({ path: DECISION.path, sha256: DECISION.sha256 });
    expect(integrity.rebuiltWindowSpecHashes.at(-1)).toBe(spec.windowSpecHash);
    expect(integrity.historicalRunReferences).toHaveLength(37);
  });

  it('refuses the same authority without its decision, and a decision without a cadence block (M)', () => {
    const { ledger, binding } = synthesise(true);
    expect(
      codeOf(() =>
        replayGeneration2History(basis, ledger, { windows: [...seven.windows, binding] }),
      ),
    ).toBe('CADENCE_AUTHORITY_MISSING');
    const plain = synthesise(false);
    expect(
      codeOf(() =>
        replayGeneration2History(basis, plain.ledger, {
          windows: [...seven.windows, { ...plain.binding, cadenceAuthority: decision }],
        }),
      ),
    ).toBe('CADENCE_AUTHORITY_NOT_APPLICABLE');
    // a default-cadence reading of a primary-first authority is not the window rule
    expect(
      codeOf(() =>
        replayGeneration2History(basis, plain.ledger, {
          windows: [...seven.windows, plain.binding],
        }),
      ),
    ).toBe('HISTORY_AUTHORITY_WORK_ITEM');
    expect(
      codeOf(() =>
        cadenceOfAuthority(
          {
            executionCadence: { ...spec.executionCadence, mode: 'Q1_REPLACEMENTS_THEN_PRIMARIES' },
          },
          decision,
          8,
        ),
      ),
    ).toBe('CADENCE_AUTHORITY_MISMATCH');
  });

  it('a primary-first LIVE_RESULT must be an exact prefix of P100 -> P101 -> P102 -> R96:9 -> R99:10 (N)', () => {
    const { binding } = synthesise(true);
    const auth = JSON.parse(binding.authority.text) as Json;
    const eleven = parseOperationalGeneration2Ledger(
      JSON.parse(elevenText) as unknown,
      basis.genesis,
    );
    const expectation = {
      windowOrdinal: 8,
      authority: binding.authority,
      windowSpecHash: spec.windowSpecHash,
      authorisedWorkItems: auth.authorisedWorkItems,
      exactOrder: auth.exactOrder,
      ledgerHash: eleven.ledgerHash,
      ledgerEntryCount: 11,
    };
    const full = JSON.parse(binding.liveResult.text) as Json;
    const liveOf = (ids: string[]) => {
      const items = ids.map((id, k) => ({
        ...full.items.find((i: Json) => i.workItemId === id),
        order: k + 1,
      }));
      return sealRecord(binding.liveResult.path, {
        ...full,
        items,
        liveInvocations: { used: ids.length, retries: 0 },
        stops: { itemsNotStarted: PRIMARY_FIRST.filter((id) => !ids.includes(id)) },
      });
    };
    expect(
      validateGeneration2LiveResultForHistory(liveOf(['G2P:100', 'G2P:101']), expectation),
    ).toHaveLength(2);
    expect(
      validateGeneration2LiveResultForHistory(liveOf(PRIMARY_FIRST), expectation),
    ).toHaveLength(5);
    expect(
      codeOf(() => validateGeneration2LiveResultForHistory(liveOf(['G2R:96:9']), expectation)),
    ).toBe('HISTORY_UNAUTHORISED_ITEM');
    expect(
      codeOf(() =>
        validateGeneration2LiveResultForHistory(
          liveOf(['G2R:96:9', 'G2R:99:10', 'G2P:100']),
          expectation,
        ),
      ),
    ).toBe('HISTORY_UNAUTHORISED_ITEM');
    expect(
      codeOf(() => validateGeneration2LiveResultForHistory(liveOf(['G2P:101']), expectation)),
    ).toBe('HISTORY_UNAUTHORISED_ITEM');
  });
});

describe('Generation-2 window execution cadence: P5 semantics are unchanged (O)', () => {
  const observation = (id: string, raw: number) => {
    const item = spec.workItems.find((i) => i.workItemId === id)!;
    return {
      workItemId: id,
      kind: item.kind,
      selectionIndex: item.selectionIndex,
      reserveRankPosition: item.generation2ReserveRankPosition,
      rawPageEvidenceCount: raw,
      runTerminalState: 'COMPLETED' as const,
      rootTerminalReason: 'PAGE_BUDGET_EXHAUSTED' as const,
      orchestrationError: false,
      persistenceAnomaly: false,
      hostStateAnomaly: false,
      inputOrRootMismatch: false,
    };
  };
  it('two low-yield primaries fire P5 after item 2; primaries get no exemption', () => {
    const pf = preflight(spec, elevenText, decision);
    const gate = (completed: ReturnType<typeof observation>[]) =>
      evaluateGeneration2WindowGate({
        spec,
        preflight: pf,
        generation: { successfulOrganisationCount: 98, reserveConsumedCount: 11 },
        completed,
      });
    expect(gate([observation('G2P:100', 0)]).decision).toBe('CONTINUE_TO_NEXT_WORK_ITEM');
    const fired = gate([observation('G2P:100', 0), observation('G2P:101', 3)]);
    expect(fired.decision).toBe('PAUSE_P5_LOW_RAW_YIELD');
    expect(fired.mayStartNextWorkItem).toBe(false);
    expect(gate([observation('G2P:100', 30), observation('G2P:101', 30)]).nextWorkItemId).toBe(
      'G2P:102',
    );
    expect(spec.gateThresholds).toEqual({
      p2RobotsRefusalWindowCount: 3,
      p5LowRawYieldWindowCount: 2,
    });
    expect(canonicalStringify(spec.gateThresholds)).toBe(
      canonicalStringify(defaultSpec.gateThresholds),
    );
  });
});
