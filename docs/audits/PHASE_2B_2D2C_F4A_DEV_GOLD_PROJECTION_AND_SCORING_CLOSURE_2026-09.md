# Phase 2B-2D2C-F4A — DEVELOPMENT gold projection and scoring closure

**Date:** 2026-09-14
**Branch:** `feat/phase2b-2d2c-f4a-dev-gold-scoring-closure`
**Worktree:** `/Users/tijnklinkhamer/Developer/wt-phase2b-2d2c-f4a-dev-gold-scoring-closure`
**Based on:** `ab5cc478c80bf085c1bb3080c9ecb0432e9f19b1` (F4, unamended)
**Status:** COMPLETE — gold projected under owner authorisation; attempt 1 scored.
**Scoring outcome:** `BLOCKED_PENDING_OWNER_GOLD_ADJUDICATION`

---

## 1. What this task was for

F4 stopped honestly. It verified all 243 preserved attempt-1 artifacts, rebuilt
the execution plan, and found that **no DEVELOPMENT-only source carried a gold
label at all**: the canonical corpus is document evidence with no label fields,
and the only label file for this corpus holds 49 DEVELOPMENT plus 23 HOLDOUT
records with no `split` field, listed never-read by the F0B freeze. So F4 could
measure validator validity and gold-free concordance, and nothing else.

F4A does two things: it closes a formatting-scope regression F4 introduced, and
it performs — under an explicit, exact owner authorisation — the one-time
machine-only projection of that mixed file onto the 49 frozen DEVELOPMENT gold
ids, then reruns the existing scorer against the **unchanged** preserved
attempt.

**No inference of any kind was performed.** No provider call, no SDK `query()`,
no Claude CLI or auth-status call, no profile access, no database, no
execution-CLI invocation, no attempt 2, no HOLDOUT inference, no gold-label
change, no attempt-1 mutation, no consumption-marker mutation, no merge, no PR,
no push to main.

---

## 2. Owner authorisation, verbatim

The projection was performed only after the owner supplied, in full and
unparaphrased:

> I AUTHORISE ONE LOCAL, NON-INFERENCE, MACHINE-ONLY PROJECTION OF THE MIXED
> 72-RECORD ADJUDICATION FILE ONTO THE 49 FROZEN DEVELOPMENT GOLD IDS.
> NON-DEVELOPMENT RECORDS MAY BE HANDLED ONLY AS UNAVOIDABLE RAW BYTES FOR ID
> ROUTING AND WHOLE-FILE INTEGRITY; THEIR IDS, LABELS, AND SEMANTIC FIELDS MUST
> NOT BE DESERIALIZED, RETAINED, LOGGED, DISPLAYED, EMITTED, SCORED, OR USED. NO
> HOLDOUT INFERENCE. NO GOLD LABEL CHANGE. NO DATABASE.

The runner enforces this rather than trusting it: `projectCli.ts` compares the
supplied text against `REQUIRED_AUTHORISATION` (whitespace-collapsed,
content-exact) and refuses otherwise. `go`, `approved`, `continue`, a shortened
statement and a statement with `49` changed to `72` are all tested and all
rejected. The accepted statement is recorded verbatim in the committed
supplement's `provenance.ownerAuthorisationStatement`.

---

## 3. Why raw-byte contact with the mixed file was unavoidable

The adjudication file is the **only** source of gold labels for this corpus. It
interleaves DEVELOPMENT and HOLDOUT records and `AdjudicationItemSchema` carries
**no `split` field**, so a record's membership is derivable only from its
`goldId`. To select the 49 DEVELOPMENT records, every line must be *reached* —
there is no index, no offset table and no separate DEVELOPMENT file.

What was avoidable, and was avoided, is **deserializing** a non-DEVELOPMENT
record. `JSON.parse(line)` would materialise the whole record — `url`, `title`,
`organisationName`, `rationale`, `ambiguity` and the entire `proposed` label —
*before* anything could decide the record was not allowed. Membership therefore
had to be decided before deserialization, not after it.

---

## 4. Proof that non-DEVELOPMENT semantic rows were not deserialized or retained

Structural, not promised:

