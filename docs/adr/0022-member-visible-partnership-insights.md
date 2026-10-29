# ADR 0022 — MEMBER-visible, OWNER-approved Partnership Insights on released organisations

- **Status:** Accepted — 2026-10-29
- **Phase:** Partnership Insights
- **Decision date:** 2026-10-29 (OWNER)
- **Proposed on:** 2026-10-26.
- **Extends:** ADR 0017, narrowly (§2.4, §2.5, §2.9, §3 and the G2 consequence). Supersedes nothing.
- **Source:** the governance draft V3, §1 (`docs/architecture/PARTNERSHIP_INSIGHTS_GOVERNANCE_DRAFTS_V3.md` at Operator `b614e64`), which still calls this decision "ADR 0018". It is renumbered here to the reserved Insights number 0022 and is otherwise unchanged in substance.
- **Authority binding:** `INSIGHTS_AUTHORITY` in `server/engineView/policy.ts` (`050ae34`, cherry-picked from `bf2b09f`) and `docs/architecture/PARTNERSHIP_INSIGHTS_ADR_AUTHORITY_BINDING_V1.md`. `INSIGHTS_AUTHORITY` is set from this file's exact bytes in a separate OWNER-reviewed Operator commit.

---

## A. How this record was made, and why it cannot authorise anything

1. **Renumbering.** ADR numbers form one series across the Engine and Operator repositories. Engine ADR 0018 is Track B's _Section-fair ordering among tied frontier candidates (fetch policy v8)_; 0019 and 0020 are Track B; 0021 is the Operator B/C/D contract. The Insights decision has number 0022, reserved on 2026-10-16 (binding record §2). Every "ADR 0018" in the V3 draft's §1 and §2 that names the Insights decision reads "ADR 0022" here. No reference to Track B's Engine ADR 0018 survives as an Insights reference.
2. **Proposed is not an authority.** The insight-card gate does not read ADR numbers or status words alone. It binds the **whole accepted document**: its number (`0022`), its path (`docs/adr/0022-<slug>.md`), its title, its parsed header with the **exact** Accepted status (`Accepted` or `Accepted — YYYY-MM-DD`), its decision date and phase, and the SHA-256 of the file's exact bytes at the exported Engine commit (`insightsAuthorityDefect`, `adrRecordIsInsightsAuthority`, `storedAdrDigestIsInsightsAuthority`). This file says `Proposed`, so:
   - an authority pinned from these bytes is malformed (`insights_authority_status`) and authorises nothing;
   - while `INSIGHTS_AUTHORITY` is `null` (`insights_authority_unset`), no record authorises insight cards, whatever its number or status.
3. **Acceptance procedure (not performed).**
   1. The OWNER changes the status line to exactly `Accepted` (or `Accepted — YYYY-MM-DD`) in the file the exporter reads, the Engine repository's `docs/adr/0022-member-visible-partnership-insights.md`. That edit changes the bytes, so a digest of this Proposed text can never be the authority.
   2. A separate OWNER-reviewed commit sets `INSIGHTS_AUTHORITY` from the accepted file's exact bytes.
   3. Any later edit of the accepted file, a supersession included, changes its digest and closes the gate again.
4. **Every other gate stays independent.** The ADR 0017 amendment, G3-PIM1 / `MEMBER_INSIGHTS_ASSESSMENT`, `OPERATIONAL_INSIGHT_PROMPT_VERSION`, the publication register, the OWNER switch and the ADR 0017 CLASSIFICATION gate are unaffected by this document. All of them are unset or closed.
5. **R3P3-A amendment (2026-10-29, before acceptance).** The OWNER decision of 2026-10-29 extends clauses B.4 and B.5 to independently admitted organisations: a third root authority, the subject research admission (Engine ADR 0031, migration 0030; Operator `PARTNERSHIP_INSIGHTS_STANDALONE_SUBJECT_ROOT_V1.md`). This is the "further amendment" of the binding and root rules that section B requires, and it is the only change in substance from the V3 draft's §1. Every other clause is unchanged.

## B. Decision (proposed)

The OWNER-signed engine-view snapshot may carry one additional, explicitly bounded class, `PARTNERSHIP_INSIGHTS`, made of insight cards. A MEMBER may read the MEMBER projection of these cards for organisations that are currently released and not withdrawn. A MEMBER may read nothing else that is derived from the Engine.

1. **OWNER publication approval only.**
   - A card is published only while it has an _effective_ OWNER publication approval: an approval that is recorded, not revoked and not superseded, in the OWNER publication-approval register.
   - No card is ever created or approved automatically. A classifier verdict, unit name or URL never becomes a card without that approval.
   - Drafts, pending reviews and rejections never leave the Mac.
