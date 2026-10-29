/**
 * THE BOUNDED TRANSPORT-RETRY POLICY: one pure decision, and nothing else.
 *
 * ADR 0015. Frozen design:
 * `docs/evaluation/PHASE_2B_2D_A2_BOUNDED_TRANSPORT_RETRY_POLICY_DESIGN_V1.json`
 * (sha256 46c3e1ff...dc1cd), as corrected by
 * `..._BOUNDED_TRANSPORT_RETRY_TEMPORAL_TEST_CORRECTION_V1.json`.
 *
 * EVIDENCE IS ONE THING, POLICY IS ANOTHER. `error_kind` and `error_subtype`
 * (migration 0012) say WHAT THE RUNTIME REPORTED. This file says what may be
 * done about it. Migration 0012 deliberately refused `is_retryable`,
 * `retry_class` and `should_retry` columns for exactly this reason: a stored
 * verdict would freeze a derived conclusion into an immutable evidence row,
 * which is the `website_claims` mistake (CLAUDE.md rule 12). So the verdict
 * lives here, is computed at the moment it is needed, and is never persisted.
 *
 * PURE. No socket, no database, no filesystem, no clock, no environment read,
 * no mutable module state. Given the same four inputs it returns the same
 * answer for ever, which is what makes a historical row's disposition
 * RECONSTRUCTIBLE without storing it.
 *
 * WHAT A RETRY IS, SO THAT WHAT THIS FILE AUTHORISES IS UNAMBIGUOUS:
 *
 *   the EXACT same logical URL, through a NEW `executeWebAttempt` invocation,
 *   at `attemptNo + 1`, under a freshly minted URL-scoped authority, subject
 *   to every gate the first attempt passed - URL validation, root scope, host
 *   policy, DNS resolution, address classification, connection pinning and
 *   full TLS verification.
 *
 * It is NEVER a weakened repeat. There is no parameter here or in the caller
 * through which verification could be disabled, a certificate accepted, a
 * protocol downgraded, a hostname substituted, a proxy introduced, a
 * User-Agent varied or an SSRF check skipped. `robots.ts` retries by calling
 * the SAME local function with the SAME url, so the absence of those
 * capabilities is structural rather than promised.
 */
import type { FetchErrorKind, TransportFailureSubtype } from './observations.js';

/**
 * WHERE a failure happened, as a first-class input rather than an implicit
 * property of the call site.
 *
 * V1 admits retries in ONE context. Encoding that in the signature is what
 * makes "an ordinary page never retries" a property of this FUNCTION - a
 * thing a unit test can assert directly - rather than a property of where the
 * function happens to be called from, which only an integration test could
 * observe and which a later refactor could silently break.
 */
export type TransportRetryContext =
  /** Resolving one host's site-policy document: the initial request, or an ADR 0013 continuation. */
  | 'ROBOTS_POLICY_RESOLUTION'
  /** Any ordinary page or sitemap document. Never retried in V1. */
  | 'ORDINARY_PAGE';

export type RetryDisposition = 'RETRY_ELIGIBLE' | 'NOT_RETRY_ELIGIBLE' | 'INSUFFICIENT_EVIDENCE';

export interface RetryDispositionInput {
  readonly context: TransportRetryContext;
  readonly errorKind: FetchErrorKind | null;
  readonly errorSubtype: TransportFailureSubtype | null;
  /** Present only when a response actually arrived, and then never retryable in V1. */
  readonly httpStatus: number | null;
}

/**
 * The six classes V1 may retry, frozen by owner decision
 * REVISE_BOUNDED_TRANSPORT_RETRY_POLICY_RETRYABLE_SET_V1.
 *
 * WHAT THEY HAVE IN COMMON, and it is the whole admission criterion: each is
 * an INTERRUPTED OR INCOMPLETE ATTEMPT rather than a stated, stable refusal.
 * Nothing in any of them is a fact about the world that a second attempt must
 * find unchanged.
 *
 * A TIMEOUT IS A BOUNDED WAITING POLICY, NOT A RESILIENCE MEASURE. It caps how
 * long ONE attempt may wait; it does not make that attempt resilient, and it
 * retries nothing. `CONNECT_TIMEOUT_MS` and `TOTAL_TIMEOUT_MS` are unchanged
 * by this policy - no timeout is extended anywhere.
 *
 * OBSERVED CORPUS FREQUENCY IS NOT AN INPUT. Retryability is a property of
 * what the evidence MEANS, never of how often a particular sample happened to
 * produce it; reasoning from frequency would be outcome-driven tuning.
 */
