# Phase 2B-2D2C-F3 — DEVELOPMENT-Only Attribution Execution, Attempt 1

Status: COMPLETE. The run executed all 24 planned logical evaluations and
stopped for nothing. **No semantic scoring, gold-label change, adjudication
or attribution conclusion is recorded here** — this document records that
the run happened, under which identities, and that its evidence is intact.

## 1. Baseline, branch, worktree, commits and ancestry

- `origin/main`: `7adf895fa20e9b25758e0748d1a02e26c387d19b`, unchanged before
  and after this task.
- F2B remote HEAD (the exact start point):
  `5eda3bfcdb857e6f3fd71ca819b9fc186e6d0c35`.
- New branch: `feat/phase2b-2d2c-f3-dev-attribution-execution-recovery`,
  created from that exact commit.
- New worktree:
  `/Users/tijnklinkhamer/Developer/wt-phase2b-2d2c-f3-dev-attribution-execution-recovery`.
- Ancestry, verified with `git merge-base --is-ancestor`: `origin/main` is an
  ancestor of the F2B head (`merge-base` = `7adf895f…` exactly), and the F2B
  head is an ancestor of this F3 branch. No rebase, no force, no history edit.
- Repository-local Git identity throughout:
  `Tijn Klinkhamer <tijnklinkhamer@newwavefluent.com>`. Global Git
  configuration was not read for modification and not changed.
- Pre-existing worktrees confirmed tracked-clean at their expected commits
  before anything was created: F2B at `5eda3bf…`, corrected runtime v1 at
  `0d2928a4…`, corrected runtime v2 at `c37dd5a7…`. No F3 branch or worktree
  existed beforehand, so nothing was overwritten.

The only dependency installation performed in the F3 worktree was `npm ci`
(347 packages, lockfile-exact). It touches no tracked file.

## 2. Authorisation, window and lock result

| item | value |
| --- | --- |
| path | `/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/authorisations/attempt-1.json` |
| SHA-256 | `46d1bd9ebed544f7ebf463f26ff6ec7cca89d8a9d849fdfd04a42412dc2d5705` |
| mode / owner | `0600`, owner-only, 1053 bytes |
| scope | `DEVELOPMENT_ONLY` |
| validity | `2026-09-13T19:25:33Z` … `2026-09-13T23:25:33Z` |
| preflight time | `2026-09-13T20:09:48Z` (≈3 h 15 m remaining; far above the 30-minute floor) |
| `maxLogicalEvaluations` | 24 |
| `attemptNo` | 1 |
| `outputRoot` | `/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-1` |

The recomputed SHA-256 equalled the expected hash exactly. The file was
parsed through the **real** closed schema `ExecutionAuthorisationSchema`
(accepted) and evaluated through the **real** `evaluateExecutionLock`, which
returned `granted: true` with `authorisationSha256` equal to the file's own
hash. Both pinned variants matched: `PROMPT_V1_CANONICAL` /
`PROMPT_V1_COMPARATOR` / `0d2928a474796b89fad0644e99b5b934ecad10d0` and
`PROMPT_V2_CANONICAL` / `PROMPT_V2_CANDIDATE` /
`c37dd5a73d0f285b97a0a9a43bf0e42be8fc99c7`.

Before execution, `isAuthorisationConsumed` returned `false` and the output
root held **zero** entries.

## 3. Consumption marker

| item | value |
| --- | --- |
| path | `…/attempt-1/authorisations/46d1bd9ebed544f7ebf463f26ff6ec7cca89d8a9d849fdfd04a42412dc2d5705.json` |
| file SHA-256 | `cf27a3a9d15191022c13d649579ebab9f3bfeaa275bf0e62ee7b77c87b1d65bf` |
| `recordSha256` | `e803b7e8c0f8ffb4e8ea26ba607e41fd461f2919b4734262b88feb0711deaa35` |
| `consumedAtUtc` | `2026-09-13T20:20:07.472Z` |
| size | 491 bytes |

