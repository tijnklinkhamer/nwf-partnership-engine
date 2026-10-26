# ADR 0025 — Global subject research admission (Global R8)

- **Status:** Proposed. LOCAL, SYNTHETIC-ONLY implementation authorised by the
  OWNER brief "NWF Partnership Engine — R8: Global Research Execution"
  (2026-10-20). Not ratified, not pushed, not applied to any persistent
  database. This ADR ratifies nothing earlier: ADRs 0019, 0020, 0023 and 0024
  keep their own status.
- **Date:** 2026-10-20
- **Phase:** Global R8, after the R7 decision record (`R7_OWNER_DECISION_READY`)
  and the R6 planner (`9d6d1f1`, pinned by `fea2383`).
- **Extends:** ADR 0004 (owner-path root authority), ADR 0005/0006 (the gateway
  and its URL-scoped capabilities), ADR 0019 §7 (the protected structural
  parent), ADR 0023 §11/§11a (a review is not clearance; protection is
  monotone). **Supersedes nothing.**
- **OWNER scope record:** `docs/evaluation/GLOBAL_R8_OWNER_BRIEF_RECORD_V1.json`
- **Migration:** `migrations/0017_subject_research_admission.sql`.

Claims are tagged **FACT**, **MEASUREMENT**, **DESIGN DECISION**, **UNKNOWN**.

## 1. Problem

**FACT.** Every research root was an ECHE source row: a `website_claims` row
or an operator promotion, and `orgunit_fetch_observations.eche_row_key` was
`NOT NULL` (migration 0007). A Discovery Subject (migration 0013) — a Japanese
student association, a Brazilian language organisation — has no ECHE row, so
it could be registered and reviewed but never researched. R6 built a pure,
non-executable planner and named four blockers; R7 named the OWNER decisions.

## 2. The decisions (OWNER brief R8 §2)

| id  | decision                                                                                                                                                                                                                 | where                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| Q1  | `RESEARCH_BLOCKING`, `UNRESOLVED` (incl. an unconfirmed edge to a protected row, a cycle, an unknown parent) under ANY of the three B2.3 readings refuses                                                                | `policy.ts`                                |
| Q2  | `HOSTED_BY` and every non-`PART_OF` predicate never inherit protection; the root's registrable domain must differ from every website-claim and promoted-target domain, checked at admission AND before the first request | `policy.ts`, `isolation.ts`, `runGuard.ts` |
| Q3  | No relaxation of ADR 0023 §11a: any `structuralUncertainty` member and any re-evaluation trigger refuses                                                                                                                 | `policy.ts`, §6                            |
| D4  | an append-only OWNER-path admission, a separate append-only revocation, validity ≤ 30 days by the database clock                                                                                                         | 0017 §A/§B                                 |
| D5  | identity CONFIRMED under the pinned trust set; `TEST_ONLY` authority only inside vitest                                                                                                                                  | `policy.ts`, `runGuard.ts`                 |
| D6  | the root is `subject_admission:<uuid>` under `subject-research-admission-policy-v1`                                                                                                                                      | 0017 §D, `authority.ts`                    |
| D7  | a STALE admission (any discovery-subject row appended since evaluation) refuses                                                                                                                                          | 0017 §C, `authority.ts`                    |
| D8  | the classifier is unchanged and cannot take subject-rooted evidence                                                                                                                                                      | 0009 CHECKs, §8                            |

**DESIGN DECISION: protected keys are fail-closed.** The B2.1 evaluator runs
with every key the B3.0 registry lists as a member PLUS every `PART_OF` ECHE
target the evaluation frame does not hold. Absence from the frame proves
neither protection nor permission (B3.0-R1), so an unknown parent is treated as
a protected one.

## 3. The execution path — the existing engine, one more root kind

