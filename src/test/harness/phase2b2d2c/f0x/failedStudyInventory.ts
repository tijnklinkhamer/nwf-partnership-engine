/**
 * PHASE 2B-2D2C-F0X — REQUEST-FREE STRUCTURAL INVENTORY OF A PRESERVED STUDY.
 *
 * The first real F0X study invocation (2026-09-16) consumed all ten slot
 * candidates and produced zero inference (see `childFreezePath.ts` and
 * `f0w/sequencing.ts` for the two defects). Its study root is IMMUTABLE
 * evidence. This module pins it without changing it: every file's SHA-256,
 * each self-hashed record's `recordSha256` (recomputed, never trusted), the
 * per-slot consumption marker, outer slot identity, child preflight(s) and
 * experiment stop, a scan for every semantic-execution marker, the observed
 * provider-request and adapter-attempt counts, and each slot's
 * classification under the CORRECTED `classifySlotEvidence`.
 *
 * Reads, never writes. Parses only study-level records, slot identity and
 * consumption records, child preflights, experiment stop/completion records
 * and (only if present) provider-outcome records; every other file is hashed
 * as opaque bytes and never parsed. No network, no database, no child
 * process, no provider, no gold or scoring module.
 *
 *   node --import tsx src/test/harness/phase2b2d2c/f0x/failedStudyInventory.ts \
 *     --study-root <dir> [--control-root <dir>]
 */
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import { F0V_SLOTS, futureOutputRootPathOf } from '../f0v/studyPlanCore.js';
import {
  classifySlotEvidence,
  inclusionClassOf,
  SEMANTIC_EXECUTION_MARKER_FILE_NAMES,
  type SlotEvidenceProbes,
  type SlotInclusionClass,
} from '../f0w/sequencing.js';

export const FAILED_STUDY_INVENTORY_VERSION = 'phase2b-2d2c-f0x-failed-study-inventory-v1';

const PROVIDER_REQUEST_FILE_NAMES: readonly string[] = [
  'provider-outcome.json',
  'repair-provider-outcome.json',
];

export type InventoryProbes = SlotEvidenceProbes;

export interface PinnedRecord {
  readonly path: string;
  readonly fileSha256: string;
  readonly recordSha256: string | null;
  readonly recordSha256Verified: boolean;
}

export interface PinnedChildPreflight extends PinnedRecord {
  readonly ok: unknown;
  readonly providerConstructed: unknown;
  readonly stage: unknown;
  readonly stopCondition: unknown;
  readonly detail: unknown;
}

export interface PinnedExperimentStop extends PinnedRecord {
  readonly stopCondition: unknown;
  readonly detail: unknown;
}

export interface SlotInventory {
  readonly slotId: string;
  readonly sequence: number;
  readonly variantName: string;
  readonly outputRoot: string;
  readonly fileCount: number;
  readonly treeSha256: string;
  readonly candidateAuthorisationSha256: string | null;
  readonly consumptionMarkers: readonly PinnedRecord[];
  readonly outerSlotIdentity: PinnedRecord | null;
  readonly childPreflights: readonly PinnedChildPreflight[];
  readonly experimentStops: readonly PinnedExperimentStop[];
  readonly experimentCompletions: readonly PinnedRecord[];
  readonly semanticExecutionMarkers: readonly string[];
  readonly providerRequestsObserved: number;
  readonly adapterAttemptsObserved: number;
  readonly correctedClassification: {
    readonly disposition: string;
    readonly inclusionClass: SlotInclusionClass;
    readonly durablyClosed: boolean;
    readonly detail: string;
  };
}

export interface FailedStudyInventory {
  readonly inventoryVersion: typeof FAILED_STUDY_INVENTORY_VERSION;
  readonly requestFree: true;
  readonly studyRoot: string;
  readonly wholeStudyTree: { readonly fileCount: number; readonly treeSha256: string };
  readonly studyManifest: (PinnedRecord & { readonly record: unknown }) | null;
  readonly studyTerminal: (PinnedRecord & { readonly record: unknown }) | null;
  readonly studyEvents: readonly {
    readonly path: string;
    readonly fileSha256: string;
    readonly recordSha256Verified: boolean;
  }[];
  readonly control: {
    readonly controlRoot: string;
    readonly files: readonly { readonly path: string; readonly fileSha256: string }[];
  } | null;
  readonly slots: readonly SlotInventory[];
  readonly totals: {
    readonly slotsPresent: number;
    readonly childPreflights: number;
    readonly childPreflightsWithProviderConstructedFalse: number;
    readonly semanticExecutionMarkers: number;
    readonly providerRequestsObserved: number;
    readonly adapterAttemptsObserved: number;
    readonly classA: number;
    readonly classB: number;
    readonly classC: number;
    readonly ambiguous: number;
  };
}

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** sha256 over the sorted `"<fileSha256>  <relative path>\n"` lines — a whole-tree fingerprint. */
export function treeFingerprint(entries: readonly { path: string; fileSha256: string }[]): string {
  return sha256(
    [...entries]
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
      .map((entry) => `${entry.fileSha256}  ${entry.path}\n`)
      .join(''),
  );
}

