/**
 * The robots.txt parser and matcher: group selection, path matching (`*`,
 * `$`, longest-match-wins, the Allow/Disallow tie), Crawl-delay clamping, and
 * the honest outcomes (no file, unreadable) that are NOT matching decisions.
 */
import { describe, expect, it } from 'vitest';
import {
  EvaluatedRobotsPolicy,
  canonicaliseUriComponent,
  clampCrawlDelay,
  isRfc9309ProductToken,
} from '../../orgunits/web/robotsPolicy.js';
import { ROBOTS_USER_AGENT_TOKEN } from '../../orgunits/web/robots.js';
import { RESEARCH_USER_AGENT } from '../../orgunits/web/policy.js';

const UA = 'NWFPartnershipEngine-Research';

describe('EvaluatedRobotsPolicy: group selection', () => {
  it('a group specifically matching the NWF token wins over *', () => {
    const body = [
      'User-agent: *',
      'Disallow: /',
      '',
      'User-agent: NWFPartnershipEngine-Research',
      'Allow: /',
    ].join('\n');
    const policy = EvaluatedRobotsPolicy.fromBody(body);
    expect(policy.evaluate(UA, '/anything')).toEqual({ decision: 'ALLOWED', rule: 'Allow: /' });
  });

  it('User-agent: * applies as fallback when no specific group exists', () => {
    const body = 'User-agent: *\nDisallow: /private';
    const policy = EvaluatedRobotsPolicy.fromBody(body);
    expect(policy.evaluate(UA, '/private/x')).toEqual({
      decision: 'DISALLOWED',
      rule: 'Disallow: /private',
    });
    expect(policy.evaluate(UA, '/public')).toEqual({ decision: 'ALLOWED', rule: null });
  });

  it('no matching group at all means unrestricted access', () => {
    const body = 'User-agent: SomeOtherBot\nDisallow: /';
    const policy = EvaluatedRobotsPolicy.fromBody(body);
    expect(policy.evaluate(UA, '/anything')).toEqual({ decision: 'ALLOWED', rule: null });
  });

  it('matches the user-agent token case-insensitively', () => {
    const body = 'User-agent: nwfpartnershipengine-research\nDisallow: /x';
    const policy = EvaluatedRobotsPolicy.fromBody(body);
    expect(policy.evaluate(UA, '/x')).toEqual({ decision: 'DISALLOWED', rule: 'Disallow: /x' });
  });

  it('groups several consecutive User-agent lines into one group', () => {
    const body = ['User-agent: BotA', 'User-agent: BotB', 'Disallow: /x'].join('\n');
    const policy = EvaluatedRobotsPolicy.fromBody(body);
    expect(policy.evaluate('BotA', '/x').decision).toBe('DISALLOWED');
    expect(policy.evaluate('BotB', '/x').decision).toBe('DISALLOWED');
  });
});

