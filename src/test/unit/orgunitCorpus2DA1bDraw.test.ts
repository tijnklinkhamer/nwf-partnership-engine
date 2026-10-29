/**
 * PHASE 2B-2D A1b — THE DETERMINISTIC 110 + 40 DRAW.
 *
 * What this file proves about the SD2 implementation:
 *
 *   - the rank key is SHA-256 of the EXACT UTF-8 echeRowKey bytes, with no
 *     trim, no case fold, no locale transform, no Unicode normalization, no
 *     prefix and no salt - each asserted against a key shaped to expose it;
 *   - the sort is lower-case hex ascending by plain comparison, and is
 *     invariant under any permutation of the input;
 *   - the selection is exactly the first 110 and the reserve exactly the next
 *     40, nothing at rank position >= 150 enters either, and the two are
 *     disjoint;
 *   - the split cycle is value-identical to the frozen R3 and Plan V1 bytes,
 *     and five repetitions produce exactly 20 / 45 / 45;
 *   - a reserve entry carries no split, no inherited selection index and no
 *     replacement reason;
 *   - root-authority identifiers survive byte-for-byte from the frame, and no
 *     module derives a URL from one;
 *   - a duplicate key, a duplicate organisation id, a missing authority, a
 *     moved hash and a rank-hash collision each REFUSE rather than repair;
 *   - the artifact bytes are deterministic, and drawHash and
 *     artifactFileSha256 are different values computed over different things.
 *
 * The real frozen frame is used where the assertion is about the real draw;
 * synthetic fixtures are used where the assertion is about a refusal that the
 * real, valid frame cannot produce.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ACQUISITION_RESERVE_ORGANISATIONS,
  ACQUISITION_TARGET_ORGANISATIONS,
  EXACT_REALISED_SPLIT_COUNTS,
  EXPECTED_ELIGIBLE_ORGANISATIONS,
  FRAME_ARTIFACT_PATH,
  RANK_ALGORITHM_ID,
  SPLIT_ASSIGNMENT_CYCLE_LENGTH,
  SPLIT_ASSIGNMENT_CYCLE_REPETITIONS,
  SPLIT_ASSIGNMENT_CYCLE_V2_R2,
  SPLITS,
  type Split,
} from '../harness/phase2b2d/draw/drawContract.js';
import {
  assertRankKeysAreUnambiguous,
  DrawStop,
  drawSelectionAndReserve,
  rankEligible,
  rankHashOf,
  reconcileDraw,
  splitForSelectionIndex,
} from '../harness/phase2b2d/draw/deterministicDraw.js';
import {
  buildDrawArtifact,
  buildDrawPayload,
  computeDrawHash,
  drawRootAuthorityDistribution,
  recomputeDrawHash,
  renderDrawArtifact,
  type DrawArtifact,
} from '../harness/phase2b2d/draw/drawArtifact.js';
import {
  DrawInputStop,
  projectEligibleEntries,
  readFrozenFrame,
  verifyFrameIdentity,
  type EligibleOrganisation,
} from '../harness/phase2b2d/draw/readFrozenFrame.js';
import { buildDrawFromFrame } from '../harness/phase2b2d/draw/materialiseDraw.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** The one real input, read once and shared: it is 3.5 MB. */
const FRAME = readFrozenFrame(REPO_ROOT);

/** The one real draw, computed once from that frame. */
const REAL = buildDrawFromFrame(FRAME);

function organisation(
  echeRowKey: string,
  overrides: Partial<EligibleOrganisation> = {},
): EligibleOrganisation {
  const digest = createHash('sha256').update(echeRowKey, 'utf8').digest('hex');
  return {
    echeRowKey,
    organisationId: `${digest.slice(0, 8)}-0000-4000-8000-${digest.slice(0, 12)}`,
    rootAuthorityCount: 1,
    rootAuthorities: [{ type: 'WEBSITE_CLAIM', id: `claim-${digest.slice(0, 12)}` }],
    ...overrides,
  };
}

/** A synthetic eligible population large enough for a full 110 + 40 draw. */
function population(size: number): EligibleOrganisation[] {
  return Array.from({ length: size }, (_, index) =>
    organisation(`X SYNTH${index}|${900000 + index}`),
  );
}

interface SyntheticFrameEntry {
  echeRowKey: string;
  organisationId: string;
  included: boolean;
  rootAuthorityCount: number;
  rootAuthorities: unknown[];
}

/**
 * A frame-shaped object that passes the CONTENT gate, for exercising the
 * per-entry refusals.
 *
 * It deliberately carries the real frozen `generationId`, `frameHash` and
 * declared eligible count, because `projectEligibleEntries` is the content
 * gate and those are its preconditions. The FILE gate is a separate function
 * with its own test above, driven by the real 3.5 MB bytes - so nothing here
 * bypasses a check that the real path applies.
 */
