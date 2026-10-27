/**
 * WW E-X - THE OPERATOR'S TRACK C C1 VOCABULARY, RESTATED (never imported).
 *
 * The Engine is a separate, public repository: it may not import Operator
 * code, so every C1 value this package emits is validated against the C1
 * value schema RESTATED here, field for field, from the Operator's
 * `src/api/qualification.ts` (`CLAIM_VALUE_SCHEMAS`, `CHANNEL_KIND_CLASS`,
 * `AUDIENCE_SEGMENTS`, `COUNT_BASES`, `BINDING_BASES`, `CANDIDATE_KINDS`),
 * `server/qualification/policy.ts` (`KEY_POLICY[...].admissible`) and
 * `server/qualification/rubric.ts` (which claim keys each of the twelve
 * subcriteria reads). Rubric `nwf-qualification-rubric/V0-R2`; contract
 * `nwf-qualification-input/1-provisional`.
 *
 * Only the keys this package can emit are restated as schemas. A value that
 * does not validate is a programming error and throws: nothing is ever
 * emitted "nearly valid" for the Operator to repair.
 *
 * PURE: no socket, no database, no filesystem, no environment, no clock.
 */
import { z } from 'zod';

export const C1_RUBRIC_VERSION = 'nwf-qualification-rubric/V0-R2';

/** C1 `CHANNEL_KIND_CLASS`, exactly. */
export const C1_CHANNEL_KIND_CLASS = Object.freeze({
  INSTAGRAM_ACCOUNT: 'FEED',
  FACEBOOK_PAGE: 'FEED',
  MEMBER_NEWSLETTER: 'FEED',
  ARCHIVED_MAILING_LIST: 'FEED',
  WHATSAPP_GROUP: 'PRIVATE_GROUP',
  DISCORD_SERVER: 'PRIVATE_GROUP',
  CLOSED_MAILING_LIST: 'PRIVATE_GROUP',
  RESOURCE_PAGE: 'STATIC',
  WELCOME_GUIDE: 'STATIC',
  ORIENTATION_EVENT: 'EVENT_SLOT',
} as const);
export type C1ChannelKind = keyof typeof C1_CHANNEL_KIND_CLASS;
export type C1ChannelClass = (typeof C1_CHANNEL_KIND_CLASS)[C1ChannelKind];
export type C1Visibility = 'PUBLIC' | 'PRIVATE';

export const C1_AUDIENCE_SEGMENTS = [
  'INCOMING_INTERNATIONAL_STUDENTS',
  'OUTGOING_MOBILITY_STUDENTS',
  'ENROLLED_LANGUAGE_LEARNERS',
  'LANGUAGE_SOCIETY_MEMBERS',
  'GENERAL_STUDENTS',
] as const;
export type C1AudienceSegment = (typeof C1_AUDIENCE_SEGMENTS)[number];

export const C1_COHORTS = [
  'HIGHER_EDUCATION_ADULT',
  'ADULT_NON_HIGHER_EDUCATION',
  'MINOR_TARGETED',
  'OUTSIDE_COHORT',
] as const;
export type C1Cohort = (typeof C1_COHORTS)[number];

export const C1_COUNT_BASES = [
  'CHANNEL_SEGMENT_MEMBERS',
  'CHANNEL_SUBSCRIBERS',
  'PLATFORM_FOLLOWERS',
  'INSTITUTION_ENROLMENT',
] as const;
export type C1CountBasis = (typeof C1_COUNT_BASES)[number];

export const C1_CANDIDATE_KINDS = [
  'UNIVERSITY',
  'UNIVERSITY_UNIT',
  'INTERNATIONAL_OFFICE',
  'LANGUAGE_CENTRE',
  'STUDENT_ASSOCIATION',
  'INTERNATIONAL_STUDENT_ASSOCIATION',
  'LANGUAGE_SOCIETY',
  'INFORMAL_GROUP',
  'OTHER',
] as const;
export type C1CandidateKindV2 = (typeof C1_CANDIDATE_KINDS)[number];

