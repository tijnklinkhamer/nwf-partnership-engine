/**
 * TRACK B, B2.4-R1a - THE ISOLATION TEST FOR THE PROVISIONAL, B-LOCAL
 * SUBJECT-EVIDENCE PROJECTION (`nwf-pe.discovery-subject-evidence.v1-provisional`).
 *
 * Per the phase-isolation convention this change is pinned by its OWN
 * repair-scope file over its OWN commit range. It proves, from the real git
 * range and the real source:
 *
 *   - the change set is EXACTLY three new production files under
 *     `src/orgunits/subjectHandoff/`, one unit test, this firewall, and the
 *     B2.4-R1b exact-path correction of TWO earlier firewall assertions (B2.2
 *     "nothing reads the registry", B2.3 "used by no research path"), pinned
 *     below line by line; every migration, every other earlier firewall, B2.1,
 *     B2.2, B2.3, B3.0, the CLI, the classifier, the orchestrator and every
 *     governance record are untouched;
 *   - that correction admits exactly two named files, keeps each historical
 *     claim over its own pinned tree, keeps every other check, and leaves both
 *     terminal pins as they were;
 *   - the projection's whole transitive import chain reaches no writer, store,
 *     signer, database, network or file module;
 *   - the projection is PURE: no network, no database, no filesystem, no
 *     environment, no clock, no randomness;
 *   - it REUSES the accepted read model and validator and re-implements no
 *     verifier; it holds no private key, signs nothing, mints no trusted
 *     reviewer and builds no trust set except the operational one;
 *   - it issues no canonical identifier, asserts no actor equivalence, emits
 *     no RC2 v1 envelope, writes nothing to I0, starts no research and reads
 *     no protected cohort;
 *   - every permission is the literal NONE and the operational trust set is
 *     still empty;
 *   - nothing in production imports it, and no CLI exposes it.
 * What cannot be proven statically (refusals, held reviews, determinism,
 * findings digests, negative mutations) is proven by
 * discoverySubjectEvidenceB24.test.ts.
 *
 * THE RANGE IS REPAIR_BASE_COMMIT..REPAIR_TERMINAL_COMMIT. It is open to the
 * working tree while the change is uncommitted; the terminal pin is LEFT
 * UNSET in R1a and belongs to a separately authorised commit-closure phase.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import * as evidenceContract from '../../orgunits/subjectHandoff/contract.js';
import * as evidenceFindings from '../../orgunits/subjectHandoff/findings.js';
import * as evidenceProject from '../../orgunits/subjectHandoff/project.js';
import {
  OPERATIONAL_OWNER_REVIEW_KEYS,
  ReviewTrustSet,
} from '../../orgunits/subjectReview/trust.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** The accepted B2.3 tip (implementation fe00ae0 + firewall pin). */
const REPAIR_BASE_COMMIT = 'bb75da76fbe8dcf065dd31d2937c246eb216aab7';

/** Open (null) until a separately authorised commit-closure phase pins it. */
const REPAIR_TERMINAL_COMMIT: string | null = '766530cce66ff61df2cf2dc8543f95e73f897ade';

const HANDOFF_DIR = 'src/orgunits/subjectHandoff/';
const PRODUCTION_FILES = [
  'src/orgunits/subjectHandoff/contract.ts',
  'src/orgunits/subjectHandoff/findings.ts',
  'src/orgunits/subjectHandoff/project.ts',
];
const UNIT_TEST = 'src/test/unit/discoverySubjectEvidenceB24.test.ts';
const FIREWALL = 'src/test/firewall/phase2bSubjectEvidenceProjection.firewall.test.ts';
const B22_FIREWALL = 'src/test/firewall/phase2bDiscoverySubjectRegistry.firewall.test.ts';
const B23_FIREWALL = 'src/test/firewall/phase2bOwnerAttestedReview.firewall.test.ts';

