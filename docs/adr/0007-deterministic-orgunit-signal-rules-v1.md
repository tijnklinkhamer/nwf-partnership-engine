# ADR 0007 — Deterministic orgunit signal rules v1

- **Status:** Accepted
- **Date:** 2026-08-26
- **Phase:** 2B-1d (deterministic signals and language packs — pure functions only)
- **Supersedes:** nothing. **Extends:** ADR 0004, ADR 0005, ADR 0006.

---

## 1. Context

ADR 0004 through ADR 0006 built a single-page acquisition capability: an
authorised root, a policy-governed gateway, robots evaluation, charset
resolution, safe HTML extraction and PII redaction. None of it decides which
URL is worth fetching, and none of it decides which fetched page deserves a
later semantic classifier's attention. This slice builds that decision layer —
as **pure functions only**. It opens no socket, calls no gateway, reads no
sitemap, persists nothing, and orchestrates nothing. See CLAUDE.md's "What
Phase 2B-1d built" for the exhaustive list of what remains absent.

---

## 2. DESIGN DECISION — two scores, never one

The central architecture is two independent, differently-typed entry points:

- **`scoreFrontierUrl`** (recall-oriented) decides what a bounded frontier
  should fetch NEXT. It runs before the target page has been fetched, and may
  use a bounded, decaying contribution inherited from a strong ancestor
  section of the URL tree.
- **`scoreFetchedPageCandidate`** (precision-oriented) decides which
  already-fetched page deserves a place in a later semantic classifier's
  top-k handoff. It considers ONLY a page's own evidence — its own URL, its
  own title, its own headings.

The 2026-08-24 holdout (ADR 0004 §3, §9) is the reason these are separate
functions with separate input TYPES rather than one function behind a
`mode: 'frontier' | 'candidate'` flag. A flag-based API lets a caller pass
inherited context into a candidate calculation by mistake; a type-based split
makes that a compile error. `CandidatePageInput` (`types.ts`) has no field an
inherited/parent-context value could occupy — there is nowhere to put the
mistake.

---

## 3. DESIGN DECISION — the ruleset is new, and says so

`ORGUNIT_SIGNAL_RULE_VERSION = 'orgunit-signal-rules-v1'` is the **first
durable production ruleset** this repository has ever shipped. It is
**informed by**, but explicitly **not a reproduction of**:

- the Phase 2A audit's fitted v1/v2/v3 weights (its scratch tooling was
  deleted; `93.0% / 97.6%` survives only as an audit finding — ADR 0004 §3);
- the 2026-08-24 holdout's own reconstruction (also deleted; sha256
  `af129233…47fa4728` names a ruleset this repository cannot re-run).

What survives from both, and is encoded here, is their measured **shape**:
multi-word specificity should outrank a bare generic word; a
degree-programme-shaped title is lexically close to a genuine unit title and
should be distinguishable in principle; an academic-research scope can
contain unit vocabulary without being the unit. Every individual weight in
`weights.ts` is an explicit, reviewable **v1 heuristic** — not a statistically
calibrated number. Shadow validation against real fetched pages, not this
file, is what will decide whether any of them move.

---

## 4. DESIGN DECISION — Track A / Track B name discovery strategies, not units

`SignalTrack = 'A' | 'B'`. Track A is the international/mobility/Erasmus
discovery angle; Track B is the language-centre/language-teaching angle.
Neither is a final unit taxonomy member (`INTERNATIONAL_OFFICE`,
`LANGUAGE_CENTRE`, …) — those remain a later, semantic-classification
decision (ADR 0004 §9, §14). A page may legitimately score on both tracks at
once; nothing here forces a single label.

---

## 5. DESIGN DECISION — negative vs. veto, and what a veto actually does

Every `SignalRule` is `kind: 'positive' | 'negative' | 'veto'`.

- `negative` subtracts its weight from a page's own evidence.
- `veto` does the same subtraction, **and additionally, in frontier scoring
  only**, forces the INHERITED contribution for that track to zero.

The holdout's own example: `/recherche/relations-internationales` can carry a
strong positive Track A phrase while sitting under an academic-research
section that is not the international unit itself. Ordinary subtraction is
not enough to stop a large inherited contribution from a strong ancestor
section surviving next to it — the brief's own framing: "it does not merely
subtract 2 points while allowing inherited +5 to survive." `kind: 'veto'`
(`NEG_ACADEMIC_RESEARCH_SCOPE`, `packs/universal.ts`) is therefore a
**structural gate on inheritance**, not merely a larger number.

