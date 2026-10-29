# ADR 0019 — First-class discovery-subject identity (B2.1)

- **Status:** Proposed. LOCAL, OFFLINE implementation authorised by the OWNER
  (Track B, B2.1), evaluated for local acceptance only. Not committed, not
  deployed, and the migration has not been applied to any persistent database.
- **Date:** 2026-10-15
- **Phase:** Track B — Discovery & Research Quality, slice B2.1
- **Extends:** ADR 0002 (claims, not conclusions), ADR 0004 (append-only
  research evidence, owner-path authority). **Supersedes nothing.**
- **Owner decision record:**
  `docs/evaluation/TRACK_B_B2_1_MICRO_ORGANISATION_IDENTITY_OWNER_DECISION_V1.json`
- **Numbering:** 0017 belongs to the separate
  `docs/adr-0017-cloud-operator-read-model-publication` lineage and 0018 to
  B1.1. 0019 was checked against every local and remote-tracking branch
  before this file was written. Migration 0013 was checked the same way.

Claims are tagged as in earlier Phase 2B ADRs: **FACT**, **MEASUREMENT**,
**DESIGN DECISION**, **UNKNOWN**.

---

## 1. Why micro-organisations need their own identity

**FACT.** Every organisation the Engine can name today is an ECHE source row.
`organisations` describes itself as "a provisional organisation record derived
from an ECHE source row", and it is anchored on
`eche_row_key = normalised Erasmus code | PIC`. Its `org_type` CHECK admits
exactly `higher_education_institution`.

**FACT.** The organisations NWF most wants to reach are not ECHE rows. They
include faculty clubs, ESN sections, buddy programmes, language communities,
language centres and student associations. These usually have no Erasmus code
and no PIC.

**DESIGN DECISION.** Inserting them into `organisations` would require
inventing exactly the identifiers that rule 2 forbids. It would also make every
such group look like an institution or the child of one. That is false for an
independent association and unknown for most of the rest. The Engine would end
up privileging large institutions merely because they are easier to identify.

So a **discovery subject** is a separate identity anchor:

- it holds an opaque UUID;
- it has no mandatory parent;
- it carries no research eligibility and no qualification.

It never extends, alters or duplicates `organisations`, and nothing in B2.1
writes to that table.

## 2. The model: four append-only tables (migration 0013)

| table                                   | one row means                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `discovery_subjects`                    | a trusted path registered this opaque identity, with a working kind label (`UNCERTAIN` allowed)              |
| `discovery_subject_identity_claims`     | this source, observed at this time, supports this name / alternate / native name / kind / website / typed id |
| `discovery_subject_relationship_claims` | this source supports this directed relationship to another subject or to an ECHE source row                  |
| `discovery_subject_reviews`             | this trusted path reviewed this subject or this claim and recorded this outcome                              |

**DESIGN DECISION: why four tables, and not more or fewer.**

- **One identity-claim table, not one table per claim category.** Names,
  kinds, websites and identifiers share one provenance shape. A kind-specific
  payload CHECK guarantees that each row carries exactly the columns its
  `claim_kind` names.
- **No separate identity-key table.** Typed external identifiers are claims,
  `EXTERNAL_IDENTIFIER`, with mandatory provenance, like everything else.
- **Separate relationship claims, because a relationship has a target.**
  The target is a subject or an ECHE row, enforced by real foreign keys.
- **No "accepted effective relationship" table.** The reviewed state of a
  relationship is the head of its review chain, derived at read time. A
  second table would be a stored verdict, and rule 12 refuses stored verdicts.
- **Reviews are their own table, as root promotions are (ADR 0004).** A
  decision is a different fact from a claim. It has a different actor, a
  different time and a different authority.

**FACT — deliberately absent.** There is no `status`, `verified`, `confirmed`,
`eligible`, `preferred`, score, priority, outreach, `parent_id` or `jsonb`
column anywhere. Every column is `uuid`, `text` or `timestamptz`, and the
integration test asserts that from the catalogue.

## 3. Claim, reviewed identity and fact are three different things

- **A claim** is one source's assertion. Its `claim_basis` says whether the
  source states it (`SOURCE_STATED`) or a reader concluded it (`INFERRED`).
  Neither is a review.
