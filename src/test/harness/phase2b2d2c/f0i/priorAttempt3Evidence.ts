/**
 * PHASE 2B-2D2C-F0K — WAS SEMANTIC ATTEMPT 3 ALREADY EXECUTED?
 *
 * The attempt-3 lock answers one question: were THESE authorisation bytes
 * already consumed? That is a PHYSICAL fact about one file under one output
 * root, and it is deliberately permanent. It is NOT the same question as
 * "did semantic attempt 3 already run?" — and on 2026-09-15 the difference
 * became load-bearing: the first attempt-3 authorisation was physically
 * consumed, and then the parent refused to build the child manifest because
 * its closed variant set had not been widened to admit the approved
 * `PROMPT_V4_CANONICAL`. Zero logical evaluations, zero provider requests,
 * zero adapter attempts, zero classifier responses, zero repairs. Semantic
 * attempt 3 had not happened.
 *
 * A replacement authorisation is therefore legitimate — but ONLY for that
 * reason, and only while it stays true. This module answers the semantic
 * question from the PRESERVED EVIDENCE ITSELF rather than from an operator's
 * say-so, by classifying the artifacts a prior attempt-3 output root holds:
 *
 *   - a root holding nothing but a consumption marker, an experiment
 *     manifest and planned inputs is a `PRE_INFERENCE_REFUSAL`: the run
 *     never reached the child, so nothing was inferred, and a replacement
 *     is permitted;
 *   - a root holding ANY artifact that only exists once the parent got past
 *     manifest construction — a child manifest, any child artifact, any
 *     provider or validation artifact, any repair artifact, a final record —
 *     is `SEMANTIC_EXECUTION_OBSERVED`, and a replacement is REFUSED. A
 *     child manifest alone is enough: from it, this module cannot prove that
 *     no request was made, and an unprovable negative is not a permission;
 *   - anything else — an unrecognised file, an artifact in an unexpected
 *     place — is `AMBIGUOUS`, and a replacement is REFUSED. Fail closed.
 *
 * It grants nothing on its own: a `PRE_INFERENCE_REFUSAL` verdict removes an
 * objection, it does not authorise a run. The owner's authorisation and the
 * full attempt-3 lock still have to pass.
 *
 * PURE aside from the injected probes. No network, no database, no clock, no
 * filesystem of its own, and it never writes, moves or deletes anything: the
 * refused invocation's evidence is immutable, and this module only reads the
 * SHAPE of it.
 */

/** Artifacts that can only exist once the parent got past child-manifest construction. */
const INFERENCE_CAPABLE_ARTIFACT_FILE_NAMES: readonly string[] = [
  'child-manifest.json',
  'child-preflight.json',
  'child-failure.json',
  'child-result.json',
  'raw-output-checkpoint.json',
  'validation-result.json',
  'provider-outcome.json',
  'tier1-diagnostics.json',
  'tier2-outcome.json',
  'stop-decision.json',
  'final-record.json',
  'experiment-completion.json',
  'repair-round.json',
  'repair-decision.json',
  'repair-request.json',
  'repair-raw-output-checkpoint.json',
  'repair-validation-result.json',
  'repair-provider-outcome.json',
  'repair-outcome.json',
];

/**
 * The three shapes a PRE-INFERENCE root may hold, and nothing else. Written
 * as explicit patterns rather than "any json under evaluations/" so that a
 * file in an unexpected place reads as AMBIGUOUS rather than as harmless.
 */
const PRE_INFERENCE_PATH_PATTERNS: readonly RegExp[] = [
  /^authorisations\/[0-9a-f]{64}\.json$/,
  /^experiments\/attempt-[1-9][0-9]*\/experiment-manifest\.json$/,
  /^evaluations\/[A-Z0-9_]+\/batch-[0-9]{2}\/attempt-[1-9][0-9]*\/planned-input\.json$/,
  // An experiment that halted before the first child still records why.
  /^experiments\/attempt-[1-9][0-9]*\/experiment-stop\.json$/,
];

