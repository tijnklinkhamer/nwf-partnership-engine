import { describe, expect, it } from 'vitest';
import {
  conventionalSitemapUrl,
  discoverSitemapUrls,
  parseSitemapXml,
  type SitemapDocumentFetcher,
} from '../../orgunits/sitemap.js';
import {
  MAX_SITEMAP_DEPTH,
  MAX_SITEMAP_DOCUMENTS_PER_ROOT,
  MAX_SITEMAP_URLS_PER_ROOT,
} from '../../orgunits/orchestrator/constants.js';

describe('parseSitemapXml', () => {
  it('parses a urlset into its <loc> URLs', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://example.edu/a</loc></url>
        <url><loc>https://example.edu/b</loc><lastmod>2026-01-01</lastmod></url>
      </urlset>`;
    const result = parseSitemapXml(xml);
    expect(result.kind).toBe('urlset');
    expect(result.locs).toEqual(['https://example.edu/a', 'https://example.edu/b']);
  });

  it('parses a sitemapindex into its child sitemap URLs', () => {
    const xml = `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://example.edu/sitemap-1.xml</loc></sitemap>
      <sitemap><loc>https://example.edu/sitemap-2.xml</loc></sitemap>
    </sitemapindex>`;
    const result = parseSitemapXml(xml);
    expect(result.kind).toBe('sitemapindex');
    expect(result.locs).toEqual([
      'https://example.edu/sitemap-1.xml',
      'https://example.edu/sitemap-2.xml',
    ]);
  });

  it('ignores priority/changefreq/lastmod entirely', () => {
    const xml = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://example.edu/a</loc><priority>0.9</priority><changefreq>daily</changefreq></url>
    </urlset>`;
    const result = parseSitemapXml(xml);
    expect(result.locs).toEqual(['https://example.edu/a']);
  });

  it('reports unsupported for malformed XML rather than throwing', () => {
    expect(() => parseSitemapXml('<urlset><url><loc>unterminated')).not.toThrow();
    const result = parseSitemapXml('<urlset><url><loc>unterminated');
    expect(result.kind).toBe('unsupported');
    expect(result.locs).toEqual([]);
  });

  it('reports unsupported for a well-formed document that is neither urlset nor sitemapindex (an HTML error page)', () => {
    const result = parseSitemapXml('<html><body>404 not found</body></html>');
    expect(result.kind).toBe('unsupported');
    expect(result.locs).toEqual([]);
  });

  it('strips a namespace prefix so a namespaced document still parses', () => {
    const xml = `<ns:urlset xmlns:ns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <ns:url><ns:loc>https://example.edu/a</ns:loc></ns:url>
    </ns:urlset>`;
    const result = parseSitemapXml(xml);
    expect(result.kind).toBe('urlset');
    expect(result.locs).toEqual(['https://example.edu/a']);
  });
});

describe('conventionalSitemapUrl', () => {
  it('builds the apex /sitemap.xml URL for the root', () => {
    expect(conventionalSitemapUrl('https://www.example.edu/international/')).toBe(
      'https://www.example.edu/sitemap.xml',
    );
  });
});

function fetcherFromMap(
  documents: Record<
    string,
    { kind: 'urlset' | 'sitemapindex'; locs: string[] } | 'unsupported' | 'fail'
  >,
): SitemapDocumentFetcher {
  return async (url: string) => {
    const doc = documents[url];
    if (doc === undefined || doc === 'fail') return { ok: false };
    if (doc === 'unsupported')
      return { ok: true, body: '<html>not a sitemap</html>', contentType: 'text/html' };
    const body =
      doc.kind === 'urlset'
        ? `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${doc.locs
            .map((l) => `<url><loc>${l}</loc></url>`)
            .join('')}</urlset>`
        : `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${doc.locs
            .map((l) => `<sitemap><loc>${l}</loc></sitemap>`)
            .join('')}</sitemapindex>`;
    return { ok: true, body, contentType: 'application/xml' };
  };
}

const alwaysAdmissible = (): boolean => true;

