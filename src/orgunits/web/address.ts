/**
 * NUMERIC classification of an IP address against the special-purpose ranges a
 * first-party research fetch must never reach.
 *
 * WHY THIS EXISTS
 *
 *   A fetch target that comes from a published register or from a page's own
 *   links is attacker-influenceable in the ordinary sense: whoever controls the
 *   site controls the hostname, and therefore controls what it resolves to. A
 *   host that answers 10.0.0.5, 127.0.0.1 or 169.254.169.254 turns this worker
 *   into a probe of whatever network it happens to run on. ADR 0004 s11 names
 *   this as the control 2B-1b must build.
 *
 * WHY IT PARSES RATHER THAN MATCHES TEXT
 *
 *   String prefixes do not work and are actively dangerous here. "172.16." is
 *   private but "172.160." is not; "10.0.0.1" and "012.0.0.1" and "::ffff:10.0.0.1"
 *   are the same forbidden host wearing three spellings. Every check below runs
 *   over PARSED BYTES and a prefix length, so a range is a range rather than a
 *   substring.
 *
 * PURE. No network, no database, no filesystem, no clock. Deliberately imports
 * nothing from node:net so that the one socket-owning module stays the only
 * file in the Phase 2B namespace that touches a network primitive at all.
 */

export type IpFamily = 'IPV4' | 'IPV6';

export interface ParsedIpAddress {
  family: IpFamily;
  /** 4 bytes for IPv4, 16 for IPv6. */
  bytes: Uint8Array;
}

/**
 * Why an address is refused. Lower-case identifiers, never presented as a
 * conclusion about the institution - a host that resolves to a private range
 * is a fact about DNS, not about the organisation.
 */
export type ForbiddenAddressReason =
  | 'unspecified'
  | 'loopback'
  | 'private'
  | 'carrier_grade_nat'
  | 'link_local'
  | 'unique_local'
  | 'multicast'
  | 'reserved'
  | 'benchmarking'
  | 'documentation'
  | 'ietf_protocol_assignment'
  | 'relay_or_translation'
  | 'ipv4_mapped'
  | 'unparsable';

export interface AddressClassification {
  family: IpFamily | null;
  /** True only when the address is publicly routable AND ordinary. */
  isPublic: boolean;
  /** Set whenever `isPublic` is false. */
  reason: ForbiddenAddressReason | null;
}

/**
 * Parses dotted-quad IPv4.
 *
 * Leading zeros are REFUSED rather than interpreted. "0177.0.0.1" is loopback
 * to a C resolver and 177.0.0.1 to a naive decimal parser, and a check that
 * disagrees with the resolver about which host it is looking at is worse than
 * no check.
 */
export function parseIpv4(text: string): Uint8Array | null {
  const parts = text.split('.');
  if (parts.length !== 4) return null;
  const bytes = new Uint8Array(4);
  for (let i = 0; i < 4; i += 1) {
    const part = parts[i]!;
    if (!/^[0-9]{1,3}$/.test(part)) return null;
    if (part.length > 1 && part.startsWith('0')) return null;
    const value = Number.parseInt(part, 10);
    if (value > 255) return null;
    bytes[i] = value;
  }
  return bytes;
}

/**
 * Parses IPv6, including "::" compression and a trailing embedded IPv4.
 *
 * A zone identifier ("fe80::1%eth0") is refused outright: it is meaningful only
 * for link-local addresses, which are forbidden anyway, and accepting the
 * syntax would mean carrying a scope this gateway has no way to validate.
 */
export function parseIpv6(text: string): Uint8Array | null {
  if (text.includes('%')) return null;
  if (text.includes(':::')) return null;

  let head = text;
  let embeddedIpv4: Uint8Array | null = null;
  const lastColon = head.lastIndexOf(':');
  if (lastColon >= 0 && head.slice(lastColon + 1).includes('.')) {
    embeddedIpv4 = parseIpv4(head.slice(lastColon + 1));
    if (embeddedIpv4 === null) return null;
    head = head.slice(0, lastColon + 1) + '0:0';
  }

  const doubleColon = head.indexOf('::');
  if (doubleColon !== head.lastIndexOf('::')) return null;

  const readGroups = (segment: string): number[] | null => {
    if (segment === '') return [];
    const groups: number[] = [];
    for (const piece of segment.split(':')) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(piece)) return null;
      groups.push(Number.parseInt(piece, 16));
    }
    return groups;
  };

  let groups: number[];
  if (doubleColon === -1) {
    const parsed = readGroups(head);
    if (parsed === null || parsed.length !== 8) return null;
    groups = parsed;
  } else {
    const left = readGroups(head.slice(0, doubleColon));
    const right = readGroups(head.slice(doubleColon + 2));
    if (left === null || right === null) return null;
    const missing = 8 - left.length - right.length;
    // "::" must stand for at least one group; otherwise the address is simply
    // written with redundant syntax and is not a valid textual form.
    if (missing < 1) return null;
    groups = [...left, ...new Array<number>(missing).fill(0), ...right];
  }

  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i += 1) {
    bytes[i * 2] = (groups[i]! >> 8) & 0xff;
    bytes[i * 2 + 1] = groups[i]! & 0xff;
  }
  if (embeddedIpv4 !== null) bytes.set(embeddedIpv4, 12);
  return bytes;
}

/** Parses either family, or returns null. */
export function parseIpAddress(text: string): ParsedIpAddress | null {
  if (text.includes(':')) {
    const bytes = parseIpv6(text);
    return bytes === null ? null : { family: 'IPV6', bytes };
  }
  const bytes = parseIpv4(text);
  return bytes === null ? null : { family: 'IPV4', bytes };
}

