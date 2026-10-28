# Runbook — applying migrations 0013–0027 to the working database `nwf_pe` (V1, WW line)

- **Status: PREPARED, NOT EXECUTED.** Nothing in this runbook has been applied
  to `nwf_pe` or to any other persistent database. Applying ANY step needs a
  **separate, signed OWNER grant** in exactly the form of §2.1
  (`NWF-PE-APPLY-0013-0027-V1`). The grant must name the database, the exact
  migration range, the commit and the operator path. The WW integration lead
  wrote this file under local-engineering authority only (REL-F1-R2 and the
  OWNER directives of 2026-10-27). It did not connect to `nwf_pe`.
- **Successor, not a rewrite.** It supersedes
  `NWF_PE_MIGRATIONS_0013_0025_APPLY_RUNBOOK_V1.md` for planning, because that
  runbook stops at 0025 and was never executed. That file, the
  `NWF_PE_MIGRATIONS_0013_0021_APPLY_RUNBOOK_V1.md` it succeeded and the
  `NWF_PE_MIGRATIONS_0013_0019_APPLY_RUNBOOK_V1.md` before it stay
  byte-identical as the record of what they covered; their firewalls still pin
  them. Where this runbook does not change a step, it says so.
- **New since the 0021 runbook:** 0022 (source-discovery OWNER-path grants,
  ADR 0028), 0023 (acquisition campaigns and the work queue, ADR 0029), 0024
  (campaign research admission and acquisition wiring, ADR 0030), 0025 (the
  source-discovery search gate, ADR 0028 §9). **New since the 0025 runbook:**
  0026 (WW H-ACQ hardening of campaign admission and the acquisition wiring,
  ADR 0030 §13) and 0027 (WW H-SD search observations, ADR 0028 §9). ADRs
  0027–0030 are **Proposed**. Applying their schema does not accept them, and
  every capability they describe stays inert (§9).
- **Changed since the 0025 runbook (§2.3):** the extraction label. H-EX moved
  the post-E-XFX redaction to `orgunit-extraction-v4` and froze the v3
  transform, which is the remedy the 0025 runbook named. A v4 row in `nwf_pe`
  before the apply is a STOP; a v3 row is still escalated, now with a named
  OWNER acknowledgement path.
- **The pack.** Three files, pinned together by
  `NWF_PE_MIGRATIONS_0013_0027_APPLY_RUNBOOK_V1.SHA256SUMS`:
  - this runbook;
  - `nwf-pe-0013-0027-preflight.sql`: the read-only preconditions (§2.2);
  - `nwf-pe-0013-0027-verify.sql`: the read-only after-checks (§6).

  Check the pack before anything else:
  `(cd docs/architecture && shasum -a 256 -c NWF_PE_MIGRATIONS_0013_0027_APPLY_RUNBOOK_V1.SHA256SUMS)`
  must print `OK` three times. The firewall
  `src/test/firewall/wwNwfPeRunbook0027.firewall.test.ts` pins the same sums.

- **Byte identity.** The files applied must be byte-identical to §1. The runner
  (`src/db/migrate.ts`) records `sha256(file text)` per four-digit version in
  `schema_migrations`, and refuses a changed file forever after. A wrong file
  applied once cannot be fixed by applying the right one.

## 0. Facts (not re-measured)

`nwf_pe` was **not read** while preparing this runbook. Every number below
comes from earlier records.

- The last recorded read-only measurement (2026-10-26, in the 0013–0019
  runbook) found applied versions `0001`…`0012`, 4,647
  `orgunit_fetch_observations` rows and 3,506 `orgunit_page_evidence` rows, on
  PostgreSQL 16 in the local Docker service `nwf_pe_postgres`.
- The `orgunit_page_candidates` count was not recorded and is **UNKNOWN**.
- Whether anything at or above 0013 was applied since is **UNKNOWN**. The
  preflight (§2.2) decides which starting state holds.
- Whether any `orgunit_page_evidence` row carries the label
  `orgunit-extraction-v3` or `orgunit-extraction-v4` is **UNKNOWN**. The
  record says live acquisition was not authorised after v3 was introduced on
  2026-10-26, so the expected answer is zero for both. The preflight measures
  it (§2.3).
- The 0013–0025 runbook was **never executed** as far as any record shows.

`nwf_pe` holds the FROZEN Gen-2 A2 acquisition corpus. Every step must leave
every existing evidence row byte-identical. The per-row digests of §3.3 and
the A2/A3 corpus digests are the acceptance test.

## 1. The files

### 1.1 SHA-256 of each migration

Computed from this tree with the runner's own function (`checksum()` in
`src/db/migrate.ts`: SHA-256 over the file read as UTF-8). For these files it
equals `shasum -a 256` of the bytes, because each is plain UTF-8 with no
byte-order mark.

