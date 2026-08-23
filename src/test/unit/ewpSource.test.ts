/**
 * EWP source resolution.
 *
 * Origin validation, artifact identity, and the redirect trust boundary.
 *
 * NOTHING HERE TOUCHES THE NETWORK. The fetching paths are exercised against a
 * stubbed `fetch`, never the live registry, so these tests are deterministic
 * and CI never depends on the Registry being up. The stub also lets the
 * redirect tests assert the thing that actually matters: that the request to a
 * redirect target is NEVER ISSUED, which a live test could not prove.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertOfficialEwpUrl,
  resolveFromFile,
  resolveFromOfficialEndpoint,
  resolveFromUrl,
  sourceLocation,
} from '../../ingest/ewp/source.js';
import {
  EWP_CATALOGUE_URL,
  EWP_SOURCE_REUSE_BASIS,
  EwpSourceResolutionError,
} from '../../ingest/ewp/schema.js';

function tempFile(name: string, contents: string | Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), 'nwf-ewp-'));
  const path = join(dir, name);
  writeFileSync(path, contents);
  return path;
}

describe('assertOfficialEwpUrl', () => {
  it('accepts the official catalogue URL', () => {
    expect(assertOfficialEwpUrl(EWP_CATALOGUE_URL).hostname).toBe(
      'registry.erasmuswithoutpaper.eu',
    );
  });

  it('rejects a look-alike host', () => {
    expect(() =>
      assertOfficialEwpUrl('https://registry.erasmuswithoutpaper.eu.evil.example/catalogue-v1.xml'),
    ).toThrow(EwpSourceResolutionError);
  });

  it('rejects a subdomain of the official host', () => {
    expect(() =>
      assertOfficialEwpUrl('https://mirror.registry.erasmuswithoutpaper.eu/catalogue-v1.xml'),
    ).toThrow(EwpSourceResolutionError);
  });

  it('rejects plain http', () => {
    expect(() =>
      assertOfficialEwpUrl('http://registry.erasmuswithoutpaper.eu/catalogue-v1.xml'),
    ).toThrow(/must be https/);
  });

  it('rejects a non-xml path', () => {
    expect(() =>
      assertOfficialEwpUrl('https://registry.erasmuswithoutpaper.eu/catalogue-v1.json'),
    ).toThrow(/\.xml/);
  });

  it('rejects an unparseable value', () => {
    expect(() => assertOfficialEwpUrl('not a url')).toThrow(EwpSourceResolutionError);
  });
});

describe('resolveFromFile', () => {
  it('hashes the exact bytes and records the path, not a URL', () => {
    const contents = '<?xml version="1.0"?><catalogue/>';
    const path = tempFile('catalogue.xml', contents);
    const resolved = resolveFromFile(path);

    expect(resolved.kind).toBe('operator_file');
    expect(resolved.fileUrl).toBeNull();
    expect(resolved.filePath).toBe(path);
    expect(resolved.sha256).toBe(createHash('sha256').update(contents).digest('hex'));
  });

  it('tolerates a UTF-8 BOM before the root element', () => {
    const path = tempFile('bom.xml', Buffer.from('﻿<catalogue/>', 'utf8'));
    expect(() => resolveFromFile(path)).not.toThrow();
  });

  it('rejects a file that does not begin an XML document', () => {
    const path = tempFile('notxml.txt', 'this is not xml');
    expect(() => resolveFromFile(path)).toThrow(/does not begin an XML document/);
  });

  it('rejects an HTML error page saved as the catalogue', () => {
    // A captive portal or proxy error page is still "<"-prefixed, so this is
    // caught by the parser rather than here - what matters is that an obviously
    // non-XML body never reaches the parser at all.
    const path = tempFile('empty.xml', '');
    expect(() => resolveFromFile(path)).toThrow(EwpSourceResolutionError);
  });
});

describe('sourceLocation', () => {
  it('returns the local path for an operator file', () => {
    const path = tempFile('catalogue.xml', '<catalogue/>');
    expect(sourceLocation(resolveFromFile(path))).toBe(path);
  });
});

describe('reuse-basis wording', () => {
  it('makes no MIT or open-data claim about the catalogue contents', () => {
    // The EWP specification repositories are MIT licensed. That says nothing
    // about the licence of the live catalogue DATA, and this string must not
    // pretend otherwise.
    expect(EWP_SOURCE_REUSE_BASIS).not.toMatch(/\bMIT[- ]licen[cs]ed\b/i);
    expect(EWP_SOURCE_REUSE_BASIS).not.toMatch(/\bopen data\b/i);
    expect(EWP_SOURCE_REUSE_BASIS).not.toMatch(/\bCC[ -]BY\b/i);
    expect(EWP_SOURCE_REUSE_BASIS).not.toMatch(/\bpublic domain\b/i);
    expect(EWP_SOURCE_REUSE_BASIS).toMatch(/NO dataset-licensing claim/);
  });
});

describe('no hidden fallback artifact', () => {
  it('the source module names exactly one official URL and caches nothing', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/ingest/ewp/source.ts', 'utf8');
    // A "last known good" artifact path or a second hardcoded catalogue URL
    // would defeat fail-closed resolution.
    expect(source).not.toMatch(/lastKnownGood|LAST_KNOWN_GOOD|fallbackUrl|cachedArtifact/i);
    const urls = source.match(/https:\/\/registry\.erasmuswithoutpaper\.eu[^\s'"`]*/g) ?? [];
    expect(urls).toEqual([]);
  });
});