describe('EvaluatedRobotsPolicy: Allow/Disallow path matching', () => {
  it('matches a simple Disallow prefix', () => {
    const policy = EvaluatedRobotsPolicy.fromBody('User-agent: *\nDisallow: /admin');
    expect(policy.evaluate(UA, '/admin/panel').decision).toBe('DISALLOWED');
    expect(policy.evaluate(UA, '/adminX').decision).toBe('DISALLOWED'); // prefix match, no wildcard needed
    expect(policy.evaluate(UA, '/public').decision).toBe('ALLOWED');
  });

  it('supports the * wildcard', () => {
    const policy = EvaluatedRobotsPolicy.fromBody('User-agent: *\nDisallow: /*.pdf');
    expect(policy.evaluate(UA, '/docs/file.pdf').decision).toBe('DISALLOWED');
    expect(policy.evaluate(UA, '/docs/file.pdf.html').decision).toBe('DISALLOWED');
    expect(policy.evaluate(UA, '/docs/file.html').decision).toBe('ALLOWED');
  });

  it('supports the $ end-anchor', () => {
    const policy = EvaluatedRobotsPolicy.fromBody('User-agent: *\nDisallow: /*.pdf$');
    expect(policy.evaluate(UA, '/docs/file.pdf').decision).toBe('DISALLOWED');
    expect(policy.evaluate(UA, '/docs/file.pdf.html').decision).toBe('ALLOWED');
  });

  it('an empty Disallow value disallows nothing', () => {
    const policy = EvaluatedRobotsPolicy.fromBody('User-agent: *\nDisallow:');
    expect(policy.evaluate(UA, '/anything').decision).toBe('ALLOWED');
  });

  it('LONGEST MATCH WINS regardless of declaration order', () => {
    const policy = EvaluatedRobotsPolicy.fromBody(
      ['User-agent: *', 'Disallow: /international', 'Allow: /international/office'].join('\n'),
    );
    expect(policy.evaluate(UA, '/international/office/staff')).toEqual({
      decision: 'ALLOWED',
      rule: 'Allow: /international/office',
    });
    expect(policy.evaluate(UA, '/international/other')).toEqual({
      decision: 'DISALLOWED',
      rule: 'Disallow: /international',
    });
  });

  it('an EXACT specificity tie is won by Allow', () => {
    const policy = EvaluatedRobotsPolicy.fromBody(
      ['User-agent: *', 'Allow: /x', 'Disallow: /x'].join('\n'),
    );
    expect(policy.evaluate(UA, '/x')).toEqual({ decision: 'ALLOWED', rule: 'Allow: /x' });
  });

  it('ignores comments', () => {
    const policy = EvaluatedRobotsPolicy.fromBody(
      ['User-agent: * # everyone', '# block admin', 'Disallow: /admin # no bots here'].join('\n'),
    );
    expect(policy.evaluate(UA, '/admin').decision).toBe('DISALLOWED');
    expect(policy.evaluate(UA, '/admin').rule).toBe('Disallow: /admin');
  });

  it('caps a stored rule at 512 characters', () => {
    const longPath = '/x'.repeat(400);
    const policy = EvaluatedRobotsPolicy.fromBody(`User-agent: *\nDisallow: ${longPath}`);
    const result = policy.evaluate(UA, longPath);
    expect(result.decision).toBe('DISALLOWED');
    expect(result.rule).not.toBeNull();
    expect(result.rule!.length).toBeLessThanOrEqual(512);
  });

  it('no applicable rule within a matched group yields ALLOWED with no invented rule string', () => {
    const policy = EvaluatedRobotsPolicy.fromBody('User-agent: *\nDisallow: /admin');
    expect(policy.evaluate(UA, '/elsewhere')).toEqual({ decision: 'ALLOWED', rule: null });
  });
});

describe('EvaluatedRobotsPolicy: honest non-matching outcomes', () => {
  it('an empty body means no restrictions (NO_ROBOTS_FILE)', () => {
    const policy = EvaluatedRobotsPolicy.fromBody('');
    expect(policy.hasNoFile).toBe(true);
    expect(policy.evaluate(UA, '/anything')).toEqual({ decision: 'NO_ROBOTS_FILE', rule: null });
  });

  it('a whitespace-only body means no restrictions too', () => {
    const policy = EvaluatedRobotsPolicy.fromBody('   \n\n  ');
    expect(policy.evaluate(UA, '/x').decision).toBe('NO_ROBOTS_FILE');
  });

  it('noRestrictions() (404/other 4xx) means no restrictions', () => {
    const policy = EvaluatedRobotsPolicy.noRestrictions();
    expect(policy.evaluate(UA, '/anything')).toEqual({ decision: 'NO_ROBOTS_FILE', rule: null });
  });

  it('unavailable() blocks every ordinary request, honestly labelled', () => {
    for (const reason of ['FETCH_FAILED', 'SERVER_ERROR', 'UNPARSEABLE', 'REDIRECTED'] as const) {
      const policy = EvaluatedRobotsPolicy.unavailable(reason);
      expect(policy.isUnavailable).toBe(true);
      expect(policy.unavailableReason).toBe(reason);
      expect(policy.evaluate(UA, '/anything')).toEqual({
        decision: 'ROBOTS_UNREADABLE',
        rule: null,
      });
    }
  });

  it('a genuinely unparseable body still parses to SOMETHING rather than throwing', () => {
    // Garbage input is simply ignored line-by-line; it never throws, and it
    // never behaves as though rules were found where none were.
    const policy = EvaluatedRobotsPolicy.fromBody('%%%not robots syntax%%%\n\x00\x01\x02');
    expect(() => policy.evaluate(UA, '/x')).not.toThrow();
  });
});

