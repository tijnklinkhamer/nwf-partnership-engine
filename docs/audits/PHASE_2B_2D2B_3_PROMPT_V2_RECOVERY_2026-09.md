# Phase 2B-2D2B-3 — Classifier prompt v2: recovery record (2026-09-12)

**Why this document exists.** The original 2D2B prompt-v2 correction was
written and reviewed on a development laptop that is now permanently
unavailable. Its commits never reached GitHub, and the complete §6 prompt text
of the historical report that described it is not present on GitHub either.
This slice re-implements prompt v2 on top of the accepted R1 + R2 recovery
branches, from an exact text the owner supplied for this recovery.

This record is committed **before** the production edit, so that the contract
the implementation must meet is durable on its own. It is extended additively
by the implementation commit (§8); nothing written here is rewritten later.

Four evidence labels are used throughout, and nothing is left unlabelled:

| label                          | meaning                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `GITHUB_VERIFIED_BASELINE`     | Observed directly in this session against the fetched remote or the committed bytes of the exact remote R2B head.         |
| `OWNER_PRESERVED_REQUIREMENT`  | A requirement the owner supplied for this recovery (the R3 implementation brief). Authoritative; not derived from lost bytes. |
| `REIMPLEMENTED_AND_EXECUTED_NOW` | Implemented on this branch and executed in this session on this machine (macOS / darwin).                                |
| `NOT_REVERIFIED`               | Known only from an artifact, run or file that no longer exists, or deliberately not re-measured in this session.          |

---

## 1. `GITHUB_VERIFIED_BASELINE`

Observed in this session after `git fetch origin --prune` from the main clone
(`/Users/tijnklinkhamer/Developer/nwf-partnership-engine`):

| fact                                   | value                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| `origin` URL                           | `https://github.com/tijnklinkhamer/nwf-partnership-engine.git` (the Partnership Engine repository, not the NWF application) |
| `origin/main`                          | `7adf895fa20e9b25758e0748d1a02e26c387d19b`                                                 |
| R1 branch / HEAD                       | `origin/feat/phase2b-2d2b-1-evidence-canonicalisation-recovery` = `3b677dd2b0788ff9d7967f5c1627dddd1f81a1fd` |
| R2 branch / HEAD (R2B)                 | `origin/feat/phase2b-2d2b-2-hard-liveness-boundary-recovery` = `952f80e124bc681ee15c35386d30ba52a6d80c98` |
| R2B parent                             | `e237c670e4e95936d44aeb5f347e82e161bff061`                                                 |
| R2B vs R1                              | 5 ahead / 0 behind; merge base `3b677dd2…`                                                 |
| R2B vs `origin/main`                   | 7 ahead / 0 behind; merge base `7adf895f…`                                                 |
| R1 vs `origin/main`                    | 2 ahead / 0 behind; merge base `7adf895f…`                                                 |
| main clone, R1 worktree, R2 worktree   | each clean and equal to its upstream; none modified by this slice                          |
| repository-local Git identity          | `Tijn Klinkhamer <tijnklinkhamer@newwavefluent.com>` (from `.git/config`; not overridden)  |
| R3 branch / worktree before this slice | absent locally and remotely; worktree path absent                                          |
| this branch                            | `feat/phase2b-2d2b-3-prompt-v2-recovery`                                                   |
| this worktree                          | `/Users/tijnklinkhamer/Developer/wt-phase2b-2d2b-3-prompt-v2-recovery`                     |
| this branch created from               | exactly `952f80e124bc681ee15c35386d30ba52a6d80c98` — the remote R2B head                   |

Full ancestry of the base, oldest first:

```
7adf895f  origin/main  (Merge branch 'feat/phase2b-2d1-gold-corpus-protocol')
7d761dd4  Document Phase 2B-2D2B remote-truth recovery          (R1)
3b677dd2  Reimplement 2D2B-1 evidence canonicalisation          (R1 HEAD)
81528e26  Document 2D2B-2 remote recovery basis                 (R2)
94bb04bf  Reimplement 2D2B-2 hard liveness boundary             (R2)
e8864af8  Close 2D2B-2 recovery acceptance                      (R2)
e237c670  Honor unconfirmed Tier 2 shutdown hard-kill contract  (R2A)
952f80e1  Refuse stale-PID tree kill after unconfirmed exit     (R2B HEAD, this branch's base)
```

