/**
 * PHASE 2B-2D2C-F0X RECOVERY-1 — THE OWNER-APPROVED RECOVERY OVERLAY.
 *
 * The first real F0X study invocation (2026-09-16) consumed all ten slot
 * candidates with ZERO inference (ten Class B slots, see
 * `PHASE_2B_2D2C_F0X_FAILED_STUDY_ERRATUM_V1.json`). The owner approved a
 * fresh OUTPUT NAMESPACE for it — an output-location and control-plane
 * recovery only, NOT an amendment of the F0V semantic design. The historical
 * F0V freeze keeps naming the failed root; nothing historical is edited.
 *
 * `docs/evaluation/PHASE_2B_2D2C_F0X_RECOVERY_1_OVERLAY_V1.json` is the one
 * durable record binding: the F0V freeze/plan/approval/F0U identities, the
 * corrected implementation commit, the failed study root/control root, its
 * tree/inventory/erratum/approval identities, the ten spent candidate hashes,
 * the one-to-one failed-slot -> recovery-slot mapping, the recovery root and
 * control directory, and the statement that the failed slots count zero
 * toward N=5. This module pins its raw SHA-256 and refuses any other bytes.
 *
 * PURE aside from nothing: the caller supplies the bytes it read. No network,
 * no database, no filesystem of its own.
 */
import { resolve, sep } from 'node:path';
import { z } from 'zod';
import {
  F0U_METHODOLOGY_RAW_SHA256,
  F0V_APPROVAL_RECORD_RAW_SHA256,
  F0V_STUDY_ROOT,
  PROPOSED_F0V_FREEZE_RAW_SHA256,
  PROPOSED_F0V_PLAN_SHA256,
} from '../f0v/freezeF0V.js';
import {
  F0V_SLOTS,
  F0V_TOTAL_SLOTS,
  futureOutputRootPathOf,
  sha256Hex,
} from '../f0v/studyPlanCore.js';

export const F0X_RECOVERY_1_OVERLAY_PATH =
  'docs/evaluation/PHASE_2B_2D2C_F0X_RECOVERY_1_OVERLAY_V1.json';
export const F0X_RECOVERY_1_OVERLAY_RAW_SHA256 =
  '960289f935f11a12d9e2dd03d4c154bec022e450b2c675d1a384b209b6d69399';
export const F0X_RECOVERY_1_OVERLAY_VERSION = 'phase2b-2d2c-f0x-recovery-1-overlay-v1';

/** The owner-approved recovery namespace. Never a CLI flag; only ever read from the pinned overlay. */
export const F0X_RECOVERY_1_STUDY_ROOT =
  '/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/replication-v4-v5-n5-recovery-1';
export const F0X_RECOVERY_1_CONTROL_DIR =
  '/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/replication-v4-v5-n5-recovery-1-control';

/** The commit that corrected both F0X defects; every recovery execution build must descend from it. */
export const F0X_CORRECTED_IMPLEMENTATION_COMMIT = '922939cecd100c13e772fec03f23377552df1aab';

