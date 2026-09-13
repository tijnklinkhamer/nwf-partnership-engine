/**
 * PHASE 2B-2D2C-F1 — reconstructing the twelve frozen logical batches.
 *
 * Implements the F0A §13.3 input-construction contract exactly: corpus line
 * order retained; original `docIndex` retained; the exact canonical
 * DEVELOPMENT `document` objects; the frozen `ClassifierBatchContext` with
 * `rootKey: null` and roots unioned by exact `rootKey` (byte-identical
 * metadata required, sorted by ordinal `rootKey`); serialized with
 * `canonicalStringify({ context, documents })`.
 *
 * The serializer and the final-identity function are INJECTED: the parent
 * passes this worktree's production implementations, the child passes the
 * ones loaded from the selected variant root, and both must agree with the
 * freeze. Every mismatch is `CORPUS_CONFIG_OR_HASH_DRIFT`.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import { createHash } from 'node:crypto';
import type { GoldCorpusItem } from '../../../orgunits/classify/evaluation/goldSchema.js';
import type { FinalIdentityInput } from '../../../orgunits/classify/finalIdentity.js';
import { FROZEN_VARIANTS, type FrozenVariantName } from './constants.js';
import {
  FreezeDriftError,
  type Freeze,
  type FrozenBatch,
  type FrozenBatchContext,
} from './freeze.js';

/** The production algorithms a reconstruction runs on — injected, never assumed. */
export interface ReconstructionAlgorithms {
  readonly canonicalStringify: (value: unknown) => string;
  readonly computeFinalInputSha256: (input: FinalIdentityInput) => string;
  readonly ruleVersion: string;
  readonly fetchPolicyVersion: string;
  readonly assemblyVersion: string;
  readonly outputSchemaVersion: string;
}

export interface ReconstructedBatch {
  readonly ordinal: number;
  readonly organisationId: string;
  readonly echeRowKey: string;
  readonly organisationName: string;
  readonly goldIds: readonly string[];
  readonly docIndices: readonly number[];
  readonly corpusLineNumbers: readonly number[];
  readonly context: FrozenBatchContext;
  readonly documents: readonly GoldCorpusItem['document'][];
  /** The exact bytes a provider call sends as `serializedBatch`. */
  readonly serialized: string;
  readonly serializedBatchUtf8Bytes: number;
  readonly assemblyInputSha256: string;
  readonly finalInputSha256: Readonly<Record<FrozenVariantName, string>>;
}

const ordinalCompare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function commonValue<K extends 'organisationName' | 'echeRowKey' | 'countryCode' | 'runId'>(
  rows: readonly GoldCorpusItem[],
  key: K,
): GoldCorpusItem[K] {
  const distinct = new Set(rows.map((row) => row[key]));
  if (distinct.size !== 1) {
    throw new FreezeDriftError(
      'CORPUS_CONFIG_OR_HASH_DRIFT',
      `${key} disagrees within organisation ${rows[0]!.organisationId}; construction stops.`,
    );
  }
  return rows[0]![key];
}

function unionRoots(documents: readonly GoldCorpusItem['document'][]): FrozenBatchContext['roots'] {
  const byKey = new Map<string, FrozenBatchContext['roots'][number]>();
  for (const document of documents) {
    for (const root of document.roots) {
      const seen = byKey.get(root.rootKey);
      if (seen === undefined) {
        byKey.set(root.rootKey, {
          rootKey: root.rootKey,
          authorityKind: root.authorityKind,
          url: root.url,
        });
      } else if (seen.authorityKind !== root.authorityKind || seen.url !== root.url) {
        throw new FreezeDriftError(
          'CORPUS_CONFIG_OR_HASH_DRIFT',
          `root ${root.rootKey} carries disagreeing metadata; no version is chosen.`,
        );
      }
    }
  }
  return [...byKey.values()].sort((a, b) => ordinalCompare(a.rootKey, b.rootKey));
}

/** Groups DEVELOPMENT rows by first appearance of `organisationId`, in corpus order. */
export function reconstructFrozenBatches(
  rows: readonly GoldCorpusItem[],
  algorithms: ReconstructionAlgorithms,
): ReconstructedBatch[] {
  const groups = new Map<string, { rows: GoldCorpusItem[]; lines: number[] }>();
  for (const [index, row] of rows.entries()) {
    const group = groups.get(row.organisationId);
    if (group === undefined) groups.set(row.organisationId, { rows: [row], lines: [index + 1] });
    else {
      group.rows.push(row);
      group.lines.push(index + 1);
    }
  }
  return [...groups.entries()].map(([organisationId, group], index) => {
    const documents = group.rows.map((row) => row.document);
    const context: FrozenBatchContext = {
      organisationName: commonValue(group.rows, 'organisationName'),
      echeRowKey: commonValue(group.rows, 'echeRowKey'),
      countryCode: commonValue(group.rows, 'countryCode'),
      runId: commonValue(group.rows, 'runId'),
      ruleVersion: algorithms.ruleVersion,
      fetchPolicyVersion: algorithms.fetchPolicyVersion,
      assemblyVersion: algorithms.assemblyVersion,
      rootKey: null,
      roots: unionRoots(documents),
    };
    const serialized = algorithms.canonicalStringify({ context, documents });
    const assemblyInputSha256 = createHash('sha256').update(serialized, 'utf8').digest('hex');
    const finalInputSha256 = Object.fromEntries(
      FROZEN_VARIANTS.map((variant) => [
        variant.name,
        algorithms.computeFinalInputSha256({
          assemblyInputSha256,
          promptVersion: variant.promptVersion,
          outputSchemaVersion: algorithms.outputSchemaVersion,
        }),
      ]),
    ) as Record<FrozenVariantName, string>;
    return {
      ordinal: index + 1,
      organisationId,
      echeRowKey: context.echeRowKey,
      organisationName: context.organisationName,
      goldIds: group.rows.map((row) => row.goldId),
      docIndices: group.rows.map((row) => row.docIndex),
      corpusLineNumbers: group.lines,
      context,
      documents,
      serialized,
      serializedBatchUtf8Bytes: Buffer.byteLength(serialized, 'utf8'),
      assemblyInputSha256,
      finalInputSha256,
    };
  });
}

