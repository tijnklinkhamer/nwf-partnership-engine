# Phase 2B-2D A2 Generation 2 — Window-05 offline readiness (V1)

- Task: `A2_GENERATION2_WINDOW_05_OFFLINE_READINESS`
- Owner decision: `PREPARE_GENERATION2_WINDOW_05_OFFLINE_READINESS_ONLY_V1`
- Branch: `feat/phase2b-2d-a2-batch-02`
- Canonical start: `d023645a9c7e7a2afae92096e6b2c1bfd6daf861` (the Window-04 adjudication), fresh fetch, local == origin, clean tree
- Record: `docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_05_OFFLINE_READINESS_V1.json`
- Terminal state: `GENERATION2_WINDOW_05_OFFLINE_READINESS_READY_FOR_OWNER_LIVE_AUTHORITY_DECISION`

**This task is OFFLINE readiness only. It authorises nothing.** No institution
network, no DNS, no HTTP, no gateway, no database, no ledger mutation, no
reserve assignment, no live authority, no acquisition invocation, no
LIVE_RESULT, no adjudication, no Window 06. The record carries
`thisFileAuthorises: []`, `isLiveAuthority: false` and every `*Authorised`
flag `false`.

## 1. Canonical start

At start, after a fresh fetch: HEAD == `origin/feat/phase2b-2d-a2-batch-02` ==
`d023645`, clean worktree. The canonical Generation-2 ledger held exactly 5
entries (`ledgerHash e58f872e22f3794ac3af2ed34ee802f0b140ffc95d94dc19a1b28db1a7b00a72`,
file `4e731cc7…`, 7,645 B, last appended at `29a521e`), next Generation-2
reserve position 5, reserve 5 unassigned. No Window-05 readiness, authority,
LIVE_RESULT or G2P:92 acquisition and no Window-06 artefact existed.

## 2. The complete four-window replay

The history is passed **explicitly, in order** — Window 01 → 02 → 03 → 04 —
with no directory scan, no glob and no "latest". Every record is re-hashed
against its pin; the four starting-ledger revisions are read at their pinned
commits; the Window-04 authority is read at its own commit (`05ffde6`) and must
equal the working bytes.

| window | authority | LIVE_RESULT | adjudication | starting revision |
| --- | --- | --- | --- | --- |
| 01 | `219f6d4` | `41bbeda` | `b281bf3` | genesis `40b6b0f` |
| 02 | `da659b5` | `d074c06` | `c6f6cf6` | 2-entry revision `a768cf9` |
| 03 | `a39309f` | `17398aa` | `8f4bc21` | 3-entry revision `0ad42da` (append `29a521e`) |
| 04 | `05ffde6` | `8efe11c` | `d023645` | 5-entry revision `29a521e` (no append) |

Exact paths, SHA-256s and commits are in the record under `bound.window01..04`.

The **Window-02 validation chain** is preserved exactly as landed and is not
rewritten: original validation `VALIDATION_EXECUTION_EXCLUSIVITY_NOT_PROVED`
(not reclassified) → owner ruling → one clean validation re-proof (exit 0) →
adjudication. Window 03 was adjudicated on its own clean governed validation;
Window 04 on its governed validation carried over under
`ACCEPT_WINDOW04_EXISTING_EXCLUSIVE_VALIDATION_FOR_ADJUDICATION_V1`. Neither
reused the Window-02 P5 ruling (`p5.window02RulingNotReused: true`, checked).

`assessAdjudicationHistoryIntegrity` over the four windows: **`holds: true`**.
All four specs rebuild to their authority-bound hashes
(`af9eafe5…`, `59bb9579…`, `012f983b…`, `8f8b4eef…`).

## 3. Window-04 pinned authority-shape correction

The committed Window-04 authority names its starting-ledger binding
`boundLedger` instead of `boundStartingLedger`. It is **not edited**. The
approved correction record
`PHASE_2B_2D_A2_GENERATION2_WINDOW_04_OWNER_SHAPE_CORRECTION_AND_ADJUDICATION_RULING_V1.json`
(`0635507f…`, commit `cb0e196`) is supplied **explicitly with the Window-04
binding only**, together with the authority commit, and validated by the
generic bridge (`e2a38da`), not by this readiness:

- exact correction hash, exact authority path / SHA-256 (`bb24c26a…`) / bytes /
  commit, exact bound spec hash (`8f8b4eef…`);
