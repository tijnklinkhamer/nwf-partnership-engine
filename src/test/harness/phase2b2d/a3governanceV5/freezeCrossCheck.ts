/**
 * PHASE 2B-2D — A3 R38B: THE TERMINAL FREEZE, AS A CLOSURE AND A CROSS-CHECK.
 *
 * The terminal A2 corpus-freeze approval is NEVER disposition authority. Its
 * `finalAcquisitionState`, split totals, terminal token and success count are
 * not inputs to any fact, admission or registry. It is used exactly twice:
 *
 *   1. BINDING CLOSURE (before interpretation): every one of the records it
 *      binds is re-read at its stated commit - or, where the binding names no
 *      commit, at the pinned terminal checkpoint itself - and its SHA-256 (and
 *      byte count, where stated) must match. This closes the freeze over exact
 *      committed bytes; it does NOT put those records into Registry V5.
 *
 *   2. AGGREGATE CROSS-CHECK (after derivation): once R38A has independently
 *      resolved all slots, the freeze's declared aggregate, run-reference
 *      integrity, canonical ledger and explicit thirteen-window history are
 *      COMPARED with what was derived. A disagreement refuses the snapshot; the
 *      derived authority is never adjusted to match.
 */
import { createHash } from 'node:crypto';
import { readCommittedBlobs } from '../a3governanceV2/commitLoader.js';
import type { Split } from '../a3prep/contracts.js';
import type { CrossGenerationRecordBinding } from '../a3crossGenerationSlotAuthority/types.js';
import { refuseV5 } from './refusal.js';
import type { CommittedGovernanceFileV5, CommittedGovernanceV5 } from './commitLoaderV5.js';
import {
  COMMITTED_A2_GOVERNANCE_CHECKPOINT_V5,
  GENERATION2_CADENCE_WINDOW_ORDINALS_V5,
  GENERATION2_WINDOW_ORDINALS_V5,
  generation2WindowAdjudicationId,
  generation2WindowAuthorityId,
  generation2WindowCadenceId,
  generation2WindowLiveResultId,
} from './registryV5.js';

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

// ---------------------------------------------------------------------------
// A. BINDING CLOSURE.
// ---------------------------------------------------------------------------

interface FreezeBinding {
  readonly path: string;
  readonly sha256: string;
  readonly commit: string | null;
  readonly bytes: number | null;
}

export function freezeBindingsOf(freeze: Json): readonly FreezeBinding[] {
  const bindings: FreezeBinding[] = [];
  const take = (value: unknown): void => {
    if (isObject(value) && typeof value.path === 'string' && typeof value.sha256 === 'string') {
      bindings.push({
        path: value.path,
        sha256: value.sha256,
        commit: typeof value.commit === 'string' ? value.commit : null,
        bytes: typeof value.bytes === 'number' ? value.bytes : null,
      });
    }
  };
  if (!isObject(freeze.bound)) {
    refuseV5('V5_FREEZE_BINDING_MISMATCH', 'the terminal freeze carries no bound block');
  }
  Object.values(freeze.bound as Json).forEach(take);
  const history = freeze.explicitThirteenWindowHistory;
  if (!isObject(history) || !Array.isArray(history.windows)) {
    refuseV5(
      'V5_FREEZE_BINDING_MISMATCH',
      'the terminal freeze carries no explicit window history',
    );
  }
  for (const window of history.windows as unknown[]) {
    if (isObject(window)) Object.values(window).forEach(take);
  }
  return Object.freeze(bindings);
}

export interface FreezeBindingClosureV5 {
  readonly bindingsVerified: number;
  readonly bindingsMismatched: 0;
  readonly bindingsVerifiedAtTheirOwnCommit: number;
  readonly bindingsVerifiedAtTheCheckpoint: number;
}

