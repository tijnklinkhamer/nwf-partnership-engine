/**
 * PHASE 2B-2D A3 R36 — SCOPE, LINEAGE AND DISCLOSURE OF THE V4 INCREMENTAL
 * SAMPLE SURVIVOR PREPARATION.
 *
 * Proves, from the repository itself:
 *
 *   - R36 descends from the exact canonical R35 tip with no merge and no A2
 *     commit beyond the frozen V4 checkpoint, and pinned R35's scope in exactly
 *     one commit that touched exactly one file;
 *   - every earlier A3 namespace, A2 namespace and public record is
 *     byte-identical, and R23 / R29 / R35 in particular are pinned by digest;
 *   - `a3samplesV4/` takes from R23 at runtime only its pure preparation and
 *     its divergence helper, from R35 only brands, provenance accessors, its
 *     census derivation and its split, and nothing from `a3prep/` or `sd7/`;
 *   - the namespace owns no rank, salt, score, walk, cap, membership, SD9,
 *     SQL, environment, filesystem, network, provider or sealed capability,
 *     hardcodes no selection index, and pins no delta survivor / exclusion /
 *     cap / divergence count;
 *   - the public census (once written) is aggregate-only and carries no
 *     identity of any V4 READY authority.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { R36_PUBLIC_CENSUS_RECORD_KIND } from '../harness/phase2b2d/a3samplesV4/census.js';
import {
  loadCommittedA2GovernanceV4,
  readyAuthoritiesOfV4,
} from '../harness/phase2b2d/a3governanceV4/snapshotV4.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const HARNESS = 'src/test/harness/phase2b2d';
const A3SAMPLES_V4_REL = `${HARNESS}/a3samplesV4`;

/** The exact canonical R35 tip R36 was cut from. */
const R35_TERMINAL = 'e1428c35dad2e74313b58391386e65d54330d3b2';
/** The exact canonical R34 tip, R35's own base. */
const R34_TERMINAL = '6075ec8b79dd35b820a5086da89f18ca975eb039';

/** The one commit that pinned R35's own changed-surface test to its range. */
const R35_SCOPE_PIN_COMMIT = '8c090a6ef28b40d26c72b8cb5ac090f4474af23a';
const R35_ISOLATION_TEST = 'src/test/unit/orgunitCorpus2DA3Sd7GraphV4Isolation.test.ts';

/** The frozen A2 checkpoint Governance V4 describes. */
const V4_A2_CHECKPOINT = '67ae047fb7de079bcba0eec83ca4f4baee77cc3e';

const R36_TESTS = [
  'src/test/unit/orgunitCorpus2DA3SampleSurvivorV4Binder.test.ts',
  'src/test/unit/orgunitCorpus2DA3SampleSurvivorV4Delta.test.ts',
  'src/test/unit/orgunitCorpus2DA3SampleSurvivorV4Isolation.test.ts',
];
const R36_CENSUS_PATH =
  'docs/evaluation/PHASE_2B_2D_A3_R36_DEV_TRAIN_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION_CENSUS_V1.json';
const R36_AUDIT_PATH =
  'docs/audits/PHASE_2B_2D_A3_R36_INCREMENTAL_DEV_TRAIN_SAMPLE_SURVIVOR_PREPARATION_V1.md';

const A3SAMPLES_V4_FILES = [
  'census.ts',
  'devTrain.ts',
  'prepareDelta.ts',
  'r35Drift.ts',
  'refusal.ts',
  'types.ts',
];

