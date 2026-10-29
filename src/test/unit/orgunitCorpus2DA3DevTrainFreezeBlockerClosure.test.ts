/**
 * PHASE 2B-2D A3 R44 — THE DEV_TRAIN CORPUS-FREEZE BLOCKER AND PHASE BOUNDARY.
 *
 * Committed-governance inspection only. R44 changes no corpus semantics; it
 * proves, from the frozen contracts and the exact committed R43 record, that:
 *
 *   - the canonical DEV_TRAIN preparation chain is complete (20 / 20 at every
 *     layer) and every mechanical SD9 status is successful;
 *   - that is NOT corpus-freeze clearance: 6 SET_P and 4 SET_R REQUIRED
 *     (reachable selected capped) memberships remain BLOCKED by unresolved
 *     short text, and the frozen owner policy refuses the freeze on ANY such
 *     blocker - mechanical SD9 success does not override it;
 *   - the canonical overall preflight needs the complete 110-slot cohort in
 *     both samples (20 / 45 / 45) plus one K4 readiness per sealed split
 *     (DEV_CONFIRM, FINAL_HOLDOUT), so a DEV_TRAIN-only state is structurally
 *     not its input, and R44 does not run it on real objects;
 *   - even its best possible result is not freeze authority.
 *
 * The one call to `checkCurrentA3CorpusFreezePreflight` here takes INVENTED
 * synthetic summaries only. No real R43 readiness object, selection index or
 * identity is constructed, loaded or passed. Nothing here reads a database,
 * the network, a sealed root or any DEV_CONFIRM / FINAL_HOLDOUT evidence.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  A3_GATED_SPLITS,
  A3_PREP_OWNER_DECISIONS_REQUIRED,
  GENERATION_1_SELECTED_ORGANISATIONS,
  GENERATION_1_SPLIT_ORGANISATION_COUNTS,
  SHORT_TEXT_BLOCKED_SAMPLE_ACQUISITION_EFFECT,
  SHORT_TEXT_BLOCKED_SAMPLE_FREEZE_EFFECT,
  SHORT_TEXT_BLOCKED_SAMPLE_FREEZE_REFUSAL,
  SHORT_TEXT_BLOCKED_SAMPLE_REPLACEMENT_EFFECT,
  SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY,
  SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY,
  SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY_KIND,
  SPLITS,
  type Split,
} from '../harness/phase2b2d/a3prep/contracts.js';
import {
  A3_CORPUS_FREEZE_PREFLIGHT_CURRENT_BLOCKERS_CLEAR_NOT_FREEZE_AUTHORITY,
  A3_CORPUS_FREEZE_PREFLIGHT_KIND,
  A3_CORPUS_FREEZE_PREFLIGHT_NOT_CHECKED_BY_CURRENT_PREP,
  A3_CORPUS_FREEZE_PREFLIGHT_REFUSED,
  checkCurrentA3CorpusFreezePreflight,
  checkSetPShortTextCorpusFreezeGate,
  checkSetRShortTextCorpusFreezeGate,
  SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
  SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
  SET_P_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP,
  SET_P_INITIAL_CAP_EXACT,
  SHORT_TEXT_CORPUS_FREEZE_GATE_REFUSED,
  type A3FreezePreflightBlocker,
  type A3SetPFreezeSlotReadiness,
} from '../harness/phase2b2d/a3prep/corpusFreezePreflight.js';
import {
  deriveK4FreezeReadiness,
  type A3K4FreezeReadiness,
  type A3Sd4NonG3Gate,
} from '../harness/phase2b2d/a3prep/organisationCaps.js';
import {
  SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
  SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
  SET_R_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP,
  SET_R_INITIAL_CAP_EXACT,
  type A3SetRFreezeSlotReadiness,
} from '../harness/phase2b2d/a3prep/setRSd7Readiness.js';
import type { A3SelectionIndex } from '../harness/phase2b2d/a3prep/types.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** The exact R43 tip R44 was cut from. */
const R43_TERMINAL = 'f84ea09031d460b28c9386e1d6cd7fb56d4569ab';
/**
 * R44'S OWN TERMINAL COMMIT. The owner-record enumeration below is a statement
 * about R44's tree - "at R44 terminal no later owner record resolved short-text
 * membership" - so it reads that tree, not HEAD. Later slices' records must not
 * falsify a historical statement; the expected set is unchanged.
 */
const R44_TERMINAL = '4fd9ffd469333ba181584d56018c61e9ae119c77';
const R43_RECORD_PATH =
  'docs/evaluation/PHASE_2B_2D_A3_R43_DEV_TRAIN_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS_V1.json';
