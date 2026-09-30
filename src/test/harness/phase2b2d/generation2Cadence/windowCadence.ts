/**
 * GENERATION-2 WINDOW EXECUTION CADENCE. PURE.
 *
 * A bounded window's MEMBERSHIP is derived by the unchanged rule: the complete
 * Q1 replacements plus the lowest never-started original primaries, to the
 * planned size. Its execution ORDER has one legacy default:
 *
 *   Q1_REPLACEMENTS_THEN_PRIMARIES   every replacement first (Windows 01-07)
 *
 * and exactly one alternative:
 *
 *   PRIMARIES_THEN_Q1_REPLACEMENTS   the same members, primaries first
 *
 * The default needs no authority and adds NOTHING to a spec, so every
 * historical spec stays byte-identical. The alternative is never a caller
 * string: it exists only as the verified content of an owner continuation
 * decision that is pinned below by window ordinal, path, commit, SHA-256 and
 * bytes. A cadence changes exposure order only - never Q1, the reserve order,
 * the pre-network append, the window membership, P1-P8 or Methodology V3 -
 * and the verifier refuses a decision whose own text claims otherwise.
 *
 * Adding an approved cadence is a reviewed code change, never data.
 */

import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import { refuse } from '../generation2Acquisition/operationalContract.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

export const WINDOW_EXECUTION_CADENCES = [
  'Q1_REPLACEMENTS_THEN_PRIMARIES',
  'PRIMARIES_THEN_Q1_REPLACEMENTS',
] as const;
export type WindowExecutionCadence = (typeof WINDOW_EXECUTION_CADENCES)[number];
export const DEFAULT_WINDOW_EXECUTION_CADENCE: WindowExecutionCadence =
  'Q1_REPLACEMENTS_THEN_PRIMARIES';

export const CADENCE_AUTHORITY_RECORD_KIND = 'GENERATION2_OWNER_CONTINUATION_DECISION';
/** The only thing a cadence authority may change. */
export const CADENCE_CHANGES = ['WORK_ITEM_EXECUTION_ORDER'] as const;
/** Everything a cadence authority must declare it preserves. */
export const CADENCE_PRESERVES = [
  'completeQ1',
  'frozenP1ToP8',
  'methodologyV3',
  'p5DenominatorAndThreshold',
  'preNetworkAppend',
  'reserveAssignmentOrder',
  'windowMembership',
] as const;
const CADENCE_DENIES = [
  'isMethodologyV4',
  'isReservePolicyChange',
  'isQ1Change',
  'isP5Change',
  'isSplitDrawOrSamplingChange',
] as const;

/** Committed bytes of a cadence decision, exactly as a caller read them at `commit`. */
export interface WindowCadenceAuthorityBinding {
  readonly path: string;
  readonly commit: string;
  readonly sha256: string;
  readonly text: string;
}

export interface ApprovedWindowCadenceAuthority {
  readonly windowOrdinal: number;
  readonly mode: WindowExecutionCadence;
  readonly path: string;
  readonly commit: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly ownerDecision: string;
  readonly scope: string;
}

/**
 * Every approved non-default cadence, each pinned to the ONE window it was
 * decided for. Any other window, bytes, commit or decision is refused.
 */
