# Phase 2B-2D2C-F1 — Prompt V6 implementation (R1 + R2 + R3) and freeze preparation

**Date:** 2026-09-17
**Branch:** `feat/phase2b-2d2c-v6i1-operator-precedence`
**Base:** the canonical V5 classifier runtime commit
`1bb7578ac962650675f05aec3507c57a49517239`
(`feat: land Prompt V5 = V4 + E1 bounded whole-organisation-allowance scope fix (2D2C-F0N/V5I1)`),
worktree clean at that commit before any edit.
**Authorisation:** the owner's decision
`APPROVE_V6_R1_R2_R3_IMPLEMENTATION_FOR_FREEZE_REVIEW_ONLY`.

**What that authorisation does NOT cover, and what did not happen here:** no
provider call, no inference, no auth-status read, no DEV execution, no study
materialisation, no scoring, no HOLDOUT access, no C2, no gold change, no
threshold change, no reliability change. No execution candidate, no study
root and no owner execution authorisation was created. V6 has never been
run.

**V6 is NOT accepted.** This record makes no claim that any acceptance gate
would pass, and no claim that the model will follow any rule implemented
here.

---

## 1. Why this branch is cut from V5 and not from F0Z HEAD

Two lineages are deliberately kept apart:

- the **semantic prompt lineage** V1 → V2 → V3 → V4 → V5 → V6, which this
  branch extends, pinned at V5 = `1bb7578`;
- the **F0Z reliability / execution-harness semantics**, separately pinned at
  `805d39b6043a69cedf809ca9b2151168e1f88a58`.

Building the V6 prompt candidate on F0Z HEAD would conflate them. No
execution-harness code is on this branch.

### Preconditions verified before the first edit

| check                  | required                                                           | observed  |
| ---------------------- | ------------------------------------------------------------------ | --------- |
| HEAD                   | `1bb7578ac962650675f05aec3507c57a49517239`                         | identical |
| worktree               | clean                                                              | clean     |
| live prompt version    | `orgunit-classifier-prompt-v5`                                     | identical |
| live V5 prompt SHA-256 | `4c7352812740ca2df518b5274d18aae2f7f695d05ab0f60fcf72c000db8f01c9` | identical |
| live V5 size           | 14,843 code points / 14,919 UTF-8 bytes                            | identical |

---

## 2. V6 is exactly V5 + R1 + R2 + R3

`ORGUNIT_CLASSIFIER_PROMPT_VERSION` is bumped to
`orgunit-classifier-prompt-v6`. Three REPLACE operations are applied to the
V5 text, each of whose source region occurs **exactly once**. No other
prompt semantics change.

### R1 — define what may be the operator

**Replaces** step two's primary affirmative sentence, whose V5 form began
"The page is a UNIT_PAGE when the document presents a named unit, service or
provision as the operator, for example a heading, section or block…".

