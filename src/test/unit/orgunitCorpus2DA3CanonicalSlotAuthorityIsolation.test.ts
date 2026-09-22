/**
 * PHASE 2B-2D A3 R17 ISOLATION — `slotAuthority.ts` DECIDES WHICH A2
 * ACQUISITION OF RECORD MAY FEED A3, FROM IN-MEMORY FACTS, AND NOTHING ELSE.
 *
 * By reading the real source of `a3prep/slotAuthority.ts` and the git
 * history, this file proves:
 *
 *   - it imports exactly `./contracts.js` and the A1b `../draw/drawContract.js`
 *     - no A2 continuation machinery, no rank (and so no node:crypto), no
 *     SET_P / SET_R, SD7, SD9, K4 caps, split scope, manifests or preflight;
 *   - it is pure: no IO, directory scan, glob, clock, randomness, environment,
 *     console, database, network, classifier or provider;
 *   - it has no chronological heuristic: nothing sorts facts, and no "latest"
 *     or "newest" selection exists;
 *   - it carries no page, document, set, score, label or diagnostic field on
 *     its authority shapes, and no function converts a diagnostic or a live
 *     result into authority;
 *   - it hardcodes no current Generation-1 count (19 / 1 / 90 / 110 / 45) -
 *     sizes come from the contracts, state comes from facts;
 *   - the corpus-freeze preflight is untouched, does not read it, and still
 *     lists real acquisition completion as not checked;
 *   - R17's changed surface, from the reachable short-text membership
 *     binding's terminal commit to R17's OWN code commit, is this module, its
 *     two tests and the exact-name widening of R1's namespace guard.
 *
 * It lives in src/test/unit/ for the reason R1's isolation test gives: no file
 * under src/test/firewall/ may change after the methodology branch point.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { A3_CORPUS_FREEZE_PREFLIGHT_NOT_CHECKED_BY_CURRENT_PREP } from '../harness/phase2b2d/a3prep/corpusFreezePreflight.js';
import * as slotAuthority from '../harness/phase2b2d/a3prep/slotAuthority.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const A3PREP_REL = 'src/test/harness/phase2b2d/a3prep';

/** R17's exact parent: the reachable short-text membership binding's terminal commit. */
const PARENT_COMMIT = 'b3bd7449496d5acdf00650c596a013ffefe0f8b2';

const THIS_FILE = 'src/test/unit/orgunitCorpus2DA3CanonicalSlotAuthorityIsolation.test.ts';
const R17_AUDIT_NOTE =
  'docs/audits/PHASE_2B_2D_A3_R17_A2_ACQUISITION_OF_RECORD_SLOT_AUTHORITY_V1.md';

