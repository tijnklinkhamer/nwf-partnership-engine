/**
 * WW H-SD FIREWALL - the second security-review repair of live source
 * discovery (ADR 0028 s9.1, migration 0027) stays repaired.
 *
 * Pinned by path and content over the CURRENT tree (no commit range: the
 * integration lead replays lanes linearly):
 *
 *   - P1-3: every source-discovery subprocess carries
 *     `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION=1`, merged AFTER the ADR 0010
 *     child environment so no parent value can raise it; the SDK seam maps
 *     user-message tool results; the adapter checks the reported search
 *     (`observeSearchResult`) before it returns any result, and requires
 *     exactly ONE reported search;
 *   - P1-8: migration 0027 records an observation per terminal call row (a
 *     deferred constraint trigger requires it), and the replaced smoke
 *     verification requires hook_invoked, search_count = 1 and
 *     result_count > 0;
 *   - P2-1: a claude-max-web-search nomination needs a RESULTS call with one
 *     observed search, no completion, and room in the call's result_count;
 *   - P2-15: the provider call carries the grant's remaining time as its
 *     deadline; every function 0027 creates or replaces pins
 *     `search_path = public, pg_catalog, pg_temp`, and the grant-reading
 *     ones refuse a missing row by name;
 *   - migration 0027 is narrow: no role, no LOGIN, no SECURITY DEFINER, no
 *     mutating grant, no DROP, no OWNER-path INSERT, no text column;
 *   - ADR 0028 s9.1 says the nested search texts cannot be inspected and the
 *     live D8 smoke must confirm searchCount = 1.
 */
import { describe, expect, it } from 'vitest';

import { SOURCE_DISCOVERY_CHILD_ENV_FIXED } from '../../orgunits/sourceDiscovery/agentQuery.js';
import { WEB_SEARCH_REQUIRED_SEARCH_COUNT } from '../../orgunits/sourceDiscovery/claudeMaxWebSearchProvider.js';
import { codeOf, readCurrent } from '../helpers/phaseRange.js';

const NS = 'src/orgunits/sourceDiscovery/';
const ADAPTER = `${NS}claudeMaxWebSearchProvider.ts`;
const AGENT_QUERY = `${NS}agentQuery.ts`;
const GRANTED_RUN = `${NS}grantedRun.ts`;
const GRANT_STORE = `${NS}grantStore.ts`;
const MIGRATION = 'migrations/0027_source_discovery_search_observations.sql';
const ADR = 'docs/adr/0028-campaign-bounded-live-source-discovery.md';
const PINNED = 'SET search_path = public, pg_catalog, pg_temp';

const code = (file: string) => codeOf(readCurrent(file));
const sqlOf = (file: string) => readCurrent(file).replace(/--.*$/gm, '');
const fnBody = (sql: string, name: string) => {
  const start = sql.search(new RegExp(`CREATE (OR REPLACE )?FUNCTION ${name}\\(\\)`));
  expect(start, name).toBeGreaterThanOrEqual(0);
  return sql.slice(start, sql.indexOf('$$;', start));
};

