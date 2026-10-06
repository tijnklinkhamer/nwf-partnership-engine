/**
 * PHASE 2B-2D A3 R47 — ISOLATION OF THE R4 IMPLEMENTATION AND GLOBAL REPLAY.
 *
 * Static and lineage proofs that R47:
 *
 *   - descends from the exact R46 terminal, pins R46's scope in one first
 *     commit touching exactly one file, and merges nothing;
 *   - leaves EVERY historical R3 byte untouched: `sd7/`, every graph, sample,
 *     readiness, document, evidence and governance namespace, `a3prep/`, every
 *     earlier record and audit - it adds only the sibling `sd7R4/` and
 *     `a3replayR4/` namespaces, its tests, one census and one audit;
 *   - keeps both namespaces pure: no SQL, pool, environment, filesystem,
 *     network, clock, randomness, console or unsafe double cast;
 *   - never consumes a historical R3 graph / sample / readiness as input and
 *     never calls the R3-typed entry points (R22 / R23 / R24, R7 / R8 / R12)
 *     on the real replay path;
 *   - never branches on stratum, continuity or an old blocker in the graph,
 *     sample or readiness binders;
 *   - creates no DEV_CONFIRM, FINAL_HOLDOUT, corpus-freeze, Governance V6,
 *     A4 or A5 artifact;
 *   - publishes a census and an audit that disclose no identity.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const HARNESS = 'src/test/harness/phase2b2d';

/** The exact R46 tip R47 was cut from. */
const R46_TERMINAL = 'e0d1555c09afdc5f17cb3b6b62ac8682a248b2df';
/** The one commit that pinned R46's own isolation test to its range. */
const R46_SCOPE_PIN_COMMIT = '3c995c5bd5178696dab812b4266fe22f40a8da07';
const R46_ISOLATION_TEST =
  'src/test/unit/orgunitCorpus2DA3R4ShortTextOwnerApprovalIsolation.test.ts';
/** The terminal A2 checkpoint; never an A3 ancestor. */
const A2_CHECKPOINT = '29d0d486cb268b5431a0fc23eabb064682ec47d9';

