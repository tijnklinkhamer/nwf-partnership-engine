/**
 * PHASE 2B-2D2C-V3D1 — THE PROMPT-V3 DESIGN RECORD IS EXACT, MEASURED AND
 * FREE OF CASE-SPECIFIC CONTENT, AND NOTHING WAS IMPLEMENTED.
 *
 * Every candidate is applied IN MEMORY to the frozen Prompt V2: its anchors
 * must be unique, its recorded character/byte deltas must be what the
 * application measures, and the result must be a different prompt identity
 * from both v1 and v2. Every inserted paragraph is screened for
 * organisation identifiers, URLs, gold ids, digits, copied titles and
 * evaluation vocabulary. The production prompt module must still be v2.
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
const devTitles = readFileSync(join(REPO_ROOT, DEV_LABELS), 'utf8')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line) as { title: string | null; organisationName: string })
  .flatMap((r) => [r.title ?? '', r.organisationName]);

describe('the design record is anchored on the frozen Prompt V2 and nothing was implemented', () => {
  it('names the v2 identity and the v1 comparator by exact SHA-256, matching the production module', () => {
    expect(record.basePrompt.version).toBe('orgunit-classifier-prompt-v2');
    expect(record.basePrompt.sha256).toBe(V2_SHA256);
    expect(record.basePrompt.comparatorSha256).toBe(V1_SHA256);
    expect(ORGUNIT_CLASSIFIER_PROMPT_VERSION).toBe('orgunit-classifier-prompt-v2');
    expect(sha256(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT)).toBe(V2_SHA256);
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
      const applied = applyCandidateDelta(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT, candidate);
      expect(applied.characterDelta).toBe(candidate.measuredDelta.characters);
      expect(applied.utf8ByteDelta).toBe(candidate.measuredDelta.utf8Bytes);
    });

    it('changes the prompt identity: the result is neither v1 nor v2', () => {
      const applied = applyCandidateDelta(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT, candidate);
      expect(candidate.changesPromptIdentity).toBe(true);
      expect(applied.sha256).not.toBe(V2_SHA256);
      expect(applied.sha256).not.toBe(V1_SHA256);
    });

    it('touches only its anchors: every other v2 paragraph survives byte for byte', () => {
      const applied = applyCandidateDelta(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT, candidate);
      const anchors = new Set(candidate.operations.map((o) => o.anchorParagraph));
      for (const paragraph of ORGUNIT_CLASSIFIER_SYSTEM_PROMPT.split('\n\n')) {
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
