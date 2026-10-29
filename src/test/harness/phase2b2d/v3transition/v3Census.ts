/**
 * THE OPTION-C-LITE COMPATIBILITY CENSUS: WHICH PERSISTED ACQUISITION RUNS
 * THE v3 REPAIR COULD HAVE CHANGED.
 *
 * PURE. It takes persisted rows in and returns classifications out. It opens
 * no socket, no database and no file, and it prints nothing.
 *
 * IT CALLS THE LANDED PREDICATE. IT DOES NOT REIMPLEMENT IT.
 *
 *   `continuationTargetFor` is imported from `src/orgunits/web/robots.ts` -
 *   the production module ADR 0013 landed - and is the ONLY thing this module
 *   imports from the orgunit web surface. A second implementation of that
 *   predicate, however carefully written, would answer a question about
 *   ITSELF rather than about the code that will actually run. The transition
 *   rule is "could the v3 code path change this run's robots outcome?", and
 *   only the v3 code path can answer it.
 *
 * "NEWLY" IS RELATIVE TO THE VERSION THE RUN ACTUALLY EXECUTED UNDER, and
 * that is the whole subtlety of this census.
 *
 *   A v1 run continued NOTHING after a robots 3xx, so for it "newly
 *   continuable under v3" means simply "continuable under v3".
 *
 *   A v2 run already continued the same-HOSTNAME shape, so for it only a
 *   HOST-CHANGING continuation is new. This is why the landed predicate
 *   returning `hostChanged` matters here: Option B is exactly Option C-lite
 *   restricted to `hostChanged === false`, so the v2 baseline is expressible
 *   without a second copy of the v2 predicate.
 *
 *   Asking the flat question instead - "does v3 continue it?" - would
 *   classify the index-5 v2 run as affected by a capability it already had,
 *   which is the one answer the owner's instruction names as wrong.
 *
 * WHY A ROBOTS REDIRECT AND NOT ANY REDIRECT
 *
 *   ADR 0013 changed exactly one thing: which robots.txt 3xx targets may be
 *   continued. An ordinary page's redirect was already continued by ADR 0008
 *   under every version, so an ordinary redirect observation says nothing
 *   about this transition. A request is a policy request when its own URL
 *   path is exactly the policy path - read from the persisted
 *   `requested_url`, which is the URL the gateway actually asked for.
 */
import { continuationTargetFor } from '../../../../orgunits/web/robots.js';
import type { PersistedRedirect, PersistedRun } from '../transition/compatibilityCensus.js';
import { isRobotsRequest } from '../transition/compatibilityCensus.js';
import {
  OptionCLiteStop,
  SUPERSEDED_POLICY_VERSIONS,
  type V3TransitionClassification,
} from './v3Contract.js';

export type { PersistedRedirect, PersistedRun };

/**
 * Rebuild the shape `continuationTargetFor` reads, from the persisted facts.
 *
 * ONLY the `redirect` member is populated, because that is the only member
 * the predicate reads. Fabricating a plausible-looking body, status or timing
 * around it would be inventing evidence the database does not hold.
 *
 * THE TYPE IS TAKEN FROM THE PREDICATE'S OWN SIGNATURE, not imported from the
 * gateway. The gateway is the one module in `src/orgunits/` permitted a
 * socket, and this module has no business naming it even for a type - and
 * `Parameters<typeof continuationTargetFor>` is the stronger statement
 * anyway: if the landed predicate's input shape ever changes, this stops
 * compiling rather than silently building a value it no longer reads.
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

/** What the LANDED v3 predicate says about one persisted robots redirect. */
export interface V3Verdict {
  /** v3 would issue a continuation for this redirect. */
  readonly continuableUnderV3: boolean;
  /**
   * That continuation changes hostname - i.e. it is the capability v3 ADDED.
   * False both for a same-hostname continuation and for a refusal.
   */
  readonly requiresHostChange: boolean;
}

export function verdictFor(redirect: PersistedRedirect): V3Verdict {
  if (!isRobotsRequest(redirect.requestedUrl)) {
    return { continuableUnderV3: false, requiresHostChange: false };
  }
  const continuation = continuationTargetFor(redirect.requestedUrl, asAttemptResult(redirect));
  if (continuation === null) return { continuableUnderV3: false, requiresHostChange: false };
  return { continuableUnderV3: true, requiresHostChange: continuation.hostChanged };
}

/**
 * Would this redirect be continued under v3 that was NOT continued under the
 * version the run actually executed?
 */
export function newlyContinuableUnderV3(
  redirect: PersistedRedirect,
  executedPolicyVersion: string,
): boolean {
  const verdict = verdictFor(redirect);
  if (!verdict.continuableUnderV3) return false;
  switch (executedPolicyVersion) {
    case 'orgunit-fetch-policy-v1':
      // v1 continued nothing at all.
      return true;
    case 'orgunit-fetch-policy-v2':
      // v2 already continued the same-hostname shape; only a host change is new.
      return verdict.requiresHostChange;
    default:
      throw new OptionCLiteStop(
        `STOP: a persisted run records fetch policy "${executedPolicyVersion}", which is ` +
          'neither of the two superseded versions this census knows how to baseline ' +
          'against. Classifying it would mean guessing what that version could do.',
      );
  }
}

export interface RunV3Compatibility {
  readonly runId: string;
  readonly fetchPolicyVersion: string;
  readonly acquisitionOfRecord: boolean;
  readonly redirectObservations: number;
  readonly robotsRedirectObservations: number;
  /** Robots redirects v3 would continue, whatever the run's own version did. */
  readonly robotsRedirectsContinuableUnderV3: number;
  /** Of those, the ones whose continuation changes hostname. */
  readonly robotsRedirectsRequiringHostChange: number;
  /** Robots redirects v3 would refuse outright. */
  readonly robotsRedirectsStillRefused: number;
  /** Robots redirects v3 would continue that this run's own version did not. */
  readonly robotsRedirectsNewlyContinuable: number;
  readonly classification: V3TransitionClassification;
}

