/**
 * WW E-X - AUTOMATIC, SOURCE-BACKED C1 EVIDENCE FROM STORED PAGE CAPTURES
 * (`nwf-pe-c1-extraction-rules-v1`).
 *
 * `extractC1(pages, options)` reads the stored, already-redacted page
 * evidence of ONE subject's admitted research (title, h1-h3 headings, main
 * text lines) and returns, in two classes that are NEVER mixed:
 *
 *   CLAIMS     OBSERVED facts the page itself shows - dated event instances,
 *              a visible newsletter sign-up, dated newsletter issues, a
 *              visible submission invitation, a listing of external links -
 *              each on a channel C1 has a kind for, each value valid under
 *              the restated C1 schema (`vocabulary.ts`), each resting on the
 *              captures that show it. Only pages the subject itself
 *              publishes (`SELF`) produce claims or derived channels.
 *   PROPOSALS  source-stated self-descriptions C1 admits only as
 *              SELF_ASSERTED / THIRD_PARTY_ASSERTED (languages, audience,
 *              cohort, counts, role ownership, kind, social accounts, "our"
 *              channels). Each carries the rule, the language its phrase is
 *              written in, the matched phrases and a short quote of the
 *              stored text. A proposal is not a claim.
 *
 * plus the page classes each capture belongs to (research coverage), the
 * findings C1 has no faithful home for (explicit gaps), and the proposals
 * withheld because their quote would carry contact-shaped text.
 *
 * NEVER: a guessed value, a channel from a single generic resource-page
 * observation, a year guessed for a day-and-month, a country or audience
 * language from the page language, a classifier or model output, a handle,
 * a name field, a contact field. Unknown stays unknown: a rule that does not
 * match emits nothing.
 *
 * PURE: no socket, no database, no filesystem, no environment, no clock, no
 * randomness. Equal input gives equal output; every list is sorted.
 */
import { createHash } from 'node:crypto';

import { redactContactData } from '../web/redact.js';
import { C1_STATED_DATE_RULE_VERSION, statedDatesC1 } from './dates.js';
import {
  C1_PACKS,
  C1_PLATFORMS,
  UNMAPPED_PLATFORMS,
  type C1Language,
  type C1LanguagePack,
  type LearnedLanguage,
} from './lexicon.js';
import { C1_EXTRACTION_RULES_VERSION, ruleId } from './rules.js';
import {
  compilePhrases,
  matchesIn,
  quoteOf,
  statedCounts,
  unitOf,
  type CompiledPhrase,
  type TextUnit,
} from './text.js';
import {
  C1_CHANNEL_KIND_CLASS,
  assertC1Value,
  isAdmissibleMode,
  type AssertionModeV2,
  type C1AudienceSegment,
  type C1CandidateKindV2,
  type C1ChannelClass,
  type C1ChannelKind,
  type C1Cohort,
  type C1EmittedKey,
  type C1Visibility,
} from './vocabulary.js';

// ---------------------------------------------------------------------------
// Input and output.
// ---------------------------------------------------------------------------

export interface C1PageInput {
  /** The stored page-evidence row id. */
  readonly pageId: string;
  /** The admitted root website (identity claim id) whose research captured the page. */
  readonly rootKey: string;
  /** True for the admitted website's own root URL. */
  readonly isRootUrl: boolean;
  readonly publisher: 'SELF' | 'THIRD_PARTY';
  /** The capture's UTC calendar day, `YYYY-MM-DD`. */
  readonly capturedDay: string;
  readonly title: string | null;
  readonly headings: readonly string[];
  readonly mainText: string;
}

export interface C1ExtractionOptions {
  /** The subject's provisional candidate reference (the operator a binding names). */
  readonly candidateRef: string;
}

export const PAGE_CLASSES = [
  'HOME',
  'ABOUT',
  'EVENTS',
  'NEWSLETTER',
  'NEWS',
  'EXTERNAL_LINKS',
] as const;
export type PageClass = (typeof PAGE_CLASSES)[number];

export type EstablishedBy = 'OBSERVED_CLAIM' | 'PROPOSAL_ONLY';

export interface ExtractedChannel {
  /** `<C1 kind>|<rootKey>`; the admitted website itself is `RESOURCE_PAGE|<rootKey>`. */
  readonly channelKey: string;
  readonly rootKey: string;
  readonly kind: C1ChannelKind;
  readonly channelClass: C1ChannelClass;
  readonly visibility: C1Visibility;
  readonly establishedBy: EstablishedBy;
  readonly ruleIds: readonly string[];
  readonly pageIds: readonly string[];
}

export interface ExtractedClaim {
  readonly key: C1EmittedKey;
  readonly channelKey: string;
  readonly value: Readonly<Record<string, unknown>>;
  readonly ruleIds: readonly string[];
  readonly pageIds: readonly string[];
  /** The full stated dates the value rests on (empty when it rests on none). */
  readonly statedDates: readonly string[];
}

