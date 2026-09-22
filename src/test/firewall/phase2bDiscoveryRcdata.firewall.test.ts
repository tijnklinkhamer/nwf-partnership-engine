/**
 * FETCH POLICY v6 - THE ISOLATION TEST FOR THE DISCOVERY RCDATA HYGIENE REPAIR.
 *
 * Owner decisions AUTHORISE_A2_DISCOVERY_RCDATA_MARKUP_HYGIENE_REPAIR_IMPLEMENTATION_V1
 * and APPROVE_FETCH_POLICY_V6_FOR_RCDATA_DISCOVERY_HYGIENE_V1
 * (docs/evaluation/PHASE_2B_2D_A2_DISCOVERY_RCDATA_FETCH_POLICY_V6_REPAIR_V1.json).
 *
 * Per the phase-isolation decision, this repair is pinned by its OWN
 * repair-scope file over its OWN commit range; no older firewall was widened
 * (the v5 file already reads its own terminal commit). It proves, from the
 * real git range and the real source:
 *
 *   - exactly three production files changed, by exact path, none new;
 *   - no migration, no dependency, no gateway / robots / retry / budget /
 *     root-runner / page-evidence / CLI / classifier / SD7 / corpus change;
 *   - `extractPage`, `stripNonContent` and `REMOVABLE_TAGS` are byte-identical
 *     to v5, so page evidence is untouched;
 *   - the discovery sanitiser is ONE helper layered on `stripNonContent`,
 *     scoped to exactly title and textarea, and both anchor-side extractors
 *     use it - with no second pipeline in anchors.ts;
 *   - every other v5 anchor/base function and pattern is byte-identical, and
 *     no character-reference decoder was added;
 *   - `FETCH_POLICY_VERSION` is `orgunit-fetch-policy-v6`, declared once,
 *     while the v5 terminal commit still reads v5 WITHOUT the fix;
 *   - no pre-existing evaluation record, freeze or ledger was edited.
 *
 * THE RANGE IS REPAIR_BASE_COMMIT..REPAIR_TERMINAL_COMMIT. It is open to the
 * working tree only while the implementation is being written, and is pinned
 * to the implementation commit as soon as that commit exists.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** The v5 terminal commit (v5 implementation record); this repair starts here. */
const REPAIR_BASE_COMMIT = '05645a619e63ae478a58176a92a78ef45826b292';

/**
 * The commit this repair ENDS at: the v6 implementation. Pinned immediately
 * after it landed, so a later phase is never judged against this repair's
 * authorised surface.
 */
const REPAIR_TERMINAL_COMMIT: string | null = 'ec792568fa7ec4764a04499e78a416207d07aa1f';

const AUTHORISED_PRODUCTION_FILES = [
  'src/orgunits/orchestrator/anchors.ts',
  'src/orgunits/web/extract.ts',
  'src/orgunits/web/policy.ts',
];

const PRODUCTION_PREFIXES = [
  'src/orgunits/',
  'src/cli/',
  'src/db/',
  'src/ingest/',
  'src/website/',
  'src/compare/',
  'src/config/',
  'migrations/',
  'scripts/',
];

const FORBIDDEN_PRODUCTION_FILES = [
  'src/orgunits/web/gateway.ts',
  'src/orgunits/web/robots.ts',
  'src/orgunits/web/retryPolicy.ts',
  'src/orgunits/web/observations.ts',
  'src/orgunits/web/redirect.ts',
  'src/orgunits/web/robotsAuthority.ts',
  'src/orgunits/web/robotsPolicy.ts',
  'src/orgunits/web/url.ts',
  'src/orgunits/web/hostPolicy.ts',
  'src/orgunits/web/address.ts',
  'src/orgunits/web/authority.ts',
  'src/orgunits/web/pageEvidence.ts',
  'src/orgunits/web/charset.ts',
  'src/orgunits/web/redact.ts',
  'src/orgunits/web/evidenceCanonical.ts',
  'src/orgunits/sitemap.ts',
  'src/orgunits/orchestrator/rootRunner.ts',
  'src/orgunits/orchestrator/circuitBreaker.ts',
  'src/orgunits/orchestrator/constants.ts',
  'src/orgunits/orchestrator/orchestrate.ts',
  'src/orgunits/orchestrator/frontier.ts',
  'src/orgunits/orchestrator/candidates.ts',
  'src/orgunits/orchestrator/pageCollection.ts',
  'src/orgunits/orchestrator/requestBudget.ts',
  'src/orgunits/orchestrator/run.ts',
];

