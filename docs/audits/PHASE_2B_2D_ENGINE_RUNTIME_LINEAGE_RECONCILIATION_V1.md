# Engine runtime lineage reconciliation V1 — fetch-policy v7 into the R52 lineage

**Task:** `ENGINE_RUNTIME_LINEAGE_RECONCILIATION_V1`
**Owner markers:** `AUTHORISE_ENGINE_RUNTIME_LINEAGE_RECONCILIATION_V1`,
`ADOPT_ALREADY_APPROVED_FETCH_POLICY_V7_RUNTIME_SEMANTICS_IN_CANONICAL_R52_ENGINE_LINEAGE`
**Branch:** `feat/engine-runtime-lineage-reconciliation-v1`, from the exact R52
terminal `b1dfd82542e7dfb749d5c36063ea750647428a12`
**Record:** `docs/evaluation/PHASE_2B_2D_ENGINE_RUNTIME_LINEAGE_RECONCILIATION_V1.json`
**Terminal:** `ENGINE_RUNTIME_LINEAGE_RECONCILED_FETCH_POLICY_V7_READY_FOR_OPERATOR_ENTRY_POINT`

This is non-evaluation engineering, released by R52. It is a source
reconciliation and nothing more. It runs no acquisition, issues no network
request, writes no database row, changes no classifier semantics and resumes
no human review.

## 1. Why the runtime was split

The R52 engineering census recorded three engine lineages:

| ref                                     | fetch policy               |
| --------------------------------------- | -------------------------- |
| `origin/main` (`7adf895`)               | `orgunit-fetch-policy-v1`  |
| R51/R52 lineage (`b1dfd82`)             | `orgunit-fetch-policy-v6`  |
| A2 acquisition branch tip (`29d0d48`)   | `orgunit-fetch-policy-v7`  |

v7 (ADR 0016) was approved and landed on the A2 acquisition branch while the
A3/A4 governance work continued on its own lineage from an earlier A2→A3
integration tip. So no single ref carried both the accepted R52 governance
and the newest runtime. Every later operator slice (classifier entry point,
read models, API, UI, deployment) needs one engine build to target.

## 2. Why the A2 tip is NOT merged

The A2 branch is source provenance for one already-approved runtime repair,
not the destination lineage. After the v7 commit it carries 176 further
commits: live windows, adjudications, reserve and replacement-ledger changes,
Generation-2 methodology and the corpus freeze. None of that is a runtime
change (no non-test `src/` byte changed on A2 after `e0166e0`), and all of it
is acquisition governance that R52 does not adopt. Merging would import it
wholesale. So nothing was merged and no later A2 commit was imported, and the
v7 commit itself was not cherry-picked as a commit either: its diff was
applied as an exact patch. The reconciliation proof asserts that neither the
A2 tip nor `e0166e0` is an ancestor of this branch.

## 3. The source commit chosen

| fact                       | value                                                                         |
| -------------------------- | ----------------------------------------------------------------------------- |
| source commit              | `e0166e0f787e3bba00b35271cab6717eb65a202c`                                    |
| subject                    | `feat(2b): permit the bare trailing-slash robots redirect continuation (v7)` |
| parent (single)            | `a1ef1e2dda57d66848052914a36508a5dd5999b4`                                    |
| ancestor of A2 tip         | yes (`29d0d486…`), 176 commits before it                                      |
| A2 scope-closure follow-up | `6301e95` — pins the v7 firewall's `REPAIR_TERMINAL_COMMIT` to `e0166e0`      |

`e0166e0` touched 16 files: the three production files, ADR 0016, the v7
repair record, two new test files and nine pre-existing test files.

## 4. Source-parent equality proof

Recomputed from git objects before any change, after a fresh fetch:

| file                                  | R52 blob   | `a1ef1e2` blob | `e0166e0` blob |
| ------------------------------------- | ---------- | -------------- | -------------- |
| `src/orgunits/web/policy.ts`          | `6cf5c588` | `6cf5c588`     | `f0d16da2`     |
| `src/orgunits/web/robots.ts`          | `e659aefc` | `e659aefc`     | `a44c0567`     |
| `src/orgunits/web/robotsAuthority.ts` | `a7d62779` | `a7d62779`     | `44ff45be`     |

The same equality held for all nine pre-existing test files `e0166e0` touched
(R52 blob = parent blob), and the five files `e0166e0` added were absent at
both. So none of them picked up a later R52 change, and the whole source diff
`a1ef1e2..e0166e0` applied with no conflict. After application, every one of
the 16 files equals its `e0166e0` blob, except the scope firewall, which
equals its `6301e95` blob (one line different, §8).