function syntheticFrame(eligibleCount: number): {
  generationId: string;
  frameHash: string;
  counts: { eligibleOrganisationCount: number };
  entries: SyntheticFrameEntry[];
} {
  return {
    generationId: 'METHODOLOGY_V2_GEN1',
    frameHash: FRAME.frameHash,
    counts: { eligibleOrganisationCount: EXPECTED_ELIGIBLE_ORGANISATIONS },
    entries: Array.from({ length: eligibleCount }, (_, index) => {
      const base = organisation(`S SYNTH${index}|${800000 + index}`);
      return {
        echeRowKey: base.echeRowKey,
        organisationId: base.organisationId,
        included: true,
        rootAuthorityCount: 1,
        rootAuthorities: [`WEBSITE_CLAIM:${base.rootAuthorities[0]!.id}`],
      };
    }),
  };
}

describe('2D-A1b: the rank key is sha256 of the EXACT UTF-8 eche_row_key bytes', () => {
  it('matches an independently computed SHA-256 of the raw string', () => {
    for (const key of ['A BADEN01|948821603', 'F PARIS001|999999999', ' leading', 'trailing ']) {
      expect(rankHashOf(key)).toBe(createHash('sha256').update(key, 'utf8').digest('hex'));
    }
  });

  it('renders 64 lower-case hexadecimal characters', () => {
    for (const entry of REAL.selection) {
      expect(entry.rankHash).toMatch(/^[0-9a-f]{64}$/);
    }
    for (const entry of REAL.reserve) {
      expect(entry.rankHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('does NOT trim: a key with surrounding whitespace hashes differently', () => {
    expect(rankHashOf(' A BADEN01|948821603 ')).not.toBe(rankHashOf('A BADEN01|948821603'));
    expect(rankHashOf('A BADEN01|948821603\n')).not.toBe(rankHashOf('A BADEN01|948821603'));
  });

  it('does NOT lower-case or upper-case', () => {
    const mixed = 'F Paris001|1';
    expect(rankHashOf(mixed.toLowerCase())).not.toBe(rankHashOf(mixed));
    expect(rankHashOf(mixed.toUpperCase())).not.toBe(rankHashOf(mixed));
    expect(rankHashOf('a baden01|948821603')).not.toBe(rankHashOf('A BADEN01|948821603'));
  });

  it('does NOT Unicode-normalize: NFC and NFD forms of one key hash apart', () => {
    // U+00C9 vs U+0045 U+0301 - one character, two encodings that RENDER
    // IDENTICALLY. Built from code points rather than typed as literals, for
    // the same reason `normaliseErasmusCode` declares U+00A0 that way: a test
    // whose whole point is a byte difference must not hide that difference in
    // two source lines that look the same.
    const composed = `FR ${String.fromCharCode(0x00c9)}COLE01|1`;
    const decomposed = `FR E${String.fromCharCode(0x0301)}COLE01|1`;
    expect(composed).not.toBe(decomposed);
    expect(composed.normalize('NFD')).toBe(decomposed);
    expect(decomposed.normalize('NFC')).toBe(composed);
    expect(rankHashOf(composed)).not.toBe(rankHashOf(decomposed));
  });

  it('does NOT prefix or salt: the digest is of the key alone', () => {
    const key = 'A BADEN01|948821603';
    expect(rankHashOf(key)).not.toBe(
      createHash('sha256').update(`rank:${key}`, 'utf8').digest('hex'),
    );
    expect(rankHashOf(key)).not.toBe(
      createHash('sha256').update(`${key}METHODOLOGY_V2_GEN1`, 'utf8').digest('hex'),
    );
  });

  it('does NOT apply a locale transform: a Turkish dotless i survives as written', () => {
    // `'I'.toLocaleLowerCase('tr')` is U+0131, not 'i'. If any locale-aware
    // fold ran over the key, these two distinct keys could collapse onto one
    // hash - and two organisations would contend for one rank position.
    const dotted = 'TR ISTANBUL01|1';
    const dotless = `TR ${String.fromCharCode(0x0131)}STANBUL01|1`;
    expect(dotted).not.toBe(dotless);
    expect(dotted.toLocaleLowerCase('tr')).toBe(dotless.toLocaleLowerCase('tr'));
    expect(rankHashOf(dotted)).not.toBe(rankHashOf(dotless));
  });

  it('names the algorithm it implements, so a reader checks rather than infers', () => {
    expect(RANK_ALGORITHM_ID).toBe('SHA256_EXACT_UTF8_ECHE_ROW_KEY_ASC_V1');
  });
});

describe('2D-A1b: the sort is ascending hex, and nothing about it is locale-aware', () => {
  it('ranks ascending by rankHash across the whole real eligible set', () => {
    const ranked = rankEligible(FRAME.eligible);
    for (let index = 1; index < ranked.length; index += 1) {
      expect(ranked[index - 1]!.rankHash < ranked[index]!.rankHash).toBe(true);
    }
  });

  it('assigns rank positions 0..n-1 with no gap', () => {
    const ranked = rankEligible(population(200));
    expect(ranked.map((entry) => entry.rankPosition)).toEqual(
      Array.from({ length: 200 }, (_, index) => index),
    );
  });

  it('is invariant under permutation of the input - reversed', () => {
    const forward = drawSelectionAndReserve(FRAME.eligible);
    const reversed = drawSelectionAndReserve([...FRAME.eligible].reverse());
    expect(reversed.selection).toEqual(forward.selection);
    expect(reversed.reserve).toEqual(forward.reserve);
  });

  it('is invariant under permutation of the input - sorted by organisationId', () => {
    const permuted = [...FRAME.eligible].sort((a, b) =>
      a.organisationId < b.organisationId ? -1 : a.organisationId > b.organisationId ? 1 : 0,
    );
    const draw = drawSelectionAndReserve(permuted);
    expect(draw.selection).toEqual(REAL.selection);
    expect(draw.reserve).toEqual(REAL.reserve);
  });

  it('does not mutate the caller’s array', () => {
    const input = population(200);
    const before = input.map((entry) => entry.echeRowKey);
    drawSelectionAndReserve(input);
    expect(input.map((entry) => entry.echeRowKey)).toEqual(before);
  });
});

describe('2D-A1b: exactly the first 110 and the next 40', () => {
  it('selects 110 and reserves 40', () => {
    expect(REAL.selection).toHaveLength(ACQUISITION_TARGET_ORGANISATIONS);
    expect(REAL.reserve).toHaveLength(ACQUISITION_RESERVE_ORGANISATIONS);
    expect(ACQUISITION_TARGET_ORGANISATIONS).toBe(110);
    expect(ACQUISITION_RESERVE_ORGANISATIONS).toBe(40);
  });

  it('selection indices are exactly 0..109 and reserve positions exactly 0..39', () => {
    expect(REAL.selection.map((entry) => entry.selectionIndex)).toEqual(
      Array.from({ length: 110 }, (_, index) => index),
    );
    expect(REAL.reserve.map((entry) => entry.reserveRankPosition)).toEqual(
      Array.from({ length: 40 }, (_, index) => index),
    );
  });

  it('the drawn 150 are exactly rank positions 0..149, and nothing at 150 or beyond enters', () => {
    const ranked = rankEligible(FRAME.eligible);
    const drawnKeys = [...REAL.selection, ...REAL.reserve].map((entry) => entry.echeRowKey);
    expect(drawnKeys).toEqual(ranked.slice(0, 150).map((entry) => entry.echeRowKey));

    const undrawn = new Set(ranked.slice(150).map((entry) => entry.echeRowKey));
    for (const key of drawnKeys) {
      expect(undrawn.has(key), `${key} is at rank >= 150`).toBe(false);
    }
    expect(undrawn.size).toBe(EXPECTED_ELIGIBLE_ORGANISATIONS - 150);
  });

  it('selection and reserve are disjoint on every identity they carry', () => {
    const selectedKeys = new Set(REAL.selection.map((entry) => entry.echeRowKey));
    const selectedIds = new Set(REAL.selection.map((entry) => entry.organisationId));
    const selectedHashes = new Set(REAL.selection.map((entry) => entry.rankHash));
    for (const entry of REAL.reserve) {
      expect(selectedKeys.has(entry.echeRowKey)).toBe(false);
      expect(selectedIds.has(entry.organisationId)).toBe(false);
      expect(selectedHashes.has(entry.rankHash)).toBe(false);
    }
  });

  it('every reserve hash sorts strictly after every selection hash', () => {
    const lastSelected = REAL.selection[REAL.selection.length - 1]!.rankHash;
    for (const entry of REAL.reserve) {
      expect(entry.rankHash > lastSelected).toBe(true);
    }
  });

  it('all 150 echeRowKeys, organisationIds and rankHashes are unique', () => {
    const all = [...REAL.selection, ...REAL.reserve];
    expect(new Set(all.map((entry) => entry.echeRowKey)).size).toBe(150);
    expect(new Set(all.map((entry) => entry.organisationId)).size).toBe(150);
    expect(new Set(all.map((entry) => entry.rankHash)).size).toBe(150);
  });
});

describe('2D-A1b: the split cycle is the frozen one, and 20/45/45 is structural', () => {
  function cycleFrom(path: string, pick: (parsed: Record<string, unknown>) => unknown): unknown {
    return pick(JSON.parse(readFileSync(join(REPO_ROOT, path), 'utf8')) as Record<string, unknown>);
  }

  it('is value-identical to SPLIT_ASSIGNMENT_CYCLE_V2_R2 in the frozen R3 bytes', () => {
    const r3 = cycleFrom(
      'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL_R3.json',
      (parsed) => {
        const section = parsed.sectionE_samplingContract as { rules: Record<string, unknown>[] };
        return section.rules.find((rule) => rule.id === 'SD2')!.cycle;
      },
    );
    expect(SPLIT_ASSIGNMENT_CYCLE_V2_R2).toEqual(r3);
  });

  it('is value-identical to SPLIT_ASSIGNMENT_CYCLE_V2_R2 in the approved Plan V1 bytes', () => {
    const plan = cycleFrom(
      'docs/evaluation/PHASE_2B_2D_METHODOLOGY_V2_CORPUS_ACQUISITION_PLAN_V1.json',
      (parsed) => (parsed.SD2_draw as Record<string, unknown>).SPLIT_ASSIGNMENT_CYCLE_V2_R2,
    );
    expect(SPLIT_ASSIGNMENT_CYCLE_V2_R2).toEqual(plan);
  });

  it('is 22 long, holds 4 DEV_TRAIN / 9 DEV_CONFIRM / 9 FINAL_HOLDOUT, and names only the three splits', () => {
    expect(SPLIT_ASSIGNMENT_CYCLE_V2_R2).toHaveLength(SPLIT_ASSIGNMENT_CYCLE_LENGTH);
    expect(SPLIT_ASSIGNMENT_CYCLE_LENGTH).toBe(22);
    const counted = { DEV_TRAIN: 0, DEV_CONFIRM: 0, FINAL_HOLDOUT: 0 } as Record<Split, number>;
    for (const split of SPLIT_ASSIGNMENT_CYCLE_V2_R2) {
      expect(SPLITS).toContain(split);
      counted[split] += 1;
    }
    expect(counted).toEqual({ DEV_TRAIN: 4, DEV_CONFIRM: 9, FINAL_HOLDOUT: 9 });
  });

  it('never repeats a split in two consecutive positions, wrapping included', () => {
    for (let index = 0; index < SPLIT_ASSIGNMENT_CYCLE_LENGTH; index += 1) {
      const next = (index + 1) % SPLIT_ASSIGNMENT_CYCLE_LENGTH;
      expect(SPLIT_ASSIGNMENT_CYCLE_V2_R2[index]).not.toBe(SPLIT_ASSIGNMENT_CYCLE_V2_R2[next]);
    }
  });

  it('110 is exactly five repetitions, so no remainder rule is ever needed', () => {
    expect(SPLIT_ASSIGNMENT_CYCLE_LENGTH * SPLIT_ASSIGNMENT_CYCLE_REPETITIONS).toBe(
      ACQUISITION_TARGET_ORGANISATIONS,
    );
    expect(ACQUISITION_TARGET_ORGANISATIONS % SPLIT_ASSIGNMENT_CYCLE_LENGTH).toBe(0);
  });

  it('assigns each selection index straight from the cycle', () => {
    for (const entry of REAL.selection) {
      expect(entry.split).toBe(
        SPLIT_ASSIGNMENT_CYCLE_V2_R2[entry.selectionIndex % SPLIT_ASSIGNMENT_CYCLE_LENGTH],
      );
      expect(entry.split).toBe(splitForSelectionIndex(entry.selectionIndex));
    }
  });

  it('realises exactly 20 / 45 / 45 on the real draw', () => {
    expect(REAL.counts.splitCounts).toEqual({
      DEV_TRAIN: 20,
      DEV_CONFIRM: 45,
      FINAL_HOLDOUT: 45,
    });
    expect(REAL.counts.splitCounts).toEqual(EXACT_REALISED_SPLIT_COUNTS);
    expect(20 + 45 + 45).toBe(ACQUISITION_TARGET_ORGANISATIONS);
  });

  it('realises 20 / 45 / 45 on any eligible population, because the counts are not a property of the data', () => {
    for (const size of [150, 151, 1000, 5820]) {
      const draw = drawSelectionAndReserve(population(size));
      expect(draw.counts.splitCounts, `size ${size}`).toEqual(EXACT_REALISED_SPLIT_COUNTS);
    }
  });
});

describe('2D-A1b: a reserve entry is not a selection entry with blanks', () => {
  it('carries no split, no selectionIndex and no replacement field', () => {
    for (const entry of REAL.reserve) {
      expect(Object.keys(entry).sort()).toEqual([
        'echeRowKey',
        'organisationId',
        'rankHash',
        'reserveRankPosition',
        'rootAuthorities',
        'rootAuthorityCount',
      ]);
      expect('split' in entry).toBe(false);
      expect('selectionIndex' in entry).toBe(false);
      expect('replacementReason' in entry).toBe(false);
      expect('inheritedSelectionIndex' in entry).toBe(false);
    }
  });

  it('refuses a reserve entry that carries a replacement-shaped field at runtime', () => {
    const contaminated = REAL.reserve.map((entry, index) =>
      index === 3 ? { ...entry, split: 'FINAL_HOLDOUT' } : entry,
    );
    expect(() =>
      reconcileDraw({
        selection: REAL.selection,
        reserve: contaminated,
        counts: REAL.counts,
      }),
    ).toThrow(/replacement-shaped field/);
  });
});

describe('2D-A1b: root-authority identifiers survive byte-for-byte, and become no URL', () => {
  it('every drawn organisation carries at least one authority', () => {
    for (const entry of [...REAL.selection, ...REAL.reserve]) {
      expect(entry.rootAuthorityCount).toBeGreaterThanOrEqual(1);
      expect(entry.rootAuthorities).toHaveLength(entry.rootAuthorityCount);
    }
  });

  it('each identifier equals the frame’s own `TYPE:id` token, split at the first colon only', () => {
    const frameEntries = new Map(FRAME.eligible.map((entry) => [entry.echeRowKey, entry]));
    for (const entry of [...REAL.selection, ...REAL.reserve]) {
      const source = frameEntries.get(entry.echeRowKey)!;
      expect(entry.rootAuthorities).toEqual(source.rootAuthorities);
    }
  });

  it('preserves an identifier that itself contains a colon', () => {
    const draw = drawSelectionAndReserve(
      population(150).map((entry, index) =>
        index === 0
          ? {
              ...entry,
              rootAuthorities: [{ type: 'WEBSITE_CLAIM' as const, id: 'a:b:c' }],
            }
          : entry,
      ),
    );
    const all = [...draw.selection, ...draw.reserve];
    const carried = all.flatMap((entry) => entry.rootAuthorities).filter((a) => a.id.includes(':'));
    expect(carried).toEqual([{ type: 'WEBSITE_CLAIM', id: 'a:b:c' }]);
  });

  it('no entry carries a URL, hostname, domain, title or anything requestable', () => {
    const serialised = JSON.stringify([...REAL.selection, ...REAL.reserve]);
    expect(/https?:\/\//.test(serialised)).toBe(false);
    expect(/\bwww\./.test(serialised)).toBe(false);
    expect(/sitemap|robots\.txt/i.test(serialised)).toBe(false);
    for (const forbidden of ['url', 'hostname', 'domain', 'website', 'title', 'name']) {
      expect(new RegExp(`"\\w*${forbidden}\\w*"\\s*:`, 'i').test(serialised), forbidden).toBe(
        false,
      );
    }
  });

  it('the authority distribution over the drawn 150 reconciles', () => {
    const distribution = drawRootAuthorityDistribution(REAL.selection, REAL.reserve);
    expect(distribution.drawnOrganisations).toBe(150);
    expect(distribution.organisationsWithZeroAuthorities).toBe(0);
    expect(
      distribution.organisationsWithExactlyOneAuthority +
        distribution.organisationsWithMoreThanOneAuthority,
    ).toBe(150);
    expect(
      distribution.totalWebsiteClaimAuthorities + distribution.totalRootPromotionAuthorities,
    ).toBe(distribution.totalRootAuthorities);
  });
});

describe('2D-A1b: only included frame entries participate', () => {
  it('the reader returns exactly the 5820 included entries, and no excluded one', () => {
    expect(FRAME.eligible).toHaveLength(EXPECTED_ELIGIBLE_ORGANISATIONS);
    const raw = JSON.parse(readFileSync(join(REPO_ROOT, FRAME_ARTIFACT_PATH), 'utf8')) as {
      entries: { echeRowKey: string; included: boolean; reason: string }[];
    };
    const excluded = new Set(
      raw.entries.filter((entry) => !entry.included).map((entry) => entry.echeRowKey),
    );
    expect(excluded.size).toBe(319);
    for (const entry of FRAME.eligible) {
      expect(excluded.has(entry.echeRowKey), `${entry.echeRowKey} is excluded`).toBe(false);
    }
  });

  it('no drawn organisation was excluded as historical DEVELOPMENT, prior generation or authority-less', () => {
    const raw = JSON.parse(readFileSync(join(REPO_ROOT, FRAME_ARTIFACT_PATH), 'utf8')) as {
      entries: { echeRowKey: string; included: boolean; reason: string }[];
    };
    const reasons = new Map(raw.entries.map((entry) => [entry.echeRowKey, entry.reason]));
    const forbidden = [
      'EXCLUDED_HISTORICAL_DEVELOPMENT',
      'EXCLUDED_PRIOR_METHODOLOGY_GENERATION',
      'EXCLUDED_NO_VALID_ROOT_AUTHORITY',
    ];
    for (const entry of [...REAL.selection, ...REAL.reserve]) {
      const reason = reasons.get(entry.echeRowKey);
      expect(reason, `${entry.echeRowKey} is not in the frame`).toBeDefined();
      expect(forbidden, `${entry.echeRowKey} carries ${reason}`).not.toContain(reason);
    }
  });

  it('the twelve historical DEVELOPMENT organisations appear nowhere in the draw', () => {
    const raw = JSON.parse(readFileSync(join(REPO_ROOT, FRAME_ARTIFACT_PATH), 'utf8')) as {
      entries: { echeRowKey: string; reason: string }[];
    };
    const historical = raw.entries
      .filter((entry) => entry.reason === 'EXCLUDED_HISTORICAL_DEVELOPMENT')
      .map((entry) => entry.echeRowKey);
    expect(historical).toHaveLength(12);
    const drawn = new Set([...REAL.selection, ...REAL.reserve].map((entry) => entry.echeRowKey));
    for (const key of historical) {
      expect(drawn.has(key)).toBe(false);
    }
  });
});

describe('2D-A1b: the input contract refuses rather than repairs', () => {
  it('requires the exact 5820 eligible count from the real materialiser contract', () => {
    expect(EXPECTED_ELIGIBLE_ORGANISATIONS).toBe(5820);
    expect(FRAME.eligible).toHaveLength(EXPECTED_ELIGIBLE_ORGANISATIONS);
    expect(() => projectEligibleEntries(syntheticFrame(5819))).toThrow(
      /5819 eligible entries read, expected 5820/,
    );
    expect(() => projectEligibleEntries(syntheticFrame(5821))).toThrow(DrawInputStop);
  });

  it('refuses a duplicate echeRowKey', () => {
    const duplicated = population(200);
    duplicated[7] = { ...duplicated[7]!, echeRowKey: duplicated[3]!.echeRowKey };
    expect(() => drawSelectionAndReserve(duplicated)).toThrow(DrawStop);
    expect(() => drawSelectionAndReserve(duplicated)).toThrow(/duplicate echeRowKey/);
  });

  it('refuses a rank-hash collision between two DISTINCT keys, and invents no tie-break', () => {
    // SHA-256 cannot be made to collide on demand, so the pair is handed to
    // the check directly. What is asserted is that the branch exists and
    // refuses - not that SHA-256 collides.
    expect(() =>
      assertRankKeysAreUnambiguous([
        { echeRowKey: 'A ONE|1', rankHash: 'f'.repeat(64) },
        { echeRowKey: 'B TWO|2', rankHash: 'f'.repeat(64) },
      ]),
    ).toThrow(/STOP_FAIL_CLOSED: rank-hash collision/);
  });

  it('distinguishes a collision from a repeated key, because they mean different things', () => {
    expect(() =>
      assertRankKeysAreUnambiguous([
        { echeRowKey: 'A ONE|1', rankHash: 'a'.repeat(64) },
        { echeRowKey: 'A ONE|1', rankHash: 'a'.repeat(64) },
      ]),
    ).toThrow(/duplicate echeRowKey/);
  });

  it('refuses fewer than 150 eligible organisations', () => {
    expect(() => drawSelectionAndReserve(population(149))).toThrow(/SD2 needs 150/);
    expect(() => drawSelectionAndReserve(population(150))).not.toThrow();
  });

  it('refuses a frame whose file bytes have moved by a single character', () => {
    const real = readFileSync(join(REPO_ROOT, FRAME_ARTIFACT_PATH), 'utf8');
    expect(() => verifyFrameIdentity(real)).not.toThrow();
    expect(() => verifyFrameIdentity(`${real} `)).toThrow(/artifactFileSha256 is/);
  });

  it('refuses a frame whose frameHash has moved', () => {
    expect(() => projectEligibleEntries({ ...syntheticFrame(5820), frameHash: 'x' })).toThrow(
      /frameHash is x/,
    );
  });

  it('refuses a frame from a different generation', () => {
    expect(() =>
      projectEligibleEntries({ ...syntheticFrame(5820), generationId: 'METHODOLOGY_V2_GEN2' }),
    ).toThrow(/generationId is METHODOLOGY_V2_GEN2/);
  });

  it('refuses a duplicate echeRowKey anywhere in the EXAMINED population, included or not', () => {
    const frame = syntheticFrame(5820);
    frame.entries.push({ ...frame.entries[0]!, included: false });
    expect(() => projectEligibleEntries(frame)).toThrow(/duplicate echeRowKey/);
  });

  it('refuses a duplicate organisationId among eligible entries', () => {
    const frame = syntheticFrame(5820);
    frame.entries[9] = {
      ...frame.entries[9]!,
      organisationId: frame.entries[2]!.organisationId,
    };
    expect(() => projectEligibleEntries(frame)).toThrow(/duplicate organisationId/);
  });

  it('refuses an eligible entry with no usable root authority metadata', () => {
    const missing = syntheticFrame(5820);
    missing.entries[4] = { ...missing.entries[4]!, rootAuthorityCount: 0, rootAuthorities: [] };
    expect(() => projectEligibleEntries(missing)).toThrow(/has no root authority/);

    const mismatched = syntheticFrame(5820);
    mismatched.entries[4] = { ...mismatched.entries[4]!, rootAuthorityCount: 2 };
    expect(() => projectEligibleEntries(mismatched)).toThrow(
      /declares 2 authorities but carries 1/,
    );
  });

  it('refuses a malformed authority token rather than repairing it', () => {
    for (const token of ['no-colon-here', 'UNKNOWN_TYPE:abc', 'WEBSITE_CLAIM:']) {
      const frame = syntheticFrame(5820);
      frame.entries[1] = { ...frame.entries[1]!, rootAuthorities: [token] };
      expect(() => projectEligibleEntries(frame), token).toThrow(DrawInputStop);
    }
  });

  it('ignores excluded entries entirely, whatever they carry', () => {
    const frame = syntheticFrame(5820);
    frame.entries.push({
      echeRowKey: 'Z EXCLUDED|1',
      organisationId: frame.entries[0]!.organisationId,
      included: false,
      rootAuthorityCount: 0,
      rootAuthorities: [],
    });
    // A malformed EXCLUDED entry is not the draw's business: it never
    // participates, so it is neither validated nor repaired.
    expect(projectEligibleEntries(frame)).toHaveLength(5820);
  });
});

describe('2D-A1b: the artifact is deterministic, and its two hashes are different things', () => {
  const ARTIFACT: DrawArtifact = REAL;

  it('drawHash is SHA-256 over the payload with the drawHash field excluded', () => {
    expect(ARTIFACT.drawHash).toMatch(/^[0-9a-f]{64}$/);
    expect(recomputeDrawHash(ARTIFACT)).toBe(ARTIFACT.drawHash);
    expect(
      computeDrawHash(
        buildDrawPayload({
          generationId: ARTIFACT.generationId,
          counts: ARTIFACT.counts,
          selection: ARTIFACT.selection,
          reserve: ARTIFACT.reserve,
          rootAuthorityDistribution: ARTIFACT.rootAuthorityDistribution,
        }),
      ),
    ).toBe(ARTIFACT.drawHash);
    expect(
      'drawHash' in
        buildDrawPayload({
          generationId: ARTIFACT.generationId,
          counts: ARTIFACT.counts,
          selection: ARTIFACT.selection,
          reserve: ARTIFACT.reserve,
          rootAuthorityDistribution: ARTIFACT.rootAuthorityDistribution,
        }),
    ).toBe(false);
  });

  it('drawHash is stable under key reordering, because the canonicalizer sorts keys', () => {
    const reordered = Object.fromEntries(
      Object.entries(ARTIFACT).sort(([a], [b]) => (a > b ? -1 : 1)),
    ) as unknown as DrawArtifact;
    expect(recomputeDrawHash(reordered)).toBe(ARTIFACT.drawHash);
  });

  it('building the draw twice from the same frame produces identical bytes and hashes', async () => {
    const again = buildDrawFromFrame(FRAME);
    expect(again.drawHash).toBe(ARTIFACT.drawHash);
    expect(await renderDrawArtifact(again)).toBe(await renderDrawArtifact(ARTIFACT));
  });

  it('artifactFileSha256 is a DIFFERENT value from drawHash, over different bytes', async () => {
    const bytes = await renderDrawArtifact(ARTIFACT);
    const fileSha = createHash('sha256').update(bytes, 'utf8').digest('hex');
    expect(fileSha).not.toBe(ARTIFACT.drawHash);
  });

  it('reformatting moves the file hash and NOT the drawHash', async () => {
    const pretty = await renderDrawArtifact(ARTIFACT);
    const compact = JSON.stringify(ARTIFACT);
    expect(createHash('sha256').update(compact, 'utf8').digest('hex')).not.toBe(
      createHash('sha256').update(pretty, 'utf8').digest('hex'),
    );
    expect(recomputeDrawHash(JSON.parse(compact) as DrawArtifact)).toBe(ARTIFACT.drawHash);
    expect(recomputeDrawHash(JSON.parse(pretty) as DrawArtifact)).toBe(ARTIFACT.drawHash);
  });

  it('a single altered entry moves BOTH hashes', async () => {
    const tampered = {
      ...ARTIFACT,
      selection: ARTIFACT.selection.map((entry, index) =>
        index === 0 ? { ...entry, split: 'DEV_CONFIRM' as const } : entry,
      ),
    };
    expect(recomputeDrawHash(tampered)).not.toBe(ARTIFACT.drawHash);
    expect(await renderDrawArtifact(tampered)).not.toBe(await renderDrawArtifact(ARTIFACT));
  });

  it('carries no page, item, gold, document-hash or classifier field anywhere', () => {
    const serialised = JSON.stringify(ARTIFACT);
    for (const forbidden of [
      'pageId',
      'itemId',
      'documentHash',
      'goldLabel',
      'goldClass',
      'classification',
      'classifierOutput',
      'predicted',
      'confidence',
    ]) {
      expect(serialised.includes(`"${forbidden}"`), forbidden).toBe(false);
    }
  });

  it('records the counts it commits to, and they reconcile with the lists', () => {
    expect(ARTIFACT.counts.eligibleInputCount).toBe(EXPECTED_ELIGIBLE_ORGANISATIONS);
    expect(ARTIFACT.counts.selectionCount).toBe(ARTIFACT.selection.length);
    expect(ARTIFACT.counts.reserveCount).toBe(ARTIFACT.reserve.length);
    expect(ARTIFACT.counts.rankedButUndrawnCount).toBe(EXPECTED_ELIGIBLE_ORGANISATIONS - 150);
  });

  it('is built with the frozen generation identity and the bound authorisation', () => {
    expect(ARTIFACT.recordKind).toBe('DRAW_V2_GEN1');
    expect(ARTIFACT.generationId).toBe('METHODOLOGY_V2_GEN1');
    expect(ARTIFACT.boundAuthorisation.ownerDecision).toBe(
      'AUTHORISE_PHASE_2B_2D_A1B_DETERMINISTIC_DRAW_V1',
    );
    for (const flag of [
      'networkAuthorised',
      'databaseReadAuthorised',
      'databaseWriteAuthorised',
      'institutionAcquisitionAuthorised',
      'replacementAuthorised',
      'holdoutExecutionAuthorised',
    ]) {
      expect(ARTIFACT.boundAuthorisation[flag], flag).toBe(false);
    }
  });

  it('binds the exact frame it drew from', () => {
    expect(ARTIFACT.frame.frameHash).toBe(FRAME.frameHash);
    expect(ARTIFACT.frame.artifactFileSha256).toBe(FRAME.artifactFileSha256);
    expect(ARTIFACT.frame.artifactFileBytes).toBe(FRAME.artifactBytes);
  });
});

describe('2D-A1b: a rebuilt artifact equals the committed one, if one is committed', () => {
  const committedPath = join(
    REPO_ROOT,
    'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_DRAW_V2_GEN1.json',
  );

  it('reproduces the committed draw artifact byte for byte', async () => {
    let committed: string;
    try {
      committed = readFileSync(committedPath, 'utf8');
    } catch {
      // Before the real draw is materialised this file does not exist, and the
      // tooling tests above are the whole gate. Afterwards it must reproduce.
      return;
    }
    expect(await renderDrawArtifact(buildDrawFromFrame(readFrozenFrame(REPO_ROOT)))).toBe(
      committed,
    );
    const parsed = JSON.parse(committed) as DrawArtifact;
    expect(recomputeDrawHash(parsed)).toBe(parsed.drawHash);
  });
});

describe('2D-A1b: nothing is consumed, replaced or declared', () => {
  it('the artifact declares no organisation successful or failed', () => {
    const serialised = JSON.stringify(REAL);
    for (const forbidden of [
      'ACQUISITION_SUCCESSFUL',
      'ACQUISITION_UNSUCCESSFUL',
      'acquisitionOutcome',
      'replacedEcheRowKey',
      'replacementEcheRowKey',
      'recordedAtUtc',
    ]) {
      expect(serialised.includes(forbidden), forbidden).toBe(false);
    }
  });

  it('records that no replacement has occurred, and that the reserve is untouched', () => {
    expect(REAL.replacementState.noReplacementHasOccurred).toBe(true);
    expect(REAL.replacementState.noReserveEntryIsConsumed).toBe(true);
    expect(REAL.replacementState.reserveEntriesCarryNoSplit).toBe(true);
    expect(REAL.replacementState.noReplacementLedgerExistsYet).toBe(true);
  });

  it('a draw built from an artifact input is identical to one built from the draw functions', () => {
    const direct = drawSelectionAndReserve(FRAME.eligible);
    const built = buildDrawArtifact({
      generationId: 'METHODOLOGY_V2_GEN1',
      counts: direct.counts,
      selection: direct.selection,
      reserve: direct.reserve,
      rootAuthorityDistribution: drawRootAuthorityDistribution(direct.selection, direct.reserve),
    });
    expect(built.drawHash).toBe(REAL.drawHash);
  });
});
