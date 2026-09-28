/**
 * METHODOLOGY V3 / GENERATION-2 OWNER FREEZE: the five frozen records, built
 * PURELY from committed bytes handed in by the caller.
 *
 *   1. owner freeze approval   binds the approved proposal, schedule proposal
 *                               and feasibility BYTES; never edits them
 *   2. frozen reserve schedule  the proposal's 5,670 entries, unchanged, under
 *                               a FROZEN record kind in the dedicated namespace
 *   3. carry-forward baseline   the 75 / [75,76] / [] / 77..109 starting state,
 *                               RE-DERIVED with the landed carry-forward audit
 *   4. genesis ledger           the Generation-2 ledger at 0 entries, bound to
 *                               the immutable Generation-1 terminal
 *   5. frozen baseline          one concise record binding all of the above
 *
 * Each record binds only records EARLIER in that list (by file SHA-256), so
 * the chain has no cycle and every binding can be re-verified from disk.
 *
 * WHY THE FROZEN SCHEDULE HAS TWO HASHES
 *
 *   The proposal's scheduleHash (024fe88f...) is sha256 over the WHOLE
 *   proposal artifact, including its PROPOSAL metadata. The frozen record's
 *   metadata necessarily differs (status, record kind, approval binding), so
 *   its own `frozenScheduleHash` differs too. Content equality is therefore
 *   proved the only honest way: the proposal-canonical artifact is REBUILT
 *   from the frozen entries with the landed, unchanged proposal builder, and
 *   its scheduleHash must equal 024fe88f... exactly. That recomputation is the
 *   "canonical schedule hash" of the frozen entries; it cannot pass unless
 *   every entry - count, order, positions, source ranks, echeRowKeys,
 *   organisationIds, rankHashes and entry digests - is identical.
 *
 * No filesystem, no database, no network, no clock, no environment. Nothing
 * here authorises an acquisition, assigns a reserve or appends a ledger entry.
 */

import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import {
  recomputeLedgerHash,
  reserveConsumedCount,
  type ReplacementLedger,
} from '../continuationWindow/replacementLedger.js';
import {
  P6_MAX_REPLACEMENTS_BEFORE_SUCCESS_FLOOR,
  P6_SUCCESS_FLOOR,
  REPLACEMENT_REASON_PRECEDENCE,
  REPLACEMENT_REASONS,
  type GenerationState,
} from '../continuationWindow/windowContract.js';
import type { Split } from '../draw/drawContract.js';
import {
  deriveGeneration2StartingState,
  drawEntrySha256Of,
  PROVENANCE_CLOSURE_PATH,
  SD9_RECONCILIATION_PATH,
  type CarryForwardContext,
  type CarryForwardSlotRecord,
  type SlotAudit,
  type SuccessfulSlotRecord,
} from '../generation2/carryForward.js';
import {
  ARCHITECTURE_ID,
  DRAW_FILE_SHA256,
  DRAW_HASH,
  DRAW_PATH,
  ELIGIBLE_COUNT,
  FRAME_COMMIT,
  FRAME_FILE_SHA256,
  FRAME_HASH,
  FRAME_PATH,
  GENERATION1_ID,
  GENERATION1_LEDGER_ENTRY_COUNT,
  GENERATION1_LEDGER_FILE_SHA256,
  GENERATION1_LEDGER_HASH,
  GENERATION1_LEDGER_PATH,
  GENERATION1_RESERVE_COUNT,
  GENERATION1_TERMINAL_COMMIT,
  GENERATION1_TERMINAL_RECORD_PATH,
  GENERATION1_TERMINAL_STATUS,
  GENERATION1_UNUSED_RESERVE_POSITION,
  GENERATION2_ID,
  GENERATION2_RESERVE_COUNT,
  GENERATION2_RESERVE_EXHAUSTION_REFUSAL,
  GENERATION2_RESERVE_FIRST_SOURCE_RANK,
  GENERATION2_RESERVE_LAST_SOURCE_RANK,
  METHODOLOGY_R3_PATH,
  METHODOLOGY_R3_SHA256,
  SELECTION_COUNT,
} from '../generation2/generation2Contract.js';
import {
  buildGeneration1StartingState,
  type Generation2Ledger,
} from '../generation2/generation2Ledger.js';
import {
  buildGeneration2ReserveScheduleArtifact,
  recomputeScheduleHash,
  verifyGeneration2ReserveSchedule,
  type DrawForSchedule,
  type Generation2ReserveScheduleArtifact,
  type Generation2ReserveScheduleEntry,
} from '../generation2/reserveSchedule.js';
import {
  A3_GOVERNANCE_V4_PINNED_A2_COMMIT,
  ACQUISITION_PLAN_V1,
  APPROVED_FEASIBILITY,
  APPROVED_PROPOSAL,
  APPROVED_SCHEDULE_PROPOSAL,
  EXPECTED_BY_SPLIT,
  EXPECTED_SELECTION_SPLITS,
  EXPECTED_STARTING_STATE,
  FIRST_GENERATION2_Q1,
  FREEZE_BRANCH,
  FREEZE_RECORDED_AT_UTC,
  FREEZE_TASK_ID,
  FREEZE_TERMINAL_STATE,
  FROZEN_SCHEDULE_PATH,
  FROZEN_SCHEDULE_RECORD,
  FROZEN_SCHEDULE_RECORD_KIND,
  FUTURE_ACQUISITION_FETCH_POLICY,
  GENERATION1_TERMINAL_RECORD_SHA256,
  GENERATION2_CORPUS_NAMESPACE,
  GENESIS_LEDGER_RECORD,
  GENESIS_LEDGER_RECORD_KIND,
  LEGACY_CORPUS_NAMESPACE,
  LEGACY_SCANNER,
  METHODOLOGY_V2_FREEZE_APPROVAL,
  MIN_PAGES_AFTER_SD7,
  MODERN_RUN_REF_CONVENTION,
  OPTION_B_TEMPORAL_CORRECTION,
  OWNER_DECISIONS,
  OWNER_FREEZE_APPROVAL_PATH,
  PROPOSAL_TIP_COMMIT,
  SD9_RULE,
} from './freezeContract.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