| file                                              | sha256                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| `0013_discovery_subject_identity.sql`             | `98af165685793512f61946b32225652465b49f669267a3eedb298fc3002cc8b2` |
| `0014_discovery_subject_writer.sql`               | `71dc4f69092bb6eac456c057af4ae15b4be5dd302a419f935e64f0c2aa1bbb35` |
| `0015_discovery_subject_review_attestation.sql`   | `f1e95ec8f24908e1baf13bfcf4ba48f2d1e176f37539e4269627b4dcdcbd09ca` |
| `0016_subject_jurisdiction_claims.sql`            | `56c877f3344a2f51b15b4210d2ac488dcbe30e7bee437c35ac19f87926bf8f1c` |
| `0017_subject_research_admission.sql`             | `2c96644175202cd827a580e3dd857a20c308b6302f5c99c443db10c099792c9f` |
| `0018_subject_research_roots.sql`                 | `4d29d623f5eee8d964711d0688145cbc71d2bef7a0902998d05adb41b832d065` |
| `0019_source_discovery_nominations.sql`           | `7c046ec9604f1c2bc4f76af43c862b5f1a1fa1556067fe70d34ff3e1818347d6` |
| `0020_source_discovery_link_out_sightings.sql`    | `667c0066a6773acb9e28bee46b363bde82060cdf21afdf14e47e2c8abe1d6d19` |
| `0021_subject_jurisdiction_claim_writer.sql`      | `791bf4b5ceb97b7b04b36f5c477023a86e435152737406dadbdfe23027b1cff4` |
| `0022_source_discovery_live_grants.sql`           | `87b541b16c26022e01343f42ff20ab6f10da1ea3a0646a321cf38674e8a2a880` |
| `0023_acquisition_campaigns_and_queue.sql`        | `a433f2769fc5458be5a33d1b9caa289e035da0a84eb2fdb9511826107f3351e3` |
| `0024_campaign_research_admission_and_wiring.sql` | `72bc76aa58ad4eb11a09616b3b5093b7d089effca3e96eb7198ed8713c2e2acf` |
| `0025_source_discovery_search_gate.sql`           | `26920ea160608a7cfd4001d9aaa503ceb2575f686ab7ab8c77fdb67c9516b4db` |
| `0026_acquisition_hardening.sql`                  | `c845f8cf8675e8fa53d62b0ff92e1fc1a87fcbf245385ff010a13460be5d4ac1` |
| `0027_source_discovery_search_observations.sql`   | `ae4cf78416a40e2a5fbf36cb4bc2b9de4dcfd3f732929a26f6dfd5bf91931f2c` |

0013–0025 carry the same digests as in the 0013–0019, 0013–0021 and
0013–0025 runbooks. Verify on the granted commit:
`shasum -a 256 migrations/001[3-9]_*.sql migrations/002[0-7]_*.sql` must
print exactly these fifteen lines, and `ls migrations` must end at `0027_…`.

### 1.2 What each file does to existing data, and its locks

0013–0019 are described in the 0013–0019 runbook §1 and 0020–0021 in the
0013–0021 runbook §1. Both descriptions are unchanged; 0022–0025 are restated
here from the 0013–0025 runbook. In short: **0017 and
0018 are the only files in the range that rewrite data**, and both rewrite
only GENERATED columns derived from stored values. 0017 takes ACCESS
EXCLUSIVE on `orgunit_fetch_observations`, `orgunit_page_evidence` and
`orgunit_research_runs`; 0018 on `orgunit_page_candidates`. They run only in
state A.

