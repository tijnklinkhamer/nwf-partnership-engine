/**
 * PHASE 2B-2D A3 R44 — ISOLATION OF THE DEV_TRAIN FREEZE-BLOCKER CLOSURE.
 *
 * Static and lineage proofs that R44:
 *
 *   - descends from the exact R43 tip, pins R43's scope in one first commit
 *     touching exactly one file, and merges nothing;
 *   - adds NO runtime or harness module: every harness namespace, every earlier
 *     census and audit, and every migration is byte-identical to R43;
 *   - changes nothing outside the R43 scope pin, its two tests, its one public
 *     record and its one audit;
 *   - imports only the canonical pure A3 prep contracts and preflight - no
 *     R39/R40/R41 execution helper, no readiness/sample/graph/document/evidence
 *     /governance namespace, no SQL, pool, environment, network, provider,
 *     classifier, label, gold or sealed-root capability;
 *   - publishes a record and audit that carry aggregate counts and canonical
 *     tokens only, authorise nothing, and stop at the owner methodology decision.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const HARNESS = 'src/test/harness/phase2b2d';

/** The exact R43 tip R44 was cut from. */
const R43_TERMINAL = 'f84ea09031d460b28c9386e1d6cd7fb56d4569ab';
/** The one commit that pinned R43's own isolation test to its range. */
const R43_SCOPE_PIN_COMMIT = '6d30ed6055c3a67ae09dee376cb1999808c2d012';
const R43_ISOLATION_TEST =
  'src/test/unit/orgunitCorpus2DA3ReachableMembershipSd9V5Isolation.test.ts';
/**
 * R44'S OWN TERMINAL COMMIT.
 *
 * R44's lineage, changed-surface and no-next-artifact assertions describe
 * R44'S SLICE, so they range over R44's own commits - `R43_TERMINAL..R44_TERMINAL`
 * - and inspect the tree at R44_TERMINAL, rather than HEAD and the working
 * tree. Once a later slice lands on top, the working tree is no longer R44's
 * surface, and diffing to it would fail for the honest reason that history
 * moved on rather than because R44 changed.
 *
 * This is the same standing convention R19 through R43 apply, and it
 * WEAKENS NOTHING: R44's range is frozen, its permitted-path list is
 * unchanged, and each later slice pins the equivalent scope over its own range.
 */
const R44_TERMINAL = '4fd9ffd469333ba181584d56018c61e9ae119c77';
/** The terminal A2 checkpoint; never an A3 ancestor. */
const A2_CHECKPOINT = '29d0d486cb268b5431a0fc23eabb064682ec47d9';

const R44_TESTS = [
  'src/test/unit/orgunitCorpus2DA3DevTrainFreezeBlockerClosure.test.ts',
  'src/test/unit/orgunitCorpus2DA3DevTrainFreezeBlockerClosureIsolation.test.ts',
];
const R44_RECORD_PATH =
  'docs/evaluation/PHASE_2B_2D_A3_R44_DEV_TRAIN_CORPUS_FREEZE_BLOCKER_CLOSURE_V1.json';
const R44_AUDIT_PATH =
  'docs/audits/PHASE_2B_2D_A3_R44_DEV_TRAIN_CORPUS_FREEZE_BLOCKER_CLOSURE_V1.md';

const R44_TERMINAL_STATE =
  'A3_DEV_TRAIN_PIPELINE_COMPLETE_CORPUS_FREEZE_BLOCKED_AWAIT_OWNER_METHODOLOGY_DECISION';

/** The only specifiers an R44 test may import. Everything else is a capability R44 lacks. */
const PERMITTED_SPECIFIERS = new Set([
  'node:child_process',
  'node:crypto',
  'node:fs',
  'node:path',
  'vitest',
  '../harness/phase2b2d/a3prep/contracts.js',
  '../harness/phase2b2d/a3prep/corpusFreezePreflight.js',
  '../harness/phase2b2d/a3prep/organisationCaps.js',
  '../harness/phase2b2d/a3prep/setRSd7Readiness.js',
  '../harness/phase2b2d/a3prep/types.js',
]);

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
const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');

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

