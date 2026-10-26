/**
 * PER-RUN SIGNAL RULESET SELECTION (REL harvest H1, ported from REL-F1-R2 Wave 2 item a).
 *
 * A research run's stored `orgunit_research_runs.rule_version` is the ONE
 * fact that decides which deterministic ruleset scores that run's frontier
 * and its candidates. It is read back from the database, never chosen by a
 * caller, so a run's stored rule version always names exactly the ruleset
 * that scored it.
 *
 *   - `orgunit-signal-rules-v1` (score.ts) - every ECHE run (website claim
 *     or root promotion). FROZEN: score.ts, types.ts and candidates.ts are
 *     byte-bound by the OWNER-signed 2D-A3 K1/K2 records, and every v1 run
 *     keeps calling exactly those files.
 *   - `orgunit-signal-rules-v2` (scoreV2.ts) - every discovery-subject run
 *     (`subject_admission:` root, migration 0017), so a Japanese, Spanish or
 *     Dutch subject page scores on its own language, not on structure alone
 *     (Matrix Amendment A1 G5).
 *
 * Which version a NEW run is stamped with is decided by its root scope, in
 * `run.ts` (`startRun` -> v1, `startSubjectRun` -> v2). `rootRunner.ts`
 * refuses, before any request, a run whose stored version is not the one its
 * root's scope requires: an ECHE root can never be scored by v2, and a
 * subject root never by v1.
 *
 * PURE apart from one SELECT. Opens no socket.
 */
import type pg from 'pg';
import {
  ORGUNIT_SIGNAL_RULE_VERSION,
  scoreFetchedPageCandidate,
  scoreFrontierUrl,
  type CandidatePageScoreResult,
  type FrontierUrlScoreResult,
} from '../signals/score.js';
import {
  ORGUNIT_SIGNAL_RULE_VERSION_V2,
  scoreFetchedPageCandidateV2,
  scoreFrontierUrlV2,
} from '../signals/scoreV2.js';
import type { CandidatePageScoreResultV2, FrontierUrlScoreResultV2 } from '../signals/typesV2.js';
import type { CandidatePageInput, FrontierUrlInput } from '../signals/types.js';

export type FrontierScorer = (
  input: FrontierUrlInput,
) => FrontierUrlScoreResult | FrontierUrlScoreResultV2;

export type CandidateScorer = (
  input: CandidatePageInput,
) => CandidatePageScoreResult | CandidatePageScoreResultV2;

export interface RunSignalRuleset {
  readonly ruleVersion: string;
  readonly scoreFrontierUrl: FrontierScorer;
  readonly scoreFetchedPageCandidate: CandidateScorer;
}

export const SIGNAL_RULESET_V1: RunSignalRuleset = Object.freeze({
  ruleVersion: ORGUNIT_SIGNAL_RULE_VERSION,
  scoreFrontierUrl,
  scoreFetchedPageCandidate,
});

export const SIGNAL_RULESET_V2: RunSignalRuleset = Object.freeze({
  ruleVersion: ORGUNIT_SIGNAL_RULE_VERSION_V2,
  scoreFrontierUrl: scoreFrontierUrlV2,
  scoreFetchedPageCandidate: scoreFetchedPageCandidateV2,
});

/** The stamp a NEW subject-admission run carries (`run.ts`'s `startSubjectRun`). */
export const SUBJECT_RUN_SIGNAL_RULE_VERSION = ORGUNIT_SIGNAL_RULE_VERSION_V2;
/** The stamp a NEW ECHE run carries (`run.ts`'s `startRun`, unchanged). */
export const ECHE_RUN_SIGNAL_RULE_VERSION = ORGUNIT_SIGNAL_RULE_VERSION;

export class RunSignalRulesetRefusal extends Error {
  readonly reason: 'RUN_RULE_VERSION_UNSUPPORTED' | 'RUN_RULE_VERSION_ROOT_SCOPE_MISMATCH';

  constructor(reason: RunSignalRulesetRefusal['reason'], message: string) {
    super(`${reason}: ${message}`);
    this.name = 'RunSignalRulesetRefusal';
    this.reason = reason;
  }
}

/** The implemented ruleset for one stored version. Unknown versions are refused, never defaulted. */
export function signalRulesetFor(ruleVersion: string): RunSignalRuleset {
  if (ruleVersion === ORGUNIT_SIGNAL_RULE_VERSION) return SIGNAL_RULESET_V1;
  if (ruleVersion === ORGUNIT_SIGNAL_RULE_VERSION_V2) return SIGNAL_RULESET_V2;
  throw new RunSignalRulesetRefusal(
    'RUN_RULE_VERSION_UNSUPPORTED',
    `this build implements "${ORGUNIT_SIGNAL_RULE_VERSION}" and "${ORGUNIT_SIGNAL_RULE_VERSION_V2}", ` +
      `not "${ruleVersion}". Scoring under another ruleset would stamp a version onto ` +
      `candidates it did not produce.`,
  );
}

/** The version a root's scope requires: subject admission -> v2, ECHE claim/promotion -> v1. */
export function requiredSignalRuleVersion(root: { subjectAdmissionId: string | null }): string {
  return root.subjectAdmissionId === null
    ? ECHE_RUN_SIGNAL_RULE_VERSION
    : SUBJECT_RUN_SIGNAL_RULE_VERSION;
}

/**
 * Reads the run's STORED rule version and returns the ruleset that must score
 * it, refusing a version this build does not implement or one the root's
 * scope does not allow. One SELECT; no write, no request.
 */
export async function loadRunSignalRuleset(
  pool: pg.Pool,
  runId: string,
  root: { subjectAdmissionId: string | null },
): Promise<RunSignalRuleset> {
  const { rows } = await pool.query<{ rule_version: string }>(
    `SELECT rule_version FROM orgunit_research_runs WHERE id = $1`,
    [runId],
  );
  const stored = rows[0]?.rule_version;
  if (stored === undefined) {
    throw new RunSignalRulesetRefusal(
      'RUN_RULE_VERSION_UNSUPPORTED',
      `no orgunit_research_runs row with id ${runId}.`,
    );
  }
  const ruleset = signalRulesetFor(stored);
  const required = requiredSignalRuleVersion(root);
  if (ruleset.ruleVersion !== required) {
    throw new RunSignalRulesetRefusal(
      'RUN_RULE_VERSION_ROOT_SCOPE_MISMATCH',
      `run ${runId} is stamped "${stored}" but a ` +
        `${root.subjectAdmissionId === null ? 'website-claim/promotion' : 'subject-admission'} ` +
        `root is scored only by "${required}".`,
    );
  }
  return ruleset;
}
