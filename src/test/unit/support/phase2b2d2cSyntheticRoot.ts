/**
 * PHASE 2B-2D2C-F1 test support: builds a SYNTHETIC variant root in a
 * temporary directory — a worktree-shaped tree with `package.json`, a
 * lockfile, an installed-package marker, placeholder sources, a built
 * `dist/` and the DEVELOPMENT canonical corpus — so the variant-root
 * verifier, the runtime loader, the child and the execution-only loader can
 * be exercised against a root that contains no Git repository and no real
 * Agent SDK. Git facts are supplied by injected fake probes.
 *
 * The built modules are of three kinds: constants and the prompt are
 * GENERATED JavaScript (so a root can be given a different prompt, version
 * or constant on purpose); the canonicalizer, final identity, output schema,
 * validator and invocation builder RE-EXPORT this worktree's TypeScript by
 * absolute path (their algorithms are blob-identical at both frozen commits,
 * F0A §13.4); and the provider stack is copied from the fixture directory
 * (a scripted provider and two seams that never open a socket).
 *
 * This file names no model id and constructs no production runner.
 */
import { copyFileSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORGUNIT_CLASSIFIER_SYSTEM_PROMPT } from '../../../orgunits/classify/prompt.js';
import { FROZEN_VARIANTS, type FrozenVariant } from '../../harness/phase2b2d2c/constants.js';
import type { Freeze } from '../../harness/phase2b2d2c/freeze.js';
import { RUNTIME_MODULE_PATHS } from '../../harness/phase2b2d2c/runtimeLoader.js';
import type { VariantRootProbes } from '../../harness/phase2b2d2c/variantRoot.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const RUNNER_REPO_ROOT = resolve(HERE, '..', '..', '..', '..');
const FIXTURE_STACK = join(
  RUNNER_REPO_ROOT,
  'src/test/fixtures/phase2b2d2c/syntheticProviderStack',
);

/** The five reviewed 2D2B-3 insertions (R3 §3.2); removing them from v2 yields the v1 comparator prompt without Git. */
const V2_PARAGRAPH_INSERTIONS = [
  "Classify the page's primary subject, not the presence of relevant words, activities, or services. Use UNIT_PAGE only when an organisational unit or operating function is itself the page's primary subject — for example, the page presents that unit's identity, remit, team, responsibility, or ongoing operations. Use NOT_A_UNIT when the page instead has a programme, grant, activity, event, form, navigation destination, or general institutional information as its primary subject, even when it describes Erasmus, mobility, international students, language learning, or student services. Describing Erasmus or services does not by itself make a page a UNIT_PAGE.",
  "The whole-organisation allowance is narrow: use it only when the document presents the whole organisation in the role of an operating unit or function and makes that role the page's primary subject. The organisation's small size alone is never enough; a homepage, marketing or navigation page, programme or course page, and news or event page remain NOT_A_UNIT when no operating unit or function is the page's primary subject.",
  'NO requires affirmative evidence of absence; silence is UNKNOWN; a service list that omits an axis is not evidence against it.',
  "`unit_name` must be copied exactly from this document's own title, headings, or excerpt. Never take it from another document in the batch, and never expand an abbreviation or acronym.",
] as const;
const V2_INLINE_INSERTION = 'contact form, ';

/** The v1 comparator prompt text, derived from the production v2 prompt exactly as the freeze test derives it. */
export function v1PromptText(): string {
  let stripped: string = ORGUNIT_CLASSIFIER_SYSTEM_PROMPT;
  for (const paragraph of V2_PARAGRAPH_INSERTIONS)
    stripped = stripped.replace(`\n\n${paragraph}`, '');
  return stripped.replace(V2_INLINE_INSERTION, '');
}

export function promptTextOf(variantName: FrozenVariant['name']): string {
  return variantName === 'PROMPT_V1_CANONICAL' ? v1PromptText() : ORGUNIT_CLASSIFIER_SYSTEM_PROMPT;
}

export interface SyntheticRootOptions {
  readonly variant: FrozenVariant;
  readonly freeze: Freeze;
  /** Overrides, each applied on purpose by a test that wants that check to fail. */
  readonly promptText?: string;
  readonly promptVersion?: string;
  readonly sdkVersion?: string;
  readonly ruleVersion?: string;
  readonly allowedModels?: readonly string[];
  readonly maxTransientRetries?: number;
  readonly softDeadlineMs?: number;
  readonly omitBuiltModule?: keyof typeof RUNTIME_MODULE_PATHS;
  readonly staleBuiltModule?: keyof typeof RUNTIME_MODULE_PATHS;
  readonly corpusBytes?: Buffer;
}

function tsSource(relative: string): string {
  return join(RUNNER_REPO_ROOT, relative);
}