const RETRYABLE_ERROR_KINDS: ReadonlySet<FetchErrorKind> = new Set<FetchErrorKind>([
  /** The TCP connection did not establish within the bounded wait. No refusal was received. */
  'CONNECT_TIMEOUT',
  /**
   * The response did not complete within the bounded total wait.
   *
   * NO USABLE HTTP RESPONSE EXISTED, so this is TRANSPORT evidence: the row
   * carries `error_kind` with a NULL `http_status`, which is exactly the line
   * separating this policy from the deferred service-response one. A 5xx is a
   * COMPLETED response carrying a status; this is the absence of one.
   */
  'READ_TIMEOUT',
  /** The connection was interrupted rather than refused on stated grounds. */
  'CONNECTION_RESET',
  /**
   * A connection-level refusal AT THAT ATTEMPT IN TIME.
   *
   * Categorically unlike the four genuinely fixed refusals - an invalid
   * certificate, an incompatible protocol, a nonexistent name, and this
   * repository's own policy refusal. None of those can change between two
   * attempts. A listening socket can. This admits ONE retry, never repeated
   * connection-refused retries: the resolution token permits one, then the
   * failure stands.
   */
  'CONNECTION_REFUSED',
]);

/** The TLS/DNS refinements V1 may retry. Their parent `error_kind` is heterogeneous, so only these exact subtypes qualify. */
const RETRYABLE_SUBTYPES: ReadonlySet<TransportFailureSubtype> = new Set<TransportFailureSubtype>([
  /**
   * TCP connected and TLS negotiation began but did not complete in time.
   * NO REFUSAL WAS STATED: no certificate rejected, no protocol declared
   * incompatible, no peer saying no. A timing outcome, and timing outcomes
   * differ between attempts.
   */
  'TLS_HANDSHAKE_TIMEOUT',
  /**
   * `EAI_AGAIN` - the resolver's OWN statement that the condition is temporary
   * and the query may be repeated. The one class where the runtime asserts
   * transience rather than this policy inferring it.
   */
  'DNS_TEMPORARY_FAILURE',
]);

/**
 * Subtypes that name a condition AND say it cannot change.
 *
 * Every one of them could only be "fixed" by doing something this repository
 * forbids absolutely: weakening verification, downgrading the protocol, or
 * substituting a name the source did not publish.
 */
const NON_RETRYABLE_SUBTYPES: ReadonlySet<TransportFailureSubtype> =
  new Set<TransportFailureSubtype>([
    'TLS_CERT_INVALID',
    'TLS_PROTOCOL_INCOMPATIBLE',
    /** ENOTFOUND: an authoritative negative ANSWER, not a failure to obtain one. */
    'DNS_NAME_NOT_FOUND',
    /** The resolver ANSWERED, successfully, with zero addresses. A successful query is not repeated because its answer was inconvenient. */
    'DNS_NO_ADDRESS_RETURNED',
  ]);

/**
 * Subtypes that identify NO condition at all.
 *
 * `TLS_OTHER` and `DNS_OTHER` mean precisely "a condition this build's
 * taxonomy does not name". They are INSUFFICIENT_EVIDENCE rather than
 * NOT_RETRY_ELIGIBLE: the behaviour is identical - zero retries either way -
 * but the classes mean different things to a later reader. A population of
 * INSUFFICIENT_EVIDENCE rows is a signal that the taxonomy may need a new
 * named member; NOT_RETRY_ELIGIBLE would close that question falsely.
 */
const UNSPECIFIC_SUBTYPES: ReadonlySet<TransportFailureSubtype> = new Set<TransportFailureSubtype>([
  'TLS_OTHER',
  'DNS_OTHER',
]);

/** The two `error_kind` values migration 0012 refines. Either without a subtype is too coarse to decide. */
const REFINED_ERROR_KINDS: ReadonlySet<FetchErrorKind> = new Set<FetchErrorKind>([
  'TLS_FAILURE',
  'DNS_FAILURE',
]);

/**
 * Error kinds that are a stated, stable refusal or a deterministic property of
 * the request. A second identical attempt asks an identical question.
 */
const NON_RETRYABLE_ERROR_KINDS: ReadonlySet<FetchErrorKind> = new Set<FetchErrorKind>([
  /** This repository's OWN refusal - a DISALLOWED policy, or a forbidden resolved address. Retrying it would re-run our own decision, and in the address case would re-attempt what the SSRF guard exists to prevent. */
  'BLOCKED_BY_POLICY',
  'MALFORMED_URL',
  'RESPONSE_TOO_LARGE',
  'UNSUPPORTED_CONTENT_TYPE',
  'TOO_MANY_REDIRECTS',
]);

