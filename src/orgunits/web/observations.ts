/**
 * APPEND-ONLY evidence writes for one HTTP attempt.
 *
 * Every statement here is an INSERT. There is no UPDATE and no DELETE, and
 * that is not a style choice: `nwf_research` holds SELECT and INSERT and
 * nothing else, so a rewrite of an observation is refused by the database
 * before it is refused by review.
 *
 * NO RESPONSE BODY REACHES THIS MODULE'S SQL. What is written is a SHA-256, a
 * byte count and a truncation flag. There is no raw_html, page_html or
 * response_body column in the schema and there must never be one.
 *
 * Opens no socket.
 */
import type pg from 'pg';
import type { RedirectFacts } from './redirect.js';

/**
 * Anything that can run a parameterised statement.
 *
 * Structural rather than `pg.Pool | pg.ClientBase` so the same functions serve
 * a pooled read and a transactional write without either caller having to know
 * which the other used.
 */
export interface Queryable {
  query<R extends pg.QueryResultRow>(text: string, values?: unknown[]): Promise<pg.QueryResult<R>>;
}

/** The landed error taxonomy of `orgunit_fetch_observations.error_kind`. */
export type FetchErrorKind =
  | 'DNS_FAILURE'
  | 'CONNECT_TIMEOUT'
  | 'READ_TIMEOUT'
  | 'TLS_FAILURE'
  | 'CONNECTION_REFUSED'
  | 'CONNECTION_RESET'
  | 'BLOCKED_BY_POLICY'
  | 'MALFORMED_URL'
  | 'RESPONSE_TOO_LARGE'
  | 'UNSUPPORTED_CONTENT_TYPE'
  | 'TOO_MANY_REDIRECTS'
  | 'OTHER';

/**
 * The landed refinement taxonomy of `orgunit_fetch_observations.error_subtype`
 * (migration 0012). THE CANONICAL VOCABULARY: the database CHECK and this
 * union are the same eight tokens, and a drift test pins them together.
 *
 * EVIDENCE, NEVER A RETRY VERDICT. Each member says which TLS or DNS
 * condition the runtime reported, and nothing about what should be done
 * about it. Retryability is POLICY, derived at read time by something that
 * does not exist yet; no member is a verdict, a boolean or a class name.
 *
 * Only `TLS_FAILURE` and `DNS_FAILURE` are refined, because only they are
 * heterogeneous. `CONNECT_TIMEOUT`, `READ_TIMEOUT`, `CONNECTION_REFUSED` and
 * `CONNECTION_RESET` are already the exact category a retry rule would key
 * on, so mirroring them here would be a second spelling of one fact.
 *
 * TWO MEMBERS PROMISE LESS THAN THEY LOOK LIKE THEY DO:
 *
 *   - `DNS_NAME_NOT_FOUND` means precisely "Node reported ENOTFOUND". On
 *     Node 24 that covers BOTH `EAI_NONAME` (NXDOMAIN) and `EAI_NODATA` (the
 *     name exists but has no address of either family) - the runtime
 *     collapses them before this repository can see the difference.
 *   - `TLS_OTHER` and `DNS_OTHER` mean "a condition this build's taxonomy
 *     does not name". They NEVER imply transience. An unknown future error
 *     code lands there exactly so it cannot be mistaken for a recognised,
 *     retry-compatible one.
 */
export type TransportFailureSubtype =
  | 'TLS_HANDSHAKE_TIMEOUT'
  | 'TLS_CERT_INVALID'
  | 'TLS_PROTOCOL_INCOMPATIBLE'
  | 'TLS_OTHER'
  | 'DNS_NAME_NOT_FOUND'
  | 'DNS_TEMPORARY_FAILURE'
  | 'DNS_NO_ADDRESS_RETURNED'
  | 'DNS_OTHER';

/**
 * The same eight tokens as VALUES, so a test can compare them against the
 * migration's CHECK without re-typing them a third time.
 *
 * Grouped by the `error_kind` each one refines, because that grouping IS the
 * constraint: a TLS subtype on a DNS failure is refused by the database.
 */
export const TRANSPORT_FAILURE_SUBTYPES_BY_ERROR_KIND: Readonly<
  Record<'TLS_FAILURE' | 'DNS_FAILURE', readonly TransportFailureSubtype[]>
> = Object.freeze({
  TLS_FAILURE: Object.freeze([
    'TLS_HANDSHAKE_TIMEOUT',
    'TLS_CERT_INVALID',
    'TLS_PROTOCOL_INCOMPATIBLE',
    'TLS_OTHER',
  ] as const),
  DNS_FAILURE: Object.freeze([
    'DNS_NAME_NOT_FOUND',
    'DNS_TEMPORARY_FAILURE',
    'DNS_NO_ADDRESS_RETURNED',
    'DNS_OTHER',
  ] as const),
});

/** The landed taxonomy of `orgunit_fetch_observations.discovery_method`. */
export type DiscoveryMethod = 'ROOT' | 'LINK' | 'SITEMAP' | 'ROBOTS' | 'WELL_KNOWN_PATH';

/** The landed taxonomy of `orgunit_fetch_observations.robots_decision`. */
export type RobotsDecision =
  'ALLOWED' | 'DISALLOWED' | 'NO_ROBOTS_FILE' | 'ROBOTS_UNREADABLE' | 'NOT_APPLICABLE';

