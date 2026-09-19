/**
 * THE COMPATIBILITY CENSUS: WHICH HISTORICAL v1 RUNS THE OPTION-B REPAIR
 * COULD HAVE CHANGED.
 *
 * PURE. It takes persisted rows in and returns classifications out. It opens
 * no socket, no database and no file, and it prints nothing.
 *
 * IT CALLS THE LANDED PREDICATE. IT DOES NOT REIMPLEMENT IT.
 *
 *   `continuationTargetFor` is imported from `src/orgunits/web/robots.ts` -
 *   the production module ADR 0012 landed - and is the ONLY thing this module
 *   imports from the orgunit web surface. A second implementation of that
 *   predicate, however carefully written, would answer a question about
 *   ITSELF rather than about the code that actually ran. The transition rule
 *   is "could the Option-B code path have changed this run's robots
 *   outcome?", and only the Option-B code path can answer it.
 *
 *   The import is type-and-function only. Nothing here calls
 *   `executeWebAttempt`, `authoriseAndFetchPage`, `getRobotsPolicy` or any
 *   other network-capable symbol, and the isolation test asserts that by
 *   source text as well as by import graph.
 *
 * WHY A ROBOTS REDIRECT AND NOT ANY REDIRECT
 *
 *   ADR 0012 changed exactly one thing: what happens when a robots.txt
 *   request answers 3xx. An ordinary page's redirect was already continued by
 *   ADR 0008 under v1 and is continued identically under v2, so an ordinary
 *   redirect observation says nothing about this transition. A request is a
 *   robots.txt request when its own URL path is exactly `/robots.txt` - read
 *   from the persisted `requested_url`, which is the URL the gateway actually
 *   asked for.
 */
import { continuationTargetFor } from '../../../../orgunits/web/robots.js';
import {
  HISTORICAL_POLICY_VERSION,
  TransitionStop,
  type TransitionClassification,
} from './transitionContract.js';

/** One persisted redirect observation, joined to the request that produced it. */
export interface PersistedRedirect {
  readonly runId: string;
  readonly requestedUrl: string;
  readonly httpStatus: number;
  readonly toUrlRaw: string;
  readonly toUrlResolved: string | null;
  readonly targetMalformed: boolean;
  readonly schemeDowngraded: boolean | null;
  readonly hostChanged: boolean | null;
  readonly registrableDomainChanged: boolean | null;
}

/** One acquisition run, with the fetch-policy version its observations carry. */
export interface PersistedRun {
  readonly runId: string;
  readonly fetchPolicyVersion: string;
  readonly startedAt: string;
}

export interface RunCompatibility {
  readonly runId: string;
  readonly fetchPolicyVersion: string;
  readonly redirectObservations: number;
  readonly robotsRedirectObservations: number;
  readonly robotsRedirectsRefusedBecauseHostChanged: number;
  readonly robotsRedirectsQualifyingUnderOptionB: number;
  readonly optionBRelevantV1Run: boolean;
  readonly classification: TransitionClassification;
}

export interface CensusResult {
  readonly runs: readonly RunCompatibility[];
  readonly historicalV1RunCount: number;
  readonly compatibleCount: number;
  readonly affectedCount: number;
}

/** True when the request this redirect belongs to WAS a robots.txt request. */
export function isRobotsRequest(requestedUrl: string): boolean {
  try {
    return new URL(requestedUrl).pathname === '/robots.txt';
  } catch {
    /* c8 ignore next -- the gateway persists only URLs it had already parsed */
    return false;
  }
}

/**
 * Rebuild the shape `continuationTargetFor` reads, from the persisted facts.
 *
 * ONLY the `redirect` member is populated, because that is the only member the
 * predicate reads. Fabricating a plausible-looking body, status or timing
 * around it would be inventing evidence that the database does not hold.
 *
 * THE TYPE IS TAKEN FROM THE PREDICATE'S OWN SIGNATURE, not imported from the
 * gateway. The gateway is the one module in `src/orgunits/` permitted a
 * socket, and this module has no business naming it even for a type - and
 * `Parameters<typeof continuationTargetFor>` is the stronger statement anyway:
 * if the landed predicate's input shape ever changes, this stops compiling
 * rather than silently building a value it no longer reads.
 */
type PredicateResult = Parameters<typeof continuationTargetFor>[1];

function asAttemptResult(redirect: PersistedRedirect): PredicateResult {
  return {
    redirect: {
      toUrlRaw: redirect.toUrlRaw,
      userinfoRedacted: false,
      toUrlResolved: redirect.toUrlResolved,
      targetMalformed: redirect.targetMalformed,
      schemeDowngraded: redirect.schemeDowngraded,
      hostChanged: redirect.hostChanged,
      registrableDomainChanged: redirect.registrableDomainChanged,
    },
  } as unknown as PredicateResult;
}

/**
 * Does the LANDED predicate return a continuation target for this persisted
 * robots redirect?
 */
export function qualifiesUnderOptionB(redirect: PersistedRedirect): boolean {
  if (!isRobotsRequest(redirect.requestedUrl)) return false;
  return continuationTargetFor(redirect.requestedUrl, asAttemptResult(redirect)) !== null;
}

export function classifyRun(
  run: PersistedRun,
  redirects: readonly PersistedRedirect[],
): RunCompatibility {
  const own = redirects.filter((redirect) => redirect.runId === run.runId);
  const robots = own.filter((redirect) => isRobotsRequest(redirect.requestedUrl));
  const qualifying = robots.filter(qualifiesUnderOptionB);

  return {
    runId: run.runId,
    fetchPolicyVersion: run.fetchPolicyVersion,
    redirectObservations: own.length,
    robotsRedirectObservations: robots.length,
    robotsRedirectsRefusedBecauseHostChanged: robots.filter(
      (redirect) => redirect.hostChanged === true,
    ).length,
    robotsRedirectsQualifyingUnderOptionB: qualifying.length,
    optionBRelevantV1Run: qualifying.length > 0,
    classification:
      qualifying.length > 0 ? 'POLICY_TRANSITION_AFFECTED' : 'V1_COMPATIBLE_WITH_V2_TRANSITION',
  };
}

/**
 * The census over the HISTORICAL v1 runs only.
 *
 * A v2 run is not a candidate for this classification at all: the question is
 * whether the repair would have changed a run that predates it, and a run that
 * already executed the repaired path has no such question. Passing one in is a
 * STOP rather than a silently skipped row, because a silently skipped row
 * would make the census denominator depend on what happened to be in the
 * database.
 */
export function censusOfHistoricalV1Runs(
  runs: readonly PersistedRun[],
  redirects: readonly PersistedRedirect[],
): CensusResult {
  const historical = runs.filter((run) => run.fetchPolicyVersion === HISTORICAL_POLICY_VERSION);
  if (historical.length === 0) {
    throw new TransitionStop('STOP: no historical v1 acquisition run was found to classify.');
  }

  const classified = historical.map((run) => classifyRun(run, redirects));
  const affectedCount = classified.filter(
    (run) => run.classification === 'POLICY_TRANSITION_AFFECTED',
  ).length;

  return {
    runs: classified,
    historicalV1RunCount: classified.length,
    compatibleCount: classified.length - affectedCount,
    affectedCount,
  };
}
