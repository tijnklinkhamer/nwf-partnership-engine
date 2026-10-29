/**
 * PHASE 2B-2D2C-F4A — THE FORMATTER STILL SEES `docs/evaluation/results/`.
 *
 * F4 excluded that whole directory from Prettier. A whole-directory rule buys
 * byte-stability for the files that exist today at the price of hiding every
 * file that lands there tomorrow — the blind spot 2D2B-1 acceptance closed.
 * F4A withdrew it and named the exact `.jsonl` paths instead.
 *
 * These are EXECUTABLE probes, not a reading of the ignore file: each asks
 * Prettier itself, through its own API and this repository's own
 * `.prettierignore`, what it would do. A deliberately misformatted file is
 * written under the results directory and Prettier is required to flag it.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { check, getFileInfo, resolveConfig } from 'prettier';
import { afterAll, describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const IGNORE_PATH = join(REPO_ROOT, '.prettierignore');
const RESULTS_DIR = join(REPO_ROOT, 'docs/evaluation/results');

async function isIgnored(absolutePath: string): Promise<boolean> {
  return (await getFileInfo(absolutePath, { ignorePath: IGNORE_PATH })).ignored;
}

/** Exactly what `prettier --check <file>` decides for a file on disk. */
async function passesPrettierCheck(absolutePath: string, text: string): Promise<boolean> {
  const info = await getFileInfo(absolutePath, { ignorePath: IGNORE_PATH });
  if (info.ignored || info.inferredParser === null) return true;
  const options = await resolveConfig(absolutePath);
  return check(text, { ...(options ?? {}), filepath: absolutePath });
}

describe('the Prettier exclusion under docs/evaluation/results/ is file-scoped, not directory-scoped', () => {
  const scratch = mkdtempSync(join(RESULTS_DIR, 'f4a-formatting-probe-'));
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  it('flags a deliberately unformatted JSON file that lands under the results directory', async () => {
    const file = join(scratch, 'unrelated-future-output.json');
    const unformatted = '{"b":1,   "a":  [2,3]}';
    writeFileSync(file, unformatted, 'utf8');
    expect(await isIgnored(file)).toBe(false);
    expect(await passesPrettierCheck(file, unformatted)).toBe(false);
  });

  it('flags a deliberately unformatted Markdown file that lands under the results directory', async () => {
    const file = join(scratch, 'unrelated-future-note.md');
    const unformatted = '#    A heading with   stray spacing\n\n*  a\n*  b\n';
    writeFileSync(file, unformatted, 'utf8');
    expect(await isIgnored(file)).toBe(false);
    expect(await passesPrettierCheck(file, unformatted)).toBe(false);
  });

  it('flags an unformatted summary.json in a results attempt directory that did not exist before', async () => {
    const nested = join(scratch, 'phase2b-2d2c-some-future-attempt');
    mkdirSync(nested, { recursive: true });
    const file = join(nested, 'summary.json');
    const unformatted = '{"x":  1}';
    writeFileSync(file, unformatted, 'utf8');
    expect(await isIgnored(file)).toBe(false);
    expect(await passesPrettierCheck(file, unformatted)).toBe(false);
  });

  it('exempts the two named scored-items.jsonl paths and nothing else beside them', async () => {
    for (const attempt of [
      'phase2b-2d2c-dev-attribution-attempt-1',
      'phase2b-2d2c-dev-attribution-attempt-1-gold-v1',
    ]) {
      expect(await isIgnored(join(RESULTS_DIR, attempt, 'scored-items.jsonl'))).toBe(true);
      expect(await isIgnored(join(RESULTS_DIR, attempt, 'summary.json'))).toBe(false);
      expect(await isIgnored(join(RESULTS_DIR, attempt, 'manifest.json'))).toBe(false);
    }
  });

  it('preserves the two earlier frozen-artifact exclusions', async () => {
    const fixture = 'src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-v1.jsonl';
    const audit = 'docs/audits/PHASE_2B_SHADOW_REVALIDATION_15_ORG_2026-08.md';
    expect(await isIgnored(join(REPO_ROOT, fixture))).toBe(true);
    expect(await isIgnored(join(REPO_ROOT, audit))).toBe(true);
  });

  it('keeps the committed results JSON formatter-clean, so no exclusion is needed for it', async () => {
    for (const attempt of ['phase2b-2d2c-dev-attribution-attempt-1']) {
      for (const name of ['summary.json', 'manifest.json']) {
        const file = join(RESULTS_DIR, attempt, name);
        expect(
          await passesPrettierCheck(file, readFileSync(file, 'utf8')),
          `${relative(REPO_ROOT, file)} is not Prettier-clean`,
        ).toBe(true);
      }
    }
  });
});