### The v1 prompt at R2B

| fact                                                     | value                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------- |
| `src/orgunits/classify/prompt.ts` Git blob at `952f80e1` | `3f633dea37306f4369b99c16b8a60cedd2ac185c`                          |
| `ORGUNIT_CLASSIFIER_PROMPT_VERSION`                      | `orgunit-classifier-prompt-v1`                                      |
| runtime `ORGUNIT_CLASSIFIER_SYSTEM_PROMPT` length        | 9,887 JavaScript characters; 9,963 UTF-8 bytes                      |
| runtime UTF-8 SHA-256                                    | `65f7f327ad14e78aaf3024cb7253e979b1e360fdcd1a58081fccc08fdb0facd0` |

Measured by importing the module under `tsx` and hashing the exported runtime
string (not the source bytes, which carry template-literal escapes).

### Baseline validation before any edit

`npm ci` restored dependencies from the committed lockfile into the new
worktree (`package.json` and `package-lock.json` untouched). The worktree has
no `.env` and the shell exports no `DATABASE_URL_*` variable, so every
DB-gated integration test skipped and **no database was configured or
accessed**. `npm run validate` at `952f80e1` exited **0**:

| gate                                            | result                                                         |
| ----------------------------------------------- | -------------------------------------------------------------- |
| migration guard                                 | `Migration check OK: 10 migration(s), sequential from 0001.`   |
| typecheck, lint, format:check, build            | pass                                                           |
| tests (vitest summary, verbatim)                | `Test Files 67 passed \| 20 skipped (87)`; `Tests 1471 passed \| 526 skipped (2005)` |

This equals the R2B closure figure (1,471 passed, 526 skipped).

### Occurrence inventory at R2B

`rg` for `orgunit-classifier-prompt-v1`, `ORGUNIT_CLASSIFIER_PROMPT_VERSION`
and `ORGUNIT_CLASSIFIER_SYSTEM_PROMPT`:

| location                                                  | disposition in this slice                                               |
| --------------------------------------------------------- | ----------------------------------------------------------------------- |
| `src/orgunits/classify/prompt.ts`                         | **the one production edit** — version and five insertions               |
| `src/orgunits/classify/orchestrate.ts` (import + 4 uses)  | unchanged — it already reads both exported constants                   |
| `src/test/firewall/phase2b.firewall.test.ts:1947`         | the direct pin against `prompt.ts` — becomes v2                         |
| `src/test/unit/orgunitClassifyPrompt.test.ts`             | the prompt unit test — becomes v2, extended                             |
| `src/test/unit/orgunitClassifyFinalIdentity.test.ts:18`   | the explicit v1 comparator baseline — **kept**, a v2 comparison added   |
| `src/test/integration/orgunitClassifierSchema.test.ts:80` | historical/synthetic v1 row value — **kept**                            |
| `src/test/integration/orgunitClassifierMigration0010.test.ts:57` | historical/synthetic v1 row value — **kept**                     |
| `src/test/integration/orgunitClassifierGrants.test.ts:194` | historical/synthetic v1 row value — **kept**                           |
| `docs/audits/*`, `docs/evaluation/*`                      | historical records — **not rewritten**                                  |

No other production file names a prompt version literal.

---

## 2. Why R2B is the base

Prompt v2 is the third step of the recovery order preserved in
`PHASE_2B_2D2B_REMOTE_TRUTH_RECOVERY_2026-09.md` §2 (evidence
canonicalisation → hard liveness → prompt v2 → configuration freeze → 2D2C).
R2B (`952f80e1`) is the only remote state that already contains both
predecessors: R1 canonicalisation (`3b677dd2`) and the accepted R2/R2A/R2B
hard liveness boundary. Branching from `main` would drop both; branching from
R1 would drop liveness. The branch is therefore based on the exact remote R2B
head, not on `main`, not on R1, and not on any lost SHA.