SHA-256 manifest (bound in the record and in
`src/test/unit/engineRuntimeLineageReconciliationV1.test.ts`):

- `policy.ts`: parent/R52
  `affe97f6736831e8e1a57417c1d6b80f254b9dd71d869fae4d4e8a8ce22d7ea9`
  (20,581 B) → v7/reconciled
  `e7f274e3c1ddcb0433fcaeec9aebaafa37f2623603d5d241588bedfe73de7b3c`
  (24,532 B)
- `robots.ts`: parent/R52
  `4748984b29c19d8bef8c2d5fea1b168c6a6030f35f4af4118ab4bd1f10c2d481`
  (40,360 B) → v7/reconciled
  `5e89503c00a80d33c9c341a774a9b46a837e46ddce18dbf6d41e857e24a4e0c4`
  (44,548 B)
- `robotsAuthority.ts`: parent/R52
  `5057ca454e92abcb41d32eda878733431a7e4a9d67513d4ea73f91ab5d7051e9`
  (10,487 B) → v7/reconciled
  `061ba7efeca1d63538bb557b9b18ef146146f791724c99c92013b15a8c84a14b`
  (15,415 B)

The test recomputes these digests from the working tree, from R52, from
`a1ef1e2` and from `e0166e0`. If anyone
later changes those semantics and still claims v7 equivalence, the test fails.

## 5. The exact v7 capability

The only semantic axis that moved is the **target path of a host-issued
robots redirect continuation**: one canonical policy path became an explicit
two-member set.

- **Initial (bootstrap) request:** `/robots.txt` only.
  `RobotsAuthorisation.forRobotsTxtBootstrap` is byte-for-byte the R52/v6
  method. It still refuses `/robots.txt/`, any query and any fragment.
- **Redirect continuation:** `RobotsAuthorisation.CONTINUATION_PATHS` is the
  frozen literal list `['/robots.txt', '/robots.txt/']`. There is no
  `startsWith`, regex or normalisation. `/robots.txt//`, `/robots.txt/index`,
  `/robots.txt/robots.txt`, `/ROBOTS.TXT`, `/robots.txt.` and
  `/a/robots.txt/` are all refused.
- **Separate authority:** `RobotsAuthorisation.forRobotsTxtRedirectContinuation(url)`
  mints a genuine branded authority with decision `NOT_APPLICABLE`, rule
  `null`, scoped byte-for-byte to `url`. It accepts only those two paths, with
  no query and no fragment, and it authorises no ordinary page. There is no
  generic `createRobotsAuthorisation('ALLOWED')`.
- **Request role:** `PolicyRequestRole = 'BOOTSTRAP' | 'REDIRECT_CONTINUATION'`
  picks the factory. The bounded retry passes the same role to both attempts,
  so a continuation is never retried under bootstrap authority and initial
  discovery never runs under continuation authority.
- **`continuationTargetFor`:** the only code change is the path test, from
  `requestPath !== '/robots.txt'` to `!CONTINUATION_PATHS.includes(requestPath)`.
  These conditions are unchanged: usable redirect facts, request and target
  validation, same registrable domain, same scheme or http→https upgrade, no
  downgrade, no credentials, no malformed target, no self-redirect. The
  host-budget and request-budget logic is also unchanged.
- **Bounds unchanged:** `MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS = 1` and
  `MAX_ROBOTS_TRANSPORT_RETRIES_PER_POLICY_RESOLUTION = 1`. A continuation
  that answers another 3xx stays unreadable.
- **Gateway unchanged:** `gateway.ts` follows zero redirects. The continuation
  is still a separate, fully revalidated request decided in `robots.ts`.
- **Initial authority:** a policy retrieved through an admissible continuation
  governs the initial authority for that one robots resolution. The target is
  not promoted to a root, a claim or an identity.

`FETCH_POLICY_VERSION = 'orgunit-fetch-policy-v7'`. There is no v8 and no
alias, and v1–v6 evidence stays historical. v7 needs no migration, and none
was added.

## 6. Exact files adopted

Production (exact `e0166e0` bytes): `src/orgunits/web/policy.ts`,
`src/orgunits/web/robots.ts`, `src/orgunits/web/robotsAuthority.ts`.

Design and provenance (exact `e0166e0` bytes):

- `docs/adr/0016-trailing-slash-robots-redirect-continuation.md` — SHA-256
  `7067466be7755ab46501ec0da73b72b6931e6f6bcc546aea7fce62c444396391`,
  18,853 bytes, not rewritten.
