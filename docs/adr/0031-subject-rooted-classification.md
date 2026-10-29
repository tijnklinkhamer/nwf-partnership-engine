# ADR 0031 — Subject-rooted classification for independently admitted organisations

- **Status:** Proposed. LOCAL, synthetic-only implementation under the OWNER
  decision of 2026-10-29 (relayed by the integration lead, folded into the
  pending R2-P3 release, no new track or phase). Not ratified, not pushed,
  not applied to any persistent database.
- **Date:** 2026-10-29
- **Package:** R3P3-A (branch `r3p3/engine-insights-standalone-v1`)
- **Extends:** ADR 0009/0010/0011 (the classifier runtime, unchanged),
  ADR 0025 (subject research admission), ADR 0030 (CAMPAIGN admission).
- **Supersedes:** ADR 0025 **D8** ("the classifier is unchanged and cannot
  take subject-rooted evidence"), **for subject-rooted classification only**
  and only as stated in s3. Every other ADR 0025 decision stands.
- **Migration:** `migrations/0030_subject_rooted_classification.sql`
- **Scope record:** `docs/evaluation/R3P3_A_SUBJECT_ROOTED_INSIGHTS_OWNER_DIRECTIVE_RECORD_V1.json`
- **Operator counterpart:** the `SUBJECT_ADMISSION` insight-card root
  (Operator `docs/architecture/PARTNERSHIP_INSIGHTS_STANDALONE_SUBJECT_ROOT_V1.md`).

Claims are tagged **FACT**, **DESIGN DECISION**, **UNKNOWN**.

## 1. Problem

**FACT.** The OWNER's strategy puts independent student, language and
cultural organisations first. They are now discoverable (ADR 0026–0028),
researchable under a subject admission (ADR 0025, CAMPAIGN or OWNER_REVIEWED
basis, ADR 0030), admissible to I0 without a university relationship
(Operator standalone handoff v2), qualifiable and manageable in Track D. But
their research could not be classified: `orgunit_classifier_calls.eche_row_key`
was `NOT NULL` and `orgunit_classifier_calls_root_key_chk` admits only
`claim:`/`promotion:` (migration 0009; ADR 0025 D8). So their Track A
Insights were permanently unpublishable — which the OWNER decision of
2026-10-29 names as breaking the integrated product requirement.

## 2. Decision in one paragraph

**DESIGN DECISION.** A subject-rooted research run may be classified by the
same runtime, under the same Claude-Max-only provider rules, through a
separate operator command, `nwf-pe orgunits subjects classify
--subject-admission-id <uuid> --run-id <uuid> --model <id> [--attempt <N>]
[--execute] [--json]` (dry run by default). Its calls name the ADMISSION as
their root — never an invented `eche_row_key` or `organisation_id` — and the
database pins each to that admission's own run. The batch is the REL harvest
H2 subject handoff (unchanged); the system prompt is the frozen production
prompt with exactly two context substitutions, under its own version.

## 3. What changes, exactly

| piece            | where                                                       | rule                                                                                                                                                                                                                 |
| ---------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| call root        | migration 0030 s A                                          | `root_subject_admission_id` → `subject_research_admissions(id)` (the approval table, never revocations). Set ⇔ `eche_row_key`, `organisation_id` and `root_key` are NULL (`_subject_root_chk`); unset ⇔ an ECHE key. |
| run pin          | migration 0030 s B                                          | generated `run_root_scope` + composite FK to `orgunit_research_runs (id, root_scope)`: a subject call only under its admission's run, an ECHE call only under an ECHE run                                            |
| authority        | `src/orgunits/subjectClassify/authority.ts` (research role) | admission exists, is NOT revoked, is OPERATIONAL (TEST_ONLY only in vitest); run is this admission's and COMPLETED                                                                                                   |
| cohort rule      | `src/orgunits/subjectClassify/cohort.ts` (pure), s4         | ALLOWED_OUTSIDE_EVALUATION_FRAME only with every proof fact                                                                                                                                                          |
| assembly         | `src/orgunits/subjectClassifierHandoff/assemble.ts`         | **unchanged** (REL harvest H2); read as the research role                                                                                                                                                            |
| prompt           | `src/orgunits/subjectClassify/prompt.ts`                    | `orgunit-subject-classifier-prompt-v1`: v7.2 bytes with two substitutions, base SHA-256 pinned, reversibility proved per call                                                                                        |
| runtime          | `src/orgunits/subjectClassify/run.ts` (classifier role)     | identity → COMPLETED reuse → call row before provider → ONE provider call → unchanged validator → accepted rows → completion. No repair round.                                                                       |
| command          | `src/cli/commands/subjectClassify.ts`                       | `nwf-pe.subject-classifier-operator.v1` envelope with `--json`                                                                                                                                                       |
| versions on call | —                                                           | prompt `orgunit-subject-classifier-prompt-v1`, classifier `orgunit-subject-classifier-assembly-v1`, schema `orgunit-classifier-output-schema-v2`                                                                     |

**FACT: what does not change.** `classify/` is not edited (no file, no
prompt byte, no model pin, no contract); the ECHE operator command
`orgunits classify`, its envelope `nwf-pe.classifier-operator.v1` and its
guard are unchanged; no historical row is rewritten; every 0009/0011 CHECK
is byte-identical; `nwf_classifier` keeps SELECT+INSERT on its four tables
and gains NO privilege — in particular none on any discovery-subject table:
the admission foreign key is checked by the referential-integrity trigger as
the table owner, and the authority reads run as `nwf_research`, which
migration 0017 already granted SELECT on the admission tables. No frozen
2D2C study artefact, evaluation item or `FETCH_POLICY_VERSION` coupling is
touched. HOLDOUT stays prohibited (s4).

## 4. The evaluation-cohort rule for subject-rooted research

**DESIGN DECISION.** The ECHE guard (`evaluationCohortGuard.ts`) admits an
organisation only when its `(organisation id, eche_row_key)` pair is the
frame's own binding; a subject has neither, so that guard cannot judge it —
and "not in the frame" must never be read as "allowed" on its own. The subject
rule instead PROVES that the run cannot be an evaluation item, against the
SAME pinned registry (unverifiable artifacts refuse in every mode):

1. **The registry is ECHE-keyed.** Every protected key and every frame key has
   the `normalised(erasmus_code)|pic` shape (all 6,139 committed frame keys
   do; a unit test pins it). DEV_TRAIN, DEV_CONFIRM, FINAL_HOLDOUT, the
   reserve, replacements, R50 and the historical set are ECHE source rows by
   construction of the draw; the check makes that a verified property of the
   loaded artifacts.
2. **The run names no ECHE row and no organisation.** Its root scope is
   `subject_admission:<this admission>`, and its fetch rows carry
   `eche_row_key IS NULL AND organisation_id IS NULL` (migration 0017's CHECK;
   the counts are re-read).
3. **Every fetched registrable domain is isolated.** None is named by any
   website claim (ECHE or FR register, any structural status) or any promoted
   redirect target — ADR 0025 Q2, enforced at admission and before the first
   request, re-checked at classification time with the same read
   (`loadIsolationDomains`). No page of the run is a page of any frame
   member's claimed website, whatever the subject's name says.
4. **No identity collision.** Neither the subject id nor the admission id is
   an organisation id the registry binds.

Any failure refuses with a bounded detail; there is no "not checked" outcome.
The rule is not a skip of the guard: it is a different, stricter proof for a
population the ECHE guard was not built to judge.

## 5. Security and trust implications

- The classifier still sends nothing to an organisation and stores no contact;
  a subject-rooted classification is INFERENCE exactly like an ECHE one and
  authorises nothing (0009's table comment applies unchanged).
- The provider path is the landed Max-only adapter, constructed only on
  `--execute`, only after every gate, only when a batch needs a new call.
- A revoked admission refuses classification; an expired one does not (the
  evidence was acquired while it was live — the gateway re-resolved it before
  every request; classifying evidence at rest is not a request).
- Identity review is not a classification gate (CAMPAIGN admissions precede
  review, ADR 0030 s2). Publication is: the Operator binds a card only to the
  organisation the VERIFIED I0 identity binds to the subject (Operator design
  note), which requires the OWNER-signed review.

## 6. Permission tiers

| tier                          | state after R3P3-A                                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| Synthetic classification      | implemented and tested (disposable PostgreSQL, scripted transport, fake provider, TEST_ONLY admissions)  |
| Real subject classification   | needs: this ADR accepted, migration 0030 applied to `nwf_pe` (OWNER grant), a real OPERATIONAL admission |
| Publication of a card from it | needs everything ADR 0022 already needs, plus the Operator subject root (its own design note)            |

## 7. UNKNOWN / open

- The derived prompt has no evaluation of its own; the v7.2 study (DEV only)
  covered ECHE pages. Subject pages are outside that population whatever the
  prompt. Publication still requires the OWNER's per-card approval.
- `classifierInputCoverage` on the Operator needs the subject assembly's
  excerpt bound (2,000 code points, the same `MAX_EXCERPT_CODE_POINTS`); it is
  mirrored there.
