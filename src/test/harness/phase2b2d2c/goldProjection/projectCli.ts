/**
 * PHASE 2B-2D2C-F4A — THE ONE-SHOT PROJECTION RUNNER.
 *
 *   node --import tsx src/test/harness/phase2b2d2c/goldProjection/projectCli.ts \
 *     --authorisation-file <file holding the owner's exact statement>
 *
 * IT REFUSES TO RUN WITHOUT THE OWNER'S EXACT WORDS. The authorisation file
 * must hold `REQUIRED_AUTHORISATION` byte for byte once whitespace is
 * collapsed; "go", "approved" or a paraphrase is rejected. The accepted
 * statement is recorded verbatim in the supplement, so the authority under
 * which the mixed file was touched is part of the committed record.
 *
 * IT IS NOT THE SELECTOR. It receives an already-filtered `ProjectionResult`
 * whose `selected` array holds ONLY allowlisted records — a discarded record
 * has been out of scope since `project.ts` dropped it, and never reaches this
 * file in any form. That is why this is the one module in the projector
 * directory allowed a standard-output channel: there is nothing here it could
 * leak. It prints counts and hashes, never a record and never the source.
 *
 * It writes three things and no more: the 49-record DEVELOPMENT label
 * fixture, its manifest, and the four previously-null provenance fields of
 * the already-committed scoring supplement.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDevAllowlist } from './allowlist.js';
import { projectDevelopmentLabels, renderDevLabelFixture } from './project.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PROJECTOR_REPO_ROOT = resolve(HERE, '..', '..', '..', '..', '..');

export const REQUIRED_AUTHORISATION =
  'I AUTHORISE ONE LOCAL, NON-INFERENCE, MACHINE-ONLY PROJECTION OF THE MIXED 72-RECORD ' +
  'ADJUDICATION FILE ONTO THE 49 FROZEN DEVELOPMENT GOLD IDS. NON-DEVELOPMENT RECORDS MAY BE ' +
  'HANDLED ONLY AS UNAVOIDABLE RAW BYTES FOR ID ROUTING AND WHOLE-FILE INTEGRITY; THEIR IDS, ' +
  'LABELS, AND SEMANTIC FIELDS MUST NOT BE DESERIALIZED, RETAINED, LOGGED, DISPLAYED, EMITTED, ' +
  'SCORED, OR USED. NO HOLDOUT INFERENCE. NO GOLD LABEL CHANGE. NO DATABASE.';

export const FIXTURE_PATH =
  'src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-dev-labels-v1.jsonl';
export const FIXTURE_MANIFEST_PATH =
  'src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-dev-labels-v1.manifest.json';
export const SUPPLEMENT_PATH = 'docs/evaluation/PHASE_2B_2D2C_DEV_SCORING_SUPPLEMENT_V1.json';

function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Whitespace-insensitive, content-exact. A paraphrase still fails. */
export function authorisationMatches(text: string): boolean {
  const normalise = (value: string): string => value.replace(/\s+/gu, ' ').trim();
  return normalise(text) === normalise(REQUIRED_AUTHORISATION);
}

export interface ProjectionRunResult {
  readonly sourceSha256: string;
  readonly recordCount: number;
  readonly fixtureSha256: string;
  readonly fixtureManifestSha256: string;
  readonly supplementSha256: string;
}

