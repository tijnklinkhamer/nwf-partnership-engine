/**
 * PHASE 2B-2D — A3 R38A: GENERATION-QUALIFIED OCCUPANT IDENTITY.
 *
 * A reserve's identity is (namespace, namespace-local position, the digest
 * that namespace's own frozen source assigns it). Generation-1 reserve 0 and
 * Generation-2 reserve 0 are different identities because their namespaces
 * differ, whatever the number says. There is no global reserve position, and
 * no Generation-2 reserve ever carries a draw-entry digest. PURE.
 */
import type { Split } from '../a3prep/contracts.js';
import { refuseCrossGeneration } from './refusal.js';
import {
  GENERATION1_DRAW_RESERVE,
  GENERATION1_ID,
  GENERATION2_FIRST_SOURCE_FRAME_RANK,
  GENERATION2_ID,
  GENERATION2_RESERVE_COUNT,
  GENERATION2_RESERVE_SCHEDULE,
  type CrossGenerationId,
  type CrossGenerationRecordBinding,
  type CrossGenerationSourceIdentity,
  type Generation1DrawReserveEntry,
  type Generation1DrawSelectionEntry,
  type Generation1ReserveSourceIdentity,
  type Generation2ReserveSourceIdentity,
  type Generation2ScheduleEntry,
  type PrimarySourceIdentity,
} from './types.js';
import { GENERATION_1_RESERVE_ORGANISATIONS, SPLITS } from '../a3prep/contracts.js';

const LOWER_HEX_SHA256 = /^[0-9a-f]{64}$/;
const FULL_COMMIT = /^[0-9a-f]{40}$/;
const EVALUATION_RECORD_PATH = /^docs\/evaluation\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.json$/;

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isIntegerIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

export function isHex(value: unknown): value is string {
  return typeof value === 'string' && LOWER_HEX_SHA256.test(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function isSplit(value: unknown): value is Split {
  return (SPLITS as readonly unknown[]).includes(value);
}

export function isEvaluationPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    EVALUATION_RECORD_PATH.test(value) &&
    !value.split('/').some((segment) => segment === '..' || segment === '.')
  );
}

export function isRecordBinding(value: unknown): value is CrossGenerationRecordBinding {
  return (
    isObject(value) &&
    isEvaluationPath(value.path) &&
    isHex(value.sha256) &&
    typeof value.commit === 'string' &&
    FULL_COMMIT.test(value.commit)
  );
}

/**
 * A non-narrowing presence check for inputs that already have a declared
 * type: "a non-null, non-array object" at run time, static type kept.
 */
export function isPresentObject(value: unknown): boolean {
  return isObject(value);
}

/** Exact key-set equality: an extra or renamed field is not the same shape. */
export function hasExactKeys(value: object, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, i) => key === expected[i]);
}

/** Which generation's namespace an occupant source was drawn from. */
export function occupantGenerationOf(source: CrossGenerationSourceIdentity): CrossGenerationId {
  return source.sourceKind === 'GENERATION2_RESERVE_REPLACEMENT' ? GENERATION2_ID : GENERATION1_ID;
}

/**
 * The identity key: kind + namespace + namespace-local position + that
 * namespace's own digest + the organisation it names. Two sources are the
 * same occupant iff their keys are equal.
 */
export function sourceIdentityKey(source: CrossGenerationSourceIdentity): string {
  switch (source.sourceKind) {
    case 'PRIMARY':
      return [
        'PRIMARY',
        'GENERATION1_DRAW_SELECTION',
        String(source.selectionIndex),
        source.drawEntrySha256,
        source.echeRowKey,
        source.organisationId,
      ].join('|');
    case 'GENERATION1_RESERVE_REPLACEMENT':
      return [
        source.sourceKind,
        source.reserveNamespace,
        String(source.generation1ReserveRankPosition),
        source.drawEntrySha256,
        source.echeRowKey,
        source.organisationId,
      ].join('|');
    case 'GENERATION2_RESERVE_REPLACEMENT':
      return [
        source.sourceKind,
        source.reserveNamespace,
        String(source.generation2ReserveRankPosition),
        String(source.sourceFrameRankPosition),
        source.scheduleEntrySha256,
        source.frameEntrySha256,
        source.echeRowKey,
        source.organisationId,
      ].join('|');
  }
}

export function sameSourceIdentity(
  a: CrossGenerationSourceIdentity,
  b: CrossGenerationSourceIdentity,
): boolean {
  return sourceIdentityKey(a) === sourceIdentityKey(b);
}

const PRIMARY_KEYS = [
  'sourceKind',
  'selectionIndex',
  'drawEntrySha256',
  'echeRowKey',
  'organisationId',
] as const;
const GENERATION1_RESERVE_KEYS = [
  'sourceKind',
  'reserveNamespace',
  'generation1ReserveRankPosition',
  'drawEntrySha256',
  'echeRowKey',
  'organisationId',
] as const;
const GENERATION2_RESERVE_KEYS = [
  'sourceKind',
  'reserveNamespace',
  'generation2ReserveRankPosition',
  'sourceFrameRankPosition',
  'scheduleEntrySha256',
  'frameEntrySha256',
  'echeRowKey',
  'organisationId',
] as const;