2. **Meaning of the approval.**
   - The approval decides _publication_, and it is carried as `OWNER_PUBLICATION_APPROVAL_NOT_MODEL_VALIDATION`.
   - It is not classifier adjudication. It is not an evaluation, gold or human label. It is not a formal or independent validation of the model, and it must never be presented, counted or used as one.
   - It never changes the Engine's `NO_HUMAN_REVIEW_RECORDED` review state. It never counts as the deferred R52/A4 review, as sealing V72-L or as the ANGOULE21 reviewer act, and it never unblocks Axis B.
   - The register has no correctness or accuracy field.
   - Its approvals and rejections must not be used to compute precision or recall, to develop prompts, or to select evaluation items.
3. **Register.**
   - The register is append-only and Operator-owned, on the OWNER's Mac. It is separate from the Engine database, from the Outreach store and from every classifier evaluation, label, gold or adjudication record.
   - It holds immutable card versions, approvals and terminations (revocation or supersession). "Effective" is derived from the records and never stored.
   - The full register stays local. Only the minimum approval metadata in clause 6 is exported.
4. **Binding.** Each approval is immutably bound to exactly:
   - one organisation, which the evaluation-cohort guard classes ALLOWED (ADR 0017 §2.9); for a subject-admission root (clause 5), the organisation that the verified I0 identity binds to the admitted discovery subject, with the subject research outside the evaluation frame by the proof of Engine ADR 0031 §4;
   - one page classification with verdict `UNIT_PAGE`, from a COMPLETED or PARTIAL call at the operational prompt;
   - that classification's call, prompt, classifier and output-schema versions and input digest;
   - one page evidence row and its content digest;
   - the fetch that produced it;
   - the fetch's root authority, as in clause 5;
   - the source URL;
   - the approval-policy version.

   A binding digest seals these. At every export the exporter recomputes the digest from the current Engine rows. The approval is invalid when the digest no longer matches, when any condition here fails, or when a newer classification of the page (or newer evidence for the same organisation and URL) exists.

