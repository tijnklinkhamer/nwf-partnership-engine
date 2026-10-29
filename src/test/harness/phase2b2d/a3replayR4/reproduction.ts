/**
 * PHASE 2B-2D — A3 R47: THE FRESH EIGHT-CHECKPOINT HISTORICAL REPRODUCTION GATE.
 *
 * WHY R47 REPRODUCES ANYTHING AT ALL
 *
 *   The twenty canonical DEV_TRAIN document authorities are private
 *   in-process objects: R21 (5 slots), R27 (1), R34 (7) and R40 (7) were each
 *   minted in an earlier process and cannot be loaded from disk. Their
 *   committed censuses are AGGREGATE HISTORY, not authority. So a real R47 run
 *   freshly re-mints R20 -> R21, R26 -> R27, R33 -> R34 and R39 -> R40 in ONE
 *   process, through each layer's own unchanged landed binder, purely to hold
 *   the genuine document objects and their private text capabilities. No new
 *   document semantics and no new document version is created.
 *
 * WHAT THIS GATE PROVES
 *
 *   For all EIGHT checkpoints it re-derives the public census with that
 *   layer's OWN landed derivation function, over the fresh minted objects,
 *   and requires semantic equality with the committed record at EVERY path.
 *   The only excluded field is top-level `implementationCommit` - the commit
 *   the fresh run executes at, which is execution provenance by construction.
 *   Predecessor tips and scope pins are fixed historical facts of each slice
 *   and are passed exactly as each slice recorded them, so they are compared
 *   too. The committed record bytes are pinned by SHA-256 and length.
 *
 *   It also requires each document batch to trace, through that layer's own
 *   landed provenance accessor, to exactly the evidence batch whose census
 *   was compared, and every caller-owned upstream pool to be CLOSED. Only then
 *   is a proof minted, bound by identity to the four exact document batches.
 *
 * THIS MODULE ISSUES NO SQL. It runs after the database work is over.
 */
import { createHash } from 'node:crypto';
import { deriveR20PublicBindingCensus } from '../a3evidence/census.js';
import type { ReadOnlyTransactionProof } from '../a3evidence/database.js';
import { deriveR21PublicDocumentSourceCensus } from '../a3documents/census.js';
import { durableEvidenceBatchForDocumentSourceBatch } from '../a3documents/devTrain.js';
import { deriveR26PublicIncrementalEvidenceCensus } from '../a3evidenceV2/census.js';
import { deriveR27PublicIncrementalDocumentSourceCensus } from '../a3documentsV2/census.js';
import { evidenceDeltaBatchForDocumentSourceDeltaBatch } from '../a3documentsV2/devTrain.js';
import { deriveR33PublicIncrementalEvidenceCensus } from '../a3evidenceV4/census.js';
import { deriveR34PublicIncrementalDocumentSourceCensus } from '../a3documentsV4/census.js';
import { evidenceDeltaBatchForDocumentSourceDeltaBatchV4 } from '../a3documentsV4/devTrain.js';
import { deriveR39PublicIncrementalEvidenceCensus } from '../a3evidenceV5/census.js';
import { deriveR40PublicIncrementalDocumentSourceCensus } from '../a3documentsV5/census.js';
import { evidenceDeltaBatchForDocumentSourceDeltaBatchV5 } from '../a3documentsV5/devTrain.js';
import { refuseR47 } from './refusal.js';

export const R47_REPRODUCTION_EXCLUDED_FIELDS = Object.freeze(['implementationCommit'] as const);

export type R47Checkpoint = 'R20' | 'R21' | 'R26' | 'R27' | 'R33' | 'R34' | 'R39' | 'R40';
export const R47_CHECKPOINTS: readonly R47Checkpoint[] = Object.freeze([
  'R20',
  'R21',
  'R26',
  'R27',
  'R33',
  'R34',
  'R39',
  'R40',
]);

/** The committed census each checkpoint is compared with, pinned by bytes. */
export const R47_COMMITTED_CENSUS: Readonly<
  Record<R47Checkpoint, { readonly path: string; readonly sha256: string; readonly bytes: number }>
