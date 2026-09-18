/**
 * PHASE 2B-2D METHODOLOGY V2 — A1 FRAME MATERIALISATION.
 *
 * Proves the SD1 boolean logic exactly, the two exclusion sources, the
 * order-independence of the claim-eligibility snapshot hash, the determinism
 * of the frame hash, and that every examined organisation emits exactly one
 * entry whose counts reconcile.
 *
 * These are unit tests over pure functions and committed fixtures. They open
 * no socket and no database.
 */
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  DATABASE_SCHEMA_VERSION_RANGE,
  FRAME_REASONS,
  FRAME_REASON_PRECEDENCE,
  GENERATION_ID,
  HISTORICAL_DEVELOPMENT_CORPUS_PATH,
  HISTORICAL_DEVELOPMENT_ORGANISATION_COUNT,
  type FrameEntry,
  type RootAuthority,
} from '../harness/phase2b2d/corpus/frameContract.js';
import {
  CLAIM_SNAPSHOT_SEMANTICS,
  hashClaimEligibilitySnapshot,
  hashPromotionEligibilitySnapshot,
  serialiseClaimEligibilitySnapshot,
  sortEligibilityClaimRows,
  type EligibilityClaimRow,
  type EligibilityPromotionRow,
} from '../harness/phase2b2d/corpus/claimSnapshot.js';
import {
  countFrame,
  enumerateFrame,
  evaluateOrganisation,
  reconcileCounts,
  sortRootAuthorities,
  type ExaminedOrganisation,
} from '../harness/phase2b2d/corpus/frameEnumeration.js';
import {
  buildFrameArtifact,
  computeFrameHash,
  buildFramePayload,
  recomputeFrameHash,
  renderFrameArtifact,
  type BuildFrameArtifactInput,
} from '../harness/phase2b2d/corpus/frameArtifact.js';
import { readHistoricalDevelopmentExclusion } from '../harness/phase2b2d/corpus/historicalExclusion.js';
import { readPriorGenerationExclusion } from '../harness/phase2b2d/corpus/priorGenerationExclusion.js';
import {
  buildFrameFromInputs,
  rootAuthorityDistribution,
  verifyPostA0State,
  EXPECTED_POST_A0_TABLE_COUNTS,
  A1B_MINIMUM_ELIGIBLE_ORGANISATIONS,
} from '../harness/phase2b2d/corpus/materialiseFrame.js';
import { VERIFIED_TABLES, type FrameInputs } from '../harness/phase2b2d/corpus/readFrameInputs.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const CLAIM: RootAuthority = {
  type: 'WEBSITE_CLAIM',
  id: '11111111-1111-4111-8111-111111111111',
  sourceLabel: 'claim:ECHE_PUBLISHED',
};
const PROMOTION: RootAuthority = {
  type: 'ROOT_PROMOTION',
  id: '22222222-2222-4222-8222-222222222222',
  sourceLabel: 'promotion',
};

function organisation(
  echeRowKey: string,
  rootAuthorities: readonly RootAuthority[] = [],
): ExaminedOrganisation {
  return { echeRowKey, organisationId: `org-${echeRowKey}`, rootAuthorities };
}

function judge(
  authorities: readonly RootAuthority[],
  historical: readonly string[] = [],
  prior: readonly string[] = [],
): FrameEntry {
  return evaluateOrganisation(
    organisation('F TEST01|1', authorities),
    new Set(historical),
    new Set(prior),
  );
}

