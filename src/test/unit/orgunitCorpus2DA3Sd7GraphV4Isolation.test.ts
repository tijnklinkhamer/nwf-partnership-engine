/**
 * PHASE 2B-2D A3 R35 — ISOLATION OF THE GOVERNANCE V4 INCREMENTAL SD7 GRAPH DELTA.
 *
 * By reading source text, the repository's own history and the committed
 * records, this file proves:
 *
 *   - R35 lives in the NEW sibling namespace `a3graphsV4/`, and every earlier
 *     A3 namespace - R22's `a3graphs/`, R28's `a3graphsV2/` and R34's
 *     `a3documentsV4/` above all - is byte-identical to the canonical R34 tip,
 *     with the reused modules pinned by sha256;
 *   - R35 reuses R22's pure measurement and structure proof and R34's brand /
 *     provenance / text accessors, never calls canonical SD7 internals,
 *     `nearDuplicatePass`, any survivor / component / rank / SD9 code or any
 *     older minting, imports nothing from `sd7/`, and writes no SQL;
 *   - no database, environment, filesystem, network, provider, classifier,
 *     sealed-root, child-process, A2, governance-loader or "latest"
 *     capability exists in the namespace, no other split is named, and no
 *     selection index is hardcoded;
 *   - the only pre-existing file R35 touched is R34's historical scope pin;
 *   - the committed R35 census states the derived delta and 6 + 7 = 13
 *     coverage as per-slot sums, discloses no identity and invents no digest.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { R35_PUBLIC_CENSUS_RECORD_KIND } from '../harness/phase2b2d/a3graphsV4/census.js';
import {
  loadCommittedA2GovernanceV4,
  readyAuthoritiesOfV4,
} from '../harness/phase2b2d/a3governanceV4/snapshotV4.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const HARNESS = 'src/test/harness/phase2b2d';
const A3GRAPHS_V4_REL = `${HARNESS}/a3graphsV4`;

/** The exact canonical R34 tip R35 was cut from. */
const R34_TERMINAL = '6075ec8b79dd35b820a5086da89f18ca975eb039';
/** The exact canonical R33 tip, R34's own base. */
const R33_TERMINAL = '31f389c8e1b6338d45a533b01feb6a2f6d932678';

/** The one commit that pinned R34's own changed-surface test to its range. */
const R34_SCOPE_PIN_COMMIT = '4f2c10f9e53b53804024eb7a2ebd70c9a6906158';
const R34_ISOLATION_TEST = 'src/test/unit/orgunitCorpus2DA3DocumentSourceV4Isolation.test.ts';

/** The frozen A2 checkpoint Governance V4 describes. */
const V4_A2_CHECKPOINT = '67ae047fb7de079bcba0eec83ca4f4baee77cc3e';

const R35_TESTS = [
  'src/test/unit/orgunitCorpus2DA3Sd7GraphV4Binder.test.ts',
  'src/test/unit/orgunitCorpus2DA3Sd7GraphV4Delta.test.ts',
  'src/test/unit/orgunitCorpus2DA3Sd7GraphV4Isolation.test.ts',
];
const R35_CENSUS_PATH =
  'docs/evaluation/PHASE_2B_2D_A3_R35_DEV_TRAIN_INCREMENTAL_SD7_GRAPH_CENSUS_V1.json';
const R35_AUDIT_PATH = 'docs/audits/PHASE_2B_2D_A3_R35_INCREMENTAL_DEV_TRAIN_SD7_GRAPH_V1.md';

const A3GRAPHS_V4_FILES = [
  'census.ts',
  'devTrain.ts',
  'measureDelta.ts',
  'r34Drift.ts',
  'refusal.ts',
  'types.ts',
];

