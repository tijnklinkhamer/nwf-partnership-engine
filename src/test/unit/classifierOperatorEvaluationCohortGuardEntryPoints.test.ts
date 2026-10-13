/**
 * CLASSIFIER_OPERATOR_EVALUATION_COHORT_GUARD_V1 - NO UNGUARDED ENTRY POINT.
 *
 * The guard is wired into the operator command only. This file pins the
 * complete set of production modules that can reach classifier execution, so
 * a new entry point cannot appear without a reviewed edit here:
 *
 *   - `runOrganisationClassification` (the organisation/run runtime) is
 *     imported by exactly one production module, the guarded operator CLI;
 *   - the production provider is constructed only by the CLI's provider
 *     factory (`classifyProvider.ts`, imported only by the guarded CLI) and by
 *     the 2D2C study runtime loader, which is imported only by the frozen
 *     study harness child and classifies frozen study documents, never an
 *     organisation's research run;
 *   - inside the CLI, the registry check and the subject check both precede
 *     planning (assembly), provider construction and the runtime.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..', '..', '..');

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...files(path));
    else if (/\.(ts|mts|mjs|js)$/.test(name)) out.push(relative(ROOT, path));
  }
  return out;
}

const PRODUCTION = [...files(join(ROOT, 'src')), ...files(join(ROOT, 'scripts'))].filter(
  (p) => !p.startsWith('src/test/'),
);
const ALL = [...files(join(ROOT, 'src')), ...files(join(ROOT, 'scripts'))];
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const importsOf = (p: string, module: RegExp) =>
  [...read(p).matchAll(/\bfrom\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].some((m) =>
    module.test(m[1] ?? m[2] ?? ''),
  );
const CLI = 'src/cli/commands/classify.ts';

describe('evaluation-cohort guard - no unguarded classifier entry point', () => {
  it('only the guarded operator CLI imports the organisation/run runtime', () => {
    const importers = PRODUCTION.filter((p) => importsOf(p, /classify\/orchestrate\.js$/));
    expect(importers).toEqual([CLI]);
  });

  it('only the CLI provider factory and the study runtime loader construct the production provider', () => {
    const constructors = PRODUCTION.filter((p) =>
      /new\s+(\w+\.)?ClaudeMaxAgentProvider\s*\(/.test(read(p)),
    );
    expect(constructors.sort()).toEqual([
      'scripts/phase2b-2d2c-production-runtime.ts',
      'src/cli/commands/classifyProvider.ts',
    ]);
    expect(PRODUCTION.filter((p) => importsOf(p, /classifyProvider\.js$/))).toEqual([CLI]);
    expect(
      ALL.filter(
        (p) =>
          p !== 'scripts/phase2b-2d2c-production-runtime.ts' &&
          /phase2b-2d2c-production-runtime/.test(read(p)) &&
          !p.startsWith('src/test/unit/'),
      ),
    ).toEqual(['src/test/harness/phase2b2d2c/childEntry.mjs']);
  });

  it('the study runtime loader never touches the organisation/run runtime', () => {
    const loader = read('scripts/phase2b-2d2c-production-runtime.ts');
    expect(loader).not.toMatch(
      /runOrganisationClassification|assembleClassifierHandoff|orchestrate\.js/,
    );
  });

  it('inside the CLI, both cohort checks precede planning, provider construction and the runtime', () => {
    const cli = read(CLI);
    const at = (needle: string) => {
      const index = cli.indexOf(needle);
      expect(index, needle).toBeGreaterThan(-1);
      return index;
    };
    const registry = at('(deps.loadCohortRegistry ?? loadEvaluationCohortRegistry)()');
    const subject = at('await loadCohortSubject(pool, args.organisationId, args.runId)');
    const plan = at('plan = await planOrganisationClassification(pool');
    const provider = at('await deps.createProvider()');
    const runtime = at('await runOrganisationClassification(pool');
    expect(registry).toBeLessThan(at('deps.withResearchPool((pool) =>'));
    expect(subject).toBeLessThan(plan);
    expect(plan).toBeLessThan(provider);
    expect(provider).toBeLessThan(runtime);
    expect(cli.match(/await runOrganisationClassification\(/g)).toHaveLength(1);
    expect(cli.match(/await deps\.createProvider\(\)/g)).toHaveLength(1);
  });
});
