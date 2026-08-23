/**
 * PHASE-1B-FIREWALL
 *
 * Phase 1A's firewall still applies in full and is not restated here; it walks
 * every source file, so it already covers everything added in Phase 1B. This
 * file adds the boundaries that only became reachable once a SECOND official
 * source existed:
 *
 *   - EWP is a STRUCTURED-SOURCE problem, not a crawler problem. No browser
 *     automation, no scraping framework, no job queue.
 *   - A SCHAC identifier must never become a website, a domain, or a crawl
 *     target - and above all must never reach organisations.canonical_domain.
 *   - Phase 1B records that an EWP API was DECLARED. It never calls one.
 *   - No entity resolution: no fuzzy matcher, no record linkage library, no
 *     automatic merge.
 *   - EWP ingestion issues no statement against organisations at all.
 *
 * These assertions target real capabilities - dependencies, API hosts, SQL
 * verbs, client constructs - NOT ordinary English words, so documentation prose
 * never trips them. A firewall that fails on the word "crawl" in a comment
 * trains people to weaken it.
 *
 * NEVER weaken a firewall test to make CI green. If one fails, the code is wrong.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SELF = 'src/test/firewall/phase1b.firewall.test.ts';

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
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

/** Non-test source only: production code paths. */
const PRODUCTION_FILES = SOURCE_FILES.filter((file) => !file.startsWith('src/test/'));

/** Everything under src/ingest/ewp plus the comparison module. */
const EWP_FILES = SOURCE_FILES.filter(
  (file) => file.startsWith('src/ingest/ewp/') || file.startsWith('src/compare/'),
);

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

