/**
 * REL P2 FIREWALL - persistent link-out nominations: deduplicated, evidence
 * kept, LOGIN only in a disposable test database, and still NEVER a fetch.
 *
 * Over P2_BASE_COMMIT..P2_TERMINAL_COMMIT (the working tree while the
 * terminal is open) it pins:
 *   - the change set is exactly the named files, and every edit to an
 *     existing test file is exactly its reviewed acknowledgement; the gateway,
 *     robots, the root runner, the orchestrator, the frontier, signals, the
 *     classifier, the subject registry/review/admission modules and every
 *     earlier migration are untouched;
 *   - the two firewall widenings (L2, H6) are by ONE exact path each and
 *     remove no forbidden pattern;
 *   - the environment gains exactly the optional source-discovery variables,
 *     with no default and no fallback; `execute.ts` changes by exactly the
 *     pre-run capability check.
 * Over the CURRENT tree it pins:
 *   - migration 0020: two append-only tables, SELECT + INSERT to the EXISTING
 *     NOLOGIN capability, SELECT to audit, nothing to research; no role, no
 *     LOGIN, no ALTER, no SECURITY DEFINER, no contact/country/score/status
 *     column; and no migration anywhere gives nwf_source_discovery LOGIN;
 *   - the disposable login is created only by the test helper, NOINHERIT and
 *     SET-only, after the loopback / `*_test` / not-`nwf_pe` guards; the
 *     local script reads exactly one connection variable and guards first;
 *   - the subjects research CLI stays an entry point on the research role,
 *     opens its one extra pool only from DATABASE_URL_SOURCE_DISCOVERY, and
 *     says DISCARDED when it is absent; promotion refuses a non-first
 *     nomination; nothing in the change reaches a socket.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  REPO_ROOT,
  codeOf,
  phaseRange,
  productionFiles,
  readCurrent,
  specifiers,
} from '../helpers/phaseRange.js';

/** The REL final join A2 commit: this slice's parent. */
const P2_BASE_COMMIT = '80457a9e75a64c14ee0646086f2669eff0d99cd2';

/** Open while the slice is being written; the pin commit closes it at the slice's own commit. */
const P2_TERMINAL_COMMIT: string | null = null;

const MIGRATION = 'migrations/0020_source_discovery_link_out_sightings.sql';
const OWNER_RECORD = 'docs/evaluation/REL_P2_LINK_OUT_NOMINATIONS_OWNER_DIRECTIVE_RECORD_V1.json';
const ADR = 'docs/adr/0026-independent-source-discovery-nominations.md';
const ENV = 'src/config/env.ts';
const EXECUTE = 'src/orgunits/subjectRun/execute.ts';
const SUBJECTS_CLI = 'src/cli/commands/orgunitsSubjects.ts';
const SOURCE_CLI = 'src/cli/commands/sourceDiscovery.ts';
const NS = 'src/orgunits/sourceDiscovery/';
const LOGIN_HELPER = 'src/test/helpers/sourceDiscoveryLogin.ts';
const LOGIN_SCRIPT = 'scripts/disposable-source-discovery-login.ts';
const L2_FIREWALL = 'src/test/firewall/relL2SourceDiscovery.firewall.test.ts';
const H6_FIREWALL = 'src/test/firewall/relHarvestH6SubjectLinkOutSink.firewall.test.ts';

const MODIFIED_PRODUCTION = [
  SUBJECTS_CLI,
  SOURCE_CLI,
  ENV,
  `${NS}linkOut.ts`,
  `${NS}promote.ts`,
  `${NS}store.ts`,
  EXECUTE,
];

