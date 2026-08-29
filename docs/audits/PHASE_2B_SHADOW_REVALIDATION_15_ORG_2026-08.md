# Phase 2B — 15-Organisation Shadow REVALIDATION, Paired Before→After (2026-08-29)

Independent paired rerun of the exact 2026-08-27 15-organisation French
holdout against the **corrected** deterministic acquisition engine.
Observation only: **no production code, test, migration, weight, budget or
configuration was changed during this phase.** All evidence cited below is
append-only research evidence in the working database (`nwf_pe`) and is
deliberately retained as the durable corrected-engine cohort.

**VERDICT (details in §Recommendation): PROCEED TO PHASE 2B-2 WITH
NON-BLOCKING FOLLOW-UPS.** All three blocking defects from the 2026-08-27
audit are verifiably eliminated in live production runs. Persisted
useful-unit recall moved from **6/12 live organisations to 11/11 live
organisations**, with the useful target at **rank 1 in 10 of 11** and rank 2
in the 11th. Zero trust violations, zero PII leakage, zero silent zeros,
zero FAILED runs, zero malformed-anchor requests, zero cart-action
requests. The four remaining misses are all external website failures
(three the same dead domains as before, plus ISAE-SUPAERO's site being
unreachable from this vantage on the day of measurement — verified
independently of the engine).

---

## 1. Method and baseline

| item                                                             | value                                                                                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| baseline SHA (HEAD == origin/main, clean tree, before and after) | `218bcddfe6adcf9a73c2e43dbc4b9f6da41036b4`                                                                                                 |
| BEFORE baseline (frozen report)                                  | `6c80e5fbec2f7c51a7312a00456063b0a2f49851`                                                                                                 |
| frozen BEFORE report (read in full, not edited)                  | `docs/audits/PHASE_2B_SHADOW_VALIDATION_15_ORG_2026-08.md`                                                                                 |
| migrations                                                       | 0001–0008, sequential, checksums intact (`migrations:check` OK)                                                                            |
| signal ruleset                                                   | `orgunit-signal-rules-v1` — **unchanged**, verified in `score.ts`                                                                          |
| fetch policy                                                     | `orgunit-fetch-policy-v1` (30 s connect / 45 s total / 5 MiB) — unchanged                                                                  |
| frozen budgets                                                   | 35 pages / 60 requests / 8 hosts / Track B floor 8 / sitemap 5-2-3000 — unchanged in `constants.ts`                                        |
| CLI used for every run                                           | `nwf-pe orgunits discover --organisation-id <uuid> --execute --json`                                                                       |
| vantage                                                          | same operator machine as BEFORE; runs executed 2026-08-29, one organisation at a time, no parallelism, no config changes, no manual rescue |

The evaluation rubric (per-organisation capture list, success criteria,
canary choice and stop gates) was frozen in writing before the first live
request; success criteria were not altered after results were seen. "Useful
partner-unit area" uses the BEFORE report's §3 definition verbatim, judged
manually from the engine's own persisted evidence only.

**Corrections verified present in the landed diff (`6c80e5f..218bcdd`)
before any network activity:**

- `checkRootScope` (`url.ts`): an http root now authorises http requests
  anywhere inside its scope (its native scheme); an https root still never
  authorises an http descendant — HTTPS→HTTP remains refused.
- `unicodeCodePointLength` / `truncateToCodePointLimit` (`extract.ts`), used
  by both `pageEvidence.ts` and `pageCollection.ts`: `main_text_chars` now
  matches PostgreSQL `length()` semantics; truncation never splits a
  surrogate pair.
- `persistCollectedPages` now attempts **every** page and collects failures;
  `rootRunner.ts` persists candidates for every page that succeeded before
  raising an aggregate error — a late failure can no longer strand a root's
  evidence without ranks.
- `runRootAcquisition` catches `WebGatewayRefusal` into an explicit
  `ROOT_REQUEST_REFUSED` terminal reason with `refusalDetail`; anything that
  is not a refusal is re-thrown (infrastructure failures still fail the run).
  One root's refusal can no longer suppress a sibling.
- `anchors.ts` runs `stripNonContent` before the anchor regex and rejects any
  href carrying a raw `<`/`>` (`RAW_MARKUP_DELIMITER`).