/** Re-reads every record the freeze binds; any disagreement refuses. */
export function verifyFreezeBindingClosureV5(
  repositoryRoot: string,
  freeze: CommittedGovernanceFileV5,
): FreezeBindingClosureV5 {
  const bindings = freezeBindingsOf(freeze.parsed);
  const blobs = readCommittedBlobs(
    repositoryRoot,
    bindings.map((binding) => ({
      commit: binding.commit ?? COMMITTED_A2_GOVERNANCE_CHECKPOINT_V5,
      path: binding.path,
    })),
  );
  bindings.forEach((binding, index) => {
    const bytes = blobs[index]!;
    if (
      sha256(bytes) !== binding.sha256 ||
      (binding.bytes !== null && bytes.length !== binding.bytes)
    ) {
      refuseV5(
        'V5_FREEZE_BINDING_MISMATCH',
        `terminal-freeze binding ${String(index)} does not match its committed bytes`,
      );
    }
  });
  const atOwn = bindings.filter((binding) => binding.commit !== null).length;
  return Object.freeze({
    bindingsVerified: bindings.length,
    bindingsMismatched: 0,
    bindingsVerifiedAtTheirOwnCommit: atOwn,
    bindingsVerifiedAtTheCheckpoint: bindings.length - atOwn,
  });
}

// ---------------------------------------------------------------------------
// B. POST-DERIVATION AGGREGATE CROSS-CHECK.
// ---------------------------------------------------------------------------

export interface DerivedTerminalStateForCrossCheck {
  readonly readySlotCount: number;
  readonly readyBySplit: Readonly<Record<Split, number>>;
  readonly unsuccessfulSelectionIndices: readonly number[];
  readonly notAdjudicatedSelectionIndices: readonly number[];
  readonly ordinaryRunReferences: readonly string[];
  readonly acceptedRecoveryRunReferences: readonly string[];
  readonly window13OriginalRunRefSha256: string;
  readonly window13Adjudication: CrossGenerationRecordBinding;
  readonly generation2Ledger: {
    readonly path: string;
    readonly fileSha256: string;
    readonly ledgerHash: string;
    readonly entryCount: number;
  };
}

export interface FreezeAggregateCrossCheckV5 {
  readonly freezeAggregateUsedAsDispositionSource: false;
  readonly freezeAggregateUsedOnlyAsPostDerivationCrossCheck: true;
  readonly successfulAgrees: true;
  readonly splitTotalsAgree: true;
  readonly noFailurePendingOrNeverStartedAgrees: true;
  readonly runReferenceIntegrityAgrees: true;
  readonly canonicalLedgerAgrees: true;
  readonly explicitWindowHistoryAgrees: true;
}

function sameIndexList(declared: unknown, derived: readonly number[]): boolean {
  return (
    Array.isArray(declared) &&
    JSON.stringify([...(declared as number[])].sort((a, b) => a - b)) === JSON.stringify(derived)
  );
}

/**
 * Compares the freeze's declarations with the INDEPENDENTLY derived state.
 * Called only after the R38A resolution exists; it changes nothing it reads.
 */
