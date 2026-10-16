# ADR 0020 — Controlled discovery-subject registry and review preview (B2.2)

- **Status:** Proposed. LOCAL, OFFLINE implementation authorised by the OWNER
  (Track B, B2.2), evaluated for local acceptance only. Not committed, not
  deployed, and migration 0014 has not been applied to any persistent database.
  Amended in place by the OWNER-authorised **B2.2-C** local correction
  (2026-10-16, still uncommitted): the writer capability was renamed and the
  canonical identity boundary (§12) was added. Nothing else changed.
- **Date:** 2026-10-15 (B2.2-C amendment 2026-10-16)
- **Phase:** Track B — Discovery & Research Quality, slice B2.2
- **Extends:** ADR 0019 (discovery-subject identity). **Supersedes nothing.**
- **Owner decision record:**
  `docs/evaluation/TRACK_B_B2_2_DISCOVERY_SUBJECT_REGISTRY_OWNER_DECISION_V1.json`
- **Numbering:** ADR 0020 and migration 0014 were checked against every local
  and remote-tracking branch (246 refs) before these files were written.

Claims are tagged **FACT**, **MEASUREMENT**, **DESIGN DECISION**, **UNKNOWN**.

---

## 1. What this slice adds

A working, append-only workflow for **synthetic or manually registered**
candidate subjects:

| piece                                          | what it is                                                                               |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `migrations/0014_discovery_subject_writer.sql` | one NOLOGIN capability role, its grants, an actor-binding INSERT trigger                 |
| `src/orgunits/subjectRegistry/`                | request shapes, bounded store reads, the writer, the read model, the reviewer capability |
| `src/cli/commands/discoverySubjects.ts`        | `nwf-pe discovery-subjects propose / claim / relate / review / show / list`              |

It authorises nothing beyond recording and reading identity evidence. There is
no research, classification, scoring, outreach, publication or production
ingestion anywhere in it.

## 2. The writer capability (migration 0014)

**DESIGN DECISION.** The CLI does not run on the owner credential. Migration
0013 left the owner (the migration credential, a superuser in the local
Docker setup) as the only writer. Using it for an everyday command would give
that command the power to alter schema, disable triggers and record reviews
under any actor key.

`nwf_discovery_subject_writer` is a **NOLOGIN capability role** with no attributes and
no password. No migration creates a login for it. A deployment grants it to a
separately provisioned login; the CLI reads that login's connection string from
`DATABASE_URL_DISCOVERY_SUBJECT_WRITER` (environment only — never an argument, so it
never lands in shell history).

| object                                  | privilege                 | why                                                                       |
| --------------------------------------- | ------------------------- | ------------------------------------------------------------------------- |
| `discovery_subjects`                    | SELECT, INSERT            | register; read for validation                                             |
| `discovery_subject_identity_claims`     | SELECT, INSERT            | append claims; read for validation and dedupe                             |
| `discovery_subject_relationship_claims` | SELECT, INSERT            | append claims; read for validation                                        |
| `discovery_subject_reviews`             | **SELECT only**           | derived review state is part of validation; **no review write**           |
| `organisations (eche_row_key)`          | SELECT on that one column | the validator refuses a relationship to an ECHE row it is not told exists |
| database / schema                       | CONNECT / USAGE           | to connect at all                                                         |

