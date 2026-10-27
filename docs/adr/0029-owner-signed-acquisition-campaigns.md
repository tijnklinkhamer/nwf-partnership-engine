# ADR 0029 — OWNER-signed acquisition campaigns and an append-only work queue

- **Status:** Proposed. LOCAL, synthetic-only implementation under REL-F1-R2 and
  the OWNER directive of 2026-10-27 ("full end-to-end product completion",
  phases A3 and A5 core), as relayed by the integration lead. Not ratified, not
  pushed, not applied to any persistent database. **Inert:** the campaign trust
  set holds no key and no production stage handler is wired.
- **Date:** 2026-10-27
- **Package:** WW E-Q (branch `ww/e-queue`)
- **Extends:** ADR 0023 (OWNER-attested review: Ed25519 over canonical JSON,
  a pinned trust set), ADR 0025 (subject research admission), ADR 0026/0027
  (source-discovery nominations; the proposed per-run search grant).
  **Supersedes nothing.**
- **Migration:** `migrations/0023_acquisition_campaigns_and_queue.sql`
  (0022 is reserved for the parallel source-discovery package).
- **Scope record:** `docs/evaluation/WW_E_Q_ACQUISITION_CAMPAIGN_OWNER_DIRECTIVE_RECORD_V1.json`

Claims are tagged **FACT**, **DESIGN DECISION**, **UNKNOWN**.

## 1. Problem

**FACT.** Every acquisition step in the Engine is one operator invocation for
one organisation: one discovery run, one admission, one research run, one
review. That is safe and does not scale, and it gives an operator no way to
approve a bounded body of work once and let it proceed. Firewalls deliberately
forbid a `--all` flag, a crawler loop and a job-queue dependency.

## 2. Decision

A **campaign** is a bounded body of work the OWNER approves once, by signature.
A **work queue** in PostgreSQL holds its items. A **worker** processes approved
items without a per-organisation prompt. It never grants itself authority, and
it never passes the human identity gate.

| piece                                   | what it is                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/orgunits/acquisition/document.ts`  | the campaign document `nwf-pe.acquisition-campaign.v1`, protocol `nwf-pe.acquisition-campaign/1` |
| `canonical.ts`, `trust.ts`, `verify.ts` | canonical JSON, the pinned campaign trust set (EMPTY), signature-first verification              |
| `authority.ts`                          | owner-path record and control; the sealed `CampaignAuthority`                                    |
| `store.ts`, `scheduler.ts`              | idempotent enqueue, leased claims, outcomes, derived budgets; the fair scheduler                 |
| `worker.ts`                             | `runWorker` and the `StageHandler` port                                                          |
| `status.ts`                             | the derived, read-only status                                                                    |
| `nwf-pe acquisition ...`                | `campaign verify/record/control`, `status`, `worker`                                             |

## 3. Authority model

**DESIGN DECISION.** The authority is the OWNER **signature**, never a row.

- A signed envelope is `{keyId, payload, protocol, signature}`; Ed25519 covers
  `UTF8("nwf-pe.acquisition-campaign/1\n") || payloadBytes`. The protocol line
  is part of the signed bytes, so no review signature (ADR 0023) and no
  Operator signature can verify as a campaign, and the reverse.
- The trust set is **separate** from the review trust set: authority
  `OWNER_ACQUISITION_CAMPAIGN`, its own protocol, its own reviewed list
  `OPERATIONAL_OWNER_CAMPAIGN_KEYS` — **empty**. A test set exists only inside
  vitest (`CampaignTrustSet.vitestOnly`), and only with `test-` key ids and
  `TEST_ONLY` scope, which the operational set refuses.
- The signed payload binds: campaign key, this database's environment id (the
  ADR 0023 environment), issuance instant and nonce, a window of at most 30
  days, a scope (ISO geographies or exactly `WORLDWIDE`; source kinds
  `SEARCH_GRANT`/`LINK_OUT`/`SEED`; the worker stages; the search grant ids it
  may consume) and eight budgets (§5). Budgets are decimal strings because the
  canonical encoding has no numbers.
- **Recording** (owner path only — no runtime role holds `INSERT`): verify
  signature first; key `ACTIVE` by the database clock; environment equals this
  database's; not issued in the future; window not over. The database then
  proves the stored `document` IS the signed bytes and that every column
  equals its field. A campaign is recorded `NOT_STARTED`.
- **Use:** `deriveCampaignAuthority` is the one way to obtain a
  `CampaignAuthority` (private `#sealed` brand, unexported mint). It re-reads
  the row, **re-verifies the stored signature** under the pinned set, checks
  the key is still authority for the recording instant (a `REVOKED` key stops
  every campaign it signed), and requires a `RUNNING` control state and an open
  window, by the database clock. The worker derives it **before every claim**.
