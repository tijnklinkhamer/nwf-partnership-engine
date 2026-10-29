/**
 * PHASE 2B-2D — A4 R51: BINDING THE EXACT R50 PACKAGE AND R49 RUBRIC, AND THE
 * OWNER'S HUMAN-REVIEW AUTHORITY.
 *
 * R51 regenerates nothing. It reads the committed R50 package, template,
 * internal index and census, and the committed R49 rubric and approval, and
 * refuses unless every one is the exact frozen artifact: the package must
 * recompute to the R50 package hash through the unchanged `sha256OfCanonical`
 * contract AND equal the exact R50 file bytes. One changed record, one
 * reordered line, one altered goldId or one different rubric hash refuses.
 *
 * The internal index is read only to confirm it is the frozen,
 * not-reviewer-visible index over the same goldIds. No sampling membership
 * is read from it, returned, or embedded anywhere.
 *
 * PURE. No socket, no database, no environment. Callers pass bytes.
 */
import { createHash } from 'node:crypto';
import { sha256OfCanonical } from '../../../../orgunits/classify/evaluation/hashes.js';
import { bindR49RubricForR50, R49_RUBRIC, R49_RUBRIC_APPROVAL } from '../a4handoffR4/rubric.js';
import {
  RESPONSE_HUMAN_FIELDS,
  RESPONSE_TEMPLATE_KEYS,
  REVIEW_HEADING_KEYS,
  REVIEW_PRESENTATION_KEYS,
  REVIEW_RECORD_KEYS,
} from '../a4handoffR4/types.js';
import { refuseR51 } from './refusal.js';
import {
  COMPLETED_RESPONSE_FILE_NAME,
  COMPLETED_RESPONSE_KEYS,
  COMPLETED_RESPONSE_SCHEMA,
  DRAFT_KIND,
  FORBIDDEN_REVIEW_ASSISTANCE,
  LANGUAGE_DEFER_STATE,
  NOT_YET_MEASURABLE_PRE_LABEL,
  R50_BOUND_ARTIFACTS,
  R50_TERMINAL_COMMIT,
  R50_TERMINAL_STATE,
  R51_ACTOR_KEY_PATTERN_SOURCE,
  R51_ARTIFACT_PATHS,
  R51_AUTHORISED_ACTION,
  R51_AUTHORITY_FLAGS,
  R51_OWNER_MARKERS,
  R51_SPLIT,
  R51_SUCCESS_TERMINAL,
  R51_TASK,
  SINGLE_REVIEW_DEFINITION,
  SINGLE_REVIEW_IS_NOT,
} from './types.js';

export interface ReviewPresentation {
  readonly requestedUrl: string;
  readonly title: string | null;
  readonly declaredLang: string | null;
  readonly headings: readonly { readonly level: number; readonly text: string }[];
  readonly mainTextTruncated: boolean;
  readonly extractionMethod: string;
  readonly extractionRuleVersion: string;
}

export interface ReviewRecord {
  readonly goldId: string;
  readonly rubricVersion: string;
  readonly rubricSha256: string;
  readonly mainText: string;
  readonly sourcePresentations: readonly ReviewPresentation[];
}

/** The minted proof that R51 is looking at exactly the frozen R50 package. */
export interface R51PackageBinding {
  readonly kind: 'A4_R51_EXACT_R50_PACKAGE_AND_R49_RUBRIC_BINDING';
  readonly split: typeof R51_SPLIT;
  readonly r50Terminal: typeof R50_TERMINAL_COMMIT;
  readonly packagePath: string;
  readonly packageHash: string;
  readonly packageFileSha256: string;
  readonly packageText: string;
  readonly records: readonly ReviewRecord[];
  readonly goldIds: readonly string[];
  readonly rubricPath: string;
  readonly rubricVersion: string;
  readonly rubricSha256: string;
  readonly rubricText: string;
}

const MINTED = new WeakSet<object>();

export function isR51PackageBinding(value: unknown): value is R51PackageBinding {
  return typeof value === 'object' && value !== null && MINTED.has(value);
}

export function requireR51PackageBinding(value: unknown): R51PackageBinding {
  if (!isR51PackageBinding(value)) {
    refuseR51('R51_BINDING_NOT_MINTED', 'the value is not a minted R51 package binding');
  }
  return value;
}

