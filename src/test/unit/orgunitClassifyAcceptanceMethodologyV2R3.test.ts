/**
 * PHASE 2B-2D ACCEPTANCE METHODOLOGY V2 - the R3 HARDENING, verified.
 *
 * R3 corrects exactly one defect in R2: the claim that an INADMISSIBLE study
 * "measured nothing about the candidate", and therefore that the frozen
 * candidate could always be re-run. An attempt can go INADMISSIBLE *after*
 * semantic execution has begun, and those attempts have measured the
 * candidate.
 *
 * These tests drive the rule as CODE - `attemptConsumption.ts` - rather than
 * string-matching the document, so the truth table, the monotonic budget and
 * the irreversible HOLDOUT retirement are executed. The document is then
 * checked to agree with the code, and every other R2 decision is asserted
 * byte-identical.
 *
 * ZERO PROVIDER, ZERO NETWORK, ZERO DATABASE, ZERO INFERENCE, ZERO GOLD,
 * ZERO HOLDOUT. Reads committed JSON and computes over booleans.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  adjudicateBlockedAttemptFromEvidence,
  BLOCKED_ATTEMPT_ADJUDICATION_DEFAULT,
  classifyAttempt,
  classifyRealisedDenominatorFailure,
  describeBlockedAttempt,
  DevConfirmBudget,
  discloseAttempt,
  FinalHoldoutState,
  inadmissibilityClass,
  mayRetrySameCandidate,
  resolveSemanticAttemptState,
  type AttemptDisposition,
  type DurableAttemptEvidence,
  type ResolvedAttemptDisposition,
  type SemanticAttemptState,
} from '../harness/phase2b2d2c/methodology/attemptConsumption.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const R3_PATH = 'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL_R3.json';
const R2_PATH = 'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL_R2.json';

type JsonObject = Readonly<Record<string, unknown>>;

const raw = readFileSync(resolve(ROOT, R3_PATH), 'utf8');
const r3 = JSON.parse(raw) as JsonObject;
const r2 = JSON.parse(readFileSync(resolve(ROOT, R2_PATH), 'utf8')) as JsonObject;

function at(path: string): unknown {
  let cursor: unknown = r3;
  for (const key of path.split('.')) {
    if (typeof cursor !== 'object' || cursor === null || !(key in cursor)) {
      throw new Error(`R3 path ${path} is missing at ${key}`);
    }
    cursor = (cursor as JsonObject)[key];
  }
  return cursor;
}
const obj = (path: string): JsonObject => at(path) as JsonObject;
const arr = (path: string): readonly JsonObject[] => at(path) as readonly JsonObject[];

/** Evidence shapes, named once so the tests read as scenarios. */
const EVIDENCE = {
  /** Nothing was ever set up. */
  nothingHappened: {
    preRequestRecordExists: false,
    semanticExecutionMarkerObserved: false,
    confirmedPreInferenceRefusal: false,
    recordedProviderRequests: 0,
  },
  /** Set up, then provably refused before the provider was constructed. */
  confirmedPreInferenceRefusal: {
    preRequestRecordExists: true,
    semanticExecutionMarkerObserved: false,
    confirmedPreInferenceRefusal: true,
    recordedProviderRequests: 0,
  },
  /** A request was issued and something came back. */
  executionObserved: {
    preRequestRecordExists: true,
    semanticExecutionMarkerObserved: true,
    confirmedPreInferenceRefusal: false,
    recordedProviderRequests: 12,
  },
  /** A request was recorded but the run died before any marker landed. */
  requestRecordedThenDied: {
    preRequestRecordExists: true,
    semanticExecutionMarkerObserved: false,
    confirmedPreInferenceRefusal: false,
    recordedProviderRequests: 1,
  },
  /** The durability gap: set up, not refused, no marker, no count. */
  durabilityGap: {
    preRequestRecordExists: true,
    semanticExecutionMarkerObserved: false,
    confirmedPreInferenceRefusal: false,
    recordedProviderRequests: 0,
  },
} satisfies Record<string, DurableAttemptEvidence>;

describe('R3 authorises nothing and reopens no approved decision', () => {
  it('is PROPOSED with an empty thisFileAuthorises and nothing pending', () => {
    expect(r3['status']).toBe('PROPOSED');
    expect(r3['thisFileAuthorises']).toEqual([]);
    expect(r3['PENDING_OWNER_DECISIONS']).toEqual([]);
    expect(obj('supersedes')['nothing']).toBe(true);
  });

  it('names R2 by its exact hash and byte length, and does not supersede it', () => {
    const revises = obj('revises');
    expect(revises['sha256']).toBe(
      '8e5a2ba268ea1a521148f2b15f116c743668b21be3930d9f967f87fc7b1810e3',
    );
    expect(revises['byteLength']).toBe(102269);
    expect(revises['r2AcceptedInSubstance']).toBe(true);
  });

  it('leaves the R2 bytes on disk exactly as R2 committed them', () => {
    const r2Raw = readFileSync(resolve(ROOT, R2_PATH), 'utf8');
    expect(Buffer.byteLength(r2Raw, 'utf8')).toBe(102269);
    expect(r2['version']).toBe('PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL_R2');
  });

  it('keeps D1-D6 APPROVED and does not reopen them', () => {
    const approved = obj('APPROVED_OWNER_DECISIONS');
    for (const id of ['D1', 'D2', 'D3', 'D4', 'D5', 'D6']) {
      expect(approved[id], id).toBe('APPROVED_OWNER_DECISION');
    }
    expect(obj('remainingOwnerActionDetail')['d1ThroughD6NotReopened']).toBe(true);
    expect(obj('exclusions')['noD1ThroughD6DecisionReopened']).toBe(true);
  });

  it('leaves exactly one remaining owner action', () => {
    expect(r3['remainingOwnerAction']).toBe('OWNER_FREEZE_APPROVAL_OF_EXACT_R3_BYTES');
    expect(obj('remainingOwnerActionDetail')['noMethodologyDecisionRemains']).toBe(true);
  });
});

