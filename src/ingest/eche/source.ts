/**
 * Runtime resolution of the official ECHE spreadsheet.
 *
 * FAIL CLOSED. Freshness is determined from the official page at run time.
 * There is no automatic "last known good" fallback: if discovery fails or is
 * ambiguous, the run stops and asks the operator for an explicit --url or --file.
 * A previously-seen URL is recorded in documentation for diagnosis only, and is
 * never executed automatically.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as log from '../../logging/log.js';

export const ECHE_DOCUMENT_PAGE =
  'https://erasmus-plus.ec.europa.eu/document/higher-education-institutions-holding-an-eche-2021-2027';

/** Only these hosts may serve an ECHE spreadsheet. */
const ALLOWED_HOSTS = new Set(['erasmus-plus.ec.europa.eu', 'ec.europa.eu']);

/** The file must live under an official uploads path. */
const ALLOWED_PATH_PREFIX = '/sites/default/files/';

const SPREADSHEET_EXT = /\.xlsx$/i;

export type SourceInputKind = 'discovered' | 'operator_url' | 'operator_file';

export interface ResolvedSource {
  kind: SourceInputKind;
  /** Official page the file was discovered from, when applicable. */
  pageUrl: string | null;
  /** Absolute URL the bytes came from, when applicable. */
  fileUrl: string | null;
  /** Local path the bytes came from, when applicable. */
  filePath: string | null;
  bytes: Buffer;
  sha256: string;
  contentType: string | null;
  retrievedAt: Date;
}

export class SourceResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceResolutionError';
  }
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function looksLikeZipContainer(bytes: Buffer): boolean {
  return bytes.length > 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/**
 * Validates that a candidate URL is an official Erasmus+/EC spreadsheet URL.
 * Rejects anything else, including look-alike hosts.
 */
export function assertOfficialUrl(candidate: string): URL {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new SourceResolutionError(`Not a valid URL: ${candidate}`);
  }
  if (url.protocol !== 'https:') {
    throw new SourceResolutionError(
      `ECHE source must be https, got ${url.protocol} (${candidate})`,
    );
  }
  if (!ALLOWED_HOSTS.has(url.hostname)) {
    throw new SourceResolutionError(
      `Host ${url.hostname} is not an approved official ECHE host ` +
        `(allowed: ${[...ALLOWED_HOSTS].join(', ')})`,
    );
  }
  if (!url.pathname.startsWith(ALLOWED_PATH_PREFIX)) {
    throw new SourceResolutionError(
      `Path ${url.pathname} is not under the approved official path ${ALLOWED_PATH_PREFIX}`,
    );
  }
  if (!SPREADSHEET_EXT.test(url.pathname)) {
    throw new SourceResolutionError(`Resolved file is not an .xlsx spreadsheet: ${url.pathname}`);
  }
  return url;
}

/**
 * Extracts ECHE spreadsheet candidates from the official document page.
 *
 * The link is published inside an `eac-download` web component element, so a
 * plain href scan is not sufficient. Both forms are handled; results are
 * deduplicated and constrained to the ECHE list filename shape so that an
 * unrelated spreadsheet on the same page can never be ingested by accident.
 */
export function extractCandidates(html: string, baseUrl: string): string[] {
  const found = new Set<string>();

  // Primary: the structured web component element carrying the canonical url.
  const componentPattern = /<eac-download\b[^>]*\burl\s*=\s*"([^"]+)"/gi;
  for (const match of html.matchAll(componentPattern)) {
    const href = match[1];
    if (href) found.add(href);
  }

  // Secondary: any direct reference to an .xlsx under the official uploads path.
  const directPattern = /\/sites\/default\/files\/[^"'()<>\s]*\.xlsx/gi;
  for (const match of html.matchAll(directPattern)) {
    found.add(match[0]);
  }

  const absolute: string[] = [];
  for (const href of found) {
    try {
      const resolved = new URL(href.replace(/&amp;/g, '&'), baseUrl);
      if (SPREADSHEET_EXT.test(resolved.pathname)) absolute.push(resolved.toString());
    } catch {
      // Unparseable candidate: ignore rather than guess.
    }
  }

  const echeShaped = absolute.filter((candidate) => {
    const path = decodeURIComponent(new URL(candidate).pathname);
    return /accredited-heis/i.test(path);
  });

  return [...new Set(echeShaped.length > 0 ? echeShaped : absolute)];
}

