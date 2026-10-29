# Phase 2B-2D — acceptance methodology, revision R3 (PROPOSED, 2026-09-18)

**Status: PROPOSED. `thisFileAuthorises: []`. Authorises nothing.**
No provider inference. No prompt candidate. No Prompt V7. No `prompt.ts` edit.
No V6 run or rescore. No live web acquisition. No labels collected. No HOLDOUT
file opened. No runtime model selected. No file under `src/orgunits/` touched.

R3 is a **narrow revision**. R2
(`docs/evaluation/…_PROPOSAL_R2.json`, sha256 `8e5a2ba2…1810e3`, 102,269 bytes)
was accepted in substance, including its proposed terminal outcome token, and
is retained unmodified as history. **D1–D6 are not reopened.** Eight top-level
sections — including every section carrying the D2 statistics, Option B, the
six gates, the sampling contract, the review contract and the Phase 2E entry
rule — are **byte-identical to R2**, and a test asserts it.

R3 changes one thing: **what an INADMISSIBLE outcome costs.**

---

## 1. The loophole

R2 said:

> an INADMISSIBLE study measured nothing about the candidate, so the same
> frozen candidate is re-run after the execution environment is repaired

That is too broad, and the breadth is exploitable. An attempt can go
INADMISSIBLE *after* semantic execution has begun — a provider dying part-way,
a stability replicate terminating, or a realised denominator that is infeasible
only because of what the candidate predicted. Those attempts **have** measured
the candidate. Refunding them hands a prompt author unlimited attempts against
a sealed split by the simple expedient of a study that fails late.

R2 justified the refund with a second claim that is also false:

> INADMISSIBLE is determined by the structural preconditions S1–S7 alone, **all
> of which are properties of the harness and the corpus rather than of the
> candidate answers**

Only **S2** is purely pre-semantic. S1 and S4 are post-semantic; S3, S5, S6 and
S7 are both. S3 in particular ranges over realised denominators, and G3's
denominator *is the candidate's own output*. Both claims are withdrawn.

**The corrected claim:** some inadmissible attempts measured nothing about the
candidate; others measured it and then failed to produce a reportable
conclusion. **Only the first kind may be retried.**

---

## 2. `SEMANTIC_ATTEMPT_STARTED` — and why it is not new

The boundary is **the Methodology V2 name for a rule this repository already
froze**: the F0V predeclared inclusion rule, **Class C**
(`PROVIDER_REQUEST_OR_SEMANTIC_EXECUTION_OBSERVED`), implemented in
`src/test/harness/phase2b2d2c/f0w/sequencing.ts`:

> Any provider request or semantic execution occurred for the slot. … That slot
> is IRREVOCABLY part of the study, whether it completes successfully or ends
> in a genuine terminal failure/halt. Never replaced or discarded. This is the
> predeclared inclusion rule.

That is already the earliest of the three events the instruction names, already
irrevocable, and already *predeclared* rather than chosen after seeing results.
Defining a second boundary would put two incompatible irrevocability rules in
one repository, so R3 adopts this one.

### A pre-request record is necessary but **not sufficient**

The architecture keeps two durable systems, and the boundary is defined over
both:

| | production classifier (Postgres) | study harness (write-once JSON, no DB) |
| --- | --- | --- |
| pre-request record | `orgunit_classifier_calls` row | `child-preflight.json`, `ok:true` |
| written | **strictly before** the request | **strictly before** the request |
| execution evidence | accepted classification, or a non-pre-inference completion | any `SEMANTIC_EXECUTION_MARKER_FILE_NAMES` member |

The call row's own schema comment says what it is: *"One attempted
semantic-classifier INVOCATION, recorded before the provider answers … it names
an ATTEMPT, not a result."* **Two paths leave one behind having issued
nothing** — a provider pre-flight/auth refusal, and a bounded repair whose
budget decides `SKIP`. So the boundary is set by **positive evidence of
execution**, never by the absence of a refusal record.

### Why not earlier — the measured incident

This is not a hypothetical. An earlier implementation treated any artifact past
child-manifest construction as semantic execution. On **2026-09-16** the first
real F0X study invocation exposed it: all ten children refused at their own
freeze stage with `providerConstructed: false` and zero provider requests — yet
every slot read as *semantic execution observed*, and the study advanced
through **all ten candidates**. Ten slots spent for zero semantic evidence.

A rule that sets the boundary at the pre-request record reproduces that
incident exactly, while burning a three-attempt budget and a one-shot HOLDOUT.
R3 places the boundary where the repository already learned it belongs.