| file   | existing rows touched                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | locks (held to COMMIT)                                                                                                                                                                                                                                                                                                        |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0022` | none. A unique index `source_discovery_briefs (id, plan_digest)` (always satisfiable: `id` is the primary key); five new append-only tables (`source_discovery_grants`, `_grant_uses`, `_query_calls`, `_run_completions`, `_nomination_known_marks`) with verification triggers; one deferred constraint trigger on the existing `source_discovery_runs` (a live-provider run cannot commit without a grant use). No role, no LOGIN; SELECT/INSERT and SELECT grants only (§1.4)                                                                                                                                                                                                                                                            | SHARE on `source_discovery_briefs` (index build); SHARE ROW EXCLUSIVE on `source_discovery_runs` (trigger), `source_discovery_briefs` and `source_discovery_nominations` (new FKs)                                                                                                                                            |
| `0023` | none. Creates the cluster-wide NOLOGIN role `nwf_acquisition_worker` if absent (and forces NOLOGIN, no attribute, `PASSWORD NULL`); six new append-only tables, the security-invoker view `acquisition_work_item_states`, helper functions; `CONNECT` on the current database and `USAGE` on `public` for the new role. Nothing existing altered                                                                                                                                                                                                                                                                                                                                                                                             | brief; a new FK into `subject_review_environment` (SHARE ROW EXCLUSIVE)                                                                                                                                                                                                                                                       |
| `0024` | `subject_research_admissions` gains `admission_basis` (`NOT NULL DEFAULT 'OWNER_REVIEWED'`, a constant default: no table rewrite on PostgreSQL 16), `campaign_id`, `campaign_work_item_id`, two FKs, a rebuilt policy-version CHECK (validated over every row) and a partial index; one more BEFORE INSERT trigger on it. Three new append-only tables plus `acquisition_claim_lease_extensions`; review fixes to the 0023 objects; column grants (§1.4)                                                                                                                                                                                                                                                                                     | ACCESS EXCLUSIVE on `subject_research_admissions` (empty in every accepted state, §2.2 P6); SHARE ROW EXCLUSIVE on `acquisition_campaigns` / `acquisition_work_items` (FKs); brief catalogue updates for the column grants on `orgunit_research_runs` and `source_discovery_nominations`. No orgunit table is locked for long |
| `0025` | none. Widens two 0022 CHECKs to supersets (validated over every row, empty in every accepted state); two new append-only tables (`source_discovery_query_call_starts`, `source_discovery_smoke_verifications`); `CREATE OR REPLACE` of the six 0022 trigger functions with a pinned `search_path`                                                                                                                                                                                                                                                                                                                                                                                                                                            | ACCESS EXCLUSIVE on `source_discovery_query_calls` and `source_discovery_run_completions` (created by 0022 in the same apply in states A–C); SHARE ROW EXCLUSIVE on `source_discovery_runs` (new FK)                                                                                                                          |
| `0026` | none rewritten. `acquisition_campaigns` gains `link_out_max_hops` (`NOT NULL DEFAULT 1`, a constant default: no table rewrite) and a rebuilt version CHECK; `acquisition_work_outcomes` a rebuilt human-queue CHECK (both validated over every row, empty in every accepted state); a READ COMMITTED guard trigger on the eight acquisition write tables; one more BEFORE INSERT trigger on `orgunit_research_runs` (a CAMPAIGN admission's run); the definer-rights view `subject_research_campaign_admission_standing` (booleans, two instants, a run id and a count per CAMPAIGN admission; SELECT to `nwf_research` and `nwf_readonly`); one column grant (§1.4); `CREATE OR REPLACE` of 0023/0024 functions with a pinned `search_path` | ACCESS EXCLUSIVE on `acquisition_campaigns` and `acquisition_work_outcomes` (created by 0023 in the same apply); SHARE ROW EXCLUSIVE on `orgunit_research_runs` (trigger, brief) and on the eight acquisition tables (triggers). No evidence row is read or written                                                           |
| `0027` | none. One new append-only table (`source_discovery_query_call_observations`, one row per terminal query call); a deferred constraint trigger on `source_discovery_query_calls`; a BEFORE INSERT trigger on `source_discovery_nominations` (live-search rows only); `CREATE OR REPLACE` of three 0022/0025 trigger functions (explicit not-found refusal), of the 0025 smoke-verification function and of the 0019 nomination function (pinned `search_path`); `ALTER FUNCTION … SET search_path` on the two 0020 functions                                                                                                                                                                                                                   | SHARE ROW EXCLUSIVE on `source_discovery_query_calls` and `source_discovery_nominations` (triggers; created by 0019/0022, empty in every accepted state)                                                                                                                                                                      |

Dependencies: 0022 needs 0019 (`source_discovery_briefs`, `_runs`,
`_nominations`) and 0013's `discovery_identity_refuse_mutation`. 0023 needs
0015 (`subject_review_environment`) and 0013. 0024 needs 0017
(`subject_research_admissions`, `_revocations`), 0019, 0007 and 0023. 0025
needs 0022. 0026 needs 0023, 0024 and 0017. 0027 needs 0019, 0020, 0022 and 0025. Never apply a file without everything it depends on; the runner
applies them in order, so the whole range is applied or the failing file and
everything after it is not (§5).

### 1.3 Roles and functions

- **Roles.** 0014, 0015, 0019 and 0023 create the cluster-wide NOLOGIN
  capability roles `nwf_discovery_subject_writer`,
  `nwf_discovery_subject_reviewer`, `nwf_source_discovery` and
  `nwf_acquisition_worker` if absent. They may already exist on the local
  cluster, because the test database shares it. No migration creates a LOGIN
  role, a password or a membership. 0020–0027 grant `nwf_ingest` and
  `nwf_classifier` nothing, and `nwf_research` only SELECT on 0026's
  `subject_research_campaign_admission_standing`.
- **No SECURITY DEFINER function** exists in `public` after the range
  (verify F3).
- **Pinned `search_path`.** Every function 0022–0027 creates or replaces runs
  with `search_path = public, pg_catalog, pg_temp`, and 0027 pins three
  0019/0020 nomination functions the same way (38 functions; verify F1, F2).
  The 10 other functions created by 0013–0021, and the one created by 0011,
  carry **no** pinned `search_path`. That is how they were committed, and
  committed migrations are never edited (CLAUDE.md rule 5). Verify F1 pins
  that state exactly, so drift fails. The residual risk is bounded: none of
  them is SECURITY DEFINER, and no runtime role holds `TEMPORARY` on the
  database (verify R3), so no runtime session can shadow a name through
  `pg_temp`. Pinning them is a new migration and is out of scope here.

### 1.4 Exact privileges after the range, per role

Table-level, on the 35 relations 0013–0027 add (32 tables, 3 views). `r` is
SELECT, `ar` is SELECT + INSERT. No role receives UPDATE, DELETE, TRUNCATE,
REFERENCES or TRIGGER on any of them. Verify G1 pins this map, plus the
unchanged pre-0013 map, exactly.

| role                             | SELECT + INSERT                                                                                                                                                                                                                                          | SELECT only                                                                                                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nwf_source_discovery`           | `source_discovery_briefs`, `_runs`, `_nominations`, `_nomination_identities`, `_nomination_sightings`, `_grant_uses`, `_query_calls`, `_query_call_starts`, `_query_call_observations`, `_run_completions`, `_nomination_known_marks`                    | `source_discovery_grants`, `source_discovery_smoke_verifications`                                                                                                      |
| `nwf_acquisition_worker`         | `acquisition_work_items`, `_work_claims`, `_work_outcomes`, `_worker_stops`, `_campaign_subjects`, `_signals`, `_outbox_entries`, `_claim_lease_extensions`, `subject_research_admissions` (its trigger refuses any basis but `CAMPAIGN` from this role) | `acquisition_campaigns`, `acquisition_campaign_control_events`, `acquisition_work_item_states`, `subject_research_admission_revocations`, `subject_review_environment` |
| `nwf_research`                   | —                                                                                                                                                                                                                                                        | `subject_research_admissions`, `subject_research_admission_revocations`, `subject_research_registry_fingerprint`, `subject_research_campaign_admission_standing`       |
| `nwf_discovery_subject_writer`   | `discovery_subjects`, `discovery_subject_identity_claims`, `discovery_subject_relationship_claims`, `subject_jurisdiction_claims`                                                                                                                        | `discovery_subject_reviews`                                                                                                                                            |
| `nwf_discovery_subject_reviewer` | `discovery_subject_reviews`, `subject_review_attestations`                                                                                                                                                                                               | `discovery_subjects`, `discovery_subject_identity_claims`, `discovery_subject_relationship_claims`, `subject_review_environment`                                       |
| `nwf_readonly`                   | —                                                                                                                                                                                                                                                        | all 35 new relations                                                                                                                                                   |