- `hasCartActionQueryParam` (`universal.ts`) refuses `?add-to-cart=` URLs at
  admission, before any request, for every discovery method. It is a pure
  admission predicate, **not** a scored rule — no `SignalRule` was added and
  `ORGUNIT_SIGNAL_RULE_VERSION` is unchanged.
- `attemptedUrls` guard present; no generic query normalisation exists.

Engine sanity gate before live runs: `migrations:check`, `typecheck`,
`lint` clean; full test suite 1,287/1,289 with the 2 failures isolated to
`ewpIngest.test.ts` hook timeouts under full-suite DB contention (44/44 pass
in isolation — flake, not regression). One pre-existing baseline note:
`npm run validate` fails at `format:check` on the **committed frozen BEFORE
report itself** (not prettier-clean as landed). Not fixed here — the frozen
report may not be rewritten; flagged for the owner.

## 2. Holdout identity and root comparability

The AFTER cohort is exactly the same 15 organisations, addressed by the same
organisation UUIDs recovered from the BEFORE runs' own fetch observations
(the two zero-request BEFORE runs, Évry `47b87df3` and Mayotte `13b31577`,
were disambiguated by their stored `REQUEST_SCHEME_DOWNGRADE` error
summaries naming their root URLs). No replacement, no omission.

**Root-set confounder check: none.** `website_claims` yields the identical
22 structurally-valid claim roots the BEFORE run resolved (7 dual-root
organisations + 8 single-root). Promotions remain 0. No claim changed
between the two passes.

### Paired run map (15 BEFORE + 15 AFTER, nothing mixed in)

| organisation          | BEFORE run | AFTER run  |
| --------------------- | ---------- | ---------- |
| IRTESS Dijon          | `a0c629e8` | `2cba125c` |
| Université d'Évry     | `47b87df3` | `269c420c` |
| CUFR de Mayotte       | `13b31577` | `404f54cb` |
| INSA Rouen            | `e6d77524` | `eb694783` |
| ISAE-SUPAERO          | `2b9a87e5` | `2bd22605` |
| IPAG                  | `89bad8f9` | `6f50a126` |
| Université Paris Cité | `947fc354` | `65377823` |
| Sorbonne Nouvelle     | `d054aca3` | `a17554dd` |
| IFPEK Rennes          | `420f618d` | `10898daa` |
| Grenoble EM           | `9105a94f` | `f786d455` |
| ESLSCA                | `3b8a83d5` | `27c05395` |
| Agifen                | `1b459c60` | `b31719a5` |
| Rabelais Douai        | `7a87ea31` | `bf4c500b` |
| BTP CFA Occitanie     | `54f6c227` | `7c5a26ba` |
| IMS Nantes            | `9985b732` | `51f520b5` |

## 3. Canary

**ISAE-SUPAERO first** (it exercised both the Unicode persistence failure
and the malformed-anchor amplification in BEFORE). Result: the site itself
was **unreachable** — both roots' robots.txt bootstraps ended
`CONNECT_TIMEOUT` after the full 30 s policy timeout, honestly recorded
(`ROBOTS_UNREADABLE_ROOT`, 1 request per root, run COMPLETED). An
independent out-of-engine diagnostic probe (curl, twice, ~31 s each)
confirmed `www.isae-supaero.fr:443` drops connections from this vantage
while general outbound connectivity works — the engine's rows are accurate
and this is a **site-side availability change**, not an engine regression.
Every canary safety gate passed: bounded (2 requests), honest lifecycle,
both sibling roots ran independently, no trust or schema issue. The
Unicode/anchor validation burden transferred to IPAG, Paris Cité, IFPEK
(Unicode) and the WordPress/Elementor sites IRTESS and IMS (anchor
hygiene), all of which ran clean. The remaining 14 were then run
one-by-one with no configuration change.

## 4. Paired per-organisation result table

"Fetched"/"persisted" = useful-area page fetched / persisted with candidate
ranks (BEFORE §3 definition). Req = engine total for the organisation, all
roots. Ranks are Track A unless noted.

