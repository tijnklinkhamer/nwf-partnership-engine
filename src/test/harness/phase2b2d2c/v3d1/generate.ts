/**
 * PHASE 2B-2D2C-V3D1 — THE CENSUS DERIVATION ENTRY POINT.
 *
 *   node --import tsx src/test/harness/phase2b2d2c/v3d1/generate.ts \
 *     --out docs/evaluation/PHASE_2B_2D2C_V3D1_FAILURE_CENSUS_V1.json
 *
 * Reads ONLY the committed, post-adjudication scored rows and writes ONE
 * Prettier-laid-out JSON file. It touches no preserved attempt artifact,
 * no raw model output, no provider, no profile, no database. Re-running it
 * is byte-stable: the census is a pure function of the committed rows and
 * the layout is fixed by the repository's own `.prettierrc.json`, exactly
 * as the F4 emitter does it.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import { COMMITTED_ADJUDICATED_RESULTS_DIR } from '../scoring/generate.js';
import { buildFailureCensus, parseScoredItemsJsonl, type FailureCensus } from './census.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const V3D1_REPO_ROOT = resolve(HERE, '..', '..', '..', '..', '..');

export const CENSUS_SOURCE_PATH = `${COMMITTED_ADJUDICATED_RESULTS_DIR}/scored-items.jsonl`;
export const COMMITTED_CENSUS_PATH = 'docs/evaluation/PHASE_2B_2D2C_V3D1_FAILURE_CENSUS_V1.json';

export interface CensusDocument {
  readonly recordId: 'PHASE_2B_2D2C_V3D1_FAILURE_CENSUS_V1';
  readonly kind: 'DIAGNOSTIC_CENSUS_DERIVED_FROM_COMMITTED_SCORING';
  readonly sourceScoredItemsPath: string;
  readonly sourceScoredItemsSha256: string;
  readonly excludedFromOutputs: readonly string[];
  readonly census: FailureCensus;
}

export function buildCensusDocument(repoRoot: string): CensusDocument {
  const text = readFileSync(join(repoRoot, CENSUS_SOURCE_PATH), 'utf8');
  return {
    recordId: 'PHASE_2B_2D2C_V3D1_FAILURE_CENSUS_V1',
    kind: 'DIAGNOSTIC_CENSUS_DERIVED_FROM_COMMITTED_SCORING',
    sourceScoredItemsPath: CENSUS_SOURCE_PATH,
    sourceScoredItemsSha256: createHash('sha256').update(text, 'utf8').digest('hex'),
    excludedFromOutputs: [
      'raw model output',
      'rationale text',
      'evidence quote text',
      'unit_name text (only its SHA-256 and presence flag are carried)',
      'chain of thought',
      'credentials or profile information',
    ],
    census: buildFailureCensus(parseScoredItemsJsonl(text)),
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

function parseArgs(argv: readonly string[]): { readonly out: string } {
  let out: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--out') {
      const value = argv[index + 1];
      if (value === undefined) throw new Error('--out needs a value.');
      out = value;
      index += 1;
    } else {
      throw new Error(`unknown argument ${String(argv[index])}`);
    }
  }
  if (out === null) throw new Error('--out is required.');
  return { out };
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  const { out } = parseArgs(process.argv.slice(2));
  const rendered = await renderCensusDocument(buildCensusDocument(V3D1_REPO_ROOT));
  const target = resolve(V3D1_REPO_ROOT, out);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, rendered, 'utf8');
  process.stdout.write(`${createHash('sha256').update(rendered, 'utf8').digest('hex')}  ${out}\n`);
}
