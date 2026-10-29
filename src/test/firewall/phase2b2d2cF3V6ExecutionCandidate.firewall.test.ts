/**
 * PHASE 2B-2D2C-F3 FIREWALL — A CONTROL-PLANE-ONLY, ZERO-PROVIDER SURFACE.
 *
 * F0X legitimately reaches the coordinator/Tier-2/provider execution path —
 * that is its whole job, and its own firewall proves the reachability is
 * narrow and exact. F3 is the opposite claim, and this file is the proof:
 * the final-V6 execution-control authority reaches NO execution machinery at
 * all. Walking the transitive import graph from every file under
 * `src/test/harness/phase2b2d2c/f3/`:
 *
 *   - it must NEVER reach `coordinator.ts`, `childMain.ts`, a child launcher,
 *     an auth-status runner, the Agent SDK, any provider module, the Tier-2
 *     process-isolated harness, scoring, DEV/HOLDOUT gold or adjudication
 *     loaders, the `v3d1`/`goldProjection` namespaces, a database client, a
 *     migration, or any network surface;
 *   - the materialiser must create ONLY the control namespace: never the
 *     study root, never a slot output root, never overwriting anything;
 *   - both F3 schemas must be closed (`strictObject`) and versioned apart
 *     from every historical one;
 *   - no Claude model id may be written as a literal anywhere under `f3/`
 *     (`phase1a.firewall.test.ts` confines those to `allowedModels.ts`);
 *   - the execution guard's return type must carry no success member.
 *
 * These assertions walk real capabilities — module specifiers, exported
 * symbol names, file paths — never ordinary English words, following the
 * pattern `phase2b2d2cF0XExecutionIntegration.firewall.test.ts` established.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const F3_DIR = join(REPO_ROOT, 'src/test/harness/phase2b2d2c/f3');

const ENTRY_POINTS = readdirSync(F3_DIR)
  .filter((name) => name.endsWith('.ts'))
  .sort();

/**
 * Namespaces/files that must NEVER be reachable from the F3
 * execution-control layer. Unlike F0X, this list INCLUDES the whole
 * execution path: F3 gates execution, it does not perform it.
 */
const FORBIDDEN_MODULES = [
  'src/test/harness/phase2b2d2c/coordinator.ts',
  'src/test/harness/phase2b2d2c/childMain.ts',
  'src/test/harness/phase2b2d2c/childEnvironment.ts',
  'src/test/harness/phase2b2d2c/runtimeLoader.ts',
  'src/test/harness/processIsolatedBatch.ts',
  'src/test/harness/phase2b2d2c/scoring/',
  'src/test/harness/phase2b2d2c/goldProjection/',
  'src/test/harness/phase2b2d2c/v3d1/',
  'src/test/harness/phase2b2d2c/f0h/',
  'src/orgunits/classify/provider/',
  'src/orgunits/classify/evaluation/acceptanceSelection.ts',
  'src/orgunits/classify/evaluation/metrics.ts',
  'src/orgunits/classify/evaluation/noninferiority.ts',
  'src/orgunits/classify/evaluation/protocol.ts',
  'src/orgunits/classify/evaluation/select.ts',
  'src/orgunits/classify/evaluation/split.ts',
  'src/orgunits/classify/evaluation/strata.ts',
  'src/db/',
  'migrations/',
  'src/orgunits/web/gateway.ts',
  'src/orgunits/web/robots.ts',
  'src/orgunits/orchestrator/',
];

const FORBIDDEN_NODE_MODULES = ['node:http', 'node:https', 'node:net', 'node:tls', 'node:dns'];

const FORBIDDEN_PACKAGES = ['pg', '@anthropic-ai/claude-agent-sdk', '@anthropic-ai/sdk'];

/** Capability identifiers that would mean execution, scoring, gold/HOLDOUT access, or a scope escape. */
const FORBIDDEN_IDENTIFIERS = [
  'runExperiment',
  'runReplicationStudyExecution',
  'runProcessIsolatedBatch',
  'createF0XProductionLauncher',
  'writeOuterSlotIdentity',
  'writeStudyManifest',
  'writeSlotTransition',
  'writeStudyTerminal',
  // The auth-status and SDK runner capabilities are NOT listed here by symbol
  // name, deliberately. `phase2b.firewall.test.ts` forbids any file under
  // src/test/ from spelling `createProductionAuthStatusRunner` at all, so
  // naming it here would trip that older, broader rule. It needs no substring
  // check regardless: both runners live under `src/orgunits/classify/provider/`,
  // which FORBIDDEN_MODULES blocks wholesale, and the import-graph test above
  // proves f3/ cannot reach that directory by any path — a strictly stronger
  // guarantee than scanning for a name.
  'loadDevGold',
  'loadHoldout',
  'loadAdjudicat',
  'goldProjection',
  '--skip-slot',
  '--start-at',
  '--only-slot',
  '--continue-from',
  '--variant-override',
  '--slot-order',
  '--study-root',
  '--control-dir',
  '--output-root',
];

