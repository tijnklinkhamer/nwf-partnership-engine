# Phase 2B-2D — A3 R19: the committed A2 governance authority adapter

**Integration base (`CANONICAL_A2_A3_GOVERNANCE_INTEGRATION_TIP`):**
`907d726268ad07fe94fec93f4c6f3ff5ce5f93f9`

**R19 implementation commit:** `90e4ef92b41bf8c5e2adce6d654b801c7e1ad60e`

**Branch:** `feat/phase2b-2d-a2-a3-governance-integration-r19`

## The one question

From committed **public** Generation-1 A2 governance only, what exact
normalised input should R17 receive, and what aggregate slot-authority state
does R17 derive from it?

R19 answers it and produces the first real `PUBLIC_GOVERNANCE_ONLY`
Generation-1 authority census. It reads no working database, opens no sealed
root, issues no institution network request, and materialises no SET_P, SET_R
or corpus.

## Why a new sibling namespace

`a3prep/` stays the pure, frozen R1–R17 methodology and tooling layer: it has
no filesystem access at all, so no chronological filename heuristic can ever
become authority inside it. `a3governance/` is the offline adapter that turns
heterogeneous **committed** A2 artifacts into R17's pure in-memory contract.

Keeping them apart is the point. R17 must remain unable to learn about a
registry, a JSON file, a transition-ledger version or a parser family — and it
does not: `slotAuthority.ts` is byte-identical to the integration base, and the
`a3prep/` namespace still holds exactly its sixteen files with
`syntheticFixtures.ts` absent.

| module | what it is |
| --- | --- |
| `registryV1.ts` | the manually explicit registry. Pure data; opens nothing. |
| `loader.ts` | the ONE narrow verified byte reader. |
| `transitionLedger.ts` | the canonical transition-ledger chain validator and the run-supersession graph. Pure. |
| `families.ts` | one exact parser per record family. Pure. |
| `resolve.ts` | normalisation, occupancy scoping, the historical audit, and the R17 call. |
| `snapshot.ts` | in-process minting and the public census. |
| `refusal.ts` | the fail-closed refusal vocabulary. |

## Registry V1

**26 entries.** Every entry pins a repository-relative path, the SHA-256 of the
exact committed bytes, a byte count, the full 40-character commit that last
wrote those bytes, the record's own `recordKind` / `recordId` discriminators, a
parser family and one or more semantic roles.

By parser family:

| count | family |
| --- | --- |
| 1 | `FROZEN_DRAW` |
| 1 | `RESERVE_REPLACEMENT_LEDGER` |
| 4 | `ACQUISITION_POLICY_TRANSITION_LEDGER` |
| 1 | `BATCH01_ATTRIBUTION_OWNER_ADJUDICATION` |
| 1 | `OPTION_B_TRANSITION_OWNER_ADJUDICATION` |
| 1 | `OPTION_B_TRANSITION_MEASUREMENT_OF_RECORD` |
| 1 | `OPTION_C_LITE_REVALIDATION_ADJUDICATION` |
| 1 | `V4_TRANSPORT_REVALIDATION_ADJUDICATION` |
| 1 | `P12_V6_TARGETED_REVALIDATION_ADJUDICATION` |
| 1 | `WINDOW_V1_EVIDENCE_ADJUDICATION` |
| 1 | `WINDOW_V2_PARTIAL_EVIDENCE_ADJUDICATION` |
| 3 | `MIXED_WINDOW_EVIDENCE_ADJUDICATION` |
| 1 | `OWNER_REPLACEMENT_REASON_PRECEDENCE_CLARIFICATION` |
| 8 | `ADJUDICATED_OBSERVATION_RECORD` |

By semantic role (roles overlap):

| count | role |
| --- | --- |
| 1 | `FROZEN_OCCUPANT_IDENTITY` |
| 1 | `OCCUPANT_CHAIN_AUTHORITY` |
| 6 | `RUN_SUPERSESSION_AUTHORITY` |
| 9 | `TERMINAL_DISPOSITION_AUTHORITY` |
| 5 | `HISTORICAL_REPLACEMENT_REASON_AUTHORITY` |
| 8 | `ADJUDICATED_OBSERVATION_BINDING` |

