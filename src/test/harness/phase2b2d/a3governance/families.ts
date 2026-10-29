/**
 * PHASE 2B-2D — A3 R19: THE EXACT A2 GOVERNANCE RECORD FAMILY PARSERS.
 *
 * R18 found that the committed A2 adjudications are HETEROGENEOUS: three
 * families share the recordKind `LIVE_WINDOW_EVIDENCE_ADJUDICATION` and do not
 * share an item shape, one family carries its disposition in a composed second
 * record, and one carries a coarse `ACQUISITION_UNSUCCESSFUL` beside a
 * separately frozen replacement reason.
 *
 * So there is ONE PARSER PER FAMILY, selected by REGISTRY ID, and no generic
 * "find the fields with these names" fallback. A record from another family
 * must not accidentally parse because it has similarly named fields, which is
 * why every parser checks its family's own discriminators - recordKind,
 * recordId, generationId, owner-decision semantics, exact item collection
 * shape and required binding fields - before it reads a single disposition.
 *
 * DISPOSITION AUTHORITY
 *
 *   Only an owner / evidence adjudication produces a terminal disposition, and
 *   only from the field that family made authoritative. Never from
 *   `diagnosticSd9`, a live result's `finalSd9`, an observation's `sd9Status`,
 *   `LIKELY_SUCCESSFUL`, `ACQUISITION_STATUS_PENDING_CAPABILITY_REVIEW`,
 *   `ACQUISITION_STATUS_PENDING_SD7`, a strategy, a plan or a live authority.
 *
 *   A failure's formal SD9 and its frozen adjudicated REPLACEMENT REASON are
 *   not always the same token - P:18's SD9 was MIN_PAGES_NOT_MET while its
 *   terminal adjudication under Owner Clarification Q3 was HOST_UNREACHABLE -
 *   so families that carry both are parsed as carrying both, and the frozen
 *   owner disposition wins.
 *
 * THIS MODULE IS PURE. Its input is already-verified parsed JSON.
 */
import { refuse } from './refusal.js';
import type { VerifiedGovernance, VerifiedGovernanceFile } from './loader.js';
import { requireFile } from './loader.js';

const LOWER_HEX_SHA256 = /^[0-9a-f]{64}$/;
const FETCH_POLICY_VERSION = /^orgunit-fetch-policy-v[1-9][0-9]*$/;
const SEALED_DETAIL_BASENAME = /^[A-Za-z0-9_.-]+\.json$/;

export const GENERATION_ID = 'METHODOLOGY_V2_GEN1';

export const ACQUISITION_SUCCESSFUL = 'ACQUISITION_SUCCESSFUL';

export const UNSUCCESSFUL_DISPOSITIONS = Object.freeze([
  'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET',
  'ACQUISITION_UNSUCCESSFUL_ROOT_AUTHORITY_FAILURE',
  'ACQUISITION_UNSUCCESSFUL_ROBOTS_DISALLOWED',
  'ACQUISITION_UNSUCCESSFUL_HOST_UNREACHABLE',
] as const);
export type UnsuccessfulDisposition = (typeof UNSUCCESSFUL_DISPOSITIONS)[number];
export type TerminalDisposition = typeof ACQUISITION_SUCCESSFUL | UnsuccessfulDisposition;

/** Tokens that LOOK like a verdict and are never allowed to become one. */
export const NON_ADJUDICATIVE_STATUS_TOKENS = Object.freeze([
  'LIKELY_SUCCESSFUL',
  'PENDING_CAPABILITY_REVIEW',
  'ACQUISITION_STATUS_PENDING_CAPABILITY_REVIEW',
  'ACQUISITION_STATUS_PENDING_SD7',
  'ACQUISITION_UNSUCCESSFUL',
] as const);

export type OccupantKind = 'PRIMARY' | 'RESERVE_REPLACEMENT';

export interface SealedDetailCommitment {
  readonly file: string;
  readonly sha256: string;
  readonly bytes: number;
}

/** The occupancy episode a record names: a slot plus WHO occupied it. */
export interface EpisodeRef {
  readonly selectionIndex: number;
  readonly occupantKind: OccupantKind;
  readonly reserveRankPosition: number | null;
}

/** One run reference a registered record binds to one occupancy episode. */
export interface EpisodeRunClaim extends EpisodeRef {
  readonly runRefSha256: string;
  readonly sourceRegistryId: string;
}

/**
 * One parsed terminal fact candidate. Whether it is CURRENT is decided later,
 * from the draw, the validated ledger and the transition graph - never here,
 * and never from a filename, a commit date or an array position.
 */
export interface ParsedTerminalItem extends EpisodeRef {
  readonly sourceRegistryId: string;
  readonly split: string;
  /** The record's own digest, when it states one. Cross-checked against the draw. */
  readonly declaredDrawEntrySha256: string | null;
  readonly runRefSha256: string;
  readonly acquisitionPolicyVersion: string;
  readonly disposition: TerminalDisposition;
  /**
   * The frozen replacement reason this family derived under Owner
   * Clarification Q3, when it carries one separately from the disposition.
   */
  readonly replacementReason: UnsuccessfulDisposition | null;
  readonly liveResultRegistryId: string;
  readonly sealedSd7Detail: SealedDetailCommitment | null;
}

/** A frozen unsuccessful reason for an occupant that no longer occupies its slot. */
export interface ParsedHistoricalReason extends EpisodeRef {
  readonly sourceRegistryId: string;
  readonly reason: UnsuccessfulDisposition;
}

export interface ParsedFamilyOutput {
  readonly terminalItems: readonly ParsedTerminalItem[];
  readonly runClaims: readonly EpisodeRunClaim[];
  readonly historicalReasons: readonly ParsedHistoricalReason[];
}

const EMPTY: ParsedFamilyOutput = Object.freeze({
  terminalItems: Object.freeze([]),
  runClaims: Object.freeze([]),
  historicalReasons: Object.freeze([]),
});

// ---------------------------------------------------------------------------
// Shared strict readers. Every one of them refuses rather than coercing.
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function obj(value: unknown, at: string): Record<string, unknown> {
  if (!isObject(value)) {
    refuse('GOVERNANCE_FAMILY_RECORD_SHAPE_INVALID', `${at} is not an object`);
  }
  return value;
}

function arr(value: unknown, at: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    refuse('GOVERNANCE_FAMILY_RECORD_SHAPE_INVALID', `${at} is not an array`);
  }
  return value;
}

function str(value: unknown, at: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    refuse('GOVERNANCE_FAMILY_ITEM_SHAPE_INVALID', `${at} is not a non-empty string`);
  }
  return value;
}

function hex(value: unknown, at: string): string {
  if (typeof value !== 'string' || !LOWER_HEX_SHA256.test(value)) {
    refuse('GOVERNANCE_FAMILY_ITEM_SHAPE_INVALID', `${at} is not a lower-hex SHA-256`);
  }
  return value;
}

function int(value: unknown, at: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    refuse('GOVERNANCE_FAMILY_ITEM_SHAPE_INVALID', `${at} is not an integer in range`);
  }
  return value;
}

function requireTrue(value: unknown, at: string): void {
  if (value !== true) {
    refuse('GOVERNANCE_FAMILY_RECORD_SHAPE_INVALID', `${at} is not declared true`);
  }
}

function requireFalse(value: unknown, at: string): void {
  if (value !== false) {
    refuse('GOVERNANCE_FAMILY_RECORD_SHAPE_INVALID', `${at} is not declared false`);
  }
}

