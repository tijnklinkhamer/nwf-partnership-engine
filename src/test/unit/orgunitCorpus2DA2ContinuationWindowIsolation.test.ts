/**
 * PHASE 2B-2D A2 CONTINUATION-WINDOW ISOLATION - THE NAMESPACE PLANS, VALIDATES
 * AND DECIDES, AND DOES NOTHING ELSE.
 *
 * By reading the source of `src/test/harness/phase2b2d/continuationWindow/`,
 * this file proves:
 *
 *   - the namespace holds exactly the reviewed modules;
 *   - every module except the write-once materialiser is PURE: no filesystem,
 *     socket, database, child process, environment read, clock or randomness;
 *   - the only production import is the shared canonicalizer, so no module
 *     can reach the gateway, the orchestrator, the CLI or a migration;
 *   - the historical Batch-02 gate is neither imported nor generalised;
 *   - the materialiser can only ever render the EMPTY genesis ledger: it does
 *     not import the append-preparation or planner modules, never overwrites,
 *     and prints no identity;
 *   - the root-terminal-reason list is the production union, exactly.
 *
 * It lives in src/test/unit/, not src/test/firewall/, for the same reason
 * A1, A1b, A3a and Option B did: firewall files are frozen at the
 * methodology branch point.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT_TERMINAL_REASONS } from '../harness/phase2b2d/continuationWindow/windowContract.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const DIR = join(REPO_ROOT, 'src/test/harness/phase2b2d/continuationWindow');

const FILES = [
  'materialiseContinuationArtifacts.ts',
  'replacementAppend.ts',
  'replacementLedger.ts',
  'replacementPlanner.ts',
  'replacementReason.ts',
  'windowContract.ts',
  'windowGate.ts',
  'windowPlan.ts',
];
const MATERIALISER = 'materialiseContinuationArtifacts.ts';
const PURE = FILES.filter((name) => name !== MATERIALISER);

const source = (name: string): string => readFileSync(join(DIR, name), 'utf8');
const codeOf = (name: string): string =>
  source(name)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
const importsOf = (name: string): string[] =>
  [...codeOf(name).matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]!);

describe('2D-A2 continuation isolation: the namespace', () => {
  it('holds exactly the reviewed modules', () => {
    expect(readdirSync(DIR).sort()).toEqual([...FILES].sort());
  });

  it('pure modules import only node:crypto, the canonicalizer, draw types and siblings', () => {
    for (const name of PURE) {
      for (const specifier of importsOf(name)) {
        const allowed =
          specifier === 'node:crypto' ||
          specifier === '../../../../orgunits/classify/canonical.js' ||
          specifier === '../draw/drawContract.js' ||
          /^\.\/[A-Za-z]+\.js$/.test(specifier);
        expect(allowed, `${name} imports ${specifier}`).toBe(true);
      }
    }
  });

  it('pure modules perform no IO, read no clock, environment or randomness', () => {
    for (const name of PURE) {
      const code = codeOf(name);
      for (const forbidden of [
        /node:fs/,
        /node:(net|tls|dns|http|https|child_process)/,
        /\bfetch\(/,
        /process\.env/,
        /Date\.now\(/,
        /new Date\(/,
        /Math\.random\(/,
        /from\s+['"]pg['"]/,
        /console\./,
      ]) {
        expect(forbidden.test(code), `${name} matches ${String(forbidden)}`).toBe(false);
      }
    }
  });

  it('no module reaches production beyond the canonicalizer, or the historical gate', () => {
    for (const name of FILES) {
      for (const specifier of importsOf(name)) {
        if (specifier.includes('orgunits/')) {
          expect(specifier, name).toBe('../../../../orgunits/classify/canonical.js');
        }
        expect(specifier.includes('acquisitionGate'), `${name} imports the Batch-02 gate`).toBe(
          false,
        );
        expect(
          /\/(web|orchestrator|cli|db)\//.test(specifier),
          `${name} imports ${specifier}`,
        ).toBe(false);
      }
    }
  });

  it('draw types are imported as TYPES only by the pure modules', () => {
    for (const name of PURE) {
      for (const line of codeOf(name).split('\n')) {
        if (line.includes("'../draw/drawContract.js'"))
          expect(line.trimStart().startsWith('import type'), name).toBe(true);
      }
    }
  });
});

describe('2D-A2 continuation isolation: the materialiser can only write the genesis', () => {
  const code = codeOf(MATERIALISER);

  it('imports no append, planner, gate or reason module', () => {
    for (const specifier of importsOf(MATERIALISER)) {
      expect(
        /replacementAppend|replacementPlanner|windowGate|replacementReason/.test(specifier),
        specifier,
      ).toBe(false);
    }
    expect(code).toContain('buildGenesisReplacementLedger()');
    expect(code).toContain('ledger.entries.length !== 0');
  });

  it('never overwrites: exclusive create, and an existing different file is a STOP', () => {
    expect(code).toContain("flag: 'wx'");
    expect(code).toContain('never overwrites');
    expect(code.match(/writeFileSync\(/g)).toHaveLength(1);
  });

  it('opens no socket and no database, and prints no identity', () => {
    for (const forbidden of [
      /node:(net|tls|dns|http|https|child_process)/,
      /\bfetch\(/,
      /from\s+['"]pg['"]/,
    ]) {
      expect(forbidden.test(code)).toBe(false);
    }
    for (const line of code.split('\n').filter((l) => l.includes('console.'))) {
      expect(/echeRowKey|organisationId|rankHash|rootAuthorit/.test(line), line).toBe(false);
    }
  });
});

describe('2D-A2 continuation isolation: frozen vocabularies match production and governance', () => {
  it('ROOT_TERMINAL_REASONS is exactly the production RootTerminalReason union', () => {
    const runner = readFileSync(join(REPO_ROOT, 'src/orgunits/orchestrator/rootRunner.ts'), 'utf8');
    const union = runner.slice(
      runner.indexOf('export type RootTerminalReason'),
      runner.indexOf(';', runner.indexOf('export type RootTerminalReason')),
    );
    const literals = [...union.matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]!);
    expect(union).toContain('typeof TOTAL_REQUEST_BUDGET_EXHAUSTED_REASON');
    const budget = readFileSync(
      join(REPO_ROOT, 'src/orgunits/orchestrator/requestBudget.ts'),
      'utf8',
    );
    expect(budget).toContain(
      "TOTAL_REQUEST_BUDGET_EXHAUSTED_REASON = 'TOTAL_REQUEST_BUDGET_EXHAUSTED'",
    );
    expect([...ROOT_TERMINAL_REASONS].sort()).toEqual(
      [...literals, 'TOTAL_REQUEST_BUDGET_EXHAUSTED'].sort(),
    );
  });

  it('the new evaluation filenames avoid the reserved tokens', () => {
    for (const name of readdirSync(join(REPO_ROOT, 'docs/evaluation')).filter((n) =>
      n.startsWith('PHASE_2B_2D_A2_'),
    )) {
      expect(name).not.toMatch(/authorisation|consumption/i);
    }
  });
});
