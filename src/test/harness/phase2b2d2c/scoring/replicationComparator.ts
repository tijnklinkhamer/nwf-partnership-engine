/**
 * PHASE 2B-2D2C-F0X — THE SHARED ATTEMPT-1 COMPARATOR IDENTITY.
 *
 * The N=5 replication scorer reads one comparator baseline — the adjudicated
 * attempt-1 results — through TWO freezes: F0I (V4, attempt 3) and F0O (V5,
 * attempt 4). Both must name the SAME baseline, or the two prompts would be
 * measured against different ground.
 *
 * Whole-object equality of `scoring.comparatorPolicy.attempt1` cannot express
 * that requirement, and asserting it was a defect. Each freeze deliberately
 * carries an ATTEMPT-LOCAL namespace assertion — F0I asserts
 * `neverInsideAttempt3Namespace`, F0O asserts `neverInsideAttempt4Namespace` —
 * recording that THAT attempt's own output namespace was never the comparator
 * source. Those keys are SUPPOSED to differ: they are each freeze's statement
 * about itself, not shared provenance. Requiring them equal made the
 * precondition unsatisfiable by the real, correct freezes.
 *
 * So the shared baseline is named explicitly instead: the seven fields below
 * are the provenance both freezes assert about the SAME comparator, and they
 * must be byte-identical. The namespace assertion is then checked SEPARATELY,
 * each freeze against its own key. Neither key is ever reinterpreted as the
 * other, and neither historical freeze is edited.
 *
 * It fails closed in both directions: a missing shared field and an
 * unexpected extra field are each a refusal, so a freeze that grew a new
 * comparator claim cannot slip past this check unexamined.
 *
 * PURE. No filesystem, no network, no database, no clock. It reads no gold
 * label, no supplement, no adjudication record and no holdout source; it is
 * handed two already-parsed freeze fragments and returns a projection.
 */
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import { ScoringSourceError } from './sources.js';

function fail(message: string): never {
  throw new ScoringSourceError(message);
}

/**
 * The provenance of the ONE adjudicated attempt-1 comparator, as both freezes
 * assert it. Every field here describes the comparator itself, so every field
 * here must agree across F0I and F0O.
 */
export const SHARED_ATTEMPT_1_COMPARATOR_FIELDS = [
  'freezeRawSha256',
  'artifactInventorySha256',
  'artifactCount',
  'authorisationSha256',
  'planSha256',
  'adjudicatedResults',
  'readOnly',
] as const;

export type SharedAttempt1ComparatorField = (typeof SHARED_ATTEMPT_1_COMPARATOR_FIELDS)[number];

export type SharedAttempt1Comparator = Readonly<Record<SharedAttempt1ComparatorField, unknown>>;

/**
 * Each freeze's ATTEMPT-LOCAL assertion that its own output namespace was
 * never the comparator source. Attempt-local by design: they differ, and that
 * difference is correct.
 */
export const F0I_ATTEMPT_1_NAMESPACE_ASSERTION = 'neverInsideAttempt3Namespace';
export const F0O_ATTEMPT_1_NAMESPACE_ASSERTION = 'neverInsideAttempt4Namespace';

/**
 * Projects one freeze's `comparatorPolicy.attempt1` onto the shared comparator
 * identity, having first required that its key set is EXACTLY the seven shared
 * fields plus that freeze's own namespace assertion, and that the assertion
 * holds.
 */
export function sharedAttempt1ComparatorIdentity(
  attempt1: unknown,
  namespaceAssertion: string,
  what: string,
): SharedAttempt1Comparator {
  if (typeof attempt1 !== 'object' || attempt1 === null || Array.isArray(attempt1)) {
    fail(`${what}: comparatorPolicy.attempt1 is not an object.`);
  }
  const actual = attempt1 as Record<string, unknown>;
  const expected = [...SHARED_ATTEMPT_1_COMPARATOR_FIELDS, namespaceAssertion];
  const missing = expected.filter((key) => !Object.hasOwn(actual, key)).sort();
  if (missing.length > 0) {
    fail(`${what}: comparatorPolicy.attempt1 is missing ${missing.join(', ')}.`);
  }
  const unexpected = Object.keys(actual)
    .filter((key) => !expected.includes(key))
    .sort();
  if (unexpected.length > 0) {
    fail(
      `${what}: comparatorPolicy.attempt1 carries unexamined field(s) ${unexpected.join(', ')}; this check fails closed rather than ignoring them.`,
    );
  }
  if (actual[namespaceAssertion] !== true) {
    fail(`${what}: comparatorPolicy.attempt1.${namespaceAssertion} is not true.`);
  }
  return Object.fromEntries(
    SHARED_ATTEMPT_1_COMPARATOR_FIELDS.map((key) => [key, actual[key]]),
  ) as SharedAttempt1Comparator;
}

/**
 * Requires F0I and F0O to name the SAME adjudicated attempt-1 comparator, and
 * each to carry its OWN attempt-local namespace assertion. Returns the one
 * shared identity both freezes agree on.
 */
export function assertSharedAttempt1Comparator(
  f0iAttempt1: unknown,
  f0oAttempt1: unknown,
): SharedAttempt1Comparator {
  const f0i = sharedAttempt1ComparatorIdentity(
    f0iAttempt1,
    F0I_ATTEMPT_1_NAMESPACE_ASSERTION,
    'the F0I freeze',
  );
  const f0o = sharedAttempt1ComparatorIdentity(
    f0oAttempt1,
    F0O_ATTEMPT_1_NAMESPACE_ASSERTION,
    'the F0O freeze',
  );
  const differing = SHARED_ATTEMPT_1_COMPARATOR_FIELDS.filter(
    (key) => canonicalStringify(f0i[key]) !== canonicalStringify(f0o[key]),
  );
  if (differing.length > 0) {
    fail(
      `the F0I and F0O freezes name different attempt-1 comparators; they disagree on ${differing.join(', ')}.`,
    );
  }
  return f0i;
}