/** The only two B2.4 files that name the registry / review protocol (contract.ts does not). */
const READ_MODEL_IMPORTERS = [
  'src/orgunits/subjectHandoff/findings.ts',
  'src/orgunits/subjectHandoff/project.ts',
];

const AUTHORISED_CHANGESET = [
  ...PRODUCTION_FILES.map((f) => `A\t${f}`),
  `A\t${UNIT_TEST}`,
  `A\t${FIREWALL}`,
  `M\t${B22_FIREWALL}`,
  `M\t${B23_FIREWALL}`,
].sort();

/**
 * B2.4-R1b: the EXACT edit to each earlier firewall. Removed lines verbatim;
 * added lines by the SHA-256 of their `\n`-joined text (the readable shape is
 * asserted separately below), so any further change to either file fails.
 */
const EARLIER_FIREWALL_EDITS: Readonly<
  Record<string, { removed: readonly string[]; added: number; addedSha256: string }>
> = {
  [B22_FIREWALL]: {
    removed: [
      "      expect(codeOf(readFileSync(join(REPO_ROOT, file), 'utf8')), file).not.toMatch(",
      '        /subjectRegistry|discoverySubjects/,',
      '      );',
    ],
    added: 27,
    addedSha256: 'c58be42cc94c84c9b9af50d0cfb36f99e075f420524278a9b55278d5812f642e',
  },
  [B23_FIREWALL]: {
    removed: [
      '      if (',
      '        file.startsWith(REVIEW_DIR) ||',
      '        file.startsWith(REGISTRY_DIR) ||',
      '        file === CLI_COMMAND ||',
      '        file === SIGN_CLI ||',
      '        file === CLI_ENTRY',
      '      ) {',
      '        continue;',
      "      expect(codeOf(readFileSync(join(REPO_ROOT, file), 'utf8')), file).not.toMatch(",
      '        /subjectReview|subjectRegistry|appendAttestedReview|prepareReview|fromVerifiedEnvelope|VerifiedReviewEnvelope|ReviewTrustSet/,',
      '      );',
    ],
    added: 57,
    addedSha256: '76b1af783bb0ddd3ba24975b044cfe2c40175b574e84c3b76fd357acbddc428e',
  },
};

/** The earlier slices' terminal pins, which the correction must not move. */
const EARLIER_TERMINAL_PINS: Readonly<Record<string, string>> = {
  [B22_FIREWALL]: '4189d1e0c160b6d1f89a61b89c5fc20477897d39',
  [B23_FIREWALL]: 'fe00ae0d4a096fda3c3f9386366ab9c82bb5fbfc',
};

/**
 * The projection's COMPLETE transitive import closure: the pure B2.1
 * validator, the pure B2.2/B2.3 read side and B2.3 verification. No writer,
 * store or signer; `node:crypto` is the only external module.
 */
const IMPORT_CLOSURE = [
  'src/orgunits/identity/admissibility.ts',
  'src/orgunits/identity/structuralParent.ts',
  'src/orgunits/identity/validate.ts',
  'src/orgunits/identity/vocabulary.ts',
  ...PRODUCTION_FILES,
  'src/orgunits/subjectRegistry/readModel.ts',
  'src/orgunits/subjectRegistry/requests.ts',
  'src/orgunits/subjectRegistry/reviewAttestation.ts',
  'src/orgunits/subjectRegistry/reviewAuthority.ts',
  'src/orgunits/subjectRegistry/reviewEvidence.ts',
  'src/orgunits/subjectReview/canonical.ts',
  'src/orgunits/subjectReview/protocol.ts',
  'src/orgunits/subjectReview/trust.ts',
  'src/orgunits/subjectReview/verify.ts',
].sort();