/** Import specifiers only: a statement ending `from '...';`, never a regex literal. */
function specifiersOf(source: string): string[] {
  return [...stripComments(source).matchAll(/from '([^']+)';\s*$/gm)].map((match) => match[1]!);
}

const testSource = (path: string): string => readFileSync(join(REPO_ROOT, path), 'utf8');

const baseAvailable =
  commitExists(R43_TERMINAL) && commitExists(R43_SCOPE_PIN_COMMIT) && commitExists(R44_TERMINAL);

// ---------------------------------------------------------------------------
// A. NO NEW SEMANTICS AND NO CAPABILITY.
// ---------------------------------------------------------------------------

describe('2D-A3 R44: governance inspection only, no capability', () => {
  it.each(R44_TESTS)('%s imports only the canonical pure prep contracts', (path) => {
    const outside = specifiersOf(testSource(path)).filter((s) => !PERMITTED_SPECIFIERS.has(s));
    expect(outside).toEqual([]);
  });

  it.each(R44_TESTS)(
    '%s has no SQL, pool, env, network, provider or sealed-root capability',
    (path) => {
      const source = codeWithoutStrings(testSource(path));
      for (const pattern of [
        /\bfetch\s*\(/,
        /process\.env/,
        /\bnew\s+Pool\b/,
        /\bconnect\s*\(/,
        /\.query\s*\(/,
        /\bwriteFile/,
        /\bmkdir/,
        /\bunlink/,
        /\bDate\.now\s*\(/,
        /\bMath\.random\s*\(/,
        /\bspawn\s*\(/,
      ]) {
        expect(pattern.test(source), `${path}: ${String(pattern)}`).toBe(false);
      }
      const specifiers = specifiersOf(testSource(path));
      expect(specifiers.length).toBeGreaterThan(0);
      for (const forbidden of [
        /^pg$|\/db\//,
        /a3evidence|a3documents|a3graphs|a3samples|a3readiness|a3governance|a3crossGeneration/,
        /classify|anthropic|claude-agent|provider|sealed|gold|label/i,
        /^node:(?:net|http|https|dns|tls)$/,
      ]) {
        expect(
          specifiers.filter((s) => forbidden.test(s)),
          `${path}: ${String(forbidden)}`,
        ).toEqual([]);
      }
    },
  );

  it('the one real-preflight call site passes invented summaries only, never an R43 object', () => {
    const source = stripComments(testSource(R44_TESTS[0]!));
    const calls = [...source.matchAll(/checkCurrentA3CorpusFreezePreflight\(\{([\s\S]*?)\}\)/g)];
    expect(calls.length).toBeGreaterThan(0);
    for (const [, body] of calls) {
      for (const field of ['setP', 'setR']) {
        expect(body).toMatch(new RegExp(`${field}: invented\\(`));
      }
      expect(body).toMatch(/k4: (?:\[\]|inventedClearK4\(\))/);
    }
    expect(source).toMatch(/const INVENTED_INDEX_BASE = 900_000;/);
  });
});

// ---------------------------------------------------------------------------
// B. LINEAGE AND CHANGED SURFACE.
// ---------------------------------------------------------------------------

describe.skipIf(!baseAvailable)('2D-A3 R44: lineage and changed surface', () => {
  it('descends from the exact R43 tip, and merges no commit', () => {
    expect(() => git('merge-base', '--is-ancestor', R43_TERMINAL, R44_TERMINAL)).not.toThrow();
    expect(lines(git('rev-list', '--merges', `${R43_TERMINAL}..${R44_TERMINAL}`))).toEqual([]);
  });

  it('never makes the terminal A2 checkpoint an ancestor of A3', () => {
    if (commitExists(A2_CHECKPOINT)) {
      expect(() => git('merge-base', '--is-ancestor', A2_CHECKPOINT, 'HEAD')).toThrow();
    }
  });

  it("pinned R43's scope in exactly one first commit that touched exactly one file", () => {
    const [first] = lines(git('rev-list', '--reverse', `${R43_TERMINAL}..${R44_TERMINAL}`));
    expect(first).toBe(R43_SCOPE_PIN_COMMIT);
    expect(git('rev-parse', `${R43_SCOPE_PIN_COMMIT}^`).trim()).toBe(R43_TERMINAL);
    expect(lines(git('diff', '--name-only', R43_TERMINAL, R43_SCOPE_PIN_COMMIT))).toEqual([
      R43_ISOLATION_TEST,
    ]);
    expect(sha256(git('show', `${R44_TERMINAL}:${R43_ISOLATION_TEST}`))).toBe(
      sha256(git('show', `${R43_SCOPE_PIN_COMMIT}:${R43_ISOLATION_TEST}`)),
    );
  });

  it('touches no harness module and no migration (no new semantic namespace)', () => {
    const touched = lines(
      git(
        'diff',
        '--name-only',
        R43_TERMINAL,
        R44_TERMINAL,
        '--',
        HARNESS,
        'migrations',
        'src/orgunits',
      ),
    );
    expect(touched).toEqual([]);
  });

  it('leaves every earlier public record and audit byte-identical', () => {
    const prior = lines(
      git('ls-tree', '-r', '--name-only', R43_TERMINAL, '--', 'docs/evaluation', 'docs/audits'),
    );
    expect(prior.length).toBeGreaterThan(0);
    expect(lines(git('diff', '--name-only', R43_TERMINAL, R44_TERMINAL, '--', ...prior))).toEqual(
      [],
    );
  });

  it('changes nothing outside the R43 scope pin, its tests, its record and its audit', () => {
    const paths = lines(git('diff', '--name-only', R43_TERMINAL, R44_TERMINAL));
    const permitted = (path: string): boolean =>
      path === R43_ISOLATION_TEST ||
      R44_TESTS.includes(path) ||
      path === R44_RECORD_PATH ||
      path === R44_AUDIT_PATH;
    expect(paths.filter((path) => !permitted(path))).toEqual([]);
  });

  it('created no corpus-freeze, A4, A5, Governance V6 or methodology-amendment artifact (tree at R44_TERMINAL)', () => {
    const tree = lines(git('ls-tree', '-r', '--name-only', R44_TERMINAL));
    for (const name of ['a3preflightV5', 'a3corpusFreeze', 'a3governanceV6', 'a3closure', 'a4']) {
      expect(
        tree.filter((path) => path.startsWith(`${HARNESS}/${name}/`)),
        name,
      ).toEqual([]);
    }
    const added = lines(git('diff', '--name-only', '--diff-filter=A', R43_TERMINAL, R44_TERMINAL));
    expect(
      added.filter((path) =>
        /A4_|A5_|CORPUS_FROZEN|GOVERNANCE_AUTHORITY_CENSUS_V6|METHOD(?:OLOGY)?_V2_R4|METHODOLOGY_V4/.test(
          path,
        ),
      ),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// C. THE PUBLIC RECORD AND AUDIT.
// ---------------------------------------------------------------------------

describe.skipIf(!existsSync(join(REPO_ROOT, R44_RECORD_PATH)))(
  '2D-A3 R44: the committed blocker record and audit',
  () => {
    const recordText = existsSync(join(REPO_ROOT, R44_RECORD_PATH))
      ? readFileSync(join(REPO_ROOT, R44_RECORD_PATH), 'utf8')
      : '{}';
    const auditText = existsSync(join(REPO_ROOT, R44_AUDIT_PATH))
      ? readFileSync(join(REPO_ROOT, R44_AUDIT_PATH), 'utf8')
      : '';
    const record = JSON.parse(recordText) as Record<string, unknown> & {
      [key: string]: Record<string, unknown>;
    };

    it('is the canonical blocker record kind, authorising nothing, at the required terminal', () => {
      expect(record.recordKind).toBe('A3_DEV_TRAIN_TERMINAL_BLOCKER_AND_PHASE_BOUNDARY_RECORD');
      expect(record.thisFileAuthorises).toEqual([]);
      expect(record.terminalState).toBe(R44_TERMINAL_STATE);
      expect(recordText).not.toMatch(/"terminalState":\s*"(?:A3_CORPUS_FROZEN|A4_READY)"/);
    });

    it('binds the exact R43 record and terminal', () => {
      const binding = record.r43Binding!;
      expect(binding.r43Terminal).toBe(R43_TERMINAL);
      expect(binding.r43ScopePinCommit).toBe(R43_SCOPE_PIN_COMMIT);
      expect(binding.recordSha256).toBe(
        sha256(git('show', `${R43_TERMINAL}:${String(binding.recordPath)}`)),
      );
    });

    it('records DEV_TRAIN completion and the 6 / 4 required-membership blockers', () => {
      const completion = record.devTrainCompletion!;
      for (const layer of ['authority', 'evidence', 'document', 'graph', 'sample', 'readiness']) {
        expect(completion[`${layer}Coverage`], layer).toBe(20);
      }
      const blockers = record.requiredMembershipBlockers!;
      expect(blockers.setPBlockedRequiredMembershipSlotCount).toBe(6);
      expect(blockers.setPExactRequiredMembershipSlotCount).toBe(14);
      expect(blockers.setRBlockedRequiredMembershipSlotCount).toBe(4);
      expect(blockers.setRExactRequiredMembershipSlotCount).toBe(16);
      expect(
        record.mechanicalReadiness!
          .mechanicalSd9SuccessDoesNotOverrideSampleMembershipFreezeBlocker,
      ).toBe(true);
    });

    it('records the preflight contract and that no real complete preflight was run', () => {
      const contract = record.fullPreflightApplicabilityContract!;
      expect(contract.canonicalCohortSize).toBe(110);
      expect(contract.canonicalSplitCounts).toEqual({
        DEV_TRAIN: 20,
        DEV_CONFIRM: 45,
        FINAL_HOLDOUT: 45,
      });
      expect(contract.k4GatedSplits).toEqual(['DEV_CONFIRM', 'FINAL_HOLDOUT']);
      expect(contract.realCompleteCorpusPreflightRun).toBe(false);
      expect(contract.missingSplitReadinessFabricated).toBe(false);
    });

    it('discloses no identity: no URL, host, uuid, e-mail or unbound digest', () => {
      for (const text of [recordText, auditText]) {
        expect(text).not.toMatch(/https?:\/\//);
        expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        expect(text).not.toMatch(/\S@\S+\.\S/);
        expect(text).not.toMatch(
          /"(?:selectionIndex|selectionIndices|organisationId|echeRowKey|runId)"\s*:\s*[\d"[]/,
        );
      }
      const bound = new Set([
        sha256(git('show', `${R43_TERMINAL}:${String(record.r43Binding!.recordPath)}`)),
        '2f41f495322eceae3b675cbe1d227115f3b4292d6e3a711879793af33b466fff',
        'b734805bbaddc6890dc7032179b4a639a69a790282923b41641710a060b3d05a',
        '0d6ddaa6dcc70912e3e19d7cb245fbe7b241dff6c671d874cbd1cd50ec33b49a',
        'ddae984fec947845ec2e2df9feb24bf8b8f75c28993b413919c08a69c307fe75',
        '4d856f45dd6016e1007d661f31388bf7bdbefd71862a6585ed4962240454b40f',
      ]);
      const digests = [...`${recordText}\n${auditText}`.matchAll(/\b[0-9a-f]{64}\b/g)].map(
        (m) => m[0],
      );
      expect(digests.filter((d) => !bound.has(d))).toEqual([]);
    });

    it('the audit states the terminal, stops before A4 and asks the owner methodology question', () => {
      expect(auditText).toContain(R44_TERMINAL_STATE);
      expect(auditText).toMatch(/OWNER METHODOLOGY DECISION/);
      expect(String(record.nextOwnerQuestion)).toMatch(/6 SET_P and 4 SET_R required memberships/);
    });
  },
);