**Reading for validation is not modifying.** SELECT confers no UPDATE, DELETE
or TRUNCATE; none is granted, and 0013's trigger refuses UPDATE and DELETE for
every role regardless. Foreign keys into `orgunit_page_evidence` and
`website_claims` are still enforced (PostgreSQL checks them with the
referenced table owner's rights), so the writer learns only whether its own
INSERT succeeded. It holds no TEMPORARY, no sequence and nothing on any
research, classifier, ECHE, EWP, website or cohort table.

**Why this name (B2.2-C).** The role was first drafted as
`nwf_identity_writer`. No literal PostgreSQL role-name collision was ever
demonstrated, but that name sits conceptually inside the `nwf_identity*` role
family of Track C's provisional canonical identity register (I0), and this
role writes nothing canonical. It was renamed before any commit to
`nwf_discovery_subject_writer`, with `DATABASE_URL_DISCOVERY_SUBJECT_WRITER`
(and `…_TEST`) for the connection string. Its privileges are byte-for-byte
the ones above. The rename was safe only because 0014 had never been
committed or applied outside disposable test databases.

**No existing role changes.** `nwf_ingest`, `nwf_research` and
`nwf_classifier` still cannot even read the four tables; `nwf_readonly` keeps
SELECT; none of them is a member of the new role.

**The recorded actor is bound, not typed.** A BEFORE INSERT trigger on the
three writable tables requires every row inserted by a session that is not
the table owner to carry exactly the path key `discovery-subjects-cli`
(SQLSTATE 42501 otherwise). A holder of the capability therefore cannot make
its rows read as if the owner path recorded them, even with raw SQL. The owner
path of 0013 is unchanged.

**A capability is not an identity.** Holding `nwf_discovery_subject_writer` proves the
caller has a credential that was granted it. It does not prove who the caller
is, and nothing the role can write is a review. The CLI also refuses to execute
on a superuser or table-owner connection, or on one that does not hold the
capability (`WRITER_SESSION_REFUSED`), and narrows every write transaction with
`SET LOCAL ROLE nwf_discovery_subject_writer`.

## 3. The CLI

| command   | writes?          | connection | what it does                                                                                       |
| --------- | ---------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| `propose` | with `--execute` | writer     | one subject + its first NAME claim, in one transaction                                             |
| `claim`   | with `--execute` | writer     | one NAME / ALTERNATE_NAME / NATIVE_NAME / ENTITY_KIND / PUBLIC_WEBSITE / EXTERNAL_IDENTIFIER claim |
| `relate`  | with `--execute` | writer     | one relationship claim to a subject or an ECHE source row                                          |
| `review`  | **never**        | readonly   | a preview of one decision; `--execute` is refused                                                  |
| `show`    | no               | readonly   | the derived read model of one subject                                                              |
| `list`    | no               | readonly   | one keyset page (`--limit` 1–100, `--after <uuid>`)                                                |

- **Dry run by default.** Without `--execute`, a write-capable command runs on
  the readonly role in a `REPEATABLE READ READ ONLY` transaction, appends the
  would-be records in memory, runs the validator and prints the would-be read
  model. It cannot write (the role has no INSERT), returns no token, and its
  ids are provisional. Execution re-judges from scratch.
- **Narrow by construction.** `discovery-subjects` is dispatched before the
  global parser and parses its own strict option set per subcommand; an
  unknown option or positional is refused. There is no `--actor-key`, no SQL,
  JSON, CSV, bulk, import or "set field" surface.
- **`relate` is its own command** because a relationship claim is a different
  B2.1 record with a target (another subject or an ECHE row); folding it into
  `claim` would need a second, conditional schema inside one command.
- **Every source is attributable.** Each claim cites exactly one of a public
  URL (optionally with a SHA-256 version ref), a page-evidence row or a
  website-claim row, plus `--observed-at` (never defaulted) and `--basis`.
  A source URL is recorded, never fetched.

## 4. Proposal, claim, review — three different acts

- **A proposal** registers an opaque identity with a working kind label
  (`UNCERTAIN` allowed) and, atomically, one source-backed NAME claim. It
  creates no ECHE row, research run, Track C assessment, opportunity or
  outreach permission. Existence of a subject is not verification.
- **A claim** is one source's assertion. Each is judged by the B2.1 validator
  over the subject's bounded neighbourhood before it is inserted.
- **A review** is a trusted path's decision about exactly one subject, one
  identity claim or one relationship claim. It never extends to other claims:
  a subject-level CONFIRMED does not confirm its claims, and a claim added
  after a confirmation starts UNREVIEWED.

## 5. Derived read model

`deriveSubjectReadModel` is pure and stores nothing. It recomputes from the
rows on every read, using `validateIdentityGraph` and
`evaluateStructuralParentConstraint` from B2.1. It keeps apart:

| field                 | meaning                                                |
| --------------------- | ------------------------------------------------------ |
| `proposed`            | the row exists (always true)                           |
| `structurallyValid`   | no INVALID finding touches the subject — not true      |
| `conflicted`          | a CONFLICT finding, or a broken review chain           |
| `reviewCoverage`      | `UNREVIEWED` / `PARTIALLY_REVIEWED` / `FULLY_REVIEWED` |
| `identityReview`      | head of the subject's own review chain                 |
| `reviewConfirmed`     | that head is CONFIRMED and nothing is INVALID          |
| `factualVerification` | always `NOT_ESTABLISHED_BY_THIS_LAYER`                 |

There is no `verified` flag. Per-claim review heads are read off chains the
validator has certified; the unit test checks they agree with the validator's
own states for relationship claims.

**Research authority is `granted: false` on every subject, by type.** Its
reasons always include `SUBJECT_RESEARCH_ADMISSION_POLICY_ABSENT` and
`PROTECTED_STRUCTURAL_PARENTAGE_NOT_EVALUATED`. **A reviewed identity is not
research eligibility.**

**Structural parentage (ADR 0019 §7), applied conservatively.** The read
model never loads the B3.0 registry and creates no cohort label. It calls the
B2.1 evaluator with **no** protected keys, and surfaces only an `UNRESOLVED`
answer (cycle, missing parent of a parent-implying or `UNCERTAIN` kind) — its
"no known block" answer is not shown, because protection was not evaluated.
`HOSTED_BY` and every other non-`PART_OF` predicate is marked non-structural.
An `UNCERTAIN` subject with no parent stays `STRUCTURAL_PARENT_UNKNOWN`. None
of this feeds any research path: no research or classifier file imports the
registry.

## 6. Reviewer trust — confirmed absent; authoritative review DISABLED

**FACT.** The Engine has no authenticated OWNER identity:

- the "owner path" of migrations 0007 and 0013 is possession of the migration
  credential, which in this repository is the deterministic local-development
  superuser `nwf_owner`; it proves database ownership, not a person;
- a database role proves a capability, not a person;
- a terminal session proves nothing about who is at it;
- no signing key, identity provider or attestation mechanism exists in this
  repository, and other tracks' identity work (Track C's register, the shared
  identity register) is on unmerged branches and was not reused or widened;