**Deliberately absent.** No strategy, no window plan, no pre-network
assignment, no live-window authority and no state-summary record. None of them
can carry a terminal disposition, and no parser needs one as provenance. Aggregate
`generation1State` blocks are compared **after** derivation as a consistency
check and are never an input to it.

**The registry creates no authority.** It selects already-authoritative
committed bytes, and it is not a directory index: there is no glob, no
enumeration, no "latest", no highest version found, no newest commit and no
newest filename anywhere in the namespace.

**Versioning.** Registry V1 is historical immutable configuration from the
moment R19 lands. A later explicit A2 integration checkpoint creates a **later**
registry version rather than silently making V1 mean new governance. Nothing
follows a branch.

### Byte verification

All 26 bindings verified: recomputed SHA-256, byte count and family
discriminator match the integrated bytes exactly. No refusal.

Fail-closed behaviour is exercised in tests: a missing registered file, one
byte of drift, a path that would escape the repository root, a
`recordKind` that is not the registered discriminator, a duplicated entry and
an unknown parser family each refuse **before** any authority resolves. There
is no warning-only path.

An unregistered JSON file — including one whose filename sorts later than every
real adjudication — has **zero** effect: the derived census is byte-identical
with and without it.

## Frozen DRAW normalisation

110 selection slots and 40 reserve entries, in order, under the frozen split
cycle: DEV_TRAIN 20 / DEV_CONFIRM 45 / FINAL_HOLDOUT 45.

`drawEntrySha256` uses the **already-landed** canonical primitive
(`continuationWindow/windowPlan.ts`, `sha256(canonicalStringify(entry))`). No
second digest algorithm was created.

Draw binding: `drawHash`
`79c9eec906bc9d74f2213722b8addb61cd7c4acd02ce466ab0f8f97137542293`, artifact
file SHA-256 `b7021416894b7547cfe53d0d5f5e34b4e9c35843f8be35f0d2844bc67683b7b3`.

## Replacement ledger validation

File SHA-256 `72c9af2c2b239a6eecb8e84d5a1139eb0b728b1330465f610e73165d7212f114`,
`ledgerHash` `72177c40421cc87ae180865728f5393f8439dae9b3b60691f824a73ebf55e230`,
**8 entries**, reserve positions 0–7 consumed monotonically, no reserve reuse,
unbroken previous-entry-hash linkage, reserve position 8 unassigned.

The **canonical** validator (`validateReplacementLedger` / `requireValidLedger`,
which hashes with `node:crypto`) accepts the ledger against the frozen draw
**before** a single entry is normalised for R17. R17's own positional checks do
not replace it: only the canonical one hashes.

## Transition-ledger validation

The explicit chain **V2 → V3 → V4 → V6**, named by Registry V1, never
discovered. There is intentionally no V5 ledger: `orgunit-fetch-policy-v5` was
implemented but never executed against the working corpus, so no acquisition of
record ever moved to it — V6's predecessor **is** V4, and that is checked rather
than tolerated.

Per version, the validator proves the predecessor's path, SHA-256, byte count,
entry count, `recordKind` (where restated) and `editedByThisRecord` /
`deletedByThisRecord: false`, all against the **registered** predecessor's exact
bytes.

Entry counts across the chain: 1 → 3 → 6 → 7.

### Carry-forward

Each new version copies every predecessor entry with its substance unchanged,
evolving exactly one field, `carriedForwardFromLedgerVersion`:

- absent in the predecessor → **added**, valued the predecessor's own version;
- `null` in the predecessor → **set** to the predecessor's own version;
- a string in the predecessor → **preserved** byte for byte.

So the field always names the version that *introduced* the entry. Every other
field must be deep-equal, with no key added and none removed; a new entry must
declare `carriedForwardFromLedgerVersion: null`. A loose deep equality over the
whole entry would reject that intended evolution; anything looser would admit a
real mutation. Both directions are tested.

