/**
 * PHASE 2B-2D2C-F0D/F0J — ONE child-facing VIEW over the freeze families.
 *
 * The Tier-2 child, the coordinator and the child entry need a handful of
 * facts about "the freeze this manifest names": its raw hash, the corpus
 * paths and hashes, the classifier identities, the variants it admits, one
 * frozen batch by ordinal with the final identity for a named variant, and
 * the repair policy. F0B (attempt 1, two variants, no repair policy), F0E
 * (attempt 2, one variant, repair enabled; F0C is recognised only to be
 * refused as superseded), F0I (attempt 3, one variant, repair enabled) and
 * F0O (attempt 4, one variant, repair enabled) answer those questions from
 * different schemas with different hash pins. This module resolves WHICH
 * family a set of bytes belongs to BY HASH — the F0O hash selects the F0O
 * loader, the F0I hash selects the F0I loader, the F0E hash selects the F0E
 * loader, the superseded F0C hash is refused, anything else goes to the F0B
 * loader, which refuses everything but the F0B bytes — and returns the
 * common view. No loader is changed, and none learns about another.
 *
 * `finalInputSha256For` answers `undefined` for a variant the family does
 * not schedule: an attempt-2 manifest naming PROMPT_V1_CANONICAL or
 * PROMPT_V2_CANONICAL, an attempt-3 manifest naming any of
 * PROMPT_V1_CANONICAL/PROMPT_V2_CANONICAL/PROMPT_V3_CANONICAL, or an
 * attempt-4 manifest naming any of PROMPT_V1_CANONICAL/PROMPT_V2_CANONICAL/
 * PROMPT_V3_CANONICAL/PROMPT_V4_CANONICAL, therefore fails the child's
 * identity check — exactly the "no prior variant is ever scheduled again"
 * invariant, enforced where the request would otherwise be built.
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
import type { Attempt3Freeze } from '../f0i/attempt3FreezeCore.js';
import {
  F0I_VARIANT,
  loadF0IFreezeFromBytes,
  PROPOSED_F0I_FREEZE_RAW_SHA256,
} from '../f0i/freezeF0I.js';
import { verifyV4Root } from '../f0i/variantRootF0I.js';
import type { Attempt4Freeze } from '../f0o/attempt4FreezeCore.js';
import {
  F0O_VARIANT,
  loadF0OFreezeFromBytes,
  PROPOSED_F0O_FREEZE_RAW_SHA256,
} from '../f0o/freezeF0O.js';
import { verifyV5Root } from '../f0o/variantRootF0O.js';

/**
 * `F0C_ATTEMPT_2_SUPERSEDED` is recognised only to be REFUSED: Finding F1
 * superseded F0C before any execution, so its bytes may never drive a child.
 */
export type FreezeFamily =
  | 'F0B_ATTEMPT_1'
  | 'F0E_ATTEMPT_2'
  | 'F0C_ATTEMPT_2_SUPERSEDED'
  | 'F0I_ATTEMPT_3'
  | 'F0O_ATTEMPT_4';

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
  /** Present exactly when the freeze declares one (F0C/F0I); absent on F0B, which `freezeRepairPolicy` reads as DISABLED. */
  readonly repairPolicy?: FrozenRepairPolicy;
  frozenBatch(ordinal: number): FrozenBatchView | undefined;
  /** The attempt-2 freeze itself, present only for the F0E family (the V3 root verifier needs its repair contract). */
  readonly attempt2?: Attempt2Freeze;
  /** The attempt-3 freeze itself, present only for the F0I family (the V4 root verifier needs its repair contract). */
  readonly attempt3?: Attempt3Freeze;
  /** The attempt-4 freeze itself, present only for the F0O family (the V5 root verifier needs its repair contract). */
  readonly attempt4?: Attempt4Freeze;
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

function f0iView(bytes: Buffer): ChildFreezeView {
  const loaded = loadF0IFreezeFromBytes(bytes);
  const { freeze } = loaded;
  return {
    family: 'F0I_ATTEMPT_3',
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
    variants: [F0I_VARIANT],
    repairPolicy: freeze.repairPolicy,
    attempt3: freeze,
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
        // Attempt 3 schedules ONE variant. The attempt-1 and attempt-2
        // comparator identities stay in the freeze as provenance and are
        // deliberately NOT answered here: a manifest naming V1, V2 or V3
        // under F0I has no frozen identity.
        finalInputSha256For: (variantName) =>
          variantName === F0I_VARIANT.name ? batch.finalInputSha256.PROMPT_V4_CANONICAL : undefined,
      };
    },
  };
}

function f0oView(bytes: Buffer): ChildFreezeView {
  const loaded = loadF0OFreezeFromBytes(bytes);
  const { freeze } = loaded;
  return {
    family: 'F0O_ATTEMPT_4',
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
    variants: [F0O_VARIANT],
    repairPolicy: freeze.repairPolicy,
    attempt4: freeze,
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
        // Attempt 4 schedules ONE variant. The attempt-1, attempt-2 and
        // attempt-3 comparator identities stay in the freeze as provenance
        // and are deliberately NOT answered here: a manifest naming V1, V2,
        // V3 or V4 under F0O has no frozen identity.
        finalInputSha256For: (variantName) =>
          variantName === F0O_VARIANT.name ? batch.finalInputSha256.PROMPT_V5_CANONICAL : undefined,
      };
    },
  };
}

/** Which family a set of freeze bytes belongs to, decided by exact raw hash — never by a caller's say-so. */
export function freezeFamilyOf(bytes: Buffer): FreezeFamily {
  const rawSha256 = createHash('sha256').update(bytes).digest('hex');
  if (rawSha256 === PROPOSED_F0O_FREEZE_RAW_SHA256) return 'F0O_ATTEMPT_4';
  if (rawSha256 === PROPOSED_F0I_FREEZE_RAW_SHA256) return 'F0I_ATTEMPT_3';
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
  if (family === 'F0O_ATTEMPT_4') return f0oView(bytes);
  if (family === 'F0I_ATTEMPT_3') return f0iView(bytes);
  return family === 'F0E_ATTEMPT_2' ? f0eView(bytes) : f0bView(bytes);
}

/**
 * Verifies a variant root for the variant a manifest names, under the
 * checks that family requires: the attempt-1 checks for an F0B variant, and
 * the attempt-1 checks PLUS the repair-module checks for an F0C/F0E V3 root
 * or an F0I V4 root. A variant the family does not admit is a refusal, not
 * a lookup miss.
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
  if (view.family === 'F0O_ATTEMPT_4' && view.attempt4 !== undefined) {
    return verifyV5Root(root, view.attempt4, probes);
  }
  if (view.family === 'F0I_ATTEMPT_3' && view.attempt3 !== undefined) {
    return verifyV4Root(root, view.attempt3, probes);
  }
  if (view.family === 'F0E_ATTEMPT_2' && view.attempt2 !== undefined) {
    return verifyV3Root(root, view.attempt2, probes);
  }
  return verifyVariantRoot(variant, root, view.rootContract, probes);
}
