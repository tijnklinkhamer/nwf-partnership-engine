/**
 * PHASE 2B-2D A3 R46 — THE METHODOLOGY V2 R4 SHORT-TEXT OWNER APPROVAL.
 *
 * R46 is APPROVAL AND GOVERNANCE ONLY. It proves that:
 *
 *   - R45's exact terminal and four-commit chain above R44 are the approved
 *     source, single-parent throughout;
 *   - the R45 options record, draft R4 proposal and audit are byte-identical
 *     to R45_TERMINAL and recompute to the SHA-256 and byte counts the
 *     approval binds;
 *   - R3, the original R3 owner-freeze approval, the three prior short-text
 *     records and the R44 blocker record remain byte-identical;
 *   - the proposal STILL says DRAFT and authorises nothing inside its own
 *     bytes - approval is a separate, immutable record;
 *   - that record names both exact owner decision markers, Option A, the
 *     METHODOLOGY_V2_R4 classification, Generation 1 AND Generation 2, the
 *     all-twenty SD7_GRAPH replay boundary, and a bounded R47 authority that
 *     has NOT executed;
 *   - no blocker-clearance claim is made, and nothing identifies the corpus.
 *
 * No real document, token sequence, slot, rank, edge, label or sealed split is
 * read, and no SD7 relation is evaluated.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const R44_TERMINAL = '4fd9ffd469333ba181584d56018c61e9ae119c77';
const R45_TERMINAL = '65bde0c033ff89c2ee98aa44880b8600ab0da11f';
/** R45's four commits above R44, oldest first. */
const R45_CHAIN = [
  'f57d10350a46a4e960d2a6b8d2aaf26230e17790',
  'e82ea71523f53bbbc6d1421bc72940084ffa692b',
  '254edfb4b7b71ca66c070c3da3d0cdf5037f3cf5',
  R45_TERMINAL,
];
const A2_CHECKPOINT = '29d0d486cb268b5431a0fc23eabb064682ec47d9';
/** R46's first commit: the R45 isolation-scope pin. */
const R46_SCOPE_PIN_COMMIT = 'fb12dcde1df8460f527b00640da484d45b69341f';

const OPTIONS_PATH =
  'docs/evaluation/PHASE_2B_2D_A3_R45_SHORT_TEXT_METHODOLOGY_AMENDMENT_OPTIONS_V1.json';
const PROPOSAL_PATH =
  'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_R4_SHORT_TEXT_AMENDMENT_PROPOSAL_V1.json';
const R45_AUDIT_PATH =
  'docs/audits/PHASE_2B_2D_A3_R45_SHORT_TEXT_METHODOLOGY_AMENDMENT_DESIGN_V1.md';
const APPROVAL_PATH =
  'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_R4_SHORT_TEXT_AMENDMENT_OWNER_APPROVAL_V1.json';
const AUDIT_PATH =
  'docs/audits/PHASE_2B_2D_A3_R46_METHODOLOGY_V2_R4_SHORT_TEXT_OWNER_APPROVAL_V1.md';

/** The exact R45 bytes the owner approves: digest and byte count. */
const R45_BYTES = {
  [OPTIONS_PATH]: {
    sha256: '8db1a3f9505a796dbb1e7c313dc74cbc3e84f24eb6298c9bc92afa636a2f2ec6',
    bytes: 64568,
  },
  [PROPOSAL_PATH]: {
    sha256: '5ebcc562e72f509e2b664f3ae800dc2043142d5d4a6ec1ec4d2958b8abab1d20',
    bytes: 16628,
  },
  [R45_AUDIT_PATH]: {
    sha256: '8900582d737e30688fd5b9f5378ce1bbdf772098e3222ac80730813905dc86d9',
    bytes: 14466,
  },
} as const;