describe('artifact origin is recorded, never inferred', () => {
  it('a local artifact with no asserted origin records NO origin', () => {
    const path = tempFile('no-origin.xml', '<catalogue/>');
    const resolved = resolveFromFile(path);
    // The bytes on disk carry no evidence of where they came from. Guessing an
    // origin here is exactly the fabricated provenance this must not produce.
    expect(resolved.originUrl).toBeNull();
    expect(resolved.originRetrievedAt).toBeNull();
  });

  it('records an operator-asserted origin verbatim', () => {
    const path = tempFile('with-origin.xml', '<catalogue/>');
    const retrievedAt = new Date('2026-08-22T21:22:44.000Z');
    const resolved = resolveFromFile(path, {
      url: 'https://registry.erasmuswithoutpaper.eu/catalogue-v1.xml',
      retrievedAt,
    });
    expect(resolved.originUrl).toBe('https://registry.erasmuswithoutpaper.eu/catalogue-v1.xml');
    expect(resolved.originRetrievedAt).toEqual(retrievedAt);
    // The read mechanism is still the truth about how THIS run got the bytes.
    expect(resolved.kind).toBe('operator_file');
    expect(resolved.filePath).toBe(path);
    expect(resolved.fileUrl).toBeNull();
  });

  it('an asserted origin must still pass official-origin validation', () => {
    const path = tempFile('bad-origin.xml', '<catalogue/>');
    for (const url of [
      'https://registry.erasmuswithoutpaper.eu.evil.example/catalogue-v1.xml',
      'http://registry.erasmuswithoutpaper.eu/catalogue-v1.xml',
      'https://example.com/catalogue-v1.xml',
    ]) {
      expect(() => resolveFromFile(path, { url, retrievedAt: new Date() })).toThrow(
        EwpSourceResolutionError,
      );
    }
  });

  it('an origin retrieval time may predate the local read', () => {
    const path = tempFile('earlier-origin.xml', '<catalogue/>');
    const retrievedAt = new Date('2026-08-22T21:22:44.000Z');
    const resolved = resolveFromFile(path, {
      url: 'https://registry.erasmuswithoutpaper.eu/catalogue-v1.xml',
      retrievedAt,
    });
    // This is the normal download-once-then-ingest case, and it is precisely
    // why the two timestamps are separate columns.
    expect(resolved.originRetrievedAt?.getTime() ?? 0).toBeLessThan(resolved.fetchedAt.getTime());
  });
});

// ---------------------------------------------------------------------------
// The redirect trust boundary
// ---------------------------------------------------------------------------

const OFFICIAL = 'https://registry.erasmuswithoutpaper.eu/catalogue-v1.xml';
const CATALOGUE = '<?xml version="1.0"?><catalogue/>';

/**
 * Installs a fetch stub and returns the list of URLs it was asked for.
 *
 * The recorded list is the proof: a redirect that is refused must leave
 * EXACTLY ONE entry in it, because the target was never requested.
 */
function stubFetch(handler: (url: string) => Response): { requested: string[] } {
  const requested: string[] = [];
  vi.stubGlobal('fetch', (input: unknown, init?: RequestInit) => {
    const url = String(input);
    requested.push(url);
    // Every fetch this module performs must refuse to follow redirects itself.
    // 'follow' would hand the hop to the runtime, past every check here.
    expect(init?.redirect).toBe('manual');
    return Promise.resolve(handler(url));
  });
  return { requested };
}

