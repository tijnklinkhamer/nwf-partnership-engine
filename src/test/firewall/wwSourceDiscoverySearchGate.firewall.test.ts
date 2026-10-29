/**
 * WW E-SDFX FIREWALL - the security-review repair of live source discovery
 * (ADR 0028 s9, migration 0025) stays repaired.
 *
 * Pinned by path and content over the CURRENT tree (no commit range: the
 * integration lead replays lanes linearly):
 *
 *   - P1-3: the adapter never PRE-APPROVES WebSearch (`allowedTools` empty)
 *     and runs in permission mode `default` (never `dontAsk`, never a bypass);
 *     its options carry the gate's `canUseTool` AND `preToolUse`; agentQuery
 *     registers the hook and hands over the tool-use id; the provider counts
 *     tool-use blocks in the stream; SEARCH_BINDING_REFUSED is a closed
 *     outcome mirrored in SQL;
 *   - P2-4: `grantedRun.ts` commits the call's start row BEFORE the provider
 *     call, and migration 0025's start trigger checks the grant window on
 *     the DATABASE clock;
 *   - P2-5: a non-smoke start needs a smoke verification; the verification
 *     table is OWNER-path (no runtime INSERT, in 0025 or any migration -
 *     relQ1SourceDiscoverySeal proves the latter);
 *   - P2-2: every function 0025 creates or replaces pins
 *     `search_path = public, pg_catalog, pg_temp`, and every function 0022
 *     created is replaced;
 *   - migration 0025 is narrow: no role, no LOGIN, no SECURITY DEFINER, no
 *     mutating grant, no DROP but of the two widened CHECKs, no text column
 *     that could hold a prompt, response or transcript;
 *   - ADR 0028 records the live-D8 hook UNKNOWN and the 0022 header correction.
 */
import { describe, expect, it } from 'vitest';

import {
  WebSearchGate,
  buildWebSearchAgentOptions,
} from '../../orgunits/sourceDiscovery/claudeMaxWebSearchProvider.js';
import {
  QUERY_CALL_OUTCOMES,
  RUN_ABORT_REASONS,
  RUN_FAILURE_REASONS,
} from '../../orgunits/sourceDiscovery/grant.js';
import { codeOf, productionFiles, readCurrent } from '../helpers/phaseRange.js';

const NS = 'src/orgunits/sourceDiscovery/';
const ADAPTER = `${NS}claudeMaxWebSearchProvider.ts`;
const AGENT_QUERY = `${NS}agentQuery.ts`;
const GRANTED_RUN = `${NS}grantedRun.ts`;
const MIGRATION_0022 = 'migrations/0022_source_discovery_live_grants.sql';
const MIGRATION = 'migrations/0025_source_discovery_search_gate.sql';
const ADR = 'docs/adr/0028-campaign-bounded-live-source-discovery.md';

const nsFiles = () => productionFiles().filter((f) => f.startsWith(NS));
const code = (file: string) => codeOf(readCurrent(file));
const sqlOf = (file: string) => readCurrent(file).replace(/--.*$/gm, '');
const PINNED = 'SET search_path = public, pg_catalog, pg_temp';

