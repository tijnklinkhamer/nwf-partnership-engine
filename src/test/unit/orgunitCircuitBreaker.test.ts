import { describe, expect, it } from 'vitest';
import { createHostCircuitBreaker } from '../../orgunits/orchestrator/circuitBreaker.js';
import { CIRCUIT_BREAKER_TRANSIENT_FAILURE_THRESHOLD } from '../../orgunits/orchestrator/constants.js';

describe('HostCircuitBreaker', () => {
  it('starts closed for an unseen host', () => {
    const breaker = createHostCircuitBreaker();
    expect(breaker.isOpen('example.edu')).toBe(false);
  });

  it('a DNS failure opens the circuit immediately', () => {
    const breaker = createHostCircuitBreaker();
    breaker.recordTerminalFailure('dead.example.edu', 'DNS_FAILURE');
    expect(breaker.isOpen('dead.example.edu')).toBe(true);
    expect(breaker.openHosts()).toEqual(['dead.example.edu']);
  });

  it('a single transient timeout does NOT open the circuit', () => {
    const breaker = createHostCircuitBreaker();
    breaker.recordTransientFailure('slow.example.edu', 'CONNECT_TIMEOUT');
    expect(breaker.isOpen('slow.example.edu')).toBe(false);
  });

  it('opens after CIRCUIT_BREAKER_TRANSIENT_FAILURE_THRESHOLD consecutive transient failures', () => {
    const breaker = createHostCircuitBreaker();
    for (let i = 0; i < CIRCUIT_BREAKER_TRANSIENT_FAILURE_THRESHOLD - 1; i += 1) {
      breaker.recordTransientFailure('flaky.example.edu', 'READ_TIMEOUT');
    }
    expect(breaker.isOpen('flaky.example.edu')).toBe(false);
    breaker.recordTransientFailure('flaky.example.edu', 'READ_TIMEOUT');
    expect(breaker.isOpen('flaky.example.edu')).toBe(true);
  });

  it('a success resets the transient streak', () => {
    const breaker = createHostCircuitBreaker();
    for (let i = 0; i < CIRCUIT_BREAKER_TRANSIENT_FAILURE_THRESHOLD - 1; i += 1) {
      breaker.recordTransientFailure('recovers.example.edu', 'CONNECT_TIMEOUT');
    }
    breaker.recordSuccess('recovers.example.edu');
    breaker.recordTransientFailure('recovers.example.edu', 'CONNECT_TIMEOUT');
    expect(breaker.isOpen('recovers.example.edu')).toBe(false);
    expect(breaker.snapshot('recovers.example.edu').consecutiveTransientFailures).toBe(1);
  });

  it('a 404 (recorded as success - a response was received) does not open the circuit', () => {
    const breaker = createHostCircuitBreaker();
    for (let i = 0; i < 10; i += 1) breaker.recordSuccess('ordinary.example.edu');
    expect(breaker.isOpen('ordinary.example.edu')).toBe(false);
  });

  it('a page-level issue (RESPONSE_TOO_LARGE/non-HTML/charset) never opens the circuit', () => {
    const breaker = createHostCircuitBreaker();
    for (let i = 0; i < 20; i += 1) breaker.recordPageLevelIssue('busy.example.edu');
    expect(breaker.isOpen('busy.example.edu')).toBe(false);
    expect(breaker.snapshot('busy.example.edu').consecutiveTransientFailures).toBe(0);
  });

  it('once open, further transient failures do not change the recorded reason', () => {
    const breaker = createHostCircuitBreaker();
    breaker.recordTerminalFailure('dead.example.edu', 'DNS_FAILURE');
    breaker.recordTransientFailure('dead.example.edu', 'CONNECT_TIMEOUT');
    expect(breaker.snapshot('dead.example.edu').openedReason).toBe('DNS_FAILURE');
  });

  it('hosts are compared case-insensitively', () => {
    const breaker = createHostCircuitBreaker();
    breaker.recordTerminalFailure('Example.EDU', 'DNS_FAILURE');
    expect(breaker.isOpen('example.edu')).toBe(true);
  });

  it('an open circuit means zero further calls would ever be made (isOpen stays true forever - no un-open path in this slice)', () => {
    const breaker = createHostCircuitBreaker();
    breaker.recordTerminalFailure('dead.example.edu', 'HOST_ADDRESS_FORBIDDEN');
    breaker.recordSuccess('dead.example.edu');
    expect(breaker.isOpen('dead.example.edu')).toBe(true);
  });

  it('two hosts are tracked independently', () => {
    const breaker = createHostCircuitBreaker();
    breaker.recordTerminalFailure('a.example.edu', 'DNS_FAILURE');
    expect(breaker.isOpen('a.example.edu')).toBe(true);
    expect(breaker.isOpen('b.example.edu')).toBe(false);
  });
});
