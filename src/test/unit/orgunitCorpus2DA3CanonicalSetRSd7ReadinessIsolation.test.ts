/**
 * PHASE 2B-2D A3 R13 ISOLATION — `setRSd7Readiness.ts` DERIVES MEMBERSHIP
 * CONSEQUENCES FROM ONE R12 PREPARATION, AND NOTHING ELSE.
 *
 * By reading the real source of `a3prep/setRSd7Readiness.ts` and the git
 * history, this file proves:
 *
 *   - `setRSd7Readiness.ts` imports exactly `./contracts.js`, `./sd7.js` (one
 *     token), `./setRSd7.js` (the kind token and types) and (types only)
 *     `./types.js` - no score module, no SET_R rank, no rank primitive, no
 *     hash, no R6 graph, no SD9, no preflight, no production code;
 *   - it never calls R12's composition, R11's rank, R7's walk or R10's score
 *     reduction, and reads no score or score provenance;
 *   - it owns no sort, hash, graph traversal, treatment enumeration or
 *     short-text verdict;
 *   - it evaluates no SD9, answers no K4, truncates no organisation share and
 *     selects no extension;
 *   - it performs no IO, clock, randomness, environment or console use;
 *   - R13's changed surface, from R12's terminal commit to R13's OWN code
 *     commit (the commit that added this file), is `setRSd7Readiness.ts`, the
 *     evolved `corpusFreezePreflight.ts`, R13's two new tests, the expanded
 *     preflight tests and two exact-name widenings (namespace, K1/K2 export
 *     guard); no other a3prep runtime file changes at all.
 *
 * It lives in src/test/unit/ for the reason R1's isolation test gives: no file
 * under src/test/firewall/ may change after the methodology branch point.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as readiness from '../harness/phase2b2d/a3prep/setRSd7Readiness.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const A3PREP_REL = 'src/test/harness/phase2b2d/a3prep';

/** R13's exact parent: R12's terminal commit. */
const R12_TERMINAL_COMMIT = '89583929979691870629f8f12ff6bd563ee5340f';

const THIS_FILE = 'src/test/unit/orgunitCorpus2DA3CanonicalSetRSd7ReadinessIsolation.test.ts';
const R13_AUDIT_NOTE =
  'docs/audits/PHASE_2B_2D_A3_CANONICAL_PREP_R13_SET_R_CAP_FREEZE_READINESS_V1.md';

const R13_ALLOWED_PATHS = [
  `${A3PREP_REL}/setRSd7Readiness.ts`,
  `${A3PREP_REL}/corpusFreezePreflight.ts`,
  'src/test/unit/orgunitCorpus2DA3CanonicalContractsIsolation.test.ts',
  'src/test/unit/orgunitCorpus2DA3CanonicalK1K2Binding.test.ts',
  'src/test/unit/orgunitCorpus2DA3CanonicalCorpusFreezePreflight.test.ts',
  'src/test/unit/orgunitCorpus2DA3CanonicalCorpusFreezePreflightIsolation.test.ts',
  'src/test/unit/orgunitCorpus2DA3CanonicalSetRSd7Readiness.test.ts',
  THIS_FILE,
].sort();

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

