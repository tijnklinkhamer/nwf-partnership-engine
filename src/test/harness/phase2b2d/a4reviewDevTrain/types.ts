/**
 * PHASE 2B-2D — A4 R51: DEV_TRAIN HUMAN SINGLE REVIEW, AUTHORITY AND TOOLING.
 *
 * ONE QUESTION R51 ANSWERS
 *
 *   How does a HUMAN apply the frozen R49 rubric to exactly the 222 frozen R50
 *   DEV_TRAIN review items, offline, so that every item ends with exactly ONE
 *   human label - and nothing else in the repository ever proposes one?
 *
 * WHAT R51 IS NOT
 *
 *   Not a label, not gold, not an adjudication, not a model proposal, not a
 *   translation, not A5, not DEV_CONFIRM and not FINAL_HOLDOUT. Nothing here
 *   takes page content and returns a verdict, a unit type or a hard-negative
 *   flag. The tool enforces the R49 label-validity matrix only AFTER a human
 *   has chosen a verdict: that is schema validation, never inference.
 *
 * SINGLE REVIEW
 *
 *   SINGLE REVIEW = EXACTLY ONE HUMAN SEMANTIC LABEL PER GOLDID. It does NOT
 *   mean one person labels the whole split: different opaque actor keys may
 *   complete different items, but one goldId never carries two labels.
 *
 * LANGUAGE COMPETENCE
 *
 *   A reviewer who cannot directly read an item's language leaves it
 *   UNLABELLED, marked only in the local, non-canonical draft as
 *   DEFERRED_FOR_LANGUAGE_COMPETENT_HUMAN. That is workflow, never the semantic
 *   NEEDS_REVIEW verdict, and it can never appear in the completed export.
 */
export const R51_TASK =
  'A4_R51_DEV_TRAIN_HUMAN_SINGLE_REVIEW_AUTHORISATION_AND_TOOLING_V1' as const;

/** R51 serves EXACTLY ONE split. A constant, never a parameter. */
export const R51_SPLIT = 'DEV_TRAIN' as const;

export const R50_TERMINAL_COMMIT = '8c0d36af8b5a28403ee781a754d50f979dbf2e0b' as const;
export const R50_TERMINAL_STATE =
  'A3_R4_DEV_TRAIN_A4_HANDOFF_MATERIALISED_AWAIT_OWNER_HUMAN_LABELLING_AUTHORISATION' as const;

/** The three owner decisions R51 records, in this order. */
export const R51_OWNER_MARKERS = Object.freeze([
  'AUTHORISE_A4_DEV_TRAIN_HUMAN_SINGLE_REVIEW_V1',
  'APPROVE_DEV_TRAIN_SINGLE_REVIEW_AS_EXACTLY_ONE_HUMAN_LABEL_PER_ITEM',
  'APPROVE_DEV_TRAIN_LANGUAGE_INCOMPETENCE_AS_WORKFLOW_DEFER_NOT_NEEDS_REVIEW',
] as const);

export const SINGLE_REVIEW_DEFINITION =
  'SINGLE REVIEW = EXACTLY ONE HUMAN SEMANTIC LABEL PER GOLDID' as const;
export const SINGLE_REVIEW_IS_NOT = 'ONE PERSON MUST LABEL THE ENTIRE SPLIT' as const;

/** The exact frozen R50 artifacts R51 binds. Never regenerated. */
export const R50_BOUND_ARTIFACTS = Object.freeze({
  reviewPackage: Object.freeze({
    path: 'docs/evaluation/corpus/PHASE_2B_2D_A3_R50_DEV_TRAIN_R4_SINGLE_REVIEW_PACKAGE_V1.jsonl',
    fileSha256: '91442149a4763ced8b28dfe35bfbcb00c2781baed594c19169c7cbaac80619ed',
    bytes: 1038305,
    packageSchema: 'PHASE_2B_2D_A3_R50_DEV_TRAIN_R4_SINGLE_REVIEW_PACKAGE_V1',
    packageHashName: 'R50_PRE_LABEL_REVIEW_PACKAGE_HASH',
    packageHash: '9664388949f5d8686fe32af2fb4fb8f933787faf6daf11349d5b8a402db4066e',
    records: 222,
  }),
  responseTemplate: Object.freeze({
    path: 'docs/evaluation/corpus/PHASE_2B_2D_A3_R50_DEV_TRAIN_R4_SINGLE_REVIEW_RESPONSE_TEMPLATE_V1.jsonl',
    fileSha256: 'd532cc4b77ed104abeb516ec98382972f0ed7ee3a3b168a19b4de028c037b4aa',
    bytes: 59274,
    records: 222,
  }),
  internalIndex: Object.freeze({
    path: 'docs/evaluation/corpus/PHASE_2B_2D_A3_R50_DEV_TRAIN_R4_A4_HANDOFF_INDEX_V1.json',
    fileSha256: '574e981cf5ec255102983b810685b544ff20e58fce6fb7fec5ad6fc53c1f77f5',
    bytes: 83590,
    reviewerVisible: false,
  }),
  census: Object.freeze({
    path: 'docs/evaluation/PHASE_2B_2D_A3_R50_DEV_TRAIN_R4_A4_HANDOFF_CENSUS_V1.json',
    fileSha256: 'ee7d408c3e6dbc9a8ff4cd3ca308cdd79fbe2f5deab6c854eb6ea02fb3a4329c',
  }),
});

