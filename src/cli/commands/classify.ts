/**
 * `nwf-pe orgunits classify` - THE BOUNDED CLASSIFIER OPERATOR ENTRY POINT
 * (CLASSIFIER_OPERATOR_ENTRY_POINT_V1).
 *
 * Classifies exactly ONE explicit organisation against exactly ONE explicit,
 * already-COMPLETED research run, with ONE explicit allowed model, at ONE
 * explicit attempt number (default 1). It is an authority/orchestration
 * layer around the landed classifier runtime and re-implements none of it:
 * assembly, identity, COMPLETED reuse, call-before-provider persistence,
 * validation, accepted-row persistence and append-only completion all stay
 * inside `runOrganisationClassification` (`orgunits/classify/orchestrate.ts`).
 *
 * WHAT IT DELIBERATELY DOES NOT HAVE. No default organisation, no default
 * run, no "latest run" selection, no default model, no organisation sweep
 * or queue, no automatic attempt increment, no automatic retry, no repair
 * flag (repair stays `REPAIR_POLICY_DISABLED`, ADR 0011's default), no
 * provider-tuning flag (`runConfig` and `requestConfig` stay `{}`), and no
 * discovery chaining: a fresh research run is `orgunits discover --execute`,
 * run separately, whose run id the operator then passes here consciously.
 *
 * ORDER, AND WHY. Every gate that can refuse row-lessly runs before anything
 * that can write or spend:
 *
 *   1. argument bounds (no I/O);
 *   2. the PURE classifier preflight (`runClassifierPreflight`: conflicting
 *      auth variables, setup-token, profile path, closed model allowlist,
 *      run config) over an environment snapshot. With `--execute` any
 *      refusal stops here; an unknown model stops here in every mode;
 *   3. phase A, RESEARCH role: `checkRunCompleted` for the exact run id —
 *      `nwf_classifier` cannot read `orgunit_research_run_completions`
 *      (migration 0009), and the research pool is closed before phase B;
 *   4. phase B, CLASSIFIER role: assemble the whole organisation and
 *      inspect every batch's exact identity at the requested attempt
 *      (`planOrganisationClassification`). ONE non-completed collision
 *      refuses the whole execution start;
 *   5. only then, and only with `--execute`, is the production provider
 *      constructed (and only when at least one batch needs a NEW call) and
 *      the landed runtime invoked.
 *
 * NO INSTITUTIONAL NETWORK. Classification reads persisted page evidence
 * only. This file imports nothing under `orgunits/web/` and not the
 * discovery orchestrator; the only external activity `--execute` can cause
 * is the classifier provider runtime itself.
 *
 * OUTPUT IS BOUNDED. Ids, states, versions and counts only — never page
 * text, prompt text, the serialized batch, raw model output, the
 * environment, a profile path or a credential.
 */
import type pg from 'pg';
import { withPool } from '../../db/client.js';
import { ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION } from '../../orgunits/classify/constants.js';
import { ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION } from '../../orgunits/classify/outputSchema.js';
import { ORGUNIT_CLASSIFIER_PROMPT_VERSION } from '../../orgunits/classify/prompt.js';
import {
  runOrganisationClassification,
  type ClassifierCallResult,
} from '../../orgunits/classify/orchestrate.js';
import {
  planOrganisationClassification,
  type OperatorPlan,
} from '../../orgunits/classify/operatorPlan.js';
import type {
  ClassifierProvider,
  ClassifierRunConfig,
} from '../../orgunits/classify/providerContract.js';
import { REPAIR_POLICY_DISABLED } from '../../orgunits/classify/repair.js';
import { checkRunCompleted, type RunCompletionStatus } from '../../orgunits/classify/runStatus.js';
import {
  runClassifierPreflight,
  type PreflightResult,
} from '../../orgunits/classify/provider/preflight.js';

export interface ClassifyOptions {
  organisationId?: string;
  runId?: string;
  model?: string;
  /** The raw operator text of `--attempt`; absent means attempt 1. */
  attempt?: string;
  execute: boolean;
  json: boolean;
}

