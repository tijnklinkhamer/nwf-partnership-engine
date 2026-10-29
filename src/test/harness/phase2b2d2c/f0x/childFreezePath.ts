/**
 * PHASE 2B-2D2C-F0X — THE CANONICAL ABSOLUTE CHILD FREEZE PATH.
 *
 * ZERO-INFERENCE EXECUTION-RECOVERY CORRECTION (defect 1). The first real
 * F0X study invocation (2026-09-16) handed every child manifest the
 * RELATIVE historical freeze path `buildSlotExecutionPlanTemplate` returns
 * (`docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_F0I_V1.json` /
 * `..._F0O_V1.json`). The Tier-2 harness (`processIsolatedBatch.ts`)
 * deliberately forks every child with its own scratch directory as `cwd`,
 * and `childMain.ts` reads `manifest.freezePath` verbatim — so all ten
 * children refused at their `freeze` stage with ENOENT, before any
 * provider construction. Every earlier live runner (`cliF0O.ts`:
 * `join(RUNNER_REPO_ROOT, F0O_FREEZE_PATH)`) absolutised the path itself;
 * F0X was the first caller to pass the template's value straight through.
 *
 * The fix is at the one boundary where an F0X child manifest's freeze path
 * is decided: the study executor resolves it HERE, against the runner
 * repository root, and verifies the bytes at that absolute path hash to the
 * frozen F0I/F0O identity — BEFORE the all-ten preflight, so a wrong root
 * refuses before any study manifest, slot identity or candidate
 * consumption exists. The relative path stays the IDENTITY
 * (`historicalIdentityOf`, the freeze constants, the F0I/F0O bytes are all
 * unchanged); only the value a forked child reads from is absolute.
 *
 * PURE aside from the injected reader and hash. No network, no database.
 */
import { isAbsolute, normalize, resolve } from 'node:path';
import { historicalIdentityOf, type SlotExecutionPlanTemplate } from '../f0w/slotExecutionPlan.js';

export type ChildFreezePathRefusal =
  | 'RUNNER_REPO_ROOT_NOT_ABSOLUTE'
  | 'NOT_THE_FROZEN_HISTORICAL_FREEZE_PATH'
  | 'FREEZE_UNREADABLE_AT_ABSOLUTE_PATH'
  | 'FREEZE_HASH_MISMATCH_AT_ABSOLUTE_PATH';

export class ChildFreezePathError extends Error {
  override readonly name = 'ChildFreezePathError';
  constructor(
    readonly refusal: ChildFreezePathRefusal,
    message: string,
  ) {
    super(message);
  }
}

export interface ChildFreezePathInput {
  readonly runnerRepoRoot: string;
  readonly template: SlotExecutionPlanTemplate;
  readonly readFile: (path: string) => Buffer;
  readonly sha256: (bytes: Buffer) => string;
}

/**
 * Returns the canonical ABSOLUTE path a forked child (whose `cwd` is a
 * scratch directory) must read this slot's historical freeze from. Throws
 * `ChildFreezePathError` — never falls back — when the runner root is not
 * absolute, the template names anything but its variant's frozen relative
 * freeze path, or the bytes at the absolute path are unreadable or do not
 * hash to both the template's plan hash and the frozen F0I/F0O hash.
 */
export function resolveChildFreezePath(input: ChildFreezePathInput): string {
  const { runnerRepoRoot, template } = input;
  if (!isAbsolute(runnerRepoRoot)) {
    throw new ChildFreezePathError(
      'RUNNER_REPO_ROOT_NOT_ABSOLUTE',
      `the runner repository root must be absolute; got ${JSON.stringify(runnerRepoRoot)}.`,
    );
  }
  const identity = historicalIdentityOf(template.slot.variantName);
  if (template.freezePath !== identity.historicalFreezePath || isAbsolute(template.freezePath)) {
    throw new ChildFreezePathError(
      'NOT_THE_FROZEN_HISTORICAL_FREEZE_PATH',
      `slot ${template.slot.slotId} names freeze path ${JSON.stringify(template.freezePath)}; the frozen relative path for ${template.slot.variantName} is ${JSON.stringify(identity.historicalFreezePath)}.`,
    );
  }
  const absolute = normalize(resolve(runnerRepoRoot, template.freezePath));
  let bytes: Buffer;
  try {
    bytes = input.readFile(absolute);
  } catch (error) {
    throw new ChildFreezePathError(
      'FREEZE_UNREADABLE_AT_ABSOLUTE_PATH',
      `the ${template.slot.variantName} freeze is not readable at ${absolute}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const rawSha256 = input.sha256(bytes);
  if (
    rawSha256 !== template.freezeConfigRawSha256 ||
    rawSha256 !== identity.historicalFreezeRawSha256
  ) {
    throw new ChildFreezePathError(
      'FREEZE_HASH_MISMATCH_AT_ABSOLUTE_PATH',
      `${absolute} hashes to ${rawSha256}; the frozen ${template.slot.variantName} freeze is ${identity.historicalFreezeRawSha256}.`,
    );
  }
  return absolute;
}