describe('every R2 methodology decision is carried through byte-identically', () => {
  /** The sections that carry D1-D6 substance. None may move in R3. */
  const FROZEN_SECTIONS = [
    'sectionC_D2_certificationDesign',
    'sectionD_D3_corpusOption',
    'sectionE_samplingContract',
    'sectionF_prevalenceAndEnrichment',
    'sectionI_goldAndReviewContract',
    'sectionJ_splits',
    'sectionK_feasibilityPrecondition',
    'sectionN_phase2EEntryRule',
  ] as const;

  it.each(FROZEN_SECTIONS)('%s is unchanged from R2', (section) => {
    expect(JSON.stringify(r3[section])).toBe(JSON.stringify(r2[section]));
  });

  it('still carries exactly six semantic gates and seven structural preconditions', () => {
    expect(arr('sectionC_D2_certificationDesign.theSixGates')).toHaveLength(6);
    expect(arr('sectionA_terminology.sevenStructuralPreconditions')).toHaveLength(7);
    expect(
      obj('sectionO_attemptConsumption.structuralPreconditionsAreNotAllPreSemantic')[
        'preconditionCountUnchanged'
      ],
    ).toBe(7);
  });

  it('does not alter the stability design, only what its failure costs', () => {
    const subset = obj(
      'sectionL_replicationAndStability.theFrozenReplicationDesign.stabilitySubset',
    );
    expect(subset['size']).toBe(40);
    expect(subset['replicatesTotal']).toBe(3);
    const veto = obj('sectionL_replicationAndStability.instabilityVeto');
    expect(veto['ST1_MINIMUM_AGREEMENT']).toBe(0.9);
    expect(veto['ST3_MAXIMUM_RANGE']).toBe(0.1);
  });
});

describe('the SEMANTIC_ATTEMPT_STARTED boundary resolves from durable evidence', () => {
  it('is STARTED on positive execution evidence', () => {
    expect(resolveSemanticAttemptState(EVIDENCE.executionObserved)).toBe('STARTED');
    expect(resolveSemanticAttemptState(EVIDENCE.requestRecordedThenDied)).toBe('STARTED');
  });

  it('is NOT_STARTED only on a confirmed refusal or on nothing having happened', () => {
    expect(resolveSemanticAttemptState(EVIDENCE.confirmedPreInferenceRefusal)).toBe('NOT_STARTED');
    expect(resolveSemanticAttemptState(EVIDENCE.nothingHappened)).toBe('NOT_STARTED');
  });

  it('a pre-request record alone is NECESSARY but NOT SUFFICIENT', () => {
    // A call row / passing preflight with nothing else is NOT execution: the
    // row is written before the provider is invoked, and a pre-flight refusal
    // or a skipped repair leaves one behind having issued nothing.
    expect(resolveSemanticAttemptState(EVIDENCE.durabilityGap)).not.toBe('STARTED');
    expect(
      obj('sectionO_attemptConsumption.boundary.aCallRowIsNecessaryButNotSUFFICIENT')[
        'twoWaysAPreRequestRecordExistsWithZeroSemanticRequest'
      ],
    ).toHaveLength(2);
  });

  it('refuses to guess inside the durability gap', () => {
    expect(resolveSemanticAttemptState(EVIDENCE.durabilityGap)).toBe('AMBIGUOUS');
    const resolution = obj('sectionO_attemptConsumption.boundary.resolution');
    const states = resolution['states'] as readonly JsonObject[];
    const ambiguous = states.find((s) => s['state'] === 'AMBIGUOUS');
    expect(ambiguous?.['autoResolves']).toBe(false);
  });

  it('is monotonic: no evidence shape downgrades a STARTED attempt', () => {
    // Adding evidence can only move NOT_STARTED/AMBIGUOUS toward STARTED.
    const started = resolveSemanticAttemptState(EVIDENCE.executionObserved);
    const withMore = resolveSemanticAttemptState({
      ...EVIDENCE.executionObserved,
      recordedProviderRequests: 999,
    });
    expect(started).toBe('STARTED');
    expect(withMore).toBe('STARTED');
    expect(obj('sectionO_attemptConsumption.boundary')['canNeverReturnToFalse']).toBe(true);
  });

  it('is the already-frozen F0V Class C rule, not a new invention', () => {
    const notNew = obj('sectionO_attemptConsumption.boundary.notANewInvention');
    expect(notNew['existingRuleId']).toBe(
      'CLASS_C_PROVIDER_REQUEST_OR_SEMANTIC_EXECUTION_OBSERVED',
    );
    expect(notNew['existingRuleSource']).toBe(
      'docs/evaluation/PHASE_2B_2D2C_DEV_REPLICATION_STUDY_FREEZE_F0V_V1.json',
    );
  });

  it('records the measured incident that fixes where the boundary sits', () => {
    const incident = obj(
      'sectionO_attemptConsumption.boundary.theMeasuredReasonThisBoundaryIsNotPlacedEarlier',
    );
    expect(incident['classification']).toBe('MEASURED INCIDENT, not a hypothetical');
    expect(incident['whatHappened'] as string).toMatch(/providerConstructed false/);
    expect(incident['whatItCost'] as string).toMatch(/ten candidate slots/);
  });
});

