/**
 * Executable proof of the destructive-operation guards.
 *
 * Phase 1A lost a 2289-row working database once, to integration tests pointed
 * at `nwf_pe`. The separate `nwf_pe_test` database fixed the configuration; this
 * file proves the guard that makes the configuration mistake impossible to
 * repeat silently. Never relax these assertions to make a run green.
 */
import { describe, expect, it } from 'vitest';
import {
  assertLocalDatabaseUrl,
  assertTestDatabaseUrl,
  databaseNameFromUrl,
  isTestDatabaseName,
  UnsafeDatabaseTargetError,
} from '../../db/safety.js';

const LOCAL = 'postgres://nwf_owner:local_dev_only@127.0.0.1:55432';

describe('destructive-target guard: database name', () => {
  it('accepts the integration-test database', () => {
    expect(assertTestDatabaseUrl(`${LOCAL}/nwf_pe_test`)).toBe(`${LOCAL}/nwf_pe_test`);
  });

  it('refuses the working database', () => {
    expect(() => assertTestDatabaseUrl(`${LOCAL}/nwf_pe`)).toThrow(UnsafeDatabaseTargetError);
    expect(() => assertTestDatabaseUrl(`${LOCAL}/nwf_pe`)).toThrow(/must end in "_test"/);
  });

  it('refuses names that merely resemble a test database', () => {
    for (const name of [
      'nwf_pe',
      'postgres',
      'nwf_pe_prod',
      'nwf_pe_test_backup',
      'test',
      'testing',
      '_test',
      '',
    ]) {
      expect(() => assertTestDatabaseUrl(`${LOCAL}/${name}`), name).toThrow(
        UnsafeDatabaseTargetError,
      );
    }
  });

  it('refuses an unparseable connection string rather than falling through', () => {
    expect(() => assertTestDatabaseUrl('not a url')).toThrow(UnsafeDatabaseTargetError);
  });

  it('reads the database name from the url path, not from a substring match', () => {
    expect(databaseNameFromUrl(`${LOCAL}/nwf_pe_test`)).toBe('nwf_pe_test');
    // A "_test" anywhere but the database name must not qualify.
    expect(
      isTestDatabaseName(
        databaseNameFromUrl('postgres://nwf_owner:local_dev_only@host_test:5432/nwf_pe'),
      ),
    ).toBe(false);
  });
});

describe('destructive-target guard: db:reset is local only', () => {
  it('accepts a loopback host', () => {
    for (const host of ['127.0.0.1', 'localhost', '[::1]']) {
      expect(
        assertLocalDatabaseUrl(`postgres://nwf_owner:local_dev_only@${host}:55432/nwf_pe`),
      ).toBeTruthy();
    }
  });

  it('refuses any remote host', () => {
    for (const host of ['db.example.com', '10.0.0.5', 'aws-0-eu-central-1.pooler.example.net']) {
      expect(
        () => assertLocalDatabaseUrl(`postgres://nwf_owner:local_dev_only@${host}:5432/nwf_pe`),
        host,
      ).toThrow(UnsafeDatabaseTargetError);
    }
  });
});
