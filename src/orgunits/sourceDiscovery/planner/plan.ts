/**
 * WW E-SD - THE WORLDWIDE SEARCH PLANNER: `nwf-discovery-plan-v2`.
 *
 * One request -> one deterministic, versioned query plan for ONE geography:
 *
 *   languages  = the geography's table languages (queryLanguages.ts), then
 *                any explicit request languages, then English - QUERY
 *                LOCALISATION ONLY, never an organisation attribute;
 *   universe   = for each template slot in visiting order, for each language:
 *                that template's text with the geography's place name, kept
 *                only if its segment, organisation kind and signal are all in
 *                the request's sets;
 *   novelty    = every query id the request's cursor already used for this
 *                geography is skipped, so consecutive plans never repeat a
 *                query; the returned `nextCursor` is the old cursor plus this
 *                page;
 *   page       = the first `pageSize` remaining queries.
 *
 * The request's exclusion set (registrable domains already nominated or
 * already known elsewhere) travels INSIDE the plan, so the plan digest - and
 * therefore the OWNER grant that names it - binds it. A run over the plan
 * marks a nomination of an excluded domain `alreadyKnown`; it never drops it.
 *
 * WHAT IT NEVER DOES. No geography, language, segment or organisation kind
 * earns or loses anything here: every geography gets the same slots, the
 * same page size and the same dimension filters; only the language and the
 * place name in the text differ. There is no score, weight, preference,
 * threshold or list of favoured geographies. Nothing here reads a nomination,
 * an organisation or a country of operation.
 *
 * PURE. No socket, no database, no filesystem, no environment, no clock, no
 * randomness.
 */
import { createHash } from 'node:crypto';

import { canonicalJson } from '../brief.js';
import { PLACE_NAMES, PLACE_NAME_COLUMNS, PLACE_NAME_TABLE_VERSION } from './placeNames.js';
import { QUERY_LANGUAGE_TABLE_VERSION, tableQueryLanguagesFor } from './queryLanguages.js';
import {
  QUERY_TEMPLATES,
  QUERY_TEMPLATE_LANGUAGES,
  QUERY_TEMPLATE_TABLE_VERSION,
  TEMPLATE_SLOTS,
  type QueryTemplateLanguage,
} from './templates.js';
import {
  DISCOVERY_ORG_KINDS,
  DISCOVERY_PLAN_VERSION,
  DISCOVERY_SEGMENTS,
  DISCOVERY_SIGNALS,
  type DiscoveryOrgKind,
  type DiscoverySegment,
  type DiscoverySignal,
  type QueryDimensions,
} from './vocabulary.js';

/** Mechanical bounds on one request. Not calibrated values; they bound memory and plan size. */
export const PLAN_DEFAULT_PAGE_SIZE = 12;
export const PLAN_MAX_PAGE_SIZE = 40;
export const PLAN_MAX_EXCLUDED_DOMAINS = 5000;
export const PLAN_MAX_USED_QUERY_IDS = 1000;
export const PLAN_MAX_QUERY_TEXT_CHARS = 200;

