# ADR 0017 — Governed publication of Engine read models to the cloud Operator

- **Status:** Accepted — 2026-10-14
- **Decision date:** 2026-10-14 (OWNER; drafted 2026-10-12)
- **Phase:** Operator Hybrid Cloud D-3
- **Extends:** ADR 0006, ADR 0009. **Supersedes nothing.** ADR 0009 is not
  reinterpreted: this ADR is the new ADR that ADR 0009 §5 requires before
  classification leaves the single-operator Mac boundary.
- **Implementation:** Operator repository, branch
  `feat/hybrid-cloud-d3-engine-publication-v1`
  (`docs/architecture/HYBRID_CLOUD_D3_ENGINE_PUBLICATION_DESIGN_V1.md`,
  contract `src/api/engineView.ts`).

Claims below are tagged **FACT**, **DESIGN DECISION**, or **UNKNOWN**, as
prior ADRs tag theirs.

---

## 1. Context

**FACT.** Every Engine read model is served only on the owner's Mac today:
the Operator reads the Engine database as `nwf_readonly` and the Engine's
pinned git artifacts. The cloud Operator (Vercel + Supabase, EU) holds the
6,139-organisation registry, the owner's release acts and Outreach. It holds
no research, classification, corpus or governance data.

**FACT.** ADR 0009 §5 lists "a second human operator, any third-party
trigger/consumer, or any multi-tenant exposure of classification" as a
condition that requires a new ADR. A cloud copy read by a hosted
application is a new consumer. That condition is met, so this ADR exists.

**FACT.** The owner wants the Research, Classifier, Corpus and Governance
areas available when the Mac is offline, and only to the OWNER.

## 2. Decision

**DESIGN DECISION — the Engine may PUBLISH a snapshot of explicitly
allowlisted read-model fields to the cloud Operator. Publication is a
one-way, OWNER-signed copy for OWNER-only reading. It never moves Engine
execution into the cloud.**

1. **One way, OWNER act.** The owner runs the Operator's exporter on the Mac
   (`engine-view-admin`). It reads the Engine database in one
   `REPEATABLE READ READ ONLY` snapshot as `nwf_readonly`, and reads ADR files
   as git blobs at an explicit Engine commit. It signs each part with the
   owner's Ed25519 key (protocol `nwf-engine-view-sync/1`) and pushes it. The
   cloud never connects to the Mac or to the Engine database.
2. **Allowlist, not denylist.** Only the fields named in the versioned
   export schema (`ENGINE_VIEW_EXPORT_SCHEMA_VERSION = 1`) can travel. Both
   sides parse every record with strict schemas, so an unknown field is
   refused, never dropped. Each record keeps its Engine source id. Each part
   carries the Engine commit, the Engine schema version and the generation
   time. The last part carries per-dataset counts, SHA-256 digests and a
   snapshot digest, and the cloud recomputes all of them before activating
   the snapshot.
