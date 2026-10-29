/**
 * ENGINE_RUNTIME_LINEAGE_RECONCILIATION_V1 — FETCH-POLICY V7 ADOPTED INTO THE
 * CANONICAL R52 ENGINE LINEAGE AS AN EXACT, PROVABLE PATCH.
 *
 *   A. source-delta proof: at R52 the three production files equal the v7
 *      source parent a1ef1e2 byte-for-byte, and on this lineage they equal
 *      the v7 source commit e0166e0 byte-for-byte — pinned by an immutable
 *      SHA-256 manifest as well as by the git objects themselves;
 *   B. the exact v7 capability: the bootstrap is NOT widened, the redirect
 *      continuation is a separate URL-scoped factory over a two-member path
 *      set, and the hop and retry bounds did not move;
 *   C. lineage: descends from the exact R52 terminal, merges nothing, does
 *      not contain the A2 branch, and changes only the reconciled surface —
 *      no gateway, orchestrator, classifier or migration byte;
 *   D. the R49..R52 evaluation artifacts are byte-unchanged;
 *   E. the reconciliation record is a result, not an authority.
 *
 * A claim of v7 equivalence after someone changes those semantics fails
 * section A: the manifest names the exact source bytes, not a description.
 *
 * FROZEN AT THE RECONCILIATION TERMINAL. The reconciliation slice is closed:
 * every lineage, changed-surface, manifest and record assertion below is
 * evaluated over the exact range R52_TERMINAL..ENGINE_RUNTIME_RECONCILIATION_TERMINAL
 * (and file bodies at that exact tree), never over HEAD or the working tree,
 * so a later, separately authorised slice (the classifier operator entry
 * point first) is never judged against this slice's own authorised surface —
 * and this slice is never made retrospectively to contain anything that
 * landed after it. Only the behavioural RobotsAuthorisation checks in
 * section B still exercise the live module, because a behaviour cannot be
 * read out of a git tree.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RobotsAuthorisation } from '../../orgunits/web/robotsAuthority.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const R52_TERMINAL = 'b1dfd82542e7dfb749d5c36063ea750647428a12';
const ENGINE_RUNTIME_RECONCILIATION_TERMINAL = '3390f61f44f65513ca6b71969b528591f3978e49';
/** The four reconciliation commits above R52, oldest first. */
const RECONCILIATION_COMMITS = [
  'ed480d0d22cf79db00967ade14832cfeabff91cd',
  '1f3c27b5c20add484678a2cf96bc6d7532dbd681',
  '766dd13794cf3a3dbdf7f1fd483a9ce61ec80676',
  ENGINE_RUNTIME_RECONCILIATION_TERMINAL,
];
const V7_SOURCE_COMMIT = 'e0166e0f787e3bba00b35271cab6717eb65a202c';
const V7_SOURCE_PARENT = 'a1ef1e2dda57d66848052914a36508a5dd5999b4';
const V7_SCOPE_PIN_COMMIT = '6301e95b60d78adbc4f71d9354b2c2f5b794ea96';
const A2_TIP = '29d0d486cb268b5431a0fc23eabb064682ec47d9';

const R52_TEST = 'src/test/unit/orgunitCorpus2DA4R52HumanReviewDeferral.test.ts';
const THIS_TEST = 'src/test/unit/engineRuntimeLineageReconciliationV1.test.ts';
const RECORD = 'docs/evaluation/PHASE_2B_2D_ENGINE_RUNTIME_LINEAGE_RECONCILIATION_V1.json';
const AUDIT = 'docs/audits/PHASE_2B_2D_ENGINE_RUNTIME_LINEAGE_RECONCILIATION_V1.md';
const ADR_0016 = 'docs/adr/0016-trailing-slash-robots-redirect-continuation.md';
const V7_REPAIR_RECORD =
  'docs/evaluation/PHASE_2B_2D_A2_ROBOTS_TRAILING_SLASH_FETCH_POLICY_V7_REPAIR_V1.json';
const V7_SCOPE_FIREWALL = 'src/test/firewall/phase2bRobotsTrailingSlash.firewall.test.ts';

/** Immutable manifest: SHA-256 and byte length of the exact source blobs. */
const PRODUCTION_MANIFEST: Record<
  string,
  { parent: { sha256: string; bytes: number }; v7: { sha256: string; bytes: number } }
