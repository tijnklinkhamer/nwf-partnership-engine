/**
 * PHASE 2B-2D2C-F0S — THE ATTEMPT-4 DERIVATION ENTRY POINT.
 *
 *   node --import tsx src/test/harness/phase2b2d2c/scoring/attempt4Generate.ts \
 *     --attempt4-root <attempt-4 dir> --attempt1-root <preserved attempt-1 dir> \
 *     --attempt2-root <preserved attempt-2 dir> --attempt3-root <preserved attempt-3 dir> \
 *     [--gold-supplement <repo-relative>] [--owner-adjudication <repo-relative>] \
 *     --out <destination dir>
 *
 * READ-ONLY BY CONSTRUCTION: it imports only the scoring modules. It writes
 * only into `--out`. The committed destination below is NAMED here so the
 * manifest of a derivation can record it.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAttempt4Scoring } from './attempt4Run.js';
import { emitAttempt4Outputs } from './emit.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ATTEMPT4_SCORER_REPO_ROOT = resolve(HERE, '..', '..', '..', '..', '..');

/** The destination an authorised attempt-4 derivation commits to. */
export const COMMITTED_ATTEMPT4_RESULTS_DIR =
  'docs/evaluation/results/phase2b-2d2c-dev-attribution-attempt-4-gold-v1-adjudicated';

export const GOLD_SUPPLEMENT_PATH = 'docs/evaluation/PHASE_2B_2D2C_DEV_SCORING_SUPPLEMENT_V1.json';
export const OWNER_ADJUDICATION_PATH =
  'docs/evaluation/PHASE_2B_2D2C_DEV_OWNER_ADJUDICATION_G1_V1.json';

export const ATTEMPT4_GENERATION_COMMAND =
  'node --import tsx src/test/harness/phase2b2d2c/scoring/attempt4Generate.ts ' +
  '--attempt4-root <attempt-4 root> --attempt1-root <preserved attempt-1 root> ' +
  '--attempt2-root <preserved attempt-2 root> --attempt3-root <preserved attempt-3 root> ' +
  `--gold-supplement ${GOLD_SUPPLEMENT_PATH} ` +
  `--owner-adjudication ${OWNER_ADJUDICATION_PATH} ` +
  `--out ${COMMITTED_ATTEMPT4_RESULTS_DIR}`;

export interface Attempt4GenerateOptions {
  readonly attempt4Root: string;
  readonly attempt1Root: string;
  readonly attempt2Root: string;
  readonly attempt3Root: string;
  readonly out: string;
  readonly goldSupplement?: string;
  readonly ownerAdjudication?: string;
}

export function parseAttempt4Args(argv: readonly string[]): Attempt4GenerateOptions {
  const values: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      flag === '--attempt4-root' ||
      flag === '--attempt1-root' ||
      flag === '--attempt2-root' ||
      flag === '--attempt3-root' ||
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
  const attempt4Root = values['--attempt4-root'];
  const attempt1Root = values['--attempt1-root'];
  const attempt2Root = values['--attempt2-root'];
  const attempt3Root = values['--attempt3-root'];
  const out = values['--out'];
  if (attempt4Root === undefined) throw new Error('--attempt4-root is required.');
  if (attempt1Root === undefined) throw new Error('--attempt1-root is required.');
  if (attempt2Root === undefined) throw new Error('--attempt2-root is required.');
  if (attempt3Root === undefined) throw new Error('--attempt3-root is required.');
  if (out === undefined) throw new Error('--out is required.');
  return {
    attempt4Root,
    attempt1Root,
    attempt2Root,
    attempt3Root,
    out,
    ...(values['--gold-supplement'] === undefined
      ? {}
      : { goldSupplement: values['--gold-supplement'] }),
    ...(values['--owner-adjudication'] === undefined
      ? {}
      : { ownerAdjudication: values['--owner-adjudication'] }),
  };
}

export async function generateAttempt4(
  options: Attempt4GenerateOptions,
  generationCommand = ATTEMPT4_GENERATION_COMMAND,
): Promise<{
  readonly devGateOutcome: string;
  readonly files: readonly { readonly name: string; readonly sha256: string }[];
}> {
  const run = runAttempt4Scoring(
    ATTEMPT4_SCORER_REPO_ROOT,
    options.attempt4Root,
    options.attempt1Root,
    options.attempt2Root,
    options.attempt3Root,
    options.goldSupplement,
    options.ownerAdjudication,
  );
  const files = await emitAttempt4Outputs(options.out, run.allRows, run.summary, generationCommand);
  return {
    devGateOutcome: run.summary.devGateOutcome,
    files: files.map((file) => ({ name: file.name, sha256: file.sha256 })),
  };
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  const options = parseAttempt4Args(process.argv.slice(2));
  const result = await generateAttempt4(options);
  process.stdout.write(`devGateOutcome: ${result.devGateOutcome}\n`);
  for (const file of result.files) process.stdout.write(`${file.sha256}  ${file.name}\n`);
}
