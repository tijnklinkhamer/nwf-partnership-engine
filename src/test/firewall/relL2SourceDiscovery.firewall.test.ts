/**
 * REL L2 / U1 FIREWALL - independent source discovery NOMINATES, and nothing
 * else moved.
 *
 * Pins, over PHASE_BASE_COMMIT..PHASE_TERMINAL_COMMIT (the working tree while
 * the terminal is open):
 *   - the change set is exactly the named files, and every edit to a
 *     historical test is exactly its reviewed acknowledgement;
 *   - the root runner changed by exactly the optional off-domain sink, and
 *     the CLI entry by exactly one route;
 *   - `src/orgunits/sourceDiscovery/` and `src/orgunits/classify/` are
 *     SEPARATE in both directions (with mutation oracles proving the
 *     detector fires);
 *   - the namespace opens no socket, names no robots file, calls no gateway
 *     and imports no SDK; the Claude Max adapter is constructible only with a
 *     sealed authorisation whose only constructor is vitest-guarded, and no
 *     production file or CLI can reach either;
 *   - migration 0019 grants only SELECT/INSERT to its NOLOGIN capability and
 *     SELECT to audit, defines no SECURITY DEFINER and no contact column.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildWebSearchAgentOptions } from '../../orgunits/sourceDiscovery/claudeMaxWebSearchProvider.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** The slice base: `fbe6a8c` (ADR 0017 acceptance on main). */
const PHASE_BASE_COMMIT = 'fbe6a8c';

/** Open (null) until the commit-closure pin. */
const PHASE_TERMINAL_COMMIT: string | null = null;

const NS = 'src/orgunits/sourceDiscovery/';
const NS_FILES = [
  'authorisation.ts',
  'brief.ts',
  'claudeMaxWebSearchProvider.ts',
  'heiSignal.ts',
  'identityBridge.ts',
  'linkOut.ts',
  'nomination.ts',
  'promote.ts',
  'provider.ts',
  'run.ts',
  'scriptedProvider.ts',
  'store.ts',
  'types.ts',
].map((f) => `${NS}${f}`);
const CLI_COMMAND = 'src/cli/commands/sourceDiscovery.ts';
const CLI_ENTRY = 'src/cli/index.ts';
const ROOT_RUNNER = 'src/orgunits/orchestrator/rootRunner.ts';
const MIGRATION = 'migrations/0019_source_discovery_nominations.sql';

/**
 * SHA-256 of JSON {removed, added} of each historical test's `git diff --unified=0` lines. Reviewed as:
 *   B2.2 registry, B2.3 review - exact-path exception: promote.ts may import the propose request
 *                                type and the writer's propose pair (and nothing else); no pattern removed
 *   B2.5-V1                    - identityBridge.ts is the one further B2.1 importer
 *   registry, P1a              - the newest migration is 0019
 *   orgunitSchema              - migration list gains 0019 (0018 reserved for the L1 lane)
 *   R8 migration 0017          - the real runner now also applies 0019
 *   A1 frame                   - 0019 acknowledged with its ADR and OWNER directive record
 */
const ACKNOWLEDGED_EDITS: Readonly<Record<string, string>> = {
  'src/test/firewall/phase2bDiscoverySubjectRegistry.firewall.test.ts':
    '274a2f611a2127a7ea23eb7d514ad9cc9225bbe273d0218718bfbf18b636f196',
  'src/test/firewall/phase2bOwnerAttestedReview.firewall.test.ts':
    '274a2f611a2127a7ea23eb7d514ad9cc9225bbe273d0218718bfbf18b636f196',
  'src/test/firewall/phase2bSubjectValidationV1.firewall.test.ts':
    '48b5b85124817194191f7c7844f83ca70248cdeca1dd4726a8ed66b6f73f5363',
  'src/test/integration/discoverySubjectRegistry.test.ts':
    'd61a86bfb0db99a7f1f885b00c4e7db3db72cd082da47eb0615ff403774b6725',
  'src/test/integration/discoverySubjectSnapshotReadB25P1a.test.ts':
    '732a5839e247770d2baaf653f6fca5b35523dd3f1ce36a27e25957092dccc338',
  'src/test/integration/orgunitSchema.test.ts':
    '09971ccb33da059a861cee965807eeedd89ed336fc680d538b4bfc61e07c9730',
  'src/test/integration/subjectResearchMigration0017R8.test.ts':
    'fda61c9474ef44c504e7c9aedfcace068bc2dd5f660d1572e57664a2b99c7ed7',
  'src/test/unit/orgunitCorpus2DA1Frame.test.ts':
    'e8ddd1b06cd3d2ce461ac0f239f3f8d4c859be918a94903e5086f26be74e858f',
};

