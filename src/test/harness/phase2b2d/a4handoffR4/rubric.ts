/**
 * PHASE 2B-2D — A3 R50: THE EXACT R49 RUBRIC AND ITS SEPARATE OWNER APPROVAL.
 *
 * R50 does not redesign, copy or reinterpret the rubric. It binds the exact
 * frozen bytes by SHA-256 and length, reads only the facts the package and
 * the future response validator need (version, value sets, validity matrix),
 * and requires the separate R49 owner approval to carry exactly the authority
 * R50 consumes - and none that R50 must not have.
 *
 * Callers pass the bytes read from the git object at the R49 terminal. One
 * changed byte refuses.
 *
 * PURE. No socket, no database, no filesystem, no clock.
 */
import { createHash } from 'node:crypto';
import { refuseR50 } from './refusal.js';
import {
  R48_TERMINAL_COMMIT,
  R48_TERMINAL_STATE,
  R49_TERMINAL_STATE,
  R50_CONSUMED_OWNER_MARKER,
} from './types.js';

export const R49_RUBRIC = Object.freeze({
  path: 'docs/evaluation/PHASE_2B_2D_METHOD_V2_HUMAN_LABELLING_RUBRIC_V1.json',
  sha256: 'e3af57d8d2503e4fc87ce707427762aabfed420bb670a262b9302a7ea78e1d69',
  bytes: 22125,
  rubricVersion: 'METHODOLOGY_V2_HUMAN_LABELLING_RUBRIC_V1',
  status: 'FROZEN_BY_OWNER',
  sourceCommit: 'c945c8e90942b4ec0fa4d35f96731bd10d33c0ce',
});

/** Recomputed locally from the git object at the R49 terminal. */
export const R49_RUBRIC_APPROVAL = Object.freeze({
  path: 'docs/evaluation/PHASE_2B_2D_METHOD_V2_HUMAN_LABELLING_RUBRIC_V1_OWNER_APPROVAL.json',
  sha256: '17f2683d378b32000467eb670374f56bfa3c8b7b3dfa0acb8a12ee60d0468ac4',
  bytes: 4895,
});

export const R49_RUBRIC_APPROVAL_MARKER =
  'APPROVE_PHASE_2B_2D_METHOD_V2_HUMAN_LABELLING_RUBRIC_V1' as const;

export const RUBRIC_VERDICTS = Object.freeze(['UNIT_PAGE', 'NOT_A_UNIT', 'NEEDS_REVIEW'] as const);
export const RUBRIC_UNIT_TYPES = Object.freeze([
  'INTERNATIONAL_MOBILITY_OFFICE',
  'LANGUAGE_CENTRE',
  'LANGUAGE_DEPARTMENT',
  'OTHER_UNIT',
] as const);
export const RUBRIC_LABEL_FIELDS = Object.freeze([
  'verdict',
  'unit_type',
  'hard_negative',
] as const);

export type RubricVerdict = (typeof RUBRIC_VERDICTS)[number];
export type RubricUnitType = (typeof RUBRIC_UNIT_TYPES)[number];

export interface RubricMatrixRow {
  readonly verdict: RubricVerdict;
  readonly unitType: 'ONE_OF_FOUR_VALUES' | 'NULL_ONLY';
  readonly hardNegative: 'FALSE_ONLY' | 'TRUE_OR_FALSE';
}

/** The exact R49 validity matrix. R50 binds it; it never edits it. */
export const RUBRIC_VALIDITY_MATRIX: readonly RubricMatrixRow[] = Object.freeze([
  Object.freeze({
    verdict: 'UNIT_PAGE',
    unitType: 'ONE_OF_FOUR_VALUES',
    hardNegative: 'FALSE_ONLY',
  }),
  Object.freeze({ verdict: 'NOT_A_UNIT', unitType: 'NULL_ONLY', hardNegative: 'TRUE_OR_FALSE' }),
  Object.freeze({ verdict: 'NEEDS_REVIEW', unitType: 'NULL_ONLY', hardNegative: 'FALSE_ONLY' }),
] as const);

