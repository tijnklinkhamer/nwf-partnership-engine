# Phase 2B-2D — A2 transport-failure observability, design V1

- **Status:** DESIGN COMPLETE. Nothing implemented, nothing applied.
- **Owner decision this answers:**
  `AUTHORISE_PHASE_2B_2D_A2_TRANSPORT_FAILURE_OBSERVABILITY_DESIGN_V1`
- **Design only.** No migration was created or applied, no production file was
  edited, no institution network was touched, no DNS lookup was performed, no
  acquisition was executed, no reserve was consumed.
- **Source of the taxonomy:**
  `docs/audits/PHASE_2B_2D_A2_ACQUISITION_RESILIENCE_REASSESSMENT_V1.md`
  (sha256 `0aebe3b40d21b8c736db96852fbd257129dbe3bf63b2c99e08d5e860fe0e4bd0`)
  and
  `docs/evaluation/PHASE_2B_2D_A2_ACQUISITION_RESILIENCE_REASSESSMENT_RESULT_V1.json`
  (sha256 `d3a2343383b6249eaf91a52d7812f7c82882e15ac771c0927dbc433fa523082d`),
  both verified byte-for-byte at the head of this task and both durable on
  `origin/feat/phase2b-2d-a2-batch-02` at commit `e206673`.

---

## 1. What this design is for

The reassessment selected class
**C — `TRANSPORT_OBSERVABILITY_MUST_BE_FIXED_BEFORE_RETRY_POLICY`**. Its finding
was not that `error_kind` is missing. It is that two of its members are too
coarse to support any retry decision:

- `TLS_FAILURE` currently contains one plausibly-transient condition
  (`ERR_TLS_HANDSHAKE_TIMEOUT`) and seven conditions where re-issuing the exact
  same request under the same secure posture is pointless by construction —
  an expired certificate does not un-expire on the second attempt.
- `DNS_FAILURE` currently contains an authoritative name failure, a temporary
  resolver failure, and the gateway's own empty-answer branch, and **discards
  the runtime code that separates them**.

This design adds the smallest durable evidence that makes a future retry policy
*decidable*. It does not decide it.

**Evidence, not policy.** `error_subtype` records what the runtime reported.
Whether a given class may be retried is a later fetch-policy decision, taken
under its own owner authorisation and its own policy version. The evidence
schema is designed so that such a decision can change repeatedly without
rewriting a single row — which matters here more than usual, because these rows
are physically un-rewritable (§7).

---

## 2. The frozen vocabulary — exactly eight members

The reassessment produced an exact eight-member proposal
(`proposedMinimalDurableSubtypeSchema.members`). This design adopts **those
eight members, unchanged, under their exact identifiers**. No member was added,
removed or renamed.

| # | `error_subtype` | valid only when `error_kind` is |
|---|---|---|
| 1 | `TLS_HANDSHAKE_TIMEOUT` | `TLS_FAILURE` |
| 2 | `TLS_CERT_INVALID` | `TLS_FAILURE` |
| 3 | `TLS_PROTOCOL_INCOMPATIBLE` | `TLS_FAILURE` |
| 4 | `TLS_OTHER` | `TLS_FAILURE` |
| 5 | `DNS_NAME_NOT_FOUND` | `DNS_FAILURE` |
| 6 | `DNS_TEMPORARY_FAILURE` | `DNS_FAILURE` |
| 7 | `DNS_NO_ADDRESS_RETURNED` | `DNS_FAILURE` |
| 8 | `DNS_OTHER` | `DNS_FAILURE` |

Every other `error_kind` carries `error_subtype = NULL`. In particular
`CONNECT_TIMEOUT`, `READ_TIMEOUT`, `CONNECTION_REFUSED` and `CONNECTION_RESET`
are **not** duplicated into a subtype: their `error_kind` is already the exact
category a retry rule would key on, and mirroring them would add a second
spelling of the same fact.

### 2.1 Two names that promise less than they appear to

Both are recorded here rather than fixed, because fixing them would mean
inventing identifiers outside the frozen proposal.

- **`DNS_NAME_NOT_FOUND` is broader than "the name does not exist".** Verified
  on this repository's pinned runtime (Node 24.18.0, §4.2): Node maps *both*
  `EAI_NONAME` (uv `-3008`, authoritative NXDOMAIN) *and* `EAI_NODATA` (uv
  `-3007`, the name exists but publishes no address of either requested family)
  onto the single string `ENOTFOUND`. The distinction is destroyed inside Node
  before this repository can observe it. The member therefore means exactly
  *"Node reported `ENOTFOUND`"*, and the column comment says so.
- **`TLS_PROTOCOL_INCOMPATIBLE` includes `EPROTO`.** `EPROTO` is broader than
  "wrong TLS version" and the reassessment itself listed it among the
  catch-alls whose contents cannot be enumerated. It is mapped here as the
  frozen proposal specifies. The imprecision is biased safely: it labels the
  condition *non-retryable*, so the worst case is a retry that is never
  attempted, never a request that should not have been issued.

Deliberately deferred, exactly as the reassessment deferred it: splitting
`TLS_CERT_INVALID` into name-mismatch / expired / untrusted-chain. It costs
nothing and buys nothing, because all three are equally non-retryable. It is
left out on purpose, not by omission. A second candidate surfaced by this
design's own runtime verification — separating `EAI_FAIL` (SERVFAIL) out of
`DNS_OTHER` — is deferred on the same grounds and recorded in §4.2 so it is not
lost.

