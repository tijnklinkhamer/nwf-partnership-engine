# ADR 0014 — Transport-failure observability: `error_subtype` as evidence

- **Status:** Proposed (feature branch, not landed)
- **Decision date:** 2026-09-20
- **Phase:** 2B-2D (A2 acquisition-resilience follow-up)
- **Supersedes / superseded by:** none. **Extends:** ADR 0004, ADR 0005,
  ADR 0006, ADR 0008, ADR 0012, ADR 0013. Nothing in any of them is edited or
  reinterpreted; this ADR adds a column and changes no request.

Claims below are tagged exactly as prior Phase 2B ADRs tag theirs: **FACT**,
**MEASUREMENT**, **DESIGN DECISION**, **UNKNOWN**.

Designed by
`docs/evaluation/PHASE_2B_2D_A2_TRANSPORT_FAILURE_OBSERVABILITY_DESIGN_V1.json`
(sha256 `6f184a93…4cdaa0`) and
`docs/audits/PHASE_2B_2D_A2_TRANSPORT_FAILURE_OBSERVABILITY_DESIGN_V1.md`
(sha256 `32901e90…434854`), both frozen on origin before implementation began.

---

## 1. Context

**MEASUREMENT.** The A2 acquisition-resilience reassessment found that this
repository cannot distinguish a retryable transport failure from a permanent
one, and that the reason is structural rather than incidental: `error_kind` is
too coarse in exactly the two places where the distinction matters.

- `TLS_FAILURE` covers a handshake timeout — plausibly transient — and an
  expired or untrusted certificate, which is not transient in any sense.
- `DNS_FAILURE` covers `EAI_AGAIN`, where the resolver itself said "ask
  again", and `ENOTFOUND`, where the name did not resolve.

**FACT.** The gateway SEES the distinction at the moment of failure and then
discards it. `AttemptRecord.errorDetail` is in-memory only, deliberately
(ADR 0005 §10a, rule 17), so the subtype of every historical failure is
permanently unrecoverable. Of the 204 fetch observations recorded when this
was written, four carry a transport `error_kind`: two `TLS_FAILURE`, one
`DNS_FAILURE`, one `READ_TIMEOUT`. For the three TLS/DNS ones — Generation-1
acquisition indices 6, 8 and 4 — no evidence exists anywhere that could say
which condition they were.

**DESIGN DECISION.** That is an observability gap, and closing it is a
prerequisite for any future retry policy. It is not itself a retry policy, and
this ADR introduces none.

---

## 2. Decision

Add one nullable, bounded column to `orgunit_fetch_observations`:

```
error_subtype text NULL
```

constrained to a closed eight-member vocabulary, each member valid only beside
the `error_kind` it refines. Populate it prospectively, from the runtime's own
error code, normalised. Change nothing about which requests are issued.

---

## 3. Evidence, not policy — the load-bearing distinction

**DESIGN DECISION.** `error_subtype` records WHAT THE RUNTIME REPORTED. It is
not a retry verdict, and no retry verdict is stored anywhere in this schema.

Explicitly rejected, and forbidden by the repair-scope test: `is_retryable`,
`retry_class` (`TRANSIENT`/`TERMINAL`), `should_retry`, `retry_after_ms`,
`attempts_remaining`.

The reason is rule 12's, transplanted. A stored verdict would freeze a
conclusion into an immutable claim on an append-only table whose writer
(`nwf_research`) holds `SELECT` and `INSERT` and no `UPDATE`. When the policy
later changed — and a first retry policy will certainly change — nothing could
correct the old rows. The evidence would then disagree with the policy
permanently, and the database would be the one asserting the stale answer.

Retryability is therefore DERIVED at read time, by something that does not
exist yet. See §10.

---

## 4. The vocabulary — exactly eight members

**DESIGN DECISION.** Adopted verbatim from the reassessment's proposal: none
added, none removed, none renamed.

