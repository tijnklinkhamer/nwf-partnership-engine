/**
 * REL Q1 item 3 FIREWALL - the successor `nwf_pe` apply runbook (0013-0021)
 * is a DOCUMENT, prepared and not executed, and it names THIS line's
 * migrations by exact file and digest.
 *
 * Pins, over the working tree:
 *   - the runbook lists exactly the nine rel-* migrations 0013-0021, each with
 *     the SHA-256 of the file in this tree (a drifted migration, or a drifted
 *     table, fails here);
 *   - it says nothing was applied, that applying needs a separate, signed
 *     OWNER grant, that `nwf_pe` was not read, and it carries a before AND an
 *     after ledger check;
 *   - the V1 runbook it succeeds is still present (it is a record, never
 *     rewritten; the H5 firewall pins its content);
 *   - it names no private path: no home-directory path, no absolute user path.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { REPO_ROOT, readCurrent } from '../helpers/phaseRange.js';

const RUNBOOK = 'docs/architecture/NWF_PE_MIGRATIONS_0013_0021_APPLY_RUNBOOK_V1.md';
const PREDECESSOR = 'docs/architecture/NWF_PE_MIGRATIONS_0013_0019_APPLY_RUNBOOK_V1.md';

const migrations = (): string[] =>
  readdirSync(join(REPO_ROOT, 'migrations'))
    .filter((f) => /^00(1[3-9]|2[01])_.*\.sql$/.test(f))
    .sort();

describe('REL Q1: the 0013-0021 runbook names this line, by exact file and digest', () => {
  const text = () => readCurrent(RUNBOOK);

  it('lists exactly the nine rel-* migrations 0013-0021, each with its file SHA-256', () => {
    const files = migrations();
    expect(files).toEqual([
      '0013_discovery_subject_identity.sql',
      '0014_discovery_subject_writer.sql',
      '0015_discovery_subject_review_attestation.sql',
      '0016_subject_jurisdiction_claims.sql',
      '0017_subject_research_admission.sql',
      '0018_subject_research_roots.sql',
      '0019_source_discovery_nominations.sql',
      '0020_source_discovery_link_out_sightings.sql',
      '0021_subject_jurisdiction_claim_writer.sql',
    ]);
    const table = [
      ...text().matchAll(/^\| `(00(?:1[3-9]|2[01])_\w+\.sql)`\s*\| `([0-9a-f]{64})` \|$/gm),
    ].map((m) => [m[1], m[2]]);
    expect(table).toEqual(
      files.map((f) => [
        f,
        createHash('sha256')
          .update(readFileSync(join(REPO_ROOT, 'migrations', f)))
          .digest('hex'),
      ]),
    );
  });

  it('states it is not executed, needs a separate OWNER grant, and checks the ledger before and after', () => {
    expect(text()).toMatch(
      /\*\*Status: PREPARED, NOT EXECUTED\.\*\* Nothing in this runbook has been applied/,
    );
    expect(text()).toMatch(/needs a\s+\*\*separate, signed OWNER grant\*\*/);
    expect(text()).toMatch(/`nwf_pe` was \*\*not read\*\* while preparing this runbook/);
    expect(text()).toMatch(/\*\*Ledger check \(before\)\.\*\*/);
    expect(text()).toMatch(/\*\*Ledger check \(after\)\.\*\*/);
    expect(text()).toMatch(/\*\*State A:\*\*/);
    expect(text()).toMatch(/\*\*State B:\*\*/);
  });

  it('succeeds, and never rewrites, the 0013-0019 runbook', () => {
    expect(existsSync(join(REPO_ROOT, PREDECESSOR))).toBe(true);
    expect(text()).toContain('NWF_PE_MIGRATIONS_0013_0019_APPLY_RUNBOOK_V1.md');
  });

  it('names the relf1 migrations only to forbid them, and no private path', () => {
    for (const line of text()
      .split('\n')
      .filter((l) => /relf1 line's own 0018/.test(l)))
      expect(line).toMatch(/must never/);
    expect(text()).not.toMatch(/0018_subject_research_execution|0019_subject_link_nominations/);
    expect(text()).not.toMatch(/~\/|\/Users\/|\/home\/|\/private\/|nwf-preservation/);
  });
});