const R47_NAMESPACES = [`${HARNESS}/sd7R4`, `${HARNESS}/a3replayR4`];
const R47_TESTS = [
  'src/test/unit/orgunitCorpus2DA3R4Sd7Relation.test.ts',
  'src/test/unit/orgunitCorpus2DA3R4GlobalReplay.test.ts',
  'src/test/unit/orgunitCorpus2DA3R4GlobalReplayIsolation.test.ts',
];
const R47_CENSUS = 'docs/evaluation/PHASE_2B_2D_A3_R47_R4_GLOBAL_DEV_TRAIN_REPLAY_CENSUS_V1.json';
const R47_AUDIT =
  'docs/audits/PHASE_2B_2D_A3_R47_R4_IMPLEMENTATION_AND_GLOBAL_DEV_TRAIN_REPLAY_V1.md';

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

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Code with string literals blanked: tokens and disclaimers are not capabilities. */
function codeWithoutStrings(source: string): string {
  return stripComments(source)
    .replace(/'[^'\n]*'/g, "''")
    .replace(/"[^"\n]*"/g, '""')
    .replace(/`[^`]*`/g, '``');
}

/** Every import specifier, value or type. */
function specifiersOf(source: string): string[] {
  return [...stripComments(source).matchAll(/from '([^']+)';/g)].map((m) => m[1]!);
}

/** Value (non-type-only) import statements: `import { a, type B } from '...'`. */
function valueImportsOf(source: string): { names: string[]; from: string }[] {
  return [
    ...stripComments(source).matchAll(/import\s+(?!type\b)\{([^}]*)\}\s+from\s+'([^']+)';/g),
  ].map((m) => ({
    names: m[1]!
      .split(',')
      .map((n) => n.trim())
      .filter((n) => n.length > 0 && !n.startsWith('type ')),
    from: m[2]!,
  }));
}

const read = (path: string): string => readFileSync(join(REPO_ROOT, path), 'utf8');
const namespaceFiles = (dir: string): string[] =>
  readdirSync(join(REPO_ROOT, dir))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => `${dir}/${f}`);
const R47_SOURCES = R47_NAMESPACES.flatMap(namespaceFiles);

const baseAvailable = commitExists(R46_TERMINAL) && commitExists(R46_SCOPE_PIN_COMMIT);

/** Every path changed since R46 - committed or not. */
function changedSinceR46(): string[] {
  return [
    ...new Set([
      ...lines(git('diff', '--name-only', R46_TERMINAL)),
      ...lines(git('ls-files', '--others', '--exclude-standard')),
    ]),
  ];
}

// ---------------------------------------------------------------------------
// A. LINEAGE AND CHANGED SURFACE.
// ---------------------------------------------------------------------------

describe.skipIf(!baseAvailable)('2D-A3 R47: lineage and changed surface', () => {
  it('descends from the exact R46 tip, and merges no commit', () => {
    expect(() => git('merge-base', '--is-ancestor', R46_TERMINAL, 'HEAD')).not.toThrow();
    expect(lines(git('rev-list', '--merges', `${R46_TERMINAL}..HEAD`))).toEqual([]);
  });

  it('never makes the terminal A2 checkpoint an ancestor of A3', () => {
    if (commitExists(A2_CHECKPOINT)) {
      expect(() => git('merge-base', '--is-ancestor', A2_CHECKPOINT, 'HEAD')).toThrow();
    }
  });

  it("pinned R46's scope in exactly one first commit that touched exactly one file", () => {
    const [first] = lines(git('rev-list', '--reverse', `${R46_TERMINAL}..HEAD`));
    expect(first).toBe(R46_SCOPE_PIN_COMMIT);
    expect(git('rev-parse', `${R46_SCOPE_PIN_COMMIT}^`).trim()).toBe(R46_TERMINAL);
    expect(lines(git('diff', '--name-only', R46_TERMINAL, R46_SCOPE_PIN_COMMIT))).toEqual([
      R46_ISOLATION_TEST,
    ]);
    expect(
      lines(git('diff', '--name-only', R46_SCOPE_PIN_COMMIT, '--', R46_ISOLATION_TEST)),
    ).toEqual([]);
  });

  it('changes no historical harness byte: only the sibling sd7R4/ and a3replayR4/ namespaces', () => {
    const touched = changedSinceR46().filter((path) => path.startsWith(`${HARNESS}/`));
    expect(
      touched.filter((path) => !R47_NAMESPACES.some((ns) => path.startsWith(`${ns}/`))),
    ).toEqual([]);
    expect(
      lines(git('diff', '--name-only', R46_TERMINAL, '--', `${HARNESS}/sd7`, `${HARNESS}/a3prep`)),
    ).toEqual([]);
  });

  it('changes no runtime, migration, CLI, script or package file', () => {
    expect(
      lines(
        git(
          'diff',
          '--name-only',
          R46_TERMINAL,
          '--',
          'src/orgunits',
          'src/cli',
          'migrations',
          'scripts',
          'package.json',
          'package-lock.json',
        ),
      ),
    ).toEqual([]);
  });

  it('leaves every earlier public record and audit byte-identical', () => {
    const prior = lines(
      git('ls-tree', '-r', '--name-only', R46_TERMINAL, '--', 'docs/evaluation', 'docs/audits'),
    );
    expect(prior.length).toBeGreaterThan(0);
    expect(lines(git('diff', '--name-only', R46_TERMINAL, '--', ...prior))).toEqual([]);
  });

  it('changes nothing outside the R46 scope pin, the two namespaces, its tests, census and audit', () => {
    const permitted = (path: string): boolean =>
      path === R46_ISOLATION_TEST ||
      R47_NAMESPACES.some((ns) => path.startsWith(`${ns}/`)) ||
      R47_TESTS.includes(path) ||
      path === R47_CENSUS ||
      path === R47_AUDIT;
    expect(changedSinceR46().filter((path) => !permitted(path))).toEqual([]);
  });

  it('creates no DEV_CONFIRM, FINAL_HOLDOUT, corpus-freeze, Governance V6, A4 or A5 artifact', () => {
    expect(
      changedSinceR46().filter((path) =>
        /DEV_CONFIRM|FINAL_HOLDOUT|CORPUS_FREEZE|CORPUS_FROZEN|GOVERNANCE_AUTHORITY_CENSUS_V6|A4_|A5_|GEN3/.test(
          path,
        ),
      ),
    ).toEqual([]);
    for (const name of [
      'a3corpusFreeze',
      'a3governanceV6',
      'a4',
      'a5',
      'a3devConfirm',
      'a3finalHoldout',
    ]) {
      expect(existsSync(join(REPO_ROOT, HARNESS, name)), name).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// B. NAMESPACE PURITY.
// ---------------------------------------------------------------------------

describe('2D-A3 R47: the two new namespaces are pure', () => {
  it('both exist, with exactly the reviewed files', () => {
    expect(namespaceFiles(`${HARNESS}/sd7R4`).sort()).toEqual(
      ['envelope.ts', 'measure.ts', 'refusal.ts', 'types.ts'].map((f) => `${HARNESS}/sd7R4/${f}`),
    );
    expect(namespaceFiles(`${HARNESS}/a3replayR4`).sort()).toEqual(
      [
        'approval.ts',
        'census.ts',
        'documents.ts',
        'graphs.ts',
        'readiness.ts',
        'refusal.ts',
        'reproduction.ts',
        'samples.ts',
        'survivors.ts',
        'types.ts',
      ].map((f) => `${HARNESS}/a3replayR4/${f}`),
    );
  });

  it.each(R47_SOURCES)(
    '%s has no SQL, pool, env, fs, network, clock, randomness or console',
    (path) => {
      const code = codeWithoutStrings(read(path));
      for (const pattern of [
        /\bfetch\s*\(/,
        /process\.env/,
        /\bnew\s+Pool\b/,
        /\.connect\s*\(/,
        /\.query\s*\(/,
        /\bwriteFile/,
        /\breadFile/,
        /\bmkdir/,
        /\bDate\.now\s*\(/,
        /\bnew Date\b/,
        /\bMath\.random\s*\(/,
        /\bconsole\./,
        /\bimport\s*\(/,
        /\brequire\s*\(/,
        /\bas unknown as\b/,
        /\bas any\b/,
      ]) {
        expect(pattern.test(code), `${path}: ${String(pattern)}`).toBe(false);
      }
      const allowed =
        /^(?:\.\/|\.\.\/(?:sd7|sd7R4|a3prep|a3documents(?:V2|V4|V5)?|a3evidence(?:V2|V4|V5)?|a3governanceV4|a3governanceV5|a3crossGenerationSlotAuthority|a3readiness|a3replayR4)\/)|^node:crypto$/;
      expect(specifiersOf(read(path)).filter((s) => !allowed.test(s))).toEqual([]);
    },
  );

  it('only the approval binding and the reproduction gate hash anything', () => {
    for (const path of R47_SOURCES) {
      const hashes = specifiersOf(read(path)).includes('node:crypto');
      expect(hashes, path).toBe(/\/(approval|reproduction)\.ts$/.test(path));
    }
  });

  it('sd7R4 builds only on the canonical sd7 primitives', () => {
    for (const path of namespaceFiles(`${HARNESS}/sd7R4`)) {
      expect(
        specifiersOf(read(path)).filter((s) => !/^\.\/|^\.\.\/sd7\//.test(s)),
        path,
      ).toEqual([]);
    }
    const measure = read(`${HARNESS}/sd7R4/measure.ts`);
    for (const name of ['tokenise', 'hasEnoughTokensToShingle', 'shingleSet', 'jaccard']) {
      expect(measure).toMatch(new RegExp(`\\b${name}\\b`));
    }
    // No restated constant: the threshold and shingle size come from sd7Contract.
    expect(codeWithoutStrings(measure)).not.toMatch(/\b0\.9\b|\* 10\b|\* 9\b/);
  });
});

// ---------------------------------------------------------------------------
// C. NO HISTORICAL GRAPH CONSUMPTION, NO BLOCKER TARGETING.
// ---------------------------------------------------------------------------

describe('2D-A3 R47 §5 / §59 / §60: the real replay path', () => {
  const FORBIDDEN_VALUE_IMPORTS = [
    'measureUnboundSlotSd7Graph',
    'prepareUnboundSlotSampleSurvivors',
    'deriveUnboundSlotReachableMembershipReadiness',
    'prepareSd7SampleSurvivors',
    'prepareSetPSd7',
    'prepareSetRSd7',
    'determineSetRDocumentCap',
    'deriveSetRFreezeSlotReadiness',
    'deriveSetPFreezeSlotReadiness',
    'deriveSd9BoundsUnderShortTextPolicy',
    'bindDevTrainSd7GraphBatch',
    'bindDevTrainSd7GraphDeltaBatchV2',
    'bindDevTrainSd7GraphDeltaBatchV4',
    'bindDevTrainSd7GraphDeltaBatchV5',
    'bindDevTrainSampleSurvivorBatch',
    'bindDevTrainReachableMembershipSd9Batch',
  ];

  it.each(R47_SOURCES)(
    '%s imports no R3-typed entry point and no historical graph namespace',
    (path) => {
      const source = read(path);
      for (const { names } of valueImportsOf(source)) {
        expect(
          names.filter((n) => FORBIDDEN_VALUE_IMPORTS.includes(n)),
          path,
        ).toEqual([]);
      }
      expect(
        specifiersOf(source).filter((s) => /\/(?:a3graphs|a3samples|a3readinessV\d)/.test(s)),
        path,
      ).toEqual([]);
      expect(codeWithoutStrings(source)).not.toMatch(/\bmeasureNearDuplicateGraph\b.*\bas\b/);
    },
  );

  it('the only readiness-namespace values used are the owner-policy binding and its token', () => {
    for (const path of R47_SOURCES) {
      for (const { names, from } of valueImportsOf(read(path))) {
        if (from.endsWith('/a3readiness/membership.js')) {
          expect(names).toEqual(['requireReachableMembershipPolicyBinding']);
        }
        if (from.endsWith('/a3readiness/types.js')) {
          expect(names).toEqual(['REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT']);
        }
      }
    }
  });

  it('canonical R3 measurement is reached only from the envelope, over long groups', () => {
    for (const path of R47_SOURCES) {
      const uses = /\b(?:measureNearDuplicateGraph|nearDuplicatePass)\b/.test(
        stripComments(read(path)),
      );
      expect(uses, path).toBe(path.endsWith('sd7R4/envelope.ts'));
    }
    expect(read(`${HARNESS}/sd7R4/envelope.ts`)).toMatch(/longGroupsOf\(graph, groups\)/);
  });

  it.each(['graphs.ts', 'samples.ts', 'readiness.ts', 'survivors.ts'])(
    'a3replayR4/%s never branches on stratum, continuity, generation or an old blocker',
    (file) => {
      const code = codeWithoutStrings(read(`${HARNESS}/a3replayR4/${file}`));
      expect(code).not.toMatch(
        /\bstratum\b|\bgovernanceContinuity\b|\bgeneration\b|BLOCKED|blocked/,
      );
      expect(code).not.toMatch(/\bshortTextBranch\b/);
    },
  );

  it('the replay walks every slot: no filter, find or slice over slots before measuring', () => {
    const graphs = codeWithoutStrings(read(`${HARNESS}/a3replayR4/graphs.ts`));
    expect(graphs).toMatch(/view\.slots\.map\(/);
    expect(graphs).not.toMatch(/view\.slots\.(?:filter|find|slice|some)\(/);
    const samples = codeWithoutStrings(read(`${HARNESS}/a3replayR4/samples.ts`));
    expect(samples).toMatch(/graphBatch\.items\.map\(/);
    const readiness = codeWithoutStrings(read(`${HARNESS}/a3replayR4/readiness.ts`));
    expect(readiness).toMatch(/sampleBatch\.items\.map\(/);
  });
});

// ---------------------------------------------------------------------------
// D. THE PUBLIC CENSUS AND AUDIT.
// ---------------------------------------------------------------------------

describe.skipIf(!existsSync(join(REPO_ROOT, R47_CENSUS)))('2D-A3 R47: the public census', () => {
  const census = existsSync(join(REPO_ROOT, R47_CENSUS))
    ? (JSON.parse(read(R47_CENSUS)) as Record<string, Record<string, unknown>>)
    : {};

  it('is an aggregate-only record that authorises nothing', () => {
    expect(census['recordKind']).toBe('PUBLIC_AGGREGATE_ONLY_R4_GLOBAL_DEV_TRAIN_REPLAY_CENSUS');
    expect(census['thisFileAuthorises']).toEqual([]);
    expect(census['r46Terminal']).toBe(R46_TERMINAL);
  });

  it('records the exact R46 binding and all eight reproductions with zero drift', () => {
    expect(census['r46ApprovalBinding']).toMatchObject({
      approvalRecordSha256: '986a48bdb672f2428c8ef07b04c43e0187e16b43f79b64c0a61b4aef51844eb2',
      approvedProposalSha256: '5ebcc562e72f509e2b664f3ae800dc2043142d5d4a6ec1ec4d2958b8abab1d20',
      approvedProposalBytes: 16628,
    });
    const checkpoints = census['historicalInputReproduction']!['checkpoints'] as {
      checkpoint: string;
      differingSemanticPathCount: number;
    }[];
    expect(checkpoints.map((c) => c.checkpoint)).toEqual([
      'R20',
      'R21',
      'R26',
      'R27',
      'R33',
      'R34',
      'R39',
      'R40',
    ]);
    expect(checkpoints.every((c) => c.differingSemanticPathCount === 0)).toBe(true);
  });

  it('closes the document population and the preserved R3 branch exactly', () => {
    expect(census['documentReplayView']!['population']).toEqual({
      slots: 20,
      sourceRows: 617,
      slotLocalDocuments: 611,
      candidateObservations: 1234,
      exactDuplicateGroups: 5,
      exactDuplicateRowsRemoved: 6,
      multiSourceDocuments: 5,
      r10Preparations: 611,
      r10SourceRows: 617,
      r10CandidateObservations: 1234,
    });
    expect(census['documentReplayView']!['strata']).toEqual({
      R21_V1: 5,
      R27_V2: 1,
      R34_V4: 7,
      R40_V5: 7,
    });
    const g = census['r4Graph']!;
    expect(g).toMatchObject({
      slots: 20,
      documents: 611,
      longDocuments: 580,
      shortBranchDocuments: 31,
      relationResolvedDocuments: 611,
      unresolvedDocuments: 0,
      r3FiveGramPairs: 8502,
      r3FiveGramEdges: 65,
      r3DocumentsTouchingAnEdge: 54,
      measurements: 20,
    });
    expect(g['totalUnorderedPairs']).toBe(8502 + (g['r4ExactSequenceBranchPairs'] as number));
    expect(g['totalR4Edges']).toBe(65 + (g['r4ShortExactSequenceEdges'] as number));
  });

  it('records A2 invariance and the sample / readiness findings consistently', () => {
    expect(census['a2Invariance']).toMatchObject({
      devTrainSlotsChecked: 20,
      a2AcquisitionOfRecordStatusesMatched: 20,
      mismatches: 0,
      a2Reopened: false,
      reserveReplay: false,
      governanceV5Changed: false,
    });
    for (const sample of ['setP', 'setR']) {
      const s = census[sample]!;
      expect((s['survivors'] as number) + (s['exclusions'] as number)).toBe(611);
      expect(s).toMatchObject({
        rankedDocuments: 611,
        unresolved: 0,
        exactCaps: 20,
        blockedCaps: 0,
        fullRankExact: 20,
        fullRankBlocked: 0,
        reachableExact: 20,
        reachableBlocked: 0,
        preparations: 20,
      });
    }
    const d = census['divergence']!;
    expect(
      (d['survivingBothSamples'] as number) +
        (d['survivingSetPOnly'] as number) +
        (d['survivingSetROnly'] as number) +
        (d['excludedInBothSamples'] as number),
    ).toBe(611);
    expect(census['freezeBoundary']).toMatchObject({
      corpusFreezeClear: false,
      devConfirmOpened: false,
      finalHoldoutOpened: false,
      a4Started: false,
    });
  });

  it('discloses no identity: no URL, uuid, e-mail, identity key or unknown digest', () => {
    const text = read(R47_CENSUS);
    expect(text).not.toMatch(/https?:\/\//);
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(text).not.toMatch(/\S@\S+\.\S/);
    expect(text).not.toMatch(
      /"(?:selectionIndex|selectionIndices|organisationId|echeRowKey|runId|documentSha256|pageId|mainText|tokens|edges|rankPosition|url|host|title|headings)"\s*:(?!\s*false)/,
    );
    const digests = [...text.matchAll(/\b[0-9a-f]{64}\b/g)].map((m) => m[0]);
    const known = new Set([
      '986a48bdb672f2428c8ef07b04c43e0187e16b43f79b64c0a61b4aef51844eb2',
      '5ebcc562e72f509e2b664f3ae800dc2043142d5d4a6ec1ec4d2958b8abab1d20',
      ...[
        'PHASE_2B_2D_A3_R20_DEV_TRAIN_DURABLE_EVIDENCE_BINDING_CENSUS_V1',
        'PHASE_2B_2D_A3_R21_DEV_TRAIN_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1',
        'PHASE_2B_2D_A3_R26_DEV_TRAIN_INCREMENTAL_DURABLE_EVIDENCE_CENSUS_V1',
        'PHASE_2B_2D_A3_R27_DEV_TRAIN_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1',
        'PHASE_2B_2D_A3_R33_DEV_TRAIN_INCREMENTAL_DURABLE_EVIDENCE_CENSUS_V1',
        'PHASE_2B_2D_A3_R34_DEV_TRAIN_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1',
        'PHASE_2B_2D_A3_R39_DEV_TRAIN_INCREMENTAL_DURABLE_EVIDENCE_CENSUS_V1',
        'PHASE_2B_2D_A3_R40_DEV_TRAIN_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1',
      ].map((name) =>
        createHash('sha256')
          .update(readFileSync(join(REPO_ROOT, 'docs/evaluation', `${name}.json`)))
          .digest('hex'),
      ),
    ]);
    expect(digests.filter((digest) => !known.has(digest))).toEqual([]);
    const commits = [...text.matchAll(/\b[0-9a-f]{40}\b/g)].map((m) => m[0]);
    for (const commit of commits) expect(commitExists(commit), commit).toBe(true);
  });
});

describe.skipIf(!existsSync(join(REPO_ROOT, R47_AUDIT)))('2D-A3 R47: the audit', () => {
  it('names the binding, the boundary and the terminal, and claims no corpus freeze', () => {
    const audit = read(R47_AUDIT);
    for (const token of [
      R46_TERMINAL,
      '5ebcc562e72f509e2b664f3ae800dc2043142d5d4a6ec1ec4d2958b8abab1d20',
      'METHODOLOGY_V2_R4',
      'SD7_SHORT_TEXT_EXACT_NORMALISED_TOKEN_SEQUENCE_FALLBACK_V1',
      '5 + 1 + 7 + 7',
      'DEV_CONFIRM',
      'FINAL_HOLDOUT',
    ]) {
      expect(audit, token).toContain(token);
    }
    expect(audit).not.toMatch(/https?:\/\//);
    expect(audit).toMatch(/does \*\*not\*\* (?:mean|claim)/);
  });
});
