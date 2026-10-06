/**
 * `nwf-pe orgunits classify runs|calls|show` - THE CLASSIFIER OPERATOR READ
 * MODELS (CLASSIFIER_OPERATOR_READ_MODELS_V1).
 *
 *   orgunits classify runs  --organisation-id <uuid> [--limit <N>] [--json]
 *   orgunits classify calls --organisation-id <uuid> [--run-id <uuid>] [--limit <N>] [--json]
 *   orgunits classify show  --call-id <uuid> [--json]
 *
 * ALWAYS A REAL READ, NEVER AN EXECUTION. These commands have no execute
 * mode, no model, no attempt: `--execute`, `--model` and `--attempt` are
 * refused, as is every other option that is not meaningful for the chosen
 * read. Nothing an operator types here is silently ignored.
 *
 * READONLY ROLE ONLY. The one database capability is a `readonly`-role pool
 * (`DATABASE_URL_READONLY`); migrations 0007 and 0009 already grant
 * `nwf_readonly` SELECT on every table read, and it holds no write grant.
 * This file imports no provider, no execution path (`classify.ts`,
 * `classifyProvider.ts`, `orchestrate.ts`), nothing under `orgunits/web/`
 * and no discovery runtime. It reads no environment variable of its own.
 *
 * A third positional other than `runs`, `calls` or `show` is REFUSED here -
 * it never falls through to the execution action.
 */
import type pg from 'pg';
import { withPool } from '../../db/client.js';
import {
  CLASSIFIER_READ_DEFAULT_LIMIT,
  listClassifierCalls,
  listClassifierResearchRuns,
  showClassifierCall,
  type ClassificationRead,
  type ClassifierCallDetailRead,
  type ClassifierCallsRead,
  type ResearchRunsRead,
} from '../../orgunits/classify/operatorReadModels.js';

export const CLASSIFY_READ_SUBCOMMANDS = ['runs', 'calls', 'show'] as const;
export type ClassifyReadSubcommand = (typeof CLASSIFY_READ_SUBCOMMANDS)[number];

/**
 * The options each read accepts, by their CLI spelling. `json` and `limit`
 * are listed where accepted; anything supplied outside this set is refused.
 */
export const CLASSIFY_READ_ALLOWED_OPTIONS: Readonly<
  Record<ClassifyReadSubcommand, readonly string[]>
> = Object.freeze({
  runs: ['organisation-id', 'limit', 'json'],
  calls: ['organisation-id', 'run-id', 'limit', 'json'],
  show: ['call-id', 'json'],
});

export interface ClassifyReadOptions {
  /** Every positional after `orgunits classify`; the first names the read. */
  readonly positionals: readonly string[];
  /** The CLI spelling of every option the operator actually supplied. */
  readonly suppliedOptions: readonly string[];
  readonly organisationId?: string;
  readonly runId?: string;
  readonly callId?: string;
  /** Already parsed by the CLI's shared positive-integer `--limit` rule. */
  readonly limit?: number;
  readonly json: boolean;
}