export class Generation2FreezeStop extends Error {
  constructor(message: string) {
    super(`STOP: ${message}`);
    this.name = 'Generation2FreezeStop';
  }
}

export interface FileBinding {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

/** Binds a committed file by its exact bytes. */
export function bindText(path: string, text: string): FileBinding {
  return { path, sha256: sha256(text), bytes: Buffer.byteLength(text, 'utf8') };
}

function requirePinned(path: string, text: string | undefined, pinned: string): string {
  if (text === undefined) throw new Generation2FreezeStop(`${path} is not committed`);
  if (sha256(text) !== pinned) throw new Generation2FreezeStop(`${path} is not the pinned bytes`);
  return text;
}

const NO_AUTHORITY = {
  thisFileAuthorises: [] as string[],
  isLiveAuthority: false as const,
  networkUsed: false,
  databaseRead: false,
  reserveAssigned: false,
  acquisitionRunCreated: false,
};

// ---------------------------------------------------------------------------
// P6, unchanged. The predicate reads the LANDED Plan V1 constants.
// ---------------------------------------------------------------------------

/** P6 exactly as the landed window gate evaluates it; nothing is reset or re-read. */
export function p6Fires(generation: GenerationState): boolean {
  return (
    generation.reserveConsumedCount > P6_MAX_REPLACEMENTS_BEFORE_SUCCESS_FLOOR &&
    generation.successfulOrganisationCount < P6_SUCCESS_FLOOR
  );
}

// ---------------------------------------------------------------------------
// 1. Owner freeze approval.
// ---------------------------------------------------------------------------

export interface ApprovalInputs {
  readonly proposalText: string;
  readonly scheduleProposalText: string;
  readonly feasibilityText: string;
}

const OPEN_DECISION_RESOLUTIONS = [
  'APPROVE_FREEZE_METHODOLOGY_V3_R1_AND_GENERATION2_CONTINUATION_V1: approved and frozen without changes',
  'APPROVE_SD1_CLAUSE_D_GENERATION2_CONTINUATION_READING_V1: accepted (see sd1ClauseD)',
  'APPROVE_GENERATION2_DEDICATED_CORPUS_NAMESPACE_V1: frozen Generation-2 corpus-state artifacts live under docs/evaluation/generation2/corpus/; the A1 clause-D scanner is NOT modified (see generation2CorpusNamespace)',
  'KEEP_P6_UNCHANGED_AND_INERT_UNDER_INHERITED_SUCCESS_STATE_V1: P6 kept exactly as written and accepted as inert (see p6)',
  'NO_GENERATION2_LIVE_ACQUISITION_AUTHORITY_IN_THIS_FREEZE_TASK_V1: not granted here; it is the next, separate owner question',
] as const;

export function buildOwnerFreezeApproval(inputs: ApprovalInputs): Record<string, unknown> {
  requirePinned(APPROVED_PROPOSAL.path, inputs.proposalText, APPROVED_PROPOSAL.sha256);
  requirePinned(
    APPROVED_SCHEDULE_PROPOSAL.path,
    inputs.scheduleProposalText,
    APPROVED_SCHEDULE_PROPOSAL.sha256,
  );
  requirePinned(APPROVED_FEASIBILITY.path, inputs.feasibilityText, APPROVED_FEASIBILITY.sha256);
  const proposal = JSON.parse(inputs.proposalText) as {
    status: string;
    amendments: { id: string }[];
    openOwnerDecisions: string[];
  };
  const feasibility = JSON.parse(inputs.feasibilityText) as { verdict: string };
  if (proposal.status !== APPROVED_PROPOSAL.statusInsideTheBytes) {
    throw new Generation2FreezeStop('the approved proposal no longer says PROPOSED');
  }
  if (feasibility.verdict !== APPROVED_FEASIBILITY.verdict) {
    throw new Generation2FreezeStop('the feasibility verdict is not the approved one');
  }
  if (proposal.openOwnerDecisions.length !== OPEN_DECISION_RESOLUTIONS.length) {
    throw new Generation2FreezeStop('the proposal no longer lists the five open owner decisions');
  }
  const amendmentIds = proposal.amendments.map((amendment) => amendment.id);

  return {
    recordId: 'phase2b-2d-acceptance-methodology-v3-owner-freeze-approval-v1',
    recordKind: 'OWNER_FREEZE_APPROVAL',
    records: 'PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_OWNER_FREEZE_APPROVAL_V1',
    approves: 'PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_PROPOSAL_R1_EXACT_BYTES',
    task: FREEZE_TASK_ID,
    recordedAtUtc: FREEZE_RECORDED_AT_UTC,
    recordedAtUtcSource: 'date -u, read from the shell when the freeze was materialised',
    recordedBy:
      'claude-code-session under explicit owner instruction; the approval itself is the owner’s',
    branch: FREEZE_BRANCH,
    approvedProposalTip: PROPOSAL_TIP_COMMIT,
    ownerDecisions: [...OWNER_DECISIONS],
    ownerDecisionSource: `the owner's instruction for task ${FREEZE_TASK_ID}, recorded here by decision token`,
    methodologyFrozen: true,
    approvalIsMethodologyAndGeneration2StructureFreezeOnly: true,
    freezeApprovalIsNotAcquisitionAuthority: true,
    ...NO_AUTHORITY,
    approvedProposal: {
      ...APPROVED_PROPOSAL,
      amendmentsApproved: amendmentIds,
      bytesNeverChangeOnApproval:
        'the approved proposal is not edited, reformatted, re-hashed or re-statused by this record. Its status field remains PROPOSED by design; approval lives HERE, exactly as the Methodology V2 freeze separated approval bytes from proposal bytes',
    },
    approvedScheduleProposal: {
      ...APPROVED_SCHEDULE_PROPOSAL,
      frozenAs: FROZEN_SCHEDULE_PATH,
      proposalBytesUnchanged: true,
    },
    approvedCarryForwardFeasibility: {
      ...APPROVED_FEASIBILITY,
      checked: 75,
      accepted: 75,
      refused: 0,
      noInstitutionAcquisitionToReconfirm: true,
    },
    effectiveMethodology: {
      composition: [
        {
          layer: 'Methodology V2 R3',
          path: METHODOLOGY_R3_PATH,
          sha256: METHODOLOGY_R3_SHA256,
          ownerFreezeApproval: METHODOLOGY_V2_FREEZE_APPROVAL,
        },
        {
          layer: 'Methodology V3 Proposal R1 amendments',
          path: APPROVED_PROPOSAL.path,
          sha256: APPROVED_PROPOSAL.sha256,
          amendments: amendmentIds,
        },
        {
          layer: 'this owner freeze approval: resolutions of the proposal’s open decisions',
          path: OWNER_FREEZE_APPROVAL_PATH,
        },
      ],
      rule: 'additive and commit-addressed. V2 R3 is not rewritten; V3 Proposal R1 is not rewritten; an amendment changes only its named clause',
      acquisitionPlan: ACQUISITION_PLAN_V1,
    },
    resolutionsOfOpenOwnerDecisions: proposal.openOwnerDecisions.map((question, index) => ({
      question,
      resolution: OPEN_DECISION_RESOLUTIONS[index],
    })),
    generation: {
      generationId: GENERATION2_ID,
      architecture: ARCHITECTURE_ID,
      generation1: {
        generationId: GENERATION1_ID,
        status: GENERATION1_TERMINAL_STATUS,
        terminalCommit: GENERATION1_TERMINAL_COMMIT,
        permanent: true,
        generation2DoesNotSupersedeItsTruth: true,
      },
    },
    selectionCohort: {
      rule: 'exactly the 110 Generation-1 selection slots (source frame ranks 0..109), preserved entry for entry: selectionIndex, echeRowKey, organisationId, draw-entry digest and split',
      splits: EXPECTED_SELECTION_SPLITS,
      noNewPrimaryDraw: true,
      noRandomSeed: true,
    },
    reserveSource: {
      rule: 'every previously-undrawn frame rank, 150..5819 inclusive, in the frozen rank order',
      count: GENERATION2_RESERVE_COUNT,
      noAlternativeCount: true,
      noSubset: true,
      generation1ReservesRemainGeneration1History:
        'source ranks 110..149 are Generation-1 reserves forever, including the never-assigned Generation-1 reserve 39; none is moved into Generation 2 and frame rank 149 is not Generation-2 reserve 0',
    },
    sd1ClauseD: {
      decision: 'APPROVE_SD1_CLAUSE_D_GENERATION2_CONTINUATION_READING_V1',
      reading:
        'Generation 2 is a CONTINUATION generation of the same pre-outcome 110-slot cohort. Generation 1 froze no accepted corpus, so its failed corpus-freeze attempt does not exclude the same 110 selection slots from continuation',
      notAClaimThat: 'no Generation-1 acquisition occurred',
      scope:
        'authorises continuity of THIS already-selected cohort only. It may not be used by an unrelated future fresh generation to ignore prior-corpus contamination',
    },
    generation2CorpusNamespace: {
      decision: 'APPROVE_GENERATION2_DEDICATED_CORPUS_NAMESPACE_V1',
      directory: `${GENERATION2_CORPUS_NAMESPACE}/`,
      notUnder: `${LEGACY_CORPUS_NAMESPACE}/`,
      why: 'docs/evaluation/corpus/ is part of the legacy Generation-1/A1 artifact-discovery contract: its clause-D scanner reads every JSON there whose generationId differs from the one being built as a prior-generation frame',
      legacyScannerUnchanged: LEGACY_SCANNER,
      isVersionIsolationNotAWorkaround: true,
      supersedesProposalLedgerFuturePath:
        'V3-A3 named docs/evaluation/corpus/PHASE_2B_2D_METHOD_V3_RESERVE_REPLACEMENT_LEDGER_V1_GEN2.json as a future path and flagged its collision; this decision places the ledger in the dedicated namespace instead, under the same filename',
    },
    carryForward: {
      decision: 'APPROVE_ALL_75_GENERATION1_SUCCESSFUL_OCCUPANTS_FOR_GENERATION2_CARRY_FORWARD_V1',
      historicalAcquisitionsRetainTheirPolicyVersion:
        'the 75 carried successes keep their own historical acquisition policy (66 predate v7); fetchPolicyVersion is run provenance (PIN_HISTORICAL_FETCH_POLICY_VERSION). No re-acquisition for version uniformity',
      slot72:
        'carries its committed owner ruling WINDOW_09_CONCURRENCY_DEVIATION_REVIEWED_NO_EVIDENCE_INVALIDATION_NO_RETRY_V1; not reopened',
    },
    p6: {
      decision: 'KEEP_P6_UNCHANGED_AND_INERT_UNDER_INHERITED_SUCCESS_STATE_V1',
      rule: `reserveConsumed > ${String(P6_MAX_REPLACEMENTS_BEFORE_SUCCESS_FLOOR)} AND successfulOrganisationCount < ${String(P6_SUCCESS_FLOOR)}`,
      generation2GenesisSuccessfulOrganisationCount: EXPECTED_STARTING_STATE.ACQUISITION_SUCCESSFUL,
      inert:
        'the second conjunct is false from genesis and cannot become true, because the success count never decreases. This inertness is known and accepted',
      doesNot: [
        'reset its success counter to zero',
        'reinterpret it as new Generation-2 successes',
        'invent another threshold',
        'replace it with a failure-rate gate',
      ],
    },
    pauseGates: {
      P1_P5_P7_P8:
        'carried forward exactly as Methodology V3 Proposal R1 specifies; no threshold changed',
      p7Generation2HashSurface: [
        'frozen frame binding',
        'original draw binding',
        'immutable Generation-1 ledger',
        'frozen Generation-2 reserve schedule',
        'Generation-2 ledger',
      ],
    },
    futureNewAcquisition: {
      fetchPolicy: FUTURE_ACQUISITION_FETCH_POLICY,
      runReferenceConvention: MODERN_RUN_REF_CONVENTION,
      sd9: `${SD9_RULE}: main_text_chars > 0`,
      minimumPagesAfterSd7: MIN_PAGES_AFTER_SD7,
      sd7: 'exact / near-duplicate logic unchanged',
      noNewExtractionCapability: true,
      noP70SpecificTuning: true,
    },
    a3Reuse: {
      governanceV4RemainsPinnedTo: A3_GOVERNANCE_V4_PINNED_A2_COMMIT,
      existingA3EvidenceRemainsValidForUnchangedAuthorities: true,
      a3ModifiedHere: false,
    },
    optionBTemporalCorrection: {
      ...OPTION_B_TEMPORAL_CORRECTION,
      accepted: true,
      meaning:
        'historical: Option B itself created no Methodology V3. It does not forbid a later, separately authorised methodology from existing',
      modifiedByThisFreeze: false,
    },
    notCreatedByThisFreeze: [
      'a strategy',
      'a window plan',
      'a pre-network assignment',
      'a live acquisition authority',
      'a Generation-2 reserve assignment',
      'an acquisition run',
    ],
    immutability: 'append-only. This record is never edited; a correction is a new record',
  };
}

// ---------------------------------------------------------------------------
// 2. Frozen reserve schedule.
// ---------------------------------------------------------------------------

export interface FrozenScheduleArtifact {
  readonly record: string;
  readonly recordKind: string;
  readonly generationId: string;
  readonly status: 'FROZEN';
  readonly entries: readonly Generation2ReserveScheduleEntry[];
  readonly frozenScheduleHash: string;
  readonly [key: string]: unknown;
}

/**
 * The proposal scheduleHash recomputed from ANY entry list by rebuilding the
 * proposal-canonical artifact with the landed builder.
 */
export function canonicalProposalScheduleHashOf(
  entries: readonly Generation2ReserveScheduleEntry[],
): string {
  return buildGeneration2ReserveScheduleArtifact(entries).scheduleHash;
}

export function recomputeFrozenScheduleHash(artifact: FrozenScheduleArtifact): string {
  const clone = { ...artifact } as Record<string, unknown>;
  delete clone.frozenScheduleHash;
  return sha256(canonicalStringify(clone));
}

export function buildFrozenSchedule(
  proposal: Generation2ReserveScheduleArtifact,
  draw: DrawForSchedule,
  approval: FileBinding,
): FrozenScheduleArtifact {
  if (recomputeScheduleHash(proposal) !== APPROVED_SCHEDULE_PROPOSAL.scheduleHash) {
    throw new Generation2FreezeStop('the proposal scheduleHash does not recompute');
  }
  if (proposal.entries.length !== APPROVED_SCHEDULE_PROPOSAL.entries) {
    throw new Generation2FreezeStop('the proposal schedule does not hold 5670 entries');
  }
  const violations = verifyGeneration2ReserveSchedule(proposal.entries, draw);
  if (violations.length > 0) {
    throw new Generation2FreezeStop(`schedule violations: ${violations.slice(0, 3).join('; ')}`);
  }
  // Copied entry by entry: no re-ranking, no filtering, no regenerated choice.
  const entries = proposal.entries.map((entry) => ({ ...entry }));
  if (canonicalProposalScheduleHashOf(entries) !== APPROVED_SCHEDULE_PROPOSAL.scheduleHash) {
    throw new Generation2FreezeStop(
      'the frozen entries do not reproduce the proposal scheduleHash',
    );
  }
  const withoutHash = {
    record: FROZEN_SCHEDULE_RECORD,
    recordKind: FROZEN_SCHEDULE_RECORD_KIND,
    generationId: GENERATION2_ID,
    status: 'FROZEN' as const,
    publicSafe: true,
    ...NO_AUTHORITY,
    ownerFreezeApproval: approval,
    frozenFromProposal: {
      path: APPROVED_SCHEDULE_PROPOSAL.path,
      sha256: APPROVED_SCHEDULE_PROPOSAL.sha256,
      commit: APPROVED_SCHEDULE_PROPOSAL.commit,
      scheduleHash: APPROVED_SCHEDULE_PROPOSAL.scheduleHash,
      proposalBytesUnchanged: true,
    },
    source: proposal.source,
    algorithm: proposal.algorithm,
    counts: proposal.counts,
    semantics: {
      ...proposal.semantics,
      corpusNamespace: `${GENERATION2_CORPUS_NAMESPACE}/ (APPROVE_GENERATION2_DEDICATED_CORPUS_NAMESPACE_V1)`,
    },
    contentEquality: {
      rule: 'the ordered entry payload is exactly the approved proposal entry payload: same count, order, Generation-2 positions, source frame ranks, echeRowKeys, organisationIds, rankHashes, frameEntrySha256 and scheduleEntrySha256',
      canonicalScheduleHash: APPROVED_SCHEDULE_PROPOSAL.scheduleHash,
      canonicalScheduleHashRecomputation:
        'buildGeneration2ReserveScheduleArtifact(entries).scheduleHash - the landed proposal builder applied to THESE entries - must equal the approved proposal scheduleHash',
      entriesSha256: sha256(canonicalStringify(entries)),
      firstEntry: { generation2ReserveRankPosition: 0, sourceFrameRankPosition: 150 },
      lastEntry: { generation2ReserveRankPosition: 5669, sourceFrameRankPosition: 5819 },
    },
    hashing: {
      ...proposal.hashing,
      frozenScheduleHash:
        'sha256(canonicalStringify(this artifact without frozenScheduleHash)); identifies the FROZEN record content, including its approval binding',
    },
    entries,
  };
  const frozenScheduleHash = sha256(canonicalStringify(withoutHash));
  return { ...withoutHash, frozenScheduleHash };
}

/** Structural proof over a frozen schedule read back from disk. */
export function verifyFrozenSchedule(
  frozen: FrozenScheduleArtifact,
  draw: DrawForSchedule,
): readonly string[] {
  const violations = [...verifyGeneration2ReserveSchedule(frozen.entries, draw)];
  if (frozen.status !== 'FROZEN') violations.push('status is not FROZEN');
  if (frozen.recordKind !== FROZEN_SCHEDULE_RECORD_KIND) violations.push('recordKind differs');
  if (frozen.generationId !== GENERATION2_ID) violations.push('generationId differs');
  if (recomputeFrozenScheduleHash(frozen) !== frozen.frozenScheduleHash) {
    violations.push('frozenScheduleHash does not recompute');
  }
  if (canonicalProposalScheduleHashOf(frozen.entries) !== APPROVED_SCHEDULE_PROPOSAL.scheduleHash) {
    violations.push('entries do not reproduce the approved proposal scheduleHash');
  }
  return violations;
}

// ---------------------------------------------------------------------------
// 3. Carry-forward baseline.
// ---------------------------------------------------------------------------

export interface CarryForwardInputs {
  readonly ctx: CarryForwardContext;
  readonly feasibilityText: string;
  readonly terminalText: string;
  readonly ledgerText: string;
  readonly drawText: string;
  readonly approval: FileBinding;
}

interface Feasibility {
  readonly slots: CarryForwardSlotRecord[];
  readonly bound: Readonly<Record<string, { path?: string; sha256?: string }>>;
  readonly verdict: string;
}

type SplitCounts = Record<Split, number>;
const zeroSplits = (): SplitCounts => ({ DEV_TRAIN: 0, DEV_CONFIRM: 0, FINAL_HOLDOUT: 0 });

export interface DerivedCarryForward {
  readonly audits: readonly SlotAudit[];
  readonly successful: readonly number[];
  readonly failures: readonly number[];
  readonly neverStarted: readonly number[];
  readonly refused: readonly number[];
  readonly bySplit: Readonly<Record<string, SplitCounts>>;
}

/** Re-derives the starting state with the landed, unchanged carry-forward audit. */
export function deriveCarryForward(
  ctx: CarryForwardContext,
  slots: readonly CarryForwardSlotRecord[],
): DerivedCarryForward {
  const { audits, state } = deriveGeneration2StartingState(ctx, slots);
  const bySplit: Record<string, SplitCounts> = {
    ACQUISITION_SUCCESSFUL: zeroSplits(),
    CURRENT_ACQUISITION_FAILURE: zeroSplits(),
    NEVER_STARTED: zeroSplits(),
  };
  const bucketOf = (index: number): string | undefined =>
    state.acquisitionSuccessfulSelectionIndices.includes(index)
      ? 'ACQUISITION_SUCCESSFUL'
      : state.CURRENT_ACQUISITION_FAILURE.includes(index)
        ? 'CURRENT_ACQUISITION_FAILURE'
        : state.NEVER_STARTED.includes(index)
          ? 'NEVER_STARTED'
          : undefined;
  for (const slot of ctx.draw.selection) {
    const bucket = bucketOf(slot.selectionIndex);
    if (bucket !== undefined) bySplit[bucket]![slot.split] += 1;
  }
  return {
    audits,
    successful: state.acquisitionSuccessfulSelectionIndices,
    failures: state.CURRENT_ACQUISITION_FAILURE,
    neverStarted: state.NEVER_STARTED,
    refused: state.CARRY_FORWARD_REFUSED,
    bySplit,
  };
}

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, offset) => from + offset);