**A historical `isTheCurrentLedgerOfRecord: true` flag establishes nothing.**
Three versions carry it — truthfully, each for its own moment. Registry V1 pins
the tip.

## Transition graph

**7 normalised edges**, each carrying selection index, split, old/new policy
version, old/new opaque run ref (both lower-hex SHA-256, and `old !== new`), the
introducing ledger version and the transition reason. Every edge must declare
`reserveConsumed`, `replacementCreated`, `organisationChanged`,
`selectionIndexChanged` and `splitChanged` all `false`, and its superseded run
retained.

**7 supersession chains**, built **per slot** so that a coincidence across slots
can never join two chains. No cycle, no fork. The validator fails closed on a
cycle, a fork on either side, a split change, a selection change, an unreachable
edge, and an occupant scope it cannot prove.

## Occupancy-episode scoping

A policy transition changes the run of **one occupant**. A replacement changes
the **occupant**. These are different axes, and the adapter never lets one
contaminate the other.

Every chain is bound to exactly one occupancy episode — `(selection index,
occupant kind, reserve rank position)` — by requiring that a registered record
naming that exact occupant claims a run reference on the chain. Zero claimants
or more than one both refuse.

At this snapshot **all 7 chains belong to PRIMARY occupancy episodes**, and
they are derived, not assumed: the production algorithm contains no slot list.

- Current occupants **reached through** a transition: **3**.
- Current **replacement** occupants whose replaced primary carries a transition:
  they inherit **nothing**. Their transition binding is `null`.
- A slot whose current occupant is a later reserve has no transition binding
  merely because the slot has history.

Where a binding is non-null, it names the **current registered tip (V6)** by
exact path, file SHA-256 and full commit. Earlier versions are not attached to
the fact; the V6 predecessor chain proves the earlier edges.

## Adjudication parser families

One parser per family, **selected by registry id**, with no generic fallback
and no fuzzy field matching. Each validates its own discriminators —
`recordKind`, `recordId`, `generationId`, owner-decision semantics, exact item
collection shape, required binding fields, run-ref format, policy version,
split and disposition source — so a record from another family cannot parse by
accident.

Three families share the recordKind `LIVE_WINDOW_EVIDENCE_ADJUDICATION` and do
**not** share an item shape. That is precisely why family selection is by
registry id:

| family | how its items are shaped |
| --- | --- |
| Batch-01 attribution | explicit `occupantKind`, `drawEntryKind`, `drawEntrySha256`, `disposition` and an `observationBinding.liveResult` |
| Option B (composed) | an owner adjudication **plus** its measurement of record; neither alone carries the whole fact |
| Option C-lite | a `perIndex` collection with explicit old / new acquisition of record |
| V4 transport revalidation | run **supersession only**; see below |
| P:12 v6 targeted revalidation | a closed capability review that froze one primary's reason |
| Window V1 | `kind` + `reservePosition`, **no** draw digest, disposition in `finalSd9` beside `accepted: true` |
| Window V2 (partial) | four item shapes, including a coarse `ACQUISITION_UNSUCCESSFUL` beside a separately frozen reason, and a pending item with no disposition at all |
| mixed window (×3) | `drawEntryKind` + `drawEntrySha256` + `reserveRankPosition` + `finalSd9` **and** `finalAdjudication` |
| Owner Clarification Q3 | a reason authority only: it names no run and no observation |

### Disposition authority

Only owner / evidence adjudication authority produces a terminal disposition,
and only from the field that family made authoritative. The parser refuses by
name when a `diagnosticSd9`, a live result's `finalSd9`, an observation's
`sd9Status`, `LIKELY_SUCCESSFUL`, `ACQUISITION_STATUS_PENDING_CAPABILITY_REVIEW`
or `ACQUISITION_STATUS_PENDING_SD7` is offered as one. No strategy, plan or live
authority is registered at all.

**A formal SD9 and a frozen replacement reason are not always the same token.**
P:18's formal SD9 was `MIN_PAGES_NOT_MET` while its terminal adjudication under
Owner Clarification Q3 was `HOST_UNREACHABLE`. Families that carry both are
parsed as carrying both, and the later frozen owner disposition wins. Where the
two diverge with **no** Q3 derivation to explain it, the adapter refuses.