/** The reused and neighbouring layers, byte-pinned at the R34 tip. */
const REUSED_MODULE_SHA256: Readonly<Record<string, string>> = {
  'a3graphs/measure.ts': 'bde8456bdb60c348af6affe81da9e631417e41921bf12b3029fe1612367d0dad',
  'a3graphs/types.ts': '5a40dcb749e26b20eae8a5d75af7260a8407f29dfc89fd93b6849021ddb2def3',
  'a3graphs/refusal.ts': '4a7b437b37a6ab225f082742a4f500d22050f457025fa46abc91e5097a566ec3',
  'a3graphs/devTrain.ts': 'b013669bb6da9cb296053ac123c0704b36166a6c4a52f63ff2bcd0831da16954',
  'a3graphs/census.ts': '2c8c4c27ef2c8f102703889faf2f874bfc120bdc6ddb534abaaeb4a281417659',
  'a3graphs/r21Drift.ts': '17962adc0c61986e0d09106a78af72db3d2c2b18286e7f30f05dc7be63d59c05',
  'a3graphsV2/a2Consistency.ts': 'ce2d72ece74ca1f6f922b099883d803cde65e3b74f1704f52591d1ebaa73516a',
  'a3graphsV2/census.ts': '6ad904db815f2986637d943bf6ce321689ec0c2730b80cf7071306fc906d899e',
  'a3graphsV2/devTrain.ts': '12078ebd4cfdda939efd272b672e5296594412260afbb0cdd6b2b94e037b3fc6',
  'a3graphsV2/measureDelta.ts': 'cf0ac7d9cdd422be627da46bbbe2489156e61c2101e3750384a762da262237a9',
  'a3graphsV2/r27Drift.ts': '95e5f709e301f9924e320b77de0bb86cbbeb8e4ae78c37d4ec24de7c06bb7003',
  'a3graphsV2/refusal.ts': 'dcb2bad1f3081231c3fb779127d24266001eca85be98bb64a8814f00dea46aab',
  'a3graphsV2/types.ts': 'f3f844b32473846148bd2f552b82fd05c6c111b5b4c64c94ec56bffcb1887eda',
  'a3documentsV4/assembleDelta.ts':
    '8cc6eb2929377c892ad2b19d4a7a9aeff5dc293fd223017757e798d69cf2f488',
  'a3documentsV4/census.ts': '692be2503ae173986655ee8cb8e45a5bc319bd49c113054508e2cd5b617fae95',
  'a3documentsV4/devTrain.ts': 'ec073c7d709886e05311061a49427d13381d2d7ca9ed8204db662a53d80fe920',
  'a3documentsV4/r33Drift.ts': '6365cc5661513ba89b9be5a31bb9b7f856dfe765e67fa5ea31862de43cebb653',
  'a3documentsV4/refusal.ts': 'e931d653641517227d62b4866a9ed89f6ac27ce9803cdadda36872e5a85be674',
  'a3documentsV4/types.ts': 'de5800cc74e9e51c0e055d3f64818effdc63f975753297cd3276c8b0c233757b',
  'a3documents/assemble.ts': '062da3fdcb9013b8e90741478b398c217f58a1da6ffcf5ceeb3d640ce45cb1af',
  'sd7/nearDuplicatePairs.ts': '1851726bb28789791d96e0cd27532846e6a503b234a5813bec70782e6e078371',
  'sd7/sd7Contract.ts': '882dad5e990cf40ff326b5fecea3e691720b6d8214f02bf4629ab6fefd2b0f60',
  'a3governanceV4/snapshotV4.ts':
    'd6671faa0d7e7247407b9c9d92054199a7ae21ada98fd60674c94f88e571f2e7',
};

/** Every earlier namespace R35 must leave byte-identical, with its file count. */
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
  return stripComments(readFileSync(join(REPO_ROOT, A3GRAPHS_V4_REL, file), 'utf8'));
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
      else runtime.push(name);
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
  return A3GRAPHS_V4_FILES.map(code).join('\n');
}

