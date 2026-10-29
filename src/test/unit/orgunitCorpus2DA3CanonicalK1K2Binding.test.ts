/**
 * PHASE 2B-2D A3 — K1 + K2 SET_R SCORE OWNER-CLARIFICATION BINDING.
 *
 * The owner resolved K1 (`K1_SET_R_TRACK_SCORE_MAX_V1`) and then K2
 * (`K2_EXACT_DOCUMENT_SCORE_MAX_SOURCE_ROW_NO_REPRESENTATIVE_V1`, bound to K1)
 * by two append-only records. This file proves the canonical contracts carry
 * those decisions truthfully and nothing more:
 *
 *   - each record is bound by path, SHA-256 and commit, and K2 binds K1 by
 *     hash, token, path and commit - never the reverse;
 *   - the selected reducers, policies and final two-key SET_R order are the
 *     exact structured values of the records, and no rejected alternative is
 *     selected anywhere;
 *   - marker accounting is 4 historical / 4 resolved / 0 unresolved (it was
 *     3 / 1 with K4 open until K4's own owner record was bound);
 *   - K3 and the short-text policy are unchanged, and no K5 exists;
 *   - no SET_R reducer, comparator, rank or survivor binding exists.
 *
 * It checks key fields of each record, never a second copy of it.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as contracts from '../harness/phase2b2d/a3prep/contracts.js';
import { ORGUNIT_SIGNAL_RULE_VERSION } from '../../orgunits/signals/score.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const A3PREP_REL = 'src/test/harness/phase2b2d/a3prep';

const K1 = contracts.K1_OWNER_DECISION;
const K2 = contracts.K2_OWNER_DECISION;

/** The canonical R9 tip both records name as their parent. */
const R9_PARENT_COMMIT = '1a324ba812168332954f5c1a483d4d54f718c2de';

function fileSha256(relativePath: string): string {
  return createHash('sha256')
    .update(readFileSync(join(REPO_ROOT, relativePath)))
    .digest('hex');
}

function git(...args: readonly string[]): string {
  return execFileSync('git', ['-C', REPO_ROOT, ...args], { encoding: 'utf8' });
}

function commitAvailable(commit: string): boolean {
  try {
    git('cat-file', '-e', `${commit}^{commit}`);
    return true;
  } catch {
    return false;
  }
}

