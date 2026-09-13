# Phase 2B-2D2C-F2B — Readiness Re-Entry and Attempt-1 Authorisation Checkpoint

Status: COMPLETE.

## 1. Baseline

- Re-entry point (F1A/F0B): `b59efa842ad22ac88a03b1f168a28bdb306a87b6`
- F0B freeze raw SHA-256 (expected): `c3f0a76b3a5939f3e4bf395d46237cf0b0f365fa1f4bf019092a6944849d6157`
- F0B plan SHA-256 (expected): `05cb6984a57a871ac6b0a0720ab2fefceb5b5843f440dbf7831abdf9bfc82f6c`
- Corrected runtime v1: `0d2928a474796b89fad0644e99b5b934ecad10d0`
- Corrected runtime v2: `c37dd5a73d0f285b97a0a9a43bf0e42be8fc99c7`

Status: **COMPLETE** — `attempt-1.json` written, verified, and this record closed.

## 2. Ancestry and identity

`origin/main` = `7adf895f…` before and after this task (unchanged). F2 =
`fa9b6b40048aca8ff923ae6a000effd14e9748c5` is a direct ancestor of F1A/F0B.
Corrected v1/v2 (`0d2928a4…` / `c37dd5a7…`) are independent sibling branches
off base `952f80e1`, not descendants of F0B — the correct shape for
separately-maintained runtime trees, confirmed via `git merge-base`. All
worktrees clean throughout. Repository-local Git identity
`Tijn Klinkhamer <tijnklinkhamer@newwavefluent.com>`; global identity
untouched. No `.env`, no DB/provider-secret environment variable present at
any point in this task.

## 3. Stale F0A closure

Repo-wide `F0A` grep run first; three, and only three, references were
operationally stale (all other ~50 occurrences are intentional history and
were left untouched):

| file        | line | before                                                    | after                                                      |
| ----------- | ---: | ---------------------------------------------------------- | ------------------------------------------------------------ |
| `cli.ts`      |    7 | "hash-verifies the F0A freeze"                            | "hash-verifies the F0B freeze"                             |
| `childMain.ts`|   10 | "re-verifies the F0A freeze bytes"                        | "re-verifies the F0B freeze bytes"                         |
| `childMain.ts`|  208 | `'the manifest freeze hash is not the F0A hash.'`         | `'…F0B hash.'`                                              |