export function classifyRunForV3(
  run: PersistedRun,
  redirects: readonly PersistedRedirect[],
  acquisitionOfRecord: boolean,
): RunV3Compatibility {
  const own = redirects.filter((redirect) => redirect.runId === run.runId);
  const robots = own.filter((redirect) => isRobotsRequest(redirect.requestedUrl));
  const verdicts = robots.map(verdictFor);
  const newly = robots.filter((redirect) =>
    newlyContinuableUnderV3(redirect, run.fetchPolicyVersion),
  );

  return {
    runId: run.runId,
    fetchPolicyVersion: run.fetchPolicyVersion,
    acquisitionOfRecord,
    redirectObservations: own.length,
    robotsRedirectObservations: robots.length,
    robotsRedirectsContinuableUnderV3: verdicts.filter((v) => v.continuableUnderV3).length,
    robotsRedirectsRequiringHostChange: verdicts.filter((v) => v.requiresHostChange).length,
    robotsRedirectsStillRefused: verdicts.filter((v) => !v.continuableUnderV3).length,
    robotsRedirectsNewlyContinuable: newly.length,
    classification: newly.length > 0 ? 'V3_TRANSITION_AFFECTED' : 'V3_TRANSITION_UNAFFECTED',
  };
}

/** The aggregate robots-redirect census the owner asked for (task s13). */
export interface RedirectCensus {
  readonly redirectObservationsTotal: number;
  readonly robotsRedirectsTotal: number;
  /** Continuable under v3 WITHOUT a host change - i.e. Option B already allowed it. */
  readonly optionBQualifying: number;
  /** Continuable under v3 ONLY because the host boundary moved. */
  readonly optionCLiteNewlyQualifying: number;
  /** Not continuable under v3 at all. */
  readonly stillRefused: number;
}

export function censusOfRedirects(redirects: readonly PersistedRedirect[]): RedirectCensus {
  const robots = redirects.filter((redirect) => isRobotsRequest(redirect.requestedUrl));
  const verdicts = robots.map(verdictFor);
  const census: RedirectCensus = {
    redirectObservationsTotal: redirects.length,
    robotsRedirectsTotal: robots.length,
    optionBQualifying: verdicts.filter((v) => v.continuableUnderV3 && !v.requiresHostChange).length,
    optionCLiteNewlyQualifying: verdicts.filter((v) => v.continuableUnderV3 && v.requiresHostChange)
      .length,
    stillRefused: verdicts.filter((v) => !v.continuableUnderV3).length,
  };
  // The three buckets PARTITION the robots redirects. A census whose parts do
  // not sum to its whole is a census with a silently dropped row.
  if (
    census.optionBQualifying + census.optionCLiteNewlyQualifying + census.stillRefused !==
    census.robotsRedirectsTotal
  ) {
    /* c8 ignore next 4 -- unreachable by construction; asserted so it stays that way */
    throw new OptionCLiteStop('STOP: the robots-redirect census does not partition exhaustively.');
  }
  return census;
}

export interface V3CensusResult {
  readonly runs: readonly RunV3Compatibility[];
  readonly runsExamined: number;
  readonly acquisitionOfRecordRuns: number;
  readonly supersededRuns: number;
  readonly affectedCount: number;
  readonly unaffectedCount: number;
  readonly affectedAcquisitionOfRecordRuns: number;
  readonly redirects: RedirectCensus;
}

/**
 * The census over EVERY persisted acquisition run.
 *
 * Every run is classified, not only the acquisition-of-record ones, because a
 * census whose denominator depends on a governance decision would make
 * "how many runs were examined?" unanswerable from the evidence alone. Which
 * of them is of record is recorded PER RUN and aggregated separately.
 *
 * A run under the CURRENT production version is refused rather than
 * classified: the question is whether the repair would change a run that
 * predates it, and a run that already executed the repaired path has no such
 * question.
 */
export function censusOfPersistedRuns(
  runs: readonly PersistedRun[],
  redirects: readonly PersistedRedirect[],
  supersededRunIds: ReadonlySet<string>,
): V3CensusResult {
  if (runs.length === 0) {
    throw new OptionCLiteStop('STOP: no persisted acquisition run was found to classify.');
  }
  for (const run of runs) {
    if (!SUPERSEDED_POLICY_VERSIONS.includes(run.fetchPolicyVersion as never)) {
      throw new OptionCLiteStop(
        `STOP: a persisted run records fetch policy "${run.fetchPolicyVersion}", which is not ` +
          'one of the superseded versions. This census classifies history, and a run under ' +
          'the current version is not history.',
      );
    }
  }

  const classified = runs.map((run) =>
    classifyRunForV3(run, redirects, !supersededRunIds.has(run.runId)),
  );
  const affected = classified.filter((run) => run.classification === 'V3_TRANSITION_AFFECTED');

  return {
    runs: classified,
    runsExamined: classified.length,
    acquisitionOfRecordRuns: classified.filter((run) => run.acquisitionOfRecord).length,
    supersededRuns: classified.filter((run) => !run.acquisitionOfRecord).length,
    affectedCount: affected.length,
    unaffectedCount: classified.length - affected.length,
    affectedAcquisitionOfRecordRuns: affected.filter((run) => run.acquisitionOfRecord).length,
    redirects: censusOfRedirects(redirects),
  };
}