| claim | how it is enforced |
| --- | --- |
| Allowlist never learned from the mixed file | built only by `loadDevCorpus`, which hash-verifies the canonical corpus against F0B and throws on a non-`DEVELOPMENT` row |
| No `JSON.parse` before routing | `routeGoldId.ts` contains no `JSON.parse`, no `JSON.stringify`, no `Schema` and no `zod` — asserted **by name** in `phase2b2d2cF4aGoldProjector.firewall.test.ts` |
| Values skipped, not materialised | the router advances an index past each value — strings to their unescaped closing quote, objects/arrays by nesting depth, literals to the next delimiter — and **stops at `goldId`**, so a discarded record's tail is never examined at all |
| Key comparison decodes nothing | the routing key is compared as **bytes** (`Buffer.compare`) against `goldId` |
| Only depth-1 keys route | a nested or quoted `"goldId"` inside `proposed` or a rationale cannot be mistaken for the routing key (tested) |
| Discards are silent | `routeGoldId.ts`, `project.ts` and `allowlist.ts` contain no `console.`, `process.stdout` or `process.stderr` — asserted by name; a behavioural test spies on all seven channels across a whole projection and requires zero calls |
| Errors leak nothing | `GoldIdRoutingError` carries a **byte offset** only; a test feeds a line containing a sentinel and asserts the message does not contain it |
| No HOLDOUT id set | a non-allowlisted id is compared and dropped; it is never stored in any collection |
| No statistic over non-DEV rows | the source's **total record count was deliberately not measured**; the manifest records `sourceRecordCountMeasured: false`. The only figures taken over non-DEVELOPMENT bytes are the whole-file SHA-256 and the proof that each of the 49 appeared exactly once |
| Output order does not leak position | records are emitted in **canonical corpus order**, never the source's own order |
| Runner cannot leak | `projectCli.ts` receives an already-filtered result whose `selected` array holds only allowlisted records; a firewall test additionally asserts its `process.stdout.write` arguments name no record field |

**Mutation tests.** Each proves a specific weakening is detected:

- *parse-before-route* — a non-DEV line valid through `goldId` and deliberate
  garbage after it. `JSON.parse` throws on it (asserted); the projector
  succeeds. A projector that parsed before deciding membership would fail.
- *leaked label* — every non-DEV synthetic value is a unique sentinel; the
  emitted bytes must contain none of it, nor any non-DEV id.
- *logged discard* — all console methods plus both standard streams are spied
  on for the whole projection and must record nothing.
- *duplicate / missing selected id* — both fail closed; the missing-id message
  is asserted to name only DEV ids and no sentinel.
- *corpus ordering* — a shuffled source still emits in corpus order.

A shadow-root test runs the **complete runner** against a synthetic mixed file
placed at the exact path the freeze names, then asserts the real repository's
three target paths are byte-unchanged (hashed before and after).

---

## 5. Hashes

### Unchanged protected state — verified before and after

| artifact | SHA-256 |
| --- | --- |
| F0B inference freeze | `c3f0a76b3a5939f3e4bf395d46237cf0b0f365fa1f4bf019092a6944849d6157` |
| attempt-1 aggregate (243 artifacts) | `ee17e1f2ee8021e59c06377342042e56f84269165f8ec39521011cb1d3538137` |
| spent authorisation | `46d1bd9ebed544f7ebf463f26ff6ec7cca89d8a9d849fdfd04a42412dc2d5705` |
| consumption marker | `cf27a3a9d15191022c13d649579ebab9f3bfeaa275bf0e62ee7b77c87b1d65bf` |
| rebuilt plan | `05cb6984a57a871ac6b0a0720ab2fefceb5b5843f440dbf7831abdf9bfc82f6c` |
| `origin/main` | `7adf895fa20e9b25758e0748d1a02e26c387d19b` |

Attempt 1 was re-hashed after every derivation: **243 files, `ee17e1f2…`,
byte-identical throughout.**

### Source of the projection

| | |
| --- | --- |
| path | `src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-adjudication-v1.jsonl` |
| whole-file SHA-256 | `8a85222a832a076dd5658d9ccdb122a3bee364874b15164ed3c08873aeb8df6f` |

Recorded solely as provenance. No discarded id, label, semantic value or raw
line is recorded anywhere.

