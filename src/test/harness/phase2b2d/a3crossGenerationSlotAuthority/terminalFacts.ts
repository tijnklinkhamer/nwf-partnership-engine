/**
 * PHASE 2B-2D — A3 R38A: TERMINAL FACTS, ACQUISITION OF RECORD, CARRY-FORWARD.
 *
 * A FACT'S GENERATION IS PROVENANCE, NOT A LABEL
 *
 *   `factGenerationId` is the generation that genuinely issued the
 *   adjudication. It is checked against the explicit, closed registry of the
 *   adjudication records each generation committed: a Generation-1
 *   adjudication relabelled Generation 2 (or the reverse) is found in the
 *   OTHER generation's registry and refused. A Generation-1 fact can never
 *   authorise a Generation-2 reserve; a Generation-2 fact can authorise only
 *   an occupant that existed in Generation 2 (the Generation-1 terminal
 *   occupant or a Generation-2 reserve), never one Generation 1 already
 *   replaced.
 *
 * ACQUISITION OF RECORD IS DECLARED, NEVER INFERRED
 *
 *   ORDINARY_ADJUDICATED_ACQUISITION: the adjudicated result is the record.
 *   ACCEPTED_TARGETED_RECOVERY_ACQUISITION: the adjudication EXPLICITLY
 *   selected a recovery result, and the original result and run stay bound.
 *   Nothing here compares timestamps, orders results or prefers a newer run;
 *   a recovery that the adjudication did not select is refused.
 *
 * CARRY-FORWARD IS AN ADMISSION, NOT AN ACQUISITION
 *
 *   A Generation-1 success may remain the acquisition of record in Generation
 *   2 only through an explicit committed admission naming that exact occupant,
 *   adjudication, result, run, policy and policy-transition binding, for a
 *   slot no Generation-2 transition has touched. PURE.
 */
import {
  A2_ACQUISITION_SUCCESSFUL,
  A2_TERMINAL_DISPOSITIONS,
  type A2TerminalDisposition,
  type A3SealedSd7DetailCommitment,
} from '../a3prep/slotAuthority.js';
import type { Split } from '../a3prep/contracts.js';
import {
  hasExactKeys,
  isHex,
  isIntegerIn,
  isObject,
  isPresentObject,
  isRecordBinding,
  isSplit,
  occupantGenerationOf,
  requireSourceShape,
  sameSourceIdentity,
  sourceIdentityKey,
} from './occupantIdentity.js';
import { refuseCrossGeneration } from './refusal.js';
import {
  A2_TERMINAL_EVIDENCE_ADJUDICATION,
  ACCEPTED_TARGETED_RECOVERY_ACQUISITION,
  CROSS_GENERATION_IDS,
  EXPLICIT_ADJUDICATION_SELECTION,
  GENERATION1_ID,
  GENERATION1_TO_GENERATION2_CARRY_FORWARD_ADMISSION,
  GENERATION2_ID,
  ORDINARY_ADJUDICATED_ACQUISITION,
  type AcquisitionOfRecordProvenance,
  type CarryForwardAdmission,
  type CrossGenerationCurrentOccupant,
  type CrossGenerationId,
  type CrossGenerationRecordBinding,
  type CrossGenerationResolutionInput,
  type CrossGenerationTerminalFact,
} from './types.js';
import { GENERATION_1_SELECTED_ORGANISATIONS } from '../a3prep/contracts.js';

const FETCH_POLICY_VERSION = /^orgunit-fetch-policy-v[1-9][0-9]*$/;
const SEALED_DETAIL_BASENAME = /^[A-Za-z0-9_.-]+\.json$/;

export function bindingKey(binding: CrossGenerationRecordBinding): string {
  return `${binding.path}|${binding.sha256}|${binding.commit}`;
}

function sameBinding(
  a: CrossGenerationRecordBinding | null,
  b: CrossGenerationRecordBinding | null,
): boolean {
  if (a === null || b === null) return a === b;
  return bindingKey(a) === bindingKey(b);
}

function freezeBinding(value: CrossGenerationRecordBinding): CrossGenerationRecordBinding {
  return Object.freeze({ path: value.path, sha256: value.sha256, commit: value.commit });
}

