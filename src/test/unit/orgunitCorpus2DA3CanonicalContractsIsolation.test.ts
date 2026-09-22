/**
 * PHASE 2B-2D A3 R1 ISOLATION — CONTRACTS AND TYPES, AND NOTHING ELSE.
 *
 * R2 WIDENED THIS FILE DELIBERATELY, BY EXACT NAME: the namespace now holds
 * exactly R1's two files plus R2's `rank.ts` and `setP.ts`, and `node:crypto`
 * is the one bare import the closure may reach - through `rank.ts` only.
 * Every other assertion below is unchanged. R2's own boundaries live in
 * `orgunitCorpus2DA3CanonicalSetPIsolation.test.ts`.
 *
 * R3 WIDENED IT ONCE MORE, BY EXACT NAME, for `sd9.ts` alone. It adds no
 * external module and no bare import to the closure. R3's own boundaries live
 * in `orgunitCorpus2DA3CanonicalSd9Isolation.test.ts`.
 *
 * R4 WIDENED IT A THIRD TIME, BY EXACT NAME, for `splitScope.ts` alone. It
 * adds no external module and no bare import to the closure: the SD7 contract
 * was already in it. `splitScope.ts` is the ONE namespace file permitted to
 * name the `SEALED_ROOT_BY_SPLIT` identifier - it imports it, and still names
 * no root path literal and no home directory. R4's own boundaries live in
 * `orgunitCorpus2DA3CanonicalSplitScopeIsolation.test.ts`.
 *
 * R5 WIDENED IT A FOURTH TIME, BY EXACT NAME, for `manifestTypes.ts` alone.
 * It adds no external module and no bare import to the closure: it reuses
 * R1-R4 modules only, and it names no sealed root. R5's own boundaries live
 * in `orgunitCorpus2DA3CanonicalManifestTypesIsolation.test.ts`.
 *
 * R7 WIDENED IT A FIFTH TIME, BY EXACT NAME, for `sd7.ts` alone. It adds no
 * bare import. It does widen the closure, deliberately and only through
 * `sd7.ts`: that file TYPE-imports R6's canonical graph contract from
 * `sd7/nearDuplicatePairs.ts`, so the static closure now reaches that module
 * and the three pure SD7 measurement modules it imports. The type import is
 * erased at runtime; `sd7.ts` calls none of them. R7's own boundaries live in
 * `orgunitCorpus2DA3CanonicalSd7SurvivorIsolation.test.ts`.
 *
 * R8 WIDENED IT A SIXTH TIME, BY EXACT NAME, for `setPSd7.ts` alone. It adds no
 * bare import and no external module: it composes `setP.ts` and `sd7.ts`, and
 * reaches the R6 graph contract only THROUGH `sd7.ts`'s input type, so `sd7.ts`
 * stays the one namespace file that imports the R6 graph module. R8's own
 * boundaries live in `orgunitCorpus2DA3CanonicalSetPSd7Isolation.test.ts`.
 *
 * R9 WIDENED IT A SEVENTH TIME, BY EXACT NAME, for `corpusFreezePreflight.ts`
 * alone, and removed that name from the later-slice list. It adds no bare
 * import and no external module: it reads `contracts.ts`, `setPSd7.ts` and
 * `sd9.ts` only, and never `manifestTypes.ts`. R9's own boundaries live in
 * `orgunitCorpus2DA3CanonicalCorpusFreezePreflightIsolation.test.ts`.
 *
 * R10 WIDENED IT AN EIGHTH TIME, BY EXACT NAME, for `setRScore.ts` alone. It
 * adds no bare import and no external module: it reads `contracts.ts` and
 * (type-only) `types.ts`, and nothing else. `setR.ts` stays a later slice.
 * R10's own boundaries live in
 * `orgunitCorpus2DA3CanonicalSetRScoreIsolation.test.ts`.
 *
 * R11 WIDENED IT A NINTH TIME, BY EXACT NAME, for `setR.ts` alone, and removed
 * that name from the later-slice list. It adds no bare import and no external
 * module: it reads `contracts.ts`, `rank.ts`, `setRScore.ts` and (type-only)
 * `types.ts`, and reaches `node:crypto` only through `rank.ts`. R11's own
 * boundaries live in `orgunitCorpus2DA3CanonicalSetRIsolation.test.ts`.
 *
 * R12 WIDENED IT A TENTH TIME, BY EXACT NAME, for `setRSd7.ts` alone. It adds
 * no bare import and no external module: it composes `setR.ts` and `sd7.ts`,
 * and reaches the R6 graph contract only THROUGH `sd7.ts`'s input type, so
 * `sd7.ts` stays the one namespace file that imports the R6 graph module.
 * R12's own boundaries live in
 * `orgunitCorpus2DA3CanonicalSetRSd7Isolation.test.ts`.
 *
 * R13 WIDENED IT AN ELEVENTH TIME, BY EXACT NAME, for `setRSd7Readiness.ts`
 * alone. It adds no bare import and no external module: it reads
 * `contracts.ts`, `sd7.ts` (one token), `setRSd7.ts` and (type-only)
 * `types.ts`. R13 also changed `corpusFreezePreflight.ts` at run time (it now
 * reads `setRSd7Readiness.ts`), which adds no file to the namespace. R13's own
 * boundaries live in
 * `orgunitCorpus2DA3CanonicalSetRSd7ReadinessIsolation.test.ts`.
 *
 * R15 WIDENED IT A TWELFTH TIME, BY EXACT NAME, for `organisationCaps.ts`
 * alone, moving it from LATER_SLICE_FILES to R15_FILES. It adds no bare
 * import and no external module: it reads `contracts.ts` only. R15 also
 * changed `corpusFreezePreflight.ts` at run time (it now reads
 * `organisationCaps.ts`), which adds no further file. `syntheticFixtures.ts`
 * stays a later slice. R15's own boundaries live in
 * `orgunitCorpus2DA3CanonicalOrganisationCapsIsolation.test.ts`.
 *
 * By walking the real import graph and source text of
 * `src/test/harness/phase2b2d/a3prep/`, this file proves:
 *
 *   - the namespace holds exactly R1's `contracts.ts` and `types.ts`, R2's
 *     `rank.ts` and `setP.ts`, R3's `sd9.ts`, R4's `splitScope.ts` and R5's
 *     `manifestTypes.ts`, R7's `sd7.ts`, R8's `setPSd7.ts`, R9's
 *     `corpusFreezePreflight.ts`, R10's `setRScore.ts`, R11's `setR.ts`,
 *     R12's `setRSd7.ts`, R13's `setRSd7Readiness.ts` and R15's
 *     `organisationCaps.ts`; the later-slice synthetic fixtures are absent;
 *   - the whole transitive import closure of R1 is pure: no socket, no
 *     fetch(), no database, no filesystem, no child process, no environment
 *     read, no clock, no randomness, no provider or AI SDK;
 *   - R1 reaches only the canonical pure contracts it reuses (the SD7 and A1b
 *     draw contracts) and nothing under src/orgunits/, src/cli/, migrations/,
 *     the classifier/provider runtime or the A2 continuation machinery;
 *   - nothing in R1-R3 names a sealed root; R4's `splitScope.ts` names the
 *     canonical root MAP by import only, and no file names a root path.
 *
 * WHY THIS LIVES IN src/test/unit/ AND NOT src/test/firewall/
 *
 *   The same reason A1, A1b and A3a gave: an existing test asserts that no file
 *   under `src/test/firewall/` changes after the methodology branch point, and
 *   R1 does not move that baseline. It adds no firewall file and edits none.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const A3PREP_DIR = join(REPO_ROOT, 'src/test/harness/phase2b2d/a3prep');

const R1_FILES = ['contracts.ts', 'types.ts'];

/** R2, added by exact name. Nothing else joins the namespace without a new edit here. */
const R2_FILES = ['rank.ts', 'setP.ts'];

