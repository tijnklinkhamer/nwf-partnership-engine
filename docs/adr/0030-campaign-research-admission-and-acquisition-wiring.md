# ADR 0030 — Campaign research admission and the acquisition wiring

- **Status:** Proposed. LOCAL, synthetic-only implementation under REL-F1-R2
  and the OWNER directive of 2026-10-27 ("full end-to-end product
  completion", phases A3/A5 and B wiring), as relayed by the integration
  lead, plus the lead's independent-review addendum (P1-4, P2-1, P2-2, P2-3,
  P2-6, P2-7, P2-10), and the WW H-ACQ hardening of the wave-2 review
  (migration 0026, section 13). Not ratified, not pushed, not applied to any
  persistent database. **Inert:** the campaign and review trust sets hold no key; no
  grant row exists; every capability role is NOLOGIN.
- **Date:** 2026-10-27
- **Package:** WW E-W (branch `ww/e-wire`)
- **Extends:** ADR 0023 (OWNER-attested review), ADR 0025 (subject research
  admission), ADR 0027/0028 (granted live source discovery), ADR 0029
  (OWNER-signed campaigns and the work queue). **Supersedes nothing.**
- **Migration:** `migrations/0024_campaign_research_admission_and_wiring.sql`;
  hardening: `migrations/0026_acquisition_hardening.sql` (WW H-ACQ, s13)
- **Scope record:** `docs/evaluation/WW_E_W_ACQUISITION_WIRING_OWNER_DIRECTIVE_RECORD_V1.json`

Claims are tagged **FACT**, **DESIGN DECISION**, **UNKNOWN**.

## 1. Problem

**FACT.** ADR 0029 gave an OWNER-signed campaign a queue and a worker, but
`PRODUCTION_STAGE_HANDLERS` was empty, research still required a per-subject
OWNER review AND a per-subject OWNER admission (ADR 0023/0025) before a
single request, and identity review came first. A campaign could therefore
not progress from search to anything an Operator can import without a human
act per organisation at every step.

## 2. Decision in one paragraph

**DESIGN DECISION.** A signed campaign now drives six real stage handlers
(`src/orgunits/acquisitionWiring/`): search under the grants it lists,
canonical-domain deduplication with named relationship signals, a
PROVISIONAL subject proposal, research admitted BY THE CAMPAIGN (a new,
narrow admission basis), research through the existing engine, and an
Operator outbox. Identity review stays a per-subject OWNER-signed act,
batched into one command; nothing auto-approves. Research therefore happens
BEFORE identity review - the evidence the OWNER reviews is the evidence the
campaign gathered - and is bounded by the campaign's signature, scope and
budgets instead of by a per-subject OWNER admission.

## 3. The stages