function policyVersion(value: unknown, at: string): string {
  const version = str(value, at);
  if (!FETCH_POLICY_VERSION.test(version)) {
    refuse('GOVERNANCE_FAMILY_ITEM_SHAPE_INVALID', `${at} is not a fetch-policy version`);
  }
  return version;
}

function unsuccessful(value: unknown, at: string): UnsuccessfulDisposition {
  if (!(UNSUCCESSFUL_DISPOSITIONS as readonly unknown[]).includes(value)) {
    refuse(
      'GOVERNANCE_FAMILY_DISPOSITION_INVALID',
      `${at} is not one of the four frozen unsuccessful reasons`,
    );
  }
  return value as UnsuccessfulDisposition;
}

/** A terminal disposition, refusing every pending / diagnostic / coarse token by name. */
function terminal(value: unknown, at: string): TerminalDisposition {
  if ((NON_ADJUDICATIVE_STATUS_TOKENS as readonly unknown[]).includes(value)) {
    refuse(
      'NON_ADJUDICATIVE_SOURCE_USED_AS_DISPOSITION',
      `${at} is a pending or coarse status token, not a terminal disposition`,
    );
  }
  if (value === ACQUISITION_SUCCESSFUL) return ACQUISITION_SUCCESSFUL;
  return unsuccessful(value, at);
}

/** The generation discriminator every family must carry. */
function requireGeneration(record: Record<string, unknown>, at: string): void {
  if (record.generationId !== GENERATION_ID) {
    refuse('GOVERNANCE_FAMILY_RECORD_SHAPE_INVALID', `${at} names another generation`);
  }
}

/** A record that authorises nothing must SAY so; every one of these does. */
function requireAuthorisesNothing(record: Record<string, unknown>, at: string): void {
  const authorises = arr(record.thisFileAuthorises, `${at}.thisFileAuthorises`);
  if (authorises.length !== 0) {
    refuse('GOVERNANCE_FAMILY_RECORD_SHAPE_INVALID', `${at} claims to authorise something`);
  }
}

function requireOwnerDecision(record: Record<string, unknown>, decision: string, at: string): void {
  const decisions = arr(record.ownerDecisions, `${at}.ownerDecisions`);
  if (!decisions.includes(decision)) {
    refuse(
      'GOVERNANCE_FAMILY_RECORD_SHAPE_INVALID',
      `${at} does not carry the owner decision this family requires`,
    );
  }
}

/**
 * A sealed-detail commitment is carried ONLY when the public record already
 * states a basename, a digest and a byte count. Where a family sealed per
 * split rather than per slot, or published no basename, the commitment is
 * `null`: R17 supports null, and nothing is manufactured. Nothing here opens
 * the file or resolves a split-scoped root.
 */
function sealedDetail(value: unknown, at: string): SealedDetailCommitment | null {
  if (value === null || value === undefined) return null;
  const detail = obj(value, at);
  if (typeof detail.file !== 'string' || !SEALED_DETAIL_BASENAME.test(detail.file)) return null;
  if (typeof detail.sha256 !== 'string' || !LOWER_HEX_SHA256.test(detail.sha256)) return null;
  if (typeof detail.bytes !== 'number' || !Number.isInteger(detail.bytes) || detail.bytes <= 0) {
    return null;
  }
  return Object.freeze({ file: detail.file, sha256: detail.sha256, bytes: detail.bytes });
}

/**
 * Proves that a record's own binding to an observation record names the EXACT
 * registered observation. A parser never invents a live result, and never
 * accepts one the registry does not hold.
 */
function boundObservation(
  governance: VerifiedGovernance,
  declared: unknown,
  registryId: string,
  at: string,
): string {
  const binding = obj(declared, at);
  const registered: VerifiedGovernanceFile = requireFile(governance, registryId);
  if (binding.path !== registered.entry.path) {
    refuse(
      'GOVERNANCE_FAMILY_RECORD_SHAPE_INVALID',
      `${at} path is not the registered observation`,
    );
  }
  if (binding.sha256 !== registered.sha256) {
    refuse(
      'REGISTERED_GOVERNANCE_FILE_DRIFT',
      `${at} SHA-256 is not the registered observation's exact bytes`,
    );
  }
  return registryId;
}

/** `R:<slot>:<reserve>` or `P:<slot>`, parsed as the occupant declaration it is. */
function occupantFromWorkItemId(
  workItemId: string,
  selectionIndex: number,
  reserveRankPosition: number | null,
  at: string,
): OccupantKind {
  const replacement = /^R:(\d+):(\d+)$/.exec(workItemId);
  const primary = /^P:(\d+)$/.exec(workItemId);
  if (replacement !== null) {
    if (
      Number(replacement[1]) !== selectionIndex ||
      reserveRankPosition === null ||
      Number(replacement[2]) !== reserveRankPosition
    ) {
      refuse(
        'REDUNDANT_FIELD_CONFLICTS_WITH_STRUCTURAL_SOURCE',
        `${at} workItemId disagrees with its own selection index or reserve position`,
      );
    }
    return 'RESERVE_REPLACEMENT';
  }
  if (primary !== null) {
    if (Number(primary[1]) !== selectionIndex || reserveRankPosition !== null) {
      refuse(
        'REDUNDANT_FIELD_CONFLICTS_WITH_STRUCTURAL_SOURCE',
        `${at} workItemId disagrees with its own selection index or reserve position`,
      );
    }
    return 'PRIMARY';
  }
  return refuse(
    'GOVERNANCE_FAMILY_OCCUPANT_UNDECLARED',
    `${at} workItemId is not P:<n> or R:<n>:<r>`,
  );
}

// ---------------------------------------------------------------------------
// FAMILY 1 — Batch-01 per-slot acquisition attribution owner adjudication.
// ---------------------------------------------------------------------------

