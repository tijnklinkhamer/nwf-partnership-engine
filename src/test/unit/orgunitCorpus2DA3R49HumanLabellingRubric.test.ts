/**
 * PHASE 2B-2D A3 R49 — METHODOLOGY V2 HUMAN LABELLING RUBRIC V1, OWNER FREEZE.
 *
 * R48 stopped at the rubric gate: no approved byte identified the "frozen
 * rubric" Methodology V2 R3 and Corpus Acquisition Plan V1 require reviewers
 * to label from, and hard_negative had no operational definition. R49 resolves
 * that gap append-only with one owner-worded rubric record and one separate
 * owner-approval record that binds the rubric by exact bytes.
 *
 * These proofs pin that:
 *
 *   - R49 descends from the exact R48 tip, merges nothing, pinned R48's scope
 *     in one first commit touching exactly one file, and changed only that pin,
 *     this test, the rubric, its approval and one audit;
 *   - the R48 blocker and the methodology / plan bytes are bound exactly;
 *   - the rubric freezes exactly the three human fields R3 names - verdict,
 *     unit_type, hard_negative - with the owner's value sets, decision order,
 *     primary-subject rule, unit classes, hard-negative definition and
 *     validity matrix, and adds no other human-gold field;
 *   - hard_negative is a semantic property of the frozen page, never a score,
 *     a signal, a sample membership, a model failure or the G5 denominator;
 *   - G5, the 155 minimum, SD6 and sampling are unchanged;
 *   - the approval binds the rubric's exact SHA-256, byte count and source
 *     commit, authorises only the R50 handoff resumption, and authorises no
 *     label;
 *   - nothing current is inspected or disclosed.
 *
 * The synthetic cases below are frozen CONTRACT EXAMPLES: each carries the
 * label a human would give under a cited rubric clause, and the tests check
 * that the label is a legal combination and that the cited clause says what
 * the case relies on. Nothing here judges arbitrary prose: there is no
 * function that takes a page and returns a label.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** The exact R48 tip R49 was cut from. */
const R48_TERMINAL = 'ebe4e6fbd3e2504bbe5fac6963c23ab7bdcb665f';
/** The one commit that pinned R48's own blocker test to its range. */
const R48_SCOPE_PIN_COMMIT = '4e311930ecd5e5cb792ac16e34c127dc2e333142';
const R48_TEST = 'src/test/unit/orgunitCorpus2DA3R48A4HandoffRubricBlocker.test.ts';
const R48_CENSUS = 'docs/evaluation/PHASE_2B_2D_A3_R48_DEV_TRAIN_R4_A4_HANDOFF_CENSUS_V1.json';
const R48_CENSUS_SHA256 = 'ad028c8ff5245e80e674cc502ccd4b7e0a1986cadd41000746ef306b474bb24c';
const R48_TERMINAL_STATE = 'A3_R4_DEV_TRAIN_A4_HANDOFF_BLOCKED_AWAIT_OWNER_RUBRIC_CLARIFICATION';

const R49_TEST = 'src/test/unit/orgunitCorpus2DA3R49HumanLabellingRubric.test.ts';
const RUBRIC = 'docs/evaluation/PHASE_2B_2D_METHOD_V2_HUMAN_LABELLING_RUBRIC_V1.json';
const RUBRIC_SHA256 = 'e3af57d8d2503e4fc87ce707427762aabfed420bb670a262b9302a7ea78e1d69';
const RUBRIC_BYTES = 22125;
const APPROVAL =
  'docs/evaluation/PHASE_2B_2D_METHOD_V2_HUMAN_LABELLING_RUBRIC_V1_OWNER_APPROVAL.json';
const AUDIT = 'docs/audits/PHASE_2B_2D_A3_R49_METHOD_V2_HUMAN_LABELLING_RUBRIC_V1_OWNER_FREEZE.md';

const TERMINAL = 'A3_METHOD_V2_HUMAN_LABELLING_RUBRIC_V1_FROZEN_R50_HANDOFF_RESUME_AUTHORISED';

/** The immutable methodology and plan bytes the rubric binds. */
const BOUND = {
  methodologyV2R3: {
    path: 'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL_R3.json',
    sha256: 'fdc54873f4cdd47688d6d720229f0a0ea8426193711993a4f63a9f5000623f33',
  },
  methodologyV2R3OwnerApproval: {
    path: 'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_OWNER_FREEZE_APPROVAL_V1.json',
    sha256: '77dae976fb219bd94c33f236070a5c216a594a85ff8da3a490b5c948753d331e',
  },
  methodologyV2R4Amendment: {
    path: 'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_R4_SHORT_TEXT_AMENDMENT_PROPOSAL_V1.json',
    sha256: '5ebcc562e72f509e2b664f3ae800dc2043142d5d4a6ec1ec4d2958b8abab1d20',
  },
  methodologyV2R4OwnerApproval: {
    path: 'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_R4_SHORT_TEXT_AMENDMENT_OWNER_APPROVAL_V1.json',
    sha256: '986a48bdb672f2428c8ef07b04c43e0187e16b43f79b64c0a61b4aef51844eb2',
  },
  corpusAcquisitionPlanV1: {
    path: 'docs/evaluation/PHASE_2B_2D_METHODOLOGY_V2_CORPUS_ACQUISITION_PLAN_V1.json',
    sha256: '54279f1b3e45fe1be8c24e5c81d56693ebb2cdf0a34f346b748d16b56847184e',
  },
  corpusAcquisitionPlanV1OwnerApproval: {
    path: 'docs/evaluation/PHASE_2B_2D_METHODOLOGY_V2_CORPUS_ACQUISITION_PLAN_V1_OWNER_APPROVAL.json',
    sha256: '0ac475031e81a60ae58d70bb83d5f71ee3cc441573dc82cf88145fdf1e8fec14',
  },
} as const;

const VERDICTS = ['UNIT_PAGE', 'NOT_A_UNIT', 'NEEDS_REVIEW'] as const;
const UNIT_TYPES = [
  'INTERNATIONAL_MOBILITY_OFFICE',
  'LANGUAGE_CENTRE',
  'LANGUAGE_DEPARTMENT',
  'OTHER_UNIT',
] as const;

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