/**
 * SHA-256 of JSON {removed, added} of each existing test file's `git diff
 * --unified=0` lines. Reviewed as:
 *   L2 firewall      - CLI rule widened by ONE exact path (orgunitsSubjects.ts,
 *                      five reviewed linkOut* names), store.ts INSERT list +2
 *                      (identities, sightings); no pattern removed
 *   H6 firewall      - execute.ts import regex +1 name (linkOutCapabilityHeld);
 *                      "no CLI supplies a link-out pool" widened by ONE exact
 *                      path, which may only createPool('source_discovery')
 *   harness          - source login via sourceDiscoveryLogin.ts (NOINHERIT);
 *                      writerPoolFactory, sourceDiscoveryUrl, confirmExisting
 *   H6 integration   - the research-role stand-in is now refused BEFORE the run
 *                      (LINK_OUT_CAPABILITY_REFUSED, no run row, no request)
 *   L2 integration   - TRUNCATE lists the two 0020 tables; grants list +4 rows
 *   E2E, A2          - TRUNCATE lists the two 0020 tables
 *   registry, P1a    - the newest migration is 0020
 *   orgunitSchema    - migration list gains 0020
 *   R8 migration 0017- the real runner also applies 0020
 *   A1 frame         - 0020 acknowledged with ADR 0026 and the P2 owner record
 */
const ACKNOWLEDGED_EDITS: Readonly<Record<string, string>> = {
  [L2_FIREWALL]: 'd225d4866586878551164a0e9207a695a9c1072bac0c6247be2d8b2aaf23b840',
  [H6_FIREWALL]: 'd577f9773e83bc7e34928dfd70f540ab639c2c2341d4be65f8cc2b6fb869322d',
  'src/test/helpers/relSubjectHarness.ts':
    '3c2cc0e9ecb7fb7867f1b94124202794c311a402971927727811eecf01638686',
  'src/test/integration/relHarvestSubjectLinkOuts.test.ts':
    'f169e322f8ae7e4ee45c62603505b70f16bf49fb7093cc1d0ff76b857f452ee7',
  'src/test/integration/sourceDiscoveryRelL2.test.ts':
    '7eb3b4fe714737962a3531340d72b49bb0d8018cb62e395919f3831c769b5e18',
  'src/test/integration/relEnginePipelineE2E.test.ts':
    '8f9d82e2242fc3dad106bb7274908fd77d333ac4688dbf9d144b9547ebdee829',
  'src/test/integration/subjectFactsExportA2.test.ts':
    '8f9d82e2242fc3dad106bb7274908fd77d333ac4688dbf9d144b9547ebdee829',
  'src/test/integration/discoverySubjectRegistry.test.ts':
    '88586d323876021d2a9986b90cc2dcf86acc2ffe8264db04d0dde24b931de798',
  'src/test/integration/discoverySubjectSnapshotReadB25P1a.test.ts':
    '4510b0f2098acd8da36375ed12d6871105bed3f552665fb48ebe58ec5122f981',
  'src/test/integration/orgunitSchema.test.ts':
    '7b4df8bf478da34e8924d0e74a1073cbf9285fa08f2c109ccea11e544a89d198',
  'src/test/integration/subjectResearchMigration0017R8.test.ts':
    'e8b2a8a90ae71623c3ddc52a2bc8c326437299454abb2cab7360a7a3091380e5',
  'src/test/unit/orgunitCorpus2DA1Frame.test.ts':
    '0b60219babdc6bd0f8183c59c1bd054b1d7ef89000955ff8c8bcb084670fab04',
};

const AUTHORISED_CHANGESET = [
  `M\t${ADR}`,
  `A\t${OWNER_RECORD}`,
  `A\t${MIGRATION}`,
  `A\t${LOGIN_SCRIPT}`,
  ...MODIFIED_PRODUCTION.map((f) => `M\t${f}`),
  ...Object.keys(ACKNOWLEDGED_EDITS).map((f) => `M\t${f}`),
  `A\t${LOGIN_HELPER}`,
  'A\tsrc/test/firewall/relP2LinkOutNominations.firewall.test.ts',
  'A\tsrc/test/integration/relP2LinkOutNominations.test.ts',
].sort();

const p2 = phaseRange(P2_BASE_COMMIT, P2_TERMINAL_COMMIT);