const R17_ALLOWED_PATHS = [
  `${A3PREP_REL}/slotAuthority.ts`,
  'src/test/unit/orgunitCorpus2DA3CanonicalSlotAuthority.test.ts',
  THIS_FILE,
  // Exact-name widening of R1's namespace guard.
  'src/test/unit/orgunitCorpus2DA3CanonicalContractsIsolation.test.ts',
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

/** Code with comments AND string literals removed: only executable tokens remain. */
function tokensOnly(source: string): string {
  return stripComments(source)
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

function raw(): string {
  return readFileSync(join(REPO_ROOT, A3PREP_REL, 'slotAuthority.ts'), 'utf8');
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

function interfaceFields(source: string, name: string): string[] {
  const start = source.indexOf(`export interface ${name} `);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const body = source.slice(start);
  return [...body.slice(0, body.indexOf('\n}\n')).matchAll(/readonly (\w+)\??:/g)]
    .map((m) => m[1]!)
    .sort();
}

/** R17's own code commit: the commit that ADDED this file, or null before it exists. */
function r17CodeCommit(): string | null {
  const found = lines(git('log', '--diff-filter=A', '--format=%H', '--', THIS_FILE));
  return found.length === 1 ? found[0]! : null;
}

function changedByR17(): { readonly paths: readonly string[]; readonly committed: boolean } {
  const commit = r17CodeCommit();
  if (commit !== null) {
    return {
      paths: lines(git('diff', '--name-only', PARENT_COMMIT, commit)).sort(),
      committed: true,
    };
  }
  const tracked = lines(git('diff', '--name-only', PARENT_COMMIT));
  const untracked = lines(git('ls-files', '--others', '--exclude-standard'));
  return { paths: [...new Set([...tracked, ...untracked])].sort(), committed: false };
}

const baseAvailable = commitExists(PARENT_COMMIT);

// ---------------------------------------------------------------------------

describe('2D-A3 R17: exact import graph', () => {
  it('imports exactly contracts and the A1b draw contract', () => {
    expect(specifiersOf(code())).toEqual(['../draw/drawContract.js', './contracts.js']);
  });

  it('reads only generation sizes, split facts and the frozen split cycle', () => {
    expect(namedImportsFrom(code(), './contracts.js')).toEqual([
      'GENERATION_1_RESERVE_ORGANISATIONS',
      'GENERATION_1_SELECTED_ORGANISATIONS',
      'GENERATION_1_SPLIT_ORGANISATION_COUNTS',
      'SPLITS',
      'type Split',
    ]);
    expect(namedImportsFrom(code(), '../draw/drawContract.js')).toEqual([
      'GENERATION_ID',
      'SPLIT_ASSIGNMENT_CYCLE_V2_R2',
    ]);
  });

  it('never reaches A2 continuation machinery, rank, a sample module, SD7, SD9, K4, scope, manifests or the preflight', () => {
    const source = code();
    expect(source).not.toMatch(
      /continuationWindow|acquisitionGate|v3transition|\.\.\/transition\//,
    );
    expect(source).not.toMatch(
      /\.\/rank\.js|\.\/setP|\.\/setR|\.\/sd7|\.\/sd9|organisationCaps|corpusFreezePreflight|manifestTypes|splitScope|\.\/types\.js/,
    );
    expect(source).not.toMatch(/\.\.\/sd7\/|nearDuplicatePairs|jaccard|shingle/i);
    expect(source).not.toMatch(/node:crypto|createHash|digest\(/);
  });
});

describe('2D-A3 R17: pure, with no filesystem reader and no chronological heuristic', () => {
  const FORBIDDEN: readonly RegExp[] = [
    /\bfetch\s*\(/,
    /node:/,
    /\bfs\b|\bos\b|\bpath\b\./,
    /process\./,
    /Date\.now\s*\(|new Date\s*\(|Date\.parse|performance\.now/,
    /Math\.random\s*\(|randomUUID|randomBytes|getRandomValues|crypto/,
    /readFile|writeFile|readdir|createReadStream|createWriteStream|mkdir|stat\(/,
    /\bglob\b|globSync|fast-glob|\bminimatch\b/i,
    /\bPool\b|\bClient\b|\bquery\s*\(/,
    /console\./,
    /anthropic|openai|apollo|classif|provider/i,
    /src\/orgunits|\/cli\/|\/db\/|migrations/,
    /execFile|spawn|child_process/,
  ];
  it('holds none of the forbidden capabilities', () => {
    const source = code();
    for (const pattern of FORBIDDEN) expect(source, String(pattern)).not.toMatch(pattern);
  });

  it('parses and serialises nothing (the INTERNAL_NEVER_SERIALISE_PUBLICLY marker is a string, not a call)', () => {
    expect(tokensOnly(raw())).not.toMatch(/JSON\.parse|JSON\.stringify|toJSON|serialis|serializ/i);
  });

  it('sorts nothing and selects no latest / newest / most recent anything', () => {
    const t = tokensOnly(raw());
    expect(t).not.toMatch(/\.sort\(|\.toSorted\(|localeCompare|\.reverse\(/);
    expect(t).not.toMatch(/latest|newest|mostRecent|mtime|birthtime|lastModified/i);
  });

  it('names no sealed root and no real corpus location, and opens nothing it commits to', () => {
    expect(raw()).not.toMatch(
      /SEALED_ROOT_BY_SPLIT|gen1-dev-train|gen1-dev-confirm|gen1-final-holdout|-sealed/,
    );
    expect(raw()).not.toMatch(/homedir|Developer\/|~\//);
  });

  it('hardcodes no current Generation-1 state and no frozen size', () => {
    const t = tokensOnly(raw());
    expect(t).not.toMatch(/\b(?:18|19|90|110|45)\b/);
    // 40 appears exactly once: the full-commit length in its regular expression.
    expect(t.match(/\b40\b/g)).toHaveLength(1);
    expect(t).toMatch(/\[0-9a-f\]\{40\}/);
  });
});

describe('2D-A3 R17: the authority boundary is explicit', () => {
  it('exports exactly the vocabulary, the two resolvers, the summary, the brand check and their shapes', () => {
    const functions = Object.entries(slotAuthority)
      .filter(([, v]) => typeof v === 'function')
      .map(([k]) => k)
      .sort();
    expect(functions).toEqual([
      'A3SlotAuthorityRefusal',
      'deriveGenerationSlotAuthoritySummary',
      'isA3SlotAcquisitionAuthorityReady',
      'resolveCurrentSlotOccupant',
      'resolveGenerationSlotAuthorities',
    ]);
  });

  it('no function converts a diagnostic, a live result or any record into authority', () => {
    const exported = [
      ...code().matchAll(/export\s+(?:type|class|function|const|interface)\s+(\w+)/g),
    ]
      .map((m) => m[1]!)
      .filter((name) => /^[a-z]/.test(name));
    for (const name of exported) {
      expect(name).not.toMatch(/diagnostic|liveResult|promote|convert|from[A-Z]|toReady|latest/i);
    }
  });

  it('the caller supplies no current occupant, no status and no counts', () => {
    expect(interfaceFields(code(), 'A3GenerationSlotAuthorityInput')).toEqual([
      'adjudications',
      'draw',
      'evidenceStatuses',
      'generationId',
      'replacementLedger',
      'reserve',
      'selection',
    ]);
  });

  it('the terminal fact carries the pinned provenance and no diagnostic field', () => {
    expect(interfaceFields(code(), 'A2AdjudicatedAcquisitionFact')).toEqual([
      'acquisitionPolicyTransitionLedger',
      'acquisitionPolicyVersion',
      'adjudication',
      'disposition',
      'factKind',
      'liveResult',
      'runRefSha256',
      'sealedSd7Detail',
    ]);
    expect(interfaceFields(code(), 'A2OccupantReference')).toEqual([
      'drawEntrySha256',
      'generationId',
      'occupantKind',
      'reserveRankPosition',
      'selectionIndex',
      'split',
    ]);
  });

  it('the ledger transition is the canonical ledger entry, field for field', () => {
    expect(interfaceFields(code(), 'A2ReplacementLedgerTransition')).toEqual(
      [
        'selectionIndex',
        'split',
        'replacedEcheRowKey',
        'replacementEcheRowKey',
        'reserveRankPosition',
        'reason',
        'recordedAtUtc',
        'sequence',
        'replacedOccupantKind',
        'previousSequenceForSlot',
        'previousEntryHash',
        'entryHash',
      ].sort(),
    );
  });

  it('the sealed commitment carries a basename and a digest, never a root path', () => {
    expect(interfaceFields(code(), 'A3SealedSd7DetailCommitment')).toEqual([
      'bytes',
      'file',
      'sha256',
      'split',
    ]);
  });

  it('READY carries no page, document, set, score, label or classifier field', () => {
    const fields = interfaceFields(code(), 'A3SlotAcquisitionAuthorityReady');
    for (const field of fields) {
      expect(field).not.toMatch(/page|document|setP|setR|score|label|classif|diagnostic|text/i);
    }
    expect(fields).toContain('runRefSha256');
    expect(fields).toContain('acquisitionPolicyVersion');
    expect(fields).toContain('adjudication');
    expect(fields).toContain('liveResult');
    expect(fields).toContain('sealedSd7Detail');
  });

  it('carries the precise status tokens only - no READY_TO_FREEZE, no A3_COMPLETE', () => {
    expect(raw()).not.toMatch(
      /READY_TO_FREEZE|'A3_COMPLETE'|LIKELY_SUCCESSFUL|DIAGNOSTIC_SUCCESSFUL/,
    );
  });
});

describe('2D-A3 R17: no preflight integration', () => {
  it('the preflight does not read slotAuthority and still lists real acquisition completion as not checked', () => {
    const preflight = readFileSync(join(REPO_ROOT, A3PREP_REL, 'corpusFreezePreflight.ts'), 'utf8');
    expect(preflight).not.toMatch(/slotAuthority/);
    expect(A3_CORPUS_FREEZE_PREFLIGHT_NOT_CHECKED_BY_CURRENT_PREP).toContain(
      'REAL_ACQUISITION_COMPLETION',
    );
  });
});

// ---------------------------------------------------------------------------

describe.skipIf(!baseAvailable)('2D-A3 R17: lineage and changed surface', () => {
  it('descends from the reachable short-text membership binding’s terminal commit', () => {
    expect(() => git('merge-base', '--is-ancestor', PARENT_COMMIT, 'HEAD')).not.toThrow();
  });

  it('is slotAuthority.ts, its two tests and the R1 guard widening (and, uncommitted, its note)', () => {
    const { paths, committed } = changedByR17();
    const allowed = new Set(R17_ALLOWED_PATHS);
    if (!committed) allowed.add(R17_AUDIT_NOTE);
    for (const path of paths) expect(allowed, path).toContain(path);
    if (committed) expect(paths).toEqual(R17_ALLOWED_PATHS);
  });

  it('changes no other a3prep runtime file, A2 record, ledger, draw, harness, firewall, production file or migration', () => {
    const { paths } = changedByR17();
    const forbidden = paths.filter(
      (path) =>
        (path.startsWith(`${A3PREP_REL}/`) && path !== `${A3PREP_REL}/slotAuthority.ts`) ||
        (path.startsWith('src/test/harness/') && !path.startsWith(`${A3PREP_REL}/`)) ||
        path.startsWith('docs/evaluation/') ||
        path.startsWith('src/test/firewall/') ||
        path.startsWith('src/orgunits/') ||
        path.startsWith('src/cli/') ||
        path.startsWith('src/db/') ||
        path.startsWith('migrations/') ||
        path === 'package.json' ||
        path === 'package-lock.json',
    );
    expect(forbidden).toEqual([]);
  });

  it('the R1 guard changed by adding slotAuthority.ts by exact name only', () => {
    const commit = r17CodeCommit();
    const guard = 'src/test/unit/orgunitCorpus2DA3CanonicalContractsIsolation.test.ts';
    const removed = git('diff', PARENT_COMMIT, ...(commit === null ? [] : [commit]), '--', guard)
      .split('\n')
      .filter((l) => l.startsWith('-') && !l.startsWith('---'));
    for (const line of removed) {
      expect(line).toMatch(/R15|organisationCaps\.ts/);
    }
    const now =
      commit === null
        ? readFileSync(join(REPO_ROOT, guard), 'utf8')
        : git('show', `${commit}:${guard}`);
    expect(now).toMatch(/const R17_FILES = \['slotAuthority\.ts'\];/);
    expect(now).toMatch(/const LATER_SLICE_FILES = \['syntheticFixtures\.ts'\];/);
  });
});
