/**
 * BOUNDED SITEMAP DISCOVERY: PURE XML parsing, plus a bounded recursive walk
 * over an INJECTED document fetcher - never a second network location.
 *
 * DISCOVERY ORDER (spec "sitemap discovery order"):
 *
 *   1. `Sitemap:` directives observed in the host's own robots.txt
 *      (`EvaluatedRobotsPolicy.sitemapUrls`, added narrowly to
 *      `robotsPolicy.ts` for exactly this purpose - metadata only, never an
 *      access-control rule).
 *   2. the conventional `/sitemap.xml` fallback, ONLY when robots.txt named
 *      none.
 *
 * No search, no guessed alternative names.
 *
 * TRUST BOUNDARY: every candidate sitemap URL - from robots.txt or from the
 * conventional fallback - passes the caller-supplied `admissible` check
 * (the SAME root-scope/host/URL gates any other discovered URL must pass)
 * before it is ever handed to `fetchDocument`. An off-domain `Sitemap:`
 * value is silently discarded here - no request, no promotion, no exception.
 *
 * NETWORK-FREE BY CONSTRUCTION: this module owns no socket, calls no fetch
 * primitive of its own, and imports no node:net/tls/http/https/dns. Every document
 * fetch happens through the caller-injected `fetchDocument`, which the
 * orchestrator (`orchestrator/rootRunner.ts`) implements ON TOP OF
 * `authoriseAndFetchPage` (`robots.ts`) - the one production caller of the
 * one gateway - so a sitemap document fetch is authorised, robots-governed,
 * paced and budget-accounted exactly like any other page request.
 *
 * BOUNDED, NAMED LIMITS (constants.ts): at most
 * MAX_SITEMAP_DOCUMENTS_PER_ROOT documents are fetched, recursion stops at
 * MAX_SITEMAP_DEPTH, and at most MAX_SITEMAP_URLS_PER_ROOT <loc> URLs are
 * accepted, across the whole tree, per root. A cyclic sitemap graph
 * terminates deterministically because every sitemap DOCUMENT url is deduped.
 *
 * SAFETY: requires the fetcher to report a genuine 2xx body and a supported
 * `urlset`/`sitemapindex` representation. No HTML page is EVER parsed as a
 * sitemap merely because its URL ends in `sitemap.xml`: an unparseable or
 * non-sitemap body returns `unsupported` and this module continues safely
 * rather than throwing. No `.xml.gz` support is implemented - not measured,
 * not silently invented; the caller-supplied fetcher reports such a document
 * as unusable and this module treats it as `unsupported`. No raw sitemap
 * body is ever retained past parsing; only the extracted `<loc>` URLs
 * survive.
 *
 * PURE PARSING (`parseSitemapXml`); the walk itself is orchestration over an
 * injected capability, exactly the shape `gateway.ts`'s `WebTransport` seam
 * and `robots.ts`'s transport parameter already use.
 */
import { SaxesParser } from 'saxes';
import {
  MAX_SITEMAP_DEPTH,
  MAX_SITEMAP_DOCUMENTS_PER_ROOT,
  MAX_SITEMAP_URLS_PER_ROOT,
} from './orchestrator/constants.js';

export type ParsedSitemapKind = 'urlset' | 'sitemapindex' | 'unsupported';

export interface ParsedSitemap {
  readonly kind: ParsedSitemapKind;
  /** <loc> URLs: page URLs for a urlset, child sitemap URLs for a sitemapindex. Always empty for `unsupported`. */
  readonly locs: readonly string[];
}

/**
 * Parses one sitemap document body as EITHER a `urlset` or a `sitemapindex`
 * (the only two structures this module supports), ignoring `priority`,
 * `changefreq` and `lastmod` entirely - they never influence ranking here.
 *
 * Uses the same streaming SAX parser (`saxes`) already a runtime dependency
 * for the EWP catalogue, rather than a second XML library. Malformed XML, or
 * a document that is neither a `urlset` nor a `sitemapindex` (an HTML error
 * page served at a sitemap URL, for instance), returns `{ kind: 'unsupported',
 * locs: [] }` rather than throwing - a bounded discovery step must degrade
 * safely, never abort the run.
 *
 * PURE. No network, no filesystem, no clock.
 */
export function parseSitemapXml(body: string): ParsedSitemap {
  const parser = new SaxesParser();
  const locs: string[] = [];
  let root: 'urlset' | 'sitemapindex' | null = null;
  let inLoc = false;
  let locText = '';
  let malformed = false;

  parser.on('error', () => {
    malformed = true;
  });
  parser.on('opentag', (node) => {
    const name = localName(node.name);
    if (root === null && (name === 'urlset' || name === 'sitemapindex')) {
      root = name;
      return;
    }
    if (name === 'loc') {
      inLoc = true;
      locText = '';
    }
  });
  parser.on('text', (text) => {
    if (inLoc) locText += text;
  });
  parser.on('closetag', (node) => {
    if (localName(node.name) === 'loc' && inLoc) {
      inLoc = false;
      const value = locText.trim();
      if (value !== '') locs.push(value);
    }
  });

  try {
    parser.write(body);
    parser.close();
  } catch {
    malformed = true;
  }

  if (malformed || root === null) return { kind: 'unsupported', locs: [] };
  return { kind: root, locs };
}

