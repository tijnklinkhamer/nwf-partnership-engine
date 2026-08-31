/**
 * AUTH-STATUS EVALUATION — the PURE half of the request-free stored-login
 * check (ADR 0010 §13).
 *
 * `claude auth status --json` reports the LOCAL credential state of the
 * configuration directory it runs against; it makes no inference request.
 * The runner seam (`authStatusRunner.ts`) executes it under the sanitized
 * child environment and the dedicated profile; THIS module decides whether
 * the report authorises classifier inference. Required, every one fatal on
 * its own:
 *
 *   - `loggedIn`          === true
 *   - `authMethod`        === 'claude.ai'  (the stored subscription login;
 *                            'oauth_token' would mean the prohibited
 *                            setup-token env path somehow re-entered)
 *   - `apiProvider`       === 'firstParty'
 *   - `subscriptionType`  === 'max' WHEN the installed CLI reports it; an
 *                            absent field is tolerated (older CLIs), a
 *                            present non-max value is refused.
 *
 * SECRET AND IDENTITY HYGIENE: the report also carries identity fields
 * (email, organisation id/name). This module reads ONLY the four fields
 * above, and no detail string ever includes raw report output — an
 * unparseable report is described by exit code and byte length, never by
 * content (ADR 0010 §13: never print email, account ID, org ID or
 * credential content).
 *
 * PURE. No network, no database, no filesystem, no clock, no environment
 * read, no subprocess — callers supply the captured execution.
 */

/** The stored-subscription auth method the runtime requires. */
export const REQUIRED_AUTH_METHOD = 'claude.ai';
/** The first-party provider the runtime requires. */
export const REQUIRED_API_PROVIDER = 'firstParty';
/** The subscription type this owner deployment requires, when reported. */
export const REQUIRED_SUBSCRIPTION_TYPE = 'max';

export type AuthStatusFailureKind =
  | 'AUTH_STATUS_UNPARSEABLE'
  | 'NOT_LOGGED_IN'
  | 'WRONG_AUTH_METHOD'
  | 'WRONG_API_PROVIDER'
  | 'WRONG_SUBSCRIPTION_TYPE';

export type AuthStatusEvaluation =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly kind: AuthStatusFailureKind;
      /** Bounded, operator-facing. Never raw report output, never identity fields. */
      readonly detail: string;
    };

/** The captured result of one auth-status subprocess execution. */
export interface AuthStatusExecution {
  readonly exitCode: number | null;
  readonly stdout: string;
}

/** A checked field's received value, bounded and safe to name in a detail. */
function describeReceived(value: unknown): string {
  if (typeof value !== 'string') return `a ${typeof value} value`;
  return JSON.stringify(value.length > 60 ? `${value.slice(0, 57)}...` : value);
}

export function evaluateAuthStatus(execution: AuthStatusExecution): AuthStatusEvaluation {
  let report: unknown;
  try {
    report = JSON.parse(execution.stdout);
  } catch {
    report = undefined;
  }
  if (report === undefined || report === null || typeof report !== 'object') {
    return {
      ok: false,
      kind: 'AUTH_STATUS_UNPARSEABLE',
      detail:
        `refused: \`claude auth status --json\` did not produce a JSON object ` +
        `(exit code ${execution.exitCode ?? 'null'}, ${execution.stdout.length} stdout ` +
        `bytes). Its output is not echoed here.`,
    };
  }

  const status = report as Record<string, unknown>;

  if (status.loggedIn !== true) {
    return {
      ok: false,
      kind: 'NOT_LOGGED_IN',
      detail:
        `refused: the dedicated classifier profile holds no active login. Provision it ` +
        `once by running \`claude\` with CLAUDE_CONFIG_DIR set to the dedicated profile ` +
        `and completing /login with the owner's Claude Max subscription account.`,
    };
  }

  if (status.authMethod !== REQUIRED_AUTH_METHOD) {
    return {
      ok: false,
      kind: 'WRONG_AUTH_METHOD',
      detail:
        `refused: the dedicated profile's auth method is ${describeReceived(status.authMethod)}, ` +
        `not ${JSON.stringify(REQUIRED_AUTH_METHOD)}. The classifier runtime accepts only the ` +
        `stored subscription login created by /login inside the dedicated profile.`,
    };
  }

  if (status.apiProvider !== REQUIRED_API_PROVIDER) {
    return {
      ok: false,
      kind: 'WRONG_API_PROVIDER',
      detail:
        `refused: the dedicated profile's API provider is ${describeReceived(status.apiProvider)}, ` +
        `not ${JSON.stringify(REQUIRED_API_PROVIDER)}. The classifier runtime is ` +
        `first-party-only.`,
    };
  }

  if ('subscriptionType' in status && status.subscriptionType !== undefined) {
    if (status.subscriptionType !== REQUIRED_SUBSCRIPTION_TYPE) {
      return {
        ok: false,
        kind: 'WRONG_SUBSCRIPTION_TYPE',
        detail:
          `refused: the dedicated profile's subscription type is ` +
          `${describeReceived(status.subscriptionType)}, not ` +
          `${JSON.stringify(REQUIRED_SUBSCRIPTION_TYPE)}. This owner deployment requires ` +
          `the Claude Max subscription.`,
      };
    }
  }

  return { ok: true };
}