export type ProposalSubject =
  { readonly kind: 'CANDIDATE' } | { readonly kind: 'CHANNEL'; readonly channelKey: string };

export interface ExtractedProposal {
  readonly key: C1EmittedKey;
  readonly subject: ProposalSubject;
  readonly value: Readonly<Record<string, unknown>>;
  readonly mode: Exclude<AssertionModeV2, 'OBSERVED'>;
  readonly pageId: string;
  readonly ruleId: string;
  readonly language: C1Language;
  readonly matchedTerms: readonly string[];
  readonly quote: string;
  readonly quoteTruncated: boolean;
  readonly quoteSha256: string;
}

export type UnmappedReason =
  'NO_FAITHFUL_C1_CHANNEL_KIND' | 'MEMBER_COUNT_NOT_BOUND_TO_A_CHANNEL' | 'CHANNEL_NOT_ESTABLISHED';

export interface UnmappedFinding {
  readonly ruleId: string;
  readonly reason: UnmappedReason;
  readonly label: string;
  readonly pageIds: readonly string[];
}

export type WithheldReason =
  'CONTACT_SHAPED_QUOTE' | 'RESERVED_NAMESPACE_MARKER_IN_QUOTE' | 'MODE_NOT_ADMISSIBLE_FOR_KEY';

export interface WithheldFinding {
  readonly ruleId: string;
  readonly key: C1EmittedKey;
  readonly pageId: string;
  readonly reason: WithheldReason;
}

export interface C1Extraction {
  readonly rulesVersion: typeof C1_EXTRACTION_RULES_VERSION;
  readonly dateRuleVersion: typeof C1_STATED_DATE_RULE_VERSION;
  readonly pageClasses: readonly {
    readonly pageId: string;
    readonly classes: readonly PageClass[];
  }[];
  readonly channels: readonly ExtractedChannel[];
  readonly claims: readonly ExtractedClaim[];
  readonly proposals: readonly ExtractedProposal[];
  readonly unmapped: readonly UnmappedFinding[];
  readonly withheld: readonly WithheldFinding[];
}

// ---------------------------------------------------------------------------
// Compiled lexicons (once, at module load; a malformed phrase throws here).
// ---------------------------------------------------------------------------

type Field = keyof C1LanguagePack;
const listOf = (field: Field) =>
  compilePhrases(
    C1_PACKS.flatMap((p) =>
      (p[field] as readonly string[]).map((phrase) => ({
        phrase,
        language: p.language,
        payload: null,
      })),
    ),
  );

function framed<T extends string>(
  frames: (p: C1LanguagePack) => readonly string[],
  terms: (p: C1LanguagePack) => Readonly<Partial<Record<T, readonly string[]>>>,
  slot: string,
): CompiledPhrase<T>[] {
  return compilePhrases(
    C1_PACKS.flatMap((p) =>
      frames(p).flatMap((frame) =>
        (Object.entries(terms(p)) as [T, readonly string[]][]).flatMap(([value, words]) =>
          words.map((w) => ({
            phrase: frame.replace(slot, w),
            language: p.language,
            payload: value,
          })),
        ),
      ),
    ),
  );
}