```
OWNER path  recordSubjectResearchAdmission (subjectAdmission/record.ts)
              BEGIN REPEATABLE READ; LOCK the 5 subject tables IN SHARE MODE
              loadSubjectGraph (B2.2, unchanged) + attestations
              loadIsolationDomains + registry fingerprint + B3.0 registry
              evaluateSubjectResearchAdmission (policy.ts, PURE)
              INSERT subject_research_admissions | ROLLBACK on refusal
research    runSubjectDiscovery (orchestrator/orchestrate.ts)
              resolveRoot(SUBJECT_ADMISSION)  -- web/authority.ts, every attempt
              enforceSubjectRootResearchEligibility -- before the run row
              startSubjectRun (root_scope = subject_admission:<uuid>)
              runRootAcquisition (unchanged engine; subject guard in place of B3.0)
                robots -> sitemap -> frontier -> gateway -> extraction/redaction
                -> page evidence -> candidates
```

- **One gateway, one socket.** `robots.ts` remains the only production caller
  of `executeWebAttempt`; the gateway changed by one line (it records the new
  root column). Budgets, pacing, circuit breaker, redaction, fetch policy v7
  and the signal ruleset are unchanged.
- **One admission per run, by the database.** A run's `root_scope` is `ECHE`
  (default, every pre-0017 run and every `startRun`) or one admission's root
  key; every fetch row's generated `run_root_scope` is pinned to it by a
  composite foreign key. The ECHE branch of `runRootAcquisition` issues
  exactly the statements it did before.
- **No batch.** `runSubjectDiscovery` takes one admission id. There is no CLI:
  a subject research command is a later, separately authorised step.

## 4. Least privilege (FACT, catalogue-verified)

`nwf_research` gains `SELECT` on `subject_research_admissions`,
`subject_research_admission_revocations` and the view
`subject_research_registry_fingerprint` — and **nothing on any
discovery-subject table** (ADR 0019 §9 stays true; the R6 integration test's
first blocker still holds). The root URL is a foreign-key-pinned copy of the
claim's (`subject_research_admissions_claim_fk` over
`(id, subject_id, claim_kind, claim_basis, website_url)`), so it cannot
disagree with the claim. The view is an ordinary (owner-privilege) view that
returns five row counts as one string. No runtime role holds `INSERT` on the
admission or revocation table; only the owner path can admit or revoke.

## 5. Migration 0017 safety (MEASUREMENT on disposable PostgreSQL 16)

- **Why a rebuild.** PostgreSQL 16 has no `ALTER COLUMN … SET EXPRESSION`
  (17+). `DROP EXPRESSION` would make `root_key` writable, which 0007 forbids
  and `orgunitSchema.test.ts` pins (SQLSTATE `428C9`). So 0017 drops the
  page-evidence root FK and both `root_key` indexes, drops the column, re-adds
  it `GENERATED ALWAYS` with the original two branches first and unchanged,
  and rebuilds the indexes and the FK — whose re-validation would fail the
  whole migration if any page's fetch key had changed.
- **Preservation is proven per row**, not argued: the migration-safety
  integration test builds a fresh database at 0016, seeds claim- and
  promotion-rooted runs, pages, candidates and redirects, captures every
  `(id, root_key)` and a content digest of every table (fetch rows over their
  pre-0017 column list), applies 0017, and requires byte-identical results.
- **Rollback.** The runner applies a migration in one transaction. The test
  applies 0017 and forces a failure inside the same transaction, then proves
  the schema and every digest are exactly the pre-0017 ones, and that 0017
  still applies afterwards.
- **Locking (MEASUREMENT, `pg_locks` inside the 0017 transaction).**
  `AccessExclusiveLock` on `orgunit_fetch_observations` (rewrite),
  `orgunit_page_evidence` (FK rebuild) and `orgunit_research_runs` (new
  column), and `ShareLock` on `discovery_subject_identity_claims` (the
  admission-target index), all held until COMMIT: readers and writers of
  those tables wait. Duration scales with the fetch table and was not
  measured on `nwf_pe` (the frozen A2 corpus) — **UNKNOWN**; applying 0017
  there needs its own OWNER decision with a before/after digest proof.
