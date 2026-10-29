/**
 * REL HARVEST H4 FIREWALL - the JA/ES/NL classifier evaluation slice is
 * OFFLINE and GRANT-GATED, and nothing else moved.
 *
 * Ported from the duplicate relf1 line (`8170229`). Over
 * H4_BASE_COMMIT..H4_TERMINAL_COMMIT (the working tree while the terminal is
 * open) it pins:
 *   - the change set is the fixture, the harness, its unit test and this
 *     file: no production file, no classifier file, no migration;
 *   - the harness imports exactly its reviewed modules - from
 *     `classify/provider/` only the model allowlist constant - constructs no
 *     provider, reads no environment, opens no socket and no database;
 *   - a non-scripted provider is refused BEFORE its first call unless a
 *     grant matching every field (grantedBy OWNER) is presented;
 *   - nothing in production reaches the harness, and no test file other
 *     than its own unit test imports it;
 *   - the fixture is the bytes its pinned digest names.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MULTILINGUAL_EVAL_FIXTURE_SHA256 } from '../harness/multilingualEvalV1/harness.js';
import {
  REPO_ROOT,
  codeOf,
  phaseRange,
  productionFiles,
  readCurrent,
  specifiers,
} from '../helpers/phaseRange.js';

/** The H3 commit: this slice's parent. */
const H4_BASE_COMMIT = 'fe6cba113b3e035c994fd2599049e02945263df9';

/** Pinned by the REL harvest pin commit to this slice's own commit (closed range). */
const H4_TERMINAL_COMMIT: string | null = 'ae14a33bb75177c2ad3e340a8f231e44009467df';

const HARNESS = 'src/test/harness/multilingualEvalV1/harness.ts';
const UNIT = 'src/test/unit/classifierMultilingualEvalSliceV1.test.ts';
const FIXTURE = 'src/test/fixtures/classifierMultilingualEvalV1/slice.json';

const h4 = phaseRange(H4_BASE_COMMIT, H4_TERMINAL_COMMIT);

function testFiles(dir = 'src/test'): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(REPO_ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...testFiles(rel));
    else if (rel.endsWith('.ts')) out.push(rel);
  }
  return out.sort();
}

describe.skipIf(!h4.available)('REL harvest H4: the change set over its own range', () => {
  it('is exactly the fixture, the harness, its unit test and this firewall', () => {
    expect(h4.changeset()).toEqual(
      [
        `A\t${FIXTURE}`,
        `A\t${HARNESS}`,
        `A\t${UNIT}`,
        'A\tsrc/test/firewall/relHarvestH4MultilingualEvalSlice.firewall.test.ts',
      ].sort(),
    );
  });
});

