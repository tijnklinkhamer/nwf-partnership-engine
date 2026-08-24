# ADR 0004 — Bounded first-party web acquisition, and the trust foundation under it

- **Status:** Accepted
- **Decision date:** 2026-08-25
- **Phase:** 2B-1a
- **Supersedes / superseded by:** none

Every claim below is tagged:

- **FACT** — observable in a source artifact, in this repository, or in
  published documentation.
- **MEASUREMENT** — produced by running code over named inputs. Where the code
  no longer exists, that is stated explicitly and the number is treated as an
  audit finding, not a benchmark.
- **DESIGN DECISION** — a choice made here, with its reason.
- **UNKNOWN** — not established. Not to be restated later as if it were.

---

## 1. Context and question

Phases 1A–1D built a repository that reads official registers and stores what
they publish. It knows, per ECHE source row, what ECHE says the website is,
what the French Ministry register says it is, and — for 88 rows — whether those
two agree. It has never fetched an institution's website, deliberately, and
rule 11 in `CLAUDE.md` says so in as many words.

That is where the register data runs out. **No official register publishes an
institution's International Office, its language centre, or its student
associations.** Those are the organisational units that could actually
distribute NWF to language learners, and the only place they are published is
the institution's own site.

Phase 2B asks one question:

> Can software decide, deterministically and within a bounded budget, a small
> set of pages from an institution's own website that are worth reading — such
> that a later semantic phase interprets only that small remainder?

Phase 2B-1a — this slice — answers none of it. It establishes the trust
contract, the schema and the role under which that work will later happen, and
it deliberately ships **no code that fetches anything**.

---

## 2. DESIGN DECISION — the governing principle

> **SOFTWARE DECIDES WHERE THE MODEL MAY LOOK.**
> **THE MODEL INTERPRETS ONLY THE SMALL REMAINDER.**
> **SOFTWARE DECIDES WHAT HAPPENS NEXT.**

Every table introduced in migration 0007 sits on the software side of that
line. Not one of them stores an interpretation, a relevance verdict, or a
partnership decision. That is not a stylistic preference: it is what makes the
boundary auditable. If a deterministic rank and a semantic verdict shared a
table, nobody reading a row could tell which one produced it.

The pipeline the schema encodes:

```
trusted website claim  (Phase 1D evidence, unchanged)
        ↓
bounded first-party web acquisition       [2B-1b — not built]
        ↓
immutable fetch evidence                  orgunit_fetch_observations
        ↓
redirect evidence                         orgunit_redirect_observations
        ↓
page evidence                             orgunit_page_evidence
        ↓
ranked bounded pages worth reading        orgunit_page_candidates
        ↓
semantic unit classification              [2B-2 — NOT AUTHORISED]
```

---

## 3. What Phase 2A and the holdout established, and what they did not

**FACT — the Phase 2A audit's implementation does not exist.** A France
unit-discovery audit (25 organisations, 639 requests, 486 HTML pages) reported
`v3 = 93.0% precision / 97.6% recall`. It was run as scratch tooling and
deleted on completion. Neither the identity of the 25 organisations nor the
exact v1/v2/v3 rule definitions survive anywhere recoverable.

**DESIGN DECISION — those numbers are cited as an audit finding and never as a
reproducible benchmark.** Two consequences follow and both are binding:

1. `93.0% / 97.6%` must not be quoted as a production target, a regression
   baseline, or evidence that any later ruleset performs comparably. The rules
   were fitted to their own sample, and the sample is gone.
2. No later sample can be proven disjoint from Phase 2A's, so no later
   measurement is a true holdout with respect to it.

Whatever 2B-1b implements is a **reconstruction**, and its numbers are its own.

**MEASUREMENT — the 2026-08-24 holdout, with the same caveat.** A 15-organisation
/ 18-root French crawl was run during the Phase 2B design audit under a ruleset
frozen before any page was fetched (sha256 `af129233…47fa4728`), itself a
reconstruction of Phase 2A's v3 _concept_. Totals: 415 HTML pages, 562 fetches,
64 redirects, 221 pages selected; successful-fetch latency median 784 ms, p90
2.3 s, max 11.8 s. Its tooling was also deleted. **What survives is a set of
findings about live institutional sites**, and those findings are load-bearing
on the design below — they are the reason several columns in migration 0007
exist in the shape they do:

