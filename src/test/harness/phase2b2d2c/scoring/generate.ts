/**
 * PHASE 2B-2D2C-F4 — THE DERIVATION ENTRY POINT.
 *
 *   node --import tsx src/test/harness/phase2b2d2c/scoring/generate.ts \
 *     --output-root <preserved attempt dir> --out <destination dir>
 *
 * READ-ONLY BY CONSTRUCTION: it imports only the scoring modules, which in
 * turn import only pure production helpers, the artifact reader, the freeze
 * and corpus loaders and the batch/plan builders. It imports NOTHING that
 * can run inference, authenticate, reach a database or launch a child
 * process — no `cli.ts`, no `coordinator.ts`, no `childMain.ts`, no
 * `runtimeLoader.ts`, no `variantRoot.ts`, no `authorisation.ts`.
 *
 * It writes only into `--out`.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emitOutputs } from './emit.js';
import { runScoring } from './run.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const SCORER_REPO_ROOT = resolve(HERE, '..', '..', '..', '..', '..');

export const COMMITTED_RESULTS_DIR =
  'docs/evaluation/results/phase2b-2d2c-dev-attribution-attempt-1';

/**
 * The command recorded in the manifest. It names the COMMITTED destination
 * and the preserved attempt root, never the temporary directory a
 * reproducibility check happens to use — otherwise two byte-identical
 * derivations would disagree in their manifests for no substantive reason.
 */
export const GENERATION_COMMAND =
  'node --import tsx src/test/harness/phase2b2d2c/scoring/generate.ts ' +
  '--output-root <preserved attempt-1 root> ' +
  `--out ${COMMITTED_RESULTS_DIR}`;

export interface GenerateOptions {
  readonly outputRoot: string;
  readonly out: string;
}

export function parseArgs(argv: readonly string[]): GenerateOptions {
  let outputRoot: string | null = null;
  let out: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === '--output-root') {
      if (value === undefined) throw new Error('--output-root needs a value.');
      outputRoot = value;
      index += 1;
    } else if (flag === '--out') {
      if (value === undefined) throw new Error('--out needs a value.');
      out = value;
      index += 1;
    } else {
      throw new Error(`unknown argument ${String(flag)}`);
    }
  }
  if (outputRoot === null) throw new Error('--output-root is required.');
  if (out === null) throw new Error('--out is required.');
  return { outputRoot, out };
}

export function generate(
  options: GenerateOptions,
  generationCommand = GENERATION_COMMAND,
): {
  readonly recommendation: string;
  readonly files: readonly { readonly name: string; readonly sha256: string }[];
} {
  const run = runScoring(SCORER_REPO_ROOT, options.outputRoot);
  const emitted = emitOutputs(options.out, run.allRows, run.summary, generationCommand);
  return {
    recommendation: run.summary.recommendation,
    files: emitted.files.map((file) => ({ name: file.name, sha256: file.sha256 })),
  };
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  const options = parseArgs(process.argv.slice(2));
  const result = generate(options);
  process.stdout.write(`recommendation: ${result.recommendation}\n`);
  for (const file of result.files) process.stdout.write(`${file.sha256}  ${file.name}\n`);
}