---

## 3. Where the column goes

`orgunit_fetch_observations`, one new column. Repository inspection confirms
this is the mechanically correct table and the only one:

- it is the single durable grain for one HTTP **attempt**, which is the grain a
  transport failure has;
- it already carries `error_kind`, so the subtype sits next to the value it
  refines and a CHECK can relate the two in one expression;
- `orgunit_page_evidence` and `orgunit_page_candidates` exist only for
  successful 2xx HTML responses, so a transport failure never reaches them;
- `orgunit_redirect_observations` describes a 3xx edge, which by definition is
  a response, not a transport failure;
- the classifier tables (migration 0009) have their own unrelated `error_kind`
  for classifier-run outcomes and must not be confused with this one.

---

## 4. The exact runtime mapping

The mapping is a **pure, total function**. Total is the operative word: it
returns a member for every input it can be given, using the two `*_OTHER`
catch-alls, and never returns "could not classify". §7 depends on that.

### 4.1 TLS — from `classifyNodeError` in `src/orgunits/web/gateway.ts`

The nine codes below are the exact contents of the landed `TLS_ERROR_CODES` set
(`gateway.ts:283-293`), read from the file, not recalled.

| Node `error.code` | existing `error_kind` | proposed `error_subtype` |
|---|---|---|
| `ERR_TLS_HANDSHAKE_TIMEOUT` | `TLS_FAILURE` | `TLS_HANDSHAKE_TIMEOUT` |
| `ERR_TLS_CERT_ALTNAME_INVALID` | `TLS_FAILURE` | `TLS_CERT_INVALID` |
| `CERT_HAS_EXPIRED` | `TLS_FAILURE` | `TLS_CERT_INVALID` |
| `DEPTH_ZERO_SELF_SIGNED_CERT` | `TLS_FAILURE` | `TLS_CERT_INVALID` |
| `SELF_SIGNED_CERT_IN_CHAIN` | `TLS_FAILURE` | `TLS_CERT_INVALID` |
| `UNABLE_TO_VERIFY_LEAF_SIGNATURE` | `TLS_FAILURE` | `TLS_CERT_INVALID` |
| `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` | `TLS_FAILURE` | `TLS_CERT_INVALID` |
| `ERR_SSL_WRONG_VERSION_NUMBER` | `TLS_FAILURE` | `TLS_PROTOCOL_INCOMPATIBLE` |
| `EPROTO` | `TLS_FAILURE` | `TLS_PROTOCOL_INCOMPATIBLE` |

**The two catch-all branches.** `classifyNodeError` also admits anything
matching `code.startsWith('ERR_TLS_')` or `code.startsWith('ERR_SSL_')` as
`TLS_FAILURE`. Any such code **not** named in the table above maps to
`TLS_OTHER`.

`TLS_OTHER` is the honest name for that branch and its semantics are fixed in
the column comment as *"a TLS-family condition this build's taxonomy does not
name"*. It must never be read as transient. This is the §7 requirement of the
brief discharged directly: an unseen future TLS code cannot be silently
collapsed into a subtype whose semantics imply retryability, because the only
subtype it can land in is the one that implies the opposite.

**Evaluation order is load-bearing.** The exact-code table must be consulted
*before* the prefix catch-alls, or `ERR_TLS_HANDSHAKE_TIMEOUT` — the single
plausibly-retryable member, and the whole reason the TLS split exists — would
be swallowed by `ERR_TLS_*` into `TLS_OTHER`. Today's `classifyNodeError` ORs
the set test and the prefix tests into one condition, so order is invisible
there; for the subtype it is decisive. Test B pins it.

### 4.2 DNS — verified against Node 24.18.0, with no lookup performed

The brief forbids assuming Node codes. They were verified by **static
introspection of the installed runtime only** — `util.getSystemErrorMap()` and
a direct construction of `internal/errors.DNSException` with the numeric uv
errno that `lib/dns.js` actually passes. No `dns.lookup` was called, no query
left this machine, no institution was contacted.

Result, on Node 24.18.0 (`.node-version` pins 24.18.0):

| uv errno | uv name | `err.code` Node exposes | proposed `error_subtype` |
|---|---|---|---|
| `-3007` | `EAI_NODATA` | **`ENOTFOUND`** | `DNS_NAME_NOT_FOUND` |
| `-3008` | `EAI_NONAME` | **`ENOTFOUND`** | `DNS_NAME_NOT_FOUND` |
| `-3001` | `EAI_AGAIN` | `EAI_AGAIN` | `DNS_TEMPORARY_FAILURE` |
| `-3000` | `EAI_ADDRFAMILY` | `EAI_ADDRFAMILY` | `DNS_OTHER` |
| `-3002` | `EAI_BADFLAGS` | `EAI_BADFLAGS` | `DNS_OTHER` |
| `-3013` | `EAI_BADHINTS` | `EAI_BADHINTS` | `DNS_OTHER` |
| `-3003` | `EAI_CANCELED` | `EAI_CANCELED` | `DNS_OTHER` |
| `-3004` | `EAI_FAIL` | `EAI_FAIL` | `DNS_OTHER` |
| `-3005` | `EAI_FAMILY` | `EAI_FAMILY` | `DNS_OTHER` |
| `-3006` | `EAI_MEMORY` | `EAI_MEMORY` | `DNS_OTHER` |
| `-3009` | `EAI_OVERFLOW` | `EAI_OVERFLOW` | `DNS_OTHER` |
| `-3014` | `EAI_PROTOCOL` | `EAI_PROTOCOL` | `DNS_OTHER` |
| `-3010` | `EAI_SERVICE` | `EAI_SERVICE` | `DNS_OTHER` |
| `-3011` | `EAI_SOCKTYPE` | `EAI_SOCKTYPE` | `DNS_OTHER` |

