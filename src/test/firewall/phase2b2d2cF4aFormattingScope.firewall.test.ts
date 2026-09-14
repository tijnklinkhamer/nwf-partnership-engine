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