function requireBinding(value: unknown, at: string): CrossGenerationRecordBinding {
  if (!isRecordBinding(value) || !hasExactKeys(value, ['path', 'sha256', 'commit'])) {
    refuseCrossGeneration('FACT_PROVENANCE_INVALID', `${at} is not a committed record binding`);
  }
  return freezeBinding(value);
}

// ---------------------------------------------------------------------------
// A. GENERATION ADJUDICATION REGISTRIES.
// ---------------------------------------------------------------------------

export type AdjudicationRegistryIndex = ReadonlyMap<string, CrossGenerationId>;

export function indexAdjudicationRegistries(
  input: CrossGenerationResolutionInput,
): AdjudicationRegistryIndex {
  const registries = input.adjudicationRegistries;
  if (!Array.isArray(registries) || registries.length !== CROSS_GENERATION_IDS.length) {
    refuseCrossGeneration(
      'ADJUDICATION_REGISTRY_INVALID',
      'exactly one adjudication registry per generation is required',
    );
  }
  const index = new Map<string, CrossGenerationId>();
  const pathsSeen = new Map<string, CrossGenerationId>();
  const seenGenerations = new Set<string>();
  registries.forEach((registry, r) => {
    const at = `adjudicationRegistries[${String(r)}]`;
    if (
      !isPresentObject(registry) ||
      !(CROSS_GENERATION_IDS as readonly unknown[]).includes(registry.generationId) ||
      seenGenerations.has(registry.generationId) ||
      !Array.isArray(registry.adjudications)
    ) {
      refuseCrossGeneration('ADJUDICATION_REGISTRY_INVALID', `${at} is malformed or repeated`);
    }
    seenGenerations.add(registry.generationId);
    registry.adjudications.forEach((binding: unknown, i: number) => {
      if (!isRecordBinding(binding)) {
        refuseCrossGeneration(
          'ADJUDICATION_REGISTRY_INVALID',
          `${at}.adjudications[${String(i)}] is not a record binding`,
        );
      }
      const owner = pathsSeen.get(binding.path);
      if (owner !== undefined) {
        refuseCrossGeneration(
          'ADJUDICATION_REGISTRY_INVALID',
          owner === registry.generationId
            ? `${at}.adjudications[${String(i)}] repeats a record`
            : `${at}.adjudications[${String(i)}] is claimed by both generations`,
        );
      }
      pathsSeen.set(binding.path, registry.generationId);
      index.set(bindingKey(binding), registry.generationId);
    });
  });
  return index;
}

function requireIssuedBy(
  index: AdjudicationRegistryIndex,
  binding: CrossGenerationRecordBinding,
  generationId: CrossGenerationId,
  at: string,
): void {
  const issuer = index.get(bindingKey(binding));
  if (issuer === undefined) {
    refuseCrossGeneration(
      'ADJUDICATION_REGISTRY_INVALID',
      `${at} is not a committed adjudication of any generation`,
    );
  }
  if (issuer !== generationId) {
    refuseCrossGeneration(
      'FACT_GENERATION_RELABELLED',
      `${at} was issued by the other generation than the one it claims`,
    );
  }
}

// ---------------------------------------------------------------------------
// B. ACQUISITION OF RECORD.
// ---------------------------------------------------------------------------

/** The one result binding a validated provenance declares to be the record. */
export function acquisitionOfRecordResultOf(
  provenance: AcquisitionOfRecordProvenance,
): CrossGenerationRecordBinding {
  return provenance.provenanceKind === ORDINARY_ADJUDICATED_ACQUISITION
    ? provenance.adjudicatedResult
    : provenance.recoveryResult;
}

