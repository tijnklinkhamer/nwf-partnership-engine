# Phase 2B-2D2C-F4 — DEVELOPMENT Scoring and Prompt Attribution, Attempt 1

Status: **BLOCKED — the DEVELOPMENT gold labels are not reachable from any
source this task is permitted to open.** The preserved F3 evidence is
intact and was fully verified; validator validity, its paired transitions
and gold-free v1↔v2 answer concordance were measured and are reported
here. **No semantic accuracy metric exists**, for either variant, because
no gold-backed field has a denominator. Nothing was executed, no model was
contacted, and no gold label was created, changed or adjudicated.

## 1. Baseline, ancestry, branch and worktree

- `origin/main`: `7adf895fa20e9b25758e0748d1a02e26c387d19b`, unchanged
  before and after this task; the primary `main` worktree stayed
  tracked-clean throughout.
- F3 remote HEAD, the exact start point:
  `cd585aa9b4ca58353059acf62942665ad9492bff` (prefix `cd585aa`, as
  required).
- New branch: `feat/phase2b-2d2c-f4-scoring-attribution-recovery`, created
  from that exact commit — no rebase, no force, no history edit.
- New worktree:
  `/Users/tijnklinkhamer/Developer/wt-phase2b-2d2c-f4-scoring-attribution-recovery`.
- Pre-existing worktrees verified tracked-clean at their expected commits
  before anything was created: F3 at `cd585aa…`, corrected runtime v1 at
  `0d2928a474796b89fad0644e99b5b934ecad10d0`, corrected runtime v2 at
  `c37dd5a73d0f285b97a0a9a43bf0e42be8fc99c7`. No F4 branch and no F4
  worktree existed beforehand, so nothing was overwritten.
- Repository-local Git identity throughout:
  `Tijn Klinkhamer <tijnklinkhamer@newwavefluent.com>`. Global Git
  configuration was not read for modification and not changed.
- The only dependency work in this worktree was `npm ci` (lockfile-exact).
  It touches no tracked file.

## 2. Source and artifact hashes

| item | value |
| --- | --- |
| F0B freeze raw SHA-256 | `c3f0a76b3a5939f3e4bf395d46237cf0b0f365fa1f4bf019092a6944849d6157` |
| freeze version | `phase2b-2d2c-dev-configuration-freeze-v1` |
| plan SHA-256, REBUILT here from the freeze and corpus | `05cb6984a57a871ac6b0a0720ab2fefceb5b5843f440dbf7831abdf9bfc82f6c` |
| canonical DEV corpus raw SHA-256 | `c5a9923a35689fd8b0950d615ee5339c6ccc63e83ac067960760497b6a9c4536` |
| canonical DEV manifest raw SHA-256 | `9ef7dfb45307004297f019351163b06478d2f552834f10496545cfaf1a9a20f6` |
| corpus content SHA-256 | `f00139e42ff5d12dfc1a6ba1b969a635197ddda27f79515473f119ff919a6fa2` |
| corpus scope / rows | `DEVELOPMENT`, 49 |
| spent authorisation SHA-256 (recomputed) | `46d1bd9ebed544f7ebf463f26ff6ec7cca89d8a9d849fdfd04a42412dc2d5705` |
| consumption marker file SHA-256 | `cf27a3a9d15191022c13d649579ebab9f3bfeaa275bf0e62ee7b77c87b1d65bf` |
| `consumedAtUtc` | `2026-09-13T20:20:07.472Z` |
| artifacts verified through `readArtifact` | **243 / 243, 0 failures** |
| 243-file inventory aggregate SHA-256 | `ee17e1f2ee8021e59c06377342042e56f84269165f8ec39521011cb1d3538137` |
| experiment status | `COMPLETED_ALL_PLANNED` |
| experiment completed | `2026-09-13T20:28:39.194Z` |
| v1 runtime commit / prompt | `0d2928a4…`, `orgunit-classifier-prompt-v1` `65f7f327…` |
| v2 runtime commit / prompt | `c37dd5a7…`, `orgunit-classifier-prompt-v2` `181a5d6f…` |

The inventory aggregate equals the value F3 recorded, byte for byte, so the
preserved evidence is provably the same evidence F3 closed on.

**Every one of the expected frozen conditions held**: 24/24 evaluations,
sequences 1–12 `PROMPT_V1_CANONICAL` then 13–24 `PROMPT_V2_CANONICAL`,
exactly one `attempt-1` directory per batch (write-once), raw checkpoint
persisted strictly before validation in all 24, `stop: false` /
`stopCondition: null` / `haltKind: null` in all 24, Tier-2 `COMPLETED` with
exit 0 in all 24, and item-level validator totals **V1 45 accepted / 4
rejected** and **V2 47 accepted / 2 rejected**.

