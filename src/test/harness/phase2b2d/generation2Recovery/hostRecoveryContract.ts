/**
 * THE GENERATION-2 TARGETED HOST RECOVERY CONTRACT: the owner-approved
 * governance constants and record shapes of Methodology-V3 amendment
 * V3-H1..V3-H10 (Design A), with the owner's UQ1-UQ5 resolutions. PURE.
 *
 * WHAT A TARGETED HOST RECOVERY IS
 *
 *   One bounded, separately authorised re-measurement of ONE executed
 *   ordinary work item whose original run a committed owner incident ruling
 *   classified as HOST-CONFOUNDED: the host or vantage that ran it failed an
 *   observed integrity check in a way that could have produced the observed
 *   acquisition outcome. It is NOT a retry (a second invocation under the same
 *   authority, decided by the first outcome), NOT a rerun, NOT a replacement
 *   (no reserve is consumed, no ledger entry is appended) and NOT a member of
 *   any ordinary window (UQ1: it has no P1-P8 window denominator).
 *
 *   The original run stays immutable and stays in history. A recovery run
 *   becomes the item's ACQUISITION OF RECORD only through the later owner
 *   adjudication of the original window, which binds the whole recovery
 *   chain by hash (adjudicationHistory.ts).
 *
 * GENERIC BY CONSTRUCTION
 *
 *   Nothing here names a window ordinal, slot, work item, reserve position or
 *   run reference: every such fact comes from the committed records a caller
 *   supplies. The only pinned bytes are governance anchors - the approved
 *   amendment and the records it binds.
 *
 * THIS FILE AUTHORISES NOTHING. No network, no database, no ledger mutation,
 * no reserve assignment, no recovery precondition, no live authority.
 */

// ---------------------------------------------------------------------------
// Governance anchors.
// ---------------------------------------------------------------------------

export interface PinnedRecordRef {
  readonly path: string;
  readonly commit: string;
  readonly sha256: string;
  readonly bytes: number;
}

export const HOST_RECOVERY_AMENDMENT_RECORD_KIND = 'METHODOLOGY_AMENDMENT_OWNER_APPROVAL';
export const HOST_RECOVERY_AMENDMENT_OWNER_DECISION =
  'APPROVE_GENERATION2_HOST_CONFOUNDED_REVALIDATION_DESIGN_A_AND_METHODOLOGY_V3_AMENDMENT_V1';
export const HOST_RECOVERY_APPROVED_DESIGN = 'A';

/**
 * E13's governance anchor: the owner approval of the amendment, by exact
 * bytes. A recovery chain naming any other bytes has no recovery path.
 */
export const APPROVED_HOST_RECOVERY_AMENDMENT: PinnedRecordRef = {
  path: 'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_HOST_CONFOUNDED_REVALIDATION_AMENDMENT_OWNER_APPROVAL_V1.json',
  commit: '639851a423026b917c93eaed4194979ced8a08b6',
  sha256: 'e0a3c97386089e7ff862ea21a53f441506c1fe5812590ac083a4e6c11876847c',
  bytes: 11520,
};
/** The approved amendment's own sha256 (the governance anchor every recovery record names). */
export const APPROVED_HOST_RECOVERY_AMENDMENT_SHA256 = APPROVED_HOST_RECOVERY_AMENDMENT.sha256;

/** What the approval binds, exactly as it binds them. */
export const APPROVED_HOST_RECOVERY_AMENDMENT_BINDS = {
  methodologyV3OwnerFreezeApproval: {
    path: 'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_OWNER_FREEZE_APPROVAL_V1.json',
    commit: '13dcdbed94fea08a833664948ac238737cf44c8e',
    sha256: '36e8071738e1842ad03a9b51cf5820d58015305191c48490ef515e1cd1c34f9c',
    bytes: 12318,
  },
  amendmentProposal: {
    path: 'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_HOST_CONFOUNDED_REVALIDATION_AMENDMENT_PROPOSAL_V1.json',
    commit: 'fbbc1a6be5697416e57c7b912e8cf18b9fb16064',
    sha256: '20cb395e7b4540593da8e2a32d6a3323f85d085aa9d70b2f05b0004e7b89394d',
    bytes: 33778,
  },
  amendmentDesign: {
    path: 'docs/evaluation/PHASE_2B_2D_A2_GENERATION2_HOST_CONFOUNDED_REVALIDATION_AMENDMENT_DESIGN_V1.json',
    commit: 'fbbc1a6be5697416e57c7b912e8cf18b9fb16064',
    sha256: 'c8be492f251aa7be133f5c465476b7cd422754f48b00ea1a0a9057355899e619',
    bytes: 63458,
  },
} as const satisfies Record<string, PinnedRecordRef>;

