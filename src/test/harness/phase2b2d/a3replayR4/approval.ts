/**
 * PHASE 2B-2D — A3 R47: BINDING THE EXACT R46 OWNER APPROVAL.
 *
 * R47 runs ONLY under the immutable R46 record
 * `PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_R4_SHORT_TEXT_AMENDMENT_OWNER_APPROVAL_V1`
 * as committed at the R46 terminal, and ONLY for the exact approved proposal
 * bytes it names. The caller supplies both files' BYTES (read from the git
 * object at the R46 terminal); this module recomputes each SHA-256 and length,
 * requires the pinned values, parses, and requires every authority flag R47
 * consumes. Only then is a binding minted - branded by a private `WeakSet`,
 * so a literal, a spread or a JSON copy is not one.
 *
 * Nothing here interprets a methodology choice: the option, the rule id, the
 * generations and the replay boundary are REQUIRED to equal what the owner
 * approved, never chosen.
 *
 * Pure apart from hashing the supplied bytes. No filesystem, no network.
 */
import { createHash } from 'node:crypto';
import {
  SD7_R4_APPROVED_PROPOSAL,
  SD7_R4_METHODOLOGY_VERSION,
  SD7_R4_OPTION_TOKEN,
  SD7_R4_RULE_ID,
} from '../sd7R4/types.js';
import { refuseR47 } from './refusal.js';

export const R46_TERMINAL_COMMIT = 'e0d1555c09afdc5f17cb3b6b62ac8682a248b2df';

export const R46_APPROVAL_RECORD = Object.freeze({
  path: 'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_R4_SHORT_TEXT_AMENDMENT_OWNER_APPROVAL_V1.json',
  sha256: '986a48bdb672f2428c8ef07b04c43e0187e16b43f79b64c0a61b4aef51844eb2',
  bytes: 14268,
  commit: R46_TERMINAL_COMMIT,
});

export const R46_APPROVAL_MARKER =
  'APPROVE_PHASE_2B_2D_METHODOLOGY_V2_R4_SHORT_TEXT_AMENDMENT_EXACT_BYTES';
export const R47_AUTHORITY_MARKER =
  'AUTHORISE_A3_R47_SHORT_TEXT_R4_IMPLEMENTATION_AND_GLOBAL_DEV_TRAIN_REPLAY';

export interface R46ApprovalBinding {
  readonly kind: 'R47_R46_OWNER_APPROVAL_BINDING';
  readonly approvalRecord: typeof R46_APPROVAL_RECORD;
  readonly approvedProposal: typeof SD7_R4_APPROVED_PROPOSAL;
  readonly methodologyVersion: typeof SD7_R4_METHODOLOGY_VERSION;
  readonly ruleId: typeof SD7_R4_RULE_ID;
  readonly optionToken: typeof SD7_R4_OPTION_TOKEN;
  readonly consumedMarkers: readonly [typeof R46_APPROVAL_MARKER, typeof R47_AUTHORITY_MARKER];
  readonly appliesToGenerations: readonly ['METHODOLOGY_V2_GEN1', 'METHODOLOGY_V3_GEN2'];
  readonly methodologyR4Approved: true;
  readonly methodologyR4Frozen: true;
  readonly r47ImplementationReplayAuthorised: true;
  readonly r47ExecutedAtApproval: false;
}

const BOUND = new WeakSet<object>();

export function isR46ApprovalBinding(value: unknown): value is R46ApprovalBinding {
  return typeof value === 'object' && value !== null && BOUND.has(value);
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

function at(record: unknown, path: readonly (string | number)[]): unknown {
  let cursor: unknown = record;
  for (const key of path) {
    if (typeof cursor !== 'object' || cursor === null) return undefined;
    cursor = (cursor as Record<string | number, unknown>)[key];
  }
  return cursor;
}

function parse(
  bytes: Uint8Array,
  code: 'R47_R46_APPROVAL_CONTENT_MISMATCH' | 'R47_R4_PROPOSAL_BYTES_MISMATCH',
): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown;
  } catch (error) {
    refuseR47(code, 'the bytes are not JSON', { cause: error });
  }
}

