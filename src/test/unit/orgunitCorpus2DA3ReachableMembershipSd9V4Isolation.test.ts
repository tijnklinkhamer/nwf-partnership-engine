/**
 * PHASE 2B-2D A3 R37 — SCOPE, LINEAGE AND DISCLOSURE OF THE V4 INCREMENTAL
 * REACHABLE-MEMBERSHIP / SD9 READINESS.
 *
 * Proves, from the repository itself:
 *
 *   - R37 descends from the exact canonical R36 tip with no merge and no A2
 *     commit beyond the frozen V4 checkpoint, and pinned R36's scope in exactly
 *     one commit that touched exactly one file;
 *   - every earlier A3 namespace, A2 namespace and public record is
 *     byte-identical, and R24 / R30 / R36 in particular are pinned by digest;
 *   - `a3readinessV4/` takes from R24 at runtime only its pure helper and its
 *     status / semantics tokens, from R36 only brands, provenance accessors,
 *     its census / aggregate derivations and its split, and nothing from
 *     `a3prep/`, `sd7/`, R23 or any earlier upstream layer;
 *   - the namespace owns no rank, cap, slice, membership, readiness, SD9,
 *     preflight, SQL, environment, filesystem, network, provider or sealed
 *     capability, and hardcodes no selection index;
 *   - the public census (once written) is aggregate-only and carries no
 *     identity of any V4 READY authority.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { R37_PUBLIC_CENSUS_RECORD_KIND } from '../harness/phase2b2d/a3readinessV4/census.js';
import {
  loadCommittedA2GovernanceV4,
  readyAuthoritiesOfV4,
} from '../harness/phase2b2d/a3governanceV4/snapshotV4.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const HARNESS = 'src/test/harness/phase2b2d';
const A3READINESS_V4_REL = `${HARNESS}/a3readinessV4`;

/** The exact canonical R36 tip R37 was cut from. */
const R36_TERMINAL = '20bfa9082f406587bb401e85edfc4ea6fe33acc3';
/**
 * R37'S OWN TERMINAL COMMIT.
 *
 * R37's changed-surface and docs-scope assertions describe R37'S SLICE, so
 * they range over R37's own commits - `R36_TERMINAL..R37_TERMINAL` - rather
 * than over the working tree. Once a later slice lands on top, the working
 * tree is no longer R37's surface, and diffing to it would fail for the
 * honest reason that history moved on rather than because R37 changed.
 *
 * This is the same standing convention R19 through R36 apply, and it
 * WEAKENS NOTHING: R37's range is frozen, its permitted-path list is
 * unchanged, and each later slice pins the equivalent scope over its own range.
 */
const R37_TERMINAL = '9bfaa0ec2ec6f7c7c6eb18bce55e324505262064';
/** The exact canonical R35 tip, R36's own base. */
const R35_TERMINAL = 'e1428c35dad2e74313b58391386e65d54330d3b2';

/** The one commit that pinned R36's own changed-surface test to its range. */
const R36_SCOPE_PIN_COMMIT = '13a2459bf9eaf3124d62a2cb6ed1fb2e2e807455';
const R36_ISOLATION_TEST = 'src/test/unit/orgunitCorpus2DA3SampleSurvivorV4Isolation.test.ts';

/** The frozen A2 checkpoint Governance V4 describes. */
const V4_A2_CHECKPOINT = '67ae047fb7de079bcba0eec83ca4f4baee77cc3e';

const R37_TESTS = [
  'src/test/unit/orgunitCorpus2DA3ReachableMembershipSd9V4Binder.test.ts',
  'src/test/unit/orgunitCorpus2DA3ReachableMembershipSd9V4Delta.test.ts',
  'src/test/unit/orgunitCorpus2DA3ReachableMembershipSd9V4Isolation.test.ts',
];
const R37_CENSUS_PATH =
  'docs/evaluation/PHASE_2B_2D_A3_R37_DEV_TRAIN_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS_V1.json';
const R37_AUDIT_PATH =
  'docs/audits/PHASE_2B_2D_A3_R37_INCREMENTAL_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_V1.md';

const A3READINESS_V4_FILES = [
  'census.ts',
  'deriveDelta.ts',
  'devTrain.ts',
  'r36Drift.ts',
  'refusal.ts',
  'types.ts',
];

