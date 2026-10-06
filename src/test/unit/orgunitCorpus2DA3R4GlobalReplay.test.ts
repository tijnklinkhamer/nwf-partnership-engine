/**
 * PHASE 2B-2D A3 R47 — THE GLOBAL R4 DEV_TRAIN REPLAY BINDERS, AGAINST STAND-IN
 * UPSTREAM BRANDS.
 *
 * Genuine R21 / R27 / R34 / R40 batches exist only behind real R20 / R26 / R33
 * / R39 mints of real runs, which need the database a unit test must not open.
 * To exercise R47's ACCEPTANCE path anyway, this file replaces - in this file
 * only, through `vi.mock` - the four document layers' brand, provenance and
 * text accessors, and the eight landed census derivations, with stand-ins
 * backed by a test-owned registry (the R35 / R37 precedent). Everything R47
 * owns runs unchanged: the R46 approval binding over the REAL committed
 * bytes, the reproduction gate over the REAL committed census bytes, the REAL
 * committed Governance V4 / V5 snapshots and their continuity, the R4
 * relation, the canonical R3 audit, the canonical ranks, K3, the caps, the
 * canonical SD9 functions and the census. The real chain, recorded in the
 * audit, repeats every check on genuine objects.
 *
 * The invented twenty-slot fixture is built to satisfy every pinned
 * invariant: 617 rows / 611 documents / 1234 candidate observations, 5
 * exact-duplicate groups removing 6 rows, 580 long + 31 short documents, 8502
 * long-long pairs and 65 long edges touching 54 documents. Nothing about it
 * describes the real corpus.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type * as R21DevTrain from '../harness/phase2b2d/a3documents/devTrain.js';
import type * as R27DevTrain from '../harness/phase2b2d/a3documentsV2/devTrain.js';
import type * as R34DevTrain from '../harness/phase2b2d/a3documentsV4/devTrain.js';
import type * as R40DevTrain from '../harness/phase2b2d/a3documentsV5/devTrain.js';
import type * as MeasureModule from '../harness/phase2b2d/sd7R4/measure.js';
import type * as SurvivorsModule from '../harness/phase2b2d/a3replayR4/survivors.js';
import type * as MembershipModule from '../harness/phase2b2d/a3readiness/membership.js';
import type * as Sd9Module from '../harness/phase2b2d/a3prep/sd9.js';
import type * as A3GraphsMeasure from '../harness/phase2b2d/a3graphs/measure.js';
import type * as A3SamplesPrepare from '../harness/phase2b2d/a3samples/prepare.js';
import type * as A3PrepSd7 from '../harness/phase2b2d/a3prep/sd7.js';
import type * as A3PrepSetPSd7 from '../harness/phase2b2d/a3prep/setPSd7.js';
import type * as A3PrepSetRSd7 from '../harness/phase2b2d/a3prep/setRSd7.js';

// ---------------------------------------------------------------------------
// THE TEST-OWNED REGISTRY AND COUNTERS.
// ---------------------------------------------------------------------------

const stand = vi.hoisted(() => ({
  batchLayer: new WeakMap<object, string>(),
  slotLayer: new WeakMap<object, string>(),
  lookupBySlot: new WeakMap<object, (digest: string) => string>(),
  authorityBySlot: new WeakMap<object, object>(),
  evidenceBatchByDocumentBatch: new WeakMap<object, object>(),
  census: {} as Record<string, unknown>,
  r4Measure: 0,
  r4MeasureRefuseOnCall: 0,
  samplePrepare: 0,
  samplePrepareRefuseOnCall: 0,
  policyBinding: 0,
  policyBindingRefuseOnCall: 0,
  boundsCalls: 0,
  boundsOverrideOnCall: 0,
  historical: { r22: 0, r23: 0, r24: 0, r7: 0, r8: 0, r12: 0 },
}));

function layerMock(layer: string) {
  const isBatch = (value: unknown) =>
    typeof value === 'object' && value !== null && stand.batchLayer.get(value) === layer;
  const isSlot = (value: unknown) =>
    typeof value === 'object' && value !== null && stand.slotLayer.get(value) === layer;
  const lookup = (slot: unknown) => {
    if (!isSlot(slot))
      throw Object.assign(new Error('stand-in: not a slot'), { code: 'NOT_A_SLOT' });
    return stand.lookupBySlot.get(slot as object)!;
  };
  const evidence = (slot: unknown) =>
    isSlot(slot) ? { authority: stand.authorityBySlot.get(slot as object) } : undefined;
  const evidenceBatch = (batch: unknown) =>
    isBatch(batch) ? stand.evidenceBatchByDocumentBatch.get(batch as object) : undefined;
  return { isBatch, isSlot, lookup, evidence, evidenceBatch };
}

vi.mock('../harness/phase2b2d/a3documents/devTrain.js', async (importOriginal) => {
  const actual = await importOriginal<typeof R21DevTrain>();
  const m = layerMock('R21');
  return {
    ...actual,
    isA3DevTrainDocumentSourceBatch: m.isBatch,
    isA3DevTrainSlotDocumentSourceAssembly: m.isSlot,
    documentTextLookupForSlotAssembly: m.lookup,
    durableEvidenceForDocumentSourceAssembly: m.evidence,
    durableEvidenceBatchForDocumentSourceBatch: m.evidenceBatch,
  };
});
vi.mock('../harness/phase2b2d/a3documentsV2/devTrain.js', async (importOriginal) => {
  const actual = await importOriginal<typeof R27DevTrain>();
  const m = layerMock('R27');
  return {
    ...actual,
    isA3DevTrainDocumentSourceDeltaBatchV2: m.isBatch,
    isA3DevTrainSlotDocumentSourceAssemblyDeltaV2: m.isSlot,
    documentTextLookupForDeltaSlotAssembly: m.lookup,
    evidenceDeltaForDeltaSlotAssembly: m.evidence,
    evidenceDeltaBatchForDocumentSourceDeltaBatch: m.evidenceBatch,
  };
});
vi.mock('../harness/phase2b2d/a3documentsV4/devTrain.js', async (importOriginal) => {
  const actual = await importOriginal<typeof R34DevTrain>();
  const m = layerMock('R34');
  return {
    ...actual,
    isA3DevTrainDocumentSourceDeltaBatchV4: m.isBatch,
    isA3DevTrainSlotDocumentSourceAssemblyDeltaV4: m.isSlot,
    documentTextLookupForDeltaSlotAssemblyV4: m.lookup,
    evidenceDeltaForDeltaSlotAssemblyV4: m.evidence,
    evidenceDeltaBatchForDocumentSourceDeltaBatchV4: m.evidenceBatch,
  };
});
vi.mock('../harness/phase2b2d/a3documentsV5/devTrain.js', async (importOriginal) => {
  const actual = await importOriginal<typeof R40DevTrain>();
  const m = layerMock('R40');
  return {
    ...actual,
    isA3DevTrainDocumentSourceDeltaBatchV5: m.isBatch,
    isA3DevTrainSlotDocumentSourceAssemblyDeltaV5: m.isSlot,
    documentTextLookupForDeltaSlotAssemblyV5: m.lookup,
    evidenceDeltaForDeltaSlotAssemblyV5: m.evidence,
    evidenceDeltaBatchForDocumentSourceDeltaBatchV5: m.evidenceBatch,
  };
});

// The eight landed census derivations: stand-ins return the registered census.
function censusMock(name: string, checkpoint: string) {
  return async (importOriginal: () => Promise<unknown>) => ({
    ...((await importOriginal()) as object),
    [name]: () => stand.census[checkpoint],
  });
}
vi.mock(
  '../harness/phase2b2d/a3evidence/census.js',
  censusMock('deriveR20PublicBindingCensus', 'R20'),
);
vi.mock(
  '../harness/phase2b2d/a3documents/census.js',
  censusMock('deriveR21PublicDocumentSourceCensus', 'R21'),
);
vi.mock(
  '../harness/phase2b2d/a3evidenceV2/census.js',
  censusMock('deriveR26PublicIncrementalEvidenceCensus', 'R26'),
);
vi.mock(
  '../harness/phase2b2d/a3documentsV2/census.js',
  censusMock('deriveR27PublicIncrementalDocumentSourceCensus', 'R27'),
);
vi.mock(
  '../harness/phase2b2d/a3evidenceV4/census.js',
  censusMock('deriveR33PublicIncrementalEvidenceCensus', 'R33'),
);
vi.mock(
  '../harness/phase2b2d/a3documentsV4/census.js',
  censusMock('deriveR34PublicIncrementalDocumentSourceCensus', 'R34'),
);
vi.mock(
  '../harness/phase2b2d/a3evidenceV5/census.js',
  censusMock('deriveR39PublicIncrementalEvidenceCensus', 'R39'),
);
vi.mock(
  '../harness/phase2b2d/a3documentsV5/census.js',
  censusMock('deriveR40PublicIncrementalDocumentSourceCensus', 'R40'),
);

// Counted (and, on request, refusing) R47 seams.
vi.mock('../harness/phase2b2d/sd7R4/measure.js', async (importOriginal) => {
  const actual = await importOriginal<typeof MeasureModule>();
  return {
    ...actual,
    measureR4NearDuplicateGraph: (
      ...args: Parameters<typeof actual.measureR4NearDuplicateGraph>
    ) => {
      stand.r4Measure += 1;
      if (stand.r4Measure === stand.r4MeasureRefuseOnCall) throw new Error('forced R4 refusal');
      return actual.measureR4NearDuplicateGraph(...args);
    },
  };
});
vi.mock('../harness/phase2b2d/a3replayR4/survivors.js', async (importOriginal) => {
  const actual = await importOriginal<typeof SurvivorsModule>();
  return {
    ...actual,
    prepareUnboundR4SlotSamples: (
      ...args: Parameters<typeof actual.prepareUnboundR4SlotSamples>
    ) => {
      stand.samplePrepare += 1;
      if (stand.samplePrepare === stand.samplePrepareRefuseOnCall)
        throw new Error('forced K3 refusal');
      return actual.prepareUnboundR4SlotSamples(...args);
    },
  };
});
vi.mock('../harness/phase2b2d/a3readiness/membership.js', async (importOriginal) => {
  const actual = await importOriginal<typeof MembershipModule>();
  return {
    ...actual,
    requireReachableMembershipPolicyBinding: () => {
      stand.policyBinding += 1;
      if (stand.policyBinding === stand.policyBindingRefuseOnCall)
        throw new Error('forced policy refusal');
      return actual.requireReachableMembershipPolicyBinding();
    },
    deriveUnboundSlotReachableMembershipReadiness: (
      ...args: Parameters<typeof actual.deriveUnboundSlotReachableMembershipReadiness>
    ) => {
      stand.historical.r24 += 1;
      return actual.deriveUnboundSlotReachableMembershipReadiness(...args);
    },
  };
});
vi.mock('../harness/phase2b2d/a3prep/sd9.js', async (importOriginal) => {
  const actual = await importOriginal<typeof Sd9Module>();
  return {
    ...actual,
    evaluateSd9FromAdmissiblePostSd7Bounds: (min: number, max: number) => {
      stand.boundsCalls += 1;
      if (stand.boundsCalls === stand.boundsOverrideOnCall) {
        return 'ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL';
      }
      return actual.evaluateSd9FromAdmissiblePostSd7Bounds(min, max);
    },
  };
});
// Historical R3 entry points: counted, never expected to run.
vi.mock('../harness/phase2b2d/a3graphs/measure.js', async (importOriginal) => {
  const actual = await importOriginal<typeof A3GraphsMeasure>();
  return {
    ...actual,
    measureUnboundSlotSd7Graph: (...args: Parameters<typeof actual.measureUnboundSlotSd7Graph>) => {
      stand.historical.r22 += 1;
      return actual.measureUnboundSlotSd7Graph(...args);
    },
  };
});
vi.mock('../harness/phase2b2d/a3samples/prepare.js', async (importOriginal) => {
  const actual = await importOriginal<typeof A3SamplesPrepare>();
  return {
    ...actual,
    prepareUnboundSlotSampleSurvivors: (
      ...args: Parameters<typeof actual.prepareUnboundSlotSampleSurvivors>
    ) => {
      stand.historical.r23 += 1;
      return actual.prepareUnboundSlotSampleSurvivors(...args);
    },
  };
});
vi.mock('../harness/phase2b2d/a3prep/sd7.js', async (importOriginal) => {
  const actual = await importOriginal<typeof A3PrepSd7>();
  return {
    ...actual,
    prepareSd7SampleSurvivors: (...args: Parameters<typeof actual.prepareSd7SampleSurvivors>) => {
      stand.historical.r7 += 1;
      return actual.prepareSd7SampleSurvivors(...args);
    },
  };
});
vi.mock('../harness/phase2b2d/a3prep/setPSd7.js', async (importOriginal) => {
  const actual = await importOriginal<typeof A3PrepSetPSd7>();
  return {
    ...actual,
    prepareSetPSd7: (...args: Parameters<typeof actual.prepareSetPSd7>) => {
      stand.historical.r8 += 1;
      return actual.prepareSetPSd7(...args);
    },
  };
});
vi.mock('../harness/phase2b2d/a3prep/setRSd7.js', async (importOriginal) => {
  const actual = await importOriginal<typeof A3PrepSetRSd7>();
  return {
    ...actual,
    prepareSetRSd7: (...args: Parameters<typeof actual.prepareSetRSd7>) => {
      stand.historical.r12 += 1;
      return actual.prepareSetRSd7(...args);
    },
  };
});

import {
  assembleUnboundSlotDocumentSources,
  documentTextLookupForUnboundSlotAssembly,
} from '../harness/phase2b2d/a3documents/assemble.js';
import { loadCommittedA2GovernanceV4 } from '../harness/phase2b2d/a3governanceV4/snapshotV4.js';
import {
  loadCommittedA2GovernanceV5,
  readyAuthoritiesOfV5,
} from '../harness/phase2b2d/a3governanceV5/snapshotV5.js';
import { deriveDevTrainAuthorityContinuityV4ToV5 } from '../harness/phase2b2d/a3governanceV5/devTrainContinuity.js';
import {
  bindR46ApprovalForR47,
  isR46ApprovalBinding,
  R46_APPROVAL_RECORD,
  R46_TERMINAL_COMMIT,
} from '../harness/phase2b2d/a3replayR4/approval.js';
import {
  historicalCensusDriftPathsR4,
  R47_CHECKPOINTS,
  R47_COMMITTED_CENSUS,
  requireFreshHistoricalReproductionR4,
  reproducedDocumentBatchesForProof,
  type R47Checkpoint,
  type R47HistoricalReproductionInput,
} from '../harness/phase2b2d/a3replayR4/reproduction.js';
import {
  bindR4DevTrainCanonicalDocumentReplayView,
  isA3R4DevTrainCanonicalDocumentReplayView,
  isA3R4DocumentReplaySlot,
  textLookupForR4ReplaySlot,
} from '../harness/phase2b2d/a3replayR4/documents.js';
import {
  bindR4DevTrainGraphBatch,
  isA3R4DevTrainSlotGraph,
  r4GraphBatchForView,
  r4GraphForReplaySlot,
  r4GraphMeasurementsForBatch,
} from '../harness/phase2b2d/a3replayR4/graphs.js';
import {
  bindR4DevTrainSampleBatch,
  r4GraphBatchForSampleBatch,
  r4SamplePreparationForGraph,
  r4SamplePreparationsForBatch,
} from '../harness/phase2b2d/a3replayR4/samples.js';
import {
  bindR4DevTrainReadinessBatch,
  r4ReadinessDerivationsForBatch,
  r4ReadinessForSamplePreparation,
} from '../harness/phase2b2d/a3replayR4/readiness.js';
import {
  deriveR47PublicGlobalReplayCensus,
  R47_BLOCKER_CLASS_CLEARED,
  R47_SUCCESS_TERMINAL,
} from '../harness/phase2b2d/a3replayR4/census.js';
import { R3_FIVE_GRAM_JACCARD } from '../harness/phase2b2d/sd7R4/types.js';
import type { A3CommittedGovernanceSnapshotV4 } from '../harness/phase2b2d/a3governanceV4/snapshotV4.js';
import type { A3CommittedGovernanceSnapshotV5 } from '../harness/phase2b2d/a3governanceV5/snapshotV5.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const sha = (value: string): string => createHash('sha256').update(value).digest('hex');
const words = (prefix: string, count: number): string =>
  Array.from({ length: count }, (_, i) => `${prefix}${String(i)}`).join(' ');
const gitBytes = (commit: string, path: string): Buffer =>
  execFileSync('git', ['show', `${commit}:${path}`], { cwd: REPO_ROOT, maxBuffer: 64 << 20 });

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    throw error;
  }
  throw new Error('expected a refusal, but none was thrown');
}

const APPROVAL_BYTES = gitBytes(R46_TERMINAL_COMMIT, R46_APPROVAL_RECORD.path);
const PROPOSAL_BYTES = gitBytes(
  R46_TERMINAL_COMMIT,
  'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_R4_SHORT_TEXT_AMENDMENT_PROPOSAL_V1.json',
);
const COMMITTED_BYTES = Object.fromEntries(
  R47_CHECKPOINTS.map((c) => [c, readFileSync(join(REPO_ROOT, R47_COMMITTED_CENSUS[c].path))]),
) as Record<R47Checkpoint, Buffer>;
const committedCensus = (c: R47Checkpoint): Record<string, unknown> =>
  JSON.parse(COMMITTED_BYTES[c].toString('utf8')) as Record<string, unknown>;

function registerFreshCensuses(): void {
  for (const c of R47_CHECKPOINTS) {
    stand.census[c] = { ...committedCensus(c), implementationCommit: 'offline-test' };
  }
}

// ---------------------------------------------------------------------------
// THE INVENTED TWENTY-SLOT FIXTURE.
// ---------------------------------------------------------------------------

interface SlotSpec {
  readonly long: number;
  readonly shorts: readonly string[];
  readonly cliques: readonly number[];
  readonly extraRowsOnFirstDocument: number;
}

const L22 = 22;
const L34 = 34;
/** Strata order: 5 R21, 1 R27, 7 R34, 7 R40. */
const SPECS: readonly SlotSpec[] = [
  {
    long: 18,
    shorts: Array.from({ length: 13 }, () => 'contact'),
    cliques: [4, 4],
    extraRowsOnFirstDocument: 1,
  },
  { long: L22, shorts: ['menu'], cliques: [4], extraRowsOnFirstDocument: 0 },
  { long: L22, shorts: ['menu'], cliques: [4], extraRowsOnFirstDocument: 1 },
  { long: L22, shorts: ['plan du site'], cliques: [3], extraRowsOnFirstDocument: 0 },
  { long: L22, shorts: [''], cliques: [2], extraRowsOnFirstDocument: 0 },
  { long: L22, shorts: ['menu'], cliques: [3], extraRowsOnFirstDocument: 0 },
  { long: L22, shorts: ['accueil'], cliques: [4], extraRowsOnFirstDocument: 0 },
  { long: L22, shorts: ['menu'], cliques: [2], extraRowsOnFirstDocument: 1 },
  { long: L34, shorts: ['menu'], cliques: [4], extraRowsOnFirstDocument: 0 },
  { long: L34, shorts: ['menu'], cliques: [4], extraRowsOnFirstDocument: 0 },
  { long: L34, shorts: ['menu'], cliques: [4], extraRowsOnFirstDocument: 0 },
  { long: L34, shorts: ['menu'], cliques: [3], extraRowsOnFirstDocument: 0 },
  { long: L34, shorts: ['menu'], cliques: [3], extraRowsOnFirstDocument: 0 },
  { long: L34, shorts: ['menu'], cliques: [2], extraRowsOnFirstDocument: 2 },
  { long: L34, shorts: ['menu'], cliques: [2], extraRowsOnFirstDocument: 0 },
  { long: L34, shorts: ['menu'], cliques: [2], extraRowsOnFirstDocument: 0 },
  { long: L34, shorts: ['menu'], cliques: [], extraRowsOnFirstDocument: 1 },
  { long: L34, shorts: ['menu'], cliques: [], extraRowsOnFirstDocument: 0 },
  { long: L34, shorts: ['menu'], cliques: [], extraRowsOnFirstDocument: 0 },
  { long: L34, shorts: [], cliques: [], extraRowsOnFirstDocument: 0 },
];