| `error_kind`  | `error_subtype`             |
| ------------- | --------------------------- |
| `TLS_FAILURE` | `TLS_HANDSHAKE_TIMEOUT`     |
| `TLS_FAILURE` | `TLS_CERT_INVALID`          |
| `TLS_FAILURE` | `TLS_PROTOCOL_INCOMPATIBLE` |
| `TLS_FAILURE` | `TLS_OTHER`                 |
| `DNS_FAILURE` | `DNS_NAME_NOT_FOUND`        |
| `DNS_FAILURE` | `DNS_TEMPORARY_FAILURE`     |
| `DNS_FAILURE` | `DNS_NO_ADDRESS_RETURNED`   |
| `DNS_FAILURE` | `DNS_OTHER`                 |

**Only `TLS_FAILURE` and `DNS_FAILURE` are refined.** `CONNECT_TIMEOUT`,
`READ_TIMEOUT`, `CONNECTION_REFUSED` and `CONNECTION_RESET` carry `NULL`:
their `error_kind` is already the exact category a retry rule would key on, so
a mirrored subtype would be a second spelling of one fact, and two spellings
eventually disagree.

**An HTTP response is not a transport failure.** A 500, 502, 503 or 504
arrived; `http_status` carries it and both error columns stay `NULL`. A future
service-response retry reads `http_status` directly. See §11.

### 4.1 Two members promise less than they appear to

**FACT.** `DNS_NAME_NOT_FOUND` means precisely "Node reported `ENOTFOUND`". On
Node 24.18.0 — the version `.node-version` pins — Node maps BOTH uv
`EAI_NONAME` (-3008, NXDOMAIN) and uv `EAI_NODATA` (-3007, the name exists but
has no address of either family) onto `err.code === 'ENOTFOUND'`. Every other
`EAI_*` code passes through verbatim. This was verified by static
introspection of the installed runtime — `util.getSystemErrorMap()` plus
direct construction of the internal DNS exception — with **no lookup
performed and no query leaving the machine**. The member name is kept because
renaming it would depart from the frozen proposal; the caveat is recorded in
the column comment so nobody later reads more into it than it says.

**FACT.** `TLS_PROTOCOL_INCOMPATIBLE` includes `EPROTO`, which is broader than
"wrong TLS version". The bias is SAFE: it labels the condition non-retryable,
so the worst case is a retry never attempted — never a request that should not
have been issued.

### 4.2 The catch-alls never imply transience

**DESIGN DECISION.** `TLS_OTHER` and `DNS_OTHER` mean "a condition this
build's taxonomy does not name", and nothing more. An unrecognised future
`ERR_SSL_*` lands there precisely so it cannot acquire the retry semantics of
a recognised code by accident. This is asserted, not merely intended.

### 4.3 Deliberately deferred

Splitting `TLS_CERT_INVALID` into name-mismatch / expired / untrusted-chain
(diagnostic value only; all three are equally non-retryable), and splitting
`EAI_FAIL` (SERVFAIL) out of `DNS_OTHER` (outside the frozen eight, and
`DNS_OTHER` derives as non-retryable, which is the safe side).

---

## 5. The exact runtime mapping

**FACT.** TLS, derived from `TLS_ERROR_CODES` and `classifyNodeError` in
`src/orgunits/web/gateway.ts`:

| Node code                           | subtype                     |
| ----------------------------------- | --------------------------- |
| `ERR_TLS_HANDSHAKE_TIMEOUT`         | `TLS_HANDSHAKE_TIMEOUT`     |
| `ERR_TLS_CERT_ALTNAME_INVALID`      | `TLS_CERT_INVALID`          |
| `CERT_HAS_EXPIRED`                  | `TLS_CERT_INVALID`          |
| `DEPTH_ZERO_SELF_SIGNED_CERT`       | `TLS_CERT_INVALID`          |
| `SELF_SIGNED_CERT_IN_CHAIN`         | `TLS_CERT_INVALID`          |
| `UNABLE_TO_VERIFY_LEAF_SIGNATURE`   | `TLS_CERT_INVALID`          |
| `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` | `TLS_CERT_INVALID`          |
| `ERR_SSL_WRONG_VERSION_NUMBER`      | `TLS_PROTOCOL_INCOMPATIBLE` |
| `EPROTO`                            | `TLS_PROTOCOL_INCOMPATIBLE` |
| any other `ERR_TLS_*` / `ERR_SSL_*` | `TLS_OTHER`                 |

