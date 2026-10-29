# Phase 2B-2D A3 R45 — Short-text methodology amendment design (V1)

**Task:** `A3_R45_SHORT_TEXT_METHODOLOGY_AMENDMENT_DESIGN_V1`
**Owner authorisation:** `AUTHORISE_A3_R45_SHORT_TEXT_METHODOLOGY_AMENDMENT_DESIGN_V1`
**Authority class:** `NOT_EXECUTION_AUTHORITY` — every R45 record has `thisFileAuthorises: []`.
**Terminal state:** `A3_SHORT_TEXT_METHODOLOGY_AMENDMENT_DESIGNED_AWAIT_OWNER_OPTION_APPROVAL`

R45 is a design review. It does not amend the methodology, it does not change
any SD7 or SD9 code, and it creates no owner approval. It produces an options
record (`docs/evaluation/PHASE_2B_2D_A3_R45_SHORT_TEXT_METHODOLOGY_AMENDMENT_OPTIONS_V1.json`)
and a draft, unapproved amendment proposal
(`docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_R4_SHORT_TEXT_AMENDMENT_PROPOSAL_V1.json`,
`status = DRAFT_AWAIT_OWNER_APPROVAL`, `notFrozen = true`,
`notImplementationAuthority = true`).

## 1. Why R44 forced an owner methodology decision

R44 closed DEV_TRAIN at 20 / 20 on every layer: authority, evidence, documents,
graphs, samples and readiness. Mechanical SD9 succeeded for 20 / 20 slots in
both samples. Corpus freeze is still blocked, because the frozen short-text
policy leaves the following required memberships blocked:

| sample | exact required membership | blocked required membership |
| ------ | ------------------------: | --------------------------: |
| SET_P  |                        14 |                           6 |
| SET_R  |                        16 |                           4 |

The bound gate `REFUSE_IF_REQUIRED_MEMBERSHIP_BLOCKED` refuses on any blocked
membership. The owner's membership policy (clause 11) says that going further
"requires a separate GLOBAL pre-label owner/methodology decision". R45 accepts
R44 (`4fd9ffd`) as the canonical starting state, and its first commit pins
R44's isolation test to `R43_TERMINAL..R44_TERMINAL`.

## 2. Why the current policy cannot resolve it

There are three short-text owner records, and each one deliberately leaves the
semantic question open:

- `SHORT_TEXT_AMBIGUITY_BLOCKS_ONLY_WHEN_IT_CAN_CHANGE_SD9` (`2f41f495…`)
- `SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_AMBIGUITY_PROPAGATION_V1` (`b734805b…`)
- `SHORT_TEXT_REQUIRED_SAMPLE_MEMBERSHIP_LIMITED_TO_REACHABLE_CAPPED_MEMBERSHIP_V1` (`0d6ddaa6…`)

Under these records, ambiguity is propagated and only invariant membership is
materialised. Case-by-case, label, gold and model resolution are all forbidden.
Clause 16 of the membership policy names exact normalised-text matching as
something that record does NOT authorise, and says any such rule "requires
separate review and may constitute a methodology amendment". R45 is that review.

## 3. Anti-post-hoc constraints

**What R45 used:**

- the frozen methodology text (R3 `fdc54873…`, freeze approval `77dae976…`, Plan V1, V3 R1 and its freeze approval);
- the owner records;
- the canonical SD7/SD9 code, read as code;
- invented inputs in tests.

**What R45 did not inspect:**

- which slots are blocked;
- any blocked document, short text, real token sequence, rank position, edge or identity;
- any label, gold or class balance;
- any DEV_CONFIRM or FINAL_HOLDOUT evidence.

No option was run against real data. The only real-data facts R45 uses are 20
slots, 6 SET_P blockers, 4 SET_R blockers and 20 / 20 mechanical success.

**What makes an amendment defensible at this point:**

- It closes a gap that R3 itself leaves undefined (Jaccard 0/0). That gap was identified in A3a, before any sampling.
- It is chosen from the methodology text, before labels exist.
- It is global, including over splits that are still sealed.
- It provably cannot move any verdict that R3 already defines, or any A2 outcome.

**What would make it post-hoc:**

- choosing whichever option clears 6 / 4;
- applying a rule to the blocked slots only;
- choosing after labels, gold or candidate results exist;
- tuning a number to the corpus;
- revising the rule after seeing its effect.

The exact rule must therefore be frozen by an owner approval of exact bytes
before any recomputation observes its effect.

## 4. The key fact about definedness

R3 Jaccard is undefined **only** when both documents produce no 5-token
shingle, because the union is then empty (0/0). When exactly one document is
short, Jaccard is `0 / |S(long)| = 0`, which is defined and below 0.90. The
canonical implementation is more conservative than R3 strictly requires: it
withholds every short document from every comparison. The tests in this slice
prove three facts on the canonical code, using invented inputs:

