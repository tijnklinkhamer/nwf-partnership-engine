/**
 * PHASE 2B-2D A3 R50 — THE R4 DEV_TRAIN A4 HANDOFF, ON INVENTED INPUT.
 *
 * Every case here is synthetic: invented ECHE row keys, invented digests,
 * invented page ids and invented text. Nothing reads the database, a sealed
 * split, a historical label or a model. The genuine path (`materialise.ts`)
 * is exercised by the one bounded real run; here it is proved to REFUSE
 * anything that is not a minted current-process authority.
 *
 *   - the exact R49 rubric and approval binding, and its refusals;
 *   - stable pre-label identity through the UNCHANGED `deriveGoldId`;
 *   - the SET_P ∪ SET_R union (zero / partial / full overlap);
 *   - complete exact-document provenance and its refusals;
 *   - no page representative for a multi-source document;
 *   - structured-metadata blinding (page text is never censored);
 *   - the blank response template and the completed-response shape matrix;
 *   - the package hash;
 *   - all-or-nothing construction and the genuine-authority gates.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as SelectModule from '../../orgunits/classify/evaluation/select.js';

const goldIdSpy = vi.hoisted(() => ({ calls: 0, force: null as string | null }));

vi.mock('../../orgunits/classify/evaluation/select.js', async (importOriginal) => {
  const actual = await importOriginal<typeof SelectModule>();
  return {
    ...actual,
    deriveGoldId: (echeRowKey: string, responseSha256: string): string => {
      goldIdSpy.calls += 1;
      return goldIdSpy.force ?? actual.deriveGoldId(echeRowKey, responseSha256);
    },
  };
});

import { sha256OfCanonical } from '../../orgunits/classify/evaluation/hashes.js';
import { preLabelGoldId } from '../harness/phase2b2d/a4handoffR4/identity.js';
import { buildHandoffFromSlots } from '../harness/phase2b2d/a4handoffR4/items.js';
import {
  buildGenuineR50Handoff,
  collectGenuineHandoffSlots,
  renderR50Artifacts,
  writeR50ArtifactsAtomically,
} from '../harness/phase2b2d/a4handoffR4/materialise.js';
import { displayHeadings } from '../harness/phase2b2d/a4handoffR4/provenance.js';
import { A4HandoffR4Refusal } from '../harness/phase2b2d/a4handoffR4/refusal.js';
import {
  isR50ReproductionProof,
  requireFreshR47ReproductionForR50,
} from '../harness/phase2b2d/a4handoffR4/reproduction.js';
import {
  completedResponseShapeProblems,
  isCompletedResponseShape,
} from '../harness/phase2b2d/a4handoffR4/responseSchema.js';
import {
  forbiddenFragmentsOfKey,
  fromJsonl,
  packageHashInputOf,
  preLabelPackageHash,
  requireBlindReviewRecord,
  structuredKeysOf,
  toJsonl,
} from '../harness/phase2b2d/a4handoffR4/reviewPackage.js';
import {
  bindR49RubricForR50,
  isR49RubricBinding,
  R49_RUBRIC,
  R49_RUBRIC_APPROVAL,
  type R49RubricBinding,
} from '../harness/phase2b2d/a4handoffR4/rubric.js';
import {
  REVIEW_PRESENTATION_KEYS,
  REVIEW_RECORD_KEYS,
  RESPONSE_HUMAN_FIELDS,
  RESPONSE_TEMPLATE_KEYS,
  R50_PACKAGE_SCHEMA,
  type HandoffSlotInput,
  type HandoffSourcePageRow,
  type ReviewPackageRecord,
} from '../harness/phase2b2d/a4handoffR4/types.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const bytesOf = (path: string): Buffer => readFileSync(join(REPO_ROOT, path));

const RUBRIC_BYTES = bytesOf(R49_RUBRIC.path);
const APPROVAL_BYTES = bytesOf(R49_RUBRIC_APPROVAL.path);
const rubric: R49RubricBinding = bindR49RubricForR50({
  rubricBytes: RUBRIC_BYTES,
  approvalBytes: APPROVAL_BYTES,
});

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof A4HandoffR4Refusal) return error.code;
    throw error;
  }
  throw new Error('expected a refusal');
}

async function asyncCodeOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof A4HandoffR4Refusal) return error.code;
    throw error;
  }
  throw new Error('expected a refusal');
}

const editJson = (bytes: Buffer, edit: (value: Record<string, unknown>) => void): Buffer => {
  const value = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
  edit(value);
  return Buffer.from(JSON.stringify(value, null, 2) + '\n');
};

// ---------------------------------------------------------------------------
// Invented fixtures. Digests are 64 repeated hex characters.
// ---------------------------------------------------------------------------

const digest = (c: string): string => c.repeat(64);
const ECHE_A = 'ZZ INVENT01|900000001';
const ECHE_B = 'ZZ INVENT02|900000002';
const ORG_A = '00000000-0000-4000-8000-00000000000a';
const ORG_B = '00000000-0000-4000-8000-00000000000b';

function row(
  id: string,
  responseSha256: string,
  over: Partial<HandoffSourcePageRow> = {},
): HandoffSourcePageRow {
  return {
    pageEvidenceId: id,
    responseSha256,
    requestedUrl: `https://invented.example/${id.replace('p', 'page-')}`,
    title: `Invented title ${id.replace('p', 'page ')}`,
    declaredLang: 'en',
    headings: [
      { level: 1, text: 'Invented heading' },
      { level: 2, text: 'Second' },
    ],
    mainText: `Invented body of ${responseSha256.slice(0, 1)}`,
    mainTextTruncated: false,
    extractionMethod: 'regex-v1',
    extractionRuleVersion: 'orgunit-extraction-v2',
    ...over,
  };
}

interface SlotSpec {
  readonly selectionIndex?: number;
  readonly eche?: string;
  readonly org?: string;
  /** document digest char -> its source page ids */
  readonly docs: Record<string, readonly string[]>;
  readonly p: readonly string[];
  readonly r: readonly string[];
  readonly rows?: readonly HandoffSourcePageRow[];
  readonly over?: Partial<HandoffSlotInput>;
}