function raw(): string {
  return readFileSync(join(REPO_ROOT, A3PREP_REL, 'setRSd7Readiness.ts'), 'utf8');
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

/** R13's own code commit: the commit that ADDED this file, or null before it exists. */
function r13CodeCommit(): string | null {
  const found = lines(git('log', '--diff-filter=A', '--format=%H', '--', THIS_FILE));
  return found.length === 1 ? found[0]! : null;
}

function changedByR13(): { readonly paths: readonly string[]; readonly committed: boolean } {
  const commit = r13CodeCommit();
  if (commit !== null) {
    return {
      paths: lines(git('diff', '--name-only', R12_TERMINAL_COMMIT, commit)).sort(),
      committed: true,
    };
  }
  const tracked = lines(git('diff', '--name-only', R12_TERMINAL_COMMIT));
  const untracked = lines(git('ls-files', '--others', '--exclude-standard'));
  return { paths: [...new Set([...tracked, ...untracked])].sort(), committed: false };
}

const baseAvailable = commitExists(R12_TERMINAL_COMMIT);

// ---------------------------------------------------------------------------

describe('2D-A3 R13: exact import graph', () => {
  it('imports exactly contracts, sd7, setRSd7 and types', () => {
    expect(specifiersOf(code())).toEqual([
      './contracts.js',
      './sd7.js',
      './setRSd7.js',
      './types.js',
    ]);
  });

  it('reads only the K3 procedure, the SET_R cap, the split list and the split type from contracts', () => {
    expect(namedImportsFrom(code(), './contracts.js')).toEqual([
      'K3_SD7_SURVIVOR_PROCEDURE',
      'SET_R_MAX_PAGES_PER_ORGANISATION',
      'SPLITS',
      'type Split',
    ]);
  });

  it('takes only the unresolved short-text token from sd7 - never the walk', () => {
    expect(namedImportsFrom(code(), './sd7.js')).toEqual([
      'SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED',
    ]);
    expect(code()).not.toMatch(/prepareSd7SampleSurvivors/);
  });

  it('takes only the preparation kind token and two types from setRSd7 - never prepareSetRSd7', () => {
    expect(namedImportsFrom(code(), './setRSd7.js')).toEqual([
      'A3_SET_R_SD7_PREPARATION_NOT_REAL_CORPUS',
      'type A3SetRMeasurableSurvivorRankedDocument',
      'type A3SetRSd7Preparation',
    ]);
    expect(code()).not.toMatch(/prepareSetRSd7\s*\(/);
  });

  it('reaches types by TYPE import only', () => {
    expect(code()).toMatch(/^import type \{[^}]*\} from '\.\/types\.js';$/m);
  });

  it('imports no score module, SET_R rank, rank primitive, R6 graph, SD9, preflight, SET_P or manifest module', () => {
    expect(code()).not.toMatch(
      /\.\/(setRScore|setR|rank|sd9|corpusFreezePreflight|setP|setPSd7|splitScope|manifestTypes)\.js/,
    );
    expect(code()).not.toMatch(/\.\.\/sd7\/|nearDuplicatePairs|measureNearDuplicateGraph/);
  });
});

describe('2D-A3 R13: no score, hash, graph walk or treatment enumeration', () => {
  it('reads no score or score provenance', () => {
    expect(code()).not.toMatch(
      /resolvedScoreDecimal|resolvedScore|scorePreparation|candidateScore|candidateObservations|sourceRowScores|trackScores|sourcePageEvidenceIds|compareNumeric84Decimal|canonicaliseNumeric84Decimal|prepareSetRDocumentScore/,
    );
  });

  it('owns no hashing, no salted-key construction and no rank call', () => {
    expect(code()).not.toMatch(
      /createHash|digest\(|sha256Utf8Exact|prefixedDocumentRankHash|SET_R_TIE_BREAK|rankSetRFull|rankSetPFull/,
    );
  });

  it('owns no sort, and no search by value', () => {
    expect(code()).not.toMatch(
      /\.sort\(|toSorted|localeCompare|\.find\(|\.findIndex\(|\.indexOf\(/,
    );
  });

  it('walks no graph and reads no text', () => {
    expect(code()).not.toMatch(/\.edges\b|aIndex|bIndex|adjacen|neighbour|measurableIndices/);
    expect(code()).not.toMatch(
      /\bgraph\b|jaccard|similarity|shingle|tokeni[sz]|mainText|\.text\b/i,
    );
  });

  it('enumerates no treatment: no 2^k loop, no PRESENT/ABSENT treatment value', () => {
    expect(code()).not.toMatch(/<<|\*\*|Math\.pow|mask|subset|powerset/i);
    expect(code()).not.toMatch(/'PRESENT|'ABSENT|\bPRESENT\b|\bABSENT\b/);
  });

  it('carries no semantic short-text verdict', () => {
    expect(raw()).not.toMatch(
      /UNIQUE|NEAR_DUPLICATE|ALWAYS_INCLUDE|ALWAYS_EXCLUDE|KEEP_SHORT_TEXT|DROP_SHORT_TEXT/,
    );
  });
});

describe('2D-A3 R13: no SD9, no K4, no organisation cap, no extension selection', () => {
  it('evaluates no SD9', () => {
    expect(code()).not.toMatch(/evaluateSd9|MIN_PAGES_PER_ORGANISATION|ACQUISITION_|sd9/i);
  });

  it('answers no K4 and truncates no organisation share', () => {
    expect(code()).not.toMatch(/\bK4\b|K4_|G3_FREEZE|ORGANISATION_GATE_SHARE_CAP|organisationCaps/);
  });

  it('selects no extension and moves no cursor', () => {
    expect(code()).not.toMatch(/cursor\s*\+=|cursor\+\+|advanceCursor|selectExtension|\.push\(/);
  });

  it('names the cap only through the frozen contract constant', () => {
    expect(code()).not.toMatch(/\bslice\(0,\s*4\)|\[3\]|\b4\b/);
    expect(code()).toMatch(/survivors\[SET_R_MAX_PAGES_PER_ORGANISATION - 1\]/);
    expect(code()).toMatch(/survivors\.slice\(0, SET_R_MAX_PAGES_PER_ORGANISATION\)/);
  });

  it('works at document identity only: no page-evidence row, URL, organisation or gold id', () => {
    expect(code()).not.toMatch(
      /pageEvidence|\burl\b|representative|goldId|itemId|label|organisationId|echeRowKey/i,
    );
  });

  it('the blocked cap shape declares no document list under any name', () => {
    const shape = /export interface A3SetRDocumentCapBlocked \{([\s\S]*?)\n\}/.exec(code())?.[1];
    expect(shape).toBeDefined();
    expect(shape).not.toMatch(/documents|survivors|selected|capped|Sha256|readonly .*\[\]/);
  });

  it('the readiness shape declares no identity, digest or score', () => {
    const shape = /export interface A3SetRFreezeSlotReadiness \{([\s\S]*?)\n\}/.exec(code())?.[1];
    expect(shape).toBeDefined();
    expect(shape).not.toMatch(/Sha256|digest|score|pageEvidence|url|documents/i);
  });
});

describe('2D-A3 R13: pure', () => {
  const FORBIDDEN: readonly RegExp[] = [
    /\bfetch\s*\(/,
    /node:/,
    /process\./,
    /Date\.now\s*\(|new Date\s*\(|performance\.now/,
    /Math\.random\s*\(|randomUUID|randomBytes|getRandomValues|crypto/,
    /readFile|writeFile|readdir|createReadStream|createWriteStream|mkdir/,
    /\bPool\b|\bClient\b|\bquery\s*\(/,
    /console\./,
    /anthropic|openai|apollo|classif|provider/i,
    /src\/orgunits|\/cli\/|\/db\/|migrations/,
  ];
  it('holds none of the forbidden capabilities', () => {
    const source = code();
    for (const pattern of FORBIDDEN) expect(source, String(pattern)).not.toMatch(pattern);
  });

  it('names no sealed root', () => {
    expect(raw()).not.toMatch(/SEALED_ROOT_BY_SPLIT|gen1-dev-confirm|gen1-final-holdout|-sealed/);
  });
});

describe('2D-A3 R13: scope', () => {
  it('exports exactly the cap, readiness, extension and K3-binding surface', () => {
    const exported = [
      ...code().matchAll(/export\s+(?:type|class|function|const|interface)\s+(\w+)/g),
    ]
      .map((m) => m[1])
      .sort();
    expect(exported).toEqual(
      [
        'A3SetRDocumentCap',
        'A3SetRDocumentCapBlocked',
        'A3SetRDocumentCapExact',
        'A3SetRDocumentCapExactReason',
        'A3SetRExtensionPositionReadiness',
        'A3SetRFreezeSlotReadiness',
        'A3SetRFreezeSlotReadinessInput',
        'A3SetRFreezeSlotReadinessStructuralCode',
        'A3SetRFullRankReadiness',
        'A3SetRInitialCapReadiness',
        'A3SetRSd7ReadinessRefusal',
        'A3SetRSd7ReadinessRefusalCode',
        'A3_SET_R_FREEZE_SLOT_READINESS_SANITISED',
        'SET_R_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP',
        'SET_R_DOCUMENT_CAP_EXACT',
        'SET_R_DOCUMENT_CAP_EXACTNESS_REQUIRES_PROCEDURE',
        'SET_R_EXTENSION_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED',
        'SET_R_EXTENSION_POSITION_EXACT',
        'SET_R_EXTENSION_RANK_EXHAUSTED_EXACT',
        'SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT',
        'SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT',
        'SET_R_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP',
        'SET_R_INITIAL_CAP_EXACT',
        'checkSetRExtensionCursorAgainstShortTextBoundary',
        'deriveSetRFreezeSlotReadiness',
        'determineSetRDocumentCap',
        'structuralIssueOfSetRFreezeSlotReadiness',
      ].sort(),
    );
    const runtime = Object.entries(readiness)
      .filter(([, v]) => typeof v === 'function')
      .map(([k]) => k)
      .sort();
    expect(runtime).toEqual([
      'A3SetRSd7ReadinessRefusal',
      'checkSetRExtensionCursorAgainstShortTextBoundary',
      'deriveSetRFreezeSlotReadiness',
      'determineSetRDocumentCap',
      'structuralIssueOfSetRFreezeSlotReadiness',
    ]);
  });

  it('binds the cap proof to GREEDY at compile time and at run time', () => {
    const source = code();
    expect(source).toMatch(
      /const K3_PROCEDURE_IS_THE_PROVED_ONE: typeof SET_R_DOCUMENT_CAP_EXACTNESS_REQUIRES_PROCEDURE =\s*K3_SD7_SURVIVOR_PROCEDURE;/,
    );
    expect(source).toMatch(
      /preparation\.sd7Preparation\.survivorProcedure !==\s*SET_R_DOCUMENT_CAP_EXACTNESS_REQUIRES_PROCEDURE/,
    );
  });

  it('declares SET_R-specific token values, distinct from every SET_P readiness token', () => {
    for (const name of [
      'SET_R_INITIAL_CAP_EXACT',
      'SET_R_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP',
      'SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT',
      'SET_R_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT',
      'SET_R_EXTENSION_POSITION_EXACT',
    ] as const) {
      expect(readiness[name]).toBe(name);
    }
  });
});

// ---------------------------------------------------------------------------

describe.skipIf(!baseAvailable)('2D-A3 R13: lineage and changed surface', () => {
  it('descends from R12’s terminal commit', () => {
    expect(() => git('merge-base', '--is-ancestor', R12_TERMINAL_COMMIT, 'HEAD')).not.toThrow();
  });

  it('is the R13 module, the evolved preflight, R13’s tests and two exact-name widenings (and, uncommitted, its note)', () => {
    const { paths, committed } = changedByR13();
    const allowed = new Set(R13_ALLOWED_PATHS);
    if (!committed) allowed.add(R13_AUDIT_NOTE);
    for (const path of paths) expect(allowed, path).toContain(path);
    if (committed) expect(paths).toEqual(R13_ALLOWED_PATHS);
  });

  it('changes no other a3prep runtime file, SD7 measurement, firewall, production file, migration or record', () => {
    const { paths } = changedByR13();
    const unchanged = [
      'contracts.ts',
      'types.ts',
      'rank.ts',
      'setP.ts',
      'setPSd7.ts',
      'setRScore.ts',
      'setR.ts',
      'setRSd7.ts',
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

  it('the two widened tests changed by adding R13 by exact name only', () => {
    const commit = r13CodeCommit();
    const at = (path: string): string =>
      commit === null
        ? readFileSync(join(REPO_ROOT, path), 'utf8')
        : git('show', `${commit}:${path}`);
    const removed = (path: string): string[] =>
      git('diff', R12_TERMINAL_COMMIT, ...(commit === null ? [] : [commit]), '--', path)
        .split('\n')
        .filter((l) => l.startsWith('-') && !l.startsWith('---'));

    const contractsIsolation = 'src/test/unit/orgunitCorpus2DA3CanonicalContractsIsolation.test.ts';
    expect(at(contractsIsolation)).toMatch(/const R13_FILES = \['setRSd7Readiness\.ts'\];/);
    expect(at(contractsIsolation)).toMatch(
      /const LATER_SLICE_FILES = \['organisationCaps\.ts', 'syntheticFixtures\.ts'\];/,
    );
    for (const line of removed(contractsIsolation)) {
      expect(line).toMatch(/R1[0-2]|setRSd7\.ts|\]\.sort\(\);/);
    }

    const k1k2 = 'src/test/unit/orgunitCorpus2DA3CanonicalK1K2Binding.test.ts';
    expect(at(k1k2)).toMatch(/R13_AUTHORISED_SET_R_READINESS_EXPORTS/);
    for (const line of removed(k1k2)) {
      expect(line).toMatch(/R10|R11|R12|setR|f !==|\)\) \{/);
    }
  });
});
