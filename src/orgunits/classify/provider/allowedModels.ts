/**
 * THE CLOSED CLASSIFIER MODEL ALLOWLIST — `ORGUNIT_CLASSIFIER_ALLOWED_MODELS`
 * (Phase 2B-2C Max-runtime design §15).
 *
 * A closed, code-owned list of exact model-id strings the classifier
 * pre-flight will accept. Arbitrary operator strings are refused BEFORE any
 * provider invocation, so a typo cannot become an accidental request against
 * an unknown or unintended model.
 *
 * THESE ARE CANDIDATE TIERS, NOT A WINNER. Phase 2B-2D's gold-corpus
 * benchmark selects the runtime classifier model; nothing in this repository
 * hardcodes one, and no member of this list is privileged over another. The
 * list exists only so that "which models may be asked at all" is a reviewed
 * edit rather than a runtime string.
 *
 * THE ONE FILE EXEMPT from `phase1a.firewall.test.ts`'s Claude-model-id
 * regex, by exact path (design §16 item 2): an allowlist must NAME what it
 * allows. Test code uses fake model identifiers and injects its own
 * allowlist through the provider's explicit seam.
 *
 * PURE. No network, no database, no filesystem, no clock, no environment
 * read.
 */

/** The candidate model tiers 2B-2D will benchmark. Exact ids, no aliases, no date suffixes. */
export const ORGUNIT_CLASSIFIER_ALLOWED_MODELS: readonly string[] = [
  'claude-opus-5',
  'claude-sonnet-5',
  'claude-haiku-4-5',
];