const EVENT = listOf('orientationEvent');
const NEWSLETTER = listOf('newsletter');
const SIGN_UP = listOf('signUp');
const SUBMISSION = listOf('submissionInvitation');
const EXTERNAL_LINKS = listOf('externalLinksHeading');
const ABOUT = listOf('aboutHeading');
const EVENTS_HEADING = listOf('eventsHeading');
const NEWS_HEADING = listOf('newsHeading');
const ROLE = listOf('roleOwnership');
const FOLLOW_US = listOf('followUs');
const LEARN = framed<LearnedLanguage>(
  (p) => p.learnFrames,
  (p) => p.languageNames,
  '{L}',
);
const SEGMENT_WHOLE = framed<C1AudienceSegment>(
  (p) => p.wholeAudienceFrames,
  (p) => p.segmentTerms,
  '{S}',
);
const SEGMENT_ADDRESSED = framed<C1AudienceSegment>(
  (p) => p.addressedSubgroupFrames,
  (p) => p.segmentTerms,
  '{S}',
);
const COHORT = compilePhrases(
  C1_PACKS.flatMap((p) =>
    (Object.entries(p.cohortTerms) as [C1Cohort, readonly string[]][]).flatMap(([c, words]) =>
      words.map((phrase) => ({ phrase, language: p.language, payload: c })),
    ),
  ),
);
const KIND_SELF = framed<C1CandidateKindV2>(
  (p) => p.selfDescriptionFrames,
  (p) => p.kindTerms,
  '{K}',
);
const KIND_TERM = compilePhrases(
  C1_PACKS.flatMap((p) =>
    (Object.entries(p.kindTerms) as [C1CandidateKindV2, readonly string[]][]).flatMap(
      ([k, words]) => words.map((phrase) => ({ phrase, language: p.language, payload: k })),
    ),
  ),
);
type OwnChannel = 'MEMBER_NEWSLETTER' | 'ORIENTATION_EVENT';
const POSSESSIVE_CHANNEL = compilePhrases(
  C1_PACKS.flatMap((p) =>
    p.possessive.flatMap((poss) => [
      ...p.newsletter.map((t) => ({
        phrase: `${poss} ${t}`,
        language: p.language,
        payload: 'MEMBER_NEWSLETTER' as OwnChannel,
      })),
      ...p.orientationEvent.map((t) => ({
        phrase: `${poss} ${t}`,
        language: p.language,
        payload: 'ORIENTATION_EVENT' as OwnChannel,
      })),
    ]),
  ),
);
const PLATFORM = compilePhrases(
  C1_PLATFORMS.map((p) => ({
    phrase: p.term,
    language: (/^[a-z]+$/.test(p.term) ? 'en' : 'ja') as C1Language,
    payload: { kind: p.kind, visibility: p.visibility },
  })),
);
const ENROLMENT_CONTEXT: ReadonlyMap<C1Language, CompiledPhrase<null>[]> = new Map(
  C1_PACKS.map((p) => [
    p.language,
    compilePhrases(
      p.enrolmentContext.map((phrase) => ({ phrase, language: p.language, payload: null })),
    ),
  ]),
);
const UNMAPPED_PLATFORM = compilePhrases(
  UNMAPPED_PLATFORMS.map((term) => ({ phrase: term, language: 'en' as C1Language, payload: term })),
);

/** A more specific kind on the same line suppresses the generic one it refines. */
const REFINES: Readonly<Partial<Record<C1CandidateKindV2, C1CandidateKindV2>>> = {
  INTERNATIONAL_STUDENT_ASSOCIATION: 'STUDENT_ASSOCIATION',
};

// ---------------------------------------------------------------------------
// Extraction.
// ---------------------------------------------------------------------------

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const RESERVED_MARKER = /(cand|chn|opp):/i;
const REDACTION_TOKEN = /\[(EMAIL|PHONE)\]/;
const rootChannel = (rootKey: string) => `RESOURCE_PAGE|${rootKey}`;
const channelKeyOf = (kind: C1ChannelKind, rootKey: string) => `${kind}|${rootKey}`;

interface Hit {
  readonly rootKey: string;
  readonly pageId: string;
  readonly capturedDay: string;
  readonly ruleId: string;
  readonly dates: readonly string[];
}

interface ProposalDraft {
  readonly key: C1EmittedKey;
  readonly subject: ProposalSubject;
  readonly value: Readonly<Record<string, unknown>>;
  readonly page: C1PageInput;
  readonly unit: TextUnit;
  readonly concept: string;
  /** The language the deciding phrase is written in (the rule id's language). */
  readonly language: C1Language;
  readonly matched: readonly CompiledPhrase<unknown>[];
  /** For a channel subject: what may establish it if nothing else does. */
  readonly establishes: { readonly kind: C1ChannelKind; readonly visibility: C1Visibility } | null;
}

function unitsOf(page: C1PageInput): TextUnit[] {
  const units: TextUnit[] = [];
  if (page.title !== null) units.push(unitOf('TITLE', page.title));
  for (const h of page.headings) units.push(unitOf('HEADING', h));
  for (const line of page.mainText.split('\n')) {
    if (line.trim() !== '') units.push(unitOf('MAIN', line));
  }
  return units;
}

const firstLanguage = (matched: readonly CompiledPhrase<unknown>[]): C1Language =>
  matched[0]!.language;