export const CLASS_B_DISPOSITION = 'CLASS_B_AUTHORISATION_CONSUMED_CONFIRMED_PRE_INFERENCE_REFUSAL';

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const GitSha = z.string().regex(/^[0-9a-f]{40}$/);
const AbsolutePath = z.string().regex(/^\//);

export const Recovery1SlotMappingSchema = z.strictObject({
  slotId: z.string().min(1),
  sequence: z.int().min(1).max(F0V_TOTAL_SLOTS),
  variantName: z.enum(['PROMPT_V4_CANONICAL', 'PROMPT_V5_CANONICAL']),
  failedOutputRoot: AbsolutePath,
  recoveryOutputRoot: AbsolutePath,
  spentCandidateAuthorisationSha256: Sha256,
  failedChildPreflightFileSha256: Sha256,
  failedChildPreflightRecordSha256: Sha256,
  failedSlotTreeSha256: Sha256,
  failedDisposition: z.literal(CLASS_B_DISPOSITION),
  failedSlotCountsTowardN: z.literal(false),
});

export const Recovery1OverlaySchema = z.strictObject({
  overlayId: z.literal('PHASE_2B_2D2C_F0X_RECOVERY_1_OVERLAY_V1'),
  overlayVersion: z.literal(F0X_RECOVERY_1_OVERLAY_VERSION),
  status: z.literal('OWNER_APPROVED_OUTPUT_NAMESPACE_RECOVERY'),
  scope: z.literal('DEVELOPMENT_ONLY'),
  studyId: z.literal('REPLICATION_V4_V5_N5'),
  ownerDecision: z.strictObject({
    decision: z.literal('APPROVE_ZERO_INFERENCE_RECOVERY_OUTPUT_NAMESPACE_CHANGE'),
    decidedOnUtcDate: z.string().min(1),
    kind: z.literal('OUTPUT_LOCATION_AND_CONTROL_PLANE_RECOVERY_ONLY'),
    amendsSemanticF0VDesign: z.literal(false),
    authorisesRequestFreeMaterialisation: z.literal(true),
    authorisesExecution: z.literal(false),
  }),
  frozenSemanticDesign: z.strictObject({
    f0vFreezeRawSha256: Sha256,
    f0vPlanSha256: Sha256,
    f0vApprovalRecordRawSha256: Sha256,
    f0uMethodologyRawSha256: Sha256,
    frozenStudyRootAsRecordedInF0V: AbsolutePath,
    unchanged: z.array(z.string().min(1)).min(1),
  }),
  correctedExecution: z.strictObject({
    correctedImplementationCommit: GitSha,
    recoveryExecutionBuildMustDescendFromCorrectedImplementationCommit: z.literal(true),
    preservedCorrections: z.array(z.string().min(1)).length(2),
  }),
  failedStudy: z.strictObject({
    studyRoot: AbsolutePath,
    controlRoot: AbsolutePath,
    readOnly: z.literal(true),
    forbiddenAsOutputRootContainer: z.literal(true),
    executionIntegrationCommit: GitSha,
    studyExecutionApprovalSha256: Sha256,
    wholeStudyTree: z.strictObject({ fileCount: z.int().min(1), treeSha256: Sha256 }),
    controlFileCount: z.int().min(0),
    inventoryPath: z.string().min(1),
    inventoryRawSha256: Sha256,
    erratumPath: z.string().min(1),
    erratumRawSha256: Sha256,
    providerRequestsObserved: z.literal(0),
    adapterAttemptsObserved: z.literal(0),
    semanticExecutionMarkers: z.literal(0),
    correctedClassB: z.literal(F0V_TOTAL_SLOTS),
    replicatesContributedTowardN: z.literal(0),
  }),
  recoveryNamespace: z.strictObject({ studyRoot: AbsolutePath, controlDir: AbsolutePath }),
  slotMapping: z.array(Recovery1SlotMappingSchema).length(F0V_TOTAL_SLOTS),
  statement: z.string().min(1),
});

export type Recovery1Overlay = z.infer<typeof Recovery1OverlaySchema>;
export type Recovery1SlotMapping = z.infer<typeof Recovery1SlotMappingSchema>;

/** A parsed, structurally verified overlay plus the SHA-256 of the exact bytes it came from. */
export interface Recovery1Binding {
  readonly overlay: Recovery1Overlay;
  readonly overlayRawSha256: string;
}

export class Recovery1OverlayError extends Error {
  override readonly name = 'Recovery1OverlayError';
  constructor(
    readonly reason: 'HASH_MISMATCH' | 'MALFORMED' | 'STRUCTURE' | 'NOT_THE_APPROVED_NAMESPACE',
    message: string,
  ) {
    super(message);
  }
}

function isSameOrInside(candidate: string, container: string): boolean {
  const a = resolve(candidate);
  const b = resolve(container);
  return a === b || a.startsWith(b + sep);
}

/** True iff `candidate` lies strictly inside `container` (never equal to it). */
export function isStrictlyInside(candidate: string, container: string): boolean {
  return resolve(candidate).startsWith(resolve(container) + sep);
}

/** True iff either path is the same as, or inside, the other. */
export function pathsOverlap(a: string, b: string): boolean {
  return isSameOrInside(a, b) || isSameOrInside(b, a);
}

/**
 * Structural agreement of an overlay with THIS build: the F0V identities,
 * the failed root equals the frozen F0V study root, the ten mapping entries
 * are the frozen slots in frozen order with both roots derived (never typed),
 * all ten spent hashes distinct, and the recovery namespace is disjoint from
 * the failed study root and control root in both directions.
 */
export function assertRecovery1OverlayStructure(overlay: Recovery1Overlay): void {
  const problems: string[] = [];
  const design = overlay.frozenSemanticDesign;
  if (design.f0vFreezeRawSha256 !== PROPOSED_F0V_FREEZE_RAW_SHA256) problems.push('f0vFreeze');
  if (design.f0vPlanSha256 !== PROPOSED_F0V_PLAN_SHA256) problems.push('f0vPlan');
  if (design.f0vApprovalRecordRawSha256 !== F0V_APPROVAL_RECORD_RAW_SHA256) {
    problems.push('f0vApprovalRecord');
  }
  if (design.f0uMethodologyRawSha256 !== F0U_METHODOLOGY_RAW_SHA256)
    problems.push('f0uMethodology');
  if (design.frozenStudyRootAsRecordedInF0V !== F0V_STUDY_ROOT) problems.push('frozenStudyRoot');
  if (overlay.failedStudy.studyRoot !== F0V_STUDY_ROOT) problems.push('failedStudy.studyRoot');
  if (
    overlay.correctedExecution.correctedImplementationCommit !== F0X_CORRECTED_IMPLEMENTATION_COMMIT
  ) {
    problems.push('correctedImplementationCommit');
  }
  const failed = overlay.failedStudy;
  const recovery = overlay.recoveryNamespace;
  for (const [name, path] of [
    ['recoveryNamespace.studyRoot', recovery.studyRoot],
    ['recoveryNamespace.controlDir', recovery.controlDir],
  ] as const) {
    if (pathsOverlap(path, failed.studyRoot) || pathsOverlap(path, failed.controlRoot)) {
      problems.push(`${name} overlaps the failed study root or its control root`);
    }
  }
  if (pathsOverlap(recovery.studyRoot, recovery.controlDir)) {
    problems.push('recovery study root and control directory overlap');
  }
  for (const [index, entry] of overlay.slotMapping.entries()) {
    const slot = F0V_SLOTS[index]!;
    if (
      entry.slotId !== slot.slotId ||
      entry.sequence !== slot.sequence ||
      entry.variantName !== slot.variantName
    ) {
      problems.push(`slotMapping[${index}] is not frozen slot ${slot.slotId}`);
      continue;
    }
    if (entry.failedOutputRoot !== futureOutputRootPathOf(failed.studyRoot, slot)) {
      problems.push(`slotMapping[${index}].failedOutputRoot`);
    }
    if (entry.recoveryOutputRoot !== futureOutputRootPathOf(recovery.studyRoot, slot)) {
      problems.push(`slotMapping[${index}].recoveryOutputRoot`);
    }
  }
  const spent = overlay.slotMapping.map((entry) => entry.spentCandidateAuthorisationSha256);
  if (new Set(spent).size !== spent.length) problems.push('spent candidate hashes not distinct');
  if (problems.length > 0) {
    throw new Recovery1OverlayError(
      'STRUCTURE',
      `the recovery-1 overlay disagrees with this build: ${problems.join('; ')}.`,
    );
  }
}

function parseOverlay(bytes: Buffer): Recovery1Overlay {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Recovery1OverlayError('MALFORMED', 'the recovery-1 overlay is not valid JSON.');
  }
  const result = Recovery1OverlaySchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new Recovery1OverlayError(
      'MALFORMED',
      `the recovery-1 overlay does not match its closed schema at ${first ? first.path.join('.') || '<root>' : '<unknown>'}: ${first?.message ?? 'unknown'}.`,
    );
  }
  return result.data;
}

