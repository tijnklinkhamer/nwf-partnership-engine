import { describe, expect, it } from 'vitest';
import {
  A3_PREP_OWNER_DECISIONS,
  SET_P_MAX_PAGES_PER_ORGANISATION,
  SET_R_MAX_PAGES_PER_ORGANISATION,
} from '../harness/phase2b2d/a3prep/contracts.js';
import { checkCorpusFreezePreflight } from '../harness/phase2b2d/a3prep/corpusFreezePreflight.js';
import {
  gateShareIntegerCap,
  organisationShareViolations,
} from '../harness/phase2b2d/a3prep/organisationCaps.js';
import { assessSd7ForOrganisation } from '../harness/phase2b2d/a3prep/sd7.js';
import { rankSetP, selectSetP } from '../harness/phase2b2d/a3prep/setP.js';
import { rankSetR, selectSetR } from '../harness/phase2b2d/a3prep/setR.js';
import {
  evaluateSd9FromBounds,
  evaluateSd9FromExactPostSd7Count,
} from '../harness/phase2b2d/a3prep/sd9.js';
import {
  assertRecordsMatchScope,
  assertSingleSplitCollection,
  createSplitScope,
} from '../harness/phase2b2d/a3prep/splitScope.js';
import {
  distinctDocuments,
  resolvedSetRDocuments,
  syntheticOrganisation,
  syntheticPage,
} from '../harness/phase2b2d/a3prep/syntheticFixtures.js';

describe('2D-A3 prep: SET_P is deterministic and class-blind by construction', () => {
  it('is independent of input enumeration order', () => {
    const docs = distinctDocuments('ORG_X', 'DEV_TRAIN', 12);
    const expected = rankSetP(docs).map((d) => d.documentSha256);
    for (let shift = 0; shift < docs.length; shift += 1) {
      const shuffled = [...docs.slice(shift), ...docs.slice(0, shift)];
      expect(rankSetP(shuffled).map((d) => d.documentSha256)).toEqual(expected);
    }
  });

  it('takes at most eight pages per organisation', () => {
    expect(selectSetP(distinctDocuments('ORG_X', 'DEV_TRAIN', 20))).toHaveLength(
      SET_P_MAX_PAGES_PER_ORGANISATION,
    );
  });

  it('rejects a mixed-organisation or mixed-split input', () => {
    const [first] = distinctDocuments('ORG_X', 'DEV_TRAIN', 1);
    const [otherOrg] = distinctDocuments('ORG_Y', 'DEV_TRAIN', 1);
    const [otherSplit] = distinctDocuments('ORG_X', 'DEV_CONFIRM', 1);
    expect(() => rankSetP([first!, otherOrg!])).toThrow(/mixed organisations/);
    expect(() => rankSetP([first!, otherSplit!])).toThrow(/mixed splits/);
  });
});

describe('2D-A3 prep: SET_R ranks only an already-resolved candidate-independent score', () => {
  it('sorts score descending and uses a deterministic hash tie-break', () => {
    const docs = resolvedSetRDocuments('ORG_X', 'DEV_TRAIN', [2, 9, 9, 1, 7, 6]);
    const ranked = rankSetR(docs);
    expect(ranked.map((d) => d.candidateIndependentScore)).toEqual([9, 9, 7, 6, 2, 1]);
    expect(ranked[0]!.setRTieBreakHash < ranked[1]!.setRTieBreakHash).toBe(true);
  });

  it('is independent of input enumeration order', () => {
    const docs = resolvedSetRDocuments('ORG_X', 'DEV_TRAIN', [2, 9, 9, 1, 7, 6]);
    const expected = rankSetR(docs).map((d) => d.documentSha256);
    expect(rankSetR([...docs].reverse()).map((d) => d.documentSha256)).toEqual(expected);
  });

  it('takes at most four pages per organisation', () => {
    expect(
      selectSetR(resolvedSetRDocuments('ORG_X', 'DEV_TRAIN', [9, 8, 7, 6, 5, 4])),
    ).toHaveLength(SET_R_MAX_PAGES_PER_ORGANISATION);
  });

  it('fails closed on a non-finite score', () => {
    const docs = resolvedSetRDocuments('ORG_X', 'DEV_TRAIN', [9, Number.NaN]);
    expect(() => rankSetR(docs)).toThrow(/non-finite/);
  });
});

describe('2D-A3 prep: SD7 reuses the canonical measurement and SD9 bounds', () => {
  it('removes exact duplicates before near-duplicate measurement', () => {
    const org = 'ORG_X';
    const split = 'DEV_TRAIN' as const;
    const shared = Array.from({ length: 30 }, (_, i) => `invented-${i}`).join(' ');
    const pages = [
      syntheticPage(org, split, 'p1', 'same-document', shared),
      syntheticPage(org, split, 'p2', 'same-document', shared),
      syntheticPage(org, split, 'p3', 'different-a'),
      syntheticPage(org, split, 'p4', 'different-b'),
      syntheticPage(org, split, 'p5', 'different-c'),
    ];
    const result = assessSd7ForOrganisation(pages);
    expect(result.exactDuplicateRowsRemoved).toBe(1);
    expect(result.exactDistinctDocumentCount).toBe(4);
  });

  it('keeps cross-organisation measurement outside this per-organisation adapter', () => {
    const a = syntheticPage('ORG_A', 'DEV_TRAIN', 'a', 'sha-a');
    const b = syntheticPage('ORG_B', 'DEV_TRAIN', 'b', 'sha-b', a.mainText);
    expect(() => assessSd7ForOrganisation([a, b])).toThrow(/mixed organisations/);
  });

  it('uses the owner-adjudicated short-text bounds rule rather than inventing Jaccard', () => {
    const org = 'ORG_X';
    const split = 'DEV_TRAIN' as const;
    const pages = [
      syntheticPage(org, split, 'p1', 'sha-1'),
      syntheticPage(org, split, 'p2', 'sha-2'),
      syntheticPage(org, split, 'p3', 'sha-3'),
      syntheticPage(org, split, 'p4', 'sha-4', 'too short'),
    ];
    const result = assessSd7ForOrganisation(pages);
    expect(result.shortTextUnresolvedCount).toBe(1);
    expect(result.postSd7CountMin).toBe(3);
    expect(result.postSd7CountMax).toBe(4);
    expect(result.sd9Status).toBe('ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL');
  });
});

