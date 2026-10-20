/**
 * GLOBAL R9 FIREWALL - persisted subject research evidence can be EXPORTED,
 * read-only, for the Operator, and nothing else moved.
 *
 * Pins, over R9_BASE_COMMIT..R9_TERMINAL_COMMIT (the working tree while the
 * terminal is open):
 *   - the change set is exactly the named ADDITIONS plus R9.1's two
 *     acknowledged edits: no other existing file, no migration, no other
 *     historical test and no earlier record is edited;
 *   - `src/orgunits/subjectResearchEvidence/` is two files, imports only what
 *     it is reviewed to, opens no socket, reads no environment or clock,
 *     issues only SELECTs inside one REPEATABLE READ READ ONLY transaction,
 *     over exactly the tables `nwf_research` already reads for a subject
 *     root - never a discovery-subject, ECHE, organisation or classifier
 *     table - and is imported by no production module and no CLI;
 *   - every exported capability is `NONE`, and the committed Operator pack is
 *     synthetic, under `.example.` hosts, and carries no contact data.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PERMISSIONS } from '../../orgunits/subjectResearchEvidence/evidence.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** The Global R8 pin commit (`d833673`): the R9 base. */
const R9_BASE_COMMIT = 'd833673ae2f7981d3456394c8ca76f83005ccf99';

/** Open (null) until a separately authorised commit-closure phase pins it. */
const R9_TERMINAL_COMMIT: string | null = '9b3afd8a25be4a5dffbbd32bf177ca59dbebe5a2';

const MODULE_DIR = 'src/orgunits/subjectResearchEvidence/';
const MODULE_FILES = [`${MODULE_DIR}evidence.ts`, `${MODULE_DIR}load.ts`];
const PACK = 'src/test/fixtures/globalR9/research-pack.json';

/**
 * R9.1 (OWNER brief "R9.1: Integration Validation Closure", 2026-10-20): the R5 jurisdiction pack
 * the Operator copies byte for byte carried two identifiers outside the synthetic namespace its
 * fixture hygiene admits - the review environment constant `11111111-1111-4111-8111-…` and the
 * ECHE anchor `F SYNTH01|…`. The repair is at the SOURCE: the R5 generator's two constants move
 * into the namespace (`11111111-0000-4000-8000-…`, `XF SYNTH01|…`) and the pack is regenerated
 * by that generator, unchanged otherwise. Each edit is pinned by the SHA-256 of JSON
 * {removed, added} of its `git diff --unified=0` lines. The closed R5 range (6c793c5..9ff2715)
 * and its firewall are untouched.
 */
const ACKNOWLEDGED_EDITS: Readonly<Record<string, string>> = {
  'src/test/fixtures/globalR5/jurisdiction-pack.json':
    'dfa94c7236ef6e832d67987efb4be452b7ac216f158d0ec4acf8766ecb005b43',
  'src/test/unit/subjectJurisdictionEvidenceR5.test.ts':
    'f120efaa68dce02a1c4d5368293b043c2978d3005336d9465e4c561712af7027',
};

const AUTHORISED_CHANGESET = [
  'A\tdocs/evaluation/GLOBAL_R9_OWNER_BRIEF_RECORD_V1.json',
  ...Object.keys(ACKNOWLEDGED_EDITS).map((f) => `M\t${f}`),
  ...MODULE_FILES.map((f) => `A\t${f}`),
  `A\t${PACK}`,
  'A\tsrc/test/firewall/globalOperatorIntegrationR9.firewall.test.ts',
  'A\tsrc/test/integration/subjectResearchEvidenceR9.test.ts',
  'A\tsrc/test/unit/subjectResearchEvidenceR9.test.ts',
].sort();

/** The only relations the loader may name: what research reads for a subject root (0007, 0017). */
const READABLE = [
  'orgunit_fetch_observations',
  'orgunit_page_candidates',
  'orgunit_page_evidence',
  'orgunit_research_run_completions',
  'orgunit_research_runs',
  'subject_research_admission_revocations',
  'subject_research_admissions',
  'subject_research_registry_fingerprint',
];

function git(...args: readonly string[]): string {
  return execFileSync('git', ['-C', REPO_ROOT, ...args], { encoding: 'utf8' });
}

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
  commitExists(R9_BASE_COMMIT) && (R9_TERMINAL_COMMIT === null || commitExists(R9_TERMINAL_COMMIT));

const range = (): string[] =>
  R9_TERMINAL_COMMIT === null ? [R9_BASE_COMMIT] : [R9_BASE_COMMIT, R9_TERMINAL_COMMIT];

