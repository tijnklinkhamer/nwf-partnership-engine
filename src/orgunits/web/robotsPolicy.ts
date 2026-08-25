/**
 * THE ROBOTS.TXT PARSER AND MATCHER, and the opaque result of applying it.
 *
 * PURE. No network, no database, no filesystem, no clock. This module never
 * decides to fetch anything - it only turns bytes that were already fetched
 * (or the ABSENCE of a fetchable policy) into a deterministic verdict.
 *
 * WHY `EvaluatedRobotsPolicy` IS A SEALED CLASS AND NOT A PLAIN RECORD
 *
 *   `RobotsAuthorisation.forEvaluatedPolicy` (robotsAuthority.ts) exists so
 *   that an ordinary page's robots verdict is traceable to something that
 *   actually read the site's rules. If the value fed into that factory were a
 *   plain `{ decision, rule }` object, the factory would be exactly as forgeable
 *   as the field it replaces - a caller could construct one by hand and the
 *   whole point of 2B-1b's capability model would be undone the moment 2B-1c
 *   touched it. So the OUTCOME of evaluation is itself branded, and the only
 *   way to produce one is to actually run `EvaluatedRobotsPolicy.fromBody` over
 *   bytes a fetch produced, or to name one of the few outcomes (no file, an
 *   unreadable policy) that this module itself decides from the fetch result.
 *
 * WHY IT SUPPORTS NO GENERIC "SKIP" OR "ALWAYS ALLOWED" CONSTRUCTOR
 *
 *   Every static factory below corresponds to an observable, honest fact about
 *   an attempt to read robots.txt: it parsed some rules, it was told "not
 *   found" (404 or another 4xx), it received an empty body, or it could not be
 *   read at all (network failure, 5xx, unparseable body, or - per ADR
 *   0004/0005's redirect posture - a redirect that this repository will not
 *   follow). There is no factory that means "someone decided this is fine".
 *
 * `evaluate` RETURNS THE SCHEMA'S OWN `RobotsDecision`, not a narrower ad-hoc
 * type, because that decision - ALLOWED / DISALLOWED / NO_ROBOTS_FILE /
 * ROBOTS_UNREADABLE - is this module's one true output. `NOT_APPLICABLE` is
 * never produced here: it belongs to the robots.txt-fetching request itself,
 * decided by the bootstrap authority in robotsAuthority.ts, not by evaluating
 * a policy against a path.
 */
import type { RobotsDecision } from './observations.js';

export interface RobotsMatchResult {
  decision: RobotsDecision;
  /** The exact matched rule line, capped to the schema's 512-character limit. */
  rule: string | null;
}

/** Why this host's policy could not be determined, in an evidence-honest vocabulary. */
export type RobotsUnavailableReason =
  'FETCH_FAILED' | 'SERVER_ERROR' | 'UNPARSEABLE' | 'REDIRECTED';

const MAX_STORED_RULE_LENGTH = 512;

/** One `Allow`/`Disallow` line, retained with enough structure to rank and match it. */
interface PathRule {
  kind: 'allow' | 'disallow';
  /** The rule exactly as written in the file, trimmed - what gets stored. */
  raw: string;
  /** The path pattern, compiled once. */
  pattern: RegExp;
  /** Rule specificity: the literal (non-wildcard) character count, for longest-match-wins. */
  specificity: number;
}

interface RuleGroup {
  /** Lower-cased user-agent tokens this group was declared for. Never empty. */
  agents: string[];
  rules: PathRule[];
  /** Clamped to [1.2, 5]. `null` when the group declared none. */
  crawlDelaySeconds: number | null;
}

/**
 * Compiles one `Allow`/`Disallow` VALUE into a matcher.
 *
 * Supports exactly the two wildcards the standard defines: `*` (any run of
 * characters) and a trailing `$` (end-of-path anchor). Everything else is a
 * literal. An empty Disallow value means "disallow nothing" per the standard,
 * which this treats as a rule that never matches - not as an ALLOW override
 * needing special-case precedence.
 */
function compilePathPattern(value: string): { pattern: RegExp; specificity: number } {
  if (value === '') {
    // Matches nothing. Kept as a real (never-matching) rule rather than
    // filtered out, so an empty Disallow still occupies its declared position
    // for anyone reading the parsed group - it is a rule that says nothing,
    // not an absent one.
    return { pattern: /(?!)/, specificity: 0 };
  }
  const endAnchored = value.endsWith('$');
  const body = endAnchored ? value.slice(0, -1) : value;
  const segments = body.split('*');
  const literalLength = segments.join('').length;
  const escaped = segments.map((segment) => segment.replace(/[.+^${}()|[\]\\]/g, '\\$&'));
  const source = `^${escaped.join('.*')}${endAnchored ? '$' : ''}`;
  return { pattern: new RegExp(source), specificity: literalLength + (endAnchored ? 1 : 0) };
}

