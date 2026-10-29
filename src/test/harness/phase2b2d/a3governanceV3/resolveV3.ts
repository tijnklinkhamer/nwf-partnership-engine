/**
 * PHASE 2B-2D — A3 R31: THE COMMITTED A2 GOVERNANCE V3 AUTHORITY ADAPTER.
 *
 * ONE QUESTION
 *
 *   What does the UNCHANGED R17 authority resolver derive from the exact
 *   committed A2 governance Registry V3 names - read from pinned commits,
 *   never from a working tree?
 *
 * WHAT THIS MODULE DOES, IN ORDER
 *
 *   1. verifies every Registry V3 entry from its own commit (`commitLoaderV3.ts`);
 *   2. normalises the frozen draw, digesting each entry with the already-landed
 *      canonical primitive;
 *   3. validates the ten-entry replacement ledger with the CANONICAL
 *      validator, then checks its pinned ledger hash and entry count;
 *   4. validates the unchanged V2 -> V3 -> V4 -> V6 transition chain with the
 *      V1 validator, over the verified LEGACY V1 SUBVIEW;
 *   5. parses every V1-compatible record with the UNCHANGED V1 family parsers
 *      over that subview, R25's post-P18-second record with R25's UNCHANGED
 *      parser over the V2-compatible subview, and the one new record with its
 *      own parser (`familiesV3.ts`);
 *   6. scopes every supersession chain to one occupancy episode;
 *   7. audits all ten replacement-ledger entries against committed authority
 *      that PREDATES the ledger revision - never the ledger's own reason, and
 *      never a record Registry V3 adds - and emits NONE of those historical
 *      facts;
 *   8. calls the real R17 resolver and the real R17 summary.
 *
 * WHY STEPS 2, 3, 6 AND 7 ARE RESTATED HERE
 *
 *   They are adapter logic (not R17 logic). R25's versions are private to the
 *   V2 namespace, which stays byte-identical so that Registry V2 keeps meaning
 *   exactly the R25 snapshot. Each is the same algorithm over the same
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
  type ParsedFamilyOutput,
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
import {
  bindingOfCommittedV3,
  legacyV1SubviewOfV3,
  loadCommittedGovernanceV3,
  requireCommittedFileV3,
  v2CompatibleSubview,
  type CommittedGovernanceV3,
} from './commitLoaderV3.js';
import { parsePostP24WindowAdjudication, type PostP24WindowStructure } from './familiesV3.js';
import { refuseV3 } from './refusal.js';
import {
  COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES,
  REGISTRY_V3_ADDED_IDS,
  REPLACEMENT_LEDGER_REGISTRY_ID,
  REPLACEMENT_LEDGER_V3_PIN,
  type GovernanceRegistryEntryV3,
} from './registryV3.js';

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

function normaliseDraw(governance: CommittedGovernanceV3): NormalisedDraw {
  const file = requireCommittedFileV3(governance, 'FROZEN_DRAW_V2_GEN1');
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
// B. THE TEN-ENTRY REPLACEMENT LEDGER.
// ---------------------------------------------------------------------------

interface NormalisedLedger {
  readonly raw: ReplacementLedger;
  readonly revision: A2ReplacementLedgerRevision;
  readonly entryCount: number;
}

function normaliseReplacementLedger(
  governance: CommittedGovernanceV3,
  draw: NormalisedDraw,
): NormalisedLedger {
  const file = requireCommittedFileV3(governance, REPLACEMENT_LEDGER_REGISTRY_ID);
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
    raw.ledgerHash !== REPLACEMENT_LEDGER_V3_PIN.ledgerHash ||
    entryCount !== REPLACEMENT_LEDGER_V3_PIN.entryCount
  ) {
    refuseV3(
      'REPLACEMENT_LEDGER_V3_PIN_MISMATCH',
      'the validated ledger is not the revision Registry V3 pins',
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

interface ScopedSupersessionV3 {
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
): readonly ScopedSupersessionV3[] {
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

export interface ReplacementHistoryAuditEntryV3 {
  readonly ledgerSequence: number;
  readonly replacedOccupantKind: 'ORIGINAL_SELECTION' | 'RESERVE_REPLACEMENT';
  readonly ledgerReason: UnsuccessfulDisposition;
  readonly frozenReason: UnsuccessfulDisposition;
  readonly reasonSourceRegistryIds: readonly string[];
  readonly reasonsAgree: true;
}

export interface ReplacementHistoryAuditV3 {
  readonly auditedEntryCount: number;
  readonly entries: readonly ReplacementHistoryAuditEntryV3[];
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
): ReplacementHistoryAuditV3 {
  const entries = ledger.revision.entries;
  const postdating = new Set(REGISTRY_V3_ADDED_IDS);
  const audited = entries.map((entry): ReplacementHistoryAuditEntryV3 => {
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
    // Every record Registry V3 adds was committed AFTER the ledger revision it
    // registers, so none of them can be the authority for why that ledger
    // replaced anyone. The reason must come from governance the ledger append
    // itself relied on.
    if (found.some((candidate) => postdating.has(candidate.source))) {
      refuseV3(
        'V3_REPLACEMENT_REASON_POSTDATES_LEDGER_REVISION',
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
// E. THE RESOLUTION.
// ---------------------------------------------------------------------------

export interface CommittedGovernanceResolutionV3 {
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
  readonly scopedSupersessions: readonly ScopedSupersessionV3[];
  readonly replacementHistoryAudit: ReplacementHistoryAuditV3;
  readonly v3FamilyTerminalItems: readonly ParsedTerminalItem[];
  readonly v3FamilyStructure: PostP24WindowStructure;
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

/**
 * Resolves Registry V3 from committed objects. The registry is a parameter
 * only so a test can point entries at a scratch repository and prove each
 * refusal end to end; this function MINTS NOTHING. The only minting entry
 * point is `snapshotV3.ts`, which accepts no registry at all.
 */
