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
    // parser or an SDK arriving ahead of its phase.
    expect(Object.keys(PACKAGE_JSON.dependencies ?? {}).sort()).toEqual([
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
      expect(name.startsWith('@anthropic-ai/')).toBe(false);
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

  it('built the gateway and NOTHING ELSE under it', () => {
    // 2B-1b is the bounded network primitive. The policy readers, the frontier,
    // the extractor, the charset handler, the signals, the candidates and the
    // classifier all belong to later slices, and creating any of them now -
    // even empty, even as a placeholder - would be building ahead of approval.
    // A placeholder is exactly how an unreviewed capability gets its first
    // import.
    expect(exists(PHASE_2B_NETWORK_MODULE), 'the approved gateway is missing').toBe(true);
    for (const path of [
      'src/orgunits/web/robots.ts',
      'src/orgunits/web/sitemap.ts',
      'src/orgunits/web/frontier.ts',
      'src/orgunits/web/extract.ts',
      'src/orgunits/web/charset.ts',
      'src/orgunits/signals',
      'src/orgunits/candidates',
      'src/orgunits/classify',
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
    for (const file of PHASE_2B_FILES) {
      const source = code(file);
      expect(source, `${file} writes a body to disk`).not.toMatch(
        /writeFile|createWriteStream|mkdtemp|tmpdir/,
      );
      expect(source, `${file} inserts a body column`).not.toMatch(
        /INSERT[^;]*\b(raw_html|page_html|response_body|raw_body)\b/i,
      );
    }
  });

  it('reads no HTML and consults no site policy file', () => {
    // 2B-1b is the network primitive. Extraction, charset handling and any
    // reader of a site's own policy files belong to later slices.
    for (const file of PHASE_2B_FILES) {
      const source = read(file);
      expect(source, `${file} parses HTML`).not.toMatch(
        /\b(parseHTML|innerHTML|querySelectorAll|JSDOM|DOMParser)\b/,
      );
      expect(source, `${file} requests a policy file`).not.toContain('robots.txt');
      expect(source, `${file} requests a sitemap`).not.toContain('sitemap.xml');
    }
  });

  it('names the single permitted network location in ADR 0004', () => {
    // The allow-list above is only meaningful if the destination is documented
    // where a reviewer of the next slice will read it.
    const adr = read('docs/adr/0004-bounded-first-party-web-acquisition.md');
    expect(adr).toContain(PHASE_2B_NETWORK_MODULE);
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
  it('declares no relevance, verdict or approval column in any migration', () => {
    // These are CONCLUSIONS. The deterministic layer ranks; it does not decide.
    // A column here would let a lexical rule's output be read as an answer.
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
    for (const { file, sql } of MIGRATIONS) {
      const columns = declaredColumns(sql);
      for (const name of forbidden) {
        expect(columns, `${file} declares the conclusion column ${name}`).not.toContain(name);
      }
    }
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