/** R51's own artifacts. The completed-response file is NOT one of them. */
export const R51_ARTIFACT_PATHS = Object.freeze({
  ownerApproval:
    'docs/evaluation/PHASE_2B_2D_A4_DEV_TRAIN_HUMAN_SINGLE_REVIEW_OWNER_APPROVAL_V1.json',
  authority: 'docs/evaluation/PHASE_2B_2D_A4_DEV_TRAIN_HUMAN_SINGLE_REVIEW_AUTHORITY_V1.json',
  census: 'docs/evaluation/PHASE_2B_2D_A4_R51_DEV_TRAIN_SINGLE_REVIEW_AUTHORITY_CENSUS_V1.json',
  audit: 'docs/audits/PHASE_2B_2D_A4_R51_DEV_TRAIN_HUMAN_SINGLE_REVIEW_AUTHORISATION_V1.md',
  reviewTool: 'docs/evaluation/corpus/PHASE_2B_2D_A4_DEV_TRAIN_SINGLE_REVIEW_TOOL_V1.html',
});

/**
 * The FUTURE completed-response file. Defined and validated here; produced
 * only later, by humans, in their browser. R51 never writes it.
 */
export const COMPLETED_RESPONSE_FILE_NAME =
  'PHASE_2B_2D_A4_DEV_TRAIN_SINGLE_REVIEW_RESPONSES_V1.jsonl' as const;
export const COMPLETED_RESPONSE_SCHEMA =
  'PHASE_2B_2D_A4_DEV_TRAIN_SINGLE_REVIEW_RESPONSES_V1' as const;
export const COMPLETED_RESPONSE_KEYS = Object.freeze([
  'goldId',
  'rubricVersion',
  'rubricSha256',
  'reviewerActorKey',
  'verdict',
  'unit_type',
  'hard_negative',
  'reviewNote',
] as const);

/** Local workflow states. Only COMPLETED ever reaches the completed export. */
export const WORKFLOW_STATES = Object.freeze([
  'UNREVIEWED',
  'DEFERRED_FOR_LANGUAGE_COMPETENT_HUMAN',
  'COMPLETED',
] as const);
export type WorkflowState = (typeof WORKFLOW_STATES)[number];

export const LANGUAGE_DEFER_STATE = 'DEFERRED_FOR_LANGUAGE_COMPETENT_HUMAN' as const;

/** The marker every offline draft file carries. Drafts are never corpus data. */
export const DRAFT_KIND = 'NON_CANONICAL_HUMAN_REVIEW_DRAFT' as const;
export const DRAFT_SCHEMA = 'PHASE_2B_2D_A4_DEV_TRAIN_SINGLE_REVIEW_DRAFT_V1' as const;
export const LOCAL_STORAGE_KEY_PREFIX = 'nwf-a4-dev-train-single-review-draft-v1' as const;

/** The existing opaque actor-key form (migration 0007's `actor_key` CHECK). */
export const R51_ACTOR_KEY_PATTERN_SOURCE = '^[a-z0-9][a-z0-9_-]{2,63}$' as const;
export const R51_ACTOR_KEY_PATTERN = new RegExp(R51_ACTOR_KEY_PATTERN_SOURCE);

/** The exact authority shape the owner approved. Anything wider refuses. */
export const R51_AUTHORITY_FLAGS = Object.freeze({
  humanReviewAuthorised: true,
  humanReviewExecuted: false,
  singleReviewPerItem: true,
  dualReviewRequired: false,
  multipleHumanActorsAcrossDifferentItemsAllowed: true,
  secondLabelForSameItemAllowed: false,
  modelAssistanceAuthorised: false,
  machineTranslationAuthorised: false,
  liveBrowsingAuthorised: false,
  externalSearchAuthorised: false,
  historicalGoldAuthorised: false,
  devConfirmAuthorised: false,
  finalHoldoutAuthorised: false,
  a5Authorised: false,
});

/** The ONE action R51's authority artifact may name. */
export const R51_AUTHORISED_ACTION =
  'HUMAN_SINGLE_REVIEW_OF_THE_EXACT_R50_DEV_TRAIN_PACKAGE_UNDER_THE_EXACT_R49_RUBRIC' as const;

export const R51_SUCCESS_TERMINAL =
  'A4_DEV_TRAIN_HUMAN_SINGLE_REVIEW_AUTHORISED_TOOL_READY_AWAIT_HUMAN_COMPLETION' as const;

export const NOT_YET_MEASURABLE_PRE_LABEL = 'NOT_YET_MEASURABLE_PRE_LABEL' as const;

/** Assistance a reviewer may NOT use, as recorded in the approval. */
export const FORBIDDEN_REVIEW_ASSISTANCE = Object.freeze([
  'ChatGPT',
  'Claude',
  'Gemini',
  'any other model or classifier',
  'machine translation',
  'browser auto-translation',
  'Google Translate',
  'live search',
  'any external website, including the live page itself',
  'any historical label',
]);