- in particular, I0's registrar attribution (`decided_by`) is a free slug
  supplied with the registrar credential. It is attribution, not proof of who
  decided, and B2.2-C does **not** accept it as reviewer authority.

**DESIGN DECISION.** No command accepts an actor key. Review **execution is
disabled for every outcome**, not only CONFIRMED: a REJECTED `PART_OF` is no
longer followed by the protected structural-parent evaluator, so a forged
rejection could remove a research block. `review --execute` is refused with
`REVIEWER_TRUST_PRIMITIVE_ABSENT` before any connection opens, and the writer
role has no INSERT on reviews.

What exists is the review **writer**, behind a capability that cannot be
supplied: `recordReview` requires a `TrustedReviewerContext` carrying a private
`#sealed` brand. The only way to mint one is `TrustedReviewerContext.testSeam`,
which throws outside vitest — the `RobotsAuthorisation` pattern. Tests use it,
on the owner path 0013 already designates for reviews, to prove the chain,
staleness and concurrency guarantees below.

**Blocker, stated precisely.** Authoritative review needs (1) a trust
primitive that identifies the reviewer independently of the caller's input,
and (2) a database capability for review INSERT bound to it. Neither exists.
A future milestone may add exactly one production factory for the context,
deriving its actor key from that primitive.

## 7. Transactions, staleness, concurrency, idempotency

- **One transaction per execution.** Session check → `SET LOCAL ROLE` →
  `pg_advisory_xact_lock(140014, hashtext(subject_id))` → reload → validate →
  INSERT → COMMIT. Any refusal rolls everything back, so a proposal whose
  claim INSERT fails leaves no subject (tested by a foreign-key failure after
  the subject INSERT).
- **The lock is the database's**, transaction-scoped and cross-process, not an
  application mutex. It serialises B2.2 writers per subject; it is advisory,
  so it does not bind raw owner SQL. Read Committed is used deliberately so
  that statements after the lock see everything committed before it.
- **Stale review targets.** A review must name the head it supersedes
  (`--expect-head <review-uuid|none>`) and the subject's `stateDigest` as the
  reviewer saw it (`--expect-state`). The digest covers the subject, its claims,
  its relationship claims and every review of any of them; any new record
  changes it. Mismatch → `STALE_REVIEW_HEAD` / `STALE_SUBJECT_STATE`.
- **Competing branches.** 0013's partial unique indexes (one chain root per
  target, one successor per review) mean two decisions extending the same head
  cannot both land, with or without the lock. Measured: three concurrent
  decisions on one claim → exactly one row.
- **Conflicting kind confirmations** (which B2.1 grades CONFLICT, not INVALID)
  are refused as `REVIEW_CONFLICT_INTRODUCED`; the reviewer must first
  withdraw or reject the other confirmation.
- **Idempotency without new infrastructure.** `propose` takes an
  operator-chosen `--subject-id`, so a retry is `SUBJECT_ALREADY_EXISTS`; a
  repeated claim from the same source is `DUPLICATE_ASSERTION` (0013's unique
  index is the backstop); a retried review is `STALE_REVIEW_HEAD`. Nothing is
  silently written twice.