export const sha256Hex = (bytes: Uint8Array | string): string =>
  createHash('sha256').update(bytes).digest('hex');

const sameKeys = (value: unknown, keys: readonly string[]): boolean =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  JSON.stringify(Object.keys(value)) === JSON.stringify(keys);

function jsonlRows(
  text: string,
  code: 'R51_PACKAGE_RECORD_INVALID' | 'R51_TEMPLATE_MISMATCH',
): unknown[] {
  if (!text.endsWith('\n') || text.includes('\r')) refuseR51(code, 'the file is not LF JSONL');
  return text
    .slice(0, -1)
    .split('\n')
    .map((line, i) => {
      try {
        return JSON.parse(line) as unknown;
      } catch (error) {
        return refuseR51(code, `line ${i + 1} is not JSON`, { cause: error });
      }
    });
}

function requirePresentation(value: unknown, where: string): void {
  const p = value as Record<string, unknown>;
  if (
    !sameKeys(value, REVIEW_PRESENTATION_KEYS) ||
    typeof p['requestedUrl'] !== 'string' ||
    (p['title'] !== null && typeof p['title'] !== 'string') ||
    (p['declaredLang'] !== null && typeof p['declaredLang'] !== 'string') ||
    typeof p['mainTextTruncated'] !== 'boolean' ||
    typeof p['extractionMethod'] !== 'string' ||
    typeof p['extractionRuleVersion'] !== 'string' ||
    !Array.isArray(p['headings']) ||
    !(p['headings'] as unknown[]).every(
      (h) =>
        sameKeys(h, REVIEW_HEADING_KEYS) &&
        Number.isInteger((h as Record<string, unknown>)['level']) &&
        typeof (h as Record<string, unknown>)['text'] === 'string',
    )
  ) {
    refuseR51('R51_PACKAGE_RECORD_INVALID', `${where} has a malformed source presentation`);
  }
}

function requirePackage(text: string, rubricVersion: string, rubricSha256: string): ReviewRecord[] {
  const expected = R50_BOUND_ARTIFACTS.reviewPackage;
  const rows = jsonlRows(text, 'R51_PACKAGE_RECORD_INVALID');
  if (rows.length !== expected.records) {
    refuseR51(
      'R51_PACKAGE_RECORD_COUNT_MISMATCH',
      `the package holds ${rows.length} records, not ${expected.records}`,
    );
  }
  rows.forEach((row, i) => {
    const where = `package record ${i + 1}`;
    const r = row as Record<string, unknown>;
    if (
      !sameKeys(row, REVIEW_RECORD_KEYS) ||
      typeof r['goldId'] !== 'string' ||
      !/^g[0-9a-f]{16}$/.test(r['goldId']) ||
      typeof r['mainText'] !== 'string' ||
      !Array.isArray(r['sourcePresentations']) ||
      (r['sourcePresentations'] as unknown[]).length === 0
    ) {
      refuseR51('R51_PACKAGE_RECORD_INVALID', `${where} is not the blind review schema`);
    }
    if (r['rubricVersion'] !== rubricVersion || r['rubricSha256'] !== rubricSha256) {
      refuseR51('R51_PACKAGE_RECORD_INVALID', `${where} is not bound to the exact rubric`);
    }
    for (const p of r['sourcePresentations'] as unknown[]) requirePresentation(p, where);
    if (i > 0 && !((rows[i - 1] as Record<string, string>)['goldId']! < (r['goldId'] as string))) {
      refuseR51('R51_PACKAGE_ORDER_INVALID', `${where} breaks strict goldId ASC order`);
    }
  });
  const records = rows as ReviewRecord[];
  const hash = sha256OfCanonical({
    packageSchema: expected.packageSchema,
    rubricVersion,
    rubricSha256,
    recordCount: records.length,
    records,
  });
  if (hash !== expected.packageHash) {
    refuseR51(
      'R51_PACKAGE_HASH_MISMATCH',
      'the package does not recompute to the R50 package hash',
    );
  }
  if (
    Buffer.byteLength(text, 'utf8') !== expected.bytes ||
    sha256Hex(text) !== expected.fileSha256
  ) {
    refuseR51('R51_PACKAGE_BYTES_MISMATCH', 'the package bytes are not the frozen R50 file');
  }
  return records;
}