describe('EvaluatedRobotsPolicy: identity is unforgeable', () => {
  it('isEvaluatedPolicy is true only for a real instance', () => {
    const real = EvaluatedRobotsPolicy.fromBody('User-agent: *\nDisallow: /x');
    expect(EvaluatedRobotsPolicy.isEvaluatedPolicy(real)).toBe(true);
    expect(EvaluatedRobotsPolicy.isEvaluatedPolicy({ decision: 'ALLOWED', rule: null })).toBe(
      false,
    );
    expect(EvaluatedRobotsPolicy.isEvaluatedPolicy(null)).toBe(false);
    expect(EvaluatedRobotsPolicy.isEvaluatedPolicy(undefined)).toBe(false);
    expect(EvaluatedRobotsPolicy.isEvaluatedPolicy('ALLOWED')).toBe(false);
  });
});

describe('Crawl-delay: parsing and the approved clamp', () => {
  it('clamps a value below 1.2 up to 1.2', () => {
    expect(clampCrawlDelay(0)).toBe(1.2);
    expect(clampCrawlDelay(0.5)).toBe(1.2);
  });

  it('leaves a normal value unclamped', () => {
    expect(clampCrawlDelay(2)).toBe(2);
    expect(clampCrawlDelay(1.2)).toBe(1.2);
    expect(clampCrawlDelay(5)).toBe(5);
  });

  it('clamps a value above 5 down to 5', () => {
    expect(clampCrawlDelay(10)).toBe(5);
    expect(clampCrawlDelay(999)).toBe(5);
  });

  it('is exposed through the parsed policy, per matched agent', () => {
    const policy = EvaluatedRobotsPolicy.fromBody(
      [
        'User-agent: *',
        'Crawl-delay: 10',
        '',
        'User-agent: NWFPartnershipEngine-Research',
        'Crawl-delay: 0.1',
      ].join('\n'),
    );
    expect(policy.crawlDelaySecondsFor(UA)).toBe(1.2); // 0.1 clamped up
    expect(policy.crawlDelaySecondsFor('SomeOtherBot')).toBe(5); // 10 clamped down, via * fallback
  });

  it('is null when no group declared one', () => {
    const policy = EvaluatedRobotsPolicy.fromBody('User-agent: *\nDisallow: /x');
    expect(policy.crawlDelaySecondsFor(UA)).toBeNull();
  });

  it('is null for an unavailable or no-file policy', () => {
    expect(EvaluatedRobotsPolicy.unavailable('SERVER_ERROR').crawlDelaySecondsFor(UA)).toBeNull();
    expect(EvaluatedRobotsPolicy.noRestrictions().crawlDelaySecondsFor(UA)).toBeNull();
  });
});