const sameList = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

/** STOPs unless the re-derivation is exactly 75 / [75,76] / [] / 77..109 with the frozen splits. */
export function requireExpectedCarryForward(derived: DerivedCarryForward): void {
  const expected = EXPECTED_STARTING_STATE;
  if (
    derived.successful.length !== expected.ACQUISITION_SUCCESSFUL ||
    !sameList(derived.failures, expected.CURRENT_ACQUISITION_FAILURE) ||
    !sameList(
      derived.neverStarted,
      range(expected.NEVER_STARTED.from, expected.NEVER_STARTED.to),
    ) ||
    !sameList(derived.refused, expected.CARRY_FORWARD_REFUSED)
  ) {
    throw new Generation2FreezeStop(
      'the carry-forward no longer recomputes 75 / [75,76] / [] / 77..109',
    );
  }
  if (canonicalStringify(derived.bySplit) !== canonicalStringify(EXPECTED_BY_SPLIT)) {
    throw new Generation2FreezeStop('the carry-forward split cross-check differs');
  }
}

/** Every committed governance file the 110 slot records bind, re-verified by SHA-256. */
export function boundGovernanceFiles(
  ctx: CarryForwardContext,
  slots: readonly CarryForwardSlotRecord[],
): FileBinding[] {
  const pinned = new Map<string, string>();
  for (const slot of slots) {
    const holders: ({ path: string; sha256: string } | null | undefined)[] = [
      'dispositionAuthority' in slot ? slot.dispositionAuthority : undefined,
      'liveResult' in slot ? slot.liveResult : undefined,
      'acquisitionPolicyTransitionLedger' in slot
        ? slot.acquisitionPolicyTransitionLedger
        : undefined,
    ];
    for (const holder of holders) {
      if (holder === null || holder === undefined) continue;
      const prior = pinned.get(holder.path);
      if (prior !== undefined && prior !== holder.sha256) {
        throw new Generation2FreezeStop(`${holder.path} is pinned to two different hashes`);
      }
      pinned.set(holder.path, holder.sha256);
    }
  }
  return [...pinned.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([path, pinnedSha]) =>
      bindText(path, requirePinned(path, ctx.committed.get(path), pinnedSha)),
    );
}