// ---------------------------------------------------------------------------
// Concept, record kinds and tokens.
// ---------------------------------------------------------------------------

export const HOST_RECOVERY_CONCEPT = 'GENERATION2_TARGETED_HOST_RECOVERY_REVALIDATION';
/** Reported by a replay ONLY when a window carries a recovery; absent otherwise. */
export const HOST_RECOVERY_EXTENSION_VERSION = 'GENERATION2_TARGETED_HOST_RECOVERY_EXTENSION_V1';

export const HOST_RECOVERY_RECORD_KINDS = {
  precondition: 'GENERATION2_TARGETED_HOST_RECOVERY_PRECONDITION',
  authority: 'GENERATION2_TARGETED_HOST_RECOVERY_REVALIDATION_AUTHORITY',
  result: 'GENERATION2_TARGETED_HOST_RECOVERY_REVALIDATION_RESULT',
  operatorKitRepair: 'GENERATION2_OPERATOR_KIT_HOST_SEMANTICS_REPAIR',
} as const;
export const INCIDENT_RULING_RECORD_KIND = 'GENERATION2_OWNER_RULING';
/** Ordinary record kinds a recovery validator must never accept, and vice versa. */
export const ORDINARY_WINDOW_RECORD_KINDS = {
  authority: 'GENERATION2_OWNER_LIVE_AUTHORITY',
  liveResult: 'GENERATION2_WINDOW_LIVE_RESULT',
  adjudication: 'GENERATION2_WINDOW_EVIDENCE_ADJUDICATION',
} as const;

/** The ORIGINAL item's integrity disposition on the recovery path, and only there. */
export const HOST_CONFOUNDED = 'HOST_CONFOUNDED';
export const ORDINARY_CLEAN = 'CLEAN';
export const SUPERSESSION_TOKEN =
  'SUPERSEDED_FOR_GENERATION_ACQUISITION_DECISION_BY_ACCEPTED_HOST_RECOVERY';
export const ACQUISITION_OF_RECORD_SOURCE = 'ACCEPTED_TARGETED_HOST_RECOVERY_REVALIDATION';
export const RECOVERY_INTEGRITY_SCOPE = 'ACQUISITION_AND_EXECUTION_INTEGRITY';
export const RECOVERY_RESULT_STATUS = 'TARGETED_HOST_RECOVERY_EVIDENCE_ONLY';

/** An incident ruling's per-item host-integrity stop classification (E5). */
export const HOST_INTEGRITY_STOP_CLASSIFICATION = 'HOST_INTEGRITY_NOT_PROVED_DURING_ITEM';
/** E5: a causal attribution is host-confounded when it begins with this prefix... */
export const HOST_CONFOUNDED_CAUSAL_PREFIX = 'INDETERMINATE_HOST_VS_';
/** ...or is one of these equivalent tokens (the approved amendment lists none). */
export const HOST_CONFOUNDED_CAUSAL_EQUIVALENTS: readonly string[] = [];

/** The recovery result's integrity vocabulary; only CLEAN is adjudicable. */
export const RECOVERY_INTEGRITY_VERDICTS = [
  'CLEAN',
  'PRECONDITION_NOT_HELD_AT_EXECUTION',
  'HOST_INTEGRITY_NOT_PROVED_DURING_RECOVERY',
  'CONCURRENCY_INTEGRITY_STOP',
  'MONITOR_COVERAGE_INSUFFICIENT',
  'PERSISTENCE_INTEGRITY_STOP',
] as const;
export type RecoveryIntegrityVerdict = (typeof RECOVERY_INTEGRITY_VERDICTS)[number];

// ---------------------------------------------------------------------------
// Refusal codes. E1-E14 are the eligibility conditions, one code each.
// ---------------------------------------------------------------------------

