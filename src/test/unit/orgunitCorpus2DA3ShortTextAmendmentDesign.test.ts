/**
 * PHASE 2B-2D A3 R45 — THE SHORT-TEXT METHODOLOGY AMENDMENT DESIGN BOUNDARY.
 *
 * R45 is a DESIGN review. It proves, on the canonical SD7/SD9 code and on
 * INVENTED inputs only, the facts its recommendation rests on, and it pins the
 * two public records it publishes:
 *
 *   - every frozen methodology byte, owner short-text record and the R44
 *     blocker record are byte-identical and correctly bound;
 *   - R3's SD7 Jaccard is undefined ONLY for short-vs-short pairs: the
 *     canonical code returns a DEFINED 0 for short-vs-long and throws only on
 *     an empty union, and identical >= 5-token normalised text is a near
 *     duplicate wherever R3 can measure it;
 *   - the ratified SD9 envelope contains every Option-A count, so no
 *     finalised SD9 verdict can move (checked exhaustively on small invented
 *     ranges against the canonical SD9 functions);
 *   - the 18 comparison criteria are fixed, every option is scored on exactly
 *     those, and only Option A satisfies all of them;
 *   - both records authorise nothing, no owner approval and no amendment
 *     implementation exist, and nothing identifies the real corpus.
 *
 * No real document, token sequence, slot, rank, edge, label or sealed split is
 * read. No option is applied to real data.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  evaluateSd9FromAdmissiblePostSd7Bounds,
  evaluateSd9FromExactPostSd7Count,
} from '../harness/phase2b2d/a3prep/sd9.js';
import { jaccard } from '../harness/phase2b2d/sd7/jaccard.js';
import {
  hasEnoughTokensToShingle,
  normaliseForShingling,
  tokenise,
} from '../harness/phase2b2d/sd7/normaliseText.js';
import {
  NEAR_DUPLICATE_JACCARD_THRESHOLD,
  NEAR_DUPLICATE_SHINGLE_SIZE,
  Sd7PilotStop,
} from '../harness/phase2b2d/sd7/sd7Contract.js';
import { shingleSet } from '../harness/phase2b2d/sd7/tokenShingles.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const R44_TERMINAL = '4fd9ffd469333ba181584d56018c61e9ae119c77';
const A2_CHECKPOINT = '29d0d486cb268b5431a0fc23eabb064682ec47d9';

const OPTIONS_PATH =
  'docs/evaluation/PHASE_2B_2D_A3_R45_SHORT_TEXT_METHODOLOGY_AMENDMENT_OPTIONS_V1.json';
const PROPOSAL_PATH =
  'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_R4_SHORT_TEXT_AMENDMENT_PROPOSAL_V1.json';
const AUDIT_PATH = 'docs/audits/PHASE_2B_2D_A3_R45_SHORT_TEXT_METHODOLOGY_AMENDMENT_DESIGN_V1.md';

const TERMINAL_STATE = 'A3_SHORT_TEXT_METHODOLOGY_AMENDMENT_DESIGNED_AWAIT_OWNER_OPTION_APPROVAL';
const RECOMMENDED = 'SHORT_TEXT_EXACT_NORMALISED_TOKEN_SEQUENCE_FALLBACK';

/** Frozen bytes R45 binds, with the digests the owner stated in the task. */
const FROZEN = {
  'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL_R3.json':
    'fdc54873f4cdd47688d6d720229f0a0ea8426193711993a4f63a9f5000623f33',
  'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_OWNER_FREEZE_APPROVAL_V1.json':
    '77dae976fb219bd94c33f236070a5c216a594a85ff8da3a490b5c948753d331e',
  'docs/evaluation/PHASE_2B_2D_METHOD_V2_SD7_SHORT_TEXT_OWNER_DECISION_V1.json':
    '2f41f495322eceae3b675cbe1d227115f3b4292d6e3a711879793af33b466fff',
  'docs/evaluation/PHASE_2B_2D_A3_SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_OWNER_POLICY_V1.json':
    'b734805bbaddc6890dc7032179b4a639a69a790282923b41641710a060b3d05a',
  'docs/evaluation/PHASE_2B_2D_A3_SHORT_TEXT_REACHABLE_MEMBERSHIP_OWNER_CLARIFICATION_V1.json':
    '0d6ddaa6dcc70912e3e19d7cb245fbe7b241dff6c671d874cbd1cd50ec33b49a',
  'docs/evaluation/PHASE_2B_2D_A3_R44_DEV_TRAIN_CORPUS_FREEZE_BLOCKER_CLOSURE_V1.json':
    '3d17e40cca4a386052cfafe70d69fe34aa41294263febfb82c56d4c8a3c8dafe',
} as const;