describe('RFC 9309 s2.2.1: MULTIPLE MATCHING GROUPS ARE COMBINED', () => {
  it('THE TASK EXAMPLE: two separate specific groups combine, neither overwrites the other', () => {
    const body = [
      'User-agent: NWFPartnershipEngine-Research',
      'Disallow: /private-a',
      '',
      'User-agent: OtherBot',
      'Disallow: /',
      '',
      'User-agent: NWFPartnershipEngine-Research',
      'Disallow: /private-b',
    ].join('\n');
    const policy = EvaluatedRobotsPolicy.fromBody(body);
    expect(policy.evaluate(UA, '/private-a').decision).toBe('DISALLOWED');
    expect(policy.evaluate(UA, '/private-b').decision).toBe('DISALLOWED');
    // Nothing outside either declared path is touched by either group.
    expect(policy.evaluate(UA, '/public').decision).toBe('ALLOWED');
    // OtherBot's own group is never combined into ours.
    expect(policy.evaluate('OtherBot', '/public').decision).toBe('DISALLOWED');
  });

  it('combines THREE OR MORE matching specific groups', () => {
    const body = [
      'User-agent: NWFPartnershipEngine-Research',
      'Disallow: /a',
      '',
      'User-agent: NWFPartnershipEngine-Research',
      'Disallow: /b',
      '',
      'User-agent: NWFPartnershipEngine-Research',
      'Disallow: /c',
    ].join('\n');
    const policy = EvaluatedRobotsPolicy.fromBody(body);
    for (const path of ['/a', '/b', '/c']) {
      expect(policy.evaluate(UA, path).decision, path).toBe('DISALLOWED');
    }
    expect(policy.evaluate(UA, '/d').decision).toBe('ALLOWED');
  });

  it('combines multiple WILDCARD groups when no specific group matches', () => {
    const body = ['User-agent: *', 'Disallow: /x', '', 'User-agent: *', 'Disallow: /y'].join('\n');
    const policy = EvaluatedRobotsPolicy.fromBody(body);
    expect(policy.evaluate(UA, '/x').decision).toBe('DISALLOWED');
    expect(policy.evaluate(UA, '/y').decision).toBe('DISALLOWED');
  });

  it('one or more matching SPECIFIC groups take precedence over ALL wildcard groups combined', () => {
    const body = [
      'User-agent: *',
      'Disallow: /everything',
      '',
      'User-agent: *',
      'Disallow: /also-everything',
      '',
      'User-agent: NWFPartnershipEngine-Research',
      'Allow: /',
    ].join('\n');
    const policy = EvaluatedRobotsPolicy.fromBody(body);
    // The specific group(s) win outright; the wildcard groups are not
    // consulted at all once a specific match exists.
    expect(policy.evaluate(UA, '/everything').decision).toBe('ALLOWED');
    expect(policy.evaluate(UA, '/also-everything').decision).toBe('ALLOWED');
  });

  it('rules combine across groups for LONGEST-MATCH purposes too', () => {
    // The more specific rule wins regardless of which of the two combined
    // groups declared it.
    const body = [
      'User-agent: NWFPartnershipEngine-Research',
      'Disallow: /international',
      '',
      'User-agent: NWFPartnershipEngine-Research',
      'Allow: /international/office',
    ].join('\n');
    const policy = EvaluatedRobotsPolicy.fromBody(body);
    expect(policy.evaluate(UA, '/international/office/staff')).toEqual({
      decision: 'ALLOWED',
      rule: 'Allow: /international/office',
    });
  });

  it('Crawl-delay across combined groups uses the MAXIMUM (most conservative pacing)', () => {
    const body = [
      'User-agent: NWFPartnershipEngine-Research',
      'Crawl-delay: 2',
      '',
      'User-agent: NWFPartnershipEngine-Research',
      'Crawl-delay: 4',
    ].join('\n');
    const policy = EvaluatedRobotsPolicy.fromBody(body);
    expect(policy.crawlDelaySecondsFor(UA)).toBe(4);
  });
});

describe('RFC 9309 s2.2.1: the product-token grammar', () => {
  it('accepts letters, hyphens and underscores only', () => {
    expect(isRfc9309ProductToken('Googlebot')).toBe(true);
    expect(isRfc9309ProductToken('NWFPartnershipEngine-Research')).toBe(true);
    expect(isRfc9309ProductToken('some_token')).toBe(true);
  });

  it('rejects digits, slashes, dots and other characters the grammar excludes', () => {
    expect(isRfc9309ProductToken('Googlebot/2.1')).toBe(false);
    expect(isRfc9309ProductToken('NWFPartnershipEngine-Research/1.0')).toBe(false);
    expect(isRfc9309ProductToken('bot.name')).toBe(false);
    expect(isRfc9309ProductToken('bot name')).toBe(false);
    expect(isRfc9309ProductToken('')).toBe(false);
  });

  it('THE REPOSITORY OWN TOKEN is grammar-valid AND a literal substring of the full UA', () => {
    expect(isRfc9309ProductToken(ROBOTS_USER_AGENT_TOKEN)).toBe(true);
    expect(ROBOTS_USER_AGENT_TOKEN).toBe('NWFPartnershipEngine-Research');
    expect(RESEARCH_USER_AGENT).toContain(ROBOTS_USER_AGENT_TOKEN);
  });
});