export const HOST_RECOVERY_ELIGIBILITY_CONDITIONS = [
  ['E1', 'HOST_RECOVERY_ITEM_NOT_AN_EXECUTED_ORDINARY_ITEM'],
  ['E2', 'HOST_RECOVERY_ORIGINAL_NOT_ONE_CLEAN_COMPLETED_RUN'],
  ['E3', 'HOST_RECOVERY_ORDINARY_INVOCATION_NOT_EXHAUSTED'],
  ['E4', 'HOST_RECOVERY_ORIGINAL_RUN_REFERENCE_INVALID'],
  ['E5', 'HOST_RECOVERY_NO_INCIDENT_RULING'],
  ['E6', 'HOST_RECOVERY_NO_OBSERVED_HOST_INTEGRITY_FAILURE'],
  ['E7', 'HOST_RECOVERY_NO_CAUSAL_CHANNEL'],
  ['E8', 'HOST_RECOVERY_GROUNDS_ARE_OUTCOME_ONLY'],
  ['E9', 'HOST_RECOVERY_TARGET_WAS_CLEAN'],
  ['E10', 'HOST_RECOVERY_OCCUPANT_SUPERSEDED'],
  ['E11', 'HOST_RECOVERY_ITEM_ALREADY_ADJUDICATED'],
  ['E12', 'HOST_RECOVERY_ALREADY_EXISTS_FOR_INCIDENT'],
  ['E13', 'HOST_RECOVERY_AMENDMENT_NOT_APPROVED'],
  ['E14', 'HOST_RECOVERY_TARGET_NOT_FIXED_BY_COMMITTED_EVIDENCE'],
] as const;
export type HostRecoveryEligibilityConditionId =
  (typeof HOST_RECOVERY_ELIGIBILITY_CONDITIONS)[number][0];
export type HostRecoveryEligibilityRefusal =
  (typeof HOST_RECOVERY_ELIGIBILITY_CONDITIONS)[number][1];

/** Refusals of the recovery chain beyond eligibility. */
export const HOST_RECOVERY_CHAIN_REFUSALS = [
  'HOST_RECOVERY_RECORD_NOT_PINNED',
  'HOST_RECOVERY_RECORD_SHAPE',
  'HOST_RECOVERY_RECORD_KIND',
  'HOST_RECOVERY_RECORD_GRANTS_AUTHORITY',
  'HOST_RECOVERY_PRECONDITION_NOT_PROVED',
  'HOST_RECOVERY_PRECONDITION_BINDING',
  'HOST_RECOVERY_PRECONDITION_SERIES_INSUFFICIENT',
  'HOST_RECOVERY_PRECONDITION_TARGET_PROBED',
  'HOST_RECOVERY_PRECONDITION_STALE',
  'HOST_RECOVERY_PRECONDITION_AFTER_AUTHORITY',
  'HOST_RECOVERY_OPERATOR_KIT_REPAIR_NOT_PROVED',
  'HOST_RECOVERY_AUTHORITY_BINDING',
  'HOST_RECOVERY_AUTHORITY_LIMITS',
  'HOST_RECOVERY_AUTHORITY_GRANTS_MUTATION',
  'HOST_RECOVERY_HOST_SAFETY_CHANGED',
  'HOST_RECOVERY_TARGET_MISMATCH',
  'HOST_RECOVERY_ACQUISITION_CODE_CHANGED',
  'HOST_RECOVERY_LEDGER_MOVED',
  'HOST_RECOVERY_RESULT_BINDING',
  'HOST_RECOVERY_RESULT_NOT_ONE_CLEAN_RUN',
  'HOST_RECOVERY_RESULT_INTEGRITY_INCONSISTENT',
  'HOST_RECOVERY_RESULT_NOT_CLEAN',
  'HOST_RECOVERY_INVOCATION_ACCOUNTING',
  'HOST_RECOVERY_GATE_READOUT_MISAPPLIED',
  'HOST_RECOVERY_RUN_REFERENCE_DUPLICATE',
  'HOST_RECOVERY_INTEGRITY_NOT_HOST_CONFOUNDED',
  'HOST_RECOVERY_BINDING_MISSING',
  'HOST_RECOVERY_BINDING_UNUSED',
  'HOST_RECOVERY_ACQUISITION_OF_RECORD_MISMATCH',
  'HOST_RECOVERY_STOP_HISTORY_REWRITTEN',
] as const;
export type HostRecoveryChainRefusal = (typeof HOST_RECOVERY_CHAIN_REFUSALS)[number];

// ---------------------------------------------------------------------------
// Ceilings (V3-H2, V3-H5) and the authority's required flags.
// ---------------------------------------------------------------------------