Plus two non-code paths:

| runtime condition | `error_kind` | `error_subtype` |
|---|---|---|
| `transport.resolveHostname` resolved, but `addresses.length === 0` (`gateway.ts:834`) | `DNS_FAILURE` | `DNS_NO_ADDRESS_RETURNED` |
| the resolver threw something carrying no usable code | `DNS_FAILURE` | `DNS_OTHER` |

Three consequences worth stating plainly:

1. **`EAI_NONAME` is listed in the reassessment's proposal but is not
   producible through `dns.lookup` on Node 24.** It is retained in the
   recogniser defensively — it costs nothing and survives a future Node change
   — but the *live* path is `ENOTFOUND`, and the test matrix asserts the
   `ENOTFOUND` path, not the unreachable one.
2. **`ENOTFOUND` conflates NXDOMAIN with no-address-of-this-family.** See §2.1.
   Nothing in this repository can undo that; pretending otherwise would be the
   guess rule 2 forbids.
3. **`EAI_FAIL` (SERVFAIL) is arguably a resolver failure rather than a name
   failure**, and a future taxonomy revision might separate it. It is left in
   `DNS_OTHER` here because that is where the frozen eight-member proposal puts
   it and because `DNS_OTHER` derives as non-retryable, which is the safe side.
   Recorded so the option is not lost.

### 4.3 The blocker this exposes, and the only honest fix

**The DNS code is destroyed at the transport seam today.**
`nodeWebTransport.resolveHostname` (`gateway.ts:600-612`) catches the lookup
error, reads `error.code`, interpolates it into a human sentence, and throws
`new DnsResolutionError(\`${hostname} did not resolve (${code})\`)`. The
structured code is gone; only prose survives, and that prose contains the
hostname.

Recovering the subtype by parsing that sentence is rejected outright: it would
make a durable evidence value depend on unstable wording, and it would be the
raw-error-text path §16 of the brief forbids in a thin disguise.

The fix is one line of structure:

```ts
export class DnsResolutionError extends Error {
  constructor(
    message: string,
    /** The runtime's own code, IN MEMORY ONLY. Never persisted; only its
        normalised subtype is. */
    readonly code: string,
  ) { ... }
}
```

The second parameter is **required**, not optional. Optional would make a
future production transport that forgets to pass it degrade silently to
`DNS_OTHER` — a wrong value that looks like a right one. Required makes the
obligation structural, at the cost of two test call sites
(`src/test/integration/orgunitGateway.test.ts:775` and `:792`), which is a
mechanical edit with no production risk. This mirrors the posture the
repository already takes with `RobotsAuthorisation`: enforce the contract in
the type system rather than by convention.

---

## 5. The database CHECK, and a three-valued-logic trap in the obvious form

### 5.1 The constraint

```sql
CONSTRAINT orgunit_fetch_observations_error_subtype_chk
    CHECK (error_subtype IS NULL
           OR (error_kind IS NOT DISTINCT FROM 'TLS_FAILURE'
               AND error_subtype IN ('TLS_HANDSHAKE_TIMEOUT', 'TLS_CERT_INVALID',
                                     'TLS_PROTOCOL_INCOMPATIBLE', 'TLS_OTHER'))
           OR (error_kind IS NOT DISTINCT FROM 'DNS_FAILURE'
               AND error_subtype IN ('DNS_NAME_NOT_FOUND', 'DNS_TEMPORARY_FAILURE',
                                     'DNS_NO_ADDRESS_RETURNED', 'DNS_OTHER')))
```

### 5.2 Why `IS NOT DISTINCT FROM` and not `=`

The brief sketches the invariant with plain equality. **That form does not hold,
and the gap is exactly the case the brief asks to make unrepresentable:
`error_kind IS NULL` carrying a subtype.**

A PostgreSQL `CHECK` passes when the expression is `TRUE` *or* `NULL`. With
plain `=`, a row with `error_kind = NULL, error_subtype = 'TLS_OTHER'` evaluates
`FALSE OR NULL OR NULL` → `NULL` → **accepted**.

Verified, not reasoned about, against the real PostgreSQL 16.15 this repository
runs — as a read-only `SELECT` over a `VALUES` list, with no DDL and no table
touched:

| `error_kind` / `error_subtype` | naive `=` form | `IS NOT DISTINCT FROM` form |
|---|---|---|
| `TLS_FAILURE` / `TLS_CERT_INVALID` | accept | accept |
| `DNS_FAILURE` / `DNS_TEMPORARY_FAILURE` | accept | accept |
| `TLS_FAILURE` / `DNS_OTHER` | reject | reject |
| `CONNECT_TIMEOUT` / `TLS_OTHER` | reject | reject |
| **`NULL` / `TLS_OTHER`** | **ACCEPT — the hole** | **reject** |
| `NULL` / `NULL` | accept | accept |
| `TLS_FAILURE` / `NULL` | accept | accept |
| `TLS_FAILURE` / `NOT_IN_VOCABULARY` | reject | reject |

