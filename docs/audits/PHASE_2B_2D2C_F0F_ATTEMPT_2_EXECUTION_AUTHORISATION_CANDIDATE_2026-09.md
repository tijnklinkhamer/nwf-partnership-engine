# Phase 2B-2D2C-F0F — exact attempt-2 execution authorisation candidate, prepared and verified structurally (zero inference, NOT ISSUED)

Date: 2026-09-14. Owner instruction:
`PREPARE_EXACT_ATTEMPT_2_EXECUTION_AUTHORISATION — DO NOT EXECUTE`. F0E
readiness was accepted as complete; the proposed authorisation in the F0E
audit §8 still carried three placeholders (`outputRoot`, `issuedAtUtc`,
`validUntilUtc`), and a machine-bound authorisation must not receive owner
approval while any value remains to be chosen after approval. This slice
resolves every placeholder to a literal, strengthens the bound authority,
produces the exact candidate bytes, and proves — through a
VERIFICATION-ONLY path that has no execution branch — that those bytes would
be accepted structurally while still executing nothing.

**Status: ATTEMPT-2 EXECUTION AUTHORISATION BYTES PREPARED — AWAITING EXACT
OWNER APPROVAL; ZERO INFERENCE.** No provider, SDK `query()`, Claude
execution or authentication call was made; attempt 2 did not run; no
consumption marker exists; no attempt-2 evidence exists; HOLDOUT and the
mixed-label file were not opened; gold, thresholds, schema, validator,
corpus and acquisition inputs are byte-unchanged; no migration was applied;
no database was written; nothing touched `main`; nothing was pushed to
`main` or merged.

The candidate is NOT an issued authorisation. It lives ONLY in the session
scratchpad (outside every worktree, outside `phase2b-2d2c-dev-runs`, outside
any path the runner reads by convention). The runner recognises an
authorisation only by the absolute path an operator passes with
`--execute --authorisation`, so an unissued file in a scratch directory is
authority for nothing. **This document does not create, copy or issue it.**

## 1. Output root — resolved

**`/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-2`**

Created empty (`mkdir -m 700`, no evaluation artifact of any kind) and
proved safe by the runner's own contract (`validateOutputRoot` in
`artifacts.ts` + the F0D emptiness gate in `cliF0C.ts`), both on the
execution path and — identically — on the F0F verification path:

| check | result |
| --- | --- |
| absolute, normalised, no `.`/`..` segment | yes |
| `realpath` equals the supplied path (no symlink in any component: `/Users`, `/Users/tijnklinkhamer`, `…/Developer`, `…/phase2b-2d2c-dev-runs`, `…/attempt-2`) | yes |
| is a directory | yes, mode `0700`, inode `8894600` |
| empty | yes, zero entries |
| outside the runner worktree, the V3B root, the attempt-1 root and every `git worktree list` entry | yes (`validateOutputRoot` decision `ok`) |
| outside attempt 1 | sibling directory, distinct inode (`5918220` for attempt-1); attempt-1 holds no symlink at depth ≤ 2 that could alias it |
| dedicated | the only entry named `attempt-2*` on this machine outside the scratchpad |

Nothing was created inside it. The candidate file is NOT inside it (a
candidate inside the output root would itself make the root non-empty and
be refused `ATTEMPT2_OUTPUT_ROOT_NOT_EMPTY`).

## 2. Temporal bounds — resolved

| field | literal |
| --- | --- |
| `issuedAtUtc` | `2026-09-14T19:20:00Z` |
| `validUntilUtc` | `2026-09-14T23:20:00Z` |

**Lifetime: exactly 4 hours.** Why sufficient: attempt 2 is 12 logical
evaluations at concurrency 1; the frozen Tier-2 watchdog bounds each child
at 700 000 ms, so the worst case for all twelve is 8 400 s = 2 h 20 min;
attempt 1 (24 evaluations, same tiers) completed in roughly nine minutes of
wall-clock. Four hours covers the theoretical worst case with margin for
pre-flight, and matches the attempt-1 precedent (also a 4-hour window).
Why short: a window that outlives the evening bounds the blast radius of a
leaked or mis-filed authorisation to one controlled session.