const CRITERIA = [
  'GLOBALLY_DETERMINISTIC',
  'PRE_LABEL',
  'CANDIDATE_INDEPENDENT',
  'SPLIT_INDEPENDENT',
  'NO_SEALED_DATA_INSPECTION',
  'NO_NEW_RANDOMISATION',
  'PRESERVES_DOCUMENT_POPULATION',
  'PRESERVES_SET_P_RANK_DEFINITION',
  'PRESERVES_SET_R_RANK_DEFINITION',
  'PRESERVES_SD9_ACQUISITION_SEMANTICS',
  'PRESERVES_A2_ACQUISITION_OUTCOMES',
  'PRESERVES_RESERVE_LEDGER',
  'PRESERVES_CAP_VALUES',
  'PRESERVES_EXISTING_GE5_TOKEN_SD7_SEMANTICS',
  'NO_ARBITRARY_NUMERIC_PARAMETER',
  'MINIMAL_RESTART_SURFACE',
  'AUDITABILITY',
  'SCIENTIFIC_DEFENSIBILITY',
];

const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
}

function gitBytes(commit: string, path: string): Buffer {
  return execFileSync('git', ['show', `${commit}:${path}`], {
    cwd: REPO_ROOT,
    maxBuffer: 64 << 20,
  });
}

function commitExists(commit: string): boolean {
  try {
    git('cat-file', '-e', `${commit}^{commit}`);
    return true;
  } catch {
    return false;
  }
}

type Json = Record<string, unknown>;
const readJson = (path: string): Json =>
  JSON.parse(readFileSync(join(REPO_ROOT, path), 'utf8')) as Json;
const obj = (value: unknown): Json => value as Json;

// ---------------------------------------------------------------------------
// A. FROZEN BYTES ARE UNTOUCHED.
// ---------------------------------------------------------------------------

describe('2D-A3 R45: every frozen methodology, owner and R44 byte is unchanged', () => {
  it.each(Object.entries(FROZEN))('%s keeps its frozen digest', (path, digest) => {
    expect(sha256(readFileSync(join(REPO_ROOT, path)))).toBe(digest);
  });

  it.skipIf(!commitExists(R44_TERMINAL))(
    'every frozen file is byte-identical to R44_TERMINAL',
    () => {
      for (const path of Object.keys(FROZEN)) {
        expect(sha256(readFileSync(join(REPO_ROOT, path))), path).toBe(
          sha256(gitBytes(R44_TERMINAL, path)),
        );
      }
    },
  );

  it('the bound R44 record states the 20 / 20 completion and the 6 / 4 blockers', () => {
    const r44 = readJson(
      'docs/evaluation/PHASE_2B_2D_A3_R44_DEV_TRAIN_CORPUS_FREEZE_BLOCKER_CLOSURE_V1.json',
    );
    const blockers = obj(r44['requiredMembershipBlockers']);
    expect(blockers['setPBlockedRequiredMembershipSlotCount']).toBe(6);
    expect(blockers['setRBlockedRequiredMembershipSlotCount']).toBe(4);
    const readiness = obj(r44['mechanicalReadiness']);
    expect(readiness['setPSd9MechanicalSuccessful']).toBe(20);
    expect(readiness['setRSd9MechanicalSuccessful']).toBe(20);
    expect(obj(r44['devTrainCompletion'])['status']).toBe('DEV_TRAIN_PIPELINE_COMPLETE');
    expect(obj(r44['currentMethodologyBlocker'])['corpusFreezeUnderCurrentFrozenMethodology']).toBe(
      'BLOCKED',
    );
  });

  it('R3 SD7 still reads 5-gram Jaccard >= 0.90 within one organisation', () => {
    const r3 = readJson('docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL_R3.json');
    const rules = obj(r3['sectionE_samplingContract'])['rules'] as Json[];
    const sd7 = rules.find((rule) => rule['id'] === 'SD7')!;
    expect(sd7['NEAR_DUPLICATE_SHINGLE_SIZE']).toBe(5);
    expect(sd7['NEAR_DUPLICATE_JACCARD_THRESHOLD']).toBe(0.9);
    expect(sd7['comparisonScope']).toBe('within one organisation only');
    expect(NEAR_DUPLICATE_SHINGLE_SIZE).toBe(5);
    expect(NEAR_DUPLICATE_JACCARD_THRESHOLD).toBe(0.9);
  });
});