| stage → next                    | handler                           | what it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DISCOVERED → NOMINATED          | `discover.ts`                     | SEARCH_GRANT root: the grant must exist and its geography be inside the signed geographies (else REFUSED OUT_OF_SCOPE, no search); ONE `runGrantedSourceDiscovery` with actor key `acq-<work item id>` (a retry finds that run and reuses its nominations: no second grant slot); one search run consumed. LINK_OUT root: the PAGE_LINK_OUT nominations of a campaign-admitted research run. Children: the run's ADMISSIBLE nominations (s13 P1-9).                                                     |
| NOMINATED → DEDUPLICATED        | `dedupe.ts`                       | Re-prepares the nomination through the gates it passed (`prepareNomination`); its registrable domain (one `tldts`) must equal the stored and the item's. Scope: search geography inside the signed list; a link-out only from THIS campaign's own admitted research. Duplicates are REFUSED DUPLICATE with a named signal - a website claim (ECHE/FR) on the domain, an existing discovery subject on it, an earlier nomination holding the domain's identity, the plan's exclusion set. Never a merge. |
| DEDUPLICATED → RESEARCH_PENDING | `promote.ts`, `registryBridge.ts` | Proposes the subject through the EXISTING B2.2 writer (`executePropose` + one `PUBLIC_WEBSITE` claim), kind `UNCERTAIN`, name = the nomination's title (none: NOT_ADMISSIBLE, a name is never invented), both claims citing the nomination (`PUBLIC_URL`, citation digest, its retrieval instant, `SOURCE_STATED`). The subject id is derived from (campaign, nomination): a retry is the same subject. The binding `acquisition_campaign_subjects` records that THIS campaign proposed it.             |
| RESEARCH_PENDING → RESEARCHED   | `research.ts`                     | §4. Then `verifySubjectAdmission` + `runSubjectResearch`, unchanged (35/60/8 budgets, robots, the one gateway, redaction, evidence). Link-outs are captured, never fetched; when the campaign lists LINK_OUT, the run becomes ONE new LINK_OUT root of the same campaign, within the signed link-out depth (s13 P2-5). A retry reuses the run its earlier attempt made.                                                                                                                                 |
| RESEARCHED → IDENTITY_REVIEW    | `outbox.ts`                       | Writes the v2 export and the subject-facts export to the outbox (§6); the worker then parks the item AWAITING_HUMAN / OWNER_IDENTITY_REVIEW by itself.                                                                                                                                                                                                                                                                                                                                                  |
| IDENTITY_REVIEW                 | none (human gate)                 | §5.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ASSESSABLE → end                | `outbox.ts`                       | Appends the subject's manifest line (§6).                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

**DESIGN DECISION — the large-HEI priority rule.** A nomination carrying the
landed higher-education flag (`hei_signal`, ADR 0028) is recorded
`LARGE_HEI_TAGGED` in `acquisition_signals`. The scheduler serves any item
on a tagged registrable domain ONLY when no other item is claimable (rule 0
of `scheduler.ts`). It is deprioritised, never dropped, and the rule orders
WORK, never organisations: no value is attached, and `priority` stays
`100 × stage ordinal` (CHECKed).

**FACT — the actor key.** Registry rows keep the writer's fixed path key
(`discovery-subjects-cli`, enforced by migration 0014); the campaign scope is
the 0024 binding, whose rows carry the opaque path key `acquisition-worker`.

## 4. The CAMPAIGN admission basis

**DESIGN DECISION.** `subject_research_admissions` gains `admission_basis`
(`OWNER_REVIEWED` for every existing row, unchanged, or `CAMPAIGN`), with its
own policy version `subject-research-admission-policy-campaign-v1`, a
foreign key to the 0023 campaign row and to the RESEARCH_PENDING work item.
The research path's root kind stays `subject_admission:<uuid>`; the resolver
(`web/authority.ts`) now implements both policy versions.

A subject proposed inside campaign C may be admitted for bounded first-party
research when ALL hold:

| condition                                                                        | checked by                                                                                 |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| the campaign's OWNER signature verifies under the pinned trust set               | code: `deriveCampaignAuthority` before the item was claimed (the DB cannot verify Ed25519) |
| the campaign is RUNNING, inside its window, and lists RESEARCH_PENDING           | trigger `subject_research_admission_campaign_verify`                                       |
| the work item is this subject's RESEARCH_PENDING item, in flight                 | trigger                                                                                    |
| the subject was proposed inside THIS campaign, on this domain                    | trigger (`acquisition_campaign_subjects`)                                                  |
| the root is https, on the nominated registrable domain                           | trigger; code re-runs the nomination gates (no service or social host)                     |
| the research-root budget is not spent; no other live admission                   | trigger; and the claim's reservation (§9)                                                  |
| a TEST_ONLY campaign is refused outside vitest                                   | the existing subject guard (`identity_authority_scope` = the campaign trust scope)         |
| protected cohort unchanged; root domain isolated from every ECHE/promoted domain | the existing subject guard, before the first request                                       |
| validity at most one day                                                         | CHECK                                                                                      |
| USED only inside the campaign: RUNNING in window, item in flight, first run only | resolver on EVERY gateway attempt + run-row trigger (s13 P1-1, migration 0026)             |
| never by the standalone `orgunits subjects research`                             | code: `CAMPAIGN_ADMISSION_NOT_STANDALONE` (s13 P1-1)                                       |

