/**
 * PHASE-1D-FIREWALL
 *
 * The Phase 1A and 1B firewalls still apply in full and are not restated here;
 * both walk every source file, so they already cover everything Phase 1D adds.
 * This file asserts the boundaries that only became reachable once this
 * repository started reasoning about WEBSITES:
 *
 *   - NO INSTITUTION WEBSITE IS EVER FETCHED. Not a GET, not a HEAD, not a
 *     redirect check, not a robots.txt read, not a DNS lookup. The whole point
 *     of verifying against an official register is that it makes fetching
 *     institution sites unnecessary. This is the single most important
 *     boundary in the file: a website column is exactly the thing that tempts
 *     a repository into becoming a crawler.
 *   - EXACTLY ONE new network source, on ONE allow-listed official host, and
 *     restricted to ONE dataset on that host.
 *   - NO CONTACT FIELD reaches this process. The French register publishes a
 *     telephone number; the request never asks for it and the schema refuses
 *     it.
 *   - Website evidence writes to website_* only. organisations,
 *     organisation_sources and every ewp_* table are untouched.
 *
 * These assertions target real capabilities - dependencies, hosts, SQL verbs,
 * field names in code - NOT ordinary English words, so documentation prose
 * never trips them.
 *
 * NEVER weaken a firewall test to make CI green. If one fails, the code is wrong.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SELF = 'src/test/firewall/phase1d.firewall.test.ts';

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
const PRODUCTION_FILES = SOURCE_FILES.filter((file) => !file.startsWith('src/test/'));

/**
 * Source with comments removed.
 *
 * Used where the check is about CODE rather than prose. A firewall that fails
 * because a doc comment NAMES the field it is explaining why it excludes would
 * punish exactly the documentation that makes the boundary understandable, and
 * a firewall people learn to work around is worse than none.
 */
function code(relativePath: string): string {
  return read(relativePath)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');
}

/**
 * Everything Phase 1D added: the website evidence layer, the FR adapter, AND
 * the CLI command module.
 *
 * The CLI file belongs here for the same reason the others do - it is Phase 1D
 * code that reaches the database and the network, so every boundary asserted
 * below has to hold for it too. Leaving it out would have exempted the one
 * file that chooses which source resolvers get called.
 */
const PHASE_1D_FILES = SOURCE_FILES.filter(
  (file) =>
    file.startsWith('src/website/') ||
    file.startsWith('src/ingest/fresr/') ||
    file === 'src/cli/commands/website.ts',
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

describe('PHASE-1D-FIREWALL: Phase 1D added no dependency at all', () => {
  it('keeps the runtime dependency list exactly as it was', () => {
    // Phase 1D needed nothing new: tldts was already present for
    // canonical_domain, and zod for environment validation.
    expect(Object.keys(PACKAGE_JSON.dependencies ?? {}).sort()).toEqual([
      'pg',
      'read-excel-file',
      'saxes',
      'tldts',
      'zod',
    ]);
  });

  it('declares no crawler, scraper or browser-automation dependency', () => {
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
      'happy-dom',
      'node-html-parser',
      'parse5',
      'htmlparser2',
      'domhandler',
      'robots-parser',
      'metascraper',
      'open-graph-scraper',
      'axios',
      'got',
      'node-fetch',
      'undici',
      'superagent',
      'request',
    ];
    for (const name of Object.keys(ALL_DEPENDENCIES)) {
      expect(forbidden, `${name} enables fetching or parsing arbitrary web pages`).not.toContain(
        name,
      );
    }
  });

  it('declares no AI, contact-data or outbound dependency', () => {
    for (const name of Object.keys(ALL_DEPENDENCIES)) {
      expect(name.startsWith('@anthropic-ai/')).toBe(false);
      expect(name.includes('apollo')).toBe(false);
      expect(['resend', 'nodemailer', '@sendgrid/mail', 'postmark']).not.toContain(name);
    }
  });
});