/** The exact approved authority shape. Anything wider or narrower refuses. */
export const R49_EXPECTED_AUTHORITY_FLAGS = Object.freeze({
  rubricApproved: true,
  rubricFrozen: true,
  r50HandoffResumeAuthorised: true,
  r50Executed: false,
  humanLabelsAuthorised: false,
  humanLabelsExecuted: false,
  modelLabelsAuthorised: false,
  devConfirmAccessAuthorised: false,
  finalHoldoutAccessAuthorised: false,
  a5FreezeAuthorised: false,
});

export interface R49RubricBinding {
  readonly kind: 'A3_R50_R49_RUBRIC_BINDING';
  readonly rubricPath: string;
  readonly rubricSha256: string;
  readonly rubricBytes: number;
  readonly rubricVersion: string;
  readonly rubricStatus: string;
  readonly rubricSourceCommit: string;
  readonly approvalPath: string;
  readonly approvalSha256: string;
  readonly approvalBytes: number;
  readonly approvalMarker: typeof R49_RUBRIC_APPROVAL_MARKER;
  readonly consumedOwnerMarker: typeof R50_CONSUMED_OWNER_MARKER;
  readonly approvalTerminalState: typeof R49_TERMINAL_STATE;
}

const MINTED = new WeakSet<object>();

export function isR49RubricBinding(value: unknown): value is R49RubricBinding {
  return typeof value === 'object' && value !== null && MINTED.has(value);
}

export function requireR49RubricBinding(value: unknown): R49RubricBinding {
  if (!isR49RubricBinding(value)) {
    refuseR50('R50_RUBRIC_NOT_BOUND', 'the value is not a minted R49 rubric binding');
  }
  return value;
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

const at = (value: unknown, ...keys: string[]): unknown =>
  keys.reduce<unknown>(
    (node, key) =>
      node !== null && typeof node === 'object' && !Array.isArray(node)
        ? (node as Record<string, unknown>)[key]
        : undefined,
    value,
  );

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function parse(bytes: Uint8Array, code: Parameters<typeof refuseR50>[0], what: string): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown;
  } catch (error) {
    refuseR50(code, `${what} is not JSON`, { cause: error });
  }
}

function requireRubric(bytes: unknown): void {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length !== R49_RUBRIC.bytes ||
    sha256(bytes) !== R49_RUBRIC.sha256
  ) {
    refuseR50('R50_RUBRIC_BYTES_MISMATCH', 'the rubric bytes are not the frozen R49 rubric');
  }
  const rubric = parse(bytes, 'R50_RUBRIC_CONTENT_MISMATCH', 'the rubric');
  const fail = (message: string): never => refuseR50('R50_RUBRIC_CONTENT_MISMATCH', message);
  if (at(rubric, 'rubricVersion') !== R49_RUBRIC.rubricVersion) fail('rubricVersion differs');
  if (at(rubric, 'status') !== R49_RUBRIC.status) fail('the rubric is not FROZEN_BY_OWNER');
  if (!sameJson(at(rubric, 'verdict', 'valueSet'), RUBRIC_VERDICTS)) fail('verdict values differ');
  if (!sameJson(at(rubric, 'unitType', 'valueSet'), RUBRIC_UNIT_TYPES)) {
    fail('unit_type values differ');
  }
  if (!sameJson(at(rubric, 'labelValidityMatrix', 'labelFields'), RUBRIC_LABEL_FIELDS)) {
    fail('label fields differ');
  }
  if (!sameJson(at(rubric, 'labelValidityMatrix', 'rows'), RUBRIC_VALIDITY_MATRIX)) {
    fail('the validity matrix differs');
  }
  if (!sameJson(at(rubric, 'authorityBoundary', 'thisFileAuthorises'), [])) {
    fail('the rubric file authorises something');
  }
}