/**
 * Structural shape of a caller-supplied source identity. The exact key set is
 * enforced per kind, so a Generation-2 reserve carrying a `drawEntrySha256`,
 * or any reserve carrying a bare `reserveRankPosition`, is not a source.
 */
export function requireSourceShape(value: unknown, at: string): CrossGenerationSourceIdentity {
  if (!isObject(value)) return refuseCrossGeneration('SOURCE_IDENTITY_INVALID', `${at} is absent`);
  const common = isNonEmptyString(value.echeRowKey) && isNonEmptyString(value.organisationId);
  switch (value.sourceKind) {
    case 'PRIMARY':
      if (
        !hasExactKeys(value, PRIMARY_KEYS) ||
        !common ||
        !isIntegerIn(value.selectionIndex, 0, Number.MAX_SAFE_INTEGER) ||
        !isHex(value.drawEntrySha256)
      ) {
        refuseCrossGeneration('SOURCE_IDENTITY_INVALID', `${at} is not a PRIMARY source identity`);
      }
      return value as unknown as PrimarySourceIdentity;
    case 'GENERATION1_RESERVE_REPLACEMENT':
      if (
        !hasExactKeys(value, GENERATION1_RESERVE_KEYS) ||
        value.reserveNamespace !== GENERATION1_DRAW_RESERVE ||
        !common ||
        !isIntegerIn(
          value.generation1ReserveRankPosition,
          0,
          GENERATION_1_RESERVE_ORGANISATIONS - 1,
        ) ||
        !isHex(value.drawEntrySha256)
      ) {
        refuseCrossGeneration(
          'SOURCE_IDENTITY_INVALID',
          `${at} is not a Generation-1 draw-reserve source identity`,
        );
      }
      return value as unknown as Generation1ReserveSourceIdentity;
    case 'GENERATION2_RESERVE_REPLACEMENT':
      if (
        !hasExactKeys(value, GENERATION2_RESERVE_KEYS) ||
        value.reserveNamespace !== GENERATION2_RESERVE_SCHEDULE ||
        !common ||
        !isIntegerIn(value.generation2ReserveRankPosition, 0, GENERATION2_RESERVE_COUNT - 1) ||
        !isIntegerIn(value.sourceFrameRankPosition, 0, Number.MAX_SAFE_INTEGER) ||
        !isHex(value.scheduleEntrySha256) ||
        !isHex(value.frameEntrySha256)
      ) {
        refuseCrossGeneration(
          'SOURCE_IDENTITY_INVALID',
          `${at} is not a Generation-2 schedule-reserve source identity`,
        );
      }
      return value as unknown as Generation2ReserveSourceIdentity;
    default:
      return refuseCrossGeneration(
        'SOURCE_IDENTITY_INVALID',
        `${at} sourceKind is not a generation-qualified occupant kind`,
      );
  }
}

// ---------------------------------------------------------------------------
// Builders: a source identity is DERIVED from its namespace's frozen entry.
// ---------------------------------------------------------------------------

export function primarySourceOf(entry: Generation1DrawSelectionEntry): PrimarySourceIdentity {
  return Object.freeze({
    sourceKind: 'PRIMARY',
    selectionIndex: entry.selectionIndex,
    drawEntrySha256: entry.drawEntrySha256,
    echeRowKey: entry.echeRowKey,
    organisationId: entry.organisationId,
  });
}

export function generation1ReserveSourceOf(
  entry: Generation1DrawReserveEntry,
): Generation1ReserveSourceIdentity {
  return Object.freeze({
    sourceKind: 'GENERATION1_RESERVE_REPLACEMENT',
    reserveNamespace: GENERATION1_DRAW_RESERVE,
    generation1ReserveRankPosition: entry.reserveRankPosition,
    drawEntrySha256: entry.drawEntrySha256,
    echeRowKey: entry.echeRowKey,
    organisationId: entry.organisationId,
  });
}

export function generation2ReserveSourceOf(
  entry: Generation2ScheduleEntry,
): Generation2ReserveSourceIdentity {
  return Object.freeze({
    sourceKind: 'GENERATION2_RESERVE_REPLACEMENT',
    reserveNamespace: GENERATION2_RESERVE_SCHEDULE,
    generation2ReserveRankPosition: entry.generation2ReserveRankPosition,
    sourceFrameRankPosition: entry.sourceFrameRankPosition,
    scheduleEntrySha256: entry.scheduleEntrySha256,
    frameEntrySha256: entry.frameEntrySha256,
    echeRowKey: entry.echeRowKey,
    organisationId: entry.organisationId,
  });
}

/** Position p of the Generation-2 schedule is frame rank 150 + p, always. */
export function expectedSourceFrameRank(generation2ReserveRankPosition: number): number {
  return GENERATION2_FIRST_SOURCE_FRAME_RANK + generation2ReserveRankPosition;
}
