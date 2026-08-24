/**
 * ECHE source resolution.
 *
 * Origin validation, candidate discovery, and the redirect trust boundary.
 *
 * NOTHING HERE TOUCHES THE NETWORK. The fetching paths run against a stubbed
 * `fetch`, never the live Erasmus+ site, so CI is deterministic and never
 * depends on the EC being up. The stub is also the only way to assert the
 * thing that actually matters about a refused redirect: that the target was
 * NEVER REQUESTED. A live test could not prove a negative like that.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  assertOfficialPageUrl,
  assertOfficialUrl,
  ECHE_DOCUMENT_PAGE,
  extractCandidates,
  resolveFromOfficialPage,
  resolveFromUrl,
  SourceResolutionError,
} from '../../ingest/eche/source.js';

/**
 * The page candidates are resolved against is THE CONFIGURED ONE, not a copy.
 * A second literal here would keep passing after the constant moved, which is
 * exactly the failure this file exists to catch.
 */
const PAGE = ECHE_DOCUMENT_PAGE;
const REAL_PATH = '/sites/default/files/2026-08/accredited-HEIs-Erasmus-2021-2027_17082026_1.xlsx';

/** The `/document/...` URL the Commission superseded; it now answers 301. */
const SUPERSEDED_PAGE =
  'https://erasmus-plus.ec.europa.eu/document/higher-education-institutions-holding-an-eche-2021-2027';

describe('assertOfficialUrl', () => {
  it('accepts the real official file url', () => {
    const url = assertOfficialUrl(`https://erasmus-plus.ec.europa.eu${REAL_PATH}`);
    expect(url.hostname).toBe('erasmus-plus.ec.europa.eu');
  });

  it('rejects a non-official host', () => {
    expect(() => assertOfficialUrl(`https://evil.example.com${REAL_PATH}`)).toThrow(
      SourceResolutionError,
    );
  });

  it('rejects a look-alike host', () => {
    expect(() =>
      assertOfficialUrl(`https://erasmus-plus.ec.europa.eu.evil.com${REAL_PATH}`),
    ).toThrow(SourceResolutionError);
  });

  it('rejects plain http', () => {
    expect(() => assertOfficialUrl(`http://erasmus-plus.ec.europa.eu${REAL_PATH}`)).toThrow(
      /must be https/,
    );
  });

  it('rejects a path outside the approved uploads prefix', () => {
    expect(() =>
      assertOfficialUrl('https://erasmus-plus.ec.europa.eu/elsewhere/file.xlsx'),
    ).toThrow(/approved official path/);
  });

  it('rejects a non-xlsx file', () => {
    expect(() =>
      assertOfficialUrl('https://erasmus-plus.ec.europa.eu/sites/default/files/x/list.csv'),
    ).toThrow(/not an .xlsx/);
  });

  it('rejects garbage input', () => {
    expect(() => assertOfficialUrl('not-a-url')).toThrow(SourceResolutionError);
  });

  it('rejects userinfo on an otherwise official url', () => {
    // Passes the hostname check and still sends credentials. Also the classic
    // disguise: a reader skims the string and sees the official host.
    expect(() =>
      assertOfficialUrl(`https://user:secret@erasmus-plus.ec.europa.eu${REAL_PATH}`),
    ).toThrow(/userinfo/);
  });

  it('never echoes a password back into the error', () => {
    try {
      assertOfficialUrl(`https://user:hunter2@erasmus-plus.ec.europa.eu${REAL_PATH}`);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as Error).message).not.toContain('hunter2');
    }
  });

  it('rejects an explicit port on an approved host', () => {
    // An allow-listed host on an unapproved port is a different service.
    expect(() => assertOfficialUrl(`https://erasmus-plus.ec.europa.eu:8443${REAL_PATH}`)).toThrow(
      /default https port/,
    );
  });
});

describe('ECHE_DOCUMENT_PAGE', () => {
  it('is the current official Erasmus+ document page', () => {
    // Pinned deliberately. The trusted discovery origin is a security-relevant
    // constant, so moving it must be a reviewed edit rather than a silent one.
    expect(ECHE_DOCUMENT_PAGE).toBe(
      'https://erasmus-plus.ec.europa.eu/resources-and-tools/documents-and-guidelines/' +
        'higher-education-institutions-holding-an-eche-2021-2027',
    );
  });

  it('is no longer the superseded /document/ url', () => {
    // That URL answers 301 to the value above. The resolver refuses a redirect,
    // so the recovery path is this constant - never a followable hop.
    expect(ECHE_DOCUMENT_PAGE).not.toBe(SUPERSEDED_PAGE);
  });

  it('earns trust through the ordinary origin gate, with no special case', () => {
    const url = assertOfficialPageUrl(ECHE_DOCUMENT_PAGE);
    expect(url.protocol).toBe('https:');
    expect(url.hostname).toBe('erasmus-plus.ec.europa.eu');
    expect(url.port).toBe('');
    expect(url.username).toBe('');
    expect(url.password).toBe('');
  });
});