**THE EVALUATION ORDER IS DECISIVE.** Every exact code above also matches one
of the prefix catch-alls, so consulting the prefixes first would swallow
`ERR_TLS_HANDSHAKE_TIMEOUT` into `TLS_OTHER` — losing the single plausibly
transient TLS condition and with it the whole reason the split exists.
`tlsFailureSubtype` reads the exact table FIRST, always, and a test asserts
that specific case rather than the general rule.

**FACT.** DNS:

| condition                                                     | subtype                   |
| ------------------------------------------------------------- | ------------------------- |
| `ENOTFOUND` (and `EAI_NONAME`, kept defensively)              | `DNS_NAME_NOT_FOUND`      |
| `EAI_AGAIN`                                                   | `DNS_TEMPORARY_FAILURE`   |
| resolver answered with zero addresses                         | `DNS_NO_ADDRESS_RETURNED` |
| every other `EAI_*`, anything unrecognised, or no code at all | `DNS_OTHER`               |

**The mapping is TOTAL.** Every TLS and every DNS path terminates in a member.
"Could not classify" is not a reachable outcome — see §7.

### 5.1 The blocker this exposed, and the only honest fix

**FACT.** Before this change, `nodeWebTransport.resolveHostname` caught the
lookup error, interpolated `error.code` into a human sentence, and threw
`new DnsResolutionError(...)`. The structured code was gone; only prose
survived, and that prose contains the HOSTNAME.

Recovering the subtype by parsing that sentence was rejected outright: it
would make a durable evidence value depend on unstable wording, and it is the
forbidden raw-error-text path in a thin disguise.

**DESIGN DECISION.** `DnsResolutionError` gains a **required** `readonly code:
string`, carried in memory only. Required rather than optional because an
optional one would let a future transport silently omit it and degrade every
DNS failure to `DNS_OTHER` — a wrong value that looks like a right one.
Required makes the obligation structural, the posture this repository already
takes with `RobotsAuthorisation`'s brand. Only the normalised subtype derived
from that code ever reaches a column.

---

## 6. The database enforces the model, not just TypeScript

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

**`IS NOT DISTINCT FROM`, not `=`, and that is not a stylistic choice.**

**MEASUREMENT.** A PostgreSQL `CHECK` passes when its expression is `TRUE`
_or_ `NULL`. With plain `=`, a row carrying `error_kind = NULL` and
`error_subtype = 'TLS_OTHER'` evaluates `FALSE OR NULL OR NULL` → `NULL` →
**accepted** — which is exactly the combination the constraint exists to make
unrepresentable. `IS NOT DISTINCT FROM` returns `TRUE`/`FALSE` and never
`NULL`, so every disjunct is two-valued and the invariant holds for every
combination. Verified against the real PostgreSQL 16 this repository runs, as
a read-only `SELECT` over a `VALUES` list, before the migration was written.

It enforces: the vocabulary is closed at eight; a subtype may only accompany
the kind it refines; and no subtype may accompany `error_kind IS NULL` or any
unrelated kind. It deliberately does **not** enforce that a transport-kind row
must CARRY a subtype — see §7.

---

## 7. `NULL` is deliberate, and means exactly one thing

**DESIGN DECISION.** Historical `NULL` means
`SUBTYPE_NOT_CAPTURED_AT_EXECUTION_TIME`. It does not mean
`UNKNOWN_RETRYABILITY`, it does not mean `TRANSIENT`, and it is not evidence
of anything about the host.

**Nothing may be inferred** from duration, HTTP status, IP family, a
neighbouring attempt, the institution's identity, a later successful
acquisition, or the present state of DNS or TLS anywhere. A transport
observation is a statement about one moment from one vantage; repairing it
from today's network would replace evidence with a reconstruction.

