# How to start NWF Partnership Engine on my Mac and operate the worldwide prospect acquisition system (V1)

- **Audience:** the OWNER, on the OWNER's own Mac.
- **Status:** written with the `nwf-engine` runtime (WW E-M, OWNER directive
  2026-10-27 §5 "Mac operation — start it and let it work"). Every command
  below exists in this build. Steps that need an OWNER act that has **not
  been granted yet** are marked **[NEEDS OWNER ACT]**; until those acts
  happen, `nwf-engine start` refuses, and it says exactly why.
- **What the runtime is:** one control surface around the existing
  acquisition worker (ADR 0029). It starts the local database, checks
  everything, and keeps the worker running for one OWNER-signed campaign.
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
| `.env` in the checkout   | the three database connection strings (section 2)   | `nwf-engine doctor` (line `environment`) |

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
   `docs/architecture/NWF_PE_MIGRATIONS_0013_0021_APPLY_RUNBOOK_V1.md`. Each
   apply needs a **signed OWNER grant** that names the database, the
   migration range, the commit and the operator path. This build ships **no**
   apply runbook for 0022 and 0023; `doctor` says so. Those need a grant and
   a runbook that do not exist yet. Why: the working database holds the
   frozen research corpus, and a wrong migration cannot be undone.
2. **An OWNER campaign key must be pinned.** **[NEEDS OWNER ACT]**
   `doctor` prints `no OWNER campaign key pinned: campaigns cannot run`
   until one is. Pinning a key is an OWNER key-custody decision plus a
   reviewed source change (ADR 0029 §8). Why: a campaign counts only if its
   OWNER signature verifies under the pinned key set. The runtime never
   reads a key, a key file or the Keychain.
3. **A worker login must be provisioned.** **[NEEDS OWNER ACT]** One
   database login granted `nwf_acquisition_worker`, named in `.env` as
   `DATABASE_URL_ACQUISITION_WORKER`. No migration creates it. Why: the
   worker runs with SELECT and INSERT only, never as the owner. `doctor`
   refuses a superuser login here.
4. **`.env` names three connection strings**, all for the same local
   database:
   - `DATABASE_URL_ADMIN`: the owner path. It reads the migration ledger
     (read-only) and records pause, resume and stop events.
   - `DATABASE_URL_READONLY`: campaign status.
   - `DATABASE_URL_ACQUISITION_WORKER`: the worker login (item 3).

   The runtime refuses any host that is not this Mac (`127.0.0.1`,
   `localhost`, `::1`). It refuses a `_test` database. It refuses variables
   that name different databases. It prints variable **names**, never values.

5. **Stage handlers must be wired.** **[NEEDS a separate package]** Until the
   wiring package lands, the worker refuses with
   `ACQUISITION_HANDLERS_NOT_WIRED`. The supervisor then exits with
   `HANDLERS_NOT_WIRED`, and nothing is claimed.
6. **A campaign must be signed, recorded and started by the OWNER.**
   **[NEEDS OWNER ACT]** The runtime never records or starts a campaign. With
   a signed envelope, the OWNER runs the existing owner-path commands:

   ```bash
   npm run cli -- acquisition campaign verify  --file <signed.json>
   npm run cli -- acquisition campaign record  --file <signed.json> --execute
   npm run cli -- acquisition campaign control --campaign-id <uuid> --action START --execute
   ```

   No offline campaign signer exists yet (ADR 0029 §8).

When `doctor` ends with `Result: ready`, the Mac is set up.

## 3. Daily use

### Start

```bash
nwf-engine start --campaign-id <uuid>     # first time; the id is remembered
nwf-engine start                          # afterwards
```

`start` does this, in order, and stops at the first refusal:

1. checks the three connection strings (local only, no test database);
2. refuses if an engine is already running, or if a crashed one left a lock
   (section 5);
3. if the Engine PostgreSQL container is stopped, starts it with
   `docker compose up -d --no-recreate --wait postgres`. It never runs
   `down`, never removes a volume and never recreates the container;
4. runs `doctor` and refuses on any `FAIL`;
5. starts the **supervisor** in the background and confirms that it took
   its lock.

The supervisor then works without prompts:

| the worker stopped because           | the supervisor                                                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| it was idle, or the queue is drained | starts it again after a wait (30 s, doubling, at most 15 min)                                                     |
| the identity-review backlog is full  | the same wait; shown as waiting for human review                                                                  |
| the campaign is PAUSED               | waits (no worker runs) and continues as soon as it is resumed                                                     |
| the campaign is not started yet      | waits for the OWNER's START                                                                                       |
| the window has not opened yet        | waits for the window                                                                                              |
| STOP, EMERGENCY_STOP                 | exits for good                                                                                                    |
| a budget is spent                    | exits for good (`BUDGET_EXHAUSTED`)                                                                               |
| the window has ended                 | exits for good (`CAMPAIGN_WINDOW_CLOSED`)                                                                         |
| the campaign does not verify         | exits for good (`CAMPAIGN_UNVERIFIED`)                                                                            |
| it refused to start                  | exits for good (`HANDLERS_NOT_WIRED`, `WORKER_REFUSED`, ...)                                                      |
| it crashed                           | starts it again after 10 s (doubling, at most 5 min); after 8 consecutive failures it exits (`REPEATED_FAILURES`) |
| a reason this build does not know    | exits (`UNKNOWN_WORKER_STOP`): it never guesses                                                                   |

