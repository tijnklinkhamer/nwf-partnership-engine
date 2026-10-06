/**
 * THE CLASSIFIER-CALL IDENTITY TUPLE — the one construction of the six
 * values migration 0009's `orgunit_classifier_calls_identity_uidx` keys on
 * for an ORDINARY (non-repair) classifier call.
 *
 * Extracted, behaviour-identically, from `orchestrate.ts` so that the
 * runtime and the operator planner (`operatorPlan.ts`) can never disagree
 * about which identity a batch at a given attempt number has: both call
 * this function, and neither builds the tuple by hand. The input hash
 * itself is still `finalIdentity.ts`'s `computeFinalInputSha256`, unchanged
 * — this module only names the versions that accompany it, exactly as the
 * orchestrator always did:
 *
 *   - `classifierVersion` is `ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION`
 *     (migration 0009's own column comment; see `orchestrate.ts`);
 *   - `promptVersion` / `outputSchemaVersion` are the frozen exported
 *     constants, never a caller-supplied string.
 *
 * A repair call's identity is NOT built here: it carries its own derived
 * `input_sha256` (`repair.ts`'s `computeRepairInputSha256`).
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import { ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION } from './constants.js';
import { computeFinalInputSha256 } from './finalIdentity.js';
import { ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION } from './outputSchema.js';
import { ORGUNIT_CLASSIFIER_PROMPT_VERSION } from './prompt.js';
import type { IdentityLookup } from './persist.js';

export interface ClassifierCallIdentityInput {
  /** `AssembledBatch.assemblyInputSha256` — the 2B-2B handoff-assembly hash. */
  readonly assemblyInputSha256: string;
  readonly modelId: string;
  readonly attemptNo: number;
}

export function buildClassifierCallIdentity(input: ClassifierCallIdentityInput): IdentityLookup {
  return {
    inputSha256: computeFinalInputSha256({
      assemblyInputSha256: input.assemblyInputSha256,
      promptVersion: ORGUNIT_CLASSIFIER_PROMPT_VERSION,
      outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
    }),
    modelId: input.modelId,
    promptVersion: ORGUNIT_CLASSIFIER_PROMPT_VERSION,
    classifierVersion: ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION,
    outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
    attemptNo: input.attemptNo,
  };
}