/** Historical bytes that must stay identical: R3, its approval, short-text records, R44. */
const HISTORICAL = {
  'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL_R3.json': {
    sha256: 'fdc54873f4cdd47688d6d720229f0a0ea8426193711993a4f63a9f5000623f33',
    bytes: 142306,
  },
  'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_OWNER_FREEZE_APPROVAL_V1.json': {
    sha256: '77dae976fb219bd94c33f236070a5c216a594a85ff8da3a490b5c948753d331e',
    bytes: 17514,
  },
  'docs/evaluation/PHASE_2B_2D_METHOD_V2_SD7_SHORT_TEXT_OWNER_DECISION_V1.json': {
    sha256: '2f41f495322eceae3b675cbe1d227115f3b4292d6e3a711879793af33b466fff',
    bytes: 7584,
  },
  'docs/evaluation/PHASE_2B_2D_A3_SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_OWNER_POLICY_V1.json': {
    sha256: 'b734805bbaddc6890dc7032179b4a639a69a790282923b41641710a060b3d05a',
    bytes: 19924,
  },
  'docs/evaluation/PHASE_2B_2D_A3_SHORT_TEXT_REACHABLE_MEMBERSHIP_OWNER_CLARIFICATION_V1.json': {
    sha256: '0d6ddaa6dcc70912e3e19d7cb245fbe7b241dff6c671d874cbd1cd50ec33b49a',
    bytes: 19416,
  },
  'docs/evaluation/PHASE_2B_2D_A3_R44_DEV_TRAIN_CORPUS_FREEZE_BLOCKER_CLOSURE_V1.json': {
    sha256: '3d17e40cca4a386052cfafe70d69fe34aa41294263febfb82c56d4c8a3c8dafe',
    bytes: 11199,
  },
} as const;

/** Methodology V3 (Generation 2) bytes, read from the A2 checkpoint object only. */
const V3_BYTES = {
  'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_PROPOSAL_R1.json':
    '4bfbfb5f2ec1958b77ecc13ac5a37ba8b21c7ee69a2c07cd6cd9b8fb76a6239d',
  'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_OWNER_FREEZE_APPROVAL_V1.json':
    '36e8071738e1842ad03a9b51cf5820d58015305191c48490ef515e1cd1c34f9c',
} as const;

const APPROVE_MARKER = 'APPROVE_PHASE_2B_2D_METHODOLOGY_V2_R4_SHORT_TEXT_AMENDMENT_EXACT_BYTES';
const R47_MARKER = 'AUTHORISE_A3_R47_SHORT_TEXT_R4_IMPLEMENTATION_AND_GLOBAL_DEV_TRAIN_REPLAY';
const OPTION_A = 'SHORT_TEXT_EXACT_NORMALISED_TOKEN_SEQUENCE_FALLBACK';
const TERMINAL_STATE =
  'A3_METHODOLOGY_V2_R4_SHORT_TEXT_AMENDMENT_APPROVED_R47_GLOBAL_DEV_TRAIN_REPLAY_AUTHORISED';

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
const fileBytes = (path: string): Buffer => readFileSync(join(REPO_ROOT, path));

const chainAvailable = R45_CHAIN.every(commitExists) && commitExists(R44_TERMINAL);

// ---------------------------------------------------------------------------
// A. THE APPROVED SOURCE: R45, EXACT.
// ---------------------------------------------------------------------------

describe.skipIf(!chainAvailable)('2D-A3 R46: the approved source is the exact R45 terminal', () => {
  it('R45 is four single-parent commits above the exact R44 tip', () => {
    let parent = R44_TERMINAL;
    for (const commit of R45_CHAIN) {
      expect(git('rev-list', '--parents', '-n', '1', commit).trim()).toBe(`${commit} ${parent}`);
      parent = commit;
    }
    expect(git('rev-list', '--reverse', `${R44_TERMINAL}..${R45_TERMINAL}`).trim()).toBe(
      R45_CHAIN.join('\n'),
    );
  });

  it('R46 descends from R45_TERMINAL', () => {
    expect(() => git('merge-base', '--is-ancestor', R45_TERMINAL, 'HEAD')).not.toThrow();
  });

  it.each(Object.entries(R45_BYTES))(
    '%s is byte-identical to R45_TERMINAL and recomputes its bound digest',
    (path, bound) => {
      const atR45 = gitBytes(R45_TERMINAL, path);
      expect(sha256(atR45)).toBe(bound.sha256);
      expect(atR45.length).toBe(bound.bytes);
      expect(sha256(fileBytes(path))).toBe(bound.sha256);
      expect(fileBytes(path).length).toBe(bound.bytes);
    },
  );

  it('R45 actually recommended Option A, with the V2 R4 classification', () => {
    const options = readJson(OPTIONS_PATH);
    expect(obj(options['recommendedOption'])).toMatchObject({ id: 'A', token: OPTION_A });
    const proposal = readJson(PROPOSAL_PATH);
    expect(proposal).toMatchObject({
      version: 'METHODOLOGY_V2_R4',
      form: 'ADDITIVE_AMENDMENT_OF_R3_SD7_SHORT_TEXT_BRANCH',
    });
    expect(obj(proposal['derivedFrom'])['recommendedOption']).toBe('A');
    expect(proposal['proposedRule']).toEqual(options['proposedNormativeRule']);
  });
});