describe('the four-cell consumption truth table', () => {
  it('ACCEPT => CONSUMED', () => {
    expect(classifyAttempt({ state: 'STARTED', outcome: 'ACCEPT' })).toBe('CONSUMED');
  });

  it('REJECT => CONSUMED', () => {
    expect(classifyAttempt({ state: 'STARTED', outcome: 'REJECT' })).toBe('CONSUMED');
  });

  it('pre-semantic INADMISSIBLE => NOT_CONSUMED', () => {
    const state = resolveSemanticAttemptState(EVIDENCE.confirmedPreInferenceRefusal);
    expect(classifyAttempt({ state, outcome: 'INADMISSIBLE' })).toBe('NOT_CONSUMED');
    expect(inadmissibilityClass(state)).toBe('PRE_SEMANTIC_INADMISSIBLE');
  });

  it('post-semantic INADMISSIBLE => CONSUMED', () => {
    const state = resolveSemanticAttemptState(EVIDENCE.executionObserved);
    expect(classifyAttempt({ state, outcome: 'INADMISSIBLE' })).toBe('CONSUMED');
    expect(inadmissibilityClass(state)).toBe('POST_SEMANTIC_INADMISSIBLE');
  });

  it('terminal failure after the first provider request => INADMISSIBLE + CONSUMED', () => {
    const state = resolveSemanticAttemptState(EVIDENCE.requestRecordedThenDied);
    expect(state).toBe('STARTED');
    expect(classifyAttempt({ state, outcome: 'INADMISSIBLE' })).toBe('CONSUMED');
  });

  it('ambiguous => BLOCKED, which is neither counted nor released', () => {
    const state = resolveSemanticAttemptState(EVIDENCE.durabilityGap);
    expect(classifyAttempt({ state, outcome: 'INADMISSIBLE' })).toBe('BLOCKED');
    const ambiguous = obj('sectionO_attemptConsumption.ambiguousAttempts');
    expect(ambiguous['countsTowardTheBudget']).toBe(false);
    expect(ambiguous['releasesTheCandidateForRetry']).toBe(false);
    expect(ambiguous['adjudicationDefault']).toBe('CONSUMED');
  });

  it('exactly one cell of the frozen table is NOT_CONSUMED', () => {
    const table = arr('sectionO_attemptConsumption.attemptOutcomeAndConsumption.theTable');
    expect(table).toHaveLength(4);
    expect(table.filter((row) => row['consumption'] === 'NOT_CONSUMED')).toHaveLength(1);
    // And the code agrees with the document, row by row.
    for (const row of table) {
      const state: SemanticAttemptState =
        row['semanticAttemptStarted'] === true ? 'STARTED' : 'NOT_STARTED';
      expect(
        classifyAttempt({ state, outcome: row['terminalOutcome'] as 'ACCEPT' }),
        JSON.stringify(row),
      ).toBe(row['consumption']);
    }
  });

  it('ACCEPT or REJECT without semantic execution is unreachable, not merely disallowed', () => {
    expect(() => classifyAttempt({ state: 'NOT_STARTED', outcome: 'ACCEPT' })).toThrow(
      /unreachable/,
    );
    expect(() => classifyAttempt({ state: 'NOT_STARTED', outcome: 'REJECT' })).toThrow(
      /unreachable/,
    );
  });
});

describe('retry is permitted only after PRE-semantic inadmissibility', () => {
  it('permits a byte-identical retry after a pre-semantic refusal with the defect repaired', () => {
    expect(
      mayRetrySameCandidate({
        disposition: 'NOT_CONSUMED',
        candidateHashUnchanged: true,
        preSemanticDefectRepaired: true,
      }),
    ).toBe(true);
  });

  it('forbids retry after POST-semantic inadmissibility', () => {
    const state = resolveSemanticAttemptState(EVIDENCE.executionObserved);
    const disposition = classifyAttempt({ state, outcome: 'INADMISSIBLE' });
    expect(disposition).toBe('CONSUMED');
    expect(
      mayRetrySameCandidate({
        disposition,
        candidateHashUnchanged: true,
        preSemanticDefectRepaired: true,
      }),
    ).toBe(false);
  });

  it('forbids retry after ACCEPT or REJECT', () => {
    for (const outcome of ['ACCEPT', 'REJECT'] as const) {
      const disposition = classifyAttempt({ state: 'STARTED', outcome });
      expect(
        mayRetrySameCandidate({
          disposition,
          candidateHashUnchanged: true,
          preSemanticDefectRepaired: true,
        }),
        outcome,
      ).toBe(false);
    }
  });

  it('forbids retry while an attempt is BLOCKED', () => {
    expect(
      mayRetrySameCandidate({
        disposition: 'BLOCKED',
        candidateHashUnchanged: true,
        preSemanticDefectRepaired: true,
      }),
    ).toBe(false);
  });

  it('forbids retry with changed candidate bytes - that is a new candidate, not a retry', () => {
    expect(
      mayRetrySameCandidate({
        disposition: 'NOT_CONSUMED',
        candidateHashUnchanged: false,
        preSemanticDefectRepaired: true,
      }),
    ).toBe(false);
  });

  it('forbids retry before the pre-semantic defect is repaired', () => {
    expect(
      mayRetrySameCandidate({
        disposition: 'NOT_CONSUMED',
        candidateHashUnchanged: true,
        preSemanticDefectRepaired: false,
      }),
    ).toBe(false);
  });
});

describe('a candidate-determined realised denominator always consumes the attempt', () => {
  it('classifies a G3 precision shortfall as INADMISSIBLE + CONSUMED', () => {
    const result = classifyRealisedDenominatorFailure({ denominatorIsCandidateDetermined: true });
    expect(result.outcome).toBe('INADMISSIBLE');
    expect(result.disposition).toBe('CONSUMED');
  });

  it('is frozen in the document as POST-SEMANTIC and never harness-only', () => {
    const cdd = obj('sectionO_attemptConsumption.candidateDeterminedDenominators');
    expect(cdd['alwaysConsumes']).toBe(true);
    expect(cdd['neverClassifiedAsHarnessOnly'] as string).toMatch(/NOT a harness-only failure/);
    const worked = cdd['theWorkedCase'] as JsonObject;
    expect(worked['gate']).toBe('G3 unitPagePrecision');
    expect(worked['outcome']).toBe('INADMISSIBLE');
    expect(worked['attempt']).toBe('CONSUMED');
    expect(worked['rerunAgainstTheSameDEV_CONFIRM']).toBe('FORBIDDEN');
  });

  it('closes the incentive to dodge precision by predicting UNIT_PAGE rarely', () => {
    const worked = obj('sectionO_attemptConsumption.candidateDeterminedDenominators.theWorkedCase');
    expect(worked['theIncentiveThisCloses'] as string).toMatch(/cost a slot every time/);
    // The retry door is shut in code, not only in prose.
    const { disposition } = classifyRealisedDenominatorFailure({
      denominatorIsCandidateDetermined: true,
    });
    expect(
      mayRetrySameCandidate({
        disposition,
        candidateHashUnchanged: true,
        preSemanticDefectRepaired: true,
      }),
    ).toBe(false);
  });
});