- **Column position.** `root_key` moves to the end of the column list. Every
  reader found (the A3 evidence harness, the classifier, the orchestrator)
  names its columns explicitly; none uses `SELECT *` on this table.

## 6. Q3 — the governance amendment that would be needed (not implemented)

**FACT.** `kindEvidenceOf` includes the immutable `registeredKind`, and ADR
0023 §11a takes the union with the unreviewed baseline. So a subject
REGISTERED `UNCERTAIN` (or with a parent-implying kind) and no `PART_OF` is
`STRUCTURAL_PARENT_UNKNOWN` forever, and any review of a `PART_OF` claim adds
`REQUIRES_PROTECTION_REEVALUATION` permanently. Under policy v1 such subjects
can never be admitted, and appending a new subject would duplicate identity.

**DESIGN DECISION.** Nothing in R8 clears either. Enabling clearance would need,
in order: (1) an OWNER-ratified amendment to ADR 0023 §11a defining a
_recorded protection re-evaluation_ — an OWNER-attested decision, bound to the
subject state digest and the protected-registry digest, that discharges named
triggers without removing any baseline fact; (2) a new admission policy
version (`subject-research-admission-policy-v2`) that reads it; (3) its own
migration if it is stored. Until then the refusal is the policy.

## 7. Staleness — the prototype check and its limit (D7)

**DESIGN DECISION.** An admission binds `registry_fingerprint`, the row counts
of the five discovery-subject tables read under SHARE locks in the evaluating
transaction. The tables are append-only (0013/0015 triggers refuse UPDATE and
DELETE for every role), so equal counts mean no row was appended, which means
the graph the policy judged — bound separately as `subject_state_digest` — is
unchanged. `resolveRoot` compares it on every attempt.

**Limitation.** It is global: any registry write anywhere invalidates every
admission. That is correct (fail closed) and cheap at today's size, but it
does not scale to a busy registry; a later policy version should bind the
fingerprint of the subject's own structural closure instead. An owner-path
`TRUNCATE` followed by re-insertion of equal counts would defeat it; the owner
path is trusted, and `TRUNCATE` is held by no runtime role.

## 8. D8 — the classifier stays unavailable

**FACT.** Migration 0009 is untouched: `orgunit_classifier_calls.eche_row_key`
is `NOT NULL` and `orgunit_classifier_calls_root_key_chk` admits only
`claim:`/`promotion:`. The classifier's `assertRunBelongsToOrganisation` refuses
a run whose evidence names no ECHE key. No classifier file, prompt, model pin
or contract changed.

## 9. Security implications

- Reach widens to non-ECHE domains worldwide — through the same single
  gateway, robots, budgets and pre-DNS gates; no new socket, no proxy, no
  redirect following.
- The owner path proves database ownership, not a person (ADR 0020 §6). An
  owner could insert an admission by hand; the database cannot verify a
  signature. Every admission is digest-bound, ≤ 30 days and revocable, and a
  `TEST_ONLY` row is refused outside vitest. Re-verifying the identity
  attestation at research time is deferred.
- A redirect observed under a subject root cannot be promoted into a root
  (`ROOT_PROMOTION_NOT_ECHE_ROOTED`, and the fetch-row CHECK).
- No contact, country, legal form, score or permission is stored or derived.

## 10. Permission tiers

| tier                          | state after R8                                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Synthetic research            | **implemented and tested** (vitest, disposable PostgreSQL, scripted transport, TEST_ONLY keys)                    |
| Real public-web research      | **not possible**: the operational trust set holds no OWNER key, 0017 is applied nowhere persistent, no CLI exists |
| OWNER-reviewed commercial use | **not authorised**: no Track C/D, I0, classifier or outreach use of subject evidence                              |

## 11. Remaining prerequisites for real international research

1. OWNER ratification of this ADR and of migration 0017.
2. An OWNER review-key custody decision and a reviewed source change adding
   one ACTIVE key to `OPERATIONAL_OWNER_REVIEW_KEYS` (ADR 0023 §15), then
   signed CONFIRMED reviews of each real subject.
