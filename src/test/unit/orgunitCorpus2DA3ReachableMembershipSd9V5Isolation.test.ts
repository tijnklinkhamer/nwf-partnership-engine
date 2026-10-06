/**
 * PHASE 2B-2D A3 R43 — ISOLATION OF THE V5 INCREMENTAL READINESS DELTA.
 *
 * Static and lineage proofs that R43:
 *
 *   - is exactly one new namespace, `a3readinessV5/`, and leaves every earlier
 *     namespace, frozen module, census and audit byte-identical;
 *   - reuses R24 only through its pure
 *     `deriveUnboundSlotReachableMembershipReadiness` (exactly one call site,
 *     with the genuine R42 preparation) and its result tokens, and R42 / R41 /
 *     R40 only through their private brands, provenance and census;
 *   - never calls a lower readiness, SD9, cap, rank or survivor helper - one
 *     semantic route to SD9 only - never mints through R24 / R30 / R37, runs no
 *     complete-corpus preflight and does no R44 work;
 *   - never reads an acquisition or resolution generation to choose a
 *     membership policy;
 *   - has no SQL, pool, environment, filesystem, network, clock, randomness,
 *     provider, classifier or sealed-root capability;
 *   - descends from the exact R42 tip, pins R42's scope in one first commit,
 *     and changes nothing outside its namespace, tests, census and audit;
 *   - publishes a census and audit that carry aggregate counts only.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { R43_PUBLIC_CENSUS_RECORD_KIND } from '../harness/phase2b2d/a3readinessV5/census.js';
import {
  loadCommittedA2GovernanceV5,
  readyAuthoritiesOfV5,
} from '../harness/phase2b2d/a3governanceV5/snapshotV5.js';
import {
  loadCommittedA2GovernanceV4,
  readyAuthoritiesOfV4,
} from '../harness/phase2b2d/a3governanceV4/snapshotV4.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const HARNESS = 'src/test/harness/phase2b2d';
const NAMESPACE = `${HARNESS}/a3readinessV5`;

/** The exact R42 tip R43 was cut from. */
const R42_TERMINAL = '2590a106b5ef000dd52ece94fc666d2cdfc87860';
/** The one commit that pinned R42's own isolation test to its range. */
const R42_SCOPE_PIN_COMMIT = '341caad02a0874621b7e0b011913b17e011083c9';
const R42_ISOLATION_TEST = 'src/test/unit/orgunitCorpus2DA3SampleSurvivorV5Isolation.test.ts';
/**
 * R43'S OWN TERMINAL COMMIT.
 *
 * R43's lineage, changed-surface and historical-scope assertions describe
 * R43'S SLICE, so they range over R43's own commits - `R42_TERMINAL..R43_TERMINAL`
 * - rather than over the working tree. Once a later slice lands on top, the
 * working tree is no longer R43's surface, and diffing to it would fail for
 * the honest reason that history moved on rather than because R43 changed.
 *
 * This is the same standing convention R19 through R42 apply, and it
 * WEAKENS NOTHING: R43's range is frozen, its permitted-path list is
 * unchanged, and each later slice pins the equivalent scope over its own range.
 */
const R43_TERMINAL = 'f84ea09031d460b28c9386e1d6cd7fb56d4569ab';
/** The terminal A2 checkpoint Governance V5 describes; never an A3 ancestor. */
const A2_CHECKPOINT = '29d0d486cb268b5431a0fc23eabb064682ec47d9';

const R43_TESTS = [
  'src/test/unit/orgunitCorpus2DA3ReachableMembershipSd9V5Delta.test.ts',
  'src/test/unit/orgunitCorpus2DA3ReachableMembershipSd9V5Isolation.test.ts',
];
const R43_CENSUS_PATH = `docs/evaluation/${R43_PUBLIC_CENSUS_RECORD_KIND}.json`;
const R43_AUDIT_PATH =
  'docs/audits/PHASE_2B_2D_A3_R43_INCREMENTAL_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_V5_V1.md';

const NAMESPACE_FILES = [
  'census.ts',
  'deriveDelta.ts',
  'devTrain.ts',
  'history.ts',
  'r42Drift.ts',
  'refusal.ts',
  'types.ts',
];

