/**
 * PHASE 2B-2D A4 R52 — HUMAN-REVIEW DEFERRAL AND NON-EVALUATION ENGINEERING RELEASE.
 *
 *   A. lineage: R52 descends from the exact R51 terminal, pins R51's scope in
 *      one first commit, merges nothing, and changes only its own surface;
 *   B. the R51 authority, package, rubric and tool are byte-unchanged;
 *   C. zero labels: the 222 items remain pending and no completed response
 *      file, model label or sealed-split artifact exists;
 *   D. the deferral record defers (never revokes) review, releases only
 *      non-evaluation engineering and claims no empirical validation;
 *   E. the engineering census is not an evaluation result and its cited
 *      refs are real;
 *   F. the records disclose bound hashes only.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const R51_TERMINAL = '468e444215727f8d3a789c51681506872b01bfae';
const R51_ISOLATION_TEST =
  'src/test/unit/orgunitCorpus2DA4R51DevTrainSingleReviewIsolation.test.ts';
const R52_TEST = 'src/test/unit/orgunitCorpus2DA4R52HumanReviewDeferral.test.ts';
const RELEASE =
  'docs/evaluation/PHASE_2B_2D_A4_R52_HUMAN_REVIEW_DEFERRAL_AND_ENGINEERING_RELEASE_V1.json';
const ENGINEERING_CENSUS =
  'docs/evaluation/PHASE_2B_2D_A4_R52_NON_EVALUATION_ENGINEERING_CENSUS_V1.json';
const AUDIT = 'docs/audits/PHASE_2B_2D_A4_R52_HUMAN_REVIEW_DEFERRAL_AND_ENGINEERING_RELEASE_V1.md';

const APPROVAL =
  'docs/evaluation/PHASE_2B_2D_A4_DEV_TRAIN_HUMAN_SINGLE_REVIEW_OWNER_APPROVAL_V1.json';
const AUTHORITY = 'docs/evaluation/PHASE_2B_2D_A4_DEV_TRAIN_HUMAN_SINGLE_REVIEW_AUTHORITY_V1.json';
const R51_CENSUS =
  'docs/evaluation/PHASE_2B_2D_A4_R51_DEV_TRAIN_SINGLE_REVIEW_AUTHORITY_CENSUS_V1.json';
const TOOL = 'docs/evaluation/corpus/PHASE_2B_2D_A4_DEV_TRAIN_SINGLE_REVIEW_TOOL_V1.html';
const PACKAGE =
  'docs/evaluation/corpus/PHASE_2B_2D_A3_R50_DEV_TRAIN_R4_SINGLE_REVIEW_PACKAGE_V1.jsonl';
const TEMPLATE =
  'docs/evaluation/corpus/PHASE_2B_2D_A3_R50_DEV_TRAIN_R4_SINGLE_REVIEW_RESPONSE_TEMPLATE_V1.jsonl';
const RUBRIC = 'docs/evaluation/PHASE_2B_2D_METHOD_V2_HUMAN_LABELLING_RUBRIC_V1.json';
const RESPONSES_FILE = 'PHASE_2B_2D_A4_DEV_TRAIN_SINGLE_REVIEW_RESPONSES_V1.jsonl';

const PACKAGE_HASH = '9664388949f5d8686fe32af2fb4fb8f933787faf6daf11349d5b8a402db4066e';
const RUBRIC_SHA = 'e3af57d8d2503e4fc87ce707427762aabfed420bb670a262b9302a7ea78e1d69';
const FILE_SHAS: Record<string, string> = {
  [APPROVAL]: '26ec30cd7fcb3f29fa982e17059d9cdd6eb6652b6e20be6a5e86c7256f05a561',
  [AUTHORITY]: '85b86173a2fdeeef58b44bd46846b0d67a42b755706f66c2f3163b60afab0866',
  [R51_CENSUS]: '5411b8335871148f8529032c6bbb60822a28b14c983f9dae85bbee068bdc966f',
  [TOOL]: '864839a50be49b21d3c871a24951582d5733f76612fc6c07bf4937491d3f8f8a',
  [PACKAGE]: '91442149a4763ced8b28dfe35bfbcb00c2781baed594c19169c7cbaac80619ed',
  [TEMPLATE]: 'd532cc4b77ed104abeb516ec98382972f0ed7ee3a3b168a19b4de028c037b4aa',
  [RUBRIC]: RUBRIC_SHA,
};
const TERMINAL =
  'A4_HUMAN_REVIEW_DEFERRED_NON_EVALUATION_ENGINEERING_RELEASED_AWAIT_NEXT_ENGINEERING_SLICE';

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 256 << 20 });
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
const text = (path: string): string => readFileSync(join(REPO_ROOT, path), 'utf8');
const json = (path: string): Record<string, unknown> =>
  JSON.parse(text(path)) as Record<string, unknown>;
const sha256 = (path: string): string =>
  createHash('sha256')
    .update(readFileSync(join(REPO_ROOT, path)))
    .digest('hex');

const baseAvailable = commitExists(R51_TERMINAL);
const recordsPresent = [RELEASE, ENGINEERING_CENSUS, AUDIT].every((p) =>
  existsSync(join(REPO_ROOT, p)),
);

function changedSinceR51(): string[] {
  return [
    ...new Set([
      ...lines(git('diff', '--name-only', R51_TERMINAL)),
      ...lines(git('ls-files', '--others', '--exclude-standard')),
    ]),
  ];
}

// ---------------------------------------------------------------------------
// A. LINEAGE AND CHANGED SURFACE.
// ---------------------------------------------------------------------------

describe.skipIf(!baseAvailable)('2D-A4 R52: lineage and changed surface', () => {
  it('descends from the exact R51 tip with single-parent commits only', () => {
    expect(() => git('merge-base', '--is-ancestor', R51_TERMINAL, 'HEAD')).not.toThrow();
    expect(lines(git('rev-list', '--merges', `${R51_TERMINAL}..HEAD`))).toEqual([]);
  });

  it("pinned R51's scope in one first commit that touched exactly the R51 isolation test", () => {
    const [first] = lines(git('rev-list', '--reverse', `${R51_TERMINAL}..HEAD`));
    if (first === undefined) return;
    expect(git('rev-parse', `${first}^`).trim()).toBe(R51_TERMINAL);
    expect(lines(git('diff', '--name-only', R51_TERMINAL, first))).toEqual([R51_ISOLATION_TEST]);
    expect(lines(git('log', '-1', '--format=%s', first))[0]).toMatch(/freeze R51/);
  });

  it('changes nothing outside the R51 pin, its test, two records and the audit', () => {
    const permitted = new Set([R51_ISOLATION_TEST, R52_TEST, RELEASE, ENGINEERING_CENSUS, AUDIT]);
    expect(changedSinceR51().filter((path) => !permitted.has(path))).toEqual([]);
  });

  it('changes no production, runtime, operator, migration, script, package, harness or earlier record byte', () => {
    expect(
      changedSinceR51().filter(
        (path) =>
          (path.startsWith('src/') && !path.startsWith('src/test/unit/')) ||
          /^(migrations|scripts|docker|\.github)\//.test(path) ||
          /^package(-lock)?\.json$/.test(path) ||
          path === 'CLAUDE.md' ||
          path === 'README.md',
      ),
    ).toEqual([]);
    const prior = lines(git('ls-tree', '-r', '--name-only', R51_TERMINAL, '--', 'docs'));
    expect(prior.length).toBeGreaterThan(0);
    expect(lines(git('diff', '--name-only', R51_TERMINAL, '--', ...prior))).toEqual([]);
  });

  it('creates no DEV_CONFIRM, FINAL_HOLDOUT, gold, A5, label, response, draft or adjudication artifact', () => {
    expect(
      changedSinceR51().filter((path) =>
        /DEV_CONFIRM|FINAL_HOLDOUT|GOLD_|MANIFEST|CORPUS_FREEZE|A5_|LABELS?_|ADJUDICAT|RESPONSES_V|COMPLETED_RESPONSE|DRAFT|PROVISIONAL/.test(
          path,
        ),
      ),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// B. R51 AUTHORITY, PACKAGE, RUBRIC AND TOOL ARE UNCHANGED.
// ---------------------------------------------------------------------------

describe('2D-A4 R52: the bound R49/R50/R51 artifacts are byte-unchanged', () => {
  it.each(Object.keys(FILE_SHAS))('%s keeps its bound SHA-256', (path) => {
    expect(sha256(path)).toBe(FILE_SHAS[path]);
  });

  it('the R51 authority still authorises exactly one human review per item, unexecuted', () => {
    const authority = json(AUTHORITY);
    expect(authority['thisFileAuthorises']).toEqual([
      'HUMAN_SINGLE_REVIEW_OF_THE_EXACT_R50_DEV_TRAIN_PACKAGE_UNDER_THE_EXACT_R49_RUBRIC',
    ]);
    expect(authority['authorityFlags']).toMatchObject({
      humanReviewAuthorised: true,
      humanReviewExecuted: false,
      singleReviewPerItem: true,
      modelAssistanceAuthorised: false,
      devConfirmAuthorised: false,
      finalHoldoutAuthorised: false,
      a5Authorised: false,
    });
    expect(authority['boundPackage']).toMatchObject({
      packageHash: PACKAGE_HASH,
      recordCount: 222,
      immutable: true,
    });
    expect(authority['boundRubric']).toMatchObject({ sha256: RUBRIC_SHA, reinterpreted: false });
    const census = json(R51_CENSUS);
    expect(census['review']).toMatchObject({ itemsAuthorised: 222, singleReviewPerItem: true });
    expect(census['labelBoundary']).toMatchObject({
      modelLabels: 0,
      goldRecords: 0,
      humanReviewAuthorised: true,
      humanReviewExecuted: false,
    });
    expect(census['access']).toMatchObject({ devConfirmOpened: false, finalHoldoutOpened: false });
  });
});

// ---------------------------------------------------------------------------
// C. ZERO LABELS; 222 ITEMS PENDING.
// ---------------------------------------------------------------------------

describe('2D-A4 R52: the 222 items remain pending and no label exists', () => {
  it('the package holds 222 items and the template is still wholly blank', () => {
    const rows = text(TEMPLATE)
      .slice(0, -1)
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(rows).toHaveLength(222);
    expect(text(PACKAGE).slice(0, -1).split('\n')).toHaveLength(222);
    for (const row of rows) {
      for (const field of ['reviewerActorKey', 'verdict', 'unit_type', 'hard_negative']) {
        expect(row[field], field).toBeNull();
      }
    }
  });

  it('no completed DEV_TRAIN response file is committed', () => {
    expect(lines(git('ls-files')).filter((path) => path.includes(RESPONSES_FILE))).toEqual([]);
  });

  it.skipIf(!baseAvailable)(
    'no artifact R52 changed pairs a real goldId with a semantic value',
    () => {
      const ids = new Set(
        text(PACKAGE)
          .slice(0, -1)
          .split('\n')
          .map((line) => (JSON.parse(line) as { goldId: string }).goldId),
      );
      for (const path of changedSinceR51().filter((p) => /\.(json|jsonl|md)$/.test(p))) {
        const body = text(path);
        expect(
          [...body.matchAll(/\bg[0-9a-f]{16}\b/g)].filter((m) => ids.has(m[0])),
          path,
        ).toEqual([]);
        expect(body, path).not.toMatch(
          /"(verdict|unit_type|hard_negative|reviewerActorKey)"\s*:\s*(?!null\b)("[^"]*"|true|false)/,
        );
      }
    },
  );
});

// ---------------------------------------------------------------------------
// D. THE DEFERRAL / RELEASE RECORD.
// ---------------------------------------------------------------------------

describe.skipIf(!recordsPresent)('2D-A4 R52: deferral and engineering release', () => {
  const release = (): Record<string, unknown> => json(RELEASE);

  it('records both owner markers and the exact terminal', () => {
    const r = release();
    expect(r['recordKind']).toBe(
      'HUMAN_VALIDATION_DEFERRAL_AND_NON_EVALUATION_ENGINEERING_RELEASE',
    );
    expect((r['ownerDecisions'] as { marker: string }[]).map((d) => d.marker)).toEqual([
      'DEFER_A4_DEV_TRAIN_HUMAN_REVIEW_UNTIL_OUTREACH_V1',
      'RELEASE_NON_EVALUATION_ENGINEERING_CONTINUATION_WHILE_HUMAN_VALIDATION_PENDING',
    ]);
    expect(r['r51Terminal']).toMatchObject({ commit: R51_TERMINAL });
    expect(r['terminalState']).toBe(TERMINAL);
    expect(r['changesProjectSequencingOnly']).toBe(true);
    expect(Object.values(r['changes'] as Record<string, boolean>).every((v) => v === false)).toBe(
      true,
    );
  });

  it('binds the exact R51 approval, authority, census and tool by SHA-256', () => {
    const bound = release()['boundAuthority'] as Record<string, { path: string; sha256: string }>;
    for (const key of ['ownerApproval', 'authority', 'census', 'reviewTool']) {
      const entry = bound[key]!;
      expect(sha256(entry.path), key).toBe(entry.sha256);
      expect(FILE_SHAS[entry.path], key).toBe(entry.sha256);
    }
  });

  it('defers human review without revoking, completing or replacing it', () => {
    expect(release()['humanReview']).toMatchObject({
      status: 'DEFERRED_UNTIL_ENGINE_COMPLETE_AND_OUTREACH',
      authorised: true,
      executed: false,
      completed: false,
      deferred: true,
      cancelled: false,
      deferUntil: 'ENGINE_COMPLETE_AND_OUTREACH',
      authorityRevoked: false,
      authorityStillValid: true,
      currentlyBlockingEngineering: false,
      packageHash: PACKAGE_HASH,
      rubricSha256: RUBRIC_SHA,
      itemCount: 222,
      itemsPending: 222,
      exactlyOneHumanSemanticLabelPerItem: true,
      localDraftKind: 'NON_CANONICAL_HUMAN_REVIEW_DRAFT',
      localDraftsSearchedImportedOrCounted: false,
    });
    expect(
      Object.values(release()['labelBoundary'] as Record<string, unknown>).every(
        (v) => v === 0 || v === false,
      ),
    ).toBe(true);
  });

  it('model labels can never stand in for human gold', () => {
    expect(release()['provisionalModelReview']).toEqual({
      status: 'NOT_EXECUTED_NOT_NEEDED_FOR_ENGINEERING_CONTINUATION',
      authorised: false,
      requiresSeparateExplicitlyLabelledAuthority: true,
      mayEverBeRepresentedAsHuman: false,
      mayEverBeRepresentedAsGold: false,
      mayEverBeRepresentedAsA5: false,
      mayEverBeRepresentedAsGatedSplitEvidence: false,
    });
  });

  it('keeps sealed splits and A5 forbidden and claims no empirical validation', () => {
    expect(release()['evaluation']).toEqual({
      devTrainHumanValidationComplete: false,
      realisedSetREnrichment: 'NOT_YET_MEASURABLE',
      devConfirm: 'SEALED',
      finalHoldout: 'SEALED',
      a5: 'NOT_AUTHORISED',
      complete110SlotFreezePreflight: 'NOT_AUTHORISED',
      empiricalAcceptanceClaimAllowed: false,
      classifierQualityClaimAllowed: false,
    });
    const axes = release()['stateAxes'] as Record<string, unknown>;
    expect(axes['conflationForbidden']).toBe(true);
    expect(axes['softwareStatusesDoNotImply']).toEqual([
      'EMPIRICALLY_VALIDATED',
      'GOLD_CERTIFIED',
      'A5_FROZEN',
      'ACCEPTANCE_GATES_PASSED',
    ]);
    const forbidden = (release()['stillForbiddenWithoutSeparateOwnerAuthority'] as string[]).join(
      '\n',
    );
    for (const term of ['DEV_CONFIRM', 'FINAL_HOLDOUT', 'A5', 'precision', 'empirically']) {
      expect(forbidden).toContain(term);
    }
  });

  it('releases non-evaluation engineering only, and no classifier semantic change', () => {
    const r = release();
    expect(r['thisFileAuthorises']).toEqual([
      'NON_EVALUATION_ENGINEERING_CONTINUATION_WHILE_DEV_TRAIN_HUMAN_VALIDATION_IS_DEFERRED',
    ]);
    expect(r['thisFileAuthorisesNothingElse']).toBe(true);
    expect(r['engineering']).toMatchObject({
      nonEvaluationEngineeringContinuationAuthorised: true,
      humanValidationBlocksNonEvaluationEngineering: false,
      classifierSemanticChangesAutomaticallyAuthorised: false,
      releaseAuthorisesSoftwareEngineeringNotEvaluationClaims: true,
      outboundOutreachAuthorised: false,
    });
    expect(r['classifierSemanticBoundary']).toMatchObject({
      mayBeJustifiedUsingUnreviewedR50Items: false,
    });
    expect(JSON.stringify(r)).not.toMatch(
      /"(empiricallyValidated|goldCertified|a5Frozen|acceptanceGatesPassed)"\s*:\s*true/,
    );
  });
});

// ---------------------------------------------------------------------------
// E. THE ENGINEERING CENSUS.
// ---------------------------------------------------------------------------

describe.skipIf(!recordsPresent)('2D-A4 R52: the non-evaluation engineering census', () => {
  const census = (): Record<string, unknown> => json(ENGINEERING_CENSUS);

  it('is a read-only engineering census, not an evaluation result, and authorises nothing', () => {
    const c = census();
    expect(c['recordKind']).toBe('PUBLIC_ENGINEERING_CONTINUATION_CENSUS');
    expect(c['isEvaluationResult']).toBe(false);
    expect(c['surfacesModifiedByThisCensus']).toBe(0);
    expect(c['thisFileAuthorises']).toEqual([]);
  });

  it('uses only the five status values, and only evaluation-shaped surfaces depend on human labels', () => {
    const vocabulary = new Set(census()['statusVocabulary'] as string[]);
    const surfaces = census()['surfaces'] as {
      id: string;
      status: string;
      humanEvaluationDependency: boolean;
    }[];
    for (const s of surfaces) expect(vocabulary.has(s.status), s.id).toBe(true);
    for (const s of surfaces.filter((x) => x.status === 'BLOCKED_BY_HUMAN_EVALUATION')) {
      expect(s.humanEvaluationDependency, s.id).toBe(true);
    }
    expect(surfaces.filter((s) => s.humanEvaluationDependency).map((s) => s.id)).toEqual([
      'empirical-classifier-evaluation',
      'semantic-classifier-variants',
    ]);
    expect(census()['recommendedNextSlice']).toMatchObject({
      id: 'ENGINE_RUNTIME_LINEAGE_RECONCILIATION_V1',
      humanEvaluationDependency: false,
      classifierSemanticChange: false,
      executedInR52: false,
    });
  });

  it.skipIf(!baseAvailable)('cites refs that exist, with the stated ancestry', () => {
    const refs = census()['observedRefs'] as Record<string, unknown>;
    for (const key of ['originMain', 'r51Terminal', 'a2AcquisitionTip', 'a2A4MergeBase']) {
      expect(commitExists(refs[key] as string), key).toBe(true);
    }
    expect(() =>
      git('merge-base', '--is-ancestor', refs['originMain'] as string, R51_TERMINAL),
    ).not.toThrow();
    const v7 = refs['fetchPolicyV7Commit'] as string;
    if (commitExists(v7)) {
      expect(() => git('merge-base', '--is-ancestor', v7, R51_TERMINAL)).toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// F. PUBLIC DISCLOSURE.
// ---------------------------------------------------------------------------

describe.skipIf(!recordsPresent)('2D-A4 R52: the records disclose bound hashes only', () => {
  it.each([RELEASE, ENGINEERING_CENSUS, AUDIT])(
    '%s carries no identity, URL, page text or unbound digest',
    (path) => {
      const body = text(path);
      const bound = new Set([PACKAGE_HASH, ...Object.values(FILE_SHAS)]);
      expect(body).not.toMatch(/\bg[0-9a-f]{16}\b/);
      expect(body).not.toMatch(/https?:\/\//);
      expect(body).not.toMatch(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/);
      expect(body).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i);
      const digests = [...body.matchAll(/\b[0-9a-f]{64}\b/g)].map((m) => m[0]);
      expect(digests.filter((d) => !bound.has(d))).toEqual([]);
      if (baseAvailable) {
        for (const commit of [...body.matchAll(/\b[0-9a-f]{40}\b/g)].map((m) => m[0])) {
          expect(commitExists(commit), commit).toBe(true);
        }
      }
    },
  );
});