const AUTHORISED_CHANGESET = [
  'A\tdocs/adr/0026-independent-source-discovery-nominations.md',
  'A\tdocs/evaluation/REL_L2_SOURCE_DISCOVERY_OWNER_DIRECTIVE_RECORD_V1.json',
  `A\t${MIGRATION}`,
  `A\t${CLI_COMMAND}`,
  `M\t${CLI_ENTRY}`,
  `M\t${ROOT_RUNNER}`,
  ...NS_FILES.map((f) => `A\t${f}`),
  'A\tsrc/test/firewall/relL2SourceDiscovery.firewall.test.ts',
  'A\tsrc/test/integration/sourceDiscoveryRelL2.test.ts',
  'A\tsrc/test/unit/sourceDiscoveryRelL2.test.ts',
  ...Object.keys(ACKNOWLEDGED_EDITS).map((f) => `M\t${f}`),
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

const rangeAvailable =
  commitExists(PHASE_BASE_COMMIT) &&
  (PHASE_TERMINAL_COMMIT === null || commitExists(PHASE_TERMINAL_COMMIT));

const range = (): string[] =>
  PHASE_TERMINAL_COMMIT === null ? [PHASE_BASE_COMMIT] : [PHASE_BASE_COMMIT, PHASE_TERMINAL_COMMIT];

function changeset(): string[] {
  const tracked = git('diff', '--name-status', '--find-renames', ...range());
  const untracked =
    PHASE_TERMINAL_COMMIT === null
      ? git('ls-files', '--others', '--exclude-standard')
          .split('\n')
          .filter((l) => l.length > 0 && l !== 'node_modules')
          .map((l) => `A\t${l}`)
          .join('\n')
      : '';
  return [...new Set(`${tracked}\n${untracked}`.split('\n').filter((l) => l.length > 0))].sort();
}

function diffLines(path: string): { removed: string[]; added: string[] } {
  const diff = git('diff', '--unified=0', ...range(), '--', path).split('\n');
  return {
    removed: diff.filter((l) => l.startsWith('-') && !l.startsWith('---')).map((l) => l.slice(1)),
    added: diff.filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1)),
  };
}

/** Current (working-tree) source: the boundary checks protect what exists NOW. */
const read = (path: string): string => readFileSync(join(REPO_ROOT, path), 'utf8');

function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function productionFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(REPO_ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== 'test') walk(rel);
      } else if (rel.endsWith('.ts')) out.push(rel);
    }
  };
  walk('src');
  return out.sort();
}

const specifiers = (code: string): string[] =>
  [...code.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)'([^']+)'/g)].map(
    (m) => m[1]!,
  );

/** True when `code` imports (statically, dynamically or by require) anything under classify/. */
const reachesClassify = (code: string): boolean =>
  specifiers(code).some((s) => /(^|\/)classify(\/|$)/.test(s)) || /orgunits\/classify/.test(code);

/** True when `code` imports anything under sourceDiscovery/. */
const reachesSourceDiscovery = (code: string): boolean =>
  specifiers(code).some((s) => /(^|\/)sourceDiscovery(\/|$)/.test(s)) ||
  /sourceDiscovery\//.test(code);