function mkSlot(spec: SlotSpec): HandoffSlotInput {
  const selectionIndex = spec.selectionIndex ?? 1;
  const eche = spec.eche ?? ECHE_A;
  const org = spec.org ?? ORG_A;
  const rows =
    spec.rows ??
    Object.entries(spec.docs).flatMap(([c, ids]) => ids.map((id) => row(id, digest(c))));
  const cap = (chars: readonly string[]) =>
    chars.map((c) => ({ selectionIndex, split: 'DEV_TRAIN', documentSha256: digest(c) }));
  return {
    selectionIndex,
    split: 'DEV_TRAIN',
    stratum: 'R40_V5',
    occupantEcheRowKey: eche,
    occupantOrganisationId: org,
    evidenceEcheRowKey: eche,
    evidenceOrganisationId: org,
    evidenceSelectionIndex: selectionIndex,
    documents: Object.entries(spec.docs).map(([c, ids]) => ({
      selectionIndex,
      split: 'DEV_TRAIN',
      documentSha256: digest(c),
      sourcePageEvidenceIds: ids,
    })),
    setPCap: cap(spec.p),
    setRCap: cap(spec.r),
    sourceRows: rows,
    ...spec.over,
  };
}

beforeEach(() => {
  goldIdSpy.calls = 0;
  goldIdSpy.force = null;
});

// ---------------------------------------------------------------------------
// A. THE EXACT R49 RUBRIC AND APPROVAL.
// ---------------------------------------------------------------------------

describe('2D-A3 R50: the exact R49 rubric and its separate owner approval', () => {
  it('binds the committed rubric (e3af57d8..., 22125 B) and approval', () => {
    expect(isR49RubricBinding(rubric)).toBe(true);
    expect(rubric.rubricSha256).toBe(
      'e3af57d8d2503e4fc87ce707427762aabfed420bb670a262b9302a7ea78e1d69',
    );
    expect(rubric.rubricBytes).toBe(22125);
    expect(rubric.rubricVersion).toBe('METHODOLOGY_V2_HUMAN_LABELLING_RUBRIC_V1');
    expect(rubric.rubricStatus).toBe('FROZEN_BY_OWNER');
    expect(rubric.approvalSha256).toBe(
      '17f2683d378b32000467eb670374f56bfa3c8b7b3dfa0acb8a12ee60d0468ac4',
    );
    expect(rubric.approvalBytes).toBe(APPROVAL_BYTES.length);
    expect(rubric.consumedOwnerMarker).toBe(
      'AUTHORISE_A3_R50_RESUME_R4_DEV_TRAIN_A4_HANDOFF_MATERIALISATION',
    );
  });

  it('refuses one mutated rubric byte', () => {
    const mutated = Buffer.from(RUBRIC_BYTES);
    mutated[100] = mutated[100]! ^ 1;
    expect(
      codeOf(() => bindR49RubricForR50({ rubricBytes: mutated, approvalBytes: APPROVAL_BYTES })),
    ).toBe('R50_RUBRIC_BYTES_MISMATCH');
  });

  it('refuses a different file offered as the rubric (wrong SHA)', () => {
    expect(
      codeOf(() =>
        bindR49RubricForR50({ rubricBytes: APPROVAL_BYTES, approvalBytes: APPROVAL_BYTES }),
      ),
    ).toBe('R50_RUBRIC_BYTES_MISMATCH');
  });

  it('refuses a foreign approval record', () => {
    const foreign = bytesOf(
      'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_R4_SHORT_TEXT_AMENDMENT_OWNER_APPROVAL_V1.json',
    );
    expect(
      codeOf(() => bindR49RubricForR50({ rubricBytes: RUBRIC_BYTES, approvalBytes: foreign })),
    ).toBe('R50_RUBRIC_APPROVAL_CONTENT_MISMATCH');
  });

  it('refuses an approval whose R50 resumption is not authorised', () => {
    const edited = editJson(APPROVAL_BYTES, (v) => {
      (v['authorityFlags'] as Record<string, unknown>)['r50HandoffResumeAuthorised'] = false;
    });
    expect(
      codeOf(() => bindR49RubricForR50({ rubricBytes: RUBRIC_BYTES, approvalBytes: edited })),
    ).toBe('R50_RUBRIC_APPROVAL_CONTENT_MISMATCH');
  });

  it.each([
    'humanLabelsAuthorised',
    'modelLabelsAuthorised',
    'devConfirmAccessAuthorised',
    'finalHoldoutAccessAuthorised',
    'a5FreezeAuthorised',
  ])('refuses an approval that also authorises %s', (flag) => {
    const edited = editJson(APPROVAL_BYTES, (v) => {
      (v['authorityFlags'] as Record<string, unknown>)[flag] = true;
    });
    expect(
      codeOf(() => bindR49RubricForR50({ rubricBytes: RUBRIC_BYTES, approvalBytes: edited })),
    ).toBe('R50_RUBRIC_APPROVAL_CONTENT_MISMATCH');
  });

  it('refuses a reformatted approval whose semantics are right but whose bytes are not', () => {
    const reformatted = editJson(APPROVAL_BYTES, () => undefined);
    expect(reformatted.equals(APPROVAL_BYTES)).toBe(false);
    expect(
      codeOf(() => bindR49RubricForR50({ rubricBytes: RUBRIC_BYTES, approvalBytes: reformatted })),
    ).toBe('R50_RUBRIC_APPROVAL_BYTES_MISMATCH');
  });

  it('refuses a missing approval', () => {
    expect(
      codeOf(() => bindR49RubricForR50({ rubricBytes: RUBRIC_BYTES, approvalBytes: undefined })),
    ).toBe('R50_RUBRIC_APPROVAL_BYTES_MISMATCH');
  });

  it('a spread copy of a binding is not a binding, so the builder refuses it', () => {
    const copy = { ...rubric };
    expect(isR49RubricBinding(copy)).toBe(false);
    expect(
      codeOf(() => buildHandoffFromSlots([mkSlot({ docs: { a: ['p1'] }, p: ['a'], r: [] })], copy)),
    ).toBe('R50_RUBRIC_NOT_BOUND');
  });
});

