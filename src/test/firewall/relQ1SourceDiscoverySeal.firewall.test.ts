/**
 * REL Q1 item 2 FIREWALL - a PROPOSED live source-discovery authorisation
 * (ADR 0027) is not an authorisation.
 *
 * WW E-SD (ADR 0028) implemented ADR 0027 INERT, so the REL Q1 seal is
 * SUPERSEDED BY THE GRANT-BOUND DESIGN, NOT REMOVED: a live run still needs a
 * stored OWNER-path grant row that no runtime role can insert. Updated by
 * exact path, this file now pins:
 *
 *   - ADR 0027 exists, is Proposed, and says live search is NOT authorised in
 *     this build without an OWNER grant row; ADR 0028 is Proposed too;
 *   - `SourceDiscoveryAuthorisation` has exactly three static members
 *     (`isAuthorisation`, the grant-derived `fromStoredGrant`, the
 *     vitest-guarded `sealedForVitest`); no other factory name exists;
 *   - no production file calls the test seam; `fromStoredGrant` is called and
 *     the adapter constructed by `grantedRun.ts` alone; the only
 *     sourceDiscovery SDK import site is `agentQuery.ts`;
 *   - the grant tables exist only in migration 0022, and no role but the
 *     migration owner can INSERT a grant - WW E-SDFX: proven over EVERY
 *     migration's GRANT statements (and any schema-wide or default-privilege
 *     grant), not over 0022 alone, and likewise for migration 0025's OWNER-path
 *     `source_discovery_smoke_verifications`;
 *   - `orgunits discover-sources --execute` WITHOUT `--grant-id` still refuses
 *     LIVE_SEARCH_NOT_AUTHORISED before any connection is opened;
 *   - nothing in the sourceDiscovery namespace scores, rubric-grades or ranks a
 *     nomination: the obsolete "/15" rubric is not revived.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { runSourceDiscoveryCli } from '../../cli/commands/sourceDiscovery.js';
import { REPO_ROOT, codeOf, productionFiles, readCurrent } from '../helpers/phaseRange.js';

const ADR = 'docs/adr/0027-owner-granted-live-source-discovery-pilot.md';
const ADR_0028 = 'docs/adr/0028-campaign-bounded-live-source-discovery.md';
const AUTHORISATION = 'src/orgunits/sourceDiscovery/authorisation.ts';
const GRANTED_RUN = 'src/orgunits/sourceDiscovery/grantedRun.ts';
const SDK_SITE = 'src/orgunits/sourceDiscovery/agentQuery.ts';
const GRANT_MIGRATION = 'migrations/0022_source_discovery_live_grants.sql';
const NAMESPACE = 'src/orgunits/sourceDiscovery/';

/** WW E-SDFX: the OWNER-path tables no runtime role may ever INSERT into. */
const OWNER_ONLY_TABLES = ['source_discovery_grants', 'source_discovery_smoke_verifications'];

/**
 * Every GRANT, in every given migration, that reaches an OWNER-path table -
 * by name (optionally schema-qualified), schema-wide (`ALL TABLES IN SCHEMA`)
 * or as a default privilege - as `migration:grantee:privileges:object`.
 */
function ownerOnlyTableGrants(migrations: readonly { name: string; sql: string }[]): string[] {
  const out: string[] = [];
  for (const { name, sql } of migrations) {
    const code = sql.replace(/--.*$/gm, '');
    for (const [, privileges, objects, grantees] of code.matchAll(
      /\bGRANT\s+([^;]*?)\s+ON\s+([^;]*?)\s+TO\s+([^;]*?)\s*;/g,
    )) {
      const objectList = objects!.replace(/\s+/g, ' ').trim();
      const tables = objectList
        .split(',')
        .map((t) => t.trim().replace(/^(TABLE\s+)?(public\.)?/i, ''));
      const named = tables.filter((t) => OWNER_ONLY_TABLES.includes(t));
      const broad =
        /\bALL\s+TABLES\s+IN\s+SCHEMA\b/i.test(objectList) || /^TABLES$/i.test(objectList)
          ? [objectList]
          : [];
      for (const object of [...named, ...broad]) {
        for (const grantee of grantees!.split(',').map((g) => g.trim())) {
          out.push(`${name}:${grantee}:${privileges!.replace(/\s+/g, ' ').trim()}:${object}`);
        }
      }
    }
  }
  return out;
}