/** Writes a synthetic root under `dir` and returns it. */
export function buildSyntheticVariantRoot(dir: string, options: SyntheticRootOptions): string {
  const { variant, freeze } = options;
  const sdkName = freeze.classifier.agentSdk.package;
  const sdkVersion = options.sdkVersion ?? freeze.classifier.agentSdk.version;
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'synthetic-root', dependencies: { [sdkName]: sdkVersion } }),
  );
  writeFileSync(
    join(dir, 'package-lock.json'),
    JSON.stringify({ packages: { [`node_modules/${sdkName}`]: { version: sdkVersion } } }),
  );
  mkdirSync(join(dir, 'node_modules', ...sdkName.split('/')), { recursive: true });
  writeFileSync(
    join(dir, 'node_modules', ...sdkName.split('/'), 'package.json'),
    JSON.stringify({ name: sdkName, version: sdkVersion }),
  );

  // Corpus and manifest, at the frozen repository-relative paths.
  for (const relative of [freeze.corpus.canonicalCorpusPath, freeze.corpus.canonicalManifestPath]) {
    mkdirSync(dirname(join(dir, relative)), { recursive: true });
    if (relative === freeze.corpus.canonicalCorpusPath && options.corpusBytes !== undefined) {
      writeFileSync(join(dir, relative), options.corpusBytes);
    } else copyFileSync(tsSource(relative), join(dir, relative));
  }

  const promptText = options.promptText ?? promptTextOf(variant.name);
  const generated: Record<keyof typeof RUNTIME_MODULE_PATHS, string> = {
    canonical: `export { canonicalStringify, hashBatch } from ${JSON.stringify(tsSource('src/orgunits/classify/canonical.ts'))};\n`,
    finalIdentity: `export { computeFinalInputSha256 } from ${JSON.stringify(tsSource('src/orgunits/classify/finalIdentity.ts'))};\n`,
    prompt:
      `export const ORGUNIT_CLASSIFIER_PROMPT_VERSION = ${JSON.stringify(options.promptVersion ?? variant.promptVersion)};\n` +
      `export const ORGUNIT_CLASSIFIER_SYSTEM_PROMPT = ${JSON.stringify(promptText)};\n`,
    outputSchema: `export * from ${JSON.stringify(tsSource('src/orgunits/classify/outputSchema.ts'))};\n`,
    validate: `export * from ${JSON.stringify(tsSource('src/orgunits/classify/validate.ts'))};\n`,
    constants: `export const ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION = ${JSON.stringify(freeze.classifier.assemblyVersion)};\n`,
    retry:
      `export const MAX_TRANSIENT_RETRIES = ${options.maxTransientRetries ?? 2};\n` +
      `export const TRANSIENT_RETRY_BASE_DELAY_MS = 500;\n`,
    score: `export const ORGUNIT_SIGNAL_RULE_VERSION = ${JSON.stringify(options.ruleVersion ?? freeze.inputConstruction.context.ruleVersion)};\n`,
    policy: `export const FETCH_POLICY_VERSION = ${JSON.stringify(freeze.inputConstruction.context.fetchPolicyVersion)};\n`,
    allowedModels: `export const ORGUNIT_CLASSIFIER_ALLOWED_MODELS = ${JSON.stringify(options.allowedModels ?? [freeze.classifier.requestedModelId])};\n`,
    sdkOptions:
      `export const CLASSIFIER_DEFAULT_MAX_TURNS = 3;\n` +
      `export { buildAgentSdkInvocation } from ${JSON.stringify(tsSource('src/orgunits/classify/provider/sdkOptions.ts'))};\n`,
    authStatusRunner: '',
    agentSdkRunner: '',
    provider: '',
  };
  const past = new Date(Date.now() - 60_000);
  for (const [module, paths] of Object.entries(RUNTIME_MODULE_PATHS) as [
    keyof typeof RUNTIME_MODULE_PATHS,
    { built: string; source: string },
  ][]) {
    const source = join(dir, paths.source);
    mkdirSync(dirname(source), { recursive: true });
    writeFileSync(source, `// placeholder source for ${module}\n`);
    utimesSync(source, past, past);
    if (options.omitBuiltModule === module) continue;
    const built = join(dir, paths.built);
    mkdirSync(dirname(built), { recursive: true });
    if (module === 'authStatusRunner' || module === 'provider') {
      copyFileSync(
        join(
          FIXTURE_STACK,
          module === 'provider' ? 'claudeMaxAgentProvider.js' : 'authStatusRunner.js',
        ),
        built,
      );
    } else if (module === 'agentSdkRunner') {
      copyFileSync(join(FIXTURE_STACK, 'agentSdkRunner.js'), built);
      if (options.softDeadlineMs !== undefined) {
        // Patch the copied fixture's frozen constant in place; the test support never spells a factory name.
        writeFileSync(
          built,
          readFileSync(built, 'utf8').replace(
            'CLASSIFIER_CALL_SOFT_DEADLINE_MS = 300_000',
            `CLASSIFIER_CALL_SOFT_DEADLINE_MS = ${options.softDeadlineMs}`,
          ),
        );
      }
    } else {
      writeFileSync(built, generated[module]);
    }
    if (options.staleBuiltModule === module) {
      const older = new Date(past.getTime() - 60_000);
      utimesSync(built, older, older);
    }
  }
  return dir;
}

/** Fake Git facts for a synthetic root; every default is the frozen truth for `variant`. */
export function fakeGitProbes(
  variant: FrozenVariant,
  freeze: Freeze,
  overrides: Partial<
    Pick<VariantRootProbes, 'gitHead' | 'gitStatusPorcelain' | 'gitOriginUrl' | 'gitToplevel'>
  > = {},
): Pick<VariantRootProbes, 'gitHead' | 'gitStatusPorcelain' | 'gitOriginUrl' | 'gitToplevel'> {
  return {
    gitHead: () => `${variant.gitCommit}\n`,
    gitStatusPorcelain: () => '',
    gitOriginUrl: () => `${freeze.git.repository}\n`,
    gitToplevel: (root) => `${root}\n`,
    ...overrides,
  };
}

export const V1 = FROZEN_VARIANTS[0];
export const V2 = FROZEN_VARIANTS[1];

/** Writes the scripted scenario the synthetic provider reads. */
export function writeFakeProviderScenario(root: string, scenario: unknown): void {
  writeFileSync(join(root, 'fake-provider-scenario.json'), JSON.stringify(scenario));
}