Nobody but the migration owner (the OWNER path) may INSERT into
`source_discovery_grants`, `source_discovery_smoke_verifications`,
`acquisition_campaigns` or `acquisition_campaign_control_events`.

Column-level grants on pre-existing tables (verify G2 pins exactly these 16):

| role                             | columns                                                                                                                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nwf_discovery_subject_writer`   | SELECT `organisations (eche_row_key)`, `orgunit_page_evidence (id, observed_at, root_key)`, `subject_research_admissions (id, subject_id)`                              |
| `nwf_discovery_subject_reviewer` | SELECT `organisations (eche_row_key)`                                                                                                                                   |
| `nwf_source_discovery`           | SELECT `orgunit_page_evidence (id, observed_at)`, `website_claims (registrable_domain)`                                                                                 |
| `nwf_acquisition_worker`         | SELECT `orgunit_research_runs (id, root_scope)`, `orgunit_fetch_observations (root_subject_admission_id)`, `source_discovery_nominations (id, url, registrable_domain)` |

Database and schema: the four capability roles hold `CONNECT` on the
database and `USAGE` on `public`, beside the four pre-existing runtime roles.
No role holds `TEMPORARY`, and `PUBLIC` holds nothing (verify R3, R4).

Rows: the range creates **one** row, the `subject_review_environment`
singleton 0015 seeds with a fresh random `environment_id`. It is an
identity, not an authority. Every other new table holds zero rows.

## 2. The grant and the preconditions (all must hold; stop otherwise)

### 2.1 The required OWNER grant

Nothing in §3–§8 may run on `nwf_pe` until the OWNER has signed this text,
with the bracketed values filled in. Keep the signed grant OUTSIDE this
repository and record where it is kept before starting.

> **OWNER GRANT NWF-PE-APPLY-0013-0027-V1.** I, the OWNER, authorise applying
> the NWF Partnership Engine migrations 0013–0027 that are not yet recorded in
> `schema_migrations` to the database `nwf_pe` in the local Docker service
> `nwf_pe_postgres` (127.0.0.1:55432) on my Mac, from commit [full 40-hex
> commit SHA], starting from state [A | B | C] as reported by
> `nwf-pe-0013-0027-preflight.sql`, by the operator path `npm run db:migrate`
> with `DATABASE_URL_ADMIN` set to the owner role, exactly as
> `docs/architecture/NWF_PE_MIGRATIONS_0013_0027_APPLY_RUNBOOK_V1.md`
> describes, where the pack file
> `NWF_PE_MIGRATIONS_0013_0027_APPLY_RUNBOOK_V1.SHA256SUMS` has SHA-256
> [64-hex]. This covers the read-only preflight and verification, the backup,
> the restore test and the lock-window probe on disposable databases, and —
> only on my further written instruction — the rollback restore of §8. It does
> NOT authorise: any LOGIN role, password or role membership; any row in any
> table (no search grant, campaign, control event, smoke verification,
> review, attestation, admission, nomination or jurisdiction claim); any
> change to an operational trust set or any key; starting the acquisition
> worker; any live search, live fetch or classifier call; any staging or
> production database; any push. ADRs 0027–0030 remain Proposed.
> Extraction labels at preflight (P3): v3 = [count], v4 = [count]; [if v3 > 0:
> I acknowledge those v3 rows and accept that they are read only under the
> frozen v3 redactor (§2.3)].
> Signed: [OWNER], [date].

### 2.2 Preflight (read-only)

1. `git status` is clean on the granted commit, `npm run migrations:check`
   passes, the pack check (top of this file) prints `OK` three times, and the
   §1.1 `shasum` check matches.
2. Run, on the owner path:
   `psql "<owner URL for nwf_pe>" -X -v ON_ERROR_STOP=1 -f docs/architecture/nwf-pe-0013-0027-preflight.sql | tee "$OUT/preflight.txt"`
   (`$OUT` is defined in §3.1; create it first). **Every row must show
   `ok = t`, ending with `PREFLIGHT_OK | t`.** The checks:

   | check | must hold                                                                                                                                    |
   | ----- | -------------------------------------------------------------------------------------------------------------------------------------------- |
   | P1    | **Ledger check (before).** The starting state is **A**, **B** or **C** (below); `REFUSE` or `AT_0027` stops the runbook                      |
   | P2    | the ledger below 0013 is exactly `0001`…`0012`                                                                                               |
   | P3    | no `orgunit_page_evidence` row has `rule_version` `orgunit-extraction-v3` or `orgunit-extraction-v4` (§2.3)                                  |
   | P4    | no role is a member of any existing capability role (cluster-wide: a leftover test login would gain `CONNECT` on `nwf_pe` through 0023/0019) |
   | P5    | every existing capability role is NOLOGIN                                                                                                    |
   | P6    | in states B and C, every 0013–0021 table holds zero rows (`subject_review_environment`: exactly one)                                         |
   | P7    | no other session is connected to `nwf_pe` (0017/0018 take ACCESS EXCLUSIVE in state A; 0024–0026 take it on their own tables)                |
   | P8–P9 | measurements only: database size, server version, size and row estimate of each lock-window table                                            |

   The before-ledger query itself, also run by hand and saved to
   `$OUT/before-ledger.txt`:

   ```sql
   SELECT version, checksum FROM schema_migrations ORDER BY version;
   ```

   Exactly ONE starting state must hold for the rows `>= '0013'`:
   - **State A:** no rows at or above `0013`. Apply 0013–0027.
   - **State B:** exactly `0013`…`0019`, each with the §1.1 checksum (the same
     digests the 0013–0019 runbook V1 lists), and nothing above. Apply
     0020–0027.
   - **State C:** exactly `0013`…`0021`, each with the §1.1 checksum, and
     nothing above. Apply 0022–0027.
   - **Anything else: STOP.** A checksum not in §1.1 means a different file
     was applied under that version, and the runner would refuse this line's
     file. The relf1 line's own 0018 and 0019 must never be applied anywhere.
     A gap, or a version above the expected set, means an
     apply outside any runbook. A ledger at exactly `0013`…`0025` (the 0025
     runbook's end state, which no record says was ever reached) is `REFUSE`
     here: escalate, because this pack did not rehearse it. `AT_0027` (all
     fifteen already recorded with these digests) means nothing is to be
     applied: run §6 only.

3. Free disk is at least 3 × the P8 database size (the dump, the restore
   test, and in state A the two table rewrites).
4. The shared validation slot is not in use (one full validate at a time).
5. **Operational trust sets are empty (code check).** On the granted commit,
   both declarations must read exactly as shown:

   ```bash
   grep -n "OPERATIONAL_OWNER_REVIEW_KEYS: readonly ReviewTrustEntry\[\] = Object.freeze(\[\]);" src/orgunits/subjectReview/trust.ts
   grep -n "OPERATIONAL_OWNER_CAMPAIGN_KEYS: readonly CampaignTrustEntry\[\] = Object.freeze(\[\]);" src/orgunits/acquisition/trust.ts
   ```

   Each prints one line. If either does not, STOP: a pinned operational key
   is a separate OWNER key-custody decision, and this runbook does not cover
   a build that holds one.

### 2.3 The extraction-label check (WW E-XFX, H-EX)

WW E-XFX (2026-10-27, `src/orgunits/web/redact.ts`) made the phone redactor
redact separator-less numbers such as `0612345678`, first under the unchanged
label `orgunit-extraction-v3`. WW H-EX then moved that transform to the new
label **`orgunit-extraction-v4`** (the label `pageEvidence.ts` and
`pageCollection.ts` stamp on this commit) and FROZE the v3 transform
(`redactContactDataV3`, `FROZEN_V3_EXTRACTION_RULE_VERSION`): a stored v3 row
is judged by the frozen v3 redactor, every other label by the current one
(`QUALIFICATION_INPUT_EXPORT_V2.md`). That is the remedy the 0025 runbook
named. P3 counts both labels:

- **v4 rows: must be 0. If any v4 row exists: STOP.** Only this line's code
  writes v4, and no record says it ever ran against `nwf_pe`; a v4 row means
  an acquisition run outside any record. No acknowledgement overrides this.
- **v3 rows: expected 0. If any v3 row exists: STOP and escalate to the
  OWNER.** The label is no longer ambiguous for reading (the frozen v3
  redactor judges it), but a v3 row still means a live acquisition after
  2026-10-26 that the record says was not authorised. The OWNER may continue
  only by stating the exact v3 count in the §2.1 grant; P3 then shows `f`
  with that count and `v4=0`, and that one `f` is accepted. Nothing is
  deleted or relabelled either way.
- Rows labelled `orgunit-extraction-v1` or `-v2` are the frozen corpus; they
  are expected and untouched.

## 3. Before: backup, restore test and digests

### 3.1 Backup

The dump goes to a private, operator-chosen directory OUTSIDE this repository.
Never commit a dump, a digest file, a preflight output or the grant.

```bash
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="<private backup directory outside the repository>/nwf-pe-pre-0013-0027-$STAMP"
mkdir -p "$OUT" && chmod 700 "$OUT"
# --create puts the database itself and its CONNECT privileges in the archive,
# so the rollback (§8) recreates nwf_pe exactly; -Fc is the custom format.
docker exec nwf_pe_postgres pg_dump -U nwf_owner -d nwf_pe -Fc --create > "$OUT/nwf_pe.dump"
# Roles are cluster-wide and not in a database dump: record them, without passwords.
docker exec nwf_pe_postgres pg_dumpall -U nwf_owner --roles-only --no-role-passwords > "$OUT/roles.sql"
chmod 600 "$OUT/nwf_pe.dump" "$OUT/roles.sql"
shasum -a 256 "$OUT/nwf_pe.dump" "$OUT/roles.sql" > "$OUT/SHA256SUMS"
```

### 3.2 Restore test (into a disposable database)

```bash
shasum -a 256 -c "$OUT/SHA256SUMS"                     # integrity before use
docker exec nwf_pe_postgres createdb -U nwf_owner nwf_pe_restore_probe_test
docker exec -i nwf_pe_postgres pg_restore -U nwf_owner --exit-on-error \
  -d nwf_pe_restore_probe_test < "$OUT/nwf_pe.dump"
