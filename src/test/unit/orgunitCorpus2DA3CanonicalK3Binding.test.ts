/**
 * PHASE 2B-2D A3 — K3 OWNER-CLARIFICATION BINDING.
 *
 * The owner resolved K3 by an append-only record
 * (`K3_SD7_SAMPLE_SPECIFIC_SURVIVOR_CLARIFICATION_V1`). This file proves the
 * canonical contracts carry that decision truthfully and nothing more:
 *
 *   - K3 added no K1, K2 or K4 semantics (K1, K2 and then K4 were later
 *     resolved by their own owner records);
 *   - K3 is resolved, bound to the committed record by path and SHA-256, and
 *     its historical marker string is unchanged;
 *   - the committed record says what the contract says it says, and binds the
 *     canonical frozen authority by hash;
 *   - no survivor algorithm existed at K3's own terminal commit; R7 then
 *     added one, in `a3prep/sd7.ts` alone. These are HISTORICAL claims about
 *     K3, so they read K3's terminal commit rather than HEAD.
 *
 * It checks key fields of the record, never a second copy of it.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as contracts from '../harness/phase2b2d/a3prep/contracts.js';
import * as drawContract from '../harness/phase2b2d/draw/drawContract.js';
import * as sd7Contract from '../harness/phase2b2d/sd7/sd7Contract.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const A3PREP_DIR = join(REPO_ROOT, 'src/test/harness/phase2b2d/a3prep');
const K3 = contracts.K3_OWNER_DECISION;

function fileSha256(relativePath: string): string {
  return createHash('sha256')
    .update(readFileSync(join(REPO_ROOT, relativePath)))
    .digest('hex');
}

interface BoundFile {
  readonly path: string;
  readonly sha256: string;
}

interface K3Record {
  readonly recordKind: string;
  readonly decisionToken: string;
  readonly classification: string;
  readonly thisFileAuthorises: readonly string[];
  readonly resolvesMarker: { readonly id: string; readonly marker: string };
  readonly theAmbiguityAcknowledged: { readonly thisAmbiguityGenuinelyExisted: boolean };
  readonly ownerDecision: {
    readonly clause2_oneCanonicalGraph: {
      readonly graphScope: string;
      readonly canonicalPrimitive: string;
    };
    readonly clause3_meaningOfSameDeduplicatedPool: {
      readonly interpretationToken: string;
      readonly ownerAcknowledgesThePhraseWasAmbiguous: boolean;
    };
    readonly clause4_sampleSpecificGreedySurvivorWalk: {
      readonly procedureToken: string;
      readonly survivorScope: string;
      readonly ownerSelects: string;
      readonly r3ProseAloneUniquelySpecifiedGreedy: boolean;
    };
    readonly clause6_setRSurvivorOrder: {
      readonly constructibilityStillDependsOn: readonly string[];
      readonly finalSetRSurvivorIdentityAvailableUntilK1AndK2Resolved: boolean;
    };
    readonly clause7_atMostOneItemScope: {
      readonly scopeToken: string;
      readonly interpretedAsGlobalProhibitionAcrossSetPUnionSetR: boolean;
      readonly consequenceExplicitlyAccepted: boolean;
    };
    readonly clause8_unionConsequence: {
      readonly setPAndSetRMayRetainDifferentMembersOfOneNearDuplicateComponent: boolean;
      readonly differentNearDuplicateDocumentsAreAutomaticallyTheSameGoldId: boolean;
      readonly ownerAcceptsThisConsequence: boolean;
      readonly newPublicManifestFieldAdded: boolean;
    };
    readonly clause9_sd9: {
      readonly minPagesPerOrganisation: number;
      readonly thresholdChanged: boolean;
      readonly pendingStatus: string;
      readonly mechanicalFinalisation: Readonly<Record<string, string>>;
      readonly k1K2IndependentExactSetRCountsExist: boolean;
    };
    readonly clause10_shortTextRemainsUnresolved: {
      readonly k3DecidesShortTextSampleMembership: boolean;
    };
    readonly clause12_whatK3DoesNotDecide: {
      readonly stillUnresolved: readonly { readonly id: string; readonly marker: string }[];
      readonly residualAdjacentIssue: {
        readonly token: string;
        readonly resolved: boolean;
        readonly addedAsANumberedK5ContractMarker: boolean;
      };
    };
  };
  readonly whatThisDoesNotChange: Readonly<Record<string, boolean | string>>;
  readonly boundAuthority: Readonly<Record<string, BoundFile | string | boolean>>;
}

const record = JSON.parse(readFileSync(join(REPO_ROOT, K3.decisionRecordPath), 'utf8')) as K3Record;
const decision = record.ownerDecision;

// ---------------------------------------------------------------------------

describe('2D-A3 K3: decision status', () => {
  it('K1 is resolved (later, by its own owner record)', () => {
    expect(contracts.A3_PREP_OWNER_DECISIONS_REQUIRED.map((d) => d.id)).not.toContain('K1');
    expect(contracts.K1_OWNER_DECISION.resolved).toBe(true);
  });

  it('K2 is resolved (later, by its own owner record)', () => {
    expect(contracts.A3_PREP_OWNER_DECISIONS_REQUIRED.map((d) => d.id)).not.toContain('K2');
    expect(contracts.K2_OWNER_DECISION.resolved).toBe(true);
  });

  it('K3 is resolved, and absent from the unresolved list', () => {
    expect(K3.resolved).toBe(true);
    expect(contracts.A3_PREP_OWNER_DECISIONS_RESOLVED).toContain(K3);
    expect(contracts.A3_PREP_OWNER_DECISIONS_REQUIRED.map((d) => d.id)).not.toContain('K3');
    expect(contracts.A3_PREP_UNRESOLVED_OWNER_DECISION_MARKERS).not.toContain(
      contracts.K3_SD3_SINGLE_POOL_VS_SD7_PER_SAMPLE_SURVIVOR,
    );
  });

  it('K4 is resolved (later, by its own owner record)', () => {
    expect(contracts.A3_PREP_OWNER_DECISIONS_REQUIRED.map((d) => d.id)).not.toContain('K4');
    expect(contracts.K4_OWNER_DECISION.resolved).toBe(true);
  });

  it('the original K3 marker string is byte-identical and still the resolved entry’s marker', () => {
    expect(contracts.K3_SD3_SINGLE_POOL_VS_SD7_PER_SAMPLE_SURVIVOR).toBe(
      'A3_PREP_OWNER_DECISION_REQUIRED:SD3_SINGLE_POOL_VS_SD7_PER_SAMPLE_SURVIVOR',
    );
    expect(K3.marker).toBe(contracts.K3_SD3_SINGLE_POOL_VS_SD7_PER_SAMPLE_SURVIVOR);
    expect(contracts.A3_PREP_OWNER_DECISION_MARKERS).toContain(K3.marker);
  });

  it('the old "exactly four unresolved decisions" invariant is gone: 0 unresolved, 4 resolved, 4 historical', () => {
    expect(contracts.A3_PREP_OWNER_DECISIONS_REQUIRED).toHaveLength(0);
    expect(contracts.A3_PREP_UNRESOLVED_OWNER_DECISION_MARKERS).toHaveLength(0);
    expect(contracts.A3_PREP_OWNER_DECISIONS_RESOLVED).toHaveLength(4);
    expect(contracts.A3_PREP_RESOLVED_OWNER_DECISION_MARKERS).toHaveLength(4);
    expect(contracts.A3_PREP_OWNER_DECISION_MARKERS).toHaveLength(4);
    expect(
      [
        ...contracts.A3_PREP_UNRESOLVED_OWNER_DECISION_MARKERS,
        ...contracts.A3_PREP_RESOLVED_OWNER_DECISION_MARKERS,
      ].sort(),
    ).toEqual([...contracts.A3_PREP_OWNER_DECISION_MARKERS].sort());
  });
});

describe('2D-A3 K3: resolved binding and semantics', () => {
  it('binds the exact decision token, owner-record path and owner-record SHA-256', () => {
    expect(K3.decisionToken).toBe('K3_SD7_SAMPLE_SPECIFIC_SURVIVOR_CLARIFICATION_V1');
    expect(K3.decisionRecordPath).toBe(
      'docs/evaluation/PHASE_2B_2D_A3_K3_SD7_SAMPLE_SPECIFIC_SURVIVOR_OWNER_CLARIFICATION_V1.json',
    );
    expect(K3.decisionRecordSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(K3.decisionRecordCommit).toMatch(/^[0-9a-f]{40}$/);
  });

  it('carries exactly the owner-selected semantics', () => {
    expect(K3.selectedSemantics).toBe('SAMPLE_SPECIFIC_GREEDY_SURVIVORS');
    expect(contracts.K3_SD7_SURVIVOR_SCOPE).toBe('SAMPLE_SPECIFIC');
    expect(contracts.K3_SD7_SURVIVOR_PROCEDURE).toBe('GREEDY_SAMPLE_RANK_SURVIVOR_WALK');
    expect(contracts.K3_SD7_GRAPH_SCOPE).toBe('ONE_CANONICAL_GRAPH_PER_ORGANISATION');
    expect(contracts.K3_SD7_AT_MOST_ONE_SCOPE).toBe('PER_SAMPLE');
    expect(contracts.K3_SD3_SHARED_POOL_INTERPRETATION).toBe(
      'COMMON_EXACT_DISTINCT_POPULATION_PLUS_CANONICAL_GRAPH',
    );
    expect(K3.survivorScope).toBe(contracts.K3_SD7_SURVIVOR_SCOPE);
    expect(K3.survivorProcedure).toBe(contracts.K3_SD7_SURVIVOR_PROCEDURE);
    expect(K3.graphScope).toBe(contracts.K3_SD7_GRAPH_SCOPE);
    expect(K3.atMostOneScope).toBe(contracts.K3_SD7_AT_MOST_ONE_SCOPE);
    expect(K3.sharedPoolInterpretation).toBe(contracts.K3_SD3_SHARED_POOL_INTERPRETATION);
  });

  it('adds no K4 semantics; K1, K2 and K4 gained only their own owner-bound decisions', () => {
    expect(
      Object.keys(contracts)
        .filter((name) => /^K[124]_/.test(name))
        .sort(),
    ).toEqual([
      'K1_OWNER_DECISION',
      'K1_SET_R_TRACK_REDUCTION',
      'K2_EXACT_DUPLICATE_REPRESENTATIVE_AND_SCORE',
      'K2_OWNER_DECISION',
      'K4_OWNER_DECISION',
      'K4_SD4_G3_FREEZE_TIME_TRUNCATION',
    ]);
  });
});

/** K3's terminal commit: the tip R7 was branched from. */
const K3_TERMINAL_COMMIT = '91850fb0eceda1d19ef959e952e1d1ce71a8010e';
const A3PREP_REL = 'src/test/harness/phase2b2d/a3prep';