// ---------------------------------------------------------------------------
// B. STABLE PRE-LABEL IDENTITY.
// ---------------------------------------------------------------------------

describe('2D-A3 R50: goldId through the unchanged deriveGoldId', () => {
  it('same echeRowKey + same digest -> same id; any change -> different id', () => {
    const same1 = preLabelGoldId(ECHE_A, digest('a'));
    const same2 = preLabelGoldId(ECHE_A, digest('a'));
    expect(same1).toBe(same2);
    expect(preLabelGoldId(ECHE_B, digest('a'))).not.toBe(same1);
    expect(preLabelGoldId(ECHE_A, digest('b'))).not.toBe(same1);
  });

  it('has the exact ^g[0-9a-f]{16}$ form', () => {
    expect(preLabelGoldId(ECHE_A, digest('c'))).toMatch(/^g[0-9a-f]{16}$/);
  });

  it('really calls the existing primitive, and returns its value', async () => {
    const actual = await vi.importActual<typeof SelectModule>(
      '../../orgunits/classify/evaluation/select.js',
    );
    expect(goldIdSpy.calls).toBe(0);
    const id = preLabelGoldId(ECHE_A, digest('d'));
    expect(goldIdSpy.calls).toBe(1);
    expect(id).toBe(actual.deriveGoldId(ECHE_A, digest('d')));
  });

  it('the builder derives one id per selected cap entry through the primitive', () => {
    buildHandoffFromSlots(
      [mkSlot({ docs: { a: ['p1'], b: ['p2'], c: ['p3'] }, p: ['a', 'b'], r: ['b', 'c'] })],
      rubric,
    );
    expect(goldIdSpy.calls).toBe(4);
  });

  it('refuses a non-SHA-256 document identity', () => {
    expect(codeOf(() => preLabelGoldId(ECHE_A, 'not-a-digest'))).toBe('R50_HANDOFF_INPUT_INVALID');
    expect(codeOf(() => preLabelGoldId('', digest('a')))).toBe('R50_HANDOFF_INPUT_INVALID');
  });

  it('STOPS on a 64-bit collision between different pairs, never lengthening the id', () => {
    goldIdSpy.force = 'g0123456789abcdef';
    expect(
      codeOf(() =>
        buildHandoffFromSlots(
          [mkSlot({ docs: { a: ['p1'], b: ['p2'] }, p: ['a', 'b'], r: [] })],
          rubric,
        ),
      ),
    ).toBe('STOP_R50_GOLDID_COLLISION');
  });

  it('STOPS when two slots of different organisations collide', () => {
    goldIdSpy.force = 'g0123456789abcdef';
    expect(
      codeOf(() =>
        buildHandoffFromSlots(
          [
            mkSlot({ selectionIndex: 1, docs: { a: ['p1'] }, p: ['a'], r: [] }),
            mkSlot({
              selectionIndex: 2,
              eche: ECHE_B,
              org: ORG_B,
              docs: { b: ['p2'] },
              p: ['b'],
              r: [],
            }),
          ],
          rubric,
        ),
      ),
    ).toBe('STOP_R50_GOLDID_COLLISION');
  });
});

// ---------------------------------------------------------------------------
// C. THE SET_P ∪ SET_R UNION.
// ---------------------------------------------------------------------------