/** The reused and frozen modules, byte-pinned at the R42 tip: R43 uses them without altering them. */
const FROZEN_MODULE_SHA256: Readonly<Record<string, string>> = {
  'a3readiness/census.ts': '13390bd301612bbe2d360866c57ea5366fe632f056136c121957ec75c2c156ed',
  'a3readiness/devTrain.ts': '6150dd955b7b5821b7080f586e2906ce3b97e539b54fe25b26d2ac8d1f60ebe9',
  'a3readiness/membership.ts': 'e387d9f1efa6e0c8aa5150463469d2645aae09d34ef88007bf756a1ddc87fe5e',
  'a3readiness/r23Drift.ts': 'e97c9270f49ae221ff616a96cd30531183774ff5dd300eb44be2fbc2fbbab697',
  'a3readiness/refusal.ts': '466de2f0773c413548458bc683c9bd3e58bbe374b0ade4e8e5df5fa4f8105a5a',
  'a3readiness/types.ts': 'ef9f4c55d32a467ebb19d3131942c2eccc4fe42eae6b083d07cd8f3f41b1d99e',
  'a3readinessV2/devTrain.ts': 'ce013673af5c5336d98e81dfc61497f01177a56297690d07a202847bf90ccf92',
  'a3readinessV4/census.ts': '494cb98bc05e3d9554c29df9c2e60f4d8ddac101103d1714150aa7cfb0ebec09',
  'a3readinessV4/deriveDelta.ts':
    'f898c0204003838a8068e9718ff9294312a4d2f7269814a19bcd73f807fea59d',
  'a3readinessV4/devTrain.ts': 'b86f0c9f6cf2a73ad14eabe0470709be79894112f06f3b16c064ce1b39d4d388',
  'a3readinessV4/r36Drift.ts': 'a315a31dda51414a080c778fea0b15ae0e97de04a6cf34bbbfdc5ea50e520b66',
  'a3readinessV4/refusal.ts': '1028558773fcb249dc1d090c5a0d1e9a0acbd974b713e88f71634621a78a7593',
  'a3readinessV4/types.ts': '7f99f5db60a070b26af667421fe219c4b4079426eb245a17a8cfed9c12cbeae2',
  'a3samplesV5/census.ts': 'a35657ca790de28f938369a557c10c0ee5d5976dda0cd67688e064f584f91ef9',
  'a3samplesV5/devTrain.ts': '1cc3cb34f46c21c2c8b2a759324035e23d69287e3a70f216b601b9b7986b9bd1',
  'a3samplesV5/history.ts': '70900c4f0319d7ad20a4e93643635eaa8f52c60588e58db22d9f6bf7016e8026',
  'a3samplesV5/prepareDelta.ts': 'bbe9ea5997518ab5ba3ac6d447ce5b4c914fdf1773c97039704b56902732faeb',
  'a3samplesV5/r41Drift.ts': 'c1b137504f39d3ea793deeae10a3abdb44b105d3c3f66844edc14acf8e6a249f',
  'a3samplesV5/refusal.ts': 'a004e8faf300fdac40bf57d8b3d6d7d2dddc0b56f843e34bb9335a275432b39c',
  'a3samplesV5/types.ts': '2784b9135b95d3c0f689b2b1c96498ec7c98f6efae4d128794f26cc408e87ef0',
  'a3samples/prepare.ts': 'ac9f2af750d353cbe5faa9a2b67421fca7b66ebbfd0cfeffec9f93401ed4650b',
  'a3samples/types.ts': '08e67b9ea18a67e88894502490c5234572051d12228cfe292d3e32102b55c329',
  'a3prep/contracts.ts': '4d856f45dd6016e1007d661f31388bf7bdbefd71862a6585ed4962240454b40f',
  'a3prep/corpusFreezePreflight.ts':
    'ddae984fec947845ec2e2df9feb24bf8b8f75c28993b413919c08a69c307fe75',
  'a3prep/sd9.ts': '1de6a2781f322be0dea679d58897c37f49f4b1ca41df1933e975b5291f6efbdd',
  'a3prep/sd7.ts': '322d2dd09f17dcc7ce0afa1862a13892f8bdadfece1c3ec919580f9d49977086',
  'a3prep/setPSd7.ts': 'b13c047f12ecf27583f07cef28923e3adc1e77ed2b3a1e1655de372cd79fdd4a',
  'a3prep/setRSd7Readiness.ts': '6db33d0d39d9ab90fbf2e1b8b44a9649a6aa6db380d9f97cb5f1f8bdeb19561a',
  'a3graphsV5/devTrain.ts': 'fbc843c05b9915668e76fa3bbd3600632b2b757bf6f8c7f56604ff6d11d0fcc4',
  'a3graphsV5/types.ts': 'aa40d3bafdd7228ab75a4caec59a6c5c334675f026462eeb3a9e2d9a81d5aac3',
  'a3documentsV5/devTrain.ts': 'db7534759162a5dad35e558e8ee97f78efec235846ba86cd413b5a3c677f36a2',
  'a3governanceV5/snapshotV5.ts':
    'd011e1ff595d1e2e1bf45c06daa5256925c73209641b9e6253577f4d95478cf8',
  'a3evidenceV5/devTrain.ts': '4637049717565a908205fd0fa589937012a26584e50bed23a6c04ae1dca2a7b6',
};

/** Every earlier namespace R43 must leave in place, with its file count. */
const FROZEN_NAMESPACES: Readonly<Record<string, number>> = {
  a3prep: 16,
  sd7: 9,
  a3governance: 7,
  a3governanceV2: 7,
  a3governanceV3: 8,
  a3governanceV4: 10,
  a3governanceV5: 12,
  a3crossGenerationSlotAuthority: 7,
  a3evidence: 7,
  a3evidenceV2: 6,
  a3evidenceV4: 6,
  a3evidenceV5: 7,
  a3documents: 6,
  a3documentsV2: 6,
  a3documentsV4: 6,
  a3documentsV5: 7,
  a3graphs: 6,
  a3graphsV2: 7,
  a3graphsV4: 6,
  a3graphsV5: 7,
  a3samples: 6,
  a3samplesV2: 6,
  a3samplesV4: 6,
  a3samplesV5: 7,
  a3readiness: 6,
  a3readinessV2: 6,
  a3readinessV4: 6,
};