- the record grants no authority (`thisFileAuthorises: []`,
  `isLiveAuthority: false`, every `*Authorised` false);
- it maps **only** `boundLedger → boundStartingLedger`, with the source value
  pinned by canonical hash, `valuesAltered: false`, `otherFieldsRemapped: false`,
  scope `EXACT_PINNED_WINDOW_04_AUTHORITY_ONLY`;
- it carries no override key; `APPROVED_AUTHORITY_SHAPE_CORRECTIONS` has exactly
  one entry, pinned to window 4 and that authority's SHA-256.

Without the correction the same four-window history still refuses
(`HISTORY_RECORD_SHAPE`, integrity `holds: false`); the replayed binding shows the
correction on Window 04 only (`[false, false, false, true]`).

## 4. Future authorities return to `boundStartingLedger`

The Window-04 correction is historical compatibility, not a second spelling.
On a synthetic, in-memory Window-05 authority built by the landed synthesiser:
it carries `boundStartingLedger` and no `boundLedger`, and replays; the same
authority with only `boundLedger` refuses `HISTORY_RECORD_SHAPE`; attaching the
Window-04 correction to it refuses `HISTORY_AUTHORITY_SHAPE_CORRECTION_KIND`,
and a correction re-labelled and re-bound for Window 05 refuses
`HISTORY_AUTHORITY_SHAPE_CORRECTION_NOT_APPROVED`. Any future Window-05 authority
must use the canonical field.

## 5. Current state: 92 / 110

Derived by replay of the explicit history over the frozen carry-forward
baseline and the canonical 5-entry ledger:

| class | value |
| --- | --- |
| ACQUISITION_SUCCESSFUL | **92** (DEV_TRAIN 17 / DEV_CONFIRM 38 / FINAL_HOLDOUT 37) |
| CURRENT_ACQUISITION_FAILURE | [] |
| REPLACEMENT_ASSIGNED_AWAITING_EXECUTION | [] |
| PENDING_CAPABILITY_REVIEW | [] |
| CARRY_FORWARD_REFUSED | [] |
| NEVER_STARTED | 92..109 (18) |

`92 + 0 + 0 + 0 + 18 = 110`.

## 6. Q1 and the ledger

Q1 = `[]`. The landed appender, called on this state, refuses
`NOTHING_TO_APPEND`. The ledger is unchanged (5 entries, `e58f872e…`), next
reserve 5, **reserve 5 unassigned**. Window 05 needs no pre-network append.

## 7. Window 05

Derived by the **unchanged** generic builder first, then compared:

| order | item | kind | split |
| --- | --- | --- | --- |
| 1 | `G2P:92` | PRIMARY | FINAL_HOLDOUT |
| 2 | `G2P:93` | PRIMARY | DEV_TRAIN |
| 3 | `G2P:94` | PRIMARY | DEV_CONFIRM |
| 4 | `G2P:95` | PRIMARY | FINAL_HOLDOUT |
| 5 | `G2P:96` | PRIMARY | DEV_CONFIRM |

Composition DEV_TRAIN 1 / DEV_CONFIRM 2 / FINAL_HOLDOUT 2; no replacements.
Each item's selection index, split, original selection identity, frozen frame
entry, ordered root authorities and execution identity digest are bound exactly
against the frozen draw and frame (`window05.executionBindings`).

**Window-05 spec SHA-256: `1714e3c9f9cd175cc6650e8cde150dee0f1c18ae742cc4508235291bee061cad`**,
built twice with byte-identical canonical output and a recomputed hash equal.

## 8. P7 and history integrity (separate prerequisites)

Frozen P7 on the current committed ledger: **18 / 18 true**; gate with zero
completed items `CONTINUE_TO_NEXT_WORK_ITEM`, next `G2P:92`. Q1 is empty, so
there is no intentional 16/18 pre-append state.

`ADJUDICATION_HISTORY_INTEGRITY` is **not** a nineteenth P7 invariant. Readiness
requires both P7 18/18 **and** four-window history integrity `true`; a future
live driver must require both before every live item.

**Run references:** 20 historical references, 5 per window (01–04), all
globally unique — enforced by the generic `assessAdjudicationHistoryIntegrity`
itself (rule
`GENERATION2_HISTORICAL_RUN_REFERENCE_IS_GLOBALLY_UNIQUE_ACROSS_ALL_ADJUDICATED_WINDOWS_V1`);
no window-specific substitute exists.