5. **Root authority.**
   - The source URL must be the requested URL of the bound fetch, and that fetch's own root authority must still hold. That means one of:
     - the website claim was `STRUCTURALLY_VALID`;
     - the root promotion has been explicitly approved and is currently unrevoked;
     - the subject research admission (an OWNER or OWNER-signed-campaign approval of the subject's own SOURCE_STATED website claim) exists, is OPERATIONAL and is currently unrevoked, the bound classification's call names that same admission, and the verified I0 identity binds the subject to the card's organisation. No university affiliation is stated or implied, and no name or domain is ever used to join identities.
   - The URL's host must lie within that root's registrable domain.
   - No preferred or canonical website is ever inferred. `organisations.canonical_domain` is never used. A same-domain URL that is not the bound fetch's URL is refused.
6. **Publication integrity.**
   - The normal export includes every effective approved card. If any one of them is invalid, stale, revoked, mismatched or bound to a non-ALLOWED organisation, the export is **refused**.
   - Cards without an effective approval are excluded and never block the export.
   - The cloud import re-validates every card against the same snapshot. It checks that the bound classification is present, is `UNIT_PAGE` and belongs to the same organisation; that the protected-cohort declaration is present; that the bounds hold; and that the digest matches. Any failure refuses the whole batch.
   - A card-free replacement snapshot for revocation is produced only by a separate, explicitly invoked OWNER export mode. It passes every other validation, the signature, the strict sequence and MFA-authorised push. It is never a bypass.
7. **MEMBER fields (closed allowlist):**
   - the OWNER-confirmed unit label, which must appear in the bound page's title or headings;
   - the unit kind (closed set);
   - one official source URL (rules in clause 5 and the S1 URL rules);
   - three capability states: `SUPPORTED_BY_REVIEWED_SOURCE_EVIDENCE` or `NOT_ESTABLISHED_BY_REVIEWED_EVIDENCE`;
   - 1–3 potential NWF use cases (closed set, fixed sentences);
   - the analysed-on date, the reviewed-on date and the fixed basis state.

   **Never to a MEMBER:**
   - the organisation id on the card (it is used only for the join);
   - binding ids, approval id, approval metadata, the policy version or any digest.

8. **Never published (MEMBER or OWNER cloud):**
   - internal review notes; reviewer identity beyond the role OWNER; raw page text, titles, headings, quotes or rationale;
   - confidence, score, rank or count; model, prompt, token or call data on the card; research diagnostics;
   - personal names or contact data, and any contact-directory page;
   - anything concerning evaluation cohorts.
9. **Indistinguishability and no oracle.**
   - For a MEMBER, every organisation id without a visible card returns the same status and the same bytes, whatever the reason. Reasons include: protected, unresearched, unreviewed, rejected, revoked, invalid, withdrawn, unreleased, unknown, gate or switch closed, dataset absent.
   - No count, total or aggregate is served to a MEMBER.
   - An invalid published card closes only its own organisation.
10. **Per-request checks.** The MEMBER route re-checks all of these on every request, with no caching:
    - the caller's admission and role;
    - that the release is current (`withdrawn_at IS NULL`);
    - the signed feature authorisation;
    - the OWNER switch.

    It never relies on `CLOUD_RELEASED_VIEW`.

11. **Not a qualification, not permission.**
    - A card is context. It never triggers, prefills or schedules outreach.
    - Commercial qualification, lawfulness of contact and Do-Not-Contact status stay outside its authority.
    - Migration 0009's "never permission" rule and D-4 stand.
12. **Revocation, disable, purge.**
    - **Revocation:** an OWNER termination in the register, followed by a superseding snapshot. The superseding snapshot is either the next normal export or the card-free revocation export.
    - **Emergency disable:** two gates, both required to serve (section C).
    - **Physical purge** of superseded cloud rows stays a separate OWNER-approved operation.
13. **Unchanged.**
    - Research, Classifier, Corpus, Governance and every `/engine/*` route stay OWNER-only with MFA.
    - There is no cloud execution.
    - The protected-cohort guarantees of ADR 0017 §2.9 and G3-PCX1 are unchanged and apply to this class.

**Requires a further amendment:** any other field; automatic card creation or approval; MEMBER feedback; scoring or ranking; free text; third-party or public exposure; any change to the binding or root rules.

## C. Emergency disable: two gates (adopted in principle; mechanism NOT APPROVED)

1. **Gate 1, signed code-level authorisation.** `MEMBER_INSIGHTS_ASSESSMENT: string | null`. It is `null` until G3-PIM1 is signed. After that it is set in a dedicated commit to that exact identifier, and a test pins it. `null` means no MEMBER insights.
2. **Gate 2, OWNER cloud switch.** An append-only, audited event table in `nwf_cloud`. The current state is the latest event. Serving requires `OPEN`, and the event must name the same authorisation identifier as Gate 1.
3. **Fail closed.** Each of these means `NO_VISIBLE_INSIGHTS` for every MEMBER request: the table is missing, or the read fails or times out; there is no event, or the latest event is `CLOSED`; the event's authorisation differs from the constant; the sequence breaks; Gate 1 is `null`.
4. **Closing** takes one OWNER act and is effective on the next request, with no build, deploy or snapshot, and nothing cached. **Reopening** is never automatic: it takes an OWNER act from the Mac that names the deployed authorisation.
5. The switch only stops serving. Removing data stays revocation plus a later physical purge.

The migration, security and operations design of the switch needs a separate approval.

## D. Separation from classifier review, adjudication, labels and validation

|                         | OWNER publication approval (this ADR)    | Classifier adjudication / evaluation labels       | Formal model validation                          |
| ----------------------- | ---------------------------------------- | ------------------------------------------------- | ------------------------------------------------ |
| Question answered       | May this one card be shown to the team?  | What is the correct label for an evaluation item? | How accurate is the model on a protected sample? |
| Population              | ALLOWED organisations only, structurally | Draw V2 splits, R50, and so on (protected)        | FINAL_HOLDOUT / DEV_CONFIRM                      |
| Store                   | Operator publication-approval register   | Engine evaluation artefacts (committed JSON/MD)   | Sealed evaluation packages                       |
| Accuracy field          | None                                     | Yes                                               | Yes                                              |
| Effect on `reviewState` | None (`NO_HUMAN_REVIEW_RECORDED`)        | n/a until R52 lifts                               | n/a                                              |

- The register is never read by evaluation tooling, never exported to evaluation artefacts, and never used for prompt work.
- If the operational prompt is rolled back, every approval bound to the rolled-back prompt becomes invalid. The next normal export is then refused until the OWNER terminates the affected approvals, or the OWNER uses the card-free revocation export. This is intended to fail closed.
- **Open risk (OWNER judgement):** a set of rejections is still informal evidence about the classifier. Mitigation: OWNER-only, no reason codes about correctness, and no export.

## E. Companion texts (separate acts, NOT ACCEPTED)

- **ADR 0017 amendment.** The narrow five-insertion diff in the V3 draft §2, with every "ADR 0018" there read as "ADR 0022".
- **G3-PIM1** (V3 draft §3). Its signature authorises the value of `MEMBER_INSIGHTS_ASSESSMENT`; it does not open the OWNER switch.
- **Decision-sheet amendments** (V3 draft §4), with "ADR 0018 card fields" read as "ADR 0022 card fields".

Accepting this ADR accepts none of them, and none of them sets `INSIGHTS_AUTHORITY`.
