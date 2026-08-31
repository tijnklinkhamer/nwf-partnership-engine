# Phase 2B — 15-Organisation Shadow Validation & Red-Team (2026-08-27)

Independent empirical shadow validation of the complete landed deterministic
acquisition engine against the original 15-organisation French holdout.
Observation only: **no production code, migration, or configuration was
changed during this phase.** All evidence cited below is append-only research
evidence in the working database (`nwf_pe`) and is deliberately retained.

**VERDICT (details in §Recommendation): CORRECT DETERMINISTIC ACQUISITION
BEFORE PHASE 2B-2.** Zero trust violations, zero PII leakage, zero silent
zeros — this is NOT a safety stop. Where the pipeline ran to completion the
deterministic ranking put a genuinely useful page at **rank 1 in 6 of 6
organisations**. But three engine defects — two of them systematic — destroyed
or blocked the result for 6 of the 12 technically-live organisations, and all
three must be corrected before a semantic classifier is built on top.

---

## 1. Frozen system identity

| item                                           | value                                                         |
| ---------------------------------------------- | ------------------------------------------------------------- |
| baseline SHA (HEAD == origin/main, clean tree) | `6c80e5fbec2f7c51a7312a00456063b0a2f49851`                    |
| migrations applied (working `nwf_pe`)          | 0001–0008, sequential, checksums intact                       |
| `orgunit_page_candidates_score_chk`            | absent (migration 0008 verified live)                         |
| `candidate_score`                              | `numeric(8,4) NOT NULL`, signed values verified persisted     |
| fetch policy                                   | `orgunit-fetch-policy-v1` (30 s connect / 45 s total / 5 MiB) |
| signal ruleset                                 | `orgunit-signal-rules-v1`                                     |
| extraction rule version                        | as landed in 2B-1c/1e (`main_text` cap 40,000)                |
| CLI                                            | `nwf-pe orgunits discover --organisation-id <uuid> --execute` |

Frozen constants confirmed unmodified in `orchestrator/constants.ts`:
MAX_PAGE_ATTEMPTS_PER_ROOT 35, MAX_TOTAL_REQUESTS_PER_ROOT 60,
MAX_HOSTS_PER_ROOT 8, TRACK_B_FLOOR 8, sitemap 5 docs / depth 2 / 3000 URLs /
5 MiB, MIN_HOST_PACING 1.2 s, redirect-continuation hops 5, anchors/page 200,
frontier 5000, boilerplate-differencing minimum 3 pages, circuit-breaker
transient threshold 3.

## 2. Holdout identity — recovered and verified, not reconstructed from memory

The holdout membership is not stored in any committed artifact (ADR 0004 §3
records the totals and named findings only; the scratch tooling was deleted).
What **is** durably recorded (project memory `phase2b-holdout-2026-08-24`,
written by the original audit session) is the **deterministic selection
rule**: `md5(eche_row_key)` ascending rank within four strata over FR ECHE
rows — FR-register **agree** / FR-register **disagree** / **EWP-match-no-FR**
/ **EWP-no-match** — with the three disagreement organisations contributing
two roots each (18 roots), and the three disagreement members named (IPAG,
Université Paris Cité, Sorbonne Nouvelle).

The rule was **re-executed** against the unchanged evidence (working-database
`website_claims`, which reproduce Phase 1D's 65/10/13 comparison exactly, and
`data/measurement.json` per-row EWP verdicts) with allocation 4/3/4/4 (the
disagree stratum size 3 is pinned by the 18-root arithmetic: 12×1 + 3×2). The
recovery is **verified by six independent identity checks**:

- DISAGREE stratum top-3 of 10 = IPAG, Université Paris Cité, Sorbonne
  Nouvelle — exactly the three recorded members (P ≈ 1/120 by chance);
- NOMATCH stratum top-4 contains **Agifen** (`www-ifen.fr`, the recorded
  typo-DNS case), **Lycée Professionnel François Rabelais** (Douai, the
  recorded decommissioned-redirect case) and **BTP CFA Occitanie**
  (`btpcfalr.com`, the recorded lapsed-domain case).

All six independently-recorded members fall exactly where the rule puts them.

### The 15 organisations