/** Each [path, required value] the approval record must state, exactly. */
const REQUIRED_APPROVAL_FACTS: readonly (readonly [readonly (string | number)[], unknown])[] = [
  [['record'], 'PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_R4_SHORT_TEXT_AMENDMENT_OWNER_APPROVAL_V1'],
  [['recordKind'], 'OWNER_METHODOLOGY_AMENDMENT_APPROVAL'],
  [['ownerDecisions', 0, 'marker'], R46_APPROVAL_MARKER],
  [['ownerDecisions', 1, 'marker'], R47_AUTHORITY_MARKER],
  [['approvedProposal', 'path'], SD7_R4_APPROVED_PROPOSAL.path],
  [['approvedProposal', 'sha256'], SD7_R4_APPROVED_PROPOSAL.sha256],
  [['approvedProposal', 'bytes'], SD7_R4_APPROVED_PROPOSAL.bytes],
  [['approvedProposal', 'sourceCommit'], '65bde0c033ff89c2ee98aa44880b8600ab0da11f'],
  [['approvedOption', 'id'], 'A'],
  [['approvedOption', 'token'], SD7_R4_OPTION_TOKEN],
  [['approvedOption', 'ruleId'], SD7_R4_RULE_ID],
  [['approvedOption', 'optionComparisonReopened'], false],
  [['approvedClassification', 'version'], SD7_R4_METHODOLOGY_VERSION],
  [['approvedClassification', 'isNewMethodologyGeneration'], false],
  [['crossGenerationScope', 'appliesToGenerations', 0], 'METHODOLOGY_V2_GEN1'],
  [['crossGenerationScope', 'appliesToGenerations', 1], 'METHODOLOGY_V3_GEN2'],
  [['crossGenerationScope', 'appliesIdenticallyToBoth'], true],
  [['a2AndGovernanceBoundary', 'r47MustMechanicallyRecheckSd9Invariance'], true],
  [['replayBoundary', 'earliestInvalidatedLayer'], 'SD7_GRAPH'],
  [['replayBoundary', 'devTrainSlotsToRecompute'], 20],
  [['replayBoundary', 'globalRecomputationRequired'], true],
  [['replayBoundary', 'blockerTargetedReplayAuthorised'], false],
  [['r47Authority', 'marker'], R47_AUTHORITY_MARKER],
  [['r47Authority', 'authorised'], true],
  [['r47Authority', 'executedInR46'], false],
  [['authorityFlags', 'methodologyR4Approved'], true],
  [['authorityFlags', 'methodologyR4Frozen'], true],
  [['authorityFlags', 'r47ImplementationReplayAuthorised'], true],
  [['authorityFlags', 'r47Executed'], false],
  [['authorityFlags', 'devConfirmAccessAuthorised'], false],
  [['authorityFlags', 'finalHoldoutAccessAuthorised'], false],
  [['authorityFlags', 'a4Authorised'], false],
  [['authorityFlags', 'a5FreezeAuthorised'], false],
  [['authorityFlags', 'labelsAuthorised'], false],
  [['authorityFlags', 'providerInferenceAuthorised'], false],
  [['authorityFlags', 'a2Reopened'], false],
  [
    ['terminalState'],
    'A3_METHODOLOGY_V2_R4_SHORT_TEXT_AMENDMENT_APPROVED_R47_GLOBAL_DEV_TRAIN_REPLAY_AUTHORISED',
  ],
];

/**
 * Binds the exact R46 approval and the exact approved proposal. Refuses on any
 * byte, digest, length or authority-flag difference.
 */
export function bindR46ApprovalForR47(input: {
  readonly approvalBytes: Uint8Array;
  readonly proposalBytes: Uint8Array;
}): R46ApprovalBinding {
  const { approvalBytes, proposalBytes } = input;
  if (
    !(approvalBytes instanceof Uint8Array) ||
    approvalBytes.length !== R46_APPROVAL_RECORD.bytes ||
    sha256(approvalBytes) !== R46_APPROVAL_RECORD.sha256
  ) {
    refuseR47(
      'R47_R46_APPROVAL_BYTES_MISMATCH',
      'the approval bytes are not the exact record committed at the R46 terminal',
    );
  }
  if (
    !(proposalBytes instanceof Uint8Array) ||
    proposalBytes.length !== SD7_R4_APPROVED_PROPOSAL.bytes ||
    sha256(proposalBytes) !== SD7_R4_APPROVED_PROPOSAL.sha256
  ) {
    refuseR47(
      'R47_R4_PROPOSAL_BYTES_MISMATCH',
      'the proposal bytes are not the exact proposal the owner approved',
    );
  }
  const approval = parse(approvalBytes, 'R47_R46_APPROVAL_CONTENT_MISMATCH');
  for (const [path, expected] of REQUIRED_APPROVAL_FACTS) {
    if (at(approval, path) !== expected) {
      refuseR47(
        'R47_R46_APPROVAL_CONTENT_MISMATCH',
        `the approval does not state ${path.join('.')}`,
      );
    }
  }
  const proposal = parse(proposalBytes, 'R47_R4_PROPOSAL_BYTES_MISMATCH');
  const clauses = at(proposal, ['proposedRule', 'clauses']);
  if (
    at(proposal, ['version']) !== SD7_R4_METHODOLOGY_VERSION ||
    at(proposal, ['proposedRule', 'ruleId']) !== SD7_R4_RULE_ID ||
    !Array.isArray(clauses) ||
    clauses.map((clause) => at(clause, ['id'])).join(',') !==
      'N1,N2,N3,N4,N5,N6,N7,N8,N9,N10,N11,N12'
  ) {
    refuseR47(
      'R47_R4_PROPOSAL_BYTES_MISMATCH',
      'the proposal does not carry the R4 version, rule id and clauses N1-N12',
    );
  }
  const binding: R46ApprovalBinding = Object.freeze({
    kind: 'R47_R46_OWNER_APPROVAL_BINDING' as const,
    approvalRecord: R46_APPROVAL_RECORD,
    approvedProposal: SD7_R4_APPROVED_PROPOSAL,
    methodologyVersion: SD7_R4_METHODOLOGY_VERSION,
    ruleId: SD7_R4_RULE_ID,
    optionToken: SD7_R4_OPTION_TOKEN,
    consumedMarkers: Object.freeze([R46_APPROVAL_MARKER, R47_AUTHORITY_MARKER] as const),
    appliesToGenerations: Object.freeze(['METHODOLOGY_V2_GEN1', 'METHODOLOGY_V3_GEN2'] as const),
    methodologyR4Approved: true as const,
    methodologyR4Frozen: true as const,
    r47ImplementationReplayAuthorised: true as const,
    r47ExecutedAtApproval: false as const,
  });
  BOUND.add(binding);
  return binding;
}

export function requireR46ApprovalBinding(value: unknown): R46ApprovalBinding {
  if (!isR46ApprovalBinding(value)) {
    refuseR47(
      'R47_R46_APPROVAL_NOT_BOUND',
      'the value is not an R46 approval bound in this process',
    );
  }
  return value;
}