> = {
  'src/orgunits/web/policy.ts': {
    parent: {
      sha256: 'affe97f6736831e8e1a57417c1d6b80f254b9dd71d869fae4d4e8a8ce22d7ea9',
      bytes: 20581,
    },
    v7: {
      sha256: 'e7f274e3c1ddcb0433fcaeec9aebaafa37f2623603d5d241588bedfe73de7b3c',
      bytes: 24532,
    },
  },
  'src/orgunits/web/robots.ts': {
    parent: {
      sha256: '4748984b29c19d8bef8c2d5fea1b168c6a6030f35f4af4118ab4bd1f10c2d481',
      bytes: 40360,
    },
    v7: {
      sha256: '5e89503c00a80d33c9c341a774a9b46a837e46ddce18dbf6d41e857e24a4e0c4',
      bytes: 44548,
    },
  },
  'src/orgunits/web/robotsAuthority.ts': {
    parent: {
      sha256: '5057ca454e92abcb41d32eda878733431a7e4a9d67513d4ea73f91ab5d7051e9',
      bytes: 10487,
    },
    v7: {
      sha256: '061ba7efeca1d63538bb557b9b18ef146146f791724c99c92013b15a8c84a14b',
      bytes: 15415,
    },
  },
};
const PRODUCTION_FILES = Object.keys(PRODUCTION_MANIFEST);

const DOC_MANIFEST: Record<string, { sha256: string; bytes: number }> = {
  [ADR_0016]: {
    sha256: '7067466be7755ab46501ec0da73b72b6931e6f6bcc546aea7fce62c444396391',
    bytes: 18853,
  },
  [V7_REPAIR_RECORD]: {
    sha256: '4231660bd5eb5ce0f20e8a235b5d687b544b18ca595e92979c01a2f19ae92a49',
    bytes: 24734,
  },
};

/** Every file e0166e0 touched; each is adopted at its exact e0166e0 blob. */
const V7_SOURCE_SURFACE = [
  ADR_0016,
  V7_REPAIR_RECORD,
  ...PRODUCTION_FILES,
  V7_SCOPE_FIREWALL,
  'src/test/integration/orgunitAnchorDocumentBase.test.ts',
  'src/test/integration/orgunitDiscoveryRcdata.test.ts',
  'src/test/integration/orgunitRobotsOptionCLite.test.ts',
  'src/test/integration/orgunitRobotsTrailingSlash.test.ts',
  'src/test/integration/orgunitTransportRetry.test.ts',
  'src/test/unit/orgunitClassifyHistoricalFetchPolicyProvenance.test.ts',
  'src/test/unit/orgunitCorpus2DOptionBTransition.test.ts',
  'src/test/unit/orgunitDiscoveryRcdata.test.ts',
  'src/test/unit/orgunitRobotsAuthority.test.ts',
  'src/test/unit/orgunitRobotsRedirectContinuation.test.ts',
].sort();

