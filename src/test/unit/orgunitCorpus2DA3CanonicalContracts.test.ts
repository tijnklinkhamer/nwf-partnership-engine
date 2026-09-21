/**
 * PHASE 2B-2D A3 R1 — CANONICAL CONTRACTS AND LEAKAGE-SAFE TYPES.
 *
 * Every frozen value in `a3prep/contracts.ts` is checked against the frozen
 * or owner-approved bytes it claims to come from, not against a second copy
 * typed into this test. Canonical values are checked for IDENTITY with their
 * canonical home. The type-level leakage rules are asserted at compile time
 * (`npm run typecheck` fails if a forbidden field appears) and restated at
 * runtime over the declared interface bodies.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as contracts from '../harness/phase2b2d/a3prep/contracts.js';
import type {
  A3DistinctDocument,
  A3ExternallyResolvedSetRScore,
  A3GatedSplitPublicAggregate,
  A3RankedDocument,
  A3Sd7PageTextInput,
  A3SelectionSlot,
  A3TrackCandidateObservation,
} from '../harness/phase2b2d/a3prep/types.js';
import * as drawContract from '../harness/phase2b2d/draw/drawContract.js';
import * as sd7Contract from '../harness/phase2b2d/sd7/sd7Contract.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const A3PREP_DIR = join(REPO_ROOT, 'src/test/harness/phase2b2d/a3prep');

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(REPO_ROOT, relativePath), 'utf8')) as T;
}

function fileSha256(relativePath: string): string {
  return createHash('sha256')
    .update(readFileSync(join(REPO_ROOT, relativePath)))
    .digest('hex');
}

interface R3Shape {
  sectionE_samplingContract: {
    rules: { id: string; rule: string }[];
    frozenConstantsIndex: Record<string, number>;
  };
  sectionD_D3_corpusOption: {
    perGatedSplitContract: { SET_P: number; SET_R: number; evaluationSetPerGatedSplit: string };
  };
  sectionJ_splits: { splits: { name: string; organisations: number; sealed: boolean }[] };
}

interface PlanApprovalShape {
  boundOwnerClarifications: {
    SET_R: {
      decision: string;
      bindings: {
        setRTargetIsAPlanningExpectationOnly: number;
        maxSetRContributionPerOrganisation: number;
        gatedSplitOrganisations: number;
        impliedStructuralMaximumSetR: number;
      };
    };
  };
  boundCorpusOption: Record<string, unknown>;
}

const r3 = readJson<R3Shape>(contracts.A3_PREP_R1_BOUND_AUTHORITY.methodologyR3Path);
const planApproval = readJson<PlanApprovalShape>(
  contracts.A3_PREP_R1_BOUND_AUTHORITY.corpusPlanApprovalPath,
);

function r3Rule(id: string): string {
  const rule = r3.sectionE_samplingContract.rules.find((candidate) => candidate.id === id);
  if (rule === undefined) throw new Error(`R3 carries no rule ${id}`);
  return rule.rule;
}

// ---------------------------------------------------------------------------
// Compile-time leakage assertions. A forbidden key makes `npm run typecheck`
// fail on the `const` below it; there is no runtime path around them.
// ---------------------------------------------------------------------------

type ContentKeyFragment =
  | 'text'
  | 'Text'
  | 'excerpt'
  | 'Excerpt'
  | 'title'
  | 'Title'
  | 'url'
  | 'Url'
  | 'URL'
  | 'host'
  | 'Host'
  | 'name'
  | 'Name';

type ItemKeyFragment =
  | 'sha256'
  | 'Sha256'
  | 'Id'
  | 'id'
  | 'Index'
  | 'label'
  | 'Label'
  | 'class'
  | 'Class'
  | 'organisationBreakdown'
  | 'perOrganisation'
  | 'PerOrganisation';

type KeysMatching<T, Fragment extends string> = Extract<keyof T, `${string}${Fragment}${string}`>;

type Assert<T extends true> = T;
type HasNone<T, Fragment extends string> = [KeysMatching<T, Fragment>] extends [never]
  ? true
  : false;

// Post-SD7 / distinct / ranked shapes: no text, no URL, no host, no name.
export type DistinctDocumentHasNoContent = Assert<HasNone<A3DistinctDocument, ContentKeyFragment>>;
export type RankedDocumentHasNoContent = Assert<HasNone<A3RankedDocument, ContentKeyFragment>>;
export type SelectionSlotHasNoContent = Assert<HasNone<A3SelectionSlot, ContentKeyFragment>>;
export type CandidateObservationHasNoContent = Assert<
  HasNone<A3TrackCandidateObservation, ContentKeyFragment>
>;
// Gated public aggregate: no content AND no item-level identity of any kind.
export type GatedAggregateHasNoContent = Assert<
  HasNone<A3GatedSplitPublicAggregate, ContentKeyFragment>
>;
export type GatedAggregateHasNoItemIdentity = Assert<
  HasNone<A3GatedSplitPublicAggregate, ItemKeyFragment>
>;
// The gated aggregate cannot be typed to DEV_TRAIN.
export type GatedAggregateExcludesDevTrain = Assert<
  'DEV_TRAIN' extends A3GatedSplitPublicAggregate['split'] ? false : true
>;
// Text lives ONLY on the ephemeral SD7 input, which is marked as such.
export type Sd7InputIsMarkedEphemeral = Assert<
  A3Sd7PageTextInput['processingOnly'] extends 'A3_SD7_EPHEMERAL_TEXT_NEVER_SERIALISE'
    ? true
    : false
>;
// No distinct/ranked shape carries a score; the resolved score requires K1+K2 records.
export type DistinctDocumentHasNoScore = Assert<HasNone<A3DistinctDocument, 'score' | 'Score'>>;
export type RankedDocumentHasNoScore = Assert<HasNone<A3RankedDocument, 'score' | 'Score'>>;
type K1K2RecordKeys =
  'k1TrackReductionDecisionRecordSha256' | 'k2ExactDuplicateDecisionRecordSha256';
export type ResolvedScoreRequiresK1AndK2 = Assert<
  K1K2RecordKeys extends keyof A3ExternallyResolvedSetRScore ? true : false
>;
// No representative row/URL on the distinct document (K2 is open).
export type DistinctDocumentHasNoRepresentative = Assert<
  HasNone<A3DistinctDocument, 'representative' | 'Representative'>
>;

/** The interface body of `name` in a3prep/types.ts, comments stripped. */
function interfaceBody(name: string): string {
  const source = readFileSync(join(A3PREP_DIR, 'types.ts'), 'utf8');
  const match = new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`).exec(source);
  if (match?.[1] === undefined) throw new Error(`types.ts declares no interface ${name}`);
  return match[1].replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function fieldNames(name: string): string[] {
  return [...interfaceBody(name).matchAll(/readonly (\w+)\??:/g)].map((m) => m[1] ?? '');
}

describe('2D-A3 R1: the bound authority is the frozen bytes on disk', () => {
  it('every bound artifact hashes to the canonical value', () => {
    const bound = contracts.A3_PREP_R1_BOUND_AUTHORITY;
    expect(fileSha256(bound.methodologyR3Path)).toBe(bound.methodologyR3Sha256);
    expect(fileSha256(bound.methodologyFreezeApprovalPath)).toBe(
      bound.methodologyFreezeApprovalSha256,
    );
    expect(fileSha256(bound.corpusPlanPath)).toBe(bound.corpusPlanSha256);
    expect(fileSha256(bound.corpusPlanApprovalPath)).toBe(bound.corpusPlanApprovalSha256);
  });

  it('reuses the draw contract’s hashes rather than restating them', () => {
    expect(contracts.A3_PREP_R1_BOUND_AUTHORITY.methodologyR3Sha256).toBe(
      drawContract.METHODOLOGY_R3_SHA256,
    );
    expect(contracts.A3_PREP_R1_BOUND_AUTHORITY.corpusPlanApprovalSha256).toBe(
      drawContract.CORPUS_PLAN_APPROVAL_SHA256,
    );
    const source = readFileSync(join(A3PREP_DIR, 'contracts.ts'), 'utf8');
    expect(source).not.toMatch(/[0-9a-f]{64}/);
  });
});

describe('2D-A3 R1: SD3 frozen facts', () => {
  it('carries the exact salted key prefixes, colon included', () => {
    expect(contracts.SET_P_RANK_KEY_PREFIX).toBe('SET_P_V2_R2:');
    expect(contracts.SET_R_TIE_BREAK_KEY_PREFIX).toBe('SET_R_V2_R2:');
    expect(r3Rule('SD3')).toContain(
      `sha256("${contracts.SET_P_RANK_KEY_PREFIX}" + documentSha256)`,
    );
    expect(r3Rule('SD3')).toContain(
      `sha256("${contracts.SET_R_TIE_BREAK_KEY_PREFIX}" + documentSha256)`,
    );
  });

  it('carries the exact per-organisation caps', () => {
    expect(contracts.SET_P_MAX_PAGES_PER_ORGANISATION).toBe(8);
    expect(contracts.SET_R_MAX_PAGES_PER_ORGANISATION).toBe(4);
    const index = r3.sectionE_samplingContract.frozenConstantsIndex;
    expect(index.SET_P_MAX_PAGES_PER_ORGANISATION).toBe(contracts.SET_P_MAX_PAGES_PER_ORGANISATION);
    expect(index.SET_R_MAX_PAGES_PER_ORGANISATION).toBe(contracts.SET_R_MAX_PAGES_PER_ORGANISATION);
  });

  it('SET_P is ascending and class-unfiltered; SET_R is descending, salted tie-break, candidate-independent, may overlap', () => {
    expect(r3Rule('SD3')).toContain('ascending, with NO class filtering of any kind');
    expect(contracts.SET_P_RANK_ORDER).toBe('SALTED_SHA256_LOWER_HEX_ASCENDING');
    expect(contracts.SET_P_CLASS_FILTERING).toBe('NONE');
    expect(r3Rule('SD3')).toContain('signal score descending');
    expect(contracts.SET_R_PRIMARY_ORDER).toBe('RESOLVED_FROZEN_TRACK_A_B_SIGNAL_SCORE_DESCENDING');
    expect(contracts.SET_R_TIE_BREAK_ORDER).toBe('SALTED_SHA256_LOWER_HEX_ASCENDING');
    expect(contracts.SET_R_IS_CANDIDATE_INDEPENDENT).toBe(true);
    expect(r3Rule('SD3')).toContain('from the same deduplicated pool');
    expect(contracts.SET_R_MAY_OVERLAP_SET_P).toBe(true);
  });

  it('encodes NO Track A/B score reduction anywhere in a3prep', () => {
    for (const file of ['contracts.ts', 'types.ts']) {
      const code = readFileSync(join(A3PREP_DIR, file), 'utf8')
        .replace(/\/\*\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(code, file).not.toMatch(/Math\.(max|min)\s*\(/);
      expect(code, file).not.toMatch(/\breduce\s*\(/);
      expect(code, file).not.toMatch(/parseFloat|Number\s*\(/);
    }
  });
});

describe('2D-A3 R1: split and generation facts are the canonical ones', () => {
  it('20 / 45 / 45, total 110, reserve 40', () => {
    expect(contracts.GENERATION_1_SPLIT_ORGANISATION_COUNTS).toEqual({
      DEV_TRAIN: 20,
      DEV_CONFIRM: 45,
      FINAL_HOLDOUT: 45,
    });
    const total = Object.values(contracts.GENERATION_1_SPLIT_ORGANISATION_COUNTS).reduce(
      (sum, n) => sum + n,
      0,
    );
    expect(total).toBe(110);
    expect(contracts.GENERATION_1_SELECTED_ORGANISATIONS).toBe(110);
    expect(contracts.GENERATION_1_RESERVE_ORGANISATIONS).toBe(40);
  });

  it('is identical to the draw contract and to R3 section J and the plan approval', () => {
    expect(contracts.GENERATION_1_SPLIT_ORGANISATION_COUNTS).toBe(
      drawContract.EXACT_REALISED_SPLIT_COUNTS,
    );
    expect(contracts.GENERATION_1_SELECTED_ORGANISATIONS).toBe(
      drawContract.ACQUISITION_TARGET_ORGANISATIONS,
    );
    expect(contracts.GENERATION_1_RESERVE_ORGANISATIONS).toBe(
      drawContract.ACQUISITION_RESERVE_ORGANISATIONS,
    );
    for (const split of r3.sectionJ_splits.splits) {
      expect(
        contracts.GENERATION_1_SPLIT_ORGANISATION_COUNTS[split.name as contracts.Split],
        split.name,
      ).toBe(split.organisations);
    }
    expect(planApproval.boundCorpusOption).toMatchObject({
      totalNewOrganisations: 110,
      reserveOrganisations: 40,
      DEV_TRAIN: 20,
      DEV_CONFIRM: 45,
      FINAL_HOLDOUT: 45,
    });
  });

  it('the gated splits are exactly the sealed ones in R3 section J', () => {
    const sealed = r3.sectionJ_splits.splits.filter((s) => s.sealed).map((s) => s.name);
    expect([...contracts.A3_GATED_SPLITS]).toEqual(sealed);
  });

  it('re-exports the SD7 contract’s Split vocabulary rather than a competing one', () => {
    expect(contracts.SPLITS).toBe(sd7Contract.SPLITS);
    const source = readFileSync(join(A3PREP_DIR, 'contracts.ts'), 'utf8');
    expect(source).not.toMatch(/type Split\s*=/);
  });
});

describe('2D-A3 R1: SD4 gate-share cap', () => {
  it('is exactly 1/10, as an exact rational matching R3', () => {
    expect(contracts.ORGANISATION_GATE_SHARE_CAP).toEqual({ numerator: 1, denominator: 10 });
    expect(r3Rule('SD4')).toContain('ORGANISATION_GATE_SHARE_CAP = 1/10');
    expect(r3.sectionE_samplingContract.frozenConstantsIndex.ORGANISATION_GATE_SHARE_CAP).toBe(
      contracts.ORGANISATION_GATE_SHARE_CAP.numerator /
        contracts.ORGANISATION_GATE_SHARE_CAP.denominator,
    );
  });

  it('the enforcement is K4, not an implementation', () => {
    expect(contracts.A3_PREP_OWNER_DECISION_MARKERS).toContain(
      contracts.K4_SD4_G3_FREEZE_TIME_TRUNCATION,
    );
    const code = readFileSync(join(A3PREP_DIR, 'contracts.ts'), 'utf8');
    expect(code).not.toMatch(/export function/);
  });
});

describe('2D-A3 R1: SD9 minimum comes from the SD7 contract', () => {
  it('is the SD7 contract’s value, by identity', () => {
    expect(contracts.MIN_PAGES_PER_ORGANISATION).toBe(sd7Contract.MIN_PAGES_PER_ORGANISATION);
    expect(contracts.MIN_PAGES_PER_ORGANISATION).toBe(4);
  });

  it('is never independently defined in a3prep', () => {
    for (const file of ['contracts.ts', 'types.ts']) {
      const source = readFileSync(join(A3PREP_DIR, file), 'utf8');
      expect(source, file).not.toMatch(/MIN_PAGES_PER_ORGANISATION\s*=/);
    }
  });
});

describe('2D-A3 R1: planning targets are planning targets', () => {
  it('SET_P 360 / SET_R 200 match R3 and are labelled non-conformance', () => {
    const perGated = r3.sectionD_D3_corpusOption.perGatedSplitContract;
    expect(contracts.PLANNING_TARGETS_PER_GATED_SPLIT.SET_P).toBe(perGated.SET_P);
    expect(contracts.PLANNING_TARGETS_PER_GATED_SPLIT.SET_R).toBe(perGated.SET_R);
    expect(contracts.PLANNING_TARGETS_PER_GATED_SPLIT.kind).toBe(
      'PLANNING_TARGET_NOT_A_CONFORMANCE_REQUIREMENT',
    );
  });

  it('SET_R <= 180 is not a conformance failure, per the owner-approved interpretation', () => {
    const setR = planApproval.boundOwnerClarifications.SET_R;
    expect(setR.decision).toBe('A realised SET_R <= 180 is NOT by itself a conformance failure.');
    expect(contracts.SET_R_STRUCTURAL_MAXIMUM_PER_GATED_SPLIT).toBe(
      setR.bindings.impliedStructuralMaximumSetR,
    );
    expect(contracts.SET_R_STRUCTURAL_MAXIMUM_PER_GATED_SPLIT).toBe(
      setR.bindings.maxSetRContributionPerOrganisation * setR.bindings.gatedSplitOrganisations,
    );
    expect(setR.bindings.setRTargetIsAPlanningExpectationOnly).toBe(
      contracts.PLANNING_TARGETS_PER_GATED_SPLIT.SET_R,
    );
    expect(contracts.SET_R_AT_OR_BELOW_STRUCTURAL_MAXIMUM_IS_CONFORMANCE_FAILURE).toBe(false);
  });
});

describe('2D-A3 R1: K1-K4 are exact, ordered, and unanswered', () => {
  const EXPECTED = [
    'A3_PREP_OWNER_DECISION_REQUIRED:SET_R_TRACK_REDUCTION',
    'A3_PREP_OWNER_DECISION_REQUIRED:EXACT_DUPLICATE_REPRESENTATIVE_AND_SCORE',
    'A3_PREP_OWNER_DECISION_REQUIRED:SD3_SINGLE_POOL_VS_SD7_PER_SAMPLE_SURVIVOR',
    'A3_PREP_OWNER_DECISION_REQUIRED:SD4_G3_FREEZE_TIME_TRUNCATION',
  ];

  it('lists exactly the four markers, K1 -> K4', () => {
    expect([...contracts.A3_PREP_OWNER_DECISION_MARKERS]).toEqual(EXPECTED);
    expect(contracts.A3_PREP_OWNER_DECISIONS_REQUIRED.map((k) => k.id)).toEqual([
      'K1',
      'K2',
      'K3',
      'K4',
    ]);
    expect([
      contracts.K1_SET_R_TRACK_REDUCTION,
      contracts.K2_EXACT_DUPLICATE_REPRESENTATIVE_AND_SCORE,
      contracts.K3_SD3_SINGLE_POOL_VS_SD7_PER_SAMPLE_SURVIVOR,
      contracts.K4_SD4_G3_FREEZE_TIME_TRUNCATION,
    ]).toEqual(EXPECTED);
  });

  it('every marker is unresolved and the lists are frozen', () => {
    for (const requirement of contracts.A3_PREP_OWNER_DECISIONS_REQUIRED) {
      expect(requirement.resolved).toBe(false);
      expect(Object.isFrozen(requirement)).toBe(true);
    }
    expect(Object.isFrozen(contracts.A3_PREP_OWNER_DECISIONS_REQUIRED)).toBe(true);
    expect(Object.isFrozen(contracts.A3_PREP_OWNER_DECISION_MARKERS)).toBe(true);
  });

  it('carries no stale or already-resolved blocker', () => {
    const joined = contracts.A3_PREP_OWNER_DECISION_MARKERS.join('\n');
    expect(joined).not.toMatch(/200|180|TARGET/);
    expect(joined).not.toMatch(/SHORT_TEXT/);
    expect(joined).not.toMatch(/COMPONENT|UNAUDITABLE|EXCEEDS/);
    expect(joined).not.toMatch(/SD6|CROSS_REFERENCE/);
    const source = readFileSync(join(A3PREP_DIR, 'contracts.ts'), 'utf8');
    expect(source.match(/A3_PREP_OWNER_DECISION_REQUIRED:/g)).toHaveLength(4);
  });
});

describe('2D-A3 R1: leakage-safe shapes (runtime restatement of the compile-time rules)', () => {
  const CONTENT = /text|excerpt|title|url|host|name/i;
  const ITEM = /sha256|id$|Id|index|label|class|organisationBreakdown|perOrganisation/i;

  it('distinct, ranked and slot shapes have no content-bearing field', () => {
    for (const name of [
      'A3DistinctDocument',
      'A3RankedDocument',
      'A3SelectionSlot',
      'A3TrackCandidateObservation',
      'A3ExternallyResolvedSetRScore',
    ]) {
      const fields = fieldNames(name);
      expect(fields.length, name).toBeGreaterThan(0);
      for (const field of fields) expect(field, `${name}.${field}`).not.toMatch(CONTENT);
    }
  });

  it('page text exists on exactly one shape, the ephemeral SD7 input', () => {
    const source = readFileSync(join(A3PREP_DIR, 'types.ts'), 'utf8');
    const interfaces = [...source.matchAll(/export interface (\w+)/g)].map((m) => m[1] ?? '');
    const withText = interfaces.filter((name) => fieldNames(name).some((f) => /text/i.test(f)));
    expect(withText).toEqual(['A3Sd7PageTextInput']);
    expect(fieldNames('A3Sd7PageTextInput')).toContain('processingOnly');
  });

  it('the gated public aggregate carries no item identity, hash or label', () => {
    const fields = fieldNames('A3GatedSplitPublicAggregate');
    expect(fields).toEqual([
      'visibility',
      'split',
      'organisationCount',
      'setPDocumentCount',
      'setRDocumentCount',
    ]);
    for (const field of fields) {
      expect(field).not.toMatch(CONTENT);
      expect(field).not.toMatch(ITEM);
    }
  });

  it('defines no generic manifest shape and no gold identity', () => {
    const source = readFileSync(join(A3PREP_DIR, 'types.ts'), 'utf8');
    expect(source).not.toMatch(/interface \w*Manifest/);
    expect(source).not.toMatch(/goldId/);
  });
});