function requireTemplate(text: string, goldIds: readonly string[], rubricSha256: string): void {
  const expected = R50_BOUND_ARTIFACTS.responseTemplate;
  const rows = jsonlRows(text, 'R51_TEMPLATE_MISMATCH');
  if (rows.length !== expected.records || rows.length !== goldIds.length) {
    refuseR51('R51_TEMPLATE_MISMATCH', 'the template does not hold one row per package record');
  }
  rows.forEach((row, i) => {
    const r = row as Record<string, unknown>;
    if (
      !sameKeys(row, RESPONSE_TEMPLATE_KEYS) ||
      r['goldId'] !== goldIds[i] ||
      r['rubricSha256'] !== rubricSha256 ||
      !RESPONSE_HUMAN_FIELDS.every((field) => r[field] === null)
    ) {
      refuseR51('R51_TEMPLATE_MISMATCH', `template row ${i + 1} is not the blank R50 row`);
    }
  });
  if (
    Buffer.byteLength(text, 'utf8') !== expected.bytes ||
    sha256Hex(text) !== expected.fileSha256
  ) {
    refuseR51('R51_TEMPLATE_MISMATCH', 'the template bytes are not the frozen R50 file');
  }
}

function requireIndex(text: string, goldIds: readonly string[]): void {
  const expected = R50_BOUND_ARTIFACTS.internalIndex;
  let index: Record<string, unknown>;
  try {
    index = JSON.parse(text) as Record<string, unknown>;
  } catch (error) {
    return refuseR51('R51_INDEX_MISMATCH', 'the internal index is not JSON', { cause: error });
  }
  if (index['reviewerVisible'] !== false || index['neverHandToAReviewer'] !== true) {
    refuseR51('R51_INDEX_MISMATCH', 'the internal index is not marked reviewer-invisible');
  }
  const ids = Array.isArray(index['items'])
    ? (index['items'] as Record<string, unknown>[]).map((item) => item['goldId'])
    : [];
  if (JSON.stringify(ids) !== JSON.stringify(goldIds)) {
    refuseR51(
      'R51_INDEX_MISMATCH',
      'the internal index does not cover exactly the package goldIds',
    );
  }
  if (
    Buffer.byteLength(text, 'utf8') !== expected.bytes ||
    sha256Hex(text) !== expected.fileSha256
  ) {
    refuseR51('R51_INDEX_MISMATCH', 'the internal index bytes are not the frozen R50 file');
  }
}

function requireCensus(text: string): void {
  let census: Record<string, unknown>;
  try {
    census = JSON.parse(text) as Record<string, unknown>;
  } catch (error) {
    return refuseR51('R51_CENSUS_MISMATCH', 'the R50 census is not JSON', { cause: error });
  }
  const packageHash = census['packageHash'] as Record<string, unknown> | undefined;
  if (
    census['terminalState'] !== R50_TERMINAL_STATE ||
    packageHash?.['value'] !== R50_BOUND_ARTIFACTS.reviewPackage.packageHash ||
    packageHash?.['recordCount'] !== R50_BOUND_ARTIFACTS.reviewPackage.records ||
    packageHash?.['immutableForA4'] !== true
  ) {
    refuseR51(
      'R51_CENSUS_MISMATCH',
      'the R50 census does not record the exact materialised package',
    );
  }
  if (sha256Hex(text) !== R50_BOUND_ARTIFACTS.census.fileSha256) {
    refuseR51('R51_CENSUS_MISMATCH', 'the R50 census bytes are not the frozen R50 file');
  }
}