/** True when `text` is a bare IP address rather than a hostname. */
export function isIpLiteral(text: string): boolean {
  const trimmed = text.startsWith('[') && text.endsWith(']') ? text.slice(1, -1) : text;
  return parseIpAddress(trimmed) !== null;
}

interface Block {
  bytes: Uint8Array;
  prefix: number;
  reason: ForbiddenAddressReason;
}

function v4(text: string, prefix: number, reason: ForbiddenAddressReason): Block {
  const bytes = parseIpv4(text);
  /* c8 ignore next */
  if (bytes === null) throw new Error(`unparsable IPv4 block literal: ${text}`);
  return { bytes, prefix, reason };
}

function v6(text: string, prefix: number, reason: ForbiddenAddressReason): Block {
  const bytes = parseIpv6(text);
  /* c8 ignore next */
  if (bytes === null) throw new Error(`unparsable IPv6 block literal: ${text}`);
  return { bytes, prefix, reason };
}

/**
 * IANA special-purpose IPv4 ranges, conservatively.
 *
 * Everything not listed is treated as publicly routable. The list errs towards
 * refusal: a false refusal costs one unreachable institution and is visible in
 * the evidence, while a false acceptance is an SSRF.
 */
const FORBIDDEN_IPV4: readonly Block[] = [
  v4('0.0.0.0', 8, 'unspecified'),
  v4('10.0.0.0', 8, 'private'),
  v4('100.64.0.0', 10, 'carrier_grade_nat'),
  v4('127.0.0.0', 8, 'loopback'),
  v4('169.254.0.0', 16, 'link_local'), // includes the 169.254.169.254 metadata endpoint
  v4('172.16.0.0', 12, 'private'),
  v4('192.0.0.0', 24, 'ietf_protocol_assignment'),
  v4('192.0.2.0', 24, 'documentation'),
  v4('192.88.99.0', 24, 'relay_or_translation'),
  v4('192.168.0.0', 16, 'private'),
  v4('198.18.0.0', 15, 'benchmarking'),
  v4('198.51.100.0', 24, 'documentation'),
  v4('203.0.113.0', 24, 'documentation'),
  v4('224.0.0.0', 4, 'multicast'),
  v4('240.0.0.0', 4, 'reserved'), // includes 255.255.255.255
];

/** IANA special-purpose IPv6 ranges. IPv4-mapped is handled separately, before this list. */
const FORBIDDEN_IPV6: readonly Block[] = [
  v6('::', 128, 'unspecified'),
  v6('::1', 128, 'loopback'),
  v6('64:ff9b::', 96, 'relay_or_translation'), // NAT64
  v6('64:ff9b:1::', 48, 'relay_or_translation'),
  v6('100::', 64, 'reserved'), // discard-only
  v6('2001::', 32, 'relay_or_translation'), // Teredo
  v6('2001:20::', 28, 'reserved'), // ORCHIDv2
  v6('2001:db8::', 32, 'documentation'),
  v6('2002::', 16, 'relay_or_translation'), // 6to4
  v6('3fff::', 20, 'documentation'),
  v6('5f00::', 16, 'reserved'),
  v6('fc00::', 7, 'unique_local'),
  v6('fe80::', 10, 'link_local'),
  v6('ff00::', 8, 'multicast'),
];

const IPV4_MAPPED_PREFIX = v6('::ffff:0:0', 96, 'ipv4_mapped');

function inBlock(address: Uint8Array, block: Block): boolean {
  const fullBytes = block.prefix >> 3;
  const remainingBits = block.prefix & 7;
  for (let i = 0; i < fullBytes; i += 1) {
    if (address[i] !== block.bytes[i]) return false;
  }
  if (remainingBits === 0) return true;
  const mask = (0xff << (8 - remainingBits)) & 0xff;
  return (address[fullBytes]! & mask) === (block.bytes[fullBytes]! & mask);
}

/**
 * Classifies one resolved address.
 *
 * An IPv4-mapped IPv6 address is ALWAYS refused, and when the address it wraps
 * is itself special the more specific reason is reported. A DNS AAAA record has
 * no legitimate reason to contain ::ffff:0:0/96, so its appearance is either a
 * misconfiguration or an attempt to spell a forbidden IPv4 address in a form a
 * naive IPv6 check would wave through.
 */
export function classifyIpAddress(text: string): AddressClassification {
  const parsed = parseIpAddress(text);
  if (parsed === null) return { family: null, isPublic: false, reason: 'unparsable' };

  if (parsed.family === 'IPV4') {
    for (const block of FORBIDDEN_IPV4) {
      if (inBlock(parsed.bytes, block)) {
        return { family: 'IPV4', isPublic: false, reason: block.reason };
      }
    }
    return { family: 'IPV4', isPublic: true, reason: null };
  }

  if (inBlock(parsed.bytes, IPV4_MAPPED_PREFIX)) {
    const embedded = classifyIpAddress(parsed.bytes.slice(12).join('.'));
    return {
      family: 'IPV6',
      isPublic: false,
      reason: embedded.reason ?? 'ipv4_mapped',
    };
  }

  for (const block of FORBIDDEN_IPV6) {
    if (inBlock(parsed.bytes, block)) {
      return { family: 'IPV6', isPublic: false, reason: block.reason };
    }
  }
  return { family: 'IPV6', isPublic: true, reason: null };
}
