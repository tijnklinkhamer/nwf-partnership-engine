/**
 * PHASE 2B-2D A3 R9 ISOLATION — `corpusFreezePreflight.ts` IS A PURE PARTIAL
 * PREFLIGHT OVER LANDED PREPARATION CONTRACTS, AND NOTHING ELSE.
 *
 * By reading the real source of `a3prep/corpusFreezePreflight.ts` and the git
 * history, this file proves:
 *
 *   - it imports exactly `./contracts.js`, `./sd9.js`, `./setPSd7.js` and
 *     (types only) `./types.js` - never `manifestTypes.ts`, the SD7
 *     measurement modules, a rank primitive, node:crypto or anything that
 *     touches IO;
 *   - it performs no IO, clock, randomness, environment or console use;
 *   - it carries none of the historical preflight's stale shapes: no caller
 *     approval boolean, no free-form reason list, no organisation key, no
 *     naked READY status, no manifest check;
 *   - it emits no semantic short-text verdict token;
 *   - it builds no SET_R and no organisation cap, and adds no K5;
 *   - R9's changed surface, from the short-text policy binding tip to R9's OWN
 *     code commit, is this module, R9's two tests and the R1 namespace
 *     widening; no other a3prep runtime file changes at all.
 *
 * The historical `corpusFreezePreflight.ts` on the non-canonical
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
import * as preflight from '../harness/phase2b2d/a3prep/corpusFreezePreflight.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const A3PREP_REL = 'src/test/harness/phase2b2d/a3prep';

/** R9's exact parent: the short-text membership policy binding's terminal commit. */
const POLICY_TERMINAL_COMMIT = 'fcecc93e69f4108abff34c0c1b6cbe4f21f81501';

const THIS_FILE = 'src/test/unit/orgunitCorpus2DA3CanonicalCorpusFreezePreflightIsolation.test.ts';
const R9_AUDIT_NOTE = 'docs/audits/PHASE_2B_2D_A3_CANONICAL_PREP_R9_CORPUS_FREEZE_PREFLIGHT_V1.md';