function parseBatch01Attribution(
  governance: VerifiedGovernance,
  registryId: string,
): ParsedFamilyOutput {
  const record = requireFile(governance, registryId).parsed;
  const at = registryId;
  requireGeneration(record, at);
  requireAuthorisesNothing(record, at);
  requireTrue(record.appendOnly, `${at}.appendOnly`);
  requireFalse(record.isLiveAuthority, `${at}.isLiveAuthority`);
  const scope = obj(record.scope, `${at}.scope`);
  const scoped = arr(scope.selectionIndices, `${at}.scope.selectionIndices`);
  requireTrue(scope.noOtherSlotIsCoveredOrChanged, `${at}.scope.noOtherSlotIsCoveredOrChanged`);

  const items = arr(record.items, `${at}.items`);
  if (items.length !== scoped.length) {
    refuse('GOVERNANCE_FAMILY_RECORD_SHAPE_INVALID', `${at} item count is not its declared scope`);
  }
  const terminalItems = items.map((raw, index) => {
    const itemAt = `${at}.items[${String(index)}]`;
    const item = obj(raw, itemAt);
    if (item.generationId !== GENERATION_ID) {
      refuse('GOVERNANCE_FAMILY_ITEM_SHAPE_INVALID', `${itemAt} names another generation`);
    }
    const selectionIndex = int(item.selectionIndex, `${itemAt}.selectionIndex`, 0, 109);
    if (!scoped.includes(selectionIndex)) {
      refuse('GOVERNANCE_FAMILY_ITEM_SHAPE_INVALID', `${itemAt} is outside the declared scope`);
    }
    if (item.occupantKind !== 'PRIMARY' || item.reserveRankPosition !== null) {
      refuse(
        'GOVERNANCE_FAMILY_OCCUPANT_UNDECLARED',
        `${itemAt} is not the explicit PRIMARY shape this family declares`,
      );
    }
    if (item.drawEntryKind !== 'SELECTION' || item.currentOccupant !== 'ORIGINAL_SELECTION') {
      refuse(
        'GOVERNANCE_FAMILY_OCCUPANT_UNDECLARED',
        `${itemAt} does not declare the original selection occupant`,
      );
    }
    const disposition = terminal(item.disposition, `${itemAt}.disposition`);
    if (item.finalAdjudication !== disposition) {
      refuse(
        'GOVERNANCE_FAMILY_COMPOSITION_INCONSISTENT',
        `${itemAt} finalAdjudication differs from its own disposition`,
      );
    }
    const binding = obj(item.observationBinding, `${itemAt}.observationBinding`);
    if (item.acquisitionPolicyTransitionLedger !== null) {
      refuse(
        'GOVERNANCE_FAMILY_ITEM_SHAPE_INVALID',
        `${itemAt} declares a transition ledger this family never binds`,
      );
    }
    return Object.freeze({
      sourceRegistryId: registryId,
      selectionIndex,
      occupantKind: 'PRIMARY' as const,
      reserveRankPosition: null,
      split: str(item.split, `${itemAt}.split`),
      declaredDrawEntrySha256: hex(item.drawEntrySha256, `${itemAt}.drawEntrySha256`),
      runRefSha256: hex(item.runRefSha256, `${itemAt}.runRefSha256`),
      acquisitionPolicyVersion: policyVersion(
        item.acquisitionPolicyVersion,
        `${itemAt}.acquisitionPolicyVersion`,
      ),
      disposition,
      replacementReason: null,
      liveResultRegistryId: boundObservation(
        governance,
        binding.liveResult,
        'BATCH01_EXECUTION_RECORD',
        `${itemAt}.observationBinding.liveResult`,
      ),
      sealedSd7Detail: sealedDetail(
        obj(item.formalSd7, `${itemAt}.formalSd7`).sealedDetail,
        `${itemAt}.formalSd7.sealedDetail`,
      ),
    });
  });
  return Object.freeze({
    terminalItems: Object.freeze(terminalItems),
    runClaims: Object.freeze(
      terminalItems.map((item) =>
        Object.freeze({
          selectionIndex: item.selectionIndex,
          occupantKind: item.occupantKind,
          reserveRankPosition: item.reserveRankPosition,
          runRefSha256: item.runRefSha256,
          sourceRegistryId: registryId,
        }),
      ),
    ),
    historicalReasons: Object.freeze([]),
  });
}

// ---------------------------------------------------------------------------
// FAMILY 2 — Option B: an owner adjudication COMPOSED with its measurement of
// record. Neither record alone carries the whole fact: the adjudication holds
// the owner decision and the observation binding, the measurement holds the
// selection index, the run of record and the SD9 status. The composition is
// explicit here, for this family only.
// ---------------------------------------------------------------------------

function parseOptionBComposed(governance: VerifiedGovernance): ParsedFamilyOutput {
  const adjudicationId = 'OPTION_B_REVALIDATION_ADJUDICATION';
  const measurementId = 'OPTION_B_TRANSITION_SD7_MEASUREMENT_OF_RECORD';
  const adjudication = requireFile(governance, adjudicationId).parsed;
  const measurement = requireFile(governance, measurementId).parsed;
  const aAt = adjudicationId;
  const mAt = measurementId;

  const ADJUDICATION_DECISION = 'AUTHORISE_SELECTION_INDEX_5_ACQUISITION_EVIDENCE_ADJUDICATION_V1';
  const MEASUREMENT_DECISION = 'AUTHORISE_TARGETED_V2_RUN_SD7_MEASUREMENT_OF_RECORD_V1';
  requireOwnerDecision(adjudication, ADJUDICATION_DECISION, aAt);
  requireOwnerDecision(adjudication, MEASUREMENT_DECISION, aAt);
  requireOwnerDecision(measurement, ADJUDICATION_DECISION, mAt);
  requireOwnerDecision(measurement, MEASUREMENT_DECISION, mAt);
  requireTrue(adjudication.liveRevalidationAccepted, `${aAt}.liveRevalidationAccepted`);

  // The measurement must bind the adjudication's exact bytes, so that the
  // composition is proved from the records and not assumed by this parser.
  const adjudicationFile = requireFile(governance, adjudicationId);
  const boundInputs = arr(measurement.boundInputs, `${mAt}.boundInputs`);
  const boundToAdjudication = boundInputs.some(
    (input) =>
      isObject(input) &&
      input.path === adjudicationFile.entry.path &&
      input.sha256 === adjudicationFile.sha256,
  );
  if (!boundToAdjudication) {
    refuse(
      'GOVERNANCE_FAMILY_COMPOSITION_INCONSISTENT',
      `${mAt} does not bind the Option-B adjudication's exact bytes`,
    );
  }

  const formal = obj(
    measurement.formalSd7MeasurementOfRecord,
    `${mAt}.formalSd7MeasurementOfRecord`,
  );
  requireTrue(
    formal.thisIsAMeasurementOfRecordNotADiagnostic,
    `${mAt}.formalSd7MeasurementOfRecord.thisIsAMeasurementOfRecordNotADiagnostic`,
  );
  const aor = obj(measurement.acquisitionOfRecord, `${mAt}.acquisitionOfRecord`);
  const selectionIndex = int(
    formal.selectionIndex,
    `${mAt}.formalSd7MeasurementOfRecord.selectionIndex`,
    0,
    109,
  );
  if (aor.selectionIndex !== selectionIndex) {
    refuse(
      'GOVERNANCE_FAMILY_COMPOSITION_INCONSISTENT',
      `${mAt} measurement and acquisition-of-record name different slots`,
    );
  }

  // The occupant is declared structurally by BOTH records, not inferred.
  requireFalse(
    adjudication[`selectionIndex${String(selectionIndex)}ReserveReplacement`],
    `${aAt}.selectionIndex${String(selectionIndex)}ReserveReplacement`,
  );
  requireTrue(
    adjudication[`selectionIndex${String(selectionIndex)}RetainsItsOriginalOrganisation`],
    `${aAt}.selectionIndex${String(selectionIndex)}RetainsItsOriginalOrganisation`,
  );
  requireTrue(
    adjudication[`selectionIndex${String(selectionIndex)}V2EvidenceEligibleForAcquisitionOfRecord`],
    `${aAt}.selectionIndex${String(selectionIndex)}V2EvidenceEligibleForAcquisitionOfRecord`,
  );
  if (adjudication.reserveConsumption !== 0 || adjudication.replacementLedgerEntry !== 'NONE') {
    refuse(
      'GOVERNANCE_FAMILY_OCCUPANT_UNDECLARED',
      `${aAt} does not declare zero reserve consumption`,
    );
  }
  if (aor.reserveConsumption !== 0 || aor.replacementLedgerEntry !== 'NONE') {
    refuse(
      'GOVERNANCE_FAMILY_OCCUPANT_UNDECLARED',
      `${mAt} does not declare zero reserve consumption`,
    );
  }
  requireTrue(aor.organisationRetained, `${mAt}.acquisitionOfRecord.organisationRetained`);
  requireTrue(aor.selectionIndexRetained, `${mAt}.acquisitionOfRecord.selectionIndexRetained`);

  const disposition = terminal(aor.status, `${mAt}.acquisitionOfRecord.status`);
  if (formal.sd9Status !== disposition) {
    refuse(
      'GOVERNANCE_FAMILY_COMPOSITION_INCONSISTENT',
      `${mAt} measured SD9 status differs from its acquisition-of-record status`,
    );
  }
  const version = policyVersion(aor.policyVersion, `${mAt}.acquisitionOfRecord.policyVersion`);
  if (formal.acquisitionOfRecordPolicyVersion !== version) {
    refuse(
      'GOVERNANCE_FAMILY_COMPOSITION_INCONSISTENT',
      `${mAt} measured policy version differs from its acquisition-of-record policy version`,
    );
  }
  const measuredRun = hex(
    formal.measuredRunOpaqueRef,
    `${mAt}.formalSd7MeasurementOfRecord.measuredRunOpaqueRef`,
  );
  const supersededRun = hex(
    formal.supersededRunOpaqueRef,
    `${mAt}.formalSd7MeasurementOfRecord.supersededRunOpaqueRef`,
  );
  if (measuredRun === supersededRun) {
    refuse('GOVERNANCE_FAMILY_COMPOSITION_INCONSISTENT', `${mAt} supersedes a run by itself`);
  }
  const evidence = obj(adjudication.boundEvidence, `${aAt}.boundEvidence`);
  const liveResultRegistryId = boundObservation(
    governance,
    evidence.targetedRevalidationResult,
    'OPTION_B_TARGETED_REVALIDATION_RESULT',
    `${aAt}.boundEvidence.targetedRevalidationResult`,
  );

  const episode = { selectionIndex, occupantKind: 'PRIMARY' as const, reserveRankPosition: null };
  return Object.freeze({
    terminalItems: Object.freeze([
      Object.freeze({
        ...episode,
        sourceRegistryId: adjudicationId,
        split: str(formal.split, `${mAt}.formalSd7MeasurementOfRecord.split`),
        declaredDrawEntrySha256: null,
        runRefSha256: measuredRun,
        acquisitionPolicyVersion: version,
        disposition,
        replacementReason: null,
        liveResultRegistryId,
        // The measurement seals PER SPLIT, with no basename: R17 takes null.
        sealedSd7Detail: sealedDetail(
          measurement.sealedDetailedArtifact,
          `${mAt}.sealedDetailedArtifact`,
        ),
      }),
    ]),
    runClaims: Object.freeze([
      Object.freeze({ ...episode, runRefSha256: measuredRun, sourceRegistryId: measurementId }),
      Object.freeze({ ...episode, runRefSha256: supersededRun, sourceRegistryId: measurementId }),
    ]),
    historicalReasons: Object.freeze([]),
  });
}

