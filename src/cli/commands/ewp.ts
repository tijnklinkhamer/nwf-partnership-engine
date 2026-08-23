import { withPool } from '../../db/client.js';
import * as log from '../../logging/log.js';
import { ingestEwpCatalogue } from '../../ingest/ewp/ingest.js';
import {
  resolveFromFile,
  resolveFromOfficialEndpoint,
  resolveFromUrl,
  type EwpAssertedOrigin,
  type EwpResolvedSource,
} from '../../ingest/ewp/source.js';
import {
  EwpMalformedEntryError,
  EwpSchemaDriftError,
  EwpSourceResolutionError,
} from '../../ingest/ewp/schema.js';
import {
  measureEcheEwpCoverage,
  type EcheEwpCoverageReport,
  type RowComparison,
} from '../../compare/echeEwp.js';
import {
  resolveFromFile as resolveEcheFile,
  resolveFromOfficialPage as resolveEchePage,
  resolveFromUrl as resolveEcheUrl,
  SourceResolutionError,
} from '../../ingest/eche/source.js';

function pad(value: string, width: number): string {
  return value.length > width ? `${value.slice(0, width - 1)}…` : value.padEnd(width);
}

function num(value: number, width = 7): string {
  return String(value).padStart(width);
}

// ---------------------------------------------------------------------------
// ewp ingest
// ---------------------------------------------------------------------------

export interface EwpIngestArgs {
  file?: string | undefined;
  url?: string | undefined;
  /** Operator assertion: the official URL this local artifact was downloaded from. */
  originUrl?: string | undefined;
  /** Operator assertion: when that download happened, as ISO-8601. */
  originRetrievedAt?: string | undefined;
  dryRun: boolean;
}

/**
 * Builds the asserted origin for a --file run, or undefined when none was given.
 *
 * Both parts are required together. A URL without a time would leave the
 * database unable to say when the artifact was that URL's content, and the
 * catalogue is refreshed continuously, so "from the Registry" with no timestamp
 * is close to meaningless.
 */
function assertedOrigin(args: EwpIngestArgs): EwpAssertedOrigin | undefined {
  const { originUrl, originRetrievedAt } = args;
  if (originUrl === undefined && originRetrievedAt === undefined) return undefined;
  if (originUrl === undefined || originRetrievedAt === undefined) {
    throw new EwpSourceResolutionError(
      'Pass --origin-url and --origin-retrieved-at together, or neither. An ' +
        'origin URL without a retrieval time does not identify what was published.',
    );
  }
  const retrievedAt = new Date(originRetrievedAt);
  if (Number.isNaN(retrievedAt.getTime())) {
    throw new EwpSourceResolutionError(
      `--origin-retrieved-at must be an ISO-8601 timestamp, got: ${originRetrievedAt}`,
    );
  }
  return { url: originUrl, retrievedAt };
}

async function resolveEwp(args: EwpIngestArgs): Promise<EwpResolvedSource> {
  if (args.file !== undefined && args.url !== undefined) {
    throw new EwpSourceResolutionError('Pass either --file or --url, not both.');
  }
  const origin = assertedOrigin(args);
  if (origin !== undefined && args.file === undefined) {
    throw new EwpSourceResolutionError(
      '--origin-url applies only to --file. A fetched run records its own ' +
        'origin, so asserting one would be redundant and could contradict it.',
    );
  }
  if (args.file !== undefined) {
    log.info(`Using operator-supplied file: ${args.file}`);
    return resolveFromFile(args.file, origin);
  }
  if (args.url !== undefined) {
    log.info(`Using operator-supplied URL: ${args.url}`);
    return resolveFromUrl(args.url);
  }
  log.info('Fetching the EWP Registry catalogue from the official endpoint...');
  return resolveFromOfficialEndpoint();
}