| finding                                                                                                                                                                                                                                                                                                    | where it lands in 0007                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Same-registrable-domain crawling walks into the internal service estate: 12 of 53 fetches on one university burned a full 30 s connect timeout each on `moodle.`, `glpi.`, `grr.`, `mail.etudiant.`, `workflow.`, `mondossierweb.`, `espace-achat.`, `espace-voyage.`                                      | `error_kind = 'CONNECT_TIMEOUT'`, and `fetch_policy_version` on every row so a deny-list change is visible in the evidence              |
| A real university (`www.sorbonne-nouvelle.fr`) declares its charset at byte 1050, past the HTML5 1024-byte prescan window, behind ~130 bytes of blank lines; its bytes are not valid UTF-8, and decoding them as UTF-8 destroys 88 of 89 accented characters                                               | `charset_source` includes `META_LATE` and `UTF8_VALIDITY_PROBE`; `charset_confidence` separates `DECLARED` from `PROBED` from `ASSUMED` |
| `<main>` extraction and cross-page boilerplate differencing **compose** — median retained fraction 0.570, 0.509 and 0.436 respectively — and neither dominates on every site                                                                                                                               | `extraction_method` includes `MAIN_ELEMENT_AND_DIFFERENCED` and is recorded per page                                                    |
| Cross-domain redirects adjudicate Phase 1D website disagreements **in one direction only**: two of three disagreement organisations redirect onto the register's value, but Université Paris Cité serves `u-paris.fr` and `u-pariscite.fr` as two live, byte-identical sites with no redirect between them | redirect facts are stored separately and a promotion requires an explicit operator decision (§7)                                        |
| The deterministic layer cannot separate a unit from a degree programme — "MSc International Marketing", "MBA International Business Law" and "International Office" all carry the same token                                                                                                               | `orgunit_page_candidates` stores a **rank**, never a relevance fact; `type_hint` admits `DEGREE_PROGRAMME` and `UNCLEAR` (§9)           |

**UNKNOWN — everything outside France.** Both samples were French. Nothing here
establishes how any of it behaves elsewhere, and §12 explains why not one line
of the schema is allowed to assume otherwise.

---

## 4. DESIGN DECISION — why this is not a general crawler

A crawler is defined by what it will fetch. This will fetch:

- pages under a **root that an official source published** or that an operator
  explicitly promoted;
- within a **bounded budget** — a page cap, a byte cap, a time cap, a
  concurrency cap, all versioned as `fetch_policy_version`;
- by **GET only**, honouring the site's own robots rules, recorded per request
  in `robots_decision`;
- **stopping at the registrable-domain boundary**, with a cross-domain hop
  recorded as evidence and never followed.

It will not discover roots by search, will not follow links off-domain, will not
execute JavaScript, will not render, and will not accumulate a corpus. There is
no crawl frontier that outlives a run: the frontier is transient working state,
deliberately not a table.

**FACT — after this slice the repository still has zero institution-website
network call sites.** The only three files permitted to call `fetch()` are the
three official-source resolvers, pinned exactly by
`src/test/firewall/phase1d.firewall.test.ts`, and 0007 does not touch that. The
new `phase2b.firewall.test.ts` restates the assertion as a Phase 2B tripwire.

---

## 5. DESIGN DECISION — `src/orgunits/`, and exactly one network location

The namespace is `src/orgunits/`, with `src/orgunits/web/`,
`src/orgunits/signals/` and `src/orgunits/candidates/` planned, and
`src/orgunits/classify/` reserved for Phase 2B-2 pending approval.

It is named for **what the work is** — finding organisational units — rather
than for how it is done. `src/research/`, `src/crawl/`, `src/scrape/` and
`src/enrich/` are forbidden and remain so: a generic name invites generic
scope, and "research" in particular is the label under which contact discovery,
scoring and enrichment would each look like a natural next commit.

**The single permitted Phase 2B network location is
`src/orgunits/web/gateway.ts`.** That path is declared now, in a firewall test,
**before the file exists**. Declaring it does not authorise it: Phase 1D's
`fetch()` allow-list still names only the three resolvers, and widening it is
2B-1b's job, done deliberately and with review. What the declaration buys is
that a _second_ network location cannot appear quietly beside the first.

