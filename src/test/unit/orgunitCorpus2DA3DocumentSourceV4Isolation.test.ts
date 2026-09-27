/**
 * PHASE 2B-2D A3 R34 — ISOLATION OF THE GOVERNANCE V4 INCREMENTAL DOCUMENT-SOURCE DELTA.
 *
 * By reading source text, the repository's own history and the committed
 * records, this file proves:
 *
 *   - R34 lives in the NEW sibling namespace `a3documentsV4/`, and every
 *     earlier A3 namespace - R21's `a3documents/`, R27's `a3documentsV2/` and
 *     R33's `a3evidenceV4/` above all - is byte-identical to the canonical
 *     R33 tip, with the reused modules pinned by sha256;
 *   - R34 reuses R21's pure assembler and text lookup and R33's brand /
 *     provenance accessors, never R21's V1 or R27's V2 minting, never calls
 *     `exactDuplicatePass` or `prepareSetRDocumentScore` directly, and writes
 *     no SQL of its own;
 *   - no database, environment, filesystem, network, provider, classifier,
 *     sealed-root, child-process, A2, "latest", SD7-graph, tokenisation,
 *     Jaccard, SET_P, SET_R or SD9 capability exists in the namespace, no
 *     other split is named, and no selection index is hardcoded;
 *   - the only pre-existing file R34 touched is R33's historical scope pin;
 *   - the committed R34 census states the derived delta and 6 + 7 = 13
 *     coverage, discloses no identity and invents no digest.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { R34_PUBLIC_CENSUS_RECORD_KIND } from '../harness/phase2b2d/a3documentsV4/census.js';
import {
  loadCommittedA2GovernanceV4,
  readyAuthoritiesOfV4,
} from '../harness/phase2b2d/a3governanceV4/snapshotV4.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const HARNESS = 'src/test/harness/phase2b2d';
const A3DOCUMENTS_V4_REL = `${HARNESS}/a3documentsV4`;

/** The exact canonical R33 tip R34 was cut from. */
const R33_TERMINAL = '31f389c8e1b6338d45a533b01feb6a2f6d932678';
/**
 * R34'S OWN TERMINAL COMMIT.
 *
 * R34's changed-surface and docs-scope assertions describe R34'S SLICE, so
 * they range over R34's own commits - `R33_TERMINAL..R34_TERMINAL` - rather
 * than over the working tree. Once a later slice lands on top, the working
 * tree is no longer R34's surface, and diffing to it would fail for the
 * honest reason that history moved on rather than because R34 changed.
 *
 * This is the same standing convention R19 through R33 apply, and it
 * WEAKENS NOTHING: R34's range is frozen, its permitted-path list is
 * unchanged, and each later slice pins the equivalent scope over its own range.
 */
const R34_TERMINAL = '6075ec8b79dd35b820a5086da89f18ca975eb039';
/** The exact canonical R32 tip, R33's own base. */
const R32_TERMINAL = '747b64fa40c93e4b871ea1675682fb1531b21341';

/** The one commit that pinned R33's own changed-surface test to its range. */
const R33_SCOPE_PIN_COMMIT = 'c80f0eee63718f37d6ff4e81cdda6ac7ba6a5fb9';
const R33_ISOLATION_TEST = 'src/test/unit/orgunitCorpus2DA3EvidenceV4Isolation.test.ts';

/** The frozen A2 checkpoint Governance V4 describes. */
const V4_A2_CHECKPOINT = '67ae047fb7de079bcba0eec83ca4f4baee77cc3e';

const R34_TESTS = [
  'src/test/unit/orgunitCorpus2DA3DocumentSourceV4Delta.test.ts',
  'src/test/unit/orgunitCorpus2DA3DocumentSourceV4Isolation.test.ts',
];
const R34_CENSUS_PATH =
  'docs/evaluation/PHASE_2B_2D_A3_R34_DEV_TRAIN_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1.json';
const R34_AUDIT_PATH =
  'docs/audits/PHASE_2B_2D_A3_R34_INCREMENTAL_DEV_TRAIN_DOCUMENT_SOURCE_ASSEMBLY_V1.md';