/** One genuine unbound R21 assembly built from invented rows. */
function assembleSlot(selectionIndex: number, spec: SlotSpec, salt: string) {
  const texts: string[] = [];
  spec.cliques.forEach((size, c) => {
    for (let k = 0; k < size; k += 1)
      texts.push(words(`s${String(selectionIndex)}c${String(c)}w`, 12));
  });
  while (texts.length < spec.long)
    texts.push(words(`s${String(selectionIndex)}u${String(texts.length)}w`, 12));
  texts.push(...spec.shorts);
  const pageEvidence: {
    pageEvidenceId: string;
    documentSha256: string;
    extractionRuleVersion: string;
    mainText: string;
  }[] = [];
  texts.forEach((mainText, d) => {
    const documentSha256 = sha(`${salt}:${String(selectionIndex)}:${String(d)}`);
    const rows = 1 + (d === 0 ? spec.extraRowsOnFirstDocument : 0);
    for (let r = 0; r < rows; r += 1) {
      pageEvidence.push({
        pageEvidenceId: `p-${String(selectionIndex)}-${String(d)}-${String(r)}`,
        documentSha256,
        extractionRuleVersion: 'orgunit-extraction-v2',
        mainText,
      });
    }
  });
  const unbound = assembleUnboundSlotDocumentSources({
    selectionIndex,
    split: 'DEV_TRAIN',
    pageEvidence,
    candidates: pageEvidence.flatMap((row) =>
      (['INTERNATIONAL_OFFICE', 'LANGUAGE_CENTRE'] as const).map((track) => ({
        pageEvidenceId: row.pageEvidenceId,
        documentSha256: row.documentSha256,
        track,
        candidateScore: track === 'INTERNATIONAL_OFFICE' ? '1.0000' : '-1.0000',
        ruleVersion: 'orgunit-signal-rules-v1',
      })),
    ),
  });
  return { unbound, lookup: documentTextLookupForUnboundSlotAssembly(unbound) };
}

