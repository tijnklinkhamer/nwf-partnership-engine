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
 *     migration owner can INSERT a grant;
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
    const sql = readCurrent(GRANT_MIGRATION).replace(/--.*$/gm, '');
    const grantsOnGrants = [
      ...sql.matchAll(/GRANT\s+([\s\S]*?)\s+ON\s+([\s\S]*?)\s+TO\s+(\w+)\s*;/g),
    ]
      .filter(([, , tables]) => /\bsource_discovery_grants\b/.test(tables!))
      .map(([, privileges, , grantee]) => `${grantee}:${privileges!.trim()}`);
    expect(grantsOnGrants.sort()).toEqual(['nwf_readonly:SELECT', 'nwf_source_discovery:SELECT']);
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