`IS NOT DISTINCT FROM` returns `TRUE`/`FALSE` and never `NULL`, so every
disjunct is two-valued and the whole expression is two-valued. The invariant
then holds for every combination, including the one the naive form misses.

### 5.3 What the constraint does and does not enforce

It enforces, in the database and not in application code:

- the vocabulary is closed at exactly eight members;
- a subtype may only accompany the kind it refines;
- no subtype may accompany `error_kind IS NULL` or any unrelated kind.

It deliberately does **not** enforce "a transport-kind row must carry a
subtype". See §7.

---

## 6. The migration

`migrations/0012_transport_failure_subtype.sql` — the next sequential number;
the guard in `scripts/` requires `NNNN_lower_snake_case.sql` and strict
sequence from 0001, and 0011 is the current head.

```sql
ALTER TABLE orgunit_fetch_observations
    ADD COLUMN error_subtype text;

ALTER TABLE orgunit_fetch_observations
    ADD CONSTRAINT orgunit_fetch_observations_error_subtype_chk
    CHECK (...as §5.1...);

COMMENT ON COLUMN orgunit_fetch_observations.error_subtype IS '...';
```

- **Type:** `text`, matching every other taxonomy column on this table.
- **Nullability:** nullable, mandatory (§7).
- **Index:** none. The table holds 204 rows; `error_kind` itself is unindexed;
  an index here would be speculative capacity for a query nobody has written.
- **Validation cost:** `ADD CONSTRAINT` validates the 204 existing rows, all of
  which have `error_subtype IS NULL` and satisfy the first disjunct trivially.
  `NOT VALID` + a later `VALIDATE CONSTRAINT` is available but unnecessary at
  this size.
- **No `UPDATE`. No backfill. No destructive `ALTER`.** The migration contains
  no DML of any kind. Test G asserts this by inspecting the file.
- **No `GRANT`.** See §8.

**Column comment, verbatim intent.** The comment must carry four things the SQL
cannot: that the value is EVIDENCE and never a retry verdict; that `NULL` means
`SUBTYPE_NOT_CAPTURED_AT_EXECUTION_TIME` and nothing else; that
`DNS_NAME_NOT_FOUND` means "Node reported `ENOTFOUND`", which covers both
NXDOMAIN and no-address-of-family; and that `TLS_OTHER` / `DNS_OTHER` mean "not
named by this build's taxonomy" and must never be read as transient.

---

## 7. `NULL` is deliberate, and it means exactly one thing

The 204 existing `orgunit_fetch_observations` rows keep `error_subtype = NULL`
permanently. Of those, four carry a transport `error_kind` — measured, not
assumed, against the working database:

| `error_kind` | rows |
|---|---|
| *(none — an HTTP response arrived)* | 200 |
| `TLS_FAILURE` | 2 |
| `DNS_FAILURE` | 1 |
| `READ_TIMEOUT` | 1 |
| **total** | **204** |

**Historical `NULL` means `SUBTYPE_NOT_CAPTURED_AT_EXECUTION_TIME`.** It does
not mean `UNKNOWN_RETRYABILITY`, it does not mean `TRANSIENT`, and it is not
evidence of anything about the host. Nothing may be inferred from duration,
HTTP status, IP family, a neighbouring attempt, the institution's identity, a
later successful acquisition, or the current state of DNS or TLS anywhere.

### 7.1 Why `NULL` stays unambiguous without a version marker

The reassessment raised a real objection: a `NULL` could mean either "written
before the column existed" *or* "the writing build could not classify the
condition", and those are different findings. Its proposed remedy was a rule
that `error_subtype` be NOT NULL for every transport-kind row after the
migration.

**That remedy is not needed, and the database form of it is actively harmful.**

It is not needed because the mapping function is **total** (§4): every TLS and
DNS path terminates in a member, with `TLS_OTHER` / `DNS_OTHER` absorbing
everything unrecognised. "Could not classify" is not a reachable outcome, so it
is not a meaning `NULL` can carry. A `NULL` on a transport-kind row can only
mean the row predates the implementation. The ambiguity is dissolved by
totality rather than patched by a marker.

The database form is harmful because a `CHECK` cannot express "after the
migration" without hard-coding a wall-clock boundary against `created_at`. Such
a constraint would make the migration a **breaking** change: the moment it is
applied, any build not yet carrying the subtype code would have its `INSERT`s
rejected, turning an observability gap into an acquisition outage and forcing
code-first deployment. That trades a harmless absence of evidence for a live
failure. Rejected.

Totality is therefore a **code invariant, pinned by tests** (matrix items A–C),
not a schema constraint. The schema's job is to make wrong values impossible;
making the right value always present is the writer's job, and the writer is a
single pure function with exhaustive tests.

### 7.2 Backfill is not merely forbidden — it is impossible

Verified against the working database rather than inferred from the migration
text. The ACL on `orgunit_fetch_observations` is:

```
nwf_owner=arwdDxt/nwf_owner
nwf_research=ar/nwf_owner      <- a = INSERT, r = SELECT. No w (UPDATE), no d (DELETE).
nwf_readonly=r/nwf_owner
nwf_classifier=r/nwf_owner
```

The role that performs acquisition holds append and read and nothing else, so
it could not rewrite a historical row even if a later design wanted it to. This
is rule 15 as a measured fact, not a remembered one.

