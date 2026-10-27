/**
 * WW E-SD - THE SOURCE-DISCOVERY INTERFACE FOR THE WIRING LAYER (ADR 0028 s5).
 *
 * One module a later scheduler / worker imports instead of reaching into the
 * namespace file by file:
 *
 *   planDiscoveryQueries      PURE worldwide planner -> `nwf-discovery-plan-v2`
 *   registerPlan              registers a plan by digest so an OWNER grant can name it
 *   runGrantedSourceDiscovery ONE live run under ONE stored OWNER-path grant
 *   SourceDiscoveryAuthorisation  the grant-derived capability (fromStoredGrant)
 *   productionLiveSearchDeps  the real SDK `query` + ADR 0010 auth-status runner
 *
 * plus the result, refusal and vocabulary types. Nothing exported here
 * fetches a nominated URL, classifies, orders or contacts anything.
 */
export { SourceDiscoveryAuthorisation } from './authorisation.js';
export { productionLiveSearchDeps, type LiveSearchDeps, type SdkQueryFn } from './agentQuery.js';
export {
  GRANTED_PROVIDER_KEY,
  QUERY_CALL_OUTCOMES,
  RUN_COMPLETION_OUTCOMES,
  SOURCE_DISCOVERY_ALLOWED_MODELS,
  SourceDiscoveryGrantRefusal,
  type GrantRefusalCode,
  type GrantScope,
  type QueryCallOutcome,
  type RunCompletionOutcome,
  type RunCompletionReason,
  type SourceDiscoveryClock,
} from './grant.js';
export { PlanRegistrationRefused, registerPlan } from './grantStore.js';
export {
  GrantedRunInternalError,
  GrantedRunRefusal,
  runGrantedSourceDiscovery,
  type GrantedNomination,
  type GrantedQueryCall,
  type GrantedRunDeps,
  type GrantedRunInput,
  type GrantedRunRefusalCode,
  type GrantedRunResult,
} from './grantedRun.js';
export {
  PLAN_DEFAULT_PAGE_SIZE,
  PLAN_MAX_PAGE_SIZE,
  PlannerRefusal,
  planDiscoveryQueries,
  type DiscoveryPlan,
  type DiscoveryPlanQuery,
  type DiscoveryPlanRequest,
  type NormalisedPlanRequest,
  type PlannerRefusalCode,
} from './planner/plan.js';
export {
  DISCOVERY_ORG_KINDS,
  DISCOVERY_PLAN_VERSION,
  DISCOVERY_SEGMENTS,
  DISCOVERY_SIGNALS,
  type DiscoveryOrgKind,
  type DiscoverySegment,
  type DiscoverySignal,
} from './planner/vocabulary.js';
export { QUERY_TEMPLATE_LANGUAGES } from './planner/templates.js';