| organisation      | fetched B→A | persisted B→A | useful rank B→A                        | req B→A (Δ) | pages B→A (Δ) | run B→A      | primary change reason                                                                                                                                        |
| ----------------- | ----------- | ------------- | -------------------------------------- | ----------- | ------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| IRTESS            | Y→Y         | Y→Y           | 1→1 (9)                                | 40→40 (0)   | 35→35 (0)     | COMPL→COMPL  | cart hygiene: ~17 cart-action pages now refused pre-network; 24 real content pages persisted                                                                 |
| Évry              | N→**Y**     | N→**Y**       | —→**1** (20)                           | 0→40 (+40)  | 0→35 (+35)    | FAILED→COMPL | **ENGINE** (defect 1 both parts): http root bootstraps honestly; https FR sibling ran full pipeline                                                          |
| Mayotte           | N→**Y**     | N→**Y**       | —→**1** (16)                           | 0→38 (+38)  | 0→35 (+35)    | FAILED→COMPL | **ENGINE** (defect 1), as Évry                                                                                                                               |
| INSA Rouen        | Y→Y         | Y→Y           | 1→1 (A 22; B FLE 1 at 12)              | 74→74 (0)   | 70→70 (0)     | COMPL→COMPL  | unchanged; same-domain dual root still duplicates the crawl verbatim                                                                                         |
| ISAE-SUPAERO      | Y(fetch)→N  | N→N           | —→—                                    | 41→2 (−39)  | ~36→0         | FAILED→COMPL | **SITE CHANGE**: host unreachable (verified out-of-engine); honest 2-request stop                                                                            |
| IPAG              | Y(fetch)→Y  | N→**Y**       | —→**1** (19)                           | 38→38 (0)   | 35→35 (0)     | FAILED→COMPL | **ENGINE** (defect 2): mobility-team page now persisted at rank 1; ipag.fr robots 301 cross-domain still honest stop                                         |
| Paris Cité        | Y(fetch)→Y  | N→**Y**       | —→**2** (DRI 15)                       | 39→76 (+37) | 35→70 (+35)   | FAILED→COMPL | **ENGINE** (defects 2 + sibling isolation): both roots now complete; previously-suppressed u-pariscite.fr ran fully                                          |
| Sorbonne Nouvelle | Y→Y         | Y→Y           | 1→1 (A 12; B LEA 1 at 15, UFR 3 at 12) | 38→38 (0)   | 35→35 (0)     | COMPL→COMPL  | unchanged; `?RH=` variants still occupy A ranks 2–7 (3 documents, 1 shared sha256 measured)                                                                  |
| IFPEK             | Y(fetch)→Y  | N→**Y**       | —→**1** (11)                           | 41→41 (0)   | 35→35 (0)     | FAILED→COMPL | **ENGINE** (defect 2): `/relations-internationales/` persisted at rank 1; sitemap now contributed 139 URLs (site change or BEFORE-abort artefact; UNCERTAIN) |
| Grenoble EM       | Y→Y         | Y→Y           | 1→1 (15)                               | 38→38 (0)   | 35→35 (0)     | COMPL→COMPL  | unchanged; BBA programme pages still #5–7; 3 alumnforce OAuth-connector fetches still occur                                                                  |
| ESLSCA            | Y→Y         | Y→Y           | 1→1 (15)                               | 38→38 (0)   | 35→35 (0)     | COMPL→COMPL  | unchanged; sitemap again material (547 URLs)                                                                                                                 |
| Agifen            | n/a         | n/a           | —                                      | 1→1 (0)     | 0→0           | COMPL→COMPL  | external: typo domain, DNS_FAILURE, honest 1-request stop                                                                                                    |
| Rabelais Douai    | n/a         | n/a           | —                                      | 3→3 (0)     | 1→1           | COMPL→COMPL  | external: decommissioned; https→http downgrade redirect recorded, never followed; NO_ELIGIBLE_HTML                                                           |
| BTP CFA Occitanie | n/a         | n/a           | —                                      | 37→37 (0)   | 35→35 (0)     | COMPL→COMPL  | external: squatted content farm; full budget, **every candidate score 0 again** (no false positives)                                                         |
| IMS Nantes        | Y→Y         | Y→Y           | 1→1 (13)                               | 41→41 (0)   | 35→35 (0)     | COMPL→COMPL  | unchanged; Erasmus-Days news items still #3–7                                                                                                                |

## 5. Correction-specific table