/** The reused and neighbouring layers, byte-pinned at the R35 tip. */
const REUSED_MODULE_SHA256: Readonly<Record<string, string>> = {
  'a3samples/census.ts': '2e24cef96a722a1d0d57c0eb5e4aeecf73001963c87f59db4570a209834250e3',
  'a3samples/devTrain.ts': '0004b604c2763575431e89c97e3a6d69431da04b2427ab50c74b8d7a48557d46',
  'a3samples/prepare.ts': 'ac9f2af750d353cbe5faa9a2b67421fca7b66ebbfd0cfeffec9f93401ed4650b',
  'a3samples/r22Drift.ts': '05db549ae1fcde298143ed9bdb3217328ef6190f717906ac5a36199deac2ffbe',
  'a3samples/refusal.ts': '49a4bee4a2baacd7b50d32b2e4895ee5097287aab53339c7357ff40cdc4e6cef',
  'a3samples/types.ts': '08e67b9ea18a67e88894502490c5234572051d12228cfe292d3e32102b55c329',
  'a3samplesV2/census.ts': '4b7fb2b442e827222273f31f9477b1b1a66af1e630dda345797141190e539b4b',
  'a3samplesV2/devTrain.ts': '56b8557630dc16a3d048cef5bda2200bc1e989b7897434c2907563c7c2b544c2',
  'a3samplesV2/prepareDelta.ts': '37e05fc722acafbc4176a1bc26b215eabe242689c757c1d685702ebde7e4aed8',
  'a3samplesV2/r28Drift.ts': '5f9647f613a78765e18f26f33ba0cf2a2a2e1e7a473e6e97d1d646bd122487b0',
  'a3samplesV2/refusal.ts': '83f7cfe05b91d9c668cb015f60687a9823e0f7850ada1e7ac14ef01516f8952e',
  'a3samplesV2/types.ts': 'e149d4c19201e21ce7a4b52563978fe6478565deb4326270573bb89d1e1073d0',
  'a3graphsV4/census.ts': '399eb2b99dbfac6b12cd092004738d3e9e12cd9f914764403756c1b847e9f130',
  'a3graphsV4/devTrain.ts': 'e7e0c8367cb745906261a6e223f7281bb6f0d29a151bcf7b129aec817233a1c6',
  'a3graphsV4/measureDelta.ts': '43e10411505af1613a023ef0e04ba957ae97047569f724635fe3af5d212d7a2c',
  'a3graphsV4/r34Drift.ts': '6282ebd1e3bfffb7796272c4c15b5c463b7aa42ca58c60bb90603c6c0284a906',
  'a3graphsV4/refusal.ts': '75b0ac3b601eb7e8fb2cd774df6b26494b6d6586f583e651d6ee5c4909ab4376',
  'a3graphsV4/types.ts': 'dbd5b6dc70a77fd6ad8d03e6779d7186561957dd51b24dfbac003807fb707e53',
  'a3prep/contracts.ts': '4d856f45dd6016e1007d661f31388bf7bdbefd71862a6585ed4962240454b40f',
  'a3prep/sd7.ts': '322d2dd09f17dcc7ce0afa1862a13892f8bdadfece1c3ec919580f9d49977086',
  'a3prep/setPSd7.ts': 'b13c047f12ecf27583f07cef28923e3adc1e77ed2b3a1e1655de372cd79fdd4a',
  'a3prep/setRSd7.ts': 'b03e26fae833c527b9cbbd1962bdf95e886b3a01fbd5e636c61b4c9a8c62e056',
  'a3prep/setRSd7Readiness.ts': '6db33d0d39d9ab90fbf2e1b8b44a9649a6aa6db380d9f97cb5f1f8bdeb19561a',
  'sd7/nearDuplicatePairs.ts': '1851726bb28789791d96e0cd27532846e6a503b234a5813bec70782e6e078371',
  'a3documentsV4/types.ts': 'de5800cc74e9e51c0e055d3f64818effdc63f975753297cd3276c8b0c233757b',
  'a3governanceV4/snapshotV4.ts':
    'd6671faa0d7e7247407b9c9d92054199a7ae21ada98fd60674c94f88e571f2e7',
};

/** Every earlier namespace R36 must leave byte-identical, with its file count. */
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
  return stripComments(readFileSync(join(REPO_ROOT, A3SAMPLES_V4_REL, file), 'utf8'));
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
  return A3SAMPLES_V4_FILES.map(code).join('\n');
}

