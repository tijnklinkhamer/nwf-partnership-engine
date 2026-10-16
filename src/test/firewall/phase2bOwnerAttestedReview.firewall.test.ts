/**
 * TRACK B, B2.3 - THE ISOLATION TEST FOR OWNER-ATTESTED DISCOVERY-SUBJECT
 * REVIEWS (ADR 0023).
 *
 * Per the phase-isolation convention this change is pinned by its OWN
 * repair-scope file over its OWN commit range; the only earlier test files it
 * edits are named below with their exact removed and added lines. It proves,
 * from the real git range and the real source:
 *
 *   - the change set is EXACTLY the authorised files, by path and status, and
 *     B1.1, B3.0, B2.1, every earlier migration, every earlier firewall, the
 *     classifier, the gateway and every governance record are untouched;
 *   - the review protocol is domain-separated and verified signature-first,
 *     with a sealed result and no production path around it;
 *   - the trust set is PINNED SOURCE holding NO operational key, public keys
 *     only, with no database or CLI path to add one, and test keys can never
 *     become operational;
 *   - no private key, passphrase or PEM key block is anywhere in the tree,
 *     and only the offline signer can sign;
 *   - the signer and its CLI open no socket, no database and no environment;
 *   - the writer and reviewer capabilities stay distinct, and 0015 creates no
 *     key table, no LOGIN role and no SECURITY DEFINER function;
 *   - no review grants research admission, clears a protection or issues a
 *     canonical identity.
 * What cannot be proven statically (signatures, replay, concurrency, rollback,
 * read-time holds) is proven by discoverySubjectReviewB23.test.ts (unit and
 * integration).
 *
 * THE RANGE IS REPAIR_BASE_COMMIT..REPAIR_TERMINAL_COMMIT. It is open to the
 * working tree while the change is uncommitted, and must be pinned to the
 * implementation commit in a separately authorised commit-closure phase.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  EVALUATION_COHORT_ARTIFACT_PINS,
  loadEvaluationCohortRegistry,
} from '../../orgunits/classify/evaluationCohortGuard.js';
import { DISCOVERY_REVIEW_SIGN_OPTIONS } from '../../cli/commands/discoveryReviewSign.js';
import { DISCOVERY_SUBJECTS_OPTIONS } from '../../cli/commands/discoverySubjects.js';
import * as registryAttestation from '../../orgunits/subjectRegistry/reviewAttestation.js';
import * as registryEvidence from '../../orgunits/subjectRegistry/reviewEvidence.js';
import * as reviewCanonical from '../../orgunits/subjectReview/canonical.js';
import * as reviewProtocol from '../../orgunits/subjectReview/protocol.js';
import * as reviewSigner from '../../orgunits/subjectReview/signer.js';
import * as reviewTrust from '../../orgunits/subjectReview/trust.js';
import * as reviewVerify from '../../orgunits/subjectReview/verify.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** The accepted B2.2 tip (registry, firewall pinned, firewall cache repair). */
const REPAIR_BASE_COMMIT = '983359da887cabef5e029d114d073e0077e3973d';

/** Open (null) until a separately authorised commit-closure phase pins it. */
const REPAIR_TERMINAL_COMMIT: string | null = 'fe00ae0d4a096fda3c3f9386366ab9c82bb5fbfc';

const MIGRATION = 'migrations/0015_discovery_subject_review_attestation.sql';
const ADR = 'docs/adr/0023-owner-attested-discovery-subject-review.md';
const OWNER_RECORD = 'docs/evaluation/TRACK_B_B2_3_OWNER_ATTESTED_REVIEW_OWNER_DECISION_V1.json';
const REVIEW_DIR = 'src/orgunits/subjectReview/';
const REVIEW_FILES = [
  'src/orgunits/subjectReview/canonical.ts',
  'src/orgunits/subjectReview/protocol.ts',
  'src/orgunits/subjectReview/signer.ts',
  'src/orgunits/subjectReview/trust.ts',
  'src/orgunits/subjectReview/verify.ts',
];
const REGISTRY_DIR = 'src/orgunits/subjectRegistry/';
const REGISTRY_FILES = [
  'src/orgunits/subjectRegistry/readModel.ts',
  'src/orgunits/subjectRegistry/requests.ts',
  'src/orgunits/subjectRegistry/reviewAttestation.ts',
  'src/orgunits/subjectRegistry/reviewAuthority.ts',
  'src/orgunits/subjectRegistry/reviewEvidence.ts',
  'src/orgunits/subjectRegistry/store.ts',
  'src/orgunits/subjectRegistry/writer.ts',
];
const CLI_COMMAND = 'src/cli/commands/discoverySubjects.ts';
const SIGN_CLI = 'src/cli/commands/discoveryReviewSign.ts';
const CLI_ENTRY = 'src/cli/index.ts';
const ENV = 'src/config/env.ts';
const FIREWALL = 'src/test/firewall/phase2bOwnerAttestedReview.firewall.test.ts';
const B21_SCHEMA_TEST = 'src/test/integration/discoveryIdentitySchema.test.ts';
const B22_INTEGRATION = 'src/test/integration/discoverySubjectRegistry.test.ts';
const B22_UNIT = 'src/test/unit/discoverySubjectRegistryB22.test.ts';
const SCHEMA_INVENTORY = 'src/test/integration/orgunitSchema.test.ts';
const A1_FRAME_TEST = 'src/test/unit/orgunitCorpus2DA1Frame.test.ts';
const NEW_TABLES = ['subject_review_environment', 'subject_review_attestations'];