- canonical `jaccard()` returns 0 for short-vs-long;
- canonical `jaccard()` throws for short-vs-short;
- identical ≥5-token normalised text scores Jaccard 1.0, which is a near duplicate.

So wherever R3 can measure a pair, it already treats "identical normalised
text" as a near duplicate.

## 5. The options

All options were scored on 18 fixed criteria, C01–C18. They are listed in the
options record and were not changed after the comparison. The scale is
qualitative (SATISFIES / PARTIAL / FAILS), with no numeric aggregate.

- **A — `SHORT_TEXT_EXACT_NORMALISED_TOKEN_SEQUENCE_FALLBACK`.** On the undefined branch, a pair is a near duplicate if and only if the complete canonical token sequences are equal. A changes only short-vs-short pairs. Where one document is short and the other is not, A reproduces the verdict R3 already defines (not a near duplicate). On the short branch, A is an equivalence relation, so short-text components are cliques that each contribute exactly one survivor. A adds no number and no gradation. **It satisfies all 18 criteria.**
- **B — adaptive n-gram fallback.** B needs a new rule for choosing n. One 0.90 threshold does not keep one meaning across n: at n = 1 it is token-set overlap, which ignores order. B leaves 0/0 for empty text unresolved. In its per-pair form it re-measures short-vs-long pairs that R3 already defines, and it can remove measurable survivors, which breaks the SD9 invariance proof. B effectively adds a family of uncalibrated metrics, and calibrating them would need the inspection R45 is forbidden to do.
- **C — minimum-token sample eligibility.** C changes the SD3 pool, even though SD3 requires "no class filtering of any kind". It biases the prevalence-faithful SET_P, and it changes the pool that the SET_R score ranks. It breaks the meaning of SD9: an organisation could be successful with fewer than four sample-eligible pages, so SD9 would also need amending. Finalised A2 outcomes provably would not change, but A2 acquisition semantics would. C also gives the shingle size a new role as an eligibility threshold. The owner already rejected C, because it "would change the pre-SD7 population and the frozen rank". **C is not simple.**
- **D1 — always include (never a near duplicate).** D1 has the smallest restart surface of any option, because the graph is unchanged. But it asserts that identical canonical text is unique. That contradicts SD7's purpose and the invariant R3 itself exhibits. Prior owner records forbid it.
- **D2 — always exclude.** D2 removes unique short evidence and biases SET_P. It has the same SD9 coherence problem as C. Prior owner records forbid it.
- **E — human, label or model resolution.** E introduces discretion, label and model contamination, possible split leakage, and decisions that cannot be reproduced. Current policy forbids it, and it is not selectable.

## 6. Recommendation

**Option A.** The owner's minimality hypothesis is confirmed (`CONFIRM_THIS_AS_THE_RECOMMENDED_OPTION`), with these refinements:

- A is smallest in semantic terms. D1 has a smaller restart surface but fails on defensibility.
- A changes only short-vs-short pairs.
- SD9 invariance is proved, not assumed.
- The amendment must explicitly cover Generation 2 slots.

**SD9 / A2 invariance proof.** For each organisation:

- Let `[mu_min, mu_max]` be the range of measurable survivor counts over all survivor orders. A leaves this range unchanged, because it adds no edge that touches a ≥5-token document.
- Let `s` be the number of short documents, and `q` the number of distinct canonical short sequences, with `q ≤ s`.
- Under A, the count lies in `[mu_min + q, mu_max + q]`. That range sits inside the ratified envelope `[mu_min, mu_max + s]`.
- So every finalised SUCCESS stays SUCCESS and every finalised FAILURE stays FAILURE.
- Generation 2 closed with no pending slot.

Therefore there is no A2 replay, no replacement and no reserve consumption. A
future replay must still re-assert this result and stop on any contradiction.

## 7. Methodology-version classification

The recommended classification is **`METHODOLOGY_V2_R4`**, as an additive
amendment of R3 SD7. It is not a new methodology generation.

**What A does and does not change:**

- It decides a branch that was previously undefined.
- It changes no defined value, population, acquisition semantics, split, gate, rank or estimand.

**Why not a new major version or generation:**

- Methodology V3 became a new major version and generation (`METHODOLOGY_V3_GEN2`) because it materially changed a frozen, defined value (the reserve) and opened a new acquisition generation.
- R3 SD12 reserves "a new methodology generation" for a change of estimand.
- A new generation id here would wrongly imply a new acquisition cohort.

**Why R4 in additive form:**

- The change is still a methodology amendment, not another operational owner record.
- Additive amendments are an established pattern: the V3 host-confounded revalidation change was a `METHODOLOGY_AMENDMENT_PROPOSAL` with a separate owner approval, and its frozen bytes were never edited.
- The owner records already use "R4" for exactly this kind of change.