## 3. Proof of zero inference and zero external access

- Nothing in this task invoked the execution CLI. `cli.ts --execute` was
  not run, not even as a negative test.
- Zero provider calls, zero SDK `query()` calls, zero Claude CLI calls,
  zero auth-status calls, zero profile access, zero database access, zero
  institutional requests.
- `.claude-nwf-classifier` and the quarantined settings file were not
  opened.
- The spent authorisation was re-hashed (read-only) and never presented to
  any execution path. The consumption marker was neither modified nor
  deleted. No attempt 2 exists.
- **The preserved attempt is byte-identical before and after this task**: a
  243-file `shasum -a 256` inventory taken at the start and again at the end
  differs in nothing, and the aggregate is the F3 value above.
- `src/test/firewall/phase2b2d2cF4Scorer.firewall.test.ts` walks the
  scorer's TRANSITIVE import graph from its three entry points and asserts
  it reaches none of `cli.ts`, `coordinator.ts`, `childMain.ts`,
  `childEnvironment.ts`, `runtimeLoader.ts`, `variantRoot.ts`,
  `variantRootProbes.ts`, `authorisation.ts`, `processIsolatedBatch.ts`,
  `src/orgunits/classify/provider`, `loaders.ts`, `persist.ts`,
  `orchestrate.ts`, `src/db/`, `web/gateway.ts`, `web/robots.ts` or
  `src/orgunits/orchestrator/`; imports no `node:child_process`,
  `node:http(s)`, `node:net`, `node:tls`, `node:dns`, `node:worker_threads`
  or `node:cluster`; imports no `pg` and no `@anthropic-ai/*` package; names
  no `AgentSdkRunner`, `evaluateExecutionLock`, `runExperiment`,
  `runProcessIsolatedBatch`, `authStatus`, `query(`, `spawn(`, `execFile`,
  `execSync`, `fetch(` or `--execute` in its own code; and writes through
  exactly one module (`emit.ts`).
- A runtime test additionally patches `fs.readFileSync` during a full
  scoring pass and asserts that **no file the freeze lists as never-read,
  and no gold or adjudication fixture, is opened at all**.

## 4. Scoring implementation and tests

New, under the test-harness boundary, `src/test/harness/phase2b2d2c/scoring/`:

| file | what it is |
| --- | --- |
| `constants.ts` | frozen scorer identities, expected totals, the four diagnostic slices, the open owner gold id, the recorded HOLDOUT size. PURE. |
| `gold.ts` | DERIVES which gold-backed fields a DEVELOPMENT-only source can supply, from the real schemas; `requireAvailable` throws rather than let an unavailable field be scored. PURE. |
| `sources.ts` | read-only load + full integrity verification of freeze, corpus, rebuilt plan and all 243 artifacts through the harness's own `readArtifact`. |
| `metrics.ts` | exact integer counts; strict and conditional denominators computed separately; `null` for every zero denominator; ternary precision/recall/F1, macro-F1, confusion matrices; McNemar. PURE. |
| `score.ts` | one row per (item, variant): identity, validator state, STRUCTURED prediction fields, gold where any exists, field correctness, scoring eligibility. PURE. |
| `paired.ts` | joins v1↔v2 **by gold id**, never by position; keeps validity and correctness transitions apart; gold-free concordance. PURE. |
| `summarise.ts` | the deterministic summary and the DERIVED recommendation. PURE. |
| `emit.ts` | the three derived outputs, canonically serialized and deterministically ordered. The only writer. |
| `run.ts` / `generate.ts` | the whole read-only pass, and its entry point. |

Repository implementations were reused rather than reimplemented:
`readArtifact` (envelope + `recordSha256` verification), `loadFreezeFromBytes`,
`loadDevCorpus`, `reconstructAndVerifyFrozenBatches`, `buildExecutionPlan` /
`planSha256` / `planOrderIsFrozen`, `canonicalStringify`, `sha256Hex`,
`ClassificationResultSchema`, `ProposedLabelSchema` / `GoldCorpusItemSchema`,
`computeFinalInputSha256`.

Tests, 34 in three files:

| file | tests | what it pins |
| --- | ---: | --- |
| `src/test/unit/orgunitClassify2D2CF4Scoring.test.ts` | 27 | metrics, denominators, identity joins, gold availability, emission determinism, and the preserved-attempt coverage/integrity checks |
| `src/test/unit/orgunitClassify2D2CF4ScorerNeverReads.test.ts` | 1 | BEHAVIOURAL: `node:fs` is mocked and every path a real scoring pass reads is recorded and checked against the never-read list |
| `src/test/firewall/phase2b2d2cF4Scorer.firewall.test.ts` | 6 | the transitive import graph |

