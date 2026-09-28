/**
 * METHODOLOGY V3 / GENERATION-2 OWNER FREEZE MATERIALISATION - the entry point.
 *
 *   npx tsx src/test/harness/phase2b2d/generation2Freeze/materialiseFreeze.ts [--write]
 *
 * Reads committed bytes only (the approved proposal files, the frozen frame
 * and draw, the Generation-1 terminal and ledger, and the committed A2
 * governance records the carry-forward binds), renders the five frozen
 * records IN BINDING ORDER - each record binds the rendered bytes of the ones
 * before it - and, with --write, writes exactly those five files, rereads
 * them and re-verifies every hash from DISK.
 *
 * No database, no socket, no environment variable. It assigns no reserve,
 * appends no ledger entry and authorises nothing.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { readVerifiedDraw } from '../continuationWindow/materialiseContinuationArtifacts.js';
import type { ReplacementLedger } from '../continuationWindow/replacementLedger.js';
import type { CarryForwardContext } from '../generation2/carryForward.js';
import {
  DRAW_PATH,
  FRAME_PATH,
  GENERATION1_LEDGER_PATH,
  GENERATION1_TERMINAL_RECORD_PATH,
} from '../generation2/generation2Contract.js';
import type { Generation2ReserveScheduleArtifact } from '../generation2/reserveSchedule.js';
import {
  Generation2FreezeStop,
  bindText,
  buildCarryForwardBaseline,
  buildFrozenBaseline,
  buildFrozenSchedule,
  buildGenesisLedger,
  buildOwnerFreezeApproval,
  recomputeFrozenLedgerHash,
  verifyFrozenSchedule,
  type FrozenGenesisLedger,
  type FrozenScheduleArtifact,
} from './freezeArtifacts.js';
import {
  APPROVED_FEASIBILITY,
  APPROVED_PROPOSAL,
  APPROVED_SCHEDULE_PROPOSAL,
  CARRY_FORWARD_BASELINE_PATH,
  FROZEN_BASELINE_PATH,
  FROZEN_OUTPUT_PATHS,
  FROZEN_SCHEDULE_PATH,
  GENESIS_LEDGER_PATH,
  OWNER_FREEZE_APPROVAL_PATH,
} from './freezeContract.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

export interface RenderedFreezeFile {
  readonly path: string;
  readonly bytes: string;
}

/** The committed JSON governance records, by repository-relative path. */
export function readCommittedGovernance(repoRoot: string): Map<string, string> {
  const committed = new Map<string, string>();
  for (const dir of ['docs/evaluation', 'docs/evaluation/corpus']) {
    for (const name of readdirSync(join(repoRoot, dir))) {
      if (name.endsWith('.json')) {
        committed.set(`${dir}/${name}`, readFileSync(join(repoRoot, dir, name), 'utf8'));
      }
    }
  }
  return committed;
}

async function render(path: string, value: unknown): Promise<string> {
  const options = await resolveConfig(path);
  return format(JSON.stringify(value, null, 2), { ...options, filepath: path, parser: 'json' });
}

