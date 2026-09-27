/**
 * PHASE 2B-2D — A3 R32: THE COMMITTED A2 GOVERNANCE V4 AUTHORITY ADAPTER.
 *
 * ONE QUESTION
 *
 *   What does the UNCHANGED R17 authority resolver derive from the exact
 *   committed A2 governance Registry V4 names - read from pinned commits,
 *   never from a working tree?
 *
 * WHAT THIS MODULE DOES, IN ORDER
 *
 *   1. verifies every Registry V4 entry from its own commit (`commitLoaderV4.ts`);
 *   2. normalises the frozen draw, digesting each entry with the already-landed
 *      canonical primitive;
 *   3. validates the thirty-entry replacement ledger with the CANONICAL
 *      validator, then checks its pinned ledger hash and entry count;
 *   4. validates the unchanged V2 -> V3 -> V4 -> V6 transition chain with the
 *      V1 validator, over the verified LEGACY V1 SUBVIEW;
 *   5. parses every V1 / V2 / V3 record with its UNCHANGED parser over its own
 *      subview, and every V4 window record with its own V4 parser;
 *   6. parses the SD9 reconciliation and the provenance closure;
 *   7. completes prefix-era facts ONLY through the closure bridge, and binds
 *      every PENDING / HELD item to the exact later record that resolves it -
 *      an item nobody resolves refuses the whole snapshot;
 *   8. scopes every supersession chain to one occupancy episode;
 *   9. audits all thirty replacement-ledger entries against committed
 *      authority that PREDATES the ledger revision, and emits NONE of those
 *      historical facts;
 *  10. feeds R17 ONLY current episodes, each as an ordinary
 *      `A2AdjudicatedAcquisitionFact` with a full 64-hex `runRefSha256` -
 *      R17 cannot tell a closure-backed fact from a modern one - and calls the
 *      real R17 resolver and the real R17 summary;
 *  11. cross-checks, AFTER derivation, the closure's census and the state the
 *      closure and the reconciliation declare. A declared aggregate is never
 *      an input.
 *
 * WHY STEPS 2, 3, 8 AND 9 ARE RESTATED HERE
 *
 *   They are adapter logic (not R17 logic). R31's versions are private to the
 *   V3 namespace, which stays byte-identical so that Registry V3 keeps meaning
 *   exactly the R31 snapshot. Each is the same algorithm over the same
 *   canonical primitives; the refusals it raises are V1's own codes. Nothing
 *   R17 does is reproduced: current-occupant derivation, READY minting and the
 *   summary all come from R17 itself.
 *
 * WHAT IT NEVER DOES
 *
 *   No working database, no sealed root, no institution network, no provider,
 *   no branch, no working-tree governance bytes, no directory scan, no
 *   "latest", no SET_P / SET_R / SD7 / SD9 / corpus step, and no A2 action:
 *   an open replacement obligation is surfaced by R17, never served here.
 */
import {
  currentOccupantForSelectionIndex,
  recomputeLedgerHash,
  requireValidLedger,
  type DrawForLedger,
  type ReplacementLedger,
} from '../continuationWindow/replacementLedger.js';
import { drawEntrySha256 } from '../continuationWindow/windowPlan.js';
import {
  A2_CURRENT_OCCUPANT_ACQUISITION_UNSUCCESSFUL,
  A2_EVIDENCE_PENDING_ADJUDICATION,
  A2_TERMINAL_EVIDENCE_ADJUDICATION,
  deriveGenerationSlotAuthoritySummary,
  resolveGenerationSlotAuthorities,
  type A2AdjudicatedAcquisitionFact,
  type A2GenerationDrawReserveEntry,
  type A2GenerationDrawSelectionSlot,
  type A2ReplacementLedgerRevision,
  type A2ReplacementLedgerTransition,
  type A3GenerationSlotAuthorityResolution,
  type A3GenerationSlotAuthoritySummary,
} from '../a3prep/slotAuthority.js';
import type { Split } from '../a3prep/contracts.js';
import {
  ACQUISITION_SUCCESSFUL,
  episodeKeyOf,
  GENERATION_ID,
  parseGovernanceFamilies,
  type EpisodeRef,
  type EpisodeRunClaim,
  type ParsedFamilyOutput,
  type ParsedHistoricalReason,
  type ParsedTerminalItem,
  type UnsuccessfulDisposition,
} from '../a3governance/families.js';
import { refuse } from '../a3governance/refusal.js';
import { TRANSITION_LEDGER_TIP_V1 } from '../a3governance/registryV1.js';
import {
  buildRunSupersessionChains,
  validateTransitionLedgerChain,
  type RunSupersessionChain,
  type ValidatedTransitionLedgerChain,
} from '../a3governance/transitionLedger.js';
import { parsePostP18SecondWindowAdjudication } from '../a3governanceV2/familiesV2.js';
import { parsePostP24WindowAdjudication } from '../a3governanceV3/familiesV3.js';
import {
  bindingOfCommittedV4,
  legacyV1SubviewOfV4,
  loadCommittedGovernanceV4,
  requireCommittedFileV4,
  v2CompatibleSubviewOfV4,
  v3CompatibleSubview,
  type CommittedGovernanceV4,
} from './commitLoaderV4.js';
import {
  HELD_PENDING_VANTAGE_REVALIDATION,
  PENDING_CAPABILITY_REVIEW,
  parseGovernanceFamiliesV4,
  type NonTerminalItem,
  type ParsedFamilyOutputV4,
} from './familiesV4.js';
import {
  bridgePrefixEraItems,
  closureStatesSameRun,
  FULL_RUN_REFERENCE_SOURCE,
  MIXED_CONVENTION_BRIDGE,
  parseRunProvenanceClosure,
  PROVENANCE_CLOSURE_BRIDGE,
  RECONCILIATION_CORRECTION,
  type CurrentFactProvenanceKind,
  type ParsedRunProvenanceClosure,
} from './provenanceClosure.js';
import { parseSd9Reconciliation, type ParsedSd9Reconciliation } from './reconciliation.js';
import { refuseV4 } from './refusal.js';
import {
  COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES,
  REGISTRY_V4_IDS_POSTDATING_LEDGER_REVISION,
  REPLACEMENT_LEDGER_REGISTRY_ID,
  REPLACEMENT_LEDGER_V4_PIN,
  type GovernanceRegistryEntryV4,
} from './registryV4.js';

// ---------------------------------------------------------------------------
// A. THE FROZEN DRAW, NORMALISED.
// ---------------------------------------------------------------------------