/** Accepted slices this change may not touch at all. */
const PROTECTED_PATHS = [
  'migrations/',
  'src/orgunits/identity/',
  'src/orgunits/subjectRegistry/',
  'src/orgunits/subjectReview/',
  'src/orgunits/orchestrator/',
  'src/orgunits/classify/',
  'src/orgunits/web/',
  'src/orgunits/signals/',
  'src/orgunits/sitemap.ts',
  'src/cli/',
  'src/config/',
  'src/db/',
  'src/test/helpers/',
  'src/test/harness/',
  'src/test/integration/',
  'docs/',
  'scripts/',
  'docker/',
  'docker-compose.yml',
  'package.json',
  'package-lock.json',
  'CLAUDE.md',
];

/** Each production file's complete import list. */
const ALLOWED_IMPORTS: Readonly<Record<string, readonly string[]>> = {
  'src/orgunits/subjectHandoff/contract.ts': [],
  'src/orgunits/subjectHandoff/findings.ts': [
    '../subjectRegistry/readModel.js',
    '../subjectRegistry/reviewAttestation.js',
    '../subjectReview/canonical.js',
    './contract.js',
    'node:crypto',
  ],
  'src/orgunits/subjectHandoff/project.ts': [
    '../identity/validate.js',
    '../identity/vocabulary.js',
    '../subjectRegistry/readModel.js',
    '../subjectRegistry/requests.js',
    '../subjectRegistry/reviewAttestation.js',
    '../subjectReview/canonical.js',
    '../subjectReview/protocol.js',
    '../subjectReview/trust.js',
    './contract.js',
    './findings.js',
    'node:crypto',
  ],
};

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

const rangeAvailable =
  commitExists(REPAIR_BASE_COMMIT) &&
  (REPAIR_TERMINAL_COMMIT === null || commitExists(REPAIR_TERMINAL_COMMIT));

const range = (): string[] =>
  REPAIR_TERMINAL_COMMIT === null
    ? [REPAIR_BASE_COMMIT]
    : [REPAIR_BASE_COMMIT, REPAIR_TERMINAL_COMMIT];

/** `--name-status` lines over the range, plus untracked files as `A` while the range is open. */
function changeset(...paths: readonly string[]): string[] {
  const tracked = execFileSync(
    'git',
    ['-C', REPO_ROOT, 'diff', '--name-status', '--find-renames', ...range(), '--', ...paths],
    { encoding: 'utf8' },
  );
  const untracked =
    REPAIR_TERMINAL_COMMIT === null
      ? execFileSync(
          'git',
          ['-C', REPO_ROOT, 'ls-files', '--others', '--exclude-standard', '--', ...paths],
          { encoding: 'utf8' },
        )
          .split('\n')
          .filter((l) => l.length > 0)
          .map((l) => `A\t${l}`)
          .join('\n')
      : '';
  return [...new Set(`${tracked}\n${untracked}`.split('\n').filter((l) => l.length > 0))].sort();
}

/** The `-`/`+` content lines of one file's diff over the range. */
function diffLines(path: string): { removed: string[]; added: string[] } {
  const diff = execFileSync(
    'git',
    ['-C', REPO_ROOT, 'diff', '--unified=0', ...range(), '--', path],
    { encoding: 'utf8' },
  ).split('\n');
  return {
    removed: diff.filter((l) => l.startsWith('-') && !l.startsWith('---')).map((l) => l.slice(1)),
    added: diff.filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1)),
  };
}

/** A file as the accepted base left it. */
function baseSourceOf(path: string): string {
  return execFileSync('git', ['-C', REPO_ROOT, 'show', `${REPAIR_BASE_COMMIT}:${path}`], {
    encoding: 'utf8',
  });
}

function sourceOf(path: string): string {
  if (REPAIR_TERMINAL_COMMIT === null) return readFileSync(join(REPO_ROOT, path), 'utf8');
  return execFileSync('git', ['-C', REPO_ROOT, 'show', `${REPAIR_TERMINAL_COMMIT}:${path}`], {
    encoding: 'utf8',
  });
}

function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function importsOf(path: string): string[] {
  return [...codeOf(sourceOf(path)).matchAll(/from '([^']+)'/g)].map((m) => m[1]!).sort();
}

