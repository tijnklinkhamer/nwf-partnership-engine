/**
 * WW INTEGRATION FIREWALL - the successor `nwf_pe` apply runbook (0013-0027) is a
 * DOCUMENT PACK, prepared and not executed, and it names THIS line's
 * migrations by exact file and digest.
 *
 * Pins, over the working tree (by path and content, never by commit SHA):
 *   - the pack's SHA256SUMS file lists exactly the runbook and its two SQL
 *     files, each with the SHA-256 of the file as it stands;
 *   - the runbook lists exactly the fifteen migrations 0013-0027, each with
 *     the checksum the runner (`src/db/migrate.ts`) records for the file in
 *     `migrations/`, and both SQL files carry the same digests;
 *   - both SQL files only read: no INSERT, UPDATE, DELETE, ALTER, CREATE,
 *     GRANT, DROP or TRUNCATE token anywhere (comments included), one
 *     READ ONLY transaction ended by ROLLBACK, no COMMIT;
 *   - the runbook says it is prepared and not executed, names the required
 *     OWNER grant `NWF-PE-APPLY-0013-0027-V1`, checks the ledger before and
 *     after, accepts exactly the starting states A, B and C, carries the
 *     E-XFX / H-EX extraction-label check (v4 rows STOP, v3 rows escalate),
 *     applies only through `npm run db:migrate`, and names no private path;
 *   - the 0013-0025 runbook it succeeds is still present (a record, never
 *     rewritten; its own firewall pins its content).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { REPO_ROOT, readCurrent } from '../helpers/phaseRange.js';

const DIR = 'docs/architecture';
const RUNBOOK_NAME = 'NWF_PE_MIGRATIONS_0013_0027_APPLY_RUNBOOK_V1.md';
const RUNBOOK = `${DIR}/${RUNBOOK_NAME}`;
const SUMS = `${DIR}/NWF_PE_MIGRATIONS_0013_0027_APPLY_RUNBOOK_V1.SHA256SUMS`;
const PREFLIGHT_NAME = 'nwf-pe-0013-0027-preflight.sql';
const VERIFY_NAME = 'nwf-pe-0013-0027-verify.sql';
const PREDECESSOR = `${DIR}/NWF_PE_MIGRATIONS_0013_0025_APPLY_RUNBOOK_V1.md`;

const bytesSha = (path: string): string =>
  createHash('sha256')
    .update(readFileSync(join(REPO_ROOT, path)))
    .digest('hex');

/** The runner's own checksum: SHA-256 over the file read as UTF-8 text. */
const runnerChecksum = (file: string): string =>
  createHash('sha256')
    .update(readFileSync(join(REPO_ROOT, 'migrations', file), 'utf8'), 'utf8')
    .digest('hex');

const migrations = (): string[] =>
  readdirSync(join(REPO_ROOT, 'migrations'))
    .filter((f) => /^00(1[3-9]|2[0-7])_.*\.sql$/.test(f))
    .sort();

const EXPECTED_FILES = [
  '0013_discovery_subject_identity.sql',
  '0014_discovery_subject_writer.sql',
  '0015_discovery_subject_review_attestation.sql',
  '0016_subject_jurisdiction_claims.sql',
  '0017_subject_research_admission.sql',
  '0018_subject_research_roots.sql',
  '0019_source_discovery_nominations.sql',
  '0020_source_discovery_link_out_sightings.sql',
  '0021_subject_jurisdiction_claim_writer.sql',
  '0022_source_discovery_live_grants.sql',
  '0023_acquisition_campaigns_and_queue.sql',
  '0024_campaign_research_admission_and_wiring.sql',
  '0025_source_discovery_search_gate.sql',
  '0026_acquisition_hardening.sql',
  '0027_source_discovery_search_observations.sql',
];

describe('WW E-RB: the 0013-0027 runbook pack is pinned by its own SHA256SUMS', () => {
  it('lists exactly the runbook and its two SQL files, each with its current SHA-256', () => {
    const lines = readCurrent(SUMS)
      .split('\n')
      .filter((l) => l !== '');
    const entries = lines.map((l) => {
      const m = /^([0-9a-f]{64}) {2}(\S+)$/.exec(l);
      expect(m, `malformed SHA256SUMS line: ${l}`).not.toBeNull();
      return [m![2]!, m![1]!] as const;
    });
    expect(entries.map(([name]) => name).sort()).toEqual(
      [RUNBOOK_NAME, PREFLIGHT_NAME, VERIFY_NAME].sort(),
    );
    for (const [name, sum] of entries) expect(bytesSha(`${DIR}/${name}`), name).toBe(sum);
  });
});