- **A review** is a trusted path's decision about one subject or one claim:
  `CONFIRMED`, `DISPUTED`, `REJECTED` or `WITHDRAWN`. Its `actor_key` is the
  decision actor. That is distinct from the claim's source, and also from
  `recorded_by_actor_key`, which says who typed the claim in.
- **A fact** is never established by this layer. The validator returns
  `factualVerification: 'NOT_ESTABLISHED_BY_THIS_LAYER'` on every subject. A
  structurally valid record can still describe an organisation that does not
  exist.

**DESIGN DECISION: review chains are linear per reviewed thing.**

- The first review of a target has no `supersedes_review_id`. Each later
  review supersedes the previous head of the **same** target.
- Two partial unique indexes allow at most one root per target and at most one
  successor per review.
- A composite foreign key `(supersedes_review_id, review_target_key)` makes
  superseding a different target's review impossible.
- `WITHDRAWN` must supersede something, and a `WITHDRAWN` head reads as
  `UNREVIEWED`.
- The pure validator additionally refuses chains that go backwards in time and
  chains containing orphans or cycles. It reports such a chain as
  `CHAIN_INVALID`, never as a verdict.

**DESIGN DECISION: confirming a subject requires a name claim.** A `CONFIRMED`
subject with no live name-family claim is `INVALID`. A human decision is not
evidence on its own.

**Representing pages that are not organisations.** A webpage is evidence
(`orgunit_page_evidence`), never a subject. Nothing promotes page evidence to a
subject automatically, and no runtime role can insert a subject. A subject
registered from a page that turns out to describe a programme is `REJECTED` by
review, and the rejection itself is history.

## 4. Append-only enforcement

**FACT.** No runtime role holds any write grant on the four tables. Grants
cannot constrain the owner, and the owner is the only writer. So a
`BEFORE UPDATE OR DELETE … FOR EACH ROW` trigger,
`discovery_identity_refuse_mutation`, refuses both operations for every role,
the owner included, with SQLSTATE `55000`. Migration 0011's refusing trigger is
the precedent.

**DESIGN DECISION: TRUNCATE is gated by privilege only.** No runtime role holds
TRUNCATE. The owner-only integration-test cleanup (`truncateAll`) must keep
working against `nwf_pe_test`, and the new tables reference `organisations`,
`website_claims` and `orgunit_page_evidence`, so that cleanup cascades into
them. A TRUNCATE trigger would break every integration test. The new tables are
therefore listed explicitly in `truncateAll`'s inventory.

## 5. Provenance and identity-key rules

1. **Provenance is mandatory and external.** Every claim cites exactly one of
   three sources:
   - an `orgunit_page_evidence` row (real foreign key);
   - a `website_claims` row (real foreign key);
   - an admissible public URL, with an optional SHA-256 `source_version_ref`.

   An owner assertion with no source is **not** a source type.

2. **The same source cannot say the same thing twice.** The database generates
   `provenance_key` and `value_key`, and a unique index over
   `(subject, kind, value, provenance)` refuses a repeat. A second source
   saying the same thing is corroboration, and it is kept.
3. **Names are never identity keys.**
   - There is no unique index on any name, website or identifier across
     subjects.
   - There is no case folding, similarity measure or merge anywhere.
   - Identical names on two campuses produce no finding at all.
4. **Typed identifiers are shape-checked only.** The schemes are `EU_PIC`
   (9 digits), `FR_RNA` (`W` + 9) and `NL_KVK` (8 digits). A well-formed value
   is not a valid registration. When the same identifier is claimed for two
   subjects, the validator reports a `SHARED_EXTERNAL_IDENTIFIER` review signal
   and never merges them. The `(scheme, value)` index is deliberately not
   unique.
5. **No merge operation exists**, reversible or not. Deduplication remains a
   reviewable decision for a later phase.

## 6. Relationships

- **Many per subject, with no parent field.** The predicates are `PART_OF`,
  `AFFILIATED_WITH`, `LOCAL_CHAPTER_OF`, `OPERATES_AT`, `HOSTED_BY` and
  `SERVES_AUDIENCE_AT`. **Only `PART_OF` is structural.**
