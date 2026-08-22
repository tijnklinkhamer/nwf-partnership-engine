import { withPool } from '../../db/client.js';
import * as log from '../../logging/log.js';
import { ingestEche } from '../../ingest/eche/ingest.js';
import {
  resolveFromFile,
  resolveFromOfficialPage,
  resolveFromUrl,
  SourceResolutionError,
  type ResolvedSource,
} from '../../ingest/eche/source.js';
import { AmbiguousSheetError, SchemaDriftError } from '../../ingest/eche/schema.js';

export interface IngestEcheArgs {
  country?: string | undefined;
  file?: string | undefined;
  url?: string | undefined;
  dryRun: boolean;
}

async function resolve(args: IngestEcheArgs): Promise<ResolvedSource> {
  if (args.file !== undefined && args.url !== undefined) {
    throw new SourceResolutionError('Pass either --file or --url, not both.');
  }
  if (args.file !== undefined) {
    log.info(`Using operator-supplied file: ${args.file}`);
    return resolveFromFile(args.file);
  }
  if (args.url !== undefined) {
    log.info(`Using operator-supplied URL: ${args.url}`);
    return resolveFromUrl(args.url);
  }
  log.info('Discovering the current ECHE spreadsheet from the official page...');
  return resolveFromOfficialPage();
}

export async function runIngestEche(args: IngestEcheArgs): Promise<number> {
  let source: ResolvedSource;
  try {
    source = await resolve(args);
  } catch (err) {
    if (err instanceof SourceResolutionError) {
      log.error(err.message);
      return 1;
    }
    throw err;
  }

  log.info(
    `Source resolved: kind=${source.kind} sha256=${source.sha256.slice(0, 16)}... ` +
      `bytes=${source.bytes.byteLength} retrievedAt=${source.retrievedAt.toISOString()}`,
  );
  if (source.fileUrl) log.info(`  file: ${source.fileUrl}`);
  if (source.filePath) log.info(`  path: ${source.filePath}`);
  if (source.contentType) log.info(`  content-type: ${source.contentType}`);

  try {
    // The ingest pool is opened for a dry run too, so the code path exercised is
    // the same one a real run takes. ingestEche performs no statement at all in
    // dry-run mode, so nothing is written regardless.
    const result = await withPool('ingest', (pool) =>
      ingestEche(pool, source, { country: args.country, dryRun: args.dryRun }),
    );

    process.stdout.write(
      [
        '',
        `sheet             : ${result.sheetName}`,
        `header row index  : ${result.headerRowIndex}`,
        `rows considered   : ${result.rowsRead}`,
        `inserted          : ${result.rowsInserted}`,
        `updated           : ${result.rowsUpdated}`,
        `unchanged         : ${result.rowsUnchanged}`,
        `skipped (invalid) : ${result.rowsSkippedInvalid}`,
        `dry run           : ${result.dryRun}`,
        `ingest run id     : ${result.ingestRunId ?? '(none - dry run)'}`,
        '',
      ].join('\n'),
    );

    if (result.invalidExamples.length > 0) {
      log.warn(`First ${result.invalidExamples.length} invalid row(s):`);
      for (const example of result.invalidExamples) log.warn(`  - ${example}`);
    }
    return 0;
  } catch (err) {
    if (err instanceof SchemaDriftError) {
      log.error('ECHE SCHEMA DRIFT DETECTED - nothing was ingested.');
      log.error(err.message);
      return 1;
    }
    if (err instanceof AmbiguousSheetError) {
      log.error('AMBIGUOUS ECHE WORKBOOK - nothing was ingested.');
      log.error(err.message);
      return 1;
    }
    throw err;
  }
}
