/**
 * REL P1 FIREWALL - the C1 qualification-input export is READ-ONLY, emits
 * only the five C1 claim keys the Engine's stored evidence supports, carries
 * no classifier, phrase, contact or name content, and reaches the database
 * only through its own loader.
 *
 * Pins (working tree):
 *   - `src/orgunits/qualificationInput/` is exactly contract.ts, dates.ts,
 *     build.ts and load.ts;
 *   - contract.ts imports exactly node:crypto; dates.ts imports nothing;
 *     build.ts imports exactly the ICANN registrable-domain helper, the pure
 *     nomination-citation digest, R4's standing derivation and its own two
 *     siblings - never the classifier, the signal layer or the web gateway -
 *     and none of the three opens a socket, database, file, environment,
 *     clock or randomness;
 *   - load.ts imports exactly ./build.js, ./contract.js, the facts record
 *     TYPE and the pg TYPE; it issues only SELECTs inside
 *     `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, ends in ROLLBACK, and
 *     names exactly the tables it is reviewed to read;
 *   - the CLI command connects as the `readonly` role only, writes no file,
 *     and has no `--all`; only it and the CLI entry reach the module;
 *   - the exported claim keys are exactly the five, every permission is NONE
 *     (contact permission NOT_GRANTED), and no contact-, name- or
 *     verdict-shaped property is declared.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { EXPORTED_CLAIM_KEYS, PERMISSIONS } from '../../orgunits/qualificationInput/contract.js';
import {
  REPO_ROOT,
  codeOf,
  productionFiles,
  readCurrent,
  specifiers,
} from '../helpers/phaseRange.js';

const MODULE_DIR = 'src/orgunits/qualificationInput/';
const CONTRACT = `${MODULE_DIR}contract.ts`;
const DATES = `${MODULE_DIR}dates.ts`;
const BUILD = `${MODULE_DIR}build.ts`;
const LOAD = `${MODULE_DIR}load.ts`;
const CLI = 'src/cli/commands/qualificationInput.ts';
const CLI_ENTRY = 'src/cli/index.ts';

/** The relations the loader reads, all SELECT-granted to nwf_readonly. */
const READABLE = [
  'discovery_subject_identity_claims',
  'discovery_subject_reviews',
  'discovery_subjects',
  'orgunit_fetch_observations',
  'orgunit_page_candidates',
  'orgunit_page_evidence',
  'orgunit_research_run_completions',
  'orgunit_research_runs',
  'source_discovery_nominations',
  'subject_jurisdiction_claims',
  'subject_research_admission_revocations',
  'subject_research_admissions',
  'website_claims',
];

