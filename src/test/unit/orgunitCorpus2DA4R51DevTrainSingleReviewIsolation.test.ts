/**
 * PHASE 2B-2D A4 R51 — ISOLATION, PURITY, ZERO LABELS AND SEALED SPLITS.
 *
 *   A. lineage: R51 descends from the exact R50 terminal, pins R50's scope in
 *      one first commit, merges nothing, and changes only its own surface;
 *   B. the namespace is human-only: no provider, model, translation, prompt,
 *      classifier runtime, socket, SQL, environment, R47 reproduction or
 *      label-producing function, and no sealed split;
 *   C. zero labels: no completed-response file exists, and no artifact R51
 *      changed carries a real goldId next to a semantic value or actor key;
 *   D. the public census and audit disclose aggregates and bound hashes only.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { REVIEW_CORE_SOURCE } from '../harness/phase2b2d/a4reviewDevTrain/session.js';
import {
  extractToolScript,
  TOOL_SCRIPT_IDS,
} from '../harness/phase2b2d/a4reviewDevTrain/tooling.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const R50_TERMINAL = '8c0d36af8b5a28403ee781a754d50f979dbf2e0b';
const R50_ISOLATION_TEST = 'src/test/unit/orgunitCorpus2DA3R50A4HandoffIsolation.test.ts';
const R51_TEST = 'src/test/unit/orgunitCorpus2DA4R51DevTrainSingleReview.test.ts';
const R51_ISOLATION_TEST =
  'src/test/unit/orgunitCorpus2DA4R51DevTrainSingleReviewIsolation.test.ts';
const NAMESPACE = 'src/test/harness/phase2b2d/a4reviewDevTrain';
const NAMESPACE_FILES = [
  'authority.ts',
  'refusal.ts',
  'response.ts',
  'session.ts',
  'tooling.ts',
  'types.ts',
];
const TOOL = 'docs/evaluation/corpus/PHASE_2B_2D_A4_DEV_TRAIN_SINGLE_REVIEW_TOOL_V1.html';
const APPROVAL =
  'docs/evaluation/PHASE_2B_2D_A4_DEV_TRAIN_HUMAN_SINGLE_REVIEW_OWNER_APPROVAL_V1.json';
const AUTHORITY = 'docs/evaluation/PHASE_2B_2D_A4_DEV_TRAIN_HUMAN_SINGLE_REVIEW_AUTHORITY_V1.json';
const CENSUS =
  'docs/evaluation/PHASE_2B_2D_A4_R51_DEV_TRAIN_SINGLE_REVIEW_AUTHORITY_CENSUS_V1.json';
const AUDIT = 'docs/audits/PHASE_2B_2D_A4_R51_DEV_TRAIN_HUMAN_SINGLE_REVIEW_AUTHORISATION_V1.md';
const PACKAGE =
  'docs/evaluation/corpus/PHASE_2B_2D_A3_R50_DEV_TRAIN_R4_SINGLE_REVIEW_PACKAGE_V1.jsonl';
const INDEX = 'docs/evaluation/corpus/PHASE_2B_2D_A3_R50_DEV_TRAIN_R4_A4_HANDOFF_INDEX_V1.json';
const RESPONSES_FILE = 'PHASE_2B_2D_A4_DEV_TRAIN_SINGLE_REVIEW_RESPONSES_V1.jsonl';

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

const baseAvailable = commitExists(R50_TERMINAL);

function changedSinceR50(): string[] {
  return [
    ...new Set([
      ...lines(git('diff', '--name-only', R50_TERMINAL)),
      ...lines(git('ls-files', '--others', '--exclude-standard')),
    ]),
  ];
}

const namespaceSources = (): { file: string; source: string }[] =>
  readdirSync(join(REPO_ROOT, NAMESPACE)).map((file) => ({
    file,
    source: text(`${NAMESPACE}/${file}`),
  }));
const importsOf = (source: string): string[] =>
  [...source.matchAll(/(?:^|\n)\s*(?:import|export)[^'"]*?from\s+'([^']+)'/g)].map((m) => m[1]!);

const realGoldIds = (): string[] =>
  text(PACKAGE)
    .slice(0, -1)
    .split('\n')
    .map((line) => (JSON.parse(line) as { goldId: string }).goldId);

// ---------------------------------------------------------------------------
// A. LINEAGE AND CHANGED SURFACE.
// ---------------------------------------------------------------------------

describe.skipIf(!baseAvailable)('2D-A4 R51: lineage and changed surface', () => {
  it('descends from the exact R50 tip, and merges no commit', () => {
    expect(() => git('merge-base', '--is-ancestor', R50_TERMINAL, 'HEAD')).not.toThrow();
    expect(lines(git('rev-list', '--merges', `${R50_TERMINAL}..HEAD`))).toEqual([]);
  });

  it("pinned R50's scope in one first commit that touched exactly the R50 isolation test", () => {
    const [first] = lines(git('rev-list', '--reverse', `${R50_TERMINAL}..HEAD`));
    if (first === undefined) return;
    expect(git('rev-parse', `${first}^`).trim()).toBe(R50_TERMINAL);
    expect(lines(git('diff', '--name-only', R50_TERMINAL, first))).toEqual([R50_ISOLATION_TEST]);
    expect(lines(git('log', '-1', '--format=%s', first))[0]).toMatch(/freeze R50/);
  });

  it('changes nothing outside the R50 pin, its namespace, two tests, the tool and four records', () => {
    const permitted = new Set([
      R50_ISOLATION_TEST,
      R51_TEST,
      R51_ISOLATION_TEST,
      ...NAMESPACE_FILES.map((f) => `${NAMESPACE}/${f}`),
      TOOL,
      APPROVAL,
      AUTHORITY,
      CENSUS,
      AUDIT,
    ]);
    expect(changedSinceR50().filter((path) => !permitted.has(path))).toEqual([]);
  });

  it('changes no production runtime, migration, script, package, earlier harness or R50 artifact', () => {
    expect(
      changedSinceR50().filter(
        (path) =>
          (path.startsWith('src/') &&
            !path.startsWith('src/test/unit/') &&
            !path.startsWith(`${NAMESPACE}/`)) ||
          /^(migrations|scripts)\//.test(path) ||
          /^package(-lock)?\.json$/.test(path) ||
          path === '.prettierignore',
      ),
    ).toEqual([]);
    const prior = lines(
      git('ls-tree', '-r', '--name-only', R50_TERMINAL, '--', 'docs', 'src/test/harness'),
    );
    expect(prior.length).toBeGreaterThan(0);
    expect(lines(git('diff', '--name-only', R50_TERMINAL, '--', ...prior))).toEqual([]);
  });

  it('creates no DEV_CONFIRM, FINAL_HOLDOUT, gold, manifest, label, A5, completed-response or adjudication artifact', () => {
    expect(
      changedSinceR50().filter((path) =>
        /DEV_CONFIRM|FINAL_HOLDOUT|GOLD_|MANIFEST|CORPUS_FREEZE|CORPUS_FROZEN|A5_|LABELS?_|ADJUDICAT|RESPONSES_V|COMPLETED_RESPONSE|DRAFT/.test(
          path,
        ),
      ),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// B. THE NAMESPACE IS HUMAN-ONLY.
// ---------------------------------------------------------------------------

describe('2D-A4 R51: the review namespace is pure, human-only and model-free', () => {
  it('holds exactly the reviewed files', () => {
    expect(readdirSync(join(REPO_ROOT, NAMESPACE)).sort()).toEqual(NAMESPACE_FILES);
  });

  it('imports only the node built-ins it needs, prettier, the R50 handoff namespace and one hash primitive', () => {
    const allowedExternal = new Set(['node:crypto', 'node:vm', 'prettier']);
    for (const { file, source } of namespaceSources()) {
      for (const spec of importsOf(source)) {
        const ok =
          allowedExternal.has(spec) ||
          /^\.\/[A-Za-z]+\.js$/.test(spec) ||
          /^\.\.\/a4handoffR4\/(rubric|types|responseSchema)\.js$/.test(spec) ||
          spec === '../../../../orgunits/classify/evaluation/hashes.js';
        expect(ok, `${file} imports ${spec}`).toBe(true);
      }
    }
  });

  it('opens no socket, issues no SQL, reads no environment or file, and calls no model or translation service', () => {
    for (const { file, source } of namespaceSources()) {
      expect(source, file).not.toMatch(
        /from '(pg|node:net|node:http|node:https|node:dns|node:tls|node:child_process|node:fs|node:worker_threads)'/,
      );
      expect(source, file).not.toMatch(
        /process\.env|\.query\(|new Pool\b|XMLHttpRequest|WebSocket|sendBeacon/,
      );
      expect(source, file).not.toMatch(/\bfetch\s*\(/);
      expect(source, file).not.toMatch(
        /@anthropic-ai|claude-agent-sdk|openai|generativelanguage|googleapis|translate\.google|deepl|classify\/(runtime|prompt|provider|agent|inference|run)/i,
      );
      expect(source, file).not.toMatch(/\b(SELECT|INSERT|UPDATE|DELETE)\s+[A-Za-z_*]/);
    }
  });

  it('does not reproduce R47, load private authority, or name a historical gold / adjudication source', () => {
    for (const { file, source } of namespaceSources()) {
      for (const spec of importsOf(source)) {
        expect(spec, `${file} imports ${spec}`).not.toMatch(
          /a3replayR4|reproduction|materialise|provenance|gold|adjudicat|acceptance|fixtures|proposal|label/i,
        );
      }
      expect(source, file).not.toMatch(
        /['"`](?:docs|src)\/[^'"`\n]*(fixtures|gold|adjudicat|proposed|acceptance)[^'"`\n]*['"`]/i,
      );
    }
  });

  it('defines no function that predicts, infers, classifies, suggests or auto-fills a label', () => {
    const sources = [...namespaceSources().map((s) => s.source), REVIEW_CORE_SOURCE];
    for (const source of sources) {
      expect(source).not.toMatch(
        /function\s+(predict\w*|infer\w*|classify\w*|suggest\w*|guess\w*|recommend\w*|derive\w*(Verdict|UnitType|HardNegative)\w*|auto\w*Label\w*|propose\w*|default\w*(Verdict|Label)\w*)/i,
      );
      expect(source).not.toMatch(
        /likely UNIT_PAGE|probably|suggested verdict|recommended verdict/i,
      );
    }
  });

  it('the core never reads page content', () => {
    expect(REVIEW_CORE_SOURCE).not.toMatch(
      /mainText|sourcePresentations|requestedUrl|headings|title/,
    );
  });

  it('imports no sealed-split source and names no sealed split as a value', () => {
    for (const { file, source } of namespaceSources()) {
      for (const spec of importsOf(source)) {
        expect(spec, `${file} imports ${spec}`).not.toMatch(/sealed|confirm|holdout|manifest/i);
      }
      expect(source, file).not.toMatch(/['"](DEV_CONFIRM|FINAL_HOLDOUT)['"]/);
    }
  });

  it('the tool and records never read the internal index into a reviewer-visible artifact', () => {
    const index = JSON.parse(text(INDEX)) as { items: Record<string, unknown>[] };
    const tool = text(TOOL);
    for (const item of index.items.slice(0, 50)) {
      expect(tool.includes(item['echeRowKey'] as string)).toBe(false);
      expect(tool.includes(item['documentSha256'] as string)).toBe(false);
    }
    expect(tool).not.toMatch(/inSetP|inSetR|echeRowKey|documentSha256|sourcePageEvidenceIds/);
  });
});

// ---------------------------------------------------------------------------
// C. ZERO LABELS.
// ---------------------------------------------------------------------------

describe('2D-A4 R51: zero labels exist at the R51 terminal', () => {
  let ids: Set<string>;
  beforeAll(() => {
    ids = new Set(realGoldIds());
  });

  it('no completed DEV_TRAIN response file exists anywhere in the repository', () => {
    expect(lines(git('ls-files')).filter((path) => path.includes(RESPONSES_FILE))).toEqual([]);
    expect(
      lines(git('ls-files', '--others', '--exclude-standard')).filter((path) =>
        path.includes(RESPONSES_FILE),
      ),
    ).toEqual([]);
  });

  it.skipIf(!baseAvailable)(
    'no artifact R51 changed pairs a real goldId with a verdict, unit_type, hard_negative or actor key',
    () => {
      const semantic =
        /"(verdict|unit_type|hard_negative|reviewerActorKey)"\s*:\s*(?!null\b)("[^"]*"|true|false)/;
      for (const path of changedSinceR50().filter((p) => /\.(json|jsonl|html|md)$/.test(p))) {
        const body = text(path);
        const mentioned = [...body.matchAll(/\bg[0-9a-f]{16}\b/g)].map((m) => m[0]);
        const real = mentioned.filter((id) => ids.has(id));
        if (path === TOOL) {
          // The tool embeds the blind package (no label key; proven record
          // for record in the R51 test). Everywhere ELSE in the tool, no real
          // goldId appears at all, so nothing can pair one with a label.
          const outsidePackage = body.replace(extractToolScript(body, TOOL_SCRIPT_IDS.package), '');
          expect(
            [...outsidePackage.matchAll(/\bg[0-9a-f]{16}\b/g)].filter((m) => ids.has(m[0])),
          ).toEqual([]);
          const embedded = extractToolScript(body, TOOL_SCRIPT_IDS.package);
          expect(embedded).not.toMatch(/verdict|unit_type|hard_negative|reviewerActorKey/);
          continue;
        }
        expect(body, path).not.toMatch(semantic);
        expect(real, path).toEqual([]);
      }
    },
  );

  it('the bound R50 template is still wholly blank', () => {
    const template = text(
      'docs/evaluation/corpus/PHASE_2B_2D_A3_R50_DEV_TRAIN_R4_SINGLE_REVIEW_RESPONSE_TEMPLATE_V1.jsonl',
    );
    expect(template).not.toMatch(
      /"(verdict|unit_type|hard_negative|reviewerActorKey|reviewNote)":(?!null)/,
    );
  });
});

// ---------------------------------------------------------------------------
// D. PUBLIC DISCLOSURE.
// ---------------------------------------------------------------------------

describe('2D-A4 R51: the approval, authority, census and audit disclose bound hashes only', () => {
  const RECORDS = [APPROVAL, AUTHORITY, CENSUS, AUDIT];
  const present = RECORDS.every((p) => {
    try {
      text(p);
      return true;
    } catch {
      return false;
    }
  });

  it.skipIf(!present).each(RECORDS)(
    '%s carries no identity, URL, page text or unbound digest',
    (path) => {
      const body = text(path);
      const sha = (p: string): string =>
        createHash('sha256')
          .update(readFileSync(join(REPO_ROOT, p)))
          .digest('hex');
      const bound = new Set([
        '9664388949f5d8686fe32af2fb4fb8f933787faf6daf11349d5b8a402db4066e', // R50 package hash
        '91442149a4763ced8b28dfe35bfbcb00c2781baed594c19169c7cbaac80619ed', // R50 package file
        'd532cc4b77ed104abeb516ec98382972f0ed7ee3a3b168a19b4de028c037b4aa', // R50 template file
        'e3af57d8d2503e4fc87ce707427762aabfed420bb670a262b9302a7ea78e1d69', // R49 rubric
        '17f2683d378b32000467eb670374f56bfa3c8b7b3dfa0acb8a12ee60d0468ac4', // R49 approval
        sha(APPROVAL),
        sha(AUTHORITY),
        sha(TOOL),
      ]);
      expect(body).not.toMatch(/\bg[0-9a-f]{16}\b/);
      expect(body).not.toMatch(/https?:\/\//);
      expect(body).not.toMatch(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/);
      expect(body).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i);
      const digests = [...body.matchAll(/\b[0-9a-f]{64}\b/g)].map((m) => m[0]);
      expect(digests.filter((d) => !bound.has(d))).toEqual([]);
      if (baseAvailable) {
        for (const commit of [...body.matchAll(/\b[0-9a-f]{40}\b/g)].map((m) => m[0])) {
          expect(commitExists(commit), commit).toBe(true);
        }
      }
    },
  );
});
