/**
 * THE BATCH-02 BETWEEN-RUN ACQUISITION GATE.
 *
 * Batch 01 started an organisation after P5 had already become true, because
 * the between-run check was prose plus a partial implementation. This suite
 * pins the executable replacement: the owner's exact worked examples, the
 * stickiness of a PAUSE, the precedence of a real incident over the yield
 * gate, and the purity of the whole namespace.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  evaluateBetweenRunGate,
  evaluateP5OverRawCounts,
} from '../harness/phase2b2d/acquisitionGate/betweenRunGate.js';
import {
  BATCH_02_MAX_ORGANISATIONS,
  BATCH_02_SELECTION_INDICES,
  MIN_RAW_PAGE_EVIDENCE_PER_ORGANISATION,
  P5_LOW_RAW_YIELD_THRESHOLD,
  type CompletedRunObservation,
} from '../harness/phase2b2d/acquisitionGate/gateContract.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const GATE_DIR = join(REPO_ROOT, 'src/test/harness/phase2b2d/acquisitionGate');

const GATE_MODULES = ['betweenRunGate.ts', 'gateContract.ts'];

function codeOf(name: string): string {
  return readFileSync(join(GATE_DIR, name), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** One completed run with no anomaly, carrying the given raw page count. */
function clean(selectionIndex: number, rawPageEvidenceCount: number): CompletedRunObservation {
  return {
    selectionIndex,
    rawPageEvidenceCount,
    runTerminalState: 'COMPLETED',
    inputOrRootMismatch: false,
    persistenceAnomaly: false,
    hostStateAnomaly: false,
  };
}

function runsFromCounts(counts: readonly number[]): CompletedRunObservation[] {
  return counts.map((count, position) =>
    clean(BATCH_02_SELECTION_INDICES[position] as number, count),
  );
}

describe('2D-A2 Batch 02: the owner’s worked examples, exactly', () => {
  // These five sequences are quoted from the owner's Batch-02 instruction and
  // are the acceptance criteria for the gate.
  const cases: ReadonlyArray<readonly [readonly number[], 'CONTINUE' | 'PAUSE_P5_LOW_RAW_YIELD']> =
    [
      [[0], 'CONTINUE'],
      [[0, 0], 'PAUSE_P5_LOW_RAW_YIELD'],
      [[20, 0, 15], 'CONTINUE'],
      [[20, 0, 15, 0], 'PAUSE_P5_LOW_RAW_YIELD'],
      [[31, 0, 28, 0], 'PAUSE_P5_LOW_RAW_YIELD'],
    ];

  for (const [counts, expected] of cases) {
    it(`[${counts.join(',')}] -> ${expected}`, () => {
      expect(evaluateP5OverRawCounts(counts).decision).toBe(expected);
    });
  }

  it('reproduces the owner’s "first two both <4 => stop after 2"', () => {
    expect(evaluateP5OverRawCounts([0]).mayStartNextOrganisation).toBe(true);
    expect(evaluateP5OverRawCounts([0, 0]).mayStartNextOrganisation).toBe(false);
  });

  it('reproduces the owner’s "results 12,0,7,0 => stop after 4"', () => {
    expect(evaluateP5OverRawCounts([12, 0, 7]).decision).toBe('CONTINUE');
    expect(evaluateP5OverRawCounts([12, 0, 7, 0]).decision).toBe('PAUSE_P5_LOW_RAW_YIELD');
  });

  it('reproduces the owner’s "20,14,0,9,0 => the fifth may execute"', () => {
    // The second low-yield event only occurs when the fifth completes, so the
    // gate consulted BEFORE the fifth still says CONTINUE.
    expect(evaluateP5OverRawCounts([20, 14, 0, 9]).decision).toBe('CONTINUE');
    expect(evaluateP5OverRawCounts([20, 14, 0, 9]).mayStartNextOrganisation).toBe(true);
    const afterFifth = evaluateP5OverRawCounts([20, 14, 0, 9, 0]);
    expect(afterFifth.decision).toBe('PAUSE_P5_LOW_RAW_YIELD');
    expect(afterFifth.remainingSelectionIndices).toEqual([]);
  });
});