/** Lower-cases and trims a user-agent token the way the standard compares them. */
function normaliseAgentToken(token: string): string {
  return token.trim().toLowerCase();
}

/**
 * Parses robots.txt body text into user-agent groups.
 *
 * Deliberately not a general-purpose robots-parsing library: it implements
 * exactly the approved subset - `User-agent`, `Allow`, `Disallow`,
 * `Crawl-delay`, `#` comments - and ignores unrecognised directives
 * (`Sitemap`, `Host`, `Request-rate`, ...) rather than failing on them, which
 * matches every real-world crawler's tolerance for a file it does not fully
 * understand.
 *
 * A blank line separates records only informally; what actually starts a new
 * group is a `User-agent` line following anything other than another
 * `User-agent` line, which is how consecutive `User-agent` lines are grouped
 * together as one group with several tokens.
 */
function parseGroups(body: string): RuleGroup[] {
  const groups: RuleGroup[] = [];
  let current: RuleGroup | null = null;
  // True once a non-user-agent directive has been seen for `current`, so the
  // NEXT `User-agent` line starts a fresh group instead of extending this one.
  let sawDirectiveSinceAgent = false;

  for (const rawLine of body.split(/\r\n|\r|\n/)) {
    const withoutComment = rawLine.split('#')[0] ?? '';
    const line = withoutComment.trim();
    if (line === '') continue;

    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const directive = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (directive === 'user-agent') {
      if (current === null || sawDirectiveSinceAgent) {
        current = { agents: [], rules: [], crawlDelaySeconds: null };
        groups.push(current);
        sawDirectiveSinceAgent = false;
      }
      current.agents.push(normaliseAgentToken(value));
      continue;
    }

    if (current === null) continue; // A directive before any User-agent line names no group.
    sawDirectiveSinceAgent = true;

    if (directive === 'allow' || directive === 'disallow') {
      const { pattern, specificity } = compilePathPattern(value);
      current.rules.push({ kind: directive, raw: value, pattern, specificity });
      continue;
    }

    if (directive === 'crawl-delay') {
      const seconds = Number.parseFloat(value);
      if (Number.isFinite(seconds) && seconds >= 0) {
        current.crawlDelaySeconds = clampCrawlDelay(seconds);
      }
      continue;
    }
    // Every other directive (Sitemap, Host, Request-rate, ...) is recognised
    // as existing and deliberately ignored: this is a robots MATCHER, not a
    // sitemap reader, and `sitemap.ts` stays absent from this repository.
  }

  return groups;
}

/** The approved clamp: never faster than 1.2 s, never slower than 5 s. */
export function clampCrawlDelay(seconds: number): number {
  return Math.min(5, Math.max(1.2, seconds));
}

/**
 * Picks the applicable group for one user-agent token.
 *
 * A group naming the exact product token wins over `*`, which is the
 * standard's specific-beats-wildcard rule applied to exactly the two tokens
 * this repository ever presents. `*` is the fallback. No group matching means
 * unrestricted access - the standard's own default, not a guess.
 */
function selectGroup(groups: readonly RuleGroup[], userAgentToken: string): RuleGroup | null {
  const wanted = normaliseAgentToken(userAgentToken);
  const specific = groups.find((group) => group.agents.includes(wanted));
  if (specific !== undefined) return specific;
  return groups.find((group) => group.agents.includes('*')) ?? null;
}

/**
 * Matches one path against one group's rules.
 *
 * LONGEST MATCH WINS, measured in literal (non-wildcard) characters - the
 * standard's own tie-breaker, because a more specific rule is presumed to
 * express the site's actual intent more precisely than a broad one. On an
 * EXACT specificity tie, `Allow` wins over `Disallow`: the standard leaves
 * this case implementation-defined, and allowing on a tie is the documented
 * choice of the two major real-world implementations (Google, Bing), pinned
 * here by test rather than left to accident.
 */
function matchGroup(group: RuleGroup, path: string): RobotsMatchResult {
  let best: PathRule | null = null;
  for (const rule of group.rules) {
    if (!rule.pattern.test(path)) continue;
    if (
      best === null ||
      rule.specificity > best.specificity ||
      (rule.specificity === best.specificity && rule.kind === 'allow' && best.kind === 'disallow')
    ) {
      best = rule;
    }
  }
  if (best === null) return { decision: 'ALLOWED', rule: null };
  if (best.kind === 'allow') return { decision: 'ALLOWED', rule: storedRule(best.raw, 'Allow') };
  return { decision: 'DISALLOWED', rule: storedRule(best.raw, 'Disallow') };
}