**No placeholder was created.** `src/orgunits/` does not exist after this
slice, and the firewall asserts that the gateway, the robots reader, the
sitemap reader, the frontier, the extractor and the charset handler are all
absent. A placeholder module is how an unreviewed capability gets its first
import.

---

## 6. DESIGN DECISION — official website claims remain evidence, and gain no winner

Phase 1D established that two official sources genuinely disagree about the
website of 10 French institutions, and that neither may overwrite the other.
Phase 2B does not resolve that, and must not create pressure to.

So a fetch's root provenance points at a **`website_claims` row** — one
source's assertion — and not at an organisation. A run that followed ECHE's
value says so; a run that followed the register's value says so; both remain
inspectable side by side.

Nothing in migration 0007 writes to `website_claims`, and no
`preferred_website`, `canonical_website` or `official_website` column comes into
existence anywhere. `organisations.website_url` and
`organisations.canonical_domain` keep exactly the bytes Phase 1A derived,
including the 55 rows where an email address became a website.

---

## 7. DESIGN DECISION — redirects are separate evidence, cross-domain hops stop, and promotion is explicit

**Redirects are their own grain, stored as facts rather than as one verdict.**
The tempting design is a single `CROSS_DOMAIN` enum. It is wrong, because one
hop can be several things at once: the host can change while the registrable
domain does not, and the scheme can be downgraded at the same time. A lossy
label decides at write time, invisibly, which of those facts mattered. So
`scheme_downgraded`, `host_changed`, `registrable_domain_changed` and
`target_malformed` are stored separately, each nullable — when the target
cannot be resolved at all, "did the host change?" has no answer, and `NULL` is
the only honest one.

**A cross-registrable-domain hop is recorded and stopped.** It never becomes a
crawl root by observation. The measured reason is in §3: two of three
disagreement organisations redirect onto the register's value, but the third
serves both domains live with no redirect between them. A hop is therefore a
strong review signal and **never an automatic winner**.

**Promotion is an explicit, stored operator decision.** The invariant, restated
because it is the one a future slice will be tempted to relax:

> A CROSS-DOMAIN REDIRECT TARGET CANNOT BECOME A RESEARCH ROOT WITHOUT AN
> EXPLICIT STORED OPERATOR DECISION.

Not by inference, not by the target matching some other stored value, not by
being observed twice. `orgunit_root_promotion_events` is the only path, and
`orgunit_fetch_observations` enforces it structurally: its root columns are a
CHECKed exclusive-or, so a fetch rooted in a promotion must name the promotion
event, and a fetch with no root authority at all cannot be recorded.

**Promotion is an event stream, not a flag.** An approval that can be withdrawn
is a lifecycle, and a lifecycle stored as a mutable flag needs `UPDATE` — which
`nwf_research` does not have and must not get. A withdrawal is a new row with
`decision = 'REVOKE'`; the approval it withdraws is left intact; the current
state is derived as the latest applicable event. Who decided what, when, and
why survives in full.

---

## 8. DESIGN DECISION — no raw HTML is stored, ever

A response body is represented by `response_sha256` and `byte_count`. That is
all of it that reaches the database.

Three reasons, in order of weight:

1. **Contact data.** An institution's pages carry staff names, mailboxes and
   telephone numbers. Storing the markup would put unredacted contact blocks
   into a repository that stores no contacts — accidentally, at scale, and
   without any of the gates a deliberate contact phase would require.
2. **Scope.** An unbounded copy of other people's websites is the thing
   "bounded first-party acquisition" exists not to be.
3. **Honesty about what was kept.** `main_text` is text this repository
   _derived_, not text it _received_, and a hard `CHECK` caps it at 200,000
   characters so it cannot become a body under another name. The cap is in the
   first migration precisely so no implementation can quietly opt out of it.

`phase2b.firewall.test.ts` refuses a column named for the body — `raw_html`,
`page_html`, `response_body`, `raw_markup` and a dozen further spellings — in
**any** migration, so a later slice cannot add one without the test failing.

---

## 9. DESIGN DECISION — a page candidate is a rank, not a relevance fact

A row in `orgunit_page_candidates` means exactly:

> Under rule version R, on track T, this page ranked at position N among the
> pages reached from this root.

It does **not** mean the page is an International Office, that the organisation
is relevant, or that any unit is confirmed. The measured reason is the last row
of the table in §3: "MSc International Marketing", "MBA International Business
Law" and "International Office" are lexically indistinguishable. Separating a
unit from a degree programme is the precision ceiling of any lexical rule, and
it is the whole justification for Phase 2B-2 existing as a separate phase.

