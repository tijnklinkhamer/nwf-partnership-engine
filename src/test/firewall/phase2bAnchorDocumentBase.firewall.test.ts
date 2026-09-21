/**
 * FETCH POLICY v5 - THE ISOLATION TEST FOR THE ANCHOR DOCUMENT-BASE REPAIR.
 *
 * Owner decisions AUTHORISE_A2_ANCHOR_DOCUMENT_BASE_CAPABILITY_REPAIR_IMPLEMENTATION_V1,
 * APPROVE_HTML_DOCUMENT_BASE_FIRST_HREF_ELEMENT_SEMANTICS_V1 and
 * APPROVE_FETCH_POLICY_V5_FOR_DOCUMENT_BASE_REPAIR_V1
 * (docs/evaluation/PHASE_2B_2D_A2_ANCHOR_DOCUMENT_BASE_FETCH_POLICY_V5_REPAIR_V1.json).
 *
 * Per the phase-isolation decision, this repair is pinned by its OWN
 * repair-scope file over its OWN commit range; no older firewall was widened.
 * It proves, from the real git range and the real source:
 *
 *   - exactly three production files changed, by exact path, none new;
 *   - no migration, no dependency, no gateway / robots / URL / host-policy /
 *     extractor / frontier / budget change;
 *   - the two v4 functions (`extractDiscoveryAnchors`, `resolveAnchorHref`)
 *     are byte-identical to v4 - half of the no-base compatibility proof;
 *   - the base search reuses the canonical `stripNonContent`, and the new code
 *     opens no socket, fetches nothing and decodes no character references;
 *   - the anchor intake still runs `admissibleUrl` after base resolution;
 *   - `FETCH_POLICY_VERSION` is `orgunit-fetch-policy-v5`, declared once;
 *   - no pre-existing evaluation record, freeze or ledger was edited.
 *
 * THE RANGE IS REPAIR_BASE_COMMIT..REPAIR_TERMINAL_COMMIT. It is open to the
 * working tree only while the implementation is being written, and is pinned
 * to the implementation commit as soon as that commit exists - exactly as the
 * ADR 0012 / 0013 / 0015 repair-scope files were.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** The v4 source this repair started from (Window V2 partial adjudication). */
const V4_SOURCE_COMMIT = '69dff793439a8d20d29894100c4b73e064206308';

/** The governance decision record commit; everything after it is this repair. */
const REPAIR_BASE_COMMIT = '158072409dd3cc3c781fb63a653b16d64dec448f';

/**
 * The commit this repair ENDS at: the v5 implementation. Pinned immediately
 * after it landed, so a later phase is never judged against this repair's
 * authorised surface. The implementation record that follows is governance
 * and belongs to no production range.
 */
const REPAIR_TERMINAL_COMMIT: string | null = '40477099896856005d3d131bcaeac4d443424ec4';

const AUTHORISED_PRODUCTION_FILES = [
  'src/orgunits/orchestrator/anchors.ts',
  'src/orgunits/orchestrator/rootRunner.ts',
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
  'src/orgunits/web/extract.ts',
  'src/orgunits/web/redact.ts',
  'src/orgunits/sitemap.ts',
  'src/orgunits/orchestrator/circuitBreaker.ts',
  'src/orgunits/orchestrator/constants.ts',
  'src/orgunits/orchestrator/orchestrate.ts',
  'src/orgunits/orchestrator/frontier.ts',
  'src/orgunits/orchestrator/candidates.ts',
  'src/orgunits/orchestrator/pageCollection.ts',
  'src/orgunits/orchestrator/requestBudget.ts',
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
  commitExists(V4_SOURCE_COMMIT) &&
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

function sourceAtV4(path: string): string {
  return execFileSync('git', ['-C', REPO_ROOT, 'show', `${V4_SOURCE_COMMIT}:${path}`], {
    encoding: 'utf8',
  });
}

function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** The full text of one exported function: signature through its closing brace. */
function exportedFunction(source: string, name: string): string {
  const start = source.indexOf(`export function ${name}(`);
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  const end = source.indexOf('\n}\n', start);
  return source.slice(start, end + 2);
}

describe('v5 repair scope: exactly three production files, by exact path', () => {
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
    'left the gateway, robots, URL policy and every budget untouched',
    () => {
      const changed = changedInRepair();
      for (const file of FORBIDDEN_PRODUCTION_FILES) expect(changed).not.toContain(file);
    },
  );

  it.skipIf(!rangeAvailable)('changed no classifier, signals, CLI, db or ingest file', () => {
    for (const file of changedInRepair()) {
      for (const prefix of [
        'src/orgunits/classify/',
        'src/orgunits/signals/',
        'src/cli/',
        'src/db/',
        'src/ingest/',
      ]) {
        expect(file.startsWith(prefix), file).toBe(false);
      }
    }
  });
});

