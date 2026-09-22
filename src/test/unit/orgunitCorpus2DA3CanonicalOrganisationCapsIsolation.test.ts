/**
 * PHASE 2B-2D A3 R15 ISOLATION — `organisationCaps.ts` IMPLEMENTS THE K4
 * GREATEST FIXED POINT OVER COUNTS AND ALREADY-ORDERED GROUPS, AND NOTHING
 * ELSE.
 *
 * By reading the real source of `a3prep/organisationCaps.ts` and the git
 * history, this file proves:
 *
 *   - it imports exactly `./contracts.js` - no rank, SET_P, SET_R, SD7, SD9,
 *     preflight, crypto, production scoring, database, network or filesystem;
 *   - it is pure: no IO, clock, randomness, environment or console use;
 *   - its arithmetic is exact: no float literal, no `Math.floor`/`Math.min`,
 *     one `bigint` division, and no numeric literal other than 0 and 1 - so
 *     neither 10, 12, 8, 4 nor 66 is typed anywhere (66 only by imported
 *     role constant);
 *   - it has no arbitrary iteration limit;
 *   - it sorts nothing, compares no string order and builds no G1 union rank;
 *   - it carries none of the rejected one-pass API names;
 *   - its G3 freeze output has no mask, prefix, denominator or item list, and
 *     its readiness shape has no count vector or gate list;
 *   - R15's changed surface, from the K4 policy binding's terminal commit to
 *     R15's OWN code commit, is this module, the evolved preflight, R15's two
 *     new tests, the expanded preflight tests and exact-name widenings of
 *     earlier guards; no other a3prep runtime file changes, and `contracts.ts`
 *     changes (if at all) in comments only.
 *
 * The historical `organisationCaps.ts` on the non-canonical
 * `feat/phase2b-2d-a3-corpus-prep-sol` branch was INSPECTED AS A NEGATIVE
 * REFERENCE ONLY; nothing was copied or cherry-picked from it.
 *
 * It lives in src/test/unit/ for the reason R1's isolation test gives: no file
 * under src/test/firewall/ may change after the methodology branch point.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as caps from '../harness/phase2b2d/a3prep/organisationCaps.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const A3PREP_REL = 'src/test/harness/phase2b2d/a3prep';

/** R15's exact parent: the K4 owner-policy binding's terminal commit. */
const K4_TERMINAL_COMMIT = '135b7935426999dff14963fa8965599b6419ddda';

const THIS_FILE = 'src/test/unit/orgunitCorpus2DA3CanonicalOrganisationCapsIsolation.test.ts';
const R15_AUDIT_NOTE =
  'docs/audits/PHASE_2B_2D_A3_CANONICAL_PREP_R15_SD4_ORGANISATION_SHARE_ENFORCEMENT_V1.md';

const R15_ALLOWED_PATHS = [
  `${A3PREP_REL}/organisationCaps.ts`,
  `${A3PREP_REL}/corpusFreezePreflight.ts`,
  'src/test/unit/orgunitCorpus2DA3CanonicalOrganisationCaps.test.ts',
  THIS_FILE,
  'src/test/unit/orgunitCorpus2DA3CanonicalCorpusFreezePreflight.test.ts',
  'src/test/unit/orgunitCorpus2DA3CanonicalCorpusFreezePreflightIsolation.test.ts',
  // Exact-name widenings of earlier guards that pinned "no organisationCaps.ts".
  'src/test/unit/orgunitCorpus2DA3CanonicalContractsIsolation.test.ts',
  'src/test/unit/orgunitCorpus2DA3CanonicalK4Binding.test.ts',
  'src/test/unit/orgunitCorpus2DA3CanonicalK1K2Binding.test.ts',
  'src/test/unit/orgunitCorpus2DA3CanonicalSetRScoreIsolation.test.ts',
].sort();

/** A comment-only edit of contracts.ts is permitted; see the dedicated test. */
const CONTRACTS = `${A3PREP_REL}/contracts.ts`;

function git(...args: readonly string[]): string {
  return execFileSync('git', ['-C', REPO_ROOT, ...args], { encoding: 'utf8' });
}