| cohort                                                | old defect                                                                                                                                              | BEFORE behaviour                                                                   | AFTER behaviour                                                                                                                                                                                                                                                                                                    | eliminated?           | persistence / rank effect                                                                                                | remaining issue                                                                                                                                                                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Évry, Mayotte                                         | defect 1a: http root's own robots bootstrap refused itself (`REQUEST_SCHEME_DOWNGRADE`); 1b: refusal escaped and killed the whole organisation          | FAILED, 0 requests, healthy https FR roots never attempted                         | http bootstrap **requested** (the only 2 http requests in the cohort, both the http roots' own robots.txt); server answered 301, honestly `ROBOTS_UNREADABLE_ROOT`; **https sibling ran the full pipeline in the same run**; COMPLETED                                                                             | **YES (both parts)**  | Évry A#1=20 (`international.univ-evry.fr` exchange page), Mayotte A#1=16 (relations-internationales) — both from nothing | an http root whose robots.txt 301s to https still ends unreadable by design (gateway follows no redirect); both holdout orgs recovered via their https sibling — an org with ONLY an http claim would still get zero acquisition (see follow-up 5) |
| IPAG, Paris Cité, IFPEK (ISAE untestable — site down) | defect 2: `main_text_chars` counted UTF-16 code units against a code-point CHECK; one astral character destroyed the root's evidence and failed the run | crawl succeeded, persistence aborted; stranded evidence without candidates; FAILED | all three persisted full evidence + candidates and COMPLETED. Corpus-wide: **9 AFTER evidence rows contain astral characters and persisted cleanly**; `main_text_chars = length(main_text)` holds for **all 442** rows; **0** evidence rows lack a candidate on either track                                       | **YES**               | IPAG —→A#1 (19, the mobility-team page BEFORE lost); Paris Cité —→A#2 (DRI, 15) on both roots; IFPEK —→A#1 (11)          | none observed                                                                                                                                                                                                                                      |
| ISAE (anchor loop)                                    | defect 3: `--><!--` artifact self-amplified, 26/41 requests                                                                                             | 63% of budget burned                                                               | site unreachable, so untestable on ISAE itself. Corpus-wide: **0 of 545 AFTER requests** carry `%3C`, `%3E`, `<`, `>` or comment artefacts; the WordPress/Elementor sites in the cohort (IRTESS, IMS, IFPEK) crawled clean; the exact ISAE artefact is pinned by regression tests (`orgunitAnchorHygiene.test.ts`) | **YES (class-level)** | n/a                                                                                                                      | live confirmation on ISAE itself awaits the site's return                                                                                                                                                                                          |
| IRTESS (cart)                                         | `?add-to-cart=` GETs ate ~17 of 35 pages and mutated remote cart state                                                                                  | ~½ budget wasted                                                                   | **0 add-to-cart requests in 545**; IRTESS spent the same 40 requests on real content (24 evidence pages) and kept A#1                                                                                                                                                                                              | **YES**               | rank unchanged (A#1=9); corpus depth improved                                                                            | none                                                                                                                                                                                                                                               |

## 6. Aggregate metrics

Live-site denominator: BEFORE 12; AFTER 11 (ISAE unreachable on measurement
day — external, verified). "All" = all 15.