Candidate scoring has no inheritance to veto in the first place — a veto rule
there behaves exactly like an ordinary negative, subtracting from the page's
own score. This is what "candidate scoring may still evaluate the page's own
evidence independently" means: a veto never hides a page's own positive
evidence, in either scoring path. It only ever stops OTHER pages' evidence
(an ancestor's) from being laundered through this one.

---

## 6. DESIGN DECISION — FR and EN packs always run together; country never gates language

Every score, for every input, runs `packs/universal.ts` + `packs/fr.ts` +
`packs/en.ts` unconditionally. There is no `if (organisation.country === 'FR')
use only the French pack` anywhere, and there cannot be: the scoring core
never reads a country or a locale at all (`FrontierUrlInput` and
`CandidatePageInput` carry no such field). ADR 0004 §12 forbids exactly this
inference, and the holdout's own French institutions frequently published
their strongest international-office evidence on an English page — the
premise "French organisation → French page" was false in the sample that
would most plausibly have supported it.

Only `fr` and `en` ship in this slice. `de`, `nl`, `es`, `it` remain future,
measured additions — no empty scaffold files exist for them, because an empty
pack is a promise this slice cannot keep.

---

## 7. DESIGN DECISION — thresholds are named for what they gate, not for a conclusion

`SECTION_ROOT_THRESHOLD` and `SECTION_ROOT_MAX_DEPTH` (`tree.ts`) gate
**inheritance eligibility only** — whether a URL's own evidence is strong
enough, at a shallow enough depth, to seed a bounded, decaying contribution to
its near descendants. Deliberately not `RELEVANCE_THRESHOLD`: clearing it is
not a relevance conclusion, and no code path anywhere treats it as one. No
`CANDIDATE_HANDOFF_THRESHOLD`-shaped constant exists in this slice — "which
candidates get handed to a classifier" is a later frontier/candidate
orchestration decision that can rank by score without this layer declaring a
cut line for it.

Inheritance is bounded on three independent axes at once (`tree.ts`):
root eligibility is judged on the root's OWN score only (never a score that
itself includes an inherited component, which is what stops a boosted child
from becoming a new full-strength parent); it reaches at most
`INHERITANCE_MAX_DEPTH` (2) descendant levels; and the contribution decays
geometrically (½ at depth 1, ¼ at depth 2) rather than staying at full
strength.

---

## 8. DESIGN DECISION — every rule has a stable, reviewable identity

Every `SignalRule.id` (e.g. `A_INTL_OFFICE`, `B_FR_CENTRE_DE_LANGUES`,
`NEG_ACADEMIC_RESEARCH_SCOPE`) is a machine-readable identity distinct from
the phrase text it matches — never the term string itself. A later shadow
validation pass needs to be able to say "rule `X` caused N false positives"
without re-deriving that from a phrase string that might appear in more than
one rule. Every `MatchedSignal` a score returns carries this id, its pack,
its track, its field, its weight, whether it was inherited, and its
inheritance depth when applicable — never a bare number.

---

## 9. DESIGN DECISION — no relevance conclusion, anywhere in this layer

No type in `types.ts`, and no value any function in `score.ts` returns, is
named or shaped like `relevant`, `verified`, `confirmed`, `approved`,
`preferred`, `qualified`, `isUnit` or `hasDistributionCapability`. A score is
a number with reviewable evidence attached. `orgunit_page_candidates`
(migration 0007) already forbids storing a status; this layer does not
manufacture one on the way there either.

---

## 10. Consequences

- A later, still-unbuilt bounded frontier can call `scoreFrontierUrl` per
  discovered URL and use `isSectionRoot`/`ownScore` from a parent call to
  populate `sectionAncestors` for its children — the inheritance contract is
  therefore usable by a caller that has not been written yet, which is the
  point of typing it now.
- A later, still-unbuilt candidate/persistence slice can call
  `scoreFetchedPageCandidate` once safe page evidence exists
  (`orgunit_page_evidence`) and stamp `ORGUNIT_SIGNAL_RULE_VERSION` onto
  `orgunit_page_candidates.rule_version` without this slice needing to know
  anything about persistence.
- Every weight and threshold in this slice is named, reviewable, and
  explicitly **not** claimed as calibrated. Shadow validation is the gate
  before any research run is trusted on this ruleset's output.

---

## 11. UNKNOWN — say so rather than resolving by inference

- **Whether these v1 weights and thresholds separate genuine units from
  degree programmes, or from pages published by a unit but not describing it,
  well enough to be useful.** Untested against real fetched pages — that is
  exactly what shadow validation is for.
- **Whether the FR/EN phrase catalogues have adequate recall outside the
  2026-08-24 holdout's French sample.** Unmeasured.
- **Whether `SECTION_ROOT_THRESHOLD`, `SECTION_ROOT_MAX_DEPTH`,
  `INHERITANCE_MAX_DEPTH` and the ½/¼ decay are well-chosen.** They are
  explicit, reviewable design bounds, not measurements — consistent with how
  ADR 0005 §6 treated the body cap and ADR 0004 §8 treated the 40,000-character
  `main_text` cap.
- **How this ruleset should evolve once `de`, `nl`, `es`, `it` are approved.**
  Not designed here; a future pack must not copy this slice's French weights
  as a placeholder for an unrelated language.