export const C1_BINDING_BASES = [
  'OFFICIAL_PRESENCE_NAMES_CHANNEL',
  'PARENT_DIRECTORY_NAMES_CHANNEL',
  'HOSTED_ON_CANDIDATE_SITE',
  'EVENT_ORGANISER_RECORD',
  'ADMIN_ATTESTATION',
  'PARTNER_CONFIRMED_ADMIN',
  'CHANNEL_SELF_DESCRIPTION',
  'THIRD_PARTY_MENTION',
] as const;

const obj = z.strictObject;
const isValidDate = (iso: string): boolean => {
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === iso.slice(0, 10);
};
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isValidDate, 'not a calendar date');
const languageCode = z.string().regex(/^[a-z]{2,3}$/);
const contractId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);

/** C1 `CLAIM_VALUE_SCHEMAS`, for exactly the keys this package emits. */
export const C1_VALUE_SCHEMAS = {
  'candidate.kind': obj({ kind: z.enum(C1_CANDIDATE_KINDS) }),
  'audience.languages': obj({ languages: z.array(languageCode).min(1).max(12) }),
  'audience.segment_definition': obj({
    segment: z.enum(C1_AUDIENCE_SEGMENTS),
    scope: z.enum(['WHOLE_AUDIENCE', 'ADDRESSED_SUBGROUP', 'NOT_ADDRESSED']),
  }),
  'audience.cohort': obj({ cohort: z.enum(C1_COHORTS) }),
  'channel.existence': obj({ status: z.enum(['EXISTS', 'DISCONTINUED']) }),
  'channel.reach_mode': obj({
    reach: z.enum([
      'PUSHED_TO_MEMBERS',
      'FOLLOWED_FEED',
      'ONBOARDING_PLACEMENT',
      'PASSIVE_LISTING',
      'GENERAL_PUBLIC',
    ]),
  }),
  'channel.feed_activity': obj({
    completeView: z.boolean(),
    itemDates: z.array(isoDate).max(400),
  }),
  'channel.event_instances': obj({
    upcomingAnnounced: z.boolean(),
    lastPastInstance: isoDate.nullable(),
    discontinued: z.boolean(),
  }),
  'channel.cycle_history': obj({
    cycleDates: z.array(isoDate).max(60),
    completeView: z.boolean(),
    statedOneOff: z.boolean(),
  }),
  'channel.audience_count': obj({
    count: z.number().int().min(0).max(100_000_000),
    basis: z.enum(C1_COUNT_BASES),
    segment: z.enum(C1_AUDIENCE_SEGMENTS).nullable(),
  }).refine(
    (v) => (v.basis === 'CHANNEL_SEGMENT_MEMBERS') === (v.segment !== null),
    'a CHANNEL_SEGMENT_MEMBERS count names its segment; no other count does',
  ),
  'channel.resource_openness': obj({
    kind: z.enum([
      'NON_AFFILIATED_RESOURCE_DELIVERED',
      'AFFILIATED_ONLY_SLOT',
      'SUBMISSION_INVITATION',
      'FORMAT_ALLOWS',
      'EXCLUSION_POLICY',
    ]),
    itemDate: isoDate.nullable(),
  }),
  'channel.operator_binding': obj({
    operatorCandidateId: contractId,
    basis: z.enum(C1_BINDING_BASES),
  }),
  'channel.role_based_ownership': obj({ holder: z.literal('ORGANISATION_ROLE') }),
} as const;
export type C1EmittedKey = keyof typeof C1_VALUE_SCHEMAS;

export type AssertionModeV2 = 'OBSERVED' | 'SELF_ASSERTED' | 'THIRD_PARTY_ASSERTED';

/**
 * C1 `KEY_POLICY[key].admissible`, restricted to the three modes this package
 * can state. A proposal or claim is emitted only in a mode its key admits.
 */
