# Runbook — applying migrations 0013–0019 to the working database `nwf_pe` (V1, rel-\* line)

- **Status: PREPARED, NOT EXECUTED.** Nothing in this runbook has been applied
  to `nwf_pe`, or to any persistent database. Applying ANY step needs a
  **separate, signed OWNER grant** naming the database, the exact migration
  range, the commit and the operator path. The REL harvest that wrote this
  file was authorised for local edits, disposable test databases, local tests
  and local commits only; it did not touch `nwf_pe`.
- **Line:** the rel-\* release candidate (`integration/rel-engine-v1`, harvested
  on `integration/rel-engine-v1-harvest`). Ported from the duplicate relf1 line's
  runbook (`2999b54`) and rewritten for THIS line's migrations.
- **The relf1 line's own 0018 and 0019 are a different schema and must never
  be applied** to `nwf_pe` or anywhere else; this runbook does not cover them.
- **Byte identity.** The files applied must be byte-identical to the table in
  §1 (same SHA-256). The runner records `sha256(file)` per four-digit version
  in `schema_migrations` and refuses a changed file forever after, so a wrong
  file applied once cannot be corrected by re-applying the right one.

## 0. Facts (not re-measured)

`nwf_pe` was **not read** while preparing this runbook. The relf1 session
measured it read-only on 2026-10-26: applied versions `0001`…`0012`; 4,647
`orgunit_fetch_observations` rows (4,664 kB); 3,506 `orgunit_page_evidence`
rows; PostgreSQL 16 in Docker `nwf_pe_postgres` on 127.0.0.1:55432. The
`orgunit_page_candidates` row count was not recorded and is **UNKNOWN**. Re-measure
all of these under the grant (§3) before relying on them.

`nwf_pe` holds the FROZEN Gen-2 A2 acquisition corpus. Every step below must
leave every existing row's evidence byte-identical; the A2/A3 corpus digests
are the acceptance test.

## 1. The files, their SHA-256 and what each does to existing data

| file                                            | sha256                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| `0013_discovery_subject_identity.sql`           | `98af165685793512f61946b32225652465b49f669267a3eedb298fc3002cc8b2` |
| `0014_discovery_subject_writer.sql`             | `71dc4f69092bb6eac456c057af4ae15b4be5dd302a419f935e64f0c2aa1bbb35` |
| `0015_discovery_subject_review_attestation.sql` | `f1e95ec8f24908e1baf13bfcf4ba48f2d1e176f37539e4269627b4dcdcbd09ca` |
| `0016_subject_jurisdiction_claims.sql`          | `56c877f3344a2f51b15b4210d2ac488dcbe30e7bee437c35ac19f87926bf8f1c` |
| `0017_subject_research_admission.sql`           | `2c96644175202cd827a580e3dd857a20c308b6302f5c99c443db10c099792c9f` |
| `0018_subject_research_roots.sql`               | `4d29d623f5eee8d964711d0688145cbc71d2bef7a0902998d05adb41b832d065` |
| `0019_source_discovery_nominations.sql`         | `7c046ec9604f1c2bc4f76af43c862b5f1a1fa1556067fe70d34ff3e1818347d6` |

Verify before anything else: `shasum -a 256 migrations/001[3-9]_*.sql` must
print exactly these seven lines.

| file   | existing rows touched                                                                                                                                                                                                                                                                                                                                                                                     | locks (held to COMMIT)                                                                                                                  |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `0013` | none (new discovery-subject identity tables and functions)                                                                                                                                                                                                                                                                                                                                                | brief; new FKs into `organisations`, `website_claims`, `orgunit_page_evidence` (SHARE ROW EXCLUSIVE)                                    |
| `0014` | none (NOLOGIN writer capability, grants, triggers)                                                                                                                                                                                                                                                                                                                                                        | brief                                                                                                                                   |
| `0015` | none (review attestation tables, NOLOGIN reviewer capability, one seeded environment row)                                                                                                                                                                                                                                                                                                                 | brief                                                                                                                                   |
| `0016` | none (jurisdiction claims table, function)                                                                                                                                                                                                                                                                                                                                                                | brief                                                                                                                                   |
| `0017` | **REWRITES `orgunit_fetch_observations`** (drops and re-adds the GENERATED `root_key`, adds `run_root_scope`), rebuilds its indexes and `orgunit_page_evidence_root_fk`, adds `orgunit_research_runs.root_scope`                                                                                                                                                                                          | **ACCESS EXCLUSIVE** on fetch observations, page evidence and research runs; SHARE on `discovery_subject_identity_claims` (index build) |
| `0018` | **REWRITES `orgunit_page_candidates`**: adds the STORED GENERATED `run_root_scope` (`'ECHE'` for every existing claim/promotion row), adds FK `orgunit_page_candidates_run_scope_fk` (validated over every row), and a partial index on `orgunit_research_runs (root_scope) WHERE root_scope <> 'ECHE'`; grants nothing                                                                                   | **ACCESS EXCLUSIVE** on `orgunit_page_candidates`; SHARE ROW EXCLUSIVE on `orgunit_research_runs` (FK); SHARE during the index build    |
| `0019` | none: three new append-only tables (`source_discovery_briefs`, `_runs`, `_nominations`), append-only and verification triggers, the cluster-wide NOLOGIN capability `nwf_source_discovery` with SELECT/INSERT on those tables, `SELECT (registrable_domain)` on `website_claims`, `SELECT (id, observed_at)` on `orgunit_page_evidence`, `CONNECT` on the current database, and SELECT for `nwf_readonly` | brief; new FKs into `orgunit_research_runs` and `orgunit_page_evidence` (SHARE ROW EXCLUSIVE)                                           |

