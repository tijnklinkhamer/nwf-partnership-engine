/**
 * PHASE 2B-2D — A3 R50: GENUINE MATERIALISATION, ALL OR NOTHING.
 *
 * THE ONLY ROUTE FROM THE MINTED R47 CHAIN TO DISK
 *
 *   1. `buildGenuineR50Handoff` accepts ONLY a private R50 reproduction proof
 *      (`reproduction.ts`) and a minted R49 rubric binding. From the proof's
 *      exact R47 sample batch it collects, per preparation:
 *        - the replay slot, through R47's own graph -> slot provenance;
 *        - the CURRENT Governance V5 READY occupant, through
 *          `v5ReadyAuthorityForR4ReplaySlot` (same slot, DEV_TRAIN,
 *          ACQUISITION_SUCCESSFUL) - its `occupant.source.echeRowKey` is the
 *          organisation identity;
 *        - the slot's genuine durable evidence, through the landed mapping of
 *          its own layer: R21 -> R20 `durableEvidenceForDocumentSourceAssembly`,
 *          R27 -> R26 `evidenceDeltaForDeltaSlotAssembly`, R34 -> R33
 *          `...V4`, R40 -> R39 `...V5`; no new evidence authority;
 *        - the exact SET_P / SET_R `documentCap.documents` - never re-ranked.
 *      It then builds the whole handoff in memory (`items.ts`) and re-proves
 *      every item's main text against the replay slot's own private text
 *      capability.
 *   2. `renderR50Artifacts` lays out the internal index (Prettier JSON), the
 *      blinded package and the blank template (JSONL).
 *   3. `writeR50ArtifactsAtomically` refuses if any target exists, writes
 *      every file to a temporary sibling, then renames all of them; a failure
 *      removes every temporary and every already-renamed file. It re-reads
 *      what it wrote and recomputes the package hash.
 *
 * THIS MODULE ISSUES NO SQL, opens no socket and calls no model.
 */
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { durableEvidenceForDocumentSourceAssembly } from '../a3documents/devTrain.js';
import { evidenceDeltaForDeltaSlotAssembly } from '../a3documentsV2/devTrain.js';
import { evidenceDeltaForDeltaSlotAssemblyV4 } from '../a3documentsV4/devTrain.js';
import { evidenceDeltaForDeltaSlotAssemblyV5 } from '../a3documentsV5/devTrain.js';
import type { UnboundDurableRunEvidence } from '../a3evidence/types.js';
import {
  sourceSlotForR4ReplaySlot,
  textLookupForR4ReplaySlot,
  v5ReadyAuthorityForR4ReplaySlot,
} from '../a3replayR4/documents.js';
import { replaySlotForR4Graph } from '../a3replayR4/graphs.js';
import { r4GraphForSamplePreparation } from '../a3replayR4/samples.js';
import type { A3R4DocumentReplaySlot, R47DocumentStratum } from '../a3replayR4/types.js';
import { GOLD_ID_DOES_NOT_MEAN_GOLD_YET } from './identity.js';
import { buildHandoffFromSlots } from './items.js';
import { refuseR50 } from './refusal.js';
import {
  isR50ReproductionProof,
  provedAuthorityForR50Proof,
  type R50ReproductionProof,
} from './reproduction.js';
import { fromJsonl, preLabelPackageHash, toJsonl } from './reviewPackage.js';
import { requireR49RubricBinding, type R49RubricBinding } from './rubric.js';
import {
  R47_COMMITTED_REPLAY_CENSUS,
  R47_TERMINAL_COMMIT,
  R48_TERMINAL_COMMIT,
  R48_TERMINAL_STATE,
  R49_TERMINAL_COMMIT,
  R50_ARTIFACT_PATHS,
  R50_EXPECTED_SELECTION,
  R50_INDEX_RECORD,
  R50_INDEX_RECORD_KIND,
  R50_PACKAGE_HASH_ALGORITHM,
  R50_PACKAGE_HASH_INPUT_CONTRACT,
  R50_PACKAGE_HASH_NAME,
  R50_PACKAGE_SCHEMA,
  R50_SPLIT,
  R50_TASK,
  R50_TEMPLATE_SCHEMA,
  type BuiltHandoff,
  type HandoffSlotInput,
  type HandoffSourcePageRow,
} from './types.js';

