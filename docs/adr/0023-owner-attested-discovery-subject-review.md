# ADR 0023 — OWNER-attested discovery-subject review (B2.3)

- **Status:** Proposed. LOCAL, synthetic-only implementation authorised by the
  OWNER (Track B, B2.3-R1), evaluated for local acceptance only. Not committed,
  not deployed; migration 0015 has been applied only to a disposable test
  database. **No operational OWNER review key exists, and authoritative review
  execution remains unavailable.** Amended by the OWNER-authorised B2.3-R2
  security repair (§10a, §11a, §16), still local and uncommitted.
- **Date:** 2026-10-16
- **Phase:** Track B — Discovery & Research Quality, slice B2.3
- **Extends:** ADR 0019 (discovery-subject identity), ADR 0020 (registry).
  Implements the Track B part of ADR 0021 RC2 §3 (Operator repository,
  `887c904`). **Supersedes nothing.**
- **Owner decision record:**
  `docs/evaluation/TRACK_B_B2_3_OWNER_ATTESTED_REVIEW_OWNER_DECISION_V1.json`
- **Numbering:** ADR 0021 is the Operator's RC2 contract and 0022 is reserved by
  the Insights branch; 0023 was checked free across every local and
  remote-tracking ref of both repositories before this file was written.
  Migration 0015 was checked free the same way.

Claims are tagged **FACT**, **MEASUREMENT**, **DESIGN DECISION**, **UNKNOWN**.

---

## 1. What this slice adds

ADR 0020 §6 found that the Engine could not tell an authorised OWNER decision
apart from anyone holding a database credential, and left review execution
disabled. ADR 0021 RC2 §3 requires authoritative Track B review to travel "a
distinct OWNER-controlled Ed25519 protocol". This slice builds that protocol,
end to end, and proves it with synthetic data and test-only keys:

| piece                                                          | what it is                                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/orgunits/subjectReview/`                                  | canonical JSON, the protocol shapes, the pinned trust set, verification, the offline signer |
| `src/orgunits/subjectRegistry/reviewEvidence.ts`               | the evidence-content binding                                                                |
| `src/orgunits/subjectRegistry/reviewAttestation.ts`            | read-time re-verification of every review                                                   |
| `src/orgunits/subjectRegistry/writer.ts`                       | `prepareReview` and `appendAttestedReview` over the B2.2 judgement                          |
| `migrations/0015_discovery_subject_review_attestation.sql`     | environment identity, append-only attestations, the reviewer capability                     |
| `discovery-subjects review --prepare` / `--execute --envelope` | prepare an unsigned request; execute a signed one                                           |
| `nwf-pe discovery-subject-review-sign`                         | the offline signer                                                                          |

**FACT.** The operational trust set is empty. Every production execution is
refused with `REVIEWER_TRUST_PRIMITIVE_ABSENT` before the envelope is read, and
every stored review — however it got there — reads as an integrity hold.

## 2. Approved choices (G1–G5)

|     | decision                                                                                                                         | where  |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ------ |
| G1  | dedicated offline signing; no network, no database; the verifier never holds a private key                                       | §6     |
| G2  | dedicated Ed25519 OWNER review key, separate from Operator release keys; encrypted PKCS#8 with access controls; no real key here | §4, §6 |
| G3  | ACTIVE / RETIRED / REVOKED, history preserved, revocation fails closed                                                           | §5     |
| G4  | 15 min default, 60 min maximum, 300 s skew, freshness by the DATABASE clock                                                      | §3, §9 |
| G5  | a review is never research clearance; no research admission in B2.3                                                              | §11    |

## 3. The protocol: `nwf-pe.discovery-subject-review/1`

**DESIGN DECISION.** Three documents, all canonical JSON (§3.2):

1. **Review request** `{document: "nwf-pe.discovery-subject-review-request/1", intent}`
   — produced by `review --prepare` on the readonly role.
2. **Signed payload** — the intent plus `keyId`, `keyFingerprint`, `nonce`
   (32 random bytes), `issuedAt`, `expiresAt`, added by the signer.
3. **Envelope** `{keyId, payload, protocol, signature}` — `payload` is the
   payload's canonical bytes in unpadded base64url; `signature` is Ed25519
   (`node:crypto`, no custom cryptography) over

   `UTF8("nwf-pe.discovery-subject-review/1\n") || payloadBytes`.

The protocol line is inside the signed bytes, so no signature made for any
other protocol — including the Operator's `nwf-release-sync/1` and
`nwf-registry-sync/1`, which also use different keys — can verify here.

### 3.1 Signed fields

`protocol`, `contractVersion` (`"1"`), `action`
(`APPEND_DISCOVERY_SUBJECT_REVIEW`, the one action audience), `environmentId`
(§8.1), `keyId`, `keyFingerprint` (sha256 of the raw public key), `subjectId`,
`target {kind, id}`, `expectedHeadReviewId`, `subjectStateDigest` (B2.2,
unchanged), `ruleVersion` (`discovery-identity-rules-v1`), `evidence` (§7),
`outcome`, `reason` (required unless CONFIRMED), `nonce`, `issuedAt`,
`expiresAt`. Every object has an exact key set; an unknown, missing or
mistyped field is a refusal.

### 3.2 Canonical encoding

Keys sorted, no whitespace, strings exactly as `JSON.stringify` writes them,
**no numbers at all** (instants, ids and digests are strings). Parsing
re-encodes what `JSON.parse` returned and demands identical bytes — which
refuses duplicate keys (JSON.parse keeps the last), reordering, whitespace,
gratuitous escapes and numbers without a second parser. Invalid UTF-8 and a
BOM are refused before JSON is considered. base64url must re-encode to itself.

### 3.3 Verification order (signature first)

Pinned key by `keyId` → canonical base64url payload within 128 KiB →
canonical 64-byte signature → **Ed25519 verify** → only then canonical JSON →
exact payload shape, protocol, action, window (0 < window ≤ 60 min) → same key
id and the pinned fingerprint. A RETIRED or REVOKED key is refused for any new
decision. The result is a sealed `VerifiedReviewEnvelope` (private brand, no
public constructor).

## 4. Key custody and authority assumptions (G2)

**DESIGN DECISION.** The OWNER review key is its own Ed25519 key, never an
Operator release-signing key. It must live as an **encrypted PKCS#8 PEM** in an
owner-only file (§6). The Engine's verifying and writing paths hold the public
key only.

**FACT — what a signature proves.** That whoever produced it held a private
key the pinned trust set lists. It does not, by itself, prove which person
operated that key; that rests on custody, passphrase discipline and the
machine the OWNER signs on, which no code can verify. The recorded actor key
`owner-review-<keyId>` therefore names a KEY, never a person.

## 5. The trust set and key lifecycle (G3)

**DESIGN DECISION.** Trust is **reviewed source**:
`OPERATIONAL_OWNER_REVIEW_KEYS` in `trust.ts`, frozen and **empty**. There is
no key table, no CLI option and no environment variable that can add a key; no
database role can make a key trusted by writing a row. Entries are public keys
only (raw 32 bytes, base64url) bound to key id, fingerprint, the
`OWNER_DISCOVERY_SUBJECT_REVIEW` authority, the protocol, a scope, a state and
activation / retirement / revocation instants. Private-key material (PEM,
64-byte seeds) is refused at load.

Test keys exist only as `TEST_ONLY` entries with a `test-` key-id prefix,
inside `ReviewTrustSet.ephemeralForVitest`, which throws outside vitest. The
operational set refuses both the scope and the prefix, so a test key can never
become operational authority.

Two questions, kept apart, for every stored attestation:

| state   | new decisions                               | history recorded inside the key's lifetime                               |
| ------- | ------------------------------------------- | ------------------------------------------------------------------------ |
| ACTIVE  | allowed from `activatedAt` (database clock) | valid at recording **and** current                                       |
| RETIRED | refused                                     | valid and current if recorded before `retiredAt`; a later one is a hold  |
| REVOKED | refused                                     | may have been valid at recording, but is **not current**: integrity hold |

A revoked key's reviews are never dropped: dropping one and recomputing could
produce a MORE permissive state (a revoked REJECTED `PART_OF` could have been
holding a structural block open). The subject goes on integrity hold, and no
further decision may extend its history (§9) until a separately authorised
re-evaluation exists.

**Adding a key later** requires, at minimum: an OWNER key-custody decision; a
reviewed source change adding one ACTIVE entry (public key, fingerprint,
activation instant); this ADR's successor or an amendment recording it; and a
separate activation approval (ADR 0021 RC2 §10).

## 6. Offline signing (G1, G2)

`nwf-pe discovery-subject-review-sign --request <path> --encrypted-key
<absolute path> --key-id <id> [--lifetime-minutes 1-60]` reads one request,
prints what it binds to stderr, reads the passphrase from the **controlling
terminal with echo off** (raw mode), signs, and writes the envelope to stdout.

- **No network, no database, no environment.** The signer and its CLI import
  only `node:crypto`, `node:fs`, `node:path`, `node:util` and the protocol;
  the firewall pins this, and a unit test observes zero sockets through
  `node:diagnostics_channel`.
- **Key file:** absolute, already-canonical path, no symlink anywhere, a
  regular file owned by the user with no group/other bits, in a user-owned
  directory nobody else can write, opened `O_NOFOLLOW` and re-checked by
  descriptor. An unencrypted key is refused. Key and passphrase buffers are
  zeroed after use; refusals carry fixed tokens only.
- **Passphrase:** never an argument, never an environment variable, never a
  pipe. Without an interactive terminal the signer refuses
  (`interactive_terminal_required`); a non-interactive path is a later security
  decision.
- **Signing grants nothing.** An envelope counts only if the executing Engine
  already pins the key.

**UNKNOWN.** The interactive prompt is exercised by unit tests against a fake
TTY; it has not been used by a person on a real terminal in this slice.

## 7. Evidence and state binding

**FACT.** B2.2's `subjectStateDigest` hashes sorted record ids. It catches
appended claims and reviews but not a record altered in place. B2.3 keeps it,
unchanged, and binds content as well (`discovery-review-evidence-v1`):

- `snapshotDigest` — sha256 of the canonical JSON of every covered record,
  field by field: the subject row; every identity claim of the subject
  (payload and provenance: source type, page-evidence / website-claim / URL
  reference, source version, observed instant, claim basis, recording path);
  every relationship claim (predicate, target, the same provenance); every
  review of any of them; the row of every subject a relationship targets; the
  rule versions.
- `targetRecordDigest` — the reviewed record alone.
- `coveredRecordIds` — exactly which records the snapshot covers, so it can be
  recomputed later after legitimate growth.
- `evidenceRefs` — the typed source references (`page_evidence:<uuid>`,
  `website_claim:<uuid>`, `url:<url>|v=<ref>`) the decision rests on.

**MEASUREMENT.** A test changes a claim's name (and, separately, a
relationship's source version and claim basis) with the migration credential
and triggers disabled: the record ids, and therefore the B2.2 state digest,
are unchanged, and execution is refused `EVIDENCE_CHANGED`. The same tamper
after a valid review turns it into an integrity hold on read.

No B2.1 semantics changed: the binding reads the B2.1 record shapes and
decides nothing about a subject.

## 8. Database schema and permissions (migration 0015)

### 8.1 Objects

- `subject_review_environment` — exactly one row, an id generated **at
  migration time in each database**; no id is written in the repository. An
  envelope for one database is refused by every other. A byte-for-byte restore
  carries its id and is, for this purpose, the same environment.
- `subject_review_attestations` — one row per attested review: the signed
  payload and signature verbatim, plus copies of the values they bind.
  Unique on `review_id` (one attestation per decision, one decision per
  attestation) and on `nonce` (never reused, across every subject and key).
- `nwf_discovery_subject_reviewer` — NOLOGIN, no attributes, granted to no
  role. SELECT on the subject tables, SELECT+INSERT on reviews and
  attestations, SELECT on the environment, SELECT(`eche_row_key`) on
  organisations. Nothing else. The writer gains nothing; `nwf_readonly` gains
  SELECT on the two new tables; research, ingest and classifier gain nothing.

### 8.2 Constraints and triggers

- An attestation's BEFORE INSERT trigger (every role) requires its review to
  exist, match target, outcome, expected head, subject and actor
  (`owner-review-<key_id>`), have been written **in the same transaction**,
  belong to this environment, and lie inside the envelope window by the
  database clock.
- A non-owner review must carry an `owner-review-…` actor key, and a DEFERRED
  constraint trigger requires exactly one attestation for it by COMMIT.
- Environment and attestations refuse UPDATE and DELETE for every role; the
  environment also refuses TRUNCATE.

### 8.3 What the database proves — and does not

**FACT.** PostgreSQL does not verify Ed25519 here. The constraints prove
STRUCTURE; the cryptography is verified in application code before INSERT and
again on every read (§10). Triggers do not make a superuser or table owner
incapable of tampering. The trusted decision (an OWNER signature) and the
database capability (the reviewer role) are deliberately separate: holding the
role is not authority.

## 9. Atomic execution, replay and concurrency

One READ COMMITTED transaction on a login holding exactly the reviewer
capability (a superuser, the table owner, a writer login, or a login holding
both capabilities is refused): verify the envelope against the trust set it
executes under → environment → database clock and key standing → expiry and
not-yet-valid → per-subject advisory lock (the same lock class as B2.2's
writer) → target on that subject → nonce unused → reload → refuse an integrity
hold → the **unchanged B2.2 judgement** (head, state digest, validator, kind
conflict) → recompute and compare every evidence digest → INSERT review →
INSERT attestation → COMMIT. Any refusal rolls back both.

**MEASUREMENT** (integration, disposable database): a replayed envelope and a
reused nonce are refused (`ENVELOPE_REPLAYED`); three concurrent competing
decisions and three concurrent identical submissions each advance the chain
exactly once; stale head, stale state, expired, future-dated, wrong
environment, unknown, retired and not-yet-active keys are refused; every
refusal leaves review and attestation counts unchanged.

## 10. Read-time verification and integrity hold

**DESIGN DECISION.** A review row is not authority because it exists. On every
`show` (and, in summary, `list`) each review is re-verified: exactly one
attestation, this environment, a nonce used once, a valid signature under a
pinned key, payload ↔ attestation ↔ review agreement, derived actor key,
instants inside the window and the key's lifetime, the target's content
unchanged, and — for the focal subject — the whole snapshot unchanged.

Anything else is an **INTEGRITY_HOLD** with explicit reasons. Under a hold (or
when the reader could not load attestations: the writer session's results say
`NOT_EVALUATED`) authority is withheld: `reviewConfirmed` is false,
`kinds.reviewed` is null, research reasons gain `REVIEW_INTEGRITY_HOLD`, and no
new decision may extend the subject's history. The raw review chain stays
visible as history.

**MEASUREMENT.** Raw-SQL reviews without an attestation, and with a
well-formed but forged one, read as holds; the database itself refuses an
attestation that binds a different target or arrives in a later transaction.

**Threat-model limit.** An attacker who controls both the database and this
codebase (and so the trust set) is outside these guarantees.

## 10a. B2.3-R2: one effective-review projection (authority isolation)

**FACT (root cause, reproduced before the repair).** §10 withheld authority
only at the end of the read model. `deriveSubjectReadModel` still passed the
RAW `graph.input.reviews` to `validateIdentityGraph` and to
`evaluateStructuralParentConstraint`, and B2.1 derives kind evidence
(`kindEvidenceOf`, via `reviewedKind`) and relationship-target identity from
those reviews. So, on synthetic data, with only `REVIEW_INTEGRITY_HOLD`
remaining visible:

| case | unattested / valid review                                                         | effect before R2                                                                         |
| ---- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| A    | forged CONFIRMED of an `INDEPENDENT_COMMUNITY` kind claim on an UNCERTAIN subject | `STRUCTURAL_PARENT_UNKNOWN` removed                                                      |
| B    | forged REJECTED of a `FACULTY_SCHOOL_DEPARTMENT` kind claim                       | `STRUCTURAL_PARENT_UNKNOWN` removed; the kind vanished from `kinds.claimed`              |
| C    | forged CONFIRMED of an `AFFILIATED_WITH` target subject                           | `RELATIONSHIP_TARGET_IDENTITY_UNRESOLVED` removed; `targetIdentityReview` read CONFIRMED |
| D    | VALID attested CONFIRMED independent kind                                         | parentage uncertainty cleared, no re-evaluation                                          |
| E    | D, then a new parent-implying kind claim                                          | the new claim was suppressed by the older confirmation                                   |

`researchAuthority.granted` stayed `false` throughout.

**DESIGN DECISION.** `effectiveReviewProjection`
(`subjectRegistry/reviewAttestation.ts`) is the ONE boundary between stored
review rows and every derived identity fact. It takes the per-review verdicts
of §10 and admits a target's review chain **whole or not at all**: a chain is
admitted only if every one of its rows is `currentlyAuthoritative`. A signed
review binds the head it superseded, so dropping one invalid row and keeping
the rest would let a later valid signature launder a forged, revoked or
tampered predecessor; and a forged decision appended to a valid chain does
not fall back to the valid prefix. A review no verification judged has no
verdict and so no authority (the writer session: `NOT_EVALUATED`). Admitted
chains are still judged by the unchanged B2.1 chain rules.

The read model reads the same graph three ways:

- **recorded** — every stored review: history (`review`, `identityReview`,
  `reviewHeadId`, coverage) and INVALID integrity findings;
- **effective** — only admitted reviews: every fact (`effectiveReview` on each
  claim and relationship, `effectiveIdentity`, `kinds.claimed`,
  `kinds.reviewed`, `targetIdentityReview`, `structuralParentage`, conflict,
  unresolved and review-signal findings, missing evidence);
- **baseline** — no review at all (used by §11a).

A withheld chain reads `AUTHORITY_WITHHELD`, never CONFIRMED or REJECTED, and
its target is listed in `effectiveIdentity.withheldTargets`. `show`, `list`
and the writer's result read model all use this projection; the writer still
refuses any decision on a subject on hold (§9). B2.1 is unchanged. The key
names say _effective_ deliberately: B2.2-C pins that no read-model key says
`verified`.

## 11. A review is not research clearance (G5)

**DESIGN DECISION.** A review establishes a factual interpretation of Track
B's own provisional evidence. It grants nothing:

- `researchAuthority.granted` stays the literal `false`; no code path admits a
  subject to research; `nwf_research` still cannot read the subject tables.
- Any review — even a valid one — of a structural `PART_OF` claim adds
  `REQUIRES_PROTECTION_REEVALUATION`. A factual correction (an independent
  association wrongly recorded as part of a university) never clears a
  restriction by itself; `NO_KNOWN_STRUCTURAL_PARENT_BLOCK` is never surfaced
  as permission.
- B3.0 is byte-identical; no protected cohort artifact is loaded; tests use
  synthetic protected-parent fixtures only.

A future research-admission mechanism must independently evaluate raw
evidence and history, current reviewed relationships, protected-cohort
authority, identity uncertainty, suppression constraints and explicit OWNER
execution authority. B2.3 does not implement it.

## 11a. B2.3-R2: a monotonic protection projection

**DESIGN DECISION.** Authority isolation alone is not enough: a GENUINE
review can change the structural reading (case D), and a forged one, once
withheld, could make the effective reading more permissive than the recorded
one (a forged REJECTED `PART_OF` that was holding a parent requirement open).
`protection` is therefore computed across all three readings and only ever
adds restrictions:

- `structuralParentage.{unreviewedBaseline, recordedReviews, effectiveReviews}`
  — the B2.1 evaluator's UNRESOLVED reason under each (protected keys: none;
  its "no known block" answer is never surfaced);
- `structuralUncertainty` — their union. Research reasons carry every member as
  `STRUCTURAL_PARENTAGE_UNRESOLVED:<reason>`;
- `relationshipTargetIdentityUnresolved` — the subject's relationship claims
  whose target identity is unresolved under ANY reading;
- `reevaluationTriggers` → `REQUIRES_PROTECTION_REEVALUATION`:
  `STRUCTURAL_CLAIM_REVIEWED` (the §11 rule, kept), `REVIEW_CHANGES_STRUCTURAL_READING`
  (the recorded or effective reading differs from the baseline in parentage or
  in the kind evidence of any subject in the structural closure) and
  `PROTECTION_RELEVANT_EVIDENCE_AFTER_REVIEW` (an `ENTITY_KIND` or `PART_OF`
  claim of the subject that no current attested decision's covered snapshot
  includes);
- `evidenceAfterAttestation` — every such uncovered record, relevant or not.

So a forged, revoked or genuine review never removes a restriction the
unreviewed evidence raises; a verified factual correction is still shown as a
fact, alongside a re-evaluation requirement; a review of unrelated evidence (a
name) adds nothing; and a later claim does not invalidate an earlier
attestation (its `coveredRecordIds` are fixed by the signature) but does change
the current reading — and the state digest, so an approval prepared before it
cannot execute. The structural closure follows ancestors only, as B2.1's
evaluator does; the B3.0 registry is never loaded and B3.0 is byte-identical.
This projection is not an admission decision and never reports a subject as
unblocked.

## 12. Canonical identity boundary

ADR 0021 RC2 §1–§2 stand. Track B reviews its own provisional evidence; it
issues no `cand:`, `chn:` or `opp:` identifier, no verified Channel, no
SAME_ACTOR, no merge or split, no Opportunity, Distribution Action or outreach
permission. A B2.3 envelope is evidence a future, separately authorised B→I0
process may assess; it is **not** an I0 registration token. No B→I0
integration exists here.

## 13. Historical compatibility (FACT)

Migrations 0001–0014, ADRs 0001–0020, every OWNER record and every pinned
firewall are unchanged. Five historical tests carry acknowledgements, each
pinned line by line in the B2.3 firewall: the schema inventory and the A1
manifest name 0015; the B2.1 grant inventory excludes the reviewer (as it
already excluded the writer); and three B2.2 assertions that an UNATTESTED
review confirms now assert that it does not — the deliberate change this slice
exists to make.

**B2.3-R2 (FACT).** Three further historical B2.2 lines change, pinned the same
way. Two (unit and integration) asserted that an UNATTESTED rejection removes
a kind from `kinds.claimed`; that is exactly the authority leak of §10a, so
they now assert the kind stays claimed while the recorded head still reads
REJECTED. One (B2.2-C) pins the exact key set of a claim view; it gains
`effectiveReview` — still no verified, owned or channel field.

## 14. Not authorised here

Provisioning, generating or registering any operational key; activating review
in any persistent database; production or shared migrations; B→I0 handoff;
research admission; canonical issuance; real organisations; outreach;
committing, pushing, merging or deploying.

## 15. Next steps (recommendation only)

1. OWNER review and local commit of B2.3 including R2, then a separate
   commit pinning `REPAIR_TERMINAL_COMMIT` in the B2.3 firewall.
2. Separately: an OWNER key-custody and provisioning decision (where the key
   is generated, how it is backed up, rotation and revocation procedure), then
   a reviewed source change adding one ACTIVE entry, then an explicit
   activation approval.

## 16. B2.3-R2 validation (MEASUREMENT)

All on one disposable PostgreSQL 16.15 container (local image
`postgres:16-alpine`, `--pull=never`, tmpfs data, no volume, 127.0.0.1 dynamic
port, random superuser password, migration-created runtime logins rotated to
random passwords, removed afterwards). No HTTP, no DNS, no real organisation,
no protected-cohort content, no operational key.

- **Root-cause reproduction:** cases A–E of §10a, before the repair, exactly as
  tabled; after it, all five fail closed.
- **Focused:** B2.3 unit 56/56; B2.3 integration 21/21; B2.3 firewall 30/30;
  B2.2 unit 45/45 and integration 32/32; B2.1 unit 75/75 and schema 17/17;
  B3.0 unit 67/67 and integration 9/9; every firewall file (28 files with the
  above, 755 tests) passed; migrations check OK (15, sequential).
- **Negative mutations** (each applied alone, then reverted, hash-checked):
  M1 every chain admitted → 10 tests fail (A–C, forged PART_OF, bad signature,
  revoked key, laundering, list, B2.2 rejected-kind, aggregate); M2 per-row
  instead of whole-chain admission → laundering test fails; M3 effective-only
  uncertainty → 5 fail; M4 no reading-change trigger → 6 fail; M5 no
  evidence-after trigger → 2 fail.
- **Full `npm run validate`** (2026-10-16T14:31:13Z–14:40:40Z): EXIT 0;
  migrations check, typecheck, lint, format check, build all clean; 346 test
  files (341 passed, 5 skipped), 10,405 tests (10,330 passed, 75 skipped). All
  75 skips are pre-existing classifier-evaluation suites gated on absent local
  artifacts; none is a B2.x or B3.0 test.