| #   | stratum   | eche_row_key           | organisation                          | root claim(s)                                                                           |
| --- | --------- | ---------------------- | ------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | AGREE     | F EVRY04\|999850296    | Université d'Évry-Val-d'Essonne       | `http://www.univ-evry.fr/` (ECHE) + `https://www.univ-evry.fr/accueil.html` (FR)        |
| 2   | AGREE     | F MAYOTTE01\|912525949 | CUFR de Mayotte                       | `http://www.univ-mayotte.fr/` (ECHE) + `https://www.univ-mayotte.fr/fr/index.html` (FR) |
| 3   | AGREE     | F ROUEN06\|999465788   | INSA Rouen                            | `https://www.insa-rouen.fr/` ×2 (ECHE + FR)                                             |
| 4   | AGREE     | F TOULOUS16\|999892491 | ISAE-SUPAERO                          | `https://www.isae-supaero.fr/fr/` (ECHE) + `…/` (FR)                                    |
| 5   | DISAGREE  | F PARIS105\|949302432  | IPAG                                  | `https://www.ipag.fr/` (ECHE) + `https://www.ipag.edu/` (FR)                            |
| 6   | DISAGREE  | F PARIS482\|897691060  | Université Paris Cité                 | `https://u-paris.fr/` (ECHE) + `https://u-pariscite.fr/` (FR)                           |
| 7   | DISAGREE  | F PARIS003\|999885119  | Sorbonne Nouvelle                     | `https://www.univ-paris3.fr/` (ECHE) + `https://www.sorbonne-nouvelle.fr/` (FR)         |
| 8   | EWP_NO_FR | F DIJON35\|949637858   | IRTESS Dijon                          | `https://www.irtess.fr/`                                                                |
| 9   | EWP_NO_FR | F RENNES52\|949270228  | IFPEK Rennes                          | `https://www.ifpek.org/`                                                                |
| 10  | EWP_NO_FR | F GRENOBL21\|915102366 | Grenoble École de Management          | `https://www.grenoble-em.com/`                                                          |
| 11  | EWP_NO_FR | F PARIS525\|879184333  | ESLSCA                                | `https://www.eslsca.fr/`                                                                |
| 12  | NOMATCH   | F LE-HAVR19\|934630503 | Agifen                                | `https://www-ifen.fr/` (typo domain)                                                    |
| 13  | NOMATCH   | F DOUAI15\|948581431   | Lycée Prof. François Rabelais (Douai) | `https://lprabelais-douai.etab.ac-lille.fr/`                                            |
| 14  | NOMATCH   | F MONTPEL58\|932096087 | BTP CFA Occitanie                     | `https://www.btpcfalr.com/` (lapsed)                                                    |
| 15  | NOMATCH   | F NANTES79\|924638533  | IMS Nantes                            | `https://www.ims-nantes.com/`                                                           |

**Root-count note (historical honesty):** the historical holdout counted 18
roots (AGREE organisations as one root). The landed orchestrator deliberately
runs **every** structurally-valid claim independently, including same-domain
AGREE pairs, so the current engine resolves **22 claim roots** for the same
15 organisations. Root-level results below use the engine's own semantics.

## 3. Evaluation rubric (frozen before the first live run)

Per organisation: identity; independent root count and provenance; roots
attempted; per-root terminal reason; requests by type (root / link / robots /
sitemap / redirect-continuation); page attempts; hosts; robots outcome;
sitemap availability and contribution; redirect behaviour; circuit-breaker
activity; budget state; Track A/B pages selected; persisted evidence and
candidate rows; candidate scores; top candidates per track; whether a known
useful target-area page was reached; top-5 / top-8 membership; failure class;
notes. "Useful partner-unit area" = an international / mobility / Erasmus
office-or-service page (Track A) or a language-centre / language-department /
FLE / LANSAD / CRL unit page (Track B) belonging to the organisation, judged
manually from the engine's own persisted evidence only (no assisted fetching).
Success criteria were not altered after results were seen.

## 4. Canary

**Organisation:** IRTESS Dijon (run `a0c629e8`). Chosen as a neutral canary:
single live claim root, ordinary mid-size institution (regional social-work
institute), not a flagship university, not one of the historically broken
domains. **Safety result: PASS on every invariant** — honest COMPLETED run;
one completion row; budgets enforced (35/35 pages, 40/60 requests); all
requests inside `irtess.fr`; no schema error; a **negative candidate score
(−3) persisted without error, validating migration 0008 in production**; no
raw body anywhere; 0 literal contact values with `[EMAIL]`/`[PHONE]` markers
present (redaction demonstrably ran). Performance: Track A rank 1 =
`/partenaires/erasmus/` (score 9) — a top-1 useful hit.