export const APPROVED_WINDOW_CADENCE_AUTHORITIES: readonly ApprovedWindowCadenceAuthority[] = [
  {
    windowOrdinal: 8,
    mode: 'PRIMARIES_THEN_Q1_REPLACEMENTS',
    path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_07_P5_REVIEW_AND_CONTINUATION_DECISION_V1.json',
    commit: '2c20af702c3a9aed93e41f61c28d274f01c8351a',
    sha256: '2cfa5931946b8c71729a17ca98291df2a8f0fa6768a24ef3362b24f689c28b85',
    bytes: 10845,
    ownerDecision: 'APPROVE_WINDOW_08_PRIMARY_FIRST_MIXED_EXECUTION_CADENCE_V1',
    scope: 'WINDOW_08_CADENCE_ONLY',
  },
  {
    windowOrdinal: 9,
    mode: 'PRIMARIES_THEN_Q1_REPLACEMENTS',
    path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_08_P5_REVIEW_AND_WINDOW_09_CONTINUATION_DECISION_V1.json',
    commit: '9deb681e6cb7f19ad4af0f677655f278ece6c149',
    sha256: '316e6f9aa90c977ac1f43cf8155a297980b94f93c4935d33c378e1dec9a141e2',
    bytes: 10497,
    ownerDecision: 'APPROVE_WINDOW_09_PRIMARY_FIRST_MIXED_EXECUTION_CADENCE_V1',
    scope: 'WINDOW_09_CADENCE_ONLY',
  },
  {
    windowOrdinal: 10,
    mode: 'PRIMARIES_THEN_Q1_REPLACEMENTS',
    path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_WINDOW_09_P5_REVIEW_AND_WINDOW_10_CONTINUATION_DECISION_V1.json',
    commit: '7b226de931752dc70028b5e20e37fa5d7a925ca5',
    sha256: 'ceff378d1147b4d43ac754c368c6311543f673f37f4190a9840d6ef926238752',
    bytes: 11347,
    ownerDecision: 'APPROVE_WINDOW_10_PRIMARY_FIRST_MIXED_EXECUTION_CADENCE_V1',
    scope: 'WINDOW_10_CADENCE_ONLY',
  },
];

/** What a non-default spec and its live authority carry: the verified decision's identity. */
export interface WindowExecutionCadenceBlock {
  readonly mode: WindowExecutionCadence;
  readonly windowOrdinal: number;
  readonly authority: {
    readonly path: string;
    readonly commit: string;
    readonly sha256: string;
    readonly bytes: number;
    readonly ownerDecision: string;
  };
}

type Json = Record<string, unknown>;
const obj = (value: unknown): Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {};
const same = (a: unknown, b: unknown): boolean => canonicalStringify(a) === canonicalStringify(b);

/**
 * Verifies a supplied cadence decision for ONE window and returns its block.
 * Refuses (never defaults) on any mismatch. `approved` is injectable only so
 * that tests can prove the content checks behind a re-sealed pin.
 */