### The durability gap, stated rather than hidden

**No durable record anywhere is written at the instant a request is issued.**
Between the last pre-request record and the first post-response marker lies a
window spanning the whole network call. The boundary is therefore
**three-valued at classification, two-valued at closure**:

| state | evidence | cost |
| --- | --- | --- |
| `STARTED` | positive execution evidence (F0V Class C) | **CONSUMED** |
| `NOT_STARTED` | confirmed pre-inference refusal, provider never constructed, zero requests | **NOT_CONSUMED** |
| `AMBIGUOUS` | the gap — a request can be neither confirmed nor excluded | **BLOCKED** |

A `BLOCKED` attempt is **neither counted nor released**: the candidate may not
retry against that split until an owner adjudication classifies it, and **the
adjudication default is CONSUMED**.

> Neither automatic answer is defensible. Auto-consuming re-creates the
> 2026-09-16 defect — every harness crash would cost a candidate. Auto-refunding
> *is* the loophole R3 exists to close. So R3 does not pick one silently: it
> halts, preserves the evidence, and puts the decision in front of the owner
> with the default already set against the candidate. Blocking cannot be gamed,
> because it yields no retry.

The harness already behaves this way — it classifies that state
`AMBIGUOUS_EVIDENCE` and blocks, fail-closed.

### Three spendable resources, not one

A distinction that would otherwise look like a contradiction with F0V:

| resource | spent by |
| --- | --- |
| per-run **execution authorisation** (F0V/F7 lineage) | Class **B or C** — can be spent with zero requests |
| **DEV_CONFIRM candidate attempt** (1 of 3) | Class **C only** |
| **FINAL_HOLDOUT** (one-shot) | Class **C only** |

A Class B event spends the authorisation and needs a fresh owner authorisation
before the slot runs again — but it does **not** spend a Methodology V2
candidate attempt. R3 is therefore consistent with the F0V precedent rather
than overriding it.

---

## 3. The consumption table

| terminal outcome | `SEMANTIC_ATTEMPT_STARTED` | cost |
| --- | --- | --- |
| ACCEPT | true | **CONSUMED** |
| REJECT | true | **CONSUMED** |
| INADMISSIBLE | **false** → `PRE_SEMANTIC_INADMISSIBLE` | **NOT_CONSUMED** |
| INADMISSIBLE | true → `POST_SEMANTIC_INADMISSIBLE` | **CONSUMED** |

**Exactly one cell is NOT_CONSUMED.** Consumption is a function of the boundary
alone; ACCEPT and REJECT merely *imply* it was crossed — and the code makes
`ACCEPT` without execution throw, because a study cannot be accepted on
evidence it never gathered.

**Pre-semantic retry** requires the candidate to be **byte-identical** (prompt
version, schema version, request-configuration hash — S6) *and* the defect to
be repaired. A changed candidate is a new candidate. Retries are free of budget
but not of scrutiny: every refusal is a durable record.

**Post-semantic** consumes, counts toward the three, may never re-run against
that generation, admits no replacement attempt, and never promotes a partial
score to ACCEPT or REJECT.

> The budget of three bounds **how many times a sealed split is exposed to a
> candidate**, not how many conclusions are drawn from it. Exposure is what
> contaminates. A study that executed against 400 sealed items and then crashed
> has exposed them exactly as much as one that finished.

---

## 4. Candidate-determined denominators — the G3 case

**Frozen: a realised-denominator failure discovered from candidate outputs is
POST-SEMANTIC by definition and ALWAYS consumes the attempt.** Explicitly
**not** a harness-only failure.

G3 unit-page precision is the exposed gate: its denominator counts the items
the candidate *answered* `UNIT_PAGE`. If the candidate predicts too few for the
realised denominator to satisfy the feasibility precondition:

```
outcome:  INADMISSIBLE
attempt:  CONSUMED
rerun against the same DEV_CONFIRM:  FORBIDDEN
```

**The incentive this closes:** without it, a candidate could avoid ever being
judged on precision by predicting `UNIT_PAGE` almost never — the gate would go
inadmissible, the attempt would be refunded, and the author could iterate
indefinitely against a sealed split. R3 makes that strategy cost a slot every
time. The rule is stated over the *property* (candidate-determined), so any
future such metric inherits it.

---

## 5. FINAL_HOLDOUT and stability

**Before the boundary:** a purely structural/preflight INADMISSIBLE does **not**
consume or retire the HOLDOUT. The same byte-identical selected candidate may
retry once the defect is repaired. (It may still need a fresh execution
authorisation — Class B.)

