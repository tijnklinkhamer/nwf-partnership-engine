/**
 * Runtime resolution of the official French Ministry register.
 *
 * FAIL CLOSED, exactly as the ECHE and EWP resolvers do: a failed fetch stops
 * the run. There is NO cache, NO "last known good" artifact, and NO retry
 * against a remembered URL. The only way to ingest bytes that are not being
 * fetched right now is an explicit --file, recorded as `operator_file` so it
 * can never be mistaken for an official published source.
 *
 * THIS IS THE ONLY NEW NETWORK SOURCE PHASE 1D ADDS, and it is a structured
 * open-data endpoint. Phase 1D never requests an institution's own website:
 * no GET, no HEAD, no redirect check, no robots fetch, no DNS resolution. The
 * whole point of using an official register is that it makes fetching
 * institution sites unnecessary.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as log from '../../logging/log.js';
import {
  FRESR_ALLOWED_HOSTS,
  FRESR_API_PATH_PREFIX,
  FRESR_EXPORT_URL,
  FRESR_MAX_ARTIFACT_BYTES,
  FRESR_PUBLICATION_URL,
  FresrSourceResolutionError,
} from './schema.js';

export type FresrSourceInputKind = 'official_endpoint' | 'operator_file';

export interface FresrResolvedSource {
  kind: FresrSourceInputKind;
  /** Absolute URL the bytes came from, when applicable. */
  readUrl: string | null;
  /** Local path the bytes came from, when applicable. */
  filePath: string | null;
  bytes: Buffer;
  sha256: string;
  /** When THIS resolution read the bytes. Not necessarily the download time. */
  fetchedAt: Date;
  /**
   * WHERE THE DATASET IS PUBLISHED, as distinct from where it was read.
   * Known for free when this process did the fetch; for an operator file it is
   * null unless explicitly asserted. null means NOT RECORDED.
   */
  publicationUrl: string | null;
  /** When the artifact was retrieved from `readUrl`. Null iff that is null. */
  originRetrievedAt: Date | null;
}

/**
 * An operator's explicit assertion about where a local artifact came from.
 * The ONLY way an `operator_file` run acquires an origin. Validated against the
 * host allow-list like any other URL, so a true origin can be recorded but an
 * official-looking one cannot be invented.
 */
export interface FresrAssertedOrigin {
  url: string;
  retrievedAt: Date;
}

/** Where the bytes came from, for the provenance record. Read `kind` too. */
export function sourceLocation(source: FresrResolvedSource): string {
  const location = source.readUrl ?? source.filePath;
  if (location === null) {
    throw new FresrSourceResolutionError('Resolved source has neither a URL nor a file path.');
  }
  return location;
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Cheap structural check that these bytes begin a JSON array.
 *
 * Deliberately not a substitute for parsing: it exists so an error page or a
 * truncated download fails with a clear message before the JSON parser
 * produces a confusing one. A UTF-8 BOM is tolerated.
 */
function looksLikeJsonArray(bytes: Buffer): boolean {
  let offset = 0;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) offset = 3;
  return bytes
    .subarray(offset, offset + 512)
    .toString('utf8')
    .trimStart()
    .startsWith('[');
}

/**
 * Validates that a candidate URL is an official endpoint of THIS dataset.
 *
 * Three independent gates: https, the one permitted host, and the dataset's
 * own API path prefix. The third matters as much as the second - the host
 * serves hundreds of unrelated datasets, and Phase 1D is approved for one.
 */
export function assertOfficialFresrUrl(candidate: string): URL {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new FresrSourceResolutionError(`Not a valid URL: ${candidate}`);
  }
  if (url.protocol !== 'https:') {
    throw new FresrSourceResolutionError(
      `The French register source must be https, got ${url.protocol} (${candidate})`,
    );
  }
  if (!FRESR_ALLOWED_HOSTS.has(url.hostname)) {
    throw new FresrSourceResolutionError(
      `Host ${url.hostname} is not the official French open-data host ` +
        `(allowed: ${[...FRESR_ALLOWED_HOSTS].join(', ')})`,
    );
  }
  if (!url.pathname.startsWith(FRESR_API_PATH_PREFIX)) {
    throw new FresrSourceResolutionError(
      `${url.pathname} is not an endpoint of the approved dataset. Phase 1D is ` +
        `approved for ${FRESR_API_PATH_PREFIX} only; this host publishes many ` +
        `other datasets and none of them is in scope.`,
    );
  }
  return url;
}

/** The HTTP statuses that ask a client to issue its request somewhere else. */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Fetches one URL and REFUSES TO FOLLOW A REDIRECT.
 *
 * The reasoning is identical to the EWP resolver's, and it is not boilerplate.
 * `redirect: 'follow'` hands the hop to the runtime, which requests the target
 * BEFORE any code here can inspect it - so a 302 to an unapproved host would
 * already have been fetched by the time this function returned, and checking
 * `Response.url` afterwards is too late because the request has happened.
 *
 * `redirect: 'manual'` hands the 3xx back unfollowed, so no request is ever
 * issued to the target: not to another host, and not to another path on the
 * approved one. This host DOES redirect some paths - the dataset's own landing
 * page answers 302 - which is exactly why this must not be relaxed.
 */