Only one supervisor runs per Mac user. It runs one worker at a time, for one
campaign. The database's own claim rules hold whatever happens on the Mac:
one claim per item attempt, a concurrency cap per campaign, and at most one
`ADVANCED` outcome per item.

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

| line                       | meaning                                                                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supervisor                 | `RUNNING (pid, uptime)`, `NOT RUNNING` (with the last exit and why), or `STALE LOCK` (run `recover`)                                                                    |
| Phase                      | what the supervisor is doing now, explained on the next line (running the worker, waiting for work, paused, waiting after a failure, ...)                               |
| Next check                 | when a waiting supervisor next reads the campaign status                                                                                                                |
| Worker / Last worker exit  | the current worker pid; why the last worker run stopped and how many items it processed                                                                                 |
| Campaign / Control state   | the campaign key and id; `NOT_STARTED`, `RUNNING`, `PAUSED`, `STOPPED` or `EMERGENCY_STOPPED`, explained                                                                |
| OWNER signature            | `VERIFIED`, or `NOT VERIFIED` with the reason. While no key is pinned this is always NOT VERIFIED                                                                       |
| Window                     | the signed start and end, and whether it is open now                                                                                                                    |
| Research scope (stages)    | the worker stages the campaign signed                                                                                                                                   |
| Queue depth (open items)   | pending, claimed, lease-expired and retry-scheduled items, per stage                                                                                                    |
| Candidates discovered      | items at `NOMINATED` (every state)                                                                                                                                      |
| Candidates researched      | items at `RESEARCHED` (every state)                                                                                                                                     |
| Awaiting identity review   | items waiting in the `OWNER_IDENTITY_REVIEW` queue. Only the OWNER can move these on                                                                                    |
| Assessable                 | items at `ASSESSABLE`                                                                                                                                                   |
| Outbox entries             | `not reported`: the Engine status does not report it in this build                                                                                                      |
| Last progress              | the last `ADVANCED` outcome of any stage                                                                                                                                |
| Last successful research   | `not reported` until the status contract reports it                                                                                                                     |
| Budgets                    | remaining of each signed budget                                                                                                                                         |
| Last publication           | `not known on this Mac`, unless you pass `--operator-status-file <path>` to a JSON file with a `lastPublicationAt` instant. The Operator does not write such a file yet |
| Errors, warnings and notes | each refusal and failure reason with its count and meaning, expired leases, spent budgets, a stale lock, no progress for 24 h while running                             |
| Additional fields          | anything the Engine status reports that this build does not know, shown as reported, never dropped                                                                      |
| Not reported by this build | fields the dashboard looked for and did not find. These are shown as "not reported", never as 0                                                                         |

Logs:

```bash
nwf-engine logs                  # the last 100 lines
nwf-engine logs --lines 500
nwf-engine logs --follow         # Ctrl-C to stop
```

| file                                                 | holds                                                                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `~/Library/Logs/nwf-engine/engine.log` (`.1` … `.5`) | one line per event; rotated at 5 MiB, 5 files kept                                             |
| `~/Library/Logs/nwf-engine/supervisor-output.log`    | a crashed supervisor's own output (rotated at each start when over 5 MiB)                      |
| `~/Library/Application Support/nwf-engine/`          | the lock, the pidfile, the supervisor state and the remembered campaign. Mode 0700. No secrets |

## 7. Troubleshooting

| you see                                                  | do                                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `Docker is not running or not reachable`                 | start Docker Desktop, then `nwf-engine start`                                         |
| `database is not at this build's level`                  | follow the runbook `doctor` names, under a signed OWNER grant. Never improvise        |
| `no OWNER campaign key pinned: campaigns cannot run`     | section 2 item 2. Nothing else unblocks it                                            |
| `no worker login configured` / `not usable`              | section 2 item 3                                                                      |
| `... points at host ..., which is not this Mac`          | `.env` names a remote database. The runtime operates the local one only               |
| `the configured database (port …) is NOT this container` | `.env` and the Docker container disagree. Fix `.env`                                  |
| supervisor exited `HANDLERS_NOT_WIRED`                   | expected until the wiring package lands. Nothing was claimed                          |
| supervisor exited `CAMPAIGN_UNVERIFIED`                  | the campaign's signature does not verify under the pinned key set                     |
| supervisor exited `REPEATED_FAILURES`                    | read `nwf-engine logs`. Usually the database is down. Fix it, then `nwf-engine start` |
| `STALE LOCK`                                             | `nwf-engine recover`, then `nwf-engine start`                                         |
| `resume` refused `CAMPAIGN_UNVERIFIED`                   | RESUME needs a verifying campaign (section 2 item 2)                                  |
| status line `... item(s) have an expired lease`          | a worker died or hung. Those items are retried. No action needed                      |

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