`src/test/unit/orgunitClassify2D2CF2BStaleF0AClosure.test.ts` (6 tests)
pins the fix and pins survival of `SUPERSEDED_F0A_FREEZE_RAW_SHA256`, the
"F0A §13.3 input-construction contract" historical line, and the
`freeze-f0a-superseded.json` fixture. Committed as `55172e1` ("Close three
stale F0A references in the F1 CLI/child docs and message"), additive only
— F1A/F0B was not amended.

## 4. Validation

Baseline `npm run validate` at `b59efa84…` (before the fix): exit 0, 1664
passed / 0 failed / 527 skipped (DB-gated). After the fix, at `55172e1`:
exit 0, 1670 passed / 0 failed / 527 skipped. Worktree tracked-clean after
the commit. F0B freeze raw SHA-256 reconfirmed exactly
`c3f0a76b3a5939f3e4bf395d46237cf0b0f365fa1f4bf019092a6944849d6157` both
before and after.

## 5. Corrected runtime roots

Both `wt-phase2b-2d2c-runtime-v1-auth-parity-recovery` (`0d2928a4…`) and
`wt-phase2b-2d2c-runtime-v2-auth-parity-recovery` (`c37dd5a7…`): no
symlinks, correct origin, exact frozen HEADs, tracked-clean throughout,
`npm ci` / `npm run build` / `npm run validate` all clean (v1: 1496 passed /
0 failed; v2: 1506 passed / 0 failed). 16/16 required runtime modules
present per `RUNTIME_MODULE_PATHS`. Agent SDK `0.3.251` in `package.json`,
lockfile and installed package on both. Native package
`@anthropic-ai/claude-agent-sdk-darwin-arm64@0.3.251`; bundled Claude Code
`2.1.251`; binary 197,171,680 bytes, SHA-256
`625869b01e0050f260b2980fac248fd9cef9e462612bded4ec9d3d49ff8969a5` — exact
match on both roots.

Prompt identities, recomputed from each root's own built export:

| root | version                        | characters | UTF-8 bytes | SHA-256                                                            |
| ---- | ------------------------------ | ---------: | ----------: | ------------------------------------------------------------------ |
| v1   | `orgunit-classifier-prompt-v1` |      9,887 |       9,963 | `65f7f327ad14e78aaf3024cb7253e979b1e360fdcd1a58081fccc08fdb0facd0` |
| v2   | `orgunit-classifier-prompt-v2` |     11,304 |      11,382 | `181a5d6fec9763be5a57e7e4d08c7d8c8a9d9e21838df2ea3e05dd680e4c7635` |

## 6. Plan-mode readiness

Three plan-only runs (`node --import tsx src/test/harness/phase2b2d2c/cli.ts
--json --v1-root <v1> --v2-root <v2>`, never `--execute`), the third with
external `claude` stripped from `PATH`: all byte-identical, exit 0.
`mode: PLAN_ONLY`; `freezeConfigRawSha256` exact; `planSha256` exact
`05cb6984a57a871ac6b0a0720ab2fefceb5b5843f440dbf7831abdf9bfc82f6c`; 49
corpus rows; 24 planned logical evaluations; concurrency 1; sequences
1–12 `PROMPT_V1_CANONICAL`, 13–24 `PROMPT_V2_CANONICAL`; both roots
`ok: true` with all 14/14 `VariantRootCheck` ids passing. Output-file
SHA-256 exact `479a8cae80f2f527a0c9694dc207770f9be2a0386a60f470a306519a67020283`.
12 distinct `assemblyInputSha256`, 24 distinct `finalInputSha256` values —
matching F0B. No `HOLDOUT` substring anywhere in the output.

Re-run live a second time (volatile recheck, before writing the
authorisation): plan re-executed against both corrected roots, exit 0,
`planSha256` and output-file SHA-256 both reproduced exactly, unchanged.

## 7. Profile and auth readiness

`/Users/tijnklinkhamer/.claude-nwf-classifier`: real, owner-controlled,
`drwx------`; `settings.json` absent; only ordinary Claude Code profile
scaffolding present, no forbidden entry; contents not opened. Quarantined
file `settings.json.quarantined-20260913T151546Z-83674` present and
unchanged by metadata throughout (checked at task start and again
immediately before writing the authorisation file); not opened.

Request-free `auth status --json`, via the production resolver
(`resolveBundledClaudeCodeExecutable`) pinned to each root's own
SDK-bundled `claude` binary (2.1.251) under the dedicated profile and
sanitized environment: v1 and v2 both `loggedIn: true`,
`authMethod: claude.ai`, `apiProvider: firstParty`,
`subscriptionType: max` (reported by the module as `ok: true` per its own
never-print-raw-fields hygiene design — `evaluateAuthStatus` requires
exactly these four values for that verdict). Also run with external
`claude` stripped from `PATH` for both roots — unchanged. Re-run again
immediately before writing the authorisation file — unchanged. Zero Agent
SDK queries, zero inference, no PATH-resolved command used anywhere.

## 8. Empty-state verification

`/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-1` and
`.../authorisations`: real, owner-only (`drwx------`), outside every
worktree, zero entries each, confirmed at task start and again immediately
before writing.

## 9–11. Authorisation proposal, operator checkpoint, and write

**First proposal** (issued `2026-09-13T16:13:52Z`, valid until
`2026-09-13T20:13:52Z`, SHA-256 `0984052a683f45b9…4b27d318c`) was presented
to the operator and explicitly withdrawn by the operator before approval,
citing an insufficient validity window for the separate F2B-closure/F3-start
timing. Per §10's own re-issuance procedure, it was discarded in memory,
never written, and all volatile readiness checks were repeated.

**Second proposal** (issued `2026-09-13T19:25:33Z`, valid until
`2026-09-13T23:25:33Z`):

```json
{
  "authorisationVersion": "phase2b-2d2c-f1-execution-authorisation-v1",
  "scope": "DEVELOPMENT_ONLY",
  "freezeConfigRawSha256": "c3f0a76b3a5939f3e4bf395d46237cf0b0f365fa1f4bf019092a6944849d6157",
  "variants": [
    { "name": "PROMPT_V1_CANONICAL", "label": "PROMPT_V1_COMPARATOR", "gitCommit": "0d2928a474796b89fad0644e99b5b934ecad10d0" },
    { "name": "PROMPT_V2_CANONICAL", "label": "PROMPT_V2_CANDIDATE", "gitCommit": "c37dd5a73d0f285b97a0a9a43bf0e42be8fc99c7" }
  ],
  "maxLogicalEvaluations": 24,
  "attemptNo": 1,
  "outputRoot": "/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-1",
  "issuedAtUtc": "2026-09-13T19:25:33Z",
  "validUntilUtc": "2026-09-13T23:25:33Z",
  "operatorAuthorisationStatement": "I AUTHORISE PHASE 2B-2D2C DEVELOPMENT-ONLY EXECUTION OF AT MOST 24 LOGICAL EVALUATIONS (12 PROMPT_V1_CANONICAL THEN 12 PROMPT_V2_CANONICAL) AGAINST THE F0B FREEZE c3f0a76b3a5939f3e4bf395d46237cf0b0f365fa1f4bf019092a6944849d6157. NO HOLDOUT. NO GOLD LABEL CHANGE. NO DATABASE."
}
```

UTF-8 byte length 1053; SHA-256
`46d1bd9ebed544f7ebf463f26ff6ec7cca89d8a9d849fdfd04a42412dc2d5705`; schema-valid
against `ExecutionAuthorisationSchema`; statement byte-for-byte equal to
`AUTHORISATION_STATEMENT`. Presented to the operator, who reproduced the
complete `operatorAuthorisationStatement` exactly, within the proposal's
validity window.

Immediately before writing, every volatile check in §11 item 1 was
re-run and reconfirmed unchanged: worktree cleanliness, corrected runtime
HEADs, F0B hash, plan hash, profile hygiene, the four auth-status fields,
and the empty output/authorisation directories. The proposed bytes were
confirmed unchanged (same 1053 bytes, same SHA-256) from what the operator
approved.

`attempt-1.json` was created with `O_CREAT | O_EXCL | O_WRONLY` (fails if
already present, no overwrite, no truncation), mode `0600`, then `fsync`'d
on both the file descriptor and the containing directory. The written
bytes were read back and re-hashed: `46d1bd9e…4a42412dc2d5705`, matching
the approved SHA-256 exactly.

The file was then read back through the **real** authorisation
parser/evaluator (`ExecutionAuthorisationSchema.safeParse` and
`evaluateExecutionLock`, the same functions the F1 CLI itself imports —
`runExperiment` and the CLI's own `--execute` path were never invoked):
`ExecutionAuthorisationSchema` accepted it; `evaluateExecutionLock` returned
`granted: true` with `authorisationSha256` matching the file's own hash,
having verified the F0B hash, both corrected commits, the output root, the
attempt number, the validity window, and — via `isAuthorisationConsumed` —
that no consumption marker exists for this hash under the output root.

Post-write confirmation: no consumption marker, no evaluation artifact;
`/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/attempt-1` still has
zero entries; `authorisations/` contains exactly `attempt-1.json` and
nothing else. Zero inference was performed at any point in this task.

## 12. Closing status

`PHASE 2B-2D2C-F2B COMPLETE — F0B RUNTIMES AND ATTEMPT-1 AUTHORISATION
PREPARED; ZERO INFERENCE; READY FOR SEPARATE F3 EXECUTION`

Next step: a separately invoked F3 execution task, using this already
approved, immutable authorisation file. This task performed no F3 step and
made no `--execute` invocation.