describe('2D-A2 Batch 02: the P5 boundary is exactly "fewer than 4"', () => {
  it('treats 3 as low yield and 4 as not', () => {
    expect(evaluateP5OverRawCounts([3, 3]).decision).toBe('PAUSE_P5_LOW_RAW_YIELD');
    expect(evaluateP5OverRawCounts([4, 4]).decision).toBe('CONTINUE');
  });

  it('does not pause on a single low-yield organisation, however low', () => {
    expect(evaluateP5OverRawCounts([0]).decision).toBe('CONTINUE');
    expect(evaluateP5OverRawCounts([0, 40, 40, 40]).decision).toBe('CONTINUE');
  });

  it('pauses at exactly the threshold, not above it', () => {
    expect(P5_LOW_RAW_YIELD_THRESHOLD).toBe(2);
    expect(MIN_RAW_PAGE_EVIDENCE_PER_ORGANISATION).toBe(4);
    const verdict = evaluateP5OverRawCounts([0, 0]);
    expect(verdict.lowRawYieldCount).toBe(P5_LOW_RAW_YIELD_THRESHOLD);
  });

  it('reports which selection indices contributed', () => {
    const verdict = evaluateP5OverRawCounts([20, 0, 15, 0]);
    // Four completed counts map positionally onto indices 5, 6, 7, 8 - so the
    // two low-yield organisations are 6 and 8, and index 9 has not run at all.
    expect(verdict.lowRawYieldSelectionIndices).toEqual([6, 8]);
    expect(verdict.completedCount).toBe(4);
  });
});

describe('2D-A2 Batch 02: once PAUSE, always PAUSE for that batch', () => {
  it('cannot be un-triggered by a later high-yield organisation', () => {
    expect(evaluateP5OverRawCounts([0, 0]).decision).toBe('PAUSE_P5_LOW_RAW_YIELD');
    expect(evaluateP5OverRawCounts([0, 0, 99]).decision).toBe('PAUSE_P5_LOW_RAW_YIELD');
    expect(evaluateP5OverRawCounts([0, 0, 99, 99, 99]).decision).toBe('PAUSE_P5_LOW_RAW_YIELD');
  });

  it('is sticky because the low-yield count can never decrease', () => {
    // Append one organisation at a time and assert the count is monotonic and
    // that no CONTINUE ever follows a PAUSE.
    const counts = [12, 0, 7, 0, 30];
    let previousLow = 0;
    let paused = false;
    for (let n = 1; n <= counts.length; n += 1) {
      const verdict = evaluateP5OverRawCounts(counts.slice(0, n));
      expect(verdict.lowRawYieldCount).toBeGreaterThanOrEqual(previousLow);
      previousLow = verdict.lowRawYieldCount;
      if (paused) expect(verdict.decision).not.toBe('CONTINUE');
      if (verdict.decision !== 'CONTINUE') paused = true;
    }
    expect(paused).toBe(true);
  });

  it('never permits starting the next organisation once paused', () => {
    for (const counts of [
      [0, 0],
      [20, 0, 15, 0],
      [31, 0, 28, 0],
    ]) {
      expect(
        evaluateBetweenRunGate({ completedRuns: runsFromCounts(counts) }).mayStartNextOrganisation,
      ).toBe(false);
    }
  });
});