let g4: A3CommittedGovernanceSnapshotV4;
let g5: A3CommittedGovernanceSnapshotV5;
let unchangedIndices: number[];
let newIndices: number[];

beforeAll(() => {
  g4 = loadCommittedA2GovernanceV4(REPO_ROOT);
  g5 = loadCommittedA2GovernanceV5(REPO_ROOT);
  const continuity = deriveDevTrainAuthorityContinuityV4ToV5(g4, g5);
  unchangedIndices = continuity.unchanged.map((r) => r.selectionIndex);
  newIndices = [...continuity.newSelectionIndices];
}, 120_000);

interface ChainOptions {
  readonly specs?: readonly SlotSpec[];
  readonly mutateSlot?: (position: number, slot: Record<string, unknown>) => void;
  readonly indexOverride?: (position: number, index: number) => number;
  /** Replace a slot's text capability: `null` removes it, a function substitutes it. */
  readonly lookupOverride?: (
    position: number,
    lookups: readonly ((d: string) => string)[],
  ) => ((d: string) => string) | null | undefined;
}

/** A complete stand-in 5 + 1 + 7 + 7 chain: fresh objects every call. */
function standInChain(options: ChainOptions = {}) {
  const specs = options.specs ?? SPECS;
  const salt = `salt-${String(Math.random())}`;
  const indices = [...unchangedIndices, ...newIndices];
  const v5Ready = new Map(
    readyAuthoritiesOfV5(g5)
      .filter((r) => r.split === 'DEV_TRAIN')
      .map((r) => [r.selectionIndex, r] as const),
  );
  const layers = ['R21', 'R27', 'R34', 'R40'] as const;
  const sizes = [5, 1, 7, 7];
  const batches: Record<string, Record<string, unknown>> = {};
  let position = 0;
  const lookups: ((d: string) => string)[] = [];
  const slotsInOrder: object[] = [];
  layers.forEach((layer, l) => {
    const items: object[] = [];
    for (let k = 0; k < sizes[l]!; k += 1, position += 1) {
      const index = options.indexOverride?.(position, indices[position]!) ?? indices[position]!;
      const { unbound, lookup } = assembleSlot(index, specs[position]!, salt);
      const slot: Record<string, unknown> = {
        kind: `STAND_IN_${layer}_SLOT`,
        selectionIndex: index,
        split: 'DEV_TRAIN',
        exactDuplicate: unbound.exactDuplicate,
        documents: unbound.documents,
        candidateObservationCount: unbound.candidateObservationCount,
      };
      stand.slotLayer.set(slot, layer);
      lookups.push(lookup);
      stand.lookupBySlot.set(slot, lookup);
      slotsInOrder.push(slot);
      stand.authorityBySlot.set(
        slot,
        layer === 'R40' ? v5Ready.get(index)! : { selectionIndex: index, split: 'DEV_TRAIN' },
      );
      options.mutateSlot?.(position, slot);
      items.push(slot);
    }
    const batch: Record<string, unknown> = {
      kind: `STAND_IN_${layer}_BATCH`,
      split: 'DEV_TRAIN',
      items,
    };
    if (layer === 'R34') batch['governanceSnapshotV4'] = g4;
    if (layer === 'R40') batch['governanceSnapshotV5'] = g5;
    stand.batchLayer.set(batch, layer);
    const evidenceBatch = { kind: `STAND_IN_${layer}_EVIDENCE_BATCH` };
    stand.evidenceBatchByDocumentBatch.set(batch, evidenceBatch);
    batches[layer] = Object.assign(batch, { evidenceBatch });
  });
  slotsInOrder.forEach((slot, p) => {
    const override = options.lookupOverride?.(p, lookups);
    if (override !== undefined) stand.lookupBySlot.set(slot, override as never);
  });
  const tx = {
    role: 'nwf_readonly',
    databaseName: 'nwf_pe',
    readOnly: true,
    isolationLevel: 'repeatable read',
  } as const;
  const ended = { ended: true, totalCount: 0 };
  const input = {
    implementationCommit: 'offline-test',
    r20: { evidenceBatch: batches['R21']!['evidenceBatch'], transactionProof: tx },
    r21: { documentBatch: batches['R21'] },
    r26: { evidenceBatch: batches['R27']!['evidenceBatch'], transactionProof: tx, driftProof: {} },
    r27: { documentBatch: batches['R27'], historicalBaseline: {} },
    r33: {
      evidenceBatch: batches['R34']!['evidenceBatch'],
      transactionProof: tx,
      driftProof: {},
      historyProof: {},
    },
    r34: { documentBatch: batches['R34'], historicalBaseline: {} },
    r39: {
      evidenceBatch: batches['R40']!['evidenceBatch'],
      transactionProof: tx,
      driftProof: {},
      historyProof: {},
    },
    r40: { documentBatch: batches['R40'], historicalProof: {} },
    upstreamPools: [ended, ended, ended, ended],
  } as unknown as R47HistoricalReproductionInput;
  return { batches, input };
}