export const HOST_RECOVERY_LIMITS = {
  maximumLiveInvocations: 1,
  maximumLiveInvocationsPerTarget: 1,
  retries: 0,
  concurrency: 1,
  otherSelectionIndices: [] as readonly number[],
  windowContinuation: false,
} as const;
/** At most one recovery authority, one invocation and one accepted recovery per incident. */
export const HOST_RECOVERIES_PER_INCIDENT = 1;

/** Every one must be present and false on a recovery authority. */
export const HOST_RECOVERY_AUTHORITY_FALSE_FLAGS = [
  'ledgerMutationAuthorised',
  'reserveAssignmentAuthorised',
  'acquisitionOfRecordMutationAuthorised',
  'historicalRunMutationAuthorised',
  'adjudicationAuthorised',
  'validationAuthorised',
  'windowAuthorised',
] as const;

// ---------------------------------------------------------------------------
// Host-safety failure classes: which observed check, which causal channel.
// ---------------------------------------------------------------------------

/**
 * The failing host-safety components an incident ruling may cite (E6), each
 * tied to the original authority's hostSafety key that made it a precondition
 * of the window, its defect class, and the acquisition error kinds it could
 * have produced (E7). Reviewed code, never data. Only the resolver/vantage
 * class has owner-approved precondition parameters (UQ2), so it is the only
 * class admitted.
 */
export const HOST_SAFETY_FAILURE_CLASSES = [
  {
    failingComponent: 'compliant-vantage DNS probe',
    hostSafetyKey: 'compliantVantageRequired',
    defectClass: 'RESOLVER_VANTAGE',
    causalErrorKinds: ['DNS_FAILURE'],
  },
] as const;
export type HostRecoveryDefectClass = (typeof HOST_SAFETY_FAILURE_CLASSES)[number]['defectClass'];

// ---------------------------------------------------------------------------
// The precondition (V3-H4 under UQ2).
// ---------------------------------------------------------------------------

export const PRECONDITION_PROVED = 'PRECONDITION_PROVED';
export const HOST_RECOVERY_PRECONDITION_PARAMETERS = {
  ownerDecision:
    'APPROVE_GENERATION2_HOST_RECOVERY_RESOLVER_PRECONDITION_6_OF_6_OVER_10_MINUTES_WITH_60_MINUTE_VALIDITY_V1',
  defectClass: 'RESOLVER_VANTAGE',
  minimumProbes: 6,
  minimumSpanMinutes: 10,
  everyProbeGreen: true,
  /** The recovery authority is committed no later than this after the final probe. */
  validityMinutes: 60,
} as const;

/**
 * The fixed, committed CONTROL names every sustained-series probe resolves
 * through the system resolver. RFC 2606 reserved names: no organisation can
 * own them, so a control lookup can never be a lookup of a target.
 */
export const HOST_RECOVERY_CONTROL_NAMES_V1 = [
  'example.com',
  'example.net',
  'example.org',
] as const;
/** The compliant-vantage proof name (A answered, AAAA empty: no DNS64/NAT64). */
export const HOST_RECOVERY_VANTAGE_PROOF_NAME = 'ipv4only.arpa';

/** The boolean proofs of every probe (sustained series and T-0 alike). */
export const HOST_RECOVERY_PROBE_PROOFS = [
  'ipv4DefaultRoute',
  'nativeNonClatIpv4',
  'systemResolverFunctioning',
  'ipv4onlyArpaAAnswered',
  'frozenHostSafetyGreen',
] as const;
/** Required true only where the compliant-vantage rule requires no DNS64/NAT64. */
export const HOST_RECOVERY_NO_DNS64_PROOF = 'ipv4onlyArpaAaaaEmpty';

// ---------------------------------------------------------------------------
// The operator-kit host-semantics repair (UQ4): a pre-live blocker.
// ---------------------------------------------------------------------------

export const OPERATOR_KIT_FROZEN_P8_INPUT_SEMANTICS = 'SLEEP_WAKE_OR_PACING_CLOCK_ANOMALY_ONLY';
/** What a committed, separately reviewed repair must prove before any recovery live authority. */
export const OPERATOR_KIT_REPAIR_REQUIRED_PROOFS = {
  frozenP8InputSemantics: OPERATOR_KIT_FROZEN_P8_INPUT_SEMANTICS,
  hostVantageIntegrityRepresentedSeparately: true,
  hardCodedHostHealthClaims: 0,
  hostObservationsPersistedAndReproducible: true,
  repairTestsCommitted: true,
  separatelyReviewed: true,
} as const;