describe('2D-A2 Batch 02: a real incident outranks the yield gate', () => {
  it('reports P3 on a FAILED run even when P5 also holds', () => {
    const runs = runsFromCounts([0, 0]);
    const withFailure = [
      { ...(runs[0] as CompletedRunObservation), runTerminalState: 'FAILED' as const },
      runs[1] as CompletedRunObservation,
    ];
    expect(evaluateBetweenRunGate({ completedRuns: withFailure }).decision).toBe(
      'PAUSE_P3_EXECUTION_FAILURE',
    );
  });

  it('pauses on a single P0, P3, P4 or P7 with no low yield at all', () => {
    const healthy = clean(5, 40);
    expect(
      evaluateBetweenRunGate({ completedRuns: [{ ...healthy, inputOrRootMismatch: true }] })
        .decision,
    ).toBe('PAUSE_P0_INPUT_OR_ROOT_MISMATCH');
    expect(
      evaluateBetweenRunGate({ completedRuns: [{ ...healthy, runTerminalState: 'FAILED' }] })
        .decision,
    ).toBe('PAUSE_P3_EXECUTION_FAILURE');
    expect(
      evaluateBetweenRunGate({ completedRuns: [{ ...healthy, persistenceAnomaly: true }] })
        .decision,
    ).toBe('PAUSE_P4_PERSISTENCE_ANOMALY');
    expect(
      evaluateBetweenRunGate({ completedRuns: [{ ...healthy, hostStateAnomaly: true }] }).decision,
    ).toBe('PAUSE_P7_HOST_STATE_ANOMALY');
  });

  it('keeps a fatal flag sticky too', () => {
    const runs = [{ ...clean(5, 40), hostStateAnomaly: true }, clean(6, 40), clean(7, 40)];
    expect(evaluateBetweenRunGate({ completedRuns: runs }).decision).toBe(
      'PAUSE_P7_HOST_STATE_ANOMALY',
    );
  });
});

describe('2D-A2 Batch 02: the gate is bounded to the authorised scope', () => {
  it('authorises exactly selection indices 5..9, in order', () => {
    expect([...BATCH_02_SELECTION_INDICES]).toEqual([5, 6, 7, 8, 9]);
    expect(BATCH_02_MAX_ORGANISATIONS).toBe(5);
  });

  it('never invents a sixth organisation', () => {
    const all = evaluateP5OverRawCounts([40, 40, 40, 40, 40]);
    expect(all.decision).toBe('CONTINUE');
    expect(all.remainingSelectionIndices).toEqual([]);
    expect(all.mayStartNextOrganisation).toBe(false);
  });

  it('refuses more counts than the batch authorises', () => {
    expect(() => evaluateP5OverRawCounts([1, 2, 3, 4, 5, 6])).toThrow(/authorises 5 organisations/);
  });

  it('reports the remaining indices in execution order', () => {
    expect(evaluateP5OverRawCounts([40]).remainingSelectionIndices).toEqual([6, 7, 8, 9]);
    expect(evaluateP5OverRawCounts([40, 40, 40]).remainingSelectionIndices).toEqual([8, 9]);
  });
});