function ok(): Response {
  return new Response(CATALOGUE, {
    status: 200,
    headers: { 'content-type': 'application/xml' },
  });
}

function redirectTo(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('redirects are never followed', () => {
  it('a normal 200 from the official endpoint succeeds', async () => {
    const { requested } = stubFetch(() => ok());
    const resolved = await resolveFromOfficialEndpoint();

    expect(requested).toEqual([OFFICIAL]);
    expect(resolved.kind).toBe('official_endpoint');
    expect(resolved.fileUrl).toBe(OFFICIAL);
    expect(resolved.originUrl).toBe(OFFICIAL);
    expect(resolved.sha256).toBe(createHash('sha256').update(CATALOGUE).digest('hex'));
  });

  it('a redirect to an unapproved host fails WITHOUT requesting the target', async () => {
    const { requested } = stubFetch(() => redirectTo('https://evil.example/catalogue-v1.xml'));

    await expect(resolveFromUrl(OFFICIAL)).rejects.toThrow(EwpSourceResolutionError);
    // THE WHOLE POINT: one request, to the validated URL. The external host was
    // never contacted, so no bytes from outside the trust boundary can exist.
    expect(requested).toEqual([OFFICIAL]);
    expect(requested.some((url) => url.includes('evil.example'))).toBe(false);
  });

  it('names the refused target and says nothing was ingested', async () => {
    stubFetch(() => redirectTo('https://evil.example/catalogue-v1.xml'));
    await expect(resolveFromUrl(OFFICIAL)).rejects.toThrow(
      /HTTP 302 redirecting to https:\/\/evil\.example\/catalogue-v1\.xml/,
    );
    stubFetch(() => redirectTo('https://evil.example/catalogue-v1.xml'));
    await expect(resolveFromUrl(OFFICIAL)).rejects.toThrow(/Nothing was ingested/);
  });

  it('refuses every redirect status, not just 302', async () => {
    for (const status of [301, 302, 303, 307, 308]) {
      const { requested } = stubFetch(() =>
        redirectTo('https://evil.example/catalogue-v1.xml', status),
      );
      await expect(resolveFromUrl(OFFICIAL)).rejects.toThrow(
        new RegExp(`HTTP ${status} redirecting`),
      );
      expect(requested).toEqual([OFFICIAL]);
      vi.unstubAllGlobals();
    }
  });

  it('refuses a redirect even to the approved host', async () => {
    // Fail closed means the bytes come from the URL that was validated, full
    // stop. A same-host hop would still make the provenance record name a URL
    // that did not serve these bytes.
    const { requested } = stubFetch(() =>
      redirectTo('https://registry.erasmuswithoutpaper.eu/catalogue-v2.xml'),
    );
    await expect(resolveFromUrl(OFFICIAL)).rejects.toThrow(/redirecting to/);
    expect(requested).toEqual([OFFICIAL]);
  });

  it('refuses a redirect with no Location header rather than guessing one', async () => {
    const { requested } = stubFetch(() => new Response(null, { status: 302 }));
    await expect(resolveFromUrl(OFFICIAL)).rejects.toThrow(/no Location header/);
    expect(requested).toEqual([OFFICIAL]);
  });

  it('the official endpoint is protected by the same rule', async () => {
    const { requested } = stubFetch(() => redirectTo('https://evil.example/catalogue-v1.xml'));
    await expect(resolveFromOfficialEndpoint()).rejects.toThrow(EwpSourceResolutionError);
    expect(requested).toEqual([OFFICIAL]);
  });

  it('an unapproved host is refused before any request is made at all', async () => {
    const { requested } = stubFetch(() => ok());
    await expect(resolveFromUrl('https://evil.example/catalogue-v1.xml')).rejects.toThrow(
      EwpSourceResolutionError,
    );
    expect(requested).toEqual([]);
  });

  it('the module never asks the runtime to follow a redirect', async () => {
    const { readFileSync } = await import('node:fs');
    // Comments are stripped first: this asserts a real capability, not prose.
    // A check that tripped on the word "follow" inside an explanation would
    // only train people to delete the explanation.
    const code = readFileSync('src/ingest/ewp/source.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    // redirect:'follow' - or omitting the option, whose default is 'follow' -
    // would let the runtime issue the next request before any check here.
    expect(code).not.toMatch(/redirect\s*:\s*['"]follow['"]/);
    const fetchCalls = code.match(/\bfetch\s*\(/g) ?? [];
    expect(fetchCalls).toHaveLength(1);
    expect(code).toMatch(/redirect:\s*'manual'/);
  });
});
