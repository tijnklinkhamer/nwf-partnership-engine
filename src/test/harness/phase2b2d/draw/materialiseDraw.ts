/**
 * A1b DRAW MATERIALISATION — the entry point.
 *
 *   npx tsx src/test/harness/phase2b2d/draw/materialiseDraw.ts [--write]
 *
 * Without `--write` it computes everything and writes nothing, so the draw can
 * be inspected before it is committed. With `--write` it writes exactly one
 * file: the draw artifact. It then rereads it, reparses it, recomputes the
 * drawHash from what is ON DISK and requires equality - the value still held
 * in memory is never what the verification trusts.
 *
 * IT READS ONE FILE AND WRITES ONE FILE
 *
 *   The only input is the committed FRAME_V2_GEN1 artifact, whose two hashes
 *   and byte length are verified before a single entry is read. There is no
 *   database connection, no socket, no official source artifact, no historical
 *   evaluation fixture and no environment variable anywhere beneath this
 *   module - which is asserted from the real import graph rather than promised
 *   here.
 *
 * IT ACQUIRES NOTHING. No root authority identifier is resolved into a URL, a
 * hostname or a registrable domain; no institution is contacted; no reserve
 * entry is consumed; no replacement is recorded; no page, item, gold label or
 * classifier output exists. That is A2 and it is not authorised.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DRAW_ARTIFACT_PATH,
  EXACT_REALISED_SPLIT_COUNTS,
  GENERATION_ID,
  SPLITS,
} from './drawContract.js';
import { drawSelectionAndReserve, reconcileDraw } from './deterministicDraw.js';
import {
  buildDrawArtifact,
  drawRootAuthorityDistribution,
  recomputeDrawHash,
  renderDrawArtifact,
  type DrawArtifact,
} from './drawArtifact.js';
import { readFrozenFrame, type FrozenFrame } from './readFrozenFrame.js';

export class DrawMaterialisationStop extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DrawMaterialisationStop';
  }
}

export interface DrawMaterialisationResult {
  readonly artifact: DrawArtifact;
  readonly bytes: string;
  readonly artifactFileSha256: string;
  readonly written: boolean;
  readonly artifactPath: string;
  readonly frame: FrozenFrame;
}

/** Builds the artifact from an already-verified frame. Performs no IO of its own. */
export function buildDrawFromFrame(frame: FrozenFrame): DrawArtifact {
  const draw = drawSelectionAndReserve(frame.eligible);
  reconcileDraw(draw);

  return buildDrawArtifact({
    generationId: GENERATION_ID,
    counts: draw.counts,
    selection: draw.selection,
    reserve: draw.reserve,
    rootAuthorityDistribution: drawRootAuthorityDistribution(draw.selection, draw.reserve),
  });
}

/** The whole A1b step: verify the frame, draw, write once, reread and verify. */
export async function materialiseDraw(
  repoRoot: string,
  options: { write: boolean },
): Promise<DrawMaterialisationResult> {
  const frame = readFrozenFrame(repoRoot);
  const artifact = buildDrawFromFrame(frame);
  const bytes = await renderDrawArtifact(artifact);
  const artifactPath = join(repoRoot, DRAW_ARTIFACT_PATH);

  if (options.write) {
    mkdirSync(dirname(artifactPath), { recursive: true });
    writeFileSync(artifactPath, bytes, 'utf8');

    // Reread, reparse, recompute, require equality - never trust the value
    // still held in memory.
    const reread = readFileSync(artifactPath, 'utf8');
    if (reread !== bytes) {
      throw new DrawMaterialisationStop(
        'STOP: the artifact on disk differs from what was written.',
      );
    }
    const reparsed = JSON.parse(reread) as DrawArtifact;
    const recomputed = recomputeDrawHash(reparsed);
    if (recomputed !== reparsed.drawHash) {
      throw new DrawMaterialisationStop(
        `STOP: recomputed drawHash ${recomputed} does not equal the stored ${reparsed.drawHash}.`,
      );
    }
    if (recomputed !== artifact.drawHash) {
      throw new DrawMaterialisationStop('STOP: the round-tripped drawHash moved.');
    }

    // Reconcile the ROUND-TRIPPED lists, not the in-memory ones: this is the
    // check that the committed file - the thing A2 will read - satisfies every
    // SD2 postcondition.
    reconcileDraw({
      selection: reparsed.selection,
      reserve: reparsed.reserve,
      counts: reparsed.counts,
    });
    for (const split of SPLITS) {
      if (reparsed.counts.splitCounts[split] !== EXACT_REALISED_SPLIT_COUNTS[split]) {
        throw new DrawMaterialisationStop(`STOP: the round-tripped ${split} count moved.`);
      }
    }
  }

  return {
    artifact,
    bytes,
    artifactFileSha256: createHash('sha256').update(bytes, 'utf8').digest('hex'),
    written: options.write,
    artifactPath: DRAW_ARTIFACT_PATH,
    frame,
  };
}

async function main(): Promise<void> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
  const write = process.argv.includes('--write');
  const result = await materialiseDraw(repoRoot, { write });
  const { counts } = result.artifact;

  console.log(`generationId               ${result.artifact.generationId}`);
  console.log(`frameHash (reverified)     ${result.frame.frameHash}`);
  console.log(`frameFileSha256 (reverif)  ${result.frame.artifactFileSha256}`);
  console.log(`eligibleInputCount         ${counts.eligibleInputCount}`);
  console.log(`selectionCount             ${counts.selectionCount}`);
  console.log(`reserveCount               ${counts.reserveCount}`);
  console.log(`  DEV_TRAIN                ${counts.splitCounts.DEV_TRAIN}`);
  console.log(`  DEV_CONFIRM              ${counts.splitCounts.DEV_CONFIRM}`);
  console.log(`  FINAL_HOLDOUT            ${counts.splitCounts.FINAL_HOLDOUT}`);
  console.log(`rankedButUndrawnCount      ${counts.rankedButUndrawnCount}`);
  console.log(
    `rootAuthorityDistribution  ${JSON.stringify(result.artifact.rootAuthorityDistribution)}`,
  );
  console.log(`drawHash                   ${result.artifact.drawHash}`);
  console.log(`artifactFileSha256         ${result.artifactFileSha256}`);
  console.log(`artifactBytes              ${Buffer.byteLength(result.bytes, 'utf8')}`);
  console.log(`written                    ${result.written} (${result.artifactPath})`);
  console.log('PHASE_2B_2D_A1B_DRAW_COMPLETE_AWAITING_A2_AUTHORISATION');
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