describe('the DEV_CONFIRM budget closes after three CONSUMED attempts', () => {
  it('closes on the third consumed attempt', () => {
    const budget = new DevConfirmBudget();
    budget.record('CONSUMED');
    budget.record('CONSUMED');
    expect(budget.closed).toBe(false);
    budget.record('CONSUMED');
    expect(budget.closed).toBe(true);
    expect(budget.consumedAttemptCount).toBe(3);
    expect(budget.state).toBe('METHODOLOGY_GENERATION_CLOSED');
  });

  it('refuses a fourth consumed attempt', () => {
    const budget = new DevConfirmBudget();
    budget.record('CONSUMED');
    budget.record('CONSUMED');
    budget.record('CONSUMED');
    expect(() => budget.record('CONSUMED')).toThrow(/METHODOLOGY_GENERATION_CLOSED/);
  });

  it('never increments on pre-semantic inadmissibility, however often it happens', () => {
    const budget = new DevConfirmBudget();
    const state = resolveSemanticAttemptState(EVIDENCE.confirmedPreInferenceRefusal);
    for (let i = 0; i < 50; i += 1) {
      budget.record(classifyAttempt({ state, outcome: 'INADMISSIBLE' }));
    }
    expect(budget.consumedAttemptCount).toBe(0);
    expect(budget.closed).toBe(false);
  });

  it('never increments on a BLOCKED attempt until it is adjudicated', () => {
    const budget = new DevConfirmBudget();
    budget.record('BLOCKED');
    expect(budget.consumedAttemptCount).toBe(0);
    expect(budget.blockedAttemptCount).toBe(1);
    expect(budget.closed).toBe(false);
  });

  it('counts a post-semantic inadmissible attempt exactly as an ACCEPT', () => {
    const viaInadmissible = new DevConfirmBudget();
    const viaAccept = new DevConfirmBudget();
    const started = resolveSemanticAttemptState(EVIDENCE.executionObserved);
    viaInadmissible.record(classifyAttempt({ state: started, outcome: 'INADMISSIBLE' }));
    viaAccept.record(classifyAttempt({ state: started, outcome: 'ACCEPT' }));
    expect(viaInadmissible.consumedAttemptCount).toBe(viaAccept.consumedAttemptCount);
  });

  it('is frozen in the document at three consumed attempts', () => {
    const budget = obj('sectionO_attemptConsumption.devConfirmBudget');
    expect(budget['maxConsumedAttemptsPerMethodologyGeneration']).toBe(3);
    expect(budget['whatCountsAgainstTheThree']).toMatch(/CONSUMED attempts only/);
    expect(budget['onReachingThree']).toBe('METHODOLOGY_GENERATION_CLOSED');
    expect((budget['theCounter'] as JsonObject)['neverDecremented']).toBe(true);
  });
});

describe('FINAL_HOLDOUT retires on the first semantic attempt, and only then', () => {
  it('is NOT retired by a pre-semantic inadmissible attempt', () => {
    const holdout = new FinalHoldoutState();
    const state = resolveSemanticAttemptState(EVIDENCE.confirmedPreInferenceRefusal);
    expect(holdout.record({ state, outcome: 'INADMISSIBLE' })).toBe('NOT_CONSUMED');
    expect(holdout.retired).toBe(false);
  });

  it('survives repeated pre-semantic refusals', () => {
    const holdout = new FinalHoldoutState();
    const state = resolveSemanticAttemptState(EVIDENCE.confirmedPreInferenceRefusal);
    for (let i = 0; i < 10; i += 1) {
      holdout.record({ state, outcome: 'INADMISSIBLE' });
    }
    expect(holdout.retired).toBe(false);
  });

  it.each(['ACCEPT', 'REJECT', 'INADMISSIBLE'] as const)(
    'retires irrevocably once a semantic attempt closes as %s',
    (outcome) => {
      const holdout = new FinalHoldoutState();
      expect(holdout.record({ state: 'STARTED', outcome })).toBe('CONSUMED');
      expect(holdout.retired).toBe(true);
    },
  );

  it('has no post-semantic rerun path at all', () => {
    const holdout = new FinalHoldoutState();
    holdout.record({ state: 'STARTED', outcome: 'INADMISSIBLE' });
    // Every conceivable second attempt throws - there is no argument that reopens it.
    for (const outcome of ['ACCEPT', 'REJECT', 'INADMISSIBLE'] as const) {
      expect(() => holdout.record({ state: 'STARTED', outcome }), outcome).toThrow(/RETIRED/);
      expect(() => holdout.record({ state: 'NOT_STARTED', outcome: 'INADMISSIBLE' })).toThrow(
        /RETIRED/,
      );
    }
  });

  it('is frozen in the document as one consumed attempt, retired on every outcome', () => {
    const retirement = obj('sectionO_attemptConsumption.finalHoldoutRetirement');
    expect(retirement['maxConsumedAttempts']).toBe(1);
    expect((retirement['beforeTheBoundary'] as JsonObject)['holdoutRetired']).toBe(false);
    expect((retirement['atTheBoundary'] as JsonObject)['holdoutRetired']).toBe(true);
    expect((retirement['atTheBoundary'] as JsonObject)['trueForEveryTerminalOutcome']).toEqual([
      'ACCEPT',
      'REJECT',
      'INADMISSIBLE',
    ]);
    const forbidden = (retirement['thereforeForbidden'] as readonly string[]).join(' | ');
    expect(forbidden).toMatch(/no second semantic attempt/);
    expect(forbidden).toMatch(/no rerun after a provider or runtime terminal failure/);
    expect(forbidden).toMatch(/no rerun after realised-denominator infeasibility/);
  });

  it('records that a post-semantic inadmissible HOLDOUT is not a semantic failure', () => {
    const meaning = obj(
      'sectionO_attemptConsumption.finalHoldoutRetirement.aPostSemanticInadmissibleHoldoutMeans',
    );
    expect(meaning['means']).toEqual(['NO VALID HOLDOUT CONCLUSION', 'THE HOLDOUT IS RETIRED']);
    expect(meaning['doesNotMean']).toMatch(/failed semantically/);
    expect(meaning['andItIsNotAPassEither'] as string).toMatch(/not a pass/);
  });
});