The marker was written by the runner before the first child, and its hash was
identical when checked during the run and after it ended. It was not removed,
edited or reused. **`attempt-1.json` is now spent: it must never be presented
again, and no attempt 2 was started.**

## 4. Frozen identities verified before execution

All verified by the frozen CLI's own checks in plan mode (a network-free,
provider-free invocation), then again by the CLI on the execution path
before the first child:

| identity | value |
| --- | --- |
| F0B freeze raw SHA-256 | `c3f0a76b3a5939f3e4bf395d46237cf0b0f365fa1f4bf019092a6944849d6157` |
| freeze version | `phase2b-2d2c-dev-configuration-freeze-v1` |
| plan SHA-256 | `05cb6984a57a871ac6b0a0720ab2fefceb5b5843f440dbf7831abdf9bfc82f6c` |
| corpus scope | `DEVELOPMENT`, 49 rows |
| derived corpus raw SHA-256 | `c5a9923a35689fd8b0950d615ee5339c6ccc63e83ac067960760497b6a9c4536` |
| derived manifest raw SHA-256 | `9ef7dfb45307004297f019351163b06478d2f552834f10496545cfaf1a9a20f6` |
| corpus content SHA-256 | `f00139e42ff5d12dfc1a6ba1b969a635197ddda27f79515473f119ff919a6fa2` |
| v1 prompt | `orgunit-classifier-prompt-v1` `65f7f327ad14e78aaf3024cb7253e979b1e360fdcd1a58081fccc08fdb0facd0` |
| v2 prompt | `orgunit-classifier-prompt-v2` `181a5d6fec9763be5a57e7e4d08c7d8c8a9d9e21838df2ea3e05dd680e4c7635` |
| Agent SDK | `@anthropic-ai/claude-agent-sdk` 0.3.251 (both roots) |
| bundled binary | `claude`, 197,171,680 bytes, SHA-256 `625869b01e0050f260b2980fac248fd9cef9e462612bded4ec9d3d49ff8969a5` (Claude Code 2.1.251), PINNED by the freeze |
| requested model | `claude-sonnet-5`; `runConfig {"maxTurns":3,"thinking":"disabled"}` |
| liveness | Tier-1 300000 / 10000 / 600000 ms; Tier-2 700000 / 10000 ms |

Both variant roots returned `ok: true` with **14/14** `VariantRootCheck` ids
passing, including `HEAD_MATCHES_FROZEN_COMMIT`, `WORKTREE_CLEAN`,
`RUNTIME_MODULES_LOADED_FROM_ROOT` (14 modules under the root, not under the
runner), `NATIVE_CLAUDE_CODE_EXECUTABLE` and
`AUTH_AND_INFERENCE_SAME_EXECUTABLE`.

## 5. Request-free authentication check

One `auth status --json` execution per corrected runtime root, through the
production seam, pinned to that root's own SDK-bundled binary at an absolute
path, under the sanitized child environment and the dedicated profile
`/Users/tijnklinkhamer/.claude-nwf-classifier`. Only the four decision fields
were read and recorded:

| root | loggedIn | authMethod | apiProvider | subscriptionType |
| --- | --- | --- | --- | --- |
| corrected v1 | `true` | `claude.ai` | `firstParty` | `max` |
| corrected v2 | `true` | `claude.ai` | `firstParty` | `max` |

Both resolved the same binary SHA-256 `625869b0…` under their own package
roots, exit code 0. No identity field (email, account or organisation id) was
read, recorded or printed. The profile directory and the quarantined settings
file were not opened. No interactive session, no `claude -p`, no `query()`
and no inference occurred during preflight.

## 6. Durable execution

Run control lives OUTSIDE the evaluation output root, at
`/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/run-control/attempt-1`
(owner-only, `0700`), holding `supervisor.sh`, `supervisor.log`,
`supervisor.pid` and `cli-exit-code`. Nothing was placed inside the output
root before the runner started. The log records the CLI's own stdout summary
and exit code; no environment value, credential, transcript, chain of thought,
raw provider output or profile content was logged.