**This work does not descend from, and does not byte-reproduce, the lost
2D2B diagnostic commit or the original 2D2B prompt-v2 implementation
commits.** Those commits are unavailable; nothing here claims to be them.

---

## 3. `OWNER_PRESERVED_REQUIREMENT` — the prompt-v2 contract

### 3.1 Source of the text

The historical report preserved the required semantics, but its complete §6
prompt text is no longer on GitHub. For this recovery the owner supplied five
exact insertions in the R3 implementation brief and made them authoritative.
**These bytes are the owner-authorised R3 recovery text supplied by the
implementation brief. They are not claimed to have been recovered from the
lost file**, and nothing in this repository can show whether they equal it.

### 3.2 The five insertions and their exact anchors

v2 is v1 with exactly these five insertions and no other runtime byte
changed. Four are new paragraphs, each inserted as `"\n\n" + paragraph`
directly after its anchor paragraph, so every existing paragraph break is
preserved and each new paragraph gains one preceding blank-line separator.
One is an inline insertion.

**Insertion 1 — page-subject test.** Anchor: after numbered question 2 under
`## The two questions, kept separate` (the paragraph ending `Judge each axis
on its own.`), before `## Taxonomy`.

```text
Classify the page's primary subject, not the presence of relevant words, activities, or services. Use UNIT_PAGE only when an organisational unit or operating function is itself the page's primary subject — for example, the page presents that unit's identity, remit, team, responsibility, or ongoing operations. Use NOT_A_UNIT when the page instead has a programme, grant, activity, event, form, navigation destination, or general institutional information as its primary subject, even when it describes Erasmus, mobility, international students, language learning, or student services. Describing Erasmus or services does not by itself make a page a UNIT_PAGE.
```

**Insertion 2 — bound on the small-organisation allowance.** Anchor: after
the existing small/non-university-organisation paragraph (ending `no separate
field exists for this case.`), before the paragraph beginning
``When `verdict = NOT_A_UNIT` ``.

```text
The whole-organisation allowance is narrow: use it only when the document presents the whole organisation in the role of an operating unit or function and makes that role the page's primary subject. The organisation's small size alone is never enough; a homepage, marketing or navigation page, programme or course page, and news or event page remain NOT_A_UNIT when no operating unit or function is the page's primary subject.
```

**Insertion 3 — contact form in the taxonomy.** Inline: the exact substring
`contact form, ` inserted immediately after the article `a` in the existing
`SERVICE_TOOL_PAGE` definition. The resulting line is exactly:

```text
- **SERVICE_TOOL_PAGE** — a contact form, login, shopping-cart, search, account, or portal page.
```

Stripping `contact form, ` reproduces the v1 line exactly. (The brief
rendered this line with a `*` Markdown bullet; the runtime prompt's bullet is
`-`, and the brief's own stripping rule — only `contact form, ` may differ —
governs, so the bullet stays `-`.)

**Insertion 4 — NO versus UNKNOWN calibration.** Anchor: after the existing
paragraph beginning `UNKNOWN is a first-class, correct answer.`, before
`## When to use NEEDS_REVIEW`.

```text
NO requires affirmative evidence of absence; silence is UNKNOWN; a service list that omits an axis is not evidence against it.
```

**Insertion 5 — document-local unit name.** Anchor: after the existing
`unit_name` paragraph under `## Evidence and citation — read this carefully`
(ending `for any verdict.`), before `## Untrusted content`.

```text
`unit_name` must be copied exactly from this document's own title, headings, or excerpt. Never take it from another document in the batch, and never expand an abbreviation or acronym.
```