const FORBIDDEN_PREFIXES = [
  'src/orgunits/classify/',
  'src/orgunits/signals/',
  'src/cli/',
  'src/db/',
  'src/ingest/',
  'migrations/',
  'src/test/harness/phase2b2d/',
  'docs/evaluation/corpus/',
];

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

const rangeAvailable =
  commitExists(REPAIR_BASE_COMMIT) &&
  (REPAIR_TERMINAL_COMMIT === null || commitExists(REPAIR_TERMINAL_COMMIT));

const range = (): string[] =>
  REPAIR_TERMINAL_COMMIT === null
    ? [REPAIR_BASE_COMMIT]
    : [REPAIR_BASE_COMMIT, REPAIR_TERMINAL_COMMIT];

function changedInRepair(...paths: readonly string[]): string[] {
  const tracked = execFileSync(
    'git',
    ['-C', REPO_ROOT, 'diff', '--name-only', ...range(), '--', ...paths],
    { encoding: 'utf8' },
  );
  const untracked =
    REPAIR_TERMINAL_COMMIT === null
      ? execFileSync(
          'git',
          ['-C', REPO_ROOT, 'ls-files', '--others', '--exclude-standard', '--', ...paths],
          { encoding: 'utf8' },
        )
      : '';
  return [...new Set(`${tracked}\n${untracked}`.split('\n').filter((l) => l.length > 0))].sort();
}

function sourceOf(path: string): string {
  if (REPAIR_TERMINAL_COMMIT === null) return readFileSync(join(REPO_ROOT, path), 'utf8');
  return execFileSync('git', ['-C', REPO_ROOT, 'show', `${REPAIR_TERMINAL_COMMIT}:${path}`], {
    encoding: 'utf8',
  });
}

function sourceAtV5(path: string): string {
  return execFileSync('git', ['-C', REPO_ROOT, 'show', `${REPAIR_BASE_COMMIT}:${path}`], {
    encoding: 'utf8',
  });
}

function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** The full text of one (exported or local) function: signature through its closing brace. */
function functionText(source: string, name: string): string {
  let start = source.indexOf(`export function ${name}(`);
  if (start === -1) start = source.indexOf(`function ${name}(`);
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  const end = source.indexOf('\n}\n', start);
  return source.slice(start, end + 2);
}

const line = (source: string, decl: string) => source.split('\n').find((l) => l.startsWith(decl));

const ANCHORS = 'src/orgunits/orchestrator/anchors.ts';
const EXTRACT = 'src/orgunits/web/extract.ts';
const POLICY = 'src/orgunits/web/policy.ts';

describe('v6 repair scope: exactly three production files, by exact path', () => {
  it.skipIf(!rangeAvailable)('changed no production file outside the authorised three', () => {
    const production = changedInRepair().filter((file) =>
      PRODUCTION_PREFIXES.some((prefix) => file.startsWith(prefix)),
    );
    expect(production).toEqual([...AUTHORISED_PRODUCTION_FILES].sort());
  });

  it.skipIf(!rangeAvailable)('changed all three - this is not a vacuous range', () => {
    const changed = changedInRepair();
    for (const file of AUTHORISED_PRODUCTION_FILES) expect(changed).toContain(file);
  });

  it.skipIf(!rangeAvailable)('added no migration and no dependency', () => {
    expect(changedInRepair('migrations')).toEqual([]);
    expect(changedInRepair('package.json', 'package-lock.json')).toEqual([]);
  });

  it.skipIf(!rangeAvailable)(
    'left the gateway, robots, retry, budgets, root runner and page evidence untouched',
    () => {
      const changed = changedInRepair();
      for (const file of FORBIDDEN_PRODUCTION_FILES) expect(changed).not.toContain(file);
    },
  );

  it.skipIf(!rangeAvailable)(
    'changed no classifier, signals, CLI, db, ingest, SD7/corpus harness or corpus artifact',
    () => {
      for (const file of changedInRepair()) {
        for (const prefix of FORBIDDEN_PREFIXES) {
          expect(file.startsWith(prefix), file).toBe(false);
        }
      }
    },
  );
});