export function runProjection(repoRoot: string, authorisationText: string): ProjectionRunResult {
  if (!authorisationMatches(authorisationText)) {
    throw new Error(
      'refusing to open the mixed adjudication file: the authorisation statement does not ' +
        'match the required text exactly.',
    );
  }
  const allowlist = loadDevAllowlist(repoRoot);
  const result = projectDevelopmentLabels(
    join(repoRoot, allowlist.mixedSourcePath),
    allowlist.goldIds,
  );
  const fixture = renderDevLabelFixture(result);
  const fixtureSha256 = sha256Hex(fixture);

  const manifest =
    JSON.stringify(
      {
        fixtureId: 'orgunit-classifier-sonnet-acceptance-dev-labels-v1',
        kind: 'SCORING_ONLY_DEVELOPMENT_GOLD_LABELS',
        split: 'DEVELOPMENT',
        recordCount: result.selected.length,
        schema: 'AdjudicationItemSchema from src/orgunits/classify/evaluation/goldSchema.ts',
        ordering:
          'canonical DEVELOPMENT corpus line order, taken from ' +
          `${allowlist.corpusPath}; never the source file's own order.`,
        serialization:
          'each record is the ORIGINAL byte sequence of its source line, LF-terminated. No ' +
          're-serialisation, no key reordering, no normalisation, no adjudication.',
        fixturePath: FIXTURE_PATH,
        fixtureSha256,
        allowlistSource: allowlist.corpusPath,
        allowlistSourceRawSha256: allowlist.corpusRawSha256,
        allowlistSourceContentSha256: allowlist.corpusContentSha256,
        inferenceFreezeRawSha256: allowlist.freezeRawSha256,
        sourcePath: allowlist.mixedSourcePath,
        sourceWholeFileSha256: result.sourceSha256,
        sourceRecordCountMeasured: false,
        goldIds: result.selected.map((record) => record.goldId),
        excluded: [
          'every HOLDOUT gold id',
          'every HOLDOUT label, verdict, rationale, ambiguity, url, title and organisation name',
          "the source file's total record count",
          "the source file's record order",
        ],
      },
      null,
      2,
    ) + '\n';
  const manifestBytes = Buffer.from(manifest, 'utf8');

  const supplementPath = join(repoRoot, SUPPLEMENT_PATH);
  const supplement = JSON.parse(readFileSync(supplementPath, 'utf8')) as Record<string, unknown>;
  const labelFixture = supplement['labelFixture'] as Record<string, unknown>;
  const provenance = supplement['provenance'] as Record<string, unknown>;
  supplement['status'] = 'ACTIVE_SCORING_ONLY';
  labelFixture['recordCount'] = result.selected.length;
  labelFixture['rawSha256'] = fixtureSha256;
  labelFixture['manifestRawSha256'] = sha256Hex(manifestBytes);
  provenance['sourceWholeFileSha256'] = result.sourceSha256;
  provenance['ownerAuthorisationStatement'] = REQUIRED_AUTHORISATION;
  const supplementText = `${JSON.stringify(supplement, null, 2)}\n`;

  writeFileSync(join(repoRoot, FIXTURE_PATH), fixture);
  writeFileSync(join(repoRoot, FIXTURE_MANIFEST_PATH), manifestBytes);
  writeFileSync(supplementPath, supplementText, 'utf8');

  return {
    sourceSha256: result.sourceSha256,
    recordCount: result.selected.length,
    fixtureSha256,
    fixtureManifestSha256: sha256Hex(manifestBytes),
    supplementSha256: sha256Hex(Buffer.from(supplementText, 'utf8')),
  };
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  const flagIndex = process.argv.indexOf('--authorisation-file');
  const file = flagIndex === -1 ? undefined : process.argv[flagIndex + 1];
  if (file === undefined) throw new Error('--authorisation-file <path> is required.');
  const outcome = runProjection(PROJECTOR_REPO_ROOT, readFileSync(file, 'utf8'));
  process.stdout.write(`source whole-file sha256   ${outcome.sourceSha256}\n`);
  process.stdout.write(`selected DEVELOPMENT rows  ${outcome.recordCount}\n`);
  process.stdout.write(`fixture sha256             ${outcome.fixtureSha256}\n`);
  process.stdout.write(`fixture manifest sha256    ${outcome.fixtureManifestSha256}\n`);
  process.stdout.write(`supplement sha256          ${outcome.supplementSha256}\n`);
}