export const C1_ADMISSIBLE_MODES: Readonly<Record<C1EmittedKey, readonly AssertionModeV2[]>> =
  Object.freeze({
    'candidate.kind': ['OBSERVED', 'SELF_ASSERTED', 'THIRD_PARTY_ASSERTED'],
    'audience.languages': ['SELF_ASSERTED', 'THIRD_PARTY_ASSERTED'],
    'audience.segment_definition': ['SELF_ASSERTED', 'THIRD_PARTY_ASSERTED'],
    'audience.cohort': ['SELF_ASSERTED', 'THIRD_PARTY_ASSERTED'],
    'channel.existence': ['OBSERVED', 'SELF_ASSERTED', 'THIRD_PARTY_ASSERTED'],
    'channel.reach_mode': ['OBSERVED', 'SELF_ASSERTED'],
    'channel.feed_activity': ['OBSERVED'],
    'channel.event_instances': ['OBSERVED', 'SELF_ASSERTED'],
    'channel.cycle_history': ['OBSERVED', 'SELF_ASSERTED'],
    'channel.audience_count': ['OBSERVED', 'SELF_ASSERTED', 'THIRD_PARTY_ASSERTED'],
    'channel.resource_openness': ['OBSERVED', 'SELF_ASSERTED'],
    'channel.operator_binding': ['OBSERVED', 'SELF_ASSERTED', 'THIRD_PARTY_ASSERTED'],
    'channel.role_based_ownership': ['SELF_ASSERTED'],
  });

/** Every C1 claim key, the subcriterion it can affect (rubric V0-R2), or READ_ONLY. */
export const C1_SUBCRITERIA = [
  'AF1',
  'AF2',
  'AF3',
  'DP1',
  'DP2',
  'DP3',
  'DP4',
  'AP1',
  'AP2',
  'SV1',
  'SV2',
  'SV3',
] as const;
export type C1Subcriterion = (typeof C1_SUBCRITERIA)[number];

export const C1_SUBCRITERION_KEYS: Readonly<Record<C1Subcriterion, readonly string[]>> =
  Object.freeze({
    AF1: ['audience.languages', 'candidate.location'],
    AF2: ['audience.segment_definition'],
    AF3: ['audience.stated_need'],
    DP1: ['channel.existence'],
    DP2: ['channel.reach_mode'],
    DP3: ['channel.feed_activity', 'channel.static_currency', 'channel.event_instances'],
    DP4: ['channel.audience_count'],
    AP1: ['channel.resource_openness'],
    AP2: ['channel.operator_binding', 'channel.publishing_route'],
    SV1: ['channel.cycle_history'],
    SV2: ['candidate.network_membership', 'candidate.network_directory_absence'],
    SV3: ['channel.operator_continuity', 'channel.role_based_ownership'],
  });

export const C1_DIMENSION_OF: Readonly<Record<C1Subcriterion, 'AF' | 'DP' | 'AP' | 'SV'>> =
  Object.freeze({
    AF1: 'AF',
    AF2: 'AF',
    AF3: 'AF',
    DP1: 'DP',
    DP2: 'DP',
    DP3: 'DP',
    DP4: 'DP',
    AP1: 'AP',
    AP2: 'AP',
    SV1: 'SV',
    SV2: 'SV',
    SV3: 'SV',
  });

/** Throws when `value` is not a valid C1 value for `key` (a programming error, never data). */
export function assertC1Value(key: C1EmittedKey, value: unknown): void {
  const parsed = C1_VALUE_SCHEMAS[key].safeParse(value);
  if (!parsed.success) {
    throw new Error(`c1 extraction produced an invalid ${key} value`);
  }
}

/** Whether `mode` is admissible for `key` under C1's KEY_POLICY (restated). */
export const isAdmissibleMode = (key: C1EmittedKey, mode: AssertionModeV2): boolean =>
  C1_ADMISSIBLE_MODES[key].includes(mode);