/** Binds the exact R50 package, template, index and census and the R49 rubric. */
export function bindExactR50PackageForR51(input: {
  readonly packageBytes: Uint8Array;
  readonly templateBytes: Uint8Array;
  readonly indexBytes: Uint8Array;
  readonly censusBytes: Uint8Array;
  readonly rubricBytes: Uint8Array;
  readonly rubricApprovalBytes: Uint8Array;
}): R51PackageBinding {
  let rubric: ReturnType<typeof bindR49RubricForR50>;
  try {
    rubric = bindR49RubricForR50({
      rubricBytes: input.rubricBytes,
      approvalBytes: input.rubricApprovalBytes,
    });
  } catch (error) {
    return refuseR51('R51_RUBRIC_NOT_BOUND', 'the exact R49 rubric and approval do not bind', {
      cause: error,
    });
  }
  const decode = (bytes: Uint8Array): string => Buffer.from(bytes).toString('utf8');
  const packageText = decode(input.packageBytes);
  const records = requirePackage(packageText, rubric.rubricVersion, rubric.rubricSha256);
  const goldIds = Object.freeze(records.map((record) => record.goldId));
  requireTemplate(decode(input.templateBytes), goldIds, rubric.rubricSha256);
  requireIndex(decode(input.indexBytes), goldIds);
  requireCensus(decode(input.censusBytes));
  const binding: R51PackageBinding = Object.freeze({
    kind: 'A4_R51_EXACT_R50_PACKAGE_AND_R49_RUBRIC_BINDING' as const,
    split: R51_SPLIT,
    r50Terminal: R50_TERMINAL_COMMIT,
    packagePath: R50_BOUND_ARTIFACTS.reviewPackage.path,
    packageHash: R50_BOUND_ARTIFACTS.reviewPackage.packageHash,
    packageFileSha256: R50_BOUND_ARTIFACTS.reviewPackage.fileSha256,
    packageText,
    records: Object.freeze(records),
    goldIds,
    rubricPath: rubric.rubricPath,
    rubricVersion: rubric.rubricVersion,
    rubricSha256: rubric.rubricSha256,
    rubricText: decode(input.rubricBytes),
  });
  MINTED.add(binding);
  return binding;
}

// ---------------------------------------------------------------------------
// THE OWNER APPROVAL, THE AUTHORITY AND THE PUBLIC CENSUS.
// ---------------------------------------------------------------------------

const OWNER_DECISION_MEANINGS: Readonly<Record<(typeof R51_OWNER_MARKERS)[number], string>> = {
  AUTHORISE_A4_DEV_TRAIN_HUMAN_SINGLE_REVIEW_V1:
    'Humans may now review exactly the 222-item R50 DEV_TRAIN package against exactly the frozen R49 rubric, offline, with no model assistance.',
  APPROVE_DEV_TRAIN_SINGLE_REVIEW_AS_EXACTLY_ONE_HUMAN_LABEL_PER_ITEM:
    'Every DEV_TRAIN item must ultimately receive exactly ONE completed human review. Dual review is not required. Different human actors may review different items. No item may receive two competing DEV_TRAIN labels.',
  APPROVE_DEV_TRAIN_LANGUAGE_INCOMPETENCE_AS_WORKFLOW_DEFER_NOT_NEEDS_REVIEW:
    "A reviewer's inability to understand the frozen page language is NOT the semantic NEEDS_REVIEW label. Such an item remains UNLABELLED and may be handed to another human who can directly understand the frozen evidence. Machine / model translation remains forbidden.",
};

const BOUND_PACKAGE = (): Record<string, unknown> => ({
  path: R50_BOUND_ARTIFACTS.reviewPackage.path,
  packageHashName: R50_BOUND_ARTIFACTS.reviewPackage.packageHashName,
  packageHash: R50_BOUND_ARTIFACTS.reviewPackage.packageHash,
  fileSha256: R50_BOUND_ARTIFACTS.reviewPackage.fileSha256,
  bytes: R50_BOUND_ARTIFACTS.reviewPackage.bytes,
  recordCount: R50_BOUND_ARTIFACTS.reviewPackage.records,
  order: 'goldId ASC',
  immutable: true,
});
const BOUND_TEMPLATE = (): Record<string, unknown> => ({
  path: R50_BOUND_ARTIFACTS.responseTemplate.path,
  fileSha256: R50_BOUND_ARTIFACTS.responseTemplate.fileSha256,
  recordCount: R50_BOUND_ARTIFACTS.responseTemplate.records,
  allHumanFieldsNull: true,
});
const BOUND_RUBRIC = (): Record<string, unknown> => ({
  path: R49_RUBRIC.path,
  rubricVersion: R49_RUBRIC.rubricVersion,
  sha256: R49_RUBRIC.sha256,
  bytes: R49_RUBRIC.bytes,
  ownerApprovalPath: R49_RUBRIC_APPROVAL.path,
  ownerApprovalSha256: R49_RUBRIC_APPROVAL.sha256,
  reinterpreted: false,
});