/** The reused and neighbouring layers, byte-pinned at the R36 tip. */
const REUSED_MODULE_SHA256: Readonly<Record<string, string>> = {
  'a3readiness/census.ts': '13390bd301612bbe2d360866c57ea5366fe632f056136c121957ec75c2c156ed',
  'a3readiness/devTrain.ts': '6150dd955b7b5821b7080f586e2906ce3b97e539b54fe25b26d2ac8d1f60ebe9',
  'a3readiness/membership.ts': 'e387d9f1efa6e0c8aa5150463469d2645aae09d34ef88007bf756a1ddc87fe5e',
  'a3readiness/r23Drift.ts': 'e97c9270f49ae221ff616a96cd30531183774ff5dd300eb44be2fbc2fbbab697',
  'a3readiness/refusal.ts': '466de2f0773c413548458bc683c9bd3e58bbe374b0ade4e8e5df5fa4f8105a5a',
  'a3readiness/types.ts': 'ef9f4c55d32a467ebb19d3131942c2eccc4fe42eae6b083d07cd8f3f41b1d99e',
  'a3readinessV2/census.ts': 'fc2b847108a75eb351eb2d8bd264b7f6350e689c684cfcc1b750e4adbc2628b9',
  'a3readinessV2/deriveDelta.ts':
    'ce77a1dba40ed33d82a1ba5c5fff4b6661e1d985e40e74ff42f97d132032c209',
  'a3readinessV2/devTrain.ts': 'ce013673af5c5336d98e81dfc61497f01177a56297690d07a202847bf90ccf92',
  'a3readinessV2/r29Drift.ts': 'd5da1d642da9940de8cc6119545b3cbdc09cd3e3a7d0d021091017a183f3614e',
  'a3readinessV2/refusal.ts': 'bdaab2acab39c3ee7966d0a745a2d03360ce6edede3d27992a92131c4ff60ddf',
  'a3readinessV2/types.ts': 'e537729fe59021df38542d7e7acb791a7d96fb3b2962274c1be5e2cd9dd777f3',
  'a3samplesV4/census.ts': 'ba488bc19775d3b562372ec4d5758c9840061d8ea8740f99776cbb7eefad792d',
  'a3samplesV4/devTrain.ts': '34141dbe2d01357b7e6ae21f8d6f6ae87a4cc25b8560b785d6ad048a77f819ef',
  'a3samplesV4/prepareDelta.ts': 'ddde43591fad0682882b7aafb77131779f4940e81fbcd85829bd48850afe6225',
  'a3samplesV4/r35Drift.ts': '0d8952f86c9bb9d02e6fb50b8150bd97ab58eddf07ee87d45ad61fc878e71a42',
  'a3samplesV4/refusal.ts': 'c64c2d618d86cd6ea3d30d2a165c3abfaf4c1a2d828a62d4746aaa8a9dbdea6b',
  'a3samplesV4/types.ts': 'ab3fdeb1c8d1cb737a3d445779d0248cd9b06ac546ffa85cc4e9bbfea395e89f',
  'a3prep/contracts.ts': '4d856f45dd6016e1007d661f31388bf7bdbefd71862a6585ed4962240454b40f',
  'a3prep/corpusFreezePreflight.ts':
    'ddae984fec947845ec2e2df9feb24bf8b8f75c28993b413919c08a69c307fe75',
  'a3prep/sd9.ts': '1de6a2781f322be0dea679d58897c37f49f4b1ca41df1933e975b5291f6efbdd',
  'a3prep/setPSd7.ts': 'b13c047f12ecf27583f07cef28923e3adc1e77ed2b3a1e1655de372cd79fdd4a',
  'a3prep/setRSd7Readiness.ts': '6db33d0d39d9ab90fbf2e1b8b44a9649a6aa6db380d9f97cb5f1f8bdeb19561a',
  'a3governanceV4/snapshotV4.ts':
    'd6671faa0d7e7247407b9c9d92054199a7ae21ada98fd60674c94f88e571f2e7',
};

/** Every earlier namespace R37 must leave byte-identical, with its file count. */
const FROZEN_NAMESPACES: Readonly<Record<string, number>> = {
  a3prep: 16,
  a3governance: 7,
  a3governanceV2: 7,
  a3governanceV3: 8,
  a3governanceV4: 10,
  a3evidence: 7,
  a3evidenceV2: 6,
  a3evidenceV4: 6,
  a3documents: 6,
  a3documentsV2: 6,
  a3documentsV4: 6,
  a3graphs: 6,
  a3graphsV2: 7,
  a3graphsV4: 6,
  a3samples: 6,
  a3samplesV2: 6,
  a3samplesV4: 6,
  a3readiness: 6,
  a3readinessV2: 6,
  sd7: 9,
  acquisitionGate: -1,
  continuationWindow: -1,
  corpus: -1,
  draw: -1,
  transition: -1,
  v3transition: -1,
};

function git(...args: readonly string[]): string {
  return execFileSync('git', ['-C', REPO_ROOT, ...args], { encoding: 'utf8' });
}

