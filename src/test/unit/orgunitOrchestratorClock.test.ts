import { describe, expect, it } from 'vitest';
import { createFakeClock, realClock } from '../../orgunits/orchestrator/clock.js';

describe('orchestrator clock', () => {
  it('realClock.now returns a number and sleep resolves', async () => {
    const before = realClock.now();
    await realClock.sleep(0);
    expect(realClock.now()).toBeGreaterThanOrEqual(before);
  });

  it('fake clock does not advance on its own', () => {
    const clock = createFakeClock(100);
    expect(clock.now()).toBe(100);
    expect(clock.now()).toBe(100);
  });

  it('a sleep only resolves once the clock is advanced past its deadline', async () => {
    const clock = createFakeClock(0);
    let resolved = false;
    const p = clock.sleep(1000).then(() => {
      resolved = true;
    });
    clock.advance(500);
    await Promise.resolve();
    expect(resolved).toBe(false);
    clock.advance(500);
    await p;
    expect(resolved).toBe(true);
  });

  it('a zero or negative sleep resolves immediately without registering a pending timer', async () => {
    const clock = createFakeClock(0);
    await clock.sleep(0);
    expect(clock.pendingCount).toBe(0);
    await clock.sleep(-5);
    expect(clock.pendingCount).toBe(0);
  });

  it('resolves multiple pending sleeps in deadline order on one advance', async () => {
    const clock = createFakeClock(0);
    const order: string[] = [];
    const a = clock.sleep(300).then(() => order.push('a'));
    const b = clock.sleep(100).then(() => order.push('b'));
    const c = clock.sleep(200).then(() => order.push('c'));
    clock.advance(300);
    await Promise.all([a, b, c]);
    expect(order).toEqual(['b', 'c', 'a']);
  });
});