interface NormalisedDraw {
  readonly binding: {
    readonly path: string;
    readonly artifactFileSha256: string;
    readonly drawHash: string;
  };
  readonly selection: readonly A2GenerationDrawSelectionSlot[];
  readonly reserve: readonly A2GenerationDrawReserveEntry[];
  readonly forLedger: DrawForLedger;
}

function normaliseDraw(governance: CommittedGovernanceV4): NormalisedDraw {
  const file = requireCommittedFileV4(governance, 'FROZEN_DRAW_V2_GEN1');
  const record = file.parsed;
  if (record.generationId !== GENERATION_ID) {
    refuse('FROZEN_DRAW_MALFORMED', 'the frozen draw names another generation');
  }
  if (typeof record.drawHash !== 'string' || !/^[0-9a-f]{64}$/.test(record.drawHash)) {
    refuse('FROZEN_DRAW_MALFORMED', 'the frozen draw carries no lower-hex drawHash');
  }
  if (!Array.isArray(record.selection) || !Array.isArray(record.reserve)) {
    refuse('FROZEN_DRAW_MALFORMED', 'the frozen draw has no selection or reserve array');
  }
  const selection = record.selection.map((raw, index): A2GenerationDrawSelectionSlot => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      refuse('FROZEN_DRAW_MALFORMED', `selection[${String(index)}] is not an object`);
    }
    const entry = raw as Record<string, unknown>;
    if (entry.selectionIndex !== index) {
      refuse('FROZEN_DRAW_MALFORMED', `selection[${String(index)}] is out of order`);
    }
    if ('reserveRankPosition' in entry) {
      refuse('FROZEN_DRAW_MALFORMED', `selection[${String(index)}] carries a reserve position`);
    }
    return Object.freeze({
      selectionIndex: index,
      split: entry.split as Split,
      echeRowKey: entry.echeRowKey as string,
      organisationId: entry.organisationId as string,
      drawEntrySha256: drawEntrySha256(entry),
    });
  });
  const reserve = record.reserve.map((raw, index): A2GenerationDrawReserveEntry => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      refuse('FROZEN_DRAW_MALFORMED', `reserve[${String(index)}] is not an object`);
    }
    const entry = raw as Record<string, unknown>;
    if (entry.reserveRankPosition !== index) {
      refuse('FROZEN_DRAW_MALFORMED', `reserve[${String(index)}] is out of order`);
    }
    if ('split' in entry) {
      refuse('FROZEN_DRAW_MALFORMED', `reserve[${String(index)}] carries a split of its own`);
    }
    return Object.freeze({
      reserveRankPosition: index,
      echeRowKey: entry.echeRowKey as string,
      organisationId: entry.organisationId as string,
      drawEntrySha256: drawEntrySha256(entry),
    });
  });
  return Object.freeze({
    binding: Object.freeze({
      path: file.entry.path,
      artifactFileSha256: file.sha256,
      drawHash: record.drawHash,
    }),
    selection: Object.freeze(selection),
    reserve: Object.freeze(reserve),
    forLedger: Object.freeze({
      drawHash: record.drawHash,
      selection: selection.map((entry) => ({
        selectionIndex: entry.selectionIndex,
        echeRowKey: entry.echeRowKey,
        split: entry.split,
      })),
      reserve: reserve.map((entry) => ({
        reserveRankPosition: entry.reserveRankPosition,
        echeRowKey: entry.echeRowKey,
      })),
    }),
  });
}

// ---------------------------------------------------------------------------
// B. THE THIRTY-ENTRY REPLACEMENT LEDGER.
// ---------------------------------------------------------------------------

interface NormalisedLedger {
  readonly raw: ReplacementLedger;
  readonly revision: A2ReplacementLedgerRevision;
  readonly entryCount: number;
}

function normaliseReplacementLedger(
  governance: CommittedGovernanceV4,
  draw: NormalisedDraw,
): NormalisedLedger {
  const file = requireCommittedFileV4(governance, REPLACEMENT_LEDGER_REGISTRY_ID);
  const raw = file.parsed as unknown as ReplacementLedger;
  if (raw.generationId !== GENERATION_ID) {
    refuse('REPLACEMENT_LEDGER_MALFORMED', 'the replacement ledger names another generation');
  }
  if (typeof raw.ledgerHash !== 'string' || recomputeLedgerHash(raw) !== raw.ledgerHash) {
    refuse('REPLACEMENT_LEDGER_HASH_MISMATCH', 'the replacement ledger hash does not recompute');
  }
  let entryCount: number;
  try {
    entryCount = requireValidLedger(draw.forLedger, raw);
  } catch (cause) {
    return refuse(
      'REPLACEMENT_LEDGER_INVALID',
      `the canonical validator rejected the ledger: ${String((cause as Error).message)}`,
    );
  }
  if (
    raw.ledgerHash !== REPLACEMENT_LEDGER_V4_PIN.ledgerHash ||
    entryCount !== REPLACEMENT_LEDGER_V4_PIN.entryCount
  ) {
    refuseV4(
      'REPLACEMENT_LEDGER_V4_PIN_MISMATCH',
      'the validated ledger is not the revision Registry V4 pins',
    );
  }
  const entries = raw.entries.map((entry): A2ReplacementLedgerTransition =>
    Object.freeze({
      sequence: entry.sequence,
      selectionIndex: entry.selectionIndex,
      split: entry.split,
      replacedEcheRowKey: entry.replacedEcheRowKey,
      replacementEcheRowKey: entry.replacementEcheRowKey,
      reserveRankPosition: entry.reserveRankPosition,
      reason: entry.reason as UnsuccessfulDisposition,
      recordedAtUtc: entry.recordedAtUtc,
      replacedOccupantKind: entry.replacedOccupantKind,
      previousSequenceForSlot: entry.previousSequenceForSlot,
      previousEntryHash: entry.previousEntryHash,
      entryHash: entry.entryHash,
    }),
  );
  return Object.freeze({
    raw,
    entryCount,
    revision: Object.freeze({
      path: file.entry.path,
      fileSha256: file.sha256,
      ledgerHash: raw.ledgerHash,
      entries: Object.freeze(entries),
    }),
  });
}

// ---------------------------------------------------------------------------
// C. CURRENT OCCUPANTS AND OCCUPANCY EPISODES.
// ---------------------------------------------------------------------------

