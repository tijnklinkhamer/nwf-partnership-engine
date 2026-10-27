/**
 * WW E-SD FIREWALL - live source discovery exists ONLY behind a stored
 * OWNER-path grant (ADR 0027 D1-D8, ADR 0028), and the worldwide planner is
 * pure query localisation.
 *
 * Pinned by path and content over the CURRENT tree (no commit range: the
 * integration lead replays lanes linearly):
 *
 *   - exactly two production Agent SDK import sites: the classifier's
 *     `agentSdkRunner.ts` and `sourceDiscovery/agentQuery.ts`, which imports
 *     the SDK's `query`, its usage-limit vocabulary and the `Options` type only;
 *   - `agentQuery.ts` reaches `classify/` for exactly the eight ADR 0027 D3
 *     authentication modules, by exact path, and is the only sourceDiscovery
 *     file that reaches `classify/` at all;
 *   - WebFetch is never offered or allowed: the adapter's options are
 *     WebSearch-only and agentQuery copies them, adding runtime fields only;
 *     WW E-SDFX (security review P1-3, ADR 0028 s9) tightened this by exact
 *     path: WebSearch is never PRE-APPROVED (`allowedTools` is empty, the
 *     permission mode `default`), and agentQuery registers the adapter's
 *     PreToolUse hook and hands `canUseTool` the tool-use id;
 *   - every one of the eleven WW E-SD files imports only its reviewed
 *     modules outside the namespace (a full per-file allowlist, as the REL
 *     L2 files have);
 *   - `fromStoredGrant` is the only production constructor of the capability,
 *     called by `grantedRun.ts` alone; no production file writes a grant;
 *   - no file under `sourceDiscovery/` fetches, classifies, scores or ranks;
 *   - the planner is PURE, names no favoured geography, and its localisation
 *     tables never reach a nomination;
 *   - migration 0022 grants the capability SELECT on grants and SELECT/INSERT
 *     on the run's own evidence only, creates no role and no LOGIN, and its
 *     CHECKs mirror the TypeScript closed sets.
 */
import { describe, expect, it } from 'vitest';

import { posix } from 'node:path';

import {
  WebSearchGate,
  buildWebSearchAgentOptions,
} from '../../orgunits/sourceDiscovery/claudeMaxWebSearchProvider.js';
import {
  QUERY_CALL_OUTCOMES,
  SOURCE_DISCOVERY_ALLOWED_MODELS,
} from '../../orgunits/sourceDiscovery/grant.js';
import { codeOf, productionFiles, readCurrent, specifiers } from '../helpers/phaseRange.js';

const NS = 'src/orgunits/sourceDiscovery/';
const PLANNER = `${NS}planner/`;
const AGENT_QUERY = `${NS}agentQuery.ts`;
const AUTHORISATION = `${NS}authorisation.ts`;
const GRANTED_RUN = `${NS}grantedRun.ts`;
const ADAPTER = `${NS}claudeMaxWebSearchProvider.ts`;
const INDEX = `${NS}index.ts`;
const CLI_COMMAND = 'src/cli/commands/sourceDiscovery.ts';
const CLASSIFIER_SDK_SITE = 'src/orgunits/classify/provider/agentSdkRunner.ts';
const MIGRATION = 'migrations/0022_source_discovery_live_grants.sql';
const SDK_PACKAGE = ['@anthropic-ai', 'claude-agent-sdk'].join('/');

/** ADR 0027 D3: exactly these classifier modules, each by exact path. */
const D3_AUTH_MODULES = [
  '../classify/provider/authConflicts.js',
  '../classify/provider/authStatus.js',
  '../classify/provider/authStatusRunner.js',
  '../classify/provider/claudeCodeExecutable.js',
  '../classify/provider/environment.js',
  '../classify/provider/preflight.js',
  '../classify/provider/profile.js',
  '../classify/provider/profileHygiene.js',
];

