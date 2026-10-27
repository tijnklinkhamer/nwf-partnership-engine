/**
 * WW E-Q - THE PUBLIC SURFACE OF THE OWNER-SIGNED ACQUISITION CAMPAIGN AND
 * ITS WORK QUEUE (ADR 0029, migration 0023).
 *
 * The wiring package plugs real stage handlers into `StageHandler` and runs
 * `runWorker`. Nothing exported here can mint campaign authority: a
 * `CampaignAuthority` is derived only from a stored campaign whose OWNER
 * signature verifies under the pinned trust set, which is EMPTY in this build.
 */
export {
  CampaignAuthority,
  CampaignRecordRefusal,
  deriveCampaignAuthority,
  loadStoredCampaign,
  recordCampaign,
  recordControlEvent,
  verifyStoredCampaign,
  type CampaignAuthorityRefusalCode,
  type CampaignAuthorityResult,
  type CampaignRecordRefusalCode,
  type ControlEventRequest,
  type ControlEventResult,
  type RecordCampaignResult,
} from './authority.js';
export {
  BUDGET_BOUNDS,
  BUDGET_NAMES,
  CAMPAIGN_ACTION,
  CAMPAIGN_DOCUMENT_VERSION,
  CAMPAIGN_PROTOCOL,
  CampaignProtocolError,
  OWNER_CAMPAIGN_AUTHORITY,
  WORLDWIDE,
  type BudgetName,
  type CampaignBudgets,
  type CampaignPayload,
  type CampaignScope,
} from './document.js';
export { selectNextCandidate, type ClaimCandidate, type SchedulerHistory } from './scheduler.js';
export { loadCampaignStatus, type CampaignStatus } from './status.js';
export {
  ACQUISITION_WORKER_ROLE,
  LeaseLostError,
  OwnerPathRequired,
  WorkerSessionRefused,
  assertWorkerSession,
  claimNextWorkItem,
  enqueueCampaignLinkOutRoot,
  enqueueOwnerRoot,
  extendClaimLease,
  inWorkerTransaction,
  loadCampaignUsage,
  recordWorkOutcome,
  releaseIdentityReviewItem,
  seedCampaignSearchGrantRoots,
  OutcomeRefusedError,
  type ClaimedWork,
  type CampaignUsage,
  type Consumption,
  type RecordedOutcome,
  type WorkItemSeed,
  type WorkItemView,
} from './store.js';
export {
  CampaignTrustSet,
  OPERATIONAL_OWNER_CAMPAIGN_KEYS,
  type CampaignTrustEntry,
} from './trust.js';
export { VerifiedCampaignEnvelope } from './verify.js';
export * from './vocabulary.js';
export {
  WorkerConfigRefusal,
  checkHandlerCoverage,
  resolveStageOutcome,
  runWorker,
  type HandlerCampaignView,
  type RunWorkerOptions,
  type StageHandler,
  type StageHandlerContext,
  type StageOutcome,
  type WorkerConfigRefusalCode,
  type WorkerSummary,
} from './worker.js';
