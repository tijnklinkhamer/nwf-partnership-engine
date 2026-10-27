# Qualification-input export v2 (`nwf-pe.qualification-input-export.v2`)

WW mission, work package E-X; rules v2 and the quote / redaction repairs by
E-XFX (2026-10-27, independent review P1-1, P1-2, P2-9, P2-11). Status:
implemented on the Engine, local only. Nothing here is wired to a live run, a
model, a send path or a deployment.

## Why

The v1 export (`nwf-pe.qualification-input-export.v1`, REL P1) carries only
`channel.existence`, `channel.static_currency`, `channel.operator_binding`,
`candidate.location` and `candidate.kind`. A real organisation therefore
reaches only the few C1 points those keys can earn, however much its own
pages say. v2 reads the page captures the Engine already stores and adds
automatic, source-backed C1 evidence, without guessing and without
relabelling.

v1 stays producible byte for byte: it is still the CLI default, its builder
is unchanged, and the P1 integration test's SHA-256-pinned fixtures still
match. v2 is a separate document built by **composing** v1.

```
nwf-pe qualification-input export --subject-id <uuid> [--contract v1|v2] [--evaluated-at <YYYY-MM-DDTHH:MM:SSZ>]
```

Read-only as before: the `readonly` role, one `REPEATABLE READ READ ONLY`
transaction ending in ROLLBACK (`readQualificationInputRecords`, shared with
v1), no write, no network, no model, no file. v2 adds no query.

## Identifiers

| identifier                               | meaning                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------- |
| `nwf-pe.qualification-input-export.v2`   | the document (`document`)                                                             |
| `nwf-pe-qualification-input-producer-v3` | the producer (`producerVersion`); `-v2` named the producer that ran rules v1          |
| `nwf-pe-c1-extraction-rules-v2`          | the extraction rule set (`extraction.rulesVersion`, every basis and proposal)         |
| `nwf-pe-c1-stated-date-rules-v1`         | the multilingual full-date rules (`extraction.dateRuleVersion`)                       |
| `nwf-pe-stated-date-rules-v1`            | v1's own date rules, unchanged (`dateRuleVersion`, used by `channel.static_currency`) |

Code: `src/orgunits/c1Extraction/` (pure rules), `src/orgunits/qualificationInputV2/`
(contract, pure build, load), CLI `src/cli/commands/qualificationInput.ts`.

### What changed in rules v2 (E-XFX), and what did not

`nwf-pe-c1-extraction-rules-v2` **replaces** `nwf-pe-c1-extraction-rules-v1`;
the code no longer produces v1, which survives only as the label on documents
produced before. Rules v1 stamped OBSERVED on what the organisation merely SAID
("We no longer send a newsletter, so please do not sign up." became an
observed newsletter with `reach_mode PUSHED_TO_MEMBERS`; "Registration … closes
on 1 June 2025; the welcome week itself was cancelled." became an observed
event instance on 2025-06-01), and its quote guard let handles, account URLs,
separator-less telephone numbers and names beside contact cues through.

The document id stays `nwf-pe.qualification-input-export.v2` and **no field
was added, removed or retyped**. Value sets did change, and a reader that
pins them must be reviewed:

- `ProposalKey` gains `channel.reach_mode` (a sign-up sentence's reach mode
  is now proposed, never claimed); `channel.existence` proposals may carry
  `{ status: 'DISCONTINUED' }` (a stated discontinuation);
- rule ids: `C1X.NEWSLETTER_SIGNUP.*` is now `C1P.NEWSLETTER_SIGNUP.*`; new
  `C1P.CHANNEL_DISCONTINUATION_STATED.*` and `C1G.GUARDED_STATEMENT.*`;
- gap reasons gain `STATEMENT_GUARDED` (label `GUARD:<kind>`) and
  `PROPOSAL_WITHHELD_SOCIAL_ACCOUNT_QUOTE`;
- `limitations.phraseRules` and `limitations.quotes` restate the new rules;
- `producerVersion` is `nwf-pe-qualification-input-producer-v3`.

The Operator's reviewed allowlists (`R2_EXTRACTION_RULES_VERSIONS`,
`ENGINE_QUALIFICATION_EXPORT_PRODUCERS_V2`) name v1 / producer-v2 only, so it
refuses these documents until it reviews and lists the new identifiers.

## Two classes, never mixed

| class       | what it is                              | mode                                                | producer                         | sources                                                                      |
| ----------- | --------------------------------------- | --------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------- |
| `claims`    | a fact the capture itself SHOWS         | `OBSERVED`                                          | `NWF_SYSTEM`                     | Engine page captures only (`PAGE_EVIDENCE`, `DIGEST_ONLY_BYTES_UNAVAILABLE`) |
| `proposals` | what the organisation SAYS about itself | `SELF_ASSERTED` (own site) / `THIRD_PARTY_ASSERTED` | none - a proposal is not a claim | one page capture each                                                        |

Claims are exactly what the Operator's C2c revision R1 already admits
(`NWF_SYSTEM` only for `OBSERVED` claims all of whose sources are
`ENGINE_PAGE_CAPTURE`; capped at grade B at the C1 mapping). Proposals need
an Operator decision before they count: a default-OFF admission revision or a
human one-click confirmation (which then records a `HUMAN_RESEARCHER`
supplement claim on the existing path). No classifier or model output is used
anywhere in this package, and no `INFERENCE` path exists.