describe('v5 repair scope: v4 behaviour is preserved where no base applies', () => {
  it.skipIf(!rangeAvailable)('extractDiscoveryAnchors is byte-identical to v4', () => {
    const path = 'src/orgunits/orchestrator/anchors.ts';
    expect(exportedFunction(sourceOf(path), 'extractDiscoveryAnchors')).toBe(
      exportedFunction(sourceAtV4(path), 'extractDiscoveryAnchors'),
    );
  });

  it.skipIf(!rangeAvailable)('resolveAnchorHref is byte-identical to v4', () => {
    const path = 'src/orgunits/orchestrator/anchors.ts';
    expect(exportedFunction(sourceOf(path), 'resolveAnchorHref')).toBe(
      exportedFunction(sourceAtV4(path), 'resolveAnchorHref'),
    );
  });

  it.skipIf(!rangeAvailable)('the v4 anchor patterns and dropped-scheme list did not move', () => {
    const path = 'src/orgunits/orchestrator/anchors.ts';
    for (const decl of [
      'const ANCHOR_PATTERN',
      'const DROPPED_SCHEMES',
      'const RAW_MARKUP_DELIMITER',
    ]) {
      const line = (source: string) => source.split('\n').find((l) => l.startsWith(decl));
      expect(line(sourceOf(path)), decl).toBe(line(sourceAtV4(path)));
    }
  });
});

describe('v5 repair scope: the base changes resolution only', () => {
  const anchors = () => sourceOf('src/orgunits/orchestrator/anchors.ts');

  it('the new code opens no socket, reads no environment and fetches nothing', () => {
    const source = anchors();
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
      expect(source, forbidden).not.toContain(forbidden);
    }
    expect(codeOf(source)).not.toMatch(/\bfetch\s*\(/);
  });

  it('imports nothing new: the canonical stripNonContent is reused, no second sanitiser', () => {
    expect(anchors().match(/^import .*$/gm)).toEqual(
      sourceAtV4('src/orgunits/orchestrator/anchors.ts').match(/^import .*$/gm),
    );
    const base = exportedFunction(anchors(), 'extractDocumentBaseHref');
    expect(base).toContain('stripNonContent(html)');
    expect(codeOf(anchors())).not.toMatch(/<!--\[\\s\\S\]/); // no private comment stripper
  });

  it('adds no character-reference decoder to the base path (deferred capability)', () => {
    const base = codeOf(
      exportedFunction(anchors(), 'extractDocumentBaseHref') +
        exportedFunction(anchors(), 'resolveDocumentBase'),
    );
    expect(base).not.toMatch(/&amp;|&#|fromCharCode|fromCodePoint|decodeEntit/i);
  });

  it('falls back to the DOCUMENT URL, never loops on to a later base', () => {
    const base = codeOf(exportedFunction(anchors(), 'extractDocumentBaseHref'));
    // The first href-bearing base is returned unconditionally.
    expect(base).toContain('if (href !== null) return href.trim();');
    const resolveBase = codeOf(exportedFunction(anchors(), 'resolveDocumentBase'));
    expect(resolveBase).toContain('new URL(baseHref, documentUrl)');
  });

  it('rootRunner resolves against the document base, then still gates admission', () => {
    const runner = codeOf(sourceOf('src/orgunits/orchestrator/rootRunner.ts'));
    const intake = runner.slice(runner.indexOf('function ingestFetchedPage('));
    const resolveAt = intake.indexOf('resolveAnchorHref(documentBase.url, anchor.hrefRaw)');
    const admitAt = intake.indexOf('if (!admissibleUrl(resolution.url)) continue;');
    const addAt = intake.indexOf("frontier.add(resolution.url, 'LINK', fetch.requestedUrl");
    expect(resolveAt).toBeGreaterThan(-1);
    expect(admitAt).toBeGreaterThan(resolveAt);
    expect(addAt).toBeGreaterThan(admitAt);
    // The base is computed from the fetched page URL, and resolveAnchorHref
    // is called nowhere else against the raw page URL.
    expect(intake).toContain('resolveDocumentBase(\n      fetch.requestedUrl,');
    expect(runner.match(/resolveAnchorHref\(/g)).toHaveLength(1);
  });
});

describe('v5 repair scope: the policy version', () => {
  it('production is orgunit-fetch-policy-v5, declared exactly once', () => {
    expect(
      sourceOf('src/orgunits/web/policy.ts').match(/FETCH_POLICY_VERSION\s*=\s*'[^']+'/g),
    ).toEqual(["FETCH_POLICY_VERSION = 'orgunit-fetch-policy-v5'"]);
  });

  it.skipIf(!rangeAvailable)('policy.ts moved ONLY its version string and its prose', () => {
    const strip = (s: string) =>
      codeOf(s)
        .replace(/FETCH_POLICY_VERSION = '[^']+'/, 'FETCH_POLICY_VERSION = X')
        .replace(/\s+/g, ' ');
    expect(strip(sourceOf('src/orgunits/web/policy.ts'))).toBe(
      strip(sourceAtV4('src/orgunits/web/policy.ts')),
    );
  });
});

describe('v5 repair scope: no frozen artifact moved', () => {
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
    'left the capability review, adjudication and ledger byte-identical',
    () => {
      for (const frozen of [
        'docs/evaluation/PHASE_2B_2D_A2_ANCHOR_DOCUMENT_BASE_CAPABILITY_REVIEW_V1.json',
        'docs/evaluation/PHASE_2B_2D_A2_PRIMARY_10_14_LIVE_WINDOW_EVIDENCE_ADJUDICATION_V1.json',
        'docs/evaluation/PHASE_2B_2D_A2_ANCHOR_DOCUMENT_BASE_FETCH_POLICY_V5_REPAIR_V1.json',
        'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_RESERVE_REPLACEMENT_LEDGER_V2_GEN1.json',
      ]) {
        expect(changedInRepair(frozen)).toEqual([]);
      }
    },
  );
});
