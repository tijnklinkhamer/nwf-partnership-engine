/**
 * PHASE 2B-2D — A3 R38B: COMMITTED BYTES -> THE ONE R38A RESOLUTION INPUT.
 *
 * R38B is an ADAPTER. It owns exactly:
 *
 *   committed bytes -> exact, normalised R38A facts, admissions and
 *                      adjudication registries.
 *
 * R38A owns normalised facts -> cross-generation authority. Nothing here
 * decides READY, duplicates the READY rule, mints, or bypasses a brand.
 *
 * CARRY-FORWARD ADMISSIONS
 *
 *   One admission per successful row of the committed per-slot carry-forward
 *   audit that the owner-approved baseline binds. Every admission field comes
 *   from that committed row (adjudication, acquisition-of-record result, run,
 *   policy, transition binding) or from the derived chain (the occupant, whose
 *   kind, reserve position, ledger sequence and draw-entry digest must equal
 *   the row's). `admissionRecord` is the baseline itself. Nothing is invented:
 *   R38A then requires the admission to equal the Generation-1 fact exactly.
 *
 * ADJUDICATION REGISTRIES
 *
 *   One closed registry per generation, built ONLY from registry files whose
 *   role is TERMINAL_DISPOSITION_AUTHORITY: Generation 1 from the reused V4
 *   adjudications plus the Generation-1 post-closure windows, Generation 2 from
 *   the thirteen Generation-2 window adjudications. A record's generation is
 *   its registry entry's, never its filename's. A live result, a window or
 *   cadence authority, a carry-forward record or the terminal freeze can never
 *   enter either registry.
 *
 * PURE: no filesystem, no git, no database, no clock.
 */
import { sourceIdentityKey } from '../a3crossGenerationSlotAuthority/occupantIdentity.js';
import {
  CROSS_GENERATION_IDS,
  GENERATION1_ID,
  GENERATION1_REPLACEMENT_LEDGER,
  GENERATION1_TO_GENERATION2_CARRY_FORWARD_ADMISSION,
  GENERATION2_ID,
  type CarryForwardAdmission,
  type CrossGenerationCurrentOccupant,
  type CrossGenerationId,
  type CrossGenerationRecordBinding,
  type CrossGenerationResolutionInput,
  type GenerationAdjudicationRegistry,
  type Generation1LedgerRevision,
  type Generation2LedgerRevision,
  type Generation2ScheduleRevision,
} from '../a3crossGenerationSlotAuthority/types.js';
import { refuseV5 } from './refusal.js';
import { bindingKeyV5, type CommittedGovernanceV5 } from './commitLoaderV5.js';
import type { CarryForwardAuditRowV5, CarryForwardBaselineV5 } from './familiesV5.js';
import type { LocatedFactV5 } from './historyV5.js';
import type { NormalisedDrawV5 } from './structureV5.js';

function sameBinding(
  a: CrossGenerationRecordBinding | null,
  b: CrossGenerationRecordBinding | null,
): boolean {
  if (a === null || b === null) return a === b;
  return bindingKeyV5(a) === bindingKeyV5(b);
}

// ---------------------------------------------------------------------------
// A. CARRY-FORWARD ADMISSIONS, FROM THE COMMITTED PER-SLOT AUDIT.
// ---------------------------------------------------------------------------

function requireRowIsTerminalLink(
  row: CarryForwardAuditRowV5,
  occupant: CrossGenerationCurrentOccupant,
): void {
  const link = occupant.chain[occupant.generation1TerminalChainPosition]!;
  const at = `carry-forward audit slot ${String(row.selectionIndex)}`;
  if (
    row.split !== occupant.split ||
    link.source.sourceKind === 'GENERATION2_RESERVE_REPLACEMENT'
  ) {
    refuseV5('V5_CARRY_FORWARD_INVALID', `${at} is not its slot's Generation-1 terminal occupant`);
  }
  const installation = link.installation;
  const reserve = row.occupantKind === 'RESERVE_REPLACEMENT';
  if (
    reserve !== (link.source.sourceKind === 'GENERATION1_RESERVE_REPLACEMENT') ||
    link.source.drawEntrySha256 !== row.drawEntrySha256 ||
    (link.source.sourceKind === 'GENERATION1_RESERVE_REPLACEMENT'
      ? link.source.generation1ReserveRankPosition !== row.generation1ReserveRankPosition ||
        installation.installedBy !== GENERATION1_REPLACEMENT_LEDGER ||
        installation.generation1Sequence !== row.generation1LedgerSequence
      : row.generation1ReserveRankPosition !== null || row.generation1LedgerSequence !== null)
  ) {
    refuseV5(
      'V5_CARRY_FORWARD_INVALID',
      `${at} identity is not its slot's derived terminal occupant`,
    );
  }
}