describe('the stability execution is governed by the same boundary', () => {
  it('consumes the attempt when a replicate dies, because the main pass had already started', () => {
    const stability = obj('sectionO_attemptConsumption.stabilityExecution');
    expect(stability['consumption'] as string).toMatch(/^CONSUMED/);
    expect(stability['orderingNote'] as string).toMatch(/no reachable state/);
    const actions = (stability['onAStabilityReplicateTerminalFailure'] as readonly string[]).join(
      ' | ',
    );
    expect(actions).toMatch(/do NOT re-run/);
    expect(actions).toMatch(/do NOT replace/);
  });

  it('does not resurrect N = 5 replacement logic', () => {
    const stability = obj('sectionO_attemptConsumption.stabilityExecution');
    expect(stability['doesNotResurrectNFiveReplacementLogic'] as string).toMatch(
      /Nothing here permits/,
    );
    const never = obj('sectionL_replicationAndStability.stabilityMetrics')[
      'whatIsNeverDone'
    ] as readonly string[];
    expect(never.join(' | ')).toMatch(/never refunds the candidate attempt/);
    expect(
      obj('sectionL_replicationAndStability.fullNFiveReplication')['carriedIntoMethodologyV2'],
    ).toBe(false);
  });
});

describe('the disclosure surface adds two procedural tokens and nothing else', () => {
  it('permits exactly the five R2 categories plus the two approved tokens', () => {
    const permitted = at(
      'sectionG_devConfirmInformationBoundary.permittedAfterEachCandidateDEV_CONFIRMEvaluation',
    ) as readonly string[];
    expect(permitted).toEqual([
      'pass/fail per frozen gate',
      'aggregate numerator/denominator',
      'aggregate confidence bounds',
      'stability-subset aggregate statistics',
      'structural veto status',
      'the terminal outcome token: ACCEPT / REJECT / INADMISSIBLE',
      'the attempt consumption state: CONSUMED / NOT_CONSUMED',
    ]);
    expect(obj('sectionG_devConfirmInformationBoundary')['permittedListIsExhaustive']).toBe(true);
  });

  it('has no outstanding proposed addition, because the R2 one was approved', () => {
    expect(
      at('sectionG_devConfirmInformationBoundary.additionsRequiringOwnerConfirmationAtFreeze'),
    ).toEqual([]);
    expect(
      obj('sectionG_devConfirmInformationBoundary.theR2AdditionWasApproved')['ownerDecision'],
    ).toMatch(/APPROVED/);
  });

  it('drops every sealed item detail by construction, not by convention', () => {
    const disclosed = discloseAttempt({
      terminalOutcome: 'INADMISSIBLE',
      consumption: 'CONSUMED',
      coarseStructuralReason: 'G3_REALISED_DENOMINATOR_BELOW_MINIMUM',
      sealedItemId: 'an-item-id-that-must-never-escape',
      failingOrganisation: 'an-organisation-that-must-never-escape',
      realisedDenominator: 41,
    });
    expect(Object.keys(disclosed).sort()).toEqual(['consumption', 'terminalOutcome']);
    const serialised = JSON.stringify(disclosed);
    expect(serialised).not.toMatch(/an-item-id/);
    expect(serialised).not.toMatch(/an-organisation/);
    expect(serialised).not.toMatch(/G3_REALISED/);
    expect(serialised).not.toMatch(/41/);
  });

  it('still forbids every item-level disclosure the owner enumerated', () => {
    const forbidden = at(
      'sectionO_attemptConsumption.disclosureSurface.mayNotReceive',
    ) as readonly string[];
    expect(forbidden).toEqual([
      'which item caused inadmissibility',
      'which organisation',
      'which evaluation',
      'partial candidate outputs',
      'per-item denominators',
      'item-level failure reason',
    ]);
  });

  it('withholds a coarse structural reason by default when it could leak', () => {
    const coarse = obj('sectionO_attemptConsumption.disclosureSurface.coarseStructuralReason');
    expect(coarse['retainedInternally']).toBe(true);
    expect(coarse['defaultIsWithhold']).toBe(true);
    expect(coarse['workedExample'] as string).toMatch(/withheld from prompt development/);
  });
});