The preserved-attempt tests are gated on `PHASE2B_2D2C_ATTEMPT1_ROOT`, because
that evidence lives outside every worktree and is absent in CI; the gate is
explicit and the skip is visible, never a silent pass.

```bash
PHASE2B_2D2C_ATTEMPT1_ROOT=/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-1 \
  npm run validate
```

**One pre-existing test was adapted, and strengthened rather than weakened.**
`orgunitClassify2D2CF1Isolation.test.ts`'s `harnessFiles()` listed the runner
namespace NON-recursively; the namespace had never had a subdirectory before,
and `scoring/` made it raise `EISDIR`. It now walks recursively, which both
fixes the error and brings all ten new scorer files inside that test's
existing "no `pg`, no db helper, no socket, no `fetch()`, no SDK, no
production-loader reference" assertions. No assertion was relaxed.

Two derived-output files were also added to `.prettierignore`: their bytes are
`canonicalStringify` output pinned by a manifest of their own SHA-256s, and
the formatter was rewriting them, which would have broken the byte-stability
the derivation exists to provide.

The scorer fails CLOSED on: a duplicate gold id, a missing item, an extra
item, an extra or missing artifact file, a second attempt directory, a
batch/sequence mismatch, a corpus-order mismatch, a variant or prompt or
runtime-commit mismatch, a final-input-identity mismatch, conflicting
validator records for one document, an artifact hash failure, a recorded
stop condition, a non-`COMPLETED_ALL_PLANNED` experiment, any non-DEVELOPMENT
row, and any attempt to score a field no permitted source supplies.

## 5. Denominators and metric definitions

- **STRICT** — denominator is every one of the 49 DEVELOPMENT items per
  variant. A validator-rejected or missing item counts **INCORRECT**. This
  is the primary view: a prompt must not raise apparent accuracy by emitting
  unverifiable output.
- **CONDITIONAL** — denominator is the validator-**accepted** items only,
  reported alongside every conditional number. The two are computed by
  separate functions over separate inputs and are never mixed.
- Exact integer counts are authoritative; percentages are derived
  presentation only. A zero denominator yields `null`, never `0`.
- Page/unit classification is reported in the **exact schema categories**
  (`UNIT_TYPES`, `PAGE_KINDS`), never collapsed.
- Validator acceptance/rejection is reported **separately** from semantic
  correctness. "Validator accepted" is never treated as "gold correct".

## 6. THE BINDING FINDING — the DEVELOPMENT gold labels are unreachable

**The canonical DEVELOPMENT corpus carries no gold labels at all.**
`GoldCorpusItemSchema` is document evidence — identity, provenance, the
`ClassifierDocument`, mechanical strata. It exposes none of the eight
gold-backed fields `ProposedLabelSchema` defines (`verdict`, `unit_type`,
`page_kind`, the three relevance axes, `unit_name_expectation`,
`hard_negative`). This was verified programmatically by intersecting the
schemas' own key sets, not asserted from prose.

**The labels for this corpus exist in exactly one file**,
`src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-adjudication-v1.jsonl`.
That file holds **72 records** — the whole Sonnet acceptance corpus, i.e. the
49 DEVELOPMENT items plus the 23 HOLDOUT items the 2D2B remote-truth audit
records — and `AdjudicationItemSchema` carries **no `split` field**, so it
cannot be filtered to one split without first reading rows that may be
HOLDOUT. The F0B freeze therefore lists it under
`corpus.holdoutFilesNeverRead`, and the F4 task forbids opening an
adjudication corpus or a mixed DEVELOPMENT/HOLDOUT file at all.

**That file was not opened — not to read it, not to filter it, not even to
count its lines.** Its record count is stated as 49 (the verified corpus) +
23 (the audit-recorded HOLDOUT size).

Consequently, per the F4 task's own instruction ("If any required gold field
is unavailable in the DEVELOPMENT-only canonical corpus, do not obtain it
from a mixed fixture. Mark that metric unavailable and explain why"):

| gold-backed field | availability | source |
| --- | --- | --- |
| `verdict` | **1 of 49 items** | F0B freeze `unresolvedGold` |
| `unit_type` | UNAVAILABLE | — |
| `page_kind` | UNAVAILABLE | — |
| `serves_incoming_international_students` | UNAVAILABLE | — |
| `serves_outgoing_mobility_students` | UNAVAILABLE | — |
| `provides_language_learning_or_support` | UNAVAILABLE | — |
| `unit_name_expectation` | UNAVAILABLE | — |
| `hard_negative` | UNAVAILABLE | — |

