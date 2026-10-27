/**
 * WW E-Q FIREWALL - the OWNER-signed acquisition campaign and its work queue
 * (OWNER directive 2026-10-27, ADR 0029, migration 0023).
 *
 * The OWNER directive approves a BOUNDED, OWNER-SIGNED, DEFAULT-INERT queue
 * and worker core under `src/orgunits/acquisition/` - and nothing else. This
 * file pins that boundary by path and content (never by commit):
 *
 *   - the namespace is exactly the named files, opens no socket, spawns no
 *     process or thread, and imports nothing that reaches the network - no
 *     gateway, robots, sitemap, source-discovery provider, classifier, subject
 *     research path or orchestration entry point; stage work arrives only
 *     through the injected `StageHandler` port;
 *   - its SQL only ever SELECTs and INSERTs;
 *   - the worker capability holds SELECT + INSERT only, never INSERT on
 *     campaigns or control events, and nobody holds a mutating grant;
 *   - campaign verification uses the PINNED trust set, the production set is
 *     EMPTY, a TEST_ONLY set exists only inside vitest, and no private-key
 *     operation exists in production code;
 *   - `CampaignAuthority` has one construction site behind an unexported mint;
 *   - the human gate (IDENTITY_REVIEW) is structural in code and schema;
 *   - priority is the stage rule only - no score, no second ranking;
 *   - the CLI has no every-campaign flag, no key/trust/signature option, no
 *     web import, no wired production handler, and is dispatched with no
 *     injected dependency;
 *   - no job-queue or scheduler DEPENDENCY was added and `src/queue` /
 *     `src/workers` stay absent: the earlier no-queue firewalls
 *     (phase1b/phase2b) hold UNCHANGED, because this queue lives in the
 *     database and the approved namespace, not in a framework.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ACQUISITION_OPTIONS } from '../../cli/commands/acquisition.js';
import {
  CampaignTrustSet,
  OPERATIONAL_OWNER_CAMPAIGN_KEYS,
  priorityOf,
  STAGES,
  WORKER_STAGES,
} from '../../orgunits/acquisition/index.js';
import { WIRED_STAGES } from '../../orgunits/acquisitionWiring/index.js';
import {
  REPO_ROOT,
  codeOf,
  productionFiles,
  readCurrent,
  specifiers,
} from '../helpers/phaseRange.js';

const NS = 'src/orgunits/acquisition/';
const NS_FILES = [
  'authority.ts',
  'canonical.ts',
  'document.ts',
  'index.ts',
  'scheduler.ts',
  'status.ts',
  'store.ts',
  'trust.ts',
  'verify.ts',
  'vocabulary.ts',
  'worker.ts',
].map((f) => `${NS}${f}`);
const CLI = 'src/cli/commands/acquisition.ts';
const CLI_ENTRY = 'src/cli/index.ts';
const MIGRATION = 'migrations/0023_acquisition_campaigns_and_queue.sql';
const NEW_TABLES = [
  'acquisition_campaigns',
  'acquisition_campaign_control_events',
  'acquisition_work_items',
  'acquisition_work_claims',
  'acquisition_work_outcomes',
  'acquisition_worker_stops',
];

const code = (file: string): string => codeOf(readCurrent(file));

/** Every module specifier the namespace may name, by exact text. */
const ALLOWED_SPECIFIERS = new Set([
  'node:crypto',
  'pg',
  '../orchestrator/circuitBreaker.js',
  '../orchestrator/clock.js',
  './authority.js',
  './canonical.js',
  './document.js',
  './scheduler.js',
  './status.js',
  './store.js',
  './trust.js',
  './verify.js',
  './vocabulary.js',
  './worker.js',
]);

