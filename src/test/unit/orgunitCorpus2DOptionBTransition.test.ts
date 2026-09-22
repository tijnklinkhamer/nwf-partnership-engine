/**
 * PHASE 2B-2D — THE OPTION-B ACQUISITION-POLICY TRANSITION, PINNED.
 *
 * These tests pin the BEHAVIOUR of the narrow policy transition ADR 0012 made
 * necessary: which historical v1 acquisition runs the repair could have
 * changed, what the amendment is allowed to say, and what it must leave alone.
 *
 * The governing constraint is that the transition rule is MECHANICAL. It reads
 * persisted redirect facts and calls the LANDED continuation predicate, and it
 * reads no label, no model output and no candidate outcome. A rule that needed
 * any of those would be a sampling variable wearing the costume of provenance.
 *
 * No test in this file contains real page content, a real hostname or a real
 * institution identifier. The fixtures are invented strings about nothing.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FETCH_POLICY_VERSION } from '../../orgunits/web/policy.js';
import { MIN_PAGES_PER_ORGANISATION } from '../harness/phase2b2d/sd7/sd7Contract.js';
import {
  censusOfHistoricalV1Runs,
  classifyRun,
  isRobotsRequest,
  qualifiesUnderOptionB,
  type PersistedRedirect,
  type PersistedRun,
} from '../harness/phase2b2d/transition/compatibilityCensus.js';
import {
  ACCEPTANCE_METHODOLOGY_V2_OWNER_FREEZE_APPROVAL,
  ACCEPTANCE_METHODOLOGY_V2_R3,
  BATCH_02_EXECUTION_RECORD,
  CORPUS_ACQUISITION_PLAN_V1,
  CORPUS_ACQUISITION_PLAN_V1_OWNER_APPROVAL,
  DIAGNOSTIC_POST_SD7_PAGE_COUNT,
  DRAW_ARTIFACT,
  DRAW_HASH,
  FRAME_ARTIFACT,
  FRAME_HASH,
  FUTURE_POLICY_VERSION,
  PRODUCTION_POLICY_VERSION_IS_NOT_THIS_STEPS,
  HISTORICAL_POLICY_VERSION,
  HISTORICAL_V1_RUN_COUNT,
  MEASUREMENT_RECORD_PATH,
  PLAN_V1_OPTION_B_AMENDMENT,
  RESERVE_REPLACEMENT_LEDGER_PATH,
  REVALIDATION_EVIDENCE_ADJUDICATION,
  ROBOTS_REDIRECT_CONTINUATION_HOPS,
  SUPERSESSION_TOKEN,
  TRANSITION_LEDGER_PATH,
  TRANSITION_REASON,
  TRANSITION_SELECTION_INDEX,
  TRANSITION_SPLIT,
  TransitionStop,
  type BoundArtifact,
} from '../harness/phase2b2d/transition/transitionContract.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

function read(path: string): string {
  return readFileSync(join(REPO_ROOT, path), 'utf8');
}

function sha256Of(path: string): string {
  return createHash('sha256').update(read(path), 'utf8').digest('hex');
}

function bytesOf(path: string): number {
  return Buffer.byteLength(read(path), 'utf8');
}

function expectBound(artifact: BoundArtifact): void {
  expect(sha256Of(artifact.path), artifact.path).toBe(artifact.sha256);
  expect(bytesOf(artifact.path), artifact.path).toBe(artifact.bytes);
}

// ---------------------------------------------------------------------------
// Fixtures: invented redirect facts about nothing.
// ---------------------------------------------------------------------------

const RUN_A = 'run-a';
const RUN_B = 'run-b';

function redirect(overrides: Partial<PersistedRedirect> & { runId: string }): PersistedRedirect {
  return {
    requestedUrl: 'http://www.example.edu/robots.txt',
    httpStatus: 301,
    toUrlRaw: 'https://www.example.edu/robots.txt',
    toUrlResolved: 'https://www.example.edu/robots.txt',
    targetMalformed: false,
    schemeDowngraded: false,
    hostChanged: false,
    registrableDomainChanged: false,
    ...overrides,
  };
}

const v1Run = (runId: string): PersistedRun => ({
  runId,
  fetchPolicyVersion: HISTORICAL_POLICY_VERSION,
  startedAt: '2026-09-18T00:00:00.000Z',
});

// ---------------------------------------------------------------------------

describe('2D Option-B transition: the frozen inputs are byte-for-byte unchanged', () => {
  it('leaves Corpus Acquisition Plan V1 and its owner approval untouched', () => {
    expectBound(CORPUS_ACQUISITION_PLAN_V1);
    expectBound(CORPUS_ACQUISITION_PLAN_V1_OWNER_APPROVAL);
  });

  it('leaves Acceptance Methodology V2 R3 and its owner freeze approval untouched', () => {
    expectBound(ACCEPTANCE_METHODOLOGY_V2_R3);
    expectBound(ACCEPTANCE_METHODOLOGY_V2_OWNER_FREEZE_APPROVAL);
  });

  it('creates no Methodology V3 and no second methodology owner freeze approval', () => {
    const names = readdirSync(join(REPO_ROOT, 'docs/evaluation'));
    expect(names.filter((name) => /METHODOLOGY_V3/i.test(name))).toEqual([]);
    expect(
      names.filter((name) => /ACCEPTANCE_METHODOLOGY_V2_OWNER_FREEZE_APPROVAL/i.test(name)),
    ).toEqual(['PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_OWNER_FREEZE_APPROVAL_V1.json']);
    expect(names.filter((name) => /PROPOSAL_R4/i.test(name))).toEqual([]);
  });

  it('leaves the frame at exactly its bytes and its own frameHash', () => {
    expectBound(FRAME_ARTIFACT);
    const frame = JSON.parse(read(FRAME_ARTIFACT.path)) as { frameHash: string };
    expect(frame.frameHash).toBe(FRAME_HASH);
  });

  it('leaves the draw at exactly its bytes and its own drawHash', () => {
    expectBound(DRAW_ARTIFACT);
    const draw = JSON.parse(read(DRAW_ARTIFACT.path)) as { drawHash: string };
    expect(draw.drawHash).toBe(DRAW_HASH);
  });

  it('leaves the historical Batch-02 execution record unchanged', () => {
    expectBound(BATCH_02_EXECUTION_RECORD);
  });

  it('still records Batch 02’s own history: two zero-page slots and a P5 stop', () => {
    const record = JSON.parse(read(BATCH_02_EXECUTION_RECORD.path)) as {
      execution: { stoppingGate: string; organisationsNeverStarted: number[] };
      perSelectionIndex: { selectionIndex: number; rawPageEvidenceCount?: number }[];
    };
    expect(record.execution.stoppingGate).toBe('P5_LOW_RAW_YIELD');
    expect(record.execution.organisationsNeverStarted).toEqual([7, 8, 9]);
    const five = record.perSelectionIndex.find((row) => row.selectionIndex === 5)!;
    const six = record.perSelectionIndex.find((row) => row.selectionIndex === 6)!;
    expect(five.rawPageEvidenceCount).toBe(0);
    expect(six.rawPageEvidenceCount).toBe(0);
  });
});

describe('2D Option-B transition: the acquisition policy version it moved to', () => {
  it('is v2 - a HISTORICAL literal, now that production has moved past it', () => {
    // This step's published record and ledger are a v2-era measurement with
    // frozen bytes. Reading the live constant here would restate them as a
    // claim about whatever version production implements today, which is a
    // claim this step never made. See the constant's own comment.
    expect(FUTURE_POLICY_VERSION).toBe('orgunit-fetch-policy-v2');
  });

  it('has genuinely diverged from production, so the literal cannot be right by accident', () => {
    expect(PRODUCTION_POLICY_VERSION_IS_NOT_THIS_STEPS).toBe(FETCH_POLICY_VERSION);
    // CURRENT production, and it moves when production moves. The HISTORICAL
    // Option-B target above stays v2 for ever.
    expect(FETCH_POLICY_VERSION).toBe('orgunit-fetch-policy-v6');
    expect(FUTURE_POLICY_VERSION).not.toBe(FETCH_POLICY_VERSION);
  });

  it('is not the historical one', () => {
    expect(HISTORICAL_POLICY_VERSION).toBe('orgunit-fetch-policy-v1');
    expect(FUTURE_POLICY_VERSION).not.toBe(HISTORICAL_POLICY_VERSION);
  });

  it('admits no future v1 acquisition run, because the build implements exactly one version', () => {
    const source = read('src/orgunits/web/policy.ts');
    expect(source.match(/FETCH_POLICY_VERSION\s*=\s*'[^']+'/g)).toEqual([
      "FETCH_POLICY_VERSION = 'orgunit-fetch-policy-v6'",
    ]);
    // No production CODE may name the historical version: a v1 string reachable
    // from production is a v1 run waiting for an argument to select it. Comments
    // are stripped first, because policy.ts legitimately EXPLAINS the v1 -> v2
    // transition in prose and that explanation is not a code path.
    for (const file of [
      'src/orgunits/web/policy.ts',
      'src/orgunits/web/gateway.ts',
      'src/orgunits/web/robots.ts',
      'src/orgunits/orchestrator/run.ts',
      'src/orgunits/orchestrator/rootRunner.ts',
      'src/cli/commands/discover.ts',
    ]) {
      const code = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(code, file).not.toContain(HISTORICAL_POLICY_VERSION);
    }
  });

  it('bounds a robots redirect continuation at exactly one hop', () => {
    expect(ROBOTS_REDIRECT_CONTINUATION_HOPS).toBe(1);
  });
});

describe('2D Option-B transition: the compatibility rule is mechanical', () => {
  it('treats only a /robots.txt request as a robots redirect', () => {
    expect(isRobotsRequest('https://www.example.edu/robots.txt')).toBe(true);
    expect(isRobotsRequest('https://www.example.edu/')).toBe(false);
    expect(isRobotsRequest('https://www.example.edu/international/')).toBe(false);
  });

  it('classifies a same-host http -> https robots redirect as POLICY_TRANSITION_AFFECTED', () => {
    const observation = redirect({ runId: RUN_A });
    expect(qualifiesUnderOptionB(observation)).toBe(true);
    expect(classifyRun(v1Run(RUN_A), [observation]).classification).toBe(
      'POLICY_TRANSITION_AFFECTED',
    );
  });

  it('leaves a HOST-CHANGING robots redirect V1_COMPATIBLE_WITH_V2_TRANSITION', () => {
    // v2 deliberately still refuses this, so the run's outcome is identical
    // under both policy versions and nothing about it needs re-acquiring.
    for (const target of [
      'https://example.edu/robots.txt',
      'https://www2.example.edu/robots.txt',
      'https://elsewhere.example.org/robots.txt',
    ]) {
      const observation = redirect({
        runId: RUN_A,
        requestedUrl: 'https://www.example.edu/robots.txt',
        toUrlRaw: target,
        toUrlResolved: target,
        hostChanged: true,
        registrableDomainChanged: target.includes('example.org'),
      });
      expect(qualifiesUnderOptionB(observation), target).toBe(false);
      expect(classifyRun(v1Run(RUN_A), [observation]).classification, target).toBe(
        'V1_COMPATIBLE_WITH_V2_TRANSITION',
      );
    }
  });

  it('leaves an ORDINARY-PAGE redirect V1_COMPATIBLE, because ADR 0008 already continued it', () => {
    const observation = redirect({
      runId: RUN_A,
      requestedUrl: 'http://www.example.edu/',
      toUrlRaw: 'https://www.example.edu/',
      toUrlResolved: 'https://www.example.edu/',
    });
    expect(qualifiesUnderOptionB(observation)).toBe(false);
    expect(classifyRun(v1Run(RUN_A), [observation]).classification).toBe(
      'V1_COMPATIBLE_WITH_V2_TRANSITION',
    );
  });

  it('leaves a run with no redirect at all V1_COMPATIBLE', () => {
    const classified = classifyRun(v1Run(RUN_B), [redirect({ runId: RUN_A })]);
    expect(classified.redirectObservations).toBe(0);
    expect(classified.classification).toBe('V1_COMPATIBLE_WITH_V2_TRANSITION');
  });

  it('leaves a MALFORMED robots redirect target V1_COMPATIBLE rather than repairing it', () => {
    const observation = redirect({
      runId: RUN_A,
      toUrlRaw: 'REDACTED_USERINFO',
      toUrlResolved: null,
      targetMalformed: true,
      schemeDowngraded: null,
      hostChanged: null,
      registrableDomainChanged: null,
    });
    expect(qualifiesUnderOptionB(observation)).toBe(false);
  });

  it('partitions a census exhaustively, and counts only historical v1 runs', () => {
    const runs: PersistedRun[] = [
      v1Run(RUN_A),
      v1Run(RUN_B),
      {
        runId: 'run-v2',
        fetchPolicyVersion: FUTURE_POLICY_VERSION,
        startedAt: '2026-09-19T00:00:00.000Z',
      },
    ];
    const census = censusOfHistoricalV1Runs(runs, [redirect({ runId: RUN_A })]);
    expect(census.historicalV1RunCount).toBe(2);
    expect(census.affectedCount).toBe(1);
    expect(census.compatibleCount).toBe(1);
    expect(census.compatibleCount + census.affectedCount).toBe(census.historicalV1RunCount);
    expect(census.runs.map((run) => run.runId)).toEqual([RUN_A, RUN_B]);
  });

  it('STOPS rather than reporting an empty census', () => {
    expect(() =>
      censusOfHistoricalV1Runs(
        [
          {
            runId: 'x',
            fetchPolicyVersion: FUTURE_POLICY_VERSION,
            startedAt: '2026-09-19T00:00:00.000Z',
          },
        ],
        [],
      ),
    ).toThrow(TransitionStop);
  });

  it('reads no label, no model output and no candidate outcome', () => {
    const source = read('src/test/harness/phase2b2d/transition/compatibilityCensus.ts');
    for (const forbidden of [
      'label',
      'gold',
      'classification_score',
      'candidate_score',
      'orgunit_page_candidates',
      'classifier',
      'anthropic',
    ]) {
      expect(source.toLowerCase(), forbidden).not.toContain(forbidden.toLowerCase());
    }
  });
});

describe('2D Option-B transition: the amendment says what it is allowed to say', () => {
  const amendment = () =>
    JSON.parse(read(PLAN_V1_OPTION_B_AMENDMENT.path)) as Record<string, never> & {
      amendmentScope: string;
      methodologyChanged: boolean;
      frameChanged: boolean;
      drawChanged: boolean;
      splitAssignmentChanged: boolean;
      samplingChanged: boolean;
      labelsExistAtAmendmentTime: boolean;
      providerInferenceOccurredForGeneration: boolean;
      frozenCeilingsUnchanged: Record<string, number | boolean>;
      newlyDeclaredBound: Record<string, unknown>;
      networkExposureAmendment: {
        v2ConservativeDecomposition: Record<string, number | boolean>;
        oneHundredFiftyOneRootSelectionAndReserveUpperBound: Record<string, number | boolean>;
        noTotalRequestBudgetChangeIsRequired: boolean;
      };
      frameAndDrawRemainValid: Record<string, unknown>;
    };

  it('is the file the contract binds, byte for byte', () => {
    expectBound(PLAN_V1_OPTION_B_AMENDMENT);
  });

  it('is scoped to the policy-version transition and nothing else', () => {
    const record = amendment();
    expect(record.amendmentScope).toBe('ACQUISITION_POLICY_VERSION_TRANSITION_ONLY');
    expect(record.methodologyChanged).toBe(false);
    expect(record.frameChanged).toBe(false);
    expect(record.drawChanged).toBe(false);
    expect(record.splitAssignmentChanged).toBe(false);
    expect(record.samplingChanged).toBe(false);
    expect(record.labelsExistAtAmendmentTime).toBe(false);
    expect(record.providerInferenceOccurredForGeneration).toBe(false);
  });

  it('raises no frozen ceiling', () => {
    expect(amendment().frozenCeilingsUnchanged).toMatchObject({
      MAX_TOTAL_REQUESTS_PER_ROOT: 60,
      MAX_PAGE_ATTEMPTS_PER_ROOT: 35,
      MAX_HOSTS_PER_ROOT: 8,
      MAX_SITEMAP_DOCUMENTS_PER_ROOT: 5,
      MAX_SITEMAP_DEPTH: 2,
      MAX_SITEMAP_URLS_PER_ROOT: 3000,
      noCeilingIsRaisedByThisAmendment: true,
    });
  });

  it('declares the one-hop robots continuation bound, matching production', () => {
    expect(amendment().newlyDeclaredBound.MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS).toBe(
      ROBOTS_REDIRECT_CONTINUATION_HOPS,
    );
  });

  it('re-decomposes the per-root arithmetic to 56 and stays under the unchanged 60', () => {
    const decomposition = amendment().networkExposureAmendment.v2ConservativeDecomposition;
    expect(decomposition).toMatchObject({
      ordinaryPages: 35,
      robotsRequests: 16,
      sitemapRequests: 5,
      total: 56,
      ceiling: 60,
      stillBelowTheCeiling: true,
    });
    expect(35 + 8 * (1 + ROBOTS_REDIRECT_CONTINUATION_HOPS) + 5).toBe(56);
    expect(56).toBeLessThan(60);
    expect(amendment().networkExposureAmendment.noTotalRequestBudgetChangeIsRequired).toBe(true);
  });

  it('doubles only the robots COMPONENT of the 150-organisation exposure, never the ceiling', () => {
    const bound =
      amendment().networkExposureAmendment.oneHundredFiftyOneRootSelectionAndReserveUpperBound;
    expect(bound).toMatchObject({
      organisations: 150,
      totalGatewayCeiling: 9000,
      totalGatewayCeilingUnchanged: true,
      ordinaryPageCeiling: 5250,
      ordinaryPageCeilingUnchanged: true,
      robotsRequestComponentBefore: 1200,
      robotsRequestComponentAfter: 2400,
      thisIsADecompositionChangeOnly: true,
      itDoesNotIncreaseThe9000GatewayRequestCeiling: true,
    });
    expect(150 * 60).toBe(9000);
    expect(150 * 35).toBe(5250);
    expect(150 * 8 * (1 + ROBOTS_REDIRECT_CONTINUATION_HOPS)).toBe(2400);
  });

  it('states the frame and draw hashes unchanged, and they are the real ones', () => {
    const record = amendment().frameAndDrawRemainValid;
    expect(record.frameHash).toBe(FRAME_HASH);
    expect(record.drawHash).toBe(DRAW_HASH);
    expect(record.frameHashRemainsUnchanged).toBe(true);
    expect(record.drawHashRemainsUnchanged).toBe(true);
    expect(record.neitherIsRegenerated).toBe(true);
  });
});

describe('2D Option-B transition: the owner adjudication record', () => {
  const adjudication = () =>
    JSON.parse(read(REVALIDATION_EVIDENCE_ADJUDICATION.path)) as {
      liveRevalidationAccepted: boolean;
      hostSafetyDeviationAccepted: boolean;
      hostSafetyDeviation: { classification: string };
      methodologyR3Changed: boolean;
      corpusAcquisitionPlanAmended: boolean;
      futurePolicyVersion: string;
      historicalV1CompatibilityRule: string;
      selectionIndex5V2EvidenceEligibleForAcquisitionOfRecord: boolean;
      selectionIndex5ReserveReplacement: boolean;
      reserveConsumption: number;
      batch03Authorised: boolean;
      batch02ContinuationAuthorised: boolean;
      supersessionSemantics: Record<string, unknown>;
    };

  it('is the file the contract binds, byte for byte', () => {
    expectBound(REVALIDATION_EVIDENCE_ADJUDICATION);
  });

  it('carries exactly the owner’s adjudication fields', () => {
    expect(adjudication()).toMatchObject({
      liveRevalidationAccepted: true,
      hostSafetyDeviationAccepted: true,
      methodologyR3Changed: false,
      corpusAcquisitionPlanAmended: true,
      futurePolicyVersion: 'orgunit-fetch-policy-v2',
      historicalV1CompatibilityRule: 'OPTION_B_CODE_PATH_UNREACHABLE',
      selectionIndex5V2EvidenceEligibleForAcquisitionOfRecord: true,
      selectionIndex5ReserveReplacement: false,
      reserveConsumption: 0,
      batch03Authorised: false,
      batch02ContinuationAuthorised: false,
    });
  });

  it('classifies the AC-power deviation without excusing the precondition', () => {
    expect(adjudication().hostSafetyDeviation.classification).toBe(
      'ACCEPTED_EXECUTION_DEVIATION_NO_OBSERVED_EVIDENCE_IMPACT',
    );
  });

  it('defines SUPERSEDED as a status change and never as a deletion', () => {
    expect(adjudication().supersessionSemantics).toMatchObject({
      tokenUsedWhenTheFormalSd7MeasurementPromotesTheV2Run: SUPERSESSION_TOKEN,
      theHistoricalV1RowRemainsImmutable: true,
      theHistoricalV1RunRemainsValidEvidenceOfV1Behaviour: true,
      itIsNotDeleted: true,
      itIsNotMarkedErroneous: true,
      itsBatch02ExecutionRecordIsNotEdited: true,
    });
  });
});

describe('2D Option-B transition: SD9 is driven by the FORMAL measurement', () => {
  it('names the landed SD7 minimum rather than a new one', () => {
    expect(MIN_PAGES_PER_ORGANISATION).toBe(4);
  });

  it('never feeds the diagnostic number into the measurement', () => {
    const source = read('src/test/harness/phase2b2d/transition/materialiseTransition.ts');
    // The diagnostic appears only where it is COMPARED, never where the
    // analysis is called or where the SD9 verdict is read.
    const analysisCall = source.slice(
      source.indexOf('analyseOrganisation({'),
      source.indexOf('// ---- 6.'),
    );
    expect(analysisCall).not.toContain('DIAGNOSTIC_POST_SD7_PAGE_COUNT');
    expect(source).toContain('diagnosticAgrees');
    expect(source).toContain('theDiagnosticWasNotAnInputToThisMeasurement');
    expect(source).toContain('The formal count was recomputed from the source evidence');
  });

  it('carries the diagnostic only as a cross-check value', () => {
    expect(DIAGNOSTIC_POST_SD7_PAGE_COUNT).toBe(28);
  });

  it('stops rather than promoting when the formal count is below the minimum', () => {
    const source = read('src/test/harness/phase2b2d/transition/materialiseTransition.ts');
    expect(source).toContain("analysis.sd9Status !== 'ACQUISITION_SUCCESSFUL'");
    expect(source).toContain('requires');
    expect(source).toContain('stop for owner review');
  });

  it('stops rather than promoting when the post-SD7 count is a RANGE', () => {
    const source = read('src/test/harness/phase2b2d/transition/materialiseTransition.ts');
    expect(source).toContain('!analysis.countIsExact');
  });
});

describe('2D Option-B transition: index 5 keeps everything except which run counts', () => {
  it('is the DEV_TRAIN selection index the draw assigned, read from the draw itself', () => {
    const draw = JSON.parse(read(DRAW_ARTIFACT.path)) as {
      selection: { selectionIndex: number; split: string }[];
      reserve: unknown[];
    };
    const entry = draw.selection.find(
      (candidate) => candidate.selectionIndex === TRANSITION_SELECTION_INDEX,
    )!;
    expect(entry.split).toBe(TRANSITION_SPLIT);
    expect(TRANSITION_SELECTION_INDEX).toBe(5);
  });

  it('leaves the reserve list at its full, unconsumed length', () => {
    const draw = JSON.parse(read(DRAW_ARTIFACT.path)) as { reserve: unknown[] };
    expect(draw.reserve).toHaveLength(40);
  });

  /**
   * READ AT THE STEP'S OWN TERMINAL COMMIT, NOT THE WORKING TREE.
   *
   * "Option B replaced nothing" is a HISTORICAL claim about this step. It used
   * to be proved by failing to read the ledger path from the working tree,
   * which quietly turned it into "no later phase may ever create the reserve
   * replacement ledger" - a statement nobody approved, and one the post-v4
   * replacement implementation, which IS approved, necessarily breaks by
   * creating the (empty) genesis ledger at exactly this path.
   *
   * `b0f4efa` is the commit that landed the transition census, the SD7
   * measurement and the transition ledger - the same terminal commit
   * `orgunitCorpus2DOptionBTransitionIsolation.test.ts` pins, and the commit
   * the Batch-02 v2 continuation authority binds the transition ledger to.
   * At that commit the ledger did not exist, and it still did not exist then
   * no matter what a later phase adds. The present-day existence of the
   * ledger is asserted by the continuation-window suite, not here.
   */
  const OPTION_B_TERMINAL_COMMIT = 'b0f4efa01d7e861a701e3514afc690a99262f554';

  function commitExists(commit: string): boolean {
    try {
      execFileSync('git', ['-C', REPO_ROOT, 'cat-file', '-e', `${commit}^{commit}`], {
        stdio: 'ignore',
      });
      return true;
    } catch {
      return false;
    }
  }

  function existedAtTerminal(path: string): boolean {
    try {
      execFileSync(
        'git',
        ['-C', REPO_ROOT, 'cat-file', '-e', `${OPTION_B_TERMINAL_COMMIT}:${path}`],
        {
          stdio: 'ignore',
        },
      );
      return true;
    } catch {
      return false;
    }
  }

  /** A shallow clone may not carry the terminal commit; the check is then skipped rather than guessed. */
  it.skipIf(!commitExists(OPTION_B_TERMINAL_COMMIT))(
    'had no reserve replacement ledger at its own terminal commit, because nothing was replaced',
    () => {
      expect(existedAtTerminal(RESERVE_REPLACEMENT_LEDGER_PATH)).toBe(false);
      // Not a vacuous probe: the transition ledger this step DID create is visible there.
      expect(existedAtTerminal(TRANSITION_LEDGER_PATH)).toBe(true);
    },
  );
});