const R43_RECORD_SHA256 = 'a152885fecd8fa7e215d44cb6c0dfc73f1a04e1c23f38bca974a27d94618cba3';
const R43_TERMINAL_STATE =
  'R43_INCREMENTAL_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_V5_COMPLETE_READY_FOR_COMPLETE_CORPUS_PREFLIGHT';

/** The canonical preflight and contracts, byte-pinned at the R43 tip. */
const PINNED_AT_R43: Readonly<Record<string, string>> = {
  'src/test/harness/phase2b2d/a3prep/corpusFreezePreflight.ts':
    'ddae984fec947845ec2e2df9feb24bf8b8f75c28993b413919c08a69c307fe75',
  'src/test/harness/phase2b2d/a3prep/contracts.ts':
    '4d856f45dd6016e1007d661f31388bf7bdbefd71862a6585ed4962240454b40f',
  'src/test/harness/phase2b2d/a3prep/setRSd7Readiness.ts':
    '6db33d0d39d9ab90fbf2e1b8b44a9649a6aa6db380d9f97cb5f1f8bdeb19561a',
  'src/test/harness/phase2b2d/a3prep/organisationCaps.ts':
    '20432a5c7bd78ef7ec78e61b7a37e69abe5849539eca07564cc091bf6afc302c',
};

/** The three short-text owner records, by the hashes the canonical contracts already bind. */
const SHORT_TEXT_OWNER_RECORDS = {
  sd7Decision: {
    path: 'docs/evaluation/PHASE_2B_2D_METHOD_V2_SD7_SHORT_TEXT_OWNER_DECISION_V1.json',
    sha256: '2f41f495322eceae3b675cbe1d227115f3b4292d6e3a711879793af33b466fff',
  },
  membershipPolicy: {
    path: SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY.decisionRecordPath,
    sha256: SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY.decisionRecordSha256,
  },
  reachableClarification: {
    path: SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY.decisionRecordPath,
    sha256: SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY.decisionRecordSha256,
  },
} as const;

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
}

function commitExists(commit: string): boolean {
  try {
    git('cat-file', '-e', `${commit}^{commit}`);
    return true;
  } catch {
    return false;
  }
}

const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');

const r43Available = commitExists(R43_TERMINAL);

interface SampleCoverage {
  readonly reachableMembershipExactSlotCount: number;
  readonly reachableMembershipBlockedSlotCount: number;
  readonly sd9MechanicalSuccessfulSlotCount: number;
  readonly sd9MechanicalUnsuccessfulSlotCount: number;
  readonly sd9MechanicalPendingSlotCount: number;
}

interface R43Record {
  readonly split: string;
  readonly implementationCommit: string;
  readonly thisFileAuthorises: readonly unknown[];
  readonly terminalState: string;
  readonly canonicalConstants: Readonly<Record<string, unknown>>;
  readonly semantics: Readonly<Record<string, unknown>>;
  readonly sd9AuthorityBoundary: Readonly<Record<string, unknown>>;
  readonly access: Readonly<Record<string, unknown>>;
  readonly whatThisIsNot: readonly string[];
  readonly coverage: {
    readonly coverage: {
      readonly setP: SampleCoverage;
      readonly setR: SampleCoverage;
      readonly crossSample: {
        readonly bothSamplesMechanicallySuccessfulSlotCount: number;
        readonly sd9StatusDisagreementSlotCount: number;
      };
    };
    readonly [key: string]: unknown;
  };
}

/** The committed R43 record, read from the exact R43 commit - never from a later tree. */
function r43Record(): R43Record {
  return JSON.parse(git('show', `${R43_TERMINAL}:${R43_RECORD_PATH}`)) as R43Record;
}

// ---------------------------------------------------------------------------
// Synthetic, INVENTED summaries. Selection indices here are arbitrary integers
// from a range no real slot uses as a set; they describe no organisation.
// ---------------------------------------------------------------------------

const INVENTED_INDEX_BASE = 900_000;

function exactP(position: number, split: Split): A3SetPFreezeSlotReadiness {
  return {
    kind: 'A3_SET_P_FREEZE_SLOT_READINESS_SANITISED',
    selectionIndex: (INVENTED_INDEX_BASE + position) as A3SelectionIndex,
    split,
    initialCapReadiness: SET_P_INITIAL_CAP_EXACT,
    fullRankReadiness: SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
    measurableSurvivorCount: 10,
    shortTextUnresolvedCount: 0,
    firstBlockedSourceRankPosition: null,
    exactMeasurableSurvivorPrefixCount: 10,
  };
}