- `docs/evaluation/PHASE_2B_2D_A2_ROBOTS_TRAILING_SLASH_FETCH_POLICY_V7_REPAIR_V1.json`
  — SHA-256 `4231660bd5eb5ce0f20e8a235b5d687b544b18ca595e92979c01a2f19ae92a49`,
  24,734 bytes.

**Decision on the repair record.** The exact v7 production comments name the
repair record's path. Those comments are part of the exact bytes, so the
production files would stay exact without it, but the reference would dangle.
Importing the record's exact bytes keeps the provenance chain self-contained,
which the task prefers, and violates no repository invariant: the full suite
is green with it present. It is treated strictly as
`HISTORICAL_SOURCE_PROVENANCE_FOR_ALREADY_APPROVED_V7_RUNTIME`. It does not
reopen A2, authorise acquisition or a live revalidation, import later A2
state, or supersede R52 governance (its own `thisFileAuthorises` is `[]`).
Two A2 Window-07 records it binds by hash, path and commit are **not**
imported. Those commits stay reachable in the repository's object store as
historical source facts.

## 7. How the existing R52 tests were preserved

- **R52 pin (first commit).** `orgunitCorpus2DA4R52HumanReviewDeferral.test.ts`
  previously judged `R51..HEAD` plus the working tree. It now judges the exact
  range `R51_TERMINAL..R52_TERMINAL` and file bodies at the R52 tree. No
  assertion was weakened. These were added: the permitted surface is now an
  exact equality, R52's commit count (4) is pinned, R52 carried v6 and did
  not contain `e0166e0`, the R52 records equal their R52 blobs, and no
  response file existed at R52. The R49/R50/R51 SHA-256 pins and the
  zero-label template check still run against the working tree, so they keep
  proving that those artifacts are byte-unchanged now.
- **Pre-existing v7-touched tests.** All nine had no later R52 change, so the
  v7 delta applied exactly. Nothing newer was overwritten with an older A2
  copy.
- **New v7 tests.** `orgunitRobotsTrailingSlash.test.ts` (integration) is
  ported at exact `e0166e0` bytes. `phase2bRobotsTrailingSlash.firewall.test.ts`
  is ported at its `6301e95` bytes: the A2 lineage's own one-line pin of
  `REPAIR_TERMINAL_COMMIT` to `e0166e0`. Without that pin the firewall would
  judge `a1ef1e2..HEAD`, which on this lineage spans all the A3/A4 governance
  work. With it, the firewall judges the v7 repair at its own terminal, as its
  authors intended.
- **Historical provenance.** The v7 delta to
  `orgunitClassifyHistoricalFetchPolicyProvenance.test.ts` keeps proving that
  the frozen 2D2C classifier records still name their historical acquisition
  policy (v1 where recorded). No freeze was edited.

## 8. Non-changes

- **Classifier:** no byte under `src/orgunits/classify/`. No change to the
  prompt, taxonomy, output schema, decision rules, model selection,
  thresholds or candidate ranking.
- **Orchestrator:** no byte under `src/orgunits/orchestrator/`. v7's
  continuation is charged by the existing request accounting.
- **Gateway:** `src/orgunits/web/gateway.ts` is unchanged.
- **Migrations:** the set is exactly R52's (`0001`–`0012`). There is no
  `0013` and no edit.
- **Main:** untouched. Nothing was merged into it or fast-forwarded.

## 9. Evaluation and human-review boundary

No evaluation or human work happened. Human review stays deferred under R52
(authorised, not executed, 222 items pending, zero labels). DEV_CONFIRM and
FINAL_HOLDOUT stay sealed. A5 is not authorised. Every R49/R50/R51/R52
artifact under `docs/` is byte-unchanged. The proof test asserts that no file
that existed under `docs/` at R52 was modified or deleted, and that the only
additions are ADR 0016, the v7 repair record, this audit and its record.

## 10. No live request

The historical slot-66 revalidation was not replayed. No institution was
contacted, no DNS lookup or HTTP request was issued, and nothing was written
to `nwf_pe`. Every v7 integration test uses a scripted transport against
`nwf_pe_test`.

## 11. Resulting canonical engine lineage

`feat/engine-runtime-lineage-reconciliation-v1` = R52 governance + fetch-policy
v7 runtime, descended single-parent from `b1dfd82`. Pending owner review, it
is the one engine build that later operator slices target. `main` stays
separately behind until an explicit landing decision.

## 12. Next operator slice

`CLASSIFIER_OPERATOR_ENTRY_POINT_V1`: a bounded operator command that invokes
the existing `runOrganisationClassification` (`src/orgunits/classify/orchestrate.ts`)
for one organisation/run context. Its production authority, inputs,
idempotency, persistence and readback are designed in that slice. It is not
implemented here.