**Semantic target:** the `g04d170f4` false-positive mechanism. R1 does three
things: it DEFINES the admitted operator shapes (a named office, department,
centre or standing student-facing service); it declares the name of a grant,
bursary, aid, scholarship or funding scheme to be a **subject and not an
operator**; it binds the whole-organisation restriction into the primary
affirmative itself ("for a small or non-university organisation **and only
then**"), rather than leaving it to the separate allowance paragraph; and it
adds one closing sentence stating that when the only named administering
entity is the organisation itself and that allowance does not apply, **no
operator is evidenced**, however fully the document states the function's
eligibility rules, amounts, procedure and contacts.

The separate whole-organisation allowance paragraph is **not modified** — it
is byte-identical to V5, asserted as such by test.

**Delta:** +477 code points (398 → 875).

### R2 — replace the external-scheme contact criterion

**Replaces** D2's V5 sentence in full:

> A named unit presented only as the receiving or processing contact for an
> externally-named, externally-sponsored scheme does not by itself satisfy
> step two, unless the document also describes that unit's own standing
> remit or ongoing operations beyond that one scheme.

**Semantic target:** separating `g0ec0d43` from `g536c8b14` using
**observable structure**. The incumbent test ("standing remit … beyond that
one scheme") is not observable in the supplied evidence; the replacement
admits step two when the document gives the unit **a heading or section of
its own** for this subject — stating its remit, its address, its opening
hours, or how it is reached as a standing office — and refuses it when the
unit's name appears only inside running text as the mailbox to write to, the
place to deposit a file, or the deadline to meet.

The phrase `beyond that one scheme` no longer occurs anywhere in the prompt.

**Delta:** +231 code points (268 → 499).

### R3 — give the thin-evidence blocker explicit precedence

**Replaces** the first NEEDS_REVIEW blocker bullet in full:

> - the evidence is too sparse to tell a unit from a non-unit despite
>   unit-shaped signals (e.g. a truncated excerpt naming an office with no
>   further content);

**Semantic target:** `g6458a35`, while preserving `g7e9744e8` and
`ge789b0f0`. R3 states the precedence explicitly ("Check this blocker before
answering UNIT_PAGE: a named office and a way to reach it, with nothing
else, is this blocker rather than a unit page") and carries **two
exceptions** so it is a precedence clarification rather than a broad
abstention rule: it is not this blocker when the title or the leading
heading is that office's own name, nor when the headings themselves state
the function's remit, strategy, eligibility or standing procedures.

**Delta:** +456 code points (156 → 612).

---

## 3. Explicit non-changes

Unmodified, and asserted unmodified by test where a test can see it: E1's
whole-organisation-allowance sentence; the whole-organisation allowance
paragraph as a whole; D1's second-sentence qualifier; D3's contact-form
logic; the step-one sentence; the "one step, mailbox or contact line"
exclusion; Candidate C's evidence-output compliance check; the taxonomy
section; the relevance-axes section; the evidence-and-citation section; the
untrusted-content section; the other-rules section; the output section; the
NEEDS_REVIEW framing sentence and the other three blockers; the
anti-abstention paragraph.

Also unmodified: taxonomy values, output schema, validator, repair
architecture, provider, model id, `maxTurns`, runtime, timeout values,
scoring, gold, fixture labels, acceptance thresholds. No migration, no new
runtime dependency.

### `g66010a25` is deliberately unfixed

Per the owner instruction, no operation targets `g66010a25ac194274`. The F1
analysis found no safe generic rule that reaches it without knowingly
flipping multiple stable NOT_A_UNIT controls.

This omission is recorded as a **checked property**, not left implicit:
R3's blocker is keyed to "the document names an office", and
`g66010a25`'s frozen gold record shows a page whose only content is
`'Erasmus +' plus 'Posts navigation'` — it names no office at all. The V6
delta additionally names no archive/navigation/listing/post distinction that
could reach it instead. Both facts are asserted by test.

---

## 4. Prompt identity and reversibility

### V6 identity

| property    | value                                                              |
| ----------- | ------------------------------------------------------------------ |
| version     | `orgunit-classifier-prompt-v6`                                     |
| SHA-256     | `06262d43352375231eb83afdd485babc8564675d783da0b7409bc15dca0513b7` |
| code points | 16,007                                                             |
| UTF-8 bytes | 16,093                                                             |

### Delta versus V5

| measure     | value                                          |
| ----------- | ---------------------------------------------- |
| code points | +1,164 (14,843 → 16,007) = 477 + 231 + 456     |
| UTF-8 bytes | +1,174 (14,919 → 16,093)                       |
| paragraphs  | 39 → 39 (none added); exactly **two** changed  |

The ten-byte excess over the code-point delta is exactly the five added
em-dashes (U+2014, 3 bytes each): R1 adds two, R2 adds two, R3 adds one.
The two changed paragraphs are the two-step page-subject paragraph (R1 and
R2) and the NEEDS_REVIEW blocker list (R3).

### Reversal

`v5FromV6` reverses exactly R1, R2 and R3, in the opposite order to
application. Every operation is a whole-region exact-string REPLACE whose
source must occur **exactly once** — no fuzzy matching, no regex, fail
closed via `PromptLineageError` otherwise. The full chain, computed from the
live production prompt:

| step               | SHA-256                                                            | code points | bytes  | oracle         |
| ------------------ | ------------------------------------------------------------------ | ----------- | ------ | -------------- |
| v6 (live)          | `06262d43352375231eb83afdd485babc8564675d783da0b7409bc15dca0513b7` | 16,007      | 16,093 | matches        |
| v5 = reverse R1-R3 | `4c7352812740ca2df518b5274d18aae2f7f695d05ab0f60fcf72c000db8f01c9` | 14,843      | 14,919 | **matches**    |
| v4                 | `a2dad6e85102ee710d4eb1c5ca4ea3995273b3e25834d27a83f36ad6b65a256b` | 14,731      | 14,807 | matches        |
| v3                 | `d05dcce614397e09f93d0aec981a3d626d5e90a16851040901ffafec30d3abd1` | 14,012      | 14,088 | matches        |
| v2                 | `181a5d6fec9763be5a57e7e4d08c7d8c8a9d9e21838df2ea3e05dd680e4c7635` | 11,304      | 11,382 | matches        |
| v1                 | `65f7f327ad14e78aaf3024cb7253e979b1e360fdcd1a58081fccc08fdb0facd0` | 9,887       | 9,963  | matches        |

The required invariant holds: reversing exactly R1, R2 and R3 reproduces the
canonical V5 SHA-256
`4c7352812740ca2df518b5274d18aae2f7f695d05ab0f60fcf72c000db8f01c9`, and the
existing V5 → V4 → V3 → V2 → V1 lineage then continues unchanged. Re-applying
the delta (`v6FromV5`) returns the live prompt byte for byte.

There is still ONE production prompt and no version selector. Earlier
identities are RECONSTRUCTED, never stored as second strings.

---

## 5. Contract tests

`src/test/unit/orgunitClassify2D2CV6I1Contract.test.ts` — 38 deterministic,
zero-provider tests. They check two things only: that the new rule text
carries the structural distinction the F1 analysis assigns it, and that each
cited gold id actually exists in the frozen 49-row DEVELOPMENT fixture with
the verdict / page_kind / unit_type / rationale the analysis attributes to
it. **They do not claim the model will follow any rule**, and the file's own
header says so.

Only `src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-dev-labels-v1.jsonl`
is opened. HOLDOUT, `orgunit-classifier-gold-v1.jsonl` and the mixed
adjudication fixture are never read.

Every truncated gold id in the owner instruction was resolved against that
fixture and each resolved to **exactly one** row.

### §5A — the seven historical semantic-error items

| gold id             | frozen outcome                        | mechanism named                                                    |
| ------------------- | ------------------------------------- | ------------------------------------------------------------------ |
| `g04d170f4d3fda759` | NOT_A_UNIT / GENERIC_INSTITUTIONAL    | R1 target: funding-scheme subject, no unit named, full university   |
| `g0ec0d43dad311a77` | UNIT_PAGE / INTERNATIONAL_MOBILITY    | R2 target (positive): DAI headings of its own, incl. address/hours  |
| `g536c8b148048fcbc` | NOT_A_UNIT / GENERIC_INSTITUTIONAL    | R2 control: DRI named only as a contact                             |
| `g6458a352bc79ca01` | NEEDS_REVIEW (HARD)                   | R3 target: office named in headings, empty excerpt, title "Contacts" |
| `g34bbf7536e99b410` | UNIT_PAGE / INTERNATIONAL_MOBILITY    | R1: non-university organisation, so "and only then" gate is open    |
| `ga971a6fc52af6b5f` | UNIT_PAGE / INTERNATIONAL_MOBILITY    | as above (French twin)                                              |
| `g66010a25ac194274` | NEEDS_REVIEW (HARD)                   | **deliberately unfixed**; names no office, so R3 is not keyed to it  |

A stated limit, recorded rather than glossed: for `g6458a352bc79ca01`, R3's
first exception turns on the title **or leading heading** being the office's
own name. The gold fixture carries the title (`Contacts`, which is not the
office's name) but **not** the document's headings, so no claim is made
about whether that exception would fire on a heading.

### §5B — R1 controls

`gf65026e32d9da8db`, `g877a05e6f5bba835` (carried by the named DAI office —
exactly what R1 admits as an operator); `g99a9fe00e4856de2` (a named
standing student-facing provision, FLE — a category R1 carries over from V5
verbatim); `ge789b0f0aedc398c`, `gdb5b7246327094ef` (whole-organisation
positives at non-university organisations, so R1's "and only then" gate is
open); `g32779df2d7b56a34`, `g956f99fae4ad4764` (the IPAG pair).

The IPAG pair is reasoned about explicitly rather than waved through: IPAG is
not university-prefixed, so the whole-organisation allowance is *reachable*
for it. These two therefore stay NOT_A_UNIT on the **allowance paragraph's
own unchanged requirements** (a page whose subject is the external programme
itself is NOT_A_UNIT), not on anything R1 added — and R1 leaves that
paragraph byte-identical, which is asserted.

### §5C — R2 controls

`g3130d41296ab8739` (DRRI named only as the office to inform — the
running-text mailbox shape R2 still refuses); `gf65026e32d9da8db`
(a dedicated `Contact à la DAI` section — the structure R2 now admits).

### §5D — R3 controls

`g7e9744e811f58e20` (its title leads with the unit's own name — R3's first
exception, and it has body content besides); `ge789b0f0aedc398c` (empty
excerpt, but headings state charter, strategy and eligibility — R3's second
exception); `g52788fd323659c9c` (a NOT_A_UNIT directory, outside the
NEEDS_REVIEW blocker list R3 edits; R3's text names no NOT_A_UNIT
instruction and the list's gating framing sentence is byte-identical to V5).

### §5E — other protected controls

`g57607d4278d6dc23`, `g735298870fe173b8`, `ge419f0b9902faee0`,
`g877a05e6f5bba835`, `g9c1b65eda41afda2` (named-unit UNIT_PAGE positives);
`gcce4e2a5f608de5d` (LANGUAGE_DEPARTMENT — the delta names no
degree/programme/curriculum distinction and the taxonomy is byte-identical);
`g4454e841c09dd8d0`, `ga435ea22d4b11cf4` (D3's contact-form negatives, on
D3's own unchanged sentence); `g057656b07c6aa620`, `g04b64db14c03ce3a`
(plain institutional non-units, untouched by every operation).

---

## 6. Byte-diff / semantic firewall

Among **production** files, exactly one changed:

```
src/orgunits/classify/prompt.ts
```

Its non-comment changes are exactly four lines: the version constant, the
two-step page-subject paragraph (R1 and R2), and the NEEDS_REVIEW blocker
bullet (R3). Everything else in the diff is the header design record. No
other file under `src/` outside `src/test/` changed — verified by
`git diff --name-only 1bb7578 -- src/ | grep -v '^src/test/'`.

Test and support files changed only for lineage, the V6 contract tests, and
deterministic prompt/hash assertions:

| file                                                    | why                                                         |
| ------------------------------------------------------- | ----------------------------------------------------------- |
| `src/test/harness/phase2b2d2c/promptLineage.ts`         | V6 constants, `V6_DELTA_OPERATIONS`, `v6FromV5`, `v5FromV6`  |
| `src/test/unit/orgunitClassify2D2CV6I1Contract.test.ts` | new — the V6 contract tests                                 |
| `src/test/unit/orgunitClassifyPrompt.test.ts`           | V6 identity block; V5/V4/V3 blocks now walk from V6          |
| `src/test/unit/orgunitClassify2D2CV5I1Contract.test.ts` | E1's contract now checked on the reconstructed V5            |
| `src/test/unit/orgunitClassify2D2CV4I1Contract.test.ts` | D1/D2/D3's contract now checked on the reconstructed V4      |
| `src/test/unit/orgunitClassify2D2CV3D1Candidates.test.ts` | V3 reconstruction gains the V6→V5 step                     |
| `src/test/unit/orgunitClassify2D2CConfigurationFreeze.test.ts` | V2/V1 reconstruction gains the V6→V5 step             |
| `src/test/unit/orgunitClassifyFinalIdentity.test.ts`    | prompt-version pin                                          |
| `src/test/unit/support/phase2b2d2cSyntheticRoot.ts`     | V2/V1 comparator reconstruction gains the V6→V5 step         |
| `src/test/firewall/phase2b.firewall.test.ts`            | prompt-version pin                                          |

The V5I1 and V4I1 contract files were re-pointed at their **reconstructed**
version rather than at the live prompt. This is not a weakening: R2 replaced
D2's own sentence and R3 replaced a NEEDS_REVIEW bullet, so the live text is
no longer V5 or V4, and asserting D2/E1 contracts against it would assert
the wrong thing. Checking them against the reconstructed text is what proves
V6 disturbed nothing they established. The `exactlyOnce` fail-closed guard
caught every one of these call sites automatically — four test files failed
loudly rather than silently reconstructing a wrong text.

---

## 7. Validation

`npm run validate` on this branch: **green**.

| stage              | result                                                         |
| ------------------ | -------------------------------------------------------------- |
| `migrations:check` | OK — 11 migrations, sequential from 0001, none added           |
| `typecheck`        | clean                                                          |
| `lint`             | clean                                                          |
| `format:check`     | clean                                                          |
| `npm test`         | 117 files, **2,577 passed**, 42 skipped, 0 failed              |
| `build`            | clean                                                          |

Integration tests were run against the local `nwf_pe_test` database rather
than left skipped. The 42 remaining skips are the two scoring files gated on
`PHASE2B_2D2C_ATTEMPT1_ROOT` (a prior run's result artifact stored outside
the repository); supplying it would mean touching scoring, which this
authorisation excludes.

Named blocks:

- firewall: 7 files, 242 passed.
- lineage + contract block (V6, V5I1, V4I1, V3D1 candidates, prompt,
  configuration freeze, final identity): 7 files, **193 passed**.

All existing V5 / V4 / V3 / V2 / V1 lineage protections remain green.

**Zero provider calls, zero inference, zero auth-status reads, zero HOLDOUT
access** during this work. CI calls no live API, as always.

---

## 8. Status

Implemented, validated, committed and pushed on
`feat/phase2b-2d2c-v6i1-operator-precedence`. Not merged.

No freeze execution authorisation exists. V6 is **not accepted**, has never
been run, and no gate outcome is claimed or projected here. The next step is
the owner's freeze review.
