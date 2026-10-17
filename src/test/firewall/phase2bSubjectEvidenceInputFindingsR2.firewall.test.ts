/**
 * TRACK B, B2.4-R2 - THE ISOLATION TEST FOR THE INPUT-SCOPED FINDING
 * CONSISTENCY REPAIR OF `nwf-pe.discovery-subject-evidence.v1-provisional`.
 *
 * Per the phase-isolation convention this repair is pinned by its OWN
 * repair-scope file over its OWN range, REPAIR_BASE_COMMIT (the accepted
 * B2.4 tip) to REPAIR_TERMINAL_COMMIT. It proves, from the real git range and
 * the real source:
 *
 *   - the change set is EXACTLY one modified production file
 *     (`subjectHandoff/project.ts`), one new unit test and this firewall;
 *     B2.1, B2.2, B2.3, B3.0, the B2.4 contract and findings modules, the
 *     B2.4 unit test and firewall, every migration and the CLI are untouched;
 *   - the B2.4 firewall keeps its terminal pin;
 *   - the repaired projection imports exactly what it imported, still runs
 *     the accepted read model and validator once each, and every advisory
 *     value it can now emit already existed - no contract, enum or schema
 *     change.
 * What cannot be proven statically (the advisory gate, byte stability of
 * documents without an input-scoped finding, mutation detection) is proven
 * by discoverySubjectEvidenceB24R2.test.ts.
 *
 * THE RANGE IS OPEN to the working tree while the repair is uncommitted; the
 * terminal pin belongs to a separately authorised commit-closure phase.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { SUBJECT_EVIDENCE_CONTRACT } from '../../orgunits/subjectHandoff/contract.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** The accepted B2.4 tip (implementation 766530c + firewall pin). */
const REPAIR_BASE_COMMIT = '96ef2aa734dc48cc786204063f5343fc26589bf3';

/** Open (null) until a separately authorised commit-closure phase pins it. */
const REPAIR_TERMINAL_COMMIT: string | null = null;

const PROJECT = 'src/orgunits/subjectHandoff/project.ts';
const UNIT_TEST = 'src/test/unit/discoverySubjectEvidenceB24R2.test.ts';
const FIREWALL = 'src/test/firewall/phase2bSubjectEvidenceInputFindingsR2.firewall.test.ts';
const B24_FIREWALL = 'src/test/firewall/phase2bSubjectEvidenceProjection.firewall.test.ts';
const B24_TERMINAL_PIN = '766530cce66ff61df2cf2dc8543f95e73f897ade';

const AUTHORISED_CHANGESET = [`M\t${PROJECT}`, `A\t${UNIT_TEST}`, `A\t${FIREWALL}`].sort();

