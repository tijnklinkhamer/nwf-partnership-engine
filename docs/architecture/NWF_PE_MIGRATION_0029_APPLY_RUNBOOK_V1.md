# Runbook — applying migration 0029 (campaign continuation) to `nwf_pe` (V1, R2)

- **Status: PREPARED, NOT EXECUTED.** Nothing here has been applied to
  `nwf_pe` or to any other persistent database; it was written and its SQL run
  only against a disposable tmpfs PostgreSQL. Applying needs a **separate,
  signed OWNER grant** in the form of §2 (`NWF-PE-APPLY-0029-V1`).
- **Successor, not a rewrite.** `nwf_pe` is at 0028 (applied under
  `NWF_PE_MIGRATIONS_0013_0028_APPLY_RUNBOOK_V1.md`, which stays
  byte-identical and still pins its own pack). This runbook covers exactly ONE
  further file, `0029_campaign_continuation.sql`. Every step it does not
  change - backup format, restore test, runner-only apply, rollback by restore -
  is that runbook's §3, §5 and §8, unchanged.
- **What 0029 is.** ADR 0029 §12 / ADR 0030 §14: the v3 campaign document may
  continue the stranded nominations of a STOPPED predecessor. It adds one
  append-only table, two trigger functions, widens three CHECKs by superset
  and restates the 0026 work-item rule. It rewrites no row and changes no
  existing grant.

## 1. The file

| file                             | sha256 (= runner checksum: UTF-8, no BOM)                          |
| -------------------------------- | ------------------------------------------------------------------ |
| `0029_campaign_continuation.sql` | `7a03c489fed2d561859c2fbfe65b977f8d1adf10392ac825d16d8e90c748f9a4` |

`shasum -a 256 migrations/0029_campaign_continuation.sql` must print exactly
that line on the granted commit, and `ls migrations` must end at `0029_…`.

**What it does to existing data, and its locks.** No existing row is written.
`ALTER TABLE acquisition_campaigns` (version and link-out-depth CHECKs) and
`ALTER TABLE acquisition_work_items` (root CHECK) take ACCESS EXCLUSIVE locks
and re-validate the new CHECKs over every existing row - each new CHECK is a
superset of the one it replaces, so every existing row passes. `CREATE TABLE`
with foreign keys takes SHARE ROW EXCLUSIVE on `acquisition_campaigns` and
`acquisition_work_items` (no source-discovery table is referenced or locked). The tables are
small (hundreds of rows); the window is milliseconds, but **the Engine must be
shut down first** (§3) so no worker transaction waits on, or holds, a lock.

**Privileges after 0029.** `acquisition_campaign_continuations`: SELECT and
INSERT for `nwf_acquisition_worker`, SELECT for `nwf_readonly`, nothing for
anyone else (PUBLIC included). No role, LOGIN, UPDATE/DELETE/TRUNCATE grant
or SECURITY DEFINER function is added; every new or replaced function pins
`search_path = public, pg_catalog, pg_temp`.

## 2. The grant (must exist before §3)

> **OWNER GRANT NWF-PE-APPLY-0029-V1.** I, the OWNER, authorise applying
> exactly `migrations/0029_campaign_continuation.sql` (sha256 `7a03c489…f9a4`)
> to the database `nwf_pe` on 127.0.0.1:55432, from commit `<sha>`, through the
> repository runner on the owner path, after the preflight below is all `t`.
> It authorises no other migration, no data change, no campaign, no START and
> no push.

## 3. Preflight (read-only; all rows `t`, else STOP)

Shut the Engine down first (`nwf-engine shutdown`; the campaign keeps its
control state). Then, on the owner path (the ledger `schema_migrations` is
readable only there), inside a READ ONLY transaction ended by ROLLBACK:

```bash
psql "<owner URL for nwf_pe>" -X -v ON_ERROR_STOP=1 <<'SQL' | tee "$OUT/preflight-0029.txt"
BEGIN TRANSACTION READ ONLY;
SELECT 'P1 ledger is exactly 0001-0028 with the committed digests' AS check,
       (SELECT string_agg(version, ',' ORDER BY version) FROM schema_migrations)
         = (SELECT string_agg(lpad(g::text, 4, '0'), ',' ORDER BY g) FROM generate_series(1, 28) g)
   AND (SELECT encode(sha256(convert_to(string_agg(version || ':' || checksum, ',' ORDER BY version),
                                        'UTF8')), 'hex') FROM schema_migrations)
         = '98c50f71bf89640c88b1d7bf5ffb47e421a1e286aee3aa30344e97eb91ec6376' AS ok
UNION ALL
SELECT 'P2 0029 is not applied and its table does not exist',
       to_regclass('public.acquisition_campaign_continuations') IS NULL
   AND NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '0029')
UNION ALL
SELECT 'P3 no live claim (the Engine is shut down)',
       NOT EXISTS (SELECT 1 FROM acquisition_work_item_states WHERE state = 'CLAIMED')
UNION ALL
SELECT 'P4 exactly one environment row',
       (SELECT count(*) FROM subject_review_environment) = 1;
-- Counts to compare after the apply (must be identical):
SELECT 'campaigns' AS t, count(*) FROM acquisition_campaigns
UNION ALL SELECT 'control_events', count(*) FROM acquisition_campaign_control_events
UNION ALL SELECT 'work_items', count(*) FROM acquisition_work_items
UNION ALL SELECT 'claims', count(*) FROM acquisition_work_claims
UNION ALL SELECT 'outcomes', count(*) FROM acquisition_work_outcomes
UNION ALL SELECT 'nominations', count(*) FROM source_discovery_nominations
UNION ALL SELECT 'nomination_identities', count(*) FROM source_discovery_nomination_identities
ORDER BY 1;
ROLLBACK;
SQL
```

`P1`'s hash is SHA-256 over `version:checksum` joined by `,` for 0001–0028,
computed from this tree with the runner's `checksum()`. Save the counts.

## 4. Backup and apply

Back up and restore-test exactly as the 0013–0028 runbook §3.1–§3.2 says
(`pg_dump --create -Fc`, restore into a disposable database). Then:

```bash
env DATABASE_URL_ADMIN="<owner URL for nwf_pe>" npm run db:migrate 2>&1 | tee "$OUT/apply-0029.log"
```

The log must show exactly `Applied 0029_campaign_continuation.sql` and
`Migrations complete: 1 applied, 28 already present.` Anything else: STOP (the
0013–0028 runbook §7). Never apply the file with `psql -f`.

## 5. Verify (owner path, read-only; every row `t`, else STOP)