/**
 * THE production loader: the exact pinned bytes, the closed schema, structural
 * agreement with this build, and the owner-approved recovery root and control
 * directory. Anything else throws; there is no fallback.
 */
export function loadRecovery1OverlayFromBytes(bytes: Buffer): Recovery1Binding {
  const rawSha256 = sha256Hex(bytes);
  if (rawSha256 !== F0X_RECOVERY_1_OVERLAY_RAW_SHA256) {
    throw new Recovery1OverlayError(
      'HASH_MISMATCH',
      `recovery-1 overlay raw SHA-256 ${rawSha256} is not the pinned ${F0X_RECOVERY_1_OVERLAY_RAW_SHA256}.`,
    );
  }
  const overlay = parseOverlay(bytes);
  assertRecovery1OverlayStructure(overlay);
  if (
    overlay.recoveryNamespace.studyRoot !== F0X_RECOVERY_1_STUDY_ROOT ||
    overlay.recoveryNamespace.controlDir !== F0X_RECOVERY_1_CONTROL_DIR
  ) {
    throw new Recovery1OverlayError(
      'NOT_THE_APPROVED_NAMESPACE',
      'the recovery-1 overlay names a recovery root or control directory other than the owner-approved ones.',
    );
  }
  return { overlay, overlayRawSha256: rawSha256 };
}

/**
 * TEST SEAM ONLY: schema + structure, WITHOUT the pinned hash or the pinned
 * namespace, so tests can bind temporary roots. The production CLI and the
 * materialiser never call it (asserted by the F0X firewall).
 */
export function parseRecovery1OverlayForTestOnly(bytes: Buffer): Recovery1Binding {
  const overlay = parseOverlay(bytes);
  assertRecovery1OverlayStructure(overlay);
  return { overlay, overlayRawSha256: sha256Hex(bytes) };
}

export function recovery1MappingFor(
  binding: Recovery1Binding,
  slotId: string,
): Recovery1SlotMapping {
  const entry = binding.overlay.slotMapping.find((candidate) => candidate.slotId === slotId);
  if (entry === undefined) {
    throw new Recovery1OverlayError(
      'STRUCTURE',
      `no recovery-1 mapping exists for slot ${slotId}.`,
    );
  }
  return entry;
}

/** The ten spent candidate hashes, in frozen slot order. */
export function recovery1SpentCandidateHashes(binding: Recovery1Binding): readonly string[] {
  return binding.overlay.slotMapping.map((entry) => entry.spentCandidateAuthorisationSha256);
}
