/**
 * PHASE-2B-FIREWALL
 *
 * The Phase 1A, 1B and 1D firewalls still apply in full and are not restated
 * here; all three walk every source file, so they already cover everything this
 * slice adds. This file asserts the boundaries that only became reachable once
 * a schema for FIRST-PARTY WEB ACQUISITION existed.
 *
 * PHASE 2B-1b MADE THESE CHECKS LOAD-BEARING.
 *
 *   2B-1a was schema, a role and this firewall, written so that every check was
 *   TRUE TODAY and BECAME BINDING the moment someone wrote the acquisition
 *   code - which is the only kind of firewall worth having for a boundary that
 *   does not exist yet. 2B-1b wrote that code, so the checks below are now
 *   about a module that exists rather than one that might.
 *
 *   ONE thing was deliberately widened, exactly once, and it is named
 *   throughout: src/orgunits/web/gateway.ts may open a socket. ADR 0004 s18
 *   said this would be "a deliberate, visible act in 2B-1b - the test fails
 *   until someone edits it on purpose". Everything else here got STRICTER.
 *
 * What this file pins:
 *
 *   - ONE network location, and only one: src/orgunits/web/gateway.ts. Any
 *     other Phase 2B file that opens a socket is a second, unreviewed network
 *     capability.
 *   - GET ONLY, no proxy indirection, TLS verification never disabled, no
 *     redirect followed and no retry hidden inside the primitive. Each of
 *     those would undo a control the gateway exists to provide.
 *   - NO RAW BODY, ever, in any migration. A response body under any name
 *     (raw_html, page_html, response_body, ...) is refused.
 *   - NO CONTACT DATA. No person, no mailbox, no telephone number, no contact
 *     table, in schema or in code.
 *   - NO RELEVANCE FACT AND NO OUTREACH CONCEPT. A ranked page is a rank. It is
 *     not "relevant", not "confirmed", not "contactable" and not "eligible".
 *   - APPEND-ONLY GRANTS. nwf_research may SELECT and INSERT. An UPDATE, DELETE
 *     or TRUNCATE grant to it - or any write grant on a Phase 1 truth table -
 *     fails here.
 *   - NO GENERIC RESEARCH NAMESPACE. src/orgunits is the approved namespace;
 *     src/research, src/crawl, src/scrape and friends stay forbidden.
 *
 * These assertions target real capabilities - dependencies, module imports,
 * SQL verbs, column names in migrations, directory existence - NOT ordinary
 * English words, so documentation prose never trips them.
 *
 * NEVER weaken a firewall test to make CI green. If one fails, the code is wrong.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SELF = 'src/test/firewall/phase2b.firewall.test.ts';

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

/**
 * Source with comments removed.
 *
 * Used where the check is about CODE rather than prose. A firewall that fails
 * because a doc comment NAMES the thing it is explaining why it refuses would
 * punish exactly the documentation that makes the boundary understandable, and
 * a firewall people learn to work around is worse than none.
 */
function code(relativePath: string): string {
  return read(relativePath)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');
}

function exists(relativePath: string): boolean {
  try {
    statSync(resolve(ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
}

/** Every executable source file, excluding this firewall and test fixtures. */
function sourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
      const absolute = resolve(dir, entry);
      if (statSync(absolute).isDirectory()) {
        if (absolute.includes(`${sep}fixtures`)) continue;
        walk(absolute);
        continue;
      }
      if (!/\.(ts|mjs|js)$/.test(entry)) continue;
      const rel = relative(ROOT, absolute).split(sep).join('/');
      if (rel === SELF) continue;
      files.push(rel);
    }
  };
  walk(resolve(ROOT, 'src'));
  walk(resolve(ROOT, 'scripts'));
  return files;
}

const SOURCE_FILES = sourceFiles();
const PRODUCTION_FILES = SOURCE_FILES.filter((file) => !file.startsWith('src/test/'));

/**
 * Everything under the approved Phase 2B namespace.
 *
 * Empty through 2B-1a, deliberately: the schema and the trust contract were
 * reviewed before the code that depends on them was written. 2B-1b populated
 * it, so every check that iterates this list is now binding rather than
 * vacuous - which is exactly when it matters.
 */
const PHASE_2B_FILES = SOURCE_FILES.filter((file) => file.startsWith('src/orgunits/'));

/**
 * THE SINGLE PERMITTED PHASE 2B NETWORK LOCATION.
 *
 * Declared here, in a test, BEFORE the file existed - which is what made the
 * 2B-1b widening a reviewed edit rather than a discovery. It exists now, and
 * the checks below say so: exactly one module under src/orgunits may reach a
 * socket, and a second cannot be introduced quietly alongside it.
 */
const PHASE_2B_NETWORK_MODULE = 'src/orgunits/web/gateway.ts';