export function verifyWindowCadenceAuthority(
  binding: WindowCadenceAuthorityBinding,
  windowOrdinal: number,
  approved: readonly ApprovedWindowCadenceAuthority[] = APPROVED_WINDOW_CADENCE_AUTHORITIES,
): WindowExecutionCadenceBlock {
  const ordinal = String(windowOrdinal);
  if (sha256(binding.text) !== binding.sha256) {
    refuse(
      'CADENCE_AUTHORITY_NOT_PINNED',
      'the cadence decision bytes do not hash to their SHA-256',
    );
  }
  const pins = approved.filter((pin) => pin.windowOrdinal === windowOrdinal);
  if (pins.length !== 1) {
    refuse(
      'CADENCE_AUTHORITY_NOT_APPROVED',
      `no single approved cadence decision exists for window ${ordinal}`,
    );
  }
  const pin = pins[0]!;
  if (
    pin.path !== binding.path ||
    pin.commit !== binding.commit ||
    pin.sha256 !== binding.sha256 ||
    pin.bytes !== Buffer.byteLength(binding.text, 'utf8')
  ) {
    refuse(
      'CADENCE_AUTHORITY_NOT_PINNED',
      `window ${ordinal}: the cadence decision is not the pinned path, commit, bytes and SHA-256`,
    );
  }
  let record: Json;
  try {
    record = obj(JSON.parse(binding.text) as unknown);
  } catch {
    return refuse('CADENCE_AUTHORITY_NOT_ACCEPTED', `window ${ordinal}: not JSON`);
  }
  const cadence = obj(record.executionCadence);
  const preserves = obj(cadence.preserves);
  // Every `…Authorised` flag must be false; a `notAuthorised` list is a prohibition, not a grant.
  const grants = Object.keys(record).filter(
    (key) => /Authori[sz]ed$/.test(key) && !/^not[A-Z]/.test(key) && record[key] !== false,
  );
  const expectedScope = `WINDOW_${ordinal.padStart(2, '0')}_CADENCE_ONLY`;
  if (
    record.recordKind !== CADENCE_AUTHORITY_RECORD_KIND ||
    record.isLiveAuthority !== false ||
    record.scope !== pin.scope ||
    pin.scope !== expectedScope ||
    !Array.isArray(record.ownerDecisions) ||
    !record.ownerDecisions.includes(pin.ownerDecision) ||
    grants.length !== 0 ||
    !(WINDOW_EXECUTION_CADENCES as readonly unknown[]).includes(pin.mode) ||
    pin.mode === DEFAULT_WINDOW_EXECUTION_CADENCE ||
    cadence.mode !== pin.mode ||
    cadence.replacesDefaultMode !== DEFAULT_WINDOW_EXECUTION_CADENCE ||
    cadence.windowOrdinal !== windowOrdinal ||
    !same(cadence.appliesToWindowOrdinals, [windowOrdinal]) ||
    !same(cadence.changes, [...CADENCE_CHANGES]) ||
    !same(Object.keys(preserves).sort(), [...CADENCE_PRESERVES]) ||
    !CADENCE_PRESERVES.every((key) => preserves[key] === true) ||
    !CADENCE_DENIES.every((key) => cadence[key] === false)
  ) {
    refuse(
      'CADENCE_AUTHORITY_NOT_ACCEPTED',
      `window ${ordinal}: the cadence decision is not a non-authorising, execution-order-only decision for exactly this window${grants.length ? ` (it grants ${grants.join(', ')})` : ''}`,
    );
  }
  return {
    mode: pin.mode,
    windowOrdinal,
    authority: {
      path: pin.path,
      commit: pin.commit,
      sha256: pin.sha256,
      bytes: pin.bytes,
      ownerDecision: pin.ownerDecision,
    },
  };
}

/** The same members, ordered by cadence. Membership is never changed here. */
export function orderByCadence<T>(
  replacements: readonly T[],
  primaries: readonly T[],
  mode: WindowExecutionCadence,
): T[] {
  return mode === 'PRIMARIES_THEN_Q1_REPLACEMENTS'
    ? [...primaries, ...replacements]
    : [...replacements, ...primaries];
}

/**
 * The cadence a historical or live AUTHORITY runs under. An authority with no
 * `executionCadence` is the legacy default and must not be paired with a
 * cadence decision; one that carries a block must be paired with the exact
 * pinned decision that block names.
 */
export function cadenceOfAuthority(
  authority: Readonly<Record<string, unknown>>,
  binding: WindowCadenceAuthorityBinding | undefined,
  windowOrdinal: number,
): WindowExecutionCadence {
  const block = authority.executionCadence;
  if (block === undefined) {
    if (binding !== undefined) {
      refuse(
        'CADENCE_AUTHORITY_NOT_APPLICABLE',
        `window ${String(windowOrdinal)}: a cadence decision was supplied for a default-cadence authority`,
      );
    }
    return DEFAULT_WINDOW_EXECUTION_CADENCE;
  }
  if (binding === undefined) {
    refuse(
      'CADENCE_AUTHORITY_MISSING',
      `window ${String(windowOrdinal)}: the authority names a non-default cadence but no decision was supplied`,
    );
  }
  const verified = verifyWindowCadenceAuthority(binding, windowOrdinal);
  if (!same(block, verified)) {
    refuse(
      'CADENCE_AUTHORITY_MISMATCH',
      `window ${String(windowOrdinal)}: the authority's cadence block is not the verified decision`,
    );
  }
  return verified.mode;
}