describe('2D Option-B transition: the ledger is its own thing', () => {
  const ledger = () =>
    JSON.parse(read(TRANSITION_LEDGER_PATH)) as {
      recordKind: string;
      entryCount: number;
      thisIsNotTheReserveReplacementLedger: Record<string, unknown>;
      entries: Record<string, unknown>[];
    };

  it('is a transition ledger, not a replacement ledger, and says so structurally', () => {
    const record = ledger();
    expect(record.recordKind).toBe('ACQUISITION_POLICY_TRANSITION_LEDGER_V2_GEN1');
    expect(record.thisIsNotTheReserveReplacementLedger).toMatchObject({
      reserveReplacementLedgerPath: RESERVE_REPLACEMENT_LEDGER_PATH,
      reserveReplacementLedgerExists: false,
      reserveConsumedByThisLedger: 0,
    });
    expect(TRANSITION_LEDGER_PATH).not.toBe(RESERVE_REPLACEMENT_LEDGER_PATH);
  });

  it('holds exactly one entry, for selection index 5, with no reserve consumed', () => {
    const record = ledger();
    expect(record.entryCount).toBe(1);
    expect(record.entries).toHaveLength(1);
    expect(record.entries[0]).toMatchObject({
      selectionIndex: TRANSITION_SELECTION_INDEX,
      split: TRANSITION_SPLIT,
      oldPolicyVersion: HISTORICAL_POLICY_VERSION,
      newPolicyVersion: FUTURE_POLICY_VERSION,
      transitionReason: TRANSITION_REASON,
      oldSd9Status: 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET',
      newSd9Status: 'ACQUISITION_SUCCESSFUL',
      historicalRunRetained: true,
      historicalRunClassification: SUPERSESSION_TOKEN,
      reserveConsumed: false,
      replacementCreated: false,
      organisationChanged: false,
      selectionIndexChanged: false,
      splitChanged: false,
    });
  });

  it('identifies both runs by opaque ref and publishes no organisation identity', () => {
    const entry = ledger().entries[0]!;
    expect(String(entry.oldRunOpaqueRef)).toMatch(/^[0-9a-f]{64}$/);
    expect(String(entry.newRunOpaqueRef)).toMatch(/^[0-9a-f]{64}$/);
    expect(entry.oldRunOpaqueRef).not.toBe(entry.newRunOpaqueRef);
    expect(Object.keys(entry)).not.toContain('echeRowKey');
    expect(Object.keys(entry)).not.toContain('organisationId');
  });
});

