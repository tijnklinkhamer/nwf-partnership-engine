/**
 * PHASE 2B-2D2C-F7 — THE HOST-AWAKE GATE, AS WIRED INTO F6 EXECUTION.
 *
 * `f6/hostAwakePreflightF6.ts` holds the frozen contract and its pure
 * evaluation of captured host observations. This module turns that record
 * into the execution GATE the F7 executor applies — before any candidate is
 * consumed, any child is launched or any provider exists:
 *
 *   - every refusal the frozen preflight reports refuses: not darwin, no
 *     process lineage, assertions unreadable, no caffeinate
 *     PreventUserIdleSystemSleep assertion on behalf of THIS process or an
 *     ancestor, or the lid observed CLOSED;
 *   - the lid state is SURFACED as observed, and an unreadable state is
 *     surfaced as UNKNOWN — never fabricated as OPEN;
 *   - the operator precondition LID_OPEN_REQUIRED must be explicitly
 *     confirmed for every gated run. The freeze says a lid observation never
 *     waives it, so the confirmation is required whether the lid reads OPEN or
 *     UNKNOWN; a CLOSED reading refuses even with a confirmation.
 *
 * Battery power stays an ADVISORY, exactly as frozen. The gate reads no
 * timeout, retry, watchdog, model or reliability value and changes none: it
 * can only refuse, never alter what a granted run does. `caffeinate` does NOT
 * make lid-close sleep safe, and nothing here claims it does.
 *
 * PURE. Observations in, decision out.
 */
import {
  evaluateHostAwakePreflight,
  LID_OPEN_REQUIRED,
  type HostAwakeObservations,
  type HostAwakePreflightRecord,
  type HostAwakeRefusal,
} from '../f6/hostAwakePreflightF6.js';

export type F7HostAwakeGateRefusal = HostAwakeRefusal | 'OPERATOR_LID_OPEN_CONFIRMATION_ABSENT';

export interface F7HostAwakeGateDecision {
  readonly granted: boolean;
  /** OPEN or CLOSED as reliably observed; UNKNOWN when it could not be read. Never guessed. */
  readonly lidState: 'OPEN' | 'CLOSED' | 'UNKNOWN';
  readonly operatorLidOpenConfirmation: typeof LID_OPEN_REQUIRED | null;
  readonly refusals: readonly F7HostAwakeGateRefusal[];
  readonly record: HostAwakePreflightRecord;
}

export function evaluateF7HostAwakeGate(
  observations: HostAwakeObservations,
  operatorLidOpenConfirmation: string | null,
): F7HostAwakeGateDecision {
  const record = evaluateHostAwakePreflight(observations);
  const confirmed = operatorLidOpenConfirmation === LID_OPEN_REQUIRED;
  const refusals: F7HostAwakeGateRefusal[] = [...record.refusals];
  if (!confirmed) refusals.push('OPERATOR_LID_OPEN_CONFIRMATION_ABSENT');
  return {
    granted: refusals.length === 0 && record.verdict === 'HOST_AWAKE_PREFLIGHT_PASSED',
    lidState: record.lidObservation === 'UNREADABLE' ? 'UNKNOWN' : record.lidObservation,
    operatorLidOpenConfirmation: confirmed ? LID_OPEN_REQUIRED : null,
    refusals,
    record,
  };
}

/** One line naming why a host-awake gate refused. */
export function describeF7HostAwakeRefusal(decision: F7HostAwakeGateDecision): string {
  return (
    `HOST_AWAKE refused (${decision.refusals.join(', ')}); lid ${decision.lidState}, ` +
    `power ${decision.record.powerSource}, covering assertions [${decision.record.coveringCaffeinateAssertionTypes.join(', ')}].`
  );
}