const nsFiles = () => productionFiles().filter((f) => f.startsWith(NS));
const code = (file: string) => codeOf(readCurrent(file));
const reachesClassify = (source: string) =>
  specifiers(source).some((s) => /(^|\/)classify(\/|$)/.test(s)) ||
  /orgunits\/classify/.test(source);

describe('WW E-SD: the Agent SDK is reachable from exactly two sites', () => {
  it('imports the SDK in agentSdkRunner.ts and agentQuery.ts only', () => {
    const importers = productionFiles().filter((f) =>
      specifiers(code(f)).some((s) => s === SDK_PACKAGE),
    );
    expect(importers).toEqual([CLASSIFIER_SDK_SITE, AGENT_QUERY].sort());
  });

  it('agentQuery.ts imports the SDK query, its usage-limit vocabulary and Options, nothing else', () => {
    const source = code(AGENT_QUERY);
    const block = new RegExp(
      `import \\{([^}]*)\\} from '${SDK_PACKAGE.replace('/', '\\/')}';`,
    ).exec(source);
    expect(block).not.toBeNull();
    expect(
      block![1]!
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .sort(),
    ).toEqual(['USAGE_LIMIT_ERROR_PREFIXES', 'query as agentSdkQuery', 'type Options'].sort());
    expect(source.split(SDK_PACKAGE)).toHaveLength(2);
  });

  it('agentQuery.ts reaches classify/ for exactly the eight ADR 0027 D3 modules', () => {
    const classify = specifiers(code(AGENT_QUERY)).filter((s) => /(^|\/)classify\//.test(s));
    expect([...new Set(classify)].sort()).toEqual(D3_AUTH_MODULES);
  });

  it('no other sourceDiscovery file reaches classify/, and no classify/ file reaches sourceDiscovery', () => {
    for (const file of nsFiles()) {
      if (file === AGENT_QUERY) continue;
      expect(reachesClassify(code(file)), file).toBe(false);
    }
    for (const file of productionFiles().filter((f) => f.startsWith('src/orgunits/classify/'))) {
      expect(code(file), file).not.toMatch(/sourceDiscovery/);
    }
  });

  it('agentQuery.ts owns no socket, spawns nothing itself and writes no byte', () => {
    const source = code(AGENT_QUERY);
    expect(source).not.toMatch(
      /\bfetch\s*\(|node:(net|tls|http|https|dns|child_process)|writeFile|createWriteStream|appendFile|copyFile/,
    );
    expect(source).not.toMatch(/executeWebAttempt|authoriseAndFetchPage|runRootAcquisition/);
  });
});

/**
 * WW E-SDFX: the eleven WW E-SD files, each with its FULL list of imports
 * that leave `src/orgunits/sourceDiscovery/` - the REL L2 files have had one
 * since L2 (relL2SourceDiscovery.firewall.test.ts). A new external import in
 * any of them fails here until it is reviewed and named.
 */
const WW_E_SD_EXTERNAL_IMPORTS: Readonly<Record<string, readonly string[]>> = {
  'agentQuery.ts': [...D3_AUTH_MODULES, SDK_PACKAGE, 'node:fs/promises', 'node:os', 'node:path'],
  'allowedModels.ts': [],
  'grant.ts': [],
  'grantStore.ts': [],
  'grantedRun.ts': ['pg'],
  'index.ts': [],
  'planner/placeNames.ts': [],
  'planner/plan.ts': ['node:crypto'],
  'planner/queryLanguages.ts': [],
  'planner/templates.ts': [],
  'planner/vocabulary.ts': [],
};

describe('WW E-SDFX: every WW E-SD file imports only its reviewed external modules', () => {
  /** Specifiers that leave the namespace: bare packages, or relative paths resolving outside it. */
  const externalOf = (file: string): string[] =>
    [...new Set(specifiers(code(file)))]
      .filter((s) => {
        if (!s.startsWith('.')) return true;
        return !posix.join(posix.dirname(file), s).startsWith(NS);
      })
      .sort();

  it('names exactly the eleven files', () => {
    const ww = Object.keys(WW_E_SD_EXTERNAL_IMPORTS).map((f) => `${NS}${f}`);
    for (const file of ww) expect(nsFiles(), file).toContain(file);
    expect(ww).toHaveLength(11);
  });

  it('each file reaches outside the namespace for exactly its reviewed modules', () => {
    for (const [name, allowed] of Object.entries(WW_E_SD_EXTERNAL_IMPORTS)) {
      expect(externalOf(`${NS}${name}`), name).toEqual([...allowed].sort());
    }
  });

  it('the detector sees a new external import (mutation oracle)', () => {
    const mutated = `import x from '../web/gateway.js';\nimport y from './grant.js';`;
    const found = [...new Set(specifiers(mutated))].filter(
      (s) => !s.startsWith('.') || !posix.join(posix.dirname(`${NS}grant.ts`), s).startsWith(NS),
    );
    expect(found).toEqual(['../web/gateway.js']);
  });
});

describe('WW E-SD: WebSearch only, WebFetch never', () => {
  it('the adapter offers WebSearch only, pre-approves nothing, and permits only the planned query', async () => {
    const options = buildWebSearchAgentOptions(new WebSearchGate('planned'));
    expect([...options.tools]).toEqual(['WebSearch']);
    // WW E-SDFX (P1-3): an allowedTools entry is auto-allowed WITHOUT canUseTool,
    // and dontAsk denies an "ask" without it: neither may return.
    expect([...options.allowedTools]).toEqual([]);
    expect(options.permissionMode).toBe('default');
    expect(options.disallowedTools[0]).toBe('WebFetch');
    for (const name of ['WebFetch', 'Bash', 'Read', 'Write', 'Task', 'Agent', 'Skill']) {
      expect((await options.canUseTool(name, {}, `id-${name}`)).behavior, name).toBe('deny');
    }
    expect((await options.canUseTool('WebSearch', { query: 'other' }, 'a')).behavior).toBe('deny');
    expect((await options.canUseTool('WebSearch', { query: 'planned' }, 'b')).behavior).toBe(
      'allow',
    );
    expect((await options.canUseTool('WebSearch', { query: 'planned' }, 'c')).behavior).toBe(
      'deny',
    );
  });

  it('agentQuery.ts copies the adapter options, registers its gate hook, and names no tool of its own', () => {
    const source = code(AGENT_QUERY);
    expect(source).toMatch(/tools: \[\.\.\.o\.tools\]/);
    expect(source).toMatch(/allowedTools: \[\.\.\.o\.allowedTools\]/);
    expect(source).toMatch(/disallowedTools: \[\.\.\.o\.disallowedTools\]/);
    expect(source).toMatch(
      /canUseTool: \(toolName, input, context\) =>\s*o\.canUseTool\(toolName, input, context\.toolUseID\)/,
    );
    expect(source).toMatch(/hooks: \{ PreToolUse: \[\{ hooks: \[preToolUseHook\(o\)\] \}\] \}/);
    expect(source).toMatch(/permissionMode: o\.permissionMode/);
    expect(source).toMatch(/mcpServers: \{\}/);
    expect(source).toMatch(/settingSources: \[\]/);
    expect(source).toMatch(/skills: \[\]/);
    expect(source).toMatch(/plugins: \[\]/);
    expect(source).not.toMatch(/'(WebFetch|WebSearch|Bash|Read|Write|Edit|Task|Agent)'/);
    expect(source).not.toMatch(/bypassPermissions|allowDangerouslySkipPermissions/);
    for (const file of nsFiles()) {
      expect(code(file), file).not.toMatch(/'dontAsk'|bypassPermissions|'acceptEdits'|'auto'/);
    }
  });

  it('only the adapter names WebFetch, and only to refuse it', () => {
    for (const file of nsFiles()) {
      if (file === ADAPTER) continue;
      expect(code(file), file).not.toMatch(/WebFetch/);
    }
    expect(code(ADAPTER).match(/'WebFetch'/g)).toHaveLength(1);
  });
});

describe('WW E-SD: the capability is derived from a stored grant, and only there', () => {
  it('has exactly three static members and two constructions', () => {
    const source = code(AUTHORISATION);
    expect([...source.matchAll(/\bstatic\s+(\w+)/g)].map((m) => m[1])).toEqual([
      'isAuthorisation',
      'fromStoredGrant',
      'sealedForVitest',
    ]);
    expect(source.match(/new SourceDiscoveryAuthorisation\(/g)).toHaveLength(2);
    expect(source).toMatch(/private constructor\(/);
    expect(source).toMatch(
      /static sealedForVitest\(scope: string\): SourceDiscoveryAuthorisation \{\s*if \(process\.env\['VITEST'\] !== 'true'\) \{\s*throw new Error\(/,
    );
  });

  it('fromStoredGrant is called and the adapter constructed by grantedRun.ts alone', () => {
    for (const file of productionFiles()) {
      const source = code(file);
      if (file !== GRANTED_RUN && file !== AUTHORISATION) {
        expect(source, file).not.toMatch(/fromStoredGrant\s*\(/);
      }
      if (file !== GRANTED_RUN && file !== ADAPTER) {
        expect(source, file).not.toMatch(/new\s+ClaudeMaxWebSearchProvider\b/);
      }
      if (file !== AUTHORISATION) expect(source, file).not.toMatch(/sealedForVitest\s*\(/);
    }
    expect(code(GRANTED_RUN)).toMatch(
      /SourceDiscoveryAuthorisation\.fromStoredGrant\(\s*pool,\s*input\.grantId,\s*deps\.clock,?\s*\)/,
    );
  });

  it('no production file writes a grant; the run writes its own evidence only', () => {
    for (const file of productionFiles()) {
      expect(code(file), file).not.toMatch(/INSERT INTO source_discovery_grants\b/);
    }
    const writes = (file: string) =>
      [...code(file).matchAll(/\b(INSERT INTO|UPDATE|DELETE FROM|TRUNCATE)\s+(\w+)/g)].map(
        (m) => `${m[1]} ${m[2]}`,
      );
    expect(writes(`${NS}grantStore.ts`)).toEqual([
      'INSERT INTO source_discovery_briefs',
      'INSERT INTO source_discovery_runs',
      'INSERT INTO source_discovery_grant_uses',
      // WW E-SDFX (migration 0025): the database's permission, before each call.
      'INSERT INTO source_discovery_query_call_starts',
      'INSERT INTO source_discovery_query_calls',
      'INSERT INTO source_discovery_nomination_known_marks',
      'INSERT INTO source_discovery_run_completions',
    ]);
    for (const file of [
      AGENT_QUERY,
      AUTHORISATION,
      GRANTED_RUN,
      INDEX,
      `${NS}grant.ts`,
      `${NS}allowedModels.ts`,
    ]) {
      expect(writes(file), file).toEqual([]);
    }
  });

  it('grantedRun.ts is reached only by the CLI and the wiring index', () => {
    const importers = productionFiles().filter((f) =>
      specifiers(code(f)).some((s) => /(^|\/)grantedRun\.js$/.test(s)),
    );
    expect(importers).toEqual([CLI_COMMAND, INDEX].sort());
  });

  it('the CLI keeps LIVE_SEARCH_NOT_AUTHORISED for a run without --grant-id', () => {
    const cli = code(CLI_COMMAND);
    expect(cli).toMatch(
      /if \(values\['execute'\] === true\) \{\s*return refuse\(\s*'LIVE_SEARCH_NOT_AUTHORISED'/,
    );
    expect(cli).toMatch(
      /if \(values\['execute'\] !== true\) throw new UsageError\('--grant-id requires --execute\.'\);/,
    );
    expect(cli).not.toMatch(/SourceDiscoveryAuthorisation|ClaudeMaxWebSearchProvider/);
  });
});

describe('WW E-SD: nothing in sourceDiscovery/ fetches, classifies, scores or ranks', () => {
  it('opens no socket and reaches no acquisition path', () => {
    for (const file of nsFiles()) {
      const source = code(file);
      expect(source, file).not.toMatch(
        /\bfetch\s*\(|node:(net|tls|http|https|dns)\b|executeWebAttempt|authoriseAndFetchPage|runRootAcquisition|runOrganisationDiscovery|robots\.txt|sitemap/,
      );
      for (const s of specifiers(source)) {
        expect(s, file).not.toMatch(
          /(^|\/)web\/(gateway|robots|robotsAuthority|pageEvidence)\.js$/,
        );
        expect(s, file).not.toMatch(
          /(^|\/)(orchestrator|acquisition|c1Extraction|qualificationInput)\//,
        );
      }
    }
  });

  it('classifies, scores and ranks nothing', () => {
    for (const file of nsFiles()) {
      const source = code(file);
      expect(source, file).not.toMatch(
        /rubric|\bU3\b|out of 15|\bscore\w*\s*[:=(]|\brank\w*\s*[:=(]|\bweight\w*\s*[:=(]|classify\s*\(/i,
      );
      expect(source, file).not.toMatch(/\b(relevant|verified|qualified|preferred)\s*[:=]/);
    }
  });
});

describe('WW E-SD: the planner is pure query localisation', () => {
  const plannerFiles = () => nsFiles().filter((f) => f.startsWith(PLANNER));

  it('is exactly the five reviewed files', () => {
    expect(plannerFiles()).toEqual(
      ['placeNames.ts', 'plan.ts', 'queryLanguages.ts', 'templates.ts', 'vocabulary.ts'].map(
        (f) => `${PLANNER}${f}`,
      ),
    );
  });

  it('is PURE: no database, environment, clock, randomness, filesystem or SQL', () => {
    for (const file of plannerFiles()) {
      const source = code(file);
      expect(source, file).not.toMatch(
        /from 'pg'|process\.|Date\.now|new Date\(|Math\.random|node:fs|node:os|setTimeout/,
      );
      expect(source, file).not.toMatch(/\b(SELECT|INSERT|UPDATE|DELETE)\b\s/);
      for (const s of specifiers(source)) {
        expect(s, file).toMatch(/^(\.\/|\.\.\/brief\.js$|node:crypto$)/);
      }
    }
  });

  it('names no favoured geography outside its two cited data tables', () => {
    for (const file of plannerFiles()) {
      if (file.endsWith('placeNames.ts') || file.endsWith('queryLanguages.ts')) continue;
      expect(code(file), file).not.toMatch(/'[A-Z]{2}'/);
    }
    expect(code(`${PLANNER}plan.ts`)).not.toMatch(/pilot|favou?r|prefer|priorit/i);
  });

  it('keeps query localisation away from nominations', () => {
    // The wiring index re-exports the template LANGUAGE LIST only; it writes nothing.
    for (const file of nsFiles().filter((f) => !f.startsWith(PLANNER) && f !== INDEX)) {
      for (const s of specifiers(code(file))) {
        expect(s, file).not.toMatch(/planner\/(placeNames|queryLanguages|templates)\.js$/);
      }
    }
    // Nominations carry no geography, language or country, before and after 0022.
    expect(code(`${NS}store.ts`)).not.toMatch(
      /INSERT INTO source_discovery_nominations[^;]*\b(geography|language|country)\b/,
    );
  });
});

describe('WW E-SD: migration 0022 is narrow', () => {
  const sql = readCurrent(MIGRATION).replace(/--.*$/gm, '');
  const identifiers = sql.replace(/'(?:[^']|'')*'/g, "''");

  it('grants SELECT on grants and SELECT/INSERT on the run evidence, to the existing capability only', () => {
    const grants = [...sql.matchAll(/GRANT\s+([\s\S]*?)\s+ON\s+([\s\S]*?)\s+TO\s+(\w+)\s*;/g)].map(
      ([, privileges, tables, grantee]) =>
        `${grantee}:${privileges!.replace(/\s+/g, ' ').trim()}:${tables!.replace(/\s+/g, ' ').trim()}`,
    );
    expect(grants.sort()).toEqual(
      [
        'nwf_readonly:SELECT:source_discovery_grants, source_discovery_grant_uses, source_discovery_query_calls, source_discovery_run_completions, source_discovery_nomination_known_marks',
        'nwf_source_discovery:SELECT, INSERT:source_discovery_grant_uses, source_discovery_query_calls, source_discovery_run_completions, source_discovery_nomination_known_marks',
        'nwf_source_discovery:SELECT:source_discovery_grants',
      ].sort(),
    );
    expect(identifiers).not.toMatch(
      /\bGRANT\b[^;]*\b(UPDATE|DELETE|TRUNCATE|TEMPORARY|REFERENCES|TRIGGER|ALL)\b[^;]*\bTO\b/i,
    );
    expect(identifiers).not.toMatch(
      /SECURITY DEFINER|CREATE ROLE|ALTER ROLE|\bLOGIN\b|DROP\s|ALTER TABLE/i,
    );
  });

  it('declares no contact, country, score, rank or status column', () => {
    expect(identifiers).not.toMatch(
      /\b\w*(contact|email|phone|mailbox|country|locale|market|score|rank|status|verified|relevant|qualif|prompt|response|transcript)\w*\b/i,
    );
  });

  it('mirrors the TypeScript closed sets in its CHECKs', () => {
    const models = /model_id IN \(([^)]*)\)/.exec(readCurrent(MIGRATION))![1]!;
    expect([...models.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()).toEqual(
      [...SOURCE_DISCOVERY_ALLOWED_MODELS].sort(),
    );
    const outcomes = /outcome IN \(('RESULTS'[^)]*)\)/.exec(readCurrent(MIGRATION))![1]!;
    // WW E-SDFX: migration 0025 widened this set by exactly SEARCH_BINDING_REFUSED
    // (pinned against 0025 in wwSourceDiscoverySearchGate.firewall.test.ts).
    expect([...outcomes.matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual(
      QUERY_CALL_OUTCOMES.filter((o) => o !== 'SEARCH_BINDING_REFUSED'),
    );
    expect(sql).toMatch(/max_runs\s+integer\s+NOT NULL DEFAULT 1/);
    expect(sql).toMatch(/CHECK \(max_runs BETWEEN 1 AND 200\)/);
    expect(sql).toMatch(/expires_at - issued_at <= interval '14 days'/);
    expect(sql).toMatch(/CHECK \(max_results_per_query BETWEEN 1 AND 20\)/);
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX source_discovery_grant_uses_grant_seq_uidx\s+ON source_discovery_grant_uses \(grant_id, run_seq\)/,
    );
    expect(sql).toMatch(
      /CREATE CONSTRAINT TRIGGER source_discovery_runs_live_requires_grant\s+AFTER INSERT ON source_discovery_runs\s+DEFERRABLE INITIALLY DEFERRED/,
    );
  });

  it('makes every new table append-only for every role', () => {
    for (const table of [
      'source_discovery_grants',
      'source_discovery_grant_uses',
      'source_discovery_query_calls',
      'source_discovery_run_completions',
      'source_discovery_nomination_known_marks',
    ]) {
      expect(sql, table).toMatch(
        new RegExp(
          `BEFORE UPDATE OR DELETE ON ${table}\\s+FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation\\(\\)`,
        ),
      );
    }
  });
});
