/**
 * PHASE 2B-2D2C-F7 — THE F6 RESTART STUDY'S ROOTS, AS THE EXECUTION LAYER SEES THEM.
 *
 * The owner-approved F6 freeze names exactly one study root and one control
 * root (`f6/studyPlanCoreF6.ts` pins both, and the freeze schema refuses any
 * other value). Every F7 module derives a slot's output root, a candidate
 * path or a study-approval containment check from THESE two bindings and
 * nowhere else, so no caller can supply a root of its own.
 *
 * They are re-exported here, rather than imported from `f6/` at every use,
 * for one reason: the zero-provider execution suite must be able to redirect
 * the study root to a temporary directory WITHOUT touching the F6 freeze
 * schema, which pins the real root as a literal. This module has no other
 * content.
 *
 * PURE. Creates nothing.
 */
import { F6_CONTROL_ROOT, F6_STUDY_ROOT } from '../f6/studyPlanCoreF6.js';

export const F7_STUDY_ROOT: string = F6_STUDY_ROOT;
export const F7_CONTROL_ROOT: string = F6_CONTROL_ROOT;