```

Without `--create`, `pg_restore` restores into the named probe database and
skips the archive's own database entry. Then run the §3.3 digests against
BOTH `nwf_pe` and `nwf_pe_restore_probe_test` and require identical output.
Only then drop the probe:
`docker exec nwf_pe_postgres dropdb -U nwf_owner nwf_pe_restore_probe_test`.
A dump that fails this test is not a backup: STOP.

### 3.3 Per-row digests (read-only; save each to `$OUT/before-*.txt`)

The same digests as the 0013–0019 runbook §3:

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
SELECT a.grantee::regrole::text, c.relname, a.privilege_type
  FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
 WHERE c.relnamespace = 'public'::regnamespace AND a.grantee <> c.relowner
 ORDER BY 1, 2, 3;
```

Also run the repository's own A2/A3 corpus digest checks if the grant names
them (they are the frozen-corpus acceptance).

## 4. Lock-window and large-table probe (recommended; mandatory in state A)

P9 reports each lock-window table's size and row estimate. To measure the
actual window, rehearse on a disposable copy, never on `nwf_pe`:

```bash
docker exec nwf_pe_postgres createdb -U nwf_owner nwf_pe_lockprobe_test
docker exec -i nwf_pe_postgres pg_restore -U nwf_owner --exit-on-error \
  -d nwf_pe_lockprobe_test < "$OUT/nwf_pe.dump"
time env DATABASE_URL_ADMIN="<owner URL for nwf_pe_lockprobe_test>" npm run db:migrate \
  2>&1 | tee "$OUT/lockprobe.log"
psql "<owner URL for nwf_pe_lockprobe_test>" -X -v ON_ERROR_STOP=1 \
  -f docs/architecture/nwf-pe-0013-0027-verify.sql > "$OUT/lockprobe-verify.txt"
docker exec nwf_pe_postgres dropdb -U nwf_owner nwf_pe_lockprobe_test
```