- **Control:** `START | PAUSE | RESUME | STOP | EMERGENCY_STOP`, owner path
  only, totally ordered (`sequence_no`). The state is derived from the latest
  event. `STOP` and `EMERGENCY_STOP` are terminal (`EMERGENCY_STOP` may escalate
  a `STOP`). `START` and `RESUME` require the campaign to verify; a halt never
  does, so a campaign can always be stopped.
- **Defence in depth.** The claim trigger itself refuses a claim unless the
  campaign is `RUNNING`, inside its window, the stage is listed, the item is
  due, the previous attempt is finished or expired, and a concurrency slot is
  free — whatever a caller holds.

**FACT — what the signature proves.** That whoever signed held a listed key.
Custody, and which person operated it, are outside code (ADR 0023 §4). The
owner path itself proves database ownership, not a person (ADR 0020 §6): the
database cannot verify Ed25519, so an owner could insert a row by hand — but it
would carry no valid signature and the worker would refuse it.

## 4. The queue, the scheduler and the worker

**Stages** (closed): `DISCOVERED → NOMINATED → DEDUPLICATED → RESEARCH_PENDING →
RESEARCHED → IDENTITY_REVIEW → ASSESSABLE`. What each stage is about is a CHECK
(a search grant / research run / seed list; a nomination; a nomination or
discovery subject; then a discovery subject).

- **Items** are idempotent per `(campaign, stage, subject)` — the key is
  deterministic and CHECKed. A child is admitted only while its parent's latest
  attempt is in flight and only at the parent's next stage. Worker roots are
  only the search grants the signed campaign lists; link-out and seed-list
  roots are owner-path only.
- **Claims** are INSERTs; `(work_item_id, attempt_no)` is unique, so two
  workers cannot hold the same attempt. Attempt `n+1` needs attempt `n` to have
  expired with no outcome, or a due `RETRY_SCHEDULED`.
- **Outcomes**: one per claim; at most one terminal (incl. `ADVANCED`) per item
  by a unique partial index — **an item is never ADVANCED twice**, even with
  every trigger bypassed (tested). An outcome on a superseded claim is refused.
  An outcome and its children are one transaction.
- **Retry backoff**: `min(60 s · 2^(attempt−1), 3600 s)`, no jitter;
  `max_attempts_per_item` bounds attempts; an expired lease at the last attempt
  is closed `FAILED_TERMINAL / LEASE_EXPIRED_ATTEMPTS_EXHAUSTED`.