const lines = (value: string): string[] => value.split('\n').filter((l) => l.length > 0);
const bytesOf = (path: string): Buffer => readFileSync(join(REPO_ROOT, path));
const sha256 = (data: Buffer | string): string => createHash('sha256').update(data).digest('hex');
const json = (path: string): Record<string, unknown> =>
  JSON.parse(bytesOf(path).toString('utf8')) as Record<string, unknown>;
const at = (value: unknown, ...keys: (string | number)[]): unknown =>
  keys.reduce<unknown>(
    (node, key) =>
      node !== null && typeof node === 'object'
        ? (node as Record<string | number, unknown>)[key]
        : undefined,
    value,
  );

const baseAvailable = commitExists(R48_TERMINAL) && commitExists(R48_SCOPE_PIN_COMMIT);

/** Every path changed since R48 - committed or not. */
function changedSinceR48(): string[] {
  return [
    ...new Set([
      ...lines(git('diff', '--name-only', R48_TERMINAL)),
      ...lines(git('ls-files', '--others', '--exclude-standard')),
    ]),
  ];
}

const rubric = json(RUBRIC);

// ---------------------------------------------------------------------------
// The label-combination contract, read from the rubric's own matrix. It
// checks the SHAPE of a finished human label; it never produces one.
// ---------------------------------------------------------------------------

type LabelRecord = Record<string, unknown>;

interface MatrixRow {
  verdict: string;
  unitType: 'ONE_OF_FOUR_VALUES' | 'NULL_ONLY';
  hardNegative: 'FALSE_ONLY' | 'TRUE_OR_FALSE';
}

const matrix = at(rubric, 'labelValidityMatrix', 'rows') as MatrixRow[];
const labelFields = at(rubric, 'labelValidityMatrix', 'labelFields') as string[];
const unitTypeSet = at(rubric, 'unitType', 'valueSet') as string[];

function isLegalLabelCombination(label: LabelRecord): boolean {
  const keys = Object.keys(label).sort();
  if (keys.join() !== [...labelFields].sort().join()) return false;
  const row = matrix.find((r) => r.verdict === label['verdict']);
  if (row === undefined) return false;
  const unitType = label['unit_type'];
  const hardNegative = label['hard_negative'];
  if (typeof hardNegative !== 'boolean') return false;
  const unitTypeOk =
    row.unitType === 'NULL_ONLY'
      ? unitType === null
      : typeof unitType === 'string' && unitTypeSet.includes(unitType);
  const hardNegativeOk = row.hardNegative === 'TRUE_OR_FALSE' ? true : hardNegative === false;
  return unitTypeOk && hardNegativeOk;
}

/** A frozen synthetic contract example: prose, the human label, the clause it relies on. */
interface ContractCase {
  readonly name: string;
  readonly syntheticPage: string;
  readonly label: {
    verdict: (typeof VERDICTS)[number];
    unit_type: (typeof UNIT_TYPES)[number] | null;
    hard_negative: boolean;
  };
  /** Path into the rubric record, and a phrase that clause must contain. */
  readonly clause: readonly (string | number)[];
  readonly clauseSays: string;
}

const textAt = (...keys: (string | number)[]): string => JSON.stringify(at(rubric, ...keys));

// ---------------------------------------------------------------------------
// A. LINEAGE AND CHANGED SURFACE.
// ---------------------------------------------------------------------------

