/**
 * PHASE 2B-2D — A3 R19: THE COMMITTED A2 GOVERNANCE AUTHORITY ADAPTER.
 *
 * ONE QUESTION
 *
 *   From COMMITTED PUBLIC Generation-1 A2 governance only, what exact
 *   normalised input should R17 receive, and what aggregate slot-authority
 *   state does R17 derive from it?
 *
 * WHAT THIS MODULE DOES, IN ORDER
 *
 *   1. verifies every Registry V1 file byte for byte (`loader.ts`);
 *   2. normalises the frozen DRAW into R17's selection and reserve shapes,
 *      digesting each entry with the ALREADY-LANDED canonical primitive;
 *   3. validates the replacement ledger with the CANONICAL hash validator
 *      before a single entry reaches R17, then normalises it;
 *   4. validates the explicit V2 -> V3 -> V4 -> V6 transition chain and derives
 *      its normalised edges and per-slot supersession graph
 *      (`transitionLedger.ts`);
 *   5. parses each adjudication family with its OWN exact parser
 *      (`families.ts`);
 *   6. scopes every supersession chain to ONE occupancy episode, and takes the
 *      unsuperseded tail of the CURRENT occupant's episode as its run of
 *      record;
 *   7. audits all eight replacement-ledger entries against committed owner
 *      authority - and emits NONE of those historical facts to R17;
 *   8. calls the real R17 resolver and the real R17 summary.
 *
 * WHAT IT NEVER DOES
 *
 *   No working database, no sealed root, no institution network, no provider,
 *   no environment-selected governance, no child process, no directory scan,
 *   no "latest" of anything, and no SET_P / SET_R / corpus materialisation.
 *   It never re-implements R17: current-occupant derivation, READY minting and
 *   the public summary all come from R17 itself.
 *
 * WHY HISTORICAL FACTS ARE NOT FED TO R17
 *
 *   The replacement ledger already defines the occupant chain, and R19 proves
 *   each of the eight replacement reasons here, independently. Feeding the
 *   historical facts as well would add nothing and would put stale same-slot
 *   history one bug away from contaminating current authority. R17 receives
 *   terminal facts for CURRENT occupants only.
 */
import {
  currentOccupantForSelectionIndex,
  requireValidLedger,
  recomputeLedgerHash,
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
  bindingOf,
  loadRegisteredGovernance,
  requireFile,
  type VerifiedGovernance,
} from './loader.js';
import {
  ACQUISITION_SUCCESSFUL,
  episodeKeyOf,
  GENERATION_ID,
  parseGovernanceFamilies,
  type EpisodeRef,
  type ParsedTerminalItem,
  type UnsuccessfulDisposition,
} from './families.js';
import { refuse } from './refusal.js';
import {
  buildRunSupersessionChains,
  validateTransitionLedgerChain,
  type NormalisedTransitionEdge,
  type RunSupersessionChain,
  type ValidatedTransitionLedgerChain,
} from './transitionLedger.js';
import {
  CANONICAL_A2_A3_GOVERNANCE_INTEGRATION_TIP,
  CANONICAL_A2_GOVERNANCE_REGISTRY_V1,
  CANONICAL_A2_GOVERNANCE_REGISTRY_VERSION,
  TRANSITION_LEDGER_TIP_V1,
  type GovernanceRegistryEntry,
} from './registryV1.js';

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
  /** The raw parsed entries, for the canonical ledger validator. */
  readonly forLedger: DrawForLedger;
}

