/**
 * PHASE 2B-2D2C-F9 — THE ONE F6 DEV SCORING ENTRY POINT.
 *
 *   node --import tsx src/test/harness/phase2b2d2c/f9/cliF9.ts --out <absolute new file>
 *
 * Refuses unless the runner repository is clean and its HEAD equals its
 * upstream, so the result can bind an exact committed scoring build. Writes
 * exactly one new file (exclusive create; an existing file is never
 * overwritten), outside the study root and the repository. There is no flag
 * naming a slot, a gold source, a threshold or a study root.
 *
 * No network, no database, no provider, no auth, no child process other than
 * read-only `git`.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { F6_CONTROL_ROOT, F6_STUDY_ROOT } from '../f6/studyPlanCoreF6.js';
import { buildF9ScoringResult, f9ScoringResultBytes } from './resultF9.js';
import { runF9F6DevScoring } from './scoreF6StudyF9.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');

function git(args: readonly string[]): string {
  return execFileSync('git', ['-C', REPO_ROOT, ...args], {
    encoding: 'utf8',
    shell: false,
    timeout: 30_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function main(argv: readonly string[]): number {
  if (argv.length !== 2 || argv[0] !== '--out') {
    process.stderr.write('usage: cliF9.ts --out <absolute path of a new result file>\n');
    return 2;
  }
  const out = argv[1]!;
  if (!isAbsolute(out) || normalize(out) !== out) {
    process.stderr.write('REFUSED: --out must be an absolute, normalised path.\n');
    return 2;
  }
  for (const container of [F6_STUDY_ROOT, F6_CONTROL_ROOT, REPO_ROOT]) {
    if (out === container || out.startsWith(`${container}/`)) {
      process.stderr.write(`REFUSED: --out may not lie inside ${container}.\n`);
      return 2;
    }
  }
  if (git(['status', '--porcelain']) !== '') {
    process.stderr.write('REFUSED: the runner repository is not clean.\n');
    return 2;
  }
  const head = git(['rev-parse', 'HEAD']);
  if (git(['rev-parse', '@{upstream}']) !== head) {
    process.stderr.write('REFUSED: HEAD is not equal to its upstream.\n');
    return 2;
  }
  const run = runF9F6DevScoring(REPO_ROOT);
  const bytes = Buffer.from(
    f9ScoringResultBytes(buildF9ScoringResult(run, { scoringBuildCommit: head })),
    'utf8',
  );
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, bytes, { flag: 'wx' });
  process.stdout.write(
    `${JSON.stringify(
      {
        out,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        bytes: bytes.length,
        scoringBuildCommit: head,
        decision: run.decision,
      },
      null,
      2,
    )}\n`,
  );
  return 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