- **Priority** is `100 × stage ordinal` (CHECKed): later stages drain first. It
  orders work, never organisations. Nothing here scores or ranks an
  organisation (the product has one score: the Operator's C1 rubric).
- **Scheduler** (pure, deterministic): round-robin across stages in
  descending priority, starting after the stage of the last claim; within the
  stage, the least-recently-served registrable domain (ties lexical); then
  priority, age, id. A domain with a live claim or an open circuit is skipped.
- **Worker**: before each claim — authority, budgets and the human backlog
  from rows. A stage whose required resource is spent is not claimed; when only
  such items remain the worker stops `BUDGET_EXHAUSTED`. At the
  `max_awaiting_human_backlog` cap it stops `BACKPRESSURE`. `PAUSE`/`STOP` stop
  claiming; the current item finishes. `EMERGENCY_STOP` is polled while a
  handler runs and aborts the handler's signal; the item is recorded
  `REFUSED_TERMINAL / CAMPAIGN_EMERGENCY_STOPPED` with no children. A caller's
  `AbortSignal` is honoured between items. A crash leaves only a claim, whose
  lease expires and is retried. Every stop is a row in
  `acquisition_worker_stops`. The orchestrator's `HostCircuitBreaker` is reused,
  keyed by registrable domain.
- **The handler port** is the only way work is done. The worker imports no
  gateway, robots, sitemap, search provider, classifier or research path.

## 5. Budgets (mechanical safety bounds, not calibrated targets)

Per campaign, signed and CHECKed: `maxWorkItems` 1–10000, `maxSearchRuns`
0–100, `maxResearchRoots` 0–500, `maxGatewayRequests` 0–30000,
`maxItemsPerRegistrableDomain` 1–100, `maxConcurrency` 1–4,
`maxAttemptsPerItem` 1–10, `maxAwaitingHumanBacklog` 1–1000. The bounds cap
what one document can ask for; they are not measured values. Consumption is
what handlers report per outcome; remaining budget is derived from sums.
`WORLDWIDE` scope is allowed only with these budgets, like any other scope.

**UNKNOWN.** A handler that throws, or a process that dies, records no
consumption for that attempt. The leak per attempt is bounded by the Engine's
own per-root budgets (35 pages / 60 requests) and by `maxAttemptsPerItem`.

## 6. Why identity review stays human

**DESIGN DECISION.** Automated work may discover, nominate, deduplicate and
research; it may never decide that a discovered organisation **is** who the
evidence says it is. That decision is the OWNER-attested review of ADR 0023,
and research admission (ADR 0025) and every downstream use rest on it.

- `IDENTITY_REVIEW` is not a worker stage: a campaign cannot list it, a handler
  for it is refused at worker start, and the worker parks every such item as
  `AWAITING_HUMAN / OWNER_IDENTITY_REVIEW` by itself.
- The database refuses any other outcome for an identity-review claim, and
  refuses an `ASSESSABLE` item unless the **owner path** creates it as the
  child of an identity-review item that is awaiting a human.
- Backpressure stops the worker when the human backlog reaches the signed cap,
  so automation cannot outrun review.

A campaign is not research admission either: `RESEARCH_PENDING` handlers are
injected ports, and campaign-scoped admission is a separate later package.

## 7. Inertness (FACT, in this build)

- `OPERATIONAL_OWNER_CAMPAIGN_KEYS` is empty: `campaign verify` and
  `campaign record --execute` refuse every real envelope (`KEY_UNKNOWN`), and a
  stored campaign derives no authority (`CAMPAIGN_UNVERIFIED`).
- `PRODUCTION_STAGE_HANDLERS` is empty: `acquisition worker` refuses every
  campaign with `ACQUISITION_HANDLERS_NOT_WIRED` before touching the worker
  capability.
- `nwf_acquisition_worker` is NOLOGIN; no migration creates a login.
- Migration 0023 has been applied only to disposable tmpfs databases.
- Firewall `src/test/firewall/wwAcquisitionQueue.firewall.test.ts` pins all of
  the above. No existing firewall was edited: the namespace avoids every
  earlier pin by construction (its canonical encoder is a reviewed copy, not an
  import of `subjectReview/`), no queue dependency was added, and `src/queue`
  and `src/workers` stay absent.

## 8. What activation needs

1. OWNER ratification of this ADR and migration 0023.
2. An OWNER campaign-key custody decision (separate from the review key) and a
   reviewed source change adding one `ACTIVE` entry to
   `OPERATIONAL_OWNER_CAMPAIGN_KEYS`. An offline campaign signer (the ADR 0023
   §6 pattern) does not exist yet and is part of that change.
3. A wiring package that implements the stage handlers (search under ADR 0027
   grants, link-out nominations, dedupe, campaign-scoped research admission,
   export) and replaces `PRODUCTION_STAGE_HANDLERS` by exact path.
4. An OWNER decision to apply 0023 to a persistent database and to provision
   one login granted `nwf_acquisition_worker`.
5. A signed, recorded campaign and an explicit `START`.

## 9. Not authorised here

Provisioning or generating any operational key; recording or starting a real
campaign; wiring any production handler; any live network, search or model
call; applying 0023 anywhere persistent; push, merge or deploy.