const LANGUAGE_RULE = (): Record<string, unknown> => ({
  aHumanMayCompleteAnItemOnlyWhen:
    'they can understand the frozen evidence well enough to apply the rubric DIRECTLY, using their own human language knowledge',
  forbiddenAssistance: [...FORBIDDEN_REVIEW_ASSISTANCE],
  ifTheReviewerCannotUnderstandTheLanguage: {
    doNotLabelTheItem: true,
    doNotSelectNeedsReview: true,
    localDraftWorkflowStateOnly: LANGUAGE_DEFER_STATE,
    isAHumanOrGoldLabel: false,
    mayAppearInCompletedResponseFile: false,
    anotherLanguageCompetentHumanMayCompleteTheSameItem: true,
  },
  needsReviewRemainsSemantic:
    'NEEDS_REVIEW keeps exactly its R49 meaning: the FROZEN EVIDENCE itself is genuinely insufficient, conflicting or ambiguous. It never means the reviewer lacks the language, is tired, wants another opinion or wants web context.',
});

export function buildOwnerApprovalRecord(): Record<string, unknown> {
  return {
    record: 'PHASE_2B_2D_A4_DEV_TRAIN_HUMAN_SINGLE_REVIEW_OWNER_APPROVAL_V1',
    recordKind: 'OWNER_DEV_TRAIN_HUMAN_SINGLE_REVIEW_APPROVAL',
    task: R51_TASK,
    recordedBy:
      "claude-code-session under explicit owner instruction; the decisions are the owner's",
    publicSafe: true,
    split: R51_SPLIT,
    r50Terminal: { commit: R50_TERMINAL_COMMIT, terminalState: R50_TERMINAL_STATE },
    ownerDecisions: R51_OWNER_MARKERS.map((marker) => ({
      marker,
      meaning: OWNER_DECISION_MEANINGS[marker],
    })),
    operationalClarificationOf: 'dualReviewRequired.DEV_TRAIN = false',
    changesLabelSemantics: false,
    changesSampling: false,
    changesGates: false,
    boundPackage: BOUND_PACKAGE(),
    boundTemplate: BOUND_TEMPLATE(),
    boundRubric: BOUND_RUBRIC(),
    singleReview: {
      definition: SINGLE_REVIEW_DEFINITION,
      doesNotMean: SINGLE_REVIEW_IS_NOT,
      reasonDifferentHumansMayCoverDifferentItems:
        'the evaluation population is multilingual; no single reviewer is assumed to read every language',
      isNotDualReview: true,
    },
    languageCompetence: LANGUAGE_RULE(),
    actorKeys: {
      pattern: R51_ACTOR_KEY_PATTERN_SOURCE,
      opaque: true,
      chosenByTheReviewerAtSessionStart: true,
      neverStore: ['name', 'email', 'handle'],
      realIdentityPreBound: false,
      identityMappingCommitted: false,
    },
    authorityFlags: { ...R51_AUTHORITY_FLAGS },
    sealedSplits: {
      devConfirmOpened: false,
      finalHoldoutOpened: false,
      requireLaterOwnerDecisions: true,
    },
  };
}

