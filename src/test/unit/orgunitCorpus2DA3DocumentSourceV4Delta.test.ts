/**
 * PHASE 2B-2D A3 R34 — THE V4 INCREMENTAL DELTA ADAPTER AROUND R21'S PURE ASSEMBLER.
 *
 * Proves, without a database:
 *
 *   - the V4 delta R34 consumes is exactly R33's seven new DEV_TRAIN
 *     authorities, derived purely from the committed V3 / V4 snapshots;
 *   - the mechanical R33 -> R21 adapter re-checks the page -> fetch and
 *     candidate -> page links and refuses BEFORE R21 assembly when the row
 *     graph is inconsistent, and carries no URL, host, root, title or heading;
 *   - every delta item reaches R21's real `assembleUnboundSlotDocumentSources`
 *     exactly once, one slot at a time, all-or-nothing, and R21's own
 *     refusals (support gate, mixed versions, text divergence) propagate;
 *   - exact duplicates collapse through R21 slot-locally with every source
 *     row preserved and no representative, and identical bytes in two slots
 *     stay two documents;
 *   - R21's result must agree with R33's own per-run counts (rows, documents,
 *     candidates, R10 coverage, row-to-document partition), or R34 STOPS;
 *   - nothing but an actual R33 mint with a proved fresh reproduction can
 *     mint, and the R34 text accessor refuses anything but an R34 slot;
 *   - R21 V1 minting, R27 V2 minting and every database entry point are never
 *     called;
 *   - the fresh-R33 reproduction comparison and the committed R21 + R27
 *     six-slot historical baseline.
 *
 * Synthetic R33-shaped items are NOT minted and cannot be: R33's mint binds a
 * real run whose UUID digest is the governance `runRefSha256`. The minted
 * route is exercised by the real V3/V4 -> R33 -> R34 chain, whose results the
 * audit and the committed census record.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type * as R21AssembleModule from '../harness/phase2b2d/a3documents/assemble.js';
import type * as R21DevTrainModule from '../harness/phase2b2d/a3documents/devTrain.js';
import type * as R27DevTrainModule from '../harness/phase2b2d/a3documentsV2/devTrain.js';
import type * as R20DatabaseModule from '../harness/phase2b2d/a3evidence/database.js';

const calls = vi.hoisted(() => ({
  assemble: 0,
  r21Mint: 0,
  r27Mint: 0,
  snapshot: 0,
  unboundLoad: 0,
}));

vi.mock('../harness/phase2b2d/a3documents/assemble.js', async (importOriginal) => {
  const actual = await importOriginal<typeof R21AssembleModule>();
  return {
    ...actual,
    assembleUnboundSlotDocumentSources: (
      ...args: Parameters<typeof actual.assembleUnboundSlotDocumentSources>
    ) => {
      calls.assemble += 1;
      return actual.assembleUnboundSlotDocumentSources(...args);
    },
  };
});

vi.mock('../harness/phase2b2d/a3documents/devTrain.js', async (importOriginal) => {
  const actual = await importOriginal<typeof R21DevTrainModule>();
  return {
    ...actual,
    bindDevTrainDocumentSourceBatch: (
      ...args: Parameters<typeof actual.bindDevTrainDocumentSourceBatch>
    ) => {
      calls.r21Mint += 1;
      return actual.bindDevTrainDocumentSourceBatch(...args);
    },
  };
});

vi.mock('../harness/phase2b2d/a3documentsV2/devTrain.js', async (importOriginal) => {
  const actual = await importOriginal<typeof R27DevTrainModule>();
  return {
    ...actual,
    bindDevTrainDocumentSourceDeltaBatchV2: (
      ...args: Parameters<typeof actual.bindDevTrainDocumentSourceDeltaBatchV2>
    ) => {
      calls.r27Mint += 1;
      return actual.bindDevTrainDocumentSourceDeltaBatchV2(...args);
    },
  };
});

vi.mock('../harness/phase2b2d/a3evidence/database.js', async (importOriginal) => {
  const actual = await importOriginal<typeof R20DatabaseModule>();
  return {
    ...actual,
    withReadOnlyEvidenceSnapshot: (
      ...args: Parameters<typeof actual.withReadOnlyEvidenceSnapshot>
    ) => {
      calls.snapshot += 1;
      return actual.withReadOnlyEvidenceSnapshot(...args);
    },
    loadUnboundDurableRunEvidence: (
      ...args: Parameters<typeof actual.loadUnboundDurableRunEvidence>
    ) => {
      calls.unboundLoad += 1;
      return actual.loadUnboundDurableRunEvidence(...args);
    },
  };
});

import { documentTextLookupForUnboundSlotAssembly } from '../harness/phase2b2d/a3documents/assemble.js';
import { A3DocumentSourceRefusal } from '../harness/phase2b2d/a3documents/refusal.js';
import type { UnboundA3SlotDocumentSourceAssembly } from '../harness/phase2b2d/a3documents/types.js';
import { loadCommittedA2GovernanceV3 } from '../harness/phase2b2d/a3governanceV3/snapshotV3.js';
import { loadCommittedA2GovernanceV4 } from '../harness/phase2b2d/a3governanceV4/snapshotV4.js';
import { deriveDevTrainEvidenceDeltaV4 } from '../harness/phase2b2d/a3evidenceV4/authorityDelta.js';
import { planDevTrainEvidenceDeltaRequestsV4 } from '../harness/phase2b2d/a3evidenceV4/devTrain.js';
import type { R33PublicIncrementalEvidenceCensus } from '../harness/phase2b2d/a3evidenceV4/census.js';
import type { A3DurableAcquisitionEvidenceDeltaV4 } from '../harness/phase2b2d/a3evidenceV4/types.js';
import {
  assembleDeltaItemsAllOrNothingV4,
  slotInputFromDeltaEvidenceV4,
} from '../harness/phase2b2d/a3documentsV4/assembleDelta.js';
import {
  bindDevTrainDocumentSourceDeltaBatchV4,
  deltaSlotAssemblyForEvidenceDeltaV4,
  documentSourceDeltaBatchForEvidenceDeltaBatchV4,
  documentTextLookupForDeltaSlotAssemblyV4,
  evidenceDeltaBatchForDocumentSourceDeltaBatchV4,
  evidenceDeltaForDeltaSlotAssemblyV4,
  isA3DevTrainDocumentSourceDeltaBatchV4,
  isA3DevTrainSlotDocumentSourceAssemblyDeltaV4,
} from '../harness/phase2b2d/a3documentsV4/devTrain.js';
import {
  deriveCanonicalDocumentSourceCoverageExpansionV4,
  deriveR34PublicIncrementalDocumentSourceCensus,
} from '../harness/phase2b2d/a3documentsV4/census.js';
import {
  R34_EXPECTED_R33_CHECKPOINT,
  r33ReproductionDriftPaths,
  r33ReproductionProofForBatch,
  requireFreshR33Reproduction,
  requireHistoricalBaselineProof,
  requireHistoricalDocumentSourceBaseline,
} from '../harness/phase2b2d/a3documentsV4/r33Drift.js';
import { A3DocumentSourceV4Refusal } from '../harness/phase2b2d/a3documentsV4/refusal.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const E = 'docs/evaluation';
const R21_CENSUS = `${E}/PHASE_2B_2D_A3_R21_DEV_TRAIN_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1.json`;
const R27_CENSUS = `${E}/PHASE_2B_2D_A3_R27_DEV_TRAIN_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1.json`;
const R33_CENSUS = `${E}/PHASE_2B_2D_A3_R33_DEV_TRAIN_INCREMENTAL_DURABLE_EVIDENCE_CENSUS_V1.json`;

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(join(REPO_ROOT, path), 'utf8')) as unknown;

const V2 = 'orgunit-extraction-v2';
const V1 = 'orgunit-extraction-v1';
const SIGNAL = 'orgunit-signal-rules-v1';
const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

// ---------------------------------------------------------------------------
// Synthetic R33-shaped rows. Unbranded: they can never be minted.
// ---------------------------------------------------------------------------

interface PageSpec {
  readonly id: string;
  readonly sha: string;
  readonly text?: string;
  readonly version?: string;
}

function pageRow(spec: PageSpec) {
  const fetchId = `fetch-${spec.id}`;
  return {
    page: {
      id: spec.id,
      fetchObservationId: fetchId,
      rootKey: 'claim:synthetic',
      title: 'SYNTHETIC TITLE',
      declaredLang: null,
      headings: ['SYNTHETIC HEADING'],
      mainText: spec.text ?? `text of ${spec.sha.slice(0, 4)}`,
      mainTextChars: 0,
      mainTextTruncated: false,
      extractionMethod: 'regex',
      ruleVersion: spec.version ?? V2,
      observedAt: '2026-01-01T00:00:00Z',
    },
    fetch: {
      id: fetchId,
      responseSha256: spec.sha,
      requestedUrl: 'https://synthetic-host.invalid/',
    },
    responseSha256: spec.sha,
    requestedUrl: 'https://synthetic-host.invalid/',
    httpStatus: 200,
  };
}

function candidateRows(pageId: string, sha: string, a = '1.0000', b = '-2.0000') {
  return (
    [
      ['INTERNATIONAL_OFFICE', a],
      ['LANGUAGE_CENTRE', b],
    ] as const
  ).map(([track, score]) => ({
    candidate: {
      id: `cand-${pageId}-${track}`,
      pageEvidenceId: pageId,
      track,
      candidateScore: score,
      ruleVersion: SIGNAL,
      signals: [],
    },
    pageEvidenceId: pageId,
    responseSha256: sha,
  }));
}

/** R33-shaped item whose integrity counts are computed as R20 computes them. */
function syntheticItem(pages: readonly PageSpec[], selectionIndex = 900) {
  const pageEvidence = pages.map(pageRow);
  const candidates = pages.flatMap((p) => candidateRows(p.id, p.sha));
  return {
    kind: 'A3_DURABLE_ACQUISITION_EVIDENCE_DELTA_V4',
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
    split: 'DEV_TRAIN',
    authority: { selectionIndex, split: 'DEV_TRAIN' },
    governanceSnapshotV4: {},
    evidence: {
      kind: 'UNBOUND_DURABLE_DATABASE_EVIDENCE',
      run: { id: `run-${selectionIndex}` },
      pageEvidence,
      candidates,
      integrity: {
        pageEvidenceSourceRowCount: pageEvidence.length,
        distinctResponseSha256Count: new Set(pages.map((p) => p.sha)).size,
        candidateRowCount: candidates.length,
      },
    },
  };
}

