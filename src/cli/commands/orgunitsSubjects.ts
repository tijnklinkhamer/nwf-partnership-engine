/**
 * `nwf-pe orgunits subjects research --subject-id <uuid> [--execute] [--json]`
 * - RESEARCH ONE DISCOVERY SUBJECT (lane L1, ADR 0025 s12).
 *
 * The subject counterpart of `orgunits discover`, built the same way. This
 * file is an ENTRY POINT, not a network owner: it never imports anything
 * under `src/orgunits/web/`, never constructs a robots authority and never
 * bypasses a budget. Every request it can cause runs through
 * `src/orgunits/subjectRun/execute.ts` -> the orchestrator -> `robots.ts` ->
 * the one gateway, under the frozen 35/60/8 budgets.
 *
 * ADMISSION FIRST, IN BOTH MODES. The subject must hold exactly ONE live
 * OWNER admission (`verifySubjectAdmission`: unrevoked, unexpired by the
 * database clock, current policy, not stale, guard-clean). Otherwise the
 * command refuses with a code and writes nothing - no run row, no DNS, no
 * HTTP. The research role cannot create an admission, so this command cannot
 * either.
 *
 * DRY RUN BY DEFAULT: without `--execute` it reports the verified root and
 * the subject's earlier runs (plain SELECTs as the research role). ZERO DNS,
 * ZERO HTTP, no run row. `--execute` re-verifies from the database and runs
 * ONE bounded research run of that admission.
 *
 * SCOPE: exactly one subject per invocation. No batch, no `--all`.
 *
 * DATABASE ROLE: `research` only (`DATABASE_URL_RESEARCH`). Never admin or
 * ingest; this role holds no privilege on any discovery-subject table.
 *
 * REL P2 - LINK-OUTS. When `DATABASE_URL_SOURCE_DISCOVERY` is set (a login
 * holding the NOLOGIN `nwf_source_discovery` capability, migration 0019),
 * `--execute` opens a SECOND pool on it and hands it to subject research,
 * which records the run's off-domain anchors as PAGE_LINK_OUT nominations
 * and sightings - never fetched - and refuses the run before it starts if
 * that login cannot enter the capability. When it is not set, the run is
 * exactly what it was and the output SAYS the link-outs were discarded: no
 * silent zero. The research pool is never used in its place, and there is
 * no other fallback.
 */
import { env } from '../../config/env.js';
import { createPool, withPool } from '../../db/client.js';
import * as log from '../../logging/log.js';
import type { RootRunnerDeps } from '../../orgunits/orchestrator/rootRunner.js';

export interface SubjectsResearchOptions {
  subjectId?: string;
  execute: boolean;
  json: boolean;
}

/**
 * Test seam: transport, clock and cohort-registry loader. Production
 * (`src/cli/index.ts`) passes nothing, so the real gateway and the committed
 * pinned cohort artifacts decide.
 */
export type SubjectsResearchDependencies = RootRunnerDeps;

const NO_NETWORK_NOTE =
  'No DNS lookup and no HTTP request were made. Pass --execute to run one bounded ' +
  'research run of this admission, through the research role.';

/** Whether this invocation records link-outs; decided by configuration only. */
type LinkOutMode = 'RECORDED_AS_NOMINATIONS' | 'DISCARDED';

const LINK_OUTS_DISCARDED_NOTE =
  'Off-domain link-outs of this run were DISCARDED, not recorded: DATABASE_URL_SOURCE_DISCOVERY ' +
  'is not set. Set it to a login holding nwf_source_discovery to record them as nominations ' +
  '(they are never fetched).';

const LINK_OUTS_RECORDED_NOTE =
  'Off-domain link-outs of this run are recorded as PAGE_LINK_OUT nominations and sightings ' +
  'through DATABASE_URL_SOURCE_DISCOVERY. None was fetched; fetching another domain needs its own ' +
  'promotion, review and OWNER admission.';

function linkOutModeOf(): LinkOutMode {
  return env().DATABASE_URL_SOURCE_DISCOVERY === undefined
    ? 'DISCARDED'
    : 'RECORDED_AS_NOMINATIONS';
}