So the table carries **no mutable status of any kind**: no `status`, no
`relevant`, no `confirmed`, no `verified`, no `preferred`, no
`classification_status`. A newer run or rule version supersedes an older
candidate _analytically_ — by being newer — and the older row is never edited.
When Phase 2B-2 is approved it will **append** classifier rows referencing these
candidates rather than stamping them.

`type_hint` is a non-binding hint whose taxonomy admits `DEGREE_PROGRAMME` and
`UNCLEAR` as first-class values, because forcing a unit type would manufacture
confidence the evidence does not support.

**Frontier ranking and candidate ranking are different concepts.** A frontier
score ranks a URL _before_ it is fetched, and URL-tree inheritance may
legitimately raise it. A candidate score ranks a page _after_ it has been read.
Letting inheritance flow into `candidate_score` would silently convert "worth
trying" into "worth reporting". No `frontier_score` column exists in this
migration — the frontier is transient working state — and the separation must
survive whatever slice makes it durable.

---

## 10. DESIGN DECISION — the run and candidate lifecycles are append-only

`nwf_research` receives `SELECT` and `INSERT` and nothing else. No `UPDATE`, no
`DELETE`, no `TRUNCATE`, no database `TEMPORARY`. That is not decoration — it
is the reason two tables here look different from the obvious design.

A run cannot be inserted as `running` and later updated to `succeeded`, because
the role that executes runs cannot update anything. So configuration
(`orgunit_research_runs`) and terminal result
(`orgunit_research_run_completions`) are two immutable rows in two tables, and a
run's status is **derived** from whether the second exists. The absence of a
completion row is deliberately ambiguous between "still running" and "died
without recording anything": a process killed mid-run cannot write, so a schema
claiming to distinguish those two would be claiming knowledge it does not have.

This is the same reasoning migrations 0003 and 0005 already applied to source
evidence, for the same reason: **evidence that can be edited is not evidence.**

A dedicated role rather than reusing `nwf_ingest` is the point of the slice.
`nwf_ingest` holds `UPDATE` on `organisations` and on `ingest_runs`; handing
web research those privileges is exactly the capability that must not exist
here.

---

## 11. DESIGN DECISION — same-domain crawling later requires SSRF controls

A fetch target that comes from a published register or from a page's own links
is attacker-influenceable in the ordinary sense: whoever controls the site
controls the URLs. Same-domain crawling therefore means resolving hostnames
supplied by third parties and connecting to whatever they resolve to.

2B-1b will need, at minimum: refusing non-`http(s)` schemes; resolving before
connecting and refusing loopback, link-local, private and reserved ranges;
pinning the connection to the address that was checked so a re-resolution
cannot substitute another; refusing redirects to anything that fails the same
checks; and a byte cap enforced during the read rather than after it.

**None of that is built here.** What is built is the place to record that it
held: `resolved_ip_family` and `resolved_ip_is_public` on every fetch
observation. The address itself is deliberately not stored — what a reviewer
needs is the assertion that a first-party fetch did not reach a private range —
and `NULL` means _not recorded_, never "public".

---

## 12. DESIGN DECISION — nothing assumes a country, a language or a market

Both research samples so far were French. That is a property of the sample, not
of the problem, and none of it is allowed into the schema.

Migration 0007 contains no `target_language`, no `partner_country`, no
`country_code`, no `locale` and no `market` column, and no France-specific
literal anywhere. The one language-shaped column, `orgunit_page_evidence.declared_lang`,
is **the document's own declaration and nothing else** — not a target language,
not a learner language, not a partner-country signal, and not an input to any
such inference. It is `NULL` when the document declared nothing, never guessed
from the text, the domain or the country.

"French organisation → French learner" is not a valid inference. Partner
country, target language and NWF language-community density remain three
separate future dimensions.

`orgunit_page_candidates.track` names kinds of organisational unit —
`INTERNATIONAL_OFFICE`, `LANGUAGE_CENTRE`, `STUDENT_ASSOCIATION` — and never a
country, a language or a market. The holdout's service-subdomain finding is
product-name matching (`moodle.`, `glpi.`, `grr.`), so it belongs in a
country-blind core rather than in any language pack.

---