/** Non-comment lines only: prose may change, code may not. */
const codeLines = (lines: string[]) => lines.filter((l) => !/^\s*(\/\/|\/\*\*|\*)/.test(l));

describe.skipIf(!p2.available)('REL P2: the change set over its own range', () => {
  it('is exactly the named files', () => {
    expect(p2.changeset()).toEqual(AUTHORISED_CHANGESET);
  });

  it('edits each existing test file by exactly its reviewed acknowledgement', () => {
    for (const [path, digest] of Object.entries(ACKNOWLEDGED_EDITS)) {
      expect(p2.editDigest(path), path).toBe(digest);
    }
  });

  it('removes no forbidden pattern from the L2 and H6 firewalls', () => {
    expect(p2.diffLines(L2_FIREWALL).removed).toEqual([
      "  it('writes only its own three tables, by INSERT only', () => {",
      '      expect(code, file).not.toMatch(',
    ]);
    expect(p2.diffLines(H6_FIREWALL).removed).toEqual([
      "      /import \\{\\s*createLinkOutNominationSink,\\s*type LinkOutCapture,\\s*type LinkOutSummary,\\s*\\} from '\\.\\.\\/sourceDiscovery\\/linkOut\\.js';/,",
      "    for (const file of productionFiles().filter((f) => f.startsWith('src/cli/'))) {",
    ]);
  });

  it('extends the environment by exactly the optional source-discovery variables', () => {
    const { removed, added } = p2.diffLines(ENV);
    expect(removed).toEqual(["  | 'discovery_subject_reviewer';"]);
    expect(codeLines(added)).toEqual([
      '  DATABASE_URL_SOURCE_DISCOVERY: z.string().min(1).optional(),',
      '  DATABASE_URL_SOURCE_DISCOVERY_TEST: z.string().min(1).optional(),',
      "  | 'discovery_subject_reviewer'",
      "  | 'source_discovery';",
      "  source_discovery: 'DATABASE_URL_SOURCE_DISCOVERY',",
      "  source_discovery: 'DATABASE_URL_SOURCE_DISCOVERY_TEST',",
    ]);
  });

  it('changes execute.ts by exactly the pre-run link-out capability check', () => {
    const { removed, added } = p2.diffLines(EXECUTE);
    expect(removed).toEqual([
      "export type ExecutionRefusalCode = 'ADMISSION_CAPABILITY_UNVERIFIED' | 'ADMISSION_SUBJECT_MISMATCH';",
    ]);
    expect(codeLines(added)).toEqual([
      '  linkOutCapabilityHeld,',
      'export type ExecutionRefusalCode =',
      "  'ADMISSION_CAPABILITY_UNVERIFIED' | 'ADMISSION_SUBJECT_MISMATCH' | 'LINK_OUT_CAPABILITY_REFUSED';",
      '  if (linkOutPool !== undefined && !(await linkOutCapabilityHeld(linkOutPool))) {',
      "    throw new SubjectExecutionRefusal('LINK_OUT_CAPABILITY_REFUSED');",
      '  }',
    ]);
  });

  it('leaves the network path, the classifier, the subject modules and every earlier migration untouched', () => {
    const touched = p2
      .changeset()
      .filter((l) =>
        /\t(src\/orgunits\/(web|classify|signals|orchestrator|subjectRegistry|subjectReview|subjectAdmission|subjectJurisdiction|identity|subjectFacts)\/|src\/orgunits\/sitemap\.ts|src\/db\/|src\/cli\/index\.ts|package(-lock)?\.json|CLAUDE\.md)/.test(
          l,
        ),
      );
    expect(touched).toEqual([]);
    expect(p2.changeset().filter((l) => /\tmigrations\//.test(l))).toEqual([`A\t${MIGRATION}`]);
  });
});

describe('REL P2: migration 0020 is narrow', () => {
  const sql = readCurrent(MIGRATION).replace(/--.*$/gm, '');
  const identifiers = sql.replace(/'(?:[^']|'')*'/g, "''");

  it('grants SELECT/INSERT to the EXISTING capability and SELECT to audit, and nothing else', () => {
    const grants = [...sql.matchAll(/GRANT\s+([\s\S]*?)\s+ON\s+([\s\S]*?)\s+TO\s+(\w+)\s*;/g)].map(
      ([, privileges, on, grantee]) =>
        `${grantee}:${privileges!.replace(/\s+/g, ' ').trim()}:${on!.replace(/\s+/g, ' ').trim()}`,
    );
    expect(grants.sort()).toEqual(
      [
        'nwf_readonly:SELECT:source_discovery_nomination_identities, source_discovery_nomination_sightings',
        'nwf_source_discovery:SELECT, INSERT:source_discovery_nomination_identities, source_discovery_nomination_sightings',
      ].sort(),
    );
    expect(identifiers).not.toMatch(
      /\bGRANT\b[^;]*\b(UPDATE|DELETE|TRUNCATE|TEMPORARY|REFERENCES|TRIGGER|ALL|CONNECT|USAGE)\b[^;]*\bTO\b/i,
    );
    expect(sql).toMatch(/REVOKE ALL ON [^;]*FROM PUBLIC, nwf_ingest, nwf_research,/);
  });

  it('creates no role, gives no LOGIN, alters and drops nothing, defines no SECURITY DEFINER', () => {
    expect(sql).not.toMatch(
      /CREATE ROLE|ALTER ROLE|\bLOGIN\b|PASSWORD|SECURITY DEFINER|ALTER TABLE|\bDROP\b|\bUPDATE\s+\w+\s+SET\b|DELETE FROM/i,
    );
    expect([...sql.matchAll(/CREATE TABLE (\w+)/g)].map((m) => m[1])).toEqual([
      'source_discovery_nomination_identities',
      'source_discovery_nomination_sightings',
    ]);
    expect([...sql.matchAll(/CREATE (?:UNIQUE )?INDEX \w+\s+ON (\w+)/g)].map((m) => m[1])).toEqual([
      'source_discovery_nomination_identities',
      'source_discovery_nomination_identities',
      'source_discovery_nomination_identities',
      'source_discovery_nomination_sightings',
      'source_discovery_nomination_sightings',
    ]);
  });

  it('is append-only on both tables, dedupes by domain and by (nomination, page, URL)', () => {
    for (const table of [
      'source_discovery_nomination_identities',
      'source_discovery_nomination_sightings',
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `CREATE TRIGGER ${table}_append_only\\s+BEFORE UPDATE OR DELETE ON ${table}\\s+FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation\\(\\);`,
        ),
      );
    }
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX source_discovery_nomination_identities_domain_uidx\s+ON source_discovery_nomination_identities \(registrable_domain\);/,
    );
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX source_discovery_nomination_sightings_dedupe_uidx\s+ON source_discovery_nomination_sightings \(nomination_id, source_page_evidence_id, url\);/,
    );
    expect(sql).toMatch(/CHECK \(discovery_identity_url_admissible\(url\)\)/);
  });

  it('declares no contact, country, score, status, verdict or body column', () => {
    expect(identifiers).not.toMatch(
      /\b\w*(contact|email|phone|mailbox|country|locale|market|score|status|verified|relevant|eligib|qualif|raw_html|page_html|response_body)\w*\b/i,
    );
  });

  it('no migration gives nwf_source_discovery LOGIN, and no other migration names the 0020 tables', () => {
    const files = readdirSync(join(REPO_ROOT, 'migrations')).filter((f) => f.endsWith('.sql'));
    for (const file of files) {
      const text = readCurrent(`migrations/${file}`).replace(/--.*$/gm, '');
      for (const m of text.matchAll(/(CREATE|ALTER) ROLE nwf_source_discovery\b([^;]*);/g)) {
        expect(m[2]!.replace(/\bNOLOGIN\b/g, ''), file).not.toMatch(/\bLOGIN\b|PASSWORD '/);
      }
      if (`migrations/${file}` !== MIGRATION) {
        expect(text, file).not.toMatch(/source_discovery_nomination_(identities|sightings)/);
      }
    }
  });
});

