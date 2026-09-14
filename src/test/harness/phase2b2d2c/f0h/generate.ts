/**
 * PHASE 2B-2D2C-F0H — THE ATTEMPT-2 FAILURE CENSUS DERIVATION ENTRY POINT.
 *
 *   node --import tsx src/test/harness/phase2b2d2c/f0h/generate.ts \
 *     --attempt2-root <preserved attempt-2 dir> \
 *     --out docs/evaluation/PHASE_2B_2D2C_F0H_ATTEMPT_2_FAILURE_CENSUS_V1.json
 *
 * Reads the COMMITTED attempt-2 scored-items.jsonl (the source of every
 * verdict/unit-type/validator-state field) and, READ-ONLY, the preserved
 * attempt-2 root's own hash-verified repair records (the source of the
 * per-item repair artifact-hash pointer only — no raw model output, no
 * rationale, no evidence text). It performs no inference, no provider
 * call, no authentication, no database or network access, and writes only
 * the one Prettier-laid-out JSON file named by `--out`. Re-running it is
 * byte-stable.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import { COMMITTED_ATTEMPT2_RESULTS_DIR } from '../scoring/attempt2Generate.js';
import { loadAttempt2ScoringSources } from '../scoring/attempt2Sources.js';
import {
  buildAttempt2FailureCensus,
  V1,
  V2,
  V3,
  type FailureCensus,
  type RepairPointer,
} from './census.js';
import { parseScoredItemsJsonl } from '../v3d1/census.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const F0H_REPO_ROOT = resolve(HERE, '..', '..', '..', '..', '..');

export const CENSUS_SOURCE_PATH = `${COMMITTED_ATTEMPT2_RESULTS_DIR}/scored-items.jsonl`;
export const COMMITTED_CENSUS_PATH =
  'docs/evaluation/PHASE_2B_2D2C_F0H_ATTEMPT_2_FAILURE_CENSUS_V1.json';

export interface CensusDocument {
  readonly recordId: 'PHASE_2B_2D2C_F0H_ATTEMPT_2_FAILURE_CENSUS_V1';
  readonly kind: 'DIAGNOSTIC_CENSUS_DERIVED_FROM_COMMITTED_SCORING';
  readonly sourceScoredItemsPath: string;
  readonly sourceScoredItemsSha256: string;
  readonly attempt2RepairArtifactInventorySha256: string;
  readonly excludedFromOutputs: readonly string[];
  readonly census: FailureCensus;
}

export function buildCensusDocument(repoRoot: string, attempt2Root: string): CensusDocument {
  const text = readFileSync(join(repoRoot, CENSUS_SOURCE_PATH), 'utf8');
  const rows = parseScoredItemsJsonl(text);
  const v1Rows = rows.filter((r) => r.variantName === V1);
  const v2Rows = rows.filter((r) => r.variantName === V2);
  const v3Rows = rows.filter((r) => r.variantName === V3);

  // READ-ONLY: the attempt-2 root's own hash-verified repair records, for
  // the artifact-hash pointer only. `loadAttempt2ScoringSources` is the
  // same production loader the attempt-2 scorer itself uses.
  const attempt2 = loadAttempt2ScoringSources(repoRoot, attempt2Root);
  const repairsByGoldId = new Map<string, RepairPointer>();
  for (const evaluation of attempt2.evaluations) {
    for (const repair of evaluation.repairs) {
      const goldId =
        evaluation.orderedGoldIds[evaluation.orderedDocIndices.indexOf(repair.docIndex)];
      if (goldId === undefined) continue;
      repairsByGoldId.set(goldId, {
        round: 1,
        category: repair.reasonCodes.join(','),
        disposition: repair.disposition,
        artifactFileSha256: repair.artifactFileSha256,
      });
    }
  }

  return {
    recordId: 'PHASE_2B_2D2C_F0H_ATTEMPT_2_FAILURE_CENSUS_V1',
    kind: 'DIAGNOSTIC_CENSUS_DERIVED_FROM_COMMITTED_SCORING',
    sourceScoredItemsPath: CENSUS_SOURCE_PATH,
    sourceScoredItemsSha256: createHash('sha256').update(text, 'utf8').digest('hex'),
    attempt2RepairArtifactInventorySha256: attempt2.repairArtifactInventory.sha256,
    excludedFromOutputs: [
      'raw model output',
      'rationale text',
      'evidence quote text',
      'unit_name text (only its SHA-256 and presence flag are carried upstream)',
      'chain of thought',
      'credentials or profile information',
    ],
    census: buildAttempt2FailureCensus(v1Rows, v2Rows, v3Rows, repairsByGoldId),
  };
}

export async function renderCensusDocument(document: CensusDocument): Promise<string> {
  const options = await resolveConfig(fileURLToPath(import.meta.url));
  return format(canonicalStringify(document), {
    ...(options ?? {}),
    parser: 'json',
    filepath: join(HERE, 'census.json'),
  });
}

function parseArgs(argv: readonly string[]): {
  readonly out: string;
  readonly attempt2Root: string;
} {
  let out: string | null = null;
  let attempt2Root: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--out') {
      const value = argv[index + 1];
      if (value === undefined) throw new Error('--out needs a value.');
      out = value;
      index += 1;
    } else if (argv[index] === '--attempt2-root') {
      const value = argv[index + 1];
      if (value === undefined) throw new Error('--attempt2-root needs a value.');
      attempt2Root = value;
      index += 1;
    } else {
      throw new Error(`unknown argument ${String(argv[index])}`);
    }
  }
  if (out === null) throw new Error('--out is required.');
  if (attempt2Root === null) throw new Error('--attempt2-root is required.');
  return { out, attempt2Root };
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  const { out, attempt2Root } = parseArgs(process.argv.slice(2));
  const rendered = await renderCensusDocument(buildCensusDocument(F0H_REPO_ROOT, attempt2Root));
  const target = resolve(F0H_REPO_ROOT, out);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, rendered, 'utf8');
  process.stdout.write(`wrote ${target}\n`);
}
