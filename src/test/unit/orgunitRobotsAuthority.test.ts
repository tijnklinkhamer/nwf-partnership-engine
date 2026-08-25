/**
 * THE ROBOTS VERDICT IS A CAPABILITY, NOT DATA.
 *
 * The defect this replaces: an ordinary `robotsDecision: 'ALLOWED'` field let
 * any caller manufacture an authoritative-looking provenance without anything
 * ever having read the site's own rules.
 *
 * What is proved here is the part the firewall cannot prove - that the value
 * is unforgeable AT RUNTIME, so the boundary does not rest on a text scan of
 * source files. The firewall then proves the complementary part: that no
 * production file names the constructor or calls the gateway at all.
 */
import { describe, expect, it } from 'vitest';
import { RobotsAuthorisation } from '../../orgunits/web/robotsAuthority.js';
import { EvaluatedRobotsPolicy } from '../../orgunits/web/robotsPolicy.js';

describe('RobotsAuthorisation: cannot be forged', () => {
  it('refuses a structurally identical plain object', () => {
    // The shape is trivial to copy. The private field is not.
    expect(RobotsAuthorisation.isAuthorisation({ decision: 'ALLOWED', rule: null })).toBe(false);
  });

  it('refuses a class that merely mimics the shape', () => {
    class LooksTheSame {
      readonly decision = 'ALLOWED';
      readonly rule = null;
    }
    expect(RobotsAuthorisation.isAuthorisation(new LooksTheSame())).toBe(false);
  });

  it('refuses a value cast through the type system', () => {
    const forged = { decision: 'ALLOWED', rule: null } as unknown as RobotsAuthorisation;
    expect(RobotsAuthorisation.isAuthorisation(forged)).toBe(false);
  });

  it('refuses a clone of a genuine instance', () => {
    // Spread, Object.assign and structuredClone all copy PROPERTIES. A private
    // field is not a property, so none of them carries the capability across.
    const real = RobotsAuthorisation.forTestsOnly('ALLOWED');
    expect(RobotsAuthorisation.isAuthorisation({ ...real })).toBe(false);
    expect(RobotsAuthorisation.isAuthorisation(Object.assign({}, real))).toBe(false);
    expect(
      RobotsAuthorisation.isAuthorisation(Object.create(Object.getPrototypeOf(real) as object)),
    ).toBe(false);
  });

  it('refuses a value reconstructed from its own reflected keys', () => {
    // The brand is not reachable by reflection either: neither string keys nor
    // symbol keys expose it, so there is nothing to copy.
    const real = RobotsAuthorisation.forTestsOnly('ALLOWED');
    expect(Object.getOwnPropertySymbols(real)).toEqual([]);
    const rebuilt: Record<string | symbol, unknown> = {};
    for (const key of Reflect.ownKeys(real)) {
      rebuilt[key] = Reflect.get(real, key);
    }
    expect(RobotsAuthorisation.isAuthorisation(rebuilt)).toBe(false);
  });

  it('refuses null, undefined and primitives without throwing', () => {
    for (const value of [null, undefined, 'ALLOWED', 42, true, Symbol('x')]) {
      expect(RobotsAuthorisation.isAuthorisation(value)).toBe(false);
    }
  });

  it('accepts only what it constructed itself', () => {
    const real = RobotsAuthorisation.forTestsOnly('ALLOWED', 'Allow: /');
    expect(RobotsAuthorisation.isAuthorisation(real)).toBe(true);
    expect(real.decision).toBe('ALLOWED');
    expect(real.rule).toBe('Allow: /');
    expect(RobotsAuthorisation.forTestsOnly('NOT_APPLICABLE').rule).toBeNull();
  });
});

describe('RobotsAuthorisation: the constructor does not exist in production', () => {
  it('throws when the test runner is not the one calling it', () => {
    // The guard is on the RUNNING PROCESS, not on a naming convention, so
    // "production cannot manufacture a verdict" survives someone importing the
    // module anyway. Restored in a finally block so no later test inherits the
    // altered environment.
    const original = process.env['VITEST'];
    try {
      delete process.env['VITEST'];
      expect(() => RobotsAuthorisation.forTestsOnly('ALLOWED')).toThrow(/TEST SEAM/);
      process.env['VITEST'] = 'false';
      expect(() => RobotsAuthorisation.forTestsOnly('ALLOWED')).toThrow(/unavailable outside/);
    } finally {
      if (original === undefined) delete process.env['VITEST'];
      else process.env['VITEST'] = original;
    }
  });

  it('names the real production factories as where a real authority comes from', () => {
    const original = process.env['VITEST'];
    try {
      delete process.env['VITEST'];
      expect(() => RobotsAuthorisation.forTestsOnly('ALLOWED')).toThrow(
        /forEvaluatedPolicy|forRobotsTxtBootstrap/,
      );
    } finally {
      if (original === undefined) delete process.env['VITEST'];
      else process.env['VITEST'] = original;
    }
  });
});

