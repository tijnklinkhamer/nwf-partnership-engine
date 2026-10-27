/**
 * REL FINAL JOIN A2 FIREWALL - the subject facts export is READ-ONLY,
 * claim-derived and contact-free, and reaches the database only through its
 * own loader.
 *
 * Pins (working tree):
 *   - `src/orgunits/subjectFacts/` is exactly `facts.ts` and `load.ts`;
 *   - `facts.ts` imports exactly node:crypto and R4's standing derivation and
 *     record type (the ONE exact-path exception the R4 firewall records); it
 *     opens no socket, database, file, environment, clock or randomness;
 *   - `load.ts` imports exactly `./facts.js` and the pg TYPE; it issues only
 *     SELECTs inside `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, ends in
 *     ROLLBACK, and names exactly the tables it is reviewed to read;
 *   - the CLI command connects as the `readonly` role only, writes no file,
 *     and has no `--all`; only it and the CLI entry reach the module;
 *   - every permission is `NONE`, and no contact-, verdict- or score-shaped
 *     property is declared.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PERMISSIONS } from '../../orgunits/subjectFacts/facts.js';
import {
  REPO_ROOT,
  codeOf,
  productionFiles,
  readCurrent,
  specifiers,
} from '../helpers/phaseRange.js';

const MODULE_DIR = 'src/orgunits/subjectFacts/';
const FACTS = `${MODULE_DIR}facts.ts`;
const LOAD = `${MODULE_DIR}load.ts`;
const CLI = 'src/cli/commands/subjectFacts.ts';
const CLI_ENTRY = 'src/cli/index.ts';
/** REL P1: the qualification-input export's builder and loader (facts.ts only). */
const REL_P1_IMPORTERS = [
  'src/orgunits/qualificationInput/build.ts',
  'src/orgunits/qualificationInput/load.ts',
];

/** The relations the loader reads, all SELECT-granted to nwf_readonly (0005, 0007, 0013, 0016, 0019). */
const READABLE = [
  'discovery_subject_identity_claims',
  'discovery_subject_reviews',
  'discovery_subjects',
  'orgunit_fetch_observations',
  'orgunit_page_evidence',
  'source_discovery_nominations',
  'subject_jurisdiction_claims',
  'website_claims',
];