describe('assertOfficialPageUrl', () => {
  it('accepts the official document page, which is outside the uploads prefix', () => {
    expect(assertOfficialPageUrl(ECHE_DOCUMENT_PAGE).hostname).toBe('erasmus-plus.ec.europa.eu');
  });

  it('applies the same origin gate as the file url', () => {
    expect(() => assertOfficialPageUrl('https://evil.example/document/eche')).toThrow(
      /not an approved official ECHE host/,
    );
    expect(() => assertOfficialPageUrl('http://erasmus-plus.ec.europa.eu/document/eche')).toThrow(
      /must be https/,
    );
    expect(() =>
      assertOfficialPageUrl('https://u:p@erasmus-plus.ec.europa.eu/document/eche'),
    ).toThrow(/userinfo/);
  });
});

describe('extractCandidates', () => {
  it('finds the link inside the eac-download web component', () => {
    // Shape taken from the real page: the url is an attribute of a custom
    // element, not an href, so an href-only scan would miss it.
    const html = `<div class="eac-app"><eac-download title="Higher education institutions holding an ECHE - 2021-2027" url="${REAL_PATH}" language="English" variant="erasmusplus"></eac-download></div>`;
    expect(extractCandidates(html, PAGE)).toEqual([
      `https://erasmus-plus.ec.europa.eu${REAL_PATH}`,
    ]);
  });

  it('finds a plain href as a secondary strategy', () => {
    const html = `<a href="${REAL_PATH}">download</a>`;
    expect(extractCandidates(html, PAGE)).toEqual([
      `https://erasmus-plus.ec.europa.eu${REAL_PATH}`,
    ]);
  });

  it('deduplicates the same file found by both strategies', () => {
    const html = `<eac-download url="${REAL_PATH}"></eac-download><a href="${REAL_PATH}">x</a>`;
    expect(extractCandidates(html, PAGE)).toHaveLength(1);
  });

  it('ignores css and js assets under the same path prefix', () => {
    const html = `<link href="/sites/default/files/css/style.css"><script src="/sites/default/files/js/app.js"></script><eac-download url="${REAL_PATH}"></eac-download>`;
    expect(extractCandidates(html, PAGE)).toEqual([
      `https://erasmus-plus.ec.europa.eu${REAL_PATH}`,
    ]);
  });

  it('prefers the accredited-HEIs file over an unrelated spreadsheet on the page', () => {
    const html = `<eac-download url="/sites/default/files/2026-08/some-other-statistics.xlsx"></eac-download><eac-download url="${REAL_PATH}"></eac-download>`;
    expect(extractCandidates(html, PAGE)).toEqual([
      `https://erasmus-plus.ec.europa.eu${REAL_PATH}`,
    ]);
  });

  it('returns an empty list when nothing is present, so the caller can fail closed', () => {
    expect(extractCandidates('<html><body>no downloads here</body></html>', PAGE)).toEqual([]);
  });

  it('reports multiple genuine candidates so the caller can refuse to guess', () => {
    const html =
      `<eac-download url="/sites/default/files/2026-08/accredited-HEIs-a.xlsx"></eac-download>` +
      `<eac-download url="/sites/default/files/2026-08/accredited-HEIs-b.xlsx"></eac-download>`;
    expect(extractCandidates(html, PAGE)).toHaveLength(2);
  });

  it('decodes html entities in urls', () => {
    const html = `<eac-download url="/sites/default/files/x/accredited-HEIs.xlsx?a=1&amp;b=2"></eac-download>`;
    expect(extractCandidates(html, PAGE)[0]).toContain('a=1&b=2');
  });
});

// ---------------------------------------------------------------------------
// The redirect trust boundary
// ---------------------------------------------------------------------------

const OFFICIAL_FILE = `https://erasmus-plus.ec.europa.eu${REAL_PATH}`;
const HOSTILE = 'https://evil.example/sites/default/files/accredited-HEIs.xlsx';

/** A minimal ZIP container: enough to pass the magic-bytes gate. */
const XLSX_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01, 0x02, 0x03]);
const PAGE_HTML = `<eac-download url="${REAL_PATH}"></eac-download>`;

/**
 * Installs a fetch stub and returns the list of URLs it was asked for.
 *
 * THE RECORDED LIST IS THE PROOF. A refused redirect must leave exactly the
 * requests that were validated first, because the target was never requested.
 */
