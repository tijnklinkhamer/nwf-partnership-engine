/**
 * THE FINAL, PERSISTED CLASSIFIER-CALL INPUT IDENTITY.
 *
 * Resolves the seam `canonical.ts`'s own module comment and `types.ts`'s
 * `AssembledBatch` comment named but deliberately left open: 2B-2B's
 * `assemblyInputSha256` hashes exactly `{ context, documents }` — the
 * batch-assembly layer's own output. Migration 0009's persisted
 * `orgunit_classifier_calls.input_sha256` is a DIFFERENT, WIDER value that
 * also folds in `prompt_version` and `output_schema_version` (design §16).
 *
 * EXACT COMPOSITION, per the preserved Phase 2B-2C Claude Max runtime
 * design (§18) — the single canonical rule, no ambiguity, no second hash
 * anywhere:
 *
 *   input_sha256 = sha256(canonicalStringify({
 *     assemblyInputSha256,
 *     promptVersion,
 *     outputSchemaVersion,
 *   }))
 *
 * WHAT IS DELIBERATELY EXCLUDED, AND WHY (design §18, restated exactly):
 *
 *   - `classifier_version` — NOT included directly. It is the assembly
 *     POLICY version (`ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION`), which already
 *     flows into `assemblyInputSha256` via `batch.context.assemblyVersion`
 *     (`assemble.ts`'s `contextBase`). Hashing it again here would
 *     double-encode one fact.
 *   - `model_id` — kept OUT of the hash so the SAME `input_sha256`
 *     identifies the same semantic question across model tiers, which is
 *     exactly what a future cross-model benchmark needs to join on.
 *   - `effort`/`thinking`/every other `request_config` value — kept OUT of
 *     both the hash AND the identity index entirely; they live in
 *     `request_config` only. Two calls differing only in effort therefore
 *     share an identity tuple, and a COMPLETED low-effort call is reused
 *     rather than re-run at high effort unless the operator explicitly
 *     requests a new observation via `attempt_no + 1`.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import { canonicalStringify } from './canonical.js';
import { createHash } from 'node:crypto';

export interface FinalIdentityInput {
  /** `AssembledBatch.assemblyInputSha256` — the 2B-2B handoff-assembly hash. */
  readonly assemblyInputSha256: string;
  readonly promptVersion: string;
  readonly outputSchemaVersion: string;
}

/** The exact, lowercase 64-character hex SHA-256 migration 0009's `input_sha256_chk` expects. */
export function computeFinalInputSha256(input: FinalIdentityInput): string {
  const canonical = canonicalStringify({
    assemblyInputSha256: input.assemblyInputSha256,
    promptVersion: input.promptVersion,
    outputSchemaVersion: input.outputSchemaVersion,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