### Produced

| artifact | SHA-256 |
| --- | --- |
| DEV label fixture (49 records) | `19d9cc3e9dcfe0b10930aa095075cd4828459377d9ea67c8dd296da6126fcd08` |
| fixture manifest | `53801e48498777727af719cd67cef09f3865617b15283b9e3d24daa4d884d519` |
| scoring supplement | `ccb7efd599b5ba39866cc7bbfda940c9ae1d94e32dd0e0431fef3d48bcb51fe4` |
| gold-v1 `scored-items.jsonl` | `0be23d03a776c09bdbaaf72c0e55591d60ffa396e05b9921cd55f2484bd08697` |
| gold-v1 `summary.json` | `6be8f368d78ecf9887b9303964ba6afe316b82e9f10196ec9ddffb8796790441` |
| gold-v1 `manifest.json` | `53315e0f6641bb00613dc01fa8e68431be8804240dbbce8f3e21415702bc981e` |

### Formatting-scope correction — intentional, mechanically regenerated

| file | before | after |
| --- | --- | --- |
| `…attempt-1/scored-items.jsonl` | `d79a6ec0…` | `d79a6ec0…` **unchanged** |
| `…attempt-1/summary.json` | `10da1eef…` | `79331e61…` |
| `…attempt-1/manifest.json` | `81eae76c…` | `536d33ee…` |

**These are not byte-identical and are not described as such.** `summary.json`
is semantically identical under JSON equality; `manifest.json` differs only in
its `serialization` description and the recorded `summary.json` hash. The
derivation is untouched: same sources, same scorer version
(`phase2b-2d2c-f4-scorer-v1`), same `INSUFFICIENT_VALID_DEV_EVIDENCE`.

---

## 6. The formatting-scope correction

F4 added `docs/evaluation/results/` to `.prettierignore` — a whole-directory
rule. It bought byte-stability for three files at the cost of making every
future file under that directory invisible to the formatter: the blind spot
2D2B-1 acceptance had explicitly closed. Withdrawn.

- `summary.json` and `manifest.json` are now laid out by **this repository's
  own Prettier** inside the emitter, so `prettier --check` covers them and they
  need no exclusion at all. `canonicalStringify` remains the serialization of
  record — it still fixes key order and number formatting, and Prettier only
  chooses line breaks, so the *value* is unchanged.
- Prettier options resolve from the **emitter's own in-repo path**, never from
  the output directory: a reproducibility derivation into `/tmp` would otherwise
  silently fall back to Prettier's defaults and produce different bytes.
- `scored-items.jsonl` stays excluded **by exact path, once per result
  directory**. Prettier has no `.jsonl` parser at all (`No parser could be
  inferred`), and one JSON object per line *is* the format.
- No directory rule, no glob, no open-ended subtree.
- The formatter is now part of the output contract and is named by exact
  version in the manifest's `serialization` field (`prettier@3.9.6`), so a
  future Prettier upgrade that changed JSON layout is a recorded, intentional
  re-derivation rather than silent drift.

**Pre-existing exclusions preserved.** The brief referred to "two earlier
individually named frozen-artifact exclusions"; `.prettierignore` has in fact
never held individually-named file exclusions — its only named entry is
`package-lock.json`. The two pre-existing **frozen-artifact** exclusions are the
directory rules `src/test/fixtures/` and `docs/audits/`, and both are untouched
and asserted present.

**Regression probes.** `evaluationResultsFormattingScope.test.ts` writes
deliberately unformatted `.json` and `.md` files under
`docs/evaluation/results/` — including into an attempt subdirectory that did not
exist before — and requires Prettier's own API, with this repository's own
`.prettierignore`, to flag each one.
`phase2b2d2cF4aFormattingScope.firewall.test.ts` asserts the rule *shape*: no
directory-shaped or glob rule under `docs/evaluation/`, every evaluation rule an
exact `.jsonl` path, and no rule ending in `summary.json` or `manifest.json`.

---

## 7. The scoring supplement is separate from F0B, deliberately

No label path and no label hash was added to
`PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_V1.json`. Its raw SHA-256 is
**unchanged** at `c3f0a76b…`, asserted by a firewall test. Adding gold to it
would mint a new freeze hash and make attempt 1 appear to have run under a
configuration carrying its own answer key.