describe('RFC 9309 s2.2.2: URI matching, canonicalised at the octet level', () => {
  it('a percent-encoded UNRESERVED octet equals its literal character', () => {
    // The exact equivalence named in the correction brief.
    expect(canonicaliseUriComponent('%62%61%7A')).toBe(canonicaliseUriComponent('baz'));
    expect(canonicaliseUriComponent('%62%61%7A')).toBe('baz');
  });

  it('a percent-encoded RESERVED octet is NEVER decoded to its literal form', () => {
    // %2F ("/") inside what would otherwise be one path segment must stay
    // %2F: decoding it would merge two segments into one and change what the
    // path means.
    expect(canonicaliseUriComponent('%2F')).toBe('%2F');
    expect(canonicaliseUriComponent('a%2Fb')).not.toBe('a/b');
    expect(canonicaliseUriComponent('a%2Fb')).toBe('a%2Fb');
  });

  it('hex digits are normalised to UPPERCASE for a stable comparison', () => {
    expect(canonicaliseUriComponent('%2f')).toBe('%2F');
    expect(canonicaliseUriComponent('%2F')).toBe(canonicaliseUriComponent('%2f'));
  });

  it('literal unreserved characters are already canonical and pass through unchanged', () => {
    expect(canonicaliseUriComponent('abcXYZ019-._~')).toBe('abcXYZ019-._~');
  });

  it('literal structural/reserved delimiters survive, so path segmentation is preserved', () => {
    expect(canonicaliseUriComponent('/a/b/c')).toBe('/a/b/c');
    expect(canonicaliseUriComponent('/x?y=1&z=2')).toBe('/x?y=1&z=2');
  });

  it('non-ASCII content compares equal whether written literally or percent-encoded UTF-8', () => {
    // "café" - the literal spelling and its percent-encoded UTF-8 spelling.
    expect(canonicaliseUriComponent('café')).toBe(canonicaliseUriComponent('caf%C3%A9'));
    expect(canonicaliseUriComponent('café')).toBe('caf%C3%A9');
  });

  it('lowercase percent-encoded non-ASCII bytes normalise the same as uppercase', () => {
    expect(canonicaliseUriComponent('caf%c3%a9')).toBe('caf%C3%A9');
  });

  it('wildcard * and end-anchor $ survive canonicalisation as literal metacharacters', () => {
    expect(canonicaliseUriComponent('/*.pdf$')).toBe('/*.pdf$');
  });

  it('a PERCENT-ENCODED wildcard character is a literal character, never a wildcard', () => {
    // %2A decodes to "*", a reserved/sub-delim byte - it must stay %2A, not
    // become a literal "*" that the pattern compiler would treat as wildcard
    // syntax.
    expect(canonicaliseUriComponent('%2A')).toBe('%2A');
    expect(canonicaliseUriComponent('%24')).toBe('%24');
  });
});