function currentEpisodes(draw: NormalisedDraw, ledger: NormalisedLedger): readonly EpisodeRef[] {
  return draw.selection.map((slot) => {
    const occupant = currentOccupantForSelectionIndex(
      draw.forLedger,
      ledger.raw,
      slot.selectionIndex,
    );
    return Object.freeze({
      selectionIndex: slot.selectionIndex,
      occupantKind:
        occupant.occupantKind === 'ORIGINAL_SELECTION'
          ? ('PRIMARY' as const)
          : ('RESERVE_REPLACEMENT' as const),
      reserveRankPosition: occupant.reserveRankPosition,
    });
  });
}

interface ScopedSupersessionV4 {
  readonly episode: EpisodeRef;
  readonly chain: RunSupersessionChain;
  readonly tailRunRefSha256: string;
  readonly reachedThroughTransition: boolean;
}

function scopeSupersessionToEpisodes(
  chains: readonly RunSupersessionChain[],
  runClaimsByEpisode: ReadonlyMap<string, ReadonlySet<string>>,
  episodeByKey: ReadonlyMap<string, EpisodeRef>,
  slotSplits: readonly Split[],
): readonly ScopedSupersessionV4[] {
  return chains.map((chain) => {
    if (chain.split !== slotSplits[chain.selectionIndex]) {
      refuse(
        'TRANSITION_GRAPH_OCCUPANT_SCOPE_UNPROVABLE',
        `a supersession chain for slot ${String(chain.selectionIndex)} names another split`,
      );
    }
    const owners: EpisodeRef[] = [];
    for (const [key, refs] of runClaimsByEpisode) {
      const episode = episodeByKey.get(key)!;
      if (episode.selectionIndex !== chain.selectionIndex) continue;
      if (chain.runRefs.some((ref) => refs.has(ref))) owners.push(episode);
    }
    if (owners.length !== 1) {
      refuse(
        'TRANSITION_GRAPH_OCCUPANT_SCOPE_UNPROVABLE',
        `slot ${String(chain.selectionIndex)}'s supersession chain is claimed by ${String(owners.length)} occupancy episodes`,
      );
    }
    return Object.freeze({
      episode: owners[0]!,
      chain,
      tailRunRefSha256: chain.runRefs[chain.runRefs.length - 1]!,
      reachedThroughTransition: chain.edges.length > 0,
    });
  });
}

// ---------------------------------------------------------------------------
// D. THE HISTORICAL REPLACEMENT AUDIT.
// ---------------------------------------------------------------------------

export interface ReplacementHistoryAuditEntryV4 {
  readonly ledgerSequence: number;
  readonly replacedOccupantKind: 'ORIGINAL_SELECTION' | 'RESERVE_REPLACEMENT';
  readonly ledgerReason: UnsuccessfulDisposition;
  readonly frozenReason: UnsuccessfulDisposition;
  readonly reasonSourceRegistryIds: readonly string[];
  readonly reasonsAgree: true;
}

export interface ReplacementHistoryAuditV4 {
  readonly auditedEntryCount: number;
  readonly entries: readonly ReplacementHistoryAuditEntryV4[];
}

function replacedEpisodeOf(
  entries: readonly A2ReplacementLedgerTransition[],
  entry: A2ReplacementLedgerTransition,
): EpisodeRef {
  if (entry.replacedOccupantKind === 'ORIGINAL_SELECTION') {
    if (entry.previousSequenceForSlot !== null) {
      refuse(
        'REPLACEMENT_HISTORY_EPISODE_MISMATCH',
        `ledger entry ${String(entry.sequence)} replaces an original yet continues an earlier entry`,
      );
    }
    return Object.freeze({
      selectionIndex: entry.selectionIndex,
      occupantKind: 'PRIMARY' as const,
      reserveRankPosition: null,
    });
  }
  const previous = entries.find(
    (candidate) => candidate.sequence === entry.previousSequenceForSlot,
  );
  if (previous === undefined || previous.selectionIndex !== entry.selectionIndex) {
    refuse(
      'REPLACEMENT_HISTORY_EPISODE_MISMATCH',
      `ledger entry ${String(entry.sequence)} continues no earlier entry for its own slot`,
    );
  }
  return Object.freeze({
    selectionIndex: entry.selectionIndex,
    occupantKind: 'RESERVE_REPLACEMENT' as const,
    reserveRankPosition: previous.reserveRankPosition,
  });
}

function auditReplacementHistory(
  ledger: NormalisedLedger,
  frozenReasonsByEpisode: ReadonlyMap<
    string,
    readonly { reason: UnsuccessfulDisposition; source: string }[]
  >,
  successfulEpisodes: ReadonlySet<string>,
): ReplacementHistoryAuditV4 {
  const entries = ledger.revision.entries;
  const postdating = new Set(REGISTRY_V4_IDS_POSTDATING_LEDGER_REVISION);
  const audited = entries.map((entry): ReplacementHistoryAuditEntryV4 => {
    const key = episodeKeyOf(replacedEpisodeOf(entries, entry));
    if (successfulEpisodes.has(key)) {
      refuse(
        'REPLACEMENT_HISTORY_OCCUPANT_WAS_SUCCESSFUL',
        `ledger entry ${String(entry.sequence)} replaced an occupant adjudicated successful`,
      );
    }
    const found = frozenReasonsByEpisode.get(key) ?? [];
    if (found.length === 0) {
      refuse(
        'REPLACEMENT_HISTORY_REASON_MISSING',
        `ledger entry ${String(entry.sequence)} has no committed frozen reason for the occupant it replaced`,
      );
    }
    // A record committed AFTER the ledger revision Registry V4 pins cannot be
    // the authority for why that ledger replaced anyone.
    if (found.some((candidate) => postdating.has(candidate.source))) {
      refuseV4(
        'V4_REPLACEMENT_REASON_POSTDATES_LEDGER_REVISION',
        `ledger entry ${String(entry.sequence)}'s frozen reason is carried by a record newer than the ledger revision`,
      );
    }
    if (new Set(found.map((candidate) => candidate.reason)).size !== 1) {
      refuse(
        'REPLACEMENT_HISTORY_REASON_MISMATCH',
        `ledger entry ${String(entry.sequence)} replaced an occupant whose committed reasons disagree`,
      );
    }
    const frozenReason = found[0]!.reason;
    if (frozenReason !== entry.reason) {
      refuse(
        'REPLACEMENT_HISTORY_REASON_MISMATCH',
        `ledger entry ${String(entry.sequence)} reason differs from the occupant's frozen reason`,
      );
    }
    return Object.freeze({
      ledgerSequence: entry.sequence,
      replacedOccupantKind: entry.replacedOccupantKind,
      ledgerReason: entry.reason,
      frozenReason,
      reasonSourceRegistryIds: Object.freeze([...new Set(found.map((c) => c.source))].sort()),
      reasonsAgree: true as const,
    });
  });
  return Object.freeze({ auditedEntryCount: audited.length, entries: Object.freeze(audited) });
}

