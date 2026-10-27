/**
 * WW E-X - THE ENGINE QUALIFICATION-INPUT EXPORT, VERSION 2
 * (`nwf-pe.qualification-input-export.v2`), AS DATA.
 *
 * A SEPARATE document from v1 (`../qualificationInput/`), which stays
 * producible byte for byte: v2 is v1's records and rules PLUS automatic,
 * source-backed C1 evidence read from the stored page captures by the pure
 * rules in `../c1Extraction/` (`nwf-pe-c1-extraction-rules-v1`), in two
 * classes that are never mixed:
 *
 *   claims      v1's five keys, plus OBSERVED facts the captures show
 *               (channel.event_instances, channel.cycle_history,
 *               channel.feed_activity, channel.reach_mode,
 *               channel.resource_openness, and channel.existence for the
 *               additional channels). Producer NWF_SYSTEM, every linked
 *               source an Engine page capture - exactly what the Operator's
 *               C2c R1 path admits (capped there at grade B).
 *   proposals   source-stated self-descriptions C1 admits only as
 *               SELF_ASSERTED / THIRD_PARTY_ASSERTED. NOT claims: the
 *               Operator decides whether each counts (an admission revision
 *               it owns, or a human confirmation). Each carries a short,
 *               already-redacted quote of the stored text and its SHA-256.
 *
 * plus `researchStatus` per C1 subcriterion, `contradictions`, explicit
 * `gaps` and `freshness` per key. Still not an assessment, a score, a rank,
 * a verdict, an identity or a permission: every capability is the literal
 * `NONE` and contact permission is `NOT_GRANTED`. No organisation name, no
 * contact field, no classifier or model output.
 *
 * PURE: no socket, no database, no filesystem, no environment, no clock.
 */
import type { C1Extraction, EstablishedBy, PageClass } from '../c1Extraction/extract.js';
import type { C1Language } from '../c1Extraction/lexicon.js';
import type {
  C1ChannelClass,
  C1ChannelKind,
  C1Subcriterion,
  C1Visibility,
} from '../c1Extraction/vocabulary.js';
import type {
  ENGINE_SOURCE_REPOSITORY,
  EVIDENCE_CLASS,
  INSTANT_RULE,
  PERMISSIONS,
  TARGET_CONTRACTS,
} from '../qualificationInput/contract.js';
import {
  LIMITATIONS,
  type ExportClaim,
  type QualificationInputExportDocument,
  type ResearchRealConflict,
} from '../qualificationInput/contract.js';

export const QUALIFICATION_INPUT_EXPORT_CONTRACT_V2 = 'nwf-pe.qualification-input-export.v2';
export const QUALIFICATION_INPUT_PRODUCER_VERSION_V2 = 'nwf-pe-qualification-input-producer-v2';

/** v1's limitations, with the two that v2 changes restated truthfully, plus v2's own. */
export const LIMITATIONS_V2 = Object.freeze({
  ...LIMITATIONS,
  pageText: 'NO_PAGE_TEXT_IS_EXPORTED_EXCEPT_ONE_SHORT_REDACTED_QUOTE_PER_PROPOSAL',
  classifier: 'NO_CLASSIFIER_OR_MODEL_OUTPUT_IS_EXPORTED',
  phraseRules:
    'DETERMINISTIC_PHRASE_RULES_NWF_PE_C1_EXTRACTION_RULES_V1_OBSERVED_CLAIMS_ONLY_FOR_WHAT_A_CAPTURE_SHOWS',
  proposals: 'PROPOSALS_ARE_NOT_CLAIMS_THE_OPERATOR_DECIDES_WHETHER_ANY_COUNTS',
  quotes: 'AT_MOST_300_CODE_POINTS_OF_ALREADY_REDACTED_STORED_TEXT_CONTACT_SHAPED_QUOTES_WITHHELD',
  researchStatus:
    'EVIDENCE_FOUND_MEANS_A_CLAIM_EXISTS_NEVER_A_TIER_SEARCHED_NOT_FOUND_IS_NEVER_A_ZERO',
  language: 'A_RULE_LANGUAGE_IS_THE_LANGUAGE_A_PHRASE_IS_WRITTEN_IN_NEVER_A_COUNTRY',
} as const);

/** The claim keys v2 may carry (v1's five, then the OBSERVED additions). */
export const EXPORTED_CLAIM_KEYS_V2 = [
  'candidate.kind',
  'candidate.location',
  'channel.cycle_history',
  'channel.event_instances',
  'channel.existence',
  'channel.feed_activity',
  'channel.operator_binding',
  'channel.reach_mode',
  'channel.resource_openness',
  'channel.static_currency',
] as const;
export type ExportedClaimKeyV2 = (typeof EXPORTED_CLAIM_KEYS_V2)[number];

/** The keys a proposal may carry. */
export const PROPOSAL_KEYS = [
  'audience.cohort',
  'audience.languages',
  'audience.segment_definition',
  'candidate.kind',
  'channel.audience_count',
  'channel.existence',
  'channel.operator_binding',
  'channel.role_based_ownership',
] as const;

export type ChannelDerivation =
  'ADMITTED_ROOT_WEBSITE' | 'OBSERVED_ON_ADMITTED_SITE' | 'NAMED_ON_ADMITTED_SITE';

export interface ExportChannelV2 {
  readonly channelRef: string;
  readonly kind: C1ChannelKind;
  readonly channelClass: C1ChannelClass;
  readonly visibility: C1Visibility;
  /** The admitted root website the channel was found on (v1: the channel itself). */
  readonly websiteClaimId: string;
  readonly admissionIds: readonly string[];
  readonly derivation: ChannelDerivation;
  /** OBSERVED_CLAIM: an OBSERVED claim shows it. PROPOSAL_ONLY: only proposals name it. */
  readonly establishedBy: EstablishedBy;
  readonly ruleIds: readonly string[];
}