0017 and 0018 are the only files that rewrite data, and both rewrite only
GENERATED columns derived from values already stored. ADR 0025 §5 proved on
disposable databases that 0017 regenerates every historical `root_key`
byte-identically and rolls back whole on failure. Their durations on `nwf_pe`
are **UNKNOWN** until measured (§3, lock-window probe).

Roles: 0014, 0015 and 0019 create cluster-wide NOLOGIN roles if absent
(`nwf_discovery_subject_writer`, `nwf_discovery_subject_reviewer`,
`nwf_source_discovery`). They may already exist on the local cluster because
the test databases share it. No migration creates a LOGIN role or a password,
and no migration grants `nwf_research` anything new.

## 2. Preconditions (all must hold; stop otherwise)

1. A signed OWNER grant naming: the database (`nwf_pe`), the exact file range
   (all of 0013–0019, or a stated prefix), the commit SHA and the operator
   path. Record its path here before starting.
2. `SELECT version, checksum FROM schema_migrations WHERE version >= '0013'`
   returns **no rows**. If any 0013–0019 version is already recorded, STOP:
   with a checksum from §1 it was applied outside this runbook; with any other
   checksum a different file (for example the relf1 line's 0018/0019) was
   applied, and the runner will refuse this line's file for that version.
3. No research, classifier, acquisition or source-discovery process is
   connected to `nwf_pe` (0017 and 0018 take ACCESS EXCLUSIVE locks):
   `SELECT pid, usename, state, query FROM pg_stat_activity WHERE datname = 'nwf_pe' AND pid <> pg_backend_pid();`
   returns no application session.
4. The shared validation slot is not in use (one full validate at a time).
5. `git status` is clean on the named commit, `npm run migrations:check`
   passes, and §1's `shasum` check matches.
6. Free disk ≥ 3 × `pg_database_size('nwf_pe')` (dump + two table rewrites).

## 3. Before: backup, restore test and digests

```bash
STAMP=$(date -u +%Y%m%dT%H%M%SZ); OUT=~/nwf-preservation/nwf-pe-pre-0013-$STAMP
mkdir -p "$OUT" && chmod 700 "$OUT"
docker exec nwf_pe_postgres pg_dump -U nwf_owner -d nwf_pe -Fc > "$OUT/nwf_pe.dump"
chmod 600 "$OUT/nwf_pe.dump"
shasum -a 256 "$OUT/nwf_pe.dump" > "$OUT/SHA256SUMS"
# Restore-test the dump into a throwaway database before trusting it:
docker exec nwf_pe_postgres createdb -U nwf_owner nwf_pe_restore_probe_test
docker exec -i nwf_pe_postgres pg_restore -U nwf_owner -d nwf_pe_restore_probe_test < "$OUT/nwf_pe.dump"
docker exec nwf_pe_postgres dropdb -U nwf_owner nwf_pe_restore_probe_test
```

Per-row digests (read-only; save each output to `$OUT/before-*.txt`):

```sql
SELECT count(*), md5(string_agg(id::text || '|' || root_key, ',' ORDER BY id))
  FROM orgunit_fetch_observations;
SELECT count(*), md5(string_agg(id::text || '|' || fetch_observation_id || '|' || root_key || '|' ||
                      md5(main_text) || '|' || rule_version, ',' ORDER BY id))
  FROM orgunit_page_evidence;
SELECT count(*), md5(string_agg(id::text || '|' || run_id || '|' || root_key || '|' || track || '|' ||
                      candidate_score::text || '|' || rank_within_root || '|' || rule_version,
                      ',' ORDER BY id))
  FROM orgunit_page_candidates;
SELECT count(*) FROM orgunit_research_runs;
SELECT count(*) FROM orgunit_classifier_calls;
SELECT version, checksum FROM schema_migrations ORDER BY version;
```

Also run the repository's own A2/A3 corpus digest checks if the grant names
them (they are the frozen-corpus acceptance).

**Lock-window probe (recommended before the real apply):** restore the dump
into `nwf_pe_lockprobe_test`, time `npm run db:migrate` with
`DATABASE_URL_ADMIN` pointed at that database, record the 0017 and 0018
durations, then drop it.

## 4. Apply

### 4.1 The whole range (0013–0019)

```bash
# DATABASE_URL_ADMIN must point at nwf_pe on 127.0.0.1:55432 (owner path).
npm run db:migrate 2>&1 | tee "$OUT/apply.log"
```

The runner applies each pending file in its OWN transaction, in order, and
records its checksum. A failure rolls back THAT file only; earlier files stay
applied. Re-running after a fix applies only what is still pending.

### 4.2 A prefix of the range (e.g. the grant stops at 0018)

The runner has no `--to` option. Apply from a temporary worktree of the
granted commit in which the ungranted files are absent from `migrations/`
(delete them in that worktree only — never edit, rename or delete a migration
in a shared tree), then confirm `SELECT max(version) FROM schema_migrations`
equals the last granted version. 0019 depends on 0017 (`orgunit_research_runs`,
`orgunit_page_evidence`) but not on 0018, and 0018 depends on 0017's
`orgunit_research_runs_id_root_scope_uidx`; never apply 0018 without 0017.

## 5. After: verification (all must hold)

1. `SELECT string_agg(version || ':' || checksum, ',' ORDER BY version) FROM schema_migrations WHERE version >= '0013';`
   lists exactly the granted versions with §1's SHA-256; 0001–0012 checksums
   are unchanged from the `before` file.
2. The `orgunit_fetch_observations`, `orgunit_page_evidence` and
   `orgunit_page_candidates` digests of §3 are **identical** (0017 and 0018
   rewrite only generated columns; the digests do not read those columns).
3. `SELECT DISTINCT root_scope FROM orgunit_research_runs;` → only `ECHE`;
   `SELECT DISTINCT run_root_scope FROM orgunit_page_candidates;` → only `ECHE`
   (or no row); `SELECT count(*) FROM orgunit_fetch_observations WHERE root_subject_admission_id IS NOT NULL;` → 0.
4. `SELECT conname, convalidated FROM pg_constraint WHERE conname IN ('orgunit_page_evidence_root_fk', 'orgunit_page_candidates_run_scope_fk');`
   → both present and validated.
5. Grants, from the catalogue:
   `SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants WHERE grantee IN ('nwf_research', 'nwf_source_discovery', 'nwf_discovery_subject_writer') ORDER BY 1, 2, 3;`
   - `nwf_research`: exactly its pre-apply set plus what 0017 states for the
     admission tables; 0018 and 0019 grant it nothing.
   - `nwf_source_discovery`: SELECT, INSERT on the three `source_discovery_*`
     tables and nothing else at table level; its two column grants appear in
     `information_schema.column_privileges`.
   - `SELECT r.rolname FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member WHERE m.roleid = 'nwf_source_discovery'::regrole;`
     → no LOGIN role holds the capability (nothing has been authorised to).
6. Every discovery-subject table, `subject_research_admissions` and the three
   `source_discovery_*` tables hold **zero rows** (nothing writes them until
   the OWNER acts).

## 6. Rollback

Migrations are forward-only (CLAUDE.md rule 5); there is no down script.
Rollback = restore the §3 dump:

```bash
docker exec nwf_pe_postgres dropdb -U nwf_owner nwf_pe   # ONLY with the OWNER on the call
docker exec nwf_pe_postgres createdb -U nwf_owner nwf_pe
docker exec -i nwf_pe_postgres pg_restore -U nwf_owner -d nwf_pe < "$OUT/nwf_pe.dump"
```

then re-run §3's digests and require equality with the `before` files.
Cluster-wide roles created by 0014/0015/0019 survive a database restore; that
is harmless (NOLOGIN, no members) but must be recorded. Dropping `nwf_pe` is
destructive and needs the same OWNER grant (or a separate one) to say so.

## 7. What this runbook does not authorise

No migration of `nwf_pe` or any persistent database without the separate
OWNER grant; no live fetch or live search; no admission, review, nomination or
promotion on `nwf_pe`; no LOGIN role for `nwf_source_discovery`; no classifier
call; no staging or production database; no push.