function commitExists(commit: string): boolean {
  try {
    execFileSync('git', ['-C', REPO_ROOT, 'cat-file', '-e', `${commit}^{commit}`], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

const rangeAvailable =
  commitExists(REPAIR_BASE_COMMIT) &&
  (REPAIR_TERMINAL_COMMIT === null || commitExists(REPAIR_TERMINAL_COMMIT));

const range = (): string[] =>
  REPAIR_TERMINAL_COMMIT === null
    ? [REPAIR_BASE_COMMIT]
    : [REPAIR_BASE_COMMIT, REPAIR_TERMINAL_COMMIT];

/** `--name-status` lines over the range, plus untracked files as `A` while the range is open. */
function changeset(): string[] {
  const tracked = execFileSync(
    'git',
    ['-C', REPO_ROOT, 'diff', '--name-status', '--find-renames', ...range()],
    { encoding: 'utf8' },
  );
  const untracked =
    REPAIR_TERMINAL_COMMIT === null
      ? execFileSync('git', ['-C', REPO_ROOT, 'ls-files', '--others', '--exclude-standard'], {
          encoding: 'utf8',
        })
          .split('\n')
          .filter((l) => l.length > 0)
          .map((l) => `A\t${l}`)
          .join('\n')
      : '';
  return [...new Set(`${tracked}\n${untracked}`.split('\n').filter((l) => l.length > 0))].sort();
}

const baseSourceOf = (path: string): string =>
  execFileSync('git', ['-C', REPO_ROOT, 'show', `${REPAIR_BASE_COMMIT}:${path}`], {
    encoding: 'utf8',
  });

function sourceOf(path: string): string {
  if (REPAIR_TERMINAL_COMMIT === null) return readFileSync(join(REPO_ROOT, path), 'utf8');
  return execFileSync('git', ['-C', REPO_ROOT, 'show', `${REPAIR_TERMINAL_COMMIT}:${path}`], {
    encoding: 'utf8',
  });
}

const codeOf = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const importsOf = (source: string): string[] =>
  [...codeOf(source).matchAll(/import[\s\S]*?from '([^']+)';/g)].map((m) => m[0]).sort();

const describeRange = rangeAvailable ? describe : describe.skip;

describeRange('B2.4-R2 input-scoped finding repair: the change stays inside its scope', () => {
  it('changes exactly the authorised files, by path and status', () => {
    expect(changeset()).toEqual(AUTHORISED_CHANGESET);
  });

  it('leaves the B2.4 firewall, and its terminal pin, exactly as accepted', () => {
    expect(sourceOf(B24_FIREWALL)).toBe(baseSourceOf(B24_FIREWALL));
    expect(sourceOf(B24_FIREWALL)).toContain(
      `const REPAIR_TERMINAL_COMMIT: string | null = '${B24_TERMINAL_PIN}';`,
    );
  });

  it('imports exactly what the accepted projection imported', () => {
    expect(importsOf(sourceOf(PROJECT))).toEqual(importsOf(baseSourceOf(PROJECT)));
  });

  it('still runs the accepted read model and validator once each, and exports nothing new', () => {
    const code = codeOf(sourceOf(PROJECT));
    expect(code.match(/deriveSubjectReadModel\(/g)).toHaveLength(1);
    expect(code.match(/validateIdentityGraph\(/g)).toHaveLength(1);
    const exported = (s: string) =>
      [...codeOf(s).matchAll(/^export [a-z]+ (\w+)/gm)].map((m) => m[1]);
    expect(exported(sourceOf(PROJECT))).toEqual(exported(baseSourceOf(PROJECT)));
    expect(code).not.toMatch(/export function advisoryIdentityOf/);
  });

  it('changes no contract identifier and emits no value the accepted tree did not already define', () => {
    expect(SUBJECT_EVIDENCE_CONTRACT).toBe('nwf-pe.discovery-subject-evidence.v1-provisional');
    const literals = (s: string) =>
      new Set([...codeOf(s).matchAll(/'([A-Z][A-Z0-9_]+)'/g)].map((m) => m[1]!));
    const accepted = new Set([
      ...literals(baseSourceOf(PROJECT)),
      ...literals(baseSourceOf('src/orgunits/subjectRegistry/readModel.ts')),
      ...literals(baseSourceOf('src/orgunits/subjectHandoff/findings.ts')),
    ]);
    const added = [...literals(sourceOf(PROJECT))].filter((l) => !accepted.has(l));
    expect(added).toEqual([]);
  });

  it('keeps the projection advisory: no permission, issuance or research grant was added', () => {
    const code = codeOf(sourceOf(PROJECT));
    expect(code).toContain('granted: false,');
    expect(code).toContain('permissions: PERMISSIONS,');
    expect(code).not.toMatch(/granted: true|'GRANTED'|'ALLOWED'|'ISSUED'/);
  });

  it('adds a unit test with no skip, no focus and no timeout override', () => {
    const test = codeOf(sourceOf(UNIT_TEST));
    expect(test).not.toMatch(/\.(skip|only|todo)\(|describe\.skip|it\.skip|timeout/);
    expect(test).not.toMatch(
      /ReviewTrustSet\.ephemeralForVitest|OPERATIONAL_OWNER_REVIEW_KEYS\s*=/,
    );
  });
});