The V4 transport revalidation adjudication is registered for run supersession
**only**: its per-index `sd9` values are the formal SD9 of runs whose later
frozen replacement reason under Q3 is a *different* token, so reading a
disposition there would contradict the owner's own precedence.

### Identity precedence

Occupant identity comes from the **frozen DRAW plus the validated replacement
ledger**, never from an adjudication's own restatement of it. A redundant field
— split, reserve position, draw-entry digest, occupant kind, work-item id — must
**match** the structural source; a conflict refuses. There is no silent
precedence resolution after a contradiction.

## Historical replacement audit

**All 8 replacement-ledger entries audited.** For each, the adapter derives the
replaced occupancy episode from the ledger alone, proves that occupant was
terminally **unsuccessful** (never successful), and proves its frozen reason
equals the ledger entry's `reason`.

| ledger sequence | replaced occupant kind | reason source (registry id) | reasons agree |
| --- | --- | --- | --- |
| 0 | `ORIGINAL_SELECTION` | `OWNER_REPLACEMENT_REASON_PRECEDENCE_CLARIFICATION` | yes |
| 1 | `ORIGINAL_SELECTION` | `OWNER_REPLACEMENT_REASON_PRECEDENCE_CLARIFICATION` | yes |
| 2 | `ORIGINAL_SELECTION` | `OWNER_REPLACEMENT_REASON_PRECEDENCE_CLARIFICATION` | yes |
| 3 | `ORIGINAL_SELECTION` | `OWNER_REPLACEMENT_REASON_PRECEDENCE_CLARIFICATION` | yes |
| 4 | `ORIGINAL_SELECTION` | `WINDOW_V2_PARTIAL_EVIDENCE_ADJUDICATION` | yes |
| 5 | `ORIGINAL_SELECTION` | `P12_V6_TARGETED_REVALIDATION_ADJUDICATION` | yes |
| 6 | `RESERVE_REPLACEMENT` | `POST_P12_MIXED_WINDOW_EVIDENCE_ADJUDICATION` | yes |
| 7 | `ORIGINAL_SELECTION` | `POST_MIXED_WINDOW_CHAIN_REPLACEMENT_EVIDENCE_ADJUDICATION` | yes |

Sequence 6 is the case §22 warns about: its formal SD9 was `MIN_PAGES_NOT_MET`
and its Q3-derived replacement reason was `HOST_UNREACHABLE`. The frozen reason
is what the audit compares.

Owner Clarification Q3 binds the **original** occupant of each slot it names,
and that is proved from the ledger — the adapter refuses if a named slot's
ledger chain does not pin it to exactly one original occupant.

Every class of failure is exercised: a ledger reason that contradicts the
occupant's frozen reason, an owner record that restates its own reason
inconsistently, a replaced occupant with no committed reason at all, a replaced
occupant adjudicated successful, and a reason bound to the wrong occupancy
episode.

**None of these historical facts is emitted to R17.** The replacement ledger
already defines the occupant chain and R19 proves the eight reasons
independently, so feeding them would add nothing and would leave stale same-slot
history one bug away from contaminating current authority. The audit is
summarised internally by counts.

## Superseded-run handling

For one occupancy episode, the current run of record is the **unsuperseded
tail** of its validated supersession chain. Historical adjudications of
superseded runs remain audit evidence and are **not** emitted as additional R17
terminal facts. There is no "latest adjudication wins", and a filename, a commit
date or an array position decides nothing.

`MULTIPLE_HISTORICAL_ADJUDICATIONS` is legitimate — the same occupant may have a
v1 adjudication, then a policy transition, then a v3/v4/v6 adjudication.
`MULTIPLE_CURRENT_TERMINAL_ADJUDICATIONS` is a refusal, and after normalisation
at most one current terminal fact exists per current occupancy episode.