**Contract on expiry (existing, unchanged):** the lock evaluates
`issuedAtUtc ≤ now ≤ validUntilUtc` ONCE, at lock time, before any
provider construction. If the window has passed before the lock is reached
the run is refused `AUTHORISATION_EXPIRED` and a NEW owner authorisation
is required; neither timestamp is ever refreshed, regenerated or rewritten
by this preparation or by the runner. The window is not re-checked
mid-run: a run that entered the lock inside the window completes under the
Tier-1/Tier-2 liveness bounds, which are the frozen mechanism for bounding
a run that has already started.

## 3. The bound authority — strengthened (`authorisationF0C.ts`)

The closed schema (`Attempt2ExecutionAuthorisationSchema`) now binds, each
as a LITERAL from the module's imports, in addition to everything F0D/F0E
already bound:

- `variants[0].promptVersion = orgunit-classifier-prompt-v3` and
  `variants[0].promptSha256 = d05dcce6…3abd1` (from `F0E_VARIANT`);
- `frozenLogicalBatchOrdinals` = exactly `[1,…,12]` in order (length 12,
  refined element-by-element: 1..11, 1..13, 2..13, a reorder and a
  duplicate are all refused);
- `attempt1VariantReruns = { PROMPT_V1_CANONICAL: 0, PROMPT_V2_CANONICAL: 0 }`;
- `maxAdapterAttempts = 183` (`ATTEMPT2_MAX_ADAPTER_ATTEMPTS = 61 × (1 + FROZEN_MAX_TRANSIENT_RETRIES)`);
- `prohibitions = { holdout, goldLabelChanges, thresholdChanges, databaseWrites, migrationWrites }`, every value the literal `NONE`.

The statement now names the F0E owner-approval record hash and the prompt
SHA-256 inside it, and both ceilings. It is built from the same pins the
schema uses, so it cannot drift from them; while
`F0E_APPROVAL_RECORD_RAW_SHA256` is `null` the statement is deliberately
unissuable (it then carries a `<NO F0E APPROVAL RECORD IS PINNED…>` marker
that no owner would sign and the firewall would reject as a placeholder).
The previous (F0D/F0E §8) statement is now `AUTHORISATION_MALFORMED` — a
test pins this, so no file written against the weaker wording can grant.

`verifyAttempt2AuthorisationCandidate` is the verification-only entry: it
evaluates exactly `evaluateAttempt2ExecutionLock` (asserted `toEqual` in
the lock test) and grants nothing because its only caller has no execution
branch.

The CLI gained one plan-only option, `--verify-authorisation-candidate
<absolute path>`, which is refused together with `--execute` BEFORE any
readiness check (`CANDIDATE_VERIFICATION_EXCLUDES_EXECUTION`), requires
`--output-root` and `--attempt-no` (else `CANDIDATE_VERIFICATION_INCOMPLETE`,
exit 1), validates the output root with the execution path's own rules and
emptiness gate, checks the consumption marker, evaluates the lock through
the verification-only entry, and REPORTS. It writes nothing, launches
nothing, constructs no provider. `executionAuthorisation` in its output is
`CANDIDATE_VERIFIED_ONLY_NOTHING_ISSUED_NOTHING_CONSUMED`, and the report
carries `issued: false; consumed: false` unconditionally.

## 4. The exact operator statement

```
I AUTHORISE PHASE 2B-2D2C DEVELOPMENT-ONLY EXECUTION OF ATTEMPT 2: AT MOST 12 LOGICAL EVALUATIONS OF PROMPT_V3_CANONICAL (FROZEN ORDINALS 1..12, ONE VARIANT; NO PROMPT_V1_CANONICAL AND NO PROMPT_V2_CANONICAL RERUN) AGAINST THE APPROVED F0E FREEZE 3b49461af417f8846306dacea561da8865956934f40e72b91ec06db7b1639587 WITH DERIVED PLAN 6c6ee79b7e8591a69b43241ad422e437d70440bc08919fd82d8cf9afac388e25, F0E OWNER-APPROVAL RECORD f1b4b05750da28029bfcb328b5824bf87e80bb28a9852b0ab3a999bfc557c1dc, RUNTIME 8224e630b9310f1eeada608a34627e854b30f5aa, PROMPT SHA-256 d05dcce614397e09f93d0aec981a3d626d5e90a16851040901ffafec30d3abd1, REPAIR POLICY ENABLED (ONE ROUND PER LOGICAL EVALUATION, 120000 MS USABLE-WINDOW FLOOR), AT MOST 61 PROVIDER REQUESTS AND AT MOST 183 ADAPTER ATTEMPTS. NO HOLDOUT. NO GOLD LABEL OR THRESHOLD CHANGE. NO DATABASE OR MIGRATION WRITE.
```

