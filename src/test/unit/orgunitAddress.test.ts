/**
 * The SSRF address policy, at the level where it is decided.
 *
 * These are the ranges a first-party research fetch must never reach. The
 * matrix below is the one ADR 0004 s11 calls for, and it is asserted over
 * PARSED BYTES rather than string prefixes - "172.16.0.1" is private and
 * "172.160.0.1" is not, and a substring check gets that wrong.
 */
import { describe, expect, it } from 'vitest';
import {
  classifyIpAddress,
  isIpLiteral,
  parseIpv4,
  parseIpv6,
} from '../../orgunits/web/address.js';

describe('parseIpv4', () => {
  it('parses ordinary dotted quads', () => {
    expect([...parseIpv4('192.0.2.5')!]).toEqual([192, 0, 2, 5]);
    expect([...parseIpv4('0.0.0.0')!]).toEqual([0, 0, 0, 0]);
    expect([...parseIpv4('255.255.255.255')!]).toEqual([255, 255, 255, 255]);
  });

  it('REFUSES leading zeros rather than interpreting them', () => {
    // "0177.0.0.1" is loopback to a C resolver and 177.0.0.1 to a naive decimal
    // parser. A check that disagrees with the resolver about which host it is
    // looking at is worse than no check at all.
    expect(parseIpv4('0177.0.0.1')).toBeNull();
    expect(parseIpv4('010.0.0.1')).toBeNull();
    expect(parseIpv4('127.0.0.01')).toBeNull();
  });

  it('refuses out-of-range, short and non-numeric forms', () => {
    expect(parseIpv4('256.0.0.1')).toBeNull();
    expect(parseIpv4('10.0.0')).toBeNull();
    expect(parseIpv4('10.0.0.1.2')).toBeNull();
    expect(parseIpv4('10.0.0.a')).toBeNull();
    expect(parseIpv4('2130706433')).toBeNull();
  });
});

describe('parseIpv6', () => {
  it('parses full, compressed and IPv4-embedded forms', () => {
    expect(parseIpv6('::1')![15]).toBe(1);
    expect(parseIpv6('2001:db8::1')!.length).toBe(16);
    expect([...parseIpv6('::ffff:10.0.0.1')!.slice(10)]).toEqual([255, 255, 10, 0, 0, 1]);
    expect(parseIpv6('0:0:0:0:0:0:0:1')![15]).toBe(1);
  });

  it('refuses a zone identifier and malformed compression', () => {
    expect(parseIpv6('fe80::1%eth0')).toBeNull();
    expect(parseIpv6('1::2::3')).toBeNull();
    expect(parseIpv6(':::1')).toBeNull();
    expect(parseIpv6('1:2:3:4:5:6:7')).toBeNull();
    expect(parseIpv6('1:2:3:4:5:6:7:8:9')).toBeNull();
    expect(parseIpv6('12345::1')).toBeNull();
  });
});

describe('classifyIpAddress: forbidden IPv4 space', () => {
  const forbidden: Array<[string, string]> = [
    ['0.0.0.0', 'unspecified'],
    ['127.0.0.1', 'loopback'],
    ['127.255.255.254', 'loopback'],
    ['10.0.0.1', 'private'],
    ['10.255.255.255', 'private'],
    ['172.16.0.1', 'private'],
    ['172.31.255.254', 'private'],
    ['192.168.1.1', 'private'],
    ['100.64.0.1', 'carrier_grade_nat'],
    ['169.254.1.1', 'link_local'],
    ['169.254.169.254', 'link_local'],
    ['192.0.0.1', 'ietf_protocol_assignment'],
    ['192.0.2.1', 'documentation'],
    ['198.51.100.1', 'documentation'],
    ['203.0.113.1', 'documentation'],
    ['198.18.0.1', 'benchmarking'],
    ['192.88.99.1', 'relay_or_translation'],
    ['224.0.0.1', 'multicast'],
    ['240.0.0.1', 'reserved'],
    ['255.255.255.255', 'reserved'],
  ];

  for (const [address, reason] of forbidden) {
    it(`refuses ${address} as ${reason}`, () => {
      const verdict = classifyIpAddress(address);
      expect(verdict.isPublic).toBe(false);
      expect(verdict.reason).toBe(reason);
      expect(verdict.family).toBe('IPV4');
    });
  }

  it('permits ordinary public IPv4', () => {
    for (const address of ['8.8.8.8', '193.51.192.1', '172.15.255.255', '172.32.0.1', '99.1.1.1']) {
      expect(classifyIpAddress(address), address).toEqual({
        family: 'IPV4',
        isPublic: true,
        reason: null,
      });
    }
  });

  it('does not confuse a neighbouring range with a private one', () => {
    // The exact reason string comparison is not enough: these are the addresses
    // a prefix check gets wrong.
    expect(classifyIpAddress('172.15.0.1').isPublic).toBe(true);
    expect(classifyIpAddress('172.32.0.1').isPublic).toBe(true);
    expect(classifyIpAddress('100.63.255.255').isPublic).toBe(true);
    expect(classifyIpAddress('100.128.0.1').isPublic).toBe(true);
    expect(classifyIpAddress('169.253.0.1').isPublic).toBe(true);
    expect(classifyIpAddress('198.20.0.1').isPublic).toBe(true);
  });
});

