/**
 * WW E-W - THE PUBLIC SURFACE OF THE ACQUISITION WIRING (ADR 0030).
 *
 * The CLI reaches the wiring only through this file. Nothing exported here
 * holds authority: stage handlers run only under a `CampaignAuthority`
 * derived from a VERIFIED OWNER campaign signature (the campaign trust set is
 * EMPTY in this build); the batched review signs only under the PINNED review
 * trust set (also EMPTY); the campaign signer signs, and a signature counts
 * only where a reviewed source change lists its key.
 */
export {
  CampaignSigningRefusal,
  CAMPAIGN_DRAFT_VERSION,
  CAMPAIGN_DRAFT_VERSION_V2,
  CAMPAIGN_DRAFT_VERSION_V3,
  TEMPLATE_BUDGETS,
  TEMPLATE_CONTINUATION_MAX_SEARCH_RUNS,
  TEMPLATE_LINK_OUT_MAX_HOPS,
  TEMPLATE_DEFAULT_WINDOW_DAYS,
  TEMPLATE_MAX_WINDOW_DAYS,
  campaignTemplate,
  parseCampaignDraft,
  signCampaignDraft,
  type CampaignDraft,
  type CampaignDraftContinuation,
  type SignedCampaign,
} from './campaignSigner.js';
export {
  ACQUISITION_WIRING_ACTOR_KEY,
  campaignSubjectIdOf,
  type WiringDeps,
  type WiringPools,
} from './context.js';
export {
  COUNTRY_MENTION_MAX_CHARS,
  COUNTRY_MENTION_MAX_LINES,
  CountryStatementRefusal,
  countriesNamedIn,
  countryMentionsOf,
  parseCountryStatements,
  planCountryStatement,
  type CountryMention,
  type CountryStatement,
} from './countryMentions.js';
export { WIRED_STAGES, continuationScopeCheck, createStageHandlers } from './handlers.js';
export {
  OUTBOX_DESCRIPTOR_FILE,
  OUTBOX_EXPORT_V2_FILE,
  OUTBOX_MANIFEST_FILE,
  OUTBOX_SUBJECT_FACTS_FILE,
  OutboxRefusal,
  assertOutboxRoot,
  type OutboxManifestLine,
} from './outbox.js';
export {
  createProductionStageHandlers,
  type ProductionWiring,
  type ProductionWiringInput,
  type WiringRole,
} from './production.js';
export { OUTBOX_FORMAT } from './records.js';
export {
  REVIEW_BATCH_MAX_SUBJECTS,
  ReviewBatchRefusal,
  listAwaitingReview,
  parseReviewExpectations,
  planReviewBatch,
  signCampaignReviews,
  type AwaitingReviewEntry,
  type ReviewBatchPools,
  type ReviewBatchResult,
} from './review.js';
export {
  SubjectStateChanged,
  loadOwnerSigningKey,
  operationalReviewTrust,
  readSubjectReviewState,
  type OwnerReviewTrust,
  type OwnerSigningKey,
  type SubjectReviewState,
} from './reviewBridge.js';
export { PassphraseFdRefusal, passphraseFdOf, readPassphraseFromFd } from './passphraseFd.js';
export {
  ACQUISITION_STATUS_SCHEMA,
  FAILURE_EXPLANATIONS,
  loadAcquisitionStatusV1,
  type AcquisitionStatusV1,
} from './status.js';