function commitExists(commit: string): boolean {
  try {
    execFileSync('git', ['-C', REPO_ROOT, 'cat-file', '-e', `${commit}^{commit}`], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function code(file: string): string {
  return stripComments(readFileSync(join(REPO_ROOT, A3READINESS_V4_REL, file), 'utf8'));
}

function specifiersOf(source: string): string[] {
  const found: string[] = [];
  for (const m of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) found.push(m[1] ?? '');
  for (const m of source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) found.push(m[1] ?? '');
  for (const m of source.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g))
    found.push(m[1] ?? '');
  for (const m of source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) found.push(m[1] ?? '');
  return found;
}

/** Names imported from one specifier, split by whether the import is type-only. */
function importsFrom(source: string, specifier: string): { runtime: string[]; typeOnly: string[] } {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const runtime: string[] = [];
  const typeOnly: string[] = [];
  for (const m of source.matchAll(
    new RegExp(`import\\s*(type\\s*)?\\{([^}]*)\\}\\s*from\\s*'${escaped}'`, 'g'),
  )) {
    const wholeTypeOnly = m[1] !== undefined;
    for (const raw of (m[2] ?? '').split(',')) {
      const name = raw.trim();
      if (name.length === 0) continue;
      if (wholeTypeOnly || name.startsWith('type ')) typeOnly.push(name.replace(/^type\s+/, ''));
      else runtime.push(name.replace(/\s+as\s+\w+$/, ''));
    }
  }
  return { runtime: [...new Set(runtime)].sort(), typeOnly: [...new Set(typeOnly)].sort() };
}

function lines(value: string): string[] {
  return value.split('\n').filter((line) => line.length > 0);
}

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function allCode(): string {
  return A3READINESS_V4_FILES.map(code).join('\n');
}

/** Code with string literals blanked: record kinds and disclaimers are not capabilities. */
function allCodeWithoutStrings(): string {
  return allCode()
    .replace(/'[^'\n]*'/g, "''")
    .replace(/"[^"\n]*"/g, '""')
    .replace(/`[^`]*`/g, '``');
}

/** `r36Drift.ts` without its pinned R36 checkpoint object - which states R36 COUNTS. */
function driftWithoutCheckpoint(): string {
  return code('r36Drift.ts').replace(
    /R37_EXPECTED_R36_CHECKPOINT = Object\.freeze\(\{[\s\S]*?\n\}\);/,
    '',
  );
}

const baseAvailable =
  commitExists(R36_TERMINAL) &&
  commitExists(R35_TERMINAL) &&
  commitExists(R36_SCOPE_PIN_COMMIT) &&
  commitExists(R37_TERMINAL);

// ---------------------------------------------------------------------------

describe('2D-A3 R37: the new namespace is exactly these files', () => {
  it('holds the six V4 incremental readiness modules', () => {
    expect(readdirSync(join(REPO_ROOT, A3READINESS_V4_REL)).sort()).toEqual(A3READINESS_V4_FILES);
  });

  it('leaves every earlier A3 namespace at its file count', () => {
    for (const [namespace, count] of Object.entries(FROZEN_NAMESPACES)) {
      if (count < 0) continue;
      expect(readdirSync(join(REPO_ROOT, HARNESS, namespace)), namespace).toHaveLength(count);
    }
  });

  it('leaves R24, R30, R36, the canonical contracts / preflight / SD9 and the V4 snapshot byte-identical', () => {
    for (const [file, digest] of Object.entries(REUSED_MODULE_SHA256)) {
      expect(sha256(readFileSync(join(REPO_ROOT, HARNESS, file))), file).toBe(digest);
    }
    for (const namespace of ['a3readiness', 'a3readinessV2', 'a3samplesV4']) {
      const onDisk = readdirSync(join(REPO_ROOT, HARNESS, namespace))
        .map((file) => `${namespace}/${file}`)
        .sort();
      const pinned = Object.keys(REUSED_MODULE_SHA256)
        .filter((path) => path.startsWith(`${namespace}/`))
        .sort();
      expect(onDisk, namespace).toEqual(pinned);
    }
  });
});

describe("2D-A3 R37 §11 / §23: R24's pure helper and R36's provenance, nothing else", () => {
  const PERMITTED_SPECIFIERS = new Set([
    '../a3readiness/membership.js',
    '../a3readiness/types.js',
    '../a3samplesV4/census.js',
    '../a3samplesV4/devTrain.js',
    '../a3samplesV4/types.js',
    '../a3governanceV4/snapshotV4.js',
    './census.js',
    './deriveDelta.js',
    './devTrain.js',
    './r36Drift.js',
    './refusal.js',
    './types.js',
  ]);

  it('imports nothing but R24 membership/types, R36, the type-only V4 snapshot and local modules', () => {
    for (const file of A3READINESS_V4_FILES) {
      for (const specifier of specifiersOf(code(file))) {
        expect(PERMITTED_SPECIFIERS.has(specifier), `${file}: ${specifier}`).toBe(true);
      }
    }
    expect(importsFrom(allCode(), '../a3governanceV4/snapshotV4.js').runtime).toEqual([]);
  });

  it('imports nothing at all from a3prep/, sd7/, R23 or any earlier upstream layer', () => {
    expect(allCode()).not.toMatch(
      /a3prep\/|sd7\/|a3samples\/|a3samplesV2|a3graphs|a3documents|a3evidence|a3governance\/|a3governanceV[23]|a3readinessV2/,
    );
  });

  it('takes from R24 at runtime ONLY the pure helper and its status / semantics tokens', () => {
    const source = allCode();
    expect(importsFrom(source, '../a3readiness/membership.js').runtime).toEqual([
      'deriveUnboundSlotReachableMembershipReadiness',
    ]);
    expect(importsFrom(source, '../a3readiness/types.js').runtime).toEqual([
      'R24_SD9_SEMANTICS',
      'REACHABLE_INITIAL_CAP_MEMBERSHIP_BLOCKED',
      'REACHABLE_INITIAL_CAP_MEMBERSHIP_EXACT',
    ]);
  });

  it('§11: calls the R24 helper in exactly one place, with the exact R36 preparation', () => {
    const source = allCode();
    expect(source.match(/deriveUnboundSlotReachableMembershipReadiness\(/g)).toHaveLength(1);
    expect(code('deriveDelta.ts')).toMatch(
      /const unbound = deriveUnboundSlotReachableMembershipReadiness\(preparation\);/,
    );
    expect(code('devTrain.ts')).toMatch(
      /const unbound = deriveDeltaSlotReadinessAllOrNothingV4\(preparations\);/,
    );
    expect(source.match(/deriveDeltaSlotReadinessAllOrNothingV4\(/g)).toHaveLength(2);
    expect(code('devTrain.ts')).toMatch(/const preparations = batch\.items\.map\(/);
  });

  it('takes from R36 only brands, provenance accessors, census / aggregate derivation and split', () => {
    const source = allCode();
    expect(importsFrom(source, '../a3samplesV4/devTrain.js').runtime).toEqual([
      'deltaGraphForSamplePreparationV4',
      'graphDeltaBatchForSampleDeltaBatchV4',
      'isA3DevTrainSampleSurvivorDeltaBatchV4',
      'isA3DevTrainSlotSampleSurvivorPreparationDeltaV4',
      'sampleDeltaBatchForGraphDeltaBatchV4',
      'samplePreparationForDeltaGraphV4',
    ]);
    expect(importsFrom(source, '../a3samplesV4/census.js').runtime).toEqual([
      'deriveDeltaSampleAggregatesV4',
      'deriveR36PublicIncrementalSampleSurvivorCensus',
    ]);
    expect(importsFrom(source, '../a3samplesV4/types.js').runtime).toEqual(['R36_SAMPLE_SPLIT']);
  });

  it('§11 / §43: names no direct SD9, readiness, cap, preflight, historical or upstream call', () => {
    const source = allCodeWithoutStrings();
    for (const forbidden of [
      'deriveSd9BoundsUnderShortTextPolicy',
      'evaluateSd9FromExactPostSd7Count',
      'evaluateSd9FromAdmissiblePostSd7Bounds',
      'deriveSetPFreezeSlotReadiness',
      'deriveSetRFreezeSlotReadiness',
      'determineSetRDocumentCap',
      'requireReachableMembershipPolicyBinding',
      'checkSetPShortTextCorpusFreezeGate',
      'checkSetRShortTextCorpusFreezeGate',
      'checkCurrentA3CorpusFreezePreflight',
      'bindDevTrainReachableMembershipSd9Batch\\b',
      'bindDevTrainReachableMembershipSd9DeltaBatchV2',
      'deriveDeltaSlotReadinessAllOrNothing\\b',
      'prepareUnboundSlotSampleSurvivors',
      'prepareDeltaSlotSamplesAllOrNothingV4',
      'bindDevTrainSampleSurvivorBatch',
      'bindDevTrainSampleSurvivorDeltaBatchV\\d',
      'bindDevTrainSd7GraphDeltaBatchV\\d',
      'bindDevTrainDocumentSourceDeltaBatchV\\d',
      'runDevTrainEvidenceDeltaBindingV\\d',
      'withReadOnlyEvidenceSnapshot',
      'loadUnboundDurableRunEvidence',
      'loadCommittedA2GovernanceV\\d',
      'readyAuthoritiesOfV4',
      'requireFreshR3[345]Reproduction',
      'requireHistoricalSamplePreparationBaseline',
      'measureUnboundSlotSd7Graph',
      'assembleUnboundSlotDocumentSources',
    ]) {
      expect(source, forbidden).not.toMatch(new RegExp(`\\b${forbidden}`));
    }
  });

  it('hardcodes no selection index anywhere outside the stated R36 count checkpoint', () => {
    const outside = A3READINESS_V4_FILES.filter((file) => file !== 'r36Drift.ts')
      .map(code)
      .join('\n');
    for (const source of [outside, driftWithoutCheckpoint()]) {
      expect(source).not.toMatch(/\b(34|39|44|49|56|61|71)\b/);
      expect(source).not.toMatch(/\[\s*\d+\s*,\s*\d+\s*,\s*\d+/);
    }
    // The one `44` in the namespace is the SET_R exact-cap document count R36 states.
    expect(code('r36Drift.ts').match(/\b44\b/g)).toHaveLength(1);
    expect(code('r36Drift.ts')).toMatch(
      /'coverage\.coverage\.setR\.exactCapDocumentCountAcrossExactSlots': 44,/,
    );
  });

  it('§18: pins no delta SD9 status distribution and no delta full-rank count from R24', () => {
    for (const file of ['devTrain.ts', 'deriveDelta.ts', 'census.ts', 'types.ts', 'refusal.ts']) {
      const source = code(file)
        .replace(/R37_STATED_CANONICAL_READINESS_CONSTANTS = Object\.freeze\(\{[^}]*\}/, '')
        .replace(/'[^'\n]*'/g, "''")
        .replace(/`[^`]*`/g, '``');
      expect(source, file).not.toMatch(/\b(?:[3-9]|\d{2,})\b/);
    }
    const checkpoint = code('r36Drift.ts').match(
      /R37_EXPECTED_R36_CHECKPOINT = Object\.freeze\(\{([\s\S]*?)\n\}\);/,
    )?.[1];
    expect(checkpoint).toBeDefined();
    // Its booleans restate R36's own `sd9Evaluated` / `reachableMembershipBound: false`;
    // no NUMERIC entry pins an R24 SD9, envelope, membership or status outcome.
    const numericKeys = [...(checkpoint ?? '').matchAll(/'([^']+)':\s*\d+,/g)].map((m) => m[1]);
    expect(numericKeys.length).toBeGreaterThan(40);
    for (const key of numericKeys) {
      expect(key).not.toMatch(/sd9|reachable|successful|pending|envelope|fullRankBlockedWhile/i);
    }
  });
});