function storedRule(value: string, directive: 'Allow' | 'Disallow'): string {
  const text = `${directive}: ${value}`;
  return text.length > MAX_STORED_RULE_LENGTH ? text.slice(0, MAX_STORED_RULE_LENGTH) : text;
}

/**
 * ONE HOST'S FULLY-RESOLVED ROBOTS POSTURE, and the only opaque value
 * `RobotsAuthorisation.forEvaluatedPolicy` accepts.
 *
 * Sealed for the same reason `RobotsAuthorisation` is: a value a caller can
 * construct by hand is a value a caller can lie with. Every static factory
 * corresponds to one truthful outcome of trying to read robots.txt, never to
 * an opinion about whether access should be allowed.
 */
export class EvaluatedRobotsPolicy {
  readonly #sealed = true;
  readonly #groups: readonly RuleGroup[] | null;
  readonly #unavailableReason: RobotsUnavailableReason | null;

  private constructor(
    groups: readonly RuleGroup[] | null,
    unavailableReason: RobotsUnavailableReason | null,
  ) {
    this.#groups = groups;
    this.#unavailableReason = unavailableReason;
  }

  static isEvaluatedPolicy(value: unknown): value is EvaluatedRobotsPolicy {
    return typeof value === 'object' && value !== null && #sealed in value;
  }

  /** Parses an actually-retrieved robots.txt body (HTTP 2xx with a non-empty body). */
  static fromBody(body: string): EvaluatedRobotsPolicy {
    if (body.trim() === '') return EvaluatedRobotsPolicy.noRestrictions();
    return new EvaluatedRobotsPolicy(parseGroups(body), null);
  }

  /**
   * No robots.txt exists, or the site said so unambiguously.
   *
   * Covers a 404, every other 4xx (RFC 9309 s2.3.1.3: a client MAY treat any
   * 4xx as "no robots.txt file is present" - the entire fetched-4xx family is
   * folded into this one honest outcome rather than inventing per-status
   * nuance the standard does not require), and a 2xx response with an empty
   * or whitespace-only body.
   */
  static noRestrictions(): EvaluatedRobotsPolicy {
    return new EvaluatedRobotsPolicy([], null);
  }

  /**
   * The policy could not be determined AT ALL, and every ordinary request to
   * this host this run is refused rather than guessed at.
   *
   * Covers a network/transport failure, a 5xx, a body this parser could not
   * make sense of as text, and - per ADR 0004/0005's redirect posture - a
   * robots.txt response that redirected. The gateway never follows a
   * redirect, robots.txt fetches emphatically included, so a redirect target
   * is never read and the policy is exactly as unknown as a hard failure
   * would have left it. `ROBOTS_UNREADABLE` is the taxonomy's own truthful
   * name for that: the file was not read, for any of these reasons.
   */
  static unavailable(reason: RobotsUnavailableReason): EvaluatedRobotsPolicy {
    return new EvaluatedRobotsPolicy(null, reason);
  }

  get isUnavailable(): boolean {
    return this.#groups === null;
  }

  get unavailableReason(): RobotsUnavailableReason | null {
    return this.#unavailableReason;
  }

  /** True when this policy came from `noRestrictions()`: no file, and no rules to apply. */
  get hasNoFile(): boolean {
    return this.#groups !== null && this.#groups.length === 0;
  }

  /**
   * The clamped Crawl-delay this policy declared for the given agent, or
   * `null` when none was declared. Informational only - see robots.ts and
   * ADR 0006: nothing in this slice sleeps because of it.
   */
  crawlDelaySecondsFor(userAgentToken: string): number | null {
    if (this.#groups === null) return null;
    const group = selectGroup(this.#groups, userAgentToken);
    return group?.crawlDelaySeconds ?? null;
  }

  /**
   * Evaluates one path for one user-agent token and returns the SCHEMA'S OWN
   * `robots_decision`, ready to store.
   *
   *   - unavailable            -> ROBOTS_UNREADABLE, rule null. Blocks the
   *                                request exactly like DISALLOWED, recorded
   *                                under the honest "we do not know" label.
   *   - no file / empty body   -> NO_ROBOTS_FILE, rule null.
   *   - parsed, no applicable
   *     rule matched           -> ALLOWED, rule null (§15: never invent one).
   *   - parsed, a rule matched -> ALLOWED or DISALLOWED, with that rule.
   */
  evaluate(userAgentToken: string, path: string): RobotsMatchResult {
    if (this.#groups === null) return { decision: 'ROBOTS_UNREADABLE', rule: null };
    if (this.#groups.length === 0) return { decision: 'NO_ROBOTS_FILE', rule: null };
    const group = selectGroup(this.#groups, userAgentToken);
    if (group === null) return { decision: 'ALLOWED', rule: null };
    return matchGroup(group, path);
  }
}