describe('the structural preconditions are not all pre-semantic', () => {
  it('classifies each of S1-S7 without changing the count or the rules', () => {
    const preconditions = arr('sectionA_terminology.sevenStructuralPreconditions');
    expect(preconditions).toHaveLength(7);
    const byId = Object.fromEntries(preconditions.map((p) => [p['id'], p]));
    expect(byId['S1']?.['evaluability']).toBe('POST_SEMANTIC');
    expect(byId['S2']?.['evaluability']).toBe('PRE_SEMANTIC');
    expect(byId['S3']?.['evaluability']).toBe('BOTH');
    expect(byId['S4']?.['evaluability']).toBe('POST_SEMANTIC');
    // The rule text of every precondition is untouched from R2.
    const r2Preconditions = (r2['sectionA_terminology'] as JsonObject)[
      'sevenStructuralPreconditions'
    ] as readonly JsonObject[];
    for (const [index, precondition] of preconditions.entries()) {
      expect(precondition['rule'], precondition['id'] as string).toBe(
        r2Preconditions[index]?.['rule'],
      );
      expect(precondition['name']).toBe(r2Preconditions[index]?.['name']);
    }
  });

  it('withdraws the R2 claim that all of S1-S7 are harness-and-corpus properties', () => {
    const corrected = obj(
      'sectionO_attemptConsumption.structuralPreconditionsAreNotAllPreSemantic',
    );
    expect(corrected['theR2WordingThatWasTooStrong'] as string).toMatch(/is FALSE/);
    expect(corrected['noPreconditionAddedOrRemoved']).toBe(true);
    const distinction = (corrected['theAccurateDistinction'] as readonly string[]).join(' | ');
    expect(distinction).toMatch(/ADMISSIBILITY IS DISTINCT FROM SEMANTIC QUALITY/);
    expect(distinction).toMatch(/POST-SEMANTIC inadmissibility STILL CONSUMES the attempt/);
  });

  it('keys consumption on execution rather than on which precondition failed', () => {
    const corrected = obj(
      'sectionO_attemptConsumption.structuralPreconditionsAreNotAllPreSemantic',
    );
    expect(
      corrected['whyTheBoundaryIsKeyedOnExecutionNotOnPreconditionIdentity'] as string,
    ).toMatch(/the same cost every time/);
  });

  it("withdraws R2's blanket refund claim in the budget section itself", () => {
    const budget = obj('sectionG_devConfirmInformationBoundary.budget');
    expect(budget['inadmissibleDoesNotConsumeASlot'] as string).toMatch(
      /WITHDRAWN AS A GENERAL STATEMENT/,
    );
    expect(budget['inadmissibleDoesNotConsumeASlot'] as string).toMatch(
      /PRE_SEMANTIC_INADMISSIBLE/,
    );
    const stage0 = arr('sectionM_acceptanceRuleShape.stages')[0] as JsonObject;
    expect(stage0['note'] as string).toMatch(/does NOT follow that nothing was MEASURED/);
    expect(stage0['admissibilityIsDistinctFromSemanticQuality']).toBe(true);
  });
});