describe('PHASE-1B-FIREWALL: no crawler or browser automation', () => {
  it('declares no scraping, crawling or browser-automation dependency', () => {
    const forbidden = [
      'crawlee',
      'playwright',
      'playwright-core',
      '@playwright/test',
      'puppeteer',
      'puppeteer-core',
      'cheerio',
      'jsdom',
      'selenium-webdriver',
      'firecrawl',
      '@mendable/firecrawl-js',
      'crawl4ai',
      'got-scraping',
      'osmosis',
      'x-ray',
    ];
    for (const name of Object.keys(ALL_DEPENDENCIES)) {
      expect(forbidden, `${name} is a crawler/browser-automation dependency`).not.toContain(name);
    }
  });

  it('has no crawler service host or credential in source', () => {
    for (const file of SOURCE_FILES) {
      const source = read(file);
      expect(source, `${file} references the Firecrawl API host`).not.toContain(
        'api.firecrawl.dev',
      );
      expect(source, `${file} references a Firecrawl credential`).not.toContain(
        'FIRECRAWL_API_KEY',
      );
      expect(source, `${file} launches a headless browser`).not.toMatch(
        /\b(chromium|firefox|webkit)\s*\.\s*launch\s*\(/,
      );
    }
  });

  it('declares no background job queue', () => {
    // Phase 1B is a small number of operator-invoked commands. A queue would be
    // infrastructure built ahead of an approved phase.
    const forbidden = ['graphile-worker', 'pg-boss', 'bullmq', 'bull', 'agenda', 'n8n'];
    for (const name of Object.keys(ALL_DEPENDENCIES)) {
      expect(forbidden, `${name} is a job-queue dependency`).not.toContain(name);
    }
  });
});

describe('PHASE-1B-FIREWALL: no entity resolution', () => {
  it('declares no fuzzy-matching or record-linkage dependency', () => {
    const forbidden = [
      'splink',
      'fuzzball',
      'fuzzysort',
      'fuse.js',
      'string-similarity',
      'fast-levenshtein',
      'levenshtein',
      'js-levenshtein',
      'talisman',
      'natural',
      'dedupe',
      'record-linkage',
    ];
    for (const name of Object.keys(ALL_DEPENDENCIES)) {
      expect(forbidden, `${name} is an entity-resolution dependency`).not.toContain(name);
    }
  });

  it('implements no similarity scoring anywhere in source', () => {
    for (const file of SOURCE_FILES) {
      const source = read(file);
      expect(source, `${file} implements edit distance`).not.toMatch(
        /\b(levenshtein|jaroWinkler|jaro_winkler|soundex|metaphone|trigramSimilarity)\b/i,
      );
    }
  });

  it('uses no trigram or fuzzy operator in any migration', () => {
    for (const { file, sql } of MIGRATIONS) {
      expect(sql, `${file} enables a fuzzy-matching extension`).not.toMatch(
        /CREATE\s+EXTENSION[^;]*\b(pg_trgm|fuzzystrmatch)\b/i,
      );
      expect(sql, `${file} uses a similarity operator`).not.toMatch(/\bsimilarity\s*\(/i);
    }
  });

  it('creates no merge, alias, cluster or canonical-entity table', () => {
    for (const { file, sql } of MIGRATIONS) {
      expect(sql, `${file} creates an entity-resolution table`).not.toMatch(
        /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?\w*(merge|alias|cluster|canonical_entit|match_decision|golden_record)\w*/i,
      );
    }
  });
});

describe('PHASE-1B-FIREWALL: a SCHAC identifier never becomes a website', () => {
  it('no EWP or comparison module ever assigns canonical_domain', () => {
    for (const file of EWP_FILES) {
      const source = read(file);
      // Reading and comparing canonical_domain is allowed and is what the
      // domain-shape analysis does. ASSIGNING it from EWP data is not.
      expect(source, `${file} assigns canonical_domain`).not.toMatch(/canonical_domain\s*=(?!=)/);
      expect(source, `${file} builds an UPDATE of canonical_domain`).not.toMatch(
        /SET[^;]*canonical_domain/i,
      );
    }
  });

  it('no EWP module writes to organisations at all', () => {
    for (const file of EWP_FILES) {
      const source = read(file);
      expect(source, `${file} inserts into organisations`).not.toMatch(
        /INSERT\s+INTO\s+organisations/i,
      );
      expect(source, `${file} updates organisations`).not.toMatch(/UPDATE\s+organisations/i);
      expect(source, `${file} deletes from organisations`).not.toMatch(
        /DELETE\s+FROM\s+organisations/i,
      );
      expect(source, `${file} writes organisation_sources`).not.toMatch(
        /INSERT\s+INTO\s+organisation_sources/i,
      );
    }
  });

  it('no migration back-fills organisations from EWP evidence', () => {
    for (const { file, sql } of MIGRATIONS) {
      expect(sql, `${file} updates organisations`).not.toMatch(/^\s*UPDATE\s+organisations/im);
      expect(sql, `${file} inserts into organisations`).not.toMatch(
        /^\s*INSERT\s+INTO\s+organisations/im,
      );
    }
  });

  it('no ewp table declares a foreign key into organisations', () => {
    // A foreign key would assert the resolution this phase has not performed.
    const ewpMigration = MIGRATIONS.find((m) => m.file === '0003_ewp_registry.sql');
    expect(ewpMigration).toBeDefined();
    expect(ewpMigration?.sql).not.toMatch(/REFERENCES\s+organisations/i);
  });

  it('never derives a URL from a SCHAC identifier', () => {
    for (const file of EWP_FILES) {
      const source = read(file);
      expect(source, `${file} builds a URL from a hei id`).not.toMatch(/https?:\/\/\$\{[^}]*hei/i);
      expect(source, `${file} parses a hei id as a URL`).not.toMatch(/new URL\([^)]*hei/i);
      expect(source, `${file} runs a hei id through the domain extractor`).not.toMatch(
        /(getDomain|canonicalDomain)\s*\([^)]*hei/i,
      );
    }
  });
});

describe('PHASE-1B-FIREWALL: declared EWP APIs are never called', () => {
  it('no production module fetches a per-institution EWP endpoint', () => {
    for (const file of PRODUCTION_FILES) {
      const source = read(file);
      // The only fetch() calls in this repository target the two official
      // source artifacts. A fetch of a stored endpoint would be a secondary
      // crawl of every university in the registry.
      expect(source, `${file} fetches a stored endpoint`).not.toMatch(
        /fetch\s*\(\s*[^)]*\b(endpoint|apiUrl|declaredUrl|getUrl|indexUrl)\b/i,
      );
      expect(source, `${file} iterates endpoints issuing requests`).not.toMatch(
        /endpoints\s*\[[^\]]*\]\s*\)?\s*\.then/i,
      );
    }
  });

  it('reads no endpoint column back out of the database for fetching', () => {
    for (const file of PRODUCTION_FILES) {
      const source = read(file);
      if (!/SELECT[^;]*endpoints/i.test(source)) continue;
      // Selecting endpoints is fine for reporting; combining it with fetch is not.
      expect(source, `${file} selects endpoints and also calls fetch`).not.toMatch(/\bfetch\s*\(/);
    }
  });

  it('performs no network write: source contains no non-GET fetch', () => {
    for (const file of SOURCE_FILES) {
      const source = read(file);
      expect(source, `${file} issues a non-GET HTTP method`).not.toMatch(
        /method\s*:\s*['"](POST|PUT|PATCH|DELETE)['"]/i,
      );
    }
  });
});

describe('PHASE-1B-FIREWALL: no contact capability', () => {
  it('never persists an EWP admin email', () => {
    for (const { file, sql } of MIGRATIONS) {
      expect(sql, `${file} creates an admin_email column`).not.toMatch(/^\s*admin_email\b/im);
      expect(sql, `${file} creates any email column`).not.toMatch(
        /^\s*\w*email\w*\s+(text|varchar|citext)/im,
      );
    }
    for (const file of EWP_FILES) {
      const source = read(file);
      expect(source, `${file} extracts an admin email`).not.toMatch(
        /['"]admin-email['"]|adminEmail/,
      );
    }
  });

  it('creates no contact table', () => {
    for (const { file, sql } of MIGRATIONS) {
      expect(sql, `${file} creates a contact table`).not.toMatch(
        /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?\w*(contact|person|lead|prospect)\w*/i,
      );
    }
  });
});

describe('PHASE-1B-FIREWALL: EWP source resolution stays fail-closed', () => {
  it('permits exactly one official EWP host', () => {
    const schema = read('src/ingest/ewp/schema.ts');
    const hosts = schema.match(/EWP_ALLOWED_HOSTS = new Set\(\[([^\]]*)\]\)/);
    expect(hosts?.[1]).toBeDefined();
    expect(hosts?.[1]).toContain('registry.erasmuswithoutpaper.eu');
    // Exactly one entry: a second host would widen the trust boundary.
    expect((hosts?.[1]?.match(/'/g) ?? []).length).toBe(2);
  });

  it('makes no licence claim about the live catalogue data', () => {
    const schema = read('src/ingest/ewp/schema.ts');
    expect(schema).not.toMatch(/EWP_SOURCE_LICENCE/);
    expect(schema).toMatch(/NO dataset-licensing claim/);
  });

  it('EWP evidence is never recorded under the ECHE source system', () => {
    const ingest = read('src/ingest/ewp/ingest.ts');
    expect(ingest).not.toMatch(/ECHE_SOURCE_SYSTEM|['"]eche['"]/);
  });
});

describe('PHASE-1B-FIREWALL: scope boundaries still hold', () => {
  it('implements no research, scoring, contact, outreach or resolution module', () => {
    const forbiddenDirs = [
      'src/contacts',
      'src/qualify',
      'src/compliance',
      'src/templates',
      'src/outreach',
      'src/suppression',
      'src/research',
      'src/apollo',
      'src/crawl',
      'src/scrape',
      'src/enrich',
      'src/resolve',
      'src/entity',
      'src/matching',
      'src/scoring',
      'src/workers',
      'src/queue',
    ];
    for (const dir of forbiddenDirs) {
      let exists = true;
      try {
        statSync(resolve(ROOT, dir));
      } catch {
        exists = false;
      }
      expect(exists, `${dir} exists but its phase is not approved`).toBe(false);
    }
  });

  it('added exactly the XML parsing dependency and nothing else', () => {
    // Phase 1B needed a streaming XML parser. Anything beyond saxes and its own
    // single dependency would be scope creep hiding in package.json.
    expect(Object.keys(PACKAGE_JSON.dependencies ?? {}).sort()).toEqual([
      'pg',
      'read-excel-file',
      'saxes',
      'tldts',
      'zod',
    ]);
  });
});