describe('WW E-SDFX P1-3: WebSearch is never pre-approved, and every use meets the gate', () => {
  it('the options offer WebSearch, pre-approve nothing and run in default mode', () => {
    const options = buildWebSearchAgentOptions(new WebSearchGate('planned'));
    expect([...options.tools]).toEqual(['WebSearch']);
    expect([...options.allowedTools]).toEqual([]);
    expect(options.permissionMode).toBe('default');
    expect(typeof options.canUseTool).toBe('function');
    expect(typeof options.preToolUse).toBe('function');
    const adapter = code(ADAPTER);
    expect(adapter).toMatch(/allowedTools: Object\.freeze\(\[\]\)/);
    expect(adapter).toMatch(/permissionMode: 'default' as const/);
  });

  it('no sourceDiscovery file pre-approves a tool, asks no one, or bypasses permissions', () => {
    for (const file of nsFiles()) {
      const source = code(file);
      expect(source, file).not.toMatch(/allowedTools:\s*(Object\.freeze\()?\[\s*['A-Z]/);
      expect(source, file).not.toMatch(/'dontAsk'|bypassPermissions|allowDangerouslySkip/);
    }
  });

  it('agentQuery registers the gate as the PreToolUse hook and passes canUseTool the tool-use id', () => {
    const source = code(AGENT_QUERY);
    expect(source).toMatch(/hooks: \{ PreToolUse: \[\{ hooks: \[preToolUseHook\(o\)\] \}\] \}/);
    expect(source).toMatch(/o\.canUseTool\(toolName, input, context\.toolUseID\)/);
    expect(source).toMatch(/permissionDecision: 'deny'/);
    // Tool-use blocks of assistant messages reach the adapter's stream count.
    expect(source).toMatch(/if \(message\.type === 'assistant'\) \{/);
  });

  it('the provider counts the stream against its gate before reading any result', () => {
    const adapter = code(ADAPTER);
    const search = adapter.slice(adapter.indexOf('async search(request: SearchRequest)'));
    const observe = search.indexOf('gate.observeStream(toolUses);');
    expect(observe).toBeGreaterThan(0);
    expect(search.indexOf("'PROVIDER_SEARCH_BINDING_REFUSED'")).toBeGreaterThan(observe);
    expect(search.indexOf('OutputSchema.safeParse')).toBeGreaterThan(observe);
    expect(adapter).toMatch(/if \(message\.toolUses !== undefined\) toolUses\.push/);
  });

  it('SEARCH_BINDING_REFUSED is a closed outcome and failure reason, mirrored in 0025', () => {
    expect(QUERY_CALL_OUTCOMES).toContain('SEARCH_BINDING_REFUSED');
    expect(RUN_FAILURE_REASONS).toContain('SEARCH_BINDING_REFUSED');
    expect(RUN_ABORT_REASONS).toContain('SMOKE_UNVERIFIED');
    const sql = readCurrent(MIGRATION);
    const outcomes = /outcome IN \(('RESULTS'[^)]*)\)/.exec(sql)![1]!;
    expect([...outcomes.matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...QUERY_CALL_OUTCOMES]);
    const failed = /outcome = 'FAILED' AND reason IN\s*\(([^)]*)\)/.exec(sql)![1]!;
    expect([...failed.matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...RUN_FAILURE_REASONS]);
    const aborted = /outcome = 'ABORTED' AND reason IN\s*\(([^)]*)\)/.exec(sql)![1]!;
    expect([...aborted.matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...RUN_ABORT_REASONS]);
  });
});

describe('WW E-SDFX P2-4 / P2-5: the database permits each search before it is made', () => {
  it('grantedRun commits the start row before the provider call, and checks the smoke gate first', () => {
    const run = code(GRANTED_RUN);
    const loop = run.slice(run.indexOf('for (const [index, query] of grant.queries.entries())'));
    const gate = loop.indexOf("reason = 'SMOKE_UNVERIFIED';");
    const start = loop.indexOf('insertQueryCallStart(c, {');
    const call = loop.indexOf('await provider.search({');
    const terminal = loop.indexOf('await insertQueryCall(c, {');
    expect(gate).toBeGreaterThan(0);
    expect(start).toBeGreaterThan(gate);
    expect(call).toBeGreaterThan(start);
    expect(terminal).toBeGreaterThan(call);
    expect(run).toMatch(/queriesAttempted: attempted,/);
  });

  it('the start trigger checks the window on the database clock and requires a verification', () => {
    const sql = sqlOf(MIGRATION);
    const fn = sql.slice(
      sql.indexOf('CREATE FUNCTION source_discovery_verify_query_call_start()'),
      sql.indexOf('CREATE TRIGGER source_discovery_query_call_starts_verify'),
    );
    expect(fn).toMatch(
      /IF clock_timestamp\(\) < g\.issued_at OR clock_timestamp\(\) >= g\.expires_at THEN/,
    );
    expect(fn).toMatch(
      /IF NOT NEW\.smoke AND NOT EXISTS \(\s*SELECT 1 FROM public\.source_discovery_smoke_verifications/,
    );
    expect(fn).toMatch(/NEW\.started_at := clock_timestamp\(\);/);
    expect(sql).toMatch(
      /CONSTRAINT source_discovery_smoke_verifications_call_fk\s+FOREIGN KEY \(run_id, call_seq\)\s+REFERENCES source_discovery_query_calls \(run_id, call_seq\)/,
    );
  });
});

describe('WW E-SDFX P2-2 and narrowness: migration 0025', () => {
  const sql = sqlOf(MIGRATION);
  const identifiers = sql.replace(/'(?:[^']|'')*'/g, "''");

  it('pins search_path on every function it creates or replaces, pg_temp last', () => {
    const functions = [...sql.matchAll(/CREATE (OR REPLACE )?FUNCTION (\w+)\(\)[\s\S]*?AS \$\$/g)];
    expect(functions.length).toBe(8);
    for (const [header, , name] of functions) {
      expect(header, name).toContain(PINNED);
    }
  });

  it('replaces every function migration 0022 created', () => {
    const created0022 = [...sqlOf(MIGRATION_0022).matchAll(/CREATE FUNCTION (\w+)\(\)/g)].map(
      (m) => m[1],
    );
    const replaced = [...sql.matchAll(/CREATE OR REPLACE FUNCTION (\w+)\(\)/g)].map((m) => m[1]);
    expect(created0022.sort()).toEqual(replaced.sort());
    expect(created0022).toHaveLength(6);
  });

  it('schema-qualifies every relation its function bodies read', () => {
    for (const [, body] of sql.matchAll(/AS \$\$([\s\S]*?)\$\$;/g)) {
      expect(body!).not.toMatch(/\b(FROM|JOIN)\s+source_discovery_/);
      expect(body!).not.toMatch(/\ssource_discovery_\w+%ROWTYPE/);
    }
  });

  it('grants the capability SELECT/INSERT on starts and SELECT on verifications only', () => {
    const grants = [...sql.matchAll(/GRANT\s+([^;]*?)\s+ON\s+([^;]*?)\s+TO\s+(\w+)\s*;/g)].map(
      ([, privileges, tables, grantee]) =>
        `${grantee}:${privileges!.replace(/\s+/g, ' ').trim()}:${tables!.replace(/\s+/g, ' ').trim()}`,
    );
    expect(grants.sort()).toEqual(
      [
        'nwf_readonly:SELECT:source_discovery_query_call_starts, source_discovery_smoke_verifications',
        'nwf_source_discovery:SELECT, INSERT:source_discovery_query_call_starts',
        'nwf_source_discovery:SELECT:source_discovery_smoke_verifications',
      ].sort(),
    );
    expect(identifiers).not.toMatch(
      /\bGRANT\b[^;]*\b(UPDATE|DELETE|TRUNCATE|TEMPORARY|REFERENCES|TRIGGER|ALL)\b[^;]*\bTO\b/i,
    );
    expect(identifiers).not.toMatch(/SECURITY DEFINER|CREATE ROLE|ALTER ROLE|\bLOGIN\b/i);
    // The only DROPs are the two widened CHECKs, each re-added in the next statement.
    expect([...identifiers.matchAll(/\bDROP\s+(\w+\s+\w+)/gi)].map((m) => m[1])).toEqual([
      'CONSTRAINT source_discovery_query_calls_outcome_chk',
      'CONSTRAINT source_discovery_run_completions_reason_chk',
    ]);
  });

  it('declares no prompt, response, transcript, contact, country, score or rank column', () => {
    expect(identifiers).not.toMatch(
      /\b\w*(contact|email|phone|mailbox|country|locale|market|score|rank|prompt|response|transcript|query_text)\w*\b/i,
    );
  });

  it('makes both new tables append-only for every role', () => {
    for (const table of [
      'source_discovery_query_call_starts',
      'source_discovery_smoke_verifications',
    ]) {
      expect(sql, table).toMatch(
        new RegExp(
          `BEFORE UPDATE OR DELETE ON ${table}\\s+FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation\\(\\)`,
        ),
      );
    }
  });
});

describe('WW E-SDFX: ADR 0028 records what is not yet known', () => {
  const adr = readCurrent(ADR);

  it('the live D8 smoke must confirm the hook before reliance (UNKNOWN until then)', () => {
    expect(adr).toMatch(/## 9\. Security-review repair \(WW E-SDFX, migration 0025\)/);
    expect(adr).toMatch(
      /\*\*The live D8 smoke must confirm the PreToolUse hook is invoked for\s+the WebSearch/,
    );
    expect(adr).toMatch(
      /\*\*UNKNOWN \(§9\)\.\*\* Whether the live SDK actually invokes the PreToolUse hook/,
    );
  });

  it('records the migration 0022 header correction and the OWNER verification step', () => {
    expect(adr).toMatch(/\*\*Governance correction — migration 0022's header\.\*\*/);
    expect(adr).toContain('source_discovery_briefs_id_digest_uidx');
    expect(adr).toContain('source_discovery_runs_live_requires_grant');
    expect(adr).toMatch(/INSERT INTO source_discovery_smoke_verifications/);
  });
});