---

## 8. Privileges: zero change required

No migration in this repository contains a column-level `GRANT` — checked
across all eleven. Verified further against the live catalogue: `pg_attribute.attacl`
is `NULL` for every column of `orgunit_fetch_observations`, so no column-level
ACL exists and the table-level ACL alone governs. PostgreSQL applies a
table-level privilege to columns added later, so
`GRANT SELECT, INSERT ON orgunit_fetch_observations TO nwf_research`
(migration 0007) covers `error_subtype` from the moment it exists.

**The migration therefore contains no `GRANT` and no `REVOKE`, and no `UPDATE`
authority is broadened anywhere.**

One consequence to note rather than act on: `nwf_classifier` holds table-level
`SELECT` on this table (migration 0009) and so gains read access to the new
column automatically. That is harmless — the column is a bounded enum with no
free text, no hostname and no PII, and the classifier reads page evidence, not
fetch-observation error columns. No design change follows; it is recorded so it
is not discovered later as a surprise.

---

## 9. Persistence path and the exact production change surface

```
Node transport error
  └─ TLS: classifyNodeError(error)                        gateway.ts:295
  └─ DNS: nodeWebTransport.resolveHostname → DnsResolutionError   gateway.ts:600
       ↓
  TransportOutcome { kind: 'FAILURE', failure, detail }    gateway.ts:159
       ↓
  AttemptRecord { errorKind, errorDetail, ... }            gateway.ts:626
       ↓
  persist() → insertFetchObservation(...)                  gateway.ts:941
       ↓
  INSERT INTO orgunit_fetch_observations (...)             observations.ts:131
       ↓
  WebAttemptResult { errorKind, ... }                      gateway.ts:210
```

### 9.1 Production files a later implementation would touch — three

| file | change |
|---|---|
| `src/orgunits/web/observations.ts` | add `export type TransportFailureSubtype` (the eight members); add `errorSubtype` to `FetchObservationRow`; add the column and one bind parameter to the `INSERT` |
| `src/orgunits/web/gateway.ts` | add `code` to `DnsResolutionError`; pass it from `nodeWebTransport.resolveHostname`; add the pure subtype mapping; widen the `FAILURE` outcome and `AttemptRecord`; set the subtype on both DNS branches; pass it to `insertFetchObservation`; expose it on `WebAttemptResult` |
| `migrations/0012_transport_failure_subtype.sql` | new file (§6) |

Whether the pure mapping lives in `gateway.ts` beside `classifyNodeError` or in
a new `src/orgunits/web/transportSubtype.ts` is an implementation choice. A
separate pure module is mildly preferable — it is testable without the socket
module and keeps `gateway.ts` from growing — but it adds a file to the
`src/orgunits/web/` inventory that firewall assertions enumerate, so either is
defensible and the owner need not decide it now.

### 9.2 Files that need **no** change — established by inspection, not assumed

- **`src/orgunits/web/robots.ts`** returns `WebAttemptResult` values straight
  through (`fetchResult`, `attempts`), so the new field rides along with no
  edit. `evaluateRobotsFetch` keys only on `errorKind !== null`.
- **`src/orgunits/orchestrator/rootRunner.ts`** feeds the circuit breaker from
  `errorKind` alone (`rootRunner.ts:435-451`). It must stay that way — see §11.
- `pageEvidence.ts`, `pageCollection.ts`, `candidates.ts`, `sitemap.ts`, the
  signals layer and the CLI are untouched: none of them reads an error kind.
- Every other migration is untouched. Rule 5 is not implicated: 0012 is a new
  forward migration, and nothing in 0001–0011 is edited.

### 9.3 Test-only edits the change forces

Nine scripted `{ kind: 'FAILURE', ... }` constructions across five integration
test files, and two `new DnsResolutionError(...)` call sites. Both follow from
choosing **required keys with nullable values** over optional properties:
`subtype: TransportFailureSubtype | null` must be stated at every construction
site, so a new failure path cannot forget it. These are mechanical edits in
test files only.

---

## 10. Raw error detail stays non-durable — and the debugging need is real

The design adds **no** `error_detail` column, and `AttemptRecord.errorDetail`
remains exactly what its comment already says it is: in-memory, for the length
of the call, never persisted.

Normalised subtype is preferred because it:

- **leaks nothing.** `errorDetail` today embeds the hostname
  (`\`${hostname} did not resolve (${code})\``) and, for a certificate failure,
  whatever OpenSSL chose to say about subject, SAN or issuer. A subtype is one
  of eight fixed tokens.
- **is stable.** Node and OpenSSL error wording changes between releases. A
  durable evidence value that changes its text when the runtime is upgraded is
  not evidence of the site, it is evidence of the build.
- **is queryable.** `WHERE error_subtype = 'DNS_TEMPORARY_FAILURE'` is a fact;
  `WHERE error_detail LIKE '%EAI_AGAIN%'` is a hope.
- **is bounded.** A free-text column on an append-only evidence table is the
  shape rule 17 exists to prevent, and nothing could later remove what landed
  there.
- **is sufficient.** Every future retry rule the reassessment identified is
  decidable from the eight members.