// ---------------------------------------------------------------------------
// B. HISTORICAL BYTES ARE UNTOUCHED.
// ---------------------------------------------------------------------------

describe('2D-A3 R46: R3, its approval and every prior short-text record are byte-identical', () => {
  it.each(Object.entries(HISTORICAL))('%s keeps its frozen digest and length', (path, bound) => {
    expect(sha256(fileBytes(path))).toBe(bound.sha256);
    expect(fileBytes(path).length).toBe(bound.bytes);
  });

  it.skipIf(!commitExists(A2_CHECKPOINT))(
    'the Methodology V3 (Generation 2) bytes are unchanged at the A2 checkpoint',
    () => {
      for (const [path, digest] of Object.entries(V3_BYTES)) {
        expect(sha256(gitBytes(A2_CHECKPOINT, path)), path).toBe(digest);
      }
    },
  );
});

// ---------------------------------------------------------------------------
// C. THE PROPOSAL STILL AUTHORISES NOTHING INSIDE ITS OWN BYTES.
// ---------------------------------------------------------------------------

describe('2D-A3 R46: the approved proposal is unedited and still a draft internally', () => {
  it('keeps DRAFT status and an empty authority inside the reviewed bytes', () => {
    expect(readJson(PROPOSAL_PATH)).toMatchObject({
      recordKind: 'METHODOLOGY_AMENDMENT_PROPOSAL',
      status: 'DRAFT_AWAIT_OWNER_APPROVAL',
      authorityClass: 'NOT_EXECUTION_AUTHORITY',
      thisFileAuthorises: [],
      notFrozen: true,
      notImplementationAuthority: true,
      methodologyAmendmentApproved: false,
      isOwnerApproval: false,
    });
  });
});

// ---------------------------------------------------------------------------
// D. THE OWNER APPROVAL RECORD.
// ---------------------------------------------------------------------------