describe('WW E-Q: the acquisition namespace is exactly what was approved', () => {
  it('holds exactly the named files', () => {
    const files = readdirSync(join(REPO_ROOT, NS))
      .map((f) => `${NS}${f}`)
      .sort();
    expect(files).toEqual([...NS_FILES].sort());
  });

  it('opens no socket, spawns nothing and imports only the allowed modules', () => {
    for (const file of [...NS_FILES, CLI]) {
      const c = code(file);
      expect(c, file).not.toMatch(
        /node:(net|tls|http|https|dns|dgram|child_process|worker_threads|cluster)\b|\bfetch\s*\(|new\s+WebSocket|\bspawn\s*\(|\bexec(File)?\s*\(/,
      );
    }
    for (const file of NS_FILES) {
      for (const spec of specifiers(code(file))) {
        expect(ALLOWED_SPECIFIERS.has(spec), `${file} imports ${spec}`).toBe(true);
      }
    }
  });

  it('reaches no gateway, robots, sitemap, provider, classifier or research path, even by name', () => {
    for (const file of [...NS_FILES, CLI]) {
      expect(code(file), file).not.toMatch(
        /orgunits\/web|\.\.\/web\/|robots|sitemap|sourceDiscovery|classify|subjectRun|subjectAdmission|subjectResearch|rootRunner|orchestrate\.js|frontier|executeWebAttempt|claude-agent-sdk|anthropic|WebSearch|WebFetch/,
      );
    }
  });

  it('issues only SELECT and INSERT', () => {
    for (const file of [...NS_FILES, CLI]) {
      expect(code(file), file).not.toMatch(
        /\b(UPDATE|DELETE|TRUNCATE|DROP|ALTER|GRANT|REVOKE|CREATE)\b|DO\s+UPDATE/,
      );
    }
  });

  it('holds no private-key operation, no environment read but the vitest guard, no file write', () => {
    for (const file of NS_FILES) {
      const c = code(file);
      expect(c, file).not.toMatch(
        /createPrivateKey|generateKeyPair|\bsign\s*\(|privateKey|PRIVATE KEY|writeFile|appendFile|createWriteStream/,
      );
      const envReads = c.match(/process\.env\[[^\]]+\]/g) ?? [];
      expect(envReads, file).toEqual(file === `${NS}trust.ts` ? ["process.env['VITEST']"] : []);
    }
  });

  it('names no score, verdict, relevance or contact anywhere in code', () => {
    for (const file of [...NS_FILES, CLI]) {
      expect(code(file), file).not.toMatch(
        /\b\w*([Ss]core|[Rr]elevan|[Vv]erdict|[Qq]ualif|[Ee]mail|[Pp]hone|[Cc]ontact|[Oo]utreach)\w*\b/,
      );
      expect(code(file), file).not.toMatch(/\.\.\/signals\//);
    }
  });
});

describe('WW E-Q: authority comes only from a pinned OWNER signature', () => {
  const trust = code(`${NS}trust.ts`);

  it('pins an EMPTY operational campaign trust set in reviewed source', () => {
    expect(trust).toContain(
      'export const OPERATIONAL_OWNER_CAMPAIGN_KEYS: readonly CampaignTrustEntry[] = Object.freeze([]);',
    );
    expect(OPERATIONAL_OWNER_CAMPAIGN_KEYS).toEqual([]);
    expect(CampaignTrustSet.operational().hasActiveKey()).toBe(false);
    expect(CampaignTrustSet.operational().entries()).toEqual([]);
  });

  it('builds sets only from that list or a vitest-only TEST_ONLY list', () => {
    expect([...trust.matchAll(/static (\w+)\(/g)].map((m) => m[1]).sort()).toEqual([
      'isTrustSet',
      'operational',
      'vitestOnly',
    ]);
    expect(trust).toMatch(/private constructor\(scope: CampaignTrustScope/);
    expect(trust).toContain("if (process.env['VITEST'] !== 'true') {");
    expect(trust).toContain(
      "validateCampaignTrustEntries(OPERATIONAL_OWNER_CAMPAIGN_KEYS, 'OPERATIONAL')",
    );
    expect(trust).toContain('if ((scope ===');
    for (const file of productionFiles()) {
      if (file === `${NS}trust.ts`) continue;
      expect(code(file), file).not.toMatch(/\bvitestOnly\s*\(/);
    }
  });

  it('defaults every derivation, record, control and status to the operational set', () => {
    const authority = code(`${NS}authority.ts`);
    expect(authority.match(/deps\.trust \?\? CampaignTrustSet\.operational\(\)/g)).toHaveLength(3);
    expect(code(`${NS}status.ts`)).toContain(
      'trust: CampaignTrustSet = CampaignTrustSet.operational()',
    );
    expect(code(CLI)).toContain('const trust = deps.trust ?? CampaignTrustSet.operational();');
  });

  it('verifies the signature BEFORE interpreting a single payload byte', () => {
    const verify = code(`${NS}verify.ts`);
    const order = [
      'trust.keyFor(keyId)',
      'ed25519Verify(null, campaignSigningBytes(payloadBytes), trusted.key, signature)',
      'parseCanonicalBytes(payloadBytes)',
      'parseCampaignPayload(json)',
      'payload.keyFingerprint !== trusted.entry.fingerprint',
    ].map((s) => verify.indexOf(s));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(code(`${NS}document.ts`)).toContain(
      "export const CAMPAIGN_PROTOCOL = 'nwf-pe.acquisition-campaign/1';",
    );
    expect(code(`${NS}document.ts`)).toContain(
      'export const CAMPAIGN_SIGNING_PREFIX = `${CAMPAIGN_PROTOCOL}\\n`;',
    );
  });

  it('mints CampaignAuthority at exactly one site behind an unexported symbol', () => {
    const authority = code(`${NS}authority.ts`);
    expect(authority).toContain("const MINT: unique symbol = Symbol('CampaignAuthority.mint');");
    expect(authority).not.toMatch(/export\s+(const|let)\s+MINT/);
    expect(authority).toMatch(/private constructor\(mint: symbol, fields: AuthorityFields\)/);
    expect(authority).toContain('if (mint !== MINT) {');
    expect(authority.match(/new CampaignAuthority\(/g)).toHaveLength(1);
    expect(authority.match(/CampaignAuthority\.mint\(/g)).toHaveLength(1);
    for (const file of productionFiles()) {
      if (file === `${NS}authority.ts`) continue;
      expect(code(file), file).not.toMatch(/CampaignAuthority\.mint\(|new CampaignAuthority\(/);
    }
  });
});

describe('WW E-Q: the human gate, priority and handlers', () => {
  it('the worker never takes a handler for IDENTITY_REVIEW and parks it itself', () => {
    const worker = code(`${NS}worker.ts`);
    expect(worker).toContain(
      "throw new WorkerConfigRefusal('HANDLER_NOT_PERMITTED', HUMAN_GATE_STAGE);",
    );
    expect(worker).toContain(
      "outcome = { kind: 'AWAITING_HUMAN', queue: 'OWNER_IDENTITY_REVIEW' };",
    );
    expect(code(`${NS}vocabulary.ts`)).toContain(
      "export const HUMAN_GATE_STAGE = 'IDENTITY_REVIEW' as const satisfies Stage;",
    );
  });

  it('priority is 100 x the stage ordinal and nothing else', () => {
    expect(STAGES.map(priorityOf)).toEqual([0, 100, 200, 300, 400, 500, 600]);
    expect(code(`${NS}vocabulary.ts`)).toContain('return 100 * stageOrdinal(stage);');
    expect(readCurrent(MIGRATION)).toContain(
      'CHECK (priority = 100 * acquisition_stage_ordinal(stage))',
    );
  });

  // WW E-W (exact-path widening, ADR 0030): the empty PRODUCTION_STAGE_HANDLERS
  // constant is replaced by the wiring package's handlers, reached ONLY
  // through `createProductionStageHandlers` in the wiring index. They cover
  // every worker stage and never the human gate; the CLI still refuses a
  // campaign listing a stage nothing handles, and the worker still derives
  // authority under the EMPTY operational trust set before any claim.
  it('wires the production handlers only through the wiring index, never for the human gate', () => {
    expect([...WIRED_STAGES]).toEqual([...WORKER_STAGES]);
    expect(WIRED_STAGES).not.toContain('IDENTITY_REVIEW');
    const cli = code(CLI);
    expect(cli).not.toMatch(/PRODUCTION_STAGE_HANDLERS/);
    expect(cli.match(/createProductionStageHandlers\(/g)).toHaveLength(1);
    expect(cli).toContain("from '../../orgunits/acquisitionWiring/index.js';");
    expect(cli).toContain("code: 'ACQUISITION_HANDLERS_NOT_WIRED'");
    expect(cli).toContain('const trust = deps.trust ?? CampaignTrustSet.operational();');
  });
});

describe('WW E-Q: the CLI is narrow', () => {
  it('declares no every-campaign flag and no key, trust or signature option', () => {
    // WW E-W (exact-path widening, ADR 0030 s5/s7): exactly these (command,
    // option) pairs may name a key - the SIGNER's own encrypted private key
    // file and its id for the offline campaign signer and the batched OWNER
    // review, and the campaign key a template drafts. Never a trust, public
    // key, fingerprint, signature or passphrase option.
    const SIGNER_OPTIONS: Readonly<Record<string, readonly string[]>> = {
      'campaign sign': ['key-file', 'key-id'],
      'review sign': ['key-file', 'key-id'],
      'campaign template': ['campaign-key'],
    };
    for (const [command, options] of Object.entries(ACQUISITION_OPTIONS)) {
      for (const name of Object.keys(options)) {
        if (SIGNER_OPTIONS[command]?.includes(name)) continue;
        expect(name).not.toMatch(/^all$|every|trust|key|signature|public|fingerprint|pass|sql/);
      }
    }
    for (const [command, names] of Object.entries(SIGNER_OPTIONS)) {
      for (const name of names)
        expect(Object.keys(ACQUISITION_OPTIONS[command as never])).toContain(name);
    }
    expect(code(CLI)).not.toMatch(/['"]--all['"]|\ball:\s*\{/);
    expect(code(CLI)).not.toMatch(/orgunits\/web|executeWebAttempt|RobotsAuthorisation/);
  });

  it('is dispatched from the entry point exactly once, with no injected dependency', () => {
    const entry = code(CLI_ENTRY);
    expect(entry.match(/runAcquisitionCli\(/g)).toHaveLength(1);
    expect(entry).toContain(
      "if (argv[0] === 'acquisition') {\n    return runAcquisitionCli(argv.slice(1));\n  }",
    );
    const importers = productionFiles().filter((f) => /commands\/acquisition\.js/.test(code(f)));
    expect(importers).toEqual([CLI_ENTRY]);
  });

  it('only the CLI reaches the namespace from outside it', () => {
    const importers = productionFiles().filter(
      (f) => !f.startsWith(NS) && /orgunits\/acquisition\//.test(code(f)),
    );
    // WW E-M: the Mac runtime reads whether an OWNER campaign key is pinned,
    // through the public index only, at this one exact path (pinned in
    // wwMacRuntime.firewall.test.ts).
    expect(importers).toEqual([CLI, 'src/runtime/campaignTrust.ts']);
  });
});

describe('WW E-Q: migration 0023 is append-only and least-privilege', () => {
  const sql = readCurrent(MIGRATION);
  const sqlCode = sql.replace(/--.*$/gm, '');
  const grants = [
    ...sqlCode.matchAll(/GRANT\s+([\s\S]*?)\s+ON\s+([\s\S]*?)\s+TO\s+([\s\S]*?);/g),
  ].map((m) => ({
    privileges: m[1]!.split(',').map((p) => p.trim().toUpperCase()),
    objects: m[2]!.split(',').map((o) => o.trim()),
    grantees: m[3]!.split(',').map((g) => g.trim()),
  }));

  it('grants only SELECT, INSERT, USAGE and CONNECT, and never a mutating privilege', () => {
    for (const g of grants) {
      for (const p of g.privileges) {
        expect(['SELECT', 'INSERT', 'USAGE', 'CONNECT']).toContain(p);
      }
    }
    expect(sqlCode).not.toMatch(/GRANT\s+(ALL|UPDATE|DELETE|TRUNCATE|TEMPORARY)/i);
    expect(sqlCode).not.toMatch(/SECURITY\s+DEFINER/i);
  });

  it('never lets the worker write a campaign or a control event', () => {
    for (const g of grants) {
      if (!g.grantees.includes('nwf_acquisition_worker') || !g.privileges.includes('INSERT'))
        continue;
      expect(g.objects).not.toContain('acquisition_campaigns');
      expect(g.objects).not.toContain('acquisition_campaign_control_events');
      expect(g.objects.every((o) => NEW_TABLES.includes(o))).toBe(true);
    }
  });

  it('creates a NOLOGIN capability and no login, and alters no existing table', () => {
    expect(sqlCode).toMatch(/CREATE ROLE nwf_acquisition_worker NOLOGIN;/);
    expect(sqlCode).toMatch(
      /ALTER ROLE nwf_acquisition_worker\s+NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD NULL;/,
    );
    expect(sqlCode).not.toMatch(/\bLOGIN\s+PASSWORD\b|WITH\s+LOGIN/i);
    const altered = [...sqlCode.matchAll(/ALTER TABLE\s+(\w+)/g)].map((m) => m[1]);
    expect(altered.every((t) => NEW_TABLES.includes(t!))).toBe(true);
  });

  it('makes every new table append-only and pins the race and duplicate-ADVANCED guards', () => {
    for (const table of NEW_TABLES) {
      expect(sqlCode).toMatch(
        new RegExp(
          `BEFORE UPDATE OR DELETE ON ${table}\\s+FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation\\(\\);`,
        ),
      );
    }
    expect(sqlCode).toContain('ON acquisition_work_claims (work_item_id, attempt_no);');
    expect(sqlCode).toContain(
      "ON acquisition_work_outcomes (work_item_id) WHERE outcome <> 'RETRY_SCHEDULED';",
    );
    expect(sqlCode).toContain('an identity-review item only ever awaits the OWNER');
    expect(sqlCode).toContain('only the owner path may release an identity-review item');
  });

  it('adds no contact, score, verdict or country column', () => {
    const columns = [
      ...sqlCode.matchAll(/^\s{4}(\w+)\s+(uuid|text|jsonb|integer|timestamptz|boolean|bytea)/gm),
    ].map((m) => m[1]!);
    expect(columns.length).toBeGreaterThan(40);
    for (const column of columns) {
      expect(column).not.toMatch(
        /email|phone|contact|person|score|rank|relevan|verdict|qualif|verified|country|locale|market|language/,
      );
    }
  });
});

describe('WW E-Q: the earlier no-queue firewalls hold unchanged', () => {
  it('adds no job-queue or scheduler dependency, and src/queue and src/workers stay absent', () => {
    const pkg = JSON.parse(readCurrent('package.json')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    for (const banned of [
      'graphile-worker',
      'pg-boss',
      'bullmq',
      'bull',
      'agenda',
      'n8n',
      'temporal',
      'node-cron',
      'cron',
      'bree',
    ]) {
      expect(names).not.toContain(banned);
    }
    for (const dir of ['src/queue', 'src/workers']) {
      let exists = true;
      try {
        statSync(join(REPO_ROOT, dir));
      } catch {
        exists = false;
      }
      expect(exists, dir).toBe(false);
    }
  });

  it('runs no timer loop: the only waits are the injected clock', () => {
    for (const file of NS_FILES) {
      const c = code(file);
      expect(c, file).not.toMatch(/setInterval|setTimeout|setImmediate|Date\.now\(|Math\.random/);
    }
    expect(readFileSync(join(REPO_ROOT, `${NS}worker.ts`), 'utf8')).toContain(
      "import { realClock, type Clock } from '../orchestrator/clock.js';",
    );
  });
});