export interface C1ExtractionBasis {
  readonly origin: 'C1_EXTRACTION_RULE';
  readonly rulesVersion: string;
  readonly dateRuleVersion: string;
  readonly ruleIds: readonly string[];
  readonly pageEvidenceIds: readonly string[];
  readonly statedDates: readonly string[];
}

/** A v2 claim: v1's shape, with the widened key set and the extraction basis. */
export type ExportClaimV2 =
  | ExportClaim
  | (Omit<ExportClaim, 'claimKey' | 'value' | 'basis' | 'researchRealConflicts'> & {
      readonly claimKey: ExportedClaimKeyV2;
      readonly value: Readonly<Record<string, unknown>>;
      readonly basis: C1ExtractionBasis;
      readonly researchRealConflicts: readonly ResearchRealConflict[];
    });

export interface ExportProposal {
  readonly proposalId: string;
  readonly key: (typeof PROPOSAL_KEYS)[number];
  readonly subject: { readonly kind: 'CANDIDATE' | 'CHANNEL'; readonly ref: string };
  readonly proposedValue: Readonly<Record<string, unknown>>;
  readonly assertionMode: 'SELF_ASSERTED' | 'THIRD_PARTY_ASSERTED';
  /** EXACT from the subject's own page, LIKELY from a third party (as v1's recorded claims). */
  readonly attribution: 'EXACT' | 'LIKELY';
  readonly sourceRef: string;
  readonly observedAt: string;
  readonly extraction: {
    readonly ruleId: string;
    readonly rulesVersion: string;
    readonly language: C1Language;
    readonly matchedTerms: readonly string[];
  };
  readonly quote: string;
  readonly quoteTruncated: boolean;
  readonly quoteSha256: string;
}

export const RESEARCH_STATUSES = [
  'EVIDENCE_FOUND',
  'PROPOSAL_ONLY',
  'SEARCHED_NOT_FOUND',
  'NOT_RESEARCHED',
] as const;
export type ResearchStatus = (typeof RESEARCH_STATUSES)[number];

export interface ResearchStatusEntry {
  readonly subcriterionId: C1Subcriterion;
  readonly dimension: 'AF' | 'DP' | 'AP' | 'SV';
  readonly status: ResearchStatus;
  readonly claimKeys: readonly string[];
  readonly claimRefs: readonly string[];
  readonly proposalIds: readonly string[];
  /** The page classes whose capture makes a miss SEARCHED_NOT_FOUND (empty: no rule exists). */
  readonly relevantPageClasses: readonly PageClass[];
  readonly capturedPageClasses: readonly PageClass[];
  readonly reason:
    | 'NO_EXTRACTION_RULE_FOR_THESE_KEYS'
    | 'RELEVANT_PAGE_CLASS_NOT_CAPTURED'
    | 'RELEVANT_PAGE_CLASS_CAPTURED_NOTHING_FOUND'
    | null;
}

export interface Contradiction {
  readonly key: string;
  readonly subject: { readonly kind: 'CANDIDATE' | 'CHANNEL'; readonly ref: string };
  readonly among: 'CLAIMS' | 'PROPOSALS';
  readonly refs: readonly string[];
  readonly sourceRefs: readonly string[];
  readonly distinctValues: number;
}

export interface Gap {
  /** A subcriterion id, a claim key, or `FINDING` for a page finding C1 has no home for. */
  readonly target: string;
  readonly reason: string;
  readonly ruleId: string | null;
  readonly label: string | null;
  readonly sourceRefs: readonly string[];
}

export interface Freshness {
  readonly key: string;
  readonly latestCapturedAt: string;
  readonly sourceRef: string;
  readonly claims: number;
  readonly proposals: number;
}

export interface QualificationInputExportDocumentV2 {
  readonly document: typeof QUALIFICATION_INPUT_EXPORT_CONTRACT_V2;
  readonly producerVersion: typeof QUALIFICATION_INPUT_PRODUCER_VERSION_V2;
  readonly extraction: {
    readonly rulesVersion: C1Extraction['rulesVersion'];
    readonly dateRuleVersion: C1Extraction['dateRuleVersion'];
    readonly pageClasses: readonly {
      readonly sourceRef: string;
      readonly classes: readonly PageClass[];
    }[];
  };
  readonly targetContracts: typeof TARGET_CONTRACTS;
  readonly evidenceClass: typeof EVIDENCE_CLASS;
  readonly instantRule: typeof INSTANT_RULE;
  readonly dateRuleVersion: string;
  readonly sourceRepository: typeof ENGINE_SOURCE_REPOSITORY;
  readonly readConsistency: QualificationInputExportDocument['readConsistency'];
  readonly subjectId: string;
  readonly evaluatedAt: string;
  readonly candidate: QualificationInputExportDocument['candidate'];
  readonly country: QualificationInputExportDocument['country'];
  readonly channels: readonly ExportChannelV2[];
  readonly sources: QualificationInputExportDocument['sources'];
  readonly claims: readonly ExportClaimV2[];
  readonly claimLinks: QualificationInputExportDocument['claimLinks'];
  readonly proposals: readonly ExportProposal[];
  readonly researchStatus: readonly ResearchStatusEntry[];
  readonly contradictions: readonly Contradiction[];
  readonly gaps: readonly Gap[];
  readonly freshness: readonly Freshness[];
  readonly excluded: QualificationInputExportDocument['excluded'];
  readonly researchRuns: QualificationInputExportDocument['researchRuns'];
  readonly permissions: typeof PERMISSIONS;
  readonly limitations: typeof LIMITATIONS_V2;
}

export const MAX_PROPOSALS = 2000;