/** Every production TypeScript file (non-test) under `src/`, in the working tree. */
function productionFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (full === join(REPO_ROOT, 'src', 'test')) continue;
        walk(full);
      } else if (name.endsWith('.ts')) {
        out.push(relative(REPO_ROOT, full).split('\\').join('/'));
      }
    }
  };
  walk(join(REPO_ROOT, 'src'));
  return out.sort();
}

const describeRange = rangeAvailable ? describe : describe.skip;

describeRange('B2.4-R1a subject-evidence projection: the change stays inside its scope', () => {
  it('changes exactly the authorised files, by path and status', () => {
    expect(changeset()).toEqual(AUTHORISED_CHANGESET);
  });

  it('touches no migration, earlier slice, CLI, helper, governance record or dependency', () => {
    expect(changeset(...PROTECTED_PATHS)).toEqual([]);
  });

  it('adds exactly one firewall and edits exactly two earlier ones (B2.1 and B3.0 untouched)', () => {
    expect(changeset('src/test/firewall/')).toEqual(
      [`A\t${FIREWALL}`, `M\t${B22_FIREWALL}`, `M\t${B23_FIREWALL}`].sort(),
    );
  });

  it('edits each earlier firewall by exactly the pinned lines, and nothing else', () => {
    for (const [file, pin] of Object.entries(EARLIER_FIREWALL_EDITS)) {
      const { removed, added } = diffLines(file);
      expect(removed, file).toEqual(pin.removed);
      expect(added.length, file).toBe(pin.added);
      expect(createHash('sha256').update(added.join('\n'), 'utf8').digest('hex'), file).toBe(
        pin.addedSha256,
      );
    }
  });

  it('keeps every other check of both earlier firewalls: same tests, no skip, no new timeout', () => {
    const tests = (source: string) => (codeOf(source).match(/\bit\(/g) ?? []).length;
    for (const file of [B22_FIREWALL, B23_FIREWALL]) {
      expect(tests(sourceOf(file)), file).toBe(tests(baseSourceOf(file)));
      expect(diffLines(file).added.join('\n'), file).not.toMatch(
        /\.(skip|only|todo|skipIf|runIf)\b|timeout|\bcatch\b|try\s*\{|expect\.soft/i,
      );
    }
  });

  it('leaves both earlier terminal pins and base commits exactly as they were', () => {
    for (const [file, pin] of Object.entries(EARLIER_TERMINAL_PINS)) {
      const line = `const REPAIR_TERMINAL_COMMIT: string | null = '${pin}';`;
      expect(sourceOf(file), file).toContain(line);
      expect(baseSourceOf(file), file).toContain(line);
      const base = /const REPAIR_BASE_COMMIT = '[0-9a-f]{40}';/.exec(baseSourceOf(file))![0];
      expect(sourceOf(file), file).toContain(base);
    }
  });

  it('admits exactly two named files - no directory, prefix or future importer', () => {
    const b22 = codeOf(sourceOf(B22_FIREWALL));
    const b23 = codeOf(sourceOf(B23_FIREWALL));
    const listed = (code: string, name: string) =>
      [...new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(code)![1]!.matchAll(/'([^']+)'/g)].map(
        (m) => m[1],
      );
    expect(listed(b22, 'B24_READ_MODEL_IMPORTERS')).toEqual(READ_MODEL_IMPORTERS);
    expect(listed(b23, 'B24_REVIEW_READERS')).toEqual(READ_MODEL_IMPORTERS);
    for (const code of [b22, b23]) {
      expect(code).not.toMatch(
        /subjectHandoff\/'|subjectHandoff\/`|startsWith\([^)]*subjectHandoff/,
      );
      expect(code.match(/subjectHandoff/g)).toHaveLength(2);
    }
    // The permitted forms name only pure modules: never writer, store, signer,
    // verifier, reviewer authority, evidence binding or a test seam.
    for (const code of [b22, b23]) {
      expect(code).toMatch(/subjectRegistry\\\/\(\?:readModel\|requests\|reviewAttestation\)/);
      expect(
        code.slice(code.indexOf('const B24_'), code.indexOf('const AUTHORISED_CHANGESET')),
      ).not.toMatch(
        /writer|store|signer|verify|reviewAuthority|reviewEvidence|ephemeralForVitest|testSeam/,
      );
    }
    expect(b23).toMatch(/subjectReview\\\/\(\?:canonical\|protocol\|trust\)/);
  });

  it('keeps each historical claim over its own pinned tree, with no B2.4 exception there', () => {
    for (const file of [B22_FIREWALL, B23_FIREWALL]) {
      const code = codeOf(sourceOf(file));
      const historical = code.indexOf('for (const file of productionFilesOfThisSlice()) {');
      const current = code.indexOf('for (const file of productionFiles()) {', historical);
      expect(historical, file).toBeGreaterThan(-1);
      expect(current, file).toBeGreaterThan(historical);
      expect(code.slice(historical, current), file).not.toMatch(/B24_|subjectHandoff/);
      expect(code.slice(historical, current), file).toContain('codeOf(sourceOf(file))');
    }
  });

  it('leaves the B2.3 trust set and verifier byte-identical to the accepted base', () => {
    expect(changeset('src/orgunits/subjectReview/', 'src/orgunits/subjectRegistry/')).toEqual([]);
  });
});

describe('B2.4-R1a subject-evidence projection: pure, reusing, never authorising', () => {
  it('consists of exactly the three approved production files', () => {
    const onDisk = productionFiles().filter((f) => f.startsWith(HANDOFF_DIR));
    expect(onDisk).toEqual(PRODUCTION_FILES);
  });

  it('imports exactly its allow-list: no network, database, file, classifier or orchestrator module', () => {
    for (const file of PRODUCTION_FILES) {
      expect(importsOf(file), file).toEqual([...ALLOWED_IMPORTS[file]!].sort());
    }
  });

  it('opens no socket, database or file, reads no environment and no clock, draws no randomness', () => {
    for (const file of PRODUCTION_FILES) {
      const code = codeOf(sourceOf(file));
      expect(code, file).not.toMatch(/node:(net|tls|http|https|dns|fs|child_process|os)\b/);
      expect(code, file).not.toMatch(/\bfetch\s*\(|from 'pg'|\/db\/|\bPool\b|\bquery\s*\(/);
      expect(code, file).not.toMatch(/process\.env|readFile|writeFile|createReadStream/);
      expect(code, file).not.toMatch(/Date\.now\(|new Date\(|performance\.now|Math\.random/);
      expect(code, file).not.toMatch(/randomUUID|randomBytes|getRandomValues/);
      expect(code, file).not.toMatch(
        /\b(SELECT|INSERT|UPDATE|DELETE|TRUNCATE)\s+(INTO|FROM|\w+\s+SET)/,
      );
    }
  });

  it('reuses the accepted read model and validator once each, and re-implements no verifier', () => {
    const project = codeOf(sourceOf('src/orgunits/subjectHandoff/project.ts'));
    expect(project.match(/deriveSubjectReadModel\(/g)).toHaveLength(1);
    expect(project.match(/validateIdentityGraph\(/g)).toHaveLength(1);
    for (const file of PRODUCTION_FILES) {
      const code = codeOf(sourceOf(file));
      expect(code, file).not.toMatch(
        /verifySignedReviewPayload|verifyReviewAttestations|effectiveReviewProjection|snapshotDigestOver|targetRecordDigestOf|evaluateStructuralParentConstraint|ed25519|\bverify\s+as\b|reviewSigningBytes/,
      );
    }
  });

  it('holds no private key, signs nothing and mints no reviewer or test trust set', () => {
    for (const file of PRODUCTION_FILES) {
      const code = codeOf(sourceOf(file));
      expect(code, file).not.toMatch(
        /createPrivateKey|generateKeyPair|\bsign\s*\(|signer\.js|signReviewIntent|PRIVATE KEY/,
      );
      expect(code, file).not.toMatch(
        /ephemeralForVitest|testSeam|TrustedReviewerContext|fromVerifiedEnvelope|VerifiedReviewEnvelope|appendAttestedReview|prepareReview|recordReview|writer\.js|store\.js/,
      );
    }
    // The only trust sets it touches are the caller's sealed one and the operational default.
    const project = codeOf(sourceOf('src/orgunits/subjectHandoff/project.ts'));
    expect([...project.matchAll(/ReviewTrustSet\.(\w+)\(/g)].map((m) => m[1]).sort()).toEqual([
      'isTrustSet',
      'operational',
    ]);
    expect(project).not.toMatch(/validateTrustEntries|OPERATIONAL_OWNER_REVIEW_KEYS/);
  });

  it('issues no canonical identifier, asserts no equivalence and writes nothing to I0', () => {
    for (const file of PRODUCTION_FILES) {
      const code = codeOf(sourceOf(file));
      expect(code, file).not.toMatch(/[`'"](cand|chn|opp):/);
      expect(code, file).not.toMatch(
        /SAME_ACTOR|sameActor|mergedInto|MERGED_INTO|equivalentTo|EQUIVALENT_TO|splitFrom/,
      );
      expect(code, file).not.toMatch(/identityRegister|nwf_identity|server\/|wt-operator/);
    }
  });

  it('starts no research, reads no protected cohort and imports no classifier or orchestrator', () => {
    for (const file of PRODUCTION_FILES) {
      const code = codeOf(sourceOf(file));
      expect(code, file).not.toMatch(
        /orgunits\/(classify|orchestrator|web|signals)|\.\.\/(classify|orchestrator|web|signals)\/|sitemap|claude-agent-sdk|anthropic/i,
      );
      expect(code, file).not.toMatch(
        /researchCohortGuard|evaluationCohortGuard|loadEvaluationCohort|enforceRootResearchEligibility|HOLDOUT|DEV_TRAIN|DEV_CONFIRM|runOrganisationDiscovery|executeWebAttempt/,
      );
    }
  });

  it('emits no RC2 v1 envelope: the shared name is a reference and a digest prefix only', () => {
    const uses = PRODUCTION_FILES.flatMap((file) =>
      [...codeOf(sourceOf(file)).matchAll(/RC2_SHARED_HANDOFF_CONTRACT/g)].map(() => file),
    );
    expect(uses.sort()).toEqual([
      'src/orgunits/subjectHandoff/contract.ts',
      'src/orgunits/subjectHandoff/findings.ts',
      'src/orgunits/subjectHandoff/findings.ts',
      'src/orgunits/subjectHandoff/project.ts',
      'src/orgunits/subjectHandoff/project.ts',
    ]);
    // Every `contract:` value this code writes is the provisional B-local name;
    // the shared name appears only as `sharedContract:` and as I0's digest prefix.
    for (const file of PRODUCTION_FILES) {
      const code = codeOf(sourceOf(file));
      const written = [...code.matchAll(/(?<!readonly )\bcontract:\s*([\w.']+)/g)].map((m) => m[1]);
      expect(
        written.filter((c) => c !== 'SUBJECT_EVIDENCE_CONTRACT'),
        file,
      ).toEqual([]);
      expect(code, file).not.toMatch(/\bsubjectStateDigest:|\bfindingsDigest:\s*findingsDigestOf/);
    }
    expect(codeOf(sourceOf('src/orgunits/subjectHandoff/project.ts'))).toContain(
      'sharedContract: RC2_SHARED_HANDOFF_CONTRACT,',
    );
  });

  it('grants nothing: every permission is the literal NONE, research authority the literal false', () => {
    expect(evidenceContract.PERMISSION_CAPABILITIES).toEqual([
      'research',
      'canonicalIssuance',
      'canonicalLinking',
      'qualification',
      'publication',
      'outreach',
      'opportunityCreation',
      'distributionAction',
      'suppressionClearance',
    ]);
    expect(Object.values(evidenceContract.PERMISSIONS)).toEqual(
      evidenceContract.PERMISSION_CAPABILITIES.map(() => 'NONE'),
    );
    expect(Object.isFrozen(evidenceContract.PERMISSIONS)).toBe(true);
    const contract = codeOf(sourceOf('src/orgunits/subjectHandoff/contract.ts'));
    expect(contract).toContain(
      "export type Permissions = { readonly [K in PermissionCapability]: 'NONE' };",
    );
    for (const file of PRODUCTION_FILES) {
      const code = codeOf(sourceOf(file));
      expect(code, file).not.toMatch(/granted:\s*true|'GRANTED'|'ALLOWED'|'ELIGIBLE'|'CLEARED'/);
    }
    const project = codeOf(sourceOf('src/orgunits/subjectHandoff/project.ts'));
    expect(project).toContain('granted: false,');
  });

  it('exports exactly its functions, none shaped like an issuing, linking or admitting operation', () => {
    const functions = [evidenceContract, evidenceFindings, evidenceProject]
      .flatMap((m) => Object.entries(m))
      .filter(([, v]) => typeof v === 'function')
      .map(([k]) => k)
      .sort();
    expect(functions).toEqual(
      [
        'SubjectEvidenceRefusal',
        'evidenceFindingsDigestOf',
        'evidenceFindingsOf',
        'i0V1FindingsDigestOf',
        'i0V1FindingsRenderingOf',
        'projectSubjectEvidence',
        'reproduceSubjectEvidence',
      ].sort(),
    );
    for (const name of functions) {
      expect(name).not.toMatch(
        /merge|split|unify|dedup|link|equivalen|promot|issue|mint|adopt|candidate|channel|opportunit|admit|clear|eligib|permit|unblock|sign|export/i,
      );
    }
  });

  it('keeps the operational trust set empty and adds no key', () => {
    expect(OPERATIONAL_OWNER_REVIEW_KEYS).toEqual([]);
    expect(ReviewTrustSet.operational().hasActiveKey()).toBe(false);
    for (const file of PRODUCTION_FILES) {
      expect(sourceOf(file), file).not.toMatch(/BEGIN [A-Z ]*KEY|[A-Za-z0-9_-]{43}=?\b.*publicKey/);
    }
  });

  it('has no write-capable import chain: its whole closure is the pure read side', () => {
    const closure = new Set<string>();
    const external = new Set<string>();
    const stack = [...PRODUCTION_FILES];
    while (stack.length > 0) {
      const file = stack.pop()!;
      if (closure.has(file)) continue;
      closure.add(file);
      for (const spec of importsOf(file)) {
        if (!spec.startsWith('.')) external.add(spec);
        else stack.push(join(dirname(file), spec.replace(/\.js$/, '.ts')).split('\\').join('/'));
      }
    }
    expect([...closure].sort()).toEqual(IMPORT_CLOSURE);
    expect([...external]).toEqual(['node:crypto']);
    for (const file of IMPORT_CLOSURE) {
      expect(codeOf(sourceOf(file)), file).not.toMatch(
        /from '[^']*(writer|store|signer|orchestrator|classify|web\/|signals)[^']*'|from 'pg'|node:(fs|net|tls|http|https|dns)/,
      );
    }
  });

  it('has no production importer and no CLI exposure', () => {
    for (const file of productionFiles()) {
      if (file.startsWith(HANDOFF_DIR)) continue;
      expect(codeOf(readFileSync(join(REPO_ROOT, file), 'utf8')), file).not.toMatch(
        /subjectHandoff|projectSubjectEvidence|discovery-subject-evidence/,
      );
    }
  });
});