describe('2D-A3 R50: the P ∪ R union', () => {
  const docs = { a: ['p1'], b: ['p2'], c: ['p3'], d: ['p4'], e: ['p5'], f: ['p6'] };

  it.each([
    ['zero overlap', ['a', 'b', 'c'], ['d', 'e'], 5, 0],
    ['partial overlap', ['a', 'b', 'c'], ['c', 'd'], 4, 1],
    ['R fully inside P', ['a', 'b', 'c', 'd'], ['b', 'c'], 4, 2],
  ] as const)('%s', (_name, p, r, union, overlap) => {
    const built = buildHandoffFromSlots([mkSlot({ docs, p, r })], rubric);
    expect(built.counts.setPSelected).toBe(p.length);
    expect(built.counts.setRSelected).toBe(r.length);
    expect(built.counts.unionItems).toBe(union);
    expect(built.counts.overlapItems).toBe(overlap);
    expect(p.length + r.length - overlap).toBe(union);
    expect(built.counts.uniqueGoldIds).toBe(union);
    expect(built.indexItems).toHaveLength(union);
    expect(built.reviewRecords).toHaveLength(union);
    expect(new Set(built.indexItems.map((i) => i.goldId)).size).toBe(union);
    for (const item of built.indexItems) {
      const c = item.documentSha256[0]!;
      expect(item.inSetP).toBe(p.includes(c as never));
      expect(item.inSetR).toBe(r.includes(c as never));
      expect(item.inSetP || item.inSetR).toBe(true);
    }
    for (const record of built.reviewRecords) {
      expect(JSON.stringify(record)).not.toMatch(/inSetP|inSetR|SET_P|SET_R/);
    }
  });

  it('orders items, records and template rows by goldId ascending', () => {
    const built = buildHandoffFromSlots(
      [mkSlot({ docs, p: ['a', 'b', 'c', 'd'], r: ['e', 'f'] })],
      rubric,
    );
    const ids = built.indexItems.map((i) => i.goldId);
    expect(ids).toEqual([...ids].sort());
    expect(built.reviewRecords.map((r) => r.goldId)).toEqual(ids);
    expect(built.templateRecords.map((t) => t.goldId)).toEqual(ids);
  });

  it('enforces exact expected aggregate counts when given', () => {
    const slot = mkSlot({ docs, p: ['a', 'b'], r: ['c'] });
    expect(
      codeOf(() =>
        buildHandoffFromSlots([slot], rubric, { slots: 1, setPSelected: 160, setRSelected: 1 }),
      ),
    ).toBe('R50_SELECTED_COUNT_MISMATCH');
    expect(
      codeOf(() =>
        buildHandoffFromSlots([slot], rubric, { slots: 20, setPSelected: 2, setRSelected: 1 }),
      ),
    ).toBe('R50_SELECTED_COUNT_MISMATCH');
    expect(
      buildHandoffFromSlots([slot], rubric, { slots: 1, setPSelected: 2, setRSelected: 1 }).counts
        .unionItems,
    ).toBe(3);
  });

  it('refuses a cap entry that names another slot (foreign selected document)', () => {
    const slot = mkSlot({ docs, p: ['a'], r: [] });
    const foreign = {
      ...slot,
      setPCap: [{ selectionIndex: 99, split: 'DEV_TRAIN', documentSha256: digest('a') }],
    };
    expect(codeOf(() => buildHandoffFromSlots([foreign], rubric))).toBe(
      'R50_SELECTED_DOCUMENT_FOREIGN',
    );
  });

  it('refuses a selected document missing from the exact replay slot', () => {
    expect(codeOf(() => buildHandoffFromSlots([mkSlot({ docs, p: ['9'], r: [] })], rubric))).toBe(
      'R50_SELECTED_DOCUMENT_NOT_IN_REPLAY_SLOT',
    );
  });

  it('refuses a slot outside DEV_TRAIN', () => {
    const slot = mkSlot({ docs, p: ['a'], r: [], over: { split: 'DEV_CONFIRM' } });
    expect(codeOf(() => buildHandoffFromSlots([slot], rubric))).toBe('R50_SAMPLE_NOT_DEV_TRAIN');
  });

  it('refuses an organisation identity not taken from the current occupant', () => {
    const slot = mkSlot({ docs, p: ['a'], r: [], over: { evidenceEcheRowKey: ECHE_B } });
    expect(codeOf(() => buildHandoffFromSlots([slot], rubric))).toBe('R50_ORGANISATION_MISMATCH');
    const slot2 = mkSlot({ docs, p: ['a'], r: [], over: { evidenceOrganisationId: ORG_B } });
    expect(codeOf(() => buildHandoffFromSlots([slot2], rubric))).toBe('R50_ORGANISATION_MISMATCH');
    const slot3 = mkSlot({ docs, p: ['a'], r: [], over: { evidenceSelectionIndex: 7 } });
    expect(codeOf(() => buildHandoffFromSlots([slot3], rubric))).toBe('R50_ORGANISATION_MISMATCH');
  });

  it('keys goldId on the CURRENT occupant identity, not on page data', () => {
    const a = buildHandoffFromSlots([mkSlot({ docs, p: ['a'], r: [] })], rubric);
    const b = buildHandoffFromSlots(
      [mkSlot({ docs, p: ['a'], r: [], eche: ECHE_B, org: ORG_B })],
      rubric,
    );
    expect(a.indexItems[0]!.goldId).toBe(preLabelGoldId(ECHE_A, digest('a')));
    expect(b.indexItems[0]!.goldId).toBe(preLabelGoldId(ECHE_B, digest('a')));
    expect(a.indexItems[0]!.echeRowKey).toBe(ECHE_A);
  });
});

// ---------------------------------------------------------------------------
// D. EXACT-DOCUMENT PROVENANCE.
// ---------------------------------------------------------------------------

