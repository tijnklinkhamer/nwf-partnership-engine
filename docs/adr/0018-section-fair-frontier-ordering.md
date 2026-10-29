# ADR 0018 — Section-fair ordering among tied frontier candidates (fetch policy v8)

- **Status:** Proposed. LOCAL, OFFLINE implementation authorised by the OWNER
  (Track B, B1.1), and evaluated for LOCAL development acceptance only.
  **Not production-ready and not authorised for release.** The H1 host-cap
  regression (§8) is provisionally accepted for local evaluation, pending a
  separate host-cap policy review. Real-world improvement is unmeasured, and
  the release dependencies in §9 are open.
- **Date:** 2026-10-15
- **Phase:** Track B — Discovery & Research Quality, slice B1.1
- **Extends:** ADR 0004, ADR 0007, ADR 0008. **Supersedes nothing.**
- **Owner decision record:**
  `docs/evaluation/TRACK_B_B1_1_FRONTIER_SECTION_DIVERSITY_FETCH_POLICY_V8_OWNER_APPROVAL_V1.json`
- **Numbering:** 0017 is taken by the separate
  `docs/adr-0017-cloud-operator-read-model-publication` lineage (not present on
  this branch, and not touched); 0018 was verified free across every local
  branch before this file was written.

Claims are tagged as prior Phase 2B ADRs tag theirs: **FACT**,
**MEASUREMENT**, **DESIGN DECISION**, **UNKNOWN**.

---

## 1. The confirmed v7 defect

**FACT — the v7 comparator.** `Frontier.pickNext` at `6bbb84a`
(`orgunit-fetch-policy-v7`) orders candidates by, in strict precedence:

1. the **Track B floor**: while `trackBSelected < TRACK_B_FLOOR` (8) and at
   least one eligible entry has a Track B score `> 0`, only those entries are
   considered, ordered by Track B score descending, then by the general order;
2. **best-track frontier score**, descending (the max over tracks A and B of
   `score`, which may include a bounded inherited component);
3. **own evidence over purely inherited evidence** (`ownScore > 0` first);
4. **discovery source**: `SITEMAP` before `LINK`;
5. **canonical URL**, lexical ascending.

Keys 4 and 5 decided every tie. `trackBSelected` is advanced by the root
runner on a FETCHED attempt whose picked entry has a Track B score `> 0`;
every pick is removed from the frontier whatever its outcome.

**MEASUREMENT — alphabetical starvation (synthetic).** When hundreds of
zero-score sitemap URLs compete for the 34 page attempts left after the root,
key 5 hands the whole budget to the section that sorts first. In the
principal fixture (F01: 300 zero-score URLs in `/agenda/`, `/bibliotheque/`,
`/campus/`, `/formation/`; the student-life hub and its association listing
in `/vie-etudiante/`), v7 spends 33 of 34 picks on `/agenda/evenement-NNN`
and fetches **0 of 6** labelled targets. Because the hub's anchors are the
only route to the high-signal pages, missing the hub also hides pages the
scorer would have ranked first.

## 2. DESIGN DECISION — the v8 order

Keys 1–3 are **byte-for-byte v7's**. v8 inserts two keys between key 3 and
key 4, so they only ever order entries that v7's strict priorities leave
tied:

1. Track B floor (unchanged pool, unchanged Track B-score ordering)
2. best-track score, descending (unchanged)
3. own over inherited evidence (unchanged)
4. **fewest earlier picks of the entry's SECTION within the same
   strict-priority class** — NEW
5. **shallower path depth** (below any stripped locale prefix) — NEW
6. discovery source, `SITEMAP` before `LINK` (v7 key 4)
7. canonical URL, lexical ascending (v7 key 5)

Selection is a linear minimum scan, identical to `sort(compare)[0]` for a
total order. Key 7 is unique per entry, so the order is total.

### 2.1 Section identity — `frontierSectionOf(url)`

`key = hostname + "/" + first meaningful path segment`, `depth = segments
after any locale prefix`.

- **Hostname** is part of the key: two hosts never share a section. Scheme
  is not: `http` and `https` of one host are one section.
- Segments come from the landed `pathSegments` (decoded; empty segments from
  repeated or trailing slashes dropped; query and fragment ignored), then
  NFC-normalised and lower-cased with locale-INDEPENDENT `toLowerCase`.
  `/Vie-Etudiante/`, `/vie-%C3%A9tudiante/` and `/vie-étudiante/` therefore
  fold together as sections while staying distinct frontier entries — URL
  identity and dedup are untouched.