So: **support 0, correct 0, incorrect 0, strict accuracy `null`, conditional
accuracy `null`, confusion matrix empty** for every field except the single
freeze-preserved `verdict`. Every per-class precision, recall, F1 and
macro-F1 is `null` for the same reason. No number in this document is a
semantic accuracy, and none may be quoted as one.

`unit_name` and evidence spans are reported only as **validator
acceptance/rejection**, plus (for cross-variant comparison without
reproducing text) a presence flag and a SHA-256. No gold `unit_name` value
exists, so no name-agreement metric is computed.

## 7. What IS measured — validator validity, complete for both variants

| | PROMPT_V1_CANONICAL | PROMPT_V2_CANONICAL |
| --- | ---: | ---: |
| items | 49 | 49 |
| validator ACCEPTED | **45** | **47** |
| validator REJECTED | **4** | **2** |
| acceptance rate | 45/49 = 0.9184 | 47/49 = 0.9592 |
| rejection category | `EVIDENCE` ×4 | `EVIDENCE` ×2 |
| output tokens (sum) | 25,709 | 17,541 |
| provider wall time (sum ms) | 294,160 | 202,586 |

Both match F3's recorded totals exactly.

### Paired transition matrix (49 pairs, joined by gold id)

| transition | count |
| --- | ---: |
| ACCEPTED → ACCEPTED | **45** |
| REJECTED → ACCEPTED (validity recovery) | **2** |
| ACCEPTED → REJECTED (validity regression) | **0** |
| REJECTED → REJECTED | **2** |
| net validity change | **+2 for v2** |

### Every validator-rejected item, by gold id

| goldId | batch | doc | organisation | V1 | V2 | validator reason |
| --- | ---: | ---: | --- | --- | --- | --- |
| `g0ec0d43dad311a77` | 7 | 1 | `F PARIS003\|999885119` | REJECTED | REJECTED | `unit_name is not supported by any supplied field` (both) |
| `g877a05e6f5bba835` | 7 | 2 | `F PARIS003\|999885119` | REJECTED | REJECTED | `evidence_spans[0] (source=HEADING) is not a literal substring of the supplied field` (both) |
| `g32779df2d7b56a34` | 8 | 13 | `F PARIS105\|949302432` | REJECTED | ACCEPTED | v1: `unit_name is not supported by any supplied field` |
| `g956f99fae4ad4764` | 8 | 14 | `F PARIS105\|949302432` | REJECTED | ACCEPTED | v1: `unit_name is not supported by any supplied field` |

**The two validity recoveries are `g32779df2d7b56a34` and
`g956f99fae4ad4764`. There are no validity regressions.**

### Semantic correctness transitions

Not computable, except on the single freeze-preserved item — see §9. Across
all eight gold-backed fields the paired counts are
`CORRECT_TO_CORRECT 0 / INCORRECT_TO_CORRECT 0 / CORRECT_TO_INCORRECT 0 /
INCORRECT_TO_INCORRECT 0 / GOLD_UNAVAILABLE 49`, with the one exception noted.

### Gold-free v1↔v2 answer concordance (45 comparable pairs)

| field | agree | disagree |
| --- | ---: | ---: |
| `verdict` | 37 | **8** |
| `unit_type` | 38 | 7 |
| `page_kind` | 27 | **18** |
| `serves_incoming_international_students` | 38 | 7 |
| `serves_outgoing_mobility_students` | 37 | 8 |
| `provides_language_learning_or_support` | 33 | 12 |
| `confidence` | 38 | 7 |
| `unit_name_present` | 33 | 12 |
| `unit_name` (by SHA-256) | 31 | 14 |

This is **agreement, not accuracy**. Four pairs are `NOT_COMPARABLE` because
at least one side was rejected.

### The eight verdict disagreements — all in ONE direction