describe('2D-A2 Batch 02: the gate namespace is pure and starts nothing', () => {
  it('holds exactly the two reviewed modules', () => {
    expect(readdirSync(GATE_DIR).sort()).toEqual(GATE_MODULES);
  });

  it('imports no socket, HTTP client, database, process or provider module', () => {
    for (const name of GATE_MODULES) {
      const code = codeOf(name);
      for (const forbidden of [
        'node:dns',
        'node:net',
        'node:tls',
        'node:http',
        'node:https',
        'node:child_process',
        'node:fs',
        'node:worker_threads',
        'pg',
        '@anthropic-ai',
        'src/db',
        'orgunits/web',
        'orgunits/orchestrator',
      ]) {
        expect(code, `${name} imports ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('calls fetch, spawn, exec or a query nowhere', () => {
    for (const name of GATE_MODULES) {
      const code = codeOf(name);
      for (const forbidden of ['fetch(', 'spawn', 'execFile', 'execSync', '.query(', 'Pool(']) {
        expect(code, `${name} calls ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('reads no clock, randomness, environment or filesystem', () => {
    for (const name of GATE_MODULES) {
      const code = codeOf(name);
      for (const forbidden of [
        'Date.now',
        'new Date',
        'Math.random',
        'process.env',
        'readFileSync',
        'writeFileSync',
      ]) {
        expect(code, `${name} reads ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('names no institution acquisition target - no URL, host, robots or sitemap', () => {
    for (const name of GATE_MODULES) {
      const code = codeOf(name);
      for (const forbidden of ['http://', 'https://', 'robots', 'sitemap', 'mailto:', 'tel:']) {
        expect(code.toLowerCase(), `${name} names ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('creates no label, gold, provider or SD7 capability', () => {
    for (const name of GATE_MODULES) {
      const code = codeOf(name).toLowerCase();
      for (const forbidden of [
        'label',
        'gold',
        'provider',
        'jaccard',
        'shingle',
        'reserve',
        'replacement',
        'set_p',
        'set_r',
      ]) {
        expect(code, `${name} names ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('declares no SD9 success or failure vocabulary - P5 is not an SD9 decision', () => {
    for (const name of GATE_MODULES) {
      const code = codeOf(name);
      expect(code).not.toContain('ACQUISITION_SUCCESSFUL');
      expect(code).not.toContain('ACQUISITION_UNSUCCESSFUL');
    }
  });
});

describe('2D-A2 Batch 02: the gate changed no production file', () => {
  const BATCH_02_BASE_COMMIT = '013a04d194d7171c8c7319a84987d9e23a618fea';

  /**
   * BATCH 02'S OWN TERMINAL COMMIT, AND WHY THE RANGE HAS ONE.
   *
   * This check makes a HISTORICAL claim about Batch 02. It used to prove it
   * with `git diff <base> --`, which compares the base to the WORKING TREE,
   * and so quietly turned "Batch 02 changed no production file" into "no
   * phase after A3a may ever change one" — a statement nobody approved, and
   * one the ADR 0012 robots repair, which IS approved, necessarily breaks.
   *
   * `637c6e6` is the Batch 02 execution record: the run's own terminal state,
   * the point at which the P5 gate stopped it. The later root-cause audit and
   * SD9 closure commits are separate work and are NOT inspected here — they
   * are not Batch 02's gate, and the repair they led to is governed by
   * `orgunitRobotsOptionBRepairScope.test.ts`.
   */
  const BATCH_02_TERMINAL_COMMIT = '637c6e6a9a15e2ca24f0f9794842cce727464136';

  function commitExists(commit: string): boolean {
    try {
      execFileSync('git', ['-C', REPO_ROOT, 'cat-file', '-e', `${commit}^{commit}`], {
        stdio: 'ignore',
      });
      return true;
    } catch {
      return false;
    }
  }

  /** A shallow clone may carry neither endpoint; the check is then skipped rather than guessed. */
  function rangeAvailable(): boolean {
    return commitExists(BATCH_02_BASE_COMMIT) && commitExists(BATCH_02_TERMINAL_COMMIT);
  }

  it.skipIf(!rangeAvailable())(
    'across Batch 02 itself, from the A3a commit to the Batch 02 execution record, it touched nothing under src/orgunits/, migrations/, src/cli/ or the firewall',
    () => {
      const changed = execFileSync(
        'git',
        [
          '-C',
          REPO_ROOT,
          'diff',
          '--name-only',
          BATCH_02_BASE_COMMIT,
          BATCH_02_TERMINAL_COMMIT,
          '--',
        ],
        { encoding: 'utf8' },
      )
        .split('\n')
        .filter((line) => line.length > 0);
      for (const file of changed) {
        expect(file.startsWith('src/orgunits/'), file).toBe(false);
        expect(file.startsWith('migrations/'), file).toBe(false);
        expect(file.startsWith('src/cli/'), file).toBe(false);
        expect(file.startsWith('src/ingest/'), file).toBe(false);
        expect(file.startsWith('src/website/'), file).toBe(false);
        expect(file.startsWith('src/db/'), file).toBe(false);
        expect(file.startsWith('src/compare/'), file).toBe(false);
        expect(file.startsWith('src/test/firewall/'), file).toBe(false);
        expect(file.startsWith('src/test/harness/phase2b2d/corpus/'), file).toBe(false);
        expect(file.startsWith('src/test/harness/phase2b2d/draw/'), file).toBe(false);
        expect(file.startsWith('src/test/harness/phase2b2d/sd7/'), file).toBe(false);
      }
    },
  );
});