function changeset(): string[] {
  const tracked = git('diff', '--name-status', '--find-renames', ...range());
  const untracked =
    R9_TERMINAL_COMMIT === null
      ? git('ls-files', '--others', '--exclude-standard')
          .split('\n')
          .filter((l) => l.length > 0 && l !== 'node_modules')
          .map((l) => `A\t${l}`)
          .join('\n')
      : '';
  return [...new Set(`${tracked}\n${untracked}`.split('\n').filter((l) => l.length > 0))].sort();
}

function diffLines(path: string): { removed: string[]; added: string[] } {
  const diff = git('diff', '--unified=0', ...range(), '--', path).split('\n');
  return {
    removed: diff.filter((l) => l.startsWith('-') && !l.startsWith('---')).map((l) => l.slice(1)),
    added: diff.filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1)),
  };
}

function sourceOf(path: string): string {
  if (R9_TERMINAL_COMMIT === null) return readFileSync(join(REPO_ROOT, path), 'utf8');
  return git('show', `${R9_TERMINAL_COMMIT}:${path}`);
}

function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function productionFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(REPO_ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== 'test') walk(rel);
      } else if (rel.endsWith('.ts')) out.push(rel);
    }
  };
  walk('src');
  return out.sort();
}

const importsOf = (file: string): string[] =>
  [...new Set([...codeOf(sourceOf(file)).matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]!))].sort();

