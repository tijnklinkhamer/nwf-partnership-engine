/**
 * PHASE 2B-2D A3 R31 — ISOLATION OF THE COMMITTED GOVERNANCE SNAPSHOT V3.
 *
 * By reading source text, the repository's own history and the committed
 * records, this file proves:
 *
 *   - R31 lives in the NEW sibling namespace `a3governanceV3/`, and every
 *     earlier A3 namespace (a3prep, V1 and V2 governance, every R20-R30
 *     namespace) and canonical `sd7/` is byte-identical to the canonical R30
 *     tip, file by pinned file;
 *   - every R19-R30 public census and audit is unchanged;
 *   - the only pre-existing file R31 touched is R30's historical scope pin;
 *   - no DB, network, provider, classifier, sealed-root, filesystem or
 *     second-git-layer capability exists in the namespace: git is reached
 *     ONLY through R25's frozen commit-addressed primitives;
 *   - R17 is called, not reimplemented, and R26 is reached only through its
 *     PURE comparator - never its binder, never its snapshot-typed delta;
 *   - nothing here can write to A2, plan A2 or decide A2's P6 boundary;
 *   - the committed R31 census discloses no identity.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { R31_PUBLIC_CENSUS_RECORD_KIND } from '../harness/phase2b2d/a3governanceV3/census.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const HARNESS = 'src/test/harness/phase2b2d';
const A3GOVERNANCE_V3_REL = `${HARNESS}/a3governanceV3`;

/** The exact canonical R30 tip R31 was cut from. */
const R30_TERMINAL = 'fb1ddd9bcec4250e56cc10eb3e6d32d239ef2ca3';

/** The one commit that pinned R30's own changed-surface test to its range. */
const R30_SCOPE_PIN_COMMIT = '6ce777f0b9813f2b738926f57356f3f25293300f';
const R30_ISOLATION_TEST =
  'src/test/unit/orgunitCorpus2DA3ReachableMembershipSd9V2Isolation.test.ts';

/** The exact A2 checkpoint Registry V3 describes, and the A2 commits leading to it. */
const A2_COMMITS = [
  '58f756453bdc19168b584b5994379e05f0281781',
  'bb64cc6e851b4e9c9a5d8c1f2d73620ac71c2108',
  '3eb2733ccceea9db6eace652eae3000a91f759d4',
  '24ac76326284e4acedeebd187bf054396d2dcd6c',
  'd63a0274c756ac26a5e42823ceac7465e1ff427d',
  '34174f92d1c80dc12b5027181a441339dd71408d',
  'f76b8ae6653f1f8ec9dabd2d7eec3922c2e000f1',
];

const R31_TESTS = [
  'src/test/unit/orgunitCorpus2DA3GovernanceV3CommitLoader.test.ts',
  'src/test/unit/orgunitCorpus2DA3GovernanceV3Resolution.test.ts',
  'src/test/unit/orgunitCorpus2DA3GovernanceV3Isolation.test.ts',
];
const R31_CENSUS_PATH =
  'docs/evaluation/PHASE_2B_2D_A3_R31_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V3.json';
const R31_AUDIT_PATH = 'docs/audits/PHASE_2B_2D_A3_R31_COMMITTED_GOVERNANCE_SNAPSHOT_V3_V1.md';

const A3GOVERNANCE_V3_FILES = [
  'census.ts',
  'commitLoaderV3.ts',
  'devTrainContinuity.ts',
  'familiesV3.ts',
  'refusal.ts',
  'registryV3.ts',
  'resolveV3.ts',
  'snapshotV3.ts',
];

/** Namespaces R31 must leave byte-identical: every file is pinned below. */
const FROZEN_NAMESPACES = [
  'a3prep',
  'a3governance',
  'a3governanceV2',
  'a3evidence',
  'a3evidenceV2',
  'a3documents',
  'a3documentsV2',
  'a3graphs',
  'a3graphsV2',
  'a3samples',
  'a3samplesV2',
  'a3readiness',
  'a3readinessV2',
  'sd7',
];

/**
 * Every file of every frozen namespace, the canonical SD7 modules, and every
 * R19-R30 public census and audit, as their bytes stand at the R30 tip.
 */