## 9. Frozen window gates

Planned size 5: P2 threshold 3, P5 threshold 2 (unchanged). P6 rule
`reserveConsumed > 10 AND successfulOrganisationCount < 50`; current 5 / 92 →
**P6 false**. No threshold was changed.

## 10. Operator anomaly scope

The Window-04 G2P:88 ruling
`CONFIRM_WINDOW04_G2P88_CONTINUE_MITIGATED_NOTIFICATION_ONLY_V1` is verified as
scoped `Window-04-specific; not a precedent`. It is not generalised. Window 05
starts with **no inherited anomaly waiver** (`window05.inheritedAnomalyWaivers: []`).

## 11. Primary-failure projections (in memory only)

- `G2P:92` fails `HOST_UNREACHABLE` in a synthetic, adjudicated Window 05 →
  history integrity holds → Q1 `[92]` → projected entry sequence 5, slot 92 →
  Generation-2 reserve 5, replacing the current occupant resolved by the landed
  `resolveCrossGenerationOccupant` (`GENERATION1_TERMINAL_OCCUPANT`). Not appended.
- Failures supplied as 96, then 92, then 94 → Q1 ascending 92 → 94 → 96 with
  reserves 5 → 6 → 7 (sequences 5, 6, 7). Not appended.

The canonical ledger is 5 entries before and after every proof. Same-slot Q2
rules are unchanged; a Window-05 failure authorises no replacement until the
window is completed or stopped, validated where required, adjudicated and
replayed — an unadjudicated failure leaves current Q1 empty and the appender
refuses.

## 12. Negative attacks

All refuse, re-sealed downstream where meaningful so the semantic rule — not a
stale hash — refuses (`orgunitCorpus2DA2Generation2Window05Readiness.test.ts`):

- **Correction (16):** Window 04 without its correction; wrong correction hash;
  wrong authority commit (record or caller); wrong authority SHA; wrong spec
  hash; correction attached to Window 01 / 02 / 03; attached to a prospective
  Window 05; future authority with only `boundLedger`; mapping another field;
  extra override keys; widened invocation limits; changed work items; changed
  starting ledger (key or pinned value hash); changed spec hash.
- **History (14):** missing Window 01; missing intermediate window; reordered;
  duplicated ordinal; edited authority; edited LIVE_RESULT; edited
  adjudication; mismatched starting ledger; mismatched rebuilt spec (a
  self-consistent synthetic window that only the rebuild refuses); duplicate
  run ref within a window; duplicate run ref across windows (01→04, 03→04,
  04→synthetic 05; replay accepts, generic integrity refuses); Window-02 chain
  tampering; reuse of the Window-02 P5 ruling in Window 03 or 04; the G2P:88
  ruling generalised.
- **State (11):** fake Q1; reserve 5 assigned despite empty Q1; G2P:91
  repeated / G2P:97 substituted; reordered items; wrong split; wrong execution
  identity; wrong starting revision; altered P2 / P5; altered P6; frozen P7
  changed.

## 13. Tests and validation

- Focused: Window-05 readiness 69/69; Window-05 isolation 9/9.
- All Generation-2 suites: 20 files, 395 passed, 1 skipped (pre-existing, in
  the Window-04 adjudication suite); firewall 19 files, 466/466. Typecheck,
  lint and format clean.
- The single governed `npm run validate` result is reported in the final task
  report; it is not pre-written here.

## 14. Side effects and files

No institution network, DNS, HTTP, gateway, database, ledger write, reserve
assignment, live authority or acquisition run. Added only:
`generation2Window05/{window05Contract,window05Readiness,materialiseWindow05Readiness}.ts`,
the two test files, the readiness record and this audit. No file was modified:
no frozen artefact, historical Window-01..04 record, correction, generic
machinery, earlier window namespace or ledger (asserted by the isolation test).

## 15. Next owner decision

Whether to authorise **exactly one** bounded live Generation-2 Window 05:
`G2P:92 → G2P:93 → G2P:94 → G2P:95 → G2P:96`, primaries only, no pre-network
ledger append (Q1 is empty), reserve 5 unassigned, the authority in canonical
shape (`boundStartingLedger`). Not granted here.
