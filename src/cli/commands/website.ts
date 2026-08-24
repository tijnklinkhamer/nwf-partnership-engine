/**
 * `nwf-pe website ...` - Phase 1D website evidence.
 *
 * Every command here is READ-ONLY about conclusions. The two ingest commands
 * append immutable source claims; the three reporting commands derive
 * comparisons at read time and never write one back. Nothing in this file
 * picks a winner between two official sources, and nothing displays a contact
 * value - the French register adapter never requests one.
 */
import type pg from 'pg';
import { withPool } from '../../db/client.js';
import * as log from '../../logging/log.js';
import { normaliseErasmusCode } from '../../ingest/eche/normalise.js';
import {
  resolveFromFile as resolveEcheFile,
  resolveFromOfficialPage as resolveEchePage,
  resolveFromUrl as resolveEcheUrl,
  SourceResolutionError,
  type ResolvedSource as EcheResolvedSource,
} from '../../ingest/eche/source.js';
import { SchemaDriftError } from '../../ingest/eche/schema.js';
import { ingestEcheWebsiteClaims } from '../../website/ingestEche.js';
import { ingestFresr } from '../../ingest/fresr/ingest.js';
import {
  resolveFromFile as resolveFresrFile,
  resolveFromOfficialEndpoint as resolveFresrEndpoint,
  resolveFromUrl as resolveFresrUrl,
  type FresrAssertedOrigin,
  type FresrResolvedSource,
} from '../../ingest/fresr/source.js';
import { FresrSchemaDriftError, FresrSourceResolutionError } from '../../ingest/fresr/schema.js';
import {
  compareClaimSets,
  summariseComparisons,
  summariseStructure,
  type WebsiteClaimView,
  type WebsiteComparison,
} from '../../website/compare.js';
import type { WebsiteStructuralStatus } from '../../website/parse.js';
import type { WebsiteClaimSourceKind } from '../../website/schema.js';

function pad(value: string, width: number): string {
  return value.length > width ? `${value.slice(0, width - 1)}…` : value.padEnd(width);
}

function num(value: number, width = 7): string {
  return String(value).padStart(width);
}

// ---------------------------------------------------------------------------
// Shared: reading claims back out of the database.
// ---------------------------------------------------------------------------

interface ClaimRow {
  source_kind: string;
  eche_row_key: string;
  source_row_key: string;
  raw_value: string | null;
  structural_status: string;
  rejection_reason: string | null;
  normalised_url: string | null;
  hostname: string | null;
  registrable_domain: string | null;
  rule_version: string;
  source_artifact_sha256: string;
  observed_at: Date;
}

const CLAIM_COLUMNS = `source_kind, eche_row_key, source_row_key, raw_value,
                       structural_status, rejection_reason, normalised_url, hostname,
                       registrable_domain, rule_version, source_artifact_sha256, observed_at`;

function toClaimView(row: ClaimRow): WebsiteClaimView {
  return {
    sourceKind: row.source_kind as WebsiteClaimSourceKind,
    echeRowKey: row.eche_row_key,
    sourceRowKey: row.source_row_key,
    rawValue: row.raw_value,
    structuralStatus: row.structural_status as WebsiteStructuralStatus,
    normalisedUrl: row.normalised_url,
    hostname: row.hostname,
    registrableDomain: row.registrable_domain,
  };
}

/**
 * The artifact whose claims a report should describe.
 *
 * A database may legitimately hold claims from SEVERAL artifacts of the same
 * source - that is what append-only means when the upstream file changes - so
 * a report that summed across all of them would double-count. Reports pin
 * themselves to the LATEST artifact per source, chosen by the most recent
 * observation, and say which one they used.
 */
async function latestArtifactSha(
  pool: pg.Pool,
  sourceKind: WebsiteClaimSourceKind,
): Promise<string | null> {
  const { rows } = await pool.query<{ source_artifact_sha256: string }>(
    `SELECT source_artifact_sha256
       FROM website_claims
      WHERE source_kind = $1
      GROUP BY source_artifact_sha256
      ORDER BY max(observed_at) DESC
      LIMIT 1`,
    [sourceKind],
  );
  return rows[0]?.source_artifact_sha256 ?? null;
}