describe.skipIf(!baseAvailable)('2D-A3 R49: lineage and changed surface', () => {
  it('descends from the exact R48 tip, and merges no commit', () => {
    expect(() => git('merge-base', '--is-ancestor', R48_TERMINAL, 'HEAD')).not.toThrow();
    expect(lines(git('rev-list', '--merges', `${R48_TERMINAL}..HEAD`))).toEqual([]);
  });

  it("pinned R48's scope in exactly one first commit that touched exactly one file", () => {
    const [first] = lines(git('rev-list', '--reverse', `${R48_TERMINAL}..HEAD`));
    expect(first).toBe(R48_SCOPE_PIN_COMMIT);
    expect(git('rev-parse', `${R48_SCOPE_PIN_COMMIT}^`).trim()).toBe(R48_TERMINAL);
    expect(lines(git('diff', '--name-only', R48_TERMINAL, R48_SCOPE_PIN_COMMIT))).toEqual([
      R48_TEST,
    ]);
    expect(lines(git('diff', '--name-only', R48_SCOPE_PIN_COMMIT, '--', R48_TEST))).toEqual([]);
  });

  it('changes nothing outside the R48 scope pin, this test, the rubric, its approval and one audit', () => {
    const permitted = new Set([R48_TEST, R49_TEST, RUBRIC, APPROVAL, AUDIT]);
    expect(changedSinceR48().filter((path) => !permitted.has(path))).toEqual([]);
  });

  it('adds no runtime, harness, migration, CLI or script byte - so no auto-labeller exists', () => {
    expect(
      changedSinceR48().filter(
        (path) =>
          (path.startsWith('src/') && !path.startsWith('src/test/unit/')) ||
          /^(migrations|scripts)\//.test(path) ||
          /^package(-lock)?\.json$/.test(path),
      ),
    ).toEqual([]);
  });

  it('creates no DEV_CONFIRM, FINAL_HOLDOUT, gold, manifest, handoff or corpus-freeze artifact', () => {
    expect(
      changedSinceR48().filter((path) =>
        /DEV_CONFIRM|FINAL_HOLDOUT|GOLD_|MANIFEST_|CORPUS_FREEZE|CORPUS_FROZEN|A5_|HANDOFF|PACKAGE|TEMPLATE|\.jsonl$|\.html$/.test(
          path,
        ),
      ),
    ).toEqual([]);
  });

  it('leaves every earlier public record and audit byte untouched', () => {
    const prior = lines(
      git('ls-tree', '-r', '--name-only', R48_TERMINAL, '--', 'docs/evaluation', 'docs/audits'),
    );
    expect(prior).toContain(R48_CENSUS);
    expect(lines(git('diff', '--name-only', R48_TERMINAL, '--', ...prior))).toEqual([]);
  });

  it('wrote the rubric bytes in an earlier commit than the approval that binds them', () => {
    const source = String(at(json(APPROVAL), 'approvedRubric', 'sourceCommit'));
    expect(() => git('merge-base', '--is-ancestor', R48_TERMINAL, source)).not.toThrow();
    expect(() => git('merge-base', '--is-ancestor', source, 'HEAD')).not.toThrow();
    expect(sha256(git('show', `${source}:${RUBRIC}`))).toBe(RUBRIC_SHA256);
    expect(lines(git('ls-tree', '--name-only', source, '--', APPROVAL))).toEqual([]);
    expect(lines(git('diff', '--name-only', source, '--', RUBRIC))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// B. THE R48 BLOCKER AND THE METHODOLOGY / PLAN BYTES, BOUND EXACTLY.
// ---------------------------------------------------------------------------

describe('2D-A3 R49: the R48 blocker and the frozen methodology are bound exactly', () => {
  it('binds the R48 census unchanged, at its blocked terminal', () => {
    expect(sha256(bytesOf(R48_CENSUS))).toBe(R48_CENSUS_SHA256);
    const census = json(R48_CENSUS);
    expect(census['terminalState']).toBe(R48_TERMINAL_STATE);
    expect(at(census, 'rubricCompletenessAudit', 'rubricCompletenessPassed')).toBe(false);
    expect(at(census, 'rubricCompletenessAudit', 'blockingField')).toBe('hard_negative');
    const unbound = (at(census, 'rubricCompletenessAudit', 'fields') as Record<string, unknown>[])
      .filter((f) => f['field'] !== 'hard_negative')
      .map((f) => f['field']);
    expect(unbound).toEqual(['verdict', 'unit_type']);
    for (const field of ['labelsCreated', 'goldCreated', 'modelLabels']) {
      expect(at(census, 'labelBoundary', field), field).toBe(0);
    }
    for (const field of ['databaseConnections', 'devConfirmReads', 'finalHoldoutReads']) {
      expect(at(census, 'access', field), field).toBe(0);
    }
  });

  it.each(Object.entries(BOUND))(
    '%s is bound by exact bytes',
    (key, { path, sha256: expected }) => {
      expect(sha256(bytesOf(path))).toBe(expected);
      const binding = at(rubric, 'methodologyBindings', key) ?? at(rubric, 'planBindings', key);
      expect(binding).toEqual({ path, sha256: expected });
    },
  );

  it('defines exactly the three fields R3 and the plan require a human to confirm', () => {
    const r3 = at(json(BOUND.methodologyV2R3.path), 'sectionI_goldAndReviewContract');
    const required = at(r3, 'whatRequiresHumanConfirmation');
    expect(required).toEqual(at(rubric, 'methodologyBindings', 'humanConfirmationScopeFromR3'));
    expect(
      at(
        json(BOUND.corpusAcquisitionPlanV1.path),
        'labellingWorkflow',
        'whatRequiresHumanConfirmation',
      ),
    ).toHaveLength(3);
    expect(at(rubric, 'fulfils', 'definesOnly')).toEqual(['verdict', 'unit_type', 'hard_negative']);
    expect(labelFields).toEqual(['verdict', 'unit_type', 'hard_negative']);
    expect(at(rubric, 'fulfils', 'addsNoHumanGoldField')).toBe(true);
    expect(at(rubric, 'fulfils', 'pageKindIsAHumanGoldField')).toBe(false);
    expect(String(at(r3, 'workflow', 'step1_reviewerA'))).toContain('frozen rubric');
  });

  it('records the R48 blocker it resolves, append-only', () => {
    expect(at(rubric, 'fulfils', 'resolvesBlocker')).toEqual({
      r48Terminal: R48_TERMINAL,
      r48TerminalState: R48_TERMINAL_STATE,
      r48Census: R48_CENSUS,
      blockingField: 'hard_negative',
      additionallyUnboundFields: ['verdict', 'unit_type'],
      resolution: 'append-only; R48 bytes are never edited',
    });
  });
});

// ---------------------------------------------------------------------------
// C. RUBRIC STRUCTURE: VALUE SETS, ORDER, EVIDENCE, VALIDITY MATRIX.
// ---------------------------------------------------------------------------

describe('2D-A3 R49: rubric structure', () => {
  it('is the frozen, split-independent human rubric, authorising nothing itself', () => {
    expect(sha256(bytesOf(RUBRIC))).toBe(RUBRIC_SHA256);
    expect(bytesOf(RUBRIC).length).toBe(RUBRIC_BYTES);
    expect(rubric['recordKind']).toBe('HUMAN_GOLD_LABELLING_RUBRIC');
    expect(rubric['rubricVersion']).toBe('METHODOLOGY_V2_HUMAN_LABELLING_RUBRIC_V1');
    expect(rubric['status']).toBe('FROZEN_BY_OWNER');
    expect(at(rubric, 'authorityBoundary', 'thisFileAuthorises')).toEqual([]);
    expect(at(rubric, 'authorityBoundary', 'humanLabellingAuthorisedByThisFile')).toBe(false);
    const split = at(rubric, 'splitApplicability') as Record<string, unknown>;
    for (const flag of [
      'splitIndependent',
      'modelIndependent',
      'sampleIndependent',
      'candidateIndependent',
    ]) {
      expect(split[flag], flag).toBe(true);
    }
    expect(split['appliesIdenticallyTo']).toEqual(['DEV_TRAIN', 'DEV_CONFIRM', 'FINAL_HOLDOUT']);
    expect(split['currentlyAuthorisedUse']).toEqual(['DEV_TRAIN']);
    expect(split['sealedSplitsRemainClosed']).toEqual(['DEV_CONFIRM', 'FINAL_HOLDOUT']);
  });

  it('freezes exactly three verdicts and exactly four unit types', () => {
    expect(at(rubric, 'verdict', 'valueSet')).toEqual([...VERDICTS]);
    expect(at(rubric, 'verdict', 'noFurtherValue')).toBe(true);
    expect(Object.keys(at(rubric, 'verdict', 'definitions') as object)).toEqual([...VERDICTS]);
    expect(unitTypeSet).toEqual([...UNIT_TYPES]);
    expect(Object.keys(at(rubric, 'unitType', 'definitions') as object)).toEqual([...UNIT_TYPES]);
    expect(at(rubric, 'unitType', 'requiredIff')).toBe('verdict = UNIT_PAGE');
    expect(at(rubric, 'unitType', 'otherwise')).toBeNull();
  });

  it('freezes hard_negative as a boolean every reviewed item receives, after verdict', () => {
    expect(at(rubric, 'hardNegative', 'valueSet')).toEqual([true, false]);
    expect(at(rubric, 'hardNegative', 'everyReviewedItemReceivesOneBoolean')).toBe(true);
    expect(at(rubric, 'hardNegative', 'assignedAfterVerdict')).toBe(true);
  });

  it('orders the decisions verdict -> unit_type -> hard_negative, and hard_negative never steers verdict', () => {
    expect(at(rubric, 'decisionOrder', 'order')).toEqual(['verdict', 'unit_type', 'hard_negative']);
    expect(at(rubric, 'decisionOrder', 'hardNegativeMustNotInfluenceVerdict')).toBe(true);
    expect(textAt('decisionOrder', 'statement')).toContain(
      'never made NOT_A_UNIT merely so it can become a hard negative',
    );
  });

  it('confines evidence to the frozen review item', () => {
    expect(at(rubric, 'evidenceBoundary', 'permittedEvidence')).toEqual([
      'captured main text',
      'captured title(s)',
      'captured headings',
      'captured requested URL / meaningful URL host and path',
      'the complete source-presentation provenance included in the review item',
    ]);
    const forbidden = at(rubric, 'evidenceBoundary', 'forbiddenEvidence') as string[];
    for (const item of [
      'live browsing',
      'search',
      'external knowledge',
      'current website state',
      'classifier or model outputs',
      'candidate score',
      'SET_P membership',
      'SET_R membership',
      'sample rank',
      'acquisition generation',
      'old gold',
      'historical proposed labels',
      'signal metadata as an answer key',
    ]) {
      expect(forbidden, item).toContain(item);
    }
  });

  it('freezes exactly the three-row validity matrix', () => {
    expect(matrix).toEqual([
      { verdict: 'UNIT_PAGE', unitType: 'ONE_OF_FOUR_VALUES', hardNegative: 'FALSE_ONLY' },
      { verdict: 'NOT_A_UNIT', unitType: 'NULL_ONLY', hardNegative: 'TRUE_OR_FALSE' },
      { verdict: 'NEEDS_REVIEW', unitType: 'NULL_ONLY', hardNegative: 'FALSE_ONLY' },
    ]);
    expect(at(rubric, 'labelValidityMatrix', 'noOtherCombinationIsValid')).toBe(true);
  });

  it('admits exactly the legal combinations of the full label space', () => {
    const legal: string[] = [];
    for (const verdict of VERDICTS) {
      for (const unitType of [...UNIT_TYPES, null]) {
        for (const hardNegative of [true, false]) {
          if (
            isLegalLabelCombination({
              verdict,
              unit_type: unitType,
              hard_negative: hardNegative,
            })
          ) {
            legal.push(`${verdict}|${String(unitType)}|${String(hardNegative)}`);
          }
        }
      }
    }
    expect(legal).toEqual([
      'UNIT_PAGE|INTERNATIONAL_MOBILITY_OFFICE|false',
      'UNIT_PAGE|LANGUAGE_CENTRE|false',
      'UNIT_PAGE|LANGUAGE_DEPARTMENT|false',
      'UNIT_PAGE|OTHER_UNIT|false',
      'NOT_A_UNIT|null|true',
      'NOT_A_UNIT|null|false',
      'NEEDS_REVIEW|null|false',
    ]);
  });

  it('rejects every illegal shape named by the matrix', () => {
    const illegal: LabelRecord[] = [
      { verdict: 'UNIT_PAGE', unit_type: null, hard_negative: false },
      { verdict: 'UNIT_PAGE', unit_type: 'LANGUAGE_CENTRE', hard_negative: true },
      { verdict: 'NOT_A_UNIT', unit_type: 'OTHER_UNIT', hard_negative: false },
      { verdict: 'NEEDS_REVIEW', unit_type: 'LANGUAGE_CENTRE', hard_negative: false },
      { verdict: 'NEEDS_REVIEW', unit_type: null, hard_negative: true },
      { verdict: 'UNIT_PAGE', unit_type: 'INTERNATIONAL_OFFICE', hard_negative: false },
      { verdict: 'UNCLEAR', unit_type: null, hard_negative: false },
      { verdict: 'NOT_A_UNIT', unit_type: null, hard_negative: null },
      { verdict: 'NOT_A_UNIT', unit_type: null },
    ];
    for (const label of illegal) {
      expect(isLegalLabelCombination(label), JSON.stringify(label)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// D. VERDICT AND UNIT-TYPE SEMANTICS, AS FROZEN SYNTHETIC CONTRACT EXAMPLES.
// ---------------------------------------------------------------------------

const VERDICT_CASES: readonly ContractCase[] = [
  {
    name: 'a clear international office page',
    syntheticPage:
      'Title: International Relations Office. The office supports incoming and outgoing exchange students, runs Erasmus mobility, and holds weekly opening hours.',
    label: {
      verdict: 'UNIT_PAGE',
      unit_type: 'INTERNATIONAL_MOBILITY_OFFICE',
      hard_negative: false,
    },
    clause: ['verdict', 'definitions', 'UNIT_PAGE', 'rule'],
    clauseSays: 'principally presents an identifiable, ongoing organisational unit',
  },
  {
    name: 'an Erasmus grant procedure naming the international office only as its contact',
    syntheticPage:
      'Title: Erasmus mobility grant 2027 - how to apply. Eligibility, deadlines and amounts. Questions: contact the International Office.',
    label: { verdict: 'NOT_A_UNIT', unit_type: null, hard_negative: true },
    clause: ['verdict', 'unitMentionIsNotUnitSubject', 'rule'],
    clauseSays: 'appears only incidentally',
  },
  {
    name: 'a degree programme',
    syntheticPage:
      'Title: Bachelor in Chemistry. Three-year programme, modules by semester, admission requirements and tuition.',
    label: { verdict: 'NOT_A_UNIT', unit_type: null, hard_negative: false },
    clause: ['verdict', 'definitions', 'NOT_A_UNIT', 'commonExamples'],
    clauseSays: 'degree or course programme',
  },
  {
    name: 'a news item about an event',
    syntheticPage:
      'Title: Campus open day this Saturday. Programme of talks, campus tours and refreshments.',
    label: { verdict: 'NOT_A_UNIT', unit_type: null, hard_negative: false },
    clause: ['verdict', 'definitions', 'NOT_A_UNIT', 'commonExamples'],
    clauseSays: 'event announcement',
  },
  {
    name: 'a page presenting several units with no primary subject',
    syntheticPage:
      'Title: Student services. Equal sections on the library, the careers service, the international office and the language centre.',
    label: { verdict: 'NEEDS_REVIEW', unit_type: null, hard_negative: false },
    clause: ['verdict', 'definitions', 'NEEDS_REVIEW', 'validCases'],
    clauseSays:
      'several distinct organisational units without a reliably identifiable primary subject',
  },
  {
    name: 'sparse, ambiguous office evidence',
    syntheticPage: 'Title: Mobility. Room 2.14.',
    label: { verdict: 'NEEDS_REVIEW', unit_type: null, hard_negative: false },
    clause: ['verdict', 'definitions', 'NEEDS_REVIEW', 'validCases'],
    clauseSays: 'too sparse to determine whether the unit is actually the page',
  },
];

const UNIT_TYPE_CASES: readonly ContractCase[] = [
  {
    name: 'an operational international office',
    syntheticPage:
      'Title: International Office. We advise outgoing students on study abroad and welcome incoming exchange students.',
    label: {
      verdict: 'UNIT_PAGE',
      unit_type: 'INTERNATIONAL_MOBILITY_OFFICE',
      hard_negative: false,
    },
    clause: ['unitType', 'definitions', 'INTERNATIONAL_MOBILITY_OFFICE', 'remits'],
    clauseSays: 'study abroad',
  },
  {
    name: 'an operational language-support centre',
    syntheticPage:
      'Title: Centre de Langues. Courses in eight languages for all students, a self-access room and FLE support.',
    label: { verdict: 'UNIT_PAGE', unit_type: 'LANGUAGE_CENTRE', hard_negative: false },
    clause: ['unitType', 'definitions', 'LANGUAGE_CENTRE', 'rule'],
    clauseSays: 'OPERATIONAL language-teaching, language-learning, language-support',
  },
  {
    name: 'an academic language faculty',
    syntheticPage:
      'Title: Faculty of Modern Languages. Our faculty offers bachelor and master degrees in linguistics and literature, and hosts four research teams.',
    label: { verdict: 'UNIT_PAGE', unit_type: 'LANGUAGE_DEPARTMENT', hard_negative: false },
    clause: ['unitType', 'definitions', 'LANGUAGE_DEPARTMENT', 'rule'],
    clauseSays: 'ACADEMIC faculty, school or department',
  },
  {
    name: 'a clearly organisational but unrelated service',
    syntheticPage:
      'Title: Careers Service. The service offers CV reviews, internship advice and employer fairs, open Monday to Friday.',
    label: { verdict: 'UNIT_PAGE', unit_type: 'OTHER_UNIT', hard_negative: false },
    clause: ['unitType', 'definitions', 'OTHER_UNIT', 'rule'],
    clauseSays: 'none of the three specialised classes fits',
  },
  {
    name: 'a language unit that cannot be placed as centre or department',
    syntheticPage: 'Title: Languages. Our team teaches English, German and Spanish.',
    label: { verdict: 'NEEDS_REVIEW', unit_type: null, hard_negative: false },
    clause: ['unitType', 'definitions', 'LANGUAGE_DEPARTMENT', 'ifDistinctionUnresolvable'],
    clauseSays: 'NEEDS_REVIEW',
  },
];

describe('2D-A3 R49: verdict semantics (synthetic contract examples)', () => {
  it('states the primary-subject rule and its three clarifications', () => {
    expect(at(rubric, 'verdict', 'primarySubjectRule', 'coreQuestion')).toBe(
      'What is the PRIMARY SUBJECT of this frozen page?',
    );
    expect(at(rubric, 'verdict', 'primarySubjectRule', 'clarifications')).toEqual([
      'The presence of target vocabulary alone does not make a page a UNIT_PAGE.',
      "The mention of an office alone does not make a page that office's page.",
      'A contact address alone does not make a page a UNIT_PAGE.',
    ]);
  });

  it('keeps NEEDS_REVIEW narrow and outside knowledge out', () => {
    expect(at(rubric, 'verdict', 'definitions', 'NEEDS_REVIEW', 'invalidReasons')).toEqual([
      'the decision is difficult',
      'the page is unusual',
      'the reviewer is not completely certain',
      'the reviewer lacks external institutional knowledge',
    ]);
    expect(at(rubric, 'verdict', 'definitions', 'NEEDS_REVIEW', 'outsideKnowledgeMayResolve')).toBe(
      false,
    );
  });

  it('allows the whole organisation only when the page presents its own ongoing function', () => {
    expect(
      at(rubric, 'verdict', 'wholeOrganisationAllowance', 'organisationIdentityAloneSuffices'),
    ).toBe(false);
    expect(textAt('verdict', 'wholeOrganisationAllowance', 'statement')).toContain(
      'not automatically a UNIT_PAGE',
    );
  });

  it.each([...VERDICT_CASES, ...UNIT_TYPE_CASES])(
    '$name -> a legal label backed by the cited clause',
    ({ label, clause, clauseSays }) => {
      expect(isLegalLabelCombination(label)).toBe(true);
      expect(textAt(...clause)).toContain(clauseSays);
    },
  );

  it('covers every verdict and every unit type with at least one contract example', () => {
    const cases = [...VERDICT_CASES, ...UNIT_TYPE_CASES];
    expect(new Set(cases.map((c) => c.label.verdict))).toEqual(new Set(VERDICTS));
    expect(new Set(cases.map((c) => c.label.unit_type).filter((t) => t !== null))).toEqual(
      new Set(UNIT_TYPES),
    );
  });

  it('names alone never decide the unit type, and OTHER_UNIT is no fallback', () => {
    expect(
      at(rubric, 'unitType', 'definitions', 'INTERNATIONAL_MOBILITY_OFFICE', 'namesAloneDecide'),
    ).toBe(false);
    expect(
      at(
        rubric,
        'unitType',
        'definitions',
        'OTHER_UNIT',
        'notAFallbackForUncertainUnitPageVerdict',
      ),
    ).toBe(true);
    expect(at(rubric, 'unitType', 'definitions', 'OTHER_UNIT', 'ifUnitNessUnresolved')).toBe(
      'NEEDS_REVIEW',
    );
  });
});

// ---------------------------------------------------------------------------
// E. HARD_NEGATIVE.
// ---------------------------------------------------------------------------

const HARD_NEGATIVE_CASES: readonly (ContractCase & {
  shapeList: 'positive' | 'negative' | null;
})[] = [
  {
    name: 'an International BBA programme',
    syntheticPage: 'Title: International BBA. A four-year business degree taught in English.',
    label: { verdict: 'NOT_A_UNIT', unit_type: null, hard_negative: true },
    clause: ['hardNegative', 'positiveExampleShapes', 'shapes'],
    clauseSays: 'International BBA degree-programme page',
    shapeList: 'positive',
  },
  {
    name: 'an Erasmus Days event',
    syntheticPage: 'Title: Erasmus Days 2027. Stands, talks by returning students, and a quiz.',
    label: { verdict: 'NOT_A_UNIT', unit_type: null, hard_negative: true },
    clause: ['hardNegative', 'positiveExampleShapes', 'shapes'],
    clauseSays: 'Erasmus Days event/news page',
    shapeList: 'positive',
  },
  {
    name: 'an Erasmus grant page where the office is contact only',
    syntheticPage:
      'Title: Erasmus grant allocation. Amounts by destination country. Contact: International Office.',
    label: { verdict: 'NOT_A_UNIT', unit_type: null, hard_negative: true },
    clause: ['hardNegative', 'positiveExampleShapes', 'shapes'],
    clauseSays: 'Erasmus grant/allocation procedure page',
    shapeList: 'positive',
  },
  {
    name: 'a language-learning article',
    syntheticPage: 'Title: Five habits that help you learn a language. An article for students.',
    label: { verdict: 'NOT_A_UNIT', unit_type: null, hard_negative: true },
    clause: ['hardNegative', 'positiveExampleShapes', 'shapes'],
    clauseSays: 'language-learning article/course information page',
    shapeList: 'positive',
  },
  {
    name: 'an international landing page with no unit subject',
    syntheticPage: 'Title: International. Links: study abroad, partner universities, news.',
    label: { verdict: 'NOT_A_UNIT', unit_type: null, hard_negative: true },
    clause: ['hardNegative', 'positiveExampleShapes', 'shapes'],
    clauseSays: "'International' section landing page with no unit as subject",
    shapeList: 'positive',
  },
  {
    name: 'a clear UNIT_PAGE',
    syntheticPage: 'Title: Language Centre. Courses, self-access room, opening hours.',
    label: { verdict: 'UNIT_PAGE', unit_type: 'LANGUAGE_CENTRE', hard_negative: false },
    clause: ['hardNegative', 'necessaryCondition', 'rule'],
    clauseSays: 'hard_negative = false ALWAYS',
    shapeList: null,
  },
  {
    name: 'a NEEDS_REVIEW page',
    syntheticPage: 'Title: Relations. Building C.',
    label: { verdict: 'NEEDS_REVIEW', unit_type: null, hard_negative: false },
    clause: ['hardNegative', 'necessaryCondition', 'rule'],
    clauseSays: 'If verdict != NOT_A_UNIT',
    shapeList: null,
  },
  {
    name: 'an unrelated NOT_A_UNIT page',
    syntheticPage: 'Title: New sports hall opens. The hall seats 400 spectators.',
    label: { verdict: 'NOT_A_UNIT', unit_type: null, hard_negative: false },
    clause: ['hardNegative', 'negativeExampleShapes', 'shapes'],
    clauseSays: 'unrelated general news',
    shapeList: 'negative',
  },
  {
    name: 'a generic homepage with only incidental sitewide international navigation',
    syntheticPage:
      'Title: Welcome to the university. Rector message and campus news. [navigation: Study | Research | International | Contact]',
    label: { verdict: 'NOT_A_UNIT', unit_type: null, hard_negative: false },
    clause: ['hardNegative', 'prominenceMaterialityRule', 'doNotSetTrueBecauseOf'],
    clauseSays: 'incidental site-wide navigation',
    shapeList: 'negative',
  },
];

describe('2D-A3 R49: hard_negative', () => {
  it('can be true only for NOT_A_UNIT', () => {
    expect(at(rubric, 'hardNegative', 'necessaryCondition')).toEqual({
      rule: 'If verdict != NOT_A_UNIT then hard_negative = false ALWAYS.',
      UNIT_PAGE: false,
      NEEDS_REVIEW: false,
      statement: 'Only a NOT_A_UNIT page may be a hard negative.',
    });
    for (const verdict of ['UNIT_PAGE', 'NEEDS_REVIEW'] as const) {
      for (const unitType of [...UNIT_TYPES, null]) {
        expect(
          isLegalLabelCombination({ verdict, unit_type: unitType, hard_negative: true }),
          verdict,
        ).toBe(false);
      }
    }
  });

  it('is the two-condition semantic subclass of NOT_A_UNIT the owner froze', () => {
    const def = at(rubric, 'hardNegative', 'normativeDefinition') as Record<string, unknown>;
    expect(def['conditionA']).toBe(
      'The page is genuinely NOT_A_UNIT under the primary-subject rule.',
    );
    expect(def['conditionB']).toBe(
      'The frozen page contains a MATERIAL, PROMINENT target-adjacent cue that makes it a plausible false-positive confuser for the organisational-unit task.',
    );
    expect(String(def['rule'])).toMatch(/iff BOTH conditions hold/);
    expect(def['isASemanticPropertyOfTheFrozenPage']).toBe(true);
  });

  it('is not defined by score, signal, sample membership, model failure or the G5 denominator', () => {
    const def = at(rubric, 'hardNegative', 'normativeDefinition') as Record<string, unknown>;
    expect(def['definedByModelFailure']).toBe(false);
    expect(def['definedByCandidateScore']).toBe(false);
    expect(def['definedByDenominatorMembership']).toBe(false);
    const mustNot = at(rubric, 'hardNegative', 'reviewerMustNotSeeOrUse') as string[];
    for (const input of [
      'deterministic candidate score',
      'Track A/B score',
      'signal firing',
      'SET_P membership',
      'SET_R membership',
      'sample rank',
      'model output',
      'classifier prediction',
      'whether a candidate previously failed it',
      'G5 denominator status',
      'previous hard-negative label',
      'historical gold',
    ]) {
      expect(mustNot, input).toContain(input);
    }
    expect(textAt('hardNegative', 'negativeExampleShapes', 'statement')).toContain(
      'entered SET_P or SET_R does NOT make it a hard negative',
    );
  });

  it('has no slot for a score, a signal, a sample membership or a model output in a label', () => {
    const base = { verdict: 'NOT_A_UNIT', unit_type: null, hard_negative: true };
    for (const extra of [
      'candidateScore',
      'trackAScore',
      'signals',
      'setPMember',
      'setRMember',
      'sampleRank',
      'modelVerdict',
      'classifierPrediction',
      'page_kind',
    ]) {
      expect(isLegalLabelCombination({ ...base, [extra]: 1 }), extra).toBe(false);
    }
  });

  it('requires a material, prominent cue and excludes boilerplate', () => {
    expect(at(rubric, 'hardNegative', 'prominenceMaterialityRule', 'mayAppearIn')).toEqual([
      'title',
      'leading/prominent heading',
      'substantive body text',
      'meaningful requested URL host/path',
      'another clearly page-specific captured field',
    ]);
    expect(
      at(rubric, 'hardNegative', 'prominenceMaterialityRule', 'doNotSetTrueBecauseOf'),
    ).toEqual([
      'incidental site-wide navigation',
      'footer boilerplate',
      'a buried unrelated link',
      'generic institution-wide boilerplate',
      "an isolated irrelevant token with no connection to the page's subject",
    ]);
    expect(Object.keys(at(rubric, 'hardNegative', 'targetAdjacentCues') as object)).toEqual([
      'internationalMobilityDomain',
      'languageDomain',
      'unitLikeStructuralCue',
    ]);
  });

  it('keeps its example shapes illustrations, never historical labels', () => {
    expect(at(rubric, 'hardNegative', 'positiveExampleShapes', 'shapes')).toHaveLength(10);
    expect(at(rubric, 'hardNegative', 'positiveExampleShapes', 'rubricIllustrationsOnly')).toBe(
      true,
    );
    expect(at(rubric, 'hardNegative', 'positiveExampleShapes', 'historicalItemLabels')).toBe(false);
    expect(at(rubric, 'hardNegative', 'negativeExampleShapes', 'shapes')).toHaveLength(5);
  });

  it.each(HARD_NEGATIVE_CASES)(
    '$name -> hard_negative $label.hard_negative, backed by the cited clause',
    ({ label, clause, clauseSays, shapeList }) => {
      expect(isLegalLabelCombination(label)).toBe(true);
      expect(textAt(...clause)).toContain(clauseSays);
      if (shapeList === 'positive') expect(label.hard_negative).toBe(true);
      if (shapeList === 'negative') expect(label.hard_negative).toBe(false);
    },
  );
});

// ---------------------------------------------------------------------------
// F. G5, ANTI-TUNING, PRECEDENT AND THE NO-DATA BOUNDARY.
// ---------------------------------------------------------------------------

describe('2D-A3 R49: G5, sampling and anti-tuning are unchanged', () => {
  it('only names the gold class under the already-frozen G5 and SD6', () => {
    const r3 = json(BOUND.methodologyV2R3.path);
    const sd6 = (at(r3, 'sectionE_samplingContract', 'rules') as Record<string, unknown>[]).find(
      (r) => r['id'] === 'SD6',
    );
    expect(sd6?.['minimumHardNegativesPerGatedSplit']).toBe(155);
    expect(
      at(r3, 'sectionD_D3_corpusOption', 'perGatedSplitContract', 'hardNegativesInSET_P_minimum'),
    ).toBe(155);
    const g5 = at(rubric, 'g5Relationship') as Record<string, unknown>;
    expect(g5['metric']).toBe('hardNegativeRejection');
    expect(g5['measuredOn']).toBe('SET_P only');
    expect(g5['semanticsUnchanged']).toBe(true);
    expect(g5['minimumHardNegativesPerGatedSplit']).toBe(155);
    expect(g5['realisationGuaranteed']).toBe(false);
    expect(g5['neverChangeRubricToReachDenominator']).toBe(true);
    expect(String(g5['ifMinimumNotRealised'])).toContain('SD6');
  });

  it('was frozen before any current label, package, enrichment or sealed split', () => {
    const anti = at(rubric, 'antiTuning') as Record<string, unknown>;
    expect(anti['frozenBefore']).toEqual([
      'R48 package materialisation',
      'any current DEV_TRAIN label',
      'realised SET_R enrichment',
      'DEV_CONFIRM opening',
      'FINAL_HOLDOUT opening',
    ]);
    for (const flag of [
      'testedAgainstCurrentItems',
      'currentExpectedHardNegativesComputed',
      'currentPageContentInspected',
      'tunedToHistoricalShare',
    ]) {
      expect(anti[flag], flag).toBe(false);
    }
  });

  it('cites precedent without making it authority, and gives no model authority', () => {
    expect(at(rubric, 'precedentNotAuthority', 'precedentBecomesAuthority')).toBe(false);
    expect(at(rubric, 'precedentNotAuthority', 'classifierPromptBytesBoundAsRubricSemantics')).toBe(
      false,
    );
    expect(at(rubric, 'precedentNotAuthority', 'historicalGoldIdentitiesBound')).toBe(false);
    expect(at(rubric, 'noModelAuthority', 'modelOutputDefinesGold')).toBe(false);
    expect(at(rubric, 'noModelAuthority', 'modelMayDraftOrProposeGoldUnderThisRubric')).toBe(false);
    expect(at(rubric, 'noLabelData')).toEqual({
      labelsContained: 0,
      goldIdsContained: 0,
      currentCorpusIdentitiesContained: 0,
      currentLabelCountsContained: 0,
      sampleOutcomeContained: false,
    });
  });

  it('reads no database, corpus text, candidate item or harness in this proof', () => {
    const source = bytesOf(R49_TEST).toString('utf8');
    const imports = [...source.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
    expect(imports).toEqual([
      'node:child_process',
      'node:crypto',
      'node:fs',
      'node:path',
      'vitest',
    ]);
  });
});

// ---------------------------------------------------------------------------
// G. THE OWNER APPROVAL.
// ---------------------------------------------------------------------------

describe('2D-A3 R49: the owner approval binds the exact rubric bytes', () => {
  const approval = json(APPROVAL);

  it('records both owner decisions', () => {
    expect(approval['recordKind']).toBe('OWNER_HUMAN_LABELLING_RUBRIC_APPROVAL');
    expect((approval['ownerDecisions'] as { marker: string }[]).map((d) => d.marker)).toEqual([
      'APPROVE_PHASE_2B_2D_METHOD_V2_HUMAN_LABELLING_RUBRIC_V1',
      'AUTHORISE_A3_R50_RESUME_R4_DEV_TRAIN_A4_HANDOFF_MATERIALISATION',
    ]);
  });

  it('binds path, SHA-256, byte count and source commit, recomputed', () => {
    const bound = at(approval, 'approvedRubric') as Record<string, unknown>;
    expect(bound['path']).toBe(RUBRIC);
    expect(bound['sha256']).toBe(RUBRIC_SHA256);
    expect(bound['bytes']).toBe(RUBRIC_BYTES);
    expect(sha256(bytesOf(RUBRIC))).toBe(bound['sha256']);
    expect(bytesOf(RUBRIC).length).toBe(bound['bytes']);
    expect(String(bound['sourceCommit'])).toMatch(/^[0-9a-f]{40}$/);
    expect(bound['bytesNeverChangeOnApproval']).toBe(true);
  });

  it('binds the exact R48 blocker state', () => {
    expect(at(approval, 'r48Blocker')).toEqual({
      r48Terminal: R48_TERMINAL,
      terminalState: R48_TERMINAL_STATE,
      census: R48_CENSUS,
      censusSha256: R48_CENSUS_SHA256,
      rubricCompletenessPassed: false,
      blockingField: 'hard_negative',
      additionallyUnboundFields: ['verdict', 'unit_type'],
      labelsCreated: 0,
      goldCreated: 0,
      modelLabels: 0,
      databaseConnections: 0,
      devConfirmReads: 0,
      finalHoldoutReads: 0,
    });
  });

  it('authorises the R50 handoff resumption and nothing else', () => {
    expect(approval['authorityFlags']).toEqual({
      rubricApproved: true,
      rubricFrozen: true,
      r50HandoffResumeAuthorised: true,
      r50Executed: false,
      humanLabelsAuthorised: false,
      humanLabelsExecuted: false,
      modelLabelsAuthorised: false,
      devConfirmAccessAuthorised: false,
      finalHoldoutAccessAuthorised: false,
      a5FreezeAuthorised: false,
    });
    expect(approval['terminalState']).toBe(TERMINAL);
  });

  it('touched no database, network, provider, sealed split or label', () => {
    expect(Object.values(approval['access'] as Record<string, number>).every((n) => n === 0)).toBe(
      true,
    );
    expect(Object.keys(approval['access'] as object).length).toBeGreaterThanOrEqual(8);
  });
});

// ---------------------------------------------------------------------------
// H. THE AUDIT AND THE DISCLOSURE FIREWALL.
// ---------------------------------------------------------------------------

describe('2D-A3 R49: the audit and the disclosure firewall', () => {
  it('names the blocker, the rubric binding and the terminal', () => {
    const audit = bytesOf(AUDIT).toString('utf8');
    for (const token of [
      R48_TERMINAL,
      R48_TERMINAL_STATE,
      RUBRIC_SHA256,
      String(RUBRIC_BYTES),
      'hard_negative',
      'primary subject',
      'G5',
      'DEV_CONFIRM',
      'FINAL_HOLDOUT',
      TERMINAL,
    ]) {
      expect(audit, token).toContain(token);
    }
  });

  it.each([RUBRIC, APPROVAL, AUDIT])('%s discloses no identity, URL or unbound digest', (path) => {
    const text = bytesOf(path).toString('utf8');
    expect(text).not.toMatch(/\bg[0-9a-f]{16}\b/);
    expect(text).not.toMatch(/https?:\/\//);
    expect(text).not.toMatch(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/);
    const bound = new Set<string>([
      R48_CENSUS_SHA256,
      RUBRIC_SHA256,
      ...Object.values(BOUND).map((b) => b.sha256),
    ]);
    const digests = [...text.matchAll(/\b[0-9a-f]{64}\b/g)].map((m) => m[0]);
    expect(digests.filter((d) => !bound.has(d))).toEqual([]);
    for (const commit of [...text.matchAll(/\b[0-9a-f]{40}\b/g)].map((m) => m[0])) {
      if (baseAvailable) expect(commitExists(commit), commit).toBe(true);
    }
  });
});
