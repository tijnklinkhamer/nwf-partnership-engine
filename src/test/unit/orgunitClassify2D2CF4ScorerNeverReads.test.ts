/**
 * PHASE 2B-2D2C-F4 — THE SCORER OPENS NO NEVER-READ FILE, PROVED AT RUNTIME.
 *
 * The F4 firewall test proves this statically, over the scorer's transitive
 * import graph. This file proves it BEHAVIOURALLY: `node:fs` is mocked for
 * the whole module, every `readFileSync` / `readdirSync` path a real scoring
 * pass touches is recorded, and the recording is checked against the
 * freeze's own `holdoutFilesNeverRead` list plus every gold and adjudication
 * fixture.
 *
 * `node:fs` is mocked at module scope, which is why this check lives in its
 * own file rather than alongside the scorer's other tests.
 *
 * Skipped, visibly, when `PHASE2B_2D2C_ATTEMPT1_ROOT` does not name the
 * preserved attempt — that evidence lives outside every worktree.
 */
import type * as NodeFs from 'node:fs';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const opened: string[] = [];

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFs>();
  const record = (path: unknown): void => {
    if (typeof path === 'string') opened.push(path);
    else if (path instanceof URL) opened.push(path.pathname);
    else if (Buffer.isBuffer(path)) opened.push(path.toString('utf8'));
  };
  return {
    ...actual,
    readFileSync: ((path: never, ...rest: never[]) => {
      record(path);
      return actual.readFileSync(path, ...rest);
    }) as typeof actual.readFileSync,
    readdirSync: ((path: never, ...rest: never[]) => {
      record(path);
      return actual.readdirSync(path, ...rest);
    }) as typeof actual.readdirSync,
  };
});

const ATTEMPT_ROOT = process.env['PHASE2B_2D2C_ATTEMPT1_ROOT'] ?? '';
const ATTEMPT_PRESENT = ATTEMPT_ROOT !== '' && existsSync(ATTEMPT_ROOT);

describe.skipIf(!ATTEMPT_PRESENT)('a real F4 scoring pass opens no forbidden file', () => {
  it('touches neither never-read file, nor any gold or adjudication fixture', async () => {
    const { runScoring } = await import('../harness/phase2b2d2c/scoring/run.js');
    const { SCORER_REPO_ROOT } = await import('../harness/phase2b2d2c/scoring/generate.js');
    const freeze: unknown = JSON.parse(
      readFileSync(
        join(SCORER_REPO_ROOT, 'docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_V1.json'),
        'utf8',
      ),
    );
    const neverRead = (freeze as { corpus: { holdoutFilesNeverRead: string[] } }).corpus
      .holdoutFilesNeverRead;
    expect(neverRead.length).toBeGreaterThan(0);

    opened.length = 0;
    const run = runScoring(SCORER_REPO_ROOT, ATTEMPT_ROOT);
    expect(run.paired).toHaveLength(49);
    // The mock really intercepted: a real pass reads hundreds of files.
    expect(opened.length).toBeGreaterThan(200);

    const forbiddenNames = [
      ...neverRead.map((path) => path.split('/').pop() ?? path),
      'orgunit-classifier-gold-v1.jsonl',
      'orgunit-classifier-adjudication-v1.jsonl',
      'orgunit-classifier-injection-v1.jsonl',
    ];
    const violations = opened.filter((path) =>
      forbiddenNames.some((name) => path.endsWith(`/${name}`) || path === name),
    );
    expect(violations).toEqual([]);

    // The one evaluation fixture it DOES read is the DEVELOPMENT-only corpus.
    expect(
      opened.some((path) =>
        path.endsWith('orgunit-classifier-sonnet-acceptance-v1-canonical-v2.jsonl'),
      ),
    ).toBe(true);
  });
});
