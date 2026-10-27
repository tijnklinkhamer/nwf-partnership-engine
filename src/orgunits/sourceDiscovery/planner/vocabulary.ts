/**
 * WW E-SD - THE WORLDWIDE SEARCH PLANNER'S CLOSED VOCABULARY (directive A2).
 *
 * Three dimensions describe what a QUERY is written to surface. They are
 * targets of a query, never classifications of a result: nothing here says a
 * nominated organisation IS a buddy programme or HAS a newsletter, and
 * nothing gives a dimension, a geography or an organisation kind any points.
 * A nomination carries none of these values.
 *
 * PURE. No socket, no database, no filesystem, no environment, no clock.
 */

/** The plan format this planner produces. A new shape is a new version. */
export const DISCOVERY_PLAN_VERSION = 'nwf-discovery-plan-v2' as const;

/** Who the queried organisations reach. */
export const DISCOVERY_SEGMENTS = [
  'TARGET_LEARNER_COMMUNITIES',
  'INTERNATIONAL_STUDENTS',
  'EXCHANGE_STUDENTS',
  'LOCAL_LANGUAGE_LEARNERS',
  'LANGUAGE_CULTURAL_GROUPS',
  'STUDENT_ASSOCIATION_DIRECTORIES',
  'INTERNATIONAL_STUDENT_GUIDES',
  'BUDDY_NETWORKS',
  'INDEPENDENT_COMMUNITY_NETWORKS',
  'SMALL_LOCAL_GROUPS',
] as const;
export type DiscoverySegment = (typeof DISCOVERY_SEGMENTS)[number];

/** What kind of organisation a query is written for. */
export const DISCOVERY_ORG_KINDS = [
  'EXCHANGE_STUDENT_ASSOCIATION',
  'INTERNATIONAL_STUDENT_ASSOCIATION',
  'LANGUAGE_SOCIETY',
  'BUDDY_PROGRAMME',
  'LANGUAGE_CENTRE',
  'INTERNATIONAL_OFFICE',
  'CULTURAL_ASSOCIATION',
  'COMMUNITY_LANGUAGE_ORGANISATION',
  'NETWORK_DIRECTORY',
] as const;
export type DiscoveryOrgKind = (typeof DISCOVERY_ORG_KINDS)[number];

/** Which public distribution surface a query looks for. */
export const DISCOVERY_SIGNALS = [
  'NEWSLETTER',
  'EVENTS_WELCOME_WEEK',
  'RESOURCE_PAGE',
  'MEMBER_GROUP',
  'DIRECTORY_LISTING',
] as const;
export type DiscoverySignal = (typeof DISCOVERY_SIGNALS)[number];

export interface QueryDimensions {
  readonly segment: DiscoverySegment;
  readonly orgKind: DiscoveryOrgKind;
  readonly signal: DiscoverySignal;
}