// ---------------------------------------------------------------------------
// FAMILY 3 — Option C-lite revalidation adjudication: a `perIndex` collection
// with an explicit old / new acquisition of record per selection index.
// ---------------------------------------------------------------------------

function parseOptionCLite(governance: VerifiedGovernance): ParsedFamilyOutput {
  const registryId = 'OPTION_C_LITE_REVALIDATION_ADJUDICATION';
  const record = requireFile(governance, registryId).parsed;
  const at = registryId;
  requireGeneration(record, at);
  requireAuthorisesNothing(record, at);
  const adjudication = obj(record.adjudication, `${at}.adjudication`);
  if (adjudication.verdict !== 'OPTION_C_LITE_LIVE_REVALIDATION_ACCEPTED') {
    refuse(
      'GOVERNANCE_FAMILY_RECORD_SHAPE_INVALID',
      `${at} verdict is not this family's acceptance`,
    );
  }
  const applies = arr(
    adjudication.appliesToSelectionIndices,
    `${at}.adjudication.appliesToSelectionIndices`,
  );

  // The occupant is declared structurally: nothing here was a replacement.
  const reserveState = obj(record.reserveState, `${at}.reserveState`);
  requireFalse(reserveState.replacementPerformed, `${at}.reserveState.replacementPerformed`);
  requireFalse(reserveState.organisationChanged, `${at}.reserveState.organisationChanged`);
  requireFalse(reserveState.selectionIndexChanged, `${at}.reserveState.selectionIndexChanged`);
  requireFalse(reserveState.splitChanged, `${at}.reserveState.splitChanged`);
  requireFalse(
    reserveState.reserveLedgerEntryCreated,
    `${at}.reserveState.reserveLedgerEntryCreated`,
  );
  if (record.reserveConsumption !== 0 || reserveState.reserveConsumption !== 0) {
    refuse(
      'GOVERNANCE_FAMILY_OCCUPANT_UNDECLARED',
      `${at} does not declare zero reserve consumption`,
    );
  }

  const liveResultRegistryId = boundObservation(
    governance,
    record.boundRevalidationResult,
    'OPTION_C_LITE_TARGETED_REVALIDATION_RESULT',
    `${at}.boundRevalidationResult`,
  );

  const perIndex = arr(record.perIndex, `${at}.perIndex`);
  if (perIndex.length !== applies.length) {
    refuse(
      'GOVERNANCE_FAMILY_RECORD_SHAPE_INVALID',
      `${at} perIndex length is not its declared selection-index scope`,
    );
  }
  const terminalItems: ParsedTerminalItem[] = [];
  const runClaims: EpisodeRunClaim[] = [];
  perIndex.forEach((raw, index) => {
    const itemAt = `${at}.perIndex[${String(index)}]`;
    const item = obj(raw, itemAt);
    const selectionIndex = int(item.selectionIndex, `${itemAt}.selectionIndex`, 0, 109);
    if (!applies.includes(selectionIndex)) {
      refuse('GOVERNANCE_FAMILY_ITEM_SHAPE_INVALID', `${itemAt} is outside the declared scope`);
    }
    const older = obj(item.oldAcquisitionOfRecord, `${itemAt}.oldAcquisitionOfRecord`);
    const newer = obj(item.newAcquisitionOfRecord, `${itemAt}.newAcquisitionOfRecord`);
    if (older.disposition !== 'SUPERSEDED_FOR_GENERATION_ACQUISITION_DECISION_BY_POLICY_REPAIR') {
      refuse(
        'GOVERNANCE_FAMILY_ITEM_SHAPE_INVALID',
        `${itemAt} does not declare its previous run superseded`,
      );
    }
    const disposition = terminal(newer.sd9, `${itemAt}.newAcquisitionOfRecord.sd9`);
    const version = policyVersion(
      newer.policyVersion,
      `${itemAt}.newAcquisitionOfRecord.policyVersion`,
    );
    // The record restates both facts at the top level; they must agree.
    if (record[`selectionIndex${String(selectionIndex)}Sd9`] !== disposition) {
      refuse(
        'GOVERNANCE_FAMILY_COMPOSITION_INCONSISTENT',
        `${itemAt} SD9 differs from the record's own per-index restatement`,
      );
    }
    if (record[`selectionIndex${String(selectionIndex)}AcquisitionOfRecordPolicy`] !== version) {
      refuse(
        'GOVERNANCE_FAMILY_COMPOSITION_INCONSISTENT',
        `${itemAt} policy differs from the record's own per-index restatement`,
      );
    }
    const episode = { selectionIndex, occupantKind: 'PRIMARY' as const, reserveRankPosition: null };
    const newRun = hex(newer.runOpaqueRef, `${itemAt}.newAcquisitionOfRecord.runOpaqueRef`);
    const oldRun = hex(older.runOpaqueRef, `${itemAt}.oldAcquisitionOfRecord.runOpaqueRef`);
    terminalItems.push(
      Object.freeze({
        ...episode,
        sourceRegistryId: registryId,
        split: str(item.split, `${itemAt}.split`),
        declaredDrawEntrySha256: null,
        runRefSha256: newRun,
        acquisitionPolicyVersion: version,
        disposition,
        replacementReason: null,
        liveResultRegistryId,
        sealedSd7Detail: null,
      }),
    );
    runClaims.push(
      Object.freeze({ ...episode, runRefSha256: newRun, sourceRegistryId: registryId }),
      Object.freeze({ ...episode, runRefSha256: oldRun, sourceRegistryId: registryId }),
    );
  });
  return Object.freeze({
    terminalItems: Object.freeze(terminalItems),
    runClaims: Object.freeze(runClaims),
    historicalReasons: Object.freeze([]),
  });
}

