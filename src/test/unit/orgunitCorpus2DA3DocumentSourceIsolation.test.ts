/**
 * PHASE 2B-2D A3 R21 ISOLATION — `a3documents/` IS PURE OVER AN R20 MINT.
 *
 * R21 lives in a FOURTH sibling namespace, beside `a3prep/` (the frozen
 * R1-R17 methodology layer), `a3governance/` (R19's offline adapter) and
 * `a3evidence/` (R20's read-only database adapter). This file proves:
 *
 *   - `a3documents/` imports only R20's types and mint predicates, R19's
 *     snapshot type, R17/A3 identity types, canonical `exactDuplicatePass`
 *     and `DocumentTextLookup`, and canonical R10 - no database, no
 *     environment, no filesystem, no socket, no provider, no classifier;
 *   - it measures no near-duplicate graph, ranks nothing, selects no SET_P or
 *     SET_R membership, and never names classifier canonicalisation;
 *   - it transforms no text and has no minting backdoor;
 *   - every a3prep, a3governance and a3evidence file, both earlier censuses
 *     and the two canonical SD7 modules are byte-identical to R20;
 *   - the only pre-existing file R21 touched is R20's historical scope pin;
 *   - the committed R21 census discloses no identity.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { R21_SUPPORTED_EXTRACTION_RULE_VERSION_V1 } from '../harness/phase2b2d/a3documents/types.js';
import { R21_PUBLIC_CENSUS_RECORD_KIND } from '../harness/phase2b2d/a3documents/census.js';
import { loadCanonicalA2GovernanceV1 } from '../harness/phase2b2d/a3governance/snapshot.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const A3PREP_REL = 'src/test/harness/phase2b2d/a3prep';
const A3GOVERNANCE_REL = 'src/test/harness/phase2b2d/a3governance';
const A3EVIDENCE_REL = 'src/test/harness/phase2b2d/a3evidence';
const A3DOCUMENTS_REL = 'src/test/harness/phase2b2d/a3documents';
const SD7_REL = 'src/test/harness/phase2b2d/sd7';

/** The exact canonical R20 tip R21 was cut from. */
const R20_TERMINAL = '4cd917817437bd7c04f29938694e7ba8c1078019';

/** The one commit that pinned R20's own changed-surface test to its range. */
const R20_SCOPE_PIN_COMMIT = '2d69c589ef052d17744a11a56e177947310460f0';
const R20_ISOLATION_TEST = 'src/test/unit/orgunitCorpus2DA3EvidenceIsolation.test.ts';

const R21_CENSUS_PATH =
  'docs/evaluation/PHASE_2B_2D_A3_R21_DEV_TRAIN_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1.json';
const R21_AUDIT_PATH = 'docs/audits/PHASE_2B_2D_A3_R21_DEV_TRAIN_DOCUMENT_SOURCE_ASSEMBLY_V1.md';

const A3DOCUMENTS_FILES = [
  'assemble.ts',
  'census.ts',
  'devTrain.ts',
  'r20Drift.ts',
  'refusal.ts',
  'types.ts',
];

