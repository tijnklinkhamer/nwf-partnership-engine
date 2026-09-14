/**
 * PHASE 2B-2D2C-F0D — THE ATTEMPT-2 DERIVATION ENTRY POINT.
 *
 *   node --import tsx src/test/harness/phase2b2d2c/scoring/attempt2Generate.ts \
 *     --attempt2-root <attempt-2 dir> --attempt1-root <preserved attempt-1 dir> \
 *     [--gold-supplement <repo-relative>] [--owner-adjudication <repo-relative>] \
 *     --out <destination dir>
 *
 * READ-ONLY BY CONSTRUCTION: it imports only the scoring modules. It writes
 * only into `--out`. It is usable only once an attempt-2 root exists; at
 * F0D none does, and running it then fails closed at the first missing
 * directory. The committed destination below is NAMED here so the manifest
 * of a future derivation can record it, and is deliberately NOT created by
 * this slice.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAttempt2Scoring } from './attempt2Run.js';
import { emitAttempt2Outputs } from './emit.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ATTEMPT2_SCORER_REPO_ROOT = resolve(HERE, '..', '..', '..', '..', '..');

/** The destination a future, authorised attempt-2 derivation would commit to. NOT created by F0D. */
export const COMMITTED_ATTEMPT2_RESULTS_DIR =
  'docs/evaluation/results/phase2b-2d2c-dev-attribution-attempt-2-gold-v1-adjudicated';

export const GOLD_SUPPLEMENT_PATH = 'docs/evaluation/PHASE_2B_2D2C_DEV_SCORING_SUPPLEMENT_V1.json';
export const OWNER_ADJUDICATION_PATH =
  'docs/evaluation/PHASE_2B_2D2C_DEV_OWNER_ADJUDICATION_G1_V1.json';

export const ATTEMPT2_GENERATION_COMMAND =
  'node --import tsx src/test/harness/phase2b2d2c/scoring/attempt2Generate.ts ' +
  '--attempt2-root <attempt-2 root> --attempt1-root <preserved attempt-1 root> ' +
  `--gold-supplement ${GOLD_SUPPLEMENT_PATH} ` +
  `--owner-adjudication ${OWNER_ADJUDICATION_PATH} ` +
  `--out ${COMMITTED_ATTEMPT2_RESULTS_DIR}`;

export interface Attempt2GenerateOptions {
  readonly attempt2Root: string;
  readonly attempt1Root: string;
  readonly out: string;
  readonly goldSupplement?: string;
  readonly ownerAdjudication?: string;
}

export function parseAttempt2Args(argv: readonly string[]): Attempt2GenerateOptions {
  const values: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      flag === '--attempt2-root' ||
      flag === '--attempt1-root' ||
      flag === '--out' ||
      flag === '--gold-supplement' ||
      flag === '--owner-adjudication'
    ) {
      if (value === undefined) throw new Error(`${flag} needs a value.`);
      values[flag] = value;
      index += 1;
    } else {
      throw new Error(`unknown argument ${String(flag)}`);
    }
  }
  const attempt2Root = values['--attempt2-root'];
  const attempt1Root = values['--attempt1-root'];
  const out = values['--out'];
  if (attempt2Root === undefined) throw new Error('--attempt2-root is required.');
  if (attempt1Root === undefined) throw new Error('--attempt1-root is required.');
  if (out === undefined) throw new Error('--out is required.');
  return {
    attempt2Root,
    attempt1Root,
    out,
    ...(values['--gold-supplement'] === undefined
      ? {}
      : { goldSupplement: values['--gold-supplement'] }),
    ...(values['--owner-adjudication'] === undefined
      ? {}
      : { ownerAdjudication: values['--owner-adjudication'] }),
  };
}

export async function generateAttempt2(
  options: Attempt2GenerateOptions,
  generationCommand = ATTEMPT2_GENERATION_COMMAND,
): Promise<{
  readonly devGateOutcome: string;
  readonly files: readonly { readonly name: string; readonly sha256: string }[];
}> {
  const run = runAttempt2Scoring(
    ATTEMPT2_SCORER_REPO_ROOT,
    options.attempt2Root,
    options.attempt1Root,
    options.goldSupplement,
    options.ownerAdjudication,
  );
  const files = await emitAttempt2Outputs(options.out, run.allRows, run.summary, generationCommand);
  return {
    devGateOutcome: run.summary.devGateOutcome,
    files: files.map((file) => ({ name: file.name, sha256: file.sha256 })),
  };
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  const options = parseAttempt2Args(process.argv.slice(2));
  const result = await generateAttempt2(options);
  process.stdout.write(`devGateOutcome: ${result.devGateOutcome}\n`);
  for (const file of result.files) process.stdout.write(`${file.sha256}  ${file.name}\n`);
}
