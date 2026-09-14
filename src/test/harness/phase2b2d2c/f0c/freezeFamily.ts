/**
 * PHASE 2B-2D2C-F0D — ONE child-facing VIEW over the two freeze families.
 *
 * The Tier-2 child, the coordinator and the child entry need a handful of
 * facts about "the freeze this manifest names": its raw hash, the corpus
 * paths and hashes, the classifier identities, the variants it admits, one
 * frozen batch by ordinal with the final identity for a named variant, and
 * the repair policy. F0B (attempt 1, two variants, no repair policy) and
 * F0E (attempt 2, one variant, repair enabled; F0C is recognised only to be refused as superseded) answer those questions from
 * different schemas with different hash pins. This module resolves WHICH
 * family a set of bytes belongs to BY HASH — the F0E hash selects the F0E
 * loader, the superseded F0C hash is refused, anything else goes to the F0B loader, which refuses everything
 * but the F0B bytes — and returns the common view. Neither loader is
 * changed, and neither learns about the other.
 *
 * `finalInputSha256For` answers `undefined` for a variant the family does
 * not schedule: an attempt-2 manifest naming PROMPT_V1_CANONICAL or
 * PROMPT_V2_CANONICAL therefore fails the child's identity check, which is
 * exactly the "V1/V2 are never scheduled again" invariant, enforced where
 * the request would otherwise be built.
 *
 * Pure aside from the injected bytes and probes. No network, no database,
 * no clock, no filesystem of its own.
 */
import { createHash } from 'node:crypto';
import { FROZEN_VARIANTS } from '../constants.js';
import {
  loadFreezeFromBytes,
  type Freeze,
  type FrozenBatchContext,
  type FrozenRepairPolicy,
} from '../freeze.js';
import {
  verifyVariantRoot,
  type RootVerificationContract,
  type VariantIdentity,
  type VariantRootProbes,
  type VariantRootVerification,
} from '../variantRoot.js';
import { F0CFreezeError, type Attempt2Freeze } from './attempt2FreezeCore.js';
import { APPROVED_F0C_FREEZE_RAW_SHA256 } from './freezeF0C.js';
import {
  F0E_VARIANT,
  loadF0EFreezeFromBytes,
  PROPOSED_F0E_FREEZE_RAW_SHA256,
} from './freezeF0E.js';
import { verifyV3Root } from './variantRootF0C.js';

/**
 * `F0C_ATTEMPT_2_SUPERSEDED` is recognised only to be REFUSED: Finding F1
 * superseded F0C before any execution, so its bytes may never drive a child.
 */
export type FreezeFamily = 'F0B_ATTEMPT_1' | 'F0E_ATTEMPT_2' | 'F0C_ATTEMPT_2_SUPERSEDED';

export interface FrozenBatchView {
  readonly ordinal: number;
  readonly organisationId: string;
  readonly echeRowKey: string;
  readonly goldIds: readonly string[];
  readonly docIndices: readonly number[];
  readonly context: FrozenBatchContext;
  readonly serializedBatchUtf8Bytes: number;
  readonly assemblyInputSha256: string;
  readonly canonicalSerializedInputSha256: string;
  /** The frozen final identity for `variantName`, or undefined when this family never schedules it. */
  finalInputSha256For(variantName: string): string | undefined;
}

export interface ChildFreezeView {
  readonly family: FreezeFamily;
  readonly attemptNo: number;
  readonly rawSha256: string;
  readonly rawBytes: number;
  readonly version: string;
  readonly corpus: Freeze['corpus'];
  readonly classifier: {
    readonly requestedModelId: string;
    readonly outputSchemaVersion: string;
    readonly assemblyVersion: string;
  };
  readonly rootContract: RootVerificationContract;
  readonly variants: readonly VariantIdentity[];
  /** Present exactly when the freeze declares one (F0C); absent on F0B, which `freezeRepairPolicy` reads as DISABLED. */
  readonly repairPolicy?: FrozenRepairPolicy;
  frozenBatch(ordinal: number): FrozenBatchView | undefined;
  /** The attempt-2 freeze itself, present only for the F0E family (the V3 root verifier needs its repair contract). */
  readonly attempt2?: Attempt2Freeze;
}

function f0bView(bytes: Buffer): ChildFreezeView {
  const loaded = loadFreezeFromBytes(bytes);
  const { freeze } = loaded;
  return {
    family: 'F0B_ATTEMPT_1',
    attemptNo: 1,
    rawSha256: loaded.rawSha256,
    rawBytes: loaded.rawBytes,
    version: freeze.version,
    corpus: freeze.corpus,
    classifier: {
      requestedModelId: freeze.classifier.requestedModelId,
      outputSchemaVersion: freeze.classifier.outputSchemaVersion,
      assemblyVersion: freeze.classifier.assemblyVersion,
    },
    rootContract: freeze,
    variants: FROZEN_VARIANTS,
    ...(freeze.repairPolicy === undefined ? {} : { repairPolicy: freeze.repairPolicy }),
    frozenBatch: (ordinal) => {
      const batch = freeze.batching.plan.find((b) => b.ordinal === ordinal);
      if (batch === undefined) return undefined;
      return {
        ordinal: batch.ordinal,
        organisationId: batch.organisationId,
        echeRowKey: batch.echeRowKey,
        goldIds: batch.goldIds,
        docIndices: batch.docIndices,
        context: batch.context,
        serializedBatchUtf8Bytes: batch.serializedBatchUtf8Bytes,
        assemblyInputSha256: batch.assemblyInputSha256,
        canonicalSerializedInputSha256: batch.canonicalSerializedInputSha256,
        finalInputSha256For: (variantName) =>
          variantName === 'PROMPT_V1_CANONICAL' || variantName === 'PROMPT_V2_CANONICAL'
            ? batch.finalInputSha256[variantName]
            : undefined,
      };
    },
  };
}