const TERMINAL = 'ENGINE_RUNTIME_LINEAGE_RECONCILED_FETCH_POLICY_V7_READY_FOR_OPERATOR_ENTRY_POINT';

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 256 << 20 });
}
function gitBytes(spec: string): Buffer {
  return execFileSync('git', ['show', spec], { cwd: REPO_ROOT, maxBuffer: 256 << 20 });
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
const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const T = ENGINE_RUNTIME_RECONCILIATION_TERMINAL;
/** A file's exact bytes at the reconciliation terminal tree — never the working tree. */
const atTerminal = (path: string): Buffer => gitBytes(`${T}:${path}`);
const json = (path: string): Record<string, unknown> =>
  JSON.parse(atTerminal(path).toString('utf8')) as Record<string, unknown>;
const existsAtTerminal = (path: string): boolean =>
  git('ls-tree', '--name-only', T, '--', path).trim() === path;

const terminalAvailable = commitExists(T);
const r52Available = commitExists(R52_TERMINAL) && terminalAvailable;
const sourceAvailable =
  commitExists(V7_SOURCE_COMMIT) && commitExists(V7_SOURCE_PARENT) && terminalAvailable;
const recordsPresent = terminalAvailable && [RECORD, AUDIT].every(existsAtTerminal);

/** The reconciliation's exact changed surface: R52_TERMINAL..TERMINAL, never HEAD. */
function changedInReconciliation(): string[] {
  return lines(git('diff', '--name-only', R52_TERMINAL, T));
}

/** The text of one static method, from its declaration to its closing brace. */
function staticMethod(source: string, name: string): string {
  const start = source.indexOf(`  static ${name}(`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const end = source.indexOf('\n  }\n', start);
  expect(end, name).toBeGreaterThan(start);
  return source.slice(start, end + 4);
}

// ---------------------------------------------------------------------------
// A. SOURCE-DELTA PROOF.
// ---------------------------------------------------------------------------

describe('engine reconciliation: the production files ARE the v7 source bytes', () => {
  it.skipIf(!terminalAvailable).each(PRODUCTION_FILES)(
    '%s equals the manifest v7 blob at the reconciliation terminal',
    (path) => {
      const bytes = atTerminal(path);
      expect(bytes.length).toBe(PRODUCTION_MANIFEST[path]!.v7.bytes);
      expect(digest(bytes)).toBe(PRODUCTION_MANIFEST[path]!.v7.sha256);
    },
  );

  it.skipIf(!r52Available).each(PRODUCTION_FILES)(
    '%s at R52 equalled the manifest v7-parent blob (the precondition)',
    (path) => {
      expect(digest(gitBytes(`${R52_TERMINAL}:${path}`))).toBe(
        PRODUCTION_MANIFEST[path]!.parent.sha256,
      );
    },
  );

  it.skipIf(!sourceAvailable || !r52Available)(
    'the manifest matches the committed source refs, and R52 equalled the parent for every v7-touched file',
    () => {
      for (const path of PRODUCTION_FILES) {
        expect(digest(gitBytes(`${V7_SOURCE_PARENT}:${path}`)), path).toBe(
          PRODUCTION_MANIFEST[path]!.parent.sha256,
        );
        expect(digest(gitBytes(`${V7_SOURCE_COMMIT}:${path}`)), path).toBe(
          PRODUCTION_MANIFEST[path]!.v7.sha256,
        );
      }
      expect(git('rev-parse', `${V7_SOURCE_COMMIT}^`).trim()).toBe(V7_SOURCE_PARENT);
      expect(
        lines(git('rev-list', '--parents', '-n', '1', V7_SOURCE_COMMIT))[0]!.split(' '),
      ).toHaveLength(2);
      expect(lines(git('diff', '--name-only', V7_SOURCE_PARENT, V7_SOURCE_COMMIT)).sort()).toEqual(
        V7_SOURCE_SURFACE,
      );
      for (const path of V7_SOURCE_SURFACE) {
        const atR52 = git('ls-tree', R52_TERMINAL, '--', path).trim();
        const atParent = git('ls-tree', V7_SOURCE_PARENT, '--', path).trim();
        expect(atR52, path).toBe(atParent);
      }
    },
  );

  it.skipIf(!sourceAvailable)(
    'every v7-touched file is adopted at its exact e0166e0 blob, the scope firewall at its own pin',
    () => {
      for (const path of V7_SOURCE_SURFACE) {
        const expected =
          path === V7_SCOPE_FIREWALL
            ? git('rev-parse', `${V7_SCOPE_PIN_COMMIT}:${path}`).trim()
            : git('rev-parse', `${V7_SOURCE_COMMIT}:${path}`).trim();
        expect(git('rev-parse', `${T}:${path}`).trim(), path).toBe(expected);
      }
      // The pin is the only non-e0166e0 byte, and it changes exactly one line.
      expect(
        lines(git('diff', '--name-only', `${V7_SCOPE_PIN_COMMIT}^`, V7_SCOPE_PIN_COMMIT)),
      ).toEqual([V7_SCOPE_FIREWALL]);
      expect(
        lines(
          git('diff', '-U0', V7_SOURCE_COMMIT, V7_SCOPE_PIN_COMMIT, '--', V7_SCOPE_FIREWALL),
        ).filter((l) => /^[+-][^+-]/.test(l)),
      ).toEqual([
        '-const REPAIR_TERMINAL_COMMIT: string | null = null;',
        `+const REPAIR_TERMINAL_COMMIT: string | null = '${V7_SOURCE_COMMIT}';`,
      ]);
    },
  );

  it.skipIf(!terminalAvailable).each(Object.keys(DOC_MANIFEST))(
    '%s carries the exact source bytes at the reconciliation terminal',
    (path) => {
      const bytes = atTerminal(path);
      expect(bytes.length).toBe(DOC_MANIFEST[path]!.bytes);
      expect(digest(bytes)).toBe(DOC_MANIFEST[path]!.sha256);
    },
  );
});

// ---------------------------------------------------------------------------
// B. THE EXACT V7 CAPABILITY.
// ---------------------------------------------------------------------------

describe('engine reconciliation: the v7 capability, and only it', () => {
  it.skipIf(!terminalAvailable)(
    'fetch policy is exactly v7 at the reconciliation terminal, and the hop and retry bounds did not move',
    () => {
      const policy = atTerminal('src/orgunits/web/policy.ts').toString('utf8');
      expect(policy).toContain("export const FETCH_POLICY_VERSION = 'orgunit-fetch-policy-v7';");
      expect(policy).toContain('export const MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS = 1;');
      expect(policy).toContain(
        'export const MAX_ROBOTS_TRANSPORT_RETRIES_PER_POLICY_RESOLUTION = 1;',
      );
    },
  );

  it.skipIf(!r52Available)('the hop and retry bounds equal R52 (v6) byte-for-byte', () => {
    const r52 = git('show', `${R52_TERMINAL}:src/orgunits/web/policy.ts`);
    expect(r52).toContain('export const MAX_ROBOTS_REDIRECT_CONTINUATION_HOPS = 1;');
    expect(r52).toContain('export const MAX_ROBOTS_TRANSPORT_RETRIES_PER_POLICY_RESOLUTION = 1;');
  });

  it('the continuation path set is an explicit two-member frozen list', () => {
    expect(RobotsAuthorisation.CONTINUATION_PATHS).toEqual(['/robots.txt', '/robots.txt/']);
    expect(Object.isFrozen(RobotsAuthorisation.CONTINUATION_PATHS)).toBe(true);
  });

  it.skipIf(!r52Available)(
    'the bootstrap factory is byte-for-byte the R52 / v6 implementation',
    () => {
      const now = atTerminal('src/orgunits/web/robotsAuthority.ts').toString('utf8');
      const r52 = git('show', `${R52_TERMINAL}:src/orgunits/web/robotsAuthority.ts`);
      expect(staticMethod(now, 'forRobotsTxtBootstrap')).toBe(
        staticMethod(r52, 'forRobotsTxtBootstrap'),
      );
    },
  );

  it('the bootstrap still refuses /robots.txt/ and accepts only the canonical path', () => {
    const ok = RobotsAuthorisation.forRobotsTxtBootstrap('https://www.example.fr/robots.txt');
    expect(ok.decision).toBe('NOT_APPLICABLE');
    for (const bad of [
      'https://www.example.fr/robots.txt/',
      'https://www.example.fr/robots.txt?x=1',
      'https://www.example.fr/robots.txt#f',
    ]) {
      expect(() => RobotsAuthorisation.forRobotsTxtBootstrap(bad), bad).toThrow();
    }
  });

  it('the continuation factory mints a branded, URL-scoped NOT_APPLICABLE authority for exactly two paths', () => {
    for (const url of ['https://www.example.fr/robots.txt', 'https://www.example.fr/robots.txt/']) {
      const a = RobotsAuthorisation.forRobotsTxtRedirectContinuation(url);
      expect(RobotsAuthorisation.isAuthorisation(a)).toBe(true);
      expect(a.decision).toBe('NOT_APPLICABLE');
      expect(a.rule).toBeNull();
      expect(a.scopedToUrl).toBe(url);
    }
    for (const path of [
      '/robots.txt//',
      '/robots.txt/index',
      '/robots.txt/robots.txt',
      '/ROBOTS.TXT',
      '/robots.txt.',
      '/a/robots.txt/',
      '/robots.txt/?q=1',
      '/robots.txt/#f',
      '/robots.txt?q=1',
      '/',
      '/index.html',
    ]) {
      expect(
        () => RobotsAuthorisation.forRobotsTxtRedirectContinuation(`https://www.example.fr${path}`),
        path,
      ).toThrow();
    }
  });

  it.skipIf(!terminalAvailable)(
    'the policy request role is a closed two-member union selecting the factory',
    () => {
      const robots = atTerminal('src/orgunits/web/robots.ts').toString('utf8');
      expect(robots).toContain(
        "export type PolicyRequestRole = 'BOOTSTRAP' | 'REDIRECT_CONTINUATION';",
      );
      expect(robots).toContain(
        'if (!RobotsAuthorisation.CONTINUATION_PATHS.includes(target.value.requestPath)) return null;',
      );
      expect(robots).toContain("fetchWithBoundedRetry(requestedUrl, 'BOOTSTRAP')");
      expect(robots).toContain("fetchWithBoundedRetry(requestedUrl, 'REDIRECT_CONTINUATION')");
      expect(robots).toContain('const second = await fetchRobotsDocument(url, role);');
      const code = robots
        .split('\n')
        .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
        .join('\n');
      expect(code).not.toMatch(/startsWith\(['"]\/robots\.txt/);
    },
  );
});

// ---------------------------------------------------------------------------
// C. LINEAGE AND CHANGED SURFACE.
// ---------------------------------------------------------------------------

describe.skipIf(!r52Available)('engine reconciliation: lineage and changed surface', () => {
  it('descends from the exact R52 terminal with exactly four single-parent commits', () => {
    expect(() => git('merge-base', '--is-ancestor', R52_TERMINAL, T)).not.toThrow();
    expect(() => git('merge-base', '--is-ancestor', T, 'HEAD')).not.toThrow();
    expect(lines(git('rev-list', '--merges', `${R52_TERMINAL}..${T}`))).toEqual([]);
    expect(lines(git('rev-list', '--reverse', `${R52_TERMINAL}..${T}`))).toEqual(
      RECONCILIATION_COMMITS,
    );
    for (const commit of RECONCILIATION_COMMITS) {
      expect(
        lines(git('rev-list', '--parents', '-n', '1', commit))[0]!.split(' '),
        commit,
      ).toHaveLength(2);
    }
  });

  it('pinned R52 in one first commit touching exactly the R52 test', () => {
    const [first] = lines(git('rev-list', '--reverse', `${R52_TERMINAL}..${T}`));
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(git('rev-parse', `${first}^`).trim()).toBe(R52_TERMINAL);
    expect(lines(git('diff', '--name-only', R52_TERMINAL, first))).toEqual([R52_TEST]);
    expect(lines(git('log', '-1', '--format=%s', first))[0]).toMatch(/freeze R52/);
  });

  it.skipIf(!sourceAvailable)(
    'neither merges nor contains the A2 branch or the v7 commit itself',
    () => {
      expect(() => git('merge-base', '--is-ancestor', V7_SOURCE_COMMIT, T)).toThrow();
      if (commitExists(A2_TIP)) {
        expect(() => git('merge-base', '--is-ancestor', A2_TIP, T)).toThrow();
      }
    },
  );

  it('changes nothing outside the R52 pin, the v7 surface, this test, the record and the audit', () => {
    const permitted = new Set([R52_TEST, ...V7_SOURCE_SURFACE, THIS_TEST, RECORD, AUDIT]);
    expect(changedInReconciliation().filter((path) => !permitted.has(path))).toEqual([]);
    expect([...changedInReconciliation()].sort()).toEqual([...permitted].sort());
  });

  it('changes exactly three production files: no gateway, orchestrator, classifier or other runtime byte', () => {
    const production = changedInReconciliation().filter(
      (path) => path.startsWith('src/') && !path.startsWith('src/test/'),
    );
    expect(production.sort()).toEqual([...PRODUCTION_FILES].sort());
    expect(
      changedInReconciliation().filter(
        (path) =>
          path === 'src/orgunits/web/gateway.ts' ||
          path.startsWith('src/cli/') ||
          path.startsWith('src/orgunits/orchestrator/') ||
          path.startsWith('src/orgunits/classify/') ||
          /^(migrations|scripts|docker|\.github)\//.test(path) ||
          /^package(-lock)?\.json$/.test(path) ||
          path === 'CLAUDE.md',
      ),
    ).toEqual([]);
  });

  it('the migration set is exactly the R52 set (through 0012), and no migration was added', () => {
    const now = lines(git('ls-tree', '-r', '--name-only', T, '--', 'migrations'));
    expect(now).toEqual(
      lines(git('ls-tree', '-r', '--name-only', R52_TERMINAL, '--', 'migrations')),
    );
    expect(now.at(-1)).toMatch(/^migrations\/0012_/);
  });

  it('no classifier operator entry point existed at the reconciliation terminal', () => {
    expect(existsAtTerminal('src/cli/commands/classify.ts')).toBe(false);
    const cli = atTerminal('src/cli/index.ts').toString('utf8');
    expect(cli).not.toContain('orgunits classify');
    expect(cli).not.toMatch(/'run-id'|'model'|'attempt'/);
    expect(cli).not.toContain('runOrganisationClassification');
    expect(
      lines(git('ls-tree', '-r', '--name-only', T, '--', 'src/cli')).filter((p) =>
        /classif/i.test(p),
      ),
    ).toEqual([]);
  });

  it('creates no DEV_CONFIRM, FINAL_HOLDOUT, gold, A5, label, response or adjudication artifact', () => {
    expect(
      changedInReconciliation().filter((path) =>
        /DEV_CONFIRM|FINAL_HOLDOUT|GOLD_|MANIFEST|CORPUS_FREEZE|A5_|LABELS?_|ADJUDICAT|RESPONSES_V|COMPLETED_RESPONSE|DRAFT|PROVISIONAL|LIVE_RESULT|LEDGER/.test(
          path,
        ),
      ),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// D. R49..R52 EVALUATION ARTIFACTS ARE BYTE-UNCHANGED.
// ---------------------------------------------------------------------------

describe.skipIf(!r52Available)(
  'engine reconciliation: every R52 document is byte-unchanged',
  () => {
    it('modifies or deletes no file that existed under docs/ at R52', () => {
      const prior = lines(git('ls-tree', '-r', '--name-only', R52_TERMINAL, '--', 'docs'));
      expect(prior.length).toBeGreaterThan(0);
      expect(lines(git('diff', '--name-only', R52_TERMINAL, T, '--', ...prior))).toEqual([]);
    });

    it('adds under docs/ only ADR 0016, the v7 repair record, this record and the audit', () => {
      expect(
        lines(git('diff', '--diff-filter=A', '--name-only', R52_TERMINAL, T, '--', 'docs')).sort(),
      ).toEqual([ADR_0016, V7_REPAIR_RECORD, ...(recordsPresent ? [RECORD, AUDIT] : [])].sort());
    });
  },
);

// ---------------------------------------------------------------------------
// E. THE RECONCILIATION RECORD.
// ---------------------------------------------------------------------------

describe.skipIf(!recordsPresent)(
  'engine reconciliation: the record is a result, not an authority',
  () => {
    const record = (): Record<string, unknown> => json(RECORD);

    it('names the exact refs, the precondition and the terminal', () => {
      const r = record();
      expect(r['recordKind']).toBe('ENGINE_RUNTIME_LINEAGE_RECONCILIATION');
      expect(r['thisFileAuthorises']).toEqual([]);
      expect(r['destinationBase']).toMatchObject({ commit: R52_TERMINAL });
      expect(r['sourceCommit']).toMatchObject({ commit: V7_SOURCE_COMMIT });
      expect(r['sourceParent']).toMatchObject({ commit: V7_SOURCE_PARENT });
      expect(r['a2Tip']).toMatchObject({ commit: A2_TIP, merged: false });
      expect(r['adoptedFetchPolicyVersion']).toBe('orgunit-fetch-policy-v7');
      expect(r['precondition']).toMatchObject({ holds: true });
      expect(r['terminalState']).toBe(TERMINAL);
    });

    it('binds the production manifest and the adopted documents exactly', () => {
      const files = record()['productionFiles'] as {
        path: string;
        parentSha256: string;
        v7Sha256: string;
      }[];
      expect(files.map((f) => f.path)).toEqual(PRODUCTION_FILES);
      for (const f of files) {
        expect(f.parentSha256, f.path).toBe(PRODUCTION_MANIFEST[f.path]!.parent.sha256);
        expect(f.v7Sha256, f.path).toBe(PRODUCTION_MANIFEST[f.path]!.v7.sha256);
      }
      const docs = record()['adoptedDocuments'] as {
        path: string;
        sha256: string;
        bytes: number;
      }[];
      for (const d of docs)
        expect(DOC_MANIFEST[d.path], d.path).toEqual({ sha256: d.sha256, bytes: d.bytes });
      expect(docs.map((d) => d.path).sort()).toEqual(Object.keys(DOC_MANIFEST).sort());
    });

    it('the reconciliation record and audit are byte-identical to their terminal blobs', () => {
      for (const path of [RECORD, AUDIT]) {
        expect(readFileSync(join(REPO_ROOT, path)).equals(atTerminal(path)), path).toBe(true);
      }
    });

    it('declares every boundary flag false', () => {
      expect(record()['boundaries']).toEqual({
        classifierSemanticChange: false,
        orchestratorProductionChange: false,
        gatewayChange: false,
        migrationChange: false,
        liveExecution: false,
        databaseWritten: false,
        a2BranchMerged: false,
        a2GovernanceImported: false,
        a2LaterCommitsImported: false,
        humanEvaluationDependency: false,
        humanReviewResumed: false,
        devConfirmOpened: false,
        finalHoldoutOpened: false,
        a5Authorised: false,
        mainChanged: false,
      });
    });
  },
);