A transition tail that carries no terminal authority at all refuses. So does a
current occupant that registered evidence names but Registry V1 holds no
terminal adjudication for (`REGISTRY_INCOMPLETE_FOR_CURRENT_OCCUPANT`) — the
adapter does not go searching for it.

There is **no latest-policy filter**: a valid current acquisition may legitimately
use an older policy, and the derived facts span several fetch-policy versions.

## Normalised R17 input

| quantity | value |
| --- | --- |
| selection slots | 110 |
| reserve entries | 40 |
| replacement-ledger entries | 8 |
| current terminal adjudication facts | **24** |
| current non-adjudicative (pending) evidence facts | **0** |
| terminal items parsed but NOT current | 3 |
| current facts with a non-null transition binding | 3 |

No current fact names an occupant absent from the derived current tails, and
none uses a superseded run reference.

`evidenceStatuses` is empty on purpose: at this snapshot no current occupant has
executed evidence awaiting adjudication. Historical live results are not emitted
merely because they exist, and R19 V1 was not generalised beyond that.

## R17 resolution and the real census

R17 is **called**, not reimplemented: `resolveGenerationSlotAuthorities` derives
current occupants, resolves the replacement chain and mints READY, and
`deriveGenerationSlotAuthoritySummary` produces the public aggregate. R19
duplicates none of it.

| field | value |
| --- | --- |
| `totalSlotCount` | 110 |
| `slotCountBySplit` | DEV_TRAIN 20 / DEV_CONFIRM 45 / FINAL_HOLDOUT 45 |
| `readySlotCount` | **23** |
| `notReadySlotCount` | 87 |
| `unsuccessfulCurrentOccupantCount` | 1 |
| `pendingAdjudicationCount` | 0 |
| `noTerminalEvidenceCount` | 86 |
| `openReplacementObligationCount` | 1 |
| `reserveExhaustedObligationCount` | 0 |
| `replacementOccupantCount` | 7 |
| `primaryOccupantCount` | 103 |
| `reserveConsumedCount` | 8 |
| `reserveUnusedCount` | 32 |
| `status` | `A3_GENERATION_SLOT_AUTHORITY_INCOMPLETE` |

**Cross-check, after derivation only.** The latest public A2 state summary
independently records 23 successful, 1 current failure, 0 pending capability
review, 86 never started, 8 reserves consumed, 32 unused and 1 open replacement
obligation. It agrees field for field. It was not an input.

The one current unsuccessful occupant carries
`ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET` and
`REPLACEMENT_OBLIGATION_RESERVE_AVAILABLE`. **No reserve was assigned**: reserve
position 8 remains unassigned, and R19 appends nothing anywhere.

## Snapshot minting

The governance snapshot is minted **in process**, branded by a private
`WeakSet`. A clone, a spread, a literal or a deserialised copy is not one. A
private `WeakMap` additionally maps every READY authority R17 minted during this
resolution back to the snapshot that produced it — the TOCTOU boundary a later
R20 will use to prove the governance state it was handed is the one it is about
to read against.

There is **no serialised reusable authority token** and **no invented authority
digest**: no `governanceSnapshotHash`, no `authorityDigest`, no census hash. The
snapshot is identified by its exact constituent bindings plus in-process
minting. R17's own `WeakSet` is untouched.

## Public census

`docs/evaluation/PHASE_2B_2D_A3_R19_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V1.json`

- SHA-256 `273962e48057fcfeb948e37870ccea1650776f0c8ff7a07c764400b493c13a1f`
- 3,848 bytes
- generated **from the actual adapter output**, not hand-entered and then made
  to match. The repository-wide Prettier pass then normalised its whitespace,
  which is why the committed byte count differs from the generator's own
  `JSON.stringify` spacing; the content is unchanged.

It is **derived**, not an authority source: `thisFileAuthorises: []`, and it
states it is not A2 acquisition authority, not A3 evidence-loading authority,
not SET_P/SET_R authority, not an A5 corpus freeze and not holdout scoring
authority.

It carries counts and provenance identity only. A serialisation scan proves it
contains no selection index, slot id, organisation id, eche row key, run
reference, draw digest, document hash, URL, domain, sealed filename, label, gold
or classifier data — and that the only lower-hex digest in it is the governance
base commit.