/** Code with string literals blanked: record kinds and disclaimers are not capabilities. */
function allCodeWithoutStrings(): string {
  return allCode()
    .replace(/'[^'\n]*'/g, "''")
    .replace(/"[^"\n]*"/g, '""')
    .replace(/`[^`]*`/g, '``');
}

const baseAvailable =
  commitExists(R34_TERMINAL) && commitExists(R33_TERMINAL) && commitExists(R34_SCOPE_PIN_COMMIT);

// ---------------------------------------------------------------------------

describe('2D-A3 R35: the new namespace is exactly these files', () => {
  it('holds the six V4 incremental graph modules', () => {
    expect(readdirSync(join(REPO_ROOT, A3GRAPHS_V4_REL)).sort()).toEqual(A3GRAPHS_V4_FILES);
  });

  it('leaves every earlier A3 namespace at its file count', () => {
    for (const [namespace, count] of Object.entries(FROZEN_NAMESPACES)) {
      if (count < 0) continue;
      expect(readdirSync(join(REPO_ROOT, HARNESS, namespace)), namespace).toHaveLength(count);
    }
  });

  it('leaves R22, R28, R34, R21 assembly, SD7 and the V4 snapshot byte-identical', () => {
    for (const [file, digest] of Object.entries(REUSED_MODULE_SHA256)) {
      expect(sha256(readFileSync(join(REPO_ROOT, HARNESS, file))), file).toBe(digest);
    }
    for (const namespace of ['a3graphs', 'a3graphsV2', 'a3documentsV4']) {
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

describe("2D-A3 R35: R22's pure measurement and R34's capabilities, nothing else", () => {
  const PERMITTED_SPECIFIERS = new Set([
    '../a3graphs/measure.js',
    '../a3graphs/types.js',
    '../a3documentsV4/census.js',
    '../a3documentsV4/devTrain.js',
    '../a3documentsV4/types.js',
    '../a3governanceV4/snapshotV4.js',
    './census.js',
    './devTrain.js',
    './measureDelta.js',
    './r34Drift.js',
    './refusal.js',
    './types.js',
  ]);

  it('imports nothing but R22 measure/types, R34, the V4 snapshot and local modules', () => {
    for (const file of A3GRAPHS_V4_FILES) {
      for (const specifier of specifiersOf(code(file))) {
        expect(PERMITTED_SPECIFIERS.has(specifier), `${file}: ${specifier}`).toBe(true);
      }
    }
  });

  it('imports nothing at all from canonical sd7/, not even a type', () => {
    expect(allCode()).not.toMatch(/sd7\//);
  });

  it('takes from R22 at runtime ONLY the measurement and its structure proof, each called once', () => {
    const source = allCode();
    expect(importsFrom(source, '../a3graphs/measure.js').runtime).toEqual([
      'measureUnboundSlotSd7Graph',
      'requireCanonicalGraphStructure',
    ]);
    expect(importsFrom(source, '../a3graphs/types.js').runtime).toEqual([]);
    expect(source.match(/measureUnboundSlotSd7Graph\(/g)).toHaveLength(1);
    expect(source.match(/requireCanonicalGraphStructure\(/g)).toHaveLength(1);
    expect(code('measureDelta.ts')).toMatch(
      /const unbound = measureUnboundSlotSd7Graph\(request\.slot, request\.textLookup\);/,
    );
  });

  it('takes from R34 only its brands, provenance accessors, text capability, census and types', () => {
    const source = allCode();
    expect(importsFrom(source, '../a3documentsV4/devTrain.js').runtime).toEqual([
      'deltaSlotAssemblyForEvidenceDeltaV4',
      'documentSourceDeltaBatchForEvidenceDeltaBatchV4',
      'documentTextLookupForDeltaSlotAssemblyV4',
      'evidenceDeltaBatchForDocumentSourceDeltaBatchV4',
      'evidenceDeltaForDeltaSlotAssemblyV4',
      'isA3DevTrainDocumentSourceDeltaBatchV4',
      'isA3DevTrainSlotDocumentSourceAssemblyDeltaV4',
    ]);
    expect(importsFrom(source, '../a3documentsV4/census.js').runtime).toEqual([
      'deriveR34PublicIncrementalDocumentSourceCensus',
    ]);
    expect(importsFrom(source, '../a3documentsV4/types.js').runtime).toEqual([
      'R34_DOCUMENT_SPLIT',
    ]);
    expect(importsFrom(source, '../a3governanceV4/snapshotV4.js').runtime).toEqual([
      'readyAuthoritiesOfV4',
    ]);
  });

  it('the binder obtains text only through R34, once per delta slot', () => {
    expect(code('devTrain.ts')).toMatch(
      /textLookup: documentTextLookupForDeltaSlotAssemblyV4\(slot\)/,
    );
    expect(allCode().match(/documentTextLookupForDeltaSlotAssemblyV4\(/g)).toHaveLength(1);
    for (const forbidden of [
      'documentTextLookupForSlotAssembly',
      'documentTextLookupForDeltaSlotAssembly\\b',
      'documentTextLookupForUnboundSlotAssembly',
    ]) {
      expect(allCode(), forbidden).not.toMatch(new RegExp(`\\b${forbidden}`));
    }
  });

  it('loops only over the R34 batch items; no historical slot, graph or older mint is reached', () => {
    const source = allCode();
    for (const forbidden of [
      'measureNearDuplicateGraph',
      'nearDuplicatePass',
      'bindDevTrainSd7GraphBatch',
      'bindDevTrainSd7GraphDeltaBatchV2',
      'isA3DevTrainSlotSd7GraphMeasurement\\b',
      'isA3DevTrainSd7GraphBatch\\b',
      'bindDevTrainDocumentSourceBatch',
      'bindDevTrainDocumentSourceDeltaBatchV2',
      'bindDevTrainDocumentSourceDeltaBatchV4',
      'assembleUnboundSlotDocumentSources',
      'bindDevTrainEvidenceDeltaV4',
      'runDevTrainEvidenceDeltaBindingV4',
      'withReadOnlyEvidenceSnapshot',
      'loadUnboundDurableRunEvidence',
      'loadCommittedA2GovernanceV4',
      'loadCommittedA2GovernanceV3',
      'requireFreshR33Reproduction',
    ]) {
      expect(source, forbidden).not.toMatch(new RegExp(`\\b${forbidden}`));
    }
    expect(code('devTrain.ts')).toMatch(/const slots = batch\.items\.map\(/);
  });

  it('hardcodes no selection index list anywhere in the namespace', () => {
    for (const file of A3GRAPHS_V4_FILES) {
      expect(code(file), file).not.toMatch(/\b(34|39|44|49|56|61|71)\b/);
    }
    expect(allCode()).not.toMatch(/\[\s*\d+\s*,\s*\d+\s*,\s*\d+/);
  });

  it('pins no expected delta measurable, short-text, pair, edge or edge-document count', async () => {
    const { R35_EXPECTED_R34_CHECKPOINT } =
      await import('../harness/phase2b2d/a3graphsV4/r34Drift.js');
    // The R34 checkpoint names document-source counts only - never a graph count.
    for (const key of Object.keys(R35_EXPECTED_R34_CHECKPOINT)) {
      expect(key).not.toMatch(/measurable|shortText|comparedPair|edge/i);
    }
    // The binder, measurement and census carry no numeric literal beyond 0, 1, 2
    // (the per-slot m(m-1)/2), so no delta count can be pinned in them.
    for (const file of ['devTrain.ts', 'measureDelta.ts', 'census.ts', 'types.ts']) {
      const source = code(file)
        // The stated (not measured) SD7 constants 5 / 9 / 10, asserted elsewhere.
        .replace(/R35_STATED_CANONICAL_SD7 = Object\.freeze\(\{[^}]*\}/, '')
        .replace(/'[^'\n]*'/g, "''")
        .replace(/`[^`]*`/g, '``');
      expect(source, file).not.toMatch(/\b(?:[3-9]|\d{2,})\b/);
    }
    // Nothing looks at a text, empty or not: SD7 alone classifies short text.
    expect(allCode()).not.toMatch(
      /emptyText|isEmpty|text\w*\.length|\.trim\(\)|toLowerCase|split\(/i,
    );
    // R35 hands the lookup to R22; it never invokes a text lookup itself.
    expect(allCode()).not.toMatch(/textLookup\s*\(|lookup\s*\(\s*\w*[dD]igest/);
  });
});