**Rejected alternative, recorded honestly: a durable `error_detail`.** There
*is* a genuine debugging need behind it. The reassessment's own
`errorDetail never leaves the gateway` finding is why the TLS subtypes of the
three historical failures are permanently unrecoverable, and an operator
diagnosing a novel `TLS_OTHER` will want the code, not the bucket. That need is
better met by a **bounded, redacted code token** — a future
`error_code_observed text` constrained to `^[A-Z][A-Z0-9_]{0,63}$`, which
carries `ERR_SSL_SOMETHING_NEW` without carrying a hostname or a certificate
subject — than by free text. It is **not** included here: it is not required by
any retry decision, it is not part of the frozen eight-member proposal, and
adding it would exceed the minimal prerequisite this authorisation covers. It
is recorded as a rejected alternative with a named successor so the question is
not silently dropped.

---

## 11. No retryability is persisted, anywhere

Explicitly rejected schema:

- `is_retryable boolean`
- `retry_class text CHECK (retry_class IN ('TRANSIENT','TERMINAL'))`
- any `should_retry`, `retry_after_ms`, `attempts_remaining` or equivalent.

Retryability is **policy**; `error_subtype` is **evidence**. A stored verdict
would repeat precisely the `website_claims` mistake the repository is built to
avoid (rule 12): freezing a conclusion into an immutable claim, where a later
change of policy cannot correct the old rows because the role that wrote them
cannot rewrite them. A policy that lives in code can be versioned, reviewed and
replaced; a policy that has been written into 10,000 append-only rows cannot.

**Proof that it is not persisted, in three places:**

1. The migration adds exactly one column, and its CHECK admits exactly eight
   values, none of which is a verdict, a boolean, or a class name.
2. The word "retry" appears in the design in one place only — the
   *unimplemented* interface of §12 — and in no column, type or value.
3. `phase2b.firewall.test.ts`'s existing "no relevance, verdict or approval
   column in any migration" family runs over every migration and continues to
   pass unchanged; `error_subtype` matches none of its forbidden names, and an
   `ALTER`-based migration declares no columns under its column parser at all.

---

## 12. The future retry interface — specified, not implemented

To prove the evidence schema can support a later policy without further schema
work, the interface is specified. **It is not implemented, and the policy it
would encode is not frozen.**

```ts
export type RetryDisposition =
  | 'RETRY_ELIGIBLE'
  | 'NOT_RETRY_ELIGIBLE'
  | 'INSUFFICIENT_EVIDENCE';

/** PURE. No socket, no database, no clock. */
export function retryDispositionFor(
  errorKind: FetchErrorKind | null,
  errorSubtype: TransportFailureSubtype | null,
  httpStatus: number | null,
): RetryDisposition;
```

The shape that matters is the third value. `INSUFFICIENT_EVIDENCE` is what a
coarse historical row must produce, and it must be distinguishable from
"decided: no".

| input | disposition | why |
|---|---|---|
| `TLS_FAILURE`, `null`, `null` | `INSUFFICIENT_EVIDENCE` | a pre-migration row: the class contains both retryable and non-retryable conditions and this row does not say which |
| `DNS_FAILURE`, `null`, `null` | `INSUFFICIENT_EVIDENCE` | same |
| `TLS_FAILURE`, `TLS_CERT_INVALID`, `null` | `NOT_RETRY_ELIGIBLE` | a certificate does not become valid on attempt two |
| `TLS_FAILURE`, `TLS_OTHER`, `null` | `NOT_RETRY_ELIGIBLE` | unnamed condition; the catch-all never implies transience |
| `DNS_FAILURE`, `DNS_TEMPORARY_FAILURE`, `null` | candidate `RETRY_ELIGIBLE` | the one class the runtime says is temporary |
| `DNS_FAILURE`, `DNS_NAME_NOT_FOUND`, `null` | `NOT_RETRY_ELIGIBLE` | Node reported `ENOTFOUND` |

**All three of the currently-recorded transport failures — index 4's
`DNS_FAILURE` and index 6 and 8's `TLS_FAILURE` — would return
`INSUFFICIENT_EVIDENCE`, permanently.** That is the correct answer and it is
also the whole argument for doing this prospectively: those rows can never be
improved, and every run executed before the column exists adds more of them.

---

## 13. Fetch policy version: no bump

**`orgunit-fetch-policy-v3` stays.** Observability changes what is *recorded*,
not what is *requested*: the same URLs, in the same order, under the same
30 s / 45 s timeouts, the same 5 MiB cap, the same headers, the same robots
continuation boundary, the same circuit breaker.

This is not merely unnecessary — it would be **destructive**, and repository
inspection shows exactly how. `resolveRun` in `src/orgunits/web/authority.ts:133`
refuses on strict inequality:

```ts
if (run.fetch_policy_version !== FETCH_POLICY_VERSION) {
  throw new WebGatewayRefusal('RUN_FETCH_POLICY_UNSUPPORTED', ...);
}
```

A bump to `v4` would make **every** run row already recorded under `v3`
unexecutable by the new build, stranding the in-flight Generation-1 acquisition,
and would additionally change the attempt identity
`(run, root, url, fetch_policy_version, attempt_no)` on which the dedupe index
and `findExistingAttempt` depend. It would assert, falsely and durably on every
subsequent row, that the request boundary moved.

**A future retry implementation is the opposite case and does require `v4`**,
because issuing a second request where v3 issued one changes request behaviour,
changes what a `MAX_TOTAL_ATTEMPTS` budget means, and changes what a row's
absence proves. The distinction is exact: *v3 governs which requests are
issued; this change governs which columns are written about them.*

