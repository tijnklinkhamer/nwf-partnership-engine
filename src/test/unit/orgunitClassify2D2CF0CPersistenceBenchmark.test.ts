/**
 * PHASE 2B-2D2C-F0C — a REQUEST-FREE synthetic persistence benchmark for the
 * Tier-2 variance reserve.
 *
 * The Tier-2 watchdog derivation reserves 30 000 ms for child startup,
 * artifact flushing and scheduling variance. ADR 0011 adds, per logical
 * evaluation, at most 1 round summary + 6 artifacts per document of
 * write-once, fsync-backed files. Plan-only verification cannot prove
 * persistence latency, so this test MEASURES it: it writes the maximum
 * per-evaluation repair artifact set (the largest frozen batch has 5
 * documents: 31 files) with the REAL writer (`writeArtifactOnce`: exclusive
 * temp file, fsync, link-into-place, directory fsync), at attempt-1-like
 * payload sizes, into a temporary directory, and asserts the whole set
 * lands inside the reserve. No provider, no SDK, no network, no clock
 * injection - this is real wall time on the machine the test runs on, and
 * it is reported as a BOUNDED READINESS RISK, never as a proof for another
 * machine or another day.
 */
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ensureRepairDirectory,
  repairDocumentDirectoryOf,
  repairRoundDirectoryOf,
  writeArtifactOnce,
  type ArtifactKind,
} from '../harness/phase2b2d2c/artifacts.js';
import { FROZEN_TIER2_WATCHDOG_MS } from '../harness/phase2b2d2c/constants.js';

/** The Tier-2 derivation's variance reserve (F0B/F0C liveness.tier2.watchdogDerivationMs). */
const VARIANCE_RESERVE_MS = 30_000;
/** The largest frozen batch: 5 documents (ordinals 2, 4, 6, 7 and 12). */
const MAX_DOCUMENTS_PER_BATCH = 5;
const ARTIFACTS_PER_DOCUMENT = 6;
const MAX_REPAIR_FILES_PER_EVALUATION = 1 + MAX_DOCUMENTS_PER_BATCH * ARTIFACTS_PER_DOCUMENT;

/** Attempt-1-like payload sizes: the largest preserved raw checkpoint was 5,273 bytes; the largest artifact 16,498 bytes. */
const RAW_PAYLOAD_BYTES = 6_000;
const LARGE_PAYLOAD_BYTES = 17_000;

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function filler(bytes: number): string {
  return 'x'.repeat(bytes);
}

describe('2D2C-F0C: synthetic persistence benchmark for the maximum repair artifact set (request-free)', () => {
  it('writes 31 write-once, fsync-backed repair artifacts at attempt-1-like sizes inside the 30 s Tier-2 variance reserve', () => {
    const attemptDir = mkdtempSync(join(tmpdir(), 'nwf-pe-f0c-persist-'));
    dirs.push(attemptDir);
    expect(MAX_REPAIR_FILES_PER_EVALUATION).toBe(31);
    const perDocument: readonly [ArtifactKind, number][] = [
      ['REPAIR_DECISION', 2_000],
      ['REPAIR_REQUEST', 3_000],
      ['REPAIR_RAW_OUTPUT_CHECKPOINT', RAW_PAYLOAD_BYTES],
      ['REPAIR_VALIDATION_RESULT', RAW_PAYLOAD_BYTES],
      ['REPAIR_PROVIDER_OUTCOME', 1_000],
      ['REPAIR_OUTCOME', 2_000],
    ];
    const started = performance.now();
    ensureRepairDirectory(repairRoundDirectoryOf(attemptDir));
    let written = 0;
    for (let docIndex = 0; docIndex < MAX_DOCUMENTS_PER_BATCH; docIndex += 1) {
      const docDir = repairDocumentDirectoryOf(attemptDir, docIndex);
      ensureRepairDirectory(docDir);
      for (const [kind, bytes] of perDocument) {
        writeArtifactOnce(docDir, kind, { synthetic: true, docIndex, payload: filler(bytes) });
        written += 1;
      }
    }
    writeArtifactOnce(repairRoundDirectoryOf(attemptDir), 'REPAIR_ROUND', {
      synthetic: true,
      payload: filler(LARGE_PAYLOAD_BYTES),
    });
    written += 1;
    const elapsedMs = performance.now() - started;

    expect(written).toBe(MAX_REPAIR_FILES_PER_EVALUATION);
    expect(
      readdirSync(repairRoundDirectoryOf(attemptDir)).filter((e) => e.endsWith('.json')),
    ).toHaveLength(1);
    for (let docIndex = 0; docIndex < MAX_DOCUMENTS_PER_BATCH; docIndex += 1) {
      expect(readdirSync(repairDocumentDirectoryOf(attemptDir, docIndex))).toHaveLength(
        ARTIFACTS_PER_DOCUMENT,
      );
    }
    // The bound this benchmark is FOR: the whole set must fit the variance reserve with wide margin.
    expect(elapsedMs).toBeLessThan(VARIANCE_RESERVE_MS);
    // And the reserve itself is what the frozen derivation says it is.
    expect(FROZEN_TIER2_WATCHDOG_MS - 60_000 - 600_000 - 10_000).toBe(VARIANCE_RESERVE_MS);
    // Reported for the audit (a measurement on this machine, not a proof for another).
    console.log(
      `F0C persistence benchmark: ${written} write-once fsync-backed repair artifacts in ${elapsedMs.toFixed(1)} ms ` +
        `(reserve ${VARIANCE_RESERVE_MS} ms)`,
    );
    expect(existsSync(attemptDir)).toBe(true);
  });
});