describe('2D-A3 R35: no env, fs, network, SQL, provider, sealed, SD7-internal or membership capability', () => {
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

  it('owns no SD7 math, component, survivor walk, rank, cap, membership or SD9 code', () => {
    const source = allCodeWithoutStrings();
    for (const forbidden of [
      /normaliseForShingling|normaliseText|tokeni[sz]e|shingleSet|tokenShingles|jaccard\s*\(|jaccard\.js/i,
      /intersection\w*\s*\*|union\w*\s*\*|\* 10\b|>= 0\.9|similarity/,
      /nearDuplicatePass|prepareSd7SampleSurvivors|greedy|survivorWalk|walkSurvivors/i,
      /connectedComponent|components?\s*\(|unionFind|disjointSet/i,
      /a3prep|a3samples|a3readiness|a3evidence\/|a3governance\/|a3governanceV[23]/,
      /\b(setPRank|setRRank|rankSetP|rankSetR|reachableMembership|evaluateSd9)\b/i,
      /continuationWindow|acquisitionGate|v3transition|\/transition\/|\/corpus\/|\/draw\//,
      /commitLoader|readCommittedBlob|registryV4|resolveV4|familiesV4|provenanceClosure/,
      /\blatest\b|rev-parse|ls-remote|origin\/|feat\/phase2b-2d-a2/i,
      /a2Consistency|formalSd7|adjudicat/i,
    ]) {
      expect(source, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it('names no DEV_CONFIRM or FINAL_HOLDOUT split and takes no split parameter', () => {
    const source = allCode();
    expect(source).not.toMatch(/DEV_CONFIRM|FINAL_HOLDOUT/);
    expect(source).not.toMatch(/\bsplit\s*:\s*(Split|string)\s*[,)]/);
  });

  it('no R35 type or object has a field that can hold text, a title, a URL or a host', () => {
    const source = allCode();
    expect(source).not.toMatch(
      /readonly\s+(mainText|redactedText|text|title|headings|url|requestedUrl|host|rootKey)\??\s*:/,
    );
    expect(source).not.toMatch(/mainText/);
  });

  it('has no unsafe, test-only, forced or plain-object mint and invents no digest', () => {
    const source = allCode();
    expect(source).not.toMatch(/unsafeMint|testOnlyMint|forceMint|fromPlainObject/);
    expect(source).not.toMatch(/createHash|node:crypto|sha256\s*\(/);
    expect(source).not.toMatch(/graphDeltaHash|graphCoverageHash|sd7ExpansionHash/);
  });

  it('exposes no entry point over several organisations or historical graphs', () => {
    expect(allCode()).not.toMatch(
      /historicalGraphs|allSlots|combinedDocuments|globalDocuments|pooled/,
    );
  });
});

describe.skipIf(!baseAvailable)('2D-A3 R35: lineage and changed surface', () => {
  it('descends from the exact canonical R34 tip, and merges no commit', () => {
    expect(() => git('merge-base', '--is-ancestor', R34_TERMINAL, 'HEAD')).not.toThrow();
    expect(() => git('merge-base', '--is-ancestor', R34_SCOPE_PIN_COMMIT, 'HEAD')).not.toThrow();
    expect(lines(git('rev-list', '--merges', `${R34_TERMINAL}..HEAD`))).toEqual([]);
    expect(git('rev-parse', `${R34_SCOPE_PIN_COMMIT}^`).trim()).toBe(R34_TERMINAL);
    expect(git('rev-parse', `${R34_TERMINAL}~4`).trim()).toBe(R33_TERMINAL);
  });

  it('adds no A2 commit beyond the frozen V4 checkpoint', () => {
    const introduced = lines(git('rev-list', `${R34_TERMINAL}..HEAD`));
    for (const commit of introduced) {
      expect(lines(git('rev-list', '--parents', '-n', '1', commit))[0]!.split(' ')).toHaveLength(2);
    }
    if (commitExists(V4_A2_CHECKPOINT)) {
      expect(() => git('merge-base', '--is-ancestor', V4_A2_CHECKPOINT, 'HEAD')).toThrow();
    }
  });

  it("pinned R34's scope in exactly one commit that touched exactly one file", () => {
    expect(lines(git('diff', '--name-only', R34_TERMINAL, R34_SCOPE_PIN_COMMIT))).toEqual([
      R34_ISOLATION_TEST,
    ]);
    expect(sha256(readFileSync(join(REPO_ROOT, R34_ISOLATION_TEST)))).toBe(
      sha256(git('show', `${R34_SCOPE_PIN_COMMIT}:${R34_ISOLATION_TEST}`)),
    );
  });

  it('leaves every earlier A3 namespace and the A2 harness untouched', () => {
    for (const namespace of Object.keys(FROZEN_NAMESPACES)) {
      const path = `${HARNESS}/${namespace}`;
      expect(lines(git('diff', '--name-only', R34_TERMINAL, '--', path)), path).toEqual([]);
      expect(lines(git('ls-files', '--others', '--exclude-standard', '--', path)), path).toEqual(
        [],
      );
    }
  });

  it('leaves every earlier A3 public census and audit byte-identical', () => {
    const prior = lines(
      git('ls-tree', '-r', '--name-only', R34_TERMINAL, '--', 'docs/evaluation', 'docs/audits'),
    ).filter((path) => /PHASE_2B_2D_A3_R\d+_/.test(path));
    expect(prior.length).toBeGreaterThanOrEqual(32);
    for (const record of prior) {
      expect(sha256(readFileSync(join(REPO_ROOT, record))), record).toBe(
        sha256(git('show', `${R34_TERMINAL}:${record}`)),
      );
    }
  });

  it('writes no other record: every docs/evaluation change is the R35 census', () => {
    const changed = [
      ...lines(git('diff', '--name-only', R34_TERMINAL, '--', 'docs/evaluation')),
      ...lines(git('ls-files', '--others', '--exclude-standard', '--', 'docs/evaluation')),
    ];
    expect(changed.filter((path) => path !== R35_CENSUS_PATH)).toEqual([]);
  });

  it('changes nothing outside its own namespace, tests, records and the R34 scope pin', () => {
    const paths = [
      ...new Set([
        ...lines(git('diff', '--name-only', R34_TERMINAL)),
        ...lines(git('ls-files', '--others', '--exclude-standard')),
      ]),
    ];
    const permitted = (path: string): boolean =>
      path.startsWith(`${A3GRAPHS_V4_REL}/`) ||
      R35_TESTS.includes(path) ||
      path === R34_ISOLATION_TEST ||
      path === R35_CENSUS_PATH ||
      path === R35_AUDIT_PATH;
    expect(paths.filter((path) => !permitted(path))).toEqual([]);
  });
});

describe.skipIf(!existsSync(join(REPO_ROOT, R35_CENSUS_PATH)))(
  '2D-A3 R35: the public census',
  () => {
    const raw = existsSync(join(REPO_ROOT, R35_CENSUS_PATH))
      ? readFileSync(join(REPO_ROOT, R35_CENSUS_PATH), 'utf8')
      : '{}';
    const audit = existsSync(join(REPO_ROOT, R35_AUDIT_PATH))
      ? readFileSync(join(REPO_ROOT, R35_AUDIT_PATH), 'utf8')
      : '';
    const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>;
    const payload = (() => {
      const copy = JSON.parse(raw) as Record<string, unknown>;
      delete copy['identityDisclosure'];
      delete copy['whatThisIsNot'];
      return JSON.stringify(copy, null, 2);
    })();
    const num = (section: string, key: string): number => parsed[section]![key] as number;

    it('is the derived census record, and authorises nothing', () => {
      expect(parsed['record']).toBe(R35_PUBLIC_CENSUS_RECORD_KIND);
      expect(parsed['recordKind']).toBe('PUBLIC_AGGREGATE_ONLY_INCREMENTAL_SD7_GRAPH_CENSUS');
      expect(parsed['thisFileAuthorises']).toEqual([]);
      expect(parsed['r34Tip']).toBe(R34_TERMINAL);
      expect(parsed['r34ScopePinCommit']).toBe(R34_SCOPE_PIN_COMMIT);
      expect(parsed['split']).toBe('DEV_TRAIN');
      expect(parsed['r34Reproduction']!['freshR34CensusEqualsCommitted']).toBe(true);
      expect(parsed['r34Reproduction']!['excludedExecutionProvenanceFields']).toEqual([
        'implementationCommit',
      ]);
    });

    it('states a 7-slot / 197-document delta whose measurable + short partition closes', () => {
      expect(num('deltaGraph', 'deltaGraphSlots')).toBe(7);
      expect(num('deltaGraph', 'deltaDocuments')).toBe(197);
      expect(
        num('deltaGraph', 'deltaMeasurableDocuments') +
          num('deltaGraph', 'deltaShortTextUnresolved'),
      ).toBe(197);
      for (const key of Object.keys(parsed['deltaGraph']!)) {
        expect(Number.isSafeInteger(num('deltaGraph', key)), key).toBe(true);
        expect(num('deltaGraph', key), key).toBeGreaterThanOrEqual(0);
      }
      // A per-slot sum can never exceed one pooled M(M-1)/2.
      const m = num('deltaGraph', 'deltaMeasurableDocuments');
      expect(num('deltaGraph', 'deltaComparedPairs')).toBeLessThanOrEqual((m * (m - 1)) / 2);
      expect(num('deltaGraph', 'deltaDocumentsInAtLeastOneNearDuplicateEdge')).toBeLessThanOrEqual(
        2 * num('deltaGraph', 'deltaNearDuplicateEdges'),
      );
    });

    it('states 6 historical + 7 new = 13 graphs, 388 documents, every total a per-slot sum', () => {
      const coverage = parsed['coverage']!;
      expect(parsed['historicalGraphCoverage']).toMatchObject({
        r22HistoricalGraphSlots: 5,
        r28NewGraphSlots: 1,
        historicalGraphSlots: 6,
        readFromCommittedAggregateRecordsOnly: true,
      });
      expect(coverage['historicalCanonicalGraphSlots']).toBe(6);
      expect(coverage['newR35GraphSlots']).toBe(7);
      expect(coverage['coverageGraphSlots']).toBe(13);
      expect(coverage['historicalDocuments']).toBe(191);
      expect(coverage['coverageDocuments']).toBe(388);
      expect(coverage['historicalMeasurableDocuments']).toBe(190);
      expect(coverage['historicalShortTextUnresolved']).toBe(1);
      expect(coverage['historicalComparedPairs']).toBe(2933);
      expect(coverage['historicalNearDuplicateEdges']).toBe(42);
      expect(coverage['historicalDocumentsInAtLeastOneNearDuplicateEdge']).toBe(21);
      for (const [name, delta] of [
        ['Documents', 'deltaDocuments'],
        ['MeasurableDocuments', 'deltaMeasurableDocuments'],
        ['ShortTextUnresolved', 'deltaShortTextUnresolved'],
        ['ComparedPairs', 'deltaComparedPairs'],
        ['NearDuplicateEdges', 'deltaNearDuplicateEdges'],
        ['DocumentsInAtLeastOneNearDuplicateEdge', 'deltaDocumentsInAtLeastOneNearDuplicateEdge'],
      ] as const) {
        expect(coverage[`new${name}`], name).toBe(num('deltaGraph', delta));
        expect(coverage[`coverage${name}`], name).toBe(
          (coverage[`historical${name}`] as number) + num('deltaGraph', delta),
        );
      }
      expect(coverage['combinedPairCountIsSumOfPerSlotPairs']).toBe(true);
      expect(coverage['documentsInEdgesDedupedAcrossOrganisations']).toBe(false);
      expect(coverage['thirteenSlotGraphBatchMinted']).toBe(false);
    });

    it('states the canonical SD7 constants, the semantics and the access zeros', () => {
      expect(parsed['canonicalSd7']).toEqual({
        shingleSizeTokens: 5,
        jaccardThresholdNumerator: 9,
        jaccardThresholdDenominator: 10,
        thresholdComparison: 'AT_OR_ABOVE',
        thresholdPredicate: 'INTEGER_INTERSECTION_TIMES_DENOMINATOR_GE_UNION_TIMES_NUMERATOR',
        comparisonScope: 'WITHIN_ONE_ORGANISATION_ONLY',
        shortTextStatus: 'SD7_SHORT_TEXT_UNRESOLVED',
      });
      expect(parsed['semantics']).toEqual({
        historicalR22R28GraphsRemeasured: false,
        historicalGraphObjectsReminted: false,
        deltaOnlyGraphMeasurement: true,
        canonicalR22PureMeasurementUsed: true,
        canonicalR22CallsPerDeltaSlot: 1,
        textReadOnlyThroughR34Capability: true,
        textPersistedByR35: false,
        textLoggedByR35: false,
        emptyOrShortTextSpecialCasedByR35: false,
        crossOrganisationPairsMeasured: false,
        combinedPairCountIsSumOfPerSlotPairs: true,
        shortTextResolved: false,
        componentsComputed: false,
        survivorSelectionPerformed: false,
        setPRanked: false,
        setRRanked: false,
        setPMembershipSelected: false,
        setRMembershipSelected: false,
        sd9Evaluated: false,
      });
      expect(
        parsed['a2Sd7Consistency']!['a2Sd7AggregateConsistencyCheckUsedAsGraphAuthority'],
      ).toBe(false);
      expect(parsed['a2Sd7Consistency']!['a2SurvivorCountUsedAsAuthority']).toBe(false);
      const access = parsed['access']!;
      expect(access['r35SqlStatements']).toBe(0);
      expect(access['upstreamReproducedR33OldAuthorityQueries']).toBe(0);
      expect(access['upstreamReproducedR33DeltaAuthorityQueries']).toBe(7);
      expect(access['databaseWrites']).toBe(0);
      expect(access['institutionNetworkRequests']).toBe(0);
      expect(access['sealedRootReads']).toBe(0);
      expect(access['devConfirmEvidenceReads']).toBe(0);
      expect(access['finalHoldoutEvidenceReads']).toBe(0);
    });

    it('carries no identity-, position-, run-, digest-, edge-, text- or per-slot-bearing key', () => {
      for (const key of [
        'selectionIndex',
        'selectionIndices',
        'reserveRankPosition',
        'organisationId',
        'echeRowKey',
        'runId',
        'runRef',
        'runRefSha256',
        'drawEntrySha256',
        'documentSha256',
        'responseSha256',
        'pageEvidenceId',
        'fetchObservationId',
        'candidateId',
        'aIndex',
        'bIndex',
        'edges',
        'measurement',
        'intersectionSize',
        'unionSize',
        'similarity',
        'tokenCount',
        'shingleCount',
        'measurableIndices',
        'url',
        'host',
        'title',
        'headings',
        'mainText',
        'candidateScore',
        'signals',
        'sealedSd7Detail',
        'items',
        'slots',
        'perSlot',
        'documents',
      ]) {
        expect(payload, key).not.toContain(`"${key}":`);
      }
      expect(payload).not.toMatch(/graphDeltaHash|graphCoverageHash|sd7ExpansionHash/);
      // No array of numbers anywhere: a per-slot breakdown would be one.
      expect(payload).not.toMatch(/\[\s*\d/);
    });

    it('names no URL, domain, sealed filename or document-shaped digest', () => {
      expect(payload).not.toMatch(/https?:\/\/|\.(fr|eu|org|com)\b|SD7_DETAIL|\.json"|sealed-/);
      expect(payload).not.toMatch(/\b[0-9a-f]{64}\b/);
      const digests = [...new Set(payload.match(/\b[0-9a-f]{40,64}\b/g) ?? [])].sort();
      const permitted = new Set([
        R34_TERMINAL,
        R34_SCOPE_PIN_COMMIT,
        String(parsed['implementationCommit']),
      ]);
      expect(digests.filter((digest) => !permitted.has(digest))).toEqual([]);
      expect(String(parsed['implementationCommit'])).toMatch(/^[0-9a-f]{40}$/);
      // The audit may name 64-hex values only as the census's own sha256 or a
      // reused module's pinned sha256 - never a document or run digest.
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