function approved() {
  return bindR46ApprovalForR47({ approvalBytes: APPROVAL_BYTES, proposalBytes: PROPOSAL_BYTES });
}

function provedView(options: ChainOptions = {}) {
  registerFreshCensuses();
  const { batches, input } = standInChain(options);
  const approval = approved();
  const proof = requireFreshHistoricalReproductionR4(input, COMMITTED_BYTES);
  const view = bindR4DevTrainCanonicalDocumentReplayView({
    approval,
    reproductionProof: proof,
    governanceV4: g4,
    governanceV5: g5,
    r21: batches['R21'],
    r27: batches['R27'],
    r34: batches['R34'],
    r40: batches['R40'],
  });
  return { approval, proof, view, batches, input };
}

function resetCounters(): void {
  stand.r4Measure = 0;
  stand.r4MeasureRefuseOnCall = 0;
  stand.samplePrepare = 0;
  stand.samplePrepareRefuseOnCall = 0;
  stand.policyBinding = 0;
  stand.policyBindingRefuseOnCall = 0;
  stand.boundsCalls = 0;
  stand.boundsOverrideOnCall = 0;
  stand.historical = { r22: 0, r23: 0, r24: 0, r7: 0, r8: 0, r12: 0 };
}

// ---------------------------------------------------------------------------
// §3 THE EXACT R46 APPROVAL.
// ---------------------------------------------------------------------------

