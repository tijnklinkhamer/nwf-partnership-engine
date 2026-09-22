# Phase 2B-2D — A3 R17: A2 acquisition-of-record → A3 slot authority contract (V1)

**Status:** pure contract only. No real Generation-1 authority was resolved.
**Branch:** `feat/phase2b-2d-a3-canonical-prep-r17`
**Exact parent:** `b3bd7449496d5acdf00650c596a013ffefe0f8b2` (terminal commit of the
reachable short-text membership policy binding)
**A2 tip observed:** `696c52333fe0e16b41eacd6b387cc5f692c2dde9` (unchanged since the last
external observation; not merged, not copied)

## 1. The question

For one frozen Generation-1 selection slot, which A2 organisation acquisition — if any
— is currently authorised to become A3 input?

R17 answers **who / which acquisition** may feed A3. It never answers which pages enter
SET_P or SET_R.

## 2. Preflight

`git fetch origin` found `origin/feat/phase2b-2d-a2-batch-02` still at `696c523`. No
intervening A2 commit exists, so DRAW semantics, reserve replacement semantics, Q1–Q4,
the adjudication semantics, the A2 record taxonomy, split inheritance, Methodology V2 R3,
Plan V1 and the canonical A3 authority are all unchanged. No
`STOP_R17_A2_A3_SLOT_AUTHORITY_DRIFT_REQUIRES_REVIEW`.

State at that tip, as recorded by
`PHASE_2B_2D_A2_POST_MIXED_WINDOW_CHAIN_REPLACEMENT_AND_PRIMARY_EVIDENCE_ADJUDICATION_V1`:
19 slots adjudicated successful, 1 current primary adjudicated unsuccessful (open
replacement obligation), 90 primaries never started, 7 reserves consumed, reserve
position 7 next and unassigned.

## 3. The A2 authority taxonomy (reconstructed from committed records)

| record class | what it authorises | acquisition success? |
| --- | --- | --- |
| DRAW (`DRAW_V2_GEN1`) | the initial occupant, `selectionIndex` and split of all 110 slots; 40 ranked reserves with **no** split | no |
| REPLACEMENT LEDGER (`RESERVE_REPLACEMENT_LEDGER_V2_GEN1`) | append-only slot transitions — **occupant** authority | no |
| PRENETWORK ASSIGNMENT | one future reserve occupant for execution (it performs the ledger append) | no |
| LIVE WINDOW AUTHORITY | bounded institution-network execution | no |
| STRATEGY / WINDOW PLAN | precommit a later window | no |
| LIVE RESULT (`LIVE_WINDOW_RESULT_EVIDENCE_PENDING_ADJUDICATION`) | nothing; observation. Carries `diagnosticSd9` beside `diagnosticSd9IsAdjudicative: false` | **no** |
| EVIDENCE ADJUDICATION (`LIVE_WINDOW_EVIDENCE_ADJUDICATION` and earlier shapes) | per-item `finalAdjudication` ∈ the five frozen dispositions | **yes — the only disposition authority** |

The adjudication records are heterogeneous across windows (Batch-01/02 execution
records, Option-B / C-lite / v4 / v6 revalidation adjudications, a partial adjudication
that left one item `PENDING_CAPABILITY_REVIEW`, and the live-window adjudications).
R17 therefore defines the **normalised** fact first and parses none of them.

The token `A2_TERMINAL_EVIDENCE_ADJUDICATION` is R17's discriminant for "a
normalised, already-validated terminal adjudication fact". It is not an A2
`recordKind`. Mapping each historical record onto it is R18's job.

## 4. Current-occupant derivation (Owner Clarification Q2)

`SAME_SELECTION_SLOT_APPEND_ONLY_ACROSS_PRECOMMITTED_WINDOWS`, value-checked against the
owner clarification file by the behaviour test.

`resolveCurrentSlotOccupant(slot, slotTransitions, reserve)`:

1. start with `tail = draw.selection[S]` (PRIMARY, reserve position `null`);
2. for each transition for S, in append order, require:
   - the same `selectionIndex`;
   - the slot's frozen split;
   - a reason from the four frozen tokens;
   - a strictly increasing `sequence`;
   - `replacedOccupantKind` = `ORIGINAL_SELECTION` for the first transition, and
     `RESERVE_REPLACEMENT` after that;
   - `previousSequenceForSlot` = the previous tail's sequence;
   - `replacedEcheRowKey` = the previous tail's identity;
   - `replacementEcheRowKey` = `draw.reserve[reserveRankPosition].echeRowKey`;
   - a lower-hex `entryHash`;
   - no reserve reinstalled within the chain.

   Then set `tail` to that reserve (RESERVE_REPLACEMENT).