`PHASE_2B_2D2C_DEV_SCORING_SUPPLEMENT_V1.json` states explicitly that it is
scoring-only, was created after inference (2026-09-14, against a run that
completed 2026-09-13 with its authorisation already consumed), was never visible
to the model, and does not alter F0B. It names its parent freeze
(`c3f0a76b…`), the preserved attempt aggregate (`ee17e1f2…`), the 49 permitted
gold ids, and the mixed source's whole-file hash.

The scorer **fails closed** on every way a gold set can stop describing this
run, each tested: a supplement still `PREPARED_AWAITING_AUTHORISED_PROJECTION`,
a stale parent freeze hash, a different preserved attempt, an edited fixture
(the hash check is what makes *"no gold label was changed"* checkable rather
than asserted), a missing DEVELOPMENT item, an id outside the canonical corpus,
and a declared record count disagreeing with the fixture.

**F0B and the projection agree independently** about the open owner question:
the projected label for `ge789b0f0aedc398c` is `UNIT_PAGE`, exactly the
`committedLabel` F0B preserves. `runScoring` refuses to proceed if they ever
disagree, because silently preferring either would be an adjudication this task
may not make.

**Additivity is proved, not claimed.** The same scorer, given no supplement,
still reproduces the blocked F4 derivation **byte for byte** (`d79a6ec0…`,
`79331e61…`, `536d33ee…`). The gold-backed keys are omitted entirely rather than
emitted as `null` precisely so that this holds. The blocked directory was not
overwritten by the gold run and records `phase2b-2d2c-f4-scorer-v1`; the
gold-backed directory records `phase2b-2d2c-f4a-scorer-gold-v1`.

---

## 8. Semantic metrics — attempt 1, 49 DEVELOPMENT items

Gold: 14 `UNIT_PAGE`, 33 `NOT_A_UNIT`, 2 `NEEDS_REVIEW`; 21 hard negatives; all
49 `GOLD_CONFIRMED`.

**Validator validity (unchanged from F3): V1 45 accepted / 4 rejected; V2 47 /
2.** This is verifiability, not correctness, and is never reported as accuracy.

### Strict (all 49 in the denominator; a rejected answer counts incorrect) and conditional (accepted only)

| field | V1 strict | V1 cond. | V2 strict | V2 cond. |
| --- | --- | --- | --- | --- |
| `verdict` | 40/49 = .8163 | 40/45 = .8889 | **42/49 = .8571** | **42/47 = .8936** |
| `unit_type` | **12/14 = .8571** | 12/12 = 1.0000 | 9/14 = .6429 | 9/12 = .7500 |
| `page_kind` | 17/33 = .5152 | 17/31 = .5484 | **22/33 = .6667** | **22/33 = .6667** |
| `serves_incoming_international_students` | **12/14 = .8571** | 12/12 = 1.0000 | 9/14 = .6429 | 9/12 = .7500 |
| `serves_outgoing_mobility_students` | **11/14 = .7857** | 11/12 = .9167 | 9/14 = .6429 | 9/12 = .7500 |
| `provides_language_learning_or_support` | 5/14 = .3571 | 5/12 = .4167 | **9/14 = .6429** | **9/12 = .7500** |
| `unit_name_expectation` | 29/44 = .6591 | 29/40 = .7250 | **33/44 = .7500** | **33/42 = .7857** |

`unit_type` and the three axes are scored over the 14 items whose gold verdict
is `UNIT_PAGE`; `page_kind` over the 33 `NOT_A_UNIT` items; `unit_name_expectation`
over the 44 items whose expectation is not `ANY`. The biconditional's null half
is `NOT_APPLICABLE` and is excluded from every denominator — never counted as a
failure to measure. `hard_negative` is a denominator flag and is never graded
against an answer.

### Verdict confusion (gold → predicted)

**V1** — `NOT_A_UNIT` → 27 `NOT_A_UNIT`, **4 `UNIT_PAGE`**, 2 REJECTED;
`UNIT_PAGE` → 12 `UNIT_PAGE`, 2 REJECTED; `NEEDS_REVIEW` → 1 correct, 1 `UNIT_PAGE`.

