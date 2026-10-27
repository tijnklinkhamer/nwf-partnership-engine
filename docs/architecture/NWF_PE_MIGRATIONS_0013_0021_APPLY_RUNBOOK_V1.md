# Runbook — applying migrations 0013–0021 to the working database `nwf_pe` (V1, rel-\* line)

- **Status: PREPARED, NOT EXECUTED.** Nothing in this runbook has been applied
  to `nwf_pe` or to any other persistent database. Applying ANY step needs a
  **separate, signed OWNER grant**. The grant must name the database, the
  exact migration range, the commit and the operator path. The REL Q1 lane
  wrote this file under local-engineering authority only. It did not touch
  `nwf_pe`.
- **Successor, not a rewrite.** It supersedes
  `NWF_PE_MIGRATIONS_0013_0019_APPLY_RUNBOOK_V1.md` for planning, because that
  runbook covers 0013–0019 only. That file stays byte-identical as the record
  of what it covered, and the REL harvest H5 firewall still pins it. Where
  this runbook does not change a step, it says so and gives the same
  instruction.
- **New since V1:** 0020 (REL P2 link-out nomination identities and
  sightings) and 0021 (REL Q1 source-stated country-of-operation writer).
- **Line:** the rel-\* release candidate (`integration/rel-engine-v1-harvest`).
  The relf1 line's own 0018 and 0019 are a different schema and **must never
  be applied** to `nwf_pe` or anywhere else. This runbook does not cover them.
- **Byte identity.** The files applied must be byte-identical to the table in
  §1 (same SHA-256). The runner records `sha256(file)` per four-digit version
  in `schema_migrations`. It refuses a changed file forever after, so a wrong
  file applied once cannot be fixed by re-applying the right one.

## 0. Facts (not re-measured)

`nwf_pe` was **not read** while preparing this runbook.

The V1 runbook records one earlier read-only measurement, dated 2026-10-26:

- applied versions `0001`…`0012`;
- 4,647 `orgunit_fetch_observations` rows;
- 3,506 `orgunit_page_evidence` rows;
- PostgreSQL 16 in the local Docker service.

The `orgunit_page_candidates` count was not recorded and is **UNKNOWN**.
Whether any of 0013–0019 has been applied since is **UNKNOWN**. §2 decides
which starting state holds. Re-measure everything under the grant (§3).

`nwf_pe` holds the FROZEN Gen-2 A2 acquisition corpus. Every step must leave
every existing row's evidence byte-identical. The A2/A3 corpus digests are the
acceptance test.

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
| `0020_source_discovery_link_out_sightings.sql`  | `667c0066a6773acb9e28bee46b363bde82060cdf21afdf14e47e2c8abe1d6d19` |
| `0021_subject_jurisdiction_claim_writer.sql`    | `791bf4b5ceb97b7b04b36f5c477023a86e435152737406dadbdfe23027b1cff4` |

Verify this before anything else:
`shasum -a 256 migrations/001[3-9]_*.sql migrations/002[01]_*.sql` must print
exactly these nine lines.

0013–0019 are described in the V1 runbook §1 (existing rows touched, locks).
That description is unchanged. In short, 0017 and 0018 are the only files
that rewrite data, and both rewrite only GENERATED columns.

| file   | existing rows touched                                                                                                                                                                                                                                                                                                                                                               | locks (held to COMMIT)                                                                                                                        |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `0020` | none. Two new append-only tables (`source_discovery_nomination_identities`, `source_discovery_nomination_sightings`) with verification and append-only triggers; SELECT/INSERT to the existing NOLOGIN `nwf_source_discovery`; SELECT to `nwf_readonly`. No role, nothing existing altered                                                                                          | brief; new FKs into `source_discovery_nominations` and `orgunit_page_evidence` (SHARE ROW EXCLUSIVE)                                          |
| `0021` | none. Grants to the existing NOLOGIN `nwf_discovery_subject_writer`: SELECT, INSERT on `subject_jurisdiction_claims`; SELECT (id, root_key, observed_at) on `orgunit_page_evidence`; SELECT (id, subject_id) on `subject_research_admissions`. One function, two BEFORE INSERT triggers on `subject_jurisdiction_claims`. No role, LOGIN, table or column; nothing existing altered | brief; `CREATE TRIGGER` takes SHARE ROW EXCLUSIVE on `subject_jurisdiction_claims`; the GRANTs take brief catalogue locks on the three tables |

