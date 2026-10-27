/**
 * REL Q1 item 2 FIREWALL - a PROPOSED live source-discovery authorisation
 * (ADR 0027) is not an authorisation. Until a separately approved slice
 * implements it, the seal REL L2 built must hold exactly:
 *
 *   - ADR 0027 exists, is Proposed, and says live search is NOT authorised;
 *   - `SourceDiscoveryAuthorisation` still has exactly two static members
 *     (`isAuthorisation`, the vitest-guarded `sealedForVitest`) and none of the
 *     factories ADR 0027 proposes exists anywhere in production code;
 *   - no production file calls the test seam or constructs the adapter, and no
 *     sourceDiscovery file imports the Agent SDK; the proposed SDK site and
 *     grant tables do not exist;
 *   - `orgunits discover-sources --execute` refuses LIVE_SEARCH_NOT_AUTHORISED
 *     before any connection is opened;
 *   - nothing in the sourceDiscovery namespace scores, rubric-grades or ranks a
 *     nomination: the obsolete "/15" rubric is not revived.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { runSourceDiscoveryCli } from '../../cli/commands/sourceDiscovery.js';
import { REPO_ROOT, codeOf, productionFiles, readCurrent } from '../helpers/phaseRange.js';

const ADR = 'docs/adr/0027-owner-granted-live-source-discovery-pilot.md';
const AUTHORISATION = 'src/orgunits/sourceDiscovery/authorisation.ts';
const NAMESPACE = 'src/orgunits/sourceDiscovery/';

describe('REL Q1: the live source-discovery proposal leaves the seal intact', () => {
  it('ADR 0027 is Proposed and says live search is not authorised', () => {
    const adr = readCurrent(ADR);
    expect(adr).toMatch(/^- \*\*Status: Proposed\.\*\*/m);
    expect(adr).toMatch(/\*\*Live search is\s+NOT authorised in this build\.\*\*/);
    expect(adr).not.toMatch(/Status: Accepted/);
  });

  it('the capability has exactly its two static members, one vitest-guarded', () => {
    const code = codeOf(readCurrent(AUTHORISATION));
    expect([...code.matchAll(/static (\w+)\(/g)].map((m) => m[1]).sort()).toEqual([
      'isAuthorisation',
      'sealedForVitest',
    ]);
    expect(code).toMatch(/readonly #sealed = true;/);
    expect(code).toMatch(/private constructor\(scope: string\)/);
    expect(code).toContain("if (process.env['VITEST'] !== 'true') {");
    expect(code.match(/new SourceDiscoveryAuthorisation\(/g)).toHaveLength(1);
  });

  it('no production file mints the capability, builds the adapter or names a proposed factory', () => {
    for (const file of productionFiles()) {
      const code = codeOf(readCurrent(file));
      expect(code, file).not.toMatch(/fromStoredGrant|fromOwnerGrant|forOwnerGrant/);
      if (file === AUTHORISATION) continue;
      expect(code, file).not.toMatch(/sealedForVitest\s*\(|new ClaudeMaxWebSearchProvider\s*\(/);
    }
  });

  it('no sourceDiscovery file imports the SDK, and neither the SDK site nor the grant tables exist', () => {
    for (const file of productionFiles().filter((f) => f.startsWith(NAMESPACE))) {
      expect(codeOf(readCurrent(file)), file).not.toMatch(/@anthropic-ai\//);
    }
    expect(existsSync(join(REPO_ROOT, NAMESPACE, 'agentQuery.ts'))).toBe(false);
    for (const migration of readdirSync(join(REPO_ROOT, 'migrations'))) {
      expect(readCurrent(`migrations/${migration}`), migration).not.toMatch(
        /CREATE TABLE source_discovery_(search_grants|grant_uses|query_calls|run_completions)\b/,
      );
    }
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