**V2** — `NOT_A_UNIT` → **33/33 correct**; `UNIT_PAGE` → 9 `UNIT_PAGE`, **3
`NOT_A_UNIT`**, 2 REJECTED; `NEEDS_REVIEW` → 1 `NOT_A_UNIT`, 1 `UNIT_PAGE`.

That is the whole story in one table: **V2 trades recall for precision.** It
never mistakes a non-unit for a unit; it mistakes three units for non-units.

### Hard-negative rejection (21 items)

| | V1 | V2 |
| --- | --- | --- |
| rejected as non-unit (strict) | 16/21 = .7619 | **21/21 = 1.0000** |
| answered `UNIT_PAGE` | 3 | **0** |
| validator-rejected | 2 | 0 |

### Ternary axis precision / recall / F1 (macro-F1)

| axis | V1 | V2 |
| --- | --- | --- |
| `serves_incoming_international_students` | **.9212** | .7167 |
| `serves_outgoing_mobility_students` | **.8667** | .6429 |
| `provides_language_learning_or_support` | .7000 | **.8684** |

Every V1 axis carries a `NO` class with precision 0.0 (7 false positives on the
language axis, 1 on outgoing). Every V2 axis carries a `NULL` class with
precision 0.0 and exactly 3 false positives — the three `UNIT_PAGE` items V2
moved to `NOT_A_UNIT`, which nulls all three axes by the schema's biconditional.

### Frozen gates (F0B's own thresholds; none invented, relaxed or re-tuned)

| gate | threshold | V1 | V2 |
| --- | --- | --- | --- |
| `minSchemaValidSpanVerifiedRate` | .99 | .9184 ✗ | .9592 ✗ |
| `minUnitPageRecall` | .95 | .8571 ✗ | .6429 ✗ |
| `minUnitPagePrecision` | .90 | .7059 ✗ | **.9000 ✓** |
| `minUnitTypeAccuracy` | .85 | **.8571 ✓** | .6429 ✗ |
| `minHardNegativeRejection` | .90 | .7619 ✗ | **1.0000 ✓** |
| `maxNeedsReviewRate` | .15 | .0204 ✓ | .0000 ✓ |

**Neither variant passes the acceptance set.** V2 gains two gates and loses one.

### Paired transitions (joined by gold id, never by position)

| field | pairs | C→C | I→C | C→I | I→I | net |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `verdict` | 49 | 36 | 6 | 4 | 3 | **+2** |
| `page_kind` | 33 | 14 | 8 | 3 | 8 | **+5** |
| `unit_name_expectation` | 44 | 25 | 8 | 4 | 7 | **+4** |
| `provides_language_learning_or_support` | 14 | 4 | 5 | 1 | 4 | **+4** |
| `unit_type` | 14 | 9 | 0 | 3 | 2 | **−3** |
| `serves_incoming_international_students` | 14 | 9 | 0 | 3 | 2 | **−3** |
| `serves_outgoing_mobility_students` | 14 | 8 | 1 | 3 | 2 | **−2** |

Net across all seven scorable fields: **+7**. That aggregate is reported but is
**not** offered as evidence of improvement: a gain on one field does not cancel
a regression on another, and three fields regress.

**Validity:** 45 accepted→accepted, **2 rejected→accepted**, **0
accepted→rejected**, 2 rejected→rejected.

**McNemar on verdict correctness** (exploratory only): b=4, c=6, discordant=10,
χ²=0.40. 49 items, one sample per variant, a stochastic model — this is never
evidence of generalisation.

### Gold-free concordance (agreement, not correctness; 45 comparable pairs)

`verdict` 37 agree / 8 disagree · `unit_type` 38/7 · `page_kind` 27/18 ·
`serves_incoming` 38/7 · `serves_outgoing` 37/8 · `provides_language` 33/12 ·
`confidence` 38/7 · `unit_name_present` 33/12 · `unit_name_sha256` 31/14.

### Diagnostic slices

**PREVIOUSLY_REJECTED (6):** `ga435ea22d4b11cf4` C→C · `gdb5b7246327094ef` C→C ·
`gcce4e2a5f608de5d` C→C · `gf65026e32d9da8db` **C→I** · `g0ec0d43dad311a77` and
`g877a05e6f5bba835` rejected under both.