| metric                                                 | BEFORE                       | AFTER                                                                                                                                     |
| ------------------------------------------------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| useful-area FETCH reach (live / all)                   | 10/12 / 10/15                | **11/11 / 11/15**                                                                                                                         |
| **persisted useful recall (live / all)**               | **6/12 / 6/15**              | **11/11 / 11/15**                                                                                                                         |
| §26 transitions                                        | —                            | 6 SUCCESS→SUCCESS, **5 FAIL→SUCCESS**, 0 SUCCESS→FAIL (engine), 4 FAIL→FAIL (all external; ISAE's fail changed cause from engine to site) |
| top-5 recall (live / all)                              | 6/12 / 6/15                  | **11/11 / 11/15**                                                                                                                         |
| top-8 recall (live / all)                              | 6/12 / 6/15                  | **11/11 / 11/15**                                                                                                                         |
| useful rank where persisted                            | 6/6 at rank 1                | **10/11 at rank 1**, 1 at rank 2 (Paris Cité — rank 1 is that site's own mobility-news category page)                                     |
| total requests                                         | 469                          | 545 (+76: Évry +40, Mayotte +38, Paris Cité 2nd root +37, ISAE −39)                                                                       |
| median / mean / max requests per organisation (all 15) | 38 / 31.3 / 74               | 38 / 36.3 / 76                                                                                                                            |
| total ordinary page attempts                           | 422                          | 491                                                                                                                                       |
| median page attempts (all 15)                          | 35                           | 35                                                                                                                                        |
| requests per successful persisted useful acquisition   | 78.2 (469/6)                 | **49.5** (545/11)                                                                                                                         |
| FAILED runs                                            | 6                            | **0**                                                                                                                                     |
| run lifecycle                                          | 15 runs / 15 completions     | 15 runs / 15 completions; DB total now 30/30, 0 orphans, 0 duplicates                                                                     |
| trust violations                                       | 0                            | **0**                                                                                                                                     |
| PII leaks                                              | 0                            | **0**                                                                                                                                     |
| silent zeros                                           | 0                            | **0**                                                                                                                                     |
| malformed-anchor requests                              | 26 (ISAE)                    | **0**                                                                                                                                     |
| cart-action requests                                   | ~17 (IRTESS)                 | **0**                                                                                                                                     |
| circuit-breaker openings                               | 0                            | 0                                                                                                                                         |
| 60-req / 8-host / frontier / sitemap caps hit          | never (max 41/root, 3 hosts) | never (max 41/root, 4 hosts, frontier max 1,520 of 5,000)                                                                                 |

## 7. Trust and PII red-team (targets 0 — results 0)

SQL over all **545** AFTER fetch observations and **46** AFTER redirect
observations:

- 0 fetches outside the root's registrable domain; 0 promotion-rooted
  fetches (promotions remain 0); 0 explicit ports; 0 userinfo; 0 non-http(s)
  URLs; 0 non-public resolved IPs; 0 requests on any service-subdomain host.
- Exactly **2** http-scheme requests in the whole cohort — the two http
  roots' own robots.txt bootstraps (their native scheme, by corrected
  design). **0** http requests under an https root: no downgrade was ever
  requested. Rabelais' https→http downgrade redirect (root and sitemap,
  2 observations) was recorded and never followed.
- All 6 cross-registrable-domain redirects stopped, recorded, never
  followed: ipag.fr→ipag.edu, univ-paris3.fr→sorbonne-nouvelle.fr, 3
  alumnforce.net OAuth hops (GEM), and Mayotte's own broken robots
  `Location` header (`https://www.univ-mayotte.frrobots.txt/` — the site
  concatenates host+path; recorded as fact, never fetched).
- 0 credential-bearing and 0 malformed redirect targets persisted.
- 0 DISALLOWED robots verdicts (none in sample); robots decisions: ALLOWED
  512, NOT_APPLICABLE 29 (policy/sitemap retrievals), NO_ROBOTS_FILE 4.
  Only error kinds in the cohort: CONNECT_TIMEOUT 2 (ISAE), DNS_FAILURE 1
  (Agifen).

PII, corpus-wide over all **442** AFTER evidence rows and **884** candidate
signal payloads: 0 literal email addresses, 0 phone-shaped strings, 0
`mailto:`/`tel:` targets (2 regex hits were the literal label text "Tel:"
followed by `[PHONE]` markers — redacted content, not leaks). **106 rows
carry `[EMAIL]`/`[PHONE]` markers** (78 email, 52 phone), proving the
redactor ran on real contact-bearing pages.

## 8. Mechanism findings

- **Persistence pipeline is now loss-free.** 442 evidence rows, 884
  candidate rows — exactly 2 per evidence row; 0 evidence rows without
  candidates on either track; 0 persistence failures; 0 stranded partial
  states. The BEFORE fetched-but-lost class is empty.
- **Discovery sources.** Top-5 positive candidates: 52 via anchors, 12 via
  sitemap; rank-1 positives: 16 anchors, 1 sitemap. The BEFORE hypothesis
  holds: anchors dominate, now with less noise. Sitemaps were material for
  ESLSCA (547 URLs), IPAG.edu (1,360), Mayotte FR root (309), IFPEK (139),
  IMS (116).
- **Candidate score distributions (ruleset unchanged; shifts are corpus
  growth, not scoring change).** Track A (n=442): min −3, median 1, max 22;
  244 positive / 196 zero / 2 negative — same envelope as BEFORE (n=254,
  min −3, max 22). Track B (n=442): min −6, max 15; 7 positive / 427 zero /
  8 negative (BEFORE: 6 positive). Signed persistence again errored zero
  times.
