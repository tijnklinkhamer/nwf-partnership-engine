/**
 * The robots.txt parser and matcher: group selection, path matching (`*`,
 * `$`, longest-match-wins, the Allow/Disallow tie), Crawl-delay clamping, and
 * the honest outcomes (no file, unreadable) that are NOT matching decisions.
 */
import { describe, expect, it } from 'vitest';
import { EvaluatedRobotsPolicy, clampCrawlDelay } from '../../orgunits/web/robotsPolicy.js';

const UA = 'NWFPartnershipEngine-Research/1.0';

describe('EvaluatedRobotsPolicy: group selection', () => {
  it('a group specifically matching the NWF token wins over *', () => {
    const body = [
      'User-agent: *',
      'Disallow: /',
      '',
      'User-agent: NWFPartnershipEngine-Research/1.0',
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
    const body = 'User-agent: nwfpartnershipengine-research/1.0\nDisallow: /x';
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
        'User-agent: NWFPartnershipEngine-Research/1.0',
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
