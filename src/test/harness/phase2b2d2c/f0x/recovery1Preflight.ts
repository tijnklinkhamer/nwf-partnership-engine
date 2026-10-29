/**
 * PHASE 2B-2D2C-F0X RECOVERY-1 — THE REQUEST-FREE STUDY-LEVEL RECOVERY PREFLIGHT.
 *
 * Runs inside the all-ten preflight (`StudyAuthority.studyLevelPreflight`),
 * before anything is written, consumed or dispatched, and again in the
 * materialiser before anything is created. Two halves:
 *
 *   FAILED-STUDY IMMUTABILITY — the committed inventory and erratum re-hash to
 *   the overlay's pinned raw SHA-256s; the failed study root and its control
 *   root are RE-INVENTORIED request-free (`buildFailedStudyInventory`) and the
 *   result must equal the committed inventory exactly; the whole-tree hash,
 *   ten Class B slots, zero semantic markers, zero provider requests and zero
 *   adapter attempts are re-asserted; every overlay mapping entry agrees with
 *   both the inventory and the erratum.
 *
 *   RECOVERY NAMESPACE — the recovery root and control directory are disjoint
 *   from the failed roots; the recovery study root exists as a real directory
 *   holding EXACTLY the ten frozen slot directories and nothing else (no study
 *   manifest, no terminal, no events); every slot root is a real, EMPTY
 *   directory; the control directory exists; the checked-out HEAD descends from
 *   the corrected implementation commit.
 *
 * Reads, never writes. PURE aside from the injected probes. No network, no
 * database, no child process of its own, no provider, no gold or scoring.
 */
import { join } from 'node:path';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import { F0V_SLOTS, futureOutputRootPathOf } from '../f0v/studyPlanCore.js';
import { buildFailedStudyInventory, type InventoryProbes } from './failedStudyInventory.js';
import { CLASS_B_DISPOSITION, pathsOverlap, type Recovery1Binding } from './recovery1Overlay.js';

export interface Recovery1PreflightProbes {
  readonly readFile: (path: string) => Buffer;
  readonly sha256: (bytes: Buffer) => string;
  /** Read-only probes the failed-study inventory is re-derived with. */
  readonly inventoryProbes: InventoryProbes;
  /** True iff `path` exists as a directory whose real path is itself (no symlink component). */
  readonly isRealDirectory: (path: string) => boolean;
  /** The entry names directly under `path` (files AND directories); throws when unreadable. */
  readonly listDirectoryEntries: (path: string) => readonly string[];
  /** True iff `commit` is an ancestor of (or equal to) the checked-out HEAD. */
  readonly commitIsAncestorOfHead: (commit: string) => boolean;
}

interface CommittedInventoryShape {
  readonly wholeStudyTree?: { readonly treeSha256?: unknown; readonly fileCount?: unknown };
  readonly control?: { readonly controlRoot?: unknown; readonly files?: readonly unknown[] } | null;
  readonly studyRoot?: unknown;
  readonly totals?: Record<string, unknown>;
  readonly slots?: readonly {
    readonly slotId?: unknown;
    readonly treeSha256?: unknown;
    readonly candidateAuthorisationSha256?: unknown;
    readonly childPreflights?: readonly { fileSha256?: unknown; recordSha256?: unknown }[];
    readonly semanticExecutionMarkers?: readonly unknown[];
    readonly providerRequestsObserved?: unknown;
    readonly adapterAttemptsObserved?: unknown;
    readonly correctedClassification?: { readonly inclusionClass?: unknown };
  }[];
}

interface ErratumShape {
  readonly preservedEvidence?: {
    readonly inventoryRawSha256?: unknown;
    readonly wholeStudyTree?: { readonly treeSha256?: unknown };
  };
  readonly subject?: { readonly studyExecutionApprovalSha256?: unknown };
  readonly slots?: readonly {
    readonly slotId?: unknown;
    readonly failedOutputRoot?: unknown;
    readonly failedSlotTreeSha256?: unknown;
    readonly spentCandidateAuthorisationSha256?: unknown;
    readonly childPreflight?: { readonly fileSha256?: unknown; readonly recordSha256?: unknown };
    readonly correctedInclusionClass?: unknown;
    readonly countsTowardN?: unknown;
    readonly proposedReplacementOutputRoot?: unknown;
  }[];
}

function readPinnedJson<T>(
  label: string,
  path: string,
  expectedSha256: string,
  probes: Recovery1PreflightProbes,
  problems: string[],
): T | null {
  let bytes: Buffer;
  try {
    bytes = probes.readFile(path);
  } catch (error) {
    problems.push(
      `${label} is unreadable at ${path} (${error instanceof Error ? error.message : String(error)}).`,
    );
    return null;
  }
  const actual = probes.sha256(bytes);
  if (actual !== expectedSha256) {
    problems.push(`${label} re-hashes to ${actual}; the overlay pins ${expectedSha256}.`);
    return null;
  }
  try {
    return JSON.parse(bytes.toString('utf8')) as T;
  } catch {
    problems.push(`${label} is not valid JSON.`);
    return null;
  }
}