/** The same registrable-domain shape migration 0019 enforces on a nomination. */
const REGISTRABLE_DOMAIN_SHAPE =
  /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+([a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/** The same query-id shape migration 0019 enforces on a nomination. */
const QUERY_ID_SHAPE = /^[a-z]{2}\.[a-z]{2,3}\.[a-z0-9-]{2,48}\.[0-9]{2}$/;

/** The 249 assigned ISO 3166-1 alpha-2 codes: exactly the place-name table's rows. */
const GEOGRAPHIES: ReadonlySet<string> = new Set(Object.keys(PLACE_NAMES));

export interface DiscoveryPlanRequest {
  /** ISO 3166-1 alpha-2, any of the 249 codes the Engine accepts. */
  readonly geography: string;
  /** Explicit extra query languages (template languages only). */
  readonly languages?: readonly string[];
  readonly segments?: readonly DiscoverySegment[];
  readonly orgKinds?: readonly DiscoveryOrgKind[];
  readonly signals?: readonly DiscoverySignal[];
  /** Registrable domains already nominated or known: marked, never dropped. */
  readonly excludedDomains?: readonly string[];
  /** The previous plan's `nextCursor` for this geography; absent for the first plan. */
  readonly cursor?: { readonly usedQueryIds: readonly string[] };
  readonly pageSize?: number;
}

/** The request exactly as the plan stores and the digest binds it: every field explicit, sorted. */
export interface NormalisedPlanRequest {
  readonly geography: string;
  readonly explicitLanguages: readonly QueryTemplateLanguage[];
  readonly segments: readonly DiscoverySegment[];
  readonly orgKinds: readonly DiscoveryOrgKind[];
  readonly signals: readonly DiscoverySignal[];
  readonly excludedDomains: readonly string[];
  readonly usedQueryIds: readonly string[];
  readonly pageSize: number;
}

export interface DiscoveryPlanQuery {
  /** `<geo>.<lang>.<slug>.01`: the migration 0019 query-id shape. */
  readonly queryId: string;
  readonly language: QueryTemplateLanguage;
  readonly text: string;
  readonly dimensions: QueryDimensions;
}

/** Everything the digest covers: the stored `query_plan`. */
export interface DiscoveryPlanBody {
  readonly planVersion: typeof DISCOVERY_PLAN_VERSION;
  readonly templateTableVersion: string;
  readonly languageTableVersion: string;
  readonly placeNameTableVersion: string;
  readonly request: NormalisedPlanRequest;
  readonly geography: string;
  readonly languages: readonly QueryTemplateLanguage[];
  readonly queries: readonly DiscoveryPlanQuery[];
  /** The cursor the NEXT plan for this geography passes. */
  readonly nextCursor: { readonly usedQueryIds: readonly string[] };
  /** Queries still unused after this page. */
  readonly remaining: number;
  /** True when this plan has no query: the geography's universe is used up. */
  readonly exhausted: boolean;
}

export interface DiscoveryPlan extends DiscoveryPlanBody {
  /** `nwf-discovery-plan-v2.<CC>.<first 16 hex of digest>`. */
  readonly planId: string;
  /** SHA-256 of the canonical JSON of the body, over UTF-8 NFC text. */
  readonly digest: string;
}

export type PlannerRefusalCode =
  | 'PLAN_GEOGRAPHY_UNKNOWN'
  | 'PLAN_LANGUAGE_UNSUPPORTED'
  | 'PLAN_DIMENSION_INVALID'
  | 'PLAN_EXCLUSION_INVALID'
  | 'PLAN_CURSOR_INVALID'
  | 'PLAN_PAGE_SIZE_INVALID';

export class PlannerRefusal extends Error {
  constructor(
    readonly code: PlannerRefusalCode,
    detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = 'PlannerRefusal';
  }
}

function inVocabularyOrder<T extends string>(
  name: string,
  vocabulary: readonly T[],
  requested: readonly string[] | undefined,
): T[] {
  if (requested === undefined) return [...vocabulary];
  if (requested.length === 0) {
    throw new PlannerRefusal('PLAN_DIMENSION_INVALID', `${name} may not be empty.`);
  }
  for (const value of requested) {
    if (!(vocabulary as readonly string[]).includes(value)) {
      throw new PlannerRefusal('PLAN_DIMENSION_INVALID', `${name} has no value "${value}".`);
    }
  }
  return vocabulary.filter((v) => requested.includes(v));
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

export function normalisePlanRequest(request: DiscoveryPlanRequest): NormalisedPlanRequest {
  const geography = request.geography;
  if (!GEOGRAPHIES.has(geography)) {
    throw new PlannerRefusal(
      'PLAN_GEOGRAPHY_UNKNOWN',
      `"${geography}" is not an assigned ISO 3166-1 alpha-2 code.`,
    );
  }
  const explicit = request.languages ?? [];
  for (const language of explicit) {
    if (!(QUERY_TEMPLATE_LANGUAGES as readonly string[]).includes(language)) {
      throw new PlannerRefusal(
        'PLAN_LANGUAGE_UNSUPPORTED',
        `no query templates exist for "${language}"; supported: ${QUERY_TEMPLATE_LANGUAGES.join(', ')}.`,
      );
    }
  }
  const excludedDomains = sortedUnique(
    (request.excludedDomains ?? []).map((d) => d.trim().toLowerCase()),
  );
  if (excludedDomains.length > PLAN_MAX_EXCLUDED_DOMAINS) {
    throw new PlannerRefusal(
      'PLAN_EXCLUSION_INVALID',
      `at most ${PLAN_MAX_EXCLUDED_DOMAINS} excluded domains per plan.`,
    );
  }
  for (const domain of excludedDomains) {
    if (!REGISTRABLE_DOMAIN_SHAPE.test(domain)) {
      throw new PlannerRefusal(
        'PLAN_EXCLUSION_INVALID',
        `"${domain}" is not a registrable domain.`,
      );
    }
  }
  const usedQueryIds = sortedUnique(request.cursor?.usedQueryIds ?? []);
  if (usedQueryIds.length > PLAN_MAX_USED_QUERY_IDS) {
    throw new PlannerRefusal(
      'PLAN_CURSOR_INVALID',
      `a cursor holds at most ${PLAN_MAX_USED_QUERY_IDS} used query ids.`,
    );
  }
  const prefix = `${geography.toLowerCase()}.`;
  for (const id of usedQueryIds) {
    if (!QUERY_ID_SHAPE.test(id) || !id.startsWith(prefix)) {
      throw new PlannerRefusal(
        'PLAN_CURSOR_INVALID',
        `"${id}" is not a query id of geography ${geography}.`,
      );
    }
  }
  const pageSize = request.pageSize ?? PLAN_DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > PLAN_MAX_PAGE_SIZE) {
    throw new PlannerRefusal(
      'PLAN_PAGE_SIZE_INVALID',
      `pageSize must be an integer 1-${PLAN_MAX_PAGE_SIZE}.`,
    );
  }
  return {
    geography,
    explicitLanguages: QUERY_TEMPLATE_LANGUAGES.filter((l) => explicit.includes(l)),
    segments: inVocabularyOrder('segments', DISCOVERY_SEGMENTS, request.segments),
    orgKinds: inVocabularyOrder('orgKinds', DISCOVERY_ORG_KINDS, request.orgKinds),
    signals: inVocabularyOrder('signals', DISCOVERY_SIGNALS, request.signals),
    excludedDomains,
    usedQueryIds,
    pageSize,
  };
}

/** Local table languages first, then explicit ones, English last; each once. */
export function queryLanguagesFor(
  geography: string,
  explicit: readonly QueryTemplateLanguage[],
): QueryTemplateLanguage[] {
  const out: QueryTemplateLanguage[] = [];
  for (const language of [...tableQueryLanguagesFor(geography), ...explicit, 'en' as const]) {
    if (!out.includes(language)) out.push(language);
  }
  return out;
}

function placeName(geography: string, language: QueryTemplateLanguage): string {
  const row = PLACE_NAMES[geography]!;
  return row[PLACE_NAME_COLUMNS.indexOf(language)]!;
}

function queryText(template: string, place: string): string {
  return template
    .replace('{place}', place)
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, PLAN_MAX_QUERY_TEXT_CHARS);
}

function digestOf(body: DiscoveryPlanBody): string {
  return createHash('sha256')
    .update(
      canonicalJson(body as unknown as Parameters<typeof canonicalJson>[0]).normalize('NFC'),
      'utf8',
    )
    .digest('hex');
}

/** THE PLANNER. Deterministic: the same request always yields the same plan and digest. */
export function planDiscoveryQueries(input: DiscoveryPlanRequest): DiscoveryPlan {
  const request = normalisePlanRequest(input);
  const { geography } = request;
  const languages = queryLanguagesFor(geography, request.explicitLanguages);
  const used = new Set(request.usedQueryIds);
  const geo = geography.toLowerCase();

  const universe: DiscoveryPlanQuery[] = [];
  for (const slot of TEMPLATE_SLOTS) {
    if (
      !request.segments.includes(slot.segment) ||
      !request.orgKinds.includes(slot.orgKind) ||
      !request.signals.includes(slot.signal)
    ) {
      continue;
    }
    for (const language of languages) {
      const queryId = `${geo}.${language}.${slot.slug}.01`;
      if (used.has(queryId)) continue;
      universe.push({
        queryId,
        language,
        text: queryText(QUERY_TEMPLATES[language][slot.slug]!, placeName(geography, language)),
        dimensions: { segment: slot.segment, orgKind: slot.orgKind, signal: slot.signal },
      });
    }
  }
  const queries = universe.slice(0, request.pageSize);
  const body: DiscoveryPlanBody = {
    planVersion: DISCOVERY_PLAN_VERSION,
    templateTableVersion: QUERY_TEMPLATE_TABLE_VERSION,
    languageTableVersion: QUERY_LANGUAGE_TABLE_VERSION,
    placeNameTableVersion: PLACE_NAME_TABLE_VERSION,
    request,
    geography,
    languages,
    queries,
    nextCursor: {
      usedQueryIds: sortedUnique([...request.usedQueryIds, ...queries.map((q) => q.queryId)]),
    },
    remaining: universe.length - queries.length,
    exhausted: queries.length === 0,
  };
  const digest = digestOf(body);
  return {
    ...body,
    planId: `${DISCOVERY_PLAN_VERSION}.${geography}.${digest.slice(0, 16)}`,
    digest,
  };
}

/** The request a stored plan was built from, as planner input. */
function requestOf(stored: NormalisedPlanRequest): DiscoveryPlanRequest {
  return {
    geography: stored.geography,
    languages: stored.explicitLanguages,
    segments: stored.segments,
    orgKinds: stored.orgKinds,
    signals: stored.signals,
    excludedDomains: stored.excludedDomains,
    cursor: { usedQueryIds: stored.usedQueryIds },
    pageSize: stored.pageSize,
  };
}

/**
 * Re-derives a STORED plan body from its own request with THIS build's
 * planner and returns it only when it is byte-identical (canonical JSON) and
 * carries the expected digest. A stored plan whose queries were written by
 * anything but this planner - an edited text, an injected query - is refused,
 * so a grant can only ever authorise queries this reviewed table produces.
 * Returns null on any mismatch; never repairs.
 */
export function rederiveStoredPlan(stored: unknown, expectedDigest: string): DiscoveryPlan | null {
  if (typeof stored !== 'object' || stored === null) return null;
  const request = (stored as { request?: unknown }).request;
  if (typeof request !== 'object' || request === null) return null;
  let plan: DiscoveryPlan;
  try {
    plan = planDiscoveryQueries(requestOf(request as NormalisedPlanRequest));
  } catch {
    return null;
  }
  const { planId: _planId, digest, ...body } = plan;
  const canonical = (v: unknown) =>
    canonicalJson(v as Parameters<typeof canonicalJson>[0]).normalize('NFC');
  if (digest !== expectedDigest || canonical(body) !== canonical(stored)) return null;
  return plan;
}

/** The body exactly as `source_discovery_briefs.query_plan` stores it. */
export function planBody(plan: DiscoveryPlan): DiscoveryPlanBody {
  const { planId: _planId, digest: _digest, ...body } = plan;
  return body;
}
