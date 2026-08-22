/**
 * Runtime resolution of the official EWP Registry catalogue.
 *
 * FAIL CLOSED, in the same sense Phase 1A means it: a failed fetch stops the
 * run. There is deliberately NO cache, NO "last known good" artifact and NO
 * retry against a remembered URL. The only way to ingest bytes that are not
 * being fetched right now is for an operator to pass --file explicitly, and
 * that is recorded as `operator_file` so it can never be mistaken for an
 * official published source.
 *
 * Where this differs from ECHE, and why: the ECHE spreadsheet URL changes and
 * has to be re-discovered from a document page each time, so ECHE needs
 * discovery and an ambiguity check. The EWP catalogue lives at one stable
 * well-known URL defined by the EWP Registry API. There is nothing to discover,
 * so `official_endpoint` is a distinct input kind rather than a pretence that
 * discovery happened.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as log from '../../logging/log.js';
import { EWP_ALLOWED_HOSTS, EWP_CATALOGUE_URL, EwpSourceResolutionError } from './schema.js';

export type EwpSourceInputKind = 'official_endpoint' | 'operator_url' | 'operator_file';

export interface EwpResolvedSource {
  kind: EwpSourceInputKind;
  /** Absolute URL the bytes came from, when applicable. */
  fileUrl: string | null;
  /** Local path the bytes came from, when applicable. */
  filePath: string | null;
  bytes: Buffer;
  sha256: string;
  contentType: string | null;
  fetchedAt: Date;
}

/**
 * Where the bytes came from, as a single string, for the provenance record.
 * Never call this an official URL without also reading `kind`.
 */
export function sourceLocation(source: EwpResolvedSource): string {
  const location = source.fileUrl ?? source.filePath;
  if (location === null) {
    throw new EwpSourceResolutionError('Resolved source has neither a URL nor a file path.');
  }
  return location;
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Cheap structural check that these bytes are an XML document at all.
 *
 * Deliberately not a content-type check: the point is to fail on an error page
 * or a truncated download before the parser produces a confusing message. A
 * UTF-8 BOM is tolerated because it is valid at the head of an XML document.
 */
function looksLikeXml(bytes: Buffer): boolean {
  let offset = 0;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) offset = 3;
  const head = bytes
    .subarray(offset, offset + 512)
    .toString('utf8')
    .trimStart();
  return head.startsWith('<');
}

/**
 * Validates that a candidate URL is an official EWP Registry catalogue URL.
 * Rejects anything else, including look-alike hosts.
 */
export function assertOfficialEwpUrl(candidate: string): URL {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new EwpSourceResolutionError(`Not a valid URL: ${candidate}`);
  }
  if (url.protocol !== 'https:') {
    throw new EwpSourceResolutionError(
      `EWP source must be https, got ${url.protocol} (${candidate})`,
    );
  }
  if (!EWP_ALLOWED_HOSTS.has(url.hostname)) {
    throw new EwpSourceResolutionError(
      `Host ${url.hostname} is not the official EWP Registry host ` +
        `(allowed: ${[...EWP_ALLOWED_HOSTS].join(', ')})`,
    );
  }
  if (!/\.xml$/i.test(url.pathname)) {
    throw new EwpSourceResolutionError(
      `EWP catalogue must be an .xml document, got ${url.pathname}`,
    );
  }
  return url;
}

/**
 * Wraps a network failure with actionable context. Node's bare "fetch failed"
 * says nothing about what was being fetched or what to do next.
 */
async function fetchOrExplain(url: string): Promise<Response> {
  try {
    return await fetch(url, { redirect: 'follow' });
  } catch (err) {
    const cause =
      err instanceof Error && err.cause instanceof Error ? `: ${err.cause.message}` : '';
    throw new EwpSourceResolutionError(
      `Network error while fetching the EWP Registry catalogue (${url})${cause}. ` +
        `Nothing was ingested, and no previously-downloaded catalogue was used. ` +
        `Retry, or supply an artifact explicitly with --file.`,
    );
  }
}

async function download(url: string): Promise<{ bytes: Buffer; contentType: string | null }> {
  const res = await fetchOrExplain(url);
  if (!res.ok) {
    throw new EwpSourceResolutionError(`Download failed: HTTP ${res.status} for ${url}`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new EwpSourceResolutionError(`Download returned an empty body for ${url}`);
  }
  if (!looksLikeXml(bytes)) {
    throw new EwpSourceResolutionError(
      `Downloaded bytes from ${url} do not begin an XML document. ` +
        `This is usually an error page or a truncated response. Nothing was ingested.`,
    );
  }
  return { bytes, contentType: res.headers.get('content-type') };
}

/** Operator-supplied local artifact. Validated as XML, recorded as a local path. */
export function resolveFromFile(path: string): EwpResolvedSource {
  const bytes = readFileSync(path);
  if (!looksLikeXml(bytes)) {
    throw new EwpSourceResolutionError(`File does not begin an XML document: ${path}`);
  }
  return {
    kind: 'operator_file',
    fileUrl: null,
    filePath: path,
    bytes,
    sha256: sha256(bytes),
    contentType: null,
    fetchedAt: new Date(),
  };
}

/** Operator-supplied URL. Must still pass official-origin validation. */
export async function resolveFromUrl(candidate: string): Promise<EwpResolvedSource> {
  const url = assertOfficialEwpUrl(candidate);
  const { bytes, contentType } = await download(url.toString());
  return {
    kind: 'operator_url',
    fileUrl: url.toString(),
    filePath: null,
    bytes,
    sha256: sha256(bytes),
    contentType,
    fetchedAt: new Date(),
  };
}

/** Fetches the catalogue from the stable well-known official endpoint. */
export async function resolveFromOfficialEndpoint(): Promise<EwpResolvedSource> {
  const url = assertOfficialEwpUrl(EWP_CATALOGUE_URL);
  log.debug(`Fetching the EWP Registry catalogue: ${url.toString()}`);
  const { bytes, contentType } = await download(url.toString());
  return {
    kind: 'official_endpoint',
    fileUrl: url.toString(),
    filePath: null,
    bytes,
    sha256: sha256(bytes),
    contentType,
    fetchedAt: new Date(),
  };
}