const IMPURE =
  /process\.|\bfetch\s*\(|from 'pg'|Date\.now|Math\.random|readFile|writeFile|\b(SELECT|INSERT|UPDATE|DELETE)\b\s/;

function sqlOf(path: string): string[] {
  return [...codeOf(readCurrent(path)).matchAll(/`([^`]*)`/g)]
    .map((m) => m[1]!.replace(/\$\{[^}]*\}/g, 'X'))
    .filter((t) => /\b(SELECT|INSERT|UPDATE|DELETE|BEGIN|ROLLBACK|COMMIT)\b/.test(t));
}

describe('REL P1: the qualification-input export module', () => {
  it('is exactly four files', () => {
    expect(readdirSync(join(REPO_ROOT, MODULE_DIR)).sort()).toEqual(
      ['build.ts', 'contract.ts', 'dates.ts', 'load.ts'].sort(),
    );
  });

  it('contract.ts, dates.ts and build.ts import exactly what they are reviewed to, and are pure', () => {
    const expected: Record<string, string[]> = {
      [CONTRACT]: ['node:crypto'],
      [DATES]: [],
      [BUILD]: [
        '../../website/parse.js',
        '../subjectFacts/facts.js',
        '../subjectJurisdiction/standing.js',
        './contract.js',
        './dates.js',
      ],
    };
    for (const [file, specs] of Object.entries(expected)) {
      const code = codeOf(readCurrent(file));
      expect([...new Set(specifiers(code))].sort(), file).toEqual([...specs].sort());
      expect(code, file).not.toMatch(IMPURE);
    }
    expect(codeOf(readCurrent(BUILD))).not.toMatch(/new Date\b/);
  });

  it('never reaches the classifier, the signal layer, the gateway or any network module', () => {
    for (const file of [CONTRACT, DATES, BUILD, LOAD, CLI]) {
      for (const s of specifiers(codeOf(readCurrent(file)))) {
        expect(s, file).not.toMatch(
          /classify|signals|orgunits\/web|\/web\/|orchestrator|sourceDiscovery|node:(dns|net|tls|http|https)/,
        );
      }
    }
  });

  it('load.ts imports exactly its siblings and two types, and reads only, in one READ ONLY transaction', () => {
    const code = codeOf(readCurrent(LOAD));
    expect([...new Set(specifiers(code))].sort()).toEqual(
      ['../subjectFacts/facts.js', './build.js', './contract.js', 'pg'].sort(),
    );
    expect(code).toMatch(/^import type pg from 'pg';$/m);
    expect(code).toMatch(
      /^import type \{ JurisdictionClaimRow \} from '\.\.\/subjectFacts\/facts\.js';$/m,
    );
    expect(code).not.toMatch(/process\.|\bfetch\s*\(|node:|Date\.now|new Date\b|Math\.random/);
    expect(code).toContain(
      "await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');",
    );
    expect(code).not.toMatch(/'COMMIT'/);
    expect(code.match(/client\.query\('ROLLBACK'\)/g)).toHaveLength(2);
    const statements = sqlOf(LOAD);
    expect(statements.length).toBeGreaterThanOrEqual(12);
    for (const s of statements) {
      expect(s.trim(), s).toMatch(/^SELECT\b/);
      expect(s).not.toMatch(
        /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|GRANT|FOR UPDATE)\b/,
      );
    }
    const tables = new Set(
      [...codeOf(readCurrent(LOAD)).matchAll(/`([^`]*)`/g)]
        .map((m) => m[1]!)
        .flatMap((s) => [...s.matchAll(/\b(?:FROM|JOIN)\s+([a-z_]+)/g)].map((m) => m[1]!)),
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
        '../../orgunits/qualificationInput/contract.js',
        '../../orgunits/qualificationInput/load.js',
      ].sort(),
    );
  });

  it('only the CLI command and the CLI entry reach the module', () => {
    const importers = productionFiles().filter(
      (f) =>
        !f.startsWith(MODULE_DIR) &&
        specifiers(codeOf(readFileSync(join(REPO_ROOT, f), 'utf8'))).some((s) =>
          /qualificationInput/.test(s),
        ),
    );
    expect(importers).toEqual([CLI, CLI_ENTRY].sort());
    expect(
      specifiers(codeOf(readCurrent(CLI_ENTRY))).filter((s) => /qualificationInput/.test(s)),
    ).toEqual(['./commands/qualificationInput.js']);
  });

  it('exports exactly the five supported C1 claim keys and denies every permission', () => {
    expect([...EXPORTED_CLAIM_KEYS]).toEqual([
      'candidate.kind',
      'candidate.location',
      'channel.existence',
      'channel.operator_binding',
      'channel.static_currency',
    ]);
    expect(PERMISSIONS.contactPermission).toBe('NOT_GRANTED');
    expect(
      Object.entries(PERMISSIONS)
        .filter(([k]) => k !== 'contactPermission')
        .every(([, v]) => v === 'NONE'),
    ).toBe(true);
  });

  it('declares no contact-, name-, verdict- or score-shaped property', () => {
    for (const file of [CONTRACT, DATES, BUILD, LOAD, CLI]) {
      const code = codeOf(readCurrent(file));
      expect(code, file).not.toMatch(
        /\b(email|mailbox|phone|telephone|contact(?!Permission)\w*|person\w*|displayName|legalName|nameText)\s*[:?]/i,
      );
      expect(code, file).not.toMatch(
        /\b(verified|relevant|preferred|approved|qualified|eligible|score|fitTotal|rank|merge\w*)\s*[:?]/,
      );
      expect(code, file).not.toMatch(/mailto:|tel:|name_text|main_text\s*AS\s*name/);
    }
  });
});
