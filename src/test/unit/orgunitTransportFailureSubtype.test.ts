/**
 * MIGRATION 0012 / ADR 0014 — the pure TLS and DNS subtype mapping.
 *
 * Test matrix A, B, C and C2 of
 * `docs/evaluation/PHASE_2B_2D_A2_TRANSPORT_FAILURE_OBSERVABILITY_DESIGN_V1.json`.
 *
 * These functions are PURE: no socket, no resolver, no database, no clock.
 * They turn a runtime error code into EVIDENCE about what happened, and never
 * into a decision about what to do next. Nothing here — and nothing anywhere
 * in this repository — computes retryability.
 */
import { describe, expect, it } from 'vitest';
import {
  classifyNodeError,
  dnsFailureSubtype,
  tlsFailureSubtype,
} from '../../orgunits/web/gateway.js';
import {
  TRANSPORT_FAILURE_SUBTYPES_BY_ERROR_KIND,
  type TransportFailureSubtype,
} from '../../orgunits/web/observations.js';

const errorWith = (code: string): NodeJS.ErrnoException =>
  Object.assign(new Error('boom'), { code });

describe('A. every landed TLS code maps to exactly its approved subtype', () => {
  // The nine codes `TLS_ERROR_CODES` has carried since 2B-1b, each with the
  // condition ADR 0014 froze for it. Written out here rather than imported
  // from the table under test, so a silent edit to that table fails.
  const EXPECTED: ReadonlyArray<[string, TransportFailureSubtype]> = [
    ['ERR_TLS_HANDSHAKE_TIMEOUT', 'TLS_HANDSHAKE_TIMEOUT'],
    ['ERR_TLS_CERT_ALTNAME_INVALID', 'TLS_CERT_INVALID'],
    ['CERT_HAS_EXPIRED', 'TLS_CERT_INVALID'],
    ['DEPTH_ZERO_SELF_SIGNED_CERT', 'TLS_CERT_INVALID'],
    ['SELF_SIGNED_CERT_IN_CHAIN', 'TLS_CERT_INVALID'],
    ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'TLS_CERT_INVALID'],
    ['UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'TLS_CERT_INVALID'],
    ['ERR_SSL_WRONG_VERSION_NUMBER', 'TLS_PROTOCOL_INCOMPATIBLE'],
    ['EPROTO', 'TLS_PROTOCOL_INCOMPATIBLE'],
  ];

  it.each(EXPECTED)('%s -> %s', (code, subtype) => {
    expect(tlsFailureSubtype(code)).toBe(subtype);
  });

  it('classifies all nine as TLS_FAILURE and attaches the same subtype', () => {
    for (const [code, subtype] of EXPECTED) {
      const classified = classifyNodeError(errorWith(code));
      expect(classified.failure, code).toBe('TLS_FAILURE');
      expect(classified.subtype, code).toBe(subtype);
    }
  });
});

describe('B. the catch-all is honest, and exact codes are read BEFORE prefixes', () => {
  it('maps an unknown ERR_TLS_* and an unknown ERR_SSL_* to TLS_OTHER', () => {
    for (const code of [
      'ERR_TLS_SOMETHING_NEW',
      'ERR_TLS_INVALID_PROTOCOL_VERSION',
      'ERR_SSL_SOMETHING_NEW',
      'ERR_SSL_PACKET_LENGTH_TOO_LONG',
    ]) {
      expect(tlsFailureSubtype(code), code).toBe('TLS_OTHER');
      expect(classifyNodeError(errorWith(code)).failure, code).toBe('TLS_FAILURE');
      expect(classifyNodeError(errorWith(code)).subtype, code).toBe('TLS_OTHER');
    }
  });

  it('does NOT swallow ERR_TLS_HANDSHAKE_TIMEOUT into the ERR_TLS_ prefix', () => {
    // THE ORDERING TEST. `ERR_TLS_HANDSHAKE_TIMEOUT` starts with `ERR_TLS_`,
    // so a mapping that consulted the prefix first would return TLS_OTHER —
    // losing the ONE plausibly-transient TLS condition, which is the entire
    // reason the TLS split exists.
    expect(tlsFailureSubtype('ERR_TLS_HANDSHAKE_TIMEOUT')).toBe('TLS_HANDSHAKE_TIMEOUT');
    expect(tlsFailureSubtype('ERR_SSL_WRONG_VERSION_NUMBER')).toBe('TLS_PROTOCOL_INCOMPATIBLE');
  });

  it('never implies transience: an unnamed code is TLS_OTHER, not a specific member', () => {
    const specific: TransportFailureSubtype[] = [
      'TLS_HANDSHAKE_TIMEOUT',
      'TLS_CERT_INVALID',
      'TLS_PROTOCOL_INCOMPATIBLE',
    ];
    expect(specific).not.toContain(tlsFailureSubtype('ERR_TLS_A_CODE_FROM_THE_FUTURE'));
  });
});