describe('2D-A3 R47 §3: the exact R46 approval is bound by bytes', () => {
  it('binds the committed R46 approval and the exact approved proposal', () => {
    const binding = approved();
    expect(isR46ApprovalBinding(binding)).toBe(true);
    expect(binding).toMatchObject({
      methodologyVersion: 'METHODOLOGY_V2_R4',
      ruleId: 'SD7_SHORT_TEXT_EXACT_NORMALISED_TOKEN_SEQUENCE_FALLBACK_V1',
      methodologyR4Approved: true,
      methodologyR4Frozen: true,
      r47ImplementationReplayAuthorised: true,
      r47ExecutedAtApproval: false,
      approvedProposal: {
        sha256: '5ebcc562e72f509e2b664f3ae800dc2043142d5d4a6ec1ec4d2958b8abab1d20',
        bytes: 16628,
      },
    });
    expect(isR46ApprovalBinding({ ...binding })).toBe(false);
    expect(isR46ApprovalBinding(JSON.parse(JSON.stringify(binding)))).toBe(false);
  });

  it('refuses one changed byte of the approval or of the proposal', () => {
    const approval = Buffer.from(APPROVAL_BYTES);
    approval[approval.length - 2] = approval[approval.length - 2]! ^ 1;
    expect(
      codeOf(() =>
        bindR46ApprovalForR47({ approvalBytes: approval, proposalBytes: PROPOSAL_BYTES }),
      ),
    ).toBe('R47_R46_APPROVAL_BYTES_MISMATCH');
    const proposal = Buffer.from(PROPOSAL_BYTES);
    proposal[10] = proposal[10]! ^ 1;
    expect(
      codeOf(() =>
        bindR46ApprovalForR47({ approvalBytes: APPROVAL_BYTES, proposalBytes: proposal }),
      ),
    ).toBe('R47_R4_PROPOSAL_BYTES_MISMATCH');
    expect(
      codeOf(() =>
        bindR46ApprovalForR47({ approvalBytes: PROPOSAL_BYTES, proposalBytes: APPROVAL_BYTES }),
      ),
    ).toBe('R47_R46_APPROVAL_BYTES_MISMATCH');
  });
});

// ---------------------------------------------------------------------------
// §19 THE EIGHT-CHECKPOINT REPRODUCTION GATE.
// ---------------------------------------------------------------------------

describe('2D-A3 R47 §19: fresh census equality, excluding only implementationCommit', () => {
  it('ignores key order and implementationCommit, and names every other differing path', () => {
    const committed = committedCensus('R39');
    const reversed = Object.fromEntries(Object.entries(committed).reverse());
    expect(
      historicalCensusDriftPathsR4({ ...reversed, implementationCommit: 'x' }, committed),
    ).toEqual([]);
    const moved = JSON.parse(JSON.stringify(committed)) as Record<string, Record<string, unknown>>;
    moved['databaseAccess']!['sqlStatements'] = 44;
    moved['split'] = 'DEV_CONFIRM' as never;
    expect(historicalCensusDriftPathsR4(moved, committed)).toEqual([
      'databaseAccess.sqlStatements',
      'split',
    ]);
    expect(historicalCensusDriftPathsR4({ ...committed, r38bTip: 'x' }, committed)).toEqual([
      'r38bTip',
    ]);
    const { identityDisclosure: _omitted, ...missing } = committed;
    expect(historicalCensusDriftPathsR4(missing, committed)).toContain('identityDisclosure');
  });

  it('proves all eight checkpoints and binds the proof to the four exact document batches', () => {
    registerFreshCensuses();
    const { batches, input } = standInChain();
    const proof = requireFreshHistoricalReproductionR4(input, COMMITTED_BYTES);
    expect(proof.checkpoints.map((c) => c.checkpoint)).toEqual([...R47_CHECKPOINTS]);
    expect(proof.checkpoints.every((c) => c.differingSemanticPathCount === 0)).toBe(true);
    expect(proof.excludedFields).toEqual(['implementationCommit']);
    expect(reproducedDocumentBatchesForProof(proof)).toEqual({
      r21: batches['R21'],
      r27: batches['R27'],
      r34: batches['R34'],
      r40: batches['R40'],
    });
    expect(reproducedDocumentBatchesForProof({ ...proof })).toBeUndefined();
  });

  it.each([...R47_CHECKPOINTS])('a %s census drift STOPS and mints no proof', (checkpoint) => {
    registerFreshCensuses();
    const census = stand.census[checkpoint] as Record<string, unknown>;
    stand.census[checkpoint] = { ...census, thisFileAuthorises: ['DRIFT'] };
    const { input } = standInChain();
    expect(codeOf(() => requireFreshHistoricalReproductionR4(input, COMMITTED_BYTES))).toBe(
      'STOP_R47_HISTORICAL_CENSUS_REPRODUCTION_DRIFT',
    );
  });

  it('refuses unpinned committed bytes, an open pool and a broken document -> evidence link', () => {
    registerFreshCensuses();
    const { input } = standInChain();
    const altered = {
      ...COMMITTED_BYTES,
      R27: Buffer.concat([COMMITTED_BYTES.R27, Buffer.from(' ')]),
    };
    expect(codeOf(() => requireFreshHistoricalReproductionR4(input, altered))).toBe(
      'R47_COMMITTED_CENSUS_BYTES_MISMATCH',
    );
    const open = { ...input, upstreamPools: [{ ended: false, totalCount: 1 }] };
    expect(codeOf(() => requireFreshHistoricalReproductionR4(open, COMMITTED_BYTES))).toBe(
      'R47_HISTORICAL_REPRODUCTION_INPUT_INVALID',
    );
    const unlinked = { ...input, r39: { ...input.r39, evidenceBatch: {} } } as typeof input;
    expect(codeOf(() => requireFreshHistoricalReproductionR4(unlinked, COMMITTED_BYTES))).toBe(
      'R47_HISTORICAL_REPRODUCTION_INPUT_INVALID',
    );
  });
});

