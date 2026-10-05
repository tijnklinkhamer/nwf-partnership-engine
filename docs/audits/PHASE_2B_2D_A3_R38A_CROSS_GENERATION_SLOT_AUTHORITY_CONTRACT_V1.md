# Phase 2B-2D A3 R38A — Cross-generation slot-authority contract V1

Owner decision: `AUTHORISE_A3_R38A_CROSS_GENERATION_SLOT_AUTHORITY_CONTRACT_V1`.
Public record: `docs/evaluation/PHASE_2B_2D_A3_R38A_CROSS_GENERATION_SLOT_AUTHORITY_CONTRACT_V1.json`
(`thisFileAuthorises: []`).

Terminal state:
`R38A_CROSS_GENERATION_SLOT_AUTHORITY_CONTRACT_V1_COMPLETE_READY_FOR_SEPARATELY_AUTHORISED_GOVERNANCE_V5_RETRY`.

This is a pure authority-contract task. It does not retry Governance V5, mint
a V5 registry or snapshot, replay terminal A2, derive a V4 → V5 DEV_TRAIN delta
or start R39.

## 1. Why R38 refused

R38 (blocker tip `960856b`, refusal record SHA-256
`7cf59593d06ba77cf29206120496c3e642acccd28a580b1b13b7d5181fc9dec0`) proved
from committed bytes that the terminal Generation-2 A2 state cannot be shown
to the unchanged R17 contract without identity translation:

| id                           | what R17 would have needed                                      |
| ---------------------------- | --------------------------------------------------------------- |
| `I1_GENERATION_IDENTITY`     | relabel one generation's facts as the other's                   |
| `I2_RESERVE_NAMESPACE`       | renumber Generation-2 reserves into 0..39, or invent a draw digest |
| `I3_SINGLE_LEDGER_CHAIN`     | concatenate and re-sequence two hash-independent ledgers        |
| `I4_LEDGER_ENTRY_VOCABULARY` | rename Generation-2 fields and occupant kinds into R17's        |
| `I5_CONTINUITY_PROJECTION`   | declare carried authorities UNCHANGED (or CHANGED) by fiat      |

R38A treats that as an accepted architectural finding, not a failed
implementation, and addresses exactly those five gaps.

## 2. Why R17 stays correct and frozen

R17 answers one question for one Generation-1 resolution: one draw, one
40-entry reserve namespace, one replacement ledger. Within that scope it is
right, and V1–V4 governance and every downstream A3 layer rely on it meaning
exactly that. Widening it would silently change the meaning of every authority
it has already minted. `a3prep/slotAuthority.ts` is byte-identical
(`deee711b6eac66bccec51afee49615b71b94d0701b110a3abd50c1c12207f165`), it still
refuses `METHODOLOGY_V3_GEN2` with `GENERATION_MISMATCH`, and its tests are
untouched.

## 3. Why a sibling contract

The new namespace `src/test/harness/phase2b2d/a3crossGenerationSlotAuthority/`
(`types`, `refusal`, `occupantIdentity`, `chain`, `terminalFacts`, `resolve`,
`continuity`) sits beside R17. It is pure: no filesystem, git process,
database, SQL, environment, clock, randomness, network, provider, classifier,
sealed file or hashing. Its inputs are already-normalised committed-governance
facts; producing them from committed A2 bytes is a later adapter's job.

It REUSES R17 rather than re-implementing it: the Generation-1 prefix of every
chain is validated by calling R17's own `resolveGenerationSlotAuthorities`
over the Generation-1 draw and ledger with no facts, and reading back R17's
derived chains. Generation-1 validity therefore means exactly what it meant
before.

## 4. Three generations, not one

| field                     | meaning                                                   |
| ------------------------- | --------------------------------------------------------- |
| `resolutionGenerationId`  | whose state is being resolved (here always Generation 2)  |
| `occupantGenerationId`    | whose namespace the current occupant was drawn from       |
| `acquisitionGenerationId` | which generation genuinely issued the adjudication of record |

A carried Generation-1 success is (Gen2, Gen1, Gen1); a Generation-2 reserve
acquisition is (Gen2, Gen2, Gen2); a primary first acquired in Generation 2 is
(Gen2, Gen1, Gen2). Only `METHODOLOGY_V3_GEN2` is a supported resolution
generation — a Generation-1 resolution is R17's.

