# Qualification-input export v2 (`nwf-pe.qualification-input-export.v2`)

WW mission, work package E-X. Status: implemented on the Engine, local only.
Nothing here is wired to a live run, a model, a send path or a deployment.

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
| `nwf-pe-qualification-input-producer-v2` | the producer (`producerVersion`)                                                      |
| `nwf-pe-c1-extraction-rules-v1`          | the extraction rule set (`extraction.rulesVersion`, every basis and proposal)         |
| `nwf-pe-c1-stated-date-rules-v1`         | the multilingual full-date rules (`extraction.dateRuleVersion`)                       |
| `nwf-pe-stated-date-rules-v1`            | v1's own date rules, unchanged (`dateRuleVersion`, used by `channel.static_currency`) |

Code: `src/orgunits/c1Extraction/` (pure rules), `src/orgunits/qualificationInputV2/`
(contract, pure build, load), CLI `src/cli/commands/qualificationInput.ts`.

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
  producerVersion: 'nwf-pe-qualification-input-producer-v2';
  extraction: {
    rulesVersion: 'nwf-pe-c1-extraction-rules-v1';
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
    quote: string;                       // <= 300 code points, a contiguous substring of stored (redacted) text
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
`channel.resource_openness`. `ProposalKey` = `audience.cohort`,
`audience.languages`, `audience.segment_definition`, `candidate.kind`,
`channel.audience_count`, `channel.existence`, `channel.operator_binding`,
`channel.role_based_ownership`.

Every claim value and proposed value is validated against the Operator's C1
value schema, **restated** (never imported) in
`src/orgunits/c1Extraction/vocabulary.ts` from `src/api/qualification.ts`
(`CLAIM_VALUE_SCHEMAS`), with each key's admissible modes from
`server/qualification/policy.ts` (`KEY_POLICY`). An invalid value is a
programming error and throws; a mode the key does not admit is withheld
(a gap), never relabelled.

### LIMITATIONS (v2)

v1's literals, with `pageText` and `classifier` restated truthfully, plus:

| key              | value                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| `pageText`       | `NO_PAGE_TEXT_IS_EXPORTED_EXCEPT_ONE_SHORT_REDACTED_QUOTE_PER_PROPOSAL`                                  |
| `classifier`     | `NO_CLASSIFIER_OR_MODEL_OUTPUT_IS_EXPORTED`                                                              |
| `phraseRules`    | `DETERMINISTIC_PHRASE_RULES_NWF_PE_C1_EXTRACTION_RULES_V1_OBSERVED_CLAIMS_ONLY_FOR_WHAT_A_CAPTURE_SHOWS` |
| `proposals`      | `PROPOSALS_ARE_NOT_CLAIMS_THE_OPERATOR_DECIDES_WHETHER_ANY_COUNTS`                                       |
| `quotes`         | `AT_MOST_300_CODE_POINTS_OF_ALREADY_REDACTED_STORED_TEXT_CONTACT_SHAPED_QUOTES_WITHHELD`                 |
| `quoteContent`   | `A_QUOTE_IS_PAGE_TEXT_AS_WRITTEN_AND_MAY_NAME_THE_ORGANISATION_OR_A_PERSON_NO_NAME_FIELD_EXISTS`         |
| `researchStatus` | `EVIDENCE_FOUND_MEANS_A_CLAIM_EXISTS_NEVER_A_TIER_SEARCHED_NOT_FOUND_IS_NEVER_A_ZERO`                    |
| `language`       | `A_RULE_LANGUAGE_IS_THE_LANGUAGE_A_PHRASE_IS_WRITTEN_IN_NEVER_A_COUNTRY`                                 |

## Channels

| kind (C1)                                                                                   | class                | derived from                                                                                                   | establishedBy    |
| ------------------------------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------- |
| `RESOURCE_PAGE`                                                                             | STATIC               | the admitted root website (v1)                                                                                 | `OBSERVED_CLAIM` |
| `ORIENTATION_EVENT`                                                                         | EVENT_SLOT           | a line naming an orientation/welcome event AND stating a full date                                             | `OBSERVED_CLAIM` |
| `MEMBER_NEWSLETTER`                                                                         | FEED                 | a line naming a newsletter with a sign-up call, or with a past full date (an issue)                            | `OBSERVED_CLAIM` |
| `INSTAGRAM_ACCOUNT`, `FACEBOOK_PAGE` (PUBLIC), `WHATSAPP_GROUP`, `DISCORD_SERVER` (PRIVATE) | FEED / PRIVATE_GROUP | a line on the subject's own site naming the platform with a first-person follow/join call, or a follower count | `PROPOSAL_ONLY`  |

Only pages the subject publishes (`SELF`) can establish an observed channel.
A channel is never invented from one generic resource-page observation, a
social account is never observed (only named), and no handle or URL of an
account is exported. One channel per kind per admitted root website.

## Rules (`nwf-pe-c1-extraction-rules-v1`)

Rule id: `<class>.<CONCEPT>.<language>`. 175 rules: every concept below in
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
| `C1X.NEWSLETTER_SIGNUP.<lang>`               | en, fr, es, nl, ja, de, it, pt | `channel.existence`, `channel.reach_mode`       | DP1, DP2                                |
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
| `C1G.PLATFORM_WITHOUT_C1_KIND.<lang>`        | en, fr, es, nl, ja, de, it, pt | -                                               | gap                                     |
| `C1G.WEBSITE_NEWS_FEED.<lang>`               | en, fr, es, nl, ja, de, it, pt | -                                               | gap (DP3)                               |
| `C1G.MEMBER_COUNT_UNBOUND.<lang>`            | en, fr, es, nl, ja, de, it, pt | -                                               | gap (DP4)                               |
| `C1G.CHANNEL_NOT_ESTABLISHED.<lang>`         | en, fr, es, nl, ja, de, it, pt | -                                               | gap (DP4, AP2, SV3)                     |

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
- **NEWSLETTER_SIGNUP** - newsletter term and sign-up call on one line:
  existence + `reach_mode PUSHED_TO_MEMBERS` (integration-lead decision).
- **NEWSLETTER_DATED_ISSUES** - newsletter term and a past full date on one
  line: existence + `feed_activity { completeView: false, itemDates }`.
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
  newsletter (`CHANNEL_SUBSCRIBERS`, only on an observed newsletter),
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
  and `OFFICIAL_PRESENCE_NAMES_CHANNEL` binding, both proposed.
- **CHANNEL_NAMED_AS_OWN** - "our newsletter", "notre semaine d'intégration":
  `OFFICIAL_PRESENCE_NAMES_CHANNEL` binding, proposed, only for a channel an
  observation established.
- **C1G** gaps - platforms with no C1 kind (LinkedIn, TikTok, Twitter,
  YouTube, Telegram, LINE), a website news feed (C1 has no kind for it), a
  member count (membership is not any one channel's audience), and counts /
  bindings / role statements about a channel nothing established.

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
  finding (`target: FINDING`); every withheld proposal
  (`PROPOSAL_WITHHELD_CONTACT_SHAPED_QUOTE`,
  `PROPOSAL_WITHHELD_RESERVED_NAMESPACE_MARKER_IN_QUOTE`,
  `PROPOSAL_WITHHELD_MODE_NOT_ADMISSIBLE_FOR_KEY`).
- **freshness**: for each key with a claim or proposal, the latest capture
  instant behind it and that source.

## PII

Quotes come only from stored page evidence, which `extract.ts` already
redacted (`redact.ts`). A quote is then emitted only if it is a fixed point
of `redactContactData`, carries no `[EMAIL]`/`[PHONE]` placeholder, and
contains no `cand:`/`chn:`/`opp:` marker; otherwise the proposal is withheld
and listed as a gap. Tests prove JP (`０６－１２３４－５６７８`, `03(1234)5678`), MX
(`+52 33 1234 5678`), NL (`071-123 45 67`), DE (`+49 (0)30 1234567`) and
e-mail shapes never survive, both on unredacted text and through the real
extraction path. No contact, name, handle or profile field exists.

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
- a `resource_openness` precedent kind, an `OUTDATED` / `NO_MARKER` marker, a
  `DISCONTINUED` existence, a `statedOneOff: true` cycle, a dormant feed - i.e.
  no reading of an absence;
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
`eeeeeeee-0000-4000-8000-e1…`. Regenerate with
`QUALIFICATION_INPUT_V2_WRITE_FIXTURE=1` and re-pin the SHA-256 in
`src/test/integration/qualificationInputExportV2.test.ts`.

## Boundaries

`src/test/firewall/wwC1Extraction.firewall.test.ts` pins: the six-file pure
`c1Extraction` module and its imports; no country/locale/declared-language
read; no classifier, gateway, orchestrator, source-discovery or acquisition
import (the only `web/` import is the redactor); only the v2 export imports
it; no contact/name/handle property; no score/rank/threshold name; no
`INFERENCE` path; the quote guard; `permissions: PERMISSIONS` (v1's
literals). `relP1QualificationInput.firewall.test.ts` was widened by exact
path for the three `qualificationInputV2/` files and the CLI's one new import.