// ---------------------------------------------------------------------------
// FAMILY 4 — V4 bounded transport revalidation adjudication. It binds run
// SUPERSESSION for three primaries and NOTHING ELSE: its `sd9` values are the
// formal SD9 of runs whose later frozen replacement reason, under Owner
// Clarification Q3, is a DIFFERENT token. Reading a disposition here would
// contradict the owner's own precedence, so this parser emits none.
// ---------------------------------------------------------------------------

function parseV4TransportRevalidation(governance: VerifiedGovernance): ParsedFamilyOutput {
  const registryId = 'V4_TRANSPORT_REVALIDATION_ADJUDICATION';
  const record = requireFile(governance, registryId).parsed;
  const at = registryId;
  requireGeneration(record, at);
  requireAuthorisesNothing(record, at);
  const adjudication = obj(record.adjudication, `${at}.adjudication`);
  if (adjudication.verdict !== 'V4_TARGETED_TRANSPORT_REVALIDATION_EVIDENCE_ACCEPTED') {
    refuse(
      'GOVERNANCE_FAMILY_RECORD_SHAPE_INVALID',
      `${at} verdict is not this family's acceptance`,
    );
  }
  const applies = arr(
    adjudication.appliesToSelectionIndices,
    `${at}.adjudication.appliesToSelectionIndices`,
  );
  const reserveRule = obj(record.reserveRule, `${at}.reserveRule`);
  requireFalse(
    reserveRule.reserveTransitionAuthorisedHere,
    `${at}.reserveRule.reserveTransitionAuthorisedHere`,
  );
  if (reserveRule.reserveConsumed !== 0 || reserveRule.replacementLedgerEntriesCreated !== 0) {
    refuse(
      'GOVERNANCE_FAMILY_OCCUPANT_UNDECLARED',
      `${at} does not declare zero reserve consumption`,
    );
  }
  const perIndex = arr(record.perIndex, `${at}.perIndex`);
  if (perIndex.length !== applies.length) {
    refuse(
      'GOVERNANCE_FAMILY_RECORD_SHAPE_INVALID',
      `${at} perIndex length is not its declared scope`,
    );
  }
  const runClaims: EpisodeRunClaim[] = [];
  perIndex.forEach((raw, index) => {
    const itemAt = `${at}.perIndex[${String(index)}]`;
    const item = obj(raw, itemAt);
    const selectionIndex = int(item.selectionIndex, `${itemAt}.selectionIndex`, 0, 109);
    if (!applies.includes(selectionIndex)) {
      refuse('GOVERNANCE_FAMILY_ITEM_SHAPE_INVALID', `${itemAt} is outside the declared scope`);
    }
    requireTrue(item.accepted, `${itemAt}.accepted`);
    const older = obj(item.oldAcquisitionOfRecord, `${itemAt}.oldAcquisitionOfRecord`);
    const newer = obj(item.newAcquisitionOfRecord, `${itemAt}.newAcquisitionOfRecord`);
    if (older.disposition !== 'SUPERSEDED_FOR_GENERATION_ACQUISITION_DECISION_BY_POLICY_REPAIR') {
      refuse(
        'GOVERNANCE_FAMILY_ITEM_SHAPE_INVALID',
        `${itemAt} does not declare its previous run superseded`,
      );
    }
    const episode = { selectionIndex, occupantKind: 'PRIMARY' as const, reserveRankPosition: null };
    runClaims.push(
      Object.freeze({
        ...episode,
        runRefSha256: hex(newer.runOpaqueRef, `${itemAt}.newAcquisitionOfRecord.runOpaqueRef`),
        sourceRegistryId: registryId,
      }),
      Object.freeze({
        ...episode,
        runRefSha256: hex(older.runOpaqueRef, `${itemAt}.oldAcquisitionOfRecord.runOpaqueRef`),
        sourceRegistryId: registryId,
      }),
    );
  });
  return Object.freeze({
    terminalItems: Object.freeze([]),
    runClaims: Object.freeze(runClaims),
    historicalReasons: Object.freeze([]),
  });
}

// ---------------------------------------------------------------------------
// FAMILY 5 — P:12 v6 targeted revalidation final adjudication. It closed a
// capability review and froze ONE primary's unsuccessful reason, and it binds
// that primary's v4 -> v6 supersession.
// ---------------------------------------------------------------------------

function parseP12V6(governance: VerifiedGovernance): ParsedFamilyOutput {
  const registryId = 'P12_V6_TARGETED_REVALIDATION_ADJUDICATION';
  const record = requireFile(governance, registryId).parsed;
  const at = registryId;
  requireGeneration(record, at);
  requireAuthorisesNothing(record, at);
  const final = obj(record.p12FinalState, `${at}.p12FinalState`);
  const selectionIndex = int(final.selectionIndex, `${at}.p12FinalState.selectionIndex`, 0, 109);
  requireOwnerDecision(
    record,
    `ADJUDICATE_P${String(selectionIndex)}_ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET_V1`,
    at,
  );
  const review = obj(record.p12CapabilityReview, `${at}.p12CapabilityReview`);
  if (review.P12_DOCUMENT_BASE_CAPABILITY_REVIEW !== 'CLOSED') {
    refuse(
      'NON_ADJUDICATIVE_SOURCE_USED_AS_DISPOSITION',
      `${at} capability review is not closed, so it freezes no reason`,
    );
  }
  requireFalse(final.pendingCapabilityReview, `${at}.p12FinalState.pendingCapabilityReview`);
  if (final.status !== 'ACQUISITION_UNSUCCESSFUL') {
    refuse('GOVERNANCE_FAMILY_DISPOSITION_INVALID', `${at} does not freeze an unsuccessful status`);
  }
  const reason = unsuccessful(final.reason, `${at}.p12FinalState.reason`);
  if (final.currentAorOutcome !== reason) {
    refuse(
      'GOVERNANCE_FAMILY_COMPOSITION_INCONSISTENT',
      `${at} current acquisition-of-record outcome differs from its frozen reason`,
    );
  }
  // The occupant is declared: this record re-verified an ORIGINAL_SELECTION.
  const integrity = obj(record.evidenceIntegrity, `${at}.evidenceIntegrity`);
  const reverified = obj(
    integrity.reverifiedFromDurableEvidence,
    `${at}.evidenceIntegrity.reverifiedFromDurableEvidence`,
  );
  if (reverified.occupant !== 'ORIGINAL_SELECTION') {
    refuse(
      'GOVERNANCE_FAMILY_OCCUPANT_UNDECLARED',
      `${at} does not declare an original-selection occupant`,
    );
  }
  if (reverified.selectionIndex !== selectionIndex) {
    refuse('GOVERNANCE_FAMILY_COMPOSITION_INCONSISTENT', `${at} re-verified a different slot`);
  }
  const episode = { selectionIndex, occupantKind: 'PRIMARY' as const, reserveRankPosition: null };
  const historicalRun = obj(final.historicalV4Run, `${at}.p12FinalState.historicalV4Run`);
  return Object.freeze({
    terminalItems: Object.freeze([]),
    runClaims: Object.freeze([
      Object.freeze({
        ...episode,
        runRefSha256: hex(
          final.currentAorRunOpaqueRef,
          `${at}.p12FinalState.currentAorRunOpaqueRef`,
        ),
        sourceRegistryId: registryId,
      }),
      Object.freeze({
        ...episode,
        runRefSha256: hex(historicalRun.opaqueRef, `${at}.p12FinalState.historicalV4Run.opaqueRef`),
        sourceRegistryId: registryId,
      }),
    ]),
    historicalReasons: Object.freeze([
      Object.freeze({ ...episode, reason, sourceRegistryId: registryId }),
    ]),
  });
}