export function buildCarryForwardBaseline(inputs: CarryForwardInputs): Record<string, unknown> {
  requirePinned(APPROVED_FEASIBILITY.path, inputs.feasibilityText, APPROVED_FEASIBILITY.sha256);
  requirePinned(
    GENERATION1_TERMINAL_RECORD_PATH,
    inputs.terminalText,
    GENERATION1_TERMINAL_RECORD_SHA256,
  );
  requirePinned(GENERATION1_LEDGER_PATH, inputs.ledgerText, GENERATION1_LEDGER_FILE_SHA256);
  requirePinned(DRAW_PATH, inputs.drawText, DRAW_FILE_SHA256);
  const feasibility = JSON.parse(inputs.feasibilityText) as Feasibility;
  const derived = deriveCarryForward(inputs.ctx, feasibility.slots);
  requireExpectedCarryForward(derived);

  const successAudits = derived.audits.filter(
    (audit) => audit.generation1Status === 'ACQUISITION_SUCCESSFUL',
  );
  const requirementPassCounts: Record<string, number> = {};
  for (const audit of successAudits) {
    for (const [id, passed] of Object.entries(audit.requirements)) {
      requirementPassCounts[id] = (requirementPassCounts[id] ?? 0) + (passed ? 1 : 0);
    }
  }
  const successRecords = feasibility.slots.filter(
    (slot): slot is SuccessfulSlotRecord => slot.generation1Status === 'ACQUISITION_SUCCESSFUL',
  );
  const policyVersions: Record<string, number> = {};
  for (const record of successRecords) {
    policyVersions[record.acquisitionPolicyVersion] =
      (policyVersions[record.acquisitionPolicyVersion] ?? 0) + 1;
  }
  const preV7 = successRecords.filter(
    (record) => record.acquisitionPolicyVersion !== FUTURE_ACQUISITION_FETCH_POLICY,
  ).length;
  const devTrainSuccesses = successRecords.filter((record) => record.split === 'DEV_TRAIN');
  const devTrainAfterV4 = devTrainSuccesses
    .filter((record) => record.governanceSource !== 'A3_COMMITTED_GOVERNANCE_V4_AT_67AE047')
    .map((record) => record.selectionIndex);

  const namedBound = (key: string): FileBinding => {
    const entry = feasibility.bound[key];
    if (entry?.path === undefined || entry.sha256 === undefined) {
      throw new Generation2FreezeStop(`feasibility binds no ${key}`);
    }
    return bindText(
      entry.path,
      requirePinned(entry.path, inputs.ctx.committed.get(entry.path), entry.sha256),
    );
  };

  return {
    recordId: 'phase2b-2d-a2-generation2-carry-forward-baseline-v1',
    recordKind: 'GENERATION2_CARRY_FORWARD_BASELINE',
    records: 'PHASE_2B_2D_A2_GENERATION2_CARRY_FORWARD_BASELINE_V1',
    status: 'FROZEN',
    generationId: GENERATION2_ID,
    fromGenerationId: GENERATION1_ID,
    recordedAtUtc: FREEZE_RECORDED_AT_UTC,
    publicSafe: true,
    ...NO_AUTHORITY,
    ownerDecision:
      'APPROVE_ALL_75_GENERATION1_SUCCESSFUL_OCCUPANTS_FOR_GENERATION2_CARRY_FORWARD_V1',
    bound: {
      ownerFreezeApproval: inputs.approval,
      feasibilityAudit: {
        ...bindText(APPROVED_FEASIBILITY.path, inputs.feasibilityText),
        verdict: feasibility.verdict,
      },
      generation1TerminalRecord: {
        ...bindText(GENERATION1_TERMINAL_RECORD_PATH, inputs.terminalText),
        commit: GENERATION1_TERMINAL_COMMIT,
        status: GENERATION1_TERMINAL_STATUS,
      },
      generation1Ledger: {
        ...bindText(GENERATION1_LEDGER_PATH, inputs.ledgerText),
        ledgerHash: GENERATION1_LEDGER_HASH,
        entries: GENERATION1_LEDGER_ENTRY_COUNT,
      },
      originalDraw: { ...bindText(DRAW_PATH, inputs.drawText), drawHash: DRAW_HASH },
      runProvenanceClosure: namedBound('runProvenanceClosure'),
      sd9Reconciliation: namedBound('sd9Reconciliation'),
      sd9Interpretation: namedBound('sd9Interpretation'),
      window09ConcurrencyReview: namedBound('window09ConcurrencyReview'),
      slotGovernance: {
        rule: 'every disposition authority, live result and acquisition-policy transition ledger any of the 110 slot records binds (including the Window 08, 09 and 11 adjudications behind the post-V4 successes and the two current failures), each re-verified here by SHA-256 against committed bytes',
        files: boundGovernanceFiles(inputs.ctx, feasibility.slots),
      },
      carryForwardRequirementHolders: [PROVENANCE_CLOSURE_PATH, SD9_RECONCILIATION_PATH],
      noDependencyOn: ['a live A3 worktree', 'the current A3 HEAD', 'the database', 'the network'],
    },
    recomputation: {
      method:
        'deriveGeneration2StartingState (src/test/harness/phase2b2d/generation2/carryForward.ts, unchanged) re-run over the committed feasibility slot records and committed governance bytes: every requirement R1..R10 recomputed, never read back from a boolean',
      successfulOccupantsChecked: successAudits.length,
      accepted: successAudits.filter((audit) => audit.passed).length,
      refused: derived.refused.length,
      requirementPassCountsOverSuccessfulSlots: requirementPassCounts,
      everyNonSuccessAuditPassed: derived.audits
        .filter((audit) => audit.generation1Status !== 'ACQUISITION_SUCCESSFUL')
        .every((audit) => audit.passed),
    },
    startingState: {
      ACQUISITION_SUCCESSFUL: derived.successful.length,
      CURRENT_ACQUISITION_FAILURE: derived.failures,
      PENDING_CAPABILITY_REVIEW: [],
      NEVER_STARTED: {
        from: derived.neverStarted[0],
        to: derived.neverStarted.at(-1),
        count: derived.neverStarted.length,
        contiguous: true,
      },
      CARRY_FORWARD_REFUSED: derived.refused,
      accounting: EXPECTED_STARTING_STATE.accounting,
      bySplit: derived.bySplit,
      firstGeneration2Q1: [...FIRST_GENERATION2_Q1],
      q1ConsumesGeneration2ReservesAtFreeze: 0,
      nextGeneration2ReservePosition: 0,
      noMappingFromQ1ToReservePositionsIsWritten:
        'assigning slots 75/76 to Generation-2 positions belongs to a future acquisition-planning authority',
    },
    historicalAcquisitionPolicy: {
      rule: 'carried successes keep their own historical acquisition policy version (PIN_HISTORICAL_FETCH_POLICY_VERSION); v7 is required only for NEW acquisition',
      carriedSuccessesPredatingV7: preV7,
      distribution: policyVersions,
      noReAcquisitionForVersionUniformity: true,
    },
    slot72:
      'carried with its committed owner ruling WINDOW_09_CONCURRENCY_DEVIATION_REVIEWED_NO_EVIDENCE_INVALIDATION_NO_RETRY_V1; not reopened in Generation 2',
    a3Reuse: {
      governanceV4RemainsPinnedTo: A3_GOVERNANCE_V4_PINNED_A2_COMMIT,
      carriedDevTrainSuccesses: devTrainSuccesses.length,
      devTrainAlreadyInGovernanceV4: devTrainSuccesses.length - devTrainAfterV4.length,
      devTrainOutsideGovernanceV4: devTrainAfterV4,
      note: 'the DEV_TRAIN success decided after 67ae047 (Window 08) is a future A3 incremental authority. A3 is not modified here',
    },
    immutability: 'append-only. This record is never edited; a correction is a new record',
  };
}

