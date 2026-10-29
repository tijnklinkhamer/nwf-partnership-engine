/**
 * PHASE 2B-2D2C-F2B — closure of three operationally stale F0A references.
 *
 * `cli.ts`'s and `childMain.ts`'s own module documentation, and one
 * emitted `CORPUS_CONFIG_OR_HASH_DRIFT` message in `childMain.ts`, still
 * named the superseded F0A freeze after the runner was rebound to F0B
 * (2D2C-F1A/F0B). This pins the corrected wording by exact string and
 * pins that every INTENTIONAL historical F0A reference — the superseded
 * hash constant, the F0A input-construction contract, the F0/F0A/F0B
 * revision history, and the F0A-superseded fixture — is untouched.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CLI_SOURCE = readFileSync(join(ROOT, 'src/test/harness/phase2b2d2c/cli.ts'), 'utf8');
const CHILD_MAIN_SOURCE = readFileSync(
  join(ROOT, 'src/test/harness/phase2b2d2c/childMain.ts'),
  'utf8',
);
const CONSTANTS_SOURCE = readFileSync(
  join(ROOT, 'src/test/harness/phase2b2d2c/constants.ts'),
  'utf8',
);
const BATCHES_SOURCE = readFileSync(join(ROOT, 'src/test/harness/phase2b2d2c/batches.ts'), 'utf8');

describe('2D2C-F2B: the three stale operational F0A strings never return', () => {
  it('cli.ts documents hash-verifying the F0B freeze, not the F0A freeze', () => {
    expect(CLI_SOURCE).not.toContain('hash-verifies the F0A freeze');
    expect(CLI_SOURCE).toContain('hash-verifies the F0B freeze');
  });

  it('childMain.ts documents re-verifying the F0B freeze bytes, not the F0A freeze bytes', () => {
    expect(CHILD_MAIN_SOURCE).not.toContain('re-verifies the F0A freeze bytes');
    expect(CHILD_MAIN_SOURCE).toContain('re-verifies the F0B freeze bytes');
  });

  it('childMain.ts emits the F0B hash-mismatch message, not the F0A one', () => {
    expect(CHILD_MAIN_SOURCE).not.toContain('the manifest freeze hash is not the F0A hash.');
    expect(CHILD_MAIN_SOURCE).toContain('the manifest freeze hash is not the F0B hash.');
  });
});

describe('2D2C-F2B: intentional historical F0A references survive the closure', () => {
  it('constants.ts still names and refuses the superseded F0A hash by exact value', () => {
    expect(CONSTANTS_SOURCE).toContain('SUPERSEDED_F0A_FREEZE_RAW_SHA256');
    expect(CONSTANTS_SOURCE).toContain('superseded F0A');
  });

  it("batches.ts still attributes the input-construction contract to F0A's audit section", () => {
    expect(BATCHES_SOURCE).toContain('F0A §13.3 input-construction contract');
  });

  it('the F0A-superseded freeze fixture is still present on disk', () => {
    expect(() =>
      readFileSync(join(ROOT, 'src/test/fixtures/phase2b2d2c/freeze-f0a-superseded.json'), 'utf8'),
    ).not.toThrow();
  });
});
