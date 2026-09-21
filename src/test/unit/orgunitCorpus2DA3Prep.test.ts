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
import { rankSetP, selectSetP } from '../harness/phase2b2d/a3prep/setP.js';
import { rankSetR, selectSetR } from '../harness/phase2b2d/a3prep/setR.js';
import { evaluateSd9FromBounds, evaluateSd9FromExactPostSd7Count } from '../harness/phase2b2d/a3prep/sd9.js';
import {
  assertRecordsMatchScope,
  assertSingleSplitCollection,
  createSplitScope,
} from '../harness/phase2b2d/a3prep/splitScope.js';
import {
  distinctDocuments,
  resolvedSetRDocuments,
  syntheticOrganisation,
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
});

describe('2D-A3 prep: SET_R ranks only an already-resolved candidate-independent score', () => {
  it('sorts score descending and uses a deterministic hash tie-break', () => {
    const docs = resolvedSetRDocuments('ORG_X', 'DEV_TRAIN', [2, 9, 9, 1, 7, 6]);
    const ranked = rankSetR(docs);
    expect(ranked.map((d) => d.candidateIndependentScore)).toEqual([9, 9, 7, 6, 2, 1]);
    expect(ranked[0]!.setRTieBreakHash < ranked[1]!.setRTieBreakHash).toBe(true);
  });

  it('takes at most four pages per organisation', () => {
    expect(
      selectSetR(resolvedSetRDocuments('ORG_X', 'DEV_TRAIN', [9, 8, 7, 6, 5, 4])),
    ).toHaveLength(SET_R_MAX_PAGES_PER_ORGANISATION);
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

    const result = checkCorpusFreezePreflight({
      organisations,
      manifests: [],
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