export interface FetchObservationRow {
  runId: string;
  rootWebsiteClaimId: string | null;
  rootPromotionId: string | null;
  echeRowKey: string;
  organisationId: string | null;
  requestedUrl: string;
  requestedHost: string;
  requestedRegistrableDomain: string;
  attemptNo: number;
  discoveryMethod: DiscoveryMethod;
  discoveryParentUrl: string | null;
  httpStatus: number | null;
  contentType: string | null;
  responseSha256: string | null;
  byteCount: number | null;
  truncated: boolean;
  robotsDecision: RobotsDecision;
  robotsRule: string | null;
  resolvedIpFamily: 'IPV4' | 'IPV6' | null;
  resolvedIpIsPublic: boolean | null;
  errorKind: FetchErrorKind | null;
  /**
   * The TLS/DNS refinement of `errorKind`, or null.
   *
   * A REQUIRED KEY with a nullable value, not an optional property: a new
   * failure path must STATE that it has no subtype rather than forget to
   * mention one. Null on every non-TLS, non-DNS outcome, and on every row
   * written before migration 0012.
   */
  errorSubtype: TransportFailureSubtype | null;
  fetchPolicyVersion: string;
  observedAt: Date;
}

/** The identity one attempt is unique on. Mirrors the landed dedupe index exactly. */
export interface AttemptIdentity {
  runId: string;
  rootKey: string;
  requestedUrl: string;
  fetchPolicyVersion: string;
  attemptNo: number;
}

/**
 * Looks for an attempt already recorded under this exact identity.
 *
 * A CONVENIENCE, NOT THE GUARANTEE. Its only purpose is to stop the gateway
 * making a network request whose evidence would then be discarded; the actual
 * correctness guarantee is the unique index, and the INSERT below still says
 * ON CONFLICT DO NOTHING so a race loses the row rather than corrupting one.
 */
export async function findExistingAttempt(
  client: Queryable,
  identity: AttemptIdentity,
): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM orgunit_fetch_observations
      WHERE run_id = $1 AND root_key = $2 AND requested_url = $3
        AND fetch_policy_version = $4 AND attempt_no = $5`,
    [
      identity.runId,
      identity.rootKey,
      identity.requestedUrl,
      identity.fetchPolicyVersion,
      identity.attemptNo,
    ],
  );
  return rows[0]?.id ?? null;
}

/**
 * Appends one immutable fetch observation.
 *
 * Returns null when an identical attempt identity already existed. The caller
 * reports that honestly rather than retrying: the first row is the evidence,
 * and a second attempt at the same URL is `attempt_no + 1`, which is a
 * different row on purpose.
 *
 * `root_key` is NEVER written. It is GENERATED ALWAYS from the two root
 * columns, so it cannot disagree with them and cannot be forged by a caller.
 * The charset columns are left NULL: this slice performs no charset detection,
 * and a stored charset nobody derived would be a guess.
 */
export async function insertFetchObservation(
  client: Queryable,
  row: FetchObservationRow,
): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO orgunit_fetch_observations (
        run_id, root_website_claim_id, root_promotion_id, eche_row_key, organisation_id,
        requested_url, requested_host, requested_registrable_domain, attempt_no,
        discovery_method, discovery_parent_url, http_status, content_type,
        response_sha256, byte_count, truncated, robots_decision, robots_rule,
        resolved_ip_family, resolved_ip_is_public, error_kind, error_subtype,
        fetch_policy_version, observed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
     ON CONFLICT (run_id, root_key, requested_url, fetch_policy_version, attempt_no)
       DO NOTHING
     RETURNING id`,
    [
      row.runId,
      row.rootWebsiteClaimId,
      row.rootPromotionId,
      row.echeRowKey,
      row.organisationId,
      row.requestedUrl,
      row.requestedHost,
      row.requestedRegistrableDomain,
      row.attemptNo,
      row.discoveryMethod,
      row.discoveryParentUrl,
      row.httpStatus,
      row.contentType,
      row.responseSha256,
      row.byteCount,
      row.truncated,
      row.robotsDecision,
      row.robotsRule,
      row.resolvedIpFamily,
      row.resolvedIpIsPublic,
      row.errorKind,
      row.errorSubtype,
      row.fetchPolicyVersion,
      row.observedAt,
    ],
  );
  return rows[0]?.id ?? null;
}

/**
 * Appends one observed 3xx edge against the attempt that saw it.
 *
 * Recording the edge is the END of what this gateway does with a redirect. It
 * does not request the target, does not promote it, and does not decide which
 * of two official website values it corroborates.
 */
export async function insertRedirectObservation(
  client: Queryable,
  fetchObservationId: string,
  httpStatus: number,
  facts: RedirectFacts,
  observedAt: Date,
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO orgunit_redirect_observations (
        fetch_observation_id, http_status, to_url_raw, to_url_resolved, target_malformed,
        scheme_downgraded, host_changed, registrable_domain_changed, observed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id`,
    [
      fetchObservationId,
      httpStatus,
      facts.toUrlRaw,
      facts.toUrlResolved,
      facts.targetMalformed,
      facts.schemeDowngraded,
      facts.hostChanged,
      facts.registrableDomainChanged,
      observedAt,
    ],
  );
  return rows[0]!.id;
}