describe('REL harvest H4: the slice is offline', () => {
  const harness = () => codeOf(readCurrent(HARNESS));

  it('imports exactly its reviewed modules, and from classify/provider/ only the allowlist', () => {
    expect([...new Set(specifiers(harness()))].sort()).toEqual(
      [
        'node:crypto',
        'node:fs',
        'node:path',
        'node:url',
        'zod',
        '../../../orgunits/classify/canonical.js',
        '../../../orgunits/classify/constants.js',
        '../../../orgunits/classify/dedupe.js',
        '../../../orgunits/classify/ordering.js',
        '../../../orgunits/classify/outputSchema.js',
        '../../../orgunits/classify/prompt.js',
        '../../../orgunits/classify/provider/allowedModels.js',
        '../../../orgunits/classify/providerContract.js',
        '../../../orgunits/classify/scriptedProvider.js',
        '../../../orgunits/classify/types.js',
        '../../../orgunits/classify/validate.js',
        '../../../orgunits/signals/scoreV2.js',
        '../../../orgunits/web/policy.js',
      ].sort(),
    );
  });

  it('constructs no provider, reads no environment, opens no socket or database', () => {
    const code = harness();
    expect(code).not.toMatch(/new\s+\w*Provider\s*\(/);
    expect(code).not.toMatch(
      /process\.env|\bfetch\s*\(|node:(net|tls|http|https|dns|child_process)|claude-agent-sdk|@anthropic-ai|agentSdk|ClaudeMax|from 'pg'|\/db\//,
    );
    // The only file read is the fixture, through the one loader.
    expect([...code.matchAll(/readFileSync\(/g)]).toHaveLength(1);
  });

  it('refuses a non-scripted provider before its first call unless an OWNER grant matches', () => {
    const code = harness();
    const run = /export async function runEvalSlice\([\s\S]*?\n\}/.exec(code)?.[0] ?? '';
    const gate = run.indexOf(
      'if (!scripted) checkGrant(input.grant ?? null, fixtureSha256, input.modelId);',
    );
    const firstCall = run.indexOf('input.provider.classify(');
    expect(gate).toBeGreaterThan(0);
    expect(firstCall).toBeGreaterThan(gate);
    expect(run).toMatch(/const scripted = input\.provider instanceof ScriptedTestProvider;/);
    const check = /function checkGrant\([\s\S]*?\n\}/.exec(code)?.[0] ?? '';
    expect(check).toMatch(
      /if \(grant === null\) \{\s*throw new MultilingualEvalRefusal\(\s*'GRANT_REQUIRED'/,
    );
    expect(check).toMatch(/grantedBy: 'OWNER',/);
    expect(check).toMatch(/scope: MULTILINGUAL_EVAL_GRANT_SCOPE,/);
    expect(check).toMatch(/fixtureSha256,/);
    expect(code).toMatch(
      /export const MULTILINGUAL_EVAL_GRANT_SCOPE = 'DEVELOPMENT_ONLY_SYNTHETIC_FIXTURE_EVALUATION';/,
    );
    // No pass/fail verdict is reported.
    expect(code).not.toMatch(/\b(passed|pass|threshold)\s*:/);
  });

  it('the unit test drives only the scripted provider and a local fake', () => {
    const unit = codeOf(readCurrent(UNIT));
    const constructed = new Set([...unit.matchAll(/new\s+(\w*Provider)\s*\(/g)].map((m) => m[1]));
    expect([...constructed].sort()).toEqual(['LocalFakeProvider', 'ScriptedTestProvider']);
    // The fake is local to the test file and offline: it only calls its own responder.
    expect(unit).toMatch(/class LocalFakeProvider implements ClassifierProvider \{/);
    for (const specifier of specifiers(unit)) {
      expect(specifier).not.toMatch(
        /claude-agent-sdk|@anthropic-ai|agentSdk|claudeMax|classify\/provider\/(?!allowedModels\.js$)|^pg$|\/db\//,
      );
    }
    expect(unit).not.toMatch(/process\.env/);
  });

  it('nothing in production reaches the harness, and only its unit test imports it', () => {
    for (const file of productionFiles()) {
      expect(readCurrent(file), file).not.toContain('multilingualEvalV1');
    }
    const importers = testFiles()
      .filter((f) => f !== HARNESS)
      .filter((f) =>
        specifiers(codeOf(readCurrent(f))).some((s) => s.includes('multilingualEvalV1/')),
      );
    expect(importers).toEqual(
      ['src/test/firewall/relHarvestH4MultilingualEvalSlice.firewall.test.ts', UNIT].sort(),
    );
  });

  it('the fixture is the bytes its pinned digest names, on reserved .example hosts', () => {
    const bytes = readFileSync(join(REPO_ROOT, FIXTURE));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(MULTILINGUAL_EVAL_FIXTURE_SHA256);
    const fixture = JSON.parse(bytes.toString('utf8')) as {
      labelProvenance: string;
      organisations: { rootUrl: string }[];
    };
    expect(fixture.labelProvenance).toBe('AGENT_AUTHORED_SYNTHETIC');
    for (const o of fixture.organisations)
      expect(new URL(o.rootUrl).hostname).toMatch(/\.example$/);
  });
});