/** Code with string literals blanked: record kinds and disclaimers are not capabilities. */
function allCodeWithoutStrings(): string {
  return allCode()
    .replace(/'[^'\n]*'/g, "''")
    .replace(/"[^"\n]*"/g, '""')
    .replace(/`[^`]*`/g, '``');
}

const baseAvailable =
  commitExists(R35_TERMINAL) && commitExists(R34_TERMINAL) && commitExists(R35_SCOPE_PIN_COMMIT);

// ---------------------------------------------------------------------------

describe('2D-A3 R36: the new namespace is exactly these files', () => {
  it('holds the six V4 incremental sample modules', () => {
    expect(readdirSync(join(REPO_ROOT, A3SAMPLES_V4_REL)).sort()).toEqual(A3SAMPLES_V4_FILES);
  });

  it('leaves every earlier A3 namespace at its file count', () => {
    for (const [namespace, count] of Object.entries(FROZEN_NAMESPACES)) {
      if (count < 0) continue;
      expect(readdirSync(join(REPO_ROOT, HARNESS, namespace)), namespace).toHaveLength(count);
    }
  });

  it('leaves R23, R29, R35, the canonical compositions, SD7 and the V4 snapshot byte-identical', () => {
    for (const [file, digest] of Object.entries(REUSED_MODULE_SHA256)) {
      expect(sha256(readFileSync(join(REPO_ROOT, HARNESS, file))), file).toBe(digest);
    }
    for (const namespace of ['a3samples', 'a3samplesV2', 'a3graphsV4']) {
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

describe("2D-A3 R36: R23's pure preparation and R35's brands, nothing else", () => {
  const PERMITTED_SPECIFIERS = new Set([
    '../a3samples/prepare.js',
    '../a3samples/types.js',
    '../a3graphsV4/census.js',
    '../a3graphsV4/devTrain.js',
    '../a3graphsV4/types.js',
    '../a3documentsV4/types.js',
    '../a3governanceV4/snapshotV4.js',
    './census.js',
    './devTrain.js',
    './prepareDelta.js',
    './r35Drift.js',
    './refusal.js',
    './types.js',
  ]);

  it('imports nothing but R23 prepare/types, R35, type-only R34 / V4 and local modules', () => {
    for (const file of A3SAMPLES_V4_FILES) {
      for (const specifier of specifiersOf(code(file))) {
        expect(PERMITTED_SPECIFIERS.has(specifier), `${file}: ${specifier}`).toBe(true);
      }
    }
    const source = allCode();
    expect(importsFrom(source, '../a3documentsV4/types.js').runtime).toEqual([]);
    expect(importsFrom(source, '../a3governanceV4/snapshotV4.js').runtime).toEqual([]);
    expect(importsFrom(source, '../a3samples/types.js').runtime).toEqual([]);
  });

  it('imports nothing at all from a3prep/ or canonical sd7/, not even a type', () => {
    expect(allCode()).not.toMatch(/a3prep\/|sd7\//);
  });

  it('takes from R23 at runtime ONLY the pure preparation and the divergence helper', () => {
    const source = allCode();
    expect(importsFrom(source, '../a3samples/prepare.js').runtime).toEqual([
      'prepareUnboundSlotSampleSurvivors',
      'sampleSurvivorDivergence',
    ]);
    // Exactly one call site for the preparation, inside the per-request loop.
    expect(source.match(/prepareUnboundSlotSampleSurvivors\(/g)).toHaveLength(1);
    expect(code('prepareDelta.ts')).toMatch(
      /const unbound = prepareUnboundSlotSampleSurvivors\(request\.slot, request\.graph\);/,
    );
  });

  it('takes from R35 only its brands, provenance accessors, census derivation and split', () => {
    const source = allCode();
    expect(importsFrom(source, '../a3graphsV4/devTrain.js').runtime).toEqual([
      'deltaGraphForDocumentSourceDeltaSlotV4',
      'documentSourceDeltaBatchForGraphDeltaBatchV4',
      'documentSourceDeltaSlotForDeltaGraphV4',
      'graphDeltaBatchForDocumentSourceDeltaBatchV4',
      'isA3DevTrainSd7GraphDeltaBatchV4',
      'isA3DevTrainSlotSd7GraphMeasurementDeltaV4',
    ]);
    expect(importsFrom(source, '../a3graphsV4/census.js').runtime).toEqual([
      'deriveR35PublicIncrementalSd7GraphCensus',
    ]);
    expect(importsFrom(source, '../a3graphsV4/types.js').runtime).toEqual(['R35_GRAPH_SPLIT']);
  });

  it('the binder hands R23 exactly the R34 slot and the R35 graph object, nothing else', () => {
    expect(code('devTrain.ts')).toMatch(
      /pairs\.map\(\(\{ graph, slot \}\) => \(\{ slot, graph: graph\.graph \}\)\)/,
    );
    expect(code('devTrain.ts')).toMatch(/const pairs = batch\.items\.map\(/);
  });

  it('reaches no historical slot, graph, preparation, older mint or upstream binder', () => {
    const source = allCode();
    for (const forbidden of [
      'bindDevTrainSampleSurvivorBatch',
      'bindDevTrainSampleSurvivorDeltaBatchV2',
      'bindDevTrainSd7GraphBatch',
      'bindDevTrainSd7GraphDeltaBatchV2',
      'bindDevTrainSd7GraphDeltaBatchV4',
      'measureUnboundSlotSd7Graph',
      'measureDeltaSlotGraphsAllOrNothingV4',
      'documentTextLookupFor\\w+',
      'bindDevTrainDocumentSourceBatch',
      'bindDevTrainDocumentSourceDeltaBatchV\\d',
      'assembleUnboundSlotDocumentSources',
      'bindDevTrainEvidenceDeltaV4',
      'runDevTrainEvidenceDeltaBindingV4',
      'withReadOnlyEvidenceSnapshot',
      'loadUnboundDurableRunEvidence',
      'loadCommittedA2GovernanceV\\d',
      'readyAuthoritiesOfV4',
      'requireFreshR33Reproduction',
      'requireFreshR34Reproduction',
    ]) {
      expect(source, forbidden).not.toMatch(new RegExp(`\\b${forbidden}`));
    }
  });

  it('hardcodes no selection index list anywhere in the namespace', () => {
    for (const file of A3SAMPLES_V4_FILES) {
      expect(code(file), file).not.toMatch(/\b(34|39|44|49|56|61|71)\b/);
    }
    expect(allCode()).not.toMatch(/\[\s*\d+\s*,\s*\d+\s*,\s*\d+/);
  });

  it('pins no delta survivor, exclusion, cap, readiness or divergence count', async () => {
    const { R36_EXPECTED_R35_CHECKPOINT } =
      await import('../harness/phase2b2d/a3samplesV4/r35Drift.js');
    // The R35 checkpoint pins graph COUNTS only - never a numeric sample
    // outcome. (Its booleans restate R35's own "no survivor selected" facts.)
    for (const [key, value] of Object.entries(R36_EXPECTED_R35_CHECKPOINT)) {
      if (typeof value !== 'number') continue;
      expect(key).not.toMatch(/survivor|exclusion|cap|readiness|divergence|surviving|fullRank/i);
    }
    // Binder, preparation, census and types carry no numeric literal beyond
    // 0, 1, 2 (the stated cap sizes 8 / 4 are removed and asserted elsewhere).
    for (const file of ['devTrain.ts', 'prepareDelta.ts', 'census.ts', 'types.ts']) {
      const source = code(file)
        .replace(/R36_STATED_CANONICAL_SAMPLE_CONSTANTS = Object\.freeze\(\{[^}]*\}/, '')
        .replace(/'[^'\n]*'/g, "''")
        .replace(/`[^`]*`/g, '``');
      expect(source, file).not.toMatch(/\b(?:[3-9]|\d{2,})\b/);
    }
  });
});