describe('2D-A1: SD1 is the exact boolean sentence, clause by clause', () => {
  it('clause A alone includes: a STRUCTURALLY_VALID claim is sufficient authority', () => {
    const entry = judge([CLAIM]);
    expect(entry.included).toBe(true);
    expect(entry.reason).toBe('INCLUDED_STRUCTURALLY_VALID_CLAIM');
    expect(entry.hasStructurallyValidClaim).toBe(true);
    expect(entry.hasLiveRootPromotion).toBe(false);
  });

  it('clause B alone includes: a live root promotion is sufficient authority on its own', () => {
    const entry = judge([PROMOTION]);
    expect(entry.included).toBe(true);
    expect(entry.reason).toBe('INCLUDED_LIVE_ROOT_PROMOTION');
    expect(entry.hasStructurallyValidClaim).toBe(false);
    expect(entry.hasLiveRootPromotion).toBe(true);
  });

  it('A and B together include, and the claim reason wins by precedence while both booleans stay true', () => {
    const entry = judge([PROMOTION, CLAIM]);
    expect(entry.included).toBe(true);
    expect(entry.reason).toBe('INCLUDED_STRUCTURALLY_VALID_CLAIM');
    expect(entry.hasStructurallyValidClaim).toBe(true);
    expect(entry.hasLiveRootPromotion).toBe(true);
    expect(entry.rootAuthorityCount).toBe(2);
  });

  it('neither A nor B excludes as EXCLUDED_NO_VALID_ROOT_AUTHORITY', () => {
    const entry = judge([]);
    expect(entry.included).toBe(false);
    expect(entry.reason).toBe('EXCLUDED_NO_VALID_ROOT_AUTHORITY');
    expect(entry.rootAuthorityCount).toBe(0);
    expect(entry.rootAuthorityType).toBeNull();
    expect(entry.rootAuthorityId).toBeNull();
    expect(entry.rootAuthorities).toEqual([]);
  });

  it('clause C is a hard conjunct: authority does not rescue a historical DEVELOPMENT organisation', () => {
    const entry = judge([CLAIM], ['F TEST01|1']);
    expect(entry.included).toBe(false);
    expect(entry.reason).toBe('EXCLUDED_HISTORICAL_DEVELOPMENT');
    expect(entry.hasStructurallyValidClaim).toBe(true);
  });

  it('clause D is a hard conjunct: authority does not rescue a prior-generation organisation', () => {
    const entry = judge([CLAIM], [], ['F TEST01|1']);
    expect(entry.included).toBe(false);
    expect(entry.reason).toBe('EXCLUDED_PRIOR_METHODOLOGY_GENERATION');
  });

  it('all four SD1 clause booleans are carried on every entry, so no co-applying clause is hidden', () => {
    const entry = judge([CLAIM, PROMOTION], ['F TEST01|1'], ['F TEST01|1']);
    expect(entry).toMatchObject({
      included: false,
      reason: 'EXCLUDED_HISTORICAL_DEVELOPMENT',
      hasStructurallyValidClaim: true,
      hasLiveRootPromotion: true,
      excludedHistoricalDevelopment: true,
      excludedPriorGeneration: true,
    });
  });
});

describe('2D-A1: the reason precedence is frozen and deterministic', () => {
  it('lists every reason exactly once, in the frozen order', () => {
    expect([...FRAME_REASON_PRECEDENCE].sort()).toEqual([...FRAME_REASONS].sort());
    expect(FRAME_REASON_PRECEDENCE).toEqual([
      'EXCLUDED_HISTORICAL_DEVELOPMENT',
      'EXCLUDED_PRIOR_METHODOLOGY_GENERATION',
      'EXCLUDED_NO_VALID_ROOT_AUTHORITY',
      'INCLUDED_STRUCTURALLY_VALID_CLAIM',
      'INCLUDED_LIVE_ROOT_PROMOTION',
    ]);
  });

  it('historical DEVELOPMENT outranks prior generation, which outranks absence of authority', () => {
    expect(judge([], ['F TEST01|1'], ['F TEST01|1']).reason).toBe(
      'EXCLUDED_HISTORICAL_DEVELOPMENT',
    );
    expect(judge([], [], ['F TEST01|1']).reason).toBe('EXCLUDED_PRIOR_METHODOLOGY_GENERATION');
    expect(judge([]).reason).toBe('EXCLUDED_NO_VALID_ROOT_AUTHORITY');
  });

  it('the three exclusion reasons partition the excluded population exactly', () => {
    const { entries, counts } = enumerateFrame({
      organisations: [
        organisation('A|1', [CLAIM]),
        organisation('B|2', []),
        organisation('C|3', [CLAIM]),
        organisation('D|4', [CLAIM]),
        organisation('E|5', []),
      ],
      historicalDevelopmentEcheRowKeys: new Set(['C|3']),
      priorGenerationEcheRowKeys: new Set(['D|4', 'E|5']),
    });
    expect(counts).toEqual({
      examinedOrganisationCount: 5,
      eligibleOrganisationCount: 1,
      excludedOrganisationCount: 4,
      excludedHistoricalDevelopmentCount: 1,
      excludedPriorGenerationCount: 2,
      noValidAuthorityCount: 1,
    });
    expect(() => reconcileCounts(entries, counts)).not.toThrow();
  });

  it('reconcileCounts rejects a count that does not add up', () => {
    const { entries, counts } = enumerateFrame({
      organisations: [organisation('A|1', [CLAIM])],
      historicalDevelopmentEcheRowKeys: new Set(),
      priorGenerationEcheRowKeys: new Set(),
    });
    expect(() => reconcileCounts(entries, { ...counts, eligibleOrganisationCount: 99 })).toThrow(
      /eligibleOrganisationCount/,
    );
  });
});

