# Phase 2B-2D2C-F1A/F0B — macOS stored-auth runtime-parity correction (2026-09-13)

**State at skeleton: IN PROGRESS.** This record is committed first as a
skeleton so that every later section is appended against a known starting
point. Nothing below §0 is complete until the closure commit says so.

This task runs no inference, no Agent SDK `query()`, no `claude -p`, no
interactive `claude`, no F3 execution, no database access, no institutional
request, no HOLDOUT read, no gold-label change, and creates no execution
authorisation and no consumption marker. The only Claude executions are
bounded, request-free `auth status --json` reads of LOCAL credential state.

Evidence labels, as in every 2D2 record:

| label                            | meaning                                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `OWNER_PRESERVED_REQUIREMENT`    | A requirement supplied in the F1A/F0B brief or carried forward from F0/F0A/F1/F2.                              |
| `RECONSTRUCTED_AND_VERIFIED_NOW` | Observed, computed or executed in this session on this Mac (darwin 25.6.0, Node 24.18.0, Claude Code 2.1.270 external). |
| `NOT_REVERIFIED`                 | Not measured here, or known only from a record whose surrounding conditions were not re-established.           |

---

## 0. Scope of the correction — `OWNER_PRESERVED_REQUIREMENT`

F2 (`fa9b6b40…`) closed `BLOCKED_PENDING_F1_CORRECTION` with two blockers:
`PROFILE_HYGIENE_VIOLATION` on a CLI-created `settings.json`, and
`NOT_LOGGED_IN` under the production sanitized environment because Claude
Code on this Mac resolves the Keychain-stored subscription login by the
`USER` environment variable, which neither the F1 Tier-2 child allowlist nor
the production child-environment builder forwards. This task restores
request-free authentication preflight parity across the F1 child, the
production environment builder in both frozen runtime variants, the Claude
Code executable used for `auth status`, the executable used by the Agent
SDK, and the freeze/runner checks that pin them. It authorises zero
inference.

## 1. Preflight and ancestry — `RECONSTRUCTED_AND_VERIFIED_NOW`

_(to be completed)_

## 2. Execution-chain findings

_(to be completed)_

## 3. `settings.json` quarantine

_(to be completed)_

## 4. Corrected runtime variants

_(to be completed)_

## 5. F1 rebinding and F0B

_(to be completed)_

## 6. Request-free live verification

_(to be completed)_

## 7. Tests and mutation checks

_(to be completed)_

## 8. Closure

_(to be completed)_