**Cross-generation requirement.** V3 inherits R3 by exact SHA-256, and applies
it "UNCHANGED, except the amendments listed". The R4 approval must therefore
state that the amended SD7 clause applies identically to `METHODOLOGY_V2_GEN1`
and `METHODOLOGY_V3_GEN2` slots.

## 8. Proposed rule (draft, not operative)

`SD7_SHORT_TEXT_EXACT_NORMALISED_TOKEN_SEQUENCE_FALLBACK_V1`, clauses N1–N12 in
the options record. In summary:

- Scope stays within one organisation, after exact-SHA deduplication.
- Normalisation is the existing SD7 normalisation.
- When both documents have ≥5 tokens, the Jaccard rule is unchanged byte-for-byte.
- Otherwise, the pair is a near duplicate if and only if the canonical sequences are equal.
- Two zero-token documents are equal to each other, and to nothing else. The extractable-text rule is unchanged.
- The relation is symmetric, and on the short branch it is an equivalence.
- The K3 greedy sample-rank survivor walk is unchanged.
- No new number is introduced.
- An edge means only "the same canonical text counted once". It does not mean semantic equivalence.

## 9. Supersession (append-only; no old record edited)

**Superseded, for the short-text branch only:**

- in the SD9 decision: "remain flagged SD7_SHORT_TEXT_UNRESOLVED" and "do NOT silently declare";
- in the membership policy: clauses 1, 3 and 4, with clause 16's review condition now met;
- in the reachable clarification: clause 8's short-text "unique / near-duplicate verdict" entries.

**Still binding:**

- "do NOT invent Jaccard(empty, empty)";
- the SD9 range rule for survivor-order ambiguity among measurable documents;
- membership-policy clauses 2, 6, 9–12;
- REQUIRED = reachable capped membership;
- the clause-8 prohibitions of ALWAYS INCLUDE, ALWAYS EXCLUDE, special empty Jaccard, smaller n-gram fallback, character similarity, and label- or model-assisted judgement.

## 10. Exact replay boundary (future, unauthorised)

The earliest invalidated layer is the **SD7 graph**.

**Remains valid:**

- A2 outcomes and both reserve ledgers;
- Governance V5 and R38A;
- R39 evidence;
- R40 documents;
- the pre-SD7 SET_P and SET_R orders.

**Becomes historical, for all 20 DEV_TRAIN slots:**

- every SD7 graph, sample-survivor preparation and readiness/SD9 result;
- the 6 / 4 counts.

**Replay shape:** one global recomputation of all 20 slots under the amended
rule. Graph outputs from the old 13 + 7 incremental split cannot be reused,
because reusing any slot's old graph would first require looking at which slots
contain short text. Neither A2 nor any reserve is replayed.

**Steps:** approve the exact R4 bytes, implement, then recompute graph →
survivors → readiness/SD9 for all 20, asserting every SD9 status. After that,
reassess the blockers. Only after that, and under separate authority, consider
the sealed splits.

**Likely implementation surfaces:**

- a new versioned pair relation alongside `measureNearDuplicateGraph`, leaving `nearDuplicatePairs.ts`, `jaccard.ts` and `normaliseText.ts` byte-identical so that historical graphs stay reproducible;
- a rule-version token;
- the a3prep bindings;
- new methodology-specific graph, sample and readiness namespaces.

`a3graphs`, `a3graphsV2`, `a3graphsV4` and `a3graphsV5` remain immutable.

## 11. No claim that the blockers clear

R45 does **not** claim that 6 / 4 becomes 0 / 0. Option A removes the current
type of undefinedness by construction: no `SD7_SHORT_TEXT_UNRESOLVED` position
can arise. The recomputed result remains unseen.

Other blocker classes that could still arise:

- divergent extraction inside an exact-duplicate group;
- the order-audit size guard (20) marking a large short-text clique UNAUDITABLE, unless the implementation treats cliques analytically;
- SD4 truncation;
- the SD5 / SD6 post-label minimums;
- K4 readiness;
- SET_R score readiness;
- the 110-slot structural requirement.

## 12. Why A4 remains blocked

The corpus is not frozen, and no amendment has been approved or implemented.
DEV_TRAIN readiness under any amended rule has not been recomputed, and
DEV_CONFIRM and FINAL_HOLDOUT A3 work has not begun. R45 starts no A4, no A5,
no labelling, no gold and no provider inference.

## 13. Next owner decision

> R45 recommends SHORT_TEXT_EXACT_NORMALISED_TOKEN_SEQUENCE_FALLBACK (Option A)
> as the smallest globally deterministic pre-label amendment and classifies it
> as METHODOLOGY_V2_R4 (an additive amendment of R3 SD7, applying identically
> to Generation 1 and Generation 2 slots; not a new methodology generation).
> Do you approve that exact methodology amendment and authorise a separate
> implementation and global 20-slot DEV_TRAIN replay track?