export function resolveCommittedA2GovernanceV3(
  repositoryRoot: string,
  registry: readonly GovernanceRegistryEntryV3[] = COMMITTED_A2_GOVERNANCE_REGISTRY_V3_ENTRIES,
): CommittedGovernanceResolutionV3 {
  const governance = loadCommittedGovernanceV3(repositoryRoot, registry);
  const v2Subview = v2CompatibleSubview(governance);
  const legacy = legacyV1SubviewOfV3(governance);

  const draw = normaliseDraw(governance);
  const ledger = normaliseReplacementLedger(governance, draw);
  const transitionChain = validateTransitionLedgerChain(legacy);
  const chains = buildRunSupersessionChains(transitionChain.edges);
  const v3Family = parsePostP24WindowAdjudication(governance);
  const parsed = mergeFamilyOutputs([
    parseGovernanceFamilies(legacy),
    parsePostP18SecondWindowAdjudication(v2Subview),
    v3Family,
  ]);

  const current = currentEpisodes(draw, ledger);
  const currentKeys = new Set(current.map(episodeKeyOf));
  const slotSplits = draw.selection.map((slot) => slot.split);

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
  const supersessionByEpisode = new Map<string, ScopedSupersessionV3>();
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
  let currentFactsWithTransitionBindingCount = 0;
  const tipBinding = bindingOfCommittedV3(
    requireCommittedFileV3(governance, TRANSITION_LEDGER_TIP_V1),
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
          `selection slot ${String(episode.selectionIndex)}'s current occupant is named by registered evidence with no terminal adjudication in Registry V3`,
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
        adjudication: bindingOfCommittedV3(
          requireCommittedFileV3(governance, item.sourceRegistryId),
        ),
        liveResult: bindingOfCommittedV3(
          requireCommittedFileV3(governance, item.liveResultRegistryId),
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
    // terminally adjudicated, so nothing is pending. A never-started plan item
    // produced no evidence and is not emitted; historical live results are not
    // emitted merely because they exist.
    evidenceStatuses: Object.freeze([]),
  });
  const summary = deriveGenerationSlotAuthoritySummary(resolution);

  return Object.freeze({
    registryVersion: governance.registryVersion,
    checkpointCommit: governance.checkpointCommit,
    registryEntryCount: registry.length,
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
    v2SubviewEntryCount: v2Subview.files.size,
    legacySubviewEntryCount: legacy.files.size,
    draw: draw.binding,
    replacementLedger: ledger.revision,
    replacementLedgerEntryCount: ledger.entryCount,
    transitionChain,
    transitionLedgerTipBinding: tipBinding,
    scopedSupersessions,
    replacementHistoryAudit,
    v3FamilyTerminalItems: v3Family.terminalItems,
    v3FamilyStructure: v3Family.structure,
    currentTerminalFactCount: adjudications.length,
    currentPendingEvidenceFactCount: 0,
    currentFactsWithTransitionBindingCount,
    supersededTerminalItemCount,
    historicalTerminalItemCount: parsed.terminalItems.length - adjudications.length,
    resolution,
    summary,
  });
}

export type { ScopedSupersessionV3 };
