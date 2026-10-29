/**
 * PHASE 2B-2D A3 R50 — ISOLATION, PURITY, AND THE MATERIALISED HANDOFF.
 *
 *   A. lineage: R50 descends from the exact R49 terminal, pins R49's scope in
 *      one first commit, merges nothing, and changes only its own surface;
 *   B. the namespace is human-only and pre-label: no provider, classifier
 *      inference, prompt, model API, historical gold / adjudication loader,
 *      sealed split, socket, SQL or label-producing function;
 *   C. the materialised artifacts (once written): the internal index is not
 *      reviewer-visible; the package is blind, ordered, rubric-bound and
 *      hash-reproducible; the template is blank; every goldId recomputes
 *      through the unchanged primitive; P / R counts close;
 *   D. the public census and audit disclose aggregates and bound hashes only.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { sha256OfCanonical } from '../../orgunits/classify/evaluation/hashes.js';
import { deriveGoldId } from '../../orgunits/classify/evaluation/select.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const R49_TERMINAL = 'e07c11906f8c29da74be12c61afe287fcef3787f';
const R50_SCOPE_PIN_COMMIT = '0a254965888d2d2e2245fc9b7ecf446fd32e3663';
// R51 froze R50: every lineage / changed-surface assertion below is a
// historical fact about R49_TERMINAL..R50_TERMINAL, not about HEAD.
const R50_TERMINAL = '8c0d36af8b5a28403ee781a754d50f979dbf2e0b';
const R49_TEST = 'src/test/unit/orgunitCorpus2DA3R49HumanLabellingRubric.test.ts';
const R50_TEST = 'src/test/unit/orgunitCorpus2DA3R50A4Handoff.test.ts';
const R50_ISOLATION_TEST = 'src/test/unit/orgunitCorpus2DA3R50A4HandoffIsolation.test.ts';
const NAMESPACE = 'src/test/harness/phase2b2d/a4handoffR4';
const NAMESPACE_FILES = [
  'census.ts',
  'identity.ts',
  'items.ts',
  'materialise.ts',
  'provenance.ts',
  'refusal.ts',
  'reproduction.ts',
  'responseSchema.ts',
  'reviewPackage.ts',
  'rubric.ts',
  'types.ts',
];

const INDEX = 'docs/evaluation/corpus/PHASE_2B_2D_A3_R50_DEV_TRAIN_R4_A4_HANDOFF_INDEX_V1.json';
const PACKAGE =
  'docs/evaluation/corpus/PHASE_2B_2D_A3_R50_DEV_TRAIN_R4_SINGLE_REVIEW_PACKAGE_V1.jsonl';
const TEMPLATE =
  'docs/evaluation/corpus/PHASE_2B_2D_A3_R50_DEV_TRAIN_R4_SINGLE_REVIEW_RESPONSE_TEMPLATE_V1.jsonl';
const HTML = 'docs/evaluation/corpus/PHASE_2B_2D_A3_R50_DEV_TRAIN_R4_SINGLE_REVIEW_PACKET_V1.html';
const CENSUS = 'docs/evaluation/PHASE_2B_2D_A3_R50_DEV_TRAIN_R4_A4_HANDOFF_CENSUS_V1.json';
const AUDIT = 'docs/audits/PHASE_2B_2D_A3_R50_R4_DEV_TRAIN_A4_HANDOFF_MATERIALISATION_V1.md';

const RUBRIC_SHA256 = 'e3af57d8d2503e4fc87ce707427762aabfed420bb670a262b9302a7ea78e1d69';
const RUBRIC_VERSION = 'METHODOLOGY_V2_HUMAN_LABELLING_RUBRIC_V1';
const APPROVAL_SHA256 = '17f2683d378b32000467eb670374f56bfa3c8b7b3dfa0acb8a12ee60d0468ac4';
const R47_CENSUS_SHA256 = '4d3c3e21164da4d9741fb310d68a0a6eb42229bcfec47549c3edf3024e5bdf6a';
const PACKAGE_SCHEMA = 'PHASE_2B_2D_A3_R50_DEV_TRAIN_R4_SINGLE_REVIEW_PACKAGE_V1';
const SUCCESS_TERMINAL =
  'A3_R4_DEV_TRAIN_A4_HANDOFF_MATERIALISED_AWAIT_OWNER_HUMAN_LABELLING_AUTHORISATION';

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 256 << 20 });
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
const text = (path: string): string => readFileSync(join(REPO_ROOT, path), 'utf8');
const json = (path: string): Record<string, unknown> =>
  JSON.parse(text(path)) as Record<string, unknown>;
const jsonl = (path: string): Record<string, unknown>[] =>
  text(path)
    .slice(0, -1)
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);

const baseAvailable =
  commitExists(R49_TERMINAL) && commitExists(R50_SCOPE_PIN_COMMIT) && commitExists(R50_TERMINAL);

// The exact R50 changed surface, pinned to the R50 terminal tree.
function changedSinceR49(): string[] {
  return lines(git('diff', '--name-only', R49_TERMINAL, R50_TERMINAL));
}
const r50Tree = (): string[] => lines(git('ls-tree', '-r', '--name-only', R50_TERMINAL));

const namespaceSources = (): { file: string; source: string }[] =>
  readdirSync(join(REPO_ROOT, NAMESPACE)).map((file) => ({
    file,
    source: text(`${NAMESPACE}/${file}`),
  }));
const importsOf = (source: string): string[] =>
  [...source.matchAll(/(?:^|\n)\s*(?:import|export)[^'"]*?from\s+'([^']+)'/g)].map((m) => m[1]!);

// ---------------------------------------------------------------------------
// A. LINEAGE AND CHANGED SURFACE.
// ---------------------------------------------------------------------------

describe.skipIf(!baseAvailable)('2D-A3 R50: lineage and changed surface', () => {
  it('descends from the exact R49 tip, and merges no commit', () => {
    expect(() => git('merge-base', '--is-ancestor', R49_TERMINAL, R50_TERMINAL)).not.toThrow();
    expect(() => git('merge-base', '--is-ancestor', R50_TERMINAL, 'HEAD')).not.toThrow();
    expect(lines(git('rev-list', '--merges', `${R49_TERMINAL}..${R50_TERMINAL}`))).toEqual([]);
    expect(lines(git('rev-list', `${R49_TERMINAL}..${R50_TERMINAL}`))).toHaveLength(5);
  });

  it("pinned R49's scope in exactly one first commit that touched exactly one file", () => {
    const [first] = lines(git('rev-list', '--reverse', `${R49_TERMINAL}..${R50_TERMINAL}`));
    expect(first).toBe(R50_SCOPE_PIN_COMMIT);
    expect(git('rev-parse', `${R50_SCOPE_PIN_COMMIT}^`).trim()).toBe(R49_TERMINAL);
    expect(lines(git('diff', '--name-only', R49_TERMINAL, R50_SCOPE_PIN_COMMIT))).toEqual([
      R49_TEST,
    ]);
    expect(
      lines(git('diff', '--name-only', R50_SCOPE_PIN_COMMIT, R50_TERMINAL, '--', R49_TEST)),
    ).toEqual([]);
  });

  it('changes nothing outside the R49 pin, its namespace, two tests, three handoff artifacts, the census and the audit', () => {
    const permitted = new Set([
      R49_TEST,
      R50_TEST,
      R50_ISOLATION_TEST,
      ...NAMESPACE_FILES.map((f) => `${NAMESPACE}/${f}`),
      INDEX,
      PACKAGE,
      TEMPLATE,
      CENSUS,
      AUDIT,
    ]);
    expect(changedSinceR49().filter((path) => !permitted.has(path))).toEqual([]);
    // At the R50 terminal the surface is exactly this set, no more and no less.
    expect(changedSinceR49().sort()).toEqual([...permitted].sort());
  });

  it('changes no production runtime, migration, script, package or earlier harness byte', () => {
    expect(
      changedSinceR49().filter(
        (path) =>
          (path.startsWith('src/') &&
            !path.startsWith('src/test/unit/') &&
            !path.startsWith(`${NAMESPACE}/`)) ||
          /^(migrations|scripts)\//.test(path) ||
          /^package(-lock)?\.json$/.test(path) ||
          path === '.prettierignore',
      ),
    ).toEqual([]);
  });

  it('leaves every earlier public record, audit and the R47 replay namespace byte-identical', () => {
    const prior = lines(
      git('ls-tree', '-r', '--name-only', R49_TERMINAL, '--', 'docs', 'src/test/harness'),
    );
    expect(prior.length).toBeGreaterThan(0);
    expect(lines(git('diff', '--name-only', R49_TERMINAL, R50_TERMINAL, '--', ...prior))).toEqual(
      [],
    );
  });

  it('creates no DEV_CONFIRM, FINAL_HOLDOUT, gold, manifest, label, A5 or corpus-freeze artifact', () => {
    expect(
      changedSinceR49().filter((path) =>
        /DEV_CONFIRM|FINAL_HOLDOUT|GOLD_|MANIFEST|CORPUS_FREEZE|CORPUS_FROZEN|A5_|LABELS?_|ADJUDICAT|COMPLETED_RESPONSE/.test(
          path,
        ),
      ),
    ).toEqual([]);
  });

  it('at the R50 terminal no R51 / A4 review artifact, tool or completed response existed', () => {
    const tree = r50Tree();
    expect(tree.filter((path) => /a4review|PHASE_2B_2D_A4_|R51/.test(path))).toEqual([]);
    expect(tree.filter((path) => /SINGLE_REVIEW_RESPONSES|\.html$/.test(path))).toEqual([]);
    // The package, index and template were the only handoff artifacts.
    expect(
      tree.filter((path) => path.startsWith('docs/evaluation/corpus/PHASE_2B_2D_A3_R50_')),
    ).toEqual([INDEX, PACKAGE, TEMPLATE].sort());
  });

  it('at the R50 terminal the response template was wholly blank: zero labels, zero review', () => {
    const rows = git('show', `${R50_TERMINAL}:${TEMPLATE}`)
      .slice(0, -1)
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(rows).toHaveLength(222);
    for (const row of rows) {
      for (const field of [
        'reviewerActorKey',
        'verdict',
        'unit_type',
        'hard_negative',
        'reviewNote',
      ]) {
        expect(row[field], field).toBeNull();
      }
    }
    const census = JSON.parse(git('show', `${R50_TERMINAL}:${CENSUS}`)) as Record<string, unknown>;
    expect(census['labelBoundary']).toMatchObject({
      labelsCreated: 0,
      goldRecordsCreated: 0,
      humanLabellingExecuted: false,
      devConfirmOpened: false,
      finalHoldoutOpened: false,
    });
  });
});

// ---------------------------------------------------------------------------
// B. THE NAMESPACE IS HUMAN-ONLY AND PRE-LABEL.
// ---------------------------------------------------------------------------

describe('2D-A3 R50: the handoff namespace is pure, human-only and pre-label', () => {
  it('holds exactly the reviewed files', () => {
    expect(readdirSync(join(REPO_ROOT, NAMESPACE)).sort()).toEqual(NAMESPACE_FILES);
  });

  it('imports only node built-ins it needs, prettier, landed A3 / R47 harness paths and the two classify evaluation primitives', () => {
    const allowedExternal = new Set(['node:crypto', 'node:fs', 'node:path', 'prettier']);
    for (const { file, source } of namespaceSources()) {
      for (const spec of importsOf(source)) {
        const ok =
          allowedExternal.has(spec) ||
          spec.startsWith('./') ||
          /^\.\.\/(a3replayR4|a3documents|a3documentsV2|a3documentsV4|a3documentsV5|a3evidence)\/[A-Za-z0-9]+\.js$/.test(
            spec,
          ) ||
          spec === '../../../../orgunits/classify/evaluation/select.js' ||
          spec === '../../../../orgunits/classify/evaluation/hashes.js';
        expect(ok, `${file} imports ${spec}`).toBe(true);
      }
    }
  });

  it('only identity.ts reaches deriveGoldId, and nothing reimplements it', () => {
    for (const { file, source } of namespaceSources()) {
      const reaches = source.includes('classify/evaluation/select.js');
      expect(reaches, file).toBe(file === 'identity.ts');
      expect(source.includes('.slice(0, 16)'), file).toBe(false);
    }
    expect(text(`${NAMESPACE}/identity.ts`)).toContain('deriveGoldId(echeRowKey, documentSha256)');
  });

  it('opens no socket, issues no SQL, reads no environment and calls no model', () => {
    for (const { file, source } of namespaceSources()) {
      expect(source, file).not.toMatch(
        /from '(pg|node:net|node:http|node:https|node:dns|node:tls|node:child_process)'/,
      );
      expect(source, file).not.toMatch(/\bfetch\(|process\.env|\.query\(|new Pool\b/);
      expect(source, file).not.toMatch(
        /@anthropic-ai|claude-agent-sdk|openai|classify\/(runtime|prompt|provider|agent|inference|run)/i,
      );
      expect(source, file).not.toMatch(/\b(SELECT|INSERT|UPDATE|DELETE)\s+[A-Za-z_*]/);
    }
  });

  it('imports and names no historical gold, adjudication, proposed-label or acceptance source', () => {
    for (const { file, source } of namespaceSources()) {
      for (const spec of importsOf(source)) {
        expect(spec, `${file} imports ${spec}`).not.toMatch(
          /gold|adjudicat|acceptance|fixtures|proposal|proposed|label/i,
        );
      }
      expect(source, file).not.toMatch(
        /['"`](?:docs|src)\/[^'"`\n]*(fixtures|gold|adjudicat|proposed|acceptance)[^'"`\n]*['"`]/i,
      );
    }
  });

  it('defines no function that predicts, infers, classifies or suggests a label', () => {
    for (const { file, source } of namespaceSources()) {
      expect(source, file).not.toMatch(
        /function\s+(predict\w*|infer\w*|classify\w*|suggest\w*|derive\w*(Verdict|UnitType|HardNegative)\w*|auto\w*Label\w*|propose\w*)/i,
      );
    }
  });

  it('imports no sealed-split or sealed-root source and names no sealed split as a value', () => {
    for (const { file, source } of namespaceSources()) {
      for (const spec of importsOf(source)) {
        expect(spec, `${file} imports ${spec}`).not.toMatch(/sealed|confirm|holdout|manifest/i);
      }
      expect(source, file).not.toMatch(/['"](DEV_CONFIRM|FINAL_HOLDOUT)['"]/);
    }
  });

  it.skipIf(!baseAvailable)(
    'modifies no R47 byte: the replay namespace is identical to R49',
    () => {
      expect(
        lines(
          git('diff', '--name-only', R49_TERMINAL, '--', 'src/test/harness/phase2b2d/a3replayR4'),
        ),
      ).toEqual([]);
    },
  );

  it('wrote no HTML packet (optional, and not required for reproducibility)', () => {
    expect(existsSync(join(REPO_ROOT, HTML))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C. THE MATERIALISED HANDOFF.
// ---------------------------------------------------------------------------

const materialised = [INDEX, PACKAGE, TEMPLATE, CENSUS].map((p) => existsSync(join(REPO_ROOT, p)));

describe('2D-A3 R50: the handoff artifacts are all present or all absent', () => {
  it('never holds a partial set', () => {
    expect(new Set(materialised).size).toBe(1);
  });
});

describe.skipIf(!materialised.every(Boolean))('2D-A3 R50: the materialised handoff', () => {
  let index: Record<string, unknown>;
  let items: Record<string, unknown>[];
  let records: Record<string, unknown>[];
  let templates: Record<string, unknown>[];
  let census: Record<string, unknown>;
  beforeAll(() => {
    index = json(INDEX);
    items = index['items'] as Record<string, unknown>[];
    records = jsonl(PACKAGE);
    templates = jsonl(TEMPLATE);
    census = json(CENSUS);
  });
  const at = (value: unknown, ...keys: string[]): unknown =>
    keys.reduce<unknown>(
      (node, key) =>
        node !== null && typeof node === 'object'
          ? (node as Record<string, unknown>)[key]
          : undefined,
      value,
    );

  it('the internal index is not reviewer-visible; the package is', () => {
    expect(index['reviewerVisible']).toBe(false);
    expect(index['neverHandToAReviewer']).toBe(true);
    expect(index['thisFileAuthorises']).toEqual([]);
    expect(index['goldIdDoesNotMeanGoldYet']).toBe(true);
    expect(at(index, 'packageBinding', 'reviewPackageReviewerVisible')).toBe(true);
    expect(at(census, 'artifacts', 'internalIndex', 'reviewerVisible')).toBe(false);
    expect(at(census, 'artifacts', 'reviewPackage', 'reviewerVisible')).toBe(true);
  });

  it('binds the exact rubric and approval', () => {
    expect(at(index, 'rubricBinding', 'sha256')).toBe(RUBRIC_SHA256);
    expect(at(index, 'rubricBinding', 'approvalSha256')).toBe(APPROVAL_SHA256);
    expect(at(index, 'r47Binding', 'censusSha256')).toBe(R47_CENSUS_SHA256);
    expect(at(index, 'r47Binding', 'differingSemanticPathCount')).toBe(0);
  });

  it('has one package line and one template line per index item, all in goldId ASC order', () => {
    const ids = items.map((i) => i['goldId'] as string);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);
    expect(records.map((r) => r['goldId'])).toEqual(ids);
    expect(templates.map((t) => t['goldId'])).toEqual(ids);
    for (const id of ids) expect(id).toMatch(/^g[0-9a-f]{16}$/);
  });

  it('every goldId recomputes through the unchanged deriveGoldId(echeRowKey, documentSha256)', () => {
    for (const item of items) {
      expect(deriveGoldId(item['echeRowKey'] as string, item['documentSha256'] as string)).toBe(
        item['goldId'],
      );
      expect(item['documentSha256']).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('closes the P ∪ R arithmetic: 160 + 80 = union + overlap', () => {
    const p = items.filter((i) => i['inSetP'] === true).length;
    const r = items.filter((i) => i['inSetR'] === true).length;
    const both = items.filter((i) => i['inSetP'] === true && i['inSetR'] === true).length;
    expect(p).toBe(160);
    expect(r).toBe(80);
    expect(items.every((i) => i['inSetP'] === true || i['inSetR'] === true)).toBe(true);
    expect(items.length + both).toBe(240);
    expect(both).toBeGreaterThanOrEqual(0);
    expect(both).toBeLessThanOrEqual(80);
    expect(at(census, 'handoff', 'unionItems')).toBe(items.length);
    expect(at(census, 'handoff', 'overlapItems')).toBe(both);
  });

  it('every package record is exactly the blind schema and bound to the rubric', () => {
    for (const record of records) {
      expect(Object.keys(record)).toEqual([
        'goldId',
        'rubricVersion',
        'rubricSha256',
        'mainText',
        'sourcePresentations',
      ]);
      expect(record['rubricVersion']).toBe(RUBRIC_VERSION);
      expect(record['rubricSha256']).toBe(RUBRIC_SHA256);
      for (const presentation of record['sourcePresentations'] as Record<string, unknown>[]) {
        expect(Object.keys(presentation)).toEqual([
          'requestedUrl',
          'title',
          'declaredLang',
          'headings',
          'mainTextTruncated',
          'extractionMethod',
          'extractionRuleVersion',
        ]);
        for (const heading of presentation['headings'] as Record<string, unknown>[]) {
          expect(Object.keys(heading)).toEqual(['level', 'text']);
        }
      }
    }
  });

  it('no structured key of the package reveals sampling, identity or model metadata', () => {
    const banned =
      /setp|setr|inset|sample|rank|score|candidate|signal|track|gate|threshold|survivor|exclusion|nearduplicate|selectionindex|stratum|reserve|generation|disposition|documentsha256|echerowkey|organisationid|pageevidenceid|historical|prediction|model|classifier|verdict|unit_type|hard_negative|label|representative/i;
    const keys = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.flatMap(keys)
        : value !== null && typeof value === 'object'
          ? Object.entries(value).flatMap(([k, v]) => [k, ...keys(v)])
          : [];
    const all = new Set(records.flatMap(keys));
    expect([...all].filter((k) => banned.test(k) || (/gold/i.test(k) && k !== 'goldId'))).toEqual(
      [],
    );
  });

  it('no package record quotes its own internal identity values', () => {
    records.forEach((record, i) => {
      const serialised = JSON.stringify(record);
      const item = items[i]!;
      expect(serialised.includes(item['documentSha256'] as string)).toBe(false);
      expect(serialised.includes(item['echeRowKey'] as string)).toBe(false);
      for (const id of item['sourcePageEvidenceIds'] as string[]) {
        expect(serialised.includes(id)).toBe(false);
      }
    });
  });

  it('every source presentation of an exact document is kept, with no representative', () => {
    records.forEach((record, i) => {
      expect((record['sourcePresentations'] as unknown[]).length).toBe(
        (items[i]!['sourcePageEvidenceIds'] as unknown[]).length,
      );
    });
    const multi = items.filter((i) => (i['sourcePageEvidenceIds'] as unknown[]).length > 1).length;
    expect(at(census, 'handoff', 'multiSourceSelectedUnionItems')).toBe(multi);
    // Structured keys only: real page text may legitimately say "representative".
    const keysOf = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.flatMap(keysOf)
        : value !== null && typeof value === 'object'
          ? Object.entries(value).flatMap(([k, v]) => [k, ...keysOf(v)])
          : [];
    expect(
      [...new Set([...records, ...items].flatMap(keysOf))].filter((k) =>
        /representative|canonicalsourceindex|winner|chosen/i.test(k),
      ),
    ).toEqual([]);
  });

  it('the template is wholly blank', () => {
    for (const template of templates) {
      expect(Object.keys(template)).toEqual([
        'goldId',
        'rubricVersion',
        'rubricSha256',
        'reviewerActorKey',
        'verdict',
        'unit_type',
        'hard_negative',
        'reviewNote',
      ]);
      expect(template['rubricSha256']).toBe(RUBRIC_SHA256);
      for (const field of [
        'reviewerActorKey',
        'verdict',
        'unit_type',
        'hard_negative',
        'reviewNote',
      ]) {
        expect(template[field], field).toBeNull();
      }
    }
  });

  it('the package hash recomputes from the package file with sha256OfCanonical', () => {
    const hash = sha256OfCanonical({
      packageSchema: PACKAGE_SCHEMA,
      rubricVersion: RUBRIC_VERSION,
      rubricSha256: RUBRIC_SHA256,
      recordCount: records.length,
      records,
    });
    expect(at(index, 'packageBinding', 'packageHash')).toBe(hash);
    expect(at(census, 'packageHash', 'value')).toBe(hash);
    expect(at(census, 'packageHash', 'recordCount')).toBe(records.length);
    expect(at(census, 'packageHash', 'name')).toBe('R50_PRE_LABEL_REVIEW_PACKAGE_HASH');
  });

  it('records zero labels, zero gold, no human review, no enrichment and sealed splits', () => {
    expect(at(census, 'labelBoundary')).toEqual({
      labelsCreated: 0,
      goldRecordsCreated: 0,
      modelLabels: 0,
      adjudications: 0,
      humanLabellingExecuted: false,
      humanLabellingAuthorised: false,
      a4HandoffPrepared: true,
      a5Started: false,
      devConfirmOpened: false,
      finalHoldoutOpened: false,
      devTrainRealisedSetREnrichment: 'NOT_YET_MEASURABLE_PRE_LABEL',
    });
    expect(at(index, 'labels')).toEqual({
      labelsContained: 0,
      goldRecordsContained: 0,
      modelLabelsContained: 0,
      adjudicationsContained: 0,
    });
    expect(at(census, 'access', 'devConfirmReads')).toBe(0);
    expect(at(census, 'access', 'finalHoldoutReads')).toBe(0);
    expect(at(census, 'access', 'sqlStatementsAfterLastPoolClosed')).toBe(0);
    expect(at(census, 'access', 'writes')).toBe(0);
    expect(census['terminalState']).toBe(SUCCESS_TERMINAL);
    expect(census['thisFileAuthorises']).toEqual([]);
    expect(census['recordKind']).toBe('PUBLIC_AGGREGATE_ONLY_DEV_TRAIN_R4_A4_HANDOFF_CENSUS');
  });
});

// ---------------------------------------------------------------------------
// D. PUBLIC DISCLOSURE FIREWALL.
// ---------------------------------------------------------------------------

describe.skipIf(!materialised.every(Boolean) || !existsSync(join(REPO_ROOT, AUDIT)))(
  '2D-A3 R50: the census and audit disclose aggregates and bound hashes only',
  () => {
    let bound: Set<string>;
    let items: Record<string, unknown>[];
    beforeAll(() => {
      const packageHash = (json(CENSUS)['packageHash'] as Record<string, unknown>)[
        'value'
      ] as string;
      bound = new Set([
        RUBRIC_SHA256,
        APPROVAL_SHA256,
        R47_CENSUS_SHA256,
        packageHash,
        // R48 census, cited as the blocker record.
        'ad028c8ff5245e80e674cc502ccd4b7e0a1986cadd41000746ef306b474bb24c',
      ]);
      items = json(INDEX)['items'] as Record<string, unknown>[];
    });

    it.each([CENSUS, AUDIT])('%s carries no identity, URL, text or unbound digest', (path) => {
      const body = text(path);
      expect(body).not.toMatch(/\bg[0-9a-f]{16}\b/);
      expect(body).not.toMatch(/https?:\/\//);
      expect(body).not.toMatch(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/);
      const digests = [...body.matchAll(/\b[0-9a-f]{64}\b/g)].map((m) => m[0]);
      expect(digests.filter((d) => !bound.has(d))).toEqual([]);
      for (const commit of [...body.matchAll(/\b[0-9a-f]{40}\b/g)].map((m) => m[0])) {
        if (baseAvailable) expect(commitExists(commit), commit).toBe(true);
      }
      for (const item of items) {
        expect(body.includes(item['echeRowKey'] as string)).toBe(false);
        expect(body.includes(item['documentSha256'] as string)).toBe(false);
      }
    });
  },
);