Only the worker (`nwf_acquisition_worker`, SELECT + INSERT) or the owner path
may insert one, and the trigger refuses any OWNER_REVIEWED row from a
non-owner session. **A CAMPAIGN admission confirms nothing about identity.**

**UNKNOWN.** ADR 0025 §7's global registry fingerprint: any registry write
makes every live admission STALE. With `maxConcurrency` 1 a proposal and its
research never interleave; with more, a research run can be refused STALE
mid-run and is retried (DEPENDENCY_NOT_READY) - correct, but wasteful.

## 5. Why identity review stays per-subject and OWNER-signed (batched)

**DESIGN DECISION.** Automated work may discover, deduplicate, propose and -
under the campaign's signed bounds - research; it may never decide that a
discovered organisation IS who the evidence says. `nwf-pe acquisition review
list` shows each awaiting subject's name, kind and country CLAIMS, root URL,
evidence counts, v2 research-status counts and duplicate signals.
`nwf-pe acquisition review sign --campaign-id … --subject-id … [--subject-id
…] --key-file … --key-id … --execute` decrypts the OWNER key ONCE (one
passphrase per batch, the B2.3 custody rules) and, for EACH listed subject,
signs the EXISTING ADR 0023 owner-attested CONFIRMED review (bound to that
subject's state digest and review head), appends it through the reviewer
capability, and releases that one item to ASSESSABLE on the owner path. There
is no "all" form; an unlisted subject is never reviewed. The review trust set
is EMPTY in production.

**WW H-ACQ (s13 P2-4).** `review list` prints each subject's review head and
state digest; `review sign` requires one `--expect <subjectId>=<stateDigest>`
per listed subject and refuses a missing, unlisted or stale expectation
(`EXPECTATION_MISSING`, `EXPECTATION_UNLISTED`, `STATE_DIGEST_MISMATCH`)
before the key file is read. The release to ASSESSABLE (database, migration 0026) and the outbox manifest line (code) both require the subject's review
head(s) to be an attested CONFIRMED review.

### 5a. Country: stated by a source, confirmed by the OWNER (WW H-ACQ addendum)

**FACT.** The autonomous pipeline records no country, so every discovered
subject reached the Operator NOT RANKABLE (NO_STATED_COUNTRY) unless the
OWNER ran `jurisdiction-claims record` per organisation.

**DESIGN DECISION.** Inside the same batched review, never elsewhere:
`review list` shows per subject at most three lines (each at most 200
characters) of its OWN admitted page evidence - the redacted title, headings
and main text extraction stored - that name one of the 249 assigned ISO
3166-1 alpha-2 countries as a whole word (English names from
`Intl.DisplayNames`, plus names in the page's own declared language), each
with its page evidence id and observed instant. A mention, never a
suggestion: no domain, top-level domain, language, script or address format
is read as a country. `review sign --country <subjectId>=<CC>@<pageEvidenceId>`
(at most one per listed subject) is refused unless the cited page is one of
that subject's shown lines and those lines name that country
(`COUNTRY_PAGE_NOT_SHOWN`, `COUNTRY_NOT_IN_SHOWN_LINES`,
`COUNTRY_SUBJECT_NOT_LISTED`), before any key is read; the dry run prints
the exact claim. Executed, AFTER the subject's review is appended and
released, ONE `SOURCE_STATED` `COUNTRY_OF_OPERATION` claim is recorded
through the EXISTING REL Q1 jurisdiction-claim writer (migration 0021: the
writer capability, actor key `discovery-subjects-cli`, a source the subject
holds, `observed_at` equal to the page's). The claim is the OWNER's statement
of what the source says - migration 0021's own definition of a writer claim;
the table has no further column for it and none was added. A later
disagreeing claim makes the standing CONFLICTING, exactly as before.
**UNKNOWN:** how often a subject's own pages name its country; a page may
name a country for another reason, which is why the OWNER, not code, decides.

## 6. The outbox `nwf-pe.acquisition-outbox.v1`

Under the operator's absolute `--outbox-dir` (never a symlink, owned by the
worker's own user, re-narrowed to 0700 - s13 P2-14), directories 0700, files
0600, JSON only, written to an exclusively created, randomly named temporary
file, fsync'd, renamed, its directory fsync'd (libuv issues F_FULLFSYNC on
macOS) - all before the database row:

```
<outbox>/<campaignId>/outbox.json          {"format":"nwf-pe.acquisition-outbox.v1","campaignId":"…"}
<outbox>/<campaignId>/subjects/<subjectId>/qualification-input-export.v2.json   (nwf-pe.qualification-input-export.v2, verbatim)
<outbox>/<campaignId>/subjects/<subjectId>/subject-facts-export.v1.json         (nwf-pe.subject-facts-export.v1, verbatim)
<outbox>/<campaignId>/manifest.jsonl       one line per ASSESSABLE subject
```

A manifest line:

```json
{
  "format": "nwf-pe.acquisition-outbox.v1",
  "entry": "ASSESSABLE",
  "campaignId": "…",
  "subjectId": "…",
  "workItemId": "…",
  "identityReview": "OWNER_SIGNED_REVIEW_APPENDED",
  "files": {
    "qualificationInputExportV2": {
      "path": "subjects/<id>/qualification-input-export.v2.json",
      "sha256": "…"
    },
    "subjectFactsExportV1": { "path": "subjects/<id>/subject-facts-export.v1.json", "sha256": "…" }
  },
  "recordedAt": "…"
}
```

`acquisition_outbox_entries` records each write's SHA-256 (never content) and
is the idempotency key; the manifest is rebuilt from those rows under a
per-campaign session advisory lock (s13 P2-14), so a retry never duplicates a
line and two writers never rebuild from different row sets. A manifest line
is written only for a subject whose identity review head is an attested
CONFIRMED review (s13 P2-4), and it names the export pair RE-DERIVED at the
ASSESSABLE stage, after that review - never the RESEARCHED stage's pre-review
pair, which cannot carry a country the OWNER stated in the review (`review
sign --country`, s5a) and would reach the Operator as `NO_STATED_COUNTRY`.
The pair is rewritten in place at the one path the Operator accepts; the
RESEARCH_EXPORT row keeps the digest of what was written then (WW acceptance
fix, `wwAcquisitionAcceptance.test.ts`). No page text beyond the v2 export's own redacted
proposal quotes; no body, contact or score. The exports wait until every
record the campaign wrote for the subject lies in a past whole second (they
evaluate "as of" a whole second of the database clock).

## 7. The offline campaign signer

`nwf-pe acquisition campaign template --campaign-key … --geography …` emits
an UNSIGNED draft (`nwf-pe.acquisition-campaign-draft.v2` since WW H-ACQ):
all six worker stages, SEARCH_GRANT + LINK_OUT, a window of at most 14 days
(default 7), small budgets (concurrency 1) and `scope.linkOutMaxHops` "1"
(s13 P2-5). A v2 draft is signed as `nwf-pe.acquisition-campaign.v2`; a v1
draft is still accepted and signed as a v1 document. `nwf-pe acquisition campaign sign --file
<draft> --key-file <encrypted pkcs8> --key-id … --out <signed>` adds the
protocol constants, key id, fingerprint, nonce and issuance instant,
validates with the verifier's own parser, signs `UTF8(protocol + "\n") ||
payload`, verifies its own signature and writes a NEW 0600 file - every byte,
fsync'd; an existing or relative `--out` is refused BEFORE the passphrase is
asked for (s13 P2-16). Offline: no
database, no network; the key is decrypted only by the B2.3 signer's
`decryptSigningKey`. The private-key operation lives in ONE new file,
`acquisitionWiring/campaignSigner.ts`, the B2.3 firewall's exact-path
exception.

## 8. Status `nwf-pe.acquisition-status.v1`

`nwf-pe acquisition status --campaign-id <uuid> --json` returns `{contract,
command, outcome:"STATUS", status}` where `status` is:

```
{ schema: "nwf-pe.acquisition-status.v1", generatedAt,
  campaign: { campaignId, campaignKey, controlState, verified, verificationDetail,
              window: { startsAt, endsAt, open }, allowedStages },
  discovery: { latestRun: { runId, kind: SEARCH_PROVIDER|PAGE_LINK_OUT, geography, startedAt, outcome } | null,
               searchRuns, linkOutRoots },
  candidates: { discovered, deduplicated, proposed, researched, duplicatesRefused, largeHeiDeprioritised },
  identityReview: { awaiting, released },
  outbox: { researchExports, manifestEntries, lastWrittenAt },
  lastSuccessfulResearchAt,
  failures: [ { stage, outcome: REFUSED_TERMINAL|FAILED_TERMINAL, reason, count, explanation } ],
  budgets: { <budget>: { limit, used, remaining } },     // used counts reservations of claims without an outcome
  queue: <the ADR 0029 CampaignStatus, unchanged> }
```

## 9. Review fixes to the 0023 queue (all in migration 0024)

- **P1-4 budgets.** A claim RESERVES its stage's spend under the campaign
  lock (`reserved_*` columns: 1 search run; 1 root + 60 gateway requests for
  RESEARCH_PENDING); the claim trigger recomputes the reservation and refuses
  one that does not fit the signed budget; a claim with no outcome counts its
  reservation as spent (`acquisition_campaign_spend`), so a crashed or
  superseded claim's spend is never dropped; an outcome may not report more
  than its claim reserved; `consume()` refuses beyond the reservation. Lease
  HEARTBEATS: the worker appends `acquisition_claim_lease_extensions` rows
  every third of the lease (at most six hours per claim); once the database
  refuses (lease lapsed or superseded) the handler's signal is aborted and
  the attempt is recorded LEASE_EXPIRED. UNKNOWN: the research path takes no
  abort signal, so an aborted research run finishes its (bounded) root.
- **P2-1.** The worker refuses a superuser, a table owner or a login without
  `nwf_acquisition_worker`; every worker write runs under `SET LOCAL ROLE
nwf_acquisition_worker`; owner-path writes assert the owner path.
- **P2-2.** Every acquisition function pins `search_path = public,
pg_catalog, pg_temp`; `acquisition_is_owner_path()` names
  `public.acquisition_campaigns`.
- **P2-3.** EMERGENCY_STOP takes a NO KEY UPDATE row lock on the campaign (no
  runtime role can hold one) instead of the advisory lock, and the recorder
  retries a lost sequence race. RECOVERY if anything else ever blocks the
  owner path: as the owner, `SELECT pg_terminate_backend(pid) FROM pg_locks
WHERE locktype = 'advisory' AND pid <> pg_backend_pid();`.
- **P2-6.** No root before START or `starts_at`; below DISCOVERED one child
  per parent, keeping the parent's subject for the same subject kind and the
  parent's registrable domain whenever it has one (database trigger AND
  worker output validation). A listed grant outside the signed geographies is
  refused at run time (DISCOVERED, OUT_OF_SCOPE).
- **P2-7.** The outcome rule takes the campaign lock before the item lock.
- **P2-10.** `loadStoredCampaign` reads THIS database's environment record
  independently of the campaign row (the worker gains SELECT on it).
  **Clone replay (FACT):** a database CLONE keeps the environment id, so a
  campaign recorded in one copy verifies in the other; environment binding
  defends against cross-environment replay, not against a clone. Applying a
  campaign to a cloned database is an operational control, not a code one.

## 10. Inertness (FACT, in this build)

- `OPERATIONAL_OWNER_CAMPAIGN_KEYS` and `OPERATIONAL_OWNER_REVIEW_KEYS` are
  empty: no campaign verifies (the worker stops CAMPAIGN_UNVERIFIED before
  its first claim, proven with the production handlers through the CLI), and
  no review envelope verifies.
- No `source_discovery_grants` row exists outside disposable test databases.
- Every capability role is NOLOGIN; 0024 creates none and grants no LOGIN.
- 0024 has been applied only to disposable tmpfs databases.
- Firewall `src/test/firewall/wwAcquisitionWiring.firewall.test.ts` pins the
  wiring namespace; earlier firewalls were widened only by exact path.

## 11. OWNER decision (exact text proposed for activation)

> OWNER DECISION WW-E-W-1 (proposed, unsigned). I ratify ADR 0030 and
> migration 0024 for application to `<named database>` after ADR 0029 and
> migration 0023. I approve research admission BY CAMPAIGN under
> `subject-research-admission-policy-campaign-v1` exactly as ADR 0030 §4
> states, and I confirm that identity review remains a per-subject
> OWNER-signed ADR 0023 review, batched by `nwf-pe acquisition review sign`,
> with no automatic approval. I will provision, by separate decisions: one
> campaign-signing key (custody: `<custody>`) added to
> `OPERATIONAL_OWNER_CAMPAIGN_KEYS`, one review key added to
> `OPERATIONAL_OWNER_REVIEW_KEYS`, logins holding `nwf_acquisition_worker`,
> `nwf_source_discovery`, `nwf_discovery_subject_writer`,
> `nwf_discovery_subject_reviewer` and `nwf_research`, an outbox directory
> `<absolute path>`, and each search grant row. A campaign runs only after I
> sign it with `nwf-pe acquisition campaign sign`, record it and record
> START.
>
> OWNER DECISION WW-H-ACQ-1 (proposed, unsigned). I ratify migration 0026
> and ADR 0030 s5a and s13 for application to `<named database>` after
> migrations 0023-0025: CAMPAIGN admissions honoured only inside their
> campaign, observed spend, the signed link-out depth
> (`nwf-pe.acquisition-campaign.v2`, v1 = one hop), the CONFIRMED-review
> release, and the OWNER-confirmed `--country` statement recorded through
> the REL Q1 jurisdiction-claim writer. A login holding
> `nwf_discovery_subject_writer` is provisioned for `review sign --country`
> by the same separate decision as the worker's writer login.

## 12. Not authorised here

Provisioning or generating any operational key; recording a real campaign,
grant or review; any live network, search, fetch or model call; applying
0024 anywhere persistent; push, merge or deploy.

## 13. WW H-ACQ hardening (migration 0026, independent review @e5b7c07)

Each finding, its repair, and the regression test that reproduces the attack
(`src/test/integration/acquisitionHardeningWwHAcq.test.ts`, unit and firewall
files of the same name):

- **P1-1 CAMPAIGN admission usable outside its campaign.** The resolver
  (`web/authority.ts`) now reads, on EVERY gateway attempt and root-runner
  resolution, the definer-rights view
  `subject_research_campaign_admission_standing` (0017 fingerprint precedent:
  booleans, an instant, a run id and a count; SELECT to `nwf_research` and
  `nwf_readonly` only) and refuses a CAMPAIGN admission unless its campaign is
  RUNNING inside its window, its work item is in flight, and the request
  belongs to the admission's FIRST run, started under the item's current
  attempt (`ROOT_SUBJECT_ADMISSION_CAMPAIGN_NOT_RUNNING` / `_ITEM_NOT_IN_FLIGHT`
  / `_RUN_NOT_FIRST`). A trigger on `orgunit_research_runs` refuses a second
  run of a CAMPAIGN admission, or a run outside those conditions.
  `orgunits subjects research` refuses a CAMPAIGN admission in both modes
  (`CAMPAIGN_ADMISSION_NOT_STANDALONE`). EMERGENCY_STOP, PAUSE, STOP, a lapsed
  lease or a superseded attempt therefore end in-flight research at its next
  request (the evidence already gathered is kept, never deleted); this
  replaces s9's UNKNOWN "an aborted research run finishes its root".
- **P1-2 self-reported gateway spend.** `acquisition_campaign_spend` derives
  each work item's spend as the GREATER of its claims' reservations/reports
  and what the database observed (its CAMPAIGN admissions; the fetch
  observations rooted in them; the worker gains SELECT on exactly
  `orgunit_fetch_observations.root_subject_admission_id`). The research
  handler reports its runs' observed requests exactly once per attempt, on
  success, refusal and exception alike.
- **P1-9 unverified or incomplete search runs.** Discovery reads a run in the
  shape of H-SD's `admissibleNominationsOfRun` (`NOT_A_GRANTED_RUN` ->
  REFUSED; `RUN_NOT_COMPLETED` -> RETRY, never a partial advance, also for a
  run reused by actor key; `COMPLETED` -> nominations of RESULTS calls whose
  SDK version + model carry an OWNER smoke verification). A completed run
  with recorded but no admissible nominations parks its item AWAITING_HUMAN
  on the new closed queue `OWNER_SMOKE_VERIFICATION` - never a terminal empty
  advance. Switching to H-SD's helper is one call once both are integrated.
- **P2-2 forged campaign-subject binding.** The binding must name
  `acquisition_campaign_subject_id(campaign, nomination)`, byte-for-byte the
  wiring's `campaignSubjectIdOf`.
- **P2-3 snapshot isolation.** Every acquisition write (and a CAMPAIGN
  admission or its run) refuses any isolation but READ COMMITTED (SQLSTATE
  25001); every window, due and lease comparison uses `clock_timestamp()`.
- **P2-4 review signs whatever state exists.** See s5: expectations per
  subject; CONFIRMED review required for release and manifest
  (`acquisition_subject_identity_confirmed`).
- **P2-5 unbounded link-outs.** `nwf-pe.acquisition-campaign.v2` signs
  `scope.linkOutMaxHops` (0..3; the table column `link_out_max_hops`, checked
  against the signed document). Hop 1 is a link-out found by research of a
  SEARCH_GRANT or SEED subject; hop n+1 one found by research of a hop-n
  subject. **The conservative reading of v1:** a v1 document stays verifiable
  and means exactly ONE hop - what v1 already did once, and nothing
  recursive. The database refuses the worker's link-out root beyond the
  signed depth (`LINK_OUT_HOP_LIMIT`); research does not ask for one.
  Link-out nominations carry no geography (a country is never inferred), so
  this depth is what bounds how far a geography-scoped campaign can reach.
- **P2-14 outbox durability.** s6.
- **P2-16 campaign signer output.** s7.
- **P2-17 firewall blind spot.** `wwAcquisitionQueue.firewall.test.ts` now
  resolves every import specifier against its file, so the wiring's relative
  `../acquisition/` imports are seen and pinned by exact path.

**UNKNOWN / OPEN.** An item parked on `OWNER_SMOKE_VERIFICATION` is terminal
in this build (AWAITING_HUMAN has no release path outside identity review):
after recording the verification the OWNER starts a new campaign. A
CAMPAIGN admission's first run could in principle be started by any
research-role process while the item is in flight; only the wired worker
does so, and the standalone CLI refuses (code, not database).
