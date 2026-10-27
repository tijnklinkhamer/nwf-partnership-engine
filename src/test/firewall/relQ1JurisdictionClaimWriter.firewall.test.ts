/**
 * REL Q1 FIREWALL - the source-stated country-of-operation writer is narrow,
 * inference-free and append-only (migration 0021, ADR 0024 s7).
 *
 * Over Q1_BASE_COMMIT..Q1_TERMINAL_COMMIT (the working tree while the terminal
 * is open) it pins:
 *   - the change set is exactly the named files; every existing test file is
 *     edited by exactly its reviewed acknowledgement of 0021 (SHA-256 of JSON
 *     {removed, added}); the CLI entry point gains exactly one early dispatch;
 *     no migration but 0021 is touched;
 * and over the working tree, always:
 *   - migration 0021 grants exactly three statements to the EXISTING NOLOGIN
 *     writer capability, creates one function and two triggers, and creates no
 *     role, LOGIN, table, column or SECURITY DEFINER, alters and drops nothing;
 *   - the writer module imports only node:crypto, pg types and R4's standing
 *     and vocabulary; writes by exactly ONE INSERT into exactly one table;
 *     records one claim kind under the bound path key; and reads no domain,
 *     TLD, name, language, Erasmus code or ECHE country - it cannot infer;
 *   - the CLI has exactly its reviewed options (no actor key, credential,
 *     domain, name, language, Erasmus or bulk option), opens only the readonly
 *     and writer pools, and is the module's only production importer.
 */
import { describe, expect, it } from 'vitest';

import { JURISDICTION_CLAIMS_OPTIONS } from '../../cli/commands/jurisdictionClaims.js';
import {
  codeOf,
  phaseRange,
  productionFiles,
  readCurrent,
  specifiers,
} from '../helpers/phaseRange.js';

/** The REL P2 terminal re-pin (`1dbd40c`): this slice's parent. */
const Q1_BASE_COMMIT = '1dbd40c7432ca683bcba843e37d8cde8511317de';

/** Pinned by the REL Q1 pin commit to this slice's own commit (closed range). */
const Q1_TERMINAL_COMMIT: string | null = '30e21b78c3f553adbd21f412c99205c3ca35f482';

const MIGRATION = 'migrations/0021_subject_jurisdiction_claim_writer.sql';
const MODULE = 'src/orgunits/jurisdictionClaimWriter/record.ts';
const CLI = 'src/cli/commands/jurisdictionClaims.ts';
const CLI_ENTRY = 'src/cli/index.ts';
const ADR = 'docs/adr/0024-worldwide-subject-jurisdiction-claims.md';
const OWNER_RECORD =
  'docs/evaluation/REL_Q1_JURISDICTION_CLAIM_WRITER_OWNER_DIRECTIVE_RECORD_V1.json';

/** SHA-256 of JSON {removed, added} of each existing test file's diff over the range. */
const ACKNOWLEDGED_EDITS: Readonly<Record<string, string>> = {
  'src/test/firewall/globalFoundationR4.firewall.test.ts':
    '78a764d09169b158a09df0da419282d7f8bb57d7ed72167441cc3590850ae399',
  'src/test/integration/discoverySubjectRegistry.test.ts':
    'ef0270a6c2a9874aee06af0a2344fac554dfbd7b5ec334e0b0a6f4fe35681a4b',
  'src/test/integration/discoverySubjectSnapshotReadB25P1a.test.ts':
    'b5def0b81b052eb11d36d32887fc97558abdb8b22298925a271fb672dfe6cd51',
  'src/test/integration/orgunitSchema.test.ts':
    '55568ccdbf00da449e525e5b2fc928b73231da61e48cbc6dc9a31fb5ea74aecf',
  'src/test/integration/subjectJurisdictionR4.test.ts':
    '45435ac882ec997811a31f8587f69c93b666ee4456f3bd49189ed24bfa833287',
  'src/test/integration/subjectResearchMigration0017R8.test.ts':
    '19d0b5fc39a43a89e9495f31aff8100d03dcaa3e4b6418ff1efeead679178f27',
  'src/test/unit/orgunitCorpus2DA1Frame.test.ts':
    'a646668eef6beb74fbd1e25f8360cb54b47ca9934b6e765fd3ce9e1ad519c736',
};