3. the current occupant is the tail. The chain is returned in full as proof: every link
   carries its draw digest, the ledger sequence and entry hash that installed it, and the
   reason it was replaced.

The caller never supplies a current occupant. The input type has no field for one.

## 5. Replacement-chain invariants

**Slot-local** (`resolveCurrentSlotOccupant`): see §4. This check is honest about its
limits. One slot's chain cannot prove that a reserve is not reused by another slot, and
a test shows two slot-local calls both accepting reserve 0.

**Generation-global** (`resolveGenerationSlotAuthorities`). These mirror the canonical
validator's positional rules, without its hashing:

- `entries[k].sequence === k`;
- at most 40 entries;
- a reserve position or reserve identity is consumed at most once
  (`LEDGER_RESERVE_REUSED`);
- `reserveRankPosition === k` (Q1 monotonic consumption);
- no replacement identity is a selected entry;
- `recordedAtUtc` is ISO-8601 UTC and non-decreasing;
- `previousEntryHash` chains to the prior `entryHash`.

**No hash is recomputed.** R17 imports nothing from `continuationWindow/`: R1's namespace
guard forbids it, and its validator hashes with `node:crypto`. R18 must first pass the
committed ledger through the canonical `validateReplacementLedger`, which recomputes the
entry and ledger hashes. Only then may it normalise the ledger into R17's input.

**Cross-checks against adjudications:**

- a replaced occupant with a terminal `ACQUISITION_SUCCESSFUL` fact is refused
  (`REPLACEMENT_AFTER_TERMINAL_SUCCESS`);
- a replaced occupant whose adjudicated unsuccessful reason differs from the ledger
  reason is refused (`REPLACEMENT_REASON_CONTRADICTS_ADJUDICATION`).

All seven real ledger entries satisfy the second rule: slot 3 is `MIN_PAGES`; slots 4, 6,
8 and 10 are `HOST_UNREACHABLE`; slot 12 is `MIN_PAGES`, then `HOST_UNREACHABLE`.
A historical occupant does **not** need a supplied adjudication.

## 6. Split inheritance

The split comes from `draw.selection[selectionIndex].split` only:

- the draw must follow the frozen `SPLIT_ASSIGNMENT_CYCLE_V2_R2` at every index and give
  exactly 20 / 45 / 45;
- a reserve entry carrying a `split` is refused;
- a ledger transition, a fact or a sealed-detail commitment naming another split is
  refused.

Replacement never changes the composition. This is tested over a 7-entry, 6-slot
synthetic chain set.

## 7. The normalised adjudication fact

`A2AdjudicatedAcquisitionFact`:

| field group | fields |
| --- | --- |
| occupant | `generationId`, `selectionIndex`, `split`, `occupantKind` (`PRIMARY` \| `RESERVE_REPLACEMENT`), `reserveRankPosition` (null for PRIMARY), `drawEntrySha256` |
| authority | `factKind: 'A2_TERMINAL_EVIDENCE_ADJUDICATION'`, `disposition` |
| provenance | `adjudication {path, sha256, commit}`, `liveResult {path, sha256, commit}`, `runRefSha256`, `acquisitionPolicyVersion` |
| optional provenance | `acquisitionPolicyTransitionLedger {path, sha256, commit} \| null`, `sealedSd7Detail {split, file, sha256, bytes} \| null` |

Structural provenance checks:

- paths are canonical `docs/evaluation/**.json` with no `.` or `..` segment;
- SHA-256 values are lower-hex;
- commits are full 40-character lower-hex;
- the policy version matches `orgunit-fetch-policy-vN`;
- the sealed detail is a basename only.

No file is hashed or opened.