const PACKAGE_JSON = JSON.parse(read('package.json')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const ALL_DEPENDENCIES = {
  ...(PACKAGE_JSON.dependencies ?? {}),
  ...(PACKAGE_JSON.devDependencies ?? {}),
};

const MIGRATIONS = readdirSync(resolve(ROOT, 'migrations'))
  .filter((file) => file.endsWith('.sql'))
  .map((file) => ({ file, sql: read(`migrations/${file}`) }));

const MIGRATION_0007 = MIGRATIONS.find((m) => m.file.startsWith('0007_'));

/** Column declarations in a migration: the leading `name type` of each line. */
function declaredColumns(sql: string): string[] {
  return [
    ...sql.matchAll(
      /^\s{4}([a-z_][a-z0-9_]*)\s+(?:uuid|text|integer|bigint|boolean|jsonb|numeric|timestamptz|char|varchar)/gim,
    ),
  ].map((m) => m[1]!.toLowerCase());
}

interface ParsedGrant {
  privileges: string;
  target: string;
  roles: string;
}

/**
 * Every `GRANT <privileges> ON <target> TO <roles>` in a migration, parsed.
 *
 * Parsing beats scanning here. A text search for "UPDATE" near "nwf_research"
 * would fire on the comment that explains why the role has no UPDATE - which is
 * exactly the documentation that makes the boundary legible, and punishing it
 * is how a firewall trains people to delete comments.
 */
function grants(sql: string): ParsedGrant[] {
  const pattern = /\bGRANT\s+([A-Za-z, ]+?)\s+ON\s+([^;']+?)\s+TO\s+([a-z_][a-z_, ]*)/gi;
  return [...sql.matchAll(pattern)].map((m) => ({
    privileges: m[1]!.trim(),
    target: m[2]!.trim(),
    roles: m[3]!.trim(),
  }));
}

const RESEARCH_GRANTS = MIGRATIONS.flatMap(({ file, sql }) =>
  grants(sql)
    .filter((grant) => /\bnwf_research\b/.test(grant.roles))
    .map((grant) => ({ file, grant })),
);

/** Phase 2B tables the research role both reads and appends to. */
const RESEARCH_EVIDENCE_TABLES = [
  'orgunit_research_runs',
  'orgunit_research_run_completions',
  'orgunit_fetch_observations',
  'orgunit_redirect_observations',
  'orgunit_page_evidence',
  'orgunit_page_candidates',
];

/**
 * Phase 2B tables that carry ROOT AUTHORITY.
 *
 * The automated process may READ these and must never write them: the run that
 * observes a cross-domain redirect cannot be the one that approves it.
 */
const ROOT_AUTHORITY_TABLES = ['orgunit_root_promotions', 'orgunit_root_promotion_revocations'];

describe('PHASE-2B-FIREWALL: this slice added no capability at all', () => {
  it('keeps the runtime dependency list exactly as it was', () => {
    // A schema slice needs nothing. Anything new here would be a crawler, a
    // parser or an SDK arriving ahead of its phase. Phase 2B-2C2 (ADR 0009)
    // later added the ONE approved Claude Agent SDK - a deliberate, reviewed
    // edit of this exact array; the Max-only block at the end of this file
    // pins its single permitted import site.
    expect(Object.keys(PACKAGE_JSON.dependencies ?? {}).sort()).toEqual([
      '@anthropic-ai/claude-agent-sdk',
      'pg',
      'read-excel-file',
      'saxes',
      'tldts',
      'zod',
    ]);
  });

  it('declares no crawler, scraper, browser or HTML-parsing dependency', () => {
    const forbidden = [
      'crawlee',
      'playwright',
      'playwright-core',
      '@playwright/test',
      'puppeteer',
      'puppeteer-core',
      'selenium-webdriver',
      'firecrawl',
      '@mendable/firecrawl-js',
      'crawl4ai',
      'got-scraping',
      'cheerio',
      'jsdom',
      'happy-dom',
      'linkedom',
      'node-html-parser',
      'parse5',
      'htmlparser2',
      'domhandler',
      '@mozilla/readability',
      'readability',
      'defuddle',
      'turndown',
      'robots-parser',
      'sitemapper',
      'metascraper',
      'open-graph-scraper',
      'axios',
      'got',
      'node-fetch',
      'undici',
      'superagent',
      'request',
      'iconv-lite',
      'chardet',
      'jschardet',
    ];
    for (const name of Object.keys(ALL_DEPENDENCIES)) {
      expect(
        forbidden,
        `${name} is web-acquisition machinery, and 2B-1a builds none`,
      ).not.toContain(name);
    }
  });

  it('declares no AI, search-engine, PDF, contact-data or outbound dependency', () => {
    const forbidden = [
      'openai',
      'serpapi',
      'google-search-results-nodejs',
      'pdf-parse',
      'pdfjs-dist',
      'pdf2json',
      'resend',
      'nodemailer',
      '@sendgrid/mail',
      'postmark',
    ];
    for (const name of Object.keys(ALL_DEPENDENCIES)) {
      // The single exception: the Phase 2B-2C2 Max-only classifier runtime
      // dependency (ADR 0009). Every other @anthropic-ai/* name - above all
      // the Messages-API client - stays banned.
      if (name !== '@anthropic-ai/claude-agent-sdk') {
        expect(name.startsWith('@anthropic-ai/')).toBe(false);
      }
      expect(name).not.toBe('@anthropic-ai/sdk');
      expect(name).not.toBe('anthropic');
      expect(name.includes('apollo')).toBe(false);
      expect(forbidden, `${name} belongs to a phase that is not approved`).not.toContain(name);
    }
  });

  it('declares no background job queue or scheduler', () => {
    const forbidden = ['graphile-worker', 'pg-boss', 'bullmq', 'bull', 'agenda', 'n8n', 'temporal'];
    for (const name of Object.keys(ALL_DEPENDENCIES)) {
      expect(forbidden, `${name} is orchestration built ahead of an approved phase`).not.toContain(
        name,
      );
    }
  });
});

describe('PHASE-2B-FIREWALL: exactly one institution-website network call site', () => {
  it('opens no socket and resolves no hostname outside the ONE declared gateway', () => {
    // Relaxed deliberately, in 2B-1b, for exactly ONE file - by exact path, so
    // it is an exemption rather than a drift. Everything else in the repository
    // still opens nothing.
    for (const file of SOURCE_FILES) {
      if (file === PHASE_2B_NETWORK_MODULE) continue;
      const source = read(file);
      expect(source, `${file} performs DNS resolution`).not.toMatch(
        /from\s+['"]node:dns['"]|require\(['"]node:?dns['"]\)/,
      );
      expect(source, `${file} opens a raw socket`).not.toMatch(
        /from\s+['"]node:(net|tls|http|https)['"]/,
      );
    }
  });

  it('still permits fetch() in exactly the three official-source resolvers', () => {
    // Phase 1D pinned this list. Restated here as a Phase 2B tripwire: a schema
    // slice that quietly grew a fourth fetcher would have smuggled in the
    // capability this whole phase exists to gate.
    //
    // STILL EXACTLY THREE AFTER 2B-1b: the orgunit gateway uses Node's own HTTP
    // client rather than fetch(), because only the core client lets a
    // connection be PINNED to an address that was validated first. The complete
    // socket allow-list lives in the Phase 1D firewall and names four modules.
    const fetchers = PRODUCTION_FILES.filter((file) => /\bfetch\s*\(/.test(code(file)));
    expect(fetchers.sort()).toEqual([
      'src/ingest/eche/source.ts',
      'src/ingest/ewp/source.ts',
      'src/ingest/fresr/source.ts',
    ]);
  });

  it('built the gateway, 2B-1c added the policy/evidence modules, 2B-1d added the pure signal layer, and 2B-1e added bounded discovery orchestration', () => {
    // 2B-1b is the bounded network primitive. 2B-1c added robots evaluation,
    // charset resolution, HTML extraction, PII redaction and page-evidence
    // persistence - all named in ADR 0006 BEFORE they existed, the same
    // discipline ADR 0004 s5 used for the gateway itself. 2B-1d added the
    // PURE deterministic signal layer (ADR 0007), named the same way. 2B-1e
    // (this slice) added sitemap discovery and the bounded orchestrator -
    // sitemap.ts and frontier logic were named as PLANNED (not yet existing)
    // modules in earlier CLAUDE.md prose, and this is the deliberate,
    // reviewed widening ADR 0004 s5 predicted for a module the earlier slices
    // pinned absent. The semantic classifier remains a later slice, and
    // creating it now - even empty, even as a placeholder - would be
    // building ahead of approval.
    expect(exists(PHASE_2B_NETWORK_MODULE), 'the approved gateway is missing').toBe(true);
    for (const path of [
      // Trust-contract-correction boundary modules (2B-1b). Neither reads a
      // network resource: one is a label list, the other is a capability type.
      'src/orgunits/web/hostPolicy.ts',
      'src/orgunits/web/robotsAuthority.ts',
      // 2B-1c: robots evaluation, network-free page-evidence derivation.
      'src/orgunits/web/robots.ts',
      'src/orgunits/web/robotsPolicy.ts',
      'src/orgunits/web/charset.ts',
      'src/orgunits/web/extract.ts',
      'src/orgunits/web/redact.ts',
      'src/orgunits/web/pageEvidence.ts',
      // 2B-1d: the pure deterministic signal layer. See the dedicated
      // describe block below for what these files may NOT do.
      'src/orgunits/signals/types.ts',
      'src/orgunits/signals/normalise.ts',
      'src/orgunits/signals/tree.ts',
      'src/orgunits/signals/weights.ts',
      'src/orgunits/signals/score.ts',
      'src/orgunits/signals/packs/universal.ts',
      'src/orgunits/signals/packs/fr.ts',
      'src/orgunits/signals/packs/en.ts',
      // 2B-1e: PURE sitemap XML parsing + bounded orchestration over the
      // one gateway. See the dedicated "sitemap"/"frontier" describe blocks
      // below for what these files may and may not do.
      'src/orgunits/sitemap.ts',
      'src/orgunits/orchestrator/constants.ts',
      'src/orgunits/orchestrator/clock.ts',
      'src/orgunits/orchestrator/anchors.ts',
      'src/orgunits/orchestrator/circuitBreaker.ts',
      'src/orgunits/orchestrator/frontier.ts',
      'src/orgunits/orchestrator/pageCollection.ts',
      'src/orgunits/orchestrator/candidates.ts',
      'src/orgunits/orchestrator/run.ts',
      'src/orgunits/orchestrator/rootRunner.ts',
      'src/orgunits/orchestrator/orchestrate.ts',
      // 2B-2b: deterministic classifier handoff assembly - pure dedupe,
      // document construction, ordering/overflow-splitting and canonical
      // hashing, plus the two narrow impure modules (database loading
      // through the `classifier` role only, and the run-completion check
      // that role cannot perform itself). NO prompt, NO provider, NO output
      // validation, NO classifier-table write - those remain 2B-2c.
      'src/orgunits/classify/constants.ts',
      'src/orgunits/classify/types.ts',
      'src/orgunits/classify/errors.ts',
      'src/orgunits/classify/runStatus.ts',
      'src/orgunits/classify/loaders.ts',
      'src/orgunits/classify/dedupe.ts',
      'src/orgunits/classify/document.ts',
      'src/orgunits/classify/canonical.ts',
      'src/orgunits/classify/ordering.ts',
      'src/orgunits/classify/assemble.ts',
    ]) {
      expect(exists(path), `${path} is an approved module but is missing`).toBe(true);
    }
    for (const path of [
      // Neither existed before, and neither exists now: 2B-1e placed sitemap
      // discovery and frontier logic at src/orgunits/sitemap.ts and
      // src/orgunits/orchestrator/frontier.ts instead - a deliberate naming
      // decision (frontier logic sits beside the rest of the orchestrator,
      // not inside src/orgunits/web/), so these EXACT paths remain refused.
      'src/orgunits/web/sitemap.ts',
      'src/orgunits/web/frontier.ts',
      // Candidate PERSISTENCE (a deterministic rank, never a verdict) lives
      // in orchestrator/candidates.ts instead - see ADR 0007 s9 and the
      // 2B-1e ADR's schema-mapping note. `src/orgunits/classify/` (above)
      // is the approved home for handoff assembly; this sibling name stays
      // refused so a second, competing namespace cannot appear beside it.
      'src/orgunits/candidates',
      // Only fr/en ship. No placeholder for an unmeasured language.
      'src/orgunits/signals/packs/de.ts',
      'src/orgunits/signals/packs/nl.ts',
      'src/orgunits/signals/packs/es.ts',
      'src/orgunits/signals/packs/it.ts',
    ]) {
      expect(exists(path), `${path} exists but belongs to a later slice`).toBe(false);
    }
  });

  it('permits at most ONE Phase 2B network module, at the declared path', () => {
    // Binding now that src/orgunits exists. Only the declared gateway may reach
    // a socket or a fetch; a second network location under src/orgunits is
    // refused here rather than discovered later.
    expect(PHASE_2B_FILES.length, 'the Phase 2B namespace is empty').toBeGreaterThan(1);
    for (const file of PHASE_2B_FILES) {
      if (file === PHASE_2B_NETWORK_MODULE) continue;
      const source = read(file);
      expect(source, `${file} calls fetch outside ${PHASE_2B_NETWORK_MODULE}`).not.toMatch(
        /\bfetch\s*\(/,
      );
      expect(source, `${file} imports a network module`).not.toMatch(
        /from\s+['"]node:(net|tls|http|https|dns)['"]/,
      );
    }
  });

  it('issues no non-GET request from Phase 2B code', () => {
    // Research READS. A write verb aimed at someone else's site is not
    // research, and would be the first outbound capability in this repository.
    for (const file of PHASE_2B_FILES) {
      const source = read(file);
      expect(source, `${file} issues a non-GET HTTP method`).not.toMatch(
        /method\s*:\s*['"](POST|PUT|PATCH|DELETE)['"]/i,
      );
    }
  });

  it('never disables TLS verification, per request or globally', () => {
    // A certificate check turned off for one awkward host is a certificate
    // check turned off. The gateway states the option EXPLICITLY as true, so
    // relaxing it would be a visible edit rather than a missing line.
    for (const file of SOURCE_FILES) {
      const source = read(file);
      expect(source, `${file} disables certificate validation`).not.toMatch(
        /rejectUnauthorized\s*:\s*false/,
      );
      expect(source, `${file} disables TLS globally`).not.toContain('NODE_TLS_REJECT_UNAUTHORIZED');
      expect(source, `${file} overrides certificate identity checking`).not.toMatch(
        /checkServerIdentity\s*:/,
      );
    }
    expect(read(PHASE_2B_NETWORK_MODULE), 'the gateway does not assert TLS verification').toMatch(
      /rejectUnauthorized:\s*(true|plan\.rejectUnauthorized)/,
    );
  });

  it('adds no proxy indirection that could resolve the hostname again', () => {
    // node:http and node:https read no proxy configuration, which is a large
    // part of why the gateway uses the core client: the pinned address IS the
    // address the socket connects to. Reading a proxy variable, or installing
    // an agent that does, would put a resolver back between the check and the
    // connection.
    for (const file of PHASE_2B_FILES) {
      const source = code(file);
      for (const variable of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY']) {
        expect(source, `${file} reads ${variable}`).not.toContain(variable);
      }
      expect(source, `${file} installs a proxy agent`).not.toMatch(/ProxyAgent/);
      expect(source, `${file} overrides the global dispatcher`).not.toMatch(
        /setGlobalDispatcher|globalAgent\s*=/,
      );
    }
  });

  it('follows no redirect and retries nothing inside the gateway', () => {
    // One invocation is one HTTP attempt. A redirect followed here is a request
    // to a host no check in the file ever saw, and a hidden retry makes every
    // count in the evidence wrong.
    const gateway = code(PHASE_2B_NETWORK_MODULE);
    expect(gateway, 'the gateway delegates redirects to the runtime').not.toMatch(
      /redirect\s*:\s*['"](follow|error)['"]/,
    );
    expect(gateway, 'the gateway retries internally').not.toMatch(
      /\b(retry|retries|backoff|pRetry)\b/i,
    );
    for (const file of PHASE_2B_FILES) {
      expect(code(file), `${file} walks a frontier`).not.toMatch(
        /\b(crawl|walkLinks|followRedirect|enqueueUrl)\s*\(/i,
      );
    }
  });

  it('persists no response body anywhere in Phase 2B code', () => {
    // The bytes are a SHA-256 and a length. A body written to a column, a
    // temporary file or a cache directory would be the schema's one refusal
    // undone in application code.
    //
    // ONE deliberate, reviewed exemption (Phase 2B-2C2, ADR 0009):
    // runtimeIsolation.ts creates and removes EMPTY per-invocation temp
    // directories under the OS temp location - the classifier runtime's
    // isolated CLAUDE_CONFIG_DIR and scratch cwd. It never touches a
    // response body (none exists anywhere in the classifier layer), and the
    // stricter assertion below proves it writes no file CONTENT at all:
    // directory creation only, never a byte.
    const EMPTY_DIR_ISOLATION_FILE = 'src/orgunits/classify/provider/runtimeIsolation.ts';
    for (const file of PHASE_2B_FILES) {
      const source = code(file);
      if (file === EMPTY_DIR_ISOLATION_FILE) {
        expect(source, `${file} writes file content`).not.toMatch(
          /writeFile|createWriteStream|appendFile|copyFile/,
        );
        continue;
      }
      expect(source, `${file} writes a body to disk`).not.toMatch(
        /writeFile|createWriteStream|mkdtemp|tmpdir/,
      );
      expect(source, `${file} inserts a body column`).not.toMatch(
        /INSERT[^;]*\b(raw_html|page_html|response_body|raw_body)\b/i,
      );
    }
  });

  it('parses no HTML with a DOM API, and confines the literal sitemap.xml path to the approved sitemap module', () => {
    // ADR 0004 s15/s22: extract.ts reads HTML with regular expressions over
    // decoded text, deliberately never a DOM. No Phase 2B file may import one.
    // 2B-1e's sitemap.ts is the ONE deliberately, reviewedly widened
    // exception to "no file may name a sitemap" - it exists specifically to
    // read one, through the same gateway boundary as everything else.
    const sitemapPathApproved = new Set(['src/orgunits/sitemap.ts']);
    for (const file of PHASE_2B_FILES) {
      const source = read(file);
      expect(source, `${file} parses HTML with a DOM API`).not.toMatch(
        /\b(parseHTML|innerHTML|querySelectorAll|JSDOM|DOMParser)\b/,
      );
      if (sitemapPathApproved.has(file)) continue;
      expect(source, `${file} requests a sitemap`).not.toContain('sitemap.xml');
    }
  });

  it('confines "robots.txt" to the files ADR 0006/2B-1e approved to name it', () => {
    // Every OTHER Phase 2B file - the gateway's request-scope machinery,
    // charset resolution, extraction, redaction, page-evidence persistence -
    // has no business naming the policy resource at all: doing so would mean
    // it was reaching for a bypass rather than going through robots.ts.
    // sitemap.ts is added in 2B-1e, deliberately: it legitimately reads the
    // `Sitemap:` directives robots.txt itself publishes (discovery metadata
    // only - never an access-control rule, see robotsPolicy.ts).
    const approved = new Set([
      'src/orgunits/web/robots.ts',
      'src/orgunits/web/robotsPolicy.ts',
      'src/orgunits/web/robotsAuthority.ts',
      PHASE_2B_NETWORK_MODULE, // gateway.ts's own docs explain the scoping mechanism
      'src/orgunits/sitemap.ts',
    ]);
    for (const file of PHASE_2B_FILES) {
      if (approved.has(file)) continue;
      expect(read(file), `${file} names robots.txt`).not.toContain('robots.txt');
    }
  });

  it('refuses ANY explicit port, read from the RAW input rather than the parser', () => {
    // The frozen contract is "an explicit port is refused before DNS". The
    // WHATWG parser ERASES :443 and :80, so a check written against url.port
    // alone can never fire for exactly the two ports it is the sole defence
    // against. The rule has to be read from what the caller wrote.
    const url = read('src/orgunits/web/url.ts');
    expect(url, 'the port gate does not read the raw authority').toMatch(/rawAuthority\s*\(/);
    expect(url, 'the port gate does not exist').toMatch(/hasExplicitPort\s*\(/);
    expect(url, 'a non-default-only port rule survived').not.toContain('non_default_port');
  });

  it('keeps the service-subdomain gate in the boundary, ahead of any socket', () => {
    // ADR 0004 s3: same registrable domain is NECESSARY but NOT SUFFICIENT.
    // This is a NETWORK-SCOPE guard - it decides whether a socket may exist -
    // and not a ranking preference, which is why it lives here and not in a
    // future scorer.
    expect(
      exists('src/orgunits/web/hostPolicy.ts'),
      'the service-subdomain policy is missing',
    ).toBe(true);
    const gateway = code(PHASE_2B_NETWORK_MODULE);
    expect(gateway, 'the gateway does not consult the host policy').toMatch(
      /checkHostAdmissible\s*\(/,
    );

    // Refused BEFORE the DNS lookup, proved by ORDER in the file rather than by
    // reading the comments: the host gate must appear ahead of the resolve call.
    const gateIndex = gateway.indexOf('checkHostAdmissible(');
    const resolveIndex = gateway.indexOf('transport.resolveHostname(');
    expect(gateIndex).toBeGreaterThan(-1);
    expect(resolveIndex).toBeGreaterThan(-1);
    expect(gateIndex, 'the host gate runs after DNS').toBeLessThan(resolveIndex);

    // Country-blind (ADR 0004 s12): the policy encodes PRODUCT and PROTOCOL
    // names, never a language pack, a country or a market.
    const policy = code('src/orgunits/web/hostPolicy.ts');
    for (const banned of ['country', 'locale', 'market', 'targetLanguage', 'langPack']) {
      expect(policy, `the host policy names ${banned}`).not.toMatch(
        new RegExp(`\\b${banned}\\b`, 'i'),
      );
    }
  });

  it('matches service hosts by LABEL and never by substring', () => {
    // A substring rule would refuse `international-mail.example.edu`, which is
    // a real unit host. The policy must therefore split on labels.
    const policy = code('src/orgunits/web/hostPolicy.ts');
    expect(policy, 'the host policy does not split labels').toContain(".split('.')");
    expect(policy, 'the host policy tests raw substrings of the hostname').not.toMatch(
      /hostname\.includes\s*\(/,
    );
  });

  it('lets NO caller manufacture a site-policy verdict', () => {
    // The defect this replaces: `robotsDecision: 'ALLOWED'` as an ordinary
    // field let application code write an authoritative-looking provenance
    // that nothing had derived.
    expect(exists('src/orgunits/web/robotsAuthority.ts')).toBe(true);
    const gateway = code(PHASE_2B_NETWORK_MODULE);

    // The gateway takes a CAPABILITY, and checks the brand rather than trusting
    // the type annotation.
    expect(gateway, 'the gateway takes a bare robots decision again').not.toMatch(
      /robotsDecision\s*[:?]\s*(RobotsDecision|string)/,
    );
    expect(gateway, 'the gateway does not verify the authorisation').toMatch(
      /RobotsAuthorisation\.isAuthorisation\s*\(/,
    );

    // No production file may construct one. The constructor also refuses to run
    // outside vitest, so this is a second guard and not the only one.
    const authority = read('src/orgunits/web/robotsAuthority.ts');
    expect(authority, 'the test seam lost its runtime guard').toContain("process.env['VITEST']");
    // Every production file EXCEPT the one that declares the seam. The
    // declaration is the point; a CALL from anywhere else is the defect.
    for (const file of PRODUCTION_FILES) {
      if (file === 'src/orgunits/web/robotsAuthority.ts') continue;
      expect(code(file), `${file} constructs a robots authorisation`).not.toContain('forTestsOnly');
    }
  });

  it('names EXACTLY ONE production caller of the gateway: robots.ts', () => {
    // 2B-1b's posture was NETWORK PRIMITIVE EXISTS, NO LIVE ORCHESTRATION
    // EXISTS, stated as an assertion so this transition would be a reviewed
    // edit rather than a discovery. This is that edit: `robots.ts` is the
    // ONE production module that calls `executeWebAttempt`, because it is the
    // one module that can construct a robots verdict from an ACTUAL policy
    // evaluation rather than from caller-supplied data. A second production
    // caller would mean a second place authorising live requests outside the
    // reviewed robots-then-page composition.
    const callers = PRODUCTION_FILES.filter(
      (file) => file !== PHASE_2B_NETWORK_MODULE && /\bexecuteWebAttempt\s*\(/.test(code(file)),
    );
    expect(callers.sort()).toEqual(['src/orgunits/web/robots.ts']);

    // And it constructs its authorities ONLY via the production factories -
    // never the test-only seam, which is separately asserted absent from
    // every production file above.
    const robots = code('src/orgunits/web/robots.ts');
    expect(robots, 'robots.ts does not construct a bootstrap authority').toMatch(
      /RobotsAuthorisation\.forRobotsTxtBootstrap\s*\(/,
    );
    expect(robots, 'robots.ts does not construct an evaluated-policy authority').toMatch(
      /RobotsAuthorisation\.forEvaluatedPolicy\s*\(/,
    );

    // No CLI command reaches the gateway, by any route - there is still no
    // CLI entry point for research acquisition in this repository.
    for (const file of PRODUCTION_FILES.filter((f) => f.startsWith('src/cli/'))) {
      expect(code(file), `${file} imports the orgunit gateway`).not.toContain('orgunits/web');
    }
  });

  it('the robots.txt bootstrap authority is exact-path scoped, structurally', () => {
    // s7: the ONLY production bypass of ordinary robots evaluation authorises
    // the exact robots.txt request for the exact host being evaluated, and
    // nothing else. Checked here as CODE (the validation exists and rejects a
    // mismatch) rather than trusted from the unit tests alone, because this is
    // exactly the kind of check a firewall exists to keep from regressing.
    const authority = code('src/orgunits/web/robotsAuthority.ts');
    expect(authority, 'forRobotsTxtBootstrap does not exist').toMatch(
      /static forRobotsTxtBootstrap\s*\(/,
    );
    expect(authority, 'the bootstrap does not check the path is exactly /robots.txt').toMatch(
      /pathname\s*!==\s*['"]\/robots\.txt['"]/,
    );
  });

  it('declares NO generic robots-bypass flag anywhere in Phase 2B code', () => {
    // The bootstrap above is the one, exact-path-scoped exception. Nothing
    // else may exist that skips, ignores or force-authorises a request.
    const banned = [
      'skipRobots',
      'ignoreRobots',
      'forceAllowed',
      'systemAuthorisation',
      'bypassRobots',
    ];
    for (const file of PHASE_2B_FILES) {
      const source = code(file);
      for (const name of banned) {
        expect(source, `${file} declares ${name}`).not.toContain(name);
      }
    }
  });

  it('keeps charset.ts, extract.ts, redact.ts, robotsPolicy.ts and pageEvidence.ts network-free', () => {
    // Only gateway.ts may own a socket (asserted elsewhere); this restates it
    // for exactly the five modules 2B-1c added, so the assertion names them
    // and does not rely solely on the whole-namespace sweep to catch a
    // regression in any one of them.
    for (const file of [
      'src/orgunits/web/charset.ts',
      'src/orgunits/web/extract.ts',
      'src/orgunits/web/redact.ts',
      'src/orgunits/web/robotsPolicy.ts',
      'src/orgunits/web/pageEvidence.ts',
    ]) {
      const source = code(file);
      expect(source, `${file} calls fetch`).not.toMatch(/\bfetch\s*\(/);
      expect(source, `${file} imports a network module`).not.toMatch(
        /from\s+['"]node:(net|tls|http|https|dns)['"]/,
      );
    }
  });

  it('never persists a mailto: or tel: TARGET anywhere in Phase 2B code', () => {
    // redact.ts is the ONE file allowed to name these schemes - it exists
    // specifically to turn a mailto/tel target into [EMAIL]/[PHONE] rather
    // than storing it. Any other Phase 2B file naming one is either about to
    // persist a contact target or has grown an anchor/link feature this slice
    // does not build.
    for (const file of PHASE_2B_FILES) {
      if (file === 'src/orgunits/web/redact.ts') continue;
      const source = code(file);
      expect(source, `${file} names the mailto: scheme`).not.toMatch(/mailto:/i);
      expect(source, `${file} names the tel: scheme`).not.toMatch(/['"]tel:/i);
    }
  });

  it('every fetch observation an ordinary page attempt WOULD generate goes through this one gateway call', () => {
    // robots.ts issues at most one page-fetch call per authorised page, and it
    // is always executeWebAttempt - never a second, home-grown HTTP path.
    const robots = code('src/orgunits/web/robots.ts');
    const calls = robots.match(/executeWebAttempt\s*\(/g) ?? [];
    // Two call SITES are expected in source (the robots.txt bootstrap fetch,
    // and the ordinary-page fetch) - not two REQUESTS per invocation, which
    // the request-count integration tests prove separately.
    expect(calls.length).toBe(2);
  });

  it('persists no credential from a redirect Location', () => {
    // orgunit_redirect_observations is append-only and nwf_research holds no
    // DELETE, so a credential written there could never be removed afterwards.
    const redirect = code('src/orgunits/web/redirect.ts');
    expect(redirect, 'a credential-bearing target is not redacted').toContain('REDACTED_USERINFO');
    expect(redirect, 'the redaction is not derived from the parsed target').toMatch(
      /username\s*!==\s*''/,
    );
  });

  it('implements the frozen timeout policy, with two DISTINCT ceilings', () => {
    // ADR 0004 s3 had both the latency distribution and the 12 dead-host
    // connect timeouts in front of it and still chose a long connect timeout,
    // so failures are classified honestly rather than aggressively. Equal
    // timers would make READ_TIMEOUT unreachable.
    const policy = read('src/orgunits/web/policy.ts');
    const connect = /CONNECT_TIMEOUT_MS\s*=\s*([0-9_]+)/.exec(policy);
    const total = /TOTAL_TIMEOUT_MS\s*=\s*([0-9_]+)/.exec(policy);
    const connectMs = Number(connect![1]!.replace(/_/g, ''));
    const totalMs = Number(total![1]!.replace(/_/g, ''));
    expect(connectMs, 'the connect timeout fell below the frozen baseline').toBeGreaterThanOrEqual(
      30_000,
    );
    expect(totalMs, 'the total timeout leaves no room to read a response').toBeGreaterThan(
      connectMs,
    );
  });

  it('names the single permitted network location in ADR 0004', () => {
    // The allow-list above is only meaningful if the destination is documented
    // where a reviewer of the next slice will read it.
    const adr = read('docs/adr/0004-bounded-first-party-web-acquisition.md');
    expect(adr).toContain(PHASE_2B_NETWORK_MODULE);
  });
});

describe('PHASE-2B-FIREWALL: the deterministic signal layer is PURE, and produces no verdict', () => {
  const SIGNALS_FILES = PHASE_2B_FILES.filter((file) => file.startsWith('src/orgunits/signals/'));

  it('populates the signals namespace', () => {
    expect(SIGNALS_FILES.length, 'src/orgunits/signals is empty').toBeGreaterThan(0);
  });

  it('opens no database connection and imports no database helper', () => {
    // Scoring a URL or a page's own evidence never needs a row. A signals
    // file that imports `pg` or this repository's own db helpers would be
    // reaching for state this layer has no business holding.
    for (const file of SIGNALS_FILES) {
      const source = code(file);
      expect(source, `${file} imports pg`).not.toMatch(/from\s+['"]pg['"]/);
      expect(source, `${file} imports the db helper`).not.toMatch(/from\s+['"].*\/db\//);
      expect(source, `${file} names a Pool or a client`).not.toMatch(/\bnew\s+Pool\s*\(/);
    }
  });

  it('reads no environment variable', () => {
    for (const file of SIGNALS_FILES) {
      expect(code(file), `${file} reads process.env`).not.toContain('process.env');
    }
  });

  it('performs no filesystem IO', () => {
    for (const file of SIGNALS_FILES) {
      const source = code(file);
      expect(source, `${file} imports node:fs`).not.toMatch(/from\s+['"]node:fs/);
      expect(source, `${file} reads a file`).not.toMatch(/\breadFile(Sync)?\s*\(/);
      expect(source, `${file} writes a file`).not.toMatch(/\bwriteFile(Sync)?\s*\(/);
    }
  });

  it('calls no clock or random source, so the same input always scores the same', () => {
    // Determinism is the whole contract: the same input under the same rule
    // version must always return the same output.
    for (const file of SIGNALS_FILES) {
      const source = code(file);
      expect(source, `${file} calls Date.now`).not.toMatch(/Date\.now\s*\(/);
      expect(source, `${file} constructs a bare new Date()`).not.toMatch(/new Date\s*\(\s*\)/);
      expect(source, `${file} calls Math.random`).not.toMatch(/Math\.random\s*\(/);
    }
  });

  it('declares no relevance, verdict or contact-shaped property anywhere in the signal layer', () => {
    // A signal is a number with reviewable evidence, never a conclusion. See
    // ADR 0007 s9 and the migration-level equivalent of this check above.
    for (const file of SIGNALS_FILES) {
      const source = read(file);
      for (const banned of [
        'relevant',
        'isRelevant',
        'verified',
        'confirmed',
        'approved',
        'preferred',
        'qualified',
        'isUnit',
        'hasDistributionCapability',
      ]) {
        expect(source, `${file} declares the conclusion property ${banned}`).not.toMatch(
          new RegExp(`\\b${banned}\\s*[:?]`),
        );
      }
      expect(source, `${file} declares a mailbox property`).not.toMatch(
        /\b(email|mailbox|emailAddress)\s*[:?]/i,
      );
      expect(source, `${file} declares a telephone property`).not.toMatch(
        /\b(phone|telephone|phoneNumber)\s*[:?]/i,
      );
    }
  });

  it('never reads a country, locale or market inside the scoring core', () => {
    // ADR 0004 s12 / ADR 0007 s6: "French organisation -> French pack only" is
    // exactly the inference this layer must never make. Country/locale simply
    // never appears as a concept in the scoring core's own files.
    for (const file of [
      'src/orgunits/signals/types.ts',
      'src/orgunits/signals/score.ts',
      'src/orgunits/signals/tree.ts',
      'src/orgunits/signals/normalise.ts',
    ]) {
      const source = code(file);
      for (const banned of ['country', 'locale', 'market', 'targetLanguage', 'langPack']) {
        expect(source, `${file} names ${banned}`).not.toMatch(new RegExp(`\\b${banned}\\b`, 'i'));
      }
    }
  });

  it('ships exactly the approved universal/fr/en packs, and no per-organisation activation switch', () => {
    const packsDir = resolve(ROOT, 'src/orgunits/signals/packs');
    const packFiles = readdirSync(packsDir)
      .filter((f) => f.endsWith('.ts'))
      .sort();
    expect(packFiles).toEqual(['en.ts', 'fr.ts', 'universal.ts']);

    // score.ts must import all three unconditionally - never behind a branch
    // keyed on a per-organisation property.
    const scoreSource = code('src/orgunits/signals/score.ts');
    expect(scoreSource).toMatch(/from\s+['"]\.\/packs\/universal\.js['"]/);
    expect(scoreSource).toMatch(/from\s+['"]\.\/packs\/fr\.js['"]/);
    expect(scoreSource).toMatch(/from\s+['"]\.\/packs\/en\.js['"]/);
  });

  it('declares no AI, Apollo or outbound reference in the signal layer', () => {
    for (const file of SIGNALS_FILES) {
      const source = code(file);
      expect(source.toLowerCase(), `${file} names anthropic`).not.toContain('anthropic');
      expect(source.toLowerCase(), `${file} names apollo`).not.toContain('apollo');
      expect(source, `${file} names mailto:`).not.toMatch(/mailto:/i);
      expect(source, `${file} names tel:`).not.toMatch(/['"]tel:/i);
    }
  });
});

describe('PHASE-2B-FIREWALL: the approved namespace, and the forbidden ones', () => {
  it('creates no generic research, crawl, scrape or enrichment namespace', () => {
    // src/orgunits is the approved name because it says what the work IS -
    // finding organisational units. A generic name invites generic scope.
    const forbiddenDirs = [
      'src/research',
      'src/crawl',
      'src/scrape',
      'src/enrich',
      'src/contacts',
      'src/partnerResearch',
      'src/partner_research',
      'src/spider',
      'src/fetcher',
      'src/harvest',
      'src/qualify',
      'src/compliance',
      'src/templates',
      'src/outreach',
      'src/suppression',
      'src/apollo',
      'src/resolve',
      'src/entity',
      'src/matching',
      'src/scoring',
      'src/workers',
      'src/queue',
      'src/website/fetch',
      'src/website/crawl',
      'src/website/verify',
    ];
    for (const dir of forbiddenDirs) {
      expect(exists(dir), `${dir} exists but its phase is not approved`).toBe(false);
    }
  });
});

describe('PHASE-2B-FIREWALL: no raw response body is ever persisted', () => {
  it('declares no raw-body column in any migration', () => {
    // The point of hashing the bytes and capping the extracted text is that the
    // markup never lands in this database. A column named for the body - under
    // any of its usual names - defeats that in one line.
    const forbidden = [
      'raw_html',
      'raw_body',
      'response_body',
      'html_body',
      'page_html',
      'full_html',
      'body_html',
      'content_html',
      'raw_response',
      'raw_markup',
      'page_source',
      'html_source',
      'html_content',
      'response_text',
      'raw_content',
      'page_body',
      'document_html',
    ];
    for (const { file, sql } of MIGRATIONS) {
      const columns = declaredColumns(sql);
      for (const name of forbidden) {
        expect(columns, `${file} declares the raw-body column ${name}`).not.toContain(name);
      }
    }
  });

  it('caps the one text column that could otherwise become a body', () => {
    // main_text is derived text, and the CHECK is what keeps it derived text.
    // Without a ceiling it is a response body wearing a different name.
    expect(MIGRATION_0007).toBeDefined();
    const sql = MIGRATION_0007?.sql ?? '';
    expect(sql).toMatch(/orgunit_page_evidence_main_text_cap_chk[\s\S]*?length\(main_text\)\s*<=/);
    expect(sql).toMatch(/orgunit_page_evidence_main_text_chars_chk/);
  });

  it('keeps the response represented only by a hash and a length', () => {
    const sql = MIGRATION_0007?.sql ?? '';
    const columns = declaredColumns(sql);
    expect(columns).toContain('response_sha256');
    expect(columns).toContain('byte_count');
    expect(sql).toMatch(/orgunit_fetch_observations_sha256_chk/);
  });
});

describe('PHASE-2B-FIREWALL: no contact data, in schema or in code', () => {
  it('declares no contact-shaped column in any migration', () => {
    for (const { file, sql } of MIGRATIONS) {
      const columns = declaredColumns(sql);
      for (const name of columns) {
        expect(
          /(^|_)(email|mailbox|phone|telephone|mobile|fax|linkedin|twitter|facebook|instagram)(_|$)/.test(
            name,
          ),
          `${file} declares the contact column ${name}`,
        ).toBe(false);
        expect(
          /(^|_)(first_name|last_name|given_name|family_name|full_name|job_title|person)(_|$)/.test(
            name,
          ),
          `${file} declares the person column ${name}`,
        ).toBe(false);
      }
    }
  });

  it('creates no contact, person, staff or lead table in any migration', () => {
    for (const { file, sql } of MIGRATIONS) {
      expect(sql, `${file} creates a contact-bearing table`).not.toMatch(
        /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?\w*(contact|person|people|staff|lead|prospect)\w*/i,
      );
    }
  });

  it('names the operator by an opaque key, never by a free-form identity field', () => {
    // The audit field on a root decision is the single place in this schema
    // where person data would plausibly be typed by a well-meaning operator.
    // It is an OPAQUE KEY constrained to a slug - no at-sign, no dot, no space
    // - so it cannot be a mailbox, a domain handle or a natural-language name.
    // A free-form `decided_by`/`approved_by` column would have invited all of
    // those, which is why those names are refused outright.
    const sql = MIGRATION_0007?.sql ?? '';
    const columns = declaredColumns(sql);
    expect(columns).toContain('actor_key');
    for (const freeForm of ['decided_by', 'approved_by', 'revoked_by', 'operator_name']) {
      expect(columns, `0007 declares the free-form identity column ${freeForm}`).not.toContain(
        freeForm,
      );
    }
    expect(sql).toMatch(/orgunit_root_promotions_actor_key_chk/);
    expect(sql).toMatch(/orgunit_root_promotion_revocations_actor_key_chk/);
    // The slug pattern itself, so relaxing it is a visible edit.
    expect(sql).toMatch(/actor_key ~ '\^\[a-z0-9\]\[a-z0-9_-\]\{2,63\}\$'/);
  });

  it('defines no contact-shaped property in Phase 2B code', () => {
    for (const file of PHASE_2B_FILES) {
      const source = read(file);
      expect(source, `${file} declares a mailbox property`).not.toMatch(
        /\b(email|mailbox|emailAddress|contactEmail|adminEmail)\s*[:?]/i,
      );
      expect(source, `${file} declares a telephone property`).not.toMatch(
        /\b(phone|telephone|phoneNumber|mobile)\s*[:?]/i,
      );
    }
  });
});

describe('PHASE-2B-FIREWALL: a rank never becomes a relevance or outreach fact', () => {
  it('declares no relevance, verdict or approval column in any Phase 2B-1 migration', () => {
    // These are CONCLUSIONS. The DETERMINISTIC layer (migrations 0001-0008)
    // ranks; it does not decide. A column here would let a lexical rule's
    // output be read as an answer.
    //
    // ONE DELIBERATE, REVIEWED EXCEPTION: migration 0009 (Phase 2B-2) adds
    // `unit_type` to orgunit_page_classifications. This is not the discipline
    // being relaxed - Phase 2B-2's entire job, approved as a SEPARATE phase
    // from the deterministic layer, is to store a model's semantic reading.
    // The column is walled off from the deterministic tables by its own
    // least-privilege role (nwf_classifier), its own table (never
    // orgunit_page_candidates - see 'a candidate is a rank and cannot become
    // a verdict' below, still fully binding on 0001-0008), and its own
    // comment declaring the row INFERENCE, never fact. The next test confines
    // the exception to exactly that migration and that table.
    const forbidden = [
      'relevant',
      'is_relevant',
      'confirmed',
      'confirmed_unit',
      'verified',
      'is_verified',
      'verified_unit',
      'preferred',
      'preferred_unit',
      'preferred_website',
      'approved_unit',
      'canonical_website',
      'official_website',
      'classification',
      'classification_status',
      'classified',
      'unit_type',
      'decision_status',
    ];
    const CLASSIFIER_MIGRATION = '0009_orgunit_classifier_foundation.sql';
    const CLASSIFIER_EXCEPTIONS = new Set(['unit_type']);
    for (const { file, sql } of MIGRATIONS) {
      const columns = declaredColumns(sql);
      for (const name of forbidden) {
        if (file === CLASSIFIER_MIGRATION && CLASSIFIER_EXCEPTIONS.has(name)) continue;
        expect(columns, `${file} declares the conclusion column ${name}`).not.toContain(name);
      }
    }
  });

  it('confines the classifier conclusion column to exactly the approved migration and table', () => {
    // The exception above must never silently widen: unit_type may exist
    // ONLY in 0009's orgunit_page_classifications - never in any Phase 2B-1
    // migration, and never on orgunit_page_candidates, the deterministic rank
    // table the exception must not leak into.
    const CLASSIFIER_MIGRATION = '0009_orgunit_classifier_foundation.sql';
    for (const { file, sql } of MIGRATIONS) {
      if (file === CLASSIFIER_MIGRATION) continue;
      expect(declaredColumns(sql), `${file} declares unit_type`).not.toContain('unit_type');
    }
    const sql0009 = MIGRATIONS.find((m) => m.file === CLASSIFIER_MIGRATION)?.sql ?? '';
    expect(sql0009).toMatch(/CREATE TABLE orgunit_page_classifications[\s\S]*?unit_type\s+text/);
    const candidatesTable = /CREATE TABLE orgunit_page_candidates \(([\s\S]*?)\n\);/.exec(
      MIGRATION_0007?.sql ?? '',
    );
    expect(declaredColumns(candidatesTable?.[1] ?? '')).not.toContain('unit_type');
    // The migration's own comment says the column is inference, not fact.
    expect(sql0009).toMatch(/THIS ROW IS INFERENCE/);
  });

  it('declares no outreach, compliance or eligibility column in any migration', () => {
    // This repository cannot send anything, and no column may imply it could.
    const forbidden = [
      'contactable',
      'sendable',
      'outreach_allowed',
      'outreach_eligible',
      'outreach_status',
      'compliance_passed',
      'compliance_status',
      'sequence_state',
      'sequence_status',
      'suppressed',
      'opted_out',
      'do_not_contact',
    ];
    for (const { file, sql } of MIGRATIONS) {
      const columns = declaredColumns(sql);
      for (const name of forbidden) {
        expect(columns, `${file} declares the outreach column ${name}`).not.toContain(name);
      }
    }
  });

  it('gives the candidate table no mutable lifecycle status of any kind', () => {
    // Not merely "no status column": no column whose name is a lifecycle. A
    // candidate is superseded by a newer run or rule version, never restamped.
    const sql = MIGRATION_0007?.sql ?? '';
    const table = /CREATE TABLE orgunit_page_candidates \(([\s\S]*?)\n\);/.exec(sql);
    expect(table?.[1], 'the candidate table was not found').toBeDefined();
    const columns = declaredColumns(table?.[1] ?? '');
    expect(columns.length).toBeGreaterThan(0);
    for (const name of columns) {
      expect(
        /(^|_)(status|state|stage|lifecycle|reviewed|approved)(_|$)/.test(name),
        `orgunit_page_candidates declares the lifecycle column ${name}`,
      ).toBe(false);
    }
  });

  it('keeps the candidate score separate from any frontier score', () => {
    // Frontier ranking and candidate ranking are different claims. URL-tree
    // inheritance may raise the first; it must never manufacture the second.
    const sql = MIGRATION_0007?.sql ?? '';
    const columns = declaredColumns(sql);
    expect(columns).toContain('candidate_score');
    expect(columns).not.toContain('frontier_score');
  });
});

describe('PHASE-2B-FIREWALL: research evidence is append-only and owns nothing else', () => {
  it('grants nwf_research SELECT and INSERT on the tables it observes', () => {
    const sql = MIGRATION_0007?.sql ?? '';
    for (const table of RESEARCH_EVIDENCE_TABLES) {
      expect(sql, `${table} has no append-only grant`).toMatch(
        new RegExp(`GRANT SELECT, INSERT ON ${table}\\s+TO nwf_research`),
      );
    }
  });

  it('SEPARATION OF POWERS: never grants nwf_research INSERT on root authority', () => {
    // THE ASSERTION THAT KEEPS THE AUTOMATED PROCESS FROM APPROVING ITSELF.
    // Research OBSERVES a cross-domain redirect; an OPERATOR decides. A run
    // that could insert an approval could grant itself any crawl root it liked
    // by first arranging to observe a redirect to it.
    for (const { file, grant } of RESEARCH_GRANTS) {
      if (!/\bINSERT\b/i.test(grant.privileges)) continue;
      for (const table of ROOT_AUTHORITY_TABLES) {
        expect(
          grant.target,
          `${file} grants nwf_research INSERT on root authority (${table})`,
        ).not.toMatch(new RegExp(`\\b${table}\\b`));
      }
    }
    // And the read grant it DOES need is present, so a run can still see which
    // roots are approved and which of those were revoked.
    const sql = MIGRATION_0007?.sql ?? '';
    for (const table of ROOT_AUTHORITY_TABLES) {
      expect(sql, `${table} is not readable by nwf_research`).toMatch(
        new RegExp(`GRANT SELECT ON ${table}\\s+TO nwf_research`),
      );
    }
  });

  it('lets no table cite a revocation as authority', () => {
    // Approval and revocation are separate tables precisely so this is a
    // schema property rather than a convention: a fetch's root_promotion_id
    // references the APPROVAL table, and nothing references revocations at all.
    const sql = MIGRATION_0007?.sql ?? '';
    expect(sql).toMatch(/REFERENCES orgunit_root_promotions \(id\)/);
    expect(sql, 'something references the revocation table as a foreign key').not.toMatch(
      /REFERENCES\s+orgunit_root_promotion_revocations/,
    );
    // A single event table with a decision column would have made this
    // impossible to state, so that shape is refused by name.
    expect(declaredColumns(sql), '0007 reintroduced a promotion decision enum').not.toContain(
      'decision',
    );
  });

  it('grants nwf_research no UPDATE, DELETE or TRUNCATE in any migration', () => {
    // The single assertion the whole append-only contract rests on. Parsed as
    // GRANT <privileges> ON <target> TO <roles> rather than scanned as text, so
    // a mutating verb cannot hide in a neighbouring comment and cannot slip
    // past in a statement that merely mentions the role.
    for (const { file, grant } of RESEARCH_GRANTS) {
      expect(
        grant.privileges,
        `${file} grants a mutating privilege to nwf_research: ${grant.privileges}`,
      ).not.toMatch(/\b(UPDATE|DELETE|TRUNCATE|ALL)\b/i);
    }
  });

  it('grants nwf_research no write on any Phase 1 truth table', () => {
    const truthTables = [
      'organisations',
      'organisation_sources',
      'ingest_runs',
      'website_claims',
      'website_source_snapshots',
      'ewp_snapshots',
      'ewp_heis',
      'ewp_hei_other_ids',
      'ewp_hosts',
      'ewp_host_covered_heis',
      'ewp_api_declarations',
    ];
    for (const { file, grant } of RESEARCH_GRANTS) {
      if (!/\bINSERT\b/i.test(grant.privileges)) continue;
      for (const table of truthTables) {
        expect(
          grant.target,
          `${file} grants nwf_research a write on the truth table ${table}`,
        ).not.toMatch(new RegExp(`\\b${table}\\b`));
      }
    }
  });

  it('grants nwf_research read access to exactly the two source tables it needs', () => {
    // Research roots come from website_claims; organisations supplies the
    // nullable convenience link. Anything else readable here would be scope
    // this slice did not justify.
    const readable = new Set<string>();
    for (const { grant } of RESEARCH_GRANTS) {
      if (!/\bSELECT\b/i.test(grant.privileges)) continue;
      for (const table of grant.target.split(',').map((entry) => entry.trim())) {
        if (!table.startsWith('orgunit_')) readable.add(table);
      }
    }
    expect([...readable].sort()).toEqual(['organisations', 'website_claims']);
  });

  it('never grants nwf_research the database TEMPORARY privilege', () => {
    // Migration 0006 removed the inherited PUBLIC grant. A new role must not
    // quietly reintroduce it.
    //
    // Parsed, not scanned, and the first draft of this check proves why: a
    // text search for GRANT ... TEMPORARY ... nwf_research matched the COMMENT
    // in 0007 that explains the role has no TEMPORARY, because the prose says
    // "an UPDATE grant on organisations" a few lines earlier and nothing
    // between them is a semicolon. A firewall that fails on the documentation
    // of the boundary it protects is a firewall people learn to delete.
    for (const { file, grant } of RESEARCH_GRANTS) {
      expect(grant.privileges, `${file} grants TEMPORARY to nwf_research`).not.toMatch(
        /TEMPORARY/i,
      );
    }
  });

  it('writes nothing to a Phase 1 truth table from Phase 2B code', () => {
    for (const file of PHASE_2B_FILES) {
      const source = read(file);
      expect(source, `${file} writes organisations`).not.toMatch(
        /(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+organisations/i,
      );
      expect(source, `${file} writes organisation_sources`).not.toMatch(
        /(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+organisation_sources/i,
      );
      expect(source, `${file} writes website evidence`).not.toMatch(
        /(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+website_/i,
      );
      expect(source, `${file} writes an ewp_ table`).not.toMatch(
        /(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+ewp_/i,
      );
      expect(source, `${file} assigns canonical_domain`).not.toMatch(/canonical_domain\s*=(?!=)/);
    }
  });

  it('mutates no existing table and back-fills nothing in migration 0007', () => {
    const sql = MIGRATION_0007?.sql ?? '';
    // The one ALTER TABLE in 0007 closes a foreign-key cycle on a table 0007
    // itself created. Nothing older is touched.
    const alters = [...sql.matchAll(/ALTER\s+TABLE\s+(\w+)/gi)].map((m) => m[1]);
    expect(alters).toEqual(['orgunit_fetch_observations']);
    expect(sql).not.toMatch(/^\s*UPDATE\s+\w+\s+SET/im);
    expect(sql).not.toMatch(/^\s*INSERT\s+INTO\s+\w+/im);
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
  });

  it('keeps a retry a separate observation rather than a collision', () => {
    // A fetch identity that omits attempt_no would make the second attempt at a
    // URL conflict with the first, silently discarding the transient network
    // failure this append-only layer exists to preserve.
    const sql = MIGRATION_0007?.sql ?? '';
    expect(declaredColumns(sql)).toContain('attempt_no');
    const identity = /CREATE UNIQUE INDEX orgunit_fetch_observations_dedupe_uidx[\s\S]*?;/.exec(
      sql,
    );
    expect(identity?.[0], 'the fetch identity index was not found').toBeDefined();
    expect(identity?.[0], 'fetch identity does not include attempt_no').toContain('attempt_no');
    expect(sql).toMatch(/orgunit_fetch_observations_attempt_no_chk[\s\S]*?attempt_no >= 1/);
  });

  it('lets no downstream table carry provenance it could contradict', () => {
    // eche_row_key, organisation_id and the root columns live on the fetch
    // observation ONCE. A copy on page evidence or on a candidate would be a
    // second place that can disagree, and "the writer will copy it correctly"
    // is a hope about code that has not been written yet.
    const sql = MIGRATION_0007?.sql ?? '';
    for (const table of ['orgunit_page_evidence', 'orgunit_page_candidates']) {
      const block = new RegExp(`CREATE TABLE ${table} \\(([\\s\\S]*?)\\n\\);`).exec(sql);
      expect(block?.[1], `${table} was not found`).toBeDefined();
      const columns = declaredColumns(block?.[1] ?? '');
      expect(columns.length).toBeGreaterThan(0);
      for (const duplicated of [
        'eche_row_key',
        'organisation_id',
        'root_website_claim_id',
        'root_promotion_id',
      ]) {
        expect(columns, `${table} duplicates ${duplicated}`).not.toContain(duplicated);
      }
      // What it DOES carry is pinned to its parent by a composite foreign key.
      expect(columns).toContain('root_key');
      expect(sql, `${table} does not pin root_key`).toMatch(new RegExp(`${table}_root_fk`));
    }
    // And the value those keys pin is generated, so it cannot be forged.
    expect(sql).toMatch(/root_key\s+text\s*\n?\s*GENERATED ALWAYS AS/);
  });
});

describe('PHASE-2B-FIREWALL 2B-1E: the CLI is an entry point, not a network owner', () => {
  const CLI_FILES = PRODUCTION_FILES.filter((file) => file.startsWith('src/cli/'));
  const DISCOVER_CLI = 'src/cli/commands/discover.ts';

  it('adds exactly one new CLI command file, and it exists', () => {
    expect(exists(DISCOVER_CLI), 'the orgunits discover CLI command is missing').toBe(true);
  });

  it('opens no socket, resolves no hostname, and calls no fetch() from any CLI file', () => {
    for (const file of CLI_FILES) {
      const source = read(file);
      expect(source, `${file} imports a network module`).not.toMatch(
        /from\s+['"]node:(net|tls|http|https|dns)['"]/,
      );
      expect(source, `${file} calls fetch`).not.toMatch(/\bfetch\s*\(/);
    }
  });

  it('never imports orgunits/web directly - it reaches the network only through the orchestrator', () => {
    for (const file of CLI_FILES) {
      expect(code(file), `${file} imports the orgunit gateway`).not.toContain('orgunits/web');
    }
  });

  it('manufactures no robots authorisation and bypasses no budget or root-trust check', () => {
    const source = code(DISCOVER_CLI);
    expect(source, 'the CLI constructs a RobotsAuthorisation').not.toContain('RobotsAuthorisation');
    expect(source, 'the CLI calls executeWebAttempt directly').not.toContain('executeWebAttempt');
    for (const banned of ['skipRobots', 'ignoreRobots', 'forceAllowed', 'bypassRobots']) {
      expect(source, `the CLI declares ${banned}`).not.toContain(banned);
    }
  });

  it('has no --all/--crawl-everything/--scan-database scope escape, and requires an explicit --execute to touch the network', () => {
    // CODE, not prose: this checks for an actual declared flag/option, so it
    // must not trip on this very file's own documentation explaining that no
    // such flag exists.
    const source = code(DISCOVER_CLI);
    for (const banned of ['--all', 'crawlEverything', 'scanDatabase', 'allOrganisations']) {
      expect(source, `the CLI declares ${banned}`).not.toContain(banned);
    }
    expect(source, 'the CLI has no execute guard').toMatch(/execute/);
    const indexSource = code('src/cli/index.ts');
    expect(indexSource, 'index.ts declares a --all-shaped flag').not.toMatch(/'--?all'/);
  });

  it('uses the research database role, never admin/ingest, for orgunits discover', () => {
    const source = code(DISCOVER_CLI);
    expect(source, 'the CLI does not select the research pool role').toMatch(
      /withPool\(\s*['"]research['"]/,
    );
    expect(source, 'the CLI selects the admin role').not.toMatch(/withPool\(\s*['"]admin['"]/);
    expect(source, 'the CLI selects the ingest role').not.toMatch(/withPool\(\s*['"]ingest['"]/);
  });
});

describe('PHASE-2B-FIREWALL 2B-1E: sitemap discovery owns no socket and stays bounded', () => {
  const SITEMAP_FILE = 'src/orgunits/sitemap.ts';

  it('owns zero sockets and uses no generic HTTP client', () => {
    const source = code(SITEMAP_FILE);
    expect(source, 'sitemap.ts imports a network module').not.toMatch(
      /from\s+['"]node:(net|tls|http|https|dns)['"]/,
    );
    expect(source, 'sitemap.ts calls fetch').not.toMatch(/\bfetch\s*\(/);
    expect(source, 'sitemap.ts calls executeWebAttempt directly').not.toContain(
      'executeWebAttempt',
    );
  });

  it('never writes a file and never persists raw XML', () => {
    const source = code(SITEMAP_FILE);
    expect(source, 'sitemap.ts writes to disk').not.toMatch(
      /writeFile|createWriteStream|mkdtemp|tmpdir/,
    );
    expect(source, 'sitemap.ts issues an INSERT').not.toMatch(/INSERT\s+INTO/i);
  });

  it('declares the exact named, bounded sitemap limits', () => {
    const constants = read('src/orgunits/orchestrator/constants.ts');
    for (const name of [
      'MAX_SITEMAP_DOCUMENTS_PER_ROOT',
      'MAX_SITEMAP_DEPTH',
      'MAX_SITEMAP_URLS_PER_ROOT',
      'MAX_SITEMAP_DOCUMENT_BYTES',
    ]) {
      expect(constants, `constants.ts does not declare ${name}`).toContain(name);
    }
    const sitemap = code(SITEMAP_FILE);
    expect(sitemap, 'sitemap.ts does not import the document cap').toContain(
      'MAX_SITEMAP_DOCUMENTS_PER_ROOT',
    );
    expect(sitemap, 'sitemap.ts does not import the depth cap').toContain('MAX_SITEMAP_DEPTH');
    expect(sitemap, 'sitemap.ts does not import the URL cap').toContain(
      'MAX_SITEMAP_URLS_PER_ROOT',
    );
  });

  it('adds zero new runtime dependencies for XML parsing (reuses saxes)', () => {
    const source = code(SITEMAP_FILE);
    expect(source, 'sitemap.ts does not use saxes').toMatch(/from\s+['"]saxes['"]/);
  });
});

describe('PHASE-2B-FIREWALL 2B-1E: the orchestrator is explicitly bounded, and imports nothing forbidden', () => {
  const ORCHESTRATOR_FILES = PHASE_2B_FILES.filter((file) =>
    file.startsWith('src/orgunits/orchestrator/'),
  );

  it('populates the orchestrator namespace', () => {
    expect(ORCHESTRATOR_FILES.length, 'src/orgunits/orchestrator is empty').toBeGreaterThan(0);
  });

  it('declares every frozen/mechanical budget constant by name, once, in constants.ts', () => {
    const constants = read('src/orgunits/orchestrator/constants.ts');
    for (const [name, value] of [
      ['MAX_PAGE_ATTEMPTS_PER_ROOT', '35'],
      ['MAX_TOTAL_REQUESTS_PER_ROOT', '60'],
      ['MAX_HOSTS_PER_ROOT', '8'],
      ['TRACK_B_FLOOR', '8'],
    ] as const) {
      expect(constants, `constants.ts does not declare ${name}`).toMatch(
        new RegExp(`${name}\\s*=\\s*${value}\\b`),
      );
    }
  });

  it('imports no AI, Apollo, contact or outbound-shaped dependency', () => {
    for (const file of ORCHESTRATOR_FILES) {
      const source = code(file).toLowerCase();
      expect(source, `${file} names anthropic`).not.toContain('anthropic');
      expect(source, `${file} names apollo`).not.toContain('apollo');
      expect(source, `${file} names nodemailer`).not.toContain('nodemailer');
      expect(source, `${file} imports node-fetch/axios/got/undici`).not.toMatch(
        /from ['"](node-fetch|axios|got|undici)['"]/,
      );
    }
  });

  it('imports no search-engine client', () => {
    for (const file of ORCHESTRATOR_FILES) {
      const source = code(file).toLowerCase();
      for (const banned of ['googleapis', 'bing', 'serpapi', 'brave-search', 'duckduckgo']) {
        expect(source, `${file} names ${banned}`).not.toContain(banned);
      }
    }
  });

  it('imports no browser-automation or PDF-parsing dependency', () => {
    for (const file of ORCHESTRATOR_FILES) {
      const source = code(file).toLowerCase();
      for (const banned of ['playwright', 'puppeteer', 'pdf-parse', 'pdfjs']) {
        expect(source, `${file} names ${banned}`).not.toContain(banned);
      }
    }
  });
});

describe('PHASE-2B-FIREWALL: identity and locale boundaries hold', () => {
  it('declares organisation_id exactly once, and keeps it nullable', () => {
    // A NOT NULL foreign key would quietly assert that a web page proves two
    // provisional organisation records are one entity. They are not resolved.
    // Exactly one declaration, because a second copy is a second place that can
    // disagree with the first.
    const sql = MIGRATION_0007?.sql ?? '';
    const declarations = [...sql.matchAll(/^\s+organisation_id\s+uuid([^,\n]*)/gim)].map(
      (m) => m[1] ?? '',
    );
    expect(declarations).toHaveLength(1);
    expect(declarations[0], 'organisation_id is NOT NULL in 0007').not.toMatch(/NOT\s+NULL/i);
    expect(declarations[0]).toMatch(/REFERENCES\s+organisations/i);
  });

  it('anchors Phase 2B evidence on eche_row_key, exactly as website_claims does', () => {
    const sql = MIGRATION_0007?.sql ?? '';
    expect(declaredColumns(sql)).toContain('eche_row_key');
    // No foreign key onto an ewp_ table: an identifier match is a measurement,
    // never a resolution, and a Phase 2B row must not turn it into one.
    expect(sql).not.toMatch(/REFERENCES\s+ewp_/i);
  });

  it('encodes no country, language target or market assumption in migration 0007', () => {
    // The research sample so far has been French. That is a property of the
    // sample, not of the schema, and none of it may leak into these tables.
    const sql = MIGRATION_0007?.sql ?? '';
    const columns = declaredColumns(sql);
    for (const name of [
      'target_language',
      'learner_language',
      'partner_country',
      'country_code',
      'market',
      'locale',
      'language_community',
    ]) {
      expect(columns, `0007 declares the locale-assuming column ${name}`).not.toContain(name);
    }
    // The one language-shaped column is the DOCUMENT's own declaration.
    expect(columns).toContain('declared_lang');
    expect(sql).not.toMatch(/\bfr_esr\b/);
    expect(sql).not.toMatch(/enseignementsup-recherche/);
  });
});

describe('PHASE-2B-FIREWALL 2B-2B/2B-2C1: classifier handoff assembly and semantic core are bounded and network-free', () => {
  const CLASSIFY_FILES = PHASE_2B_FILES.filter((file) => file.startsWith('src/orgunits/classify/'));

  /**
   * The ONE file 2B-2C1 permits to issue a write statement. Every other
   * file under `src/orgunits/classify/` - the original 2B-2B assembly
   * files AND every new 2B-2C1 semantic-core file (prompt, output schema,
   * provider contract, scripted provider, retry helper, hash, evidence
   * verification, validation, orchestration) - must remain provably
   * write-free by source inspection, exactly as the whole namespace was
   * before this slice. `orchestrate.ts` calls `persist.ts`'s exported
   * functions; it contains no SQL of its own, so it stays in this list.
   */
  const CLASSIFY_PERSISTENCE_FILE = 'src/orgunits/classify/persist.ts';
  const CLASSIFY_READ_ONLY_FILES = CLASSIFY_FILES.filter(
    (file) => file !== CLASSIFY_PERSISTENCE_FILE,
  );

  it('populates the classify namespace', () => {
    expect(CLASSIFY_FILES.length, 'src/orgunits/classify is empty').toBeGreaterThan(0);
  });

  it('imports no AI, provider, Apollo, contact or outbound-shaped dependency', () => {
    // The Phase 2B-2C2 Claude Max provider boundary is the ONE deliberate
    // exception to the anthropic/API-key name bans, and it is excluded here
    // BY EXACT PATH PREFIX because it has its own, STRICTER block at the end
    // of this file (single SDK import site, forbidden-variable-name guard,
    // env allowlist, hermetic options) - the robots.ts/executeWebAttempt
    // precedent: one named boundary holds the capability, everything around
    // it stays pinned closed. Every OTHER ban below still applies to the
    // provider files via the loop that follows.
    for (const file of CLASSIFY_FILES) {
      const source = code(file).toLowerCase();
      if (!file.startsWith('src/orgunits/classify/provider/')) {
        expect(source, `${file} names anthropic`).not.toContain('anthropic');
        expect(source, `${file} names an anthropic-sdk-shaped import`).not.toMatch(/@anthropic-ai/);
        expect(source, `${file} references an API key`).not.toMatch(/api[_-]?key/);
      }
      expect(source, `${file} names openai`).not.toContain('openai');
      expect(source, `${file} names apollo`).not.toContain('apollo');
      expect(source, `${file} names nodemailer`).not.toContain('nodemailer');
      expect(source, `${file} imports node-fetch/axios/got/undici`).not.toMatch(
        /from ['"](node-fetch|axios|got|undici)['"]/,
      );
    }
  });

  it('imports no search-engine, browser-automation or PDF/OCR dependency', () => {
    for (const file of CLASSIFY_FILES) {
      const source = code(file).toLowerCase();
      for (const banned of [
        'googleapis',
        'bing',
        'serpapi',
        'brave-search',
        'duckduckgo',
        'playwright',
        'puppeteer',
        'pdf-parse',
        'pdfjs',
        'tesseract',
      ]) {
        expect(source, `${file} names ${banned}`).not.toContain(banned);
      }
    }
  });

  it('imports no network primitive and calls no gateway', () => {
    for (const file of CLASSIFY_FILES) {
      const source = code(file);
      expect(source, `${file} imports a network module`).not.toMatch(
        /from\s+['"]node:(net|tls|http|https|dns)['"]/,
      );
      expect(source, `${file} calls fetch`).not.toMatch(/\bfetch\s*\(/);
      expect(source, `${file} calls executeWebAttempt directly`).not.toContain('executeWebAttempt');
      expect(source, `${file} imports orgunits/web`).not.toMatch(/from\s+['"].*orgunits\/web\//);
    }
  });

  it('issues no write statement anywhere OUTSIDE persist.ts', () => {
    // 2B-2B built a payload in memory only. 2B-2C1 adds EXACTLY one
    // reviewed, deliberate write capability - persist.ts - mirroring the
    // gateway's own single-module socket-allowlist widening (ADR 0004 s18):
    // the test fails until someone edits it on purpose, and it is edited
    // here, for this one named file, and no other.
    for (const file of CLASSIFY_READ_ONLY_FILES) {
      const source = code(file);
      expect(source, `${file} issues an INSERT`).not.toMatch(/INSERT\s+INTO/i);
      expect(source, `${file} issues an UPDATE`).not.toMatch(/UPDATE\s+\w+\s+SET/i);
      expect(source, `${file} issues a DELETE`).not.toMatch(/DELETE\s+FROM/i);
      expect(source, `${file} issues a TRUNCATE`).not.toMatch(/TRUNCATE\b/i);
    }
  });

  it('never names a classifier-persistence table OUTSIDE persist.ts', () => {
    for (const file of CLASSIFY_READ_ONLY_FILES) {
      const source = code(file);
      for (const table of [
        'orgunit_classifier_calls',
        'orgunit_classifier_call_completions',
        'orgunit_page_classifications',
        'orgunit_classification_subjects',
      ]) {
        // Reading orgunit_research_run_completions or any classifier table
        // name in a SELECT is fine (runStatus.ts) - what must never appear
        // outside persist.ts is that name at all, now that a write
        // capability exists to pair it with.
        expect(source, `${file} names ${table}`).not.toContain(table);
      }
    }
  });

  it('declares no contact-shaped property and names no mailto:/tel: scheme', () => {
    for (const file of CLASSIFY_FILES) {
      const source = code(file);
      expect(source, `${file} declares a mailbox property`).not.toMatch(
        /\b(email|mailbox|emailAddress|contactEmail|adminEmail)\s*[:?]/i,
      );
      expect(source, `${file} declares a telephone property`).not.toMatch(
        /\b(phone|telephone|phoneNumber|mobile)\s*[:?]/i,
      );
      expect(source, `${file} names mailto:`).not.toMatch(/mailto:/i);
      expect(source, `${file} names tel:`).not.toMatch(/['"]tel:/i);
    }
  });

  it('the model-facing document/batch types carry no score, rank or weight field', () => {
    const types = code('src/orgunits/classify/types.ts');
    // Scoped to each model-facing interface's OWN body individually -
    // `RawEligibleCandidateRow` legitimately carries `candidateScore`/
    // `rankWithinRoot` for representative selection, and this test must
    // isolate exactly the interfaces the model itself receives rather than
    // scan a blob that could accidentally include a sibling type.
    for (const interfaceName of [
      'ClassifierSignal',
      'ClassifierRootRef',
      'ClassifierBatchContext',
      'ClassifierDocument',
      'ClassifierBatch',
    ]) {
      const match = new RegExp(`interface ${interfaceName} \\{([\\s\\S]*?)\\n\\}`).exec(types);
      expect(match, `could not locate interface ${interfaceName}`).not.toBeNull();
      const body = match![1]!;
      for (const forbidden of ['candidateScore', 'rankWithinRoot', 'weight', 'score', 'rank']) {
        expect(body, `${interfaceName} declares ${forbidden}`).not.toMatch(
          new RegExp(`\\b${forbidden}\\b`),
        );
      }
    }
  });
});

describe('PHASE-2B-FIREWALL 2B-2C1: semantic core is provider-neutral, and persistence is append-only INSERT into exactly its four tables', () => {
  const CLASSIFY_2B_2C1_FILES = [
    'src/orgunits/classify/prompt.ts',
    'src/orgunits/classify/outputSchema.ts',
    'src/orgunits/classify/providerContract.ts',
    'src/orgunits/classify/scriptedProvider.ts',
    'src/orgunits/classify/retry.ts',
    'src/orgunits/classify/finalIdentity.ts',
    'src/orgunits/classify/evidenceVerification.ts',
    'src/orgunits/classify/validate.ts',
    'src/orgunits/classify/persist.ts',
    'src/orgunits/classify/orchestrate.ts',
  ];
  const CLASSIFIER_TABLES = [
    'orgunit_classifier_calls',
    'orgunit_classifier_call_completions',
    'orgunit_page_classifications',
    'orgunit_classification_subjects',
  ];

  it('populates the 2B-2C1 semantic-core files, by exact name', () => {
    for (const file of CLASSIFY_2B_2C1_FILES) {
      expect(exists(file), `${file} is an approved 2B-2C1 module but is missing`).toBe(true);
    }
  });

  it('the Claude Max runtime adapter exists ONLY at the declared 2B-2C2 boundary', () => {
    // 2B-2C1 pinned these paths ABSENT ahead of time so that populating them
    // would be a reviewed, visible act. Phase 2B-2C2 (ADR 0009) IS that act:
    // this edit was made deliberately, in the same slice that adds the
    // stricter Max-only block at the end of this file. The boundary got
    // NARROWER, not looser: the provider may exist only as the named
    // subdirectory, a root-level provider file stays refused, and any
    // Messages-API-shaped provider stays refused everywhere.
    expect(
      exists('src/orgunits/classify/provider'),
      'the 2B-2C2 provider boundary is missing',
    ).toBe(true);
    for (const path of [
      'src/orgunits/classify/claudeMaxAgentProvider.ts',
      'src/orgunits/classify/anthropicProvider.ts',
      'src/orgunits/classify/provider/anthropicApiProvider.ts',
    ]) {
      expect(exists(path), `${path} exists but is not an approved module`).toBe(false);
    }
  });

  it('persist.ts issues ONLY INSERT, never UPDATE, DELETE or TRUNCATE', () => {
    const source = code('src/orgunits/classify/persist.ts');
    expect(source, 'persist.ts issues an UPDATE').not.toMatch(/UPDATE\s+\w+\s+SET/i);
    expect(source, 'persist.ts issues a DELETE').not.toMatch(/DELETE\s+FROM/i);
    expect(source, 'persist.ts issues a TRUNCATE').not.toMatch(/TRUNCATE\b/i);
    expect(source, 'persist.ts issues at least one INSERT').toMatch(/INSERT\s+INTO/i);
  });

  it('every INSERT in persist.ts targets one of the four classifier tables, never an upstream evidence table', () => {
    const source = code('src/orgunits/classify/persist.ts');
    const insertTargets = [...source.matchAll(/INSERT\s+INTO\s+([a-z_][a-z0-9_]*)/gi)].map(
      (m) => m[1]!,
    );
    expect(insertTargets.length).toBeGreaterThan(0);
    for (const table of insertTargets) {
      expect(CLASSIFIER_TABLES, `persist.ts INSERTs into ${table}`).toContain(table);
    }
    // And, restated the other way: every classifier table this file names
    // at all is named beside an INSERT, never a bare read with no grant to
    // back it - nwf_classifier holds SELECT on its own tables too (the
    // idempotency lookup and the reuse read), so this checks INSERT
    // presence specifically rather than exclusivity of mention.
    for (const table of CLASSIFIER_TABLES) {
      expect(source, `persist.ts never names ${table}`).toContain(table);
    }
  });

  it('imports no upstream-evidence write, and no orgunits/web/orgunits/orchestrator persistence helper', () => {
    for (const file of CLASSIFY_2B_2C1_FILES) {
      const source = code(file);
      expect(source, `${file} imports orgunits/web`).not.toMatch(/from\s+['"].*orgunits\/web\//);
      expect(source, `${file} imports orgunits/orchestrator/candidates`).not.toMatch(
        /from\s+['"].*orchestrator\/candidates/,
      );
      expect(source, `${file} imports orgunits/orchestrator/pageCollection`).not.toMatch(
        /from\s+['"].*orchestrator\/pageCollection/,
      );
    }
  });

  it('declares the provider-neutral ClassifierProvider contract and the scripted test provider, by exact name', () => {
    const contract = code('src/orgunits/classify/providerContract.ts');
    expect(contract).toMatch(/export\s+interface\s+ClassifierProvider\b/);
    expect(contract).toMatch(/export\s+interface\s+ClassifierProviderRequest\b/);
    expect(contract).toMatch(/export\s+interface\s+ClassifierProviderResult\b/);
    const scripted = code('src/orgunits/classify/scriptedProvider.ts');
    expect(scripted).toMatch(/export\s+class\s+ScriptedTestProvider\b/);
  });

  it('the provider contract exposes no credential, database, filesystem or MCP handle', () => {
    const contract = code('src/orgunits/classify/providerContract.ts');
    for (const forbidden of [
      'apikey',
      'oauth',
      'password',
      'secret',
      'pg.Pool',
      'fs.',
      'mcpServers',
    ]) {
      expect(contract.toLowerCase(), `providerContract.ts exposes ${forbidden}`).not.toContain(
        forbidden.toLowerCase(),
      );
    }
  });

  it('declares frozen, versioned prompt and output-schema constants', () => {
    const prompt = code('src/orgunits/classify/prompt.ts');
    expect(prompt).toContain("ORGUNIT_CLASSIFIER_PROMPT_VERSION = 'orgunit-classifier-prompt-v1'");
    const schema = code('src/orgunits/classify/outputSchema.ts');
    expect(schema).toContain(
      "ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION = 'orgunit-classifier-output-schema-v1'",
    );
  });

  it('migration 0010 widens error_kind with exactly the two Max-runtime failure kinds, and nothing else', () => {
    const migration0010 = MIGRATIONS.find((m) => m.file.startsWith('0010_'));
    expect(migration0010, 'migration 0010 does not exist').toBeDefined();
    const sql = migration0010!.sql;
    // SQL `--` line comments are prose, not statements - `code()` only
    // strips JS/TS comment syntax, so this file's own executable-SQL-only
    // view strips them itself rather than tripping on words like "grant"
    // appearing inside an explanatory sentence.
    const executableSql = sql.replace(/--.*$/gm, '');
    expect(executableSql).not.toMatch(/CREATE\s+TABLE/i);
    expect(executableSql).not.toMatch(/\bGRANT\b/i);
    expect(executableSql).not.toMatch(/\bREVOKE\b/i);
    expect(executableSql).not.toMatch(/ADD\s+COLUMN/i);
    expect(executableSql).not.toMatch(/DROP\s+COLUMN/i);
    const checkMatch =
      /ADD CONSTRAINT orgunit_classifier_call_completions_error_kind_chk\s+CHECK \(error_kind IS NULL OR error_kind IN\s+\(([^)]+)\)/i.exec(
        executableSql,
      );
    expect(checkMatch, 'could not locate the widened error_kind CHECK').not.toBeNull();
    const members = checkMatch![1]!.split(',').map((m) => m.trim().replace(/^'|'$/g, ''));
    expect(members.sort()).toEqual(
      [
        'PROVIDER_TRANSIENT',
        'PROVIDER_REFUSAL',
        'SCHEMA_INVALID',
        'EVIDENCE_SPAN_UNVERIFIED',
        'TIMEOUT',
        'OTHER',
        'USAGE_LIMIT_EXHAUSTED',
        'AUTH_FAILURE',
      ].sort(),
    );
  });
});

describe('PHASE-2B-FIREWALL 2B-2C2: the Claude Max runtime boundary is exactly one module wide, and Max-only', () => {
  /**
   * Banned identifiers are CONSTRUCTED here rather than written literally,
   * because phase1a scans every other source file - this one included - for
   * the literal strings themselves. A firewall naming a banned string
   * verbatim would trip the sibling firewall that bans it.
   */
  const API_KEY_VARIABLE = ['ANTHROPIC', 'API_KEY'].join('_');
  const API_KEY_HEADER = ['x-api', 'key'].join('-');
  const ANTHROPIC_API_HOST = ['api', 'anthropic', 'com'].join('.');

  const PROVIDER_DIR = 'src/orgunits/classify/provider';
  const PROVIDER_FILES = PHASE_2B_FILES.filter((file) => file.startsWith(`${PROVIDER_DIR}/`));
  /** THE single permitted Agent SDK import site, by exact path (ADR 0009). */
  const SDK_IMPORT_SITE = `${PROVIDER_DIR}/agentSdkRunner.ts`;
  /** THE single permitted child-process import site, by exact path (ADR 0010). */
  const CHILD_PROCESS_IMPORT_SITE = `${PROVIDER_DIR}/authStatusRunner.ts`;

  const EXPECTED_PROVIDER_FILES = [
    `${PROVIDER_DIR}/agentSdkRunner.ts`,
    `${PROVIDER_DIR}/allowedModels.ts`,
    `${PROVIDER_DIR}/authConflicts.ts`,
    `${PROVIDER_DIR}/authStatus.ts`,
    `${PROVIDER_DIR}/authStatusRunner.ts`,
    `${PROVIDER_DIR}/claudeMaxAgentProvider.ts`,
    `${PROVIDER_DIR}/environment.ts`,
    `${PROVIDER_DIR}/outcomeMapping.ts`,
    `${PROVIDER_DIR}/preflight.ts`,
    `${PROVIDER_DIR}/profile.ts`,
    `${PROVIDER_DIR}/profileHygiene.ts`,
    `${PROVIDER_DIR}/runtimeIsolation.ts`,
    `${PROVIDER_DIR}/sdkOptions.ts`,
  ];

  it('the provider namespace holds exactly the thirteen approved modules', () => {
    expect([...PROVIDER_FILES].sort()).toEqual(EXPECTED_PROVIDER_FILES);
  });

  it('exactly ONE production module imports the Agent SDK, by exact path', () => {
    for (const file of PRODUCTION_FILES) {
      const source = code(file);
      if (file === SDK_IMPORT_SITE) {
        expect(source, `${file} must import the official Agent SDK`).toMatch(
          /from\s+['"]@anthropic-ai\/claude-agent-sdk['"]/,
        );
        continue;
      }
      expect(source, `${file} imports the Agent SDK outside the approved seam`).not.toContain(
        '@anthropic-ai/claude-agent-sdk',
      );
    }
  });

  it('the Messages-API SDK is imported NOWHERE, and no Anthropic client is constructed', () => {
    // Import-shaped matching on purpose: sibling firewalls legitimately NAME
    // the banned package string in their own assertions; what no file - test
    // files included, since the peer-installed package sits in node_modules -
    // may do is IMPORT it.
    for (const file of SOURCE_FILES) {
      const source = code(file);
      expect(source, `${file} imports the Messages-API SDK`).not.toMatch(
        /(from\s+|require\(\s*|import\(\s*)['"]@anthropic-ai\/sdk['"]/,
      );
      expect(source, `${file} constructs an Anthropic API client`).not.toMatch(
        /new\s+Anthropic\s*\(/,
      );
    }
    // Host/header hygiene for PRODUCTION code (phase1a already bans both
    // strings across every non-firewall source file; firewall files name
    // them only in constructed form).
    for (const file of PRODUCTION_FILES) {
      const source = code(file);
      expect(source, `${file} names the Anthropic API host`).not.toContain(ANTHROPIC_API_HOST);
      expect(source, `${file} sets the API-key header`).not.toContain(API_KEY_HEADER);
    }
  });

  it('exactly ONE production module imports child_process, by exact path, and it runs ONLY the fixed request-free command', async () => {
    for (const file of PRODUCTION_FILES) {
      const source = code(file);
      if (file === CHILD_PROCESS_IMPORT_SITE) {
        expect(source, `${file} must import node:child_process`).toMatch(
          /from\s+['"]node:child_process['"]/,
        );
        continue;
      }
      expect(source, `${file} imports child_process outside the approved seam`).not.toContain(
        'child_process',
      );
    }
    // The command and argument vector are module constants: no setup-token
    // invocation, no /login automation, no arbitrary command is expressible.
    const { AUTH_STATUS_COMMAND, AUTH_STATUS_ARGS } =
      await import('../../orgunits/classify/provider/authStatusRunner.js');
    expect(AUTH_STATUS_COMMAND).toBe('claude');
    expect([...AUTH_STATUS_ARGS]).toEqual(['auth', 'status', '--json']);
    const runnerSource = code(CHILD_PROCESS_IMPORT_SITE);
    expect(runnerSource).not.toContain('setup-token');
    expect(runnerSource).not.toMatch(/['"](?:\/)?login['"]/);
  });

  it('the setup-token credential is PROHIBITED: constant pinned, never read, never forwarded (ADR 0010)', async () => {
    const { PROHIBITED_SETUP_TOKEN_VARIABLE, FORBIDDEN_AUTH_VARIABLES } =
      await import('../../orgunits/classify/provider/authConflicts.js');
    expect(PROHIBITED_SETUP_TOKEN_VARIABLE).toBe('CLAUDE_CODE_OAUTH_TOKEN');
    expect(FORBIDDEN_AUTH_VARIABLES).toHaveLength(14);
    expect(FORBIDDEN_AUTH_VARIABLES).toContain(API_KEY_VARIABLE);
    for (const file of PRODUCTION_FILES) {
      const source = code(file);
      for (const variable of [...FORBIDDEN_AUTH_VARIABLES, PROHIBITED_SETUP_TOKEN_VARIABLE]) {
        expect(source, `${file} dereferences ${variable}`).not.toMatch(
          new RegExp(`process\\.env\\.${variable}\\b|process\\.env\\[\\s*['"]${variable}['"]`),
        );
      }
    }
    // The child-env builder no longer names the token variable at all.
    expect(code(`${PROVIDER_DIR}/environment.ts`)).not.toContain(PROHIBITED_SETUP_TOKEN_VARIABLE);
  });

  it('the child-environment allowlist builds EXACTLY the approved variable set, forwards no credential and no secret category', async () => {
    const {
      buildChildEnvironment,
      CLASSIFIER_CHILD_ENV_FIXED,
      CLASSIFIER_CHILD_ENV_OS_PASSTHROUGH,
    } = await import('../../orgunits/classify/provider/environment.js');
    const parentEnv = {
      CLAUDE_CODE_OAUTH_TOKEN: 'firewall-fake-token',
      DATABASE_URL_ADMIN: 'postgres://secret',
      DATABASE_URL_CLASSIFIER: 'postgres://secret',
      GITHUB_TOKEN: 'secret',
      AWS_SECRET_ACCESS_KEY: 'secret',
      GOOGLE_APPLICATION_CREDENTIALS: 'secret',
      AZURE_CLIENT_SECRET: 'secret',
      [API_KEY_VARIABLE]: 'secret',
      PATH: '/usr/bin',
      HOME: '/home/owner',
      RANDOM_UNRELATED_SECRET: 'secret',
    };
    const child = buildChildEnvironment({
      parentEnv,
      configDir: 'X:/dedicated/classifier-profile',
    });
    expect(Object.keys(child).sort()).toEqual(
      ['CLAUDE_CONFIG_DIR', ...Object.keys(CLASSIFIER_CHILD_ENV_FIXED), 'PATH', 'HOME'].sort(),
    );
    expect(JSON.stringify(child)).not.toContain('firewall-fake-token');
    // The allowlist itself may not admit a credential-shaped or DB variable.
    for (const name of [
      ...Object.keys(CLASSIFIER_CHILD_ENV_FIXED),
      ...CLASSIFIER_CHILD_ENV_OS_PASSTHROUGH,
    ]) {
      expect(name).not.toBe(API_KEY_VARIABLE);
      expect(name).not.toBe('ANTHROPIC_AUTH_TOKEN');
      expect(name.startsWith('CLAUDE_CODE_USE_')).toBe(false);
      expect(name.includes('DATABASE_URL')).toBe(false);
      expect(name.includes('OAUTH')).toBe(false);
    }
  });

  it('stored-subscription auth only: the required auth-status values are pinned, first-party and Max', async () => {
    const { REQUIRED_AUTH_METHOD, REQUIRED_API_PROVIDER, REQUIRED_SUBSCRIPTION_TYPE } =
      await import('../../orgunits/classify/provider/authStatus.js');
    expect(REQUIRED_AUTH_METHOD).toBe('claude.ai');
    expect(REQUIRED_API_PROVIDER).toBe('firstParty');
    expect(REQUIRED_SUBSCRIPTION_TYPE).toBe('max');
  });

  it('the dedicated profile is pinned: named constants, and never the ordinary profile by construction', async () => {
    const { CLASSIFIER_PROFILE_DIR_BASENAME, CLASSIFIER_PROFILE_DIR_VARIABLE } =
      await import('../../orgunits/classify/provider/profile.js');
    expect(CLASSIFIER_PROFILE_DIR_BASENAME).toBe('.claude-nwf-classifier');
    expect(CLASSIFIER_PROFILE_DIR_VARIABLE).toBe('NWF_PE_CLASSIFIER_CONFIG_DIR');
    const { FORBIDDEN_PROFILE_ENTRIES } =
      await import('../../orgunits/classify/provider/profileHygiene.js');
    for (const surface of [
      'CLAUDE.md',
      'settings.json',
      'settings.local.json',
      'managed-settings.json',
      '.mcp.json',
      'agents',
      'commands',
      'skills',
      'hooks',
      'rules',
      'output-styles',
    ]) {
      expect(FORBIDDEN_PROFILE_ENTRIES, `hygiene list is missing ${surface}`).toContain(surface);
    }
  });

  it('no engine source reads a credential file, and the hygiene check reads NAMES only', () => {
    for (const file of PRODUCTION_FILES) {
      expect(code(file), `${file} names the credentials file`).not.toContain('.credentials.json');
    }
    const hygiene = code(`${PROVIDER_DIR}/profileHygiene.ts`);
    expect(hygiene).not.toContain('readFile');
    expect(hygiene).not.toContain('createReadStream');
    expect(hygiene).not.toContain('writeFile');
  });

  it('the persistent profile is never engine-deleted: removal capability exists ONLY in the scratch module', () => {
    for (const file of PROVIDER_FILES) {
      if (file === `${PROVIDER_DIR}/runtimeIsolation.ts`) continue;
      const source = code(file);
      expect(source, `${file} imports a filesystem removal primitive`).not.toMatch(
        /\b(?:rm|rmdir|rmSync|rmdirSync|unlink|unlinkSync)\b/,
      );
    }
    // And the scratch module's removal is scoped to the directory it created.
    const isolation = code(`${PROVIDER_DIR}/runtimeIsolation.ts`);
    expect(isolation).toContain('mkdtemp');
    expect(isolation).not.toContain('CLAUDE_CONFIG_DIR');
  });

  it('the invocation builder literally pins every hermetic option, and omits every forbidden one', () => {
    const source = code(`${PROVIDER_DIR}/sdkOptions.ts`);
    expect(source).toContain('settingSources: []');
    expect(source).toContain('persistSession: false');
    expect(source).toContain('strictMcpConfig: true');
    expect(source).toContain('mcpServers: {}');
    expect(source).toContain('tools: []');
    expect(source).toContain('allowedTools: []');
    expect(source).toContain('skills: []');
    expect(source).toContain('plugins: []');
    for (const providerFile of PROVIDER_FILES) {
      const providerSource = code(providerFile);
      expect(providerSource, `${providerFile} sets a fallback model`).not.toContain(
        'fallbackModel',
      );
      expect(providerSource, `${providerFile} resumes a session`).not.toMatch(/\bresume\s*:/);
      expect(providerSource, `${providerFile} forks a session`).not.toContain('forkSession');
      expect(providerSource, `${providerFile} uses the coding-agent preset`).not.toMatch(
        /preset\s*:\s*['"]claude_code['"]/,
      );
      expect(providerSource, `${providerFile} adds a hook`).not.toMatch(/\bhooks\s*:/);
      expect(providerSource, `${providerFile} defines a subagent`).not.toMatch(/\bagents\s*:/);
      expect(providerSource, `${providerFile} widens the filesystem`).not.toContain(
        'additionalDirectories',
      );
    }
  });

  it('the provider namespace imports no database, persistence or loader capability', () => {
    for (const file of PROVIDER_FILES) {
      const source = code(file);
      expect(source, `${file} imports pg`).not.toMatch(/from\s+['"]pg['"]/);
      expect(source, `${file} imports the db helpers`).not.toMatch(/from\s+['"].*\/db\//);
      expect(source, `${file} imports classifier persistence`).not.toMatch(
        /from\s+['"]\.\.\/persist\.js['"]/,
      );
      expect(source, `${file} imports classifier loaders`).not.toMatch(
        /from\s+['"]\.\.\/loaders\.js['"]/,
      );
      expect(source, `${file} names a Postgres pool`).not.toMatch(/\bPool\b/);
    }
  });

  it('no provider-routing name appears in the provider namespace outside the guard constant', () => {
    for (const file of PROVIDER_FILES) {
      if (file === `${PROVIDER_DIR}/authConflicts.ts`) continue;
      const source = code(file).toLowerCase();
      for (const banned of ['bedrock', 'vertex', 'foundry', 'openai', 'gateway']) {
        expect(source, `${file} names ${banned}`).not.toContain(banned);
      }
    }
  });

  it('no billing, credit-purchase or top-up capability exists in the classifier namespace', () => {
    const classifyFiles = PHASE_2B_FILES.filter((file) =>
      file.startsWith('src/orgunits/classify/'),
    );
    for (const file of classifyFiles) {
      const source = code(file);
      for (const banned of [
        /buyCredits/i,
        /purchaseCredits/i,
        /topUp/i,
        /addFunds/i,
        /billingToggle/i,
      ]) {
        expect(source, `${file} matches ${banned}`).not.toMatch(banned);
      }
    }
  });

  it('process.env is read by exactly one classify module: the provider adapter', () => {
    const classifyFiles = PHASE_2B_FILES.filter((file) =>
      file.startsWith('src/orgunits/classify/'),
    );
    for (const file of classifyFiles) {
      if (file === `${PROVIDER_DIR}/claudeMaxAgentProvider.ts`) continue;
      expect(code(file), `${file} reads process.env`).not.toContain('process.env');
    }
  });

  it('no automated test constructs a production runner - SDK or auth-status', () => {
    const testFiles = SOURCE_FILES.filter((file) => file.startsWith('src/test/'));
    for (const file of testFiles) {
      expect(code(file), `${file} constructs the production SDK runner`).not.toContain(
        'createProductionAgentSdkRunner',
      );
      expect(code(file), `${file} constructs the production auth-status runner`).not.toContain(
        'createProductionAuthStatusRunner',
      );
    }
  });

  it('the provider outcome vocabulary is exactly the landed provider-neutral taxonomy', () => {
    const mapping = code(`${PROVIDER_DIR}/outcomeMapping.ts`);
    for (const outcome of [
      'USAGE_LIMIT_EXHAUSTED',
      'AUTH_FAILURE',
      'PROVIDER_TRANSIENT',
      'PROVIDER_REFUSAL',
      'STRUCTURED_OUTPUT_FAILED',
      'TIMEOUT',
    ]) {
      expect(mapping, `outcomeMapping.ts never produces ${outcome}`).toContain(outcome);
    }
    // No relevance/verdict vocabulary may leak into transport mapping.
    for (const banned of [/NEEDS_REVIEW/, /\brelevant\b/i, /verified/i]) {
      expect(mapping).not.toMatch(banned);
    }
  });
});