/**
 * Every frozen value must equal the reconstruction. Returns the list of
 * mismatches (empty when none) so callers can stop with the exact reason.
 */
export function batchMismatches(
  plan: readonly FrozenBatch[],
  batches: readonly ReconstructedBatch[],
  canonicalStringify: (value: unknown) => string,
): string[] {
  const mismatches: string[] = [];
  if (plan.length !== batches.length)
    mismatches.push(`batch count ${batches.length} != ${plan.length}`);
  for (const [index, frozen] of plan.entries()) {
    const batch = batches[index];
    if (batch === undefined) break;
    const tag = `${frozen.ordinal}`;
    if (frozen.ordinal !== batch.ordinal) mismatches.push(`${tag}:ordinal`);
    if (frozen.organisationId !== batch.organisationId) mismatches.push(`${tag}:organisationId`);
    if (frozen.echeRowKey !== batch.echeRowKey) mismatches.push(`${tag}:echeRowKey`);
    if (frozen.organisationName !== batch.organisationName)
      mismatches.push(`${tag}:organisationName`);
    if (frozen.documentCount !== batch.documents.length) mismatches.push(`${tag}:documentCount`);
    if (JSON.stringify(frozen.goldIds) !== JSON.stringify(batch.goldIds))
      mismatches.push(`${tag}:goldIds`);
    if (JSON.stringify(frozen.docIndices) !== JSON.stringify(batch.docIndices)) {
      mismatches.push(`${tag}:docIndices`);
    }
    if (JSON.stringify(frozen.corpusLineNumbers) !== JSON.stringify(batch.corpusLineNumbers)) {
      mismatches.push(`${tag}:corpusLineNumbers`);
    }
    if (canonicalStringify(frozen.context) !== canonicalStringify(batch.context)) {
      mismatches.push(`${tag}:context`);
    }
    if (frozen.serializedBatchUtf8Bytes !== batch.serializedBatchUtf8Bytes) {
      mismatches.push(`${tag}:serializedBatchUtf8Bytes`);
    }
    if (frozen.assemblyInputSha256 !== batch.assemblyInputSha256)
      mismatches.push(`${tag}:assemblyInputSha256`);
    if (frozen.canonicalSerializedInputSha256 !== batch.assemblyInputSha256) {
      mismatches.push(`${tag}:canonicalSerializedInputSha256`);
    }
    for (const variant of FROZEN_VARIANTS) {
      if (frozen.finalInputSha256[variant.name] !== batch.finalInputSha256[variant.name]) {
        mismatches.push(`${tag}:finalInputSha256.${variant.name}`);
      }
    }
  }
  return mismatches;
}

/** Reconstructs and verifies in one step; throws `CORPUS_CONFIG_OR_HASH_DRIFT` on any mismatch. */
export function reconstructAndVerifyFrozenBatches(
  freeze: Freeze,
  rows: readonly GoldCorpusItem[],
  algorithms: ReconstructionAlgorithms,
): ReconstructedBatch[] {
  const construction = freeze.inputConstruction.context;
  const versionProblems: string[] = [];
  if (construction.ruleVersion !== algorithms.ruleVersion) versionProblems.push('ruleVersion');
  if (construction.fetchPolicyVersion !== algorithms.fetchPolicyVersion) {
    versionProblems.push('fetchPolicyVersion');
  }
  if (construction.assemblyVersion !== algorithms.assemblyVersion)
    versionProblems.push('assemblyVersion');
  if (freeze.classifier.assemblyVersion !== algorithms.assemblyVersion) {
    versionProblems.push('classifier.assemblyVersion');
  }
  if (freeze.classifier.outputSchemaVersion !== algorithms.outputSchemaVersion) {
    versionProblems.push('outputSchemaVersion');
  }
  if (versionProblems.length > 0) {
    throw new FreezeDriftError(
      'CORPUS_CONFIG_OR_HASH_DRIFT',
      `production version constants differ from the freeze: ${versionProblems.join(', ')}.`,
    );
  }
  const batches = reconstructFrozenBatches(rows, algorithms);
  const mismatches = batchMismatches(freeze.batching.plan, batches, algorithms.canonicalStringify);
  if (mismatches.length > 0) {
    throw new FreezeDriftError(
      'CORPUS_CONFIG_OR_HASH_DRIFT',
      `reconstructed batches differ from the freeze: ${mismatches.join(', ')}.`,
    );
  }
  return batches;
}
