/**
 * The Methodology V2 R3 ATTEMPT-CONSUMPTION rule, as executable code.
 *
 * R2 said an INADMISSIBLE study "measured nothing about the candidate", and
 * therefore that the frozen candidate could always be re-run. That is too
 * broad: an attempt can go INADMISSIBLE *after* semantic execution has begun
 * - a provider dying part-way, a stability replicate terminating, or a
 * realised denominator that is infeasible only because of what the candidate
 * predicted. Those attempts HAVE measured the candidate, and refunding them
 * would hand a prompt author unlimited attempts against a sealed split by the
 * simple expedient of a study that fails late.
 *
 * R3 therefore keys consumption on one monotonic boundary,
 * `SEMANTIC_ATTEMPT_STARTED`, and this module is that rule in a form a test
 * can execute rather than a paragraph a reader can interpret.
 *
 * THE BOUNDARY IS NOT NEW. It is the Methodology V2 name for the already
 * frozen F0V predeclared inclusion rule, CLASS C
 * (`PROVIDER_REQUEST_OR_SEMANTIC_EXECUTION_OBSERVED`), whose implementation
 * lives in `../f0w/sequencing.ts`. R3 adopts it rather than defining a second,
 * incompatible irrevocability rule.
 *
 * WHY POSITIVE EVIDENCE, AND NOT "A CALL ROW EXISTS". A pre-request record -
 * an `orgunit_classifier_calls` row, or a passing child preflight - is written
 * strictly BEFORE the provider is invoked, so it records an INTENT to
 * dispatch, not a dispatch. Two paths leave one behind having issued nothing:
 * a provider pre-flight/auth refusal, and a bounded repair whose budget
 * decides SKIP. Treating that record as the boundary is not hypothetical: an
 * earlier implementation did exactly that, and on 2026-09-16 the first real
 * F0X study invocation spent all ten candidate slots on ten children that had
 * refused at their own freeze stage with `providerConstructed: false` and zero
 * provider requests. The boundary sits where that incident proved it belongs.
 *
 * EVALUATION / DESIGN TOOLING, NOT PRODUCTION CODE. PURE: no network, no
 * database, no filesystem, no clock, no environment, no `Math.random`, no
 * `Date.now`, and no imports of any kind. Nothing here authorises anything;
 * the frozen rule it encodes is
 * `docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL_R3.json`,
 * which is a PROPOSAL.
 */

/** Whether a real semantic request has provably occurred for one attempt. */
export type SemanticAttemptState = 'STARTED' | 'NOT_STARTED' | 'AMBIGUOUS';

/** The terminal outcome of one evaluated attempt. */
export type TerminalOutcome = 'ACCEPT' | 'REJECT' | 'INADMISSIBLE';

/**
 * What the attempt cost. `BLOCKED` is not a third kind of cost: it is the
 * refusal to decide, pending owner adjudication.
 */
export type AttemptDisposition = 'CONSUMED' | 'NOT_CONSUMED' | 'BLOCKED';

/**
 * Durable evidence about one attempt, as the two record systems actually
 * expose it. The production classifier writes Postgres rows; the study
 * harness writes write-once JSON artifacts and touches no database. An
 * attempt is STARTED if EITHER system shows execution.
 */
export interface DurableAttemptEvidence {
  /**
   * A pre-request record exists: an `orgunit_classifier_calls` row, or a
   * child preflight that passed. NECESSARY for a request to have been issued,
   * but NOT SUFFICIENT - it is written before the provider is invoked.
   */
  readonly preRequestRecordExists: boolean;
  /**
   * Positive evidence of execution: an accepted semantic output, a
   * non-pre-inference completion, or any member of the harness's
   * `SEMANTIC_EXECUTION_MARKER_FILE_NAMES`.
   */
  readonly semanticExecutionMarkerObserved: boolean;
  /**
   * A confirmed pre-inference refusal: the provider was never constructed and
   * no request left the process. This is the only way to prove absence.
   */
  readonly confirmedPreInferenceRefusal: boolean;
  /** Recorded provider requests, where the count is observable. */
  readonly recordedProviderRequests: number;
}

/**
 * Resolve the boundary from durable evidence.
 *
 * Three-valued on purpose. No durable record is written at the instant a
 * request is issued, so between the last pre-request record and the first
 * post-response marker there is a window spanning the whole network call in
 * which a crash leaves no trace either way. Guessing there is indefensible in
 * both directions: auto-consuming re-creates the 2026-09-16 incident, and
 * auto-refunding is the loophole R3 exists to close. The rule refuses, and
 * says so.
 */
export function resolveSemanticAttemptState(
  evidence: DurableAttemptEvidence,
): SemanticAttemptState {
  if (evidence.semanticExecutionMarkerObserved || evidence.recordedProviderRequests > 0) {
    return 'STARTED';
  }
  if (evidence.confirmedPreInferenceRefusal && evidence.recordedProviderRequests === 0) {
    return 'NOT_STARTED';
  }
  if (!evidence.preRequestRecordExists) {
    // Nothing was ever set up, so nothing could have been dispatched.
    return 'NOT_STARTED';
  }
  // Set up, not confirmed refused, no marker: the durability gap.
  return 'AMBIGUOUS';
}

/**
 * What one attempt cost, given the boundary and the terminal outcome.
 *
 * Consumption is a function of the BOUNDARY alone. The terminal outcome does
 * not decide it - ACCEPT and REJECT merely imply the boundary was crossed,
 * which is asserted rather than assumed.
 */