interface BoundFile {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

interface K1Record {
  readonly recordKind: string;
  readonly decisionToken: string;
  readonly selectedOption: string;
  readonly classification: string;
  readonly canonicalParentCommit: string;
  readonly thisFileAuthorises: readonly unknown[];
  readonly resolvesMarker: { readonly id: string; readonly marker: string };
  readonly theGapAcknowledged: { readonly frozenR3AlreadyUniquelySpecifiedMax: boolean };
  readonly ownerDecision: {
    readonly pageLevelReducer: string;
    readonly definition: string;
    readonly requiredTracks: readonly string[];
    readonly boundSignalRuleVersion: string;
    readonly rationale: {
      readonly weakerTrackCancelsStronger: boolean;
      readonly dualTrackEvidenceIsAdded: boolean;
      readonly newCrossTrackWeightIntroduced: boolean;
      readonly trackPriority: string;
    };
    readonly signedScorePolicy: string;
    readonly prohibitedScoreTransforms: readonly string[];
    readonly decimalSemantics: {
      readonly operatesOn: string;
      readonly binaryFloatingPointMayDecideOrdering: boolean;
      readonly arithmeticRequired: string;
      readonly textualSerializationPinned: boolean;
    };
    readonly requiredTrackEvidence: {
      readonly missingTrack: string;
      readonly duplicateExpectedTrackObservation: string;
      readonly unexpectedTrack: string;
      readonly malformedEvidence: string;
    };
    readonly rankWithinRootRole: string;
    readonly hiddenTieBreaksProhibited: readonly string[];
  };
  readonly rejectedAlternatives: readonly string[];
  readonly noAlternativeReducerRemainsImplicitlyAvailable: boolean;
  readonly whatThisDoesNotChange: Readonly<Record<string, boolean | string>>;
  readonly boundAuthority: Readonly<Record<string, BoundFile | string>>;
}

interface K2Record {
  readonly recordKind: string;
  readonly decisionToken: string;
  readonly selectedOption: string;
  readonly jointSemanticsToken: string;
  readonly classification: string;
  readonly canonicalParentCommit: string;
  readonly thisFileAuthorises: readonly unknown[];
  readonly resolvesMarker: { readonly id: string; readonly marker: string };
  readonly boundK1: {
    readonly path: string;
    readonly sha256: string;
    readonly bytes: number;
    readonly decisionToken: string;
    readonly commit: string;
    readonly k1SemanticsRestatedHere: boolean;
  };
  readonly ownerDecision: {
    readonly documentIdentity: string;
    readonly nonIdentities: readonly string[];
    readonly representativePolicy: string;
    readonly representativeSelectorsProhibited: readonly string[];
    readonly maxScoreRowRole: string;
    readonly maxScoreRowIsNot: string;
    readonly documentLevelReducer: string;
    readonly jointSemantics: string;
    readonly reductionOrderIndependence: {
      readonly canonicalResultDependsOnReductionStaging: boolean;
      readonly trackFirstVsRowFirstSemanticDifference: string;
    };
    readonly duplicateMultiplicityPolicy: string;
    readonly multiplicityWeightingsProhibited: readonly string[];
    readonly urlAliasEffect: {
      readonly ownerAcceptsThisConsequence: boolean;
      readonly winningAliasBecomesRepresentative: boolean;
      readonly allAliasesRemainProvenance: boolean;
    };
    readonly integrityPolicy: {
      readonly everySourceRowMustBeK1Valid: boolean;
      readonly refuseRatherThanRepair: readonly string[];
      readonly prohibitedRepairs: readonly string[];
    };
    readonly finalSetROrder: {
      readonly keys: readonly {
        readonly position: number;
        readonly key: string;
        readonly direction: string;
      }[];
      readonly wording: string;
      readonly hiddenSecondaryKeysProhibited: readonly string[];
    };
    readonly provenance: {
      readonly scoringResultNeedsRawUrlsOrText: boolean;
      readonly sourceRowDiscardedSemanticallyForNotWinningMax: boolean;
    };
  };
  readonly rejectedAlternatives: readonly string[];
  readonly exclusions: {
    readonly doesNotDecide: readonly string[];
    readonly postLabelInformationParticipates: boolean;
  };
  readonly whatThisDoesNotChange: Readonly<Record<string, boolean | string>>;
  readonly boundAuthority: Readonly<Record<string, BoundFile | string>>;
}

const k1Record = JSON.parse(
  readFileSync(join(REPO_ROOT, K1.decisionRecordPath), 'utf8'),
) as K1Record;
const k2Record = JSON.parse(
  readFileSync(join(REPO_ROOT, K2.decisionRecordPath), 'utf8'),
) as K2Record;

/** Every alternative the owner rejected, across both records. */
const FORBIDDEN_SELECTIONS = [
  'SUM_TRACK_SCORES',
  'MEAN',
  'MIN_SOURCE_SCORE',
  'REPRESENTATIVE_BY_URL',
  'REPRESENTATIVE_BY_PAGE_ID',
  'REPRESENTATIVE_BY_PERSISTED_RANK',
  'TRACK_PRIORITY',
  'TRACK_A_BEFORE_B_PRIORITY',
  'TRACK_B_BEFORE_A_PRIORITY',
  'INTERLEAVING',
  'ALTERNATING_INTERLEAVED_TRACK_LISTS',
  'TRACK_B_QUOTA_OR_FLOOR',
  'CLAMP_TO_ZERO',
  'MULTIPLICITY_WEIGHTING',
] as const;

// ---------------------------------------------------------------------------

describe('2D-A3 K1: the owner record is bound and says what the contract says', () => {
  it('the path exists and its SHA-256 matches the contract', () => {
    expect(existsSync(join(REPO_ROOT, K1.decisionRecordPath))).toBe(true);
    expect(fileSha256(K1.decisionRecordPath)).toBe(K1.decisionRecordSha256);
    expect(K1.decisionRecordSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(K1.decisionRecordCommit).toMatch(/^[0-9a-f]{40}$/);
  });

  it('is an OWNER_CLARIFICATION of the K1 marker, parented on R9, authorising nothing', () => {
    expect(k1Record.recordKind).toBe('OWNER_CLARIFICATION');
    expect(k1Record.decisionToken).toBe('K1_SET_R_TRACK_SCORE_MAX_V1');
    expect(k1Record.decisionToken).toBe(K1.decisionToken);
    expect(k1Record.selectedOption).toBe(K1.selectedOption);
    expect(k1Record.classification).toBe(
      'OWNER_INTERPRETATION_OF_UNDEFINED_SET_R_TRACK_SCORE_REDUCTION',
    );
    expect(k1Record.resolvesMarker).toMatchObject({ id: 'K1', marker: K1.marker });
    expect(k1Record.canonicalParentCommit).toBe(R9_PARENT_COMMIT);
    expect(k1Record.thisFileAuthorises).toEqual([]);
    expect(k1Record.theGapAcknowledged.frozenR3AlreadyUniquelySpecifiedMax).toBe(false);
  });

  it('selects MAX over exactly the two required tracks under the bound rule version', () => {
    const d = k1Record.ownerDecision;
    expect(d.pageLevelReducer).toBe('MAX_TRACK_SCORE');
    expect(d.pageLevelReducer).toBe(K1.reducer);
    expect(d.definition).toBe('pageSetRScore = max(trackAScore, trackBScore)');
    expect(d.requiredTracks).toEqual(['INTERNATIONAL_OFFICE', 'LANGUAGE_CENTRE']);
    expect(d.requiredTracks).toEqual([...K1.requiredTracks]);
    expect(d.boundSignalRuleVersion).toBe(K1.signalRuleVersion);
    expect(d.rationale).toMatchObject({
      weakerTrackCancelsStronger: false,
      dualTrackEvidenceIsAdded: false,
      newCrossTrackWeightIntroduced: false,
      trackPriority: 'NONE',
    });
  });

  it('preserves signed scores and forbids every clamp-like transform', () => {
    const d = k1Record.ownerDecision;
    expect(d.signedScorePolicy).toBe('PRESERVE_SIGNED_PERSISTED_VALUE');
    expect(d.signedScorePolicy).toBe(K1.signedScorePolicy);
    expect(d.prohibitedScoreTransforms).toEqual([
      'CLAMP',
      'FLOOR',
      'ABSOLUTE_VALUE',
      'NORMALISATION',
      'MAX_0_SCORE',
    ]);
  });

  it('operates on the exact persisted value, with no float ordering and no arithmetic', () => {
    expect(k1Record.ownerDecision.decimalSemantics).toMatchObject({
      operatesOn: 'EXACT_PERSISTED_NUMERIC_VALUE',
      binaryFloatingPointMayDecideOrdering: false,
      arithmeticRequired: 'NONE',
      textualSerializationPinned: false,
    });
  });

  it('refuses missing, duplicated, unexpected or malformed track evidence', () => {
    expect(k1Record.ownerDecision.requiredTrackEvidence).toMatchObject({
      missingTrack: 'REFUSE_NOT_SCORE_ZERO',
      duplicateExpectedTrackObservation: 'REFUSE_NOT_COLLAPSE',
      unexpectedTrack: 'REFUSE_NOT_SUBSTITUTE',
      malformedEvidence: 'REFUSE',
    });
  });

  it('gives rank_within_root no SET_R ranking role and admits no hidden tie-break', () => {
    expect(k1Record.ownerDecision.rankWithinRootRole).toBe('NOT_A_SET_R_RANK_INPUT');
    expect(k1Record.ownerDecision.rankWithinRootRole).toBe(K1.rankWithinRootRole);
    expect(k1Record.ownerDecision.hiddenTieBreaksProhibited).toEqual([
      'URL_ASCENDING',
      'ROOT_RANK',
      'RANK_WITHIN_ROOT',
      'CANDIDATE_ROW_POSITION',
    ]);
  });

  it('rejects SUM, both priorities, lexicographic order, interleaving, a Track-B floor and clamping', () => {
    expect(k1Record.rejectedAlternatives).toEqual([
      'SUM_TRACK_SCORES',
      'TRACK_A_BEFORE_B_PRIORITY',
      'TRACK_B_BEFORE_A_PRIORITY',
      'LEXICOGRAPHIC_TWO_DIMENSIONAL_TRACK_ORDER',
      'ALTERNATING_INTERLEAVED_TRACK_LISTS',
      'TRACK_B_QUOTA_OR_FLOOR',
      'CLAMP_TO_ZERO',
    ]);
    expect(k1Record.noAlternativeReducerRemainsImplicitlyAvailable).toBe(true);
  });

  it('changes no frozen byte and authorises no score recomputation or real SET_R', () => {
    expect(k1Record.whatThisDoesNotChange).toMatchObject({
      r3Changed: false,
      planV1Changed: false,
      rankSaltChanged: false,
      capChanged: false,
      signalRuleVersionChanged: false,
      candidateScoreArithmeticChanged: false,
      scoreRecomputationAuthorised: false,
      realSetRAuthorised: false,
      realA3Authorised: false,
      newMethodologyVersion: false,
      r4Created: false,
    });
  });

  it('every bound authority file still hashes to the recorded value', () => {
    for (const [name, bound] of Object.entries(k1Record.boundAuthority)) {
      if (typeof bound === 'string') continue;
      // The two a3prep sources were bound as they stood at R9; Gate C edits them.
      if (bound.path.startsWith(`${A3PREP_REL}/`)) continue;
      expect(fileSha256(bound.path), name).toBe(bound.sha256);
    }
    expect(k1Record.boundAuthority.canonicalParentCommit).toBe(R9_PARENT_COMMIT);
  });
});

describe('2D-A3 K2: the owner record is bound and says what the contract says', () => {
  it('the path exists and its SHA-256 matches the contract', () => {
    expect(existsSync(join(REPO_ROOT, K2.decisionRecordPath))).toBe(true);
    expect(fileSha256(K2.decisionRecordPath)).toBe(K2.decisionRecordSha256);
    expect(K2.decisionRecordSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(K2.decisionRecordCommit).toMatch(/^[0-9a-f]{40}$/);
  });

  it('is an OWNER_CLARIFICATION of the K2 marker, parented on R9, authorising nothing', () => {
    expect(k2Record.recordKind).toBe('OWNER_CLARIFICATION');
    expect(k2Record.decisionToken).toBe(
      'K2_EXACT_DOCUMENT_SCORE_MAX_SOURCE_ROW_NO_REPRESENTATIVE_V1',
    );
    expect(k2Record.decisionToken).toBe(K2.decisionToken);
    expect(k2Record.selectedOption).toBe(K2.selectedOption);
    expect(k2Record.classification).toBe(
      'OWNER_INTERPRETATION_OF_UNDEFINED_EXACT_DOCUMENT_SCORE_REDUCTION',
    );
    expect(k2Record.resolvesMarker).toMatchObject({ id: 'K2', marker: K2.marker });
    expect(k2Record.canonicalParentCommit).toBe(R9_PARENT_COMMIT);
    expect(k2Record.thisFileAuthorises).toEqual([]);
  });

  it('keeps documentSha256 as identity and names NO representative', () => {
    const d = k2Record.ownerDecision;
    expect(d.documentIdentity).toBe('documentSha256');
    expect(d.nonIdentities).toEqual(['PAGE_EVIDENCE_ID', 'URL', 'ROOT']);
    expect(d.representativePolicy).toBe('NO_PAGE_EVIDENCE_REPRESENTATIVE_IS_CANONICAL_FOR_SET_R');
    expect(d.representativePolicy).toBe(K2.representativePolicy);
    expect(d.representativeSelectorsProhibited).toEqual([
      'LOWEST_PAGE_EVIDENCE_ID',
      'FIRST_FETCH',
      'URL',
      'ROOT',
      'RANK_WITHIN_ROOT',
      'BEST_SCORE',
    ]);
    expect(d.maxScoreRowRole).toBe('SCORE_PROVENANCE');
    expect(d.maxScoreRowIsNot).toBe('DOCUMENT_REPRESENTATIVE');
  });

  it('selects MAX of the K1 page score across source rows, with the exact joint token', () => {
    const d = k2Record.ownerDecision;
    expect(d.documentLevelReducer).toBe('MAX_K1_PAGE_SCORE_ACROSS_SOURCE_ROWS');
    expect(d.documentLevelReducer).toBe(K2.reducer);
    expect(d.jointSemantics).toBe('SET_R_DOCUMENT_SCORE_MAX_PERSISTED_SIGNAL_EVIDENCE_V1');
    expect(k2Record.jointSemanticsToken).toBe(d.jointSemantics);
    expect(d.jointSemantics).toBe(K2.jointSemantics);
    expect(d.reductionOrderIndependence).toMatchObject({
      canonicalResultDependsOnReductionStaging: false,
      trackFirstVsRowFirstSemanticDifference: 'NONE',
    });
  });

  it('is idempotent under duplicate multiplicity; an alias never becomes the representative', () => {
    const d = k2Record.ownerDecision;
    expect(d.duplicateMultiplicityPolicy).toBe('IDEMPOTENT_NO_MULTIPLICITY_WEIGHT');
    expect(d.duplicateMultiplicityPolicy).toBe(K2.duplicateMultiplicity);
    expect(d.multiplicityWeightingsProhibited).toEqual([
      'SUM_OVER_ALIASES',
      'ALIAS_COUNT_MULTIPLIER',
      'OBSERVATION_COUNT_WEIGHTED_MEAN',
    ]);
    expect(d.urlAliasEffect).toMatchObject({
      ownerAcceptsThisConsequence: true,
      winningAliasBecomesRepresentative: false,
      allAliasesRemainProvenance: true,
    });
    expect(d.provenance).toMatchObject({
      scoringResultNeedsRawUrlsOrText: false,
      sourceRowDiscardedSemanticallyForNotWinningMax: false,
    });
  });

  it('refuses rather than repairs every integrity defect', () => {
    const p = k2Record.ownerDecision.integrityPolicy;
    expect(p.everySourceRowMustBeK1Valid).toBe(true);
    expect(p.refuseRatherThanRepair).toEqual([
      'MISSING_TRACK_A',
      'MISSING_TRACK_B',
      'DUPLICATE_REQUIRED_TRACK_OBSERVATION',
      'UNEXPECTED_OR_MIXED_SIGNAL_RULE_VERSION',
      'MALFORMED_PERSISTED_SCORE_VALUE',
      'CANDIDATE_OBSERVATION_FOR_PAGE_OUTSIDE_DOCUMENT_SOURCE_GROUP',
      'FETCH_DOCUMENT_SHA_MISMATCH',
      'UNEXPECTED_CANDIDATE_TRACK',
    ]);
    expect(p.prohibitedRepairs).toEqual([
      'SCORE_ZERO_SUBSTITUTION',
      'SKIP_MALFORMED_ROWS',
      'FALLBACK_TO_ONE_REMAINING_TRACK',
    ]);
  });

  it('fixes the final SET_R order to exactly two keys: score DESC, then the SET_R salted SHA ASC', () => {
    const order = k2Record.ownerDecision.finalSetROrder;
    expect(order.keys).toEqual([
      { position: 1, key: 'documentSetRScore', direction: 'DESCENDING' },
      {
        position: 2,
        key: `sha256("${contracts.SET_R_TIE_BREAK_KEY_PREFIX}" + documentSha256)`,
        direction: 'ASCENDING',
      },
    ]);
    expect(order.wording).toBe(
      'SET_R total order is EXACTLY: 1. documentSetRScore descending; 2. sha256("SET_R_V2_R2:" + documentSha256) ascending. Nothing else.',
    );
    expect(order.hiddenSecondaryKeysProhibited).toEqual([
      'TRACK',
      'PAGE',
      'URL',
      'ROOT',
      'RUN',
      'PERSISTED_ROOT_RANK',
      'DISCOVERY_ORDER',
    ]);
  });

  it('decides no gold, label, near-duplicate, short-text or K4 question, and uses no post-label data', () => {
    expect(k2Record.exclusions.doesNotDecide).toEqual([
      'GOLD_ID',
      'A4_ITEM_IDENTITY',
      'LABEL',
      'UNIT_TYPE',
      'HARD_NEGATIVE_STATUS',
      'NEAR_DUPLICATE_IDENTITY',
      'SHORT_TEXT_SEMANTICS',
      'K4',
      'CLASSIFIER_RESULT',
    ]);
    expect(k2Record.exclusions.postLabelInformationParticipates).toBe(false);
  });

  it('changes no frozen byte, no K1/K3/short-text/SD7 decision, and authorises nothing', () => {
    expect(k2Record.whatThisDoesNotChange).toMatchObject({
      r3Changed: false,
      planV1Changed: false,
      k1Changed: false,
      k3Changed: false,
      shortTextPolicyChanged: false,
      sd7Changed: false,
      rankSaltChanged: false,
      capChanged: false,
      signalRuleVersionChanged: false,
      scoreRecomputationAuthorised: false,
      realSetRAuthorised: false,
      realA3Authorised: false,
      newMethodologyVersion: false,
      r4Created: false,
    });
  });

  it('every bound authority file still hashes to the recorded value', () => {
    for (const [name, bound] of Object.entries(k2Record.boundAuthority)) {
      if (typeof bound === 'string') continue;
      if (bound.path.startsWith(`${A3PREP_REL}/`) && bound.path.endsWith('types.ts')) continue;
      expect(fileSha256(bound.path), name).toBe(bound.sha256);
    }
    expect(k2Record.boundAuthority.canonicalParentCommit).toBe(R9_PARENT_COMMIT);
  });
});

describe('2D-A3 K1 <-> K2: K2 binds K1, never the reverse', () => {
  it('K2 binds the exact K1 record by hash, token, path and commit', () => {
    expect(k2Record.boundK1.sha256).toBe(fileSha256(K1.decisionRecordPath));
    expect(k2Record.boundK1.sha256).toBe(K1.decisionRecordSha256);
    expect(k2Record.boundK1.decisionToken).toBe(k1Record.decisionToken);
    expect(k2Record.boundK1.path).toBe(K1.decisionRecordPath);
    expect(k2Record.boundK1.commit).toBe(K1.decisionRecordCommit);
    expect(k2Record.boundK1.k1SemanticsRestatedHere).toBe(false);
    expect(k2Record.boundAuthority.k1OwnerClarification).toMatchObject({
      path: K1.decisionRecordPath,
      sha256: K1.decisionRecordSha256,
    });
  });

  it('the contract binds K2 to K1 by reference, not by a second literal', () => {
    expect(K2.boundK1DecisionRecordSha256).toBe(K1.decisionRecordSha256);
    expect(K2.boundK1DecisionToken).toBe(K1.decisionToken);
  });

  it('K1 names neither K2 nor its record: no circular dependency', () => {
    const k1Text = readFileSync(join(REPO_ROOT, K1.decisionRecordPath), 'utf8');
    expect(k1Text).not.toContain(K2.decisionToken);
    expect(k1Text).not.toContain(K2.decisionRecordPath);
    expect(k1Text).not.toContain(K2.decisionRecordSha256);
    expect(k1Text).not.toContain(contracts.SET_R_DOCUMENT_SCORE_SEMANTICS);
  });
});

describe.skipIf(!commitAvailable(K2.decisionRecordCommit))(
  '2D-A3 K1 -> K2 chronology: K1 was committed before K2, each record exactly once',
  () => {
    it('each record commit adds exactly its own record, with the bound bytes', () => {
      for (const decision of [K1, K2]) {
        expect(
          git('show', '--name-status', '--format=', decision.decisionRecordCommit).trim(),
        ).toBe(`A\t${decision.decisionRecordPath}`);
        const committed = git(
          'show',
          `${decision.decisionRecordCommit}:${decision.decisionRecordPath}`,
        );
        expect(createHash('sha256').update(committed).digest('hex')).toBe(
          decision.decisionRecordSha256,
        );
      }
    });

    it('R9 -> K1 -> K2 is the ancestry, with K1 the direct parent of K2', () => {
      expect(git('rev-parse', `${K1.decisionRecordCommit}^`).trim()).toBe(R9_PARENT_COMMIT);
      expect(git('rev-parse', `${K2.decisionRecordCommit}^`).trim()).toBe(K1.decisionRecordCommit);
    });
  },
);

describe('2D-A3 K1/K2: no rejected alternative is selected anywhere', () => {
  const selectedValues = [
    k1Record.ownerDecision.pageLevelReducer,
    k1Record.ownerDecision.signedScorePolicy,
    k1Record.ownerDecision.rankWithinRootRole,
    k1Record.ownerDecision.rationale.trackPriority,
    k2Record.ownerDecision.documentLevelReducer,
    k2Record.ownerDecision.representativePolicy,
    k2Record.ownerDecision.duplicateMultiplicityPolicy,
    k2Record.ownerDecision.jointSemantics,
    K1.reducer,
    K1.signedScorePolicy,
    K1.rankWithinRootRole,
    K2.reducer,
    K2.representativePolicy,
    K2.jointSemantics,
    K2.duplicateMultiplicity,
  ];

  it.each(FORBIDDEN_SELECTIONS)('%s is not a selected value', (forbidden) => {
    expect(selectedValues).not.toContain(forbidden);
  });

  it('every rejected alternative is recorded as REJECTED by one of the two records', () => {
    const rejected = [...k1Record.rejectedAlternatives, ...k2Record.rejectedAlternatives];
    for (const forbidden of FORBIDDEN_SELECTIONS) {
      if (forbidden === 'TRACK_PRIORITY' || forbidden === 'INTERLEAVING') {
        expect(k2Record.rejectedAlternatives).toContain(forbidden);
      } else {
        expect(rejected, forbidden).toContain(forbidden);
      }
    }
  });

  it('the final SET_R order has no track, rank, URL or root key', () => {
    const keys = k2Record.ownerDecision.finalSetROrder.keys.map((k) => k.key).join('\n');
    expect(keys).not.toMatch(/track|rank_within_root|url|root|page_evidence/i);
  });
});

describe('2D-A3 K1/K2: the contract carries the owner-bound tokens', () => {
  it('K1 contract fields are exact', () => {
    expect(K1).toEqual({
      id: 'K1',
      marker: 'A3_PREP_OWNER_DECISION_REQUIRED:SET_R_TRACK_REDUCTION',
      resolved: true,
      decisionToken: 'K1_SET_R_TRACK_SCORE_MAX_V1',
      selectedOption: 'RECOMMEND_K1_MAX_TRACK_SCORE',
      decisionRecordPath:
        'docs/evaluation/PHASE_2B_2D_A3_K1_SET_R_TRACK_SCORE_OWNER_CLARIFICATION_V1.json',
      decisionRecordSha256: K1.decisionRecordSha256,
      decisionRecordCommit: K1.decisionRecordCommit,
      reducer: 'MAX_TRACK_SCORE',
      requiredTracks: ['INTERNATIONAL_OFFICE', 'LANGUAGE_CENTRE'],
      signalRuleVersion: 'orgunit-signal-rules-v1',
      signedScorePolicy: 'PRESERVE_SIGNED_PERSISTED_VALUE',
      rankWithinRootRole: 'NOT_A_SET_R_RANK_INPUT',
    });
    expect(Object.isFrozen(K1)).toBe(true);
    expect(Object.isFrozen(K1.requiredTracks)).toBe(true);
  });

  it('K2 contract fields are exact', () => {
    expect(K2).toEqual({
      id: 'K2',
      marker: 'A3_PREP_OWNER_DECISION_REQUIRED:EXACT_DUPLICATE_REPRESENTATIVE_AND_SCORE',
      resolved: true,
      decisionToken: 'K2_EXACT_DOCUMENT_SCORE_MAX_SOURCE_ROW_NO_REPRESENTATIVE_V1',
      selectedOption: 'RECOMMEND_K2_MAX_SOURCE_ROW_SCORE_NO_REPRESENTATIVE',
      decisionRecordPath:
        'docs/evaluation/PHASE_2B_2D_A3_K2_EXACT_DOCUMENT_SCORE_OWNER_CLARIFICATION_V1.json',
      decisionRecordSha256: K2.decisionRecordSha256,
      decisionRecordCommit: K2.decisionRecordCommit,
      boundK1DecisionToken: 'K1_SET_R_TRACK_SCORE_MAX_V1',
      boundK1DecisionRecordSha256: K1.decisionRecordSha256,
      reducer: 'MAX_K1_PAGE_SCORE_ACROSS_SOURCE_ROWS',
      representativePolicy: 'NO_PAGE_EVIDENCE_REPRESENTATIVE_IS_CANONICAL_FOR_SET_R',
      jointSemantics: 'SET_R_DOCUMENT_SCORE_MAX_PERSISTED_SIGNAL_EVIDENCE_V1',
      duplicateMultiplicity: 'IDEMPOTENT_NO_MULTIPLICITY_WEIGHT',
    });
    expect(Object.isFrozen(K2)).toBe(true);
  });

  it('the standalone SET_R tokens equal the decision fields', () => {
    expect(contracts.SET_R_TRACK_REDUCTION_POLICY).toBe(K1.reducer);
    expect(contracts.SET_R_REQUIRED_TRACKS).toBe(K1.requiredTracks);
    expect(contracts.SET_R_BOUND_SIGNAL_RULE_VERSION).toBe(K1.signalRuleVersion);
    expect(contracts.SET_R_SIGNED_SCORE_POLICY).toBe(K1.signedScorePolicy);
    expect(contracts.SET_R_RANK_WITHIN_ROOT_ROLE).toBe(K1.rankWithinRootRole);
    expect(contracts.SET_R_EXACT_DOCUMENT_SCORE_POLICY).toBe(K2.reducer);
    expect(contracts.SET_R_EXACT_DOCUMENT_REPRESENTATIVE_POLICY).toBe(K2.representativePolicy);
    expect(contracts.SET_R_DOCUMENT_SCORE_SEMANTICS).toBe(K2.jointSemantics);
    expect(contracts.SET_R_DUPLICATE_MULTIPLICITY_POLICY).toBe(K2.duplicateMultiplicity);
  });

  it('the bound rule version is the one production persists today', () => {
    expect(contracts.SET_R_BOUND_SIGNAL_RULE_VERSION).toBe(ORGUNIT_SIGNAL_RULE_VERSION);
  });

  it('the required tracks are exactly production’s Track A -> B persisted labels', () => {
    const persistence = readFileSync(
      join(REPO_ROOT, 'src/orgunits/orchestrator/candidates.ts'),
      'utf8',
    );
    expect(persistence).toContain("track === 'A' ? 'INTERNATIONAL_OFFICE' : 'LANGUAGE_CENTRE'");
  });

  it('the frozen SET_R salt, cap and named primary order are unchanged', () => {
    expect(contracts.SET_R_TIE_BREAK_KEY_PREFIX).toBe('SET_R_V2_R2:');
    expect(contracts.SET_R_TIE_BREAK_ORDER).toBe('SALTED_SHA256_LOWER_HEX_ASCENDING');
    expect(contracts.SET_R_MAX_PAGES_PER_ORGANISATION).toBe(4);
    expect(contracts.SET_R_PRIMARY_ORDER).toBe('RESOLVED_FROZEN_TRACK_A_B_SIGNAL_SCORE_DESCENDING');
  });
});

describe('2D-A3 K1/K2: marker accounting — all markers are NOT all blockers', () => {
  it('4 historical, 4 resolved (K1, K2, K3, K4 - K4 later, by its own record), 0 unresolved', () => {
    expect(contracts.A3_PREP_OWNER_DECISION_MARKERS).toHaveLength(4);
    expect(contracts.A3_PREP_OWNER_DECISIONS_RESOLVED.map((d) => d.id)).toEqual([
      'K1',
      'K2',
      'K3',
      'K4',
    ]);
    expect(contracts.A3_PREP_RESOLVED_OWNER_DECISION_MARKERS).toEqual([
      contracts.K1_SET_R_TRACK_REDUCTION,
      contracts.K2_EXACT_DUPLICATE_REPRESENTATIVE_AND_SCORE,
      contracts.K3_SD3_SINGLE_POOL_VS_SD7_PER_SAMPLE_SURVIVOR,
      contracts.K4_SD4_G3_FREEZE_TIME_TRUNCATION,
    ]);
    expect(contracts.A3_PREP_OWNER_DECISIONS_REQUIRED).toEqual([]);
    expect(contracts.A3_PREP_UNRESOLVED_OWNER_DECISION_MARKERS).toEqual([]);
  });

  it('the historical list is strictly larger than the blocker list', () => {
    expect(contracts.A3_PREP_OWNER_DECISION_MARKERS.length).toBeGreaterThan(
      contracts.A3_PREP_UNRESOLVED_OWNER_DECISION_MARKERS.length,
    );
    expect(contracts.A3_PREP_OWNER_DECISION_MARKERS).not.toEqual(
      contracts.A3_PREP_UNRESOLVED_OWNER_DECISION_MARKERS,
    );
    const resolved = new Set<string>(contracts.A3_PREP_RESOLVED_OWNER_DECISION_MARKERS);
    for (const marker of contracts.A3_PREP_UNRESOLVED_OWNER_DECISION_MARKERS) {
      expect(resolved.has(marker)).toBe(false);
    }
  });

  it('the K1 and K2 marker strings are byte-identical to their historical form', () => {
    expect(contracts.K1_SET_R_TRACK_REDUCTION).toBe(
      'A3_PREP_OWNER_DECISION_REQUIRED:SET_R_TRACK_REDUCTION',
    );
    expect(contracts.K2_EXACT_DUPLICATE_REPRESENTATIVE_AND_SCORE).toBe(
      'A3_PREP_OWNER_DECISION_REQUIRED:EXACT_DUPLICATE_REPRESENTATIVE_AND_SCORE',
    );
  });
});

describe('2D-A3 K1/K2: K3 and the short-text policy are unchanged; no K5', () => {
  it('K3 keeps its record, hash, commit and typed semantics', () => {
    const K3 = contracts.K3_OWNER_DECISION;
    expect(K3.decisionRecordSha256).toBe(
      '987b88a0848a5020605619f24a9accd73a04e886c80f72ab81608fbade765eab',
    );
    expect(K3.decisionRecordCommit).toBe('bee142ee601f2dad7f558c15f549d6e33080f3e7');
    expect(fileSha256(K3.decisionRecordPath)).toBe(K3.decisionRecordSha256);
    expect(K3.survivorProcedure).toBe('GREEDY_SAMPLE_RANK_SURVIVOR_WALK');
    expect(K3.survivorScope).toBe('SAMPLE_SPECIFIC');
    expect(K3.atMostOneScope).toBe('PER_SAMPLE');
  });

  it('the short-text policy keeps its record and hash; its semantics stay unresolved', () => {
    const policy = contracts.SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY;
    expect(policy.decisionRecordSha256).toBe(
      'b734805bbaddc6890dc7032179b4a639a69a790282923b41641710a060b3d05a',
    );
    expect(fileSha256(policy.decisionRecordPath)).toBe(policy.decisionRecordSha256);
    expect(policy.semanticNearDuplicateStatus).toBe('REMAINS_UNRESOLVED');
    expect(contracts.SHORT_TEXT_SEMANTIC_NEAR_DUPLICATE_STATUS).toBe('UNRESOLVED');
  });

  it('no K5 exists', () => {
    expect(Object.keys(contracts).filter((name) => /^K5/.test(name))).toEqual([]);
    expect(contracts.A3_PREP_OWNER_DECISION_MARKERS.join('\n')).not.toMatch(/SHORT_TEXT/);
  });
});

describe('2D-A3 K1/K2: authority binding only — no SET_R implementation', () => {
  it('contracts.ts exports no function', () => {
    const functions = Object.entries(contracts)
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name);
    expect(functions).toEqual([]);
  });

  /**
   * R11 moved `setR.ts` from absent to present, by exact name; R15 did the same
   * for `organisationCaps.ts` (SD4 enforcement, no SET_R reducer, comparator or
   * rank - the export guard below still covers it). The rest stay absent.
   */
  it('no synthetic-fixture module exists in a3prep; setR.ts is R11, organisationCaps.ts is R15', () => {
    const files = readdirSync(join(REPO_ROOT, A3PREP_REL));
    expect(files).toContain('setR.ts');
    expect(files).toContain('organisationCaps.ts');
    for (const absent of ['syntheticFixtures.ts']) {
      expect(files).not.toContain(absent);
    }
  });

  /**
   * R10 WIDENED THIS GUARD BY EXACT NAME: `setRScore.ts` is the one authorised
   * K1/K2 score reducer and exact-decimal comparator. It still ranks nothing;
   * that boundary is proved in `orgunitCorpus2DA3CanonicalSetRScoreIsolation`.
   * Every other a3prep module stays reducer-free.
   */
  const R10_AUTHORISED_SCORE_REDUCER_FILE = 'setRScore.ts';

  /**
   * R11 WIDENED IT ONCE MORE, BY EXACT NAME: `setR.ts` exports exactly one
   * function, the SET_R total rank `rankSetRFull`, and no reducer or
   * comparator (proved in `orgunitCorpus2DA3CanonicalSetRIsolation`).
   */
  const R11_AUTHORISED_SET_R_RANK_FILE = 'setR.ts';

  it('R11 setR.ts exports exactly one function: rankSetRFull', () => {
    const source = readFileSync(
      join(REPO_ROOT, A3PREP_REL, R11_AUTHORISED_SET_R_RANK_FILE),
      'utf8',
    );
    expect(
      [...source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map((m) => m[1]),
    ).toEqual(['rankSetRFull']);
  });

  /**
   * R12 WIDENED IT ONCE MORE, BY EXACT NAME: `setRSd7.ts` exports exactly one
   * function, the SET_R -> SD7 composition `prepareSetRSd7`. It reduces,
   * compares and ranks nothing itself - it calls R11's `rankSetRFull` - which
   * `orgunitCorpus2DA3CanonicalSetRSd7Isolation` proves.
   */
  const R12_AUTHORISED_SET_R_SD7_COMPOSITION_FILE = 'setRSd7.ts';

  it('R12 setRSd7.ts exports exactly one function: prepareSetRSd7, and no reducer or comparator', () => {
    const source = readFileSync(
      join(REPO_ROOT, A3PREP_REL, R12_AUTHORISED_SET_R_SD7_COMPOSITION_FILE),
      'utf8',
    );
    const functions = [...source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map(
      (m) => m[1],
    );
    expect(functions).toEqual(['prepareSetRSd7']);
    for (const name of functions) {
      expect(name).not.toMatch(/reduce|decimal|compareScore|maxTrack|rank/i);
    }
  });

  /**
   * R13 WIDENED IT ONCE MORE, BY EXACT NAME, for SET_R READINESS functions
   * only: `setRSd7Readiness.ts` (cap-4 membership, slot readiness, its entry
   * check, the extension boundary) and `corpusFreezePreflight.ts` (the SET_R
   * short-text corpus gate). Each exported function is pinned by exact name
   * below, and none reduces, compares or ranks - that is proved in
   * `orgunitCorpus2DA3CanonicalSetRSd7ReadinessIsolation`.
   */
  const R13_AUTHORISED_SET_R_READINESS_EXPORTS: Readonly<Record<string, readonly string[]>> = {
    'setRSd7Readiness.ts': [
      'checkSetRExtensionCursorAgainstShortTextBoundary',
      'deriveSetRFreezeSlotReadiness',
      'determineSetRDocumentCap',
      'structuralIssueOfSetRFreezeSlotReadiness',
    ],
    'corpusFreezePreflight.ts': ['checkSetRShortTextCorpusFreezeGate'],
  };

  it('R13 SET_R-named exports are exactly the pinned readiness functions, and no reducer, comparator or rank', () => {
    for (const [file, pinned] of Object.entries(R13_AUTHORISED_SET_R_READINESS_EXPORTS)) {
      const source = readFileSync(join(REPO_ROOT, A3PREP_REL, file), 'utf8');
      const setRNamed = [...source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)]
        .map((m) => m[1]!)
        .filter((name) => /setR|reduce|decimal|compareScore|maxTrack/i.test(name))
        .sort();
      expect(setRNamed, file).toEqual([...pinned].sort());
      for (const name of setRNamed) {
        expect(name).not.toMatch(/reduce|decimal|compareScore|maxTrack|rank/i);
      }
    }
  });

  it('no a3prep module other than R10 setRScore.ts, R11 setR.ts and R12 setRSd7.ts exports a SET_R reducer, comparator or rank (R13 readiness exports excepted by exact name)', () => {
    for (const file of readdirSync(join(REPO_ROOT, A3PREP_REL)).filter(
      (f) =>
        f.endsWith('.ts') &&
        f !== R10_AUTHORISED_SCORE_REDUCER_FILE &&
        f !== R11_AUTHORISED_SET_R_RANK_FILE &&
        f !== R12_AUTHORISED_SET_R_SD7_COMPOSITION_FILE,
    )) {
      const exempt = R13_AUTHORISED_SET_R_READINESS_EXPORTS[file] ?? [];
      const source = readFileSync(join(REPO_ROOT, A3PREP_REL, file), 'utf8');
      for (const m of source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) {
        if (exempt.includes(m[1]!)) continue;
        expect(m[1], `${file}:${m[1]}`).not.toMatch(/setR|reduce|decimal|compareScore|maxTrack/i);
      }
    }
  });
});
