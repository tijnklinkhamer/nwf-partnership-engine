/**
 * PHASE 2B-2D A3 R24 ISOLATION — `a3readiness/` INTERPRETS AN R23 MINT, AND NOTHING MORE.
 *
 * R24 lives in an EIGHTH sibling namespace, beside `a3prep/` (the frozen
 * R1-R17 methodology layer), `a3governance/` (R19), `a3evidence/` (R20),
 * `a3documents/` (R21), `a3graphs/` (R22) and `a3samples/` (R23). This file
 * proves:
 *
 *   - `a3readiness/` imports only R23's mint predicates, provenance helpers,
 *     types and census type, R22's types, R19's snapshot type, R20's split
 *     constant, the canonical SET_P readiness and SD9 envelope helper, SET_R
 *     readiness structure, and frozen contract constants - no database, no
 *     environment, no filesystem, no socket, no provider, no classifier, no
 *     label;
 *   - it calls `deriveSetPFreezeSlotReadiness` once and
 *     `deriveSd9BoundsUnderShortTextPolicy` once (per sample), and never
 *     `deriveSetRFreezeSlotReadiness`, `evaluateSd9FromExactPostSd7Count`,
 *     `evaluateSd9FromAdmissiblePostSd7Bounds`, a complete-corpus freeze gate,
 *     SD4 / K4 or an extension;
 *   - SD9 is fed ONLY from `sd7Preparation.counts`, never a cap length;
 *   - it slices no cap, sorts nothing but drift field names, and hashes nothing;
 *   - it has no minting backdoor and invents no authority digest;
 *   - every earlier namespace, census, audit and the canonical SD7 modules are
 *     byte-identical to R23;
 *   - the only pre-existing file R24 touched is R23's historical scope pin;
 *   - the committed R24 census discloses no identity.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { R24_PUBLIC_CENSUS_RECORD_KIND } from '../harness/phase2b2d/a3readiness/census.js';
import { loadCanonicalA2GovernanceV1 } from '../harness/phase2b2d/a3governance/snapshot.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const A3PREP_REL = 'src/test/harness/phase2b2d/a3prep';
const A3GOVERNANCE_REL = 'src/test/harness/phase2b2d/a3governance';
const A3EVIDENCE_REL = 'src/test/harness/phase2b2d/a3evidence';
const A3DOCUMENTS_REL = 'src/test/harness/phase2b2d/a3documents';
const A3GRAPHS_REL = 'src/test/harness/phase2b2d/a3graphs';
const A3SAMPLES_REL = 'src/test/harness/phase2b2d/a3samples';
const A3READINESS_REL = 'src/test/harness/phase2b2d/a3readiness';
const SD7_REL = 'src/test/harness/phase2b2d/sd7';

/** The exact canonical R23 tip R24 was cut from. */
const R23_TERMINAL = '45df08e7133f859e57086f2cc2a44d6b5ed584d6';

/** The one commit that pinned R23's own changed-surface test to its range. */
const R23_SCOPE_PIN_COMMIT = 'd3cb425ac0cf7400e67f72e238e3a28cda4d2bb5';
const R23_ISOLATION_TEST = 'src/test/unit/orgunitCorpus2DA3SampleSurvivorIsolation.test.ts';

const R24_CENSUS_PATH =
  'docs/evaluation/PHASE_2B_2D_A3_R24_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_READINESS_CENSUS_V1.json';
const R24_AUDIT_PATH =
  'docs/audits/PHASE_2B_2D_A3_R24_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_READINESS_V1.md';

const A3READINESS_FILES = [
  'census.ts',
  'devTrain.ts',
  'membership.ts',
  'r23Drift.ts',
  'refusal.ts',
  'types.ts',
];