describe('the R3 helper is pure and unreachable from production', () => {
  it('imports nothing at all', () => {
    const source = readFileSync(
      resolve(ROOT, 'src/test/harness/phase2b2d2c/methodology/attemptConsumption.ts'),
      'utf8',
    );
    const imports = source
      .split('\n')
      .filter((line) => /^\s*import\s/.test(line) || /\brequire\(/.test(line));
    expect(imports).toEqual([]);
  });

  it('lives outside the src/orgunits/ production namespace', () => {
    const modules = at('machineVerifiableSupport.modules') as readonly JsonObject[];
    for (const module of modules) {
      expect(
        (module['module'] as string).startsWith('src/orgunits/'),
        module['module'] as string,
      ).toBe(false);
    }
    expect(modules.map((m) => m['module'])).toContain(
      'src/test/harness/phase2b2d2c/methodology/attemptConsumption.ts',
    );
  });
});

/**
 * R3 SUPPORT CORRECTION - BLOCKED is STICKY.
 *
 * The methodology already said an AMBIGUOUS attempt is "neither counted
 * against the three-attempt budget nor released for retry". The first
 * implementation expressed only the first half: `record()` returned `BLOCKED`
 * and incremented nothing, but left the machine willing to accept another
 * attempt - which releases the candidate for retry by omission, the automatic
 * refund R3 exists to refuse. These tests drive the STATE MACHINE, not one
 * cell of the truth table. The R3 document bytes are unchanged.
 */
describe('a BLOCKED DEV_CONFIRM attempt halts the generation until it is adjudicated', () => {
  /** Reach a blocked budget the way the methodology actually would. */
  function blockedBudget(): DevConfirmBudget {
    const budget = new DevConfirmBudget();
    const state = resolveSemanticAttemptState(EVIDENCE.durabilityGap);
    expect(state).toBe('AMBIGUOUS');
    budget.record(classifyAttempt({ state, outcome: 'INADMISSIBLE' }));
    return budget;
  }

  it('marks the attempt unresolved rather than merely returning a label', () => {
    const budget = blockedBudget();
    expect(budget.hasUnresolvedBlockedAttempt).toBe(true);
    expect(budget.mayBeginNextAttempt).toBe(false);
    expect(budget.blockedAttemptCount).toBe(1);
  });

  it('refuses a retry of the SAME candidate while blocked', () => {
    const budget = blockedBudget();
    expect(
      mayRetrySameCandidate({
        disposition: 'BLOCKED',
        candidateHashUnchanged: true,
        preSemanticDefectRepaired: true,
      }),
    ).toBe(false);
    expect(() => budget.record('NOT_CONSUMED')).toThrow(/DEV_CONFIRM_BLOCKED/);
  });

  it('refuses a DIFFERENT candidate while blocked', () => {
    const budget = blockedBudget();
    for (const disposition of ['CONSUMED', 'NOT_CONSUMED', 'BLOCKED'] as const) {
      expect(() => budget.record(disposition), disposition).toThrow(/DEV_CONFIRM_BLOCKED/);
    }
  });

  it('counts nothing against the three before adjudication', () => {
    const budget = blockedBudget();
    expect(budget.consumedAttemptCount).toBe(0);
    expect(budget.closed).toBe(false);
    expect(budget.state).toBe('OPEN');
  });

  it('increments exactly once when adjudicated CONSUMED', () => {
    const budget = blockedBudget();
    budget.adjudicateBlockedAttempt('CONSUMED');
    expect(budget.consumedAttemptCount).toBe(1);
    expect(budget.hasUnresolvedBlockedAttempt).toBe(false);
    expect(budget.mayBeginNextAttempt).toBe(true);
  });

  it('increments nothing when adjudicated NOT_CONSUMED, and releases the block', () => {
    const budget = blockedBudget();
    budget.adjudicateBlockedAttempt('NOT_CONSUMED');
    expect(budget.consumedAttemptCount).toBe(0);
    expect(budget.hasUnresolvedBlockedAttempt).toBe(false);
    expect(budget.mayBeginNextAttempt).toBe(true);
  });

  it('refuses a second adjudication of the same blocked attempt', () => {
    const budget = blockedBudget();
    budget.adjudicateBlockedAttempt('CONSUMED');
    expect(() => budget.adjudicateBlockedAttempt('CONSUMED')).toThrow(
      /NO_UNRESOLVED_BLOCKED_ATTEMPT/,
    );
    expect(() => budget.adjudicateBlockedAttempt('NOT_CONSUMED')).toThrow(
      /NO_UNRESOLVED_BLOCKED_ATTEMPT/,
    );
    expect(budget.consumedAttemptCount).toBe(1);
  });

  it('refuses an adjudication when no attempt is blocked at all', () => {
    const budget = new DevConfirmBudget();
    expect(() => budget.adjudicateBlockedAttempt('CONSUMED')).toThrow(
      /NO_UNRESOLVED_BLOCKED_ATTEMPT/,
    );
  });

  it('closes the generation at exactly three consumed attempts, blocks included', () => {
    const budget = new DevConfirmBudget();
    budget.record('CONSUMED');
    budget.record('CONSUMED');
    budget.record('BLOCKED');
    expect(budget.closed).toBe(false);
    budget.adjudicateBlockedAttempt('CONSUMED');
    expect(budget.consumedAttemptCount).toBe(3);
    expect(budget.closed).toBe(true);
    expect(budget.state).toBe('METHODOLOGY_GENERATION_CLOSED');
    expect(budget.mayBeginNextAttempt).toBe(false);
    expect(() => budget.record('CONSUMED')).toThrow(/METHODOLOGY_GENERATION_CLOSED/);
  });

  it('does not close the generation when the third block is adjudicated NOT_CONSUMED', () => {
    const budget = new DevConfirmBudget();
    budget.record('CONSUMED');
    budget.record('CONSUMED');
    budget.record('BLOCKED');
    budget.adjudicateBlockedAttempt('NOT_CONSUMED');
    expect(budget.consumedAttemptCount).toBe(2);
    expect(budget.closed).toBe(false);
  });

  it('defaults an unresolvable adjudication toward CONSUMED', () => {
    expect(BLOCKED_ATTEMPT_ADJUDICATION_DEFAULT).toBe('CONSUMED');
    // Still silent: the same durability gap, no better evidence than before.
    expect(adjudicateBlockedAttemptFromEvidence(EVIDENCE.durabilityGap)).toBe('CONSUMED');
    // Later evidence that a request DID go out.
    expect(adjudicateBlockedAttemptFromEvidence(EVIDENCE.executionObserved)).toBe('CONSUMED');
    expect(adjudicateBlockedAttemptFromEvidence(EVIDENCE.requestRecordedThenDied)).toBe('CONSUMED');
  });

  it('resolves NOT_CONSUMED only on a positively established pre-inference refusal', () => {
    expect(adjudicateBlockedAttemptFromEvidence(EVIDENCE.confirmedPreInferenceRefusal)).toBe(
      'NOT_CONSUMED',
    );
    expect(adjudicateBlockedAttemptFromEvidence(EVIDENCE.nothingHappened)).toBe('NOT_CONSUMED');
    // Absence of positive request evidence is NOT the same finding, and must
    // not be read as one: the durability gap still defaults to CONSUMED.
    const absenceOnly: DurableAttemptEvidence = {
      ...EVIDENCE.durabilityGap,
      confirmedPreInferenceRefusal: false,
    };
    expect(adjudicateBlockedAttemptFromEvidence(absenceOnly)).toBe('CONSUMED');
  });

  it('agrees with the frozen R3 text, which is unchanged', () => {
    const ambiguous = obj('sectionO_attemptConsumption.ambiguousAttempts');
    expect(ambiguous['countsTowardTheBudget']).toBe(false);
    expect(ambiguous['releasesTheCandidateForRetry']).toBe(false);
    expect(ambiguous['blocksFurtherAttemptsAgainstThatSplit']).toBe(true);
    expect(ambiguous['adjudicationDefault']).toBe(BLOCKED_ATTEMPT_ADJUDICATION_DEFAULT);
  });
});

describe('a BLOCKED FINAL_HOLDOUT is neither spent nor available', () => {
  function blockedHoldout(): FinalHoldoutState {
    const holdout = new FinalHoldoutState();
    const state = resolveSemanticAttemptState(EVIDENCE.durabilityGap);
    expect(holdout.record({ state, outcome: 'INADMISSIBLE' })).toBe('BLOCKED');
    return holdout;
  }

  it('starts AVAILABLE and becomes BLOCKED on an ambiguous attempt', () => {
    const holdout = new FinalHoldoutState();
    expect(holdout.availability).toBe('AVAILABLE');
    const blocked = blockedHoldout();
    expect(blocked.availability).toBe('BLOCKED');
    expect(blocked.hasUnresolvedBlockedAttempt).toBe(true);
  });

  it('does not silently become AVAILABLE, and is not labelled RETIRED either', () => {
    const holdout = blockedHoldout();
    expect(holdout.available).toBe(false);
    expect(holdout.retired).toBe(false);
  });

  it('refuses every further semantic attempt while blocked', () => {
    const holdout = blockedHoldout();
    for (const state of ['STARTED', 'NOT_STARTED', 'AMBIGUOUS'] as const) {
      for (const outcome of ['ACCEPT', 'REJECT', 'INADMISSIBLE'] as const) {
        expect(() => holdout.record({ state, outcome }), `${state}/${outcome}`).toThrow(
          /FINAL_HOLDOUT is BLOCKED/,
        );
      }
    }
    expect(holdout.availability).toBe('BLOCKED');
  });

  it('retires irreversibly when adjudicated CONSUMED', () => {
    const holdout = blockedHoldout();
    expect(holdout.adjudicateBlockedAttempt('CONSUMED')).toBe('RETIRED');
    expect(holdout.retired).toBe(true);
    expect(() => holdout.record({ state: 'NOT_STARTED', outcome: 'INADMISSIBLE' })).toThrow(
      /RETIRED/,
    );
    expect(() => holdout.adjudicateBlockedAttempt('NOT_CONSUMED')).toThrow(
      /NO_UNRESOLVED_BLOCKED_ATTEMPT/,
    );
    expect(holdout.retired).toBe(true);
  });

  it('returns to AVAILABLE when adjudicated NOT_CONSUMED, for the same candidate only', () => {
    const holdout = blockedHoldout();
    expect(holdout.adjudicateBlockedAttempt('NOT_CONSUMED')).toBe('AVAILABLE');
    expect(holdout.available).toBe(true);
    expect(holdout.retired).toBe(false);
    // The retry right is the ordinary one: byte-identical candidate, repaired
    // pre-semantic defect. Nothing about adjudication widens it.
    expect(
      mayRetrySameCandidate({
        disposition: 'NOT_CONSUMED',
        candidateHashUnchanged: false,
        preSemanticDefectRepaired: true,
      }),
    ).toBe(false);
    expect(
      mayRetrySameCandidate({
        disposition: 'NOT_CONSUMED',
        candidateHashUnchanged: true,
        preSemanticDefectRepaired: true,
      }),
    ).toBe(true);
    // And the holdout still retires on that retry if it crosses the boundary.
    expect(holdout.record({ state: 'STARTED', outcome: 'ACCEPT' })).toBe('CONSUMED');
    expect(holdout.retired).toBe(true);
  });

  it('refuses an adjudication when nothing is blocked', () => {
    const holdout = new FinalHoldoutState();
    expect(() => holdout.adjudicateBlockedAttempt('CONSUMED')).toThrow(
      /NO_UNRESOLVED_BLOCKED_ATTEMPT/,
    );
  });

  it('has no direct BLOCKED -> new semantic attempt transition', () => {
    const holdout = blockedHoldout();
    // The ONLY methods that change state are record() - which throws while
    // blocked - and adjudicateBlockedAttempt(), which yields RETIRED or
    // AVAILABLE and never a semantic attempt of its own.
    expect(holdout.adjudicateBlockedAttempt('NOT_CONSUMED')).toBe('AVAILABLE');
    const names = Object.getOwnPropertyNames(FinalHoldoutState.prototype).sort();
    expect(names).toEqual([
      'adjudicateBlockedAttempt',
      'availability',
      'available',
      'constructor',
      'hasUnresolvedBlockedAttempt',
      'record',
      'retired',
    ]);
  });
});

describe('blocked state never reaches the prompt-development terminal surface', () => {
  it('refuses a BLOCKED terminal disclosure outright', () => {
    for (const outcome of ['ACCEPT', 'REJECT', 'INADMISSIBLE'] as const) {
      expect(
        () =>
          discloseAttempt({
            terminalOutcome: outcome,
            // A caller reaching past the type - the only way this is possible.
            consumption: 'BLOCKED' as unknown as ResolvedAttemptDisposition,
          }),
        outcome,
      ).toThrow(/BLOCKED is not a terminal disclosure/);
    }
  });

  it('offers no terminal outcome for an ambiguous attempt at all', () => {
    const state = resolveSemanticAttemptState(EVIDENCE.durabilityGap);
    const disposition: AttemptDisposition = classifyAttempt({ state, outcome: 'INADMISSIBLE' });
    expect(disposition).toBe('BLOCKED');
    expect(inadmissibilityClass(state)).toBe('UNRESOLVED');
  });

  it('keeps the two resolved tokens working exactly as before', () => {
    expect(discloseAttempt({ terminalOutcome: 'REJECT', consumption: 'CONSUMED' })).toEqual({
      terminalOutcome: 'REJECT',
      consumption: 'CONSUMED',
    });
    expect(
      discloseAttempt({ terminalOutcome: 'INADMISSIBLE', consumption: 'NOT_CONSUMED' }),
    ).toEqual({ terminalOutcome: 'INADMISSIBLE', consumption: 'NOT_CONSUMED' });
  });

  it('exposes owner/audit blocked state that leaks no sealed detail', () => {
    const audit = describeBlockedAttempt({
      coarseStructuralReason: 'G3_REALISED_DENOMINATOR_BELOW_MINIMUM',
      sealedItemId: 'an-item-id-that-must-never-escape',
      failingOrganisation: 'an-organisation-that-must-never-escape',
      realisedDenominator: 41,
    });
    expect(Object.keys(audit).sort()).toEqual([
      'adjudicationDefault',
      'attemptState',
      'awaitingOwnerAdjudication',
      'countedAgainstBudget',
      'releasedForRetry',
    ]);
    const serialised = JSON.stringify(audit);
    expect(serialised).not.toMatch(/an-item-id/);
    expect(serialised).not.toMatch(/an-organisation/);
    expect(serialised).not.toMatch(/G3_REALISED/);
    expect(serialised).not.toMatch(/41/);
    expect(audit.countedAgainstBudget).toBe(false);
    expect(audit.releasedForRetry).toBe(false);
    expect(audit.adjudicationDefault).toBe('CONSUMED');
  });
});