function requireAcquisitionOfRecord(
  value: unknown,
  adjudication: CrossGenerationRecordBinding,
  runRefSha256: string,
  at: string,
): AcquisitionOfRecordProvenance {
  if (!isObject(value)) {
    return refuseCrossGeneration('ACQUISITION_OF_RECORD_INVALID', `${at} is absent`);
  }
  if (value.provenanceKind === ORDINARY_ADJUDICATED_ACQUISITION) {
    if (
      !hasExactKeys(value, ['provenanceKind', 'adjudicatedResult', 'runRefSha256']) ||
      !isRecordBinding(value.adjudicatedResult) ||
      !isHex(value.runRefSha256)
    ) {
      refuseCrossGeneration('ACQUISITION_OF_RECORD_INVALID', `${at} is not an ordinary record`);
    }
    if (value.runRefSha256 !== runRefSha256) {
      refuseCrossGeneration(
        'ACQUISITION_OF_RECORD_INVALID',
        `${at} run is not the fact's run of record`,
      );
    }
    return Object.freeze({
      provenanceKind: ORDINARY_ADJUDICATED_ACQUISITION,
      adjudicatedResult: freezeBinding(value.adjudicatedResult),
      runRefSha256: value.runRefSha256,
    });
  }
  if (value.provenanceKind === ACCEPTED_TARGETED_RECOVERY_ACQUISITION) {
    if (
      !hasExactKeys(value, [
        'provenanceKind',
        'originalResult',
        'originalRunRefSha256',
        'recoveryResult',
        'recoveryRunRefSha256',
        'selection',
      ]) ||
      !isRecordBinding(value.originalResult) ||
      !isHex(value.originalRunRefSha256) ||
      !isRecordBinding(value.recoveryResult) ||
      !isHex(value.recoveryRunRefSha256)
    ) {
      refuseCrossGeneration(
        'ACQUISITION_OF_RECORD_INVALID',
        `${at} does not retain both the original and the recovery result and run`,
      );
    }
    if (
      value.originalRunRefSha256 === value.recoveryRunRefSha256 ||
      value.originalResult.path === value.recoveryResult.path ||
      value.originalResult.sha256 === value.recoveryResult.sha256
    ) {
      refuseCrossGeneration(
        'ACQUISITION_OF_RECORD_INVALID',
        `${at} original and recovery are not distinct`,
      );
    }
    const selection = value.selection;
    if (
      !isObject(selection) ||
      !hasExactKeys(selection, [
        'selectionBasis',
        'selectingAdjudication',
        'recoveryIsAcquisitionOfRecord',
      ]) ||
      selection.selectionBasis !== EXPLICIT_ADJUDICATION_SELECTION ||
      selection.recoveryIsAcquisitionOfRecord !== true ||
      !isRecordBinding(selection.selectingAdjudication) ||
      !sameBinding(selection.selectingAdjudication, adjudication)
    ) {
      refuseCrossGeneration(
        'RECOVERY_NOT_SELECTED_BY_ADJUDICATION',
        `${at} recovery was not explicitly selected by this fact's own adjudication`,
      );
    }
    if (value.recoveryRunRefSha256 !== runRefSha256) {
      refuseCrossGeneration(
        'ACQUISITION_OF_RECORD_INVALID',
        `${at} the fact's run of record is not the selected recovery run`,
      );
    }
    return Object.freeze({
      provenanceKind: ACCEPTED_TARGETED_RECOVERY_ACQUISITION,
      originalResult: freezeBinding(value.originalResult),
      originalRunRefSha256: value.originalRunRefSha256,
      recoveryResult: freezeBinding(value.recoveryResult),
      recoveryRunRefSha256: value.recoveryRunRefSha256,
      selection: Object.freeze({
        selectionBasis: EXPLICIT_ADJUDICATION_SELECTION,
        selectingAdjudication: freezeBinding(selection.selectingAdjudication),
        recoveryIsAcquisitionOfRecord: true,
      }),
    });
  }
  return refuseCrossGeneration(
    'ACQUISITION_OF_RECORD_INVALID',
    `${at} provenanceKind is not an explicit acquisition-of-record kind`,
  );
}

// ---------------------------------------------------------------------------
// C. ONE TERMINAL FACT.
// ---------------------------------------------------------------------------

export interface LocatedTerminalFact {
  readonly selectionIndex: number;
  readonly chainPosition: number;
  readonly fact: CrossGenerationTerminalFact;
}