describe('WW H-SD P1-3: one outer search per session, and only one reported search is kept', () => {
  it('caps every session at ONE WebSearch call, after the ADR 0010 environment', () => {
    expect(SOURCE_DISCOVERY_CHILD_ENV_FIXED).toEqual({
      CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION: '1',
    });
    const source = code(AGENT_QUERY);
    expect(source).toMatch(
      /\.\.\.buildChildEnvironment\(\{ parentEnv, configDir: preflight\.profileDir \}\),\s*\.\.\.SOURCE_DISCOVERY_CHILD_ENV_FIXED,/,
    );
    expect(source).toMatch(/env: \{ \.\.\.childEnv \}/);
  });

  it('maps user-message tool results, and the adapter checks them before returning results', () => {
    expect(code(AGENT_QUERY)).toMatch(/if \(message\.type === 'user'\) \{/);
    expect(code(AGENT_QUERY)).toMatch(/message\.tool_use_result/);
    expect(WEB_SEARCH_REQUIRED_SEARCH_COUNT).toBe(1);
    const adapter = code(ADAPTER);
    const search = adapter.slice(adapter.indexOf('async search(request: SearchRequest)'));
    const parse = search.indexOf('OutputSchema.safeParse');
    const check = search.indexOf('gate.observeSearchResult(');
    const ret = search.lastIndexOf('return {');
    expect(parse).toBeGreaterThan(0);
    expect(check).toBeGreaterThan(parse);
    expect(ret).toBeGreaterThan(check);
    expect(search.slice(check, ret)).toMatch(/'PROVIDER_SEARCH_BINDING_REFUSED'/);
    // The old "results without a search" shortcut is gone: no search refuses even zero results.
    expect(adapter).not.toMatch(/results\.length > 0 && gate\.approvedToolUseId === null/);
    expect(adapter).toMatch(/'no WebSearch was made'/);
  });
});

describe('WW H-SD P2-15a: no search outlives its grant', () => {
  it('the start row returns the grant time left by the DATABASE clock, and the call carries it', () => {
    expect(code(GRANT_STORE)).toMatch(
      /RETURNING floor\(extract\(epoch FROM \(\s*\(SELECT gr\.expires_at[\s\S]*?- started_at\)\) \* 1000\)::bigint AS remaining_ms/,
    );
    const run = code(GRANTED_RUN);
    expect(run).toMatch(/deadlineMs: grantRemainingMs,/);
    expect(run).toMatch(/reason = 'GRANT_EXPIRED';/);
    const agent = code(AGENT_QUERY);
    expect(agent).toMatch(
      /Math\.min\(\s*SOURCE_DISCOVERY_QUERY_DEADLINE_MS,\s*args\.deadlineMs \?\? SOURCE_DISCOVERY_QUERY_DEADLINE_MS,?\s*\)/,
    );
    expect(agent).toMatch(/setTimeout\(\(\) => controller\.abort\(\), limitMs\)/);
  });

  it('grantedRun writes the observation in the terminal row transaction', () => {
    const run = code(GRANTED_RUN);
    const terminal = run.indexOf('await insertQueryCall(c, {');
    const observation = run.indexOf('await insertQueryCallObservation(c, {');
    const nomination = run.indexOf('await insertNomination(c, {');
    expect(terminal).toBeGreaterThan(0);
    expect(observation).toBeGreaterThan(terminal);
    expect(nomination).toBeGreaterThan(observation);
  });
});

describe('WW H-SD: migration 0027 binds what is kept to what was observed', () => {
  const sql = sqlOf(MIGRATION);
  const identifiers = sql.replace(/'(?:[^']|'')*'/g, "''");

  it('P1-8: a terminal row cannot commit without its observation; a RESULTS call observed one search', () => {
    expect(sql).toMatch(
      /CREATE CONSTRAINT TRIGGER source_discovery_query_calls_require_observation\s+AFTER INSERT ON source_discovery_query_calls\s+DEFERRABLE INITIALLY DEFERRED/,
    );
    expect(fnBody(sql, 'source_discovery_verify_query_call_observation')).toMatch(
      /IF c\.outcome = 'RESULTS'\s+AND \(NEW\.search_count IS DISTINCT FROM 1\s+OR NOT \(NEW\.hook_invoked OR NEW\.permission_invoked\)\) THEN/,
    );
  });

  it('P1-8: a smoke verification requires hook_invoked, exactly one search and a result', () => {
    const fn = fnBody(sql, 'source_discovery_verify_smoke_verification');
    expect(fn).toMatch(/CREATE OR REPLACE FUNCTION/);
    expect(fn).toMatch(/o\.hook_invoked IS DISTINCT FROM true/);
    expect(fn).toMatch(/o\.search_count IS DISTINCT FROM 1/);
    expect(fn).toMatch(/c\.result_count IS NULL OR c\.result_count <= 0/);
  });

  it('P2-1: a live-search nomination needs a RESULTS call, one search, no completion and room', () => {
    expect(sql).toMatch(
      /CREATE TRIGGER source_discovery_nominations_live_search_verify\s+BEFORE INSERT ON source_discovery_nominations\s+FOR EACH ROW\s+WHEN \(NEW\.provider_key = 'claude-max-web-search'\)/,
    );
    const fn = fnBody(sql, 'source_discovery_verify_live_search_nomination');
    expect(fn).toMatch(/IF NOT FOUND OR c\.outcome IS DISTINCT FROM 'RESULTS' THEN/);
    expect(fn).toMatch(/FROM public\.source_discovery_run_completions/);
    expect(fn).toMatch(/IF searches IS DISTINCT FROM 1 THEN/);
    expect(fn).toMatch(/IF kept >= c\.result_count THEN/);
  });

  it('P2-15b: the grant-reading functions refuse a missing row by name', () => {
    for (const name of [
      'source_discovery_verify_grant_use',
      'source_discovery_verify_query_call_start',
      'source_discovery_verify_query_call',
      'source_discovery_verify_smoke_verification',
    ]) {
      expect(fnBody(sql, name), name).toMatch(/IF NOT FOUND/);
    }
  });

  it('P2-15d: pins search_path on every function it creates or replaces, and on the 0020 two', () => {
    const functions = [...sql.matchAll(/CREATE (OR REPLACE )?FUNCTION (\w+)\(\)[\s\S]*?AS \$\$/g)];
    expect(functions.map((f) => f[2]).sort()).toEqual(
      [
        'source_discovery_require_query_call_observation',
        'source_discovery_verify_grant_use',
        'source_discovery_verify_live_search_nomination',
        'source_discovery_verify_nomination',
        'source_discovery_verify_query_call',
        'source_discovery_verify_query_call_observation',
        'source_discovery_verify_query_call_start',
        'source_discovery_verify_smoke_verification',
      ].sort(),
    );
    for (const [header, , name] of functions) expect(header, name).toContain(PINNED);
    for (const name of [
      'source_discovery_verify_nomination_identity',
      'source_discovery_verify_nomination_sighting',
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `ALTER FUNCTION ${name}\\(\\)\\s+SET search_path = public, pg_catalog, pg_temp;`,
        ),
      );
    }
    for (const [, body] of sql.matchAll(/AS \$\$([\s\S]*?)\$\$;/g)) {
      expect(body!).not.toMatch(/\b(FROM|JOIN)\s+(source_discovery_|website_claims|orgunit_)/);
      expect(body!).not.toMatch(/\ssource_discovery_\w+%ROWTYPE/);
    }
  });

  it('is narrow: SELECT/INSERT to the capability, SELECT to audit, nothing else', () => {
    const grants = [...sql.matchAll(/GRANT\s+([^;]*?)\s+ON\s+([^;]*?)\s+TO\s+(\w+)\s*;/g)].map(
      ([, privileges, tables, grantee]) =>
        `${grantee}:${privileges!.replace(/\s+/g, ' ').trim()}:${tables!.replace(/\s+/g, ' ').trim()}`,
    );
    expect(grants.sort()).toEqual(
      [
        'nwf_readonly:SELECT:source_discovery_query_call_observations',
        'nwf_source_discovery:SELECT, INSERT:source_discovery_query_call_observations',
      ].sort(),
    );
    expect(identifiers).not.toMatch(
      /\bGRANT\b[^;]*\b(UPDATE|DELETE|TRUNCATE|TEMPORARY|REFERENCES|TRIGGER|ALL)\b[^;]*\bTO\b/i,
    );
    expect(identifiers).not.toMatch(/SECURITY DEFINER|CREATE ROLE|ALTER ROLE|\bLOGIN\b|\bDROP\b/i);
    expect(identifiers).not.toMatch(
      /\b\w*(contact|email|phone|mailbox|country|locale|market|score|rank|prompt|response|transcript|query_text)\w*\b/i,
    );
    expect(sql).toMatch(
      /BEFORE UPDATE OR DELETE ON source_discovery_query_call_observations\s+FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation\(\)/,
    );
    // The only new table holds booleans and a count: no text column at all.
    const table = sql.slice(
      sql.indexOf('CREATE TABLE source_discovery_query_call_observations'),
      sql.indexOf('COMMENT ON TABLE source_discovery_query_call_observations'),
    );
    expect(table).not.toMatch(/\btext\b/);
  });
});

describe('WW H-SD: ADR 0028 s9.1 records what cannot be inspected', () => {
  const adr = readCurrent(ADR);

  it('says the nested search texts cannot be inspected, and what is bounded', () => {
    expect(adr).toMatch(/### 9\.1 Second security review \(WW H-SD, migration 0027\)/);
    expect(adr).toMatch(/\*\*The nested search texts cannot be inspected by this build\*\*/);
    expect(adr).toMatch(/hard-coded `max_uses: 8`/);
    expect(adr).toMatch(/\*\*What is NOT bounded:\*\*/);
  });

  it('requires the live D8 smoke to confirm searchCount = 1', () => {
    expect(adr).toMatch(
      /\*\*The live D8 smoke must also confirm `searchGate\.searchCount = 1`\*\*/,
    );
    expect(adr).toMatch(/\*\*Managed policy still\s+applies\.\*\*/);
  });
});
