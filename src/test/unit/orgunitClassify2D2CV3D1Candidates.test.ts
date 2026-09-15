/**
 * PHASE 2B-2D2C-V3D1 — THE PROMPT-V3 DESIGN RECORD IS EXACT, MEASURED AND
 * FREE OF CASE-SPECIFIC CONTENT, AND NOTHING WAS IMPLEMENTED.
 *
 * Every candidate is applied IN MEMORY to the frozen Prompt V2: its anchors
 * must be unique, its recorded character/byte deltas must be what the
 * application measures, and the result must be a different prompt identity
 * from both v1 and v2. Every inserted paragraph is screened for
 * organisation identifiers, URLs, gold ids, digits, copied titles and
 * evaluation vocabulary.
 *
 * 2D2C-V3: the production prompt is now v3 = v2 + Candidate B (carrying A)
 * + Candidate C. The frozen v2 base is RECONSTRUCTED from it through the
 * harness lineage, the record's candidates are applied to that base, and
 * applying B + C to it must reproduce the production v3 byte for byte.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ORGUNIT_CLASSIFIER_PROMPT_VERSION,
  ORGUNIT_CLASSIFIER_SYSTEM_PROMPT,
} from '../../orgunits/classify/prompt.js';
import {
  applyCandidateDelta,
  CandidateDeltaError,
  screenCandidateText,
  type CandidateDesign,
} from '../harness/phase2b2d2c/v3d1/candidates.js';
import {
  v2FromV3,
  v3FromV4,
  v4FromV5,
  V3_DELTA_OPERATIONS,
  V3_PROMPT_SHA256,
} from '../harness/phase2b2d2c/promptLineage.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const RECORD_PATH = 'docs/evaluation/PHASE_2B_2D2C_PROMPT_V3_DESIGN_CANDIDATES_V1.json';
const DEV_LABELS =
  'src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-dev-labels-v1.jsonl';
const V1_SHA256 = '65f7f327ad14e78aaf3024cb7253e979b1e360fdcd1a58081fccc08fdb0facd0';
const V2_SHA256 = '181a5d6fec9763be5a57e7e4d08c7d8c8a9d9e21838df2ea3e05dd680e4c7635';

interface DesignRecord {
  readonly basePrompt: {
    readonly version: string;
    readonly sha256: string;
    readonly comparatorSha256: string;
  };
  readonly prohibitedContentPolicy: { readonly forbiddenSubstrings: readonly string[] };
  readonly candidates: readonly (CandidateDesign & {
    readonly predictedItemsHelped: readonly string[];
    readonly itemsAtRisk: readonly string[];
  })[];
}

const record = JSON.parse(readFileSync(join(REPO_ROOT, RECORD_PATH), 'utf8')) as DesignRecord;
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
/**
 * The frozen Prompt V3 identity, reconstructed from the production v5 prompt
 * (2D2C-F0N/V5I1: the production prompt is now v4 + E1, never v3 itself;
 * reverse v5 -> v4 -> v3 in sequence).
 */
const RECONSTRUCTED_V3 = v3FromV4(v4FromV5(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT));
/** The frozen Prompt V2 base, reconstructed from the reconstructed v3 (2D2C-V3). */
const PROMPT_V2 = v2FromV3(RECONSTRUCTED_V3);
const devTitles = readFileSync(join(REPO_ROOT, DEV_LABELS), 'utf8')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line) as { title: string | null; organisationName: string })
  .flatMap((r) => [r.title ?? '', r.organisationName]);

describe('the design record is anchored on the frozen Prompt V2, which the production v3 prompt reconstructs', () => {
  it('names the v2 identity and the v1 comparator by exact SHA-256, matching the reconstructed base', () => {
    expect(record.basePrompt.version).toBe('orgunit-classifier-prompt-v2');
    expect(record.basePrompt.sha256).toBe(V2_SHA256);
    expect(record.basePrompt.comparatorSha256).toBe(V1_SHA256);
    expect(sha256(PROMPT_V2)).toBe(V2_SHA256);
  });

  it("2D2C-V3 (reconstructed): the production v5 prompt's v3 lineage IS the record's Candidate B (carrying A) plus C applied to v2", () => {
    expect(ORGUNIT_CLASSIFIER_PROMPT_VERSION).toBe('orgunit-classifier-prompt-v5');
    expect(sha256(RECONSTRUCTED_V3)).toBe(V3_PROMPT_SHA256);
    const b = record.candidates.find((c) => c.id === 'B')!;
    const c = record.candidates.find((c) => c.id === 'C')!;
    const a = record.candidates.find((c) => c.id === 'A')!;
    // B carries A byte for byte (its anchorIdentity prose differs, its anchor and text bytes do not),
    // so the combined delta is B + C and A is never applied on top.
    expect(b.operations[1]!.kind).toBe(a.operations[0]!.kind);
    expect(b.operations[1]!.anchorParagraph).toBe(a.operations[0]!.anchorParagraph);
    expect(b.operations[1]!.text).toBe(a.operations[0]!.text);
    const combined: CandidateDesign = {
      id: 'B+C',
      name: 'B carrying A, plus C',
      operations: [...b.operations, ...c.operations],
      measuredDelta: { characters: 2_708, utf8Bytes: 2_706 },
      changesPromptIdentity: true,
    };
    const applied = applyCandidateDelta(PROMPT_V2, combined);
    expect(applied.text).toBe(RECONSTRUCTED_V3);
    expect(applied.characterDelta).toBe(2_708);
    expect(applied.utf8ByteDelta).toBe(2_706);
    // The harness lineage carries the same three operations, byte for byte.
    expect(
      V3_DELTA_OPERATIONS.map((op) => ({
        kind: op.kind,
        anchor: op.anchorParagraph,
        text: op.text,
      })),
    ).toEqual(
      combined.operations.map((op) => ({
        kind: op.kind,
        anchor: op.anchorParagraph,
        text: op.text,
      })),
    );
    // Applying A after B is refused: its anchor no longer exists.
    expect(() =>
      applyCandidateDelta(PROMPT_V2, {
        ...combined,
        operations: [...b.operations, ...a.operations],
      }),
    ).toThrow(CandidateDeltaError);
  });

  it('offers no more than three candidates, each with at least one operation', () => {
    expect(record.candidates.length).toBeGreaterThan(0);
    expect(record.candidates.length).toBeLessThanOrEqual(3);
    for (const c of record.candidates) expect(c.operations.length).toBeGreaterThan(0);
  });
});