> = Object.freeze({
  R20: {
    path: 'docs/evaluation/PHASE_2B_2D_A3_R20_DEV_TRAIN_DURABLE_EVIDENCE_BINDING_CENSUS_V1.json',
    sha256: '8e15c65a1673a9540fb85b1dbc7583b8b7925e4f788ecbce50b053c43fd05102',
    bytes: 2676,
  },
  R21: {
    path: 'docs/evaluation/PHASE_2B_2D_A3_R21_DEV_TRAIN_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1.json',
    sha256: '7aaad302dba31d7a8fa7e053fd110342d9ef1b1f3dadf1a107dc9e68bc398b54',
    bytes: 2929,
  },
  R26: {
    path: 'docs/evaluation/PHASE_2B_2D_A3_R26_DEV_TRAIN_INCREMENTAL_DURABLE_EVIDENCE_CENSUS_V1.json',
    sha256: '61f83b668bc9d0255af115750422c0bc2eebd4892bc1af9efd847f5085dfcdcf',
    bytes: 3568,
  },
  R27: {
    path: 'docs/evaluation/PHASE_2B_2D_A3_R27_DEV_TRAIN_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1.json',
    sha256: '9cba69790e91bf2487ca4979e01d41d55edd84014504c027259d9e87723305f1',
    bytes: 3789,
  },
  R33: {
    path: 'docs/evaluation/PHASE_2B_2D_A3_R33_DEV_TRAIN_INCREMENTAL_DURABLE_EVIDENCE_CENSUS_V1.json',
    sha256: '2a1db5daba201a05dceea97c56d8bffe3e07eb950e8d7b7c968a709e17cae0b7',
    bytes: 4791,
  },
  R34: {
    path: 'docs/evaluation/PHASE_2B_2D_A3_R34_DEV_TRAIN_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1.json',
    sha256: '8200ebb2cbf7414175303c7f57556c6c4e33d8d9902dfde49e2490dfb21f4a98',
    bytes: 4618,
  },
  R39: {
    path: 'docs/evaluation/PHASE_2B_2D_A3_R39_DEV_TRAIN_INCREMENTAL_DURABLE_EVIDENCE_CENSUS_V1.json',
    sha256: '78cf926bbf79fd71fd56fe66489b6ddc2d1826b7bcc26be87071930ba5c4bdde',
    bytes: 7777,
  },
  R40: {
    path: 'docs/evaluation/PHASE_2B_2D_A3_R40_DEV_TRAIN_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1.json',
    sha256: '1e6e268b384987da21650c9e8fae6be4086aa44975e6a5aa10faa5cf6129ac3d',
    bytes: 7450,
  },
});

/**
 * The predecessor tips and scope pins each slice recorded about ITSELF. They
 * are historical facts of that slice, not of this run, so they are passed
 * unchanged and compared like any other field.
 */
export const R47_HISTORICAL_PROVENANCE = Object.freeze({
  R20: { r19Tip: '6369b28408dd99b0edca86c7fb0e5376bdccf68a' },
  R21: { r20Tip: '4cd917817437bd7c04f29938694e7ba8c1078019' },
  R26: { r25Tip: '77883886c1213dbf8cd4cff24009813e7d9e09c9' },
  R27: { r26Tip: 'dab9df3e74ef1d681bb9b86f46bfc8ee0c4f5b3d' },
  R33: {
    r32Tip: '747b64fa40c93e4b871ea1675682fb1531b21341',
    r32ScopePinCommit: '52262d45dfa48e052534aff2afdb41fb69330e2c',
  },
  R34: {
    r33Tip: '31f389c8e1b6338d45a533b01feb6a2f6d932678',
    r33ScopePinCommit: 'c80f0eee63718f37d6ff4e81cdda6ac7ba6a5fb9',
  },
  R39: {
    r38bTip: '834b3d99e41044ec5c93ec8ec905b4c2887c6ae8',
    r38bScopePinCommit: '904281b8fa0b155c0522b41996c9731231869659',
  },
  R40: {
    r39Tip: 'b4838059207216c4c4487dd816b3f3dae827166d',
    r39ScopePinCommit: '253aa1115e5a1354f4c00c7a95a3d6850113a987',
  },
});

/** The two pool properties the gate reads. pg's `Pool` satisfies this shape. */
export interface ClosedPoolObservation {
  readonly ended: boolean;
  readonly totalCount: number;
}

/**
 * Every fresh minted object the eight derivations need. All are the exact
 * objects the landed binders returned; none is constructed here.
 */