(The backticks are runtime characters of the prompt, escaped as `` \` `` in
the TypeScript template literal, exactly like every existing `` `unit_name` ``
in v1.)

`evidenceSpanVerifies` and `unitNameVerifies` are **not** changed: their R1
deterministic contracts remain exactly as implemented. Insertion 5 instructs
the model; it does not relax or tighten the validator.

### 3.3 Byte oracles the implementation must meet

| oracle                                   | required value                                                     |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `ORGUNIT_CLASSIFIER_PROMPT_VERSION`      | `orgunit-classifier-prompt-v2`                                     |
| v2 runtime length                        | 11,304 JavaScript characters                                       |
| v2 UTF-8 length                          | 11,382 bytes                                                       |
| v2 runtime UTF-8 SHA-256                 | `181a5d6fec9763be5a57e7e4d08c7d8c8a9d9e21838df2ea3e05dd680e4c7635` |
| stripped v2 (four paragraphs, their four preceding `\n\n` separators, and `contact form, ` removed) | SHA-256 `65f7f327ad14e78aaf3024cb7253e979b1e360fdcd1a58081fccc08fdb0facd0` — v1 exactly |

If the result differs, the oracle is not updated: the unintended textual or
newline difference is found instead. The stripped-v2 check is the proof that
v2 is five insertions rather than a rewrite.

### 3.4 Version and identity

`ORGUNIT_CLASSIFIER_PROMPT_VERSION` participates in the persisted final input
identity through `computeFinalInputSha256` (`finalIdentity.ts`). With the same
`assemblyInputSha256` and the same `ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION`,
the v1 prompt version and the production v2 prompt version must yield
**different** `input_sha256` values, so no persisted v1 call is ever reused as
though it answered a v2 question.

Not changed: `computeFinalInputSha256`, `ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION`,
`ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION`, the output schema, the model
allowlist, the provider request configuration, retry and timeout policy, the
Agent SDK and Tier 2 code, migrations and the persistence schema.

### 3.5 One production prompt — no selector

No prompt selector is added and no second selectable production prompt is
kept. Attribution in 2D2C comes from Git state instead of from an API
surface: the canonical-input **prompt-v1 comparator runs from exact commit
`952f80e124bc681ee15c35386d30ba52a6d80c98`**, and **prompt v2 runs from the
eventual R3 commit** on this branch.

### 3.6 Scope

One production file (`src/orgunits/classify/prompt.ts`), narrow test and
firewall assertions, and this record. Zero live Claude/provider calls, zero
database connections or writes, zero institutional HTTP requests, zero
HOLDOUT inference or semantic inspection, zero gold-label, corpus or manifest
changes, zero evidence-canonicalisation, liveness, retry, budget or
process-harness changes, zero dependency, lockfile, migration, `.env` /
`.env.example`, output-schema, model-allowlist or `CLAUDE.md` changes. No
merge, no pull request, no push to `main`.

---

## 4. `NOT_REVERIFIED`

- **The historical full §6 prompt bytes are unavailable.** They were not
  recovered, are not reconstructed from memory or from any digest, and are
  not claimed to equal the text in §3.2.
- **The lost 2D2B diagnostic and prompt-v2 commits** remain absent from
  GitHub and are not ancestors of this branch.
- **The unresolved small-organisation gold-consistency question**
  (`ge789b0f0aedc398c`, recorded in
  `PHASE_2B_2D2B_REMOTE_TRUTH_RECOVERY_2026-09.md` §2) **remains
  unresolved.** Insertion 2 bounds the prompt's whole-organisation allowance;
  it does not decide that item, and **no gold label was changed**.
- **Whether prompt v2 improves classification is unmeasured.** No classifier
  has been run in this slice; the effect is a question for 2D2C, DEV only.
- **R2B's Windows limitations** (the check-to-exec race, no descendant
  recovery after a suppressed hard stage, and the platform-skipped Windows
  real-process tests; `PHASE_2B_2D2B_2_HARD_LIVENESS_RECOVERY_2026-09.md`
  §11 and the Windows record) remain exactly as recorded there. This slice
  does not touch the harness and changes none of them.

---

## 5. Carried forward to 2D2C — unchanged requirements

- Any `CHILD_EXITED_UNCONFIRMED` verdict and any `hardKillDisposition` of
  `SUPPRESSED_EXPIRED_TARGET_IDENTITY` is an **unconfirmed harness
  termination** and must be treated as a **stop-worthy harness failure**,
  never as a clean batch end.
- The 2D2C rerun harness **must preserve raw provider output for
  validator-rejected items.** The original run did not, which is why that
  evidence was never captured.
- HOLDOUT stays one-shot: prompt v2 is evaluated on DEVELOPMENT first, and
  HOLDOUT is scored only once per frozen configuration.

---

## 6. HOLDOUT status and one incidental exposure

No classifier inference was run on any item, HOLDOUT included, and no
HOLDOUT document was opened for inspection, tuning or assertion-writing. The
prompt text in §3.2 was fixed by the owner's brief before this session began,
so no prompt byte can have been tuned against any corpus content.

**Disclosed exposure.** During the pre-implementation read, a repository-wide
`rg` for the string `SERVICE_TOOL_PAGE` (run to find prompt-content
dependents) also matched
`src/test/fixtures/evaluation/orgunit-classifier-adjudication-v1.jsonl` and
printed eight of its gold-label records to the session. That file was not
deliberately opened; the output was not used for any decision, test or
wording; and the split membership of those eight records was deliberately
**not** looked up, so this record conservatively assumes the printed lines
may include HOLDOUT gold-label text. Every later search in this session
excluded `src/test/fixtures/`. No inference, tuning or label change followed
from it.

---

## 7. Planned verification

- Focused prompt tests: exact v2 version; each insertion present exactly
  once and at its anchor; the exact `SERVICE_TOOL_PAGE` line; the v2
  length/byte/hash oracles; stripped v2 reproduces the v1 hash; no
  institution-specific name, URL or gold-ID-shaped token in the inserted
  delta; no gold-ID-shaped token (`g` + 16 hex) anywhere in the prompt; the
  existing no-placeholder, taxonomy, evidence, untrusted-content,
  provider-name and output-contract tests unchanged and green. The generic
  `NWF` injection-defence wording of v1 is preserved.
- Focused identity tests: the kept v1 baseline, plus the production v2
  constant compared against the explicit v1 comparator with every other
  identity field unchanged.
- Firewall: `prompt.ts` pinned to v2; `orchestrate.ts` still wires the
  exported prompt and version constants.
- Then `git diff --check`, `typecheck`, `lint`, `format:check`,
  `test:firewall`, and `validate`, in that order.

---

## 8. Implementation results

_Appended by the implementation commit._

Everything in this section is `REIMPLEMENTED_AND_EXECUTED_NOW` unless it says
otherwise. §§1–7 are left exactly as committed in
`c68c2c4b3444d54113c757d3593c17012d09a076` (`Document 2D2B-3 prompt v2
recovery contract`).

### 8.1 The prompt against its oracles

| oracle                                    | required                                                           | measured       |
| ----------------------------------------- | ------------------------------------------------------------------ | -------------- |
| `ORGUNIT_CLASSIFIER_PROMPT_VERSION`       | `orgunit-classifier-prompt-v2`                                     | **MATCH**      |
| v2 runtime length                         | 11,304 characters                                                  | **11,304**     |
| v2 UTF-8 length                           | 11,382 bytes                                                       | **11,382**     |
| v2 runtime SHA-256                        | `181a5d6fec9763be5a57e7e4d08c7d8c8a9d9e21838df2ea3e05dd680e4c7635` | **MATCH**      |
| stripped v2 length / bytes                | 9,887 / 9,963                                                      | **9,887 / 9,963** |
| stripped v2 SHA-256 (= v1)                | `65f7f327ad14e78aaf3024cb7253e979b1e360fdcd1a58081fccc08fdb0facd0` | **MATCH**      |

The first measurement of the edited file met every oracle; no oracle was
touched. The byte arithmetic is itself a check: v2 has 78 more bytes than
characters and v1 has 76, so the delta adds exactly one 3-byte character —
the em dash in insertion 1 — and every apostrophe in the delta is ASCII
U+0027, like v1's own.

Two independent proofs, both executed:

- **This record's own bytes.** Before commit 1, a scratch script extracted
  the five `text` blocks of §3.2 from this file, applied them at the §3.2
  anchors to the R2B runtime v1 string, and obtained 11,304 / 11,382 /
  `181a5d6f…7635`. The text recorded here is therefore exactly the text that
  meets the oracle.
- **The committed module.** `orgunitClassifyPrompt.test.ts` imports the
  production constant, asserts the v2 oracles, asserts each insertion occurs
  exactly once and sits between its exact v1 neighbours, and removes the four
  paragraphs (each with its `\n\n`) plus `contact form, ` to recover the v1
  hash.

Mutation checks, each reverted and confirmed byte-identical with `cmp`:

| mutation of `prompt.ts`                                   | prompt tests failing                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------------- |
| one v1 byte changed outside every anchor (a doubled space) | 2 — the v2 oracle and the stripped-v2-equals-v1 proof                    |
| insertion 4 deleted                                       | 3 — the v2 oracle, exactly-once, and anchor placement                     |
| a `'bing-search'` string appended (firewall, §8.4)        | the firewall search-engine check fails, naming `prompt.ts`                |

### 8.2 Prompt version and input identity

`computeFinalInputSha256` is unchanged; `orchestrate.ts` is unchanged and
still passes `ORGUNIT_CLASSIFIER_PROMPT_VERSION` into it and
`ORGUNIT_CLASSIFIER_SYSTEM_PROMPT` to the provider. For the synthetic identity
the unit test uses (`assemblyInputSha256` = 64 × `1`, the production output
schema version `orgunit-classifier-output-schema-v2`):

| prompt version                            | `input_sha256`                                                     |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `orgunit-classifier-prompt-v1` (comparator) | `d4d16d07cf4735930f4889fbe5ad045fdd444565b88d6b6ba330964f18171e34` |
| `orgunit-classifier-prompt-v2` (production) | `e9a6a049ab53711d83ae093885771d157c78495bdf9490f65937e8e6c7376d95` |

These identify a synthetic input only and are recorded to show the
behaviour, not as a benchmark key. Only the prompt version differs, and the
identities differ, so a completed v1 call can never be reused for a v2
question.

### 8.3 Files changed (against R2B `952f80e1`)

| file                                                  | change                                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/orgunits/classify/prompt.ts`                     | version → v2; header comment describes v2 as v1 + five insertions; the five insertions; nothing else |
| `src/test/unit/orgunitClassifyPrompt.test.ts`         | version test → v2; the other 7 existing tests kept verbatim; 8 new tests (§8.1, plus no-overfitting and the preserved `NWF` wording) |
| `src/test/unit/orgunitClassifyFinalIdentity.test.ts`  | the v1 `BASE` comparator kept; 1 new test: production v2 constant vs explicit v1, all else equal |
| `src/test/firewall/phase2b.firewall.test.ts`          | prompt pin → v2; 1 new test (orchestrate wiring, no other production file declares a prompt version); the `bing` precision fix in §8.4 |
| `docs/audits/PHASE_2B_2D2B_3_PROMPT_V2_RECOVERY_2026-09.md` | this record (commit 1), extended by this section                                            |

The no-overfitting tests reject gold-ID-shaped tokens (`g` + 16 hex) in the
whole prompt, and URLs, domain-shaped tokens, digits and the diagnostic
institution tokens `insa` / `rouen` in the inserted delta (the latter two in
the whole prompt as well). Those two tokens were taken from the committed
R1 recovery record and the committed `acceptanceSelection.ts` comments, **not**
from the fixture lines disclosed in §6. The generic v1 wording naming `NWF`
as the pipeline's operator is kept and asserted present, because deleting it
would be a rewrite.

### 8.4 One firewall conflict, resolved by the owner in this session

With the prompt at its oracle, `npm run test:firewall` failed exactly one
assertion: `src/orgunits/classify/prompt.ts names bing`
(`PHASE-2B-FIREWALL 2B-2B/2B-2C1 … imports no search-engine, browser-automation
or PDF/OCR dependency`). The check lowercased every classify file and banned
the bare **substring** `bing`; insertion 1's authorised word **"Describing"**
contains it. It was the only failure in the full suite (1 failed, 1,480
passed, 526 skipped).

The prompt bytes are fixed by §3 and rule 7 forbids weakening a firewall to
reach green, so the implementation stopped and put the choice to the owner.
**The owner chose a word-boundary match for `bing` in that one check.** It
was implemented as `/(?<![a-z])bing/` — anchored at the start of a word only
— rather than the `/\bbing\b/` shown in the question. Every string
`\bbing\b` flags is also flagged here, and so are identifier shapes such as
`bing_search` and `bingapi` that `\bbing\b` would miss. The test now carries
positive controls (`from 'bing'`, `from 'bing-search'`,
`https://api.bing.microsoft.com/…`, `bing_search = bingapi`) and one negative
control (`describing`). Every other banned token in that list stays a
substring ban, and the separate orchestrator-namespace `bing` ban is
untouched. `phase1a`, `phase1b` and `phase1d` are unchanged.

### 8.5 Validation, in the brief's order

| step | gate                                                          | result                                                                   |
| ---- | ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1    | `git diff --check`                                            | clean                                                                    |
| 2    | `vitest run src/test/unit/orgunitClassifyPrompt.test.ts`      | 16 passed (16)                                                           |
| 3    | `vitest run src/test/unit/orgunitClassifyFinalIdentity.test.ts` | 10 passed (10)                                                         |
| 4    | `npm run typecheck`                                           | exit 0                                                                   |
| 5    | `npm run lint`                                                | exit 0                                                                   |
| 6    | `npm run format:check`                                        | `All matched files use Prettier code style!`                             |
| 7    | `npm run test:firewall`                                       | `Test Files 4 passed (4)`; `Tests 198 passed (198)`                      |
| 8    | `npm run validate`                                            | exit 0; `Test Files 67 passed \| 20 skipped (87)`; `Tests 1481 passed \| 526 skipped (2015)` |

Against the §1 baseline (1,471 / 526): **+10 passed** = 8 prompt + 1 identity
+ 1 firewall, and **+0 skipped**. With no `.env` and no `DATABASE_URL_*`
variable, every DB-gated test skipped: no database was configured or
reached. After the run, `ps` showed no PostgreSQL, Agent SDK or fixture
process, and the OS temp directory held no `nwf-pe-*` entry.

### 8.6 Zero-diff confirmations

Against R2B `952f80e1`, `git diff` is **empty** for: `package.json`,
`package-lock.json`, `migrations/`, `.env.example`, `CLAUDE.md`, `docs/adr/`,
`docs/evaluation/`, every other file under `docs/audits/`, `scripts/`,
`src/config/`, `src/test/fixtures/` (corpus, manifests, gold labels,
DEVELOPMENT / HOLDOUT membership), `src/test/harness/`,
`src/test/integration/` (its historical v1 strings kept),
`src/orgunits/web/`, `src/orgunits/orchestrator/`, `src/orgunits/signals/`,
`src/orgunits/classify/evaluation/`, `src/orgunits/classify/provider/`
(Agent SDK runner, Tier 2, SDK options, model allowlist), `outputSchema.ts`,
`finalIdentity.ts`, `orchestrate.ts`, `providerContract.ts`,
`evidenceVerification.ts` (`evidenceSpanVerifies` / `unitNameVerifies`),
`retry.ts`, `validate.ts`, `persist.ts` and `constants.ts`
(`ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION`). No `.env` file exists in the
worktree.

Zero live Claude/provider calls, zero database connections or writes, zero
institutional HTTP requests, zero classifier inference on any item, zero
gold-label, corpus or manifest changes. The only network traffic was `git
fetch` / `git push` to GitHub and `npm ci` against the npm registry. No
merge, no pull request, no push to `main`. This commit cannot record its own
hash; the push and the remote-head equality are verified in the session's
closure report.

### 8.7 Remaining uncertainty

- **Effect unmeasured.** Nothing here shows that v2 classifies better than
  v1. That is what 2D2C measures, DEVELOPMENT first: prompt v1 from
  `952f80e1` on canonical inputs, then prompt v2 from this branch's R3 commit.
- **Recovery text, not recovered text.** Whether §3.2 equals the lost §6
  prompt is unknowable from this repository (§4).
- **The small-organisation gold question** (`ge789b0f0aedc398c`) is still
  open, and no label was changed.
- **The §6 exposure** stands as disclosed. It changed nothing, but it is
  recorded rather than dismissed.