// ---------------------------------------------------------------------------
// FAMILY 6 — Window V1 live-window evidence adjudication. Its items carry
// `kind` + `reservePosition` and NO draw digest; the disposition is the
// adjudication's OWN `finalSd9` beside `accepted: true`, which is why this
// parser refuses an item that is not accepted.
// ---------------------------------------------------------------------------

function parseWindowV1(governance: VerifiedGovernance): ParsedFamilyOutput {
  const registryId = 'WINDOW_V1_EVIDENCE_ADJUDICATION';
  const record = requireFile(governance, registryId).parsed;
  const at = registryId;
  requireGeneration(record, at);
  requireAuthorisesNothing(record, at);
  const acceptance = obj(record.acceptance, `${at}.acceptance`);
  requireTrue(acceptance.allFiveAccepted, `${at}.acceptance.allFiveAccepted`);
  const accepted = arr(record.acceptedWorkItems, `${at}.acceptedWorkItems`);
  const bound = obj(record.bound, `${at}.bound`);
  const liveResultRegistryId = boundObservation(
    governance,
    bound.windowV1Result,
    'WINDOW_V1_LIVE_RESULT',
    `${at}.bound.windowV1Result`,
  );
  const items = arr(record.items, `${at}.items`);
  if (items.length !== accepted.length) {
    refuse(
      'GOVERNANCE_FAMILY_RECORD_SHAPE_INVALID',
      `${at} item count is not its accepted-work-item count`,
    );
  }
  const terminalItems = items.map((raw, index) => {
    const itemAt = `${at}.items[${String(index)}]`;
    const item = obj(raw, itemAt);
    const workItemId = str(item.workItemId, `${itemAt}.workItemId`);
    if (!accepted.includes(workItemId)) {
      refuse(
        'GOVERNANCE_FAMILY_ITEM_SHAPE_INVALID',
        `${itemAt} is not in the accepted-work-item list`,
      );
    }
    requireTrue(item.accepted, `${itemAt}.accepted`);
    const selectionIndex = int(item.selectionIndex, `${itemAt}.selectionIndex`, 0, 109);
    const reservePosition =
      item.reservePosition === null
        ? null
        : int(item.reservePosition, `${itemAt}.reservePosition`, 0, 39);
    const occupantKind = occupantFromWorkItemId(
      workItemId,
      selectionIndex,
      reservePosition,
      itemAt,
    );
    const declaredKind = item.kind === 'REPLACEMENT' ? 'RESERVE_REPLACEMENT' : item.kind;
    if (declaredKind !== occupantKind) {
      refuse(
        'REDUNDANT_FIELD_CONFLICTS_WITH_STRUCTURAL_SOURCE',
        `${itemAt} kind disagrees with its own work-item id`,
      );
    }
    const integrity = obj(item.integrity, `${itemAt}.integrity`);
    requireTrue(
      integrity.drawEntryDigestMatchesPlan,
      `${itemAt}.integrity.drawEntryDigestMatchesPlan`,
    );
    requireFalse(integrity.dryRun, `${itemAt}.integrity.dryRun`);
    return Object.freeze({
      sourceRegistryId: registryId,
      selectionIndex,
      occupantKind,
      reserveRankPosition: reservePosition,
      split: str(item.split, `${itemAt}.split`),
      declaredDrawEntrySha256: null,
      runRefSha256: hex(item.runRefSha256, `${itemAt}.runRefSha256`),
      acquisitionPolicyVersion: policyVersion(
        integrity.runFetchPolicyVersion,
        `${itemAt}.integrity.runFetchPolicyVersion`,
      ),
      disposition: terminal(item.finalSd9, `${itemAt}.finalSd9`),
      replacementReason: null,
      liveResultRegistryId,
      sealedSd7Detail: sealedDetail(
        obj(item.formalSd7, `${itemAt}.formalSd7`).sealedDetail,
        `${itemAt}.formalSd7.sealedDetail`,
      ),
    });
  });
  return Object.freeze({
    terminalItems: Object.freeze(terminalItems),
    runClaims: Object.freeze(
      terminalItems.map((item) =>
        Object.freeze({
          selectionIndex: item.selectionIndex,
          occupantKind: item.occupantKind,
          reserveRankPosition: item.reserveRankPosition,
          runRefSha256: item.runRefSha256,
          sourceRegistryId: registryId,
        }),
      ),
    ),
    historicalReasons: Object.freeze([]),
  });
}

// ---------------------------------------------------------------------------
// FAMILY 7 — Window V2 PARTIAL adjudication. Three item shapes, and the
// differences are the whole reason this is its own family:
//
//   SUCCESS   `finalAdjudication: ACQUISITION_SUCCESSFUL`.
//   FAILURE   a COARSE `finalAdjudication: ACQUISITION_UNSUCCESSFUL` beside a
//             separately frozen `replacementReason`. The coarse token is not a
//             frozen disposition, so the frozen reason is the disposition.
//   PENDING   `finalCurrentStatus: ACQUISITION_STATUS_PENDING_CAPABILITY_REVIEW`
//             with `notAdjudicatedAs` listing both verdicts. No disposition.
//   NEVER     `status: NEVER_STARTED`, no run. Not evidence of any kind.
// ---------------------------------------------------------------------------

