/**
 * TRACK B, B2.2 / B2.3 - THE TRUSTED-REVIEWER CAPABILITY.
 *
 * A review (CONFIRMED, DISPUTED, REJECTED, WITHDRAWN) is a TRUSTED PATH's
 * decision (migration 0013). Its effect is not cosmetic: a CONFIRMED subject
 * reads as an accepted identity, and a REJECTED PART_OF is no longer followed
 * by the protected structural-parent evaluator - so a forged rejection could
 * remove a research block. Whoever records one must therefore be someone the
 * Engine can actually identify as an authorised reviewer.
 *
 * B2.2 FOUND THAT THE ENGINE COULD NOT DO THAT (ADR 0020 s6): the "owner path"
 * is possession of the migration credential, a database role proves a
 * capability rather than a person, a terminal session proves nothing, and an
 * `--actor-key` string would prove even less - so no command accepts one.
 *
 * B2.3 ADDS THE TRUST PRIMITIVE (ADR 0023): an OWNER Ed25519 signature over a
 * canonical, domain-separated review payload, verified against a PINNED
 * public-key trust set. `fromVerifiedEnvelope` is the ONE production factory.
 * It takes nothing but a `VerifiedReviewEnvelope` - a sealed value that only
 * exists as the result of a signature check under a pinned, non-retired,
 * non-revoked key - and DERIVES the recorded actor key from that key
 * (`owner-review-<keyId>`). It takes no actor key, no user id and no public
 * key as an argument.
 *
 * NO OWNER KEY IS PROVISIONED. The operational trust set is empty, so no
 * envelope verifies, no production context can be derived, and production
 * review execution is still refused with REVIEWER_TRUST_PRIMITIVE_ABSENT -
 * the code means, exactly as before, that no trusted reviewer can be
 * identified. Provisioning a key is a separate OWNER decision.
 *
 * `testSeam` stays a TEST SEAM: it throws outside vitest, carries no
 * attestation, and a review recorded through it is - like any raw-SQL review -
 * an INTEGRITY HOLD on every read, never authority.
 */
import { reviewerActorKeyOf } from '../subjectReview/protocol.js';
import { VerifiedReviewEnvelope } from '../subjectReview/verify.js';

/** The refusal every production review execution receives while no OWNER key is provisioned. */
export const REVIEWER_TRUST_PRIMITIVE_ABSENT = 'REVIEWER_TRUST_PRIMITIVE_ABSENT';

const ACTOR_KEY = /^[a-z0-9][a-z0-9_-]{2,63}$/;

export class TrustedReviewerContext {
  /** The runtime brand. Unreadable, uncopyable, unforgeable by shape. */
  readonly #sealed = true;

  /** The verified envelope this context was derived from; null for the test seam. */
  readonly #attestation: VerifiedReviewEnvelope | null;

  /** The decision actor recorded on the review row - derived by the minting factory, never typed. */
  readonly actorKey: string;

  private constructor(actorKey: string, attestation: VerifiedReviewEnvelope | null) {
    this.actorKey = actorKey;
    this.#attestation = attestation;
  }

  /** True only for a value this class actually constructed. */
  static isContext(value: unknown): value is TrustedReviewerContext {
    return typeof value === 'object' && value !== null && #sealed in value;
  }

  /**
   * THE PRODUCTION FACTORY. Derives a reviewer from a verified OWNER envelope
   * and nothing else; the brand is checked at runtime, so a cast, a literal,
   * a spread or a JSON copy of an envelope is refused.
   */
  static fromVerifiedEnvelope(verified: VerifiedReviewEnvelope): TrustedReviewerContext {
    if (!VerifiedReviewEnvelope.isVerified(verified)) {
      throw new Error(
        `${REVIEWER_TRUST_PRIMITIVE_ABSENT}: a reviewer can only be derived from a verified envelope.`,
      );
    }
    return new TrustedReviewerContext(reviewerActorKeyOf(verified.keyId), verified);
  }

  /** The verified envelope behind a context, or null for a test-seam context. */
  static attestationOf(context: TrustedReviewerContext): VerifiedReviewEnvelope | null {
    if (!TrustedReviewerContext.isContext(context)) return null;
    return context.#attestation;
  }

  /**
   * TEST SEAM. Throws outside vitest, so no production code path can mint a
   * reviewer this way. Tests use it to exercise the B2.2 review writer's chain,
   * staleness and concurrency guarantees against a disposable database; what
   * it records carries no attestation and is never authority (B2.3).
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
    return new TrustedReviewerContext(actorKey, null);
  }
}