function requireSealed(
  value: unknown,
  split: Split,
  at: string,
): A3SealedSd7DetailCommitment | null {
  if (value === null) return null;
  if (
    !isObject(value) ||
    !hasExactKeys(value, ['split', 'file', 'sha256', 'bytes']) ||
    !isSplit(value.split) ||
    typeof value.file !== 'string' ||
    !SEALED_DETAIL_BASENAME.test(value.file) ||
    !isHex(value.sha256) ||
    !isIntegerIn(value.bytes, 1, Number.MAX_SAFE_INTEGER)
  ) {
    return refuseCrossGeneration('FACT_PROVENANCE_INVALID', `${at} is not a basename commitment`);
  }
  if (value.split !== split) {
    refuseCrossGeneration('FACT_SPLIT_MISMATCH', `${at} names another split's sealed root`);
  }
  return Object.freeze({
    split: value.split,
    file: value.file,
    sha256: value.sha256,
    bytes: value.bytes,
  });
}

export function locateTerminalFact(
  raw: unknown,
  at: string,
  occupants: readonly CrossGenerationCurrentOccupant[],
  registry: AdjudicationRegistryIndex,
): LocatedTerminalFact {
  if (!isObject(raw)) refuseCrossGeneration('INPUT_SHAPE_INVALID', `${at} is not an object`);
  if (raw.factKind !== A2_TERMINAL_EVIDENCE_ADJUDICATION) {
    refuseCrossGeneration(
      'FACT_KIND_NOT_TERMINAL_ADJUDICATION',
      `${at} is not an ${A2_TERMINAL_EVIDENCE_ADJUDICATION} fact`,
    );
  }
  const factGenerationId = raw.factGenerationId;
  if (!(CROSS_GENERATION_IDS as readonly unknown[]).includes(factGenerationId)) {
    refuseCrossGeneration('FACT_GENERATION_INVALID', `${at} factGenerationId is not a generation`);
  }
  const generation = factGenerationId as CrossGenerationId;
  const adjudication = requireBinding(raw.adjudication, `${at}.adjudication`);
  requireIssuedBy(registry, adjudication, generation, `${at}.adjudication`);
  if (!isIntegerIn(raw.selectionIndex, 0, GENERATION_1_SELECTED_ORGANISATIONS - 1)) {
    refuseCrossGeneration('INPUT_SHAPE_INVALID', `${at} selectionIndex is not a frozen slot`);
  }
  const occupant = occupants[raw.selectionIndex]!;
  if (raw.split !== occupant.split) {
    refuseCrossGeneration('FACT_SPLIT_MISMATCH', `${at} split differs from its slot's split`);
  }
  const source = requireSourceShape(raw.occupant, `${at}.occupant`);
  const chainPosition = occupant.chain.findIndex((link) => sameSourceIdentity(link.source, source));
  if (chainPosition < 0) {
    refuseCrossGeneration(
      'FACT_OCCUPANT_NOT_IN_SLOT_CHAIN',
      `${at} names an occupant this slot never had`,
    );
  }
  if (occupantGenerationOf(source) === GENERATION2_ID && generation !== GENERATION2_ID) {
    refuseCrossGeneration(
      'FACT_GENERATION_CANNOT_AUTHORISE_OCCUPANT',
      `${at} a Generation-1 adjudication cannot authorise a Generation-2 reserve`,
    );
  }
  if (generation === GENERATION2_ID && chainPosition < occupant.generation1TerminalChainPosition) {
    refuseCrossGeneration(
      'FACT_GENERATION_CANNOT_AUTHORISE_OCCUPANT',
      `${at} a Generation-2 adjudication names an occupant Generation 1 already replaced`,
    );
  }
  if (!(A2_TERMINAL_DISPOSITIONS as readonly unknown[]).includes(raw.disposition)) {
    refuseCrossGeneration('FACT_DISPOSITION_INVALID', `${at} disposition is not a frozen token`);
  }
  if (!isHex(raw.runRefSha256)) {
    refuseCrossGeneration('FACT_PROVENANCE_INVALID', `${at}.runRefSha256 is not a SHA-256`);
  }
  if (
    typeof raw.acquisitionPolicyVersion !== 'string' ||
    !FETCH_POLICY_VERSION.test(raw.acquisitionPolicyVersion)
  ) {
    refuseCrossGeneration('FACT_PROVENANCE_INVALID', `${at}.acquisitionPolicyVersion malformed`);
  }
  const acquisitionOfRecord = requireAcquisitionOfRecord(
    raw.acquisitionOfRecord,
    adjudication,
    raw.runRefSha256,
    `${at}.acquisitionOfRecord`,
  );
  const transition =
    raw.acquisitionPolicyTransitionLedger === null
      ? null
      : requireBinding(
          raw.acquisitionPolicyTransitionLedger,
          `${at}.acquisitionPolicyTransitionLedger`,
        );
  const sealed = requireSealed(raw.sealedSd7Detail, occupant.split, `${at}.sealedSd7Detail`);
  const fact: CrossGenerationTerminalFact = Object.freeze({
    factKind: A2_TERMINAL_EVIDENCE_ADJUDICATION,
    factGenerationId: generation,
    selectionIndex: occupant.selectionIndex,
    split: occupant.split,
    occupant: occupant.chain[chainPosition]!.source,
    disposition: raw.disposition as A2TerminalDisposition,
    adjudication,
    acquisitionOfRecord,
    runRefSha256: raw.runRefSha256,
    acquisitionPolicyVersion: raw.acquisitionPolicyVersion,
    acquisitionPolicyTransitionLedger: transition,
    sealedSd7Detail: sealed,
  });
  return Object.freeze({ selectionIndex: occupant.selectionIndex, chainPosition, fact });
}