// ---------------------------------------------------------------------------
// E. PENDING AND HELD ITEMS, BOUND TO THE RECORDS THAT RESOLVE THEM.
// ---------------------------------------------------------------------------

interface NonTerminalResolution {
  readonly correctedTerminalItems: readonly ParsedTerminalItem[];
  readonly correctionRunClaims: readonly EpisodeRunClaim[];
  readonly resolvedReasons: readonly ParsedHistoricalReason[];
  readonly pendingResolvedByOwnerResolution: number;
  readonly pendingResolvedByReconciliation: number;
  readonly heldResolvedBySupersession: number;
}

function sameEpisode(a: EpisodeRef, b: EpisodeRef): boolean {
  return episodeKeyOf(a) === episodeKeyOf(b);
}

function resolveNonTerminalItems(
  v4: ParsedFamilyOutputV4,
  reconciliation: ParsedSd9Reconciliation,
  closure: ParsedRunProvenanceClosure,
  current: readonly EpisodeRef[],
  draw: NormalisedDraw,
): NonTerminalResolution {
  const resolved = new Set<NonTerminalItem>();
  const take = (
    candidates: readonly NonTerminalItem[],
    at: string,
    code: 'V4_CORRECTION_WITHOUT_PENDING_ITEM' | 'V4_HELD_ITEM_RESOLUTION_INVALID',
  ): NonTerminalItem => {
    const open = candidates.filter((candidate) => !resolved.has(candidate));
    if (open.length !== 1) {
      refuseV4(code, `${at} resolves ${String(open.length)} open items, not exactly one`);
    }
    resolved.add(open[0]!);
    return open[0]!;
  };

  // --- Owner resolutions of prefix-era PENDING items. ----------------------
  const resolvedReasons: ParsedHistoricalReason[] = [];
  for (const resolution of v4.pendingResolutions) {
    const at = `${resolution.sourceRegistryId} slot ${String(resolution.selectionIndex)}`;
    const item = take(
      v4.nonTerminalItems.filter(
        (candidate) =>
          candidate.state === PENDING_CAPABILITY_REVIEW &&
          candidate.sourceRegistryId === resolution.resolvesRegistryId &&
          sameEpisode(candidate, resolution),
      ),
      at,
      'V4_CORRECTION_WITHOUT_PENDING_ITEM',
    );
    if (
      item.historicalRunRefPrefix !== resolution.historicalRunRefPrefix ||
      item.declaredDrawEntrySha256 !== resolution.declaredDrawEntrySha256 ||
      item.split !== resolution.split
    ) {
      refuseV4('V4_CORRECTION_EVIDENCE_MISMATCH', `${at} does not name the pending item's run`);
    }
    resolvedReasons.push(
      Object.freeze({
        selectionIndex: resolution.selectionIndex,
        occupantKind: resolution.occupantKind,
        reserveRankPosition: resolution.reserveRankPosition,
        reason: resolution.disposition,
        sourceRegistryId: resolution.sourceRegistryId,
      }),
    );
  }

  // --- Reconciliation corrections of CURRENT pending items. ----------------
  const correctedTerminalItems: ParsedTerminalItem[] = [];
  const correctionRunClaims: EpisodeRunClaim[] = [];
  for (const correction of reconciliation.corrections) {
    const at = `${correction.sourceRegistryId} slot ${String(correction.selectionIndex)}`;
    const episode = current[correction.selectionIndex];
    const slot = draw.selection[correction.selectionIndex];
    if (
      episode === undefined ||
      slot === undefined ||
      slot.split !== correction.split ||
      (correction.occupantKindFromLedger === 'ORIGINAL_SELECTION') !==
        (episode.occupantKind === 'PRIMARY')
    ) {
      refuseV4(
        'V4_CORRECTION_EVIDENCE_MISMATCH',
        `${at} is not the current occupant of its slot in its slot's split`,
      );
    }
    const item = take(
      v4.nonTerminalItems.filter(
        (candidate) =>
          candidate.state === PENDING_CAPABILITY_REVIEW && sameEpisode(candidate, episode),
      ),
      at,
      'V4_CORRECTION_WITHOUT_PENDING_ITEM',
    );
    if (item.split !== correction.split) {
      refuseV4(
        'V4_CORRECTION_EVIDENCE_MISMATCH',
        `${at} names another split than its pending item`,
      );
    }
    if (item.runRefSha256 !== null) {
      // A full run reference on both sides: they must be the same run.
      if (item.runRefSha256 !== correction.runRefSha256) {
        refuseV4('V4_CORRECTION_EVIDENCE_MISMATCH', `${at} corrects a different run`);
      }
    } else {
      // A prefix-era pending item. Its run is bound to the correction's full
      // digest ONLY by the closure's own committed same-run statement, which
      // must name this slot, this prefix and this digest together; and the
      // correction's before-state must reproduce the pending item's own
      // committed measurement exactly.
      if (
        !closureStatesSameRun(
          closure,
          correction.selectionIndex,
          item.historicalRunRefPrefix ?? '',
          correction.runRefSha256,
        )
      ) {
        refuseV4(
          'V4_CORRECTION_EVIDENCE_MISMATCH',
          `${at} names a run the closure does not state is the pending item's run`,
        );
      }
      if (
        item.rawPageCount !== correction.rawPageEvidenceCount ||
        item.postSd7Range[0] !== correction.postSd7Before[0] ||
        item.postSd7Range[1] !== correction.postSd7Before[1]
      ) {
        refuseV4(
          'V4_CORRECTION_EVIDENCE_MISMATCH',
          `${at} before-state does not reproduce the pending item's committed measurement`,
        );
      }
    }
    const terminal: ParsedTerminalItem = Object.freeze({
      sourceRegistryId: correction.sourceRegistryId,
      selectionIndex: episode.selectionIndex,
      occupantKind: episode.occupantKind,
      reserveRankPosition: episode.reserveRankPosition,
      split: correction.split,
      declaredDrawEntrySha256: item.declaredDrawEntrySha256,
      runRefSha256: correction.runRefSha256,
      acquisitionPolicyVersion: item.acquisitionPolicyVersion,
      disposition: correction.disposition,
      replacementReason:
        correction.disposition === ACQUISITION_SUCCESSFUL
          ? null
          : (correction.disposition as UnsuccessfulDisposition),
      liveResultRegistryId: item.liveResultRegistryId,
      // The corrected verdict is the reconciliation's; it commits no sealed
      // SD7 detail of its own, and the pending item's predates the repair.
      sealedSd7Detail: null,
    });
    correctedTerminalItems.push(terminal);
    correctionRunClaims.push(
      Object.freeze({
        selectionIndex: terminal.selectionIndex,
        occupantKind: terminal.occupantKind,
        reserveRankPosition: terminal.reserveRankPosition,
        runRefSha256: terminal.runRefSha256,
        sourceRegistryId: terminal.sourceRegistryId,
      }),
    );
  }

  // --- Compliant-vantage supersessions of HELD runs. ------------------------
  for (const resolution of v4.heldResolutions) {
    const at = `${resolution.sourceRegistryId} slot ${String(resolution.selectionIndex)}`;
    take(
      v4.nonTerminalItems.filter(
        (candidate) =>
          candidate.state === HELD_PENDING_VANTAGE_REVALIDATION &&
          sameEpisode(candidate, resolution) &&
          candidate.runRefSha256 === resolution.supersededRunRefSha256,
      ),
      at,
      'V4_HELD_ITEM_RESOLUTION_INVALID',
    );
  }

  const unresolved = v4.nonTerminalItems.filter((item) => !resolved.has(item));
  if (unresolved.length > 0) {
    refuseV4(
      'V4_NON_TERMINAL_ITEM_UNRESOLVED',
      `${String(unresolved.length)} pending or held item(s) are resolved by no registered record`,
    );
  }
  return Object.freeze({
    correctedTerminalItems: Object.freeze(correctedTerminalItems),
    correctionRunClaims: Object.freeze(correctionRunClaims),
    resolvedReasons: Object.freeze(resolvedReasons),
    pendingResolvedByOwnerResolution: v4.pendingResolutions.length,
    pendingResolvedByReconciliation: reconciliation.corrections.length,
    heldResolvedBySupersession: v4.heldResolutions.length,
  });
}

