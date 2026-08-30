/**
 * TYPED FAILURES for classifier handoff assembly.
 *
 * Every one of these is an invariant violation, an impossible provenance
 * state, or a precondition the caller failed to satisfy - never a case
 * this module papers over by silently omitting data. See CLAUDE.md's
 * standing rule: "Never guess a value" - a malformed or ambiguous input
 * here is a thrown error, not a best-effort payload.
 */

export class OrganisationNotFoundError extends Error {
  readonly code = 'ORGANISATION_NOT_FOUND';
  constructor(readonly organisationId: string) {
    super(`No organisation with id ${organisationId}.`);
    this.name = 'OrganisationNotFoundError';
  }
}

export class ResearchRunNotFoundError extends Error {
  readonly code = 'RESEARCH_RUN_NOT_FOUND';
  constructor(readonly runId: string) {
    super(`No orgunit_research_runs row with id ${runId}.`);
    this.name = 'ResearchRunNotFoundError';
  }
}

/**
 * The run exists but is not in a state classifier assembly may operate on.
 *
 * `nwf_classifier` holds no SELECT grant on
 * `orgunit_research_run_completions` (migration 0009 §17 - a deliberate
 * least-privilege boundary, not an oversight), so THIS MODULE cannot check
 * completion status itself. The caller must obtain a `RunCompletionStatus`
 * via `runStatus.ts`'s `checkRunCompleted` - using a pool for a role that
 * CAN read that table (`readonly` or `research`, never `classifier`) - and
 * pass it in. `assembleClassifierHandoff` throws this before touching the
 * database at all when that status is not `COMPLETED`.
 */
export class RunNotCompletedError extends Error {
  readonly code = 'RUN_NOT_COMPLETED';
  constructor(
    readonly runId: string,
    readonly status: 'FAILED' | 'ABORTED' | 'NO_COMPLETION_RECORDED',
  ) {
    super(`Run ${runId} is not eligible for classifier assembly (status: ${status}).`);
    this.name = 'RunNotCompletedError';
  }
}

/**
 * The organisation and the run disagree about which ECHE source row they
 * belong to. Structurally should never happen (one research run always
 * belongs to one organisation - ADR 0008 §10), so this is a genuine
 * "unexpected schema state" failure, not a data-quality nuance to smooth
 * over.
 */
export class OrganisationRunMismatchError extends Error {
  readonly code = 'ORGANISATION_RUN_MISMATCH';
  constructor(
    readonly organisationId: string,
    readonly runId: string,
    readonly organisationEcheRowKey: string,
    readonly runEcheRowKeys: readonly string[],
  ) {
    super(
      `Organisation ${organisationId} (eche_row_key ${organisationEcheRowKey}) does not match ` +
        `run ${runId}'s own evidence (eche_row_key(s): ${runEcheRowKeys.join(', ')}).`,
    );
    this.name = 'OrganisationRunMismatchError';
  }
}

/**
 * A persisted `orgunit_page_candidates.track` value outside the two this
 * ruleset produces. `STUDENT_ASSOCIATION` is a reserved, currently-unused
 * enum member (ADR 0008 §3) - encountering it here would mean either a
 * future ruleset started producing it without this module being updated, or
 * genuinely corrupt data. Either way, guessing a mapping would misrepresent
 * a capability that does not exist.
 */
export class UnexpectedTrackValueError extends Error {
  readonly code = 'UNEXPECTED_TRACK_VALUE';
  constructor(
    readonly candidateId: string,
    readonly track: string,
  ) {
    super(`orgunit_page_candidates ${candidateId} carries unrecognised track "${track}".`);
    this.name = 'UnexpectedTrackValueError';
  }
}

/**
 * An eligible candidate's underlying fetch observation has no
 * `response_sha256`. Page evidence is only ever persisted for a genuine 2xx
 * HTML response whose body was successfully read (`pageEvidence.ts`), and a
 * successful body read always yields a hash (`gateway.ts`) - so this
 * invariant is expected to hold by construction, not merely hoped for. If
 * it is ever violated, exact-content dedupe has no signal to key on and
 * this module refuses to invent a fuzzy substitute (design §3: dedupe is
 * exact-content only).
 */
export class MissingResponseShaError extends Error {
  readonly code = 'MISSING_RESPONSE_SHA';
  constructor(
    readonly candidateId: string,
    readonly pageEvidenceId: string,
  ) {
    super(
      `Candidate ${candidateId} (page evidence ${pageEvidenceId}) has page evidence but its ` +
        `fetch observation carries no response_sha256; exact-content dedupe cannot proceed.`,
    );
    this.name = 'MissingResponseShaError';
  }
}

/**
 * A persisted `signals` array element is missing a field this module
 * requires (`id`, `kind`, `field`) or carries a `kind` outside the closed
 * set `signals/types.ts` defines. Defensive: every code path that writes
 * `orgunit_page_candidates.signals` today produces well-formed
 * `MatchedSignal` objects, but this column has no CHECK constraining
 * element shape (it is JSONB, constrained only to be an array), so a reader
 * must not assume the shape rather than verify it.
 */
/**
 * A single document's tentative batch already exceeds a hard bound before
 * any sibling document was even added. Given the per-document field bounds
 * (title <= 1,000, headings <= 12 x 200, excerpt <= 2,000 code points), this
 * is not expected to be reachable in practice - it exists so an overflow
 * split that somehow cannot converge fails loudly rather than silently
 * emitting a payload larger than the design's ceiling.
 */
export class PayloadBoundExceededError extends Error {
  readonly code = 'PAYLOAD_BOUND_EXCEEDED';
  constructor(
    readonly url: string,
    readonly canonicalCodePoints: number,
  ) {
    super(
      `Document ${url} alone produces a ${canonicalCodePoints}-code-point batch, exceeding the ` +
        `bound even in isolation.`,
    );
    this.name = 'PayloadBoundExceededError';
  }
}

export class MalformedSignalError extends Error {
  readonly code = 'MALFORMED_SIGNAL';
  constructor(
    readonly candidateId: string,
    readonly reason: string,
  ) {
    super(`Candidate ${candidateId} carries a malformed signal: ${reason}`);
    this.name = 'MalformedSignalError';
  }
}