// ---------------------------------------------------------------------------
// B. THE DEFINEDNESS FACT, ON THE CANONICAL CODE, WITH INVENTED TEXT ONLY.
// ---------------------------------------------------------------------------

describe('2D-A3 R45: R3 Jaccard is undefined only for short-vs-short (invented text)', () => {
  const SHORT_A = 'Lorem ipsum dolor';
  const SHORT_B = 'Sit amet';
  const LONG = 'alpha beta gamma delta epsilon zeta eta theta';

  it('a short document yields no shingle; a >= 5-token one does', () => {
    expect(hasEnoughTokensToShingle(tokenise(SHORT_A))).toBe(false);
    expect(shingleSet(tokenise(SHORT_A)).size).toBe(0);
    expect(hasEnoughTokensToShingle(tokenise(LONG))).toBe(true);
    expect(shingleSet(tokenise(LONG)).size).toBeGreaterThan(0);
  });

  it('short-vs-long is DEFINED by canonical Jaccard: 0, not a near duplicate', () => {
    const measured = jaccard(shingleSet(tokenise(SHORT_A)), shingleSet(tokenise(LONG)));
    expect(measured.similarity).toBe(0);
    expect(measured.atOrAboveThreshold).toBe(false);
  });

  it('short-vs-short is the ONLY undefined case: canonical Jaccard refuses 0/0', () => {
    expect(() => jaccard(shingleSet(tokenise(SHORT_A)), shingleSet(tokenise(SHORT_B)))).toThrow(
      Sd7PilotStop,
    );
    expect(() => jaccard(shingleSet(tokenise('')), shingleSet(tokenise('')))).toThrow(Sd7PilotStop);
  });

  it('identical normalised >= 5-token text is already a near duplicate under R3', () => {
    const variant = '  ALPHA beta\tGamma   delta EPSILON zeta\neta theta ';
    expect(normaliseForShingling(variant)).toBe(normaliseForShingling(LONG));
    const measured = jaccard(shingleSet(tokenise(variant)), shingleSet(tokenise(LONG)));
    expect(measured.similarity).toBe(1);
    expect(measured.atOrAboveThreshold).toBe(true);
  });

  it('canonical normalisation folds case and whitespace but keeps punctuation', () => {
    expect(tokenise('Contact  US')).toEqual(tokenise('contact us'));
    expect(tokenise('Contact us.')).not.toEqual(tokenise('Contact us'));
    expect(tokenise('   ')).toEqual([]);
  });

  it('tokens carry no whitespace, so sequence equality equals normalised-text equality', () => {
    for (const text of [SHORT_A, SHORT_B, LONG, 'a b  c']) {
      for (const token of tokenise(text)) expect(token).not.toMatch(/\s/u);
      expect(tokenise(text).join(' ')).toBe(normaliseForShingling(text));
    }
  });
});

// ---------------------------------------------------------------------------
// C. SD9 ENVELOPE CONTAINMENT (pure arithmetic on invented ranges).
// ---------------------------------------------------------------------------