const A3DOCUMENTS_V4_FILES = [
  'assembleDelta.ts',
  'census.ts',
  'devTrain.ts',
  'r33Drift.ts',
  'refusal.ts',
  'types.ts',
];

/** The reused and neighbouring layers, byte-pinned at the R33 tip. */
const REUSED_MODULE_SHA256: Readonly<Record<string, string>> = {
  'a3documents/assemble.ts': '062da3fdcb9013b8e90741478b398c217f58a1da6ffcf5ceeb3d640ce45cb1af',
  'a3documents/types.ts': 'ed497379c839dde668862baa785c9abc8f8c39ca4a355e73b97f12e48c3d859f',
  'a3documents/refusal.ts': 'e62a186837302ff0836b794934c28e0f5cf6e643490d13de22b3439258825aca',
  'a3documents/devTrain.ts': 'd962748b397f9c0e62da4d9e7aa649d5f47ea109fd5d4ff16b70afc3ce6f1ad1',
  'a3prep/setRScore.ts': '055747a5f5f067e06079562cd7e37a4e12d011d3736e28b947b5a30d6f588cf7',
  'sd7/nearDuplicatePairs.ts': '1851726bb28789791d96e0cd27532846e6a503b234a5813bec70782e6e078371',
  'a3documentsV2/assembleDelta.ts':
    '7b87e58b91eaf192c6ac31c79bea14bb652a3103ba9311d7213da8bc58e63798',
  'a3documentsV2/census.ts': 'df6c33efdaaefd379a5fe23db2be189488e756bbe59682296ecdaed71532aea8',
  'a3documentsV2/devTrain.ts': 'ff042050139bc0ab40a73cb827e59a9d1c02e404c282dd88d4160ffd90dad4ec',
  'a3documentsV2/r26Drift.ts': '6498a0815deada59b96d646d31d641a45fca787a99e40f7ccc9e0d67e80e2059',
  'a3documentsV2/refusal.ts': '57e9e28fd79cb2d80de333a644f870aabe275bea0fd6ff63a163084f20c30ae1',
  'a3documentsV2/types.ts': 'a0b4c1c580cd60aac8fca93e422d731cc840b906c2b988c6e5ab9e48f056af9e',
  'a3evidenceV4/authorityDelta.ts':
    '63776e1b4920b89c4b1f3c0741bd9b3be45101de13f4684a7a149531289eba1f',
  'a3evidenceV4/census.ts': '2bef9d8b2fb5dcbd99c6b44e435cf9778851f286803c0b4e4ae978efd9be147b',
  'a3evidenceV4/devTrain.ts': 'e49cc3af5399705bcccd92a70d720e8d31033c94db66574982f34efd86621391',
  'a3evidenceV4/r32Drift.ts': '5a2726f5c73a0bea17cd8ecff327943b8d2f0de90a1f0a8228cc7cd1cd1fe28f',
  'a3evidenceV4/refusal.ts': '566f1036c0d35f3b3bae22d7cd20cb141bd58694952c27c680ba326db1a6137b',
  'a3evidenceV4/types.ts': '7bdc87dff9aa2d4421015544281cf41021f4fba0d29005e4f95fd54986934859',
  'a3evidence/database.ts': '48c47fb44a13ed3b5408c53afda8972a598cd6f7057d7e6191682633456d52e0',
  'a3evidence/types.ts': '3b26c39afdb871a5f4de26969e1d1a167a5591a5820b44ab4ab42adc77544c2a',
  'a3governanceV4/snapshotV4.ts':
    'd6671faa0d7e7247407b9c9d92054199a7ae21ada98fd60674c94f88e571f2e7',
};

/** Every earlier namespace R34 must leave byte-identical, with its file count. */
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
  return stripComments(readFileSync(join(REPO_ROOT, A3DOCUMENTS_V4_REL, file), 'utf8'));
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

function importedNames(source: string, specifier: string): string[] {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  return [
    ...source.matchAll(
      new RegExp(`import\\s*(?:type\\s*)?\\{([^}]*)\\}\\s*from\\s*'${escaped}'`, 'g'),
    ),
  ]
    .flatMap((m) => (m[1] ?? '').split(',').map((name) => name.trim().replace(/^type\s+/, '')))
    .filter((name) => name.length > 0);
}