function reportRefusal(
  options: SubjectsResearchOptions,
  mode: 'DRY_RUN' | 'EXECUTE',
  code: string,
  detail: string,
): number {
  if (options.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          mode,
          subjectId: options.subjectId,
          admission: 'REFUSED',
          refusal: { code, detail },
          note: 'No research run was created. No DNS lookup and no HTTP request were made.',
        },
        null,
        2,
      )}\n`,
    );
  } else {
    log.error(
      `orgunits subjects research refused for subject ${options.subjectId}: ${code} (${detail}). ` +
        'No research run was created, and no DNS lookup or HTTP request was made.',
    );
  }
  return 1;
}

export async function runOrgunitsSubjectsResearch(
  options: SubjectsResearchOptions,
  deps: SubjectsResearchDependencies = {},
): Promise<number> {
  const subjectId = options.subjectId;
  if (!subjectId) {
    log.error('orgunits subjects research requires --subject-id <uuid>.');
    return 1;
  }

  return withPool('research', async (pool) => {
    const { verifySubjectAdmission } = await import('../../orgunits/subjectRun/admission.js');
    const mode = options.execute ? 'EXECUTE' : 'DRY_RUN';
    const verified = await verifySubjectAdmission(pool, subjectId, deps);
    if (verified.outcome === 'REFUSED') {
      return reportRefusal(options, mode, verified.code, verified.detail);
    }
    const admission = verified.admission;
    const { executionRefusalCodeOf, listSubjectRuns, runSubjectResearch } =
      await import('../../orgunits/subjectRun/execute.js');

    if (!options.execute) {
      const previousRuns = await listSubjectRuns(pool, subjectId);
      const plan = {
        mode: 'DRY_RUN',
        subjectId,
        admission: 'ADMITTED',
        admissionId: admission.admissionId,
        rootKey: admission.rootKey,
        rootUrl: admission.rootUrl,
        identityAuthorityScope: admission.identityAuthorityScope,
        previousRuns,
        linkOuts: linkOutModeOf() === 'DISCARDED' ? 'WOULD_DISCARD' : 'WOULD_RECORD',
        note: NO_NETWORK_NOTE,
      };
      if (options.json) {
        process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
      } else {
        log.info(`Dry run for subject ${subjectId}:`);
        log.info(`  [${admission.rootKey}] -> ${admission.rootUrl}`);
        log.info(`  earlier runs: ${previousRuns.length}`);
        log.info(`  link-outs: ${plan.linkOuts}`);
        log.info('No DNS lookup and no HTTP request were made. Pass --execute to run for real.');
      }
      return 0;
    }

    const linkOutMode = linkOutModeOf();
    const linkOutPool =
      linkOutMode === 'RECORDED_AS_NOMINATIONS' ? createPool('source_discovery') : undefined;
    let result;
    try {
      result = await runSubjectResearch(
        pool,
        admission,
        linkOutPool === undefined
          ? { networkVantage: 'cli' }
          : { networkVantage: 'cli', linkOutPool },
        deps,
      );
    } catch (error) {
      const code = executionRefusalCodeOf(error);
      if (code === 'LINK_OUT_CAPABILITY_REFUSED') {
        return reportRefusal(
          options,
          'EXECUTE',
          code,
          'the DATABASE_URL_SOURCE_DISCOVERY login cannot enter nwf_source_discovery',
        );
      }
      if (code !== null) return reportRefusal(options, 'EXECUTE', 'ADMISSION_REFUSED', code);
      throw error;
    } finally {
      await linkOutPool?.end();
    }
    const linkOutNote =
      linkOutMode === 'DISCARDED' ? LINK_OUTS_DISCARDED_NOTE : LINK_OUTS_RECORDED_NOTE;

    if (options.json) {
      process.stdout.write(`${JSON.stringify({ ...result, linkOutMode, linkOutNote }, null, 2)}\n`);
    } else {
      log.info(`Run ${result.runId} for subject ${subjectId}: ${result.runTerminalState}`);
      const s = result.summary;
      if (s !== null) {
        log.info(
          `  [${result.rootKey}] ${s.terminalReason} (pages=${s.pageAttempts}/35, ` +
            `requests=${s.totalRequests}/60, candidates=${s.candidateEvaluations}, ` +
            `trackA=${s.trackASelected}, trackB=${s.trackBSelected})`,
        );
      }
      const l = result.linkOuts;
      if (l !== null) {
        log.info(
          `  link-outs: offered=${l.offered}, nominated=${l.inserted}, ` +
            `alreadyNominatedElsewhere=${l.alreadyNominatedElsewhere}, ` +
            `sightings=${l.sightings}, repeatedSightings=${l.repeatedSightings}`,
        );
      }
      log.info(`  ${linkOutNote}`);
    }
    // A run that found nothing or was robots-blocked is not a process failure.
    return result.runTerminalState === 'FAILED' ? 1 : 0;
  });
}
