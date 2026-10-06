/**
 * PHASE 2B-2D A3 R48 — DEV_TRAIN R4 A4 HANDOFF, BLOCKED AT THE RUBRIC GATE.
 *
 * R48 was authorised to materialise the blinded DEV_TRAIN single-review
 * package, but only after proving that every human label field (verdict,
 * unit_type, hard_negative) is backed by an already-approved rubric. It is
 * not: no approved byte identifies "the frozen rubric", and hard_negative has
 * no operational definition anywhere. R48 therefore stopped before the R47
 * reproduction and minted nothing.
 *
 * These proofs pin that outcome:
 *
 *   - R48 descends from the exact R47 tip, merges nothing, and pinned R47's
 *     scope in one first commit touching exactly one file;
 *   - R48 changed only that pin, this test, one census and one audit: no
 *     tooling namespace, no index, no package, no template, no HTML, no
 *     runtime / migration / CLI byte, no sealed-split or freeze artifact;
 *   - the R47 census and the approved corpus plan + approval are bound by
 *     exact bytes, recomputed here;
 *   - the rubric findings are recomputed from the approved bytes themselves,
 *     not copied from the census;
 *   - the census records zero labels / gold / model labels, an unmeasured
 *     enrichment, the blocked terminal, and discloses no identity.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const HARNESS = 'src/test/harness/phase2b2d';

/** The exact R47 tip R48 was cut from. */
const R47_TERMINAL = '0d80c7347a8a3a8e75244d1d52c3dbc284dad98e';
/** The one commit that pinned R47's own isolation test to its range. */
const R47_SCOPE_PIN_COMMIT = '3914b0a16d9aba8a4a957517318ee7a28a8fd0cb';
const R47_ISOLATION_TEST = 'src/test/unit/orgunitCorpus2DA3R4GlobalReplayIsolation.test.ts';
/**
 * R48'S OWN TERMINAL COMMIT.
 *
 * R48's lineage, changed-surface, no-handoff-artifact, no-A4/A5 and
 * no-rubric-artifact assertions describe R48'S SLICE, so they range over R48's
 * own commits - `R47_TERMINAL..R48_TERMINAL` - and inspect the tree at
 * R48_TERMINAL, rather than HEAD and the working tree. Once a later slice (R49's
 * owner-approved human labelling rubric) lands on top, the working tree is no
 * longer R48's surface, and an approved rubric legitimately exists AFTER R48;
 * that later fact must not be read back as though it existed AT R48.
 *
 * This is the same standing convention R19 through R47 apply, and it
 * WEAKENS NOTHING: R48's range is frozen, its permitted-path list is unchanged,
 * "no approved rubric existed at R48" stays asserted, and each later slice pins
 * the equivalent scope over its own range.
 */
const R48_TERMINAL = 'ebe4e6fbd3e2504bbe5fac6963c23ab7bdcb665f';

const R48_TEST = 'src/test/unit/orgunitCorpus2DA3R48A4HandoffRubricBlocker.test.ts';
const R48_CENSUS = 'docs/evaluation/PHASE_2B_2D_A3_R48_DEV_TRAIN_R4_A4_HANDOFF_CENSUS_V1.json';
const R48_AUDIT = 'docs/audits/PHASE_2B_2D_A3_R48_R4_DEV_TRAIN_A4_HANDOFF_MATERIALISATION_V1.md';

/** The artifacts R48 was authorised to write ONLY once the rubric passed. */
const UNWRITTEN_HANDOFF_ARTIFACTS = [
  'docs/evaluation/corpus/PHASE_2B_2D_A3_R48_DEV_TRAIN_R4_A4_HANDOFF_INDEX_V1.json',
  'docs/evaluation/corpus/PHASE_2B_2D_A3_R48_DEV_TRAIN_R4_SINGLE_REVIEW_PACKAGE_V1.jsonl',
  'docs/evaluation/corpus/PHASE_2B_2D_A3_R48_DEV_TRAIN_R4_SINGLE_REVIEW_RESPONSE_TEMPLATE_V1.jsonl',
  'docs/evaluation/corpus/PHASE_2B_2D_A3_R48_DEV_TRAIN_R4_SINGLE_REVIEW_PACKET_V1.html',
];

