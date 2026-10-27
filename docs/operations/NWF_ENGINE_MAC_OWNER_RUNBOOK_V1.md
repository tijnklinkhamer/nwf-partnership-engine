# How to start NWF Partnership Engine on my Mac and operate the worldwide prospect acquisition system (V1)

- **Audience:** the OWNER, on the OWNER's own Mac.
- **Status:** written with the `nwf-engine` runtime (WW E-M, OWNER directive
  2026-10-27 §5 "Mac operation — start it and let it work"), updated for the
  wired stage handlers, the campaign signer, the batched identity review and
  the outbox (WW E-W, ADR 0030) and the source-discovery search gate (WW
  E-SDFX, ADR 0028 §9). Every command below exists in this build. Steps that need an OWNER act that has **not
  been granted yet** are marked **[NEEDS OWNER ACT]**; until those acts
  happen, `nwf-engine start` refuses, and it says exactly why.
- **What the runtime is:** one control surface around the existing
  acquisition worker (ADR 0029) and its wired stage handlers (ADR 0030:
  search → de-duplicate → propose → research → outbox; identity review stays
  yours). It starts the local database, checks everything, and keeps the
  worker running for one OWNER-signed campaign.
  It holds no authority of its own: the worker re-checks the OWNER-signed
  campaign before every item, and the database refuses anything the
  campaign does not allow.

## 1. Prerequisites

| what                     | why                                                 | check                                    |
| ------------------------ | --------------------------------------------------- | ---------------------------------------- |
| macOS, your own user     | everything runs as you; nothing is system-level     | —                                        |
| Docker Desktop, running  | the Engine's PostgreSQL runs in Docker on 127.0.0.1 | `nwf-engine doctor` (line `docker`)      |
| Node 24.x                | the repository pins it in `.node-version`           | `nwf-engine doctor` (line `node`)        |
| this checkout, installed | `npm ci` in the repository                          | —                                        |
| `.env` in the checkout   | the database connection strings (section 2 item 5)  | `nwf-engine doctor` (line `environment`) |

Run commands from the repository directory:

```bash
npm run engine -- <command>
# or, from anywhere:
<path-to-checkout>/scripts/nwf-engine <command>
```

The examples below write `nwf-engine <command>` for either form.

## 2. One-time setup (what the OWNER must sign or provision first, and why)

Run `nwf-engine doctor` first. It is read-only: it changes nothing. Each
`FAIL` line names what is missing. The full list:

1. **The database must be at this build's migration level.**
   **[NEEDS OWNER ACT]** The runtime never applies a migration. When the
   database is behind, `doctor` prints the missing versions and the apply
   runbook for them, for example
   `docs/architecture/NWF_PE_MIGRATIONS_0013_0025_APPLY_RUNBOOK_V1.md`
   (prepared, not executed; it covers 0013–0025 from a database at 0012,
   0019 or 0021). Each apply needs a **signed OWNER grant** that names the
   database, the migration range, the commit and the operator path; that
   runbook gives the exact grant text (`NWF-PE-APPLY-0013-0025-V1`). Why: the
   working database holds the frozen research corpus, and a wrong migration
   cannot be undone.
2. **An OWNER campaign key must be pinned.** **[NEEDS OWNER ACT]**
   `doctor` prints `no OWNER campaign key pinned: campaigns cannot run`
   until one is. Pinning a key is an OWNER key-custody decision plus a
   reviewed source change (`OPERATIONAL_OWNER_CAMPAIGN_KEYS`, ADR 0029 §8,
   ADR 0030 §11). Why: a campaign counts only if its OWNER signature verifies
   under the pinned key set. The runtime never reads a key, a key file or
   the Keychain.
3. **An OWNER review key must be pinned.** **[NEEDS OWNER ACT]** The same
   kind of decision for `OPERATIONAL_OWNER_REVIEW_KEYS` (ADR 0023, ADR 0030
   §5). Until then every identity review is refused, so no subject ever
   reaches the outbox manifest. `doctor` does not check this one.