function normaliseDraw(governance: VerifiedGovernance): NormalisedDraw {
  const file = requireFile(governance, 'FROZEN_DRAW_V2_GEN1');
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
      // The canonical, already-landed digest. No second algorithm exists here.
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
// B. THE REPLACEMENT LEDGER, VALIDATED CANONICALLY THEN NORMALISED.
// ---------------------------------------------------------------------------

interface NormalisedLedger {
  readonly raw: ReplacementLedger;
  readonly revision: A2ReplacementLedgerRevision;
  readonly entryCount: number;
}

function normaliseReplacementLedger(
  governance: VerifiedGovernance,
  draw: NormalisedDraw,
): NormalisedLedger {
  const file = requireFile(governance, 'RESERVE_REPLACEMENT_LEDGER_V2_GEN1');
  const raw = file.parsed as unknown as ReplacementLedger;
  if (raw.generationId !== GENERATION_ID) {
    refuse('REPLACEMENT_LEDGER_MALFORMED', 'the replacement ledger names another generation');
  }
  if (typeof raw.ledgerHash !== 'string' || recomputeLedgerHash(raw) !== raw.ledgerHash) {
    refuse('REPLACEMENT_LEDGER_HASH_MISMATCH', 'the replacement ledger hash does not recompute');
  }
  // THE CANONICAL VALIDATOR, before any entry reaches R17. R17's own
  // positional checks do not replace it: only this one hashes.
  let entryCount: number;
  try {
    entryCount = requireValidLedger(draw.forLedger, raw);
  } catch (cause) {
    return refuse(
      'REPLACEMENT_LEDGER_INVALID',
      `the canonical validator rejected the ledger: ${String((cause as Error).message)}`,
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

/**
 * Derives the CURRENT occupant of every slot from the frozen draw plus the
 * validated ledger, using the CANONICAL A2 derivation. Occupant identity comes
 * from these two sources and nothing else - never from an adjudication's own
 * restatement of it.
 */
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

/** One supersession chain, bound to the ONE occupancy episode that owns it. */
interface ScopedSupersession {
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
): readonly ScopedSupersession[] {
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
    if (owners.length === 0) {
      refuse(
        'TRANSITION_GRAPH_OCCUPANT_SCOPE_UNPROVABLE',
        `no registered record binds any run of slot ${String(chain.selectionIndex)}'s supersession chain to an occupant`,
      );
    }
    if (owners.length > 1) {
      refuse(
        'TRANSITION_GRAPH_OCCUPANT_SCOPE_UNPROVABLE',
        `slot ${String(chain.selectionIndex)}'s supersession chain is claimed by more than one occupancy episode`,
      );
    }
    const tail = chain.runRefs[chain.runRefs.length - 1]!;
    return Object.freeze({
      episode: owners[0]!,
      chain,
      tailRunRefSha256: tail,
      reachedThroughTransition: chain.edges.length > 0,
    });
  });
}

// ---------------------------------------------------------------------------
// D. THE HISTORICAL REPLACEMENT AUDIT.
// ---------------------------------------------------------------------------

export interface ReplacementHistoryAuditEntry {
  readonly ledgerSequence: number;
  readonly replacedOccupantKind: 'ORIGINAL_SELECTION' | 'RESERVE_REPLACEMENT';
  readonly ledgerReason: UnsuccessfulDisposition;
  readonly frozenReason: UnsuccessfulDisposition;
  readonly reasonSourceRegistryIds: readonly string[];
  readonly reasonsAgree: true;
}

export interface ReplacementHistoryAudit {
  readonly auditedEntryCount: number;
  readonly entries: readonly ReplacementHistoryAuditEntry[];
}

/** The episode a ledger entry REPLACED, derived from the ledger alone. */
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
): ReplacementHistoryAudit {
  const entries = ledger.revision.entries;
  const audited = entries.map((entry): ReplacementHistoryAuditEntry => {
    const episode = replacedEpisodeOf(entries, entry);
    const key = episodeKeyOf(episode);
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
    const distinct = new Set(found.map((candidate) => candidate.reason));
    if (distinct.size !== 1) {
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

export interface CanonicalGovernanceResolution {
  readonly registryVersion: string;
  readonly governanceBaseCommit: string;
  readonly registryEntryCount: number;
  readonly verifiedRegistryBindings: readonly {
    readonly id: string;
    readonly path: string;
    readonly sha256: string;
    readonly bytes: number;
    readonly commit: string;
  }[];
  readonly draw: NormalisedDraw['binding'];
  readonly replacementLedger: A2ReplacementLedgerRevision;
  readonly transitionChain: ValidatedTransitionLedgerChain;
  readonly transitionLedgerTipBinding: {
    readonly path: string;
    readonly sha256: string;
    readonly commit: string;
  };
  readonly scopedSupersessions: readonly ScopedSupersession[];
  readonly replacementHistoryAudit: ReplacementHistoryAudit;
  readonly currentTerminalFactCount: number;
  readonly currentPendingEvidenceFactCount: number;
  readonly currentFactsWithTransitionBindingCount: number;
  readonly supersededTerminalItemCount: number;
  readonly historicalTerminalItemCount: number;
  readonly resolution: A3GenerationSlotAuthorityResolution;
  readonly summary: A3GenerationSlotAuthoritySummary;
}

export function resolveCanonicalA2GovernanceV1(
  repositoryRoot: string,
  registry: readonly GovernanceRegistryEntry[] = CANONICAL_A2_GOVERNANCE_REGISTRY_V1,
): CanonicalGovernanceResolution {
  const governance = loadRegisteredGovernance(
    repositoryRoot,
    registry,
    CANONICAL_A2_GOVERNANCE_REGISTRY_VERSION,
    CANONICAL_A2_A3_GOVERNANCE_INTEGRATION_TIP,
  );

  const draw = normaliseDraw(governance);
  const ledger = normaliseReplacementLedger(governance, draw);
  const transitionChain = validateTransitionLedgerChain(governance);
  const chains = buildRunSupersessionChains(transitionChain.edges);
  const parsed = parseGovernanceFamilies(governance);

  // --- Occupancy episodes: who each slot's current occupant is. ------------
  const current = currentEpisodes(draw, ledger);
  const currentKeys = new Set(current.map(episodeKeyOf));
  const slotSplits = draw.selection.map((slot) => slot.split);

  // --- Run claims, per episode. An episode is (slot, kind, reserve rank). --
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
  const supersessionByEpisode = new Map<string, ScopedSupersession>();
  for (const scoped of scopedSupersessions) {
    const key = episodeKeyOf(scoped.episode);
    if (supersessionByEpisode.has(key)) {
      refuse('TRANSITION_GRAPH_FORK', 'one occupancy episode owns two supersession chains');
    }
    supersessionByEpisode.set(key, scoped);
  }

  // --- Which parsed items are the run of record of their episode? ----------
  const isTail = (item: ParsedTerminalItem): boolean => {
    const scoped = supersessionByEpisode.get(episodeKeyOf(item));
    if (scoped === undefined) return true;
    if (!scoped.chain.runRefs.includes(item.runRefSha256)) return true;
    return item.runRefSha256 === scoped.tailRunRefSha256;
  };
  const tailItems = parsed.terminalItems.filter(isTail);
  const supersededTerminalItemCount = parsed.terminalItems.length - tailItems.length;

  // --- Frozen reasons per episode, for the historical audit. ---------------
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

  // --- Owner Clarification Q3 binds the ORIGINAL occupant of each slot it
  //     names. That is proved from the ledger, not asserted by the record.
  for (const reason of parsed.historicalReasons) {
    if (reason.sourceRegistryId !== 'OWNER_REPLACEMENT_REASON_PRECEDENCE_CLARIFICATION') continue;
    const slotEntries = ledger.revision.entries.filter(
      (entry) => entry.selectionIndex === reason.selectionIndex,
    );
    if (slotEntries.length !== 1 || slotEntries[0]!.replacedOccupantKind !== 'ORIGINAL_SELECTION') {
      refuse(
        'REPLACEMENT_HISTORY_EPISODE_MISMATCH',
        `the owner reason clarification names a slot whose ledger chain does not pin it to one original occupant`,
      );
    }
  }

  // --- The CURRENT terminal facts, and only those. -------------------------
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
  const tipFile = requireFile(governance, TRANSITION_LEDGER_TIP_V1);
  const tipBinding = bindingOf(tipFile);

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
      // A current occupant with committed terminal evidence somewhere the
      // registry does not hold is a REFUSAL, not a silently missing fact.
      if (frozenReasonsByEpisode.has(key) || runClaimsByEpisode.has(key)) {
        refuse(
          'REGISTRY_INCOMPLETE_FOR_CURRENT_OCCUPANT',
          `selection slot ${String(episode.selectionIndex)}'s current occupant is named by registered evidence with no terminal adjudication in Registry V1`,
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

    // DRAW + LEDGER decide identity. A redundant restatement must MATCH.
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
        adjudication: bindingOf(requireFile(governance, item.sourceRegistryId)),
        liveResult: bindingOf(requireFile(governance, item.liveResultRegistryId)),
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

  // --- A transition tail that nobody adjudicated is a refusal. -------------
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

  // --- R17 does the rest. Nothing above is reimplemented below. ------------
  const resolution = resolveGenerationSlotAuthorities({
    generationId: GENERATION_ID,
    draw: draw.binding,
    selection: draw.selection,
    reserve: draw.reserve,
    replacementLedger: ledger.revision,
    adjudications: Object.freeze(adjudications),
    // No current occupant has executed evidence awaiting adjudication at this
    // snapshot, so this is EMPTY. Historical live results are not emitted
    // merely because they exist.
    evidenceStatuses: Object.freeze([]),
  });
  const summary = deriveGenerationSlotAuthoritySummary(resolution);

  return Object.freeze({
    registryVersion: governance.registryVersion,
    governanceBaseCommit: governance.governanceBaseCommit,
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
    draw: draw.binding,
    replacementLedger: ledger.revision,
    transitionChain,
    transitionLedgerTipBinding: tipBinding,
    scopedSupersessions,
    replacementHistoryAudit,
    currentTerminalFactCount: adjudications.length,
    currentPendingEvidenceFactCount: 0,
    currentFactsWithTransitionBindingCount,
    supersededTerminalItemCount,
    historicalTerminalItemCount: parsed.terminalItems.length - adjudications.length,
    resolution,
    summary,
  });
}

export type { NormalisedTransitionEdge, ScopedSupersession };