```bash
psql "<owner URL for nwf_pe>" -X -v ON_ERROR_STOP=1 <<'SQL' | tee "$OUT/verify-0029.txt"
BEGIN TRANSACTION READ ONLY;
SELECT 'V1 ledger is 0001-0029: 0001-0028 unchanged, 0029 the committed digest' AS check,
       (SELECT string_agg(version, ',' ORDER BY version) FROM schema_migrations)
         = (SELECT string_agg(lpad(g::text, 4, '0'), ',' ORDER BY g) FROM generate_series(1, 29) g)
   AND (SELECT encode(sha256(convert_to(string_agg(version || ':' || checksum, ',' ORDER BY version),
                                        'UTF8')), 'hex')
          FROM schema_migrations WHERE version <= '0028')
         = '98c50f71bf89640c88b1d7bf5ffb47e421a1e286aee3aa30344e97eb91ec6376'
   AND (SELECT checksum FROM schema_migrations WHERE version = '0029')
         = '7a03c489fed2d561859c2fbfe65b977f8d1adf10392ac825d16d8e90c748f9a4' AS ok
UNION ALL
SELECT 'V2 the adoption table exists, empty',
       (SELECT count(*) FROM acquisition_campaign_continuations) = 0
UNION ALL
SELECT 'V3 its grants are exactly worker SELECT+INSERT and readonly SELECT',
       (SELECT string_agg(grantee || ':' || privilege_type, ',' ORDER BY grantee, privilege_type)
          FROM information_schema.role_table_grants
         WHERE table_name = 'acquisition_campaign_continuations'
           AND grantee <> (SELECT pg_get_userbyid(relowner) FROM pg_class
                            WHERE oid = 'acquisition_campaign_continuations'::regclass))
         = 'nwf_acquisition_worker:INSERT,nwf_acquisition_worker:SELECT,nwf_readonly:SELECT'
UNION ALL
SELECT 'V4 its triggers: snapshot guard, append-only refusal, adoption verification; and the campaign document trigger',
       (SELECT string_agg(tgname, ',' ORDER BY tgname) FROM pg_trigger
         WHERE tgrelid = 'acquisition_campaign_continuations'::regclass AND NOT tgisinternal
           AND tgenabled = 'O')
         = 'a_snapshot_isolation_guard,acquisition_campaign_continuations_append_only,acquisition_campaign_continuations_verify'
   AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'acquisition_campaigns'::regclass
                  AND tgname = 'acquisition_campaigns_verify_continuation' AND tgenabled = 'O')
UNION ALL
SELECT 'V5 new/replaced functions pin search_path; no SECURITY DEFINER anywhere in public',
       (SELECT bool_and(proconfig = ARRAY['search_path=public, pg_catalog, pg_temp'])
          FROM pg_proc WHERE proname IN ('acquisition_campaign_continuation_document_verify',
                                         'acquisition_campaign_continuation_verify_insert',
                                         'acquisition_work_item_verify_insert'))
   AND NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.prosecdef)
UNION ALL
SELECT 'V6 widened CHECKs and the deferred item foreign key',
       pg_get_constraintdef((SELECT oid FROM pg_constraint
                              WHERE conname = 'acquisition_campaigns_version_chk'))
         LIKE '%nwf-pe.acquisition-campaign.v3%'
   AND pg_get_constraintdef((SELECT oid FROM pg_constraint
                              WHERE conname = 'acquisition_work_items_root_chk'))
         LIKE '%NOMINATED%'
   AND (SELECT condeferrable AND condeferred FROM pg_constraint
         WHERE conname = 'acquisition_continuations_adopted_item_fk')
UNION ALL
SELECT 'V7 once-only: unique nomination, predecessor item, adopted item, (campaign, position)',
       (SELECT count(*) FROM pg_indexes
         WHERE tablename = 'acquisition_campaign_continuations' AND indexdef LIKE 'CREATE UNIQUE%') = 5
UNION ALL
SELECT 'V8 every constraint validated',
       NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                    WHERE n.nspname = 'public' AND NOT c.convalidated);
-- Counts: must equal the preflight's.
SELECT 'campaigns' AS t, count(*) FROM acquisition_campaigns
UNION ALL SELECT 'control_events', count(*) FROM acquisition_campaign_control_events
UNION ALL SELECT 'work_items', count(*) FROM acquisition_work_items
UNION ALL SELECT 'claims', count(*) FROM acquisition_work_claims
UNION ALL SELECT 'outcomes', count(*) FROM acquisition_work_outcomes
UNION ALL SELECT 'nominations', count(*) FROM source_discovery_nominations
UNION ALL SELECT 'nomination_identities', count(*) FROM source_discovery_nomination_identities
ORDER BY 1;
ROLLBACK;
SQL
```

V7 counts five unique indexes: the four of the migration plus the primary key.

## 6. Rollback, and what applying does NOT authorise

Rollback is restoring the §4 dump on the OWNER's written instruction (the
0013–0028 runbook §8); there is no down script. Applying 0029 records,
starts and continues nothing: a continuation still needs the OWNER to STOP the
predecessor, sign a v3 campaign, record it and START it (Mac runbook,
"Continue a stopped campaign's stranded candidates").