const R9_ALLOWED_PATHS = [
  `${A3PREP_REL}/corpusFreezePreflight.ts`,
  'src/test/unit/orgunitCorpus2DA3CanonicalContractsIsolation.test.ts',
  'src/test/unit/orgunitCorpus2DA3CanonicalCorpusFreezePreflight.test.ts',
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
  return readFileSync(join(REPO_ROOT, A3PREP_REL, 'corpusFreezePreflight.ts'), 'utf8');
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

/** R9's own code commit: the commit that ADDED this file, or null before it exists. */
function r9CodeCommit(): string | null {
  const found = lines(git('log', '--diff-filter=A', '--format=%H', '--', THIS_FILE));
  return found.length === 1 ? found[0]! : null;
}

function changedByR9(): { readonly paths: readonly string[]; readonly committed: boolean } {
  const commit = r9CodeCommit();
  if (commit !== null) {
    return {
      paths: lines(git('diff', '--name-only', POLICY_TERMINAL_COMMIT, commit)).sort(),
      committed: true,
    };
  }
  const tracked = lines(git('diff', '--name-only', POLICY_TERMINAL_COMMIT));
  const untracked = lines(git('ls-files', '--others', '--exclude-standard'));
  return { paths: [...new Set([...tracked, ...untracked])].sort(), committed: false };
}

const baseAvailable = commitExists(POLICY_TERMINAL_COMMIT);

// ---------------------------------------------------------------------------

describe('2D-A3 R9: exact import graph', () => {
  it('imports exactly contracts, sd9, setPSd7 and types', () => {
    expect(specifiersOf(code())).toEqual([
      './contracts.js',
      './sd9.js',
      './setPSd7.js',
      './types.js',
    ]);
  });

  it('reads only owner-decision, Generation-1 coverage, split and short-text policy facts from contracts', () => {
    expect(namedImportsFrom(code(), './contracts.js')).toEqual([
      'A3_PREP_OWNER_DECISIONS_REQUIRED',
      'A3_PREP_RESOLVED_OWNER_DECISION_MARKERS',
      'GENERATION_1_SELECTED_ORGANISATIONS',
      'GENERATION_1_SPLIT_ORGANISATION_COUNTS',
      'SHORT_TEXT_ADMISSIBLE_MEMBERSHIP_TREATMENT_SPACE',
      'SHORT_TEXT_BLOCKED_SAMPLE_ACQUISITION_EFFECT',
      'SHORT_TEXT_BLOCKED_SAMPLE_FREEZE_REFUSAL',
      'SHORT_TEXT_BLOCKED_SAMPLE_REPLACEMENT_EFFECT',
      'SHORT_TEXT_SAMPLE_MEMBERSHIP_POLICY',
      'SPLITS',
      'type A3PrepUnresolvedOwnerDecisionMarker',
      'type Split',
    ]);
  });

  it('takes only R3’s bounds classifier from sd9 - never the exact-count path, never a threshold', () => {
    expect(namedImportsFrom(code(), './sd9.js')).toEqual([
      'evaluateSd9FromAdmissiblePostSd7Bounds',
      'type A3Sd9MechanicalStatus',
    ]);
    expect(code()).not.toMatch(/MIN_PAGES_PER_ORGANISATION|evaluateSd9FromExactPostSd7Count/);
    expect(code()).not.toMatch(/>=\s*4\b|<\s*4\b/);
  });

  it('takes only R8’s two cap tokens and its preparation type from setPSd7 - never prepareSetPSd7', () => {
    expect(namedImportsFrom(code(), './setPSd7.js')).toEqual([
      'SET_P_DOCUMENT_CAP_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP',
      'SET_P_DOCUMENT_CAP_EXACT',
      'type A3SetPSd7Preparation',
    ]);
    expect(code()).not.toMatch(/prepareSetPSd7|prepareSd7SampleSurvivors|rankSetPFull/);
  });

  it('reaches types by TYPE import only', () => {
    expect(code()).toMatch(/^import type \{[^}]*\} from '\.\/types\.js';$/m);
  });

  it('never reaches manifestTypes, rank, setP, sd7, splitScope, the SD7 measurement modules or node:crypto', () => {
    const source = code();
    expect(source).not.toMatch(/manifestTypes|\.\/rank\.js|\.\/setP\.js|\.\/sd7\.js|splitScope/);
    expect(source).not.toMatch(/\.\.\/sd7\/|nearDuplicatePairs|normaliseText|tokenShingles/);
    expect(source).not.toMatch(/jaccard|shingle|tokeni[sz]|normalis(e|ation)Text/i);
    expect(source).not.toMatch(/node:crypto|createHash|digest\(/);
  });
});

describe('2D-A3 R9: pure', () => {
  const FORBIDDEN: readonly RegExp[] = [
    /\bfetch\s*\(/,
    /node:/,
    /\bfs\b|\bpath\b|\bos\b/,
    /process\./,
    /Date\.now\s*\(|new Date\s*\(|performance\.now/,
    /Math\.random\s*\(|randomUUID|randomBytes|getRandomValues|crypto/,
    /readFile|writeFile|readdir|createReadStream|createWriteStream|mkdir/,
    /\bPool\b|\bClient\b|\bquery\s*\(/,
    /console\./,
    /anthropic|openai|apollo|classif|provider/i,
    /src\/orgunits|\/cli\/|\/db\/|migrations/,
    /acquisitionGate|continuationWindow|transition|ledger\.json|reserveLedger/i,
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

describe('2D-A3 R9: no stale historical preflight shape survives', () => {
  it('names none of the historical caller approval booleans', () => {
    for (const stale of [
      'setRScoreReductionApproved',
      'organisationShareTruncationApproved',
      'sd7SampleRankSemanticsApproved',
      'setPDeterminismVerified',
      'setRDeterminismVerified',
      'capsVerified',
      'hashInputsComplete',
    ]) {
      expect(raw(), stale).not.toContain(stale);
    }
    expect(code()).not.toMatch(/Approved\b|Verified\b|:\s*boolean/);
  });

  it('carries no free-form reason list, organisation key or naked READY status', () => {
    expect(code()).not.toMatch(/\breasons?\b|organisationKey|organisationId|echeRowKey/);
    expect(code()).not.toMatch(/'READY'|'NOT_READY'|\bREADY\b|READY_TO_FREEZE/);
    expect(code()).not.toMatch(/A3PreflightStatus|checkCorpusFreezePreflight\b/);
  });

  it('checks no manifest - that belongs to a later, final preflight', () => {
    // The one permitted mention is the NOT-checked token that says so.
    const source = code();
    expect(source.match(/'FINAL_MANIFEST_HASHES'/g)).toHaveLength(1);
    expect(source.replace("'FINAL_MANIFEST_HASHES'", '')).not.toMatch(
      /manifest|publicManifest|A3GatedSplitPublicAggregate/i,
    );
  });
});

describe('2D-A3 R9: no semantic short-text verdict, no K5, no SET_R, no organisation cap', () => {
  it('names no verdict token anywhere in the file', () => {
    expect(raw()).not.toMatch(
      /UNIQUE|NEAR_DUPLICATE|ALWAYS_INCLUDE|ALWAYS_EXCLUDE|KEEP_SHORT_TEXT|DROP_SHORT_TEXT/,
    );
    expect(code()).not.toMatch(/'PRESENT'|'ABSENT'|\bPRESENT\b|\bABSENT\b/);
  });

  it('adds no K5 and redefines no K marker', () => {
    expect(raw()).not.toMatch(/\bK5\b|K5_/);
    expect(code()).not.toMatch(/A3_PREP_OWNER_DECISION_REQUIRED:/);
    expect(code()).not.toMatch(/'K1'\s*,|'K2'\s*,|'K4'\s*\]/);
  });

  it('builds no SET_R and no organisation cap', () => {
    expect(code()).not.toMatch(
      /rankSetR|SET_R_(MAX|TIE|PRIMARY)|setR\.|organisationCaps|ORGANISATION_GATE_SHARE_CAP/,
    );
    expect(code()).not.toMatch(/resolvedScore|candidateScore|trackReduction/i);
  });

  it('works on counts and positions only: no page-evidence row, URL, text or document digest', () => {
    expect(code()).not.toMatch(
      /documentSha256|saltedRankSha256|pageEvidence|sourcePageEvidenceIds|\burl\b|mainText|\btitle\b/i,
    );
  });

  it('implements no extension selection and mutates no cursor', () => {
    expect(code()).not.toMatch(
      /\.push\(\s*survivor|cursor\s*\+=|cursor\+\+|advanceCursor|selectExtension/,
    );
  });
});

describe('2D-A3 R9: scope', () => {
  it('exports exactly the two layers, the SD9 helper, the extension check, the ledger, the refusal and their tokens/shapes', () => {
    const exported = [
      ...code().matchAll(/export\s+(?:type|class|function|const|interface)\s+(\w+)/g),
    ]
      .map((m) => m[1])
      .sort();
    expect(exported).toEqual(
      [
        'A3CorpusFreezePreflightRefusal',
        'A3CorpusFreezePreflightRefusalCode',
        'A3CorpusFreezePreflightResult',
        'A3FreezePreflightBlocker',
        'A3FreezePreflightOwnerDecisionBlocker',
        'A3FreezePreflightShortTextBlocker',
        'A3FreezePreflightStructuralBlocker',
        'A3FreezePreflightStructuralCode',
        'A3Sd9ShortTextPolicyBounds',
        'A3Sd9ShortTextPolicyInput',
        'A3SetPExtensionPositionReadiness',
        'A3SetPFreezeSlotReadiness',
        'A3SetPFreezeSlotReadinessInput',
        'A3SetPFullRankReadiness',
        'A3SetPInitialCapReadiness',
        'A3ShortTextCorpusFreezeGateResult',
        'A3_CORPUS_FREEZE_PREFLIGHT_KIND',
        'A3_CORPUS_FREEZE_PREFLIGHT_NOT_CHECKED_BY_R9',
        'A3_CORPUS_FREEZE_PREFLIGHT_R9_BLOCKERS_CLEAR_NOT_FREEZE_AUTHORITY',
        'A3_CORPUS_FREEZE_PREFLIGHT_REFUSED',
        'SET_P_EXTENSION_BLOCKED_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED',
        'SET_P_EXTENSION_POSITION_EXACT',
        'SET_P_EXTENSION_RANK_EXHAUSTED_EXACT',
        'SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_BLOCKED_SHORT_TEXT',
        'SET_P_FULL_SAMPLE_RANK_MEMBERSHIP_EXACT',
        'SET_P_INITIAL_CAP_BLOCKED_SHORT_TEXT_MEMBERSHIP',
        'SET_P_INITIAL_CAP_EXACT',
        'SHORT_TEXT_CORPUS_FREEZE_GATE_CLEAR',
        'SHORT_TEXT_CORPUS_FREEZE_GATE_REFUSED',
        'SHORT_TEXT_CORPUS_FREEZE_GATE_STRUCTURAL_REFUSAL',
        'checkCurrentA3CorpusFreezePreflight',
        'checkSetPExtensionCursorAgainstShortTextBoundary',
        'checkShortTextCorpusFreezeGate',
        'deriveCurrentOwnerDecisionBlockers',
        'deriveSd9BoundsUnderShortTextPolicy',
        'deriveSetPFreezeSlotReadiness',
      ].sort(),
    );
    const runtime = Object.entries(preflight)
      .filter(([, v]) => typeof v === 'function')
      .map(([k]) => k)
      .sort();
    expect(runtime).toEqual([
      'A3CorpusFreezePreflightRefusal',
      'checkCurrentA3CorpusFreezePreflight',
      'checkSetPExtensionCursorAgainstShortTextBoundary',
      'checkShortTextCorpusFreezeGate',
      'deriveCurrentOwnerDecisionBlockers',
      'deriveSd9BoundsUnderShortTextPolicy',
      'deriveSetPFreezeSlotReadiness',
    ]);
  });

  it('every overall result is typed NOT execution authority, and no status says READY', () => {
    expect(preflight.A3_CORPUS_FREEZE_PREFLIGHT_KIND).toBe(
      'A3_CORPUS_FREEZE_PREFLIGHT_NOT_EXECUTION_AUTHORITY',
    );
    expect(preflight.A3_CORPUS_FREEZE_PREFLIGHT_R9_BLOCKERS_CLEAR_NOT_FREEZE_AUTHORITY).toMatch(
      /NOT_FREEZE_AUTHORITY$/,
    );
  });
});

// ---------------------------------------------------------------------------

describe.skipIf(!baseAvailable)('2D-A3 R9: lineage and changed surface', () => {
  it('descends from the short-text policy binding’s terminal commit', () => {
    expect(() => git('merge-base', '--is-ancestor', POLICY_TERMINAL_COMMIT, 'HEAD')).not.toThrow();
  });

  it('is corpusFreezePreflight.ts, R9’s two tests and the namespace widening (and, uncommitted, its note)', () => {
    const { paths, committed } = changedByR9();
    const allowed = new Set(R9_ALLOWED_PATHS);
    if (!committed) allowed.add(R9_AUDIT_NOTE);
    for (const path of paths) expect(allowed, path).toContain(path);
    if (committed) expect(paths).toEqual(R9_ALLOWED_PATHS);
  });

  it('changes no other a3prep file, SD7 measurement, firewall, production file, migration or record', () => {
    const { paths } = changedByR9();
    const forbidden = paths.filter(
      (path) =>
        (path.startsWith(`${A3PREP_REL}/`) && path !== `${A3PREP_REL}/corpusFreezePreflight.ts`) ||
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
});