// ---------------------------------------------------------------------------
// 4. Genesis ledger.
// ---------------------------------------------------------------------------

export type FrozenGenesisLedger = Omit<Generation2Ledger, 'status' | 'reserveSchedule'> & {
  readonly status: 'FROZEN';
  readonly reserveSchedule: {
    readonly path: string;
    readonly scheduleHash: string;
    readonly fileSha256: string;
    readonly frozenScheduleHash: string;
  };
  readonly [key: string]: unknown;
};

export function recomputeFrozenLedgerHash(ledger: FrozenGenesisLedger): string {
  const clone = { ...ledger } as Record<string, unknown>;
  delete clone.ledgerHash;
  return sha256(canonicalStringify(clone));
}

/**
 * The landed Generation-2 validator types its input as the PROPOSAL ledger;
 * its checks read only fields both shapes share, and the ledgerHash rule is
 * the same whole-object rule. This view lets the frozen ledger be validated,
 * resolved and planned against by the unchanged proposal primitives.
 */
export function asGeneration2Ledger(ledger: FrozenGenesisLedger): Generation2Ledger {
  return ledger as unknown as Generation2Ledger;
}

export function buildGenesisLedger(
  approval: FileBinding,
  frozenSchedule: FileBinding & { readonly frozenScheduleHash: string },
  carryForwardBaseline: FileBinding,
  drawText: string,
): FrozenGenesisLedger {
  requirePinned(DRAW_PATH, drawText, DRAW_FILE_SHA256);
  const withoutHash = {
    record: GENESIS_LEDGER_RECORD,
    recordKind: GENESIS_LEDGER_RECORD_KIND,
    generationId: GENERATION2_ID,
    status: 'FROZEN' as const,
    publicSafe: true,
    ...NO_AUTHORITY,
    appendOnly: true,
    ownerFreezeApproval: approval,
    generation1StartingState: buildGeneration1StartingState(GENERATION1_TERMINAL_RECORD_SHA256),
    generation1HistoryIsNotFlattened:
      'the 39 Generation-1 transitions stay ONLY in the immutable Generation-1 ledger. This ledger never duplicates, rewrites or re-sequences them; current occupant = immutable Generation-1 terminal occupant + this ledger’s tail',
    selectionDraw: {
      ...bindText(DRAW_PATH, drawText),
      drawHash: DRAW_HASH,
      authority: 'selection portion only (110 slots)',
    },
    reserveSchedule: {
      path: FROZEN_SCHEDULE_PATH,
      scheduleHash: APPROVED_SCHEDULE_PROPOSAL.scheduleHash,
      fileSha256: frozenSchedule.sha256,
      frozenScheduleHash: frozenSchedule.frozenScheduleHash,
    },
    carryForwardBaseline,
    currentOccupantDerivation: {
      version: 'GENERATION2_CROSS_GENERATION_OCCUPANT_RESOLUTION_V1',
      resolver:
        'src/test/harness/phase2b2d/generation2/generation2Ledger.ts resolveGeneration2Occupant',
      chain:
        'original selection -> Generation-1 replacement chain -> Generation-1 terminal current occupant -> Generation-2 replacement chain',
    },
    reserveCount: GENERATION2_RESERVE_COUNT,
    selectionCount: SELECTION_COUNT,
    reserveExhaustionRefusal: GENERATION2_RESERVE_EXHAUSTION_REFUSAL,
    replacementReasons: [...REPLACEMENT_REASONS],
    replacementReasonPrecedence: [...REPLACEMENT_REASON_PRECEDENCE],
    hashing: {
      entryHash:
        'sha256(canonicalStringify(entry without entryHash)), chained by previousEntryHash',
      ledgerHash:
        'sha256(canonicalStringify(this ledger without ledgerHash)): generation identity, the immutable Generation-1 starting-state bindings, the frozen schedule binding and the entries array. It is never the Generation-1 ledgerHash',
      derivedNotStored:
        'entryCount and the next Generation-2 reserve position are derived from entries (at genesis: 0 and 0); no mutable counter, status or current-occupant field is stored',
    },
    entries: [],
  };
  const ledgerHash = sha256(canonicalStringify(withoutHash));
  return { ...withoutHash, ledgerHash } as unknown as FrozenGenesisLedger;
}