| goldId | organisation | V1 | V2 |
| --- | --- | --- | --- |
| `g04b64db14c03ce3a` | `F NANTES79\|924638533` | UNIT_PAGE / OTHER_UNIT | NOT_A_UNIT / NAVIGATION_OR_LANDING_PAGE |
| `g04d170f4d3fda759` | `F PARIS482\|897691060` | UNIT_PAGE / INTERNATIONAL_MOBILITY_OFFICE | NOT_A_UNIT / OTHER_NON_UNIT |
| `g3130d41296ab8739` | `F EVRY04\|999850296` | UNIT_PAGE / INTERNATIONAL_MOBILITY_OFFICE | NOT_A_UNIT / OTHER_NON_UNIT |
| `g536c8b148048fcbc` | `F ROUEN06\|999465788` | UNIT_PAGE / INTERNATIONAL_MOBILITY_OFFICE | NOT_A_UNIT / OTHER_NON_UNIT |
| `g57607d4278d6dc23` | `F EVRY04\|999850296` | UNIT_PAGE / INTERNATIONAL_MOBILITY_OFFICE | NOT_A_UNIT / NAVIGATION_OR_LANDING_PAGE |
| `g66010a25ac194274` | `F DIJON35\|949637858` | NEEDS_REVIEW | NOT_A_UNIT / NEWS_OR_EVENT_PAGE |
| `ge789b0f0aedc398c` | `F NANTES79\|924638533` | UNIT_PAGE / INTERNATIONAL_MOBILITY_OFFICE | NOT_A_UNIT / GENERIC_INSTITUTIONAL_PAGE |
| `gf65026e32d9da8db` | `F PARIS003\|999885119` | UNIT_PAGE / INTERNATIONAL_MOBILITY_OFFICE | NOT_A_UNIT / OTHER_NON_UNIT |

**Every one of the eight moves toward NOT_A_UNIT. None moves the other way.**
Prompt v2 is systematically more conservative: `UNIT_PAGE` falls from 17 to
10, `NOT_A_UNIT` rises from 27 to 37, `NEEDS_REVIEW` from 1 to 0, and
`INTERNATIONAL_MOBILITY_OFFICE` from 13 to 7. Whether that is 8 false
positives removed or 8 real units lost **cannot be determined here**, and
on the one item where any gold exists the shift is in the wrong direction
(§9).

### Relevance-axis behaviour

V1 answered `NO` twelve times across the three axes (9 language-support, 1
incoming, 2 outgoing). **V2 answered `NO` zero times on every axis** — its
non-null answers are only `YES` or `UNKNOWN`. `RESEARCH_PAGE` likewise drops
from 3 to 0. These are behavioural facts; without gold axis values they are
not evidence of better or worse calibration in either direction.

## 8. Required diagnostic slices

Gold is `NONE` for every row except the last; validity and both predictions
are shown.

### Previously invalid/rejected items (historical DEV v1)

| goldId | V1 | V2 | V1 answer | V2 answer | transition |
| --- | --- | --- | --- | --- | --- |
| `ga435ea22d4b11cf4` | ACCEPTED | ACCEPTED | NOT_A_UNIT / OTHER_NON_UNIT | NOT_A_UNIT / SERVICE_TOOL_PAGE | ACCEPTED→ACCEPTED |
| `gdb5b7246327094ef` | ACCEPTED | ACCEPTED | UNIT_PAGE / INTERNATIONAL_MOBILITY_OFFICE | UNIT_PAGE / INTERNATIONAL_MOBILITY_OFFICE | ACCEPTED→ACCEPTED |
| `g0ec0d43dad311a77` | REJECTED | REJECTED | — | — | REJECTED→REJECTED |
| `g877a05e6f5bba835` | REJECTED | REJECTED | — | — | REJECTED→REJECTED |
| `gcce4e2a5f608de5d` | ACCEPTED | ACCEPTED | UNIT_PAGE / LANGUAGE_DEPARTMENT | UNIT_PAGE / LANGUAGE_DEPARTMENT | ACCEPTED→ACCEPTED |
| `gf65026e32d9da8db` | ACCEPTED | ACCEPTED | UNIT_PAGE / INTERNATIONAL_MOBILITY_OFFICE | NOT_A_UNIT / OTHER_NON_UNIT | ACCEPTED→ACCEPTED |

**4 of the 6 historically-rejected items now validate under BOTH prompts; 2
are still rejected under both.** That is a validity statement only.

### Page-versus-unit items

| goldId | V1 | V2 | V1 answer | V2 answer | transition |
| --- | --- | --- | --- | --- | --- |
| `g32779df2d7b56a34` | REJECTED | ACCEPTED | — | NOT_A_UNIT / GENERIC_INSTITUTIONAL_PAGE | REJECTED→ACCEPTED |
| `g956f99fae4ad4764` | REJECTED | ACCEPTED | — | NOT_A_UNIT / GENERIC_INSTITUTIONAL_PAGE | REJECTED→ACCEPTED |
| `g04d170f4d3fda759` | ACCEPTED | ACCEPTED | UNIT_PAGE / INTERNATIONAL_MOBILITY_OFFICE | NOT_A_UNIT / OTHER_NON_UNIT | ACCEPTED→ACCEPTED |
| `g04b64db14c03ce3a` | ACCEPTED | ACCEPTED | UNIT_PAGE / OTHER_UNIT | NOT_A_UNIT / NAVIGATION_OR_LANDING_PAGE | ACCEPTED→ACCEPTED |
| `g4454e841c09dd8d0` | ACCEPTED | ACCEPTED | NOT_A_UNIT / OTHER_NON_UNIT | NOT_A_UNIT / SERVICE_TOOL_PAGE | ACCEPTED→ACCEPTED |