- **Targets are another subject or an ECHE source row.** An ECHE target uses a
  real foreign key to `organisations(eche_row_key)`, so a relationship to an
  institution the database does not hold cannot be recorded, and nothing is
  ever fabricated to satisfy the key.
- **Refused by the database:**
  - a self-link;
  - a missing, unknown or doubled target;
  - an unknown predicate;
  - a duplicate assertion from the same source;
  - a `LOCAL_CHAPTER_OF` whose target is an ECHE row (a chapter belongs to a
    network).
- **Cycles.** The database does not refuse a claimed `PART_OF` cycle, because
  two sources may contradict each other. The validator reports it as
  `STRUCTURAL_CYCLE_CLAIMED` (CONFLICT). A cycle made only of `CONFIRMED`
  edges is `INVALID`. **Deferred:** a database-level refusal of a confirmed
  cycle needs a traversing trigger. It belongs with the B2.2 writer, which must
  run the validator before it inserts a review.
- **Conflicting parents.** Two live `PART_OF` targets, where neither is an
  ancestor of the other, produce `STRUCTURAL_PARENT_CONFLICT` (CONFLICT, not
  INVALID). A joint unit of two institutions is a real possibility, so this is
  a signal for review, not a refusal.
- **Unresolved targets.** A relationship whose target subject is not a
  `CONFIRMED` identity is `UNRESOLVED`.
- **Kind tension.** A self-standing kind (`INDEPENDENT_*`) that also has a
  `PART_OF` is a review signal. The claims disagree about independence, and no
  legal form is inferred either way.

## 7. The protected structural-parent boundary

`evaluateStructuralParentConstraint(input, subjectId, protectedEcheRowKeys)`
is pure. It follows **only** `PART_OF`, and only edges that are not
`REJECTED`, transitively. Its results, in precedence order:

1. **`RESEARCH_BLOCKING` / `PROTECTED_STRUCTURAL_PARENT`.** A chain made only of
   `CONFIRMED` edges reaches a protected row.
2. **`UNRESOLVED`** in any of these cases:
   - a protected row is reachable only through an unreviewed or `DISPUTED`
     edge (`PROTECTED_STRUCTURAL_PARENT_UNCONFIRMED`);
   - a cycle is reachable (`STRUCTURAL_CYCLE`);
   - a subject on the chain is of a parent-implying or `UNCERTAIN` kind and
     has no recorded parent (`STRUCTURAL_PARENT_UNKNOWN`);
   - the subject is unknown, or the input or the protected keys are malformed.
3. **`NO_KNOWN_STRUCTURAL_PARENT_BLOCK`** otherwise.

**No result is research authority.** `grantsResearchAuthority` is the literal
type `false` on every result, and B2.1 exposes no eligible status anywhere.

**Not cohort membership.** A blocked child is blocked because of its _parent_.

- The reason vocabulary is disjoint from B3.0's (`COHORT_INELIGIBLE`,
  `RESEARCH_IDENTITY_AUTHORITY_ABSENT`).
- The result names neither the protected key nor any cohort.
- The module never loads the B3.0 registry; the caller supplies the protected
  keys.
- Tests use the synthetic key `T B21 PROT01|300000029` only.

**Non-structural links never block.** Being `AFFILIATED_WITH`, `OPERATES_AT`,
`HOSTED_BY`, `SERVES_AUDIENCE_AT` or a `LOCAL_CHAPTER_OF` something connected
to a protected institution does not make a subject part of it.

**UNKNOWN — OWNER policy questions, left closed rather than guessed.**
(a) Should B2.2 treat `UNRESOLVED` as a refusal? This ADR recommends yes,
fail closed. (b) Should `HOSTED_BY` a protected institution ever inherit
protection? The brief says no for affiliation and operation, and this slice
extends that reading to every non-`PART_OF` predicate. (c) Is a subject of
`UNCERTAIN` kind with no parent unresolved? It is treated as unresolved. Until
the OWNER decides these, subject research stays disabled, which it is: no
research code can read these tables.

## 8. Privacy and contact restrictions

- **No contact capability.** There is no contact column, person column or free
  JSON. The existing phase 1b, 1d and 2b firewalls bind the new migration and
  module unchanged.