describe('PHASE-1D-FIREWALL: no institution website is ever fetched', () => {
  it('resolves no hostname and opens no socket', () => {
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

  it('never fetches a value derived from a website claim', () => {
    for (const file of PRODUCTION_FILES) {
      const source = read(file);
      // A stored website, hostname or domain is EVIDENCE. Passing one to
      // fetch() would turn this repository into a crawler of every
      // institution in the dataset.
      expect(source, `${file} fetches a stored website value`).not.toMatch(
        /fetch\s*\(\s*[^)]*\b(website|websiteUrl|normalisedUrl|hostname|registrableDomain|canonicalDomain|canonical_domain)\b/i,
      );
      expect(source, `${file} builds a request from a claim domain`).not.toMatch(
        /fetch\s*\(\s*`[^`]*\$\{[^}]*(domain|host|website)/i,
      );
    }
  });

  it('never issues a HEAD request or a liveness probe', () => {
    for (const file of SOURCE_FILES) {
      const source = read(file);
      expect(source, `${file} issues a HEAD request`).not.toMatch(/method\s*:\s*['"]HEAD['"]/i);
      expect(source, `${file} issues a non-GET HTTP method`).not.toMatch(
        /method\s*:\s*['"](POST|PUT|PATCH|DELETE)['"]/i,
      );
    }
  });

  it('never reaches the ECHE network resolver, which follows redirects', () => {
    // THE ONE PLACE PHASE 1D COULD HAVE INHERITED SOMEONE ELSE'S TRUST
    // BOUNDARY. src/ingest/eche/source.ts fetches with redirect: 'follow',
    // which lets the runtime request a redirect target before any allow-list
    // check can run. That is a pre-existing Phase 1A weakness, and fixing it
    // is not Phase 1D's business - but DEPENDING on it would make it Phase
    // 1D's problem, because `website ingest eche` with no --eche-file would
    // then perform a redirect-following fetch on Phase 1D's behalf.
    //
    // So Phase 1D reads the ECHE artifact from disk and never fetches it.
    for (const file of PHASE_1D_FILES) {
      const source = code(file);
      expect(source, `${file} imports the ECHE official-page discovery resolver`).not.toMatch(
        /resolveFromOfficialPage/,
      );
      expect(source, `${file} imports the ECHE URL resolver`).not.toMatch(
        /resolveFromUrl\s+as\s+resolveEche/,
      );
    }
    // Positive: the local-file resolver IS what the CLI uses.
    expect(code('src/cli/commands/website.ts')).toMatch(/resolveFromFile\s+as\s+resolveEcheFile/);
  });

  it('the new Phase 1D source refuses to follow a redirect', () => {
    // Handing the hop to the runtime means the target is requested BEFORE any
    // allow-list check can run, so validating Response.url afterwards is too
    // late. The Phase 1D adapter therefore uses manual redirect handling, and
    // the host it talks to genuinely does redirect some paths - the dataset's
    // own landing page answers 302 - so this is load-bearing, not theoretical.
    const source = read('src/ingest/fresr/source.ts');
    expect(source).toMatch(/redirect:\s*'manual'/);
    expect(source, 'the FR adapter delegates redirects to the runtime').not.toMatch(
      /redirect\s*:\s*['"](follow|error)['"]\s*[,}]/,
    );

    // Comment-stripped: this is a check on CODE. The CLI's own documentation
    // has to be able to NAME `redirect: 'follow'` in order to explain why it
    // refuses to reach the resolver that uses it.
    for (const file of PHASE_1D_FILES) {
      expect(code(file), `${file} delegates redirects to the runtime`).not.toMatch(
        /redirect\s*:\s*['"](follow|error)['"]\s*[,}]/,
      );
    }
  });

  it('reads no HTML: no parser and no robots handling', () => {
    for (const file of PRODUCTION_FILES) {
      const source = read(file);
      expect(source, `${file} parses HTML`).not.toMatch(
        /\b(parseHTML|innerHTML|querySelectorAll|JSDOM|load\s*\(\s*html)\b/,
      );
      expect(source, `${file} requests robots.txt`).not.toContain('robots.txt');
      expect(source, `${file} requests a sitemap`).not.toContain('sitemap.xml');
    }
  });

  it('every fetch() in production code targets an allow-listed official source', () => {
    // Three official sources exist, each with its own validated allow-list.
    // A fetch outside these modules would be an unreviewed network capability.
    const fetchers = PRODUCTION_FILES.filter((file) => /\bfetch\s*\(/.test(read(file)));
    expect(fetchers.sort()).toEqual([
      'src/ingest/eche/source.ts',
      'src/ingest/ewp/source.ts',
      'src/ingest/fresr/source.ts',
    ]);
  });
});

describe('PHASE-1D-FIREWALL: exactly one new official host, and one dataset on it', () => {
  it('allow-lists exactly one French open-data host', () => {
    const schema = read('src/ingest/fresr/schema.ts');
    const hosts = schema.match(/FRESR_ALLOWED_HOSTS = new Set\(\[([^\]]*)\]\)/);
    expect(hosts?.[1]).toBeDefined();
    expect(hosts?.[1]).toContain('data.enseignementsup-recherche.gouv.fr');
    // Exactly one entry: a second host would widen the trust boundary.
    expect((hosts?.[1]?.match(/'/g) ?? []).length).toBe(2);
  });

  it('restricts requests to the ONE approved dataset on that host', () => {
    // The host publishes hundreds of datasets. Host validation alone would let
    // any of them be pulled in.
    const schema = read('src/ingest/fresr/schema.ts');
    expect(schema).toMatch(/FRESR_API_PATH_PREFIX/);
    expect(schema).toContain('fr-esr-principaux-etablissements-enseignement-superieur');
    expect(read('src/ingest/fresr/source.ts')).toMatch(/startsWith\(FRESR_API_PATH_PREFIX\)/);
  });

  it('adds NO second national register adapter', () => {
    // Spain, Belgium, the Netherlands and Germany are each their own approved
    // phase. A directory for one would be building ahead of approval.
    const forbiddenDirs = [
      'src/ingest/esreg',
      'src/ingest/bereg',
      'src/ingest/nlreg',
      'src/ingest/dereg',
      'src/ingest/uai',
      'src/website/fetch',
      'src/website/crawl',
      'src/website/verify',
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

  it('constrains the database to one external website source too', () => {
    const migration = MIGRATIONS.find((m) => m.file === '0005_website_evidence.sql');
    expect(migration).toBeDefined();
    expect(migration?.sql).toMatch(/website_source_snapshots_source_key_chk[\s\S]*?'fr_esr'/);
  });
});

describe('PHASE-1D-FIREWALL: no contact field reaches this process', () => {
  it('the FR request asks for exactly five non-contact fields', () => {
    const schema = read('src/ingest/fresr/schema.ts');
    const selected = schema.match(/FRESR_SELECTED_FIELDS = \[([^\]]*)\]/);
    expect(selected?.[1]).toBeDefined();
    const fields = [...(selected?.[1]?.matchAll(/'([^']+)'/g) ?? [])].map((m) => m[1]);
    expect(fields).toEqual(['etablissement_id_paysage', 'uo_lib', 'uai', 'identifiant_pic', 'url']);
  });

  it('names no contact field of the French dataset anywhere in Phase 1D code', () => {
    // These are the dataset's real contact-bearing column names. Referencing
    // one would mean this repository had started reading it.
    const contactFields = [
      'numero_telephone_uai',
      'adresse_uai',
      'lieu_dit_uai',
      'boite_postale_uai',
      'code_postal_uai',
      'localite_acheminement_uai',
    ];
    for (const file of PHASE_1D_FILES) {
      const source = code(file);
      for (const field of contactFields) {
        expect(source, `${file} reads the contact field ${field}`).not.toContain(field);
      }
    }
  });

  it('defines no contact-shaped property in Phase 1D code', () => {
    for (const file of PHASE_1D_FILES) {
      const source = code(file);
      expect(source, `${file} declares an email property`).not.toMatch(
        /\b(email|mailbox|emailAddress|contactEmail|adminEmail)\s*[:?]/i,
      );
      expect(source, `${file} declares a phone property`).not.toMatch(
        /\b(phone|telephone|phoneNumber|mobile)\s*[:?]/i,
      );
    }
  });

  it('creates no contact column or contact table in any migration', () => {
    for (const { file, sql } of MIGRATIONS) {
      expect(sql, `${file} creates an email column`).not.toMatch(
        /^\s*\w*email\w*\s+(text|varchar|citext)/im,
      );
      expect(sql, `${file} creates a phone column`).not.toMatch(
        /^\s*\w*(phone|telephone)\w*\s+(text|varchar)/im,
      );
      expect(sql, `${file} creates a contact table`).not.toMatch(
        /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?\w*(contact|person|lead|prospect)\w*/i,
      );
    }
  });

  it('infers no email pattern from a domain', () => {
    for (const file of SOURCE_FILES) {
      const source = read(file);
      expect(source, `${file} builds an address from a domain`).not.toMatch(
        /['"`]@['"`]\s*\+|\$\{[^}]*\}@\$\{/,
      );
    }
  });
});

describe('PHASE-1D-FIREWALL: website evidence mutates nothing it does not own', () => {
  it('writes to no table other than website_* and ingest_runs', () => {
    for (const file of PHASE_1D_FILES) {
      const source = read(file);
      expect(source, `${file} inserts into organisations`).not.toMatch(
        /INSERT\s+INTO\s+organisations/i,
      );
      expect(source, `${file} updates organisations`).not.toMatch(/UPDATE\s+organisations/i);
      expect(source, `${file} deletes from organisations`).not.toMatch(
        /DELETE\s+FROM\s+organisations/i,
      );
      expect(source, `${file} writes organisation_sources`).not.toMatch(
        /(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+organisation_sources/i,
      );
      expect(source, `${file} writes an ewp_ table`).not.toMatch(
        /(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+ewp_/i,
      );
    }
  });

  it('never assigns canonical_domain from website evidence', () => {
    // The legacy column keeps exactly the bytes Phase 1A wrote. Rewriting it
    // would destroy the record of the defect this phase exists to document.
    for (const file of PHASE_1D_FILES) {
      const source = read(file);
      expect(source, `${file} assigns canonical_domain`).not.toMatch(/canonical_domain\s*=(?!=)/);
      expect(source, `${file} builds an UPDATE of canonical_domain`).not.toMatch(
        /SET[^;]*canonical_domain/i,
      );
    }
  });

  it('never back-fills or rewrites a legacy column in a migration', () => {
    for (const { file, sql } of MIGRATIONS) {
      expect(sql, `${file} updates organisations`).not.toMatch(/^\s*UPDATE\s+organisations/im);
      expect(sql, `${file} inserts into organisations`).not.toMatch(
        /^\s*INSERT\s+INTO\s+organisations/im,
      );
      expect(sql, `${file} drops a legacy column`).not.toMatch(
        /ALTER\s+TABLE\s+organisations\s+DROP/i,
      );
    }
  });

  it('makes the claim tables append-only in the grants', () => {
    const migration = MIGRATIONS.find((m) => m.file === '0005_website_evidence.sql');
    expect(migration).toBeDefined();
    const sql = migration?.sql ?? '';
    // SELECT and INSERT only. An UPDATE or DELETE grant would make the
    // "evidence is never overwritten" claim unenforceable.
    expect(sql).toMatch(/GRANT SELECT, INSERT ON website_source_snapshots\s+TO nwf_ingest/);
    expect(sql).toMatch(/GRANT SELECT, INSERT ON website_claims\s+TO nwf_ingest/);
    expect(sql).not.toMatch(/GRANT[^;]*UPDATE[^;]*ON website_claims/i);
    expect(sql).not.toMatch(/GRANT[^;]*DELETE[^;]*ON website_claims/i);
    expect(sql).not.toMatch(/GRANT[^;]*UPDATE[^;]*ON website_source_snapshots/i);
    expect(sql).not.toMatch(/GRANT[^;]*DELETE[^;]*ON website_source_snapshots/i);
  });
});

describe('PHASE-1D-FIREWALL: claims stay claims and never become conclusions', () => {
  it('stores no verified, canonical or preferred website column', () => {
    const migration = MIGRATIONS.find((m) => m.file === '0005_website_evidence.sql');
    const sql = migration?.sql ?? '';
    // A stored conclusion would silently contradict its evidence as soon as
    // either source published a new artifact.
    expect(sql).not.toMatch(/^\s*(is_)?verified\w*\s+(boolean|text)/im);
    expect(sql).not.toMatch(/^\s*preferred_\w+\s+/im);
    expect(sql).not.toMatch(/^\s*canonical_website\w*\s+/im);
    expect(sql).not.toMatch(/^\s*official_website\w*\s+/im);
  });

  it('permits no cross-source verdict as a stored structural status', () => {
    const migration = MIGRATIONS.find((m) => m.file === '0005_website_evidence.sql');
    const chk = /website_claims_structural_status_chk[\s\S]*?\)\)/.exec(migration?.sql ?? '');
    expect(chk?.[0]).toBeDefined();
    for (const verdict of ['CORROBORATED', 'VERIFIED', 'CONFLICT', 'AGREE', 'DISAGREE']) {
      expect(chk?.[0], `structural_status permits ${verdict}`).not.toContain(verdict);
    }
  });

  // Similarity scoring and edit distance are NOT re-asserted here. The Phase 1B
  // firewall already forbids them across EVERY source file, which covers
  // src/website/ and src/ingest/fresr/ automatically, so a copy here would add
  // no coverage - and it would name those algorithms in a file that Phase 1B
  // itself scans, tripping the stronger check on its own wording.

  it('joins on an identifier, never on a domain or a name', () => {
    const ingest = read('src/ingest/fresr/ingest.ts');
    // The PIC is the only join key. Joining on a domain would assume the very
    // thing this phase measures.
    expect(ingest).toMatch(/rowKeysByPic/);
    expect(ingest).not.toMatch(/byDomain|byHostname|byName|matchByDomain/);
  });
});
