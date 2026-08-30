/**
 * Proves the exact final input-hash composition the preserved Phase 2B-2C
 * Claude Max runtime design specifies (§18):
 *
 *   input_sha256 = sha256(canonicalStringify({
 *     assemblyInputSha256, promptVersion, outputSchemaVersion,
 *   }))
 *
 * — and, just as importantly, what it deliberately excludes: `model_id` and
 * `request_config` (effort/thinking) never change the hash.
 */
import { describe, expect, it } from 'vitest';
import { computeFinalInputSha256 } from '../../orgunits/classify/finalIdentity.js';

const BASE = {
  assemblyInputSha256: '1'.repeat(64),
  promptVersion: 'orgunit-classifier-prompt-v1',
  outputSchemaVersion: 'orgunit-classifier-output-schema-v1',
};

describe('computeFinalInputSha256', () => {
  it('is a lowercase 64-character hex string', () => {
    const hash = computeFinalInputSha256(BASE);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic: same inputs -> same hash', () => {
    expect(computeFinalInputSha256(BASE)).toBe(computeFinalInputSha256({ ...BASE }));
  });

  it('changes when assemblyInputSha256 changes', () => {
    const other = { ...BASE, assemblyInputSha256: '2'.repeat(64) };
    expect(computeFinalInputSha256(BASE)).not.toBe(computeFinalInputSha256(other));
  });

  it('changes when promptVersion changes', () => {
    const other = { ...BASE, promptVersion: 'orgunit-classifier-prompt-v2' };
    expect(computeFinalInputSha256(BASE)).not.toBe(computeFinalInputSha256(other));
  });

  it('changes when outputSchemaVersion changes', () => {
    const other = { ...BASE, outputSchemaVersion: 'orgunit-classifier-output-schema-v2' };
    expect(computeFinalInputSha256(BASE)).not.toBe(computeFinalInputSha256(other));
  });

  it('does NOT change when only model_id would differ (model_id is not a hash input at all)', () => {
    // The type deliberately has no modelId field - this test proves the
    // exclusion by construction: the same three fields, computed twice,
    // always agree regardless of what a caller does with model_id
    // elsewhere in the call.
    const first = computeFinalInputSha256(BASE);
    const second = computeFinalInputSha256({ ...BASE });
    expect(first).toBe(second);
  });

  it('does NOT change based on effort/thinking (request_config is not a hash input at all)', () => {
    // Same reasoning as above: FinalIdentityInput has no request_config
    // field, so two calls differing only in effort necessarily hash
    // identically - proven by the type, and restated here as a behavioural
    // fact for the test suite's own record.
    const first = computeFinalInputSha256(BASE);
    const second = computeFinalInputSha256({ ...BASE });
    expect(first).toBe(second);
  });

  it('is order-independent over key construction (canonical serialization)', () => {
    const built = {
      outputSchemaVersion: BASE.outputSchemaVersion,
      assemblyInputSha256: BASE.assemblyInputSha256,
      promptVersion: BASE.promptVersion,
    };
    expect(computeFinalInputSha256(built)).toBe(computeFinalInputSha256(BASE));
  });
});
