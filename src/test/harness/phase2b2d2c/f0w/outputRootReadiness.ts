/**
 * PHASE 2B-2D2C-F0W — OUTPUT-ROOT READINESS, INSPECT ONLY.
 *
 * The frozen study root and its ten slot subdirectories
 * (`F0V_STUDY_ROOT`/`futureOutputRootPathOf`, `f0v/studyPlanCore.ts`) must
 * all be ABSENT before this task's own readiness check passes — this module
 * verifies that and creates nothing. The FUTURE validator a real execution
 * path will need — that one slot's root is absolute, real, symlink-free,
 * outside every repository worktree and every historical attempt root, and
 * distinct from every other slot's root — is built on top of the ALREADY
 * LANDED, already-tested `validateOutputRoot` (`artifacts.ts`); this module
 * adds no second implementation of that check, only the slot-shaped wrapper
 * around it and the STUDY-WIDE distinctness/uniqueness proof
 * `futureOutputRootsAreDistinct` (`studyPlanCore.ts`) already provides at
 * the identity level.
 *
 * Pure aside from the injected probes. No filesystem of its own, no network,
 * no database, no clock. Never creates, removes or renames anything.
 */
import {
  validateOutputRoot,
  type OutputRootDecision,
  type OutputRootProbes,
} from '../artifacts.js';
import { F0V_STUDY_ROOT } from '../f0v/freezeF0V.js';
import { F0V_SLOTS, futureOutputRootPathOf, type StudySlotIdentity } from '../f0v/studyPlanCore.js';

export interface AbsenceProbes {
  readonly exists: (path: string) => boolean;
}

export interface SlotRootAbsence {
  readonly slotId: string;
  readonly root: string;
  readonly absent: boolean;
}

export interface StudyRootReadiness {
  readonly studyRoot: string;
  readonly studyRootAbsent: boolean;
  readonly slotRoots: readonly SlotRootAbsence[];
  /** True iff the study root AND every one of the ten slot roots are absent. */
  readonly allAbsent: boolean;
}

/**
 * Inspects (never creates) the frozen study root and its ten slot
 * subdirectories. `allAbsent: true` is the ONLY state F0W's own readiness
 * report may call clean — any pre-existing empirical content anywhere in
 * this namespace is reported, never silently tolerated or removed.
 */
export function inspectStudyRootReadiness(
  probes: AbsenceProbes,
  studyRoot: string = F0V_STUDY_ROOT,
  slots: readonly StudySlotIdentity[] = F0V_SLOTS,
): StudyRootReadiness {
  const studyRootAbsent = !probes.exists(studyRoot);
  const slotRoots: SlotRootAbsence[] = slots.map((slot) => {
    const root = futureOutputRootPathOf(studyRoot, slot);
    return { slotId: slot.slotId, root, absent: !probes.exists(root) };
  });
  return {
    studyRoot,
    studyRootAbsent,
    slotRoots,
    allAbsent: studyRootAbsent && slotRoots.every((entry) => entry.absent),
  };
}

/**
 * The FUTURE per-slot validator for when a slot's root is expected to
 * exist and be writable: absolute, real, symlink-free, outside every
 * forbidden container the caller names (its own repository, every worktree,
 * every historical attempt root — none of which this module hardcodes,
 * since none of them is a compile-time constant: they are always
 * operator-supplied, exactly as every prior attempt's output root has
 * been). Reuses `validateOutputRoot` verbatim; this module adds no second
 * validation implementation.
 */
export function validateSlotOutputRootForExecution(
  candidate: string,
  forbiddenContainers: readonly string[],
  probes: OutputRootProbes,
): OutputRootDecision {
  return validateOutputRoot(candidate, forbiddenContainers, probes);
}

/** True iff every one of the ten frozen slot roots differs from every other — an identity-level proof, no filesystem access. */
export function slotOutputRootsAreUnique(slots: readonly StudySlotIdentity[] = F0V_SLOTS): boolean {
  const roots = slots.map((slot) => futureOutputRootPathOf(F0V_STUDY_ROOT, slot));
  return new Set(roots).size === roots.length;
}