describe('2D-A3 R37 §23: no env, fs, network, SQL, provider, sealed, slicing or extension capability', () => {
  it('reads no environment and touches no filesystem, socket, provider, child process or pg', () => {
    const source = allCode();
    for (const forbidden of [
      /process\.env/,
      /DATABASE_URL/,
      /config\/env/,
      /src\/db\//,
      /from 'pg'/,
      /node:(fs|net|tls|http|https|dns|child_process)/,
      /\bfetch\s*\(/,
      /readFile|writeFile|appendFile|mkdir|rmSync|unlink|createWriteStream|execFileSync/,
      /anthropic|claude-agent-sdk|@anthropic-ai|openai|apollo/i,
      /orgunits\/(classify|web|orchestrator|signals)|phase2b2d2c|gateway|crawler/,
      /methodology-v2-sealed|gen1-dev-train|gen1-dev-confirm|gen1-final-holdout|SD7_DETAIL/,
      /console\./,
    ]) {
      expect(source, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it('writes no SQL and opens no transaction, pool or query', () => {
    const source = allCode();
    expect(source).not.toMatch(
      /\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bTRUNCATE\b|\bBEGIN\b|\bCOMMIT\b|\bROLLBACK\b/,
    );
    expect(source).not.toMatch(/\.connect\s*\(|new\s+pg\.|Pool\s*\(|\.query\s*\(|transaction/i);
  });

  it('§23: slices, splices or subarrays nothing, and sorts only census field keys', () => {
    expect(allCode()).not.toMatch(/\.slice\s*\(|\.splice\s*\(|\.subarray\s*\(/);
    for (const file of ['devTrain.ts', 'deriveDelta.ts', 'census.ts', 'types.ts', 'refusal.ts']) {
      expect(code(file), file).not.toMatch(/\.sort\s*\(/);
    }
    const drift = code('r36Drift.ts');
    expect(drift.match(/\.sort\s*\(/g)).toHaveLength(2);
    expect(drift).toMatch(/Object\.keys\(value\)\s*\.sort\(\)/);
    expect(drift).toMatch(/\[\.\.\.keys\]\.sort\(\)/);
    expect(drift).not.toMatch(/documentSha256|measurableSurvivors\b|\.documents\b/);
  });

  it('owns no rank, salt, score, walk, text, graph, short-text resolution, SD4/K4 or extension code', () => {
    const source = allCodeWithoutStrings();
    for (const forbidden of [
      /\b(rankSetPFull|rankSetRFull|prepareSetPSd7|prepareSetRSd7|prepareSd7SampleSurvivors)\b/,
      /\b(prepareSetRDocumentScore|reduceTrackScore|candidateScore\w*|scorePreparation)\b/,
      /salt(?!edRankDigests)|createHash|node:crypto|sha256\s*\(/i,
      /localeCompare|compareScores|scoreCompare|sortBy/,
      /greedy\w*\s*\(|survivorWalk|walkSurvivors|nearDuplicatePass/i,
      /normaliseForShingling|tokeni[sz]e|shingle|jaccard|textLookup|mainText/i,
      /connectedComponent|unionFind|disjointSet|sampleSurvivorDivergence/i,
      /Sd9Bounds|evaluateSd9|minPagesNotMet\s*\(|MIN_PAGES/,
      /organisationCaps|greatestFixedPoint|gateShare|extendSet|extension\w*\(|cursor/i,
      /resolveShortText|shortTextResolution|joinShortText/i,
      /\bsd4\w*\(|\bk4\w*\(/i,
      /continuationWindow|acquisitionGate|v3transition|\/transition\/|\/corpus\/|\/draw\//,
      /\blatest\b|rev-parse|ls-remote|origin\/|feat\/phase2b-2d-a2/i,
    ]) {
      expect(source, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it('names no DEV_CONFIRM or FINAL_HOLDOUT split and takes no split parameter', () => {
    const source = allCode();
    expect(source).not.toMatch(/DEV_CONFIRM|FINAL_HOLDOUT/);
    expect(source).not.toMatch(/\bsplit\s*:\s*(Split|string)\s*[,)]/);
  });

  it('§32: no R37 type or minted object copies a document identity, text, score or edge', () => {
    for (const file of ['types.ts', 'devTrain.ts', 'census.ts']) {
      expect(code(file), file).not.toMatch(/\bdocuments\b|documentSha256/);
    }
    expect(allCode()).not.toMatch(
      /readonly\s+(mainText|redactedText|text|title|headings|url|host|score|candidateScore|rankPosition|edges|aIndex|bIndex|documentSha256)\??\s*:/,
    );
  });

  it('§22: has no unsafe, test-only, forced or plain-object mint and invents no authority hash', () => {
    const source = allCode();
    expect(source).not.toMatch(/unsafeMint|testOnlyMint|forceMint|fromPlainObject/);
    expect(source).not.toMatch(
      /readinessDeltaHash|membershipCoverageHash|sd9ExpansionHash|reachableCorpusHash/,
    );
  });

  it('exposes no entry point over several organisations, historical readiness or thirteen slots', () => {
    const exported = [...allCode().matchAll(/export (?:async )?function (\w+)/g)].map((m) => m[1]);
    expect(exported.sort()).toEqual(
      [
        'aggregateDeltaReadinessV4',
        'bindDevTrainReachableMembershipSd9DeltaBatchV4',
        'deltaReadinessForSamplePreparationV4',
        'deriveCanonicalReachableMembershipSd9CoverageExpansionV4',
        'deriveDeltaReadinessAggregatesV4',
        'deriveDeltaSlotReadinessAllOrNothingV4',
        'deriveR37PublicIncrementalReachableMembershipSd9Census',
        'emptyReadinessAggregateV4',
        'isA3DevTrainReachableMembershipSd9DeltaBatchV4',
        'isA3DevTrainSlotReachableMembershipSd9DeltaV4',
        'r36ReproductionDriftPaths',
        'r36ReproductionProofForBatch',
        'readinessDeltaBatchForSampleDeltaBatchV4',
        'refuseV4Readiness',
        'requireFreshR36Reproduction',
        'requireHistoricalReadinessBaselineProofV4',
        'requireHistoricalReadinessBaselineV4',
        'sampleDeltaBatchForReadinessDeltaBatchV4',
        'samplePreparationForDeltaReadinessV4',
      ].sort(),
    );
    expect(allCode()).not.toMatch(
      /thirteen\w*Batch\s*[:=(]|\bhistoricalReadiness\w*\s*\(|historicalPreparations?\s*[:=(]|allSlots|combinedDocuments/i,
    );
  });
});

describe.skipIf(!baseAvailable)('2D-A3 R37: lineage and changed surface', () => {
  it('descends from the exact canonical R36 tip, and merges no commit', () => {
    expect(() => git('merge-base', '--is-ancestor', R36_TERMINAL, 'HEAD')).not.toThrow();
    expect(() => git('merge-base', '--is-ancestor', R36_SCOPE_PIN_COMMIT, 'HEAD')).not.toThrow();
    expect(lines(git('rev-list', '--merges', `${R36_TERMINAL}..HEAD`))).toEqual([]);
    expect(git('rev-parse', `${R36_SCOPE_PIN_COMMIT}^`).trim()).toBe(R36_TERMINAL);
    expect(git('rev-parse', `${R36_TERMINAL}~4`).trim()).toBe(R35_TERMINAL);
  });

  it('adds no A2 commit beyond the frozen V4 checkpoint', () => {
    const introduced = lines(git('rev-list', `${R36_TERMINAL}..HEAD`));
    for (const commit of introduced) {
      expect(lines(git('rev-list', '--parents', '-n', '1', commit))[0]!.split(' ')).toHaveLength(2);
    }
    if (commitExists(V4_A2_CHECKPOINT)) {
      expect(() => git('merge-base', '--is-ancestor', V4_A2_CHECKPOINT, 'HEAD')).toThrow();
    }
  });

  it("pinned R36's scope in exactly one commit that touched exactly one file", () => {
    expect(lines(git('diff', '--name-only', R36_TERMINAL, R36_SCOPE_PIN_COMMIT))).toEqual([
      R36_ISOLATION_TEST,
    ]);
    expect(sha256(readFileSync(join(REPO_ROOT, R36_ISOLATION_TEST)))).toBe(
      sha256(git('show', `${R36_SCOPE_PIN_COMMIT}:${R36_ISOLATION_TEST}`)),
    );
  });

  it('leaves every earlier A3 namespace and the A2 harness untouched', () => {
    for (const namespace of Object.keys(FROZEN_NAMESPACES)) {
      const path = `${HARNESS}/${namespace}`;
      expect(lines(git('diff', '--name-only', R36_TERMINAL, '--', path)), path).toEqual([]);
      expect(lines(git('ls-files', '--others', '--exclude-standard', '--', path)), path).toEqual(
        [],
      );
    }
  });

  it('leaves every earlier A3 public census and audit byte-identical', () => {
    const prior = lines(
      git('ls-tree', '-r', '--name-only', R36_TERMINAL, '--', 'docs/evaluation', 'docs/audits'),
    ).filter((path) => /PHASE_2B_2D_A3_R\d+_/.test(path));
    expect(prior.length).toBeGreaterThanOrEqual(37);
    for (const record of prior) {
      expect(sha256(readFileSync(join(REPO_ROOT, record))), record).toBe(
        sha256(git('show', `${R36_TERMINAL}:${record}`)),
      );
    }
  });

  it('writes no other record: every docs/evaluation change is the R37 census', () => {
    const changed = lines(
      git('diff', '--name-only', R36_TERMINAL, R37_TERMINAL, '--', 'docs/evaluation'),
    );
    expect(changed.filter((path) => path !== R37_CENSUS_PATH)).toEqual([]);
  });

  it('changes nothing outside its own namespace, tests, records and the R36 scope pin', () => {
    const paths = lines(git('diff', '--name-only', R36_TERMINAL, R37_TERMINAL));
    const permitted = (path: string): boolean =>
      path.startsWith(`${A3READINESS_V4_REL}/`) ||
      R37_TESTS.includes(path) ||
      path === R36_ISOLATION_TEST ||
      path === R37_CENSUS_PATH ||
      path === R37_AUDIT_PATH;
    expect(paths.filter((path) => !permitted(path))).toEqual([]);
  });
});

describe.skipIf(!existsSync(join(REPO_ROOT, R37_CENSUS_PATH)))(
  '2D-A3 R37: the public census',
  () => {
    const raw = existsSync(join(REPO_ROOT, R37_CENSUS_PATH))
      ? readFileSync(join(REPO_ROOT, R37_CENSUS_PATH), 'utf8')
      : '{}';
    const audit = existsSync(join(REPO_ROOT, R37_AUDIT_PATH))
      ? readFileSync(join(REPO_ROOT, R37_AUDIT_PATH), 'utf8')
      : '';
    const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>;
    const payload = (() => {
      const copy = JSON.parse(raw) as Record<string, unknown>;
      delete copy['identityDisclosure'];
      delete copy['whatThisIsNot'];
      return JSON.stringify(copy);
    })();
    const sample = (path: string): Record<string, number> =>
      path
        .split('.')
        .reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], parsed) as Record<
        string,
        number
      >;

    it('is the R37 record, authorises nothing, and states its provenance', () => {
      expect(parsed['record']).toBe(R37_PUBLIC_CENSUS_RECORD_KIND);
      expect(parsed['recordKind']).toBe(
        'PUBLIC_AGGREGATE_ONLY_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS',
      );
      expect(parsed['thisFileAuthorises']).toEqual([]);
      expect(parsed['r36Tip']).toBe(R36_TERMINAL);
      expect(parsed['r36ScopePinCommit']).toBe(R36_SCOPE_PIN_COMMIT);
      expect(parsed['split']).toBe('DEV_TRAIN');
      expect(parsed['r36Reproduction']!['freshR36CensusEqualsCommitted']).toBe(true);
      expect(parsed['r36Reproduction']!['excludedExecutionProvenanceFields']).toEqual([
        'implementationCommit',
      ]);
    });

    it('§41: states the fixed delta consequences, and each status partition closes at seven', () => {
      expect(parsed['delta']!['deltaReadinessSlots']).toBe(7);
      const p = sample('delta.setP');
      const r = sample('delta.setR');
      expect(p).toMatchObject({
        reachableMembershipExactSlotCount: 5,
        reachableMembershipBlockedSlotCount: 2,
        reachableMembershipDocumentCountAcrossExactSlots: 40,
      });
      expect(r).toMatchObject({
        reachableMembershipExactSlotCount: 5,
        reachableMembershipBlockedSlotCount: 2,
        reachableMembershipDocumentCountAcrossExactSlots: 20,
        fullRankExactSlotCount: 4,
        fullRankShortTextBlockedSlotCount: 3,
      });
      for (const s of [p, r]) {
        expect(s).toMatchObject({
          measurableSurvivorCount: 178,
          unresolvedShortTextOccurrenceCount: 7,
          sd9MinEnvelopeTotal: 178,
          sd9MaxEnvelopeTotal: 185,
        });
        expect(
          s['sd9MechanicalSuccessfulSlotCount']! +
            s['sd9MechanicalUnsuccessfulSlotCount']! +
            s['sd9MechanicalPendingSlotCount']!,
        ).toBe(7);
        expect(s['fullRankExactSlotCount']! + s['fullRankShortTextBlockedSlotCount']!).toBe(7);
        expect(s['fullRankBlockedWhileReachableMembershipExactSlotCount']).toBeLessThanOrEqual(
          s['fullRankShortTextBlockedSlotCount']!,
        );
      }
      const cross = sample('delta.crossSample');
      expect(cross['bothSamplesMechanicallySuccessfulSlotCount']).toBeLessThanOrEqual(
        Math.min(p['sd9MechanicalSuccessfulSlotCount']!, r['sd9MechanicalSuccessfulSlotCount']!),
      );
      expect(cross['sd9StatusDisagreementSlotCount']).toBeLessThanOrEqual(7);
    });

    it('states 6 historical + 7 new = 13 readiness slots, coverage = historical + new', () => {
      const coverage = parsed['coverage']!;
      expect(coverage['historicalCanonicalReadinessSlots']).toBe(6);
      expect(coverage['newR37ReadinessSlots']).toBe(7);
      expect(coverage['coverageReadinessSlots']).toBe(13);
      expect(coverage['thirteenSlotReadinessBatchMinted']).toBe(false);
      for (const group of ['setP', 'setR', 'crossSample']) {
        const h = sample(`coverage.historical.${group}`);
        const n = sample(`coverage.new.${group}`);
        const c = sample(`coverage.coverage.${group}`);
        expect(n, group).toEqual(sample(`delta.${group}`));
        for (const key of Object.keys(c)) expect(c[key], `${group}.${key}`).toBe(h[key]! + n[key]!);
      }
      const historicalCommon = {
        reachableMembershipExactSlotCount: 6,
        reachableMembershipBlockedSlotCount: 0,
        fullRankExactSlotCount: 5,
        fullRankShortTextBlockedSlotCount: 1,
        fullRankBlockedWhileReachableMembershipExactSlotCount: 1,
        measurableSurvivorCount: 176,
        unresolvedShortTextOccurrenceCount: 1,
        sd9MinEnvelopeTotal: 176,
        sd9MaxEnvelopeTotal: 177,
        sd9MechanicalSuccessfulSlotCount: 6,
        sd9MechanicalUnsuccessfulSlotCount: 0,
        sd9MechanicalPendingSlotCount: 0,
      };
      expect(sample('coverage.historical.setP')).toEqual({
        ...historicalCommon,
        reachableMembershipDocumentCountAcrossExactSlots: 48,
      });
      expect(sample('coverage.historical.setR')).toEqual({
        ...historicalCommon,
        reachableMembershipDocumentCountAcrossExactSlots: 24,
      });
      expect(sample('coverage.historical.crossSample')).toEqual({
        bothSamplesMechanicallySuccessfulSlotCount: 6,
        sd9StatusDisagreementSlotCount: 0,
      });
      for (const [group, docs] of [
        ['setP', 88],
        ['setR', 44],
      ] as const) {
        expect(sample(`coverage.coverage.${group}`)).toMatchObject({
          reachableMembershipExactSlotCount: 11,
          reachableMembershipBlockedSlotCount: 2,
          reachableMembershipDocumentCountAcrossExactSlots: docs,
          measurableSurvivorCount: 354,
          unresolvedShortTextOccurrenceCount: 8,
          sd9MinEnvelopeTotal: 354,
          sd9MaxEnvelopeTotal: 362,
        });
      }
    });

    it('states the canonical constants, the semantics, the SD9 boundary and the access zeros', () => {
      expect(parsed['canonicalConstants']).toMatchObject({
        setPMaxPagesPerOrganisation: 8,
        setRMaxPagesPerOrganisation: 4,
        sd9MinPagesPerOrganisation: 4,
        reachableMembershipDecisionToken:
          'SHORT_TEXT_REQUIRED_SAMPLE_MEMBERSHIP_LIMITED_TO_REACHABLE_CAPPED_MEMBERSHIP_V1',
        generation: 'METHODOLOGY_V2_GEN1',
        sd9Semantics:
          'A3_MECHANICAL_SD9_OF_CANONICAL_SURVIVOR_ENVELOPE_ONLY_NOT_A2_ACQUISITION_STATUS',
      });
      expect(parsed['semantics']).toEqual({
        historicalR24R30StatesRecomputed: false,
        historicalReadinessObjectsReminted: false,
        deltaOnlyReadinessDerivation: true,
        canonicalR24PureHelperUsed: true,
        canonicalR24HelperCallsPerDeltaSlot: 1,
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
      expect(parsed['sd9AuthorityBoundary']).toEqual({
        a3MechanicalReadinessOnly: true,
        rewritesA2AcquisitionStatus: false,
        createsReplacementObligation: false,
        consumesReserve: false,
        changesLedger: false,
        authorisesAcquisition: false,
        constitutesA2Adjudication: false,
        altersGovernanceV4: false,
        createsGovernanceV5: false,
      });
      expect(parsed['access']).toEqual({
        r37SqlStatements: 0,
        databaseAccessOnlyThroughCanonicalUpstreamR33Reproduction: true,
        upstreamReproducedR33OldAuthorityQueries: 0,
        upstreamReproducedR33DeltaAuthorityQueries: 7,
        historicalDocumentReassembly: 0,
        historicalGraphRemeasurement: 0,
        historicalSampleRepreparation: 0,
        historicalReadinessRederivation: 0,
        databaseWrites: 0,
        institutionNetworkRequests: 0,
        sealedRootReads: 0,
        devConfirmEvidenceReads: 0,
        finalHoldoutEvidenceReads: 0,
      });
    });

    it('carries no identity-, position-, digest-, membership-, per-slot- or status-bearing key', () => {
      for (const key of [
        'selectionIndex',
        'selectionIndices',
        'reserveRankPosition',
        'organisationId',
        'echeRowKey',
        'runId',
        'runRef',
        'runRefSha256',
        'documentSha256',
        'saltedRankSha256',
        'rankPosition',
        'sourceRankPosition',
        'pageEvidenceId',
        'aIndex',
        'bIndex',
        'edges',
        'documents',
        'measurableSurvivors',
        'shortTextUnresolvedInSampleOrder',
        'preSd7FullRank',
        'candidateScore',
        'url',
        'host',
        'title',
        'mainText',
        'label',
        'items',
        'slots',
        'perSlot',
        'status',
        'minCount',
        'maxCount',
      ]) {
        expect(payload, key).not.toContain(`"${key}":`);
      }
      expect(payload).not.toMatch(
        /readinessDeltaHash|membershipCoverageHash|sd9ExpansionHash|reachableCorpusHash/,
      );
      // No array of numbers anywhere: a per-slot breakdown would be one.
      expect(payload).not.toMatch(/\[\s*\d/);
    });

    it('names no URL, domain, sealed filename or document-shaped digest', () => {
      expect(payload).not.toMatch(/https?:\/\/|\.(fr|eu|org|com)\b|SD7_DETAIL|\.json"|sealed-/);
      expect(payload).not.toMatch(/\b[0-9a-f]{64}\b/);
      const digests = [...new Set(payload.match(/\b[0-9a-f]{40,64}\b/g) ?? [])].sort();
      const permitted = new Set([
        R36_TERMINAL,
        R36_SCOPE_PIN_COMMIT,
        String(parsed['implementationCommit']),
      ]);
      expect(digests.filter((digest) => !permitted.has(digest))).toEqual([]);
      expect(String(parsed['implementationCommit'])).toMatch(/^[0-9a-f]{40}$/);
      const auditDigests = new Set(audit.match(/\b[0-9a-f]{64}\b/g) ?? []);
      const permittedAudit = new Set([sha256(raw), ...Object.values(REUSED_MODULE_SHA256)]);
      expect([...auditDigests].filter((digest) => !permittedAudit.has(digest))).toEqual([]);
    });

    it('neither the census nor the audit carries any V4 READY authority identity', () => {
      const v4 = loadCommittedA2GovernanceV4(REPO_ROOT);
      const secrets = new Set<string>();
      for (const ready of readyAuthoritiesOfV4(v4)) {
        for (const value of [
          ready.organisationId,
          ready.echeRowKey,
          ready.runRefSha256,
          ready.runRefSha256.slice(0, 12),
          ready.drawEntrySha256,
          ...ready.slotChainLedgerEntryHashes,
          ready.sealedSd7Detail?.sha256,
          ready.sealedSd7Detail?.file,
        ]) {
          if (typeof value === 'string' && value.length >= 8) secrets.add(value);
        }
      }
      expect(secrets.size).toBeGreaterThan(69 * 3);
      for (const secret of secrets) {
        expect(raw.includes(secret)).toBe(false);
        expect(audit.includes(secret)).toBe(false);
      }
    });
  },
);