// ---------------------------------------------------------------------------
// §17-§23, §56 THE PRIVATE REPLAY VIEW AND ITS INPUT AUTHORITY.
// ---------------------------------------------------------------------------

describe('2D-A3 R47 §17-§23: the private 5 + 1 + 7 + 7 replay view', () => {
  it('mints twenty replay slots over the genuine objects, with private text capabilities', () => {
    resetCounters();
    const { view, batches } = provedView();
    expect(isA3R4DevTrainCanonicalDocumentReplayView(view)).toBe(true);
    expect(view.isNewDocumentAuthority).toBe(false);
    expect(view.slots.map((s) => s.stratum)).toEqual([
      ...Array(5).fill('R21_V1'),
      'R27_V2',
      ...Array(7).fill('R34_V4'),
      ...Array(7).fill('R40_V5'),
    ]);
    expect(
      view.slots.filter((s) => s.governanceContinuity === 'V4_TO_V5_UNCHANGED_HISTORICAL'),
    ).toHaveLength(13);
    expect(view.slots.filter((s) => s.governanceContinuity === 'V5_ADDITION')).toHaveLength(7);
    const sources = ['R21', 'R27', 'R34', 'R40'].flatMap((l) => batches[l]!['items'] as object[]);
    view.slots.forEach((slot, i) => {
      expect(slot.documents).toBe((sources[i] as { documents: unknown }).documents);
      expect(typeof textLookupForR4ReplaySlot(slot)).toBe('function');
      expect(Object.values(slot).some((v) => typeof v === 'function')).toBe(false);
    });
    expect(() => textLookupForR4ReplaySlot({ ...view.slots[0] })).toThrow();
    expect(isA3R4DocumentReplaySlot(JSON.parse(JSON.stringify(view.slots[0])))).toBe(false);
    expect(stand.r4Measure).toBe(0);
  });

  it('one view per reproduction proof', () => {
    const { proof, approval, batches } = provedView();
    expect(
      codeOf(() =>
        bindR4DevTrainCanonicalDocumentReplayView({
          approval,
          reproductionProof: proof,
          governanceV4: g4,
          governanceV5: g5,
          r21: batches['R21'],
          r27: batches['R27'],
          r34: batches['R34'],
          r40: batches['R40'],
        }),
      ),
    ).toBe('R47_DOCUMENT_VIEW_ALREADY_BOUND');
  });

  /** Proves, then binds with one input replaced. */
  function bindWith(
    replace: (base: Record<string, unknown>) => Record<string, unknown>,
    options: ChainOptions = {},
  ): string {
    registerFreshCensuses();
    const { batches, input } = standInChain(options);
    const base = {
      approval: approved(),
      reproductionProof: requireFreshHistoricalReproductionR4(input, COMMITTED_BYTES),
      governanceV4: g4,
      governanceV5: g5,
      r21: batches['R21'],
      r27: batches['R27'],
      r34: batches['R34'],
      r40: batches['R40'],
    };
    resetCounters();
    const code = codeOf(() =>
      bindR4DevTrainCanonicalDocumentReplayView(
        replace(base) as typeof base & { approval: unknown },
      ),
    );
    expect(stand.r4Measure).toBe(0);
    return code;
  }

  it.each([
    [
      'a missing approval',
      (b: Record<string, unknown>) => ({ ...b, approval: undefined }),
      'R47_R46_APPROVAL_NOT_BOUND',
    ],
    [
      'a copied approval',
      (b: Record<string, unknown>) => ({ ...b, approval: { ...(b['approval'] as object) } }),
      'R47_R46_APPROVAL_NOT_BOUND',
    ],
    [
      'a foreign proof',
      (b: Record<string, unknown>) => ({
        ...b,
        reproductionProof: { ...(b['reproductionProof'] as object) },
      }),
      'R47_HISTORICAL_REPRODUCTION_NOT_PROVED',
    ],
    [
      'a spread R21 batch',
      (b: Record<string, unknown>) => ({ ...b, r21: { ...(b['r21'] as object) } }),
      'R47_HISTORICAL_REPRODUCTION_NOT_PROVED',
    ],
    [
      'an R34 batch in the R27 position',
      (b: Record<string, unknown>) => ({ ...b, r27: b['r34'] }),
      'R47_HISTORICAL_REPRODUCTION_NOT_PROVED',
    ],
    [
      'a non-minted governance V5',
      (b: Record<string, unknown>) => ({
        ...b,
        governanceV5: { ...(b['governanceV5'] as object) },
      }),
      'STOP_R47_GOVERNANCE_V5_COVERAGE_MISMATCH',
    ],
  ])('refuses %s before any R4 graph call', (_, replace, code) => {
    expect(bindWith(replace)).toBe(code);
  });

  it.each([
    ['R21', 0],
    ['R27', 5],
    ['R34', 6],
    ['R40', 13],
  ])('refuses a fake or copied %s slot inside a proved batch', (_, position) => {
    const code = bindWith((b) => b, {
      mutateSlot: (p, slot) => {
        if (p === position) stand.slotLayer.delete(slot);
      },
    });
    expect(code).toBe('R47_DOCUMENT_SOURCE_NOT_GENUINE');
  });

  it('refuses a missing text capability', () => {
    expect(bindWith((b) => b, { lookupOverride: (p) => (p === 19 ? null : undefined) })).toBe(
      'R47_TEXT_CAPABILITY_UNAVAILABLE',
    );
  });

  it('refuses a duplicate selection slot', () => {
    expect(
      bindWith((b) => b, { indexOverride: (p, i) => (p === 1 ? unchangedIndices[0]! : i) }),
    ).toBe('R47_DUPLICATE_SELECTION_SLOT');
  });

  it('refuses a non-DEV_TRAIN slot', () => {
    expect(
      bindWith((b) => b, {
        mutateSlot: (p, slot) => {
          if (p === 3) slot['split'] = 'DEV_CONFIRM';
        },
      }),
    ).toBe('R47_DOCUMENT_SLOT_NOT_DEV_TRAIN');
  });

  it('refuses a slot set that is not exactly the 13 unchanged + 7 new V5 DEV_TRAIN slots', () => {
    // An R40 slot carrying an unchanged authority's index (and its own stand-in authority).
    expect(bindWith((b) => b, { indexOverride: (p, i) => (p === 13 ? 1_000_000 : i) })).toBe(
      'R47_DOCUMENT_SOURCE_NOT_GENUINE',
    );
    expect(
      bindWith((b) => b, {
        indexOverride: (p, i) => (p === 0 ? newIndices[0]! : p === 13 ? unchangedIndices[0]! : i),
      }),
    ).toBe('STOP_R47_GOVERNANCE_V5_COVERAGE_MISMATCH');
  });

  it('refuses a stratum that is not exactly 5 / 1 / 7 / 7', () => {
    expect(
      bindWith((b) => {
        const r21 = b['r21'] as { items: object[] };
        r21.items.pop();
        return b;
      }),
    ).toBe('R47_DOCUMENT_STRATUM_COUNT_MISMATCH');
  });

  it('refuses a document population that is not 617 / 611 / 1234 / 5 / 6 / 5', () => {
    const specs = SPECS.map((s, i) => (i === 19 ? { ...s, shorts: ['extra'] } : s));
    expect(bindWith((b) => b, { specs })).toBe('STOP_R47_DOCUMENT_POPULATION_MISMATCH');
    const moved = SPECS.map((s, i) => (i === 16 ? { ...s, extraRowsOnFirstDocument: 0 } : s));
    expect(bindWith((b) => b, { specs: moved })).toBe('STOP_R47_DOCUMENT_POPULATION_MISMATCH');
  });
});