/** R3, added by exact name. */
const R3_FILES = ['sd9.ts'];

/** R4, added by exact name. */
const R4_FILES = ['splitScope.ts'];

/** R5, added by exact name. */
const R5_FILES = ['manifestTypes.ts'];

/** R7, added by exact name. */
const R7_FILES = ['sd7.ts'];

/** R8, added by exact name. */
const R8_FILES = ['setPSd7.ts'];

/** R9, added by exact name. */
const R9_FILES = ['corpusFreezePreflight.ts'];

/** R10, added by exact name. */
const R10_FILES = ['setRScore.ts'];

/** R11, added by exact name. */
const R11_FILES = ['setR.ts'];

/** R12, added by exact name. */
const R12_FILES = ['setRSd7.ts'];

/** R13, added by exact name. */
const R13_FILES = ['setRSd7Readiness.ts'];

/** R15, added by exact name. */
const R15_FILES = ['organisationCaps.ts'];

const NAMESPACE_FILES = [
  ...R1_FILES,
  ...R2_FILES,
  ...R3_FILES,
  ...R4_FILES,
  ...R5_FILES,
  ...R7_FILES,
  ...R8_FILES,
  ...R9_FILES,
  ...R10_FILES,
  ...R11_FILES,
  ...R12_FILES,
  ...R13_FILES,
  ...R15_FILES,
].sort();