## 5. Primary per-organisation result table

Requests = engine total for the organisation (all roots). "Useful reached" =
a useful-area page **fetched AND persisted with candidate ranks** (the
engine's actual deliverable). Fetch-level reach shown when different.

| Organisation      | Live root?               | Useful reached?    | A reached                                       | B reached                        | Top-5 | Top-8 | Req | Pages | Sitemap material?                             | Failure class       | Notes                                                                                                     |
| ----------------- | ------------------------ | ------------------ | ----------------------------------------------- | -------------------------------- | ----- | ----- | --- | ----- | --------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------- |
| IRTESS (canary)   | yes                      | **YES** (A#1)      | yes                                             | no B target                      | YES   | YES   | 40  | 35    | no (2 docs, 0 useful)                         | —                   | WooCommerce `?add-to-cart=` chains ate ~½ budget                                                          |
| Évry              | yes                      | no — 0 requests    | no                                              | no                               | no    | no    | 0   | 0     | —                                             | **H** (defect 1)    | http ECHE root refused at robots bootstrap; healthy FR root suppressed                                    |
| Mayotte           | yes                      | no — 0 requests    | no                                              | no                               | no    | no    | 0   | 0     | —                                             | **H** (defect 1)    | identical to Évry                                                                                         |
| INSA Rouen        | yes                      | **YES** (A#1=22)   | yes                                             | **yes** (FLE B#1=12)             | YES   | YES   | 74  | 70    | no (0 URLs)                                   | —                   | dual same-domain roots duplicated the whole crawl                                                         |
| ISAE-SUPAERO      | yes                      | no — evidence lost | fetch-level yes (SRI page, langues dept)        | fetch-level yes                  | no    | no    | 41  | ~36   | no                                            | **H** (defects 2+3) | 26/41 requests burned by `--><!--` anchor loop; then char-count abort                                     |
| IPAG              | yes                      | no — evidence lost | fetch-level yes (mobility-team page)            | —                                | no    | no    | 38  | 35    | yes (root 2)                                  | **H** (defect 2)    | ipag.fr robots 301 cross-domain → honest 1-req stop; ipag.edu crawl succeeded then persistence aborted    |
| Paris Cité        | yes                      | no — evidence lost | fetch-level yes (DRI aid pages, Welcome Desk)   | —                                | no    | no    | 39  | 35    | no                                            | **H** (defect 2)    | u-pariscite.fr root suppressed                                                                            |
| Sorbonne Nouvelle | yes                      | **YES** (A#1=12)   | yes                                             | **yes** (LEA 15, UFR Langues 12) | YES   | YES   | 38  | 35    | no                                            | —                   | univ-paris3.fr robots 301 cross-domain → honest stop; `?RH=` duplicates flood top-8                       |
| IFPEK             | yes                      | no — evidence lost | fetch-level yes (`/relations-internationales/`) | —                                | no    | no    | 41  | 35    | no                                            | **H** (defect 2)    | char-count abort                                                                                          |
| Grenoble EM       | yes                      | **YES** (A#1=12)   | yes                                             | no B target found                | YES   | YES   | 38  | 35    | no                                            | —                   | intl-student integration TEAM page at #1; BBA programme leak #5–7; alumni-host OAuth URLs wasted requests |
| ESLSCA            | yes                      | **YES** (A#1=15)   | yes                                             | no B target                      | YES   | YES   | 38  | 35    | **yes** (546 URLs; a rank-1 came via sitemap) | —                   | blog noise below rank 2                                                                                   |
| Agifen            | **no** (DNS)             | n/a                | —                                               | —                                | —     | —     | 1   | 0     | —                                             | **A**               | typo domain `www-ifen.fr`: DNS_FAILURE, honest 1-request stop                                             |
| Rabelais Douai    | **no** (decommissioned)  | n/a                | —                                               | —                                | —     | —     | 3   | 1     | —                                             | **A**               | 302 → `http://erreur.etab.ac-lille.fr/`; https→http downgrade correctly never followed                    |
| BTP CFA Occitanie | **no** (domain squatted) | n/a                | —                                               | —                                | —     | —     | 37  | 35    | no                                            | **A**               | lapsed domain is now an SEO content farm; engine spent full budget; every score 0 (no false positives)    |
| IMS Nantes        | yes                      | **YES** (A#1=13)   | yes                                             | no B target                      | YES   | YES   | 41  | 35    | partly (5 docs, 116 URLs)                     | —                   | Erasmus-Days news items at #3–7 (score 9)                                                                 |

## 6. Aggregate metrics

| metric                                                                  | value                                                                                                                                                                        |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| organisations run / holdout                                             | 15/15 (one research run each; 15 runs total)                                                                                                                                 |
| roots resolvable / attempted                                            | 22 / 16 (6 suppressed by defects 1–2, see below)                                                                                                                             |
| **useful-unit acquisition recall (persisted candidates)**               | **6/15 (40%)**                                                                                                                                                               |
| **live-site useful-unit recall**                                        | **6/12 (50%)**                                                                                                                                                               |
| fetch-level useful-area reach among live sites (diagnostic)             | **10/12 (83%)** — ISAE, IPAG, Paris Cité, IFPEK reached it and lost it to defect 2; Évry, Mayotte never started (defect 1)                                                   |
| top-5 recall overall / among live sites                                 | 6/15 (40%) / 6/12 (50%)                                                                                                                                                      |
| **top-5 recall among organisations with a completed candidate set**     | **6/6 (100%), all at rank 1**                                                                                                                                                |
| top-8 recall (same three bases)                                         | 6/15, 6/12, 6/6                                                                                                                                                              |
| Track A success (where pipeline completed, live)                        | 6/6                                                                                                                                                                          |
| Track B success where a relevant B target exists and pipeline completed | 2/2 (INSA FLE; Sorbonne Nouvelle LEA + UFR Langues) — plus ISAE fetched its langues-dept and FLE pages before defect 2 destroyed them                                        |
| Track B floor (8) activation                                            | never reached 8; max B-selected = 4 (Sorbonne); floor schedules only viable B URLs so it never wasted budget; most sites simply had <8 viable B URLs                         |
| median / mean / max requests per organisation                           | 38 / 36.1 / 74 (INSA dual root) — total 469 for the whole holdout                                                                                                            |
| median page attempts per run (runs with any)                            | 33 (page budget of 35 binding on 8 roots)                                                                                                                                    |
| 60-request cap / 8-host cap / sitemap caps / frontier cap               | never hit (max 41 req/root, max 3 hosts, max 5 sitemap docs once, max frontier 857)                                                                                          |
| circuit-breaker openings                                                | 0 (no host produced 3 consecutive transient failures)                                                                                                                        |
| **silent-zero roots**                                                   | **0** at run level — every run has exactly one honest terminal completion; the 6 unattempted roots are attributed to the run-level FAILED error (see defect 1/2 suppression) |
| **trust violations**                                                    | **0** (nine-probe red team, §8)                                                                                                                                              |
| **PII leakage**                                                         | **0** (corpus-wide scan, §8)                                                                                                                                                 |

## 7. The three engine defects (all reproduced, all diagnosed)

### Defect 1 — http-scheme roots can never begin acquisition, and the refusal kills the whole organisation (BUG, blocking)

`checkRootScope` (`src/orgunits/web/url.ts`) permits an `http:` request only
when byte-identical to an `http:` root — by documented 2B-1b design, so the
root's own https-redirect could be observed. But the 2B-1e orchestrator's
first act on any root is the **robots.txt bootstrap**, which is below the
root, so it is refused (`REQUEST_SCHEME_DOWNGRADE`) before any socket. The
2B-1b "observe the http root itself" path is unreachable from the
orchestrator. Worse, the `WebGatewayRefusal` **escapes `runRootAcquisition`**
and `orchestrate.ts` wraps the whole root loop in one try/catch, so the
organisation's **other, healthy roots are suppressed** — directly violating
that module's own root-independence contract. Évry and Mayotte both produced
honest FAILED runs with **zero network activity**, their live https FR roots
never attempted. **Blast radius: 1,016 of 5,832 (17.4%) structurally-valid
ECHE claims are http.** Smallest correction: treat an http root's robots.txt
bootstrap as in-scope for that root (or upgrade the bootstrap to the root's
scheme policy deliberately, with an ADR), and catch per-root failures in the
root loop so one root's refusal cannot suppress another. Ruleset unaffected.

### Defect 2 — main_text_chars counts UTF-16 code units against a code-point CHECK; one astral character destroys a root's entire evidence (BUG, blocking)

`pageCollection.ts` (and `pageEvidence.ts` identically) persist
`main_text_chars = mainText.length` — **JS UTF-16 code units** — while
migration 0007's CHECK is `main_text_chars = length(main_text)` — **Postgres
code points**. Any astral character (emoji, some symbols) in extracted text
makes the two differ (`'\u{1F600}'.length === 2`, pg `length` = 1) and the
INSERT fails. Because candidate persistence follows evidence persistence, the
root ends with **partial evidence and zero candidates**, the escaping error
marks the run FAILED, and (as in defect 1) later roots are suppressed.
`capMainText`'s `slice(0, 40000)` can additionally split a surrogate pair.
**Hit 4 of 15 organisations (ISAE, IPAG, Paris Cité, IFPEK)** — post-hoc
inspection of their fetch observations and stranded evidence shows all four
had already reached genuinely useful pages (IPAG's mobility-team page,
Paris Cité's Direction-des-relations-internationales pages, IFPEK's
`/relations-internationales/`, ISAE's SRI + langues-department pages) before
persistence destroyed the result. ~159 live institutional requests were spent
with no retained deliverable. Smallest correction: compute the persisted
count with code-point semantics (e.g. `[...text].length` / count once,
truncate on a code-point boundary); no migration needed — the schema's
semantics ("characters") are the reasonable ones and the application should
match them. Same family as the 0008 score defect: a value-domain disagreement
first reachable in production.

### Defect 3 — a malformed-anchor artifact self-amplifies into an escalating URL loop (BUG, budget waste, bounded)

On ISAE-SUPAERO, an anchor containing an HTML-comment artifact produced URLs
ending in URL-encoded `--><!--`; each fetch of such a URL re-resolved the
same broken anchor **relative to itself**, appending another segment. The
site answered 301/200 alternately, so the identity index never collapsed the
growing variants. **26 of ISAE's 41 requests (63%)** were this loop. All
budgets held (no unbounded behaviour), but most of a root's budget can be
burned. Smallest correction: refuse anchor hrefs containing markup artifacts
(`<`, `>`, encoded comment sequences) at `anchors.ts`'s existing drop stage,
where `mailto:`/`tel:` are already dropped.

None of the three defects is a trust or PII failure; all three fail closed
and honestly.

## 8. Red-team results

**Trust (target 0 — result 0).** Verified by SQL over all 469 fetch
observations and 58 redirect observations: 0 fetches outside the root's
registrable domain; 0 explicit ports / userinfo / non-http(s) URLs; 0 http
requests (no downgrade ever requested); 0 service-subdomain hosts; 0
DISALLOWED verdicts with socket activity (0 DISALLOWED at all — no robots
policy in this sample blocked an attempted page); 0 credential-bearing or
malformed redirect targets persisted; 0 roots over the 8-host / 60-request /
35-page caps; 0 fetches under a (non-existent) promotion; 0 requests after a
circuit opened (none opened). All 5 cross-registrable-domain redirects
(ipag.fr→ipag.edu, univ-paris3.fr→sorbonne-nouvelle.fr, and 3 alumnforce.net
OAuth hops on GEM's alumni host) were **stopped, recorded, never followed**.
Rabelais-Douai's same-domain https→http redirect was recorded and never
followed. One observation, not a violation: GEM's frontier fetched three
`/api/v2/connect/start/<provider>` OAuth-connector URLs on the alumni host —
pure waste, and their (public, ephemeral) OAuth state parameters now sit in
append-only redirect evidence; worth an anchors-hygiene thought, not a rule
change.

**PII (target 0 — result 0).** Corpus-wide over all 274 persisted evidence
rows and 508 candidate signal payloads: 0 literal email addresses, 0
phone-shaped strings, 0 `mailto:`/`tel:` targets, in main text, titles,
headings and signals alike; 68 rows carry `[EMAIL]`/`[PHONE]` markers,
proving the redactor ran on real contact-bearing pages rather than never
being exercised.

**Run lifecycle.** 15 runs, 15 completions, 0 orphaned starts, 0 duplicate
completions; 9 COMPLETED / 6 FAILED, every FAILED carrying
`ORCHESTRATION_ERROR` with the true underlying message. One external note:
two CLI invocations were killed by the evaluation harness itself — one before
`startRun` (no trace, re-run cleanly) and one (IFPEK) after the engine had
already appended its own FAILED completion; neither produced an orphan.
Partial-state note: defect 2 leaves a root's earlier pages persisted (IPAG 1,
Paris Cité 15, IFPEK 4 rows) with no candidate rows — valid, append-only, but
a state the design didn't intend; the per-root persistence is per-page, not
transactional.

## 9. Mechanism analyses

**Discovery sources.** Of top-5 positive candidates, 30 arrived via anchors
(LINK) and 7 via SITEMAP; rank-1 positives: 9 LINK, 1 SITEMAP. Anchors do
most of the useful work. Sitemaps materially contributed for ESLSCA (546
URLs accepted; one rank-1 discovered via sitemap) and modestly for IMS (116
URLs); everywhere else they yielded 0 accepted URLs (missing, empty, or
redirected). Robots outcomes: ALLOWED 405, NO_ROBOTS_FILE 43, NOT_APPLICABLE
21 (policy/sitemap fetches); ROBOTS_UNREADABLE closed three roots honestly
(ipag.fr and univ-paris3.fr robots 301 cross-domain; Agifen DNS). Conservative
robots handling cost **no** recall in this sample: both unreadable-robots
organisations had their surviving domain as a second root. No crawl-delay
was observed binding beyond the 1.2 s floor.

**Candidate score distribution (signed persistence working).** Track A
(n=254): min −3, quartiles 0 / 1 / 4.75, max 22; 132 positive, 120 zero, 2
negative. Track B (n=254): min −6, max 15; 6 positive, 244 zero, 4 negative.
Negative scores separated exactly the junk they were designed to (cart,
login, binary links) and the signed domain never errored — migration 0008 is
validated end-to-end.

**Signals.** Most-fired: `A_INTERNATIONAL_GENERIC` (89 candidates),
`A_ERASMUS` (53), `A_FR_MOBILITE_INTERNATIONALE` (20),
`A_FR_ETUDIANTS_INTERNATIONAUX` (7). Track B rules that fired:
`B_FR_DEPARTEMENT_LANGUES`, `B_FR_UFR_LANGUES`, `B_FR_FLE` (Sorbonne + INSA).
`B_FR_CENTRE_DE_LANGUES`, `B_FR_LANSAD`, `B_FR_CRL` and all EN B rules never
fired — expected for a sample whose completed orgs are mostly schools without
language centres; a 15-org sample does not condemn them.
`NEG_ACADEMIC_RESEARCH_SCOPE` (veto) fired on 4 candidates — notably INSA's
`/recherche/relations-internationales`, whose **own-page** evidence still
scored 9 (rank 6): the veto kills inheritance, not own-page vocabulary, by
design; the semantic layer will see such pages and must be told so.
`NEG_LOGIN_AUTH` and `NEG_SHOPPING_CART` fired correctly (IRTESS cart −3).

**`A_INTERNATIONAL_GENERIC` (deliberately weak).** Net helpful: it is the
main reason generic-but-relevant section pages (`/international`,
`/ecole/international/`, category pages) entered the frontier at all, and at
weight 1–3 it never outranked a real unit page. Its noise (conference pages,
blog posts, Erasmus-Days news at scores 3–9) fills ranks 3–8 on sites whose
useful content is thin — visible, but it never displaced a useful page from
rank 1–2 in this sample.

**`NEG_PROGRAMME_SHAPE`.** Fired **zero times in 508 candidates** while
programme pages leaked into top-8 three times (GEM "International BBA" #5–7,
INSA "Master Erasmus Mundus" #5, ESLSCA blog masters). The observed leaks are
exactly its vocabulary gaps: `bba`, bare `bachelor`, bare `master` (the
actual French degree word) are not in its phrase list (`msc`, `mba`, `master
of`, `bachelor of`, …). Concrete, observed v2 evidence — not tuned here.

**Inheritance / selection bias.** Candidate-level inherited contributions:
0 (structurally impossible, verified in the persisted signals). At the
frontier level, of 93 LINK fetches whose parent URL was
international-shaped, only 9 had own-URLs without international vocabulary —
i.e. inherited-only selection was ~3% of page attempts, and of those 9 pages
3 produced Track A candidates (1 positive). The historical selection-bias
failure mode (one strong section flooding the budget with generic children)
**did not materialise**; bounded, decaying inheritance plus the research veto
appear sufficient in this sample.

**Budget efficiency & waste.** The 35-page budget is the binding constraint
on healthy sites (8 roots exhausted it); 60-request and 8-host caps never
bind. Measured waste, in budget order: ISAE's anchor-artifact loop (26 req);
IRTESS's WooCommerce `?add-to-cart=` chains (~17 of 35 pages; note these GETs
also mutate server-side cart state — a politeness concern worth dropping
`add-to-cart`-style cart-action query anchors); INSA's same-domain dual-root
duplication (37 req and 35 evidence rows duplicated verbatim); Sorbonne's
`?RH=` k.jsp variants (same document fetched under 2–3 query variants,
occupying up to 3 of 5 top-5 slots); IMS's WordPress `?ae_global_templates=`
fragments; GEM's alumni-host OAuth/article noise; BTP CFA's full budget on a
squatted domain (correctly scored all-zero — the deterministic layer cannot
know the domain no longer belongs to the organisation; an operator/stale-root
review signal, not a rules failure).

**Hostname-signal hypothesis (§39): NOT SUPPORTED by this sample.** No
`international.*` / `mobility.*` / `langues.*` host appeared anywhere in the
469 observations (hosts seen beyond `www.*`: `cerdim.irtess.fr`,
`alumni.grenoble-em.com` — the latter pure noise). No miss would have been
changed by hostname scoring: the misses are http-root policy (defect 1),
persistence (defect 2), and dead domains. Every live completed organisation
was already found via path/title vocabulary. Do not add hostname scoring on
this evidence.

## 10. Historical comparison (with definitional caveats)

Historical (2026-08-24, deleted tooling): crawl reach 13/15, deterministic
selector 12/15, top-5 11/15 (11/12 live). Current engine, same
organisations: persisted-deliverable recall 6/15, top-5 6/15 — **materially
worse, and the gap is fully explained**: 2 orgs blocked by the http-root
defect (the old tool had no such scope rule), 4 orgs destroyed by the
char-count persistence defect (the old tool had no database at all). At
fetch level — the closest analogue of the historical "crawl reach" — the
current engine reached the useful area on **10/12 live organisations**, in
line with history (historical 13/15 included at most 12 live sites; the same
3 external failures then as now). Where the comparison is genuinely
like-for-like (completed pipeline → ranking quality), the current ruleset is
**better than history suggests**: 6/6 rank-1 hits vs the historical 11/12
top-5-among-live. The regression is entirely in **productionised persistence
and root policy**, not in discovery or ranking.

## 11. Database state (append-only; deliberately retained)

Phase 1 tables unchanged: organisations 2,289; organisation_sources 2,289;
website_claims 6,227; website_source_snapshots 1; ewp_heis 3,472; ingest_runs 10. Phase 2B deltas (all from 0): orgunit_research_runs 0→15; completions
0→15; fetch_observations 0→469; redirect_observations 0→58; root_promotions
0→0; revocations 0→0; page_evidence 0→274; page_candidates 0→508. No research
row was updated or deleted; the two defective-run partial states are retained
as evidence.

## 12. Failure classification (every miss, one primary class)

- **A. External website failure (3):** Agifen (typo DNS), Rabelais Douai
  (decommissioned → error host via downgrade redirect), BTP CFA Occitanie
  (lapsed domain, now content farm). All three match their historical
  classification; none is an engine miss.
- **H. Orchestration defect (6):** Évry, Mayotte (defect 1); ISAE (defects
  3+2), IPAG, Paris Cité, IFPEK (defect 2).
- **B/C/D/E/F/G/I: none observed.** No stale-root-with-live-alternative miss
  (the two robots-unreadable ECHE roots had their successor domain as a
  second root), no robots-policy recall loss, no discovery-recall failure on
  any completed pipeline, no ranking failure (6/6 rank-1), no extraction
  failure, no unknowns.

## 13. Recommendation

### CORRECT DETERMINISTIC ACQUISITION BEFORE PHASE 2B-2 (class C)

Not class D: zero trust violations, zero PII leakage, zero silent zeros, and
honest lifecycle behaviour under every failure. Not class A/B: defects 1 and
2 are systematic (17.4% of all valid ECHE claims; any astral character on any
site), they destroyed or blocked 6 of 12 live organisations in this very
sample, and 2B-2 built now would inherit a pipeline that loses its own
deliverable after spending its network budget.

**Prioritised corrections (do not implement in this phase):**

1. **Defect 2 — code-point counting in evidence persistence** (BUG).
   Evidence: ISAE, IPAG, Paris Cité, IFPEK. Smallest fix: count and truncate
   `main_text` in code points in `pageCollection.ts`/`pageEvidence.ts`; no
   migration; no ruleset change. Also make per-root persistence one
   transaction (or per-page with candidates per page) so a late failure
   cannot strand evidence without ranks. Risk: low. Highest value — restores
   4/15 organisations outright.
2. **Defect 1 — http-root robots bootstrap + root-loop isolation** (BUG,
   two parts). Evidence: Évry, Mayotte; 1,016 claims repo-wide. Smallest
   fix: (a) admit `robots.txt` on the root's own scheme+host for an http
   root (a deliberate, ADR-documented widening of the exact-root exception),
   and (b) move the try/catch inside the per-root loop so a root's failure
   is recorded in its own summary and the next root still runs — restoring
   the root-independence the module already promises. Risk: low-moderate
   (part a touches trust-adjacent code; needs its own review). No ruleset
   change.
3. **Defect 3 — anchor-artifact hygiene** (BUG, small). Evidence: ISAE's 26
   wasted requests. Smallest fix: drop hrefs containing raw or encoded
   markup artifacts in `anchors.ts`. Risk: minimal.
4. **Candidate-list dedupe for the classifier handoff** (NEW CAPABILITY,
   non-blocking, could land with 2B-2 instead). Evidence: Sorbonne `?RH=`
   variants occupied 3 of top-5; `response_sha256` already identifies
   byte-identical documents. Dedupe by content hash at handoff-assembly
   time — not in the ruleset, not in the stored ranks.
5. **Cart-action anchor drop** (HEURISTIC/politeness, small). Evidence:
   IRTESS `?add-to-cart=` GETs mutate remote state and ate ~half a budget.

**Ruleset v2 (`orgunit-signal-rules-v2`): justified but NOT required before
the corrections land.** Observed-benefit additions only: extend
`NEG_PROGRAMME_SHAPE` with `bba` and boundary-safe bare `bachelor` / French
`master` (evidence: GEM #5–7, INSA #5); consider a news-date/`erasmus days`
shape negative (evidence: IMS #3–7). Nothing else in the ruleset showed an
observed failure; Track B rules that never fired stay untouched on N=15.
Weight changes: none justified.

**Search fallback:** 3 of 15 organisations (Agifen, Rabelais, BTP CFA) ended
at genuinely dead/foreign roots that no crawling policy can fix; a
domain-pinned search fallback (or an operator stale-root review queue fed by
exactly these signals: DNS_FAILURE, downgrade-redirect-to-error-host,
zero-signal full crawls) is now evidence-justified **to design later** — not
to build now.

**Phase 2B-2 readiness and handoff shape (after corrections):** per
organisation per root, at most 8 candidate pages per track after
content-hash dedupe, each carrying: URL; title; headings; the redacted
`main_text` excerpt (bounded); both track scores with the full
`matchedSignals`/`negativeSignals`/`vetoes` explanations (including "research
veto applied to inheritance" so the classifier knows why a page is present);
`root_key` provenance (which claim/promotion authorised it); run id and rule
versions. No raw HTML, no contact data, no frontier-internal state. The
evidence from the 6 completed organisations shows this set would have
contained the correct answer at rank 1 in every case.

---

_Report artifact: `docs/audits/PHASE_2B_SHADOW_VALIDATION_15_ORG_2026-08.md`
(uncommitted, for review). Git state at completion: `main` ==
`origin/main` == `6c80e5f…`, working tree clean except this file. No
production code, migration, or config change. All shadow-run evidence
retained append-only in `nwf_pe`._