function lines(value: string): string[] {
  return value.split('\n').filter((line) => line.length > 0);
}

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function allCode(): string {
  return A3DOCUMENTS_V4_FILES.map(code).join('\n');
}

/**
 * Code with string literals blanked. Used ONLY for the capability-name
 * patterns below: the history gates legitimately name committed record kinds
 * such as `..._R33_..._CENSUS_V1`, which are record names, not capabilities.
 */
function allCodeWithoutStrings(): string {
  return allCode()
    .replace(/'[^'\n]*'/g, "''")
    .replace(/"[^"\n]*"/g, '""')
    .replace(/`[^`]*`/g, '``');
}

const baseAvailable =
  commitExists(R33_TERMINAL) &&
  commitExists(R32_TERMINAL) &&
  commitExists(R33_SCOPE_PIN_COMMIT) &&
  commitExists(R34_TERMINAL);

// ---------------------------------------------------------------------------

describe('2D-A3 R34: the new namespace is exactly these files', () => {
  it('holds the six V4 incremental document-source modules', () => {
    expect(readdirSync(join(REPO_ROOT, A3DOCUMENTS_V4_REL)).sort()).toEqual(A3DOCUMENTS_V4_FILES);
  });

  it('leaves every earlier A3 namespace at its file count', () => {
    for (const [namespace, count] of Object.entries(FROZEN_NAMESPACES)) {
      if (count < 0) continue;
      expect(readdirSync(join(REPO_ROOT, HARNESS, namespace)), namespace).toHaveLength(count);
    }
  });

  it('leaves R21, R27, R33, R10, SD7 and the reused R20 / R32 modules byte-identical', () => {
    for (const [file, digest] of Object.entries(REUSED_MODULE_SHA256)) {
      expect(sha256(readFileSync(join(REPO_ROOT, HARNESS, file))), file).toBe(digest);
    }
  });
});

describe('2D-A3 R34: reuse R21 pure assembly and R33 provenance, never older minting', () => {
  const PERMITTED_SPECIFIERS = new Set([
    '../sd7/nearDuplicatePairs.js',
    '../a3documents/assemble.js',
    '../a3documents/types.js',
    '../a3governanceV4/snapshotV4.js',
    '../a3evidence/database.js',
    '../a3evidenceV4/census.js',
    '../a3evidenceV4/devTrain.js',
    '../a3evidenceV4/r32Drift.js',
    '../a3evidenceV4/types.js',
    './assembleDelta.js',
    './census.js',
    './devTrain.js',
    './r33Drift.js',
    './refusal.js',
    './types.js',
  ]);

  it('imports nothing but landed R21 / R33 / V4 governance modules and its own files', () => {
    for (const file of A3DOCUMENTS_V4_FILES) {
      for (const specifier of specifiersOf(code(file))) {
        expect(PERMITTED_SPECIFIERS.has(specifier), `${file}: ${specifier}`).toBe(true);
      }
    }
  });

  it('takes from R21 only the pure assembler, the unbound text lookup and types', () => {
    const source = allCode();
    expect([...new Set(importedNames(source, '../a3documents/assemble.js'))].sort()).toEqual([
      'assembleUnboundSlotDocumentSources',
      'documentTextLookupForUnboundSlotAssembly',
    ]);
    expect(importedNames(code('assembleDelta.ts'), '../a3documents/assemble.js')).toEqual([
      'assembleUnboundSlotDocumentSources',
    ]);
    expect(importedNames(code('devTrain.ts'), '../a3documents/assemble.js')).toEqual([
      'documentTextLookupForUnboundSlotAssembly',
    ]);
    expect(source.match(/\bassembleUnboundSlotDocumentSources\s*\(/g)).toHaveLength(1);
  });

  it('takes the DocumentTextLookup TYPE only from SD7, and the transaction-proof TYPE only from R20', () => {
    expect(allCode()).toMatch(
      /import type \{ DocumentTextLookup \} from '\.\.\/sd7\/nearDuplicatePairs\.js'/,
    );
    expect(allCode()).toMatch(
      /import type \{ ReadOnlyTransactionProof \} from '\.\.\/a3evidence\/database\.js'/,
    );
  });

  it('takes from R33 only its brands, provenance accessors, census derivation and types', () => {
    const source = allCode();
    expect([...new Set(importedNames(source, '../a3evidenceV4/devTrain.js'))].sort()).toEqual([
      'durableEvidenceDeltaV4ForReadyAuthority',
      'governanceSnapshotV4ForDurableEvidenceDelta',
      'isA3DevTrainDurableEvidenceDeltaBatchV4',
      'isA3DurableAcquisitionEvidenceDeltaV4',
    ]);
    expect([...new Set(importedNames(source, '../a3evidenceV4/census.js'))].sort()).toEqual([
      'R33CensusProvenance',
      'R33PublicIncrementalEvidenceCensus',
      'deriveR33PublicIncrementalEvidenceCensus',
    ]);
    expect(importedNames(source, '../a3evidenceV4/r32Drift.js')).toEqual([
      'GovernanceDriftProofV4',
    ]);
  });

  it('never calls exactDuplicatePass, R10 preparation, R21 V1 / R27 V2 minting or R33 binders', () => {
    const source = allCode();
    for (const forbidden of [
      'exactDuplicatePass',
      'prepareSetRDocumentScore',
      'bindDevTrainDocumentSourceBatch',
      'documentSourceAssemblyForDurableEvidence',
      'documentTextLookupForSlotAssembly',
      'durableEvidenceForDocumentSourceAssembly',
      'bindDevTrainDocumentSourceDeltaBatchV2',
      'documentTextLookupForDeltaSlotAssembly',
      'isA3DevTrainSlotDocumentSourceAssemblyDeltaV2',
      'isA3DurableAcquisitionEvidenceDeltaV2',
      'isA3DurableAcquisitionEvidence',
      'bindDevTrainEvidenceDeltaV4',
      'runDevTrainEvidenceDeltaBindingV4',
      'planDevTrainEvidenceDeltaRequestsV4',
      'bindDurableEvidenceForReadyAuthority',
      'bindDevTrainDurableEvidenceBatch',
      'runDevTrainDurableEvidenceBinding',
      'loadUnboundDurableRunEvidence',
      'withReadOnlyEvidenceSnapshot',
    ]) {
      expect(source, forbidden).not.toMatch(new RegExp(`\\b${forbidden}\\b`));
    }
  });

  it('writes no SQL of its own and opens no transaction, pool or query', () => {
    const source = allCode();
    expect(source).not.toMatch(
      /\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bTRUNCATE\b|\bBEGIN\b|COMMIT|ROLLBACK/,
    );
    expect(source).not.toMatch(/\.connect\s*\(|new\s+pg\.|Pool\s*\(|\.query\s*\(|from 'pg'/);
  });

  it('hardcodes no selection index list anywhere in the namespace', () => {
    for (const file of A3DOCUMENTS_V4_FILES) {
      expect(code(file), file).not.toMatch(/\b(34|39|44|49|56|61|71)\b/);
    }
    expect(allCode()).not.toMatch(/\[\s*\d+\s*,\s*\d+\s*,\s*\d+/);
  });

  it('has no unsafe, test-only, forced or plain-object mint and no substitute authority digest', () => {
    const source = allCode();
    expect(source).not.toMatch(/unsafeMint|testOnlyMint|forceMint|fromPlainObject/);
    expect(source).not.toMatch(
      /documentDeltaHash|documentCoverageHash|assemblyExpansionHash|textLookupHash|createHash|sha256\s*\(/,
    );
  });

  it('no minted type carries a text, title, heading, URL, host or root field', () => {
    const types = code('types.ts');
    expect(types).not.toMatch(
      /\b(mainText|text|title|headings?|url|requestedUrl|host|rootKey)\s*:/,
    );
  });
});

describe('2D-A3 R34: no env, fs, network, provider, sealed, A2, SD7 or corpus capability', () => {
  it('reads no environment and touches no filesystem, socket, provider or child process', () => {
    const source = allCode();
    for (const forbidden of [
      /process\.env/,
      /DATABASE_URL/,
      /config\/env/,
      /src\/db\//,
      /node:(fs|net|tls|http|https|dns|child_process)/,
      /\bfetch\s*\(/,
      /readFile|writeFile|appendFile|mkdir|rmSync|unlink|createWriteStream|execFileSync/,
      /anthropic|claude-agent-sdk|@anthropic-ai|openai|apollo/i,
      /orgunits\/(classify|web|orchestrator|signals)|phase2b2d2c|gateway|crawler/,
      /methodology-v2-sealed|gen1-dev-train|gen1-dev-confirm|gen1-final-holdout|SD7_DETAIL/,
    ]) {
      expect(source, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it('reaches no A2 harness, governance loader, SD7 graph, SET_P, SET_R, reachability or SD9', () => {
    expect(allCode()).not.toMatch(/'\.\.\/(a3graphs|a3samples|a3readiness|a3prep|a3governanceV3)/);
    expect(allCode()).not.toMatch(
      /a3governanceV4\/(registryV4|resolveV4|familiesV4|commitLoaderV4)|loadCommittedA2Governance/,
    );
    const source = allCodeWithoutStrings();
    for (const forbidden of [
      /continuationWindow|acquisitionGate|v3transition|\/transition\/|\/corpus\/|\/draw\//,
      /measureNearDuplicateGraph|nearDuplicateGraph\s*\(|tokenShingles|shingle|jaccard|normaliseText/i,
      /a3graphs|a3samples|a3readiness|setP\b|setR\b|sd9|reachable|survivor|holdoutScor/i,
      /commitLoader|readCommittedBlob|\/registryV4\b|\/resolveV4\b|familiesV4|provenanceClosure/,
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
});

describe.skipIf(!baseAvailable)('2D-A3 R34: lineage and changed surface', () => {
  it('descends from the exact canonical R33 tip, and merges no commit', () => {
    expect(() => git('merge-base', '--is-ancestor', R33_TERMINAL, 'HEAD')).not.toThrow();
    expect(() => git('merge-base', '--is-ancestor', R33_SCOPE_PIN_COMMIT, 'HEAD')).not.toThrow();
    expect(lines(git('rev-list', '--merges', `${R33_TERMINAL}..HEAD`))).toEqual([]);
    expect(git('rev-parse', `${R33_SCOPE_PIN_COMMIT}^`).trim()).toBe(R33_TERMINAL);
    expect(git('rev-parse', `${R33_TERMINAL}~4`).trim()).toBe(R32_TERMINAL);
  });

  it('adds no A2 commit beyond the frozen V4 checkpoint', () => {
    const introduced = lines(git('rev-list', `${R33_TERMINAL}..HEAD`));
    for (const commit of introduced) {
      expect(lines(git('rev-list', '--parents', '-n', '1', commit))[0]!.split(' ')).toHaveLength(2);
    }
    if (commitExists(V4_A2_CHECKPOINT)) {
      expect(() => git('merge-base', '--is-ancestor', V4_A2_CHECKPOINT, 'HEAD')).toThrow();
    }
  });

  it("pinned R33's scope in exactly one commit that touched exactly one file", () => {
    expect(lines(git('diff', '--name-only', R33_TERMINAL, R33_SCOPE_PIN_COMMIT))).toEqual([
      R33_ISOLATION_TEST,
    ]);
    expect(sha256(readFileSync(join(REPO_ROOT, R33_ISOLATION_TEST)))).toBe(
      sha256(git('show', `${R33_SCOPE_PIN_COMMIT}:${R33_ISOLATION_TEST}`)),
    );
  });

  it('leaves every earlier A3 namespace and the A2 harness untouched', () => {
    for (const namespace of Object.keys(FROZEN_NAMESPACES)) {
      const path = `${HARNESS}/${namespace}`;
      expect(lines(git('diff', '--name-only', R33_TERMINAL, '--', path)), path).toEqual([]);
      expect(lines(git('ls-files', '--others', '--exclude-standard', '--', path)), path).toEqual(
        [],
      );
    }
  });

  it('leaves every earlier A3 public census and audit byte-identical', () => {
    const prior = lines(
      git('ls-tree', '-r', '--name-only', R33_TERMINAL, '--', 'docs/evaluation', 'docs/audits'),
    ).filter((path) => /PHASE_2B_2D_A3_R\d+_/.test(path));
    expect(prior.length).toBeGreaterThanOrEqual(30);
    for (const record of prior) {
      expect(sha256(readFileSync(join(REPO_ROOT, record))), record).toBe(
        sha256(git('show', `${R33_TERMINAL}:${record}`)),
      );
    }
  });

  it('writes no other record: every docs/evaluation change is the R34 census', () => {
    const changed = lines(
      git('diff', '--name-only', R33_TERMINAL, R34_TERMINAL, '--', 'docs/evaluation'),
    );
    expect(changed.filter((path) => path !== R34_CENSUS_PATH)).toEqual([]);
  });

  it('changes nothing outside its own namespace, tests, records and the R33 scope pin', () => {
    const paths = lines(git('diff', '--name-only', R33_TERMINAL, R34_TERMINAL));
    const permitted = (path: string): boolean =>
      path.startsWith(`${A3DOCUMENTS_V4_REL}/`) ||
      R34_TESTS.includes(path) ||
      path === R33_ISOLATION_TEST ||
      path === R34_CENSUS_PATH ||
      path === R34_AUDIT_PATH;
    expect(paths.filter((path) => !permitted(path))).toEqual([]);
  });
});

describe.skipIf(!existsSync(join(REPO_ROOT, R34_CENSUS_PATH)))(
  '2D-A3 R34: the public census',
  () => {
    const raw = existsSync(join(REPO_ROOT, R34_CENSUS_PATH))
      ? readFileSync(join(REPO_ROOT, R34_CENSUS_PATH), 'utf8')
      : '{}';
    const audit = existsSync(join(REPO_ROOT, R34_AUDIT_PATH))
      ? readFileSync(join(REPO_ROOT, R34_AUDIT_PATH), 'utf8')
      : '';
    const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>;
    const payload = (() => {
      const copy = JSON.parse(raw) as Record<string, unknown>;
      delete copy['identityDisclosure'];
      delete copy['whatThisIsNot'];
      return JSON.stringify(copy, null, 2);
    })();

    it('is the derived census record, and authorises nothing', () => {
      expect(parsed['record']).toBe(R34_PUBLIC_CENSUS_RECORD_KIND);
      expect(parsed['recordKind']).toBe(
        'PUBLIC_AGGREGATE_ONLY_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS',
      );
      expect(parsed['thisFileAuthorises']).toEqual([]);
      expect(parsed['r33Tip']).toBe(R33_TERMINAL);
      expect(parsed['r33ScopePinCommit']).toBe(R33_SCOPE_PIN_COMMIT);
      expect(parsed['split']).toBe('DEV_TRAIN');
      expect(parsed['r33Reproduction']!['freshR33CensusEqualsCommitted']).toBe(true);
      expect(parsed['r33Reproduction']!['excludedExecutionProvenanceFields']).toEqual([
        'implementationCommit',
      ]);
    });

    it('states the derived delta: 7 slots / 198 rows / 197 documents / 396 candidates', () => {
      expect(parsed['deltaAssembly']).toEqual({
        deltaSlotAssemblyCount: 7,
        deltaSourceRows: 198,
        deltaSlotLocalDistinctDocuments: 197,
        deltaExactDuplicateGroups: 1,
        deltaExactDuplicateRowsRemoved: 1,
        deltaMultiSourceDocuments: 1,
        deltaCandidateObservations: 396,
      });
      expect(parsed['deltaExtractionSupport']).toEqual({
        supportedExtractionRuleVersion: 'orgunit-extraction-v2',
        deltaSupportedExtractionRows: 198,
        deltaUnsupportedExtractionRows: 0,
        deltaMixedVersionDocuments: 0,
        deltaTextDivergenceGroups: 0,
      });
      expect(parsed['deltaScorePreparation']).toEqual({
        deltaR10Preparations: 197,
        deltaR10SourceRowCoverage: 198,
        deltaR10CandidateObservationCoverage: 396,
      });
    });

    it('states 6 historical + 7 new = 13 slots, 393 rows, 388 slot-local documents', () => {
      const coverage = parsed['coverage']!;
      expect(parsed['historicalDocumentCoverage']).toEqual({
        r21HistoricalSlots: 5,
        r27NewSlots: 1,
        historicalSlots: 6,
        readFromCommittedAggregateRecordsOnly: true,
      });
      expect(coverage['historicalCanonicalSlots']).toBe(6);
      expect(coverage['newR34Slots']).toBe(7);
      expect(coverage['coverageSlots']).toBe(13);
      expect(coverage['v4DevTrainAuthorityCoverage']).toBe(13);
      expect(coverage['coverageSourceRows']).toBe(393);
      expect(coverage['coverageSlotLocalDocuments']).toBe(388);
      expect(coverage['coverageExactDuplicateGroups']).toBe(4);
      expect(coverage['coverageExactDuplicateRowsRemoved']).toBe(5);
      expect(coverage['coverageMultiSourceDocuments']).toBe(4);
      expect(coverage['coverageCandidateObservations']).toBe(786);
      expect(coverage['coverageR10Preparations']).toBe(388);
      expect(coverage['coverageR10SourceRows']).toBe(393);
      expect(coverage['coverageR10CandidateObservations']).toBe(786);
      expect(coverage['slotLocalDocumentCoverageIsSumOfPerSlotCounts']).toBe(true);
      expect(coverage['thirteenSlotDocumentBatchMinted']).toBe(false);
    });

    it('states the semantics and access zeros', () => {
      const semantics = parsed['semantics']!;
      expect(semantics['historicalSlotsReassembled']).toBe(false);
      expect(semantics['historicalDocumentObjectsReminted']).toBe(false);
      expect(semantics['deltaOnlyAssembly']).toBe(true);
      expect(semantics['canonicalR21PureAssemblerUsed']).toBe(true);
      expect(semantics['crossOrganisationExactDedupePerformed']).toBe(false);
      expect(semantics['representativeSourceRowSelected']).toBe(false);
      expect(semantics['textTransformationPerformedByR34']).toBe(false);
      expect(semantics['nearDuplicateGraphMeasured']).toBe(false);
      expect(semantics['setPRanked']).toBe(false);
      expect(semantics['setRRanked']).toBe(false);
      const access = parsed['access']!;
      expect(access['r34SqlStatements']).toBe(0);
      expect(access['upstreamReproducedR33OldAuthorityQueries']).toBe(0);
      expect(access['upstreamReproducedR33DeltaAuthorityQueries']).toBe(7);
      expect(access['databaseWrites']).toBe(0);
      expect(access['sealedRootReads']).toBe(0);
      expect(access['devConfirmEvidenceReads']).toBe(0);
      expect(access['finalHoldoutEvidenceReads']).toBe(0);
    });

    it('carries no identity-, position-, run-, digest- or per-slot-bearing key', () => {
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
        'sourcePageEvidenceIds',
        'fetchObservationId',
        'candidateId',
        'url',
        'host',
        'title',
        'headings',
        'mainText',
        'candidateScore',
        'candidateScoreDecimal',
        'signals',
        'sealedSd7Detail',
        'items',
        'slots',
        'documents',
      ]) {
        expect(payload, key).not.toContain(`"${key}":`);
      }
      expect(payload).not.toMatch(
        /documentDeltaHash|documentCoverageHash|assemblyExpansionHash|textLookupHash/,
      );
    });

    it('names no URL, domain, sealed filename or document-shaped digest', () => {
      expect(payload).not.toMatch(/https?:\/\/|\.(fr|eu|org|com)\b|SD7_DETAIL|\.json"|sealed-/);
      expect(payload).not.toMatch(/\b[0-9a-f]{64}\b/);
      const digests = [...new Set(payload.match(/\b[0-9a-f]{40,64}\b/g) ?? [])].sort();
      const permitted = new Set([
        R33_TERMINAL,
        R33_SCOPE_PIN_COMMIT,
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
