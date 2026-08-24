/**
 * PHASE-2B-FIREWALL
 *
 * The Phase 1A, 1B and 1D firewalls still apply in full and are not restated
 * here; all three walk every source file, so they already cover everything this
 * slice adds. This file asserts the boundaries that only became reachable once
 * a schema for FIRST-PARTY WEB ACQUISITION existed.
 *
 * THE MOST IMPORTANT ASSERTION IN THIS FILE IS THAT NOTHING CHANGED YET.
 *
 *   Phase 2B-1a is schema, a role, and this firewall. It adds no network code,
 *   and at the end of it this repository still has ZERO institution-website
 *   network call sites. Every check below is written so that it is TRUE TODAY
 *   and BECOMES LOAD-BEARING the moment someone writes the acquisition code -
 *   which is the only kind of firewall worth having for a boundary that does
 *   not exist yet.
 *
 * What this file pins:
 *
 *   - ONE future network location, and only one: src/orgunits/web/gateway.ts.
 *     Any other Phase 2B file that opens a socket is a second, unreviewed
 *     network capability.
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
 * EMPTY TODAY, DELIBERATELY. 2B-1a creates no runtime module: the schema and
 * the trust contract are reviewed before the code that depends on them is
 * written. Every check that iterates this list is therefore vacuous now and
 * binding the moment the namespace appears, which is exactly when it matters.
 */
const PHASE_2B_FILES = SOURCE_FILES.filter((file) => file.startsWith('src/orgunits/'));

/**
 * THE SINGLE PERMITTED PHASE 2B NETWORK LOCATION.
 *
 * Declared here, in a test, BEFORE the file exists. Phase 1D pins the exact set
 * of files allowed to call fetch() at the three official-source resolvers; when
 * 2B-1b adds the gateway it must widen that list DELIBERATELY, in that slice,
 * with review. Naming the destination now does not pre-authorise it - it means
 * a second network location cannot be introduced quietly alongside the first.
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

describe('PHASE-2B-FIREWALL: zero institution-website network call sites remain', () => {
  it('opens no socket and resolves no hostname anywhere in source', () => {
    // Restated at the Phase 2B boundary because this is the guarantee the next
    // slice will be under pressure to relax. It must be relaxed deliberately,
    // in 2B-1b, for exactly one file - not drift.
    for (const file of SOURCE_FILES) {
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
    const fetchers = PRODUCTION_FILES.filter((file) => /\bfetch\s*\(/.test(read(file)));
    expect(fetchers.sort()).toEqual([
      'src/ingest/eche/source.ts',
      'src/ingest/ewp/source.ts',
      'src/ingest/fresr/source.ts',
    ]);
  });

  it('has not built the acquisition gateway, the robots reader or the extractor', () => {
    // 2B-1a is schema, role, firewall and ADR. Creating any of these now -
    // even empty, even as a placeholder - would be building ahead of approval,
    // and a placeholder is exactly how an unreviewed capability gets its first
    // import.
    for (const path of [
      PHASE_2B_NETWORK_MODULE,
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
    // Vacuous today (src/orgunits is empty) and binding from the moment it is
    // not. Whatever 2B-1b writes, only the declared gateway may reach a socket
    // or a fetch; a second network location under src/orgunits is refused here
    // rather than discovered later.
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

  it('refuses an addressable identifier in the one audit field that has a name in it', () => {
    // decided_by records WHO promoted a root. It is the single field in this
    // schema where a mailbox would plausibly be typed by a well-meaning
    // operator, so the database refuses one.
    const sql = MIGRATION_0007?.sql ?? '';
    expect(sql).toMatch(/orgunit_root_promotion_events_decided_by_chk/);
    expect(sql).toMatch(/decided_by\s*!~/);
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
  it('grants nwf_research SELECT and INSERT on its own tables and nothing more', () => {
    const sql = MIGRATION_0007?.sql ?? '';
    const orgunitTables = [
      'orgunit_research_runs',
      'orgunit_research_run_completions',
      'orgunit_fetch_observations',
      'orgunit_redirect_observations',
      'orgunit_root_promotion_events',
      'orgunit_page_evidence',
      'orgunit_page_candidates',
    ];
    for (const table of orgunitTables) {
      expect(sql, `${table} has no append-only grant`).toMatch(
        new RegExp(`GRANT SELECT, INSERT ON ${table}\\s+TO nwf_research`),
      );
    }
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
});

describe('PHASE-2B-FIREWALL: identity and locale boundaries hold', () => {
  it('keeps organisation_id nullable on every Phase 2B table', () => {
    // A NOT NULL foreign key would quietly assert that a web page proves two
    // provisional organisation records are one entity. They are not resolved.
    const sql = MIGRATION_0007?.sql ?? '';
    const declarations = [...sql.matchAll(/^\s+organisation_id\s+uuid([^,\n]*)/gim)].map(
      (m) => m[1] ?? '',
    );
    expect(declarations.length).toBeGreaterThan(0);
    for (const declaration of declarations) {
      expect(declaration, 'organisation_id is NOT NULL somewhere in 0007').not.toMatch(
        /NOT\s+NULL/i,
      );
      expect(declaration).toMatch(/REFERENCES\s+organisations/i);
    }
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