Compared byte for byte by the lock; never normalised.

## 5. The exact candidate bytes

Serialised with the repository's canonical serialiser
(`canonicalStringify`: sorted object keys, arrays in given order, no
whitespace, no trailing newline), validated against the closed schema
before writing, written once (`wx`).

| property | value |
| --- | --- |
| raw SHA-256 | **`b169b5d8079b64d5c7459392fb347bb93f6793de9d340f30fd472393964e6d40`** |
| byte length | **2 218** |
| placeholders (`<…>`, `PROPOSED`) | none (grep count 0) |
| location | session scratchpad `attempt-2-candidate/attempt-2.execution-authorisation.candidate.json` — outside every worktree, outside `phase2b-2d2c-dev-runs` |

The bytes, verbatim (one line):

```json
{"attempt1VariantReruns":{"PROMPT_V1_CANONICAL":0,"PROMPT_V2_CANONICAL":0},"attemptNo":2,"authorisationVersion":"phase2b-2d2c-f0e-execution-authorisation-v1","freezeApprovalRecordRawSha256":"f1b4b05750da28029bfcb328b5824bf87e80bb28a9852b0ab3a999bfc557c1dc","freezeConfigRawSha256":"3b49461af417f8846306dacea561da8865956934f40e72b91ec06db7b1639587","frozenLogicalBatchOrdinals":[1,2,3,4,5,6,7,8,9,10,11,12],"issuedAtUtc":"2026-09-14T19:20:00Z","maxAdapterAttempts":183,"maxLogicalEvaluations":12,"maxProviderRequests":61,"operatorAuthorisationStatement":"I AUTHORISE PHASE 2B-2D2C DEVELOPMENT-ONLY EXECUTION OF ATTEMPT 2: AT MOST 12 LOGICAL EVALUATIONS OF PROMPT_V3_CANONICAL (FROZEN ORDINALS 1..12, ONE VARIANT; NO PROMPT_V1_CANONICAL AND NO PROMPT_V2_CANONICAL RERUN) AGAINST THE APPROVED F0E FREEZE 3b49461af417f8846306dacea561da8865956934f40e72b91ec06db7b1639587 WITH DERIVED PLAN 6c6ee79b7e8591a69b43241ad422e437d70440bc08919fd82d8cf9afac388e25, F0E OWNER-APPROVAL RECORD f1b4b05750da28029bfcb328b5824bf87e80bb28a9852b0ab3a999bfc557c1dc, RUNTIME 8224e630b9310f1eeada608a34627e854b30f5aa, PROMPT SHA-256 d05dcce614397e09f93d0aec981a3d626d5e90a16851040901ffafec30d3abd1, REPAIR POLICY ENABLED (ONE ROUND PER LOGICAL EVALUATION, 120000 MS USABLE-WINDOW FLOOR), AT MOST 61 PROVIDER REQUESTS AND AT MOST 183 ADAPTER ATTEMPTS. NO HOLDOUT. NO GOLD LABEL OR THRESHOLD CHANGE. NO DATABASE OR MIGRATION WRITE.","outputRoot":"/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-2","planSha256":"6c6ee79b7e8591a69b43241ad422e437d70440bc08919fd82d8cf9afac388e25","prohibitions":{"databaseWrites":"NONE","goldLabelChanges":"NONE","holdout":"NONE","migrationWrites":"NONE","thresholdChanges":"NONE"},"repairPolicy":{"enabled":true,"maxRoundsPerLogicalEvaluation":1,"minimumRemainingBudgetMs":120000},"scope":"DEVELOPMENT_ONLY","supersededFreezeRawSha256":"d3de146fa789e64f09d850b03512e602caa226578387306642de6f4904b3efa9","validUntilUtc":"2026-09-14T23:20:00Z","variants":[{"gitCommit":"8224e630b9310f1eeada608a34627e854b30f5aa","label":"PROMPT_V3_CANDIDATE","name":"PROMPT_V3_CANONICAL","promptSha256":"d05dcce614397e09f93d0aec981a3d626d5e90a16851040901ffafec30d3abd1","promptVersion":"orgunit-classifier-prompt-v3"}]}
```