describe('2D-A3 R36: no env, fs, network, SQL, provider, sealed or sample-algorithm capability', () => {
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

  it('owns no rank, salt, score, survivor walk, cap, text, graph, membership or SD9 code', () => {
    const source = allCodeWithoutStrings();
    for (const forbidden of [
      /\b(rankSetPFull|rankSetRFull|prepareSetPSd7|prepareSetRSd7|prepareSd7SampleSurvivors)\b/,
      /\b(determineSetRDocumentCap|deriveSetRFreezeSlotReadiness|structuralIssueOf\w+)\b/,
      /\b(prepareSetRDocumentScore|reduceTrackScore|candidateScore\w*|scorePreparation)\b/,
      /salt(?!edRankDigests)|SET_P_RANK_KEY_PREFIX|SET_R_TIE_BREAK_KEY_PREFIX|createHash|node:crypto|sha256\s*\(/i,
      /localeCompare|compareScores|scoreCompare/,
      /greedy\w*\s*\(|survivorWalk(?!Reimplemented)|walkSurvivors|nearDuplicatePass/i,
      /\.slice\s*\(\s*0\s*,(?!\s*dot\))|MAX_PAGES/,
      /normaliseForShingling|tokeni[sz]e|shingle|jaccard|textLookup|mainText/i,
      /connectedComponent|unionFind|disjointSet/i,
      /\b(reachableMembership|reachableInitialCap|evaluateSd9|sd9Readiness)\b/i,
      /continuationWindow|acquisitionGate|v3transition|\/transition\/|\/corpus\/|\/draw\//,
      /commitLoader|readCommittedBlob|registryV4|resolveV4|familiesV4|provenanceClosure/,
      /\blatest\b|rev-parse|ls-remote|origin\/|feat\/phase2b-2d-a2/i,
    ]) {
      expect(source, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it('sorts nothing but census field keys: no document, score or rank order is built here', () => {
    for (const file of ['devTrain.ts', 'prepareDelta.ts', 'census.ts', 'types.ts', 'refusal.ts']) {
      expect(code(file), file).not.toMatch(/\.sort\s*\(/);
    }
    // The drift gate's only two sorts order JSON field names for a recursive diff.
    const drift = code('r35Drift.ts');
    expect(drift.match(/\.sort\s*\(/g)).toHaveLength(2);
    expect(drift).toMatch(/Object\.keys\(value\)\s*\.sort\(\)/);
    expect(drift).toMatch(/\[\.\.\.keys\]\.sort\(\)/);
  });

  it('names no DEV_CONFIRM or FINAL_HOLDOUT split and takes no split parameter', () => {
    const source = allCode();
    expect(source).not.toMatch(/DEV_CONFIRM|FINAL_HOLDOUT/);
    expect(source).not.toMatch(/\bsplit\s*:\s*(Split|string)\s*[,)]/);
  });

  it('no R36 type or object has a field for text, a score, a rank, an edge or a survivor set', () => {
    const source = allCode();
    expect(source).not.toMatch(
      /readonly\s+(mainText|text|title|url|host|score|scores|rank|ranks|edges|survivors|exclusions|capDocuments)\??\s*:/,
    );
  });

  it('has no unsafe, test-only, forced or plain-object mint and invents no authority hash', () => {
    const source = allCode();
    expect(source).not.toMatch(/unsafeMint|testOnlyMint|forceMint|fromPlainObject/);
    expect(source).not.toMatch(
      /sampleDeltaHash|survivorCoverageHash|rankExpansionHash|capExpansionHash/,
    );
  });

  it('exposes no entry point over several organisations, historical slots or thirteen slots', () => {
    const exported = [...allCode().matchAll(/export (?:async )?function (\w+)/g)].map((m) => m[1]);
    expect(exported.sort()).toEqual(
      [
        'bindDevTrainSampleSurvivorDeltaBatchV4',
        'deltaGraphForSamplePreparationV4',
        'deriveCanonicalSampleSurvivorCoverageExpansionV4',
        'deriveDeltaSampleAggregatesV4',
        'deriveR36PublicIncrementalSampleSurvivorCensus',
        'graphDeltaBatchForSampleDeltaBatchV4',
        'isA3DevTrainSampleSurvivorDeltaBatchV4',
        'isA3DevTrainSlotSampleSurvivorPreparationDeltaV4',
        'prepareDeltaSlotSamplesAllOrNothingV4',
        'r35ReproductionDriftPaths',
        'r35ReproductionProofForBatch',
        'refuseV4Sample',
        'requireFreshR35Reproduction',
        'requireHistoricalSamplePreparationBaseline',
        'requireHistoricalSamplePreparationBaselineProof',
        'sampleDeltaBatchForGraphDeltaBatchV4',
        'samplePreparationForDeltaGraphV4',
      ].sort(),
    );
    expect(allCode()).not.toMatch(/thirteen\w*Batch\s*[:=(]|historicalPreparations?\s*[:=(]/i);
  });
});

describe.skipIf(!baseAvailable)('2D-A3 R36: lineage and changed surface', () => {
  it('descends from the exact canonical R35 tip, and merges no commit', () => {
    expect(() => git('merge-base', '--is-ancestor', R35_TERMINAL, 'HEAD')).not.toThrow();
    expect(() => git('merge-base', '--is-ancestor', R35_SCOPE_PIN_COMMIT, 'HEAD')).not.toThrow();
    expect(lines(git('rev-list', '--merges', `${R35_TERMINAL}..HEAD`))).toEqual([]);
    expect(git('rev-parse', `${R35_SCOPE_PIN_COMMIT}^`).trim()).toBe(R35_TERMINAL);
    expect(git('rev-parse', `${R35_TERMINAL}~4`).trim()).toBe(R34_TERMINAL);
  });

  it('adds no A2 commit beyond the frozen V4 checkpoint', () => {
    const introduced = lines(git('rev-list', `${R35_TERMINAL}..HEAD`));
    for (const commit of introduced) {
      expect(lines(git('rev-list', '--parents', '-n', '1', commit))[0]!.split(' ')).toHaveLength(2);
    }
    if (commitExists(V4_A2_CHECKPOINT)) {
      expect(() => git('merge-base', '--is-ancestor', V4_A2_CHECKPOINT, 'HEAD')).toThrow();
    }
  });

  it("pinned R35's scope in exactly one commit that touched exactly one file", () => {
    expect(lines(git('diff', '--name-only', R35_TERMINAL, R35_SCOPE_PIN_COMMIT))).toEqual([
      R35_ISOLATION_TEST,
    ]);
    expect(sha256(readFileSync(join(REPO_ROOT, R35_ISOLATION_TEST)))).toBe(
      sha256(git('show', `${R35_SCOPE_PIN_COMMIT}:${R35_ISOLATION_TEST}`)),
    );
  });

  it('leaves every earlier A3 namespace and the A2 harness untouched', () => {
    for (const namespace of Object.keys(FROZEN_NAMESPACES)) {
      const path = `${HARNESS}/${namespace}`;
      expect(lines(git('diff', '--name-only', R35_TERMINAL, '--', path)), path).toEqual([]);
      expect(lines(git('ls-files', '--others', '--exclude-standard', '--', path)), path).toEqual(
        [],
      );
    }
  });

  it('leaves every earlier A3 public census and audit byte-identical', () => {
    const prior = lines(
      git('ls-tree', '-r', '--name-only', R35_TERMINAL, '--', 'docs/evaluation', 'docs/audits'),
    ).filter((path) => /PHASE_2B_2D_A3_R\d+_/.test(path));
    expect(prior.length).toBeGreaterThanOrEqual(34);
    for (const record of prior) {
      expect(sha256(readFileSync(join(REPO_ROOT, record))), record).toBe(
        sha256(git('show', `${R35_TERMINAL}:${record}`)),
      );
    }
  });

  it('writes no other record: every docs/evaluation change is the R36 census', () => {
    const changed = [
      ...lines(git('diff', '--name-only', R35_TERMINAL, '--', 'docs/evaluation')),
      ...lines(git('ls-files', '--others', '--exclude-standard', '--', 'docs/evaluation')),
    ];
    expect(changed.filter((path) => path !== R36_CENSUS_PATH)).toEqual([]);
  });

  it('changes nothing outside its own namespace, tests, records and the R35 scope pin', () => {
    const paths = [
      ...new Set([
        ...lines(git('diff', '--name-only', R35_TERMINAL)),
        ...lines(git('ls-files', '--others', '--exclude-standard')),
      ]),
    ];
    const permitted = (path: string): boolean =>
      path.startsWith(`${A3SAMPLES_V4_REL}/`) ||
      R36_TESTS.includes(path) ||
      path === R35_ISOLATION_TEST ||
      path === R36_CENSUS_PATH ||
      path === R36_AUDIT_PATH;
    expect(paths.filter((path) => !permitted(path))).toEqual([]);
  });
});

describe.skipIf(!existsSync(join(REPO_ROOT, R36_CENSUS_PATH)))(
  '2D-A3 R36: the public census',
  () => {
    const raw = existsSync(join(REPO_ROOT, R36_CENSUS_PATH))
      ? readFileSync(join(REPO_ROOT, R36_CENSUS_PATH), 'utf8')
      : '{}';
    const audit = existsSync(join(REPO_ROOT, R36_AUDIT_PATH))
      ? readFileSync(join(REPO_ROOT, R36_AUDIT_PATH), 'utf8')
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

    it('is the R36 record, authorises nothing, and states its provenance', () => {
      expect(parsed['record']).toBe(R36_PUBLIC_CENSUS_RECORD_KIND);
      expect(parsed['recordKind']).toBe(
        'PUBLIC_AGGREGATE_ONLY_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION_CENSUS',
      );
      expect(parsed['thisFileAuthorises']).toEqual([]);
      expect(parsed['r35Tip']).toBe(R35_TERMINAL);
      expect(parsed['r35ScopePinCommit']).toBe(R35_SCOPE_PIN_COMMIT);
      expect(parsed['split']).toBe('DEV_TRAIN');
      expect(parsed['r35Reproduction']!['freshR35CensusEqualsCommitted']).toBe(true);
      expect(parsed['r35Reproduction']!['excludedExecutionProvenanceFields']).toEqual([
        'implementationCommit',
      ]);
    });

    it('states 197 ranked / 190 measurable / 7 short per sample and every partition closes', () => {
      expect(parsed['delta']!['deltaSlotPreparations']).toBe(7);
      for (const name of ['delta.setP', 'delta.setR']) {
        const s = sample(name);
        expect(s['preSd7RankEntryCount'], name).toBe(197);
        expect(s['measurableDocumentCount'], name).toBe(190);
        expect(s['unresolvedShortTextOccurrenceCount'], name).toBe(7);
        expect(s['measurableSurvivorCount']! + s['measurableExclusionCount']!, name).toBe(190);
        expect(s['initialCapExactSlotCount']! + s['initialCapBlockedSlotCount']!, name).toBe(7);
      }
      const r = sample('delta.setR');
      expect(r['fullRankExactSlotCount']! + r['fullRankShortTextBlockedSlotCount']!).toBe(7);
      // Seven short texts exist, so at least one slot's full rank is blocked.
      expect(r['fullRankShortTextBlockedSlotCount']).toBeGreaterThanOrEqual(1);
      const d = sample('delta.divergence');
      expect(
        d['survivingBothSamples']! +
          d['survivingSetPOnly']! +
          d['survivingSetROnly']! +
          d['excludedInBothSamples']!,
      ).toBe(190);
      expect(d['survivingBothSamples']! + d['survivingSetPOnly']!).toBe(
        sample('delta.setP')['measurableSurvivorCount'],
      );
      expect(d['survivingBothSamples']! + d['survivingSetROnly']!).toBe(
        sample('delta.setR')['measurableSurvivorCount'],
      );
    });

    it('states 6 historical + 7 new = 13 preparations, coverage = historical + new', () => {
      const coverage = parsed['coverage']!;
      expect(coverage['historicalCanonicalSlotPreparations']).toBe(6);
      expect(coverage['newR36SlotPreparations']).toBe(7);
      expect(coverage['coverageSlotPreparations']).toBe(13);
      expect(coverage['thirteenSlotSampleBatchMinted']).toBe(false);
      for (const group of ['setP', 'setR', 'divergence']) {
        const h = sample(`coverage.historical.${group}`);
        const n = sample(`coverage.new.${group}`);
        const c = sample(`coverage.coverage.${group}`);
        expect(n, group).toEqual(sample(`delta.${group}`));
        for (const key of Object.keys(c)) expect(c[key], `${group}.${key}`).toBe(h[key]! + n[key]!);
      }
      expect(sample('coverage.historical.setP')).toMatchObject({
        preSd7RankEntryCount: 191,
        measurableDocumentCount: 190,
        measurableSurvivorCount: 176,
        measurableExclusionCount: 14,
        unresolvedShortTextOccurrenceCount: 1,
        initialCapExactSlotCount: 6,
        exactCapDocumentCountAcrossExactSlots: 48,
      });
      expect(sample('coverage.historical.setR')).toMatchObject({
        exactCapDocumentCountAcrossExactSlots: 24,
        fullRankExactSlotCount: 5,
        fullRankShortTextBlockedSlotCount: 1,
      });
      expect(sample('coverage.historical.divergence')).toMatchObject({
        survivingBothSamples: 171,
        survivingSetPOnly: 5,
        survivingSetROnly: 5,
        excludedInBothSamples: 9,
      });
      for (const group of ['setP', 'setR']) {
        expect(sample(`coverage.coverage.${group}`)['preSd7RankEntryCount']).toBe(388);
        expect(sample(`coverage.coverage.${group}`)['measurableDocumentCount']).toBe(380);
        expect(sample(`coverage.coverage.${group}`)['unresolvedShortTextOccurrenceCount']).toBe(8);
      }
    });

    it('states the canonical constants, the semantics and the access zeros', () => {
      expect(parsed['canonicalConstants']).toMatchObject({
        setPMaxPagesPerOrganisation: 8,
        setRMaxPagesPerOrganisation: 4,
        k3SurvivorProcedure: 'GREEDY_SAMPLE_RANK_SURVIVOR_WALK',
        k3SurvivorScope: 'SAMPLE_SPECIFIC',
        k3GraphScope: 'ONE_CANONICAL_GRAPH_PER_ORGANISATION',
      });
      expect(parsed['semantics']).toMatchObject({
        historicalR23R29PreparationsRecomputed: false,
        historicalPreparationObjectsReminted: false,
        deltaOnlySamplePreparation: true,
        canonicalR23PurePreparationUsed: true,
        canonicalR23CallsPerDeltaSlot: 1,
        canonicalR23DivergenceHelperUsed: true,
        sameCanonicalR35GraphUsedForBothSamples: true,
        sampleSpecificOrdersPreserved: true,
        rankReimplemented: false,
        survivorWalkReimplemented: false,
        capAlgorithmReimplemented: false,
        scoresRecomputed: false,
        scoresCopied: false,
        edgesCopied: false,
        shortTextResolved: false,
        reachableMembershipBound: false,
        extensionPerformed: false,
        sd9Evaluated: false,
        sd4Applied: false,
        k4Applied: false,
        labelsRead: false,
        classifierCalled: false,
        finalDevTrainCorpusMaterialised: false,
      });
      expect(parsed['access']).toEqual({
        r36SqlStatements: 0,
        databaseAccessOnlyThroughCanonicalUpstreamR33Reproduction: true,
        upstreamReproducedR33OldAuthorityQueries: 0,
        upstreamReproducedR33DeltaAuthorityQueries: 7,
        historicalDocumentReassembly: 0,
        historicalGraphRemeasurement: 0,
        historicalSampleRepreparation: 0,
        databaseWrites: 0,
        institutionNetworkRequests: 0,
        sealedRootReads: 0,
        devConfirmEvidenceReads: 0,
        finalHoldoutEvidenceReads: 0,
      });
    });

    it('carries no identity-, position-, digest-, edge-, score-, text- or per-slot-bearing key', () => {
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
        'survivorRankPosition',
        'blockingSurvivorRankPosition',
        'pageEvidenceId',
        'aIndex',
        'bIndex',
        'edges',
        'documents',
        'measurableSurvivors',
        'measurableExclusions',
        'shortTextUnresolvedInSampleOrder',
        'preSd7FullRank',
        'candidateScore',
        'scorePreparation',
        'url',
        'host',
        'title',
        'mainText',
        'label',
        'items',
        'slots',
        'perSlot',
        'status',
      ]) {
        expect(payload, key).not.toContain(`"${key}":`);
      }
      expect(payload).not.toMatch(
        /sampleDeltaHash|survivorCoverageHash|rankExpansionHash|capExpansionHash/,
      );
      // No array of numbers anywhere: a per-slot breakdown would be one.
      expect(payload).not.toMatch(/\[\s*\d/);
    });

    it('names no URL, domain, sealed filename or document-shaped digest', () => {
      expect(payload).not.toMatch(/https?:\/\/|\.(fr|eu|org|com)\b|SD7_DETAIL|\.json"|sealed-/);
      expect(payload).not.toMatch(/\b[0-9a-f]{64}\b/);
      const digests = [...new Set(payload.match(/\b[0-9a-f]{40,64}\b/g) ?? [])].sort();
      const permitted = new Set([
        R35_TERMINAL,
        R35_SCOPE_PIN_COMMIT,
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