- **Mailbox- and telephone-shaped text is refused at the database.** Every free
  text column passes `discovery_identity_text_admissible`: no control
  characters, no `@`, and no run of nine or more digits. `2021-2027` passes.
- **Every stored URL is checked twice.** It must satisfy
  `discovery_identity_url_admissible` in SQL and `isAdmissiblePublicUrl` in
  TypeScript, which give the same answer on a shared sample list. The rules:
  - http(s) only, with a lower-case DNS host;
  - no userinfo, port, query or fragment;
  - no `@` and no `%40`;
  - not a social-platform or messaging host, because such a profile may be a
    personal account. Admitting one is a separate OWNER decision.
- **Nothing is fetched.** Source attribution is never outreach permission.

## 9. Database roles

| role                                           | on the four new tables                                             |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `nwf_research`, `nwf_ingest`, `nwf_classifier` | **nothing**, not even SELECT                                       |
| `nwf_readonly`                                 | SELECT only (the audit convention of 0002–0009)                    |
| owner                                          | INSERT, through the trusted path; UPDATE/DELETE refused by trigger |

**FACT — verified on PostgreSQL 16 from `information_schema.role_table_grants`.**
No runtime role holds any write privilege. Research cannot read a subject, so
no research path can treat one as a root or as authority.

## 10. Test-support files changed, and historical migration-test compatibility (B2.1-R1)

Two existing test-support files were changed, each by the pattern its own
comment prescribes:

- `src/test/integration/orgunitSchema.test.ts`: the pinned migration list was
  extended with `0013`, as it was for 0010, 0011 and 0012.
- `src/test/integration/helpers.ts`: the `truncateAll` inventory gained the
  four tables.

### 10.1 Why 0013 conflicted with older tests (FACT, MEASUREMENT)

The first B2.1 pass ended `B2_1_BLOCKED`. Three existing assertions proved a
HISTORICAL claim against the CURRENT working tree or git index, so any new
migration broke them:

| test                                     | assertion                                                                   | read                   | failed                    |
| ---------------------------------------- | --------------------------------------------------------------------------- | ---------------------- | ------------------------- |
| `orgunitCorpus2DA1Frame.test.ts`         | stamp `DATABASE_SCHEMA_VERSION_RANGE` equals `first..last` of `migrations/` | working tree           | as soon as `0013` existed |
| `orgunitTransportRetryPolicy.test.ts`    | "adds no migration: the range is still 0001..0012"                          | `git ls-files` (index) | once `0013` is indexed    |
| `classifierOperatorReadModelsV1.test.ts` | "the migration set is unchanged (0001-0012)"                                | `git ls-files` (index) | once `0013` is indexed    |

All three failures were reproduced at the start of B2.1-R1: one in the
untracked state, and all three under a scratch `GIT_INDEX_FILE` holding every
B2.1 file. The frame stamp could not simply be bumped. The first pass did bump
it, and the five A3 V4 isolation tests (R33–R37) then failed, because they
diff `src/test/harness/phase2b2d/corpus/` from `R32_TERMINAL` (`747b64f`) to
the WORKING TREE. Taken together, "the stamp tracks `migrations/`" and "the
corpus namespace never changes" amount to a permanent migration freeze. No
authority approved one.

### 10.2 The original boundaries (FACT, from git and governance records)

- **A1 frame stamp.**
  - A1 (`13acb76`) set the stamp to `0001..0011`. The ADR 0014 repair
    (`cbbedd8`, migration 0012) moved it to `0001..0012` and acknowledged it
    in `PHASE_2B_2D_A2_TRANSPORT_FAILURE_OBSERVABILITY_IMPLEMENTATION_V1`.
  - `frameContract.ts` is byte-identical at `cbbedd8`, at `747b64f` and at
    HEAD. No migration landed between `cbbedd8` and `747b64f`, so the stamp
    was exact when R33–R37 froze the namespace. From then on it is frozen
    contract material.
  - Its only use is the provenance stamp `materialiseFrame` writes into a
    frame. FRAME_V2_GEN1 keeps `0001..0011`, under owner adjudication
    `ACCEPT_FRAME_V2_GEN1_HISTORICAL_SCHEMA_PROVENANCE_V1`.