const FROZEN_SHA256_AT_R30: Readonly<Record<string, string>> = {
  'docs/audits/PHASE_2B_2D_A3_R19_COMMITTED_A2_GOVERNANCE_AUTHORITY_ADAPTER_V1.md':
    '8e1c0159eef8da2bef40963cd6675bb66197ef1fa07205f26ca39e0252b5dada',
  'docs/audits/PHASE_2B_2D_A3_R20_DEV_TRAIN_DURABLE_EVIDENCE_ADAPTER_V1.md':
    '05cd82d95598400ad771f20602df98e70ca089a10d8fd18736711b4f0eeba71e',
  'docs/audits/PHASE_2B_2D_A3_R21_DEV_TRAIN_DOCUMENT_SOURCE_ASSEMBLY_V1.md':
    '2513350f69816cfeb6d5e3dfb9c8d8bd9d6b0728eb38c94045641d8c34ffc911',
  'docs/audits/PHASE_2B_2D_A3_R22_DEV_TRAIN_SD7_GRAPH_MEASUREMENT_V1.md':
    '32e549989c8e8d5da74d6ff24d68087bb4b919681cad6651498f4b70be758f13',
  'docs/audits/PHASE_2B_2D_A3_R23_DEV_TRAIN_SAMPLE_SURVIVOR_PREPARATION_V1.md':
    '0ab8f24113c68d251932d322fb729cde74e2120eb45182a0d058ebb75a7dc658',
  'docs/audits/PHASE_2B_2D_A3_R24_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_READINESS_V1.md':
    '171ee2b5e68bfca7a02bbe5a12e03639dbf2ceca022392c200571c93741d106f',
  'docs/audits/PHASE_2B_2D_A3_R25_COMMITTED_GOVERNANCE_SNAPSHOT_V2_V1.md':
    '968973051403a323e0b944f55eadb5aa2bfd05c5a1d4b453aacf6a1d9e69603c',
  'docs/audits/PHASE_2B_2D_A3_R26_INCREMENTAL_DEV_TRAIN_DURABLE_EVIDENCE_V1.md':
    '328cc5dda22e327eb3e954fbe9697ae06b1629f6d6515777f43633dd8d59748f',
  'docs/audits/PHASE_2B_2D_A3_R27_INCREMENTAL_DEV_TRAIN_DOCUMENT_SOURCE_ASSEMBLY_V1.md':
    'd045d66cf28dff7b27aa7a335a6154c9cd6f910dd3e996226adaa453d15cb991',
  'docs/audits/PHASE_2B_2D_A3_R28_INCREMENTAL_DEV_TRAIN_SD7_GRAPH_V1.md':
    'e3f0f9f051e3a246ec336659d81b7b9dab43e4b1953bd2201606ab9fda93dc31',
  'docs/audits/PHASE_2B_2D_A3_R29_INCREMENTAL_DEV_TRAIN_SAMPLE_SURVIVOR_PREPARATION_V1.md':
    '9512c4074838cf327322cc864fd34ad673084aeb5d1dcd6119195f6b0698aa45',
  'docs/audits/PHASE_2B_2D_A3_R30_INCREMENTAL_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_V1.md':
    '5927a368b623105589fb399d38a0141caed1062f022460dc4c9769d1da858a76',
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
  'docs/evaluation/PHASE_2B_2D_A3_R24_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_READINESS_CENSUS_V1.json':
    '23e2b7ba8b315869df41e8a753f66f2a14aa5025767dda8ed32d49a38f782023',
  'docs/evaluation/PHASE_2B_2D_A3_R25_PUBLIC_GOVERNANCE_AUTHORITY_CENSUS_V2.json':
    '98cf1a296ed869acbddbb381ed4e310680e05dab966076b23fceb68bbe78224b',
  'docs/evaluation/PHASE_2B_2D_A3_R26_DEV_TRAIN_INCREMENTAL_DURABLE_EVIDENCE_CENSUS_V1.json':
    '61f83b668bc9d0255af115750422c0bc2eebd4892bc1af9efd847f5085dfcdcf',
  'docs/evaluation/PHASE_2B_2D_A3_R27_DEV_TRAIN_INCREMENTAL_DOCUMENT_SOURCE_ASSEMBLY_CENSUS_V1.json':
    '9cba69790e91bf2487ca4979e01d41d55edd84014504c027259d9e87723305f1',
  'docs/evaluation/PHASE_2B_2D_A3_R28_DEV_TRAIN_INCREMENTAL_SD7_GRAPH_CENSUS_V1.json':
    '01d80bc3f661709ce60c6b7d9f1647c3cc5cf7fe30957ca880cfc04921e8e748',
  'docs/evaluation/PHASE_2B_2D_A3_R29_DEV_TRAIN_INCREMENTAL_SAMPLE_SURVIVOR_PREPARATION_CENSUS_V1.json':
    'e63d362457f094101e1822dadf292f8b2b1eceab1f409cfbb54420ecb5545701',
  'docs/evaluation/PHASE_2B_2D_A3_R30_DEV_TRAIN_INCREMENTAL_REACHABLE_MEMBERSHIP_SD9_CENSUS_V1.json':
    '54f5fc479f7aa301ce15f2486214cdaa7bb3913786a5bdce5da0cfd417b74068',
  'src/test/harness/phase2b2d/a3documents/assemble.ts':
    '062da3fdcb9013b8e90741478b398c217f58a1da6ffcf5ceeb3d640ce45cb1af',
  'src/test/harness/phase2b2d/a3documents/census.ts':
    'ebffcae2b9a5840e1a087d94e59e7d9fbe7463a357a36716b1dd33eb467e94ef',
  'src/test/harness/phase2b2d/a3documents/devTrain.ts':
    'd962748b397f9c0e62da4d9e7aa649d5f47ea109fd5d4ff16b70afc3ce6f1ad1',
  'src/test/harness/phase2b2d/a3documents/r20Drift.ts':
    '0750310eaf1f44ed18f27132964ae3a261870bc276a7f0cefaca57f9c6d934ae',
  'src/test/harness/phase2b2d/a3documents/refusal.ts':
    'e62a186837302ff0836b794934c28e0f5cf6e643490d13de22b3439258825aca',
  'src/test/harness/phase2b2d/a3documents/types.ts':
    'ed497379c839dde668862baa785c9abc8f8c39ca4a355e73b97f12e48c3d859f',
  'src/test/harness/phase2b2d/a3documentsV2/assembleDelta.ts':
    '7b87e58b91eaf192c6ac31c79bea14bb652a3103ba9311d7213da8bc58e63798',
  'src/test/harness/phase2b2d/a3documentsV2/census.ts':
    'df6c33efdaaefd379a5fe23db2be189488e756bbe59682296ecdaed71532aea8',
  'src/test/harness/phase2b2d/a3documentsV2/devTrain.ts':
    'ff042050139bc0ab40a73cb827e59a9d1c02e404c282dd88d4160ffd90dad4ec',
  'src/test/harness/phase2b2d/a3documentsV2/r26Drift.ts':
    '6498a0815deada59b96d646d31d641a45fca787a99e40f7ccc9e0d67e80e2059',
  'src/test/harness/phase2b2d/a3documentsV2/refusal.ts':
    '57e9e28fd79cb2d80de333a644f870aabe275bea0fd6ff63a163084f20c30ae1',
  'src/test/harness/phase2b2d/a3documentsV2/types.ts':
    'a0b4c1c580cd60aac8fca93e422d731cc840b906c2b988c6e5ab9e48f056af9e',
  'src/test/harness/phase2b2d/a3evidence/census.ts':
    'af42fe57747530f3d0b3c5def0913eb7828f098c652b996a12a8b198d483e415',
  'src/test/harness/phase2b2d/a3evidence/database.ts':
    '48c47fb44a13ed3b5408c53afda8972a598cd6f7057d7e6191682633456d52e0',
  'src/test/harness/phase2b2d/a3evidence/devTrain.ts':
    '175aa179954395e86a5c0c5cf0529560b23e13abf36f0f4eee1d498f6c6def3f',
  'src/test/harness/phase2b2d/a3evidence/integrity.ts':
    'a6f67b22581df40357ed0809083192eb839f80ff86797934d487bac721e877f4',
  'src/test/harness/phase2b2d/a3evidence/refusal.ts':
    '6cae64c61a08e919690ce1286f6433d429b4246c853a373b801470a705fc96a8',
  'src/test/harness/phase2b2d/a3evidence/runMatch.ts':
    '0d911386cb234964c616fadf51a6c9070f5ec47d1bed4498ee25ee62ea8aea00',
  'src/test/harness/phase2b2d/a3evidence/types.ts':
    '3b26c39afdb871a5f4de26969e1d1a167a5591a5820b44ab4ab42adc77544c2a',
  'src/test/harness/phase2b2d/a3evidenceV2/authorityDelta.ts':
    '26cb34fea6ceaea38a6328bf0ac3eb6a33e86702166871856dd91f1ed2c2c2f3',
  'src/test/harness/phase2b2d/a3evidenceV2/census.ts':
    'c0c7d6b8cd7c8e9d09af551a713e8500390e1eba57defba2f5e83e99e3065821',
  'src/test/harness/phase2b2d/a3evidenceV2/devTrain.ts':
    '5f92c32103755a9980066082af56a2cfbeb4f78e7607c44cf0c51c794ff6c109',
  'src/test/harness/phase2b2d/a3evidenceV2/r25Drift.ts':
    '5c7f181280b4bc15b80cc272669b17a8e2f460c6ec2936b01c37a9e259fa4ccb',
  'src/test/harness/phase2b2d/a3evidenceV2/refusal.ts':
    'd31dc50e3aed27dbe0ca85c309fe06fe029730812b228bd2afc5e3ab2a751df8',
  'src/test/harness/phase2b2d/a3evidenceV2/types.ts':
    'acba596c20b91f99be26452270bd1c98b7e87b40d66de90bd6ae4811335a6c0b',
  'src/test/harness/phase2b2d/a3governance/families.ts':
    'a54a6908c25c8730600b900136efe74161f775af77c6888f11adb6b67e007dc0',
  'src/test/harness/phase2b2d/a3governance/loader.ts':
    '912ebdd7abe0192bc8f64a386dddc2339ac18c4e15a2ab2792976fff4e579783',
  'src/test/harness/phase2b2d/a3governance/refusal.ts':
    '5bd9f1f9bd99033253c07c5d103e1d637c6ca3399384b1288a3060a4475095da',
  'src/test/harness/phase2b2d/a3governance/registryV1.ts':
    '9dfd82344bd2bc9ba74997b47b7f88d7d6ca9938aa86e86153c14954b215d05d',
  'src/test/harness/phase2b2d/a3governance/resolve.ts':
    '3163d80229dc5ae5b1dab7c1e7351527ddaddcefaad3bd368dcb9106ca205178',
  'src/test/harness/phase2b2d/a3governance/snapshot.ts':
    '635ea860ed672d33d4f19329fff177ecac7ecef0434908c667b9f9ee25bca2fb',
  'src/test/harness/phase2b2d/a3governance/transitionLedger.ts':
    'e921c39a44fb8596aa345c9dcf6f27074af8e198b5e4d1ae0e145ed74fc9e462',
  'src/test/harness/phase2b2d/a3governanceV2/census.ts':
    '8b5951adab9ecb274328853fa2ba26651b9f6b801f91fbf1846177282ba70130',
  'src/test/harness/phase2b2d/a3governanceV2/commitLoader.ts':
    '069eb4406312ddb980f33f0347c63df1d0ddb4bb67f6f31ad962ffd468482dda',
  'src/test/harness/phase2b2d/a3governanceV2/familiesV2.ts':
    '15a61aef1f46b0e192fd6f6f73761f9b66d81398585f97bbd1d549e1e053895c',
  'src/test/harness/phase2b2d/a3governanceV2/refusal.ts':
    'e7e0c8a227024d37f8d4f04d653db732c108ed7126bf46471064f2a30d6e8800',
  'src/test/harness/phase2b2d/a3governanceV2/registryV2.ts':
    '7b99e2a0b9f590346b0d3fd8d9d767faedf9c14efe8d20f0eaf6945c057958bd',
  'src/test/harness/phase2b2d/a3governanceV2/resolveV2.ts':
    '6fd7c9eb2aa4339d95a65b9445278ed5b1dfcf2719b50334e4fed6720d134af1',
  'src/test/harness/phase2b2d/a3governanceV2/snapshotV2.ts':
    '612c220174756a7ffd5576c492767585c05e4fa65661b71567f001fb82333736',
  'src/test/harness/phase2b2d/a3graphs/census.ts':
    '2c8c4c27ef2c8f102703889faf2f874bfc120bdc6ddb534abaaeb4a281417659',
  'src/test/harness/phase2b2d/a3graphs/devTrain.ts':
    'b013669bb6da9cb296053ac123c0704b36166a6c4a52f63ff2bcd0831da16954',
  'src/test/harness/phase2b2d/a3graphs/measure.ts':
    'bde8456bdb60c348af6affe81da9e631417e41921bf12b3029fe1612367d0dad',
  'src/test/harness/phase2b2d/a3graphs/r21Drift.ts':
    '17962adc0c61986e0d09106a78af72db3d2c2b18286e7f30f05dc7be63d59c05',
  'src/test/harness/phase2b2d/a3graphs/refusal.ts':
    '4a7b437b37a6ab225f082742a4f500d22050f457025fa46abc91e5097a566ec3',
  'src/test/harness/phase2b2d/a3graphs/types.ts':
    '5a40dcb749e26b20eae8a5d75af7260a8407f29dfc89fd93b6849021ddb2def3',
  'src/test/harness/phase2b2d/a3graphsV2/a2Consistency.ts':
    'ce2d72ece74ca1f6f922b099883d803cde65e3b74f1704f52591d1ebaa73516a',
  'src/test/harness/phase2b2d/a3graphsV2/census.ts':
    '6ad904db815f2986637d943bf6ce321689ec0c2730b80cf7071306fc906d899e',
  'src/test/harness/phase2b2d/a3graphsV2/devTrain.ts':
    '12078ebd4cfdda939efd272b672e5296594412260afbb0cdd6b2b94e037b3fc6',
  'src/test/harness/phase2b2d/a3graphsV2/measureDelta.ts':
    'cf0ac7d9cdd422be627da46bbbe2489156e61c2101e3750384a762da262237a9',
  'src/test/harness/phase2b2d/a3graphsV2/r27Drift.ts':
    '95e5f709e301f9924e320b77de0bb86cbbeb8e4ae78c37d4ec24de7c06bb7003',
  'src/test/harness/phase2b2d/a3graphsV2/refusal.ts':
    'dcb2bad1f3081231c3fb779127d24266001eca85be98bb64a8814f00dea46aab',
  'src/test/harness/phase2b2d/a3graphsV2/types.ts':
    'f3f844b32473846148bd2f552b82fd05c6c111b5b4c64c94ec56bffcb1887eda',
  'src/test/harness/phase2b2d/a3prep/contracts.ts':
    '4d856f45dd6016e1007d661f31388bf7bdbefd71862a6585ed4962240454b40f',
  'src/test/harness/phase2b2d/a3prep/corpusFreezePreflight.ts':
    'ddae984fec947845ec2e2df9feb24bf8b8f75c28993b413919c08a69c307fe75',
  'src/test/harness/phase2b2d/a3prep/manifestTypes.ts':
    '63e35e879a1cc31731704abd4273fbd2c6e3d438cef93fa79127f91529b4d4ee',
  'src/test/harness/phase2b2d/a3prep/organisationCaps.ts':
    '20432a5c7bd78ef7ec78e61b7a37e69abe5849539eca07564cc091bf6afc302c',
  'src/test/harness/phase2b2d/a3prep/rank.ts':
    '91658202f744be7efa5acfcb7905c9819af2bd4cbcd762aaeb2b8a49bf7c513e',
  'src/test/harness/phase2b2d/a3prep/sd7.ts':
    '322d2dd09f17dcc7ce0afa1862a13892f8bdadfece1c3ec919580f9d49977086',
  'src/test/harness/phase2b2d/a3prep/sd9.ts':
    '1de6a2781f322be0dea679d58897c37f49f4b1ca41df1933e975b5291f6efbdd',
  'src/test/harness/phase2b2d/a3prep/setP.ts':
    'c6839c72d365e5fd9bbe1c0604a6539e42a297dfeb4876fd6ed17858b578401c',
  'src/test/harness/phase2b2d/a3prep/setPSd7.ts':
    'b13c047f12ecf27583f07cef28923e3adc1e77ed2b3a1e1655de372cd79fdd4a',
  'src/test/harness/phase2b2d/a3prep/setR.ts':
    '76e8cae9f24c2ceb983ffa5777fcb96583cff0553e360126a711a282a6a75bec',
  'src/test/harness/phase2b2d/a3prep/setRScore.ts':
    '055747a5f5f067e06079562cd7e37a4e12d011d3736e28b947b5a30d6f588cf7',
  'src/test/harness/phase2b2d/a3prep/setRSd7.ts':
    'b03e26fae833c527b9cbbd1962bdf95e886b3a01fbd5e636c61b4c9a8c62e056',
  'src/test/harness/phase2b2d/a3prep/setRSd7Readiness.ts':
    '6db33d0d39d9ab90fbf2e1b8b44a9649a6aa6db380d9f97cb5f1f8bdeb19561a',
  'src/test/harness/phase2b2d/a3prep/slotAuthority.ts':
    'deee711b6eac66bccec51afee49615b71b94d0701b110a3abd50c1c12207f165',
  'src/test/harness/phase2b2d/a3prep/splitScope.ts':
    'a03a9a742588ffc18842d20a5f00c9eaaf505e721e0b72d5fcc510c16f219a36',
  'src/test/harness/phase2b2d/a3prep/types.ts':
    'b9358e63bdf49f92e094a0605d34dfbaaf92403839265bbaa6249165f8b00810',
  'src/test/harness/phase2b2d/a3readiness/census.ts':
    '13390bd301612bbe2d360866c57ea5366fe632f056136c121957ec75c2c156ed',
  'src/test/harness/phase2b2d/a3readiness/devTrain.ts':
    '6150dd955b7b5821b7080f586e2906ce3b97e539b54fe25b26d2ac8d1f60ebe9',
  'src/test/harness/phase2b2d/a3readiness/membership.ts':
    'e387d9f1efa6e0c8aa5150463469d2645aae09d34ef88007bf756a1ddc87fe5e',
  'src/test/harness/phase2b2d/a3readiness/r23Drift.ts':
    'e97c9270f49ae221ff616a96cd30531183774ff5dd300eb44be2fbc2fbbab697',
  'src/test/harness/phase2b2d/a3readiness/refusal.ts':
    '466de2f0773c413548458bc683c9bd3e58bbe374b0ade4e8e5df5fa4f8105a5a',
  'src/test/harness/phase2b2d/a3readiness/types.ts':
    'ef9f4c55d32a467ebb19d3131942c2eccc4fe42eae6b083d07cd8f3f41b1d99e',
  'src/test/harness/phase2b2d/a3readinessV2/census.ts':
    'fc2b847108a75eb351eb2d8bd264b7f6350e689c684cfcc1b750e4adbc2628b9',
  'src/test/harness/phase2b2d/a3readinessV2/deriveDelta.ts':
    'ce77a1dba40ed33d82a1ba5c5fff4b6661e1d985e40e74ff42f97d132032c209',
  'src/test/harness/phase2b2d/a3readinessV2/devTrain.ts':
    'ce013673af5c5336d98e81dfc61497f01177a56297690d07a202847bf90ccf92',
  'src/test/harness/phase2b2d/a3readinessV2/r29Drift.ts':
    'd5da1d642da9940de8cc6119545b3cbdc09cd3e3a7d0d021091017a183f3614e',
  'src/test/harness/phase2b2d/a3readinessV2/refusal.ts':
    'bdaab2acab39c3ee7966d0a745a2d03360ce6edede3d27992a92131c4ff60ddf',
  'src/test/harness/phase2b2d/a3readinessV2/types.ts':
    'e537729fe59021df38542d7e7acb791a7d96fb3b2962274c1be5e2cd9dd777f3',
  'src/test/harness/phase2b2d/a3samples/census.ts':
    '2e24cef96a722a1d0d57c0eb5e4aeecf73001963c87f59db4570a209834250e3',
  'src/test/harness/phase2b2d/a3samples/devTrain.ts':
    '0004b604c2763575431e89c97e3a6d69431da04b2427ab50c74b8d7a48557d46',
  'src/test/harness/phase2b2d/a3samples/prepare.ts':
    'ac9f2af750d353cbe5faa9a2b67421fca7b66ebbfd0cfeffec9f93401ed4650b',
  'src/test/harness/phase2b2d/a3samples/r22Drift.ts':
    '05db549ae1fcde298143ed9bdb3217328ef6190f717906ac5a36199deac2ffbe',
  'src/test/harness/phase2b2d/a3samples/refusal.ts':
    '49a4bee4a2baacd7b50d32b2e4895ee5097287aab53339c7357ff40cdc4e6cef',
  'src/test/harness/phase2b2d/a3samples/types.ts':
    '08e67b9ea18a67e88894502490c5234572051d12228cfe292d3e32102b55c329',
  'src/test/harness/phase2b2d/a3samplesV2/census.ts':
    '4b7fb2b442e827222273f31f9477b1b1a66af1e630dda345797141190e539b4b',
  'src/test/harness/phase2b2d/a3samplesV2/devTrain.ts':
    '56b8557630dc16a3d048cef5bda2200bc1e989b7897434c2907563c7c2b544c2',
  'src/test/harness/phase2b2d/a3samplesV2/prepareDelta.ts':
    '37e05fc722acafbc4176a1bc26b215eabe242689c757c1d685702ebde7e4aed8',
  'src/test/harness/phase2b2d/a3samplesV2/r28Drift.ts':
    '5f9647f613a78765e18f26f33ba0cf2a2a2e1e7a473e6e97d1d646bd122487b0',
  'src/test/harness/phase2b2d/a3samplesV2/refusal.ts':
    '83f7cfe05b91d9c668cb015f60687a9823e0f7850ada1e7ac14ef01516f8952e',
  'src/test/harness/phase2b2d/a3samplesV2/types.ts':
    'e149d4c19201e21ce7a4b52563978fe6478565deb4326270573bb89d1e1073d0',
  'src/test/harness/phase2b2d/sd7/jaccard.ts':
    'd086b5cd789b7877ddce962469839c8d7cbdf86412568962d42b04451529a930',
  'src/test/harness/phase2b2d/sd7/materialisePilot.ts':
    '1f86be6df85c8cbd8013030db8db6aff2c6f2e5b317f8eaaa280af8b789c9868',
  'src/test/harness/phase2b2d/sd7/nearDuplicatePairs.ts':
    '1851726bb28789791d96e0cd27532846e6a503b234a5813bec70782e6e078371',
  'src/test/harness/phase2b2d/sd7/normaliseText.ts':
    'b518e2ab02eb9284c56a5c0172f79480a8fd110f7433f502fe3e619a3846df90',
  'src/test/harness/phase2b2d/sd7/pilotAnalysis.ts':
    '7edfb2b2f0e13abebf651a93433fc49139f2b9b0db603a88bde15682d3c77010',
  'src/test/harness/phase2b2d/sd7/pilotArtifact.ts':
    '50f18d08a2c37b8666086dfb6e79f9b54d9af1d8e7040bab11a40e58c91b983a',
  'src/test/harness/phase2b2d/sd7/readPilotEvidence.ts':
    'c343d86aac7de1bc55494bd7e657880552624becf856ee553b5ae3ad408e4147',
  'src/test/harness/phase2b2d/sd7/sd7Contract.ts':
    '882dad5e990cf40ff326b5fecea3e691720b6d8214f02bf4629ab6fefd2b0f60',
  'src/test/harness/phase2b2d/sd7/tokenShingles.ts':
    '3a56ac6c9eea4dd70c66ea1d2965b323b38b21883103d7b1b4d0a646c9548b0f',
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
  return stripComments(readFileSync(join(REPO_ROOT, A3GOVERNANCE_V3_REL, file), 'utf8'));
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

/** Names imported from one specifier, whether or not the import is type-only. */
function namesImportedFrom(source: string, specifier: string): string[] {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const names: string[] = [];
  for (const m of source.matchAll(
    new RegExp(`import\\s*(?:type\\s*)?\\{([^}]*)\\}\\s*from\\s*'${escaped}'`, 'g'),
  )) {
    for (const raw of (m[1] ?? '').split(',')) {
      const name = raw.trim().replace(/^type\s+/, '');
      if (name.length > 0) names.push(name);
    }
  }
  return [...new Set(names)].sort();
}

function lines(value: string): string[] {
  return value.split('\n').filter((line) => line.length > 0);
}

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function allCode(): string {
  return A3GOVERNANCE_V3_FILES.map(code).join('\n');
}

/** Source with string literals blanked: a disclaimer string is not a capability. */
function allCodeWithoutStrings(): string {
  return allCode().replace(/'[^'\n]*'/g, "''");
}

const baseAvailable = commitExists(R30_TERMINAL) && commitExists(R30_SCOPE_PIN_COMMIT);

// ---------------------------------------------------------------------------

describe('2D-A3 R31: the new namespace is exactly these files', () => {
  it('holds the eight V3 governance modules', () => {
    expect(readdirSync(join(REPO_ROOT, A3GOVERNANCE_V3_REL)).sort()).toEqual(A3GOVERNANCE_V3_FILES);
  });

  it('pins every file of every frozen namespace, and no file was added to one', () => {
    for (const namespace of FROZEN_NAMESPACES) {
      const onDisk = readdirSync(join(REPO_ROOT, HARNESS, namespace))
        .map((file) => `${HARNESS}/${namespace}/${file}`)
        .sort();
      const pinned = Object.keys(FROZEN_SHA256_AT_R30)
        .filter((path) => path.startsWith(`${HARNESS}/${namespace}/`))
        .sort();
      expect(onDisk, namespace).toEqual(pinned);
    }
  });

  it('leaves every pinned implementation file, census and audit byte-identical', () => {
    for (const [path, digest] of Object.entries(FROZEN_SHA256_AT_R30)) {
      expect(sha256(readFileSync(join(REPO_ROOT, path))), path).toBe(digest);
    }
  });

  it('pins all twelve R19-R30 public censuses and audits', () => {
    const records = Object.keys(FROZEN_SHA256_AT_R30).filter((path) => path.startsWith('docs/'));
    expect(records.filter((path) => path.startsWith('docs/evaluation/'))).toHaveLength(12);
    expect(records.filter((path) => path.startsWith('docs/audits/'))).toHaveLength(12);
  });
});

describe('2D-A3 R31: no DB, network, provider, classifier, sealed, write or second-git capability', () => {
  const PERMITTED_SPECIFIERS = new Set([
    'node:crypto',
    '../a3prep/slotAuthority.js',
    '../a3prep/contracts.js',
    '../a3governance/registryV1.js',
    '../a3governance/loader.js',
    '../a3governance/families.js',
    '../a3governance/refusal.js',
    '../a3governance/transitionLedger.js',
    '../a3governanceV2/commitLoader.js',
    '../a3governanceV2/census.js',
    '../a3governanceV2/familiesV2.js',
    '../a3governanceV2/refusal.js',
    '../a3governanceV2/registryV2.js',
    '../a3governanceV2/snapshotV2.js',
    '../a3evidenceV2/authorityDelta.js',
    '../a3evidenceV2/types.js',
    '../continuationWindow/replacementLedger.js',
    '../continuationWindow/windowPlan.js',
    './census.js',
    './commitLoaderV3.js',
    './devTrainContinuity.js',
    './familiesV3.js',
    './refusal.js',
    './registryV3.js',
    './resolveV3.js',
    './snapshotV3.js',
  ]);

  it('imports nothing but crypto and landed A3 / A2-ledger modules', () => {
    for (const file of A3GOVERNANCE_V3_FILES) {
      for (const specifier of specifiersOf(code(file))) {
        expect(PERMITTED_SPECIFIERS.has(specifier), `${file}: ${specifier}`).toBe(true);
      }
    }
  });

  it('opens no database, socket, provider, classifier or sealed root, and writes nothing', () => {
    const source = allCode();
    for (const forbidden of [
      /\bpg\b['"]/,
      /nwf_pe\b/,
      /nwf_readonly/,
      /\bSELECT\b|\bINSERT\b/,
      /node:(net|tls|http|https|dns|fs)/,
      /\bfetch\s*\(/,
      /process\.env/,
      /anthropic|claude-agent-sdk|@anthropic-ai/i,
      /orgunits\/classify|phase2b2d2c/,
      /methodology-v2-sealed|gen1-dev-train|gen1-dev-confirm|gen1-final-holdout/,
      /writeFile|appendFile|mkdir|rmSync|unlink|createWriteStream/,
      /a3documents|a3graphs|a3samples|a3readiness|\/sd7\/|setP|setR/,
    ]) {
      expect(source, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it('owns no git layer: reaches git only through R25’s frozen primitives', () => {
    for (const file of A3GOVERNANCE_V3_FILES) {
      const source = code(file);
      expect(source, file).not.toContain('child_process');
      expect(source, file).not.toMatch(/\bexecFileSync\b|\bexecSync\b|\bspawn\b|\bfork\s*\(/);
    }
    expect(
      namesImportedFrom(code('commitLoaderV3.ts'), '../a3governanceV2/commitLoader.js'),
    ).toEqual([
      'CommittedGovernanceFileV2',
      'CommittedGovernanceV2',
      'legacyV1Subview',
      'readCommittedBlobs',
      'requireExactCommit',
      'requireSafeRecordPath',
    ]);
  });

  it('names no branch, ref, revision walk, listing or "latest" anywhere in code', () => {
    const source = allCodeWithoutStrings();
    for (const forbidden of [
      /\bHEAD\b/,
      /origin\//,
      /refs\//,
      /\breaddir|\bglob\b|\bmtime\b|statSync/,
      /\blatest\b/i,
    ]) {
      expect(source, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it('calls R17, never restates it: READY is minted only by the unchanged resolver', () => {
    const resolve = code('resolveV3.ts');
    expect(resolve.match(/resolveGenerationSlotAuthorities\(/g)).toHaveLength(1);
    expect(resolve.match(/deriveGenerationSlotAuthoritySummary\(/g)).toHaveLength(1);
    const source = allCodeWithoutStrings();
    expect(source).not.toMatch(/status\s*:\s*''/);
    expect(source).not.toMatch(/A3_SLOT_ACQUISITION_AUTHORITY_READY/);
  });

  it('reaches R26 only through its pure comparator, never its binder or V1->V2 delta', () => {
    expect(namesImportedFrom(allCode(), '../a3evidenceV2/authorityDelta.js')).toEqual([
      'compareDevTrainReadyAuthorities',
    ]);
    const source = allCodeWithoutStrings();
    for (const forbidden of [
      /deriveDevTrainReadyAuthorityDelta/,
      /deltaAuthoritiesToBind/,
      /requireAdditiveOnlyDelta/,
      /a3evidenceV2\/(bind|evidence|load|devTrain|census)/,
      /a3evidence\//,
    ]) {
      expect(source, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it('has no A2 write, plan, reserve-assignment or P6 decision capability', () => {
    const source = allCodeWithoutStrings();
    for (const forbidden of [
      /appendReplacement|appendLedger|assignReserve|\bprenetwork|\bliveAuthority\b/,
      /evaluateContinuationWindowGate|windowContract|\bP6\b|P6_/,
      /continuationWindow\/(windowContract|plan|strategy|authority|append)/,
    ]) {
      expect(source, String(forbidden)).not.toMatch(forbidden);
    }
  });
});

describe.skipIf(!baseAvailable)('2D-A3 R31: lineage and changed surface', () => {
  it('descends from the exact canonical R30 tip, and merges no A2 commit', () => {
    expect(() => git('merge-base', '--is-ancestor', R30_TERMINAL, 'HEAD')).not.toThrow();
    expect(() => git('merge-base', '--is-ancestor', R30_SCOPE_PIN_COMMIT, 'HEAD')).not.toThrow();
    expect(lines(git('rev-list', '--merges', `${R30_TERMINAL}..HEAD`))).toEqual([]);
    for (const a2 of A2_COMMITS) {
      if (!commitExists(a2)) continue;
      expect(() => git('merge-base', '--is-ancestor', a2, 'HEAD'), a2).toThrow();
    }
  });

  it('pinned R30 scope in exactly one commit that touched exactly one file', () => {
    expect(lines(git('diff', '--name-only', R30_TERMINAL, R30_SCOPE_PIN_COMMIT))).toEqual([
      R30_ISOLATION_TEST,
    ]);
    expect(sha256(readFileSync(join(REPO_ROOT, R30_ISOLATION_TEST)))).toBe(
      sha256(git('show', `${R30_SCOPE_PIN_COMMIT}:${R30_ISOLATION_TEST}`)),
    );
  });

  it('leaves every frozen namespace untouched since the R30 tip', () => {
    for (const namespace of FROZEN_NAMESPACES) {
      const path = `${HARNESS}/${namespace}`;
      expect(lines(git('diff', '--name-only', R30_TERMINAL, '--', path)), path).toEqual([]);
      expect(lines(git('ls-files', '--others', '--exclude-standard', '--', path)), path).toEqual(
        [],
      );
    }
  });

  it('writes no governance record: every docs/evaluation change is the R31 census', () => {
    const changed = [
      ...lines(git('diff', '--name-only', R30_TERMINAL, '--', 'docs/evaluation')),
      ...lines(git('ls-files', '--others', '--exclude-standard', '--', 'docs/evaluation')),
    ];
    expect(changed.filter((path) => path !== R31_CENSUS_PATH)).toEqual([]);
  });

  it('changes nothing outside its own namespace, tests, records and the R30 scope pin', () => {
    const paths = [
      ...new Set([
        ...lines(git('diff', '--name-only', R30_TERMINAL)),
        ...lines(git('ls-files', '--others', '--exclude-standard')),
      ]),
    ];
    const permitted = (path: string): boolean =>
      path.startsWith(`${A3GOVERNANCE_V3_REL}/`) ||
      R31_TESTS.includes(path) ||
      path === R30_ISOLATION_TEST ||
      path === R31_CENSUS_PATH ||
      path === R31_AUDIT_PATH;
    expect(paths.filter((path) => !permitted(path))).toEqual([]);
  });
});

describe.skipIf(!existsSync(join(REPO_ROOT, R31_CENSUS_PATH)))(
  '2D-A3 R31: the public census discloses nothing',
  () => {
    const raw = existsSync(join(REPO_ROOT, R31_CENSUS_PATH))
      ? readFileSync(join(REPO_ROOT, R31_CENSUS_PATH), 'utf8')
      : '{}';
    const payload = (() => {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      delete parsed['identityDisclosure'];
      delete parsed['whatThisIsNot'];
      return JSON.stringify(parsed, null, 2);
    })();

    it('is the derived census record, and authorises nothing', () => {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      expect(parsed['record']).toBe(R31_PUBLIC_CENSUS_RECORD_KIND);
      expect(parsed['recordKind']).toBe('PUBLIC_GOVERNANCE_ONLY_AUTHORITY_CENSUS');
      expect(parsed['thisFileAuthorises']).toEqual([]);
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
        'documentHash',
        'contentSha256',
        'url',
        'domain',
        'hostname',
        'sealedSd7Detail',
        'label',
        'gold',
        'classifier',
        'slots',
        'workItemId',
      ]) {
        expect(payload, key).not.toContain(`"${key}":`);
      }
    });

    it('names no URL, domain, sealed filename, work item or run-shaped digest', () => {
      expect(payload).not.toMatch(
        /https?:\/\/|\.(fr|eu|org|com)\b|SD7_DETAIL|\.json"|sealed-|"[PR]:\d/,
      );
      const digests = [...new Set(payload.match(/\b[0-9a-f]{40,64}\b/g) ?? [])].sort();
      expect(digests).toEqual(
        [
          '58f756453bdc19168b584b5994379e05f0281781',
          'f76b8ae6653f1f8ec9dabd2d7eec3922c2e000f1',
        ].sort(),
      );
    });
  },
);