## Document schema

Every v1 field keeps its v1 meaning and value (`targetContracts`,
`evidenceClass`, `instantRule`, `dateRuleVersion`, `sourceRepository`,
`readConsistency`, `subjectId`, `evaluatedAt`, `candidate`, `country`,
`sources`, `excluded`, `researchRuns`, `permissions`). Instants are whole UTC
seconds, truncated toward the epoch (v1's rule).

```ts
{
  document: 'nwf-pe.qualification-input-export.v2';
  producerVersion: 'nwf-pe-qualification-input-producer-v3';
  extraction: {
    rulesVersion: 'nwf-pe-c1-extraction-rules-v2';
    dateRuleVersion: 'nwf-pe-c1-stated-date-rules-v1';
    pageClasses: { sourceRef: string; classes: PageClass[] }[];   // research coverage only
  };
  // v1 fields, unchanged: targetContracts, evidenceClass ('RESEARCH_REAL'), instantRule,
  // dateRuleVersion, sourceRepository, readConsistency, subjectId, evaluatedAt,
  // candidate { candidateRef, relations: [] }, country { value, standing, rule, notRankableReason }
  channels: {
    channelRef: string;                  // rp-channel:<v4>
    kind: C1ChannelKind;                 // the Operator's CHANNEL_KIND_CLASS keys, exactly
    channelClass: 'FEED' | 'PRIVATE_GROUP' | 'STATIC' | 'EVENT_SLOT';
    visibility: 'PUBLIC' | 'PRIVATE';
    websiteClaimId: string;              // the admitted root website it was found on
    admissionIds: string[];
    derivation: 'ADMITTED_ROOT_WEBSITE' | 'OBSERVED_ON_ADMITTED_SITE' | 'NAMED_ON_ADMITTED_SITE';
    establishedBy: 'OBSERVED_CLAIM' | 'PROPOSAL_ONLY';
    ruleIds: string[];
  }[];
  sources: ExportSource[];               // v1's, unchanged
  claims: (V1Claim | {
    evidenceClass: 'RESEARCH_REAL'; claimRef: string; claimKey: ExportedClaimKeyV2;
    subject: { kind: 'CHANNEL'; ref: string };
    mode: 'OBSERVED'; attribution: 'EXACT'; producedBy: 'NWF_SYSTEM';
    value: <valid C1 value for claimKey>;
    basis: { origin: 'C1_EXTRACTION_RULE'; rulesVersion; dateRuleVersion;
             ruleIds: string[]; pageEvidenceIds: string[]; statedDates: string[] };
    researchRealConflicts: ResearchRealConflict[];   // v1's annotation, re-derived by the Operator
  })[];
  claimLinks: { claimRef; sourceRef; relation: 'SUPPORTS' }[];
  proposals: {
    proposalId: string;                  // rp-proposal:<v4>, deterministic
    key: ProposalKey;
    subject: { kind: 'CANDIDATE' | 'CHANNEL'; ref: string };
    proposedValue: <valid C1 value for key>;
    assertionMode: 'SELF_ASSERTED' | 'THIRD_PARTY_ASSERTED';
    attribution: 'EXACT' | 'LIKELY';     // EXACT from the subject's own page, as v1's recorded claims
    sourceRef: string;
    observedAt: string;                  // the source's capture instant
    extraction: { ruleId; rulesVersion; language: 'en'|'fr'|'es'|'nl'|'ja'|'de'|'it'|'pt'; matchedTerms: string[] };
    quote: string;                       // <= 300 code points, a contiguous substring of stored (redacted) text;
                                         // its FULL sentence passed every contact-shape check
    quoteTruncated: boolean;
    quoteSha256: string;                 // sha256(quote, UTF-8)
  }[];
  researchStatus: {
    subcriterionId: 'AF1'|'AF2'|'AF3'|'DP1'|'DP2'|'DP3'|'DP4'|'AP1'|'AP2'|'SV1'|'SV2'|'SV3';
    dimension: 'AF' | 'DP' | 'AP' | 'SV';
    status: 'EVIDENCE_FOUND' | 'PROPOSAL_ONLY' | 'SEARCHED_NOT_FOUND' | 'NOT_RESEARCHED';
    claimKeys: string[]; claimRefs: string[]; proposalIds: string[];
    relevantPageClasses: PageClass[]; capturedPageClasses: PageClass[];
    reason: 'NO_EXTRACTION_RULE_FOR_THESE_KEYS' | 'RELEVANT_PAGE_CLASS_NOT_CAPTURED'
          | 'RELEVANT_PAGE_CLASS_CAPTURED_NOTHING_FOUND' | null;
  }[];                                   // always all twelve, in rubric order
  contradictions: { key; subject; among: 'CLAIMS' | 'PROPOSALS'; refs: string[]; sourceRefs: string[]; distinctValues: number }[];
  gaps: { target: string; reason: string; ruleId: string | null; label: string | null; sourceRefs: string[] }[];
  freshness: { key; latestCapturedAt; sourceRef; claims: number; proposals: number }[];
  excluded; researchRuns;                // v1's, unchanged
  permissions: { qualification: 'NONE'; ranking: 'NONE'; publication: 'NONE'; memberRelease: 'NONE';
                 identityBinding: 'NONE'; outreach: 'NONE'; contactPermission: 'NOT_GRANTED' };
  limitations: LIMITATIONS_V2;
}
```

`PageClass` is `HOME | ABOUT | EVENTS | NEWSLETTER | NEWS | EXTERNAL_LINKS`.
Bounds: 2000 sources, 2000 claims (v1's), 2000 proposals; a larger subject is
refused (`BOUND_EXCEEDED`), never truncated.

`ExportedClaimKeyV2` = v1's five plus `channel.cycle_history`,
`channel.event_instances`, `channel.feed_activity`, `channel.reach_mode`,
`channel.resource_openness` (`channel.reach_mode` stays in the type for
compatibility; rules v2 never claims it). `ProposalKey` = `audience.cohort`,
`audience.languages`, `audience.segment_definition`, `candidate.kind`,
`channel.audience_count`, `channel.existence`, `channel.operator_binding`,
`channel.reach_mode`, `channel.role_based_ownership`.

Every claim value and proposed value is validated against the Operator's C1
value schema, **restated** (never imported) in
`src/orgunits/c1Extraction/vocabulary.ts` from `src/api/qualification.ts`
(`CLAIM_VALUE_SCHEMAS`), with each key's admissible modes from
`server/qualification/policy.ts` (`KEY_POLICY`). An invalid value is a
programming error and throws; a mode the key does not admit is withheld
(a gap), never relabelled.

### LIMITATIONS (v2)

v1's literals, with `pageText` and `classifier` restated truthfully, plus:

| key              | value                                                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pageText`       | `NO_PAGE_TEXT_IS_EXPORTED_EXCEPT_ONE_SHORT_REDACTED_QUOTE_PER_PROPOSAL`                                                                                                   |
| `classifier`     | `NO_CLASSIFIER_OR_MODEL_OUTPUT_IS_EXPORTED`                                                                                                                               |
| `phraseRules`    | `DETERMINISTIC_PHRASE_RULES_NWF_PE_C1_EXTRACTION_RULES_V2_OBSERVED_CLAIMS_ONLY_FOR_WHAT_A_CAPTURE_EXHIBITS_STATEMENTS_ARE_PROPOSALS_GUARDED_LINES_YIELD_NOTHING_POSITIVE` |
| `proposals`      | `PROPOSALS_ARE_NOT_CLAIMS_THE_OPERATOR_DECIDES_WHETHER_ANY_COUNTS`                                                                                                        |
| `quotes`         | `AT_MOST_300_CODE_POINTS_OF_ALREADY_REDACTED_STORED_TEXT_CONTACT_SHAPED_OR_SOCIAL_ACCOUNT_QUOTES_WITHHELD_CHECKED_ON_THE_FULL_SENTENCE`                                   |
| `quoteContent`   | `A_QUOTE_IS_PAGE_TEXT_AS_WRITTEN_AND_MAY_NAME_THE_ORGANISATION_OR_A_PERSON_NO_NAME_FIELD_EXISTS`                                                                          |
| `researchStatus` | `EVIDENCE_FOUND_MEANS_A_CLAIM_EXISTS_NEVER_A_TIER_SEARCHED_NOT_FOUND_IS_NEVER_A_ZERO`                                                                                     |
| `language`       | `A_RULE_LANGUAGE_IS_THE_LANGUAGE_A_PHRASE_IS_WRITTEN_IN_NEVER_A_COUNTRY`                                                                                                  |

## Channels

| kind (C1)                                                                                   | class                | derived from                                                                                                                                                            | establishedBy    |
| ------------------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `RESOURCE_PAGE`                                                                             | STATIC               | the admitted root website (v1)                                                                                                                                          | `OBSERVED_CLAIM` |
| `ORIENTATION_EVENT`                                                                         | EVENT_SLOT           | a line naming an orientation/welcome event AND stating a full date                                                                                                      | `OBSERVED_CLAIM` |
| `MEMBER_NEWSLETTER`                                                                         | FEED                 | a line LISTING a dated past issue (a newsletter term and a past full date)                                                                                              | `OBSERVED_CLAIM` |
| `MEMBER_NEWSLETTER`                                                                         | FEED                 | otherwise: a surviving sign-up-sentence proposal, or a stated-discontinuation proposal                                                                                  | `PROPOSAL_ONLY`  |
| `ORIENTATION_EVENT`                                                                         | EVENT_SLOT           | otherwise: a stated-discontinuation proposal ("we no longer organise a welcome week")                                                                                   | `PROPOSAL_ONLY`  |
| `INSTAGRAM_ACCOUNT`, `FACEBOOK_PAGE` (PUBLIC), `WHATSAPP_GROUP`, `DISCORD_SERVER` (PRIVATE) | FEED / PRIVATE_GROUP | a line on the subject's own site naming the platform with a first-person follow/join call, or a follower count - only if the (by default withheld) proposal is released | `PROPOSAL_ONLY`  |

Only pages the subject publishes (`SELF`) can establish an observed channel.
Every line that rules v2 GUARDS (below) establishes nothing positive.
A channel is never invented from one generic resource-page observation, a
social account is never observed (only named), and no handle or URL of an
account is exported. One channel per kind per admitted root website.

## Observed artefact or statement? (rules v2)

The line every rule is held to. A claim is `OBSERVED` only when its C1 value
describes the **published artefact itself** and the capture **exhibits** it -
something a reader of the stored page can point at as structure of the page.
When the value describes something **beyond the page** that the page only
**says** (that a newsletter exists, how it is delivered, that something has
stopped), it is the organisation's own statement: a `SELF_ASSERTED`
proposal, never a claim. Stored page evidence holds title, h1-h3 headings and
main-text lines only - **no form element is recorded** - so a sign-up form can
never be observed, and a sign-up sentence is always a statement.

| key                         | OBSERVED (the page exhibits it)                                                                                                                                                        | PROPOSAL (the organisation says it)                                                                                                                          | neither (guarded / gap)                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `channel.existence`         | event: a LISTED dated instance ("Welcome Week 2025 took place on 1 September 2025."); newsletter: a LISTED dated issue ("Newsletter — 3 March 2026")                                   | "Subscribe to our newsletter." (`EXISTS`); "We no longer send a newsletter." (`DISCONTINUED`, own page only); "Follow us on Instagram" (withheld by default) | "Welcome Week 2026 was cancelled."; a discontinuation on a third-party page                  |
| `channel.event_instances`   | a dated instance listed on the page; `upcomingAnnounced` = a listed date after the capture day                                                                                         | -                                                                                                                                                            | "Registration closes on 1 June 2025" (a deadline is not an instance); "… has been postponed" |
| `channel.cycle_history`     | listed dated instances in two calendar years                                                                                                                                           | -                                                                                                                                                            | a guarded line contributes no date                                                           |
| `channel.feed_activity`     | listed dated past issues                                                                                                                                                               | -                                                                                                                                                            | "The newsletter of 3 March 2026 was cancelled."                                              |
| `channel.reach_mode`        | never (no rule observes a delivery mechanism)                                                                                                                                          | "Sign up for our newsletter." -> `PUSHED_TO_MEMBERS`                                                                                                         | "… so please do not sign up."                                                                |
| `channel.resource_openness` | "Submit your event to our calendar." - the value `SUBMISSION_INVITATION` says the page PRINTS an invitation, which it exhibits; a "Useful links" heading over a list (`FORMAT_ALLOWS`) | -                                                                                                                                                            | "Submissions are no longer accepted."; "Useful links (no longer maintained)"                 |
| every proposal key          | -                                                                                                                                                                                      | self-descriptions (languages, segment, cohort, kind, counts, role, "our …")                                                                                  | the same sentence negated, cancelled or carrying a deadline                                  |

## Guards (rules v2)

Each language pack carries closed lists of DISCONTINUATION, CANCELLATION,
NEGATION and DEADLINE terms (`lexicon.ts`), matched with the same
script-aware rule as every other phrase; `…` in a term is a gap of 0-3 whole
tokens. A line containing any of them is **guarded**: every positive claim and
proposal the line would have produced is dropped, and if anything was dropped
(or the line names a newsletter / orientation event and states a
discontinuation) the page gets one gap per guard kind, `target: FINDING`,
`reason: STATEMENT_GUARDED`, `label: GUARD:<KIND>`, rule
`C1G.GUARDED_STATEMENT.<lang>`. The only thing a guarded line can produce is
the one negative C1's value schema has: a DISCONTINUATION of the subject's own
newsletter or orientation event, on a `SELF` page, becomes a `SELF_ASSERTED`
`channel.existence { status: 'DISCONTINUED' }` proposal
(`C1P.CHANNEL_DISCONTINUATION_STATED`); on a third-party page it is the gap
only. A cancelled single instance is never a discontinuation.

| language | discontinuation (examples)              | cancellation                      | negation                        | deadline                                         |
| -------- | --------------------------------------- | --------------------------------- | ------------------------------- | ------------------------------------------------ |
| en       | no longer, discontinued, anymore        | cancelled, postponed, called off  | not, never, don't, won't        | registration closes, deadline, apply before / by |
| fr       | ne … plus, n' … plus                    | annulé(e)(s), reporté, suspendu   | ne … pas, ne … jamais, pas de   | inscriptions jusqu'au, date limite               |
| es       | ya no, descontinuado, dejamos de        | cancelado/a, aplazado, pospuesto  | no se, no hay, no es, nunca     | fecha límite, plazo, inscripciones hasta         |
| nl       | niet meer, geen … meer, opgeheven       | geannuleerd, afgelast, uitgesteld | niet, geen, nooit               | aanmelden tot, inschrijven tot, uiterlijk        |
| ja       | 廃止, 配信終了, 発行終了                | 中止, 終了, 延期, 休止            | ません, しない, ではない        | 締切, 締め切り, 申込期限, 応募期限               |
| de       | nicht mehr, kein(e) … mehr, eingestellt | abgesagt, entfällt, verschoben    | nicht, kein(e), niemals         | Anmeldeschluss, Anmeldung bis, Frist             |
| it       | non … più, mai più, interrotto          | annullato/a, rinviato, sospeso    | non è, non si, non sarà, nessun | scadenza, iscrizioni entro, entro il             |
| pt       | não … mais, já não, descontinuado       | cancelado/a, adiado/a, suspenso/a | não, nunca, nenhum              | prazo, inscrições até, data limite               |

A short closed list of fixed phrases contains a guard word but negates
nothing and does not guard: "not-for-profit", "non-profit", "don't miss",
"never miss", "ne manquez pas", "no te pierdas", "nicht verpassen", "non
perdere", "não perca", "sin fines de lucro", "zonder winstoogmerk"… The lists
are closed and deliberately conservative: a line they over-guard loses a
reading (it becomes a gap), a line they miss is a known limit - never a guess.

## Rules (`nwf-pe-c1-extraction-rules-v2`)

Rule id: `<class>.<CONCEPT>.<language>`. 191 rules: every concept below in
`en, fr, es, nl, ja, de, it, pt`, except `C1P.CHANNEL_NAMED_AS_OWN` which has
no `ja` rule (Japanese has no first-person possessive phrase in the lexicon).
The language is the language the deciding phrase is written in - never a
country, never the organisation's language. Every pack runs on every page.
Matching is the Engine's script-aware rule (`signals/scriptAware.ts`):
whole-token runs after diacritic/case folding for Latin script, CJK-run
substrings for Japanese. Every co-occurrence is within ONE line (title, one
h1-h3 heading, or one main-text line); nothing is joined across lines or
pages.

| rule                                         | languages                      | keys                                            | C1 subcriteria it can affect            |
| -------------------------------------------- | ------------------------------ | ----------------------------------------------- | --------------------------------------- |
| `C1X.ORIENTATION_EVENT_DATED.<lang>`         | en, fr, es, nl, ja, de, it, pt | `channel.existence`, `channel.event_instances`  | DP1, DP3                                |
| `C1X.ORIENTATION_EVENT_CYCLES.<lang>`        | en, fr, es, nl, ja, de, it, pt | `channel.cycle_history`                         | SV1                                     |
| `C1P.NEWSLETTER_SIGNUP.<lang>`               | en, fr, es, nl, ja, de, it, pt | `channel.existence`, `channel.reach_mode`       | DP1, DP2 (proposals)                    |
| `C1X.NEWSLETTER_DATED_ISSUES.<lang>`         | en, fr, es, nl, ja, de, it, pt | `channel.existence`, `channel.feed_activity`    | DP1, DP3                                |
| `C1X.SUBMISSION_INVITATION.<lang>`           | en, fr, es, nl, ja, de, it, pt | `channel.resource_openness`                     | AP1                                     |
| `C1X.EXTERNAL_LINKS_LISTING.<lang>`          | en, fr, es, nl, ja, de, it, pt | `channel.resource_openness`                     | AP1                                     |
| `C1P.AUDIENCE_LANGUAGES.<lang>`              | en, fr, es, nl, ja, de, it, pt | `audience.languages`                            | AF1                                     |
| `C1P.SEGMENT_WHOLE_AUDIENCE.<lang>`          | en, fr, es, nl, ja, de, it, pt | `audience.segment_definition`                   | AF2                                     |
| `C1P.SEGMENT_ADDRESSED_SUBGROUP.<lang>`      | en, fr, es, nl, ja, de, it, pt | `audience.segment_definition`                   | AF2                                     |
| `C1P.COHORT.<lang>`                          | en, fr, es, nl, ja, de, it, pt | `audience.cohort`                               | read-only (gate G1), no points          |
| `C1P.AUDIENCE_COUNT_SUBSCRIBERS.<lang>`      | en, fr, es, nl, ja, de, it, pt | `channel.audience_count`                        | DP4                                     |
| `C1P.AUDIENCE_COUNT_FOLLOWERS.<lang>`        | en, fr, es, nl, ja, de, it, pt | `channel.audience_count`                        | DP4                                     |
| `C1P.AUDIENCE_COUNT_ENROLMENT.<lang>`        | en, fr, es, nl, ja, de, it, pt | `channel.audience_count`                        | DP4 (basis never scores)                |
| `C1P.ROLE_BASED_OWNERSHIP.<lang>`            | en, fr, es, nl, ja, de, it, pt | `channel.role_based_ownership`                  | SV3                                     |
| `C1P.CANDIDATE_KIND_SELF_DESCRIPTION.<lang>` | en, fr, es, nl, ja, de, it, pt | `candidate.kind`                                | read-only (SV2 precondition), no points |
| `C1P.CANDIDATE_KIND_HOME_TITLE.<lang>`       | en, fr, es, nl, ja, de, it, pt | `candidate.kind`                                | read-only, no points                    |
| `C1P.SOCIAL_ACCOUNT_NAMED.<lang>`            | en, fr, es, nl, ja, de, it, pt | `channel.existence`, `channel.operator_binding` | DP1, AP2                                |
| `C1P.CHANNEL_NAMED_AS_OWN.<lang>`            | en, fr, es, nl, de, it, pt     | `channel.operator_binding`                      | AP2                                     |
| `C1P.CHANNEL_DISCONTINUATION_STATED.<lang>`  | en, fr, es, nl, ja, de, it, pt | `channel.existence` (`DISCONTINUED`)            | DP1                                     |
| `C1G.PLATFORM_WITHOUT_C1_KIND.<lang>`        | en, fr, es, nl, ja, de, it, pt | -                                               | gap                                     |
| `C1G.WEBSITE_NEWS_FEED.<lang>`               | en, fr, es, nl, ja, de, it, pt | -                                               | gap (DP3)                               |
| `C1G.MEMBER_COUNT_UNBOUND.<lang>`            | en, fr, es, nl, ja, de, it, pt | -                                               | gap (DP4)                               |
| `C1G.CHANNEL_NOT_ESTABLISHED.<lang>`         | en, fr, es, nl, ja, de, it, pt | -                                               | gap (DP4, AP2, SV3)                     |
| `C1G.GUARDED_STATEMENT.<lang>`               | en, fr, es, nl, ja, de, it, pt | -                                               | gap                                     |

Each rule's documented reason lives in `C1_CONCEPTS[].reason`
(`src/orgunits/c1Extraction/rules.ts`) and is exported with the rule table
(`C1_EXTRACTION_RULES`). In short:

- **ORIENTATION_EVENT_DATED** - one line names the event (e.g. "Welcome
  Week", "semaine d'intégration", "semana de bienvenida", "introductieweek",
  "新入生歓迎", "Erstiwoche", "settimana di accoglienza", "semana de
  recepção") AND states a full date. `upcomingAnnounced` = a date after the
  capture day; `lastPastInstance` = latest date on or before it;
  `discontinued` = false. No date, no claim.
- **ORIENTATION_EVENT_CYCLES** - past instances in two calendar years, or a
  past instance and a later-year upcoming one. `cycleDates` = past instances
  only, ONE date per instance: a date within 14 days of an instance's first
  date is the same multi-day instance (C1 counts cycles by calendar month, so
  a week from 30 August to 3 September must never read as two cycles); C1
  itself counts only cycles before its activity horizon;
  `completeView` false; `statedOneOff` false. "Welcome Week 2024 / 2025"
  with no full date yields nothing: years are never guessed.
- **NEWSLETTER_SIGNUP** (proposal since v2) - newsletter term and sign-up call
  on one unguarded line of the subject's own page: existence `EXISTS` +
  `reach_mode PUSHED_TO_MEMBERS` (integration-lead decision) PROPOSED,
  `SELF_ASSERTED`, establishing a `PROPOSAL_ONLY` newsletter. Never OBSERVED:
  the page states it; no form element is stored.
- **NEWSLETTER_DATED_ISSUES** - newsletter term and a past full date on one
  unguarded line (a listed issue): existence + `feed_activity { completeView:
false, itemDates }`, OBSERVED.
- **SUBMISSION_INVITATION** - "submit your event" etc.: `resource_openness
SUBMISSION_INVITATION, itemDate null` on the admitted website.
- **EXTERNAL_LINKS_LISTING** - a title/heading "useful links" / "external
  links": `resource_openness FORMAT_ALLOWS, itemDate null`. No precedent kind
  (`NON_AFFILIATED_RESOURCE_DELIVERED`) is ever emitted: affiliation is not read.
- **AUDIENCE_LANGUAGES** - "learning Dutch", "cours de français", "clases de
  español", "Nederlands leren", "日本語教室", "Deutsch lernen", "corsi di
  italiano", "aulas de português". One proposal per page with the UNION of
  the languages it names. Never from the page language or the country.
- **SEGMENT_WHOLE_AUDIENCE / ADDRESSED_SUBGROUP** - "association for
  international students" (WHOLE_AUDIENCE); "also for exchange students"
  (ADDRESSED_SUBGROUP). A bare "for international students" is neither.
- **COHORT** - "university students" / "大学生" (HIGHER_EDUCATION_ADULT), "for
  adults" (ADULT_NON_HIGHER_EDUCATION), "for children" (MINOR_TARGETED).
- **AUDIENCE_COUNT_*** - number + unit on one line: subscribers naming the
  newsletter (`CHANNEL_SUBSCRIBERS`, only on an established newsletter -
  observed, or proposed by a surviving sign-up),
  followers naming a platform (`PLATFORM_FOLLOWERS`), students with an
  enrolment word (`INSTITUTION_ENROLMENT` on the website - never a channel
  audience). `segment` is always null. Thousands separators `,` `.` space
  (NBSP folded); Japanese unit-first (`フォロワー1,200人`). Decimals never.
- **ROLE_BASED_OWNERSHIP** - "run by the board", "beheerd door het bestuur",
  "実行委員会が運営"...: `holder ORGANISATION_ROLE` on the channel the line
  names, else the website. SELF_ASSERTED only (C1 admits nothing else).
- **CANDIDATE_KIND_*** - a first-person self-description ("we are a student
  association") or the HOME page's own title. The specific
  INTERNATIONAL_STUDENT_ASSOCIATION suppresses the generic STUDENT_ASSOCIATION
  on the same line.
- **SOCIAL_ACCOUNT_NAMED** - platform + first-person follow/join call: existence
  and `OFFICIAL_PRESENCE_NAMES_CHANNEL` binding, both proposed - and, since
  v2, WITHHELD BY DEFAULT with every other proposal about a social account
  (follower counts, role statements on it): such a line so often carries a
  handle or an account URL. Gap `PROPOSAL_WITHHELD_SOCIAL_ACCOUNT_QUOTE`; the
  account channel is then not in the document. The INERT extraction option
  `socialAccountQuotes: 'SHAPE_CHECKED'` (no production caller) would release
  them under the ordinary checks only.
- **CHANNEL_NAMED_AS_OWN** - "our newsletter", "notre semaine d'intégration":
  `OFFICIAL_PRESENCE_NAMES_CHANNEL` binding, proposed, only for a channel this
  package established (observed, or proposed by a surviving sign-up).
- **CHANNEL_DISCONTINUATION_STATED** - see Guards: existence `DISCONTINUED`,
  proposed, own page only.
- **C1G** gaps - platforms with no C1 kind (LinkedIn, TikTok, Twitter,
  YouTube, Telegram, LINE), a website news feed (C1 has no kind for it), a
  member count (membership is not any one channel's audience), counts /
  bindings / role statements about a channel nothing established, and every
  guarded line whose positive readings were suppressed.

### Dates (`nwf-pe-c1-stated-date-rules-v1`)

Full dates only, in four closed forms: ISO `2026-11-15`; Japanese
`2026年11月15日` (full-width folded); day-monthname-year (`15 November 2026`,
`1er septembre 2026`, `15. Oktober 2026`, `15 de noviembre de 2026`, `1°
settembre 2026`, `1º de setembro de 2026`, `15 november 2026`);
monthname-day-year (`November 15, 2026`). Month names in en, fr, es, nl, de,
it, pt, diacritic-folded. Never a bare year, a month-year, a numeric D/M/Y,
a day-month without a year, an impossible date, or a year outside 2000-2099.

## researchStatus

Per subcriterion, from the keys rubric V0-R2 reads:

| status               | meaning                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `EVIDENCE_FOUND`     | at least one claim (v1's or v2's) on a key the subcriterion reads. Not a tier: C1 decides. |
| `PROPOSAL_ONLY`      | no claim, at least one proposal.                                                           |
| `SEARCHED_NOT_FOUND` | nothing found, AND a relevant page class was captured. Never a zero.                       |
| `NOT_RESEARCHED`     | nothing found and no relevant page class captured, or no rule reads these keys.            |

Relevant page classes: AF1, AF2, SV3 `HOME|ABOUT`; DP1 `HOME`; DP2
`HOME|NEWSLETTER`; DP3 `HOME|EVENTS|NEWSLETTER`; DP4 `HOME|ABOUT|NEWSLETTER`;
AP1 `HOME|EVENTS|EXTERNAL_LINKS`; AP2 `HOME|EVENTS|NEWSLETTER`; SV1 `EVENTS`;
AF3 and SV2 none (always `NOT_RESEARCHED`, reason
`NO_EXTRACTION_RULE_FOR_THESE_KEYS`). This is the Engine's own coverage
statement; it emits no C1 `searchRecords` (those need an Operator search
protocol).

## contradictions, gaps, freshness

- **contradictions**: records on the same key and subject that cannot both
  hold - different `candidate.kind` (a specific kind refining a generic one
  is not one), different `audience.cohort`, different `audience.languages`
  sets, different `scope` for one segment, different counts for one basis, or
  different values of one channel's existence/reach/activity/cycle/currency
  claims. Reported with refs and sources; nothing is resolved or dropped.
- **gaps**: every subcriterion `NOT_RESEARCHED` / `SEARCHED_NOT_FOUND` with its
  reason; the structural keys no rule emits (`audience.stated_need`
  VALUE_PROPOSITION_REGISTER_NOT_HELD_BY_THE_ENGINE, `audience.minor_presence`
  NO_EXTRACTION_RULE, `candidate.network_membership` and
  `candidate.network_directory_absence` NO_NETWORK_OWN_DIRECTORY_CAPTURE,
  `channel.operator_continuity` HANDOVER_HISTORY_NOT_EXTRACTED,
  `channel.publishing_route` NO_RULE_OBSERVES_A_PUBLISHING_ROUTE); every C1G
  finding (`target: FINDING`, including `STATEMENT_GUARDED` with
  `label: GUARD:<DISCONTINUATION|CANCELLATION|DEADLINE|NEGATION>`); every
  withheld proposal (`PROPOSAL_WITHHELD_CONTACT_SHAPED_QUOTE`,
  `PROPOSAL_WITHHELD_SOCIAL_ACCOUNT_QUOTE`,
  `PROPOSAL_WITHHELD_RESERVED_NAMESPACE_MARKER_IN_QUOTE`,
  `PROPOSAL_WITHHELD_MODE_NOT_ADMISSIBLE_FOR_KEY`).
- **freshness**: for each key with a claim or proposal, the latest capture
  instant behind it and that source.

## PII

Quotes come only from stored page evidence, which `extract.ts` already
redacted (`redact.ts`). Redaction alone is NOT enough, and rules v1 relied on
it: the stored text keeps social handles, account URLs and names, and v1 let
`@esn_utrecht`, `instagram.com/janjansen`, `wa.me/31612345678`, `0612345678`
and "contact Jan Jansen" through. Since rules v2 a proposal is emitted only if
the **full** quoted sentence - checked before the 300-code-point cap, so the
cap can never cut a number in half and pass the first half - is, after an
NFKC fold:

- a fixed point of `redactContactData`, with no `[EMAIL]` / `[PHONE]`
  placeholder;
- free of a handle (`@` or `＠` followed by a letter, digit or `_`);
- free of a URL or host-with-path (`://`, `www.`, `name.tld/`);
- free of the Engine's telephone shape (`acquisition/canonical.ts`
  `TELEPHONE_SHAPE`, restated byte for byte and pinned to it by the C1
  firewall) and of any run of eight digits;
- free of an obfuscated address (`[at]`, `(dot)`);
- free of a contact cue of any language (`contact`, `call`, `mail`, `bel`,
  `contactez`, `llama`, `Kontakt`, `chiama`, `ligue`, `お問い合わせ`, `電話`,
  `担当` …) - a name beside such a cue may be a person to reach, and no name
  detector is attempted;
- free of a `cand:` / `chn:` / `opp:` marker;
- and not about a social account (withheld by default, above).

Otherwise the proposal is withheld and listed as a gap. Tests prove JP
(`０６－１２３４－５６７８`, `03(1234)5678`, `０３１２３４５６７８`), MX
(`+52 33 1234 5678`, `8112345678`), NL (`071-123 45 67`, `0612345678`), DE
(`+49 (0)30 1234567`, `030/1234-567`), handles, account URLs, e-mail shapes
and names beside contact cues never survive in a quote, on unredacted text and
through the real extraction path.

The redactor itself was also widened (still `orgunit-extraction-v3`, see the
VERSIONING note in `redact.ts`): a BARE run of 10-15 digits, or of exactly 9
digits starting with the trunk prefix `0`, is now `[PHONE]` (`0612345678`,
`0312345678`, `8112345678`, `030123456`). Years, `YYYYMMDD` dates, DMY dates,
academic-year ranges, page / room numbers and postcodes are kept; every
earlier redaction vector is unchanged.

No contact, name, handle or profile field exists.

## Never emitted

- any claim with a mode other than `OBSERVED`, any producer other than
  `NWF_SYSTEM`, or any source other than an Engine page capture (v2's own
  claims);
- any classifier, model or `INFERENCE` output; any `HUMAN_RESEARCHER` claim
  of v2's own (v1's recorded location/kind claims are unchanged);