function git(...args: readonly string[]): string {
  return execFileSync('git', ['-C', REPO_ROOT, ...args], { encoding: 'utf8' });
}

function k3CommitAvailable(): boolean {
  try {
    git('cat-file', '-e', `${K3_TERMINAL_COMMIT}^{commit}`);
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!k3CommitAvailable())(
  '2D-A3 K3: no survivor algorithm existed at K3 (R7 added it)',
  () => {
    const filesAtK3 = git('ls-tree', '--name-only', `${K3_TERMINAL_COMMIT}:${A3PREP_REL}`)
      .split('\n')
      .filter(Boolean);

    it('no a3prep/sd7.ts existed at K3', () => {
      expect(filesAtK3).not.toContain('sd7.ts');
      expect(filesAtK3.length).toBeGreaterThan(0);
    });

    it('no a3prep module exported a survivor, greedy or walk function at K3', () => {
      for (const file of filesAtK3.filter((f) => f.endsWith('.ts'))) {
        const source = git('show', `${K3_TERMINAL_COMMIT}:${A3PREP_REL}/${file}`);
        for (const m of source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) {
          expect(m[1], `${file}:${m[1]}`).not.toMatch(/survivor|greedy|walk|independent/i);
        }
      }
    });
  },
);

describe('2D-A3 K3: after R7, the survivor algorithm lives in a3prep/sd7.ts alone', () => {
  it('a3prep/sd7.ts exists', () => {
    expect(existsSync(join(A3PREP_DIR, 'sd7.ts'))).toBe(true);
  });

  it('no other a3prep module exports a survivor, greedy or walk function', async () => {
    for (const file of readdirSync(A3PREP_DIR).filter((f) => f.endsWith('.ts') && f !== 'sd7.ts')) {
      const module = (await import(join(A3PREP_DIR, file))) as Record<string, unknown>;
      for (const [name, value] of Object.entries(module)) {
        if (typeof value === 'function') {
          expect(name, `${file}:${name}`).not.toMatch(/survivor|greedy|walk|independent/i);
        }
      }
    }
  });

  it('contracts.ts still declares no named or block-bodied function', () => {
    const code = readFileSync(join(A3PREP_DIR, 'contracts.ts'), 'utf8');
    expect(code).not.toMatch(/export function|=>\s*\{|function\s*\(/);
  });
});

// ---------------------------------------------------------------------------

describe('2D-A3 K3: the committed owner record', () => {
  it('its file SHA-256 equals the contract binding', () => {
    expect(fileSha256(K3.decisionRecordPath)).toBe(K3.decisionRecordSha256);
  });

  it('is an owner clarification carrying the bound decision token and marker', () => {
    expect(record.recordKind).toBe('OWNER_CLARIFICATION');
    expect(record.decisionToken).toBe(K3.decisionToken);
    expect(record.classification).toBe('OWNER_INTERPRETATION_OF_AMBIGUOUS_FROZEN_METHODOLOGY_TEXT');
    expect(record.resolvesMarker).toMatchObject({ id: 'K3', marker: K3.marker });
    expect(record.theAmbiguityAcknowledged.thisAmbiguityGenuinelyExisted).toBe(true);
    expect(record.thisFileAuthorises).toEqual([]);
  });

  it('binds methodology R3, its freeze approval, Plan V1 and its approval by the canonical hashes', () => {
    const bound = record.boundAuthority as Record<string, BoundFile>;
    expect(bound.methodologyR3).toMatchObject({
      path: drawContract.METHODOLOGY_R3_PATH,
      sha256: drawContract.METHODOLOGY_R3_SHA256,
    });
    expect(bound.methodologyFreezeApproval).toMatchObject({
      path: drawContract.METHODOLOGY_APPROVAL_PATH,
      sha256: drawContract.METHODOLOGY_APPROVAL_SHA256,
    });
    expect(bound.corpusPlanV1).toMatchObject({
      path: drawContract.CORPUS_PLAN_PATH,
      sha256: drawContract.CORPUS_PLAN_SHA256,
    });
    expect(bound.corpusPlanApproval).toMatchObject({
      path: drawContract.CORPUS_PLAN_APPROVAL_PATH,
      sha256: drawContract.CORPUS_PLAN_APPROVAL_SHA256,
    });
  });

  it('every bound file still hashes to the value the record carries', () => {
    const files = Object.values(record.boundAuthority).filter(
      (v): v is BoundFile => typeof v === 'object' && v !== null && 'sha256' in v,
    );
    expect(files).toHaveLength(8);
    for (const file of files) expect(fileSha256(file.path), file.path).toBe(file.sha256);
    expect(record.boundAuthority.canonicalR6CodeCommit).toBe(
      '0dc40586d9d30613d837b67de2f230c214e46090',
    );
    expect(record.boundAuthority.canonicalR6TerminalCommit).toBe(
      '99db70f67dc9c2866d42cd8951a30f9b2cdd075e',
    );
  });

  it('changes no frozen byte and authorises no real A3', () => {
    expect(record.whatThisDoesNotChange.r3Changed).toBe(false);
    expect(record.whatThisDoesNotChange.planV1Changed).toBe(false);
    expect(record.whatThisDoesNotChange.realA3Authorised).toBe(false);
    expect(record.whatThisDoesNotChange.r4Created).toBe(false);
  });

  it('left K1, K2 and K4 unresolved when it was written (K1 and K2 were resolved later)', () => {
    // A historical statement of the immutable K3 record, so it is compared with
    // the marker strings, not with today's unresolved list.
    expect(decision.clause12_whatK3DoesNotDecide.stillUnresolved).toEqual([
      { id: 'K1', marker: contracts.K1_SET_R_TRACK_REDUCTION },
      { id: 'K2', marker: contracts.K2_EXACT_DUPLICATE_REPRESENTATIVE_AND_SCORE },
      { id: 'K4', marker: contracts.K4_SD4_G3_FREEZE_TIME_TRUNCATION },
    ]);
    expect(decision.clause6_setRSurvivorOrder.constructibilityStillDependsOn).toEqual(['K1', 'K2']);
    expect(
      decision.clause6_setRSurvivorOrder.finalSetRSurvivorIdentityAvailableUntilK1AndK2Resolved,
    ).toBe(false);
  });

  it('states one canonical graph, the shared-pool interpretation and the greedy procedure', () => {
    expect(decision.clause2_oneCanonicalGraph.graphScope).toBe(K3.graphScope);
    expect(decision.clause2_oneCanonicalGraph.canonicalPrimitive).toBe('measureNearDuplicateGraph');
    expect(decision.clause3_meaningOfSameDeduplicatedPool.interpretationToken).toBe(
      K3.sharedPoolInterpretation,
    );
    expect(
      decision.clause3_meaningOfSameDeduplicatedPool.ownerAcknowledgesThePhraseWasAmbiguous,
    ).toBe(true);
    const walk = decision.clause4_sampleSpecificGreedySurvivorWalk;
    expect(walk.procedureToken).toBe(K3.survivorProcedure);
    expect(walk.survivorScope).toBe(K3.survivorScope);
    expect(walk.ownerSelects).toBe('GREEDY');
    expect(walk.r3ProseAloneUniquelySpecifiedGreedy).toBe(false);
  });

  it('scopes "AT MOST ONE" per sample and acknowledges the union consequence', () => {
    const scope = decision.clause7_atMostOneItemScope;
    expect(scope.scopeToken).toBe(K3.atMostOneScope);
    expect(scope.interpretedAsGlobalProhibitionAcrossSetPUnionSetR).toBe(false);
    expect(scope.consequenceExplicitlyAccepted).toBe(true);
    const union = decision.clause8_unionConsequence;
    expect(union.setPAndSetRMayRetainDifferentMembersOfOneNearDuplicateComponent).toBe(true);
    expect(union.differentNearDuplicateDocumentsAreAutomaticallyTheSameGoldId).toBe(false);
    expect(union.ownerAcceptsThisConsequence).toBe(true);
    expect(union.newPublicManifestFieldAdded).toBe(false);
  });

  it('keeps SD9 at 4 and fail-closed', () => {
    const sd9 = decision.clause9_sd9;
    expect(sd9.minPagesPerOrganisation).toBe(sd7Contract.MIN_PAGES_PER_ORGANISATION);
    expect(sd9.thresholdChanged).toBe(false);
    expect(Object.keys(sd9.mechanicalFinalisation).sort()).toEqual([
      'MIN_PAGES_NOT_MET',
      'PENDING',
      'SUCCESS',
    ]);
    expect(sd9.mechanicalFinalisation.SUCCESS).toMatch(/EVERY admissible post-SD7 count is >= 4/);
    expect(sd9.mechanicalFinalisation.MIN_PAGES_NOT_MET).toMatch(
      /EVERY admissible post-SD7 count is < 4/,
    );
    expect(sd9.pendingStatus).toBe('ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL');
    expect(sd9.k1K2IndependentExactSetRCountsExist).toBe(false);
  });

  it('does not silently resolve short-text sample membership, nor number it as K5', () => {
    expect(decision.clause10_shortTextRemainsUnresolved.k3DecidesShortTextSampleMembership).toBe(
      false,
    );
    const residual = decision.clause12_whatK3DoesNotDecide.residualAdjacentIssue;
    expect(residual.token).toBe('SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP');
    expect(residual.resolved).toBe(false);
    expect(residual.addedAsANumberedK5ContractMarker).toBe(false);
    expect(Object.keys(contracts).filter((name) => /^K5/.test(name))).toEqual([]);
    // K3 itself exported nothing short-text shaped. The only such exports now
    // come from the LATER, separate short-text membership owner policy, which
    // is bound to its own record rather than to K3's.
    for (const name of Object.keys(contracts).filter((n) => /SHORT_TEXT/.test(n))) {
      expect(name).toMatch(/^SHORT_TEXT_/);
    }
    expect(contracts.SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY.decisionRecordPath).not.toBe(
      K3.decisionRecordPath,
    );
  });
});