4. **Logins must be provisioned.** **[NEEDS OWNER ACT]** No migration
   creates a login. One database login per capability, each holding only
   that capability (SELECT and INSERT; never the owner, never a superuser):
   - `nwf_acquisition_worker` — the worker (`doctor` refuses a superuser);
   - `nwf_source_discovery` — the search stage;
   - `nwf_discovery_subject_writer` — the proposal stage;
   - `nwf_research` — the research stage;
   - `nwf_discovery_subject_reviewer` — your batched identity review.
5. **`.env` names the connection strings**, all for the same local
   database:
   - `DATABASE_URL_ADMIN`: the owner path. It reads the migration ledger
     (read-only) and records pause, resume, stop and review releases.
   - `DATABASE_URL_READONLY`: campaign status and the review list.
   - `DATABASE_URL_ACQUISITION_WORKER`: the worker login.
   - `DATABASE_URL_SOURCE_DISCOVERY`, `DATABASE_URL_DISCOVERY_SUBJECT_WRITER`,
     `DATABASE_URL_RESEARCH`: the worker's stage handlers.
   - `DATABASE_URL_DISCOVERY_SUBJECT_REVIEWER`: `acquisition review sign`.

   The runtime checks the first three: it refuses any host that is not this
   Mac (`127.0.0.1`, `localhost`, `::1`), a `_test` database, and variables
   that name different databases, and it prints variable **names**, never
   values. **It does not check the other four** — keep them on the same
   local database yourself.

6. **The search stage needs your Claude Max stored login.** **[NEEDS OWNER
   ACT]** The stage handlers are wired (ADR 0030); the search stage calls
   only your Claude Max subscription, through the Agent SDK, from the
   dedicated profile directory `NWF_PE_CLASSIFIER_CONFIG_DIR` (ADR 0010). No
   API key, PAYG, Bedrock or Vertex variable may be set: the run refuses.
7. **A search grant, and one verified D8 smoke.** **[NEEDS OWNER ACT]** A
   campaign searches only under OWNER-path grant rows it lists (ADR 0028 §6
   shows the row: plan, geography, model, `max_queries`, `max_runs`, a
   window of at most a day). The **first** search ever made for an SDK
   version and model is the D8 smoke, and nothing past it runs until you
   verify it (ADR 0028 §9): issue a one-query grant, run it once with
   `npm run cli -- orgunits discover-sources --execute --grant-id <uuid> --json`,
   read the result (`searchGate.hookInvoked` must be `true`, the outcome
   `RESULTS`, and the nominations must look like results for the planned
   query), then record the verification as the migration owner with the SQL
   in ADR 0028 §9. A search whose stream does not show exactly one WebSearch
   for the planned query is refused (`SEARCH_BINDING_REFUSED`) and keeps
   nothing. The runtime never issues a grant or records a verification.
8. **An outbox directory.** Create one directory the worker may write
   research exports into, for example:

   ```bash
   mkdir -p -m 700 ~/NWF/outbox
   ```

   Give its absolute path to `nwf-engine start --outbox-dir` once (section
   3); it is remembered. The runtime never creates or chooses it. A symlink
   is refused. Section 3 shows what appears in it.

9. **A campaign must be signed, recorded and started by the OWNER.**
   **[NEEDS OWNER ACT]** The runtime never records or starts a campaign.
   Offline, on your Mac:

   ```bash
   # an UNSIGNED, conservative draft: all six worker stages, a 7-day window
   # (at most 14), small budgets, concurrency 1. Writes nothing.
   npm run cli -- acquisition campaign template --campaign-key <key> \
       --geography JP [--geography ...] --search-grant-id <grant uuid> [--days 7] > draft.json
   # read draft.json; then sign it with your ENCRYPTED campaign key
   # (passphrase asked with echo off; writes a NEW 0600 file; no database, no network)
   npm run cli -- acquisition campaign sign --file draft.json \
       --key-file <absolute path to encrypted pkcs8> --key-id <key id> --out signed.json
   npm run cli -- acquisition campaign verify  --file signed.json
   npm run cli -- acquisition campaign record  --file signed.json --execute
   npm run cli -- acquisition campaign control --campaign-id <uuid> --action START --execute
   ```

   No work item exists before START (or before the signed window opens).

When `doctor` ends with `Result: ready`, the Mac is set up.

## 3. Daily use

### Start

```bash
nwf-engine start --campaign-id <uuid> --outbox-dir ~/NWF/outbox   # first time; both are remembered
nwf-engine start                                                  # afterwards
```

