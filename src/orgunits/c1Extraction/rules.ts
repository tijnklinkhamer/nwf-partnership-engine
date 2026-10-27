/**
 * WW E-X - THE RULE TABLE (`nwf-pe-c1-extraction-rules-v1`), AS DATA.
 *
 * Every finding this package emits names ONE rule id of the form
 * `<class>.<CONCEPT>.<language>`:
 *
 *   C1X  an OBSERVED claim the page itself shows (dated instances, a visible
 *        sign-up or submission call, a listing of external links). Produced
 *        by NWF_SYSTEM over Engine page captures only.
 *   C1P  a PROPOSAL: a source-stated self-description C1 admits only as
 *        SELF_ASSERTED / THIRD_PARTY_ASSERTED. Never a claim; the Operator
 *        decides whether it counts.
 *   C1G  an explicit GAP: something the page shows that C1 has no faithful
 *        home for (a platform with no channel kind, a member count bound to
 *        no channel). Recorded so it is visible, never converted.
 *
 * The language is the language the matched phrase is WRITTEN in - never a
 * country, never the organisation's language (a page in Dutch says nothing
 * about where the organisation operates).
 *
 * PURE: data only.
 */
import { C1_PACKS, type C1Language } from './lexicon.js';
import type { C1Subcriterion } from './vocabulary.js';

export const C1_EXTRACTION_RULES_VERSION = 'nwf-pe-c1-extraction-rules-v1';

export type RuleClass = 'C1X' | 'C1P' | 'C1G';

export interface C1ConceptSpec {
  readonly concept: string;
  readonly ruleClass: RuleClass;
  /** C1 claim keys a finding under this concept can carry (empty for a gap). */
  readonly keys: readonly string[];
  /** The rubric V0-R2 subcriteria those keys can affect (READ_ONLY keys affect none). */
  readonly subcriteria: readonly C1Subcriterion[];
  /** The lexicon fields of a language pack the concept needs (a language without them has no rule). */
  readonly needs: readonly string[];
  readonly reason: string;
}