- **Track B.** Real B units persisted and ranked where they exist: INSA FLE
  B#1 (12), Sorbonne LEA B#1–2 (15) + UFR LLCSE B#3–4 (12). No other
  holdout site shows a language-centre unit; anchor hygiene did not starve
  B discovery (B-selected counts: Sorbonne 4, INSA 1 — comparable to
  BEFORE). **TRACK_B_FLOOR = 8 again never bound**: it remains unexercised
  in real holdout conditions; no site offered 8 viable B URLs.
- **Programme false positives (§43).** Same gaps, same shapes: GEM
  "International BBA" #5–7, INSA "Master Erasmus Mundus" #5, IPAG
  programme/blog pages #2–8, ESLSCA blog #3–8. In every case the useful
  target sits above them (rank 1–2) — **inside-top-8 false positives with
  the useful target also inside top-8: non-blocking**, exactly the
  classifier's job. `NEG_PROGRAMME_SHAPE`'s vocabulary gaps (`bba`, bare
  `bachelor`/`master`) remain concrete v2 evidence. Nothing was displaced
  outside top-8 by a programme page anywhere in the cohort.
- **News/event false positives (§44).** IMS Erasmus-Days items #3–7 and
  Mayotte's Erasmus-Days page #3, as BEFORE. New evidence: Paris Cité's
  rank-1 on both roots is `category/mobilite-etudiante/page/2/` (16) — a
  news-category page outranking the DRI service page (15) by 1. Cost: the
  useful target sits at rank 2. Non-blocking; strengthens the news-shape v2
  case.
- **Research veto (§45).** INSA `/recherche/relations-internationales`
  again scores 9 on own-page vocabulary (rank 6) with inheritance vetoed —
  behaviour unchanged and sane; no handoff harm (useful target at 22).
- **Hostname scoring (§46).** This pass finally produced a real
  international-labelled host — `international.univ-evry.fr` — and the
  engine found it via anchors and ranked it #1 (score 20) with no hostname
  signal. No AFTER miss would have been recovered by hostname scoring (the
  misses are dead/unreachable domains). **HOSTNAME SCORING NOT JUSTIFIED BY
  TWO HOLDOUT PASSES.**
- **Waste that remains (bounded, non-blocking):** INSA's same-domain dual
  root still duplicates 37 requests and 35 evidence rows verbatim;
  Sorbonne's `?RH=` k.jsp variants still occupy A ranks 2–7 (measured: 3
  variants of document 122366 share one `response_sha256`); GEM's frontier
  still fetches 3 alumnforce OAuth-connector URLs (public ephemeral state
  in append-only redirect evidence, as BEFORE); IMS's
  `?ae_global_templates=` fragments persist as zero-scored B rows.

## 9. Failure taxonomy (every AFTER miss, one primary class)

- **A. External website failure (4):** Agifen (typo DNS, unchanged),
  Rabelais Douai (decommissioned → error-host downgrade redirect,
  unchanged), BTP CFA Occitanie (squatted content farm, unchanged, again
  zero false positives), **ISAE-SUPAERO (newly unreachable from this
  vantage; CONNECT_TIMEOUT on both roots, verified out-of-engine)**.
- **B–J: none.** 0 orchestration defects (BEFORE: 6), 0 discovery, ranking,
  extraction, persistence or scoring failures, 0 unknowns.

BEFORE→AFTER: H 6→0; A 3→4 (the +1 is a site-side change, not an engine
event).

## 10. Database state (append-only; deliberately retained)

Phase 1 tables unchanged after the 15 AFTER runs: organisations 2,289;
organisation_sources 2,289; website_claims 6,227; website_source_snapshots
1; ewp_heis 3,472; ingest_runs 10. Phase 2B before→after (delta):
research_runs 15→30 (+15); completions 15→30 (+15); fetch_observations
469→1,014 (+545); redirect_observations 58→104 (+46); page_evidence
274→716 (+442); page_candidates 508→1,392 (+884); promotions 0→0;
revocations 0→0. No BEFORE row was updated or deleted (all deltas are pure
additions over the frozen BEFORE counts). The AFTER runs are retained as
the corrected-engine comparison cohort.