describe('2D-A1: every examined organisation emits exactly one entry', () => {
  it('excluded organisations are carried, never filtered away', () => {
    const { entries } = enumerateFrame({
      organisations: [organisation('B|2', []), organisation('A|1', [CLAIM])],
      historicalDevelopmentEcheRowKeys: new Set(),
      priorGenerationEcheRowKeys: new Set(),
    });
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.echeRowKey)).toEqual(['A|1', 'B|2']);
    expect(entries.map((entry) => entry.included)).toEqual([true, false]);
  });

  it('is ordered by echeRowKey regardless of the order the organisations arrive in', () => {
    const forwards = enumerateFrame({
      organisations: [organisation('A|1'), organisation('B|2'), organisation('C|3')],
      historicalDevelopmentEcheRowKeys: new Set(),
      priorGenerationEcheRowKeys: new Set(),
    });
    const backwards = enumerateFrame({
      organisations: [organisation('C|3'), organisation('B|2'), organisation('A|1')],
      historicalDevelopmentEcheRowKeys: new Set(),
      priorGenerationEcheRowKeys: new Set(),
    });
    expect(backwards.entries).toEqual(forwards.entries);
  });

  it('refuses a duplicated eche_row_key rather than emitting two entries for one organisation', () => {
    expect(() =>
      enumerateFrame({
        organisations: [organisation('A|1'), organisation('A|1')],
        historicalDevelopmentEcheRowKeys: new Set(),
        priorGenerationEcheRowKeys: new Set(),
      }),
    ).toThrow(/more than once/);
  });
});

describe('2D-A1: root authorities are IDENTIFIERS, never acquisition URLs', () => {
  it('stores TYPE:id strings and nothing resembling a URL', () => {
    const entry = judge([CLAIM, PROMOTION]);
    expect(entry.rootAuthorities).toEqual([
      `WEBSITE_CLAIM:${CLAIM.id}`,
      `ROOT_PROMOTION:${PROMOTION.id}`,
    ]);
    for (const authority of entry.rootAuthorities) {
      expect(authority).not.toMatch(/https?:/i);
      expect(authority).not.toContain('//');
      expect(authority).not.toContain('.');
    }
  });

  it('orders authorities deterministically: claims before promotions, then label, then id', () => {
    const a: RootAuthority = {
      type: 'WEBSITE_CLAIM',
      id: 'bbb',
      sourceLabel: 'claim:ECHE_PUBLISHED',
    };
    const b: RootAuthority = {
      type: 'WEBSITE_CLAIM',
      id: 'aaa',
      sourceLabel: 'claim:ECHE_PUBLISHED',
    };
    const c: RootAuthority = { type: 'WEBSITE_CLAIM', id: 'zzz', sourceLabel: 'claim:FR_OFFICIAL' };
    expect(sortRootAuthorities([PROMOTION, a, c, b]).map((x) => x.id)).toEqual([
      'aaa',
      'bbb',
      'zzz',
      PROMOTION.id,
    ]);
  });

  it('preserves the count and every identifier when one organisation has several authorities', () => {
    const many: RootAuthority[] = [
      { type: 'WEBSITE_CLAIM', id: 'c1', sourceLabel: 'claim:ECHE_PUBLISHED' },
      { type: 'WEBSITE_CLAIM', id: 'c2', sourceLabel: 'claim:FR_OFFICIAL' },
      { type: 'ROOT_PROMOTION', id: 'p1', sourceLabel: 'promotion' },
    ];
    const entry = judge(many);
    expect(entry.rootAuthorityCount).toBe(3);
    expect(entry.rootAuthorities).toHaveLength(3);
    expect(entry.rootAuthorityType).toBe('WEBSITE_CLAIM');
    expect(entry.rootAuthorityId).toBe('c1');
  });
});