function stubFetch(handler: (url: string) => Response): { requested: string[] } {
  const requested: string[] = [];
  vi.stubGlobal('fetch', (input: unknown, init?: RequestInit) => {
    const url = String(input);
    requested.push(url);
    // Every fetch this module performs must refuse to follow redirects itself.
    // 'follow' - or omitting the option - hands the hop to the runtime, which
    // issues the next request before any check here can run.
    expect(init?.redirect).toBe('manual');
    return Promise.resolve(handler(url));
  });
  return { requested };
}

function xlsxOk(): Response {
  return new Response(new Uint8Array(XLSX_BYTES), {
    status: 200,
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  });
}

function pageOk(): Response {
  return new Response(PAGE_HTML, { status: 200, headers: { 'content-type': 'text/html' } });
}

function redirectTo(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('eche source: redirects are never followed', () => {
  it('a normal 200 from an official file url succeeds', async () => {
    const { requested } = stubFetch(() => xlsxOk());
    const resolved = await resolveFromUrl(OFFICIAL_FILE);

    expect(requested).toEqual([OFFICIAL_FILE]);
    expect(resolved.kind).toBe('operator_url');
    expect(resolved.fileUrl).toBe(OFFICIAL_FILE);
    expect(resolved.pageUrl).toBeNull();
    expect(resolved.sha256).toBe(createHash('sha256').update(XLSX_BYTES).digest('hex'));
  });

  it('the whole discovery path still works over two non-redirecting hops', async () => {
    const { requested } = stubFetch((url) => (url === ECHE_DOCUMENT_PAGE ? pageOk() : xlsxOk()));
    const resolved = await resolveFromOfficialPage();

    expect(requested).toEqual([ECHE_DOCUMENT_PAGE, OFFICIAL_FILE]);
    expect(resolved.kind).toBe('discovered');
    // Provenance stays split: the page it was DISCOVERED from, and the url the
    // bytes were READ from. Neither overwrites the other.
    expect(resolved.pageUrl).toBe(ECHE_DOCUMENT_PAGE);
    expect(resolved.fileUrl).toBe(OFFICIAL_FILE);
    expect(resolved.filePath).toBeNull();
    expect(resolved.sha256).toBe(createHash('sha256').update(XLSX_BYTES).digest('hex'));
  });

  it('a 302 to a hostile host fails WITHOUT requesting the target', async () => {
    const { requested } = stubFetch(() => redirectTo(HOSTILE));

    await expect(resolveFromUrl(OFFICIAL_FILE)).rejects.toThrow(SourceResolutionError);
    // THE WHOLE POINT: one request, to the validated URL. The external host was
    // never contacted, so no bytes from outside the trust boundary can exist.
    expect(requested).toEqual([OFFICIAL_FILE]);
    expect(requested.some((url) => url.includes('evil.example'))).toBe(false);
  });

  it('names the refused target and says nothing was ingested', async () => {
    stubFetch(() => redirectTo(HOSTILE));
    await expect(resolveFromUrl(OFFICIAL_FILE)).rejects.toThrow(
      /HTTP 302 redirecting to https:\/\/evil\.example/,
    );
    vi.unstubAllGlobals();
    stubFetch(() => redirectTo(HOSTILE));
    await expect(resolveFromUrl(OFFICIAL_FILE)).rejects.toThrow(/Nothing was ingested/);
  });

  it('refuses every redirect status, not just 302', async () => {
    for (const status of [301, 302, 303, 307, 308]) {
      const { requested } = stubFetch(() => redirectTo(HOSTILE, status));
      await expect(resolveFromUrl(OFFICIAL_FILE)).rejects.toThrow(
        new RegExp(`HTTP ${status} redirecting`),
      );
      expect(requested).toEqual([OFFICIAL_FILE]);
      vi.unstubAllGlobals();
    }
  });

  it('refuses an https -> http downgrade', async () => {
    const { requested } = stubFetch(() =>
      redirectTo(`http://erasmus-plus.ec.europa.eu${REAL_PATH}`),
    );
    await expect(resolveFromUrl(OFFICIAL_FILE)).rejects.toThrow(/redirecting to http:/);
    expect(requested).toEqual([OFFICIAL_FILE]);
  });

  it('refuses a redirect target carrying userinfo', async () => {
    const { requested } = stubFetch(() =>
      redirectTo(`https://user:pw@erasmus-plus.ec.europa.eu${REAL_PATH}`),
    );
    await expect(resolveFromUrl(OFFICIAL_FILE)).rejects.toThrow(/redirecting to/);
    expect(requested).toEqual([OFFICIAL_FILE]);
  });

  it('refuses a same-host redirect, and that is the documented policy', async () => {
    // Fail closed means the bytes come from the URL that was validated, full
    // stop. A same-host hop would still leave the provenance record naming a
    // URL that did not serve these bytes. The recovery path is --url or --file.
    const sameHost = 'https://erasmus-plus.ec.europa.eu/sites/default/files/2026-09/moved.xlsx';
    const { requested } = stubFetch(() => redirectTo(sameHost));
    await expect(resolveFromUrl(OFFICIAL_FILE)).rejects.toThrow(/redirecting to/);
    expect(requested).toEqual([OFFICIAL_FILE]);
  });

  it('refuses a redirect with no Location header rather than guessing one', async () => {
    const { requested } = stubFetch(() => new Response(null, { status: 302 }));
    await expect(resolveFromUrl(OFFICIAL_FILE)).rejects.toThrow(/no Location header/);
    expect(requested).toEqual([OFFICIAL_FILE]);
  });

  it('refuses a malformed Location without trying to repair it', async () => {
    const { requested } = stubFetch(() => redirectTo('ht!tp://[not a url'));
    await expect(resolveFromUrl(OFFICIAL_FILE)).rejects.toThrow(SourceResolutionError);
    expect(requested).toEqual([OFFICIAL_FILE]);
  });

  it('cannot loop: a redirect back to the same url still ends after one request', async () => {
    // There is no hop counter because there are no hops. A self-referential
    // redirect terminates deterministically at the first response.
    const { requested } = stubFetch(() => redirectTo(OFFICIAL_FILE));
    await expect(resolveFromUrl(OFFICIAL_FILE)).rejects.toThrow(/redirecting to/);
    expect(requested).toEqual([OFFICIAL_FILE]);
  });

  it('a redirecting document page stops discovery before any file is requested', async () => {
    const { requested } = stubFetch(() => redirectTo('https://evil.example/document/eche'));
    await expect(resolveFromOfficialPage()).rejects.toThrow(/redirecting to/);
    expect(requested).toEqual([ECHE_DOCUMENT_PAGE]);
  });

  it('a 301 from the document page fails closed, exactly as the superseded url did', async () => {
    // This is the live scenario that produced this constant's current value.
    // The old page answered `301 Location: /resources-and-tools/...` and the
    // resolver refused it. THE FIX WAS A REVIEWED EDIT TO THE CONSTANT, not a
    // followed hop - so when this page moves again, the same refusal must
    // happen, including for a same-host relative Location.
    const { requested } = stubFetch(() =>
      redirectTo('/resources-and-tools/documents-and-guidelines/moved-again', 301),
    );
    await expect(resolveFromOfficialPage()).rejects.toThrow(/HTTP 301 redirecting to/);
    expect(requested).toEqual([ECHE_DOCUMENT_PAGE]);
  });

  it('a redirecting file url stops discovery after the page, with no third request', async () => {
    const { requested } = stubFetch((url) =>
      url === ECHE_DOCUMENT_PAGE ? pageOk() : redirectTo(HOSTILE),
    );
    await expect(resolveFromOfficialPage()).rejects.toThrow(/redirecting to/);
    expect(requested).toEqual([ECHE_DOCUMENT_PAGE, OFFICIAL_FILE]);
  });

  it('an unapproved url is refused before any request is made at all', async () => {
    const { requested } = stubFetch(() => xlsxOk());
    for (const candidate of [
      HOSTILE,
      `http://erasmus-plus.ec.europa.eu${REAL_PATH}`,
      `https://user:pw@erasmus-plus.ec.europa.eu${REAL_PATH}`,
      `https://erasmus-plus.ec.europa.eu:8443${REAL_PATH}`,
      'https://127.0.0.1/sites/default/files/x.xlsx',
      'https://localhost/sites/default/files/x.xlsx',
    ]) {
      await expect(resolveFromUrl(candidate)).rejects.toThrow(SourceResolutionError);
    }
    expect(requested).toEqual([]);
  });

  it('the module never asks the runtime to follow a redirect', async () => {
    const { readFileSync } = await import('node:fs');
    // Comments are stripped first: this asserts a real capability, not prose.
    // A check that tripped on the word "follow" inside an explanation would
    // only train people to delete the explanation.
    const source = readFileSync('src/ingest/eche/source.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(source).not.toMatch(/redirect\s*:\s*['"](follow|error)['"]/);
    // One fetch call site, so there is one place the policy can be changed.
    const fetchCalls = source.match(/\bfetch\s*\(/g) ?? [];
    expect(fetchCalls).toHaveLength(1);
    expect(source).toMatch(/redirect:\s*'manual'/);
  });
});