describe.skipIf(!existsSync(join(REPO_ROOT, APPROVAL_PATH)))(
  '2D-A3 R46: the separate owner approval record',
  () => {
    const approval = existsSync(join(REPO_ROOT, APPROVAL_PATH)) ? readJson(APPROVAL_PATH) : {};

    it('is a separate immutable owner methodology-amendment approval', () => {
      expect(APPROVAL_PATH).not.toBe(PROPOSAL_PATH);
      expect(approval).toMatchObject({
        recordKind: 'OWNER_METHODOLOGY_AMENDMENT_APPROVAL',
        approvalAndGovernanceOnly: true,
        terminalState: TERMINAL_STATE,
      });
      expect(obj(approval['immutability'])['appendOnly']).toBe(true);
    });

    it('names exactly the two owner decision markers', () => {
      const markers = (approval['ownerDecisions'] as Json[]).map((d) => d['marker']);
      expect(markers).toEqual([APPROVE_MARKER, R47_MARKER]);
    });

    it('binds the exact R45 terminal and the repaired R45 chain', () => {
      const source = obj(approval['r45Source']);
      expect(source['r45Terminal']).toBe(R45_TERMINAL);
      expect(source['r44Terminal']).toBe(R44_TERMINAL);
      expect((source['r45ChainAboveR44'] as Json[]).map((c) => c['commit'])).toEqual(R45_CHAIN);
      expect(source['repairedR45IsTheApprovedSource']).toBe(true);
    });

    it('binds the exact proposal, options and audit bytes, unedited on approval', () => {
      const proposal = obj(approval['approvedProposal']);
      expect(proposal).toMatchObject({
        path: PROPOSAL_PATH,
        sha256: R45_BYTES[PROPOSAL_PATH].sha256,
        bytes: R45_BYTES[PROPOSAL_PATH].bytes,
        sourceCommit: R45_TERMINAL,
        statusInsideTheBytes: 'DRAFT_AWAIT_OWNER_APPROVAL',
        thisFileAuthorisesInsideTheBytes: [],
        bytesNeverChangeOnApproval: true,
      });
      const design = obj(approval['boundDesignRecords']);
      for (const [key, path] of [
        ['options', OPTIONS_PATH],
        ['audit', R45_AUDIT_PATH],
      ] as const) {
        expect(obj(design[key]), key).toMatchObject({
          path,
          sha256: R45_BYTES[path].sha256,
          bytes: R45_BYTES[path].bytes,
          sourceCommit: R45_TERMINAL,
        });
      }
      expect(design['noneEditedOnApproval']).toBe(true);
    });

    it('approves exactly Option A, matching the rule id inside the proposal bytes', () => {
      const option = obj(approval['approvedOption']);
      expect(option).toMatchObject({ id: 'A', token: OPTION_A, optionComparisonReopened: false });
      expect(option['ruleId']).toBe(obj(readJson(PROPOSAL_PATH)['proposedRule'])['ruleId']);
      const summary = obj(option['summary']);
      expect(obj(summary['existingBranch'])['when']).toBe('|T(a)| >= 5 AND |T(b)| >= 5');
      expect(obj(summary['r4Branch'])['when']).toBe('|T(a)| < 5 OR |T(b)| < 5');
      expect(summary['introducesNone']).toEqual(
        expect.arrayContaining([
          'smaller n-gram',
          'character similarity',
          'edit distance',
          'special Jaccard value',
          'new numeric threshold',
        ]),
      );
    });

    it('classifies it METHODOLOGY_V2_R4, an additive amendment and not a new generation', () => {
      expect(obj(approval['approvedClassification'])).toMatchObject({
        version: 'METHODOLOGY_V2_R4',
        form: 'ADDITIVE_AMENDMENT_OF_R3_SD7_SHORT_TEXT_BRANCH',
        isNewMethodologyGeneration: false,
      });
    });

    it('applies identically to Generation 1 and Generation 2 without touching acquisition governance', () => {
      const scope = obj(approval['crossGenerationScope']);
      expect(scope['appliesToGenerations']).toEqual(['METHODOLOGY_V2_GEN1', 'METHODOLOGY_V3_GEN2']);
      expect(scope['appliesIdenticallyToBoth']).toBe(true);
      expect(scope['scopeKind']).toBe('CORPUS_METHODOLOGY_NOT_ACQUISITION_GOVERNANCE');
      expect(scope['methodologyV3BytesReadAtCommit']).toBe(A2_CHECKPOINT);
      expect(scope['methodologyV3ProposalR1Sha256']).toBe(
        V3_BYTES['docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_PROPOSAL_R1.json'],
      );
      expect(scope['methodologyV3OwnerFreezeApprovalSha256']).toBe(
        V3_BYTES[
          'docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V3_OWNER_FREEZE_APPROVAL_V1.json'
        ],
      );
      expect(scope['unaltered']).toEqual(
        expect.arrayContaining(['V3-A1..A7', 'reserve semantics', 'occupancy', 'Governance V5']),
      );
      expect(obj(readJson(PROPOSAL_PATH))['appliesToGenerations']).toEqual(
        scope['appliesToGenerations'],
      );
    });

    it('binds every historical record by its current digest and edits none', () => {
      const historical = obj(approval['historicalBytesUnchanged']);
      const bound = Object.values(historical).filter(
        (v): v is Json => typeof v === 'object' && v !== null,
      );
      expect(bound.length).toBe(Object.keys(HISTORICAL).length);
      for (const entry of bound) {
        const path = String(entry['path']) as keyof typeof HISTORICAL;
        expect(HISTORICAL[path], path).toBeDefined();
        expect(entry['sha256']).toBe(HISTORICAL[path].sha256);
        expect(entry['bytes']).toBe(HISTORICAL[path].bytes);
      }
      expect(historical).toMatchObject({
        r3BytesEdited: false,
        r3OwnerFreezeApprovalEdited: false,
        priorShortTextRecordsEdited: false,
      });
    });

    it('supersedes append-only and preserves every still-binding prohibition', () => {
      const supersession = obj(approval['supersession']);
      expect(supersession).toMatchObject({ appendOnly: true, priorRecordsEdited: false });
      expect(supersession['explicitlyStillBinding']).toEqual(
        expect.arrayContaining([
          'no invented Jaccard(empty, empty)',
          'REQUIRED membership remains REACHABLE_SELECTED_CAPPED_MEMBERSHIP',
          'corpus freeze still refuses any genuinely blocked REQUIRED membership',
          'no post-label discretion',
          'always-include remains forbidden',
          'always-exclude remains forbidden',
          'smaller n-gram fallback remains forbidden',
          'character-similarity fallback remains forbidden',
        ]),
      );
      expect(obj(readJson(PROPOSAL_PATH)['supersessionPlan'])['oldRecordsEdited']).toBe(false);
    });

    it('leaves A2 and Governance V5 untouched, and requires R47 to re-check SD9 and STOP', () => {
      const boundary = obj(approval['a2AndGovernanceBoundary']);
      expect(boundary['a2AcquisitionOutcomesRemainAcquisitionOfRecord']).toBe(true);
      expect(boundary['thisApprovalDoesNot']).toEqual(
        expect.arrayContaining([
          'reopen A2',
          'consume a reserve',
          'rewrite either reserve ledger',
          'mint Governance V6',
          'alter Governance V5',
        ]),
      );
      expect(boundary['r47MustMechanicallyRecheckSd9Invariance']).toBe(true);
    });

    it('replays from SD7_GRAPH for all twenty DEV_TRAIN slots, never blocker-targeted', () => {
      const replay = obj(approval['replayBoundary']);
      expect(replay).toMatchObject({
        earliestInvalidatedLayer: 'SD7_GRAPH',
        devTrainSlotsToRecompute: 20,
        globalRecomputationRequired: true,
        blockerTargetedReplayAuthorised: false,
      });
      expect(replay['remainCanonicalAndReusable']).toEqual(
        expect.arrayContaining([
          'Governance V5',
          'R39 durable evidence',
          'R40 canonical document assembly',
        ]),
      );
      const proposalBoundary = obj(readJson(PROPOSAL_PATH)['minimalReplayBoundary']);
      expect(proposalBoundary['earliestInvalidatedLayer']).toBe(replay['earliestInvalidatedLayer']);
      expect(proposalBoundary['blockerTargetedRepairAllowed']).toBe(false);
    });

    it('authorises R47 as a separate, bounded slice that has not executed', () => {
      const r47 = obj(approval['r47Authority']);
      expect(r47).toMatchObject({
        marker: R47_MARKER,
        authorised: true,
        executedInR46: false,
        separateFromThisApproval: true,
      });
      expect(r47['mayNot']).toEqual(
        expect.arrayContaining([
          'open DEV_CONFIRM',
          'open FINAL_HOLDOUT',
          'use labels or gold',
          'run provider inference',
          'freeze corpus',
          'start A4',
          'start A5',
          'alter A2 on any replay discrepancy',
        ]),
      );
      expect(r47['stopsBefore']).toEqual(['DEV_CONFIRM', 'FINAL_HOLDOUT', 'A4', 'A5']);
    });

    it('sets exactly the authority flags the owner decided', () => {
      expect(approval['authorityFlags']).toEqual({
        methodologyR4Approved: true,
        methodologyR4Frozen: true,
        r47ImplementationReplayAuthorised: true,
        r47Executed: false,
        sd7RuntimeChanged: false,
        a3ReplayPerformed: false,
        devConfirmAccessAuthorised: false,
        finalHoldoutAccessAuthorised: false,
        a4Authorised: false,
        a5FreezeAuthorised: false,
        labelsAuthorised: false,
        providerInferenceAuthorised: false,
        a2Reopened: false,
      });
      expect(Object.values(obj(approval['r46Performed'])).filter((v) => v === true)).toEqual([
        true,
      ]);
      expect(obj(approval['r46Performed'])['approvalIsNotImplementation']).toBe(true);
    });

    it('makes no claim about the future replay result', () => {
      expect(obj(approval['noFutureResultClaim'])).toMatchObject({
        claimsSetPBlockersBecomeZero: false,
        claimsSetRBlockersBecomeZero: false,
        claimsCorpusFreezeWillClear: false,
        claimsA4WillBecomeAuthorised: false,
      });
      expect(obj(approval['historicalAggregatesCitedOnly'])).toMatchObject({
        devTrainSlots: 20,
        r44SetPBlockers: 6,
        r44SetRBlockers: 4,
        newCorpusObservationInR46: false,
      });
    });
  },
);