---

## 14. HTTP 5xx and `Retry-After`: out of scope

`error_subtype` is **not** overloaded for HTTP responses. Index 3's failure was
`ROOT_AND_SITEMAP_HTTP_5XX`: an HTTP 500 arrived, `http_status` recorded it, and
`error_kind` is `NULL` for that row because a response *did* arrive. A future
service-response retry policy reads `http_status` directly and needs nothing
new. `error_subtype` stays `NULL` there and the CHECK's first disjunct makes
that the only representable value.

**`Retry-After` is recorded as a separate, unaddressed prerequisite.** The
gateway reads response headers into memory (`flattenHeaders`) and persists none
of them; there is no header column on `orgunit_fetch_observations` and none is
proposed. A future standards-aware 503 retry — one that honours the server's own
stated wait rather than inventing a backoff — **would** require `Retry-After` to
be persisted, and that is a second observability gap of the same family.

It is deliberately **out of scope** here, on the brief's default and on its own
merits: the reassessment did not identify it as part of the minimal
prerequisite, no currently-recorded failure is a 503, and bundling it would
widen an authorisation granted for the TLS/DNS blind spot. Recorded so it is
not mistaken for having been considered and dismissed.

---

## 15. ADR plan

**Path:** `docs/adr/0014-transport-failure-observability.md`.
**Status at creation: `Proposed`.** The repository does use `Proposed` ADRs for
approved-but-unlanded designs — ADR 0008 carries
`Status: Proposed (feature branch, not landed)` — so `Proposed` is the correct
precedent, and creating `Accepted` production-policy history for an unlanded
design would be wrong.

**Not created in this step.** The brief mandates two artifacts (§24) and does
not list the ADR among them; §21's rollout order places ADR finalisation at step
6 of *implementation*; and §13's "design but do not create the migration"
applies the same discipline. The ADR is therefore fully specified here and
written when the implementation is authorised. If the owner prefers it landed
now as `Proposed`, that is a one-step change with no other consequence.

**Sections it must cover:**

1. Context — the class-C reassessment finding; TLS and DNS heterogeneity.
2. Evidence vs policy — the load-bearing distinction; why a verdict is not stored.
3. The eight-member vocabulary, verbatim, with the §2.1 honesty caveats.
4. The exact Node mapping, including the Node-24 `ENOTFOUND` normalisation and
   the evaluation-order requirement.
5. Prospective-only semantics; historical `NULL` =
   `SUBTYPE_NOT_CAPTURED_AT_EXECUTION_TIME`; totality rather than a version marker.
6. No backfill — impossible, not merely forbidden, with the measured ACL.
7. No raw error detail; the bounded-code-token successor recorded as rejected.
8. No TLS weakening: `rejectUnauthorized` stays `true`, firewall-asserted; no
   subtype is a bypass; certificate failures are recorded, never tolerated.
9. No retry introduced; `retryDispositionFor` specified, unimplemented.
10. No fetch-policy bump from observability alone — with the
    `RUN_FETCH_POLICY_UNSUPPORTED` reasoning — and the explicit statement that a
    future retry **does** require `v4` and a separate owner decision.
11. `Retry-After` and HTTP 5xx: out of scope, and why.
12. Consequences, including the three permanently `INSUFFICIENT_EVIDENCE` rows.

---

## 16. Test matrix for the later implementation

| # | assertion | kind |
|---|---|---|
| **A** | each of the nine landed TLS codes maps to exactly its expected subtype | unit |
| **B** | an unknown `ERR_TLS_*` and an unknown `ERR_SSL_*` both map to `TLS_OTHER`; and `ERR_TLS_HANDSHAKE_TIMEOUT` maps to `TLS_HANDSHAKE_TIMEOUT`, **not** `TLS_OTHER` — the exact-match-before-prefix order | unit |
| **C** | `ENOTFOUND`→`DNS_NAME_NOT_FOUND`; `EAI_AGAIN`→`DNS_TEMPORARY_FAILURE`; every other EAI code and any unknown code→`DNS_OTHER`; the empty-address branch→`DNS_NO_ADDRESS_RETURNED`; a resolver throw with no usable code→`DNS_OTHER` | unit |
| **C2** | the mapping is **total**: no TLS or DNS input yields `null` | unit |
| **D** | a scripted TLS failure and a scripted DNS failure each persist the expected `error_subtype` on the row; a `CONNECT_TIMEOUT`, a `READ_TIMEOUT` and a 200 each persist `NULL` | integration |
| **E** | the DB rejects `TLS_FAILURE`+`DNS_OTHER`, `CONNECT_TIMEOUT`+any subtype, `error_kind IS NULL`+any subtype, and any value outside the eight | integration |
| **F** | the 204 pre-existing rows remain valid; `ADD CONSTRAINT` validates them without error | integration |
| **G** | `0012_*.sql` contains no `UPDATE`, no `DELETE`, no `INSERT`, no `GRANT`, no `REVOKE`, no `DROP` | firewall / repair-scope |
| **H** | no persisted value ever contains `error.message`: the row's subtype is always one of eight tokens, and no new free-text column exists in any migration | firewall / repair-scope |
| **I** | the implementation issues the **same request sequence** as v3: same URL order, same count, same robots resolution, and the circuit breaker consumes `errorKind` only — no subtype reaches it | integration |
| **J** | no historical classifier freeze, approval record or evaluation artifact changes; `FETCH_POLICY_VERSION` is still `orgunit-fetch-policy-v3` | unit |
| **K** | no new network primitive: `gateway.ts` remains the only socket under `src/orgunits/`, `robots.ts` the only production caller of `executeWebAttempt`, `rejectUnauthorized` never `false`, dependency list unchanged | firewall |

