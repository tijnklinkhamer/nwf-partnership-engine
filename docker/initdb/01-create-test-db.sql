-- Creates a SEPARATE database for integration tests.
--
-- Integration tests TRUNCATE tables. Pointing them at the same database a
-- developer uses for real ingests would silently destroy ingested data on every
-- `npm run validate`. They are kept apart at the database level, and
-- src/db/safety.ts refuses both a connection string and a live connection whose
-- database name does not end in `_test`.
CREATE DATABASE nwf_pe_test OWNER nwf_owner;