3. **Publication classes**, each needing a separate OWNER real-data
   approval:
   - `GOVERNANCE`: the ADR register (number, title, status as written,
     decision date, path, blob SHA-256, commit, link) and accepted version
     boundaries (migration versions, contract and policy versions, the
     Operator's Engine pin, classifier-study status without metrics).
   - `CORPUS_AGGREGATE`: counts only (the operational funnel and generation
     slot counts). No organisation identity, no slot occupant, no split
     membership.
   - `RESEARCH_METADATA`: per-organisation research status, research runs
     (states, versions, attributable organisations), acquisition outcomes at
     host level, page-evidence metadata (language, size, heading count) and
     deterministic unit candidates (track, type hint, score, rank,
     eligibility, signal identity).
   - `CLASSIFICATION`: stored classifier calls (model ids, prompt,
     classifier and schema versions, input hash, terminal state, tokens) and
     stored page classifications (verdict, unit type, page kind, unit name,
     the three relevance assessments, confidence), with a review state of
     `NO_HUMAN_REVIEW_RECORDED`. Facts DERIVED from classifier calls are
     CLASSIFICATION too: run attribution through a call, call-based funnel
     counts, and prompt, classifier, schema and model versions observed in
     calls. Without this class the exporter does not read the classifier
     tables at all.
     **Gate:** the class is exported only if this ADR's status line reads
     exactly `Accepted` (optionally `Accepted — YYYY-MM-DD`) at the exported
     Engine commit, and that commit is an ancestor of a named pushed
     (`origin/…`) ref. The cloud enforces the same rule independently: a
     production snapshot carrying CLASSIFICATION is refused unless its own
     ADR register carries ADR 0017 Accepted at the snapshot's commit.
4. **Never published (any class):** page text, heading text, page titles,
   full or parent URLs, robots rule text, response hashes, resolved
   addresses, charset data, free-text error summaries, classifier rationale,
   evidence quotes (`evidence_spans`), request configuration, personal names
   or contact data, HOLDOUT or DEV_CONFIRM membership, gold or human labels,
   per-item evaluation predictions or metrics, credentials and tokens.
   Research runs never carry a corpus split.
5. **OWNER only.** Every cloud route serving this data refuses a MEMBER
   before routing (403), requires the OWNER's MFA (AAL2), and re-checks the
   role in the handler. Releasing an organisation for Outreach grants no
   visibility of its Engine data.
6. **Environment separation.** Staging accepts only `SYNTHETIC_FIXTURE`
   snapshots and production only `ENGINE_EXPORT` snapshots.
7. **Auditable and idempotent.** The cloud records every applied part in
   append-only rows (signature, key, payload hash, importer), every refusal,
   and every snapshot state change (RECEIVING → ACTIVE → SUPERSEDED). A
   half-received snapshot is never visible. Re-pushing an identical part is a
   replay. An unchanged snapshot is not pushed. The Mac keeps an append-only
   export and delivery register.
8. **No cloud execution.** The cloud runs no research, fetch,
   classification, re-classification, evaluation or corpus operation. The
   classifier runtime, its contract, the model allowlist and evaluation
   governance stay exactly as ADR 0009, ADR 0010 and Phase 2B-2D define them.
   A cloud copy is a view of what the Engine stored, never an input to it.
9. **Protected evaluation cohorts never leave.** `RESEARCH_METADATA` and
   `CLASSIFICATION` records are published only for organisations that the
   Engine's evaluation-cohort guard classes ALLOWED: a frame member in no
   draw split, reserve, replacement, R50 or historical set. The guard is
   verified against its pinned artifacts at the exported commit. A research
   run that touches any other organisation is withheld whole, together with
   everything derived from it. Classifier-call-derived counts and versions
   are computed over ALLOWED organisations only. Anything unverifiable
   refuses the whole export. The cloud refuses a production snapshot of
   these classes unless it declares exactly this exclusion policy and these
   artifact digests. `unit_name` is never published.

## 3. What this ADR does not authorise

- Any real-data push. Each publication class needs its own OWNER approval
  naming the environment. Approving this ADR is one of those conditions,
  not the push itself.
- Any MEMBER or employee access, any third-party consumer, or any export
  outside the owner's cloud Operator projects.
- Publication of page titles, URLs or unit names beyond the allowlist. Any
  widening, such as page URLs for source links, needs a privacy review and an
  amendment of this ADR.
- Any change to ADR 0009's runtime, authentication or conflicting-auth
  refusal.

## 4. Consequences

- **FACT.** The cloud copy can be stale. Every page states the snapshot's
  Engine commit and generation time. The Mac stays the authority.
- **FACT.** The cloud now stores a derived copy of first-party institutional
  web-acquisition metadata, and classification outputs once this ADR is
  Accepted. It is held in the EU Supabase project under the existing
  role-separated, Data-API-disabled store, and is covered by the cloud
  backups.
- **RESOLVED (OWNER, 2026-10-14).** `unit_name` could contain a personal
  name in rare cases. It is therefore withheld: always null in every
  published classification.
- **RESOLVED (OWNER, 2026-10-14, assessment `G3-OWNER-20261014-PCX1`).**
  The researched set overlaps the Phase 2B-2D corpus draw. Only
  organisations outside every protected set are published (§2.9), so the
  published set cannot disclose split membership. Corpus aggregates are
  totals only, with no per-split count and no split name.

## 5. Future conditions requiring a new ADR or an amendment

- Any MEMBER visibility, any second consumer, or any public exposure.
- Any field outside the allowlist, or any new dataset.
- Any write path from the cloud back to the Engine, or any cloud-side Engine
  execution.
- Publishing evaluation material beyond aggregate counts.