function requireApproval(bytes: unknown): void {
  if (!(bytes instanceof Uint8Array)) {
    refuseR50('R50_RUBRIC_APPROVAL_BYTES_MISMATCH', 'the approval bytes are missing');
  }
  const approval = parse(bytes, 'R50_RUBRIC_APPROVAL_CONTENT_MISMATCH', 'the approval');
  const fail = (message: string): never =>
    refuseR50('R50_RUBRIC_APPROVAL_CONTENT_MISMATCH', message);
  const markers = (at(approval, 'ownerDecisions') as { marker?: unknown }[] | undefined)?.map(
    (decision) => decision.marker,
  );
  if (!sameJson(markers, [R49_RUBRIC_APPROVAL_MARKER, R50_CONSUMED_OWNER_MARKER])) {
    fail('the approval does not carry exactly the rubric approval and the R50 authority');
  }
  if (
    at(approval, 'approvedRubric', 'path') !== R49_RUBRIC.path ||
    at(approval, 'approvedRubric', 'sha256') !== R49_RUBRIC.sha256 ||
    at(approval, 'approvedRubric', 'bytes') !== R49_RUBRIC.bytes ||
    at(approval, 'approvedRubric', 'rubricVersion') !== R49_RUBRIC.rubricVersion ||
    at(approval, 'approvedRubric', 'sourceCommit') !== R49_RUBRIC.sourceCommit
  ) {
    fail('the approval binds a different rubric');
  }
  if (!sameJson(at(approval, 'authorityFlags'), R49_EXPECTED_AUTHORITY_FLAGS)) {
    fail('the approval does not carry exactly the approved authority shape');
  }
  if (
    at(approval, 'r50Authority', 'split') !== 'DEV_TRAIN' ||
    at(approval, 'r50Authority', 'labelsMayBeCreated') !== false ||
    at(approval, 'r50Authority', 'goldMayBeCreated') !== false ||
    at(approval, 'r50Authority', 'modelLabelsMayBeCreated') !== false ||
    at(approval, 'r50Authority', 'devConfirmMayBeOpened') !== false ||
    at(approval, 'r50Authority', 'finalHoldoutMayBeOpened') !== false
  ) {
    fail('the R50 authority is not DEV_TRAIN-only and label-free');
  }
  if (
    at(approval, 'r48Blocker', 'r48Terminal') !== R48_TERMINAL_COMMIT ||
    at(approval, 'r48Blocker', 'terminalState') !== R48_TERMINAL_STATE ||
    at(approval, 'terminalState') !== R49_TERMINAL_STATE
  ) {
    fail('the approval does not resolve the exact R48 blocker');
  }
  if (bytes.length !== R49_RUBRIC_APPROVAL.bytes || sha256(bytes) !== R49_RUBRIC_APPROVAL.sha256) {
    refuseR50(
      'R50_RUBRIC_APPROVAL_BYTES_MISMATCH',
      'the approval bytes are not the immutable R49 owner approval',
    );
  }
}

/** Binds the exact frozen rubric and its exact separate owner approval. */
export function bindR49RubricForR50(input: {
  readonly rubricBytes: unknown;
  readonly approvalBytes: unknown;
}): R49RubricBinding {
  requireRubric(input.rubricBytes);
  requireApproval(input.approvalBytes);
  const binding: R49RubricBinding = Object.freeze({
    kind: 'A3_R50_R49_RUBRIC_BINDING' as const,
    rubricPath: R49_RUBRIC.path,
    rubricSha256: R49_RUBRIC.sha256,
    rubricBytes: R49_RUBRIC.bytes,
    rubricVersion: R49_RUBRIC.rubricVersion,
    rubricStatus: R49_RUBRIC.status,
    rubricSourceCommit: R49_RUBRIC.sourceCommit,
    approvalPath: R49_RUBRIC_APPROVAL.path,
    approvalSha256: R49_RUBRIC_APPROVAL.sha256,
    approvalBytes: R49_RUBRIC_APPROVAL.bytes,
    approvalMarker: R49_RUBRIC_APPROVAL_MARKER,
    consumedOwnerMarker: R50_CONSUMED_OWNER_MARKER,
    approvalTerminalState: R49_TERMINAL_STATE,
  });
  MINTED.add(binding);
  return binding;
}