- **Locale prefix:** ONE leading segment is skipped if it is exactly a member
  of a closed list (the EU's 24 official languages plus `ca`, `eu`, `gl`,
  `no`, `nb`, `nn`), optionally followed by a two-letter region (`en-gb`,
  `pt_br`). `/fr/international/x` and `/international/x` are one section, and
  a site published wholly under `/en/` is not one giant section.
  - **Not every short segment is a locale.** `/ri/`, `/bu/`, `/ue/`, `/rh/`,
    `/eng/`, `/french/` stay sections (tested).
  - **Known collisions, accepted:** `/it/` as an IT department and `/eu/` as
    "European Union" are read as locales. The cost is bounded to TIE ORDER
    (that department's pages spread over several sections); a wrong strip
    never changes a score, an eligibility or a budget.
  - Translated mirrors share a section **deliberately**: alternating between
    `/fr/x` and `/en/x` would spend the budget on translations of one page.
- No external lookup, no public-suffix list, no DNS — a pure string function.

### 2.2 Fair-selection state

`sectionPicks: Map<priorityClass + NUL + sectionKey, number>`, per `Frontier`
instance (one per root).

- **Advanced on SELECTION, in `pickNext`, never on fetch outcome.** The
  frontier never learns outcomes, the page budget already counts attempts
  regardless of outcome, and a picked entry leaves the frontier whatever
  happens. Counting successes instead would let a section whose pages all
  fail or are blocked keep a zero count and **win every later tie** — the
  exact starvation v8 exists to remove, caused by failures. Tested.
- **Keyed by strict-priority class** (`bestScore|ownFlag`), not by section
  alone: two tied entries always share a class, so they compare counts of the
  same thing, and picks of strong pages do not reorder the zero-score ties.
  Tested.
- Read in the comparator, written only after the choice — no comparator side
  effects.
- **Bounded:** at most one new key per pick, so at most 35 keys per root. No
  state outlives a root.
- **Late sections** start at 0 and therefore win ties until they have caught
  up; sections that run out simply stop being candidates. No global
  quota, no reservation, no lookahead.

### 2.3 Track B floor

The floor's activation condition, pool (`Track B score > 0`), Track B-score
ordering and the root runner's counter are unchanged. Only ties on
`(Track B score, best score, own flag)` inside the pool are now ordered by
keys 4–7. A zero-Track-B entry never enters the floor pool (tested).

## 3. Alternatives rejected

- **Global section counters (not per class).** Couples priority classes: a
  run of strong `/international/` pages would push that section's zero-score
  pages behind every other section's. Simpler, but not "fairness among
  equivalent candidates".
- **Counting on fetch success.** Lets failing sections monopolise ties (§2.2).
- **Randomised tie-breaking.** Non-reproducible; forbidden by the
  determinism requirement and by ADR 0008.
- **Pure breadth-first (depth before fairness).** Ignores sections: a deep
  noisy tree and a shallow one would still be visited section-blind.
- **Keyword boosts for hubs** (`vie-etudiante`, `associations`,
  `studentenleven`…). A scoring/vocabulary change — B1.2 territory, with its
  own rule-version and frozen-evaluation impact. Not done.
- **Reserving budget per section / quotas.** Changes the budget contract.
  Not done.
- **Semantic section classifier.** Disproportionate; the locale list is the
  smallest justified adjustment to a first-segment rule.

## 4. Determinism

**DESIGN DECISION.** No randomness, clock, locale-sensitive comparison, or
dependence on Map/Set iteration order: every key is a number or a string
compared with `<`/`>`, and the minimum is taken over a total order.

**MEASUREMENT.** All 29 fixtures produce identical pick sequences on repeat
and under five fixed insertion-order permutations of both sitemap entries
and page links (reverse, rotate, interleave, odd/even, a constant-seed LCG
shuffle). A direct frontier test does the same over 20 URLs.

**FACT — a pre-existing, unchanged caveat.** Frontier SCORES depend on
admission order in one place: a URL inherits from a section-root ancestor
only if that ancestor was admitted first (`nearestAncestors`). That is v7
scoring behaviour, untouched by B1.1, and identical under both policies.

## 5. Budget and security invariants — unchanged

No change to: 35 page attempts, 60 total requests, 8 hosts, the Track B
floor of 8, sitemap caps, pacing, robots evaluation, the site-policy
continuation and retry rules, the circuit breaker, root scope, host policy,
the gateway, SSRF/address controls, admission (`add`) or scoring. Production
diff: `frontier.ts` (ordering) and `policy.ts` (version string + prose).
**MEASUREMENT:** page attempts are identical under v7 and v8 on every
fixture; no fixture exceeds 35 / 60 / 8; no off-domain URL is ever
discovered or requested.

**FACT — one second-order budget effect, inside the cap.** Spreading ties
across HOSTS reaches more hosts sooner, and each new host costs one
site-policy request. F04 (10 first-party hosts): v7 used 2 hosts and 38
requests, v8 used 8 hosts and 44 requests. F13: 2→4 hosts, 38→40 requests.
H1 (§8): v7 used 4 hosts and 40 requests, v8 8 hosts and 44. The
60-request ceiling and the 8-host cap are respected, but **v8 can spend the
host cap on noise subdomains and so lose a relevant target discovered
later**. H1 does exactly that (§8).

## 6. Provenance — `orgunit-fetch-policy-v8`

**DESIGN DECISION.** A v8 run and a v7 run of the same root, with
byte-identical network answers, can request different pages within the same
budget. `fetch_policy_version` is how a reader knows which selection
behaviour produced a set of observations, so the order is part of the
policy. `FETCH_POLICY_VERSION` → `orgunit-fetch-policy-v8`.

Every v1–v7 run keeps its version on its run row and every observation, for
ever. `assertRunIsExecutable` refuses to resume a v7 run under v8; it can
only be read. **No migration** — migration 0007 places no enumeration on
`fetch_policy_version`, and `'orgunit-fetch-policy-v8'` is 23 characters.
The signal-rule version (`orgunit-signal-rules-v1`) is unchanged: no score
moved. Historical classifier freezes bind the acquisition run's version, not
this constant (`orgunitClassifyHistoricalFetchPolicyProvenance.test.ts`).

## 7. Synthetic evaluation

**Method.** `src/test/harness/frontierReplay/simulate.ts` models one root's
loop with `rootRunner.ts`'s control flow and the real admission gates,
circuit breaker and budget constants. Both policies receive identical
sites. The v7 baseline is a test-only copy of the v7 module whose admission,
section-root bookkeeping, comparator and Track B floor logic are unchanged
(its header lists every non-behavioural difference). Its behavioural
equivalence is shown, not asserted: it reproduces pick-for-pick the golden
sequences the REAL v7 `Frontier` produced on all 29 fixtures (captured at
`6bbb84a` before the edit), and on 2026-10-15 a byte-identical copy of the
real v7 module was re-run and again reproduced all 29, plus the separately
captured H1 sequence. Simplifications (one request per site-policy file, no
pacing) are identical for both policies. **Synthetic precision/recall do not
establish real-world performance.**

**LIMITATION: the request-cost model.** The simulator charges exactly ONE
request per site-policy file. The real runner reserves, and can spend, up
to THREE per new host: one same-registrable-domain continuation and one
bounded transport retry (ADR 0013/0015/0016). Pacing is not modelled.
Request totals below are therefore lower bounds on what a real run would
spend, and the gap grows with the number of hosts, which is exactly what v8
increases (F04, F13, H1). This simplification leaves page-attempt and
target counts unaffected only while the 60-request ceiling does not bind.
Whether it binds on real sites is **UNKNOWN** (§8).

**LABELLING.** `relevant` and `highRelevance` are synthetic labels set by
each fixture's author. Most fixtures label a handful of distinct pages.
F15 is labelled in **two tiers**. Tier 1 is the section's landing page
(`highRelevance`, 1 page). Tier 2 is 25 link-free, structurally identical
member pages (`/<section>/association-001..025`), which count as
`relevant` but not as `highRelevance`. The "high-rel" column counts tier 1
only.

Relevant targets fetched (v7 → v8), with discovered-but-not-fetched kept
separate in the test pins:

| fixture                         | targets |  v7 |  v8 |   Δ pp | high-rel v7/v8 | lost to v8 |
| ------------------------------- | ------: | --: | --: | -----: | -------------- | ---------: |
| F01 alphabetical cluster, hub   |       6 |   0 |   6 | +100.0 | 0/3 → 3/3      |          0 |
| F02 600 zero-score URLs         |       2 |   0 |   1 |  +50.0 | 0/1 → 0/1      |          0 |
| F03 two buried hubs             |       4 |   0 |   0 |    0.0 | 0/2 → 0/2      |          0 |
| F04 ten hosts                   |       2 |   0 |   2 | +100.0 | 0/1 → 1/1      |          0 |
| F05 one noisy section           |       2 |   0 |   2 | +100.0 | 0/1 → 1/1      |          0 |
| F06 positive-score ties         |       3 |   0 |   3 | +100.0 | 0/2 → 2/2      |          0 |
| F07 strongly unequal scores     |       4 |   4 |   4 |    0.0 | 3/3 → 3/3      |          0 |
| F08A Track B floor (12 B)       |      12 |  12 |  12 |    0.0 | 12 → 12        |          0 |
| F08B Track B scarce (3 B)       |       3 |   3 |   3 |    0.0 | 3 → 3          |          0 |
| F09 locale prefixes             |       4 |   0 |   4 | +100.0 | 0/2 → 2/2      |          0 |
| F10 NL / DE / ES native paths   |   3 × 3 |   0 |   3 | +100.0 | 0/2 → 2/2 each |          0 |
| F11 duplicates and redirects    |       3 |   1 |   3 |  +66.7 | 0/1 → 1/1      |          0 |
| F12 small specialist site       |       2 |   2 |   2 |    0.0 | 1/1 → 1/1      |          0 |
| F13 large university (~2,700)   |       6 |   0 |   4 |  +66.7 | 0/3 → 2/3      |          0 |
| F14 nothing relevant            |       0 |   0 |   0 |    n/a | —              |          0 |
| F15 sweep, rank 1 (ADVERSARIAL) |      26 |  26 |   4 |  −84.6 | 1/1 → 1/1      |     **22** |
| F15 sweep, rank 2 (ADVERSARIAL) |      26 |   9 |   4 |  −19.2 | 1/1 → 1/1      |      **5** |
| F15 sweep, ranks 3–7            |      26 |   0 |   4 |  +15.4 | 0/1 → 1/1      |          0 |
| F15 sweep, ranks 8–9            |      26 |   0 |   3 |  +11.5 | 0/1 → 1/1      |          0 |
| F16 changing eligibility        |       6 |   0 |   6 | +100.0 | 0/1 → 1/1      |          0 |
| F17 exact budget                |       1 |   1 |   1 |    0.0 | 1/1 → 1/1      |          0 |
| F18 off-domain association      |       1 |   0 |   1 | +100.0 | 0/1 → 1/1      |          0 |
| **H1 host cap spent on noise**  |       2 |   2 |   1 |  −50.0 | **1/1 → 0/1**  |      **1** |

H1 is pinned separately from the 29 coverage fixtures, with its own golden
v7 sequence captured from the real v7 module, so the original golden file's
provenance is untouched. See §8.

## 8. Known trade-offs and limitations

- **Concentrated relevance (F15): a synthetic coverage trade-off.** When
  relevant pages cluster in one zero-score section, v7 harvests them only
  if that section sorts first or second. Across all nine alphabetical
  placements v7 fetches 35 targets (26 + 9 + 0 × 7) and v8 fetches 34
  (4 × 7 + 3 × 2). The totals are roughly equal, but v7 is a placement
  lottery and v8 is placement-invariant. v8 fetches the tier-1 landing page
  in 9 of 9 placements, and v7 in 2 of 9 (ranks 1 and 2). **v8 loses 27
  targets at ranks 1–2 (22 + 5), all of them tier-2 member pages.**
  - Those member pages are **interchangeable synthetic leaves**: link-free,
    structurally identical, with no independent identity. That is why the
    loss is accepted FOR LOCAL DEVELOPMENT EVALUATION.
  - **It does not establish that the loss is commercially harmless.** On a
    real site, each association page may be a DISTINCT student
    organisation, and so a distinct prospective distribution organisation.
    Fetching a landing page would not offset losing 22 of them. The fixture
    cannot measure that value, and nothing here says that losing distinct
    real associations would be acceptable.

- **H1, the host cap spent on noise: a measured v8 REGRESSION, provisionally
  accepted for local evaluation only.** The fixture is
  `h1HostCapLimitation()`. It has one primary host (`www.`, 15 zero-score
  sitemap URLs) and eight zero-score subdomains (10 sitemap URLs each). It
  also has a POSITIVE target: an "International Office" page on a tenth
  host, scoring Track A 12 on its own evidence. The target is listed nowhere
  and is linked only from the third `/accueil/` page. Both policies run
  under the same budgets (35 / 60 / 8).

  |                                   | v7                   | v8                                  |
  | --------------------------------- | -------------------- | ----------------------------------- |
  | URLs discovered (target included) | 97 (yes)             | 97 (yes)                            |
  | linking page selected at pick     | 3                    | 19                                  |
  | 8-host cap full by pick           | never (4 hosts used) | 9 (`www` + seven `x-*` subdomains)  |
  | target selected / attempted       | pick 4, fetched      | never: its host is never admissible |
  | page attempts / stop reason       | 35 / page budget     | 35 / page budget                    |
  | site-policy requests              | 4                    | 8                                   |
  | total requests                    | 40                   | 44                                  |
  | relevant fetched (high-relevance) | 2 of 2 (1 of 1)      | 1 of 2 (**0 of 1**)                 |

  Both policies DISCOVER the target. Under v8 it is discovered ten picks
  after the cap filled, so it never appears in an eligible pool: host
  admission excludes it, and nothing out-ranks it. The lost target is the
  fixture's only high-relevance page.
  - **Not fixable by order alone without losing F04.** Delaying new hosts
    would forfeit F04's gain, which is a hub on an alphabetically late
    subdomain.
  - **Retained deliberately, for local development evaluation.** The 8-host
    cap is unchanged, and no host reservation, admissibility rule or
    fallback scheduling was added. H1 is pinned as a permanent offline
    regression test ("KNOWN LIMITATION H1" in
    `orgunitFrontierReplay.test.ts`), and that test asserts the loss rather
    than its absence.
  - **Production release requires a separate review** of whether host-cap
    mitigation is necessary. Accepting H1 here does not accept the live
    risk.

- **The robots and request-budget cost of host spread is UNKNOWN on real
  sites.** Each additional host costs one site-policy resolution. The
  simulator counts one request for each (H1: v7 4, v8 8). The real runner
  can spend up to three per new host, so in H1 v8's eight hosts could cost
  up to 24 site-policy requests, against v7's 12. With 35 page attempts and
  one sitemap document, that is exactly the 60-request ceiling. On a real
  site with more sitemap documents, continuations or retries, the REQUEST
  ceiling rather than the page budget could therefore end a v8 root early,
  with fewer pages read. The simulator cannot show this, and it has not
  been measured.

- **Buried hubs stay buried (F03).** Neither policy reaches a hub that sorts
  behind 20 siblings in its own section. Fairness spreads attempts across
  sections, not within them.
- **No vocabulary change.** NL/DE/ES hubs are reached sooner, but native
  targets still score 0 (B1.2).

- **Local acceptance is not live readiness.** Every number in §7 and §8 is
  synthetic and offline. v8 is not universally better than v7. It is better
  on the alphabetical-starvation shapes it was built for, equal where the
  strict priorities decide, and worse on F15 ranks 1–2 and on H1. Whether it
  improves discovery on real institutions is **UNKNOWN** until a separately
  authorised real-world validation, which itself depends on §9.

## 9. Deployment dependencies

- **Track A (Operator repository):** `src/domain/provenance.ts` holds a
  CLOSED `FETCH_POLICY_VERSIONS` tuple ending at v7, and
  `src/api/schemas/common.ts` parses `fetch_policy_version` with
  `z.enum(FETCH_POLICY_VERSIONS)`. A v8 row would fail that parse. Track A
  must add `orgunit-fetch-policy-v8` (and its short label, delta text and
  capability row) **before** any v8 run is ingested or published. Not
  implemented here.
- **B3.0 research-cohort protection** must land and be reviewed before any
  live research or live validation under v8.
- **H1 host-cap review:** a separate decision on whether host-cap
  mitigation is required before any production release of v8 (§8).
- **Real-world validation:** improvement on real sites is unmeasured.
- No v8 live run, downstream ingestion or publication is authorised by this
  ADR.

**Verification record (2026-10-15, local).** Offline, the replay suite ran,
including H1. For integration, the five integration files that assert the
stamped policy version (eight database-row assertions and one constant
assertion) ran against a single EPHEMERAL PostgreSQL 16 container. The
container was created for that run, with a tmpfs data directory and a
loopback-only dynamic port, and destroyed afterwards. The run used no
persistent cluster and no live network. The shared `nwf_pe_postgres`
cluster is not an authorised B1.1 test target and was not used.

## 10. Rollback

Revert the two production files: `policy.ts` returns to v7, and
`frontier.ts` to the v7 comparator. Any v8 evidence created in the meantime
stays v8 for ever and remains readable; a v8 run cannot be resumed under a
v7 build (`assertRunIsExecutable`), exactly as for every earlier bump.

## 11. What this ADR does not authorise

No live HTTP, database write, research run, classifier attempt or provider
call. No signal, vocabulary or rule-version change. No budget, host-cap,
floor, pacing, robots, gateway or scope change. No change to `rootRunner.ts`,
`candidates.ts` (F8b handoff ranking stays as is), `classify/` or
`signals/`. No migration. No off-domain discovery, micro-organisation
persistence or batch orchestration. No Operator-repository edit.
