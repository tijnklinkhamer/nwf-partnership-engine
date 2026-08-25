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

  it('names 2B-1c as where a real authority comes from', () => {
    const original = process.env['VITEST'];
    try {
      delete process.env['VITEST'];
      expect(() => RobotsAuthorisation.forTestsOnly('ALLOWED')).toThrow(/2B-1c/);
    } finally {
      if (original === undefined) delete process.env['VITEST'];
      else process.env['VITEST'] = original;
    }
  });
});
