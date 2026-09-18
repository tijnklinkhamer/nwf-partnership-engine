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
 * A disposition that has actually settled what the attempt cost. `BLOCKED` is
 * excluded BY TYPE, because an unresolved block is not a cost - it is the
 * absence of an answer about the cost.
 */
export type ResolvedAttemptDisposition = 'CONSUMED' | 'NOT_CONSUMED';

/**
 * How an owner adjudication settles one BLOCKED attempt. `BLOCKED` is
 * deliberately absent: an adjudication that left the attempt blocked would not
 * be an adjudication, and would let a block be "resolved" into itself forever.
 */
export type BlockedAttemptAdjudication = ResolvedAttemptDisposition;

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

/** The adjudication a BLOCKED attempt resolves to when evidence cannot settle it. */
export const BLOCKED_ATTEMPT_ADJUDICATION_DEFAULT: BlockedAttemptAdjudication = 'CONSUMED';

/**
 * Adjudicate one BLOCKED attempt from whatever durable evidence exists LATER.
 *
 * The default runs toward spending the attempt. `NOT_CONSUMED` is returned
 * ONLY when the already-frozen NOT_STARTED condition is positively
 * established - a confirmed pre-inference refusal with zero recorded provider
 * requests and no execution marker. Evidence that is merely still silent
 * re-resolves to AMBIGUOUS, and an attempt whose cost cannot be established
 * is CONSUMED: the absence of positive request evidence is not evidence of
 * absence, and treating it as such is the loophole R3 exists to close.
 */