/**
 * Builds the admissions and cross-checks every audit row against the
 * Generation-1 fact on its slot's Generation-1 terminal link: a success row
 * must equal its fact field for field, a failure row its unsuccessful fact, a
 * never-started row must have no Generation-1 fact at all.
 */
export function buildCarryForwardAdmissionsV5(
  baseline: CarryForwardBaselineV5,
  rows: readonly CarryForwardAuditRowV5[],
  occupants: readonly CrossGenerationCurrentOccupant[],
  generation1Facts: readonly LocatedFactV5[],
): readonly CarryForwardAdmission[] {
  if (rows.length !== occupants.length) {
    refuseV5('V5_CARRY_FORWARD_INVALID', 'the carry-forward audit does not cover every slot once');
  }
  const terminalFactOf = (selectionIndex: number): LocatedFactV5 | undefined => {
    const occupant = occupants[selectionIndex]!;
    return generation1Facts.find(
      (located) =>
        located.fact.selectionIndex === selectionIndex &&
        located.chainPosition === occupant.generation1TerminalChainPosition,
    );
  };
  const admissions: CarryForwardAdmission[] = [];
  for (const row of rows) {
    const occupant = occupants[row.selectionIndex]!;
    requireRowIsTerminalLink(row, occupant);
    const fact = terminalFactOf(row.selectionIndex)?.fact;
    const at = `carry-forward audit slot ${String(row.selectionIndex)}`;
    if (row.generation1Status === 'NEVER_STARTED') {
      if (fact !== undefined) {
        refuseV5(
          'V5_CARRY_FORWARD_FACT_MISMATCH',
          `${at} is never-started but has a Generation-1 fact`,
        );
      }
      continue;
    }
    if (fact === undefined || fact.factGenerationId !== GENERATION1_ID) {
      refuseV5('V5_CARRY_FORWARD_FACT_MISMATCH', `${at} has no Generation-1 terminal fact`);
    }
    if (row.generation1Status === 'CURRENT_ACQUISITION_FAILURE') {
      if (
        fact.disposition !== row.verdict ||
        !sameBinding(fact.adjudication, row.dispositionAuthority) ||
        fact.runRefSha256 !== row.runRefSha256
      ) {
        refuseV5(
          'V5_CARRY_FORWARD_FACT_MISMATCH',
          `${at} failure row is not its Generation-1 fact`,
        );
      }
      continue;
    }
    if (
      fact.disposition !== 'ACQUISITION_SUCCESSFUL' ||
      fact.acquisitionOfRecord.provenanceKind !== 'ORDINARY_ADJUDICATED_ACQUISITION' ||
      !sameBinding(fact.adjudication, row.dispositionAuthority) ||
      !sameBinding(fact.acquisitionOfRecord.adjudicatedResult, row.liveResult) ||
      fact.runRefSha256 !== row.runRefSha256 ||
      fact.acquisitionPolicyVersion !== row.acquisitionPolicyVersion ||
      !sameBinding(fact.acquisitionPolicyTransitionLedger, row.acquisitionPolicyTransitionLedger)
    ) {
      refuseV5(
        'V5_CARRY_FORWARD_FACT_MISMATCH',
        `${at} success row does not equal its Generation-1 acquisition of record`,
      );
    }
    const source = occupant.chain[occupant.generation1TerminalChainPosition]!.source;
    if (source.sourceKind === 'GENERATION2_RESERVE_REPLACEMENT') {
      refuseV5('V5_CARRY_FORWARD_INVALID', `${at} admits a Generation-2 reserve`);
    }
    admissions.push(
      Object.freeze({
        admissionKind: GENERATION1_TO_GENERATION2_CARRY_FORWARD_ADMISSION,
        fromGenerationId: GENERATION1_ID,
        toGenerationId: GENERATION2_ID,
        admissionRecord: baseline.admissionRecord,
        selectionIndex: row.selectionIndex,
        split: row.split,
        occupant: source,
        generation1Adjudication: row.dispositionAuthority,
        acquisitionOfRecordResult: row.liveResult,
        runRefSha256: row.runRefSha256,
        acquisitionPolicyVersion: row.acquisitionPolicyVersion,
        acquisitionPolicyTransitionLedger: row.acquisitionPolicyTransitionLedger,
        accepted: true,
      }),
    );
  }
  return Object.freeze(admissions);
}