describe.skipIf(!rangeAvailable)('REL L2: the change set over its own range', () => {
  it('is exactly the named files', () => {
    expect(changeset()).toEqual(AUTHORISED_CHANGESET);
  });

  it('edits each historical test by exactly its reviewed acknowledgement', () => {
    for (const [path, digest] of Object.entries(ACKNOWLEDGED_EDITS)) {
      const lines = diffLines(path);
      expect(createHash('sha256').update(JSON.stringify(lines), 'utf8').digest('hex'), path).toBe(
        digest,
      );
    }
  });

  it('changes the root runner by exactly the optional off-domain sink, removing nothing', () => {
    const { removed, added } = diffLines(ROOT_RUNNER);
    expect(removed).toEqual([]);
    expect(added).toEqual([
      '/**',
      ' * REL L2: receives each OFF-DOMAIN anchor of a page whose evidence was',
      ' * persisted - (page evidence id, absolute href, redacted anchor text). The',
      ' * runner NEVER fetches these; the sink only records them.',
      ' */',
      'export type OffDomainAnchorSink = (',
      '  pageEvidenceId: string,',
      '  href: string,',
      '  anchorText: string | null,',
      ') => void | Promise<void>;',
      '',
      '  /** REL L2: optional; defaults to a no-op, so off-domain anchors stay discarded. */',
      '  offDomainAnchorSink?: OffDomainAnchorSink;',
      '  const offDomainAnchorSink = deps.offDomainAnchorSink ?? (() => undefined);',
      '  const offDomainAnchors = new Map<string, { href: string; text: string | null }[]>();',
      '      const linkOut = validateRequestUrl(resolution.url);',
      '      if (linkOut.ok && linkOut.value.registrableDomain !== rootUrl.registrableDomain) {',
      '        const list = offDomainAnchors.get(fetch.requestedUrl) ?? [];',
      '        list.push({ href: linkOut.value.url, text: anchor.text });',
      '        offDomainAnchors.set(fetch.requestedUrl, list);',
      '      }',
      '  for (const page of persistedPages) {',
      '    for (const a of offDomainAnchors.get(page.url) ?? []) {',
      '      await offDomainAnchorSink(page.id, a.href, a.text);',
      '    }',
      '  }',
    ]);
  });

  it('changes the CLI entry by one import, three usage lines and one route, removing nothing', () => {
    const { removed, added } = diffLines(CLI_ENTRY);
    expect(removed).toEqual([]);
    expect(added).toEqual([
      "import { runSourceDiscoveryCli } from './commands/sourceDiscovery.js';",
      '  nwf-pe orgunits discover-sources --brief <key> --geography <CC> [--json]',
      '  nwf-pe orgunits nominations list|promote ...',
      '                              (run \\`nwf-pe orgunits nominations --help\\` for its own options)',
      "  if (argv[0] === 'orgunits' && (argv[1] === 'discover-sources' || argv[1] === 'nominations')) {",
      '    return runSourceDiscoveryCli(argv.slice(1));',
      '  }',
    ]);
  });

  it('leaves the classifier, the gateway, robots, signals, the identity module and every earlier migration byte-identical', () => {
    const touched = git(
      'diff',
      '--name-status',
      ...range(),
      '--',
      'src/orgunits/classify',
      'src/orgunits/web',
      'src/orgunits/signals',
      'src/orgunits/identity',
      'src/orgunits/subjectRegistry',
      'src/orgunits/subjectReview',
      'src/orgunits/subjectAdmission',
      'src/orgunits/sitemap.ts',
      'src/db',
      'src/config',
      'package.json',
      'package-lock.json',
      'CLAUDE.md',
    )
      .split('\n')
      .filter((l) => l.length > 0);
    expect(touched).toEqual([]);
    const migrations = git('diff', '--name-status', ...range(), '--', 'migrations', 'docs')
      .split('\n')
      .filter((l) => l.length > 0 && !l.startsWith('A\t'));
    expect(migrations).toEqual([]);
  });
});