// ---------------------------------------------------------------------------
// A. GENUINE SLOT COLLECTION.
// ---------------------------------------------------------------------------

interface GenuineEvidenceLink {
  readonly authority?: { readonly selectionIndex?: unknown; readonly split?: unknown };
  readonly evidence?: UnboundDurableRunEvidence;
}

const EVIDENCE_BY_STRATUM: Readonly<
  Record<R47DocumentStratum, (source: unknown) => GenuineEvidenceLink | undefined>
> = Object.freeze({
  R21_V1: durableEvidenceForDocumentSourceAssembly,
  R27_V2: evidenceDeltaForDeltaSlotAssembly,
  R34_V4: evidenceDeltaForDeltaSlotAssemblyV4,
  R40_V5: evidenceDeltaForDeltaSlotAssemblyV5,
});

function sourceRowsOf(
  evidence: UnboundDurableRunEvidence,
  position: number,
): readonly HandoffSourcePageRow[] {
  return evidence.pageEvidence.map((row, index) => {
    if (
      row.fetch.requestedUrl !== row.requestedUrl ||
      row.fetch.responseSha256 !== row.responseSha256 ||
      row.page.fetchObservationId !== row.fetch.id ||
      row.fetch.echeRowKey !== evidence.request.echeRowKey
    ) {
      refuseR50(
        'R50_EVIDENCE_PROVENANCE_NOT_PROVED',
        `slot ${String(position)} source row ${String(index)} does not join its own fetch`,
      );
    }
    return Object.freeze({
      pageEvidenceId: row.page.id,
      responseSha256: row.responseSha256,
      requestedUrl: row.requestedUrl,
      title: row.page.title,
      declaredLang: row.page.declaredLang,
      headings: row.page.headings,
      mainText: row.page.mainText,
      mainTextTruncated: row.page.mainTextTruncated,
      extractionMethod: row.page.extractionMethod,
      extractionRuleVersion: row.page.ruleVersion,
    });
  });
}

