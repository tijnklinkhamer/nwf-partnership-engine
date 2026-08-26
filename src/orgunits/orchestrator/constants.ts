/**
 * PHASE 2B-1E BOUNDED DISCOVERY LIMITS, versioned by name rather than by
 * magic number scattered through the orchestrator.
 *
 * EVERY NUMBER HERE IS ONE OF TWO KINDS, and each is labelled which:
 *
 *   MECHANICAL SAFETY BOUND - a resource/cost ceiling with no claim of being
 *     statistically calibrated. It exists so a pathological site (an infinite
 *     sitemap index, a page with ten thousand links, a redirect loop) cannot
 *     spend an unbounded amount of this run's time or memory. Changing one of
 *     these is a reviewed edit, not a tuning exercise.
 *
 *   FROZEN POLICY CONSTANT - a budget explicitly specified by ADR/spec review
 *     for THIS slice (the 35-page budget, the 60-request budget, the 8-host
 *     cap, the Track B floor of 8, the sitemap caps, the 1.2s minimum pacing
 *     interval). These are the numbers Phase 2B-1E was reviewed against.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */

// ---------------------------------------------------------------------------
// FROZEN POLICY CONSTANTS (explicitly specified for this slice)
// ---------------------------------------------------------------------------

/** Ordinary page-attempt budget per root. Every network attempt at an ordinary page URL counts once, regardless of outcome (2xx/3xx/4xx/5xx/transport failure). */
export const MAX_PAGE_ATTEMPTS_PER_ROOT = 35;

/** Total gateway-attempt budget per root: robots + sitemap + ordinary pages + safe redirect continuations. */
export const MAX_TOTAL_REQUESTS_PER_ROOT = 60;

/** Maximum distinct hostnames admitted for possible network access under one root, including the root's own starting host. */
export const MAX_HOSTS_PER_ROOT = 8;

/** Track B (language-centre discovery) target floor WITHIN the 35-page budget, when viable Track B URLs exist. Never additional pages beyond the budget. */
export const TRACK_B_FLOOR = 8;

/** Sitemap documents (urlset or sitemapindex) fetched per root, across the whole sitemap tree. */
export const MAX_SITEMAP_DOCUMENTS_PER_ROOT = 5;

/** Sitemap recursion depth. Root sitemap index = depth 0; a document fetched to satisfy depth 3 is refused. */
export const MAX_SITEMAP_DEPTH = 2;

/** Hard ceiling on <loc> URLs accepted from sitemaps, across the whole tree, per root. */
export const MAX_SITEMAP_URLS_PER_ROOT = 3000;

/** Byte ceiling on one sitemap document body. Mirrors the gateway's own byte cap; a sitemap need never be read past this to be useful. */
export const MAX_SITEMAP_DOCUMENT_BYTES = 5 * 1024 * 1024;

/** Minimum per-host pacing interval, in seconds, absent a robots Crawl-delay (which is separately clamped to [1.2, 5] by robotsPolicy.ts). */
export const MIN_HOST_PACING_SECONDS = 1.2;

// ---------------------------------------------------------------------------
// MECHANICAL SAFETY BOUNDS (this slice's own, undocumented elsewhere; not
// empirically calibrated ranking rules - see the 2B-1E ADR)
// ---------------------------------------------------------------------------

/**
 * Redirect-hop safety cap for SAFE SAME-DOMAIN continuation. No ADR froze a
 * value for this, so this is a mechanical bound against a redirect loop
 * consuming a run's total-request budget invisibly, not a measured ranking
 * heuristic. Each hop still separately consumes MAX_TOTAL_REQUESTS_PER_ROOT.
 */
export const MAX_REDIRECT_CONTINUATION_HOPS = 5;

/**
 * Per-page discovered-anchor cap, applied AFTER trust filters (scheme,
 * same-registrable-domain, no service subdomain) have already dropped what
 * they can. A mechanical resource limit against a page with thousands of
 * links, not a calibrated relevance cutoff.
 */
export const MAX_DISCOVERED_ANCHORS_PER_PAGE = 200;

/**
 * Maximum unique frontier URLs held in memory per root, across sitemap and
 * anchor discovery combined. Comfortably above MAX_SITEMAP_URLS_PER_ROOT so a
 * full sitemap can still be admitted, but finite so anchor discovery cannot
 * grow the frontier without bound.
 */
export const MAX_FRONTIER_URLS_PER_ROOT = 5_000;

/**
 * Minimum number of same-host pages collected before cross-page boilerplate
 * differencing (`computeChromeLines`) is applied to any of them. Below this,
 * a page is persisted from main-element (or full-body) extraction ALONE.
 *
 * No ADR froze a minimum; ADR 0004 s3's own composition finding was measured
 * over many pages, not few. 3 is a NAMED CORRECTNESS GUARD chosen so that
 * "100% of a 1-page or 2-page sample" can never be read as chrome - the
 * ~45% recurrence threshold in computeChromeLines() means a 2-page sample
 * would already flag ANY line shared by both pages, which is far too eager
 * for two documents. 3 is the smallest sample where the threshold's own
 * majority arithmetic (>= 45% of N) starts to distinguish "recurs on this
 * page" from "recurs across pages" in a way distinct from unanimity. This is
 * a documented mechanical bound, not a statistically fitted minimum.
 */
export const MIN_PAGES_FOR_BOILERPLATE_DIFFERENCING = 3;

/**
 * Consecutive TRANSIENT failures (CONNECT_TIMEOUT, READ_TIMEOUT,
 * CONNECTION_REFUSED, CONNECTION_RESET, TLS_FAILURE) on one host, within one
 * run, before its circuit opens. A conservative v1 safety/cost bound, not a
 * statistically fitted threshold - see the 2B-1E ADR "circuit breaker
 * policy" section. A single success resets the streak to zero.
 */
export const CIRCUIT_BREAKER_TRANSIENT_FAILURE_THRESHOLD = 3;
