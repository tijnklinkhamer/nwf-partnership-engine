# Track B B3.0: research-side evaluation-cohort guard (V1)

Status: IMPLEMENTED AND TESTED LOCALLY on branch `feat/pe-discovery-research-cohort-guard-v1`
(worktree `~/wt-pe-research-cohort-guard`), based on the accepted B1.1 tip `02ddcf2`.
**Uncommitted, pending OWNER review.** This guard does **not** authorise live research. Decision
record: `docs/evaluation/TRACK_B_B3_0_RESEARCH_COHORT_GUARD_OWNER_DECISION_V1.json`.

## Why

The classifier operator command has refused protected evaluation organisations since
CLASSIFIER_OPERATOR_EVALUATION_COHORT_GUARD_V1. The research path did not. `orgunits discover
--execute` called `runOrganisationDiscovery`, which appended an `orgunit_research_runs` row
(`startRun`) and then acquired evidence. Nothing asked about cohort membership. A protected
organisation could therefore receive a new run and new evidence before the classifier refused it
later.

## Existing classifier protection (unchanged)

`src/orgunits/classify/evaluationCohortGuard.ts` is byte-identical to `02ddcf2`. The repair-scope
firewall asserts this.

- **Authority.** `EVALUATION_COHORT_ARTIFACT_PINS` lists four artifacts, each pinned by the SHA-256
  of its exact committed bytes:
  - Draw V2 GEN1 (`selection` splits and every `reserve` position);
  - Reserve Replacement Ledger V2 GEN1 (every replacement occupant, chain-checked);
  - the R50 DEV_TRAIN A4 handoff index (every item's organisation);
  - Frame V2 GEN1 (the `excludedHistoricalDevelopment` flag, and the key-to-organisation-id
    binding).
- **Loading.** `loadEvaluationCohortRegistry` reads the artifacts from the checkout, and
  `buildEvaluationCohortRegistry` verifies them. A missing pin, missing or unreadable bytes, a hash
  mismatch, invalid JSON or any structural or cross-artifact inconsistency returns
  `EVALUATION_COHORT_METADATA_UNVERIFIED`.
- **Matching.** `evaluateCohortMembership` is pure. It matches by exact equality on `eche_row_key`
  and organisation id. It returns ALLOWED only for a frame member whose frame binding matches and
  who appears in no protected list, including every key that the run's fetch evidence names.
  Otherwise it returns `EVALUATION_COHORT_PROTECTED`, `EVALUATION_COHORT_CONFLICT` or
  `EVALUATION_COHORT_IDENTITY_UNVERIFIED`.
- **Refusal.** The classifier reports a refusal as `PREFLIGHT_REFUSED`, and its `detail` names the
  membership.

The B3.0 review found two discrepancies:

- `docs/audits/CLASSIFIER_OPERATOR_EVALUATION_COHORT_GUARD_V1.md` lists three refusal kinds. The
  source has a fourth, `EVALUATION_COHORT_IDENTITY_UNVERIFIED`.
- The assignment gives the CLI path as `include/cli/commands/discover.ts`. The real path is
  `src/cli/commands/discover.ts`.

The artifact set itself matched the earlier description: four roles, four pinned files, with the
draw's selection and reserve held in one file.

## New research protection

There is one new module, `src/orgunits/orchestrator/researchCohortGuard.ts`. It imports the
classifier's `loadEvaluationCohortRegistry`, `evaluateCohortMembership` and `loadCohortSubject`
unchanged. **It contains no second matcher, no second registry, no hard-coded identity and no
recomputed membership.**

It enforces at two points, through one implementation.

1. **`planOrganisationResearch`** is the organisation-level check. `runOrganisationDiscovery`
   calls it **before `startRun`**, and the CLI dry run calls it too. It does the following, in
   order:
   1. It loads and verifies the pinned registry. This step does not depend on the organisation.
   2. It resolves the requested organisation (`organisations.id`) and requires the requested
      `eche_row_key` to be that organisation's own key.
   3. It lists the exact roots: STRUCTURALLY_VALID website claims and live, unrevoked promotions.
      These queries moved verbatim from `orchestrate.ts`.
   4. It resolves each root's stored authority with the gateway's own `resolveRoot`. It requires
      the root's `eche_row_key` to equal the organisation's key, and a recorded `organisation_id`
      to equal the organisation's id.
   5. It asks the matcher.

   It returns a frozen plan. `runOrganisationDiscovery` executes **only `plan.roots`** and has no
   SQL of its own.
2. **`enforceRootResearchEligibility`** is the per-root check. `runRootAcquisition` calls it right
   after `resolveRoot` and before any robots cache, frontier, pacing or request. It derives the
   subject from the root's own stored authority: the one organisation that holds the root's key,
   cross-checked against the root's `organisation_id`. It then adds every key that the run's fetch
   evidence already names (`loadCohortSubject`) and asks the same matcher. This check protects
   internal callers that skip the organisation-level plan, and any future batch path that reuses
   the root runner.

**Fail-closed.** Each of these refuses, with a stable code `RESEARCH_COHORT_GUARD_REFUSED`, one of
four kinds and a fixed reason:

| Kind | Reasons |
| --- | --- |
| `AUTHORITY_UNAVAILABLE` | `COHORT_METADATA_UNVERIFIED` (missing, altered, malformed or unreadable artifacts, or a missing pin); `GUARD_INTERNAL_ERROR` (any unexpected error, including a database failure, a throwing loader or a malformed registry) |
| `IDENTITY_CONFLICT` | `ORGANISATION_NOT_FOUND`; `ORGANISATION_KEY_MISMATCH`; `ROOT_NAMES_OTHER_ORGANISATION`; `ROOT_ORGANISATION_MISMATCH`; `ROOT_ORGANISATION_UNRESOLVED` (no single owner for a root's key); `DUPLICATE_ROOT_REFERENCE` |
| `PROTECTED_OR_INELIGIBLE` | `COHORT_INELIGIBLE` |
| `IDENTITY_UNVERIFIED` | `RESEARCH_IDENTITY_AUTHORITY_ABSENT` (added in B3.0-R1) |

`COHORT_INELIGIBLE` covers the PROTECTED and CONFLICT verdicts. Before R1 it also covered the
identity-unverified (outside-frame) verdict. R1 separates that verdict out without admitting it:
see "B3.0-R1" below.

There is no override, flag, environment variable or exempt identity. `loadCohortRegistry` is an
optional test seam, with the same pattern as `ClassifyDependencies.loadCohortRegistry`. When it is
omitted, the committed pins decide. The firewall asserts that no production module passes it.

**Non-disclosure.** A refusal never names an organisation, a protected key, a cohort, split or
membership, or any artifact content. Every protection-bearing verdict collapses into one reason,
so a protected organisation and one that conflicts with the artifacts cannot be told apart. That
includes a protected key under a re-ingested UUID. A non-frame organisation is reported as
`RESEARCH_IDENTITY_AUTHORITY_ABSENT`, which is reachable only when nothing involved is protected
(B3.0-R1). The database-only identity checks run before the matcher, so whether a request
fails as an identity conflict never depends on membership. An underlying error is kept only as
`Error.cause`, in process. It is never in the message or in `toJSON()`.

## Organisation identity and roots

- A root URL is never treated as an identity, and hostnames are never compared. Identity comes from
  the stored bindings: `website_claims.eche_row_key`/`organisation_id`, and for a promotion, the
  `eche_row_key`/`organisation_id` of its redirect's fetch observation.
- If any root of an organisation is bound to another organisation, the whole organisation is
  refused, not just that root. So a protected organisation cannot be reached by choosing a
  different website claim or a promotion, and an eligible organisation cannot carry a protected
  organisation's promoted root.
- An unresolvable root stays in the plan with `url: null` and still ends as
  `INVALID_ROOT_AUTHORITY` with zero requests, which is the old behaviour.
- **Check and use.** Roots appended after planning are never executed, because the orchestrator
  issues no root query. An authority change between planning and use is caught by the per-root
  check: the run completes FAILED with a generic summary and no evidence. A revocation between
  planning and use is still refused by `resolveRoot`.

## Dry-run semantics

- An eligible dry run prints the ordinary plan plus `eligibility: "ELIGIBLE"`. It now resolves each
  root through `resolveRoot`, which is a read.
- A refused dry run prints only `{mode, organisationId, eligibility: "REFUSED", refusal: {code,
  kind, reason}, note}` and exits 1. It shows no roots and no key.
- A dry run writes nothing and makes no DNS, HTTP or model call. It is not a token: no function
  accepts a plan, and `--execute` plans and guards again from scratch.
- Through the real CLI (`main`), the committed authority now refuses the integration fixture's
  synthetic organisation. It is not a frame member, so the two existing dry-run CLI assertions
  moved from exit 0 to a generic refusal with exit 1, still with zero writes.

## Protected artifact integrity

No cohort artifact, pin or classifier file changed. The firewall checks
`git diff --name-status 02ddcf2` (open to the working tree until commit), and it shows nothing
under `src/orgunits/classify/`, `docs/evaluation/corpus/` or any pinned path. The committed
artifacts still verify against their pins; this check is verification only and enumerates nothing.
Every test registry is fully synthetic (`src/test/helpers/syntheticCohortRegistry.ts`). It is
built in the artifacts' structural shape and checked by the production
`buildEvaluationCohortRegistry`. No protected identity is used as a fixture.

## Offline testing evidence

- `src/test/unit/researchCohortGuardB30.test.ts` has **67 tests** (51 in B3.0, plus 16 added in R1). They run offline, with a
  recording scripted pool that throws on any statement it does not expect and a counting
  DNS/HTTP transport. They cover:
  - eligibility, and protection of each kind;
  - a protected key under a re-ingested id, and a non-frame organisation;
  - organisation not found, and key mismatch;
  - multiple roots, and a promoted root bound to a protected organisation;
  - a revoked promotion, a binding changed at resolution, a duplicate root and an unresolvable root;
  - no roots;
  - five authority failures, structural inconsistency and the committed-pin default;
  - three internal-error paths;
  - non-disclosure equivalence;
  - `runOrganisationDiscovery` and `runRootAcquisition` called directly. Every refusal shows zero
    writes, zero `startRun`, zero DNS and zero HTTP. On the eligible path, `startRun` is the first
    write.
  - plan non-reuse;
  - the CLI dry run (eligible and refused, JSON and human modes) and `--execute` refusal, with no
    prior dry run and after an eligible one.
- `src/test/integration/orgunitResearchCohortGuard.test.ts` has **9 tests**. They run against real
  research-role SQL with a scripted transport and cover:
  - eligible end-to-end;
  - protected refusal with all six research tables unchanged;
  - refusal of a synthetic organisation by the committed pins;
  - two identity conflicts;
  - an internal caller that creates its own run;
  - a protected promoted root, through the orchestrator and directly;
  - a late root that never joins the run;
  - an authority change caught per root.
- `src/test/integration/orgunitDiscoverCli.test.ts` gained **1 test** (an eligible injected dry run)
  and had **2 tests** updated, as described above.
- Eight existing orchestration integration files (59 call sites) now pass a synthetic loader that
  admits only their own fixture organisations, and `organisationId` where the orchestrator needs
  it. **130/130** pass.

The integration tests ran against one disposable PostgreSQL 16 container:

- local image `postgres:16-alpine` (`cf78e767…`), started with `--pull never`;
- tmpfs data, with no mount, bind or volume;
- `127.0.0.1` on a dynamic port;
- a unique superuser and database, with the working-database URLs unset;
- a scratch `NODE_OPTIONS` preload that refused all non-loopback TCP and DNS.

It logged zero refusals, and the guard also refused the shared cluster's port 55432 outright. The
B3.0 containers were destroyed afterwards. The Docker volume set is identical to the baseline. The
container and network sets differ only by `nwf_d1a_r2_*` objects, which another track's session
created concurrently (12:41–12:43Z); B3.0 did not touch them. The shared `nwf_pe_postgres` was
never connected to.

**Full `npm run validate`** ran against the disposable instance, so integration tests executed
instead of skipping. Migrations-check, typecheck, lint and format-check passed. `npm test` gave
9947 passed, 75 skipped and 31 failed (exit 1). All 31 failures are in four files that B3.0 did
not change, and all are environmental:

- `grants.test.ts`, `orgunitClassifierGrants.test.ts` and `orgunitGrants.test.ts` hard-code the
  superuser `nwf_owner`.
- `orgunitCorpus2DA3EvidenceDurableBinding.test.ts` (28 failures) refuses any database not named
  exactly `nwf_pe_test` (`DATABASE_NAME_UNEXPECTED`).

Rerun in a second disposable container using exactly those names (random password, same isolation
checks), the four files passed **164/164**. `npm run build` was run separately, because validate
stops at the first failing stage, and it exited 0. The firewall suite passed 498/498 (21 files).

That was not one successful full validation. **B3.0-R1 ran exactly one,** after its correction, in
a fresh disposable container:
- container `nwf_b30r1_a280bb26`, image `postgres:16-alpine` `cf78e767…`, `--pull never`;
- the data directory on tmpfs, with `Mounts: []` and no binds;
- `127.0.0.1` only, on a dynamic port;
- superuser `nwf_owner` with a random password, and database `nwf_pe_test`, which existed only
  inside the container;
- every working-database URL unset, and no `.env` in the worktree;
- the scratch `NODE_OPTIONS` preload, which refused all non-loopback TCP and DNS and logged **zero
  refusals**.

Result:
- `npm run db:migrate:test` exited 0.
- `npm run validate` **exited 0**: migrations-check, typecheck, lint and format-check passed;
  `npm test` gave **332 files passed and 5 skipped; 9997 tests passed, 0 failed, 75 skipped**;
  build passed. Duration 533 s.

The 31 earlier failures did not recur, which confirms they were environmental. The container was
then removed with its anonymous volumes, and the Docker volume and container sets matched the
pre-run baseline exactly. Tests that read the committed cohort artifacts are the classifier
guard's own pre-existing suites plus two B3.0 checks. All of them verify pins and print nothing on
success.

## Remaining runtime limitations

- **Frame-bound identity authority.** Protection does not depend on frame membership. Research
  *eligibility* still requires a frame-verified identity, because the frame binding is the only
  identity authority the Engine holds.
  - Rows from a later ECHE artifact refuse as `RESEARCH_IDENTITY_AUTHORITY_ABSENT` until an
    ECHE-successor identity authority is approved (B3.0-R1).
  - A database rebuilt under new UUIDs refuses as `COHORT_INELIGIBLE` until the same approval.
  - Any reviewed pin change, including a legitimate ledger append, refuses **all** research until
    the pins are updated.
- **Application-level only.** `nwf_research` can still `INSERT` directly in SQL. The guard binds
  the code paths. A database-level control would need a migration, which was not authorised.
- **Static bound on callers.** The firewall proves that `startRun`, `runRootAcquisition`,
  `runOrganisationDiscovery` and `authoriseAndFetchPage` have no new production caller. At runtime,
  a caller of `startRun` alone can create an empty run row but cannot obtain evidence: the per-root
  check refuses before any request.
- **Per-root granularity.** An authority change *during* one root's acquisition is not re-checked
  page by page. It takes effect at the next root, and on the next run.
- B3.0 does not resolve H1, does not make v8 production-ready, and does not change Track A's v8
  contract requirement.

## B3.0-R1: protected membership versus research eligibility

Supervising review questioned one sentence in the first version of this record: "only frame members
whose working-database organisation id matches the frame binding can be researched". R1 checked
where that restriction comes from and whether it is a protection rule or an identity rule. It then
separated the two without weakening either.

### What the authority actually establishes

The sources are `src/orgunits/classify/evaluationCohortGuard.ts` (unchanged), migrations 0001 and
0007, and the Frame's own `counts` and field names. No Frame entry was opened or enumerated.

1. **Protection is decidable without a frame match.** `buildEvaluationCohortRegistry` refuses to
   load unless every protected key is a frame key ("Lookup completeness"). For an exact
   `eche_row_key` or organisation id, the matcher's PROTECTED and CONFLICT verdicts are therefore
   complete whether or not the request is a frame member.
2. **The Frame is the whole source-row population, not only the study sample.** It has 6139
   entries, which is every row of ECHE artifact `32e1de18…` (5820 eligible, 319 excluded). The draw
   is a sample from it. In practice the Frame is the GEN1 identity table.
3. **Outside-frame identities.** In the database, an outside-frame identity is an `organisations`
   row whose key is not a frame key. The matcher reports it as
   `EVALUATION_COHORT_IDENTITY_UNVERIFIED`, and only after the protection and conflict checks found
   nothing.
4. **An outside-frame row can have a trusted ECHE identity in principle,** for example a row from a
   later ECHE artifact, and it can have an unambiguous database binding, because
   `organisations.eche_row_key` is UNIQUE (`0001`, `organisations_eche_row_key_uidx`). But nothing
   available to research verifies it. `nwf_research` reads only `organisations` and
   `website_claims` among the Phase 1 tables (`0007`), so it cannot read ingest provenance. The
   frame binding is the only identity authority the Engine holds.
5. **A protected key can come back under a new UUID** after a database rebuild. A changed id with
   the same key is caught by key membership and by the key's binding (CONFLICT). The same id with a
   changed key is caught by the id's binding (CONFLICT).
6. **What exact matching cannot see** is a protected institution that reappears under a new
   source-row key, for example after a changed PIC or Erasmus code in a later ECHE artifact. This is
   why absence from the frame is not proof of anything.
7. **An existing unprotected organisation in the working database is not refused merely for being
   outside the Frame.** The working database was bootstrapped from the Frame's own artifact (A0),
   and the Frame bound its UUIDs. This is recorded, not re-measured: R1 did not connect to the
   working database.
8. **Pre-B3.0 workflows that are now refused:**
   - research on protected organisations (intended);
   - research on any organisation after a database rebuild under new UUIDs;
   - research on rows from any later ECHE artifact;
   - all research after any pin change, including a legitimate ledger append.

   The only production research entry point is `orgunits discover`. No A2 acquisition adapter
   exists on this branch, and the A2 corpus is frozen.
9. **No research-eligibility contract exists outside the classifier guard.** Before B3.0, research
   checked nothing about cohorts.
10. **No frozen rule explicitly forbids outside-frame research.** The classifier guard's rule
    ("absence from every protected list is NOT accepted as proof of anything") is a classifier rule.
    However, no existing rule authorises admitting an outside-frame identity either. Doing so would
    turn the absence of a match into permission, which is what the OWNER brief prohibits.

### The research eligibility policy (V1)

`decideResearchEligibility` is pure, exported and exhaustive over the classifier's verdict kinds. It
reads the unchanged matcher through research's own policy:

| Identity | Classifier verdict (unchanged) | Research outcome |
| --- | --- | --- |
| Frame member, binding matches, in no protected list, run names no protected key | `ALLOWED` | **ELIGIBLE** |
| Protected key (any membership kind) | `PROTECTED` | refused `COHORT_INELIGIBLE` |
| Protected key under a re-ingested UUID | `CONFLICT` | refused `COHORT_INELIGIBLE` |
| Protected UUID under a changed key | `CONFLICT` | refused `COHORT_INELIGIBLE` |
| Unprotected frame key under a conflicting UUID (rebuilt database) | `CONFLICT` | refused `COHORT_INELIGIBLE`; deliberately indistinguishable from the protected re-ingest |
| Non-frame key held by a UUID the artifacts bind elsewhere | `CONFLICT` | refused `COHORT_INELIGIBLE` |
| Key bound to two ids by the artifacts | `CONFLICT` | refused `COHORT_INELIGIBLE` (both ids) |
| Any identity whose run evidence names a protected key | `PROTECTED` | refused `COHORT_INELIGIBLE` (protection is checked before identity) |
| Non-frame key, unbound UUID, nothing protected | `IDENTITY_UNVERIFIED` | refused `RESEARCH_IDENTITY_AUTHORITY_ABSENT` (kind `IDENTITY_UNVERIFIED`) |
| No organisation row (a URL or hostname only) | not reached | refused `ORGANISATION_NOT_FOUND` |
| Root key naming no or several organisations | not reached | refused `ROOT_ORGANISATION_UNRESOLVED` |
| Pins missing, altered, malformed or unreadable, or the loader throws | not reached | refused `AUTHORITY_UNAVAILABLE` |

Being outside the Frame is now reported as **an absent identity authority, not as protection**. It
remains a **refusal**. It is neither proof of protection nor proof of permission.

The `never` branch makes a classifier verdict kind added later fail to compile here, instead of
falling through to permission. Research can never be more permissive than the classifier: ELIGIBLE
implies ALLOWED, which a test asserts.

**Disclosure.** `RESEARCH_IDENTITY_AUTHORITY_ABSENT` is reachable only when no key involved is
protected or conflicting. Every protected key is a frame key, so the reason says only that the key
lies outside the public ECHE source-row set. It never says which cohort anything is in.

### What admitting legitimate new organisations requires (not built)

- **New ECHE rows**, from a later artifact or after a rebuild, need an OWNER-approved,
  SHA-256-pinned **ECHE-successor identity authority**. It must:
  - bind each new row to a verified artifact; research cannot read `organisation_sources`, so the
    binding must be a committed artifact;
  - state a continuity rule that proves no new key is a protected institution under a changed PIC
    or Erasmus code, or else refuses it;
  - rebind frame keys to new UUIDs under review.

  It plugs in at `decideResearchEligibility`'s `IDENTITY_UNVERIFIED` branch and nowhere else.
- **Universities' sub-units, ESN sections, student associations, language clubs and independent
  communities** cannot be represented today at all: `organisations` holds ECHE source rows only,
  and research roots hang off `eche_row_key`. They need a separately authorised **B2 identity
  contract**, which needs schema. **B3.0 does not authorise research on any unverified association
  or community.**

### Execution boundaries

| Boundary | Guarantee | How |
| --- | --- | --- |
| Run creation (`runOrganisationDiscovery`, CLI) | A refused organisation creates no run, writes no evidence, and causes no DNS, HTTP or model call. | `planOrganisationResearch` runs before `startRun`. Behavioural tests assert zero writes and zero DNS/HTTP; the firewall checks the order. |
| Root acquisition (`runRootAcquisition`) | An unauthorised root, or any root of a run whose evidence names a protected key, fetches nothing, even under a caller-supplied run id. | `enforceRootResearchEligibility` runs after `resolveRoot` and before robots, frontier or request. It re-derives the subject from the root's own stored binding and re-reads the registry. |
| Caller-supplied identity | Never trusted. | The organisation id and key must be that row's own. Each root's stored key and id must match. |
| Root mutation after planning | Late roots never join. A binding or authority change fails closed at the next root. | The orchestrator executes only `plan.roots`. Integration tests cover both cases. |
| `startRun` called directly | Can create an empty run row, but never evidence. | A per-root refusal precedes any request. The firewall pins `./run.js` to the orchestrator as its only importer. A future batch path must call `runOrganisationDiscovery` per organisation, and widening that importer list is the reviewed gate. No generic persistence API was changed. |
| Page-by-page | Not re-checked, by design. | One root is bounded to 60 gateway attempts. The authority is committed bytes of the running checkout. Claims are append-only, and a promotion revocation is re-checked by the gateway before every DNS lookup. A per-page registry reload would add I/O and no protection. |
| Direct SQL as `nwf_research` | Not prevented. | Application-level guard only. A database-level control needs a migration, which is not authorised. |

## Commit and firewall closure

`src/test/firewall/phase2bResearchCohortGuard.firewall.test.ts` holds
`REPAIR_TERMINAL_COMMIT = null` while the change is uncommitted. Following the B1.1 precedent
(`4fe03b1` → `02ddcf2`), commit 1 should carry everything, and commit 2 should only pin
`REPAIR_TERMINAL_COMMIT` to commit 1. Both need OWNER authorisation.