export function crossCheckFreezeAggregateV5(
  governance: CommittedGovernanceV5,
  freeze: CommittedGovernanceFileV5,
  derived: DerivedTerminalStateForCrossCheck,
): FreezeAggregateCrossCheckV5 {
  const record = freeze.parsed;
  const fail = (what: string): never =>
    refuseV5('V5_FREEZE_AGGREGATE_MISMATCH', `the terminal freeze ${what} is not what was derived`);
  const state = record.finalAcquisitionState;
  if (!isObject(state)) return fail('final acquisition state');
  if (state.ACQUISITION_SUCCESSFUL !== derived.readySlotCount) fail('success count');
  const bySplit = state.acquisitionSuccessfulBySplit;
  if (
    !isObject(bySplit) ||
    Object.keys(bySplit).length !== 3 ||
    (Object.keys(derived.readyBySplit) as Split[]).some(
      (split) => bySplit[split] !== derived.readyBySplit[split],
    )
  ) {
    fail('split totals');
  }
  const neverStarted = state.NEVER_STARTED;
  if (
    !sameIndexList(state.CURRENT_ACQUISITION_FAILURE, derived.unsuccessfulSelectionIndices) ||
    !sameIndexList(state.PENDING_CAPABILITY_REVIEW, []) ||
    !sameIndexList(state.REPLACEMENT_ASSIGNED_AWAITING_EXECUTION, []) ||
    !isObject(neverStarted) ||
    neverStarted.count !== derived.notAdjudicatedSelectionIndices.length
  ) {
    fail('failure / pending / never-started state');
  }

  const integrity = record.runReferenceIntegrity;
  const ordinary = derived.ordinaryRunReferences;
  const recovered = derived.acceptedRecoveryRunReferences;
  const union = new Set([...ordinary, ...recovered]);
  if (
    !isObject(integrity) ||
    integrity.ordinaryWindowRunReferences !== ordinary.length ||
    integrity.acceptedTargetedHostRecoveryRunReferences !== recovered.length ||
    integrity.globalUnion !== union.size ||
    integrity.distinct !== union.size ||
    integrity.globallyUnique !== true ||
    !isObject(integrity.window13OriginalHostConfoundedRun) ||
    integrity.window13OriginalHostConfoundedRun.runRefSha256 !==
      derived.window13OriginalRunRefSha256 ||
    !isObject(integrity.acceptedRecoveryRun) ||
    recovered.length !== 1 ||
    integrity.acceptedRecoveryRun.runRefSha256 !== recovered[0] ||
    !isObject(integrity.acceptedRecoveryRun.acquisitionOfRecordOnlyThrough) ||
    integrity.acceptedRecoveryRun.acquisitionOfRecordOnlyThrough.path !==
      derived.window13Adjudication.path ||
    integrity.acceptedRecoveryRun.acquisitionOfRecordOnlyThrough.sha256 !==
      derived.window13Adjudication.sha256 ||
    integrity.acceptedRecoveryRun.acquisitionOfRecordOnlyThrough.commit !==
      derived.window13Adjudication.commit
  ) {
    fail('run-reference integrity');
  }

  const ledger = record.canonicalLedger;
  if (
    !isObject(ledger) ||
    ledger.path !== derived.generation2Ledger.path ||
    ledger.fileSha256 !== derived.generation2Ledger.fileSha256 ||
    ledger.ledgerHash !== derived.generation2Ledger.ledgerHash ||
    ledger.entryCount !== derived.generation2Ledger.entryCount ||
    ledger.nextGeneration2ReservePosition !== derived.generation2Ledger.entryCount
  ) {
    fail('canonical Generation-2 ledger');
  }

  const history = record.explicitThirteenWindowHistory as Json;
  const windows = (history.windows as Json[]) ?? [];
  const file = (id: string): CommittedGovernanceFileV5 | undefined => governance.files.get(id);
  const matches = (value: unknown, registered: CommittedGovernanceFileV5 | undefined): boolean =>
    registered !== undefined &&
    isObject(value) &&
    value.path === registered.path &&
    value.sha256 === registered.sha256;
  if (
    history.windowCount !== GENERATION2_WINDOW_ORDINALS_V5.length ||
    windows.length !== GENERATION2_WINDOW_ORDINALS_V5.length ||
    windows.some((window, index) => {
      const ordinal = GENERATION2_WINDOW_ORDINALS_V5[index]!;
      const cadence = GENERATION2_CADENCE_WINDOW_ORDINALS_V5.includes(ordinal);
      return (
        window.windowOrdinal !== ordinal ||
        !matches(window.adjudication, file(generation2WindowAdjudicationId(ordinal))) ||
        !matches(window.liveResult, file(generation2WindowLiveResultId(ordinal))) ||
        !matches(window.authority, file(generation2WindowAuthorityId(ordinal))) ||
        'cadenceAuthority' in window !== cadence ||
        (cadence && !matches(window.cadenceAuthority, file(generation2WindowCadenceId(ordinal))))
      );
    })
  ) {
    fail('explicit thirteen-window history');
  }
  return Object.freeze({
    freezeAggregateUsedAsDispositionSource: false,
    freezeAggregateUsedOnlyAsPostDerivationCrossCheck: true,
    successfulAgrees: true,
    splitTotalsAgree: true,
    noFailurePendingOrNeverStartedAgrees: true,
    runReferenceIntegrityAgrees: true,
    canonicalLedgerAgrees: true,
    explicitWindowHistoryAgrees: true,
  });
}
