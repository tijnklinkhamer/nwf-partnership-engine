# Phase 2B-2D2C-F0N (part A2) — erratum: F0M's "zero HOLDOUT access" phrasing

Date: 2026-09-15. Owner instruction:
`PHASE 2B-2D2C-F0N / V5I1 — PRE-V5 RELIABILITY CLOSURE AND OWNER-APPROVED
E1 IMPLEMENTATION — ZERO INFERENCE`, part A2. This is an **additive
clarification**, not an edit. F0M
(`docs/audits/PHASE_2B_2D2C_F0M_V4_RESIDUAL_PRECISION_ROOT_CAUSE_AND_V5_OPTIONS_2026-09.md`,
commit `d988a79683896e057c593290c998675f0a5856a3`) is unchanged — not one
byte of it was rewritten or deleted to produce this record. Written
entirely from F0M's own §9, already committed, without opening
`src/test/fixtures/evaluation/orgunit-classifier-gold-v1.jsonl` a second
time.

## The precise statement

- **F0M made zero provider calls and zero classifier inference.** It ran
  exactly one pre-existing, read-only, unmodified deterministic scorer
  entry point (`attempt3Generate.ts`) against preserved evidence, and
  otherwise only read files and computed hashes.
- **No HOLDOUT row was printed, semantically inspected, used for
  diagnosis, used for candidate design, or supplied to a model.** Every
  gold rationale/ambiguity/provenance F0M quoted came from the
  DEVELOPMENT-only fixture
  (`src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-dev-labels-v1.jsonl`,
  confirmed 49 rows, no split mixing). Every raw provider record F0M
  opened lives inside an evaluation batch whose full `orderedGoldIds`
  set — reverified in F0M across all twelve V4 batches — sums to exactly
  49 unique ids, the DEVELOPMENT split; no HOLDOUT document was ever
  present in those batches at all.
- **However, one diagnostic script did open/read, at the
  filesystem/parser level,
  `src/test/fixtures/evaluation/orgunit-classifier-gold-v1.jsonl`** — a
  file that mixes both `DEVELOPMENT` and `HOLDOUT` rows (F0M's own §9
  records the composition as 99 `DEVELOPMENT` + 61 `HOLDOUT`, 160 total)
  — **in order to select the already-known DEVELOPMENT id
  `g04d170f4d3fda759`** and retrieve that one document's title, headings
  and excerpt for F0M §3–§4. The script filtered by that one exact,
  already-known `DEVELOPMENT`-split goldId; F0M's own text already
  disclosed this in full, including the exact row counts, rather than
  omitting it.
- **Therefore the literal phrase "zero HOLDOUT access" in F0M's
  instruction-derived framing was too broad.** A file containing HOLDOUT
  bytes was opened by a diagnostic script, even though nothing HOLDOUT
  was read out of it, printed, or acted upon.
- **Classification: a procedural split-boundary deviation, not evidence
  of HOLDOUT semantic exposure or HOLDOUT-derived tuning.** No HOLDOUT
  row's `verdict`, `unit_type`, `unit_name`, rationale, ambiguity or any
  other field was ever retrieved, printed, compared, or used to shape any
  finding, contrast table, or candidate in F0M. The one filtered read
  extracted a single DEVELOPMENT-split document already identified by its
  goldId from DEVELOPMENT-only sources (the scored rows and the DEV
  labels fixture).
- **No F0M conclusion depended on any HOLDOUT row.** F0M's root-cause
  finding rests on: the committed `scored-items.jsonl`/`summary.json`
  (DEVELOPMENT-only by construction — 49 rows), the DEV-only labels
  fixture, raw provider records from batches that are themselves
  DEVELOPMENT-only (verified by summing `orderedGoldIds` across all
  twelve V4 batches to exactly 49 unique ids), and the V4 prompt-text
  diff (`git show 7c3cb5b5...`). None of these five sources is, or
  depends on, HOLDOUT material.

## Forward rule, effective immediately

**From this checkpoint onward, `orgunit-classifier-gold-v1.jsonl`, the
72-record mixed adjudication file
(`orgunit-classifier-sonnet-acceptance-adjudication-v1.jsonl`), and any
other file containing HOLDOUT rows are prohibited from all pre-HOLDOUT
diagnostic, design or scoring tasks — full stop, not just "avoid unless
necessary."** Use only the committed DEVELOPMENT-only canonical corpus /
DEV scoring material for such work:
`src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-dev-labels-v1.jsonl`
for gold rationale/ambiguity/provenance, the committed
`docs/evaluation/results/.../scored-items.jsonl` files for structured
predictions, and the raw provider `final-record.json` artifacts under
each preserved attempt root's `evaluations/` tree for raw rationale —
all three already proven DEVELOPMENT-only by construction. Where raw
document text (title/headings/excerpt) is needed and is not already
present in one of those three sources, it must be retrieved without
opening a mixed file — for example from the raw provider record's own
assembled input, or by a future task establishing a DEVELOPMENT-only
projection of the document corpus, never by filtering a mixed file
row-by-row as F0M's diagnostic script did.

## Verification of this erratum's own compliance

This document itself was written from F0M's already-committed text
alone. `orgunit-classifier-gold-v1.jsonl` was **not** opened while
writing it — its composition (99 `DEVELOPMENT` + 61 `HOLDOUT`, 160
total) is quoted verbatim from F0M §9, not recomputed here.

**PHASE 2B-2D2C-F0N PART A2 COMPLETE.** F0M's document is unchanged. This
erratum is additive only.