(Give the outbox as an absolute path; the shell expands `~` for you.)

`start` does this, in order, and stops at the first refusal:

1. checks the three connection strings (local only, no test database);
2. refuses if an engine is already running, or if a crashed one left a lock
   (section 5);
3. if the Engine PostgreSQL container is stopped, starts it with
   `docker compose up -d --no-recreate --wait postgres`. It never runs
   `down`, never removes a volume and never recreates the container;
4. runs `doctor` and refuses on any `FAIL`;
5. checks the outbox directory: it must exist as a real directory, and a
   campaign whose signed stages write exports (`RESEARCHED`, `ASSESSABLE`)
   is refused when none is configured;
6. starts the **supervisor** in the background, which hands the outbox to
   every worker it runs (`acquisition worker --outbox-dir`), and confirms
   that it took its lock.

The supervisor then works without prompts:

| the worker stopped because           | the supervisor                                                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| it was idle, or the queue is drained | starts it again after a wait (30 s, doubling, at most 15 min)                                                     |
| the identity-review backlog is full  | the same wait; shown as waiting for human review                                                                  |
| a budget is spent, review pending    | the same wait, while subjects await your identity review (their outbox lines still need the worker)               |
| the campaign is PAUSED               | waits (no worker runs) and continues as soon as it is resumed                                                     |
| the campaign is not started yet      | waits for the OWNER's START                                                                                       |
| the window has not opened yet        | waits for the window                                                                                              |
| STOP, EMERGENCY_STOP                 | exits for good                                                                                                    |
| a budget is spent, no review pending | exits for good (`BUDGET_EXHAUSTED`)                                                                               |
| the window has ended                 | exits for good (`CAMPAIGN_WINDOW_CLOSED`)                                                                         |
| the campaign does not verify         | exits for good (`CAMPAIGN_UNVERIFIED`)                                                                            |
| it refused to start                  | exits for good (`WORKER_REFUSED` with the code, e.g. an `outbox_*` code; `HANDLERS_NOT_WIRED`)                    |
| it crashed                           | starts it again after 10 s (doubling, at most 5 min); after 8 consecutive failures it exits (`REPEATED_FAILURES`) |
| a reason this build does not know    | exits (`UNKNOWN_WORKER_STOP`): it never guesses                                                                   |