describe('2D-A3 R50: complete exact-document source provenance', () => {
  it('resolves a one-source document', () => {
    const built = buildHandoffFromSlots([mkSlot({ docs: { a: ['p1'] }, p: ['a'], r: [] })], rubric);
    expect(built.reviewRecords[0]!.sourcePresentations).toHaveLength(1);
    expect(built.indexItems[0]!.sourcePageEvidenceIds).toEqual(['p1']);
    expect(built.counts.multiSourceItems).toBe(0);
  });

  it('resolves every source of a multi-source document in frozen order', () => {
    const built = buildHandoffFromSlots(
      [mkSlot({ docs: { a: ['p9', 'p2', 'p5'] }, p: ['a'], r: [] })],
      rubric,
    );
    const record = built.reviewRecords[0]!;
    expect(record.sourcePresentations.map((s) => s.requestedUrl)).toEqual([
      'https://invented.example/page-9',
      'https://invented.example/page-2',
      'https://invented.example/page-5',
    ]);
    expect(built.indexItems[0]!.sourcePageEvidenceIds).toEqual(['p9', 'p2', 'p5']);
    expect(built.counts.multiSourceItems).toBe(1);
    expect(built.counts.sourcePresentations).toBe(3);
  });

  it('refuses a missing source row', () => {
    const slot = mkSlot({
      docs: { a: ['p1', 'p2'] },
      p: ['a'],
      r: [],
      rows: [row('p1', digest('a'))],
    });
    expect(codeOf(() => buildHandoffFromSlots([slot], rubric))).toBe('R50_SOURCE_ROW_MISSING');
  });

  it('refuses an extra source row carrying the same document digest', () => {
    const slot = mkSlot({
      docs: { a: ['p1'] },
      p: ['a'],
      r: [],
      rows: [row('p1', digest('a')), row('p7', digest('a'))],
    });
    expect(codeOf(() => buildHandoffFromSlots([slot], rubric))).toBe('R50_SOURCE_ROW_EXTRA');
  });

  it('refuses a listed source that belongs to another document (cross-document row)', () => {
    const slot = mkSlot({
      docs: { a: ['p1', 'p2'], b: ['p3'] },
      p: ['a'],
      r: [],
      rows: [row('p1', digest('a')), row('p2', digest('b')), row('p3', digest('b'))],
    });
    expect(codeOf(() => buildHandoffFromSlots([slot], rubric))).toBe(
      'R50_SOURCE_ROW_DIGEST_MISMATCH',
    );
  });

  it('refuses a wrong-digest source row', () => {
    const slot = mkSlot({ docs: { a: ['p1'] }, p: ['a'], r: [], rows: [row('p1', digest('e'))] });
    expect(codeOf(() => buildHandoffFromSlots([slot], rubric))).toBe(
      'R50_SOURCE_ROW_DIGEST_MISMATCH',
    );
  });

  it('refuses different main text inside one exact document', () => {
    const slot = mkSlot({
      docs: { a: ['p1', 'p2'] },
      p: ['a'],
      r: [],
      rows: [row('p1', digest('a')), row('p2', digest('a'), { mainText: 'different' })],
    });
    expect(codeOf(() => buildHandoffFromSlots([slot], rubric))).toBe(
      'R50_SOURCE_MAIN_TEXT_DISAGREES',
    );
  });

  it('refuses a page id stored twice in one slot', () => {
    const slot = mkSlot({
      docs: { a: ['p1'] },
      p: ['a'],
      r: [],
      rows: [row('p1', digest('a')), row('p1', digest('a'))],
    });
    expect(codeOf(() => buildHandoffFromSlots([slot], rubric))).toBe('R50_SOURCE_ROW_DUPLICATE');
  });

  it('never looks up a source row in another slot', () => {
    const one = mkSlot({ selectionIndex: 1, docs: { a: ['p1'] }, p: ['a'], r: [], rows: [] });
    const two = mkSlot({
      selectionIndex: 2,
      eche: ECHE_B,
      org: ORG_B,
      docs: { b: ['p2'] },
      p: ['b'],
      r: [],
      rows: [row('p1', digest('a')), row('p2', digest('b'))],
    });
    expect(codeOf(() => buildHandoffFromSlots([one, two], rubric))).toBe('R50_SOURCE_ROW_MISSING');
  });

  it('is all-or-nothing: a failure on the LAST item returns nothing', () => {
    const slots = [
      mkSlot({ selectionIndex: 1, docs: { a: ['p1'] }, p: ['a'], r: [] }),
      mkSlot({
        selectionIndex: 2,
        eche: ECHE_B,
        org: ORG_B,
        docs: { b: ['p2'] },
        p: ['b'],
        r: [],
        rows: [row('p2', digest('f'))],
      }),
    ];
    let result: unknown = 'unset';
    expect(
      codeOf(() => {
        result = buildHandoffFromSlots(slots, rubric);
      }),
    ).toBe('R50_SOURCE_ROW_DIGEST_MISMATCH');
    expect(result).toBe('unset');
  });
});

// ---------------------------------------------------------------------------
// E. NO PAGE REPRESENTATIVE.
// ---------------------------------------------------------------------------