/**
 * Wraps a network failure with actionable context. Node's bare "fetch failed"
 * says nothing about what was being fetched or what to do next.
 */
async function fetchOrExplain(url: string, what: string): Promise<Response> {
  try {
    return await fetch(url, { redirect: 'follow' });
  } catch (err) {
    const cause =
      err instanceof Error && err.cause instanceof Error ? `: ${err.cause.message}` : '';
    throw new SourceResolutionError(
      `Network error while fetching ${what} (${url})${cause}. ` +
        `Nothing was ingested. Retry, or supply the file explicitly with --file.`,
    );
  }
}

async function download(url: string): Promise<{ bytes: Buffer; contentType: string | null }> {
  const res = await fetchOrExplain(url, 'the ECHE spreadsheet');
  if (!res.ok) {
    throw new SourceResolutionError(`Download failed: HTTP ${res.status} for ${url}`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());

  // Validate the actual GET response, never a HEAD Content-Length: this host
  // returns Content-Length: 0 on HEAD while GET returns the real file.
  if (bytes.byteLength === 0) {
    throw new SourceResolutionError(`Download returned an empty body for ${url}`);
  }
  // XLSX is a ZIP container: check magic bytes rather than trusting content-type.
  if (!looksLikeZipContainer(bytes)) {
    throw new SourceResolutionError(
      `Downloaded bytes are not a ZIP/XLSX container (bad magic) for ${url}`,
    );
  }
  return { bytes, contentType: res.headers.get('content-type') };
}

/** Operator-supplied local file. Validated as an XLSX container. */
export function resolveFromFile(path: string): ResolvedSource {
  const bytes = readFileSync(path);
  if (!looksLikeZipContainer(bytes)) {
    throw new SourceResolutionError(`File is not a ZIP/XLSX container: ${path}`);
  }
  return {
    kind: 'operator_file',
    pageUrl: null,
    fileUrl: null,
    filePath: path,
    bytes,
    sha256: sha256(bytes),
    contentType: null,
    retrievedAt: new Date(),
  };
}

/** Operator-supplied URL. Must still pass official-origin validation. */
export async function resolveFromUrl(candidate: string): Promise<ResolvedSource> {
  const url = assertOfficialUrl(candidate);
  const { bytes, contentType } = await download(url.toString());
  return {
    kind: 'operator_url',
    pageUrl: null,
    fileUrl: url.toString(),
    filePath: null,
    bytes,
    sha256: sha256(bytes),
    contentType,
    retrievedAt: new Date(),
  };
}

/** Discovers the current spreadsheet from the official document page. */
export async function resolveFromOfficialPage(): Promise<ResolvedSource> {
  log.debug(`Fetching official ECHE page: ${ECHE_DOCUMENT_PAGE}`);
  const res = await fetchOrExplain(ECHE_DOCUMENT_PAGE, 'the official ECHE document page');
  if (!res.ok) {
    throw new SourceResolutionError(
      `Could not fetch the official ECHE page (HTTP ${res.status}). ` +
        `Re-run with an explicit --url or --file. Nothing was ingested.`,
    );
  }
  const html = await res.text();
  const candidates = extractCandidates(html, ECHE_DOCUMENT_PAGE);

  if (candidates.length === 0) {
    throw new SourceResolutionError(
      `No ECHE spreadsheet could be discovered on ${ECHE_DOCUMENT_PAGE}. ` +
        `The page structure may have changed. Re-run with an explicit --url or --file. ` +
        `Nothing was ingested.`,
    );
  }
  if (candidates.length > 1) {
    throw new SourceResolutionError(
      `Ambiguous ECHE source: ${candidates.length} candidate spreadsheets found ` +
        `(${candidates.join(', ')}). Re-run with an explicit --url to disambiguate. ` +
        `Nothing was ingested.`,
    );
  }

  const only = candidates[0];
  if (!only) {
    throw new SourceResolutionError('Internal error: candidate list was unexpectedly empty.');
  }
  const url = assertOfficialUrl(only);
  log.debug(`Resolved ECHE file: ${url.toString()}`);
  const { bytes, contentType } = await download(url.toString());

  return {
    kind: 'discovered',
    pageUrl: ECHE_DOCUMENT_PAGE,
    fileUrl: url.toString(),
    filePath: null,
    bytes,
    sha256: sha256(bytes),
    contentType,
    retrievedAt: new Date(),
  };
}