describe('classifyIpAddress: forbidden IPv6 space', () => {
  const forbidden: Array<[string, string]> = [
    ['::', 'unspecified'],
    ['::1', 'loopback'],
    ['fc00::1', 'unique_local'],
    ['fd12:3456::1', 'unique_local'],
    ['fe80::1', 'link_local'],
    ['febf::1', 'link_local'],
    ['ff02::1', 'multicast'],
    ['2001:db8::1', 'documentation'],
    ['2001::1', 'relay_or_translation'],
    ['2002::1', 'relay_or_translation'],
    ['64:ff9b::1', 'relay_or_translation'],
    ['100::1', 'reserved'],
  ];

  for (const [address, reason] of forbidden) {
    it(`refuses ${address} as ${reason}`, () => {
      const verdict = classifyIpAddress(address);
      expect(verdict.isPublic).toBe(false);
      expect(verdict.reason).toBe(reason);
      expect(verdict.family).toBe('IPV6');
    });
  }

  it('permits ordinary public IPv6', () => {
    for (const address of ['2a00:1450:4007:80f::200e', '2606:4700::1111']) {
      expect(classifyIpAddress(address), address).toEqual({
        family: 'IPV6',
        isPublic: true,
        reason: null,
      });
    }
  });

  it('refuses an IPv4-mapped address, and names the embedded reason', () => {
    // A private IPv4 address spelled as IPv6 is the same forbidden host, and a
    // check that looked only at IPv6 prefixes would wave it straight through.
    expect(classifyIpAddress('::ffff:10.0.0.1')).toEqual({
      family: 'IPV6',
      isPublic: false,
      reason: 'private',
    });
    expect(classifyIpAddress('::ffff:127.0.0.1').reason).toBe('loopback');
    expect(classifyIpAddress('::ffff:169.254.169.254').reason).toBe('link_local');
    // Even a PUBLIC embedded address is refused: an AAAA record has no
    // legitimate reason to contain ::ffff:0:0/96.
    expect(classifyIpAddress('::ffff:8.8.8.8')).toEqual({
      family: 'IPV6',
      isPublic: false,
      reason: 'ipv4_mapped',
    });
  });

  it('refuses an unparsable value rather than defaulting to public', () => {
    expect(classifyIpAddress('not-an-address')).toEqual({
      family: null,
      isPublic: false,
      reason: 'unparsable',
    });
    expect(classifyIpAddress('')).toEqual({ family: null, isPublic: false, reason: 'unparsable' });
  });
});

describe('isIpLiteral', () => {
  it('recognises both families, bracketed or not', () => {
    expect(isIpLiteral('127.0.0.1')).toBe(true);
    expect(isIpLiteral('::1')).toBe(true);
    expect(isIpLiteral('[::1]')).toBe(true);
    expect(isIpLiteral('2001:db8::1')).toBe(true);
  });

  it('does not mistake a hostname for an address', () => {
    expect(isIpLiteral('example.ac.uk')).toBe(false);
    expect(isIpLiteral('localhost')).toBe(false);
    expect(isIpLiteral('1.2.3.4.example.com')).toBe(false);
  });
});