/** The per-slot handoff inputs, read ONLY from the proof's genuine R47 chain. */
export function collectGenuineHandoffSlots(proof: unknown): {
  readonly slots: readonly HandoffSlotInput[];
  readonly replaySlots: readonly A3R4DocumentReplaySlot[];
} {
  const authority = provedAuthorityForR50Proof(proof);
  if (authority === undefined) {
    refuseR50('R50_REPRODUCTION_NOT_PROVED', 'the value is not a minted R50 reproduction proof');
  }
  const viewSlots = new Set<object>(authority.view.slots);
  const replaySlots: A3R4DocumentReplaySlot[] = [];
  const slots = authority.sampleBatch.items.map((preparation, position): HandoffSlotInput => {
    const replaySlot = replaySlotForR4Graph(r4GraphForSamplePreparation(preparation));
    if (
      replaySlot === undefined ||
      !viewSlots.has(replaySlot) ||
      replaySlot.selectionIndex !== preparation.selectionIndex ||
      replaySlot.split !== R50_SPLIT ||
      preparation.split !== R50_SPLIT
    ) {
      refuseR50(
        'R50_R47_AUTHORITY_NOT_GENUINE',
        `preparation ${String(position)} does not trace to a DEV_TRAIN replay slot of the view`,
      );
    }
    const ready = v5ReadyAuthorityForR4ReplaySlot(replaySlot);
    if (
      ready === undefined ||
      ready.status !== 'A3_CROSS_GENERATION_SLOT_ACQUISITION_AUTHORITY_READY' ||
      ready.selectionIndex !== replaySlot.selectionIndex ||
      ready.split !== R50_SPLIT ||
      ready.disposition !== 'ACQUISITION_SUCCESSFUL' ||
      ready.occupant.selectionIndex !== replaySlot.selectionIndex ||
      typeof ready.occupant.source.echeRowKey !== 'string' ||
      typeof ready.occupant.source.organisationId !== 'string'
    ) {
      refuseR50(
        'R50_CURRENT_OCCUPANT_NOT_PROVED',
        `preparation ${String(position)} has no current Governance V5 READY occupant`,
      );
    }
    const link = EVIDENCE_BY_STRATUM[replaySlot.stratum](sourceSlotForR4ReplaySlot(replaySlot));
    const evidence = link?.evidence;
    if (
      link === undefined ||
      evidence === undefined ||
      link.authority?.selectionIndex !== replaySlot.selectionIndex ||
      link.authority.split !== R50_SPLIT
    ) {
      refuseR50(
        'R50_EVIDENCE_PROVENANCE_NOT_PROVED',
        `preparation ${String(position)} has no genuine durable evidence of its own layer`,
      );
    }
    replaySlots.push(replaySlot);
    const cap = (
      documents: readonly { selectionIndex: number; split: string; documentSha256: string }[],
    ) =>
      Object.freeze(
        documents.map((d) =>
          Object.freeze({
            selectionIndex: d.selectionIndex,
            split: d.split,
            documentSha256: d.documentSha256,
          }),
        ),
      );
    return Object.freeze({
      selectionIndex: replaySlot.selectionIndex,
      split: replaySlot.split,
      stratum: replaySlot.stratum,
      occupantEcheRowKey: ready.occupant.source.echeRowKey,
      occupantOrganisationId: ready.occupant.source.organisationId,
      evidenceEcheRowKey: evidence.request.echeRowKey,
      evidenceOrganisationId: evidence.request.organisationId,
      evidenceSelectionIndex: link.authority.selectionIndex as number,
      documents: Object.freeze(
        replaySlot.documents.map((entry) =>
          Object.freeze({
            selectionIndex: entry.document.selectionIndex,
            split: entry.document.split,
            documentSha256: entry.document.documentSha256,
            sourcePageEvidenceIds: entry.document.sourcePageEvidenceIds,
          }),
        ),
      ),
      setPCap: cap(preparation.setP.documentCap.documents),
      setRCap: cap(preparation.setR.documentCap.documents),
      sourceRows: Object.freeze(sourceRowsOf(evidence, position)),
    });
  });
  return Object.freeze({ slots: Object.freeze(slots), replaySlots: Object.freeze(replaySlots) });
}

// ---------------------------------------------------------------------------
// B. THE GENUINE BUILD.
// ---------------------------------------------------------------------------

export interface GenuineR50Handoff {
  readonly kind: 'A3_R50_GENUINE_DEV_TRAIN_R4_A4_HANDOFF';
  readonly authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY';
  readonly proof: R50ReproductionProof;
  readonly rubric: R49RubricBinding;
  readonly built: BuiltHandoff;
  readonly textCapabilityChecks: number;
}

const GENUINE = new WeakSet<object>();
const BUILT_FOR_PROOF = new WeakSet<object>();

export function isGenuineR50Handoff(value: unknown): value is GenuineR50Handoff {
  return typeof value === 'object' && value !== null && GENUINE.has(value);
}

export function buildGenuineR50Handoff(input: {
  readonly proof: unknown;
  readonly rubric: unknown;
}): GenuineR50Handoff {
  const rubric = requireR49RubricBinding(input.rubric);
  if (!isR50ReproductionProof(input.proof)) {
    refuseR50('R50_REPRODUCTION_NOT_PROVED', 'the value is not a minted R50 reproduction proof');
  }
  if (BUILT_FOR_PROOF.has(input.proof)) {
    refuseR50('R50_R47_AUTHORITY_ALREADY_CONSUMED', 'this proof already produced a handoff');
  }
  const { slots, replaySlots } = collectGenuineHandoffSlots(input.proof);
  const built = buildHandoffFromSlots(slots, rubric, {
    slots: R50_EXPECTED_SELECTION.slots,
    setPSelected: R50_EXPECTED_SELECTION.setPSelectedCapEntries,
    setRSelected: R50_EXPECTED_SELECTION.setRSelectedCapEntries,
  });
  // Re-prove each item's equality-justified text against the replay slot's
  // own private text capability (the canonical SD7 text of the document).
  const slotByIndex = new Map(replaySlots.map((slot) => [slot.selectionIndex, slot] as const));
  let textCapabilityChecks = 0;
  built.indexItems.forEach((item, position) => {
    const lookup = textLookupForR4ReplaySlot(slotByIndex.get(item.selectionIndex));
    if (lookup(item.documentSha256) !== built.reviewRecords[position]!.mainText) {
      refuseR50(
        'R50_SOURCE_MAIN_TEXT_DISAGREES',
        `item ${String(position)}: the main text is not the replay slot's canonical document text`,
      );
    }
    textCapabilityChecks += 1;
  });
  BUILT_FOR_PROOF.add(input.proof);
  const genuine: GenuineR50Handoff = Object.freeze({
    kind: 'A3_R50_GENUINE_DEV_TRAIN_R4_A4_HANDOFF' as const,
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY' as const,
    proof: input.proof,
    rubric,
    built,
    textCapabilityChecks,
  });
  GENUINE.add(genuine);
  return genuine;
}