describe('discoverSitemapUrls', () => {
  it('accepts URLs from a single urlset document', async () => {
    const fetcher = fetcherFromMap({
      'https://example.edu/sitemap.xml': {
        kind: 'urlset',
        locs: ['https://example.edu/a', 'https://example.edu/b'],
      },
    });
    const result = await discoverSitemapUrls(
      ['https://example.edu/sitemap.xml'],
      alwaysAdmissible,
      fetcher,
    );
    expect(result.pageUrls.map((p) => p.url)).toEqual([
      'https://example.edu/a',
      'https://example.edu/b',
    ]);
    expect(result.documentsFetched).toBe(1);
  });

  it('recurses into a sitemapindex up to MAX_SITEMAP_DEPTH', async () => {
    // depth 0 = index; depth 1 = child index; depth 2 = leaf urlset (still within cap).
    const fetcher = fetcherFromMap({
      'https://example.edu/sitemap.xml': {
        kind: 'sitemapindex',
        locs: ['https://example.edu/idx-1.xml'],
      },
      'https://example.edu/idx-1.xml': {
        kind: 'sitemapindex',
        locs: ['https://example.edu/leaf.xml'],
      },
      'https://example.edu/leaf.xml': { kind: 'urlset', locs: ['https://example.edu/page'] },
    });
    const result = await discoverSitemapUrls(
      ['https://example.edu/sitemap.xml'],
      alwaysAdmissible,
      fetcher,
    );
    expect(result.pageUrls.map((p) => p.url)).toEqual(['https://example.edu/page']);
    expect(result.depthCapped).toBe(false);
  });

  it('stops recursing past MAX_SITEMAP_DEPTH and reports depthCapped', async () => {
    expect(MAX_SITEMAP_DEPTH).toBe(2);
    // depth 0 index -> depth 1 index -> depth 2 index (its children would be depth 3, refused).
    const fetcher = fetcherFromMap({
      'https://example.edu/l0.xml': { kind: 'sitemapindex', locs: ['https://example.edu/l1.xml'] },
      'https://example.edu/l1.xml': { kind: 'sitemapindex', locs: ['https://example.edu/l2.xml'] },
      'https://example.edu/l2.xml': { kind: 'sitemapindex', locs: ['https://example.edu/l3.xml'] },
      'https://example.edu/l3.xml': { kind: 'urlset', locs: ['https://example.edu/never-reached'] },
    });
    const result = await discoverSitemapUrls(
      ['https://example.edu/l0.xml'],
      alwaysAdmissible,
      fetcher,
    );
    expect(result.pageUrls).toEqual([]);
    expect(result.depthCapped).toBe(true);
  });

  it('stops fetching after MAX_SITEMAP_DOCUMENTS_PER_ROOT documents', async () => {
    const seeds = Array.from(
      { length: MAX_SITEMAP_DOCUMENTS_PER_ROOT + 3 },
      (_, i) => `https://example.edu/s${i}.xml`,
    );
    const documents: Record<string, { kind: 'urlset'; locs: string[] }> = {};
    for (const seed of seeds) documents[seed] = { kind: 'urlset', locs: [`${seed}-page`] };
    const fetcher = fetcherFromMap(documents);
    const result = await discoverSitemapUrls(seeds, alwaysAdmissible, fetcher);
    expect(result.documentsFetched).toBeLessThanOrEqual(MAX_SITEMAP_DOCUMENTS_PER_ROOT);
    expect(result.documentCapped).toBe(true);
  });

  it('stops accepting URLs once MAX_SITEMAP_URLS_PER_ROOT is reached', async () => {
    const manyUrls = Array.from(
      { length: MAX_SITEMAP_URLS_PER_ROOT + 100 },
      (_, i) => `https://example.edu/p${i}`,
    );
    const fetcher = fetcherFromMap({
      'https://example.edu/sitemap.xml': { kind: 'urlset', locs: manyUrls },
    });
    const result = await discoverSitemapUrls(
      ['https://example.edu/sitemap.xml'],
      alwaysAdmissible,
      fetcher,
    );
    expect(result.pageUrls.length).toBe(MAX_SITEMAP_URLS_PER_ROOT);
    expect(result.urlCapped).toBe(true);
  });

  it('discards an off-domain seed URL without ever calling the fetcher', async () => {
    let called = false;
    const fetcher: SitemapDocumentFetcher = async () => {
      called = true;
      return { ok: false };
    };
    const admissible = (url: string): boolean => url.includes('example.edu');
    const result = await discoverSitemapUrls(
      ['https://evil.example.org/sitemap.xml'],
      admissible,
      fetcher,
    );
    expect(called).toBe(false);
    expect(result.documentsRefusedOffScope).toBe(1);
    expect(result.pageUrls).toEqual([]);
  });

  it('deduplicates the same sitemap document URL, terminating a cyclic sitemap graph', async () => {
    const fetcher = fetcherFromMap({
      'https://example.edu/a.xml': { kind: 'sitemapindex', locs: ['https://example.edu/b.xml'] },
      'https://example.edu/b.xml': { kind: 'sitemapindex', locs: ['https://example.edu/a.xml'] }, // cycle back to a
    });
    const result = await discoverSitemapUrls(
      ['https://example.edu/a.xml'],
      alwaysAdmissible,
      fetcher,
    );
    // Terminates (this await resolves at all) rather than looping forever.
    expect(result.documentsFetched).toBeGreaterThan(0);
  });

  it('an HTML page served at a sitemap URL is reported unsupported, not parsed as a sitemap', async () => {
    const fetcher = fetcherFromMap({ 'https://example.edu/sitemap.xml': 'unsupported' });
    const result = await discoverSitemapUrls(
      ['https://example.edu/sitemap.xml'],
      alwaysAdmissible,
      fetcher,
    );
    expect(result.pageUrls).toEqual([]);
  });

  it('deduplicates repeated <loc> page URLs across sitemap documents', async () => {
    const fetcher = fetcherFromMap({
      'https://example.edu/idx.xml': {
        kind: 'sitemapindex',
        locs: ['https://example.edu/s1.xml', 'https://example.edu/s2.xml'],
      },
      'https://example.edu/s1.xml': { kind: 'urlset', locs: ['https://example.edu/shared'] },
      'https://example.edu/s2.xml': { kind: 'urlset', locs: ['https://example.edu/shared'] },
    });
    const result = await discoverSitemapUrls(
      ['https://example.edu/idx.xml'],
      alwaysAdmissible,
      fetcher,
    );
    expect(result.pageUrls).toEqual([{ url: 'https://example.edu/shared' }]);
  });
});