describe('2D-A3 prep: SD9 and caps are mechanical', () => {
  it('uses four as the exact SD9 boundary', () => {
    expect(evaluateSd9FromExactPostSd7Count(3)).toBe(
      'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET',
    );
    expect(evaluateSd9FromExactPostSd7Count(4)).toBe('ACQUISITION_SUCCESSFUL');
  });

  it('stays pending when an SD7 range straddles four', () => {
    expect(evaluateSd9FromBounds(3, 4)).toBe('ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL');
    expect(evaluateSd9FromBounds(4, 5)).toBe('ACQUISITION_SUCCESSFUL');
    expect(evaluateSd9FromBounds(2, 3)).toBe('ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET');
  });

  it('implements the integer floor of the 10% gate-share cap', () => {
    expect(gateShareIntegerCap(66)).toBe(6);
    expect(gateShareIntegerCap(100)).toBe(10);
    expect(organisationShareViolations(66, { A: 8, B: 6, C: 1 })).toEqual([
      { organisationKey: 'A', contribution: 8, allowed: 6 },
    ]);
  });
});

describe('2D-A3 prep: sealed split scopes fail closed', () => {
  it('rejects a cross-split record', () => {
    expect(() =>
      assertRecordsMatchScope(createSplitScope('DEV_CONFIRM'), [
        { split: 'DEV_CONFIRM' },
        { split: 'FINAL_HOLDOUT' },
      ]),
    ).toThrow(/cross-split/);
  });

  it('rejects a missing split token and mixed collection', () => {
    expect(() => assertSingleSplitCollection([{ split: 'DEV_TRAIN' }, {}])).toThrow(/missing/);
    expect(() =>
      assertSingleSplitCollection([{ split: 'DEV_TRAIN' }, { split: 'DEV_CONFIRM' }]),
    ).toThrow(/cross-split/);
  });
});

describe('2D-A3 prep: corpus freeze preflight refuses unresolved owner semantics', () => {
  it('returns NOT_READY rather than authorising a freeze', () => {
    const splitCycle = [
      'DEV_TRAIN',
      'DEV_CONFIRM',
      'FINAL_HOLDOUT',
      'DEV_CONFIRM',
      'FINAL_HOLDOUT',
      'DEV_TRAIN',
      'DEV_CONFIRM',
      'FINAL_HOLDOUT',
      'DEV_CONFIRM',
      'FINAL_HOLDOUT',
      'DEV_CONFIRM',
      'FINAL_HOLDOUT',
      'DEV_TRAIN',
      'DEV_CONFIRM',
      'FINAL_HOLDOUT',
      'DEV_CONFIRM',
      'FINAL_HOLDOUT',
      'DEV_TRAIN',
      'DEV_CONFIRM',
      'FINAL_HOLDOUT',
      'DEV_CONFIRM',
      'FINAL_HOLDOUT',
    ] as const;
    const organisations = Array.from({ length: 110 }, (_, index) => {
      const org = syntheticOrganisation(index, splitCycle[index % 22]!, 4);
      return { ...org, sd9Status: 'ACQUISITION_SUCCESSFUL' as const };
    });
    const manifests = [
      {
        schemaVersion: 'A3_PUBLIC_MANIFEST_PREP_V1',
        split: 'DEV_TRAIN',
        itemCount: 1,
        organisationCount: 20,
        splitContentHash: 'train-hash',
        realisedSetPSize: 1,
        realisedSetRSize: 1,
        itemIds: ['synthetic-item'],
        documentSha256s: ['synthetic-document'],
      },
      {
        schemaVersion: 'A3_PUBLIC_MANIFEST_PREP_V1',
        split: 'DEV_CONFIRM',
        itemCount: 1,
        organisationCount: 45,
        splitContentHash: 'confirm-hash',
        realisedSetPSize: 1,
        realisedSetRSize: 1,
      },
      {
        schemaVersion: 'A3_PUBLIC_MANIFEST_PREP_V1',
        split: 'FINAL_HOLDOUT',
        itemCount: 1,
        organisationCount: 45,
        splitContentHash: 'holdout-hash',
        realisedSetPSize: 1,
        realisedSetRSize: 1,
      },
    ] as const;

    const result = checkCorpusFreezePreflight({
      organisations,
      manifests,
      setPDeterminismVerified: true,
      setRDeterminismVerified: true,
      capsVerified: true,
      hashInputsComplete: true,
      sd7SampleRankSemanticsApproved: false,
      setRScoreReductionApproved: false,
      organisationShareTruncationApproved: false,
    });

    expect(result.status).toBe('NOT_READY');
    expect(result.reasons).toContain(A3_PREP_OWNER_DECISIONS.SD7_SD9_SAMPLE_RANK);
    expect(result.reasons).toContain(A3_PREP_OWNER_DECISIONS.SET_R_TRACK_REDUCTION);
    expect(result.reasons).toContain(A3_PREP_OWNER_DECISIONS.ORGANISATION_SHARE_TRUNCATION);
  });
});