// ---------------------------------------------------------------------------
// C. RENDERING.
// ---------------------------------------------------------------------------

export interface RenderedR50Artifacts {
  readonly index: string;
  readonly reviewPackage: string;
  readonly responseTemplate: string;
}

/** The internal index object. `reviewerVisible: false`. */
export function handoffIndexOf(handoff: GenuineR50Handoff): Record<string, unknown> {
  const { built, rubric, proof } = handoff;
  return {
    record: R50_INDEX_RECORD,
    recordKind: R50_INDEX_RECORD_KIND,
    task: R50_TASK,
    split: R50_SPLIT,
    reviewerVisible: false,
    neverHandToAReviewer: true,
    thisFileAuthorises: [],
    goldIdDoesNotMeanGoldYet: GOLD_ID_DOES_NOT_MEAN_GOLD_YET,
    rubricBinding: {
      path: rubric.rubricPath,
      sha256: rubric.rubricSha256,
      bytes: rubric.rubricBytes,
      rubricVersion: rubric.rubricVersion,
      status: rubric.rubricStatus,
      sourceCommit: rubric.rubricSourceCommit,
      approvalPath: rubric.approvalPath,
      approvalSha256: rubric.approvalSha256,
      approvalBytes: rubric.approvalBytes,
      approvalCommit: R49_TERMINAL_COMMIT,
      consumedOwnerMarker: rubric.consumedOwnerMarker,
    },
    r48Blocker: { r48Terminal: R48_TERMINAL_COMMIT, terminalState: R48_TERMINAL_STATE },
    r47Binding: {
      r47Terminal: R47_TERMINAL_COMMIT,
      censusPath: R47_COMMITTED_REPLAY_CENSUS.path,
      censusSha256: R47_COMMITTED_REPLAY_CENSUS.sha256,
      censusBytes: R47_COMMITTED_REPLAY_CENSUS.bytes,
      freshlyReproducedInThisProcess: true,
      differingSemanticPathCount: proof.differingSemanticPathCount,
      excludedFields: proof.excludedFields,
    },
    identity: {
      primitive: 'deriveGoldId(echeRowKey, responseSha256)',
      module: 'src/orgunits/classify/evaluation/select.ts',
      echeRowKeySource: 'the current Governance V5 READY occupant: occupant.source.echeRowKey',
      responseSha256Source:
        'the canonical A3 document.documentSha256, itself the original exact fetch-response SHA-256',
      pattern: '^g[0-9a-f]{16}$',
    },
    packageBinding: {
      reviewPackagePath: R50_ARTIFACT_PATHS.reviewPackage,
      reviewPackageSchema: R50_PACKAGE_SCHEMA,
      reviewPackageReviewerVisible: true,
      responseTemplatePath: R50_ARTIFACT_PATHS.responseTemplate,
      responseTemplateSchema: R50_TEMPLATE_SCHEMA,
      order: 'goldId ASC',
      hashName: R50_PACKAGE_HASH_NAME,
      algorithm: R50_PACKAGE_HASH_ALGORITHM,
      canonicalInputContract: R50_PACKAGE_HASH_INPUT_CONTRACT,
      packageHash: built.packageHash,
      recordCount: built.reviewRecords.length,
      notA5SplitContentHash: true,
      notGoldManifestHash: true,
      notCorpusFreezeHash: true,
      immutability:
        'A4 labels exactly these goldIds against exactly this package hash and rubric hash. A later slice may not silently regenerate a different package; a correction requires explicit owner review.',
    },
    counts: built.counts,
    labels: {
      labelsContained: 0,
      goldRecordsContained: 0,
      modelLabelsContained: 0,
      adjudicationsContained: 0,
    },
    items: built.indexItems,
  };
}