export function pinRecord(
  root: string,
  path: string,
  probes: InventoryProbes,
): { readonly pinned: PinnedRecord; readonly record: Record<string, unknown> | null } {
  const bytes = probes.readFile(join(root, path));
  let record: Record<string, unknown> | null = null;
  let recordSha256: string | null = null;
  let verified = false;
  try {
    const envelope = JSON.parse(bytes.toString('utf8')) as {
      record?: Record<string, unknown>;
      recordSha256?: unknown;
    };
    if (envelope.record !== undefined && typeof envelope.recordSha256 === 'string') {
      record = envelope.record;
      recordSha256 = envelope.recordSha256;
      verified = sha256(canonicalStringify(envelope.record)) === envelope.recordSha256;
    }
  } catch {
    // An unparseable record stays unverified; its file hash is still pinned.
  }
  return {
    pinned: { path, fileSha256: sha256(bytes), recordSha256, recordSha256Verified: verified },
    record,
  };
}

export function buildFailedStudyInventory(
  studyRoot: string,
  probes: InventoryProbes,
  controlRoot: string | null = null,
): FailedStudyInventory {
  const allFiles = probes.isDirectory(studyRoot)
    ? [...probes.listFilesRecursively(studyRoot)].sort()
    : [];
  const hashed = allFiles.map((path) => ({
    path,
    fileSha256: sha256(probes.readFile(join(studyRoot, path))),
  }));

  const studyLevel = (name: string): (PinnedRecord & { readonly record: unknown }) | null => {
    if (!allFiles.includes(name)) return null;
    const { pinned, record } = pinRecord(studyRoot, name, probes);
    return { ...pinned, record };
  };

  const slots: SlotInventory[] = [];
  for (const slot of F0V_SLOTS) {
    const outputRoot = futureOutputRootPathOf(studyRoot, slot);
    if (!probes.isDirectory(outputRoot)) continue;
    const files = [...probes.listFilesRecursively(outputRoot)].sort();
    const fileHashes = files.map((path) => ({
      path,
      fileSha256: sha256(probes.readFile(join(outputRoot, path))),
    }));

    const consumptionMarkers = files
      .filter((file) => /^authorisations\/[0-9a-f]{64}\.json$/.test(file))
      .map((file) => pinRecord(outputRoot, file, probes).pinned);
    const identity = files.includes('study-slot-identity.json')
      ? pinRecord(outputRoot, 'study-slot-identity.json', probes)
      : null;
    const childPreflights = files
      .filter((file) => baseName(file) === 'child-preflight.json')
      .map((file) => {
        const { pinned, record } = pinRecord(outputRoot, file, probes);
        const checks = record?.['checks'] as { stage?: unknown } | undefined;
        return {
          ...pinned,
          ok: record?.['ok'],
          providerConstructed: record?.['providerConstructed'],
          stage: checks?.stage,
          stopCondition: record?.['stopCondition'],
          detail: record?.['detail'],
        };
      });
    const experimentStops = files
      .filter((file) => /^experiments\/attempt-[1-9][0-9]*\/experiment-stop\.json$/.test(file))
      .map((file) => {
        const { pinned, record } = pinRecord(outputRoot, file, probes);
        return { ...pinned, stopCondition: record?.['stopCondition'], detail: record?.['detail'] };
      });
    const experimentCompletions = files
      .filter((file) =>
        /^experiments\/attempt-[1-9][0-9]*\/experiment-completion\.json$/.test(file),
      )
      .map((file) => pinRecord(outputRoot, file, probes).pinned);
    const semanticExecutionMarkers = files.filter((file) =>
      SEMANTIC_EXECUTION_MARKER_FILE_NAMES.includes(baseName(file)),
    );
    const providerRequestFiles = files.filter((file) =>
      PROVIDER_REQUEST_FILE_NAMES.includes(baseName(file)),
    );
    let adapterAttemptsObserved = 0;
    for (const file of providerRequestFiles) {
      const attempts = pinRecord(outputRoot, file, probes).record?.[
        'internalAdapterAttemptCountWhereObservable'
      ];
      if (typeof attempts === 'number') adapterAttemptsObserved += attempts;
    }

    const classification = classifySlotEvidence(outputRoot, probes);
    slots.push({
      slotId: slot.slotId,
      sequence: slot.sequence,
      variantName: slot.variantName,
      outputRoot,
      fileCount: files.length,
      treeSha256: treeFingerprint(fileHashes),
      candidateAuthorisationSha256:
        typeof identity?.record?.['candidateAuthorisationSha256'] === 'string'
          ? identity.record['candidateAuthorisationSha256']
          : null,
      consumptionMarkers,
      outerSlotIdentity: identity?.pinned ?? null,
      childPreflights,
      experimentStops,
      experimentCompletions,
      semanticExecutionMarkers,
      providerRequestsObserved: providerRequestFiles.length,
      adapterAttemptsObserved,
      correctedClassification: {
        disposition: classification.disposition,
        inclusionClass: inclusionClassOf(classification),
        durablyClosed: classification.durablyClosed,
        detail: classification.detail,
      },
    });
  }

  const control =
    controlRoot === null || !probes.isDirectory(controlRoot)
      ? null
      : {
          controlRoot,
          files: [...probes.listFilesRecursively(controlRoot)].sort().map((path) => ({
            path,
            fileSha256: sha256(probes.readFile(join(controlRoot, path))),
          })),
        };

  const count = (cls: SlotInclusionClass): number =>
    slots.filter((slot) => slot.correctedClassification.inclusionClass === cls).length;
  const preflights = slots.flatMap((slot) => slot.childPreflights);
  return {
    inventoryVersion: FAILED_STUDY_INVENTORY_VERSION,
    requestFree: true,
    studyRoot,
    wholeStudyTree: { fileCount: hashed.length, treeSha256: treeFingerprint(hashed) },
    studyManifest: studyLevel('study-manifest.json'),
    studyTerminal: studyLevel('study-terminal.json'),
    studyEvents: allFiles
      .filter((file) => file.startsWith('study-events/'))
      .map((file) => {
        const { pinned } = pinRecord(studyRoot, file, probes);
        return {
          path: file,
          fileSha256: pinned.fileSha256,
          recordSha256Verified: pinned.recordSha256Verified,
        };
      }),
    control,
    slots,
    totals: {
      slotsPresent: slots.length,
      childPreflights: preflights.length,
      childPreflightsWithProviderConstructedFalse: preflights.filter(
        (p) => p.providerConstructed === false,
      ).length,
      semanticExecutionMarkers: slots.reduce((n, s) => n + s.semanticExecutionMarkers.length, 0),
      providerRequestsObserved: slots.reduce((n, s) => n + s.providerRequestsObserved, 0),
      adapterAttemptsObserved: slots.reduce((n, s) => n + s.adapterAttemptsObserved, 0),
      classA: count('NO_EVIDENCE_OR_CLASS_A_FAILURE_BEFORE_CONSUMPTION'),
      classB: count('CLASS_B_AUTHORISATION_CONSUMED_CONFIRMED_PRE_INFERENCE_REFUSAL'),
      classC: count('CLASS_C_PROVIDER_REQUEST_OR_SEMANTIC_EXECUTION_OBSERVED'),
      ambiguous: count('AMBIGUOUS_EVIDENCE'),
    },
  };
}