3. An OWNER decision to apply 0017 to `nwf_pe`, with a measured lock window
   and a before/after per-row `root_key` and corpus-digest proof.
4. A separately authorised subject research CLI (one admission per call, a
   network-free dry run, `--execute`), and an OWNER-path admission command.
5. A per-run OWNER execution approval for the first live subject.
6. Optionally first: the §6 governance amendment, if UNCERTAIN-registered
   subjects must ever be researchable.

## 12. Lane L1 amendment — subject research made executable (2026-10-26)

**Authority.** OWNER directive to engineering lane L1 (2026-10-26), recorded
in `docs/evaluation/REL_L1_SUBJECT_RESEARCH_OWNER_DIRECTIVE_RECORD_V1.json`.
Local, synthetic-only; this section changes no decision above and the ADR stays
**Proposed**. Migration: `migrations/0018_subject_research_roots.sql`.

**What closes §11 item 4 in code.**

| piece                              | where                                                                                         |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| sealed, database-derived admission | `src/orgunits/subjectRun/admission.ts` (`VerifiedSubjectAdmission`, `verifySubjectAdmission`) |
| execution through the engine       | `src/orgunits/subjectRun/execute.ts` (`runSubjectResearch` -> `runSubjectDiscovery`)          |
| dry-run checks = execution checks  | `planSubjectDiscovery` in `orchestrator/orchestrate.ts`                                       |
| subject -> runs index              | `listSubjectRuns` (each run then exportable by the R9 projection)                             |
| CLI                                | `orgunits subjects research --subject-id <uuid> [--execute] [--json]`                         |
| candidate run scope                | migration 0018                                                                                |

- **DESIGN DECISION: the capability is a carrier, not the authority.**
  `VerifiedSubjectAdmission` has a `#sealed` brand and a constructor that
  refuses any call without the module's unexported mint symbol. Its one
  production derivation reads the subject's admissions as the research role,
  requires exactly ONE live admission (unrevoked, unexpired by the database
  clock) and passes it through `planSubjectDiscovery` — the resolver and run
  guard of §3. A vitest-only seam exists so tests can prove that a capability
  naming an admission the database lacks authorises nothing:
  `runSubjectDiscovery` re-resolves the admission before any run row, and the
  gateway re-resolves it on every attempt.
- **DESIGN DECISION: no grant on the subject tables, and no `subject:` root
  kind.** The research role reads its root URL from the admission's
  foreign-key-pinned copy of the claim (§4); the minimal grant is the empty
  one, and ADR 0019 §9 stays true. A root keyed on the subject or its claim
  rather than on an admission would be a root without an OWNER approval, so
  0017's `subject_admission:` stays the only subject root.
- **FACT: the R6 blockers.** All four are answered by
  `BLOCKER_RESOLUTIONS` in `execute.ts` (three LIFTED, one NOT_NEEDED). The
  R6 planner (`plan.ts`) is unchanged and stays the record of its own build;
  its `subject_claim:` root kind was never adopted.
- **FACT: the candidate gap 0018 closes.** 0017 pinned every fetch row to its
  run's scope, and page evidence hangs off one fetch row, but
  `orgunit_page_candidates` carries its own `run_id`: a subject-rooted
  candidate could have been filed under an ECHE run. 0018 adds a generated
  `run_root_scope` and the composite foreign key 0017 §E used, plus a partial
  index for finding a subject's runs. It grants nothing.
- **Firewalls.** No existing firewall was edited. The new code avoids every
  closed phase's working-tree pin by construction (it is not in
  `subjectAdmission/`, `subjectResearch/` or `subjectResearchEvidence/`, and
  the CLI reaches execution only through `subjectRun/`); its own scope is
  pinned by `src/test/firewall/relL1SubjectResearch.firewall.test.ts`.

**Still not possible.** Real research: the operational trust set holds no
OWNER key, so no real subject can be confirmed or admitted, and a `TEST_ONLY`
admission is refused outside vitest. §11 items 1–3, 5 and 6 remain open.