/** Pure apart from reading committed files: the five records that WOULD be written. */
export async function renderGeneration2Freeze(
  repoRoot: string,
): Promise<readonly RenderedFreezeFile[]> {
  const read = (path: string): string => readFileSync(join(repoRoot, path), 'utf8');
  const proposalText = read(APPROVED_PROPOSAL.path);
  const scheduleProposalText = read(APPROVED_SCHEDULE_PROPOSAL.path);
  const feasibilityText = read(APPROVED_FEASIBILITY.path);
  const terminalText = read(GENERATION1_TERMINAL_RECORD_PATH);
  const ledgerText = read(GENERATION1_LEDGER_PATH);
  const drawText = read(DRAW_PATH);
  const frameText = read(FRAME_PATH);
  const draw = readVerifiedDraw(repoRoot);
  const generation1Ledger = JSON.parse(ledgerText) as ReplacementLedger;
  const terminal = JSON.parse(terminalText) as {
    finalGeneration1State: CarryForwardContext['terminalState'];
  };
  const ctx: CarryForwardContext = {
    draw: draw as unknown as CarryForwardContext['draw'],
    generation1Ledger,
    terminalState: terminal.finalGeneration1State,
    committed: readCommittedGovernance(repoRoot),
  };

  const approvalBytes = await render(
    OWNER_FREEZE_APPROVAL_PATH,
    buildOwnerFreezeApproval({ proposalText, scheduleProposalText, feasibilityText }),
  );
  const approval = bindText(OWNER_FREEZE_APPROVAL_PATH, approvalBytes);

  const schedule = buildFrozenSchedule(
    JSON.parse(scheduleProposalText) as Generation2ReserveScheduleArtifact,
    draw,
    approval,
  );
  const scheduleBytes = await render(FROZEN_SCHEDULE_PATH, schedule);

  const carryForwardBytes = await render(
    CARRY_FORWARD_BASELINE_PATH,
    buildCarryForwardBaseline({
      ctx,
      feasibilityText,
      terminalText,
      ledgerText,
      drawText,
      approval,
    }),
  );
  const carryForward = bindText(CARRY_FORWARD_BASELINE_PATH, carryForwardBytes);

  const scheduleBinding = {
    ...bindText(FROZEN_SCHEDULE_PATH, scheduleBytes),
    frozenScheduleHash: schedule.frozenScheduleHash,
  };
  const genesis = buildGenesisLedger(approval, scheduleBinding, carryForward, drawText);
  const genesisBytes = await render(GENESIS_LEDGER_PATH, genesis);

  const baselineBytes = await render(
    FROZEN_BASELINE_PATH,
    buildFrozenBaseline({
      approval,
      frameText,
      drawText,
      terminalText,
      ledgerText,
      generation1Ledger,
      draw: ctx.draw,
      frozenSchedule: { ...scheduleBinding, count: schedule.entries.length },
      genesisLedger: {
        ...bindText(GENESIS_LEDGER_PATH, genesisBytes),
        ledgerHash: genesis.ledgerHash,
        entryCount: genesis.entries.length,
      },
      carryForwardBaseline: carryForward,
    }),
  );

  const byPath = new Map<string, string>([
    [OWNER_FREEZE_APPROVAL_PATH, approvalBytes],
    [FROZEN_SCHEDULE_PATH, scheduleBytes],
    [CARRY_FORWARD_BASELINE_PATH, carryForwardBytes],
    [GENESIS_LEDGER_PATH, genesisBytes],
    [FROZEN_BASELINE_PATH, baselineBytes],
  ]);
  return FROZEN_OUTPUT_PATHS.map((path) => ({ path, bytes: byPath.get(path)! }));
}

async function main(): Promise<void> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
  const files = await renderGeneration2Freeze(repoRoot);
  if (process.argv.includes('--write')) {
    for (const file of files) {
      const target = join(repoRoot, file.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, file.bytes, 'utf8');
      if (sha256(readFileSync(target, 'utf8')) !== sha256(file.bytes)) {
        throw new Generation2FreezeStop(`${file.path} did not reread byte-identically`);
      }
    }
    const draw = readVerifiedDraw(repoRoot);
    const schedule = JSON.parse(
      readFileSync(join(repoRoot, FROZEN_SCHEDULE_PATH), 'utf8'),
    ) as FrozenScheduleArtifact;
    const violations = verifyFrozenSchedule(schedule, draw);
    if (violations.length > 0) {
      throw new Generation2FreezeStop(`frozen schedule from disk: ${violations.join('; ')}`);
    }
    const ledger = JSON.parse(
      readFileSync(join(repoRoot, GENESIS_LEDGER_PATH), 'utf8'),
    ) as FrozenGenesisLedger;
    if (recomputeFrozenLedgerHash(ledger) !== ledger.ledgerHash) {
      throw new Generation2FreezeStop('the genesis ledgerHash does not recompute from disk');
    }
  }
  for (const file of files) {
    console.log(
      `${sha256(file.bytes)}  ${String(Buffer.byteLength(file.bytes, 'utf8')).padStart(8)}  ${file.path}`,
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
