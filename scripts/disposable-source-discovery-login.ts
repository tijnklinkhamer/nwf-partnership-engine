#!/usr/bin/env node
/**
 * LOCAL-ONLY: creates or drops ONE disposable login holding the NOLOGIN
 * `nwf_source_discovery` capability (migration 0019) in a DISPOSABLE local
 * test database, so `orgunits subjects research --execute` can be exercised
 * against it with `DATABASE_URL_SOURCE_DISCOVERY`.
 *
 *   node --env-file=.env --import tsx scripts/disposable-source-discovery-login.ts create
 *   node --env-file=.env --import tsx scripts/disposable-source-discovery-login.ts drop <login>
 *
 * It reads exactly ONE connection string, `DATABASE_URL_ADMIN_TEST`, and has
 * no option to name another. It REFUSES, before connecting, a non-loopback
 * host, a database whose name does not end in `_test`, and `nwf_pe`; and
 * after connecting, a server that reports a non-`_test` database
 * (`src/test/helpers/sourceDiscoveryLogin.ts`). It never touches a shared,
 * staging or production database, and no migration is changed: the role
 * stays NOLOGIN there.
 */
import pg from 'pg';

import {
  SOURCE_DISCOVERY_LOGIN_PREFIX,
  assertDisposableTarget,
  createDisposableSourceDiscoveryLogin,
} from '../src/test/helpers/sourceDiscoveryLogin.js';

const LOGIN_SHAPE = new RegExp(`^${SOURCE_DISCOVERY_LOGIN_PREFIX}_[0-9a-f]{8}$`);

async function main(argv: readonly string[]): Promise<number> {
  const [command, login] = argv;
  const adminUrl = process.env['DATABASE_URL_ADMIN_TEST'];
  if (adminUrl === undefined || adminUrl.length === 0) {
    console.error('DATABASE_URL_ADMIN_TEST is not set.');
    return 1;
  }
  assertDisposableTarget(adminUrl);
  if (command !== 'create' && !(command === 'drop' && login !== undefined)) {
    console.error('usage: disposable-source-discovery-login.ts create | drop <login>');
    return 1;
  }
  if (command === 'drop' && !LOGIN_SHAPE.test(login!)) {
    console.error(
      `refusing to drop "${login}": not a ${SOURCE_DISCOVERY_LOGIN_PREFIX}_<hex> login.`,
    );
    return 1;
  }
  const admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
  try {
    if (command === 'create') {
      const created = await createDisposableSourceDiscoveryLogin(admin, adminUrl);
      console.log(`DATABASE_URL_SOURCE_DISCOVERY=${created.url}`);
      console.error(`created ${created.login}; drop it with: ... drop ${created.login}`);
      return 0;
    }
    const { rows } = await admin.query<{ db: string }>('SELECT current_database() AS db');
    if (!rows[0]!.db.endsWith('_test')) throw new Error('not a _test database');
    await admin
      .query(`REVOKE CONNECT ON DATABASE "${rows[0]!.db}" FROM ${login!}`)
      .catch(() => undefined);
    await admin.query(`DROP ROLE IF EXISTS ${login!}`);
    console.error(`dropped ${login!}`);
    return 0;
  } finally {
    await admin.end();
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