/** Every SQL string literal (template or quoted) in a file's code. */
const sqlOf = (file: string): string[] =>
  [...codeOf(sourceOf(file)).matchAll(/`([^`]*)`|'((?:BEGIN|COMMIT|ROLLBACK)[^']*)'/g)]
    .map((m) => (m[1] ?? m[2])!)
    .filter((s) => /\b(SELECT|INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK|TRUNCATE)\b/.test(s));

describe.skipIf(!rangeAvailable)('R9: the change set over its own range', () => {
  it('is exactly the named additions and the acknowledged R9.1 edits', () => {
    expect(changeset()).toEqual(AUTHORISED_CHANGESET);
  });

  it('edits each historical file by exactly its reviewed R9.1 acknowledgement', () => {
    for (const [path, digest] of Object.entries(ACKNOWLEDGED_EDITS)) {
      const lines = diffLines(path);
      expect(createHash('sha256').update(JSON.stringify(lines), 'utf8').digest('hex'), path).toBe(
        digest,
      );
    }
  });

  it('R9.1 moves only the two R5 identifiers: the generator changes no other line', () => {
    const { removed, added } = diffLines('src/test/unit/subjectJurisdictionEvidenceR5.test.ts');
    const code = (lines: string[]) => lines.filter((l) => !/^\s*(\/\*\*|\*)/.test(l));
    expect(code(removed)).toEqual([
      "const ENV = '11111111-1111-4111-8111-111111111111';",
      "export const ECHE_FR_UNIVERSITY = 'F SYNTH01|900000501';",
    ]);
    expect(code(added)).toEqual([
      "const ENV = '11111111-0000-4000-8000-000000000005';",
      "export const ECHE_FR_UNIVERSITY = 'XF SYNTH01|900000501';",
    ]);
  });

  it('adds no migration and touches no earlier record, ADR or historical test', () => {
    const touched = git('diff', '--name-status', ...range(), '--', 'migrations', 'docs/adr')
      .split('\n')
      .filter((l) => l.length > 0);
    expect(touched).toEqual([]);
  });
});

describe('R9: subjectResearchEvidence is narrow, read-only and unconnected', () => {
  it('is exactly the two reviewed files', () => {
    expect(productionFiles().filter((f) => f.startsWith(MODULE_DIR))).toEqual(MODULE_FILES);
  });

  it('imports only what each file is reviewed to', () => {
    expect(importsOf(`${MODULE_DIR}evidence.ts`)).toEqual(['../web/redact.js', 'node:crypto']);
    expect(importsOf(`${MODULE_DIR}load.ts`)).toEqual(['./evidence.js', 'pg']);
    expect(codeOf(sourceOf(`${MODULE_DIR}load.ts`))).toMatch(/^import type pg from 'pg';$/m);
  });

  it('opens no socket, calls no model or provider, names no robots file, reads no environment or clock', () => {
    for (const file of MODULE_FILES) {
      const code = codeOf(sourceOf(file));
      expect(code, file).not.toMatch(
        /\bfetch\s*\(|node:(net|tls|http|https|dns|fs|child_process)|executeWebAttempt|authoriseAndFetchPage|robots\.txt|claude-agent-sdk|anthropic|apollo/i,
      );
      expect(code, file).not.toMatch(/process\.|Date\.now|new Date\(|Math\.random|setTimeout/);
      expect(code, file).not.toMatch(/cand:|canonicalId|'ALLOWED'|'GRANTED'/);
    }
  });

  it('keeps the projection PURE: no SQL and no pool', () => {
    const code = codeOf(sourceOf(`${MODULE_DIR}evidence.ts`));
    expect(code).not.toMatch(/from 'pg'|\.query\(|\b(SELECT|INSERT|UPDATE|DELETE)\b\s/);
  });

  it('the loader issues only SELECTs, in ONE REPEATABLE READ READ ONLY transaction', () => {
    const statements = sqlOf(`${MODULE_DIR}load.ts`);
    expect(statements.filter((s) => /^BEGIN/.test(s))).toEqual([
      'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',
    ]);
    for (const s of statements) {
      expect(s, s).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|GRANT|LOCK)\b/);
      expect(s, s).not.toMatch(/FOR (UPDATE|SHARE)/);
    }
    expect(statements.filter((s) => /\bSELECT\b/.test(s)).length).toBeGreaterThanOrEqual(8);
  });

  it('names exactly the relations research already reads for a subject root, and no other', () => {
    const named = new Set<string>();
    for (const s of sqlOf(`${MODULE_DIR}load.ts`)) {
      for (const m of s.matchAll(/\b(?:FROM|JOIN)\s+(\w+)/g)) named.add(m[1]!);
    }
    expect([...named].sort()).toEqual(READABLE);
    const code = codeOf(sourceOf(`${MODULE_DIR}load.ts`));
    expect(code).not.toMatch(
      /discovery_subject|subject_review_attestations|subject_jurisdiction|organisations|website_claims|orgunit_classifier|orgunit_root_promotions/,
    );
  });

  it('is imported by no production module, and no CLI names it', () => {
    const importers = productionFiles()
      .filter((f) => !f.startsWith(MODULE_DIR))
      .filter((f) =>
        /subjectResearchEvidence\//.test(codeOf(readFileSync(join(REPO_ROOT, f), 'utf8'))),
      );
    expect(importers).toEqual([]);
  });

  it('names its own contract in evidence.ts only, and never the B2.4 contract string', () => {
    for (const file of productionFiles()) {
      const code = codeOf(readFileSync(join(REPO_ROOT, file), 'utf8'));
      if (code.includes('nwf-pe.subject-research-evidence.v1-provisional')) {
        expect(file).toBe(`${MODULE_DIR}evidence.ts`);
      }
    }
    for (const file of MODULE_FILES) {
      expect(sourceOf(file), file).not.toContain('discovery-subject-evidence');
    }
  });

  it('every exported capability is the literal NONE', () => {
    expect(Object.values(PERMISSIONS).every((v) => v === 'NONE')).toBe(true);
    expect(Object.keys(PERMISSIONS)).toEqual(
      expect.arrayContaining([
        'qualification',
        'memberRelease',
        'publication',
        'outreach',
        'contactPermission',
        'canonicalIssuance',
        'classification',
      ]),
    );
  });
});

describe('R9: the committed Operator pack is synthetic', () => {
  const text = sourceOf(PACK);
  const pack = JSON.parse(text) as { syntheticOnly: boolean };

  it('declares itself synthetic and every URL host carries an `.example.` label', () => {
    expect(pack.syntheticOnly).toBe(true);
    const hosts = [...text.matchAll(/https?:\/\/([^/"\\]+)/g)].map((m) => m[1]!);
    expect(hosts.length).toBeGreaterThan(0);
    for (const host of hosts) expect(host).toMatch(/(^|\.)example\.[a-z.]+$/);
  });

  it('every identifier is in the synthetic namespace, but the ONE database environment id', () => {
    const uuids = [
      ...new Set(text.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g)),
    ];
    const environment = [
      ...new Set(
        [...text.matchAll(/"(?:engineEnvironmentId|environmentId)":"([0-9a-f-]{36})"/g)].map(
          (m) => m[1]!,
        ),
      ),
    ];
    expect(environment).toHaveLength(1);
    for (const uuid of uuids) {
      if (uuid !== environment[0])
        expect(uuid).toMatch(/^([0-9a-f])\1{7}-0000-4000-8000-[0-9a-f]{12}$/);
    }
  });

  it('carries no contact data: redaction markers only', () => {
    expect(text).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/);
    expect(text).not.toMatch(/\+81 75|\b123 4567\b/);
    expect(text).toContain('[EMAIL]');
    expect(text).toContain('[PHONE]');
  });
});