/**
 * Whether a bounded transport retry is authorised for one observed outcome.
 *
 * TOTAL AND FAIL-CLOSED. Every combination returns a value, and anything this
 * build's taxonomy does not recognise returns `INSUFFICIENT_EVIDENCE`, which
 * issues no retry. A future `error_kind` or subtype therefore cannot become
 * retryable by being unrecognised - it becomes retryable only when someone
 * deliberately adds it here, under its own authorisation.
 *
 * THE ORDER OF THE CHECKS IS THE DESIGN:
 *
 *   1. a response arrived  -> HTTP is out of scope entirely (V1 is transport)
 *   2. no error at all     -> nothing to retry
 *   3. wrong context       -> DECIDED no, not "unknown"
 *   4. a refined kind      -> the SUBTYPE decides, and a missing one is coarse
 *   5. an unrefined kind   -> the KIND decides
 *   6. anything else       -> insufficient
 */
export function retryDispositionFor(input: RetryDispositionInput): RetryDisposition {
  const { context, errorKind, errorSubtype, httpStatus } = input;

  // 1. AN HTTP RESPONSE ARRIVED. Every status, 500/502/503/504 included, is
  //    outside V1 - HTTP_SERVICE_RETRY_POLICY_NOT_INCLUDED_IN_V4_TRANSPORT_RETRY_V1.
  //    Checked FIRST so that no combination of a status with an error kind can
  //    ever reach the transport branches below.
  if (httpStatus !== null) return 'NOT_RETRY_ELIGIBLE';

  // 2. No failure. There is nothing to be retried.
  if (errorKind === null) return 'NOT_RETRY_ELIGIBLE';

  // 3. V1 retries in exactly one context. This is a DECISION, not an
  //    evidential gap: the context is always known to the caller.
  if (context !== 'ROBOTS_POLICY_RESOLUTION') return 'NOT_RETRY_ELIGIBLE';

  // 4. TLS_FAILURE and DNS_FAILURE each span retryable and non-retryable
  //    conditions, so the subtype is the whole decision - and a row without
  //    one (every row written before migration 0012) cannot be placed.
  if (REFINED_ERROR_KINDS.has(errorKind)) {
    if (errorSubtype === null) return 'INSUFFICIENT_EVIDENCE';
    if (!subtypeBelongsTo(errorKind, errorSubtype)) return 'INSUFFICIENT_EVIDENCE';
    if (RETRYABLE_SUBTYPES.has(errorSubtype)) return 'RETRY_ELIGIBLE';
    if (NON_RETRYABLE_SUBTYPES.has(errorSubtype)) return 'NOT_RETRY_ELIGIBLE';
    if (UNSPECIFIC_SUBTYPES.has(errorSubtype)) return 'INSUFFICIENT_EVIDENCE';
    return 'INSUFFICIENT_EVIDENCE';
  }

  // A subtype on a kind that is not refined is a combination the database
  // CHECK forbids. Treat it as evidence that cannot be trusted to mean what it
  // appears to, rather than reading the kind and ignoring the contradiction.
  if (errorSubtype !== null) return 'INSUFFICIENT_EVIDENCE';

  // 5. The already-specific transport kinds decide for themselves.
  if (RETRYABLE_ERROR_KINDS.has(errorKind)) return 'RETRY_ELIGIBLE';
  if (NON_RETRYABLE_ERROR_KINDS.has(errorKind)) return 'NOT_RETRY_ELIGIBLE';

  // 6. `OTHER` - the gateway's catch-all, which today absorbs
  //    INVALID_CONTENT_ENCODING among others - and anything a future build
  //    adds. It identifies no condition.
  return 'INSUFFICIENT_EVIDENCE';
}

/**
 * Whether this subtype is one the database would accept beside this kind.
 *
 * Migration 0012's CHECK already refuses a TLS subtype on a DNS failure, so a
 * mismatch here means the value did not come from a persisted row, or came
 * from one written by a build that disagrees with this one. Either way it is
 * not evidence this policy may act on.
 */
function subtypeBelongsTo(kind: FetchErrorKind, subtype: TransportFailureSubtype): boolean {
  const prefix = kind === 'TLS_FAILURE' ? 'TLS_' : 'DNS_';
  return subtype.startsWith(prefix);
}
