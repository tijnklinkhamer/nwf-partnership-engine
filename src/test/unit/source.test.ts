import { describe, expect, it } from 'vitest';
import {
  assertOfficialUrl,
  extractCandidates,
  SourceResolutionError,
} from '../../ingest/eche/source.js';

const PAGE =
  'https://erasmus-plus.ec.europa.eu/document/higher-education-institutions-holding-an-eche-2021-2027';
const REAL_PATH = '/sites/default/files/2026-08/accredited-HEIs-Erasmus-2021-2027_17082026_1.xlsx';

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