Record the total time and, in state A, the 0017 and 0018 durations (the log
prints one `Applied` line per file). The verify output of the probe must end
`ALL_CHECKS_TRUE | t` (one exception: R3 reads the probe database's own
privileges, which a restore without `--create` does not carry; R3 may show
`f` on the probe only). If the window is longer than the OWNER accepts,
STOP and report it; nothing here shortens it.

## 5. Apply

```bash
# From a clean checkout of the granted commit. DATABASE_URL_ADMIN must point at
# nwf_pe on the OWNER path; a value set in the environment wins over .env.
env DATABASE_URL_ADMIN="<owner URL for nwf_pe>" npm run db:migrate 2>&1 | tee "$OUT/apply.log"
```

This is the repository's own runner (`src/db/migrate.ts`); never apply a
migration file with `psql -f` or any other ad-hoc SQL. The runner first
re-checks the checksum of every recorded version and refuses on any mismatch.
It then applies each pending file in its OWN transaction, in order, and
records its checksum in the same transaction. A failure rolls back THAT file
only; earlier files stay applied, and nothing after it runs. STOP on any
failure and go to §7.

The log must show exactly these `Applied` lines, then
`Migrations complete: <n> applied, <27 − n> already present.`:

- State A: 15 lines, `0013_…` to `0027_…` (n = 15);
- State B: 8 lines, `0020_…` to `0027_…` (n = 8);
- State C: 6 lines, `0022_…` to `0027_…` (n = 6).

