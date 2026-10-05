# Generation-2 host-confounded revalidation amendment — design audit (V1)

Offline design only. Starting tip `1baeaa4380c28e16646f7d4164eb6418ed835d59`.
This audit authorises nothing: it approves no methodology change, grants no live
authority, writes nothing to the database, does not touch the ledger and
adjudicates nothing.

Records:

- `docs/evaluation/PHASE_2B_2D_A2_GENERATION2_HOST_CONFOUNDED_REVALIDATION_AMENDMENT_DESIGN_V1.json`:
  the design record.
- `docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_HOST_CONFOUNDED_REVALIDATION_AMENDMENT_PROPOSAL_V1.json`:
  the amendment proposal (`methodologyAmendmentApproved: false`).

## Blocker (current code, unchanged)

The blocker is in `generation2History/adjudicationHistory.ts`, as of commit `020c5ed`.

- **Lines 1042–1047.** The number of adjudicated items must equal the number of
  executed items.
- **Lines 1057–1065.** Each adjudicated item's identity and `runRefSha256` must
  equal the executed item's.
- **Lines 1066–1072.** `integrity.verdict` must be `CLEAN`.
- **Line 1241.** No held state is allowed.

Taken together, a later run cannot become the acquisition-of-record for
G2R:109:20. Item 2 cannot honestly be called CLEAN either.

The focused existing tests pass: 3 files, 89 tests. That confirms the current
contract holds as written.

## Methodology V3

V3 contains no revalidation, acquisition-of-record or integrity rule. The only
nearby wording is V3-A4: "re-acquisition needs a specific invalidated
authority". That sentence is about carried Generation-1 successes, so it is not
relied on here.

Recovery therefore needs an ADDITIVE owner amendment, clauses V3-H1..H10. No
threshold, vocabulary, P1–P8 rule, split or reserve rule changes.

## Precedent (Generation 1)

The governing precedent is the NAT64 vantage recovery: decision `c4b1830`,
precondition `f5cc01c`, authority `6eb14d4`, result `5d4f4be` and adjudication
`cdda77d`. The V4, P12 v6 and slot-66 v7 revalidations follow the same pattern.

**Principles carried over:**

- The historical run is immutable.
- One bounded new measurement of the same occupant is allowed.
- No reserve is consumed.
- Slot and split do not change.
- The precondition must be proved first.
- The acquisition-of-record moves only through a separate owner adjudication.
- Historical stops are not rewritten.
- P5 is not applied to the targeted measurement.

**Not carried over:**

- "Acquisition-of-record = latest run" (here it is bound by hash instead).
- The `PENDING_CAPABILITY_REVIEW` status.
- Recovery series covering several targets.
- Standalone transition ledgers.
- The policy-repair supersession token.

## Chosen design: A

The ordinary window adjudication gains an optional, hash-pinned
recovery-provenance binding.

- **Ordinary items.** Every executed item still appears exactly once, with its
  ORIGINAL run ref. An item without `acquisitionOfRecord` replays exactly as it
  does today.
- **Recovered items.** The original `integrity.verdict` is `HOST_CONFOUNDED`,
  which is the truthful value. A separate `acquisitionOfRecord.recoveryIntegrity`
  block must be `CLEAN`. The verdict applied to the slot is the recovery run's
  adjudicated verdict.
- **Run refs.** Original and recovery run refs share one global uniqueness set.
- **Supersession token:**
  `SUPERSEDED_FOR_GENERATION_ACQUISITION_DECISION_BY_ACCEPTED_HOST_RECOVERY`. It
  says which run the generation reads. It does not say whether that run
  succeeded, and it does not say the original run was wrong.

**Rejected alternatives:**

- **B, a separate recovery adjudication.** It would leave the window partly
  adjudicated in between, and it gives the verdict two sources.
- **C, recovery as a synthetic window.** It would shift window ordinals, enter
  the P2/P5 denominators, and look like an ordinary window.

## Window 13 end state (after future approvals only)

Window 13 gets one adjudication covering both items:

- **G2R:106:19** is adjudicated from its original run as an ordinary CLEAN item.
- **G2R:109:20** keeps its original run, retained and recorded as
  `HOST_CONFOUNDED`. The one accepted recovery run becomes the
  acquisition-of-record.

The original window history is kept: P2 and P5 fired, frozen P8 did not fire,
and the host-integrity stop fired.

Until that adjudication, slot 109 stays ASSIGNED to reserve 20 and reserve 21
stays UNASSIGNED. If the accepted recovery fails, it creates a single future Q1
obligation and nothing more.

## Open owner questions

UQ1–UQ5 are listed in the design record:

1. What the recovery-local P1–P8 readout means.
2. Precondition probe parameters and validity window.
3. The ENOTFOUND semantics, which remain UNKNOWN.
4. Operator-kit P8 conflation repair.
5. Whether an abort at T-0 leaves the recovery invocation unspent.

## Validation note

No `npm run validate` was run, on the owner's instruction for design-only work.
The only checks were JSON generation and `prettier --check` on the two new JSON
files.