describe('REL Q1: the live source-discovery proposal leaves the seal intact', () => {
  it('ADR 0027 and ADR 0028 are Proposed and say live search is not authorised without a grant', () => {
    const adr = readCurrent(ADR);
    expect(adr).toMatch(/^- \*\*Status: Proposed\.\*\*/m);
    expect(adr).toMatch(
      /\*\*Live search is\s+NOT authorised in this build\*\* unless and until the OWNER/,
    );
    expect(adr).not.toMatch(/Status: Accepted/);
    const adr28 = readCurrent(ADR_0028);
    expect(adr28).toMatch(/^- \*\*Status: Proposed\.\*\*/m);
    expect(adr28).not.toMatch(/Status: Accepted/);
  });

  it('the capability has exactly three static members: the seam vitest-guarded, the grant one derived', () => {
    const code = codeOf(readCurrent(AUTHORISATION));
    expect([...code.matchAll(/static (\w+)\(/g)].map((m) => m[1]).sort()).toEqual([
      'fromStoredGrant',
      'isAuthorisation',
      'sealedForVitest',
    ]);
    expect(code).toMatch(/readonly #sealed = true;/);
    expect(code).toMatch(/private constructor\(scope: string, grant: GrantScope \| null\)/);
    expect(code).toContain("if (process.env['VITEST'] !== 'true') {");
    expect(code.match(/new SourceDiscoveryAuthorisation\(/g)).toHaveLength(2);
    // The seam carries no grant; the production factory carries only a derived one.
    expect(code).toContain('return new SourceDiscoveryAuthorisation(scope, null);');
    expect(code).toMatch(
      /deriveGrantScope\(pool, grantId, clock\)\.then\(\s*\(grant\) => new SourceDiscoveryAuthorisation\(`grant:\$\{grant\.grantId\}`, grant\),/,
    );
  });

  it('no production file calls the seam; only grantedRun.ts mints from a grant and builds the adapter', () => {
    for (const file of productionFiles()) {
      const code = codeOf(readCurrent(file));
      expect(code, file).not.toMatch(/fromOwnerGrant|forOwnerGrant/);
      if (file === AUTHORISATION) continue;
      expect(code, file).not.toMatch(/sealedForVitest\s*\(/);
      if (file === GRANTED_RUN) continue;
      expect(code, file).not.toMatch(/fromStoredGrant\s*\(|new ClaudeMaxWebSearchProvider\s*\(/);
    }
  });

  it('only agentQuery.ts imports the SDK, and only migration 0022 creates the grant tables, owner-INSERT only', () => {
    for (const file of productionFiles().filter((f) => f.startsWith(NAMESPACE))) {
      if (file === SDK_SITE) continue;
      expect(codeOf(readCurrent(file)), file).not.toMatch(/@anthropic-ai\//);
    }
    expect(existsSync(join(REPO_ROOT, SDK_SITE))).toBe(true);
    for (const migration of readdirSync(join(REPO_ROOT, 'migrations'))) {
      if (`migrations/${migration}` === GRANT_MIGRATION) continue;
      expect(readCurrent(`migrations/${migration}`), migration).not.toMatch(
        /CREATE TABLE source_discovery_(search_grants|grants|grant_uses|query_calls|run_completions)\b/,
      );
    }
    // WW E-SDFX: every migration, so a LATER migration granting INSERT fails here.
    const ownerOnly = ownerOnlyTableGrants(
      readdirSync(join(REPO_ROOT, 'migrations'))
        .filter((f) => f.endsWith('.sql'))
        .map((f) => ({ name: f, sql: readCurrent(`migrations/${f}`) })),
    );
    expect(ownerOnly.sort()).toEqual(
      [
        '0022_source_discovery_live_grants.sql:nwf_readonly:SELECT:source_discovery_grants',
        '0022_source_discovery_live_grants.sql:nwf_source_discovery:SELECT:source_discovery_grants',
        '0025_source_discovery_search_gate.sql:nwf_readonly:SELECT:source_discovery_smoke_verifications',
        '0025_source_discovery_search_gate.sql:nwf_source_discovery:SELECT:source_discovery_smoke_verifications',
      ].sort(),
    );
    expect(existsSync(join(REPO_ROOT, GRANT_MIGRATION))).toBe(true);
  });

  it('the every-migration grant detector fires on table, schema-wide and default-privilege grants (mutation oracle)', () => {
    const probe = (sql: string) => ownerOnlyTableGrants([{ name: '9999_probe.sql', sql }]);
    expect(probe('GRANT INSERT ON source_discovery_grants TO nwf_source_discovery;')).toEqual([
      '9999_probe.sql:nwf_source_discovery:INSERT:source_discovery_grants',
    ]);
    expect(
      probe('GRANT SELECT, INSERT ON public.source_discovery_smoke_verifications TO a, b;'),
    ).toEqual([
      '9999_probe.sql:a:SELECT, INSERT:source_discovery_smoke_verifications',
      '9999_probe.sql:b:SELECT, INSERT:source_discovery_smoke_verifications',
    ]);
    expect(probe('GRANT ALL ON ALL TABLES IN SCHEMA public TO nwf_research;')).toEqual([
      '9999_probe.sql:nwf_research:ALL:ALL TABLES IN SCHEMA public',
    ]);
    expect(
      probe(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT INSERT ON TABLES TO nwf_source_discovery;',
      ),
    ).toEqual(['9999_probe.sql:nwf_source_discovery:INSERT:TABLES']);
    expect(probe('-- GRANT INSERT ON source_discovery_grants TO x;')).toEqual([]);
    expect(probe('GRANT SELECT ON source_discovery_grants_other TO x;')).toEqual([]);
    // A role grant never borrows the next statement's privileges.
    expect(probe('GRANT nwf_x TO y;\nGRANT INSERT ON source_discovery_grants TO z;')).toEqual([
      '9999_probe.sql:z:INSERT:source_discovery_grants',
    ]);
  });

  it('discover-sources --execute refuses before any connection is opened', async () => {
    let out = '';
    const fail = () => {
      throw new Error('no pool may be opened');
    };
    const exit = await runSourceDiscoveryCli(
      [
        'discover-sources',
        '--brief',
        'nwf-discovery-brief-v1',
        '--geography',
        'JP',
        '--execute',
        '--json',
      ],
      { readonlyPool: fail, writerPool: fail, out: (t) => void (out += t), err: () => undefined },
    );
    expect(exit).toBe(1);
    expect((JSON.parse(out) as { code: string }).code).toBe('LIVE_SEARCH_NOT_AUTHORISED');
  });

  it('nothing in the namespace scores, rubric-grades or ranks a nomination', () => {
    for (const file of productionFiles().filter((f) => f.startsWith(NAMESPACE))) {
      const code = codeOf(readCurrent(file));
      expect(code, file).not.toMatch(
        /rubric|\bU3\b|out of 15|\/\s*15\b|\bscore\w*\s*[:=(]|\brank\w*\s*[:=(]/i,
      );
    }
  });
});