## 8. Provenance and privacy

Every value passes B2.1's admissibility rules twice — in the validator and in
0013's CHECKs. Mailbox- and telephone-shaped text, userinfo, query strings and
social or messaging hosts are refused; a refused value is never moved into a
note. There is no contact, person or free JSON field, and the CLI has no option
that could carry one. The registry module opens no socket; the integration test
observes, through `node:diagnostics_channel`, that recording a public website
opens only loopback connections to the test database, with no DNS lookup, no
HTTP request and no `fetch()`.

## 9. Historical compatibility (FACT, MEASUREMENT)

Adding 0014 and its first production importer failed four existing assertions.
Each was resolved by the pattern its own file prescribes or by the B2.1-R1
range-scoping convention, and each is pinned by its exact removed lines in the
B2.2 firewall:

| file                                                      | conflict                                                | correction                                                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `orgunitCorpus2DA1Frame.test.ts`                          | a migration above the frozen stamp must be acknowledged | one `MIGRATIONS_AFTER_THE_CORPUS_FREEZE` entry for 0014; stamp `0001..0012` and `frameContract.ts` untouched |
| `orgunitSchema.test.ts`                                   | pinned applied-migration list ended at 0013             | `'0014'` appended, as for 0010–0013                                                                          |
| `discoveryIdentitySchema.test.ts` (B2.1)                  | "only `nwf_readonly` holds grants"                      | excludes `nwf_discovery_subject_writer`, whose exact grants the B2.2 test asserts                            |
| `phase2bDiscoverySubjectIdentity.firewall.test.ts` (B2.1) | "no production importer" read the current tree          | read at B2.1's own terminal commit `ee39c7a`; the B2.2 firewall pins exactly which files may import it now   |

The Frame was not regenerated, no earlier migration changed, and no A3
harness file changed. ADR 0019 §10.6's residual uncertainty (the frozen stamp
does not describe a schema with post-freeze migrations) now covers 0013 and
0014; 0014 adds no table the frame reader reads.

## 10. Database isolation for tests

All database tests ran against one disposable PostgreSQL 16 container: the
existing local image `postgres:16-alpine` (`cf78e76683b9`, `--pull never`),
data on tmpfs, no volume or bind mount, `127.0.0.1` on a free port, a random
owner password, and every migration-created login rotated to a random password
inside the instance. The connection strings lived only in a scratch env file
outside the repository. The integration test creates two throwaway logins with
random passwords and drops them. The container was removed afterwards.

## 11. Deferred, and not authorised here

- authoritative review execution, and the trust primitive it needs;
- a database capability for review INSERT;
- any subject research admission, planner or `--execute` research command;
- loading the B3.0 registry for subjects, and the ADR 0019 §7 OWNER questions;
- real candidate organisations, production or shared databases, a deployment
  login for the writer;
- social-platform sources, contact data, Track C/D integration, bulk import;
- (B2.2-C) any B-to-C handoff (`show --handoff-v0` or otherwise), automatic
  registration in a canonical register, a mapping from B kinds or predicates
  to Candidate kinds or relations, and any stored `cand:` / `chn:` / `opp:`
  value.

## 12. Canonical identity boundary (B2.2-C)

**DESIGN DECISION, accepted by the supervising technical lead after the
read-only B2.2-I0 compatibility preflight.** The B2.2 registry is subordinate
to the shared canonical identity architecture. It is not a second identity
issuer.

**Responsibility split.**

| track | owns                                                                                                                   |
| ----- | ---------------------------------------------------------------------------------------------------------------------- |
| B     | discovery evidence and **provisional** discovery-subject identifiers                                                   |
| C     | canonical Candidate (`cand:`) and Channel (`chn:`) identities, their reviewed relationships, equivalence and lifecycle |
| D     | commercial Opportunities (`opp:`) and outreach                                                                         |

**What a B subject id means.** `discovery_subjects.id` is a stable, B-local
v4 UUID.

1. It identifies a **provisional discovery evidence subject**: the thing a
   set of source-backed claims is about.
2. It is **not** proof of a unique real-world legal actor.
3. It is **not** a canonical Candidate identifier and never takes the `cand:`
   form. B issues no `cand:`, `chn:` or `opp:` identifier.