function asItem(value: unknown): A3DurableAcquisitionEvidenceDeltaV4 {
  return value as A3DurableAcquisitionEvidenceDeltaV4;
}

function v4Code(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof A3DocumentSourceV4Refusal) return error.code;
    throw error;
  }
  throw new Error('expected a refusal, but none was thrown');
}

function r21Code(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof A3DocumentSourceRefusal) return error.code;
    throw error;
  }
  throw new Error('expected an R21 refusal, but none was thrown');
}

function assembleOne(item: unknown): UnboundA3SlotDocumentSourceAssembly {
  return assembleDeltaItemsAllOrNothingV4([asItem(item)])[0]!;
}

// ---------------------------------------------------------------------------
// 0. THE DELTA R34 CONSUMES.
// ---------------------------------------------------------------------------

describe('2D-A3 R34: the V4 delta is exactly R33 seven new DEV_TRAIN authorities', () => {
  const v3 = loadCommittedA2GovernanceV3(REPO_ROOT);
  const v4 = loadCommittedA2GovernanceV4(REPO_ROOT);
  const delta = deriveDevTrainEvidenceDeltaV4(v3, v4);

  it('is 6 unchanged (history) + 7 new, and R33 plans exactly seven requests', () => {
    expect(delta.unchanged).toHaveLength(6);
    expect(delta.newAuthorities).toHaveLength(7);
    expect(delta.v2ReadyCount).toBe(13);
    expect(planDevTrainEvidenceDeltaRequestsV4(delta, v4)).toHaveLength(7);
  });

  it('internally, the new selection indices are 34, 39, 44, 49, 56, 61, 71', () => {
    expect(delta.newAuthorities.map((entry) => entry.v2.selectionIndex)).toEqual([
      34, 39, 44, 49, 56, 61, 71,
    ]);
    expect(delta.unchanged.map((entry) => entry.v2.selectionIndex)).toEqual([0, 5, 12, 17, 22, 27]);
  });

  it('planning the delta opened no database snapshot', () => {
    expect(calls.snapshot).toBe(0);
    expect(calls.unboundLoad).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// A. THE ADAPTER.
// ---------------------------------------------------------------------------

describe('2D-A3 R34 §8: the mechanical R33 -> R21 adapter', () => {
  it('maps exactly the documented fields and carries no URL, host, root, title or heading', () => {
    const input = slotInputFromDeltaEvidenceV4(syntheticItem([{ id: 'p1', sha: SHA_A }]));
    expect(Object.keys(input).sort()).toEqual([
      'candidates',
      'pageEvidence',
      'selectionIndex',
      'split',
    ]);
    expect(input.selectionIndex).toBe(900);
    expect(input.split).toBe('DEV_TRAIN');
    expect(input.pageEvidence).toEqual([
      {
        pageEvidenceId: 'p1',
        documentSha256: SHA_A,
        extractionRuleVersion: V2,
        mainText: `text of ${SHA_A.slice(0, 4)}`,
      },
    ]);
    expect(input.candidates.map((row) => Object.keys(row).sort())).toEqual([
      ['candidateScore', 'documentSha256', 'pageEvidenceId', 'ruleVersion', 'track'],
      ['candidateScore', 'documentSha256', 'pageEvidenceId', 'ruleVersion', 'track'],
    ]);
    expect(JSON.stringify(input)).not.toMatch(/SYNTHETIC|synthetic-host|claim:|run-/);
  });

  it('passes the persisted numeric(8,4) text through, signed and unconverted', () => {
    const input = slotInputFromDeltaEvidenceV4(syntheticItem([{ id: 'p1', sha: SHA_A }]));
    expect(input.candidates.map((row) => row.candidateScore)).toEqual(['1.0000', '-2.0000']);
    expect(input.candidates.every((row) => typeof row.candidateScore === 'string')).toBe(true);
  });

  it('passes the persisted text through byte for byte, untransformed', () => {
    const text = '  Ünïcode   WHITESPACE &amp; case\n';
    const input = slotInputFromDeltaEvidenceV4(syntheticItem([{ id: 'p1', sha: SHA_A, text }]));
    expect(input.pageEvidence[0]!.mainText).toBe(text);
  });

  it('refuses a page whose fetch link or fetch digest disagrees - before R21', () => {
    const before = calls.assemble;
    const badFetchLink = syntheticItem([{ id: 'p1', sha: SHA_A }]);
    (
      badFetchLink.evidence.pageEvidence[0]!.page as { fetchObservationId: string }
    ).fetchObservationId = 'fetch-other';
    expect(v4Code(() => assembleOne(badFetchLink))).toBe('R34_PAGE_FETCH_RELATION_MISMATCH');

    const badDigest = syntheticItem([{ id: 'p1', sha: SHA_A }]);
    (badDigest.evidence.pageEvidence[0]!.fetch as { responseSha256: string }).responseSha256 =
      SHA_B;
    expect(v4Code(() => assembleOne(badDigest))).toBe('R34_PAGE_FETCH_RELATION_MISMATCH');
    expect(calls.assemble).toBe(before);
  });

  it('refuses a candidate whose page link disagrees - before R21', () => {
    const before = calls.assemble;
    const badCandidate = syntheticItem([{ id: 'p1', sha: SHA_A }]);
    (badCandidate.evidence.candidates[1]!.candidate as { pageEvidenceId: string }).pageEvidenceId =
      'p9';
    expect(v4Code(() => assembleOne(badCandidate))).toBe('R34_CANDIDATE_PAGE_RELATION_MISMATCH');
    expect(calls.assemble).toBe(before);
  });

  it('a broken relation on the LAST item refuses before R21 is called for ANY item', () => {
    const before = calls.assemble;
    const last = syntheticItem([{ id: 'z1', sha: SHA_A }], 906);
    (last.evidence.pageEvidence[0]!.page as { fetchObservationId: string }).fetchObservationId =
      'fetch-other';
    const items = [
      ...[0, 1, 2, 3, 4, 5].map((n) =>
        asItem(syntheticItem([{ id: `x${n}`, sha: SHA_A }], 900 + n)),
      ),
      asItem(last),
    ];
    expect(v4Code(() => assembleDeltaItemsAllOrNothingV4(items))).toBe(
      'R34_PAGE_FETCH_RELATION_MISMATCH',
    );
    expect(calls.assemble).toBe(before);
  });

  it('refuses an item that carries no evidence arrays', () => {
    expect(v4Code(() => slotInputFromDeltaEvidenceV4({ authority: {} }))).toBe(
      'R34_DELTA_EVIDENCE_SHAPE_INVALID',
    );
    expect(v4Code(() => slotInputFromDeltaEvidenceV4(undefined))).toBe(
      'R34_DELTA_EVIDENCE_SHAPE_INVALID',
    );
  });
});

// ---------------------------------------------------------------------------
// B. THROUGH R21'S REAL PURE ASSEMBLER.
// ---------------------------------------------------------------------------

describe("2D-A3 R34 §9: through R21's real pure assembler, once per slot", () => {
  it('two unique documents -> 2 documents, 2 R10 preparations, 4 candidate observations', () => {
    const before = calls.assemble;
    const unbound = assembleOne(
      syntheticItem([
        { id: 'p1', sha: SHA_A },
        { id: 'p2', sha: SHA_B },
      ]),
    );
    expect(calls.assemble - before).toBe(1);
    expect(unbound.kind).toBe('UNBOUND_A3_DOCUMENT_SOURCE_ASSEMBLY');
    expect(unbound.documents).toHaveLength(2);
    expect(unbound.documents.map((entry) => entry.scorePreparation.documentSha256)).toEqual([
      SHA_A,
      SHA_B,
    ]);
    expect(unbound.candidateObservationCount).toBe(4);
    expect(
      unbound.documents.flatMap((entry) =>
        entry.scorePreparation.sourceRowScores.flatMap((row) => row.trackScores),
      ),
    ).toHaveLength(4);
    expect(unbound.exactDuplicate).toEqual({
      rowCount: 2,
      distinctDocumentCount: 2,
      duplicateGroupCount: 0,
      duplicateRowsRemoved: 0,
      divergentGroupCount: 0,
    });
  });

  it('seven items -> exactly seven R21 calls, in order, one slot each', () => {
    const before = calls.assemble;
    const indices = [900, 901, 902, 903, 904, 905, 906];
    const result = assembleDeltaItemsAllOrNothingV4(
      indices.map((index) => asItem(syntheticItem([{ id: `p${index}`, sha: SHA_A }], index))),
    );
    expect(calls.assemble - before).toBe(7);
    expect(result.map((unbound) => unbound.selectionIndex)).toEqual(indices);
  });

  it('identical bytes in two slots stay two documents: no cross-slot dedupe', () => {
    const result = assembleDeltaItemsAllOrNothingV4([
      asItem(syntheticItem([{ id: 'p1', sha: SHA_A, text: 'same' }], 900)),
      asItem(syntheticItem([{ id: 'q1', sha: SHA_A, text: 'same' }], 901)),
    ]);
    expect(result.map((unbound) => unbound.documents.length)).toEqual([1, 1]);
    expect(result.map((unbound) => unbound.exactDuplicate.duplicateGroupCount)).toEqual([0, 0]);
    expect(
      result.reduce((sum, unbound) => sum + unbound.exactDuplicate.distinctDocumentCount, 0),
    ).toBe(2);
  });

  it('§11: an R21 refusal on the seventh item returns nothing for the first six', () => {
    let result: unknown = 'untouched';
    const before = calls.assemble;
    const items = [
      ...[0, 1, 2, 3, 4, 5].map((n) =>
        asItem(syntheticItem([{ id: `x${n}`, sha: SHA_A }], 900 + n)),
      ),
      asItem(syntheticItem([{ id: 'z1', sha: SHA_A, version: V1 }], 906)),
    ];
    expect(
      r21Code(() => {
        result = assembleDeltaItemsAllOrNothingV4(items);
      }),
    ).toBe('R21_UNSUPPORTED_EXTRACTION_RULE_VERSION');
    expect(result).toBe('untouched');
    expect(calls.assemble - before).toBe(7);
  });

  it('keeps the text off every returned object; it resolves only through the R21 lookup', () => {
    const text = '  Exact  Zqx text kept — as persisted  ';
    const unbound = assembleOne(syntheticItem([{ id: 'p1', sha: SHA_A, text }]));
    expect(documentTextLookupForUnboundSlotAssembly(unbound)(SHA_A)).toBe(text);
    const visible = JSON.stringify(unbound, (_key, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value,
    );
    expect(visible).not.toContain('Zqx');
  });
});

describe('2D-A3 R34 §10: exact duplicates collapse through R21, every source row kept', () => {
  it('two rows sharing one digest -> one document, both ids, one R10 prep, no representative', () => {
    const unbound = assembleOne(
      syntheticItem([
        { id: 'p1', sha: SHA_A, text: 'same' },
        { id: 'p2', sha: SHA_A, text: 'same' },
      ]),
    );
    expect(unbound.documents).toHaveLength(1);
    const entry = unbound.documents[0]!;
    expect(entry.document.sourcePageEvidenceIds).toEqual(['p1', 'p2']);
    expect(entry.sourceRowCount).toBe(2);
    expect(entry.scorePreparation.sourceRowScores.map((row) => row.pageEvidenceId)).toEqual([
      'p1',
      'p2',
    ]);
    expect(Object.keys(entry).sort()).toEqual([
      'document',
      'extractionRuleVersion',
      'scorePreparation',
      'sourceRowCount',
    ]);
    expect(unbound.exactDuplicate.duplicateGroupCount).toBe(1);
    expect(unbound.exactDuplicate.duplicateRowsRemoved).toBe(1);
    expect(unbound.candidateObservationCount).toBe(4);
  });
});

describe("2D-A3 R34 §10: R21's own refusals propagate fail-closed, unchanged", () => {
  it('same digest, same v2, different text -> R21 text-divergence refusal', () => {
    expect(
      r21Code(() =>
        assembleOne(
          syntheticItem([
            { id: 'p1', sha: SHA_A, text: 'one' },
            { id: 'p2', sha: SHA_A, text: 'two' },
          ]),
        ),
      ),
    ).toBe('R21_EXACT_DOCUMENT_TEXT_DIVERGENCE');
  });

  it('a v1-only document -> R21 unsupported-extraction refusal', () => {
    expect(r21Code(() => assembleOne(syntheticItem([{ id: 'p1', sha: SHA_A, version: V1 }])))).toBe(
      'R21_UNSUPPORTED_EXTRACTION_RULE_VERSION',
    );
  });

  it('one digest under v1 and v2 -> R21 multi-version refusal, no latest-wins', () => {
    for (const [first, second] of [
      [V1, V2],
      [V2, V1],
    ] as const) {
      expect(
        r21Code(() =>
          assembleOne(
            syntheticItem([
              { id: 'p1', sha: SHA_A, text: 'same', version: first },
              { id: 'p2', sha: SHA_A, text: 'same', version: second },
            ]),
          ),
        ),
      ).toBe('R21_MULTI_EXTRACTION_VERSION_DOCUMENT_REQUIRES_EXPLICIT_POLICY');
    }
  });

  it('a candidate whose digest disagrees with its page -> R21 candidate-document refusal', () => {
    const item = syntheticItem([{ id: 'p1', sha: SHA_A }]);
    (item.evidence.candidates[0] as { responseSha256: string }).responseSha256 = SHA_B;
    expect(r21Code(() => assembleOne(item))).toBe('R21_CANDIDATE_DOCUMENT_SHA_MISMATCH');
  });
});

describe("2D-A3 R34 §12: R21's assembly must agree with R33's per-run counts", () => {
  for (const field of [
    'pageEvidenceSourceRowCount',
    'distinctResponseSha256Count',
    'candidateRowCount',
  ] as const) {
    it(`stops when R33's ${field} disagrees`, () => {
      const item = syntheticItem([
        { id: 'p1', sha: SHA_A },
        { id: 'p2', sha: SHA_B },
      ]);
      const integrity = item.evidence.integrity as Record<string, number>;
      integrity[field] = (integrity[field] ?? 0) + 1;
      expect(v4Code(() => assembleOne(item))).toBe(
        'STOP_R34_DOCUMENT_ASSEMBLY_DISAGREES_WITH_R33_DURABLE_EVIDENCE',
      );
    });
  }
});

// ---------------------------------------------------------------------------
// C. MINTING AUTHORITY.
// ---------------------------------------------------------------------------

describe('2D-A3 R34 §7: nothing but an actual R33 mint can mint', () => {
  const item = syntheticItem([{ id: 'p1', sha: SHA_A }]);
  const fabricatedBatch = {
    kind: 'A3_DEV_TRAIN_DURABLE_EVIDENCE_DELTA_BATCH_V4',
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
    split: 'DEV_TRAIN',
    governanceSnapshotV4: {},
    continuityBaseV3: {},
    items: [item],
    coverage: {
      kind: 'A3_DEV_TRAIN_CANONICAL_EVIDENCE_COVERAGE_EXPANSION_V4',
      historicalCanonicalCoverageCount: 6,
      v3DevTrainReadyCount: 6,
      v4DevTrainReadyCount: 7,
      unchangedCanonicalCoverageCount: 6,
      newlyBoundDeltaCount: 1,
      changedExistingCount: 0,
      removedCount: 0,
      coverageAfterExpansionCount: 7,
      legacyAuthorityEvidenceRequests: 0,
      deltaAuthorityEvidenceRequests: 1,
    },
  };
  const r26Batch = {
    kind: 'A3_DEV_TRAIN_DURABLE_EVIDENCE_DELTA_BATCH_V2',
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
    split: 'DEV_TRAIN',
    governanceSnapshotV2: {},
    continuityBaseV1: {},
    items: [{ ...item, kind: 'A3_DURABLE_ACQUISITION_EVIDENCE_DELTA_V2' }],
    coverage: fabricatedBatch.coverage,
  };
  const r20Evidence = {
    kind: 'A3_DURABLE_ACQUISITION_EVIDENCE',
    split: 'DEV_TRAIN',
    authority: { selectionIndex: 0, split: 'DEV_TRAIN' },
    governanceSnapshot: {},
    evidence: item.evidence,
  };
  const r20Batch = {
    kind: 'A3_DEV_TRAIN_DURABLE_EVIDENCE_BATCH_V1',
    split: 'DEV_TRAIN',
    governanceSnapshot: {},
    items: [r20Evidence],
  };
  const r27Batch = {
    kind: 'A3_DEV_TRAIN_DOCUMENT_SOURCE_DELTA_BATCH_V2',
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
    split: 'DEV_TRAIN',
    governanceSnapshotV2: {},
    evidenceDeltaBatch: r26Batch,
    items: [],
  };
  const r21Batch = {
    kind: 'A3_DEV_TRAIN_DOCUMENT_SOURCE_BATCH_V1',
    split: 'DEV_TRAIN',
    governanceSnapshot: {},
    items: [],
  };

  const cases: Record<string, unknown> = {
    'a plain literal delta evidence item': item,
    'a spread clone of the item': { ...item },
    'a structuredClone of the item': structuredClone(item),
    'a JSON round-trip of the item': JSON.parse(JSON.stringify(item)),
    'a literal delta batch': fabricatedBatch,
    'a spread clone of the literal batch': { ...fabricatedBatch },
    'a structuredClone of the literal batch': structuredClone(fabricatedBatch),
    'a JSON round-trip of the literal batch': JSON.parse(JSON.stringify(fabricatedBatch)),
    'an R26 V2 evidence delta batch': r26Batch,
    'R20 V1 evidence': r20Evidence,
    'an R20 V1 batch': r20Batch,
    'an R27 document-source delta batch': r27Batch,
    'an R21 document-source batch': r21Batch,
    'the committed R33 census': readJson(R33_CENSUS),
    undefined: undefined,
  };
  for (const [name, value] of Object.entries(cases)) {
    it(`refuses ${name}, before any assembly`, () => {
      const before = calls.assemble;
      expect(v4Code(() => bindDevTrainDocumentSourceDeltaBatchV4(value, undefined))).toBe(
        'R34_EVIDENCE_DELTA_NOT_MINTED_BY_R33',
      );
      expect(calls.assemble).toBe(before);
    });
  }

  it('resolves no provenance for anything it did not mint', () => {
    expect(isA3DevTrainSlotDocumentSourceAssemblyDeltaV4(item)).toBe(false);
    expect(isA3DevTrainDocumentSourceDeltaBatchV4(fabricatedBatch)).toBe(false);
    expect(evidenceDeltaForDeltaSlotAssemblyV4(item)).toBeUndefined();
    expect(deltaSlotAssemblyForEvidenceDeltaV4(item)).toBeUndefined();
    expect(evidenceDeltaBatchForDocumentSourceDeltaBatchV4(fabricatedBatch)).toBeUndefined();
    expect(documentSourceDeltaBatchForEvidenceDeltaBatchV4(fabricatedBatch)).toBeUndefined();
    expect(r33ReproductionProofForBatch(fabricatedBatch)).toBeUndefined();
  });

  it('proves no fresh R33 reproduction for an unminted batch', () => {
    expect(
      v4Code(() =>
        requireFreshR33Reproduction(
          fabricatedBatch as never,
          {} as never,
          {} as never,
          {} as never,
          { r32Tip: '', r32ScopePinCommit: '', implementationCommit: '' },
          readJson(R33_CENSUS),
        ),
      ),
    ).toBe('R34_EVIDENCE_DELTA_NOT_MINTED_BY_R33');
  });

  it('derives no coverage expansion or census from an unminted batch', () => {
    const baseline = requireHistoricalDocumentSourceBaseline(
      readJson(R21_CENSUS),
      readJson(R27_CENSUS),
    );
    expect(
      v4Code(() =>
        deriveCanonicalDocumentSourceCoverageExpansionV4(fabricatedBatch as never, baseline),
      ),
    ).toBe('R34_NOT_A_MINTED_DELTA_DOCUMENT_SOURCE_BATCH');
    expect(
      v4Code(() =>
        deriveR34PublicIncrementalDocumentSourceCensus(fabricatedBatch as never, baseline, {
          r33Tip: '',
          r33ScopePinCommit: '',
          implementationCommit: '',
        }),
      ),
    ).toBe('R34_NOT_A_MINTED_DELTA_DOCUMENT_SOURCE_BATCH');
  });

  it('never calls R21 V1 minting, R27 V2 minting or any database entry point', () => {
    expect(calls.r21Mint).toBe(0);
    expect(calls.r27Mint).toBe(0);
    expect(calls.snapshot).toBe(0);
    expect(calls.unboundLoad).toBe(0);
  });
});

describe('2D-A3 R34 §15: the private text accessor refuses anything but an R34 slot', () => {
  const unbound = assembleOne(syntheticItem([{ id: 'p1', sha: SHA_A }]));
  const cases: Record<string, unknown> = {
    'an unbound R21 assembly': unbound,
    'a relabelled clone of it': {
      ...unbound,
      kind: 'A3_DEV_TRAIN_SLOT_DOCUMENT_SOURCE_ASSEMBLY_DELTA_V4',
      authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
    },
    'an R27 slot shape': {
      ...unbound,
      kind: 'A3_DEV_TRAIN_SLOT_DOCUMENT_SOURCE_ASSEMBLY_DELTA_V2',
    },
    'an R21 V1 slot shape': { ...unbound, kind: 'A3_DEV_TRAIN_SLOT_DOCUMENT_SOURCE_ASSEMBLY_V1' },
    'an empty object': {},
    null: null,
  };
  for (const [name, value] of Object.entries(cases)) {
    it(`refuses ${name}`, () => {
      expect(v4Code(() => documentTextLookupForDeltaSlotAssemblyV4(value))).toBe(
        'R34_NOT_A_MINTED_DELTA_SLOT_DOCUMENT_SOURCE_ASSEMBLY',
      );
    });
  }
});

// ---------------------------------------------------------------------------
// D. THE FRESH R33 REPRODUCTION COMPARISON.
// ---------------------------------------------------------------------------

describe('2D-A3 R34 §5: the fresh R33 census must equal the committed one', () => {
  const committed = readJson(R33_CENSUS) as R33PublicIncrementalEvidenceCensus;

  it('the committed census states the pinned R33 checkpoint', () => {
    expect(r33ReproductionDriftPaths(committed, committed)).toEqual([]);
    const flat = (path: string): unknown => {
      let cursor: unknown = committed;
      let rest = path;
      while (rest.length > 0) {
        const object = cursor as Record<string, unknown>;
        if (Object.prototype.hasOwnProperty.call(object, rest)) return object[rest];
        const dot = rest.indexOf('.');
        cursor = object[rest.slice(0, dot)];
        rest = rest.slice(dot + 1);
      }
      return cursor;
    };
    for (const [path, expected] of Object.entries(R34_EXPECTED_R33_CHECKPOINT)) {
      expect(flat(path), path).toBe(expected);
    }
  });

  it('only the execution-provenance commit may differ', () => {
    const moved = { ...committed, implementationCommit: 'f'.repeat(40) };
    expect(r33ReproductionDriftPaths(moved as never, committed)).toEqual([]);
  });

  it('reports any other difference by path, never by value', () => {
    const copy = JSON.parse(JSON.stringify(committed)) as Record<string, Record<string, unknown>>;
    copy['deltaEvidence']!['pageEvidenceSourceRows'] = 199;
    copy['versionBreakdown']!['acquisitionPolicyVersionCounts'] = {
      'orgunit-fetch-policy-v6': 7,
    };
    copy['r32Tip'] = 'e'.repeat(40) as never;
    const paths = r33ReproductionDriftPaths(copy as never, committed);
    expect(paths).toEqual([
      'deltaEvidence.pageEvidenceSourceRows',
      'r32Tip',
      'versionBreakdown.acquisitionPolicyVersionCounts.orgunit-fetch-policy-v6',
      'versionBreakdown.acquisitionPolicyVersionCounts.orgunit-fetch-policy-v7',
    ]);
    expect(paths.join(' ')).not.toMatch(/199|eeee/);
  });
});

// ---------------------------------------------------------------------------
// E. THE COMMITTED R21 + R27 HISTORICAL BASELINE.
// ---------------------------------------------------------------------------

describe('2D-A3 R34 §6: the committed R21 + R27 history closes to six slots', () => {
  it('5 + 1 = 6 slots / 195 rows / 191 documents, read as aggregates only', () => {
    const baseline = requireHistoricalDocumentSourceBaseline(
      readJson(R21_CENSUS),
      readJson(R27_CENSUS),
    );
    expect({ ...baseline }).toEqual({
      r21SlotCount: 5,
      r27NewSlotCount: 1,
      slotCount: 6,
      sourceRows: 195,
      slotLocalDocuments: 191,
      exactDuplicateGroups: 3,
      exactDuplicateRowsRemoved: 4,
      multiSourceDocuments: 3,
      candidateObservations: 390,
      r10Preparations: 191,
      r10SourceRows: 195,
      r10CandidateObservations: 390,
    });
    expect(requireHistoricalBaselineProof(baseline)).toBe(baseline);
    expect(calls.assemble).toBeGreaterThan(0);
    expect(calls.r21Mint).toBe(0);
    expect(calls.r27Mint).toBe(0);
  });

  it('with the expected 7-slot delta, coverage arithmetic reaches the R34 checkpoint', () => {
    const baseline = requireHistoricalDocumentSourceBaseline(
      readJson(R21_CENSUS),
      readJson(R27_CENSUS),
    );
    // Checkpoint arithmetic only: the real delta is DERIVED from the minted
    // batch by the census; nothing here is fed to the assembler.
    expect(baseline.slotCount + 7).toBe(13);
    expect(baseline.sourceRows + 198).toBe(393);
    expect(baseline.slotLocalDocuments + 197).toBe(388);
    expect(baseline.r10CandidateObservations + 396).toBe(786);
  });

  it('a baseline copy is not a proved baseline', () => {
    const baseline = requireHistoricalDocumentSourceBaseline(
      readJson(R21_CENSUS),
      readJson(R27_CENSUS),
    );
    expect(v4Code(() => requireHistoricalBaselineProof({ ...baseline }))).toBe(
      'R34_HISTORICAL_BASELINE_NOT_PROVED',
    );
    expect(v4Code(() => requireHistoricalBaselineProof(undefined))).toBe(
      'R34_HISTORICAL_BASELINE_NOT_PROVED',
    );
  });

  it('a drifted R21 record, R27 record or broken arithmetic STOPS', () => {
    const r21 = readJson(R21_CENSUS) as Record<string, Record<string, unknown>>;
    const r27 = readJson(R27_CENSUS) as Record<string, Record<string, unknown>>;
    const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

    const r21Moved = clone(r21);
    r21Moved['assembly']!['mintedSlotAssemblyCount'] = 6;
    const r27Moved = clone(r27);
    r27Moved['coverage']!['coverageSlots'] = 7;
    const r27Broken = clone(r27);
    r27Broken['deltaAssembly']!['deltaSourceRows'] = 36;
    const r27Seven = clone(r27);
    r27Seven['deltaAssembly']!['deltaSlotAssemblyCount'] = 2;

    for (const [a, b] of [
      [r21Moved, r27],
      [r21, r27Moved],
      [r21, r27Broken],
      [r21, r27Seven],
      [undefined, r27],
      [r21, undefined],
    ] as const) {
      expect(v4Code(() => requireHistoricalDocumentSourceBaseline(a, b))).toBe(
        'STOP_R34_HISTORICAL_R21_R27_BASELINE_DRIFT_REQUIRES_REVIEW',
      );
    }
  });
});