Dependencies: 0020 needs 0019 (`source_discovery_nominations`) and 0007
(`orgunit_page_evidence`). 0021 needs 0013/0014 (the identity tables and
`discovery_identity_bind_writer_actor`), 0016 (its table) and 0017
(`subject_research_admissions`). Never apply 0020 or 0021 without everything
they depend on.

Roles: 0014, 0015 and 0019 create cluster-wide NOLOGIN roles if they are
absent. 0020 and 0021 create none. No migration creates a LOGIN role or a
password, and no migration in this range grants `nwf_research` anything that
V1 did not already list.

## 2. Preconditions (all must hold; stop otherwise)

1. A signed OWNER grant names: the database (`nwf_pe`); the exact file range
   (all of 0013–0021, only 0020–0021 on top of an applied 0013–0019, or a
   stated prefix); the commit SHA; and the operator path. Record where the
   grant is kept before starting. Keep it outside this repository.
2. **Ledger check (before).** Run
   `SELECT version, checksum FROM schema_migrations WHERE version >= '0013' ORDER BY version;`
   and save the output. Exactly ONE of these starting states must hold:
   - **State A:** no rows. Apply 0013–0021 (§4.1).
   - **State B:** exactly 0013–0019, each with the §1 checksum, and no 0020
     or 0021. Apply 0020–0021 only (§4.1; the runner skips what is
     recorded).
   - Anything else: STOP. A version with a checksum that is not in §1 means a
     different file was applied, for example the relf1 line's 0018/0019, and
     the runner will refuse this line's file for that version. A gap means a
     partial apply outside any runbook.
3. Also save `SELECT version, checksum FROM schema_migrations WHERE version < '0013' ORDER BY version;`.
   §5 requires it to be unchanged.
4. No research, classifier, acquisition, source-discovery or registry process
   is connected to `nwf_pe`. In state A, 0017 and 0018 take ACCESS EXCLUSIVE
   locks:
   `SELECT pid, usename, state, query FROM pg_stat_activity WHERE datname = 'nwf_pe' AND pid <> pg_backend_pid();`
   must return no application session.
5. The shared validation slot is not in use (one full validate at a time).
6. `git status` is clean on the named commit, `npm run migrations:check`
   passes, and the §1 `shasum` check matches.
7. Free disk is at least 3 × `pg_database_size('nwf_pe')` (the dump plus, in
   state A, two table rewrites).

## 3. Before: backup, restore test and digests

The same steps as V1 §3, with one change: the dump goes to a private,
operator-chosen directory OUTSIDE this repository (`$OUT` below). Never
commit a dump, a digest file or the grant.

```bash
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="<private backup directory outside the repository>/nwf-pe-pre-0013-0021-$STAMP"
mkdir -p "$OUT" && chmod 700 "$OUT"
docker exec nwf_pe_postgres pg_dump -U nwf_owner -d nwf_pe -Fc > "$OUT/nwf_pe.dump"
chmod 600 "$OUT/nwf_pe.dump"
shasum -a 256 "$OUT/nwf_pe.dump" > "$OUT/SHA256SUMS"
# Restore-test the dump into a throwaway database before trusting it:
docker exec nwf_pe_postgres createdb -U nwf_owner nwf_pe_restore_probe_test
docker exec -i nwf_pe_postgres pg_restore -U nwf_owner -d nwf_pe_restore_probe_test < "$OUT/nwf_pe.dump"
docker exec nwf_pe_postgres dropdb -U nwf_owner nwf_pe_restore_probe_test
```

Run the per-row digests of V1 §3 (fetch observations, page evidence, page
candidates, research runs, classifier calls) and save each to
`$OUT/before-*.txt`. Also save these (read-only):

```sql
SELECT version, checksum FROM schema_migrations ORDER BY version;          -- the full ledger
SELECT count(*) FROM subject_jurisdiction_claims;                         -- state B only
SELECT count(*) FROM source_discovery_nominations;                        -- state B only
SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
 WHERE grantee IN ('nwf_research', 'nwf_source_discovery', 'nwf_discovery_subject_writer',
                   'nwf_discovery_subject_reviewer', 'nwf_readonly')
 ORDER BY 1, 2, 3;
```