/** Reads every page; aggregates per admitted root website. */
export function extractC1(
  pages: readonly C1PageInput[],
  options: C1ExtractionOptions,
): C1Extraction {
  const pageClasses: { pageId: string; classes: PageClass[] }[] = [];
  const eventHits: Hit[] = [];
  const signUpHits: Hit[] = [];
  const archiveHits: Hit[] = [];
  const submissionHits: Hit[] = [];
  const listingHits: Hit[] = [];
  const drafts: ProposalDraft[] = [];
  const unmapped = new Map<
    string,
    { ruleId: string; reason: UnmappedReason; label: string; pageIds: Set<string> }
  >();
  const gap = (ruleIdValue: string, reason: UnmappedReason, label: string, pageId: string) => {
    const k = `${ruleIdValue}|${reason}|${label}`;
    const entry = unmapped.get(k) ?? { ruleId: ruleIdValue, reason, label, pageIds: new Set() };
    entry.pageIds.add(pageId);
    unmapped.set(k, entry);
  };

  for (const page of [...pages].sort((a, b) => byCodeUnit(a.pageId, b.pageId))) {
    const units = unitsOf(page);
    const headingUnits = units.filter((u) => u.field !== 'MAIN');
    const self = page.publisher === 'SELF';
    const root = rootChannel(page.rootKey);
    const classes = new Set<PageClass>();
    if (page.isRootUrl) classes.add('HOME');
    if (headingUnits.some((u) => matchesIn(u, ABOUT).length > 0)) classes.add('ABOUT');
    if (headingUnits.some((u) => matchesIn(u, EVENTS_HEADING).length > 0)) classes.add('EVENTS');
    if (headingUnits.some((u) => matchesIn(u, NEWS_HEADING).length > 0)) classes.add('NEWS');
    const listing = headingUnits.flatMap((u) => matchesIn(u, EXTERNAL_LINKS));
    if (listing.length > 0) {
      classes.add('EXTERNAL_LINKS');
      if (self)
        listingHits.push(hit(page, ruleId('EXTERNAL_LINKS_LISTING', firstLanguage(listing)), []));
    }

    const languages = new Map<LearnedLanguage, CompiledPhrase<LearnedLanguage>[]>();
    let languageUnit: TextUnit | null = null;
    let newsDated = false;

    for (const unit of units) {
      const dates = statedDatesC1(unit.text);
      const pastDates = dates.filter((d) => d <= page.capturedDay);

      // ---- Orientation events: a dated instance on one line.
      const event = matchesIn(unit, EVENT);
      if (event.length > 0) {
        classes.add('EVENTS');
        if (self && dates.length > 0) {
          eventHits.push(hit(page, ruleId('ORIENTATION_EVENT_DATED', firstLanguage(event)), dates));
        }
      }

      // ---- Newsletter: sign-up call or dated issue on one line.
      const newsletter = matchesIn(unit, NEWSLETTER);
      if (newsletter.length > 0) {
        classes.add('NEWSLETTER');
        const signUp = matchesIn(unit, SIGN_UP);
        if (self && signUp.length > 0) {
          signUpHits.push(hit(page, ruleId('NEWSLETTER_SIGNUP', firstLanguage(signUp)), []));
        }
        if (self && pastDates.length > 0) {
          archiveHits.push(
            hit(page, ruleId('NEWSLETTER_DATED_ISSUES', firstLanguage(newsletter)), pastDates),
          );
        }
      }
      if (unit.field === 'MAIN' && pastDates.length > 0) newsDated = true;

      // ---- Submission invitation.
      const submission = matchesIn(unit, SUBMISSION);
      if (self && submission.length > 0) {
        submissionHits.push(
          hit(page, ruleId('SUBMISSION_INVITATION', firstLanguage(submission)), []),
        );
      }

      // ---- "Our newsletter" / "our welcome week": a binding proposal (resolved later).
      for (const m of matchesIn(unit, POSSESSIVE_CHANNEL)) {
        drafts.push({
          key: 'channel.operator_binding',
          subject: { kind: 'CHANNEL', channelKey: channelKeyOf(m.payload, page.rootKey) },
          value: {
            operatorCandidateId: options.candidateRef,
            basis: 'OFFICIAL_PRESENCE_NAMES_CHANNEL',
          },
          page,
          unit,
          concept: 'CHANNEL_NAMED_AS_OWN',
          language: m.language,
          matched: [m],
          establishes: null,
        });
      }

      // ---- Languages learned (one union proposal per page, below).
      for (const m of matchesIn(unit, LEARN)) {
        languages.set(m.payload, [...(languages.get(m.payload) ?? []), m]);
        languageUnit ??= unit;
      }

      // ---- Audience segment.
      const whole = matchesIn(unit, SEGMENT_WHOLE);
      for (const m of whole) {
        drafts.push(
          audienceDraft(page, unit, 'SEGMENT_WHOLE_AUDIENCE', m, {
            segment: m.payload,
            scope: 'WHOLE_AUDIENCE',
          }),
        );
      }
      for (const m of matchesIn(unit, SEGMENT_ADDRESSED)) {
        if (whole.some((w) => w.payload === m.payload)) continue;
        drafts.push(
          audienceDraft(page, unit, 'SEGMENT_ADDRESSED_SUBGROUP', m, {
            segment: m.payload,
            scope: 'ADDRESSED_SUBGROUP',
          }),
        );
      }

      // ---- Cohort.
      for (const m of matchesIn(unit, COHORT)) {
        drafts.push(audienceDraft(page, unit, 'COHORT', m, { cohort: m.payload }));
      }

      // ---- Platforms named with a first-person follow/join call.
      const follow = matchesIn(unit, FOLLOW_US);
      const platforms = matchesIn(unit, PLATFORM);
      if (follow.length > 0) {
        for (const p of platforms) {
          const channelKey = channelKeyOf(p.payload.kind, page.rootKey);
          const establishes = { kind: p.payload.kind, visibility: p.payload.visibility };
          drafts.push({
            key: 'channel.existence',
            subject: { kind: 'CHANNEL', channelKey },
            value: { status: 'EXISTS' },
            page,
            unit,
            concept: 'SOCIAL_ACCOUNT_NAMED',
            language: follow[0]!.language,
            matched: [follow[0]!, p],
            establishes,
          });
          drafts.push({
            key: 'channel.operator_binding',
            subject: { kind: 'CHANNEL', channelKey },
            value: {
              operatorCandidateId: options.candidateRef,
              basis: 'OFFICIAL_PRESENCE_NAMES_CHANNEL',
            },
            page,
            unit,
            concept: 'SOCIAL_ACCOUNT_NAMED',
            language: follow[0]!.language,
            matched: [follow[0]!, p],
            establishes,
          });
        }
        for (const p of matchesIn(unit, UNMAPPED_PLATFORM)) {
          gap(
            ruleId('PLATFORM_WITHOUT_C1_KIND', follow[0]!.language),
            'NO_FAITHFUL_C1_CHANNEL_KIND',
            `PLATFORM:${p.payload}`,
            page.pageId,
          );
        }
      }

      // ---- Stated counts.
      for (const pack of C1_PACKS) {
        const japanese = pack.language === 'ja';
        for (const c of statedCounts(unit.text, pack.audienceUnits, japanese)) {
          const concept =
            platforms.length > 0 ? 'AUDIENCE_COUNT_FOLLOWERS' : 'AUDIENCE_COUNT_SUBSCRIBERS';
          if (platforms.length > 0 && newsletter.length === 0) {
            const p = platforms[0]!;
            drafts.push({
              key: 'channel.audience_count',
              subject: { kind: 'CHANNEL', channelKey: channelKeyOf(p.payload.kind, page.rootKey) },
              value: { count: c.count, basis: 'PLATFORM_FOLLOWERS', segment: null },
              page,
              unit,
              concept,
              language: pack.language,
              matched: [p],
              establishes: { kind: p.payload.kind, visibility: p.payload.visibility },
            });
          } else if (newsletter.length > 0 && platforms.length === 0) {
            drafts.push({
              key: 'channel.audience_count',
              subject: {
                kind: 'CHANNEL',
                channelKey: channelKeyOf('MEMBER_NEWSLETTER', page.rootKey),
              },
              value: { count: c.count, basis: 'CHANNEL_SUBSCRIBERS', segment: null },
              page,
              unit,
              concept,
              language: pack.language,
              matched: [newsletter[0]!],
              establishes: null,
            });
          } else {
            gap(
              ruleId('CHANNEL_NOT_ESTABLISHED', pack.language),
              'CHANNEL_NOT_ESTABLISHED',
              `channel.audience_count:UNNAMED`,
              page.pageId,
            );
          }
        }
        if (statedCounts(unit.text, pack.memberUnits, japanese).length > 0) {
          gap(
            ruleId('MEMBER_COUNT_UNBOUND', pack.language),
            'MEMBER_COUNT_NOT_BOUND_TO_A_CHANNEL',
            'MEMBERS',
            page.pageId,
          );
        }
        const context = matchesIn(unit, ENROLMENT_CONTEXT.get(pack.language)!);
        if (context.length > 0) {
          for (const c of statedCounts(unit.text, pack.studentUnits, japanese)) {
            drafts.push({
              key: 'channel.audience_count',
              subject: { kind: 'CHANNEL', channelKey: root },
              value: { count: c.count, basis: 'INSTITUTION_ENROLMENT', segment: null },
              page,
              unit,
              concept: 'AUDIENCE_COUNT_ENROLMENT',
              language: pack.language,
              matched: context,
              establishes: null,
            });
          }
        }
      }

      // ---- Role-based ownership, on the channel the same line names.
      const role = matchesIn(unit, ROLE);
      if (role.length > 0) {
        const p = platforms[0];
        const channelKey =
          newsletter.length > 0
            ? channelKeyOf('MEMBER_NEWSLETTER', page.rootKey)
            : p !== undefined
              ? channelKeyOf(p.payload.kind, page.rootKey)
              : root;
        drafts.push({
          key: 'channel.role_based_ownership',
          subject: { kind: 'CHANNEL', channelKey },
          value: { holder: 'ORGANISATION_ROLE' },
          page,
          unit,
          concept: 'ROLE_BASED_OWNERSHIP',
          language: role[0]!.language,
          matched: role,
          establishes: null,
        });
      }

      // ---- Candidate kind: first-person self-description, or the home page's own title.
      const kinds = matchesIn(unit, KIND_SELF);
      const titleKinds = page.isRootUrl && unit.field === 'TITLE' ? matchesIn(unit, KIND_TERM) : [];
      for (const [list, concept] of [
        [kinds, 'CANDIDATE_KIND_SELF_DESCRIPTION'],
        [titleKinds, 'CANDIDATE_KIND_HOME_TITLE'],
      ] as const) {
        const values = new Set(list.map((m) => m.payload));
        for (const m of list) {
          const refined = Object.entries(REFINES).some(
            ([specific, generic]) =>
              generic === m.payload && values.has(specific as C1CandidateKindV2),
          );
          if (refined) continue;
          drafts.push({
            key: 'candidate.kind',
            subject: { kind: 'CANDIDATE' },
            value: { kind: m.payload },
            page,
            unit,
            concept,
            language: m.language,
            matched: [m],
            establishes: null,
          });
        }
      }
    }

    if (languages.size > 0 && languageUnit !== null) {
      const matched = [...languages.values()].flat();
      drafts.push({
        key: 'audience.languages',
        subject: { kind: 'CHANNEL', channelKey: root },
        value: { languages: [...languages.keys()].sort() },
        page,
        unit: languageUnit,
        concept: 'AUDIENCE_LANGUAGES',
        language: matched[0]!.language,
        matched,
        establishes: null,
      });
    }
    if (classes.has('NEWS') && newsDated && self) {
      const news = headingUnits.flatMap((u) => matchesIn(u, NEWS_HEADING));
      gap(
        ruleId('WEBSITE_NEWS_FEED', firstLanguage(news)),
        'NO_FAITHFUL_C1_CHANNEL_KIND',
        'WEBSITE_NEWS_FEED',
        page.pageId,
      );
    }
    pageClasses.push({ pageId: page.pageId, classes: PAGE_CLASSES.filter((c) => classes.has(c)) });
  }

  return aggregate(pages, {
    pageClasses,
    eventHits,
    signUpHits,
    archiveHits,
    submissionHits,
    listingHits,
    drafts,
    unmapped,
    gap,
  });
}

