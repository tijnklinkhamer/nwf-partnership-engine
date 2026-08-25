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

/**
 * RFC 9309 s2.2.1's product-token grammar: `1*(%x2D / %x5F / %x41-5A / %x61-7A)`
 * - hyphen, underscore, and ASCII letters ONLY. No digits, no slash, no dot.
 *
 * This is deliberately NARROWER than the full HTTP User-Agent string this
 * repository sends on the wire (`RESEARCH_USER_AGENT` in policy.ts, which
 * legitimately carries a version number and a URL comment per ordinary HTTP
 * convention) - the two live at different layers and are checked against
 * different grammars. `robots.ts`'s `ROBOTS_USER_AGENT_TOKEN` is a NARROWER
 * VIEW of that string, stripped down to satisfy exactly this grammar.
 */
const PRODUCT_TOKEN_PATTERN = /^[A-Za-z_-]+$/;

/** True only for a string that is itself a valid RFC 9309 product-token. */
export function isRfc9309ProductToken(token: string): boolean {
  return PRODUCT_TOKEN_PATTERN.test(token);
}

const UNRESERVED_BYTE = /^[A-Za-z0-9\-._~]$/;

/**
 * Canonicalises a URI COMPONENT (a robots.txt rule value, or a request path)
 * to the octet-level form RFC 9309 s2.2.2 requires comparisons to happen on.
 *
 * TWO DIRECTIONS, NEVER CONFUSED:
 *
 *   - A `%XX` triple that decodes to an UNRESERVED byte (ALPHA / DIGIT / "-"
 *     / "." / "_" / "~") is REPLACED by its literal character. RFC 3986 s2.3:
 *     these are equivalent representations of the same content, so
 *     `%62%61%7A` and `baz` MUST compare equal.
 *   - A `%XX` triple that decodes to anything else - a RESERVED character
 *     (e.g. `%2F` for `/`), or a non-ASCII UTF-8 octet - is NEVER decoded to
 *     its literal form, only re-encoded with UPPERCASE hex digits for a
 *     stable comparison. Decoding a reserved octet would change what the URI
 *     MEANS: `%2F` inside a path segment is not the same thing as a literal
 *     `/` acting as a segment delimiter, and collapsing that distinction is
 *     exactly the class of path-matching bug this function exists to avoid.
 *
 * A LITERAL (never-percent-encoded) character in the input is handled the
 * same way, one Unicode code point at a time:
 *
 *   - unreserved ASCII: emitted literally (already canonical);
 *   - a structural/reserved ASCII delimiter, OR one of this module's own
 *     wildcard metacharacters `*` `$`: emitted literally, so path-segment
 *     boundaries and wildcard syntax both survive canonicalisation intact -
 *     re-encoding a literal `/` into `%2F` would destroy prefix matching for
 *     every ordinary rule in existence;
 *   - anything else ASCII (space, control characters, `"<>{}|\^`` - bytes a
 *     well-formed URI should never carry unencoded): percent-encoded, so a
 *     careless literal and its correctly-escaped equivalent still compare
 *     equal;
 *   - non-ASCII: encoded as its UTF-8 byte sequence, percent-encoded
 *     uppercase - RFC 9309 s2.2.2's requirement that non-ASCII content be
 *     compared via its percent-encoded UTF-8 octets, so a literal `café` in
 *     one spelling and `caf%C3%A9` in the other compare equal.
 *
 * The two robots.txt-only metacharacters `*` and `$` are preserved literally
 * ONLY when they appear UNENCODED in the input - `%2A` and `%24` decode to
 * reserved/sub-delim bytes, so under the rule above they stay percent-encoded
 * rather than becoming literal `*`/`$`, which correctly keeps them from being
 * reinterpreted as wildcard syntax. An unencoded `*` or `$` in a rule value is
 * the ONLY way to write a wildcard; an escaped one means a literal character.
 */