/** Everything R24 builds on, as R23 left it. */
const R23_FROZEN_BYTES: Readonly<Record<string, string>> = {
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
  [`${A3DOCUMENTS_REL}/assemble.ts`]:
    '062da3fdcb9013b8e90741478b398c217f58a1da6ffcf5ceeb3d640ce45cb1af',
  [`${A3DOCUMENTS_REL}/census.ts`]:
    'ebffcae2b9a5840e1a087d94e59e7d9fbe7463a357a36716b1dd33eb467e94ef',
  [`${A3DOCUMENTS_REL}/devTrain.ts`]:
    'd962748b397f9c0e62da4d9e7aa649d5f47ea109fd5d4ff16b70afc3ce6f1ad1',
  [`${A3DOCUMENTS_REL}/r20Drift.ts`]:
    '0750310eaf1f44ed18f27132964ae3a261870bc276a7f0cefaca57f9c6d934ae',
  [`${A3DOCUMENTS_REL}/refusal.ts`]:
    'e62a186837302ff0836b794934c28e0f5cf6e643490d13de22b3439258825aca',
  [`${A3DOCUMENTS_REL}/types.ts`]:
    'ed497379c839dde668862baa785c9abc8f8c39ca4a355e73b97f12e48c3d859f',
  [`${A3GRAPHS_REL}/census.ts`]: '2c8c4c27ef2c8f102703889faf2f874bfc120bdc6ddb534abaaeb4a281417659',
  [`${A3GRAPHS_REL}/devTrain.ts`]:
    'b013669bb6da9cb296053ac123c0704b36166a6c4a52f63ff2bcd0831da16954',
  [`${A3GRAPHS_REL}/measure.ts`]:
    'bde8456bdb60c348af6affe81da9e631417e41921bf12b3029fe1612367d0dad',
  [`${A3GRAPHS_REL}/r21Drift.ts`]:
    '17962adc0c61986e0d09106a78af72db3d2c2b18286e7f30f05dc7be63d59c05',
  [`${A3GRAPHS_REL}/refusal.ts`]:
    '4a7b437b37a6ab225f082742a4f500d22050f457025fa46abc91e5097a566ec3',
  [`${A3GRAPHS_REL}/types.ts`]: '5a40dcb749e26b20eae8a5d75af7260a8407f29dfc89fd93b6849021ddb2def3',
  [`${A3SAMPLES_REL}/census.ts`]:
    '2e24cef96a722a1d0d57c0eb5e4aeecf73001963c87f59db4570a209834250e3',
  [`${A3SAMPLES_REL}/devTrain.ts`]:
    '0004b604c2763575431e89c97e3a6d69431da04b2427ab50c74b8d7a48557d46',
  [`${A3SAMPLES_REL}/prepare.ts`]:
    'ac9f2af750d353cbe5faa9a2b67421fca7b66ebbfd0cfeffec9f93401ed4650b',
  [`${A3SAMPLES_REL}/r22Drift.ts`]:
    '05db549ae1fcde298143ed9bdb3217328ef6190f717906ac5a36199deac2ffbe',
  [`${A3SAMPLES_REL}/refusal.ts`]:
    '49a4bee4a2baacd7b50d32b2e4895ee5097287aab53339c7357ff40cdc4e6cef',
  [`${A3SAMPLES_REL}/types.ts`]: '08e67b9ea18a67e88894502490c5234572051d12228cfe292d3e32102b55c329',
  [`${SD7_REL}/nearDuplicatePairs.ts`]:
    '1851726bb28789791d96e0cd27532846e6a503b234a5813bec70782e6e078371',
  [`${SD7_REL}/normaliseText.ts`]:
    'b518e2ab02eb9284c56a5c0172f79480a8fd110f7433f502fe3e619a3846df90',
  [`${SD7_REL}/tokenShingles.ts`]:
    '3a56ac6c9eea4dd70c66ea1d2965b323b38b21883103d7b1b4d0a646c9548b0f',
  [`${SD7_REL}/jaccard.ts`]: 'd086b5cd789b7877ddce962469839c8d7cbdf86412568962d42b04451529a930',
  [`${SD7_REL}/sd7Contract.ts`]: '882dad5e990cf40ff326b5fecea3e691720b6d8214f02bf4629ab6fefd2b0f60',
  'docs/audits/PHASE_2B_2D_A3_R21_DEV_TRAIN_DOCUMENT_SOURCE_ASSEMBLY_V1.md':
    '2513350f69816cfeb6d5e3dfb9c8d8bd9d6b0728eb38c94045641d8c34ffc911',
  'docs/audits/PHASE_2B_2D_A3_R22_DEV_TRAIN_SD7_GRAPH_MEASUREMENT_V1.md':
    '32e549989c8e8d5da74d6ff24d68087bb4b919681cad6651498f4b70be758f13',
  'docs/audits/PHASE_2B_2D_A3_R23_DEV_TRAIN_SAMPLE_SURVIVOR_PREPARATION_V1.md':
    '0ab8f24113c68d251932d322fb729cde74e2120eb45182a0d058ebb75a7dc658',
  'docs/evaluation/PHASE_2B_2D_A3_R19_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V1.json':
    '273962e48057fcfeb948e37870ccea1650776f0c8ff7a07c764400b493c13a1f',
  'docs/evaluation/PHASE_2B_2D_A3_R20_DEV_TRAIN_DURABLE_EVIDENCE_BINDING_CENSUS_V1.json':
    '8e15c65a1673a9540fb85b1dbc7583b8b7925e4f788ecbce50b053c43fd05102',
  'docs/evaluation/PHASE_2B_2D_A3_R21_DEV_TRAIN_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1.json':
    '7aaad302dba31d7a8fa7e053fd110342d9ef1b1f3dadf1a107dc9e68bc398b54',
  'docs/evaluation/PHASE_2B_2D_A3_R22_DEV_TRAIN_SD7_GRAPH_MEASUREMENT_CENSUS_V1.json':
    'c4328be481281d5aa5a2c051f6cf4dd8a53c718bb7067a718478f0ac8819b09f',
  'docs/evaluation/PHASE_2B_2D_A3_R23_DEV_TRAIN_SAMPLE_SURVIVOR_PREPARATION_CENSUS_V1.json':
    'f5468dcb9e0f189d297a8fc9bfad3343bf87edef1e02e1461d0456f80997805a',
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
  return stripComments(readFileSync(join(REPO_ROOT, A3READINESS_REL, file), 'utf8'));
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

function allCode(): string {
  return A3READINESS_FILES.map(code).join('\n');
}

const baseAvailable = commitExists(R23_TERMINAL) && commitExists(R23_SCOPE_PIN_COMMIT);

// ---------------------------------------------------------------------------

describe('2D-A3 R24 §7: the new namespace is exactly these files', () => {
  it('holds the six readiness modules and no synthetic fixture', () => {
    expect(readdirSync(join(REPO_ROOT, A3READINESS_REL)).sort()).toEqual(A3READINESS_FILES);
  });

  it('leaves every earlier namespace at its file count', () => {
    expect(readdirSync(join(REPO_ROOT, A3PREP_REL))).toHaveLength(16);
    expect(readdirSync(join(REPO_ROOT, A3GOVERNANCE_REL))).toHaveLength(7);
    expect(readdirSync(join(REPO_ROOT, A3EVIDENCE_REL))).toHaveLength(7);
    expect(readdirSync(join(REPO_ROOT, A3DOCUMENTS_REL))).toHaveLength(6);
    expect(readdirSync(join(REPO_ROOT, A3GRAPHS_REL))).toHaveLength(6);
    expect(readdirSync(join(REPO_ROOT, A3SAMPLES_REL))).toHaveLength(6);
  });

  it('places no R24 module in production or in an earlier namespace', () => {
    for (const rel of [
      A3PREP_REL,
      A3GOVERNANCE_REL,
      A3EVIDENCE_REL,
      A3DOCUMENTS_REL,
      A3GRAPHS_REL,
      A3SAMPLES_REL,
    ]) {
      for (const file of readdirSync(join(REPO_ROOT, rel))) {
        expect(file).not.toMatch(/membership|r23Drift|reachable/i);
      }
    }
    expect(existsSync(join(REPO_ROOT, 'src/orgunits/a3readiness'))).toBe(false);
  });
});

describe('2D-A3 R24 §8: the readiness binder reaches only what it is allowed to reach', () => {
  const ALLOWED_RELATIVE = new Set([
    './census.js',
    './devTrain.js',
    './membership.js',
    './r23Drift.js',
    './refusal.js',
    './types.js',
    '../a3prep/contracts.js',
    '../a3prep/corpusFreezePreflight.js',
    '../a3prep/sd7.js',
    '../a3prep/setPSd7.js',
    '../a3prep/setRSd7.js',
    '../a3prep/setRSd7Readiness.js',
    '../a3prep/types.js',
    '../a3samples/devTrain.js',
    '../a3samples/types.js',
    '../a3samples/census.js',
    '../a3graphs/types.js',
    '../a3governance/snapshot.js',
    '../a3evidence/types.js',
  ]);

  it('imports no bare module and only the permitted relative ones', () => {
    for (const file of A3READINESS_FILES) {
      for (const specifier of specifiersOf(code(file))) {
        expect(ALLOWED_RELATIVE.has(specifier), `${file} imports ${specifier}`).toBe(true);
      }
    }
  });

  it('imports only types from R19, R22 and R23 types, and never R23 composition', () => {
    for (const file of A3READINESS_FILES) {
      const source = code(file);
      expect(source, file).not.toMatch(/import\s*\{[^}]*\}\s*from\s*'\.\.\/a3governance\//);
      expect(source, file).not.toMatch(/import\s*\{[^}]*\}\s*from\s*'\.\.\/a3graphs\//);
      expect(source, file).not.toMatch(/a3samples\/(prepare|r22Drift|refusal)/);
      expect(source, file).not.toMatch(/a3evidence\/(devTrain|database|integrity|runMatch)/);
      expect(source, file).not.toMatch(/a3graphs\/(measure|devTrain)|a3documents\//);
    }
    for (const m of allCode().matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\.\/a3prep\/sd7\.js'/g)) {
      expect((m[1] ?? '').trim()).toBe('SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED');
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
      /console\.|process\.stdout|process\.stderr/,
    ];
    for (const file of A3READINESS_FILES) {
      for (const pattern of FORBIDDEN) {
        expect(code(file), `${file} :: ${String(pattern)}`).not.toMatch(pattern);
      }
    }
  });

  it('never names DEV_CONFIRM or FINAL_HOLDOUT', () => {
    for (const file of A3READINESS_FILES) {
      expect(code(file), file).not.toMatch(/DEV_CONFIRM|FINAL_HOLDOUT/);
    }
  });

  it('reads no label, gold, semantic class, hard negative or classifier result', () => {
    for (const specifier of A3READINESS_FILES.flatMap((file) => specifiersOf(code(file)))) {
      expect(specifier).not.toMatch(/label|gold|semantic|classif|hardNegative/i);
    }
    for (const file of A3READINESS_FILES.filter((f) => f !== 'census.ts')) {
      expect(code(file), file).not.toMatch(
        /\blabels?\b|\bgold\b|semanticClass|hardNegative|hard_negative|classifierResult|classifier\//i,
      );
    }
  });
});

describe('2D-A3 R24 §11/§12/§19-§22/§51: canonical readiness and SD9, called and never reimplemented', () => {
  it('calls deriveSetPFreezeSlotReadiness exactly once, in membership.ts only', () => {
    for (const file of A3READINESS_FILES) {
      const calls = code(file).match(/\bderiveSetPFreezeSlotReadiness\(/g) ?? [];
      expect(calls.length, file).toBe(file === 'membership.ts' ? 1 : 0);
    }
    expect(code('membership.ts')).toMatch(
      /deriveSetPFreezeSlotReadiness\(\{\s*selectionIndex: slot\.selectionIndex as A3SelectionIndex,\s*split: R20_EVIDENCE_SPLIT_V1,\s*preparation: slot\.setP,\s*\}\)/,
    );
  });

  it('never re-derives SET_R readiness or cap', () => {
    expect(allCode()).not.toMatch(/deriveSetRFreezeSlotReadiness|determineSetRDocumentCap/);
  });

  it('has exactly one SD9 route: the canonical short-text envelope helper', () => {
    for (const file of A3READINESS_FILES) {
      const calls = code(file).match(/\bderiveSd9BoundsUnderShortTextPolicy\(/g) ?? [];
      expect(calls.length, file).toBe(file === 'membership.ts' ? 1 : 0);
    }
    expect(allCode()).not.toMatch(
      /evaluateSd9FromExactPostSd7Count|evaluateSd9FromAdmissiblePostSd7Bounds|a3prep\/sd9\.js/,
    );
  });

  it('§50 feeds SD9 only from sd7Preparation.counts, never from a cap length', () => {
    const membership = code('membership.ts');
    const call = membership.match(/deriveSd9BoundsUnderShortTextPolicy\(\{([^}]*)\}\)/);
    expect(call).not.toBeNull();
    const args = call?.[1] ?? '';
    expect(args).toMatch(
      /measurableSurvivorMin: preparation\.sd7Preparation\.counts\.measurableSurvivorCount,/,
    );
    expect(args).toMatch(
      /measurableSurvivorMax: preparation\.sd7Preparation\.counts\.measurableSurvivorCount,/,
    );
    expect(args).toMatch(
      /shortTextUnresolvedCount: preparation\.sd7Preparation\.counts\.shortTextUnresolvedCount,/,
    );
    expect(args).not.toMatch(/documents|documentCount|MAX_PAGES|CapSize|\b8\b|\b4\b/);
    expect(allCode()).not.toMatch(
      /\.documentCap\.documents\.length|\.setRDocumentCap\.documents\.length/,
    );
  });

  it('§35/§52 never calls a complete-corpus freeze gate, SD4 / K4 or an extension', () => {
    expect(allCode()).not.toMatch(
      /checkSetPShortTextCorpusFreezeGate|checkSetRShortTextCorpusFreezeGate|checkCurrentA3CorpusFreezePreflight|deriveCurrentOwnerDecisionBlockers|solveOrganisationShareGreatestFixedPoint|applyOrganisationSharePrefixRetention|deriveK4FreezeReadiness|organisationCaps|checkSetPExtensionCursorAgainstShortTextBoundary|checkSetRExtensionCursorAgainstShortTextBoundary|manifestTypes|splitScope|slotAuthority/,
    );
  });

  it('§15 never ranks, walks survivors, slices, sorts or hashes', () => {
    expect(allCode()).not.toMatch(
      /rankSetPFull|rankSetRFull|selectSetPOrganisationCap|prepareSd7SampleSurvivors|prepareSetPSd7|prepareSetRSd7|prepareSetRDocumentScore|a3prep\/(setP|setR|rank|setRScore)\.js/,
    );
    // r23Drift.ts sorts census FIELD NAMES for a stable diff, and nothing else.
    expect(code('r23Drift.ts').match(/\.sort\(/g) ?? []).toHaveLength(1);
    expect(code('r23Drift.ts')).toMatch(/\[\.\.\.keys\]\.sort\(\)/);
    for (const file of A3READINESS_FILES) {
      const source =
        file === 'r23Drift.ts' ? code(file).replace('[...keys].sort()', '') : code(file);
      expect(source, file).not.toMatch(
        /createHash|\.slice\(|\.splice\(|\.sort\(|localeCompare|SET_P_V2_R2|SET_R_V2_R2|resolvedScore|candidateScore|scoreDecimal/,
      );
    }
  });

  it('hardcodes no cap or threshold literal in its logic', () => {
    expect(code('membership.ts')).not.toMatch(/\b8\b|\b4\b/);
    expect(code('membership.ts')).toMatch(/SET_P_MAX_PAGES_PER_ORGANISATION/);
    expect(code('membership.ts')).toMatch(/SET_R_MAX_PAGES_PER_ORGANISATION/);
  });

  it('§18 binds the owner policy object by reference', () => {
    expect(code('membership.ts')).toMatch(
      /const policy = SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY;/,
    );
  });

  it('§27 gives the BLOCKED membership type no documents field', () => {
    const types = code('types.ts');
    const blocked = types.match(/interface A3ReachableMembershipBlocked[^{]*\{([^}]*)\}/);
    expect(blocked).not.toBeNull();
    expect(blocked?.[1] ?? '').not.toMatch(/documents|documentCount/);
    expect(types).not.toMatch(/documents\?:/);
  });

  it('adds no score, edge or text field to any readiness shape', () => {
    expect(code('types.ts')).not.toMatch(
      /mainText|\btext\s*:|\bscore\s*:|\bscores\s*:|\bedges\s*:|\bgraph\s*:/,
    );
  });
});

describe('2D-A3 R24 §39/§42: there is no minting backdoor', () => {
  it('exposes no bypass of any name', () => {
    for (const file of A3READINESS_FILES) {
      expect(code(file), file).not.toMatch(
        /unsafeMint|testOnlyMint|forceMint|skipR23Check|bypassAuthority|fromPlainObject|trustMe|__test/i,
      );
    }
  });

  it('brands with its own private WeakSets and WeakMaps, checked against R23 predicates', () => {
    const devTrain = code('devTrain.ts');
    expect(devTrain).toMatch(/new WeakSet<object>\(\)/);
    expect(devTrain).toMatch(/new WeakMap</);
    expect(devTrain).toMatch(/isA3DevTrainSampleSurvivorBatch\(/);
    expect(devTrain).toMatch(/isA3DevTrainSlotSampleSurvivorPreparation\(/);
    expect(devTrain).toMatch(/graphBatchForSampleSurvivorBatch\(/);
    expect(devTrain).toMatch(/governanceSnapshotForSampleSurvivorBatch\(/);
    expect(devTrain).toMatch(/slotGraphForSlotSamplePreparation\(/);
    expect(devTrain).toMatch(/slotSamplePreparationForSlotGraph\(/);
    for (const file of A3READINESS_FILES.filter((f) => f !== 'devTrain.ts')) {
      expect(code(file), file).not.toMatch(/MINTED_SLOT_READINESS|MINTED_READINESS_BATCHES/);
    }
  });

  it('invents no new authority digest', () => {
    for (const file of A3READINESS_FILES) {
      expect(code(file), file).not.toMatch(
        /reachableMembershipHash|sd9ReadinessHash|sampleMembershipHash|readinessBatchHash|createHash/,
      );
    }
  });
});

describe('2D-A3 R24 §6: R19-R23 and canonical SD7 are untouched', () => {
  it('leaves every frozen file byte-identical', () => {
    for (const [relative, expected] of Object.entries(R23_FROZEN_BYTES)) {
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

describe.skipIf(!baseAvailable)('2D-A3 R24: lineage and changed surface', () => {
  it('descends from the exact canonical R23 tip', () => {
    expect(() => git('merge-base', '--is-ancestor', R23_TERMINAL, 'HEAD')).not.toThrow();
    expect(() => git('merge-base', '--is-ancestor', R23_SCOPE_PIN_COMMIT, 'HEAD')).not.toThrow();
  });

  it('pinned R23 scope in exactly one commit that touched exactly one file', () => {
    expect(lines(git('diff', '--name-only', R23_TERMINAL, R23_SCOPE_PIN_COMMIT))).toEqual([
      R23_ISOLATION_TEST,
    ]);
    // Nothing edited R23's test after the pin.
    expect(sha256(readFileSync(join(REPO_ROOT, R23_ISOLATION_TEST)))).toBe(
      sha256(git('show', `${R23_SCOPE_PIN_COMMIT}:${R23_ISOLATION_TEST}`)),
    );
  });

  it('changes nothing outside its own namespace, tests and records', () => {
    const paths = [
      ...new Set([
        ...lines(git('diff', '--name-only', R23_TERMINAL)),
        ...lines(git('ls-files', '--others', '--exclude-standard')),
      ]),
    ];
    const permitted = (path: string): boolean =>
      path.startsWith(`${A3READINESS_REL}/`) ||
      path === 'src/test/unit/orgunitCorpus2DA3ReachableMembershipSd9Readiness.test.ts' ||
      path === 'src/test/unit/orgunitCorpus2DA3ReachableMembershipSd9Isolation.test.ts' ||
      path === R23_ISOLATION_TEST ||
      path === R24_CENSUS_PATH ||
      path === R24_AUDIT_PATH;
    expect(paths.filter((path) => !permitted(path))).toEqual([]);
  });
});

/** §56. The committed census discloses no identity; active as soon as it exists. */
describe.skipIf(!existsSync(join(REPO_ROOT, R24_CENSUS_PATH)))(
  '2D-A3 R24: the public census discloses nothing',
  () => {
    const raw = existsSync(join(REPO_ROOT, R24_CENSUS_PATH))
      ? readFileSync(join(REPO_ROOT, R24_CENSUS_PATH), 'utf8')
      : '{}';
    const payload = (() => {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      delete parsed['identityDisclosure'];
      delete parsed['whatThisIsNot'];
      return JSON.stringify(parsed, null, 2);
    })();

    it('is the derived census record, and authorises nothing', () => {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      expect(parsed['record']).toBe(R24_PUBLIC_CENSUS_RECORD_KIND);
      expect(parsed['recordKind']).toBe(
        'PUBLIC_AGGREGATE_ONLY_REACHABLE_MEMBERSHIP_SD9_READINESS_CENSUS',
      );
      expect(parsed['thisFileAuthorises']).toEqual([]);
      expect(parsed['split']).toBe('DEV_TRAIN');
    });

    it('carries no identity-, position-, score-, per-slot- or membership-bearing key', () => {
      const FORBIDDEN_KEYS = [
        'selectionIndex',
        'selectionIndices',
        'reserveRankPosition',
        'organisationId',
        'echeRowKey',
        'runId',
        'runRef',
        'runRefSha256',
        'pageEvidenceId',
        'sourcePageEvidenceIds',
        'candidateId',
        'documentSha256',
        'saltedRankSha256',
        'rankPosition',
        'sourceRankPosition',
        'survivorRankPosition',
        'firstBlockedSourceRankPosition',
        'exactMeasurableSurvivorPrefixCount',
        'documents',
        'membership',
        'edges',
        'similarity',
        'requestedUrl',
        'requestedHost',
        'rootKey',
        'title',
        'headings',
        'mainText',
        'text',
        'score',
        'candidateScore',
        'resolvedScore',
        'signals',
        'label',
        'sealed',
        'perSlot',
        'slots',
        'status',
        'minCount',
        'maxCount',
      ];
      for (const key of FORBIDDEN_KEYS) {
        expect(payload, key).not.toMatch(new RegExp(`"${key}"`, 'i'));
      }
    });

    it('declares every identity class absent', () => {
      const parsed = JSON.parse(raw) as { identityDisclosure?: Record<string, unknown> };
      const declared = parsed.identityDisclosure ?? {};
      expect(Object.keys(declared).length).toBeGreaterThanOrEqual(26);
      for (const [key, value] of Object.entries(declared)) expect(value, key).toBe(false);
    });

    it('carries no bare digest, uuid, url, host, email or fractional value', () => {
      expect(raw).not.toMatch(/https?:\/\//);
      expect(raw).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      expect(raw).not.toMatch(/\b[0-9a-f]{64}\b/);
      expect(raw).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
      expect(raw).not.toMatch(/\b[a-z0-9-]+\.(fr|com|org|eu|edu|net|de|es|it|nl|be)\b/i);
      expect(raw).not.toMatch(/-?\d+\.\d+/);
    });

    it('invents no new authority digest', () => {
      expect(raw).not.toMatch(
        /reachableMembershipHash|sd9ReadinessHash|sampleMembershipHash|readinessBatchHash/i,
      );
    });

    it('records the owner-bound tokens, the cap constants and every negative semantic', () => {
      const parsed = JSON.parse(raw) as {
        canonicalConstants?: Record<string, unknown>;
        semantics?: Record<string, unknown>;
      };
      expect(parsed.canonicalConstants).toMatchObject({
        setPMaxPagesPerOrganisation: 8,
        setRMaxPagesPerOrganisation: 4,
        sd9MinPagesPerOrganisation: 4,
        reachableMembershipDecisionToken:
          'SHORT_TEXT_REQUIRED_SAMPLE_MEMBERSHIP_LIMITED_TO_REACHABLE_CAPPED_MEMBERSHIP_V1',
        requiredMembershipScope: 'REACHABLE_SELECTED_CAPPED_MEMBERSHIP',
        zeroExtensionHeadroomScope:
          'ZERO_EXTENSION_HEADROOM_SELECTED_CAP_IS_COMPLETE_REACHABLE_SAMPLE_MEMBERSHIP',
        unreachableTailFreezeEffect: 'DOES_NOT_REFUSE_FREEZE_BY_ITSELF',
      });
      expect(parsed.semantics).toEqual({
        reachableMembershipScopeOwnerBound: true,
        initialCapUsedAsReachableMembershipOnlyWhenCanonicalExact: true,
        blockedCapMembershipInvented: false,
        unreachableShortTextTailResolved: false,
        fullRankExactnessRequiredForExactReachableCap: false,
        setRReadinessRederived: false,
        capSliced: false,
        sd9UsesSurvivorEnvelopeNotCapCount: true,
        sd9MechanicalOnly: true,
        sd9SamplesForcedToAgree: false,
        a2AcquisitionStatusChanged: false,
        replacementDecisionMade: false,
        extensionPerformed: false,
        completeCorpusPreflightRun: false,
        sd4Applied: false,
        k4Applied: false,
        labelsRead: false,
        classifierCalled: false,
        finalDevTrainCorpusMaterialised: false,
      });
    });

    it('declares zero SQL, zero writes and zero non-DEV_TRAIN reads', () => {
      const parsed = JSON.parse(raw) as { access?: Record<string, unknown> };
      expect(parsed.access).toEqual({
        r24SqlStatements: 0,
        databaseAccessOnlyThroughCanonicalR20: true,
        databaseWrites: 0,
        institutionNetworkRequests: 0,
        sealedRootReads: 0,
        nonDevTrainEvidenceReads: 0,
      });
    });
  },
);
