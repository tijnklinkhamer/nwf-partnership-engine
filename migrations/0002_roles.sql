-- 0002_roles.sql
-- Least-privilege roles for Phase 1A.
--
-- This corrects the Gate 0.5 inconsistency (nwf_ingest was described as
-- INSERT/SELECT only while also being required to perform upserts and to close
-- out a mutable ingest_runs row). Grants below are exactly what Phase 1A needs
-- and nothing more.
--
--   organisations        : SELECT, INSERT, UPDATE          (no DELETE)
--   organisation_sources : SELECT, INSERT                  (no UPDATE, no DELETE)
--   ingest_runs          : SELECT, INSERT, UPDATE          (no DELETE)
--
-- No research or outreach roles exist. Those phases are not approved.
-- Passwords here are deterministic LOCAL-DEVELOPMENT-ONLY values.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nwf_ingest') THEN
        CREATE ROLE nwf_ingest LOGIN PASSWORD 'local_dev_only';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nwf_readonly') THEN
        CREATE ROLE nwf_readonly LOGIN PASSWORD 'local_dev_only';
    END IF;
END
$$;

-- Never grant schema-wide ALL.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM nwf_ingest, nwf_readonly;
REVOKE ALL ON SCHEMA public FROM PUBLIC;

-- CONNECT is granted on whichever database this migration is being applied to.
-- Naming a database literally here would be wrong: the same migrations are
-- applied to the working database and to the separate integration-test database,
-- and a hardcoded name would grant on the wrong one. Revoking CONNECT from
-- PUBLIC is what makes the grant meaningful - reaching this database becomes an
-- explicit privilege rather than a default every role inherits.
DO $$
DECLARE
    db text := current_database();
BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO nwf_ingest, nwf_readonly', db);
    EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', db);
END
$$;

GRANT USAGE ON SCHEMA public TO nwf_ingest, nwf_readonly;

-- nwf_ingest
GRANT SELECT, INSERT, UPDATE ON organisations TO nwf_ingest;
GRANT SELECT, INSERT         ON organisation_sources TO nwf_ingest;
GRANT SELECT, INSERT, UPDATE ON ingest_runs TO nwf_ingest;

-- nwf_readonly
GRANT SELECT ON organisations, organisation_sources, ingest_runs TO nwf_readonly;

-- Defensive: make the append-only intent explicit even for future roles.
REVOKE UPDATE, DELETE ON organisation_sources FROM PUBLIC;