// ---------------------------------------------------------------------------
// 5. Frozen baseline.
// ---------------------------------------------------------------------------

export interface FrozenBaselineInputs {
  readonly approval: FileBinding;
  readonly frameText: string;
  readonly drawText: string;
  readonly terminalText: string;
  readonly ledgerText: string;
  readonly generation1Ledger: ReplacementLedger;
  readonly draw: CarryForwardContext['draw'];
  readonly frozenSchedule: FileBinding & {
    readonly frozenScheduleHash: string;
    readonly count: number;
  };
  readonly genesisLedger: FileBinding & {
    readonly ledgerHash: string;
    readonly entryCount: number;
  };
  readonly carryForwardBaseline: FileBinding;
}

export function buildFrozenBaseline(inputs: FrozenBaselineInputs): Record<string, unknown> {
  requirePinned(FRAME_PATH, inputs.frameText, FRAME_FILE_SHA256);
  requirePinned(DRAW_PATH, inputs.drawText, DRAW_FILE_SHA256);
  requirePinned(
    GENERATION1_TERMINAL_RECORD_PATH,
    inputs.terminalText,
    GENERATION1_TERMINAL_RECORD_SHA256,
  );
  requirePinned(GENERATION1_LEDGER_PATH, inputs.ledgerText, GENERATION1_LEDGER_FILE_SHA256);
  if (recomputeLedgerHash(inputs.generation1Ledger) !== GENERATION1_LEDGER_HASH) {
    throw new Generation2FreezeStop('the Generation-1 ledgerHash does not recompute');
  }
  if (
    reserveConsumedCount(inputs.draw, inputs.generation1Ledger) !== GENERATION1_LEDGER_ENTRY_COUNT
  ) {
    throw new Generation2FreezeStop('the Generation-1 ledger is not the 39-entry terminal ledger');
  }
  const splits = zeroSplits();
  for (const slot of inputs.draw.selection) splits[slot.split] += 1;
  if (canonicalStringify(splits) !== canonicalStringify(EXPECTED_SELECTION_SPLITS)) {
    throw new Generation2FreezeStop('the selection splits are not 20 / 45 / 45');
  }
  if (inputs.genesisLedger.entryCount !== 0) {
    throw new Generation2FreezeStop('the genesis ledger is not empty');
  }
  const reserveConsumed = inputs.genesisLedger.entryCount;
  const successful = EXPECTED_STARTING_STATE.ACQUISITION_SUCCESSFUL;

  return {
    recordId: 'phase2b-2d-a2-generation2-frozen-baseline-v1',
    recordKind: 'GENERATION2_FROZEN_BASELINE',
    records: 'PHASE_2B_2D_A2_GENERATION2_FROZEN_BASELINE_V1',
    status: 'FROZEN',
    recordedAtUtc: FREEZE_RECORDED_AT_UTC,
    publicSafe: true,
    ...NO_AUTHORITY,
    terminalState: FREEZE_TERMINAL_STATE,
    generationId: GENERATION2_ID,
    architecture: ARCHITECTURE_ID,
    generation1: {
      generationId: GENERATION1_ID,
      status: GENERATION1_TERMINAL_STATUS,
      permanent: true,
    },
    bound: {
      methodologyV3OwnerFreezeApproval: inputs.approval,
      originalFrame: {
        ...bindText(FRAME_PATH, inputs.frameText),
        frameHash: FRAME_HASH,
        commit: FRAME_COMMIT,
        eligible: ELIGIBLE_COUNT,
        reusedNotRematerialised: true,
      },
      originalDraw: {
        ...bindText(DRAW_PATH, inputs.drawText),
        drawHash: DRAW_HASH,
        selection: SELECTION_COUNT,
        generation1Reserves: GENERATION1_RESERVE_COUNT,
        neverDrawn: GENERATION2_RESERVE_COUNT,
        generation2SelectionAuthority: 'the original selection portion ONLY',
      },
      generation1Terminal: {
        ...bindText(GENERATION1_TERMINAL_RECORD_PATH, inputs.terminalText),
        commit: GENERATION1_TERMINAL_COMMIT,
      },
      generation1Ledger: {
        ...bindText(GENERATION1_LEDGER_PATH, inputs.ledgerText),
        ledgerHash: GENERATION1_LEDGER_HASH,
        entries: GENERATION1_LEDGER_ENTRY_COUNT,
        reserve39Assigned: false,
        sequence39Exists: false,
      },
      frozenGeneration2ReserveSchedule: {
        ...inputs.frozenSchedule,
        canonicalScheduleHash: APPROVED_SCHEDULE_PROPOSAL.scheduleHash,
      },
      generation2GenesisLedger: inputs.genesisLedger,
      carryForwardBaseline: inputs.carryForwardBaseline,
    },
    selectionPreservation: {
      selectionCount: SELECTION_COUNT,
      splits,
      selectionDigest: sha256(
        canonicalStringify(
          inputs.draw.selection.map((slot) => ({
            selectionIndex: slot.selectionIndex,
            drawEntrySha256: drawEntrySha256Of(slot),
            split: slot.split,
          })),
        ),
      ),
      selectionDigestRule:
        'sha256(canonicalStringify([{selectionIndex, drawEntrySha256, split}] over selection 0..109)); drawEntrySha256 covers echeRowKey and organisationId',
    },
    report: {
      generationId: GENERATION2_ID,
      selectionCount: SELECTION_COUNT,
      reserveScheduleCount: inputs.frozenSchedule.count,
      reserveScheduleSourceRanks: `${String(GENERATION2_RESERVE_FIRST_SOURCE_RANK)}..${String(GENERATION2_RESERVE_LAST_SOURCE_RANK)}`,
      carriedSuccessful: successful,
      currentFailures: EXPECTED_STARTING_STATE.CURRENT_ACQUISITION_FAILURE.length,
      pending: 0,
      neverStarted: EXPECTED_STARTING_STATE.NEVER_STARTED.count,
      generation2ReserveConsumed: reserveConsumed,
      generation2NextReserve: 0,
      firstQ1: [...FIRST_GENERATION2_Q1],
      firstQ1Count: FIRST_GENERATION2_Q1.length,
      generation1UnusedReservePosition: GENERATION1_UNUSED_RESERVE_POSITION,
    },
    p6: {
      decision: 'KEEP_P6_UNCHANGED_AND_INERT_UNDER_INHERITED_SUCCESS_STATE_V1',
      firesAtGeneration2Genesis: p6Fires({
        reserveConsumedCount: reserveConsumed,
        successfulOrganisationCount: successful,
      }),
      firesEvenCountingAllGeneration1Replacements: p6Fires({
        reserveConsumedCount: GENERATION1_LEDGER_ENTRY_COUNT,
        successfulOrganisationCount: successful,
      }),
      canNeverFire:
        'successfulOrganisationCount starts at 75 >= 50 and never decreases, so the second conjunct is false for the whole generation',
    },
    p7Generation2HashSurface: {
      frameHash: FRAME_HASH,
      drawHash: DRAW_HASH,
      generation1LedgerHash: GENERATION1_LEDGER_HASH,
      generation2ScheduleHash: APPROVED_SCHEDULE_PROPOSAL.scheduleHash,
      generation2FrozenScheduleHash: inputs.frozenSchedule.frozenScheduleHash,
      generation2GenesisLedgerHash: inputs.genesisLedger.ledgerHash,
    },
    futureNewAcquisition: {
      fetchPolicy: FUTURE_ACQUISITION_FETCH_POLICY,
      runReferenceConvention: MODERN_RUN_REF_CONVENTION,
      sd9: `${SD9_RULE}: main_text_chars > 0`,
      minimumPagesAfterSd7: MIN_PAGES_AFTER_SD7,
    },
    thisRecordAuthorisesNoNetworkAction: true,
    nextOwnerQuestion:
      'whether to grant the FIRST bounded Generation-2 acquisition authority for inherited Q1 [75,76] plus subsequent never-started primaries. Not granted here',
    immutability: 'append-only. This record is never edited; a correction is a new record',
  };
}