function capBlockedP(position: number, split: Split): A3SetPFreezeSlotReadiness {
  return {
    kind: 'A3_SET_P_FREEZE_SLOT_READINESS_SANITISED',
    selectionIndex: (INVENTED_INDEX_BASE + position) as A3SelectionIndex,
    split,
    initialCapReadiness: SET_P_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP,
    fullRankReadiness: SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
    measurableSurvivorCount: 10,
    shortTextUnresolvedCount: 1,
    firstBlockedSourceRankPosition: 2,
    exactMeasurableSurvivorPrefixCount: 2,
  };
}

function exactR(position: number, split: Split): A3SetRFreezeSlotReadiness {
  return {
    kind: 'A3_SET_R_FREEZE_SLOT_READINESS_SANITISED',
    selectionIndex: (INVENTED_INDEX_BASE + position) as A3SelectionIndex,
    split,
    initialCapReadiness: SET_R_INITIAL_CAP_EXACT,
    fullRankReadiness: SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT,
    measurableSurvivorCount: 6,
    shortTextUnresolvedCount: 0,
    firstBlockedSourceRankPosition: null,
    exactMeasurableSurvivorPrefixCount: 6,
  };
}

function capBlockedR(position: number, split: Split): A3SetRFreezeSlotReadiness {
  return {
    kind: 'A3_SET_R_FREEZE_SLOT_READINESS_SANITISED',
    selectionIndex: (INVENTED_INDEX_BASE + position) as A3SelectionIndex,
    split,
    initialCapReadiness: SET_R_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP,
    fullRankReadiness: SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT,
    measurableSurvivorCount: 6,
    shortTextUnresolvedCount: 1,
    firstBlockedSourceRankPosition: 1,
    exactMeasurableSurvivorPrefixCount: 1,
  };
}

/** An invented collection over `splits`, the first `blocked` positions cap-blocked. */
function invented<T>(
  splits: readonly Split[],
  blocked: number,
  exact: (position: number, split: Split) => T,
  capBlocked: (position: number, split: Split) => T,
): T[] {
  const out: T[] = [];
  for (const split of splits) {
    for (let i = 0; i < GENERATION_1_SPLIT_ORGANISATION_COUNTS[split]; i += 1) {
      const position = out.length;
      out.push(position < blocked ? capBlocked(position, split) : exact(position, split));
    }
  }
  return out;
}

/** An invented, all-clear K4 readiness per gated split (identity contributions). */
function inventedClearK4(): A3K4FreezeReadiness[] {
  return A3_GATED_SPLITS.map((split) => {
    const identity = Array.from({ length: GENERATION_1_SPLIT_ORGANISATION_COUNTS[split] }, () => 1);
    const contributions = Object.fromEntries(
      (['G1', 'G2', 'G4', 'G5', 'G6'] as const).map((gate) => [gate, identity]),
    ) as Record<A3Sd4NonG3Gate, number[]>;
    return deriveK4FreezeReadiness({ split, contributions });
  });
}

const DEV_TRAIN_ONLY: readonly Split[] = ['DEV_TRAIN'];

const blockerClasses = (blockers: readonly A3FreezePreflightBlocker[]): string[] =>
  blockers.map((b) => b.blockerClass);

// ---------------------------------------------------------------------------
// A. THE EXACT R43 BINDING.
// ---------------------------------------------------------------------------

describe.skipIf(!r43Available)('2D-A3 R44: binds the exact committed R43 record', () => {
  it('reads the R43 record at the exact R43 terminal, byte-pinned', () => {
    expect(sha256(git('show', `${R43_TERMINAL}:${R43_RECORD_PATH}`))).toBe(R43_RECORD_SHA256);
  });

  it('the R43 record is unchanged in the current tree (R44 edits no R43 artifact)', () => {
    expect(git('diff', '--name-only', R43_TERMINAL, '--', R43_RECORD_PATH).trim()).toBe('');
  });

  it('carries the R43 terminal, read narrowly: DEV_TRAIN readiness only, authorising nothing', () => {
    const record = r43Record();
    expect(record.terminalState).toBe(R43_TERMINAL_STATE);
    expect(record.split).toBe('DEV_TRAIN');
    expect(record.thisFileAuthorises).toEqual([]);
    expect(git('rev-parse', `${R43_TERMINAL}^`).trim()).toBe(record.implementationCommit);
    expect(record.semantics.completeCorpusPreflightRun).toBe(false);
    expect(record.coverage.completePreflightClear).toBe(false);
    expect(record.coverage.corpusFreezeApproved).toBe(false);
    expect(record.coverage.a5Frozen).toBe(false);
    expect(record.whatThisIsNot).toContain('NOT_A_COMPLETE_CORPUS_FREEZE_PREFLIGHT');
    expect(record.whatThisIsNot).toContain('NOT_AN_A5_FREEZE');
  });
});