/** The one namespace file that may name the SEALED_ROOT_BY_SPLIT identifier. */
const ROOT_REFERENCE_FILES = ['splitScope.ts'];

/** Later slices. Their absence is part of what R1 is. */
const LATER_SLICE_FILES = ['syntheticFixtures.ts'];

/** The only modules outside a3prep/ that R1 may reach, transitively. */
const PERMITTED_EXTERNAL_MODULES = [
  'src/test/harness/phase2b2d/draw/drawContract.ts',
  'src/test/harness/phase2b2d/sd7/sd7Contract.ts',
  // R7: reached ONLY through sd7.ts's type import of the canonical R6 graph.
  'src/test/harness/phase2b2d/sd7/jaccard.ts',
  'src/test/harness/phase2b2d/sd7/nearDuplicatePairs.ts',
  'src/test/harness/phase2b2d/sd7/normaliseText.ts',
  'src/test/harness/phase2b2d/sd7/tokenShingles.ts',
];

/** The one namespace file that may reach the R6 graph module, and only by a type import. */
const R6_GRAPH_MODULE_SPECIFIER = '../sd7/nearDuplicatePairs.js';

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function specifiersOf(source: string): string[] {
  const code = stripComments(source);
  const found: string[] = [];
  for (const m of code.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) found.push(m[1] ?? '');
  for (const m of code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) found.push(m[1] ?? '');
  for (const m of code.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) found.push(m[1] ?? '');
  for (const m of code.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) found.push(m[1] ?? '');
  return found;
}

/** Every module R1 reaches, transitively, as repo-relative paths. */
function importClosure(): {
  modules: string[];
  bareSpecifiers: string[];
  bareImporters: Record<string, string[]>;
} {
  const seen = new Set<string>();
  const bare = new Set<string>();
  const bareImporters: Record<string, string[]> = {};
  const queue = NAMESPACE_FILES.map((file) => join(A3PREP_DIR, file));
  while (queue.length > 0) {
    const absolute = queue.shift() as string;
    const rel = relative(REPO_ROOT, absolute);
    if (seen.has(rel)) continue;
    seen.add(rel);
    for (const specifier of specifiersOf(readFileSync(absolute, 'utf8'))) {
      if (specifier.startsWith('.')) {
        queue.push(resolve(dirname(absolute), specifier.replace(/\.js$/, '.ts')));
      } else {
        bare.add(specifier);
        (bareImporters[specifier] ??= []).push(rel);
      }
    }
  }
  return { modules: [...seen].sort(), bareSpecifiers: [...bare].sort(), bareImporters };
}

describe('2D-A3 R1: the a3prep namespace holds exactly R1, R2, R3, R4, R5, R7, R8, R9, R10, R11, R12, R13 and R15', () => {
  it('contains exactly contracts.ts, types.ts, rank.ts, setP.ts, sd9.ts, splitScope.ts, manifestTypes.ts, sd7.ts, setPSd7.ts, corpusFreezePreflight.ts, setRScore.ts, setR.ts, setRSd7.ts, setRSd7Readiness.ts and organisationCaps.ts', () => {
    expect(readdirSync(A3PREP_DIR).sort()).toEqual(NAMESPACE_FILES);
  });

  it('contains no later-slice module', () => {
    for (const file of LATER_SLICE_FILES) {
      expect(existsSync(join(A3PREP_DIR, file)), file).toBe(false);
    }
  });
});