A fact's generation is provenance, not a label: each generation contributes an
explicit, closed registry of the adjudication records it committed, and a
fact whose adjudication sits in the other registry is refused
(`FACT_GENERATION_RELABELLED`). A Generation-1 fact can never authorise a
Generation-2 reserve, and a Generation-2 fact can never authorise an occupant
Generation 1 already replaced.

## 5. Occupant kinds and reserve namespaces

Occupant kinds are explicit authority data: `PRIMARY`,
`GENERATION1_RESERVE_REPLACEMENT`, `GENERATION2_RESERVE_REPLACEMENT`. Source
identity is a discriminated union:

- **PRIMARY** — selection index, original draw-entry SHA-256, eche row key,
  organisation id. No reserve field.
- **Generation-1 reserve** — `GENERATION1_DRAW_RESERVE`,
  `generation1ReserveRankPosition` (0..39), draw-entry SHA-256, eche row key,
  organisation id.
- **Generation-2 reserve** — `GENERATION2_RESERVE_SCHEDULE`,
  `generation2ReserveRankPosition` (0..5669), `sourceFrameRankPosition`
  (= 150 + position), `scheduleEntrySha256`, `frameEntrySha256`, eche row key,
  organisation id.

A reserve's identity is namespace + namespace-local position + that
namespace's own digest + organisation. Generation-1 reserve 0 is not
Generation-2 reserve 0. No Generation-2 reserve carries a draw-entry digest,
no authority exposes a bare `reserveRankPosition`, and there is no global
reserve index. The exact key set of each source kind is enforced, so a
substituted `drawEntrySha256` on a Generation-2 reserve is refused.

## 6. Schedule-entry identity

The Generation-2 schedule is the never-drawn suffix of the frozen frame:
exactly 5,670 entries, position p at frame rank 150 + p, disjoint from every
Generation-1 draw identity. Its identity is the schedule's own:
`scheduleEntrySha256 = sha256(canonicalStringify(entry without scheduleEntrySha256))`.
The contract checks positions, ranks, uniqueness and disjointness; the tests
recompute every committed schedule digest from the A2 checkpoint bytes.

## 7. Two ledgers, one chain view

`GENERATION1_REPLACEMENT_LEDGER` and `GENERATION2_REPLACEMENT_LEDGER` are bound
independently (generation, namespace, path, file SHA-256, ledger hash, entry
count). Sequences are namespace-local; nothing is concatenated or
re-sequenced. The Generation-2 header must bind the exact Generation-1 ledger
(path, file digest, ledger hash, entry count) and draw it continues from.

The chain is: original primary → Generation-1 transitions → Generation-1
terminal occupant → Generation-2 transitions. Each link carries its source
identity and a discriminated installation (`ORIGINAL_SELECTION_NO_INSTALLING_LEDGER`,
Generation-1 sequence + entry hash, or Generation-2 sequence + entry hash +
replaced-occupant kind). The chain position is an in-memory index only.

Generation-2 rooting is exact: a slot's first Generation-2 entry replaces its
exact Generation-1 terminal occupant (`GENERATION1_TERMINAL_OCCUPANT`, no
previous Generation-2 sequence); every later one replaces its previous
Generation-2 reserve (`GENERATION2_RESERVE_REPLACEMENT`, the previous
Generation-2 sequence). The Generation-2 ledger's native vocabulary is read
as-is; an entry carrying `reserveRankPosition`, or a first entry labelled with
a Generation-1 kind, is refused.

The canonical hashing validators of both ledgers remain required upstream.
This contract recomputes no hash and broadens no validator.

## 8. Carry-forward admission

A Generation-1 success may remain the acquisition of record in Generation 2
only through an explicit `GENERATION1_TO_GENERATION2_CARRY_FORWARD_ADMISSION`
naming that exact slot, split, Generation-1 occupant, Generation-1
adjudication, acquisition-of-record result, run, policy and policy-transition
binding, in a slot no Generation-2 transition has touched. An admission
naming another occupant, a changed run, a changed policy, a superseded
occupant, a Generation-2 reserve, or a duplicate is refused; a carried
Generation-1 success without one is refused. An admission creates no run, no
adjudication and no live result, and changes no generation or policy.

## 9. Acquisition of record