export function canonicaliseUriComponent(raw: string): string {
  const STRUCTURAL_LITERAL = new Set([
    ':',
    '/',
    '?',
    '#',
    '[',
    ']',
    '@', // gen-delims
    '!',
    '$',
    '&',
    "'",
    '(',
    ')',
    '*',
    '+',
    ',',
    ';',
    '=', // sub-delims (includes our * and $)
  ]);
  let out = '';
  let i = 0;
  while (i < raw.length) {
    const char = raw[i]!;
    if (char === '%' && /^[0-9a-fA-F]{2}$/.test(raw.slice(i + 1, i + 3))) {
      const byte = Number.parseInt(raw.slice(i + 1, i + 3), 16);
      const asChar = String.fromCharCode(byte);
      out += UNRESERVED_BYTE.test(asChar)
        ? asChar
        : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
      i += 3;
      continue;
    }
    const codePoint = raw.codePointAt(i)!;
    const unit = String.fromCodePoint(codePoint);
    if (codePoint < 128) {
      if (UNRESERVED_BYTE.test(unit) || STRUCTURAL_LITERAL.has(unit)) {
        out += unit;
      } else {
        out += `%${codePoint.toString(16).toUpperCase().padStart(2, '0')}`;
      }
    } else {
      for (const byte of Buffer.from(unit, 'utf-8')) {
        out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
      }
    }
    i += unit.length;
  }
  return out;
}

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
function compilePathPattern(rawValue: string): { pattern: RegExp; specificity: number } {
  if (rawValue === '') {
    // Matches nothing. Kept as a real (never-matching) rule rather than
    // filtered out, so an empty Disallow still occupies its declared position
    // for anyone reading the parsed group - it is a rule that says nothing,
    // not an absent one.
    return { pattern: /(?!)/, specificity: 0 };
  }
  // CANONICALISED FIRST, so `%62%61%7A` and `baz` compile to the identical
  // pattern and specificity, and a rule's specificity is measured in RFC
  // 9309's octets rather than in whichever spelling the site happened to
  // write. `*` and `$` survive canonicalisation as literal characters
  // (canonicaliseUriComponent's STRUCTURAL_LITERAL set), so the wildcard/
  // end-anchor logic below still finds them - UNLESS the site itself
  // percent-encoded them (`%2A`, `%24`), which correctly stops them being
  // read as wildcard syntax at all: they stay `%2A`/`%24` and match nothing
  // wildcard-like, exactly the literal-character intent an escaped form
  // signals.
  const value = canonicaliseUriComponent(rawValue);
  const endAnchored = value.endsWith('$');
  const body = endAnchored ? value.slice(0, -1) : value;
  const segments = body.split('*');
  const literalLength = segments.join('').length;
  // ALL regex metacharacters, not a hand-picked subset: an unescaped literal
  // `?` (a common, legitimate rule character - e.g. a query-string prefix
  // like `/search?q=`) is a regex QUANTIFIER, not a literal question mark,
  // and silently made the preceding character optional instead of requiring
  // it - found by writing exactly the query-string test this correction pass
  // asked for. Escaping the complete JS regex special-character set here
  // once removes that whole class of "which character did we forget" bug.
  const escaped = segments.map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
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
 * Picks EVERY group applicable to one user-agent token.
 *
 * RFC 9309 s2.2.1: "If there is more than one group matching the User-Agent,
 * the matching groups' rules MUST be combined into one group." A robots.txt
 * with two separate `User-agent: NWFPartnershipEngine-Research` records - not
 * merged into one because something else (a comment, a blank-line-free but
 * unrelated directive) sits between them - is common in hand-edited files,
 * and reading only the FIRST such group would silently discard the second
 * one's rules. This returns ALL groups naming the exact product token, or,
 * only when NONE do, all `*` groups - specific-beats-wildcard applied to the
 * SET of matching groups, not to a single winner picked out of it. No group
 * matching at all means unrestricted access - the standard's own default.
 */
function selectMatchingGroups(
  groups: readonly RuleGroup[],
  userAgentToken: string,
): readonly RuleGroup[] {
  const wanted = normaliseAgentToken(userAgentToken);
  const specific = groups.filter((group) => group.agents.includes(wanted));
  if (specific.length > 0) return specific;
  return groups.filter((group) => group.agents.includes('*'));
}

/**
 * Matches one path against the COMBINED rules of every applicable group.
 *
 * LONGEST MATCH WINS, measured in literal (non-wildcard) characters of the
 * CANONICALISED rule text - the standard's own tie-breaker, because a more
 * specific rule is presumed to express the site's actual intent more
 * precisely than a broad one. On an EXACT specificity tie, `Allow` wins over
 * `Disallow`: the standard leaves this case implementation-defined, and
 * allowing on a tie is the documented choice of the two major real-world
 * implementations (Google, Bing), pinned here by test rather than left to
 * accident. `path` is canonicalised identically to every rule value, so
 * `%62%61%7A` in a Disallow line matches a literal `baz` in the request path
 * and vice versa.
 */
function matchGroups(groups: readonly RuleGroup[], rawPath: string): RobotsMatchResult {
  const path = canonicaliseUriComponent(rawPath);
  let best: PathRule | null = null;
  for (const group of groups) {
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
   * A definite 404 (the file was confirmed absent), OR a response this run
   * is ENTITLED TO TREAT AS IF no file existed, OR a 2xx response with an
   * empty/whitespace-only body.
   *
   * `NO_ROBOTS_FILE` therefore does NOT literally assert "this site has no
   * robots.txt" for every case it covers - it is RFC 9309 s2.3.1.3's own
   * "unavailable" class for the 4xx family: "if the robots.txt file is
   * unavailable due to server error [4xx]... crawlers MAY access any
   * resources on the server", i.e. the standard licenses treating any 4xx
   * (401, 403, ... - not only 404) as equivalent to no restrictions, without
   * requiring the crawler to have proven the file's actual non-existence.
   * The landed schema's `robots_decision` column comment does not define this
   * value's meaning beyond its name (checked against migration 0007 directly,
   * s7 of ADR 0006), so recording the whole 4xx family here is a stored fact
   * consistent with - not a reinterpretation of - what the schema commits to.
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
   * `null` when none of the applicable (combined) groups declared one.
   * Informational only - see robots.ts and ADR 0006: nothing in this slice
   * sleeps because of it.
   *
   * When SEVERAL matching groups each declare a Crawl-delay, the MAXIMUM of
   * them is used. RFC 9309 does not define a combination rule for this
   * directive; taking the largest (slowest) value is the conservative choice
   * consistent with combining Allow/Disallow rules by union - the combined
   * group's overall posture is "obey the most restrictive applicable
   * instruction", and a slower pace is the restrictive direction for pacing.
   */
  crawlDelaySecondsFor(userAgentToken: string): number | null {
    if (this.#groups === null) return null;
    const applicable = selectMatchingGroups(this.#groups, userAgentToken);
    let max: number | null = null;
    for (const group of applicable) {
      if (group.crawlDelaySeconds !== null && (max === null || group.crawlDelaySeconds > max)) {
        max = group.crawlDelaySeconds;
      }
    }
    return max;
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
    const applicable = selectMatchingGroups(this.#groups, userAgentToken);
    if (applicable.length === 0) return { decision: 'ALLOWED', rule: null };
    return matchGroups(applicable, path);
  }
}
