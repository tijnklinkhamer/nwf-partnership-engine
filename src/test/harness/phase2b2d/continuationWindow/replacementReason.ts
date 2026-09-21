/**
 * THE MECHANICAL REPLACEMENT-REASON PRECEDENCE (Owner Clarification Q3).
 *
 *   rank 1  ROOT_AUTHORITY_FAILURE  the root authority itself failed its contract
 *   rank 2  ROBOTS_DISALLOWED       a readable robots policy explicitly disallowed
 *   rank 3  HOST_UNREACHABLE        a transport/resolution failure prevented the
 *                                   required policy/resource and NO usable HTTP
 *                                   response established a page outcome
 *   rank 4  MIN_PAGES_NOT_MET       every other determinate SD9 failure
 *                                   (formal post-SD7 count < 4) - the fallback
 *
 * The reason is a coarse replacement label, never a retry policy: HOST_UNREACHABLE
 * does not mean permanent, global or intended, and authorises nothing. No v4
 * subtype token ever enters the four-value vocabulary.
 *
 * THIS MODULE IS PURE.
 */

import {
  SD9_MIN_PAGES_PER_ORGANISATION,
  type ReplacementReason,
  type RootTerminalReason,
} from './windowContract.js';

/** The transport/resolution failures rank 3 recognises - broad kinds only, never subtypes. */
export const HOST_UNREACHABLE_ERROR_KINDS = [
  'DNS_FAILURE',
  'TLS_FAILURE',
  'CONNECT_TIMEOUT',
  'READ_TIMEOUT',
  'CONNECTION_REFUSED',
  'CONNECTION_RESET',
] as const;
export type HostUnreachableErrorKind = (typeof HOST_UNREACHABLE_ERROR_KINDS)[number];

/** Mechanical facts from an organisation's acquisition of record and its formal SD7 count. */
export interface ReplacementReasonFacts {
  readonly rootTerminalReason: RootTerminalReason;
  /** The broad transport failure that stopped the required policy/resource, if any. */
  readonly blockingTransportErrorKind: HostUnreachableErrorKind | null;
  /** Whether ANY usable HTTP response (any status) established an application-level outcome. */
  readonly usableHttpResponseObtained: boolean;
  /** The FORMAL post-SD7 page count. Must be exact - a range is not determinate. */
  readonly postSd7PageCount: number;
}

/**
 * Returns the replacement reason for an ACQUISITION_UNSUCCESSFUL organisation,
 * or null when the formal post-SD7 count meets the minimum (no replacement).
 */
export function replacementReasonFor(facts: ReplacementReasonFacts): ReplacementReason | null {
  if (!Number.isInteger(facts.postSd7PageCount) || facts.postSd7PageCount < 0) {
    throw new Error('postSd7PageCount must be an exact non-negative integer');
  }
  if (facts.postSd7PageCount >= SD9_MIN_PAGES_PER_ORGANISATION) return null;

  if (facts.rootTerminalReason === 'INVALID_ROOT_AUTHORITY') {
    return 'ACQUISITION_UNSUCCESSFUL_ROOT_AUTHORITY_FAILURE';
  }
  if (facts.rootTerminalReason === 'ROBOTS_BLOCKED_ROOT') {
    return 'ACQUISITION_UNSUCCESSFUL_ROBOTS_DISALLOWED';
  }
  if (facts.blockingTransportErrorKind !== null && !facts.usableHttpResponseObtained) {
    return 'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE';
  }
  return 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET';
}