type Arg<F extends (...args: never[]) => unknown, I extends number> = Parameters<F>[I];

/**
 * Every fresh minted object the eight derivations need, typed by the landed
 * derivations' own parameters. All are the exact objects the landed binders
 * returned; none is constructed here, and each derivation brand-checks its own.
 */
export interface R47HistoricalReproductionInput {
  /** The commit this fresh reproduction executes at. Execution provenance only. */
  readonly implementationCommit: string;
  readonly r20: {
    readonly evidenceBatch: Arg<typeof deriveR20PublicBindingCensus, 0>;
    readonly transactionProof: ReadOnlyTransactionProof;
  };
  readonly r21: { readonly documentBatch: Arg<typeof deriveR21PublicDocumentSourceCensus, 0> };
  readonly r26: {
    readonly evidenceBatch: Arg<typeof deriveR26PublicIncrementalEvidenceCensus, 0>;
    readonly transactionProof: ReadOnlyTransactionProof;
    readonly driftProof: Arg<typeof deriveR26PublicIncrementalEvidenceCensus, 2>;
  };
  readonly r27: {
    readonly documentBatch: Arg<typeof deriveR27PublicIncrementalDocumentSourceCensus, 0>;
    readonly historicalBaseline: Arg<typeof deriveR27PublicIncrementalDocumentSourceCensus, 1>;
  };
  readonly r33: {
    readonly evidenceBatch: Arg<typeof deriveR33PublicIncrementalEvidenceCensus, 0>;
    readonly transactionProof: ReadOnlyTransactionProof;
    readonly driftProof: Arg<typeof deriveR33PublicIncrementalEvidenceCensus, 2>;
    readonly historyProof: Arg<typeof deriveR33PublicIncrementalEvidenceCensus, 3>;
  };
  readonly r34: {
    readonly documentBatch: Arg<typeof deriveR34PublicIncrementalDocumentSourceCensus, 0>;
    readonly historicalBaseline: Arg<typeof deriveR34PublicIncrementalDocumentSourceCensus, 1>;
  };
  readonly r39: {
    readonly evidenceBatch: Arg<typeof deriveR39PublicIncrementalEvidenceCensus, 0>;
    readonly transactionProof: ReadOnlyTransactionProof;
    readonly driftProof: Arg<typeof deriveR39PublicIncrementalEvidenceCensus, 2>;
    readonly historyProof: Arg<typeof deriveR39PublicIncrementalEvidenceCensus, 3>;
  };
  readonly r40: {
    readonly documentBatch: Arg<typeof deriveR40PublicIncrementalDocumentSourceCensus, 0>;
    readonly historicalProof: Arg<typeof deriveR40PublicIncrementalDocumentSourceCensus, 1>;
  };
  /** Every caller-owned pool used upstream. Each must already be ended. */
  readonly upstreamPools: readonly ClosedPoolObservation[];
}

export interface R47CheckpointReproduction {
  readonly checkpoint: R47Checkpoint;
  readonly committedRecordPath: string;
  readonly committedRecordSha256: string;
  readonly comparedTopLevelFieldCount: number;
  readonly differingSemanticPathCount: 0;
}

export interface R47HistoricalReproductionProof {
  readonly kind: 'R47_FRESH_EIGHT_CHECKPOINT_HISTORICAL_REPRODUCTION_PROOF';
  readonly excludedFields: typeof R47_REPRODUCTION_EXCLUDED_FIELDS;
  readonly checkpoints: readonly R47CheckpointReproduction[];
  readonly upstreamPoolsClosed: number;
}

export interface R47ReproducedDocumentBatches {
  readonly r21: unknown;
  readonly r27: unknown;
  readonly r34: unknown;
  readonly r40: unknown;
}

const PROOFS = new WeakSet<object>();
const BATCHES_BY_PROOF = new WeakMap<object, R47ReproducedDocumentBatches>();

// ---------------------------------------------------------------------------
// A. THE SEMANTIC COMPARISON.
// ---------------------------------------------------------------------------

