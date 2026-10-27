/**
 * `nwf-pe qualification-input export --subject-id <uuid> [--evaluated-at <instant>]`
 * - REL P1: THE READ-ONLY QUALIFICATION-INPUT EXPORT.
 *
 * Prints ONE `nwf-pe.qualification-input-export.v1` JSON document for exactly
 * one Discovery Subject to stdout: the Track C C1 candidate, channel, source,
 * claim and claim-link records its stored Engine evidence supports, each
 * tagged RESEARCH_REAL, and the subject's STATED country (or null). The
 * Operator pairs it with the OWNER pilot descriptor for that country and
 * scores it with C1; nothing here scores, ranks or binds identity. See
 * `src/orgunits/qualificationInput/` for the rules.
 *
 * Deterministic: the same database state and the same explicit
 * `--evaluated-at` (whole UTC seconds, `YYYY-MM-DDTHH:MM:SSZ`) print the same
 * bytes. Without it the database clock is used, truncated to the second.
 *
 * READ-ONLY BY CONSTRUCTION: the `readonly` role only
 * (`DATABASE_URL_READONLY`), one READ ONLY transaction that ends in ROLLBACK,
 * no write, no network, no model, no file written. One subject per call: no
 * `--all`, no generic SQL, no credential option.
 */
import { parseArgs } from 'node:util';
import type pg from 'pg';

import { createPool } from '../../db/client.js';
import { QualificationInputExportRefusal } from '../../orgunits/qualificationInput/contract.js';
import { exportQualificationInput } from '../../orgunits/qualificationInput/load.js';

export const QUALIFICATION_INPUT_USAGE = `nwf-pe qualification-input - read-only C1 qualification-input export (REL P1)

  qualification-input export --subject-id <uuid> [--evaluated-at <YYYY-MM-DDTHH:MM:SSZ>]
                             Prints one nwf-pe.qualification-input-export.v1 JSON document for
                             exactly one subject, derived only from stored Engine evidence.
                             READ-ONLY: readonly role, no write, no network.
`;

export interface QualificationInputCliDependencies {
  readonly readonlyPool?: () => pg.Pool;
  readonly out?: (text: string) => void;
  readonly err?: (text: string) => void;
}

export async function runQualificationInputCli(
  argv: readonly string[],
  deps: QualificationInputCliDependencies = {},
): Promise<number> {
  const out = deps.out ?? ((t: string) => void process.stdout.write(t));
  const err = deps.err ?? ((t: string) => void process.stderr.write(t));
  if (argv[0] !== 'export') {
    err(QUALIFICATION_INPUT_USAGE);
    return argv[0] === '--help' || argv[0] === '-h' ? 0 : 1;
  }
  let subjectId: string;
  let evaluatedAt: string | null;
  try {
    const parsed = parseArgs({
      args: [...argv.slice(1)],
      allowPositionals: false,
      strict: true,
      options: {
        'subject-id': { type: 'string' },
        'evaluated-at': { type: 'string' },
      },
    });
    if (parsed.values['subject-id'] === undefined) throw new Error('--subject-id is required.');
    subjectId = parsed.values['subject-id'];
    evaluatedAt = parsed.values['evaluated-at'] ?? null;
  } catch (error) {
    err(`${error instanceof Error ? error.message : String(error)}\n${QUALIFICATION_INPUT_USAGE}`);
    return 1;
  }
  const pool = deps.readonlyPool?.() ?? createPool('readonly');
  try {
    const document = await exportQualificationInput(pool, { subjectId, evaluatedAt });
    out(`${JSON.stringify(document, null, 2)}\n`);
    return 0;
  } catch (error) {
    if (error instanceof QualificationInputExportRefusal) {
      err(`qualification-input export refused: ${error.code} (${error.detail})\n`);
      return 1;
    }
    throw error;
  } finally {
    await pool.end();
  }
}