const AUTHORISED_CHANGESET = [
  `M\t${ADR}`,
  `A\t${OWNER_RECORD}`,
  `A\t${MIGRATION}`,
  `A\t${CLI}`,
  `M\t${CLI_ENTRY}`,
  `A\t${MODULE}`,
  ...Object.keys(ACKNOWLEDGED_EDITS).map((f) => `M\t${f}`),
  'A\tsrc/test/firewall/relQ1JurisdictionClaimWriter.firewall.test.ts',
  'A\tsrc/test/integration/jurisdictionClaimWriterQ1.test.ts',
  'A\tsrc/test/unit/jurisdictionClaimWriterQ1.test.ts',
].sort();

const q1 = phaseRange(Q1_BASE_COMMIT, Q1_TERMINAL_COMMIT);

/** SQL with comments and string literals removed. */
const sqlCodeOf = (source: string): string =>
  source.replace(/--.*$/gm, '').replace(/'(?:[^']|'')*'/g, "''");

describe.skipIf(!q1.available)('REL Q1: the change set over its own range', () => {
  it('is exactly the named files', () => {
    expect(q1.changeset()).toEqual(AUTHORISED_CHANGESET);
  });

  it('edits each existing test file by exactly its reviewed acknowledgement', () => {
    for (const [path, digest] of Object.entries(ACKNOWLEDGED_EDITS)) {
      expect(q1.editDigest(path), path).toBe(digest);
    }
  });

  it('adds exactly one early dispatch to the CLI entry point and removes nothing', () => {
    const { removed, added } = q1.diffLines(CLI_ENTRY);
    expect(removed).toEqual([]);
    expect(added).toEqual([
      "import { runJurisdictionClaimsCli } from './commands/jurisdictionClaims.js';",
      '  nwf-pe jurisdiction-claims record --subject-id <uuid> --country-of-operation <CC> <source> ...',
      '                              (one SOURCE_STATED claim from a source the subject holds; DRY RUN',
      '                              unless --execute; run \\`nwf-pe jurisdiction-claims --help\\`)',
      '  // REL Q1: one source-stated country-of-operation claim. Its own strict options.',
      "  if (argv[0] === 'jurisdiction-claims') {",
      '    return runJurisdictionClaimsCli(argv.slice(1));',
      '  }',
    ]);
  });

  it('touches no migration but 0021 and no network, classifier or source-discovery path', () => {
    expect(q1.changeset().filter((l) => /\tmigrations\//.test(l))).toEqual([`A\t${MIGRATION}`]);
    expect(
      q1
        .changeset()
        .filter((l) =>
          /\t(src\/orgunits\/(web|classify|signals|orchestrator|sourceDiscovery|subjectRegistry|subjectReview|subjectAdmission|subjectJurisdiction|qualificationInput|identity)\/|src\/db\/|src\/config\/|package(-lock)?\.json|CLAUDE\.md)/.test(
            l,
          ),
        ),
    ).toEqual([]);
  });
});

describe('REL Q1: migration 0021 is narrow', () => {
  const sql = sqlCodeOf(readCurrent(MIGRATION));

  it('grants exactly three statements, all to the existing writer capability', () => {
    const grants = [...sql.matchAll(/\bGRANT\b([^;]*);/gi)].map((m) =>
      m[1]!.replace(/\s+/g, ' ').trim(),
    );
    expect(grants).toEqual([
      'SELECT, INSERT ON subject_jurisdiction_claims TO nwf_discovery_subject_writer',
      'SELECT (id, root_key, observed_at) ON orgunit_page_evidence TO nwf_discovery_subject_writer',
      'SELECT (id, subject_id) ON subject_research_admissions TO nwf_discovery_subject_writer',
    ]);
    expect(sql).not.toMatch(/\bREVOKE\b/i);
  });

  it('creates one function and two triggers, and no role, login, table, column or definer', () => {
    expect(
      [
        ...sql.matchAll(/CREATE\s+(TABLE|FUNCTION|TRIGGER|UNIQUE INDEX|INDEX|ROLE|VIEW)\s+(\w+)/gi),
      ].map((m) => `${m[1]!.toUpperCase()} ${m[2]}`),
    ).toEqual([
      'FUNCTION subject_jurisdiction_writer_scope',
      'TRIGGER subject_jurisdiction_claims_writer_scope',
      'TRIGGER subject_jurisdiction_claims_writer_actor',
    ]);
    expect(sql).not.toMatch(
      /CREATE ROLE|ALTER\b|\bDROP\b|\bLOGIN\b|PASSWORD|SECURITY DEFINER|\bUPDATE\s+\w+\s+SET\b|DELETE FROM|TRUNCATE|ADD COLUMN|CREATE OR REPLACE/i,
    );
    expect(sql).toMatch(
      /CREATE TRIGGER subject_jurisdiction_claims_writer_actor\s+BEFORE INSERT ON subject_jurisdiction_claims\s+FOR EACH ROW EXECUTE FUNCTION discovery_identity_bind_writer_actor\(\);/,
    );
  });

  it('refuses every non-owner kind but COUNTRY_OF_OPERATION and every website-claim source', () => {
    const raw = readCurrent(MIGRATION);
    expect(raw).toContain("IF NEW.claim_kind IS DISTINCT FROM 'COUNTRY_OF_OPERATION' THEN");
    expect(raw).toContain("IF pg_has_role(current_user, table_owner, 'MEMBER') THEN");
    expect(raw).toContain('a website claim states no country; a non-owner writer may not cite one');
  });
});

describe('REL Q1: the writer module cannot infer a country', () => {
  const code = codeOf(readCurrent(MODULE));

  it('imports only node:crypto, pg types and R4 standing and vocabulary', () => {
    expect(specifiers(code).sort()).toEqual(
      [
        'node:crypto',
        'pg',
        '../subjectJurisdiction/standing.js',
        '../subjectJurisdiction/vocabulary.js',
      ].sort(),
    );
    expect(code).toMatch(/import type pg from 'pg';/);
  });

  it('writes by exactly one INSERT into exactly one table, and never updates or deletes', () => {
    expect([...code.matchAll(/INSERT INTO (\w+)/g)].map((m) => m[1])).toEqual([
      'subject_jurisdiction_claims',
    ]);
    expect(code).not.toMatch(/\b(UPDATE\s+\w+\s+SET|DELETE\s+FROM|TRUNCATE|ALTER|DROP|GRANT)\b/i);
    expect(code).toContain("export const RECORDED_CLAIM_KIND = 'COUNTRY_OF_OPERATION';");
    expect(code).toContain(
      "export const JURISDICTION_WRITER_ACTOR_KEY = 'discovery-subjects-cli';",
    );
    expect(code).toMatch(
      /VALUES \(\$1, \$2, \$3, \$4, NULL, \$5, \$6, NULL, \$7, \$8, \$9, \$10, \$11\)/,
    );
  });

  it('reads no domain, TLD, name, language, Erasmus code or ECHE country, and no environment', () => {
    expect(code).not.toMatch(
      /tldts|icannRegistrableDomain|website\/parse|registrable_domain|hostname|country_code|erasmus|eche_row_key|organisations|name_text|name_language|declared_lang|main_text|\btitle\b|headings|process\.env|fetch\(|node:(dns|net|tls|http|https|fs)/i,
    );
  });
});

describe('REL Q1: the CLI is narrow and is the only importer', () => {
  const cli = codeOf(readCurrent(CLI));

  it('offers exactly the reviewed options', () => {
    expect(Object.keys(JURISDICTION_CLAIMS_OPTIONS).sort()).toEqual(
      [
        'basis',
        'country-of-operation',
        'execute',
        'json',
        'observed-at',
        'source-page-evidence-id',
        'source-url',
        'source-version',
        'source-website-claim-id',
        'subject-id',
      ].sort(),
    );
    for (const option of Object.keys(JURISDICTION_CLAIMS_OPTIONS)) {
      expect(option).not.toMatch(
        /actor|password|credential|url-admin|domain|name|lang|erasmus|all|sql/,
      );
    }
  });

  it('opens only the readonly and writer pools, and writes nothing itself', () => {
    expect(cli.match(/createPool\('(\w+)'\)/g)?.sort()).toEqual(
      ["createPool('discovery_subject_writer')", "createPool('readonly')"].sort(),
    );
    expect(cli).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/);
    expect(specifiers(cli).sort()).toEqual(
      [
        'node:util',
        'pg',
        '../../config/env.js',
        '../../db/client.js',
        '../../orgunits/jurisdictionClaimWriter/record.js',
      ].sort(),
    );
  });

  it('is the module’s only production importer, dispatched once from the entry point', () => {
    const importers = productionFiles().filter((f) =>
      specifiers(codeOf(readCurrent(f))).some((s) => /jurisdictionClaimWriter\//.test(s)),
    );
    // WW H-ACQ (lead addendum, exact path): the batched OWNER identity review
    // records the OWNER's --country statement through this same writer.
    expect(importers).toEqual([CLI, 'src/orgunits/acquisitionWiring/countryMentions.ts'].sort());
    const entry = codeOf(readCurrent(CLI_ENTRY));
    expect(entry.match(/runJurisdictionClaimsCli\(/g)).toHaveLength(1);
  });
});