export const C1_CONCEPTS: readonly C1ConceptSpec[] = [
  {
    concept: 'ORIENTATION_EVENT_DATED',
    ruleClass: 'C1X',
    keys: ['channel.existence', 'channel.event_instances'],
    subcriteria: ['DP1', 'DP3'],
    needs: ['orientationEvent'],
    reason:
      'One line names an orientation/welcome event AND states a full calendar date: the page shows a dated instance of that event (ORIENTATION_EVENT, class EVENT_SLOT). Upcoming = a date after the capture day; last past instance = the latest date on or before it. A line naming the event without a full date establishes nothing.',
  },
  {
    concept: 'ORIENTATION_EVENT_CYCLES',
    ruleClass: 'C1X',
    keys: ['channel.cycle_history'],
    subcriteria: ['SV1'],
    needs: ['orientationEvent'],
    reason:
      'The same event family is dated in more than one calendar year on the site (past instances in two years, or a past instance and a later-year upcoming one): the page shows recurrence. cycleDates are the past instances only, one date per instance (dates within 14 days of the first date of an instance are that same multi-day instance, so a week spanning a month boundary is never two cycles); completeView is false (a site is never a complete record); statedOneOff is false.',
  },
  {
    concept: 'NEWSLETTER_SIGNUP',
    ruleClass: 'C1X',
    keys: ['channel.existence', 'channel.reach_mode'],
    subcriteria: ['DP1', 'DP2'],
    needs: ['newsletter', 'signUp'],
    reason:
      'One line names a newsletter AND carries a sign-up call to action: the page shows the subscription entry point of a newsletter (MEMBER_NEWSLETTER, class FEED) whose mechanism is pushed delivery to subscribers (PUSHED_TO_MEMBERS, the integration lead decision 2026-10-27).',
  },
  {
    concept: 'NEWSLETTER_DATED_ISSUES',
    ruleClass: 'C1X',
    keys: ['channel.existence', 'channel.feed_activity'],
    subcriteria: ['DP1', 'DP3'],
    needs: ['newsletter'],
    reason:
      'One line names a newsletter AND states a full date on or before the capture day: the page shows a dated newsletter issue. itemDates are those dates; completeView is false.',
  },
  {
    concept: 'SUBMISSION_INVITATION',
    ruleClass: 'C1X',
    keys: ['channel.resource_openness'],
    subcriteria: ['AP1'],
    needs: ['submissionInvitation'],
    reason:
      'The page carries a visible invitation to submit an event or resource to the site ("submit your event"): resource_openness SUBMISSION_INVITATION on the admitted website (itemDate null - the invitation is undated).',
  },
  {
    concept: 'EXTERNAL_LINKS_LISTING',
    ruleClass: 'C1X',
    keys: ['channel.resource_openness'],
    subcriteria: ['AP1'],
    needs: ['externalLinksHeading'],
    reason:
      'The page title or a heading names a list of useful/external links: the site format observably lists external resources (FORMAT_ALLOWS, itemDate null). Affiliation of any listed item is not read, so no precedent kind is ever emitted.',
  },
  {
    concept: 'AUDIENCE_LANGUAGES',
    ruleClass: 'C1P',
    keys: ['audience.languages'],
    subcriteria: ['AF1'],
    needs: ['learnFrames', 'languageNames'],
    reason:
      'The page states that its audience learns or takes courses in named languages ("for students learning Dutch", "cours de français"). One proposal per page with the UNION of the languages that page names, so a partial set is never proposed as the whole. Never from the page language or the country.',
  },
  {
    concept: 'SEGMENT_WHOLE_AUDIENCE',
    ruleClass: 'C1P',
    keys: ['audience.segment_definition'],
    subcriteria: ['AF2'],
    needs: ['segmentTerms', 'wholeAudienceFrames'],
    reason:
      'A self-description frame names the segment as the audience the organisation exists for ("association for international students"): WHOLE_AUDIENCE, self-asserted.',
  },
  {
    concept: 'SEGMENT_ADDRESSED_SUBGROUP',
    ruleClass: 'C1P',
    keys: ['audience.segment_definition'],
    subcriteria: ['AF2'],
    needs: ['segmentTerms', 'addressedSubgroupFrames'],
    reason:
      'The page addresses the segment explicitly IN ADDITION to others ("also for exchange students"): ADDRESSED_SUBGROUP. A bare "for international students" heading is read as neither.',
  },
  {
    concept: 'COHORT',
    ruleClass: 'C1P',
    keys: ['audience.cohort'],
    subcriteria: [],
    needs: ['cohortTerms'],
    reason:
      'The page states who its audience is by age/education ("university students", "for children"). Read-only in C1 (gate G1), never points; a MINOR_TARGETED statement is proposed exactly like an adult one.',
  },
  {
    concept: 'AUDIENCE_COUNT_SUBSCRIBERS',
    ruleClass: 'C1P',
    keys: ['channel.audience_count'],
    subcriteria: ['DP4'],
    needs: ['audienceUnits', 'newsletter'],
    reason:
      'One line states a number of subscribers/readers AND names the newsletter: CHANNEL_SUBSCRIBERS on the observed newsletter channel (segment null). Without an observed newsletter channel it is a gap, never a count.',
  },
  {
    concept: 'AUDIENCE_COUNT_FOLLOWERS',
    ruleClass: 'C1P',
    keys: ['channel.audience_count'],
    subcriteria: ['DP4'],
    needs: ['audienceUnits'],
    reason:
      'One line states a number of followers AND names a platform C1 has a channel kind for: PLATFORM_FOLLOWERS on that (proposed) account (segment null).',
  },
  {
    concept: 'AUDIENCE_COUNT_ENROLMENT',
    ruleClass: 'C1P',
    keys: ['channel.audience_count'],
    subcriteria: ['DP4'],
    needs: ['studentUnits', 'enrolmentContext'],
    reason:
      'One line states a number of students AND an enrolment word: INSTITUTION_ENROLMENT on the admitted website (segment null). C1 never scores this basis, and it never becomes a channel audience.',
  },
  {
    concept: 'ROLE_BASED_OWNERSHIP',
    ruleClass: 'C1P',
    keys: ['channel.role_based_ownership'],
    subcriteria: ['SV3'],
    needs: ['roleOwnership'],
    reason:
      'The page states that a channel is run by an organisational role (the board, the committee), not a person: ORGANISATION_ROLE on the channel the same line names, else on the admitted website. SELF_ASSERTED only (C1 admits no other mode).',
  },
  {
    concept: 'CANDIDATE_KIND_SELF_DESCRIPTION',
    ruleClass: 'C1P',
    keys: ['candidate.kind'],
    subcriteria: [],
    needs: ['kindTerms', 'selfDescriptionFrames'],
    reason:
      'A first-person self-description names what the organisation is ("we are a student association"). Read-only in C1 (SV2 precondition), never points. A more specific kind on the same line suppresses the generic one.',
  },
  {
    concept: 'CANDIDATE_KIND_HOME_TITLE',
    ruleClass: 'C1P',
    keys: ['candidate.kind'],
    subcriteria: [],
    needs: ['kindTerms'],
    reason:
      "The admitted website's own home-page title names an organisation kind (its name says what it is). Read-only in C1, never points.",
  },
  {
    concept: 'SOCIAL_ACCOUNT_NAMED',
    ruleClass: 'C1P',
    keys: ['channel.existence', 'channel.operator_binding'],
    subcriteria: ['DP1', 'AP2'],
    needs: ['followUs'],
    reason:
      'One line on the admitted site names a platform C1 has a kind for AND a first-person follow/join call ("follow us on Instagram"): the organisation states it has that account. Existence and an OFFICIAL_PRESENCE_NAMES_CHANNEL binding are PROPOSED (self-asserted); the account itself was never observed. No handle is exported.',
  },
  {
    concept: 'CHANNEL_NAMED_AS_OWN',
    ruleClass: 'C1P',
    keys: ['channel.operator_binding'],
    subcriteria: ['AP2'],
    needs: ['possessive'],
    reason:
      'A first-person possessive names an observed newsletter or orientation event as the organisation\'s own ("our newsletter", "notre semaine d\'intégration"): OFFICIAL_PRESENCE_NAMES_CHANNEL, PROPOSED (it is what the page says about itself).',
  },
  {
    concept: 'PLATFORM_WITHOUT_C1_KIND',
    ruleClass: 'C1G',
    keys: [],
    subcriteria: [],
    needs: ['followUs'],
    reason:
      'A follow/join call names a platform C1 has no channel kind for (LinkedIn, TikTok, Twitter, YouTube, Telegram, LINE): recorded as a gap, never mapped onto another kind.',
  },
  {
    concept: 'WEBSITE_NEWS_FEED',
    ruleClass: 'C1G',
    keys: [],
    subcriteria: ['DP3'],
    needs: ['newsHeading'],
    reason:
      'A news/blog page with dated items: C1 has no channel kind for a website news feed (FEED kinds are social accounts and newsletters), so it is a gap, never a FEED channel.',
  },
  {
    concept: 'MEMBER_COUNT_UNBOUND',
    ruleClass: 'C1G',
    keys: [],
    subcriteria: ['DP4'],
    needs: ['memberUnits'],
    reason:
      'A stated number of members: an organisation membership is not the audience of any one channel, so it is a gap, never a channel count.',
  },
  {
    concept: 'CHANNEL_NOT_ESTABLISHED',
    ruleClass: 'C1G',
    keys: [],
    subcriteria: ['DP4', 'AP2', 'SV3'],
    needs: ['audienceUnits'],
    reason:
      'A count, role statement or "our ..." phrase about a channel this package did not establish (a subscriber number naming no channel, "our newsletter" with no observed sign-up or issue): a gap, never attached to a guessed channel.',
  },
];