export function adjudicateBlockedAttemptFromEvidence(
  evidence: DurableAttemptEvidence,
): BlockedAttemptAdjudication {
  return resolveSemanticAttemptState(evidence) === 'NOT_STARTED'
    ? 'NOT_CONSUMED'
    : BLOCKED_ATTEMPT_ADJUDICATION_DEFAULT;
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

/**
 * The DEV_CONFIRM three-attempt budget: monotonic, it never decrements, and an
 * unresolved BLOCK halts it.
 *
 * STICKINESS IS THE POINT. "Neither counted nor released" is not a property of
 * one cell of a truth table; it is a property of the STATE MACHINE. A blocked
 * attempt that merely returned `BLOCKED` and then let the next `record()`
 * through would release the candidate for retry by doing nothing, which is
 * exactly the automatic refund R3 refuses to make. So the block is held here,
 * and only an explicit adjudication clears it.
 */
export class DevConfirmBudget {
  static readonly MAX_CONSUMED_ATTEMPTS = 3;

  #consumed = 0;
  #blocked = 0;
  #unresolvedBlock = false;

  get consumedAttemptCount(): number {
    return this.#consumed;
  }

  get blockedAttemptCount(): number {
    return this.#blocked;
  }

  /** Is an attempt halted, awaiting owner adjudication, right now? */
  get hasUnresolvedBlockedAttempt(): boolean {
    return this.#unresolvedBlock;
  }

  get closed(): boolean {
    return this.#consumed >= DevConfirmBudget.MAX_CONSUMED_ATTEMPTS;
  }

  /**
   * May ANY next attempt begin - a retry of the same candidate or a different
   * candidate alike? Both are refused while a block is unresolved.
   */
  get mayBeginNextAttempt(): boolean {
    return !this.closed && !this.#unresolvedBlock;
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
    if (this.#unresolvedBlock) {
      throw new Error(
        'DEV_CONFIRM_BLOCKED: an attempt is AMBIGUOUS and unadjudicated, so no next candidate and no retry of the same candidate may begin against this split until an owner adjudication classifies it',
      );
    }
    if (disposition === 'CONSUMED') this.#consumed += 1;
    if (disposition === 'BLOCKED') {
      this.#blocked += 1;
      this.#unresolvedBlock = true;
    }
  }

  /**
   * Settle the one unresolved BLOCKED attempt. One-shot: the block is cleared
   * by the first adjudication, so a second call finds nothing to adjudicate
   * and throws rather than incrementing the counter twice.
   */
  adjudicateBlockedAttempt(resolution: BlockedAttemptAdjudication): void {
    if (!this.#unresolvedBlock) {
      throw new Error(
        'NO_UNRESOLVED_BLOCKED_ATTEMPT: there is nothing to adjudicate, and an adjudication is never replayed against an attempt that has already been settled',
      );
    }
    this.#unresolvedBlock = false;
    if (resolution === 'CONSUMED') this.#consumed += 1;
  }
}

/** Where the one-shot instrument stands. There is no fourth value. */
export type FinalHoldoutAvailability = 'AVAILABLE' | 'BLOCKED' | 'RETIRED';

/**
 * The one-shot FINAL_HOLDOUT. Retirement is irreversible, and unresolved
 * ambiguity is PRESERVED rather than collapsed in either direction.
 *
 * BLOCKED is a real state here, not a returned label. An ambiguous attempt
 * leaves the instrument neither spent nor available: treating it as available
 * would hand a second semantic attempt to anyone whose first one crashed
 * inside the request window, and marking it RETIRED would spend a one-shot
 * instrument on a fault that may have issued no request at all.
 */
export class FinalHoldoutState {
  #availability: FinalHoldoutAvailability = 'AVAILABLE';

  get availability(): FinalHoldoutAvailability {
    return this.#availability;
  }

  get retired(): boolean {
    return this.#availability === 'RETIRED';
  }

  get hasUnresolvedBlockedAttempt(): boolean {
    return this.#availability === 'BLOCKED';
  }

  /** Only an AVAILABLE holdout may be attempted. BLOCKED is not available. */
  get available(): boolean {
    return this.#availability === 'AVAILABLE';
  }

  /**
   * Record one attempt. The HOLDOUT retires the moment a semantic attempt is
   * made against it, at terminal closure, whatever the outcome - ACCEPT,
   * REJECT or INADMISSIBLE alike. A pre-semantic refusal leaves it intact. An
   * AMBIGUOUS attempt BLOCKS it, and no further attempt of any kind may be
   * recorded until that block is adjudicated.
   */
  record(input: {
    readonly state: SemanticAttemptState;
    readonly outcome: TerminalOutcome;
  }): AttemptDisposition {
    if (this.#availability === 'RETIRED') {
      throw new Error(
        'the FINAL_HOLDOUT is RETIRED: no second semantic attempt, no replacement candidate, no threshold change and no prompt change may be run against it',
      );
    }
    if (this.#availability === 'BLOCKED') {
      throw new Error(
        'the FINAL_HOLDOUT is BLOCKED: an attempt is AMBIGUOUS and unadjudicated, so it is neither retired nor available - no semantic attempt, no retry of the same candidate and no other candidate may run against it until an owner adjudication classifies it',
      );
    }
    const disposition = classifyAttempt(input);
    if (disposition === 'CONSUMED') this.#availability = 'RETIRED';
    if (disposition === 'BLOCKED') this.#availability = 'BLOCKED';
    return disposition;
  }

  /**
   * Settle the BLOCKED attempt. `CONSUMED` retires the instrument
   * irreversibly; `NOT_CONSUMED` returns it to AVAILABLE, where only the SAME
   * byte-identical selected candidate may retry and every existing owner
   * authorisation requirement still applies. One-shot: the state leaves
   * BLOCKED on the first adjudication, so a second call throws.
   */
  adjudicateBlockedAttempt(resolution: BlockedAttemptAdjudication): FinalHoldoutAvailability {
    if (this.#availability !== 'BLOCKED') {
      throw new Error(
        `NO_UNRESOLVED_BLOCKED_ATTEMPT: the FINAL_HOLDOUT is ${this.#availability}, so there is nothing to adjudicate and an adjudication is never replayed`,
      );
    }
    this.#availability = resolution === 'CONSUMED' ? 'RETIRED' : 'AVAILABLE';
    return this.#availability;
  }
}

/**
 * The disclosure surface for one attempt. Exactly the two procedural tokens
 * the owner approved, and nothing else: no item, organisation, evaluation,
 * partial output, per-item denominator or item-level failure reason.
 */
export interface AttemptDisclosure {
  readonly terminalOutcome: TerminalOutcome;
  readonly consumption: ResolvedAttemptDisposition;
}

/**
 * Disclose one TERMINAL attempt.
 *
 * A BLOCKED attempt is NOT terminal, so it has no place here at all. The
 * consumption parameter is typed to the two resolved values and checked again
 * at runtime, because the alternative - pairing `BLOCKED` with some terminal
 * outcome - would fabricate a verdict for an attempt whose cost is precisely
 * what nobody yet knows. Blocked state travels the separate owner/audit
 * surface below, which the prompt developer never sees.
 */
export function discloseAttempt(input: {
  readonly terminalOutcome: TerminalOutcome;
  readonly consumption: ResolvedAttemptDisposition;
  readonly coarseStructuralReason?: string;
  readonly sealedItemId?: string;
  readonly failingOrganisation?: string;
  readonly realisedDenominator?: number;
}): AttemptDisclosure {
  if ((input.consumption as AttemptDisposition) === 'BLOCKED') {
    throw new Error(
      'BLOCKED is not a terminal disclosure: an AMBIGUOUS attempt has no terminal outcome and no settled consumption, and no terminal outcome may be fabricated for it',
    );
  }
  // Everything except the two tokens is dropped here, by construction: a
  // caller cannot widen the surface by passing more.
  return { terminalOutcome: input.terminalOutcome, consumption: input.consumption };
}

/**
 * The OWNER/AUDIT view of a halted attempt - deliberately not part of the
 * prompt-development terminal surface, and carrying no item, organisation,
 * denominator or candidate output of its own.
 */
export interface BlockedAttemptAudit {
  readonly attemptState: 'BLOCKED';
  readonly awaitingOwnerAdjudication: true;
  readonly adjudicationDefault: BlockedAttemptAdjudication;
  readonly countedAgainstBudget: false;
  readonly releasedForRetry: false;
}

export function describeBlockedAttempt(input?: {
  readonly coarseStructuralReason?: string;
  readonly sealedItemId?: string;
  readonly failingOrganisation?: string;
  readonly realisedDenominator?: number;
}): BlockedAttemptAudit {
  // `input` is accepted and discarded for exactly the reason `discloseAttempt`
  // discards its own extras: a caller must not be able to widen the surface.
  void input;
  return {
    attemptState: 'BLOCKED',
    awaitingOwnerAdjudication: true,
    adjudicationDefault: BLOCKED_ATTEMPT_ADJUDICATION_DEFAULT,
    countedAgainstBudget: false,
    releasedForRetry: false,
  };
}