**PAGE_VERSUS_UNIT (5):** `g32779df2d7b56a34` and `g956f99fae4ad4764`
rejected→accepted and **correct** under V2 · `g04d170f4d3fda759` and
`g04b64db14c03ce3a` **I→C** · `g4454e841c09dd8d0` C→C. **V2 is unambiguously
better on this slice: four improvements, no regression.**

**UNKNOWN_NO_CALIBRATION (4):** all four `UNIT_PAGE` gold, all four verdict-C→C
under both. The differences are axis-level only — see §9.2.

**OPEN_OWNER_QUESTION (1):** `ge789b0f0aedc398c`, gold `UNIT_PAGE`, V1 correct,
V2 `NOT_A_UNIT` — **C→I**.

---

## 9. The six required determinations

### 9.1 Do V2's movements toward `NOT_A_UNIT` correct errors or create regressions?

**Both, in exactly equal number.** The variants give different verdicts on 10
items. Two are not comparable (V1 validator-rejected, V2 accepted and correct).
Of the eight where both answered:

- **4 corrections** — `g04b64db14c03ce3a`, `g04d170f4d3fda759`,
  `g3130d41296ab8739`, `g536c8b148048fcbc`: gold `NOT_A_UNIT`, V1 said
  `UNIT_PAGE`, V2 said `NOT_A_UNIT`.
- **4 regressions** — `g57607d4278d6dc23`, `ge789b0f0aedc398c`,
  `gf65026e32d9da8db` (gold `UNIT_PAGE`) and `g66010a25ac194274` (gold
  `NEEDS_REVIEW`): V1 right, V2 `NOT_A_UNIT`.

Net verdict correctness is +2 only because the two validator recoveries also
land correctly. **The movement toward `NOT_A_UNIT` is not a net semantic gain —
it is a wash, paid for by a large precision gain and an equally large recall
loss.**

### 9.2 Does eliminating all twelve `NO` outputs help, and does it damage true negatives?

**It helps, and it damages nothing — the damage attributed to it comes from
somewhere else.**

- V1 emitted `NO` on 12 axis answers. **Zero matched gold.**
- **No gold axis in this corpus is `NO` at all.** The classes present are
  `UNKNOWN` and `YES`. Dropping `NO` therefore cannot cost a correct answer.
- V2 emitted `NO` on 0 axes and **corrected 6** axis answers, including all four
  `UNKNOWN_NO_CALIBRATION` items (`ge419f0b9902faee0`, `g34bbf7536e99b410`,
  `ga971a6fc52af6b5f`, `g735298870fe173b8`) plus `gdb5b7246327094ef` and
  `g99a9fe00e4856de2`.
- There are 7 axis regressions. **All 7 are `NULL` under V2, and 0 are
  independent of the verdict** — each is a mechanical consequence of V2 moving
  `g57607d4278d6dc23`, `ge789b0f0aedc398c` or `gf65026e32d9da8db` to
  `NOT_A_UNIT`, which nulls all three axes by the output schema's biconditional.

This split is computed (`axisRegressionsCausedByVerdictMove` vs
`axisRegressionsIndependentOfVerdict`), not asserted. **The UNKNOWN/NO
calibration change is a clean gain; the verdict change is what loses axis
accuracy.**

### 9.3 Are the two validator recoveries semantically correct?

**Yes, both.** `g32779df2d7b56a34` and `g956f99fae4ad4764` were rejected under
V1 for `unit_name is not supported by any supplied field`. Under V2 both
validate and both answer `NOT_A_UNIT`, which is their gold. These are genuine
recoveries, not checkable-but-wrong answers.

### 9.4 Why do `g0ec0d43dad311a77` and `g877a05e6f5bba835` remain rejected?

Both are gold `UNIT_PAGE`, and both fail the **`EVIDENCE`** validator under
*both* prompts with **identical reasons** under each:

- `g0ec0d43dad311a77` — `unit_name is not supported by any supplied field`.
- `g877a05e6f5bba835` — `evidence_spans[0] (source=HEADING) is not a literal substring of the supplied field`.

