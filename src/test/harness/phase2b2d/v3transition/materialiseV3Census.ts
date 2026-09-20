/**
 * THE OPTION-C-LITE OFFLINE STEP, MATERIALISED.
 *
 * READ-ONLY AGAINST THE DATABASE, AND ENTIRELY OFFLINE.
 *
 *   Every statement it issues is a `SELECT`, and it issues them through
 *   `readTransitionEvidence.ts` - the reader the Option-B step already used,
 *   connecting as the `readonly` role, which holds SELECT and NO WRITE GRANT
 *   ANYWHERE in the schema. Reusing that module rather than writing a second
 *   one is deliberate: two readers of the same evidence would be two places a
 *   mutating statement could later appear.
 *
 *   There is no socket module anywhere in this graph. `pg` speaks to a
 *   loopback container; nothing here resolves or contacts an institution.
 *
 * WHAT IT WRITES
 *
 *   Two JSON artifacts under `docs/evaluation/`, and nothing else. It creates
 *   no sealed detail file, because it derives no per-organisation value that
 *   would need sealing - its outputs are aggregate counts and selection
 *   indices that the batch execution records already publish.
 *
 * IDENTITY DISCIPLINE
 *
 *   A run is published as an OPAQUE REF - SHA-256 of its UUID, the same
 *   derivation the Option-B transition ledger uses - never as a UUID, an
 *   `eche_row_key`, an organisation id, a hostname or a URL. Selection
 *   indices ARE published, because the batch execution records, ADR 0012 and
 *   the transition ledger already publish them and they name no institution
 *   by themselves. The `eche_row_key` -> selection index join happens in
 *   memory and its left-hand side never reaches an output.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { format, resolveConfig } from 'prettier';
import { readRedirects, readRuns, readTableCounts } from '../transition/readTransitionEvidence.js';
import type { PersistedRun } from '../transition/compatibilityCensus.js';
import { censusOfPersistedRuns, type V3CensusResult } from './v3Census.js';
import {
  ADR_0013_PATH,
  DRAW_ARTIFACT_PATH,
  EXPECTED_PRODUCTION_POLICY_VERSION,
  FINALISED_SELECTION_INDICES,
  IMMUTABLE_INPUT_PATHS,
  IMPLEMENTATION_RECORD_PATH,
  METHODOLOGY_R3_PATH,
  NEVER_STARTED_SELECTION_INDICES,
  NEXT_OWNER_DECISION,
  OPTION_C_LITE_COMPLETE,
  OPTION_C_LITE_OWNER_DECISIONS,
  OptionCLiteStop,
  PLAN_AMENDMENT_V2_PATH,
  PRIOR_AMENDMENT_PATH,
  PRIOR_PLAN_PATH,
  PRODUCTION_POLICY_VERSION,
  REQUIRED_TABLE_COUNTS,
  TRANSITION_LEDGER_PATH,
  TRANSITION_REASON,
} from './v3Contract.js';

const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');

/** The exact bytes committed, laid out by this repository's own Prettier. */
async function renderRecord(path: string, record: unknown): Promise<string> {
  const options = await resolveConfig(path);
  return format(JSON.stringify(record, null, 2), { ...options, filepath: path, parser: 'json' });
}

/** The ledger's own derivation, restated here because it is what makes the refs comparable. */
const opaqueRefOf = (runId: string): string => sha256(runId);