// ---------------------------------------------------------------------------
// D. CARRY-FORWARD ADMISSIONS.
// ---------------------------------------------------------------------------

const ADMISSION_KEYS = [
  'admissionKind',
  'fromGenerationId',
  'toGenerationId',
  'admissionRecord',
  'selectionIndex',
  'split',
  'occupant',
  'generation1Adjudication',
  'acquisitionOfRecordResult',
  'runRefSha256',
  'acquisitionPolicyVersion',
  'acquisitionPolicyTransitionLedger',
  'accepted',
] as const;

/**
 * Validates every admission against the derived chains and the located
 * terminal facts. Returns the genuine admission per slot. An admission for a
 * superseded occupant, for another occupant, for a different run / policy /
 * adjudication / result / transition binding, or for anything not a
 * Generation-1 success is refused.
 */
export function admitCarryForwards(
  input: CrossGenerationResolutionInput,
  occupants: readonly CrossGenerationCurrentOccupant[],
  registry: AdjudicationRegistryIndex,
  terminalBySlot: ReadonlyMap<number, ReadonlyMap<number, CrossGenerationTerminalFact>>,
): ReadonlyMap<number, CarryForwardAdmission> {
  if (!Array.isArray(input.carryForwardAdmissions)) {
    refuseCrossGeneration('INPUT_SHAPE_INVALID', 'carryForwardAdmissions must be an array');
  }
  const admitted = new Map<number, CarryForwardAdmission>();
  input.carryForwardAdmissions.forEach((raw, i) => {
    const at = `carryForwardAdmissions[${String(i)}]`;
    if (
      !isObject(raw) ||
      !hasExactKeys(raw, ADMISSION_KEYS) ||
      raw.admissionKind !== GENERATION1_TO_GENERATION2_CARRY_FORWARD_ADMISSION ||
      raw.fromGenerationId !== GENERATION1_ID ||
      raw.toGenerationId !== GENERATION2_ID ||
      raw.accepted !== true ||
      !isRecordBinding(raw.admissionRecord) ||
      !isRecordBinding(raw.generation1Adjudication) ||
      !isRecordBinding(raw.acquisitionOfRecordResult) ||
      !isHex(raw.runRefSha256) ||
      typeof raw.acquisitionPolicyVersion !== 'string' ||
      !FETCH_POLICY_VERSION.test(raw.acquisitionPolicyVersion) ||
      !(
        raw.acquisitionPolicyTransitionLedger === null ||
        isRecordBinding(raw.acquisitionPolicyTransitionLedger)
      ) ||
      !isIntegerIn(raw.selectionIndex, 0, GENERATION_1_SELECTED_ORGANISATIONS - 1)
    ) {
      return refuseCrossGeneration(
        'CARRY_FORWARD_ADMISSION_INVALID',
        `${at} is not an accepted Generation-1 -> Generation-2 carry-forward admission`,
      );
    }
    const source = requireSourceShape(raw.occupant, `${at}.occupant`);
    if (occupantGenerationOf(source) !== GENERATION1_ID) {
      refuseCrossGeneration(
        'CARRY_FORWARD_ADMISSION_INVALID',
        `${at} admits a Generation-2 reserve, which has no Generation-1 acquisition to carry`,
      );
    }
    requireIssuedBy(
      registry,
      raw.generation1Adjudication,
      GENERATION1_ID,
      `${at}.generation1Adjudication`,
    );
    if (admitted.has(raw.selectionIndex)) {
      refuseCrossGeneration('CARRY_FORWARD_ADMISSION_DUPLICATE', `${at} admits a slot twice`);
    }
    const occupant = occupants[raw.selectionIndex]!;
    if (raw.split !== occupant.split) {
      refuseCrossGeneration('CARRY_FORWARD_ADMISSION_MISMATCH', `${at} split is not its slot's`);
    }
    const terminalPosition = occupant.generation1TerminalChainPosition;
    const terminal = occupant.chain[terminalPosition]!;
    if (!sameSourceIdentity(terminal.source, source)) {
      refuseCrossGeneration(
        'CARRY_FORWARD_ADMISSION_MISMATCH',
        `${at} names an occupant that is not its slot's Generation-1 terminal occupant`,
      );
    }
    if (occupant.chain.length - 1 !== terminalPosition) {
      refuseCrossGeneration(
        'CARRY_FORWARD_SUPERSEDED',
        `${at} claims a carried occupant a Generation-2 transition has superseded`,
      );
    }
    const fact = terminalBySlot.get(raw.selectionIndex)?.get(terminalPosition);
    if (
      fact === undefined ||
      fact.factGenerationId !== GENERATION1_ID ||
      fact.disposition !== A2_ACQUISITION_SUCCESSFUL ||
      !sameBinding(fact.adjudication, raw.generation1Adjudication) ||
      !sameBinding(
        acquisitionOfRecordResultOf(fact.acquisitionOfRecord),
        raw.acquisitionOfRecordResult,
      ) ||
      fact.runRefSha256 !== raw.runRefSha256 ||
      fact.acquisitionPolicyVersion !== raw.acquisitionPolicyVersion ||
      !sameBinding(fact.acquisitionPolicyTransitionLedger, raw.acquisitionPolicyTransitionLedger) ||
      sourceIdentityKey(fact.occupant) !== sourceIdentityKey(source)
    ) {
      refuseCrossGeneration(
        'CARRY_FORWARD_ADMISSION_MISMATCH',
        `${at} does not carry exactly its occupant's Generation-1 successful acquisition (adjudication, result, run, policy and transition binding unchanged)`,
      );
    }
    admitted.set(
      raw.selectionIndex,
      Object.freeze({
        admissionKind: GENERATION1_TO_GENERATION2_CARRY_FORWARD_ADMISSION,
        fromGenerationId: GENERATION1_ID,
        toGenerationId: GENERATION2_ID,
        admissionRecord: freezeBinding(raw.admissionRecord),
        selectionIndex: occupant.selectionIndex,
        split: occupant.split,
        occupant: terminal.source as CarryForwardAdmission['occupant'],
        generation1Adjudication: freezeBinding(raw.generation1Adjudication),
        acquisitionOfRecordResult: freezeBinding(raw.acquisitionOfRecordResult),
        runRefSha256: raw.runRefSha256,
        acquisitionPolicyVersion: raw.acquisitionPolicyVersion,
        acquisitionPolicyTransitionLedger:
          raw.acquisitionPolicyTransitionLedger === null
            ? null
            : freezeBinding(raw.acquisitionPolicyTransitionLedger),
        accepted: true,
      }),
    );
  });
  return admitted;
}