The approved command was run verbatim — arguments unaltered — wrapped as
`nohup … caffeinate -dimsu node --import tsx src/test/harness/phase2b2d2c/cli.ts --execute …`,
with system, idle, disk and display sleep prevention, detached from the
terminal, with the CLI's real exit code persisted by the supervisor.

| event | UTC |
| --- | --- |
| supervisor start | `2026-09-13T20:20:06Z` |
| authorisation consumed | `2026-09-13T20:20:07.472Z` |
| experiment started | `2026-09-13T20:20:07.484Z` |
| experiment completed | `2026-09-13T20:28:39.194Z` |
| supervisor end | `2026-09-13T20:28:39Z` |

Supervisor exit status 0; **CLI exit code 0** (`COMPLETED_ALL_PLANNED`).
Elapsed ≈ 8 m 33 s. The machine stayed powered, online and open throughout.

## 7. Planned versus reached sequences

Planned 24; reached 24. `evaluationsStarted: 24`,
`evaluationsEndedWithoutStop: 24`,
`perVariantEndedWithoutStop: {PROMPT_V1_CANONICAL: 12, PROMPT_V2_CANONICAL: 12}`,
`halt: null`, `status: COMPLETED_ALL_PLANNED`.

Ordering held: all twelve `PROMPT_V1_CANONICAL` evaluations completed before
the first `PROMPT_V2_CANONICAL` directory was created (verified by artifact
mtimes: `V1_ALL_BEFORE_V2 = true`, and each variant's own sequence monotone).
Concurrency was 1 throughout; no evaluation was resumed, retried by hand or
re-run.

| seq | variant | ord | organisation (`eche_row_key`) | docs | outcome | validation | acc | rej | ms | out tok |
| ---: | --- | ---: | --- | ---: | --- | --- | ---: | ---: | ---: | ---: |
| 1 | PROMPT_V1_CANONICAL | 1 | `F DIJON35\|949637858` | 3 | OK | VALIDATED | 3 | 0 | 10085 | 817 |
| 2 | PROMPT_V1_CANONICAL | 2 | `F EVRY04\|999850296` | 5 | OK | VALIDATED | 5 | 0 | 24707 | 1657 |
| 3 | PROMPT_V1_CANONICAL | 3 | `F GRENOBL21\|915102366` | 4 | OK | VALIDATED | 4 | 0 | 23386 | 2405 |
| 4 | PROMPT_V1_CANONICAL | 4 | `F MAYOTTE01\|912525949` | 5 | OK | VALIDATED | 5 | 0 | 30123 | 3243 |
| 5 | PROMPT_V1_CANONICAL | 5 | `F MONTPEL58\|932096087` | 3 | OK | VALIDATED | 3 | 0 | 12010 | 916 |
| 6 | PROMPT_V1_CANONICAL | 6 | `F NANTES79\|924638533` | 5 | OK | VALIDATED | 5 | 0 | 15218 | 1431 |
| 7 | PROMPT_V1_CANONICAL | 7 | `F PARIS003\|999885119` | 5 | OK | VALIDATED | 3 | 2 | 16799 | 1948 |
| 8 | PROMPT_V1_CANONICAL | 8 | `F PARIS105\|949302432` | 4 | OK | VALIDATED | 2 | 2 | 27093 | 3071 |
| 9 | PROMPT_V1_CANONICAL | 9 | `F PARIS482\|897691060` | 4 | OK | VALIDATED | 4 | 0 | 36093 | 4181 |
| 10 | PROMPT_V1_CANONICAL | 10 | `F PARIS525\|879184333` | 3 | OK | VALIDATED | 3 | 0 | 50179 | 1036 |
| 11 | PROMPT_V1_CANONICAL | 11 | `F RENNES52\|949270228` | 3 | OK | VALIDATED | 3 | 0 | 12600 | 1132 |
| 12 | PROMPT_V1_CANONICAL | 12 | `F ROUEN06\|999465788` | 5 | OK | VALIDATED | 5 | 0 | 35867 | 3872 |
| 13 | PROMPT_V2_CANONICAL | 1 | `F DIJON35\|949637858` | 3 | OK | VALIDATED | 3 | 0 | 23411 | 879 |
| 14 | PROMPT_V2_CANONICAL | 2 | `F EVRY04\|999850296` | 5 | OK | VALIDATED | 5 | 0 | 17796 | 1780 |
| 15 | PROMPT_V2_CANONICAL | 3 | `F GRENOBL21\|915102366` | 4 | OK | VALIDATED | 4 | 0 | 14158 | 1259 |
| 16 | PROMPT_V2_CANONICAL | 4 | `F MAYOTTE01\|912525949` | 5 | OK | VALIDATED | 5 | 0 | 24272 | 1619 |
| 17 | PROMPT_V2_CANONICAL | 5 | `F MONTPEL58\|932096087` | 3 | OK | VALIDATED | 3 | 0 | 10600 | 975 |
| 18 | PROMPT_V2_CANONICAL | 6 | `F NANTES79\|924638533` | 5 | OK | VALIDATED | 5 | 0 | 16828 | 1552 |
| 19 | PROMPT_V2_CANONICAL | 7 | `F PARIS003\|999885119` | 5 | OK | VALIDATED | 3 | 2 | 17930 | 1844 |
| 20 | PROMPT_V2_CANONICAL | 8 | `F PARIS105\|949302432` | 4 | OK | VALIDATED | 4 | 0 | 25529 | 2565 |
| 21 | PROMPT_V2_CANONICAL | 9 | `F PARIS482\|897691060` | 4 | OK | VALIDATED | 4 | 0 | 11650 | 1237 |
| 22 | PROMPT_V2_CANONICAL | 10 | `F PARIS525\|879184333` | 3 | OK | VALIDATED | 3 | 0 | 10579 | 946 |
| 23 | PROMPT_V2_CANONICAL | 11 | `F RENNES52\|949270228` | 3 | OK | VALIDATED | 3 | 0 | 11786 | 956 |
| 24 | PROMPT_V2_CANONICAL | 12 | `F ROUEN06\|999465788` | 5 | OK | VALIDATED | 5 | 0 | 18047 | 1929 |

## 8. Per-variant outcome and validation categories

| | PROMPT_V1_CANONICAL | PROMPT_V2_CANONICAL |
| --- | ---: | ---: |
| logical evaluations | 12 | 12 |
| provider outcome `OK` | 12 | 12 |
| provider failures (any non-OK) | 0 | 0 |
| Tier-1 timeouts | 0 | 0 |
| Tier-2 watchdog firings | 0 | 0 |
| validation `VALIDATED` | 12 | 12 |
| validation rejected/invalid envelopes | 0 | 0 |
| documents accepted | 45 | 47 |
| documents rejected | 4 | 2 |
| output tokens (sum) | 25,709 | 17,541 |
| wall time ms (sum / min / max) | 294,160 / 10,085 / 50,179 | 202,586 / 10,579 / 25,529 |

Every evaluation reported model `claude-sonnet-5`, exactly one auth-status
invocation, and an observable internal adapter attempt count of 1 — i.e. **no
adapter-internal retry occurred anywhere**.

Accepted + rejected equals the 49-document corpus in each variant, so every
supplied document is accounted for under both prompts.

The six document-level rejections are layer-2 groundedness refusals recorded
by the frozen validator. They are evidence, not defects, and not adjudicated
here:

| variant / batch | docIndex | validator reason |
| --- | ---: | --- |
| V1 / batch-07 | 1 | `unit_name is not supported by any supplied field` |
| V1 / batch-07 | 2 | `evidence_spans[0] (source=HEADING) is not a literal substring of the supplied field` |
| V1 / batch-08 | 13 | `unit_name is not supported by any supplied field` |
| V1 / batch-08 | 14 | `unit_name is not supported by any supplied field` |
| V2 / batch-07 | 1 | `unit_name is not supported by any supplied field` |
| V2 / batch-07 | 2 | `evidence_spans[0] (source=HEADING) is not a literal substring of the supplied field` |

**These counts are raw validator categories. They are NOT an accuracy,
precision or attribution result, and the difference between 4 and 2
rejections is NOT a finding.** Semantic scoring and prompt attribution belong
to the separate scoring task.

## 9. Stop conditions and liveness

Every one of the 24 `stop-decision.json` artifacts records `stop: false`,
`stopCondition: null`, `haltKind: null`, with the detail
`OK outcome reconciled: raw checkpoint, validation and model id all recorded.`

Every one of the 24 `tier2-outcome.json` artifacts records the identical
tuple `outcome: COMPLETED`, `gracePhaseVerdict: null`,
`hardKillDisposition: NOT_REQUIRED`, `exitCode: 0`, `signal: null`.

Zero `tier1-diagnostics.json` and zero `child-failure.json` artifacts exist,
and `tier1DiagnosticsCaptured` is false on every provider outcome. No
`experiment-stop.json` was written.

Specifically NOT observed, any one of which would have halted the experiment:
a Tier-2 watchdog firing without a recorded Tier-1 timeout; a Tier-1 timeout
under the F0B decision rule; `CHILD_EXITED_UNCONFIRMED`;
`SUPPRESSED_EXPIRED_TARGET_IDENTITY`; an isolation violation; an identity,
freeze, corpus, plan, prompt, binary or runtime-root mismatch; a write-once
or raw-before-validation violation. No frozen stop decision was reinterpreted
or overridden.

## 10. Artifact inventory, write-once and raw-before-validation

243 files exist under the output root and nowhere else:

- 240 per-evaluation artifacts — 24 attempt directories × 10 kinds
  (`planned-input`, `child-manifest`, `child-preflight`,
  `raw-output-checkpoint`, `validation-result`, `provider-outcome`,
  `child-result`, `tier2-outcome`, `stop-decision`, `final-record`);
- 2 experiment-level artifacts (`experiment-manifest`,
  `experiment-completion`);
- 1 authorisation consumption marker.

**Every one of the 243 envelopes was re-verified through the harness's own
`readArtifact` (which recomputes `recordSha256` over the canonical record
serialization and checks kind and shape): 243 verified, 0 failed.** No file
was found outside the approved attempt-1 and run-control locations, and no
unexpected file name appeared.

Write-once layout: each of the 24 batch directories contains exactly one
attempt directory, named `attempt-1` — no second attempt, no overwrite, no
post-persistence edit. Sequence ordering verified monotone within each
variant and strictly V1-before-V2 across variants.

Raw-before-validation: for all 24 evaluations, `raw-output-checkpoint.json`
has an mtime at or before `validation-result.json`. The raw checkpoint stores
the canonical serialization, its SHA-256 and its UTF-8 byte length, and was
retained in every case — including the three evaluations whose validation
rejected documents.

Experiment-level and marker hashes:

| artifact | SHA-256 |
| --- | --- |
| `experiments/attempt-1/experiment-manifest.json` | `1a3c065178a6a880b13fbd74fa073f2a6925cf1da8a1c96cae0193e672f4c957` |
| `experiments/attempt-1/experiment-completion.json` | `a01fcfcf2412679cd9f5dd11a4228bf61facfcc7b84bcfdf31bb57e6c0dc5dce` |
| `authorisations/46d1bd9e…2d5705.json` | `cf27a3a9d15191022c13d649579ebab9f3bfeaa275bf0e62ee7b77c87b1d65bf` |

Per-evaluation `final-record.json` hashes:

| evaluation | SHA-256 |
| --- | --- |
| `PROMPT_V1_CANONICAL/batch-01` | `73de96d6317c593339a71490c36b41fa0e766dc17fd134a83d185d588fe6149e` |
| `PROMPT_V1_CANONICAL/batch-02` | `28cd6adf363e487a42c964b16c53b8d7a42f4491c0e8c2d2c70e8268ef77f553` |
| `PROMPT_V1_CANONICAL/batch-03` | `2353338c1dba513f6131f10f7411d3028233738a9115109af02131ccceb09e24` |
| `PROMPT_V1_CANONICAL/batch-04` | `cbe46c12a8916a87314987e027d820b2bf843951b96e260e4e275dc4ecb24798` |
| `PROMPT_V1_CANONICAL/batch-05` | `478b7e5a0556c3194beb12800fe328a10046cc015b50641ad77f1a6f3161694c` |
| `PROMPT_V1_CANONICAL/batch-06` | `8bc3ddb442ab37845434078962f69a119bc11f04a3d5760b8b11992a57888e94` |
| `PROMPT_V1_CANONICAL/batch-07` | `cd891539ef1585dcff6fee9476e4d5479d910d41852a20757b8bc73f653bd5e4` |
| `PROMPT_V1_CANONICAL/batch-08` | `44a553b3a1eae825ebd45c4ae91d37ab2f6d8170b85a8bd6945b0a7b528c4904` |
| `PROMPT_V1_CANONICAL/batch-09` | `6c61d6f3d189195eb56cbea5f1f77815f7565c291d7245f58c8782fd6d9601f0` |
| `PROMPT_V1_CANONICAL/batch-10` | `626757b9baa54ad93e3d8f67835464370697ec0d1a8a9095be5e7965aad991c6` |
| `PROMPT_V1_CANONICAL/batch-11` | `d3a71e4c952a411ffb055e63e05325b6a3e60b7ffb87f7cb5acb60063bff3fba` |
| `PROMPT_V1_CANONICAL/batch-12` | `264531f08310e707c22cb202b6fcbb16b0fa665442e9ab3568268215b08f3942` |
| `PROMPT_V2_CANONICAL/batch-01` | `c55b5e7156a076ea7565f9fbdbe3bf4d145bd70269f02c0bbcb1c1dbddc40813` |
| `PROMPT_V2_CANONICAL/batch-02` | `3f4f98a7b9e626882a0b8bbc7de8833fe34dcf566869f59531a97478c50d6dbb` |
| `PROMPT_V2_CANONICAL/batch-03` | `2e1b8ce313f9824aa9bba78abc4b5c4fcec18e1eadd23ef359d152ba4c56ab18` |
| `PROMPT_V2_CANONICAL/batch-04` | `ccab7e1855931ad0108c47581444ad29a81d295df4bd57a6ad9e4acd0172afe5` |
| `PROMPT_V2_CANONICAL/batch-05` | `4f5a7c37532d675279da2fe2ea13dd98195668bf05e3e58e4c5f6c9a9eb8af78` |
| `PROMPT_V2_CANONICAL/batch-06` | `73a855e6206f3a765754a8128b7d8b14be07fa750e5bd4130054d1a0e6081c96` |
| `PROMPT_V2_CANONICAL/batch-07` | `d89b4258dd7c3814b6513dcb885370930bd0aac0896eae809bf36989354e0350` |
| `PROMPT_V2_CANONICAL/batch-08` | `eff47f209caebc5aa9aa65454e84b7d7178a05b54e16d42b6907e1035f7ab4f7` |
| `PROMPT_V2_CANONICAL/batch-09` | `aabb7e26ba05be6dda7fe7a439df1d37811d750191ff11e14473496e906fbc84` |
| `PROMPT_V2_CANONICAL/batch-10` | `3f1ed8071b0f6a1c5523694b9bafc8c8ecd0730cb5b0b2e1e319a36e77a2e0ac` |
| `PROMPT_V2_CANONICAL/batch-11` | `15d164a4356a961c00edeb2df5d6b1c83181bb8f6b647ac1b962612718d79522` |
| `PROMPT_V2_CANONICAL/batch-12` | `adfb8c13339c02ef3e8468406fc492dfa234a6872bd448bb6b3a2f70dbe3fc23` |

The complete 243-entry inventory (`<sha256>  <path relative to the output
root>`, sorted by path) hashes to
`ee17e1f2ee8021e59c06377342042e56f84269165f8ec39521011cb1d3538137`, and is
reproducible by hashing every file under the output root. The full listing is
not reproduced here; the per-evaluation and experiment-level hashes above,
plus that aggregate, pin it.

## 11. Cleanup

- No classifier, fixture or `caffeinate` process from this run remains; no
  process referencing either runtime root remains.
- No harness scratch directory remains (the per-invocation child scratch
  directories and the preflight auth-check temporary directories were all
  removed).
- The run-control directory retains, by design, exactly `supervisor.sh`,
  `supervisor.log`, `supervisor.pid` and `cli-exit-code`. The PID file is a
  deliberate durable record of the finished run, not a stray artifact; the
  process it names has exited.

## 12. Zero-change confirmations

- `origin/main` is `7adf895fa20e9b25758e0748d1a02e26c387d19b`, unchanged; the
  primary `main` worktree was tracked-clean before, during and after.
- Corrected runtime v1 remained at `0d2928a474796b89fad0644e99b5b934ecad10d0`
  and corrected runtime v2 at `c37dd5a73d0f285b97a0a9a43bf0e42be8fc99c7`,
  both tracked-clean, verified mid-run and after exit. Neither runtime root
  was modified.
- No production code, runner code, freeze, corpus, manifest, prompt, gold
  label or migration was changed by this task. **The only file this branch
  adds is this audit document.**
- No database connection was opened; no `orgunit_*` table was read or
  written. No institution was contacted. No account was switched. No
  HOLDOUT data was read, inferred or referenced — the string `HOLDOUT`
  appears nowhere in the output root, and the executed corpus is the
  `DEVELOPMENT` 49-row canonical corpus pinned by the freeze.
- No semantic scoring was performed, no gold label was altered, and
  `ge789b0f0aedc398c` was not adjudicated. No attempt 2 exists.

## 13. Remaining uncertainties

- **Nothing about prompt quality is known yet.** This task produced evidence,
  not a result. The accepted/rejected counts above are validator categories
  from a single attempt on 49 DEVELOPMENT documents; they are not a
  measurement of v1 versus v2 and must not be quoted as one.
- **Single attempt, no variance estimate.** Each logical evaluation ran
  exactly once with concurrency 1. Run-to-run variability of the provider is
  unmeasured, so a difference between the variants of any size is currently
  indistinguishable from sampling noise.
- **DEVELOPMENT only.** Whatever the separate scoring task concludes applies
  to the development split. Generalisation is a HOLDOUT question and remains
  entirely open.
- **The rejection reasons are not diagnosed.** Whether the six refusals
  reflect a model error, a corpus artefact or a validator boundary is
  unexamined; adjudicating them is scoring work, not execution work.
- The Tier-1 and Tier-2 budgets were never approached (slowest evaluation
  50,179 ms against a 600,000 ms total budget), so this run provides no
  evidence about the liveness boundary's behaviour under load.

## 14. Closing status and the exact next task

`PHASE 2B-2D2C-F3 COMPLETE — DEV ATTEMPT 1 EXECUTED AND PRESERVED; READY FOR
SEPARATE SCORING AND ATTRIBUTION`

Next task: a **separately invoked scoring and attribution task** over the
preserved attempt-1 evidence at
`/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-1`, which must
score the 24 persisted evaluations against the frozen DEVELOPMENT gold
labels, adjudicate `ge789b0f0aedc398c`, and decide the v1/v2 attribution
question. That task reads this evidence and must not re-execute it:
`attempt-1.json` is consumed, and any further execution requires a new,
separately approved authorisation.