function collectDiff(fresh: unknown, committed: unknown, path: string, into: string[]): void {
  const freshObject = typeof fresh === 'object' && fresh !== null;
  const committedObject = typeof committed === 'object' && committed !== null;
  if (freshObject && committedObject && Array.isArray(fresh) === Array.isArray(committed)) {
    if (Array.isArray(fresh) && Array.isArray(committed)) {
      if (fresh.length !== committed.length) {
        into.push(`${path}.length`);
        return;
      }
      fresh.forEach((value, i) => collectDiff(value, committed[i], `${path}[${String(i)}]`, into));
      return;
    }
    const keys = new Set([...Object.keys(fresh), ...Object.keys(committed)]);
    for (const key of [...keys].sort()) {
      collectDiff(
        (fresh as Record<string, unknown>)[key],
        (committed as Record<string, unknown>)[key],
        path === '' ? key : `${path}.${key}`,
        into,
      );
    }
    return;
  }
  if (fresh !== committed) into.push(path === '' ? '$' : path);
}

/**
 * Every semantic path at which a fresh census differs from a committed one,
 * key order ignored. The fresh value is JSON-normalised first, exactly as it
 * would have been written. Only top-level `implementationCommit` is excluded.
 * Returns PATHS only, never a value.
 */
export function historicalCensusDriftPathsR4(
  fresh: unknown,
  committed: unknown,
): readonly string[] {
  const normalise = (value: unknown): unknown =>
    value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as unknown);
  const strip = (value: unknown): unknown => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
    const copy: Record<string, unknown> = { ...(value as Record<string, unknown>) };
    for (const field of R47_REPRODUCTION_EXCLUDED_FIELDS) delete copy[field];
    return copy;
  };
  const differing: string[] = [];
  collectDiff(strip(normalise(fresh)), strip(committed), '', differing);
  return Object.freeze(differing);
}

// ---------------------------------------------------------------------------
// B. THE GATE.
// ---------------------------------------------------------------------------

function inputError(message: string): never {
  refuseR47('R47_HISTORICAL_REPRODUCTION_INPUT_INVALID', message);
}

function committedRecord(checkpoint: R47Checkpoint, bytes: unknown): unknown {
  const pinned = R47_COMMITTED_CENSUS[checkpoint];
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length !== pinned.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== pinned.sha256
  ) {
    refuseR47(
      'R47_COMMITTED_CENSUS_BYTES_MISMATCH',
      `${checkpoint}: the supplied committed census bytes are not the pinned record`,
    );
  }
  return JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown;
}

/**
 * Re-derives all eight censuses with their own landed functions, requires
 * zero differing semantic paths against each pinned committed record, the
 * four document -> evidence provenance links, and every upstream pool closed.
 * Mints a proof bound to exactly the four document batches.
 */