Neither is a schema failure and neither is a canonicalisation failure.
Canonicalisation (NFC + one HTML-entity decode) fixed the *encoding* mismatches
it was designed to fix — which is why four of the six historically-rejected
items now validate — but it cannot help where the model names a unit, or quotes
a heading, that **is not present in the supplied evidence at all**. Both prompts
produce the same defect, so this is a model-behaviour limit on these two
documents, not a prompt difference, and it is untouched by V2's changes.

### 9.5 Does any previously-correct V1 item regress under V2?

**Yes — 21 field-level regressions across 12 distinct items**, every one named:

| field | items |
| --- | --- |
| `verdict` | `g57607d4278d6dc23`, `g66010a25ac194274`, `ge789b0f0aedc398c`, `gf65026e32d9da8db` |
| `unit_type` | `g57607d4278d6dc23`, `ge789b0f0aedc398c`, `gf65026e32d9da8db` |
| `page_kind` | `g057656b07c6aa620`, `g543b604f0f0f8380`, `g5e9c0d460fee879b` |
| `serves_incoming_international_students` | `g57607d4278d6dc23`, `ge789b0f0aedc398c`, `gf65026e32d9da8db` |
| `serves_outgoing_mobility_students` | `g57607d4278d6dc23`, `ge789b0f0aedc398c`, `gf65026e32d9da8db` |
| `provides_language_learning_or_support` | `ge789b0f0aedc398c` |
| `unit_name_expectation` | `g1f85c7bcf67d324e`, `g4454e841c09dd8d0`, `ga435ea22d4b11cf4`, `ge789b0f0aedc398c` |

**No validity regression whatsoever:** 0 items moved accepted → rejected.

### 9.6 Does the open `ge789b0f0aedc398c` label change the recommendation?

**Yes. Decisively. This is the binding finding.**

V1's `minUnitTypeAccuracy` is **12/14 = 0.8571**, which meets the 0.85
threshold — by one item. Remove `ge789b0f0aedc398c` and it becomes **11/13 =
0.8462, which does not.**

`minUnitTypeAccuracy` is **V1's only passing semantic gate**, and it rests
entirely on the single item whose label the owner has flagged unresolved. F0B's
`unresolvedGold.policy` says exactly this case is
`BLOCKED_PENDING_OWNER_GOLD_ADJUDICATION`, and it is reported by name with both
denominators in `goldQuestionSensitivity.gateVerdictFlips`, not as a boolean.

Leave-one-out changes nothing else: validator validity is identical (48 items:
44 A→A, 2 R→A, 0 A→R, 2 R→R), no other gate flips, and V2's gates are unchanged.
Verdict net moves from +2 to +3 — the same sign.

**Its label was not adjudicated, changed or reinterpreted here.** The projected
label and F0B's preserved label agree (`UNIT_PAGE`) and the scorer refuses to
proceed if they ever disagree.

---

## 10. Recommendation

### `BLOCKED_PENDING_OWNER_GOLD_ADJUDICATION`

**Derived, not chosen.** The rule is F0B's: a frozen gate verdict changes when
the open owner gold question is removed, so the final status is blocked. No
threshold was invented, relaxed or re-tuned anywhere in this task.

**What the evidence says underneath the block.** Had the gold question been
settled, the derived outcome would have been
`KEEP_PROMPT_V1_AND_REVISE_V2` — because V2 loses a gate V1 met
(`minUnitTypeAccuracy`) and three fields regress on paired per-item comparison.
That is a conditional statement about the scorer's rule, not a recommendation:
the block is the recommendation.

**The substantive reading, which the owner should weigh separately from the
block.** Neither prompt is acceptable as it stands — both fail
`minSchemaValidSpanVerifiedRate` and `minUnitPageRecall`. They fail
*differently*, and each fixes something real in the other:

- V2 is **strictly better at rejecting non-units**: 33/33 verdict-correct on
  `NOT_A_UNIT` gold, 21/21 hard negatives, `minUnitPagePrecision` met, and it
  eliminated twelve `NO` answers that were wrong twelve times out of twelve.
- V1 is **strictly better at recognising units**: it answered all twelve
  answerable `UNIT_PAGE` items correctly; V2 lost three of them, and every axis
  and `unit_type` regression follows mechanically from those three.