const R47_CENSUS = 'docs/evaluation/PHASE_2B_2D_A3_R47_R4_GLOBAL_DEV_TRAIN_REPLAY_CENSUS_V1.json';
const R47_CENSUS_SHA256 = '4d3c3e21164da4d9741fb310d68a0a6eb42229bcfec47549c3edf3024e5bdf6a';

const PLAN = 'docs/evaluation/PHASE_2B_2D_METHODOLOGY_V2_CORPUS_ACQUISITION_PLAN_V1.json';
const PLAN_SHA256 = '54279f1b3e45fe1be8c24e5c81d56693ebb2cdf0a34f346b748d16b56847184e';
const PLAN_APPROVAL =
  'docs/evaluation/PHASE_2B_2D_METHODOLOGY_V2_CORPUS_ACQUISITION_PLAN_V1_OWNER_APPROVAL.json';
const PLAN_APPROVAL_SHA256 = '0ac475031e81a60ae58d70bb83d5f71ee3cc441573dc82cf88145fdf1e8fec14';

const R3 = 'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL_R3.json';

/** Every approved artifact the rubric search covered, with its recomputable facts. */
const APPROVED_SEARCHED = [
  {
    path: R3,
    sha256: 'fdc54873f4cdd47688d6d720229f0a0ea8426193711993a4f63a9f5000623f33',
    rubric: 3,
  },
  {
    path: 'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_OWNER_FREEZE_APPROVAL_V1.json',
    sha256: '77dae976fb219bd94c33f236070a5c216a594a85ff8da3a490b5c948753d331e',
    rubric: 0,
  },
  {
    path: 'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_R4_SHORT_TEXT_AMENDMENT_PROPOSAL_V1.json',
    sha256: '5ebcc562e72f509e2b664f3ae800dc2043142d5d4a6ec1ec4d2958b8abab1d20',
    rubric: 0,
  },
  { path: PLAN, sha256: PLAN_SHA256, rubric: 1 },
  { path: PLAN_APPROVAL, sha256: PLAN_APPROVAL_SHA256, rubric: 0 },
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

const baseAvailable =
  commitExists(R47_TERMINAL) && commitExists(R47_SCOPE_PIN_COMMIT) && commitExists(R48_TERMINAL);

/** Every path R48's own commits changed (R47_TERMINAL..R48_TERMINAL). */
function changedSinceR47(): string[] {
  return lines(git('diff', '--name-only', R47_TERMINAL, R48_TERMINAL));
}

/** Whether a path exists in the tree at R48_TERMINAL. */
const inR48Tree = (path: string): boolean =>
  lines(git('ls-tree', '--name-only', R48_TERMINAL, '--', path)).length > 0;

// ---------------------------------------------------------------------------
// A. LINEAGE AND CHANGED SURFACE.
// ---------------------------------------------------------------------------

describe.skipIf(!baseAvailable)('2D-A3 R48: lineage and changed surface', () => {
  it('descends from the exact R47 tip, and merges no commit', () => {
    expect(() => git('merge-base', '--is-ancestor', R47_TERMINAL, R48_TERMINAL)).not.toThrow();
    expect(lines(git('rev-list', '--merges', `${R47_TERMINAL}..${R48_TERMINAL}`))).toEqual([]);
  });

  it("pinned R47's scope in exactly one first commit that touched exactly one file", () => {
    const [first] = lines(git('rev-list', '--reverse', `${R47_TERMINAL}..${R48_TERMINAL}`));
    expect(first).toBe(R47_SCOPE_PIN_COMMIT);
    expect(git('rev-parse', `${R47_SCOPE_PIN_COMMIT}^`).trim()).toBe(R47_TERMINAL);
    expect(lines(git('diff', '--name-only', R47_TERMINAL, R47_SCOPE_PIN_COMMIT))).toEqual([
      R47_ISOLATION_TEST,
    ]);
    expect(
      lines(
        git('diff', '--name-only', R47_SCOPE_PIN_COMMIT, R48_TERMINAL, '--', R47_ISOLATION_TEST),
      ),
    ).toEqual([]);
  });

  it('changes nothing outside the R47 scope pin, this test, one census and one audit', () => {
    const permitted = new Set([R47_ISOLATION_TEST, R48_TEST, R48_CENSUS, R48_AUDIT]);
    expect(changedSinceR47().filter((path) => !permitted.has(path))).toEqual([]);
  });

  it('wrote no handoff index, review package, response template or HTML packet', () => {
    for (const path of UNWRITTEN_HANDOFF_ARTIFACTS) {
      expect(inR48Tree(path), path).toBe(false);
    }
    expect(inR48Tree(`${HARNESS}/a4handoffR4`)).toBe(false);
  });

  it('creates no DEV_CONFIRM, FINAL_HOLDOUT, gold, manifest or corpus-freeze artifact', () => {
    expect(
      changedSinceR47().filter((path) =>
        /DEV_CONFIRM|FINAL_HOLDOUT|GOLD_|MANIFEST_|CORPUS_FREEZE|CORPUS_FROZEN|A5_/.test(path),
      ),
    ).toEqual([]);
  });

  it('leaves every earlier public record, audit, runtime and harness byte untouched', () => {
    const prior = lines(
      git('ls-tree', '-r', '--name-only', R47_TERMINAL, '--', 'docs/evaluation', 'docs/audits'),
    );
    expect(prior.length).toBeGreaterThan(0);
    expect(lines(git('diff', '--name-only', R47_TERMINAL, R48_TERMINAL, '--', ...prior))).toEqual(
      [],
    );
    expect(
      lines(
        git(
          'diff',
          '--name-only',
          R47_TERMINAL,
          R48_TERMINAL,
          '--',
          'src/orgunits',
          'src/cli',
          HARNESS,
          'migrations',
          'scripts',
          'package.json',
          'package-lock.json',
        ),
      ),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// B. EXACT BINDINGS: R47 AND THE APPROVED CORPUS PLAN.
// ---------------------------------------------------------------------------

describe('2D-A3 R48: the R47 result and the approved plan are bound by exact bytes', () => {
  it('binds the R47 census unchanged, with its terminal and aggregate state', () => {
    expect(sha256(bytesOf(R47_CENSUS))).toBe(R47_CENSUS_SHA256);
    const r47 = json(R47_CENSUS);
    expect(r47['recordKind']).toBe('PUBLIC_AGGREGATE_ONLY_R4_GLOBAL_DEV_TRAIN_REPLAY_CENSUS');
    expect(r47['terminalState']).toBe(
      'A3_R4_GLOBAL_DEV_TRAIN_REPLAY_COMPLETE_SHORT_TEXT_FREEZE_BLOCKER_CLASS_CLEARED_AWAIT_OWNER_NEXT_PHASE_DECISION',
    );
    expect(at(r47, 'r4Graph', 'documents')).toBe(611);
    expect(at(r47, 'r4Graph', 'unresolvedDocuments')).toBe(0);
    expect(at(r47, 'setP', 'documentsAcrossExactCaps')).toBe(160);
    expect(at(r47, 'setR', 'documentsAcrossExactCaps')).toBe(80);
    expect([at(r47, 'setP', 'exactCaps'), at(r47, 'setP', 'blockedCaps')]).toEqual([20, 0]);
    expect([at(r47, 'setR', 'exactCaps'), at(r47, 'setR', 'blockedCaps')]).toEqual([20, 0]);
    expect(at(r47, 'a2Invariance', 'a2AcquisitionOfRecordStatusesMatched')).toBe(20);
    expect(at(r47, 'a2Invariance', 'mismatches')).toBe(0);
    for (const flag of ['devConfirmOpened', 'finalHoldoutOpened', 'a4Started', 'a5Started']) {
      expect(at(r47, 'freezeBoundary', flag), flag).toBe(false);
    }
  });

  it('binds the approved plan bytes and recomputes its owner approval', () => {
    const plan = bytesOf(PLAN);
    expect(sha256(plan)).toBe(PLAN_SHA256);
    expect(plan.length).toBe(45200);
    expect(sha256(bytesOf(PLAN_APPROVAL))).toBe(PLAN_APPROVAL_SHA256);
    const approval = json(PLAN_APPROVAL);
    expect(approval['ownerDecisions']).toContain('APPROVE_PHASE_2B_2D_CORPUS_ACQUISITION_PLAN_V1');
    expect(at(approval, 'approvedPlan', 'planSha256')).toBe(PLAN_SHA256);
    expect(at(approval, 'approvedPlan', 'planBytes')).toBe(45200);
  });

  it('reads the A3 -> A4 -> A5 sequence and DEV_TRAIN single review from the plan itself', () => {
    const plan = json(PLAN);
    expect(at(plan, 'actions', 'A3', 'name')).toBe('PAGE_SELECTION_AND_CORPUS_FREEZE_PREP');
    expect(at(plan, 'actions', 'A4', 'name')).toBe('HUMAN_LABELLING');
    expect(at(plan, 'actions', 'A5', 'name')).toBe('GOLD_CORPUS_FREEZE_APPROVAL');
    expect(at(plan, 'labellingWorkflow', 'dualReviewRequired', 'DEV_TRAIN')).toBe(false);
    expect(String(at(plan, 'labellingWorkflow', 'sequencing', 0))).toMatch(
      /^DEV_TRAIN labelled first, single-reviewer/,
    );
  });
});

// ---------------------------------------------------------------------------
// C. THE RUBRIC FINDING, RECOMPUTED FROM THE APPROVED BYTES.
// ---------------------------------------------------------------------------

describe('2D-A3 R48: no approved rubric backs every human label field', () => {
  it('requires exactly verdict, unit_type and hard_negative from a human', () => {
    const required = at(
      json(R3),
      'sectionI_goldAndReviewContract',
      'whatRequiresHumanConfirmation',
    );
    expect(required).toEqual([
      'the page-level verdict (UNIT_PAGE / NOT_A_UNIT / NEEDS_REVIEW)',
      'unit_type on every gold UNIT_PAGE item',
      'the hard_negative flag',
    ]);
  });

  it.each(APPROVED_SEARCHED)(
    '$path mentions a rubric $rubric time(s) and binds none by path or hash',
    ({ path, sha256: expected, rubric }) => {
      const text = bytesOf(path).toString('utf8');
      expect(sha256(text)).toBe(expected);
      expect(text.match(/rubric/gi)?.length ?? 0).toBe(rubric);
      expect(text).not.toMatch(/[\w/.-]*rubric[\w/.-]*\.(?:json|jsonl|md|ts)\b/i);
    },
  );

  it.skipIf(!baseAvailable)(
    'the repository at R48_TERMINAL held no artifact named as a rubric (this blocker proof aside)',
    () => {
      expect(
        lines(git('ls-tree', '-r', '--name-only', R48_TERMINAL)).filter(
          (path) => /rubric/i.test(path) && path !== R48_TEST,
        ),
      ).toEqual([]);
    },
  );

  it('no approved artifact gives hard_negative an operational criterion', () => {
    for (const { path } of APPROVED_SEARCHED) {
      const text = bytesOf(path).toString('utf8');
      expect(text, path).not.toMatch(
        /hard.?negative\W{1,8}(?:means|is defined as|iff|if and only if)/i,
      );
    }
  });

  it('the census records the blocked gate, field by field', () => {
    const census = json(R48_CENSUS);
    const audit = at(census, 'rubricCompletenessAudit') as Record<string, unknown>;
    expect(audit['rubricCompletenessPassed']).toBe(false);
    expect(audit['blockingField']).toBe('hard_negative');
    expect(audit['definitionImprovised']).toBe(false);
    expect(audit['repositoryArtifactsNamedRubric']).toBe(0);
    const statuses = Object.fromEntries(
      (audit['fields'] as Record<string, unknown>[]).map((f) => [f['field'], f['status']]),
    );
    expect(statuses).toEqual({
      verdict: 'VALUE_SET_FROZEN_OPERATIONAL_DEFINITION_NOT_BOUND',
      unit_type: 'VALUE_SET_AND_DEFINITIONS_NOT_BOUND',
      hard_negative: 'UNDEFINED',
    });
    const searched = (audit['approvedArtifactsSearched'] as Record<string, unknown>[]).map((a) => ({
      path: a['path'],
      sha256: a['sha256'],
      rubric: a['rubricMentions'],
    }));
    expect(searched).toEqual(APPROVED_SEARCHED.map((a) => ({ ...a })));
    for (const context of audit['contextArtifactsInspectedButNotBoundForHumanGold'] as Record<
      string,
      unknown
    >[]) {
      expect(sha256(bytesOf(String(context['path']))), String(context['path'])).toBe(
        context['sha256'],
      );
    }
  });
});

// ---------------------------------------------------------------------------
// D. ZERO LABELS, THE TERMINAL, AND THE DISCLOSURE FIREWALL.
// ---------------------------------------------------------------------------

describe('2D-A3 R48: the public census', () => {
  const census = json(R48_CENSUS);
  const text = bytesOf(R48_CENSUS).toString('utf8');

  it('authorises nothing and ends at the rubric-clarification terminal', () => {
    expect(census['recordKind']).toBe('PUBLIC_AGGREGATE_ONLY_DEV_TRAIN_R4_A4_HANDOFF_CENSUS');
    expect(census['thisFileAuthorises']).toEqual([]);
    expect(census['r47Terminal']).toBe(R47_TERMINAL);
    expect(census['r47ScopePinCommit']).toBe(R47_SCOPE_PIN_COMMIT);
    expect(census['terminalState']).toBe(
      'A3_R4_DEV_TRAIN_A4_HANDOFF_BLOCKED_AWAIT_OWNER_RUBRIC_CLARIFICATION',
    );
  });

  it('creates no label, gold, model label or A4/A5 state, and measures no enrichment', () => {
    expect(census['labelBoundary']).toEqual({
      labelsCreated: 0,
      goldCreated: 0,
      modelLabels: 0,
      adjudications: 0,
      humanLabellingExecuted: false,
      a4HandoffPrepared: false,
      a4LabellingAuthorised: false,
      a5Started: false,
      devConfirmOpened: false,
      finalHoldoutOpened: false,
      devTrainRealisedSetREnrichment: 'NOT_YET_MEASURABLE_PRE_LABEL',
    });
  });

  it('touched no database, network, provider, sealed split or label', () => {
    expect(Object.values(census['access'] as Record<string, number>).every((n) => n === 0)).toBe(
      true,
    );
    expect(at(census, 'materialisation', 'r47AuthorityReproduced')).toBe(false);
    expect(at(census, 'materialisation', 'goldIdsDerived')).toBe(0);
    expect(at(census, 'materialisation', 'reviewPackageRecords')).toBe(0);
    expect(at(census, 'materialisation', 'blankResponseTemplateRecords')).toBe(0);
  });

  it('discloses no goldId, URL or unbound digest, and every commit it names exists', () => {
    expect(text).not.toMatch(/\bg[0-9a-f]{16}\b/);
    expect(text).not.toMatch(/https?:\/\//);
    const bound = new Set<string>([
      R47_CENSUS_SHA256,
      ...APPROVED_SEARCHED.map((a) => a.sha256),
      ...(
        at(
          census,
          'rubricCompletenessAudit',
          'contextArtifactsInspectedButNotBoundForHumanGold',
        ) as {
          sha256: string;
        }[]
      ).map((c) => c.sha256),
    ]);
    const digests = [...text.matchAll(/\b[0-9a-f]{64}\b/g)].map((m) => m[0]);
    expect(digests.filter((d) => !bound.has(d))).toEqual([]);
    for (const commit of [...text.matchAll(/\b[0-9a-f]{40}\b/g)].map((m) => m[0])) {
      if (baseAvailable) expect(commitExists(commit), commit).toBe(true);
    }
  });
});

describe('2D-A3 R48: the audit', () => {
  it('names the bindings, the blocker and the terminal, and claims no handoff', () => {
    const audit = bytesOf(R48_AUDIT).toString('utf8');
    for (const token of [
      R47_TERMINAL,
      R47_SCOPE_PIN_COMMIT,
      PLAN_SHA256,
      PLAN_APPROVAL_SHA256,
      'hard_negative',
      'UNDEFINED',
      'DEV_CONFIRM',
      'FINAL_HOLDOUT',
      'NOT_YET_MEASURABLE_PRE_LABEL',
      'A3_R4_DEV_TRAIN_A4_HANDOFF_BLOCKED_AWAIT_OWNER_RUBRIC_CLARIFICATION',
    ]) {
      expect(audit, token).toContain(token);
    }
    expect(audit).not.toMatch(/https?:\/\//);
    expect(audit).not.toMatch(/\bg[0-9a-f]{16}\b/);
    expect(audit).toMatch(/does \*\*not\*\* claim/);
  });
});