describe('v6 repair scope: page-evidence extraction is byte-identical to v5', () => {
  it.skipIf(!rangeAvailable)('extractPage, stripNonContent and stripElement did not move', () => {
    for (const name of ['extractPage', 'stripNonContent', 'stripElement', 'extractTitle']) {
      expect(functionText(sourceOf(EXTRACT), name), name).toBe(
        functionText(sourceAtV5(EXTRACT), name),
      );
    }
  });

  it.skipIf(!rangeAvailable)('REMOVABLE_TAGS was NOT widened', () => {
    expect(line(sourceOf(EXTRACT), 'const REMOVABLE_TAGS')).toBe(
      line(sourceAtV5(EXTRACT), 'const REMOVABLE_TAGS'),
    );
    expect(line(sourceOf(EXTRACT), 'const REMOVABLE_TAGS')).not.toMatch(/title|textarea/);
  });

  it('extractPage does not use the discovery sanitiser', () => {
    expect(functionText(sourceOf(EXTRACT), 'extractPage')).not.toContain('stripNonNavigableMarkup');
  });
});

describe('v6 repair scope: ONE layered discovery sanitiser, scoped to title and textarea', () => {
  it('stripNonNavigableMarkup composes stripNonContent, then exactly title and textarea', () => {
    const source = sourceOf(EXTRACT);
    const helper = codeOf(functionText(source, 'stripNonNavigableMarkup'));
    expect(helper).toContain('let result = stripNonContent(html);');
    expect(helper).toContain('result = stripElement(result, tag);');
    expect(line(source, 'const RCDATA_DISCOVERY_TAGS')).toBe(
      "const RCDATA_DISCOVERY_TAGS = ['title', 'textarea'];",
    );
  });

  it('both anchor-side extractors read the discovery sanitiser, and nothing else in anchors.ts', () => {
    const code = codeOf(sourceOf(ANCHORS));
    for (const name of ['extractDiscoveryAnchors', 'extractDocumentBaseHref']) {
      expect(codeOf(functionText(sourceOf(ANCHORS), name)), name).toContain(
        'const contentOnly = stripNonNavigableMarkup(html);',
      );
    }
    expect(code.match(/stripNonNavigableMarkup\(/g)).toHaveLength(2);
    expect(code).not.toMatch(/stripNonContent\(/);
    // No second, private pipeline: anchors.ts names neither RCDATA element.
    expect(code).not.toMatch(/<title|<textarea|'title'|'textarea'/i);
  });

  it.skipIf(!rangeAvailable)(
    'the two extractors differ from v5 ONLY by the sanitiser they call',
    () => {
      for (const name of ['extractDiscoveryAnchors', 'extractDocumentBaseHref']) {
        const v6 = codeOf(functionText(sourceOf(ANCHORS), name)).replace(/\s+/g, ' ');
        const v5 = codeOf(functionText(sourceAtV5(ANCHORS), name))
          .replace('stripNonContent(html)', 'stripNonNavigableMarkup(html)')
          .replace(/\s+/g, ' ');
        expect(v6, name).toBe(v5);
      }
    },
  );

  it.skipIf(!rangeAvailable)('the only import that moved is the sanitiser import', () => {
    const imports = (s: string) => s.match(/^import .*$/gm) ?? [];
    expect(imports(sourceOf(ANCHORS))).toEqual(
      imports(sourceAtV5(ANCHORS)).map((l) =>
        l.replace('import { stripNonContent }', 'import { stripNonNavigableMarkup }'),
      ),
    );
  });
});

describe('v6 repair scope: every other v5 anchor/base rule is unchanged', () => {
  it.skipIf(!rangeAvailable)(
    'resolveAnchorHref, resolveDocumentBase, hrefAttributeOf and stripTags are byte-identical',
    () => {
      for (const name of [
        'resolveAnchorHref',
        'resolveDocumentBase',
        'hrefAttributeOf',
        'stripTags',
      ]) {
        expect(functionText(sourceOf(ANCHORS), name), name).toBe(
          functionText(sourceAtV5(ANCHORS), name),
        );
      }
    },
  );

  it.skipIf(!rangeAvailable)(
    'every anchor/base pattern and the dropped-scheme list are unchanged',
    () => {
      for (const decl of [
        'const ANCHOR_PATTERN',
        'const DROPPED_SCHEMES',
        'const RAW_MARKUP_DELIMITER',
        'const BASE_TAG_PATTERN',
        'const ATTRIBUTE_PATTERN',
      ]) {
        expect(line(sourceOf(ANCHORS), decl), decl).toBe(line(sourceAtV5(ANCHORS), decl));
      }
    },
  );

  it('first href-bearing base still returned unconditionally (no later-base search)', () => {
    expect(codeOf(functionText(sourceOf(ANCHORS), 'extractDocumentBaseHref'))).toContain(
      'if (href !== null) return href.trim();',
    );
  });

  it('adds no character-reference decoder (deferred capability)', () => {
    const discovery = codeOf(
      ['extractDiscoveryAnchors', 'extractDocumentBaseHref', 'resolveDocumentBase']
        .map((n) => functionText(sourceOf(ANCHORS), n))
        .join('\n') + functionText(sourceOf(EXTRACT), 'stripNonNavigableMarkup'),
    );
    expect(discovery).not.toMatch(/&amp;|&#|fromCharCode|fromCodePoint|decodeEntit|decodeHtml/i);
  });

  it('the new code opens no socket, reads no environment and fetches nothing', () => {
    for (const path of [ANCHORS, EXTRACT]) {
      const source = sourceOf(path);
      for (const forbidden of [
        'node:dns',
        'node:net',
        'node:tls',
        'node:http',
        'node:https',
        'node:fs',
        "from 'pg'",
        'process.env',
        'Date.now(',
        'Math.random(',
        'executeWebAttempt',
      ]) {
        expect(source, `${path}: ${forbidden}`).not.toContain(forbidden);
      }
      expect(codeOf(source)).not.toMatch(/\bfetch\s*\(/);
    }
  });
});

describe('v6 repair scope: the policy version, current and historical', () => {
  it('production is orgunit-fetch-policy-v6, declared exactly once', () => {
    expect(sourceOf(POLICY).match(/FETCH_POLICY_VERSION\s*=\s*'[^']+'/g)).toEqual([
      "FETCH_POLICY_VERSION = 'orgunit-fetch-policy-v6'",
    ]);
  });

  it.skipIf(!rangeAvailable)('policy.ts moved ONLY its version string and its prose', () => {
    const strip = (s: string) =>
      codeOf(s)
        .replace(/FETCH_POLICY_VERSION = '[^']+'/, 'FETCH_POLICY_VERSION = X')
        .replace(/\s+/g, ' ');
    expect(strip(sourceOf(POLICY))).toBe(strip(sourceAtV5(POLICY)));
  });

  it.skipIf(!rangeAvailable)('the v5 terminal commit is still v5, WITHOUT the RCDATA fix', () => {
    expect(sourceAtV5(POLICY).match(/FETCH_POLICY_VERSION\s*=\s*'[^']+'/g)).toEqual([
      "FETCH_POLICY_VERSION = 'orgunit-fetch-policy-v5'",
    ]);
    const v5Anchors = codeOf(sourceAtV5(ANCHORS));
    expect(v5Anchors.match(/stripNonContent\(html\)/g)).toHaveLength(2);
    expect(v5Anchors).not.toContain('stripNonNavigableMarkup');
    expect(sourceAtV5(EXTRACT)).not.toContain('stripNonNavigableMarkup');
  });
});

describe('v6 repair scope: no frozen artifact moved', () => {
  it.skipIf(!rangeAvailable)('edited no pre-existing evaluation record, freeze or ledger', () => {
    for (const file of changedInRepair('docs/evaluation', 'docs/audits')) {
      const status = execFileSync(
        'git',
        ['-C', REPO_ROOT, 'diff', '--name-status', ...range(), '--', file],
        { encoding: 'utf8' },
      ).trim();
      if (status.length > 0) expect(status.startsWith('A\t'), `${file}: ${status}`).toBe(true);
    }
  });

  it.skipIf(!rangeAvailable)(
    'left the v5 records, adjudication, review and ledger byte-identical',
    () => {
      for (const frozen of [
        'docs/evaluation/PHASE_2B_2D_A2_ANCHOR_DOCUMENT_BASE_V5_IMPLEMENTATION_V1.json',
        'docs/evaluation/PHASE_2B_2D_A2_ANCHOR_DOCUMENT_BASE_FETCH_POLICY_V5_REPAIR_V1.json',
        'docs/evaluation/PHASE_2B_2D_A2_ANCHOR_DOCUMENT_BASE_CAPABILITY_REVIEW_V1.json',
        'docs/evaluation/PHASE_2B_2D_A2_PRIMARY_10_14_LIVE_WINDOW_EVIDENCE_ADJUDICATION_V1.json',
        'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_RESERVE_REPLACEMENT_LEDGER_V2_GEN1.json',
      ]) {
        expect(changedInRepair(frozen)).toEqual([]);
      }
    },
  );
});