export function classifyAttempt(input: {
  readonly state: SemanticAttemptState;
  readonly outcome: TerminalOutcome;
}): AttemptDisposition {
  if (input.state === 'AMBIGUOUS') return 'BLOCKED';
  if (input.state === 'STARTED') return 'CONSUMED';
  if (input.outcome !== 'INADMISSIBLE') {
    throw new Error(
      `${input.outcome} is unreachable without semantic execution: a study cannot be accepted or rejected on evidence it never gathered`,
    );
  }
  return 'NOT_CONSUMED';
}

/** `PRE_SEMANTIC_INADMISSIBLE` / `POST_SEMANTIC_INADMISSIBLE`, named. */
export function inadmissibilityClass(
  state: SemanticAttemptState,
): 'PRE_SEMANTIC_INADMISSIBLE' | 'POST_SEMANTIC_INADMISSIBLE' | 'UNRESOLVED' {
  if (state === 'NOT_STARTED') return 'PRE_SEMANTIC_INADMISSIBLE';
  if (state === 'STARTED') return 'POST_SEMANTIC_INADMISSIBLE';
  return 'UNRESOLVED';
}

/**
 * May this exact candidate run again against this split?
 *
 * Only after a PRE-semantic refusal, and only byte-identically: a changed
 * prompt version, schema version or request-configuration hash is a different
 * candidate, not a retry (structural precondition S6).
 */
export function mayRetrySameCandidate(input: {
  readonly disposition: AttemptDisposition;
  readonly candidateHashUnchanged: boolean;
  readonly preSemanticDefectRepaired: boolean;
}): boolean {
  if (input.disposition !== 'NOT_CONSUMED') return false;
  return input.candidateHashUnchanged && input.preSemanticDefectRepaired;
}

/**
 * A realised-denominator failure derived from candidate outputs - G3
 * unit-page precision above all, whose denominator counts the items the
 * candidate ANSWERED `UNIT_PAGE`.
 *
 * It is POST-SEMANTIC by definition and is explicitly NOT a harness-only
 * failure. Without this, a candidate could dodge precision forever by
 * predicting `UNIT_PAGE` almost never: the gate would go inadmissible, the
 * attempt would be refunded, and the author could iterate against a sealed
 * split at no cost.
 */
export function classifyRealisedDenominatorFailure(input: {
  readonly denominatorIsCandidateDetermined: boolean;
}): { readonly outcome: TerminalOutcome; readonly disposition: AttemptDisposition } {
  if (!input.denominatorIsCandidateDetermined) {
    throw new Error(
      'a realised denominator is only knowable after execution; a denominator that is not candidate-determined still fails S3 post-semantically',
    );
  }
  return { outcome: 'INADMISSIBLE', disposition: 'CONSUMED' };
}

/** The DEV_CONFIRM three-attempt budget: monotonic, and it never decrements. */
export class DevConfirmBudget {
  static readonly MAX_CONSUMED_ATTEMPTS = 3;

  #consumed = 0;
  #blocked = 0;

  get consumedAttemptCount(): number {
    return this.#consumed;
  }

  get blockedAttemptCount(): number {
    return this.#blocked;
  }

  get closed(): boolean {
    return this.#consumed >= DevConfirmBudget.MAX_CONSUMED_ATTEMPTS;
  }

  /** `METHODOLOGY_GENERATION_CLOSED` once three attempts have been consumed. */
  get state(): 'OPEN' | 'METHODOLOGY_GENERATION_CLOSED' {
    return this.closed ? 'METHODOLOGY_GENERATION_CLOSED' : 'OPEN';
  }

  record(disposition: AttemptDisposition): void {
    if (this.closed) {
      throw new Error(
        'METHODOLOGY_GENERATION_CLOSED: no fourth consumed attempt is evaluated against this generation under any circumstance',
      );
    }
    if (disposition === 'CONSUMED') this.#consumed += 1;
    if (disposition === 'BLOCKED') this.#blocked += 1;
  }
}

/** The one-shot FINAL_HOLDOUT. Retirement is irreversible. */
export class FinalHoldoutState {
  #retired = false;

  get retired(): boolean {
    return this.#retired;
  }

  /**
   * Record one attempt. The HOLDOUT retires the moment a semantic attempt is
   * made against it, at terminal closure, whatever the outcome - ACCEPT,
   * REJECT or INADMISSIBLE alike. A pre-semantic refusal leaves it intact.
   */
  record(input: {
    readonly state: SemanticAttemptState;
    readonly outcome: TerminalOutcome;
  }): AttemptDisposition {
    if (this.#retired) {
      throw new Error(
        'the FINAL_HOLDOUT is RETIRED: no second semantic attempt, no replacement candidate, no threshold change and no prompt change may be run against it',
      );
    }
    const disposition = classifyAttempt(input);
    if (disposition === 'CONSUMED') this.#retired = true;
    return disposition;
  }
}

/**
 * The disclosure surface for one attempt. Exactly the two procedural tokens
 * the owner approved, and nothing else: no item, organisation, evaluation,
 * partial output, per-item denominator or item-level failure reason.
 */
export interface AttemptDisclosure {
  readonly terminalOutcome: TerminalOutcome;
  readonly consumption: AttemptDisposition;
}

export function discloseAttempt(input: {
  readonly terminalOutcome: TerminalOutcome;
  readonly consumption: AttemptDisposition;
  readonly coarseStructuralReason?: string;
  readonly sealedItemId?: string;
  readonly failingOrganisation?: string;
  readonly realisedDenominator?: number;
}): AttemptDisclosure {
  // Everything except the two tokens is dropped here, by construction: a
  // caller cannot widen the surface by passing more.
  return { terminalOutcome: input.terminalOutcome, consumption: input.consumption };
}