export interface C1Rule {
  readonly id: string;
  readonly concept: string;
  readonly ruleClass: RuleClass;
  readonly language: C1Language;
  readonly keys: readonly string[];
  readonly subcriteria: readonly C1Subcriterion[];
  readonly reason: string;
}

const hasTerms = (value: unknown): boolean =>
  Array.isArray(value)
    ? value.length > 0
    : value !== null &&
      typeof value === 'object' &&
      Object.values(value as Record<string, unknown>).some(hasTerms);

export const ruleId = (concept: string, language: C1Language): string => {
  const spec = C1_CONCEPTS.find((c) => c.concept === concept);
  if (spec === undefined) throw new Error(`unknown c1 concept ${concept}`);
  return `${spec.ruleClass}.${concept}.${language}`;
};

/** Every rule: each concept in each language whose pack carries the lexicon it needs. */
export const C1_EXTRACTION_RULES: readonly C1Rule[] = Object.freeze(
  C1_CONCEPTS.flatMap((spec) =>
    C1_PACKS.filter((pack) =>
      spec.needs.every((field) => hasTerms((pack as unknown as Record<string, unknown>)[field])),
    ).map((pack) => ({
      id: `${spec.ruleClass}.${spec.concept}.${pack.language}`,
      concept: spec.concept,
      ruleClass: spec.ruleClass,
      language: pack.language,
      keys: spec.keys,
      subcriteria: spec.subcriteria,
      reason: spec.reason,
    })),
  ),
);