// ---------------------------------------------------------------------------
// §26, §42, §43, §57, §59, §60 THE R4 GRAPH BATCH.
// ---------------------------------------------------------------------------

describe('2D-A3 R47 §26: twenty R4 graphs, unbound first, then minted', () => {
  it('measures every slot once by the same path, proves R3 history and A2 invariance', () => {
    resetCounters();
    const { view } = provedView();
    const batch = bindR4DevTrainGraphBatch(view);
    expect(stand.r4Measure).toBe(20);
    expect(r4GraphMeasurementsForBatch(batch)).toBe(20);
    expect(batch.items).toHaveLength(20);
    expect(r4GraphBatchForView(view)).toBe(batch);
    view.slots.forEach((slot, i) => {
      expect(r4GraphForReplaySlot(slot)).toBe(batch.items[i]);
      expect(batch.items[i]!.graph.documents.map((d) => d.documentSha256)).toEqual(
        slot.documents.map((e) => e.document.documentSha256),
      );
    });
    expect(
      batch.items.every((g) => g.graphSd9Status === 'ACQUISITION_SUCCESSFUL' && g.a2StatusMatches),
    ).toBe(true);
    const longEdges = batch.items.reduce(
      (t, g) => t + g.graph.edges.filter((e) => e.basis === R3_FIVE_GRAM_JACCARD).length,
      0,
    );
    expect(longEdges).toBe(65);
    expect(Object.values(stand.historical)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(codeOf(() => bindR4DevTrainGraphBatch(view))).toBe(
      'R47_R4_GRAPH_BATCH_ALREADY_MEASURED',
    );
    expect(codeOf(() => bindR4DevTrainGraphBatch({ ...view }))).toBe(
      'R47_NOT_A_MINTED_DOCUMENT_REPLAY_VIEW',
    );
  });

  it("§23: another slot's text capability cannot resolve this slot's documents", () => {
    resetCounters();
    const { view } = provedView({
      lookupOverride: (p, lookups) => (p === 19 ? lookups[0] : undefined),
    });
    expect(codeOf(() => bindR4DevTrainGraphBatch(view))).toBe('R47_R4_GRAPH_MEASUREMENT_STOPPED');
    expect(stand.r4Measure).toBe(20);
    expect(view.slots.every((slot) => r4GraphForReplaySlot(slot) === undefined)).toBe(true);
  });

  it('§57: a refusal on slot 20 brands no graph, maps no slot and mints no batch', () => {
    resetCounters();
    const { view } = provedView();
    stand.r4MeasureRefuseOnCall = 20;
    expect(codeOf(() => bindR4DevTrainGraphBatch(view))).toBe('R47_R4_GRAPH_MEASUREMENT_STOPPED');
    expect(view.slots.every((slot) => r4GraphForReplaySlot(slot) === undefined)).toBe(true);
    expect(r4GraphBatchForView(view)).toBeUndefined();
  });

  it('§16 / §43: one graph-level SD9 disagreement with A2 STOPS and mints nothing', () => {
    resetCounters();
    const { view } = provedView();
    stand.boundsOverrideOnCall = 20;
    expect(codeOf(() => bindR4DevTrainGraphBatch(view))).toBe(
      'STOP_R47_A2_SD9_INVARIANCE_MISMATCH',
    );
    expect(view.slots.every((slot) => r4GraphForReplaySlot(slot) === undefined)).toBe(true);
  });

  it('§11: a changed R3 branch (one extra long edge) STOPS and mints nothing', () => {
    resetCounters();
    const specs = SPECS.map((s, i) => (i === 17 ? { ...s, cliques: [2] } : s));
    const { view } = provedView({ specs });
    expect(codeOf(() => bindR4DevTrainGraphBatch(view))).toBe(
      'STOP_R47_R3_LONG_BRANCH_INVARIANT_MISMATCH',
    );
    expect(view.slots.every((slot) => r4GraphForReplaySlot(slot) === undefined)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §28-§40, §58 SAMPLES AND READINESS.
// ---------------------------------------------------------------------------

function graphBatchOf(options: ChainOptions = {}) {
  resetCounters();
  const chain = provedView(options);
  return { ...chain, graphBatch: bindR4DevTrainGraphBatch(chain.view) };
}

describe('2D-A3 R47 §28-§35: twenty R4 sample preparations', () => {
  it('prepares every slot once; every document is a survivor or an exclusion; caps exact', () => {
    const { graphBatch } = graphBatchOf();
    const samples = bindR4DevTrainSampleBatch(graphBatch);
    expect(stand.samplePrepare).toBe(20);
    expect(r4SamplePreparationsForBatch(samples)).toBe(20);
    expect(r4GraphBatchForSampleBatch(samples)).toBe(graphBatch);
    samples.items.forEach((prep, i) => {
      const n = graphBatch.items[i]!.graph.documents.length;
      expect(r4SamplePreparationForGraph(graphBatch.items[i])).toBe(prep);
      for (const sample of [prep.setP, prep.setR]) {
        expect(
          sample.sd7Preparation.counts.survivorCount + sample.sd7Preparation.counts.exclusionCount,
        ).toBe(n);
        expect(sample.sd7Preparation.counts.unresolvedCount).toBe(0);
        expect(sample.documentCap.documents).toEqual(
          sample.survivorAwareFullRank.slice(0, sample.documentCap.capSize),
        );
      }
      expect(prep.setP.documentCap.capSize).toBe(8);
      expect(prep.setR.documentCap.capSize).toBe(4);
    });
    expect(Object.values(stand.historical)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(codeOf(() => bindR4DevTrainSampleBatch(graphBatch))).toBe(
      'R47_R4_SAMPLE_BATCH_ALREADY_PREPARED',
    );
  });

  it('§58: a K3 refusal on slot 20 mints no sample authority', () => {
    const { graphBatch } = graphBatchOf();
    stand.samplePrepareRefuseOnCall = 20;
    expect(codeOf(() => bindR4DevTrainSampleBatch(graphBatch))).toBe(
      'R47_R4_SAMPLE_POSTCONDITION_FAILED',
    );
    expect(graphBatch.items.every((g) => r4SamplePreparationForGraph(g) === undefined)).toBe(true);
  });
});

describe('2D-A3 R47 §36-§39: twenty R4 readiness results', () => {
  it('exact reachable membership BY REFERENCE, exact full rank, exact sample SD9', () => {
    const { graphBatch } = graphBatchOf();
    const samples = bindR4DevTrainSampleBatch(graphBatch);
    const readiness = bindR4DevTrainReadinessBatch(samples);
    expect(r4ReadinessDerivationsForBatch(readiness)).toBe(20);
    expect(stand.policyBinding).toBe(20);
    readiness.items.forEach((r, i) => {
      const prep = samples.items[i]!;
      expect(r4ReadinessForSamplePreparation(prep)).toBe(r);
      expect(r.setPReachableMembership.status).toBe('REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT');
      expect(r.setRReachableMembership.status).toBe('REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT');
      expect(r.setPReachableMembership.documents).toBe(prep.setP.documentCap.documents);
      expect(r.setRReachableMembership.documents).toBe(prep.setR.documentCap.documents);
      expect(r.setPReachableMembership.ownerPolicy.requiredMembershipScope).toBe(
        'REACHABLE_SELECTED_CAPPED_MEMBERSHIP',
      );
      expect([r.setPFullRank.status, r.setRFullRank.status]).toEqual([
        'R4_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT',
        'R4_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT',
      ]);
      expect([r.setPSd9.status, r.setRSd9.status]).toEqual([
        'ACQUISITION_SUCCESSFUL',
        'ACQUISITION_SUCCESSFUL',
      ]);
      expect(r.setPSd9.exactSurvivorCount).toBe(prep.setP.sd7Preparation.counts.survivorCount);
    });
    expect(codeOf(() => bindR4DevTrainReadinessBatch(samples))).toBe(
      'R47_R4_READINESS_BATCH_ALREADY_DERIVED',
    );
  });

  it('a readiness refusal on slot 20 mints nothing', () => {
    const { graphBatch } = graphBatchOf();
    const samples = bindR4DevTrainSampleBatch(graphBatch);
    stand.policyBindingRefuseOnCall = 20;
    expect(codeOf(() => bindR4DevTrainReadinessBatch(samples))).toBe(
      'R47_R4_READINESS_POSTCONDITION_FAILED',
    );
    expect(samples.items.every((p) => r4ReadinessForSamplePreparation(p) === undefined)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §42-§49 THE PUBLIC CENSUS.
// ---------------------------------------------------------------------------

describe('2D-A3 R47 §42-§49: the census is aggregate-only and derived from the minted chain', () => {
  it('derives every section, closes every partition and discloses no identity', () => {
    const chain = graphBatchOf();
    const samples = bindR4DevTrainSampleBatch(chain.graphBatch);
    const readiness = bindR4DevTrainReadinessBatch(samples);
    const census = deriveR47PublicGlobalReplayCensus({
      approval: chain.approval,
      reproductionProof: chain.proof,
      view: chain.view,
      readinessBatch: readiness,
      implementationCommit: 'offline-test',
      access: {
        role: 'nwf_readonly',
        database: 'nwf_pe',
        layers: [],
        sqlStatementsAfterLastPoolClosed: 0,
        writes: 0,
        networkRequests: 0,
        devConfirmEvidenceReads: 0,
        finalHoldoutEvidenceReads: 0,
        sealedRootReads: 0,
      },
    });
    expect(census.thisFileAuthorises).toEqual([]);
    expect(census.r4Graph).toMatchObject({
      slots: 20,
      documents: 611,
      longDocuments: 580,
      shortBranchDocuments: 31,
      relationResolvedDocuments: 611,
      unresolvedDocuments: 0,
      totalUnorderedPairs: 8502 + census.r4Graph.r4ExactSequenceBranchPairs,
      r3FiveGramPairs: 8502,
      r3FiveGramEdges: 65,
      r3DocumentsTouchingAnEdge: 54,
      r4ShortExactSequenceEdges: 78,
      measurements: 20,
    });
    expect(census.a2Invariance).toMatchObject({
      devTrainSlotsChecked: 20,
      a2AcquisitionOfRecordStatusesMatched: 20,
      mismatches: 0,
    });
    for (const sample of [census.setP, census.setR]) {
      expect(sample).toMatchObject({
        rankedDocuments: 611,
        unresolved: 0,
        exactCaps: 20,
        blockedCaps: 0,
        fullRankExact: 20,
        fullRankBlocked: 0,
        reachableExact: 20,
        reachableBlocked: 0,
        reachableMembershipIsCapArrayByReference: true,
        preparations: 20,
      });
      expect(sample.survivors + sample.exclusions).toBe(611);
      expect(sample.mechanicalSd9).toEqual({ successful: 20, unsuccessful: 0, pending: 0 });
    }
    expect(census.divergence.closes).toBe(true);
    expect(census.divergence.documents).toBe(611);
    expect(census.freezeBoundary).toMatchObject({
      conclusion: R47_BLOCKER_CLASS_CLEARED,
      corpusFreezeClear: false,
    });
    expect(census.terminalState).toBe(R47_SUCCESS_TERMINAL);
    expect(census.documentReplayView.population).toMatchObject({
      sourceRows: 617,
      slotLocalDocuments: 611,
    });
    const text = JSON.stringify(census);
    expect(text).not.toMatch(
      /"(?:selectionIndex|selectionIndices|organisationId|echeRowKey|runId|documentSha256|pageId|mainText|tokens|edges|rankPosition|url|host)"\s*:(?!\s*false)/,
    );
    const digests = [...text.matchAll(/\b[0-9a-f]{64}\b/g)].map((m) => m[0]);
    const allowed = new Set<string>([
      R46_APPROVAL_RECORD.sha256,
      '5ebcc562e72f509e2b664f3ae800dc2043142d5d4a6ec1ec4d2958b8abab1d20',
      ...R47_CHECKPOINTS.map((c) => R47_COMMITTED_CENSUS[c].sha256),
    ]);
    expect(digests.filter((d) => !allowed.has(d))).toEqual([]);
  });

  it('refuses a census over an unminted or unlinked chain', () => {
    const chain = graphBatchOf();
    const samples = bindR4DevTrainSampleBatch(chain.graphBatch);
    const readiness = bindR4DevTrainReadinessBatch(samples);
    const base = {
      approval: chain.approval,
      reproductionProof: chain.proof,
      view: chain.view,
      readinessBatch: readiness,
      implementationCommit: 'x',
      access: {} as never,
    };
    expect(
      codeOf(() =>
        deriveR47PublicGlobalReplayCensus({ ...base, readinessBatch: { ...readiness } }),
      ),
    ).toBe('R47_NOT_A_MINTED_R4_READINESS_BATCH');
    expect(codeOf(() => deriveR47PublicGlobalReplayCensus({ ...base, approval: {} }))).toBe(
      'R47_R46_APPROVAL_NOT_BOUND',
    );
    expect(isA3R4DevTrainSlotGraph({ ...chain.graphBatch.items[0] })).toBe(false);
  });
});