function f0eView(bytes: Buffer): ChildFreezeView {
  const loaded = loadF0EFreezeFromBytes(bytes);
  const { freeze } = loaded;
  return {
    family: 'F0E_ATTEMPT_2',
    attemptNo: freeze.attemptNo,
    rawSha256: loaded.rawSha256,
    rawBytes: loaded.rawBytes,
    version: freeze.version,
    corpus: freeze.corpus,
    classifier: {
      requestedModelId: freeze.classifier.requestedModelId,
      outputSchemaVersion: freeze.classifier.outputSchemaVersion,
      assemblyVersion: freeze.classifier.assemblyVersion,
    },
    rootContract: freeze,
    variants: [F0E_VARIANT],
    repairPolicy: freeze.repairPolicy,
    attempt2: freeze,
    frozenBatch: (ordinal) => {
      const batch = freeze.batching.plan.find((b) => b.ordinal === ordinal);
      if (batch === undefined) return undefined;
      return {
        ordinal: batch.ordinal,
        organisationId: batch.organisationId,
        echeRowKey: batch.echeRowKey,
        goldIds: batch.goldIds,
        docIndices: batch.docIndices,
        context: batch.context,
        serializedBatchUtf8Bytes: batch.serializedBatchUtf8Bytes,
        assemblyInputSha256: batch.assemblyInputSha256,
        canonicalSerializedInputSha256: batch.canonicalSerializedInputSha256,
        // Attempt 2 schedules ONE variant. The attempt-1 comparator identities
        // stay in the freeze as provenance and are deliberately NOT answered
        // here: a manifest naming V1 or V2 under F0C has no frozen identity.
        finalInputSha256For: (variantName) =>
          variantName === F0E_VARIANT.name ? batch.finalInputSha256.PROMPT_V3_CANONICAL : undefined,
      };
    },
  };
}

/** Which family a set of freeze bytes belongs to, decided by exact raw hash — never by a caller's say-so. */
export function freezeFamilyOf(bytes: Buffer): FreezeFamily {
  const rawSha256 = createHash('sha256').update(bytes).digest('hex');
  if (rawSha256 === PROPOSED_F0E_FREEZE_RAW_SHA256) return 'F0E_ATTEMPT_2';
  if (rawSha256 === APPROVED_F0C_FREEZE_RAW_SHA256) return 'F0C_ATTEMPT_2_SUPERSEDED';
  return 'F0B_ATTEMPT_1';
}

/**
 * Loads whichever freeze the bytes are, through that family's own
 * hash-pinned loader. The superseded F0C bytes are REFUSED outright; bytes
 * that are no known freeze are refused by the F0B loader's hash check.
 */
export function resolveChildFreeze(bytes: Buffer): ChildFreezeView {
  const family = freezeFamilyOf(bytes);
  if (family === 'F0C_ATTEMPT_2_SUPERSEDED') {
    throw new F0CFreezeError(
      'CORPUS_CONFIG_OR_HASH_DRIFT',
      `the F0C freeze (${APPROVED_F0C_FREEZE_RAW_SHA256}) was superseded by F0E before any execution (Finding F1: its runtime commit exports a 60000 ms repair floor); it may not drive a child.`,
    );
  }
  return family === 'F0E_ATTEMPT_2' ? f0eView(bytes) : f0bView(bytes);
}

/**
 * Verifies a variant root for the variant a manifest names, under the
 * checks that family requires: the attempt-1 checks for an F0B variant, and
 * the attempt-1 checks PLUS the repair-module checks for the F0C V3 root.
 * A variant the family does not admit is a refusal, not a lookup miss.
 */
export async function verifyRootForVariant(
  view: ChildFreezeView,
  variantName: string,
  root: string,
  probes: VariantRootProbes,
): Promise<VariantRootVerification> {
  const variant = view.variants.find((v) => v.name === variantName);
  if (variant === undefined) {
    return {
      variantName,
      root,
      ok: false,
      checks: [
        {
          id: 'HEAD_MATCHES_FROZEN_COMMIT',
          ok: false,
          detail: `${variantName} is not a variant this freeze (${view.family}) schedules.`,
        },
      ],
      runtime: null,
      claudeCodeExecutable: null,
    };
  }
  if (view.family === 'F0E_ATTEMPT_2' && view.attempt2 !== undefined) {
    return verifyV3Root(root, view.attempt2, probes);
  }
  return verifyVariantRoot(variant, root, view.rootContract, probes);
}