export async function runEwpIngest(args: EwpIngestArgs): Promise<number> {
  let source: EwpResolvedSource;
  try {
    source = await resolveEwp(args);
  } catch (err) {
    if (err instanceof EwpSourceResolutionError) {
      log.error(err.message);
      return 1;
    }
    throw err;
  }

  log.info(
    `Source resolved: kind=${source.kind} sha256=${source.sha256.slice(0, 16)}... ` +
      `bytes=${source.bytes.byteLength} fetchedAt=${source.fetchedAt.toISOString()}`,
  );
  if (source.fileUrl) log.info(`  url : ${source.fileUrl}`);
  if (source.filePath) log.info(`  path: ${source.filePath}  (LOCAL COPY - not a published URL)`);
  if (source.originUrl) {
    log.info(
      `  origin: ${source.originUrl} retrieved ${source.originRetrievedAt?.toISOString() ?? '(unknown)'}`,
    );
  } else if (source.kind === 'operator_file') {
    log.info('  origin: NOT RECORDED (no --origin-url given; nothing is inferred)');
  }

  try {
    const result = await withPool('ingest', (pool) =>
      ingestEwpCatalogue(pool, source, { dryRun: args.dryRun }),
    );

    process.stdout.write(
      [
        '',
        `artifact sha256   : ${result.artifactSha256}`,
        `artifact bytes    : ${result.artifactBytes}`,
        `hosts             : ${result.hostCount}`,
        `HEIs              : ${result.heiCount}`,
        `identifiers       : ${result.otherIdCount}`,
        `API declarations  : ${result.apiDeclarationCount}`,
        `covered-HEI refs  : ${result.coveredHeiRefCount}`,
        `empty identifiers : ${result.emptyOtherIdCount}  (published with no value; reported, not stored)`,
        `already present   : ${result.alreadyPresent}`,
        `dry run           : ${result.dryRun}`,
        `snapshot id       : ${result.snapshotId ?? '(none - dry run)'}`,
        `ingest run id     : ${result.ingestRunId ?? '(none - dry run)'}`,
        '',
        'EWP evidence is stored separately from organisations. Nothing was merged,',
        'no organisation was created or modified, and no declared endpoint was called.',
        '',
      ].join('\n'),
    );
    return 0;
  } catch (err) {
    if (err instanceof EwpSchemaDriftError) {
      log.error('EWP SCHEMA DRIFT DETECTED - nothing was ingested.');
      log.error(err.message);
      return 1;
    }
    if (err instanceof EwpMalformedEntryError) {
      log.error('MALFORMED EWP ENTRY - nothing was ingested.');
      log.error(`${err.message} (${err.context})`);
      return 1;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// ewp show
// ---------------------------------------------------------------------------

export async function runEwpShow(args: { limit?: number | undefined }): Promise<number> {
  const limit = args.limit ?? 20;

  return withPool('readonly', async (pool) => {
    const { rows: snapshots } = await pool.query<{
      id: string;
      artifact_sha256: string;
      artifact_bytes: string;
      source_input_kind: string;
      source_location: string;
      fetched_at: Date;
      origin_url: string | null;
      origin_retrieved_at: Date | null;
      host_count: number;
      hei_count: number;
      other_id_count: number;
      api_declaration_count: number;
    }>(
      `SELECT id, artifact_sha256, artifact_bytes, source_input_kind, source_location,
              fetched_at, origin_url, origin_retrieved_at,
              host_count, hei_count, other_id_count, api_declaration_count
         FROM ewp_snapshots
        ORDER BY fetched_at DESC
        LIMIT 1`,
    );

    const snapshot = snapshots[0];
    if (!snapshot) {
      process.stdout.write('No EWP snapshot has been ingested.\n');
      return 0;
    }

    const localFile = snapshot.source_input_kind === 'operator_file';
    const out: string[] = [
      '',
      '='.repeat(96),
      'EWP REGISTRY SNAPSHOT (most recent)',
      '='.repeat(96),
      `snapshot id     : ${snapshot.id}`,
      `artifact sha256 : ${snapshot.artifact_sha256}`,
      `artifact bytes  : ${snapshot.artifact_bytes}`,
      `input kind      : ${snapshot.source_input_kind}`,
      localFile
        ? `local file      : ${snapshot.source_location}  (LOCAL COPY - not a published URL)`
        : `source url      : ${snapshot.source_location}`,
      `read at         : ${snapshot.fetched_at.toISOString()}  (when this run read the bytes)`,
      // WHERE IT WAS PUBLISHED is a different fact from WHERE IT WAS READ. A
      // local artifact keeps a NULL origin unless an operator asserted one, and
      // NULL is shown as "not recorded" rather than quietly omitted.
      snapshot.origin_url === null
        ? `origin          : NOT RECORDED${localFile ? ' (local artifact ingested without --origin-url)' : ''}`
        : `origin          : ${snapshot.origin_url}`,
      snapshot.origin_retrieved_at === null
        ? `origin retrieved: NOT RECORDED`
        : `origin retrieved: ${snapshot.origin_retrieved_at.toISOString()}`,
      `hosts / HEIs    : ${snapshot.host_count} / ${snapshot.hei_count}`,
      `identifiers     : ${snapshot.other_id_count}`,
      `API declarations: ${snapshot.api_declaration_count}`,
      '',
    ];

    const { rows: idTypes } = await pool.query<{
      id_type: string;
      n: string;
      comparable: string;
    }>(
      `SELECT id_type, count(*)::text AS n,
              count(id_value_normalised)::text AS comparable
         FROM ewp_hei_other_ids
        WHERE snapshot_id = $1
        GROUP BY id_type
        ORDER BY count(*) DESC`,
      [snapshot.id],
    );

    out.push('IDENTIFIER TYPES (as published, case preserved)', '-'.repeat(96));
    out.push(`${pad('TYPE', 22)}${pad('COUNT', 10)}COMPARABLE (has a deterministic value)`);
    for (const row of idTypes) {
      out.push(`${pad(row.id_type, 22)}${pad(row.n, 10)}${row.comparable}`);
    }

    const { rows: apis } = await pool.query<{
      api_local_name: string;
      hosts: string;
      versions: string;
    }>(
      `SELECT api_local_name,
              count(DISTINCT ewp_host_id)::text AS hosts,
              count(DISTINCT declared_version)::text AS versions
         FROM ewp_api_declarations
        WHERE snapshot_id = $1
        GROUP BY api_local_name
        ORDER BY count(DISTINCT ewp_host_id) DESC
        LIMIT $2`,
      [snapshot.id, limit],
    );

    out.push('', `DECLARED APIS (top ${limit} by host count) - DECLARATION ONLY`, '-'.repeat(96));
    out.push(`${pad('API', 34)}${pad('HOSTS', 10)}DISTINCT VERSIONS`);
    for (const row of apis) {
      out.push(`${pad(row.api_local_name, 34)}${pad(row.hosts, 10)}${row.versions}`);
    }

    out.push(
      '',
      'Declared, never called. Phase 1B records that an endpoint was advertised and',
      'does not fetch it. The organizational-units API would expose faculties,',
      'departments and language centres, which is exactly why it is out of scope here.',
      '',
      'A SCHAC hei_id is an INSTITUTIONAL IDENTIFIER, not a website and not a domain.',
      '',
    );

    process.stdout.write(out.join('\n'));
    return 0;
  });
}

// ---------------------------------------------------------------------------
// ewp coverage
// ---------------------------------------------------------------------------

export interface EwpCoverageArgs {
  echeFile?: string | undefined;
  echeUrl?: string | undefined;
  ewpFile?: string | undefined;
  ewpUrl?: string | undefined;
  limit?: number | undefined;
  json: boolean;
}

async function loadEcheBytes(args: EwpCoverageArgs): Promise<{ bytes: Buffer; label: string }> {
  if (args.echeFile !== undefined && args.echeUrl !== undefined) {
    throw new SourceResolutionError('Pass either --eche-file or --eche-url, not both.');
  }
  if (args.echeFile !== undefined) {
    const resolved = resolveEcheFile(args.echeFile);
    return {
      bytes: resolved.bytes,
      label: `local file ${args.echeFile} sha256=${resolved.sha256}`,
    };
  }
  if (args.echeUrl !== undefined) {
    const resolved = await resolveEcheUrl(args.echeUrl);
    return { bytes: resolved.bytes, label: `${resolved.fileUrl} sha256=${resolved.sha256}` };
  }
  log.info('Discovering the current ECHE spreadsheet from the official page...');
  const resolved = await resolveEchePage();
  return { bytes: resolved.bytes, label: `${resolved.fileUrl} sha256=${resolved.sha256}` };
}

async function loadEwpBytes(args: EwpCoverageArgs): Promise<{ bytes: Buffer; label: string }> {
  if (args.ewpFile !== undefined && args.ewpUrl !== undefined) {
    throw new EwpSourceResolutionError('Pass either --ewp-file or --ewp-url, not both.');
  }
  if (args.ewpFile !== undefined) {
    const resolved = resolveFromFile(args.ewpFile);
    return { bytes: resolved.bytes, label: `local file ${args.ewpFile} sha256=${resolved.sha256}` };
  }
  if (args.ewpUrl !== undefined) {
    const resolved = await resolveFromUrl(args.ewpUrl);
    return { bytes: resolved.bytes, label: `${resolved.fileUrl} sha256=${resolved.sha256}` };
  }
  log.info('Fetching the EWP Registry catalogue from the official endpoint...');
  const resolved = await resolveFromOfficialEndpoint();
  return { bytes: resolved.bytes, label: `${resolved.fileUrl} sha256=${resolved.sha256}` };
}

function formatConflictRow(row: RowComparison): string {
  return (
    `${pad(row.countryCode, 4)}${pad(row.erasmusCode ?? '-', 16)}${pad(row.pic ?? '-', 12)}` +
    `pic->[${row.picHeiIds.join(', ')}]  erasmus->[${row.erasmusHeiIds.join(', ')}]  ${row.legalName}`
  );
}

function renderReport(report: EcheEwpCoverageReport, limit: number): string {
  const c = report.coverage;
  const k = report.classification;
  const lines: string[] = [
    '',
    '='.repeat(96),
    'ECHE <-> EWP IDENTIFIER COVERAGE',
    '='.repeat(96),
    '',
    'A match means THE SAME OFFICIAL IDENTIFIER APPEARS IN BOTH OFFICIAL DATASETS.',
    'It does NOT mean the two records have been resolved into one verified entity.',
    'Nothing below was merged, deduplicated, aliased or marked verified.',
    '',
    'SOURCE SIZES',
    '-'.repeat(96),
    `ECHE data rows (ALL source rows)     ${num(report.eche.totalSourceRows)}`,
    `  of those, comparable rows          ${num(report.eche.comparableRows)}`,
    `  of those, UNUSABLE rows            ${num(report.eche.unusableRows)}   <- could not be compared; NOT a miss`,
    `  rows with a usable PIC             ${num(report.eche.rowsWithPic)}`,
    `  rows with a usable Erasmus code    ${num(report.eche.rowsWithErasmusCode)}`,
    `  distinct PICs / Erasmus codes      ${num(report.eche.distinctPics)} / ${report.eche.distinctErasmusCodes}`,
    `EWP HEIs                             ${num(report.ewp.totalHeis)}`,
    `EWP hosts                            ${num(report.ewp.totalHosts)}`,
    `  HEIs with a comparable PIC         ${num(report.ewp.heisWithPic)}`,
    `  HEIs with a comparable code        ${num(report.ewp.heisWithErasmusCode)}`,
    `  distinct PICs / Erasmus codes      ${num(report.ewp.distinctPics)} / ${report.ewp.distinctErasmusCodes}`,
    `  identifiers published empty        ${num(report.ewp.emptyOtherIds)}`,
    `  PICs with no comparison value      ${num(report.ewp.nonComparablePics)}`,
    '',
    'EVERY ECHE SOURCE ROW, PARTITIONED',
    '-'.repeat(96),
    'Exhaustive and disjoint. AMBIGUOUS is never reported as a match, and an',
    'UNUSABLE row is never reported as NO MATCH: "we could not compare this row"',
    'is a different finding from "we compared it and EWP published nothing".',
    '',
    `UNIQUE   reached exactly one EWP HEI ${num(k.unique)}`,
    `AMBIGUOUS reached >1 EWP HEI         ${num(k.ambiguous)}`,
    `CONFLICT PIC and code disagree       ${num(k.conflict)}`,
    `NO MATCH compared, nothing found     ${num(k.noMatch)}`,
    `UNUSABLE could not be compared       ${num(k.unusable)}`,
    '-'.repeat(44),
    `TOTAL    ECHE source rows            ${num(k.totalSourceRows)}`,
    '',
    'BY IDENTIFIER (over the comparable rows)',
    '-'.repeat(96),
    `MATCH    by PIC                      ${num(c.matchedByPic)}`,
    `MATCH    by Erasmus code             ${num(c.matchedByErasmus)}`,
    `MATCH    by both                     ${num(c.matchedByBoth)}`,
    `MATCH    by PIC only                 ${num(c.matchedByPicOnly)}`,
    `           of those, UNIQUE          ${num(c.picOnlyUnique)}`,
    `           of those, AMBIGUOUS       ${num(c.picOnlyAmbiguous)}`,
    `MATCH    by Erasmus code only        ${num(c.matchedByErasmusOnly)}`,
    `           of those, UNIQUE          ${num(c.erasmusOnlyUnique)}`,
    `           of those, AMBIGUOUS       ${num(c.erasmusOnlyAmbiguous)}`,
    `MATCH    by either                   ${num(c.matchedByEither)}`,
    `NO MATCH by neither                  ${num(c.matchedByNeither)}`,
    '',
    `  of the "both" rows, AGREE          ${num(c.bothAgree)}`,
    `  of the "both" rows, CONFLICT       ${num(c.bothConflict)}`,
    `  of the "both" rows, AMBIGUOUS      ${num(c.bothAmbiguous)}`,
    `AMBIGUOUS PIC named >1 EWP HEI       ${num(c.picAmbiguous)}`,
    `AMBIGUOUS code named >1 EWP HEI      ${num(c.erasmusAmbiguous)}`,
    '',
    'REVERSE DIRECTION',
    '-'.repeat(96),
    `EWP HEIs reached by some ECHE row    ${num(report.reverse.heisMatchedByAnyEcheRow)}`,
    `EWP HEIs reached by no ECHE row      ${num(report.reverse.heisNotMatchedByAnyEcheRow)}`,
    '',
    'DUPLICATE AND AMBIGUOUS IDENTIFIERS (reported, never resolved)',
    '-'.repeat(96),
    `EWP: one PIC published by >1 HEI     ${num(report.ambiguity.ewpPicSharedByMultipleHeis.length)}`,
    `EWP: one code published by >1 HEI    ${num(report.ambiguity.ewpErasmusSharedByMultipleHeis.length)}`,
    `EWP: one HEI carrying >1 PIC         ${num(report.ambiguity.ewpHeisWithMultiplePics.length)}`,
    `EWP: one HEI carrying >1 code        ${num(report.ambiguity.ewpHeisWithMultipleErasmusCodes.length)}`,
    `ECHE: one PIC on >1 row              ${num(report.ambiguity.echePicSharedByMultipleRows.length)}`,
    `ECHE: one code on >1 row             ${num(report.ambiguity.echeErasmusSharedByMultipleRows.length)}`,
  ];

  for (const dup of report.ambiguity.ewpPicSharedByMultipleHeis.slice(0, limit)) {
    lines.push(`    EWP pic  ${dup.value} -> ${dup.heiIds.join(', ')}`);
  }
  for (const dup of report.ambiguity.ewpErasmusSharedByMultipleHeis.slice(0, limit)) {
    lines.push(`    EWP code ${dup.value} -> ${dup.heiIds.join(', ')}`);
  }
  for (const multi of report.ambiguity.ewpHeisWithMultipleErasmusCodes.slice(0, limit)) {
    lines.push(`    EWP HEI  ${multi.heiId} carries codes ${multi.values.join(' | ')}`);
  }
  for (const multi of report.ambiguity.ewpHeisWithMultiplePics.slice(0, limit)) {
    lines.push(`    EWP HEI  ${multi.heiId} carries PICs  ${multi.values.join(' | ')}`);
  }
  for (const dup of report.ambiguity.echeErasmusSharedByMultipleRows.slice(0, limit)) {
    lines.push(`    ECHE code ${dup.value} on rows ${dup.heiIds.join(', ')}`);
  }

  const d = report.domainShapeAnalysis;
  lines.push(
    '',
    'DOMAIN-SHAPE ANALYSIS - ANALYTICAL ONLY, CAUSES NO MUTATION',
    '-'.repeat(96),
    'A SCHAC identifier is domain-SHAPED. This compares two strings. It is NOT',
    'website verification, and it establishes no equivalence between an identifier',
    'and a web address. Nothing here is used as a matching key.',
    '',
    `ECHE rows with a canonical_domain    ${num(d.echeRowsWithCanonicalDomain)}`,
    `  equal to some EWP SCHAC id         ${num(d.echeDomainEqualsSomeSchacId)}`,
    `    and identifier-matched that HEI  ${num(d.andAlsoIdentifierMatchedSameHei)}`,
    `    and did NOT match that HEI       ${num(d.andDidNotIdentifierMatchSameHei)}   <- string equality with no identifier evidence`,
    '',
    'CONFLICTS: one ECHE row whose PIC and Erasmus code name DIFFERENT EWP HEIs',
    '-'.repeat(96),
  );

  if (report.ambiguousRows.length > 0) {
    lines.push(
      '',
      'AMBIGUOUS ROWS: an identifier matched, but named MORE THAN ONE EWP HEI',
      '-'.repeat(96),
      `${report.ambiguousRows.length} row(s). Evidence, not a match. NOT resolved.`,
      `${pad('CC', 4)}${pad('ERASMUS', 16)}${pad('PIC', 12)}TARGETS / NAME`,
    );
    for (const row of report.ambiguousRows.slice(0, limit)) lines.push(formatConflictRow(row));
    if (report.ambiguousRows.length > limit) {
      lines.push(`... ${report.ambiguousRows.length - limit} more not shown (raise --limit).`);
    }
    lines.push('', 'CONFLICTS', '-'.repeat(96));
  }

  if (report.conflicts.length === 0) {
    lines.push('None. No ECHE row reached two disjoint sets of EWP HEIs.');
  } else {
    lines.push(`${report.conflicts.length} conflict(s). NOT resolved - reported only.`);
    lines.push(`${pad('CC', 4)}${pad('ERASMUS', 16)}${pad('PIC', 12)}TARGETS / NAME`);
    for (const row of report.conflicts.slice(0, limit)) lines.push(formatConflictRow(row));
    if (report.conflicts.length > limit) {
      lines.push(`... ${report.conflicts.length - limit} more not shown (raise --limit).`);
    }
  }

  lines.push(
    '',
    'This is evidence for a later entity-resolution phase. No entity resolution,',
    'merging, deduplication or fuzzy matching has been performed.',
    '',
  );

  return lines.join('\n');
}

export async function runEwpCoverage(args: EwpCoverageArgs): Promise<number> {
  let eche: { bytes: Buffer; label: string };
  let ewp: { bytes: Buffer; label: string };
  try {
    eche = await loadEcheBytes(args);
    ewp = await loadEwpBytes(args);
  } catch (err) {
    if (err instanceof SourceResolutionError || err instanceof EwpSourceResolutionError) {
      log.error(err.message);
      return 1;
    }
    throw err;
  }

  log.info(`ECHE artifact: ${eche.label}`);
  log.info(`EWP  artifact: ${ewp.label}`);

  try {
    // Artifact to artifact. No database connection is opened anywhere in this
    // command, so the measurement cannot depend on - or disturb - whatever
    // subset happens to be loaded into a working database.
    const report = await measureEcheEwpCoverage(eche.bytes, ewp.bytes);

    if (args.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return 0;
    }
    process.stdout.write(renderReport(report, args.limit ?? 25));
    return 0;
  } catch (err) {
    if (err instanceof EwpSchemaDriftError) {
      log.error('EWP SCHEMA DRIFT DETECTED - no measurement was produced.');
      log.error(err.message);
      return 1;
    }
    throw err;
  }
}