describe('REL L2: sourceDiscovery and the classifier are separate, in both directions', () => {
  it('the detectors fire on every import form (mutation oracles)', () => {
    for (const sample of [
      "import { x } from '../classify/types.js';",
      "import type { Y } from '../../orgunits/classify/provider/agentSdkRunner.js';",
      "const m = await import('../classify/prompt.js');",
      "export * from '../classify/index.js';",
    ]) {
      expect(reachesClassify(sample), sample).toBe(true);
    }
    for (const sample of [
      "import { x } from '../sourceDiscovery/brief.js';",
      "const m = await import('../../orgunits/sourceDiscovery/run.js');",
      "export { y } from '../sourceDiscovery/store.js';",
    ]) {
      expect(reachesSourceDiscovery(sample), sample).toBe(true);
    }
    expect(reachesClassify("import { a } from './classifyLater.js';")).toBe(false);
    expect(reachesSourceDiscovery("import { a } from './sourceDiscoveryish.js';")).toBe(false);
  });

  it('no sourceDiscovery file reaches classify/', () => {
    for (const file of NS_FILES) expect(reachesClassify(codeOf(read(file))), file).toBe(false);
  });

  it('no classify/ file reaches sourceDiscovery/', () => {
    const classify = productionFiles().filter((f) => f.startsWith('src/orgunits/classify/'));
    expect(classify.length).toBeGreaterThan(10);
    for (const file of classify) {
      expect(reachesSourceDiscovery(codeOf(read(file))), file).toBe(false);
    }
  });

  it('sourceDiscovery is reached by production code only from its CLI command', () => {
    const importers = productionFiles()
      .filter((f) => !f.startsWith(NS))
      .filter((f) => reachesSourceDiscovery(codeOf(read(f))));
    expect(importers).toEqual([CLI_COMMAND]);
    // The orchestrator owns the sink TYPE; it never imports this namespace.
    expect(reachesSourceDiscovery(codeOf(read(ROOT_RUNNER)))).toBe(false);
  });
});