A V3 that keeps V2's non-unit discipline and its `UNKNOWN`-over-`NO` calibration
while restoring V1's willingness to call a unit a unit is the indicated
direction. **Nothing here establishes that; it is a hypothesis for the next
prompt revision, not a measured result.**

### Scope

DEVELOPMENT split only, 49 items, one sample per variant. This authorises **no**
merge to main, **no** HOLDOUT run, **no** production configuration change, **no**
deployment and **no** attempt 2. Validator acceptance is reported throughout as
a separate metric and is never presented as semantic correctness.

---

## 11. Validation

`npm run validate` — **84 test files passed, 1778 tests passed, 527 skipped**
(integration tests need the local database), typecheck, lint, format check and
build all clean.

- Focused projector tests: 25 passed (including 5 mutation tests and the
  shadow-root end-to-end run).
- Focused gold-scoring tests: 22 passed.
- Formatting-scope probe: 6 passed. Formatting firewall: 8 passed. Projector
  firewall: 13 passed.
- `git diff --check`: clean.
- **Deterministic derivation ×3** into three separate directories outside the
  repository, for both the no-gold and the gold-backed paths: byte-identical
  every time, and identical to the committed bytes.
- **Attempt 1 byte-identical before and after:** 243 artifacts, aggregate
  `ee17e1f2ee8021e59c06377342042e56f84269165f8ec39521011cb1d3538137`.
- No temporary mixed-file copy, discarded-row file or debug file remains; the
  scratch directory was emptied and no `f4a-*` temporary directory survives.

### Firewall protection added

- The scoring fixture and the supplement are named by **no** production module
  (every `.ts` under `src/` outside `src/test/` is scanned).
- The inference runner cannot reach either: the transitive import graph from
  `cli.ts`, `coordinator.ts` and `childMain.ts` names neither path, and names
  `goldProjection` nowhere.
- The F0B freeze references neither, and its raw hash is pinned.
- The projector imports no execution, provider, loader, orchestrator or database
  module; no socket, child-process or provider package; and names no inference,
  authentication or process-spawning capability.
- `.prettierignore` may carry no directory-shaped or glob rule under
  `docs/evaluation/`.

---

## 12. Remaining uncertainty

- **The open owner gold question `ge789b0f0aedc398c` is still open**, and it is
  now known to decide a gate verdict. Resolving it is the single highest-value
  action available.
- **49 items is a small DEVELOPMENT set.** Several denominators are 12–14 items,
  where one item moves an accuracy figure by 7–8 points. `minUnitTypeAccuracy`
  flipping on one item is exactly this fragility. No confidence interval is
  reported because none would be honest at this size; the McNemar statistic is
  labelled exploratory in the output itself.
- **One sample per variant, from a stochastic model.** Nothing here separates a
  prompt effect from sampling variance.
- **Both prompts fail the acceptance gate set.** No promotion decision is
  available on this evidence even with the gold question settled.
- **HOLDOUT remains pristine** — 23 items, zero inference, zero semantic
  inspection. Nothing in this task touched it, and its records were never
  deserialized.
- **`page_kind` is the weakest field for both prompts** (V1 .5152, V2 .6667
  strict) and the least concordant (27 agree / 18 disagree). Why is not
  established here.
- The two persistent `EVIDENCE` rejections are a model-behaviour limit on two
  specific documents; whether a prompt change could fix them is untested.

---

## 13. Exact next task

**Owner adjudication of `ge789b0f0aedc398c`**, recorded the way every other gold
label is recorded, followed by a rerun of the F4A scorer against the same
preserved attempt 1 — no new inference, no new authorisation, no attempt 2.

That rerun will either lift the block (if the gate verdict stops depending on
the item) or confirm it. Only after it should a prompt-revision task be opened;
and on this evidence that task should be **a V3 that combines V2's non-unit
discipline with V1's unit recall**, not a promotion of either variant as it
stands.

**Do not run HOLDOUT.** Both prompts fail `minSchemaValidSpanVerifiedRate` and
`minUnitPageRecall` on DEVELOPMENT; spending the holdout on either would burn it
for no decision.