describe('2D-A1: the historical DEVELOPMENT exclusion', () => {
  const exclusion = readHistoricalDevelopmentExclusion(REPO_ROOT);

  it('derives exactly 12 organisations from the 49-item DEVELOPMENT corpus', () => {
    expect(exclusion.itemCount).toBe(49);
    expect(exclusion.echeRowKeys.size).toBe(HISTORICAL_DEVELOPMENT_ORGANISATION_COUNT);
    expect(exclusion.historicalOrganisationIds).toHaveLength(
      HISTORICAL_DEVELOPMENT_ORGANISATION_COUNT,
    );
  });

  it('keys the exclusion on eche_row_key, which is the identity that survived the A0 rebuild', () => {
    for (const key of exclusion.echeRowKeys) {
      expect(key).toMatch(/^[A-Z]{1,2} [A-Z0-9]+\|\d+$/);
    }
    // The UUIDs are carried as evidence only; they are a pre-A0 identity and
    // must never be the matching key.
    for (const id of exclusion.historicalOrganisationIds) {
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      expect(exclusion.echeRowKeys.has(id)).toBe(false);
    }
  });

  it('reads the DEVELOPMENT corpus and nothing else - the path is frozen, not a parameter', () => {
    expect(exclusion.sourcePath).toBe(HISTORICAL_DEVELOPMENT_CORPUS_PATH);
    expect(exclusion.sourcePath).toContain('canonical-v2.jsonl');
    expect(exclusion.sourcePath.toLowerCase()).not.toContain('holdout');
    expect(exclusion.sourcePath.toLowerCase()).not.toContain('adjudicat');
    // readHistoricalDevelopmentExclusion takes a repo root, never a corpus path.
    expect(readHistoricalDevelopmentExclusion.length).toBe(1);
  });

  it('refuses a corpus whose measured shape has moved', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'a1-historical-'));
    try {
      mkdirSync(join(scratch, 'src/test/fixtures/evaluation'), { recursive: true });
      writeFileSync(
        join(scratch, HISTORICAL_DEVELOPMENT_CORPUS_PATH),
        `${JSON.stringify({ echeRowKey: 'A|1', organisationId: 'x' })}\n`,
        'utf8',
      );
      expect(() => readHistoricalDevelopmentExclusion(scratch)).toThrow(/expected 49/);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});

describe('2D-A1: the prior-generation exclusion exists, works, and is vacuous for GEN1', () => {
  it('excludes zero organisations for generation 1, as a computed result and not a shortcut', () => {
    const prior = readPriorGenerationExclusion(REPO_ROOT, GENERATION_ID);
    expect(prior.echeRowKeys.size).toBe(0);
    expect(prior.priorGenerationIds).toEqual([]);
  });

  it('excludes the INCLUDED entries of a synthetic earlier generation', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'a1-prior-'));
    try {
      mkdirSync(join(scratch, 'docs/evaluation/corpus'), { recursive: true });
      writeFileSync(
        join(scratch, 'docs/evaluation/corpus/FRAME_V2_GEN0.json'),
        JSON.stringify({
          generationId: 'METHODOLOGY_V2_GEN0',
          entries: [
            { echeRowKey: 'USED|1', included: true },
            { echeRowKey: 'REJECTED|2', included: false },
          ],
        }),
        'utf8',
      );
      const prior = readPriorGenerationExclusion(scratch, GENERATION_ID);
      expect([...prior.echeRowKeys]).toEqual(['USED|1']);
      expect(prior.priorGenerationIds).toEqual(['METHODOLOGY_V2_GEN0']);
      expect(prior.scannedArtifacts).toEqual(['docs/evaluation/corpus/FRAME_V2_GEN0.json']);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it('never excludes on the strength of the CURRENT generation, so re-running A1 cannot empty its own frame', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'a1-self-'));
    try {
      mkdirSync(join(scratch, 'docs/evaluation/corpus'), { recursive: true });
      writeFileSync(
        join(scratch, 'docs/evaluation/corpus/FRAME_V2_GEN1.json'),
        JSON.stringify({
          generationId: GENERATION_ID,
          entries: [{ echeRowKey: 'SELF|1', included: true }],
        }),
        'utf8',
      );
      expect(readPriorGenerationExclusion(scratch, GENERATION_ID).echeRowKeys.size).toBe(0);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it('returns the empty set when no corpus directory exists at all', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'a1-none-'));
    try {
      expect(readPriorGenerationExclusion(scratch, GENERATION_ID).echeRowKeys.size).toBe(0);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});