describe('REL L2: the namespace is narrow, socket-free and sealed', () => {
  it('is exactly the reviewed files', () => {
    expect(productionFiles().filter((f) => f.startsWith(NS))).toEqual(NS_FILES);
    expect(existsSync(join(REPO_ROOT, MIGRATION))).toBe(true);
  });

  it('opens no socket, requests nothing, names no robots file and imports no SDK', () => {
    for (const file of [...NS_FILES, CLI_COMMAND]) {
      const code = codeOf(read(file));
      expect(code, file).not.toMatch(
        /\bfetch\s*\(|node:(net|tls|http|https|dns|fs|child_process)|executeWebAttempt|authoriseAndFetchPage|runRootAcquisition|runOrganisationDiscovery|robots\.txt|sitemap|claude-agent-sdk|@anthropic-ai|anthropic|apollo|nodemailer/i,
      );
      for (const s of specifiers(code)) {
        expect(s, file).not.toMatch(
          /(^|\/)web\/(gateway|robots|robotsAuthority|pageEvidence)\.js$/,
        );
        expect(s, file).not.toMatch(/(^|\/)orchestrator\//);
      }
    }
  });

  it('imports only the reviewed modules outside the namespace', () => {
    const outside = new Set<string>();
    for (const file of NS_FILES) {
      for (const s of specifiers(codeOf(read(file)))) if (!s.startsWith('./')) outside.add(s);
    }
    expect([...outside].sort()).toEqual(
      [
        '../identity/admissibility.js',
        '../identity/vocabulary.js',
        '../subjectRegistry/requests.js',
        '../subjectRegistry/writer.js',
        '../web/hostPolicy.js',
        '../web/redact.js',
        '../web/url.js',
        'node:crypto',
        'pg',
        'zod',
      ].sort(),
    );
    // The registry is named by promote.ts alone; B2.1 by identityBridge.ts alone.
    for (const file of NS_FILES) {
      const specs = specifiers(codeOf(read(file)));
      expect(
        specs.some((s) => s.includes('subjectRegistry/')),
        file,
      ).toBe(file.endsWith('promote.ts'));
      expect(
        specs.some((s) => s.includes('identity/')),
        file,
      ).toBe(file.endsWith('identityBridge.ts'));
    }
  });

  it('keeps briefs, nomination preparation, HEI signal and types PURE', () => {
    for (const f of ['brief.ts', 'nomination.ts', 'heiSignal.ts', 'types.ts', 'provider.ts']) {
      const code = codeOf(read(`${NS}${f}`));
      expect(code, f).not.toMatch(/from 'pg'|process\.|Date\.now|new Date\(|Math\.random/);
      expect(code, f).not.toMatch(/\b(SELECT|INSERT|UPDATE|DELETE)\b\s/);
    }
    // Nothing reads a country to decide anything but the brief's own claim.
    for (const file of NS_FILES) {
      expect(codeOf(read(file)), file).not.toMatch(/country_code|countryCode|\blocale\b|market/i);
    }
  });

  it('writes only its own three tables, by INSERT only', () => {
    for (const file of [...NS_FILES, CLI_COMMAND]) {
      const writes = [
        ...codeOf(read(file)).matchAll(/\b(INSERT INTO|UPDATE|DELETE FROM|TRUNCATE)\s+(\w+)/g),
      ].map((m) => `${m[1]} ${m[2]}`);
      expect(writes, file).toEqual(
        file.endsWith('store.ts')
          ? [
              'INSERT INTO source_discovery_briefs',
              'INSERT INTO source_discovery_runs',
              'INSERT INTO source_discovery_runs',
              'INSERT INTO source_discovery_nominations',
            ]
          : [],
      );
    }
  });

  it('the authorisation has ONE constructor, vitest-guarded, and no production file calls it', () => {
    const auth = codeOf(read(`${NS}authorisation.ts`));
    expect([...auth.matchAll(/\bstatic\s+(\w+)/g)].map((m) => m[1])).toEqual([
      'isAuthorisation',
      'sealedForVitest',
    ]);
    expect(auth).toMatch(/private constructor\(/);
    expect(auth).toMatch(/readonly #sealed = true;/);
    expect(auth).toMatch(
      /static sealedForVitest\(scope: string\): SourceDiscoveryAuthorisation \{\s*if \(process\.env\['VITEST'\] !== 'true'\) \{\s*throw new Error\(/,
    );
    expect(auth.match(/new SourceDiscoveryAuthorisation\(/g)).toHaveLength(1);
    for (const file of productionFiles()) {
      const code = codeOf(read(file));
      if (file !== `${NS}authorisation.ts`) {
        expect(code, file).not.toMatch(/\bsealedForVitest\s*\(/);
      }
      if (file !== `${NS}claudeMaxWebSearchProvider.ts`) {
        expect(code, file).not.toMatch(/new\s+ClaudeMaxWebSearchProvider\b/);
      }
      expect(code, file).not.toMatch(/new\s+ScriptedSearchProvider\b/);
    }
    expect(codeOf(read(`${NS}scriptedProvider.ts`))).toMatch(
      /constructor\([^)]*\) \{\s*if \(process\.env\['VITEST'\] !== 'true'\) \{\s*throw new Error\(/,
    );
  });

  it('the adapter checks the authorisation by BRAND and builds WebSearch-only options of its own', async () => {
    const adapter = codeOf(read(`${NS}claudeMaxWebSearchProvider.ts`));
    expect(adapter).toMatch(
      /constructor\(authorisation: SourceDiscoveryAuthorisation, deps: ClaudeMaxWebSearchDeps\) \{\s*if \(!SourceDiscoveryAuthorisation\.isAuthorisation\(authorisation\)\) \{/,
    );
    const options = buildWebSearchAgentOptions();
    expect([...options.tools]).toEqual(['WebSearch']);
    expect([...options.allowedTools]).toEqual(['WebSearch']);
    expect(options.disallowedTools).toEqual(expect.arrayContaining(['WebFetch', 'Bash', 'Read']));
    expect((await options.canUseTool('WebFetch', {})).behavior).toBe('deny');
    expect([...adapter.matchAll(/'(WebSearch|WebFetch|Bash|Read)'/g)].map((m) => m[1])).toEqual([
      'WebSearch',
      'WebFetch',
      'Bash',
      'Read',
    ]);
  });

  it('no CLI file can reach the adapter, its authorisation, the scripted provider or a live run', () => {
    for (const file of productionFiles().filter((f) => f.startsWith('src/cli/'))) {
      const code = codeOf(read(file));
      expect(code, file).not.toMatch(
        /claudeMaxWebSearchProvider|ClaudeMaxWebSearchProvider|sourceDiscovery\/authorisation|SourceDiscoveryAuthorisation|scriptedProvider|sourceDiscovery\/run\.js|runSourceDiscovery\b|linkOut/,
      );
    }
    const cli = codeOf(read(CLI_COMMAND));
    expect(cli).not.toMatch(/['"]--?all['"]|\ball:\s*\{|'every'|geographies/);
    expect(cli).toMatch(
      /'discover-sources': \{\s*brief: \{ type: 'string' \},\s*geography: \{ type: 'string' \},\s*execute: \{ type: 'boolean' \},\s*\.\.\.OUTPUT,\s*\}/,
    );
    expect(cli).toMatch(
      /if \(values\['execute'\] === true\) \{\s*return refuse\(\s*'LIVE_SEARCH_NOT_AUTHORISED'/,
    );
  });
});

describe('REL L2: migration 0019 is narrow', () => {
  const sql = read(MIGRATION).replace(/--.*$/gm, '');
  const outsideDoBlocks = sql.replace(/DO \$\$[\s\S]*?\$\$;/g, '');
  const identifiers = sql.replace(/'(?:[^']|'')*'/g, "''");

  it('grants SELECT/INSERT to its capability and SELECT to audit, and nothing else', () => {
    const grants = [
      ...outsideDoBlocks.matchAll(/GRANT\s+([\s\S]*?)\s+ON\s+([\s\S]*?)\s+TO\s+(\w+)\s*;/g),
    ].map(([, privileges, , grantee]) => `${grantee}:${privileges!.replace(/\s+/g, ' ').trim()}`);
    expect(grants.sort()).toEqual(
      [
        'nwf_readonly:SELECT',
        'nwf_source_discovery:SELECT (id, observed_at)',
        'nwf_source_discovery:SELECT (registrable_domain)',
        'nwf_source_discovery:SELECT, INSERT',
        'nwf_source_discovery:USAGE',
      ].sort(),
    );
    expect(sql).toMatch(/GRANT CONNECT ON DATABASE %I TO nwf_source_discovery/);
    expect(identifiers).not.toMatch(
      /\bGRANT\b[^;]*\b(UPDATE|DELETE|TRUNCATE|TEMPORARY|REFERENCES|TRIGGER|ALL)\b[^;]*\bTO\b/i,
    );
    expect(sql).not.toMatch(/SECURITY DEFINER|ALTER TABLE|DROP\s/i);
    expect([...sql.matchAll(/CREATE ROLE (\w+)/g)].map((m) => m[1])).toEqual([
      'nwf_source_discovery',
    ]);
    expect(sql).toMatch(
      /NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD NULL/,
    );
  });

  it('declares no contact, country, score, status or verdict column, and reuses the 0013 URL rule', () => {
    expect(identifiers).not.toMatch(
      /\b\w*(contact|email|phone|mailbox|country|locale|market|score|status|verified|relevant|eligib|qualif)\w*\b/i,
    );
    expect(sql).toMatch(/CHECK \(discovery_identity_url_admissible\(url\)\)/);
    expect(sql).toMatch(/discovery_identity_refuse_mutation\(\)/);
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX source_discovery_nominations_dedupe_uidx\s+ON source_discovery_nominations \(dedupe_key\)/,
    );
  });
});
