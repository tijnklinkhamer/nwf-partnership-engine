# CLAUDE.md amendment for the WW acquisition line (V1) — PROPOSED

- **Status: PROPOSED, NOT APPLIED.** `CLAUDE.md` is unchanged on this line.
  This file holds the exact text the OWNER is asked to accept in sign-off
  record **WW-S1 item 4**, together with ADRs 0027–0030 (all still
  **Proposed**). Until that signature exists, `CLAUDE.md` as committed governs,
  and every capability below stays inert: the operational trust sets are
  empty, no grant row exists in any persistent database, and `nwf_pe` is at 0012.
- **Why an amendment is needed.** `CLAUDE.md` lists one approved exception to
  "no crawling, no research pipeline" (the bounded classifier). The WW line
  adds two more bounded capabilities, which `CLAUDE.md` would otherwise
  describe as forbidden: OWNER-granted live WebSearch source discovery
  (ADRs 0027/0028) and the OWNER-signed acquisition queue with its wired
  stages (ADRs 0029/0030). The firewalls already pin both by exact path; this
  text makes the project instructions say the same.

## A. Replace the "one approved exception" paragraph (after "What Phase 1D measured")

Replace the paragraph that begins "There is no entity resolution, no crawling
or scraping" with:

> There is no entity resolution, no unbounded crawling or scraping, no contact
> discovery or storage, no compliance engine, no email templates, no Apollo
> integration and no outbound/outreach capability. Do not add any of them
> without an approved phase. Three bounded exceptions are approved, each
> INFERENCE- or RESEARCH-ONLY, each sending nothing to an organisation, storing
> no contact and performing no outreach:
>
> 1. the internal semantic classifier (ADR 0009, ADR 0010, ADR 0011): the
>    owner's own Claude Max subscription through the Agent SDK;
> 2. **live WebSearch source discovery** (ADR 0027, ADR 0028): one Agent SDK
>    call site (`src/orgunits/sourceDiscovery/`), the owner's Claude Max
>    subscription only, and only under a stored OWNER-path grant row (plan
>    digest, geography, model, query and run caps, DB-clock window). Each call
>    performs at most one WebSearch for exactly the planned query (PreToolUse
>    hook + `canUseTool`, `allowedTools: []`), keeps results only when the tool
>    reported exactly one search, and is relied on only after an OWNER smoke
>    verification of that SDK version and model. A nomination is a URL to
>    consider, never a fetch: nothing is requested until a campaign admits it;
> 3. **the acquisition queue** (ADR 0029, ADR 0030): an append-only work queue
>    driven only by an OWNER-signed campaign document (Ed25519, operational
>    trust set `OPERATIONAL_OWNER_CAMPAIGN_KEYS`), bounded by DB-enforced
>    budgets, a window, geographies, source kinds and link-out hops. Its
>    research goes through the existing gateway and robots rules unchanged.
>    Identity review stays a batched, per-subject, OWNER-signed act; the worker
>    never confirms an identity, states a country or scores anything.
>
> Every other prohibition in this paragraph governs anything beyond those
> bounded uses, and none of them gains an exception to any rule below.

## B. Rule 1 — append one paragraph

> **Approved live source discovery is not partnership outreach either.** ADR
> 0028 governs it: the same owner-provisioned Claude Max path as the
> classifier (ADR 0010), a stored OWNER-path grant per run, and no provider,
> key or auth path beyond that. It reads public search results only; it never
> contacts, emails or submits anything to an organisation.

## C. "Current state" — append one sentence to the bold summary

> Plus the WW acquisition line (ADRs 0027–0030, Proposed until accepted):
> OWNER-granted live source discovery, OWNER-signed campaigns and an
> append-only acquisition queue whose worker discovers, deduplicates,
> researches through the existing gateway, extracts source-backed C1 evidence
> (`nwf-pe.qualification-input-export.v2`, rules
> `nwf-pe-c1-extraction-rules-v3`, extraction label `orgunit-extraction-v4`)
> and writes an outbox (`nwf-pe.acquisition-outbox.v1`) for the Operator; and
> the Mac runtime (`npm run engine -- …`) that supervises it. Migrations
> 0013–0028.

## D. Layout — add

```
src/orgunits/sourceDiscovery/  ADR 0027/0028: the ONE Agent SDK WebSearch call
                     site, the search planner, grants, smoke verification,
                     nominations. No socket of its own beyond the SDK.
src/orgunits/acquisition/      ADR 0029: signed campaigns, trust set, the
                     append-only queue, claims, leases, budgets, worker loop.
src/orgunits/acquisitionWiring/ ADR 0030: the six wired stage handlers,
                     CAMPAIGN research admission, the batched OWNER identity
                     review (`review list` / `review sign --expect
                     [--country]`), the outbox, status v1.
src/orgunits/c1Extraction/     deterministic C1 evidence extraction (rules v3):
                     OBSERVED only for listing-shaped artefacts, proposals for
                     statements, negation and page guards in 8 languages.
src/runtime/         the Mac runtime: doctor, start/stop/pause/resume/
                     shutdown, status, logs, recover, install-agent (writes a
                     launchd plist only with --i-understand --execute; never
                     loads it).
```

## E. Commands — add

```bash
# Mac runtime (OWNER Mac only; never applies a migration, never pins a key)
npm run engine -- doctor
npm run engine -- start --campaign-id <uuid> --outbox-dir <dir>
npm run engine -- status | pause | resume | stop | shutdown | logs | recover

# Acquisition (OWNER path; every write needs its OWNER key and --execute)
npm run cli -- acquisition campaign template
npm run cli -- acquisition review list --campaign-id <uuid> --json
npm run cli -- acquisition review sign --campaign-id <uuid> --subject-id <S> \
  --expect <S>=<stateDigest> [--country <S>=<CC>@<pageEvidenceId>] --execute
```

## F. What does not change

Rules 2–23 stay as written. In particular: a country is never inferred (rule
2; the OWNER states it from the organisation's own page); provenance and all
research evidence stay append-only (rules 3, 15); exactly one module opens an
institution socket (rule 18); no response body is stored (rule 17); and the
classifier and source discovery each use only the owner's Claude Max
subscription.