### UNKNOWN/NO calibration items

| goldId | V1 | V2 | V1 axes (in/out/lang) | V2 axes (in/out/lang) |
| --- | --- | --- | --- | --- |
| `ge419f0b9902faee0` | ACCEPTED | ACCEPTED | YES / UNKNOWN / **NO** | YES / UNKNOWN / UNKNOWN |
| `g34bbf7536e99b410` | ACCEPTED | ACCEPTED | YES / UNKNOWN / **NO** | YES / UNKNOWN / UNKNOWN |
| `ga971a6fc52af6b5f` | ACCEPTED | ACCEPTED | YES / UNKNOWN / **NO** | YES / UNKNOWN / UNKNOWN |
| `g735298870fe173b8` | ACCEPTED | ACCEPTED | YES / UNKNOWN / **NO** | YES / UNKNOWN / UNKNOWN |

All four keep `UNIT_PAGE` / `INTERNATIONAL_MOBILITY_OFFICE` under both
prompts. The four axis changes are all `NO → UNKNOWN`. No gold axis value
exists to grade them.

### Open owner question

| goldId | V1 | V2 | gold | source |
| --- | --- | --- | --- | --- |
| `ge789b0f0aedc398c` | ACCEPTED, UNIT_PAGE / INTERNATIONAL_MOBILITY_OFFICE | ACCEPTED, NOT_A_UNIT / GENERIC_INSTITUTIONAL_PAGE | `UNIT_PAGE` | F0B freeze `unresolvedGold` |

**No additional comparator ids were discovered.** The four slices above are
exactly the ids the F4 task named; every one was verified to be a member of
the 49-row DEVELOPMENT canonical corpus. No mixed or HOLDOUT fixture was
opened to look for more.

## 9. Gold-question sensitivity — `ge789b0f0aedc398c`

Its label is kept **exactly as the owner preserved it** (`UNIT_PAGE`). It was
not adjudicated, reinterpreted or changed; `labelChangedByThisTask: false`.

| view | items | validity net change | verdict pairs scorable | verdict net strict change |
| --- | ---: | ---: | ---: | ---: |
| primary (includes it) | 49 | +2 | **1** | **−1** |
| leave-one-out (excludes it) | 48 | +2 | **0** | 0 |

Under v1 this item is **CORRECT** against its committed label; under v2 it is
**INCORRECT** (`CORRECT_TO_INCORRECT`). Exploratory McNemar on the discordant
pair: b=1, c=0, χ²=1 — a single-item statistic, reported only because the
task asks for it, and **not** evidence of anything.

This item is the **only** gold-backed comparison that exists. Removing it
removes every semantic pair. F0B's `unresolvedGold.policy` fires exactly
here ("if any pass/fail gate differs between the primary metrics and the
leave-one-out report, the final status is
BLOCKED_PENDING_OWNER_GOLD_ADJUDICATION"), so
**`BLOCKED_PENDING_OWNER_GOLD_ADJUDICATION` holds concurrently** with the
primary recommendation, and the summary records it in `concurrentStatus`.

The open owner consistency question is **retained, not closed**: v2's answer
on this page disagrees with the committed label, and this page is precisely
the one the owner had already flagged as unresolved.

## 10. Historical-comparison limitations

- The historical DEV v1 pass ran under the **earlier evidence
  representation**, and its raw rejected outputs **were not preserved** by
  the old harness (2D2B remote-truth audit §3). No preserved artifact for it
  exists, so nothing from it is reconstructed here.
- Its six reported rejections are cited as **recorded context only** — the
  goldIds are used to define a diagnostic slice, and nothing more. No
  historical item prediction is reconstructed or invented.
- **Evidence-canonicalisation recovery and prompt-v2 recovery are NOT
  conflated.** Both variants in this experiment ran on the SAME canonical
  inputs, so the 4-of-6 improvement in the historically-rejected slice is
  attributable to canonicalisation (it holds under v1 as well as v2), while
  the v1↔v2 differences are attributable to the prompt change alone.
- The Phase 2A `93.0% / 97.6%` figures and the 2026-08-24 holdout totals
  remain AUDIT FINDINGS from deleted tooling. They are not quoted here as a
  target, baseline or comparison.

## 11. Recommendation and its precise scope

### `INSUFFICIENT_VALID_DEV_EVIDENCE`

with **`BLOCKED_PENDING_OWNER_GOLD_ADJUDICATION` holding concurrently** (§9).

Basis, in order of bindingness:

1. **No gold-backed field is reachable from any DEVELOPMENT-only source.**
   Semantic accuracy has no denominator for either variant, so neither can be
   shown better or worse. This is the binding blocker, and adjudicating
   `ge789b0f0aedc398c` would not lift it — 48 of 49 items would still have no
   gold.
2. **The only gold-backed comparison that exists is the open owner gold
   question, and v2 gets it wrong** against the committed label. Excluding it
   leaves no semantic evidence at all, so F0B's leave-one-out rule fires.
3. Validity is measured and is unambiguous in v2's favour (+2 recoveries, 0
   regressions), but validity is not correctness, and the task's own strict
   rule exists precisely to stop a validity gain being read as a quality gain.