/** Template-literal SQL statements of a file, interpolations blanked. */
function sqlOf(path: string): string[] {
  return [...codeOf(readCurrent(path)).matchAll(/`([^`]*)`/g)]
    .map((m) => m[1]!.replace(/\$\{[^}]*\}/g, 'X'))
    .filter((t) => /\b(SELECT|INSERT|UPDATE|DELETE|BEGIN|ROLLBACK|COMMIT)\b/.test(t));
}

describe('REL final join A2: the subject facts module', () => {
  it('is exactly two files', () => {
    const files = readdirSync(join(REPO_ROOT, MODULE_DIR)).sort();
    expect(files).toEqual(['facts.ts', 'load.ts']);
  });

  it('facts.ts imports exactly node:crypto and R4 standing, and is pure', () => {
    const code = codeOf(readCurrent(FACTS));
    expect([...new Set(specifiers(code))].sort()).toEqual(
      [
        'node:crypto',
        '../subjectJurisdiction/standing.js',
        '../subjectJurisdiction/vocabulary.js',
      ].sort(),
    );
    expect(code).not.toMatch(
      /process\.|\bfetch\s*\(|from 'pg'|Date\.now|new Date\b|Math\.random|readFile|writeFile|\b(SELECT|INSERT|UPDATE|DELETE)\b\s/,
    );
  });

  it('load.ts imports exactly ./facts.js and the pg type', () => {
    const code = codeOf(readCurrent(LOAD));
    expect([...new Set(specifiers(code))].sort()).toEqual(['./facts.js', 'pg'].sort());
    expect(code).toMatch(/^import type pg from 'pg';$/m);
    expect(code).not.toMatch(/process\.|\bfetch\s*\(|node:|Date\.now|new Date\b|Math\.random/);
  });

  it('load.ts reads only, in one READ ONLY transaction that ends in ROLLBACK', () => {
    const code = codeOf(readCurrent(LOAD));
    expect(code).toContain(
      "await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');",
    );
    expect(code).not.toMatch(/'COMMIT'/);
    expect(code.match(/client\.query\('ROLLBACK'\)/g)).toHaveLength(2);
    const statements = sqlOf(LOAD);
    expect(statements.length).toBeGreaterThanOrEqual(8);
    for (const s of statements) {
      expect(s.trim(), s).toMatch(/^SELECT\b/);
      expect(s).not.toMatch(
        /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|GRANT|FOR UPDATE)\b/,
      );
    }
    const tables = new Set(
      statements.flatMap((s) => [...s.matchAll(/\b(?:FROM|JOIN)\s+([a-z_]+)/g)].map((m) => m[1]!)),
    );
    expect([...tables].sort()).toEqual(READABLE);
  });

  it('the CLI is read-only: the readonly role, no file written, no --all', () => {
    const code = codeOf(readCurrent(CLI));
    expect(code.match(/createPool\('(\w+)'\)/g)).toEqual(["createPool('readonly')"]);
    expect(code).not.toMatch(/writeFile|createWriteStream|appendFile|--all|'all'|execute/);
    expect([...new Set(specifiers(code))].sort()).toEqual(
      [
        'node:util',
        'pg',
        '../../db/client.js',
        '../../orgunits/subjectFacts/facts.js',
        '../../orgunits/subjectFacts/load.js',
      ].sort(),
    );
  });

  it('only the CLI command and the CLI entry reach the module', () => {
    const importers = productionFiles().filter(
      (f) =>
        !f.startsWith(MODULE_DIR) &&
        specifiers(codeOf(readFileSync(join(REPO_ROOT, f), 'utf8'))).some((s) =>
          /subjectFacts/.test(s),
        ),
    );
    // REL P1, by exact path: the C1 qualification-input export reuses the pure
    // nomination-citation digest and the jurisdiction record type (facts.ts only).
    // WW E-W (exact-path widening, ADR 0030 s6): the acquisition outbox writes
    // this export verbatim, through ONE re-export of the read-only loader.
    const WW_EW_EXPORT_PORT = 'src/orgunits/acquisitionWiring/exportPort.ts';
    expect(importers).toEqual([CLI, CLI_ENTRY, ...REL_P1_IMPORTERS, WW_EW_EXPORT_PORT].sort());
    expect(
      specifiers(codeOf(readFileSync(join(REPO_ROOT, WW_EW_EXPORT_PORT), 'utf8'))).filter((s) =>
        /subjectFacts/.test(s),
      ),
    ).toEqual(['../subjectFacts/load.js']);
    for (const f of REL_P1_IMPORTERS) {
      expect(
        specifiers(codeOf(readFileSync(join(REPO_ROOT, f), 'utf8'))).filter((s) =>
          /subjectFacts/.test(s),
        ),
        f,
      ).toEqual(['../subjectFacts/facts.js']);
    }
    expect(
      specifiers(codeOf(readCurrent(CLI_ENTRY))).filter((s) => /subjectFacts/.test(s)),
    ).toEqual(['./commands/subjectFacts.js']);
  });

  it('declares every permission NONE and no contact-, verdict- or score-shaped property', () => {
    expect(Object.values(PERMISSIONS).every((v) => v === 'NONE')).toBe(true);
    for (const file of [FACTS, LOAD, CLI]) {
      const code = codeOf(readCurrent(file));
      expect(code, file).not.toMatch(
        /\b(email|mailbox|phone|telephone|contact\w*|person\w*)\s*[:?]/i,
      );
      expect(code, file).not.toMatch(
        /\b(verified|relevant|preferred|approved|qualified|eligible|score\w*|merge\w*)\s*[:?]/,
      );
      expect(code, file).not.toMatch(/mailto:|tel:/);
    }
  });
});