function git(...args: readonly string[]): string {
  return execFileSync('git', ['-C', REPO_ROOT, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
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
const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');
const code = (file: string): string => readFileSync(join(REPO_ROOT, NAMESPACE, file), 'utf8');

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const allCode = (): string => NAMESPACE_FILES.map((file) => stripComments(code(file))).join('\n');

/** Code with string literals blanked: record kinds and disclaimers are not capabilities. */
const allCodeWithoutStrings = (): string =>
  allCode()
    .replace(/'[^'\n]*'/g, "''")
    .replace(/"[^"\n]*"/g, '""')
    .replace(/`[^`]*`/g, '``');

function specifiersOf(source: string): string[] {
  return [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]!);
}

/** Names imported at runtime from one specifier. */
function runtimeImportsFrom(source: string, specifier: string): string[] {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const names: string[] = [];
  for (const m of source.matchAll(
    new RegExp(`import\\s*(type\\s*)?\\{([^}]*)\\}\\s*from\\s*'${escaped}'`, 'g'),
  )) {
    if (m[1] !== undefined) continue;
    for (const raw of (m[2] ?? '').split(',')) {
      const name = raw.trim();
      if (name.length === 0 || name.startsWith('type ')) continue;
      names.push(name.replace(/\s+as\s+\w+$/, ''));
    }
  }
  return [...new Set(names)].sort();
}

const baseAvailable =
  commitExists(R42_TERMINAL) && commitExists(R42_SCOPE_PIN_COMMIT) && commitExists(R43_TERMINAL);

// ---------------------------------------------------------------------------
// A. THE NAMESPACE AND THE FROZEN SURFACES.
// ---------------------------------------------------------------------------

describe('2D-A3 R43: the new namespace is exactly these files', () => {
  it('holds the seven V5 incremental readiness modules', () => {
    expect(readdirSync(join(REPO_ROOT, NAMESPACE)).sort()).toEqual(NAMESPACE_FILES);
  });

  it('leaves every earlier A3 namespace at its file count', () => {
    for (const [namespace, count] of Object.entries(FROZEN_NAMESPACES)) {
      expect(readdirSync(join(REPO_ROOT, HARNESS, namespace)), namespace).toHaveLength(count);
    }
  });

  it.each(Object.entries(FROZEN_MODULE_SHA256))('%s is byte-identical to its pin', (path, pin) => {
    expect(sha256(readFileSync(join(REPO_ROOT, HARNESS, path)))).toBe(pin);
  });

  it('pins every file of R24, R37 and R42 (no unpinned reused module)', () => {
    for (const namespace of ['a3readiness', 'a3readinessV4', 'a3samplesV5']) {
      const onDisk = readdirSync(join(REPO_ROOT, HARNESS, namespace))
        .map((file) => `${namespace}/${file}`)
        .sort();
      const pinned = Object.keys(FROZEN_MODULE_SHA256)
        .filter((path) => path.startsWith(`${namespace}/`))
        .sort();
      expect(onDisk, namespace).toEqual(pinned);
    }
  });
});

// ---------------------------------------------------------------------------
// B. WHAT IS REUSED, AND WHAT IS NOT.
// ---------------------------------------------------------------------------

describe('2D-A3 R43 §3, §16, §17, §57: one R24 route, R42 by brand, nothing lower', () => {
  const PERMITTED_SPECIFIERS = new Set([
    '../a3readiness/membership.js',
    '../a3readiness/types.js',
    '../a3governanceV5/snapshotV5.js',
    '../a3samplesV5/census.js',
    '../a3samplesV5/devTrain.js',
    '../a3samplesV5/r41Drift.js',
    '../a3samplesV5/types.js',
    '../a3graphsV5/devTrain.js',
    '../a3graphsV5/types.js',
    '../a3documentsV5/devTrain.js',
    ...NAMESPACE_FILES.map((file) => `./${file.replace(/\.ts$/, '.js')}`),
  ]);
  const TYPE_ONLY_SPECIFIERS = new Set([
    '../a3governanceV5/snapshotV5.js',
    '../a3graphsV5/types.js',
  ]);

  it('imports nothing but landed R24 / R42 / R41 / R40 / V5 modules, V5 and R41 types as TYPES only', () => {
    for (const file of NAMESPACE_FILES) {
      const source = code(file);
      for (const specifier of specifiersOf(source)) {
        expect(PERMITTED_SPECIFIERS.has(specifier), `${file}: ${specifier}`).toBe(true);
      }
      for (const specifier of TYPE_ONLY_SPECIFIERS) {
        const imports = [...source.matchAll(/^import (type )?[^;]*? from '([^']+)';/gms)].filter(
          (match) => match[2] === specifier,
        );
        for (const match of imports) expect(match[1], `${file}: ${specifier}`).toBe('type ');
      }
    }
  });

  it('takes from R24 at runtime ONLY the pure helper and its status / semantics tokens', () => {
    const source = allCode();
    expect(runtimeImportsFrom(source, '../a3readiness/membership.js')).toEqual([
      'deriveUnboundSlotReachableMembershipReadiness',
    ]);
    expect(runtimeImportsFrom(source, '../a3readiness/types.js')).toEqual([
      'R24_SD9_SEMANTICS',
      'REACHABLE_INITIAL_CAP_MEMBERSHIP_BLOCKED',
      'REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT',
    ]);
  });

  it('§16: calls R24 at exactly one site, with the exact R42 preparation, once per item', () => {
    const calls = NAMESPACE_FILES.filter((file) =>
      stripComments(code(file)).includes('deriveUnboundSlotReachableMembershipReadiness('),
    );
    expect(calls).toEqual(['deriveDelta.ts']);
    const adapter = stripComments(code('deriveDelta.ts'));
    expect(adapter.match(/deriveUnboundSlotReachableMembershipReadiness\(/g)).toHaveLength(1);
    expect(adapter).toContain(
      'const unbound = deriveUnboundSlotReachableMembershipReadiness(preparation);',
    );
    expect(adapter).toMatch(/preparations\.forEach\(\(preparation, position\) => \{/);
    // The binder hands R24 the minted R42 preparation objects themselves.
    const binder = stripComments(code('devTrain.ts'));
    expect(binder).toContain('deriveDeltaSlotReadinessAllOrNothingV5(preparations)');
    expect(binder).toMatch(/const preparations = batch\.items\.map\(\(candidate, position\) =>/);
    expect(binder).toContain('return preparation;');
  });

  it('§17 / §57: no direct SD9, SET_P / SET_R readiness, cap, rank or survivor helper', () => {
    const source = allCodeWithoutStrings();
    for (const forbidden of [
      'deriveSd9BoundsUnderShortTextPolicy',
      'evaluateSd9FromExactPostSd7Count',
      'evaluateSd9FromAdmissiblePostSd7Bounds',
      'deriveSetPFreezeSlotReadiness',
      'deriveSetRFreezeSlotReadiness',
      'structuralIssueOfSetRFreezeSlotReadiness',
      'determineSetRDocumentCap',
      'requireReachableMembershipPolicyBinding',
      'rankSetPFull',
      'rankSetRFull',
      'prepareSetPSd7',
      'prepareSetRSd7',
      'prepareSd7SampleSurvivors',
      'prepareSetRDocumentScore',
      'prepareUnboundSlotSampleSurvivors',
      'sampleSurvivorDivergence',
      'measureUnboundSlotSd7Graph',
      'assembleUnboundSlotDocumentSources',
    ]) {
      expect(source, forbidden).not.toMatch(new RegExp(`\\b${forbidden}\\b`));
    }
    expect(allCode()).not.toMatch(/a3prep\/|sd7\/|a3samples\/|a3graphs\/|a3documents\//);
  });

  it('§64: runs no complete-corpus preflight, extension, short-text resolution or SD4 / K4', () => {
    const source = allCodeWithoutStrings();
    for (const forbidden of [
      /checkCurrentA3CorpusFreezePreflight|checkSet[PR]ShortTextCorpusFreezeGate|corpusFreezePreflight/,
      /organisationCaps|greatestFixedPoint|extendSet|extension\w*\(|Extension\w*\(/,
      /resolveShortText|shortTextResolution|joinShortText/i,
      /\bsd4\w*\(|\bk4\w*\(|gateShare/i,
      /mainText|tokeni[sz]e|shingle|jaccard|toLowerCase|textLookup/i,
    ]) {
      expect(source, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it('never mints through R24 / R30 / R37 or reaches upstream minting', () => {
    const source = allCodeWithoutStrings();
    for (const forbidden of [
      'bindDevTrainReachableMembershipSd9Batch',
      'bindDevTrainReachableMembershipSd9DeltaBatchV2',
      'bindDevTrainReachableMembershipSd9DeltaBatchV4',
      'deriveDeltaSlotReadinessAllOrNothingV4',
      'bindDevTrainSampleSurvivorDeltaBatchV5',
      'bindDevTrainSd7GraphDeltaBatchV5',
      'bindDevTrainDocumentSourceDeltaBatchV5',
      'runDevTrainEvidenceDeltaBindingV5',
      'loadCommittedA2GovernanceV',
    ]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
    expect(allCode()).not.toMatch(
      /a3readinessV2|a3readinessV4|a3readiness\/devTrain|a3samplesV[24]/,
    );
  });

  it('§6 / §53: never reads an acquisition or resolution generation, nor names Generation 2', () => {
    const source = allCode();
    expect(source).not.toMatch(
      /acquisitionGeneration|resolutionGeneration|occupantGeneration|factGeneration/,
    );
    expect(source).not.toMatch(/METHODOLOGY_V3_GEN2|GENERATION2|Gen2|gen2/);
    // The only generation token in the namespace is the stated Methodology-V2 one.
    expect(source.match(/METHODOLOGY_V2_GEN1/g)?.length ?? 0).toBeGreaterThan(0);
    expect(stripComments(code('types.ts'))).toContain("generation: 'METHODOLOGY_V2_GEN1',");
  });

  it('§18 / §20 / §21: keeps SET_R readiness and cap arrays by reference, slicing nothing', () => {
    const source = allCode();
    expect(source).not.toMatch(/\.slice\s*\(|\.splice\s*\(|\.subarray\s*\(|\.concat\s*\(/);
    expect(source).not.toMatch(/documents\s*:\s*\[|\[\s*\.\.\.\w*\.documents/);
    const derive = stripComments(code('deriveDelta.ts'));
    expect(derive).toContain(
      'unbound.setRFreezeSlotReadiness !== preparation.setRFreezeSlotReadiness',
    );
    expect(derive).toContain('membership.documents !== cap.documents');
    for (const field of [
      'setPFreezeSlotReadiness',
      'setRFreezeSlotReadiness',
      'setPReachableMembership',
      'setRReachableMembership',
      'setPSd9',
      'setRSd9',
    ]) {
      expect(stripComments(code('devTrain.ts'))).toContain(`${field}: unbound.${field},`);
    }
  });

  it('verifies, then derives every slot, then mints - through private brands', () => {
    const binder = stripComments(code('devTrain.ts'));
    for (const brand of [
      'const MINTED_DELTA_READINESS = new WeakSet<object>();',
      'const MINTED_DELTA_READINESS_BATCHES = new WeakSet<object>();',
      'const PREPARATION_BY_READINESS = new WeakMap<',
      'const READINESS_BY_PREPARATION = new WeakMap<',
      'const SAMPLE_BATCH_BY_READINESS_BATCH = new WeakMap<',
      'const READINESS_BATCH_BY_SAMPLE_BATCH = new WeakMap<',
    ]) {
      expect(binder).toContain(brand);
    }
    expect(allCode()).not.toMatch(
      /export const (MINTED_|PREPARATION_BY|READINESS_BY|SAMPLE_BATCH|READINESS_BATCH|R24_CALLS|IN_FLIGHT|REPRODUCTION_PROOF|HISTORY_PROOF)/,
    );
    const bind = binder.slice(
      binder.indexOf('export function bindDevTrainReachableMembershipSd9DeltaBatchV5'),
    );
    const order = [
      'requireMintedSampleDeltaBatch(',
      'requirePreparationMintedForBatch(',
      'requireAdditiveCoverage(',
      'deriveDeltaSlotReadinessAllOrNothingV5(',
      'requireReadinessAgreesWithR42(',
      'mintDeltaReadiness(',
      'MINTED_DELTA_READINESS_BATCHES.add(',
    ].map((marker) => bind.indexOf(marker));
    expect(order.every((index) => index > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(binder.match(/MINTED_DELTA_READINESS\.add\(/g)).toHaveLength(1);
    expect(binder).not.toMatch(/unsafeMint|testOnlyMint|forceMint|fromPlainObject/);
    // Each readiness is validated before the next is derived, and all before any mint.
    const derive = stripComments(code('deriveDelta.ts'));
    expect(
      derive.indexOf('deriveUnboundSlotReachableMembershipReadiness(preparation)'),
    ).toBeLessThan(
      derive.indexOf('requireReadinessDescribesPreparation(preparation, unbound, position)'),
    );
  });

  it('hardcodes no count, status distribution or index list in the binder path', () => {
    for (const file of ['deriveDelta.ts', 'devTrain.ts', 'census.ts', 'refusal.ts']) {
      const source = stripComments(code(file))
        .replace(/'[^'\n]*'/g, "''")
        .replace(/`[^`]*`/g, '``');
      expect(source, file).not.toMatch(/\b(?:[2-9]|\d{2,})\b/);
      expect(source, file).not.toMatch(/\[\s*\d+\s*,\s*\d+\s*,\s*\d+/);
    }
    expect(stripComments(code('devTrain.ts'))).not.toMatch(/expected(Item|Slot)?Count/);
    // The R42 checkpoint and R37 history pin NO numeric R24 SD9 / status outcome of the delta.
    const drift = stripComments(code('r42Drift.ts'));
    const checkpoint = drift.slice(drift.indexOf('R43_EXPECTED_R42_CHECKPOINT'));
    expect(checkpoint.slice(0, checkpoint.indexOf('] as const);'))).not.toMatch(
      /sd9Mechanical|reachableMembership\w*Count|sd9\w*Envelope|bothSamples|StatusDisagreement/,
    );
  });
});