- `audience.stated_need` (value propositions are an Operator register),
  `audience.minor_presence`, `candidate.network_membership`,
  `candidate.network_directory_absence`, `channel.publishing_route`,
  `channel.operator_continuity`;
- a channel kind outside the Operator's `CHANNEL_KIND_CLASS` (no website-feed
  "FEED", no LinkedIn/TikTok/LINE...);
- a `resource_openness` precedent kind, an `OUTDATED` / `NO_MARKER` marker, an
  OBSERVED `DISCONTINUED` existence or `discontinued: true` instance, a
  `statedOneOff: true` cycle, a dormant feed - i.e. no reading of an absence
  (a discontinuation the organisation STATES of its own channel is a
  `SELF_ASSERTED` proposal, never a claim);
- any OBSERVED claim from a sentence in which the organisation describes a
  channel or invites a sign-up, and any positive claim or proposal from a
  guarded line;
- a year guessed for a date, a country or audience language inferred from a
  page language or a domain, a member or enrolment number as a channel
  audience;
- a score, rank, threshold, verdict, identity or permission: every capability
  is `NONE`, contact permission `NOT_GRANTED`.

## Fixtures for the Operator

`src/test/fixtures/qualificationInputV2/qualification-input-export-v2.<key>.json`
for `nl-exchange-association` (rich), `nl-community-sparse` (homepage only),
`jp-student-circle` (ja) and `mx-exchange-community` (es). Each file is
`{ fixture: { label: 'SYNTHETIC', statement, key, producedBy, uuidRelabelling }, export: <v2 document> }`:
fictional organisations on `.fict` domains, captured from a scripted
transport in a disposable database, UUIDs relabelled onto
`eeeeeeee-0000-4000-8000-e1…`. Regenerated under rules v2 / producer-v3
(E-XFX); their SHA-256 pins changed. Regenerate with
`QUALIFICATION_INPUT_V2_WRITE_FIXTURE=1` and re-pin the SHA-256 in
`src/test/integration/qualificationInputExportV2.test.ts`.

## Boundaries

`src/test/firewall/wwC1Extraction.firewall.test.ts` pins: the six-file pure
`c1Extraction` module and its imports; no country/locale/declared-language
read; no classifier, gateway, orchestrator, source-discovery or acquisition
import (the only `web/` import is the redactor); only the v2 export imports
it; no contact/name/handle property; no score/rank/threshold name; no
`INFERENCE` path; the quote guard (since E-XFX: the full-sentence
`isContactShapedQuote` with every check listed under PII, `TELEPHONE_SHAPE`
byte-equal to `acquisition/canonical.ts`, social-account quotes withheld by
default); `permissions: PERMISSIONS` (v1's literals). `relP1QualificationInput.firewall.test.ts` was widened by exact
path for the three `qualificationInputV2/` files and the CLI's one new import.