// ---------------------------------------------------------------------------
// F. THE RESOLUTION.
// ---------------------------------------------------------------------------

/** INTERNAL: which kind of provenance each CURRENT fact reached R17 through. */
export interface CurrentFactProvenance {
  readonly selectionIndex: number;
  readonly kind: CurrentFactProvenanceKind;
  readonly sourceRegistryId: string;
}

export interface CommittedGovernanceResolutionV4 {
  readonly registryVersion: string;
  readonly checkpointCommit: string;
  readonly registryEntryCount: number;
  readonly verifiedRegistryBindings: readonly {
    readonly id: string;
    readonly path: string;
    readonly sha256: string;
    readonly bytes: number;
    readonly commit: string;
  }[];
  readonly v3SubviewEntryCount: number;
  readonly v2SubviewEntryCount: number;
  readonly legacySubviewEntryCount: number;
  readonly draw: NormalisedDraw['binding'];
  readonly replacementLedger: A2ReplacementLedgerRevision;
  readonly replacementLedgerEntryCount: number;
  readonly transitionChain: ValidatedTransitionLedgerChain;
  readonly transitionLedgerTipBinding: {
    readonly path: string;
    readonly sha256: string;
    readonly commit: string;
  };
  readonly scopedSupersessions: readonly ScopedSupersessionV4[];
  readonly replacementHistoryAudit: ReplacementHistoryAuditV4;
  readonly closure: ParsedRunProvenanceClosure;
  readonly reconciliation: ParsedSd9Reconciliation;
  readonly v4FamilyTerminalItemCount: number;
  readonly prefixEraTerminalItemCount: number;
  readonly closureBridgedCount: number;
  readonly mixedConventionBridgedCount: number;
  readonly unbridgedPrefixEraItemCount: number;
  readonly nonTerminalItemCount: number;
  readonly pendingResolvedByOwnerResolution: number;
  readonly pendingResolvedByReconciliation: number;
  readonly heldResolvedBySupersession: number;
  readonly currentFactProvenance: readonly CurrentFactProvenance[];
  readonly currentTerminalFactCount: number;
  readonly currentPendingEvidenceFactCount: number;
  readonly currentFactsWithTransitionBindingCount: number;
  readonly supersededTerminalItemCount: number;
  readonly historicalTerminalItemCount: number;
  readonly resolution: A3GenerationSlotAuthorityResolution;
  readonly summary: A3GenerationSlotAuthoritySummary;
}

function mergeFamilyOutputs(outputs: readonly ParsedFamilyOutput[]): ParsedFamilyOutput {
  return Object.freeze({
    terminalItems: Object.freeze(outputs.flatMap((output) => output.terminalItems)),
    runClaims: Object.freeze(outputs.flatMap((output) => output.runClaims)),
    historicalReasons: Object.freeze(outputs.flatMap((output) => output.historicalReasons)),
  });
}

