/**
 * WRITE-ONCE MATERIALISER FOR THE GENESIS LEDGER AND THE WINDOW V1 PLAN.
 *
 * The ONLY module in this namespace that touches the filesystem. It:
 *
 *   - reads the frozen draw and verifies its file sha and recomputed drawHash
 *     BEFORE using a single entry;
 *   - renders the EMPTY genesis replacement ledger (it has no code path that
 *     can render an entry) and the Window V1 plan with this repository's own
 *     prettier, so `prettier --check` accepts the committed bytes;
 *   - writes each file ONLY if it does not exist, rereads it, and requires
 *     byte equality and hash recomputation;
 *   - refuses to touch an existing ledger at all: once the ledger exists,
 *     every later change is an APPEND made under live authority.
 *
 * It prints no eche row key, organisation id, hostname or URL - hashes,
 * counts and positions only. It opens no socket and no database.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { recomputeDrawHash, type DrawArtifact } from '../draw/drawArtifact.js';
import {
  buildGenesisReplacementLedger,
  recomputeLedgerHash,
  type ReplacementLedger,
} from './replacementLedger.js';
import { buildWindowPlan, recomputeWindowPlanHash, type WindowPlan } from './windowPlan.js';
import {
  DRAW_FILE_SHA256,
  DRAW_HASH,
  DRAW_PATH,
  REPLACEMENT_LEDGER_PATH,
  WINDOW_PLAN_PATH,
} from './windowContract.js';

export class ContinuationMaterialisationStop extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContinuationMaterialisationStop';
  }
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

async function render(value: unknown, filepath: string): Promise<string> {
  const options = await resolveConfig(filepath);
  return format(JSON.stringify(value, null, 2), { ...options, filepath, parser: 'json' });
}

export function readVerifiedDraw(repoRoot: string): DrawArtifact {
  const text = readFileSync(join(repoRoot, DRAW_PATH), 'utf8');
  if (sha256(text) !== DRAW_FILE_SHA256) {
    throw new ContinuationMaterialisationStop('STOP: the draw file sha is not the frozen one.');
  }
  const draw = JSON.parse(text) as DrawArtifact;
  if (draw.drawHash !== DRAW_HASH || recomputeDrawHash(draw) !== DRAW_HASH) {
    throw new ContinuationMaterialisationStop('STOP: the drawHash does not recompute.');
  }
  return draw;
}

export interface RenderedContinuationArtifacts {
  readonly ledger: ReplacementLedger;
  readonly ledgerBytes: string;
  readonly plan: WindowPlan;
  readonly planBytes: string;
}

/** Pure apart from reading the draw: what WOULD be written. */
export async function renderContinuationArtifacts(
  repoRoot: string,
): Promise<RenderedContinuationArtifacts> {
  const draw = readVerifiedDraw(repoRoot);
  const ledger = buildGenesisReplacementLedger();
  if (ledger.entries.length !== 0) {
    throw new ContinuationMaterialisationStop('STOP: the genesis ledger must be empty.');
  }
  const ledgerBytes = await render(ledger, REPLACEMENT_LEDGER_PATH);
  const plan = buildWindowPlan(draw, {
    artifactFileSha256: sha256(ledgerBytes),
    bytes: Buffer.byteLength(ledgerBytes, 'utf8'),
  });
  const planBytes = await render(plan, WINDOW_PLAN_PATH);
  return { ledger, ledgerBytes, plan, planBytes };
}

function writeOnce(repoRoot: string, path: string, bytes: string): 'WRITTEN' | 'UNCHANGED' {
  const absolute = join(repoRoot, path);
  if (existsSync(absolute)) {
    if (readFileSync(absolute, 'utf8') === bytes) return 'UNCHANGED';
    throw new ContinuationMaterialisationStop(
      `STOP: ${path} already exists with different bytes; this tool never overwrites.`,
    );
  }
  writeFileSync(absolute, bytes, { encoding: 'utf8', flag: 'wx' });
  if (readFileSync(absolute, 'utf8') !== bytes) {
    throw new ContinuationMaterialisationStop(
      `STOP: ${path} on disk differs from what was written.`,
    );
  }
  return 'WRITTEN';
}

async function main(): Promise<void> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
  const write = process.argv.includes('--write');
  const rendered = await renderContinuationArtifacts(repoRoot);

  let ledgerOutcome = 'NOT_WRITTEN (dry run)';
  let planOutcome = 'NOT_WRITTEN (dry run)';
  if (write) {
    ledgerOutcome = writeOnce(repoRoot, REPLACEMENT_LEDGER_PATH, rendered.ledgerBytes);
    planOutcome = writeOnce(repoRoot, WINDOW_PLAN_PATH, rendered.planBytes);
    const ledger = JSON.parse(
      readFileSync(join(repoRoot, REPLACEMENT_LEDGER_PATH), 'utf8'),
    ) as ReplacementLedger;
    const plan = JSON.parse(readFileSync(join(repoRoot, WINDOW_PLAN_PATH), 'utf8')) as WindowPlan;
    if (recomputeLedgerHash(ledger) !== ledger.ledgerHash || ledger.entries.length !== 0) {
      throw new ContinuationMaterialisationStop('STOP: the reread genesis ledger does not verify.');
    }
    if (recomputeWindowPlanHash(plan) !== plan.windowPlanHash) {
      throw new ContinuationMaterialisationStop('STOP: the reread window plan does not verify.');
    }
  }

  console.log(`genesis ledger     ${REPLACEMENT_LEDGER_PATH}`);
  console.log(`  file sha256      ${sha256(rendered.ledgerBytes)}`);
  console.log(`  bytes            ${String(Buffer.byteLength(rendered.ledgerBytes, 'utf8'))}`);
  console.log(`  ledgerHash       ${rendered.ledger.ledgerHash}`);
  console.log(`  entries          ${String(rendered.ledger.entries.length)}`);
  console.log(`  outcome          ${ledgerOutcome}`);
  console.log(`window plan        ${WINDOW_PLAN_PATH}`);
  console.log(`  file sha256      ${sha256(rendered.planBytes)}`);
  console.log(`  bytes            ${String(Buffer.byteLength(rendered.planBytes, 'utf8'))}`);
  console.log(`  windowPlanHash   ${rendered.plan.windowPlanHash}`);
  console.log(
    `  work items       ${rendered.plan.workItems.map((item) => item.workItemId).join(' ')}`,
  );
  console.log(`  outcome          ${planOutcome}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