**Lock-window probe (recommended in state A):** as in V1 §3, restore the dump
into `nwf_pe_lockprobe_test`, time `npm run db:migrate` against it, record
the 0017 and 0018 durations, then drop it.

## 4. Apply

### 4.1 The granted range

```bash
# DATABASE_URL_ADMIN must point at nwf_pe (owner path).
npm run db:migrate 2>&1 | tee "$OUT/apply.log"
```

The runner applies each pending file in its OWN transaction, in order, and
records its checksum. A failure rolls back THAT file only; earlier files stay
applied. Re-running after a fix applies only what is still pending. In state
B the log must show exactly two `Applied` lines, `0020_…` and `0021_…`.

### 4.2 A prefix of the range

The runner has no `--to` option. Follow V1 §4.2: apply from a temporary
worktree of the granted commit in which the ungranted files are absent from
`migrations/`. Delete them in that worktree only. Never edit, rename or
delete a migration in a shared tree. Then confirm that
`SELECT max(version) FROM schema_migrations` equals the last granted version.
0021 may be withheld while 0020 is applied. Applying 0021 without 0020 would
leave a version gap. This runbook does not cover that, so do not do it.

## 5. After: verification (all must hold)

1. **Ledger check (after).**
   `SELECT string_agg(version || ':' || checksum, ',' ORDER BY version) FROM schema_migrations WHERE version >= '0013';`
   lists exactly the granted versions with the §1 SHA-256. The `< '0013'`
   ledger is identical to the saved one. In state B, the 0013–0019 rows are
   identical to the saved ones and only 0020 and 0021 are new.
2. The V1 §5 checks 2–4 hold (evidence digests identical, root scopes
   `ECHE` only, both rebuilt constraints present and validated).
3. **0020.** Both tables exist and hold zero rows.
   `nwf_source_discovery` holds SELECT, INSERT on exactly the five
   `source_discovery_*` tables at table level. `nwf_readonly` holds SELECT on
   the two new tables. No LOGIN role is a member of `nwf_source_discovery`.
4. **0021.** In `information_schema.role_table_grants`, the writer
   `nwf_discovery_subject_writer` holds exactly SELECT and INSERT on
   `subject_jurisdiction_claims`, plus its 0014 grants. In
   `information_schema.column_privileges`, it gains exactly
   `orgunit_page_evidence (id, observed_at, root_key)` and
   `subject_research_admissions (id, subject_id)`. Then check the triggers:
   `SELECT tgname FROM pg_trigger WHERE tgrelid = 'subject_jurisdiction_claims'::regclass AND NOT tgisinternal ORDER BY 1;`
   must return `subject_jurisdiction_claims_append_only`,
   `subject_jurisdiction_claims_writer_actor` and
   `subject_jurisdiction_claims_writer_scope`.
   `subject_jurisdiction_claims` holds the same row count as before (zero in
   state A). No LOGIN role is a member of `nwf_discovery_subject_writer`
   unless a separate OWNER decision provisioned one.
5. Every other runtime role's table grants equal the saved `before` list.
   0020 and 0021 grant `nwf_research`, `nwf_ingest`, `nwf_classifier` and
   `nwf_discovery_subject_reviewer` nothing.
6. In state A, every discovery-subject table, `subject_research_admissions`,
   `subject_jurisdiction_claims` and the five `source_discovery_*` tables
   hold **zero rows**. Nothing writes them until the OWNER acts.

## 6. Rollback

Unchanged from V1 §6. Migrations are forward-only (CLAUDE.md rule 5) and there
is no down script. Rollback means restoring the §3 dump, on the OWNER's
instruction, then re-running the §3 digests and requiring equality with the
`before` files. Cluster-wide roles created by 0014, 0015 and 0019 survive a
database restore. That is harmless (NOLOGIN, no members), but it must be
recorded. Dropping `nwf_pe` is destructive and needs the same OWNER grant, or
a separate one, to say so.

## 7. What this runbook does not authorise

- Migrating `nwf_pe` or any persistent database without the separate OWNER
  grant.
- Provisioning a LOGIN for `nwf_discovery_subject_writer` or
  `nwf_source_discovery`.
- Recording any jurisdiction claim, admission, review, nomination or
  promotion on `nwf_pe`.
- Live fetches, live search or classifier calls.
- Any staging or production database.
- Pushing.