4. The measured behavioural shift is **large, systematic and of unknown
   sign**: 8/8 verdict disagreements move toward `NOT_A_UNIT`, `page_kind`
   disagrees on 18 of 45 comparable pairs, and v2 stops using the `NO` value
   on every relevance axis. Promoting a prompt with a change of that size and
   an unknown sign, on no accuracy evidence, would be exactly the
   "improvement based only on aggregate accuracy" the freeze's
   `requiredComparison` forbids — with even less support, since there is no
   accuracy at all.

**Scope.** This concerns the DEVELOPMENT split only. It authorises no merge
to `main`, no HOLDOUT run, no production configuration change and no
deployment. It also invents **no acceptance threshold** — the freeze's gates
were not applied, because every one of them needs a gold denominator that
does not exist here.

**No claim of causality is made.** Both variants used the same canonical
inputs and the same frozen batching, which supports controlled attribution,
but the model is stochastic and each variant was sampled exactly once.

## 12. Derived outputs

`docs/evaluation/results/phase2b-2d2c-dev-attribution-attempt-1/`

| file | SHA-256 | bytes |
| --- | --- | ---: |
| `scored-items.jsonl` | `d79a6ec0a482dcad982c017e8de610f41f084bfe61b2470b548981986cc114a1` | 212,908 |
| `summary.json` | `10da1eef98795c1aadc6f0b853e5287e7f27174527242d653d7723b224f71f3a` | 27,461 |
| `manifest.json` | `81eae76c861efa78a6d761547bcd694164c2737bbe9a75675f8cfaf9a56b6e1a` | 1,752 |

98 scored rows (49 items × 2 variants), ordered by `(goldId, variantName)`,
one canonical JSON object per line. The derivation was run **twice into
separate temporary directories and once into the committed directory; all
three are byte-identical** (`diff -r`, no differences).

Each row carries only: item/gold identity, corpus-order and batch identity,
variant, artifact/checkpoint hashes, validator state and rejection
category/reason, the STRUCTURED prediction fields, the corresponding gold
fields, field-level correctness, and strict/conditional eligibility. It
carries **no** raw model output, chain of thought, rationale, evidence
excerpt, credential, profile value or provider transcript — `unit_name` is
reduced to a presence flag plus a SHA-256, and evidence spans to their source
enum and count.

## 13. Validation results