function commitExists(commit: string): boolean {
  try {
    execFileSync('git', ['-C', REPO_ROOT, 'cat-file', '-e', `${commit}^{commit}`], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function lines(text: string): string[] {
  return text.split('\n').filter((line) => line.length > 0);
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** Code with comments AND string literals removed: only executable tokens remain. */
function tokensOnly(source: string): string {
  return stripComments(source)
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

function raw(): string {
  return readFileSync(join(REPO_ROOT, A3PREP_REL, 'organisationCaps.ts'), 'utf8');
}

function code(): string {
  return stripComments(raw());
}

function specifiersOf(source: string): string[] {
  const found: string[] = [];
  for (const m of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) found.push(m[1] ?? '');
  for (const m of source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) found.push(m[1] ?? '');
  for (const m of source.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g))
    found.push(m[1] ?? '');
  for (const m of source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) found.push(m[1] ?? '');
  return found.sort();
}

function namedImportsFrom(source: string, specifier: string): string[] {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const found = new RegExp(`import\\s*(?:type\\s*)?\\{([^}]*)\\}\\s*from\\s*'${escaped}'`).exec(
    source,
  );
  return (
    found?.[1]
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .sort() ?? []
  );
}

/** R15's own code commit: the commit that ADDED this file, or null before it exists. */
function r15CodeCommit(): string | null {
  const found = lines(git('log', '--diff-filter=A', '--format=%H', '--', THIS_FILE));
  return found.length === 1 ? found[0]! : null;
}

function changedByR15(): { readonly paths: readonly string[]; readonly committed: boolean } {
  const commit = r15CodeCommit();
  if (commit !== null) {
    return {
      paths: lines(git('diff', '--name-only', K4_TERMINAL_COMMIT, commit)).sort(),
      committed: true,
    };
  }
  const tracked = lines(git('diff', '--name-only', K4_TERMINAL_COMMIT));
  const untracked = lines(git('ls-files', '--others', '--exclude-standard'));
  return { paths: [...new Set([...tracked, ...untracked])].sort(), committed: false };
}

const baseAvailable = commitExists(K4_TERMINAL_COMMIT);

// ---------------------------------------------------------------------------

describe('2D-A3 R15: exact import graph', () => {
  it('imports exactly contracts', () => {
    expect(specifiersOf(code())).toEqual(['./contracts.js']);
  });

  it('reads only split, cap, sample-cap and K4 policy facts from contracts', () => {
    expect(namedImportsFrom(code(), './contracts.js')).toEqual([
      'A3_GATED_SPLITS',
      'G3_EXPECTED_DENOMINATOR_66_ROLE',
      'G3_FREEZE_ORGANISATION_SHARE_POLICY',
      'G3_REALISED_ORGANISATION_SHARE_POLICY',
      'GENERATION_1_SPLIT_ORGANISATION_COUNTS',
      'K4_OWNER_DECISION',
      'ORGANISATION_GATE_SHARE_CAP',
      'ORGANISATION_SHARE_EXACT_RATIO_POLICY',
      'ORGANISATION_SHARE_NUMERATOR_POLICY',
      'ORGANISATION_SHARE_RETAINED_ITEM_POLICY',
      'ORGANISATION_SHARE_TRUNCATION_POLICY',
      'ORGANISATION_SHARE_TRUNCATION_SCOPE',
      'SET_P_MAX_PAGES_PER_ORGANISATION',
      'SET_R_MAX_PAGES_PER_ORGANISATION',
      'type A3GatedSplit',
    ]);
  });

  it('never reaches rank, a sample module, SD7, SD9, the preflight, manifests or hashing', () => {
    const source = code();
    expect(source).not.toMatch(
      /\.\/rank\.js|\.\/setP|\.\/setR|\.\/sd7|\.\/sd9|corpusFreezePreflight|manifestTypes|splitScope|\.\/types\.js/,
    );
    expect(source).not.toMatch(/\.\.\/sd7\/|\.\.\/draw\/|nearDuplicatePairs|jaccard|shingle/i);
    expect(source).not.toMatch(/node:crypto|createHash|digest\(/);
    expect(source).not.toMatch(/rankSetP|rankSetR|prepareSetPSd7|prepareSetRSd7|saltedRank/);
  });
});

describe('2D-A3 R15: pure', () => {
  const FORBIDDEN: readonly RegExp[] = [
    /\bfetch\s*\(/,
    /node:/,
    /\bfs\b|\bos\b/,
    /process\./,
    /Date\.now\s*\(|new Date\s*\(|performance\.now/,
    /Math\.random\s*\(|randomUUID|randomBytes|getRandomValues|crypto/,
    /readFile|writeFile|readdir|createReadStream|createWriteStream|mkdir/,
    /\bPool\b|\bClient\b|\bquery\s*\(/,
    /console\./,
    /anthropic|openai|apollo|classif|provider/i,
    /src\/orgunits|\/cli\/|\/db\/|migrations/,
    /JSON\.stringify|toJSON|serialis|serializ/i,
  ];
  it('holds none of the forbidden capabilities', () => {
    const source = code();
    for (const pattern of FORBIDDEN) expect(source, String(pattern)).not.toMatch(pattern);
  });

  it('names no sealed root and no real corpus location', () => {
    expect(raw()).not.toMatch(/SEALED_ROOT_BY_SPLIT|gen1-dev-confirm|gen1-final-holdout|-sealed/);
    expect(raw()).not.toMatch(/homedir|Developer\//);
  });
});

describe('2D-A3 R15: exact integer arithmetic', () => {
  it('no float literal, no Math.floor / Math.min / Math.round, no parseFloat', () => {
    const t = tokensOnly(raw());
    expect(t).not.toMatch(/\d\.\d|\.\d/);
    expect(t).not.toMatch(/Math\.(floor|min|max|round|ceil|trunc)|parseFloat|toFixed/);
  });

  it('no numeric literal other than 0 and 1 (bigint or not): 10, 12, 8, 4 and 66 are never typed', () => {
    const literals = [...tokensOnly(raw()).matchAll(/\b\d+n?\b/g)].map((m) => m[0]);
    expect([...new Set(literals)].sort()).toEqual(['0', '0n', '1', '1n']);
  });

  it('66 appears only inside the imported role constant name, never as arithmetic', () => {
    const t = tokensOnly(raw());
    expect(t).toMatch(/G3_EXPECTED_DENOMINATOR_66_ROLE/);
    // Every occurrence is inside the role identifier or the commitment's role field name.
    expect(
      t.replace(/G3_EXPECTED_DENOMINATOR_66_ROLE|\bexpectedDenominator66Role\b/g, ''),
    ).not.toMatch(/66/);
  });

  it('the cap is read from contracts as a rational and converted to bigint', () => {
    const t = tokensOnly(raw());
    expect(t).toMatch(/BigInt\(ORGANISATION_GATE_SHARE_CAP\.numerator\)/);
    expect(t).toMatch(/BigInt\(ORGANISATION_GATE_SHARE_CAP\.denominator\)/);
    // Exactly one division, and it is the bigint quota.
    expect(t.match(/[^/*]\/[^/*]/g)).toHaveLength(1);
    expect(t).toMatch(/\(CAP_NUMERATOR \* total\) \/ CAP_DENOMINATOR/);
  });

  it('the structural maxima are derived from the sample caps, never typed', () => {
    const t = tokensOnly(raw());
    expect(t).toMatch(/G1: SET_P_MAX_PAGES_PER_ORGANISATION \+ SET_R_MAX_PAGES_PER_ORGANISATION/);
    expect(t).toMatch(/G2: SET_R_MAX_PAGES_PER_ORGANISATION/);
    expect(t).toMatch(/G4: SET_R_MAX_PAGES_PER_ORGANISATION/);
    expect(t).toMatch(/G5: SET_P_MAX_PAGES_PER_ORGANISATION/);
    expect(t).toMatch(/G6: SET_P_MAX_PAGES_PER_ORGANISATION/);
    expect(t).not.toMatch(/G3:/);
  });

  it('has no arbitrary iteration limit: the only bound is q0 + 1', () => {
    const t = tokensOnly(raw());
    expect(t).not.toMatch(/MAX_ITERATIONS|ITERATION_LIMIT|maxIterations/i);
    expect(t).toMatch(/BigInt\(iterationCount\) > q0 \+ 1n/);
    expect(t).toMatch(/if \(next > current\)/);
  });
});

describe('2D-A3 R15: no ordering, no union rank, no rejected one-pass API', () => {
  it('sorts nothing and compares no string order', () => {
    const t = tokensOnly(raw());
    expect(t).not.toMatch(/\.sort\(|\.toSorted\(|localeCompare|\.reverse\(|Intl\./);
  });

  it('builds no G1 union rank: no SET_P/SET_R merge, min/max sample rank or gold-id order', () => {
    const t = tokensOnly(raw());
    expect(t).not.toMatch(/goldId|unionRank|mergeRank|mergedRank|sampleRank|minRank|maxRank/i);
    expect(t).not.toMatch(/\.concat\(|setPBefore|setRBefore|SET_P_BEFORE|SET_R_BEFORE/);
    // G1 never reaches prefix retention.
    const g1Body = t.slice(t.indexOf('export function checkPlannedNonG3OrganisationShareIdentity'));
    expect(g1Body.slice(0, g1Body.indexOf('\n}\n'))).not.toMatch(
      /applyOrganisationSharePrefixRetention/,
    );
  });

  it('never inspects a caller item: prefix retention only slices', () => {
    const t = tokensOnly(raw());
    const body = t.slice(t.indexOf('export function applyOrganisationSharePrefixRetention'));
    const fn = body.slice(0, body.indexOf('\n}\n'));
    expect(fn).toMatch(/items\.slice\(0, keep\)/);
    expect(fn).toMatch(/items\.slice\(keep\)/);
    expect(fn).not.toMatch(/items\[|\.filter\(|\.find|\.indexOf|\.some\(|\.every\(|\.splice\(/);
  });

  it('carries none of the rejected historical names', () => {
    expect(raw()).not.toMatch(/gateShareIntegerCap|organisationShareViolations|onePass/i);
  });

  it('computes no metric, numerator, bound, correctness or section-K verdict', () => {
    const t = tokensOnly(raw());
    expect(t).not.toMatch(
      /precision|recall|wilson|clopper|cbar|correct|numeratorCount|INADMISSIBLE|VACUOUS|UNIT_PAGE|hardNegative/i,
    );
  });
});

describe('2D-A3 R15: scope and shapes', () => {
  it('exports exactly the solver, prefix retention, planned check, G3 commitment, readiness and their shapes', () => {
    const exported = [
      ...code().matchAll(/export\s+(?:type|class|function|const|interface)\s+(\w+)/g),
    ]
      .map((m) => m[1])
      .sort();
    expect(exported).toEqual(
      [
        'A3G3FreezeOrganisationShareCommitment',
        'A3K4FreezeReadiness',
        'A3K4FreezeReadinessInput',
        'A3OrganisationShareFixedPointSolution',
        'A3OrganisationShareGroup',
        'A3OrganisationSharePrefixRetention',
        'A3OrganisationShareRefusal',
        'A3OrganisationShareRefusalCode',
        'A3OrganisationShareRetainedGroup',
        'A3PlannedNonG3OrganisationShareCheck',
        'A3PlannedNonG3OrganisationShareInput',
        'A3Sd4Gate',
        'A3Sd4NonG3Gate',
        'A3_G3_FREEZE_ORGANISATION_SHARE_COMMITMENT',
        'A3_SD4_NON_G3_GATES',
        'K4_PLANNED_SD4_FREEZE_CLEAR',
        'K4_PLANNED_SD4_FREEZE_REFUSED',
        'PLANNED_SD4_IDENTITY',
        'PLANNED_SD4_WOULD_TRUNCATE',
        'applyOrganisationSharePrefixRetention',
        'checkPlannedNonG3OrganisationShareIdentity',
        'deriveK4FreezeReadiness',
        'solveOrganisationShareGreatestFixedPoint',
      ].sort(),
    );
    const runtime = Object.entries(caps)
      .filter(([, v]) => typeof v === 'function')
      .map(([k]) => k)
      .sort();
    expect(runtime).toEqual([
      'A3OrganisationShareRefusal',
      'applyOrganisationSharePrefixRetention',
      'checkPlannedNonG3OrganisationShareIdentity',
      'deriveK4FreezeReadiness',
      'solveOrganisationShareGreatestFixedPoint',
    ]);
  });

  it('the readiness interface has no field a count vector, denominator, organisation, item or gate list could occupy', () => {
    const t = code();
    const body = t.slice(t.indexOf('export interface A3K4FreezeReadiness {'));
    const fields = [...body.slice(0, body.indexOf('}')).matchAll(/readonly (\w+):/g)].map(
      (m) => m[1],
    );
    expect(fields.sort()).toEqual([
      'blockedNonG3GateCount',
      'checkedNonG3GateCount',
      'g3FreezePolicy',
      'k4DecisionRecordSha256',
      'k4DecisionToken',
      'kind',
      'split',
      'status',
    ]);
  });

  it('the G3 commitment interface has no mask, prefix, denominator or item field', () => {
    const t = code();
    const body = t.slice(t.indexOf('export interface A3G3FreezeOrganisationShareCommitment {'));
    const fields = [...body.slice(0, body.indexOf('}')).matchAll(/readonly (\w+):/g)].map(
      (m) => m[1]!,
    );
    expect(fields).toHaveLength(12);
    for (const f of fields) {
      expect(f).not.toMatch(/mask|prefix|^denominator|items?$|count|predicted/i);
    }
  });

  it('no status token says READY', () => {
    expect(tokensOnly(raw()).replace(/''/g, '')).not.toMatch(/READY/);
    expect(stripComments(raw())).not.toMatch(/'READY'|READY_TO_FREEZE|'NOT_READY'/);
  });
});

// ---------------------------------------------------------------------------

describe.skipIf(!baseAvailable)('2D-A3 R15: lineage and changed surface', () => {
  it('descends from the K4 policy binding’s terminal commit', () => {
    expect(() => git('merge-base', '--is-ancestor', K4_TERMINAL_COMMIT, 'HEAD')).not.toThrow();
  });

  it('is organisationCaps.ts, the evolved preflight, R15’s tests and exact-name widenings (and, uncommitted, its note)', () => {
    const { paths, committed } = changedByR15();
    const allowed = new Set([...R15_ALLOWED_PATHS, CONTRACTS]);
    if (!committed) allowed.add(R15_AUDIT_NOTE);
    for (const path of paths) expect(allowed, path).toContain(path);
    if (committed) {
      expect(paths.filter((p) => p !== CONTRACTS)).toEqual(R15_ALLOWED_PATHS);
    }
  });

  it('changes no other a3prep runtime file, SD7 measurement, firewall, production file, migration or record', () => {
    const { paths } = changedByR15();
    const unchanged = [
      'types.ts',
      'rank.ts',
      'setP.ts',
      'setPSd7.ts',
      'setRScore.ts',
      'setR.ts',
      'setRSd7.ts',
      'setRSd7Readiness.ts',
      'sd7.ts',
      'sd9.ts',
      'splitScope.ts',
      'manifestTypes.ts',
    ].map((f) => `${A3PREP_REL}/${f}`);
    const forbidden = paths.filter(
      (path) =>
        unchanged.includes(path) ||
        path.startsWith('src/test/harness/phase2b2d/sd7/') ||
        path.startsWith('src/test/firewall/') ||
        path.startsWith('src/orgunits/') ||
        path.startsWith('src/cli/') ||
        path.startsWith('src/db/') ||
        path.startsWith('migrations/') ||
        path.startsWith('docs/evaluation/') ||
        path === 'package.json' ||
        path === 'package-lock.json',
    );
    expect(forbidden).toEqual([]);
  });

  it('contracts.ts changes, if at all, in comments only: its executable tokens are byte-identical', () => {
    const commit = r15CodeCommit();
    const before = git('show', `${K4_TERMINAL_COMMIT}:${CONTRACTS}`);
    const after =
      commit === null
        ? readFileSync(join(REPO_ROOT, CONTRACTS), 'utf8')
        : git('show', `${commit}:${CONTRACTS}`);
    const norm = (s: string): string => stripComments(s).replace(/\s+/g, ' ').trim();
    expect(norm(after)).toBe(norm(before));
  });
});
