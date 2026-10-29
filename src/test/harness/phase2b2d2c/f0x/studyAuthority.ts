/**
 * PHASE 2B-2D2C-F0X — THE STUDY AUTHORITY SEAM.
 *
 * The all-ten preflight (`allTenPreflight.ts`), the composed per-slot
 * decision (`composedExecutionDecision.ts`) and the study executor
 * (`studyExecutor.ts`) each evaluate two authorities: a per-slot candidate
 * lock and the one study-level approval. Before recovery-1 both were
 * hard-wired to the original F0X study (`evaluateF0WSlotExecutionLock`,
 * `evaluateF0XStudyExecutionApproval`, frozen study root).
 *
 * The owner-approved zero-inference recovery (overlay
 * `PHASE_2B_2D2C_F0X_RECOVERY_1_OVERLAY_V1.json`) changes ONLY the output
 * location and the control plane, so this module names exactly that seam and
 * nothing more: which lock, which approval, which study root, which extra
 * study-level request-free checks, and which recovery binding the durable
 * study/slot records carry. Every gate ORDER, the sequencing rule, the
 * evidence classification, the child freeze path and `runExperiment` stay
 * exactly as they are.
 *
 * `ORIGINAL_F0X_STUDY_AUTHORITY` is the pre-recovery behaviour, byte for byte:
 * a caller that passes no authority gets it.
 *
 * PURE. No network, no database, no filesystem of its own.
 */
import {
  evaluateF0WSlotExecutionLock,
  type F0WSlotExecutionAuthorisation,
  type F0WSlotExecutionLockInput,
} from '../f0w/authorisationF0W.js';
import type { StudySlotIdentity } from '../f0v/studyPlanCore.js';
import {
  evaluateF0XStudyExecutionApproval,
  type F0XStudyExecutionApproval,
  type F0XStudyExecutionApprovalInput,
} from './studyExecutionApprovalF0X.js';

/** Every field a per-slot lock grants on, whichever closed schema version carried it. */
export type SlotAuthorisationCore = Omit<F0WSlotExecutionAuthorisation, 'authorisationVersion'> & {
  readonly authorisationVersion: string;
};

/** Every field a study approval grants on, whichever closed schema version carried it. */
export type StudyApprovalCore = Omit<F0XStudyExecutionApproval, 'approvalVersion'> & {
  readonly approvalVersion: string;
};

export type StudySlotLockDecision =
  | {
      readonly granted: true;
      readonly authorisation: SlotAuthorisationCore;
      readonly slot: StudySlotIdentity;
      readonly authorisationSha256: string;
      readonly authorisationBytes: number;
    }
  | { readonly granted: false; readonly refusal: string; readonly detail: string };

export type StudyApprovalDecision =
  | {
      readonly granted: true;
      readonly approval: StudyApprovalCore;
      readonly approvalSha256: string;
    }
  | { readonly granted: false; readonly refusal: string; readonly detail: string };

export interface StudyAuthority {
  readonly kind: 'F0X_ORIGINAL' | 'F0X_RECOVERY_1';
  /** The study root this authority's candidates and approval bind. `null` = the caller's (default: frozen F0V) root. */
  readonly studyRoot: string | null;
  readonly evaluateSlotLock: (input: F0WSlotExecutionLockInput) => StudySlotLockDecision;
  readonly evaluateStudyApproval: (input: F0XStudyExecutionApprovalInput) => StudyApprovalDecision;
  /**
   * Request-free study-level checks run INSIDE the all-ten preflight, before
   * anything is written. Returns problems; empty means none.
   */
  readonly studyLevelPreflight: () => readonly string[];
  /** Extra binding written into `study-manifest.json`, or null for none. */
  readonly studyManifestBinding: () => Readonly<Record<string, unknown>> | null;
  /** Extra binding written into a slot's `study-slot-identity.json`, or null for none. */
  readonly outerSlotIdentityBinding: (
    authorisation: SlotAuthorisationCore,
  ) => Readonly<Record<string, unknown>> | null;
}

/** The original, pre-recovery F0X study: exactly the gates F0X always used. */
export const ORIGINAL_F0X_STUDY_AUTHORITY: StudyAuthority = Object.freeze({
  kind: 'F0X_ORIGINAL',
  studyRoot: null,
  evaluateSlotLock: evaluateF0WSlotExecutionLock,
  evaluateStudyApproval: evaluateF0XStudyExecutionApproval,
  studyLevelPreflight: () => [],
  studyManifestBinding: () => null,
  outerSlotIdentityBinding: () => null,
});
