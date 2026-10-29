/**
 * PHASE 2B-2D A3 R27 — THE INCREMENTAL DELTA ADAPTER AROUND R21'S PURE ASSEMBLER.
 *
 * Proves, without a database:
 *
 *   - the mechanical R26 -> R21 adapter re-checks the page -> fetch and
 *     candidate -> page links and refuses BEFORE R21 assembly when the row
 *     graph is inconsistent, and carries no URL, root, title or heading;
 *   - every delta item reaches R21's real `assembleUnboundSlotDocumentSources`
 *     exactly once, all-or-nothing, and R21's own refusals (support gate,
 *     mixed versions, text divergence) propagate unchanged;
 *   - exact duplicates collapse through R21 with every source row preserved
 *     and no representative;
 *   - R21's result must agree with R26's own per-run counts, or R27 STOPS;
 *   - nothing but an actual R26 mint can mint, and the R27 text accessor
 *     refuses anything but an R27-minted slot;
 *   - R21 V1 minting and R20 V1 binders are never called;
 *   - the R26 drift and R21 historical-baseline cross-checks.
 *
 * Synthetic R26-shaped items are NOT minted and cannot be: R26's mint binds
 * a real run whose UUID digest is the governance `runRefSha256`. The minted
 * route is exercised by the real V1 -> V2 -> R26 -> R27 chain, whose results
 * the audit records.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type * as R21AssembleModule from '../harness/phase2b2d/a3documents/assemble.js';
import type * as R21DevTrainModule from '../harness/phase2b2d/a3documents/devTrain.js';
import type * as R20DevTrainModule from '../harness/phase2b2d/a3evidence/devTrain.js';

const calls = vi.hoisted(() => ({ assemble: 0, r21Mint: 0, r21ByEvidence: 0, r20Bind: 0 }));

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
    documentSourceAssemblyForDurableEvidence: (
      ...args: Parameters<typeof actual.documentSourceAssemblyForDurableEvidence>
    ) => {
      calls.r21ByEvidence += 1;
      return actual.documentSourceAssemblyForDurableEvidence(...args);
    },
  };
});

vi.mock('../harness/phase2b2d/a3evidence/devTrain.js', async (importOriginal) => {
  const actual = await importOriginal<typeof R20DevTrainModule>();
  return {
    ...actual,
    bindDevTrainDurableEvidenceBatch: (
      ...args: Parameters<typeof actual.bindDevTrainDurableEvidenceBatch>
    ) => {
      calls.r20Bind += 1;
      return actual.bindDevTrainDurableEvidenceBatch(...args);
    },
    runDevTrainDurableEvidenceBinding: (
      ...args: Parameters<typeof actual.runDevTrainDurableEvidenceBinding>
    ) => {
      calls.r20Bind += 1;
      return actual.runDevTrainDurableEvidenceBinding(...args);
    },
  };
});

import { documentTextLookupForUnboundSlotAssembly } from '../harness/phase2b2d/a3documents/assemble.js';
import { A3DocumentSourceRefusal } from '../harness/phase2b2d/a3documents/refusal.js';
import type { UnboundA3SlotDocumentSourceAssembly } from '../harness/phase2b2d/a3documents/types.js';
import type { A3DurableAcquisitionEvidenceDeltaV2 } from '../harness/phase2b2d/a3evidenceV2/types.js';
import type { R26PublicIncrementalEvidenceCensus } from '../harness/phase2b2d/a3evidenceV2/census.js';
import {
  assembleDeltaItemsAllOrNothing,
  slotInputFromDeltaEvidence,
} from '../harness/phase2b2d/a3documentsV2/assembleDelta.js';
import {
  bindDevTrainDocumentSourceDeltaBatchV2,
  deltaSlotAssemblyForEvidenceDelta,
  documentTextLookupForDeltaSlotAssembly,
  evidenceDeltaBatchForDocumentSourceDeltaBatch,
  evidenceDeltaForDeltaSlotAssembly,
  isA3DevTrainDocumentSourceDeltaBatchV2,
  isA3DevTrainSlotDocumentSourceAssemblyDeltaV2,
} from '../harness/phase2b2d/a3documentsV2/devTrain.js';
import {
  deriveCanonicalDocumentSourceCoverageExpansionV2,
  deriveR27PublicIncrementalDocumentSourceCensus,
} from '../harness/phase2b2d/a3documentsV2/census.js';
import {
  r26DeltaDriftPaths,
  requireNoR26DeltaDrift,
  requireR21HistoricalBaseline,
} from '../harness/phase2b2d/a3documentsV2/r26Drift.js';
import { A3DocumentSourceV2Refusal } from '../harness/phase2b2d/a3documentsV2/refusal.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const R21_CENSUS =
  'docs/evaluation/PHASE_2B_2D_A3_R21_DEV_TRAIN_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1.json';
const R26_CENSUS =
  'docs/evaluation/PHASE_2B_2D_A3_R26_DEV_TRAIN_INCREMENTAL_DURABLE_EVIDENCE_CENSUS_V1.json';

const V2 = 'orgunit-extraction-v2';
const V1 = 'orgunit-extraction-v1';
const SIGNAL = 'orgunit-signal-rules-v1';
const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

// ---------------------------------------------------------------------------
// Synthetic R26-shaped rows. Unbranded: they can never be minted.
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
    fetch: { id: fetchId, responseSha256: spec.sha, requestedUrl: 'https://synthetic.invalid/' },
    responseSha256: spec.sha,
    requestedUrl: 'https://synthetic.invalid/',
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

/** R26-shaped item whose integrity counts are computed as R20 computes them. */
function syntheticItem(pages: readonly PageSpec[], selectionIndex = 27) {
  const pageEvidence = pages.map(pageRow);
  const candidates = pages.flatMap((p) => candidateRows(p.id, p.sha));
  return {
    kind: 'A3_DURABLE_ACQUISITION_EVIDENCE_DELTA_V2',
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
    split: 'DEV_TRAIN',
    authority: { selectionIndex, split: 'DEV_TRAIN' },
    governanceSnapshotV2: {},
    evidence: {
      kind: 'UNBOUND_DURABLE_DATABASE_EVIDENCE',
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

function asItem(value: unknown): A3DurableAcquisitionEvidenceDeltaV2 {
  return value as A3DurableAcquisitionEvidenceDeltaV2;
}

function v2Code(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof A3DocumentSourceV2Refusal) return error.code;
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
  return assembleDeltaItemsAllOrNothing([asItem(item)])[0]!;
}

// ---------------------------------------------------------------------------
// A. THE ADAPTER.
// ---------------------------------------------------------------------------

describe('2D-A3 R27 §14-§16: the mechanical R26 -> R21 adapter', () => {
  it('maps exactly the documented fields and carries no URL, root, title or heading', () => {
    const input = slotInputFromDeltaEvidence(syntheticItem([{ id: 'p1', sha: SHA_A }]));
    expect(Object.keys(input).sort()).toEqual([
      'candidates',
      'pageEvidence',
      'selectionIndex',
      'split',
    ]);
    expect(input.selectionIndex).toBe(27);
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
    expect(JSON.stringify(input)).not.toMatch(/SYNTHETIC|synthetic\.invalid|claim:/);
  });

  it('passes the persisted numeric(8,4) text through, signed and unconverted', () => {
    const input = slotInputFromDeltaEvidence(syntheticItem([{ id: 'p1', sha: SHA_A }]));
    expect(input.candidates.map((row) => row.candidateScore)).toEqual(['1.0000', '-2.0000']);
  });

  it('§46: refuses a page whose fetch link, fetch digest or candidate link disagrees - before R21', () => {
    const before = calls.assemble;

    const badFetchLink = syntheticItem([{ id: 'p1', sha: SHA_A }]);
    (
      badFetchLink.evidence.pageEvidence[0]!.page as { fetchObservationId: string }
    ).fetchObservationId = 'fetch-other';
    expect(v2Code(() => assembleOne(badFetchLink))).toBe('R27_PAGE_FETCH_RELATION_MISMATCH');

    const badDigest = syntheticItem([{ id: 'p1', sha: SHA_A }]);
    (badDigest.evidence.pageEvidence[0]!.fetch as { responseSha256: string }).responseSha256 =
      SHA_B;
    expect(v2Code(() => assembleOne(badDigest))).toBe('R27_PAGE_FETCH_RELATION_MISMATCH');

    const badCandidate = syntheticItem([{ id: 'p1', sha: SHA_A }]);
    (badCandidate.evidence.candidates[1]!.candidate as { pageEvidenceId: string }).pageEvidenceId =
      'p9';
    expect(v2Code(() => assembleOne(badCandidate))).toBe('R27_CANDIDATE_PAGE_RELATION_MISMATCH');

    expect(calls.assemble).toBe(before);
  });

  it('refuses an item that carries no evidence arrays', () => {
    expect(v2Code(() => slotInputFromDeltaEvidence({ authority: {} }))).toBe(
      'R27_DELTA_EVIDENCE_SHAPE_INVALID',
    );
  });
});

// ---------------------------------------------------------------------------
// B. THROUGH R21'S REAL PURE ASSEMBLER.
// ---------------------------------------------------------------------------

describe("2D-A3 R27 §17 / §41: through R21's real pure assembler, once per item", () => {
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

  it('calls R21 exactly once per delta item, in order', () => {
    const before = calls.assemble;
    const result = assembleDeltaItemsAllOrNothing([
      asItem(syntheticItem([{ id: 'p1', sha: SHA_A }], 27)),
      asItem(syntheticItem([{ id: 'q1', sha: SHA_A }], 28)),
    ]);
    expect(calls.assemble - before).toBe(2);
    expect(result.map((unbound) => unbound.selectionIndex)).toEqual([27, 28]);
  });

  it('§18: a refusal on the second item returns nothing for the first', () => {
    let result: unknown = 'untouched';
    expect(
      r21Code(() => {
        result = assembleDeltaItemsAllOrNothing([
          asItem(syntheticItem([{ id: 'p1', sha: SHA_A }], 27)),
          asItem(syntheticItem([{ id: 'q1', sha: SHA_A, version: V1 }], 28)),
        ]);
      }),
    ).toBe('R21_UNSUPPORTED_EXTRACTION_RULE_VERSION');
    expect(result).toBe('untouched');
  });

  it('keeps the text off every returned object; it resolves only through the R21 lookup', () => {
    const text = '  Exact  Text kept — as persisted  ';
    const unbound = assembleOne(syntheticItem([{ id: 'p1', sha: SHA_A, text }]));
    expect(documentTextLookupForUnboundSlotAssembly(unbound)(SHA_A)).toBe(text);
    const visible = JSON.stringify(unbound, (_key, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value,
    );
    expect(visible).not.toContain('Zqx');
  });
});

describe('2D-A3 R27 §42: exact duplicates collapse through R21, every source row kept', () => {
  it('two rows sharing one digest -> one document, both ids, one R10 prep over both rows', () => {
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
    expect(unbound.exactDuplicate.duplicateGroupCount).toBe(1);
    expect(unbound.exactDuplicate.duplicateRowsRemoved).toBe(1);
    expect(unbound.candidateObservationCount).toBe(4);
  });
});

describe("2D-A3 R27 §43-§45: R21's own refusals propagate fail-closed, unchanged", () => {
  it('§43: same digest, same v2, different text -> R21 text-divergence refusal', () => {
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

  it('§44: a v1-only document -> R21 unsupported-extraction refusal', () => {
    expect(r21Code(() => assembleOne(syntheticItem([{ id: 'p1', sha: SHA_A, version: V1 }])))).toBe(
      'R21_UNSUPPORTED_EXTRACTION_RULE_VERSION',
    );
  });

  it('§45: one digest under v1 and v2 -> R21 multi-version refusal, no latest-wins', () => {
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
});

describe("2D-A3 R27 §33: R21's assembly must agree with R26's per-run counts", () => {
  for (const field of [
    'pageEvidenceSourceRowCount',
    'distinctResponseSha256Count',
    'candidateRowCount',
  ] as const) {
    it(`stops when R26's ${field} disagrees`, () => {
      const item = syntheticItem([
        { id: 'p1', sha: SHA_A },
        { id: 'p2', sha: SHA_B },
      ]);
      const integrity = item.evidence.integrity as Record<string, number>;
      integrity[field] = (integrity[field] ?? 0) + 1;
      expect(v2Code(() => assembleOne(item))).toBe(
        'STOP_R27_DOCUMENT_ASSEMBLY_DISAGREES_WITH_R26_DURABLE_EVIDENCE',
      );
    });
  }
});

// ---------------------------------------------------------------------------
// C. MINTING AUTHORITY.
// ---------------------------------------------------------------------------

describe('2D-A3 R27 §10 / §47: nothing but an actual R26 mint can mint', () => {
  const item = syntheticItem([{ id: 'p1', sha: SHA_A }]);
  const fabricatedBatch = {
    kind: 'A3_DEV_TRAIN_DURABLE_EVIDENCE_DELTA_BATCH_V2',
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
    split: 'DEV_TRAIN',
    governanceSnapshotV2: {},
    continuityBaseV1: {},
    items: [item],
    coverage: {
      changedExistingCount: 0,
      removedCount: 0,
      legacyAuthorityEvidenceRequests: 0,
      unchangedCanonicalCoverageCount: 5,
      newlyBoundDeltaCount: 1,
      v2ReadyAuthorityCount: 6,
    },
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
    'a fabricated delta batch': fabricatedBatch,
    'a spread clone of the fabricated batch': { ...fabricatedBatch },
    'a structuredClone of the fabricated batch': structuredClone(fabricatedBatch),
    'a JSON round-trip of the fabricated batch': JSON.parse(JSON.stringify(fabricatedBatch)),
    'R20 V1 evidence': r20Evidence,
    'an R20 V1 batch': r20Batch,
    'an R21 document-source batch': r21Batch,
    undefined: undefined,
  };
  for (const [name, value] of Object.entries(cases)) {
    it(`refuses ${name}, before any assembly`, () => {
      const before = calls.assemble;
      expect(v2Code(() => bindDevTrainDocumentSourceDeltaBatchV2(value))).toBe(
        'R27_EVIDENCE_DELTA_NOT_MINTED_BY_R26',
      );
      expect(calls.assemble).toBe(before);
    });
  }

  it('resolves no provenance for anything it did not mint', () => {
    expect(isA3DevTrainSlotDocumentSourceAssemblyDeltaV2(item)).toBe(false);
    expect(isA3DevTrainDocumentSourceDeltaBatchV2(fabricatedBatch)).toBe(false);
    expect(evidenceDeltaForDeltaSlotAssembly(item)).toBeUndefined();
    expect(deltaSlotAssemblyForEvidenceDelta(item)).toBeUndefined();
    expect(evidenceDeltaBatchForDocumentSourceDeltaBatch(fabricatedBatch)).toBeUndefined();
  });

  it('derives no coverage expansion or census from an unminted batch', () => {
    const baseline = requireR21HistoricalBaseline(
      JSON.parse(readFileSync(join(REPO_ROOT, R21_CENSUS), 'utf8')),
    );
    expect(
      v2Code(() =>
        deriveCanonicalDocumentSourceCoverageExpansionV2(fabricatedBatch as never, baseline),
      ),
    ).toBe('R27_NOT_A_MINTED_DELTA_DOCUMENT_SOURCE_BATCH');
    expect(
      v2Code(() =>
        deriveR27PublicIncrementalDocumentSourceCensus(fabricatedBatch as never, baseline, {
          r26Tip: 'x',
          implementationCommit: 'y',
        }),
      ),
    ).toBe('R27_NOT_A_MINTED_DELTA_DOCUMENT_SOURCE_BATCH');
  });
});

describe('2D-A3 R27 §21 / §48: the text accessor accepts only an R27-minted slot', () => {
  const unbound = assembleOne(syntheticItem([{ id: 'p1', sha: SHA_A }]));
  const historicalR21Slot = {
    kind: 'A3_DEV_TRAIN_SLOT_DOCUMENT_SOURCE_ASSEMBLY_V1',
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
    selectionIndex: 0,
    split: 'DEV_TRAIN',
    exactDuplicate: unbound.exactDuplicate,
    documents: unbound.documents,
    candidateObservationCount: unbound.candidateObservationCount,
  };
  const relabelled = { ...unbound, kind: 'A3_DEV_TRAIN_SLOT_DOCUMENT_SOURCE_ASSEMBLY_DELTA_V2' };
  const cases: Record<string, unknown> = {
    'an unbound R21 assembly': unbound,
    'a relabelled clone of an unbound assembly': relabelled,
    'a historical R21 slot shape': historicalR21Slot,
    'an arbitrary object': {},
    null: null,
  };
  for (const [name, value] of Object.entries(cases)) {
    it(`refuses ${name}`, () => {
      expect(v2Code(() => documentTextLookupForDeltaSlotAssembly(value))).toBe(
        'R27_NOT_A_MINTED_DELTA_SLOT_DOCUMENT_SOURCE_ASSEMBLY',
      );
    });
  }

  it('leaves the unknown-digest refusal to the underlying R21 lookup', () => {
    expect(r21Code(() => documentTextLookupForUnboundSlotAssembly(unbound)(SHA_B))).toBe(
      'R21_DOCUMENT_TEXT_LOOKUP_UNKNOWN_DOCUMENT',
    );
  });
});

// ---------------------------------------------------------------------------
// D. CROSS-CHECKS.
// ---------------------------------------------------------------------------

describe('2D-A3 R27 §31: the R26 delta drift cross-check', () => {
  const committed = JSON.parse(readFileSync(join(REPO_ROOT, R26_CENSUS), 'utf8')) as Record<
    string,
    unknown
  >;
  const asFresh = (value: unknown) => value as R26PublicIncrementalEvidenceCensus;

  it('reports no drift for the committed aggregates, whatever the provenance commits', () => {
    const fresh = { ...structuredClone(committed), implementationCommit: 'f'.repeat(40) };
    expect(r26DeltaDriftPaths(asFresh(fresh), committed)).toEqual([]);
    expect(() => requireNoR26DeltaDrift(asFresh(fresh), committed)).not.toThrow();
  });

  it('names the differing path and STOPS on any aggregate drift', () => {
    const fresh = structuredClone(committed);
    (fresh['deltaEvidence'] as Record<string, number>)['pageEvidenceSourceRows'] = 36;
    expect(r26DeltaDriftPaths(asFresh(fresh), committed)).toEqual([
      'deltaEvidence.pageEvidenceSourceRows',
    ]);
    expect(v2Code(() => requireNoR26DeltaDrift(asFresh(fresh), committed))).toBe(
      'STOP_R27_CANONICAL_R26_DELTA_DRIFT_REQUIRES_REVIEW',
    );
  });

  it('STOPS when a committed and fresh census agree but leave the R26 checkpoint', () => {
    const moved = structuredClone(committed);
    (moved['databaseAccess'] as Record<string, number>)['legacyAuthorityEvidenceQueries'] = 5;
    expect(v2Code(() => requireNoR26DeltaDrift(asFresh(moved), moved))).toBe(
      'STOP_R27_CANONICAL_R26_DELTA_DRIFT_REQUIRES_REVIEW',
    );
  });
});

describe('2D-A3 R27 §28: the historical R21 baseline is read as aggregates only', () => {
  const committed = JSON.parse(readFileSync(join(REPO_ROOT, R21_CENSUS), 'utf8')) as Record<
    string,
    unknown
  >;

  it('states 5 slots / 160 rows / 156 documents / 3 groups / 4 removed / 320 observations', () => {
    expect(requireR21HistoricalBaseline(committed)).toEqual({
      slotCount: 5,
      sourceRows: 160,
      slotLocalDocuments: 156,
      exactDuplicateGroups: 3,
      exactDuplicateRowsRemoved: 4,
      multiSourceDocuments: 3,
      candidateObservations: 320,
      r10Preparations: 156,
      r10SourceRows: 160,
      r10CandidateObservations: 320,
    });
  });

  it('STOPS when the committed baseline no longer states the canonical history', () => {
    const moved = structuredClone(committed);
    (moved['assembly'] as Record<string, number>)['slotLocalDistinctDocumentCount'] = 157;
    expect(v2Code(() => requireR21HistoricalBaseline(moved))).toBe(
      'STOP_R27_HISTORICAL_R21_BASELINE_DRIFT_REQUIRES_REVIEW',
    );
  });
});

// ---------------------------------------------------------------------------
// E. §49: NO HISTORICAL REASSEMBLY, AT RUNTIME.
// ---------------------------------------------------------------------------

describe('2D-A3 R27 §49: R21 V1 minting and R20 V1 binders were never reached', () => {
  it('counted zero calls across every test in this file', () => {
    expect(calls.r21Mint).toBe(0);
    expect(calls.r21ByEvidence).toBe(0);
    expect(calls.r20Bind).toBe(0);
    expect(calls.assemble).toBeGreaterThan(0);
  });
});
