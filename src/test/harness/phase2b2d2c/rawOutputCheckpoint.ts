/**
 * PHASE 2B-2D2C-F1 — THE RAW-OUTPUT-BEFORE-VALIDATION INVARIANT, as a
 * structure rather than a convention.
 *
 * For an `OK` provider result the exact raw provider output is durably
 * persisted BEFORE layer-2 validation begins:
 *
 *   1. receive raw output;
 *   2. canonicalize it deterministically (the injected production
 *      `canonicalStringify`);
 *   3. compute its SHA-256;
 *   4. write the raw-output checkpoint atomically and 5. flush it durably
 *      (the injected `persist`, which the child binds to
 *      `writeArtifactOnce` — temporary file, fsync, link-into-place,
 *      directory fsync);
 *   6. only then call the injected `validate`;
 *   7. return both so the caller can write the validation result and the
 *      final attempt metadata.
 *
 * The validator is reachable only through this function, and only after
 * `persist` has RESOLVED: a persistence that throws, rejects or never
 * settles leaves the validator unrun. Rejected output retains the same raw
 * checkpoint as accepted output because the checkpoint is written before
 * anyone knows which it is.
 *
 * PURE aside from the injected persistence. No network, no database, no
 * clock.
 */
import { createHash } from 'node:crypto';

export interface RawOutputCheckpoint {
  /** The exact canonical serialization that was persisted. */
  readonly rawOutputCanonicalSerialization: string;
  readonly rawOutputSha256: string;
  readonly rawOutputUtf8Bytes: number;
}

export interface PersistThenValidateInput<TValidation> {
  readonly rawOutput: unknown;
  readonly canonicalStringify: (value: unknown) => string;
  /** Durable, write-once persistence of the checkpoint. Must resolve before validation may run. */
  readonly persist: (checkpoint: RawOutputCheckpoint) => Promise<void>;
  readonly validate: (rawOutput: unknown) => TValidation;
}

export class RawOutputNotPersistedError extends Error {
  override readonly name = 'RawOutputNotPersistedError';
  readonly stopCondition = 'RAW_OUTPUT_NOT_PERSISTED_BEFORE_VALIDATION' as const;
  constructor(
    readonly stage: 'CANONICALIZE' | 'PERSIST',
    cause: unknown,
  ) {
    super(
      `raw provider output was not durably persisted before validation (${stage}: ` +
        `${cause instanceof Error ? cause.message : String(cause)}); the validator was not run.`,
    );
  }
}

export interface PersistThenValidateResult<TValidation> {
  readonly checkpoint: RawOutputCheckpoint;
  readonly validation: TValidation;
  /** Monotonic sequence proof: the checkpoint persisted at `persistedSeq`, validation started at `validationStartedSeq`. */
  readonly sequence: { readonly persistedSeq: number; readonly validationStartedSeq: number };
}

let sequence = 0;
const nextSeq = (): number => {
  sequence += 1;
  return sequence;
};

export async function persistRawOutputThenValidate<TValidation>(
  input: PersistThenValidateInput<TValidation>,
): Promise<PersistThenValidateResult<TValidation>> {
  let serialization: string;
  try {
    serialization = input.canonicalStringify(input.rawOutput);
  } catch (error) {
    throw new RawOutputNotPersistedError('CANONICALIZE', error);
  }
  const checkpoint: RawOutputCheckpoint = {
    rawOutputCanonicalSerialization: serialization,
    rawOutputSha256: createHash('sha256').update(serialization, 'utf8').digest('hex'),
    rawOutputUtf8Bytes: Buffer.byteLength(serialization, 'utf8'),
  };
  try {
    await input.persist(checkpoint);
  } catch (error) {
    throw new RawOutputNotPersistedError('PERSIST', error);
  }
  const persistedSeq = nextSeq();
  const validationStartedSeq = nextSeq();
  const validation = input.validate(input.rawOutput);
  return { checkpoint, validation, sequence: { persistedSeq, validationStartedSeq } };
}
