/**
 * GENERATION-2 RESERVE SCHEDULE (PROPOSAL) MATERIALISATION - the entry point.
 *
 *   npx tsx src/test/harness/phase2b2d/generation2/materialiseReserveSchedule.ts [--write]
 *
 * Reads exactly two committed files - the frozen FRAME_V2_GEN1 (both hashes
 * and byte length verified by the landed reader) and the frozen DRAW_V2_GEN1
 * (file SHA-256 and drawHash verified) - and writes at most one: the proposal
 * schedule. After writing it rereads the bytes and recomputes the
 * scheduleHash from DISK.
 *
 * No database, no socket, no environment variable. It assigns no reserve and
 * authorises nothing.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { readVerifiedDraw } from '../continuationWindow/materialiseContinuationArtifacts.js';
import {
  projectEligibleEntries,
  verifyFrameIdentity,
  type EligibleOrganisation,
} from '../draw/readFrozenFrame.js';
import { FRAME_PATH, GENERATION2_RESERVE_SCHEDULE_PATH } from './generation2Contract.js';
import {
  ReserveScheduleStop,
  buildGeneration2ReserveScheduleArtifact,
  deriveGeneration2ReserveSchedule,
  rankFrameAndReconcileDraw,
  recomputeScheduleHash,
  verifyGeneration2ReserveSchedule,
  type FrameEntryForSchedule,
  type Generation2ReserveScheduleArtifact,
} from './reserveSchedule.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

/** Reads and verifies the frozen frame, pairing each projection with its raw entry. */
export function readFrameEntriesForSchedule(repoRoot: string): readonly FrameEntryForSchedule[] {
  const bytes = readFileSync(join(repoRoot, FRAME_PATH), 'utf8');
  verifyFrameIdentity(bytes);
  const parsed = JSON.parse(bytes) as { entries: Record<string, unknown>[] };
  const eligible = projectEligibleEntries(parsed);
  const byKey = new Map<string, EligibleOrganisation>(
    eligible.map((entry) => [entry.echeRowKey, entry]),
  );
  const paired: FrameEntryForSchedule[] = [];
  for (const raw of parsed.entries) {
    if (raw.included !== true) continue;
    const projection = byKey.get(raw.echeRowKey as string);
    if (projection === undefined)
      throw new ReserveScheduleStop('STOP: an included entry was not projected.');
    paired.push({ raw, eligible: projection });
  }
  return paired;
}

export function computeGeneration2ReserveSchedule(
  repoRoot: string,
): Generation2ReserveScheduleArtifact {
  const draw = readVerifiedDraw(repoRoot);
  const ranked = rankFrameAndReconcileDraw(readFrameEntriesForSchedule(repoRoot), draw);
  const entries = deriveGeneration2ReserveSchedule(ranked);
  const violations = verifyGeneration2ReserveSchedule(entries, draw);
  if (violations.length > 0) {
    throw new ReserveScheduleStop(
      `STOP: schedule violations: ${violations.slice(0, 5).join('; ')}`,
    );
  }
  return buildGeneration2ReserveScheduleArtifact(entries);
}

export async function renderGeneration2ReserveSchedule(
  artifact: Generation2ReserveScheduleArtifact,
): Promise<string> {
  const options = await resolveConfig(GENERATION2_RESERVE_SCHEDULE_PATH);
  return format(JSON.stringify(artifact, null, 2), {
    ...options,
    filepath: GENERATION2_RESERVE_SCHEDULE_PATH,
    parser: 'json',
  });
}

async function main(): Promise<void> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
  const artifact = computeGeneration2ReserveSchedule(repoRoot);
  const bytes = await renderGeneration2ReserveSchedule(artifact);
  if (process.argv.includes('--write')) {
    const target = join(repoRoot, GENERATION2_RESERVE_SCHEDULE_PATH);
    writeFileSync(target, bytes, 'utf8');
    const reread = readFileSync(target, 'utf8');
    const onDisk = JSON.parse(reread) as Generation2ReserveScheduleArtifact;
    if (recomputeScheduleHash(onDisk) !== artifact.scheduleHash) {
      throw new ReserveScheduleStop('STOP: the scheduleHash does not recompute from disk.');
    }
  }
  console.log(`reserveScheduleCount   ${String(artifact.entries.length)}`);
  console.log(`first source rank      ${String(artifact.entries[0]?.sourceFrameRankPosition)}`);
  console.log(`last source rank       ${String(artifact.entries.at(-1)?.sourceFrameRankPosition)}`);
  console.log(`scheduleHash           ${artifact.scheduleHash}`);
  console.log(`artifactFileSha256     ${sha256(bytes)}`);
  console.log(`artifactBytes          ${String(Buffer.byteLength(bytes, 'utf8'))}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