- **ADR 0015 transport retry.**
  - Its implementation record bounds the repair as `startingHead` `3ecbd89`,
    then commits A–D: `ba6ae90`, `d9c32af`, `f9e988a`, and `e564259` (the
    commit that adds the record).
  - The record states `"migrationCreated": false` and
    `"databaseSchemaRangeUnchanged": "0001..0012"`. The claim is about that
    repair.
  - The same file already reads its other historical facts at
    `ADR_0015_TERMINAL_COMMIT`. Commit `4047709` moved them there, and its
    message reads "Historical ADR 0015 pins now read their own terminal
    commit". The migration assertion was missed.
- **Classifier operator read models.**
  - The test header binds every changed-surface and migration assertion to
    `CLASSIFIER_OPERATOR_ENTRY_POINT_TERMINAL..CLASSIFIER_OPERATOR_READ_MODELS_TERMINAL`
    (`2b9d0d9..f4c747e`), "never over HEAD or the working tree".
  - `PHASE_2B_2D_CLASSIFIER_OPERATOR_CONTROL_PLANE_CONTRACT_V1` records that
    those migration assertions were moved onto that range and tree. The
    `git ls-files` line was an incomplete application of that recorded
    correction.

### 10.3 The correction (DESIGN DECISION, OWNER-authorised as B2.1-R1)

This follows the `AUTHORISE_HISTORICAL_PHASE_RANGE_SCOPING_CORRECTION_V1`
convention: a historical claim is evaluated over its own range, and its
protected paths and bounds are unchanged.

- **Transport retry.** Three checks over the repair's own range:
  - `git rev-list 3ecbd89..e564259` is exactly the four recorded commits, so an
    inserted commit fails;
  - `git diff --name-status 3ecbd89 e564259 -- migrations` is empty, so an
    `A`, `M`, `D` or `R` fails;
  - the closure tree still holds exactly 12 migrations, ending at `0012` and
    without `0013`.
- **Read models.** `git ls-files` is replaced by
  `git ls-tree -r --name-only R -- migrations`. That tree must equal the tree
  at `T` and end at `0012`. The `T..R` diff is now `--name-status`, which is
  stronger than `--name-only`.
- **A1 frame.** `frameContract.ts` is NOT edited, and the stamp stays
  `0001..0012`. The single "stamp equals the newest migration" assertion is
  replaced by two:
  1. **No git required.**
     - The stamp names a contiguous range with exactly one file per version,
       so a deletion or an in-range insertion fails.
     - Every migration ABOVE the range must be listed by exact filename in
       `MIGRATIONS_AFTER_THE_CORPUS_FREEZE`, which today holds only `0013`.
       The listed ADR must exist, and the listed owner record must name the
       migration path. A new migration therefore still fails here first and
       is acknowledged here, never by prefix or count.
  2. **Gated only on the two historical commits existing**, like every other
     lineage test.
     - `frameContract.ts` must be byte-identical to `cbbedd8`.
     - At `cbbedd8`, the stamp must equal that commit's own migration range:
       the original invariant, evaluated where it was true.
     - Migrations must be unchanged from `cbbedd8` to `747b64f`.
     - Every in-range migration must be byte-identical to `cbbedd8`.
- The B2.1 firewall authorises the three files as `M` and pins their exact
  removed lines. It also forbids `ls-files`, `.skip(`, `.todo(` and
  `process.env` in their added lines.

### 10.4 What remains protected (MEASUREMENT, B2.1-R1)

These checks ran in a disposable `git clone --shared` holding the same B2.1
change set. The clone was deleted afterwards.

**Rejected:**

- a modified `0007`, by A1 byte identity;
- a removed `0005`, by A1 contiguity and byte identity;
- an inserted `0009a_rogue.sql`, by A1 contiguity and byte identity;
- a renamed `0011`, by A1 byte identity;
- an unacknowledged `0014`, by the A1 manifest;
- the stamp bumped to `0001..0013`, by A1, and by R33–R37 as before;
- a comment appended to `frameContract.ts`, by A1 byte identity;
- an owner record that no longer names `0013`, by the A1 manifest;
- under `git replace`, a migration added to or modified in the ADR 0015
  closure tree, by the transport test;
- under `git replace`, a migration added to or modified in the read-model
  terminal tree, by the read-model test and two neighbouring changed-surface
  tests;