The draw identity is the A2 records' own public-safe digest: `drawEntrySha256 =
sha256(canonicalStringify(exact draw entry))`, from `continuationWindow/windowPlan.ts`.
The adjudication items already bind it. R17 does not recompute it. The fact is matched
to its occupant by all of `(selectionIndex, split, occupantKind, reserveRankPosition,
drawEntrySha256)`.

`A2NonAdjudicativeEvidenceFact`:

- `factKind: 'A2_NON_ADJUDICATIVE_EVIDENCE'`;
- a `recordKind` from `LIVE_WINDOW_RESULT`, `DIAGNOSTIC_SD9`, `LIVE_WINDOW_AUTHORITY`,
  `PRENETWORK_ASSIGNMENT`, `STRATEGY` or `WINDOW_PLAN`;
- `diagnosticSd9IsAdjudicative: false` (anything else is refused).

It exists only to tell "executed, pending adjudication" apart from "never executed".

## 8. Terminal dispositions

`ACQUISITION_SUCCESSFUL`, `ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET`,
`ACQUISITION_UNSUCCESSFUL_ROOT_AUTHORITY_FAILURE`,
`ACQUISITION_UNSUCCESSFUL_ROBOTS_DISALLOWED` and
`ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE`.

The four failures are compared element by element with `REPLACEMENT_REASONS`. The
following are refused: `LIKELY_SUCCESSFUL`, `DIAGNOSTIC_SUCCESSFUL`,
`PENDING_CAPABILITY_REVIEW` and any other token.

## 9. The READY rule

`A3_SLOT_ACQUISITION_AUTHORITY_READY` requires all four conditions:

1. **derived occupant:** the current occupant is derived from the draw plus the ledger;
2. **exact match:** exactly one `A2_TERMINAL_EVIDENCE_ADJUDICATION` fact names that exact
   occupant;
3. **success:** its disposition is `ACQUISITION_SUCCESSFUL`;
4. **bound provenance:** the fact passes the structural checks on the adjudication,
   live-result, run-reference and policy fields.

Not-ready states:

- `A2_ACQUISITION_NOT_ADJUDICATED`: no terminal fact and no executed observation for the
  current occupant. This covers never started, and assigned or authorised but not
  executed.
- `A2_EVIDENCE_PENDING_ADJUDICATION`: at least one `LIVE_WINDOW_RESULT` or
  `DIAGNOSTIC_SD9` observation for the current occupant, and no terminal fact.
- `A2_CURRENT_OCCUPANT_ACQUISITION_UNSUCCESSFUL`: carries the disposition and one of:
  - `REPLACEMENT_OBLIGATION_RESERVE_AVAILABLE`;
  - `REPLACEMENT_OBLIGATION_RESERVE_EXHAUSTED`, where a generation freeze would later
    refuse. R17 surfaces this state and neither plans nor assigns.

**Structural refusal** is thrown (`A3SlotAuthorityRefusal`, with a code). It is never a
per-slot variant. A partial generation result, with 109 slots resolved and 1 refused,
therefore cannot exist for a caller to consume.

## 10. Why a live result is not enough

A live result can carry `diagnosticSd9 = ACQUISITION_SUCCESSFUL`. It is still an
observation, recorded with `diagnosticSd9IsAdjudicative: false` by A2 itself. Only the
owner's evidence adjudication decides, for example on non-exact SD7 ranges, operational
helper review, host-state integrity and database re-verification.

R17 has no conversion from a diagnostic, and no function whose name suggests one. A
live-result-shaped object placed in the adjudication list is refused on its missing
discriminant, whatever disposition string it carries.

## 11. Primary, replacement and chained cases

| case | chain | result |
| --- | --- | --- |
| primary | no transition | the primary's own facts decide |
| replacement | primary fails → R0 succeeds | READY on R0; the primary's failure stays audit history |
| replacement pending | R0 has only a live result | PENDING |
| pre-network assignment | R0 assigned only | NOT_ADJUDICATED; occupant authority is not acquisition authority |
| chained | primary → R0 → R1 | the tail alone is current; READY binds only the tail |

The READY object carries the ledger entry hashes of the whole slot chain.

## 12. Stale success and success-then-replacement

The Q2 record states `chainTerminatesOnlyWhen: ["A. an organisation occupying the slot
is ACQUISITION_SUCCESSFUL", "B. the reserve is exhausted …"]`. A ledger transition that
follows a terminal success therefore contradicts frozen authority. R17 refuses it
structurally (`REPLACEMENT_AFTER_TERMINAL_SUCCESS`); it does not merely return NOT READY.

A stale success can therefore never make a slot READY, and it can never be silently
replaced. Without the stale fact, the replaced slot resolves on its tail as usual.

## 13. Policy-version handling

`acquisitionPolicyVersion` preserves the actual policy of the run of record, v1 through
v6 as found. There is no latest-only filter: slots adjudicated successful under v1, v2,
v3, v4 and v6 are all READY in the same resolution.

## 14. The policy-transition ledger (decision)

The transition ledger records **which run of the same occupant** is the acquisition of
record across policies. Entries exist for slots 1, 4, 5, 6, 7, 8 and 12. The adjudication
that moved the run of record binds the ledger, and the latest adjudications bind it too.

R17 carries it as optional provenance: `acquisitionPolicyTransitionLedger`, nullable, and
structurally validated when present. It is **not** mandatory per occupant, because most
occupants never transitioned.

R17 still requires exactly one terminal fact per occupant. A superseded run's historical
adjudication must therefore not be supplied as a second terminal fact for the same
occupant. If it is, R17 refuses (`DUPLICATE_TERMINAL_ADJUDICATION`); it never picks the
later one. R18 must derive the supersession mechanically from the transition ledger's
`oldRunOpaqueRef` / `newRunOpaqueRef`, never by "latest file wins".

## 15. Run and evidence provenance; sealed commitments

READY carries `runRefSha256` exactly as the public records bind it (SHA-256 of the
database run id). No raw run UUID is required. R18 may prove
`sha256(databaseRunId) === runRefSha256`.

The sealed SD7 detail is carried as `{split, file (basename), sha256, bytes}`. The file
is never opened, and the split-scoped root path is not carried: a later split-scoped
adapter resolves it by split.

READY also carries:

- the draw binding;
- the ledger `{path, fileSha256, ledgerHash, entryCount}`;
- the slot-chain entry hashes;
- the adjudication and live-result bindings.

That is enough for a later assembly step to re-verify that the same ledger and authority
state still holds before it materialises anything (TOCTOU).

**No authority-snapshot digest was invented.** No frozen preimage exists, and choosing
one would be a new owner decision.

## 16. Public vs internal

READY and the resolution are marked `INTERNAL_NEVER_SERIALISE_PUBLICLY`. READY objects
are minted into a module-private WeakSet, and `isA3SlotAcquisitionAuthorityReady`
accepts only minted objects. A spread, a `structuredClone`, a literal or a live-result
row is rejected. Downstream A3 code must consume a minted
`A3SlotAcquisitionAuthorityReady`, never a live-result row.

`deriveGenerationSlotAuthoritySummary` accepts only a resolver-issued resolution. It
exposes counts only, with no slot index and no identity, and reconciles them
mechanically:

- `ready + notReady = 110`;
- `unsuccessful + pending + noTerminalEvidence = notReady`;
- the split counts are 20 / 45 / 45.

Refusal messages name a code, a field category, an array position or a slot-chain
position. They never name an organisation, an eche row key, a run reference or a path;
this is tested with a needle scan.

## 17. Complete / incomplete

`A3_GENERATION_SLOT_AUTHORITY_COMPLETE` means only that all 110 slots are READY: every
selected slot has an acquisition-of-record organisation allowed to feed A3. It does not
mean A3 is complete, and it is not a freeze verdict.

A synthetic state shaped like the current one is `INCOMPLETE`, with an exact summary:

| count | value |
| --- | --- |
| ready | 19 |
| unsuccessful current occupant | 1 (open replacement obligation) |
| never started | 90 |
| replacement occupants | 6 |
| reserves consumed / unused | 7 / 33 |

No real slot identity is encoded, and no production logic names 18, 19, 90, 110 or 45.

## 18. Hard boundaries held

R17 does none of the following:

- query a database, run a DB adapter or read sealed roots;
- touch the filesystem (no directory scan, no glob, no "latest" selection, no git parser);
- parse A2 JSON;
- run real A3 or produce SET_P / SET_R;
- adjudicate, assign reserves or mutate the ledger;
- integrate with the preflight (`corpusFreezePreflight.ts` is unchanged, and
  `REAL_ACQUISITION_COMPLETION` stays in `notCheckedByCurrentPrep`);
- change production code or migrations.

The `a3prep/` namespace grows from 15 to 16 files. `syntheticFixtures.ts` is still
absent.

## 19. Next slice (not implemented)

`R18 — COMMITTED A2 ADJUDICATION / LEDGER → R17 NORMALISED AUTHORITY ADAPTER ANALYSIS`.

R18 should determine how the heterogeneous append-only A2 governance records can be
translated mechanically into R17 facts without "latest file wins". This covers:

- the Batch-01/02 execution records;
- the Option-B, C-lite, v4 and v6 revalidation adjudications and the transition-ledger
  supersession;
- the partial adjudication's `PENDING_CAPABILITY_REVIEW` item, which maps to an
  observation and not a disposition;
- the live-window adjudications.

R18 should also design the real split-scoped DB-evidence adapter boundary: canonical
ledger validation first, then `sha256(runId) === runRefSha256`, the policy version and
split-scoped sealed access.
