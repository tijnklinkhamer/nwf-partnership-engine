-- nwf-pe-0013-0027-preflight.sql - READ-ONLY preconditions for
-- docs/architecture/NWF_PE_MIGRATIONS_0013_0027_APPLY_RUNBOOK_V1.md, section 2.
--
-- PREPARED, NOT EXECUTED against nwf_pe. Run it only under the runbook's
-- signed OWNER authorisation, BEFORE the backup and BEFORE any migration, on
-- the owner path:
--
--   psql "<owner URL for nwf_pe>" -X -v ON_ERROR_STOP=1 -f docs/architecture/nwf-pe-0013-0027-preflight.sql
--
-- It only reads. One transaction, READ ONLY, ended by ROLLBACK. It is valid
-- in every starting state: a relation that a later migration adds is looked
-- up with to_regclass and counted only when it exists.
--
-- Output: one row per check (check, ok, detail), then PREFLIGHT_OK. Proceed
-- ONLY when every ok is t (one exception: a P3 f whose v3 count the signed
-- OWNER authorisation states and whose v4 count is 0, runbook section 2.3).
-- P1's detail names the starting state (A, B or C); record it. P8 and P9 are
-- measurements for the lock-window probe and always report t.

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY;
SET LOCAL statement_timeout = '120s';