| check | result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm run lint` | pass, 0 problems |
| `npm run format:check` | pass |
| `git diff --check` | clean |
| `npm run migrations:check` | pass |
| `npm run test:firewall` | **205 passed**, 5 files (the four landed firewalls plus the new F4 scorer firewall) |
| `npm run validate`, WITHOUT the preserved attempt | **1,694 passed / 537 skipped**, 78 files passed |
| `npm run validate`, WITH `PHASE2B_2D2C_ATTEMPT1_ROOT` set | **1,704 passed / 527 skipped**, 79 files passed |
| `npm run build` | pass |

The ten-test difference is exactly the preserved-attempt gate: those checks
run here and skip visibly in CI.

### Mutation checks (each applied to real source, then restored byte-identically)

| # | mutation | detected by | restored SHA-256 verified |
| ---: | --- | --- | --- |
| 1 | count a validator-rejected answer as CONDITIONALLY CORRECT (`metrics.ts`) | 2 tests failed | `c64604c3…10c9` ✓ |
| 2 | join v1↔v2 by POSITION instead of gold id (`paired.ts`) | 1 test failed | `97b9b4ef…ecb9` ✓ |
| 3 | omit the gold-question leave-one-out (`summarise.ts`) | 1 test failed | `48244f06…d88ea` ✓ |
| 4 | ignore an artifact `HASH_MISMATCH` (`sources.ts`) | 1 test failed | `d6c44ccc…7299` ✓ |

Every mutated file was restored to its exact pre-mutation SHA-256 and the
full suite passes again. No test executed inference or an auth-status check
at any point.

### Coverage assertions specifically pinned

49×2 item coverage; V1 45/4 and V2 47/2; variant order 1–12 then 13–24;
identity joins; rejected counted incorrect in strict metrics; rejected
excluded from conditional denominators; confusion-matrix totals reconcile
with support; no zero-denominator fabrication; gold-question leave-one-out;
duplicate / missing / extra / cross-variant items fail closed; a corrupted
artifact hash fails (verified on a COPY — the preserved attempt is never
touched); an extra artifact file fails; a second attempt directory fails;
scoring writes nothing into attempt 1; output generation is byte-stable; the
scorer has no provider/auth/DB/execution dependency; no never-read file is
opened.

## 14. Protected state and cleanup

- The preserved attempt is **byte-identical** before and after: 243 files,
  aggregate `ee17e1f2ee8021e59c06377342042e56f84269165f8ec39521011cb1d3538137`.
- The spent authorisation `attempt-1.json` still hashes to
  `46d1bd9e…2d5705`, mode `0600`, 1,053 bytes. **It remains spent and must
  never be presented to the execution CLI again.**
- The consumption marker is unchanged and was neither deleted nor reused.
- No attempt 2 was created. No gold label was created, changed or
  adjudicated. No runtime root was changed; both remain tracked-clean at
  `0d2928a4…` and `c37dd5a7…`. No production code, migration, prompt,
  freeze, corpus or lockfile was changed.
- No database connection was opened; no institution was contacted; no
  account was switched; no profile directory was opened.
- Temporary derivation directories and the mutation backups live only in the
  session scratchpad and are not part of the repository.
- **HOLDOUT**: no HOLDOUT gold id, label, document, count-derived metric or
  data value appears in any input or output of this task. The string
  `HOLDOUT` appears in `summary.json` only inside the prose explaining which
  mixed file was deliberately NOT opened.

### One disclosure

During source discovery this session read
`src/orgunits/classify/evaluation/acceptanceSelection.ts` — a committed
PRODUCTION source file, and a legitimate source under "relevant production
schemas and implementations". Its `REVIEWED_GOLD_IDS` list carries inline
prose comments naming the intended label for 36 acceptance-corpus goldIds,
and those 36 span both splits. Split membership was **not** looked up, no
label from those comments was used anywhere in the scorer, the audit or the
derived outputs, and no HOLDOUT item was identified. This is the same class
of exposure the F0B freeze already records under
`holdout.historicalExposureDisclosure`, and it is recorded here for the same
reason: so the disclosure stays complete.

## 15. Remaining uncertainties

- **Nothing about prompt QUALITY is known.** Both prompts' semantic accuracy
  is unmeasured and unmeasurable from the permitted sources. The validity
  numbers say v2 produces verifiable output slightly more often; they say
  nothing about whether it is right.
- **The systematic v2 shift toward `NOT_A_UNIT` is unexplained and its sign
  is unknown.** It is the single most consequential observation in this
  document and the one most in need of gold.
- **Single sample per variant.** Run-to-run provider variability is
  unmeasured, so a difference of any size on 49 items is currently
  indistinguishable from sampling noise.
- **`ge789b0f0aedc398c` remains an open owner gold-consistency question**,
  now sharper: v1 agrees with its committed label and v2 does not.
- **The two persistent rejections are undiagnosed.** Whether
  `g0ec0d43dad311a77` and `g877a05e6f5bba835` reflect a model error, a corpus
  artefact or a correct validator refusal is not examined here.
- **DEVELOPMENT only.** Generalisation is a HOLDOUT question and remains
  entirely open. HOLDOUT was not read, inferred or inspected.

## 16. The exact next task

A **separately authorised gold-access task** that makes the 49 DEVELOPMENT
gold labels available to scoring without exposing HOLDOUT. The obvious shape
— to be designed and approved, not assumed — is a deterministic derivation
that projects the 72-record acceptance adjudication file onto the 49
DEVELOPMENT gold ids the canonical corpus already pins, emits a committed,
hash-verified **DEVELOPMENT-only label fixture**, and adds that fixture's path
to the freeze as a readable source. That task must be the one to open the
mixed file, under an explicit owner decision, because this task is forbidden
to.

Once such a fixture exists, **re-run this F4 scorer unchanged** against the
same preserved attempt-1 evidence: the scorer already computes every strict
and conditional metric, confusion matrix, ternary precision/recall/F1,
macro-F1, paired correctness transition and leave-one-out view, and fails
closed on unavailable gold — the only thing missing is the gold itself. No
new inference, and no new authorisation to execute, is required for that
re-run.

`PHASE 2B-2D2C-F4 BLOCKED — PRESERVED ATTEMPT 1 EVIDENCE REQUIRES RESOLUTION`