**Where the new assertions live.** Per the resolved phase-isolation decision, a
change under `src/orgunits/` is pinned by `BASE..PHASE_TERMINAL` ranges, and the
correct move is a **new repair-scope test** — never widening an existing
firewall assertion. Items G, H and the `src/orgunits/web/` inventory part of K
belong in a new `phase2bTransportSubtype`-scoped test file, not in
`phase2b.firewall.test.ts`.

---

## 17. Rollout order

The deployment model is a single local PostgreSQL applied by
`npm run db:migrate`, with no rolling fleet, so ordering is a correctness
question, not an availability one.

1. **Migration first.** `0012` is additive and nullable, and
   `insertFetchObservation` names its columns explicitly, so the *current* build
   continues to insert successfully against the *new* schema, writing `NULL`.
   The reverse order — code emitting a column the database does not have — fails
   every insert. Migration-first is therefore the only safe order, and it is
   safe precisely because §7.1 rejected the timestamp-gated NOT NULL that would
   have broken it.
2. Types and the `INSERT` column list (`observations.ts`).
3. The pure subtype derivation and `DnsResolutionError.code` (`gateway.ts`).
4. Persistence wiring: `AttemptRecord` → `persist` → `insertFetchObservation`,
   and the field on `WebAttemptResult`.
5. Tests A–K, including the new repair-scope file.
6. ADR 0014 finalised.
7. `npm run validate` to `EXIT 0`.
8. Owner verification.

**No live acquisition between any two of these steps.** Steps 1 and 2–4 are one
commit's worth of work on a branch; no acquisition is authorised during it in
any case.

---

## 18. Governance impact

| artifact | impact |
|---|---|
| Methodology R3 (approval `77dae976`) | **unchanged** — it governs classifier acceptance, not transport evidence |
| Corpus acquisition plan V1 | **unchanged** for observability-only |
| Option-B / Option-C-lite amendments | **unchanged** — the robots continuation boundary is untouched; `FETCH_POLICY_VERSION` stays `v3` |
| Frame `FRAME_V2_GEN1` | **unchanged** |
| Draw `DRAW_V2_GEN1` | **unchanged** |
| V3 transition ledger | **unchanged** — no observation is reclassified |
| Acquisition-of-record (5 success / 4 failure of 9 finalised) | **unchanged** |
| P5 gate | **unchanged** — it keys on yield, not on error taxonomy |
| Reserve | **unchanged**, 0 consumed |
| Classifier freezes | **unchanged** — no freeze references `error_kind` on this table |
| Circuit breaker behaviour | **unchanged by requirement** — `rootRunner.ts` must keep keying on `errorKind` alone (test I) |

**No re-acquisition is authorised, and none would help.** Re-running a finalised
index to populate `error_subtype` would be a new acquisition under a new run id,
producing new rows — it would not enrich the existing ones, and it would spend
budget to obtain evidence about a host's *present* state rather than its state
at the time of record.

---

## 19. The three existing failures, stated explicitly

| index | failure | treatment |
|---|---|---|
| **3** | `ROOT_AND_SITEMAP_HTTP_5XX` | `error_subtype` **not applicable** — an HTTP response arrived; `http_status` already carries it and `error_kind` is `NULL` |
| **4** | `ROBOTS_DNS_FAILURE` | `error_subtype` remains **`NULL`**, permanently. Not reclassified. Whether it was `EAI_AGAIN` or `ENOTFOUND` is unrecoverable |
| **6** | `ROBOTS_TLS_FAILURE` | `error_subtype` remains **`NULL`**, permanently. Not reclassified |
| **8** | `ROBOTS_TLS_FAILURE` | `error_subtype` remains **`NULL`**, permanently. Not reclassified |

No current external state — no fresh DNS lookup, no certificate check, no
present-day reachability probe — may be used to enrich any of them. A transport
observation is a statement about one moment from one vantage; repairing it from
today's network would replace evidence with a reconstruction.

---

## 20. Outcome

### `OBSERVABILITY_DESIGN_READY_FOR_IMPLEMENTATION`

Every question the authorisation raised is answered from repository, schema and
runtime inspection. No owner choice is left open, no schema constraint blocks
the design, and no privilege change is required.

Two design decisions departed from the letter of the brief, both toward
strictness, both evidenced above, and both reported rather than made silently:

1. The CHECK uses `IS NOT DISTINCT FROM` rather than `=`, because the `=` form
   the brief sketches accepts the very combination §10 asks to forbid (§5.2,
   verified on PostgreSQL 16.15).
2. The supporting note is at `docs/audits/` rather than `docs/design/`, because
   `docs/design/` is not a repository convention — `docs/` holds `adr/`,
   `audits/` and `evaluation/` only — and the reassessment this continues uses
   exactly the `audits/` + `evaluation/` pairing (§24 of the brief made the note
   conditional on that convention existing).

**Next owner decision:**

> `A2_TRANSPORT_FAILURE_OBSERVABILITY_IMPLEMENTATION_AUTHORISATION`