function readSource(path: string): string {
  return readFileSync(path, 'utf8');
}

/** Source with block comments and line comments stripped, so prose never trips a check. */
function codeOf(name: string): string {
  return readSource(join(F3_DIR, name))
    .replace(/\/\*\*[\s\S]*?\*\//g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function importSpecifiersOf(source: string): readonly string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\bimport\s+[^;]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) specifiers.push(specifier);
    }
  }
  return specifiers;
}

function resolveSpecifier(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), specifier);
  for (const candidate of [
    base,
    base.replace(/\.js$/, '.ts'),
    `${base}.ts`,
    join(base, 'index.ts'),
  ]) {
    if (existsSync(candidate) && candidate.endsWith('.ts')) return candidate;
  }
  return null;
}

/** Every .ts file reachable from the f3 entry points. */
function transitiveGraph(): { files: readonly string[]; externalSpecifiers: readonly string[] } {
  const visited = new Set<string>();
  const external = new Set<string>();
  const queue = ENTRY_POINTS.map((name) => join(F3_DIR, name));
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || visited.has(file)) continue;
    visited.add(file);
    for (const specifier of importSpecifiersOf(readSource(file))) {
      const resolved = resolveSpecifier(file, specifier);
      if (resolved === null) external.add(specifier);
      else if (!visited.has(resolved)) queue.push(resolved);
    }
  }
  return { files: [...visited].sort(), externalSpecifiers: [...external].sort() };
}