Only one supervisor runs per Mac user. It runs one worker at a time, for one
campaign. The database's own claim rules hold whatever happens on the Mac:
one claim per item attempt, a concurrency cap per campaign, a budget
RESERVATION per claim (a crashed claim's reservation stays spent), lease
heartbeats while an item runs, and at most one `ADVANCED` outcome per item.

### The daily flow

1. `nwf-engine status`. The worker searches under the campaign's grants,
   de-duplicates (a duplicate is refused with a named signal, never merged),
   proposes provisional subjects, researches each one within the signed
   budgets, writes its two exports to the outbox and parks it **awaiting
   your identity review**. The dashboard says how many await you.
2. Review them in ONE batch:

   ```bash
   npm run cli -- acquisition review list --campaign-id <uuid>
   # each line: subject id, name claim(s), kind, country claim, root URL,
   # pages read, duplicate signals. Add --json for every field.
   npm run cli -- acquisition review sign --campaign-id <uuid> \
       --subject-id <uuid> --subject-id <uuid> ... \
       --key-file <absolute path to encrypted review key> --key-id <key id>      # dry run
   # the same with --execute: ONE passphrase for the batch
   ```

   Only the subjects you list are reviewed; there is no "all". Each gets
   your signed OWNER review (ADR 0023) and is released to `ASSESSABLE`. A
   subject you do not confirm stays where it is.

3. The worker (restarted by the supervisor within its idle wait, at most 15
   minutes) writes each released subject's manifest line. The Engine sends
   the outbox nowhere: carrying it to the Operator is a separate step.

### Where the outbox goes

Under the directory you gave `start --outbox-dir`
(`nwf-pe.acquisition-outbox.v1`, ADR 0030 §6), directories 0700, files 0600,
written atomically:

```
<outbox>/<campaign id>/outbox.json
<outbox>/<campaign id>/subjects/<subject id>/qualification-input-export.v2.json
<outbox>/<campaign id>/subjects/<subject id>/subject-facts-export.v1.json
<outbox>/<campaign id>/manifest.jsonl     one line per subject YOU confirmed
```

Exports are written when research finishes, BEFORE your review; only
`manifest.jsonl` lists confirmed subjects, with each file's SHA-256. Whatever
imports it should read the manifest, never the `subjects/` folder alone. No page text
beyond the exports' own redacted quotes, no contact, no score.

### Status

```bash
nwf-engine status            # the dashboard
nwf-engine status --json     # machine output, contract nwf-engine.status.v1
```

See section 6 for what each line means.

### Pause and resume

```bash
nwf-engine pause  [--reason "<text>"]
nwf-engine resume [--reason "<text>"]
```

Each records the control event through the existing owner path
(`acquisition campaign control ... --execute`), then wakes the supervisor.
On `pause`, the current item finishes and its outcome is recorded; nothing
new is claimed. On `resume`, work continues at once. `resume` needs the
campaign to verify under the pinned key set, so it is refused while no key
is pinned. Both work when the engine is not running: the event is recorded,
and the next `start` honours it.

### Stop (ends the campaign)

```bash
nwf-engine stop                  # dry run: explains what STOP does
nwf-engine stop --execute        # records STOP
nwf-engine stop --emergency      # records EMERGENCY_STOP at once
```

**STOP is terminal.** The campaign is over, and continuing needs a new
signed campaign. On STOP, the current item finishes and its outcome is
recorded; then the worker and the supervisor exit. On `--emergency`, the
worker aborts the running item, which is recorded as refused
(`CAMPAIGN_EMERGENCY_STOPPED`). The supervisor gets SIGTERM. If the worker
has not exited within 60 seconds, the supervisor kills it. A killed worker's
claim expires, and because the campaign is over, the item is not retried.

## 4. Shutdown (the campaign stays as it is)

```bash
nwf-engine shutdown
```

This stops the engine **on this Mac**. It records nothing in the database.
The worker gets SIGTERM: it finishes its current item, records the outcome
and exits; then the supervisor exits with `SHUTDOWN_REQUESTED`. A graceful
shutdown never kills the worker, however long its item takes.
`nwf-engine start` continues later. Use this before you shut down or restart
the Mac. Use `pause` when you want every worker anywhere to stop claiming.

## 5. Restart after a reboot or a crash

**After a clean shutdown or a reboot:** run `nwf-engine start`. Nothing
starts the engine on its own unless you install the optional LaunchAgent
(section 8).

**After a crash** (power loss, a killed process): `nwf-engine status` shows
`STALE LOCK`, and `start` refuses. Run:

```bash
nwf-engine recover
nwf-engine start
```

`recover` does the following:

1. It refuses if the supervisor is still alive. Use `shutdown` instead.
2. It refuses if the crashed supervisor's worker is still alive. It prints
   the pid, `ps -p <pid> -o command=` to check it, and `kill -TERM <pid>` to
   let it finish its current item.
3. It removes only the stale lock and the pidfile. **No data is deleted.**
   The queue, claims and outcomes are in the database, untouched.
4. It reports how many items have an expired lease and how many hold a live
   claim. An item whose worker died is retried as its next attempt once its
   lease expires (at most 15 minutes). The database allows one `ADVANCED`
   outcome per item, so nothing runs twice to completion.

## 6. Observability: what each status line means

The campaign part is read from `nwf-pe acquisition status --json`, whose
status is `nwf-pe.acquisition-status.v1` (ADR 0030 §8). A status in any other
schema is shown as unreadable, never guessed at.

| line                                | meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supervisor                          | `RUNNING (pid, uptime)`, `NOT RUNNING` (with the last exit and why), or `STALE LOCK` (run `recover`)                                                                                                                                                                                                                                                                                                                                                                            |
| Phase                               | what the supervisor is doing now, explained on the next line (running the worker, waiting for work or for your review, paused, waiting after a failure, ...)                                                                                                                                                                                                                                                                                                                    |
| Next check                          | when a waiting supervisor next reads the campaign status                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Worker / Last worker exit           | the current worker pid; why the last worker run stopped and how many items it processed                                                                                                                                                                                                                                                                                                                                                                                         |
| Campaign / Status contract          | the campaign key and id; `nwf-pe.acquisition-status.v1`                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Control state                       | `NOT_STARTED`, `RUNNING`, `PAUSED`, `STOPPED` or `EMERGENCY_STOPPED`, explained (`campaign.controlState`)                                                                                                                                                                                                                                                                                                                                                                       |
| OWNER signature                     | `VERIFIED`, or `NOT VERIFIED` with the reason (`campaign.verified`). While no key is pinned this is always NOT VERIFIED                                                                                                                                                                                                                                                                                                                                                         |
| Window / Signed stages              | the signed start and end, whether it is open now, and the worker stages the campaign signed                                                                                                                                                                                                                                                                                                                                                                                     |
| Queue depth (open items)            | pending, claimed, lease-expired and retry-scheduled items, per stage (`queue.stages`)                                                                                                                                                                                                                                                                                                                                                                                           |
| Latest discovery run                | the newest search or link-out run of this campaign: kind, geography, start, outcome (`discovery.latestRun`); then the number of search runs and link-out roots                                                                                                                                                                                                                                                                                                                  |
| Candidates discovered               | nominations (items at `NOMINATED`), then de-duplicated, proposed, researched, duplicates refused and large HEIs deprioritised (`candidates.*`)                                                                                                                                                                                                                                                                                                                                  |
| Awaiting identity review            | subjects parked for YOUR batched review, and how many were released after it (`identityReview.*`). Only you can move these on                                                                                                                                                                                                                                                                                                                                                   |
| Outbox                              | research exports and manifest lines written, and when last (`outbox.*`)                                                                                                                                                                                                                                                                                                                                                                                                         |
| Outbox directory                    | the directory `start --outbox-dir` remembered on this Mac                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Last progress                       | the last `ADVANCED` outcome of any stage (`queue.lastAdvancedAt`)                                                                                                                                                                                                                                                                                                                                                                                                               |
| Last successful research            | the last completed research run of this campaign, or `none yet` (`lastSuccessfulResearchAt`)                                                                                                                                                                                                                                                                                                                                                                                    |
| Refused and failed items            | each terminal reason per stage with its count and the status's own explanation (`failures[]`)                                                                                                                                                                                                                                                                                                                                                                                   |
| Budgets                             | remaining of each signed budget; in-flight claims count their reservation as spent (`budgets`)                                                                                                                                                                                                                                                                                                                                                                                  |
| Last publication                    | the Operator's last delivered publication, read (read-only) from the Operator's local status file `nwf-operator.local-status.v1` (its top-level `lastPublicationAt`, set by `registry-admin ranking-push` after a delivered push; `registry-admin acquisition-qualify` writes the same file). Default path `~/Library/Application Support/nwf-operator/local-status.json`, used when it exists; `--operator-status-file <path>` names another. No file: `not known on this Mac` |
| Errors, warnings and notes          | the subjects awaiting review (with the two review commands), refusals and failures, expired leases, spent budgets, a stale lock, no progress for 24 h while running                                                                                                                                                                                                                                                                                                             |
| Additional fields                   | anything the Engine status reports that this build does not know, shown as reported, never dropped                                                                                                                                                                                                                                                                                                                                                                              |
| Not reported by the campaign status | v1 fields the dashboard looked for and did not find. These are shown as "not reported", never as 0                                                                                                                                                                                                                                                                                                                                                                              |

Logs:

```bash
nwf-engine logs                  # the last 100 lines
nwf-engine logs --lines 500
nwf-engine logs --follow         # Ctrl-C to stop
```

| file                                                 | holds                                                                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `~/Library/Logs/nwf-engine/engine.log` (`.1` … `.5`) | one line per event; rotated at 5 MiB, 5 files kept                                                          |
| `~/Library/Logs/nwf-engine/supervisor-output.log`    | a crashed supervisor's own output (rotated at each start when over 5 MiB)                                   |
| `~/Library/Application Support/nwf-engine/`          | the lock, the pidfile, the supervisor state, the remembered campaign and outbox path. Mode 0700. No secrets |

## 7. Troubleshooting

| you see                                                                             | do                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Docker is not running or not reachable`                                            | start Docker Desktop, then `nwf-engine start`                                                                                                                                                                                                                                                      |
| `database is not at this build's level`                                             | follow the runbook `doctor` names, under a signed OWNER grant. Never improvise                                                                                                                                                                                                                     |
| `no OWNER campaign key pinned: campaigns cannot run`                                | section 2 item 2. Nothing else unblocks it                                                                                                                                                                                                                                                         |
| `no worker login configured` / `not usable`                                         | section 2 item 3                                                                                                                                                                                                                                                                                   |
| `... points at host ..., which is not this Mac`                                     | `.env` names a remote database. The runtime operates the local one only                                                                                                                                                                                                                            |
| `the configured database (port …) is NOT this container`                            | `.env` and the Docker container disagree. Fix `.env`                                                                                                                                                                                                                                               |
| supervisor exited `HANDLERS_NOT_WIRED`                                              | the campaign lists a stage this build has no handler for. Sign a campaign from `campaign template`                                                                                                                                                                                                 |
| `start` refused: `... writes research exports to an outbox, and none is configured` | section 2 item 8, then `nwf-engine start --outbox-dir <absolute dir>`                                                                                                                                                                                                                              |
| supervisor exited `WORKER_REFUSED` (`outbox_...`)                                   | the outbox directory is missing, relative or a symlink. Fix it, then `start` again                                                                                                                                                                                                                 |
| Latest discovery run ends `ABORTED` or `FAILED`                                     | the dashboard shows the outcome only; the reason is the run's completion reason in `source_discovery_run_completions`. `SMOKE_UNVERIFIED`: verify the D8 smoke (section 2 item 7). `SEARCH_BINDING_REFUSED`: the stream did not show exactly one WebSearch for the planned query; nothing was kept |
| subjects stay `Awaiting identity review`                                            | only your `acquisition review sign --execute` releases them (section 3)                                                                                                                                                                                                                            |
| supervisor exited `CAMPAIGN_UNVERIFIED`                                             | the campaign's signature does not verify under the pinned key set                                                                                                                                                                                                                                  |
| supervisor exited `REPEATED_FAILURES`                                               | read `nwf-engine logs`. Usually the database is down. Fix it, then `nwf-engine start`                                                                                                                                                                                                              |
| `STALE LOCK`                                                                        | `nwf-engine recover`, then `nwf-engine start`                                                                                                                                                                                                                                                      |
| `resume` refused `CAMPAIGN_UNVERIFIED`                                              | RESUME needs a verifying campaign (section 2 item 2)                                                                                                                                                                                                                                               |
| status line `... item(s) have an expired lease`                                     | a worker died or hung. Those items are retried. No action needed                                                                                                                                                                                                                                   |

## 8. Optional: start with a LaunchAgent

Nothing is installed by default. If you want launchd to be able to run
`nwf-engine start` for you:

```bash
nwf-engine install-agent --i-understand              # shows the exact plist; writes nothing
nwf-engine install-agent --i-understand --execute    # writes ~/Library/LaunchAgents/nl.newwavefluent.nwf-engine.plist
```

The plist runs `nwf-engine start --campaign-id <uuid>`, which applies the
same `doctor` gate. `RunAtLoad` is false, unless you add `--run-at-load`.
`KeepAlive` is false, so launchd never revives the engine after a STOP. The
runtime **never loads it**. It prints the commands for you to run yourself:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/nl.newwavefluent.nwf-engine.plist
launchctl kickstart gui/$(id -u)/nl.newwavefluent.nwf-engine
```

To remove it, unload it first (`launchctl bootout gui/$(id -u)/nl.newwavefluent.nwf-engine`),
then run `nwf-engine uninstall-agent --execute`. No sudo is used anywhere.

## 9. What the Engine will never do on its own

- Apply a migration, or run `docker compose down` or remove a volume.
- Record, sign or START a campaign, grant anything, pin a key, provision a
  login, or change any switch or hold.
- Read the Keychain, a key file or a credential file.
- Make a network call itself. Every request to an organisation's website or
  to a provider happens only inside the worker's own gated stage handlers,
  under the OWNER-signed campaign.
- Pass the human identity gate. Identity review is the OWNER's, and the
  worker parks those items as awaiting the OWNER.
- Contact anyone, send anything, score or rank an organisation.
- Target any database that is not on this Mac.
- Load a LaunchAgent, or run anything as root.