/**
 * Every capability the command uses, supplied EXPLICITLY. There is no
 * default for any member, so a test can never fall through to a production
 * pool or the production provider by omission. Only `runOrgunitsClassify`
 * below wires production values.
 */
export interface ClassifyDependencies {
  /** Runs `fn` with a `research`-role pool and closes it afterwards. Used ONLY for the completion gate. */
  readonly withResearchPool: <T>(fn: (pool: pg.Pool) => Promise<T>) => Promise<T>;
  /** Runs `fn` with a `classifier`-role pool and closes it afterwards. */
  readonly withClassifierPool: <T>(fn: (pool: pg.Pool) => Promise<T>) => Promise<T>;
  /** A snapshot of the process environment, for the pure preflight only. */
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly repoRoot: string;
  /** Called at most once, only with `--execute`, only after every gate passed, only when a batch needs a NEW call. */
  readonly createProvider: () => Promise<ClassifierProvider>;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

/** V1 passes the runtime's own defaults: no provider tuning from the CLI. */
export const CLASSIFIER_OPERATOR_RUN_CONFIG: ClassifierRunConfig = Object.freeze({});
/** V1 persists no request metadata beyond what the runtime itself records. */
export const CLASSIFIER_OPERATOR_REQUEST_CONFIG: Readonly<Record<string, unknown>> = Object.freeze(
  {},
);
/** ADR 0011's default, passed EXPLICITLY. V1 exposes no repair flag. */
export const CLASSIFIER_OPERATOR_REPAIR_POLICY = REPAIR_POLICY_DISABLED;

/** migration 0009: `attempt_no integer NOT NULL CHECK (attempt_no >= 1)`. */
const MAX_ATTEMPT_NO = 2_147_483_647;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ParsedClassifyArguments {
  readonly organisationId: string;
  readonly runId: string;
  readonly modelId: string;
  readonly attemptNo: number;
}

/** PURE argument bounds. No default organisation, run or model; attempt defaults to 1, never incremented. */
export function parseClassifyArguments(
  options: ClassifyOptions,
): { ok: true; value: ParsedClassifyArguments } | { ok: false; message: string } {
  if (options.organisationId === undefined || options.organisationId === '') {
    return { ok: false, message: 'orgunits classify requires --organisation-id <uuid>.' };
  }
  if (!UUID_PATTERN.test(options.organisationId)) {
    return { ok: false, message: '--organisation-id must be a single UUID.' };
  }
  if (options.runId === undefined || options.runId === '') {
    return {
      ok: false,
      message:
        'orgunits classify requires --run-id <uuid>. No research run is ever chosen ' +
        'implicitly (there is no "latest run"); choosing one is an operator decision.',
    };
  }
  if (!UUID_PATTERN.test(options.runId)) {
    return { ok: false, message: '--run-id must be a single UUID.' };
  }
  if (options.model === undefined || options.model === '') {
    return {
      ok: false,
      message:
        'orgunits classify requires --model <model-id>. There is no default classifier ' +
        'model: the allowlist holds candidate tiers, not a selected winner.',
    };
  }
  let attemptNo = 1;
  if (options.attempt !== undefined) {
    const raw = options.attempt;
    const value = /^[1-9][0-9]*$/.test(raw) ? Number(raw) : Number.NaN;
    if (!Number.isSafeInteger(value) || value < 1 || value > MAX_ATTEMPT_NO) {
      return {
        ok: false,
        message: `--attempt must be a positive integer (>= 1); received ${JSON.stringify(raw)}.`,
      };
    }
    attemptNo = value;
  }
  return {
    ok: true,
    value: {
      organisationId: options.organisationId,
      runId: options.runId,
      modelId: options.model,
      attemptNo,
    },
  };
}

/** A provider that must never be reached: used when every batch is reusable, so no real provider is constructed. */
const PROVIDER_NOT_REQUIRED: ClassifierProvider = {
  classify(): never {
    throw new Error(
      'orgunits classify: invariant violated - a fully reusable plan invoked the provider.',
    );
  },
};

interface BatchExecutionSummary {
  readonly batchIndex: number;
  readonly kind: 'REUSED' | 'EXECUTED';
  readonly callId: string;
  readonly terminalState: 'COMPLETED' | 'PARTIAL' | 'FAILED' | null;
  readonly errorKind: string | null;
  readonly documentCount: number;
  readonly acceptedCount: number;
  readonly rejectedCount: number;
  readonly repairCount: number;
  readonly repairedAcceptedCount: number;
}

const VERSIONS = {
  classifierVersion: ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION,
  promptVersion: ORGUNIT_CLASSIFIER_PROMPT_VERSION,
  outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
};

function preflightSummary(
  preflight: PreflightResult,
): { ok: true } | { ok: false; kind: string; detail: string } {
  // The resolved profile directory is NEVER reported; a refusal's detail
  // names variables and fields only (preflight.ts), never values.
  return preflight.ok
    ? { ok: true }
    : { ok: false, kind: preflight.kind, detail: preflight.detail };
}

function nonCompletedRefusalLines(plan: Extract<OperatorPlan, { kind: 'BATCHES' }>): string[] {
  const lines = [
    `Refused before any provider invocation or classifier write: requested attempt ` +
      `${plan.attemptNo} already exists in a non-completed state for at least one batch.`,
  ];
  for (const batch of plan.batches) {
    if (batch.state !== 'ATTEMPT_ALREADY_EXISTS_NON_COMPLETED') continue;
    lines.push(
      `  batch ${batch.batchIndex}: attempt ${plan.attemptNo} exists as ${batch.persistedState}` +
        ` (call ${batch.existingCallId ?? '?'}` +
        `${batch.existingErrorKind !== null ? `, error_kind ${batch.existingErrorKind}` : ''}).`,
    );
  }
  lines.push(
    'It will NOT be overwritten and will NOT be retried automatically. Inspect the persisted ' +
      'state first. A deliberate new observation requires you to choose a higher --attempt ' +
      'explicitly; whether one is appropriate is your decision.',
  );
  return lines;
}

function summariseResults(
  plan: Extract<OperatorPlan, { kind: 'BATCHES' }>,
  results: readonly ClassifierCallResult[],
): BatchExecutionSummary[] {
  return results.map((result, batchIndex) => {
    const documentCount = plan.batches[batchIndex]?.documentCount ?? 0;
    if (result.kind === 'NO_CANDIDATES') {
      // Unreachable once the plan saw batches; reported, never hidden.
      throw new Error('orgunits classify: the runtime found no candidates the plan had seen.');
    }
    const accepted = result.documents.filter((d) => !d.rejected).length;
    if (result.kind === 'REUSED') {
      return {
        batchIndex,
        kind: 'REUSED',
        callId: result.callId,
        terminalState: 'COMPLETED',
        errorKind: null,
        documentCount,
        acceptedCount: accepted,
        rejectedCount: documentCount - accepted,
        repairCount: 0,
        repairedAcceptedCount: 0,
      };
    }
    return {
      batchIndex,
      kind: 'EXECUTED',
      callId: result.callId,
      terminalState: result.terminalState,
      errorKind: result.errorKind,
      documentCount,
      acceptedCount: accepted,
      rejectedCount: result.documents.filter((d) => d.rejected).length,
      repairCount: result.repairs.length,
      repairedAcceptedCount: result.repairs.filter((r) => r.disposition === 'ACCEPTED').length,
    };
  });
}

/**
 * THE TESTABLE CORE. Every capability arrives through `deps`; nothing here
 * reads `process.env`, opens a pool of its own, or names a production
 * provider runner.
 */
export async function executeClassifyCommand(
  options: ClassifyOptions,
  deps: ClassifyDependencies,
): Promise<number> {
  const fail = (message: string): number => {
    deps.stderr(`ERROR ${message}\n`);
    return 1;
  };
  const emit = (value: unknown, human: readonly string[]): void => {
    deps.stdout(options.json ? `${JSON.stringify(value, null, 2)}\n` : `${human.join('\n')}\n`);
  };

  const parsed = parseClassifyArguments(options);
  if (!parsed.ok) return fail(parsed.message);
  const args = parsed.value;
  const mode = options.execute ? 'EXECUTE' : 'DRY_RUN';

  // Row-less, network-free, DB-free preflight over the caller's snapshot.
  const preflight = preflightSummary(
    runClassifierPreflight({
      env: deps.env,
      repoRoot: deps.repoRoot,
      modelId: args.modelId,
      runConfig: CLASSIFIER_OPERATOR_RUN_CONFIG,
    }),
  );
  if (!preflight.ok && (options.execute || preflight.kind === 'MODEL_NOT_ALLOWED')) {
    return fail(`classifier preflight refused (${preflight.kind}): ${preflight.detail}`);
  }

  // PHASE A - research role, completion gate only. The pool is closed on return.
  const runCompletion: RunCompletionStatus = await deps.withResearchPool((pool) =>
    checkRunCompleted(pool, args.runId),
  );
  if (runCompletion.status !== 'COMPLETED') {
    return fail(
      `research run ${args.runId} is ${runCompletion.status}, not COMPLETED; ` +
        `classification refuses before any assembly, provider call or write.`,
    );
  }

  // PHASE B - classifier role: plan (read-only), then execute only when authorised.
  return deps.withClassifierPool(async (pool) => {
    let plan: OperatorPlan;
    try {
      plan = await planOrganisationClassification(pool, {
        organisationId: args.organisationId,
        runId: args.runId,
        runCompletion,
        modelId: args.modelId,
        attemptNo: args.attemptNo,
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : 'Error';
      const message = error instanceof Error ? error.message : String(error);
      return fail(`classifier assembly refused (${name}): ${message}`);
    }

    const header = {
      mode,
      organisationId: args.organisationId,
      runId: args.runId,
      modelId: args.modelId,
      attemptNo: args.attemptNo,
      researchRunStatus: runCompletion.status,
      ...VERSIONS,
      repairPolicy: 'DISABLED' as const,
    };
    const headerLines = [
      `${mode} orgunits classify: organisation ${args.organisationId}, run ${args.runId}`,
      `  model ${args.modelId}, attempt ${args.attemptNo}, research run ${runCompletion.status}`,
      `  classifier ${VERSIONS.classifierVersion}, prompt ${VERSIONS.promptVersion}, ` +
        `schema ${VERSIONS.outputSchemaVersion}, repair DISABLED`,
    ];

    if (!options.execute) {
      const batches = plan.kind === 'BATCHES' ? plan.batches : [];
      const executionPermitted = plan.kind === 'NO_CANDIDATES' || plan.executionPermitted;
      const wouldStart = preflight.ok && executionPermitted;
      const note =
        'DRY RUN: no provider was constructed or invoked, no auth-status check ran, no ' +
        'scratch workspace was created, and no classifier call, completion or ' +
        'classification row was written. Pass --execute to run for real.';
      emit(
        {
          ...header,
          assemblyStatus: plan.kind,
          batchCount: batches.length,
          totalDocumentCount: batches.reduce((sum, b) => sum + b.documentCount, 0),
          batches: batches.map((b) => ({
            batchIndex: b.batchIndex,
            documentCount: b.documentCount,
            inputSha256: b.inputSha256,
            planState: b.state,
            persistedState: b.persistedState,
            existingCallId: b.existingCallId,
            existingErrorKind: b.existingErrorKind,
          })),
          executionPreflight: preflight,
          executionPermitted,
          providerCalls: 0,
          classifierWrites: 0,
          note,
        },
        [
          ...headerLines,
          `  assembly ${plan.kind}: ${batches.length} batch(es), ` +
            `${batches.reduce((sum, b) => sum + b.documentCount, 0)} document(s)`,
          ...batches.map(
            (b) =>
              `  batch ${b.batchIndex}: ${b.state} (${b.documentCount} document(s), ` +
              `persisted ${b.persistedState}${b.existingCallId !== null ? `, call ${b.existingCallId}` : ''})`,
          ),
          preflight.ok
            ? '  execution preflight: PASS'
            : `  execution preflight: REFUSED (${preflight.kind}): ${preflight.detail}`,
          ...(plan.kind === 'BATCHES' && !plan.executionPermitted
            ? nonCompletedRefusalLines(plan)
            : []),
          note,
        ],
      );
      // Exit 0 exactly when an --execute with the same arguments would be
      // permitted to START.
      return wouldStart ? 0 : 1;
    }

    if (plan.kind === 'NO_CANDIDATES') {
      emit({ ...header, result: 'NO_CANDIDATES', batches: [], providerCalls: 0 }, [
        ...headerLines,
        '  NO_CANDIDATES: nothing eligible to classify; no provider call, no write.',
      ]);
      return 0;
    }

    if (!plan.executionPermitted) {
      const lines = nonCompletedRefusalLines(plan);
      for (const line of lines) deps.stderr(`ERROR ${line}\n`);
      return 1;
    }

    const provider = plan.requiresProvider ? await deps.createProvider() : PROVIDER_NOT_REQUIRED;
    const results = await runOrganisationClassification(pool, {
      organisationId: args.organisationId,
      runId: args.runId,
      runCompletion,
      modelId: args.modelId,
      provider,
      requestConfig: CLASSIFIER_OPERATOR_REQUEST_CONFIG,
      runConfig: CLASSIFIER_OPERATOR_RUN_CONFIG,
      attemptNo: args.attemptNo,
      repairPolicy: CLASSIFIER_OPERATOR_REPAIR_POLICY,
    });
    if (results.length !== plan.batches.length) {
      return fail(
        `the runtime returned ${results.length} batch result(s) where the plan had ` +
          `${plan.batches.length}; persisted rows are kept as written. Inspect before re-running.`,
      );
    }

    const summaries = summariseResults(plan, results);
    const allCompleted = summaries.every((s) => s.terminalState === 'COMPLETED');
    emit({ ...header, result: allCompleted ? 'COMPLETED' : 'NOT_COMPLETED', batches: summaries }, [
      ...headerLines,
      ...summaries.map(
        (s) =>
          `  batch ${s.batchIndex}: ${s.kind} call ${s.callId} ${s.terminalState ?? ''}` +
          `${s.errorKind !== null ? ` (${s.errorKind})` : ''}: ${s.acceptedCount}/` +
          `${s.documentCount} accepted, ${s.rejectedCount} rejected, ${s.repairCount} repair(s)`,
      ),
      ...(allCompleted
        ? []
        : [
            'At least one batch did not complete. Its rows are persisted as written ' +
              '(append-only; nothing is rolled back) and nothing is retried automatically.',
          ]),
    ]);
    return allCompleted ? 0 : 1;
  });
}

/**
 * THE PRODUCTION SHELL. The only place that names production pools, the
 * process environment and the production provider. The provider module is
 * imported DYNAMICALLY, on the execute path only, so a dry run never loads
 * the Agent SDK runtime surfaces at all.
 */
export async function runOrgunitsClassify(options: ClassifyOptions): Promise<number> {
  return executeClassifyCommand(options, {
    withResearchPool: (fn) => withPool('research', fn),
    withClassifierPool: (fn) => withPool('classifier', fn),
    env: { ...process.env },
    repoRoot: process.cwd(),
    createProvider: async () => {
      const { createProductionClassifierProvider } = await import('./classifyProvider.js');
      return createProductionClassifierProvider();
    },
    stdout: (text) => {
      process.stdout.write(text);
    },
    stderr: (text) => {
      process.stderr.write(text);
    },
  });
}