4. Two B subjects may later correspond to **one** canonical Candidate.
5. One B subject may later need to be **split** into several distinct actors.
6. Cases 4 and 5 need **explicit canonical-layer decisions** owned by Track
   C. B never merges, splits or re-points a subject, never asserts
   `SAME_ACTOR`, and never promotes an unreviewed equivalence. A typed
   identifier shared by two subjects is a `SHARED_EXTERNAL_IDENTIFIER` **review
   signal**, nothing more.
7. B **preserves its original evidence** after any external identity
   resolution. A later canonical decision is recorded where it is made; no B
   row is rewritten, deleted or re-attributed because of it. (The tables are
   append-only regardless, ADR 0019.)
8. A channel observation — a `PUBLIC_WEBSITE` claim, a page-evidence or
   website-claim source — **does not establish ownership or operating
   authority**. A public website claim is not a verified channel.
9. **Legal independence stays UNKNOWN** unless evidence supports it. A kind
   such as `INDEPENDENT_STUDENT_ASSOCIATION` is a claim, not a legal finding.
10. **Neither a B review nor a C identity linkage grants research,
    qualification, publication or outreach permission.** Research authority
    is `granted: false` by type (§5), and a canonical linkage is not an input
    to it.

**B's vocabulary is not I0's.** B's relationship predicates (`PART_OF`,
`AFFILIATED_WITH`, …) are provenance-backed **source claims**, not
established I0 relationships, even where the names coincide. B's eight entity
kinds are not mapped onto I0's Candidate kinds, and B's identifier schemes
(`EU_PIC`, `FR_RNA`, `NL_KVK`) are not I0 external systems. No mapping is
implemented or persisted.

**A proposed compatibility point, not an adopted interface.** As read during
the B2.2-I0 preflight (Operator repository, I0 at `129a2e7`, 2026-10-16; not
re-verified here), Track C's provisional I0 register reserves an external
system `ENGINE_DISCOVERY_SUBJECT` that admits only the `CONTEXT` link role,
never `SAME_ACTOR`. A B subject UUID appears compatible with it. That is recorded
here as a **proposed** compatibility point only: I0's semantics are not
ratified, B2.2-C does not implement, call or persist that mapping, and **no
canonical-reference column** exists in any B table. Adopting it needs the
cross-track decisions listed in the OWNER record.

**How it is enforced (B2.2-C).**

- `phase2bDiscoverySubjectRegistry.firewall.test.ts`, scoped to
  `src/orgunits/subjectRegistry/` and the CLI command (not a repository-wide
  string ban, so documentation, tests and a future authorised adapter may
  still name the prefixes as external data): record ids come only from
  `node:crypto` `randomUUID` in `writer.ts` and are never prefixed or
  reshaped; no `cand:` / `chn:` / `opp:` literal and no canonical-reference
  name; the five modules' **live export surface** has no merge, split, link,
  equivalence, promotion, canonical or handoff operation and exactly four
  mutating functions (three appends, and `recordReview`, which is unreachable
  without the absent reviewer capability); no vocabulary member is
  equivalence-shaped; no subcommand or option could carry one; 0014 adds no
  column, table, type or `nwf_identity*` name.
- `discoverySubjectRegistryB22.test.ts`: canonical-shaped ids are refused
  before any connection on the read paths and before any registry read on
  the write paths; equivalence predicates (`SAME_ACTOR`, `SAME_AS`, …) and
  `merge` / `split` / `link` / `handoff` subcommands are refused before any
  connection; two subjects sharing an identifier keep their own ids, carry
  only a review signal, and — even with a CONFIRMED subject review — expose
  no canonical, channel, ownership or equivalence field and no research
  authority.
- `discoverySubjectRegistry.test.ts` (real PostgreSQL): every id column of the
  four tables is `uuid`, so a `cand:` value is unstorable (SQLSTATE 22P02,
  even for the writer capability with raw SQL); 0013's predicate CHECK
  refuses `SAME_ACTOR`-shaped predicates (23514); the CLI refuses
  canonical-shaped ids, executed or not, and writes nothing; two subjects
  sharing an `EU_PIC` remain two rows with no review written.

## 13. Next milestone (recommendation only)

The smallest step that unlocks an independently reviewed registry is a
**reviewer trust primitive**: an OWNER-approved way to identify a reviewer that
the caller cannot supply, plus a migration granting review INSERT to a
capability bound to it, and one production factory for
`TrustedReviewerContext`. Subject research stays disabled until a separate
admission policy decides the ADR 0019 §7 questions.