describe('WW E-RB: the runbook names exactly migrations 0013-0027, by file and digest', () => {
  it('migrations/ holds exactly the fifteen files of this range', () => {
    expect(migrations()).toEqual(EXPECTED_FILES);
  });

  it("the runbook's table carries the runner checksum of each file in migrations/", () => {
    const table = [
      ...readCurrent(RUNBOOK).matchAll(
        /^\| `(00(?:1[3-9]|2[0-7])_\w+\.sql)`\s*\| `([0-9a-f]{64})` \|$/gm,
      ),
    ].map((m) => [m[1], m[2]]);
    expect(table).toEqual(migrations().map((f) => [f, runnerChecksum(f)]));
    // The runner's text checksum equals the byte checksum for every file here.
    for (const f of migrations()) expect(runnerChecksum(f)).toBe(bytesSha(`migrations/${f}`));
  });

  it('both SQL files carry the same digests as the files (0013-0027 in verify; 0013-0027 in preflight)', () => {
    const want = new Map(migrations().map((f) => [f.slice(0, 4), runnerChecksum(f)]));
    for (const name of [VERIFY_NAME, PREFLIGHT_NAME]) {
      const pairs = [
        ...readCurrent(`${DIR}/${name}`).matchAll(/\('(00\d\d)', '([0-9a-f]{64})'\)/g),
      ].map((m) => [m[1]!, m[2]!] as const);
      expect(
        pairs.map(([v]) => v),
        name,
      ).toEqual([...want.keys()]);
      for (const [v, sum] of pairs) expect(sum, `${name} ${v}`).toBe(want.get(v));
    }
  });
});

describe('WW E-RB: the preflight and verify SQL only read', () => {
  const FORBIDDEN = /\b(INSERT|UPDATE|DELETE|ALTER|CREATE|GRANT|DROP|TRUNCATE)\b/i;

  for (const name of [VERIFY_NAME, PREFLIGHT_NAME]) {
    it(`${name}: no mutating token anywhere, one READ ONLY transaction ended by ROLLBACK`, () => {
      const sql = readCurrent(`${DIR}/${name}`);
      const hit = sql.split('\n').find((l) => FORBIDDEN.test(l));
      expect(hit, `forbidden token in: ${hit}`).toBeUndefined();

      // Code only: comments, then string literals, removed.
      const code = sql.replace(/--.*$/gm, '').replace(/'(?:[^']|'')*'/g, "''");
      expect(code).not.toMatch(
        /\b(COMMIT|COPY|CALL|EXECUTE|LOCK|VACUUM|ANALYZE|REINDEX|CLUSTER)\b/i,
      );
      expect(code).not.toMatch(/\bDO\s+\$|nextval|setval|pg_terminate_backend|pg_cancel_backend/i);

      // Statements: BEGIN ... READ ONLY; SET LOCAL ...; one WITH ... SELECT; ROLLBACK.
      const statements = code
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s !== '');
      expect(statements[0]).toMatch(
        /^BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY$/,
      );
      expect(statements.at(-1)).toBe('ROLLBACK');
      expect(statements).toHaveLength(4);
      expect(statements[1]).toMatch(/^SET LOCAL statement_timeout = ''$/);
      expect(statements[2]).toMatch(/^WITH\b/);
      expect(statements.filter((s) => /^BEGIN\b/.test(s))).toHaveLength(1);
    });
  }

  it('the verify file ends in ALL_CHECKS_TRUE and pins the extraction label check', () => {
    const sql = readCurrent(`${DIR}/${VERIFY_NAME}`);
    expect(sql).toContain("SELECT 'ALL_CHECKS_TRUE', bool_and(ok) AND count(*) = 53");
    expect(sql).toContain("WHERE rule_version = 'orgunit-extraction-v4'),");
    expect(sql).toContain('prosecdef');
    expect(sql).toContain('proconfig');
    expect(sql).toContain('pg_auth_members');
  });

  it('the preflight file ends in PREFLIGHT_OK and classifies only A, B and C as accepted', () => {
    const sql = readCurrent(`${DIR}/${PREFLIGHT_NAME}`);
    expect(sql).toContain("SELECT 'PREFLIGHT_OK', bool_and(ok)");
    expect(sql).toContain("(SELECT state FROM starting_state) IN ('A', 'B', 'C')");
    expect(sql).toContain(
      "WHERE rule_version IN ('orgunit-extraction-v3', 'orgunit-extraction-v4')),",
    );
  });
});