describe('2D-A3 R1: the import closure is pure and bounded', () => {
  const closure = importClosure();

  it('reaches only a3prep, the two canonical pure contracts and (via sd7.ts) the R6 graph module', () => {
    expect(closure.modules).toEqual(
      [
        ...NAMESPACE_FILES.map((f) => `src/test/harness/phase2b2d/a3prep/${f}`),
        ...PERMITTED_EXTERNAL_MODULES,
      ].sort(),
    );
  });

  it('only sd7.ts reaches the R6 graph module, and only by a type import', () => {
    for (const file of NAMESPACE_FILES) {
      const source = readFileSync(join(A3PREP_DIR, file), 'utf8');
      const reaches = specifiersOf(source).includes(R6_GRAPH_MODULE_SPECIFIER);
      expect(reaches, file).toBe(file === 'sd7.ts');
      if (reaches) {
        expect(stripComments(source)).toMatch(
          /^import type \{[^}]*\} from '\.\.\/sd7\/nearDuplicatePairs\.js';$/m,
        );
      }
      expect(
        specifiersOf(source).filter(
          (s) =>
            s.startsWith('../sd7/') &&
            s !== '../sd7/sd7Contract.js' &&
            s !== R6_GRAPH_MODULE_SPECIFIER,
        ),
        file,
      ).toEqual([]);
    }
  });

  it('imports no package, and node:crypto as its only built-in, through rank.ts alone', () => {
    expect(closure.bareSpecifiers).toEqual(['node:crypto']);
    expect(closure.bareImporters['node:crypto']).toEqual([
      'src/test/harness/phase2b2d/a3prep/rank.ts',
    ]);
  });

  it('never reaches src/orgunits, the CLI, migrations, the classifier/provider runtime or A2 machinery', () => {
    for (const module of closure.modules) {
      expect(module.startsWith('src/orgunits/'), module).toBe(false);
      expect(module.startsWith('src/cli/'), module).toBe(false);
      expect(module.startsWith('migrations/'), module).toBe(false);
      expect(module.startsWith('src/db/'), module).toBe(false);
      expect(module.startsWith('src/test/harness/phase2b2d2c/'), module).toBe(false);
      for (const a2 of ['acquisitionGate', 'continuationWindow', 'transition', 'v3transition']) {
        expect(module.startsWith(`src/test/harness/phase2b2d/${a2}/`), module).toBe(false);
      }
    }
  });

  it('no module in the closure performs IO, reads the environment, or uses a clock or randomness', () => {
    const FORBIDDEN: readonly RegExp[] = [
      /\bfetch\s*\(/,
      /process\.env/,
      /Date\.now\s*\(|new Date\s*\(/,
      /Math\.random\s*\(/,
      /readFile|writeFile|readdir|createReadStream|createWriteStream/,
      /\bPool\b|\bClient\b|\bquery\s*\(/,
      /anthropic|openai|apollo/i,
    ];
    for (const module of closure.modules) {
      const code = stripComments(readFileSync(join(REPO_ROOT, module), 'utf8'));
      for (const pattern of FORBIDDEN) expect(code, `${module} ${pattern}`).not.toMatch(pattern);
    }
  });

  it('R1-R11 name no sealed-split path; only splitScope.ts names the root map', () => {
    for (const file of NAMESPACE_FILES) {
      const code = stripComments(readFileSync(join(A3PREP_DIR, file), 'utf8'));
      if (!ROOT_REFERENCE_FILES.includes(file)) {
        expect(code, file).not.toMatch(/SEALED_ROOT_BY_SPLIT/);
      }
      expect(code, file).not.toMatch(/gen1-dev-confirm|gen1-final-holdout|-sealed/);
      expect(code, file).not.toMatch(/homedir|Developer\//);
    }
  });

  it('importing the R1 modules at runtime has no observable side effect', async () => {
    const envBefore = JSON.stringify(process.env);
    const contracts = await import('../harness/phase2b2d/a3prep/contracts.js');
    await import('../harness/phase2b2d/a3prep/types.js');
    expect(JSON.stringify(process.env)).toBe(envBefore);
    expect(Object.isFrozen(contracts.A3_PREP_OWNER_DECISIONS_REQUIRED)).toBe(true);
  });
});
