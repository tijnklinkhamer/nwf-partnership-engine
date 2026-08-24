/**
 * Phase 1D performs NO ECHE network fetch.
 *
 * WHY THIS FILE EXISTS.
 *
 * An earlier revision of the website CLI fell back to official-page discovery
 * when `--eche-file` was absent, so `nwf-pe website ingest eche` with no
 * arguments performed a network fetch on Phase 1D's behalf - at the time,
 * through a resolver that still followed redirects. It no longer does either,
 * and these tests keep it that way. (The ECHE resolver's redirect weakness was
 * itself repaired after Phase 1D landed: see ADR 0003. The contract asserted
 * here never depended on that repair, and does not change with it.)
 *
 * The second reason is correctness, not only trust: every claim is keyed by
 * `source_artifact_sha256`, so a run is only meaningful against a known set of
 * bytes. Silently downloading a fresh spreadsheet would classify a DIFFERENT
 * artifact from the one the operator is reasoning about.
 *
 * `fetch` is stubbed to throw, so any network attempt fails the test loudly
 * rather than quietly succeeding on a machine that happens to be online.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runWebsiteIngestEche, runWebsiteIngestFr } from '../../cli/commands/website.js';

/** Any network attempt at all is a failure of the property under test. */
function forbidNetwork(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(() => {
    throw new Error('NETWORK ATTEMPTED: Phase 1D must not fetch the ECHE artifact.');
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('website ingest eche: the artifact must be named, never discovered', () => {
  it('refuses with no --eche-file, and issues NO request', async () => {
    const fetchMock = forbidNetwork();
    const code = await runWebsiteIngestEche({ dryRun: true });

    expect(code).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses --eche-url rather than downloading, and issues NO request', async () => {
    const fetchMock = forbidNetwork();
    const code = await runWebsiteIngestEche({
      echeUrl: 'https://ec.europa.eu/some/eche.xlsx',
      dryRun: true,
    });

    expect(code).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The SUCCESS path is deliberately not exercised here. It opens a database
  // pool even under --dry-run, and a unit test must never reach the working
  // database. That path's no-fetch property is established more strongly
  // elsewhere anyway: the Phase 1D firewall asserts this module does not
  // import resolveFromOfficialPage or the ECHE URL resolver at all, so there
  // is no ECHE fetch path to take on ANY input, and the integration tests
  // exercise the successful ingest against the separate test database.
});

describe('website ingest fr: a doomed run performs no network I/O', () => {
  it('refuses a missing --eche-file BEFORE fetching the register', async () => {
    // Argument validation is a local read and must happen first: fetching the
    // register for a run that cannot succeed would be a pointless request to
    // an external service.
    const fetchMock = forbidNetwork();
    const code = await runWebsiteIngestFr({ dryRun: true });

    expect(code).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
