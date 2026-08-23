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
  /**
   * When THIS resolution read the bytes: the HTTP fetch for a URL kind, the
   * local file read for `operator_file`. NOT necessarily when the artifact was
   * retrieved from the Registry - see `originUrl`.
   */
  fetchedAt: Date;
  /**
   * WHERE THE ARTIFACT WAS PUBLISHED, as distinct from where it was read.
   *
   * Known for free when this process did the fetch. For an operator file it is
   * null unless the operator explicitly asserts it: bytes on disk carry no
   * evidence of their own origin, and inferring one from a filename or a prior
   * run would fabricate provenance. null means NOT RECORDED.
   */
  originUrl: string | null;
  /** When the artifact was retrieved from `originUrl`. Null iff that is null. */
  originRetrievedAt: Date | null;
}

/**
 * An operator's explicit assertion about where a local artifact came from.
 *
 * This is the ONLY way an `operator_file` run acquires an origin. It is checked
 * against the official-host allow-list like any other URL, so an operator can
 * record a true origin but not invent an official-looking one.
 */
export interface EwpAssertedOrigin {
  url: string;
  retrievedAt: Date;
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

/** The HTTP statuses that ask a client to issue its request somewhere else. */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Fetches one URL and REFUSES TO FOLLOW A REDIRECT.
 *
 * WHY `manual` AND NOT `follow`.
 *
 * `redirect: 'follow'` hands redirect handling to the runtime, which issues the
 * request to the target BEFORE any code here can look at it. An official URL
 * that answered `302 Location: https://elsewhere.example/catalogue-v1.xml`
 * would therefore have already been fetched from `elsewhere.example` by the
 * time this function returned - outside the allow-list, and with the
 * provenance record still naming the official URL that was asked for. Checking
 * `Response.url` afterwards is too late: the request has happened.
 *
 * `redirect: 'manual'` hands the 3xx back unfollowed. No request is ever made
 * to the target, so the trust boundary cannot be escaped through a redirect at
 * all - not to an unapproved host and not to a different path on the approved
 * one. This is the same fail-closed rule the rest of this module follows: the
 * bytes come from the URL that was validated, or the run stops.
 *
 * The observed official endpoint answers 200 directly, so this costs nothing
 * today. If the Registry ever starts redirecting, the correct response is an
 * operator passing the new URL explicitly - which is validated in its own
 * right - not this process silently following a hop it never checked.
 *
 * The catch wraps a network failure with actionable context: Node's bare
 * "fetch failed" says nothing about what was being fetched or what to do next.
 */
async function fetchOrExplain(url: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { redirect: 'manual' });
  } catch (err) {
    const cause =
      err instanceof Error && err.cause instanceof Error ? `: ${err.cause.message}` : '';
    throw new EwpSourceResolutionError(
      `Network error while fetching the EWP Registry catalogue (${url})${cause}. ` +
        `Nothing was ingested, and no previously-downloaded catalogue was used. ` +
        `Retry, or supply an artifact explicitly with --file.`,
    );
  }
  if (REDIRECT_STATUSES.has(res.status)) {
    const location = res.headers.get('location');
    throw new EwpSourceResolutionError(
      `${url} answered HTTP ${res.status} redirecting to ` +
        `${location ?? '(no Location header)'}. The redirect was NOT followed and ` +
        `that target was NOT requested: Phase 1B fetches the catalogue only from a ` +
        `URL it has validated itself. Nothing was ingested. If the Registry has ` +
        `genuinely moved, pass the new official URL with --url so it is validated, ` +
        `or supply the artifact with --file.`,
    );
  }
  return res;
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

/**
 * Operator-supplied local artifact. Validated as XML, recorded as a local path.
 *
 * `origin` is optional and is never guessed. Supplying it is how the
 * download-once-then-ingest-those-exact-bytes workflow keeps its publication
 * origin: without it the database would record only a local path, and an
 * official artifact would be indistinguishable from a hand-edited file.
 */
export function resolveFromFile(path: string, origin?: EwpAssertedOrigin): EwpResolvedSource {
  const bytes = readFileSync(path);
  if (!looksLikeXml(bytes)) {
    throw new EwpSourceResolutionError(`File does not begin an XML document: ${path}`);
  }
  const originUrl = origin === undefined ? null : assertOfficialEwpUrl(origin.url).toString();
  return {
    kind: 'operator_file',
    fileUrl: null,
    filePath: path,
    bytes,
    sha256: sha256(bytes),
    contentType: null,
    fetchedAt: new Date(),
    originUrl,
    originRetrievedAt: origin === undefined ? null : origin.retrievedAt,
  };
}

/** Operator-supplied URL. Must still pass official-origin validation. */
export async function resolveFromUrl(candidate: string): Promise<EwpResolvedSource> {
  const url = assertOfficialEwpUrl(candidate);
  const { bytes, contentType } = await download(url.toString());
  const fetchedAt = new Date();
  return {
    kind: 'operator_url',
    fileUrl: url.toString(),
    filePath: null,
    bytes,
    sha256: sha256(bytes),
    contentType,
    fetchedAt,
    // This process performed the fetch, so the origin is known, not asserted.
    originUrl: url.toString(),
    originRetrievedAt: fetchedAt,
  };
}

/** Fetches the catalogue from the stable well-known official endpoint. */
export async function resolveFromOfficialEndpoint(): Promise<EwpResolvedSource> {
  const url = assertOfficialEwpUrl(EWP_CATALOGUE_URL);
  log.debug(`Fetching the EWP Registry catalogue: ${url.toString()}`);
  const { bytes, contentType } = await download(url.toString());
  const fetchedAt = new Date();
  return {
    kind: 'official_endpoint',
    fileUrl: url.toString(),
    filePath: null,
    bytes,
    sha256: sha256(bytes),
    contentType,
    fetchedAt,
    originUrl: url.toString(),
    originRetrievedAt: fetchedAt,
  };
}
