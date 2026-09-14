/**
 * PHASE 2B-2D2C-F4A FIREWALL — NO BROAD FORMATTER EXCLUSION MAY RETURN.
 *
 * The F4 commit excluded `docs/evaluation/results/` wholesale. That is a
 * standing temptation: the next slice that adds a derived `.jsonl` will find
 * the directory rule easier than naming its file. This asserts the RULE
 * SHAPE, so re-broadening the exclusion fails CI rather than passing quietly.
 *
 * The companion `evaluationResultsFormattingScope.test.ts` asserts the
 * BEHAVIOUR by asking Prettier itself. Both are needed: a behavioural probe
 * alone would still pass if someone re-added the directory rule and deleted
 * the probe's fixtures, and a text assertion alone would not prove Prettier
 * agrees with the reading.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

function ignoreRules(): readonly string[] {
  return readFileSync(join(REPO_ROOT, '.prettierignore'), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

describe('the Prettier ignore file names no open-ended evaluation-results subtree', () => {
  const rules = ignoreRules();

  it('carries no directory-shaped rule under docs/evaluation/', () => {
    for (const rule of rules) {
      const underEvaluation = rule.includes('docs/evaluation');
      if (!underEvaluation) continue;
      expect(rule.endsWith('/'), `${rule} excludes a whole directory under docs/evaluation/`).toBe(
        false,
      );
      expect(rule.includes('*'), `${rule} excludes a glob under docs/evaluation/`).toBe(false);
    }
  });

  it('exempts only exact .jsonl paths under docs/evaluation/results/', () => {
    const evaluationRules = rules.filter((rule) => rule.includes('docs/evaluation'));
    expect(evaluationRules.length).toBeGreaterThan(0);
    for (const rule of evaluationRules) {
      expect(rule.startsWith('docs/evaluation/results/'), `${rule} is outside results/`).toBe(true);
      expect(rule.endsWith('.jsonl'), `${rule} is not an exact .jsonl path`).toBe(true);
    }
  });

  it('keeps the two earlier frozen-artifact exclusions', () => {
    expect(rules).toContain('src/test/fixtures/');
    expect(rules).toContain('docs/audits/');
  });

  it('does not exclude the derived evaluation JSON, which the emitter keeps formatter-clean', () => {
    for (const rule of rules) {
      expect(rule.endsWith('summary.json')).toBe(false);
      expect(rule.endsWith('manifest.json')).toBe(false);
    }
  });
});

/**
 * The two result directories are SEPARATE derivations of the same preserved
 * evidence, and must stay separate. The blocked one is what F4 could honestly
 * conclude with no gold; overwriting it with the gold-backed result would
 * erase the record that the blocker was real rather than an oversight.
 */
describe('the blocked and gold-backed derivations are distinct and correctly labelled', () => {
  const RESULTS = join(REPO_ROOT, 'docs/evaluation/results');
  const blocked = join(RESULTS, 'phase2b-2d2c-dev-attribution-attempt-1');
  const gold = join(RESULTS, 'phase2b-2d2c-dev-attribution-attempt-1-gold-v1');

  const manifestOf = (directory: string): Record<string, unknown> =>
    JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8')) as Record<string, unknown>;
  const summaryOf = (directory: string): Record<string, unknown> =>
    JSON.parse(readFileSync(join(directory, 'summary.json'), 'utf8')) as Record<string, unknown>;

  it('records the F4 scorer for the blocked derivation, with no gold at all', () => {
    expect(manifestOf(blocked)['scorerVersion']).toBe('phase2b-2d2c-f4-scorer-v1');
    const summary = summaryOf(blocked);
    expect(summary['recommendation']).toBe('INSUFFICIENT_VALID_DEV_EVIDENCE');
    expect(summary['goldSupplement']).toBeUndefined();
    expect(summary['semanticMetrics']).toBeUndefined();
  });

  it('records the F4A gold scorer for the gold-backed derivation', () => {
    expect(manifestOf(gold)['scorerVersion']).toBe('phase2b-2d2c-f4a-scorer-gold-v1');
    const summary = summaryOf(gold);
    expect(summary['goldSupplement']).toBeDefined();
    expect(Array.isArray(summary['semanticMetrics'])).toBe(true);
  });

  it('reads the same preserved attempt in both', () => {
    const a = manifestOf(blocked)['sources'] as Record<string, unknown>;
    const b = manifestOf(gold)['sources'] as Record<string, unknown>;
    expect(a['artifactInventorySha256']).toBe(
      'ee17e1f2ee8021e59c06377342042e56f84269165f8ec39521011cb1d3538137',
    );
    expect(b['artifactInventorySha256']).toBe(a['artifactInventorySha256']);
    expect(b['artifactsVerified']).toBe(243);
    expect(b['freezeRawSha256']).toBe(a['freezeRawSha256']);
    expect(b['planSha256']).toBe(a['planSha256']);
  });

  it('carries no provider prose in either scored-items file', () => {
    for (const directory of [blocked, gold]) {
      const text = readFileSync(join(directory, 'scored-items.jsonl'), 'utf8');
      for (const forbidden of ['rationale', 'ambiguity', 'excerpt', 'transcript', '"url"']) {
        expect(text.includes(forbidden), `${directory} leaks ${forbidden}`).toBe(false);
      }
    }
  });
});