export async function renderR50Artifacts(
  handoff: GenuineR50Handoff,
  repoRoot: string,
): Promise<RenderedR50Artifacts> {
  if (!isGenuineR50Handoff(handoff)) {
    refuseR50('R50_REPRODUCTION_NOT_PROVED', 'only a genuine R50 handoff may be rendered');
  }
  const indexPath = join(repoRoot, R50_ARTIFACT_PATHS.index);
  const options = await resolveConfig(indexPath);
  const index = await format(JSON.stringify(handoffIndexOf(handoff), null, 2), {
    ...options,
    filepath: indexPath,
    parser: 'json',
  });
  return Object.freeze({
    index,
    reviewPackage: toJsonl(handoff.built.reviewRecords),
    responseTemplate: toJsonl(handoff.built.templateRecords),
  });
}

// ---------------------------------------------------------------------------
// D. ATOMIC WRITE AND READ-BACK.
// ---------------------------------------------------------------------------

const TEMP_SUFFIX = '.r50-tmp';

export function writeR50ArtifactsAtomically(
  handoff: GenuineR50Handoff,
  rendered: RenderedR50Artifacts,
  repoRoot: string,
): void {
  if (!isGenuineR50Handoff(handoff)) {
    refuseR50('R50_REPRODUCTION_NOT_PROVED', 'only a genuine R50 handoff may be written');
  }
  const targets = [
    [R50_ARTIFACT_PATHS.index, rendered.index],
    [R50_ARTIFACT_PATHS.reviewPackage, rendered.reviewPackage],
    [R50_ARTIFACT_PATHS.responseTemplate, rendered.responseTemplate],
  ] as const;
  for (const [path] of targets) {
    if (existsSync(join(repoRoot, path)) || existsSync(join(repoRoot, path + TEMP_SUFFIX))) {
      refuseR50('R50_ARTIFACT_ALREADY_EXISTS', `${path} already exists; R50 never overwrites`);
    }
  }
  const renamed: string[] = [];
  try {
    for (const [path, text] of targets) {
      writeFileSync(join(repoRoot, path + TEMP_SUFFIX), text, { encoding: 'utf8', flag: 'wx' });
    }
    for (const [path] of targets) {
      renameSync(join(repoRoot, path + TEMP_SUFFIX), join(repoRoot, path));
      renamed.push(path);
    }
  } catch (error) {
    for (const [path] of targets) rmSync(join(repoRoot, path + TEMP_SUFFIX), { force: true });
    for (const path of renamed) rmSync(join(repoRoot, path), { force: true });
    refuseR50('R50_ARTIFACT_WRITE_FAILED', 'the handoff artifacts could not all be written', {
      cause: error,
    });
  }
  // Read back exactly what was written and recompute.
  const back = (path: string): string => readFileSync(join(repoRoot, path), 'utf8');
  const records = fromJsonl(back(R50_ARTIFACT_PATHS.reviewPackage));
  const templates = fromJsonl(back(R50_ARTIFACT_PATHS.responseTemplate));
  const index = JSON.parse(back(R50_ARTIFACT_PATHS.index)) as Record<string, unknown>;
  if (
    JSON.stringify(records) !== JSON.stringify(handoff.built.reviewRecords) ||
    JSON.stringify(templates) !== JSON.stringify(handoff.built.templateRecords) ||
    JSON.stringify(index['items']) !== JSON.stringify(handoff.built.indexItems) ||
    preLabelPackageHash(handoff.rubric, records as never) !== handoff.built.packageHash
  ) {
    for (const [path] of targets) rmSync(join(repoRoot, path), { force: true });
    refuseR50('R50_ARTIFACT_WRITE_FAILED', 'the written artifacts do not read back exactly');
  }
}