describe('2D-A3 R50: a multi-source document keeps every presentation and no representative', () => {
  const built = buildHandoffFromSlots(
    [mkSlot({ docs: { a: ['p1', 'p2', 'p3'] }, p: ['a'], r: ['a'] })],
    rubric,
  );

  it('is one goldId, one record, three presentations', () => {
    expect(built.indexItems).toHaveLength(1);
    expect(built.reviewRecords).toHaveLength(1);
    expect(built.reviewRecords[0]!.sourcePresentations).toHaveLength(3);
    expect(built.counts.uniqueGoldIds).toBe(1);
  });

  it('carries the equality-justified shared main text once, not per presentation', () => {
    const record = built.reviewRecords[0]!;
    expect(record.mainText).toBe(`Invented body of a`);
    for (const presentation of record.sourcePresentations) {
      expect(Object.keys(presentation)).not.toContain('mainText');
    }
  });

  it('names no representative, canonical index or winner anywhere', () => {
    const keys = [
      ...structuredKeysOf(built.reviewRecords),
      ...structuredKeysOf(built.indexItems),
    ].map((k) => k.key.toLowerCase());
    for (const banned of [
      'representative',
      'canonicalsourceindex',
      'winner',
      'chosen',
      'primary',
    ]) {
      expect(
        keys.some((k) => k.includes(banned)),
        banned,
      ).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// F. BLINDING.
// ---------------------------------------------------------------------------

describe('2D-A3 R50: the reviewer package is blind to sampling, identity and models', () => {
  const built = buildHandoffFromSlots(
    [
      mkSlot({
        docs: { a: ['p1'], b: ['p2', 'p3'] },
        p: ['a', 'b'],
        r: ['b'],
        rows: [
          row('p1', digest('a'), {
            title: 'Score, rank and generation: a SET_P sample candidate signal',
            mainText: 'This page discusses the model, a threshold and the reserve.',
          }),
          row('p2', digest('b')),
          row('p3', digest('b')),
        ],
      }),
    ],
    rubric,
  );

  it('carries exactly the reviewer-visible keys at every level', () => {
    for (const record of built.reviewRecords) {
      expect(Object.keys(record)).toEqual([...REVIEW_RECORD_KEYS]);
      for (const presentation of record.sourcePresentations) {
        expect(Object.keys(presentation)).toEqual([...REVIEW_PRESENTATION_KEYS]);
      }
    }
  });

  it('no structured key, recursively, carries forbidden metadata', () => {
    const forbidden = structuredKeysOf(built.reviewRecords).filter(
      ({ key }) => forbiddenFragmentsOfKey(key).length !== 0,
    );
    expect(forbidden).toEqual([]);
  });

  it('does not censor natural page text that happens to use those words', () => {
    expect(JSON.stringify(built.reviewRecords)).toContain('SET_P sample candidate signal');
  });

  it('flags every forbidden key shape, and only "goldId" may say gold', () => {
    for (const key of [
      'inSetP',
      'inSetR',
      'setPMembership',
      'sampleRank',
      'saltedRankSha256',
      'sourceRankPosition',
      'survivorRankPosition',
      'candidateScore',
      'signals',
      'track',
      'rankWithinRoot',
      'selectionIndex',
      'echeRowKey',
      'organisationId',
      'documentSha256',
      'pageEvidenceId',
      'generation',
      'reservePosition',
      'a2Status',
      'disposition',
      'historicalGold',
      'goldLabel',
      'prediction',
      'modelOutput',
      'classifierVerdict',
      'nearDuplicate',
      'gateThreshold',
      'exclusionWitness',
    ]) {
      expect(forbiddenFragmentsOfKey(key).length, key).toBeGreaterThan(0);
    }
    for (const key of [...REVIEW_RECORD_KEYS, ...REVIEW_PRESENTATION_KEYS, 'level', 'text']) {
      expect(forbiddenFragmentsOfKey(key), key).toEqual([]);
    }
  });

  it('carries no internal identity value anywhere in a record', () => {
    const text = JSON.stringify(built.reviewRecords);
    for (const item of built.indexItems) {
      expect(text).not.toContain(item.documentSha256);
      expect(text).not.toContain(item.echeRowKey);
      for (const id of item.sourcePageEvidenceIds) expect(text).not.toContain(`"${id}"`);
    }
  });

  it('the firewall refuses a record carrying an extra metadata key', () => {
    const record = built.reviewRecords[0]!;
    const leaky = { ...record, inSetP: true } as unknown as ReviewPackageRecord;
    expect(codeOf(() => requireBlindReviewRecord(leaky, rubric, built.indexItems[0]!, 0))).toBe(
      'R50_REVIEW_PACKAGE_NOT_BLIND',
    );
    const nested = {
      ...record,
      sourcePresentations: record.sourcePresentations.map((p) => ({ ...p, candidateScore: '1' })),
    } as unknown as ReviewPackageRecord;
    expect(codeOf(() => requireBlindReviewRecord(nested, rubric, built.indexItems[0]!, 0))).toBe(
      'R50_REVIEW_PACKAGE_NOT_BLIND',
    );
  });

  it('the firewall refuses a record that quotes an internal identity value', () => {
    const item = built.indexItems[0]!;
    const record = { ...built.reviewRecords[0]!, mainText: `x ${item.documentSha256}` };
    expect(codeOf(() => requireBlindReviewRecord(record, rubric, item, 0))).toBe(
      'R50_REVIEW_PACKAGE_NOT_BLIND',
    );
  });

  it('binds every record to the exact rubric version and SHA-256', () => {
    for (const record of built.reviewRecords) {
      expect(record.rubricVersion).toBe('METHODOLOGY_V2_HUMAN_LABELLING_RUBRIC_V1');
      expect(record.rubricSha256).toBe(R49_RUBRIC.sha256);
    }
  });
});

// ---------------------------------------------------------------------------
// G. HEADINGS.
// ---------------------------------------------------------------------------

describe('2D-A3 R50: one deterministic heading display form', () => {
  it('keeps { level, text } objects and bare strings in order', () => {
    expect(
      displayHeadings([{ level: 2, text: 'B' }, 'loose', { text: 'C', level: 1 }], 'x'),
    ).toEqual([
      { level: 2, text: 'B' },
      { level: null, text: 'loose' },
      { level: 1, text: 'C' },
    ]);
  });

  it.each([
    [[1]],
    [[null]],
    [[{ level: 1 }]],
    [[{ level: 0, text: 'x' }]],
    [[{ level: 7, text: 'x' }]],
    [[{ level: 1, text: 'x', extra: true }]],
    [[['nested']]],
    ['not-an-array'],
  ])('refuses an unsupported shape %j', (headings) => {
    expect(codeOf(() => displayHeadings(headings, 'x'))).toBe('R50_HEADING_SHAPE_UNSUPPORTED');
  });
});

// ---------------------------------------------------------------------------
// H. THE BLANK RESPONSE TEMPLATE.
// ---------------------------------------------------------------------------

describe('2D-A3 R50: the blank single-review response template', () => {
  const built = buildHandoffFromSlots(
    [mkSlot({ docs: { a: ['p1'], b: ['p2'], c: ['p3'] }, p: ['a', 'b'], r: ['c'] })],
    rubric,
  );

  it('has one row per package goldId, in the same order, with the same rubric binding', () => {
    expect(built.templateRecords).toHaveLength(built.reviewRecords.length);
    built.templateRecords.forEach((template, i) => {
      expect(Object.keys(template)).toEqual([...RESPONSE_TEMPLATE_KEYS]);
      expect(template.goldId).toBe(built.reviewRecords[i]!.goldId);
      expect(template.rubricVersion).toBe(rubric.rubricVersion);
      expect(template.rubricSha256).toBe(rubric.rubricSha256);
    });
  });

  it('leaves all five human-response values null - no default verdict, type or flag', () => {
    for (const template of built.templateRecords) {
      for (const field of RESPONSE_HUMAN_FIELDS) expect(template[field], field).toBeNull();
    }
    const text = toJsonl(built.templateRecords);
    for (const value of [
      'UNIT_PAGE',
      'NOT_A_UNIT',
      'NEEDS_REVIEW',
      'INTERNATIONAL_MOBILITY_OFFICE',
      'LANGUAGE_CENTRE',
      'LANGUAGE_DEPARTMENT',
      'OTHER_UNIT',
      'true',
      'false',
    ]) {
      expect(text).not.toContain(value);
    }
  });

  it('a blank template row is NOT a valid completed response', () => {
    for (const template of built.templateRecords) {
      expect(isCompletedResponseShape(template, rubric)).toBe(false);
      expect(completedResponseShapeProblems(template, rubric)).toEqual(
        expect.arrayContaining([
          'reviewerActorKey is unanswered',
          'verdict is unanswered',
          'hard_negative is unanswered',
        ]),
      );
    }
  });
});

// ---------------------------------------------------------------------------
// I. THE FUTURE COMPLETED-RESPONSE SHAPE (invented responses only).
// ---------------------------------------------------------------------------

describe('2D-A3 R50: the completed-response shape follows the R49 matrix exactly', () => {
  const base = {
    goldId: 'g0000000000000001',
    rubricVersion: rubric.rubricVersion,
    rubricSha256: rubric.rubricSha256,
    reviewerActorKey: 'reviewer-01',
    reviewNote: null,
  };

  it.each([
    ['UNIT_PAGE', 'INTERNATIONAL_MOBILITY_OFFICE', false],
    ['UNIT_PAGE', 'LANGUAGE_CENTRE', false],
    ['UNIT_PAGE', 'LANGUAGE_DEPARTMENT', false],
    ['UNIT_PAGE', 'OTHER_UNIT', false],
    ['NOT_A_UNIT', null, true],
    ['NOT_A_UNIT', null, false],
    ['NEEDS_REVIEW', null, false],
  ])('legal: %s / %s / %s', (verdict, unit_type, hard_negative) => {
    const response = { ...base, verdict, unit_type, hard_negative };
    expect(completedResponseShapeProblems(response, rubric)).toEqual([]);
  });

  it.each([
    [
      'UNIT_PAGE with null unit_type',
      { verdict: 'UNIT_PAGE', unit_type: null, hard_negative: false },
    ],
    [
      'UNIT_PAGE with hard_negative true',
      { verdict: 'UNIT_PAGE', unit_type: 'OTHER_UNIT', hard_negative: true },
    ],
    [
      'NOT_A_UNIT with a unit_type',
      { verdict: 'NOT_A_UNIT', unit_type: 'LANGUAGE_CENTRE', hard_negative: false },
    ],
    [
      'NEEDS_REVIEW with a unit_type',
      { verdict: 'NEEDS_REVIEW', unit_type: 'OTHER_UNIT', hard_negative: false },
    ],
    [
      'NEEDS_REVIEW with hard_negative true',
      { verdict: 'NEEDS_REVIEW', unit_type: null, hard_negative: true },
    ],
    ['an unknown verdict', { verdict: 'MAYBE', unit_type: null, hard_negative: false }],
    [
      'an unknown unit type',
      { verdict: 'UNIT_PAGE', unit_type: 'RESEARCH_LAB', hard_negative: false },
    ],
    [
      'an invalid actor key',
      {
        verdict: 'NOT_A_UNIT',
        unit_type: null,
        hard_negative: false,
        reviewerActorKey: 'Jane Doe <jane@example.org>',
      },
    ],
    [
      'a foreign rubric',
      {
        verdict: 'NOT_A_UNIT',
        unit_type: null,
        hard_negative: false,
        rubricSha256: 'f'.repeat(64),
      },
    ],
    [
      'a missing field',
      { verdict: 'NOT_A_UNIT', unit_type: null, hard_negative: false, reviewNote: undefined },
    ],
  ])('illegal: %s', (_name, overrides) => {
    const response = JSON.parse(JSON.stringify({ ...base, ...overrides })) as unknown;
    expect(completedResponseShapeProblems(response, rubric).length).toBeGreaterThan(0);
  });

  it('returns problems and never a corrected or defaulted response', () => {
    const response = { ...base, verdict: 'UNIT_PAGE', unit_type: null, hard_negative: false };
    const before = JSON.stringify(response);
    const problems = completedResponseShapeProblems(response, rubric);
    expect(JSON.stringify(response)).toBe(before);
    expect(problems.every((p) => typeof p === 'string')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// J. THE PACKAGE HASH.
// ---------------------------------------------------------------------------

describe('2D-A3 R50: R50_PRE_LABEL_REVIEW_PACKAGE_HASH', () => {
  const slots = [mkSlot({ docs: { a: ['p1'], b: ['p2', 'p3'] }, p: ['a', 'b'], r: ['b'] })];

  it('is sha256OfCanonical over the exact contract input, deterministic', () => {
    const one = buildHandoffFromSlots(slots, rubric);
    const two = buildHandoffFromSlots(slots, rubric);
    expect(one.packageHash).toBe(two.packageHash);
    expect(one.packageHash).toMatch(/^[0-9a-f]{64}$/);
    expect(one.packageHash).toBe(
      sha256OfCanonical({
        packageSchema: R50_PACKAGE_SCHEMA,
        rubricVersion: rubric.rubricVersion,
        rubricSha256: rubric.rubricSha256,
        recordCount: one.reviewRecords.length,
        records: one.reviewRecords,
      }),
    );
    expect(packageHashInputOf(rubric, one.reviewRecords)).toEqual({
      packageSchema: R50_PACKAGE_SCHEMA,
      rubricVersion: rubric.rubricVersion,
      rubricSha256: rubric.rubricSha256,
      recordCount: one.reviewRecords.length,
      records: one.reviewRecords,
    });
  });

  it('changes when any reviewer-visible byte, the order or the rubric binding changes', () => {
    const built = buildHandoffFromSlots(slots, rubric);
    const records = built.reviewRecords;
    const edited = [{ ...records[0]!, mainText: `${records[0]!.mainText}.` }, ...records.slice(1)];
    expect(preLabelPackageHash(rubric, edited)).not.toBe(built.packageHash);
    expect(preLabelPackageHash(rubric, [...records].reverse())).not.toBe(built.packageHash);
    expect(
      preLabelPackageHash(
        { rubricVersion: rubric.rubricVersion, rubricSha256: 'f'.repeat(64) },
        records,
      ),
    ).not.toBe(built.packageHash);
  });

  it('round-trips through JSONL to the same hash', () => {
    const built = buildHandoffFromSlots(slots, rubric);
    const back = fromJsonl(toJsonl(built.reviewRecords)) as ReviewPackageRecord[];
    expect(back).toEqual(built.reviewRecords);
    expect(preLabelPackageHash(rubric, back)).toBe(built.packageHash);
    expect(toJsonl(built.reviewRecords).split('\n')).toHaveLength(built.reviewRecords.length + 1);
  });
});

// ---------------------------------------------------------------------------
// K. ONLY GENUINE CURRENT-PROCESS AUTHORITY REACHES DISK.
// ---------------------------------------------------------------------------

describe('2D-A3 R50: the genuine-authority gates refuse everything else', () => {
  const r47Census = JSON.parse(
    bytesOf(
      'docs/evaluation/PHASE_2B_2D_A3_R47_R4_GLOBAL_DEV_TRAIN_REPLAY_CENSUS_V1.json',
    ).toString('utf8'),
  ) as Record<string, unknown>;
  const fakeSample = {
    kind: 'A3_R4_DEV_TRAIN_SAMPLE_BATCH',
    authorityVisibility: 'INTERNAL_NEVER_SERIALISE_PUBLICLY',
    split: 'DEV_TRAIN',
    items: [],
  };
  const baseInput = {
    r46Approval: {},
    r47ReproductionProof: {},
    view: {},
    readinessBatch: {},
    access: {} as never,
    implementationCommit: 'x',
    committedR47CensusBytes: bytesOf(
      'docs/evaluation/PHASE_2B_2D_A3_R47_R4_GLOBAL_DEV_TRAIN_REPLAY_CENSUS_V1.json',
    ),
    upstreamPools: [],
  };

  it('refuses a literal R46 approval before anything else', () => {
    expect(codeOf(() => requireFreshR47ReproductionForR50(baseInput))).toBe(
      'R50_R47_APPROVAL_NOT_BOUND',
    );
  });

  it('refuses a census, a fake batch or a spread clone offered as R47 authority', async () => {
    const { bindR46ApprovalForR47, R46_APPROVAL_RECORD } =
      await import('../harness/phase2b2d/a3replayR4/approval.js');
    const approval = bindR46ApprovalForR47({
      approvalBytes: bytesOf(R46_APPROVAL_RECORD.path),
      proposalBytes: bytesOf(
        'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_R4_SHORT_TEXT_AMENDMENT_PROPOSAL_V1.json',
      ),
    });
    for (const fake of [
      r47Census,
      fakeSample,
      { ...fakeSample },
      JSON.parse(JSON.stringify(fakeSample)),
    ]) {
      expect(
        codeOf(() =>
          requireFreshR47ReproductionForR50({
            ...baseInput,
            r46Approval: approval,
            r47ReproductionProof: fake,
            view: fake,
            readinessBatch: fake,
          }),
        ),
      ).toBe('R50_R47_AUTHORITY_NOT_GENUINE');
    }
  });

  it('no proof can be manufactured from a literal', () => {
    const literal = { kind: 'A3_R50_FRESH_R47_REPRODUCTION_PROOF', differingSemanticPathCount: 0 };
    expect(isR50ReproductionProof(literal)).toBe(false);
    expect(codeOf(() => collectGenuineHandoffSlots(literal))).toBe('R50_REPRODUCTION_NOT_PROVED');
    expect(codeOf(() => buildGenuineR50Handoff({ proof: literal, rubric }))).toBe(
      'R50_REPRODUCTION_NOT_PROVED',
    );
    expect(codeOf(() => buildGenuineR50Handoff({ proof: literal, rubric: { ...rubric } }))).toBe(
      'R50_RUBRIC_NOT_BOUND',
    );
  });

  it('a synthetic build can never be rendered or written', async () => {
    const built = buildHandoffFromSlots([mkSlot({ docs: { a: ['p1'] }, p: ['a'], r: [] })], rubric);
    const fakeHandoff = { kind: 'A3_R50_GENUINE_DEV_TRAIN_R4_A4_HANDOFF', built, rubric } as never;
    expect(await asyncCodeOf(() => renderR50Artifacts(fakeHandoff, REPO_ROOT))).toBe(
      'R50_REPRODUCTION_NOT_PROVED',
    );
    expect(
      codeOf(() =>
        writeR50ArtifactsAtomically(
          fakeHandoff,
          { index: '{}', reviewPackage: '', responseTemplate: '' },
          REPO_ROOT,
        ),
      ),
    ).toBe('R50_REPRODUCTION_NOT_PROVED');
  });
});
