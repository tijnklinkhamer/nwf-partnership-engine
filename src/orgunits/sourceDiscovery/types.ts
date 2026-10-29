/**
 * REL L2 / U1 - THE SOURCE-DISCOVERY VOCABULARY.
 *
 * Independent, global discovery of organisations that no official register
 * lists: community associations, language cafes, cultural institutes, small
 * schools, clubs, online communities. This namespace NOMINATES public URLs. It
 * never fetches one, never classifies one, never merges one with an existing
 * organisation, and never turns one into a research root. A nomination becomes
 * a discovery subject only through the existing B2.2 writer, as an explicit
 * operator act (`orgunits nominations promote`).
 *
 * KEPT SEPARATE FROM THE CLASSIFIER. Nothing here imports
 * `src/orgunits/classify/`, and nothing there imports this namespace
 * (`relL2SourceDiscovery.firewall.test.ts` asserts both directions).
 *
 * PURE. No socket, no database, no filesystem, no environment, no clock.
 */

/** How a nomination entered. Mirrors migration 0019's CHECK exactly. */
export const DISCOVERY_METHODS = ['SEARCH_PROVIDER', 'PAGE_LINK_OUT', 'SEED'] as const;
export type DiscoveryMethod = (typeof DISCOVERY_METHODS)[number];

/** Which provider produced a run's nominations. Mirrors migration 0019's CHECK exactly. */
export const PROVIDER_KEYS = [
  'scripted-search',
  'claude-max-web-search',
  'page-link-out',
  'operator-seed',
] as const;
export type ProviderKey = (typeof PROVIDER_KEYS)[number];

/** The search-provider subset: the only two keys a SEARCH_PROVIDER run may carry. */
export type SearchProviderKey = Extract<ProviderKey, 'scripted-search' | 'claude-max-web-search'>;

/**
 * The kinds of organisation a brief is written to surface, for NWF's audience
 * (language learners). A TARGET of a query, never a classification of a result.
 */
export const DISCOVERY_TARGET_KINDS = [
  'LANGUAGE_EXCHANGE_GROUP',
  'LANGUAGE_CAFE',
  'INTERNATIONAL_EXCHANGE_ASSOCIATION',
  'INTERNATIONAL_STUDENT_COMMUNITY',
  'CULTURAL_CENTRE',
  'COMMUNITY_LANGUAGE_CLASS',
  'SMALL_LANGUAGE_SCHOOL',
  'ONLINE_LANGUAGE_COMMUNITY',
] as const;
export type DiscoveryTargetKind = (typeof DISCOVERY_TARGET_KINDS)[number];

/** Bounds of the stored text, mirroring migration 0019's CHECKs. */
export const NOMINATION_TITLE_MAX_CHARS = 300;
export const NOMINATION_SNIPPET_MAX_CHARS = 1000;

/** The path key every source-discovery write records. Names a PATH, never a person. */
export const SOURCE_DISCOVERY_ACTOR_KEY = 'source-discovery-cli';

/** The capability role migration 0019 creates. */
export const SOURCE_DISCOVERY_ROLE = 'nwf_source_discovery';

/** Lower-case UUID. */
export const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** One raw result exactly as a provider returned it: untrusted, unvalidated, unredacted. */
export interface RawSearchResult {
  readonly url: string;
  readonly title: string | null;
  readonly snippet: string | null;
}