describe('2D-A1: a revoked promotion is not a live root authority', () => {
  it('the eligibility snapshot records the revoked flag, and a revoked promotion confers no authority', () => {
    const live: EligibilityPromotionRow = {
      promotion_id: 'p-live',
      eche_row_key: 'A|1',
      redirect_observation_id: 'r1',
      revoked: false,
    };
    const revoked: EligibilityPromotionRow = { ...live, promotion_id: 'p-dead', revoked: true };

    // The reader drops revoked promotions before they ever become authorities.
    const authorities = [live, revoked]
      .filter((row) => !row.revoked)
      .map<RootAuthority>((row) => ({
        type: 'ROOT_PROMOTION',
        id: row.promotion_id,
        sourceLabel: 'promotion',
      }));
    expect(authorities).toHaveLength(1);

    const entry = judge(authorities);
    expect(entry.included).toBe(true);
    expect(entry.rootAuthorityId).toBe('p-live');

    // And an organisation whose ONLY promotion is revoked has no authority.
    expect(judge([]).reason).toBe('EXCLUDED_NO_VALID_ROOT_AUTHORITY');
    expect(hashPromotionEligibilitySnapshot([live, revoked])).not.toBe(
      hashPromotionEligibilitySnapshot([live, { ...revoked, revoked: false }]),
    );
  });

  it('the promotion snapshot hash is order-independent', () => {
    const rows: EligibilityPromotionRow[] = [
      { promotion_id: 'p2', eche_row_key: 'B|2', redirect_observation_id: 'r2', revoked: false },
      { promotion_id: 'p1', eche_row_key: 'A|1', redirect_observation_id: 'r1', revoked: true },
    ];
    expect(hashPromotionEligibilitySnapshot(rows)).toBe(
      hashPromotionEligibilitySnapshot([...rows].reverse()),
    );
  });
});