**Temporal truth.** These counts describe governance snapshot `907d726…`. They
do **not** automatically update when the A2 acquisition branch advances; a later
integrated governance checkpoint creates a later registry version and a later
census. This is not "current forever".

**What INCOMPLETE means.** 23 READY is current *acquisition-of-record authority*
only. It does not mean 23 A3 corpus organisations are frozen, that SET_P or
SET_R exists, that FINAL_HOLDOUT is scored, or that A5 is ready.

## Holdout discipline

Only **public committed governance** was read for FINAL_HOLDOUT slots. No
holdout sealed root was opened, no page text was read, no run reference is
exposed publicly, no holdout slot-level result appears in the public census, and
no semantic class information was computed. R17's internal authority carries the
normal internal fields a later split-scoped R20 needs; the public output remains
counts only.

## R17 byte integrity and scope

- `src/test/harness/phase2b2d/a3prep/slotAuthority.ts` SHA-256
  `deee711b6eac66bccec51afee49615b71b94d0701b110a3abd50c1c12207f165` —
  byte-identical to the integration base.
- The `a3prep/` namespace still holds exactly its sixteen files;
  `syntheticFixtures.ts` remains absent.
- `corpusFreezePreflight.ts` is untouched, does not read `slotAuthority.ts`, and
  still lists `REAL_ACQUISITION_COMPLETION` as not checked by current prep.
  23 READY is not 110 READY.
- No `a3prep/` file, A2 governance record, ledger, draw, firewall file,
  production file, migration or dependency was changed.

## Import isolation

`a3governance/` imports `node:fs`, `node:path` and `node:crypto`, the canonical
A2 validators (`continuationWindow/replacementLedger.ts`,
`continuationWindow/windowPlan.ts`), R17 and its own modules — and nothing else.
Asserted absent: `pg`, any pool or database helper, the gateway, `fetch`, any
socket module, any provider or classifier client, any sealed-root identifier,
any home-directory or corpus path literal, `process.env`, `child_process`, and
any SET_P / SET_R module. No `process.env` decides governance. The namespace
writes no file.

## Non-side-effects

| thing | count |
| --- | --- |
| working-database (`nwf_pe`) connections, reads or writes | 0 |
| sealed-root reads | 0 |
| institution network requests | 0 |
| DNS lookups | 0 |
| A2 acquisition executed | 0 |
| A2 strategies, plans or live authorities created | 0 |
| replacement-ledger mutations | 0 |
| reserve assignments | 0 |
| page evidence or candidate rows loaded | 0 |
| labels, gold or classifier/provider calls | 0 |
| SET_P / SET_R materialised | 0 |
| real corpus freezes | 0 |
| migrations | 0 |
| new runtime dependencies | 0 |

## A2 branch movement during this task

The active A2 branch `feat/phase2b-2d-a2-batch-02` stayed at
`c025b7f6454ebe75b616f9b9e5dffadff734535b`, locally and on `origin`, for the
whole task — the same commit the integration base merged. One **uncommitted,
untracked** strategy file exists in that worktree; uncommitted bytes are not
governance and were neither read nor registered.

Had A2 advanced, R19 would still be pinned to `907d726…`. Registry V1 is a
temporal snapshot; newer A2 governance belongs to a later explicit integration
checkpoint.

## Validation

- focused R19 suites: 108 tests, all passing across four files;
- `npm run test:unit`: 5,358 passed, 75 skipped, 0 failed;
- `npm run test:firewall`: 438 passed;
- typecheck, lint, format check, build: clean;
- `git diff --check`: clean;
- the census JSON parses and passes the public-disclosure scan.

## Next slice

**R20 — R17 READY → split-scoped durable database evidence adapter.** Bounded,
preferably DEV_TRAIN first, consuming only real minted R17 READY authorities
from a valid R19 governance snapshot, and proving
`sha256(run.id) === runRefSha256` before it binds an authorised run to raw
durable evidence. Not implemented here.
