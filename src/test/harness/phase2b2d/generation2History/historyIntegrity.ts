/**
 * ADJUDICATION_HISTORY_INTEGRITY - an OPERATIONAL PREREQUISITE, separate from
 * the frozen Generation-2 P7. PURE.
 *
 * Frozen Methodology V3 P7 recomputes the frame, the draw, the immutable
 * Generation-1 ledger, the Generation-2 reserve schedule and the Generation-2
 * ledger. It does not mention adjudication files and is NOT redefined to.
 * Once a window has been adjudicated, planning the next one additionally
 * depends on that committed history, so its integrity is checked HERE, under
 * its own name, and reported next to - never inside - the 18 P7 invariants.
 *
 * It holds when:
 *   1. the explicit history replays over the ledger (every cross-binding,
 *      item identity, run reference, verdict, Q3 reason and summary - see
 *      adjudicationHistory.ts); and
 *   2. every historical authority is the window the frozen rules derive:
 *      its bound windowSpecHash, work items and planned append equal the spec
 *      REBUILT by the unchanged builder over its own starting revision and
 *      the history before it; and
 *   3. GENERATION2_HISTORICAL_RUN_REFERENCE_IS_GLOBALLY_UNIQUE_ACROSS_ALL_
 *      ADJUDICATED_WINDOWS_V1: no executed runRefSha256 occurs twice across
 *      the WHOLE explicit history. The replay already refuses a repeat within
 *      one window; a repeat across two windows would count one acquisition
 *      run twice, so it is refused here - by this assessment itself, never by
 *      a window-specific caller that has to remember to ask.
 *
 * No filesystem, no database, no network, no clock.
 */

import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import { refuse } from '../generation2Acquisition/operationalContract.js';
import { parseOperationalGeneration2Ledger } from '../generation2Acquisition/operationalLedger.js';
import type { OperationalGeneration2Ledger } from '../generation2Acquisition/operationalLedger.js';
import type { Generation2OperationalBasis } from '../generation2Acquisition/state.js';
import { buildGeneration2WindowSpec } from '../generation2Acquisition/windowSpec.js';
import {
  replayGeneration2History,
  type Generation2AdjudicationHistory,
  type Generation2HistoryReplay,
} from './adjudicationHistory.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

export const ADJUDICATION_HISTORY_INTEGRITY = 'ADJUDICATION_HISTORY_INTEGRITY';
export const GLOBAL_RUN_REFERENCE_UNIQUENESS_RULE =
  'GENERATION2_HISTORICAL_RUN_REFERENCE_IS_GLOBALLY_UNIQUE_ACROSS_ALL_ADJUDICATED_WINDOWS_V1';

/**
 * Every executed run reference of the replayed history, in history order,
 * refused (HISTORY_DUPLICATE_RUN_REFERENCE) if any value occurs twice ANYWHERE
 * in it. Per-item validity is the replay's; this adds only global uniqueness.
 */
export function requireUniqueHistoricalRunReferences(
  replay: Generation2HistoryReplay,
): readonly string[] {
  const seen = new Map<string, number>();
  const runRefs: string[] = [];
  for (const window of replay.windows) {
    for (const item of window.executed) {
      const first = seen.get(item.runRefSha256);
      if (first !== undefined) {
        refuse(
          'HISTORY_DUPLICATE_RUN_REFERENCE',
          `a run reference executed in window ${String(first)} reappears in window ${String(window.windowOrdinal)} (${item.workItemId}); one run is never counted twice`,
        );
      }
      seen.set(item.runRefSha256, window.windowOrdinal);
      runRefs.push(item.runRefSha256);
    }
  }
  return runRefs;
}

export interface AdjudicationHistoryIntegrity {
  readonly prerequisite: typeof ADJUDICATION_HISTORY_INTEGRITY;
  readonly isFrozenP7: false;
  readonly holds: boolean;
  readonly windowCount: number;
  readonly rebuiltWindowSpecHashes: readonly string[];
  /** Every historical run reference, globally unique; empty unless `holds`. */
  readonly historicalRunReferences: readonly string[];
  readonly replay: Generation2HistoryReplay | null;
  readonly failures: readonly string[];
}

export function assessAdjudicationHistoryIntegrity(
  basis: Generation2OperationalBasis,
  ledger: OperationalGeneration2Ledger,
  history: Generation2AdjudicationHistory,
): AdjudicationHistoryIntegrity {
  const failures: string[] = [];
  const rebuilt: string[] = [];
  let replay: Generation2HistoryReplay | null = null;
  let runRefs: readonly string[] = [];
  try {
    replay = replayGeneration2History(basis, ledger, history);
    runRefs = requireUniqueHistoricalRunReferences(replay);
    history.windows.forEach((binding, k) => {
      const window = replay!.windows[k]!;
      const startingLedger = parseOperationalGeneration2Ledger(
        JSON.parse(binding.startingLedgerText) as unknown,
        basis.genesis,
      );
      const spec = buildGeneration2WindowSpec({
        basis,
        startingLedger,
        startingLedgerFile: {
          sha256: sha256(binding.startingLedgerText),
          bytes: Buffer.byteLength(binding.startingLedgerText, 'utf8'),
        },
        plannedWindowSize: window.plannedWindowSize,
        history: { windows: history.windows.slice(0, k) },
      });
      rebuilt.push(spec.windowSpecHash);
      const authority = JSON.parse(binding.authority.text) as {
        authorisedWorkItems?: unknown;
        plannedLedgerAppend?: unknown;
      };
      if (spec.windowSpecHash !== window.windowSpecHash) {
        failures.push(`window ${String(k + 1)}: bound windowSpecHash is not the rebuilt spec`);
      }
      if (
        canonicalStringify(authority.authorisedWorkItems) !== canonicalStringify(spec.workItems)
      ) {
        failures.push(`window ${String(k + 1)}: authorised work items are not the rebuilt spec's`);
      }
      if (
        canonicalStringify(authority.plannedLedgerAppend) !==
        canonicalStringify(spec.plannedReplacementAppend)
      ) {
        failures.push(`window ${String(k + 1)}: planned append is not the rebuilt spec's`);
      }
    });
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
  return {
    prerequisite: ADJUDICATION_HISTORY_INTEGRITY,
    isFrozenP7: false,
    holds: failures.length === 0,
    windowCount: history.windows.length,
    rebuiltWindowSpecHashes: rebuilt,
    historicalRunReferences: failures.length === 0 ? runRefs : [],
    replay: failures.length === 0 ? replay : null,
    failures,
  };
}