WITH
-- The runbook's section 1 table. A starting state may already hold 0013-0019
-- (B) or 0013-0021 (C); a ledger that already holds all of 0013-0027 has
-- nothing to apply (AT_0027: run only the verify file).
expected(version, checksum) AS (
    VALUES
        ('0013', '98af165685793512f61946b32225652465b49f669267a3eedb298fc3002cc8b2'),
        ('0014', '71dc4f69092bb6eac456c057af4ae15b4be5dd302a419f935e64f0c2aa1bbb35'),
        ('0015', 'f1e95ec8f24908e1baf13bfcf4ba48f2d1e176f37539e4269627b4dcdcbd09ca'),
        ('0016', '56c877f3344a2f51b15b4210d2ac488dcbe30e7bee437c35ac19f87926bf8f1c'),
        ('0017', '2c96644175202cd827a580e3dd857a20c308b6302f5c99c443db10c099792c9f'),
        ('0018', '4d29d623f5eee8d964711d0688145cbc71d2bef7a0902998d05adb41b832d065'),
        ('0019', '7c046ec9604f1c2bc4f76af43c862b5f1a1fa1556067fe70d34ff3e1818347d6'),
        ('0020', '667c0066a6773acb9e28bee46b363bde82060cdf21afdf14e47e2c8abe1d6d19'),
        ('0021', '791bf4b5ceb97b7b04b36f5c477023a86e435152737406dadbdfe23027b1cff4'),
        ('0022', '87b541b16c26022e01343f42ff20ab6f10da1ea3a0646a321cf38674e8a2a880'),
        ('0023', 'a433f2769fc5458be5a33d1b9caa289e035da0a84eb2fdb9511826107f3351e3'),
        ('0024', '72bc76aa58ad4eb11a09616b3b5093b7d089effca3e96eb7198ed8713c2e2acf'),
        ('0025', '26920ea160608a7cfd4001d9aaa503ceb2575f686ab7ab8c77fdb67c9516b4db'),
        ('0026', 'c845f8cf8675e8fa53d62b0ff92e1fc1a87fcbf245385ff010a13460be5d4ac1'),
        ('0027', 'ae4cf78416a40e2a5fbf36cb4bc2b9de4dcfd3f732929a26f6dfd5bf91931f2c')
),
applied AS (
    SELECT version, checksum FROM public.schema_migrations WHERE version >= '0013'
),
same_set AS (
    SELECT (SELECT coalesce(array_agg(version || ':' || checksum ORDER BY version), '{}')
              FROM applied) AS got,
           (SELECT array_agg(version || ':' || checksum ORDER BY version)
              FROM expected WHERE version <= '0019') AS state_b,
           (SELECT array_agg(version || ':' || checksum ORDER BY version)
              FROM expected WHERE version <= '0021') AS state_c,
           (SELECT array_agg(version || ':' || checksum ORDER BY version)
              FROM expected) AS at_0027
),
starting_state(state) AS (
    SELECT CASE
             WHEN got = '{}' THEN 'A'
             WHEN got = state_b THEN 'B'
             WHEN got = state_c THEN 'C'
             WHEN got = at_0027 THEN 'AT_0027'
             ELSE 'REFUSE'
           END
      FROM same_set
),
-- Tables 0013-0021 add. In states B and C they must hold no row (one
-- exception: 0015 seeds exactly one subject_review_environment row).
earlier_tables(relname, allowed) AS (
    VALUES
        ('discovery_subject_identity_claims', 0),
        ('discovery_subject_relationship_claims', 0),
        ('discovery_subject_reviews', 0),
        ('discovery_subjects', 0),
        ('source_discovery_briefs', 0),
        ('source_discovery_nomination_identities', 0),
        ('source_discovery_nomination_sightings', 0),
        ('source_discovery_nominations', 0),
        ('source_discovery_runs', 0),
        ('subject_jurisdiction_claims', 0),
        ('subject_research_admission_revocations', 0),
        ('subject_research_admissions', 0),
        ('subject_review_attestations', 0),
        ('subject_review_environment', 1)
),
earlier_counts AS (
    SELECT relname, allowed,
           CASE WHEN to_regclass('public.' || relname) IS NULL THEN NULL
                ELSE (xpath('/row/n/text()',
                            query_to_xml(format('SELECT count(*) AS n FROM public.%I', relname),
                                         false, true, '')))[1]::text::bigint
           END AS n
      FROM earlier_tables
),
capability_roles(rolname) AS (
    VALUES
        ('nwf_discovery_subject_writer'),
        ('nwf_discovery_subject_reviewer'),
        ('nwf_source_discovery'),
        ('nwf_acquisition_worker')
),
-- Tables whose locks matter (runbook section 1.2): size and row estimate.
lock_tables(relname) AS (
    VALUES
        ('orgunit_fetch_observations'),
        ('orgunit_page_evidence'),
        ('orgunit_page_candidates'),
        ('orgunit_research_runs'),
        ('subject_research_admissions'),
        ('source_discovery_runs'),
        ('source_discovery_briefs')
),
checks(check_id, ok, detail) AS (
    SELECT 'P1 starting state is A, B or C',
           (SELECT state FROM starting_state) IN ('A', 'B', 'C'),
           'state=' || (SELECT state FROM starting_state)
             || ' applied>=0013=' || (SELECT count(*) FROM applied)
    UNION ALL
    SELECT 'P2 ledger below 0013 is exactly 0001-0012',
           (SELECT array_agg(version ORDER BY version) FROM public.schema_migrations
             WHERE version < '0013')
             = (SELECT array_agg(lpad(g::text, 4, '0') ORDER BY g) FROM generate_series(1, 12) AS g),
           (SELECT count(*) FROM public.schema_migrations WHERE version < '0013') || ' rows'
    UNION ALL
    SELECT 'P3 no page evidence carries extraction label orgunit-extraction-v3 or -v4',
           NOT EXISTS (SELECT 1 FROM public.orgunit_page_evidence
                        WHERE rule_version IN ('orgunit-extraction-v3', 'orgunit-extraction-v4')),
           'v3=' || (SELECT count(*) FROM public.orgunit_page_evidence
                      WHERE rule_version = 'orgunit-extraction-v3')
             || ' v4=' || (SELECT count(*) FROM public.orgunit_page_evidence
                            WHERE rule_version = 'orgunit-extraction-v4') || '; labels: '
             || coalesce((SELECT string_agg(rule_version || '=' || n, ' ' ORDER BY rule_version)
                            FROM (SELECT rule_version, count(*) AS n
                                    FROM public.orgunit_page_evidence GROUP BY 1) l), 'none')
    UNION ALL
    SELECT 'P4 no role is a member of any existing capability role (cluster-wide)',
           NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m
                         JOIN pg_catalog.pg_roles r ON r.oid = m.roleid
                        WHERE r.rolname IN (SELECT rolname FROM capability_roles)),
           coalesce((SELECT string_agg(r.rolname || '<-' || pg_catalog.pg_get_userbyid(m.member), ' ')
                       FROM pg_catalog.pg_auth_members m
                       JOIN pg_catalog.pg_roles r ON r.oid = m.roleid
                      WHERE r.rolname IN (SELECT rolname FROM capability_roles)), 'none')
    UNION ALL
    SELECT 'P5 every existing capability role is NOLOGIN',
           NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
                        WHERE rolname IN (SELECT rolname FROM capability_roles) AND rolcanlogin),
           coalesce((SELECT string_agg(rolname, ' ' ORDER BY rolname) FROM pg_catalog.pg_roles
                      WHERE rolname IN (SELECT rolname FROM capability_roles)), 'none exist yet')
    UNION ALL
    SELECT 'P6 in states B and C the 0013-0021 tables hold no row (environment: one)',
           NOT EXISTS (SELECT 1 FROM earlier_counts WHERE n IS NOT NULL AND n <> allowed),
           coalesce((SELECT string_agg(relname || '=' || n, ' ' ORDER BY relname)
                       FROM earlier_counts WHERE n IS NOT NULL AND n <> allowed), 'none differ')
    UNION ALL
    SELECT 'P7 no other session is connected to this database',
           NOT EXISTS (SELECT 1 FROM pg_catalog.pg_stat_activity
                        WHERE datname = current_database() AND pid <> pg_backend_pid()),
           (SELECT count(*) FROM pg_catalog.pg_stat_activity
             WHERE datname = current_database() AND pid <> pg_backend_pid()) || ' other sessions'
    UNION ALL
    SELECT 'P8 database size (measurement)',
           true,
           pg_catalog.pg_size_pretty(pg_catalog.pg_database_size(current_database()))
             || ' (' || pg_catalog.pg_database_size(current_database()) || ' bytes); server '
             || current_setting('server_version')
    UNION ALL
    SELECT 'P9 lock-window tables (measurement)',
           true,
           (SELECT string_agg(t.relname || '=' ||
                              CASE WHEN to_regclass('public.' || t.relname) IS NULL THEN 'absent'
                                   ELSE pg_catalog.pg_size_pretty(pg_catalog.pg_total_relation_size(
                                            to_regclass('public.' || t.relname)))
                                        || '/' || (SELECT CASE WHEN c.reltuples < 0 THEN 'unanalysed'
                                                               ELSE '~' || c.reltuples::bigint || ' rows' END
                                                     FROM pg_catalog.pg_class c
                                                    WHERE c.oid = to_regclass('public.' || t.relname))
                              END, ' ')
              FROM lock_tables t)
)
SELECT check_id AS "check", ok, detail FROM checks
UNION ALL
SELECT 'PREFLIGHT_OK', bool_and(ok) AND count(*) = 9, count(*) || ' checks' FROM checks;

ROLLBACK;