export function buildAuthorityRecord(input: {
  readonly binding: R51PackageBinding;
  readonly ownerApprovalSha256: string;
  readonly toolSha256: string;
  readonly toolBytes: number;
}): Record<string, unknown> {
  const binding = requireR51PackageBinding(input.binding);
  return {
    record: 'PHASE_2B_2D_A4_DEV_TRAIN_HUMAN_SINGLE_REVIEW_AUTHORITY_V1',
    recordKind: 'DEV_TRAIN_HUMAN_SINGLE_REVIEW_AUTHORITY',
    task: R51_TASK,
    split: binding.split,
    r50Terminal: binding.r50Terminal,
    thisFileAuthorises: [R51_AUTHORISED_ACTION],
    thisFileAuthorisesNothingElse: true,
    ownerApproval: {
      path: R51_ARTIFACT_PATHS.ownerApproval,
      sha256: input.ownerApprovalSha256,
      markers: [...R51_OWNER_MARKERS],
    },
    boundPackage: BOUND_PACKAGE(),
    boundRubric: BOUND_RUBRIC(),
    reviewTool: {
      path: R51_ARTIFACT_PATHS.reviewTool,
      sha256: input.toolSha256,
      bytes: input.toolBytes,
      offlineOnly: true,
      embedsExactPackageText: true,
      embedsExactRubricText: true,
      classifiesAnything: false,
      proposesAnyLabel: false,
      displaysSamplingMembership: false,
      localDraftKind: DRAFT_KIND,
      localDraftIsCanonical: false,
    },
    completedResponseContract: {
      expectedFileName: COMPLETED_RESPONSE_FILE_NAME,
      schema: COMPLETED_RESPONSE_SCHEMA,
      producedBy: 'humans, later, through the offline tool; never by R51',
      producedInR51: false,
      expectedRecords: binding.goldIds.length,
      order: 'goldId ASC, identical to the package',
      keys: [...COMPLETED_RESPONSE_KEYS],
      exactlyOneCompletedResponsePerGoldId: true,
      workflowStateIncluded: false,
      pageContentIncluded: false,
      samplingMembershipIncluded: false,
      validityMatrix: 'the exact R49 labelValidityMatrix, unchanged',
    },
    authorityFlags: { ...R51_AUTHORITY_FLAGS },
    authorisesNoSealedSplit: true,
    reusableForDevConfirmOrFinalHoldout: false,
  };
}

export function buildR51Census(input: {
  readonly binding: R51PackageBinding;
  readonly ownerApprovalSha256: string;
  readonly authoritySha256: string;
  readonly toolSha256: string;
}): Record<string, unknown> {
  const binding = requireR51PackageBinding(input.binding);
  return {
    record: 'PHASE_2B_2D_A4_R51_DEV_TRAIN_SINGLE_REVIEW_AUTHORITY_CENSUS_V1',
    recordKind: 'PUBLIC_AGGREGATE_ONLY_DEV_TRAIN_SINGLE_REVIEW_AUTHORITY_CENSUS',
    task: R51_TASK,
    split: binding.split,
    r50Terminal: binding.r50Terminal,
    thisFileAuthorises: [],
    bindings: {
      packageHash: binding.packageHash,
      packageFileSha256: binding.packageFileSha256,
      rubricVersion: binding.rubricVersion,
      rubricSha256: binding.rubricSha256,
      ownerApprovalSha256: input.ownerApprovalSha256,
      authoritySha256: input.authoritySha256,
      reviewToolSha256: input.toolSha256,
    },
    review: {
      itemsAuthorised: binding.goldIds.length,
      singleReviewPerItem: true,
      dualReview: false,
      multipleHumanActorsAcrossDifferentItemsAllowed: true,
      secondLabelForSameItemAllowed: false,
      languageDeferralIsWorkflowNotNeedsReview: true,
      toolReady: true,
      completedResponseExpectedRecords: binding.goldIds.length,
    },
    labelBoundary: {
      humanLabelsAlreadyPresent: 0,
      modelLabels: 0,
      goldRecords: 0,
      adjudications: 0,
      humanReviewAuthorised: true,
      humanReviewExecuted: false,
      completedResponseFileExists: false,
      devTrainRealisedSetREnrichment: NOT_YET_MEASURABLE_PRE_LABEL,
    },
    access: {
      databaseConnections: 0,
      r47Reproduced: false,
      privateAuthorityLoaded: false,
      devConfirmOpened: false,
      finalHoldoutOpened: false,
      modelCalls: 0,
      networkRequests: 0,
    },
    identityDisclosure: {
      goldIdsDisclosed: false,
      urlsDisclosed: false,
      pageTextDisclosed: false,
      actorIdentitiesDisclosed: false,
    },
    terminalState: R51_SUCCESS_TERMINAL,
    nextAction:
      'HUMAN: open the offline R51 review tool and complete the review. Not Claude, not a model.',
  };
}