/** Real, read-only filesystem probes. Never follows a symlinked directory. */
export function createReadOnlyInventoryProbes(): InventoryProbes {
  const listFilesRecursively = (root: string): string[] => {
    const results: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        const stat = lstatSync(full);
        if (stat.isDirectory()) walk(full);
        else if (stat.isFile()) results.push(relative(root, full).split(sep).join('/'));
        else throw new Error(`${full} is neither a regular file nor a directory.`);
      }
    };
    walk(root);
    return results;
  };
  return {
    isDirectory: (path) => {
      try {
        return statSync(path).isDirectory() && lstatSync(path).isDirectory();
      } catch {
        return false;
      }
    },
    listFilesRecursively,
    readFile: (path) => readFileSync(path),
  };
}

const isMainModule =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const argv = process.argv.slice(2);
  const valueOf = (flag: string): string | null => {
    const index = argv.indexOf(flag);
    return index >= 0 && argv[index + 1] !== undefined ? argv[index + 1]! : null;
  };
  const known = new Set(['--study-root', '--control-root']);
  const unknown = argv.filter((arg) => arg.startsWith('--') && !known.has(arg));
  const studyRoot = valueOf('--study-root');
  if (studyRoot === null || unknown.length > 0) {
    process.stderr.write(
      'usage: failedStudyInventory.ts --study-root <dir> [--control-root <dir>]\n',
    );
    process.exitCode = 2;
  } else {
    const inventory = buildFailedStudyInventory(
      studyRoot,
      createReadOnlyInventoryProbes(),
      valueOf('--control-root'),
    );
    process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`);
  }
}