describe('RobotsAuthorisation.forRobotsTxtBootstrap: exact-path scoping', () => {
  it('authorises exactly the robots.txt request, decision NOT_APPLICABLE', () => {
    const auth = RobotsAuthorisation.forRobotsTxtBootstrap('https://example.edu/robots.txt');
    expect(RobotsAuthorisation.isAuthorisation(auth)).toBe(true);
    expect(auth.decision).toBe('NOT_APPLICABLE');
    expect(auth.rule).toBeNull();
    expect(auth.scopedToUrl).toBe('https://example.edu/robots.txt');
  });

  it('refuses a URL that is not exactly /robots.txt', () => {
    expect(() => RobotsAuthorisation.forRobotsTxtBootstrap('https://example.edu/')).toThrow();
    expect(() =>
      RobotsAuthorisation.forRobotsTxtBootstrap('https://example.edu/international/robots.txt'),
    ).toThrow();
    expect(() =>
      RobotsAuthorisation.forRobotsTxtBootstrap('https://example.edu/robots.txt?x=1'),
    ).toThrow();
    expect(() =>
      RobotsAuthorisation.forRobotsTxtBootstrap('https://example.edu/robots.txt#frag'),
    ).toThrow();
  });

  it('refuses an unparsable URL', () => {
    expect(() => RobotsAuthorisation.forRobotsTxtBootstrap('not a url')).toThrow();
  });

  it('preserves scheme and host exactly, for both http and https', () => {
    expect(
      RobotsAuthorisation.forRobotsTxtBootstrap('http://example.edu/robots.txt').scopedToUrl,
    ).toBe('http://example.edu/robots.txt');
    expect(
      RobotsAuthorisation.forRobotsTxtBootstrap('https://intl.example.edu/robots.txt').scopedToUrl,
    ).toBe('https://intl.example.edu/robots.txt');
  });
});

describe('RobotsAuthorisation.forEvaluatedPolicy: derived from a real policy, scoped to one page', () => {
  const UA = 'NWFPartnershipEngine-Research/1.0';

  it('derives ALLOWED from a real parsed policy', () => {
    const policy = EvaluatedRobotsPolicy.fromBody('User-agent: *\nAllow: /');
    const auth = RobotsAuthorisation.forEvaluatedPolicy(policy, 'https://example.edu/office', UA);
    expect(RobotsAuthorisation.isAuthorisation(auth)).toBe(true);
    expect(auth.decision).toBe('ALLOWED');
    expect(auth.scopedToUrl).toBe('https://example.edu/office');
  });

  it('derives DISALLOWED and carries the matched rule', () => {
    const policy = EvaluatedRobotsPolicy.fromBody('User-agent: *\nDisallow: /admin');
    const auth = RobotsAuthorisation.forEvaluatedPolicy(
      policy,
      'https://example.edu/admin/panel',
      UA,
    );
    expect(auth.decision).toBe('DISALLOWED');
    expect(auth.rule).toBe('Disallow: /admin');
  });

  it('derives NO_ROBOTS_FILE from noRestrictions()', () => {
    const policy = EvaluatedRobotsPolicy.noRestrictions();
    const auth = RobotsAuthorisation.forEvaluatedPolicy(policy, 'https://example.edu/x', UA);
    expect(auth.decision).toBe('NO_ROBOTS_FILE');
  });

  it('derives ROBOTS_UNREADABLE from unavailable()', () => {
    const policy = EvaluatedRobotsPolicy.unavailable('SERVER_ERROR');
    const auth = RobotsAuthorisation.forEvaluatedPolicy(policy, 'https://example.edu/x', UA);
    expect(auth.decision).toBe('ROBOTS_UNREADABLE');
  });

  it('scopes to the exact page URL, path and query included', () => {
    const policy = EvaluatedRobotsPolicy.fromBody('User-agent: *\nAllow: /');
    const auth = RobotsAuthorisation.forEvaluatedPolicy(
      policy,
      'https://example.edu/office?tab=1',
      UA,
    );
    expect(auth.scopedToUrl).toBe('https://example.edu/office?tab=1');
  });

  it('REFUSES a hand-built object pretending to be an EvaluatedRobotsPolicy', () => {
    const forged = {
      evaluate: () => ({ decision: 'ALLOWED', rule: null }),
    };
    expect(() =>
      RobotsAuthorisation.forEvaluatedPolicy(forged as never, 'https://example.edu/x', UA),
    ).toThrow(/EvaluatedRobotsPolicy/);
  });

  it('refuses an unparsable target URL', () => {
    const policy = EvaluatedRobotsPolicy.fromBody('User-agent: *\nAllow: /');
    expect(() => RobotsAuthorisation.forEvaluatedPolicy(policy, 'not a url', UA)).toThrow();
  });
});

describe('THE SCOPING PROBLEM: an authority cannot be reused for a different URL', () => {
  it('a bootstrap authority is scoped ONLY to its own robots.txt URL', () => {
    const bootstrap = RobotsAuthorisation.forRobotsTxtBootstrap('https://example.edu/robots.txt');
    expect(bootstrap.scopedToUrl).not.toBe('https://example.edu/international/');
  });

  it('an ordinary-page authority is scoped ONLY to the page it was evaluated for', () => {
    const policy = EvaluatedRobotsPolicy.fromBody('User-agent: *\nAllow: /');
    const auth = RobotsAuthorisation.forEvaluatedPolicy(policy, 'https://example.edu/a', 'UA');
    expect(auth.scopedToUrl).not.toBe('https://example.edu/b');
  });

  it('only the unscoped test seam has scopedToUrl null, and it is unreachable in production', () => {
    expect(RobotsAuthorisation.forTestsOnly('ALLOWED').scopedToUrl).toBeNull();
  });
});
