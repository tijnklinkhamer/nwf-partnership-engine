#!/usr/bin/env node
/**
 * nwf-pe - NWF Partnership Engine CLI (Phase 1A).
 *
 * Uses node:util parseArgs rather than a CLI framework: four commands do not
 * justify a dependency. Diagnostics go to stderr, results to stdout, and any
 * failure exits non-zero.
 */
import { parseArgs } from 'node:util';
import * as log from '../logging/log.js';
import { runIngestEche } from './commands/ingestEche.js';
import { runIngestRuns } from './commands/ingestRuns.js';
import { runOrgsDuplicates, runOrgsList, runOrgsShow } from './commands/orgs.js';

const USAGE = `nwf-pe - NWF Partnership Engine (Phase 1A)

Usage:
  nwf-pe ingest eche [--country <CC>] [--file <path>] [--url <official-url>] [--dry-run]
  nwf-pe ingest runs [--limit <N>]
  nwf-pe orgs list   [--country <CC>] [--limit <N>]
  nwf-pe orgs show   <erasmus-code | uuid>
  nwf-pe orgs duplicates

Options:
  --country <CC>   Restrict to an ISO-3166-1 alpha-2 country code (e.g. FR).
  --file <path>    Ingest an operator-supplied local .xlsx instead of discovering it.
  --url <url>      Ingest an operator-supplied official ECHE URL.
  --dry-run        Parse and report only. Performs no database mutation.
  --limit <N>      Maximum rows to display.
  -h, --help       Show this help.

Phase 1A ingests the official ECHE dataset only. There is no research,
scoring, compliance, contact or outbound capability in this repository.
`;

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      country: { type: 'string' },
      file: { type: 'string' },
      url: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      limit: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help || positionals.length === 0) {
    process.stdout.write(USAGE);
    return positionals.length === 0 && !values.help ? 1 : 0;
  }

  const [group, sub, ...rest] = positionals;
  const limit = values.limit === undefined ? undefined : Number.parseInt(values.limit, 10);
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    log.error(`--limit must be a positive integer, got ${values.limit}`);
    return 1;
  }

  if (group === 'ingest' && sub === 'eche') {
    return runIngestEche({
      country: values.country,
      file: values.file,
      url: values.url,
      dryRun: values['dry-run'] === true,
    });
  }

  if (group === 'ingest' && sub === 'runs') {
    return runIngestRuns({ limit });
  }

  if (group === 'orgs' && sub === 'list') {
    return runOrgsList({ country: values.country, limit });
  }

  if (group === 'orgs' && sub === 'show') {
    const identifier = rest[0];
    if (!identifier) {
      log.error('orgs show requires an Erasmus code or organisation uuid.');
      return 1;
    }
    return runOrgsShow(identifier);
  }

  if (group === 'orgs' && sub === 'duplicates') {
    return runOrgsDuplicates();
  }

  log.error(`Unknown command: ${positionals.join(' ')}`);
  process.stdout.write(USAGE);
  return 1;
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    log.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