export function requireFreshHistoricalReproductionR4(
  input: R47HistoricalReproductionInput,
  committedBytes: Readonly<Record<R47Checkpoint, Uint8Array>>,
): R47HistoricalReproductionProof {
  if (typeof input !== 'object' || input === null) inputError('the input is not an object');
  if (typeof input.implementationCommit !== 'string' || input.implementationCommit.length === 0) {
    inputError('the implementation commit is missing');
  }
  if (
    !Array.isArray(input.upstreamPools) ||
    input.upstreamPools.length === 0 ||
    input.upstreamPools.some(
      (pool) =>
        typeof pool !== 'object' || pool === null || pool.ended !== true || pool.totalCount !== 0,
    )
  ) {
    inputError('every caller-owned upstream pool must be ended, with no client, before R47 work');
  }
  // The four document -> evidence provenance links, through each layer's own accessor.
  if (
    durableEvidenceBatchForDocumentSourceBatch(input.r21.documentBatch) !==
      input.r20.evidenceBatch ||
    evidenceDeltaBatchForDocumentSourceDeltaBatch(input.r27.documentBatch) !==
      input.r26.evidenceBatch ||
    evidenceDeltaBatchForDocumentSourceDeltaBatchV4(input.r34.documentBatch) !==
      input.r33.evidenceBatch ||
    evidenceDeltaBatchForDocumentSourceDeltaBatchV5(input.r40.documentBatch) !==
      input.r39.evidenceBatch
  ) {
    inputError('a document batch does not trace to the evidence batch whose census is compared');
  }

  const commit = input.implementationCommit;
  const p = R47_HISTORICAL_PROVENANCE;
  const fresh: Record<R47Checkpoint, () => unknown> = {
    R20: () =>
      deriveR20PublicBindingCensus(input.r20.evidenceBatch, input.r20.transactionProof, {
        ...p.R20,
        implementationCommit: commit,
      }),
    R21: () =>
      deriveR21PublicDocumentSourceCensus(input.r21.documentBatch, {
        ...p.R21,
        implementationCommit: commit,
      }),
    R26: () =>
      deriveR26PublicIncrementalEvidenceCensus(
        input.r26.evidenceBatch,
        input.r26.transactionProof,
        input.r26.driftProof,
        { ...p.R26, implementationCommit: commit },
      ),
    R27: () =>
      deriveR27PublicIncrementalDocumentSourceCensus(
        input.r27.documentBatch,
        input.r27.historicalBaseline,
        { ...p.R27, implementationCommit: commit },
      ),
    R33: () =>
      deriveR33PublicIncrementalEvidenceCensus(
        input.r33.evidenceBatch,
        input.r33.transactionProof,
        input.r33.driftProof,
        input.r33.historyProof,
        { ...p.R33, implementationCommit: commit },
      ),
    R34: () =>
      deriveR34PublicIncrementalDocumentSourceCensus(
        input.r34.documentBatch,
        input.r34.historicalBaseline,
        { ...p.R34, implementationCommit: commit },
      ),
    R39: () =>
      deriveR39PublicIncrementalEvidenceCensus(
        input.r39.evidenceBatch,
        input.r39.transactionProof,
        input.r39.driftProof,
        input.r39.historyProof,
        { ...p.R39, implementationCommit: commit },
      ),
    R40: () =>
      deriveR40PublicIncrementalDocumentSourceCensus(
        input.r40.documentBatch,
        input.r40.historicalProof,
        { ...p.R40, implementationCommit: commit },
      ),
  };

  const checkpoints: R47CheckpointReproduction[] = [];
  for (const checkpoint of R47_CHECKPOINTS) {
    const committed = committedRecord(checkpoint, committedBytes?.[checkpoint]);
    let census: unknown;
    try {
      census = fresh[checkpoint]();
    } catch (error) {
      refuseR47(
        'STOP_R47_HISTORICAL_CENSUS_REPRODUCTION_DRIFT',
        `${checkpoint}: the landed census derivation refused the fresh objects`,
        { cause: error },
      );
    }
    const differing = historicalCensusDriftPathsR4(census, committed);
    if (differing.length > 0) {
      refuseR47(
        'STOP_R47_HISTORICAL_CENSUS_REPRODUCTION_DRIFT',
        `${checkpoint}: the fresh census differs from the committed one at ${String(differing.length)} path(s): ${differing.join(', ')}`,
      );
    }
    checkpoints.push(
      Object.freeze({
        checkpoint,
        committedRecordPath: R47_COMMITTED_CENSUS[checkpoint].path,
        committedRecordSha256: R47_COMMITTED_CENSUS[checkpoint].sha256,
        comparedTopLevelFieldCount:
          Object.keys(committed as object).length -
          R47_REPRODUCTION_EXCLUDED_FIELDS.filter((f) => f in (committed as object)).length,
        differingSemanticPathCount: 0 as const,
      }),
    );
  }

  const proof: R47HistoricalReproductionProof = Object.freeze({
    kind: 'R47_FRESH_EIGHT_CHECKPOINT_HISTORICAL_REPRODUCTION_PROOF' as const,
    excludedFields: R47_REPRODUCTION_EXCLUDED_FIELDS,
    checkpoints: Object.freeze(checkpoints),
    upstreamPoolsClosed: input.upstreamPools.length,
  });
  PROOFS.add(proof);
  BATCHES_BY_PROOF.set(
    proof,
    Object.freeze({
      r21: input.r21.documentBatch,
      r27: input.r27.documentBatch,
      r34: input.r34.documentBatch,
      r40: input.r40.documentBatch,
    }),
  );
  return proof;
}

/** The four document batches a minted proof was proved for, or `undefined`. */
export function reproducedDocumentBatchesForProof(
  proof: unknown,
): R47ReproducedDocumentBatches | undefined {
  if (typeof proof !== 'object' || proof === null || !PROOFS.has(proof)) return undefined;
  return BATCHES_BY_PROOF.get(proof);
}