// ---------------------------------------------------------------------------
// website ingest eche
// ---------------------------------------------------------------------------

export interface WebsiteIngestEcheArgs {
  echeFile?: string | undefined;
  echeUrl?: string | undefined;
  dryRun: boolean;
}

async function resolveEche(args: {
  echeFile?: string | undefined;
  echeUrl?: string | undefined;
}): Promise<EcheResolvedSource> {
  if (args.echeFile !== undefined && args.echeUrl !== undefined) {
    throw new SourceResolutionError('Pass either --eche-file or --eche-url, not both.');
  }
  if (args.echeFile !== undefined) {
    log.info(`Using operator-supplied ECHE file: ${args.echeFile}`);
    return resolveEcheFile(args.echeFile);
  }
  if (args.echeUrl !== undefined) {
    log.info(`Using operator-supplied ECHE URL: ${args.echeUrl}`);
    return resolveEcheUrl(args.echeUrl);
  }
  log.info('Discovering the current ECHE spreadsheet from the official page...');
  return resolveEchePage();
}

export async function runWebsiteIngestEche(args: WebsiteIngestEcheArgs): Promise<number> {
  let source: EcheResolvedSource;
  try {
    source = await resolveEche(args);
  } catch (err) {
    if (err instanceof SourceResolutionError) {
      log.error(err.message);
      return 1;
    }
    throw err;
  }

  log.info(
    `ECHE artifact: kind=${source.kind} sha256=${source.sha256.slice(0, 16)}... ` +
      `bytes=${source.bytes.byteLength}`,
  );

  try {
    const result = await withPool('ingest', (pool) =>
      ingestEcheWebsiteClaims(pool, source, { dryRun: args.dryRun }),
    );

    process.stdout.write(
      [
        '',
        `artifact sha256      : ${result.artifactSha256}`,
        `rows read            : ${result.rowsRead}`,
        `rows without a key   : ${result.rowsUnusable}`,
        `structurally valid   : ${result.structurallyValid}`,
        `not a website        : ${result.notAWebsite}`,
        `malformed            : ${result.malformed}`,
        `absent (no value)    : ${result.absent}`,
        `rule version         : ${result.ruleVersion}`,
        `claims inserted      : ${result.write?.inserted ?? '(none - dry run)'}`,
        `claims already stored: ${result.write?.alreadyPresent ?? '(none - dry run)'}`,
        `linked to an org row : ${result.write?.linkedToOrganisation ?? '(none - dry run)'}`,
        `ingest run id        : ${result.ingestRunId ?? '(none - dry run)'}`,
        '',
        'Claims are the values ECHE PUBLISHED, read from the artifact itself and never',
        'from organisations.website_url or organisations.canonical_domain. No',
        'organisation row was created or modified.',
        '',
      ].join('\n'),
    );
    return 0;
  } catch (err) {
    if (err instanceof SchemaDriftError) {
      log.error('ECHE SCHEMA DRIFT DETECTED - nothing was ingested.');
      log.error(err.message);
      return 1;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// website ingest fr
// ---------------------------------------------------------------------------

export interface WebsiteIngestFrArgs {
  file?: string | undefined;
  url?: string | undefined;
  originUrl?: string | undefined;
  originRetrievedAt?: string | undefined;
  echeFile?: string | undefined;
  echeUrl?: string | undefined;
  dryRun: boolean;
}

/**
 * Builds the asserted origin for a --file run, or undefined when none was given.
 * Both parts are required together: a URL with no retrieval time does not say
 * what was published, only where.
 */
function assertedOrigin(args: WebsiteIngestFrArgs): FresrAssertedOrigin | undefined {
  const { originUrl, originRetrievedAt } = args;
  if (originUrl === undefined && originRetrievedAt === undefined) return undefined;
  if (originUrl === undefined || originRetrievedAt === undefined) {
    throw new FresrSourceResolutionError(
      'Pass --origin-url and --origin-retrieved-at together, or neither. An ' +
        'origin URL without a retrieval time does not identify what was published.',
    );
  }
  const retrievedAt = new Date(originRetrievedAt);
  if (Number.isNaN(retrievedAt.getTime())) {
    throw new FresrSourceResolutionError(
      `--origin-retrieved-at must be an ISO-8601 timestamp, got: ${originRetrievedAt}`,
    );
  }
  return { url: originUrl, retrievedAt };
}

async function resolveFresr(args: WebsiteIngestFrArgs): Promise<FresrResolvedSource> {
  if (args.file !== undefined && args.url !== undefined) {
    throw new FresrSourceResolutionError('Pass either --file or --url, not both.');
  }
  const origin = assertedOrigin(args);
  if (origin !== undefined && args.file === undefined) {
    throw new FresrSourceResolutionError(
      '--origin-url applies only to --file. A fetched run records its own origin, ' +
        'so asserting one would be redundant and could contradict it.',
    );
  }
  if (args.file !== undefined) {
    log.info(`Using operator-supplied file: ${args.file}`);
    return resolveFresrFile(args.file, origin);
  }
  if (args.url !== undefined) {
    log.info(`Using operator-supplied URL: ${args.url}`);
    return resolveFresrUrl(args.url);
  }
  log.info('Fetching the official French Ministry register...');
  return resolveFresrEndpoint();
}

export async function runWebsiteIngestFr(args: WebsiteIngestFrArgs): Promise<number> {
  let source: FresrResolvedSource;
  let echeSource: EcheResolvedSource;
  try {
    source = await resolveFresr(args);
    // The ECHE artifact supplies the PIC-to-row-key map. It is the artifact,
    // not the database, so the join never depends on which subset happens to
    // be loaded.
    echeSource = await resolveEche(args);
  } catch (err) {
    if (err instanceof FresrSourceResolutionError || err instanceof SourceResolutionError) {
      log.error(err.message);
      return 1;
    }
    throw err;
  }

  log.info(
    `FR register artifact: kind=${source.kind} sha256=${source.sha256.slice(0, 16)}... ` +
      `bytes=${source.bytes.byteLength} fetchedAt=${source.fetchedAt.toISOString()}`,
  );
  if (source.readUrl) log.info(`  read url   : ${source.readUrl}`);
  if (source.filePath) {
    log.info(`  path       : ${source.filePath}  (LOCAL COPY - not a published URL)`);
  }
  if (source.publicationUrl) log.info(`  published  : ${source.publicationUrl}`);
  else if (source.kind === 'operator_file') {
    log.info('  published  : NOT RECORDED (no --origin-url given; nothing is inferred)');
  }

  try {
    const result = await withPool('ingest', (pool) =>
      ingestFresr(pool, source, echeSource, { dryRun: args.dryRun }),
    );

    process.stdout.write(
      [
        '',
        `artifact sha256       : ${result.artifactSha256}`,
        `artifact bytes        : ${result.artifactBytes}`,
        `register records      : ${result.recordCount}`,
        `  with a usable PIC   : ${result.recordsWithPic}`,
        `  with an unusable PIC: ${result.recordsWithNonComparablePic}  (not plain digits, e.g. two ";"-separated PICs; never split)`,
        `  with a url value    : ${result.recordsWithUrlValue}`,
        `  with multiple UAI   : ${result.recordsWithMultipleUai}  (published ";"-separated; never split)`,
        `PIC matched an ECHE row: ${result.recordsMatchingEche}`,
        `PIC not in ECHE       : ${result.recordsWithPicNotInEche}`,
        `structurally valid    : ${result.structurallyValid}`,
        `not a website         : ${result.notAWebsite}`,
        `malformed             : ${result.malformed}`,
        `absent (no value)     : ${result.absent}`,
        `rule version          : ${result.ruleVersion}`,
        `snapshot already there: ${result.snapshotAlreadyPresent}`,
        `snapshot id           : ${result.snapshotId ?? '(none - dry run)'}`,
        `claims inserted       : ${result.write?.inserted ?? '(none - dry run)'}`,
        `claims already stored : ${result.write?.alreadyPresent ?? '(none - dry run)'}`,
        `ingest run id         : ${result.ingestRunId ?? '(none - dry run)'}`,
        '',
        'FR claims are stored BESIDE the ECHE claims, never instead of them. No ECHE',
        'value was overwritten, no organisation row was created or modified, and no',
        'institution website was contacted.',
        '',
      ].join('\n'),
    );
    return 0;
  } catch (err) {
    if (err instanceof FresrSchemaDriftError) {
      log.error('FRENCH REGISTER SCHEMA DRIFT DETECTED - nothing was ingested.');
      log.error(err.message);
      if (err.detail) log.error(err.detail);
      return 1;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// website report
// ---------------------------------------------------------------------------

export async function runWebsiteReport(): Promise<number> {
  return withPool('readonly', async (pool) => {
    const echeSha = await latestArtifactSha(pool, 'ECHE_PUBLISHED');
    if (echeSha === null) {
      process.stdout.write(
        '\nNo ECHE website claims are stored yet.\n' +
          'Run: nwf-pe website ingest eche --eche-file <eche.xlsx>\n\n',
      );
      return 0;
    }
    const frSha = await latestArtifactSha(pool, 'FR_ESR');

    const { rows } = await pool.query<ClaimRow>(
      `SELECT ${CLAIM_COLUMNS}
         FROM website_claims
        WHERE (source_kind = 'ECHE_PUBLISHED' AND source_artifact_sha256 = $1)
           OR (source_kind = 'FR_ESR'         AND source_artifact_sha256 = $2)`,
      [echeSha, frSha],
    );
    const claims = rows.map(toClaimView);
    const eche = claims.filter((claim) => claim.sourceKind === 'ECHE_PUBLISHED');
    const fr = claims.filter((claim) => claim.sourceKind === 'FR_ESR');

    const echeSummary = summariseStructure(eche);
    const frSummary = summariseStructure(fr);
    const comparison = summariseComparisons(compareClaimSets(claims));

    const block = (label: string, s: ReturnType<typeof summariseStructure>): string[] => [
      '',
      label,
      '-'.repeat(72),
      `claims (= source rows examined)   ${num(s.totalClaims)}`,
      `  with a published value          ${num(s.withRawValue)}`,
      `  structurally valid              ${num(s.structurallyValid)}`,
      `  not a website                   ${num(s.notAWebsite)}`,
      `  malformed                       ${num(s.malformed)}`,
      `  absent (source published none)  ${num(s.absent)}`,
      `distinct hostnames                ${num(s.distinctHostnames)}`,
      `  hostnames used by >1 claim      ${num(s.sharedHostnames)}`,
      `  claims on a shared hostname     ${num(s.claimsOnSharedHostnames)}`,
      `distinct registrable domains      ${num(s.distinctRegistrableDomains)}`,
      `  domains used by >1 claim        ${num(s.sharedRegistrableDomains)}`,
      `  claims on a shared domain       ${num(s.claimsOnSharedRegistrableDomains)}`,
    ];

    const lines = [
      '',
      'PHASE 1D WEBSITE EVIDENCE REPORT',
      '='.repeat(72),
      `ECHE artifact : ${echeSha}`,
      `FR  artifact  : ${frSha ?? '(no French register claims stored)'}`,
      ...block('ECHE_PUBLISHED', echeSummary),
      ...(fr.length > 0 ? block('FR_ESR', frSummary) : []),
      '',
      'DERIVED CROSS-SOURCE COMPARISON (computed now, never stored)',
      '-'.repeat(72),
      `claim pairs compared              ${num(comparison.pairs)}`,
      `  DOMAIN_AGREE                    ${num(comparison.domainAgree)}`,
      `    of which hostnames also match ${num(comparison.hostnameAgree)}`,
      `  DOMAIN_DISAGREE                 ${num(comparison.domainDisagree)}`,
      `  ONE_SIDE_MISSING                ${num(comparison.oneSideMissing)}`,
      `  NOT_COMPARABLE                  ${num(comparison.notComparable)}`,
      '',
      'A shared hostname or domain is NOT a shared institution: regional education',
      'portals and generic hosts are used by many unrelated bodies. A structurally',
      'valid value is NOT a verified official website: nothing here was fetched.',
      '',
    ];
    process.stdout.write(lines.join('\n'));
    return 0;
  });
}

// ---------------------------------------------------------------------------
// website conflicts
// ---------------------------------------------------------------------------

function conflictLine(
  comparison: WebsiteComparison,
  name: string | null,
  erasmusCode: string | null,
): string {
  return (
    `${pad(erasmusCode ?? '-', 16)}${pad(comparison.eche.registrableDomain ?? '-', 28)}` +
    `${pad(comparison.fr.registrableDomain ?? '-', 28)}${name ?? '(not an ingested organisation)'}`
  );
}

export async function runWebsiteConflicts(args: { limit?: number | undefined }): Promise<number> {
  return withPool('readonly', async (pool) => {
    const echeSha = await latestArtifactSha(pool, 'ECHE_PUBLISHED');
    const frSha = await latestArtifactSha(pool, 'FR_ESR');
    if (echeSha === null || frSha === null) {
      process.stdout.write(
        '\nBoth an ECHE and a French register artifact must be ingested before\n' +
          'disagreements can be derived.\n\n',
      );
      return 0;
    }

    const { rows } = await pool.query<ClaimRow>(
      `SELECT ${CLAIM_COLUMNS}
         FROM website_claims
        WHERE (source_kind = 'ECHE_PUBLISHED' AND source_artifact_sha256 = $1)
           OR (source_kind = 'FR_ESR'         AND source_artifact_sha256 = $2)`,
      [echeSha, frSha],
    );
    const comparisons = compareClaimSets(rows.map(toClaimView));
    const disagreements = comparisons.filter((c) => c.verdict === 'DOMAIN_DISAGREE');
    const oneSided = comparisons.filter((c) => c.verdict === 'ONE_SIDE_MISSING');

    // Names are looked up for display only, and only for rows this database
    // happens to hold as organisations. A claim never depends on one existing.
    const keys = [...new Set(comparisons.map((c) => c.echeRowKey))];
    const { rows: orgRows } = await pool.query<{
      eche_row_key: string;
      legal_name: string;
      erasmus_code: string;
    }>(
      `SELECT eche_row_key, legal_name, erasmus_code
         FROM organisations WHERE eche_row_key = ANY($1::text[])`,
      [keys],
    );
    const orgs = new Map(orgRows.map((row) => [row.eche_row_key, row]));

    const limit = args.limit ?? disagreements.length;
    const lines = [
      '',
      'ECHE <-> FR REGISTER WEBSITE DISAGREEMENTS',
      '='.repeat(100),
      `ECHE artifact : ${echeSha}`,
      `FR  artifact  : ${frSha}`,
      '',
      `claim pairs compared : ${comparisons.length}`,
      `DOMAIN_DISAGREE      : ${disagreements.length}`,
      `ONE_SIDE_MISSING     : ${oneSided.length}`,
      '',
      `${pad('ERASMUS CODE', 16)}${pad('ECHE DOMAIN', 28)}${pad('FR DOMAIN', 28)}NAME`,
      '-'.repeat(100),
    ];
    for (const comparison of disagreements.slice(0, limit)) {
      const org = orgs.get(comparison.echeRowKey);
      lines.push(conflictLine(comparison, org?.legal_name ?? null, org?.erasmus_code ?? null));
    }
    if (disagreements.length > limit) {
      lines.push(`... and ${disagreements.length - limit} more (raise --limit to see them).`);
    }
    lines.push(
      '',
      'BOTH SOURCES ARE OFFICIAL AND NEITHER IS PREFERRED. A disagreement is an',
      'output of this phase, not a defect to repair: no value was overwritten, and',
      'no winner was chosen.',
      '',
    );
    process.stdout.write(lines.join('\n'));
    return 0;
  });
}

// ---------------------------------------------------------------------------
// website show
// ---------------------------------------------------------------------------

function describeClaim(claim: WebsiteClaimView, reason: string | null, sha: string): string[] {
  return [
    `  source          : ${claim.sourceKind}`,
    `  source row key  : ${claim.sourceRowKey}`,
    `  raw value       : ${claim.rawValue === null ? '(none published)' : JSON.stringify(claim.rawValue)}`,
    `  status          : ${claim.structuralStatus}${reason === null ? '' : ` (${reason})`}`,
    `  normalised url  : ${claim.normalisedUrl ?? '-'}`,
    `  hostname        : ${claim.hostname ?? '-'}`,
    `  registrable dom : ${claim.registrableDomain ?? '-'}`,
    `  artifact sha256 : ${sha}`,
  ];
}

export async function runWebsiteShow(identifier: string): Promise<number> {
  return withPool('readonly', async (pool) => {
    const normalisedCode = normaliseErasmusCode(identifier);

    // An Erasmus code is NOT unique in ECHE and an eche_row_key is
    // code + "|" + PIC, so a code may legitimately select more than one row.
    // All matches are shown; none is chosen.
    const { rows } = await pool.query<ClaimRow & { erasmus_code: string | null }>(
      `SELECT ${CLAIM_COLUMNS},
              split_part(eche_row_key, '|', 1) AS erasmus_code
         FROM website_claims
        WHERE split_part(eche_row_key, '|', 1) = $1
        ORDER BY eche_row_key, source_kind, observed_at`,
      [normalisedCode],
    );

    if (rows.length === 0) {
      log.error(`No website claims stored for Erasmus code: ${normalisedCode}`);
      return 1;
    }

    const byRow = new Map<string, ClaimRow[]>();
    for (const row of rows) {
      const bucket = byRow.get(row.eche_row_key);
      if (bucket === undefined) byRow.set(row.eche_row_key, [row]);
      else bucket.push(row);
    }

    const lines: string[] = ['', `WEBSITE CLAIMS FOR ${normalisedCode}`, '='.repeat(78)];

    for (const [rowKey, claimRows] of byRow) {
      const { rows: orgRows } = await pool.query<{ legal_name: string; country_code: string }>(
        'SELECT legal_name, country_code FROM organisations WHERE eche_row_key = $1',
        [rowKey],
      );
      const org = orgRows[0];
      lines.push(
        '',
        `ECHE source row : ${rowKey}`,
        `organisation    : ${org ? `${org.legal_name} (${org.country_code})` : '(not ingested as an organisation in this database)'}`,
      );
      for (const row of claimRows) {
        lines.push(
          '',
          ...describeClaim(toClaimView(row), row.rejection_reason, row.source_artifact_sha256),
        );
      }

      const views = claimRows.map(toClaimView);
      const comparisons = compareClaimSets(views);
      if (comparisons.length === 0) {
        lines.push(
          '',
          '  derived verdict : (none - only one source has a claim about this row,',
          '                     so there is no pair to compare)',
        );
      } else {
        for (const comparison of comparisons) {
          lines.push(
            '',
            `  derived verdict : ${comparison.verdict}` +
              (comparison.hostnamesEqual ? ' (hostnames also match)' : ''),
          );
        }
      }
    }

    lines.push(
      '',
      'These are SOURCE CLAIMS. Neither source is preferred, no canonical website is',
      'stored, and the derived verdict above was computed just now from the claim',
      'rows rather than read from a stored conclusion.',
      '',
    );
    process.stdout.write(lines.join('\n'));
    return 0;
  });
}