describe('WW E-RB: the runbook is prepared, not executed, and names its OWNER grant', () => {
  const text = () => readCurrent(RUNBOOK);

  it('states it is not executed and needs the named, separate, signed OWNER grant', () => {
    expect(text()).toMatch(
      /\*\*Status: PREPARED, NOT EXECUTED\.\*\* Nothing in this runbook has been applied/,
    );
    expect(text()).toMatch(/needs a\s+\*\*separate, signed OWNER grant\*\*/);
    expect(text()).toMatch(
      /> \*\*OWNER GRANT NWF-PE-APPLY-0013-0027-V1\.\*\* I, the OWNER, authorise/,
    );
    expect(text()).toMatch(/`nwf_pe` was \*\*not read\*\* while preparing this runbook/);
  });

  it('checks the ledger before and after, and accepts exactly states A, B and C', () => {
    expect(text()).toMatch(/\*\*Ledger check \(before\)\.\*\*/);
    expect(text()).toMatch(/\*\*Ledger check \(after\)\.\*\*/);
    for (const s of ['A', 'B', 'C']) expect(text()).toMatch(new RegExp(`\\*\\*State ${s}:\\*\\*`));
    expect(text()).not.toMatch(/\*\*State D:\*\*/);
    expect(text()).toMatch(/\*\*Anything else: STOP\.\*\*/);
  });

  it('carries the E-XFX extraction-label stop, applies only through the runner, and rolls back by restore', () => {
    expect(text()).toContain('`orgunit-extraction-v3`');
    expect(text()).toContain('**`orgunit-extraction-v4`**');
    expect(text()).toMatch(/If any v4 row exists: STOP\.\*\*/);
    expect(text()).toMatch(/No acknowledgement overrides this\./);
    expect(text()).toMatch(/If any v3 row exists: STOP and escalate to the\s+OWNER\.\*\*/);
    expect(text()).toContain('npm run db:migrate');
    expect(text()).not.toMatch(/psql[^\n]*-f\s+migrations\//);
    expect(text()).toMatch(/\*\*Rollback means restoring the\s+§3\.1 dump\*\*/);
    expect(text()).toContain('pg_dump -U nwf_owner -d nwf_pe -Fc --create');
  });

  it('names both operational trust sets, which exist where it says', () => {
    for (const [name, file] of [
      ['OPERATIONAL_OWNER_REVIEW_KEYS', 'src/orgunits/subjectReview/trust.ts'],
      ['OPERATIONAL_OWNER_CAMPAIGN_KEYS', 'src/orgunits/acquisition/trust.ts'],
    ] as const) {
      expect(text()).toContain(name);
      expect(text()).toContain(file);
      expect(readCurrent(file)).toMatch(new RegExp(`export const ${name}: readonly \\w+\\[\\] =`));
    }
  });

  it('succeeds, and never rewrites, the 0013-0025 runbook; names relf1 only to forbid it; no private path', () => {
    expect(existsSync(join(REPO_ROOT, PREDECESSOR))).toBe(true);
    expect(text()).toContain('NWF_PE_MIGRATIONS_0013_0025_APPLY_RUNBOOK_V1.md');
    for (const line of text()
      .split('\n')
      .filter((l) => /relf1 line's own 0018/.test(l)))
      expect(line).toMatch(/must never|\*\*must never\*\*/);
    for (const path of [RUNBOOK, `${DIR}/${VERIFY_NAME}`, `${DIR}/${PREFLIGHT_NAME}`, SUMS])
      expect(readCurrent(path), path).not.toMatch(
        /~\/|\/Users\/|\/home\/|\/private\/|nwf-preservation|nwf-ww-mission/,
      );
  });
});