// ---------------------------------------------------------------------------
// E. THE AUDIT.
// ---------------------------------------------------------------------------

describe.skipIf(!existsSync(join(REPO_ROOT, AUDIT_PATH)))('2D-A3 R46: the audit', () => {
  const audit = existsSync(join(REPO_ROOT, AUDIT_PATH))
    ? readFileSync(join(REPO_ROOT, AUDIT_PATH), 'utf8')
    : '';

  it('states the markers, the option, the classification, the boundary and the terminal', () => {
    for (const token of [
      APPROVE_MARKER,
      R47_MARKER,
      OPTION_A,
      'METHODOLOGY_V2_R4',
      'METHODOLOGY_V2_GEN1',
      'METHODOLOGY_V3_GEN2',
      'SD7_GRAPH',
      TERMINAL_STATE,
      R45_BYTES[PROPOSAL_PATH].sha256,
    ]) {
      expect(audit, token).toContain(token);
    }
    expect(audit).toMatch(/does \*\*not\*\* claim/);
  });
});

// ---------------------------------------------------------------------------
// F. DISCLOSURE FIREWALL.
// ---------------------------------------------------------------------------

describe('2D-A3 R46: the approval and audit disclose no real-corpus identity', () => {
  const texts = [APPROVAL_PATH, AUDIT_PATH]
    .filter((path) => existsSync(join(REPO_ROOT, path)))
    .map((path) => readFileSync(join(REPO_ROOT, path), 'utf8'));

  it('carries no URL, host, uuid, e-mail or identity field', () => {
    for (const text of texts) {
      expect(text).not.toMatch(/https?:\/\//);
      expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      expect(text).not.toMatch(/\S@\S+\.\S/);
      expect(text).not.toMatch(
        /"(?:selectionIndex|selectionIndices|organisationId|echeRowKey|runId|documentSha256|blockedSlots|rankPosition|mainText|tokens|edges)"\s*:/,
      );
    }
  });

  it('every 64-hex digest is a bound file digest; every 40-hex value is a known commit', () => {
    const boundDigests = new Set<string>([
      ...Object.values(R45_BYTES).map((b) => b.sha256),
      ...Object.values(HISTORICAL).map((b) => b.sha256),
      ...Object.values(V3_BYTES),
    ]);
    const knownCommits = new Set<string>([
      R44_TERMINAL,
      ...R45_CHAIN,
      A2_CHECKPOINT,
      R46_SCOPE_PIN_COMMIT,
    ]);
    for (const text of texts) {
      const digests = [...text.matchAll(/\b[0-9a-f]{64}\b/g)].map((m) => m[0]);
      expect(digests.filter((digest) => !boundDigests.has(digest))).toEqual([]);
      const commits = [...text.matchAll(/\b[0-9a-f]{40}\b/g)].map((m) => m[0]);
      expect(commits.filter((commit) => !knownCommits.has(commit))).toEqual([]);
    }
  });
});