describe('2D2C-F3: a control-plane-only, zero-provider surface', () => {
  const graph = transitiveGraph();

  it('reaches a non-trivial import graph (so the walk is really walking)', () => {
    expect(ENTRY_POINTS.length).toBeGreaterThanOrEqual(6);
    expect(graph.files.length).toBeGreaterThan(ENTRY_POINTS.length);
  });

  it('every f3/*.ts file is on the ENTRY_POINTS list this firewall walks', () => {
    const onDisk = readdirSync(F3_DIR)
      .filter((name) => name.endsWith('.ts'))
      .sort();
    expect(ENTRY_POINTS).toEqual(onDisk);
  });

  it('NEVER reaches the coordinator, a child launcher, the Tier-2 harness or any provider module', () => {
    for (const file of graph.files) {
      const relative = file.slice(REPO_ROOT.length + 1);
      for (const forbidden of FORBIDDEN_MODULES) {
        expect(
          relative.startsWith(forbidden) || relative === forbidden,
          `${relative} is reachable from f3/ but is a forbidden module (${forbidden}).`,
        ).toBe(false);
      }
    }
  });

  it('imports no raw socket module, no database driver and no Agent SDK package', () => {
    for (const specifier of graph.externalSpecifiers) {
      expect(FORBIDDEN_NODE_MODULES, specifier).not.toContain(specifier);
      expect(FORBIDDEN_PACKAGES, specifier).not.toContain(specifier);
    }
  });

  it('names no execution, scoring, gold/HOLDOUT or scope-escape identifier anywhere in f3/ source', () => {
    for (const name of ENTRY_POINTS) {
      const code = codeOf(name);
      for (const identifier of FORBIDDEN_IDENTIFIERS) {
        expect(code.includes(identifier), `${name} names ${identifier}`).toBe(false);
      }
    }
  });

  it('opens no file the approved F2 freeze lists as HOLDOUT-forbidden or additionally forbidden', () => {
    const freeze = JSON.parse(
      readFileSync(
        join(REPO_ROOT, 'docs/evaluation/PHASE_2B_2D2C_DEV_FINAL_V6_STUDY_FREEZE_F2_V1.json'),
        'utf8',
      ),
    ) as {
      corpus: { holdoutFilesNeverRead: string[]; additionalForbiddenFilesForThisStudy: string[] };
    };
    const forbiddenFiles = [
      ...freeze.corpus.holdoutFilesNeverRead,
      ...freeze.corpus.additionalForbiddenFilesForThisStudy,
    ];
    expect(forbiddenFiles.length).toBeGreaterThan(0);
    for (const file of graph.files) {
      const source = readSource(file);
      for (const path of forbiddenFiles) {
        expect(source.includes(path), `${file} names forbidden file ${path}`).toBe(false);
      }
    }
  });

  it('names HOLDOUT only to PROHIBIT it — never as a path, a loader or a reachable capability', () => {
    // A bare-word check would trip on the prohibition text the candidate is
    // REQUIRED to carry ("NO HOLDOUT."), so this asserts the capability
    // instead: every occurrence must sit inside a prohibition phrase, and the
    // holdout fixture paths are proved unreachable by the test below.
    for (const name of ENTRY_POINTS) {
      const code = codeOf(name);
      for (const match of code.matchAll(/.{0,12}HOLDOUT.{0,12}/g)) {
        expect(match[0], `${name}: ${match[0]}`).toMatch(/NO HOLDOUT|holdoutAuthorised: false/);
      }
    }
  });

  it('writes no Claude model id as a literal: the requested model comes from the approved freeze', () => {
    for (const name of ENTRY_POINTS) {
      const code = codeOf(name);
      expect(code, name).not.toMatch(/['"]claude-[a-z0-9.-]+['"]/);
    }
    // And the registry really does source it from the freeze document.
    expect(codeOf('slotRegistryF3.ts')).toContain('freeze.perRunPolicy.requestedModelId');
  });
});

describe('2D2C-F3: both schemas are closed, versioned apart, and refuse their predecessors', () => {
  it('the slot schema and the study-approval schema are strictObject, never loose or passthrough', () => {
    for (const name of ['authorisationF3.ts', 'studyExecutionApprovalF3.ts']) {
      const code = codeOf(name);
      expect(code, name).toContain('z.strictObject(');
      expect(code, name).not.toContain('.passthrough(');
      expect(code, name).not.toContain('z.looseObject(');
    }
  });

  it('declares its own two version literals, and neither reuses a historical one', () => {
    expect(codeOf('authorisationF3.ts')).toContain("'phase2b-2d2c-f3-v6-slot-authorisation-v1'");
    expect(codeOf('studyExecutionApprovalF3.ts')).toContain(
      "'phase2b-2d2c-f3-v6-study-execution-approval-v1'",
    );
    // The historical versions appear ONLY as values to refuse, never as this
    // schema's own literal: each is imported from its owning module.
    const slotCode = codeOf('authorisationF3.ts');
    expect(slotCode).toContain('SUPERSEDED_AUTHORISATION_VERSIONS');
    expect(slotCode).toContain('SUPERSEDED_AUTHORISATION_PRESENTED');
    expect(slotCode).not.toContain("'phase2b-2d2c-f0w-replication-slot-authorisation-v1'");
    expect(slotCode).not.toContain("'phase2b-2d2c-f0o-execution-authorisation-v1'");
  });

  it('refuses a superseded version BEFORE parsing under the closed schema', () => {
    const code = codeOf('authorisationF3.ts');
    const supersededCheck = code.indexOf('SUPERSEDED_AUTHORISATION_PRESENTED');
    const firstSchemaParse = code.indexOf('F3SlotAuthorisationSchema.safeParse');
    expect(supersededCheck).toBeGreaterThan(0);
    expect(firstSchemaParse).toBeGreaterThan(0);
    expect(supersededCheck).toBeLessThan(firstSchemaParse);
  });

  it('pins the V6 study identity and variant so a V4/V5 candidate can never parse here', () => {
    const code = codeOf('authorisationF3.ts');
    expect(code).toContain("F3_STUDY_ID = 'FINAL_V6_DEV_N5'");
    expect(code).toContain('z.literal(F2_VARIANT_NAME)');
    expect(code).not.toContain('PROMPT_V4_CANONICAL');
    expect(code).not.toContain('PROMPT_V5_CANONICAL');
    expect(code).not.toContain('pairNumber');
    expect(code).not.toContain('historicalAttemptNo');
  });
});

describe('2D2C-F3: the materialiser creates the control namespace and nothing else', () => {
  const code = codeOf('materialiseF3Candidates.ts');

  it('has no execution path: no executor, no runExperiment, no launcher, no auth-status, no provider', () => {
    for (const forbidden of [
      'runF3SlotExecution',
      'runExperiment',
      'runReplicationStudyExecution',
      'runProcessIsolatedBatch',
      '.launch(',
      'spawn',
      'fork(',
    ]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
  });

  it('never overwrites: every writeFileSync is write-exclusive and every mkdirSync is non-recursive', () => {
    const writes = [...code.matchAll(/writeFileSync\(([\s\S]*?)\);/g)].map(
      (match) => match[1] ?? '',
    );
    expect(writes.length).toBeGreaterThanOrEqual(2);
    for (const call of writes) expect(call).toContain("flag: 'wx'");
    expect(code).not.toMatch(/mkdirSync\([^)]*recursive/);
    expect(code).not.toMatch(/\b(rmSync|unlinkSync|renameSync|appendFileSync|rmdirSync)\b/);
  });

  it('creates ONLY the control root and its candidate directory — never the study root or a slot root', () => {
    const mkdirs = [...code.matchAll(/mkdirSync\(([^)]*)\)/g)].map((match) => match[1] ?? '');
    expect(mkdirs).toHaveLength(2);
    expect(mkdirs[0]).toContain('F2_CONTROL_ROOT');
    expect(mkdirs[1]).toContain('candidatesDir');
    for (const call of mkdirs) {
      expect(call).not.toContain('F2_STUDY_ROOT');
      expect(call).not.toContain('f2OutputRootPathOf');
    }
    // And it refuses outright if the study root or any slot root already exists.
    expect(code).toContain('existsSync(F2_STUDY_ROOT)');
  });

  it('inherits the established twelve-hour validity window and exposes no flag to lengthen it', () => {
    expect(code).toContain('F3_CANDIDATE_VALIDITY_HOURS = 12');
    expect(code).not.toContain('--validity-hours');
    expect(code).toMatch(/F3_CANDIDATE_VALIDITY_HOURS \* 3_600_000/);
  });

  it('writes a manifest that is explicitly NOT an approval and carries no operator approval statement', () => {
    expect(code).toContain("'EXECUTION_CANDIDATE_INVENTORY_NOT_AN_APPROVAL'");
    for (const field of [
      'ownerExecutionApprovalExists: false',
      'studyLevelExecutionApprovalExists: false',
      'providerCallsAuthorised: false',
      'executionAuthorised: false',
      'scoringAuthorised: false',
      'holdoutAuthorised: false',
    ]) {
      expect(code, field).toContain(field);
    }
    expect(code).not.toContain('operatorApprovalStatement');
    expect(code).not.toContain('buildF3StudyExecutionApprovalStatement');
  });

  it('re-reads every candidate from disk and proves each is inert without a study approval', () => {
    expect(code).toContain('verifyF3SlotAuthorisationCandidate');
    expect(code).toContain('studyApprovalPath: null');
    expect(code).toMatch(/if \(decision\.granted\) \{[\s\S]*?must be impossible/);
  });
});

describe('2D2C-F3: the execution guard cannot return a launch', () => {
  const code = codeOf('executionGuardF3.ts');

  it('its only outcome type is a refusal, with providerRequests pinned to the literal 0', () => {
    expect(code).toContain('readonly launched: false');
    expect(code).toContain('readonly providerRequests: 0');
    expect(code).not.toContain('launched: true');
    expect(code).toContain('F3ExecutionRefusal');
    // The function's return type names the refusal and nothing else.
    expect(code).toMatch(/export function runF3SlotExecution\([^)]*\): F3ExecutionRefusal/);
  });

  it('has no flag, argument or environment read that could enable dispatch', () => {
    expect(code).not.toContain('process.env');
    expect(code).not.toContain('SEMANTIC_DISPATCH_ENABLED');
    expect(code).toContain("'SEMANTIC_DISPATCH_NOT_IMPLEMENTED'");
  });

  it('re-verifies the approved freeze and owner-approval identities before any gate', () => {
    const freezeCheck = code.indexOf('PROPOSED_F2_FREEZE_RAW_SHA256');
    const preflight = code.indexOf('runF3AllFivePreflight(');
    expect(freezeCheck).toBeGreaterThan(0);
    expect(preflight).toBeGreaterThan(freezeCheck);
  });
});

describe('2D2C-F3: the composed gate order is the F0X order, with one gate added', () => {
  const code = codeOf('composedExecutionDecisionF3.ts');

  it('evaluates sequencing, then candidate, then approval, then membership, then build, then output root', () => {
    const order = [
      'evaluateF3SequencingGate(',
      'evaluateF3SlotExecutionLock(',
      'evaluateF3StudyExecutionApproval(',
      // `refusal:`-prefixed so these match the GATE BODIES, never the refusal
      // type union declared above them.
      "refusal: 'APPROVAL_DOES_NOT_LIST_THIS_CANDIDATE'",
      "refusal: 'APPROVAL_CANDIDATE_BYTES_MISMATCH'",
      "failedGate: 'EXECUTION_BUILD'",
      'validateSlotOutputRootForExecution(',
    ];
    let cursor = -1;
    for (const marker of order) {
      const index = code.indexOf(marker);
      expect(index, marker).toBeGreaterThan(cursor);
      cursor = index;
    }
  });

  it('reuses the landed F0W evidence walk and output-root validator rather than reimplementing them', () => {
    expect(codeOf('sequencingF3.ts')).toContain("from '../f0w/sequencing.js'");
    expect(codeOf('sequencingF3.ts')).toContain('classifySlotEvidence(');
    expect(code).toContain("from '../f0w/outputRootReadiness.js'");
  });
});
