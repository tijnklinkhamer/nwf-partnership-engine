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

/** F4A: the gold-backed derivation. The blocked F4 directory is never rewritten. */
export const COMMITTED_GOLD_RESULTS_DIR =
  'docs/evaluation/results/phase2b-2d2c-dev-attribution-attempt-1-gold-v1';

export const GOLD_SUPPLEMENT_PATH = 'docs/evaluation/PHASE_2B_2D2C_DEV_SCORING_SUPPLEMENT_V1.json';

/**
 * G2: the post-adjudication derivation. A SEPARATE directory, because the
 * pre-adjudication result is evidence of what was concluded before the owner
 * answered and is never rewritten.
 */
export const COMMITTED_ADJUDICATED_RESULTS_DIR =
  'docs/evaluation/results/phase2b-2d2c-dev-attribution-attempt-1-gold-v1-adjudicated';

export const OWNER_ADJUDICATION_PATH =
  'docs/evaluation/PHASE_2B_2D2C_DEV_OWNER_ADJUDICATION_G1_V1.json';

export const ADJUDICATED_GENERATION_COMMAND =
  'node --import tsx src/test/harness/phase2b2d2c/scoring/generate.ts ' +
  '--output-root <preserved attempt-1 root> ' +
  `--gold-supplement ${GOLD_SUPPLEMENT_PATH} ` +
  `--owner-adjudication ${OWNER_ADJUDICATION_PATH} ` +
  `--out ${COMMITTED_ADJUDICATED_RESULTS_DIR}`;

export const GOLD_GENERATION_COMMAND =
  'node --import tsx src/test/harness/phase2b2d2c/scoring/generate.ts ' +
  '--output-root <preserved attempt-1 root> ' +
  `--gold-supplement ${GOLD_SUPPLEMENT_PATH} ` +
  `--out ${COMMITTED_GOLD_RESULTS_DIR}`;

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
  /** Repository-relative path to the F4A scoring-only gold supplement, if any. */
  readonly goldSupplement?: string;
  /** Repository-relative path to the G2 owner-adjudication record, if any. */
  readonly ownerAdjudication?: string;
}

export function parseArgs(argv: readonly string[]): GenerateOptions {
  let outputRoot: string | null = null;
  let out: string | null = null;
  let goldSupplement: string | null = null;
  let ownerAdjudication: string | null = null;
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
    } else if (flag === '--gold-supplement') {
      if (value === undefined) throw new Error('--gold-supplement needs a value.');
      goldSupplement = value;
      index += 1;
    } else if (flag === '--owner-adjudication') {
      if (value === undefined) throw new Error('--owner-adjudication needs a value.');
      ownerAdjudication = value;
      index += 1;
    } else {
      throw new Error(`unknown argument ${String(flag)}`);
    }
  }
  if (outputRoot === null) throw new Error('--output-root is required.');
  if (out === null) throw new Error('--out is required.');
  return {
    outputRoot,
    out,
    ...(goldSupplement === null ? {} : { goldSupplement }),
    ...(ownerAdjudication === null ? {} : { ownerAdjudication }),
  };
}

export async function generate(
  options: GenerateOptions,
  generationCommand = options.goldSupplement === undefined
    ? GENERATION_COMMAND
    : options.ownerAdjudication === undefined
      ? GOLD_GENERATION_COMMAND
      : ADJUDICATED_GENERATION_COMMAND,
): Promise<{
  readonly recommendation: string;
  readonly files: readonly { readonly name: string; readonly sha256: string }[];
}> {
  const run = runScoring(
    SCORER_REPO_ROOT,
    options.outputRoot,
    options.goldSupplement,
    options.ownerAdjudication,
  );
  const emitted = await emitOutputs(options.out, run.allRows, run.summary, generationCommand);
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
  const result = await generate(options);
  process.stdout.write(`recommendation: ${result.recommendation}\n`);
  for (const file of result.files) process.stdout.write(`${file.sha256}  ${file.name}\n`);
}
