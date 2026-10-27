/**
 * REL P2 - a DISPOSABLE login holding the NOLOGIN `nwf_source_discovery`
 * capability (migration 0019), for a disposable local test database ONLY.
 *
 * No migration creates a login for this capability, and none ever will: the
 * role stays NOLOGIN in `migrations/`. A deployment provisions its own login;
 * a test (or the local-only script `scripts/disposable-source-discovery-
 * login.ts`) creates one here, and only after every guard below passes:
 *
 *   - the admin connection string is a LOOPBACK host (`assertLocalDatabaseUrl`)
 *     and names a `*_test` database (`assertTestDatabaseUrl`), never `nwf_pe`;
 *   - the server it actually reaches agrees (`assertTestDatabaseConnection`
 *     asks `current_database()`), so a pool built elsewhere cannot slip past.
 *
 * THE LOGIN IS LEAST PRIVILEGE BY CONSTRUCTION:
 *   - `LOGIN NOINHERIT` with no attribute (no SUPERUSER, CREATEDB, CREATEROLE,
 *     REPLICATION or BYPASSRLS) and a small connection limit;
 *   - a member of `nwf_source_discovery` WITH INHERIT FALSE, SET TRUE, ADMIN
 *     FALSE: it holds NOTHING until it `SET ROLE`s into the capability, which
 *     is exactly what `store.ts` does inside each transaction;
 *   - one direct grant, CONNECT on this one database (NOINHERIT means the
 *     capability's own CONNECT is not inherited). No table, column, schema or
 *     sequence privilege is granted to the login itself.
 */
import { randomBytes } from 'node:crypto';
import type pg from 'pg';

import {
  UnsafeDatabaseTargetError,
  assertLocalDatabaseUrl,
  assertTestDatabaseConnection,
  assertTestDatabaseUrl,
  databaseNameFromUrl,
} from '../../db/safety.js';

export const SOURCE_DISCOVERY_CAPABILITY = 'nwf_source_discovery';
export const SOURCE_DISCOVERY_LOGIN_PREFIX = 'nwf_source_discovery_login';

/** The working database. Refused by name, whatever else the URL says. */
const WORKING_DATABASE = 'nwf_pe';

export interface DisposableLogin {
  readonly login: string;
  /** A connection string for the login: same host, port and database as the admin URL. */
  readonly url: string;
  /** Revokes CONNECT and drops the login. Idempotent. */
  drop(): Promise<void>;
}

/** Throws unless `adminUrl` is a loopback, `*_test`, non-`nwf_pe` target. */
export function assertDisposableTarget(adminUrl: string): string {
  assertLocalDatabaseUrl(adminUrl);
  assertTestDatabaseUrl(adminUrl);
  if (databaseNameFromUrl(adminUrl) === WORKING_DATABASE) {
    throw new UnsafeDatabaseTargetError(
      `Refusing to create a login in the working database "${WORKING_DATABASE}".`,
    );
  }
  return adminUrl;
}

/**
 * Creates one disposable `nwf_source_discovery_login_<hex>` login in the
 * database `admin` is connected to. `adminUrl` must be the URL `admin` was
 * built from; both it and the live connection are checked before anything is
 * created.
 */
export async function createDisposableSourceDiscoveryLogin(
  admin: pg.Pool,
  adminUrl: string,
): Promise<DisposableLogin> {
  assertDisposableTarget(adminUrl);
  await assertTestDatabaseConnection(admin);
  const { rows } = await admin.query<{ db: string }>('SELECT current_database() AS db');
  const database = rows[0]!.db;
  if (database !== databaseNameFromUrl(adminUrl)) {
    throw new UnsafeDatabaseTargetError(
      `The admin pool reaches "${database}", not the database its URL names.`,
    );
  }

  const login = `${SOURCE_DISCOVERY_LOGIN_PREFIX}_${randomBytes(4).toString('hex')}`;
  const password = randomBytes(24).toString('hex');
  await admin.query(
    `CREATE ROLE ${login} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE ` +
      `NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 8 PASSWORD '${password}'`,
  );
  await admin.query(
    `GRANT ${SOURCE_DISCOVERY_CAPABILITY} TO ${login} WITH INHERIT FALSE, SET TRUE, ADMIN FALSE`,
  );
  await admin.query(`GRANT CONNECT ON DATABASE "${database}" TO ${login}`);

  const url = new URL(adminUrl);
  url.username = login;
  url.password = password;
  let dropped = false;
  return {
    login,
    url: url.toString(),
    async drop() {
      if (dropped) return;
      dropped = true;
      await admin.query(`REVOKE CONNECT ON DATABASE "${database}" FROM ${login}`).catch(() => {
        // The login may already be gone.
      });
      await admin.query(`DROP ROLE IF EXISTS ${login}`);
    },
  };
}