/** Every capability the reads use, supplied explicitly. Only `runOrgunitsClassifyRead` wires production. */
export interface ClassifyReadDependencies {
  /** Runs `fn` with a `readonly`-role pool and closes it afterwards. */
  readonly withReadonlyPool: <T>(fn: (pool: pg.Pool) => Promise<T>) => Promise<T>;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PURE: true for exactly one canonical UUID string. No Erasmus code, no name, no resolution. */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export type ParsedClassifyRead =
  | { readonly subcommand: 'runs'; readonly organisationId: string; readonly limit: number }
  | {
      readonly subcommand: 'calls';
      readonly organisationId: string;
      readonly runId: string | null;
      readonly limit: number;
    }
  | { readonly subcommand: 'show'; readonly callId: string };

/** PURE argument bounds for the three reads. */
export function parseClassifyReadArguments(
  options: ClassifyReadOptions,
): { ok: true; value: ParsedClassifyRead } | { ok: false; message: string } {
  const [subcommand, ...extra] = options.positionals;
  if (!CLASSIFY_READ_SUBCOMMANDS.includes(subcommand as ClassifyReadSubcommand)) {
    return {
      ok: false,
      message:
        `Unknown classifier subcommand: ${JSON.stringify(subcommand ?? '')}. ` +
        'Expected one of: runs, calls, show (or no subcommand for the classify action itself).',
    };
  }
  const read = subcommand as ClassifyReadSubcommand;
  if (extra.length > 0) {
    return {
      ok: false,
      message: `orgunits classify ${read} takes no further positional argument.`,
    };
  }
  const allowed = CLASSIFY_READ_ALLOWED_OPTIONS[read];
  const refused = [...new Set(options.suppliedOptions)].filter((o) => !allowed.includes(o)).sort();
  if (refused.length > 0) {
    return {
      ok: false,
      message:
        `orgunits classify ${read} does not accept ${refused.map((o) => `--${o}`).join(', ')}. ` +
        `It is a read-only inspection; accepted: ${allowed.map((o) => `--${o}`).join(', ')}.`,
    };
  }
  const limit = options.limit ?? CLASSIFIER_READ_DEFAULT_LIMIT;

  if (read === 'show') {
    if (options.callId === undefined || options.callId === '') {
      return { ok: false, message: 'orgunits classify show requires --call-id <uuid>.' };
    }
    if (!isUuid(options.callId)) {
      return { ok: false, message: '--call-id must be a single UUID.' };
    }
    return { ok: true, value: { subcommand: 'show', callId: options.callId } };
  }

  if (options.organisationId === undefined || options.organisationId === '') {
    return { ok: false, message: `orgunits classify ${read} requires --organisation-id <uuid>.` };
  }
  if (!isUuid(options.organisationId)) {
    return { ok: false, message: '--organisation-id must be a single UUID.' };
  }
  if (read === 'runs') {
    return {
      ok: true,
      value: { subcommand: 'runs', organisationId: options.organisationId, limit },
    };
  }
  if (options.runId !== undefined && !isUuid(options.runId)) {
    return { ok: false, message: '--run-id must be a single UUID.' };
  }
  return {
    ok: true,
    value: {
      subcommand: 'calls',
      organisationId: options.organisationId,
      runId: options.runId ?? null,
      limit,
    },
  };
}

/** Testable core: argument bounds, then exactly one readonly-pool read, then output. */
export async function executeClassifyReadCommand(
  options: ClassifyReadOptions,
  deps: ClassifyReadDependencies,
): Promise<number> {
  const parsed = parseClassifyReadArguments(options);
  if (!parsed.ok) {
    deps.stderr(`error: ${parsed.message}\n`);
    return 1;
  }
  const args = parsed.value;
  const emit = (value: unknown, human: string): void => {
    deps.stdout(options.json ? `${JSON.stringify(value, null, 2)}\n` : human);
  };

  if (args.subcommand === 'runs') {
    const result = await deps.withReadonlyPool((pool) =>
      listClassifierResearchRuns(pool, { organisationId: args.organisationId, limit: args.limit }),
    );
    if (result === null) {
      deps.stderr(`error: no organisation with id ${args.organisationId}.\n`);
      return 1;
    }
    emit(result, formatRuns(result));
    return 0;
  }

  if (args.subcommand === 'calls') {
    const result = await deps.withReadonlyPool((pool) =>
      listClassifierCalls(pool, {
        organisationId: args.organisationId,
        runId: args.runId,
        limit: args.limit,
      }),
    );
    if (result === null) {
      deps.stderr(`error: no organisation with id ${args.organisationId}.\n`);
      return 1;
    }
    emit(result, formatCalls(result));
    return 0;
  }

  const detail = await deps.withReadonlyPool((pool) => showClassifierCall(pool, args.callId));
  if (detail === null) {
    deps.stderr(`error: no classifier call with id ${args.callId}.\n`);
    return 1;
  }
  emit(detail, formatDetail(detail));
  return 0;
}

/** Production wiring: the readonly role, and nothing else. */
export async function runOrgunitsClassifyRead(options: ClassifyReadOptions): Promise<number> {
  return executeClassifyReadCommand(options, {
    withReadonlyPool: (fn) => withPool('readonly', fn),
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  });
}

// ---------------------------------------------------------------------------
// Human output. Plain text, full identifiers, no ANSI.
// ---------------------------------------------------------------------------

const orDash = (value: string | number | null): string => (value === null ? '-' : String(value));

/** Bounded single-line rendering of persisted text for the terminal. */
function oneLine(value: string, max = 300): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

export function formatRuns(result: ResearchRunsRead): string {
  const out: string[] = [
    `Attributable research runs for organisation ${result.organisationId} (eche_row_key ${result.echeRowKey})`,
    `Association coverage: ${result.associationCoverage}`,
    '  A run is listed only when it has a fetch observation carrying this',
    "  organisation's eche_row_key, or an ordinary classifier call for it. A run",
    '  that ended before any fetch and was never classified cannot be linked to',
    '  an organisation from the persisted schema, and is therefore not listed.',
    `Counts are per run. Eligible candidates: rank_within_root <= ${result.eligibleRankCutoff} (score-agnostic).`,
    `${result.runs.length} run(s) (limit ${result.limit}).`,
  ];
  for (const run of result.runs) {
    out.push(
      '',
      `run ${run.runId}`,
      `  state ${run.terminalState}${run.errorKind === null ? '' : ` (${run.errorKind})`}` +
        `  started ${run.startedAt}  finished ${orDash(run.finishedAt)}`,
      `  policy ${run.fetchPolicyVersion}  rules ${run.ruleVersion}  vantage ${run.networkVantage}` +
        `  dry-run ${run.dryRun}`,
      `  association ${run.associationBasis}  classifier completion gate ${run.classifierCompletionGatePasses ? 'passes' : 'does not pass'}`,
      `  fetches ${run.fetchObservationCount}  pages ${run.pageEvidenceCount}` +
        `  candidates ${run.candidateRowCount} (eligible ${run.eligibleCandidateRowCount})` +
        `  ordinary classifier calls ${run.ordinaryClassifierCallCount}`,
    );
  }
  return `${out.join('\n')}\n`;
}

export function formatCalls(result: ClassifierCallsRead): string {
  const out: string[] = [
    `Ordinary classifier calls for organisation ${result.organisationId}` +
      (result.runId === null ? '' : `, run ${result.runId}`),
    `${result.calls.length} call(s) (limit ${result.limit}). Repair calls appear under \`orgunits classify show\`.`,
  ];
  for (const call of result.calls) {
    out.push(
      '',
      `call ${call.callId}`,
      `  run ${call.runId}  root ${orDash(call.rootKey)}  attempt ${call.attemptNo}`,
      `  state ${call.terminalState}${call.errorKind === null ? '' : ` (${call.errorKind})`}` +
        `  requested ${call.requestedAt}  finished ${orDash(call.finishedAt)}`,
      `  requested model ${call.requestedModelId}  response model ${orDash(call.responseModelId)}`,
      `  prompt ${call.promptVersion}  classifier ${call.classifierVersion}  schema ${call.outputSchemaVersion}`,
      `  input ${call.inputSha256}  documents ${call.inputDocumentCount}` +
        `  tokens in ${orDash(call.inputTokens)} out ${orDash(call.outputTokens)}`,
      `  own ${call.ownClassificationCount}  repairs ${call.repairCallCount} (completed ${call.completedRepairCount})` +
        `  effective ${call.effectiveClassificationCount}  unclassified ${call.unclassifiedDocumentCount}`,
    );
  }
  return `${out.join('\n')}\n`;
}

function formatClassification(c: ClassificationRead): string[] {
  const lines = [
    `  - classification ${c.classificationId}${c.repaired ? ' (repaired)' : ''}`,
    `    from call ${c.fromCallId}  page evidence ${c.pageEvidenceId}`,
    `    url ${c.page.requestedUrl}`,
    `    title ${c.page.title === null ? '-' : oneLine(c.page.title, 200)}` +
      `  lang ${orDash(c.page.declaredLang)}  main text truncated ${c.page.mainTextTruncated}`,
    `    verdict ${c.verdict}  unit type ${orDash(c.unitType)}  page kind ${orDash(c.pageKind)}` +
      `  confidence ${c.confidence}`,
    `    unit name ${c.unitName === null ? '-' : oneLine(c.unitName, 200)}`,
  ];
  if (c.verdict === 'UNIT_PAGE') {
    lines.push(
      `    incoming ${orDash(c.servesIncomingInternationalStudents)}` +
        `  outgoing ${orDash(c.servesOutgoingMobilityStudents)}` +
        `  language ${orDash(c.providesLanguageLearningOrSupport)}`,
    );
  }
  lines.push(`    rationale ${oneLine(c.rationale, 500)}`);
  for (const span of c.evidenceSpans)
    lines.push(`    evidence ${span.source}: ${oneLine(span.quote, 200)}`);
  lines.push(`    subject candidates ${c.subjectCandidateCount}`);
  return lines;
}

export function formatDetail(detail: ClassifierCallDetailRead): string {
  const call = detail.call;
  const done = detail.completion;
  const out: string[] = [
    `classifier call ${call.callId} (${detail.callKind})`,
    `  run ${call.runId}  organisation ${orDash(call.organisationId)}  eche_row_key ${call.echeRowKey}`,
    `  root ${orDash(call.rootKey)}  attempt ${call.attemptNo}  requested ${call.requestedAt}`,
    `  requested model ${call.requestedModelId}`,
    `  prompt ${call.promptVersion}  classifier ${call.classifierVersion}  schema ${call.outputSchemaVersion}`,
    `  input ${call.inputSha256}  documents ${call.inputDocumentCount}`,
  ];
  if (detail.callKind === 'REPAIR') {
    out.push(
      `  repair of ${detail.call.repairOfCallId}  repair doc index ${detail.call.repairDocIndex}`,
      `  effective view belongs to ordinary call ${detail.effectiveViewBelongsToOrdinaryCallId}`,
    );
  }
  out.push(
    `completion: ${done.terminalState}${done.errorKind === null ? '' : ` (${done.errorKind})`}` +
      `  finished ${orDash(done.finishedAt)}`,
    `  response model ${orDash(done.responseModelId)}  tokens in ${orDash(done.inputTokens)} out ${orDash(done.outputTokens)}`,
  );
  if (done.errorSummary !== null) out.push(`  error summary ${oneLine(done.errorSummary, 500)}`);

  out.push(`own classifications: ${detail.ownClassifications.length}`);
  for (const c of detail.ownClassifications) out.push(...formatClassification(c));

  if (detail.callKind === 'ORDINARY') {
    out.push(`repair calls: ${detail.repairs.length}`);
    for (const r of detail.repairs) {
      out.push(
        `  - repair ${r.repairCallId}  doc index ${r.repairDocIndex}  state ${r.terminalState}` +
          `${r.errorKind === null ? '' : ` (${r.errorKind})`}  requested ${r.requestedAt}` +
          `  finished ${orDash(r.finishedAt)}  classifications ${r.classificationCount}`,
      );
    }
    out.push(
      `effective classifications (ADR 0011): ${detail.effectiveClassificationCount}` +
        `  unclassified documents ${detail.unclassifiedDocumentCount}`,
    );
    for (const c of detail.effectiveClassifications) {
      out.push(`  - ${c.classificationId} from ${c.fromCallId}${c.repaired ? ' (repaired)' : ''}`);
    }
  }
  return `${out.join('\n')}\n`;
}