describe('2D Option-B transition: the public measurement record', () => {
  const record = () =>
    JSON.parse(read(MEASUREMENT_RECORD_PATH)) as {
      compatibilityCensus: {
        totalHistoricalV1RunsExamined: number;
        V1_COMPATIBLE_WITH_V2_TRANSITION: number;
        POLICY_TRANSITION_AFFECTED: number;
        perRun: { runOpaqueRef: string; classification: string }[];
      };
      formalSd7MeasurementOfRecord: Record<string, unknown>;
      diagnosticCrossCheck: Record<string, unknown>;
      acquisitionOfRecord: Record<string, unknown>;
      authorityHeld: Record<string, number | boolean>;
      prospectiveBatch02State: Record<string, unknown>;
      terminalState: string;
    };

  it('reports the seven-run census, exhaustively partitioned', () => {
    const census = record().compatibilityCensus;
    expect(census.totalHistoricalV1RunsExamined).toBe(HISTORICAL_V1_RUN_COUNT);
    expect(census.POLICY_TRANSITION_AFFECTED).toBe(1);
    expect(census.V1_COMPATIBLE_WITH_V2_TRANSITION).toBe(6);
    expect(census.V1_COMPATIBLE_WITH_V2_TRANSITION + census.POLICY_TRANSITION_AFFECTED).toBe(
      census.totalHistoricalV1RunsExamined,
    );
    expect(census.perRun).toHaveLength(HISTORICAL_V1_RUN_COUNT);
    for (const run of census.perRun) expect(run.runOpaqueRef).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reports the formal SD7 counts and the SD9 status the owner asked for', () => {
    expect(record().formalSd7MeasurementOfRecord).toMatchObject({
      selectionIndex: 5,
      split: 'DEV_TRAIN',
      acquisitionOfRecordPolicyVersion: 'orgunit-fetch-policy-v2',
      rawPageCount: 33,
      postSd7PageCount: 28,
      countIsExact: true,
      MIN_PAGES_PER_ORGANISATION: 4,
      sd9Status: 'ACQUISITION_SUCCESSFUL',
      noNewSd7AlgorithmWasWritten: true,
      exactDuplicatePassRanFirst: true,
      thisIsAMeasurementOfRecordNotADiagnostic: true,
    });
  });

  it('records that the formal count and the diagnostic agree, having computed the first', () => {
    expect(record().diagnosticCrossCheck).toMatchObject({
      diagnosticPostSd7CountReportedByTheRevalidation: 28,
      formalPostSd7Count: 28,
      theyAgree: true,
    });
  });

  it('supersedes the v1 run without deleting, editing or invalidating it', () => {
    expect(record().acquisitionOfRecord).toMatchObject({
      status: 'ACQUISITION_SUCCESSFUL',
      policyVersion: 'orgunit-fetch-policy-v2',
      historicalV1RunClassification: SUPERSESSION_TOKEN,
      historicalV1RunRetained: true,
      historicalV1RowRemainsImmutable: true,
      historicalV1RunIsNotDeleted: true,
      historicalV1RunIsNotMarkedErroneous: true,
      batch02ExecutionRecordIsNotEdited: true,
      selectionIndexRetained: true,
      splitRetained: true,
      organisationRetained: true,
      reserveConsumption: 0,
      replacementLedgerEntry: 'NONE',
    });
  });

  it('reports the prospective low-yield count as one, not two, and authorises nothing', () => {
    expect(record().prospectiveBatch02State).toMatchObject({
      completedBatch02SelectionSlots: 2,
      currentLowRawYieldCount: 1,
      lowYieldSlotIsSelectionIndex: 6,
      thisAuthorisesNoContinuation: true,
    });
  });

  it('held every authority it was not given', () => {
    expect(record().authorityHeld).toMatchObject({
      networkRequestsIssued: 0,
      dnsLookupsPerformed: 0,
      providerCallsMade: 0,
      databaseWrites: 0,
      reserveConsumption: 0,
      replacementsCreated: 0,
      setPMaterialised: false,
      setRMaterialised: false,
      labelsCreated: 0,
      goldCreated: 0,
      holdoutSemanticAccess: false,
      phase2EWork: false,
      productionFilesChanged: 0,
      migrationsChanged: 0,
      firewallFilesChanged: 0,
      planV1BytesChanged: 0,
      methodologyR3BytesChanged: 0,
    });
  });

  it('stops at the awaiting-continuation terminal state', () => {
    expect(record().terminalState).toBe(
      'PHASE_2B_OPTION_B_EVIDENCE_ADJUDICATED_AWAITING_BATCH_02_V2_CONTINUATION',
    );
  });
});
