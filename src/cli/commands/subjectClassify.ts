/**
 * `nwf-pe orgunits subjects classify --subject-admission-id <uuid> --run-id <uuid>
 *   --model <id> [--attempt <N>] [--execute] [--json]`
 * - CLASSIFY ONE SUBJECT-ROOTED RESEARCH RUN (R3P3-A, ADR 0031, Proposed).
 *
 * The subject counterpart of `orgunits classify` (the ECHE operator entry
 * point, `classify.ts`, unchanged), built in the same order, for exactly ONE
 * explicit admission and ONE explicit, COMPLETED run of that admission, with
 * ONE explicit allowed model at ONE explicit attempt (default 1):
 *
 *   1. argument bounds (no I/O);
 *   2. the PURE classifier preflight (`runClassifierPreflight`) - the same
 *      Claude-Max-only rules: conflicting auth variables, setup-token,
 *      profile path, the closed model allowlist. With `--execute` any
 *      refusal stops here; an unknown model stops here in every mode;
 *   3. the evaluation-cohort registry (the SAME pinned artifacts the ECHE
 *      guard reads), refused when unverifiable - in every mode;
 *   4. phase A, RESEARCH role: the admission (exists, unrevoked,
 *      OPERATIONAL), the run (this admission's, COMPLETED), the cohort facts
 *      and the rule (`subjectClassify/cohort.ts`), then the subject handoff
 *      assembly (`subjectClassifierHandoff/assemble.ts`, unchanged);
 *   5. phase B, CLASSIFIER role: each batch's exact identity at the requested
 *      attempt; ONE non-completed collision refuses the whole start;
 *   6. only then, and only with `--execute`, the production provider is
 *      constructed (only when a batch needs a NEW call) and the calls run.
 *
 * DRY RUN BY DEFAULT: no provider is constructed or invoked and nothing is
 * written. There is no default admission, run or model, no "latest run", no
 * sweep, no automatic attempt increment, no repair, no provider tuning and no
 * research chaining.
 *
 * NO INSTITUTIONAL NETWORK. Classification reads persisted page evidence
 * only; this file imports nothing under `orgunits/web/`. OUTPUT IS BOUNDED:
 * ids, states, versions and counts - never page text, prompt text, the
 * serialised batch, raw model output, the environment or a credential.
 */
import { parseArgs } from 'node:util';

import type pg from 'pg';

import { withPool } from '../../db/client.js';
import {
  loadEvaluationCohortRegistry,
  type RegistryLoadResult,
} from '../../orgunits/classify/evaluationCohortGuard.js';
import { runClassifierPreflight } from '../../orgunits/classify/provider/preflight.js';
import type { ClassifierProvider } from '../../orgunits/classify/providerContract.js';
import {
  SubjectClassifierHandoffRefusal,
  assembleSubjectClassifierHandoff,
} from '../../orgunits/subjectClassifierHandoff/assemble.js';
import {
  SubjectClassificationRefusal,
  readSubjectClassificationAuthority,
} from '../../orgunits/subjectClassify/authority.js';
import { evaluateSubjectCohortMembership } from '../../orgunits/subjectClassify/cohort.js';
import {
  SUBJECT_CLASSIFIER_VERSIONS,
  planSubjectClassification,
  runSubjectClassification,
} from '../../orgunits/subjectClassify/run.js';

export const SUBJECT_CLASSIFIER_OPERATOR_CONTRACT = 'nwf-pe.subject-classifier-operator.v1';

/** Every handled outcome, and whether it is a success (exit 0) or not (exit 1). */
export const SUBJECT_CLASSIFY_CODES = Object.freeze({
  INVALID_ARGUMENT: 1,
  PREFLIGHT_REFUSED: 1,
  COHORT_METADATA_UNVERIFIED: 1,
  AUTHORITY_REFUSED: 1,
  COHORT_REFUSED: 1,
  ASSEMBLY_REFUSED: 1,
  DRY_RUN_NO_CANDIDATES: 0,
  DRY_RUN_EXECUTION_PERMITTED: 0,
  DRY_RUN_EXECUTION_NOT_PERMITTED: 1,
  EXECUTE_NO_CANDIDATES: 0,
  ATTEMPT_ALREADY_EXISTS_NON_COMPLETED: 1,
  EXECUTE_COMPLETED: 0,
  EXECUTE_NOT_COMPLETED: 1,
  INTERNAL_ERROR: 1,
} as const);
export type SubjectClassifyCode = keyof typeof SUBJECT_CLASSIFY_CODES;

export interface SubjectClassifyOptions {
  readonly admissionId?: string;
  readonly runId?: string;
  readonly model?: string;
  readonly attempt?: string;
  readonly execute: boolean;
  readonly json: boolean;
}