describe('RFC 9309 s2.2.2: matching applies the SAME canonicalisation to rule and path', () => {
  it('a percent-encoded rule value matches a literally-spelled request path', () => {
    const policy = EvaluatedRobotsPolicy.fromBody('User-agent: *\nDisallow: /%62%61%7A');
    expect(policy.evaluate(UA, '/baz').decision).toBe('DISALLOWED');
  });

  it('a literally-spelled rule value matches a percent-encoded request path', () => {
    const policy = EvaluatedRobotsPolicy.fromBody('User-agent: *\nDisallow: /baz');
    expect(policy.evaluate(UA, '/%62%61%7A').decision).toBe('DISALLOWED');
  });

  it('a rule targeting a literal %2F does NOT match a request path with a literal slash there', () => {
    // Disallow: /a%2Fb means "disallow a path segment literally containing an
    // encoded slash", which is NOT the same resource as /a/b (two segments).
    const policy = EvaluatedRobotsPolicy.fromBody('User-agent: *\nDisallow: /a%2Fb$');
    expect(policy.evaluate(UA, '/a/b').decision).toBe('ALLOWED');
    expect(policy.evaluate(UA, '/a%2Fb').decision).toBe('DISALLOWED');
  });

  it('matches non-ASCII UTF-8 path content regardless of which side encoded it', () => {
    const policy = EvaluatedRobotsPolicy.fromBody('User-agent: *\nDisallow: /café');
    expect(policy.evaluate(UA, '/caf%C3%A9').decision).toBe('DISALLOWED');
    expect(policy.evaluate(UA, '/café').decision).toBe('DISALLOWED');
  });

  it('query strings are matched literally, as part of the rule target', () => {
    const policy = EvaluatedRobotsPolicy.fromBody('User-agent: *\nDisallow: /search?q=');
    expect(policy.evaluate(UA, '/search?q=test').decision).toBe('DISALLOWED');
    expect(policy.evaluate(UA, '/search').decision).toBe('ALLOWED');
  });

  it('wildcards still work correctly after canonicalisation', () => {
    const policy = EvaluatedRobotsPolicy.fromBody('User-agent: *\nDisallow: /*.pdf$');
    expect(policy.evaluate(UA, '/docs/%62%61%7A.pdf').decision).toBe('DISALLOWED');
    expect(policy.evaluate(UA, '/docs/baz.pdf').decision).toBe('DISALLOWED');
    expect(policy.evaluate(UA, '/docs/baz.pdf.html').decision).toBe('ALLOWED');
  });

  it('specificity is measured on the CANONICALISED octets, not the raw spelling length', () => {
    // "%62%61%7A" (9 raw characters) and "baz" (3 raw characters) must be
    // EQUALLY specific, because they are the same three-octet pattern.
    const policy = EvaluatedRobotsPolicy.fromBody(
      ['User-agent: *', 'Disallow: /x', 'Allow: /x%62%61%7A'].join('\n'),
    );
    // /x%62%61%7A canonicalises to /xbaz (5 octets), which is longer/more
    // specific than /x (2 octets) regardless of how it was spelled.
    expect(policy.evaluate(UA, '/xbaz')).toEqual({
      decision: 'ALLOWED',
      rule: 'Allow: /x%62%61%7A',
    });
  });

  it('an Allow/Disallow tie after canonicalisation still resolves to Allow', () => {
    const policy = EvaluatedRobotsPolicy.fromBody(
      ['User-agent: *', 'Allow: /%62%61%7A', 'Disallow: /baz'].join('\n'),
    );
    expect(policy.evaluate(UA, '/baz').decision).toBe('ALLOWED');
  });
});

describe('RFC 9309: parseable rules survive an unparseable/unknown line in the same record', () => {
  it('THE TASK EXAMPLE: an unrecognised line does not disappear the rules around it', () => {
    const body = [
      'User-agent: NWFPartnershipEngine-Research',
      'Disallow: /private',
      'THIS IS NOT A VALID RECORD',
      'Allow: /private/public',
    ].join('\n');
    const policy = EvaluatedRobotsPolicy.fromBody(body);
    expect(policy.evaluate(UA, '/private/other').decision).toBe('DISALLOWED');
    expect(policy.evaluate(UA, '/private/public').decision).toBe('ALLOWED');
  });

  it('an unknown directive with a colon is ignored without ending the group', () => {
    const body = [
      'User-agent: NWFPartnershipEngine-Research',
      'Disallow: /a',
      'Some-Future-Directive: value',
      'Disallow: /b',
    ].join('\n');
    const policy = EvaluatedRobotsPolicy.fromBody(body);
    expect(policy.evaluate(UA, '/a').decision).toBe('DISALLOWED');
    expect(policy.evaluate(UA, '/b').decision).toBe('DISALLOWED');
  });

  it('a line with no colon at all is ignored without ending the group', () => {
    const body = [
      'User-agent: NWFPartnershipEngine-Research',
      'Disallow: /a',
      'garbage with no colon',
      'Disallow: /b',
    ].join('\n');
    const policy = EvaluatedRobotsPolicy.fromBody(body);
    expect(policy.evaluate(UA, '/a').decision).toBe('DISALLOWED');
    expect(policy.evaluate(UA, '/b').decision).toBe('DISALLOWED');
  });
});