function parseWindowV2Partial(governance: VerifiedGovernance): ParsedFamilyOutput {
  const registryId = 'WINDOW_V2_PARTIAL_EVIDENCE_ADJUDICATION';
  const record = requireFile(governance, registryId).parsed;
  const at = registryId;
  requireGeneration(record, at);
  requireAuthorisesNothing(record, at);
  const bound = obj(record.bound, `${at}.bound`);
  const liveResultRegistryId = boundObservation(
    governance,
    bound.liveResult,
    'WINDOW_V2_LIVE_RESULT',
    `${at}.bound.liveResult`,
  );
  const items = arr(record.items, `${at}.items`);
  const terminalItems: ParsedTerminalItem[] = [];
  const runClaims: EpisodeRunClaim[] = [];
  items.forEach((raw, index) => {
    const itemAt = `${at}.items[${String(index)}]`;
    const item = obj(raw, itemAt);
    const workItemId = str(item.workItemId, `${itemAt}.workItemId`);
    const selectionIndex = int(item.selectionIndex, `${itemAt}.selectionIndex`, 0, 109);
    const occupantKind = occupantFromWorkItemId(workItemId, selectionIndex, null, itemAt);
    const episode = { selectionIndex, occupantKind, reserveRankPosition: null };

    if (item.status === 'NEVER_STARTED') {
      if (item.runs !== 0 || 'runRefSha256' in item) {
        refuse(
          'GOVERNANCE_FAMILY_ITEM_SHAPE_INVALID',
          `${itemAt} says never started yet names a run`,
        );
      }
      return;
    }
    const runRefSha256 = hex(item.runRefSha256, `${itemAt}.runRefSha256`);
    runClaims.push(Object.freeze({ ...episode, runRefSha256, sourceRegistryId: registryId }));

    if (item.finalCurrentStatus !== undefined) {
      // A capability review was open: this family explicitly adjudicated NEITHER
      // verdict, and its diagnostic SD9 is named as a diagnostic only.
      if (item.finalCurrentStatus !== 'ACQUISITION_STATUS_PENDING_CAPABILITY_REVIEW') {
        refuse('GOVERNANCE_FAMILY_ITEM_SHAPE_INVALID', `${itemAt} names an unknown pending status`);
      }
      const notAdjudicated = arr(item.notAdjudicatedAs, `${itemAt}.notAdjudicatedAs`);
      if (
        !notAdjudicated.includes('ACQUISITION_SUCCESSFUL') ||
        !notAdjudicated.includes('ACQUISITION_UNSUCCESSFUL')
      ) {
        refuse(
          'GOVERNANCE_FAMILY_ITEM_SHAPE_INVALID',
          `${itemAt} pending item does not disclaim both verdicts`,
        );
      }
      return;
    }

    const integrity = obj(item.integrity, `${itemAt}.integrity`);
    requireFalse(integrity.dryRun, `${itemAt}.integrity.dryRun`);
    const version = policyVersion(
      integrity.runFetchPolicyVersion,
      `${itemAt}.integrity.runFetchPolicyVersion`,
    );
    const declared = item.finalAdjudication;
    let disposition: TerminalDisposition;
    let replacementReason: UnsuccessfulDisposition | null = null;
    if (declared === 'ACQUISITION_UNSUCCESSFUL') {
      // The coarse token is not a disposition; the frozen reason beside it is.
      replacementReason = unsuccessful(item.replacementReason, `${itemAt}.replacementReason`);
      requireTrue(
        item.pendingReplacementObligationCreated,
        `${itemAt}.pendingReplacementObligationCreated`,
      );
      disposition = replacementReason;
    } else {
      disposition = terminal(declared, `${itemAt}.finalAdjudication`);
    }
    terminalItems.push(
      Object.freeze({
        ...episode,
        sourceRegistryId: registryId,
        split: str(item.split, `${itemAt}.split`),
        declaredDrawEntrySha256: null,
        runRefSha256,
        acquisitionPolicyVersion: version,
        disposition,
        replacementReason,
        liveResultRegistryId,
        sealedSd7Detail: sealedDetail(
          obj(item.formalSd7, `${itemAt}.formalSd7`).sealedDetail,
          `${itemAt}.formalSd7.sealedDetail`,
        ),
      }),
    );
  });
  return Object.freeze({
    terminalItems: Object.freeze(terminalItems),
    runClaims: Object.freeze(runClaims),
    historicalReasons: Object.freeze([]),
  });
}

// ---------------------------------------------------------------------------
// FAMILY 8 — The mixed-window live-window evidence adjudications (post-P12,
// post-mixed chain replacement, post-P18). One item shape: a draw-entry
// digest, an explicit `reserveRankPosition`, a `finalSd9` AND a
// `finalAdjudication`, and - where the two differ - an explicit Q3
// `replacementReasonDerivation`.
// ---------------------------------------------------------------------------

const MIXED_WINDOW_LIVE_RESULTS: Readonly<Record<string, string>> = Object.freeze({
  POST_P12_MIXED_WINDOW_EVIDENCE_ADJUDICATION: 'POST_P12_MIXED_WINDOW_LIVE_RESULT',
  POST_MIXED_WINDOW_CHAIN_REPLACEMENT_EVIDENCE_ADJUDICATION: 'POST_MIXED_WINDOW_LIVE_RESULT',
  POST_P18_CONTINUATION_EVIDENCE_ADJUDICATION: 'POST_P18_CONTINUATION_LIVE_RESULT',
});

function parseMixedWindow(governance: VerifiedGovernance, registryId: string): ParsedFamilyOutput {
  const record = requireFile(governance, registryId).parsed;
  const at = registryId;
  requireGeneration(record, at);
  requireAuthorisesNothing(record, at);
  requireTrue(record.appendOnly, `${at}.appendOnly`);
  requireFalse(record.isLiveAuthority, `${at}.isLiveAuthority`);
  const observationId = MIXED_WINDOW_LIVE_RESULTS[registryId];
  if (observationId === undefined) {
    refuse('UNSUPPORTED_GOVERNANCE_RECORD_FAMILY', `${at} has no registered observation record`);
  }
  const bound = obj(record.bound, `${at}.bound`);
  const liveResultRegistryId = boundObservation(
    governance,
    bound.liveResult,
    observationId,
    `${at}.bound.liveResult`,
  );
  const items = arr(record.items, `${at}.items`);
  const terminalItems = items.map((raw, index) => {
    const itemAt = `${at}.items[${String(index)}]`;
    const item = obj(raw, itemAt);
    const workItemId = str(item.workItemId, `${itemAt}.workItemId`);
    const selectionIndex = int(item.selectionIndex, `${itemAt}.selectionIndex`, 0, 109);
    const reserveRankPosition =
      item.reserveRankPosition === null
        ? null
        : int(item.reserveRankPosition, `${itemAt}.reserveRankPosition`, 0, 39);
    const occupantKind = occupantFromWorkItemId(
      workItemId,
      selectionIndex,
      reserveRankPosition,
      itemAt,
    );
    const declaredKind = item.kind === 'REPLACEMENT' ? 'RESERVE_REPLACEMENT' : item.kind;
    if (declaredKind !== occupantKind) {
      refuse(
        'REDUNDANT_FIELD_CONFLICTS_WITH_STRUCTURAL_SOURCE',
        `${itemAt} kind disagrees with its own work-item id`,
      );
    }
    const expectedDrawEntryKind = occupantKind === 'PRIMARY' ? 'SELECTION' : 'RESERVE';
    if (item.drawEntryKind !== expectedDrawEntryKind) {
      refuse(
        'REDUNDANT_FIELD_CONFLICTS_WITH_STRUCTURAL_SOURCE',
        `${itemAt} drawEntryKind disagrees with its occupant kind`,
      );
    }
    const integrity = obj(item.integrity, `${itemAt}.integrity`);
    requireFalse(integrity.dryRun, `${itemAt}.integrity.dryRun`);
    requireTrue(
      integrity.drawEntryDigestMatchesPlan,
      `${itemAt}.integrity.drawEntryDigestMatchesPlan`,
    );
    const disposition = terminal(item.finalAdjudication, `${itemAt}.finalAdjudication`);
    // `finalSd9` is the FORMAL SD9 of the run. It is read only to check that a
    // divergence from the frozen owner disposition is explained by a Q3
    // derivation, never as a disposition of its own.
    const formalSd9 = item.finalSd9;
    let replacementReason: UnsuccessfulDisposition | null = null;
    if (item.replacementReasonDerivation !== undefined) {
      const derivation = obj(
        item.replacementReasonDerivation,
        `${itemAt}.replacementReasonDerivation`,
      );
      replacementReason = unsuccessful(
        derivation.derivedReason,
        `${itemAt}.replacementReasonDerivation.derivedReason`,
      );
    } else if (formalSd9 !== disposition) {
      refuse(
        'GOVERNANCE_FAMILY_COMPOSITION_INCONSISTENT',
        `${itemAt} formal SD9 differs from its adjudication with no reason derivation`,
      );
    }
    return Object.freeze({
      sourceRegistryId: registryId,
      selectionIndex,
      occupantKind,
      reserveRankPosition,
      split: str(item.split, `${itemAt}.split`),
      declaredDrawEntrySha256: hex(item.drawEntrySha256, `${itemAt}.drawEntrySha256`),
      runRefSha256: hex(item.runRefSha256, `${itemAt}.runRefSha256`),
      acquisitionPolicyVersion: policyVersion(
        integrity.runFetchPolicyVersion,
        `${itemAt}.integrity.runFetchPolicyVersion`,
      ),
      disposition,
      replacementReason,
      liveResultRegistryId,
      sealedSd7Detail: sealedDetail(
        obj(item.formalSd7, `${itemAt}.formalSd7`).sealedDetail,
        `${itemAt}.formalSd7.sealedDetail`,
      ),
    });
  });
  return Object.freeze({
    terminalItems: Object.freeze(terminalItems),
    runClaims: Object.freeze(
      terminalItems.map((item) =>
        Object.freeze({
          selectionIndex: item.selectionIndex,
          occupantKind: item.occupantKind,
          reserveRankPosition: item.reserveRankPosition,
          runRefSha256: item.runRefSha256,
          sourceRegistryId: registryId,
        }),
      ),
    ),
    historicalReasons: Object.freeze([]),
  });
}