describe.each(record.candidates.map((c) => [c.id, c] as const))(
  'candidate %s',
  (_id, candidate) => {
    it('applies to Prompt V2 with unique anchors and reproduces its recorded character and byte deltas', () => {
      const applied = applyCandidateDelta(PROMPT_V2, candidate);
      expect(applied.characterDelta).toBe(candidate.measuredDelta.characters);
      expect(applied.utf8ByteDelta).toBe(candidate.measuredDelta.utf8Bytes);
    });

    it('changes the prompt identity: the result is neither v1 nor v2', () => {
      const applied = applyCandidateDelta(PROMPT_V2, candidate);
      expect(candidate.changesPromptIdentity).toBe(true);
      expect(applied.sha256).not.toBe(V2_SHA256);
      expect(applied.sha256).not.toBe(V1_SHA256);
    });

    it('touches only its anchors: every other v2 paragraph survives byte for byte', () => {
      const applied = applyCandidateDelta(PROMPT_V2, candidate);
      const anchors = new Set(candidate.operations.map((o) => o.anchorParagraph));
      for (const paragraph of PROMPT_V2.split('\n\n')) {
        if (anchors.has(paragraph)) continue;
        expect(applied.text, paragraph.slice(0, 60)).toContain(paragraph);
      }
    });

    it('carries no organisation identifier, URL, gold id, digit, copied title or evaluation vocabulary', () => {
      expect(
        screenCandidateText(candidate, {
          forbiddenSubstrings: record.prohibitedContentPolicy.forbiddenSubstrings,
          forbiddenTitles: devTitles,
        }),
      ).toEqual([]);
    });

    it('names only frozen DEVELOPMENT ids in its predicted-help and at-risk lists (fixture data, not prompt text)', () => {
      const devIds = new Set(
        readFileSync(join(REPO_ROOT, DEV_LABELS), 'utf8')
          .trim()
          .split('\n')
          .map((line) => (JSON.parse(line) as { goldId: string }).goldId),
      );
      for (const id of [...candidate.predictedItemsHelped, ...candidate.itemsAtRisk]) {
        expect(devIds.has(id), id).toBe(true);
      }
    });
  },
);

describe('the delta mechanism refuses what it must', () => {
  const base = 'alpha\n\nbeta\n\nalpha';
  it('refuses an anchor that occurs more than once', () => {
    expect(() =>
      applyCandidateDelta(base, {
        id: 'x',
        name: 'x',
        operations: [{ kind: 'REPLACE_PARAGRAPH', anchorParagraph: 'alpha', text: 'gamma' }],
        measuredDelta: { characters: 0, utf8Bytes: 0 },
        changesPromptIdentity: true,
      }),
    ).toThrow(CandidateDeltaError);
  });
  it('refuses an absent anchor and empty text', () => {
    const op = (anchor: string, text: string): CandidateDesign => ({
      id: 'x',
      name: 'x',
      operations: [{ kind: 'INSERT_PARAGRAPH_AFTER', anchorParagraph: anchor, text }],
      measuredDelta: { characters: 0, utf8Bytes: 0 },
      changesPromptIdentity: true,
    });
    expect(() => applyCandidateDelta(base, op('delta', 'x'))).toThrow(CandidateDeltaError);
    expect(() => applyCandidateDelta(base, op('beta', ''))).toThrow(CandidateDeltaError);
  });
  it('the screen catches a gold id, a URL, a digit and a forbidden substring', () => {
    const findings = screenCandidateText(
      {
        id: 'x',
        name: 'x',
        operations: [
          {
            kind: 'INSERT_PARAGRAPH_AFTER',
            anchorParagraph: 'beta',
            text: 'see g0123456789abcdef at https://example.org, 2 items, HOLDOUT',
          },
        ],
        measuredDelta: { characters: 0, utf8Bytes: 0 },
        changesPromptIdentity: true,
      },
      { forbiddenSubstrings: ['HOLDOUT'], forbiddenTitles: [] },
    );
    expect([...new Set(findings.map((f) => f.kind))].sort()).toEqual([
      'DIGIT',
      'FORBIDDEN_SUBSTRING',
      'GOLD_ID',
      'URL',
    ]);
  });
});