function sameIndices(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * The post-derivation cross-check. A2's declared state is compared with what
 * R17 derived; it never feeds R17, and a disagreement refuses the snapshot.
 */
function requireDeclaredStateMatches(
  declared: {
    readonly successfulCount: number;
    readonly failureSelectionIndices: readonly number[];
    readonly pendingSelectionIndices: readonly number[];
    readonly neverStarted: { readonly from: number; readonly to: number; readonly count: number };
  },
  resolution: A3GenerationSlotAuthorityResolution,
  summary: A3GenerationSlotAuthoritySummary,
  terminalSelectionIndices: ReadonlySet<number>,
  at: string,
): void {
  const failures = resolution.slots
    .filter((slot) => slot.status === A2_CURRENT_OCCUPANT_ACQUISITION_UNSUCCESSFUL)
    .map((slot) => slot.selectionIndex);
  const pending = resolution.slots
    .filter((slot) => slot.status === A2_EVIDENCE_PENDING_ADJUDICATION)
    .map((slot) => slot.selectionIndex);
  const neverStarted = resolution.slots
    .map((slot) => slot.selectionIndex)
    .filter((index) => !terminalSelectionIndices.has(index));
  const contiguous =
    neverStarted.length === declared.neverStarted.count &&
    neverStarted.length === declared.neverStarted.to - declared.neverStarted.from + 1 &&
    neverStarted.every((index, offset) => index === declared.neverStarted.from + offset);
  if (
    declared.successfulCount !== summary.readySlotCount ||
    !sameIndices(
      [...declared.failureSelectionIndices].sort((a, b) => a - b),
      failures,
    ) ||
    !sameIndices(
      [...declared.pendingSelectionIndices].sort((a, b) => a - b),
      pending,
    ) ||
    !contiguous
  ) {
    refuseV4(
      'V4_DECLARED_GENERATION_STATE_MISMATCH',
      `${at} declares a generation state R17 did not derive`,
    );
  }
}

/**
 * Resolves Registry V4 from committed objects. The registry is a parameter
 * only so a test can point entries at wrong pins and prove each refusal end
 * to end; this function MINTS NOTHING. The only minting entry point is
 * `snapshotV4.ts`, which accepts no registry at all.
 */
export function resolveCommittedA2GovernanceV4(
  repositoryRoot: string,
  registry: readonly GovernanceRegistryEntryV4[] = COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES,
): CommittedGovernanceResolutionV4 {
  return resolveVerifiedGovernanceV4(loadCommittedGovernanceV4(repositoryRoot, registry));
}

/**
 * The pure stage: everything after the bytes were verified. Exposed so an
 * internal test can mutate VERIFIED parsed records in memory and prove each
 * refusal; it too mints nothing a caller can mistake for a snapshot.
 */
export function resolveVerifiedGovernanceV4(
  governance: CommittedGovernanceV4,
): CommittedGovernanceResolutionV4 {
  const v3Subview = v3CompatibleSubview(governance);
  const v2Subview = v2CompatibleSubviewOfV4(governance);
  const legacy = legacyV1SubviewOfV4(governance);

  const draw = normaliseDraw(governance);
  const ledger = normaliseReplacementLedger(governance, draw);
  const transitionChain = validateTransitionLedgerChain(legacy);
  const chains = buildRunSupersessionChains(transitionChain.edges);
  const historical = mergeFamilyOutputs([
    parseGovernanceFamilies(legacy),
    parsePostP18SecondWindowAdjudication(v2Subview),
    parsePostP24WindowAdjudication(v3Subview),
  ]);
  const v4 = parseGovernanceFamiliesV4(governance);
  const reconciliation = parseSd9Reconciliation(governance);
  const closure = parseRunProvenanceClosure(governance);

  const current = currentEpisodes(draw, ledger);
  const currentKeys = new Set(current.map(episodeKeyOf));
  const slotSplits = draw.selection.map((slot) => slot.split);

  // --- Prefix-era facts: completed ONLY through the closure bridge. --------
  const bridge = bridgePrefixEraItems(governance, v4.prefixEraItems, closure, reconciliation);
  for (const bridged of bridge.bridged) {
    if (!currentKeys.has(episodeKeyOf(bridged.item))) {
      refuseV4(
        'V4_CLOSURE_ENTRY_NOT_A_CURRENT_EPISODE',
        `a ${bridged.bridge} names slot ${String(bridged.item.selectionIndex)}'s superseded occupant`,
      );
    }
  }
  const bridgedKind = new Map(
    bridge.bridged.map((bridged) => [episodeKeyOf(bridged.item), bridged.bridge]),
  );
  const unbridgedCurrent = bridge.unbridged.filter((item) => currentKeys.has(episodeKeyOf(item)));
  if (unbridgedCurrent.length > 0) {
    refuseV4(
      'V4_CURRENT_PREFIX_ERA_FACT_WITHOUT_FULL_RUN_PROVENANCE',
      `${String(unbridgedCurrent.length)} current occupant(s) have only a prefix-era run reference`,
    );
  }

  // --- Pending and held items. ---------------------------------------------
  const nonTerminal = resolveNonTerminalItems(v4, reconciliation, closure, current, draw);
  const correctedKeys = new Set(nonTerminal.correctedTerminalItems.map(episodeKeyOf));

  // --- Everything that is evidence, together. ------------------------------
  const unbridgedReasons: ParsedHistoricalReason[] = bridge.unbridged
    .filter((item) => item.disposition !== ACQUISITION_SUCCESSFUL)
    .map((item) =>
      Object.freeze({
        selectionIndex: item.selectionIndex,
        occupantKind: item.occupantKind,
        reserveRankPosition: item.reserveRankPosition,
        reason: (item.replacementReason ?? item.disposition) as UnsuccessfulDisposition,
        sourceRegistryId: item.sourceRegistryId,
      }),
    );
  const nonTerminalClaims: EpisodeRunClaim[] = v4.nonTerminalItems
    .filter((item) => item.runRefSha256 !== null)
    .map((item) =>
      Object.freeze({
        selectionIndex: item.selectionIndex,
        occupantKind: item.occupantKind,
        reserveRankPosition: item.reserveRankPosition,
        runRefSha256: item.runRefSha256!,
        sourceRegistryId: item.sourceRegistryId,
      }),
    );
  const bridgedItems = bridge.bridged.map((bridged) => bridged.item);
  const parsed = Object.freeze({
    terminalItems: Object.freeze([
      ...historical.terminalItems,
      ...v4.terminalItems,
      ...bridgedItems,
      ...nonTerminal.correctedTerminalItems,
    ]),
    runClaims: Object.freeze([
      ...historical.runClaims,
      ...v4.runClaims,
      ...bridgedItems.map((item) =>
        Object.freeze({
          selectionIndex: item.selectionIndex,
          occupantKind: item.occupantKind,
          reserveRankPosition: item.reserveRankPosition,
          runRefSha256: item.runRefSha256,
          sourceRegistryId: item.sourceRegistryId,
        }),
      ),
      ...nonTerminalClaims,
      ...nonTerminal.correctionRunClaims,
    ]),
    historicalReasons: Object.freeze([
      ...historical.historicalReasons,
      ...v4.historicalReasons,
      ...nonTerminal.resolvedReasons,
      ...unbridgedReasons,
    ]),
  });

  // --- Run claims, per occupancy episode. ----------------------------------
  const runClaimsByEpisode = new Map<string, Set<string>>();
  const episodeByKey = new Map<string, EpisodeRef>();
  const episodeByRunRef = new Map<string, string>();
  for (const claim of parsed.runClaims) {
    const key = episodeKeyOf(claim);
    episodeByKey.set(
      key,
      Object.freeze({
        selectionIndex: claim.selectionIndex,
        occupantKind: claim.occupantKind,
        reserveRankPosition: claim.reserveRankPosition,
      }),
    );
    const owner = episodeByRunRef.get(claim.runRefSha256);
    if (owner !== undefined && owner !== key) {
      refuse(
        'TRANSITION_GRAPH_OCCUPANT_SCOPE_UNPROVABLE',
        'one run reference is bound to two different occupancy episodes',
      );
    }
    episodeByRunRef.set(claim.runRefSha256, key);
    const refs = runClaimsByEpisode.get(key) ?? new Set<string>();
    refs.add(claim.runRefSha256);
    runClaimsByEpisode.set(key, refs);
  }

  const scopedSupersessions = scopeSupersessionToEpisodes(
    chains,
    runClaimsByEpisode,
    episodeByKey,
    slotSplits,
  );
  const supersessionByEpisode = new Map<string, ScopedSupersessionV4>();
  for (const scoped of scopedSupersessions) {
    const key = episodeKeyOf(scoped.episode);
    if (supersessionByEpisode.has(key)) {
      refuse('TRANSITION_GRAPH_FORK', 'one occupancy episode owns two supersession chains');
    }
    supersessionByEpisode.set(key, scoped);
  }

  const isTail = (item: ParsedTerminalItem): boolean => {
    const scoped = supersessionByEpisode.get(episodeKeyOf(item));
    if (scoped === undefined) return true;
    if (!scoped.chain.runRefs.includes(item.runRefSha256)) return true;
    return item.runRefSha256 === scoped.tailRunRefSha256;
  };
  const tailItems = parsed.terminalItems.filter(isTail);
  const supersededTerminalItemCount = parsed.terminalItems.length - tailItems.length;

  // --- Frozen reasons and successes, per episode. --------------------------
  const frozenReasonsByEpisode = new Map<
    string,
    { reason: UnsuccessfulDisposition; source: string }[]
  >();
  const successfulEpisodes = new Set<string>();
  const addReason = (
    episode: EpisodeRef,
    reason: UnsuccessfulDisposition,
    source: string,
  ): void => {
    const key = episodeKeyOf(episode);
    const found = frozenReasonsByEpisode.get(key) ?? [];
    found.push({ reason, source });
    frozenReasonsByEpisode.set(key, found);
  };
  for (const reason of parsed.historicalReasons) {
    addReason(reason, reason.reason, reason.sourceRegistryId);
  }
  for (const item of tailItems) {
    if (item.disposition === ACQUISITION_SUCCESSFUL) {
      successfulEpisodes.add(episodeKeyOf(item));
      continue;
    }
    addReason(item, item.replacementReason ?? item.disposition, item.sourceRegistryId);
  }
  for (const item of bridge.unbridged) {
    if (item.disposition === ACQUISITION_SUCCESSFUL) successfulEpisodes.add(episodeKeyOf(item));
  }

  const replacementHistoryAudit = auditReplacementHistory(
    ledger,
    frozenReasonsByEpisode,
    successfulEpisodes,
  );

  // --- Owner Clarification Q3 binds each named slot's ORIGINAL occupant. ---
  for (const reason of parsed.historicalReasons) {
    if (reason.sourceRegistryId !== 'OWNER_REPLACEMENT_REASON_PRECEDENCE_CLARIFICATION') continue;
    const slotEntries = ledger.revision.entries.filter(
      (entry) => entry.selectionIndex === reason.selectionIndex,
    );
    if (slotEntries.length !== 1 || slotEntries[0]!.replacedOccupantKind !== 'ORIGINAL_SELECTION') {
      refuse(
        'REPLACEMENT_HISTORY_EPISODE_MISMATCH',
        'the owner reason clarification names a slot whose ledger chain does not pin it to one original occupant',
      );
    }
  }

  // --- CURRENT terminal facts, and only those. -----------------------------
  const currentItemsByEpisode = new Map<string, ParsedTerminalItem[]>();
  for (const item of tailItems) {
    const key = episodeKeyOf(item);
    if (!currentKeys.has(key)) continue;
    const found = currentItemsByEpisode.get(key) ?? [];
    found.push(item);
    currentItemsByEpisode.set(key, found);
  }

  const adjudications: A2AdjudicatedAcquisitionFact[] = [];
  const currentFactProvenance: CurrentFactProvenance[] = [];
  let currentFactsWithTransitionBindingCount = 0;
  const tipBinding = bindingOfCommittedV4(
    requireCommittedFileV4(governance, TRANSITION_LEDGER_TIP_V1),
  );

  for (const episode of current) {
    const key = episodeKeyOf(episode);
    const found = currentItemsByEpisode.get(key) ?? [];
    if (found.length > 1) {
      refuse(
        'MULTIPLE_CURRENT_TERMINAL_ADJUDICATIONS',
        `selection slot ${String(episode.selectionIndex)}'s current occupancy episode has more than one current terminal adjudication`,
      );
    }
    if (found.length === 0) {
      if (frozenReasonsByEpisode.has(key) || runClaimsByEpisode.has(key)) {
        refuse(
          'REGISTRY_INCOMPLETE_FOR_CURRENT_OCCUPANT',
          `selection slot ${String(episode.selectionIndex)}'s current occupant is named by registered evidence with no terminal adjudication in Registry V4`,
        );
      }
      continue;
    }
    const item = found[0]!;
    const slot = draw.selection[episode.selectionIndex]!;
    const structuralDigest =
      episode.occupantKind === 'PRIMARY'
        ? slot.drawEntrySha256
        : draw.reserve[episode.reserveRankPosition!]!.drawEntrySha256;

    if (item.split !== slot.split) {
      refuse(
        'REDUNDANT_FIELD_CONFLICTS_WITH_STRUCTURAL_SOURCE',
        `slot ${String(episode.selectionIndex)}'s adjudication split differs from the frozen draw split`,
      );
    }
    if (
      item.declaredDrawEntrySha256 !== null &&
      item.declaredDrawEntrySha256 !== structuralDigest
    ) {
      refuse(
        'REDUNDANT_FIELD_CONFLICTS_WITH_STRUCTURAL_SOURCE',
        `slot ${String(episode.selectionIndex)}'s adjudication draw digest is not the frozen entry it occupies`,
      );
    }
    const scoped = supersessionByEpisode.get(key);
    if (
      scoped !== undefined &&
      scoped.chain.runRefs.includes(item.runRefSha256) &&
      item.runRefSha256 !== scoped.tailRunRefSha256
    ) {
      refuse(
        'CURRENT_FACT_USES_SUPERSEDED_RUN',
        `slot ${String(episode.selectionIndex)}'s current fact names a superseded run`,
      );
    }
    const reachedThroughTransition =
      scoped !== undefined &&
      scoped.reachedThroughTransition &&
      scoped.tailRunRefSha256 === item.runRefSha256;
    if (reachedThroughTransition) currentFactsWithTransitionBindingCount += 1;

    currentFactProvenance.push(
      Object.freeze({
        selectionIndex: episode.selectionIndex,
        kind: correctedKeys.has(key)
          ? RECONCILIATION_CORRECTION
          : (bridgedKind.get(key) ?? FULL_RUN_REFERENCE_SOURCE),
        sourceRegistryId: item.sourceRegistryId,
      }),
    );
    adjudications.push(
      Object.freeze({
        factKind: A2_TERMINAL_EVIDENCE_ADJUDICATION,
        generationId: GENERATION_ID,
        selectionIndex: episode.selectionIndex,
        split: slot.split,
        occupantKind: episode.occupantKind,
        reserveRankPosition: episode.reserveRankPosition,
        drawEntrySha256: structuralDigest,
        disposition: item.disposition,
        adjudication: bindingOfCommittedV4(
          requireCommittedFileV4(governance, item.sourceRegistryId),
        ),
        liveResult: bindingOfCommittedV4(
          requireCommittedFileV4(governance, item.liveResultRegistryId),
        ),
        runRefSha256: item.runRefSha256,
        acquisitionPolicyVersion: item.acquisitionPolicyVersion,
        acquisitionPolicyTransitionLedger: reachedThroughTransition ? tipBinding : null,
        sealedSd7Detail:
          item.sealedSd7Detail === null
            ? null
            : Object.freeze({ split: slot.split, ...item.sealedSd7Detail }),
      }),
    );
  }

  for (const scoped of scopedSupersessions) {
    const key = episodeKeyOf(scoped.episode);
    const owned = tailItems.filter((item) => episodeKeyOf(item) === key);
    const hasTailAdjudication = owned.some((item) => item.runRefSha256 === scoped.tailRunRefSha256);
    const hasFrozenReason = (frozenReasonsByEpisode.get(key) ?? []).length > 0;
    if (!hasTailAdjudication && !hasFrozenReason) {
      refuse(
        'TRANSITION_TAIL_WITHOUT_TERMINAL_ADJUDICATION',
        `selection slot ${String(scoped.chain.selectionIndex)}'s supersession tail carries no terminal authority`,
      );
    }
  }

  // --- R17 does the rest. --------------------------------------------------
  const resolution = resolveGenerationSlotAuthorities({
    generationId: GENERATION_ID,
    draw: draw.binding,
    selection: draw.selection,
    reserve: draw.reserve,
    replacementLedger: ledger.revision,
    adjudications: Object.freeze(adjudications),
    // Every current occupant with executed evidence at this checkpoint is
    // terminally adjudicated - a pending or held item nobody resolves refused
    // above - so nothing is pending. A never-started plan item produced no
    // evidence and is not emitted; historical live results are not emitted
    // merely because they exist.
    evidenceStatuses: Object.freeze([]),
  });
  const summary = deriveGenerationSlotAuthoritySummary(resolution);

  // --- AFTER derivation: what A2 declared must be what R17 derived. --------
  const terminalSelectionIndices = new Set(adjudications.map((fact) => fact.selectionIndex));
  const closureBridgedCount = bridge.bridged.filter(
    (bridged) => bridged.bridge === PROVENANCE_CLOSURE_BRIDGE,
  ).length;
  const census = closure.census;
  if (
    census.currentSlotsExamined !== draw.selection.length ||
    census.currentTerminalEpisodes !== adjudications.length ||
    census.neverStartedSlots !== draw.selection.length - adjudications.length ||
    census.prefixOnlyProvenanceCount !== closureBridgedCount ||
    census.alreadyFullCommittedProvenanceCount !== adjudications.length - closureBridgedCount
  ) {
    refuseV4(
      'V4_CLOSURE_AGGREGATES_DO_NOT_RECONCILE',
      `${closure.registryId}.census does not describe the derived current terminal episodes`,
    );
  }
  requireDeclaredStateMatches(
    closure.canonicalState,
    resolution,
    summary,
    terminalSelectionIndices,
    `${closure.registryId}.canonicalStateUnchanged`,
  );
  if (!sameIndices(closure.canonicalState.q1, closure.canonicalState.failureSelectionIndices)) {
    refuseV4(
      'V4_DECLARED_GENERATION_STATE_MISMATCH',
      `${closure.registryId} declares a Q1 that is not its failure list`,
    );
  }
  requireDeclaredStateMatches(
    reconciliation.declaredStateAfter,
    resolution,
    summary,
    terminalSelectionIndices,
    `${reconciliation.registryId}.generation1StateAfterThisReconciliation`,
  );
  if (
    !sameIndices(reconciliation.q1After, reconciliation.declaredStateAfter.failureSelectionIndices)
  ) {
    refuseV4(
      'V4_DECLARED_GENERATION_STATE_MISMATCH',
      `${reconciliation.registryId} declares a Q1 that is not its failure list`,
    );
  }

  return Object.freeze({
    registryVersion: governance.registryVersion,
    checkpointCommit: governance.checkpointCommit,
    registryEntryCount: governance.registry.length,
    verifiedRegistryBindings: Object.freeze(
      [...governance.files.values()].map((file) =>
        Object.freeze({
          id: file.entry.id,
          path: file.entry.path,
          sha256: file.sha256,
          bytes: file.bytes,
          commit: file.entry.commit,
        }),
      ),
    ),
    v3SubviewEntryCount: v3Subview.files.size,
    v2SubviewEntryCount: v2Subview.files.size,
    legacySubviewEntryCount: legacy.files.size,
    draw: draw.binding,
    replacementLedger: ledger.revision,
    replacementLedgerEntryCount: ledger.entryCount,
    transitionChain,
    transitionLedgerTipBinding: tipBinding,
    scopedSupersessions,
    replacementHistoryAudit,
    closure,
    reconciliation,
    v4FamilyTerminalItemCount: v4.terminalItems.length,
    prefixEraTerminalItemCount: v4.prefixEraItems.length,
    closureBridgedCount,
    mixedConventionBridgedCount: bridge.mixedConventionSlotsConsumed,
    unbridgedPrefixEraItemCount: bridge.unbridged.length,
    nonTerminalItemCount: v4.nonTerminalItems.length,
    pendingResolvedByOwnerResolution: nonTerminal.pendingResolvedByOwnerResolution,
    pendingResolvedByReconciliation: nonTerminal.pendingResolvedByReconciliation,
    heldResolvedBySupersession: nonTerminal.heldResolvedBySupersession,
    currentFactProvenance: Object.freeze(currentFactProvenance),
    currentTerminalFactCount: adjudications.length,
    currentPendingEvidenceFactCount: 0,
    currentFactsWithTransitionBindingCount,
    supersededTerminalItemCount,
    historicalTerminalItemCount: parsed.terminalItems.length - adjudications.length,
    resolution,
    summary,
  });
}

export { MIXED_CONVENTION_BRIDGE, PROVENANCE_CLOSURE_BRIDGE, RECONCILIATION_CORRECTION };
export type { ScopedSupersessionV4 };