// ---------------------------------------------------------------------------
// The owner's UQ1-UQ5 resolutions, frozen.
// ---------------------------------------------------------------------------

export const HOST_RECOVERY_OWNER_RESOLUTIONS = {
  UQ1: 'RECOVERY_IS_NOT_AN_ORDINARY_WINDOW_AND_DOES_NOT_ACQUIRE_A_P1_TO_P8_WINDOW_DENOMINATOR_V1',
  UQ2: HOST_RECOVERY_PRECONDITION_PARAMETERS.ownerDecision,
  UQ3: 'ENOTFOUND_RUNTIME_CAUSAL_SEMANTICS_REMAIN_UNKNOWN_AND_DO_NOT_BLOCK_THE_GENERIC_AMENDMENT_V1',
  UQ4: 'REQUIRE_OPERATOR_KIT_HOST_SEMANTICS_REPAIR_BEFORE_ANY_GENERATION2_HOST_RECOVERY_LIVE_AUTHORITY_V1',
  UQ5: 'GENERATION2_HOST_RECOVERY_INVOCATION_CONSUMED_ON_CLI_EXECUTE_ISSUANCE_OR_RUN_CREATION_V1',
} as const;

/** UQ1: the recovery's mechanical P1-P8 readout is evidence only. */
export const RECOVERY_GATE_READOUT_RULE = {
  recordedOnly: true,
  isRecoveryWindowPauseSystem: false,
  appliedToOriginalWindow: false,
  joinsOriginalWindowDenominator: false,
} as const;

/** UQ5: the invocation outcome of a recovery attempt. */
export const RECOVERY_INVOCATION_DISPOSITIONS = {
  unspent: 'RECOVERY_INVOCATION_UNSPENT_PRECONDITION_NOT_HELD_AT_EXECUTION',
  consumed: 'RECOVERY_INVOCATION_CONSUMED',
} as const;
export const AUTOMATIC_REPLACEMENT_RECOVERY_INVOCATION = false;

// ---------------------------------------------------------------------------
// Shapes.
// ---------------------------------------------------------------------------

/** One incident: one executed item's one original run. */
export interface HostRecoveryIncidentKey {
  readonly windowOrdinal: number;
  readonly workItemId: string;
  readonly originalRunRefSha256: string;
}

/** Fixed by committed evidence before any recovery evidence exists (V3-H3, E14). */
export interface FixedRecoveryTarget {
  readonly windowOrdinal: number;
  readonly workItemId: string;
  readonly kind: 'REPLACEMENT' | 'PRIMARY';
  readonly selectionIndex: number;
  readonly generation2ReserveRankPosition: number | null;
  readonly split: string;
  readonly identityDigest: string;
  readonly originalRunRefSha256: string;
  readonly rootAuthorityCount: number;
  readonly fetchPolicyVersion: string;
  readonly ruleVersion: string;
  readonly executionPath: string;
}
export const FIXED_RECOVERY_TARGET_FIELDS = [
  'windowOrdinal',
  'workItemId',
  'kind',
  'selectionIndex',
  'generation2ReserveRankPosition',
  'split',
  'identityDigest',
  'originalRunRefSha256',
  'rootAuthorityCount',
  'fetchPolicyVersion',
  'ruleVersion',
  'executionPath',
] as const satisfies readonly (keyof FixedRecoveryTarget)[];

/** Git tree hashes of the acquisition code (src/orgunits/ and src/cli/). */
export interface AcquisitionCodeTree {
  readonly srcOrgunits: string;
  readonly srcCli: string;
}

/** The per-recovered-item block an adjudication carries (V3-H7). */
export const ACQUISITION_OF_RECORD_FIELDS = [
  'approvedAmendment',
  'incidentRuling',
  'originalRun',
  'precondition',
  'recoveryAuthority',
  'recoveryIntegrity',
  'recoveryResult',
  'runRefSha256',
  'source',
] as const;
export const ORIGINAL_RUN_DISPOSITION_FIELDS = [
  'deleted',
  'disposition',
  'executionRecordEdited',
  'remainsValidEvidenceOf',
  'retained',
  'runRefSha256',
] as const;