/**
 * B2.4-R1a (TL-authorised exact-path exception, 2026-10-16): the ONLY current
 * production files outside the review protocol and registry that may name
 * them - the pure subject-evidence projection - and the ONLY forms they may
 * use: imports of the pure read model, request vocabulary, attestation read
 * types, canonical JSON, protocol vocabulary and trust set, and the sealed
 * trust set's `operational()` / `isTrustSet()` and type positions. Never the
 * writer, store, signer, verifier, reviewer authority or a test trust seam.
 */
const B24_REVIEW_READERS = [
  'src/orgunits/subjectHandoff/findings.ts',
  'src/orgunits/subjectHandoff/project.ts',
];
const B24_READ_ONLY_FORMS = [
  /from '\.\.\/subjectRegistry\/(?:readModel|requests|reviewAttestation)\.js'/g,
  /from '\.\.\/subjectReview\/(?:canonical|protocol|trust)\.js'/g,
  /import \{ ReviewTrustSet \}/g,
  /\bReviewTrustSet\.(?:operational\(\)|isTrustSet\()/g,
  /: ReviewTrustSet\b/g,
];

/** The exact authorised change set, as `git diff --name-status` lines. */
const AUTHORISED_CHANGESET = [
  `A\t${ADR}`,
  `A\t${OWNER_RECORD}`,
  `A\t${MIGRATION}`,
  `A\t${SIGN_CLI}`,
  `M\t${CLI_COMMAND}`,
  `M\t${CLI_ENTRY}`,
  `M\t${ENV}`,
  'M\tsrc/orgunits/subjectRegistry/readModel.ts',
  'M\tsrc/orgunits/subjectRegistry/requests.ts',
  'A\tsrc/orgunits/subjectRegistry/reviewAttestation.ts',
  'M\tsrc/orgunits/subjectRegistry/reviewAuthority.ts',
  'A\tsrc/orgunits/subjectRegistry/reviewEvidence.ts',
  'M\tsrc/orgunits/subjectRegistry/store.ts',
  'M\tsrc/orgunits/subjectRegistry/writer.ts',
  ...REVIEW_FILES.map((f) => `A\t${f}`),
  `A\t${FIREWALL}`,
  'A\tsrc/test/helpers/ownerReviewFixtures.ts',
  'A\tsrc/test/integration/discoverySubjectReviewB23.test.ts',
  `M\t${B21_SCHEMA_TEST}`,
  `M\t${B22_INTEGRATION}`,
  `M\t${SCHEMA_INVENTORY}`,
  'A\tsrc/test/unit/discoverySubjectReviewB23.test.ts',
  `M\t${B22_UNIT}`,
  `M\t${A1_FRAME_TEST}`,
].sort();

/** The B3.0 research cohort guard, byte for byte (commit 9b3c4e7). */
const B30_PATHS = [
  'docs/evaluation/TRACK_B_B3_0_RESEARCH_COHORT_GUARD_V1.md',
  'docs/evaluation/TRACK_B_B3_0_RESEARCH_COHORT_GUARD_OWNER_DECISION_V1.json',
  'src/cli/commands/discover.ts',
  'src/orgunits/orchestrator/',
  'src/test/firewall/phase2bResearchCohortGuard.firewall.test.ts',
  'src/test/helpers/syntheticCohortRegistry.ts',
  'src/test/integration/orgunitResearchCohortGuard.test.ts',
  'src/test/unit/researchCohortGuardB30.test.ts',
];

/** Paths this change may not touch at all. */
const FORBIDDEN_PATHS = [
  ...B30_PATHS,
  'src/orgunits/identity/',
  'src/orgunits/classify/',
  'src/orgunits/web/',
  'src/orgunits/signals/',
  'src/orgunits/sitemap.ts',
  'src/cli/commands/classify.ts',
  'src/cli/commands/classifyProvider.ts',
  'src/cli/commands/classifyRead.ts',
  'src/cli/commands/ewp.ts',
  'src/cli/commands/ingestEche.ts',
  'src/cli/commands/ingestRuns.ts',
  'src/cli/commands/orgs.ts',
  'src/cli/commands/website.ts',
  'src/ingest/',
  'src/website/',
  'src/compare/',
  'src/db/',
  'src/logging/',
  'src/test/harness/',
  'src/test/helpers/discoveryIdentityFixtures.ts',
  'src/test/integration/helpers.ts',
  'src/test/integration/cohortTestRegistry.ts',
  'docs/adr/0001-ewp-registry-second-official-source.md',
  'docs/adr/0019-first-class-discovery-subject-identity.md',
  'docs/adr/0020-controlled-discovery-subject-registry.md',
  'docs/evaluation/TRACK_B_B2_1_MICRO_ORGANISATION_IDENTITY_OWNER_DECISION_V1.json',
  'docs/evaluation/TRACK_B_B2_2_DISCOVERY_SUBJECT_REGISTRY_OWNER_DECISION_V1.json',
  'docs/evaluation/corpus/',
  'scripts/',
  'docker/',
  'docker-compose.yml',
  '.env.example',
  'package.json',
  'package-lock.json',
  'CLAUDE.md',
];

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

/** Sources at the terminal commit once pinned, the working tree until then; one read per file. */
const pinnedSources = new Map<string, string>();
function sourceOf(path: string): string {
  if (REPAIR_TERMINAL_COMMIT === null) return readFileSync(join(REPO_ROOT, path), 'utf8');
  const object = `${REPAIR_TERMINAL_COMMIT}:${path}`;
  let source = pinnedSources.get(object);
  if (source === undefined) {
    source = execFileSync('git', ['-C', REPO_ROOT, 'show', object], { encoding: 'utf8' });
    pinnedSources.set(object, source);
  }
  return source;
}

function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function sqlCodeOf(source: string): string {
  return source.replace(/--.*$/gm, '');
}

/** Every production TypeScript file (non-test) under `src/` AS B2.3 LEFT IT: at the terminal commit once pinned. */
function productionFilesOfThisSlice(): string[] {
  if (REPAIR_TERMINAL_COMMIT === null) return productionFiles();
  return execFileSync(
    'git',
    ['-C', REPO_ROOT, 'ls-tree', '-r', '--name-only', REPAIR_TERMINAL_COMMIT, '--', 'src'],
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter((f) => f.endsWith('.ts') && !f.startsWith('src/test/'))
    .sort();
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

/** Every file git would track (tracked plus untracked, ignoring .gitignore'd paths). */
function repositoryFiles(): string[] {
  return execFileSync(
    'git',
    ['-C', REPO_ROOT, 'ls-files', '--cached', '--others', '--exclude-standard'],
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter((l) => l.length > 0);
}

const importsOf = (file: string) =>
  [...codeOf(sourceOf(file)).matchAll(/from '([^']+)'/g)].map((m) => m[1]!);

const describeRange = rangeAvailable ? describe : describe.skip;

describeRange('B2.3 owner-attested review: the change stays inside its authorised scope', () => {
  it('changes exactly the authorised files, by path and status', () => {
    expect(changeset()).toEqual(AUTHORISED_CHANGESET);
  });

  it('leaves B3.0, B2.1, B1.1, the classifier, the gateway, ingestion, dependencies and every earlier record untouched', () => {
    expect(changeset(...FORBIDDEN_PATHS)).toEqual([]);
    expect(changeset('docs/adr/')).toEqual([`A\t${ADR}`]);
    expect(changeset('docs/evaluation/')).toEqual([`A\t${OWNER_RECORD}`]);
  });

  it('adds exactly one migration and edits none of 0001-0014', () => {
    expect(changeset('migrations/')).toEqual([`A\t${MIGRATION}`]);
  });

  it('adds exactly one firewall and edits no pinned historical firewall', () => {
    expect(changeset('src/test/firewall/')).toEqual([`A\t${FIREWALL}`]);
  });

  it('leaves the classifier cohort guard pins untouched, and they still verify', () => {
    for (const pin of EVALUATION_COHORT_ARTIFACT_PINS) {
      expect(changeset(pin.path), pin.path).toEqual([]);
    }
    expect(loadEvaluationCohortRegistry().ok).toBe(true);
  });

  it('extends the CLI entry point only by the offline signer dispatch', () => {
    const { removed, added } = diffLines(CLI_ENTRY);
    expect(removed).toEqual([]);
    expect(added.filter((l) => !/^\s*\/\//.test(l))).toEqual([
      "import { runDiscoveryReviewSign } from './commands/discoveryReviewSign.js';",
      '  nwf-pe discovery-subject-review-sign --request <path> --encrypted-key <path> --key-id <id>',
      '                              (OFFLINE; signs one prepared OWNER review request)',
      "  if (argv[0] === 'discovery-subject-review-sign') {",
      '    return runDiscoveryReviewSign(argv.slice(1));',
      '  }',
    ]);
  });

  it('extends the environment only by the reviewer connection variables', () => {
    const { removed, added } = diffLines(ENV);
    expect(removed).toEqual([
      "  'admin' | 'ingest' | 'readonly' | 'research' | 'classifier' | 'discovery_subject_writer';",
    ]);
    expect(added.filter((l) => !/^\s*\/\//.test(l))).toEqual([
      '  DATABASE_URL_DISCOVERY_SUBJECT_REVIEWER: z.string().min(1).optional(),',
      '  DATABASE_URL_DISCOVERY_SUBJECT_REVIEWER_TEST: z.string().min(1).optional(),',
      "  | 'admin'",
      "  | 'ingest'",
      "  | 'readonly'",
      "  | 'research'",
      "  | 'classifier'",
      "  | 'discovery_subject_writer'",
      "  | 'discovery_subject_reviewer';",
      "  discovery_subject_reviewer: 'DATABASE_URL_DISCOVERY_SUBJECT_REVIEWER',",
      "  discovery_subject_reviewer: 'DATABASE_URL_DISCOVERY_SUBJECT_REVIEWER_TEST',",
    ]);
  });

  it('acknowledges 0015 and B2.3 semantics in the historical tests exactly, and changes nothing else there', () => {
    const inventory = diffLines(SCHEMA_INVENTORY);
    expect(inventory.removed).toEqual([
      "    it('records versions 0001 through 0014 with no gaps', async () => {",
      '      // no UPDATE/DELETE/TRUNCATE). This list is pinned deliberately',
    ]);
    expect(inventory.added.filter((l) => !/^\s*\/\//.test(l))).toEqual([
      "    it('records versions 0001 through 0015 with no gaps', async () => {",
      "        '0015',",
    ]);

    const frame = diffLines(A1_FRAME_TEST);
    expect(frame.removed).toEqual([]);
    expect(frame.added).toEqual([
      '  {',
      "    file: '0015_discovery_subject_review_attestation.sql',",
      `    adr: '${ADR}',`,
      `    ownerRecord: '${OWNER_RECORD}',`,
      '  },',
    ]);

    const b21 = diffLines(B21_SCHEMA_TEST);
    expect(b21.removed).toEqual([]);
    expect(b21.added.filter((l) => !/^\s*--/.test(l))).toEqual([
      "            AND grantee <> 'nwf_discovery_subject_reviewer'",
    ]);

    // B2.2: an UNATTESTED review is history, never authority - and (B2.3-R2)
    // an unattested rejection hides no claimed kind.
    const b22i = diffLines(B22_INTEGRATION);
    expect(b22i.removed).toEqual([
      "      expect(rows[0]!.top).toBe('0014');",
      '      expect(m.kinds.claimed).toEqual([]);',
      '      expect(m.identityStatus.reviewConfirmed).toBe(true);',
      "      expect((await inspect(id)).kinds.reviewed).toBe('INTERNAL_STUDENT_GROUP');",
    ]);
    expect(b22i.added.filter((l) => !/^\s*\/\//.test(l))).toEqual([
      "      expect(rows[0]!.top).toBe('0015');",
      "      expect(m.kinds.claimed).toEqual(['INTERNAL_STUDENT_GROUP']);",
      '      expect(m.identityStatus.reviewConfirmed).toBe(false);',
      "      expect(m.reviewAttestation.state).toBe('INTEGRITY_HOLD');",
      '      expect((await inspect(id)).kinds.reviewed).toBe(null);',
    ]);
    const b22u = diffLines(B22_UNIT);
    expect(b22u.removed).toEqual([
      '    expect(confirmed.identityStatus.reviewConfirmed).toBe(true);',
      "    expect(confirmed.kinds.reviewed).toBe('INDEPENDENT_COMMUNITY');",
      '    expect(m.kinds.claimed).toEqual([]);',
    ]);
    expect(b22u.added.filter((l) => !/^\s*\/\//.test(l))).toEqual([
      '    expect(confirmed.identityStatus.reviewConfirmed).toBe(false);',
      '    expect(confirmed.kinds.reviewed).toBe(null);',
      "        'IDENTITY_NOT_REVIEW_CONFIRMED',",
      "        'REVIEW_ATTESTATION_NOT_EVALUATED',",
      "    expect(m.kinds.claimed).toEqual(['INTERNAL_STUDENT_GROUP']);",
      "        'effectiveReview',",
    ]);
    for (const file of [
      SCHEMA_INVENTORY,
      A1_FRAME_TEST,
      B21_SCHEMA_TEST,
      B22_INTEGRATION,
      B22_UNIT,
    ]) {
      expect(diffLines(file).added.join('\n'), file).not.toMatch(
        /\.skip\(|\.todo\(|\.only\(|process\.env/,
      );
    }
  });

  it('records the OWNER decision for the migration, with no activation and no key', () => {
    const record = JSON.parse(sourceOf(OWNER_RECORD)) as Record<string, unknown>;
    expect(sourceOf(OWNER_RECORD)).toContain(MIGRATION);
    expect(record['operationalKeyProvisioned']).toBe(false);
    expect(record['productionReviewActivated']).toBe(false);
    expect(record['researchAdmissionImplemented']).toBe(false);
    expect(record['canonicalIdentityIssued']).toBe(false);
  });
});

describe('B2.3 protocol and verification: domain-separated, signature-first, sealed', () => {
  it('names one protocol, one action audience and one domain-separation prefix', () => {
    expect(reviewProtocol.REVIEW_PROTOCOL).toBe('nwf-pe.discovery-subject-review/1');
    expect(reviewProtocol.REVIEW_SIGNING_PREFIX).toBe('nwf-pe.discovery-subject-review/1\n');
    expect(reviewProtocol.REVIEW_ACTION_AUDIENCE).toBe('APPEND_DISCOVERY_SUBJECT_REVIEW');
    expect([
      reviewProtocol.REVIEW_DEFAULT_LIFETIME_SECONDS,
      reviewProtocol.REVIEW_MAX_LIFETIME_SECONDS,
      reviewProtocol.REVIEW_MAX_CLOCK_SKEW_SECONDS,
    ]).toEqual([900, 3600, 300]);
    // Never another protocol's prefix (the Operator's release / registry sync).
    expect(reviewProtocol.REVIEW_SIGNING_PREFIX).not.toMatch(
      /nwf-(release|registry|engine-view)-sync/,
    );
  });

  it('verifies the Ed25519 signature before it parses a single signed byte', () => {
    const code = codeOf(sourceOf('src/orgunits/subjectReview/verify.ts'));
    const order = [
      'trust.keyFor(keyId)',
      'ed25519Verify(null, reviewSigningBytes(payloadBytes), trusted.key, signature)',
      'parseCanonicalBytes(payloadBytes)',
      'parseReviewPayload(json)',
      'payload.keyFingerprint !== trusted.entry.fingerprint',
    ].map((s) => code.indexOf(s));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(code).toMatch(/readonly #sealed = true;/);
    expect(code).toMatch(/private constructor\(/);
    expect(code.match(/new VerifiedReviewEnvelope\(/g)).toHaveLength(1);
  });

  it('keeps every private-key operation inside the offline signer', () => {
    for (const file of productionFiles()) {
      if (file === 'src/orgunits/subjectReview/signer.ts') continue;
      const code = codeOf(readFileSync(join(REPO_ROOT, file), 'utf8'));
      expect(code, file).not.toMatch(
        /createPrivateKey|generateKeyPair|ed25519Sign|\bsign\s+as\b|\bfrom 'node:crypto'[^;]*\bsign\b/,
      );
    }
    expect(codeOf(sourceOf('src/orgunits/subjectReview/verify.ts'))).toMatch(
      /import \{ createHash, verify as ed25519Verify \} from 'node:crypto';/,
    );
  });

  it('derives a trusted reviewer ONLY from a verified envelope, and the actor key from its key id', () => {
    const authority = codeOf(sourceOf('src/orgunits/subjectRegistry/reviewAuthority.ts'));
    expect([...authority.matchAll(/static (\w+)\(/g)].map((m) => m[1]).sort()).toEqual([
      'attestationOf',
      'fromVerifiedEnvelope',
      'isContext',
      'testSeam',
    ]);
    expect(authority).toMatch(/if \(!VerifiedReviewEnvelope\.isVerified\(verified\)\) \{/);
    expect(authority).toContain(
      'return new TrustedReviewerContext(reviewerActorKeyOf(verified.keyId), verified);',
    );
    expect(authority.match(/new TrustedReviewerContext\(/g)).toHaveLength(2);
    expect(authority).toMatch(/private constructor\(actorKey: string, attestation:/);
    // The writer re-verifies against the trust set it executes under.
    const writer = codeOf(sourceOf('src/orgunits/subjectRegistry/writer.ts'));
    expect(writer).toContain('TrustedReviewerContext.attestationOf(reviewer)');
    expect(writer).toMatch(/verifySignedReviewPayload\(\s*envelope\.keyId,/);
  });

  it('executes in one transaction in the order the ADR states', () => {
    const writer = codeOf(sourceOf('src/orgunits/subjectRegistry/writer.ts'));
    const body = writer.slice(writer.indexOf('export async function appendAttestedReview('));
    const order = [
      'verifySignedReviewPayload(',
      "await client.query('BEGIN');",
      'await enterReviewerCapability(client);',
      'await reviewEnvironmentId(client);',
      'await databaseNow(client);',
      'check.trusted.mayDecideAt(nowMs)',
      'await lockSubject(client, p.subjectId);',
      'FROM subject_review_attestations WHERE nonce = $1',
      'await judgeReview(client, request, now, randomUUID(), reviewer.actorKey, {',
      'reviewEvidenceOf(judged.before!, request.target)',
      'await client.query(REVIEW_INSERT, [',
      'await client.query(ATTESTATION_INSERT, [',
      "await client.query('COMMIT');",
    ].map((s) => body.indexOf(s));
    expect(
      order.every((i) => i >= 0),
      JSON.stringify(order),
    ).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(body).toContain("await client.query('ROLLBACK')");
  });

  it('is used by no research, classifier or orchestration path', () => {
    const exempt = (file: string) =>
      file.startsWith(REVIEW_DIR) ||
      file.startsWith(REGISTRY_DIR) ||
      file === CLI_COMMAND ||
      file === SIGN_CLI ||
      file === CLI_ENTRY;
    const forbidden =
      /subjectReview|subjectRegistry|appendAttestedReview|prepareReview|fromVerifiedEnvelope|VerifiedReviewEnvelope|ReviewTrustSet/;
    // HISTORICAL (B2.3 as accepted, over the pinned tree): no other production
    // file named the protocol, the registry or the trust set at all.
    for (const file of productionFilesOfThisSlice()) {
      if (exempt(file)) continue;
      expect(codeOf(sourceOf(file)), file).not.toMatch(forbidden);
    }
    // CURRENT (working tree): the same, except that exactly the B2.4-R1a
    // projection files may use exactly the read-only forms above. The original
    // check then runs on what remains, so the writer, signer, verifier,
    // reviewer authority or a test trust seam still fails.
    for (const file of productionFiles()) {
      if (exempt(file)) continue;
      let code = codeOf(readFileSync(join(REPO_ROOT, file), 'utf8'));
      if (B24_REVIEW_READERS.includes(file)) {
        for (const form of B24_READ_ONLY_FORMS) code = code.replace(form, '');
      }
      expect(code, file).not.toMatch(forbidden);
    }
  });
});

describe('B2.3 trust set: pinned source, public keys only, no operational key, tests never operational', () => {
  const trust = codeOf(sourceOf('src/orgunits/subjectReview/trust.ts'));

  it('pins an EMPTY operational trust set in reviewed source', () => {
    expect(trust).toContain(
      'export const OPERATIONAL_OWNER_REVIEW_KEYS: readonly ReviewTrustEntry[] = Object.freeze([]);',
    );
    expect(reviewTrust.OPERATIONAL_OWNER_REVIEW_KEYS).toEqual([]);
    expect(reviewTrust.ReviewTrustSet.operational().hasActiveKey()).toBe(false);
  });

  it('builds sets only from that list or an ephemeral vitest-only TEST_ONLY list', () => {
    expect([...trust.matchAll(/static (\w+)\(/g)].map((m) => m[1]).sort()).toEqual([
      'ephemeralForVitest',
      'isTrustSet',
      'operational',
    ]);
    expect(trust).toMatch(/private constructor\(scope: ReviewTrustScope/);
    expect(trust).toContain("if (process.env['VITEST'] !== 'true') {");
    expect(trust).toContain("validateTrustEntries(OPERATIONAL_OWNER_REVIEW_KEYS, 'OPERATIONAL')");
    expect(trust).toContain("validateTrustEntries(entries, 'TEST_ONLY')");
    expect(trust).toContain('if ((scope ===');
    for (const file of productionFiles()) {
      if (file === 'src/orgunits/subjectReview/trust.ts') continue;
      const code = codeOf(readFileSync(join(REPO_ROOT, file), 'utf8'));
      expect(code, file).not.toMatch(/ephemeralForVitest/);
      if (file !== 'src/orgunits/subjectRegistry/reviewAuthority.ts') {
        expect(code, file).not.toMatch(/\btestSeam\s*\(/);
      }
    }
  });

  it('reads no key from the database, the environment, a file or a CLI option', () => {
    expect(importsOf('src/orgunits/subjectReview/trust.ts').sort()).toEqual(
      ['./protocol.js', 'node:crypto'].sort(),
    );
    for (const spec of [
      ...Object.values(DISCOVERY_SUBJECTS_OPTIONS),
      DISCOVERY_REVIEW_SIGN_OPTIONS,
    ]) {
      for (const option of Object.keys(spec)) {
        expect(option).not.toMatch(/public|trust|fingerprint|actor|owner|reviewer|signature|pass/);
      }
    }
    expect(Object.keys(DISCOVERY_SUBJECTS_OPTIONS['review']!).sort()).toEqual(
      [
        'subject',
        'identity-claim',
        'relationship-claim',
        'outcome',
        'expect-head',
        'expect-state',
        'reason',
        'prepare',
        'envelope',
        'json',
        'execute',
      ].sort(),
    );
    expect(Object.keys(DISCOVERY_REVIEW_SIGN_OPTIONS).sort()).toEqual(
      ['encrypted-key', 'key-id', 'lifetime-minutes', 'request'].sort(),
    );
  });

  it('contains no private key, seed, passphrase or PEM key block anywhere in the tree', () => {
    const pemBlock = /-----BEGIN [A-Z ]*PRIVATE KEY-----\r?\n[A-Za-z0-9+/=]{40,}/;
    for (const file of repositoryFiles()) {
      if (file.startsWith('node_modules/')) continue;
      let text: string;
      try {
        if (statSync(join(REPO_ROOT, file)).size > 4 * 1024 * 1024) continue;
        text = readFileSync(join(REPO_ROOT, file), 'latin1');
      } catch {
        continue;
      }
      expect(pemBlock.test(text), file).toBe(false);
      expect(
        /\bpassphrase\s*[:=]\s*['"][^'"]{8,}['"]/i.test(text) && !file.startsWith('src/test/'),
        file,
      ).toBe(false);
    }
  });
});

describe('B2.3 offline signer: no network, no database, no environment', () => {
  it('imports only node:crypto, node:fs, node:path and the protocol', () => {
    expect(importsOf('src/orgunits/subjectReview/signer.ts').sort()).toEqual(
      ['./canonical.js', './protocol.js', 'node:crypto', 'node:fs', 'node:path'].sort(),
    );
    expect(importsOf(SIGN_CLI).sort()).toEqual(
      [
        '../../orgunits/subjectReview/protocol.js',
        '../../orgunits/subjectReview/protocol.js',
        '../../orgunits/subjectReview/signer.js',
        'node:util',
      ].sort(),
    );
    for (const file of ['src/orgunits/subjectReview/signer.ts', SIGN_CLI]) {
      const code = codeOf(sourceOf(file));
      expect(code, file).not.toMatch(
        /process\.env|\bpg\b'|\/db\/|config\/env|\bfetch\s*\(|node:(net|tls|http|https|dns|child_process)/,
      );
      expect(code, file).not.toMatch(/writeFile|createWriteStream|appendFile/);
    }
  });

  it('demands an encrypted PKCS#8 key, owner-only permissions, no symlink and a real terminal', () => {
    const signer = codeOf(sourceOf('src/orgunits/subjectReview/signer.ts'));
    for (const token of [
      'BEGIN ENCRYPTED PRIVATE KEY',
      "throw new ReviewSigningRefusal('path_is_symlink')",
      "throw new ReviewSigningRefusal('path_traverses_symlink')",
      "throw new ReviewSigningRefusal('key_file_permissions_too_open')",
      "throw new ReviewSigningRefusal('key_directory_unsafe')",
      'fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW',
      "new ReviewSigningRefusal('interactive_terminal_required')",
      'passphrase.fill(0);',
      'pem.fill(0);',
    ]) {
      expect(signer, token).toContain(token);
    }
  });

  it('exposes no generic signing API: every signing export signs a review intent only', () => {
    expect(Object.keys(reviewSigner).sort()).toEqual(
      [
        'REVIEW_REQUEST_FILE_MAX_BYTES',
        'ReviewSigningRefusal',
        'SIGNING_KEY_FILE_MAX_BYTES',
        'decryptSigningKey',
        'readEncryptedSigningKeyFile',
        'readPassphraseFromTerminal',
        'readReviewRequestFile',
        'reviewIntentOf',
        'signReviewIntent',
      ].sort(),
    );
  });
});

describe('B2.3 migration 0015: structure only, distinct capabilities, no key table', () => {
  const sql = sqlCodeOf(readFileSync(join(REPO_ROOT, MIGRATION), 'utf8'));

  it('creates exactly two tables, one NOLOGIN role, three functions and the declared triggers', () => {
    expect([...sql.matchAll(/CREATE TABLE (\w+)/g)].map((m) => m[1])).toEqual(NEW_TABLES);
    expect(
      [...sql.matchAll(/CREATE ROLE (\w+)([^;]*);/g)].map((m) => [m[1], m[2]!.trim()]),
    ).toEqual([['nwf_discovery_subject_reviewer', 'NOLOGIN']]);
    expect(sql).toMatch(
      /ALTER ROLE nwf_discovery_subject_reviewer\s+NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD NULL;/,
    );
    expect([...sql.matchAll(/CREATE FUNCTION (\w+)/g)].map((m) => m[1])).toEqual([
      'subject_review_attestation_bind',
      'discovery_review_bind_reviewer_actor',
      'discovery_review_require_attestation',
    ]);
    expect(sql).toMatch(
      /CREATE CONSTRAINT TRIGGER discovery_subject_reviews_require_attestation\s+AFTER INSERT ON discovery_subject_reviews\s+DEFERRABLE INITIALLY DEFERRED/,
    );
    expect(sql).not.toMatch(
      /ALTER TABLE|\bDROP\b|SECURITY DEFINER|\bLOGIN PASSWORD\b|PASSWORD '|\bjsonb?\b/i,
    );
    expect(sql).not.toMatch(/^\s*(UPDATE \w+ SET|DELETE FROM|TRUNCATE)\b/im);
    // The only row it writes is this database's own generated environment id.
    expect(
      [...sql.matchAll(/INSERT INTO (\w+)([^;]*);/g)].map((m) => [m[1], m[2]!.trim()]),
    ).toEqual([['subject_review_environment', 'DEFAULT VALUES']]);
  });

  it('holds no trust, key, eligibility, clearance, canonical or contact column', () => {
    const columns = sql.match(/CREATE TABLE[\s\S]*?\n\);/g)!.join('\n');
    expect(columns).not.toMatch(
      /public_key|private|secret|passphrase|trusted|eligib|clear|admit|permission|research|suppress|canonical|cand_|chn_|opp_|same_actor|email|phone|contact|status|verified/i,
    );
  });

  it('grants the reviewer exactly its capability, the writer nothing, and every other role at most SELECT', () => {
    const grants = [
      ...sql.matchAll(/\bGRANT\s+([A-Za-z, ()_]+?)\s+ON\s+([^;]+?)\s+TO\s+([a-z_]+)/g),
    ].map((m) => [m[1]!.replace(/\s+/g, ' '), m[2]!.replace(/\s+/g, ' ').trim(), m[3]]);
    expect(grants).toEqual([
      ['CONNECT', 'DATABASE %I', 'nwf_discovery_subject_reviewer'],
      ['USAGE', 'SCHEMA public', 'nwf_discovery_subject_reviewer'],
      [
        'SELECT',
        'discovery_subjects, discovery_subject_identity_claims, discovery_subject_relationship_claims',
        'nwf_discovery_subject_reviewer',
      ],
      [
        'SELECT, INSERT',
        'discovery_subject_reviews, subject_review_attestations',
        'nwf_discovery_subject_reviewer',
      ],
      ['SELECT', 'subject_review_environment', 'nwf_discovery_subject_reviewer'],
      ['SELECT (eche_row_key)', 'organisations', 'nwf_discovery_subject_reviewer'],
      ['SELECT', 'subject_review_environment, subject_review_attestations', 'nwf_readonly'],
    ]);
    expect(sql).not.toMatch(/GRANT\s+nwf_discovery_subject_(reviewer|writer)\s+TO/i);
    expect(sql).not.toMatch(/\b(UPDATE|DELETE|TRUNCATE|REFERENCES|TEMPORARY|TEMP)\b[^;]*\bTO\b/);
    expect(sql).toMatch(
      /REVOKE ALL ON subject_review_environment, subject_review_attestations\s+FROM PUBLIC, nwf_ingest, nwf_research, nwf_classifier, nwf_readonly,\s+nwf_discovery_subject_writer;/,
    );
  });

  it('binds the attestation to its review, its transaction, this environment and the database clock', () => {
    for (const token of [
      "r.actor_key IS DISTINCT FROM ('owner-review-' || NEW.key_id)",
      'r.supersedes_review_id IS DISTINCT FROM NEW.expected_head_review_id',
      'pg_current_xact_id()',
      'FROM subject_review_environment',
      'now_ts < NEW.expires_at',
      "NEW.issued_at <= now_ts + interval '300 seconds'",
      "CHECK (expires_at > issued_at AND expires_at <= issued_at + interval '60 minutes')",
      'CREATE UNIQUE INDEX subject_review_attestations_nonce_uidx',
      'CREATE UNIQUE INDEX subject_review_attestations_review_uidx',
    ]) {
      expect(sql, token).toContain(token);
    }
  });
});

describe('B2.3 research and canonical identity: a review is neither', () => {
  const owned = [...REVIEW_FILES, ...REGISTRY_FILES, CLI_COMMAND, SIGN_CLI];

  it('never grants research admission, clears a protection or reads a cohort', () => {
    const readModel = codeOf(sourceOf('src/orgunits/subjectRegistry/readModel.ts'));
    expect(readModel).toMatch(/readonly granted: false;/);
    expect(readModel).toMatch(/researchAuthority: \{ granted: false, status: 'NOT_GRANTED'/);
    expect(readModel).toContain("'REQUIRES_PROTECTION_REEVALUATION'");
    for (const file of owned) {
      const code = codeOf(sourceOf(file));
      expect(code, file).not.toMatch(/granted:\s*true|NO_KNOWN_STRUCTURAL_PARENT_BLOCK/);
      expect(code, file).not.toMatch(
        /evaluationCohortGuard|researchCohortGuard|loadEvaluationCohort|cohortRegistry/,
      );
      expect(code, file).not.toMatch(
        /orgunits\/(classify|orchestrator|web|signals)|claude-agent-sdk|anthropic|executeWebAttempt/i,
      );
    }
    const exported = [
      registryAttestation,
      registryEvidence,
      reviewCanonical,
      reviewProtocol,
      reviewSigner,
      reviewTrust,
      reviewVerify,
    ].flatMap((m) => Object.keys(m));
    for (const name of exported) {
      expect(name).not.toMatch(/admi|clear|eligib|permit|unblock|suppress/i);
    }
  });

  it('B2.3-R2: derives every fact from the one effective-review projection and keeps protection monotonic', () => {
    const readModel = codeOf(sourceOf('src/orgunits/subjectRegistry/readModel.ts'));
    const attestation = codeOf(sourceOf('src/orgunits/subjectRegistry/reviewAttestation.ts'));
    // One projection, defined once, admitting a chain only when EVERY row is current authority.
    expect(attestation.match(/export function effectiveReviewProjection\(/g)).toHaveLength(1);
    expect(attestation).toContain('chain.every((r) => authoritative.has(r.id))');
    // Both read paths (show and list) go through it.
    expect(readModel.match(/effectiveReviewProjection\(/g)).toHaveLength(2);
    expect(readModel).toContain('reviews: projection.reviews');
    // The structural evaluator is called from exactly one place, once per reading.
    expect(readModel.match(/evaluateStructuralParentConstraint\(/g)).toHaveLength(1);
    for (const reading of ['baseline', 'recorded', 'effective']) {
      expect(readModel).toContain(`readings.${reading}`);
    }
    // Research reasons are built from the conservative union, never the effective reading alone.
    expect(readModel).toContain('...protection.structuralUncertainty.map(');
    expect(readModel).toContain("'REQUIRES_PROTECTION_REEVALUATION'");
    // No other registry module derives structure or kind evidence from reviews.
    for (const file of REGISTRY_FILES.filter((f) => !f.endsWith('/readModel.ts'))) {
      expect(codeOf(sourceOf(file)), file).not.toMatch(
        /evaluateStructuralParentConstraint|kindEvidenceOf/,
      );
    }
  });

  it('issues no canonical identity: no cand:/chn:/opp:, no SAME_ACTOR, no merge or handoff', () => {
    const exported = [
      registryAttestation,
      registryEvidence,
      reviewCanonical,
      reviewProtocol,
      reviewSigner,
      reviewTrust,
      reviewVerify,
    ].flatMap((m) => Object.keys(m));
    for (const name of exported) {
      expect(name).not.toMatch(
        /merge|split|unify|dedup|resolv|link|equivalen|sameActor|promot|canonicalId|issue|mint|handoff|adopt|candidate|channel|opportunit/i,
      );
    }
    for (const file of owned) {
      const code = codeOf(sourceOf(file));
      expect(code, file).not.toMatch(/[`'"](cand|chn|opp):/);
      expect(code, file).not.toMatch(
        /sameActor|SAME_ACTOR|mergedInto|equivalentTo|identityRegister|nwf_identity\b/,
      );
    }
  });

  it('issues a closed set of SQL: INSERTs into the four B2.2 tables and the attestations, from writer.ts only', () => {
    for (const file of owned) {
      const code = codeOf(sourceOf(file));
      expect(code, file).not.toMatch(
        /\bUPDATE\s+\w+\s+SET|\bDELETE\s+FROM|\bTRUNCATE\b|\b(ALTER|DROP|CREATE)\s+(TABLE|ROLE|FUNCTION|TRIGGER|INDEX)|\bGRANT\s|\bREVOKE\s|session_replication_role|DISABLE\s+TRIGGER/i,
      );
      const inserts = [...code.matchAll(/INSERT INTO (\w+)/g)].map((m) => m[1]);
      expect(inserts, file).toEqual(
        file === 'src/orgunits/subjectRegistry/writer.ts'
          ? [
              'discovery_subjects',
              'discovery_subject_identity_claims',
              'discovery_subject_relationship_claims',
              'discovery_subject_reviews',
              'subject_review_attestations',
            ]
          : [],
      );
    }
  });
});