/** Everything R21 builds on, as R20 left it. */
const R20_FROZEN_BYTES: Readonly<Record<string, string>> = {
  [`${A3PREP_REL}/contracts.ts`]:
    '4d856f45dd6016e1007d661f31388bf7bdbefd71862a6585ed4962240454b40f',
  [`${A3PREP_REL}/corpusFreezePreflight.ts`]:
    'ddae984fec947845ec2e2df9feb24bf8b8f75c28993b413919c08a69c307fe75',
  [`${A3PREP_REL}/manifestTypes.ts`]:
    '63e35e879a1cc31731704abd4273fbd2c6e3d438cef93fa79127f91529b4d4ee',
  [`${A3PREP_REL}/organisationCaps.ts`]:
    '20432a5c7bd78ef7ec78e61b7a37e69abe5849539eca07564cc091bf6afc302c',
  [`${A3PREP_REL}/rank.ts`]: '91658202f744be7efa5acfcb7905c9819af2bd4cbcd762aaeb2b8a49bf7c513e',
  [`${A3PREP_REL}/sd7.ts`]: '322d2dd09f17dcc7ce0afa1862a13892f8bdadfece1c3ec919580f9d49977086',
  [`${A3PREP_REL}/sd9.ts`]: '1de6a2781f322be0dea679d58897c37f49f4b1ca41df1933e975b5291f6efbdd',
  [`${A3PREP_REL}/setP.ts`]: 'c6839c72d365e5fd9bbe1c0604a6539e42a297dfeb4876fd6ed17858b578401c',
  [`${A3PREP_REL}/setPSd7.ts`]: 'b13c047f12ecf27583f07cef28923e3adc1e77ed2b3a1e1655de372cd79fdd4a',
  [`${A3PREP_REL}/setR.ts`]: '76e8cae9f24c2ceb983ffa5777fcb96583cff0553e360126a711a282a6a75bec',
  [`${A3PREP_REL}/setRScore.ts`]:
    '055747a5f5f067e06079562cd7e37a4e12d011d3736e28b947b5a30d6f588cf7',
  [`${A3PREP_REL}/setRSd7.ts`]: 'b03e26fae833c527b9cbbd1962bdf95e886b3a01fbd5e636c61b4c9a8c62e056',
  [`${A3PREP_REL}/setRSd7Readiness.ts`]:
    '6db33d0d39d9ab90fbf2e1b8b44a9649a6aa6db380d9f97cb5f1f8bdeb19561a',
  [`${A3PREP_REL}/slotAuthority.ts`]:
    'deee711b6eac66bccec51afee49615b71b94d0701b110a3abd50c1c12207f165',
  [`${A3PREP_REL}/splitScope.ts`]:
    'a03a9a742588ffc18842d20a5f00c9eaaf505e721e0b72d5fcc510c16f219a36',
  [`${A3PREP_REL}/types.ts`]: 'b9358e63bdf49f92e094a0605d34dfbaaf92403839265bbaa6249165f8b00810',
  [`${A3GOVERNANCE_REL}/families.ts`]:
    'a54a6908c25c8730600b900136efe74161f775af77c6888f11adb6b67e007dc0',
  [`${A3GOVERNANCE_REL}/loader.ts`]:
    '912ebdd7abe0192bc8f64a386dddc2339ac18c4e15a2ab2792976fff4e579783',
  [`${A3GOVERNANCE_REL}/refusal.ts`]:
    '5bd9f1f9bd99033253c07c5d103e1d637c6ca3399384b1288a3060a4475095da',
  [`${A3GOVERNANCE_REL}/registryV1.ts`]:
    '9dfd82344bd2bc9ba74997b47b7f88d7d6ca9938aa86e86153c14954b215d05d',
  [`${A3GOVERNANCE_REL}/resolve.ts`]:
    '3163d80229dc5ae5b1dab7c1e7351527ddaddcefaad3bd368dcb9106ca205178',
  [`${A3GOVERNANCE_REL}/snapshot.ts`]:
    '635ea860ed672d33d4f19329fff177ecac7ecef0434908c667b9f9ee25bca2fb',
  [`${A3GOVERNANCE_REL}/transitionLedger.ts`]:
    'e921c39a44fb8596aa345c9dcf6f27074af8e198b5e4d1ae0e145ed74fc9e462',
  [`${A3EVIDENCE_REL}/census.ts`]:
    'af42fe57747530f3d0b3c5def0913eb7828f098c652b996a12a8b198d483e415',
  [`${A3EVIDENCE_REL}/database.ts`]:
    '48c47fb44a13ed3b5408c53afda8972a598cd6f7057d7e6191682633456d52e0',
  [`${A3EVIDENCE_REL}/devTrain.ts`]:
    '175aa179954395e86a5c0c5cf0529560b23e13abf36f0f4eee1d498f6c6def3f',
  [`${A3EVIDENCE_REL}/integrity.ts`]:
    'a6f67b22581df40357ed0809083192eb839f80ff86797934d487bac721e877f4',
  [`${A3EVIDENCE_REL}/refusal.ts`]:
    '6cae64c61a08e919690ce1286f6433d429b4246c853a373b801470a705fc96a8',
  [`${A3EVIDENCE_REL}/runMatch.ts`]:
    '0d911386cb234964c616fadf51a6c9070f5ec47d1bed4498ee25ee62ea8aea00',
  [`${A3EVIDENCE_REL}/types.ts`]:
    '3b26c39afdb871a5f4de26969e1d1a167a5591a5820b44ab4ab42adc77544c2a',
  'docs/evaluation/PHASE_2B_2D_A3_R19_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V1.json':
    '273962e48057fcfeb948e37870ccea1650776f0c8ff7a07c764400b493c13a1f',
  'docs/evaluation/PHASE_2B_2D_A3_R20_DEV_TRAIN_DURABLE_EVIDENCE_BINDING_CENSUS_V1.json':
    '8e15c65a1673a9540fb85b1dbc7583b8b7925e4f788ecbce50b053c43fd05102',
  [`${SD7_REL}/nearDuplicatePairs.ts`]:
    '1851726bb28789791d96e0cd27532846e6a503b234a5813bec70782e6e078371',
  [`${SD7_REL}/normaliseText.ts`]:
    'b518e2ab02eb9284c56a5c0172f79480a8fd110f7433f502fe3e619a3846df90',
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
  return stripComments(readFileSync(join(REPO_ROOT, A3DOCUMENTS_REL, file), 'utf8'));
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

function lines(value: string): string[] {
  return value.split('\n').filter((line) => line.length > 0);
}

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

const baseAvailable = commitExists(R20_TERMINAL) && commitExists(R20_SCOPE_PIN_COMMIT);

// ---------------------------------------------------------------------------

describe('2D-A3 R21: the new namespace is exactly these files', () => {
  it('holds the six assembly modules and no synthetic fixture', () => {
    expect(readdirSync(join(REPO_ROOT, A3DOCUMENTS_REL)).sort()).toEqual(A3DOCUMENTS_FILES);
  });

  it('leaves a3prep at sixteen files and a3governance and a3evidence at seven', () => {
    expect(readdirSync(join(REPO_ROOT, A3PREP_REL))).toHaveLength(16);
    expect(readdirSync(join(REPO_ROOT, A3GOVERNANCE_REL))).toHaveLength(7);
    expect(readdirSync(join(REPO_ROOT, A3EVIDENCE_REL))).toHaveLength(7);
  });

  it('places no R21 module in production or in an earlier namespace', () => {
    for (const rel of [A3PREP_REL, A3GOVERNANCE_REL, A3EVIDENCE_REL]) {
      for (const file of readdirSync(join(REPO_ROOT, rel))) {
        expect(file).not.toMatch(/documentSource|assemble|r20Drift/i);
      }
    }
    expect(existsSync(join(REPO_ROOT, 'src/orgunits/a3documents'))).toBe(false);
  });
});

describe('2D-A3 R21: the assembler reaches only what it is allowed to reach', () => {
  const ALLOWED_RELATIVE = new Set([
    './assemble.js',
    './census.js',
    './devTrain.js',
    './r20Drift.js',
    './refusal.js',
    './types.js',
    '../sd7/nearDuplicatePairs.js',
    '../a3prep/setRScore.js',
    '../a3prep/types.js',
    '../a3evidence/types.js',
    '../a3evidence/devTrain.js',
    '../a3evidence/census.js',
    '../a3governance/snapshot.js',
  ]);

  it('imports no bare module and only the permitted relative ones', () => {
    for (const file of A3DOCUMENTS_FILES) {
      for (const specifier of specifiersOf(code(file))) {
        expect(ALLOWED_RELATIVE.has(specifier), `${file} imports ${specifier}`).toBe(true);
      }
    }
  });

  it('holds no database, environment, filesystem, socket, provider or sealed capability', () => {
    const FORBIDDEN: readonly RegExp[] = [
      /\bfrom\s+['"]pg['"]|\bPool\b|\.query\(|SELECT\s|a3evidence\/database/,
      /process\.env|dotenv|config\/env|DATABASE_URL|createPool|withPool|src\/db\//,
      /node:fs|readFileSync|writeFileSync|node:child_process|execFile|spawn/,
      /node:net|node:tls|node:http|node:https|node:dns|\bfetch\s*\(/,
      /executeWebAttempt|\/gateway\.js|\/robots\.js|\/sitemap\.js|orgunits\/orchestrator\//,
      /orgunits\/web\/|orgunits\/signals\/|orgunits\/classify\//,
      /anthropic|openai|apollo|messages\.create\(/i,
      /SEALED_ROOT_BY_SPLIT|gen1-dev-confirm|gen1-final-holdout|-sealed|homedir/,
      /Date\.now\(|Math\.random\(|new Date\(/,
    ];
    for (const file of A3DOCUMENTS_FILES) {
      for (const pattern of FORBIDDEN) {
        expect(code(file), `${file} :: ${String(pattern)}`).not.toMatch(pattern);
      }
    }
  });

  it('never names DEV_CONFIRM or FINAL_HOLDOUT', () => {
    for (const file of A3DOCUMENTS_FILES) {
      expect(code(file), file).not.toMatch(/DEV_CONFIRM|FINAL_HOLDOUT/);
    }
  });
});

describe('2D-A3 R21 §40-§43: assembly ends before SD7 measurement and before any rank', () => {
  it('uses no classifier canonicalisation', () => {
    for (const file of A3DOCUMENTS_FILES) {
      expect(code(file), file).not.toMatch(
        /EXTRACTION_VERSION_REQUIRING_ASSEMBLY_CANONI|canonicaliseForClassifier|orgunits\/classify/,
      );
    }
  });

  it('measures no near-duplicate graph, tokenises nothing and walks no survivors', () => {
    for (const file of A3DOCUMENTS_FILES) {
      expect(code(file), file).not.toMatch(
        /measureNearDuplicateGraph|\bnearDuplicatePass\b|\bjaccard\b|\btokenise\b|normaliseForShingling|\bshingleSet\b|tokenShingles|survivor|a3prep\/sd7|a3prep\/sd9/,
      );
    }
    expect(code('assemble.ts')).toMatch(/\bexactDuplicatePass\(/);
  });

  it('calls R10 for scores and nothing that ranks, salts or caps', () => {
    for (const file of A3DOCUMENTS_FILES) {
      expect(code(file), file).not.toMatch(
        /rankSetPFull|rankSetRFull|salted|setPSd7|setRSd7|organisationCaps|a3prep\/rank|a3prep\/setP\.js|a3prep\/setR\.js|corpusFreezePreflight|manifestTypes|splitScope/,
      );
      expect(code(file), file).not.toMatch(/rankPosition|CORPUS_SALT|corpusSalt/);
    }
    expect(code('assemble.ts')).toMatch(/\bprepareSetRDocumentScore\(/);
  });

  it('sorts nothing and reimplements no numeric(8,4) parsing in the assembly path', () => {
    for (const file of ['assemble.ts', 'devTrain.ts']) {
      expect(code(file), file).not.toMatch(
        /\.sort\(|localeCompare|BigInt|parseFloat|Number\(|Math\.max/,
      );
    }
  });

  it('transforms no text', () => {
    for (const file of ['assemble.ts', 'devTrain.ts']) {
      expect(code(file), file).not.toMatch(
        /toLowerCase|toUpperCase|\.normalize\(|\.trim\(|\.replace\(|\.slice\(|\.substring\(|decodeURI|\.join\(/,
      );
    }
  });

  it('adds no text field to any public document shape', () => {
    expect(code('types.ts')).not.toMatch(/redactedMainText|\btext\s*:|\bsd7Text\s*:/);
    // The only text-bearing field is on the plain INPUT row, never an output.
    expect(code('types.ts').match(/mainText/g)).toHaveLength(1);
  });
});

describe('2D-A3 R21 §27: there is no minting backdoor', () => {
  it('exposes no bypass of any name', () => {
    for (const file of A3DOCUMENTS_FILES) {
      expect(code(file), file).not.toMatch(
        /unsafeMint|testOnlyMint|forceMint|skipR20Check|bypassAuthority|fromPlainObject|trustMe|__test/i,
      );
    }
  });

  it('brands with its own private WeakSets and WeakMaps, checked against R20 predicates', () => {
    const devTrain = code('devTrain.ts');
    expect(devTrain).toMatch(/new WeakSet<object>\(\)/);
    expect(devTrain).toMatch(/new WeakMap</);
    expect(devTrain).toMatch(/isA3DevTrainDurableEvidenceBatch\(/);
    expect(devTrain).toMatch(/isA3DurableAcquisitionEvidence\(/);
    expect(devTrain).toMatch(/governanceSnapshotForDurableEvidence\(/);
    expect(devTrain).toMatch(/durableEvidenceForReadyAuthority\(/);
    for (const file of A3DOCUMENTS_FILES.filter((f) => f !== 'devTrain.ts')) {
      expect(code(file), file).not.toMatch(/MINTED_SLOT_ASSEMBLIES|MINTED_BATCHES/);
    }
  });

  it('supports exactly one extraction rule version, as a constant', () => {
    expect(R21_SUPPORTED_EXTRACTION_RULE_VERSION_V1).toBe('orgunit-extraction-v2');
    for (const file of A3DOCUMENTS_FILES) {
      expect(code(file), file).not.toMatch(/orgunit-extraction-v[013-9]/);
    }
  });

  it('invents no new authority digest', () => {
    for (const file of A3DOCUMENTS_FILES) {
      expect(code(file), file).not.toMatch(
        /documentSourceBatchHash|documentCorpusHash|assemblyAuthorityHash|textRepresentationHash|createHash/,
      );
    }
  });
});

describe('2D-A3 R21: R19 and R20 are untouched', () => {
  it('leaves every frozen file byte-identical', () => {
    for (const [relative, expected] of Object.entries(R20_FROZEN_BYTES)) {
      expect(sha256(readFileSync(join(REPO_ROOT, relative))), relative).toBe(expected);
    }
  });

  it('still derives exactly the R19 governance census', () => {
    const snapshot = loadCanonicalA2GovernanceV1(REPO_ROOT);
    expect(snapshot.resolution.summary).toMatchObject({
      totalSlotCount: 110,
      readySlotCount: 23,
      unsuccessfulCurrentOccupantCount: 1,
      pendingAdjudicationCount: 0,
      noTerminalEvidenceCount: 86,
      reserveConsumedCount: 8,
      reserveUnusedCount: 32,
    });
  });
});

describe.skipIf(!baseAvailable)('2D-A3 R21: lineage and changed surface', () => {
  it('descends from the exact canonical R20 tip', () => {
    expect(() => git('merge-base', '--is-ancestor', R20_TERMINAL, 'HEAD')).not.toThrow();
    expect(() => git('merge-base', '--is-ancestor', R20_SCOPE_PIN_COMMIT, 'HEAD')).not.toThrow();
  });

  it('pinned R20 scope in exactly one commit that touched exactly one file', () => {
    expect(lines(git('diff', '--name-only', R20_TERMINAL, R20_SCOPE_PIN_COMMIT))).toEqual([
      R20_ISOLATION_TEST,
    ]);
    // Nothing edited R20's test after the pin.
    expect(sha256(readFileSync(join(REPO_ROOT, R20_ISOLATION_TEST)))).toBe(
      sha256(git('show', `${R20_SCOPE_PIN_COMMIT}:${R20_ISOLATION_TEST}`)),
    );
  });

  it('changes nothing outside its own namespace, tests and records', () => {
    const paths = [
      ...new Set([
        ...lines(git('diff', '--name-only', R20_TERMINAL)),
        ...lines(git('ls-files', '--others', '--exclude-standard')),
      ]),
    ];
    const permitted = (path: string): boolean =>
      path.startsWith(`${A3DOCUMENTS_REL}/`) ||
      path === 'src/test/unit/orgunitCorpus2DA3DocumentSourceAssembly.test.ts' ||
      path === 'src/test/unit/orgunitCorpus2DA3DocumentSourceIsolation.test.ts' ||
      path === R20_ISOLATION_TEST ||
      path === R21_CENSUS_PATH ||
      path === R21_AUDIT_PATH;
    expect(paths.filter((path) => !permitted(path))).toEqual([]);
  });
});

/** §46. The committed census discloses no identity; active as soon as it exists. */
describe.skipIf(!existsSync(join(REPO_ROOT, R21_CENSUS_PATH)))(
  '2D-A3 R21: the public census discloses nothing',
  () => {
    const raw = existsSync(join(REPO_ROOT, R21_CENSUS_PATH))
      ? readFileSync(join(REPO_ROOT, R21_CENSUS_PATH), 'utf8')
      : '{}';
    const payload = (() => {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      delete parsed['identityDisclosure'];
      delete parsed['whatThisIsNot'];
      return JSON.stringify(parsed, null, 2);
    })();

    it('is the derived census record, and authorises nothing', () => {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      expect(parsed['record']).toBe(R21_PUBLIC_CENSUS_RECORD_KIND);
      expect(parsed['thisFileAuthorises']).toEqual([]);
      expect(parsed['split']).toBe('DEV_TRAIN');
    });

    it('carries no identity-bearing key', () => {
      const FORBIDDEN_KEYS = [
        'selectionIndex',
        'selectionIndices',
        'reserveRankPosition',
        'organisationId',
        'echeRowKey',
        'runId',
        'runRef',
        'runRefSha256',
        'fetchObservationId',
        'pageEvidenceId',
        'sourcePageEvidenceIds',
        'candidateId',
        'documentSha256',
        'responseSha256',
        'requestedUrl',
        'requestedHost',
        'registrableDomain',
        'rootKey',
        'title',
        'headings',
        'declaredLang',
        'mainText',
        'candidateScore',
        'candidateScoreDecimal',
        'resolvedScoreDecimal',
        'signals',
        'sealed',
      ];
      for (const key of FORBIDDEN_KEYS) {
        expect(payload, key).not.toMatch(new RegExp(`"${key}"`, 'i'));
      }
    });

    it('declares every identity class absent', () => {
      const parsed = JSON.parse(raw) as { identityDisclosure?: Record<string, unknown> };
      const declared = parsed.identityDisclosure ?? {};
      expect(Object.keys(declared).length).toBeGreaterThanOrEqual(15);
      for (const [key, value] of Object.entries(declared)) expect(value, key).toBe(false);
    });

    it('carries no bare digest, uuid, url, host or score value', () => {
      expect(raw).not.toMatch(/https?:\/\//);
      expect(raw).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      expect(raw).not.toMatch(/\b[0-9a-f]{64}\b/);
      expect(raw).not.toMatch(/-?\d+\.\d{4}\b/);
    });

    it('invents no new authority digest', () => {
      expect(raw).not.toMatch(
        /documentSourceBatchHash|documentCorpusHash|assemblyAuthorityHash|textRepresentationHash/i,
      );
    });

    it('declares zero SQL, zero writes and zero non-DEV_TRAIN reads', () => {
      const parsed = JSON.parse(raw) as { access?: Record<string, unknown> };
      expect(parsed.access).toEqual({
        r21SqlStatements: 0,
        databaseAccessOnlyThroughCanonicalR20: true,
        databaseWrites: 0,
        institutionNetworkRequests: 0,
        sealedRootReads: 0,
        nonDevTrainEvidenceReads: 0,
      });
    });
  },
);