describe('C. the DNS mapping is exactly the approved one', () => {
  it('maps ENOTFOUND to DNS_NAME_NOT_FOUND', () => {
    // Node 24 reports ENOTFOUND for BOTH EAI_NONAME (NXDOMAIN) and EAI_NODATA
    // (no address of either family). The member means "Node reported
    // ENOTFOUND" and promises no more than that.
    expect(dnsFailureSubtype('ENOTFOUND')).toBe('DNS_NAME_NOT_FOUND');
  });

  it('maps EAI_NONAME to DNS_NAME_NOT_FOUND, kept defensively', () => {
    // Unreachable on this runtime; the truthful mapping on one that surfaced it.
    expect(dnsFailureSubtype('EAI_NONAME')).toBe('DNS_NAME_NOT_FOUND');
  });

  it('maps EAI_AGAIN to DNS_TEMPORARY_FAILURE', () => {
    expect(dnsFailureSubtype('EAI_AGAIN')).toBe('DNS_TEMPORARY_FAILURE');
  });

  it('maps every OTHER EAI_* code to DNS_OTHER', () => {
    for (const code of [
      'EAI_ADDRFAMILY',
      'EAI_BADFLAGS',
      'EAI_BADHINTS',
      'EAI_CANCELED',
      'EAI_FAIL',
      'EAI_FAMILY',
      'EAI_MEMORY',
      'EAI_OVERFLOW',
      'EAI_PROTOCOL',
      'EAI_SERVICE',
      'EAI_SOCKTYPE',
    ]) {
      expect(dnsFailureSubtype(code), code).toBe('DNS_OTHER');
    }
  });

  it('maps an unknown code, and no code at all, to DNS_OTHER', () => {
    for (const code of ['', 'UNKNOWN', 'SOMETHING_NEW', 'ECONNREFUSED']) {
      expect(dnsFailureSubtype(code), code).toBe('DNS_OTHER');
    }
  });

  it('never promotes an unnamed resolver code to the one temporary member', () => {
    expect(dnsFailureSubtype('EAI_FAIL')).not.toBe('DNS_TEMPORARY_FAILURE');
    expect(dnsFailureSubtype('SERVFAIL')).not.toBe('DNS_TEMPORARY_FAILURE');
  });
});

describe('C2. the mapping is TOTAL — no TLS or DNS input yields null', () => {
  const PROBES = [
    '',
    'UNKNOWN',
    'EPROTO',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ERR_TLS_X',
    'ERR_SSL_Y',
    'ECONNRESET',
    'a'.repeat(200),
    '☃',
  ];

  it('tlsFailureSubtype returns a member for every input', () => {
    for (const code of PROBES) {
      const subtype = tlsFailureSubtype(code);
      expect(subtype, code).not.toBeNull();
      expect(TRANSPORT_FAILURE_SUBTYPES_BY_ERROR_KIND.TLS_FAILURE, code).toContain(subtype);
    }
  });

  it('dnsFailureSubtype returns a member for every input', () => {
    for (const code of PROBES) {
      const subtype = dnsFailureSubtype(code);
      expect(subtype, code).not.toBeNull();
      expect(TRANSPORT_FAILURE_SUBTYPES_BY_ERROR_KIND.DNS_FAILURE, code).toContain(subtype);
    }
  });

  it('"could not classify" is therefore not a reachable outcome', () => {
    // This is what lets migration 0012 leave the column NULLABLE without
    // ambiguity: on a transport-kind row written by THIS build, NULL cannot
    // mean "unclassifiable", so it can only mean "written before 0012".
    expect(tlsFailureSubtype('anything at all')).toBe('TLS_OTHER');
    expect(dnsFailureSubtype('anything at all')).toBe('DNS_OTHER');
  });
});

describe('no already-specific error kind acquires a subtype', () => {
  it('leaves CONNECT_TIMEOUT, CONNECTION_REFUSED and CONNECTION_RESET with null', () => {
    // Their error_kind is already the exact category a retry rule would key
    // on. A mirrored subtype would be a second spelling of one fact.
    for (const [code, failure] of [
      ['ETIMEDOUT', 'CONNECT_TIMEOUT'],
      ['ECONNREFUSED', 'CONNECTION_REFUSED'],
      ['ECONNRESET', 'CONNECTION_RESET'],
      ['EPIPE', 'CONNECTION_RESET'],
      ['EHOSTUNREACH', 'OTHER'],
    ] as const) {
      const classified = classifyNodeError(errorWith(code));
      expect(classified.failure, code).toBe(failure);
      expect(classified.subtype, code).toBeNull();
    }
  });
});