function hit(page: C1PageInput, ruleIdValue: string, dates: readonly string[]): Hit {
  return {
    rootKey: page.rootKey,
    pageId: page.pageId,
    capturedDay: page.capturedDay,
    ruleId: ruleIdValue,
    dates,
  };
}

function audienceDraft(
  page: C1PageInput,
  unit: TextUnit,
  concept: string,
  m: CompiledPhrase<unknown>,
  value: Record<string, unknown>,
): ProposalDraft {
  const key: C1EmittedKey =
    concept === 'COHORT' ? 'audience.cohort' : 'audience.segment_definition';
  return {
    key,
    subject: { kind: 'CHANNEL', channelKey: rootChannel(page.rootKey) },
    value,
    page,
    unit,
    concept,
    language: m.language,
    matched: [m],
    establishes: null,
  };
}

const distinctSorted = (values: Iterable<string>) => [...new Set(values)].sort(byCodeUnit);

/** Days within which a later stated date belongs to the SAME event instance (a multi-day event). */
export const SAME_INSTANCE_DAYS = 14;

/**
 * One date per event instance: sorted dates, each date within
 * `SAME_INSTANCE_DAYS` of the instance's first date folded into it. C1 counts
 * cycles by calendar month, so a week running from 30 August to 3 September
 * must reach it as ONE cycle, never two.
 */