/** Every capability, explicitly; no member has a default except the cohort loader (a file read). */
export interface SubjectClassifyDependencies {
  readonly withResearchPool: <T>(fn: (pool: pg.Pool) => Promise<T>) => Promise<T>;
  readonly withClassifierPool: <T>(fn: (pool: pg.Pool) => Promise<T>) => Promise<T>;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly repoRoot: string;
  /** Called at most once, only with `--execute`, only after every gate passed, only when needed. */
  readonly createProvider: () => Promise<ClassifierProvider>;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly loadCohortRegistry?: () => RegistryLoadResult;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_ATTEMPT_NO = 2_147_483_647;

const PROVIDER_NOT_REQUIRED: ClassifierProvider = {
  classify(): never {
    throw new Error('orgunits subjects classify: a fully reusable plan invoked the provider.');
  },
};

export async function executeSubjectClassifyCommand(
  options: SubjectClassifyOptions,
  deps: SubjectClassifyDependencies,
): Promise<number> {
  const respond = (
    code: SubjectClassifyCode,
    body: { readonly data?: unknown; readonly reason?: unknown },
    human: readonly string[],
  ): number => {
    const exitCode = SUBJECT_CLASSIFY_CODES[code];
    if (options.json) {
      deps.stdout(
        `${JSON.stringify({
          contract: SUBJECT_CLASSIFIER_OPERATOR_CONTRACT,
          command: 'SUBJECT_CLASSIFY',
          code,
          exitCode,
          ...body,
        })}\n`,
      );
    }
    const write = exitCode === 0 ? deps.stdout : deps.stderr;
    if (!options.json || exitCode !== 0) {
      for (const line of human) write(`${exitCode === 0 ? '' : 'ERROR '}${line}\n`);
    }
    return exitCode;
  };
  try {
    return await action(options, deps, respond);
  } catch (error) {
    const name = error instanceof Error ? error.name : 'Error';
    const message = error instanceof Error ? error.message : String(error);
    return respond('INTERNAL_ERROR', { reason: { kind: 'INTERNAL_ERROR' } }, [
      `orgunits subjects classify: internal failure (${name}): ${message}`,
    ]);
  }
}

type Respond = (
  code: SubjectClassifyCode,
  body: { readonly data?: unknown; readonly reason?: unknown },
  human: readonly string[],
) => number;

async function action(
  options: SubjectClassifyOptions,
  deps: SubjectClassifyDependencies,
  respond: Respond,
): Promise<number> {
  const invalid = (argument: string, problem: 'MISSING' | 'MALFORMED', line: string) =>
    respond('INVALID_ARGUMENT', { reason: { kind: 'INVALID_ARGUMENT', argument, problem } }, [
      line,
    ]);
  const admissionId = options.admissionId;
  if (admissionId === undefined || admissionId === '') {
    return invalid('subject-admission-id', 'MISSING', 'requires --subject-admission-id <uuid>.');
  }
  if (!UUID.test(admissionId)) {
    return invalid('subject-admission-id', 'MALFORMED', '--subject-admission-id must be one UUID.');
  }
  const runId = options.runId;
  if (runId === undefined || runId === '') {
    return invalid('run-id', 'MISSING', 'requires --run-id <uuid>; no run is chosen implicitly.');
  }
  if (!UUID.test(runId)) return invalid('run-id', 'MALFORMED', '--run-id must be one UUID.');
  const modelId = options.model;
  if (modelId === undefined || modelId === '') {
    return invalid('model', 'MISSING', 'requires --model <model-id>; there is no default model.');
  }
  let attemptNo = 1;
  if (options.attempt !== undefined) {
    const value = /^[1-9][0-9]*$/.test(options.attempt) ? Number(options.attempt) : Number.NaN;
    if (!Number.isSafeInteger(value) || value > MAX_ATTEMPT_NO) {
      return invalid('attempt', 'MALFORMED', '--attempt must be a positive integer (>= 1).');
    }
    attemptNo = value;
  }
  const mode = options.execute ? 'EXECUTE' : 'DRY_RUN';

  const preflight = runClassifierPreflight({
    env: deps.env,
    repoRoot: deps.repoRoot,
    modelId,
    runConfig: {},
  });
  if (!preflight.ok && (options.execute || preflight.kind === 'MODEL_NOT_ALLOWED')) {
    return respond(
      'PREFLIGHT_REFUSED',
      {
        reason: {
          kind: 'PREFLIGHT_REFUSED',
          preflightKind: preflight.kind,
          detail: preflight.detail,
        },
      },
      [`classifier preflight refused (${preflight.kind}): ${preflight.detail}`],
    );
  }

  const registry = (deps.loadCohortRegistry ?? loadEvaluationCohortRegistry)();
  if (!registry.ok) {
    return respond(
      'COHORT_METADATA_UNVERIFIED',
      { reason: { kind: registry.kind, detail: registry.detail } },
      [`evaluation-cohort metadata unverified: ${registry.detail}. Nothing was read or written.`],
    );
  }

  // PHASE A - research role: authority, the cohort rule, then assembly.
  const phaseA = await deps.withResearchPool(async (research) => {
    let authority;
    try {
      authority = await readSubjectClassificationAuthority(research, { admissionId, runId });
    } catch (error) {
      if (error instanceof SubjectClassificationRefusal) {
        return { kind: 'AUTHORITY_REFUSED', refusal: error } as const;
      }
      throw error;
    }
    const verdict = evaluateSubjectCohortMembership(registry.registry, authority.cohortFacts);
    if (verdict.kind !== 'ALLOWED_OUTSIDE_EVALUATION_FRAME') {
      return { kind: 'COHORT_REFUSED', verdict } as const;
    }
    try {
      const assembly = await assembleSubjectClassifierHandoff(research, { runId });
      return { kind: 'READY', authority, verdict, assembly } as const;
    } catch (error) {
      if (error instanceof SubjectClassifierHandoffRefusal) {
        return { kind: 'ASSEMBLY_REFUSED', refusal: error } as const;
      }
      throw error;
    }
  });
  if (phaseA.kind === 'AUTHORITY_REFUSED') {
    return respond(
      'AUTHORITY_REFUSED',
      { reason: { kind: 'AUTHORITY_REFUSED', refusal: phaseA.refusal.code } },
      [`subject classification refused (${phaseA.refusal.message}); nothing was written.`],
    );
  }
  if (phaseA.kind === 'ASSEMBLY_REFUSED') {
    return respond(
      'ASSEMBLY_REFUSED',
      { reason: { kind: 'ASSEMBLY_REFUSED', refusal: phaseA.refusal.code } },
      [`subject handoff assembly refused (${phaseA.refusal.message}); nothing was written.`],
    );
  }
  if (phaseA.kind === 'COHORT_REFUSED') {
    return respond(
      'COHORT_REFUSED',
      { reason: { kind: phaseA.verdict.kind, detail: phaseA.verdict.detail } },
      [
        `evaluation-cohort rule refused (${phaseA.verdict.kind}): ${phaseA.verdict.detail}. ` +
          'Nothing was written.',
      ],
    );
  }
  const { authority, verdict, assembly } = phaseA;
  const header = {
    mode,
    admissionId,
    subjectId: authority.subjectId,
    admissionBasis: authority.admissionBasis,
    runId,
    modelId,
    attemptNo,
    ...SUBJECT_CLASSIFIER_VERSIONS,
    repairPolicy: 'DISABLED' as const,
    cohort: verdict.kind,
  };
  const headerLines = [
    `${mode} orgunits subjects classify: admission ${admissionId} (subject ${authority.subjectId}, ` +
      `${authority.admissionBasis}), run ${runId}`,
    `  model ${modelId}, attempt ${attemptNo}, prompt ${SUBJECT_CLASSIFIER_VERSIONS.promptVersion}, ` +
      `assembly ${SUBJECT_CLASSIFIER_VERSIONS.classifierVersion}, repair DISABLED`,
    `  evaluation cohort: ${verdict.kind} (no ECHE evidence, ${verdict.proof.isolatedDomains} isolated domain(s))`,
  ];

  if (assembly.kind === 'NO_CANDIDATES') {
    return respond(
      options.execute ? 'EXECUTE_NO_CANDIDATES' : 'DRY_RUN_NO_CANDIDATES',
      { data: { ...header, assemblyStatus: 'NO_CANDIDATES', batches: [], providerCalls: 0 } },
      [
        ...headerLines,
        '  NO_CANDIDATES: nothing eligible to classify; no provider call, no write.',
      ],
    );
  }

  // PHASE B - classifier role.
  return deps.withClassifierPool(async (classifier) => {
    const plan = await planSubjectClassification(classifier, {
      batches: assembly.batches,
      modelId,
      attemptNo,
    });
    const batches = plan.batches.map((b) => ({
      batchIndex: b.batchIndex,
      documentCount: b.documentCount,
      inputSha256: b.inputSha256,
      planState: b.state,
      persistedState: b.persistedState,
      existingCallId: b.existingCallId,
      existingErrorKind: b.existingErrorKind,
    }));
    const planLines = batches.map(
      (b) =>
        `  batch ${b.batchIndex}: ${b.planState} (${b.documentCount} document(s), persisted ` +
        `${b.persistedState}${b.existingCallId !== null ? `, call ${b.existingCallId}` : ''})`,
    );

    if (!options.execute) {
      const wouldStart = preflight.ok && plan.executionPermitted;
      return respond(
        wouldStart ? 'DRY_RUN_EXECUTION_PERMITTED' : 'DRY_RUN_EXECUTION_NOT_PERMITTED',
        {
          data: {
            ...header,
            assemblyStatus: 'BATCHES',
            batches,
            executionPreflight: preflight.ok
              ? { ok: true }
              : { ok: false, kind: preflight.kind, detail: preflight.detail },
            executionPermitted: plan.executionPermitted,
            providerCalls: 0,
            classifierWrites: 0,
          },
        },
        [
          ...headerLines,
          ...planLines,
          preflight.ok
            ? '  execution preflight: PASS'
            : `  execution preflight: REFUSED (${preflight.kind})`,
          'DRY RUN: no provider was constructed or invoked and no classifier row was written. ' +
            'Pass --execute to run for real.',
        ],
      );
    }

    if (!plan.executionPermitted) {
      return respond(
        'ATTEMPT_ALREADY_EXISTS_NON_COMPLETED',
        { reason: { kind: 'ATTEMPT_ALREADY_EXISTS_NON_COMPLETED', attemptNo, batches } },
        [
          `refused before any provider call or write: attempt ${attemptNo} already exists in a ` +
            'non-completed state for at least one batch; choose a higher --attempt explicitly.',
          ...planLines,
        ],
      );
    }

    const provider = plan.requiresProvider ? await deps.createProvider() : PROVIDER_NOT_REQUIRED;
    const results = await runSubjectClassification(classifier, {
      admissionId,
      runId,
      batches: assembly.batches,
      modelId,
      attemptNo,
      provider,
    });
    const summaries = results.map((r, batchIndex) => {
      const accepted = r.documents.filter((d) => !d.rejected).length;
      return {
        batchIndex,
        kind: r.kind,
        callId: r.callId,
        terminalState: r.kind === 'REUSED' ? ('COMPLETED' as const) : r.terminalState,
        errorKind: r.kind === 'REUSED' ? null : r.errorKind,
        documentCount: plan.batches[batchIndex]?.documentCount ?? 0,
        acceptedCount: accepted,
      };
    });
    const allCompleted = summaries.every((s) => s.terminalState === 'COMPLETED');
    return respond(
      allCompleted ? 'EXECUTE_COMPLETED' : 'EXECUTE_NOT_COMPLETED',
      {
        data: {
          ...header,
          result: allCompleted ? 'COMPLETED' : 'NOT_COMPLETED',
          batches: summaries,
        },
      },
      [
        ...headerLines,
        ...summaries.map(
          (s) =>
            `  batch ${s.batchIndex}: ${s.kind} call ${s.callId} ${s.terminalState}` +
            `${s.errorKind !== null ? ` (${s.errorKind})` : ''}: ${s.acceptedCount}/${s.documentCount} accepted`,
        ),
        ...(allCompleted
          ? []
          : [
              'At least one batch did not complete; its rows are kept as written, nothing is retried.',
            ]),
      ],
    );
  });
}

/** Strict argument parse of the words after `orgunits subjects classify`. */
export function parseSubjectClassifyArgv(argv: readonly string[]): SubjectClassifyOptions {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: {
      'subject-admission-id': { type: 'string' },
      'run-id': { type: 'string' },
      model: { type: 'string' },
      attempt: { type: 'string' },
      execute: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
    },
  });
  if (positionals.length > 0) {
    throw new Error(`orgunits subjects classify takes no positional argument (${positionals[0]})`);
  }
  return {
    ...(values['subject-admission-id'] !== undefined
      ? { admissionId: values['subject-admission-id'] }
      : {}),
    ...(values['run-id'] !== undefined ? { runId: values['run-id'] } : {}),
    ...(values.model !== undefined ? { model: values.model } : {}),
    ...(values.attempt !== undefined ? { attempt: values.attempt } : {}),
    execute: values.execute === true,
    json: values.json === true,
  };
}

/**
 * THE PRODUCTION SHELL: production pools, the process environment and the
 * production Claude-Max provider (`classifyProvider.ts`, dynamically imported
 * on the execute path only, exactly as `classify.ts` does).
 */
export async function runSubjectClassifyCli(argv: readonly string[]): Promise<number> {
  let options: SubjectClassifyOptions;
  try {
    options = parseSubjectClassifyArgv(argv);
  } catch (error) {
    process.stderr.write(`ERROR ${error instanceof Error ? error.message : String(error)}\n`);
    process.stderr.write(
      'Usage: orgunits subjects classify --subject-admission-id <uuid> --run-id <uuid> ' +
        '--model <id> [--attempt <N>] [--execute] [--json]\n',
    );
    return 1;
  }
  return executeSubjectClassifyCommand(options, {
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