describe('REL P2: the disposable login exists only in the test harness, guarded', () => {
  it('no production file or other script creates a role or a login', () => {
    for (const file of productionFiles()) {
      expect(codeOf(readCurrent(file)), file).not.toMatch(
        /CREATE ROLE|ALTER ROLE|\bWITH INHERIT\b/i,
      );
    }
    for (const file of readdirSync(join(REPO_ROOT, 'scripts'))) {
      if (`scripts/${file}` === LOGIN_SCRIPT) continue;
      expect(readCurrent(`scripts/${file}`), file).not.toMatch(/CREATE ROLE|nwf_source_discovery/);
    }
  });

  it('the helper guards the target BEFORE it creates a NOINHERIT, SET-only login with CONNECT only', () => {
    const code = codeOf(readCurrent(LOGIN_HELPER));
    const create = code.indexOf('CREATE ROLE');
    expect(create).toBeGreaterThan(0);
    for (const guard of [
      'assertDisposableTarget(adminUrl);',
      'await assertTestDatabaseConnection(admin);',
    ]) {
      expect(code.indexOf(guard), guard).toBeGreaterThan(0);
      expect(code.indexOf(guard), guard).toBeLessThan(create);
    }
    expect(code).toMatch(
      /assertLocalDatabaseUrl\(adminUrl\);\s*assertTestDatabaseUrl\(adminUrl\);\s*if \(databaseNameFromUrl\(adminUrl\) === WORKING_DATABASE\)/,
    );
    expect(code).toMatch(/const WORKING_DATABASE = 'nwf_pe';/);
    expect(code).toMatch(
      /LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE ` \+\s*`NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 8 PASSWORD/,
    );
    expect(code).toMatch(/TO \$\{login\} WITH INHERIT FALSE, SET TRUE, ADMIN FALSE/);
    const grants = [...code.matchAll(/`GRANT ([^`]*)`/g)].map((m) => m[1]);
    expect(grants).toEqual([
      '${SOURCE_DISCOVERY_CAPABILITY} TO ${login} WITH INHERIT FALSE, SET TRUE, ADMIN FALSE',
      'CONNECT ON DATABASE "${database}" TO ${login}',
    ]);
    expect(code).toMatch(/export const SOURCE_DISCOVERY_CAPABILITY = 'nwf_source_discovery';/);
  });

  it('the local script reads exactly DATABASE_URL_ADMIN_TEST and guards before connecting', () => {
    const code = codeOf(readCurrent(LOGIN_SCRIPT));
    expect([...code.matchAll(/process\.env\['(\w+)'\]/g)].map((m) => m[1])).toEqual([
      'DATABASE_URL_ADMIN_TEST',
    ]);
    expect(code).not.toMatch(/process\.env\.|--url|--admin-url|parseArgs/);
    expect(code.indexOf('assertDisposableTarget(adminUrl);')).toBeGreaterThan(0);
    expect(code.indexOf('assertDisposableTarget(adminUrl);')).toBeLessThan(
      code.indexOf('new pg.Pool('),
    );
    expect(specifiers(code).sort()).toEqual(
      ['../src/test/helpers/sourceDiscoveryLogin.js', 'pg'].sort(),
    );
  });
});

describe('REL P2: the subjects research CLI stays an entry point', () => {
  const cli = () => codeOf(readCurrent(SUBJECTS_CLI));

  it('imports exactly the L1 set plus the environment, and nothing from L2 or the web layer', () => {
    expect([...new Set(specifiers(cli()))].sort()).toEqual(
      [
        '../../config/env.js',
        '../../db/client.js',
        '../../logging/log.js',
        '../../orgunits/orchestrator/rootRunner.js',
        '../../orgunits/subjectRun/admission.js',
        '../../orgunits/subjectRun/execute.js',
      ].sort(),
    );
    expect(cli()).not.toMatch(
      /orgunits\/web|sourceDiscovery\/|\bfetch\s*\(|node:(net|tls|http|https|dns)/,
    );
  });

  it('connects as research, and opens its one extra pool only from DATABASE_URL_SOURCE_DISCOVERY', () => {
    const code = cli();
    expect(code).toMatch(/withPool\(\s*'research'/);
    expect(code).not.toMatch(/withPool\(\s*'(admin|ingest|readonly|classifier|source_discovery)'/);
    expect([...code.matchAll(/createPool\('(\w+)'\)/g)].map((m) => m[1])).toEqual([
      'source_discovery',
    ]);
    expect(code).toMatch(
      /return env\(\)\.DATABASE_URL_SOURCE_DISCOVERY === undefined\s*\?\s*'DISCARDED'\s*:\s*'RECORDED_AS_NOMINATIONS';/,
    );
    expect(code).toMatch(/finally \{\s*await linkOutPool\?\.end\(\);\s*\}/);
    expect(code).toMatch(
      /LINK_OUTS_DISCARDED_NOTE =\s*'Off-domain link-outs of this run were DISCARDED/,
    );
  });

  it('manufactures no robots authority or admission, and has no batch or bypass flag', () => {
    for (const banned of [
      'RobotsAuthorisation',
      'executeWebAttempt',
      'forVitestUnverified',
      'fromDatabase',
      'recordSubjectResearchAdmission',
      'skipRobots',
      'ignoreRobots',
      'bypassRobots',
      '--all',
      'allSubjects',
      'scanDatabase',
      'process.env',
    ]) {
      expect(cli(), banned).not.toContain(banned);
    }
  });
});

describe('REL P2: the source-discovery namespace still nominates and never fetches', () => {
  it('store.ts writes its tables by INSERT only, and no file in the change names the gateway', () => {
    const store = codeOf(readCurrent(`${NS}store.ts`));
    expect(store).not.toMatch(/\b(UPDATE|DELETE FROM|TRUNCATE)\s+\w+/);
    for (const file of [...MODIFIED_PRODUCTION, LOGIN_HELPER, LOGIN_SCRIPT]) {
      const code = codeOf(readCurrent(file));
      expect(code, file).not.toMatch(
        /\bfetch\s*\(|node:(net|tls|http|https|dns)|executeWebAttempt|authoriseAndFetchPage|runRootAcquisition|claude-agent-sdk|anthropic|apollo|nodemailer/i,
      );
    }
  });

  it("promotion refuses a nomination that is not its identity's first, before any write", () => {
    const promote = codeOf(readCurrent(`${NS}promote.ts`));
    expect(promote).toMatch(
      /identity\.firstNominationId !== nomination\.id[\s\S]*?throw new PromotionRefusal\(\s*'NOMINATION_NOT_CANONICAL'/,
    );
    const cli = codeOf(readCurrent(SOURCE_CLI));
    const check = cli.indexOf('assertCanonicalNomination(nomination, loaded.identity);');
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(cli.indexOf('promoteNomination(pool, request, execute)'));
  });

  it('the link-out sink counts only after its transaction committed, and checks the capability first', () => {
    const code = codeOf(readCurrent(`${NS}linkOut.ts`));
    expect(code).toMatch(
      /export async function linkOutCapabilityHeld\(pool: pg\.Pool\): Promise<boolean> \{\s*try \{\s*await inSourceDiscoveryTransaction\(pool, \(\) => Promise\.resolve\(\)\);\s*return true;\s*\} catch \(error\) \{\s*if \(error instanceof SourceDiscoverySessionRefused\) return false;\s*throw error;\s*\}\s*\}/,
    );
    const execute = codeOf(readCurrent(EXECUTE));
    expect(execute.indexOf('linkOutCapabilityHeld(linkOutPool)')).toBeLessThan(
      execute.indexOf('runSubjectDiscovery('),
    );
    expect(execute.indexOf('linkOutCapabilityHeld(linkOutPool)')).toBeGreaterThan(
      execute.indexOf("'ADMISSION_SUBJECT_MISMATCH');\n  }"),
    );
  });
});