function instanceStarts(sortedDates: readonly string[]): string[] {
  const starts: string[] = [];
  for (const d of sortedDates) {
    const last = starts[starts.length - 1];
    const gap = last === undefined ? Infinity : (Date.parse(d) - Date.parse(last)) / 86_400_000;
    if (gap > SAME_INSTANCE_DAYS) starts.push(d);
  }
  return starts;
}

function aggregate(
  pages: readonly C1PageInput[],
  found: {
    pageClasses: { pageId: string; classes: PageClass[] }[];
    eventHits: Hit[];
    signUpHits: Hit[];
    archiveHits: Hit[];
    submissionHits: Hit[];
    listingHits: Hit[];
    drafts: ProposalDraft[];
    unmapped: Map<
      string,
      { ruleId: string; reason: UnmappedReason; label: string; pageIds: Set<string> }
    >;
    gap: (ruleId: string, reason: UnmappedReason, label: string, pageId: string) => void;
  },
): C1Extraction {
  const channels = new Map<string, ExtractedChannel>();
  const claims: ExtractedClaim[] = [];
  const addChannel = (
    kind: C1ChannelKind,
    rootKey: string,
    visibility: C1Visibility,
    establishedBy: EstablishedBy,
    hits: readonly { ruleId: string; pageId: string }[],
  ) => {
    const channelKey = channelKeyOf(kind, rootKey);
    const prior = channels.get(channelKey);
    channels.set(channelKey, {
      channelKey,
      rootKey,
      kind,
      channelClass: C1_CHANNEL_KIND_CLASS[kind],
      visibility,
      establishedBy:
        prior?.establishedBy === 'OBSERVED_CLAIM' || establishedBy === 'OBSERVED_CLAIM'
          ? 'OBSERVED_CLAIM'
          : 'PROPOSAL_ONLY',
      ruleIds: distinctSorted([...(prior?.ruleIds ?? []), ...hits.map((h) => h.ruleId)]),
      pageIds: distinctSorted([...(prior?.pageIds ?? []), ...hits.map((h) => h.pageId)]),
    });
    return channelKey;
  };
  const claim = (
    key: C1EmittedKey,
    channelKey: string,
    value: Record<string, unknown>,
    hits: readonly Hit[],
    statedDates: readonly string[] = [],
  ) => {
    assertC1Value(key, value);
    claims.push({
      key,
      channelKey,
      value,
      ruleIds: distinctSorted(hits.map((h) => h.ruleId)),
      pageIds: distinctSorted(hits.map((h) => h.pageId)),
      statedDates: distinctSorted(statedDates),
    });
  };
  const roots = distinctSorted(pages.map((p) => p.rootKey));
  const ofRoot = (hits: readonly Hit[], rootKey: string) =>
    hits.filter((h) => h.rootKey === rootKey);

  for (const rootKey of roots) {
    // ORIENTATION_EVENT.
    const events = ofRoot(found.eventHits, rootKey);
    if (events.length > 0) {
      const channelKey = addChannel(
        'ORIENTATION_EVENT',
        rootKey,
        'PUBLIC',
        'OBSERVED_CLAIM',
        events,
      );
      const all = distinctSorted(events.flatMap((h) => h.dates));
      const past = distinctSorted(events.flatMap((h) => h.dates.filter((d) => d <= h.capturedDay)));
      const upcoming = distinctSorted(
        events.flatMap((h) => h.dates.filter((d) => d > h.capturedDay)),
      );
      claim('channel.existence', channelKey, { status: 'EXISTS' }, events, all);
      claim(
        'channel.event_instances',
        channelKey,
        {
          upcomingAnnounced: upcoming.length > 0,
          lastPastInstance: past.length > 0 ? past[past.length - 1]! : null,
          discontinued: false,
        },
        events,
        all,
      );
      const pastYears = new Set(past.map((d) => d.slice(0, 4)));
      const lastPastYear = [...pastYears].sort().pop();
      const recurs =
        pastYears.size >= 2 ||
        (lastPastYear !== undefined && upcoming.some((d) => d.slice(0, 4) > lastPastYear));
      if (recurs) {
        const cycleHits = events.map((h) => ({
          ...h,
          ruleId: h.ruleId.replace('ORIENTATION_EVENT_DATED', 'ORIENTATION_EVENT_CYCLES'),
        }));
        claim(
          'channel.cycle_history',
          channelKey,
          { cycleDates: instanceStarts(past).slice(-60), completeView: false, statedOneOff: false },
          cycleHits,
          past,
        );
      }
    }

    // MEMBER_NEWSLETTER.
    const signUps = ofRoot(found.signUpHits, rootKey);
    const issues = ofRoot(found.archiveHits, rootKey);
    if (signUps.length > 0 || issues.length > 0) {
      const channelKey = addChannel('MEMBER_NEWSLETTER', rootKey, 'PUBLIC', 'OBSERVED_CLAIM', [
        ...signUps,
        ...issues,
      ]);
      const itemDates = distinctSorted(issues.flatMap((h) => h.dates));
      claim(
        'channel.existence',
        channelKey,
        { status: 'EXISTS' },
        [...signUps, ...issues],
        itemDates,
      );
      if (signUps.length > 0) {
        claim('channel.reach_mode', channelKey, { reach: 'PUSHED_TO_MEMBERS' }, signUps);
      }
      if (itemDates.length > 0) {
        claim(
          'channel.feed_activity',
          channelKey,
          { completeView: false, itemDates: itemDates.slice(-400) },
          issues,
          itemDates,
        );
      }
    }

    // The admitted website itself: openness.
    const submissions = ofRoot(found.submissionHits, rootKey);
    if (submissions.length > 0) {
      claim(
        'channel.resource_openness',
        rootChannel(rootKey),
        { kind: 'SUBMISSION_INVITATION', itemDate: null },
        submissions,
      );
    }
    const listings = ofRoot(found.listingHits, rootKey);
    if (listings.length > 0) {
      claim(
        'channel.resource_openness',
        rootChannel(rootKey),
        { kind: 'FORMAT_ALLOWS', itemDate: null },
        listings,
      );
    }
  }

  // Proposals. Pass 1: those that may themselves establish a proposal-only channel (a named
  // social account) - the channel exists in the document only if such a proposal survives.
  // Pass 2: every other proposal, on an established channel only.
  const proposals = new Map<string, ExtractedProposal>();
  const withheld: WithheldFinding[] = [];
  const evaluate = (d: ProposalDraft): boolean => {
    const id = ruleId(d.concept, d.language);
    const mode: ExtractedProposal['mode'] =
      d.page.publisher === 'SELF' ? 'SELF_ASSERTED' : 'THIRD_PARTY_ASSERTED';
    if (!isAdmissibleMode(d.key, mode)) {
      withheld.push({
        ruleId: id,
        key: d.key,
        pageId: d.page.pageId,
        reason: 'MODE_NOT_ADMISSIBLE_FOR_KEY',
      });
      return false;
    }
    assertC1Value(d.key, d.value);
    const { quote, truncated } = quoteOf(
      d.unit,
      d.matched.map((m) => m.compiled),
    );
    const shaped = redactContactData(quote) !== quote || REDACTION_TOKEN.test(quote);
    if (shaped || RESERVED_MARKER.test(quote)) {
      withheld.push({
        ruleId: id,
        key: d.key,
        pageId: d.page.pageId,
        reason: shaped ? 'CONTACT_SHAPED_QUOTE' : 'RESERVED_NAMESPACE_MARKER_IN_QUOTE',
      });
      return false;
    }
    const subjectKey = d.subject.kind === 'CANDIDATE' ? 'CANDIDATE' : d.subject.channelKey;
    const dedupe = `${d.key}|${subjectKey}|${JSON.stringify(d.value)}|${d.page.pageId}`;
    if (!proposals.has(dedupe)) {
      proposals.set(dedupe, {
        key: d.key,
        subject: d.subject,
        value: d.value,
        mode,
        pageId: d.page.pageId,
        ruleId: id,
        language: d.language,
        matchedTerms: distinctSorted(d.matched.map((m) => m.phrase)),
        quote,
        quoteTruncated: truncated,
        quoteSha256: sha256(quote),
      });
    }
    return true;
  };
  for (const d of found.drafts) {
    if (d.establishes === null || d.subject.kind !== 'CHANNEL') continue;
    if (evaluate(d)) {
      addChannel(d.establishes.kind, d.page.rootKey, d.establishes.visibility, 'PROPOSAL_ONLY', [
        { ruleId: ruleId(d.concept, d.language), pageId: d.page.pageId },
      ]);
    }
  }
  for (const d of found.drafts) {
    if (d.establishes !== null && d.subject.kind === 'CHANNEL') continue;
    if (
      d.subject.kind === 'CHANNEL' &&
      !d.subject.channelKey.startsWith('RESOURCE_PAGE|') &&
      !channels.has(d.subject.channelKey)
    ) {
      found.gap(
        ruleId('CHANNEL_NOT_ESTABLISHED', d.language),
        'CHANNEL_NOT_ESTABLISHED',
        `${d.key}:${d.subject.channelKey.split('|')[0]!}`,
        d.page.pageId,
      );
      continue;
    }
    evaluate(d);
  }

  const subjectKeyOf = (s: ProposalSubject) => (s.kind === 'CANDIDATE' ? '' : s.channelKey);
  return {
    rulesVersion: C1_EXTRACTION_RULES_VERSION,
    dateRuleVersion: C1_STATED_DATE_RULE_VERSION,
    pageClasses: found.pageClasses.sort((a, b) => byCodeUnit(a.pageId, b.pageId)),
    channels: [...channels.values()].sort((a, b) => byCodeUnit(a.channelKey, b.channelKey)),
    claims: claims.sort(
      (a, b) =>
        byCodeUnit(a.channelKey, b.channelKey) ||
        byCodeUnit(a.key, b.key) ||
        byCodeUnit(JSON.stringify(a.value), JSON.stringify(b.value)),
    ),
    proposals: [...proposals.values()].sort(
      (a, b) =>
        byCodeUnit(a.key, b.key) ||
        byCodeUnit(subjectKeyOf(a.subject), subjectKeyOf(b.subject)) ||
        byCodeUnit(JSON.stringify(a.value), JSON.stringify(b.value)) ||
        byCodeUnit(a.pageId, b.pageId),
    ),
    unmapped: [...found.unmapped.values()]
      .map((u) => ({
        ruleId: u.ruleId,
        reason: u.reason,
        label: u.label,
        pageIds: distinctSorted(u.pageIds),
      }))
      .sort((a, b) => byCodeUnit(a.ruleId, b.ruleId) || byCodeUnit(a.label, b.label)),
    withheld: withheld.sort(
      (a, b) =>
        byCodeUnit(a.pageId, b.pageId) ||
        byCodeUnit(a.ruleId, b.ruleId) ||
        byCodeUnit(a.reason, b.reason),
    ),
  };
}