This runbook covers the whole range to 0027 only. The runner has no `--to`
option; a grant that stops earlier follows a predecessor runbook for its
range, and stopping inside 0022–0027 is not covered (verify assumes 0027).

## 6. After: verification (all must hold)

1. **Ledger check (after).**
   `SELECT string_agg(version || ':' || checksum, ',' ORDER BY version) FROM schema_migrations WHERE version >= '0013';`
   lists exactly the fifteen §1.1 rows. The `< '0013'` ledger is identical to
   `$OUT/before-ledger.txt`. In states B and C, the rows already present are
   byte-identical to the saved ones and only the new versions are added.
2. **The verify file.** On the owner path (it reads `pg_authid`):
   `psql "<owner URL for nwf_pe>" -X -v ON_ERROR_STOP=1 -f docs/architecture/nwf-pe-0013-0027-verify.sql | tee "$OUT/verify.txt"`.
   It is SELECT-only, in one `READ ONLY` transaction ended by `ROLLBACK`.
   **Every row must show `ok = t`, and the last row must be
   `ALL_CHECKS_TRUE | t | 53 checks`.** What it proves:

   | check  | proves                                                                                                                                                                                                                                                                                                                                                                                                                |
   | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | L1, L2 | the ledger is exactly `0001`…`0027`, and 0013–0027 carry the §1.1 digests                                                                                                                                                                                                                                                                                                                                             |
   | R1     | `nwf_discovery_subject_writer`, `nwf_discovery_subject_reviewer`, `nwf_source_discovery`, `nwf_acquisition_worker` exist, NOLOGIN, no attribute, no password                                                                                                                                                                                                                                                          |
   | R2     | no role is a member of any of the four, and they are members of nothing                                                                                                                                                                                                                                                                                                                                               |
   | R3, R4 | database privileges are exactly CONNECT for the eight runtime and capability roles (no TEMPORARY, nothing for PUBLIC); schema `public` USAGE likewise                                                                                                                                                                                                                                                                 |
   | G1     | every non-owner privilege on every relation in `public` equals the expected map: the §1.4 map for new relations and the unchanged pre-0013 map for the rest                                                                                                                                                                                                                                                           |
   | G2     | the 16 column grants of §1.4, and no other                                                                                                                                                                                                                                                                                                                                                                            |
   | G3     | no privilege letter beyond SELECT/INSERT for any role, except the pre-0013 UPDATE that `nwf_ingest` has always held on `ingest_runs` and `organisations`                                                                                                                                                                                                                                                              |
   | G4     | no default privileges are configured                                                                                                                                                                                                                                                                                                                                                                                  |
   | F1–F3  | the exact function list and each function's `proconfig` (38 pinned to `search_path = public, pg_catalog, pg_temp`, 11 unpinned as committed, §1.3); no SECURITY DEFINER function                                                                                                                                                                                                                                      |
   | T1, T2 | the exact list of 77 user triggers, all enabled; all 32 new tables carry the row-level append-only refusal (`discovery_identity_refuse_mutation`, BEFORE UPDATE OR DELETE)                                                                                                                                                                                                                                            |
   | V1     | `acquisition_work_item_states` is `security_invoker`                                                                                                                                                                                                                                                                                                                                                                  |
   | C1, C2 | every constraint validated; research roots still `ECHE` only; no fetch carries a subject-admission root                                                                                                                                                                                                                                                                                                               |
   | X1     | still no `orgunit-extraction-v4` row (the detail also prints the v3 count, which must equal P3's)                                                                                                                                                                                                                                                                                                                     |
   | N …    | **zero rows** in every new table and view (grants, grant uses, query calls, starts and observations, smoke verifications, campaigns, control events, work items, claims, outcomes, stops, subjects, reviews, attestations, admissions, nominations, jurisdiction claims, signals, outbox entries, lease extensions), exactly one `subject_review_environment` row, and the registry fingerprint `s=0;i=0;r=0;v=0;a=0` |

3. The §3.3 digests are **identical** to the `before` files (0017/0018 rewrite
   only generated columns the digests do not read; 0022–0025 touch no
   evidence row, and 0026–0027 neither). The table-privilege listing differs
   from `before` only by the rows for the new relations of §1.4.
4. The §2.2 item 5 code check still prints both lines: applying a migration
   changes no trust set.
5. Record in the private `$OUT`: the starting state, the commit, the apply
   log, the preflight and verify outputs, the before and after digests, and
   the time. Commit none of it.

## 7. Stop and escalate

STOP, change nothing further, and report to the OWNER when: the pack or a
migration digest does not match; the preflight is not all `t` (one exception:
a P3 `f` whose v3 count the signed grant states and whose v4 count is 0,
§2.3); any v4 row exists, or a v3 row the grant does not state; the restore test fails; the lock window is unacceptable; the
runner fails or prints anything other than the expected `Applied` lines; or
any verify row is `f`. A failure is evidence, not something to work around:
never edit a migration, never run a migration file by hand, never insert or
delete a ledger row, never alter a privilege to make a check pass.

## 8. Rollback

Migrations are forward-only (CLAUDE.md rule 5): there is no down script and
no migration may be edited or reversed by hand. **Rollback means restoring the
§3.1 dump**, and only on the OWNER's written instruction under the grant (or a
separate one). Dropping `nwf_pe` destroys the post-apply state; the grant
must say so.

