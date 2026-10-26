/**
 * `nwf-pe subject-facts export --subject-id <uuid> [--subject-id <uuid> ...]`
 * - REL FINAL JOIN A2: THE READ-ONLY SUBJECT FACTS EXPORT.
 *
 * Prints ONE `nwf-pe.subject-facts-export.v1` JSON document for exactly the
 * named Discovery Subjects to stdout (redirect it to a file for the
 * Operator's `registry-admin --subjects`). Every fact is derived from stored
 * claims by `src/orgunits/subjectFacts/` - see `facts.ts` for the rules.
 *
 * READ-ONLY BY CONSTRUCTION: the `readonly` role only
 * (`DATABASE_URL_READONLY`), one READ ONLY transaction that ends in ROLLBACK,
 * no write, no network, no model, no file written. Its own strict option set:
 * no `--all`, no generic SQL, no credential option. Subject ids are always
 * explicit (1..MAX_SUBJECTS_PER_EXPORT).
 */
import { parseArgs } from 'node:util';
import type pg from 'pg';

import { createPool } from '../../db/client.js';
import { MAX_SUBJECTS_PER_EXPORT, SubjectFactsRefusal } from '../../orgunits/subjectFacts/facts.js';
import { exportSubjectFacts } from '../../orgunits/subjectFacts/load.js';

export const SUBJECT_FACTS_USAGE = `nwf-pe subject-facts - read-only subject facts export (REL final join A2)

  subject-facts export --subject-id <uuid> [--subject-id <uuid> ...]
                       Prints one nwf-pe.subject-facts-export.v1 JSON document for
                       exactly the named subjects (1-${MAX_SUBJECTS_PER_EXPORT}), derived only from
                       stored claims. READ-ONLY: readonly role, no write, no network.
`;

export interface SubjectFactsCliDependencies {
  readonly readonlyPool?: () => pg.Pool;
  readonly out?: (text: string) => void;
  readonly err?: (text: string) => void;
}

export async function runSubjectFactsCli(
  argv: readonly string[],
  deps: SubjectFactsCliDependencies = {},
): Promise<number> {
  const out = deps.out ?? ((t: string) => void process.stdout.write(t));
  const err = deps.err ?? ((t: string) => void process.stderr.write(t));
  if (argv[0] !== 'export') {
    err(SUBJECT_FACTS_USAGE);
    return argv[0] === '--help' || argv[0] === '-h' ? 0 : 1;
  }
  let subjectIds: string[];
  try {
    const parsed = parseArgs({
      args: [...argv.slice(1)],
      allowPositionals: false,
      strict: true,
      options: { 'subject-id': { type: 'string', multiple: true } },
    });
    subjectIds = parsed.values['subject-id'] ?? [];
  } catch (error) {
    err(`${error instanceof Error ? error.message : String(error)}\n${SUBJECT_FACTS_USAGE}`);
    return 1;
  }
  const pool = deps.readonlyPool?.() ?? createPool('readonly');
  try {
    const document = await exportSubjectFacts(pool, subjectIds);
    out(`${JSON.stringify(document, null, 2)}\n`);
    return 0;
  } catch (error) {
    if (error instanceof SubjectFactsRefusal) {
      err(`subject-facts export refused: ${error.code} (${error.detail})\n`);
      return 1;
    }
    throw error;
  } finally {
    await pool.end();
  }
}
