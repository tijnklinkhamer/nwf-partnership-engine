/**
 * French Ministry register source resolution.
 *
 * Origin validation, artifact identity, and the redirect trust boundary.
 *
 * NOTHING HERE TOUCHES THE NETWORK. The fetching paths run against a stubbed
 * `fetch`, so CI never depends on the register being up. The stub is also the
 * only way to assert the thing that actually matters about redirects: that the
 * request to the target is NEVER ISSUED. A live test could not prove that.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertOfficialFresrUrl,
  resolveFromFile,
  resolveFromOfficialEndpoint,
  resolveFromUrl,
  sourceLocation,
} from '../../ingest/fresr/source.js';
import {
  FRESR_ALLOWED_HOSTS,
  FRESR_EXPORT_URL,
  FRESR_PUBLICATION_URL,
  FRESR_SELECTED_FIELDS,
  FresrSourceResolutionError,
} from '../../ingest/fresr/schema.js';

function tempFile(name: string, contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'nwf-fresr-'));
  const path = join(dir, name);
  writeFileSync(path, contents);
  return path;
}

function jsonResponse(
  body: string,
  init: { status?: number; contentType?: string } = {},
): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { 'content-type': init.contentType ?? 'application/json; charset=utf-8' },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fresr source: the host and dataset allow-list', () => {
  it('permits exactly one host', () => {
    expect([...FRESR_ALLOWED_HOSTS]).toEqual(['data.enseignementsup-recherche.gouv.fr']);
  });

  it('accepts the official export endpoint', () => {
    expect(assertOfficialFresrUrl(FRESR_EXPORT_URL).hostname).toBe(
      'data.enseignementsup-recherche.gouv.fr',
    );
  });

  it.each([
    'https://data.enseignementsup-recherche.gouv.fr.evil.example/api/x',
    'https://evil.example/api/explore/v2.1/catalog/datasets/x/exports/json',
    'https://data.enseignementsup-recherche.gouv.fr.co/api/x',
  ])('rejects the look-alike host in %s', (url) => {
    expect(() => assertOfficialFresrUrl(url)).toThrow(FresrSourceResolutionError);
  });

  it('rejects plain http', () => {
    expect(() =>
      assertOfficialFresrUrl(
        'http://data.enseignementsup-recherche.gouv.fr/api/explore/v2.1/catalog/datasets/fr-esr-principaux-etablissements-enseignement-superieur/exports/json',
      ),
    ).toThrow(/must be https/);
  });

  it('rejects ANOTHER DATASET on the approved host', () => {
    // The host publishes hundreds of datasets. Phase 1D is approved for one,
    // so host validation alone is not enough.
    expect(() =>
      assertOfficialFresrUrl(
        'https://data.enseignementsup-recherche.gouv.fr/api/explore/v2.1/catalog/datasets/fr-esr-some-other-dataset/exports/json',
      ),
    ).toThrow(/not an endpoint of the approved dataset/);
  });

  it('rejects a non-API path on the approved host', () => {
    expect(() => assertOfficialFresrUrl(FRESR_PUBLICATION_URL)).toThrow(
      /not an endpoint of the approved dataset/,
    );
  });
});

describe('fresr source: the request asks for FIVE fields and no others', () => {
  it('names exactly the fields Phase 1D uses', () => {
    expect([...FRESR_SELECTED_FIELDS]).toEqual([
      'etablissement_id_paysage',
      'uo_lib',
      'uai',
      'identifiant_pic',
      'url',
    ]);
  });

  it('bakes the field selection into the endpoint URL', () => {
    // Narrowing AT THE SERVER is what guarantees a contact column is never
    // transmitted to this process at all - a stronger property than filtering
    // after download.
    const url = new URL(FRESR_EXPORT_URL);
    expect(url.searchParams.get('select')?.split(',')).toEqual([...FRESR_SELECTED_FIELDS]);
  });

  it('requests a total order so identical data yields identical bytes', () => {
    // Without it the service may reshuffle records, and the artifact SHA-256
    // would stop being an identity.
    expect(new URL(FRESR_EXPORT_URL).searchParams.get('order_by')).toBe('etablissement_id_paysage');
  });

  it('asks for no contact field of any kind', () => {
    const select = new URL(FRESR_EXPORT_URL).searchParams.get('select') ?? '';
    for (const forbidden of ['mail', 'telephone', 'adresse', 'contact']) {
      expect(select).not.toContain(forbidden);
    }
  });
});

describe('fresr source: redirects are refused, never followed', () => {
  it('requests with redirect: manual so the runtime cannot follow a hop', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      jsonResponse('[]'),
    );
    vi.stubGlobal('fetch', fetchMock);

    await resolveFromOfficialEndpoint();
    expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBe('manual');
  });

  it.each([301, 302, 303, 307, 308])(
    'fails on HTTP %i without issuing a second request',
    async (status) => {
      const fetchMock = vi.fn(
        async (_input: string | URL | Request, _init?: RequestInit) =>
          new Response(null, {
            status,
            headers: { location: 'https://evil.example/catalogue.json' },
          }),
      );
      vi.stubGlobal('fetch', fetchMock);

      await expect(resolveFromOfficialEndpoint()).rejects.toThrow(FresrSourceResolutionError);
      // THE ASSERTION THAT MATTERS: exactly one request was made, and it was to
      // the validated URL. The redirect target was never requested.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[0]).toBe(FRESR_EXPORT_URL);
    },
  );

  it('names the refused target in the error so an operator can act on it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(null, {
            status: 302,
            headers: { location: 'https://elsewhere.example/x.json' },
          }),
      ),
    );
    await expect(resolveFromOfficialEndpoint()).rejects.toThrow(
      /https:\/\/elsewhere\.example\/x\.json/,
    );
  });
});

describe('fresr source: response validation', () => {
  it('rejects a non-JSON content type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse('<html>error</html>', { contentType: 'text/html' })),
    );
    await expect(resolveFromOfficialEndpoint()).rejects.toThrow(/not application\/json/);
  });

  it('rejects a 200 response whose body is not a JSON array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse('{"error":"nope"}')),
    );
    await expect(resolveFromOfficialEndpoint()).rejects.toThrow(/do not begin a JSON array/);
  });

  it('rejects a non-2xx status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse('[]', { status: 503 })),
    );
    await expect(resolveFromOfficialEndpoint()).rejects.toThrow(/HTTP 503/);
  });

  it('rejects an empty body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse('')),
    );
    await expect(resolveFromOfficialEndpoint()).rejects.toThrow(/empty body/);
  });

  it('NEVER falls back to a cached artifact when the network fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('fetch failed');
      }),
    );
    await expect(resolveFromOfficialEndpoint()).rejects.toThrow(/Nothing was ingested/);
  });

  it('records artifact identity and origin on a successful fetch', async () => {
    const body = '[{"etablissement_id_paysage":"AAA01"}]';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(body)),
    );

    const source = await resolveFromOfficialEndpoint();
    expect(source.kind).toBe('official_endpoint');
    expect(source.sha256).toBe(createHash('sha256').update(Buffer.from(body)).digest('hex'));
    expect(source.readUrl).toBe(FRESR_EXPORT_URL);
    expect(source.publicationUrl).toBe(FRESR_PUBLICATION_URL);
    // A run that fetched the bytes itself always knows its own origin.
    expect(source.originRetrievedAt).toEqual(source.fetchedAt);
  });
});

describe('fresr source: operator-supplied files never acquire an invented origin', () => {
  it('records a local path and NO origin when none is asserted', () => {
    const path = tempFile('register.json', '[{"etablissement_id_paysage":"AAA01"}]');
    const source = resolveFromFile(path);

    expect(source.kind).toBe('operator_file');
    expect(source.filePath).toBe(path);
    expect(sourceLocation(source)).toBe(path);
    // null means NOT RECORDED. Bytes on disk carry no evidence of their own
    // origin, and inferring one from a filename would fabricate provenance.
    expect(source.readUrl).toBeNull();
    expect(source.publicationUrl).toBeNull();
    expect(source.originRetrievedAt).toBeNull();
  });

  it('records an asserted origin, still validated against the allow-list', () => {
    const path = tempFile('register.json', '[{"etablissement_id_paysage":"AAA01"}]');
    const retrievedAt = new Date('2026-08-24T08:00:00Z');
    const source = resolveFromFile(path, { url: FRESR_EXPORT_URL, retrievedAt });

    expect(source.readUrl).toBe(FRESR_EXPORT_URL);
    expect(source.publicationUrl).toBe(FRESR_PUBLICATION_URL);
    expect(source.originRetrievedAt).toEqual(retrievedAt);
  });

  it('refuses an asserted origin on an unapproved host', () => {
    const path = tempFile('register.json', '[{"etablissement_id_paysage":"AAA01"}]');
    expect(() =>
      resolveFromFile(path, { url: 'https://evil.example/x.json', retrievedAt: new Date() }),
    ).toThrow(FresrSourceResolutionError);
  });

  it('rejects a file that is not a JSON array', () => {
    const path = tempFile('register.json', '{"not":"an array"}');
    expect(() => resolveFromFile(path)).toThrow(/does not begin a JSON array/);
  });
});

describe('fresr source: operator URLs are validated like any other', () => {
  it('accepts an approved dataset URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse('[]')),
    );
    const source = await resolveFromUrl(FRESR_EXPORT_URL);
    expect(source.kind).toBe('official_endpoint');
  });

  it('refuses an unapproved host before any request is issued', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request) => jsonResponse('[]'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(resolveFromUrl('https://evil.example/x.json')).rejects.toThrow(
      FresrSourceResolutionError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
