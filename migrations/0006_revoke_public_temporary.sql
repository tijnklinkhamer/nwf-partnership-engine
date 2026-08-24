-- 0006_revoke_public_temporary.sql
-- Closes a privilege that migration 0002 left open: PUBLIC holds TEMPORARY.
--
-- WHAT WAS WRONG
--
--   PostgreSQL grants BOTH `CONNECT` and `TEMPORARY` on a database to PUBLIC at
--   creation time. Migration 0002 revoked CONNECT from PUBLIC - deliberately,
--   with a comment explaining that reaching the database should be an explicit
--   privilege rather than a default every role inherits - but it never revoked
--   TEMPORARY. So the default survived.
--
--   Measured on both databases before this migration:
--
--     datacl = {=T/nwf_owner,
--               nwf_owner=CTc/nwf_owner,
--               nwf_ingest=c/nwf_owner,
--               nwf_readonly=c/nwf_owner}
--
--   The leading `=T/nwf_owner` entry is PUBLIC holding TEMPORARY (an empty
--   grantee is PUBLIC). `nwf_ingest=c` and `nwf_readonly=c` show that each of
--   those roles was granted CONNECT and nothing else, so
--
--     has_database_privilege('nwf_readonly', current_database(), 'TEMPORARY')
--
--   returned true purely by inheritance from PUBLIC. A role with no schema
--   CREATE, no INSERT, no UPDATE and no DELETE could still run
--   `CREATE TEMP TABLE`, which is how the Phase 2A audit created one.
--
-- WHAT THIS CHANGES, AND WHAT IT DOES NOT
--
--   TEMPORARY on a DATABASE gates temporary TABLES, views and sequences. Those
--   live in a per-session pg_temp schema, which is why revoking schema-level
--   CREATE on `public` never closed this.
--
--   IT DOES NOT AFFECT TEMPORARY FILES. Sorts that spill, hash joins that spill
--   and any other executor spill file need no database privilege at all. This
--   migration cannot make a large query fail, and must never be described as if
--   it could - that misconception is the reason a revoke like this often gets
--   reverted under pressure.
--
--   No production code creates a temporary table, view or sequence: verified by
--   repository search across src/, scripts/ and migrations/ at the time this
--   migration was written. Nothing is expected to break, and nothing did.
--
-- WHY PUBLIC RATHER THAN THE TWO ROLES
--
--   Revoking from nwf_ingest and nwf_readonly individually would be a no-op:
--   neither was granted TEMPORARY, so there is nothing on either role to
--   revoke. The privilege is held by PUBLIC, so PUBLIC is where it is removed.
--   Both roles lose it as a consequence, which is intended.
--
--   nwf_owner keeps TEMPORARY through its own explicit `nwf_owner=CTc` grant,
--   which this migration does not touch. The database owner remains able to
--   perform ordinary owner operations.
--
--   A future phase that genuinely needs a temporary table should receive
--   `GRANT TEMPORARY ON DATABASE ... TO <that role>` in its own migration.
--   That is the point of this change: an explicit, reviewed privilege instead
--   of an inherited default.

-- The database name is resolved at run time, never hardcoded. The same
-- migration chain is applied to the working database and to the separate
-- integration-test database, and naming either one literally here would harden
-- the wrong database. This mirrors the pattern migration 0002 already uses for
-- its CONNECT grants.
DO $$
DECLARE
    db text := current_database();
BEGIN
    EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', db);
END
$$;
