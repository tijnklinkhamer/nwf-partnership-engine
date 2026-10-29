/**
 * PHASE 2B-2D A4 R51 — DEV_TRAIN HUMAN SINGLE REVIEW: BINDING, TOOL, WORKFLOW
 * AND THE FUTURE COMPLETED-RESPONSE CONTRACT.
 *
 *   A. the exact R50 package / template / index / census and R49 rubric bind,
 *      and any drift refuses;
 *   B. the committed offline tool embeds exactly that package and rubric, is
 *      reproducible, offline, model-free and blind;
 *   C. the review-session core EXTRACTED FROM THE COMMITTED HTML enforces
 *      exactly-one-label-per-item and language deferral as workflow (synthetic
 *      items only);
 *   D. the completed-response validator accepts every legal matrix row and
 *      refuses, never repairs, every illegal one (synthetic responses only);
 *   E. the owner approval, authority and census are exactly the rendered
 *      records.
 *
 * Every semantic value in this file is SYNTHETIC: invented goldIds, invented
 * responses. No real item is labelled here.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  bindExactR50PackageForR51,
  buildAuthorityRecord,
  buildOwnerApprovalRecord,
  buildR51Census,
  type R51PackageBinding,
} from '../harness/phase2b2d/a4reviewDevTrain/authority.js';
import {
  completedResponseFileProblems,
  requireCompletedResponseFile,
} from '../harness/phase2b2d/a4reviewDevTrain/response.js';
import {
  loadReviewCore,
  REVIEW_CORE_SOURCE,
  type ReviewBinding,
  type ReviewCore,
  type ReviewDraft,
} from '../harness/phase2b2d/a4reviewDevTrain/session.js';
import {
  CONTENT_SECURITY_POLICY,
  extractToolScript,
  renderJsonArtifact,
  renderReviewToolHtml,
  RUBRIC_SECTIONS_SHOWN,
  TOOL_SCRIPT_IDS,
} from '../harness/phase2b2d/a4reviewDevTrain/tooling.js';
import {
  COMPLETED_RESPONSE_FILE_NAME,
  COMPLETED_RESPONSE_KEYS,
  DRAFT_KIND,
  LANGUAGE_DEFER_STATE,
  R50_BOUND_ARTIFACTS,
  R51_ARTIFACT_PATHS,
  R51_AUTHORISED_ACTION,
  R51_AUTHORITY_FLAGS,
  R51_OWNER_MARKERS,
  R51_SUCCESS_TERMINAL,
} from '../harness/phase2b2d/a4reviewDevTrain/types.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const bytes = (path: string): Buffer => readFileSync(join(REPO_ROOT, path));
const text = (path: string): string => readFileSync(join(REPO_ROOT, path), 'utf8');

const PACKAGE_HASH = '9664388949f5d8686fe32af2fb4fb8f933787faf6daf11349d5b8a402db4066e';
const RUBRIC_SHA256 = 'e3af57d8d2503e4fc87ce707427762aabfed420bb670a262b9302a7ea78e1d69';
const RUBRIC_VERSION = 'METHODOLOGY_V2_HUMAN_LABELLING_RUBRIC_V1';
const RUBRIC_PATH = 'docs/evaluation/PHASE_2B_2D_METHOD_V2_HUMAN_LABELLING_RUBRIC_V1.json';
const RUBRIC_APPROVAL_PATH =
  'docs/evaluation/PHASE_2B_2D_METHOD_V2_HUMAN_LABELLING_RUBRIC_V1_OWNER_APPROVAL.json';

type BindInput = Parameters<typeof bindExactR50PackageForR51>[0];
const genuineInput = (): BindInput => ({
  packageBytes: bytes(R50_BOUND_ARTIFACTS.reviewPackage.path),
  templateBytes: bytes(R50_BOUND_ARTIFACTS.responseTemplate.path),
  indexBytes: bytes(R50_BOUND_ARTIFACTS.internalIndex.path),
  censusBytes: bytes(R50_BOUND_ARTIFACTS.census.path),
  rubricBytes: bytes(RUBRIC_PATH),
  rubricApprovalBytes: bytes(RUBRIC_APPROVAL_PATH),
});
const refusalCode = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
};

let binding: R51PackageBinding;
beforeAll(() => {
  binding = bindExactR50PackageForR51(genuineInput());
});

// ---------------------------------------------------------------------------
// A. BINDING AND DRIFT.
// ---------------------------------------------------------------------------

describe('2D-A4 R51: the exact R50 package and R49 rubric bind', () => {
  it('binds 222 records in goldId ASC order under the exact package hash and rubric', () => {
    expect(binding.packageHash).toBe(PACKAGE_HASH);
    expect(binding.rubricSha256).toBe(RUBRIC_SHA256);
    expect(binding.rubricVersion).toBe(RUBRIC_VERSION);
    expect(binding.records).toHaveLength(222);
    expect(binding.goldIds).toEqual([...binding.goldIds].sort());
    expect(new Set(binding.goldIds).size).toBe(222);
    expect(binding.split).toBe('DEV_TRAIN');
    expect(binding.r50Terminal).toBe('8c0d36af8b5a28403ee781a754d50f979dbf2e0b');
  });

  it('the rubric binds by exact bytes: 22125 bytes, sha e3af57d8…1d69', () => {
    expect(bytes(RUBRIC_PATH).length).toBe(22125);
    expect(createHash('sha256').update(bytes(RUBRIC_PATH)).digest('hex')).toBe(RUBRIC_SHA256);
    expect(binding.rubricText).toBe(text(RUBRIC_PATH));
  });

  const mutatePackage = (edit: (lines: string[]) => string[]): BindInput => {
    const lines = text(R50_BOUND_ARTIFACTS.reviewPackage.path).slice(0, -1).split('\n');
    return {
      ...genuineInput(),
      packageBytes: Buffer.from(edit(lines).join('\n') + '\n', 'utf8'),
    };
  };

  it('refuses one changed package record', () => {
    const input = mutatePackage((lines) => {
      const record = JSON.parse(lines[7]!) as Record<string, unknown>;
      record['mainText'] = `${String(record['mainText'])} `;
      lines[7] = JSON.stringify(record);
      return lines;
    });
    expect(refusalCode(() => bindExactR50PackageForR51(input))).toBe('R51_PACKAGE_HASH_MISMATCH');
  });

  it('refuses a changed package order', () => {
    const input = mutatePackage((lines) => {
      [lines[3], lines[4]] = [lines[4]!, lines[3]!];
      return lines;
    });
    expect(refusalCode(() => bindExactR50PackageForR51(input))).toBe('R51_PACKAGE_ORDER_INVALID');
  });

  it('refuses a changed goldId', () => {
    const input = mutatePackage((lines) => {
      const record = JSON.parse(lines[0]!) as Record<string, unknown>;
      record['goldId'] = 'g0000000000000000';
      lines[0] = JSON.stringify(record);
      return lines;
    });
    expect(refusalCode(() => bindExactR50PackageForR51(input))).toBe('R51_PACKAGE_HASH_MISMATCH');
  });

  it('refuses a dropped or an added record', () => {
    expect(
      refusalCode(() => bindExactR50PackageForR51(mutatePackage((lines) => lines.slice(1)))),
    ).toBe('R51_PACKAGE_RECORD_COUNT_MISMATCH');
    expect(
      refusalCode(() =>
        bindExactR50PackageForR51(mutatePackage((lines) => [...lines, lines.at(-1)!])),
      ),
    ).toBe('R51_PACKAGE_RECORD_COUNT_MISMATCH');
  });

  it('refuses a different rubric hash on a record, and a changed rubric file', () => {
    const input = mutatePackage((lines) => {
      const record = JSON.parse(lines[0]!) as Record<string, unknown>;
      record['rubricSha256'] = 'f'.repeat(64);
      lines[0] = JSON.stringify(record);
      return lines;
    });
    expect(refusalCode(() => bindExactR50PackageForR51(input))).toBe('R51_PACKAGE_RECORD_INVALID');
    const rubric = Buffer.from(bytes(RUBRIC_PATH));
    rubric[100] = rubric[100]! ^ 1;
    expect(
      refusalCode(() => bindExactR50PackageForR51({ ...genuineInput(), rubricBytes: rubric })),
    ).toBe('R51_RUBRIC_NOT_BOUND');
  });

  it('refuses a non-blank template, a reviewer-visible index and a drifted census', () => {
    const template = text(R50_BOUND_ARTIFACTS.responseTemplate.path).replace(
      '"verdict":null',
      '"verdict":"NOT_A_UNIT"',
    );
    expect(
      refusalCode(() =>
        bindExactR50PackageForR51({ ...genuineInput(), templateBytes: Buffer.from(template) }),
      ),
    ).toBe('R51_TEMPLATE_MISMATCH');
    const index = text(R50_BOUND_ARTIFACTS.internalIndex.path).replace(
      '"reviewerVisible": false',
      '"reviewerVisible": true',
    );
    expect(
      refusalCode(() =>
        bindExactR50PackageForR51({ ...genuineInput(), indexBytes: Buffer.from(index) }),
      ),
    ).toBe('R51_INDEX_MISMATCH');
    const census = text(R50_BOUND_ARTIFACTS.census.path).replace(PACKAGE_HASH, '0'.repeat(64));
    expect(
      refusalCode(() =>
        bindExactR50PackageForR51({ ...genuineInput(), censusBytes: Buffer.from(census) }),
      ),
    ).toBe('R51_CENSUS_MISMATCH');
  });

  it('an unminted look-alike binding is refused everywhere', () => {
    const forged = { ...binding };
    expect(refusalCode(() => requireCompletedResponseFile('', forged))).toBe(
      'R51_BINDING_NOT_MINTED',
    );
    expect(refusalCode(() => buildR51Census({ binding: forged } as never))).toBe(
      'R51_BINDING_NOT_MINTED',
    );
  });
});

// ---------------------------------------------------------------------------
// B. THE COMMITTED OFFLINE TOOL.
// ---------------------------------------------------------------------------

describe('2D-A4 R51: the committed offline review tool', () => {
  let html: string;
  let code: string;
  beforeAll(() => {
    html = text(R51_ARTIFACT_PATHS.reviewTool);
    // The page minus its embedded frozen DATA: what the tool itself says and does.
    code = [TOOL_SCRIPT_IDS.package, TOOL_SCRIPT_IDS.rubric].reduce(
      (page, id) => page.replace(extractToolScript(page, id), ''),
      html,
    );
  });

  it('is exactly what the tooling renders from the bound package (reproducible)', async () => {
    expect(await renderReviewToolHtml({ binding }, { repoRoot: REPO_ROOT })).toBe(html);
  });

  it('embeds the exact R50 package text: 222 records, record for record, same order, same hash', () => {
    const embedded = (
      JSON.parse(extractToolScript(html, TOOL_SCRIPT_IDS.package)) as {
        packageJsonl: string;
      }
    ).packageJsonl;
    expect(embedded).toBe(text(R50_BOUND_ARTIFACTS.reviewPackage.path));
    expect(createHash('sha256').update(embedded).digest('hex')).toBe(
      R50_BOUND_ARTIFACTS.reviewPackage.fileSha256,
    );
    const records = embedded
      .slice(0, -1)
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(records).toHaveLength(222);
    expect(records).toEqual(binding.records);
  });

  it('embeds the exact rubric bytes and binds its SHA-256; it carries no second rubric', () => {
    const embedded = (
      JSON.parse(extractToolScript(html, TOOL_SCRIPT_IDS.rubric)) as {
        rubricJson: string;
      }
    ).rubricJson;
    expect(embedded).toBe(text(RUBRIC_PATH));
    const bound = JSON.parse(extractToolScript(html, TOOL_SCRIPT_IDS.binding)) as Record<
      string,
      unknown
    >;
    expect(bound['rubricSha256']).toBe(RUBRIC_SHA256);
    expect(bound['packageHash']).toBe(PACKAGE_HASH);
    expect(bound['itemCount']).toBe(222);
    expect(bound['completedResponseFileName']).toBe(COMPLETED_RESPONSE_FILE_NAME);
    // Rule text the reviewer reads comes from the embedded rubric, never the code.
    const rubric = JSON.parse(embedded) as Record<string, unknown>;
    for (const section of RUBRIC_SECTIONS_SHOWN) expect(rubric[section]).toBeDefined();
    expect(bound['rubricSectionsShown']).toEqual([...RUBRIC_SECTIONS_SHOWN]);
    expect(code).not.toContain('What is the PRIMARY SUBJECT');
    expect(code).not.toContain('MATERIAL, PROMINENT');
  });

  it('embeds the review core byte-for-byte', () => {
    expect(extractToolScript(html, TOOL_SCRIPT_IDS.core)).toBe('\n' + REVIEW_CORE_SOURCE);
  });

  it('is offline: no remote resource, frame, form, link, request API or socket', () => {
    expect(code).not.toMatch(/https?:\/\//i);
    expect(code).not.toMatch(/<script[^>]*\ssrc=/i);
    expect(code).not.toMatch(/<link\b/i);
    expect(code).not.toMatch(/<(iframe|frame|object|embed|img|video|audio|form|base)\b/i);
    expect(code).not.toMatch(/<a\b/i);
    expect(code).not.toMatch(/\saction=|\shref=|\ssrc=/i);
    expect(code).not.toMatch(
      /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|\bimport\s*\(|window\.open|location\s*\.\s*(href|assign|replace)|@import|url\s*\(/,
    );
    expect(html).toContain(`content="${CONTENT_SECURITY_POLICY}"`);
    expect(CONTENT_SECURITY_POLICY).toContain("connect-src 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("form-action 'none'");
  });

  it('asks the browser not to machine-translate', () => {
    expect(html).toMatch(/<html lang="en" translate="no" class="notranslate">/);
    expect(html).toContain('<meta name="google" content="notranslate" />');
  });

  it('has no AI, provider or translation integration', () => {
    expect(code).not.toMatch(
      /anthropic|openai|generativelanguage|googleapis|gemini\s*\(|claude-agent|api\.|translate\.google|deepl|apiKey|api_key|Authorization|Bearer/i,
    );
  });

  it('renders URLs as text (no link element is created from any record)', () => {
    const ui = extractToolScript(html, TOOL_SCRIPT_IDS.ui);
    // The only anchor the UI ever creates is the local Blob download.
    expect(ui.match(/createElement\('a'\)/g)).toHaveLength(1);
    expect(ui).toContain('URL.createObjectURL(blob)');
    expect(ui).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
    expect(ui).toMatch(/requestedUrl, 'url mono'/);
  });

  it('is blind: no structured field or DOM-bound key names sampling, scoring or model metadata', () => {
    const banned =
      /inSetP|inSetR|set_?p\b|set_?r\b|\brank|score|candidate|signal|\bgate|survivor|exclusion|generation|disposition|stratum|threshold|prediction|classifier|model[A-Z_]/i;
    const keys = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.flatMap(keys)
        : value !== null && typeof value === 'object'
          ? Object.entries(value).flatMap(([k, v]) => [k, ...keys(v)])
          : [];
    expect(keys(binding.records).filter((k) => banned.test(k))).toEqual([]);
    const bound = JSON.parse(extractToolScript(html, TOOL_SCRIPT_IDS.binding)) as unknown;
    expect(keys(bound).filter((k) => banned.test(k))).toEqual([]);
    // The tool's own markup and code (frozen page and rubric data excluded).
    expect(code.match(banned)).toBeNull();
    expect(
      [...code.matchAll(/\s(id|class|name|data-[a-z-]+)="([^"]*)"/g)].map((m) => m[2]),
    ).not.toContainEqual(expect.stringMatching(banned));
  });

  it('keeps the five empty-mainText items: shown, never dropped, never auto-labelled', () => {
    const empty = binding.records.filter((record) => record.mainText === '');
    expect(empty).toHaveLength(5);
    for (const record of empty) {
      expect(record.sourcePresentations.length).toBeGreaterThan(0);
    }
    const ui = extractToolScript(html, TOOL_SCRIPT_IDS.ui);
    expect(ui).toContain('record.mainText.length === 0');
    expect(ui).not.toMatch(/mainText[^\n]*NEEDS_REVIEW|NEEDS_REVIEW[^\n]*mainText/);
  });

  it('preselects no choice: every radio is created unchecked', () => {
    const ui = extractToolScript(html, TOOL_SCRIPT_IDS.ui);
    expect(ui).toContain('input.checked = false;');
    expect(ui).not.toMatch(/checked\s*=\s*true|setAttribute\('checked'|\schecked\b(?!\s*=)/);
    expect(html).not.toMatch(/<input[^>]*\schecked/);
  });
});

// ---------------------------------------------------------------------------
// C. THE SESSION CORE, AS SHIPPED, ON SYNTHETIC ITEMS.
// ---------------------------------------------------------------------------

describe('2D-A4 R51: the shipped review core enforces single review and language deferral', () => {
  let core: ReviewCore;
  const synthetic: ReviewBinding = {
    packageHash: 'a'.repeat(64),
    rubricVersion: RUBRIC_VERSION,
    rubricSha256: RUBRIC_SHA256,
    goldIds: ['g0000000000000001', 'g0000000000000002', 'g0000000000000003'],
  };
  const [ONE, TWO, THREE] = synthetic.goldIds as [string, string, string];
  const fresh = (): ReviewDraft => {
    const result = core.createDraft(synthetic);
    if (!result.ok) throw new Error(result.message);
    return result.draft;
  };
  const ok = (result: ReturnType<ReviewCore['createDraft']>): ReviewDraft => {
    if (!result.ok) throw new Error(`${result.refusal}: ${result.message}`);
    return result.draft;
  };
  const unitPage = {
    verdict: 'UNIT_PAGE',
    unit_type: 'OTHER_UNIT',
    hard_negative: false,
    reviewNote: null,
  };
  const notAUnit = (hard: boolean) => ({
    verdict: 'NOT_A_UNIT',
    unit_type: null,
    hard_negative: hard,
    reviewNote: null,
  });
  const needsReview = {
    verdict: 'NEEDS_REVIEW',
    unit_type: null,
    hard_negative: false,
    reviewNote: 'synthetic note',
  };

  beforeAll(() => {
    // The core exactly as committed in the HTML, run in a bare context.
    core = loadReviewCore(
      extractToolScript(text(R51_ARTIFACT_PATHS.reviewTool), TOOL_SCRIPT_IDS.core),
    );
  });

  it('a new draft is non-canonical, bound, and wholly unreviewed', () => {
    const draft = fresh();
    expect(draft.kind).toBe(DRAFT_KIND);
    expect(draft.canonical).toBe(false);
    expect(core.progress(draft)).toEqual({
      total: 3,
      completed: 0,
      unreviewed: 3,
      deferredForLanguage: 0,
    });
    expect(core.storageKey(synthetic)).toContain(synthetic.packageHash);
    expect(core.storageKey(synthetic)).toContain(RUBRIC_SHA256);
  });

  it('a reviewer completing an item produces exactly one response', () => {
    const draft = ok(core.completeItem(fresh(), ONE, 'reviewer-01', notAUnit(true)));
    expect(draft.items[0]).toEqual({
      goldId: ONE,
      state: 'COMPLETED',
      response: { reviewerActorKey: 'reviewer-01', ...notAUnit(true) },
    });
    expect(core.progress(draft).completed).toBe(1);
  });

  it('a language deferral is workflow, records no semantic response, and is not NEEDS_REVIEW', () => {
    const draft = ok(core.deferItemForLanguage(fresh(), TWO, 'reviewer-01'));
    expect(draft.items[1]).toEqual({
      goldId: TWO,
      state: LANGUAGE_DEFER_STATE,
      deferredBy: ['reviewer-01'],
    });
    expect(JSON.stringify(draft.items[1])).not.toMatch(
      /verdict|NEEDS_REVIEW|unit_type|hard_negative/,
    );
    expect(core.progress(draft)).toEqual({
      total: 3,
      completed: 0,
      unreviewed: 2,
      deferredForLanguage: 1,
    });
  });

  it('a second human may complete a previously deferred item: one final response', () => {
    let draft = ok(core.deferItemForLanguage(fresh(), TWO, 'reviewer-01'));
    draft = ok(core.completeItem(draft, TWO, 'reviewer-02', unitPage));
    expect(draft.items[1]).toEqual({
      goldId: TWO,
      state: 'COMPLETED',
      response: { reviewerActorKey: 'reviewer-02', ...unitPage },
    });
  });

  it('a second human adding a second label to a completed item is refused', () => {
    const draft = ok(core.completeItem(fresh(), ONE, 'reviewer-01', notAUnit(false)));
    const second = core.completeItem(draft, ONE, 'reviewer-02', unitPage);
    expect(second.ok).toBe(false);
    expect(second.ok === false && second.refusal).toBe('SECOND_LABEL_REFUSED');
    expect(core.withdrawOwnLabel(draft, ONE, 'reviewer-02').ok).toBe(false);
    expect(core.deferItemForLanguage(draft, ONE, 'reviewer-02').ok).toBe(false);
  });

  it('a human may correct their OWN draft label before the final export', () => {
    let draft = ok(core.completeItem(fresh(), ONE, 'reviewer-01', notAUnit(false)));
    draft = ok(core.completeItem(draft, ONE, 'reviewer-01', notAUnit(true)));
    expect(draft.items[0]).toMatchObject({ response: { hard_negative: true } });
    draft = ok(core.withdrawOwnLabel(draft, ONE, 'reviewer-01'));
    expect(draft.items[0]).toEqual({ goldId: ONE, state: 'UNREVIEWED' });
  });

  it('enforces the matrix after the human verdict, and never repairs', () => {
    const bad = [
      { verdict: 'UNIT_PAGE', unit_type: null, hard_negative: false, reviewNote: null },
      { verdict: 'UNIT_PAGE', unit_type: 'LANGUAGE_CENTRE', hard_negative: true, reviewNote: null },
      { verdict: 'NOT_A_UNIT', unit_type: 'OTHER_UNIT', hard_negative: false, reviewNote: null },
      { verdict: 'NOT_A_UNIT', unit_type: null, hard_negative: null, reviewNote: null },
      { verdict: 'NEEDS_REVIEW', unit_type: null, hard_negative: true, reviewNote: null },
      { verdict: 'MAYBE', unit_type: null, hard_negative: false, reviewNote: null },
      { verdict: 'UNIT_PAGE', unit_type: 'FACULTY', hard_negative: false, reviewNote: null },
      { verdict: null, unit_type: null, hard_negative: false, reviewNote: null },
      { verdict: 'NEEDS_REVIEW', unit_type: null, hard_negative: false, reviewNote: '   ' },
    ];
    for (const choice of bad) {
      const result = core.completeItem(fresh(), ONE, 'reviewer-01', choice);
      expect(result.ok, JSON.stringify(choice)).toBe(false);
    }
    expect(core.completeItem(fresh(), ONE, 'Reviewer One', unitPage).ok).toBe(false);
    expect(core.completeItem(fresh(), ONE, 'someone@example.org', unitPage).ok).toBe(false);
    expect(core.completeItem(fresh(), 'g9999999999999999', 'reviewer-01', unitPage).ok).toBe(false);
  });

  it('field rules follow ONLY the chosen verdict and the frozen matrix', () => {
    expect(core.fieldRulesAfterVerdict('UNIT_PAGE')).toEqual({
      unitTypeOpenToHuman: true,
      unitTypeValues: [
        'INTERNATIONAL_MOBILITY_OFFICE',
        'LANGUAGE_CENTRE',
        'LANGUAGE_DEPARTMENT',
        'OTHER_UNIT',
      ],
      unitTypeFixedNull: false,
      hardNegativeOpenToHuman: false,
      hardNegativeFixedFalse: true,
    });
    expect(core.fieldRulesAfterVerdict('NOT_A_UNIT')).toMatchObject({
      unitTypeFixedNull: true,
      hardNegativeOpenToHuman: true,
      hardNegativeFixedFalse: false,
    });
    expect(core.fieldRulesAfterVerdict('NEEDS_REVIEW')).toMatchObject({
      unitTypeFixedNull: true,
      hardNegativeFixedFalse: true,
    });
    expect(core.fieldRulesAfterVerdict(null)).toBeNull();
  });

  it('final export refuses while any item is unreviewed or language-deferred', () => {
    let draft = ok(core.completeItem(fresh(), ONE, 'reviewer-01', notAUnit(true)));
    draft = ok(core.completeItem(draft, TWO, 'reviewer-01', unitPage));
    draft = ok(core.deferItemForLanguage(draft, THREE, 'reviewer-01'));
    const result = core.finalExportJsonl(draft, synthetic);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.refusal).toBe('NOT_COMPLETE');
  });

  it('the final export holds exactly one row per item, response keys only, no workflow state', () => {
    let draft = ok(core.deferItemForLanguage(fresh(), THREE, 'reviewer-01'));
    draft = ok(core.completeItem(draft, ONE, 'reviewer-01', notAUnit(true)));
    draft = ok(core.completeItem(draft, TWO, 'reviewer-01', unitPage));
    draft = ok(core.completeItem(draft, THREE, 'reviewer-02', needsReview));
    const result = core.finalExportJsonl(draft, synthetic);
    if (!result.ok) throw new Error(result.message);
    const rows = result.text
      .slice(0, -1)
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(rows.map((r) => r['goldId'])).toEqual(synthetic.goldIds);
    for (const row of rows) expect(Object.keys(row)).toEqual([...COMPLETED_RESPONSE_KEYS]);
    expect(result.text).not.toMatch(
      new RegExp(`${LANGUAGE_DEFER_STATE}|UNREVIEWED|COMPLETED|deferredBy|state`),
    );
    expect(rows.map((r) => r['reviewerActorKey'])).toEqual([
      'reviewer-01',
      'reviewer-01',
      'reviewer-02',
    ]);
  });

  it('draft export/import round-trips and refuses a different package or rubric', () => {
    const draft = ok(
      core.deferItemForLanguage(
        ok(core.completeItem(fresh(), ONE, 'reviewer-01', unitPage)),
        TWO,
        'reviewer-01',
      ),
    );
    const serialised = core.serialiseDraft(draft);
    expect(JSON.parse(serialised)).toMatchObject({
      kind: 'NON_CANONICAL_HUMAN_REVIEW_DRAFT',
      canonical: false,
    });
    expect(ok(core.parseDraft(serialised, synthetic))).toEqual(draft);
    expect(core.parseDraft(serialised, { ...synthetic, packageHash: 'b'.repeat(64) }).ok).toBe(
      false,
    );
    expect(core.parseDraft(serialised, { ...synthetic, rubricSha256: 'c'.repeat(64) }).ok).toBe(
      false,
    );
    expect(
      core.parseDraft(serialised.replace('NON_CANONICAL_HUMAN_REVIEW_DRAFT', 'GOLD'), synthetic).ok,
    ).toBe(false);
    expect(core.parseDraft('not json', synthetic).ok).toBe(false);
  });

  it('merging drafts never duplicates a completed item, and refuses two different labels', () => {
    const a = ok(
      core.deferItemForLanguage(
        ok(core.completeItem(fresh(), ONE, 'reviewer-01', unitPage)),
        TWO,
        'reviewer-01',
      ),
    );
    const b = ok(
      core.completeItem(
        ok(core.completeItem(fresh(), ONE, 'reviewer-01', unitPage)),
        TWO,
        'reviewer-02',
        notAUnit(false),
      ),
    );
    const merged = ok(core.mergeDrafts(a, b));
    expect(merged.items.filter((i) => i.state === 'COMPLETED')).toHaveLength(2);
    expect(merged.items[1]).toMatchObject({
      state: 'COMPLETED',
      response: { reviewerActorKey: 'reviewer-02' },
    });
    const c = ok(core.completeItem(fresh(), ONE, 'reviewer-03', notAUnit(true)));
    const conflict = core.mergeDrafts(a, c);
    expect(conflict.ok === false && conflict.refusal).toBe('SECOND_LABEL_REFUSED');
  });

  it('the shipped core exports a file the R51 validator shape-checks (synthetic binding)', () => {
    const real = binding;
    // Run the same core over the REAL goldIds with a synthetic-only draft held
    // in memory: it must refuse to export anything, because nothing is labelled.
    const draft = ok(
      core.createDraft({
        packageHash: real.packageHash,
        rubricVersion: real.rubricVersion,
        rubricSha256: real.rubricSha256,
        goldIds: real.goldIds,
      }),
    );
    const result = core.finalExportJsonl(draft, {
      packageHash: real.packageHash,
      rubricVersion: real.rubricVersion,
      rubricSha256: real.rubricSha256,
      goldIds: real.goldIds,
    });
    expect(result.ok === false && result.refusal).toBe('NOT_COMPLETE');
    expect(result.ok === false && result.message).toBe(
      '222 unreviewed and 0 language-deferred items remain',
    );
  });
});

// ---------------------------------------------------------------------------
// D. THE COMPLETED-RESPONSE FILE VALIDATOR (synthetic responses).
// ---------------------------------------------------------------------------

describe('2D-A4 R51: the completed-response validator', () => {
  // Semantic cases run over INVENTED goldIds and invented responses only.
  const SYNTHETIC_IDS = Array.from(
    { length: 12 },
    (_, i) => `g${(i + 1).toString(16).padStart(16, '0')}`,
  );
  const expectation = {
    goldIds: SYNTHETIC_IDS,
    rubricVersion: RUBRIC_VERSION,
    rubricSha256: RUBRIC_SHA256,
  };
  const row = (goldId: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({
    goldId,
    rubricVersion: RUBRIC_VERSION,
    rubricSha256: RUBRIC_SHA256,
    reviewerActorKey: 'reviewer-01',
    verdict: 'NOT_A_UNIT',
    unit_type: null,
    hard_negative: false,
    reviewNote: null,
    ...over,
  });
  const file = (rows: Record<string, unknown>[]): string =>
    rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
  const legalRows = (): Record<string, unknown>[] => SYNTHETIC_IDS.map((id) => row(id));

  it('accepts every legal matrix combination and mixed actor keys', () => {
    const rows = legalRows();
    rows[0] = row(SYNTHETIC_IDS[0]!, {
      verdict: 'UNIT_PAGE',
      unit_type: 'INTERNATIONAL_MOBILITY_OFFICE',
    });
    rows[1] = row(SYNTHETIC_IDS[1]!, { verdict: 'UNIT_PAGE', unit_type: 'LANGUAGE_CENTRE' });
    rows[2] = row(SYNTHETIC_IDS[2]!, { verdict: 'UNIT_PAGE', unit_type: 'LANGUAGE_DEPARTMENT' });
    rows[3] = row(SYNTHETIC_IDS[3]!, { verdict: 'UNIT_PAGE', unit_type: 'OTHER_UNIT' });
    rows[4] = row(SYNTHETIC_IDS[4]!, { hard_negative: true, reviewerActorKey: 'reviewer-02' });
    rows[5] = row(SYNTHETIC_IDS[5]!, { verdict: 'NEEDS_REVIEW', reviewNote: 'synthetic' });
    expect(completedResponseFileProblems(file(rows), expectation)).toEqual([]);
  });

  const illegal: [string, (rows: Record<string, unknown>[]) => Record<string, unknown>[]][] = [
    [
      'UNIT_PAGE missing unit_type',
      (r) => ((r[0] = row(SYNTHETIC_IDS[0]!, { verdict: 'UNIT_PAGE' })), r),
    ],
    [
      'NOT_A_UNIT with unit_type',
      (r) => ((r[0] = row(SYNTHETIC_IDS[0]!, { unit_type: 'OTHER_UNIT' })), r),
    ],
    [
      'UNIT_PAGE hard_negative true',
      (r) => (
        (r[0] = row(SYNTHETIC_IDS[0]!, {
          verdict: 'UNIT_PAGE',
          unit_type: 'OTHER_UNIT',
          hard_negative: true,
        })),
        r
      ),
    ],
    [
      'NEEDS_REVIEW hard_negative true',
      (r) => ((r[0] = row(SYNTHETIC_IDS[0]!, { verdict: 'NEEDS_REVIEW', hard_negative: true })), r),
    ],
    [
      'unknown verdict',
      (r) => (
        (r[0] = row(SYNTHETIC_IDS[0]!, { verdict: 'DEFERRED_FOR_LANGUAGE_COMPETENT_HUMAN' })),
        r
      ),
    ],
    [
      'unknown unit_type',
      (r) => ((r[0] = row(SYNTHETIC_IDS[0]!, { verdict: 'UNIT_PAGE', unit_type: 'FACULTY' })), r),
    ],
    [
      'bad actor key',
      (r) => ((r[0] = row(SYNTHETIC_IDS[0]!, { reviewerActorKey: 'Jane Doe' })), r),
    ],
    ['missing actor key', (r) => ((r[0] = row(SYNTHETIC_IDS[0]!, { reviewerActorKey: null })), r)],
    ['missing row', (r) => r.slice(1)],
    ['duplicate row', (r) => [r[0]!, ...r.slice(0, -1)]],
    ['extra row', (r) => [...r, row('g0000000000000000')]],
    ['wrong order', (r) => [r[1]!, r[0]!, ...r.slice(2)]],
    [
      'wrong rubric hash',
      (r) => ((r[0] = row(SYNTHETIC_IDS[0]!, { rubricSha256: 'f'.repeat(64) })), r),
    ],
    [
      'extra workflow field',
      (r) => ((r[0] = { ...row(SYNTHETIC_IDS[0]!), state: 'COMPLETED' }), r),
    ],
    [
      'missing field',
      (r) => {
        const { reviewNote: _drop, ...rest } = row(SYNTHETIC_IDS[0]!);
        r[0] = rest;
        return r;
      },
    ],
    [
      'incomplete hard_negative',
      (r) => ((r[0] = row(SYNTHETIC_IDS[0]!, { hard_negative: null })), r),
    ],
    ['blank note', (r) => ((r[0] = row(SYNTHETIC_IDS[0]!, { reviewNote: '' })), r)],
  ];

  it.each(illegal)('refuses, never repairs: %s', (_name, edit) => {
    const original = file(edit(legalRows()));
    expect(completedResponseFileProblems(original, expectation).length).toBeGreaterThan(0);
  });

  it('refuses CRLF, a missing final newline, and the blank R50 template itself', () => {
    const good = file(legalRows());
    expect(
      completedResponseFileProblems(good.replace(/\n/g, '\r\n'), expectation).length,
    ).toBeGreaterThan(0);
    expect(completedResponseFileProblems(good.slice(0, -1), expectation).length).toBeGreaterThan(0);
    // The genuine wrapper refuses the blank template as a completed file.
    expect(
      refusalCode(() =>
        requireCompletedResponseFile(text(R50_BOUND_ARTIFACTS.responseTemplate.path), binding),
      ),
    ).toBe('R51_RESPONSE_FILE_INVALID');
    expect(
      completedResponseFileProblems(text(R50_BOUND_ARTIFACTS.responseTemplate.path), binding)
        .length,
    ).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// E. THE AUTHORITY RECORDS, EXACTLY AS RENDERED.
// ---------------------------------------------------------------------------

const records = [
  R51_ARTIFACT_PATHS.ownerApproval,
  R51_ARTIFACT_PATHS.authority,
  R51_ARTIFACT_PATHS.census,
];
const recorded = records.map((p) => existsSync(join(REPO_ROOT, p)));

describe('2D-A4 R51: the authority records are all present or all absent', () => {
  it('never holds a partial set', () => {
    expect(new Set(recorded).size).toBe(1);
  });
});

describe.skipIf(!recorded.every(Boolean))('2D-A4 R51: owner approval, authority and census', () => {
  const sha = (path: string): string => createHash('sha256').update(bytes(path)).digest('hex');
  const json = (path: string): Record<string, unknown> =>
    JSON.parse(text(path)) as Record<string, unknown>;

  it('the owner approval is exactly the rendered record, with the three owner markers', async () => {
    expect(
      await renderJsonArtifact(buildOwnerApprovalRecord(), R51_ARTIFACT_PATHS.ownerApproval, {
        repoRoot: REPO_ROOT,
      }),
    ).toBe(text(R51_ARTIFACT_PATHS.ownerApproval));
    const approval = json(R51_ARTIFACT_PATHS.ownerApproval);
    expect(approval['recordKind']).toBe('OWNER_DEV_TRAIN_HUMAN_SINGLE_REVIEW_APPROVAL');
    expect((approval['ownerDecisions'] as { marker: string }[]).map((d) => d.marker)).toEqual([
      ...R51_OWNER_MARKERS,
    ]);
    expect(approval['authorityFlags']).toEqual(R51_AUTHORITY_FLAGS);
    expect(approval['split']).toBe('DEV_TRAIN');
  });

  it('the authority binds the approval and tool by hash and authorises only human single review', async () => {
    const authority = buildAuthorityRecord({
      binding,
      ownerApprovalSha256: sha(R51_ARTIFACT_PATHS.ownerApproval),
      toolSha256: sha(R51_ARTIFACT_PATHS.reviewTool),
      toolBytes: bytes(R51_ARTIFACT_PATHS.reviewTool).length,
    });
    expect(
      await renderJsonArtifact(authority, R51_ARTIFACT_PATHS.authority, { repoRoot: REPO_ROOT }),
    ).toBe(text(R51_ARTIFACT_PATHS.authority));
    expect(authority['thisFileAuthorises']).toEqual([R51_AUTHORISED_ACTION]);
    expect(authority['reusableForDevConfirmOrFinalHoldout']).toBe(false);
    expect(
      (authority['completedResponseContract'] as Record<string, unknown>)['producedInR51'],
    ).toBe(false);
    expect(
      (authority['completedResponseContract'] as Record<string, unknown>)['expectedRecords'],
    ).toBe(222);
  });

  it('the census is exactly the rendered aggregate: zero labels, tool ready, sealed splits shut', async () => {
    const census = buildR51Census({
      binding,
      ownerApprovalSha256: sha(R51_ARTIFACT_PATHS.ownerApproval),
      authoritySha256: sha(R51_ARTIFACT_PATHS.authority),
      toolSha256: sha(R51_ARTIFACT_PATHS.reviewTool),
    });
    expect(
      await renderJsonArtifact(census, R51_ARTIFACT_PATHS.census, { repoRoot: REPO_ROOT }),
    ).toBe(text(R51_ARTIFACT_PATHS.census));
    expect(census['terminalState']).toBe(R51_SUCCESS_TERMINAL);
    expect(census['thisFileAuthorises']).toEqual([]);
    expect(census['labelBoundary']).toMatchObject({
      humanLabelsAlreadyPresent: 0,
      modelLabels: 0,
      humanReviewExecuted: false,
      completedResponseFileExists: false,
      devTrainRealisedSetREnrichment: 'NOT_YET_MEASURABLE_PRE_LABEL',
    });
    expect(census['access']).toMatchObject({
      databaseConnections: 0,
      devConfirmOpened: false,
      finalHoldoutOpened: false,
    });
    expect(census['review']).toMatchObject({
      itemsAuthorised: 222,
      singleReviewPerItem: true,
      dualReview: false,
      toolReady: true,
    });
  });
});
