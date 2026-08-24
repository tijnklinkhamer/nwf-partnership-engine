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
import { runEwpCoverage, runEwpIngest, runEwpShow } from './commands/ewp.js';
import {
  runWebsiteConflicts,
  runWebsiteIngestEche,
  runWebsiteIngestFr,
  runWebsiteReport,
  runWebsiteShow,
} from './commands/website.js';

const USAGE = `nwf-pe - NWF Partnership Engine (Phase 1D)

Usage:
  nwf-pe ingest eche   [--country <CC>] [--file <path>] [--url <official-url>] [--dry-run]
  nwf-pe ingest runs   [--limit <N>]
  nwf-pe orgs list     [--country <CC>] [--limit <N>]
  nwf-pe orgs show     <erasmus-code | uuid>
  nwf-pe orgs duplicates
  nwf-pe ewp ingest    [--file <path>] [--url <official-url>] [--dry-run]
                       [--origin-url <url> --origin-retrieved-at <iso-8601>]
  nwf-pe ewp show      [--limit <N>]
  nwf-pe ewp coverage  [--eche-file <path> | --eche-url <url>]
                       [--ewp-file <path>  | --ewp-url <url>] [--limit <N>] [--json]
  nwf-pe website ingest eche  --eche-file <path> [--dry-run]
  nwf-pe website ingest fr    --eche-file <path> [--file <path> | --url <url>]
                              [--dry-run]
                              [--origin-url <url> --origin-retrieved-at <iso-8601>]
  nwf-pe website report
  nwf-pe website conflicts    [--limit <N>]
  nwf-pe website show         <erasmus-code>

Options:
  --country <CC>    Restrict to an ISO-3166-1 alpha-2 country code (e.g. FR).
  --file <path>     Use an operator-supplied local artifact instead of fetching one.
  --url <url>       Use an operator-supplied official URL.
  --eche-file/-url  ECHE artifact for \`ewp coverage\`. Defaults to official discovery.
                    REQUIRED as --eche-file for every \`website\` command: Phase 1D
                    classifies an artifact you already hold and never fetches one.
  --ewp-file/-url   EWP artifact for \`ewp coverage\`. Defaults to the official endpoint.
  --origin-url      With --file only: the official URL the local artifact was
                    downloaded from. Recorded as provenance, never inferred.
  --origin-retrieved-at
                    With --origin-url: when that download happened (ISO-8601).
  --dry-run         Parse and report only. Performs no database mutation.
  --limit <N>       Maximum rows to display.
  --json            Emit the full coverage report as JSON.
  -h, --help        Show this help.

Phase 1B ingests two official datasets: ECHE and the EWP Registry. It measures
how their published identifiers relate and reports disagreements. Phase 1D adds
a THIRD official source - the French Ministry register of higher-education
institutions - and stores what each source PUBLISHES about an institution's
website as immutable claims. Agreement and disagreement are DERIVED at read
time and never stored; neither source is preferred and nothing is overwritten.

No institution website is ever fetched. This repository performs NO entity
resolution and merges nothing, and there is no crawling, research, scoring,
compliance, contact or outbound capability in it.
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
      'eche-file': { type: 'string' },
      'eche-url': { type: 'string' },
      'ewp-file': { type: 'string' },
      'origin-url': { type: 'string' },
      'origin-retrieved-at': { type: 'string' },
      'ewp-url': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
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

  if (group === 'ewp' && sub === 'ingest') {
    return runEwpIngest({
      file: values.file,
      url: values.url,
      originUrl: values['origin-url'],
      originRetrievedAt: values['origin-retrieved-at'],
      dryRun: values['dry-run'] === true,
    });
  }

  if (group === 'ewp' && sub === 'show') {
    return runEwpShow({ limit });
  }

  if (group === 'website' && sub === 'ingest' && rest[0] === 'eche') {
    return runWebsiteIngestEche({
      echeFile: values['eche-file'] ?? values.file,
      echeUrl: values['eche-url'] ?? values.url,
      dryRun: values['dry-run'] === true,
    });
  }

  if (group === 'website' && sub === 'ingest' && rest[0] === 'fr') {
    return runWebsiteIngestFr({
      file: values.file,
      url: values.url,
      originUrl: values['origin-url'],
      originRetrievedAt: values['origin-retrieved-at'],
      echeFile: values['eche-file'],
      echeUrl: values['eche-url'],
      dryRun: values['dry-run'] === true,
    });
  }

  if (group === 'website' && sub === 'report') {
    return runWebsiteReport();
  }

  if (group === 'website' && sub === 'conflicts') {
    return runWebsiteConflicts({ limit });
  }

  if (group === 'website' && sub === 'show') {
    const identifier = rest[0];
    if (!identifier) {
      log.error('website show requires an Erasmus code.');
      return 1;
    }
    return runWebsiteShow(identifier);
  }

  if (group === 'ewp' && sub === 'coverage') {
    return runEwpCoverage({
      echeFile: values['eche-file'],
      echeUrl: values['eche-url'],
      ewpFile: values['ewp-file'],
      ewpUrl: values['ewp-url'],
      limit,
      json: values.json === true,
    });
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