```bash
docker exec nwf_pe_postgres dropdb -U nwf_owner nwf_pe
docker exec -i nwf_pe_postgres pg_restore -U nwf_owner --exit-on-error --create \
  -d postgres < "$OUT/nwf_pe.dump"
```

`--create` recreates `nwf_pe` from the archive, with its CONNECT privileges.
Then re-run the §3.3 digests and the preflight, and require equality with the
`before` files and the original starting state. Cluster-wide roles survive a
database restore: `nwf_acquisition_worker` (state A–C) and, in state A, the
three earlier capability roles may remain. That is harmless (NOLOGIN, no
members, and no CONNECT on the restored database), but it must be recorded.
In state A the restore also removes the `subject_review_environment` row; a
later re-apply seeds a NEW `environment_id`, so any review envelope prepared
against the earlier one is refused, by design.

## 9. What applying does NOT authorise

Applying 0013–0027 creates schema, four NOLOGIN capability roles and one
environment row. It turns nothing on. In particular it does NOT authorise,
and this runbook never performs:

- migrating `nwf_pe` or any persistent database without the §2.1 grant;
- creating a LOGIN role or a password, or granting any role membership in
  `nwf_source_discovery`, `nwf_acquisition_worker`,
  `nwf_discovery_subject_writer` or `nwf_discovery_subject_reviewer` (the
  Mac runtime's worker login is a separate OWNER decision);
- writing any row: no `source_discovery_grants` row (no live search may run),
  no smoke verification, no acquisition campaign or control event, no work
  item, no review, attestation, admission, nomination or jurisdiction claim;
- generating, pinning or rotating any key, or changing either operational
  trust set (both stay empty, §2.2 item 5);
- starting the acquisition worker or the Mac runtime supervisor;
- any live web search, live fetch of an institution, or classifier call;
- accepting ADRs 0027–0030, which stay Proposed;
- any staging or production database, or any push.

## 10. How this pack was prepared (no persistent database involved)

On a disposable, tmpfs-backed PostgreSQL 16 container (never `nwf_pe`):

- the expected values in the verify file were regenerated from the catalogue
  of a database migrated `0001`–`0027` from this tree, by a generator that was
  first shown to reproduce the committed 0013–0025 verify file byte for byte
  from a database migrated `0001`–`0025`;
- states A, B and C were each built from this tree's own migrations (a
  temporary copy whose `migrations/` ended at 0012, 0019 or 0021), then
  rehearsed end to end: preflight (`state=A`/`B`/`C`, all `t`), `pg_dump -Fc`,
  SHA-256, restore test, `npm run db:migrate` (15, 8 and 6 `Applied` lines),
  and the verify file (`ALL_CHECKS_TRUE | t | 53 checks` each);
- the rollback of §8 was rehearsed from a `--create` dump of a state-A
  database migrated to 0027: the restored database was back at `0001`–`0012`
  with its CONNECT privileges, and the preflight reported `state=A`;
- negative cases were proven on throwaway copies: an extra UPDATE privilege,
  a LOGIN member of a capability role, an unpinned function, a SECURITY
  DEFINER function, a disabled append-only trigger and a v4 evidence row each
  turn the matching verify check to `f`; a wrong ledger checksum, a capability
  member, a v3 row, a v4 row and a row in a 0013–0021 table each turn the
  matching preflight check to `f`.