- under `git replace`, an extra commit inserted inside the ADR 0015 range, by
  the transport test.

**Accepted:** the governed `0013`, both untracked and indexed.

**Unchanged:** the five A3 R33–R37 tests, every historical record,
`frameContract.ts`, the corpus harness and migrations 0001–0012.

### 10.5 Independent validation of migration 0013 (FACT)

Migration 0013 is not checked by the historical tests. These check it:

- `migrations:check`, for numbering and naming;
- the migration runner's checksum guard;
- `orgunitSchema.test.ts`, whose applied list now includes `0013`;
- `discoveryIdentitySchema.test.ts`, which covers the four tables, their
  constraints, the append-only trigger for every role, the grants, and
  `nwf_research`'s total lack of access;
- `phase2bDiscoverySubjectIdentity.firewall.test.ts`, which checks for no
  DML, no altered pre-existing table, no contact, verdict, eligibility or
  jsonb column, no runtime write grant, and an exact changeset.

### 10.6 Residual uncertainty (UNKNOWN / stated, not resolved)

While `MIGRATIONS_AFTER_THE_CORPUS_FREEZE` is non-empty, the frozen stamp
`0001..0012` does not describe the current schema. A re-run of
`materialiseFrame` under this build would stamp `0001..0012` onto a database
that also carries `0013`.

`0013` adds only tables the frame reader never reads, so no eligibility input
moves. Even so, the stamp would be incomplete as a provenance statement.

This is governance-bounded rather than code-bounded:

- frame regeneration is unauthorised (`"frameRegenerationAuthorised": false`);
- `--write` targets the hash-pinned Gen-1 artifact;
- the adjudication's forward rule requires any future generation to carry
  "its own schema stamp".

Any future generation therefore has to supply a new contract rather than reuse
this one. Range-scoping R33–R37 and re-bumping the stamp (option (a) of the
first pass) remains available. It would need its own OWNER authority, because
it edits five frozen A3 tests and the corpus namespace.

## 11. Deferred

The following are not part of this slice and each needs separate authorisation:

- a writer and review workflow (B2.2);
- research authority for subjects;
- any acquisition, contact, publication or Track C/D code;
- database-level refusal of a confirmed cycle;
- consistency between `observed_at` and the cited page evidence;
- social-platform sources.

## 12. Track C evidence interface (proposal only — nothing implemented)

The cross-track contract convention is `nwf-pe.<name>.v1`, as in
`nwf-pe.classifier-operator.v1`. The proposed contract is
**`nwf-pe.discovery-candidate-evidence.v1`**: a read-only, versioned export of
one subject. It would contain:

- `subjectId`, `registeredKind`, `reviewedKind | null`, `claimedKinds`;
- `identityReview`, and the fixed
  `factualVerification: NOT_ESTABLISHED_BY_THIS_LAYER`;
- `claims[]`, each with its provenance (`sourceType`, source reference,
  `observedAt`, `claimBasis`) and its review state;
- `relationships[]`, each with predicate, target key, `assertionBasis` and
  review state;
- `conflicts[]` and `unresolved[]`, taken from the validator findings;
- `audienceEvidence[]` and `distributionEvidence[]`, **reserved and empty in
  v1**, because B2.1 measures neither;
- `freshness`: the newest `observedAt` per claim category;
- `unknownFields[]`: everything the producer could not establish.

The rule-set version would be `discovery-identity-rules-v1`.

The contract would carry no score, priority, opportunity, contact, outreach
permission or research authority. Track B does not calculate commercial value
and does not create Track D opportunities, and a verified public website
implies nothing about permission to contact. Track C and D code was not
edited.

## 13. Next phase

**B2.2** should be the smallest slice that connects an OWNER-reviewed subject
registry to controlled discovery. It would contain:

- an owner-path writer that runs `validateIdentityGraph` before every insert;
- a read-only planner that refuses any subject whose structural-parent
  constraint is not `NO_KNOWN_STRUCTURAL_PARENT_BLOCK`, or whose identity is
  not `CONFIRMED`, before any research row exists;
- protected keys supplied from the unchanged B3.0 registry through an adapter,
  and only once the OWNER has decided the §7 questions.

Research on subjects remains disabled until then.
