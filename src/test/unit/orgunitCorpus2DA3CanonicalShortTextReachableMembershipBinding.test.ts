/**
 * PHASE 2B-2D A3 — SHORT-TEXT REQUIRED-MEMBERSHIP SCOPE (GENERATION 1) OWNER
 * CLARIFICATION BINDING.
 *
 * The owner defined, by an append-only record
 * (`SHORT_TEXT_REQUIRED_SAMPLE_MEMBERSHIP_LIMITED_TO_REACHABLE_CAPPED_MEMBERSHIP_V1`),
 * the word REQUIRED in the earlier short-text policy's freeze rule
 * `REFUSE_IF_REQUIRED_MEMBERSHIP_BLOCKED`: for Generation 1 it is the
 * membership REACHABLE under the frozen caps (SET_P 8, SET_R 4). This file
 * proves:
 *
 *   - the contracts bind that record truthfully (path, SHA-256, commit,
 *     tokens) and bind the earlier policy by reference, which stays intact;
 *   - the zero-extension-headroom arithmetic the scope rests on, for both
 *     canonical caps;
 *   - the preflight consequence: a blocked cap still refuses with the
 *     unchanged refusal token, an unresolved tail after an exact cap alone
 *     does not, and the full-rank audit fact is still reported BLOCKED;
 *   - nothing semantic, SD9, acquisition or replacement changed, and there is
 *     no K5.
 *
 * Every identity here is INVENTED; no corpus, database or network is touched.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as contracts from '../harness/phase2b2d/a3prep/contracts.js';
import {
  A3_CORPUS_FREEZE_PREFLIGHT_CURRENT_BLOCKERS_CLEAR_NOT_FREEZE_AUTHORITY,
  A3_CORPUS_FREEZE_PREFLIGHT_REFUSED,
  checkCurrentA3CorpusFreezePreflight,
  checkSetPShortTextCorpusFreezeGate,
  checkSetRShortTextCorpusFreezeGate,
  SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
  SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
  SET_P_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP,
  SET_P_INITIAL_CAP_EXACT,
  SHORT_TEXT_CORPUS_FREEZE_GATE_CLEAR,
  SHORT_TEXT_CORPUS_FREEZE_GATE_REFUSED,
  type A3SetPFreezeSlotReadiness,
} from '../harness/phase2b2d/a3prep/corpusFreezePreflight.js';
import { deriveK4FreezeReadiness } from '../harness/phase2b2d/a3prep/organisationCaps.js';
import {
  SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
  SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
  SET_R_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP,
  SET_R_INITIAL_CAP_EXACT,
  type A3SetRFreezeSlotReadiness,
} from '../harness/phase2b2d/a3prep/setRSd7Readiness.js';
import type { A3SelectionIndex } from '../harness/phase2b2d/a3prep/types.js';
import * as drawContract from '../harness/phase2b2d/draw/drawContract.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const SCOPE = contracts.SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY;
const PRIOR = contracts.SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY;

function fileSha256(relativePath: string): string {
  return createHash('sha256')
    .update(readFileSync(join(REPO_ROOT, relativePath)))
    .digest('hex');
}

function git(...args: string[]): string {
  return execFileSync('git', ['-C', REPO_ROOT, ...args], { encoding: 'utf8' });
}

function commitExists(commit: string): boolean {
  try {
    execFileSync('git', ['-C', REPO_ROOT, 'cat-file', '-e', `${commit}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

interface BoundFile {
  readonly path: string;
  readonly sha256: string;
  readonly commit?: string;
}

interface ScopeRecord {
  readonly recordKind: string;
  readonly decisionToken: string;
  readonly selectedOption: string;
  readonly scopeToken: string;
  readonly classification: string;
  readonly generationId: string;
  readonly canonicalA3Parent: string;
  readonly explicitlyNotClassifiedAs: readonly string[];
  readonly thisFileAuthorises: readonly string[];
  readonly clarifiesTerm: {
    readonly term: string;
    readonly inRule: string;
    readonly ofRecord: string;
    readonly ofRecordSha256: string;
    readonly definitionForGeneration1: string;
  };
  readonly zeroExtensionHeadroomProof: {
    readonly caps: Readonly<Record<string, unknown>>;
    readonly perOrganisationStatement: {
      readonly appliedTo: Readonly<Record<'SET_P' | 'SET_R', { c: number; holds: boolean }>>;
    };
    readonly splitWideStatement: Readonly<Record<string, unknown>>;
    readonly whatIsNotDeleted: Readonly<Record<string, unknown>>;
  };
  readonly ownerDecision: {
    readonly clause1_requiredMembershipDefinition: Readonly<Record<string, unknown>>;
    readonly clause2_fullOrderEvidencePreserved: {
      readonly policy: string;
      readonly mustStillBeCommittedAndFrozenPreLabel: readonly string[];
      readonly tailMayBeDeletedOrHidden: boolean;
    };
    readonly clause4_postCapAmbiguityDoesNotBlockByItself: Readonly<Record<string, unknown>>;
    readonly clause6_priorClause8RemainsTrue: {
      readonly initialCapExactnessImpliesCompleteRankExactness: boolean;
    };
    readonly clause7_priorClause11DefinesRequired: {
      readonly existingRule: string;
      readonly existingRuleChanged: boolean;
      readonly refusalTokenWhenCapMembershipIsBlocked: string;
      readonly newRefusalTokenCreated: boolean;
    };
    readonly clause8_noSemanticShortTextDecision: {
      readonly flag: string;
      readonly remains: string;
    };
    readonly clause9_sd9Unchanged: Readonly<Record<string, unknown>>;
    readonly clause10_noReplacementEffect: Readonly<Record<string, unknown>>;
    readonly clause11_globalPreLabelDecision: Readonly<Record<string, unknown>>;
    readonly clause12_futureCapRelaxation: Readonly<Record<string, unknown>>;
    readonly clause13_kState: Readonly<Record<string, unknown>>;
  };
  readonly boundAuthority: Readonly<Record<string, BoundFile | string | boolean | object>>;
  readonly whatThisDoesNotChange: Readonly<Record<string, boolean>>;
}

const record = JSON.parse(
  readFileSync(join(REPO_ROOT, SCOPE.decisionRecordPath), 'utf8'),
) as ScopeRecord;
const decision = record.ownerDecision;

// ---------------------------------------------------------------------------

describe('2D-A3 reachable short-text membership: the committed owner record', () => {
  it('exists, and its file SHA-256 equals the contract binding', () => {
    expect(SCOPE.decisionRecordPath).toBe(
      'docs/evaluation/PHASE_2B_2D_A3_SHORT_TEXT_REACHABLE_MEMBERSHIP_OWNER_CLARIFICATION_V1.json',
    );
    expect(fileSha256(SCOPE.decisionRecordPath)).toBe(SCOPE.decisionRecordSha256);
    expect(SCOPE.decisionRecordCommit).toMatch(/^[0-9a-f]{40}$/);
  });

  it.runIf(commitExists(SCOPE.decisionRecordCommit))(
    'the bound commit added exactly this file, with exactly these bytes, on the R15 parent',
    () => {
      const commit = SCOPE.decisionRecordCommit;
      expect(git('show', '--name-only', '--format=', commit).trim().split('\n')).toEqual([
        SCOPE.decisionRecordPath,
      ]);
      const atCommit = execFileSync('git', [
        '-C',
        REPO_ROOT,
        'show',
        `${commit}:${SCOPE.decisionRecordPath}`,
      ]);
      expect(createHash('sha256').update(atCommit).digest('hex')).toBe(SCOPE.decisionRecordSha256);
      expect(git('rev-parse', `${commit}^`).trim()).toBe(record.canonicalA3Parent);
      expect(record.canonicalA3Parent).toBe('9478f1d17ed2b6bcff9fcd436650745a2971550b');
    },
  );

  it('carries the exact decision, option, scope, classification and generation tokens', () => {
    expect(SCOPE.decisionToken).toBe(
      'SHORT_TEXT_REQUIRED_SAMPLE_MEMBERSHIP_LIMITED_TO_REACHABLE_CAPPED_MEMBERSHIP_V1',
    );
    expect(SCOPE.selectedOption).toBe(
      'RECOMMEND_LIMIT_REQUIRED_MEMBERSHIP_TO_REACHABLE_CAPPED_MEMBERSHIP',
    );
    expect(SCOPE.classification).toBe('OWNER_CLARIFICATION_OF_REQUIRED_MEMBERSHIP_SCOPE');
    expect(SCOPE.generation).toBe('METHODOLOGY_V2_GEN1');
    expect(SCOPE.zeroExtensionHeadroomScope).toBe(
      'ZERO_EXTENSION_HEADROOM_SELECTED_CAP_IS_COMPLETE_REACHABLE_SAMPLE_MEMBERSHIP',
    );
    expect(record.recordKind).toBe('OWNER_CLARIFICATION');
    expect(record.decisionToken).toBe(SCOPE.decisionToken);
    expect(record.selectedOption).toBe(SCOPE.selectedOption);
    expect(record.classification).toBe(SCOPE.classification);
    expect(record.scopeToken).toBe(SCOPE.zeroExtensionHeadroomScope);
    expect(record.generationId).toBe(SCOPE.generation);
  });

  it('is not a methodology amendment, a rule change, a K marker or execution authority', () => {
    for (const not of [
      'METHODOLOGY_AMENDMENT',
      'METHODOLOGY_V2_R4',
      'NEW_SIMILARITY_RULE',
      'SD7_RULE_CHANGE',
      'SD9_RULE_CHANGE',
      'CAP_CHANGE',
      'RANKING_CHANGE',
      'SEMANTIC_SHORT_TEXT_VERDICT',
      'NEW_K_MARKER',
      'EXECUTION_AUTHORITY',
    ]) {
      expect(record.explicitlyNotClassifiedAs).toContain(not);
    }
    expect(record.thisFileAuthorises).toEqual([]);
    for (const [field, changed] of Object.entries(record.whatThisDoesNotChange)) {
      expect(changed, field).toBe(false);
    }
  });

  it('binds the earlier short-text policy by reference, and that record is unchanged', () => {
    expect(SCOPE.clarifiesPolicyDecisionToken).toBe(PRIOR.decisionToken);
    expect(SCOPE.clarifiesPolicyDecisionRecordSha256).toBe(PRIOR.decisionRecordSha256);
    expect(SCOPE.clarifiesFreezePolicy).toBe('REFUSE_IF_REQUIRED_MEMBERSHIP_BLOCKED');
    expect(fileSha256(PRIOR.decisionRecordPath)).toBe(PRIOR.decisionRecordSha256);
    expect(record.clarifiesTerm).toMatchObject({
      term: 'REQUIRED',
      inRule: PRIOR.freezePolicy,
      ofRecord: PRIOR.decisionRecordPath,
      ofRecordSha256: PRIOR.decisionRecordSha256,
      definitionForGeneration1: 'REACHABLE_SELECTED_CAPPED_MEMBERSHIP',
    });
    // The historical policy object is not rewritten to carry the new scope.
    expect(Object.keys(PRIOR)).not.toContain('requiredMembershipScope');
    expect(PRIOR.freezePolicy).toBe('REFUSE_IF_REQUIRED_MEMBERSHIP_BLOCKED');
  });

  it('every bound authority hash matches the bytes on disk, and R3 / Plan are the canonical ones', () => {
    let checked = 0;
    const walk = (value: unknown): void => {
      if (typeof value !== 'object' || value === null) return;
      const v = value as Record<string, unknown>;
      if (typeof v.path === 'string' && typeof v.sha256 === 'string') {
        expect(fileSha256(v.path), v.path).toBe(v.sha256);
        checked += 1;
      }
      for (const [key, child] of Object.entries(v)) {
        // Runtime files are bound AT THE PARENT, checked against git below.
        if (key !== 'canonicalRuntimeFilesAtParent') walk(child);
      }
    };
    walk(record.boundAuthority);
    expect(checked).toBeGreaterThanOrEqual(10);
    const bound = record.boundAuthority as Record<string, BoundFile>;
    expect(bound.methodologyR3!.sha256).toBe(drawContract.METHODOLOGY_R3_SHA256);
    expect(bound.methodologyFreezeApproval!.sha256).toBe(drawContract.METHODOLOGY_APPROVAL_SHA256);
    expect(bound.corpusPlanV1!.sha256).toBe(drawContract.CORPUS_PLAN_SHA256);
    expect(bound.corpusPlanApproval!.sha256).toBe(drawContract.CORPUS_PLAN_APPROVAL_SHA256);
    expect(bound.shortTextSampleMembershipOwnerPolicy!.sha256).toBe(PRIOR.decisionRecordSha256);
    expect(bound.k3OwnerClarification!.sha256).toBe(
      contracts.K3_OWNER_DECISION.decisionRecordSha256,
    );
    expect(record.boundAuthority.canonicalA3Parent).toBe(record.canonicalA3Parent);
  });

  it.runIf(commitExists('9478f1d17ed2b6bcff9fcd436650745a2971550b'))(
    'the runtime files it binds are the R15 parent bytes, and R8 (setPSd7.ts) is still byte-identical',
    () => {
      const atParent = (
        record.boundAuthority as {
          canonicalRuntimeFilesAtParent: Record<string, BoundFile>;
        }
      ).canonicalRuntimeFilesAtParent;
      expect(Object.keys(atParent).sort()).toEqual([
        'corpusFreezePreflight',
        'setPSd7',
        'setRSd7Readiness',
      ]);
      for (const bound of Object.values(atParent)) {
        const bytes = execFileSync('git', [
          '-C',
          REPO_ROOT,
          'show',
          `${record.canonicalA3Parent}:${bound.path}`,
        ]);
        expect(createHash('sha256').update(bytes).digest('hex'), bound.path).toBe(bound.sha256);
      }
      expect(fileSha256(atParent.setPSd7!.path)).toBe(atParent.setPSd7!.sha256);
    },
  );
});

// ---------------------------------------------------------------------------

describe('2D-A3 reachable short-text membership: the scope object', () => {
  it('binds the required-membership scope and the full-order evidence policy', () => {
    expect(SCOPE.requiredMembershipScope).toBe('REACHABLE_SELECTED_CAPPED_MEMBERSHIP');
    expect(contracts.SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE).toBe(SCOPE.requiredMembershipScope);
    expect(SCOPE.fullOrderEvidencePolicy).toBe(
      'PRESERVE_FULL_ORDER_EVIDENCE_WITH_UNRESOLVED_UNREACHABLE_TAIL_ALLOWED',
    );
    expect(decision.clause1_requiredMembershipDefinition).toMatchObject({
      token: 'REQUIRED_SELECTED_SAMPLE_MEMBERSHIP',
      scope: SCOPE.requiredMembershipScope,
      postCapPositionsAre: 'FULL_ORDER_EVIDENCE',
      postCapPositionsAreNot: 'REQUIRED_SELECTED_SAMPLE_MEMBERSHIP',
    });
  });

  it('retains the full-order evidence: nothing is deleted or hidden', () => {
    const c2 = decision.clause2_fullOrderEvidencePreserved;
    expect(c2.policy).toBe(SCOPE.fullOrderEvidencePolicy);
    expect(c2.tailMayBeDeletedOrHidden).toBe(false);
    for (const item of [
      'the complete pre-SD7 total order',
      'the canonical graph',
      'the measurable survivor sequence',
      'exclusions',
      'unresolved short-text positions',
      'source-rank positions',
      'sample-specific ordering evidence',
    ]) {
      expect(c2.mustStillBeCommittedAndFrozenPreLabel).toContain(item);
    }
    expect(record.zeroExtensionHeadroomProof.whatIsNotDeleted).toMatchObject({
      sd5Deleted: false,
      sd6Deleted: false,
      shortfallChecksRemain: true,
      deterministicFullOrderingRemains: true,
    });
  });

  it('a cap-blocked membership still refuses the freeze, with the unchanged refusal token', () => {
    expect(SCOPE.capBlockedFreezeEffect).toBe('REFUSE_CORPUS_FREEZE');
    expect(SCOPE.capBlockedFreezeEffect).toBe(PRIOR.freezeEffect);
    expect(SCOPE.capBlockedFreezeRefusal).toBe(
      'CORPUS_FREEZE_REFUSED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED',
    );
    expect(SCOPE.capBlockedFreezeRefusal).toBe(PRIOR.freezeRefusal);
    expect(decision.clause7_priorClause11DefinesRequired).toMatchObject({
      existingRule: PRIOR.freezePolicy,
      existingRuleChanged: false,
      refusalTokenWhenCapMembershipIsBlocked: PRIOR.freezeRefusal,
      newRefusalTokenCreated: false,
    });
  });

  it('an unreachable tail alone does not refuse the freeze', () => {
    expect(SCOPE.unreachableTailFreezeEffect).toBe('DOES_NOT_REFUSE_FREEZE_BY_ITSELF');
    expect(decision.clause4_postCapAmbiguityDoesNotBlockByItself).toMatchObject({
      unreachableTailFreezeEffect: SCOPE.unreachableTailFreezeEffect,
      capBlockedFreezeEffect: SCOPE.capBlockedFreezeEffect,
    });
  });

  it('initial-cap exactness still does NOT imply complete-rank exactness', () => {
    expect(
      decision.clause6_priorClause8RemainsTrue.initialCapExactnessImpliesCompleteRankExactness,
    ).toBe(false);
  });

  it('semantic near-duplicate status remains unresolved', () => {
    expect(SCOPE.semanticNearDuplicateStatus).toBe('REMAINS_UNRESOLVED');
    expect(contracts.SHORT_TEXT_SEMANTIC_NEAR_DUPLICATE_STATUS).toBe('UNRESOLVED');
    expect(decision.clause8_noSemanticShortTextDecision).toMatchObject({
      flag: 'SD7_SHORT_TEXT_UNRESOLVED',
      remains: 'EXACTLY_UNRESOLVED',
    });
  });

  it('SD9, acquisition and replacement are unchanged', () => {
    expect(SCOPE.sd9).toBe('UNCHANGED');
    expect(SCOPE.acquisitionEffect).toBe('NO_ACQUISITION_STATUS_CHANGE');
    expect(SCOPE.replacementEffect).toBe('NO_REPLACEMENT_REASON');
    expect(SCOPE.acquisitionEffect).toBe(PRIOR.acquisitionEffect);
    expect(SCOPE.replacementEffect).toBe(PRIOR.replacementEffect);
    expect(decision.clause9_sd9Unchanged).toMatchObject({
      priorDecision: 'SHORT_TEXT_AMBIGUITY_BLOCKS_ONLY_WHEN_IT_CAN_CHANGE_SD9',
      priorDecisionRevised: false,
      changesAcquisitionSuccess: false,
      changesReplacement: false,
    });
    expect(decision.clause10_noReplacementEffect).toMatchObject({
      consumesAReserveForSampleMembershipAmbiguity: false,
    });
  });

  it('is global, pre-label and outcome-blind, and does not carry over to a future generation with headroom', () => {
    expect(decision.clause11_globalPreLabelDecision).toMatchObject({
      appliesGlobally: true,
      appliesTo: ['SET_P', 'SET_R'],
      chosenBeforeAnyA4LabelExists: true,
      gatedSealedRankPositionInspectedToSelectIt: false,
      realCapReadinessComputedToSelectIt: false,
      slotBySlotDiscretion: false,
    });
    expect(
      decision.clause12_futureCapRelaxation
        .appliesAutomaticallyToAGenerationWithPostInitialCapExtensionHeadroom,
    ).toBe(false);
  });

  it('is plain frozen data carrying no algorithm', () => {
    expect(Object.isFrozen(SCOPE)).toBe(true);
    for (const value of Object.values(SCOPE)) expect(typeof value).not.toBe('function');
  });

  it('no K5: four historical markers, four resolved, none unresolved', () => {
    expect(contracts.A3_PREP_OWNER_DECISION_MARKERS).toHaveLength(4);
    expect(contracts.A3_PREP_RESOLVED_OWNER_DECISION_MARKERS).toHaveLength(4);
    expect(contracts.A3_PREP_UNRESOLVED_OWNER_DECISION_MARKERS).toHaveLength(0);
    expect(contracts.A3_PREP_OWNER_DECISION_MARKERS.join('\n')).not.toMatch(
      /SHORT_TEXT|REACHABLE|K5/,
    );
    expect(Object.keys(contracts).filter((name) => /K5/.test(name))).toEqual([]);
    expect(decision.clause13_kState).toMatchObject({
      historicalMarkers: 4,
      resolved: 4,
      unresolved: 0,
      numberedK5Created: false,
    });
  });
});

// ---------------------------------------------------------------------------
// ZERO EXTENSION HEADROOM. Arithmetic over the canonical caps; the owner
// binding is data, so the proof lives here rather than in a runtime helper.
// ---------------------------------------------------------------------------

describe('2D-A3 reachable short-text membership: zero extension headroom', () => {
  const CAPS = [
    ['SET_P', contracts.SET_P_MAX_PAGES_PER_ORGANISATION],
    ['SET_R', contracts.SET_R_MAX_PAGES_PER_ORGANISATION],
  ] as const;

  it('the record cites the canonical caps', () => {
    expect(contracts.SET_P_MAX_PAGES_PER_ORGANISATION).toBe(8);
    expect(contracts.SET_R_MAX_PAGES_PER_ORGANISATION).toBe(4);
    const applied = record.zeroExtensionHeadroomProof.perOrganisationStatement.appliedTo;
    expect(applied.SET_P).toEqual({ c: contracts.SET_P_MAX_PAGES_PER_ORGANISATION, holds: true });
    expect(applied.SET_R).toEqual({ c: contracts.SET_R_MAX_PAGES_PER_ORGANISATION, holds: true });
  });

  for (const [sample, cap] of CAPS) {
    it(`${sample} (cap ${cap}): no survivor count leaves BOTH an unselected survivor and cap headroom`, () => {
      for (let m = 0; m <= 10_000; m += 1) {
        const selected = Math.min(cap, m);
        const remaining = m - selected;
        const headroom = cap - selected;
        expect(Math.min(remaining, headroom), `m=${m}`).toBe(0);
        expect(remaining > 0 && headroom > 0, `m=${m}`).toBe(false);
        // Below cap => every survivor already selected; unselected survivors => at cap.
        if (selected < cap) expect(remaining, `m=${m}`).toBe(0);
        if (remaining > 0) expect(selected, `m=${m}`).toBe(cap);
      }
    });

    it(`${sample}: split-wide, no organisation can receive an extension item`, () => {
      // Every organisation of a split, over a spread of survivor counts: none
      // holds both a candidate for extension and room for it.
      const survivorCounts = Array.from({ length: 45 }, (_, i) => (i * 7) % (3 * cap));
      const addable = survivorCounts.filter((m) => m > Math.min(cap, m) && Math.min(cap, m) < cap);
      expect(addable).toEqual([]);
    });
  }

  it('the record keeps the shortfall check reachable and the addition step unreachable', () => {
    expect(record.zeroExtensionHeadroomProof.splitWideStatement).toMatchObject({
      sd5Sd6ExtensionAdditionStepReachable: false,
      sd5Sd6ShortfallCheckReachable: true,
      shortfallCheckMayEndIn: 'CORPUS_FREEZE_REFUSED',
      crossSplitBorrowing: 'FORBIDDEN (Plan V1 extensionRule)',
    });
  });
});

// ---------------------------------------------------------------------------
// PREFLIGHT CONSEQUENCE, over sanitised synthetic summaries.
// ---------------------------------------------------------------------------

type Kind = 'EXACT' | 'CAP_EXACT_TAIL_BLOCKED' | 'CAP_BLOCKED' | 'FEWER_THAN_CAP_TAIL';

function pSummary(selectionIndex: number, split: contracts.Split, kind: Kind) {
  const base = {
    kind: 'A3_SET_P_FREEZE_SLOT_READINESS_SANITISED' as const,
    selectionIndex: selectionIndex as A3SelectionIndex,
    split,
  };
  const facts: Record<Kind, Omit<A3SetPFreezeSlotReadiness, keyof typeof base>> = {
    EXACT: {
      initialCapReadiness: SET_P_INITIAL_CAP_EXACT,
      fullRankReadiness: SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
      measurableSurvivorCount: 11,
      shortTextUnresolvedCount: 0,
      firstBlockedSourceRankPosition: null,
      exactMeasurableSurvivorPrefixCount: 11,
    },
    CAP_EXACT_TAIL_BLOCKED: {
      initialCapReadiness: SET_P_INITIAL_CAP_EXACT,
      fullRankReadiness: SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
      measurableSurvivorCount: 9,
      shortTextUnresolvedCount: 3,
      firstBlockedSourceRankPosition: 8,
      exactMeasurableSurvivorPrefixCount: 8,
    },
    CAP_BLOCKED: {
      initialCapReadiness: SET_P_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP,
      fullRankReadiness: SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
      measurableSurvivorCount: 9,
      shortTextUnresolvedCount: 1,
      firstBlockedSourceRankPosition: 4,
      exactMeasurableSurvivorPrefixCount: 4,
    },
    FEWER_THAN_CAP_TAIL: {
      initialCapReadiness: SET_P_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP,
      fullRankReadiness: SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
      measurableSurvivorCount: 5,
      shortTextUnresolvedCount: 1,
      firstBlockedSourceRankPosition: 40,
      exactMeasurableSurvivorPrefixCount: 5,
    },
  };
  return { ...base, ...facts[kind] } as A3SetPFreezeSlotReadiness;
}

function rSummary(selectionIndex: number, split: contracts.Split, kind: Kind) {
  const base = {
    kind: 'A3_SET_R_FREEZE_SLOT_READINESS_SANITISED' as const,
    selectionIndex: selectionIndex as A3SelectionIndex,
    split,
  };
  const facts: Record<Kind, Omit<A3SetRFreezeSlotReadiness, keyof typeof base>> = {
    EXACT: {
      initialCapReadiness: SET_R_INITIAL_CAP_EXACT,
      fullRankReadiness: SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
      measurableSurvivorCount: 6,
      shortTextUnresolvedCount: 0,
      firstBlockedSourceRankPosition: null,
      exactMeasurableSurvivorPrefixCount: 6,
    },
    CAP_EXACT_TAIL_BLOCKED: {
      initialCapReadiness: SET_R_INITIAL_CAP_EXACT,
      fullRankReadiness: SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
      measurableSurvivorCount: 7,
      shortTextUnresolvedCount: 2,
      firstBlockedSourceRankPosition: 4,
      exactMeasurableSurvivorPrefixCount: 4,
    },
    CAP_BLOCKED: {
      initialCapReadiness: SET_R_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP,
      fullRankReadiness: SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
      measurableSurvivorCount: 6,
      shortTextUnresolvedCount: 1,
      firstBlockedSourceRankPosition: 2,
      exactMeasurableSurvivorPrefixCount: 2,
    },
    FEWER_THAN_CAP_TAIL: {
      initialCapReadiness: SET_R_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP,
      fullRankReadiness: SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
      measurableSurvivorCount: 3,
      shortTextUnresolvedCount: 1,
      firstBlockedSourceRankPosition: 30,
      exactMeasurableSurvivorPrefixCount: 3,
    },
  };
  return { ...base, ...facts[kind] } as A3SetRFreezeSlotReadiness;
}

function collections(kinds: ReadonlyMap<number, Kind> = new Map()) {
  const setP: A3SetPFreezeSlotReadiness[] = [];
  const setR: A3SetRFreezeSlotReadiness[] = [];
  for (const split of contracts.SPLITS) {
    for (let i = 0; i < contracts.GENERATION_1_SPLIT_ORGANISATION_COUNTS[split]; i += 1) {
      const position = setP.length;
      const kind = kinds.get(position) ?? 'EXACT';
      setP.push(pSummary(position * 5 + 2, split, kind));
      setR.push(rSummary(position * 5 + 2, split, kind));
    }
  }
  return { setP, setR };
}

function clearK4() {
  return (['DEV_CONFIRM', 'FINAL_HOLDOUT'] as const).map((split) => {
    const identity = Array.from(
      { length: contracts.GENERATION_1_SPLIT_ORGANISATION_COUNTS[split] },
      () => 1,
    );
    return deriveK4FreezeReadiness({
      split,
      contributions: { G1: identity, G2: identity, G4: identity, G5: identity, G6: identity },
    });
  });
}

describe('2D-A3 reachable short-text membership: preflight consequence', () => {
  it('cap exact + unresolved tail in both samples: both gates clear, full-rank fact still BLOCKED', () => {
    const { setP, setR } = collections(
      new Map<number, Kind>([
        [21, 'CAP_EXACT_TAIL_BLOCKED'],
        [88, 'CAP_EXACT_TAIL_BLOCKED'],
      ]),
    );
    expect(setP[21]!.fullRankReadiness).toBe(SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT);
    expect(setR[88]!.fullRankReadiness).toBe(SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT);
    expect(checkSetPShortTextCorpusFreezeGate(setP).status).toBe(
      SHORT_TEXT_CORPUS_FREEZE_GATE_CLEAR,
    );
    expect(checkSetRShortTextCorpusFreezeGate(setR).status).toBe(
      SHORT_TEXT_CORPUS_FREEZE_GATE_CLEAR,
    );
    const overall = checkCurrentA3CorpusFreezePreflight({ setP, setR, k4: clearK4() });
    expect(overall.status).toBe(
      A3_CORPUS_FREEZE_PREFLIGHT_CURRENT_BLOCKERS_CLEAR_NOT_FREEZE_AUTHORITY,
    );
    // Unrelated missing evidence is still listed.
    for (const notChecked of [
      'REAL_ACQUISITION_COMPLETION',
      'REAL_SET_P_AND_SET_R_PREPARATION_MATERIALISATION',
      'A4_LABELS',
      'FINAL_MANIFEST_HASHES',
    ]) {
      expect(overall.notCheckedByCurrentPrep).toContain(notChecked);
    }
  });

  for (const kind of ['CAP_BLOCKED', 'FEWER_THAN_CAP_TAIL'] as const) {
    it(`${kind} in each sample refuses, counting only cap-blocked slots, with both policy bindings`, () => {
      const { setP, setR } = collections(
        new Map<number, Kind>([
          [5, kind],
          [6, 'CAP_EXACT_TAIL_BLOCKED'],
          [60, 'CAP_EXACT_TAIL_BLOCKED'],
        ]),
      );
      const overall = checkCurrentA3CorpusFreezePreflight({ setP, setR, k4: clearK4() });
      expect(overall.status).toBe(A3_CORPUS_FREEZE_PREFLIGHT_REFUSED);
      const shortText = overall.blockers.filter(
        (b) => b.blockerClass === 'SHORT_TEXT_REQUIRED_SELECTED_MEMBERSHIP_UNRESOLVED_AT_FREEZE',
      );
      expect(shortText).toHaveLength(2);
      for (const b of shortText) {
        expect(b).toMatchObject({
          refusal: 'CORPUS_FREEZE_REFUSED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED',
          policyDecisionToken: PRIOR.decisionToken,
          policyDecisionRecordSha256: PRIOR.decisionRecordSha256,
          requiredMembershipScopeDecisionToken: SCOPE.decisionToken,
          requiredMembershipScopeDecisionRecordSha256: SCOPE.decisionRecordSha256,
          requiredMembershipScope: 'REACHABLE_SELECTED_CAPPED_MEMBERSHIP',
          acquisitionEffect: 'NO_ACQUISITION_STATUS_CHANGE',
          replacementEffect: 'NO_REPLACEMENT_REASON',
          totalSlotCount: contracts.GENERATION_1_SELECTED_ORGANISATIONS,
          blockedSlotCount: 1,
        });
      }
      expect(checkSetPShortTextCorpusFreezeGate(setP).status).toBe(
        SHORT_TEXT_CORPUS_FREEZE_GATE_REFUSED,
      );
    });
  }
});