async function fetchOrExplain(url: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { redirect: 'manual', headers: { accept: 'application/json' } });
  } catch (err) {
    const cause =
      err instanceof Error && err.cause instanceof Error ? `: ${err.cause.message}` : '';
    throw new FresrSourceResolutionError(
      `Network error while fetching the French Ministry register (${url})${cause}. ` +
        `Nothing was ingested, and no previously-downloaded artifact was used. ` +
        `Retry, or supply an artifact explicitly with --file.`,
    );
  }
  if (REDIRECT_STATUSES.has(res.status)) {
    const location = res.headers.get('location');
    throw new FresrSourceResolutionError(
      `${url} answered HTTP ${res.status} redirecting to ` +
        `${location ?? '(no Location header)'}. The redirect was NOT followed and ` +
        `that target was NOT requested: Phase 1D fetches only from a URL it has ` +
        `validated itself. Nothing was ingested. If the dataset has genuinely ` +
        `moved, pass the new official URL with --url so it is validated, or ` +
        `supply the artifact with --file.`,
    );
  }
  return res;
}

/**
 * Content-type validation.
 *
 * The endpoint answers `application/json; charset=utf-8`, so the check is on
 * the media type with parameters stripped. It is a real gate rather than a
 * cosmetic one: an HTML error page served with 200 is the failure mode this
 * catches.
 */
function assertJsonContentType(res: Response, url: string): void {
  const raw = res.headers.get('content-type');
  if (raw === null) {
    throw new FresrSourceResolutionError(
      `${url} returned no Content-Type header. Refusing to guess the format. Nothing was ingested.`,
    );
  }
  const mediaType = raw.split(';')[0]?.trim().toLowerCase() ?? '';
  if (mediaType !== 'application/json') {
    throw new FresrSourceResolutionError(
      `${url} returned Content-Type "${raw}", not application/json. This is usually ` +
        `an error page. Nothing was ingested.`,
    );
  }
}

async function download(url: string): Promise<Buffer> {
  const res = await fetchOrExplain(url);
  if (!res.ok) {
    throw new FresrSourceResolutionError(`Download failed: HTTP ${res.status} for ${url}`);
  }
  assertJsonContentType(res, url);

  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new FresrSourceResolutionError(`Download returned an empty body for ${url}`);
  }
  if (bytes.byteLength > FRESR_MAX_ARTIFACT_BYTES) {
    throw new FresrSourceResolutionError(
      `${url} returned ${bytes.byteLength} bytes, over the ${FRESR_MAX_ARTIFACT_BYTES}-byte ` +
        `limit for this source (the measured artifact is ~44 KB). Nothing was ingested.`,
    );
  }
  if (!looksLikeJsonArray(bytes)) {
    throw new FresrSourceResolutionError(
      `Downloaded bytes from ${url} do not begin a JSON array. This is usually an ` +
        `error page or a truncated response. Nothing was ingested.`,
    );
  }
  return bytes;
}

/**
 * Operator-supplied local artifact. Validated as JSON, recorded as a local path.
 * `origin` is optional and is NEVER guessed from a filename or a prior run.
 */
export function resolveFromFile(path: string, origin?: FresrAssertedOrigin): FresrResolvedSource {
  const bytes = readFileSync(path);
  if (bytes.byteLength > FRESR_MAX_ARTIFACT_BYTES) {
    throw new FresrSourceResolutionError(
      `${path} is ${bytes.byteLength} bytes, over the ${FRESR_MAX_ARTIFACT_BYTES}-byte limit.`,
    );
  }
  if (!looksLikeJsonArray(bytes)) {
    throw new FresrSourceResolutionError(`File does not begin a JSON array: ${path}`);
  }
  const readUrl = origin === undefined ? null : assertOfficialFresrUrl(origin.url).toString();
  return {
    kind: 'operator_file',
    readUrl,
    filePath: path,
    bytes,
    sha256: sha256(bytes),
    fetchedAt: new Date(),
    // The landing page is recorded only alongside an asserted origin: without
    // one there is no evidence these bytes came from that dataset at all.
    publicationUrl: origin === undefined ? null : FRESR_PUBLICATION_URL,
    originRetrievedAt: origin === undefined ? null : origin.retrievedAt,
  };
}

/** Operator-supplied URL. Must still pass official-origin validation. */
export async function resolveFromUrl(candidate: string): Promise<FresrResolvedSource> {
  const url = assertOfficialFresrUrl(candidate);
  const bytes = await download(url.toString());
  const fetchedAt = new Date();
  return {
    kind: 'official_endpoint',
    readUrl: url.toString(),
    filePath: null,
    bytes,
    sha256: sha256(bytes),
    fetchedAt,
    publicationUrl: FRESR_PUBLICATION_URL,
    // This process performed the fetch, so the origin is known, not asserted.
    originRetrievedAt: fetchedAt,
  };
}

/** Fetches the register from the approved export endpoint. */
export async function resolveFromOfficialEndpoint(): Promise<FresrResolvedSource> {
  log.debug(`Fetching the French Ministry register: ${FRESR_EXPORT_URL}`);
  return resolveFromUrl(FRESR_EXPORT_URL);
}