/**
 * FAILED-STUDY IMMUTABILITY half. `repoRoot` is where the committed inventory
 * and erratum live. Returns problems; empty means the preserved failed study
 * is exactly the evidence the overlay binds.
 */
export function failedStudyImmutabilityProblems(
  binding: Recovery1Binding,
  repoRoot: string,
  probes: Recovery1PreflightProbes,
): readonly string[] {
  const problems: string[] = [];
  const { overlay } = binding;
  const failed = overlay.failedStudy;

  const committedInventory = readPinnedJson<CommittedInventoryShape>(
    'the committed failed-study inventory',
    join(repoRoot, failed.inventoryPath),
    failed.inventoryRawSha256,
    probes,
    problems,
  );
  const erratum = readPinnedJson<ErratumShape>(
    'the committed failed-study erratum',
    join(repoRoot, failed.erratumPath),
    failed.erratumRawSha256,
    probes,
    problems,
  );

  let rederived: CommittedInventoryShape | null = null;
  try {
    rederived = JSON.parse(
      JSON.stringify(
        buildFailedStudyInventory(failed.studyRoot, probes.inventoryProbes, failed.controlRoot),
      ),
    ) as CommittedInventoryShape;
  } catch (error) {
    problems.push(
      `the failed study could not be re-inventoried (${error instanceof Error ? error.message : String(error)}).`,
    );
  }

  if (rederived !== null) {
    if (
      committedInventory !== null &&
      canonicalStringify(rederived) !== canonicalStringify(committedInventory)
    ) {
      problems.push(
        'the request-free re-inventory of the failed study root and control root differs from the committed inventory: the preserved evidence has changed.',
      );
    }
    if (rederived.studyRoot !== failed.studyRoot)
      problems.push('re-inventory study root mismatch.');
    if (rederived.wholeStudyTree?.treeSha256 !== failed.wholeStudyTree.treeSha256) {
      problems.push(
        `the failed study tree re-hashes to ${String(rederived.wholeStudyTree?.treeSha256)}; the overlay pins ${failed.wholeStudyTree.treeSha256}.`,
      );
    }
    if (rederived.wholeStudyTree?.fileCount !== failed.wholeStudyTree.fileCount) {
      problems.push('the failed study file count changed.');
    }
    if (
      rederived.control?.controlRoot !== failed.controlRoot ||
      rederived.control.files?.length !== failed.controlFileCount
    ) {
      problems.push('the failed control root is missing or its file count changed.');
    }
    const totals = rederived.totals ?? {};
    for (const [key, expected] of [
      ['slotsPresent', 10],
      ['classB', 10],
      ['classC', 0],
      ['ambiguous', 0],
      ['semanticExecutionMarkers', 0],
      ['providerRequestsObserved', 0],
      ['adapterAttemptsObserved', 0],
    ] as const) {
      if (totals[key] !== expected) {
        problems.push(
          `failed-study re-inventory totals.${key} is ${String(totals[key])}, not ${expected}.`,
        );
      }
    }
    for (const mapping of overlay.slotMapping) {
      const slot = rederived.slots?.find((entry) => entry.slotId === mapping.slotId);
      if (slot === undefined) {
        problems.push(`the failed study re-inventory has no ${mapping.slotId}.`);
        continue;
      }
      const preflight = slot.childPreflights?.[0];
      if (
        slot.candidateAuthorisationSha256 !== mapping.spentCandidateAuthorisationSha256 ||
        slot.treeSha256 !== mapping.failedSlotTreeSha256 ||
        slot.childPreflights?.length !== 1 ||
        preflight?.fileSha256 !== mapping.failedChildPreflightFileSha256 ||
        preflight.recordSha256 !== mapping.failedChildPreflightRecordSha256 ||
        slot.correctedClassification?.inclusionClass !== CLASS_B_DISPOSITION ||
        (slot.semanticExecutionMarkers?.length ?? -1) !== 0 ||
        slot.providerRequestsObserved !== 0 ||
        slot.adapterAttemptsObserved !== 0
      ) {
        problems.push(
          `the failed study's ${mapping.slotId} evidence does not match its overlay mapping (spent candidate, slot tree, child preflight, Class B, zero markers/requests/attempts).`,
        );
      }
    }
  }

  if (erratum !== null) {
    if (erratum.preservedEvidence?.inventoryRawSha256 !== failed.inventoryRawSha256) {
      problems.push('the erratum does not pin the overlay inventory hash.');
    }
    if (
      erratum.preservedEvidence?.wholeStudyTree?.treeSha256 !== failed.wholeStudyTree.treeSha256
    ) {
      problems.push('the erratum does not pin the overlay failed-study tree hash.');
    }
    if (erratum.subject?.studyExecutionApprovalSha256 !== failed.studyExecutionApprovalSha256) {
      problems.push('the erratum does not name the overlay failed study approval.');
    }
    for (const mapping of overlay.slotMapping) {
      const entry = erratum.slots?.find((candidate) => candidate.slotId === mapping.slotId);
      if (
        entry === undefined ||
        entry.failedOutputRoot !== mapping.failedOutputRoot ||
        entry.failedSlotTreeSha256 !== mapping.failedSlotTreeSha256 ||
        entry.spentCandidateAuthorisationSha256 !== mapping.spentCandidateAuthorisationSha256 ||
        entry.childPreflight?.fileSha256 !== mapping.failedChildPreflightFileSha256 ||
        entry.childPreflight.recordSha256 !== mapping.failedChildPreflightRecordSha256 ||
        entry.correctedInclusionClass !== CLASS_B_DISPOSITION ||
        entry.countsTowardN !== false ||
        entry.proposedReplacementOutputRoot !== mapping.recoveryOutputRoot
      ) {
        problems.push(`the erratum's ${mapping.slotId} entry does not match its overlay mapping.`);
      }
    }
  }
  return problems;
}