## 13. DESIGN DECISION — research is not outreach, and contacts stay excluded

Phase 2B produces **research evidence**. It produces no contact, no lead and no
eligibility.

No table introduced here has a column meaning `contactable`, `sendable`,
`outreach_allowed`, `outreach_eligible`, `compliance_passed` or
`sequence_state`, and none may acquire one. No `contacts`, `people`, `staff` or
`leads` table exists. No column stores a person, a mailbox or a telephone
number.

The one field in this schema where a mailbox would plausibly be typed by a
well-meaning operator is `orgunit_root_promotion_events.decided_by`, which
records **who** approved a root. The database refuses a value containing an
at-sign. That constraint is small and it is deliberate: an audit field is
exactly where the first stored contact would appear by accident in a repository
that has none.

This repository remains structurally incapable of sending anything.

---

## 14. DESIGN DECISION — why Phase 2B is split

**2B-1 is acquisition. 2B-2 is semantic classification.** They are separated
because they fail differently and are reviewed differently.

Acquisition failures are operational and observable: a timeout, a charset
mis-detection, a redirect loop, a robots refusal. They are checked against the
site itself.

Classification failures are judgement failures — calling a degree programme an
International Office — and are checked against a labelled sample that does not
yet exist. Merging the two would mean a model's verdict and a socket's outcome
sharing a review, and neither would get the one it needs.

The split is also what keeps the governing principle enforceable: 2B-1's whole
output is "here are N bounded pages", which is precisely the small remainder
2B-2 is permitted to interpret.

**Phase 2B-2 is NOT authorised.** No classifier table, no Anthropic dependency,
no model call, and no `src/orgunits/classify/` directory exists after this
slice.

---

## 15. DESIGN DECISION — search, browser automation and PDF parsing stay absent

- **Search engines** would discover roots this repository has no official
  source for, which is the opposite of rooting acquisition in published
  evidence. Root discovery stays with official claims and explicit operator
  promotion.
- **Browser automation** (Playwright, Puppeteer, Crawlee) executes third-party
  JavaScript locally and makes the byte cap unenforceable. A page whose unit
  listing exists only after script execution is a page this phase does not
  read, and that limitation is recorded rather than engineered around.
- **PDF parsing** widens the input surface to a format with a long history of
  parser vulnerabilities, for content that is rarely the unit page itself.

All three are refused by dependency name in the Phase 2B firewall.

---

## 16. What is explicitly NOT built in 2B-1a

No network code of any kind. No `gateway.ts`. No robots parser, no sitemap
parser, no HTML extraction, no charset handling, no frontier logic, no language
packs, no candidate scoring, no PII redaction runtime. No `src/orgunits/`
directory at all. No CLI command. No dependency added — the runtime dependency
list is still exactly `pg`, `read-excel-file`, `saxes`, `tldts`, `zod`. No AI
integration. No contact storage. No Apollo. No outbound capability.

What is built: migration 0007 (seven tables, the `nwf_research` role, the
grants), `phase2b.firewall.test.ts`, the integration tests that prove the grants
and the schema contract, and this ADR.

**No operational row exists in any Phase 2B table after this slice**, because no
research run has occurred and none can.

---

## 17. UNKNOWN — say so rather than resolving by inference

- Whether any reconstructed ruleset reaches Phase 2A's reported precision or
  recall. Not measurable against that sample, which is gone.
- How any of the holdout's findings generalise outside France.
- Whether robots rules, rate limits or terms of use of any specific institution
  permit this acquisition in any specific jurisdiction. Not resolved here, and
  not something to encode from memory.
- Whether the deterministic layer can reach a useful precision at all on the
  unit-versus-programme distinction. §3 says it cannot separate them lexically;
  what a semantic phase achieves is untested.

---

## 18. Consequences

- A later slice may write the acquisition gateway, and it will do so into a
  schema whose trust boundaries were reviewed before the code existed.
- Widening Phase 1D's `fetch()` allow-list is a **deliberate, visible act** in
  2B-1b — the test fails until someone edits it on purpose.
- Every research observation is traceable to the exact root authority that
  permitted it, and no observation can exist without one.
- No stored row in this repository can be edited by the role that produces
  research evidence.
- The measurement culture is preserved: this ADR records the findings that
  shaped the schema, _including_ the fact that two prior measurements' tooling
  was deleted and their numbers are audit findings rather than benchmarks.