/** Strips a namespace prefix (`ns:loc` -> `loc`), so a namespaced sitemap document still parses. */
function localName(qualified: string): string {
  const colon = qualified.indexOf(':');
  return (colon === -1 ? qualified : qualified.slice(colon + 1)).toLowerCase();
}

export type SitemapFetchOutcome =
  { ok: true; body: string; contentType: string | null } | { ok: false };

/** The one capability this module needs from its caller: fetch one document URL, authorised and accounted for exactly like any other page. */
export type SitemapDocumentFetcher = (url: string) => Promise<SitemapFetchOutcome>;

export interface DiscoveredSitemapUrl {
  readonly url: string;
}

export interface SitemapDiscoveryResult {
  readonly pageUrls: DiscoveredSitemapUrl[];
  readonly documentsFetched: number;
  readonly documentsRefusedOffScope: number;
  readonly depthCapped: boolean;
  readonly documentCapped: boolean;
  readonly urlCapped: boolean;
}

/**
 * Fetches (via the injected `fetchDocument`) and recursively expands a
 * bounded sitemap tree starting from `seedUrls`, returning the accepted page
 * URLs.
 */
export async function discoverSitemapUrls(
  seedUrls: readonly string[],
  admissible: (candidateUrl: string) => boolean,
  fetchDocument: SitemapDocumentFetcher,
): Promise<SitemapDiscoveryResult> {
  const pageUrls: DiscoveredSitemapUrl[] = [];
  const seenDocuments = new Set<string>();
  const seenPages = new Set<string>();
  let documentsFetched = 0;
  let documentsRefusedOffScope = 0;
  let depthCapped = false;
  let documentCapped = false;
  let urlCapped = false;

  // depth 0 = the seed documents themselves.
  let frontier: { url: string; depth: number }[] = seedUrls
    .filter((url) => !seenDocuments.has(url))
    .map((url) => {
      seenDocuments.add(url);
      return { url, depth: 0 };
    });

  while (frontier.length > 0) {
    const next: { url: string; depth: number }[] = [];
    for (const { url, depth } of frontier) {
      if (pageUrls.length >= MAX_SITEMAP_URLS_PER_ROOT) {
        urlCapped = true;
        break;
      }
      if (documentsFetched >= MAX_SITEMAP_DOCUMENTS_PER_ROOT) {
        documentCapped = true;
        break;
      }
      if (!admissible(url)) {
        documentsRefusedOffScope += 1;
        continue;
      }

      const outcome = await fetchDocument(url);
      documentsFetched += 1;
      if (!outcome.ok) continue;

      const contentType = outcome.contentType?.toLowerCase() ?? '';
      if (contentType.includes('gzip') || url.toLowerCase().endsWith('.gz')) {
        // File-level gzip sitemaps are NOT implemented - no ADR established
        // support for them, and inventing it silently is refused (spec
        // "sitemap body safety"). Content-Encoding: gzip is already
        // transparently decoded by the gateway; this branch is only reached
        // for an actual .xml.gz FILE, which this module reports unsupported.
        continue;
      }

      const parsed = parseSitemapXml(outcome.body);
      if (parsed.kind === 'unsupported') continue;

      if (parsed.kind === 'sitemapindex') {
        if (depth >= MAX_SITEMAP_DEPTH) {
          depthCapped = true;
          continue;
        }
        for (const loc of parsed.locs) {
          if (seenDocuments.has(loc)) continue;
          seenDocuments.add(loc);
          next.push({ url: loc, depth: depth + 1 });
        }
        continue;
      }

      // urlset
      for (const loc of parsed.locs) {
        if (pageUrls.length >= MAX_SITEMAP_URLS_PER_ROOT) {
          urlCapped = true;
          break;
        }
        if (seenPages.has(loc)) continue;
        seenPages.add(loc);
        pageUrls.push({ url: loc });
      }
    }
    frontier = next;
  }

  return {
    pageUrls,
    documentsFetched,
    documentsRefusedOffScope,
    depthCapped,
    documentCapped,
    urlCapped,
  };
}

/** A sentinel the orchestrator's fetcher may return (as the `false` branch identity) to mean "no budget remained" rather than "this one document failed" - purely advisory, since either way this module stops accepting more documents once the fetcher starts refusing. */
export const BUDGET_EXHAUSTED_MARKER: SitemapFetchOutcome = Object.freeze({ ok: false });

/** The conventional fallback path, used ONLY when robots.txt named no `Sitemap:` directive. */
export function conventionalSitemapUrl(rootUrl: string): string {
  const parsed = new URL(rootUrl);
  return `${parsed.protocol}//${parsed.hostname}/sitemap.xml`;
}