// ---------------------------------------------------------------------------
// B. THE TWO CLOSED ADJUDICATION REGISTRIES.
// ---------------------------------------------------------------------------

/** Which generation committed a registered file - from its registry entry only. */
function generationOfRegisteredFile(
  governance: CommittedGovernanceV5,
  binding: CrossGenerationRecordBinding,
): { readonly generationId: CrossGenerationId; readonly isDispositionAuthority: boolean } {
  const key = bindingKeyV5(binding);
  for (const file of governance.files.values()) {
    if (bindingKeyV5(file) !== key) continue;
    if (file.source.kind === 'V4_REUSED_BY_REFERENCE') {
      // Registry V4 is Generation 1 throughout.
      return {
        generationId: GENERATION1_ID,
        isDispositionAuthority: file.source.entry.roles.includes('TERMINAL_DISPOSITION_AUTHORITY'),
      };
    }
    const generationId = file.source.entry.generationId;
    if (generationId === null) break;
    return {
      generationId,
      isDispositionAuthority: file.source.entry.roles.includes('TERMINAL_DISPOSITION_AUTHORITY'),
    };
  }
  return refuseV5(
    'V5_TERMINAL_FACT_UNREGISTERED_PROVENANCE',
    'an adjudication binding is not a registered, generation-scoped record',
  );
}

/**
 * The closed registries: every adjudication a fact binds, placed in the
 * generation its REGISTRY ENTRY declares, each a disposition authority. A
 * fact whose own generation differs from its adjudication's registered
 * generation is left for R38A to refuse as relabelled.
 */
export function buildAdjudicationRegistriesV5(
  governance: CommittedGovernanceV5,
  facts: readonly LocatedFactV5[],
): readonly GenerationAdjudicationRegistry[] {
  const byGeneration = new Map<CrossGenerationId, Map<string, CrossGenerationRecordBinding>>([
    [GENERATION1_ID, new Map()],
    [GENERATION2_ID, new Map()],
  ]);
  for (const { fact } of facts) {
    const registered = generationOfRegisteredFile(governance, fact.adjudication);
    if (!registered.isDispositionAuthority) {
      refuseV5(
        'V5_DIAGNOSTIC_PROMOTION_REFUSED',
        'a fact binds, as its adjudication, a record that is not a terminal disposition authority',
      );
    }
    byGeneration
      .get(registered.generationId)!
      .set(bindingKeyV5(fact.adjudication), fact.adjudication);
  }
  return Object.freeze(
    CROSS_GENERATION_IDS.map((generationId) =>
      Object.freeze({
        generationId,
        adjudications: Object.freeze(
          [...byGeneration.get(generationId)!.values()].sort((a, b) =>
            bindingKeyV5(a) < bindingKeyV5(b) ? -1 : 1,
          ),
        ),
      }),
    ),
  );
}

// ---------------------------------------------------------------------------
// C. THE ONE INPUT.
// ---------------------------------------------------------------------------

export function assembleCrossGenerationInputV5(parts: {
  readonly draw: NormalisedDrawV5;
  readonly generation1Ledger: Generation1LedgerRevision;
  readonly generation2Schedule: Generation2ScheduleRevision;
  readonly generation2Ledger: Generation2LedgerRevision;
  readonly adjudicationRegistries: readonly GenerationAdjudicationRegistry[];
  readonly facts: readonly LocatedFactV5[];
  readonly admissions: readonly CarryForwardAdmission[];
}): CrossGenerationResolutionInput {
  const seen = new Set<string>();
  for (const { fact, chainPosition } of parts.facts) {
    const key = `${String(fact.selectionIndex)}#${String(chainPosition)}|${sourceIdentityKey(fact.occupant)}`;
    if (seen.has(key)) {
      refuseV5('V5_TERMINAL_FACT_DUPLICATE', 'two normalised facts name one slot-chain occupant');
    }
    seen.add(key);
  }
  return Object.freeze({
    resolutionGenerationId: GENERATION2_ID,
    draw: parts.draw.binding,
    selection: parts.draw.selection,
    generation1Reserve: parts.draw.reserve,
    generation1Ledger: parts.generation1Ledger,
    generation2Schedule: parts.generation2Schedule,
    generation2Ledger: parts.generation2Ledger,
    adjudicationRegistries: parts.adjudicationRegistries,
    terminalFacts: Object.freeze(parts.facts.map((located) => located.fact)),
    carryForwardAdmissions: parts.admissions,
  });
}