describe('2D-A3 R45: every Option-A count lies inside the ratified SD9 envelope', () => {
  it('no finalised envelope verdict can be moved by any q in [min(1,s), s]', () => {
    let checked = 0;
    for (let muMin = 0; muMin <= 8; muMin += 1) {
      for (let muMax = muMin; muMax <= 8; muMax += 1) {
        for (let s = 0; s <= 6; s += 1) {
          const envelope = evaluateSd9FromAdmissiblePostSd7Bounds(muMin, muMax + s);
          if (envelope === 'ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL') continue;
          for (let q = Math.min(1, s); q <= s; q += 1) {
            for (let mu = muMin; mu <= muMax; mu += 1) {
              expect(evaluateSd9FromExactPostSd7Count(mu + q)).toBe(envelope);
              checked += 1;
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// D. THE OPTIONS RECORD.
// ---------------------------------------------------------------------------

describe.skipIf(!existsSync(join(REPO_ROOT, OPTIONS_PATH)))(
  '2D-A3 R45: the options and recommendation record',
  () => {
    const record = existsSync(join(REPO_ROOT, OPTIONS_PATH)) ? readJson(OPTIONS_PATH) : {};

    it('is the right kind, authorises nothing, and is not execution authority', () => {
      expect(record['recordKind']).toBe(
        'A3_SHORT_TEXT_METHODOLOGY_AMENDMENT_OPTIONS_AND_RECOMMENDATION',
      );
      expect(record['thisFileAuthorises']).toEqual([]);
      expect(record['authorityClass']).toBe('NOT_EXECUTION_AUTHORITY');
      expect(record['methodologyAmendedByThisRecord']).toBe(false);
      expect(record['terminalState']).toBe(TERMINAL_STATE);
    });

    it('binds the exact R44 record and terminal, using aggregate facts only', () => {
      const r44 = obj(record['r44Binding']);
      expect(r44['r44Terminal']).toBe(R44_TERMINAL);
      expect(r44['sha256']).toBe(FROZEN[r44['path'] as keyof typeof FROZEN]);
      expect(r44['acceptedAsCanonicalStartingBlockerState']).toBe(true);
      expect(obj(r44['aggregateFactsUsed'])).toMatchObject({
        devTrainSlots: 20,
        setPBlockedRequiredMemberships: 6,
        setRBlockedRequiredMemberships: 4,
        setPMechanicalSd9Successful: 20,
        setRMechanicalSd9Successful: 20,
        currentCorpusFreeze: 'BLOCKED',
      });
    });

    it('every bound digest equals the bytes at its stated commit', () => {
      const bindings: Json[] = [
        obj(record['r44Binding']),
        ...Object.values(obj(record['methodologyBindings'])).filter(
          (value): value is Json => typeof value === 'object' && value !== null,
        ),
        ...Object.entries(obj(record['frozenOwnerPolicyBindings']))
          .filter(([key]) => key !== 'reconfirmedCurrentPolicyFacts')
          .map(([, value]) => obj(value)),
        ...(obj(record['canonicalRuntimeBindings'])['modules'] as Json[]),
      ];
      expect(bindings.length).toBeGreaterThanOrEqual(23);
      for (const binding of bindings) {
        const commit = String(binding['readAtCommit']);
        if (!commitExists(commit)) continue;
        const bytes = gitBytes(commit, String(binding['path']));
        expect(binding['sha256'], String(binding['path'])).toBe(sha256(bytes));
        expect(binding['bytes'], String(binding['path'])).toBe(bytes.length);
      }
    });

    it('the bound canonical runtime is byte-identical in the working tree', () => {
      for (const binding of obj(record['canonicalRuntimeBindings'])['modules'] as Json[]) {
        expect(
          sha256(readFileSync(join(REPO_ROOT, String(binding['path'])))),
          binding['path'] as string,
        ).toBe(binding['sha256']);
      }
    });

    it('reconfirms every current short-text policy fact', () => {
      const facts = obj(obj(record['frozenOwnerPolicyBindings'])['reconfirmedCurrentPolicyFacts']);
      expect(facts).toMatchObject({
        shortTextSemanticallyUnresolved: true,
        jaccardValueInventedForEmptyUnion: false,
        ambiguityPropagated: true,
        onlyInvariantMembershipMaterialises: true,
        blockedRequiredMembershipRefusesCorpusFreeze: true,
        caseByCaseHumanLabelOrModelResolutionForbidden: true,
      });
    });

    it('records an anti-tuning boundary under which nothing real was inspected', () => {
      const boundary = obj(record['antiTuningBoundary']);
      for (const flag of [
        'optionsRunAgainstRealData',
        'realShortTextDocumentsRead',
        'labelsOrGoldRead',
        'sealedSplitsOpened',
        'databaseQueried',
        'networkUsed',
        'providerInference',
      ]) {
        expect(boundary[flag], flag).toBe(false);
      }
    });

    it('fixes exactly the 18 criteria, in order, and scores every option on exactly those', () => {
      const fixed = obj(record['fixedComparisonCriteria']);
      expect(fixed['fixedBeforeOptionsWereScored']).toBe(true);
      expect(fixed['changedAfterComparison']).toBe(false);
      expect((fixed['criteria'] as Json[]).map((c) => c['token'])).toEqual(CRITERIA);
      const matrix = obj(record['perOptionImpactMatrix']);
      expect(Object.keys(matrix).sort()).toEqual(
        ['A', 'B', 'C', 'D1_alwaysInclude', 'D2_alwaysExclude', 'E'].sort(),
      );
      for (const [option, rows] of Object.entries(matrix)) {
        const list = rows as Json[];
        expect(
          list.map((row) => row['token']),
          option,
        ).toEqual(CRITERIA);
        for (const row of list) {
          expect(['SATISFIES', 'PARTIAL', 'FAILS']).toContain(row['verdict']);
        }
      }
    });

    it('only Option A satisfies every criterion, and E is never selectable', () => {
      const matrix = obj(record['perOptionImpactMatrix']);
      const allSatisfied = Object.entries(matrix)
        .filter(([, rows]) => (rows as Json[]).every((row) => row['verdict'] === 'SATISFIES'))
        .map(([option]) => option);
      expect(allSatisfied).toEqual(['A']);
      const options = obj(record['options']);
      expect(Object.keys(options)).toEqual(['A', 'B', 'C', 'D', 'E']);
      expect(obj(options['A'])['token']).toBe(RECOMMENDED);
      expect(obj(options['E'])['selectable']).toBe(false);
      expect(obj(options['C'])['simple']).toBe(false);
    });

    it('specifies every required short-text case for Option A', () => {
      const cases = (obj(obj(record['options'])['A'])['specifiedCases'] as Json[]).map((c) =>
        String(c['case']),
      );
      for (const fragment of [
        'empty (0 tokens) vs empty',
        'empty vs non-empty',
        '1-token identical',
        '1-token different',
        '1-4 tokens, identical',
        '1-4 tokens, non-identical',
        'short (<5) vs >=5',
        '>=5 vs >=5',
      ]) {
        expect(
          cases.some((c) => c.startsWith(fragment)),
          fragment,
        ).toBe(true);
      }
    });

    it('recommends A, confirms the minimality hypothesis and classifies it as V2 R4', () => {
      expect(obj(record['recommendedOption'])['token']).toBe(RECOMMENDED);
      expect(obj(record['minimalityHypothesis'])['verdict']).toBe(
        'CONFIRM_THIS_AS_THE_RECOMMENDED_OPTION',
      );
      const classification = obj(record['recommendedMethodologyClassification']);
      expect(classification['recommended']).toBe('METHODOLOGY_V2_R4');
      expect(classification['notANewMethodologyGeneration']).toBe(true);
      expect(classification['decidedByConvenience']).toBe(false);
      expect(String(classification['crossGenerationRequirement'])).toMatch(/METHODOLOGY_V3_GEN2/);
    });

    it('drafts N1-N12 with no new number, and never claims the blockers clear', () => {
      const rule = obj(record['proposedNormativeRule']);
      expect(rule['status']).toBe('DRAFT_NOT_OPERATIVE');
      expect((rule['clauses'] as Json[]).map((c) => c['id'])).toEqual(
        Array.from({ length: 12 }, (_, i) => `N${i + 1}`),
      );
      expect(obj(record['noBlockerClearanceClaim'])['claimThatBlockersBecomeZero']).toBe(false);
    });

    it('places the restart at the SD7 graph, globally, and preserves A2 / V5 / R39 / R40', () => {
      const boundary = obj(obj(record['minimalReplayBoundary'])['recommendedOption']);
      expect(boundary).toMatchObject({
        earliestInvalidatedLayer: 'SD7_GRAPH',
        mustBeRecomputedForAllTwentyDevTrainSlots: true,
        r39EvidenceValid: true,
        r40DocumentsValid: true,
        governanceV5Valid: true,
        a2MustBeReopened: false,
        reserveReplayRequired: false,
        blockerTargetedRepairAllowed: false,
      });
      const plan = obj(record['futureReplayPlan']);
      expect(plan['status']).toBe('FUTURE_PLAN_ONLY_NOT_AUTHORISED');
      expect(plan['blockerTargeted']).toBe(false);
    });

    it('records the phase state: nothing amended, started, opened or frozen', () => {
      const state = obj(record['phaseState']);
      expect(Object.values(state).every((value) => value === false)).toBe(true);
      expect(Object.keys(state)).toEqual(
        expect.arrayContaining([
          'methodologyAmended',
          'a4Started',
          'a5Started',
          'ownerApprovalCreated',
        ]),
      );
    });

    it('asks the owner the exact next question naming the recommendation', () => {
      const question = String(record['nextOwnerQuestion']);
      expect(question).toContain(RECOMMENDED);
      expect(question).toContain('METHODOLOGY_V2_R4');
      expect(question).toMatch(/Do you approve that exact methodology amendment/);
    });
  },
);

// ---------------------------------------------------------------------------
// E. THE DRAFT PROPOSAL.
// ---------------------------------------------------------------------------

describe.skipIf(!existsSync(join(REPO_ROOT, PROPOSAL_PATH)))(
  '2D-A3 R45: the draft R4 proposal authorises nothing',
  () => {
    const proposal = existsSync(join(REPO_ROOT, PROPOSAL_PATH)) ? readJson(PROPOSAL_PATH) : {};

    it('is a non-authorising, unfrozen, unapproved draft', () => {
      expect(proposal).toMatchObject({
        recordKind: 'METHODOLOGY_AMENDMENT_PROPOSAL',
        status: 'DRAFT_AWAIT_OWNER_APPROVAL',
        authorityClass: 'NOT_EXECUTION_AUTHORITY',
        thisFileAuthorises: [],
        notFrozen: true,
        notImplementationAuthority: true,
        methodologyAmendmentApproved: false,
        isOwnerApproval: false,
        version: 'METHODOLOGY_V2_R4',
      });
    });

    it('amends only R3 SD7, unedited, for both generations', () => {
      const amends = obj(proposal['amends']);
      expect(obj(amends['methodologyV2ProposalR3'])['sha256']).toBe(
        FROZEN['docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL_R3.json'],
      );
      expect(amends['r3BytesEdited']).toBe(false);
      expect(proposal['appliesToGenerations']).toEqual([
        'METHODOLOGY_V2_GEN1',
        'METHODOLOGY_V3_GEN2',
      ]);
    });

    it.skipIf(!commitExists(A2_CHECKPOINT))(
      'binds the exact Methodology V3 bytes from the A2 checkpoint object',
      () => {
        const scope = obj(proposal['crossGenerationScope']);
        for (const key of ['methodologyV3ProposalR1', 'methodologyV3OwnerFreezeApproval']) {
          const binding = obj(scope[key]);
          expect(binding['readAtCommit']).toBe(A2_CHECKPOINT);
          expect(binding['sha256']).toBe(sha256(gitBytes(A2_CHECKPOINT, String(binding['path']))));
        }
      },
    );

    it('carries the same normative rule as the options record', () => {
      const options = readJson(OPTIONS_PATH);
      expect(proposal['proposedRule']).toEqual(options['proposedNormativeRule']);
    });
  },
);

// ---------------------------------------------------------------------------
// F. DISCLOSURE FIREWALL.
// ---------------------------------------------------------------------------

describe('2D-A3 R45: the records and audit disclose no real-corpus identity', () => {
  const texts = [OPTIONS_PATH, PROPOSAL_PATH, AUDIT_PATH]
    .filter((path) => existsSync(join(REPO_ROOT, path)))
    .map((path) => readFileSync(join(REPO_ROOT, path), 'utf8'));

  it('carries no URL, host, uuid, e-mail or identity field', () => {
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(text).not.toMatch(/https?:\/\//);
      expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      expect(text).not.toMatch(/\S@\S+\.\S/);
      expect(text).not.toMatch(
        /"(?:selectionIndex|selectionIndices|organisationId|echeRowKey|runId|documentSha256|blockedSlots|rankPosition|mainText)"\s*:/,
      );
    }
  });

  it('every 64-hex digest is a bound file digest, never an unbound one', () => {
    const record = existsSync(join(REPO_ROOT, OPTIONS_PATH)) ? readJson(OPTIONS_PATH) : {};
    const bound = new Set<string>([
      ...Object.values(FROZEN),
      ...[...JSON.stringify(record).matchAll(/"sha256":"([0-9a-f]{64})"/g)].map((m) => m[1]!),
    ]);
    for (const text of texts) {
      const digests = [...text.matchAll(/\b[0-9a-f]{64}\b/g)].map((m) => m[0]);
      expect(digests.filter((digest) => !bound.has(digest))).toEqual([]);
    }
  });
});