/**
 * RECOVERY NAMESPACE half: disjoint from the failed roots, the recovery root
 * holds exactly the ten EMPTY slot directories, the control directory exists,
 * and HEAD descends from the corrected commit.
 */
export function recoveryNamespaceProblems(
  binding: Recovery1Binding,
  probes: Recovery1PreflightProbes,
): readonly string[] {
  const problems: string[] = [];
  const { overlay } = binding;
  const failed = overlay.failedStudy;
  const recovery = overlay.recoveryNamespace;

  for (const path of [recovery.studyRoot, recovery.controlDir]) {
    if (pathsOverlap(path, failed.studyRoot) || pathsOverlap(path, failed.controlRoot)) {
      problems.push(`${path} overlaps the read-only failed study root or its control root.`);
    }
  }
  if (!probes.commitIsAncestorOfHead(overlay.correctedExecution.correctedImplementationCommit)) {
    problems.push(
      `the checked-out HEAD does not descend from corrected implementation commit ${overlay.correctedExecution.correctedImplementationCommit}.`,
    );
  }
  if (!probes.isRealDirectory(recovery.controlDir)) {
    problems.push(
      `the recovery control directory ${recovery.controlDir} does not exist as a real directory.`,
    );
  }
  if (!probes.isRealDirectory(recovery.studyRoot)) {
    problems.push(
      `the recovery study root ${recovery.studyRoot} does not exist as a real directory.`,
    );
    return problems;
  }
  const expectedNames = F0V_SLOTS.map((slot) => slot.futureOutputRootName).sort();
  let names: string[];
  try {
    names = [...probes.listDirectoryEntries(recovery.studyRoot)].sort();
  } catch (error) {
    problems.push(
      `the recovery study root could not be listed (${error instanceof Error ? error.message : String(error)}).`,
    );
    return problems;
  }
  if (canonicalStringify(names) !== canonicalStringify(expectedNames)) {
    problems.push(
      `the recovery study root must hold exactly the ten slot directories and nothing else; it holds [${names.join(', ')}].`,
    );
  }
  for (const slot of F0V_SLOTS) {
    const root = futureOutputRootPathOf(recovery.studyRoot, slot);
    if (!probes.isRealDirectory(root)) {
      problems.push(`recovery slot root ${root} does not exist as a real directory.`);
      continue;
    }
    let entries: readonly string[];
    try {
      entries = probes.listDirectoryEntries(root);
    } catch (error) {
      problems.push(
        `recovery slot root ${root} could not be listed (${error instanceof Error ? error.message : String(error)}).`,
      );
      continue;
    }
    if (entries.length > 0) {
      problems.push(
        `recovery slot root ${root} is not empty (${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}): it has already been used.`,
      );
    }
  }
  return problems;
}

/** Both halves, in order. Empty means the recovery study may be preflighted slot by slot. */
export function evaluateRecovery1StudyPreflight(
  binding: Recovery1Binding,
  repoRoot: string,
  probes: Recovery1PreflightProbes,
): readonly string[] {
  return [
    ...failedStudyImmutabilityProblems(binding, repoRoot, probes),
    ...recoveryNamespaceProblems(binding, probes),
  ];
}