Two declared kinds: `ORDINARY_ADJUDICATED_ACQUISITION` (the adjudicated result
is the record) and `ACCEPTED_TARGETED_RECOVERY_ACQUISITION` (the fact's own
adjudication explicitly selects the recovery result, and the original result
and run stay bound). The contract never compares times, orders results or
prefers a newer run: a second terminal fact for one occupant is refused, a
recovery not selected by the adjudication is refused, and a recovery form
that drops the original result or run is refused.

## 10. READY rule

READY iff the current occupant is derived from the selection and both chains,
exactly one terminal fact names it, the disposition is
`ACQUISITION_SUCCESSFUL`, the adjudication / result / run / actual policy are
bound, a Generation-1 fact is carried only through a genuine admission in an
untouched slot, and a Generation-2 reserve is authorised only by a genuine
Generation-2 fact naming its schedule identity. Diagnostic SD9, live results,
freeze aggregates, feasibility booleans, window authorities, strategies, plans,
pre-network assignments and corpus-freeze counts are not inputs at all.

Resolution is all-or-nothing: authorities are registered as minted only after
every check over every slot has passed. Minting is private (`WeakSet`); spread
copies, `structuredClone`, JSON round trips, literals and R17 READY objects
are all rejected. There is no unsafe or test-only mint.

## 11. The owner-defined continuity rule

Resolution context is not acquisition authority. `resolutionGenerationId` is
never by itself an evidence change; a carried authority's
`acquisitionGenerationId` stays Generation 1 and is compared with R17's
`generationId`. The new bridge (`continuity.ts`) is explicit; R26's
comparator is untouched and not replaced.

**Evidence-continuity fields:** selection index, split, organisation, eche row
key, acquisition generation, current occupant identity, original source
identity (selection entry + draw), Generation-1 slot-local chain and its
ordered entry hashes, this slot's Generation-2 transitions, disposition,
adjudication, acquisition-of-record result, run reference, policy,
policy-transition binding, sealed SD7 commitment.

**Governance context, deliberately excluded:** `resolutionGenerationId`; the
whole-ledger revisions of both ledgers (another slot's append is context);
the Generation-2 schedule binding; and the carry-forward admission binding —
which must be present and is verified as genuine before UNCHANGED is possible,
but whose existence proves continuity rather than changing it.

R17 `PRIMARY` maps only to `PRIMARY` with the same draw entry; R17
`RESERVE_REPLACEMENT` maps only to `GENERATION1_RESERVE_REPLACEMENT` in
`GENERATION1_DRAW_RESERVE` with the same position and digest. A Generation-2
reserve can never compare unchanged. Any Generation-2 transition in the slot
makes the old authority changed; a Generation-2 append for another slot does
not. CHANGED results name the exact semantic fields that differ, in a fixed
order. A Generation-2 acquisition carrying the old Generation-1 adjudication
is refused outright as a relabel.

## 12. What was proven, and with what

The synthetic suite builds Generation-1 ledgers with the canonical
Generation-1 append machinery and validator, and hashes Generation-2 entries
and schedule entries with the landed canonicalizer. It proves I1–I5, the
rooting rules, carry-forward, recovery selection, the READY rule, branding,
all-or-nothing resolution, and UNCHANGED / CHANGED continuity with field-level
reporting. Separately, commit-addressed reads of the A2 checkpoint confirm the
contract's vocabulary matches the landed structures: the generation ids, the
5,670-entry schedule and its recomputable entry digests, the 39-entry
Generation-1 and 21-entry Generation-2 ledgers and their native fields, the
carry-forward slot-record fields and the accepted-recovery provenance shape.
Those reads are shape fixtures only: no terminal authority was assembled and
no slot was classified.

## 13. Why this is not yet Governance V5

No committed-A2 adapter exists for this contract, no V5 registry, namespace,
snapshot or census was created, no terminal per-slot replay was run, and the
V4 13 → V5 20 DEV_TRAIN target was not derived (`derived: false`). Zero
database connections, SQL, institution requests, sealed reads, evidence reads,
labels or provider calls. R39 was not started.

## 14. Next owner decision

> Should a new governance-only R38B task be authorised to adapt the exact
> terminal Generation-2 committed A2 history into this new cross-generation
> contract, attempt Governance V5, and then derive the real V4 → V5 DEV_TRAIN
> continuity?