## 11. Decisions

### RULESET-V2 NOT REQUIRED BEFORE 2B-2

The ruleset was unchanged in this pass and delivered the useful target
inside the top-8 handoff for **every technically usable site — 11/11, with
10 at rank 1**. The observed weaknesses (programme-shape vocabulary gaps,
news/event shapes) produced false positives _inside_ the bounded set, never
displacement of a useful target _out_ of it. That is precisely the failure
mode a semantic classifier exists to absorb. Programme-shape v2 (`bba`,
bare `bachelor`, French `master`) and a news/event shape remain
evidence-justified future improvements — now with a second independent pass
of evidence (Paris Cité's category page at rank 1) — but nothing in this
cohort requires them before 2B-2.

### SEARCH JUSTIFIED BUT CAN FOLLOW 2B-2

4 of 15 organisations end at genuinely dead, foreign or unreachable roots
that no crawling policy can fix (Agifen, Rabelais, BTP CFA, plus ISAE on
this day). That is a **coverage** gap in acquisition, not an
interpretation gap: a classifier consuming candidates from usable sites is
correct and useful without it. A domain-pinned search fallback and/or an
operator stale-root review queue (fed by exactly the signals already
persisted: DNS_FAILURE, downgrade-redirect-to-error-host, zero-signal full
crawls, connect-timeout roots) is now justified by two passes — to design
after 2B-2 starts, not before.

### Remaining blockers

**None.** No defect in this cohort prevents safe, reliable bounded handoff.

### Non-blocking follow-ups (empirically justified, need not precede 2B-2)

1. **Content-hash dedupe at handoff assembly** — Sorbonne's `?RH=` variants
   (3 URLs, 1 sha256) and INSA's verbatim dual-root duplication both waste
   top-8 slots; `response_sha256` already identifies them. Handoff-time
   only; not in the ruleset, not in stored ranks.
2. **Programme-shape v2** (`bba`, bare `bachelor`, French `master`) —
   observed again (GEM #5–7, INSA #5, IPAG #2).
3. **News/event-shape v2** (`erasmus days`, category/archive pages) —
   observed again (IMS #3–7; Paris Cité category page at rank 1).
4. **OAuth/SSO-connector anchor hygiene** — GEM's 3 alumnforce
   `/api/v2/connect/start/*` fetches are pure waste and put public
   ephemeral OAuth state into append-only evidence (as BEFORE).
5. **http-only-claim residual** — the corrected engine bootstraps an http
   root honestly, but a robots.txt that 301s to https still ends
   `ROBOTS_UNREADABLE` (the gateway follows no redirect, by design). Both
   holdout http orgs recovered through an https sibling root; an
   organisation whose ONLY claim is http would still get zero acquisition.
   Measure the prevalence of http-only organisations among the 1,016 http
   claims before deciding whether this needs a deliberate, ADR-documented
   policy (e.g. https-upgrade of the bootstrap) — do not infer it.
6. **Future additional-country holdout** — both passes were French; the
   `en` pack fired but no non-French site has ever been crawled.
7. **Frozen BEFORE report prettier-formatting** — `npm run validate` fails
   at `format:check` on the committed BEFORE audit; owner decision (commit a
   formatting-only fix or exclude `docs/audits/` from prettier).

### Phase 2B-2 readiness

The BEFORE report's handoff shape stands: per organisation per root, at
most 8 candidates per track after content-hash dedupe, each carrying URL,
title, headings, bounded redacted excerpt, both track scores with full
signal explanations (including inheritance-veto provenance), `root_key`
provenance, run id and rule versions — no raw HTML, no contact data. In
this corrected cohort that set contains the correct useful unit for **every
technically usable organisation**, at rank 1 in 10 of 11.

---

## FINAL DECISION

### PROCEED TO PHASE 2B-2 WITH NON-BLOCKING FOLLOW-UPS

---

_Report artifact: `docs/audits/PHASE_2B_SHADOW_REVALIDATION_15_ORG_2026-08.md`
(uncommitted, for review). Git state at completion: `main` == `origin/main`
== `218bcdd…`, working tree clean except this file. No production code,
test, migration, weight, budget or dependency change. Phase 2B-2 remains
unimplemented. All BEFORE and AFTER shadow-run evidence retained
append-only in `nwf_pe`._
