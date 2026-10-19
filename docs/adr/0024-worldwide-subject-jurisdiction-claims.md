# ADR 0024 — Worldwide jurisdiction evidence for discovery subjects (Global Foundation R4)

- **Status:** Proposed. LOCAL, synthetic-only implementation under the OWNER's
  R4 brief ("Global Organisation Foundation", 2026-10-19). Not committed by
  the OWNER, not ratified, not deployed. Migration 0016 has been applied only
  to a disposable tmpfs PostgreSQL 16 test database.
- **Date:** 2026-10-19
- **Base:** Engine `ce8b220` (B2.5 F-1 correction R3, parent `dbfccc4`).
- **Extends:** ADR 0019 (discovery-subject identity). **Supersedes nothing.**
- **Owner brief record:** `docs/evaluation/GLOBAL_FOUNDATION_R4_OWNER_BRIEF_RECORD_V1.json`.
  It records the R4 brief's scope. It is not a ratification.
- **Numbering:** ADR 0021 (Operator RC2), 0022 (Insights, reserved) and 0023
  (B2.3) are taken. 0024 and migration 0016 were checked free across every
  local ref of both repositories.

Claims are tagged **FACT**, **DESIGN DECISION** or **UNKNOWN**.

## 1. Problem

The OWNER wants partnership discovery to work worldwide. The schema must not
stay restricted to European ECHE institutions.

**FACT.** Migration 0013 can already represent an organisation that is not an
ECHE source row:

- A `discovery_subjects` row is an opaque uuid with no mandatory parent.
- Its names (including `NATIVE_NAME` with a BCP-47 language), kinds, websites
  and relationships are claims.
- Each claim carries provenance that does not depend on `eche_row_key`: a
  public URL plus an optional SHA-256 of the captured content.
- Eight kinds cover student associations, network (ESN-like) chapters,
  communities and informal groups.

**FACT.** What 0013 cannot record is _where_ such an organisation operates, or
what legal form a source says it has. The only country in the schema is
`organisations.country_code`, which is ECHE's own `Country Cd` and exists only
for ECHE source rows.

## 2. Decision

**DESIGN DECISION.** Add one additive, append-only table,
`subject_jurisdiction_claims` (migration 0016), and one immutable predicate,
`subject_iso3166_alpha2_assigned`. Nothing else in the schema changes.

A row is **one source's statement** about one subject. It states one of:

- `COUNTRY_OF_OPERATION` (an ISO code),
- `COUNTRY_OF_REGISTRATION` (an ISO code),
- `LEGAL_FORM` (`REGISTERED_LEGAL_ENTITY`, `UNREGISTERED_INFORMAL_GROUP` or
  `UNIT_OF_LARGER_ENTITY`).

The rules:

- **No row means UNKNOWN.** It never means a default, never "no jurisdiction",
  and never permission.
- **Countries come from ISO.** A country must be one of the 249 officially
  assigned ISO 3166-1 alpha-2 codes (tzdata 2026e `iso3166.tab`, ISO/TC 46
  N1127). XK, EU, UK, user-assigned codes and lower-case codes are refused.
- **Rule 2 is enforced in SQL.** `claim_basis` admits `SOURCE_STATED` only, so
  a country inferred from a name, language, domain or Erasmus prefix cannot be
  stored.
- **Provenance is 0013's.** The source is page evidence, a website claim, or a
  public URL. URL admissibility is B2.1's SQL predicate, so social-platform and
  mailbox-shaped sources are refused.
- **Conflicts persist.** Rows that disagree all stay. The pure
  `deriveJurisdictionStanding` (`src/orgunits/subjectJurisdiction/`) reports
  `UNKNOWN`, `STATED` or `CONFLICTING`. It never picks a winner, never repairs
  a claim, and never propagates a claim along a relationship.

## 3. What is deliberately absent

- **No change to anything earlier.** Migrations 0001–0015 are byte-identical.
  No ECHE row, website claim, B2.x table, frozen record or cohort pin changes.
- **No runtime write path.** No runtime role, including the B2.2 writer and
  the B2.3 reviewer, may INSERT. Only the migration owner can, as 0013 stood
  before B2.2. A writer is a later, separately approved slice.
- **No outreach columns.** There is no contact, permission, consent,
  legal-basis, eligibility, outreach, market, locale or target-language
  column. Whether contact is lawful in a jurisdiction is not decided here.
- **No identity effects.** A shared country or legal form links nothing. A
  subject's country is never its PART_OF target's country.
- **Not in any cross-track contract.** Nothing reads the table in production.
  It is not part of the B2.4 handoff, the B2.5 snapshot or any digest, so
  every existing digest is unchanged.
- **A non-ECHE `HIGHER_EDUCATION_INSTITUTION` kind is NOT added.** It would
  widen 0013's CHECKs, the B2.4 handoff vocabulary and the I0 mapping, which
  is a cross-track contract change for the OWNER.

## 4. What remains ECHE-specific (FACT)

- **Research acquisition.** Runs, fetches and page evidence are rooted in
  website claims or promotions anchored on `eche_row_key`. A non-ECHE subject
  cannot be researched by the orchestrator.
- **`organisations`.** It is ECHE source rows only.
- **The Operator.** Organisation records, cloud release and registry tables,
  and the Outreach existence gate are all keyed by an ECHE-backed Engine
  organisation. ADR 0021 RC2 §7 requires non-ECHE counterparts to refuse there
  until a counterpart-level model exists.

## 5. Consequences

The Engine can hold source-stated, ISO-checked jurisdiction evidence for any
subject worldwide. The demonstrations are a Japanese student association, a
Brazilian language organisation, and a French ECHE faculty whose jurisdiction
stays UNKNOWN. None of this unlocks research, qualification, visibility or
outreach.

**UNKNOWN:** the legal eligibility of any outreach channel in Japan, Brazil or
anywhere else.

## 6. Future decisions (recorded, not implemented)

Recorded under the OWNER's R4.2 brief ("R4.2 Final Closure", 2026-10-19).
This ADR stays **Proposed**; R4.2 closes R4's commit range, but it ratifies
nothing and does not activate migration 0016. Nothing below is implemented.

- **Multi-country operations versus genuinely conflicting claims.** Today two
  `COUNTRY_OF_OPERATION` rows naming different countries are just two claims. Whether
  that is one subject operating in both, or two sources disagreeing, is
  **UNKNOWN** and nothing derives either reading.
- **OWNER review of jurisdiction evidence.** There is no review, attestation
  or reviewed state for a jurisdiction claim. Whether one is wanted, and
  whether it should reuse the B2.3 OWNER-attestation pattern (ADR 0023), is
  open.
- **Cross-track jurisdiction handoff and contact-permission authority.**
  Jurisdiction evidence enters no cross-track contract (B2.4 handoff, B2.5
  snapshot, I0). Who may decide that contact is permitted in a jurisdiction,
  and on what evidence, is unassigned. A jurisdiction claim grants no
  permission of any kind.
