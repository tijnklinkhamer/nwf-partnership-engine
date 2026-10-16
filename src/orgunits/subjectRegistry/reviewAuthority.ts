/**
 * TRACK B, B2.2 - THE TRUSTED-REVIEWER CAPABILITY, AND ITS CONFIRMED ABSENCE.
 *
 * A review (CONFIRMED, DISPUTED, REJECTED, WITHDRAWN) is a TRUSTED PATH's
 * decision (migration 0013). Its effect is not cosmetic: a CONFIRMED subject
 * reads as an accepted identity, and a REJECTED PART_OF is no longer followed
 * by the protected structural-parent evaluator - so a forged rejection could
 * remove a research block. Whoever records one must therefore be someone the
 * Engine can actually identify as an authorised reviewer.
 *
 * THE ENGINE CANNOT DO THAT TODAY (ADR 0020 s6). It has no authenticated OWNER
 * identity: the "owner path" of migrations 0007 and 0013 is possession of the
 * migration credential, which in this repository is a deterministic
 * local-development superuser value; a database role proves a capability,
 * not a person; and a terminal session proves nothing. An `--actor-key`
 * string would prove even less, so no command accepts one.
 *
 * So this capability exists as a TYPE with NO PRODUCTION CONSTRUCTOR - the
 * pattern `RobotsAuthorisation` established. The review writer requires a
 * value that carries the private `#sealed` brand (a literal, a clone, a cast
 * or a spread cannot), and the only way to mint one is `testSeam`, which
 * throws outside vitest. Production review execution is therefore
 * unreachable, and the CLI refuses it with REVIEWER_TRUST_PRIMITIVE_ABSENT
 * before it opens any connection.
 *
 * A later, separately authorised milestone may add ONE production factory,
 * deriving the actor key from a real trust primitive. It must not take the
 * key as an argument.
 */

/** The refusal every production review execution receives. */
export const REVIEWER_TRUST_PRIMITIVE_ABSENT = 'REVIEWER_TRUST_PRIMITIVE_ABSENT';

const ACTOR_KEY = /^[a-z0-9][a-z0-9_-]{2,63}$/;

export class TrustedReviewerContext {
  /** The runtime brand. Unreadable, uncopyable, unforgeable by shape. */
  readonly #sealed = true;

  /** The decision actor recorded on the review row - derived by the minting factory, never typed. */
  readonly actorKey: string;

  private constructor(actorKey: string) {
    this.actorKey = actorKey;
  }

  /** True only for a value this class actually constructed. */
  static isContext(value: unknown): value is TrustedReviewerContext {
    return typeof value === 'object' && value !== null && #sealed in value;
  }

  /**
   * TEST SEAM. Throws outside vitest, so no production code path can mint a
   * reviewer. Tests use it to exercise the review writer's chain, staleness
   * and concurrency guarantees against a disposable database.
   */
  static testSeam(actorKey: string): TrustedReviewerContext {
    if (process.env['VITEST'] !== 'true') {
      throw new Error(
        'TrustedReviewerContext.testSeam is a TEST SEAM and is unavailable outside vitest. ' +
          `${REVIEWER_TRUST_PRIMITIVE_ABSENT}: the Engine has no trusted reviewer identity, ` +
          'so authoritative review execution is disabled (ADR 0020 s6).',
      );
    }
    if (!ACTOR_KEY.test(actorKey)) {
      throw new Error(`TrustedReviewerContext.testSeam: "${actorKey}" is not an actor key.`);
    }
    return new TrustedReviewerContext(actorKey);
  }
}
