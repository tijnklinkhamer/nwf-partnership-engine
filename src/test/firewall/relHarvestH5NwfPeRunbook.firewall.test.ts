/**
 * REL HARVEST H5 FIREWALL - the `nwf_pe` migration apply runbook is a
 * DOCUMENT, prepared and not executed, and it names THIS line's migrations.
 *
 * Ported from the duplicate relf1 line (`2999b54`) and rewritten for the
 * rel-* migrations. Over H5_BASE_COMMIT..H5_TERMINAL_COMMIT it pins:
 *   - the change set is the runbook and this file: no migration, no code;
 *   - the runbook lists exactly the rel-* files 0013-0019 by exact name,
 *     each with the SHA-256 of the file in this tree (so a drifted table, or
 *     a drifted migration, fails here);
 *   - it says that applying needs a separate OWNER grant and that nothing
 *     has been applied, and the relf1 line's different 0018/0019 are named
 *     only to forbid them.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { REPO_ROOT, phaseRange, readCurrent } from '../helpers/phaseRange.js';

/** The H4 commit: this slice's parent. */
const H5_BASE_COMMIT = 'ae14a33bb75177c2ad3e340a8f231e44009467df';

/** Open (null) until the harvest pin commit closes the range. */
const H5_TERMINAL_COMMIT: string | null = null;

const RUNBOOK = 'docs/architecture/NWF_PE_MIGRATIONS_0013_0019_APPLY_RUNBOOK_V1.md';

const h5 = phaseRange(H5_BASE_COMMIT, H5_TERMINAL_COMMIT);

const migrations = (): string[] =>
  readdirSync(join(REPO_ROOT, 'migrations'))
    .filter((f) => /^001[3-9]_.*\.sql$/.test(f))
    .sort();

describe.skipIf(!h5.available)('REL harvest H5: the change set over its own range', () => {
  it('is exactly the runbook and this firewall', () => {
    expect(h5.changeset()).toEqual(
      [`A\t${RUNBOOK}`, 'A\tsrc/test/firewall/relHarvestH5NwfPeRunbook.firewall.test.ts'].sort(),
    );
  });
});

describe('REL harvest H5: the runbook names this line, by exact file and digest', () => {
  const text = () => readCurrent(RUNBOOK);

  it('lists exactly the seven rel-* migrations 0013-0019, each with its file SHA-256', () => {
    const files = migrations();
    expect(files).toEqual([
      '0013_discovery_subject_identity.sql',
      '0014_discovery_subject_writer.sql',
      '0015_discovery_subject_review_attestation.sql',
      '0016_subject_jurisdiction_claims.sql',
      '0017_subject_research_admission.sql',
      '0018_subject_research_roots.sql',
      '0019_source_discovery_nominations.sql',
    ]);
    const table = [...text().matchAll(/^\| `(001[3-9]_\w+\.sql)`\s*\| `([0-9a-f]{64})` \|$/gm)].map(
      (m) => [m[1], m[2]],
    );
    expect(table).toEqual(
      files.map((f) => [
        f,
        createHash('sha256')
          .update(readFileSync(join(REPO_ROOT, 'migrations', f)))
          .digest('hex'),
      ]),
    );
  });

  it('states it is not executed and that applying needs a separate OWNER grant', () => {
    expect(text()).toMatch(
      /\*\*Status: PREPARED, NOT EXECUTED\.\*\* Nothing in this runbook has been applied/,
    );
    expect(text()).toMatch(/needs a\s+\*\*separate, signed OWNER grant\*\*/);
    expect(text()).toMatch(/`nwf_pe` was \*\*not read\*\* while preparing this runbook/);
  });

  it('names the relf1 migrations only to forbid them', () => {
    const mentions = text()
      .split('\n')
      .filter((l) =>
        /subject_research_execution|subject_link_nominations|relf1 line's own 0018/.test(l),
      );
    expect(mentions.length).toBeGreaterThan(0);
    for (const line of mentions) expect(line).toMatch(/must never|never be applied/);
    expect(text()).not.toMatch(/0018_subject_research_execution|0019_subject_link_nominations/);
  });
});