**At the boundary:** once `SEMANTIC_ATTEMPT_STARTED` becomes true, the
FINAL_HOLDOUT is **CONSUMED and RETIRED irreversibly at terminal closure —
whether ACCEPT, REJECT or INADMISSIBLE.** No second semantic attempt, no rerun
after provider or runtime terminal failure, no rerun after realised-denominator
infeasibility, no replacement candidate, no threshold change, no prompt change.

A post-semantic INADMISSIBLE HOLDOUT **does not mean the candidate failed
semantically.** It means **NO VALID HOLDOUT CONCLUSION** and **THE HOLDOUT IS
RETIRED** — the loss of the instrument, not a verdict on what it measured. It
is not a pass either; nothing may be concluded in either direction.

> Retiring a HOLDOUT on a crash is expensive and is meant to be. A one-shot
> instrument that can be re-run whenever the first run is inconvenient is not
> one-shot, and the failure mode it guards against does not care whether the
> first attempt ended in a verdict or in a stack trace.

**Stability** is governed by the same boundary. Because the subset is drawn
from the split the main pass already evaluated, there is **no reachable state
in which a stability failure is pre-semantic**: the attempt is already
consumed. On a replicate terminal failure — do not re-run, do not replace,
report INADMISSIBLE, preserve the evidence. This is **not** N = 5 replacement
logic returning; R2 already forbade replacement, and R3 adds only that the
failure consumes rather than refunds.

---

## 6. Disclosure

Two **procedural** tokens join the permitted surface, and nothing else:

- `ACCEPT / REJECT / INADMISSIBLE`
- `CONSUMED / NOT_CONSUMED`

Both are needed: the terminal token alone cannot operate D5's budget under R3,
because an INADMISSIBLE attempt may be either. `additionsRequiringOwner­
ConfirmationAtFreeze` is now **empty** — R2's proposed addition was approved.

Still forbidden: which item caused inadmissibility, which organisation, which
evaluation, partial candidate outputs, per-item denominators, item-level
failure reasons. A **coarse structural reason may be retained internally for
audit** but is withheld from prompt development if it could reveal sealed item
information — **default withhold**. Worked example: a G3 denominator shortfall
is coarse, but disclosing it tells an author the candidate predicted
`UNIT_PAGE` too rarely *on these sealed items*, which is an aggregate about the
split. Withheld.

The `discloseAttempt` helper drops everything else **by construction** — a
caller cannot widen the surface by passing more, and a test proves an item id,
an organisation and a denominator all fail to survive the call.

---

## 7. The rule is executable, not only written

`src/test/harness/phase2b2d2c/methodology/attemptConsumption.ts` (pure, **zero
imports**, outside `src/orgunits/`) encodes the rule as code:
`resolveSemanticAttemptState`, `classifyAttempt`, `inadmissibilityClass`,
`mayRetrySameCandidate`, `classifyRealisedDenominatorFailure`,
`DevConfirmBudget`, `FinalHoldoutState`, `discloseAttempt`.

**66 focused zero-provider tests** drive it and then check the document agrees:
the four-cell table executed row by row, a budget that closes on the third
consumed attempt and refuses a fourth, 50 consecutive pre-semantic refusals
incrementing nothing, a HOLDOUT surviving ten pre-semantic refusals and
retiring on the first semantic close under all three outcomes, and every
conceivable second HOLDOUT attempt throwing.

> A consumption rule stated only in prose is a rule a reader interprets. Stated
> as a pure function it is a rule a test executes.

---

## 8. What R3 does not change

Byte-identical to R2, asserted per section: `sectionC` (D2 statistics),
`sectionD` (Option B), `sectionE` (sampling SD1–SD12), `sectionF` (prevalence),
`sectionI` (gold and review), `sectionJ` (splits), `sectionK` (feasibility),
`sectionN` (Phase 2E entry). Six semantic gates, seven structural
preconditions, 40-item R = 3 stability, `V_STAB` at 0.90 / 0.10 — all
unchanged. The seven preconditions gain an *evaluability* classification and
**nothing else**; their rule text is asserted identical to R2's.

The historical documents are not rewritten. R2, R1 and the original proposal
keep their bytes.

---

## 9. The only remaining owner action

**`OWNER_FREEZE_APPROVAL_OF_EXACT_R3_BYTES`** — a separate future record naming
this R3 file's exact SHA-256. This task does not create it.

Freeze approval would freeze Methodology V2 for the next methodology
generation. It would **not** authorise acquisition, labelling, inference,
HOLDOUT creation or Phase 2E entry; each needs its own authorisation.