describe('2D-A1: ECHE_WEBSITE_CLAIM_ELIGIBILITY_SNAPSHOT_V1', () => {
  const rows: EligibilityClaimRow[] = [
    {
      id: 'c3',
      eche_row_key: 'B|2',
      organisation_id: 'o2',
      source_kind: 'ECHE_PUBLISHED',
      structural_status: 'ABSENT',
      rule_version: 'website-parse-v1',
      source_artifact_sha256: 'sha',
    },
    {
      id: 'c1',
      eche_row_key: 'A|1',
      organisation_id: null,
      source_kind: 'ECHE_PUBLISHED',
      structural_status: 'STRUCTURALLY_VALID',
      rule_version: 'website-parse-v1',
      source_artifact_sha256: 'sha',
    },
    {
      id: 'c2',
      eche_row_key: 'A|1',
      organisation_id: 'o1',
      source_kind: 'FR_OFFICIAL',
      structural_status: 'STRUCTURALLY_VALID',
      rule_version: 'website-parse-v1',
      source_artifact_sha256: 'sha',
    },
  ];

  it('is order-independent: reordering the rows does not change the hash', () => {
    const forwards = hashClaimEligibilitySnapshot(rows);
    expect(hashClaimEligibilitySnapshot([...rows].reverse())).toBe(forwards);
    expect(hashClaimEligibilitySnapshot([rows[1]!, rows[0]!, rows[2]!])).toBe(forwards);
  });

  it('sorts by (eche_row_key, source_kind, id), which is a total order because id is unique', () => {
    expect(sortEligibilityClaimRows(rows).map((row) => row.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('names its own semantics and field order inside the hashed bytes', () => {
    const serialised = serialiseClaimEligibilitySnapshot(rows);
    const lines = serialised.split('\n');
    expect(lines[0]).toBe(CLAIM_SNAPSHOT_SEMANTICS);
    expect(lines[0]).not.toContain('website_source_snapshots');
    expect(lines[1]).toBe(
      'id\teche_row_key\torganisation_id\tsource_kind\tstructural_status\trule_version\tsource_artifact_sha256',
    );
  });

  it('renders NULL explicitly, and never as an empty string', () => {
    const serialised = serialiseClaimEligibilitySnapshot([rows[1]!]);
    expect(serialised).toContain('null');
    expect(hashClaimEligibilitySnapshot([rows[1]!])).not.toBe(
      hashClaimEligibilitySnapshot([{ ...rows[1]!, organisation_id: '' }]),
    );
  });

  it('changes when any eligibility-bearing field changes', () => {
    const base = hashClaimEligibilitySnapshot(rows);
    const fields: (keyof EligibilityClaimRow)[] = [
      'id',
      'eche_row_key',
      'organisation_id',
      'source_kind',
      'structural_status',
      'rule_version',
      'source_artifact_sha256',
    ];
    for (const field of fields) {
      const mutated = rows.map((row, index) =>
        index === 0 ? { ...row, [field]: `${String(row[field])}-changed` } : row,
      );
      expect(hashClaimEligibilitySnapshot(mutated), field).not.toBe(base);
    }
  });

  it('hashes the empty set to a stable value rather than refusing it', () => {
    expect(hashClaimEligibilitySnapshot([])).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPromotionEligibilitySnapshot([])).toMatch(/^[0-9a-f]{64}$/);
    expect(hashClaimEligibilitySnapshot([])).not.toBe(hashPromotionEligibilitySnapshot([]));
  });
});

describe('2D-A1: the frame hash and the artifact file hash are different things', () => {
  const input: BuildFrameArtifactInput = {
    provenance: {
      generationId: GENERATION_ID,
      examinedPopulationDefinition: 'test',
      historicalDevelopmentSourcePath: HISTORICAL_DEVELOPMENT_CORPUS_PATH,
      historicalDevelopmentItemCount: 49,
      historicalDevelopmentOrganisationIds: ['a', 'b'],
      priorGenerationIds: [],
      priorGenerationArtifacts: [],
    },
    sourceIdentity: {
      echeArtifactSha256: 'eche',
      echeArtifactBytes: 1,
      sourceManifestSha256: 'manifest',
      sourceManifestBytes: 2,
      ingestRunIds: ['run-a', 'run-b'],
      claimSnapshotSha256: 'claims',
      promotionSnapshotSha256: 'promotions',
      claimRuleVersion: 'website-parse-v1',
      claimSourceKind: 'ECHE_PUBLISHED',
      databaseSchemaVersion: '0001..0011',
    },
    counts: {
      examinedOrganisationCount: 1,
      eligibleOrganisationCount: 1,
      excludedOrganisationCount: 0,
      excludedHistoricalDevelopmentCount: 0,
      excludedPriorGenerationCount: 0,
      noValidAuthorityCount: 0,
    },
    entries: [judge([CLAIM])],
    rootAuthorityDistribution: { totalRootAuthorities: 1 },
  };

  it('is deterministic: the same input produces the same frameHash', () => {
    expect(buildFrameArtifact(input).frameHash).toBe(buildFrameArtifact(input).frameHash);
    expect(buildFrameArtifact(input).frameHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('excludes the frameHash field from its own coverage, and round-trips through the file', async () => {
    const artifact = buildFrameArtifact(input);
    expect(computeFrameHash(buildFramePayload(input))).toBe(artifact.frameHash);
    const reparsed = JSON.parse(await renderFrameArtifact(artifact));
    expect(recomputeFrameHash(reparsed)).toBe(artifact.frameHash);
  });

  it('changes when any entry changes', () => {
    const mutated: BuildFrameArtifactInput = {
      ...input,
      entries: [{ ...input.entries[0]!, included: false }],
    };
    expect(buildFrameArtifact(mutated).frameHash).not.toBe(buildFrameArtifact(input).frameHash);
  });

  it('is stable under reformatting, while the file hash is not - which is why they are reported apart', async () => {
    const artifact = buildFrameArtifact(input);
    const pretty = await renderFrameArtifact(artifact);
    const compact = JSON.stringify(artifact);
    expect(recomputeFrameHash(JSON.parse(pretty))).toBe(recomputeFrameHash(JSON.parse(compact)));
    expect(pretty).not.toBe(compact);
  });

  it('is invariant to the order the payload keys happen to be built in', () => {
    const artifact = buildFrameArtifact(input);
    const shuffled = Object.fromEntries(
      Object.entries(artifact as unknown as Record<string, unknown>).reverse(),
    );
    expect(recomputeFrameHash(shuffled as never)).toBe(artifact.frameHash);
  });
});

describe('2D-A1: the post-A0 state gate', () => {
  function inputs(overrides: Partial<FrameInputs> = {}): FrameInputs {
    return {
      organisations: [],
      claimRows: Array.from({ length: 5832 }, (_unused, index) => ({
        id: `c${index}`,
        eche_row_key: `K|${index}`,
        organisation_id: `o${index}`,
        source_kind: 'ECHE_PUBLISHED',
        structural_status: 'STRUCTURALLY_VALID',
        rule_version: 'website-parse-v1',
        source_artifact_sha256: '32e1de188c7a9395c80b8d4cb80f5746a3306f2d45638de241734045932fdee9',
      })),
      promotionRows: [],
      ingestRuns: [1, 2].map((n) => ({
        id: `run-${n}`,
        sourceSystem: 'eche',
        sourceInputKind: 'operator_file',
        sourceFileSha256: '32e1de188c7a9395c80b8d4cb80f5746a3306f2d45638de241734045932fdee9',
        sourceFileBytes: '873111',
        status: 'succeeded',
        startedAt: '2026-09-18T13:35:12.631Z',
      })),
      claimRuleVersions: ['website-parse-v1'],
      claimSourceKinds: ['ECHE_PUBLISHED'],
      tableCounts: Object.entries(EXPECTED_POST_A0_TABLE_COUNTS).map(([table, count]) => ({
        table,
        count,
      })),
      ...overrides,
    };
  }

  it('accepts the exact post-A0 snapshot', () => {
    expect(() => verifyPostA0State(inputs())).not.toThrow();
  });

  it('STOPS when a table count has moved', () => {
    expect(() =>
      verifyPostA0State(
        inputs({
          tableCounts: Object.entries(EXPECTED_POST_A0_TABLE_COUNTS).map(([table, count]) => ({
            table,
            count: table === 'orgunit_fetch_observations' ? 1 : count,
          })),
        }),
      ),
    ).toThrow(/STOP: orgunit_fetch_observations/);
  });

  it('STOPS when an ingest run refers to a different artifact', () => {
    const base = inputs();
    expect(() =>
      verifyPostA0State({
        ...base,
        ingestRuns: [base.ingestRuns[0]!, { ...base.ingestRuns[1]!, sourceFileSha256: 'other' }],
      }),
    ).toThrow(/not the A0 ECHE artifact/);
  });

  it('STOPS when a claim was read from a different artifact', () => {
    const base = inputs();
    expect(() =>
      verifyPostA0State({
        ...base,
        claimRows: [
          { ...base.claimRows[0]!, source_artifact_sha256: 'other' },
          ...base.claimRows.slice(1),
        ],
      }),
    ).toThrow(/not the A0 ECHE artifact/);
  });

  it('STOPS when the structurally-valid claim count has moved', () => {
    const base = inputs();
    expect(() => verifyPostA0State({ ...base, claimRows: base.claimRows.slice(0, 10) })).toThrow(
      /STRUCTURALLY_VALID claims, expected 5832/,
    );
  });

  it('names every table it verifies, so a new table shows up as a missing name in review', () => {
    expect([...VERIFIED_TABLES].sort()).toEqual(Object.keys(EXPECTED_POST_A0_TABLE_COUNTS).sort());
  });
});

describe('2D-A1: the frozen schema version matches the committed migrations', () => {
  it('declares exactly the migration range present in migrations/, with no privilege needed to check it', () => {
    const versions = readdirSync(join(REPO_ROOT, 'migrations'))
      .filter((name) => name.endsWith('.sql'))
      .map((name) => name.slice(0, 4))
      .sort();
    expect(versions.length).toBeGreaterThan(0);
    expect(DATABASE_SCHEMA_VERSION_RANGE).toBe(`${versions[0]}..${versions[versions.length - 1]}`);
  });
});

describe('2D-A1: the A1b sufficiency threshold is stated, not applied', () => {
  it('is 110 selection + 40 reserve', () => {
    expect(A1B_MINIMUM_ELIGIBLE_ORGANISATIONS).toBe(150);
  });

  it('counts authorities without ever ordering organisations by one', () => {
    const distribution = rootAuthorityDistribution([
      judge([CLAIM]),
      judge([CLAIM, PROMOTION]),
      judge([]),
    ]);
    expect(distribution).toEqual({
      organisationsWithZeroAuthorities: 1,
      organisationsWithExactlyOneAuthority: 1,
      organisationsWithMoreThanOneAuthority: 1,
      totalRootAuthorities: 3,
      totalWebsiteClaimAuthorities: 2,
      totalRootPromotionAuthorities: 1,
    });
  });
});

describe('2D-A1: buildFrameFromInputs ties it together without touching a database', () => {
  it('builds a complete, reconciled artifact from in-memory inputs alone', () => {
    const historical = readHistoricalDevelopmentExclusion(REPO_ROOT);
    const [firstHistorical] = [...historical.echeRowKeys].sort();

    const claimRows: EligibilityClaimRow[] = Array.from({ length: 5832 }, (_unused, index) => ({
      id: `c${index}`,
      eche_row_key: index === 0 ? firstHistorical! : `K|${index}`,
      organisation_id: `o${index}`,
      source_kind: 'ECHE_PUBLISHED',
      structural_status: 'STRUCTURALLY_VALID',
      rule_version: 'website-parse-v1',
      source_artifact_sha256: '32e1de188c7a9395c80b8d4cb80f5746a3306f2d45638de241734045932fdee9',
    }));

    const inputs: FrameInputs = {
      organisations: claimRows.map((row) => ({
        echeRowKey: row.eche_row_key,
        organisationId: row.organisation_id!,
        rootAuthorities: [
          { type: 'WEBSITE_CLAIM', id: row.id, sourceLabel: `claim:${row.source_kind}` },
        ],
      })),
      claimRows,
      promotionRows: [],
      ingestRuns: [1, 2].map((n) => ({
        id: `run-${n}`,
        sourceSystem: 'eche',
        sourceInputKind: 'operator_file',
        sourceFileSha256: '32e1de188c7a9395c80b8d4cb80f5746a3306f2d45638de241734045932fdee9',
        sourceFileBytes: '873111',
        status: 'succeeded',
        startedAt: '2026-09-18T13:35:12.631Z',
      })),
      claimRuleVersions: ['website-parse-v1'],
      claimSourceKinds: ['ECHE_PUBLISHED'],
      tableCounts: Object.entries(EXPECTED_POST_A0_TABLE_COUNTS).map(([table, count]) => ({
        table,
        count,
      })),
    };

    const artifact = buildFrameFromInputs(REPO_ROOT, inputs);
    expect(artifact.generationId).toBe(GENERATION_ID);
    expect(artifact.counts.examinedOrganisationCount).toBe(5832);
    expect(artifact.counts.excludedHistoricalDevelopmentCount).toBe(1);
    expect(artifact.counts.eligibleOrganisationCount).toBe(5831);
    expect(() => reconcileCounts(artifact.entries, artifact.counts)).not.toThrow();
    expect(countFrame(artifact.entries)).toEqual(artifact.counts);
    expect(recomputeFrameHash(artifact)).toBe(artifact.frameHash);
  });
});