The generator script (`generate-candidate.ts`) lives only in the session
scratchpad. It reads every hash from the repository pins and hard-codes
only the three resolved values; it is not committed, because a committed
generator would be a template for authority.

## 6. Verification results (request-free)

### 6.1 Verification-only lock run

`cliF0C.ts --verify-authorisation-candidate <scratchpad candidate> --v3-root
<V3B root> --attempt1-root <attempt-1> --output-root
/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-2 --attempt-no
2 --json`:

- **Before the issue instant** (run at `2026-09-14T19:17:36Z` and again at
  `19:18:52Z`): decision `AUTHORISATION_NOT_YET_VALID`, exit 1, output
  root still empty, no marker. The temporal bound is enforced by the same
  code path that would enforce it at execution.
- **After the issue instant**: see §6.3 — decision
  `STRUCTURALLY_ACCEPTABLE`, exit 0, `structurallyAcceptable: true`,
  `consumptionMarkerExists: false`, `issued: false`, `consumed: false`,
  `executionAuthorisation: CANDIDATE_VERIFIED_ONLY_NOTHING_ISSUED_NOTHING_CONSUMED`.
  The output root remained empty afterwards; no marker, no experiment
  directory, no evaluation directory was created.

The refusal-to-execute is structural, not observed-by-luck: this
invocation has no `--execute`, the combination is refused before any
readiness check, and no owner-issued authorisation has been presented to
the execution path at all.

### 6.2 Final pre-execution checks (all `ok`, same invocation)

| check | result |
| --- | --- |
| F0E raw hash | `3b49461a…9587`, 86 878 bytes, `RECORDED_AND_PINNED` |
| plan hash | rebuilt `6c6ee79b…4b00` = pinned; superseded F0C plan `133a7a20…` not reproduced |
| F0E approval record | `f1b4b057…c1dc`; names frozen bytes, plan and superseded F0C; authorises nothing |
| superseded F0C, its approval and ratification | `d3de146f…`, `61eb52f3…`, `bad4b359…` byte-identical, historical |
| F0B predecessor | `c3f0a76b…` byte-identical |
| V3B runtime | root `wt-phase2b-2d2c-runtime-v3b-f1-repin` HEAD `8224e630…`, clean, 20/20 checks ok incl. `REPAIR_DEFAULT_FLOOR_CONSTANT` (120 000, no waiver) and the pinned darwin-arm64 executable |
| prompt hash | `orgunit-classifier-prompt-v3` `d05dcce6…3abd1` at the root; every plan evaluation carries it |
| 12-evaluation ordering | ordinals `[1..12]` in sequence order; one variant `PROMPT_V3_CANONICAL`; one commit `8224e630…` |
| 49-document composition | 49 DEVELOPMENT rows; per-evaluation `[3,5,4,5,3,5,5,4,4,3,3,5]` = 49; 12 V3 + 24 attempt-1 comparator identities recomputed |
| 61-provider-request ceiling | 12 original + 49 repair = 61 (recomputed = frozen) |
| 183-adapter-attempt ceiling | 61 × 3 = 183 (recomputed = frozen) |
| V1/V2 scheduled | 0 and 0 |
| HOLDOUT boundary | no never-read path, no HOLDOUT token in canonical plan bytes |
| output-root safety | §1; `validateOutputRoot` ok; empty |
| attempt-1 read-only inventory | 243 artifacts hash-verified, inventory `ee17e1f2…8137` = frozen comparator, no attempt-2 namespace inside attempt 1; no attempt-1 file modified after the candidate was written |

### 6.3 Post-issue-instant run

Recorded below after the clock passed `19:20:00Z` (same arguments as §6.1).

Run at `2026-09-14T19:21:14Z`, exit 0:

```
authorisation CANDIDATE <scratchpad>/attempt-2.execution-authorisation.candidate.json: STRUCTURALLY_ACCEPTABLE
  sha256 b169b5d8079b64d5c7459392fb347bb93f6793de9d340f30fd472393964e6d40; 2218 bytes; output root /Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-2; consumption marker absent
  the candidate would satisfy every attempt-2 lock check for output root /Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-2, attempt 2, at the clock this invocation observed; V3 root VERIFIED; execution is frozen to darwin-arm64. NOTHING WAS ISSUED, GRANTED OR CONSUMED: this invocation has no execution branch.
  issued: false; consumed: false — verification only.
```

`readiness` all ok; V3 root ok (20/20); attempt-1 comparator ok (243,
`ee17e1f2…`). Afterwards: the output root holds 0 entries;
`phase2b-2d2c-dev-runs/authorisations` holds only `attempt-1.json`; no file
anywhere under `phase2b-2d2c-dev-runs` is newer than the candidate; the
candidate's hash is unchanged.

### 6.4 Zero side effects, confirmed

- No attempt-2 namespace: `docs/evaluation` and `docs/evaluation/results`
  carry no `attempt-2`, `authorisation` or `consumption` entry (firewall
  asserts it); the only `attempt-2*` path on the machine outside the
  scratchpad is the empty output root of §1.
- No consumption marker: `<output root>/authorisations/` does not exist.
- No issued execution authorisation: the candidate was never copied to any
  path, never passed with `--authorisation`, never presented with
  `--execute`.
- No inference: no provider constructed, no SDK `query()`, no Claude
  execution or auth-status call, no child launched (plan-only path only).
- No HOLDOUT or mixed-label access; no gold, threshold, schema, validator
  or freeze change (F0E `3b49461a…`, F0C `d3de146f…`, F0B `c3f0a76b…`,
  approval record `f1b4b057…` all recomputed equal).
- No migration applied, no database write; nothing pushed to `main`,
  nothing merged.

## 7. Validation

Branch `feat/phase2b-2d2c-f0f-attempt-2-execution-authorisation-candidate`,
cut from the F0E head `70669a05…`. Changed: `authorisationF0C.ts`
(strengthened schema + statement + verification-only entry), `cliF0C.ts`
(`--verify-authorisation-candidate`, plan-only, refused with `--execute`),
the lock and CLI unit tests (fixtures updated to the strengthened shape;
new refusal cases for every added binding; the pre-F0F statement pinned as
malformed; the verification-only mode pinned as non-issuing and
non-consuming), and this audit. Focused suites: lock 14, CLI 16, phase2b
firewall 148 — all passed. Full `npm run validate` (see the commit message
for the run with `PHASE2B_2D2C_ATTEMPT1_ROOT` set): migrations check,
typecheck, lint, format, tests, build — exit 0.

## 8. What issuing would mean — for the owner only; nothing here does it

Issuing = the owner placing EXACTLY the 2 218 bytes of §5 (SHA-256
`b169b5d8…6d40`) at an absolute path of their choosing (the attempt-1
precedent is `phase2b-2d2c-dev-runs/authorisations/attempt-2.json`), and
issuing the explicit go-ahead. Any byte difference is a different
authorisation with a different hash; a re-serialisation that reorders keys
or adds whitespace is NOT the candidate. Execution would then be, from the
F0F worktree on darwin-arm64, inside the window
`2026-09-14T19:20:00Z … 23:20:00Z`:

```
node --import tsx src/test/harness/phase2b2d2c/f0c/cliF0C.ts --execute \
  --authorisation <absolute path of the issued bytes> \
  --v3-root /Users/tijnklinkhamer/Developer/wt-phase2b-2d2c-runtime-v3b-f1-repin \
  --attempt1-root /Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-1 \
  --output-root /Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-2 \
  --attempt-no 2 \
  --classifier-config-dir /Users/tijnklinkhamer/.claude-nwf-classifier
```

If the window lapses first, the candidate is dead: a new owner
authorisation with new literal timestamps (and therefore a new hash) is
required. Neither timestamp is ever refreshed in place.

**PHASE 2B-2D2C ATTEMPT-2 EXECUTION AUTHORISATION BYTES PREPARED — AWAITING
EXACT OWNER APPROVAL; ZERO INFERENCE.**