// ---------------------------------------------------------------------------
// B. DEV_TRAIN PIPELINE COMPLETION AND MECHANICAL SD9.
// ---------------------------------------------------------------------------

describe.skipIf(!r43Available)('2D-A3 R44: DEV_TRAIN pipeline completion', () => {
  it('every coverage layer is 20, the canonical DEV_TRAIN slot count', () => {
    const { coverage } = r43Record();
    expect(GENERATION_1_SPLIT_ORGANISATION_COUNTS.DEV_TRAIN).toBe(20);
    for (const layer of [
      'authorityCoverage',
      'evidenceCoverage',
      'documentCoverage',
      'graphCoverage',
      'sampleCoverage',
      'readinessCoverageAfterR43',
    ]) {
      expect(coverage[layer], layer).toBe(GENERATION_1_SPLIT_ORGANISATION_COUNTS.DEV_TRAIN);
    }
  });

  it('mechanical SD9 is 20 successful / 0 unsuccessful / 0 pending in both samples, 0 disagreements', () => {
    const { setP, setR, crossSample } = r43Record().coverage.coverage;
    for (const sample of [setP, setR]) {
      expect(sample.sd9MechanicalSuccessfulSlotCount).toBe(20);
      expect(sample.sd9MechanicalUnsuccessfulSlotCount).toBe(0);
      expect(sample.sd9MechanicalPendingSlotCount).toBe(0);
    }
    expect(crossSample.bothSamplesMechanicallySuccessfulSlotCount).toBe(20);
    expect(crossSample.sd9StatusDisagreementSlotCount).toBe(0);
  });

  it('that SD9 is A3-mechanical only: no acquisition status, replacement or reserve effect', () => {
    const record = r43Record();
    expect(record.semantics.sd9MechanicalOnly).toBe(true);
    expect(record.sd9AuthorityBoundary.a3MechanicalReadinessOnly).toBe(true);
    expect(record.sd9AuthorityBoundary.rewritesA2AcquisitionStatus).toBe(false);
    expect(record.sd9AuthorityBoundary.createsReplacementObligation).toBe(false);
    expect(record.sd9AuthorityBoundary.consumesReserve).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C. THE REQUIRED-MEMBERSHIP BLOCKERS AND THE FROZEN SHORT-TEXT POLICY.
// ---------------------------------------------------------------------------

describe.skipIf(!r43Available)('2D-A3 R44: required-membership blockers', () => {
  it('SET_P reachable membership is 14 exact / 6 blocked; SET_R 16 exact / 4 blocked', () => {
    const { setP, setR } = r43Record().coverage.coverage;
    expect(setP.reachableMembershipExactSlotCount).toBe(14);
    expect(setP.reachableMembershipBlockedSlotCount).toBe(6);
    expect(setR.reachableMembershipExactSlotCount).toBe(16);
    expect(setR.reachableMembershipBlockedSlotCount).toBe(4);
    for (const sample of [setP, setR]) {
      expect(
        sample.reachableMembershipExactSlotCount + sample.reachableMembershipBlockedSlotCount,
      ).toBe(GENERATION_1_SPLIT_ORGANISATION_COUNTS.DEV_TRAIN);
    }
  });

  it('those counts are REQUIRED membership under the canonical reachable-membership token', () => {
    const constants = r43Record().canonicalConstants;
    expect(constants.reachableMembershipDecisionToken).toBe(
      'SHORT_TEXT_REQUIRED_SAMPLE_MEMBERSHIP_LIMITED_TO_REACHABLE_CAPPED_MEMBERSHIP_V1',
    );
    expect(constants.reachableMembershipDecisionToken).toBe(
      SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY.decisionToken,
    );
    expect(constants.requiredMembershipScope).toBe('REACHABLE_SELECTED_CAPPED_MEMBERSHIP');
    expect(constants.requiredMembershipScope).toBe(
      SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY.requiredMembershipScope,
    );
    expect(constants.generation).toBe(SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY.generation);
  });

  it('a blocked REQUIRED membership refuses the freeze with the canonical refusal token', () => {
    expect(SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY.freezePolicy).toBe(
      'REFUSE_IF_REQUIRED_MEMBERSHIP_BLOCKED',
    );
    expect(SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY.freezeEffect).toBe('REFUSE_CORPUS_FREEZE');
    expect(SHORT_TEXT_BLOCKED_SAMPLE_FREEZE_EFFECT).toBe('REFUSE_CORPUS_FREEZE');
    expect(SHORT_TEXT_BLOCKED_SAMPLE_FREEZE_REFUSAL).toBe(
      'CORPUS_FREEZE_REFUSED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED',
    );
    expect(SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY.capBlockedFreezeEffect).toBe(
      'REFUSE_CORPUS_FREEZE',
    );
    expect(SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY.capBlockedFreezeRefusal).toBe(
      SHORT_TEXT_BLOCKED_SAMPLE_FREEZE_REFUSAL,
    );
  });

  it('the selected policy is ambiguity propagation / invariant-only materialisation, semantics unresolved', () => {
    expect(SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY.policy).toBe(
      'PROPAGATE_AMBIGUITY_MATERIALISE_ONLY_INVARIANTS',
    );
    expect(SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY_KIND).toBe(
      'PROPAGATE_AMBIGUITY_MATERIALISE_ONLY_INVARIANTS',
    );
    expect(SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY.materialisationRule).toBe(
      'MATERIALISE_ONLY_MEMBERSHIP_INVARIANT_ACROSS_ALL_ADMISSIBLE_SHORT_TEXT_TREATMENTS',
    );
    expect(SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY.semanticNearDuplicateStatus).toBe(
      'REMAINS_UNRESOLVED',
    );
    expect(SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY.semanticNearDuplicateStatus).toBe(
      'REMAINS_UNRESOLVED',
    );
  });

  it.each(Object.entries(SHORT_TEXT_OWNER_RECORDS))(
    'the %s owner record is byte-identical to its bound hash',
    (_name, { path, sha256: pin }) => {
      expect(sha256(git('show', `HEAD:${path}`))).toBe(pin);
    },
  );

  it('the owner records keep blocked non-invariant membership BLOCKED and reject every current-policy resolution', () => {
    const policy = JSON.parse(
      git('show', `HEAD:${SHORT_TEXT_OWNER_RECORDS.membershipPolicy.path}`),
    ) as {
      analysisRecommendation: {
        optionsConsidered: Record<string, { rejected: boolean; summary: string }>;
      };
      ownerDecision: {
        clause6_invariantOnlyMaterialisation: { otherwise: string; forbiddenResolutions: string[] };
        clause11_corpusFreezeConsequence: { refusalToken: string; proceedingRequires: string };
        clause16_noMethodologyFallbackRule: { authorises: unknown[]; doesNotAuthorise: string[] };
      };
    };
    const options = policy.analysisRecommendation.optionsConsidered;
    expect(Object.keys(options).sort()).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(options.C!.rejected).toBe(false);
    for (const rejected of ['A', 'B', 'D', 'E']) expect(options[rejected]!.rejected).toBe(true);
    expect(options.A!.summary).toMatch(/ALWAYS INCLUDE/);
    expect(options.B!.summary).toMatch(/minimum-token eligibility filter/);
    expect(options.D!.summary).toMatch(/fallback similarity/);
    expect(options.E!.summary).toMatch(/human judgement, labels or model output/);

    const decision = policy.ownerDecision;
    expect(decision.clause6_invariantOnlyMaterialisation.otherwise).toBe('BLOCKED');
    expect(decision.clause6_invariantOnlyMaterialisation.forbiddenResolutions).toEqual(
      expect.arrayContaining([
        'per-case judgement',
        'label-assisted decision',
        'model-assisted decision',
      ]),
    );
    expect(decision.clause11_corpusFreezeConsequence.refusalToken).toBe(
      SHORT_TEXT_BLOCKED_SAMPLE_FREEZE_REFUSAL,
    );
    expect(decision.clause11_corpusFreezeConsequence.proceedingRequires).toBe(
      'a separate GLOBAL pre-label owner/methodology decision',
    );
    expect(decision.clause16_noMethodologyFallbackRule.authorises).toEqual([]);
    expect(decision.clause16_noMethodologyFallbackRule.doesNotAuthorise).toEqual(
      expect.arrayContaining([
        'smaller token n-grams',
        'character shingles',
        'special empty-set Jaccard',
        'always-include',
      ]),
    );

    const clarification = JSON.parse(
      git('show', `HEAD:${SHORT_TEXT_OWNER_RECORDS.reachableClarification.path}`),
    ) as {
      explicitlyNotClassifiedAs: string[];
      ownerDecision: {
        clause3_exactCapMembershipRemainsMandatory: {
          ifShortTextAmbiguityCanAlterSelectedCapMembership: string;
        };
        clause8_noSemanticShortTextDecision: { remains: string; stillForbidden: string[] };
      };
    };
    expect(clarification.explicitlyNotClassifiedAs).toEqual(
      expect.arrayContaining(['METHODOLOGY_AMENDMENT', 'METHODOLOGY_V2_R4', 'EXECUTION_AUTHORITY']),
    );
    expect(
      clarification.ownerDecision.clause3_exactCapMembershipRemainsMandatory
        .ifShortTextAmbiguityCanAlterSelectedCapMembership,
    ).toBe('REFUSE');
    expect(clarification.ownerDecision.clause8_noSemanticShortTextDecision.remains).toBe(
      'EXACTLY_UNRESOLVED',
    );
    expect(clarification.ownerDecision.clause8_noSemanticShortTextDecision.stillForbidden).toEqual(
      expect.arrayContaining([
        'ALWAYS INCLUDE',
        'a special empty Jaccard',
        'a smaller n-gram fallback',
        'character similarity',
        'label-assisted judgement',
        'model-assisted judgement',
      ]),
    );
  });

  it('no committed owner record after the clarification resolves short-text membership', () => {
    const shortTextRecords = git(
      'ls-tree',
      '-r',
      '--name-only',
      R44_TERMINAL,
      '--',
      'docs/evaluation',
    )
      .split('\n')
      .filter((path) => /SHORT_TEXT/.test(path));
    expect(shortTextRecords.sort()).toEqual(
      Object.values(SHORT_TEXT_OWNER_RECORDS)
        .map((record) => record.path)
        .sort(),
    );
    expect(A3_PREP_OWNER_DECISIONS_REQUIRED).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// D. MECHANICAL SD9 SUCCESS DOES NOT CLEAR A MEMBERSHIP BLOCKER.
// ---------------------------------------------------------------------------

describe('2D-A3 R44: SD9 success is not freeze clearance', () => {
  it('the owner policy keeps acquisition success and exact membership separate states', () => {
    expect(SHORT_TEXT_BLOCKED_SAMPLE_ACQUISITION_EFFECT).toBe('NO_ACQUISITION_STATUS_CHANGE');
    expect(SHORT_TEXT_BLOCKED_SAMPLE_REPLACEMENT_EFFECT).toBe('NO_REPLACEMENT_REASON');
    expect(SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY.sd9).toBe('UNCHANGED');
    const clarification = JSON.parse(
      git('show', `HEAD:${SHORT_TEXT_OWNER_RECORDS.reachableClarification.path}`),
    ) as {
      ownerDecision: {
        clause9_sd9Unchanged: {
          anOrganisationMayBeAcquisitionSuccessfulWhileItsSelectedCapMembershipIsBlocked: boolean;
        };
      };
    };
    expect(
      clarification.ownerDecision.clause9_sd9Unchanged
        .anOrganisationMayBeAcquisitionSuccessfulWhileItsSelectedCapMembershipIsBlocked,
    ).toBe(true);
  });

  it.skipIf(!r43Available)(
    '20 successful SD9 statuses coexist with 6 / 4 blocked required memberships',
    () => {
      const { setP, setR } = r43Record().coverage.coverage;
      expect(setP.sd9MechanicalSuccessfulSlotCount).toBe(20);
      expect(setP.reachableMembershipExactSlotCount).toBeLessThan(
        setP.sd9MechanicalSuccessfulSlotCount,
      );
      expect(setR.sd9MechanicalSuccessfulSlotCount).toBe(20);
      expect(setR.reachableMembershipExactSlotCount).toBeLessThan(
        setR.sd9MechanicalSuccessfulSlotCount,
      );
    },
  );

  it('the freeze gate reads required membership only: an SD9-successful blocked slot still refuses', () => {
    // Invented 110-slot collections: every slot mechanically fine, one cap blocked.
    const setP = invented(SPLITS, 1, exactP, capBlockedP);
    const result = checkSetPShortTextCorpusFreezeGate(setP);
    expect(result.status).toBe(SHORT_TEXT_CORPUS_FREEZE_GATE_REFUSED);
    const setR = invented(SPLITS, 1, exactR, capBlockedR);
    expect(checkSetRShortTextCorpusFreezeGate(setR).status).toBe(
      SHORT_TEXT_CORPUS_FREEZE_GATE_REFUSED,
    );
  });
});

// ---------------------------------------------------------------------------
// E. THE COMPLETE-PREFLIGHT INPUT CONTRACT.
// ---------------------------------------------------------------------------

describe('2D-A3 R44: the complete preflight input contract', () => {
  it.each(Object.entries(PINNED_AT_R43))('%s is byte-identical to its R43 pin', (path, pin) => {
    expect(sha256(git('show', `HEAD:${path}`))).toBe(pin);
    if (r43Available) expect(sha256(git('show', `${R43_TERMINAL}:${path}`))).toBe(pin);
  });

  it('requires the complete 110-slot cohort, split 20 / 45 / 45', () => {
    expect(GENERATION_1_SELECTED_ORGANISATIONS).toBe(110);
    expect(SPLITS).toEqual(['DEV_TRAIN', 'DEV_CONFIRM', 'FINAL_HOLDOUT']);
    expect(GENERATION_1_SPLIT_ORGANISATION_COUNTS).toEqual({
      DEV_TRAIN: 20,
      DEV_CONFIRM: 45,
      FINAL_HOLDOUT: 45,
    });
  });

  it('requires one K4 readiness for exactly the gated splits DEV_CONFIRM and FINAL_HOLDOUT', () => {
    expect(A3_GATED_SPLITS).toEqual(['DEV_CONFIRM', 'FINAL_HOLDOUT']);
  });

  it.skipIf(!r43Available)(
    'R43 supplies DEV_TRAIN readiness only: 20 of 110, 0 of 2 K4 inputs',
    () => {
      const record = r43Record();
      expect(record.split).toBe('DEV_TRAIN');
      expect(record.coverage.readinessCoverageAfterR43).toBe(20);
      expect(record.semantics.k4Applied).toBe(false);
      expect(record.access.upstreamDevConfirmEvidenceReads).toBe(0);
      expect(record.access.upstreamFinalHoldoutEvidenceReads).toBe(0);
      expect(record.access.sealedRootReads).toBe(0);
      expect(GENERATION_1_SELECTED_ORGANISATIONS - 20).toBe(90);
    },
  );
});

// ---------------------------------------------------------------------------
// F. SYNTHETIC APPLICABILITY BOUNDARY. INVENTED IDENTITIES ONLY. This is NOT
//    the corpus preflight: it proves only that the canonical API structurally
//    refuses a DEV_TRAIN-only cohort.
// ---------------------------------------------------------------------------

describe('2D-A3 R44: synthetic DEV_TRAIN-only applicability boundary', () => {
  it('an invented, fully exact 20-slot DEV_TRAIN-only input is structurally refused', () => {
    const result = checkCurrentA3CorpusFreezePreflight({
      setP: invented(DEV_TRAIN_ONLY, 0, exactP, capBlockedP),
      setR: invented(DEV_TRAIN_ONLY, 0, exactR, capBlockedR),
      k4: [],
    });
    expect(result.kind).toBe(A3_CORPUS_FREEZE_PREFLIGHT_KIND);
    expect(result.status).toBe(A3_CORPUS_FREEZE_PREFLIGHT_REFUSED);
    expect(result.blockers).toEqual([
      expect.objectContaining({
        blockerClass: 'STRUCTURAL_PREFLIGHT_INPUT_INVALID',
        code: 'SLOT_COUNT_MISMATCH',
        sample: 'SET_P',
        expectedCount: 110,
        receivedCount: 20,
      }),
      expect.objectContaining({
        blockerClass: 'STRUCTURAL_PREFLIGHT_INPUT_INVALID',
        code: 'SLOT_COUNT_MISMATCH',
        sample: 'SET_R',
        expectedCount: 110,
        receivedCount: 20,
      }),
      expect.objectContaining({
        blockerClass: 'STRUCTURAL_PREFLIGHT_INPUT_INVALID',
        code: 'K4_READINESS_COUNT_MISMATCH',
        expectedCount: 2,
        receivedCount: 0,
      }),
    ]);
  });

  it('a structurally refused cohort never reaches the short-text gate: it is no corpus verdict', () => {
    const result = checkCurrentA3CorpusFreezePreflight({
      setP: invented(DEV_TRAIN_ONLY, 6, exactP, capBlockedP),
      setR: invented(DEV_TRAIN_ONLY, 4, exactR, capBlockedR),
      k4: [],
    });
    expect(result.status).toBe(A3_CORPUS_FREEZE_PREFLIGHT_REFUSED);
    expect(blockerClasses(result.blockers)).not.toContain(
      'SHORT_TEXT_REQUIRED_SELECTED_MEMBERSHIP_UNRESOLVED_AT_FREEZE',
    );
    expect(new Set(blockerClasses(result.blockers))).toEqual(
      new Set(['STRUCTURAL_PREFLIGHT_INPUT_INVALID']),
    );
  });
});

// ---------------------------------------------------------------------------
// G. A FUTURE COMPLETE PREFLIGHT CANNOT CLEAR THE UNCHANGED DEV_TRAIN BLOCKERS.
//    Invented identities; the 90 sealed-split entries are the BEST CASE (all
//    exact, K4 clear) - a model of the gate's monotonicity, not a prediction
//    about DEV_CONFIRM or FINAL_HOLDOUT.
// ---------------------------------------------------------------------------

describe('2D-A3 R44: the future-preflight consequence', () => {
  it('a best-case complete cohort is clear only when no required membership is blocked', () => {
    const clear = checkCurrentA3CorpusFreezePreflight({
      setP: invented(SPLITS, 0, exactP, capBlockedP),
      setR: invented(SPLITS, 0, exactR, capBlockedR),
      k4: inventedClearK4(),
    });
    expect(clear.status).toBe(
      A3_CORPUS_FREEZE_PREFLIGHT_CURRENT_BLOCKERS_CLEAR_NOT_FREEZE_AUTHORITY,
    );
    expect(clear.blockers).toEqual([]);
  });

  it('with 6 SET_P and 4 SET_R blocked required memberships, even the best case refuses', () => {
    const result = checkCurrentA3CorpusFreezePreflight({
      setP: invented(SPLITS, 6, exactP, capBlockedP),
      setR: invented(SPLITS, 4, exactR, capBlockedR),
      k4: inventedClearK4(),
    });
    expect(result.status).toBe(A3_CORPUS_FREEZE_PREFLIGHT_REFUSED);
    expect(result.blockers).toEqual([
      expect.objectContaining({
        blockerClass: 'SHORT_TEXT_REQUIRED_SELECTED_MEMBERSHIP_UNRESOLVED_AT_FREEZE',
        sample: 'SET_P',
        refusal: SHORT_TEXT_BLOCKED_SAMPLE_FREEZE_REFUSAL,
        totalSlotCount: 110,
        blockedSlotCount: 6,
      }),
      expect.objectContaining({
        blockerClass: 'SHORT_TEXT_REQUIRED_SELECTED_MEMBERSHIP_UNRESOLVED_AT_FREEZE',
        sample: 'SET_R',
        refusal: SHORT_TEXT_BLOCKED_SAMPLE_FREEZE_REFUSAL,
        totalSlotCount: 110,
        blockedSlotCount: 4,
      }),
    ]);
  });

  it('any single blocked required membership in either sample refuses', () => {
    for (const [p, r] of [
      [1, 0],
      [0, 1],
    ] as const) {
      const result = checkCurrentA3CorpusFreezePreflight({
        setP: invented(SPLITS, p, exactP, capBlockedP),
        setR: invented(SPLITS, r, exactR, capBlockedR),
        k4: inventedClearK4(),
      });
      expect(result.status).toBe(A3_CORPUS_FREEZE_PREFLIGHT_REFUSED);
    }
  });
});

// ---------------------------------------------------------------------------
// H. EVEN A CLEAR PREFLIGHT IS NOT FREEZE AUTHORITY.
// ---------------------------------------------------------------------------

describe('2D-A3 R44: the preflight is not freeze authority', () => {
  it('the best status and kind are canonical and say NOT_FREEZE_AUTHORITY / NOT_EXECUTION_AUTHORITY', () => {
    expect(A3_CORPUS_FREEZE_PREFLIGHT_CURRENT_BLOCKERS_CLEAR_NOT_FREEZE_AUTHORITY).toBe(
      'A3_CORPUS_FREEZE_PREFLIGHT_CURRENT_BLOCKERS_CLEAR_NOT_FREEZE_AUTHORITY',
    );
    expect(A3_CORPUS_FREEZE_PREFLIGHT_KIND).toBe(
      'A3_CORPUS_FREEZE_PREFLIGHT_NOT_EXECUTION_AUTHORITY',
    );
  });

  it('notCheckedByCurrentPrep is preserved exactly, on every result', () => {
    const expected = [
      'REAL_ACQUISITION_COMPLETION',
      'REAL_GENERATION_1_SLOT_MATERIALISATION',
      'REPLACEMENT_LEDGER_FINALITY',
      'REAL_SET_P_AND_SET_R_PREPARATION_MATERIALISATION',
      'FINAL_ITEM_AND_GOLD_IDENTIFIERS',
      'A4_LABELS',
      'AGREEMENT_AND_KAPPA',
      'FINAL_MANIFEST_HASHES',
      'REALISED_SCORING_TIME_SD4_ENFORCEMENT',
      'FINAL_GATE_DENOMINATORS',
    ];
    expect([...A3_CORPUS_FREEZE_PREFLIGHT_NOT_CHECKED_BY_CURRENT_PREP]).toEqual(expected);
    const clear = checkCurrentA3CorpusFreezePreflight({
      setP: invented(SPLITS, 0, exactP, capBlockedP),
      setR: invented(SPLITS, 0, exactR, capBlockedR),
      k4: inventedClearK4(),
    });
    expect([...clear.notCheckedByCurrentPrep]).toEqual(expected);
  });
});