// ---------------------------------------------------------------------------
// C. NO OTHER CAPABILITY.
// ---------------------------------------------------------------------------

describe('2D-A3 R43 §4, §9: no SQL, pool, env, fs, network, provider, sealed or downstream capability', () => {
  it('issues no SQL and touches no pool', () => {
    const source = allCode();
    expect(source).not.toMatch(/\bSELECT\b|\bINSERT\b|\bFROM\s+orgunit_|\bJOIN\b|\bWHERE\b/);
    expect(source).not.toMatch(
      /\.query\(|\.connect\(|\.end\(|\.release\(|new\s+Pool|from 'pg'|totalCount/,
    );
  });

  it('reads no environment and touches no filesystem, socket, provider or child process', () => {
    const source = allCode();
    for (const forbidden of [
      /process\.env/,
      /node:(fs|net|tls|http|https|dns|child_process|crypto)/,
      /\bfetch\s*\(/,
      /readFile|writeFile|appendFile|mkdir|createWriteStream|unlink|rmSync/,
      /execFile|execSync|spawn/,
      /anthropic|claude-agent-sdk|@anthropic-ai|orgunits\/classify|classifier\w*\(/i,
      /DATABASE_URL|nwf_admin|nwf_research|nwf_ingest|nwf_classifier/,
      /Date\.now|new Date\(|Math\.random/,
      /sha256\(|createHash|console\./,
    ]) {
      expect(source, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it('reaches no sealed root, A2 harness, Governance V6 or other split', () => {
    const source = allCode();
    expect(source).not.toMatch(
      /methodology-v2-sealed|gen1-dev-train|gen1-dev-confirm|gen1-final-holdout|phase2b2d2c/,
    );
    expect(source).not.toMatch(/continuationWindow|acquisitionGate|\/corpus\/|a3governanceV6/);
    expect(source).not.toMatch(/'DEV_CONFIRM'|'FINAL_HOLDOUT'/);
    expect(stripComments(code('types.ts'))).toContain('R43_READINESS_SPLIT = R42_SAMPLE_SPLIT');
  });

  it('copies no document identity, text, score or edge, and invents no authority hash', () => {
    for (const file of ['types.ts', 'devTrain.ts', 'census.ts']) {
      expect(stripComments(code(file)), file).not.toMatch(/documentSha256|\.documents\b/);
    }
    expect(allCode()).not.toMatch(
      /readonly\s+(mainText|text|title|headings|url|host|score|candidateScore|rankPosition|edges|aIndex|bIndex|documentSha256)\??\s*:/,
    );
    expect(allCode()).not.toMatch(
      /readinessDeltaHash|membershipCoverageHash|sd9ExpansionHash|reachableCorpusHash|batchHash/i,
    );
  });

  it('exposes no entry point over several organisations, historical readiness or twenty slots', () => {
    const exported = [...allCode().matchAll(/export (?:async )?function (\w+)/g)].map((m) => m[1]);
    expect(exported.sort()).toEqual(
      [
        'aggregateDeltaReadinessV5',
        'bindDevTrainReachableMembershipSd9DeltaBatchV5',
        'deltaReadinessForSamplePreparationV5',
        'deriveCanonicalReachableMembershipSd9CoverageExpansionV5',
        'deriveDeltaReadinessAggregatesV5',
        'deriveDeltaSlotReadinessAllOrNothingV5',
        'deriveR43PublicIncrementalReachableMembershipSd9Census',
        'emptyReadinessAggregateV5',
        'historicalReadinessCoverageProofForBatch',
        'isA3DevTrainReachableMembershipSd9DeltaBatchV5',
        'isA3DevTrainSlotReachableMembershipSd9DeltaV5',
        'r24CallsForReadinessDeltaBatchV5',
        'r42ReproductionDriftPaths',
        'r42ReproductionProofForBatch',
        'readinessDeltaBatchForSampleDeltaBatchV5',
        'refuseV5Readiness',
        'requireFreshR42Reproduction',
        'requireHistoricalV5ReadinessCoverage',
        'sampleDeltaBatchForReadinessDeltaBatchV5',
        'samplePreparationForDeltaReadinessV5',
      ].sort(),
    );
    expect(allCode()).not.toMatch(/twenty\w*Batch\s*[:=(]|allSlots|combinedReadiness\w*\(/i);
  });
});

// ---------------------------------------------------------------------------
// D. LINEAGE AND CHANGED SURFACE.
// ---------------------------------------------------------------------------

describe.skipIf(!baseAvailable)('2D-A3 R43: lineage and changed surface', () => {
  it('descends from the exact R42 tip, and merges no commit', () => {
    expect(() => git('merge-base', '--is-ancestor', R42_TERMINAL, R43_TERMINAL)).not.toThrow();
    expect(lines(git('rev-list', '--merges', `${R42_TERMINAL}..${R43_TERMINAL}`))).toEqual([]);
  });

  it('never makes the terminal A2 checkpoint an ancestor of A3', () => {
    if (commitExists(A2_CHECKPOINT)) {
      expect(() => git('merge-base', '--is-ancestor', A2_CHECKPOINT, 'HEAD')).toThrow();
    }
  });

  it("pinned R42's scope in exactly one first commit that touched exactly one file", () => {
    const [first] = lines(git('rev-list', '--reverse', `${R42_TERMINAL}..${R43_TERMINAL}`));
    expect(first).toBe(R42_SCOPE_PIN_COMMIT);
    expect(git('rev-parse', `${R42_SCOPE_PIN_COMMIT}^`).trim()).toBe(R42_TERMINAL);
    expect(lines(git('diff', '--name-only', R42_TERMINAL, R42_SCOPE_PIN_COMMIT))).toEqual([
      R42_ISOLATION_TEST,
    ]);
    expect(sha256(git('show', `${R43_TERMINAL}:${R42_ISOLATION_TEST}`))).toBe(
      sha256(git('show', `${R42_SCOPE_PIN_COMMIT}:${R42_ISOLATION_TEST}`)),
    );
  });

  it('leaves every earlier harness namespace untouched', () => {
    const touched = lines(
      git('diff', '--name-only', R42_TERMINAL, R43_TERMINAL, '--', HARNESS),
    ).filter((path) => !path.startsWith(`${NAMESPACE}/`));
    expect(touched).toEqual([]);
  });

  it('leaves every earlier A3 public census and audit byte-identical', () => {
    const prior = lines(
      git('ls-tree', '-r', '--name-only', R42_TERMINAL, '--', 'docs/evaluation', 'docs/audits'),
    );
    expect(prior.length).toBeGreaterThan(0);
    expect(lines(git('diff', '--name-only', R42_TERMINAL, R43_TERMINAL, '--', ...prior))).toEqual(
      [],
    );
  });

  it('changes nothing outside its namespace, tests, census, audit and the R42 scope pin', () => {
    const paths = lines(git('diff', '--name-only', R42_TERMINAL, R43_TERMINAL));
    const permitted = (path: string): boolean =>
      path === R42_ISOLATION_TEST ||
      path.startsWith(`${NAMESPACE}/`) ||
      R43_TESTS.includes(path) ||
      path === R43_CENSUS_PATH ||
      path === R43_AUDIT_PATH;
    expect(paths.filter((path) => !permitted(path))).toEqual([]);
  });

  it('created no R44, complete-preflight, Governance V6 or A5 artifact (tree at R43_TERMINAL)', () => {
    const tree = lines(git('ls-tree', '-r', '--name-only', R43_TERMINAL));
    for (const name of ['a3preflightV5', 'a3corpusFreeze', 'a3governanceV6']) {
      expect(
        tree.filter((path) => path.startsWith(`${HARNESS}/${name}/`)),
        name,
      ).toEqual([]);
    }
    const docs = tree
      .filter((path) => path.startsWith('docs/evaluation/') || path.startsWith('docs/audits/'))
      .map((path) => path.slice(path.lastIndexOf('/') + 1));
    expect(
      docs.filter((name) => /A3_R44|GOVERNANCE_AUTHORITY_CENSUS_V6|A5_.*FREEZE/.test(name)),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// E. THE PUBLIC CENSUS AND AUDIT.
// ---------------------------------------------------------------------------

describe.skipIf(!existsSync(join(REPO_ROOT, R43_CENSUS_PATH)))(
  '2D-A3 R43: the committed census and audit',
  () => {
    const censusText = existsSync(join(REPO_ROOT, R43_CENSUS_PATH))
      ? readFileSync(join(REPO_ROOT, R43_CENSUS_PATH), 'utf8')
      : '{}';
    const auditText = existsSync(join(REPO_ROOT, R43_AUDIT_PATH))
      ? readFileSync(join(REPO_ROOT, R43_AUDIT_PATH), 'utf8')
      : '';
    const census = JSON.parse(censusText) as Record<string, Record<string, unknown>>;

    it('is the derived census record, and authorises nothing', () => {
      expect(census.record).toBe(R43_PUBLIC_CENSUS_RECORD_KIND);
      expect(census.recordKind).toBe(
        'PUBLIC_AGGREGATE_ONLY_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS',
      );
      expect(census.thisFileAuthorises).toEqual([]);
      expect(census.r42Tip).toBe(R42_TERMINAL);
      expect(census.r42ScopePinCommit).toBe(R42_SCOPE_PIN_COMMIT);
      expect(census.terminalState).toBe(
        'R43_INCREMENTAL_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_V5_COMPLETE_READY_FOR_COMPLETE_CORPUS_PREFLIGHT',
      );
    });

    it('reproduced R42 fresh, excluding only implementationCommit', () => {
      expect(census.r42Reproduction).toMatchObject({
        freshInProcessUpstreamChainConsumed: true,
        freshR42CensusEqualsCommitted: true,
        excludedExecutionProvenanceFields: ['implementationCommit'],
        differingSemanticPathCount: 0,
        reproducedSampleSlots: 7,
        reproducedSampleCoverage: 20,
        reproducedReadinessCoverage: 13,
      });
    });

    it('states 13 historical + 7 new = 20 readiness slots, every total a sum', () => {
      const coverage = census.coverage as Record<string, unknown>;
      const historical = coverage.historical as Record<string, Record<string, number>>;
      const added = coverage.new as Record<string, Record<string, number>>;
      const combined = coverage.coverage as Record<string, Record<string, number>>;
      expect(coverage).toMatchObject({
        historicalCanonicalReadinessSlots: 13,
        newR43ReadinessSlots: 7,
        coverageReadinessSlots: 20,
        authorityCoverage: 20,
        evidenceCoverage: 20,
        documentCoverage: 20,
        graphCoverage: 20,
        sampleCoverage: 20,
        readinessCoverageAfterR43: 20,
        twentySlotReadinessBatchMinted: false,
        corpusFreezeApproved: false,
        a5Frozen: false,
      });
      expect(added.setP).toMatchObject({
        reachableMembershipExactSlotCount: 3,
        reachableMembershipBlockedSlotCount: 4,
        reachableMembershipDocumentCountAcrossExactSlots: 24,
        measurableSurvivorCount: 194,
        unresolvedShortTextOccurrenceCount: 23,
        sd9MinEnvelopeTotal: 194,
        sd9MaxEnvelopeTotal: 217,
      });
      expect(added.setR).toMatchObject({
        reachableMembershipExactSlotCount: 5,
        reachableMembershipBlockedSlotCount: 2,
        reachableMembershipDocumentCountAcrossExactSlots: 20,
        fullRankExactSlotCount: 3,
        fullRankShortTextBlockedSlotCount: 4,
        fullRankBlockedWhileReachableMembershipExactSlotCount: 2,
        measurableSurvivorCount: 194,
        unresolvedShortTextOccurrenceCount: 23,
        sd9MinEnvelopeTotal: 194,
        sd9MaxEnvelopeTotal: 217,
      });
      for (const sample of ['setP', 'setR'] as const) {
        const s = added[sample]!;
        expect(s.fullRankExactSlotCount! + s.fullRankShortTextBlockedSlotCount!).toBe(7);
        expect(
          s.sd9MechanicalSuccessfulSlotCount! +
            s.sd9MechanicalUnsuccessfulSlotCount! +
            s.sd9MechanicalPendingSlotCount!,
        ).toBe(7);
      }
      for (const section of ['setP', 'setR', 'crossSample'] as const) {
        for (const [key, value] of Object.entries(combined[section]!)) {
          expect(value, `${section}.${key}`).toBe(
            historical[section]![key]! + added[section]![key]!,
          );
        }
      }
      expect(combined.setP).toMatchObject({
        reachableMembershipExactSlotCount: 14,
        reachableMembershipBlockedSlotCount: 6,
        reachableMembershipDocumentCountAcrossExactSlots: 112,
        measurableSurvivorCount: 548,
        unresolvedShortTextOccurrenceCount: 31,
        sd9MinEnvelopeTotal: 548,
        sd9MaxEnvelopeTotal: 579,
      });
      expect(combined.setR).toMatchObject({
        reachableMembershipExactSlotCount: 16,
        reachableMembershipBlockedSlotCount: 4,
        reachableMembershipDocumentCountAcrossExactSlots: 64,
        fullRankExactSlotCount: 12,
        fullRankShortTextBlockedSlotCount: 8,
        fullRankBlockedWhileReachableMembershipExactSlotCount: 4,
        measurableSurvivorCount: 548,
        unresolvedShortTextOccurrenceCount: 31,
        sd9MinEnvelopeTotal: 548,
        sd9MaxEnvelopeTotal: 579,
      });
      expect(census.canonicalConstants).toMatchObject({
        setPMaxPagesPerOrganisation: 8,
        setRMaxPagesPerOrganisation: 4,
        sd9MinPagesPerOrganisation: 4,
        generation: 'METHODOLOGY_V2_GEN1',
      });
    });

    it('records zero R43 SQL, seven R24 calls and only canonical R39 access upstream', () => {
      expect(census.access).toMatchObject({
        r43SqlStatements: 0,
        databaseAccessOnlyThroughCanonicalUpstreamR39Reproduction: true,
        upstreamRole: 'nwf_readonly',
        upstreamDatabase: 'nwf_pe',
        upstreamTransactionReadOnly: true,
        upstreamTransactionIsolation: 'repeatable read',
        upstreamPoolConnections: 1,
        upstreamSnapshotTransactions: 1,
        upstreamSqlStatements: 45,
        upstreamNewAuthorityEvidenceLoads: 7,
        upstreamOldAuthorityEvidenceLoads: 0,
        upstreamDevConfirmEvidenceReads: 0,
        upstreamFinalHoldoutEvidenceReads: 0,
        upstreamWrites: 0,
        r21DocumentCalls: 7,
        r22GraphCalls: 7,
        r23SampleCalls: 7,
        r24ReadinessCalls: 7,
        historicalR24ReadinessCalls: 0,
        sqlAfterUpstreamPoolClose: 0,
        institutionNetworkRequests: 0,
        sealedRootReads: 0,
      });
      expect(census.semantics).toMatchObject({
        historicalReadinessRederived: false,
        historicalReadinessObjectsReminted: false,
        deltaOnlyReadinessDerivation: true,
        canonicalR24PureHelperUsed: true,
        canonicalR24CallsPerDeltaSlot: 1,
        canonicalR24CallCount: 7,
        historicalR24Calls: 0,
        setRReadinessRederived: false,
        canonicalCapArraysUsedByReference: true,
        capSliced: false,
        blockedCapMembershipInvented: false,
        fullRankExactnessRequiredForExactReachableCap: false,
        unreachableShortTextTailResolved: false,
        sd9UsesSurvivorEnvelopeNotCapCount: true,
        sd9MechanicalOnly: true,
        sd9SamplesForcedToAgree: false,
        directSd9Call: false,
        shortTextResolved: false,
        extensionPerformed: false,
        completeCorpusPreflightRun: false,
        sd4Applied: false,
        k4Applied: false,
        labelsRead: false,
        classifierCalled: false,
        finalDevTrainCorpusMaterialised: false,
      });
      expect(census.sd9AuthorityBoundary).toEqual({
        a3MechanicalReadinessOnly: true,
        rewritesA2AcquisitionStatus: false,
        createsReplacementObligation: false,
        consumesReserve: false,
        changesLedger: false,
        authorisesAcquisition: false,
        constitutesA2Adjudication: false,
        altersGovernanceV5: false,
        createsGovernanceV6: false,
      });
      expect(census.generationBoundary).toMatchObject({
        reachableMembershipPolicyGeneration: 'METHODOLOGY_V2_GEN1',
        policyGenerationDerivedFromAcquisitionGeneration: false,
        policyGenerationDerivedFromResolutionGeneration: false,
        r24OwnerPolicyBindingModified: false,
      });
    });

    it.each([
      ['census', censusText],
      ['audit', auditText],
    ])('the %s carries no identity-, position-, run- or digest-bearing value', (_name, text) => {
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(/\b[0-9a-f]{64}\b/);
      expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
      expect(text).not.toMatch(/https?:\/\//);
      expect(text).not.toMatch(
        /"selectionIndex"|"echeRowKey"|"organisationId"|"runRefSha256"|"aIndex"|"documentSha256"|"sourceRankPosition"|"saltedRankSha256"|"minCount"|"maxCount"/,
      );
      expect(text).not.toMatch(/G2[PR]:\d|\bR:\d+:\d+|\bP:\d+\b/);
      expect(text).not.toMatch(/sd7[^\s"]*\.json|detail\.json/i);
    });

    it('the census carries no per-slot array, score or fraction', () => {
      expect(censusText).not.toMatch(/\[\s*-?\d+(\.\d+)?\s*,/);
      expect(censusText).not.toMatch(/-?\d+\.\d+/);
    });

    it('neither the census nor the audit carries any V4 or V5 READY identity', () => {
      const v4 = loadCommittedA2GovernanceV4(REPO_ROOT);
      const v5 = loadCommittedA2GovernanceV5(REPO_ROOT);
      const identities = [
        ...readyAuthoritiesOfV4(v4).flatMap((ready) => [
          ready.organisationId,
          ready.echeRowKey,
          ready.runRefSha256,
          ready.drawEntrySha256,
        ]),
        ...readyAuthoritiesOfV5(v5).flatMap((ready) => [
          ready.occupant.source.organisationId,
          ready.occupant.source.echeRowKey,
          ready.runRefSha256,
        ]),
      ];
      for (const identity of identities) {
        expect(censusText).not.toContain(identity);
        expect(auditText).not.toContain(identity);
      }
    });
  },
);