export type PriorAttempt3Disposition =
  /** No prior attempt-3 output root exists at the named path (or it holds no file at all). */
  | 'NO_PRIOR_ATTEMPT_3_EVIDENCE'
  /** The prior invocation was refused before any child was forked: zero inference. */
  | 'PRE_INFERENCE_REFUSAL'
  /** The prior invocation got past manifest construction; semantic attempt 3 may have executed. */
  | 'SEMANTIC_EXECUTION_OBSERVED'
  /** The root holds something this module cannot account for. */
  | 'AMBIGUOUS';

export interface PriorAttempt3Probes {
  readonly isDirectory: (path: string) => boolean;
  /** Every FILE under `root`, as root-relative POSIX paths, in any order. */
  readonly listFilesRecursively: (root: string) => readonly string[];
}

export interface PriorAttempt3Classification {
  readonly root: string;
  readonly disposition: PriorAttempt3Disposition;
  readonly detail: string;
  /** The root-relative files the verdict was derived from, sorted; bounded for reporting. */
  readonly files: readonly string[];
  /** True ONLY for the two dispositions that prove no semantic attempt-3 execution happened. */
  readonly replacementPermitted: boolean;
}

const MAX_REPORTED_FILES = 20;

/**
 * Classifies a preserved prior attempt-3 output root. `root` is always an
 * explicit operator-named path: there is no default and no discovery, so
 * this check can never be silently skipped by omitting an argument.
 */
export function classifyPriorAttempt3Root(
  root: string,
  probes: PriorAttempt3Probes,
): PriorAttempt3Classification {
  const report = (
    disposition: PriorAttempt3Disposition,
    detail: string,
    files: readonly string[],
  ): PriorAttempt3Classification => ({
    root,
    disposition,
    detail,
    files: files.slice(0, MAX_REPORTED_FILES),
    replacementPermitted:
      disposition === 'NO_PRIOR_ATTEMPT_3_EVIDENCE' || disposition === 'PRE_INFERENCE_REFUSAL',
  });

  if (!probes.isDirectory(root)) {
    return report(
      'NO_PRIOR_ATTEMPT_3_EVIDENCE',
      'no directory exists at the named prior attempt-3 root, so it holds no evidence of any attempt-3 execution.',
      [],
    );
  }
  let files: readonly string[];
  try {
    files = [...probes.listFilesRecursively(root)].sort();
  } catch (error) {
    return report(
      'AMBIGUOUS',
      `the prior attempt-3 root could not be listed (${error instanceof Error ? error.message : String(error)}); an unreadable root is never read as "nothing happened".`,
      [],
    );
  }
  if (files.length === 0) {
    return report(
      'NO_PRIOR_ATTEMPT_3_EVIDENCE',
      'the named prior attempt-3 root is an empty directory.',
      [],
    );
  }
  const inferenceCapable = files.filter((file) =>
    INFERENCE_CAPABLE_ARTIFACT_FILE_NAMES.includes(file.slice(file.lastIndexOf('/') + 1)),
  );
  if (inferenceCapable.length > 0) {
    return report(
      'SEMANTIC_EXECUTION_OBSERVED',
      `the prior attempt-3 root holds ${inferenceCapable.length} artifact(s) that exist only once the parent got past child-manifest construction (${inferenceCapable.slice(0, 5).join(', ')}); this root is not a pre-inference refusal and may not be replaced.`,
      files,
    );
  }
  const unaccounted = files.filter(
    (file) => !PRE_INFERENCE_PATH_PATTERNS.some((pattern) => pattern.test(file)),
  );
  if (unaccounted.length > 0) {
    return report(
      'AMBIGUOUS',
      `the prior attempt-3 root holds ${unaccounted.length} file(s) this classifier cannot account for (${unaccounted.slice(0, 5).join(', ')}); an unexplained root is refused, never assumed harmless.`,
      files,
    );
  }
  return report(
    'PRE_INFERENCE_REFUSAL',
    `the prior attempt-3 root holds only a consumption marker, an experiment manifest and planned input(s) (${files.length} file(s)): the run was refused before any child was forked, so zero inference occurred and a replacement authorisation for semantic attempt 3 is not a second execution of it.`,
    files,
  );
}