// ---------------------------------------------------------------------------
// FAMILY 9 — Owner Clarification Q3. It froze the mechanical replacement
// reason of four ORIGINAL occupants, superseding a strategy proposal that
// would have given three of them a different token. It names no run and no
// observation: it is a REASON authority only.
// ---------------------------------------------------------------------------

export const OWNER_Q3_DECISION = 'APPROVE_MECHANICAL_REPLACEMENT_REASON_PRECEDENCE_V1';

function parseOwnerReasonPrecedence(governance: VerifiedGovernance): ParsedFamilyOutput {
  const registryId = 'OWNER_REPLACEMENT_REASON_PRECEDENCE_CLARIFICATION';
  const record = requireFile(governance, registryId).parsed;
  const at = registryId;
  requireGeneration(record, at);
  requireAuthorisesNothing(record, at);
  requireOwnerDecision(record, OWNER_Q3_DECISION, at);
  const q3 = obj(record.Q3_replacementReasonPrecedence, `${at}.Q3_replacementReasonPrecedence`);
  if (q3.decision !== OWNER_Q3_DECISION) {
    refuse(
      'GOVERNANCE_FAMILY_RECORD_SHAPE_INVALID',
      `${at}.Q3 does not carry its own decision token`,
    );
  }
  requireFalse(q3.newTokenAdded, `${at}.Q3_replacementReasonPrecedence.newTokenAdded`);
  const vocabulary = arr(
    q3.vocabularyUnchanged,
    `${at}.Q3_replacementReasonPrecedence.vocabularyUnchanged`,
  );
  if (
    vocabulary.length !== UNSUCCESSFUL_DISPOSITIONS.length ||
    UNSUCCESSFUL_DISPOSITIONS.some((token) => !vocabulary.includes(token))
  ) {
    refuse(
      'GOVERNANCE_FAMILY_RECORD_SHAPE_INVALID',
      `${at}.Q3 vocabulary is not the four frozen unsuccessful reasons`,
    );
  }
  const reasons = obj(
    q3.replacementReasons,
    `${at}.Q3_replacementReasonPrecedence.replacementReasons`,
  );
  const verified = obj(
    q3.currentReasonsVerifiedAgainstDurableEvidence,
    `${at}.Q3_replacementReasonPrecedence.currentReasonsVerifiedAgainstDurableEvidence`,
  );
  const historicalReasons = Object.entries(reasons).map(([key, value]) => {
    const keyAt = `${at}.Q3_replacementReasonPrecedence.replacementReasons[${key}]`;
    if (!/^(?:0|[1-9][0-9]*)$/.test(key)) {
      refuse('GOVERNANCE_FAMILY_ITEM_SHAPE_INVALID', `${keyAt} is not a selection index`);
    }
    const selectionIndex = int(Number(key), keyAt, 0, 109);
    const reason = unsuccessful(value, keyAt);
    // The record restates each reason beside its evidence; both must agree.
    const restated = obj(verified[key], `${keyAt} evidence block`);
    if (restated.reason !== reason) {
      refuse(
        'GOVERNANCE_FAMILY_COMPOSITION_INCONSISTENT',
        `${keyAt} reason differs from its own verified-evidence restatement`,
      );
    }
    // Q3 froze the reason of each slot's ORIGINAL occupant. The occupant kind
    // is proved structurally by the ledger, not asserted here.
    return Object.freeze({
      selectionIndex,
      occupantKind: 'PRIMARY' as const,
      reserveRankPosition: null,
      reason,
      sourceRegistryId: registryId,
    });
  });
  return Object.freeze({
    terminalItems: Object.freeze([]),
    runClaims: Object.freeze([]),
    historicalReasons: Object.freeze(historicalReasons),
  });
}

// ---------------------------------------------------------------------------
// The family dispatcher. Selection is by REGISTRY ID, never by filename.
// ---------------------------------------------------------------------------

export function parseGovernanceFamilies(governance: VerifiedGovernance): ParsedFamilyOutput {
  const outputs: ParsedFamilyOutput[] = [];
  for (const file of governance.files.values()) {
    const { id, parserFamily } = file.entry;
    switch (parserFamily) {
      case 'FROZEN_DRAW':
      case 'RESERVE_REPLACEMENT_LEDGER':
      case 'ACQUISITION_POLICY_TRANSITION_LEDGER':
      case 'ADJUDICATED_OBSERVATION_RECORD':
        // Read by their own dedicated modules, or bound by reference only.
        outputs.push(EMPTY);
        break;
      case 'BATCH01_ATTRIBUTION_OWNER_ADJUDICATION':
        outputs.push(parseBatch01Attribution(governance, id));
        break;
      case 'OPTION_B_TRANSITION_OWNER_ADJUDICATION':
        outputs.push(parseOptionBComposed(governance));
        break;
      case 'OPTION_B_TRANSITION_MEASUREMENT_OF_RECORD':
        // Read only as the Option-B composition's second half.
        outputs.push(EMPTY);
        break;
      case 'OPTION_C_LITE_REVALIDATION_ADJUDICATION':
        outputs.push(parseOptionCLite(governance));
        break;
      case 'V4_TRANSPORT_REVALIDATION_ADJUDICATION':
        outputs.push(parseV4TransportRevalidation(governance));
        break;
      case 'P12_V6_TARGETED_REVALIDATION_ADJUDICATION':
        outputs.push(parseP12V6(governance));
        break;
      case 'WINDOW_V1_EVIDENCE_ADJUDICATION':
        outputs.push(parseWindowV1(governance));
        break;
      case 'WINDOW_V2_PARTIAL_EVIDENCE_ADJUDICATION':
        outputs.push(parseWindowV2Partial(governance));
        break;
      case 'MIXED_WINDOW_EVIDENCE_ADJUDICATION':
        outputs.push(parseMixedWindow(governance, id));
        break;
      case 'OWNER_REPLACEMENT_REASON_PRECEDENCE_CLARIFICATION':
        outputs.push(parseOwnerReasonPrecedence(governance));
        break;
      default:
        refuse('UNSUPPORTED_GOVERNANCE_RECORD_FAMILY', `${id} names a family with no parser`);
    }
  }
  return Object.freeze({
    terminalItems: Object.freeze(outputs.flatMap((output) => output.terminalItems)),
    runClaims: Object.freeze(outputs.flatMap((output) => output.runClaims)),
    historicalReasons: Object.freeze(outputs.flatMap((output) => output.historicalReasons)),
  });
}

export function episodeKeyOf(ref: EpisodeRef): string {
  return `${String(ref.selectionIndex)}|${ref.occupantKind}|${String(ref.reserveRankPosition)}`;
}