**No version marker was added.** The reassessment sketched a stronger rule —
`error_subtype NOT NULL` for every transport-kind row after the migration — so
that a `NULL` could only mean "written by an older build". It is not needed,
because the mapping is TOTAL (§5): "could not classify" is not a reachable
outcome, so it is not a meaning a `NULL` could carry, and on a transport-kind
row `NULL` can only mean the row predates the column.

Its database form would also be harmful. A `CHECK` cannot express "after the
migration" without hard-coding a wall-clock boundary against `observed_at`.
That would make the migration BREAKING: any build not yet carrying the subtype
code would have its INSERTs rejected, turning an observability gap into an
acquisition outage and forcing code before schema. Additive and nullable is
what lets the migration land first and the current build keep writing. Totality
is a CODE invariant pinned by tests, not a schema constraint.

---

## 8. No backfill — impossible, not merely forbidden

**FACT.** The migration contains zero `UPDATE` statements and no DML of any
kind. The 204 pre-existing observations keep `error_subtype = NULL`
permanently. `ADD CONSTRAINT` validated all 204 without error, because every
one satisfies the first disjunct trivially.

**MEASUREMENT.** Backfill is not available to the acquisition path at all.
The measured table ACL is `nwf_owner=arwdDxt`, `nwf_research=ar`,
`nwf_readonly=r`, `nwf_classifier=r`: `a` is INSERT, `r` is SELECT, and
`nwf_research` holds no `w` (UPDATE) and no `d` (DELETE). Rule 15, as a
measured fact rather than a remembered one.

**No privilege changed.** `pg_attribute.attacl` is NULL for every column of
this table, so the table-level ACL alone governs, and PostgreSQL applies a
table-level privilege to columns added later. The migration contains no
`GRANT` and no `REVOKE`. Incidentally, `nwf_classifier` holds table-level
SELECT (migration 0009) and so can read the new column; harmless — a bounded
enum with no free text, no hostname and no PII — and recorded rather than
acted on.

---

## 9. No raw error detail is persisted

**DESIGN DECISION.** No `error_detail` column, and no free-text column of any
kind. `errorDetail` remains exactly what its comment already says: in memory,
for the length of the call, never persisted.

A normalised subtype is preferred because it **leaks nothing** (today's
`errorDetail` embeds the hostname, and for a certificate failure whatever
OpenSSL says about subject, SAN or issuer — a subtype is one of eight fixed
tokens); **is stable** (Node and OpenSSL wording changes between releases, and
a durable value that moves on a runtime upgrade is evidence of the build, not
of the site); **is queryable** (`WHERE error_subtype = 'DNS_TEMPORARY_FAILURE'`
is a fact, `WHERE error_detail LIKE '%EAI_AGAIN%'` is a hope); and **is
bounded** (a free-text column on an append-only evidence table is the shape
rule 17 exists to prevent, and nothing could later remove what landed there).

**The debugging need behind the rejected alternative is real and is
recorded.** An operator diagnosing a novel `TLS_OTHER` will want the code, not
the bucket. If that is ever wanted, the successor is a bounded redacted token
— `error_code_observed text CHECK (~ '^[A-Z][A-Z0-9_]{0,63}$')` — carrying
`ERR_SSL_SOMETHING_NEW` without a hostname or a certificate subject. It is not
included now: no retry decision requires it, and it was not part of the frozen
proposal.

---

## 10. No retry is introduced; the future interface is specified, not built

**FACT.** Production implements no retry, no backoff, no second lookup, no
probe, no alternate host or scheme, and no fallback URL. Given the same
scripted transport, the gateway issues exactly the invocations it issued
before this change. `retryDispositionFor` **is not implemented**, and a test
asserts that no production file names it.

**DESIGN DECISION.** When it is designed, its shape is expected to be pure —
no socket, no database, no clock:

```ts
retryDispositionFor(
  errorKind: FetchErrorKind | null,
  errorSubtype: TransportFailureSubtype | null,
  httpStatus: number | null,
): RetryDisposition   // RETRY_ELIGIBLE | NOT_RETRY_ELIGIBLE | INSUFFICIENT_EVIDENCE
```

`INSUFFICIENT_EVIDENCE` exists because a coarse historical row must produce
something distinguishable from "decided: no". **All three historical TLS/DNS
failures — Generation-1 indices 4, 6 and 8 — yield `INSUFFICIENT_EVIDENCE`
permanently**, and that is the honest outcome rather than a defect.

**Any retry policy requires its own owner decision.** None is granted here.

---

## 11. Out of scope

**`Retry-After` is not persisted.** The gateway reads response headers into
memory via `flattenHeaders` and persists none of them; there is no header
column on `orgunit_fetch_observations` and none is proposed. It would be
required before a standards-aware 503 retry. No currently-recorded failure is
a 503, and bundling it would widen an authorisation granted for the TLS/DNS
blind spot. Recorded so it is not lost.

**HTTP 5xx is not a transport subtype.** See §4.

---

## 12. Fetch policy stays `orgunit-fetch-policy-v3`

**DESIGN DECISION.** No bump. Observability changed what is RECORDED, not what
is REQUESTED: the same URLs, in the same order, under the same 30 s / 45 s
timeouts, the same 5 MiB cap, the same headers, the same robots continuation
boundary (ADR 0012 as widened by ADR 0013), the same circuit breaker.

**A bump would be actively destructive.** `resolveRun`
(`src/orgunits/web/authority.ts`) refuses on strict inequality with
`WebGatewayRefusal('RUN_FETCH_POLICY_UNSUPPORTED')`, so every run row already
recorded under v3 would become unexecutable by the new build, stranding the
in-flight Generation-1 acquisition. It would also change the attempt identity
`(run, root, url, fetch_policy_version, attempt_no)` that the dedupe index and
`findExistingAttempt` depend on. And it would assert, falsely and durably on
every subsequent row, that the request boundary moved.

**A future retry DOES require v4.** Issuing a second request where v3 issues
one changes request behaviour, changes what a `MAX_TOTAL_REQUESTS_PER_ROOT`
budget means, and changes what a row's absence proves. v3 governs which
requests are issued; this change governs which columns are written about them.

---

## 13. Governance impact: none

Methodology R3, corpus acquisition Plan V1, the Option-B and Option-C-lite
amendments, the frame, the draw, the V2 and V3 transition ledgers, the
acquisition-of-record state (5 success / 4 failure of 9 finalised), the P5
gate and the reserve are all unchanged. No observation is reclassified. The
circuit breaker's behaviour is unchanged BY REQUIREMENT — `rootRunner.ts`
keys on `errorKind` alone, and the repair-scope test asserts that no subtype
reaches it.

**No re-acquisition is authorised, and it would not help.** Re-running a
finalised index would be a new acquisition under a new run id producing new
rows; it would not enrich the existing ones, and it would spend budget to
obtain evidence about a host's PRESENT state rather than its state at the time
of record.

---

## 14. Consequences

- Future TLS and DNS failures carry a normalised, queryable subtype, which is
  the minimum a retry policy needs to be designed at all.
- The three historical TLS/DNS failures remain permanently unexplained. That
  cost is accepted rather than paid off with a reconstruction.
- The production change surface is two files and one migration. The type
  choice — required keys with nullable values rather than optional properties
  — forced mechanical edits at scripted-failure construction sites in the test
  suite, which is the intended trade: a new failure path cannot forget to
  state its subtype.
- `error_kind` remains the durable failure category. Nothing that reads it
  today needs to change.

---

## 15. Status and next decision

Implemented on the feature branch; **Proposed** until the owner accepts it,
following ADR 0008's precedent for an approved-but-unlanded design.

Next owner decision: `A2_BOUNDED_TRANSPORT_RETRY_POLICY_DESIGN_AUTHORISATION`
— which may DESIGN a retry policy over this now-frozen evidence taxonomy, and
still may not execute retries.