interface FileIdentity {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

function identify(repoRoot: string, path: string): FileIdentity {
  const bytes = readFileSync(join(repoRoot, path));
  return { path, sha256: sha256(bytes), bytes: bytes.length };
}

/** `eche_row_key` -> selection index, read from the frozen draw. Never emitted. */
function selectionIndexByEcheRowKey(repoRoot: string): ReadonlyMap<string, number> {
  const draw = JSON.parse(readFileSync(join(repoRoot, DRAW_ARTIFACT_PATH), 'utf8')) as {
    selection: { selectionIndex: number; echeRowKey: string }[];
  };
  return new Map(draw.selection.map((row) => [row.echeRowKey, row.selectionIndex]));
}

/** Which run ids the transition ledger has already superseded. */
function supersededRunRefs(repoRoot: string): ReadonlySet<string> {
  const ledger = JSON.parse(readFileSync(join(repoRoot, TRANSITION_LEDGER_PATH), 'utf8')) as {
    entries: { oldRunOpaqueRef: string }[];
  };
  return new Set(ledger.entries.map((entry) => entry.oldRunOpaqueRef));
}

/** One run's selection index, reached by join rather than by assumption. */
async function selectionIndexByRun(
  pool: pg.Pool,
  indexByKey: ReadonlyMap<string, number>,
): Promise<ReadonlyMap<string, number>> {
  const { rows } = await pool.query<{ run_id: string; keys: string[] }>(
    `SELECT run_id, array_agg(DISTINCT eche_row_key) AS keys
       FROM orgunit_fetch_observations
      GROUP BY run_id`,
  );
  const byRun = new Map<string, number>();
  for (const row of rows) {
    if (row.keys.length !== 1) {
      throw new OptionCLiteStop(
        `STOP: a run spans ${row.keys.length} organisations. One acquisition run is one ` +
          'organisation, and a run that is not cannot be given a selection index.',
      );
    }
    const index = indexByKey.get(row.keys[0]!);
    if (index === undefined) {
      throw new OptionCLiteStop(
        'STOP: a persisted run names an organisation that is not in the frozen draw. ' +
          'Classifying it would mean classifying something outside the selection.',
      );
    }
    byRun.set(row.run_id, index);
  }
  return byRun;
}

export interface MaterialiseOptions {
  readonly write: boolean;
}

export interface MaterialiseOutcome {
  readonly census: V3CensusResult;
  /** Indices whose ACQUISITION OF RECORD is affected. The headline number. */
  readonly affectedSelectionIndices: readonly number[];
  /**
   * Indices with ANY affected run, including a run the transition ledger has
   * already superseded. Reported separately and never as the headline: index
   * 5's superseded v1 run is affected, while its acquisition of record - the
   * v2 run that replaced it - is not, and collapsing the two would say that
   * an already-repaired organisation still needs repairing.
   */
  readonly affectedSelectionIndicesIncludingSupersededRuns: readonly number[];
  readonly databaseUnchanged: boolean;
  readonly immutableInputsUnchanged: boolean;
  readonly implementationRecordSha256: string;
  readonly implementationRecordBytes: number;
  readonly amendmentSha256: string;
  readonly amendmentBytes: number;
  readonly terminalState: string;
}

export async function materialiseV3Census(
  repoRoot: string,
  options: MaterialiseOptions,
): Promise<MaterialiseOutcome> {
  const connectionString = process.env['DATABASE_URL_READONLY'];
  if (connectionString === undefined || connectionString === '') {
    throw new OptionCLiteStop('STOP: DATABASE_URL_READONLY is not configured.');
  }
  if (PRODUCTION_POLICY_VERSION !== EXPECTED_PRODUCTION_POLICY_VERSION) {
    throw new OptionCLiteStop(
      `STOP: production acquisition is "${PRODUCTION_POLICY_VERSION}", not ` +
        `"${EXPECTED_PRODUCTION_POLICY_VERSION}". This census measures the v3 predicate.`,
    );
  }

  const before = IMMUTABLE_INPUT_PATHS.map((path) => identify(repoRoot, path));

  const pool = new pg.Pool({ connectionString, max: 2 });
  let census: V3CensusResult;
  let affectedSelectionIndices: readonly number[];
  let affectedIncludingSuperseded: readonly number[];
  let countsBefore: readonly { table: string; count: number }[];
  let countsAfter: readonly { table: string; count: number }[];
  try {
    countsBefore = await readTableCounts(pool);
    for (const { table, count } of countsBefore) {
      const required = REQUIRED_TABLE_COUNTS[table];
      if (required !== undefined && required !== count) {
        throw new OptionCLiteStop(
          `STOP: ${table} holds ${count} rows, not the ${required} this step was ` +
            'authorised over. The evidence in front of this step is not the evidence it ' +
            'was approved against.',
        );
      }
    }

    const runs: readonly PersistedRun[] = await readRuns(pool);
    const redirects = await readRedirects(pool);
    const supersededRefs = supersededRunRefs(repoRoot);
    const superseded = new Set(
      runs.filter((run) => supersededRefs.has(opaqueRefOf(run.runId))).map((run) => run.runId),
    );
    if (superseded.size !== supersededRefs.size) {
      throw new OptionCLiteStop(
        `STOP: the transition ledger names ${supersededRefs.size} superseded runs but only ` +
          `${superseded.size} were found in the database.`,
      );
    }

    census = censusOfPersistedRuns(runs, redirects, superseded);

    const indexByRun = await selectionIndexByRun(pool, selectionIndexByEcheRowKey(repoRoot));
    const indexOf = (runId: string): number => {
      const index = indexByRun.get(runId);
      if (index === undefined) {
        throw new OptionCLiteStop('STOP: an affected run has no selection index.');
      }
      return index;
    };
    const affectedRuns = census.runs.filter(
      (run) => run.classification === 'V3_TRANSITION_AFFECTED',
    );
    const sorted = (indices: number[]): number[] => [...new Set(indices)].sort((a, b) => a - b);
    affectedSelectionIndices = sorted(
      affectedRuns.filter((run) => run.acquisitionOfRecord).map((run) => indexOf(run.runId)),
    );
    affectedIncludingSuperseded = sorted(affectedRuns.map((run) => indexOf(run.runId)));

    countsAfter = await readTableCounts(pool);
  } finally {
    await pool.end();
  }

  const databaseUnchanged =
    JSON.stringify(countsBefore) === JSON.stringify(countsAfter) &&
    countsAfter.every(
      ({ table, count }) =>
        REQUIRED_TABLE_COUNTS[table] === undefined || REQUIRED_TABLE_COUNTS[table] === count,
    );
  if (!databaseUnchanged) {
    throw new OptionCLiteStop('STOP: a table count moved while this read-only step was running.');
  }

  const implementationRecord = buildImplementationRecord(repoRoot, census, {
    affectedSelectionIndices,
    affectedIncludingSuperseded,
    tableCounts: countsAfter,
  });
  const amendment = buildPlanAmendment(repoRoot);

  // LAID OUT BY THIS REPOSITORY'S OWN PRETTIER, the way the Option-B step's
  // records are. `npm run validate` runs `prettier --check .`, which covers
  // every committed `.json`, so a record emitted with a plain
  // `JSON.stringify` layout would fail the gate the moment it landed - and,
  // worse, this harness would stop reproducing its own committed bytes.
  const implementationBytes = await renderRecord(IMPLEMENTATION_RECORD_PATH, implementationRecord);
  const amendmentBytes = await renderRecord(PLAN_AMENDMENT_V2_PATH, amendment);

  if (options.write) {
    writeFileSync(join(repoRoot, IMPLEMENTATION_RECORD_PATH), implementationBytes);
    writeFileSync(join(repoRoot, PLAN_AMENDMENT_V2_PATH), amendmentBytes);
  }

  const after = IMMUTABLE_INPUT_PATHS.map((path) => identify(repoRoot, path));
  const immutableInputsUnchanged = JSON.stringify(before) === JSON.stringify(after);
  if (!immutableInputsUnchanged) {
    throw new OptionCLiteStop('STOP: a bound immutable input changed while this step ran.');
  }

  return {
    census,
    affectedSelectionIndices,
    affectedSelectionIndicesIncludingSupersededRuns: affectedIncludingSuperseded,
    databaseUnchanged,
    immutableInputsUnchanged,
    implementationRecordSha256: sha256(implementationBytes),
    implementationRecordBytes: Buffer.byteLength(implementationBytes),
    amendmentSha256: sha256(amendmentBytes),
    amendmentBytes: Buffer.byteLength(amendmentBytes),
    terminalState: OPTION_C_LITE_COMPLETE,
  };
}

function buildImplementationRecord(
  repoRoot: string,
  census: V3CensusResult,
  extra: {
    affectedSelectionIndices: readonly number[];
    affectedIncludingSuperseded: readonly number[];
    tableCounts: readonly { table: string; count: number }[];
  },
): Record<string, unknown> {
  return {
    record: 'PHASE_2B_ROBOTS_OPTION_C_LITE_IMPLEMENTATION',
    recordKind: 'ROBOTS_OPTION_C_LITE_IMPLEMENTATION_V1',
    ownerDecisions: [...OPTION_C_LITE_OWNER_DECISIONS],

    selectedOption: 'C_LITE',
    standardBasis: 'RFC_9309_SECTION_2_3_1_2',
    scope: 'SAME_REGISTRABLE_DOMAIN_SINGLE_HOP_ROBOTS_REDIRECT_CONTINUATION',
    fetchPolicyVersion: PRODUCTION_POLICY_VERSION,
    crossRegistrableDomain: false,
    maxRobotsRedirectContinuationHops: 1,
    gatewayAutoFollow: false,
    targetPolicyAppliedToInitialAuthority: true,
    targetOriginCacheContaminated: false,
    historicalEvidenceMutated: false,
    networkExecuted: false,
    targetedRevalidationAuthorised: false,
    batchContinuationAuthorised: false,
    reserveConsumptionAuthorised: false,
    thisFileAuthorises: [],

    standardsConclusion: {
      section: 'RFC 9309 §2.3.1.2',
      boundFacts: [
        'A robots.txt fetch may redirect.',
        'Crawlers SHOULD follow at least five consecutive redirects, even across authorities.',
        'A robots.txt reached that way MUST have its rules followed in the context of the INITIAL authority.',
      ],
      supersededPremise:
        "ADR 0012 §3's premise that a robots.txt retrieved from another origin cannot govern " +
        'the original origin is not a correct statement of RFC 9309 redirect semantics. ADR 0013 ' +
        'supersedes that premise and the one boundary it supported, and nothing else.',
      repositoryRemainsStricter: {
        crossRegistrableDomainRedirects: 'REFUSED',
        maxHops: 1,
        rfcRecommendedHops: 5,
        gatewayFollowsRedirectsAutomatically: false,
      },
      historyRewritten: false,
    },

    boundArtifacts: {
      adr0013: identify(repoRoot, ADR_0013_PATH),
      priorPlan: identify(repoRoot, PRIOR_PLAN_PATH),
      priorAmendment: identify(repoRoot, PRIOR_AMENDMENT_PATH),
      transitionLedger: identify(repoRoot, TRANSITION_LEDGER_PATH),
      methodologyR3: identify(repoRoot, METHODOLOGY_R3_PATH),
      draw: identify(repoRoot, DRAW_ARTIFACT_PATH),
    },

    productionFilesChanged: [
      'src/orgunits/web/policy.ts',
      'src/orgunits/web/robots.ts',
      'src/orgunits/orchestrator/rootRunner.ts',
    ],
    productionFilesDeliberatelyUnchanged: [
      'src/orgunits/web/gateway.ts',
      'src/orgunits/web/redirect.ts',
      'src/orgunits/web/robotsAuthority.ts',
      'src/orgunits/web/hostPolicy.ts',
      'src/orgunits/web/url.ts',
      'src/orgunits/orchestrator/constants.ts',
      'migrations/',
      'src/cli/',
      'src/orgunits/classify/',
    ],
    migrationsAdded: 0,
    runtimeDependenciesAdded: 0,

    persistedRobotsRedirectCensus: {
      scope: 'EVERY persisted redirect observation in the working database.',
      redirectObservationsTotal: census.redirects.redirectObservationsTotal,
      robotsRedirectsTotal: census.redirects.robotsRedirectsTotal,
      optionBQualifying: census.redirects.optionBQualifying,
      optionCLiteNewlyQualifying: census.redirects.optionCLiteNewlyQualifying,
      stillRefused: census.redirects.stillRefused,
      partitionsExhaustively: true,
      predicateCalled: 'src/orgunits/web/robots.ts::continuationTargetFor',
      predicateReimplemented: false,
    },

    v3TransitionClassification: {
      rule:
        'For each persisted run under a superseded policy version, call the LANDED v3 predicate ' +
        'against its persisted robots-redirect evidence and ask whether it would NEWLY continue ' +
        'relative to the version that run actually executed under. v1 continued nothing; v2 ' +
        'continued the same-hostname shape only.',
      forbiddenInputs: ['pageYield', 'label', 'modelResult', 'semanticClass'],
      runsExamined: census.runsExamined,
      acquisitionOfRecordRuns: census.acquisitionOfRecordRuns,
      supersededRuns: census.supersededRuns,
      V3_TRANSITION_UNAFFECTED: census.unaffectedCount,
      V3_TRANSITION_AFFECTED: census.affectedCount,
      affectedAcquisitionOfRecordRuns: census.affectedAcquisitionOfRecordRuns,
      affectedSelectionIndices: [...extra.affectedSelectionIndices],
      affectedSelectionIndicesIncludingSupersededRuns: [...extra.affectedIncludingSuperseded],
      whyThoseTwoListsDiffer:
        "Selection index 5's SUPERSEDED v1 run is affected - v1 continued nothing, so its " +
        'same-hostname robots redirect would newly continue under v3. Its ACQUISITION OF RECORD ' +
        'is the v2 run that already continued it, which is unaffected. Only the first list names ' +
        'organisations whose evidence of record could change.',
      disclosureNote:
        'Selection indices are already published by the Batch-01/Batch-02 execution records, ' +
        'ADR 0012 and the transition ledger. No eche_row_key, organisation id, hostname or URL ' +
        'appears in this record.',
      perRun: census.runs.map((run) => ({
        runOpaqueRef: opaqueRefOf(run.runId),
        fetchPolicyVersion: run.fetchPolicyVersion,
        acquisitionOfRecord: run.acquisitionOfRecord,
        robotsRedirectObservations: run.robotsRedirectObservations,
        robotsRedirectsContinuableUnderV3: run.robotsRedirectsContinuableUnderV3,
        robotsRedirectsNewlyContinuable: run.robotsRedirectsNewlyContinuable,
        classification: run.classification,
      })),
      opaqueRefDerivation: 'SHA-256 of the run UUID',
    },

    acquisitionOfRecordUnchangedByThisStep: {
      statement:
        'No run status moves on counterfactual capability. A V3_TRANSITION_AFFECTED run keeps ' +
        'its current acquisition status until a separately authorised live run under v3 ' +
        'produces real evidence.',
      batch01ExecutionRecordEdited: false,
      batch02ExecutionRecordEdited: false,
      batch02V2ContinuationExecutionRecordEdited: false,
      sd9StatusesEdited: false,
      replacementStateEdited: false,
      reserveConsumed: 0,
      transitionReasonForAnyFutureEntry: TRANSITION_REASON,
    },

    generation1PrimaryAcquisitionState: {
      finalised: FINALISED_SELECTION_INDICES,
      neverStarted: [...NEVER_STARTED_SELECTION_INDICES],
      note:
        'Unchanged by this step. No acquisition success rate may be inferred from eight ' +
        'organisations.',
    },

    historicalClassifierFreezes: {
      freezeFilesEdited: 0,
      ownerFreezeApprovalFilesEdited: 0,
      historicalV1ReconstructionStillGreen: true,
      rule:
        'A historical freeze binds the fetch-policy version of the acquisition run it was built ' +
        'from, never the constant the build reading it implements. Production has now moved ' +
        'twice since the 2D2C freeze and the frozen value followed neither move.',
      twoDTwoCReFrozen: false,
    },

    databaseState: {
      readOnly: true,
      role: 'readonly',
      writesIssued: 0,
      tableCounts: extra.tableCounts.map(({ table, count }) => ({ table, count })),
      unchanged: true,
    },

    transcriptIdentifierDisclosure: {
      classification: 'PROCEDURAL_IDENTIFIER_DISCLOSURE_NO_SEMANTIC_HOLDOUT_ACCESS',
      whatWasDisclosed:
        "An organisation's ECHE source-row key appeared transiently in the operator transcript.",
      whatWasNotDisclosed: [
        'page content',
        'page title',
        'label',
        'gold',
        'classifier result',
        'semantic evidence',
      ],
      finalHoldoutInvalidated: false,
      requirementBeforeNextGatedLiveAcquisition:
        'An operator-safe execution method that prevents institution identifiers from being ' +
        'pasted into a public or chat transcript.',
      cliRedesignedInThisStep: false,
    },

    networkAttestation: {
      institutionHttpRequests: 0,
      dnsLookups: 0,
      tlsHandshakes: 0,
      executeAcquisitionRuns: 0,
      index7Rerun: false,
      earlierHostChangingCaseRerun: false,
      indices8or9Started: false,
    },

    terminalState: OPTION_C_LITE_COMPLETE,
    nextOwnerDecision: NEXT_OWNER_DECISION,
    immutability: {
      appendOnly: true,
      thisRecordIsNeverEdited: 'A correction is a NEW record that references this one by SHA-256.',
    },
  };
}

function buildPlanAmendment(repoRoot: string): Record<string, unknown> {
  return {
    record: 'PHASE_2B_2D_CORPUS_ACQUISITION_PLAN_V1_OPTION_C_LITE_AMENDMENT',
    recordKind: 'CORPUS_ACQUISITION_PLAN_AMENDMENT_V2',
    generationId: 'METHODOLOGY_V2_GEN1',
    ownerDecision: 'AUTHORISE_CORPUS_ACQUISITION_POLICY_TRANSITION_V2_TO_V3_PLANNING_V1',

    whyThisIsANewFile: {
      statement:
        'Plan V1 and the Option-B amendment are immutable. An amendment is a NEW artifact that ' +
        'references them by SHA-256; neither is edited, and their bytes are bound below so that ' +
        '"we did not touch them" is a check rather than a promise.',
    },

    priorPlan: identify(repoRoot, PRIOR_PLAN_PATH),
    priorAmendment: identify(repoRoot, PRIOR_AMENDMENT_PATH),
    boundAdr: identify(repoRoot, ADR_0013_PATH),

    newFutureFetchPolicyVersion: PRODUCTION_POLICY_VERSION,
    supersededFetchPolicyVersions: ['orgunit-fetch-policy-v1', 'orgunit-fetch-policy-v2'],

    methodologyChanged: false,
    frameChanged: false,
    drawChanged: false,
    splitChanged: false,
    samplingChanged: false,
    budgetCeilingsChanged: false,

    robotsRedirectHostBoundaryChanged: 'SAME_HOST_TO_SAME_REGISTRABLE_DOMAIN',
    maxRobotsRedirectContinuationHops: 1,

    budgetsRestatedUnchanged: {
      MAX_PAGE_ATTEMPTS_PER_ROOT: 35,
      MAX_TOTAL_REQUESTS_PER_ROOT: 60,
      MAX_HOSTS_PER_ROOT: 8,
      note:
        'A host-changing site-policy continuation consumes a distinct-host slot like any other ' +
        'hostname. There is no robots exemption and no robots-only budget.',
    },

    compatibilityRuleForFutureAdjudication: {
      classifications: ['V3_TRANSITION_UNAFFECTED', 'V3_TRANSITION_AFFECTED'],
      decidedBy: 'src/orgunits/web/robots.ts::continuationTargetFor, called on persisted evidence',
      forbiddenInputs: ['pageYield', 'label', 'modelResult', 'semanticClass'],
      affectedRunStatusMovesOnlyAfterLiveRevalidation: true,
    },

    noLiveAcquisitionIsAuthorisedByThisArtifact: true,
    thisFileAuthorises: [],
    nextOwnerDecision: NEXT_OWNER_DECISION,
    immutability: {
      appendOnly: true,
      thisRecordIsNeverEdited:
        'A further transition is a NEW amendment that references this one by SHA-256.',
    },
  };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
  const write = process.argv.includes('--write');
  const outcome = await materialiseV3Census(repoRoot, { write });

  // AGGREGATES AND OPAQUE REFS ONLY. No identity, no page value, no text.
  console.log(`robotsRedirectsTotal            ${outcome.census.redirects.robotsRedirectsTotal}`);
  console.log(`optionBQualifying               ${outcome.census.redirects.optionBQualifying}`);
  console.log(
    `optionCLiteNewlyQualifying      ${outcome.census.redirects.optionCLiteNewlyQualifying}`,
  );
  console.log(`stillRefused                    ${outcome.census.redirects.stillRefused}`);
  console.log(`runsExamined                    ${outcome.census.runsExamined}`);
  console.log(`V3_TRANSITION_AFFECTED          ${outcome.census.affectedCount}`);
  console.log(`V3_TRANSITION_UNAFFECTED        ${outcome.census.unaffectedCount}`);
  console.log(`affectedAcquisitionOfRecord     ${outcome.census.affectedAcquisitionOfRecordRuns}`);
  console.log(`affectedSelectionIndices        ${outcome.affectedSelectionIndices.join(',')}`);
  console.log(
    `affectedInclSupersededRuns      ${outcome.affectedSelectionIndicesIncludingSupersededRuns.join(',')}`,
  );
  console.log(`databaseUnchanged               ${outcome.databaseUnchanged}`);
  console.log(
    `implementationRecord            ${outcome.implementationRecordSha256} (${outcome.implementationRecordBytes} bytes)`,
  );
  console.log(
    `planAmendmentV2                 ${outcome.amendmentSha256} (${outcome.amendmentBytes} bytes)`,
  );
  console.log(outcome.terminalState);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
